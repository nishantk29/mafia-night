// E2E (browser): a player's hand opens at the top with the card face down, on small phones.
// Nishant 2026-10-28: "The player hands dont open to the card. People have to scroll up. Keep the card hidden just open to the top."
// Root cause: app.js paintScreen() put back the previous screen's scrollY after every render, so a screen that changed under
// the player (dealt, card entered, night/day flip) opened scrolled down. Runs the real room reducer in Node behind a mocked
// WebSocket (Playwright routeWebSocket), and serves public/ from disk. No network, no worker.
// Run: PW=/workspace/forge/pw/node_modules/playwright-core node test/e2e/hand-top.e2e.mjs   (exit 1 on any failure)
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core';
const { chromium, webkit } = await import(`${PW}/index.mjs`);
const ROOT = fileURLToPath(new URL('../../public/', import.meta.url));
const { newRoom, reduce, messagesFor } = await import(new URL('../../public/js/room.js', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const DEVICES = [
  { name: 'iPhone SE (WebKit)', engine: 'webkit', viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPhone SE (Chromium fallback)', engine: 'chromium', viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Android (Chromium)', engine: 'chromium', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kim', 'Lou', 'Max', 'Ned'];
const fails = []; const passes = [];
const check = (label, ok, info = '') => { (ok ? passes : fails).push(`${label}${info ? ` (${info})` : ''}`); };

async function scenario(browser, dev, mode) {
  const room = newRoom('HANDTP', 'hk');
  for (const n of NAMES) reduce(room, { anon: true }, { type: 'join', name: n });
  reduce(room, { host: true }, { type: 'setConfig', roles: ['mafia', 'mafia', 'mafia', 'doctor', 'cop', 'vigilante', ...Array(8).fill('villager')], mode, cardFlow: 'claim' });
  const me = room.players[0];
  const sockets = new Set();
  const push = () => { for (const ws of sockets) for (const m of messagesFor(room, { who: 'player', playerId: me.id })) ws.send(JSON.stringify(m)); };
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.engine === 'chromium' ? dev.isMobile : undefined, hasTouch: dev.hasTouch, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/room/')) return route.fulfill({ status: 200, body: '{}' , contentType: 'application/json' });
    let p = join(ROOT, decodeURIComponent(url.pathname)); if (url.pathname === '/' || !existsSync(p)) p = join(ROOT, 'index.html');
    return route.fulfill({ status: 200, body: readFileSync(p), contentType: TYPES[extname(p)] || 'application/octet-stream' });
  });
  await page.routeWebSocket(/\/ws\//, (ws) => {
    sockets.add(ws);
    ws.onMessage((raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'hello') return push();
      const r = reduce(room, { playerId: me.id }, m); if (r.error) ws.send(JSON.stringify({ type: 'error', error: r.error }));
      push();
    });
    ws.onClose(() => sockets.delete(ws));
  });
  await page.goto('http://mafia.test/404.html');
  await page.evaluate(({ id, token }) => { localStorage.clear(); localStorage.setItem('mafia.player.HANDTP', JSON.stringify({ playerId: id, token })); }, { id: me.id, token: me.token });
  await page.goto('http://mafia.test/#/play/HANDTP');
  await page.waitForSelector('.seat-view');
  const settle = () => page.waitForTimeout(400);
  const scrollDown = async () => { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await settle(); return page.evaluate(() => window.scrollY); };
  const assertTop = async (label) => {
    await settle();
    const r = await page.evaluate(() => {
      const card = document.querySelector('.secret-card') || document.querySelector('.card-pick, .claim, .waiting');
      const b = card?.getBoundingClientRect();
      return { y: window.scrollY, has: !!card, top: b?.top, bottom: b?.bottom, vh: innerHeight, open: !!document.querySelector('.secret.is-open'), front: !!document.querySelector('.rcard:not([aria-hidden])') };
    });
    const tag = `${dev.name} / ${mode} / ${label}`;
    check(`${tag}: scrollY is 0`, r.y === 0, `scrollY=${r.y}`);
    check(`${tag}: card fully in view`, r.has && r.top >= 0 && r.bottom <= r.vh, `top=${r.top?.toFixed(0)} bottom=${r.bottom?.toFixed(0)} vh=${r.vh}`);
    check(`${tag}: card still face down`, !r.open && !r.front);
  };
  // Lobby: scroll down the seat list, then the Host deals.
  const y0 = await scrollDown(); check(`${dev.name} / ${mode} / lobby scrolls`, y0 > 0, `scrollY=${y0}`);
  reduce(room, { host: true }, { type: 'deal' }); push();
  if (mode === 'cards') {
    // Card picker, scrolled down, then the card is entered: the role card opens at the top.
    await page.waitForTimeout(300); await scrollDown();
    const slot = room.deck.map[0];
    reduce(room, { playerId: me.id }, { type: 'claimCard', card: slot.card }); push();
  }
  await page.waitForSelector('.secret-card');
  await assertTop('after the deal');
  // Night falls while the player had scrolled down to the table.
  for (const p of room.players) if (!p.roleId) p.roleId = 'villager';
  const y1 = await scrollDown();
  reduce(room, { host: true }, { type: 'startNight' }); push();
  if (y1 > 0) await assertTop('night falls'); else check(`${dev.name} / ${mode} / night: page too short to scroll`, true);
  await ctx.close();
}

for (const dev of DEVICES) {
  let browser;
  try { browser = dev.engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); }
  catch (e) { console.log(`SKIP ${dev.name}: ${e.message.split('\n')[0]}`); continue; }
  for (const mode of ['app', 'cards']) { try { await scenario(browser, dev, mode); } catch (e) { fails.push(`${dev.name} / ${mode}: ${e.message.split('\n')[0]}`); } }
  await browser.close();
}
console.log(`pass ${passes.length}, fail ${fails.length}`);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
