// E2E (browser, Chromium): the day's steps live in the room (PR E-4). The host phone taps Next: Talk it out, reloads
// and comes back to the talk with the same clock; a second host phone shows the same step; Continue to the vote is
// an Undo step that goes back to the talk. A script socket plays the night so the test starts at Day 1.
// Run: node test/e2e/day-stage.e2e.mjs   (starts wrangler dev from this repo). Shots: SHOTS=<dir>.
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const L = ledger('mafia day-stage e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function closeCards(p) { // death cards and the roles list sit above the screen until closed
  for (let i = 0; i < 8; i++) {
    await wait(400);
    const hit = await p.page.evaluate(() => { const b = document.querySelector('[data-fx-continue]') || document.querySelector('.roles-gate [data-a="seeRoles"], .roles-gate [data-a="closeRoles"]'); b?.click(); return !!b; });
    if (!hit) break;
  }
}
const stage = (p) => p.page.evaluate(() => document.querySelector('[data-talk]') ? 'talk' : document.querySelector('.action-dock [data-a="dayTalk"]') ? 'morning' : document.querySelector('.action-dock [data-a="condemn"], .action-dock [data-a="noCondemn"]') || /Tap who/.test(document.body.innerText) ? 'vote' : 'other');
const clock = (p) => p.page.evaluate(() => document.querySelector('[data-talk]')?.textContent || '');

try {
  const { code, hostKey } = await fetch(srv.base + '/api/create', { method: 'POST' }).then((r) => r.json());
  const ws = new WebSocket(srv.base.replace(/^http/, 'ws') + '/ws/' + code); let rev = 0;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === 'view') rev = m.rev; };
  await new Promise((res) => { ws.onopen = res; });
  const go = async (m) => { ws.send(JSON.stringify({ ...m, rev })); await wait(250); };
  ws.send(JSON.stringify({ type: 'hello', hostKey })); await wait(300);
  await go({ type: 'addPlayers', names: ['Ann', 'Ben', 'Cy', 'Dee', 'Eve'] });
  await go({ type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'], advanced: { dayTimer: true } });
  await go({ type: 'deal' }); await go({ type: 'startNight' }); await go({ type: 'submitNight', actions: {}, n: 1 });

  const mk = async (name) => { const p = await phone(browser, srv.base, name); all.push(p); await p.ctx.addInitScript(([c, k]) => { localStorage.setItem(`mafia.host.${c}`, k); localStorage.setItem('mafia.hostHelpSeen', '1'); }, [code, hostKey]); await p.goto('/#/host/' + code); await p.page.locator('.action-dock').waitFor({ timeout: 10000 }); await closeCards(p); return p; };
  const host = await mk('host');
  L.check('Day 1 opens at the morning', (await stage(host)) === 'morning', await stage(host));
  await host.page.locator('.action-dock [data-a="dayTalk"]').click();
  await host.page.locator('[data-talk]').waitFor({ timeout: 5000 }).catch(() => {});
  L.check('Next: Talk it out starts the talk', (await stage(host)) === 'talk');
  await wait(2200); const before = await clock(host);
  await host.page.reload(); await host.page.locator('.action-dock').waitFor({ timeout: 10000 }); await closeCards(host);
  await host.page.locator('[data-talk]').waitFor({ timeout: 5000 }).catch(() => {});
  const after = await clock(host);
  L.check('a reload mid-talk comes back to the talk', (await stage(host)) === 'talk', after);
  L.check('with the same clock (it kept counting, it did not restart)', after !== '' && after <= before && after !== '5:00', `${before} then ${after}`);
  if (SHOTS) await host.shot(SHOTS, 'engine-mafia-e4-host-talk-after-reload');
  const host2 = await mk('second host phone');
  await host2.page.locator('[data-talk]').waitFor({ timeout: 5000 }).catch(() => {});
  L.check('a second host phone shows the same step', (await stage(host2)) === 'talk', await clock(host2));
  await host.page.locator('.action-dock [data-a="dayVote"]').click(); await wait(600);
  L.check('Continue to the vote', (await stage(host)) === 'vote', await stage(host));
  L.check('the second host phone follows', (await stage(host2)) === 'vote', await stage(host2));
  const title = await host.page.locator('[data-a="undo"]').first().getAttribute('title');
  L.check('Undo names the step', title === 'Undo: Start of the vote', title);
  await host.page.locator('[data-a="undo"]').first().click(); await wait(600);
  L.check('Undo goes back to the talk', (await stage(host)) === 'talk', await clock(host));
  L.check('on both host phones', (await stage(host2)) === 'talk');
  await checkPhones(L, all, 'day steps');
  ws.close();
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
