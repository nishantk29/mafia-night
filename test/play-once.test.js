// Nishant, Oct 28 11:09 PM ET: the looping decorations play ONCE and stop on their final frame; with reduced motion the
// final frame shows with no motion. Nothing in Mafia Night's CSS, HTML or JS loops forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const pub = new URL('../public/', import.meta.url);
const rd = (f) => readFileSync(new URL(f, pub), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const all = [...readdirSync(pub).filter((f) => /\.(css|js|html)$/.test(f)).map((f) => [f, f.endsWith('.css') ? strip(rd(f)) : rd(f)]),
  ...readdirSync(new URL('js/', pub)).filter((f) => f.endsWith('.js')).map((f) => [`js/${f}`, rd(`js/${f}`)])];
const css = strip(rd('redesign.css'));

test('no infinite or repeating animation anywhere (CSS, inline styles, JS)', () => {
  for (const [f, src] of all) {
    assert.doesNotMatch(src, /\binfinite\b/, f);
    assert.doesNotMatch(src, /animation-iteration-count\s*:\s*(?!1\b)/, f);
    assert.doesNotMatch(src, /iterations\s*:\s*(Infinity|[2-9]|\d{2,})/, f);
  }
});
test('the wordmark drips grow once and hold; the smoke holds its resting place (400ms budget, 2026-10-29)', () => {
  assert.match(css, /html\[data-fx="on"\] \.dr-svg\{animation:drip calc\(320ms \* var\(--dur-scale\)\) var\(--ease-butter\) both\}/);
  assert.doesNotMatch(css, /\booze\b/);
  assert.doesNotMatch(css, /animation:smoke\b/); // the smoke sits where the drift used to end (transform:none)
});
test('reduced motion and effects off show that final frame with no motion', () => {
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^@]*\.dr-svg,\.knife,\.bg-art \.smoke,[^{]*\{animation:none!important\}/);
  assert.match(css, /html\[data-fx="off"\] \.dr-svg,html\[data-fx="off"\] \.knife,html\[data-fx="off"\] \.bg-art \.smoke\{animation:none!important\}/);
});
