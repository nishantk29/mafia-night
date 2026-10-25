// Host "End game": closes the room in the Durable Object, tells every socket, wipes storage and frees the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

function fakeRoom() {
  const store = new Map(); let alarm = null; const sockets = [];
  const ctx = {
    storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async (t) => { alarm = t; }, deleteAlarm: async () => { alarm = null; }, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  };
  return { room: new Room(ctx, {}), store, sockets, alarmSet: () => alarm };
}
const sock = (att) => { const s = { sent: [], closed: false, att, send(m) { this.sent.push(JSON.parse(m)); }, close() { this.closed = true; }, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } }; return s; };
const init = async (f) => { await f.room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', hostKey: 'hk' }) })); };

test('host ends the game: sockets told, storage wiped, code reusable', async () => {
  const f = fakeRoom(); await init(f);
  const host = sock({ who: 'host' }), p = sock({ who: 'player', playerId: 'x' }); f.sockets.push(host, p);
  await f.room.webSocketMessage(host, JSON.stringify({ type: 'endGame' }));
  for (const s of [host, p]) { assert.deepEqual(s.sent.at(-1), { type: 'closed', reason: 'ended' }); assert.ok(s.closed); }
  assert.equal(f.store.size, 0); assert.equal(f.alarmSet(), null);
  await f.room.webSocketClose(host); await f.room.webSocketError(); // late close events after the room is gone must not throw
  assert.equal((await f.room.fetch(new Request('https://room/exists'))).status, 404);
  assert.equal((await f.room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', hostKey: 'k2' }) }))).status, 200, 'code is free again');
});

test('a player cannot end the game', async () => {
  const f = fakeRoom(); await init(f);
  const p = sock({ who: 'player', playerId: 'x' }); f.sockets.push(p);
  await f.room.webSocketMessage(p, JSON.stringify({ type: 'endGame' }));
  assert.equal(p.sent.at(-1).type, 'error'); assert.ok(f.store.size > 0);
  assert.equal((await f.room.fetch(new Request('https://room/exists'))).status, 200);
});

test('rooms expire after inactivity: save schedules the alarm, the alarm closes the room', async () => {
  const f = fakeRoom(); await init(f);
  assert.ok(f.alarmSet() > Date.now() + 60 * 60 * 1000, 'expiry alarm is set on save');
  const p = sock({ who: 'player', playerId: 'x' }); f.sockets.push(p);
  await f.room.alarm();
  assert.deepEqual(p.sent.at(-1), { type: 'closed', reason: 'expired' }); assert.equal(f.store.size, 0);
  assert.equal((await f.room.fetch(new Request('https://room/exists'))).status, 404);
});
