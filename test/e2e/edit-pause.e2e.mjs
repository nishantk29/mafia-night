// E2E (browser, Chromium): changing an earlier step in a real room (PR E-2, server and protocol; no host UI yet).
// Three phones: the host phone and two player phones, plus a script socket that plays the host's steps and sends the
// change (the change UI is PR E-3). Checks: a change that breaks a later step pauses; both player phones keep the
// confirmed game and show "The host is fixing an earlier step"; the host phone says where it stopped and why; the fix
// resumes every phone with "The host changed an earlier step"; no console errors. (Refused player moves while paused:
// test/edit-room.test.js.)
// Run: node test/e2e/edit-pause.e2e.mjs   (starts wrangler dev from this repo). Shots: SHOTS=<dir>.
import { fileURLToPath } from 'node:url';
import { ledger, server, launch, phone, checkPhones } from './phones.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const L = ledger('mafia edit-pause e2e');
const srv = await server(ROOT);
const browser = await launch();
const all = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Like a real table: each phone closes its death cards (they queue, one after another) and passes the roles list.
async function closeCards(phones) {
  for (const p of phones) for (let i = 0; i < 8; i++) {
    await wait(500);
    // A tap in the page (the card's burst keeps moving, so Playwright's "stable" wait never ends).
    const hit = await p.page.evaluate(() => { const b = document.querySelector('[data-fx-continue]') || document.querySelector('.roles-gate [data-a="seeRoles"], .roles-gate [data-a="closeRoles"]'); b?.click(); return !!b; });
    if (!hit) break;
  }
}

// A second host connection, driven from here.
async function driver(code, hostKey) {
  const ws = new WebSocket(srv.base.replace(/^http/, 'ws') + '/ws/' + code);
  const got = []; let view = null, rev = 0, hist = null;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); got.push(m); if (m.type === 'view') { view = m.view; rev = m.rev; hist = m.hist; } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ type: 'hello', hostKey }));
  const D = {
    got, get view() { return view; }, get hist() { return hist; },
    async send(m, withRev = true) { const n = got.length; ws.send(JSON.stringify(withRev ? { ...m, rev } : m)); for (let i = 0; i < 40 && got.length === n; i++) await wait(50); await wait(150); return got.slice(n); },
    close: () => ws.close(),
  };
  for (let i = 0; i < 40 && !view; i++) await wait(50);
  return D;
}

try {
  const res = await fetch(srv.base + '/api/create', { method: 'POST' }).then((r) => r.json());
  const { code, hostKey } = res;
  L.check('room created', /^[A-Z]{6}$/.test(code), code);
  const host = await phone(browser, srv.base, 'host'); all.push(host);
  await host.ctx.addInitScript(([c, k]) => { localStorage.setItem(`mafia.host.${c}`, k); localStorage.setItem('mafia.hostHelpSeen', '1'); }, [code, hostKey]);
  await host.goto('/#/host/' + code);
  const players = [];
  for (const n of ['E2E Ann', 'E2E Ben']) {
    const p = await phone(browser, srv.base, n); all.push(p); players.push(p);
    await p.goto('/#/join/' + code);
    const input = p.page.locator('[data-i="joinName"]'); await input.waitFor({ timeout: 10000 });
    for (let i = 0; i < 3 && (await input.count()); i++) { await input.fill(n).catch(() => {}); await input.press('Enter').catch(() => {}); await input.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {}); }
  }
  const D = await driver(code, hostKey);
  await D.send({ type: 'addPlayers', names: ['Cy', 'Dee', 'Eve'] });
  await D.send({ type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'], rules: { firstNightKill: true } });
  await D.send({ type: 'deal' });
  await D.send({ type: 'startNight' });
  const vill = D.view.players.filter((p) => p.roleId === 'villager');
  const k = D.view.script.find((s) => s.type === 'kill').key;
  await D.send({ type: 'submitNight', actions: { [k]: { targets: [vill[0].id] } }, n: 1 });
  await D.send({ type: 'condemn', playerId: vill[1].id });
  await D.send({ type: 'startNight' });
  L.check('night 2 began', D.view.phase === 'night', D.view.phase);
  await D.send({ type: 'log', since: 0 }, false);
  const log = D.got.filter((m) => m.type === 'log').at(-1);
  const night = log.events.findIndex((e) => e.m.type === 'submitNight') + log.from;
  L.check('the host can fetch the game\'s steps', night >= log.from && log.events.length > 3, `${log.events.length} events from ${log.from}`);
  await wait(500);
  // Like a real table: each phone has closed its death cards and passed the roles list (both sit above every banner).
  await closeCards(all);
  const deadBefore = await Promise.all(players.map((p) => p.page.evaluate(() => document.querySelectorAll('.dead, [data-dead="1"], .is-dead').length)));
  const textBefore = await Promise.all(players.map((p) => p.text()));

  // Night 1 now kills the player the town voted out on Day 1: that vote no longer fits.
  const out = await D.send({ type: 'edit', id: night, msg: { type: 'submitNight', actions: { [k]: { targets: [vill[1].id] } }, n: 1 } });
  const changed = out.find((m) => m.type === 'changed');
  L.check('the change pauses at the vote', D.hist?.hold?.type === 'condemn', JSON.stringify(D.hist?.hold || null));
  L.check('the change is answered with where it stopped', /^Paused: /.test(changed?.label || ''), changed?.label);
  for (const p of players) await p.page.locator('.banner').first().waitFor({ timeout: 5000 }).catch(() => {});
  for (const p of players) {
    const t = await p.page.locator('#toast').innerText().catch(() => '');
    L.check(`${p.name} is told by toast too`, t.includes('The host is fixing an earlier step. Hold on.'), t);
  }
  for (const [i, p] of players.entries()) {
    const b = await p.page.locator('.banner').first().innerText().catch(() => '');
    L.check(`${p.name} shows the pause banner`, b.includes('The host is fixing an earlier step. Hold on.'), b);
    const dead = await p.page.evaluate(() => document.querySelectorAll('.dead, [data-dead="1"], .is-dead').length);
    L.check(`${p.name} still shows the confirmed game (no unconfirmed death)`, dead === deadBefore[i] && (await p.text()) === textBefore[i]);
  }
  await host.page.locator('.banner').first().waitFor({ timeout: 5000 }).catch(() => {});
  const hb = await host.page.locator('.banner').first().innerText().catch(() => '');
  L.check('the host phone says where it stopped and why', /^Paused: .*Undo goes back to before the change\./.test(hb), hb);
  await closeCards(players); // any card still queued from before the change (the change itself adds none: checked above)
  for (const p of players) {
    const top = await p.page.evaluate(() => { const b = document.querySelector('.banner'); if (!b) return 'none'; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.contains(e) ? 'on top' : `under ${e?.className || e?.tagName}`; });
    L.check(`${p.name}: the pause banner is on top, not hidden under another layer`, top === 'on top', top);
  }
  if (SHOTS) { await host.shot(SHOTS, 'engine-mafia-e2-host-paused'); await players[0].shot(SHOTS, 'engine-mafia-e2-player-paused'); await players[1].shot(SHOTS, 'engine-mafia-e2-player2-paused'); }
  await checkPhones(L, all, 'paused');

  // Fix: Day 1 votes out someone else who is alive in the paused game (not the Mafia, so the game goes on).
  const other = D.view.players.find((p) => p.alive && p.roleId !== 'mafia');
  await D.send({ type: 'edit', id: D.hist.hold.id, msg: { type: 'condemn', playerId: other.id } });
  L.check('the fix resumes the game', !D.hist?.hold && D.view.phase === 'night', D.view.phase);
  for (const p of players) await p.page.locator('#toast.on').waitFor({ timeout: 4000 }).catch(() => {});
  for (const p of players) {
    const t = await p.page.locator('#toast').innerText().catch(() => '');
    L.check(`${p.name} is told "The host changed an earlier step"`, t.includes('The host changed an earlier step'), t);
    L.check(`${p.name} has no pause banner now`, (await p.page.locator('.banner').count()) === 0);
  }
  if (SHOTS) await players[0].shot(SHOTS, 'engine-mafia-e2-player-changed');
  await checkPhones(L, all, 'resumed');
  D.close();
} catch (e) {
  L.check('suite ran to the end', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await browser.close(); srv.stop(); L.done();
}
