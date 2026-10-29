// E2E (browser, Chromium): one host phone and five player phones in a real room, on the shared harness (phones.mjs).
// Covers: create a room, five joins, deal, every phone gets a hand, a player phone drops off and comes back (seat and
// hand kept), the single-device mode, and no console errors or sideways scroll on any phone at 390 px.
// Run: node test/e2e/multi-phone.e2e.mjs            (starts wrangler dev from this repo, real workerd + local DO)
//      BASE=https://mafia.hatethespurs.com node test/e2e/multi-phone.e2e.mjs   (live smoke; ends its game at the end)
// Shots: SHOTS=<dir>. Exit 1 on any failure.
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, dropAndWake, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const NAMES = ['E2E Ana', 'E2E Ben', 'E2E Cal', 'E2E Dee', 'E2E Eve'];
const L = ledger('mafia multi-phone e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
try {
  // Host creates a live room from the home screen.
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const code = await host.page.evaluate(() => location.hash.match(/[A-Z]{6}/)[0]);
  L.check('host made a room with a 6-letter code', /^[A-Z]{6}$/.test(code), code);
  // The first-run host walkthrough opens over the lobby; skip it like a returning host would.
  const skipWalk = (p) => p.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 5000 }).catch(() => {});
  await skipWalk(host);

  // Five players join on their own phones.
  const players = [];
  for (const n of NAMES) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/join/' + code);
    // The join form renders before the room socket is open; a name sent then only gets "Not connected to the room yet"
    // (by design). So wait for the form and retry until it is gone (live run, Oct 28: 0/5 joined without this; locally
    // 1 run in 5 lost one name).
    const input = p.page.locator('[data-i="joinName"]');
    await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) {
      await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {});
      await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
    }
  }
  await host.page.waitForFunction((ns) => ns.every((n) => document.body.innerText.includes(n)), NAMES, { timeout: 15000 }).catch(() => {});
  const seen = await host.page.evaluate((ns) => ns.filter((n) => document.body.innerText.includes(n)).length, NAMES);
  L.check('host sees all five players in the lobby', seen === 5, `${seen}/5`);
  if (SHOTS) await host.shot(SHOTS, 'mafia-host-lobby');
  await checkPhones(L, all, 'lobby');

  // Suggested roles, then deal.
  await skipWalk(host);
  for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click(); await host.page.waitForTimeout(150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click();
  for (const p of players) await p.page.locator('.hand').first().waitFor({ timeout: 15000 }).catch(() => {});
  const hands = await Promise.all(players.map((p) => p.page.locator('.hand').count()));
  L.check('every player phone shows its hand after the deal', hands.every((n) => n > 0), hands.join(','));
  if (SHOTS) { await host.shot(SHOTS, 'mafia-host-dealt'); await players[0].shot(SHOTS, 'mafia-player-hand'); }
  await checkPhones(L, all, 'dealt');

  // A player phone loses the room for 12 s, then comes back.
  const ms = await dropAndWake(players[1], '.banner', { downMs: 12000, kind: 'online' });
  L.check('a dropped phone is back within 10 s of coming online', ms >= 0 && ms < 10000, `${ms} ms`);
  await players[1].page.locator('.hand').first().waitFor({ timeout: 5000 }).catch(() => {});
  L.check('it keeps its seat and its hand', (await players[1].page.locator('.hand').count()) > 0, (await players[1].text()).slice(0, 60));
  L.check('no other phone was disturbed', (await Promise.all(players.map((p) => p.page.locator('.banner').count()))).every((n) => n === 0));

  // Clean up a live room: end the game from the host menu.
  if (!srv.local) {
    await host.page.locator('[data-a="openSettings"]').click(); await host.page.locator('[data-a="endGameAsk"]').click(); await host.page.locator('[data-a="endGameYes"]').click();
  }

  // Single-device mode, no server.
  const solo = await phone(browser, srv.base, 'single device'); all.push(solo);
  await solo.goto('/#/local');
  await skipWalk(solo);
  await solo.page.locator('[data-i="names"]').fill('Ana, Ben, Cal, Dee, Eve, Fay');
  await solo.page.locator('[data-a="addNames"]').click();
  await solo.page.locator('#add-name').blur().catch(() => {});
  for (let i = 0; i < 2; i++) { await solo.page.locator('.action-dock [data-a="setupNext"]').click(); await solo.page.waitForTimeout(150); }
  await solo.page.locator('.action-dock [data-a="setupDeal2"]').click();
  L.check('single-device mode deals', !(await solo.page.locator('[data-a="deal"]').count()) || !/Deal/.test(await solo.text().then((t) => t.slice(0, 40))), (await solo.text()).slice(0, 60));
  await checkPhones(L, [solo], 'single device');
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
