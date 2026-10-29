// E2E (Chromium): mixed seating. Host + 3 phones + 2 seats on the host phone, through the seat sheet, Seating step, deal, pass the phone
// (gate, hidden card at the top, hold to look), a reconnect mid-pass, and night 1 with a seat that never looked.
// Run: BASE=http://localhost:8942 node test/e2e/seating.e2e.mjs      Shots: SHOTS=<dir>. Exit 1 on any failure.
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const PHONES = ['Ana', 'Cal', 'Dee'];
const L = ledger('mafia seating e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const wait = (p, ms) => p.page.waitForTimeout(ms);
const shot = async (p, f) => {
  if (!SHOTS) return;
  await p.shot(SHOTS, f);
  // A static copy of the screen (with a <base>) so the impeccable detector can look at it: SHOTS/html/<name>.html
  mkdirSync(`${SHOTS}/html`, { recursive: true });
  writeFileSync(`${SHOTS}/html/${f}.html`, (await p.page.content()).replace('<head>', `<head><base href="${srv.base}/">`));
};
const size = (p, w, h) => p.page.setViewportSize({ width: w, height: h });
const next = async (p) => { await p.page.locator('.action-dock [data-a="setupNext"]').click(); await wait(p, 200); };
const skipWalk = (p) => p.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
const addNames = async (p, names) => { for (const n of names) { await p.page.locator('#add-name').fill(n); await p.page.locator('#add-name').press('Enter'); await wait(p, 80); } await p.page.locator('#add-name').blur().catch(() => {}); };
const join = async (code, name) => {
  const p = await phone(browser, srv.base, name); all.push(p);
  await p.goto('/#/join/' + code);
  const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
  for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(name).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  return p;
};
const rowOf = (p, name) => p.page.locator('.seat-row', { hasText: name });
try {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  await skipWalk(host);
  const roleNames = await host.page.evaluate(async () => (await import('/js/roles.js')).ROLES.map((r) => r.name));
  const phones = []; for (const n of PHONES) phones.push(await join(code, n));
  await addNames(host, ['Ben', 'Gus']);
  await host.page.waitForFunction((ns) => ns.every((n) => document.querySelector('.seat-rows')?.innerText.includes(n)), [...PHONES, 'Ben', 'Gus'], { timeout: 15000 });

  // ---- lobby rows ----
  const where = async (n) => (await rowOf(host, n).locator('.seat-where').innerText()).trim();
  L.check('five rows: three on their phone, two on this phone', (await host.page.locator('.seat-row').count()) === 5 && (await where('Ana')) === 'On their phone' && (await where('Ben')) === 'This phone' && (await where('Gus')) === 'This phone');
  L.check('"Seat on this phone" button is on the Players step', (await host.page.locator('[data-a="addNames"]').innerText()).trim() === 'Seat on this phone');
  await shot(host, 'lobby-390');
  await size(host, 375, 667); await shot(host, 'lobby-375'); L.check('375x667: lobby has no sideways scroll', !(await host.overflow()));
  await size(host, 1280, 800); await shot(host, 'lobby-1280'); L.check('1280x800: lobby has no sideways scroll', !(await host.overflow()));
  await size(host, 390, 844);
  await phones[1].page.goto('about:blank'); // Cal's phone goes away: the socket closes
  await wait(host, 800);
  await addNames(host, ['Zed']); // the room only re-counts open sockets on its next broadcast, so an action nudges it
  await host.page.waitForFunction(() => /Reconnecting/.test(document.querySelector('.seat-rows')?.innerText || ''), null, { timeout: 15000 });
  L.check('a dropped phone reads "Reconnecting…"', (await where('Cal')) === 'Reconnecting…');
  await phones[1].goto('/#/join/' + code); // the same phone comes back and rejoins with its saved token
  await host.page.waitForFunction(() => !/Reconnecting/.test(document.querySelector('.seat-rows')?.innerText || ''), null, { timeout: 20000 });
  await rowOf(host, 'Zed').locator('.seat-btn').click(); await host.page.locator('[data-a="seatRemove"]').click();
  await host.page.waitForFunction(() => !document.querySelector('.seat-rows')?.innerText.includes('Zed'));
  L.check('a seat is removed from its sheet in the lobby', (await host.page.locator('.seat-row').count()) === 5);

  // ---- seat sheet: rename, release for takeover, take over, pull back after a confirm ----
  await rowOf(host, 'Gus').locator('.seat-btn').click(); await host.page.locator('#seat-title').waitFor();
  await shot(host, 'seat-sheet-390');
  await host.page.locator('[data-i="seatName"]').fill('Gil'); await host.page.locator('[data-a="seatRename"]').click();
  await host.page.waitForFunction(() => document.querySelector('.seat-rows')?.innerText.includes('Gil'));
  L.check('a seat renames from its sheet', (await rowOf(host, 'Gil').count()) === 1 && (await rowOf(host, 'Gus').count()) === 0);
  await rowOf(host, 'Gil').locator('.seat-btn').click(); await host.page.locator('[data-a="seatRelease"]').click();
  await host.page.waitForFunction(() => /Open seat/.test(document.querySelector('.seat-rows')?.innerText || ''));
  const taker = await join(code, 'Gil'); // same name, own phone
  await host.page.waitForFunction(() => /On their phone/.test([...document.querySelectorAll('.seat-row')].find((r) => /Gil/.test(r.innerText))?.innerText || ''), null, { timeout: 15000 });
  L.check('someone joining with a released seat’s name takes it over', (await where('Gil')) === 'On their phone' && (await host.page.locator('.seat-row').count()) === 5);
  await rowOf(host, 'Gil').locator('.seat-btn').click(); await host.page.locator('[data-a="seatPull"]').click();
  L.check('moving a seat off a phone asks first', /Move Gil to this phone\?/.test(await host.page.locator('#seat-title').innerText()));
  await shot(host, 'seat-pull-confirm-390');
  await host.page.locator('[data-a="seatLocal"]').click();
  await host.page.waitForFunction(() => /This phone/.test([...document.querySelectorAll('.seat-row')].find((r) => /Gil/.test(r.innerText))?.innerText || ''));
  await taker.page.locator('.gone').waitFor({ timeout: 10000 });
  L.check('the old phone for a moved seat sees nothing of the game', (await taker.page.locator('.gone').count()) === 1 && !/Town|Mafia/.test(await taker.text()));

  // ---- Seating step ----
  await next(host); await next(host);
  L.check('Seating preselects Mixed (3 phones, 2 by name)', (await host.page.locator('.setup-choice[aria-checked="true"]').innerText()).startsWith('Mixed'));
  await shot(host, 'seating-mixed-390');
  await host.page.locator('.setup-choice', { hasText: 'Own phones' }).click(); await wait(host, 150);
  L.check('Own phones flags seats with no phone with a fix, and Next stays enabled', /no phone/.test(await host.page.locator('.setup-card.is-active .callout').innerText()) && (await host.page.locator('.action-dock [data-a="setupNext"]').getAttribute('aria-disabled')) === null);
  await shot(host, 'seating-own-390');
  await host.page.locator('.setup-card.is-active .btn[data-a="setupSeating"]').click(); await wait(host, 150);
  L.check('"Seat on this phone" switches to Mixed', (await host.page.locator('.setup-choice[aria-checked="true"]').innerText()).startsWith('Mixed'));
  await next(host);
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  await host.page.waitForSelector('.pass-panel, .roles-gate', { timeout: 15000 });
  if (await host.page.locator('.roles-gate').count()) await host.page.locator('[data-a="seeRoles"]').click();
  await host.page.locator('.pass-panel').waitFor({ timeout: 10000 });

  // ---- dealt screen: seats on this phone are listed, roles are not ----
  const dealtText = await host.page.evaluate(() => document.querySelector('.pane-game').innerText);
  L.check('dealt: pass panel lists Ben and Gil with no role anywhere', /Ben/.test(dealtText) && /Gil/.test(dealtText) && (await host.page.locator('.pass-panel .rc, .pass-role').count()) === 0);
  const hidden = await Promise.all(['Ben', 'Gil'].map((n) => host.page.locator('.rrow', { hasText: n }).evaluate((el) => !!el.querySelector('.rrow-role.is-unknown') && !el.querySelector('.rrow-role:not(.is-unknown)'))));
  L.check('dealt: Who is who shows no role for a seat on this phone', hidden.every(Boolean), hidden.join(','));
  await shot(host, 'dealt-panel-390');
  for (const p of phones) { await p.page.locator('.roles-gate [data-a="seeRoles"]').click({ timeout: 8000 }).catch(() => {}); }
  L.check('phones got their roles on their own phone', (await Promise.all(phones.map((p) => p.page.locator('.secret-hold').count()))).every((c) => c === 1));

  // ---- pass the phone: Ben ----
  await host.page.locator('[data-a="passTo"]', { hasText: 'Ben' }).click(); await host.page.locator('.pass-gate').waitFor();
  const gate = await host.page.evaluate(() => ({ text: document.body.innerText, html: document.querySelector('.pass').innerHTML }));
  L.check('gate: "Hand this phone to Ben", a way back, nothing private', /Hand this phone to\s+Ben/.test(gate.text) && /Skip for now/.test(gate.text) && !roleNames.some((r) => new RegExp(`\\b${r}\\b`).test(gate.text.replace(/Nothing private is on screen/, ''))) && !/pass-role|rcard|data-card/.test(gate.html), gate.text.replace(/\s+/g, ' '));
  await shot(host, 'pass-gate-390');
  await size(host, 375, 667); L.check('375x667: gate fits', !(await host.overflow())); await size(host, 390, 844);
  await host.page.locator('[data-a="passIm"]').click(); await host.page.locator('.pass-hold').waitFor();
  const geo = await host.page.evaluate(() => { const r = document.querySelector('.pass-hold').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, sh: document.documentElement.scrollHeight, face: document.querySelector('[data-pass-face]').innerHTML }; });
  L.check('card: hidden card is at the top, no scroll, nothing drawn on it', geo.top < 140 && geo.sh <= geo.h && geo.face === '', JSON.stringify(geo));
  await shot(host, 'hidden-card-390');
  await size(host, 375, 667); const g2 = await host.page.evaluate(() => ({ b: document.querySelector('.pass-hold').getBoundingClientRect().bottom, btn: document.querySelector('[data-a="passDone"]').getBoundingClientRect().top, sh: document.documentElement.scrollHeight, h: innerHeight }));
  L.check('375x667: card above the button, no scroll', g2.b <= g2.btn && g2.sh <= g2.h, JSON.stringify(g2)); await shot(host, 'hidden-card-375'); await size(host, 390, 844);
  const box = await host.page.locator('.pass-hold').boundingBox();
  await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await host.page.mouse.down(); await wait(host, 150);
  const held = await host.page.evaluate(() => ({ roles: document.querySelectorAll('.pass-role').length, text: document.querySelector('.pass-face').innerText }));
  L.check('hold: exactly one role is drawn, only while held', held.roles === 1 && roleNames.some((r) => held.text.includes(r)), held.text.replace(/\s+/g, ' ').slice(0, 80));
  await shot(host, 'hidden-card-held-390');
  await host.page.mouse.up(); await wait(host, 150);
  L.check('let go: the role is gone from the page', (await host.page.evaluate(() => document.querySelectorAll('.pass-role').length)) === 0 && (await host.page.evaluate(() => document.querySelector('[data-pass-face]').innerHTML)) === '');
  await host.page.locator('[data-a="passDone"]').click(); await host.page.locator('.pass-panel').waitFor();
  L.check('Hide and pass back returns to the panel and marks Ben as looked', /Looked/.test(await host.page.locator('.pass-row', { hasText: 'Ben' }).innerText()));

  // ---- Gil: reload and reconnect mid-pass ----
  await host.page.locator('[data-a="passTo"]', { hasText: 'Gil' }).click(); await host.page.locator('.pass-gate').waitFor();
  await host.page.reload({ waitUntil: 'domcontentloaded' });
  await host.page.locator('.pass-gate, .pass-panel, .roles-gate').first().waitFor({ timeout: 15000 });
  if (await host.page.locator('.roles-gate').count()) await host.page.locator('[data-a="seeRoles"]').click();
  L.check('a reload mid-pass lands on a gate (never on a card)', (await host.page.locator('.pass-hold').count()) === 0 && (await host.page.locator('.pass-gate, .pass-panel').count()) === 1);
  if (!(await host.page.locator('.pass-gate').count())) await host.page.locator('[data-a="passTo"]', { hasText: 'Gil' }).click();
  await host.page.locator('[data-a="passIm"]').click(); await host.page.locator('.pass-hold').waitFor();
  await host.down(); await wait(host, 1500); host.up(); await host.wake('online'); await wait(host, 1500);
  L.check('a reconnect mid-pass keeps the card screen up', (await host.page.locator('.pass-hold').count()) === 1 && (await host.page.locator('[data-a="passDone"]').count()) === 1);
  await host.page.locator('[data-a="passDone"]').click(); await host.page.locator('.pass-panel').waitFor({ timeout: 10000 });
  // the phones that never opened their card, plus the seat on this phone: nothing blocks starting
  await host.page.locator('.pass-row', { hasText: 'Ben' }).waitFor();

  // ---- night 1 ----
  await host.page.locator('.action-dock [data-a="startNight"]').click();
  await host.page.locator('.st-card').waitFor({ timeout: 10000 });
  let steps = 0;
  for (let i = 0; i < 30; i++) {
    const has = await host.page.locator('.st-card .st-kicker').count(); if (!has) break; steps++;
    if (await host.page.locator('.st-card .st-tok:not(.is-none)').count()) await host.page.locator('.st-card .st-tok:not(.is-none)').first().click();
    else if (await host.page.locator('.st-card [data-a="alert"][data-v="1"]').count()) await host.page.locator('.st-card [data-a="alert"][data-v="1"]').first().click();
    await wait(host, 120);
    const check = host.page.locator('.check-card'); if (await check.count()) { await check.click(); await wait(host, 150); }
    if (await host.page.locator('.action-dock .btn.big.disabled').count()) { await host.page.locator('.st-card [data-a="skip"], .dock-why [data-a="skip"], .dock-why [data-a="skipIdentify"]').first().click(); await wait(host, 120); }
    await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
    if (await host.page.locator('.st-card [data-a="selCondemn"], .st-kicker:text("Morning")').count()) break;
  }
  L.check('night 1 ran to the morning', await host.page.evaluate(() => /Day 1/.test(document.querySelector('.phase-title')?.textContent || '')), steps + ' steps');
  // ---- One phone: a phone that joined moves to this phone at the deal, and every seat is in the pass queue ----
  const h2 = await phone(browser, srv.base, 'host2'); all.push(h2);
  await h2.goto('/#/'); await h2.page.locator('[data-a="hostLive"]').click();
  await h2.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code2 = await h2.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  await skipWalk(h2);
  const solo = await join(code2, 'Uma');
  await addNames(h2, ['Vic', 'Wes', 'Xan', 'Yul']);
  await h2.page.waitForFunction(() => document.querySelector('.seat-rows')?.innerText.includes('Yul'));
  await next(h2); await next(h2);
  await h2.page.locator('.setup-choice', { hasText: 'One phone' }).click(); await wait(h2, 150);
  L.check('One phone says joined phones move to this phone at the deal', /Uma joined on their own phone.*that seat moves to this phone/.test(await h2.page.locator('.setup-card.is-active .callout').innerText()));
  await shot(h2, 'seating-one-390');
  await next(h2);
  L.check('the Deal summary says all five are on this phone', /One phone: all 5 on this phone/.test(await h2.page.locator('.sum-list').innerText()));
  await h2.page.locator('.action-dock [data-a="setupDeal2"]').click();
  await h2.page.waitForSelector('.pass-panel, .roles-gate', { timeout: 15000 });
  if (await h2.page.locator('.roles-gate').count()) await h2.page.locator('[data-a="seeRoles"]').click();
  await h2.page.locator('.pass-panel').waitFor({ timeout: 10000 });
  L.check('One phone: all five seats are on the pass panel, and the joined phone is told its seat moved', (await h2.page.locator('.pass-row').count()) === 5 && (await solo.page.locator('.gone').count()) === 1);
  await h2.page.locator('[data-a="passStart"]').click(); await h2.page.locator('.pass-gate').waitFor();
  const order = [];
  for (let i = 0; i < 5; i++) {
    order.push((await h2.page.locator('.pass-name').innerText()).trim());
    await h2.page.locator('[data-a="passIm"]').click(); await h2.page.locator('.pass-hold').waitFor();
    await h2.page.locator('[data-a="passDone"]').click(); await wait(h2, 120);
  }
  L.check('Pass to each in turn walks every seat once, then returns to the panel', order.length === 5 && new Set(order).size === 5 && (await h2.page.locator('.pass-panel').count()) === 1 && (await h2.page.locator('.pass-row', { hasText: 'Not yet' }).count()) === 0, order.join(','));
  await checkPhones(L, all, 'end');
} catch (e) { L.check('script ran to the end', false, String(e?.stack || e).slice(0, 600)); } finally {
  await browser.close(); srv.stop(); L.done();
}
