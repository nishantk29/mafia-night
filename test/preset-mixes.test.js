import test from 'node:test';
import assert from 'node:assert/strict';
import { MAFIA_PRESETS, mafiaPresetById, mafiaCount, misfitLine } from '../public/js/preset-mixes.js';
import { ROLES } from '../public/js/roles.js';
import { setupWarnings } from '../public/js/engine.js';
import { DEFAULT_PRESET_ID } from '../public/js/config-defaults.js';

const ids = new Set(ROLES.map((r) => r.id));
const MAFIA_SIDE = new Set(['mafia', 'godfather', 'hooker', 'framer', 'janitor']);

test('seven presets with the names exactly as drawn', () => {
  assert.deepEqual(MAFIA_PRESETS.map((p) => p.name), ['Speakeasy', 'Last Orders', 'Smoke and Mirrors', 'Tommy Gun Night', 'The Family Business', 'Hard Boiled', 'Blind Tiger']);
  assert.equal(mafiaPresetById(DEFAULT_PRESET_ID).name, 'Speakeasy');
  assert.ok(mafiaPresetById('blind-tiger').hiddenSetup);
});

test('every preset at every n in range is a valid engine setup', () => {
  for (const p of MAFIA_PRESETS) for (let n = p.min; n <= p.max; n++) {
    const roles = p.mix(n);
    assert.equal(roles.length, n, `${p.id} ${n}`);
    for (const r of roles) assert.ok(ids.has(r), `${p.id} ${n}: unknown role ${r}`);
    assert.equal(roles.filter((r) => MAFIA_SIDE.has(r)).length, mafiaCount(n), `${p.id} ${n}: Mafia count`);
    const errors = setupWarnings(roles, n).filter((w) => w.level === 'error');
    assert.deepEqual(errors, [], `${p.id} ${n}`);
  }
});

test('worked examples from the README', () => {
  const sort = (a) => [...a].sort();
  assert.deepEqual(sort(mafiaPresetById('speakeasy').mix(9)), sort(['mafia', 'mafia', 'doctor', 'detective', 'jester', 'villager', 'villager', 'villager', 'villager']));
  assert.deepEqual(sort(mafiaPresetById('family-business').mix(10)), sort(['godfather', 'hooker', 'janitor', 'doctor', 'detective', 'bodyguard', 'mason', 'mason', 'villager', 'villager']));
  assert.deepEqual(sort(mafiaPresetById('hard-boiled').mix(12)), sort(['godfather', 'hooker', 'framer', 'doctor', 'detective', 'tracker', 'lookout', 'veteran', 'jester', 'executioner', 'villager', 'villager']));
  assert.ok(!mafiaPresetById('speakeasy').mix(8).includes('jester'));
});

test('out of range presets explain themselves and never refuse to open', () => {
  const p = mafiaPresetById('hard-boiled');
  assert.match(misfitLine(p, 8), /Needs 12 or more players/);
  assert.equal(misfitLine(p, 12), '');
  assert.equal(p.mix(8).length, 8); // still produces a list, the page dims it but opens it
});
