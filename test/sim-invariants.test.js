// Whole games under invariant oracles: seeded, in-process, no server. The first test to run plays every game once and
// records what broke (memoised); the three tests below each read their own part of that record. The per-night rule
// checks live in test/sim-oracles.test.js, and scripts/sim-games.mjs is the online version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';
import { ROLE_BY_ID, factionOf } from '../public/js/roles.js';
import { LATEST_NIGHT_VERSION, roleMax, rulesOf, stalemateOf } from '../public/js/engine.js';
import { CATALOGUE, rng, dealRefusal, planCoverage, pickNightActions, disguiseLeaks } from '../scripts/sim-lib.mjs';

const GAMES = Number(process.env.SIM_GAMES) || 2000;
const SEED = 20261025;
const NIGHT_CAP = 12;
const LATEST = LATEST_NIGHT_VERSION;
const host = { host: true };
const STOP = Symbol('stop'); // thrown to end a game early after a problem was recorded

// Disguised custom roles: a quarter of the setups use them, the same shapes the role editor can make.
const CUSTOMS = [
  { id: 'c_iv01', name: 'Invariant Sleeper', alignment: 'mafia', meeting: 'mafia', seesAs: 'villager', blurb: 'Invariant one.' },
  { id: 'c_iv02', name: 'Invariant Seer', alignment: 'town', seesAs: 'cop', blurb: 'Invariant two.', action: { type: 'investigate', check: 'role' } },
  { id: 'c_iv03', name: 'Invariant Nurse', alignment: 'third', seesAs: 'doctor', blurb: 'Invariant three.', action: { type: 'protect' } },
];
const CUSTOM_IDS = CUSTOMS.map((c) => c.id);

// Phase moves the engine can make. Nothing leaves 'over'.
const NEXT = { lobby: ['dealt', 'lobby'], dealt: ['night', 'day', 'lobby'], night: ['day', 'over'], day: ['night', 'over'], over: [] };

const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
// A setup the Host could pick: dealable, and no role over its cap (setConfig silently drops the extra Lovers).
const legal = (roles, n) => !dealRefusal(roles, n) && ![...count(roles)].some(([id, k]) => k > roleMax(id));

// The win rules as the engine applies them (checkWin): town when no threat is left, the cult or the Serial Killer
// when they hold the table, and the Mafia once their weight (Don counts 2) matches everyone else alive.
function expectedWinner(alive) {
  if (!alive.length) return 'none';
  const of = (f) => alive.filter((p) => factionOf(p.roleId) === f);
  const mafia = of('mafia'), killers = of('killer'), cult = of('cult');
  if (!mafia.length && !killers.length && !cult.length) return 'town';
  if (cult.length === alive.length) return 'cult';
  if (killers.length && !mafia.length && !cult.length && killers.length >= alive.length - killers.length) return 'killer';
  const weight = mafia.reduce((s, p) => s + (ROLE_BY_ID[p.roleId].weight || 1), 0);
  if (mafia.length && !killers.length && !cult.length && weight >= alive.length - mafia.length) return 'mafia';
  return null;
}

// Checks that must hold after every host action, whatever the action was.
function checkAfter(room, b, a, rec, tag, held) {
  const bad = (cat, msg) => rec[cat].push(`${tag}: ${a.type}: ${msg}`);
  const alive = room.players.filter((p) => p.alive);
  const dead = room.players.filter((p) => !p.alive);
  if (alive.length + dead.length !== room.players.length) bad('impossible', 'alive and dead do not add up to the players');
  if (room.players.some((p) => p.alive && b.dead.has(p.id))) bad('impossible', 'a dead player came back to life');
  if (room.phase !== b.phase && !NEXT[b.phase].includes(room.phase)) bad('impossible', `phase ${b.phase} -> ${room.phase}`);
  if (room.day < b.day || room.night < b.night) bad('impossible', 'day or night went backwards');
  if (room.night !== b.night && a.type !== 'startNight') bad('impossible', 'the night moved without a startNight');

  if (room.phase !== 'lobby') {
    // Every dealt role is one the setup asked for: no role appears more often than config.roles holds it. A player the
    // Cult converted now holds the Cult role, so converted players are left out.
    const cfg = count(room.config.roles);
    for (const [id, n] of count(room.players.filter((p) => !p.convertedFrom).map((p) => p.roleId))) if (n > (cfg.get(id) || 0)) bad('impossible', `${id} dealt ${n} times, the setup has ${cfg.get(id) || 0}`);
  }
  // nightVersion moves only when startNight applies a queued upgrade (or a lobby upgrade, which has no night to wait for).
  if (room.nightVersion !== b.nv) {
    const viaStart = a.type === 'startNight' && b.upgradeNext && room.nightVersion === Math.max(b.nv, b.upgradeNext);
    const inLobby = a.type === 'upgradeNight' && b.phase === 'lobby';
    if (!viaStart && !inLobby) bad('impossible', `nightVersion ${b.nv} -> ${room.nightVersion} outside startNight`);
  }
  if (a.type === 'startNight' && b.upgradeNext && room.upgradeNext) bad('impossible', 'upgradeNext kept after the night started');
  // A role's limited uses are never exceeded. Uses are spent in whatever role a player held at the time (a converted
  // or copied player has held several), so the allowance is the most any role they held allows.
  for (const [id, n] of Object.entries(room.usage || {})) {
    const p = room.players.find((q) => q.id === id);
    const uses = Math.max(0, ...[...(held.get(id) || [])].map((r) => ROLE_BY_ID[r]?.action?.uses ?? 0));
    if (n > uses) bad('impossible', `${p?.name || id} used ${n} times, the roles they held allow ${uses}`);
  }

  // The win: the game ends exactly when a rule holds, with the rule's side, and never runs on past one.
  if (room.phase === 'over' && b.phase !== 'over') {
    if (a.type === 'declareWinner') {
      if (!b.sm || !b.sm.sides.includes(room.winner.side)) bad('winner', `the Host declared ${room.winner.side}, outside the stalemate choices`);
    } else {
      const want = expectedWinner(alive);
      if (room.winner?.side !== want) bad('winner', `ended as "${room.winner?.side}", the rules say ${want ?? 'nobody'}`);
    }
  }
  if (room.phase !== 'over' && !room.pending.length && ['dealt', 'day', 'night'].includes(room.phase)) {
    const want = expectedWinner(alive);
    if (want) bad('winner', `${want} has won, but the game goes on`);
  }
}

// Views: a disguised player is never sent their real role, and nobody alive has another living player's role on screen.
function leaks(room, rec, tag) {
  for (const p of room.players) {
    if (!p.roleId) continue;
    const v = viewForPlayer(room, p.id);
    for (const m of disguiseLeaks(v, p.roleId)) rec.impossible.push(`${tag}: ${m}`);
    if (room.phase === 'over') continue;
    for (const q of v.players) if (q.id !== p.id && q.alive && q.role) rec.impossible.push(`${tag}: ${p.name} is shown the role of living ${q.name}`);
  }
}

// Every role with a night action gets exactly one call per night, and team calls list their members once each.
// Mirrors scriptSteps: a spent role (before v8) or a first-night kill (with first-night kills off) is not called. Team calls list
// all members in v3+, the living members in v2 (all of them when none is left), and the living in v1.
function callProblems(view) {
  const v = view.nightVersion, first = view.night === 1;
  const killFirst = rulesOf({ config: view.config }).firstNightKill;
  const pool = view.players.filter((p) => p.roleId && (v >= 2 || p.alive));
  const want = new Map(pool.map((p) => [p.id, []]));
  for (const p of pool) {
    const r = ROLE_BY_ID[p.roleId];
    if (v >= 8 && p.roleId === 'executioner') want.get(p.id).push(`act:${p.id}`); // v8: every Executioner is called every night
    if (!r.action || r.action.group) continue;
    if (first && !killFirst && r.action.type === 'kill') continue;
    if (v < 8 && (view.usage?.[p.id] || 0) >= r.action.uses) continue; // v8 still calls a used-up role (the call does nothing)
    want.get(p.id).push(`act:${p.id}`);
  }
  for (const team of ['mafia', 'cult']) {
    const members = pool.filter((q) => ROLE_BY_ID[q.roleId].meeting === team);
    const living = members.filter((q) => q.alive);
    for (const q of v >= 3 || !living.length ? members : living) want.get(q.id).push(`meeting:${team}`);
  }
  const got = new Map(pool.map((p) => [p.id, []]));
  const out = [];
  for (const s of view.script) {
    if (!s.key.startsWith('act:') && !s.key.startsWith('meeting:')) continue;
    for (const id of s.actors) {
      if (got.has(id)) got.get(id).push(s.key);
      else out.push(`${s.key} calls ${id}, who is not in the night`);
    }
  }
  for (const p of pool) {
    const w = want.get(p.id).sort().join(), g = got.get(p.id).sort().join();
    if (w !== g) out.push(`${p.name} (${ROLE_BY_ID[p.roleId].name}) expected [${w}], called [${g}]`);
  }
  const labels = view.script.filter((s) => s.label).map((s) => s.label);
  if (new Set(labels).size !== labels.length) out.push(`numbered calls repeat: ${labels.join(', ')}`);
  return out;
}

// The steps the Host recorded for a dead holder do nothing: no result may reach the report.
function inertProblems(before, after) {
  const info = new Set((after.report?.info || []).map((i) => i.key));
  const dead = new Set(before.players.filter((p) => !p.alive).map((p) => p.id));
  return before.script
    .filter((s) => s.kind === 'action' && s.actors.every((id) => dead.has(id)) && info.has(s.key))
    .map((s) => `dead ${ROLE_BY_ID[s.roleId]?.name} got a result`);
}

// Living-only steps aim at living players; the dead-only ones (autopsy, copy a role) at the dead.
function targetProblems(before, actions) {
  const alive = new Set(before.players.filter((p) => p.alive).map((p) => p.id));
  const out = [];
  for (const s of before.script) {
    if (s.kind !== 'action') continue;
    for (const t of actions[s.key]?.targets || []) if (alive.has(t) === !!s.dead) out.push(`${s.key} is aimed at ${t}, who is ${alive.has(t) ? 'alive' : 'dead'}`);
  }
  return out;
}

function playGame(g, plan, R, rec) {
  const tag = `game ${g}`;
  const room = newRoom(`S${g}`, 'k');
  room.nightVersion = R.chance(0.6) ? LATEST : 1 + R.int(LATEST - 1); // most rooms run the latest script
  const held = new Map(); // player id -> every role id they have held in this game
  const noteRoles = () => {
    for (const p of room.players) {
      if (!p.roleId) continue;
      if (!held.has(p.id)) held.set(p.id, new Set());
      held.get(p.id).add(p.roleId);
    }
  };
  const act = (a) => {
    noteRoles();
    const b = {
      phase: room.phase, day: room.day, night: room.night, nv: room.nightVersion, upgradeNext: room.upgradeNext || null,
      dead: new Set(room.players.filter((p) => !p.alive).map((p) => p.id)), sm: a.type === 'declareWinner' ? stalemateOf(room) : null,
    };
    let r;
    try { r = reduce(room, host, a); } catch (e) { rec.impossible.push(`${tag}: ${a.type} threw: ${e.message}`); throw STOP; }
    if (!r.ok) { rec.impossible.push(`${tag}: legal ${a.type} refused: ${r.error}`); throw STOP; }
    noteRoles();
    checkAfter(room, b, a, rec, tag, held);
    return r;
  };
  // Resolve prompts (a Hunter's shot, a Paparazzi reveal...) with a random living target, or none.
  const settle = () => {
    for (let n = 0; room.pending.length && n < 50; n++) {
      const alive = room.players.filter((p) => p.alive);
      act({ type: 'resolvePending', pendingId: room.pending[0].id, targetId: alive.length && R.chance(0.5) ? R.pick(alive).id : undefined });
    }
  };
  try {
    const rules = { selfProtect: R.chance(0.8), firstNightKill: R.chance(0.8), dayStart: R.chance(0.2) };
    act({ type: 'addPlayers', names: Array.from({ length: plan.n }, (_, i) => `P${i}`) });
    act({ type: 'setCustomRoles', roles: CUSTOMS });
    act({ type: 'setConfig', mode: 'app', roles: plan.roles, rules });
    if (room.nightVersion < LATEST && R.chance(0.1)) act({ type: 'upgradeNight' }); // in the lobby this switches straight over
    act({ type: 'deal' });
    leaks(room, rec, tag);
    for (let night = 0; night < NIGHT_CAP; night++) {
      settle();
      if (room.phase === 'dealt' && rules.dayStart && R.chance(0.5)) {
        act({ type: 'startDay' });
      } else {
        if (room.phase === 'day' && room.nightVersion < LATEST && R.chance(0.15)) act({ type: 'upgradeNight', off: R.chance(0.2) });
        act({ type: 'startNight' });
        rec.nights++;
      }
      const before = viewForHost(room);
      if (room.phase === 'night') {
        for (const m of callProblems(before)) rec.calls.push(`${tag} night ${room.night}: ${m}`);
        leaks(room, rec, tag);
        const actions = pickNightActions(R, before, { skip: 0.1 });
        for (const m of targetProblems(before, actions)) rec.impossible.push(`${tag} night ${room.night}: ${m}`);
        act({ type: 'submitNight', actions });
        for (const m of inertProblems(before, viewForHost(room))) rec.impossible.push(`${tag} night ${room.night}: ${m}`);
        settle();
      }
      if (room.phase === 'over') break;
      if (room.phase !== 'day') continue;
      const sm = stalemateOf(room);
      if (sm && R.chance(0.7)) { act({ type: 'declareWinner', side: R.pick(sm.sides), reason: 'Decided by the Host.' }); break; }
      const alive = room.players.filter((p) => p.alive);
      if (room.condemnedDay !== room.day) {
        if (alive.length && R.chance(0.75)) act({ type: 'condemn', playerId: R.pick(alive).id });
        else act({ type: 'noCondemn' });
      }
      settle();
      if (room.phase === 'over') break;
      if (R.chance(0.03) && alive.length) {
        act({ type: 'kill', playerId: R.pick(alive).id, cause: 'storyteller' });
        settle();
        if (room.phase === 'over') break;
      }
      leaks(room, rec, tag);
    }
  } catch (e) {
    if (e !== STOP) rec.impossible.push(`${tag}: ${e.stack.split('\n').slice(0, 2).join(' | ')}`);
  }
  if (room.phase === 'over') rec.over++; else rec.open++;
}

// The engine draws its randomness (the deal, coin flips, Cop numbering, room codes and ids) from the Web Crypto
// and Math.random. Both are routed through a seeded generator while the simulation runs, so a run replays exactly.
function withSeededEngine(R, fn) {
  const { getRandomValues } = crypto, { random } = Math;
  crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(R.next() * 2 ** (arr.BYTES_PER_ELEMENT * 8)); return arr; };
  Math.random = R.next;
  try { return fn(); } finally { crypto.getRandomValues = getRandomValues; Math.random = random; }
}

// Plays every game once. Setups are seeded, dealable, and cover every built-in role (planCoverage).
function simulate() {
  return withSeededEngine(rng(SEED + 1), () => simulateSeeded());
}
function simulateSeeded() {
  const R0 = rng(SEED);
  const plans = Array.from({ length: GAMES }, () => {
    const n = 5 + R0.int(12);
    const pool = R0.chance(0.25) ? [...CATALOGUE, ...CUSTOM_IDS] : CATALOGUE;
    let roles = [];
    for (let i = 0; i < 50; i++) {
      roles = ['mafia', ...Array.from({ length: n - 1 }, () => R0.pick(pool))];
      if (legal(roles, n)) break;
    }
    return { n, roles };
  });
  const unplaced = planCoverage(plans, R0);
  const rec = { impossible: [], winner: [], calls: [], games: 0, skipped: 0, nights: 0, over: 0, open: 0, unplaced };
  plans.forEach((plan, g) => {
    if (!legal(plan.roles, plan.n)) { rec.skipped++; return; }
    rec.games++;
    playGame(g, plan, rng(SEED + g + 1), rec);
  });
  return rec;
}

let RUN = null;
const run = () => (RUN ??= simulate());

test('sim: no impossible states', (t) => {
  const rec = run();
  t.diagnostic(`${rec.games} games (${rec.skipped} setups refused), ${rec.nights} nights, ${rec.over} ended, ${rec.open} hit the ${NIGHT_CAP}-night cap`);
  assert.deepEqual(rec.unplaced, [], 'every built-in role is dealt in some setup');
  assert.deepEqual(rec.impossible.slice(0, 10), []);
});

test('sim: right winner', () => {
  const rec = run();
  assert.deepEqual(rec.winner.slice(0, 10), []);
});

test('sim: every alive night role called once per night', () => {
  const rec = run();
  assert.deepEqual(rec.calls.slice(0, 10), []);
});
