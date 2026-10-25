// The real Durable Object (src/worker.js) driven with a fake ctx and fake sockets: handshake, bad keys and tokens, join,
// reconnect mid-night, the Graveyard after reconnect, and the Restart broadcast.
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
const sock = (att = null) => ({ sent: [], closed: false, att, send(m) { this.sent.push(JSON.parse(m)); }, close() { this.closed = true; }, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (f, ws, msg) => f.room.webSocketMessage(ws, JSON.stringify(msg));
const view = (ws) => ws.sent.filter((m) => m.type === 'view').at(-1)?.view;
const gy = (ws) => ws.sent.filter((m) => m.type === 'graveyard').at(-1);

// A started 6-player app-mode room: host key 'hk', players p0..p5 with tokens t0..t5, everyone with a socket after hello.
async function setup({ phase = 'night' } = {}) {
  const f = fakeRoom();
  await f.room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', hostKey: 'hk' }) }));
  const r = f.room.room;
  r.config.roles = ['mafia', 'godfather', 'doctor', 'cop', 'villager', 'villager'];
  const host = sock(); f.sockets.push(host); await send(f, host, { type: 'hello', hostKey: 'hk' });
  const ps = [];
  for (let i = 0; i < 6; i++) { const w = sock(); f.sockets.push(w); await send(f, w, { type: 'hello', join: `P${i}` }); ps.push(w); }
  await send(f, host, { type: 'deal' });
  if (phase === 'night') await send(f, host, { type: 'startNight' });
  return { f, r, host, ps, id: (i) => r.players[i].id, tok: (i) => r.players[i].token };
}

test('hello with the host key gives the Host view; a wrong key is refused and closed', async () => {
  const { f, host, r } = await setup({ phase: 'dealt' });
  assert.equal(view(host).kind, 'host');
  assert.equal(view(host).code, 'ABCDEF');
  const bad = sock(); f.sockets.push(bad);
  await send(f, bad, { type: 'hello', hostKey: 'nope' });
  assert.deepEqual(bad.sent.map((m) => m.type), ['fatal']);
  assert.ok(bad.closed);
  assert.equal(bad.att, null);
  assert.ok(!JSON.stringify(bad.sent).includes(r.hostKey));
});

test('join: a new name gets an id and token, and the whole room is told; a taken name is an error', async () => {
  const f = fakeRoom();
  await f.room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDEF', hostKey: 'hk' }) }));
  const host = sock(), a = sock(), b = sock(); f.sockets.push(host, a, b);
  await send(f, host, { type: 'hello', hostKey: 'hk' });
  await send(f, a, { type: 'hello', join: 'Ann' });
  const joined = a.sent.find((m) => m.type === 'joined');
  assert.ok(joined.playerId && joined.token);
  assert.equal(view(host).players.length, 1);
  await send(f, b, { type: 'hello', join: 'ann' });
  assert.deepEqual(b.sent.map((m) => m.type), ['error']);
  assert.equal(f.room.room.players.length, 1);
});

test('hello with a player token reconnects; a bad token or unknown id is refused with clear:true', async () => {
  const { f, ps, id, tok } = await setup({ phase: 'dealt' });
  const back = sock(); f.sockets.push(back);
  await send(f, back, { type: 'hello', playerId: id(2), token: tok(2) });
  assert.equal(view(back).kind, 'player');
  assert.equal(view(back).me.id, id(2));
  assert.deepEqual(back.att, { who: 'player', playerId: id(2) });
  for (const hello of [{ playerId: id(2), token: 'wrong' }, { playerId: id(2), token: tok(3) }, { playerId: 'pNOPE', token: 'x' }]) {
    const w = sock(); f.sockets.push(w);
    await send(f, w, { type: 'hello', ...hello });
    assert.equal(w.sent[0].type, 'fatal'); assert.equal(w.sent[0].clear, true);
    assert.ok(w.closed); assert.equal(w.att, null);
    assert.ok(!view(w));
  }
  void ps;
});

test('an unauthenticated socket cannot act', async () => {
  const { f, r } = await setup({ phase: 'dealt' });
  const w = sock(); f.sockets.push(w);
  await send(f, w, { type: 'startNight' });
  assert.equal(r.phase, 'dealt');
  assert.deepEqual(w.sent, []);
});

test('reconnect mid-night: the player gets the night view with their own call name, never anyone else\'s role', async () => {
  const { f, r, host, id, tok } = await setup();
  assert.equal(r.phase, 'night');
  assert.ok(view(host).script.length > 0);
  for (let i = 0; i < 6; i++) {
    const w = sock(); f.sockets.push(w);
    await send(f, w, { type: 'hello', playerId: id(i), token: tok(i) });
    const v = view(w);
    assert.equal(v.phase, 'night'); assert.equal(v.me.id, id(i));
    assert.ok(v.me.role);
    assert.equal(v.players.filter((p) => p.id !== id(i) && p.role).length, 0);
    assert.ok(!('script' in v));
  }
  const h = sock(); f.sockets.push(h);
  await send(f, h, { type: 'hello', hostKey: 'hk' });
  assert.equal(view(h).phase, 'night'); assert.ok(view(h).script.length > 0);
});

test('a dropped socket shows the player offline; the reconnect shows them online', async () => {
  const { f, host, ps, id, tok } = await setup();
  const online = (i) => view(host).players.find((p) => p.id === id(i)).connected;
  assert.equal(online(1), true);
  f.sockets.splice(f.sockets.indexOf(ps[1]), 1);
  await f.room.webSocketClose(ps[1]);
  assert.equal(online(1), false);
  const back = sock(); f.sockets.push(back);
  await send(f, back, { type: 'hello', playerId: id(1), token: tok(1) });
  assert.equal(online(1), true);
});

test('Graveyard after reconnect: dead players and the Host get it, living players never do', async () => {
  const { f, r, host, id, tok } = await setup();
  r.phase = 'day'; r.day = 1;
  r.players[4].alive = false; r.players[5].alive = false;
  await send(f, host, { type: 'chat', channel: 'graveyard', text: 'Rest easy' });
  const connect = async (i) => { const w = sock(); f.sockets.push(w); await send(f, w, { type: 'hello', playerId: id(i), token: tok(i) }); return w; };
  for (const i of [4, 5]) { const w = await connect(i); assert.equal(gy(w).entries.at(-1).text, 'Rest easy'); }
  for (const i of [0, 1, 2, 3]) {
    const w = await connect(i);
    assert.ok(!gy(w), `living P${i} got the graveyard`);
    assert.ok(!JSON.stringify(w.sent).includes('Rest easy'));
  }
  const h = sock(); f.sockets.push(h); await send(f, h, { type: 'hello', hostKey: 'hk' });
  assert.equal(gy(h).entries.at(-1).text, 'Rest easy');
});

test('Restart reaches every socket with the new gameNo, the Graveyard is cleared for everyone', async () => {
  const { f, r, host, ps } = await setup();
  r.players[4].alive = false; r.graveyard = [{ id: 1, name: 'P4', text: 'old' }];
  assert.equal(view(host).gameNo, 1);
  for (const w of [host, ...ps]) w.sent.length = 0;
  await send(f, host, { type: 'restart' });
  for (const w of [host, ...ps]) {
    assert.equal(view(w).gameNo, 2, 'every socket sees game 2');
    assert.equal(view(w).phase, 'dealt');
  }
  assert.equal(r.nightVersion, 7);
  assert.ok(r.players.every((p) => p.alive));
  for (const w of [host, ...ps]) assert.ok(!JSON.stringify(w.sent).includes('old'));
  assert.equal(gy(host).entries.length, 0);
});

test('only the Host can restart; a player\'s restart is rejected and nothing changes', async () => {
  const { f, r, ps } = await setup();
  await send(f, ps[0], { type: 'restart' });
  assert.equal(ps[0].sent.at(-1).type, 'error');
  assert.equal(r.gameNo || 1, 1);
});
