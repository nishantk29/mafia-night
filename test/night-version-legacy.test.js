// Rooms stored before the night-script version existed (no nightVersion) keep the legacy rules: dead roles are skipped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, nightVersion, resolveNight } from '../public/js/engine.js';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';

function mk(spec, night = 2) {
  const room = newRoom('LEG', 'hostkey');
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  room.phase = 'night'; room.night = night;
  return room;
}
const legacy = (room) => { delete room.nightVersion; return room; }; // what a room loaded from old storage looks like
const keys = (room) => nightScript(room).map((s) => s.key);

describe('legacy rooms (no nightVersion)', () => {
  test('newRoom sets version 4; a missing field reads as version 1 and is not backfilled', () => {
    assert.equal(newRoom('A', 'k').nightVersion, 6);
    const room = legacy(newRoom('A', 'k'));
    assert.equal(nightVersion(room), 1);
    assert.equal('nightVersion' in room, false);
    assert.equal('nightVersion' in JSON.parse(JSON.stringify(room)), false);
  });

  test('dead Doctor is not called', () => {
    const room = legacy(mk([['Doc', 'doctor', false], ['Cop', 'cop'], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager']]));
    assert.deepEqual(keys(room), ['meeting:mafia', 'act:pCop']);
  });

  test('dead Cop is not called, and the other Cop is not numbered', () => {
    const room = legacy(mk([['Cop', 'cop', false], ['Cop2', 'cop'], ['Mob', 'mafia'], ['V0', 'villager']]));
    const steps = nightScript(room);
    assert.deepEqual(steps.map((s) => s.key), ['meeting:mafia', 'act:pCop2']);
    assert.equal(steps[1].prompt, 'Cop, wake up. Who do you check?');
  });

  test('a Mafia meeting with every member dead is skipped; night-1 info for a dead Mason is skipped', () => {
    assert.deepEqual(keys(legacy(mk([['M', 'mafia', false], ['V0', 'villager'], ['V1', 'villager']]))), []);
    assert.ok(!keys(legacy(mk([['Ma', 'mason', false], ['Mb', 'mason', false], ['V0', 'villager']], 1))).includes('n1:mason'));
  });

  test('legacy resolution is unchanged: a dead Doctor is never in the script, so a save does nothing', () => {
    const room = legacy(mk([['Doc', 'doctor', false], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager']]));
    const rep = resolveNight(room, { 'meeting:mafia': { targets: ['pV0'] }, 'act:pDoc': { targets: ['pV0'] } });
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pV0']);
  });

  test('the host view of a legacy room carries the legacy script and version 1', () => {
    const room = legacy(mk([['Doc', 'doctor', false], ['Cop', 'cop'], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager']]));
    const v = viewForHost(room);
    assert.equal(v.nightVersion, 1);
    assert.deepEqual(v.script.map((s) => s.key), ['meeting:mafia', 'act:pCop']);
    assert.equal(JSON.stringify(room).includes('nightVersion'), false); // viewing does not backfill
    // the same room as a v2 room does call the dead Doctor
    const fresh = mk([['Doc', 'doctor', false], ['Cop', 'cop'], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager']]);
    assert.ok(viewForHost(fresh).script.some((s) => s.key === 'act:pDoc'));
  });
});
