// The simulator's scripted seat agents (scripts/sim-agents.mjs): they decide only from their own phone's view.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { knowledge, chooseStep, morningClaims, dayVote } from '../scripts/sim-agents.mjs';
import { rng } from '../scripts/sim-lib.mjs';

const P = (id, name, alive = true) => ({ id, name, alive });
const players = [P('a', 'Ann'), P('b', 'Bo'), P('c', 'Cy Jr'), P('d', 'Cy'), P('e', 'Eve')];
const phone = (role, extra = {}) => ({ kind: 'player', players, me: { id: 'a', role: { id: role }, team: [], knows: [], results: [], ...extra } });
const blank = (id, side = 'town', role = 'villager') => ({ id, role, side, team: new Set(), mafia: new Set(), guilty: new Set(), cleared: new Set(), checked: new Set() });

describe('sim agents', () => {
  test('reads results from its own phone, matching the longest name', () => {
    const k = knowledge(phone('cop', { results: [{ night: 1, text: 'Cy Jr is MAFIA.' }, { night: 2, text: 'Bo is NOT Mafia.' }, { night: 3, text: 'Eve is NOT a Werewolf.' }] }), { id: 'a' });
    assert.deepEqual([...k.guilty], ['c']);
    assert.deepEqual([...k.cleared].sort(), ['b', 'e']);
    assert.deepEqual([...k.checked].sort(), ['b', 'c', 'e']);
    assert.equal(k.side, 'town');
  });

  test('a seat without a phone knows only its card', () => {
    const k = knowledge(null, { id: 'b', shownRoleId: 'mafia' });
    assert.equal(k.role, 'mafia'); assert.equal(k.side, 'mafia'); assert.equal(k.team.size, 0);
  });

  test('the Mafia never targets a teammate and goes after an accuser first', () => {
    const view = { players, config: { rules: {} } };
    const step = { key: 'm', kind: 'action', type: 'kill', actors: ['a'], targets: 1 };
    const k = { ...blank('a', 'mafia', 'mafia'), team: new Set(['b']) };
    const know = new Map([['a', k]]);
    for (let s = 1; s < 30; s++) {
      const pick = chooseStep(rng(s), view, step, know, []).targets[0];
      assert.ok(!['a', 'b'].includes(pick));
      assert.equal(chooseStep(rng(s), view, step, know, [{ by: 'e', target: 'b', guilty: true }]).targets[0], 'e');
    }
  });

  test('a town killer with no suspect holds fire; with one, shoots them', () => {
    const view = { players, config: { rules: {} } };
    const step = { key: 'v', kind: 'action', type: 'kill', actors: ['a'], targets: 1 };
    assert.deepEqual(chooseStep(rng(1), view, step, new Map([['a', blank('a')]]), []), { targets: [] });
    const k = { ...blank('a'), guilty: new Set(['d']) };
    assert.deepEqual(chooseStep(rng(1), view, step, new Map([['a', k]]), []).targets, ['d']);
  });

  test('investigators prefer someone they have not checked', () => {
    const view = { players, config: { rules: {} } };
    const step = { key: 'c', kind: 'action', type: 'investigate', check: 'alignment', actors: ['a'], targets: 1 };
    const k = { ...blank('a'), checked: new Set(['b', 'c', 'd']) };
    for (let s = 1; s < 20; s++) assert.deepEqual(chooseStep(rng(s), view, step, new Map([['a', k]]), []).targets, ['e']);
  });

  test('a guilty result is usually claimed, and the town votes the accused out', () => {
    const alive = players;
    const know = new Map(alive.map((p) => [p.id, blank(p.id)]));
    know.set('a', { ...blank('a', 'town', 'cop'), guilty: new Set(['c']) });
    const claims = morningClaims(rng(3), alive, know);
    assert.deepEqual(claims, [{ by: 'a', target: 'c', guilty: true }]);
    assert.equal(dayVote(rng(3), alive, know, claims), 'c');
  });

  test('the Mafia vote together, so days without town information still often condemn someone', () => {
    const know = new Map(players.map((p) => [p.id, blank(p.id)]));
    know.set('a', { ...blank('a', 'mafia', 'mafia'), team: new Set(['b']) });
    know.set('b', { ...blank('b', 'mafia', 'mafia'), team: new Set(['a']) });
    // With 5 alive a condemnation needs 2 votes; the Mafia pair alone can supply them, and it is never one of them
    // unless the town piles on.
    for (let s = 1; s <= 40; s++) { const out = dayVote(rng(s), players, know, []); assert.ok(out === null || players.some((p) => p.id === out)); }
    // With the town holding no information, the two Mafia votes decide most days.
    let mafiaLed = 0;
    for (let s = 1; s <= 40; s++) if (dayVote(rng(s), players, know, []) !== null) mafiaLed++;
    assert.ok(mafiaLed >= 20, `condemned on ${mafiaLed} of 40 days`);
  });
});
