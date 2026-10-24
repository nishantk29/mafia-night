// Animation stability audit at an iPhone viewport (390x844, touch, iOS UA). For each moment (home, sheet open/close,
// hold-to-reveal, card flip, host-console step change) it samples getBoundingClientRect every frame for ~800ms and asserts:
// no teleport (>40px in one frame), no backward jump, container never moves, nothing still animating after 700ms,
// no replay on a re-render with the same state (animationstart count), nothing animating under reduced motion, no sideways overflow.
// Usage: node tools/anim-check.mjs   (exits 1 on any failure; PORT=18474 to change the port)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';
const puppeteer = createRequire('/workspace/code-team/bugsweep/pp/node_modules/')('puppeteer-core');
const PORT = process.env.PORT || 18474, BASE = `http://localhost:${PORT}`;
const root = fileURLToPath(new URL('../public', import.meta.url));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('python3', ['-m', 'http.server', PORT, '-d', root], { stdio: 'ignore' });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
let page; const rows = []; let failed = 0;

// In the page: run `trigger`, then sample the listed selectors every frame for `ms`.
const record = (trigger, sels, ms = 800) => page.evaluate((trigger, sels, ms) => new Promise((resolve) => {
  const frames = []; const t0 = performance.now(); let started = false;
  const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  const tick = () => {
    const t = performance.now() - t0;
    if (!started) { started = true; if (trigger?.startsWith('js:')) new Function(trigger.slice(3))(); else if (trigger) { const e = document.querySelector(trigger); if (e) e.click(); } }
    frames.push({ t, r: sels.map(rect), op: sels.map((s) => { const e = document.querySelector(s); return e ? +getComputedStyle(e).opacity : null; }) });
    if (t < ms) requestAnimationFrame(tick);
    else resolve({
      frames,
      running: document.getAnimations().filter((a) => a.playState === 'running' && a.currentTime > 700).length,
      runningAll: document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.transitionProperty || '?')),
      sw: document.documentElement.scrollWidth, iw: innerWidth,
    });
  };
  requestAnimationFrame(tick);
}), trigger, sels, ms);

const analyse = (name, res, { eased = 0, containers = [] } = {}) => {
  const f = res.frames; const fails = [];
  const series = (i) => f.map((x) => x.r[i]).filter(Boolean);
  const e = series(eased);
  if (e.length) {
    let maxStep = 0, back = 0, dir = 0;
    for (let k = 1; k < e.length; k++) for (const ax of [0, 1]) {
      const d = e[k][ax] - e[k - 1][ax]; maxStep = Math.max(maxStep, Math.abs(d));
    }
    // dominant axis of the whole move; later frames must not travel against it by more than 2px
    const dx = e.at(-1)[0] - e[0][0], dy = e.at(-1)[1] - e[0][1]; const ax = Math.abs(dx) >= Math.abs(dy) ? 0 : 1; dir = Math.sign(ax ? dy : dx);
    if (dir) for (let k = 1; k < e.length; k++) back = Math.max(back, -dir * (e[k][ax] - e[k - 1][ax]));
    if (maxStep > 40) fails.push(`teleport ${maxStep.toFixed(0)}px`);
    if (back > 2) fails.push(`backward jump ${back.toFixed(1)}px`);
  }
  for (const c of containers) {
    const s = series(c); if (!s.length) continue;
    const a = s[Math.min(2, s.length - 1)]; const dev = Math.max(...s.slice(2).map((r) => Math.max(...r.map((v, i) => Math.abs(v - a[i])))), 0);
    if (dev > 1) fails.push(`container moved ${dev.toFixed(1)}px`);
  }
  if (res.running) fails.push(`${res.running} animation(s) still running after 700ms: ${res.runningAll.join(',')}`);
  if (res.sw > res.iw) fails.push(`scrollWidth ${res.sw} > ${res.iw}`);
  if (!e.length) fails.push('element never appeared');
  rows.push([name, e.length ? 'ok' : 'n/a', fails.length ? 'FAIL ' + fails.join('; ') : 'pass']);
  if (fails.length) failed++;
};
const note = (name, ok, detail = '') => { rows.push([name, '', ok ? 'pass' : 'FAIL ' + detail]); if (!ok) failed++; };

const fresh = async (url) => { await page.goto(BASE + '/print.html', { waitUntil: 'networkidle0' }); await page.evaluate(() => localStorage.clear()); await page.goto(url, { waitUntil: 'networkidle0' }); };
const click = async (sel) => { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel); await sleep(300); return ok; };
const act = (a, extra = '') => click(`[data-a="${a}"]${extra}`);
const type = (sel, v) => page.evaluate((s, v) => { const e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } }, sel, v);
const watchStarts = () => page.evaluate(() => { window.__starts = []; document.addEventListener('animationstart', (e) => window.__starts.push(e.animationName), true); });

try {
  await sleep(1000);
  page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('dialog', (d) => d.accept());

  // 1. home: load, then watch the layout settle
  await page.goto(BASE + '/print.html', { waitUntil: 'networkidle0' }); await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  analyse('home settle', await record(null, ['main.home', '.home-hero', '.home-rules'], 900), { containers: [0] });
  note('home: 4 steps visible, no carousel', await page.evaluate(() => { const li = [...document.querySelectorAll('.how li')]; return li.length === 4 && li.every((e) => e.getBoundingClientRect().right <= innerWidth) && getComputedStyle(document.querySelector('.how')).overflowX === 'visible'; }));
  note('home: All Games link 44px, custom domain', await page.evaluate(() => { const a = document.querySelector('.hub-link'); return !!a && a.href === 'https://gamenight.hatethespurs.com/' && a.getBoundingClientRect().height >= 44; }));
  note('no workers.dev links, no scroll timeline', await page.evaluate(() => !document.body.innerHTML.includes('workers.dev') && !document.getAnimations().some((a) => a.timeline && a.timeline.constructor.name !== 'DocumentTimeline')));

  // 3-5. phone view (player): a mocked room socket feeds one Villager view, then a Mafia view (a new deal)
  const room = newRoom('ROOMAB', 'hostkey-SECRET-123'); const tok = {};
  for (let i = 1; i <= 6; i++) tok[i] = reduce(room, { anon: true }, { type: 'join', name: 'Player' + i }).data;
  reduce(room, { host: true }, { type: 'setConfig', roles: ['mafia', 'villager', 'villager', 'villager', 'villager', 'villager'], mode: 'app', deckStyle: 'random', cardFlow: 'claim' });
  reduce(room, { host: true }, { type: 'deal' });
  const viewOf = (roleId) => { const p = room.players.find((x) => x.roleId === roleId); return { v: viewForPlayer(room, p.id), id: p.id, token: tok[+p.name.slice(6)].token }; };
  const A = viewOf('villager'), B = viewOf('mafia');
  await page.evaluateOnNewDocument((views, me) => {
    localStorage.setItem('mafia.player.ROOMAB', JSON.stringify(me));
    window.__sock = null;
    const rf = window.fetch; window.fetch = (u, ...a) => (String(u).startsWith('/api/room/') ? Promise.resolve(new Response('{}', { status: 200 })) : rf(u, ...a));
    window.WebSocket = class { constructor() { window.__sock = this; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'view', view: views[0] }) }), 20); }, 10); } send() {} close() {} };
    window.__push = (i) => window.__sock.onmessage({ data: JSON.stringify({ type: 'view', view: views[i] }) });
  }, [A.v, B.v], { playerId: A.id, token: A.token });
  await page.goto(BASE + '/print.html', { waitUntil: 'networkidle0' }); await page.goto(BASE + '/#/play/ROOMAB', { waitUntil: 'networkidle0' }); await sleep(900);
  if (process.env.DBG) console.log(await page.evaluate(() => location.hash + ' | ' + document.querySelector('#app').innerText.slice(0, 300)));
  const hold = await page.$('.secret-hold');
  if (hold) {
    const b = await hold.boundingBox();
    await page.touchscreen.touchStart(b.x + b.width / 2, b.y + b.height / 2);
    analyse('role reveal (held)', await record(null, ['.secret-card', '.secret .rcard', '.secret-veil'], 700), { eased: 1, containers: [0] });
    await page.touchscreen.touchEnd(); await sleep(400);
    await watchStarts();
    for (let i = 0; i < 2; i++) { await page.touchscreen.touchStart(b.x + b.width / 2, b.y + b.height / 2); await sleep(350); await page.touchscreen.touchEnd(); await sleep(350); }
    const st = await page.evaluate(() => window.__starts);
    note('hold-to-reveal replays no keyframes', st.length === 0, st.join(','));
    note('secret card has no filter blur', await page.evaluate(() => [...document.querySelectorAll('.secret .rcard,.secret-rest')].every((e) => getComputedStyle(e).filter === 'none')));
    // card flip: a new deal (different role) pops the card in once
    analyse('card flip (new deal)', await record('js:window.__push(1)', ['.secret-card', '.secret .rcard-inner'], 800), { containers: [0] });
    await watchStarts();
    await page.evaluate(() => window.__push(1)); await sleep(500);
    const st3 = await page.evaluate(() => window.__starts);
    note('same view pushed again replays nothing', st3.length === 0, st3.join(','));
  } else note('role reveal', false, 'no .secret-hold on the phone view');

  // local host console
  await page.evaluateOnNewDocument(() => { delete window.__sock; });
  await fresh(`${BASE}/?mode=roles#/local`);
  await type('[data-i="names"]', 'Ann,Bo,Cy,Dee,Eve,Fay,Gus,Hal'); await act('addNames'); await act('suggest'); await act('simpleSuggest');
  await act('deal'); await sleep(900);

  // 2. settings sheet open / close, seat sheet
  analyse('settings sheet open', await record('[data-a="openSettings"]', ['.sheet', '.sheet-bg', 'main'], 800), { eased: 0, containers: [1, 2] });
  note('sheet is solid (no backdrop-filter)', await page.evaluate(() => { const s = document.querySelector('.sheet'); return !!s && !/blur/.test(getComputedStyle(s).backdropFilter || ''); }));
  analyse('settings sheet close', await record('[data-a="closeSettings"]', ['main'], 500), { containers: [0] });
  // 6. seat sheet, then host-console step change
  analyse('seat sheet open', await record('[data-a="seat"]', ['.sheet', '.sheet-bg'], 800), { eased: 0, containers: [1] });
  await act('closeSheet');
  const stepSel = ['.pane-game', 'main', '#app > main'];
  const target = await page.evaluate((s) => s.find((x) => document.querySelector(x)), stepSel);
  analyse('host step change (start night)', await record('[data-a="startNight"]', [target, '.appbar'], 800), { eased: 0, containers: [1] });

  // 7. same-state re-render must not replay anything
  await watchStarts();
  for (const v of ['table', 'game', 'table', 'game']) await act('tab', `[data-v="${v}"]`);
  const st2 = await page.evaluate(() => window.__starts.filter((n) => /^(fx-row|rc-|coinflip|coinfade|sheet-|modal-in|step-in|rail-|fx-tick)/.test(n)));
  note('re-render with same state replays nothing', st2.length === 0, st2.join(','));

  // 8. reduced motion: everything instant
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await fresh(`${BASE}/?mode=roles#/local`);
  await type('[data-i="names"]', 'Ann,Bo,Cy,Dee,Eve,Fay,Gus,Hal'); await act('addNames'); await act('suggest'); await act('simpleSuggest');
  await act('deal'); await sleep(300);
  await act('seat'); await sleep(150);
  note('reduced motion: nothing animating', await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length === 0));
  await act('closeSheet'); await act('startNight'); await sleep(150);
  note('reduced motion: nothing animating after step', await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length === 0));
} catch (e) { console.log('error', e); rows.push(['script error', '', 'FAIL ' + e.message]); failed++; }
await browser.close(); server.kill();
const w = Math.max(...rows.map((r) => r[0].length));
for (const r of rows) console.log((r[2].startsWith('pass') ? '✓' : '✗'), r[0].padEnd(w), r[2]);
console.log(failed ? `\n${failed} failure(s)` : `\nall ${rows.length} animation checks pass`);
process.exit(failed ? 1 : 0);
