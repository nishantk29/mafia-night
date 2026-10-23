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
  assert.ok(sw.includes("'/fonts/limelight-400.woff2'"));
});

test('scroll reveals are gated on support and motion preferences', () => {
  const css = readFileSync(new URL('styles.css', pub), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{\s*@supports \(animation-timeline:view\(\)\)\{\s*html\[data-fx="on"\] \[data-rv\]/);
  assert.match(css, /scroll-snap-type:x mandatory;overscroll-behavior-x:contain/);
});
