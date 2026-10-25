// v6 rooms: the Godfather shows as a Villager to the Detective's exact-role check; the Cop still sees NOT MAFIA.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, checkCard, nightVersion } from '../public/js/engine.js';
import { ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

const HOST = { host: true }, ANON = { anon: true };
const SPEC = [['Mob', 'mafia'], ['God', 'godfather'], ['Doc', 'doctor'], ['Det', 'detective'], ['Cop', 'cop'], ['Jes', 'jester'], ['Kil', 'killer'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager']];
function mk(version, { phase = 'night', night = 2, spec = SPEC } = {}) {
  const room = newRoom('GD', 'hostkey');
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = true;
  }
  if (version === 1) delete room.nightVersion; else room.nightVersion = version;
  room.phase = phase; room.night = night; room.copSalt = 0.5;
  return room;
}
const stepOf = (room, roleId) => nightScript(room).find((s) => s.roleId === roleId);
function check(room, roleId, target) {
  const st = stepOf(room, roleId);
  const ans = { [st.key]: { targets: [`p${target}`], on: true } };
  const pv = previewNight(room, ans, st.key);
  const card = checkCard(room, st, pv);
  return { text: pv.text, card, rep: resolveNight(room, ans) };
}

describe('v6 Godfather vs Detective', () => {
  test('Detective sees the Godfather as a Villager', () => {
    const { text, card } = check(mk(6), 'detective', 'God');
    assert.equal(text, 'God is the Villager.');
    assert.equal(card.text, 'VILLAGER');
    assert.equal(card.kind, 'role');
  });
  test('every other target is exact', () => {
    for (const [name, roleId] of SPEC.filter(([, r]) => r !== 'godfather' && r !== 'detective')) {
      const { text, card } = check(mk(6), 'detective', name);
      assert.equal(text, `${name} is the ${ROLE_BY_ID[roleId].name}.`);
      assert.equal(card.text, ROLE_BY_ID[roleId].name.toUpperCase());
    }
  });
  test('Cop still sees the Godfather as NOT MAFIA, Mafia as MAFIA', () => {
    assert.equal(check(mk(6), 'cop', 'God').card.text, 'NOT MAFIA');
    assert.equal(check(mk(6), 'cop', 'Mob').card.text, 'MAFIA');
  });
  test('no investigate result in the report (night-only)', () => {
    const { rep } = check(mk(6), 'detective', 'God');
    assert.equal(rep.info.filter((i) => i.roleId === 'detective').length, 0);
  });
  test('v5 and v4 rooms are unchanged', () => {
    for (const v of [4, 5]) assert.equal(check(mk(v), 'detective', 'God').card.text, 'GODFATHER');
  });
  test('Consigliere still sees the Godfather', () => {
    const spec = [...SPEC, ['Con', 'consigliere']];
    assert.equal(check(mk(6, { spec }), 'consigliere', 'God').card.text, 'GODFATHER');
  });
});

describe('v6 versioning', () => {
  const up = (room) => reduce(room, HOST, { type: 'upgradeNight' });
  test('new rooms are v7', () => assert.equal(newRoom('X', 'k').nightVersion, 7));
  test('a v1 room upgrades to 7 at the next night and the Detective sees VILLAGER', () => {
    const room = mk(1, { phase: 'day', night: 1 });
    assert.ok(up(room).ok);
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    assert.equal(nightVersion(room), 7);
    assert.equal(check(room, 'detective', 'God').card.text, 'VILLAGER');
  });
  test('a v5 room can upgrade to 7', () => {
    const room = mk(5, { phase: 'day', night: 1 });
    assert.ok(up(room).ok);
    assert.equal(room.upgradeNext, 7);
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    assert.equal(nightVersion(room), 7);
  });
  test('a v7 room is already current', () => {
    assert.match(up(mk(7, { phase: 'day', night: 1 })).error, /Already using/);
  });
});
