// Every role with an on-death / on-condemn trigger (Hunter, Lover, Tinkerer, Baker, Bleeder, Actress, Virgin, Poacher...),
// killed at night and condemned by day: no throw, the prompt appears, startNight waits for it, the win check still runs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, condemn } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';

const HOST = { host: true }, ANON = { anon: true };
const triggered = ROLES.filter((r) => r.onDeath || r.onCondemn);
const condemnOnly = ROLES.filter((r) => r.shield || r.sideWin === 'condemned');

// The Mafia is already dead, so once the role's prompt is settled the town has won. A Lover comes with a partner.
function scene(roleId, phase) {
  const spec = [['X', roleId], ...(roleId === 'lover' ? [['Y', 'lover']] : []), ['Vig', 'vigilante'], ['Mob', 'mafia', false], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager']];
  const room = newRoom('OD', 'hostkey');
  for (const [name, id, alive = true] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = id; p.alive = alive;
  }
  room.phase = phase; room.night = 2; room.day = phase === 'day' ? 2 : 1; room.copSalt = 0.5;
  return room;
}
const shoot = (room) => { const vig = nightScript(room).find((s) => s.roleId === 'vigilante'); return resolveNight(room, { [vig.key]: { targets: ['pX'], on: true } }); };
const prompts = (room) => room.pending.filter((x) => x.playerId === 'pX');

describe('on-death roles: killed at night', () => {
  for (const r of triggered) {
    test(`${r.id}: dies at night, prompt if the engine defines one, startNight blocked until resolved, win check runs`, () => {
      const room = scene(r.id, 'night');
      assert.doesNotThrow(() => shoot(room));
      const x = room.players.find((p) => p.id === 'pX');
      if (x.alive) { assert.fail(`${r.id} survived the Vigilante`); }
      assert.equal(prompts(room).length, r.onDeath ? 1 : 0, 'pending prompt only for onDeath at night');
      assert.doesNotThrow(() => viewForHost(room));
      if (room.pending.length) {
        assert.equal(room.winner, null, 'the win check waits for the prompt');
        room.phase = 'day';
        assert.match(reduce(room, HOST, { type: 'startNight' }).error, /pending/i);
        while (room.pending.length) assert.ok(reduce(room, HOST, { type: 'resolvePending', pendingId: room.pending[0].id }).ok);
      }
      const living = room.players.filter((p) => p.alive);
      assert.ok(living.every((p) => !['mafia'].includes(p.roleId)));
      assert.equal(room.winner?.side, 'town', 'win check ran after the prompt');
      assert.equal(room.phase, 'over');
    });
  }
});

describe('on-condemn roles: condemned by day', () => {
  for (const r of [...new Set([...triggered, ...condemnOnly])]) {
    test(`${r.id}: condemned by day, prompt if the engine defines one, startNight blocked until resolved, win check runs`, () => {
      const room = scene(r.id, 'day');
      let res;
      assert.doesNotThrow(() => { res = reduce(room, HOST, { type: 'condemn', playerId: 'pX' }); });
      assert.ok(res.ok);
      assert.equal(room.condemnedDay, room.day);
      assert.equal(prompts(room).length, r.onDeath || r.onCondemn ? 1 + (r.onDeath && r.onCondemn ? 1 : 0) : 0);
      assert.doesNotThrow(() => viewForHost(room));
      if (room.pending.length) {
        assert.equal(room.winner, null);
        assert.match(reduce(room, HOST, { type: 'startNight' }).error, /pending/i);
        while (room.pending.length) assert.ok(reduce(room, HOST, { type: 'resolvePending', pendingId: room.pending[0].id }).ok);
      }
      assert.equal(room.winner?.side, 'town');
      assert.equal(room.phase, 'over');
    });
  }
});

describe('on-death prompts: the Host picks a target', () => {
  test('a chosen target dies, is logged, and the win check runs once all prompts are done', () => {
    const room = scene('hunter', 'day');
    room.players.find((p) => p.id === 'pMob').alive = true; // one Mafia left, so the Hunter's shot decides the game
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pX' }).ok);
    assert.equal(room.pending.length, 1);
    assert.equal(room.winner, null);
    assert.ok(reduce(room, HOST, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: 'pMob' }).ok);
    assert.equal(room.players.find((p) => p.id === 'pMob').alive, false);
    assert.equal(room.winner.side, 'town');
  });
  test('the Lovers: both dying at once asks for each partner', () => {
    const room = scene('lover', 'day');
    condemn(room, 'pX');
    assert.equal(room.pending.length, 1);
    reduce(room, HOST, { type: 'kill', playerId: 'pY', cause: 'x' });
    assert.equal(room.pending.length, 2);
  });
  test('an unknown prompt id is rejected and changes nothing', () => {
    const room = scene('hunter', 'day'); condemn(room, 'pX');
    const before = JSON.stringify(room);
    assert.ok(reduce(room, HOST, { type: 'resolvePending', pendingId: 'nope' }).error);
    assert.equal(JSON.stringify(room), before);
  });
  test('the generic loops cover the roles the audit named', () => {
    for (const id of ['hunter', 'lover', 'tinkerer', 'baker', 'bleeder', 'actress', 'virgin', 'poacher']) assert.ok(triggered.some((r) => r.id === id), id);
  });
});
