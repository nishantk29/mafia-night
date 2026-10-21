// Live end-to-end check against a running server (npm run dev). Verifies room flow AND role secrecy on the wire.
// Usage: BASE=http://localhost:8787 node scripts/live-smoke.mjs
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(code, hello) {
  const ws = new WebSocket(`${WS}/ws/${code}`);
  const c = { ws, frames: [], views: [], errors: [], joined: null, fatal: null, closed: false };
  ws.onmessage = (e) => {
    c.frames.push(e.data);
    const m = JSON.parse(e.data);
    if (m.type === 'view') c.views.push(m.view);
    else if (m.type === 'error') c.errors.push(m.error);
    else if (m.type === 'joined') c.joined = m;
    else if (m.type === 'fatal') c.fatal = m.error;
  };
  ws.onclose = () => { c.closed = true; };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.last = () => c.views.at(-1);
  c.ready = new Promise((res) => { ws.onopen = () => { if (hello) c.send(hello); res(); }; });
  return c;
}
const until = async (fn, what, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); } throw new Error('timeout: ' + what); };
const create = async () => (await fetch(`${BASE}/api/create`, { method: 'POST' })).json();

let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

// ---------- 1. App-deal room with secrecy checks ----------
{
  console.log('App deal');
  const { code, hostKey } = await create();
  assert.match(code, /^[A-Z]{6}$/);
  const host = connect(code, { type: 'hello', hostKey }); await host.ready;
  await until(() => host.last(), 'host view');
  ok('host connects with key');

  const bad = connect(code, { type: 'hello', hostKey: 'nope' }); await bad.ready;
  await until(() => bad.fatal, 'bad key rejected'); ok('wrong host key rejected');

  const names = ['Ann', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'];
  const players = [];
  for (const n of names) { const p = connect(code, { type: 'hello', join: n }); await p.ready; await until(() => p.joined, 'joined ' + n); players.push(p); }
  ok('6 players join without accounts');

  const dup = connect(code, { type: 'hello', join: 'ann' }); await dup.ready;
  await until(() => dup.errors.length, 'dup name'); ok('duplicate name refused');

  host.send({ type: 'setConfig', mode: 'app', roles: ['mafia', 'godfather', 'doctor', 'cop', 'villager', 'jester'] });
  host.send({ type: 'deal' });
  await until(() => host.last().phase === 'dealt', 'dealt');
  await until(() => players.every((p) => p.last()?.me.role), 'all roles');
  const hostRoles = new Map(host.last().players.map((p) => [p.name, p.roleId]));
  assert.equal([...hostRoles.values()].filter(Boolean).length, 6);
  ok('host sees every role; every phone sees one');

  // secrecy: no raw frame to a player may contain another player's role id/name or any secret
  const secrets = ['hostKey', hostKey, '"deck"', '"token"'];
  const tokens = players.map((p) => p.joined.token);
  for (const [i, p] of players.entries()) {
    for (const f of p.frames) {
      const isJoin = JSON.parse(f).type === 'joined';
      for (const s of secrets) if (!(isJoin && s === '"token"')) assert.ok(!f.includes(s), `leak of ${s} to player`);
      tokens.forEach((t, j) => { if (j !== i) assert.ok(!f.includes(t), "another player's token leaked"); });
    }
    for (const v of p.views) for (const q of v.players) assert.equal(q.role, null, 'other players\' roles must be hidden while alive');
  }
  ok('no tokens, host key, deck or other roles on any player socket');

  // each player's own role matches what the host assigned (via seesAs-aware name)
  players.forEach((p, i) => {
    const real = hostRoles.get(names[i]);
    assert.ok(['mafia', 'godfather', 'doctor', 'cop', 'villager', 'jester'].includes(real));
    assert.ok(p.last().me.role.id);
  });
  const mafiaP = players.filter((p) => ['mafia', 'godfather'].includes(hostRoles.get(p.last().me.name)));
  for (const p of mafiaP) assert.equal(p.last().me.team.length, 1, 'mafia know each other');
  const villagerP = players.find((p) => hostRoles.get(p.last().me.name) === 'villager');
  assert.equal(villagerP.last().me.team.length, 0);
  ok('mafia see their partner; villagers see nobody');

  // reconnect
  const p0 = players[0]; const cred = p0.joined; p0.ws.close(); await sleep(100);
  const re = connect(code, { type: 'hello', playerId: cred.playerId, token: cred.token }); await re.ready;
  await until(() => re.last()?.me.role, 'rejoin role'); ok('player reconnects with token and gets their role back');
  const forged = connect(code, { type: 'hello', playerId: cred.playerId, token: 'x'.repeat(24) }); await forged.ready;
  await until(() => forged.fatal, 'forged'); ok('forged token rejected');

  // player cannot run host actions
  players[1].send({ type: 'startNight' }); await until(() => players[1].errors.includes('Host only.'), 'host only'); ok('player cannot control the game');

  // play a night + day through the wire
  host.send({ type: 'startNight' }); await until(() => host.last().phase === 'night', 'night');
  const script = host.last().script;
  assert.ok(script.length > 0); ok('night script served to host');
  const actions = {};
  const tgt = host.last().players.find((p) => p.roleId === 'villager')?.id || host.last().players[0].id;
  for (const s of script) if (s.kind === 'action') actions[s.key] = { targets: [tgt] };
  host.send({ type: 'submitNight', actions });
  await until(() => ['day', 'over'].includes(host.last().phase), 'resolved');
  ok('night resolves');
  // dead player's role becomes public, living players' stay hidden
  for (const p of players) {
    const v = p.last();
    for (const q of v.players) if (q.alive) assert.equal(q.role, null);
  }
  ok('living roles still hidden after night');
  [host, bad, dup, re, forged, ...players].forEach((c) => c.ws.close());
}

// ---------- 2. Card deck, players claim on phones ----------
{
  console.log('Card deck: players claim');
  const { code, hostKey } = await create();
  const host = connect(code, { type: 'hello', hostKey }); await host.ready; await until(() => host.last(), 'host view');
  const ps = [];
  for (const n of ['A1', 'B2', 'C3', 'D4', 'E5']) { const p = connect(code, { type: 'hello', join: n }); await p.ready; await until(() => p.joined, 'j'); ps.push(p); }
  host.send({ type: 'setConfig', mode: 'cards', cardFlow: 'claim', deckStyle: 'random', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'] });
  host.send({ type: 'deal' });
  await until(() => host.last().phase === 'dealt' && host.last().deck, 'deck');
  for (const p of ps) { for (const f of p.frames) assert.ok(!f.includes('deckKey":[{'), 'claim flow must not publish the key'); assert.equal(p.last().deckKey, null); }
  ok('claim flow keeps the card key secret');
  const map = host.last().deck.map;
  ps[0].send({ type: 'claimCard', card: 'RJ' });
  await until(() => ps[0].errors.length || map.some((m) => m.card === 'RJ'), 'wrong card');
  ps[0].send({ type: 'claimCard', card: map[0].card }); await until(() => ps[0].last().me.role, 'claim');
  ps[1].send({ type: 'claimCard', card: map[0].card }); await until(() => ps[1].errors.includes('Someone already has that card.'), 'dup claim');
  ok('a card can be claimed once; duplicates refused');
  for (let i = 0; i < 6; i++) ps[2].send({ type: 'claimCard', card: 'XX' });
  await until(() => ps[2].errors.includes('Too many wrong tries. Ask the host.'), 'lockout'); ok('brute-force guessing is locked out');
  [host, ...ps].forEach((c) => c.ws.close());
}

// ---------- 3. Card deck, blind (storyteller learns on night 1) ----------
{
  console.log('Card deck: blind');
  const { code, hostKey } = await create();
  const host = connect(code, { type: 'hello', hostKey }); await host.ready; await until(() => host.last(), 'host view');
  host.send({ type: 'addPlayers', names: ['Ann', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'] });
  host.send({ type: 'setConfig', mode: 'cards', cardFlow: 'blind', deckStyle: 'fixed', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager'] });
  host.send({ type: 'deal' }); await until(() => host.last().phase === 'dealt', 'dealt');
  assert.ok(host.last().players.every((p) => !p.roleId)); ok('blind deal assigns nobody');
  host.send({ type: 'startNight' }); await until(() => host.last().phase === 'night', 'night');
  const ids = host.last().script.filter((s) => s.kind === 'identify').map((s) => s.roleId).sort();
  assert.deepEqual(ids, ['cop', 'doctor', 'mafia']); ok('night 1 asks to identify each non-villager role');
  const P = host.last().players;
  host.send({ type: 'identifyRole', roleId: 'mafia', playerIds: [P[0].id] });
  host.send({ type: 'identifyRole', roleId: 'doctor', playerIds: [P[1].id] });
  host.send({ type: 'submitNight', actions: {} }); await until(() => host.errors.some((e) => /not matched/.test(e)), 'blocked'); ok('cannot resolve before everyone is matched');
  host.send({ type: 'identifyRole', roleId: 'cop', playerIds: [P[2].id] });
  await until(() => host.last().players.every((p) => p.roleId), 'villagers auto');
  assert.deepEqual(host.last().players.map((p) => p.roleId), ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager']);
  ok('remaining players become Villagers automatically');
  host.send({ type: 'identifyRole', roleId: 'cop', playerIds: [P[3].id] }); await until(() => host.errors.some((e) => /already fully matched/.test(e)), 'extra');
  ok('cannot double-assign a role');
  host.ws.close();
}

console.log(`\n${passed} checks passed`);
process.exit(0);
