// The game as an event log: every change to a room is one event, and the room = replay(base, events).
// Pure (no storage, no sockets): the Durable Object persists it (src/worker.js), tests drive it directly.
// An event: { a: actor, m: message, e: [4 seed words], t: time }. Replaying an event gives back exactly the
// same room, because the reducer's randomness and clock come from the event (entropy.js).
import { reduce } from './room.js';
import { withEntropy, seededEntropy, newSeed } from './entropy.js';
import { UNDO_PAST_GAME_OVER } from './config-defaults.js';

export const SNAP_EVERY = 64; // a checkpoint (whole room) every 64 events, so a replay never runs more than 64
export const LOG_VERSION = 1;

const clone = (x) => structuredClone(x);

// Applies one event to a room, in place, the same way live and in replay. Returns the reducer's result.
export function applyEvent(room, ev) {
  const res = withEntropy(seededEntropy(ev.e, ev.t), () => reduce(room, ev.a, ev.m));
  room.updated = ev.t;
  return res;
}

export const makeEvent = (actor, msg, now = Date.now(), seed = newSeed()) => ({ a: actor, m: msg, e: seed, t: now });

// Runs a message against a live room as an event and reports whether the room changed. The caller keeps the
// event only when it did: some refused messages still count (a wrong card guess adds a strike), and an accepted
// one that changed nothing is not worth a step of undo.
export function commit(room, actor, msg, now, seed) {
  const before = JSON.stringify(room);
  const ev = makeEvent(actor, msg, now, seed);
  const res = withEntropy(seededEntropy(ev.e, ev.t), () => reduce(room, ev.a, ev.m));
  const changed = JSON.stringify(room) !== before;
  if (changed) room.updated = ev.t;
  return { res, ev, changed };
}

// Replays events [from, to) on a copy of `start`. Throws if an event is refused differently from live.
export function replay(start, events, from = 0, to = events.length) {
  const room = clone(start);
  for (let i = from; i < to; i++) applyEvent(room, events[i]);
  return room;
}

// The whole log in memory (tests, local play, and the shape the DO stores in chunks).
// cursor = how many events are in effect; events past it are the redo branch. rev bumps on every change.
export class GameLog {
  constructor(base, { snapEvery = SNAP_EVERY } = {}) {
    this.base = clone(base);
    this.events = [];
    this.cursor = 0;
    this.rev = 0;
    this.snapEvery = snapEvery;
    this.snaps = new Map(); // index (multiple of snapEvery) -> room after that many events
    this.room = clone(base);
  }
  static restore({ base, events, cursor, rev, snaps }, opts) {
    const g = new GameLog(base, opts);
    g.events = events.slice(); g.cursor = cursor; g.rev = rev;
    for (const [i, s] of snaps || []) g.snaps.set(Number(i), clone(s));
    g.room = g.stateAt(cursor);
    return g;
  }
  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.events.length; }

  // The room after the first i events, from the nearest checkpoint at or before i.
  stateAt(i) {
    let k = Math.floor(i / this.snapEvery) * this.snapEvery;
    while (k > 0 && !this.snaps.has(k)) k -= this.snapEvery;
    return replay(k ? this.snaps.get(k) : this.base, this.events, k, i);
  }

  // A new message: drops the redo branch, applies it, keeps it if it changed the room.
  apply(actor, msg, now = Date.now(), seed = undefined) {
    const r = commit(this.room, actor, msg, now, seed);
    if (!r.changed) return { ...r.res, kept: false };
    if (this.cursor < this.events.length) {
      this.events.length = this.cursor;
      for (const k of this.snaps.keys()) if (k > this.cursor) this.snaps.delete(k);
    }
    this.events.push(r.ev);
    this.cursor++;
    this.rev++;
    if (this.cursor % this.snapEvery === 0) this.snaps.set(this.cursor, clone(this.room));
    return { ...r.res, kept: true, ev: r.ev };
  }
  // Undo to any point (default: one event back). Redo moves forward again on the same events.
  undo(steps = 1) { return this.moveTo(this.cursor - steps); }
  redo(steps = 1) { return this.moveTo(this.cursor + steps); }
  moveTo(i) {
    if (!Number.isInteger(i) || i < 0 || i > this.events.length) return false;
    if (i === this.cursor) return true;
    this.room = this.stateAt(i);
    this.cursor = i; this.rev++;
    return true;
  }
  // One Host step back or forward (see undoTarget / redoTarget). Returns the step's label, or null.
  undoStep(opts) { const i = undoTarget(this.events, this.cursor, this.room, opts); if (i === null) return null; const label = stepLabel(this.events[i], this.room); this.moveTo(i); return label; }
  redoStep() { const i = redoTarget(this.events, this.cursor); if (i === null) return null; const label = stepLabel(this.events[this.cursor + firstHost(this.events, this.cursor)], this.stateAt(this.cursor)); this.moveTo(i); return label; }
  history(opts) { return historyInfo(this.events, this.cursor, this.room, opts); }
  toJSON() { return { v: LOG_VERSION, base: this.base, events: this.events, cursor: this.cursor, rev: this.rev, snaps: [...this.snaps] }; }
}

// ---------- chunked storage layout (the DO's keys; one value per chunk keeps each well under the 2 MB limit) ----------
// elog:meta  { v, rev, cursor, len, snapEvery, updated }   elog:base  the starting room
// elog:c:<k> events [k*snapEvery, (k+1)*snapEvery)         elog:s:<k> the room after k*snapEvery events (k >= 1)
export const KEY = { meta: 'elog:meta', base: 'elog:base', chunk: (k) => `elog:c:${k}`, snap: (k) => `elog:s:${k}` };
export const chunkOf = (i, snapEvery = SNAP_EVERY) => Math.floor(i / snapEvery);

// What to write after event number `i` (0-based) was appended: the meta, its chunk, and a checkpoint when one is due.
export function writesAfterAppend(meta, chunkEvents, room) {
  const i = meta.len - 1;
  const k = chunkOf(i, meta.snapEvery);
  const out = { [KEY.meta]: meta, [KEY.chunk(k)]: chunkEvents };
  if (meta.len % meta.snapEvery === 0) out[KEY.snap(meta.len / meta.snapEvery)] = room;
  return out;
}

// ---------- Host steps: what Undo and Redo move over ----------
// A step is one Host event. Undo goes back to just before the last Host event; anything players did after it (a
// card claim, a Graveyard post) goes with it, because the room after an event depends on everything before it.
// Redo goes forward over the next Host event and whatever players did after it, up to the next Host event.
// Undo is off in the lobby (it would drop players who joined on their own phones) and, unless UNDO_PAST_GAME_OVER,
// on the end screen.
const isHost = (ev) => !!ev?.a?.host;
function firstHost(events, from) { for (let i = from; i < events.length; i++) if (isHost(events[i])) return i - from; return -1; }
export function undoTarget(events, cursor, room, { pastOver = UNDO_PAST_GAME_OVER } = {}) {
  if (!room || room.phase === 'lobby' || (room.phase === 'over' && !pastOver)) return null;
  for (let i = cursor - 1; i >= 0; i--) if (isHost(events[i])) return i;
  return null;
}
export function redoTarget(events, cursor) {
  const f = firstHost(events, cursor); if (f < 0) return null;
  const j = cursor + f + 1; const g = firstHost(events, j);
  return g < 0 ? events.length : j + g;
}
// "Undo: Sam voted out". Names come from the room the step was taken in (or the room now: names don't change mid-game).
const VERB = {
  submitNight: () => 'End of the night', startNight: () => 'Start of the night', startDay: () => 'Start of the day', deal: () => 'The deal', undeal: () => 'Back to setup',
  condemn: (n) => `${n} voted out`, noCondemn: () => 'No one voted out', kill: (n) => `${n} eliminated`, revive: (n) => `${n} brought back`,
  resolvePending: () => 'A last shot', declareWinner: () => 'The winner', identifyRole: () => 'Marking a role', skipIdentify: () => 'Skipping a role',
  nightUi: () => 'A night pick', assignCard: (n) => `${n}’s card`, clearCard: (n) => `${n}’s card`, setRole: (n) => `${n}’s role`, setTarget: (n) => `${n}’s target`,
  playAgain: () => 'Play again', restart: () => 'Restart', newGame: () => 'New game', setConfig: () => 'A setup change', useDay: (n) => `${n}’s day ability`,
  toggleTag: (n) => `A note on ${n}`, setNote: (n) => `A note on ${n}`, moveSeat: (n) => `${n}’s seat`, seatWhere: (n) => `${n}’s seat`, renamePlayer: () => 'A name change',
};
export function stepLabel(ev, room) {
  if (!ev) return '';
  const name = room?.players?.find((p) => p.id === ev.m?.playerId)?.name || 'A player';
  return (VERB[ev.m?.type] || (() => 'The last change'))(name);
}
export function historyInfo(events, cursor, room, opts) {
  const u = undoTarget(events, cursor, room, opts); const f = firstHost(events, cursor);
  return {
    canUndo: u !== null, undoLabel: u !== null ? stepLabel(events[u], room) : '',
    canRedo: f >= 0, redoLabel: f >= 0 ? stepLabel(events[cursor + f], room) : '',
  };
}
