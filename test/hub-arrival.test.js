// Arriving from the Game Night hub (Nishant, Oct 28 9:08 PM ET: "That logo moving on game night is kinda janky"):
// one opacity fade of the page, at most 300 ms, nothing moves, nothing loops, and nothing at all under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const css = rd('redesign.css').replace(/\/\*[\s\S]*?\*\//g, ''), html = rd('index.html');
const hubRules = [...css.matchAll(/([^{}]*hub-(?:in|go)[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const scale = +(rd('family.css') + rd('styles.css') + rd('redesign.css')).match(/--dur-scale:\s*([\d.]+)/)[1];

test('the arrival is a single opacity fade of the page, <= 300 ms at --dur-scale', () => {
  const fades = hubRules.filter((r) => /animation:/.test(r.body) && !/animation:none/.test(r.body));
  assert.equal(fades.length, 1, JSON.stringify(fades));
  assert.match(fades[0].sel, /^html\.hub-in #app,html\.hub-in \.bg-art$/);
  const m = fades[0].body.match(/animation:hub-fade calc\(([\d.]+)s \* var\(--dur-scale\)\)/);
  assert.ok(m && +m[1] * scale * 1000 <= 300, fades[0].body);
  assert.match(css, /@keyframes hub-fade\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.doesNotMatch(fades[0].body, /infinite/);
});
test('nothing moves on arrival: no transform, no transition, no flying wordmark, the home rise is skipped', () => {
  for (const r of hubRules) assert.doesNotMatch(r.body, /transform|transition/, r.sel);
  assert.doesNotMatch(css + html, /hub-go/);
  assert.doesNotMatch(html, /wordmark[^<]*style\.transform|scale\('\+s\+'\)/);
  assert.ok(hubRules.some((r) => r.sel === 'html.hub-in .home-intro .home-paths > *' && /animation:none/.test(r.body)));
});
test('reduced motion and effects-off never get html.hub-in, so nothing animates', () => {
  assert.match(html, /var r=matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches,off=false;/);
  assert.match(html, /if\(hub&&!r&&!off&&/);
});
