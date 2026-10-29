// E2E (browser, Chromium): Back (page.goBack(), as Android Back or the iOS edge swipe) closes the open sheet first.
// Covers: the host walkthrough, the host Menu and a seat sheet, a player's Roles sheet; a sheet closed by a tap leaves no
// extra entry (one Back leaves); Back is never trapped (the next Back leaves); the game still moves on (deal) after.
// Run: node test/e2e/back-nav.e2e.mjs   (starts wrangler dev)   |   BASE=https://mafia.hatethespurs.com node test/e2e/back-nav.e2e.mjs
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const L = ledger('mafia back-nav e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const layer = (p) => p.page.evaluate(() => [...document.querySelectorAll('[aria-modal="true"]')].filter((x) => x.getClientRects().length).length);
const hash = (p) => p.page.evaluate(() => location.hash);
const back = async (p) => { await p.page.goBack({ timeout: 5000 }).catch(() => {}); await p.page.waitForTimeout(500); };
const fwd = async (p) => { await p.page.goForward({ timeout: 5000 }).catch(() => {}); await p.page.waitForTimeout(1500); };
const tapBackdrop = (p) => p.page.mouse.click(195, 30);
try {
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.goto('/#/');
  await host.page.locator('[data-a="hostLive"]').click();
  await host.page.waitForFunction(() => /#\/host\/[A-Z]{6}/.test(location.hash), null, { timeout: 15000 });
  const room = await hash(host); const code = room.match(/[A-Z]{6}/)[0];
  await host.page.locator('button[data-a="hhSkip"]').first().waitFor({ timeout: 8000 });
  L.check('host: the walkthrough sheet is open over the lobby', (await layer(host)) === 1);
  await back(host);
  L.check('host: Back closes the walkthrough and stays in the room', (await layer(host)) === 0 && (await hash(host)) === room, await hash(host));

  await host.page.locator('[data-a="openSettings"]').click();
  L.check('host: Menu opens', (await layer(host)) === 1);
  await tapBackdrop(host); await host.page.waitForTimeout(400);
  L.check('host: a tap on the backdrop closes the Menu', (await layer(host)) === 0 && (await hash(host)) === room);
  await back(host);
  L.check('host: after a tap-close, one Back leaves the room (no leftover entry)', (await hash(host)) === '#/', await hash(host));
  await fwd(host);
  L.check('host: Forward brings the room back', (await hash(host)) === room);
  await host.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 3000 }).catch(() => {});

  await host.page.locator('[data-a="openSettings"]').click();
  await back(host);
  L.check('host: Back closes the Menu', (await layer(host)) === 0 && (await hash(host)) === room);
  await back(host);
  L.check('host: the next Back leaves (Back is never trapped)', (await hash(host)) === '#/', await hash(host));
  await fwd(host);
  await host.page.locator('button[data-a="hhSkip"]').first().click({ timeout: 3000 }).catch(() => {});

  const players = [];
  for (const n of ['E2E Ana', 'E2E Ben', 'E2E Cal', 'E2E Dee', 'E2E Eve']) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/');
    await p.goto('/#/join/' + code);
    const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  await host.page.waitForFunction(() => document.body.innerText.includes('E2E Eve'), null, { timeout: 15000 }).catch(() => {});
  // A seat sheet in the lobby (the host taps a player).
  const seat = host.page.locator('[data-a="seat"]:visible').first();
  if (await seat.count()) {
    await seat.click({ timeout: 5000 }).catch(() => {}); await host.page.waitForTimeout(300);
    const opened = (await layer(host)) === 1;
    await back(host);
    L.check('host: Back closes a seat sheet', opened && (await layer(host)) === 0 && (await hash(host)) === room, opened ? '' : 'no seat sheet opened');
  }
  // Deal still works after the Backs: no step is blocked.
  if (await layer(host)) await host.page.keyboard.press('Escape');
  for (let i = 0; i < 3; i++) { await host.page.locator('.action-dock [data-a="setupNext"]').click({ timeout: 8000 }); await host.page.waitForTimeout(150); }
  await host.page.locator('.action-dock [data-a="setupDeal2"]').click({ timeout: 8000 });
  for (const p of players) await p.page.locator('.hand').first().waitFor({ timeout: 15000 }).catch(() => {});
  L.check('the deal still reaches every phone', (await Promise.all(players.map((p) => p.page.locator('.hand').count()))).every((n) => n > 0));

  const ana = players[0]; const seatHash = await hash(ana);
  await ana.page.locator('[data-a="seeRoles"]').click({ timeout: 5000 }).catch(() => {});
  await ana.page.locator('[data-a="openRoles"]').first().click({ timeout: 8000 });
  L.check('player: Roles in this game opens', (await layer(ana)) === 1);
  await back(ana);
  L.check('player: Back closes Roles and keeps the hand on screen', (await layer(ana)) === 0 && (await hash(ana)) === seatHash && (await ana.page.locator('.hand').count()) > 0);
  await ana.page.locator('[data-a="openRoles"]').first().click({ timeout: 5000 });
  await ana.page.keyboard.press('Escape'); await ana.page.waitForTimeout(300);
  L.check('player: Escape still closes it', (await layer(ana)) === 0);
  await back(ana);
  L.check('player: and then one Back leaves the room', (await hash(ana)) === '#/', await hash(ana));
  await checkPhones(L, all, 'after Backs');

  if (!srv.local) {
    await host.page.locator('[data-a="seeRoles"]').click({ timeout: 3000 }).catch(() => {});
    await host.page.locator('[data-a="openSettings"]').click(); await host.page.locator('[data-a="endGameAsk"]').click(); await host.page.locator('[data-a="endGameYes"]').click();
  }
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
