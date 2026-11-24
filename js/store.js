/**
 * Модель данных каталога: загрузка, фильтрация, сортировка, избранное.
 */

const FAVORITES_KEY = 'ar-tech:favorites';

let catalog = null;

/** Загружает каталог из JSON-файла (один раз). */
export async function loadCatalog() {
  if (catalog) return catalog;
  const response = await fetch('data/catalog.json');
  if (!response.ok) throw new Error(`Не удалось загрузить каталог: ${response.status}`);
  catalog = await response.json();
  return catalog;
}

export const getCategory = (id) => catalog.categories.find((c) => c.id === id);
export const getProduct = (id) => catalog.products.find((p) => p.id === id);

/**
 * Возвращает список товаров с учётом фильтра категории, поискового запроса и сортировки.
 * @param {{category?: string, query?: string, sort?: string, ids?: string[]}} options
 */
export function queryProducts({ category = 'all', query = '', sort = 'popular', ids } = {}) {
  const q = query.trim().toLowerCase();
  let list = catalog.products.filter((p) =>
    (!ids || ids.includes(p.id)) &&
    (category === 'all' || p.category === category) &&
    (!q || `${p.title} ${p.model} ${p.description}`.toLowerCase().includes(q)));

  const sorters = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'size-asc': (a, b) => volume(a) - volume(b),
  };
  if (sorters[sort]) list = [...list].sort(sorters[sort]);
  return list;
}

const volume = (p) => p.dimensions.reduce((a, b) => a * b, 1);

/**
 * Проверка, поместится ли изделие в нишу с учётом зазоров для вентиляции.
 * @param {object} product товар каталога
 * @param {number[]} niche размеры ниши [Ш, В, Г] в миллиметрах
 * @returns {{fits: boolean, rows: {axis: string, need: number, have: number, ok: boolean}[]}}
 */
export function checkFit(product, niche) {
  const clearance = getCategory(product.category).clearance;
  const axes = ['Ширина', 'Высота', 'Глубина'];
  const rows = axes.map((axis, i) => {
    const need = product.dimensions[i] + clearance[i];
    return { axis, need, have: niche[i], ok: niche[i] >= need };
  });
  return { fits: rows.every((r) => r.ok), rows };
}

/* ---------- Избранное (сохраняется в localStorage браузера) ---------- */

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) ?? [];
  } catch {
    return [];
  }
}

export function toggleFavorite(id) {
  const favorites = getFavorites();
  const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch { /* режим инкогнито — избранное работает до перезагрузки */ }
  window.dispatchEvent(new CustomEvent('favorites-change', { detail: next }));
  return next.includes(id);
}

/* ---------- Форматирование ---------- */

export const formatPrice = (rub) => `${rub.toLocaleString('ru-RU')} ₽`;
export const formatDims = ([w, h, d]) => `${w / 10} × ${h / 10} × ${d / 10} см`;
