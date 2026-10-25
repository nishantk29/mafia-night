import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleMax, MAX_PLAYERS, setupWarnings, balanceOf } from '../public/js/engine.js';
import { newRoom, reduce } from '../public/js/room.js';
const handle = (room, _a, a) => reduce(room, { host: true }, a);

const mk = () => { const room = newRoom('ABCD', 'host'); for (let i = 0; i < 10; i++) handle(room, null, { type: 'addPlayer', name: `P${i}` }); return room; };

test('roleMax', () => {
  assert.equal(roleMax('lover', 10), 2);
  assert.equal(roleMax('cop', 10), 10);
  assert.equal(roleMax('cop', 0), 1);
  assert.equal(roleMax('cop', 500), MAX_PLAYERS);
  assert.equal(roleMax('cop'), MAX_PLAYERS);
});

test('setConfig clamps counts and ignores garbage', () => {
  const room = mk();
  handle(room, null, { type: 'setConfig', roles: Array(50).fill('cop') });
  assert.equal(room.config.roles.length, 50);
  handle(room, null, { type: 'setConfig', roles: [...Array(60).fill('cop'), 'lover', 'lover', 'lover', -3, null, 'nope', {}] });
  assert.ok(room.config.roles.length <= MAX_PLAYERS);
  assert.ok(room.config.roles.filter((r) => r === 'lover').length <= 2);
  handle(room, null, { type: 'setConfig', roles: ['lover', 'lover', 'lover', -3, null, 'nope', 'cop'] });
  assert.deepEqual(room.config.roles, ['lover', 'lover', 'cop']);
});

test('3 cops and 3 detectives allowed for 10 players', () => {
  const room = mk();
  const roles = ['mafia', 'mafia', 'cop', 'cop', 'cop', 'detective', 'detective', 'detective', 'doctor', 'villager'];
  handle(room, null, { type: 'setConfig', roles });
  assert.deepEqual(room.config.roles, roles);
});

test('balance and warnings recompute as counts change', () => {
  const base = ['mafia', 'cop', 'doctor', 'villager', 'villager'];
  const more = [...base, 'mafia'];
  assert.notDeepEqual(balanceOf(base), balanceOf(more));
  assert.ok(!setupWarnings(base, 5).some((w) => /More than one Cop/.test(w.text)));
  const w = setupWarnings([...base, 'cop'], 6).find((x) => /More than one Cop/.test(x.text));
  assert.ok(w); assert.equal(w.level, 'tip');
  assert.doesNotMatch(w.text, /unusual|wrong/);
});

test('lobby html: a role at 0 stays listed with − disabled; + disabled at the max', async () => {
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.location ??= { origin: 'https://x.test', hash: '', host: 'x.test' };
  globalThis.document ??= { documentElement: { dataset: {} }, querySelector: () => null, addEventListener() {}, getElementById: () => null };
  globalThis.navigator ??= { };
  globalThis.addEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  const { hostScreen } = await import('../public/js/host.js');
  const { S } = await import('../public/js/state.js');
  const { viewForHost } = await import('../public/js/room.js');
  const room = mk();
  handle(room, null, { type: 'setConfig', roles: ['lover', 'lover', 'cop', 'mafia'] });
  S.ui.deckShown = ['doctor'];
  const html = hostScreen(viewForHost(room), true);
  const item = (id) => html.match(new RegExp(`<li class="deck-item">(?:(?!</li>).)*data-id="${id}"(?:(?!</li>).)*</li>`, 's'))?.[0];
  const doc = item('doctor');
  assert.ok(doc, 'doctor listed at 0');
  assert.match(doc, /<b class="stepper-n">0<\/b>/);
  assert.match(doc, /subRole"[^>]*disabled/);
  assert.doesNotMatch(doc, /addRole"[^>]*disabled/);
  assert.match(item('lover'), /addRole"[^>]*disabled/);
  assert.match(html, /class="tally"[^>]*aria-live="polite"/);
  S.ui.deckShown = [];
});
