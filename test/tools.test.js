import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDice, nextSpeaker } from '../public/js/tools.js';

test('dice: 1 to 6 dice, d6 or d20, always in range', () => {
  for (const sides of [6, 20]) for (const count of [1, 3, 6]) {
    for (let i = 0; i < 50; i++) {
      const r = rollDice(count, sides);
      assert.equal(r.length, count);
      assert.ok(r.every((x) => Number.isInteger(x) && x >= 1 && x <= sides));
    }
  }
  assert.equal(rollDice(99, 6).length, 6);
  assert.equal(rollDice(0, 7).length, 1);
  assert.ok(rollDice(1, 7)[0] <= 6, 'unknown die falls back to d6');
});

test('talk turns pass around the living players in seat order', () => {
  const ps = [{ id: 'a', alive: true }, { id: 'b', alive: false }, { id: 'c', alive: true }];
  assert.equal(nextSpeaker(ps, null).id, 'a');
  assert.equal(nextSpeaker(ps, 'a').id, 'c');
  assert.equal(nextSpeaker(ps, 'c').id, 'a');
  assert.equal(nextSpeaker(ps, 'b').id, 'a', 'a dead speaker restarts at the first living seat');
  assert.equal(nextSpeaker([{ id: 'x', alive: false }], null), null);
});
