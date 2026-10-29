// E2E (browser, Chromium): deaths never reveal a role by default (Nishant, Oct 29 2026), and a room that is mid-game when a
// new build ships resumes after a refresh. One host and five phones play night 1 to the morning and the day vote.
//   STAGE=all     (default) play to the morning and the vote on this build, check no role is named anywhere, shots
//   STAGE=before  play to the morning on whatever build is running, save the phones (storage + URL) to STATE=<file>
//   STAGE=after   reopen the saved phones on the new build (same origin), refresh, check the room resumes and stops revealing
// Run: BASE=http://127.0.0.1:8942 node test/e2e/no-reveal.e2e.mjs   Shots: SHOTS=<dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ledger, launch, DEVICES } from './phones.mjs';

const BASE = (process.env.BASE || '').replace(/\/$/, '');
const STAGE = process.env.STAGE || 'all';
const STATE = process.env.STATE || '/tmp/mafia-noreveal-state.json';
const SHOTS = process.env.SHOTS || '';
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee', 'Eve'];
const ROLE_WORDS = /\b(Doctor|Detective|Cop|Villager|Mafia|Godfather|Vigilante|Jester|Bodyguard|Medium|Sheriff|Serial Killer|Framer|Janitor|Mayor)\b/;
const L = ledger(`mafia no-reveal e2e (${STAGE})`);
if (!BASE) throw new Error('set BASE');
const browser = await launch();
const all = [];
async function phone(name, storageState) {
  const ctx = await browser.newContext({ ...DEVICES.p390, serviceWorkers: 'block', reducedMotion: 'reduce', ...(storageState ? { storageState } : {}) });
  const page = await ctx.newPage();
  const errors = []; const frames = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { frames.push(JSON.parse(f.payload)); } catch {} }));
  const P = { name, ctx, page, errors, frames, text: () => page.evaluate(() => document.body.innerText), shot: async (file) => { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `${file}.png`), animations: 'disabled' }); } };
  all.push(P); return P;
}
const wait = (p, ms) => p.page.waitForTimeout(ms);
// every player-view frame a phone received: the dead carry no role until game over
const payloadLeaks = (p) => p.frames.filter((m) => m.type === 'view' && m.view?.kind === 'player' && m.view.phase !== 'over')
  .flatMap((m) => m.view.players.filter((q) => !q.alive && q.id !== m.view.me.id && q.role).map((q) => `${p.name} got ${q.name}=${q.role.name}`));
const logLeaks = (p) => p.frames.filter((m) => m.type === 'view' && m.view?.kind === 'player' && m.view.phase !== 'over').flatMap((m) => (m.view.publicLog || []).map((l) => l.text).filter((t) => ROLE_WORDS.test(NAMES.reduce((s, n) => s.split(n).join(''), t))));

async function table() {
  const host = await phone('host');
  await host.page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
  await host.page.locator('[data-a="hostLive"]').first().click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  const skipWalk = () => host.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
  await skipWalk();
  const players = [];
  for (const n of NAMES) {
    const p = await phone(n); players.push(p);
    await p.page.goto(BASE + '/#/join/' + code, { waitUntil: 'domcontentloaded' });
    const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  await host.page.waitForFunction((ns) => ns.every((n) => document.body.innerText.includes(n)), NAMES, { timeout: 15000 }).catch(() => {});
  await skipWalk();
  for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click(); await wait(host, 150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  for (const p of players) { await p.page.locator('[data-a="seeRoles"]').click({ timeout: 15000 }).catch(() => {}); }
  await host.page.locator('[data-a="seeRoles"]').click({ timeout: 15000 }).catch(() => {});
  return { host, players, code };
}
// Night 1: the Mafia take the first name; every other pick takes the last name, so a lone save rarely lands on the victim.
async function night(host) {
  await host.page.locator('.action-dock [data-a="startNight"]').click();
  await host.page.locator('.st-card').waitFor({ timeout: 10000 });
  for (let i = 0; i < 30; i++) {
    const kicker = await host.page.evaluate(() => document.querySelector('.st-card .st-kicker')?.textContent || '');
    if (!kicker) break;
    const toks = host.page.locator('.st-card .st-tok:not(.is-none)');
    if (await toks.count()) await (/Mafia/.test(kicker) ? toks.first() : toks.last()).click();
    else if (await host.page.locator('.st-card [data-a="alert"][data-v="1"]').count()) await host.page.locator('.st-card [data-a="alert"][data-v="1"]').first().click();
    await wait(host, 120);
    const check = host.page.locator('.check-card'); if (await check.count()) { await check.click(); await wait(host, 150); }
    if (await host.page.locator('.action-dock .btn.big.disabled').count()) { await host.page.locator('.st-card [data-a="skip"], .dock-why [data-a="skip"], .dock-why [data-a="skipIdentify"]').first().click(); await wait(host, 120); }
    await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250);
    if (await host.page.locator('.st-card [data-a="selCondemn"], .st-kicker:text("Morning")').count()) break;
  }
  await host.page.locator('.st-card .st-kicker:text("Morning")').waitFor({ timeout: 8000 }).catch(() => {});
}
const morningSay = (host) => host.page.evaluate(() => document.querySelector('.st-card .st-say')?.textContent || '');

async function checkMorning(host, players, label) {
  const say = await morningSay(host);
  L.check(`${label}: the host is on the morning card`, /open your eyes/.test(say), say);
  L.check(`${label}: the morning line names no role ("…was killed in the night." only)`, !/They were|stays a mystery/.test(say) && !ROLE_WORDS.test(NAMES.reduce((s, n) => s.split(n).join(''), say)), say);
  const dead = NAMES.filter((n) => new RegExp(`${n} was killed in the night`).test(say));
  L.check(`${label}: someone died in the night (so the check means something)`, dead.length > 0, say);
  for (const p of players) {
    const t = await p.text();
    L.check(`${label}: ${p.name}'s phone shows no "They were"`, !/They were|was the /i.test(t));
  }
  const leaks = players.flatMap(payloadLeaks); L.check(`${label}: no phone payload carries a dead player's role`, leaks.length === 0, leaks.slice(0, 3).join(' | '));
  const ll = players.flatMap(logLeaks); L.check(`${label}: no phone's public log names a role`, ll.length === 0, ll.slice(0, 3).join(' | '));
  return dead;
}

try {
  if (STAGE === 'after') {
    const saved = JSON.parse(readFileSync(STATE, 'utf8'));
    const host = await phone('host', saved.host.storage); await host.page.goto(saved.host.url, { waitUntil: 'domcontentloaded' });
    const players = [];
    for (const s of saved.players) { const p = await phone(s.name, s.storage); players.push(p); await p.page.goto(s.url, { waitUntil: 'domcontentloaded' }); }
    for (const p of [host, ...players]) { await p.page.reload({ waitUntil: 'domcontentloaded' }); }
    await host.page.locator('.st-card .st-kicker:text("Morning")').waitFor({ timeout: 15000 }).catch(() => {});
    L.check('after the new build: the host comes back to the same room, day 1 morning', (await host.page.evaluate(() => location.hash)).includes(saved.code) && /open your eyes/.test(await morningSay(host)), await morningSay(host));
    for (const p of players) await p.page.waitForFunction(() => document.body.innerText.length > 40, null, { timeout: 15000 }).catch(() => {});
    L.check('after the new build: every phone is back in the room (not on the join screen)', (await Promise.all(players.map((p) => p.page.locator('[data-i="joinName"]').count()))).every((c) => c === 0));
    L.check('before the new build the morning line DID name the role (old default), so this is a real switch', /They were/.test(saved.say) || saved.say === '', saved.say);
    await checkMorning(host, players, 'after the new build');
    if (SHOTS) await host.shot('resume-morning-390');
  } else {
    const { host, players, code } = await table();
    await night(host);
    if (STAGE === 'before') {
      const say = await morningSay(host);
      const snap = async (p) => ({ name: p.name, url: p.page.url(), storage: await p.ctx.storageState() });
      writeFileSync(STATE, JSON.stringify({ code, say, host: await snap(host), players: await Promise.all(players.map(snap)) }));
      L.check('before: played to the morning and saved the phones', /open your eyes/.test(say), say);
    } else {
      await checkMorning(host, players, 'new room');
      if (SHOTS) await host.shot('morning-390');
      // the vote
      if (await host.page.locator('.st-kicker:text("Morning")').count()) { await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250); }
      if (await host.page.locator('.st-card .st-kicker:text("Talk")').count()) { await host.page.locator('.action-dock .btn.big').click(); await wait(host, 250); }
      await host.page.locator('.st-card [data-a="selCondemn"]').first().waitFor({ timeout: 5000 });
      // vote out someone who is not Mafia, so the game goes on and the result row shows (the host view knows the roles)
      const hv = host.frames.filter((m) => m.type === 'view' && m.view?.kind === 'host').at(-1)?.view;
      const town = hv?.players.find((q) => q.alive && !['mafia', 'godfather'].includes(q.roleId));
      const tok = town ? host.page.locator(`.st-card [data-a="selCondemn"][data-id="${town.id}"]`) : host.page.locator('.st-card [data-a="selCondemn"]:not([data-id="none"])').first();
      const pick = (await tok.textContent()).trim(); await tok.click(); await wait(host, 150);
      const rail = await host.page.evaluate(() => [...document.querySelectorAll('.st-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      L.check('vote: no "shows their card" step with reveal off', !/shows their card/.test(rail), rail);
      await host.page.locator('.action-dock .btn.big').click();
      await host.page.waitForFunction(() => /Start night 2|game|Game/.test(document.querySelector('.action-dock .btn.big')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      await wait(host, 900); // the pop-out settles
      const over = await host.page.evaluate(() => /Game over|wins/i.test(document.body.innerText));
      const after = await host.page.evaluate(() => [...document.querySelectorAll('.st-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      L.check('vote: the game goes on (a Town player was voted out)', !over);
      L.check('vote: the result reads "<name> was voted out" and names no role', (new RegExp(`${pick} was voted out`).test(after) && !ROLE_WORDS.test(after.replace(/Vote\b/g, '').replace(/Mafia picked a target/g, ''))), after);
      if (SHOTS) await host.shot('vote-390');
      for (const p of players) await wait(p, 300);
      const pop = await Promise.all(players.map((p) => p.page.evaluate(() => document.querySelector('.fx-pop')?.innerText || '')));
      if (SHOTS) await players.find((p) => p.name !== pick).shot('vote-phone-390');
      L.check('vote: the pop-out on phones names no role', pop.every((t) => !ROLE_WORDS.test(NAMES.reduce((s, n) => s.split(n).join(''), t))), pop.join(' | '));
      const leaks = players.flatMap(payloadLeaks); L.check('after the vote: no phone payload carries a dead player\'s role', over || leaks.length === 0, leaks.slice(0, 3).join(' | '));
      const ll = players.flatMap(logLeaks); L.check('after the vote: no public log names a role', over || ll.length === 0, ll.slice(0, 3).join(' | '));
    }
  }
  const errs = all.flatMap((p) => p.errors); L.check('no page errors on any phone', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' '));
} finally {
  if (process.env.CLOSE !== '0') await browser.close(); L.done();
}
