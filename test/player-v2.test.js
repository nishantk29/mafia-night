// Design v2 player screens: world mapping, dead player's layout, the cast, and the stale victory on 'closed'.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const layerKids = [];
globalThis.navigator ??= {};
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '2' });
globalThis.document = {
  documentElement: { dataset: {} }, addEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, append() {}, remove() { this.gone = true; }, classList: { add() {} } }),
  getElementById: () => ({ append: (el) => layerKids.push(el) }),
};
const { S } = await import('../public/js/state.js');
const { worldOf, castList, applyClosed } = await import('../public/js/world.js');
const { playerScreen } = await import('../public/js/player.js');
const { showVictory, closeVictory, victoryOpen } = await import('../public/js/fx.js');

const role = { id: 'cop', name: 'Cop', alignment: 'town', blurb: 'Checks.' };
const mk = (id, name, alive, r = role) => ({ id, name, alive, role: r });
const view = (me, phase = 'day') => ({
  kind: 'player', phase, day: 1, night: 1, code: 'ABCDEF', mode: 'roles', me: { team: [], knows: [], results: [], ...me },
  players: [mk('a', 'Ann', true), mk('b', 'Bob', false)], publicLog: [], setupRoles: [],
});
const GY = [{ id: 1, from: 'b', name: 'Bob', text: 'boo' }];

test('data-world follows the phase', () => {
  assert.equal(worldOf('night'), 'night');
  assert.equal(worldOf('day'), 'day');
  for (const p of ['lobby', 'dealt', 'over', undefined]) assert.equal(worldOf(p), 'neutral');
});

test('dead player: the Graveyard heading and chat come before the role card', () => {
  S.graveyard = GY;
  const html = playerScreen(view({ id: 'b', name: 'Bob', alive: false, role }));
  const i = (s) => html.indexOf(s);
  assert.ok(i("You’re in the Graveyard") > 0);
  assert.ok(i('class="gy"') > i("You’re in the Graveyard"));
  assert.ok(i('class="gy"') < i('class="hand is-ghost"'), 'graveyard chat above the ghost card');
  assert.ok(i('is-ghost') < i('class="table-side"'));
});

test('living player html has no graveyard markup', () => {
  S.graveyard = GY; // even if stale state lingers
  const html = playerScreen(view({ id: 'a', name: 'Ann', alive: true, role }));
  assert.doesNotMatch(html, /gy-|Graveyard|data-gy|gyText|is-ghost/);
  S.graveyard = null;
});

test('cast lists every player exactly once', () => {
  const players = [mk('a', 'Ann', true), mk('b', 'Bob', false), mk('c', 'Cy', true, null)];
  const html = castList(players, (p) => p.role);
  assert.equal((html.match(/class="cast-row/g) || []).length, 3);
  for (const p of players) assert.equal((html.match(new RegExp(`data-cast="${p.id}"`, 'g')) || []).length, 1);
  assert.match(html, /Role unknown/);
  assert.equal((html.match(/<h[1-6]/g) || []).length, 1, 'one heading in the cast');
  S.graveyard = null;
  const over = playerScreen(view({ id: 'a', name: 'Ann', alive: true, role, won: true }, 'over'));
  assert.equal((over.match(/phase-title/g) || []).length, 1, 'one winner heading');
  assert.doesNotMatch(over, /fx-victory|You won!/);
  assert.match(over, /Waiting for the host to restart/);
  assert.doesNotMatch(over, /data-a="(restart|playAgain)"/);
});

test("the stale victory closes when the 'closed' message arrives", () => {
  showVictory({ theme: 'town', won: true, team: 'Town' });
  assert.equal(victoryOpen(), true);
  applyClosed({ reason: 'ended' }, 'play', closeVictory);
  assert.equal(victoryOpen(), false);
  assert.equal(S.ended, 'ended');
  assert.equal(S.view, null);
  applyClosed({ reason: 'ended' }, 'host', closeVictory);
  assert.equal(S.ended, 'host');
  applyClosed({}, 'play', closeVictory);
  assert.equal(S.ended, 'expired');
});

test('victory is never a dialog: no second heading over the end screen', () => {
  showVictory({ theme: 'mafia', won: false, team: 'Mafia' });
  assert.ok(layerKids.every((el) => el.innerHTML === undefined), 'no dialog markup is created');
  closeVictory();
});
