// E2E (browser, Chromium): items 4 and 1. One host and five player phones: deal, "Roles in this game" on every phone (same
// markup for everyone), See my role, the header chip and its sheet, then night 1 on the storyteller timeline (table-safe),
// then day 1: the morning card and the "tap who's out" vote.
// Run: node test/e2e/story.e2e.mjs   (BASE=http://127.0.0.1:8942 to use a dev server you started)   Shots: SHOTS=<dir>
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee', 'Eve'];
const L = ledger('mafia story e2e (roles panel, storyteller)');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const wait = (p, ms) => p.page.waitForTimeout(ms);
// With SHOTS set, also saves each key screen's DOM next to its shot, so the impeccable detector can run on it.
const dump = async (p, name) => { if (SHOTS) writeFileSync(`${SHOTS}/${name}.html`, (await p.page.content()).replace('<head>', `<head><base href="${srv.base}/">`)); };
try {
  async function table(hidden) {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  const skipWalk = (p) => p.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
  await skipWalk(host);
  const players = [];
  for (const n of NAMES) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/join/' + code);
    const input = p.page.locator('[data-i="joinName"]');
    await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  await host.page.waitForFunction((ns) => ns.every((n) => document.body.innerText.includes(n)), NAMES, { timeout: 15000 }).catch(() => {});
  await skipWalk(host);
  for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click(); await wait(host, 150); }
  if (hidden) { await host.page.locator('[data-a="setupAdvOpen"]').click(); await host.page.locator('[data-a="setupAdv"][data-k="hiddenSetup"]').click(); await wait(host, 150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  return { host, players };

  }
  const { host, players } = await table(false);
  // ---- item 4: the first look ----
  for (const p of players) await p.page.locator('.roles-gate').waitFor({ timeout: 15000 }).catch(() => {});
  await host.page.locator('.roles-gate').waitFor({ timeout: 15000 }).catch(() => {});
  const gates = await Promise.all([host, ...players].map((p) => p.page.evaluate(() => ({ body: document.querySelector('.roles-gate .rs-body')?.innerHTML || '', btn: document.querySelector('.roles-gate [data-a="seeRoles"]')?.textContent.trim(), lead: document.querySelector('.roles-gate .rs-lead')?.textContent }))));
  L.check('every phone shows Roles in this game after the deal', gates.every((g) => g.body.length > 50), gates.map((g) => g.body.length).join(','));
  L.check('players see the button "See my role"', gates.slice(1).every((g) => g.btn === 'See my role'), gates.slice(1).map((g) => g.btn).join(','));
  L.check('host and every player phone render the same list', gates.every((g) => g.body === gates[0].body));
  L.check('the list names no player', gates.every((g) => !NAMES.some((n) => g.body.includes(n))));
  L.check('teams are grouped with totals ("Town, 3")', /Town, \d/.test(gates[1].body) && /Mafia, \d/.test(gates[1].body), gates[1].body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120));
  if (SHOTS) { await players[0].shot(SHOTS, 'roles-panel-390'); await dump(players[0], 'roles-panel'); await host.shot(SHOTS, 'roles-panel-host-390'); }
  await checkPhones(L, all, 'roles panel');
  // a role row opens its full rules
  const first = players[0].page.locator('.roles-gate .rs-btn').first();
  await first.click(); await wait(players[0], 100);
  L.check('tapping a role opens its full rules', await players[0].page.locator('.roles-gate .rs-rules').count() === 1);
  await first.click();
  for (const p of players) await p.page.locator('[data-a="seeRoles"]').click();
  await host.page.locator('[data-a="seeRoles"]').click();
  for (const p of players) await p.page.locator('.hand').first().waitFor({ timeout: 5000 });
  L.check('See my role leads to the hand', (await Promise.all(players.map((p) => p.page.locator('.hand').count()))).every((c) => c > 0));
  const chip = await players[0].page.locator('.roles-chip').textContent();
  L.check('the header chip reads "N roles"', /^\s*\d+ roles\s*$/.test(chip), chip);
  await players[0].page.locator('.roles-chip').click(); await wait(players[0], 150);
  const sheets = await Promise.all([host, players[1]].map(async (p) => { if (p === host) await host.page.locator('.roles-chip').click(); else await p.page.locator('.roles-chip').click(); await wait(p, 150); return p.page.evaluate(() => document.querySelector('.roles-sheet .rs-body')?.innerHTML || ''); }));
  const s0 = await players[0].page.evaluate(() => document.querySelector('.roles-sheet .rs-body')?.innerHTML || '');
  L.check('the chip opens the same list on host and players', s0.length > 50 && sheets.every((s) => s === s0));
  if (SHOTS) await players[0].shot(SHOTS, 'roles-sheet-390');
  for (const p of [host, players[0], players[1]]) await p.page.locator('.roles-sheet [data-a="closeRoles"]').first().click();
  if (SHOTS) await players[0].shot(SHOTS, 'chip-390');

  // ---- item 1: night 1 ----
  await host.page.locator('.action-dock [data-a="startNight"]').click();
  await host.page.locator('.st-card').waitFor({ timeout: 10000 });
  const lines = [];
  const grab = () => host.page.evaluate(() => ({
    kicker: document.querySelector('.st-card .st-kicker')?.textContent, say: document.querySelector('.st-card .st-say')?.textContent,
    rail: [...document.querySelectorAll('.st-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    tokens: [...document.querySelectorAll('.st-card .st-tok:not(.is-none)')].length,
    btn: document.querySelector('.action-dock .btn.big')?.textContent.trim(),
  }));
  let st = await grab();
  L.check('night opens on "Everyone", close your eyes', /Everyone/.test(st.kicker) && /close your eyes/.test(st.say), JSON.stringify(st));
  L.check('upcoming steps are named by role', st.rail.length >= 2 && st.rail.at(-1) === 'Everyone', st.rail.join(' / '));
  if (SHOTS) await host.shot(SHOTS, 'night-open-390');
  let shotPick = false;
  for (let i = 0; i < 30; i++) {
    st = await grab(); lines.push(st);
    if (!st.kicker) break;
    if (st.tokens && !shotPick) {
      shotPick = true;
      await host.page.locator('.st-card .st-tok:not(.is-none)').first().click(); await wait(host, 150);
      if (SHOTS) {
        await host.shot(SHOTS, 'night-390'); await dump(host, 'night');
        await host.page.setViewportSize({ width: 375, height: 667 }); await wait(host, 200); await host.shot(SHOTS, 'night-375');
        L.check('375x667 night card: no sideways scroll', !(await host.overflow()));
        await host.page.setViewportSize({ width: 1280, height: 800 }); await wait(host, 200); await host.shot(SHOTS, 'night-1280');
        L.check('1280x800 night card: no sideways scroll', !(await host.overflow()));
        await host.page.setViewportSize({ width: 390, height: 844 }); await wait(host, 200);
      }
    } else if (st.tokens) await host.page.locator('.st-card .st-tok:not(.is-none)').first().click();
    else if (await host.page.locator('.st-card [data-a="alert"][data-v="1"]').count()) await host.page.locator('.st-card [data-a="alert"][data-v="1"]').first().click();
    await wait(host, 120);
    const check = host.page.locator('.check-card'); if (await check.count()) { await check.click(); await wait(host, 150); }
    const dis = await host.page.locator('.action-dock .btn.big.disabled').count();
    if (dis) { await host.page.locator('.st-card [data-a="skip"], .dock-why [data-a="skip"], .dock-why [data-a="skipIdentify"]').first().click(); await wait(host, 120); }
    await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
    if (await host.page.locator('.st-card [data-a="selCondemn"], .st-kicker:text("Morning")').count()) break;
  }
  const dayStarted = await host.page.evaluate(() => /Day 1/.test(document.querySelector('.phase-title')?.textContent || ''));
  L.check('Next walked the whole night into day 1', dayStarted, lines.length + ' steps');
  const railText = lines.flatMap((l) => l.rail).join(' | ');
  L.check('the timeline never names a player', !NAMES.some((n) => new RegExp('\\b' + n + '\\b').test(railText)), railText.slice(0, 160));
  L.check('collapsed steps read "<Role> picked a target"', lines.some((l) => l.rail.some((r) => /^Mafia picked a target$/.test(r))) || lines.some((l) => l.rail.some((r) => /picked a target|answered|woke up/.test(r))), railText.slice(0, 200));
  L.check('every card shows a quoted line in the read-aloud type', lines.filter((l) => l.kicker).every((l) => /^“.+”$/.test(l.say || '')));
  await checkPhones(L, all, 'night');

  // ---- day 1 ----
  await host.page.locator('.st-card .st-kicker:text("Morning")').waitFor({ timeout: 5000 }).catch(() => {});
  if (SHOTS) await host.shot(SHOTS, 'day-morning-390');
  if (await host.page.locator('.st-kicker:text("Morning")').count()) { await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250); }
  await host.page.locator('.st-card [data-a="selCondemn"]').first().waitFor({ timeout: 5000 });
  const before = await host.page.evaluate(() => document.querySelector('.action-dock .btn.big')?.textContent.trim());
  L.check('vote button is disabled until someone is chosen', /who/i.test(before) && await host.page.locator('.action-dock .btn.big.disabled').count() === 1, before);
  const none = await host.page.locator('.st-card [data-a="selCondemn"][data-id="none"]').count();
  L.check('the vote card offers "No one" for a tie', none === 1);
  const tok = host.page.locator('.st-card [data-a="selCondemn"]:not([data-id="none"])').first();
  const pick = (await tok.textContent()).trim(); await tok.click(); await wait(host, 150);
  const gold = await host.page.evaluate(() => document.querySelector('.action-dock .btn.big')?.textContent.trim());
  L.check('the gold button says "Vote <name> out"', gold === `Vote ${pick} out`, gold);
  L.check('there is no tally on the vote card', !(await host.page.evaluate(() => /tally|\bvotes?\b.*\d/i.test(document.querySelector('.st-card').innerText.replace(/Vote\b/g, '')))));
  if (SHOTS) { await host.shot(SHOTS, 'day-390'); await dump(host, 'day'); }
  await checkPhones(L, all, 'day vote');
  await host.page.locator('.action-dock .btn.big').click(); await wait(host, 400);
  const after = await host.page.evaluate(() => ({ rail: [...document.querySelectorAll('.st-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()), btn: document.querySelector('.action-dock .btn.big')?.textContent.trim() }));
  L.check('the vote collapses and Start night 2 is next', after.rail.some((r) => /was voted out/.test(r)) && /Start night 2/.test(after.btn), JSON.stringify(after));

  // ---- hidden setup ----
  const hid = await table(true);
  for (const p of [hid.host, ...hid.players]) await p.page.locator('.roles-gate').waitFor({ timeout: 15000 });
  const hbody = await Promise.all([hid.host, ...hid.players].map((p) => p.page.evaluate(() => document.querySelector('.roles-gate .rs-body')?.innerHTML || '')));
  L.check('hidden setup: every phone shows the same plain panel', hbody.every((h) => h === hbody[0]) && /kept the roles secret/.test(hbody[0]) && /5 players/.test(hbody[0]) && /At least 1 Mafia/.test(hbody[0]));
  L.check('hidden setup: no role name anywhere on the panel', !/Doctor|Detective|Villager|Mafia, \d/.test(hbody[0].replace(/<[^>]+>/g, ' ')));
  if (SHOTS) await hid.players[0].shot(SHOTS, 'hidden-panel-390');
  for (const p of hid.players) await p.page.locator('[data-a="seeRoles"]').click();
  const hchip = await hid.players[0].page.locator('.roles-chip').textContent();
  L.check('hidden setup: the chip reads "Roles · ?"', /Roles · \?/.test(hchip), hchip);
  await hid.players[0].page.locator('.roles-chip').click(); await wait(hid.players[0], 150);
  if (SHOTS) await hid.players[0].shot(SHOTS, 'hidden-sheet-390');
  L.check('hidden setup: no sideways scroll or console errors', !(await hid.players[0].overflow()) && hid.players[0].errors.length === 0);

  const chips = await Promise.all([host, ...players].map((p) => p.page.locator('.roles-chip').count()));
  L.check('the roles chip is on every phone through night and day', chips.every((c) => c === 1), chips.join(','));
  await checkPhones(L, all, 'end');
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close(); srv.stop(); L.done();
}
