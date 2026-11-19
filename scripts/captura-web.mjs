#!/usr/bin/env node
// Saca capturas de una web en MÓVIL y PC y lista los errores de la consola, para que la IA
// pueda VER lo que diseña y corregirlo. Lo usa la skill "verificar-web".
//
// Uso:  node /opt/cubaxnova-studio/scripts/captura-web.mjs <url-o-archivo.html> [--out carpeta] [--solo movil|pc]
// Ej.:  node .../captura-web.mjs proyectos/landing/index.html --out capturas/landing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Navegador propio de Studio (lo instala scripts/instalar-navegador.sh), dentro de su carpeta.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(ROOT, 'data', 'navegadores'))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, 'data', 'navegadores');
}
const { chromium } = await import('playwright-core');

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) { console.error('Uso: captura-web.mjs <url-o-archivo.html> [--out carpeta] [--solo movil|pc]'); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(opt('out', 'capturas'));
const solo = opt('solo', '');
const url = /^https?:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href;
if (/^https?:\/\//.test(target) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(target + '/')) {
  // Se permite cualquier web, pero se avisa: las capturas de sitios ajenos son solo para referencia.
  console.error('Aviso: capturando un sitio externo.');
}
fs.mkdirSync(outDir, { recursive: true });

const views = [
  { name: 'movil', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'pc', viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
].filter((v) => !solo || v.name === solo);

// Si hay un Chrome/Chromium ya instalado en el sistema (o STUDIO_CHROME), se usa ese y no hace falta descargar nada.
const systemChrome = [process.env.STUDIO_CHROME, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/snap/bin/chromium']
  .find((p) => p && fs.existsSync(p));
let browser;
try {
  const useOwn = fs.existsSync(path.join(ROOT, 'data', 'navegadores'));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(!useOwn && systemChrome ? { executablePath: systemChrome } : {}) });
} catch (e) {
  console.error('No pude abrir el navegador. Instálalo con: sudo bash /opt/cubaxnova-studio/scripts/instalar-navegador.sh');
  console.error(String(e.message).split('\n').slice(0, 6).join('\n'));
  process.exit(3);
}
const report = { url, capturas: [], errores: [], peticionesFallidas: [] };
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch, locale: 'es-ES' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.errores.push(`[${v.name}] ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', (e) => report.errores.push(`[${v.name}] ${e.message}`.slice(0, 300)));
  page.on('requestfailed', (r) => report.peticionesFallidas.push(`[${v.name}] ${r.url()} (${r.failure()?.errorText})`.slice(0, 300)));
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    report.errores.push(`[${v.name}] no cargó: ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(600);
  const file = path.join(outDir, `${v.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const overflow = await page.evaluate((w) => Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) > w + 1, v.viewport.width).catch(() => false);
  report.capturas.push({ vista: v.name, archivo: path.relative(process.cwd(), file), anchoDesbordado: overflow });
  await ctx.close();
}
await browser.close();
report.errores = [...new Set(report.errores)].slice(0, 30);
report.peticionesFallidas = [...new Set(report.peticionesFallidas)].slice(0, 30);
console.log(JSON.stringify(report, null, 2));
