import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepCues, START_CUE, END_CUE } from '../public/js/engine.js';

test('start and end cues', () => {
  assert.equal(START_CUE, 'Everyone, close your eyes.');
  assert.equal(END_CUE, 'Everyone, open your eyes.');
});
test('Mafia action opens and closes as a team', () => {
  const c = stepCues({ kind: 'action', type: 'kill', roleId: 'mafia', prompt: 'Mafia, wake up. Who do you kill?' });
  assert.deepEqual(c, { open: 'Mafia, open your eyes. Pick someone to eliminate.', close: 'Mafia, close your eyes.' });
});
test('single-role action uses the action phrase', () => {
  const c = stepCues({ kind: 'action', type: 'investigate', roleId: 'cop', prompt: 'Cop, wake up. Who do you check?' });
  assert.equal(c.open, 'Cop, open your eyes. Pick someone to investigate.');
  assert.equal(c.close, 'Cop, close your eyes.');
});
test('prompt that already opens is reused; one that already closes adds no close', () => {
  const m = stepCues({ kind: 'info', spoken: true, roleId: 'mason', prompt: 'Masons, open your eyes and meet each other.' });
  assert.equal(m.open, 'Masons, open your eyes and meet each other.');
  assert.equal(m.close, 'Masons, close your eyes.');
  const n = stepCues({ kind: 'info', spoken: true, roleId: 'mafia', prompt: 'Mafia, open your eyes and look at each other. There is no kill tonight. Close your eyes.' });
  assert.equal(n.close, null);
});
test('private notes get no cues', () => {
  assert.equal(stepCues({ kind: 'info', spoken: false, roleId: 'president', prompt: 'Announce the President to the town.' }), null);
});
