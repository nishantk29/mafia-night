// Layout guards for the dead player's phone: a closed role card must not reserve height for the hidden
// dossier, the Graveyard's flex/grid children must be able to shrink, and the log uses the full card width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const rule = (sel) => { const m = css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); assert.ok(m, sel); return m[1]; };

test('closed .secret-rest is out of flow, not display:none or a reserved row', () => {
  const r = rule('.secret:not(.is-open) .secret-rest');
  assert.match(r, /position:absolute/);
  assert.match(r, /opacity:0/);
  assert.doesNotMatch(r, /display:none|grid-template-rows|visibility/);
  assert.doesNotMatch(rule('.secret-rest'), /min-height/);
});

test('graveyard children shrink and stay inside the card padding', () => {
  for (const s of ['.gy', '.gy-list', '.gy-msg', '.gy-form', '.gy-input']) assert.match(rule(s), /min-width:0/, s);
  assert.match(rule('.gy-msg'), /box-sizing:border-box/);
  assert.match(rule('.gy-input'), /box-sizing:border-box/);
});

test('"What happened" log spans the card and never hyphenates', () => {
  assert.match(rule('.log'), /minmax\(0,1fr\)/);
  assert.match(rule('.logl-text'), /hyphens:none/);
  assert.match(rule('.logl-text'), /flex:1 1 0/);
});
