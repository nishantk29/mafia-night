// E2E (browser): one Detective. A game with two Detectives is played on a Host phone and a Detective's own phone.
// The real room reducer runs in Node behind a mocked WebSocket; public/ is served from disk (no network, no worker).
// Checks: the Detective role card, "Detective 1" / "Detective 2" calls, the MAFIA / NOT MAFIA result card, no console
// errors and no horizontal overflow at 390x844, 375x667 and 1280x800. Saves screenshots when SHOTS is set.
// Run: PW=/workspace/forge/pw/node_modules/playwright-core SHOTS=/some/dir node test/e2e/detective.e2e.mjs   (exit 1 on any failure)
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PW = process.env.PW || '/workspace/forge/pw/node_modules/playwright-core';
const { chromium } = await import(`${PW}/index.mjs`);
const ROOT = fileURLToPath(new URL('../../public/', import.meta.url));
const { newRoom, reduce, messagesFor } = await import(new URL('../../public/js/room.js', import.meta.url));
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SIZES = [
  { name: '390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '375', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '1280', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const SPEC = [['Ana', 'mafia'], ['Ben', 'mafia'], ['Cal', 'doctor'], ['Dee', 'detective'], ['Eve', 'detective'], ['Fay', 'villager'], ['Gus', 'villager'], ['Hal', 'villager']];
const fails = []; const passes = [];
const check = (label, ok, info = '') => { (ok ? passes : fails).push(`${label}${info ? ` (${info})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name) }); };

async function run(browser, size) {
  const room = newRoom('DETECT', 'hostkey');
  for (const [n] of SPEC) reduce(room, { anon: true }, { type: 'join', name: n });
  reduce(room, { host: true }, { type: 'setConfig', mode: 'app', roles: SPEC.map(([, r]) => r), rules: { firstNightKill: true } });
  check(`${size.name}: deal`, !!reduce(room, { host: true }, { type: 'deal' }).ok);
  for (const [n, r] of SPEC) room.players.find((p) => p.name === n).roleId = r; // fixed roles, so the checks are known
  const dee = room.players.find((p) => p.name === 'Dee');
  const socks = new Set();
  const push = () => { for (const s of socks) for (const m of messagesFor(room, s.att)) s.ws.send(JSON.stringify(m)); };
  const open = async (att, store) => {
    const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: size.hasTouch, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, body: '{}', contentType: 'application/json' });
      let p = join(ROOT, decodeURIComponent(url.pathname)); if (url.pathname === '/' || !existsSync(p)) p = join(ROOT, 'index.html');
      return route.fulfill({ status: 200, body: readFileSync(p), contentType: TYPES[extname(p)] || 'application/octet-stream' });
    });
    await page.routeWebSocket(/\/ws\//, (ws) => {
      const s = { ws, att };
      socks.add(s);
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'hello') return push();
        const r = reduce(room, att.who === 'host' ? { host: true } : { playerId: att.playerId }, m);
        if (r.error) ws.send(JSON.stringify({ type: 'error', error: r.error }));
        push();
      });
      ws.onClose(() => socks.delete(s));
    });
    await page.goto('http://mafia.test/404.html');
    await page.evaluate(store, att);
    return { ctx, page, errs };
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  // The Detective's own phone: the role card.
  const ph = await open({ who: 'player', playerId: dee.id }, ({ playerId }) => { localStorage.clear(); localStorage.setItem('mafia.player.DETECT', JSON.stringify({ playerId, token: null })); });
  await ph.page.evaluate(({ id, token }) => localStorage.setItem('mafia.player.DETECT', JSON.stringify({ playerId: id, token })), { id: dee.id, token: dee.token });
  await ph.page.goto('http://mafia.test/#/play/DETECT'); await ph.page.waitForSelector('.secret-card'); await sleep(400);
  await ph.page.evaluate(() => document.querySelector('[data-hold]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })));
  await sleep(450);
  const card = await ph.page.evaluate(() => ({ name: document.querySelector('.rcard-name')?.textContent, team: document.querySelector('.rcard-team')?.textContent, blurb: document.querySelector('.rcard-blurb')?.textContent, open: !!document.querySelector('.secret.is-open') }));
  check(`${size.name}: role card says Detective, Town, MAFIA or NOT MAFIA`, card.name === 'Detective' && /town/i.test(card.team) && /MAFIA or NOT MAFIA/.test(card.blurb), JSON.stringify(card));
  check(`${size.name}: role card opens while held`, card.open);
  check(`${size.name}: role card has no horizontal overflow`, !(await overflow(ph.page)));
  await shot(ph.page, `role-card-${size.name}.png`);

  // The Host's phone: night 1, two Detectives.
  const host = await open({ who: 'host' }, () => { localStorage.clear(); localStorage.setItem('mafia.host.DETECT', 'hostkey'); });
  await host.page.goto('http://mafia.test/#/host/DETECT'); await host.page.waitForSelector('.action-dock'); await sleep(500);
  await host.page.evaluate(() => document.querySelector('[data-a="hhSkip"]')?.click()); await sleep(200);
  await host.page.evaluate(() => [...document.querySelectorAll('.action-dock button')].find((x) => /Start night/i.test(x.textContent)).click()); await sleep(600);
  const results = []; const calls = [];
  const target = { 'Detective 1': 'Ana', 'Detective 2': 'Cal' };
  for (let i = 0; i < 40 && results.length < 2; i++) {
    const st = await host.page.evaluate(() => ({ card: document.querySelector('.check-card')?.innerText.replace(/\s+/g, ' ').trim(), say: document.querySelector('.cues .cue.is-current .tell-say b')?.textContent, label: document.querySelector('.cues .cue.is-current')?.innerText.replace(/\s+/g, ' ') }));
    if (st.card) {
      results.push(st.card);
      if (results.length === 1) { await sleep(450); await shot(host.page, `check-card-${size.name}.png`); }
      check(`${size.name}: check card has no horizontal overflow`, !(await overflow(host.page)));
      await host.page.evaluate(() => document.querySelector('.check-card').click()); await sleep(300); continue;
    }
    const who = /Detective [12]/.exec(st.label || '')?.[0];
    if (who && !calls.includes(who)) calls.push(who);
    const want = who ? target[who] : null;
    await host.page.evaluate((w) => { const cue = document.querySelector('.cues .cue.is-current'); const pk = [...cue.querySelectorAll('[data-a="pick"]')]; const b = w ? pk.find((x) => x.textContent.trim() === w) : pk[0]; b?.click(); }, want);
    await sleep(350);
    if (await host.page.evaluate(() => !!document.querySelector('.check-card'))) continue;
    if (who) await shot(host.page, `night-step-${size.name}.png`);
    await host.page.evaluate(() => { const b = [...document.querySelectorAll('.action-dock button')].find((x) => !x.disabled); b?.click(); }); await sleep(450);
  }
  check(`${size.name}: the Host calls Detective 1 and Detective 2`, calls.length === 2, calls.join(', '));
  check(`${size.name}: results are one MAFIA and one NOT MAFIA`, results.some((t) => /checked Ana MAFIA/.test(t)) && results.some((t) => /checked Cal NOT MAFIA/.test(t)), results.join(' | '));
  check(`${size.name}: the caption names who was checked`, results.every((t) => /checked (Ana|Cal)/.test(t)), results.join(' | '));
  check(`${size.name}: host page has no horizontal overflow`, !(await overflow(host.page)));
  check(`${size.name}: no console errors`, host.errs.length === 0 && ph.errs.length === 0, [...host.errs, ...ph.errs].join('; '));
  await ph.ctx.close(); await host.ctx.close();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const size of SIZES) { try { await run(browser, size); } catch (e) { fails.push(`${size.name}: ${e.message.split('\n')[0]}`); } }
await browser.close();
for (const p of passes) console.log('ok   ' + p);
for (const f of fails) console.log('FAIL ' + f);
console.log(`${passes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
