// E2E (Chromium + WebKit): the preset detail sheet. One scroll container (no clipped first row), one icon box and one
// name column for every role row, counts in a fixed tabular column, and equal heights for one-line rows.
// Run: node test/e2e/preset-sheet.e2e.mjs   (starts the dev server; BASE=... uses a running one). SHOTS=<dir> saves shots.
import { fileURLToPath } from 'node:url';
import { engines, ledger, server } from './phones.mjs';

// playwright-core is an optional dev tool (not a package.json dependency): install it, or set PW to its folder.
const PW = process.env.PW || 'playwright-core';
const pwEntry = /^(\.|\/|[A-Za-z]:)/.test(PW) ? `${PW}/index.mjs` : PW; // a folder path, or the bare package name
const { chromium, webkit } = await import(pwEntry);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const L = ledger('mafia preset sheet e2e');
const srv = await server(ROOT);
const SIZES = [[390, 844], [360, 640]];
const PRESETS = ['smoke-and-mirrors', 'speakeasy', 'hard-boiled', 'family-business', 'tommy-gun-night', 'blind-tiger'];
const PLAYERS = { 5: ['Ann', 'Bob', 'Cid', 'Dot', 'Eli'], 12: ['Ann', 'Bob', 'Cid', 'Dot', 'Eli', 'Flo', 'Gil', 'Hex', 'Ian', 'Joy', 'Kit', 'Lou'] };

const measure = (page) => page.evaluate(() => {
  const sheet = document.querySelector('.setup-sheet'); const list = sheet.querySelector('.mix-list');
  const rows = [...list.querySelectorAll('.mix-row')];
  const r = (el) => el.getBoundingClientRect();
  const lh = (el) => parseFloat(getComputedStyle(el).lineHeight) || 20;
  const sr = r(sheet); const lr = r(list);
  const scrollers = [...sheet.querySelectorAll('*')].filter((el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1; }).map((el) => el.className);
  const one = rows.filter((row) => { const s = row.querySelector('.mix-name small'); return !s || !s.textContent.trim() || r(s).height <= lh(s) * 1.5; });
  return {
    n: rows.length,
    listTop: lr.top, sheetTop: sr.top + parseFloat(getComputedStyle(sheet).borderTopWidth),
    firstTop: rows.length ? r(rows[0]).top : 0,
    listScrollTop: list.scrollTop, innerScrollers: scrollers,
    icoL: rows.map((x) => Math.round(r(x.querySelector('.mix-ico')).left * 10) / 10),
    icoW: rows.map((x) => Math.round(r(x.querySelector('.mix-ico')).width * 10) / 10),
    svgW: rows.map((x) => Math.round(r(x.querySelector('.mix-ico .ico')).width * 10) / 10),
    nameX: rows.map((x) => Math.round(r(x.querySelector('.mix-name')).left * 10) / 10),
    nW: rows.map((x) => Math.round(r(x.querySelector('.mix-n')).width * 10) / 10),
    tab: rows.every((x) => /tabular-nums/.test(getComputedStyle(x.querySelector('.mix-n')).fontVariantNumeric)),
    oneH: one.map((x) => Math.round(r(x).height * 10) / 10),
    gaps: rows.slice(1).map((x, i) => Math.round((r(x).top - r(rows[i]).bottom) * 10) / 10),
    padT: rows.map((x) => getComputedStyle(x).paddingTop),
    sheetBg: getComputedStyle(sheet).backgroundColor, sheetBlur: getComputedStyle(sheet).backdropFilter || getComputedStyle(sheet).webkitBackdropFilter || 'none',
    topOfStack: (() => { const x = sr.left + sr.width / 2; const el = document.elementFromPoint(x, sr.top + 4); return !!el && sheet.contains(el); })(),
  };
});
// Under heavy machine load a real click can stall; fall back to a DOM click so the layout checks still run.
const tap = (loc) => loc.click({ timeout: 10000 }).catch(() => loc.evaluate((b) => b.click()));
const same = (a) => a.every((v) => Math.abs(v - a[0]) <= 0.5);

// WebKit is skipped for an https BASE (the dev machine's WebKit had no TLS): see engines() in phones.mjs. E2E_WEBKIT=1 forces it.
const ENGINES = engines(srv.base, (process.env.ENGINES || 'chromium,webkit').split(','));
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]].filter(([e]) => ENGINES.includes(e))) {
  const browser = engine === 'webkit' ? await type.launch({ timeout: 600000 }) : await type.launch({ timeout: 600000, executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    for (const count of [5, 12]) {
      for (const [w, h] of count === 12 ? SIZES.slice(0, 1) : SIZES) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: engine === 'chromium', hasTouch: true });
        ctx.setDefaultTimeout(90000); ctx.setDefaultNavigationTimeout(180000);
        const page = await ctx.newPage();
        const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
        await page.goto(srv.base + '/#/local');
        await page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
        await page.locator('.setup-card.is-active').waitFor();
        for (const n of PLAYERS[count]) { await page.locator('#add-name').fill(n); await page.locator('#add-name').press('Enter'); await page.waitForTimeout(40); }
        await page.locator('#add-name').blur();
        const nextBtn = page.locator('.action-dock [data-a="setupNext"]');
        await tap(nextBtn);
        await page.locator('[data-a="setupPresets"]').first().waitFor({ timeout: 20000 });
        await tap(page.locator('[data-a="setupPresets"]').first());
        await page.locator('.pc-list').first().waitFor();
        for (const id of PRESETS) {
          await tap(page.locator(`[data-a="setupPreview"][data-v="${id}"]`));
          await page.locator('.setup-sheet .mix-row').first().waitFor();
          await page.waitForTimeout(450);
          const m = await measure(page);
          const tag = `${engine} ${w}x${h} ${count}p ${id}`;
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/${engine}-${w}-${count}p-${id}.png`, animations: 'disabled' });
          L.check(`${tag}: first row top at or below the list's visible top`, m.firstTop >= m.listTop - 0.5 && m.listScrollTop === 0, { firstTop: m.firstTop, listTop: m.listTop, scrollTop: m.listScrollTop });
          L.check(`${tag}: the sheet is the only scroll container`, m.innerScrollers.length === 0, m.innerScrollers);
          L.check(`${tag}: the sheet is on top at its own top edge, opaque, no blur`, m.topOfStack && !/rgba\(.*,\s*0(\.\d+)?\)$/.test(m.sheetBg) && m.sheetBlur === 'none', { bg: m.sheetBg, blur: m.sheetBlur });
          L.check(`${tag}: icon box left and width identical across ${m.n} rows`, same(m.icoL) && same(m.icoW) && same(m.svgW), { l: m.icoL, w: m.icoW, svg: m.svgW });
          L.check(`${tag}: role names start at one x`, same(m.nameX), m.nameX);
          L.check(`${tag}: counts in one fixed tabular column`, same(m.nW) && m.tab, m.nW);
          L.check(`${tag}: one-line rows have equal heights (${m.oneH.length})`, m.oneH.length < 2 || same(m.oneH), m.oneH);
          L.check(`${tag}: same gap between rows`, m.gaps.length < 1 || same(m.gaps), m.gaps);
          await tap(page.locator('.setup-sheet [data-a="setupSheetClose"]').first());
          await page.locator('.setup-sheet').waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
        }
        L.check(`${engine} ${w}x${h} ${count}p: no page errors`, errs.length === 0, errs);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
}
srv.stop();
L.done();
