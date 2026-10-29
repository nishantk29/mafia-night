// Back closes the open sheet first: the shell wires back-sheet.js to every repaint (e2e: test/e2e/back-nav.e2e.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
test('app.js syncs Back with the open sheet after every paint, and the SW precaches back-sheet.js', () => {
  assert.match(app, /import \{ backClosesSheets \} from '\.\/back-sheet\.js'/);
  const paint = app.slice(app.indexOf('function paintScreen()'), app.indexOf('function refocus('));
  assert.match(paint, /backNav\.sync\(\);\n\}/, 'sync is the last step of paintScreen');
  assert.match(app, /closest\('\[data-a\]'\)[\s\S]{0,200}A\[el\.dataset\.a\]/, 'Back closes only a layer with a backdrop action');
  assert.ok(sw.includes("'/js/back-sheet.js'"));
});
