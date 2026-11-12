// Sideways-drift audit: visits every reachable screen at an iPhone viewport, reports anything wider than the
// viewport outside an intentional scroller, then swipes sideways and checks the page did not move.
// Usage: node tools/drift-check.mjs   (exits 1 on any offender; PORT=18473 to change the port)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// puppeteer-core is an optional dev tool (not a package.json dependency): install it, or set PUPPETEER to its folder.
const puppeteer = createRequire(import.meta.url)(process.env.PUPPETEER || 'puppeteer-core');
const PORT = process.env.PORT || 18473, BASE = `http://localhost:${PORT}`;
const root = fileURLToPath(new URL('../public', import.meta.url));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('python3', ['-m', 'http.server', PORT, '-d', root], { stdio: 'ignore' });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const bad = [], seen = []; let page, cdp;

const VW = 390;
const inspect = (W) => {
  const out = [];
  const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible' && p !== document.documentElement && p !== document.body) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || cs.display === 'none' || cs.visibility === 'hidden' || el.closest('svg:not(:root) *')) continue;
    if ((r.right > W + 0.5 || r.left < -0.5) && !clipped(el)) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].slice(0, 3).map((c) => '.' + c).join('')} ${Math.round(r.left)}..${Math.round(r.right)}${cs.position === 'fixed' ? ' fixed' : ''}`);
  }
  const anims = document.getAnimations().filter((a) => a.effect?.target && /translate|transform/.test(JSON.stringify(a.effect.getKeyframes()))).length;
  return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, W: innerWidth, out: out.slice(0, 8), n: out.length, anims };
};
const swipe = async (dx) => {
  const y = 400, pt = (x) => ({ x, y, id: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(dx < 0 ? 320 : 100)] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt((dx < 0 ? 320 : 100) + dx * i / 8)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
};
const audit = async (label) => {
  await sleep(250);
  const r = await page.evaluate(inspect, VW);
  // Chrome turns an edge swipe into history-back; Safari does too. Not drift, so keep it from navigating mid-run.
  await page.evaluate(() => { if (!document.getElementById('nonav')) document.head.insertAdjacentHTML('beforeend', '<style id="nonav">html{overscroll-behavior-x:none}</style>'); });
  await swipe(-220); await swipe(220);
  const v = await page.evaluate(() => ({ x: scrollX, ox: visualViewport.offsetLeft, s: visualViewport.scale }));
  const fails = [];
  if (r.sw > VW || r.bw > VW || r.W > VW) fails.push(`scrollWidth ${r.sw}/${r.bw}, innerWidth ${r.W} > ${VW}`);
  if (r.n) fails.push(`${r.n} past edge: ${r.out.join(' | ')}`);
  if (v.x !== 0 || v.ox !== 0 || v.s !== 1) fails.push(`after swipe scrollX=${v.x} offsetLeft=${v.ox} scale=${v.s}`);
  seen.push(label); console.log(fails.length ? '✗' : '✓', label, `sw=${r.sw}`, r.anims ? `anims=${r.anims}` : '');
  for (const f of fails) { console.log('   ', f); bad.push(`${label}: ${f}`); }
};
const fresh = async (url) => { await page.goto(BASE + '/print.html', { waitUntil: 'networkidle0' }); await page.evaluate(() => localStorage.clear()); await page.goto(url, { waitUntil: 'networkidle0' }); };
const click = async (sel) => { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel); await sleep(250); return ok; };
const act = (a, extra = '') => click(`[data-a="${a}"]${extra}`);
const type = (sel, v) => page.evaluate((s, v) => { const e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } }, sel, v);
const actions = () => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-a]')].map((e) => e.dataset.a))]);

try {
  await sleep(1000);
  page = await browser.newPage(); cdp = await page.createCDPSession();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('dialog', (d) => d.accept());

  await fresh(BASE + '/'); await audit('landing');
  await act('openSettings'); await audit('settings sheet'); await act('closeSettings');
  await page.goto(BASE + '/#/faq'); await audit('rules & faq');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true))); await audit('faq all open');
  await page.goto(BASE + '/#/'); await sleep(300); await audit('landing (how to play carousel)');
  await page.evaluate(() => document.querySelector('.how')?.scrollTo({ left: 9999 })); await audit('how-to carousel end');
  for (const p of ['/print.html', '/print.html#cards', '/print.html#roles']) { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); await audit('print ' + p); }

  for (const mode of ['simple', 'cards', 'complex']) {
    await fresh(`${BASE}/?mode=${mode === 'complex' ? 'roles' : mode}#/local`);
    await audit(`local ${mode}: setup`);
    await type('[data-i="names"]', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW,Alexandria,Bo,Cy,Dee,Eve,Fay,Gus,Hal,Ivy,Jo'); await act('addNames'); await audit(`local ${mode}: lobby with players`);
    await act('suggest'); await act('simpleSuggest'); await audit(`local ${mode}: roles chosen`);
    await page.evaluate(() => document.querySelectorAll('details.role-group').forEach((d) => (d.open = true))); await audit(`local ${mode}: roles expanded`);
    for (const a of ['showQr', 'showCode', 'showKey']) if (await act(a)) { await audit(`local ${mode}: ${a}`); await page.keyboard.press('Escape'); await sleep(200); }
    if (!(await act('deal'))) { console.log('  (no deal action)'); continue; }
    const hold = await page.$('.secret-hold');
    if (hold) { const b = await hold.boundingBox(); await page.touchscreen.touchStart(b.x + b.width / 2, b.y + b.height / 2); await sleep(300); await audit(`local ${mode}: role revealed (held)`); await page.touchscreen.touchEnd(); }
    await audit(`local ${mode}: dealt`);
    await act('tab', '[data-v="table"]'); await audit(`local ${mode}: table tab`); await act('tab', '[data-v="log"]'); await audit(`local ${mode}: log tab`); await act('tab', '[data-v="game"]');
    await act('seat'); await audit(`local ${mode}: seat sheet`); await act('closeSheet'); await act('tools'); await audit(`local ${mode}: tools`); await page.keyboard.press('Escape');
    const states = new Set();
    for (let i = 0; i < 300; i++) {
      const st = await page.evaluate(() => document.documentElement.dataset.phase + '|' + [...document.querySelectorAll('[data-a]')].filter((e) => e.offsetParent && !e.disabled && e.getAttribute('aria-disabled') !== 'true').map((e) => e.dataset.a).filter((x) => !/^(openSettings|rmPlayer|addNames|resetLocal|setupMode|side|tab|legend|simple|cfg|tools|seat|showKey|undeal|focusStep|toggleUi|info|rule|hideKey)/.test(x)).join(','));
      const key = st.replace(/(pick,)+/g, 'pick,');
      if (!states.has(key)) { states.add(key); await audit(`local ${mode}: ${key.slice(0, 70)}`); }
      const did = await page.evaluate(() => {
        for (const a of ['playAgain', 'startDay', 'condemn', 'selCondemn', 'noCondemn', 'resolve', 'confirmId', 'infoDone', 'skip', 'alert', 'pick', 'startNight']) {
          const all = [...document.querySelectorAll(`[data-a="${a}"]`)].filter((e) => e.offsetParent && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
          const e = (a === 'pick' || a === 'selCondemn') ? all[(window.__n = (window.__n || 0) + 1) % all.length] : all[0];
          if (e) { e.click(); return a; }
        }
        return null;
      });
      await sleep(120);
      if (!did) { console.log('  stop', await page.evaluate(() => document.documentElement.dataset.phase + ' ' + !!document.querySelector('.fx-victory'))); break; }
      if (await page.evaluate(() => document.documentElement.dataset.phase) === 'over') { await audit(`local ${mode}: end screen`); break; }
    }
  }
} catch (e) { console.log('error', e); bad.push('script error ' + e.message); }
await browser.close(); server.kill();
console.log(bad.length ? `\n${bad.length} offender(s)` : `\nno drift on ${seen.length} screens`);
process.exit(bad.length ? 1 : 0);
