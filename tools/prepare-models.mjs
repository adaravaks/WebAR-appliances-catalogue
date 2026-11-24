/**
 * Подготовка 3D-моделей для WebAR-каталога.
 *
 * Исходные модели (Kenney Furniture Kit, лицензия CC0) имеют условный
 * «игрушечный» масштаб и неосвещаемые (unlit) материалы. Скрипт:
 *   1) приводит каждую модель к реальным габаритам изделия (в метрах),
 *      чтобы в дополненной реальности техника отображалась в натуральную величину;
 *   2) заменяет unlit-материалы на физически корректные PBR-материалы
 *      (metallic/roughness), чтобы модель реагировала на освещение комнаты;
 *   3) присваивает материалам понятные имена (body — корпус и т. д.),
 *      по которым каталог меняет цвет корпуса;
 *   4) ставит опорную точку модели в центр нижней грани (модель «стоит» на полу);
 *   5) удаляет неиспользуемые данные и сохраняет результат в ../models/*.glb.
 *
 * Запуск: cd tools && npm install && npm run models
 */
import { NodeIO, getBounds } from '@gltf-transform/core';
import { prune, dedup, center } from '@gltf-transform/functions';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'source-models');
const OUT = path.join(here, '..', 'models');

// Габариты изделий берутся из каталога, чтобы они совпадали с карточкой товара.
const catalog = JSON.parse(readFileSync(path.join(here, '..', 'data', 'catalog.json'), 'utf8'));

/** Параметры PBR для каждого исходного материала: новое имя и свойства. */
const MATERIALS = {
  metalLight:  { name: 'body',    metallic: 0.15, roughness: 0.32 },             // окрашенный металл корпуса
  metal:       { name: 'steel',   metallic: 0.85, roughness: 0.28, color: [0.52, 0.53, 0.55] }, // нержавеющая сталь
  metalMedium: { name: 'graphite',metallic: 0.3,  roughness: 0.45, color: [0.07, 0.075, 0.08] }, // графитовый пластик
  metalDark:   { name: 'dark',    metallic: 0.0,  roughness: 0.25, color: [0.015, 0.017, 0.02] }, // экраны, панели
  glass:       { name: 'glass',   metallic: 0.0,  roughness: 0.05, color: [0.18, 0.22, 0.25], alpha: 0.55 },
  carpetWhite: { name: 'plastic', metallic: 0.0,  roughness: 0.5 },
  wood:        { name: 'wood',    metallic: 0.0,  roughness: 0.7 },
  woodDark:    { name: 'woodDark',metallic: 0.0,  roughness: 0.7 },
  _defaultMat: { name: 'rubber',  metallic: 0.0,  roughness: 0.85, color: [0.2, 0.2, 0.2] },
};

const io = new NodeIO();

for (const item of catalog.products) {
  const doc = await io.read(path.join(SRC, `${item.source}.glb`));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];

  // 1. Материалы: unlit-расширение при чтении отбрасывается, задаём PBR-параметры.
  //    Цвета Kenney заданы в sRGB (для unlit-отображения), а glTF ожидает линейные
  //    значения, поэтому они переводятся в линейное пространство.
  for (const mat of root.listMaterials()) {
    const original = mat.getName();
    const cfg = MATERIALS[original];
    if (!cfg) continue;
    mat.setName(item.bodyMaterial === original ? 'body' : cfg.name);
    mat.setMetallicFactor(cfg.metallic).setRoughnessFactor(cfg.roughness);
    const [r, g, b, a] = mat.getBaseColorFactor();
    mat.setBaseColorFactor([...[r, g, b].map(srgbToLinear), a]);
    if (cfg.color) mat.setBaseColorFactor([...cfg.color, 1]);
    if (item.materialColors?.[original]) mat.setBaseColorFactor(hexToLinear(item.materialColors[original]));
    if (cfg.alpha) {
      const c = mat.getBaseColorFactor();
      mat.setBaseColorFactor([c[0], c[1], c[2], cfg.alpha]).setAlphaMode('BLEND');
    }
  }
  // Корпус по умолчанию окрашивается в первый цвет из каталога.
  const body = root.listMaterials().find((m) => m.getName() === 'body');
  if (body && item.colors?.length) body.setBaseColorFactor(hexToLinear(item.colors[0].hex));

  // 2. Масштаб: оборачиваем сцену в узел с коэффициентами по осям X/Y/Z,
  //    подобранными так, чтобы габариты совпали с реальными (Ш × В × Г).
  const b0 = getBounds(scene);
  const size0 = b0.max.map((v, i) => v - b0.min[i]);
  const [w, h, d] = item.dimensions.map((mm) => mm / 1000);
  const scale = [w / size0[0], h / size0[1], d / size0[2]];
  const wrapper = doc.createNode(item.id).setScale(scale);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);

  // 3. Опорная точка — центр нижней грани.
  await doc.transform(center({ pivot: 'below' }), dedup(), prune());

  const b = getBounds(scene);
  const size = b.max.map((v, i) => Math.round((v - b.min[i]) * 1000));
  await io.write(path.join(OUT, `${item.id}.glb`), doc);
  console.log(`${item.id.padEnd(22)} ${size.join(' × ')} мм  (масштаб ${scale.map((s) => s.toFixed(2)).join(' / ')})`);
}

/** Перевод компоненты цвета из sRGB в линейное пространство. */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB hex → линейные коэффициенты цвета glTF (RGBA). */
function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => srgbToLinear(c / 255)).concat(1);
}
