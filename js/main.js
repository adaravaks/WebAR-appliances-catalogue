/**
 * Точка входа приложения: маршрутизация по hash-адресам и отрисовка экранов.
 *   #/                 — каталог
 *   #/product/<id>     — карточка товара с 3D-просмотром и AR
 *   #/favorites        — избранное
 *   #/help             — инструкция по AR
 */
import {
  loadCatalog, queryProducts, getProduct, getCategory, checkFit,
  getFavorites, toggleFavorite, formatPrice, formatDims,
} from './store.js';
import { createViewer, setBodyColor, toggleDimensions, renderQr, isMobile } from './viewer.js';

const app = document.getElementById('app');
const state = { category: 'all', query: '', sort: 'popular' };
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/* ---------------------------- Маршрутизатор ---------------------------- */

const routes = [
  [/^#\/product\/([\w-]+)$/, (id) => renderProduct(id)],
  [/^#\/favorites$/, () => renderCatalog({ favorites: true })],
  [/^#\/help$/, () => renderHelp()],
  [/.*/, () => renderCatalog()],
];

function router() {
  const hash = location.hash || '#/';
  for (const [pattern, view] of routes) {
    const match = hash.match(pattern);
    if (match) {
      view(...match.slice(1));
      break;
    }
  }
  document.querySelectorAll('.topnav a').forEach((a) =>
    a.classList.toggle('active', a.getAttribute('href') === hash));
  window.scrollTo(0, 0);
}

/* ------------------------------ Каталог ------------------------------- */

function renderCatalog({ favorites = false } = {}) {
  const { categories } = window.catalog;
  const ids = favorites ? getFavorites() : undefined;
  document.title = favorites ? 'Избранное — AR-Техника' : 'AR-Техника — WebAR-каталог бытовой техники';

  app.innerHTML = `
    ${favorites ? '<h1 class="page-title">Избранное</h1>' : `
    <section class="hero">
      <div class="hero-text">
        <h1>Примерьте технику у себя дома</h1>
        <p>Откройте карточку товара на смартфоне и нажмите «Посмотреть у себя в комнате» — модель
        в натуральную величину появится на полу через камеру. Без установки приложений.</p>
      </div>
      <div class="hero-qr desktop-only">
        <div id="hero-qr" class="qr"></div>
        <p>Наведите камеру смартфона,<br>чтобы открыть каталог</p>
      </div>
    </section>`}
    <section class="toolbar" aria-label="Фильтры">
      <div class="chips" role="tablist">
        ${[{ id: 'all', title: 'Все' }, ...categories].map((c) => `
          <button class="chip ${state.category === c.id ? 'active' : ''}" data-category="${c.id}" role="tab">${esc(c.title)}</button>`).join('')}
      </div>
      <div class="toolbar-row">
        <input type="search" id="search" placeholder="Поиск по названию или модели" value="${esc(state.query)}" aria-label="Поиск">
        <select id="sort" aria-label="Сортировка">
          <option value="popular">По популярности</option>
          <option value="price-asc">Сначала дешевле</option>
          <option value="price-desc">Сначала дороже</option>
          <option value="size-asc">Сначала компактные</option>
        </select>
      </div>
    </section>
    <section class="grid" id="grid" aria-live="polite"></section>
  `;
  app.querySelector('#sort').value = state.sort;
  if (!favorites) renderQr(app.querySelector('#hero-qr'), location.href.split('#')[0]);

  const update = () => {
    const list = queryProducts({ ...state, ids });
    app.querySelector('#grid').innerHTML = list.length ? list.map(cardHtml).join('') :
      `<p class="empty">${favorites ? 'Вы ещё ничего не добавили в избранное.' : 'Ничего не найдено. Попробуйте изменить запрос.'}</p>`;
  };
  app.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    state.category = chip.dataset.category;
    app.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    update();
  }));
  app.querySelector('#search').addEventListener('input', (e) => { state.query = e.target.value; update(); });
  app.querySelector('#sort').addEventListener('change', (e) => { state.sort = e.target.value; update(); });
  app.querySelector('#grid').addEventListener('click', onFavoriteClick);
  update();
}

function cardHtml(p) {
  const fav = getFavorites().includes(p.id);
  return `
    <article class="card">
      <a href="#/product/${p.id}" class="card-link">
        <div class="card-image"><img src="posters/${p.id}.webp" alt="" loading="lazy" width="400" height="400"></div>
        <div class="card-body">
          <span class="card-category">${esc(getCategory(p.category).title)}</span>
          <h2 class="card-title">${esc(p.title)}</h2>
          <span class="card-model">${esc(p.model)}</span>
          <span class="card-dims">${formatDims(p.dimensions)}</span>
          <span class="card-price">${formatPrice(p.price)}</span>
        </div>
      </a>
      <span class="ar-tag" title="Доступен просмотр в AR">AR</span>
      <button class="fav ${fav ? 'active' : ''}" data-fav="${p.id}" aria-label="В избранное" aria-pressed="${fav}">♥</button>
    </article>`;
}

function onFavoriteClick(e) {
  const btn = e.target.closest('[data-fav]');
  if (!btn) return;
  e.preventDefault();
  const active = toggleFavorite(btn.dataset.fav);
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', active);
  if (location.hash === '#/favorites' && !active) router();
}

/* --------------------------- Карточка товара -------------------------- */

function renderProduct(id) {
  const p = getProduct(id);
  if (!p) {
    app.innerHTML = '<p class="empty">Товар не найден. <a href="#/">Вернуться в каталог</a></p>';
    return;
  }
  document.title = `${p.title} ${p.model} — AR-Техника`;
  const fav = getFavorites().includes(p.id);

  app.innerHTML = `
    <nav class="crumbs"><a href="#/">Каталог</a> / <span>${esc(getCategory(p.category).title)}</span></nav>
    <div class="product">
      <div class="product-stage" id="stage">
        <div class="stage-tools">
          <label class="switch"><input type="checkbox" id="dims-toggle"> Размеры</label>
        </div>
        <div class="ar-unsupported" id="ar-desktop" hidden>
          <div id="product-qr" class="qr"></div>
          <p><b>AR доступен на смартфоне.</b><br>Отсканируйте QR-код камерой телефона, чтобы открыть этот товар.</p>
        </div>
      </div>
      <div class="product-info">
        <h1>${esc(p.title)} <span class="muted">${esc(p.model)}</span></h1>
        <p class="price">${formatPrice(p.price)}</p>
        <p>${esc(p.description)}</p>

        ${p.colors?.length > 1 ? `
        <h2 class="h3">Цвет: <span id="color-name">${esc(p.colors[0].name)}</span></h2>
        <div class="swatches">
          ${p.colors.map((c, i) => `<button class="swatch ${i === 0 ? 'active' : ''}" style="--c:${c.hex}" data-index="${i}" data-name="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`).join('')}
        </div>` : ''}

        <p class="note" id="ar-mobile-note" hidden>Этот браузер не поддерживает AR. Откройте страницу в Safari (iPhone) или Chrome (Android).</p>
        <div class="actions">
          <button class="btn btn-primary" id="ar-launch" hidden>Открыть на смартфоне</button>
          <button class="btn fav-btn ${fav ? 'active' : ''}" data-fav="${p.id}" aria-pressed="${fav}">♥ В избранное</button>
        </div>

        <h2 class="h3">Характеристики</h2>
        <table class="specs">
          <tr><th>Габариты (Ш × В × Г)</th><td>${formatDims(p.dimensions)}</td></tr>
          ${Object.entries(p.specs).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
        </table>

        <details class="fit" ${p.category === 'tv-audio' ? '' : 'open'}>
          <summary>Поместится ли в нишу?</summary>
          <form id="fit-form" class="fit-form">
            <label>Ширина, см<input type="number" name="w" min="1" step="0.5" required></label>
            <label>Высота, см<input type="number" name="h" min="1" step="0.5" required></label>
            <label>Глубина, см<input type="number" name="d" min="1" step="0.5" required></label>
            <button class="btn">Проверить</button>
          </form>
          <div id="fit-result" aria-live="polite"></div>
        </details>
      </div>
    </div>
  `;

  const viewer = createViewer(p);
  const stage = app.querySelector('#stage');
  stage.prepend(viewer);

  // Цвет корпуса: меняется материал модели и USDZ-файл для Quick Look — в AR попадёт выбранный цвет.
  if (p.colors?.length) setBodyColor(viewer, p, 0);
  app.querySelectorAll('.swatch').forEach((sw) => sw.addEventListener('click', () => {
    app.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === sw));
    app.querySelector('#color-name').textContent = sw.dataset.name;
    setBodyColor(viewer, p, Number(sw.dataset.index));
  }));

  app.querySelector('#dims-toggle').addEventListener('change', (e) => toggleDimensions(viewer, e.target.checked));
  app.querySelector('.actions').addEventListener('click', onFavoriteClick);

  // AR запускается кнопкой поверх модели (слот ar-button, виден только на устройствах с AR).
  // Если AR недоступен — показываем кнопку и QR-код для перехода на смартфон.
  const qrButton = app.querySelector('#ar-launch');
  const showQr = () => {
    app.querySelector('#ar-desktop').hidden = false;
    renderQr(app.querySelector('#product-qr'), location.href);
  };
  viewer.addEventListener('load', () => {
    if (viewer.canActivateAR) return;
    if (isMobile()) {
      app.querySelector('#ar-mobile-note').hidden = false;
    } else {
      qrButton.hidden = false;
      showQr();
    }
  });
  qrButton.addEventListener('click', () => {
    showQr();
    app.querySelector('#ar-desktop').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  viewer.addEventListener('ar-status', (e) => {
    if (e.detail.status === 'failed') alert('Не удалось запустить AR на этом устройстве.');
  });

  // Проверка «поместится ли в нишу».
  app.querySelector('#fit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const niche = ['w', 'h', 'd'].map((k) => Math.round(parseFloat(String(f.get(k)).replace(',', '.')) * 10));
    const { fits, rows } = checkFit(p, niche);
    app.querySelector('#fit-result').innerHTML = `
      <p class="fit-verdict ${fits ? 'ok' : 'bad'}">${fits ? '✓ Поместится' : '✗ Не поместится'}</p>
      <table class="specs small">
        <tr><th></th><th>Нужно*</th><th>Есть</th></tr>
        ${rows.map((r) => `<tr class="${r.ok ? '' : 'bad'}"><th>${r.axis}</th><td>${r.need / 10} см</td><td>${r.have / 10} см</td></tr>`).join('')}
      </table>
      <p class="muted small">* габарит изделия плюс рекомендуемый зазор для вентиляции и подключения.</p>`;
  });
}

/* ------------------------------ Справка ------------------------------- */

function renderHelp() {
  document.title = 'Как работает AR — AR-Техника';
  app.innerHTML = `
    <article class="help">
      <h1 class="page-title">Как посмотреть технику в дополненной реальности</h1>
      <ol class="steps">
        <li><b>Откройте каталог на смартфоне</b> — в Safari на iPhone/iPad (iOS 12+) или в Chrome на Android с поддержкой ARCore.</li>
        <li><b>Выберите товар</b> и, при желании, цвет корпуса.</li>
        <li><b>Нажмите «Посмотреть у себя в комнате».</b> Разрешите доступ к камере, если браузер спросит.</li>
        <li><b>Медленно поводите телефоном</b>, чтобы устройство распознало пол.</li>
        <li><b>Коснитесь экрана</b> в нужном месте — модель встанет в натуральную величину. Её можно передвигать и поворачивать пальцем.</li>
      </ol>
      <h2 class="h3">Почему размер модели нельзя изменить?</h2>
      <p>Каталог показывает технику в масштабе 1:1, чтобы вы могли оценить, впишется ли она в интерьер.
      Масштабирование в AR намеренно отключено.</p>
      <h2 class="h3">Нет кнопки AR?</h2>
      <p>На компьютере AR недоступен: отсканируйте QR-код на странице товара камерой смартфона.
      На смартфоне без поддержки AR модель можно вращать и рассматривать в 3D.</p>
    </article>`;
}

/* ------------------------------- Запуск ------------------------------- */

function updateFavCount() {
  const n = getFavorites().length;
  const badge = document.getElementById('fav-count');
  badge.hidden = n === 0;
  badge.textContent = n;
}

async function init() {
  try {
    window.catalog = await loadCatalog();
  } catch (err) {
    app.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  window.addEventListener('hashchange', router);
  window.addEventListener('favorites-change', updateFavCount);
  updateFavCount();
  router();
}

init();
