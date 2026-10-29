import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMPLE_ROLES, simpleCounts, simpleRoleIds, countsOf, simpleDeckMap, simpleCardKey, deckFit, deckFitText, setupModeFrom } from '../public/js/simple.js';
import { buildDeckMap } from '../public/js/engine.js';
import { ROLE_BY_ID } from '../public/js/roles.js';

test('Simple has exactly four roles with the plain names', () => {
  assert.deepEqual(SIMPLE_ROLES.map((r) => r.name), ['Mafia', 'Doctor', 'Detective', 'Villager']);
  for (const r of SIMPLE_ROLES) assert.equal(ROLE_BY_ID[r.id].name, r.name);
});

test('suggested counts for 5-12 players add up and stay sensible', () => {
  for (let n = 5; n <= 12; n++) {
    const c = simpleCounts(n);
    assert.equal(c.mafia + c.doctor + c.detective + c.villager, n);
    assert.equal(c.doctor, 1); assert.equal(c.detective, 1);
    assert.ok(c.mafia >= 1 && c.mafia * 2 < n, `mafia ${c.mafia} of ${n}`);
    assert.equal(c.mafia, Math.max(1, Math.round(n / 4)));
    assert.equal(simpleRoleIds(c).length, n);
    assert.deepEqual(countsOf(simpleRoleIds(c)), c);
  }
});

test('card mapping uses Black Aces cards', () => {
  const m = Object.fromEntries(simpleDeckMap(['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager']).map((x, i) => [i, x.card]));
  assert.deepEqual(Object.values(m), ['AS', 'AC', 'KH', 'QH', '2S', '2H']);
  assert.equal(buildDeckMap(['mafia', 'doctor'], 'simple')[1].card, 'KH');
  assert.deepEqual(simpleCardKey(['mafia', 'mafia', 'detective']).map((k) => k.name), ['Mafia', 'Detective']);
});

test('a set that cannot fit one deck says so plainly', () => {
  assert.equal(deckFit(simpleRoleIds(simpleCounts(12))).ok, true);
  const big = ['doctor', 'doctor', 'doctor'];
  assert.equal(deckFit(big).ok, false);
  assert.match(deckFitText(big), /One deck can’t hold this set: 3 Doctor \(most is 2\)/);
  assert.equal(deckFitText(['mafia']), '');
});

test('?mode preselects Simple; cards also turns on playing cards; storage is remembered', () => {
  assert.deepEqual(setupModeFrom('?mode=simple', 'complex'), { mode: 'simple', cards: false });
  assert.deepEqual(setupModeFrom('?mode=cards', 'complex'), { mode: 'simple', cards: true });
  assert.deepEqual(setupModeFrom('', null), { mode: 'simple', cards: false });
  assert.deepEqual(setupModeFrom('', 'complex'), { mode: 'complex', cards: false });
  assert.deepEqual(setupModeFrom('?x=1', 'simple'), { mode: 'simple', cards: false });
});
