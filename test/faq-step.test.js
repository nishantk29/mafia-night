// motion.step(): opening or leaving the FAQ never starts a view transition; the main column gets the one-shot .faq-in
// (opacity + transform). With reduced motion nothing animates.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const media = { matches: false, addEventListener() {} };
const mem = new Map();
const main = { classList: new Set(), offsetWidth: 1, addEventListener() {} };
main.classList.remove = main.classList.delete; // Set has add/delete; classList needs add/remove
let vt = 0;
globalThis.navigator ??= {};
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => media;
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = {
  documentElement: { dataset: {} }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => main, getElementById: () => null, visibilityState: 'visible',
  startViewTransition: (cb) => { vt++; cb(); return { ready: Promise.resolve(), finished: Promise.resolve() }; },
};
const { S } = await import('../public/js/state.js');
const { step } = await import('../public/js/motion.js');
const go = (mode) => { S.mode = mode; S.code = null; let painted = 0; step(() => { painted++; }); return painted; };

test('home -> FAQ -> home: painted, no view transition, .faq-in replayed (motion on)', () => {
  media.matches = false; document.documentElement.dataset.fx = 'on';
  go('home'); vt = 0; main.classList.clear();
  assert.equal(go('faq'), 1); assert.equal(vt, 0, 'no startViewTransition on the way in'); assert.ok(main.classList.has('faq-in'));
  main.classList.clear();
  assert.equal(go('home'), 1); assert.equal(vt, 0, 'none on the way out'); assert.ok(main.classList.has('faq-in'));
});

test('reduced motion: the FAQ shows at once (no class, no view transition)', () => {
  media.matches = true;
  go('home'); vt = 0; main.classList.clear();
  assert.equal(go('faq'), 1); assert.equal(vt, 0); assert.equal(main.classList.has('faq-in'), false);
  media.matches = false;
});
