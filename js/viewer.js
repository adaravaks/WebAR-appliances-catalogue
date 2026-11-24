/**
 * Работа с компонентом <model-viewer>: создание 3D-просмотрщика с поддержкой AR,
 * смена цвета корпуса, отображение габаритных размеров на модели.
 *
 * Режимы AR:
 *   quick-look   — iOS/iPadOS (Safari): модель автоматически конвертируется в USDZ
 *                  и открывается в AR Quick Look (ARKit);
 *   webxr        — Android Chrome с поддержкой WebXR Device API;
 *   scene-viewer — Android, если WebXR недоступен (Google Scene Viewer, ARCore).
 */

/** Создаёт элемент <model-viewer> для страницы товара. */
export function createViewer(product) {
  const viewer = document.createElement('model-viewer');
  Object.entries({
    src: `models/${product.id}.glb`,
    poster: `posters/${product.id}.webp`,
    alt: `3D-модель: ${product.title} ${product.model}`,
    ar: '',
    'ar-modes': 'webxr scene-viewer quick-look',
    'ar-scale': 'fixed',            // реальный размер: пользователь не может «растянуть» модель
    'ar-placement': 'floor',
    'camera-controls': '',
    'touch-action': 'pan-y',
    'auto-rotate': '',
    'auto-rotate-delay': '1500',
    'rotation-per-second': '20deg',
    'interaction-prompt': 'auto',
    'shadow-intensity': '1',
    'shadow-softness': '0.8',
    exposure: '1',
    'environment-image': 'neutral',
    'tone-mapping': 'neutral',
    'camera-orbit': '25deg 75deg auto',
    'min-camera-orbit': 'auto 20deg auto',
    'max-camera-orbit': 'auto 95deg auto',
  }).forEach(([k, v]) => viewer.setAttribute(k, v));

  viewer.innerHTML = `
    <button slot="ar-button" class="btn btn-ar">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.5 3.6L12 11.5 5.5 7.9 12 4.3ZM5 9.6l6 3.3v6.6l-6-3.3V9.6Zm8 9.9v-6.6l6-3.3v6.6l-6 3.3Z"/></svg>
      Посмотреть у себя в комнате
    </button>
    <div slot="progress-bar" class="progress"><div class="progress-fill"></div></div>
    <svg class="dims-lines" aria-hidden="true">
      <line data-line="w"/><line data-line="h"/><line data-line="d"/>
    </svg>
    ${['w', 'h', 'd'].map((k) => `<div class="dim-label" slot="hotspot-dim-${k}" data-position="0 0 0"></div>`).join('')}
    ${['A', 'B', 'C', 'D'].map((k) => `<div class="dim-dot" slot="hotspot-dot-${k}" data-position="0 0 0"></div>`).join('')}
  `;

  viewer.addEventListener('progress', (e) => {
    viewer.querySelector('.progress-fill').style.width = `${e.detail.totalProgress * 100}%`;
    viewer.querySelector('.progress').classList.toggle('done', e.detail.totalProgress === 1);
  });
  viewer.addEventListener('load', () => setupDimensions(viewer, product));
  return viewer;
}

/** Меняет цвет материала корпуса (материал с именем «body» в glTF-модели). */
export function setBodyColor(viewer, hex) {
  const apply = () => {
    const body = viewer.model?.materials.find((m) => m.name === 'body');
    body?.pbrMetallicRoughness.setBaseColorFactor(hex);
  };
  viewer.loaded ? apply() : viewer.addEventListener('load', apply, { once: true });
}

/** Показывает или скрывает габаритные размеры на модели. */
export function toggleDimensions(viewer, visible) {
  viewer.classList.toggle('show-dims', visible);
  if (visible) viewer.autoRotate = false;
}

/**
 * Размещает метки размеров по рёбрам габаритного контейнера (bounding box) модели.
 * Точки: A — передний нижний левый угол, B — передний нижний правый,
 *        C — передний верхний правый, D — задний нижний правый.
 * Линии AB — ширина, BC — высота, BD — глубина.
 */
function setupDimensions(viewer, product) {
  const c = viewer.getBoundingBoxCenter();
  const s = viewer.getDimensions();
  const x0 = c.x - s.x / 2, x1 = c.x + s.x / 2;
  const y0 = c.y - s.y / 2, y1 = c.y + s.y / 2;
  const z0 = c.z - s.z / 2, z1 = c.z + s.z / 2;
  const points = { A: [x0, y0, z1], B: [x1, y0, z1], C: [x1, y1, z1], D: [x1, y0, z0] };
  const labels = {
    w: [[c.x, y0, z1], product.dimensions[0]],
    h: [[x1, c.y, z1], product.dimensions[1]],
    d: [[x1, y0, c.z], product.dimensions[2]],
  };
  const pos = (p) => p.map((v) => `${v}m`).join(' ');
  for (const [k, p] of Object.entries(points)) viewer.updateHotspot({ name: `hotspot-dot-${k}`, position: pos(p) });
  for (const [k, [p, mm]] of Object.entries(labels)) {
    viewer.updateHotspot({ name: `hotspot-dim-${k}`, position: pos(p) });
    viewer.querySelector(`[slot="hotspot-dim-${k}"]`).textContent = `${mm / 10} см`;
  }

  const lines = { w: ['A', 'B'], h: ['B', 'C'], d: ['B', 'D'] };
  const draw = () => {
    if (!viewer.classList.contains('show-dims')) return;
    for (const [k, [from, to]] of Object.entries(lines)) {
      const a = viewer.queryHotspot(`hotspot-dot-${from}`);
      const b = viewer.queryHotspot(`hotspot-dot-${to}`);
      const line = viewer.querySelector(`[data-line="${k}"]`);
      if (!a || !b) continue;
      line.setAttribute('x1', a.canvasPosition.x);
      line.setAttribute('y1', a.canvasPosition.y);
      line.setAttribute('x2', b.canvasPosition.x);
      line.setAttribute('y2', b.canvasPosition.y);
    }
  };
  viewer.addEventListener('camera-change', draw);
  new MutationObserver(() => requestAnimationFrame(draw)).observe(viewer, { attributes: true, attributeFilter: ['class'] });
  draw();
}

/** Рисует QR-код со ссылкой на страницу (для перехода с компьютера на смартфон). */
export function renderQr(container, url) {
  if (!window.qrcode) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** Грубая проверка, что страница открыта на смартфоне или планшете. */
export function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
