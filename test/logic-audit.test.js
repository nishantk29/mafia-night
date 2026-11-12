// Regression tests for the Mafia engine bugs found in the logic audit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNight, checkWin } from '../public/js/engine.js';
import { newRoom, reduce } from '../public/js/room.js';

const host = { host: true };
function mk(spec, phase = 'day') {
  const room = newRoom('TEST', 'hostkey-secret');
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    room.players.find((p) => p.name === name).roleId = roleId;
  }
  room.phase = phase; room.night = 1; room.day = 1;
  return room;
}
const id = (room, name) => room.players.find((p) => p.name === name).id;
const town = (n) => Array.from({ length: n }, (_, i) => [`V${i + 1}`, 'villager']);

describe('win check outside play', () => {
  test('kill / declareWinner / noCondemn are rejected in the lobby', () => {
    const room = mk([['A', null], ['B', null]], 'lobby');
    assert.ok(reduce(room, host, { type: 'kill', playerId: id(room, 'A') }).error);
    assert.ok(reduce(room, host, { type: 'declareWinner', side: 'town' }).error);
    assert.ok(reduce(room, host, { type: 'noCondemn' }).error);
    assert.equal(room.phase, 'lobby'); assert.equal(room.winner, null);
    assert.ok(room.players.every((p) => p.alive));
  });
  test('checkWin is null while any player has no role (blind night 1)', () => {
    const room = mk([['M', 'mafia'], ['A', null]], 'night');
    assert.equal(checkWin(room), null);
    room.players.find((p) => p.name === 'A').roleId = 'villager';
    assert.equal(checkWin(room)?.side, 'mafia');
  });
  test('kill still works during the day', () => {
    const room = mk([['M', 'mafia'], ...town(3)]);
    assert.ok(reduce(room, host, { type: 'kill', playerId: id(room, 'V1') }).ok);
    assert.equal(room.players.find((p) => p.name === 'V1').alive, false);
  });
});

describe('double condemn', () => {
  test('a second condemn the same day is rejected; allowed again next day', () => {
    const room = mk([['M', 'mafia'], ...town(5)]);
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'V1') }).ok);
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'V2') }).error);
    assert.ok(room.players.find((p) => p.name === 'V2').alive);
    assert.ok(reduce(room, host, { type: 'startNight' }).ok);
    resolveNight(room, {});
    assert.equal(room.phase, 'day');
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'V2') }).ok);
  });
});

describe('Executioner', () => {
  test('dead Executioner does not win when their target is condemned', () => {
    const room = mk([['M', 'mafia'], ['Ex', 'executioner'], ['T', 'villager'], ...town(3)]);
    room.players.find((p) => p.name === 'Ex').target = id(room, 'T');
    assert.ok(reduce(room, host, { type: 'kill', playerId: id(room, 'Ex') }).ok);
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'T') }).ok);
    assert.equal(room.sideWins.length, 0);
  });
  test('living Executioner still wins', () => {
    const room = mk([['M', 'mafia'], ['Ex', 'executioner'], ['T', 'villager'], ...town(3)]);
    room.players.find((p) => p.name === 'Ex').target = id(room, 'T');
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'T') }).ok);
    assert.equal(room.sideWins.length, 1);
  });
});

describe('Janitor single use', () => {
  const setup = () => mk([['M', 'mafia'], ['J', 'janitor'], ...town(5)], 'night');
  const jid = (room) => id(room, 'J');
  test('not spent when nothing was killed to clean', () => {
    const room = setup();
    resolveNight(room, { [`act:${jid(room)}`]: { on: true } });
    assert.equal(room.usage[jid(room)] || 0, 0);
  });
  test('spent when a Mafia victim is cleaned', () => {
    const room = setup();
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'V1')] }, [`act:${jid(room)}`]: { on: true } });
    assert.equal(room.usage[jid(room)], 1);
    assert.equal(room.players.find((p) => p.name === 'V1').roleHidden, true);
  });
});

describe('rule risks: Hunter, revive, stalemate', () => {
  test('Hunter lynched at 1 Mafia + 2 Town: no win until the shot resolves', () => {
    const room = mk([['M', 'mafia'], ['H', 'hunter'], ['V', 'villager']]);
    assert.ok(reduce(room, host, { type: 'condemn', playerId: id(room, 'H') }).ok);
    assert.equal(room.winner, null); assert.equal(room.phase, 'day');
    assert.equal(room.pending.length, 1);
    reduce(room, host, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: id(room, 'M') });
    assert.equal(room.winner.side, 'town');
  });
  test('Hunter shot that lets Mafia reach parity ends the game after the shot', () => {
    const room = mk([['M', 'mafia'], ['H', 'hunter'], ['V', 'villager'], ['W', 'villager']]);
    reduce(room, host, { type: 'condemn', playerId: id(room, 'H') });
    assert.equal(room.winner, null);
    reduce(room, host, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: id(room, 'V') });
    assert.equal(room.winner.side, 'mafia');
  });
  test('Hunter killed at night: day starts, win waits for the shot', () => {
    const room = mk([['M', 'mafia'], ['H', 'hunter'], ['V', 'villager']], 'night');
    reduce(room, host, { type: 'kill', playerId: id(room, 'H') });
    assert.equal(room.winner, null);
    reduce(room, host, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: null });
    assert.equal(room.winner.side, 'mafia');
  });
  test('revive: back in counts and win check; no double revive; none after game over', () => {
    const room = mk([['M', 'mafia'], ['V', 'villager'], ['W', 'villager'], ['X', 'villager']]);
    reduce(room, host, { type: 'kill', playerId: id(room, 'V') });
    assert.ok(reduce(room, host, { type: 'revive', playerId: id(room, 'V') }).ok);
    assert.ok(reduce(room, host, { type: 'revive', playerId: id(room, 'V') }).error);
    reduce(room, host, { type: 'kill', playerId: id(room, 'V') });
    reduce(room, host, { type: 'kill', playerId: id(room, 'W') });
    assert.equal(room.phase, 'over');
    assert.ok(reduce(room, host, { type: 'revive', playerId: id(room, 'W') }).error);
    assert.equal(room.winner.side, 'mafia');
  });
  test('revive drops a stale Hunter prompt', () => {
    const room = mk([['M', 'mafia'], ['H', 'hunter'], ['V', 'villager'], ['W', 'villager']]);
    reduce(room, host, { type: 'kill', playerId: id(room, 'H') });
    assert.equal(room.pending.length, 1);
    reduce(room, host, { type: 'revive', playerId: id(room, 'H') });
    assert.equal(room.pending.length, 0);
    assert.ok(room.players.find((p) => p.name === 'H').alive);
  });
  test('1 Mafia vs 1 Town ends at once; Host can declare in a no-winner position', () => {
    assert.equal(checkWin(mk([['M', 'mafia'], ['V', 'villager']])).side, 'mafia');
    const r2 = mk([['M', 'mafia'], ['K', 'killer'], ['V', 'villager']]);
    assert.equal(checkWin(r2), null);
    assert.ok(reduce(r2, host, { type: 'declareWinner', side: 'draw' }).ok);
    assert.equal(r2.phase, 'over');
  });
});

describe('Cult + Serial Killer stalemate: the Host decides (2026-10-23)', () => {
  test('detected only when the Cult and the Serial Killer are the only sides alive', async () => {
    const { stalemateOf } = await import('../public/js/engine.js');
    const room = mk([['Cu', 'cult'], ['Sk', 'killer'], ['V', 'villager']]);
    assert.equal(stalemateOf(room), null, 'a Villager is still alive');
    room.players.find((p) => p.name === 'V').alive = false;
    assert.equal(checkWin(room), null, 'no automatic winner');
    assert.deepEqual(stalemateOf(room).sides, ['cult', 'killer', 'draw']);
    room.phase = 'lobby';
    assert.equal(stalemateOf(room), null, 'not outside play');
  });
  test('host view carries it; players never see it; Host picks Cult, Serial Killer or Draw', async () => {
    const { viewForHost, viewForPlayer, gameOverEvent } = await import('../public/js/room.js');
    for (const side of ['cult', 'killer', 'draw']) {
      const room = mk([['Cu', 'cult'], ['Sk', 'killer'], ['V', 'villager']]);
      reduce(room, host, { type: 'kill', playerId: id(room, 'V') });
      assert.equal(room.phase, 'day');
      assert.ok(viewForHost(room).stalemate);
      assert.equal(viewForPlayer(room, id(room, 'Cu')).stalemate, undefined);
      assert.ok(reduce(room, host, { type: 'declareWinner', side }).ok);
      assert.equal(room.phase, 'over'); assert.equal(room.winner.side, side);
      assert.equal(viewForHost(room).stalemate, null);
      if (side === 'draw') assert.equal(gameOverEvent(room).theme, 'none');
    }
  });
});
