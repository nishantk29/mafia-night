// Host "End game": closes the room in the Durable Object, tells every socket, wipes storage and frees the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

function fakeRoom() {
  const store = new Map(); const sockets = [];
  const ctx = {
    storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  };
  return { room: new Room(ctx, {}), store, sockets };
}
const sock = (att) => ({ sent: [], closed: false, att, send(m) { this.sent.push(JSON.parse(m)); }, close() { this.closed = true; }, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const say = (f, ws, text, channel = 'graveyard') => f.room.webSocketMessage(ws, JSON.stringify({ type: 'chat', channel, text }));
const gyOf = (ws) => ws.sent.filter((m) => m.type === 'graveyard').at(-1);

// host + A,B (living) + C,D (dead). `v` is the room's nightVersion (null = a v1 room).
async function setup(v = 3) {
  const f = fakeRoom();
  await f.room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', hostKey: 'hk' }) }));
  const r = f.room.room;
  if (v === null) delete r.nightVersion; else r.nightVersion = v;
  r.phase = 'day'; r.day = 1;
  const mk = (id, name, alive) => ({ id, name, token: 't' + id, alive, roleId: null, tags: [], wrongClaims: 0 });
  r.players = [mk('a', 'Ann', true), mk('b', 'Bob', true), mk('c', 'Cy', false), mk('d', 'Di', false)];
  const host = sock({ who: 'host' }), s = Object.fromEntries(r.players.map((p) => [p.id, sock({ who: 'player', playerId: p.id })]));
  f.sockets.push(host, ...Object.values(s));
  return { f, r, host, ...s };
}
const clear = (...ws) => ws.forEach((w) => { w.sent.length = 0; });

test('dead post reaches the dead and the Host; the living get nothing about it', async () => {
  const { f, host, a, b, c, d } = await setup();
  await say(f, c, '  Boo <b>there</b>\u0007  ');
  for (const w of [host, c, d]) assert.equal(gyOf(w).entries.at(-1).text, 'Boo <b>there</b>');
  assert.equal(gyOf(c).entries[0].name, 'Cy');
  for (const w of [a, b]) {
    assert.ok(w.sent.length > 0, 'living still get their normal view');
    const json = JSON.stringify(w.sent);
    assert.ok(!json.includes('Boo') && !json.includes('graveyard') && !json.includes('gy'), 'no graveyard text or field');
  }
  await f.room.webSocketMessage(host, JSON.stringify({ type: 'chat', channel: 'graveyard', text: 'From the Host' }));
  assert.equal(gyOf(d).entries.at(-1).name, 'Host');
  assert.ok(!JSON.stringify([a.sent, b.sent]).includes('From the Host'));
});

test('views never carry a graveyard key; living reconnect snapshot has none', async () => {
  const { f, a, c } = await setup();
  await say(f, c, 'secret chatter');
  const a2 = sock(null); f.sockets.push(a2);
  await f.room.webSocketMessage(a2, JSON.stringify({ type: 'hello', playerId: 'a', token: 'ta' }));
  assert.ok(a2.sent.length > 0);
  assert.ok(!JSON.stringify(a2.sent).includes('secret chatter') && !a2.sent.some((m) => m.type === 'graveyard'));
  for (const w of [a, c]) for (const m of w.sent) if (m.type === 'view') assert.ok(!('graveyard' in m.view));
  const c2 = sock(null); f.sockets.push(c2);
  await f.room.webSocketMessage(c2, JSON.stringify({ type: 'hello', playerId: 'c', token: 'tc' }));
  assert.equal(gyOf(c2).entries[0].text, 'secret chatter', 'a dead player reconnecting gets the history');
});

test('a player who dies gets the history; a revived player loses it', async () => {
  const { f, r, host, a, c } = await setup();
  await say(f, c, 'history line');
  clear(a);
  r.players[0].alive = false; f.room.broadcast(); // Ann dies
  assert.equal(gyOf(a).entries[0].text, 'history line');
  clear(a, c);
  r.players[0].alive = true; // revived by a role effect
  f.room.broadcast();
  assert.ok(a.sent.length > 0 && !a.sent.some((m) => m.type === 'graveyard') && !JSON.stringify(a.sent).includes('history line'));
  await say(f, c, 'after revive');
  assert.ok(!JSON.stringify(a.sent).includes('after revive'));
  assert.equal(gyOf(host).entries.at(-1).text, 'after revive');
});

test('game over: living players still never get the graveyard', async () => {
  const { f, r, a, c } = await setup();
  await say(f, c, 'over chatter'); clear(a);
  r.phase = 'over'; r.winner = { side: 'town', reason: 'test' }; f.room.broadcast(true);
  assert.ok(a.sent.some((m) => m.type === 'gameOver'));
  assert.ok(!JSON.stringify(a.sent).includes('over chatter') && !a.sent.some((m) => m.type === 'graveyard'));
});

test('rejections: living poster, wrong channel, empty, rate limit', async () => {
  const { f, r, a, c, host } = await setup();
  await say(f, a, 'let me in'); assert.equal(a.sent.at(-1).type, 'error');
  assert.ok(!r.graveyard?.length);
  await say(f, c, 'hello living', 'living'); assert.deepEqual(c.sent.at(-1), { type: 'error', error: 'The dead can’t speak to the living.' });
  await say(f, host, 'hi', 'living'); assert.equal(host.sent.at(-1).type, 'error');
  await say(f, c, '   \u0001 '); assert.equal(c.sent.at(-1).type, 'error');
  assert.ok(!r.graveyard?.length);
  for (let i = 0; i < 5; i++) await say(f, c, 'm' + i);
  await say(f, c, 'too many'); assert.equal(c.sent.at(-1).error, 'Slow down a little.');
  assert.equal(r.graveyard.length, 5);
  await say(f, host, 'host is a separate bucket'); assert.equal(r.graveyard.length, 6);
  await say(f, c, 'x'.repeat(5000)).catch(() => {}); // oversized frames are dropped before parsing
});

test('text is capped at 280 chars and history at the last 150', async () => {
  const { f, r, host } = await setup();
  await say(f, host, 'y'.repeat(400)); assert.equal(r.graveyard[0].text.length, 280);
  r.graveyard = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, from: 'host', name: 'Host', text: 'm' + i, at: 0 }));
  await say(f, host, 'newest'); assert.equal(r.graveyard.length, 150); assert.equal(r.graveyard.at(-1).text, 'newest'); assert.equal(r.graveyard[0].text, 'm1');
});

for (const [label, v] of [['v1', null], ['v2', 2]]) {
  test(`${label} rooms: chat rejected, no graveyard anywhere`, async () => {
    const { f, r, host, a, c } = await setup(v);
    await say(f, c, 'nope'); assert.equal(c.sent.at(-1).type, 'error');
    await say(f, host, 'nope'); assert.equal(host.sent.at(-1).type, 'error');
    f.room.broadcast();
    assert.ok(!('graveyard' in r));
    for (const w of [host, a, c]) { assert.ok(!w.sent.some((m) => m.type === 'graveyard')); for (const m of w.sent) if (m.type === 'view') assert.ok(!('graveyard' in m.view)); }
  });
}
