// The event log in the real Durable Object (src/worker.js) with a fake storage: it is written in chunks of
// SNAP_EVERY events next to `room`, a cold start picks it up, a stored room from before the log becomes the base,
// and a Host message sent against an old revision is refused instead of landing on a later step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { KEY, SNAP_EVERY, replay } from '../public/js/event-log.js';
import { newRoom } from '../public/js/room.js';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

function fakeCtx(store = new Map()) {
  const sockets = [];
  return { store, sockets, ctx: {
    storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  } };
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const lastView = (ws) => ws.sent.filter((m) => m.type === 'view').at(-1);

// The whole log as stored: base + every chunk, replayed.
function storedReplay(store) {
  const meta = store.get(KEY.meta); const events = [];
  for (let k = 0; k * meta.snapEvery < meta.len; k++) events.push(...store.get(KEY.chunk(k)));
  return { meta, events, room: replay(store.get(KEY.base), events.slice(0, meta.len)) };
}

async function hostedRoom(f) {
  const room = new Room(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'LOGDOX', hostKey: 'hk' }) }));
  const host = sock(); f.sockets.push(host); await send(room, host, { type: 'hello', hostKey: 'hk' });
  return { room, host };
}

test(`the DO writes the log in chunks of ${SNAP_EVERY}, with checkpoints, and replaying storage gives the stored room`, async () => {
  const f = fakeCtx(); const { room, host } = await hostedRoom(f);
  await send(room, host, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E', 'F'] });
  const ids = room.room.players.map((p) => p.id);
  for (let i = 0; i < 2 * SNAP_EVERY + 10; i++) await send(room, host, { type: 'toggleTag', playerId: ids[i % 6], tag: 'red' });
  const { meta, events, room: replayed } = storedReplay(f.store);
  assert.equal(meta.len, 2 * SNAP_EVERY + 11);
  assert.equal(events.length, meta.len);
  assert.ok(f.store.has(KEY.snap(1)) && f.store.has(KEY.snap(2)));
  assert.equal(JSON.stringify(replayed), JSON.stringify(f.store.get('room')));
  assert.equal(JSON.stringify(replay(f.store.get(KEY.snap(2)), events, 2 * SNAP_EVERY)), JSON.stringify(f.store.get('room')));
  for (const [k, v] of f.store) assert.ok(JSON.stringify(v).length < 1_000_000, `${k} is too big for one value`);
  assert.equal(lastView(host).rev, meta.rev);
});

test('a cold start (DO evicted) carries on the same log; a refresh sees the same room', async () => {
  const f = fakeCtx(); const { room, host } = await hostedRoom(f);
  await send(room, host, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
  for (let i = 0; i < 70; i++) await send(room, host, { type: 'setNote', playerId: room.room.players[i % 5].id, note: `n${i}` });
  const again = new Room(f.ctx, {}); await again.ready;
  assert.equal(again.log.events.length, 71); assert.equal(again.log.cursor, 71);
  const h2 = sock(); f.sockets.push(h2); await send(again, h2, { type: 'hello', hostKey: 'hk' });
  await send(again, h2, { type: 'toggleTag', playerId: again.room.players[0].id, tag: 'red' });
  const { meta, room: replayed } = storedReplay(f.store);
  assert.equal(meta.len, 72);
  assert.equal(JSON.stringify(replayed), JSON.stringify(f.store.get('room')));
});

test('a room stored before the log existed loads as the starting point and keeps working', async () => {
  const old = newRoom('OLDROM', 'hk'); old.updated = 123; old.players.push({ id: 'p1', name: 'Ann', token: 't', offline: true, roleId: null, card: null, alive: true, tags: [], note: '', wrongClaims: 0 });
  const f = fakeCtx(new Map([['room', old]]));
  const room = new Room(f.ctx, {}); await room.ready;
  assert.equal(room.log.events.length, 0);
  const host = sock(); f.sockets.push(host); await send(room, host, { type: 'hello', hostKey: 'hk' });
  await send(room, host, { type: 'toggleTag', playerId: 'p1', tag: 'red' });
  assert.deepEqual(f.store.get(KEY.base).players[0].tags, [], 'the base is the room as it was stored');
  const { room: replayed } = storedReplay(f.store);
  assert.equal(JSON.stringify(replayed), JSON.stringify(f.store.get('room')));
});

test('a log out of step with the room (an older build wrote the room after a rollback) starts again from the room', async () => {
  const f = fakeCtx(); const { room, host } = await hostedRoom(f);
  await send(room, host, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
  const r = f.store.get('room'); r.players[0].note = 'old build'; f.store.set('room', r); // what the old code would write
  const again = new Room(f.ctx, {}); await again.ready;
  assert.equal(again.log.events.length, 0);
  const h2 = sock(); f.sockets.push(h2); await send(again, h2, { type: 'hello', hostKey: 'hk' });
  await send(again, h2, { type: 'toggleTag', playerId: again.room.players[1].id, tag: 'red' });
  const { room: replayed } = storedReplay(f.store);
  assert.equal(replayed.players[0].note, 'old build');
  assert.equal(JSON.stringify(replayed), JSON.stringify(f.store.get('room')));
});

test('a Host message with an old rev is refused and changes nothing; no rev is not checked', async () => {
  const f = fakeCtx(); const { room, host } = await hostedRoom(f);
  await send(room, host, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
  const rev = lastView(host).rev; const id = room.room.players[0].id;
  await send(room, host, { type: 'toggleTag', playerId: id, tag: 'red', rev });
  assert.deepEqual(room.room.players[0].tags, ['red']);
  await send(room, host, { type: 'toggleTag', playerId: id, tag: 'red', rev }); // stale now
  assert.deepEqual(room.room.players[0].tags, ['red']);
  assert.equal(host.sent.filter((m) => m.type === 'error').at(-1).error, 'The game moved on. Showing the latest.');
  assert.ok(!('rev' in f.store.get(KEY.chunk(0)).at(-1).m), 'the rev is not part of the stored move');
  await send(room, host, { type: 'toggleTag', playerId: id, tag: 'red' });
  assert.deepEqual(room.room.players[0].tags, []);
});
