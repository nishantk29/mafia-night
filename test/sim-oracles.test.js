// The simulator's rule oracles, run in-process over many random games (no server needed).
// The online version is scripts/sim-games.mjs; both share scripts/sim-lib.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';
import { ROLE_BY_ID, factionOf, registerRoles } from '../public/js/roles.js';
import {
  CATALOGUE, rng, dealRefusal, planCoverage, candidates, pickNightActions, livePreviews, nightProblems, disguiseLeaks,
} from '../scripts/sim-lib.mjs';

const host = { host: true };
const ok = (room, a) => { const r = reduce(room, host, a); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };

// Half the tables are random; the other half are full of visitors and investigators, where wake order matters most.
const BUSY = CATALOGUE.filter((id) => ['investigate', 'track', 'watch', 'block', 'jail', 'blockVisitors', 'frame', 'autopsy'].includes(ROLE_BY_ID[id].action?.type));
// Disguised custom roles, the combinations the role editor can't make but a request can.
const CUSTOMS = [
  { id: 'c_fz01', name: 'Fuzz Sleeper', alignment: 'mafia', meeting: 'mafia', seesAs: 'villager', blurb: 'Fuzz one.' },
  { id: 'c_fz02', name: 'Fuzz Seer', alignment: 'town', seesAs: 'cop', blurb: 'Fuzz two.', action: { type: 'investigate', check: 'role' } },
  { id: 'c_fz03', name: 'Fuzz Nurse', alignment: 'third', seesAs: 'doctor', blurb: 'Fuzz three.', action: { type: 'protect' } },
];
function plansFor(R, games) {
  return Array.from({ length: games }, (_, g) => {
    const n = R.pick([5, 6, 7, 8, 9, 10, 12, 15]);
    const pool = g % 2 ? BUSY : g % 3 ? CATALOGUE : ['villager', 'villager', 'cop', 'detective', 'lookout', ...CUSTOMS.map((c) => c.id), ...CUSTOMS.map((c) => c.id)];
    return { n, roles: ['mafia', ...Array.from({ length: n - 1 }, () => R.pick(pool))] };
  });
}

// Plays one game in-process and returns every problem the oracles found, plus the roles it dealt.
function play(plan, seed, rules = {}) {
  const R = rng(seed);
  const room = newRoom('SIMT', 'k');
  ok(room, { type: 'addPlayers', names: Array.from({ length: plan.n }, (_, i) => `P${i}`) });
  ok(room, { type: 'setCustomRoles', roles: CUSTOMS });
  ok(room, { type: 'setConfig', roles: plan.roles, rules });
  if (reduce(room, host, { type: 'deal' }).error) return { problems: [], dealt: [] };
  const dealt = room.players.map((p) => p.roleId);
  const problems = [];
  const leaks = () => { for (const p of room.players) problems.push(...disguiseLeaks(viewForPlayer(room, p.id), p.roleId)); };
  leaks();
  for (let round = 0; round < 8 && room.phase !== 'over'; round++) {
    while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
    if (room.phase === 'over') break;
    ok(room, { type: 'startNight' });
    const before = viewForHost(room);
    for (const s of before.script.filter((x) => x.kind === 'action')) {
      for (const c of candidates(before, s)) if (s.actors.includes(c.id)) assert.equal(s.type, 'protect', `${s.roleId} may pick itself`);
    }
    const actions = pickNightActions(R, before);
    const previews = livePreviews(before, actions);
    ok(room, { type: 'submitNight', actions });
    problems.push(...nightProblems(before, actions, viewForHost(room), previews).map((x) => `night ${room.night}: ${x}`));
    leaks();
    if (room.phase === 'over') break;
    while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
    const alive = room.players.filter((p) => p.alive);
    if (room.phase === 'day' && alive.length) ok(room, { type: 'condemn', playerId: R.pick(alive).id });
    leaks();
  }
  return { problems, dealt };
}

describe('simulator helpers', () => {
  test('the catalogue has every built-in role', () => {
    assert.equal(CATALOGUE.length, 184);
    assert.equal(new Set(CATALOGUE).size, CATALOGUE.length);
  });

  test('dealRefusal agrees with the room\'s deal action', () => {
    const R = rng(7);
    for (let i = 0; i < 200; i++) {
      const n = R.pick([5, 6, 8, 10]);
      const roles = Array.from({ length: n }, () => R.pick(CATALOGUE));
      const room = newRoom('X', 'k');
      ok(room, { type: 'addPlayers', names: Array.from({ length: n }, (_, j) => `P${j}`) });
      ok(room, { type: 'setConfig', roles });
      assert.equal(!!reduce(room, host, { type: 'deal' }).error, !!dealRefusal(roles, n), roles.join(','));
    }
  });

  test('coverage planning places every role in a dealable setup, and leaves refused setups alone', () => {
    const R = rng(3);
    const plans = plansFor(R, 40);
    plans.push({ n: 5, roles: ['mafia', 'mafia', 'mafia', 'mafia', 'mafia'] }); // refused on purpose
    const refused = plans.at(-1).roles.join();
    assert.deepEqual(planCoverage(plans, R), []);
    const dealt = new Set(plans.filter((p) => !dealRefusal(p.roles, p.n)).flatMap((p) => p.roles));
    assert.deepEqual(CATALOGUE.filter((id) => !dealt.has(id)), []);
    assert.equal(plans.at(-1).roles.join(), refused);
  });

  test('with too few games, the roles that do not fit are reported', () => {
    const R = rng(4);
    const plans = plansFor(R, 3);
    const left = planCoverage(plans, R);
    assert.ok(left.length > 100);
  });

  test('nobody picks themselves except protectors, and only when the house rule allows it', () => {
    const room = newRoom('X', 'k');
    ok(room, { type: 'addPlayers', names: ['Doc', 'Cop', 'Mo', 'Ma', 'V1', 'V2'] });
    ok(room, { type: 'setConfig', roles: ['doctor', 'cop', 'mafia', 'mafia', 'villager', 'villager'] });
    ok(room, { type: 'deal' });
    const set = (name, roleId) => { room.players.find((p) => p.name === name).roleId = roleId; };
    for (const [n, r] of [['Doc', 'doctor'], ['Cop', 'cop'], ['Mo', 'mafia'], ['Ma', 'mafia'], ['V1', 'villager'], ['V2', 'villager']]) set(n, r);
    ok(room, { type: 'startNight' });
    const v = viewForHost(room);
    const ids = (s) => candidates(v, s).map((p) => p.name).sort();
    const step = (roleId) => v.script.find((s) => s.roleId === roleId && s.kind === 'action');
    assert.ok(ids(step('doctor')).includes('Doc'));
    assert.ok(!ids(step('cop')).includes('Cop'));
    assert.deepEqual(ids(step('mafia')).filter((n) => n === 'Mo' || n === 'Ma'), []);
    v.config = { ...v.config, rules: { ...v.config.rules, selfProtect: false } };
    assert.ok(!ids(step('doctor')).includes('Doc'));
  });

  test('coin-flip checks always get a coin', () => {
    const room = newRoom('X', 'k');
    ok(room, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E', 'F'] });
    ok(room, { type: 'setConfig', roles: ['confused_cop', 'cop', 'wannabe', 'mafia', 'villager', 'villager'] });
    ok(room, { type: 'deal' }); ok(room, { type: 'startNight' });
    const v = viewForHost(room);
    const R = rng(1);
    for (let i = 0; i < 30; i++) {
      const acts = pickNightActions(R, v, { skip: 0 });
      for (const s of v.script.filter((x) => ['random', 'fake'].includes(x.check))) assert.ok(s.check === 'random' ? ['heads', 'tails'].includes(acts[s.key].flip) : ['mafia', 'innocent'].includes(acts[s.key].coin));
    }
  });

  test('a disguised role\'s real name is caught if it reaches the phone', () => {
    const room = newRoom('X', 'k');
    ok(room, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
    ok(room, { type: 'setConfig', roles: ['insane_cop', 'mafia', 'villager', 'villager', 'villager'] });
    ok(room, { type: 'deal' });
    const p = room.players.find((x) => x.roleId === 'insane_cop');
    const v = viewForPlayer(room, p.id);
    assert.deepEqual(disguiseLeaks(v, p.roleId), []);
    const leaky = structuredClone(v); leaky.me.role = { ...leaky.me.role, name: 'Insane Cop' };
    assert.equal(disguiseLeaks(leaky, p.roleId).length, 1);
  });
});

describe('random games: live results, honest checks and disguises', () => {
  registerRoles(CUSTOMS);
  const R = rng(20261020);
  const plans = plansFor(R, 150);
  assert.deepEqual(planCoverage(plans, R), []);
  const dealt = new Set();
  for (const [i, rules] of [{}, { selfProtect: false }, { firstNightKill: false }].entries()) {
    test(`150 games, house rules ${JSON.stringify(rules)}`, () => {
      const problems = [];
      plans.forEach((plan, g) => {
        const res = play(plan, i * 1000 + g, rules);
        res.dealt.forEach((id) => dealt.add(id));
        problems.push(...res.problems.map((x) => `game ${g}: ${x}`));
      });
      assert.deepEqual(problems.slice(0, 10), []);
    });
  }
  test('every built-in role was dealt', () => {
    assert.deepEqual(CATALOGUE.filter((id) => !dealt.has(id)), []);
    assert.ok([...dealt].every((id) => factionOf(id) && ROLE_BY_ID[id]));
  });
});
