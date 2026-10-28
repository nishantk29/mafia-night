// v5 rooms (investigator results only at night) and the host's opt-in upgrade for legacy rooms (dead Doctor still called).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, checkCard, morningAnnouncement, condemn, nightVersion, hasNightOnlyChecks, stepCues } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';

const HOST = { host: true }, ANON = { anon: true };
const SPEC = [['Mob', 'mafia'], ['God', 'godfather'], ['Doc', 'doctor'], ['Det', 'detective'], ['Cop', 'cop'], ['Vig', 'vigilante'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager'], ['V4', 'villager']];
function mk(version, { phase = 'night', night = 2, hostKey = 'hostkey', spec = SPEC } = {}) {
  const room = newRoom('UP', hostKey);
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = true;
  }
  if (version === 1) delete room.nightVersion; else room.nightVersion = version;
  room.phase = phase; room.night = night; room.copSalt = 0.5;
  return room;
}
const shape = (room) => nightScript(room).map((s) => ({ key: s.key, kind: s.kind, type: s.type, cues: stepCues(s) }));
const docStep = (room) => nightScript(room).find((s) => s.roleId === 'doctor');
const pn = (room, name) => room.players.find((p) => p.name === name);

// Kills `name` at night (Vigilante shot), then returns the room at the start of the next night.
function dieAtNight(version, name) {
  const room = mk(version, { night: 1 });
  const vig = nightScript(room).find((s) => s.roleId === 'vigilante');
  resolveNight(room, { [vig.key]: { targets: [`p${name}`], on: true } });
  assert.equal(pn(room, name).alive, false);
  return room;
}
function dieByVote(version, name) {
  const room = mk(version, { phase: 'day', night: 1 });
  condemn(room, `p${name}`);
  assert.equal(pn(room, name).alive, false);
  return room;
}
const nextNight = (room) => { assert.ok(reduce(room, HOST, { type: 'startNight' }).ok); return room; };

describe('dead Doctor is still called at night', () => {
  for (const [how, die] of [['at night', dieAtNight], ['by day vote', dieByVote]]) {
    for (const v of [2, 3, 4, 5]) {
      test(`v${v}: Doctor dead ${how}: same act step as alive`, () => {
        const dead = nextNight(die(v, 'Doc'));
        const alive = nextNight(die(v, 'V1')); // someone else dies instead, Doctor alive
        const d = docStep(dead), a = docStep(alive);
        assert.ok(d && a);
        assert.equal(d.key, a.key);
        assert.deepEqual(shape(dead).map((s) => [s.key, s.type, s.cues]), shape(alive).map((s) => [s.key, s.type, s.cues]));
      });
    }
    test(`v1: Doctor dead ${how}: legacy rooms omit the Doctor (documents the cause)`, () => {
      const room = nextNight(die(1, 'Doc'));
      assert.equal(nightVersion(room), 1);
      assert.equal(docStep(room), undefined);
      assert.ok(docStep(nextNight(die(1, 'V1'))));
    });
  }
  test('v5: every night-acting role gives the same step list dead or alive', () => {
    const acting = ROLES.filter((r) => r.action && !r.action.group);
    for (const r of acting) {
      const spec = [['X', r.id], ...(r.meeting === 'mafia' ? [] : [['Mob', 'mafia']]), ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager'], ['Ghost', 'villager']];
      const live = mk(5, { spec }), dead = mk(5, { spec });
      pn(dead, 'X').alive = false;
      assert.deepEqual(shape(dead), shape(live), r.id);
    }
  });
});

describe('upgradeNight', () => {
  const up = (room, actor = HOST, a = {}) => reduce(room, actor, { type: 'upgradeNight', ...a });
  test('host only', () => {
    const room = mk(1, { phase: 'day', night: 1 });
    assert.ok(up(room, ANON).error);
    assert.ok(up(room, { playerId: 'pV1' }).error);
    assert.equal(room.upgradeNext, undefined);
    assert.ok(up(room).ok);
    assert.equal(room.upgradeNext, 9);
  });
  test('mid-night queues without changing the current script, applies at next night, dead Doctor is called', () => {
    const room = mk(1, { night: 1 });
    const before = JSON.stringify(nightScript(room));
    assert.ok(up(room).ok);
    assert.equal(JSON.stringify(nightScript(room)), before);
    assert.equal(nightVersion(room), 1);
    assert.deepEqual([viewForHost(room).nightVersion, viewForHost(room).upgradeNext], [1, 9]);
    const vig = nightScript(room).find((s) => s.roleId === 'vigilante');
    resolveNight(room, { [vig.key]: { targets: ['pDoc'], on: true } });
    assert.equal(pn(room, 'Doc').alive, false);
    assert.equal(nightVersion(room), 1);
    nextNight(room);
    assert.equal(nightVersion(room), 9);
    assert.equal(room.upgradeNext, undefined);
    assert.ok(docStep(room));
  });
  test('undo clears the queue; nothing changes', () => {
    const room = mk(1, { phase: 'day', night: 1 });
    up(room); assert.ok(up(room, HOST, { off: true }).ok);
    assert.equal(room.upgradeNext, undefined);
    nextNight(room); assert.equal(nightVersion(room), 1);
  });
  test('local games (hostKey local)', () => {
    const room = mk(1, { phase: 'day', night: 1, hostKey: 'local' });
    assert.ok(up(room).ok);
    nextNight(room);
    assert.equal(nightVersion(room), 9);
  });
  test('v9 room rejects', () => {
    const room = mk(9, { phase: 'day', night: 1 });
    assert.ok(up(room).error);
    assert.equal(room.upgradeNext, undefined);
    assert.equal(newRoom('X', 'k').nightVersion, 9);
  });
});

describe('v5: investigator results only at night', () => {
  const investigators = ROLES.filter((r) => r.action?.type === 'investigate' && !r.action.group);
  const run = (roleId, version) => {
    const spec = [['X', roleId], ['Mob', 'mafia'], ['Pat', 'villager'], ['Sam', 'villager'], ['Zed', 'villager']];
    const room = mk(version, { spec, night: 2 });
    const st = nightScript(room).find((s) => s.key === 'act:pX');
    const actions = { 'act:pX': { targets: st.targets === 2 ? ['pMob', 'pSam'] : ['pMob'], on: true, flip: 'heads', coin: 'mafia' } };
    const preview = previewNight(room, actions, 'act:pX');
    const rep = resolveNight(room, actions);
    return { room, st, preview, rep, text: preview.text };
  };
  for (const r of investigators) {
    test(`${r.id}: no result in morning, host view or phone; check card still answers`, () => {
      const { room, st, preview, rep, text } = run(r.id, 5);
      assert.ok(text && !preview.neutral);
      assert.ok(checkCard(room, st, preview), 'check card');
      assert.deepEqual(rep.info, []);
      const m = morningAnnouncement(room, rep);
      assert.ok(!m.notes.some((n) => n.includes(text)) && !m.say.includes(text));
      const hv = JSON.stringify(viewForHost(room));
      assert.ok(!hv.includes(text), 'host view');
      assert.deepEqual(viewForPlayer(room, 'pX').me.results, []);
      assert.ok(!JSON.stringify(viewForPlayer(room, 'pX')).includes(text));
    });
    test(`${r.id}: v4 still reports the result (unchanged)`, () => {
      const { room, rep, text } = run(r.id, 4);
      assert.ok(rep.info.some((i) => i.text === text));
      assert.ok(morningAnnouncement(room, rep).notes.some((n) => n.includes(text)));
      assert.ok(viewForPlayer(room, 'pX').me.results.some((x) => x.text === text));
    });
  }
  test('hasNightOnlyChecks', () => {
    assert.ok(hasNightOnlyChecks({ nightVersion: 5 }) && !hasNightOnlyChecks({ nightVersion: 4 }) && !hasNightOnlyChecks({}));
  });
});
