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
  async function table(hidden, dayTimer = false) {
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
  if (dayTimer) { await host.page.locator('[data-a="setupAdvOpen"]').click(); await host.page.locator('[data-a="setupAdv"][data-k="dayTimer"]').click(); await wait(host, 150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  return { host, players };

  }
  const { host, players } = await table(false, true);
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

  // ---- day timeline clarity: spine, states, readable upcoming, notes clear of the Next button ----
  const dayLook = async (stage) => {
    const r = await host.page.evaluate(() => {
      const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo) : null);
      const rail = document.querySelector('.st-rail'); const sp = cs(rail, '::before');
      const done = cs(document.querySelector('.st-line.is-done .st-dot')); const next = cs(document.querySelector('.st-line.is-next .st-dot'));
      const nextTxt = cs(document.querySelector('.st-line.is-next .st-text')); const now = cs(document.querySelector('.st-dot.is-now'));
      const dock = cs(document.querySelector('.action-dock'));
      return { spine: sp && [sp.width, sp.backgroundColor], done: done && done.backgroundColor, next: next && [next.borderTopWidth, next.borderTopColor, next.backgroundColor], nextTxt: nextTxt && nextTxt.color,
        nextOp: document.querySelector('.st-line.is-next') ? getComputedStyle(document.querySelector('.st-line.is-next')).opacity : '1', now: now && now.backgroundColor, dock: dock && dock.backgroundImage };
    });
    L.check(`${stage}: one solid 3px spine in --rule-strong`, r.spine && r.spine[0] === '3px' && r.spine[1] === 'rgb(138, 138, 154)', JSON.stringify(r.spine));
    L.check(`${stage}: current step is brass`, r.now === 'rgb(242, 193, 78)', r.now);
    if (r.done) L.check(`${stage}: done steps are filled --smoke`, r.done === 'rgb(201, 201, 214)', r.done);
    if (r.next) L.check(`${stage}: upcoming steps are a 3px --smoke ring with --smoke labels`, r.next[0] === '3px' && r.next[1] === 'rgb(201, 201, 214)' && r.nextTxt === 'rgb(201, 201, 214)' && r.nextOp === '1', JSON.stringify(r));
    L.check(`${stage}: the Next dock fades over 12px`, /linear-gradient\(rgba\(0, 0, 0, 0\), rgb\(11, 11, 13\) 12px\)/.test(r.dock || ''), r.dock);
    // open the private notes when there are any, scroll to the end: the last line sits fully above the Next button
    await host.page.setViewportSize({ width: 390, height: 664 }); await wait(host, 100);
    const peek = host.page.locator('.st-peek[aria-expanded="false"]');
    if (await peek.count()) { await peek.click(); await wait(host, 150); }
    const gap = await host.page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const btn = document.querySelector('.action-dock .btn.big')?.getBoundingClientRect(); const dockTop = document.querySelector('.action-dock')?.getBoundingClientRect().top;
      const dockEl = document.querySelector('.action-dock');
      const els = [...document.querySelectorAll('.console *')].filter((e) => !dockEl?.contains(e) && !e.closest('.tabbar, .toast, dialog, .sheet-bg') && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.getClientRects().length && getComputedStyle(e).position !== 'fixed');
      const last = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
      const lastEl = els.find((e) => e.getBoundingClientRect().bottom === last);
      return { last: Math.round(last), btn: Math.round(btn?.top ?? 0), dockTop: Math.round(dockTop ?? 0), what: (lastEl?.textContent || lastEl?.tagName || '').trim().slice(0, 40), scroll: document.documentElement.scrollHeight - innerHeight };
    });
    L.check(`${stage}: at the end of the page the last note is clear of the Next button and its fade`, gap.last <= gap.dockTop + 24 - 12 && gap.last <= gap.btn, JSON.stringify(gap));
    await host.page.setViewportSize({ width: 390, height: 844 });
    await host.page.evaluate(() => window.scrollTo(0, 0));
    if (await host.page.locator('.st-peek[aria-expanded="true"]').count()) { await host.page.locator('.st-peek[aria-expanded="true"]').click(); await wait(host, 150); }
    if (SHOTS) await host.shot(SHOTS, `clarity-${stage}-390`);
  };
  // ---- day 1 ----
  await host.page.locator('.st-card .st-kicker:text("Morning")').waitFor({ timeout: 5000 }).catch(() => {});
  if (SHOTS) await host.shot(SHOTS, 'day-morning-390');
  const gold1 = () => host.page.evaluate(() => document.querySelector('.action-dock .btn.big')?.textContent.trim());
  const clock = () => host.page.evaluate(() => { const t = document.querySelector('[data-talk]')?.textContent || ''; const [m, sec] = t.split(':').map(Number); return m * 60 + sec; });
  if (await host.page.locator('.st-kicker:text("Morning")').count()) {
    await dayLook('morning');
    L.check('the morning Next names the talk step', await gold1() === 'Next: Talk it out', await gold1());
    await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
  }
  // ---- the talk step ----
  await host.page.locator('.st-card .st-kicker:text("Talk")').waitFor({ timeout: 5000 });
  await dayLook('talk');
  const talkText = await host.page.locator('.st-card').innerText();
  L.check('talk card: "Talk it out" with a short what-to-do', /Talk it out/.test(talkText) && /Tap Next when it is time to vote/.test(talkText));
  L.check('talk card: Next names the vote and is on', await gold1() === 'Next: Vote' && await host.page.locator('.action-dock .btn.big.disabled').count() === 0, await gold1());
  const c0 = await clock(); L.check('the countdown starts at 5 minutes', c0 >= 295 && c0 <= 300, c0);
  await host.page.locator('[data-a="talkAdj"][data-v="1"]').click(); await wait(host, 150);
  const c1 = await clock(); L.check('+1 minute adds a minute', c1 >= 355 && c1 <= 360, c1);
  for (let i = 0; i < 5; i++) { await host.page.locator('[data-a="talkAdj"][data-v="-1"]').click(); await wait(host, 60); }
  L.check('-1 stops at 1 minute (the clock never shows 0 from the buttons)', (await clock()) <= 60 && (await clock()) > 0 && await host.page.locator('[data-a="talkAdj"][data-v="-1"][aria-disabled="true"]').count() === 1, await clock());
  await host.page.locator('[data-a="talkAdj"][data-v="1"]').click(); await wait(host, 100);
  await host.page.reload(); await host.page.locator('.st-card .st-kicker:text("Talk")').waitFor({ timeout: 15000 });
  const c2 = await clock(); L.check('a refresh mid-talk comes back to the step with the clock running', c2 > 60 && c2 <= 120, c2);
  if (SHOTS) {
    await host.shot(SHOTS, 'talk-390'); await host.shot(SHOTS, 'day-timer-390'); await dump(host, 'talk');
    for (const [name, w, h] of [['talk-375', 375, 667], ['talk-1280', 1280, 800]]) { await host.page.setViewportSize({ width: w, height: h }); await wait(host, 200); await host.shot(SHOTS, name); L.check(`talk step: no sideways scroll at ${w}x${h}`, !(await host.overflow())); }
    await host.page.setViewportSize({ width: 390, height: 844 }); await wait(host, 200);
  }
  await checkPhones(L, all, 'talk step');
  const nowAtTalk = await host.page.locator('[data-talk]').count();
  L.check('the timer has no animation (text only)', nowAtTalk === 1 && !(await host.page.evaluate(() => document.getAnimations().some((a) => a.effect?.getTiming().iterations === Infinity))));
  await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
  const railTalk = await host.page.evaluate(() => [...document.querySelectorAll('.st-line.is-done .st-text')].map((x) => x.textContent.trim()));
  L.check('the done row reads "Talked it out for N minute(s)"', railTalk.some((t) => /^Talked it out for \d+ minutes?$/.test(t)), railTalk.join(' | '));
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
  await dayLook('vote');
  if (SHOTS) { await host.shot(SHOTS, 'day-390'); await dump(host, 'day'); }
  await checkPhones(L, all, 'day vote');
  await host.page.locator('.action-dock .btn.big').click(); await wait(host, 400);
  // Live rooms answer a moment later: wait for the next step's button instead of a fixed sleep.
  await host.page.waitForFunction(() => /Start night 2/.test(document.querySelector('.action-dock .btn.big')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const after = await host.page.evaluate(() => ({ rail: [...document.querySelectorAll('.st-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()), btn: document.querySelector('.action-dock .btn.big')?.textContent.trim() }));
  L.check('the vote collapses and Start night 2 is next', after.rail.some((r) => /was voted out/.test(r)) && /Start night 2/.test(after.btn), JSON.stringify(after));
  const n2 = await host.page.evaluate(() => (document.querySelector('.st-rail')?.textContent.match(/Night 2/g) || []).length);
  L.check('after the vote "Night 2" shows once on the timeline', n2 === 1, String(n2));
  if (await host.page.locator('.st-rail').count()) await dayLook('after-vote');

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
