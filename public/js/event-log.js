// The game as an event log: every change to a room is one event, and the room = replay(base, events).
// Pure (no storage, no sockets): the Durable Object persists it (src/worker.js), tests drive it directly.
// An event: { a: actor, m: message, e: [4 seed words], t: time }. Replaying an event gives back exactly the
// same room, because the reducer's randomness and clock come from the event (entropy.js).
import { reduce } from './room.js';
import { withEntropy, seededEntropy, newSeed } from './entropy.js';

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
