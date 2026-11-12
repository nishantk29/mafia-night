// Back and forward (Undo / Redo) on the event log: one Host step at a time, on every phone.
// Pure part: seeded random games in every mode, undo step by step to the deal and redo to the end.
// Room part: the real Durable Object with fake storage and three phones (host + two players).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { GameLog, KEY, replay } from '../public/js/event-log.js';
import { newRoom, messagesFor } from '../public/js/room.js';
import { UNDO_PAST_GAME_OVER, NOTIFY_ON_UNDO } from '../public/js/config-defaults.js';
import { rng as simRng } from '../scripts/sim-lib.mjs';
import { playGame } from './kit/mafia-games.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

const GAMES = Number(process.env.UNDO_GAMES || 40);
const SEED = Number(process.env.UNDO_SEED || 3);
const json = (x) => JSON.stringify(x);

test('the defaults pending a decision: undo past game over and the player toast are both on', () => {
  assert.equal(UNDO_PAST_GAME_OVER, true);
  assert.equal(NOTIFY_ON_UNDO, true);
});

test(`undo step by step lands just before each Host step, back to the deal; redo step by step gives the end back (${GAMES} games, seed ${SEED})`, () => {
  let steps = 0;
  for (let g = 0; g < GAMES; g++) {
    const seen = [];
    const { log, tag, dealt } = playGame(g, (l) => { seen[l.cursor] = json(l.room); }, { SEED, nightPicks: true });
    if (!dealt) continue;
    seen[0] = json(log.base);
    const end = json(log.room); const len = log.events.length; const visited = [];
    while (true) {
      const at = log.cursor; const label = log.undoStep();
      if (label === null) break;
      steps++;
      assert.ok(log.cursor < at, `${tag}: undo moved forward`);
      assert.ok(log.events[log.cursor].a.host, `${tag}: undo landed after a player event`);
      assert.equal(json(log.room), seen[log.cursor], `${tag}: undo to ${log.cursor} is not the room as it was`);
      assert.equal(typeof label, 'string'); assert.ok(label.length);
      visited.push(log.cursor);
    }
    assert.equal(log.room.phase, 'lobby', `${tag}: undo all the way stops in the lobby`);
    for (const i of visited.reverse().slice(1)) { assert.ok(log.redoStep() !== null); assert.equal(log.cursor, i, `${tag}: redo does not retrace undo`); }
    while (log.redoStep() !== null);
    assert.equal(log.cursor, len); assert.equal(json(log.room), end, `${tag}: redo to the end is not the same room`);
  }
  assert.ok(steps > GAMES * 10, `only ${steps} undo steps`);
});

test('after undo, a different move replaces what was undone and the old future is gone', () => {
  for (let g = 0; g < 10; g++) {
    const { log, tag, dealt } = playGame(g, () => {}, { SEED: SEED + 1 });
    if (!dealt) continue;
    const R = simRng(g + 99); const k = 1 + R.int(5);
    for (let i = 0; i < k; i++) log.undoStep();
    const before = log.events.length; const at = log.cursor;
    const p = log.room.players[0];
    const r = log.apply({ host: true }, { type: 'setNote', playerId: p.id, note: `changed ${g}` }, 1_900_000_000_000, [g, 1, 2, 3]);
    if (!r.kept) continue;
    assert.equal(log.canRedo(), false, tag); assert.equal(log.events.length, at + 1); assert.ok(before >= at);
    assert.equal(json(replay(log.base, log.events)), json(log.room), tag);
  }
});

test('the lobby has no undo; the end screen has undo only when UNDO_PAST_GAME_OVER', () => {
  const log = new GameLog(newRoom('LOBY', 'hk'));
  log.apply({ host: true }, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] }, 1, [1, 1, 1, 1]);
  assert.equal(log.undoStep(), null); assert.equal(log.history().canUndo, false);
  log.apply({ host: true }, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'] }, 2, [2, 2, 2, 2]);
  log.apply({ host: true }, { type: 'deal' }, 3, [3, 3, 3, 3]);
  log.apply({ host: true }, { type: 'startNight' }, 4, [4, 4, 4, 4]);
  log.apply({ host: true }, { type: 'declareWinner', side: 'town' }, 5, [5, 5, 5, 5]);
  assert.equal(log.room.phase, 'over');
  assert.equal(log.history({ pastOver: false }).canUndo, false);
  assert.deepEqual(log.history(), { canUndo: true, undoLabel: 'The winner', canRedo: false, redoLabel: '' });
  assert.equal(log.undoStep(), 'The winner'); assert.equal(log.room.phase, 'night'); assert.equal(log.room.winner, null);
  assert.equal(log.undoStep(), 'Start of the night'); assert.equal(log.room.phase, 'dealt');
  assert.equal(log.undoStep(), 'The deal'); assert.equal(log.room.phase, 'lobby');
  assert.ok(log.room.players.every((p) => p.roleId === null));
});

// ---------- the room, with three phones ----------
function fakeCtx(store = new Map()) {
  const sockets = [];
  return { store, sockets, ctx: {
    storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  } };
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const last = (ws, type) => ws.sent.filter((m) => m.type === type).at(-1);
const view = (ws) => last(ws, 'view')?.view;

// Five seats: two on their own phones (P0, P1), three on the host phone. Fixed roles so the night is known.
async function table(f = fakeCtx()) {
  const room = new Room(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'UNDOXX', hostKey: 'hk' }) }));
  const host = sock(), a = sock(), b = sock(); f.sockets.push(host, a, b);
  await send(room, host, { type: 'hello', hostKey: 'hk' });
  await send(room, a, { type: 'hello', join: 'Ann' }); await send(room, b, { type: 'hello', join: 'Ben' });
  await send(room, host, { type: 'addPlayers', names: ['Cy', 'Dee', 'Eve'] });
  await send(room, host, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'] });
  await send(room, host, { type: 'deal' });
  return { f, room, host, a, b, rev: () => last(host, 'view').rev };
}
const byRole = (room, id) => room.room.players.find((p) => p.roleId === id);
const killStep = (host) => view(host).script.find((s) => s.type === 'kill');

test('three phones: a night kill, Undo, Redo. Every phone follows; deaths and the morning report are rebuilt', async () => {
  const { room, host, a, b, rev } = await table();
  await send(room, host, { type: 'startNight' });
  const victim = room.room.players.find((p) => p.roleId === 'villager');
  const k = killStep(host).key;
  await send(room, host, { type: 'nightUi', ui: { n: 1, seq: 1, actions: { [k]: { targets: [victim.id] } }, picks: {} } });
  const nightRoom = json(room.room);
  await send(room, host, { type: 'submitNight', actions: { [k]: { targets: [victim.id] } }, n: 1 });
  const dayRoom = json(room.room);
  assert.equal(view(host).phase, 'day'); assert.equal(view(a).players.find((p) => p.id === victim.id).alive, false);
  assert.ok(last(host, 'view').hist.canUndo); assert.equal(last(host, 'view').hist.undoLabel, 'End of the night');

  await send(room, host, { type: 'undo', rev: rev() });
  assert.equal(json(room.room), nightRoom, 'undo gives back the night exactly');
  for (const ws of [host, a, b]) { assert.equal(view(ws).phase, 'night'); assert.equal(view(ws).players.find((p) => p.id === victim.id).alive, true); }
  assert.deepEqual(view(host).nightUi.actions, { [k]: { targets: [victim.id] } }, 'the night picks are back on the host phone');
  assert.equal(last(host, 'stepped').label, 'End of the night');
  assert.deepEqual([last(a, 'stepped'), last(b, 'stepped')].map((m) => m?.dir), ['undo', 'undo'], 'players are told the host went back');
  assert.ok(last(host, 'view').hist.canRedo); assert.equal(last(host, 'view').hist.redoLabel, 'End of the night');

  await send(room, host, { type: 'redo', rev: rev() });
  assert.equal(json(room.room), dayRoom, 'redo gives back the same morning: same deaths, same report');
  assert.equal(view(a).players.find((p) => p.id === victim.id).alive, false);
  assert.equal(last(a, 'stepped').dir, 'redo');
});

test('undo and redo need the current rev; a player cannot undo; a night pick undo is not announced to players', async () => {
  const { room, host, a, rev } = await table();
  await send(room, host, { type: 'startNight' });
  const r0 = rev();
  await send(room, host, { type: 'undo', rev: r0 - 1 });
  assert.equal(last(host, 'error').error, 'The game moved on. Showing the latest.'); assert.equal(room.room.phase, 'night');
  await send(room, host, { type: 'undo' });
  assert.equal(room.room.phase, 'night', 'no rev, no undo');
  await send(room, a, { type: 'undo', rev: r0 });
  assert.equal(last(a, 'error').error, 'Host only.'); assert.equal(room.room.phase, 'night');
  const k = killStep(host).key; const t = room.room.players.find((p) => p.roleId === 'villager');
  await send(room, host, { type: 'nightUi', ui: { n: 1, seq: 1, actions: { [k]: { targets: [t.id] } }, picks: {} } });
  const told = a.sent.filter((m) => m.type === 'stepped').length;
  await send(room, host, { type: 'undo', rev: rev() });
  assert.equal(last(host, 'stepped').label, 'A night pick'); assert.equal(view(host).nightUi, null);
  assert.equal(a.sent.filter((m) => m.type === 'stepped').length, told, 'nothing players can see changed, so no toast');
});

test('night picks survive a reload and a cold start; a late submit for an old night is refused', async () => {
  const f = fakeCtx(); const { room, host } = await table(f);
  await send(room, host, { type: 'startNight' });
  const k = killStep(host).key; const t = room.room.players.find((p) => p.roleId === 'villager');
  const ui = { n: 1, seq: 4, actions: { [k]: { targets: [t.id], flip: 'tails', bogus: 1 } }, picks: {}, opened: true };
  await send(room, host, { type: 'nightUi', ui });
  const again = new Room(f.ctx, {}); await again.ready;
  const h2 = sock(); f.sockets.push(h2); await send(again, h2, { type: 'hello', hostKey: 'hk' });
  assert.deepEqual(view(h2).nightUi.actions, { [k]: { targets: [t.id], flip: 'tails' } }, 'kept, cleaned, and the coin is not flipped again');
  assert.equal(view(h2).nightUi.opened, true);
  await send(again, h2, { type: 'submitNight', actions: {}, n: 1 });
  await send(again, h2, { type: 'noCondemn' }); await send(again, h2, { type: 'startNight' });
  await send(again, h2, { type: 'submitNight', actions: { [k]: { targets: [t.id] } }, n: 1 }); // phone B's night 1, late
  assert.equal(last(h2, 'error').error, 'That night is already over.');
  assert.equal(again.room.phase, 'night'); assert.equal(again.room.players.find((p) => p.id === t.id).alive, true);
});

test('undo past game over (on by default): the end screen goes, roles hide again on every phone, redo announces the end again', async () => {
  const { room, host, a, b, rev } = await table();
  await send(room, host, { type: 'startNight' }); await send(room, host, { type: 'submitNight', actions: {}, n: 1 });
  const town = room.room.players.filter((p) => p.roleId !== 'mafia');
  for (const p of town.slice(0, 3)) await send(room, host, { type: 'kill', playerId: p.id });
  assert.equal(room.room.phase, 'over');
  assert.ok(view(a).players.every((p) => p.role), 'roles show on the end screen');
  const overs = a.sent.filter((m) => m.type === 'gameOver').length;
  await send(room, host, { type: 'undo', rev: rev() });
  assert.equal(room.room.phase, 'day'); assert.equal(room.room.winner, null);
  for (const ws of [a, b]) { assert.equal(view(ws).winner, null); assert.ok(view(ws).players.filter((p) => p.id !== view(ws).me.id).every((p) => !p.role), 'other roles are hidden again'); }
  await send(room, host, { type: 'redo', rev: rev() });
  assert.equal(room.room.phase, 'over');
  assert.equal(a.sent.filter((m) => m.type === 'gameOver').length, overs + 1, 'the end is announced again');
});

test(`random interleavings of host moves, undo, redo and player moves on three phones converge (${Math.ceil(GAMES / 4)} runs)`, async () => {
  for (let g = 0; g < Math.ceil(GAMES / 4); g++) {
    const R = simRng(SEED * 31 + g);
    const f = fakeCtx(); const { room, host, a, b, rev } = await table(f);
    for (let s = 0; s < 80; s++) {
      const r = room.room; const roll = R.next();
      const alive = r.players.filter((p) => p.alive);
      if (roll < 0.18) await send(room, host, { type: 'undo', rev: R.chance(0.85) ? rev() : rev() - 1 });
      else if (roll < 0.3) await send(room, host, { type: 'redo', rev: rev() });
      else if (roll < 0.38) await send(room, R.pick([a, b]), { type: 'chat', channel: 'graveyard', text: 'hi' });
      else if (r.phase === 'dealt') await send(room, host, { type: 'startNight' });
      else if (r.phase === 'night') {
        const st = view(host).script.find((x) => x.type === 'kill');
        if (st && R.chance(0.6)) await send(room, host, { type: 'nightUi', ui: { n: r.night, seq: s, actions: { [st.key]: { targets: [R.pick(alive).id] } }, picks: {} } });
        else await send(room, host, { type: 'submitNight', actions: r.nightUi?.actions || {}, n: R.chance(0.9) ? r.night : r.night - 1 });
      } else if (r.phase === 'day') await send(room, host, R.chance(0.5) && r.condemnedDay !== r.day ? { type: 'condemn', playerId: R.pick(alive).id } : { type: 'startNight' });
      else if (r.phase === 'over') await send(room, host, R.chance(0.5) ? { type: 'undo', rev: rev() } : { type: 'playAgain' });
      else break;
      // every phone shows what the room would send it now
      const conn = room.connectedIds();
      for (const ws of [host, a, b]) {
        const want = messagesFor(room.room, ws.att, conn).find((m) => m.type === 'view').view;
        assert.equal(json(view(ws)), json(want), `run ${g} step ${s}: a phone is out of step`);
      }
    }
    // storage replays to the stored room, and a cold start picks up the same log
    const meta = f.store.get(KEY.meta); const events = [];
    for (let k = 0; k * meta.snapEvery < meta.len; k++) events.push(...f.store.get(KEY.chunk(k)));
    assert.equal(json(replay(f.store.get(KEY.base), events.slice(0, meta.cursor))), json(f.store.get('room')), `run ${g}: storage replay`);
    const again = new Room(f.ctx, {}); await again.ready;
    assert.equal(again.log.events.length, meta.len, `run ${g}: cold start kept the log`); assert.equal(again.log.cursor, meta.cursor);
  }
});

// P4 from the undo prototype (mafia-simplify-1030/undo-proto): change a past step, play on, and the room must equal a fresh
// game that plays the kept steps, the new one and the same continuation. On main this failed 300/300 because the dice came
// from crypto/Math.random outside the room; here every event carries its own seed, so nothing random lives outside the log.
test(`re-deciding a past step then playing on equals a fresh game played that way (${GAMES} games, seed ${SEED})`, () => {
  let changed = 0;
  for (let g = 0; g < GAMES; g++) {
    const { log, tag, dealt } = playGame(g, () => {}, { SEED, nightPicks: true });
    if (!dealt || log.events.length < 4) continue;
    const R = simRng(SEED * 7919 + g);
    const all = log.events.slice();
    const k = 1 + R.int(all.length - 2);
    const later = all[k + 1 + R.int(all.length - k - 1)];
    const alt = { a: later.a, m: later.m, t: all[k].t, e: [R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32)] };
    const cont = all.slice(k + 1);
    log.moveTo(k);
    const kept = log.apply(alt.a, alt.m, alt.t, alt.e);
    for (const ev of cont) log.apply(ev.a, ev.m, ev.t, ev.e);
    const fresh = new GameLog(log.base);
    for (const ev of all.slice(0, k)) fresh.apply(ev.a, ev.m, ev.t, ev.e);
    fresh.apply(alt.a, alt.m, alt.t, alt.e);
    for (const ev of cont) fresh.apply(ev.a, ev.m, ev.t, ev.e);
    if (kept.kept) changed++;
    assert.equal(json(log.room), json(fresh.room), `${tag}: re-decided at ${k} differs from a fresh game`);
    // a refused move keeps the Redo tail, so compare up to the cursor
    assert.equal(log.cursor, fresh.cursor, `${tag}: cursors differ`);
    assert.equal(json(log.events.slice(0, log.cursor)), json(fresh.events), `${tag}: event lists differ`);
    assert.equal(json(replay(log.base, log.events, 0, log.cursor)), json(log.room), `${tag}: replay differs`);
  }
  assert.ok(changed > 0);
});
