// Changing a past step and keeping the later ones (UNDO-PLAN.md §2.2, PR E-1: the log only, no UI or server yet).
// The properties E1-E5 and EDICE are in undo-props.test.js; this file pins the rules one by one: stamps, old logs,
// pausing at a flagged step, what is refused and why, the dry run, and two broken logs the properties must catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameLog, stepLabel, isMeta, META } from '../public/js/event-log.js';
import * as EP from './kit/mafia-edit-props.mjs';
import { HOST } from './kit/mafia-props.mjs';

const J = (x) => JSON.stringify(x);
const SEED0 = 1000;
// A played game, with an edit that paused it. Searches seeds from SEED0; the same seed always gives the same game.
function pausedGame(Log = GameLog) {
  for (let seed = SEED0; seed < SEED0 + 200; seed++) {
    const { log, R } = EP.newGame(seed, Log); EP.play(log, R);
    const before = { room: J(log.room), events: J(log.events), cursor: log.cursor };
    for (let k = 0; k < 8 && !log.hold; k++) { const e = EP.randomEdit(log, R); if (e && !log.hold) log.undo(); }
    if (log.hold) return { seed, log, R, before };
  }
  throw new Error('no seed paused');
}

test('every kept event carries a stamp: whether the reducer took it, and the facts its choices relied on', () => {
  let nights = 0;
  for (let seed = SEED0; seed < SEED0 + 10; seed++) {
    const { log, R } = EP.newGame(seed, GameLog); EP.play(log, R);
    for (const ev of log.events) assert.equal(typeof ev.c?.ok, 'boolean', J(ev.m));
    nights += log.events.filter((ev) => ev.m.type === 'submitNight' && Object.keys(ev.c.f || {}).some((k) => k.startsWith('tgt:'))).length;
  }
  assert.ok(nights > 5, `only ${nights} night stamps name their targets`);
});

test('a log saved before stamps existed gets them on restore, the same as live ones, and the same room', () => {
  for (let seed = SEED0; seed < SEED0 + 10; seed++) {
    const { log, R } = EP.newGame(seed, GameLog); EP.play(log, R);
    const json = JSON.parse(J(log.toJSON()));
    for (const ev of json.events) delete ev.c;
    const back = GameLog.restore(json);
    assert.equal(J(back.room), J(log.room), `seed ${seed}`);
    assert.equal(J(back.events.map((ev) => ev.c)), J(log.events.map((ev) => ev.c)), `seed ${seed}: derived stamps differ`);
    assert.equal(back.hold, null);
  }
});

test('a log with no changes replays from its checkpoints, exactly as before', () => {
  const { log, R } = EP.newGame(SEED0 + 3, GameLog); EP.play(log, R);
  assert.ok(!log.events.some(isMeta));
  const slow = log.compute(log.cursor).room;
  assert.equal(J(log.stateAt(log.cursor)), J(slow));
  assert.equal(J(log.room), J(slow));
});

test('a change that breaks a later step pauses there with the reasons; undoing the change gives the exact game back', () => {
  const { log, before } = pausedGame();
  const h = log.hold;
  assert.ok(h.probs.length, 'a pause names what went wrong');
  assert.equal(log.els[h.pos].id, h.id);
  assert.equal(J(log.history().hold), J(h), 'history() carries the pause for the host view');
  const n = log.events.length;
  const r = log.apply(HOST, { type: 'startDay' });
  assert.equal(r.error, 'Fix the flagged step first.'); assert.equal(r.kept, false); assert.equal(log.events.length, n, 'nothing recorded while paused');
  assert.equal(log.undoStep(), 'A change to an earlier step', 'a change is one undo step');
  assert.equal(log.hold, null);
  assert.equal(J(log.room), before.room); assert.equal(log.cursor, before.cursor);
  assert.equal(J(log.events.slice(0, log.cursor)), before.events);
});

test('what a change is refused for, and that a refused change records nothing', () => {
  const { log } = pausedGame();
  const h = log.hold; const n = log.events.length;
  const later = log.els[h.pos + 1]; const earlier = log.els.slice(log.gameStart(), h.pos).findLast((s) => s.a?.host && s.m.type !== h.type);
  const refusals = [
    [{ type: 'nope', id: h.id }, 'Unknown change.'],
    [{ type: 'edit', id: 9e9, msg: { type: 'kill' } }, 'No such step.'],
    ...(later ? [[{ type: 'edit', id: later.id, msg: later.m }, 'That step waits for the flagged step.']] : []),
    ...(earlier ? [[{ type: 'drop', id: earlier.id }, 'Only the flagged step can be removed.'], [{ type: 'cut', id: earlier.id }, 'Only the flagged step can be removed.']] : []),
    [{ type: 'edit', id: h.id }, 'Bad message.'],
    [{ type: 'edit', id: h.id, msg: { type: 'startDay' } }, 'That step can’t be changed into that.'],
  ];
  for (const [m, want] of refusals) { assert.equal(log.op(m).error, want, J(m)); assert.equal(log.events.length, n); }
  const early = log.els.slice(0, log.gameStart()).find((s) => s.a?.host);
  if (early) assert.equal(log.op({ type: 'edit', id: early.id, msg: early.m }).error, 'That step is in an earlier game.');
  const player = log.els.find((s) => !s.a?.host && s.m.type !== 'join');
  if (player && log.els.indexOf(player) >= log.gameStart() && log.els.indexOf(player) < h.pos) assert.equal(log.op({ type: 'edit', id: player.id, msg: player.m }).error, 'Only the host’s steps can be changed.');
  assert.equal(log.op({ type: 'drop', id: h.id }).kept, true, 'the flagged step can be removed');
  assert.notEqual(log.hold?.id, h.id);
});

test('an edit to the same value records nothing', () => {
  const { log, R } = EP.newGame(SEED0, GameLog); EP.play(log, R);
  const el = log.els.slice(log.gameStart()).find((s) => s.a?.host && EP.FAMILY[s.m.type]);
  const n = log.events.length;
  assert.deepEqual(log.edit(el.id, structuredClone(el.m)), { kept: false });
  assert.equal(log.events.length, n);
});

test('the dry run records nothing and says what happens to each later step', () => {
  let shown = 0, paused = 0;
  for (let seed = SEED0; seed < SEED0 + 30; seed++) {
    const { log, R } = EP.newGame(seed, GameLog); EP.play(log, R);
    const raw = J(log.toJSON()), room = J(log.room);
    const el = log.els.slice(log.gameStart()).filter((s) => s.a?.host && EP.FAMILY[s.m.type]).at(-3);
    if (!el) continue;
    const m = EP.altMsg(log.stateBefore(el.id), el.m, R); if (!m || J(m) === J(el.m)) continue;
    const p = log.preview({ type: 'edit', id: el.id, msg: m });
    assert.equal(J(log.toJSON()), raw, `seed ${seed}: the dry run changed the log`); assert.equal(J(log.room), room);
    if (p.error) continue;
    shown++;
    const after = log.els.slice(log.els.findIndex((s) => s.id === el.id) + 1);
    assert.deepEqual(p.rows.map((r) => r.id), after.map((s) => s.id), `seed ${seed}: one row per later step`);
    for (const r of p.rows) assert.ok(['kept', 'recomputed', 'needs-fixing', 'waiting', 'void'].includes(r.status));
    // The dry run and the real change agree.
    const f = log.fork(); f.op({ type: 'edit', id: el.id, msg: m });
    assert.equal(J(p.room), J(f.room), `seed ${seed}: the dry run's room is not the change's room`);
    assert.equal(J(p.hold), J(f.hold));
    if (p.hold) { paused++; assert.equal(p.rows.filter((r) => r.status === 'needs-fixing').length, 1); }
  }
  assert.ok(shown >= 10, `only ${shown} dry runs`); assert.ok(paused >= 1, 'no dry run paused');
});

test('a change survives a cold start (the DO keeps the raw log; the room is recomputed)', () => {
  const { log } = pausedGame();
  const back = GameLog.restore(JSON.parse(J(log.toJSON())));
  assert.equal(J(back.room), J(log.room)); assert.equal(J(back.hold), J(log.hold)); assert.equal(J(back.voids), J(log.voids));
});

test('labels for the four changes', () => {
  for (const t of META) assert.notEqual(stepLabel({ a: HOST, m: { type: t } }), 'The last change', t);
});

// ---- broken logs the properties must catch ----
// An edited step that draws new dice instead of keeping its own: a same-value edit then rerolls an Executioner's
// target or a Confused Detective's coin. EDICE must fail on it.
class FreshDiceLog extends GameLog {
  editedStep(el, ev, j) { const s = super.editedStep(el, ev, j); return { ...s, e: ev.e }; }
}
test('mutation: an edited step that draws fresh dice fails EDICE', () => {
  const fails = [];
  for (let seed = SEED0; seed < SEED0 + 80 && !fails.length; seed++) { try { EP.EDICE(seed, {}, FreshDiceLog); } catch (e) { fails.push(`seed=${seed}: ${e.message}`); } }
  assert.ok(fails.length, 'EDICE passed on a log that rerolls edited steps');
  assert.match(fails[0], /draws dice/);
});
// A log with no fact checks: a later step that no longer fits runs anyway (a save on a player who is already
// dead, a check on someone else). It pauses far less, and the properties' invariants or E3 must notice.
class NoCheckLog extends GameLog { check(room, el) { return { msg: el.m, probs: [] }; } }
test('mutation: with the fact checks off, changes stop pausing and the properties notice', () => {
  const count = (Log) => { const x = {}; const fails = [];
    for (let seed = SEED0; seed < SEED0 + 40; seed++) { try { EP.E.E3(seed, x, Log); } catch (e) { fails.push(e.message); } }
    return { paused: x.paused || 0, fails }; };
  const real = count(GameLog), broken = count(NoCheckLog);
  assert.deepEqual(real.fails, []);
  assert.ok(real.paused > 0);
  assert.ok(broken.paused < real.paused || broken.fails.length, `checks off: paused ${broken.paused} vs ${real.paused}, ${broken.fails.length} failures`);
});
