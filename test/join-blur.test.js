// Submitting from a field must blur it, or S.render() keeps deferring and the join screen never advances.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

test('leaveField blurs focused inputs inside #app', () => {
  assert.match(src, /const leaveField = \(\) => \{[^}]*\.blur\(\)/);
});

test('every submit action leaves the focused field first', () => {
  assert.match(src, /async hostLive\(\) \{\s*leaveField\(\);/);
  assert.match(src, /goJoin\(\) \{ leaveField\(\);/);
  assert.match(src, /\bjoin\(\) \{ leaveField\(\);/);
});

test('Enter in join fields goes through the actions', () => {
  assert.match(src, /'joinName'\) \{ ev\.preventDefault\(\); A\.join\(\)/);
  assert.match(src, /'joinCode'\) \{ ev\.preventDefault\(\); A\.goJoin\(\)/);
});
