/**
 * Экспорт моделей в формат USDZ для AR Quick Look (iOS).
 *
 * Без атрибута ios-src <model-viewer> конвертирует модель в USDZ прямо на устройстве
 * при каждом запуске AR. Чтобы ускорить запуск и передавать в Quick Look заранее
 * проверенный файл, для каждого товара и каждого цвета корпуса создаётся статический
 * файл ../usdz/<id>-<n>.usdz, который подключается через атрибут ios-src.
 *
 * Запуск: cd tools && npm run usdz
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'usdz');
mkdirSync(OUT, { recursive: true });

const { products } = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const loader = new GLTFLoader();
const exporter = new USDZExporter();

for (const p of products) {
  const buf = readFileSync(path.join(ROOT, 'models', `${p.id}.glb`));
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const colors = p.colors?.length ? p.colors : [null];

  for (const [i, color] of colors.entries()) {
    const gltf = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
    if (color) {
      // Цвет задаётся в sRGB, three.js сам переводит его в линейное пространство.
      gltf.scene.traverse((o) => {
        if (o.isMesh && o.material.name === 'body') o.material.color.set(color.hex);
      });
    }
    const usdz = await exporter.parseAsync(gltf.scene, { quickLookCompatible: true });
    const file = `${p.id}-${i}.usdz`;
    writeFileSync(path.join(OUT, file), Buffer.from(usdz));
    console.log(file.padEnd(30), `${(usdz.byteLength / 1024).toFixed(0)} КБ`, color ? color.name : '');
  }
}
