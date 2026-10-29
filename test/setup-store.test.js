import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSetup, saveSetup, addSaved, renameSaved, deleteSaved, savedAsPreset, desiredRoles, stepProblem, seatingAuto, localDealConfig, defaultSetup, presetOf } from '../public/js/setup-store.js';
import { MAFIA_PRESETS } from '../public/js/preset-mixes.js';
import { OFFLINE_DEALS } from '../public/js/modes.js';
import { newRoom, reduce, advancedOf, viewForHost } from '../public/js/room.js';
import { buildDeckMap } from '../public/js/engine.js';

const mem = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), del: (k) => m.delete(k) }; };

test('setup state persists per room and restores the step', () => {
  const s = mem(); const st = { ...defaultSetup(), step: 2, seating: 'one' };
  saveSetup(s, 'ABCDEF', st); saveSetup(s, 'LOCAL', { ...defaultSetup(), step: 1 });
  assert.equal(loadSetup(s, 'ABCDEF').step, 2); assert.equal(loadSetup(s, 'ABCDEF').seating, 'one'); assert.equal(loadSetup(s, 'LOCAL', true).step, 1);
  assert.equal(loadSetup(s, 'NOPE').step, 0);
  assert.equal(loadSetup(mem(), 'X').presetId, 'speakeasy');
});

test('saved presets: add, rename, delete; fits only its own player count', () => {
  const r = addSaved([], '  Night   one ', ['mafia', 'doctor', 'villager'], { dayTimer: true });
  assert.equal(r.list[0].name, 'Night one'); assert.equal(r.list[0].advanced.dayTimer, true);
  assert.equal(renameSaved(r.list, r.id, 'Two')[0].name, 'Two'); assert.equal(renameSaved(r.list, r.id, '  ')[0].name, 'Night one');
  assert.equal(deleteSaved(r.list, r.id).length, 0);
  const p = savedAsPreset(r.list[0]); assert.deepEqual([p.min, p.max], [3, 3]);
});

test('no step can block: every problem names a fix, for every preset and count', () => {
  for (const local of [false, true]) for (const p of MAFIA_PRESETS) for (let n = 0; n <= 20; n++) {
    const st = { ...defaultSetup(), presetId: p.id, deal: 'own' };
    const roles = n >= 5 ? p.mix(n) : [];
    for (const key of local ? ['players', 'preset', 'cards'] : ['players', 'preset', 'seating', 'deal']) {
      const pr = stepProblem(key, { n, min: 5, roles, preset: presetOf(st, []), st, local });
      if (pr) { assert.ok(pr.reason.length > 0 && pr.fixes.length > 0, `${p.id} ${n} ${key}`); }
    }
  }
});

test('in-range presets deal cleanly; a preset in range has no step problem (host)', () => {
  for (const p of MAFIA_PRESETS) for (let n = p.min; n <= p.max; n++) {
    const st = { ...defaultSetup(), presetId: p.id };
    assert.equal(stepProblem('deal', { n, min: 5, roles: p.mix(n), preset: p, st, local: false }), null, `${p.id} ${n}`);
  }
});

test('desiredRoles follows the preset until the host customises', () => {
  const st = defaultSetup();
  assert.equal(desiredRoles(st, [], 9, 5).length, 9); assert.equal(desiredRoles(st, [], 4, 5), null);
  assert.equal(desiredRoles({ ...st, source: 'custom' }, [], 9, 5), null);
});

test('seating preselects from joins; offline deal config; own deck deals with the engine', () => {
  assert.equal(seatingAuto([{ offline: false }, { offline: false }]), 'own'); assert.equal(seatingAuto([{ offline: true }]), 'one'); assert.equal(seatingAuto([{ offline: true }, { offline: false }]), 'mixed');
  assert.deepEqual(OFFLINE_DEALS.map((o) => o.id), ['printable', 'own', 'pass']);
  const roles = MAFIA_PRESETS[0].mix(9);
  assert.equal(localDealConfig('own', roles).deckStyle, 'simple'); assert.equal(localDealConfig('own', ['mafia', 'framer']).deckStyle, 'fixed');
  const map = buildDeckMap(roles, 'simple'); assert.ok(map.some((m) => m.roleId === 'jester' && m.card === 'JH'));
  assert.equal(new Set(map.map((m) => m.card)).size, 9);
});

test('advanced settings: pinned at deal, old rooms get defaults, hidden setup stored', () => {
  const room = newRoom('ABCDEF', 'host');
  assert.deepEqual(advancedOf(room), { dayTimer: false, cardOnDeath: false, hiddenSetup: false, talkStep: true });
  for (let i = 0; i < 5; i++) reduce(room, { host: true }, { type: 'addPlayer', name: `P${i}` });
  reduce(room, { host: true }, { type: 'setConfig', roles: MAFIA_PRESETS[1].mix(5), advanced: { dayTimer: true, hiddenSetup: true }, rules: { revealOnDeath: false } });
  assert.equal(advancedOf(room).hiddenSetup, true); assert.equal(advancedOf(room).cardOnDeath, false);
  assert.equal(reduce(room, { host: true }, { type: 'deal' }).error, undefined);
  reduce(room, { host: true }, { type: 'setConfig', advanced: { dayTimer: false } }); // refused mid-game
  assert.equal(advancedOf(room).dayTimer, true); assert.equal(viewForHost(room, new Set()).advanced.dayTimer, true);
  const old = newRoom('OLDOLD', 'host'); delete old.config.advanced; assert.equal(advancedOf(old).dayTimer, false);
});
