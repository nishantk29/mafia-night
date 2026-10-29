import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY, ownDeckFor } from '../public/js/deck-key.js';
import { MAFIA_PRESETS } from '../public/js/preset-mixes.js';

test('no card is used for two roles', () => {
  const all = Object.values(KEY).flat();
  assert.equal(new Set(all).size, all.length);
  assert.equal(KEY.hooker[0], 'Q♠'); assert.equal(KEY.godfather[0], 'Q♣'); assert.equal(KEY.jester[0], 'J♥');
  assert.equal(KEY.killer[0], 'J♦'); assert.equal(KEY.bodyguard[0], 'A♥'); assert.equal(KEY.vigilante[0], 'A♦');
});

test('every preset at every n: fixed cards never clash, missing roles are detected', () => {
  for (const p of MAFIA_PRESETS) for (let n = p.min; n <= p.max; n++) {
    const roles = p.mix(n); const d = ownDeckFor(roles);
    const cards = d.cards.map((c) => c.card);
    assert.equal(new Set(cards).size, cards.length, `${p.id} ${n}`);
    if (d.ok) assert.equal(cards.length, n);
    else assert.ok(d.missing.length > 0);
  }
});

test('needs-printable detection', () => {
  assert.equal(ownDeckFor(['mafia', 'doctor', 'detective', 'villager', 'villager']).ok, true);
  assert.deepEqual(ownDeckFor(['mafia', 'framer', 'villager']).missing, ['framer']);
  assert.deepEqual(ownDeckFor(['mafia', 'jester', 'jester']).missing, ['jester']);
});
