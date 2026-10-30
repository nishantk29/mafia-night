import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);

test('user-facing copy says Host, never storyteller', () => {
  for (const f of ['index.html', ...readdirSync(new URL('js/', pub)).map((n) => `js/${n}`)]) {
    assert.doesNotMatch(readFileSync(new URL(f, pub), 'utf8'), /storyteller/i, f);
  }
});

test('service worker precaches every public js file and the display font', () => {
  const sw = readFileSync(new URL('sw.js', pub), 'utf8');
  for (const n of readdirSync(new URL('js/', pub))) assert.ok(sw.includes(`'/js/${n}'`), n);
  assert.ok(sw.includes("'/fonts/mafia-deco-400-core.woff2'") && sw.includes("'/fonts/mafia-deco-400-ext.woff2'"));
});

test('no scroll-driven or scroll-snap effects', () => {
  const css = readFileSync(new URL('styles.css', pub), 'utf8');
  assert.ok(!/animation-timeline/.test(css));
  assert.ok(!/scroll-snap-type:y/.test(css));
  assert.ok(!/backdrop-filter:[^;]*\}?/.test(css.replace(/\.glass\{[^}]*\}/g, '').replace(/html\[data-noblur="1"\][^{]*\{[^}]*\}/g, '')));
});
