/**
 * Генерация превью-изображений (постеров) для карточек каталога.
 * Каждая модель открывается в <model-viewer> в безголовом браузере Chromium,
 * кадр сохраняется в ../posters/<id>.webp. Постеры показываются в сетке каталога
 * вместо «живых» 3D-сцен — это экономит память и заряд батареи смартфона.
 *
 * Запуск: cd tools && npm run posters   (нужен установленный Playwright)
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

// Минимальный статический сервер для корня проекта.
const server = createServer(async (req, res) => {
  try {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const { products } = JSON.parse(await readFile(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
await page.goto(`${base}/index.html#/help`);

for (const p of products) {
  const dataUrl = await page.evaluate(async ({ id, color }) => {
    document.body.innerHTML = '';
    const mv = document.createElement('model-viewer');
    Object.assign(mv.style, { width: '800px', height: '800px', background: 'transparent' });
    mv.setAttribute('src', `models/${id}.glb`);
    mv.setAttribute('camera-orbit', '30deg 72deg auto');
    mv.setAttribute('shadow-intensity', '1');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('tone-mapping', 'neutral');
    mv.setAttribute('interaction-prompt', 'none');
    document.body.append(mv);
    await new Promise((r) => mv.addEventListener('load', r, { once: true }));
    if (color) mv.model.materials.find((m) => m.name === 'body')?.pbrMetallicRoughness.setBaseColorFactor(color);
    await new Promise((r) => setTimeout(r, 800));
    const blob = await mv.toBlob({ mimeType: 'image/webp', qualityArgument: 0.9, idealAspect: true });
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }, { id: p.id, color: p.colors?.[0]?.hex });
  await writeFile(path.join(ROOT, 'posters', `${p.id}.webp`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('постер:', p.id);
}

await browser.close();
server.close();
