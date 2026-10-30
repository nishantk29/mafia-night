// P1-P4: properties of Undo and Redo over the event log, on random seeded games (ported from the undo prototype,
// mafia-simplify-1030/undo-proto/props.test.mjs, onto the real GameLog).
//   P1 undo k Host steps then redo k gives back exactly the same room and events.
//   P2 undoing step by step reaches the lobby, and every room on the way passes check().
//   P3 300 random moves, undos, redos and re-decides keep check() true after each one (no step can block).
//   P4 re-deciding a past Host step and playing on equals a fresh game played that way (randomness lives in the log).
// Plus the mutation check: with randomness drawn outside the log, P4 must fail.
// GAMES (default 60) and SEED0 (default 1000) can be raised: GAMES=1000 node --test test/undo-props.test.js
// The edit-a-past-step properties E1-E5 (and EDICE, steps that draw dice) are hosted here too: they run once
// GameLog has edit() (PRs E-1..E-4), and until then are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameLog, makeEvent, applyEvent } from '../public/js/event-log.js';
import { reduce } from '../public/js/room.js';
import { rng as simRng } from '../scripts/sim-lib.mjs';
import { HOST, newGame, legalActions, check, play, hostMove, hostSteps, stream } from './kit/mafia-props.mjs';
import * as EP from './kit/mafia-edit-props.mjs';

const GAMES = +(process.env.GAMES || 60);
const SEED0 = +(process.env.SEED0 || 1000);
const MAXFAIL = 5;
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
// Host steps Undo can reach: from the last deal on (the lobby has no Undo, so "Back to setup" then a new deal is a wall).
const dealtSteps = (log) => { const d = log.events.slice(0, log.cursor).findLastIndex((ev) => ev.m?.type === 'deal'); return d < 0 ? [] : hostSteps(log).filter((i) => i >= d && log.stateAt(i).phase !== 'lobby' || i === d); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Runs fn over GAMES seeds; collects up to MAXFAIL failing seeds and returns them (each names its seed).
function overGames(fn, { games = GAMES, Log = GameLog } = {}) {
  const fails = []; let steps = 0;
  for (let i = 0; i < games && fails.length < MAXFAIL; i++) {
    const seed = SEED0 + i;
    try { steps += fn(seed, simRng(seed).next, Log) || 0; } catch (e) { fails.push(`seed=${seed}: ${String(e.message).split('\n')[0].slice(0, 240)}`); }
  }
  return { fails, steps };
}
const assertValid = (room, ctx) => { const v = check(room); assert.deepEqual(v, [], `${ctx}: ${v.join('; ')}`); };

export function P1(seed, r, Log) {
  const g = newGame(seed, { Log }); const st = stream(seed);
  play(g, r, st);
  const end = structuredClone(g.log.room); const events = structuredClone(g.log.events.slice(0, g.log.cursor));
  let k = 0;
  const want = 1 + Math.floor(r() * hostSteps(g.log).length);
  while (k < want && g.log.undoStep()) k++;
  for (let i = 0; i < k; i++) assert.ok(g.log.redoStep(), `redo ${i} of ${k}`);
  assert.ok(same(g.log.room, end), `undo ${k} then redo ${k} changed the room`);
  assert.ok(same(g.log.events.slice(0, g.log.cursor), events), 'undo then redo changed the events');
  return 2 * k;
}
export function P2(seed, r, Log) {
  const g = newGame(seed, { Log }); const st = stream(seed);
  play(g, r, st);
  let n = 0;
  while (g.log.undoStep()) { n++; assertValid(g.log.room, `undo #${n}`); }
  assert.equal(g.log.room.phase, 'lobby', `undo stopped in ${g.log.room.phase}`);
  return n;
}
export function P3(seed, r, Log, x = {}) {
  const g = newGame(seed, { Log }); const st = stream(seed);
  let n = 0;
  for (; n < 300; n++) {
    const p = r(); const acts = legalActions(g.log.room, r);
    let op;
    if (p < 0.55 && acts.length) { hostMove(g, pick(r, acts), st); op = 'move'; }
    else if (p < 0.75) { g.log.undoStep(); op = 'undo'; }
    else if (p < 0.85) { g.log.redoStep(); op = 'redo'; }
    else { // re-decide: go back a random number of Host steps, then take a different accepted move
      const back = 1 + Math.floor(r() * 4); for (let i = 0; i < back && g.log.undoStep(); i++);
      const a = legalActions(g.log.room, r); if (a.length) hostMove(g, pick(r, a), st); op = 'redecide';
    }
    x[op] = (x[op] || 0) + 1;
    assertValid(g.log.room, `op #${n} (${op})`);
  }
  return n;
}
export function P4(seed, r, Log, x = {}) {
  const g = newGame(seed, { Log }); const st = stream(seed);
  play(g, r, st);
  const steps = dealtSteps(g.log); // Host steps from the deal on (the lobby has no Undo)
  if (!steps.length) return 0;
  const i = pick(r, steps);
  while (g.log.cursor > i && g.log.undoStep());
  assert.equal(g.log.cursor, i, 'undo did not stop at the Host step');
  const kept = g.log.events.slice(0, i);
  const orig = JSON.stringify(g.log.events[i].m);
  const opts = legalActions(g.log.room, r);
  const other = opts.filter((o) => JSON.stringify(o) !== orig);
  const a = pick(r, other.length ? other : opts);
  x.changed = (x.changed || 0) + (other.length ? 1 : 0);
  const cont = Math.floor(r() * 2 ** 31);
  const st2 = stream(cont); hostMove(g, a, st2); play(g, simRng(cont + 1).next, st2);
  assertValid(g.log.room, 'after re-decide');

  // The same game from scratch: the kept events as they were, then the new move and the same continuation.
  const f = newGame(seed, { Log });
  assert.ok(same(f.log.base, g.log.base), 'two games from one seed start differently');
  for (const ev of kept.slice(f.log.cursor)) { const res = f.log.apply(ev.a, structuredClone(ev.m), ev.t, ev.e); if (res.error && !res.kept) throw new Error(`fresh game refused kept ${ev.m.type}: ${res.error}`); }
  const st3 = stream(cont); hostMove(f, a, st3); play(f, simRng(cont + 1).next, st3);
  assert.ok(same(g.log.room, f.log.room), `re-decided game != fresh game (re-decided Host step at event ${i} of ${g.log.cursor})`);
  return g.log.cursor;
}

// The mutation: a log that runs the reducer on the outside randomness (crypto and Date.now) instead of the event's
// seed, and still stores a seed. Snapshot-style undo can look fine, but a fresh game draws different dice.
class LeakyLog extends GameLog {
  apply(actor, msg, now = Date.now(), seed = undefined) {
    const before = JSON.stringify(this.room);
    const res = reduce(this.room, actor, msg); // no withEntropy: the dice come from outside the log
    if (JSON.stringify(this.room) === before) return { ...res, kept: false };
    if (this.cursor < this.events.length) { this.events.length = this.cursor; for (const k of this.snaps.keys()) if (k > this.cursor) this.snaps.delete(k); }
    const ev = makeEvent(actor, msg, now, seed); this.room.updated = now;
    this.events.push(ev); this.cursor++; this.rev++;
    if (this.cursor % this.snapEvery === 0) this.snaps.set(this.cursor, structuredClone(this.room));
    return { ...res, kept: true, ev };
  }
}

for (const [name, fn] of [['P1 undo k then redo k is identity', P1], ['P2 undo to the start reaches the lobby, valid all the way', P2],
  ['P3 random moves, undo, redo and re-decide keep every invariant', P3], ['P4 re-decide then play on equals a fresh game played that way', P4]]) {
  const games = fn === P3 ? Math.ceil(GAMES / 3) : GAMES; // P3 runs 300 operations per game
  test(`${name} (${games} games from seed ${SEED0})`, () => {
    const x = {}; const { fails, steps } = overGames((seed, r, Log) => fn(seed, r, Log, x), { games });
    if (process.env.SHOW) console.log(name.slice(0, 2), { steps, ...x });
    assert.deepEqual(fails, [], `${fails.length} failing seed(s)`);
  });
}

test('mutation: with randomness outside the log, P4 fails', () => {
  const games = Math.min(GAMES, 30);
  const { fails } = overGames(P4, { games, Log: LeakyLog });
  if (process.env.SHOW) console.log('MUTANT', fails);
  assert.ok(fails.length >= 1, 'P4 did not notice dice drawn outside the log');
  assert.ok(fails.every((f) => /fresh game|refused|differently/.test(f)), fails.join(' | '));
});

// ---------- steps that draw dice (runs now) ----------
// The deal, a blind match (an Executioner's target) and a night check with no stored coin draw dice while they run.
// Replaying each one from its own seed gives the room the log recorded; with other seed words, some come out
// differently. That second half proves the first can fail: these steps really do read the event's dice.
test(`steps that draw dice replay exactly from their own seed, and differently from another (${GAMES} games)`, () => {
  let checked = 0, differ = 0; const fails = [];
  for (let k = 0; k < GAMES && fails.length < MAXFAIL; k++) {
    const seed = SEED0 + k; const r = simRng(seed).next;
    const g = newGame(seed); play(g, r, stream(seed));
    g.log.events.slice(0, g.log.cursor).forEach((ev, i) => {
      const dice = ev.m.type === 'deal' || ev.m.type === 'identifyRole'
        || (ev.m.type === 'submitNight' && Object.values(ev.m.actions || {}).some((x) => x?.targets?.length && !x.flip && !x.coin));
      if (!dice) return;
      const at = g.log.stateAt(i); const want = g.log.stateAt(i + 1);
      const again = structuredClone(at); applyEvent(again, ev);
      if (!same(again, want)) fails.push(`seed=${seed}: ${ev.m.type} at event ${i} replays differently from its own seed`);
      const other = structuredClone(at); applyEvent(other, { ...ev, e: ev.e.map((w) => (w ^ 0x9e3779b9) >>> 0) });
      checked++; if (!same(other, want)) differ++;
    });
  }
  assert.deepEqual(fails, []);
  assert.ok(checked > GAMES, `only ${checked} dice steps in ${GAMES} games`);
  assert.ok(differ > 0, 'no dice step changed with other seed words: the check cannot fail');
});

// ---------- edit a past step, keep the later ones (UNDO-PLAN.md §5; PRs E-1..E-4) ----------
// E1-E5 and EDICE live in test/kit/mafia-edit-props.mjs. They run against GameLog once it has edit(); before that
// they are skipped. EDIT_LOG=<module exporting EditLog> runs them against a prototype (how the harness was checked).
const EditLog = process.env.EDIT_LOG ? (await import(process.env.EDIT_LOG)).EditLog : (typeof GameLog.prototype.edit === 'function' ? GameLog : null);
const EGAMES = Math.min(GAMES, 40);
for (const [name, fn, about] of [['E1', EP.E.E1, 'edit then undo gives back the exact log and room; redo gives the edit back'],
  ['E2', EP.E.E2, 'an edit to the same value is a no-op, and forced through it flags nothing'],
  ['E3', EP.E.E3, 'after any edit, two cold replays agree, and the room is valid or paused with a reason'],
  ['E4', EP.E.E4, 'every flagged step can be fixed, removed or ended, and play goes on'],
  ['E5', EP.E.E5, 'random moves, undo, redo, edits and fixes keep the invariants, then P1 and P2 hold'],
  ['EDICE', EP.EDICE, 'a same-value edit of a step that draws dice leaves the room exactly as it was']]) {
  test(`${name} ${about} (${EGAMES} games)`, { skip: !EditLog && 'GameLog has no edit() yet (PR E-1)' }, () => {
    const x = {}; const fails = [];
    for (let k = 0; k < EGAMES && fails.length < MAXFAIL; k++) {
      const seed = SEED0 + k;
      try { fn(seed, x, EditLog); } catch (e) { fails.push(`seed=${seed}: ${String(e.message).split('\n')[0].slice(0, 240)}`); }
    }
    if (process.env.SHOW) console.log(name, x);
    assert.deepEqual(fails, []);
  });
}
