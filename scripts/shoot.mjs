#!/usr/bin/env node
/**
 * Headless screenshot harness.
 *
 *   node scripts/shoot.mjs --scenarios gameplay,overview --out shots --prefix v1-
 *   node scripts/shoot.mjs --list
 *   node scripts/shoot.mjs --eval "__game.reset(); __game.advance(1)" --name custom
 *
 * Starts a Vite dev server on a free port (or uses --url), opens the game in
 * headless Chromium with ?harness (manual time stepping), runs each named
 * scenario from src/debug/scenarios.ts and saves a PNG per scenario.
 *
 * Rendering is software (SwiftShader) in CI containers, so expect several
 * seconds per frame at 1080p; scenarios only render the frames they need.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const width = Number(args.w ?? 1600);
const height = Number(args.h ?? 900);
const outDir = resolve(root, args.out ?? 'shots');
const prefix = args.prefix ?? '';
const timeout = Number(args.timeout ?? 600) * 1000;
const query = args.query ? `&${args.query}` : '';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

mkdirSync(outDir, { recursive: true });

let server = null;
let baseUrl = args.url;
if (!baseUrl) {
  server = await createServer({
    root,
    logLevel: 'error',
    server: { port: 0, strictPort: false, host: '127.0.0.1', hmr: false },
  });
  await server.listen();
  const addr = server.httpServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-gpu-sandbox',
    '--no-sandbox',
  ],
});

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.setDefaultTimeout(timeout);
const consoleLines = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || args.verbose) consoleLines.push(`[console.${t}] ${m.text()}`);
});
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

const t0 = Date.now();
let exitCode = 0;
try {
  await page.goto(`${baseUrl}/?harness=1${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout });
  const bootMs = Date.now() - t0;
  const gl = await page.evaluate(() => {
    const r = window.__game.engine.renderer;
    const ctx = r.getContext();
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext,
      renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    };
  });
  console.log(`booted in ${bootMs} ms — ${gl.webgl2 ? 'WebGL2' : 'WebGL1'} on ${gl.renderer}`);

  if (args.list) {
    const names = await page.evaluate(() => [...window.__game.scenarios.keys()]);
    console.log('scenarios:', names.join(', '));
  } else {
    const jobs = [];
    if (args.eval) jobs.push({ name: args.name ?? 'custom', code: args.eval });
    if (args.scenarios || !args.eval) {
      const list = String(args.scenarios ?? 'gameplay,overview').split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of list) jobs.push({ name, scenario: name });
    }
    for (const job of jobs) {
      const s0 = Date.now();
      if (job.scenario) {
        await page.evaluate((n) => window.__game.runScenario(n), job.scenario);
      } else {
        await page.evaluate((code) => (0, eval)(code), job.code);
      }
      const file = resolve(outDir, `${prefix}${job.name}.png`);
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => {
        const r = window.__game.engine.renderer.info.render;
        return { calls: r.calls, triangles: r.triangles, logs: window.__game.logs.slice(-12), errors: window.__game.errors.slice(-5) };
      });
      console.log(`✔ ${job.name} -> ${file} (${Date.now() - s0} ms, ${info.calls} draw calls, ${info.triangles} tris)`);
      if (info.logs.length) console.log('   log:', info.logs.join(' | '));
      if (info.errors.length) { console.log('   errors:', info.errors.join(' | ')); exitCode = 1; }
    }
  }
} catch (err) {
  exitCode = 1;
  console.error('shoot failed:', err?.message ?? err);
  try {
    await page.screenshot({ path: resolve(outDir, `${prefix}FAILED.png`) });
  } catch { /* ignore */ }
} finally {
  if (consoleLines.length) {
    console.log('--- browser console (errors/warnings) ---');
    for (const l of consoleLines.slice(-40)) console.log(l);
  }
  await browser.close();
  await server?.close();
}
process.exit(exitCode);
