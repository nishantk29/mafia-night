// v4 result card the Host shows the player after an investigation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, checkCard } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

function mk(spec, night, version = 4) {
  const room = newRoom('CC', 'hostkey');
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  room.nightVersion = version; room.phase = 'night'; room.night = night; room.copSalt = 0.5;
  return room;
}
const investigators = ROLES.filter((r) => r.action?.type === 'investigate' && !r.action.group);
const expectKind = (r) => (r.action.check === 'role' ? 'role' : r.action.check === 'parity' ? 'parity' : 'alignment');
const NAMES = ['Mob', 'Pat', 'Sam', 'Zed'];
const people = () => [['Mob', 'mafia'], ['Pat', 'villager'], ['Sam', 'villager'], ['Zed', 'investigator']];
const run = (roleId, alive, version = 4, targetName = 'Mob', flip = 'heads') => {
  const room = mk([['X', roleId, alive], ...people()], 2, version);
  const st = nightScript(room).find((s) => s.key === 'act:pX');
  const targets = st.targets === 2 ? [`p${targetName}`, 'pSam'] : [`p${targetName}`];
  const actions = { 'act:pX': { targets, on: true, flip, coin: 'mafia' } };
  const result = previewNight(room, actions, 'act:pX');
  return { room, st, result, card: checkCard(room, st, result) };
};

describe('checkCard', () => {
  for (const r of investigators) {
    test(`${r.id}: ${expectKind(r)} card, no names or digits`, () => {
      for (const target of ['Mob', 'Pat']) {
        const { card } = run(r.id, true, 4, target);
        assert.equal(card.kind, expectKind(r));
        assert.ok(card.text && card.text === card.text.toUpperCase() || card.kind === 'parity');
        assert.ok(!/\d/.test(card.text));
        for (const n of NAMES) assert.ok(!card.text.includes(n), card.text);
      }
    });
    test(`${r.id}: dead investigator gets NO ANSWER with the same shape`, () => {
      const live = run(r.id, true).card;
      const { card } = run(r.id, false);
      assert.deepEqual(card, { kind: 'none', text: 'NO ANSWER' });
      assert.deepEqual(Object.keys(card), Object.keys(live));
    });
    test(`${r.id}: v3 rooms get null`, () => {
      assert.equal(run(r.id, true, 3).card, null);
    });
  }
  test('role card is the role name in caps; alignment and parity texts', () => {
    assert.deepEqual(run('investigator', true, 4, 'Mob').card, { kind: 'role', text: 'MAFIA' });
    assert.deepEqual(run('cop', true, 4, 'Mob').card, { kind: 'alignment', text: 'MAFIA' });
    assert.deepEqual(run('cop', true, 4, 'Pat').card, { kind: 'alignment', text: 'NOT MAFIA' });
    assert.deepEqual(run('insane_cop', true, 4, 'Mob').card, { kind: 'alignment', text: 'NOT MAFIA' });
    assert.deepEqual(run('parity_cop', true, 4, 'Mob').card, { kind: 'parity', text: 'DIFFERENT' });
  });
  test('godfather reads as not Mafia to a Cop', () => {
    const room = mk([['X', 'cop'], ['G', 'godfather'], ['Mob', 'mafia'], ['Pat', 'villager']], 2);
    const st = nightScript(room).find((s) => s.key === 'act:pX');
    const res = previewNight(room, { 'act:pX': { targets: ['pG'], on: true } }, 'act:pX');
    assert.deepEqual(checkCard(room, st, res), { kind: 'alignment', text: 'NOT MAFIA' });
  });
  test('null for blocked, pending coin, non-investigate steps', () => {
    const { room, st } = run('cop', true);
    assert.equal(checkCard(room, st, null), null);
    assert.equal(checkCard(room, st, { text: '', blocked: true }), null);
    const doc = mk([['D', 'doctor'], ['Mob', 'mafia'], ['Pat', 'villager']], 2);
    assert.equal(checkCard(doc, nightScript(doc).find((s) => s.type === 'protect'), { text: 'x' }), null);
  });
});
