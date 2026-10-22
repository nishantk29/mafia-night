import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuide, COUNTS } from '../public/js/print.js';
import { FULL_DECK } from '../public/js/engine.js';

test('card guide: every player count gets distinct real cards and a script', () => {
  for (const n of COUNTS) {
    const g = buildGuide(n);
    assert.equal(g.map.length, n);
    assert.equal(new Set(g.map.map((m) => m.card)).size, n);
    assert.ok(g.map.every((m) => FULL_DECK.includes(m.card)));
    assert.ok(g.steps.length > 0, `${n} players: night script`);
  }
});
