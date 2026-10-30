// E2E (browser, Chromium): Undo and Redo on three phones (the host and two players on their own phones, three more
// seats on the host phone). A night is run to morning, the host taps Undo and Redo, and every phone follows. A host
// reload in the middle of a night keeps the picks made so far.
// Run: node test/e2e/undo.e2e.mjs   (starts wrangler dev --local)   Shots: SHOTS=<dir>
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const L = ledger('mafia undo/redo e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const toastIs = (p, re) => p.page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast')?.textContent || ''), re.source, { timeout: 8000 }).then(() => true, () => false);
// Which console the host is on, read from the dock: a night has Next/Start the calls, a day has the vote or Start night.
const phaseText = (p) => p.page.evaluate(() => document.querySelector('.action-dock [data-a="nextStep"], .action-dock [data-a="startCalls"]') ? 'Night 1'
  : document.querySelector('.action-dock [data-a="dayVote"], .action-dock [data-a="dayTalk"], .action-dock [data-a="startNight"]') ? 'Day 1' : (document.querySelector('.action-dock')?.innerText || ''));
try {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  const skipWalk = (p) => p.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 4000 }).catch(() => {});
  await skipWalk(host);
  const players = [];
  for (const n of ['E2E Ann', 'E2E Ben']) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/join/' + code);
    const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  await host.page.locator('[data-i="names"]').fill('Cy, Dee, Eve');
  await host.page.locator('[data-a="addNames"]').click();
  await host.page.waitForFunction(() => ['E2E Ann', 'E2E Ben', 'Cy', 'Dee', 'Eve'].every((n) => document.body.innerText.includes(n)), null, { timeout: 10000 }).catch(() => {});
  L.check('lobby: no Undo button before the deal', (await host.page.locator('[data-a="undo"]').count()) === 0);
  for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click(); await host.page.waitForTimeout(150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  await host.page.locator('[data-a="seeRoles"]').click({ timeout: 5000 }).catch(() => {});
  await host.page.locator('[data-a="undo"]').waitFor({ timeout: 8000 }).catch(() => {});
  L.check('dealt: Undo is in the header', (await host.page.locator('.appbar [data-a="undo"]').count()) === 1);
  L.check('dealt: no Redo yet (nothing to redo)', (await host.page.locator('[data-a="redo"]').count()) === 0);

  // Night 1: skip the first step, reload the host phone, the skip is still there.
  await host.page.locator('.action-dock [data-a="startNight"]').click();
  await host.page.locator('.action-dock [data-a="startCalls"], .action-dock [data-a="nextStep"]').first().waitFor({ timeout: 8000 });
  if (await host.page.locator('.action-dock [data-a="startCalls"]').count()) await host.page.locator('.action-dock [data-a="startCalls"]').click();
  await host.page.locator('.dock-why [data-a="skip"]').first().click({ timeout: 5000 }).catch(() => {});
  await host.page.waitForTimeout(400);
  const before = await host.page.locator('.action-dock [data-a="nextStep"]').getAttribute('data-left').catch(() => null);
  await host.page.reload({ waitUntil: 'domcontentloaded' });
  await host.page.locator('.action-dock [data-a="nextStep"]').waitFor({ timeout: 10000 }).catch(() => {});
  await host.page.waitForTimeout(500);
  const after = await host.page.locator('.action-dock [data-a="nextStep"]').getAttribute('data-left').catch(() => null);
  L.check('a host reload mid-night keeps the picks made so far', before !== null && before === after, `steps left before ${before}, after ${after}`);

  // Run the rest of the night with skips and Next until morning.
  for (let i = 0; i < 30; i++) {
    if (/Day 1/.test(await phaseText(host))) break;
    const skip = host.page.locator('.dock-why [data-a="skip"]');
    if (await skip.count()) await skip.first().click(); else await host.page.locator('.action-dock [data-a="nextStep"]').click().catch(() => {});
    await host.page.waitForTimeout(200);
  }
  const atDay = /Day 1/.test(await phaseText(host));
  L.check('the night ends and the host is on Day 1', atDay, await phaseText(host));
  if (SHOTS) await host.shot(SHOTS, 'engine-C-host-header-day');
  const undoTitle = await host.page.locator('[data-a="undo"]').getAttribute('title');
  L.check('Undo names the step it takes back', undoTitle === 'Undo: End of the night', undoTitle);

  await host.page.locator('[data-a="undo"]').click();
  L.check('host toast: Undid: End of the night', await toastIs(host, /Undid: End of the night/));
  if (SHOTS) await host.shot(SHOTS, 'engine-C-host-undo-toast');
  for (const p of players) L.check(`${p.name} is told the host went back a step`, await toastIs(p, /The host went back a step/));
  if (SHOTS) await players[0].shot(SHOTS, 'engine-C-player-undo-toast');
  L.check('host is back in Night 1', /Night 1/.test(await phaseText(host)), await phaseText(host));
  L.check('Redo is on and names the step', (await host.page.locator('[data-a="redo"]').getAttribute('title')) === 'Redo: End of the night');
  if (SHOTS) await host.shot(SHOTS, 'engine-C-host-header-night-redo');

  await host.page.locator('[data-a="redo"]').click();
  L.check('host toast: Redid: End of the night', await toastIs(host, /Redid: End of the night/));
  for (const p of players) L.check(`${p.name} is told the host went forward a step`, await toastIs(p, /The host went forward a step/));
  L.check('Redo is gone again once there is nothing to redo', (await host.page.locator('[data-a="redo"]').count()) === 0);
  L.check('host is on Day 1 again', /Day 1/.test(await phaseText(host)), await phaseText(host));
  await checkPhones(L, all, 'after undo and redo');
} catch (e) {
  L.check('no crash', false, e.message);
} finally {
  await browser.close().catch(() => {});
  srv.stop();
  L.done();
}
