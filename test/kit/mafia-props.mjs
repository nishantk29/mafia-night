// The P1-P4 property harness for Mafia's event log (ported from the undo prototype, mafia-simplify-1030/undo-proto,
// onto the real GameLog on main). A "driver" is the history under test: the real one is GameLog; tests can pass a
// broken one (see LeakyLog in undo-props.test.js) to prove a property catches the fault.
// Everything is seeded: a game's moves, its clock and every event's seed come from the game's seed, so a failing
// seed replays exactly.
import { GameLog, applyEvent } from '../../public/js/event-log.js';
import { withEntropy, seededEntropy } from '../../public/js/entropy.js';
import { newRoom, viewForHost, viewForPlayer } from '../../public/js/room.js';
import { LATEST_NIGHT_VERSION, MIN_PLAYERS, roleMax, isBlind, unidentifiedSlots, stalemateOf, upgradeTarget } from '../../public/js/engine.js';
import { ROLE_BY_ID, factionOf } from '../../public/js/roles.js';
import { CATALOGUE, rng as simRng, dealRefusal, pickNightActions } from '../../scripts/sim-lib.mjs';

export const HOST = { host: true };
const T0 = 1_800_000_000_000;

// A seeded stream of event seeds and times. Two games built from the same stream get the same seeds.
export function stream(seed) {
  const R = simRng(seed);
  let t = T0;
  return { seed: () => [R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32)], now: () => (t += 1 + R.int(5000)), R };
}

const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const legalSetup = (roles, n) => !dealRefusal(roles, n) && ![...count(roles)].some(([id, k]) => k > roleMax(id));

// A lobby game from the seed, through the log: players, setup, not dealt (the deal is the first Host step that Undo
// can reach; the lobby itself has no Undo). A fifth are blind card games, a fifth mix phones and host-phone seats,
// a quarter run an older night version.
// dice: a table built so its steps draw dice: blind cards with an Executioner (the match draws the target) and a
// Confused Detective (a check with no stored flip flips a coin). Cards are always blind here.
export function newGame(seed, { Log = GameLog, long = false, dice = false } = {}) {
  const S = simRng(seed);
  const st = stream(seed ^ 0x5bd1e995);
  const base = withEntropy(seededEntropy(st.seed(), T0), () => newRoom('PROP', 'hostkey'));
  if (S.chance(0.25)) base.nightVersion = 1 + S.int(LATEST_NIGHT_VERSION - 1);
  const log = new Log(base);
  const send = (actor, m) => log.apply(actor, m, st.now(), st.seed());
  const n = Math.max(MIN_PLAYERS, 5 + S.int(12));
  let roles = null;
  for (let i = 0; i < 80 && !roles; i++) { const r = ['mafia', ...Array.from({ length: n - 1 }, () => S.pick(CATALOGUE))]; if (legalSetup(r, n)) roles = r; }
  roles ||= ['mafia', 'doctor', 'detective', ...Array(n - 3).fill('villager')];
  const names = Array.from({ length: n }, (_, i) => `P${i}`);
  if (dice) roles = ['mafia', 'executioner', 'confused_detective', 'insane_detective', ...roles.slice(4)].slice(0, n);
  if (dice && !legalSetup(roles, n)) roles = ['mafia', 'executioner', 'confused_detective', ...Array(n - 3).fill('villager')];
  const cards = dice || S.chance(0.2), mixed = !cards && S.chance(0.25);
  if (mixed) { for (const nm of names.slice(0, 4)) send({ anon: true }, { type: 'join', name: nm }); send(HOST, { type: 'addPlayers', names: names.slice(4) }); }
  else send(HOST, { type: 'addPlayers', names });
  const rules = { selfProtect: S.chance(0.8), firstNightKill: S.chance(0.8), dayStart: !cards && S.chance(0.2) };
  const r = send(HOST, { type: 'setConfig', mode: cards ? 'cards' : 'app', ...(cards ? { cardFlow: 'blind' } : {}), roles, rules });
  if (r.error) throw new Error(`setup refused: ${r.error}`);
  return { log, base, long, n };
}

// Dry-run one Host message on a copy, the way the log would apply it.
export const dry = (room, m, e = [1, 2, 3, 4]) => { const c = structuredClone(room); return !applyEvent(c, { a: HOST, m: structuredClone(m), e, t: T0 }).error; };
const alive = (room) => room.players.filter((p) => p.alive);
const dead = (room) => room.players.filter((p) => !p.alive);

// What the console offers the Host now. Progress first; side moves (Eliminate, Bring back, a marker, the room's own
// Back to setup, the night-rules upgrade) now and then. Every candidate is dry-run, so all are accepted.
export function legalActions(room, r, { long = false } = {}) {
  const R = simRng(Math.floor(r() * 2 ** 31));
  if (room.phase === 'over') return [];
  const out = [];
  const side = R.chance(0.2);
  if (room.pending.length) {
    const a = alive(room);
    out.push({ type: 'resolvePending', pendingId: room.pending[0].id }, ...(a.length ? [{ type: 'resolvePending', pendingId: room.pending[0].id, targetId: R.pick(a).id }] : []));
  } else if (room.phase === 'lobby') out.push({ type: 'deal' });
  else if (room.phase === 'dealt') {
    out.push({ type: 'startNight' });
    if (room.config.rules?.dayStart) out.push({ type: 'startDay' });
    if (side) out.push({ type: 'undeal' });
  } else if (room.phase === 'night') {
    const slot = isBlind(room) && room.night === 1 ? unidentifiedSlots(room)[0] : null;
    if (slot) {
      const open = room.players.filter((p) => !p.roleId);
      if (open.length >= slot.remaining) out.push({ type: 'identifyRole', roleId: slot.roleId, playerIds: R.shuffle(open).slice(0, slot.remaining).map((p) => p.id) });
      out.push({ type: 'skipIdentify', roleId: slot.roleId });
    } else {
      const v = viewForHost(room); const skip = long ? 0.85 : 0.1;
      out.push({ type: 'submitNight', actions: pickNightActions(R, v, { skip }), n: room.night }, { type: 'submitNight', actions: pickNightActions(R, v, { skip }), n: room.night });
    }
  } else if (room.phase === 'day') {
    const sm = stalemateOf(room);
    if (sm) out.push({ type: 'declareWinner', side: R.pick(sm.sides), reason: 'Decided by the Host.' });
    if (room.condemnedDay === room.day) out.push({ type: 'startNight' });
    else if (long && R.chance(0.8)) out.push({ type: 'noCondemn' });
    else { const a = alive(room); if (a.length) out.push({ type: 'condemn', playerId: R.pick(a).id }, { type: 'condemn', playerId: R.pick(a).id }); out.push({ type: 'noCondemn' }); }
    // The day steps (room.dayStage): Talk it out, a minute more or less, Skip, Continue to the vote.
    if (room.condemnedDay !== room.day && R.chance(0.5)) out.push(R.pick([{ type: 'dayStage', stage: 'talk', minutes: 1 + R.int(15) }, { type: 'dayStage', stage: 'vote' }, { type: 'dayStage', stage: 'vote', skipped: true }, { type: 'dayStage', stage: 'morning' }]));
  }
  if (side && ['day', 'night'].includes(room.phase)) {
    const a = alive(room), d = dead(room);
    if (a.length) out.push({ type: 'kill', playerId: R.pick(a).id, cause: 'storyteller' });
    if (d.length) out.push({ type: 'revive', playerId: R.pick(d).id });
    out.push({ type: 'toggleTag', playerId: R.pick(room.players).id, tag: 'red' });
    if (room.nightVersion < upgradeTarget(room)) out.push({ type: 'upgradeNight' });
  }
  return out.filter((m) => dry(room, m));
}

// The win rules written out independently of engine.checkWin (as test/sim-invariants.test.js).
function expectedWinner(liv) {
  if (!liv.length) return 'none';
  const of = (f) => liv.filter((p) => factionOf(p.roleId) === f);
  const mafia = of('mafia'), killers = of('killer'), cult = of('cult');
  if (!mafia.length && !killers.length && !cult.length) return 'town';
  if (cult.length === liv.length) return 'cult';
  if (killers.length && !mafia.length && !cult.length && killers.length >= liv.length - killers.length) return 'killer';
  const weight = mafia.reduce((s, p) => s + (ROLE_BY_ID[p.roleId].weight || 1), 0);
  if (mafia.length && !killers.length && !cult.length && weight >= liv.length - mafia.length) return 'mafia';
  return null;
}
// The Host fallback for the step: pressing it must always be accepted (no step can block).
export function fallback(room) {
  if (room.pending.length) return { type: 'resolvePending', pendingId: room.pending[0].id };
  if (room.phase === 'lobby') return { type: 'deal' };
  if (room.phase === 'dealt') return { type: 'startNight' };
  if (room.phase === 'night') { const s = isBlind(room) && room.night === 1 && unidentifiedSlots(room)[0]; return s ? { type: 'skipIdentify', roleId: s.roleId } : { type: 'submitNight', actions: {}, n: room.night }; }
  if (room.phase === 'day') return stalemateOf(room) ? { type: 'declareWinner', side: 'draw' } : { type: room.condemnedDay === room.day ? 'startNight' : 'noCondemn' };
  return null;
}

// Invariants after any move, undo, redo or re-decide. Returns a list of problems ([] = fine).
// held: the game is paused at a flagged step (edit a past step); there the fix is the way forward, so the
// "some move is accepted" checks are skipped.
export function check(room, { held = false } = {}) {
  const v = [];
  if (!['lobby', 'dealt', 'night', 'day', 'over'].includes(room.phase)) v.push(`bad phase ${room.phase}`);
  const s = JSON.stringify(room);
  if (JSON.stringify(JSON.parse(s)) !== s) v.push('room is not plain JSON');
  if (!held && room.phase !== 'over') {
    const fb = fallback(room);
    if (fb && !dry(room, fb)) v.push(`blocked: host fallback ${fb.type} refused in ${room.phase}`);
    if (!legalActions(room, simRng(s.length).next).length) v.push(`blocked: no host action accepted in ${room.phase}`);
  }
  if (room.phase === 'over' && !room.winner) v.push('over without a winner');
  if (room.phase !== 'over' && room.winner) v.push('winner set but game not over');
  // The blind night 1 win (PR C) is checked too: identify and skip run the win check.
  if (room.players.every((p) => p.roleId) && !room.pending.length && ['dealt', 'day', 'night'].includes(room.phase)) {
    const w = expectedWinner(alive(room));
    if (w) v.push(`${w} has won but the game goes on (${room.phase})`);
  }
  for (const x of room.pending) if (!room.players.some((p) => p.id === x.playerId && !p.alive)) v.push(`pending prompt ${x.id} for a living or missing player`);
  if (room.condemnedDay != null && room.condemnedDay !== room.day) v.push('condemnedDay is not today');
  if (room.phase !== 'over') for (const p of room.players) {
    if (!p.roleId) continue;
    for (const q of viewForPlayer(room, p.id).players || []) if (q.id !== p.id && q.alive && q.role) v.push(`${p.name} sees the role of living ${q.name}`);
  }
  return v;
}

// Plays random Host moves until the game ends (or maxSteps). `st` supplies the clock and seeds; `r` picks moves.
export function play(g, r, st, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    const acts = legalActions(g.log.room, r, g);
    if (!acts.length) break;
    hostMove(g, acts[Math.floor(r() * acts.length)], st);
  }
}
export function hostMove(g, m, st) {
  const res = g.log.apply(HOST, structuredClone(m), st.now(), st.seed());
  if (res.error) throw new Error(`host ${m.type} refused: ${res.error}`);
  return res;
}
// Index of every Host event in effect: the points Undo stops at.
export const hostSteps = (log) => log.events.slice(0, log.cursor).flatMap((ev, i) => (ev.a?.host ? [i] : []));
