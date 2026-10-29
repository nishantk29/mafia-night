// E2E (browser): the Host's screen opens at the top when the phase changes, and the action button gets out of the way while typing.
// Polish sweep 2026-10-28. Before: Deal roles / Start night 1 are pressed from the bottom of a long page, and the next screen
// (card key, night 1 script) opened scrolled down, past its heading. On phones the fixed Deal roles button also sat over the
// names field and its Add players button while the keyboard was up. Runs On this device mode (no server) with public/ from disk.
// Run: PW=/workspace/forge/pw/node_modules/playwright-core node test/e2e/host-top.e2e.mjs   (exit 1 on any failure)
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core';
const { chromium, webkit } = await import(`${PW}/index.mjs`);
const ROOT = fileURLToPath(new URL('../../public/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const DEVICES = [
  { name: 'iPhone SE (WebKit)', engine: 'webkit', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPhone SE (Chromium fallback)', engine: 'chromium', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Android (Chromium)', engine: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
const fails = []; const passes = [];
const check = (label, ok, info = '') => { (ok ? passes : fails).push(`${label}${info ? ` (${info})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, dev) {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.engine === 'chromium' ? dev.isMobile : undefined, hasTouch: dev.hasTouch, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    let p = join(ROOT, decodeURIComponent(url.pathname)); if (url.pathname === '/' || !existsSync(p)) p = join(ROOT, 'index.html');
    return route.fulfill({ status: 200, body: readFileSync(p), contentType: TYPES[extname(p)] || 'application/octet-stream' });
  });
  await page.goto('http://mafia.test/#/local'); await page.waitForSelector('[data-i="names"]'); await sleep(400);
  await page.evaluate(() => document.querySelector('[data-a="hhSkip"]')?.click()); await sleep(300);
  const tag = `${dev.name}`;
  // Typing: the dock is hidden while the names field has focus, and back after.
  await page.focus('[data-i="names"]'); await sleep(150);
  const dockWhileTyping = await page.evaluate(() => getComputedStyle(document.querySelector('.action-dock')).display);
  check(`${tag}: Deal roles button hidden while typing names`, dockWhileTyping === 'none', `display ${dockWhileTyping}`);
  await page.keyboard.type('Ana, Ben, Cal, Dee, Eve, Fay'); await page.evaluate(() => document.activeElement.blur()); await sleep(150);
  const dockAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.action-dock')).display);
  check(`${tag}: Deal roles button back after typing`, dockAfter !== 'none', `display ${dockAfter}`);
  await page.evaluate(() => document.querySelector('[data-a="addNames"]').click()); await sleep(300);
  // Setup carousel (item 8): Players -> Roles -> How to deal; the last step's dock button deals.
  for (let i = 0; i < 2; i++) { await page.evaluate(() => document.querySelector('[data-a="setupNext"]')?.click()); await sleep(350); }
  // Deal from the bottom of the page.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(200);
  const yBefore = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('[data-a="setupDeal2"],[data-a="deal"]').click()); await sleep(500);
  const y1 = await page.evaluate(() => window.scrollY);
  check(`${tag}: card key opens at the top after Deal roles`, yBefore > 0 && y1 === 0, `scrolled ${yBefore} -> ${y1}`);
  // Start night 1 from the bottom.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(200);
  const yB2 = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => [...document.querySelectorAll('.action-dock button')].find((x) => /Start night/i.test(x.textContent)).click()); await sleep(500);
  await sleep(300);
  const cue = await page.evaluate(() => { const c = document.querySelector('.cues .cue.is-current'); if (!c) return null; const r = c.getBoundingClientRect(); const dock = document.querySelector('.action-dock').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), dockTop: Math.round(dock.top) }; });
  // Night 1 centres the first line to read (followCue), so the check is that the line is on screen and clear of the button.
  check(`${tag}: night 1 opens on the first line to read after Start night 1`, yB2 > 0 && cue && cue.top >= 0 && cue.top < cue.dockTop, `from scrollY ${yB2}, cue ${JSON.stringify(cue)}`);
  // Within the night, picking keeps the Host's place (no jump on every tap).
  await page.evaluate(() => window.scrollTo(0, 120)); await sleep(150);
  await page.evaluate(() => document.querySelector('[data-a="pick"]')?.click()); await sleep(300);
  const y3 = await page.evaluate(() => window.scrollY);
  check(`${tag}: a pick during the night keeps the scroll position`, y3 > 0, `scrollY ${y3}`);
  check(`${tag}: no page errors`, errs.length === 0, errs.join('; '));
  await ctx.close();
}

for (const dev of DEVICES) {
  const type = dev.engine === 'webkit' ? webkit : chromium;
  let browser;
  try { browser = await type.launch(dev.engine === 'chromium' ? { executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {}); }
  catch (e) { console.log(`SKIP ${dev.name}: ${e.message.split('\n')[0]}`); continue; }
  try { await run(browser, dev); } catch (e) { fails.push(`${dev.name}: ${e.message.split('\n')[0]}`); }
  await browser.close();
}
for (const p of passes) console.log('ok   ' + p);
for (const f of fails) console.log('FAIL ' + f);
console.log(`${passes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
