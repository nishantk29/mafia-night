// v3 night rules (graveyard): the Host's screens look the same whether the role holder is alive or dead.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, nightVersion, hasGraveyard, stepGesture, NEUTRAL_ANSWER } from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

function mk(spec, night, version = 3) {
  const room = newRoom('V3', 'hostkey'); room.nightVersion = 4; // pinned: v5 moves investigator results to the night check card (night-upgrade-v5.test.js)
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  room.nightVersion = version; room.phase = 'night'; room.night = night; room.copSalt = 0.5;
  return room;
}
const fillers = () => [['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager'], ['Ghost', 'villager', false]];
const norm = (room, steps) => {
  let json = JSON.stringify(steps);
  for (const p of room.players) json = json.split(p.id).join(`#${p.name}`);
  return JSON.parse(json);
};
const investigators = ROLES.filter((r) => ['investigate', 'track', 'watch', 'autopsy'].includes(r.action?.type) && !r.action.group);

describe('v3 basics', () => {
  test('new rooms are v4 (which includes v3); hasGraveyard only from v3', () => {
    assert.equal(nightVersion(newRoom("A", "k")), 8);
    assert.ok(hasGraveyard(newRoom('A', 'k')));
    assert.ok(!hasGraveyard({ nightVersion: 2 }) && !hasGraveyard({}));
  });
});

describe('dead investigators get a neutral non-answer', () => {
  for (const r of investigators) {
    test(`${r.id}: same neutral answer for any target, nothing recorded`, () => {
      const room = mk([['X', r.id, false], ['Mob', 'mafia'], ...fillers()], 2);
      const key = `act:${room.players[0].id}`;
      const before = JSON.stringify(room);
      const texts = new Set();
      for (const t of room.players.filter((p) => p.name !== 'X')) {
        const res = previewNight(room, { [key]: { targets: [t.id, room.players[1].id], coin: 'mafia', flip: 'heads' } }, key);
        assert.deepEqual(res, { text: NEUTRAL_ANSWER, note: '', neutral: true });
        texts.add(res.text);
      }
      assert.equal(texts.size, 1);
      assert.equal(JSON.stringify(room), before);
      assert.equal(room.lastReport, null);
    });
    test(`${r.id}: alive still gets the real result`, () => {
      const room = mk([['X', r.id, true], ['Mob', 'mafia'], ...fillers()], 2);
      const key = `act:${room.players[0].id}`;
      const res = previewNight(room, { [key]: { targets: [room.players[1].id, room.players[2].id], coin: 'mafia', flip: 'heads' } }, key);
      assert.ok(!res.neutral);
    });
  }
  test('dead Cop: gesture row has the same shape as a real result, and says the same for any target', () => {
    const dead = mk([['X', 'cop', false], ['Mob', 'mafia'], ...fillers()], 2);
    const live = mk([['X', 'cop', true], ['Mob', 'mafia'], ...fillers()], 2);
    const key = `act:${dead.players[0].id}`;
    const step = (room) => nightScript(room).find((s) => s.key === key);
    const g = stepGesture(step(dead), previewNight(dead, { [key]: { targets: [dead.players[1].id] } }, key));
    const g2 = stepGesture(step(dead), previewNight(dead, { [key]: { targets: [dead.players[2].id] } }, key));
    const gl = stepGesture(step(live), previewNight(live, { [key]: { targets: [live.players[1].id] } }, key));
    assert.deepEqual(g, g2);
    assert.deepEqual(Object.keys(g), Object.keys(gl));
    assert.equal(g.kind, gl.kind);
    assert.ok(!/mafia/i.test(g.text));
  });
  test('v2 rooms still show the real result for a dead Cop', () => {
    const room = mk([['X', 'cop', false], ['Mob', 'mafia'], ...fillers()], 2, 2);
    const key = `act:${room.players[0].id}`;
    assert.match(previewNight(room, { [key]: { targets: [room.players[1].id] } }, key).text, /Mob is MAFIA/);
  });
});

describe('v3 info and meeting calls are identical alive vs dead', () => {
  const infoRoles = ROLES.filter((r) => r.night1 || r.meeting);
  for (const r of infoRoles) {
    test(`${r.id}: night-1 steps do not change when a holder dies`, () => {
      for (const night of [1, 2]) {
        const spec = (aliveY) => [['X', r.id], ['Y', r.id, aliveY], ...(r.meeting === 'mafia' ? [] : [['Mob', 'mafia']]), ...fillers()];
        const a = mk(spec(true), night); const d = mk(spec(false), night);
        const sa = norm(a, nightScript(a)).filter((s) => s.roleId === r.id || s.key.startsWith('meeting') || s.key.startsWith('n1'));
        const sd = norm(d, nightScript(d)).filter((s) => s.roleId === r.id || s.key.startsWith('meeting') || s.key.startsWith('n1'));
        assert.deepEqual(sd, sa);
      }
    });
  }
  test('Masons list the dead mason too, and the call exists even if all are dead', () => {
    const room = mk([['A', 'mason'], ['B', 'mason', false], ['Mob', 'mafia'], ...fillers()], 1);
    const n1 = nightScript(room).find((s) => s.key === 'n1:mason');
    assert.deepEqual([...n1.actors].sort(), ['pA', 'pB']);
    room.players[0].alive = false;
    assert.deepEqual([...nightScript(room).find((s) => s.key === 'n1:mason').actors].sort(), ['pA', 'pB']);
  });
  test('v2 still lists only the living when some are alive', () => {
    const room = mk([['A', 'mason'], ['B', 'mason', false], ['Mob', 'mafia'], ...fillers()], 1, 2);
    assert.deepEqual(nightScript(room).find((s) => s.key === 'n1:mason').actors, ['pA']);
  });
});
