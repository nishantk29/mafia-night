import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHold } from '../public/js/hold.js';

// a manual clock so no real time passes
function clock() {
  let t = 0; let id = 0; const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++id, [t + ms, fn]); return id; },
    clearTimer: (i) => q.delete(i),
    tick(ms) { t += ms; for (const [i, [at, fn]] of [...q]) if (at <= t) { q.delete(i); fn(); } },
    pending: () => q.size,
  };
}
const make = (opts = {}) => { const c = clock(); const log = []; const h = createHold((on) => log.push(on), { ...opts, setTimer: c.setTimer, clearTimer: c.clearTimer }); return { c, log, h }; };

test('hidden until pressed, hidden again on release', () => {
  const { h, log } = make();
  assert.equal(h.shown, false);
  h.press(); assert.equal(h.shown, true);
  h.release(); assert.equal(h.shown, false);
  assert.deepEqual(log, [true, false]);
});

test('re-blurs after 3s even while still held, and does not re-reveal until a new press', () => {
  const { h, c, log } = make();
  h.press(); c.tick(2999); assert.equal(h.shown, true);
  c.tick(1); assert.equal(h.shown, false); assert.equal(h.pressed, true);
  h.press(); assert.equal(h.shown, false, 'still the same press');
  h.release(); h.press(); assert.equal(h.shown, true);
  assert.deepEqual(log, [true, false, true]);
});

test('cancel (visibilitychange, pagehide, blur) hides at once and clears the timer', () => {
  const { h, c } = make();
  h.press(); h.cancel();
  assert.equal(h.shown, false); assert.equal(h.pressed, false); assert.equal(c.pending(), 0);
});

test('release before the limit cancels the pending auto re-blur; key repeat does not restart it', () => {
  const { h, c, log } = make();
  h.press(); c.tick(1000); h.press(); h.press(); c.tick(1999); assert.equal(h.shown, true, 'repeat did not extend the hold');
  h.release(); assert.equal(c.pending(), 0); c.tick(5000);
  assert.deepEqual(log, [true, false]);
});
