// E1-E5: "change a past step and keep the later ones" (UNDO-PLAN.md §5, §7.2), ported from the prototype
// (mafia-simplify-1030/undo-proto/edit-props.mjs) onto the P1-P4 kit, so the E-1..E-4 PRs only have to supply the log.
// The log under test (an "edit log") is the shipped GameLog plus:
//   edit(id, msg, { force })  record a META event that replaces step `id`'s message (its seed and time are kept)
//   op({ type: 'edit'|'drop'|'insert'|'cut', ... })   the four META events
//   hold                      null, or { id, pos, type, probs }: paused at the first flagged step
//   voids, els                drafts no longer applied; the effective steps [{ id, a, m, e, t }]
//   gameStart(), stateBefore(id), static restore(json), toJSON(), undoStep(), redoStep()
// Each property takes (seed, x, Log) and throws with the reason on failure; x collects counts.
import { newGame as kitGame, legalActions, check, dry, HOST } from './mafia-props.mjs';
import { rng as simRng } from '../../scripts/sim-lib.mjs';
import { viewForHost } from '../../public/js/room.js';
import { applyEvent } from '../../public/js/event-log.js';
import { unidentifiedSlots } from '../../public/js/engine.js';
import { candidates as targetPool } from '../../scripts/sim-lib.mjs';

export const FAMILY = {
  submitNight: ['submitNight'], condemn: ['condemn', 'noCondemn'], noCondemn: ['noCondemn', 'condemn'], resolvePending: ['resolvePending'],
  identifyRole: ['identifyRole', 'skipIdentify'], skipIdentify: ['skipIdentify', 'identifyRole'], kill: ['kill'], revive: ['revive'],
  setTarget: ['setTarget'], useDay: ['useDay'], declareWinner: ['declareWinner'], assignCard: ['assignCard'],
};
const J = (x) => JSON.stringify(x);
const tally = (x, k) => { x[k] = (x[k] || 0) + 1; };

export function newGame(seed, Log, o = {}) {
  const g = kitGame(seed, { Log, ...o });
  // The game's own clock and seed words for every later move and change (the DO uses Date.now and crypto), so a
  // failing seed fails the same way every run.
  const { log } = g; let t = 1_900_000_000_000, n = seed * 100_000;
  const next = () => { n++; return [Math.imul(n, 2654435761) >>> 0, (n ^ 0x9e3779b9) >>> 0, Math.imul(n, 40503) >>> 0, 7]; };
  // Plain functions on `this`, so a fork() of the log (the dry run) keeps the clock but acts on itself.
  const P = Object.getPrototypeOf(log);
  log.apply = function (a, m, now = (t += 1000), e = next()) { return P.apply.call(this, a, m, now, e); };
  if (P.op) log.op = function (m, x = {}) { return P.op.call(this, m, { now: (t += 1000), seed: next(), ...x }); };
  return { log, R: simRng(seed * 7919 + 13) };
}
export function play(log, R, max = 300) {
  for (let i = 0; i < max && !log.hold; i++) {
    const acts = legalActions(log.room, R.next);
    if (!acts.length) break;
    log.apply(HOST, R.pick(acts));
  }
}

// A different choice for a past step, of the kind the feed lets the Host change. null if there is none.
export function altMsg(room, m, R) {
  const alive = room.players.filter((p) => p.alive), dead = room.players.filter((p) => !p.alive);
  const other = (xs, id) => xs.filter((p) => p.id !== id);
  switch (m.type) {
    case 'submitNight': {
      const v = viewForHost(room);
      const steps = v.script.filter((s) => s.kind === 'action' && (s.targets ?? 1) > 0 && !s.spent);
      if (!steps.length) return null;
      const s = R.pick(steps); const need = s.targets ?? 1; const pool = targetPool(v, s);
      const cur = m.actions?.[s.key] || {};
      const targets = R.chance(0.2) || pool.length < need ? [] : R.shuffle(pool).slice(0, need).map((p) => p.id);
      const x = { ...cur, targets };
      if (s.check === 'random' && !x.flip) x.flip = R.pick(['heads', 'tails']);
      if (s.check === 'fake' && !x.coin) x.coin = R.pick(['mafia', 'innocent']);
      return { ...m, actions: { ...(m.actions || {}), [s.key]: x } };
    }
    case 'condemn': { const o = other(alive, m.playerId); return R.chance(0.25) || !o.length ? { type: 'noCondemn' } : { type: 'condemn', playerId: R.pick(o).id }; }
    case 'noCondemn': return alive.length ? { type: 'condemn', playerId: R.pick(alive).id } : null;
    case 'resolvePending': { const o = other(alive, m.targetId); return { ...m, targetId: R.chance(0.3) || !o.length ? undefined : R.pick(o).id }; }
    case 'identifyRole': case 'skipIdentify': {
      const open = room.players.filter((p) => !p.roleId);
      const slot = (unidentifiedSlots(room) || []).find((s) => s.roleId === m.roleId);
      if (!slot) return null;
      if (R.chance(0.3) || open.length < slot.remaining) return { type: 'skipIdentify', roleId: m.roleId };
      return { type: 'identifyRole', roleId: m.roleId, playerIds: R.shuffle(open).slice(0, slot.remaining).map((p) => p.id) };
    }
    case 'kill': { const o = other(alive, m.playerId); return o.length ? { ...m, playerId: R.pick(o).id } : null; }
    case 'revive': { const o = other(dead, m.playerId); return o.length ? { ...m, playerId: R.pick(o).id } : null; }
    case 'useDay': { const o = other(alive, m.playerId); return o.length ? { ...m, playerId: R.pick(o).id } : null; }
    case 'declareWinner': return { ...m, side: R.pick(['cult', 'killer', 'draw'].filter((s) => s !== m.side)) };
    default: return null;
  }
}
// "Pick again" on a flagged night: each step named in the flag gets a new target, or a skip when it can't be used.
export function repickNight(room, m, probs, R) {
  const v = viewForHost(room); const keys = new Set(probs.map((p) => p.split(':').slice(1, 3).join(':')).filter((k) => k.includes(':')));
  const actions = { ...(m.actions || {}) };
  for (const k of keys) {
    const s = v.script.find((y) => y.key === k && y.kind === 'action');
    const pool = s ? targetPool(v, s) : []; const need = s?.targets ?? 1;
    actions[k] = s && !s.spent && s.actors.some((id) => room.players.find((p) => p.id === id)?.alive) && pool.length >= need && R.chance(0.8)
      ? { ...actions[k], targets: R.shuffle(pool).slice(0, need).map((p) => p.id) } : { targets: [] };
  }
  return { ...m, actions };
}
// A random editable past step in the current game, with up to 6 tries at a different choice.
export function randomEdit(log, R) {
  const gs = log.gameStart(); const top = log.hold ? log.hold.pos : log.els.length;
  const cand = log.els.slice(gs, top).filter((s) => FAMILY[s.m.type] && s.a.host);
  for (let tries = 0; tries < 6 && cand.length; tries++) {
    const el = R.pick(cand); const room = log.stateBefore(el.id);
    const m = altMsg(room, el.m, R);
    if (!m || J(m) === J(el.m)) continue;
    if (log.edit(el.id, m).kept) return { id: el.id, from: el.m, to: m };
  }
  return null;
}
// Resolve the flag: pick again (60%), remove (35%), end the game there (5%); answer a new prompt first if needed.
export function resolveOne(log, R, x) {
  const h = log.hold; const el = log.els[h.pos]; const p = R.next();
  if (el.m.type === 'startNight' && log.room.pending?.length) {
    const pend = log.room.pending[0]; const al = log.room.players.filter((q) => q.alive);
    const r = log.op({ type: 'insert', before: el.id, msg: { type: 'resolvePending', pendingId: pend.id, ...(al.length && R.chance(0.5) ? { targetId: R.pick(al).id } : {}) } });
    if (r.kept) { tally(x, 'insert'); return; }
  }
  if (p < 0.6 && FAMILY[el.m.type]) {
    for (let k = 0; k < 6; k++) {
      let m = el.m.type === 'submitNight' ? repickNight(log.room, el.m, h.probs, R) : altMsg(log.room, el.m, R);
      if (m?.type === 'resolvePending' && log.room.pending?.length) m = { ...m, pendingId: log.room.pending[0].id };
      if (m && log.op({ type: 'edit', id: el.id, msg: m }).kept) { tally(x, 'fix'); return; }
    }
  }
  if (p > 0.95) { log.op({ type: 'cut', id: el.id }); tally(x, 'cut'); return; }
  const r = log.op({ type: 'drop', id: el.id }); if (!r.kept) throw new Error(`drop refused: ${r.error}`);
  tally(x, 'drop');
}

const valid = (log, ctx) => {
  const v = check(log.room, { held: !!log.hold });
  if (v.length) throw new Error(`${ctx}: ${v.join('; ')}${log.hold ? ` [held at ${log.hold.type} ${log.hold.probs}]` : ''}`);
};
const snap = (log) => J({ room: log.room, hold: log.hold, voids: log.voids, eff: log.els.map((s) => [s.id, s.m]) });
const deterministic = (log, Log, ctx) => {
  const a = Log.restore(JSON.parse(J(log.toJSON()))); const b = Log.restore(JSON.parse(J(log.toJSON()))); // cold starts from storage
  if (snap(a) !== snap(log)) throw new Error(`${ctx}: replay from storage differs from the live room`);
  if (snap(a) !== snap(b)) throw new Error(`${ctx}: two replays differ`);
};

export const E = {
  E1(seed, x, Log) { // edit then undo = the original; redo = the edited state; a new move after the undo drops the edit
    const { log, R } = newGame(seed, Log); play(log, R);
    const before = snap(log), raw = J(log.events), cur = log.cursor;
    const e = randomEdit(log, R); if (!e) return 0; tally(x, 'edits'); if (log.hold) tally(x, 'paused');
    const after = snap(log);
    if (log.undoStep() === null) throw new Error('undo refused after an edit');
    if (snap(log) !== before) throw new Error('undo of the edit is not the original state');
    if (log.cursor !== cur || J(log.events.slice(0, cur)) !== raw) throw new Error('undo of the edit is not the original log');
    log.redoStep(); if (snap(log) !== after) throw new Error('redo of the edit is not the edited state');
    log.undoStep(); log.apply(HOST, { type: 'toggleTag', playerId: log.room.players[0].id, tag: 'blue' });
    if (log.events.length !== cur + 1) throw new Error('a new move after undoing an edit kept the edit');
    return 1;
  },
  E2(seed, x, Log) { // same value: a no-op; forced through, it changes nothing and flags nothing (no false flags)
    const { log, R } = newGame(seed, Log); play(log, R);
    const cand = log.els.slice(log.gameStart()).filter((s) => FAMILY[s.m.type] && s.a.host);
    let n = 0;
    for (const el of R.shuffle(cand).slice(0, 4)) {
      const before = snap(log), rev = log.rev, len = log.events.length;
      const r = log.edit(el.id, structuredClone(el.m));
      if (r.kept || log.rev !== rev || log.events.length !== len || snap(log) !== before) throw new Error(`same-value edit of ${el.m.type} was recorded`);
      const f = log.edit(el.id, structuredClone(el.m), { force: true });
      if (!f.kept) throw new Error(`forced same-value edit refused: ${f.error}`);
      const s = JSON.parse(snap(log)), b = JSON.parse(before);
      if (s.hold) throw new Error(`same-value edit of ${el.m.type} flagged ${s.hold.type}: ${s.hold.probs}`);
      if (J(s.room) !== J(b.room) || J(s.voids) !== J(b.voids)) throw new Error(`same-value edit of ${el.m.type} changed the room`);
      log.undoStep(); if (snap(log) !== before) throw new Error('undo of the forced edit differs');
      n++; tally(x, 'edits');
    }
    return n;
  },
  E3(seed, x, Log) { // after any edit: replay is deterministic, and the room is valid or paused with a reason
    const { log, R } = newGame(seed, Log); play(log, R);
    let n = 0;
    for (let k = 0; k < 3; k++) {
      const e = randomEdit(log, R); if (!e) break; n++; tally(x, 'edits');
      deterministic(log, Log, `edit ${k}`); valid(log, `edit ${k} (${e.from.type})`);
      if (log.hold) { tally(x, 'paused'); if (!log.hold.probs.length) throw new Error('paused with no reason'); break; }
    }
    return n;
  },
  E4(seed, x, Log) { // every flag can be resolved; then the room is valid and play goes on
    const { log, R } = newGame(seed, Log); play(log, R);
    if (!randomEdit(log, R)) return 0; tally(x, 'edits');
    let k = 0;
    while (log.hold) { if (++k > 2000) throw new Error('flags never end'); tally(x, 'flags'); resolveOne(log, R, x); valid(log, `fix ${k}`); }
    deterministic(log, Log, 'after fixes'); valid(log, 'after fixes');
    for (let i = 0; i < 60 && log.room.phase !== 'over'; i++) {
      const acts = legalActions(log.room, R.next); if (!acts.length) throw new Error(`no move after fixes in ${log.room.phase}`);
      log.apply(HOST, R.pick(acts)); valid(log, `play ${i} after fixes`);
    }
    return 1 + k;
  },
  E5(seed, x, Log) { // random moves, undo, redo, edits and fixes; then P1 and P2 on the result
    const { log, R } = newGame(seed, Log);
    let n = 0;
    for (; n < 150; n++) {
      const p = R.next(); let op;
      if (log.hold && p < 0.7) { resolveOne(log, R, x); op = 'fix'; }
      else if (p < 0.5 && !log.hold) { const acts = legalActions(log.room, R.next); if (acts.length) { log.apply(HOST, R.pick(acts)); op = 'move'; } else op = 'none'; }
      else if (p < 0.65) op = log.undoStep() === null ? 'none' : 'undo';
      else if (p < 0.75) op = log.redoStep() === null ? 'none' : 'redo';
      else op = randomEdit(log, R) ? 'edit' : 'none';
      tally(x, op); valid(log, `op ${n} (${op})`);
      if (n % 25 === 0) deterministic(log, Log, `op ${n}`);
    }
    deterministic(log, Log, 'end');
    const end = snap(log); let k = 0; const total = 1 + R.int(30);
    for (; k < total && log.undoStep() !== null; k++);
    for (let i = 0; i < k; i++) if (log.redoStep() === null) throw new Error(`redo ${i} of ${k} refused`);
    if (snap(log) !== end) throw new Error(`P1: undo ${k} then redo ${k} is not the same`);
    let u = 0; while (log.undoStep() !== null) { u++; valid(log, `P2 undo ${u}`); }
    if (log.room.phase !== 'lobby') throw new Error(`P2: undo to the start ends in ${log.room.phase}`);
    return n + 2 * k + u;
  },
};

// Steps that draw dice when they run (UNDO-PLAN §5.5 point 6, the weak spot of E2): a blind match that draws an
// Executioner's target, a Confused Detective check with no stored flip, a fake check with no coin. A step counts only
// if running it with other seed words really changes the room, so the list is exactly the steps whose dice matter.
// EDICE: editing one of them to the same value (forced) must give the same room, because the step keeps its own
// seed. A log that gives an edited step new dice fails this on the first such step.
const otherDice = (e) => e.map((w) => (w ^ 0x9e3779b9) >>> 0);
export function diceSteps(log) {
  return log.els.filter((s) => {
    if (!s.a?.host || !FAMILY[s.m.type]) return false;
    const at = log.stateBefore(s.id); if (!at) return false;
    const a = structuredClone(at), b = structuredClone(at);
    applyEvent(a, s); applyEvent(b, { ...s, e: otherDice(s.e) });
    return J(a) !== J(b);
  });
}
export function EDICE(seed, x, Log) {
  const { log, R } = newGame(seed, Log, { dice: true }); play(log, R);
  let n = 0;
  for (const el of diceSteps(log).slice(-4)) {
    const before = snap(log);
    const f = log.edit(el.id, structuredClone(el.m), { force: true });
    if (!f.kept) continue;
    if (J(JSON.parse(snap(log)).room) !== J(JSON.parse(before).room)) throw new Error(`a same-value edit of ${el.m.type} (a step that draws dice) changed the room`);
    log.undoStep(); n++; tally(x, `dice:${el.m.type}`);
  }
  return n;
}
export { dry };
