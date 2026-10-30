// Engine PR D: the host tools that could leave a game wrong (audit M2, M3, M7, M8, M10, M11) and the Graveyard
// rate limit, which lived outside the room and so did not survive a cold start or a replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { KEY, replay } from '../public/js/event-log.js';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

const json = (x) => JSON.stringify(x);
function fakeCtx(store = new Map()) {
  const sockets = []; const f = { store, sockets, failPuts: 0 };
  f.ctx = {
    storage: {
      get: async (k) => structuredClone(store.get(k)),
      put: async (k, v) => { if (f.failPuts > 0) { f.failPuts--; throw new Error('storage is down'); } store.set(k, structuredClone(v)); },
      setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); },
    },
    blockConcurrencyWhile: (fn) => fn(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  };
  return f;
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const last = (ws, type) => ws.sent.filter((m) => m.type === type).at(-1);
const lastErr = (ws) => last(ws, 'error')?.error;

// Five seats: Ann and Ben on their own phones, three on the host phone. Fixed roles.
async function table(f = fakeCtx(), roles = ['mafia', 'doctor', 'villager', 'villager', 'villager']) {
  const room = new Room(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'FIXDDD', hostKey: 'hk' }) }));
  const host = sock(), a = sock(), b = sock(); f.sockets.push(host, a, b);
  await send(room, host, { type: 'hello', hostKey: 'hk' });
  await send(room, a, { type: 'hello', join: 'Ann' }); await send(room, b, { type: 'hello', join: 'Ben' });
  await send(room, host, { type: 'addPlayers', names: ['Cy', 'Dee', 'Eve'] });
  await send(room, host, { type: 'setConfig', mode: 'app', roles });
  await send(room, host, { type: 'deal' });
  const rev = () => last(host, 'view').rev;
  const H = async (msg) => { const n = host.sent.length; await send(room, host, { ...msg, rev: rev() }); return host.sent.slice(n).find((m) => m.type === 'error')?.error || null; };
  return { f, room, host, a, b, rev, H, pid: (name) => room.room.players.find((p) => p.name === name).id };
}
const coldStart = async (f) => { const r = new Room(f.ctx, {}); await r.ready; return r; };
const fullReplay = (room) => json(replay(room.log.base, room.log.events.slice(0, room.log.cursor)));

// ---------- Graveyard rate limit ----------
const say = (room, ws, text) => send(room, ws, { type: 'chat', channel: 'graveyard', text });
async function deadAnn() {
  const t = await table();
  await t.H({ type: 'startNight' });
  assert.equal(await t.H({ type: 'kill', playerId: t.pid('Ann'), cause: 'test' }), null);
  return t;
}

test('Graveyard: five posts in ten seconds, then "Slow down", and the limit still holds after a cold start', async () => {
  const { f, room, a, H, pid } = await deadAnn();
  for (let i = 0; i < 3; i++) await say(room, a, 'm' + i);
  for (let i = 0; i < 70; i++) await H({ type: 'setNote', playerId: pid('Cy'), note: 'n' + i }); // a checkpoint lands inside the burst
  for (let i = 3; i < 5; i++) await say(room, a, 'm' + i);
  assert.equal(room.room.graveyard.length, 5);
  await say(room, a, 'six'); assert.equal(lastErr(a), 'Slow down a little.');
  const again = await coldStart(f); // the DO was evicted inside the burst: it rebuilds the room from that checkpoint
  assert.equal(again.log.events.length, room.log.events.length, 'the cold start kept the log');
  await say(again, a, 'six again');
  assert.equal(again.room.graveyard.length, 5, 'a cold start must not reset the limit');
  assert.equal(lastErr(a), 'Slow down a little.');
});

test('Graveyard: Undo and Redo inside a burst keep the limit, and a full replay from the start gives the live room', async () => {
  const { room, a, H, pid } = await deadAnn();
  for (let i = 0; i < 3; i++) await say(room, a, 'early' + i);
  for (let i = 0; i < 70; i++) await H({ type: 'setNote', playerId: pid('Cy'), note: 'n' + i }); // past a checkpoint
  for (let i = 0; i < 2; i++) await say(room, a, 'late' + i);
  assert.equal(await H({ type: 'undo' }), null); assert.equal(await H({ type: 'redo' }), null);
  await say(room, a, 'one too many');
  assert.equal(room.room.graveyard.filter((m) => m.from === pid('Ann')).length, 5, 'the room is rebuilt from a checkpoint, and the posts before it still count');
  assert.equal(fullReplay(room), json(room.room), 'a replay from the start must give the live room');
});

test('Graveyard: the limit is per sender and frees up after ten seconds', async () => {
  const { room, a, host } = await deadAnn();
  const real = Date.now; let now = real();
  Date.now = () => now;
  try {
    for (let i = 0; i < 5; i++) await say(room, a, 'm' + i);
    await say(room, host, 'the Host is a separate sender'); assert.equal(room.room.graveyard.length, 6);
    now += 10_001;
    await say(room, a, 'later'); assert.equal(room.room.graveyard.length, 7);
  } finally { Date.now = real; }
});

// ---------- M2: a wrong kill that ends the game can be taken back ----------
test('M2: a wrong host kill that ends the game is undone from the end screen; the game goes on', async () => {
  const { room, H } = await table();
  await H({ type: 'startNight' });
  const before = json(room.room);
  const boss = room.room.players.find((p) => p.roleId === 'mafia');
  assert.equal(await H({ type: 'kill', playerId: boss.id, cause: 'wrong tap' }), null);
  assert.equal(room.room.phase, 'over'); assert.equal(room.room.winner.side, 'town');
  assert.equal(await H({ type: 'undo' }), null);
  assert.equal(json(room.room), before, 'Undo gives back the night exactly');
  assert.equal(room.room.players.find((p) => p.id === boss.id).alive, true);
  assert.equal(await H({ type: 'redo' }), null); assert.equal(room.room.phase, 'over');
});

// ---------- M3: revive takes the death out of the morning report ----------
test('M3: revive after a night kill drops the death from the morning report and the read-aloud', async () => {
  const { room, host, H } = await table();
  await H({ type: 'startNight' });
  const victim = room.room.players.find((p) => p.roleId === 'villager');
  const k = last(host, 'view').view.script.find((s) => s.type === 'kill').key;
  assert.equal(await H({ type: 'submitNight', actions: { [k]: { targets: [victim.id] } }, n: 1 }), null);
  assert.deepEqual(room.room.lastReport.deaths.map((d) => d.id), [victim.id]);
  assert.equal(await H({ type: 'revive', playerId: victim.id }), null);
  assert.deepEqual(room.room.lastReport.deaths, []);
  const v = last(host, 'view').view;
  assert.ok(!v.report.deaths.length);
  if (v.story?.morning) assert.ok(!v.story.morning.say.includes(victim.name), 'the read-aloud no longer names them');
  assert.equal(fullReplay(room), json(room.room));
});

// ---------- M7: kill on a dead player ----------
test('M7: killing a player who is already dead is refused and changes nothing', async () => {
  const { room, H, rev } = await table();
  await H({ type: 'startNight' });
  const v = room.room.players.find((p) => p.roleId === 'villager');
  await H({ type: 'kill', playerId: v.id, cause: 'x' });
  const r0 = rev(), room0 = json(room.room);
  assert.equal(await H({ type: 'kill', playerId: v.id, cause: 'again' }), `${v.name} is already dead.`);
  assert.equal(rev(), r0); assert.equal(json(room.room), room0);
});

// ---------- M8: setRole and setTarget ----------
test('M8: correcting the last Mafia to a Villager ends the game at once', async () => {
  const { room, H } = await table();
  await H({ type: 'startNight' });
  const boss = room.room.players.find((p) => p.roleId === 'mafia');
  assert.equal(await H({ type: 'setRole', playerId: boss.id, roleId: 'villager' }), null);
  assert.equal(room.room.phase, 'over'); assert.equal(room.room.winner.side, 'town');
  assert.equal(await H({ type: 'undo' }), null); assert.equal(room.room.phase, 'night');
});

test('M8: after game over, setRole and setTarget are refused; setTarget takes only another player in the room', async () => {
  const { room, H, pid } = await table(fakeCtx(), ['mafia', 'executioner', 'villager', 'villager', 'villager']);
  await H({ type: 'startNight' });
  const ex = room.room.players.find((p) => p.roleId === 'executioner');
  const other = room.room.players.find((p) => p.id !== ex.id && p.roleId === 'villager');
  assert.equal(await H({ type: 'setTarget', playerId: ex.id, targetId: 'nobody' }), 'Bad target.');
  assert.equal(await H({ type: 'setTarget', playerId: ex.id, targetId: ex.id }), 'Bad target.');
  assert.equal(await H({ type: 'setTarget', playerId: ex.id, targetId: other.id }), null);
  assert.equal(room.room.players.find((p) => p.id === ex.id).target, other.id);
  const boss = room.room.players.find((p) => p.roleId === 'mafia');
  await H({ type: 'kill', playerId: boss.id, cause: 'x' });
  assert.equal(room.room.phase, 'over');
  const over = json(room.room);
  assert.match(await H({ type: 'setRole', playerId: pid('Cy'), roleId: 'mafia' }), /game is over/);
  assert.match(await H({ type: 'setTarget', playerId: ex.id, targetId: null }), /game is over/);
  assert.equal(json(room.room), over);
});

// ---------- M10: day abilities only in the day ----------
test('M10: a day ability can only be marked used in the day', async () => {
  const { room, H, pid } = await table();
  assert.equal(await H({ type: 'useDay', playerId: pid('Cy') }), 'Day abilities are used in the day.');
  await H({ type: 'startNight' });
  assert.equal(await H({ type: 'useDay', playerId: pid('Cy') }), 'Day abilities are used in the day.');
  assert.deepEqual(room.room.dayUsed, {});
});

// ---------- M11: a move storage would not keep is taken back ----------
test('M11: when storage refuses a move twice, the room goes back to the saved one, the Host is told and every phone follows', async () => {
  const f = fakeCtx(); const { room, host, a, H, pid } = await table(f);
  await H({ type: 'setNote', playerId: pid('Cy'), note: 'kept' });
  const saved = json(f.store.get('room'));
  f.failPuts = 1e9;
  await H({ type: 'setNote', playerId: pid('Cy'), note: 'lost' });
  f.failPuts = 0;
  assert.equal(lastErr(host), 'That move could not be saved. Try it again.');
  assert.equal(json(room.room), saved, 'the live room is the saved room');
  assert.equal(last(host, 'view').view.players.find((p) => p.id === pid('Cy')).note, 'kept', 'the Host phone shows the saved note');
  assert.ok(last(a, 'view'), 'the players got the saved room too');
  assert.equal(fullReplay(room), json(room.room), 'the log matches the room');
  assert.equal(await H({ type: 'setNote', playerId: pid('Cy'), note: 'again' }), null, 'the next move saves as normal');
  const again = await coldStart(f);
  assert.equal(again.room.players.find((p) => p.id === pid('Cy')).note, 'again');
  assert.equal(again.log.events.length, room.log.events.length, 'a cold start keeps the same log');
});

test('M11: a failed save on Undo is taken back too', async () => {
  const f = fakeCtx(); const { room, host, H, pid } = await table(f);
  await H({ type: 'setNote', playerId: pid('Cy'), note: 'kept' });
  const saved = json(room.room);
  f.failPuts = 1e9; await H({ type: 'undo' }); f.failPuts = 0;
  assert.equal(lastErr(host), 'That move could not be saved. Try it again.');
  assert.equal(json(room.room), saved);
  assert.ok(last(host, 'view').hist.canUndo);
});

test('a room whose first save fails is not handed out', async () => {
  const f = fakeCtx(); f.failPuts = 1e9;
  const room = new Room(f.ctx, {}); await room.ready;
  const res = await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'NOSAVE', hostKey: 'hk' }) }));
  assert.equal(res.status, 503); assert.equal(room.room, null);
});
