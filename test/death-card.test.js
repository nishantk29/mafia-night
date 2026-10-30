// Nishant, Oct 30 2026: "The card that shows who died is too quick". The death card (Killed / Voted out) stays until someone
// taps its button (Close: the approved dismiss label), on the host's and every player's phone, with animations on, off, or reduced motion. Nothing times it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// A small fake DOM: just enough for fx.js to build, keep and remove the card.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.listeners = {}; this.dataset = {}; this.html = '';
    this.style = { setProperty() {}, removeProperty() {} }; this.classList = { add() {}, remove() {}, contains: () => false }; }
  set innerHTML(h) { this.children = []; const m = /^\s*<(\w+)/.exec(h); if (m) { const c = new El(m[1]); c.html = h; c.parent = this; this.children.push(c); } }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n === fxLayer; }
  append(...nodes) { for (const c of nodes) { c.remove(); c.parent = this; this.children.push(c); } }
  remove() { if (!this.parent) return; this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  querySelector(sel) {
    if (sel === '[data-fx-continue]') return this.html.includes('data-fx-continue') ? (this.btn ||= new El('button')) : null;
    if (sel === '.fx-in') return (this.inner ||= Object.assign(new El('div'), { parent: this }));
    return null;
  }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ type: 'click' }); }
  focus() { this.focused = true; }
  setAttribute() {}
}
const fxLayer = new El('div');
const media = { matches: false, addEventListener() {} };
const mem = new Map();
globalThis.navigator ??= {};
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => media;
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.requestAnimationFrame = () => 0;
globalThis.document = {
  documentElement: { dataset: {} }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
  createElement: (t) => new El(t), getElementById: (id) => (id === 'fx' ? fxLayer : null),
};
const fx = await import('../public/js/fx.js');

const cards = () => fxLayer.children.filter((c) => /fx-out/.test(c.html));
const SIXTY_S = 60_000;
const MOTION = [
  ['animations on', () => { media.matches = false; fx.setAnim(true); }],
  ['reduced motion', () => { media.matches = true; fx.syncFx(); }],
  ['animations switched off', () => { media.matches = false; fx.setAnim(false); }],
];
const reset = () => { fx.clearDeathCards?.(); fxLayer.children.length = 0; };

for (const [label, set] of MOTION) {
  test(`death card stays up 60 s and goes only after Close (${label})`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    reset(); set();
    fx.popOut([{ name: 'Ana', how: 'night' }]);
    assert.equal(cards().length, 1, 'the card is on screen at t=0');
    assert.match(cards()[0].html, /Ana/);
    assert.match(cards()[0].html, /data-fx-continue[^>]*>Close</, 'the card has a Close button (the approved dismiss label; "Continue" is banned by test/kit/labels.mjs)');
    t.mock.timers.tick(SIXTY_S);
    assert.equal(cards().length, 1, 'the card is still on screen at t=60s: it must not dismiss itself');
    assert.ok(fx.deathCardOpen());
    cards()[0].btn.click();
    assert.equal(cards().length, 0, 'Close removes the card');
    assert.equal(fx.deathCardOpen(), false);
  });
}

const pv = (phase, players, extra = {}) => ({ kind: 'player', code: 'ABCDEF', phase, day: 1, night: 1, me: { id: 'z' }, players, ...extra });
test('a vote-out seen by a player phone shows the card and it waits for Close (reduced motion, fake timers)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  reset(); media.matches = true; fx.syncFx();
  const alive = [{ id: 'a', name: 'Ana', alive: true }, { id: 'b', name: 'Ben', alive: true }];
  fx.observe(pv('day', alive), pv('day', [{ id: 'a', name: 'Ana', alive: false, cause: 'condemned' }, alive[1]]));
  t.mock.timers.tick(SIXTY_S);
  assert.equal(cards().length, 1);
  assert.match(cards()[0].html, /Voted out/);
  cards()[0].btn.click();
  assert.equal(cards().length, 0);
});

test('the night death on the host phone waits for the day scene, then stays 60 s (animations on)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  reset(); media.matches = false; fx.setAnim(true);
  const hv = (phase, alive) => ({ kind: 'host', code: 'ABCDEF', phase, day: 1, night: 1, config: { rules: { revealOnDeath: false } }, players: [{ id: 'a', name: 'Ana', roleId: 'doctor', alive, deathCause: alive ? null : 'killed' }] });
  fx.observe(hv('night', true), hv('day', false));
  t.mock.timers.tick(SIXTY_S);
  assert.equal(cards().length, 1, 'the card is up after the day scene and still there at 60 s');
  assert.doesNotMatch(cards()[0].html, /fx-pop-role|Doctor/, 'a death never names the role by default');
  cards()[0].btn.click();
  assert.equal(cards().length, 0);
});

test('a second death while a card is up waits its turn; a new game clears both', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  reset(); media.matches = true; fx.syncFx();
  fx.popOut([{ name: 'Ana', how: 'night' }]);
  fx.popOut([{ name: 'Ben', how: 'vote' }]);
  t.mock.timers.tick(SIXTY_S);
  assert.equal(cards().length, 1); assert.match(cards()[0].html, /Ana/);
  cards()[0].btn.click();
  assert.equal(cards().length, 1); assert.match(cards()[0].html, /Ben/);
  fx.popOut([{ name: 'Cal', how: 'vote' }]);
  fx.observe(pv('over', []), pv('lobby', []));
  assert.equal(cards().length, 0, 'restart clears the card and the queue');
  assert.equal(fx.deathCardOpen(), false);
});

test('CSS: the card has no exit animation, takes taps, and shows (without motion) when motion is off', () => {
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fx-spring-out/, 'the old spring-out faded the card away by 400ms');
  assert.match(css, /\.fx-out\{[^}]*pointer-events:auto/);
  assert.match(css, /\.fx-out \.fx-in\{animation:fx-spring-stay /);
  assert.match(css, /@keyframes fx-spring-stay\{[^}]*\}[^@]*100%\{transform:scale\(1\);opacity:1\}/, 'the entrance ends visible');
  assert.match(css, /html\[data-fx="off"\] \.fx-scene:not\(\.fx-out\)\{display:none\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^@]*\.fx-scene:not\(\.fx-out\)\{display:none\}\s*\.fx-out::before,\.fx-out \.fx-in,\.fx-out \.fx-stamp\{animation:none\}/);
  const js = fs.readFileSync(new URL('../public/js/fx.js', import.meta.url), 'utf8');
  const pop = js.slice(js.indexOf('export function popOut'), js.indexOf('export function closeDeathCard'));
  assert.doesNotMatch(pop, /animationend|transitionend|add\(`[\s\S]*`, \d+\)/, 'popOut never schedules its own removal');
});
