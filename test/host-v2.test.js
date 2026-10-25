// Pure helpers for the v2 host screens.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetById } from '../public/js/presets.js';
import { callNum, checkCaption, balanceSplit, declareSides } from '../public/js/host_v2.js';
import { ROLE_BY_ID, ROLES } from '../public/js/roles.js';
import { balanceOf, setupWarnings, MAX_PLAYERS, roleMax, nightScript, previewNight, checkCard } from '../public/js/engine.js';
import { newRoom, reduce } from '../public/js/room.js';

describe('presets', () => {
  for (const p of PRESETS) {
    test(`${p.name}: real role ids, sized to its name, no errors`, () => {
      assert.ok(p.roles.length >= 5 && p.roles.length <= MAX_PLAYERS);
      assert.ok(p.name.includes(String(p.roles.length)), 'the name carries the size');
      for (const id of p.roles) assert.ok(ROLE_BY_ID[id], id);
      const counts = {};
      for (const id of p.roles) counts[id] = (counts[id] || 0) + 1;
      for (const [id, n] of Object.entries(counts)) assert.ok(n <= roleMax(id), `${id} x${n}`);
      assert.deepEqual(setupWarnings(p.roles, p.roles.length).filter((w) => w.level === 'error'), []);
      assert.equal(balanceOf(p.roles).strength, 'even');
      assert.equal(presetById(p.id), p);
    });
  }
});

describe('declareSides', () => {
  test('only the sides in the game, draw last', () => {
    assert.deepEqual(declareSides(['mafia', 'doctor', 'villager']), ['town', 'mafia', 'draw']);
    assert.deepEqual(declareSides(['mafia', 'killer', 'villager']), ['town', 'mafia', 'killer', 'draw']);
    assert.deepEqual(declareSides(['mafia', 'cult', 'villager']), ['town', 'mafia', 'cult', 'draw']);
    assert.deepEqual(declareSides(['villager', 'jester']), ['town', 'draw']);
  });
  test('no roles known: every side', () => assert.deepEqual(declareSides([]), ['town', 'mafia', 'killer', 'cult', 'draw']));
  test('no side that the roles lack', () => {
    for (const p of PRESETS) {
      const sides = declareSides(p.roles);
      assert.equal(sides.includes('cult'), p.roles.some((id) => ROLE_BY_ID[id].faction === 'cult'));
      assert.equal(sides.at(-1), 'draw');
    }
  });
});

describe('balanceSplit', () => {
  test('counts town, mafia and neutral', () => {
    const b = balanceSplit(['mafia', 'godfather', 'cop', 'villager', 'jester', 'killer']);
    assert.deepEqual([b.town, b.mafia, b.neutral, b.total], [2, 2, 2, 6]);
    assert.deepEqual(b.pct, { town: 33, mafia: 33, neutral: 33 });
  });
  test('empty is all zero', () => assert.deepEqual(balanceSplit([]).pct, { town: 0, mafia: 0, neutral: 0 }));
});

describe('check-card caption', () => {
  test('names the call and the targets', () => {
    assert.equal(checkCaption('Cop 1', ['Ben']), 'Cop 1 checked Ben');
    assert.equal(checkCaption('Parity Cop', ['Ben', 'Sam']), 'Parity Cop checked Ben and Sam');
    assert.equal(checkCaption('Cop 1', []), '');
  });
  test('call numbers', () => { assert.equal(callNum('Cop 2'), 2); assert.equal(callNum('Detective'), null); assert.equal(callNum('Cop 12'), 12); });

  const investigators = ROLES.filter((r) => r.action?.type === 'investigate' && !r.action.group);
  test('the caption never holds the answer', () => {
    for (const r of investigators) {
      const room = newRoom('CC', 'hostkey');
      for (const [name, roleId] of [['X', r.id], ['Mob', 'mafia'], ['Pat', 'villager'], ['Sam', 'villager'], ['Zed', 'detective']]) {
        reduce(room, { anon: true }, { type: 'join', name }); const p = room.players.find((q) => q.name === name); p.id = `p${name}`; p.roleId = roleId; p.alive = true;
      }
      room.nightVersion = 4; room.phase = 'night'; room.night = 2; room.copSalt = 0.5;
      const st = nightScript(room).find((s) => s.key === 'act:pX');
      const targets = st.targets === 2 ? ['pMob', 'pSam'] : ['pMob'];
      const res = previewNight(room, { 'act:pX': { targets, on: true, flip: 'heads', coin: 'mafia' } }, 'act:pX');
      const card = checkCard(room, st, res);
      if (!card) continue;
      const cap = checkCaption(st.label || r.name, targets.map((id) => room.players.find((p) => p.id === id).name));
      assert.ok(cap.startsWith(`${st.label || r.name} checked `), cap);
      if (card.kind === 'role') assert.ok(!cap.toUpperCase().includes(card.text) || card.text === (st.label || r.name).toUpperCase(), `${r.id}: ${cap} vs ${card.text}`);
      if (card.kind === 'alignment') assert.ok(!cap.toUpperCase().includes('MAFIA'), cap);
    }
  });
});
