// Design review 2026-10-28: "Make sure the text is checked to avoid AI wording." Every user-facing string goes through the shared
// copy lint (test/kit/copy-lint.mjs, a shared file identical in every game repo; copy it, don't fork it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { lintCopy } from './kit/copy-lint.mjs';
import { ROLES } from '../public/js/roles.js';
import { PLAY_MODES } from '../public/js/modes.js';

const PUB = new URL('../public/', import.meta.url);
// String and template literals in the shipped JS (comments removed), plus the visible text of the HTML pages.
function shippedStrings() {
  const out = [];
  for (const f of readdirSync(new URL('js/', PUB)).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(`js/${f}`, PUB), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push([`js/${f}`, m[1] ?? m[2] ?? m[3]]);
  }
  for (const f of readdirSync(PUB).filter((x) => x.endsWith('.html'))) out.push([f, readFileSync(new URL(f, PUB), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')]);
  return out;
}

test('copy lint: no AI wording in any shipped string (FAQ, narration, buttons, tips, error pages)', () => {
  const hits = shippedStrings().flatMap(([f, s]) => lintCopy(s).map((i) => `${f}: ${i}`));
  assert.deepEqual(hits, []);
});
test('copy lint: role names, blurbs, night prompts and play modes', () => {
  const hits = [];
  for (const r of ROLES) for (const s of [r.name, r.blurb, r.action?.prompt, r.night1, r.onDeath, r.onCondemn, r.day]) if (s) hits.push(...lintCopy(s).map((i) => `${r.id}: ${i}`));
  for (const m of PLAY_MODES) for (const s of [m.name, m.how, m.pick]) hits.push(...lintCopy(s).map((i) => `${m.id}: ${i}`));
  assert.deepEqual(hits, []);
});
test('copy lint catches what it should (the lint is live)', () => {
  assert.ok(lintCopy('Delve into a seamless, immersive night.').length >= 3);
  assert.ok(lintCopy('One — two — three.').length === 1);
  assert.deepEqual(lintCopy('Mafia, open your eyes. Pick someone to eliminate.'), []);
});
