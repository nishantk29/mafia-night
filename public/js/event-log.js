// The game as an event log: every change to a room is one event, and the room = replay(base, events).
// Pure (no storage, no sockets): the Durable Object persists it (src/worker.js), tests drive it directly.
// An event: { a: actor, m: message, e: [4 seed words], t: time, c: stamp }. Replaying an event gives back exactly the
// same room, because the reducer's randomness and clock come from the event (entropy.js).
//
// Changing a past step and keeping the later ones (UNDO-PLAN.md sections 2.2 and 5; Nishant, Oct 30): the log stays
// append-only. A change is one more Host event, a META event:
//   {type:'edit', id, msg}        replace step `id`'s message (its seed words and time are kept)
//   {type:'drop', id}             take the flagged step out
//   {type:'insert', before, msg}  add a Host step before the flagged one (answer a prompt the change created)
//   {type:'cut', id}              take the flagged step and everything after it out ("End the game here")
// `id` is the log index of the event that first recorded the step, so it never moves. The game's steps ("els") are a
// fold of the log prefix: plain events append, meta events rewrite. The room is the replay of those steps, with
// checks: each step carries a stamp `c` = { ok, f } made when it was recorded (did the reducer accept it, and the
// facts its checks read: target alive, actor alive, step called tonight...). A step whose facts no longer hold, or
// that the reducer now answers differently, is FLAGGED: the replay stops there and the game is paused (`hold`) until
// the host picks again, removes it or ends the game there. Drafts and talk (nightUi, chat, a seat takeover) never
// pause; they are VOID when they no longer fit. Room, hold and voids are pure functions of events[0..cursor), so
// a reload or a cold start comes back to the same place, and Undo of a change is exact.
import { reduce } from './room.js';
import { withEntropy, seededEntropy, newSeed } from './entropy.js';
import { UNDO_PAST_GAME_OVER } from './config-defaults.js';
import { nightScript, rulesOf, stalemateOf } from './engine.js';

export const SNAP_EVERY = 64; // a checkpoint (whole room) every 64 events, so a replay never runs more than 64
export const LOG_VERSION = 1;
const CHECK_EVERY = 32;       // in-memory replay points for logs with changes, keyed by the content of the steps before them

const clone = (x) => structuredClone(x);
const J = (x) => JSON.stringify(x);
const HOST = { host: true };

export const META = new Set(['edit', 'drop', 'insert', 'cut']);
export const isMeta = (ev) => !!ev?.a?.host && META.has(ev?.m?.type);
// A step in an earlier game can't be changed: these start a new one.
const BOUNDARY = new Set(['deal', 'restart', 'playAgain', 'newGame', 'undeal']);
// Never pause the game: a draft or talk that no longer fits is void (kept in the log, not applied).
const SOFT = new Set(['nightUi', 'chat', 'join']);
// What a past step may be changed into (a vote can become "no one", a match can become "no one has this card").
export const FAMILY = {
  submitNight: ['submitNight'], condemn: ['condemn', 'noCondemn'], noCondemn: ['noCondemn', 'condemn'], resolvePending: ['resolvePending'],
  identifyRole: ['identifyRole', 'skipIdentify'], skipIdentify: ['skipIdentify', 'identifyRole'], kill: ['kill'], revive: ['revive'],
  setTarget: ['setTarget'], useDay: ['useDay'], declareWinner: ['declareWinner'], assignCard: ['assignCard'],
};

// The facts a step's checks read, from the room just before it (UNDO-PLAN section 5.3). true = fine.
export function facts(room, m) {
  const f = {}; const P = (id) => room.players.find((p) => p.id === id); const alive = (id) => !!P(id)?.alive;
  switch (m?.type) {
    case 'submitNight': {
      if (room.phase !== 'night') break;
      const script = nightScript(room).filter((s) => s.kind === 'action');
      const selfOk = rulesOf(room).selfProtect;
      for (const [k, x] of Object.entries(m.actions || {})) {
        const t = Array.isArray(x?.targets) ? x.targets : [];
        if (!t.length && !x?.on) continue; // a skip has nothing to check
        const s = script.find((y) => y.key === k);
        f[`step:${k}`] = !!s;
        if (!s) continue;
        f[`role:${k}`] = `${s.roleId}/${s.type}`;
        f[`live:${k}`] = s.actors.some(alive);
        f[`power:${k}`] = !s.spent;
        f[`distinct:${k}`] = new Set(t).size === t.length;
        for (const id of t) f[`tgt:${k}:${id}`] = !!P(id) && (s.dead ? !alive(id) : alive(id)) && ((s.type === 'protect' && selfOk) || !s.actors.includes(id));
      }
      break;
    }
    case 'condemn': case 'kill': f.tgt = alive(m.playerId); break;
    case 'revive': f.tgt = !!P(m.playerId) && !alive(m.playerId); break;
    case 'useDay': f.actor = alive(m.playerId); break;
    case 'setTarget': f.actor = alive(m.playerId); if (m.targetId) f.tgt = alive(m.targetId); break;
    case 'resolvePending': { const p = (room.pending || []).find((x) => x.id === m.pendingId); f.bind = p?.playerId ?? null; if (m.targetId) f.tgt = alive(m.targetId); break; }
    case 'declareWinner': f.stalemate = !!stalemateOf(room)?.sides?.includes(m.side); break;
    default: break;
  }
  return f;
}
// The stamp kept with every event: accepted or not, and the facts (left out when there are none, to keep chunks small).
export function stamp(room, m, ok) { const f = facts(room, m); return Object.keys(f).length ? { ok, f } : { ok }; }

// Checks a recorded step against the room it now lands on. Returns { msg, probs }: the message to apply (a prompt
// answer is re-bound to the same dead player's prompt, since prompt ids count up and shift after a change) and what
// is wrong. A fact that was already false when the step was recorded (a legal pick that does nothing) never flags.
export function checkStep(room, el) {
  let msg = el.m; const probs = [];
  const rec = el.c?.f || {};
  if (msg.type === 'resolvePending' && rec.bind) {
    const p = (room.pending || []).find((x) => x.playerId === rec.bind);
    if (!p) return { msg, probs: ['prompt-gone'] };
    msg = { ...msg, pendingId: p.id };
  }
  const now = facts(room, msg);
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'bind' || !(k in now)) continue;
    if (typeof v === 'boolean' ? v && !now[k] : now[k] !== v) probs.push(k);
  }
  return { msg, probs };
}

// A small digest of what a step did, to tell "kept" from "recomputed" in the confirm sheet's dry run.
export function face(room) {
  return {
    phase: room.phase, day: room.day, night: room.night, winner: room.winner?.side || null,
    alive: room.players.map((p) => (p.alive ? 1 : 0)).join(''), roles: room.players.map((p) => p.roleId || '-').join(','),
    targets: room.players.map((p) => p.target || '').join(','), jester: room.players.map((p) => (p.becameJester ? 1 : 0)).join(''),
    results: (room.results || []).length, lastResults: (room.results || []).slice(-6).map((r) => r.text).join('|'),
    pending: (room.pending || []).map((x) => x.playerId).join(','), deaths: (room.lastReport?.deaths || []).map((d) => d.id).join(','),
  };
}
const diffFace = (a, b) => { const d = {}; for (const k of Object.keys(b)) if (a[k] !== b[k]) d[k] = b[k]; return d; };
// FNV-1a: a replay point's key is the content of every step before it.
const fnv = (h, s) => { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };

// Applies one event to a room, in place, the same way live and in replay. Returns the reducer's result.
export function applyEvent(room, ev, msg = ev.m) {
  const res = withEntropy(seededEntropy(ev.e, ev.t), () => reduce(room, ev.a, msg));
  room.updated = ev.t;
  return res;
}

export const makeEvent = (actor, msg, now = Date.now(), seed = newSeed()) => ({ a: actor, m: msg, e: seed, t: now });

// Runs a message against a live room as an event and reports whether the room changed. The caller keeps the
// event only when it did: some refused messages still count (a wrong card guess adds a strike), and an accepted
// one that changed nothing is not worth a step of undo. The event carries its stamp (facts read before the move).
export function commit(room, actor, msg, now, seed) {
  const before = JSON.stringify(room);
  const ev = makeEvent(actor, msg, now, seed);
  const f = facts(room, msg);
  const res = withEntropy(seededEntropy(ev.e, ev.t), () => reduce(room, ev.a, ev.m));
  const changed = JSON.stringify(room) !== before;
  if (changed) room.updated = ev.t;
  ev.c = Object.keys(f).length ? { ok: !res.error, f } : { ok: !res.error };
  return { res, ev, changed };
}

// Replays events [from, to) on a copy of `start` (a log with no changes in it: every event as it was recorded).
export function replay(start, events, from = 0, to = events.length) {
  const room = clone(start);
  for (let i = from; i < to; i++) applyEvent(room, events[i]);
  return room;
}

// The whole log in memory (tests, local play, and the shape the DO stores in chunks).
// cursor = how many events are in effect; events past it are the redo branch. rev bumps on every change.
// room, hold, voids and els always describe events[0..cursor).
export class GameLog {
  constructor(base, { snapEvery = SNAP_EVERY } = {}) {
    this.base = clone(base);
    this.events = [];
    this.cursor = 0;
    this.rev = 0;
    this.snapEvery = snapEvery;
    this.snaps = new Map(); // index (multiple of snapEvery) -> room after that many events
    this.cache = new Map(); // content key -> { room JSON, voids }: replay points for logs with changes
    this.room = clone(base);
    this.hold = null; this.voids = []; this.els = [];
  }
  static restore({ base, events, cursor, rev, snaps }, opts) {
    const g = new GameLog(base, opts);
    g.events = events.slice(); g.cursor = cursor; g.rev = rev;
    for (const [i, s] of snaps || []) g.snaps.set(Number(i), clone(s));
    g.stampOld();
    g.setTo(cursor);
    return g;
  }
  // Events recorded before stamps existed get theirs once, by replaying the log as it was (no changes are possible
  // in such a log, so the replay is the recording).
  stampOld() {
    if (this.events.every((ev) => ev.c) || this.events.some(isMeta)) return;
    this.stamped = true; // the caller can save the derived stamps once
    const room = clone(this.base);
    this.events = this.events.map((ev) => {
      if (ev.c) { applyEvent(room, ev); return ev; }
      const f = facts(room, ev.m); const res = applyEvent(room, ev);
      return { ...ev, c: Object.keys(f).length ? { ok: !res.error, f } : { ok: !res.error } };
    });
  }
  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.events.length; }
  hasMeta(to = this.cursor) { for (let i = 0; i < to; i++) if (isMeta(this.events[i])) return true; return false; }

  // ---- the game's steps: the fold of the log prefix ----
  check(room, el) { return checkStep(room, el); }
  editedStep(el, ev, j) { return { ...el, m: ev.m.msg, c: ev.c, k: `${j}:${ev.e[0]}` }; } // the step keeps its own seed words and time
  fold(i = this.cursor) {
    const els = [];
    for (let j = 0; j < i; j++) {
      const ev = this.events[j];
      if (!isMeta(ev)) { els.push({ id: j, a: ev.a, m: ev.m, e: ev.e, t: ev.t, c: ev.c, k: `${j}:${ev.e[0]}` }); continue; }
      const m = ev.m; const at = els.findIndex((x) => x.id === (m.type === 'insert' ? m.before : m.id));
      if (at < 0) continue; // op() never writes one; a log edited by hand just ignores it
      if (m.type === 'edit') els[at] = this.editedStep(els[at], ev, j);
      else if (m.type === 'drop') els.splice(at, 1);
      else if (m.type === 'insert') els.splice(at, 0, { id: j, a: ev.a, m: m.msg, e: ev.e, t: ev.t, c: ev.c, k: `${j}:${ev.e[0]}` });
      else if (m.type === 'cut') els.length = at;
    }
    return els;
  }

  // Replays the steps of events[0, i) with checks. Pure: depends only on events[0..i).
  // upto: stop before step position `upto` (the room just before a step). lookahead: on a flag, skip the step and
  // go on (only the dry run uses it, to estimate how many later steps may also need fixing). digests: per-step faces.
  compute(i = this.cursor, { upto = Infinity, lookahead = false, digests = null, els = this.fold(i) } = {}) {
    const end = Math.min(upto, els.length);
    const hs = [2166136261]; for (let p = 0; p < end; p++) hs.push(fnv(hs[p], els[p].k + '|'));
    let p = Math.floor(end / CHECK_EVERY) * CHECK_EVERY; let hit = null;
    for (; p > 0; p -= CHECK_EVERY) if ((hit = this.cache.get(hs[p]))) break;
    let r = hit ? JSON.parse(hit.room) : clone(this.base);
    const voids = hit ? [...hit.voids] : []; const flags = [];
    for (; p < end; p++) {
      if (p && p % CHECK_EVERY === 0 && !lookahead && !this.cache.has(hs[p])) this.cache.set(hs[p], { room: J(r), voids: [...voids] });
      const el = els[p];
      const { msg, probs } = el.c ? this.check(r, el) : { msg: el.m, probs: [] };
      const before = digests ? face(r) : null;
      if (!probs.length) {
        // A refused move leaves the room as it was, except a player's wrong card guess and the clock: keep a copy where
        // the reducer could still change something, so a flagged step is never half-applied.
        const snap = !el.a?.host || el.c?.ok === false ? J(r) : null; const upd = r.updated;
        const res = applyEvent(r, el, clone(msg));
        if (el.c && !res.error !== el.c.ok) {
          probs.push(res.error ? `refused: ${res.error}` : 'now-accepted');
          if (snap) r = JSON.parse(snap); else r.updated = upd;
        }
      }
      if (probs.length) {
        if (SOFT.has(el.m.type)) { voids.push(el.id); continue; }
        if (!lookahead) return { room: r, hold: { id: el.id, pos: p, type: el.m.type, probs }, voids, els, flags };
        flags.push({ id: el.id, pos: p, type: el.m.type, probs }); continue;
      }
      if (digests) digests.set(el.id, J(diffFace(before, face(r))));
    }
    return { room: r, hold: null, voids, els, flags };
  }
  // Points this log at events[0, i): a log with no changes replays from its stored checkpoints, as before.
  setTo(i) {
    if (!this.hasMeta(i)) { this.room = this.stateAt(i); this.hold = null; this.voids = []; this.els = this.fold(i); return; }
    const s = this.compute(i); this.room = s.room; this.hold = s.hold; this.voids = s.voids; this.els = s.els;
  }

  // The room after the first i events. With no change in them, from the nearest stored checkpoint at or before i.
  stateAt(i) {
    if (this.hasMeta(i)) return this.compute(i).room;
    let k = Math.floor(i / this.snapEvery) * this.snapEvery;
    while (k > 0 && !this.snaps.has(k)) k -= this.snapEvery;
    return replay(k ? this.snaps.get(k) : this.base, this.events, k, i);
  }
  // The room just before step `id` (what its picker shows), or null.
  stateBefore(id) { const pos = this.els.findIndex((x) => x.id === id); return pos < 0 ? null : this.compute(this.cursor, { upto: pos, els: this.els }).room; }
  // Position of the first step of the current game: steps before it can't be changed.
  gameStart(els = this.els) { let s = 0; els.forEach((x, p) => { if (BOUNDARY.has(x.m.type)) s = p + 1; }); return s; }

  dropRedo() {
    if (this.cursor >= this.events.length) return;
    this.events.length = this.cursor;
    for (const k of this.snaps.keys()) if (k > this.cursor) this.snaps.delete(k);
  }
  push(ev) {
    this.dropRedo();
    this.events.push(ev); this.cursor++; this.rev++;
    if (this.cursor % this.snapEvery === 0) this.snaps.set(this.cursor, clone(this.room));
  }

  // A new message: drops the redo branch, applies it, keeps it if it changed the room. Refused while paused.
  apply(actor, msg, now = Date.now(), seed = undefined) {
    if (this.hold) return { error: 'Fix the flagged step first.', kept: false, held: true };
    const r = commit(this.room, actor, msg, now, seed);
    if (!r.changed) return { ...r.res, kept: false };
    this.push(r.ev);
    const j = this.events.length - 1;
    this.els.push({ id: j, a: r.ev.a, m: r.ev.m, e: r.ev.e, t: r.ev.t, c: r.ev.c, k: `${j}:${r.ev.e[0]}` });
    return { ...r.res, kept: true, ev: r.ev };
  }

  // ---- changes to past steps: one meta event each, refused (nothing recorded) unless it fits ----
  // An edit is checked on the room just before the step: the reducer must accept the new message, and every new
  // choice must pass its fact check. A part the host didn't touch may stay as it was recorded (a pick for a dead
  // role's call, which the rules allow and which does nothing). An edit to the same value is not recorded.
  op(m, { now = Date.now(), seed = newSeed(), actor = HOST, force = false } = {}) {
    if (!m || !META.has(m.type)) return { error: 'Unknown change.' };
    const els = this.els; const gs = this.gameStart();
    const idOf = m.type === 'insert' ? m.before : m.id;
    const pos = els.findIndex((x) => x.id === idOf);
    if (pos < 0) return { error: 'No such step.' };
    if (pos < gs) return { error: 'That step is in an earlier game.' };
    if (this.hold && pos > this.hold.pos) return { error: 'That step waits for the flagged step.' };
    if (m.type !== 'edit' && !(this.hold && pos === this.hold.pos)) return { error: 'Only the flagged step can be removed.' };
    let c;
    if (m.type === 'edit' || m.type === 'insert') {
      const el = els[pos];
      if (!m.msg || typeof m.msg.type !== 'string') return { error: 'Bad message.' };
      if (m.type === 'edit' && !el.a?.host) return { error: 'Only the host’s steps can be changed.' };
      if (m.type === 'edit' && !FAMILY[el.m.type]?.includes(m.msg.type)) return { error: 'That step can’t be changed into that.' };
      if (m.type === 'edit' && J(m.msg) === J(el.m) && !force) return { kept: false }; // same value: a no-op
      const r = this.compute(this.cursor, { upto: pos, els }).room;
      const probe = clone(r); const res = applyEvent(probe, { a: HOST, e: seed, t: now }, clone(m.msg));
      if (res.error) return { error: res.error };
      c = stamp(r, m.msg, true);
      const was = m.type === 'edit' ? el.c?.f || {} : {};
      if (Object.entries(c.f || {}).some(([k, v]) => v === false && was[k] !== false)) return { error: 'That choice isn’t possible there.' };
    }
    this.push({ a: actor, m, e: seed, t: now, ...(c ? { c } : {}) });
    this.setTo(this.cursor);
    return { ok: true, kept: true };
  }
  edit(id, msg, o) { return this.op({ type: 'edit', id, msg }, o); }

  // ---- back and forward: one Host step (see undoTarget / redoTarget). A change is one step. ----
  undo(steps = 1) { return this.moveTo(this.cursor - steps); }
  redo(steps = 1) { return this.moveTo(this.cursor + steps); }
  moveTo(i) {
    if (!Number.isInteger(i) || i < 0 || i > this.events.length) return false;
    if (i === this.cursor) return true;
    this.cursor = i; this.rev++;
    this.setTo(i);
    return true;
  }
  undoStep(opts) { const i = undoTarget(this.events, this.cursor, this.room, opts); if (i === null) return null; const label = stepLabel(this.events[i], this.room); this.moveTo(i); return label; }
  redoStep() { const i = redoTarget(this.events, this.cursor); if (i === null) return null; const label = stepLabel(this.events[this.cursor + firstHost(this.events, this.cursor)], this.room); this.moveTo(i); return label; }
  history(opts) { return { ...historyInfo(this.events, this.cursor, this.room, opts), ...(this.hold ? { hold: this.hold } : {}) }; }
  toJSON() { return { v: LOG_VERSION, base: this.base, events: this.events, cursor: this.cursor, rev: this.rev, snaps: [...this.snaps] }; }

  // ---- what players see while the host fixes a flagged step ----
  // The last confirmed position: the newest prefix of the log that isn't paused. A paused log always ends in a
  // change (new moves are refused while paused), so this walks back over changes only. Pure, so a reload agrees.
  confirmedAt() {
    if (!this.hold) return this.cursor;
    let j = this.cursor - 1;
    while (j > 0 && this.compute(j).hold) j--;
    return j;
  }
  confirmedRoom() { return this.hold ? this.compute(this.confirmedAt()).room : this.room; }
  // The pause in words, for the host: which step, why, and what can be done there.
  holdInfo() {
    const h = this.hold; if (!h) return null;
    const el = this.els[h.pos]; const room = this.room;
    const why = [...new Set(h.probs.map((p) => whyText(p)))];
    const choices = [...(FAMILY[el.m.type] ? ['pick'] : []), ...(el.m.type === 'startNight' && room.pending?.length ? ['insert'] : []), 'drop', ...(room.phase === 'over' ? ['cut'] : [])];
    return { id: h.id, type: h.type, label: stepLabel({ a: el.a, m: el.m }, room), why, choices };
  }
  // The current game's events from `since` on (never before the game began), for the host phone's copy of the log.
  eventsSince(since = 0) {
    const gs = this.gameStart(); const first = gs > 0 ? this.els[gs - 1].id + 1 : 0;
    const from = Math.max(first, Math.min(Number.isInteger(since) && since >= 0 ? since : 0, this.cursor));
    return { from, cursor: this.cursor, rev: this.rev, events: this.events.slice(from, this.cursor) };
  }

  // ---- the confirm sheet: a dry run of a change. Nothing is recorded; the server replays for itself. ----
  fork() {
    const g = Object.create(Object.getPrototypeOf(this)); Object.assign(g, this);
    g.events = this.events.slice(); g.snaps = new Map(this.snaps); g.els = this.els.slice(); g.voids = this.voids.slice();
    return g;
  }
  preview(m) {
    const pos = this.els.findIndex((x) => x.id === (m.type === 'insert' ? m.before : m.id));
    const oldD = new Map(); this.compute(this.cursor, { digests: oldD });
    const g = this.fork(); const r = g.op(m);
    if (r.error || !r.kept) return r;
    const newD = new Map(); const full = g.compute(g.cursor, { digests: newD });
    const look = g.hold ? g.compute(g.cursor, { lookahead: true }) : null;
    const rows = [];
    for (const el of g.els.slice(pos + 1)) {
      const at = g.els.findIndex((x) => x.id === el.id);
      const status = g.voids.includes(el.id) ? 'void' : g.hold?.id === el.id ? 'needs-fixing' : g.hold && at > g.hold.pos ? 'waiting'
        : oldD.get(el.id) === newD.get(el.id) ? 'kept' : 'recomputed';
      rows.push({ id: el.id, type: el.m.type, status, ...(status === 'recomputed' ? { now: JSON.parse(newD.get(el.id) || '{}') } : {}) });
    }
    const maybeLater = look ? look.flags.filter((f) => f.id !== g.hold.id).length : 0;
    return { ok: true, hold: g.hold, rows, maybeLater, room: full.room };
  }
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
  nightUi: () => 'A night pick', edit: () => 'A change to an earlier step', drop: () => 'Removing a step', insert: () => 'An added step', cut: () => 'Ending the game there', assignCard: (n) => `${n}’s card`, clearCard: (n) => `${n}’s card`, setRole: (n) => `${n}’s role`, setTarget: (n) => `${n}’s target`,
  playAgain: () => 'Play again', restart: () => 'Restart', newGame: () => 'New game', setConfig: () => 'A setup change', useDay: (n) => `${n}’s day ability`,
  toggleTag: (n) => `A note on ${n}`, setNote: (n) => `A note on ${n}`, moveSeat: (n) => `${n}’s seat`, seatWhere: (n) => `${n}’s seat`, renamePlayer: () => 'A name change',
};
// Why a step was flagged, in words the host reads on the pause.
const WHY = {
  tgt: 'A player it picks can’t be picked now.', live: 'The player who acted is dead now.', actor: 'The player who acted is dead now.',
  step: 'That role isn’t called that night now.', role: 'That player has a different role now.', power: 'That ability is used up now.',
  distinct: 'The same player is picked twice.', bind: 'That last shot’s player is alive now.', 'prompt-gone': 'That last shot’s player is alive now.',
  stalemate: 'That stalemate isn’t there now.', 'now-accepted': 'This step was turned down before and would go through now.',
};
export function whyText(p) {
  if (p.startsWith('refused: ')) return p.slice(9);
  return WHY[p.split(':')[0]] || 'This step no longer fits.';
}
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
