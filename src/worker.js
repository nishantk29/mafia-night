// Cloudflare Worker: serves the API + WebSocket entry points. Static files come from Workers Static Assets.
import { DurableObject } from 'cloudflare:workers';
import { errorResponse } from './error-page.js';
import { newRoom, migrateRoleIds, messagesFor, justEnded } from '../public/js/room.js';
import { GameLog, KEY, LOG_VERSION, chunkOf } from '../public/js/event-log.js';
import { NOTIFY_ON_UNDO } from '../public/js/config-defaults.js';
import { handleAiInternal } from './ai.js';
import { askRule } from './ask.js';
import { RULES_INDEX, RULES_HASH } from './rules-index.js';

const AI_SITE = 'mafia';
const AI_GAME = 'Mafia Night';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O look-alikes
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_MSG = 16 * 1024;

const randCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
};
const randKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const wantsHtml = (request) => (request.headers.get('accept') || '').includes('text/html');

export default {
  async fetch(request, env) {
    try { return await route(request, env); } catch (e) {
      console.error('fetch failed:', e);
      return new URL(request.url).pathname.startsWith('/api/') && !wantsHtml(request) ? json({ error: 'Something went wrong. Try again.' }, 500) : errorResponse(500);
    }
  },
};

async function route(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/create' && request.method === 'POST') {
      for (let i = 0; i < 5; i++) {
        const code = randCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, hostKey: randKey() }) });
        if (res.status === 200) return json(await res.json());
      }
      return json({ error: 'Could not create a room. Try again.' }, 503);
    }

    const exists = url.pathname.match(/^\/api\/room\/([A-Z]{6})$/);
    if (exists) {
      const stub = env.ROOM.get(env.ROOM.idFromName(exists[1]));
      const res = await stub.fetch('https://room/exists');
      return json({ exists: res.status === 200 }, res.status === 200 ? 200 : 404);
    }

    const ws = url.pathname.match(/^\/ws\/([A-Za-z]{6})$/);
    if (ws) {
      if (request.headers.get('Upgrade') !== 'websocket') return errorResponse(426);
      const stub = env.ROOM.get(env.ROOM.idFromName(ws[1].toUpperCase()));
      return stub.fetch(request);
    }

    // Ask a rule (server only, no UI yet). Reads the rules text, never a room. Any failure answers { answer: null }.
    if (url.pathname === '/api/ask' && request.method === 'POST') {
      let q = ''; try { const t = await request.text(); if (t.length <= 2048) q = String(JSON.parse(t)?.q ?? ''); } catch { /* bad body: answer null */ }
      const r = await askRule(env, { site: AI_SITE, game: AI_GAME, index: RULES_INDEX, rulesVersion: RULES_HASH, question: q });
      return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }

    if (url.pathname.startsWith('/api/')) return wantsHtml(request) ? errorResponse(404) : json({ error: 'Not found' }, 404);
    const res = env.ASSETS ? await env.ASSETS.fetch(request) : null;
    return res && res.status !== 404 ? res : errorResponse(404);
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.log = null; // GameLog: every change to the room as an event (public/js/event-log.js)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = migrateRoleIds((await ctx.storage.get('room')) || null);
      if (this.room) await this.loadLog();
    });
  }

  // The event log lives in this room's storage next to `room`: elog:meta, elog:base, elog:c:<k> (events in chunks of
  // SNAP_EVERY) and elog:s:<k> (a checkpoint every SNAP_EVERY events). Loading replays from the last checkpoint and
  // must give back the stored `room` exactly. A room from before the log, or a log an older build left out of step
  // (after a rollback), or one the reducer now replays differently (after a rules fix), starts a fresh log from `room`.
  async loadLog() {
    const st = this.ctx.storage; const meta = await st.get(KEY.meta);
    try {
      if (meta?.v === LOG_VERSION && meta.len >= meta.cursor && meta.cursor >= 0) {
        const events = [];
        for (let k = 0; k * meta.snapEvery < meta.len; k++) events.push(...((await st.get(KEY.chunk(k))) || []));
        if (events.length >= meta.len) {
          events.length = meta.len;
          const snaps = [];
          for (let k = 1; k * meta.snapEvery <= meta.len; k++) { const s = await st.get(KEY.snap(k)); if (s) snaps.push([k * meta.snapEvery, s]); }
          const log = GameLog.restore({ base: await st.get(KEY.base), events, cursor: meta.cursor, rev: meta.rev, snaps }, { snapEvery: meta.snapEvery });
          if (JSON.stringify(migrateRoleIds(log.room)) === JSON.stringify(this.room)) { this.log = log; this.room = log.room; this.dirty = null; return; }
        }
      }
    } catch (e) { console.error(`event log unreadable for room ${this.room.code}, starting a fresh one:`, e?.message || e); }
    this.startLog();
  }
  startLog() {
    this.log = new GameLog(this.room);
    this.room = this.log.room;
    this.dirty = { base: true, from: 0 };
  }
  metaOf() { const L = this.log; return { v: LOG_VERSION, rev: L.rev, cursor: L.cursor, len: L.events.length, snapEvery: L.snapEvery }; }
  markDirty(from) { this.dirty ||= {}; this.dirty.from = Math.min(this.dirty.from ?? from, from); }

  // Every change to the room goes through here: the message is applied as an event and kept if it changed the room.
  // A new move after Undo drops the steps that were undone (the redo branch).
  apply(actor, msg) {
    const r = this.log.apply(actor, msg, Date.now());
    this.room = this.log.room;
    if (r.kept) {
      this.markDirty(this.log.cursor - 1);
      if (this.log.events.length >= MAX_EVENTS && ['lobby', 'dealt', 'over'].includes(this.room.phase)) this.startLog(); // a long-running room: keep the log bounded at a game boundary
    }
    return { res: r, changed: !!r.kept };
  }

  // The room, the log meta, the changed chunks and any new checkpoints go out together: puts with no await between
  // them are one atomic write in a Durable Object.
  writes() {
    const L = this.log; const out = { room: this.room, [KEY.meta]: this.metaOf() };
    if (!this.dirty) return out;
    if (this.dirty.base) out[KEY.base] = L.base;
    const len = L.events.length; const E = L.snapEvery;
    for (let k = chunkOf(this.dirty.from ?? len, E); k * E < len; k++) out[KEY.chunk(k)] = L.events.slice(k * E, (k + 1) * E);
    for (const [i, s] of L.snaps) if (i > (this.dirty.from ?? len) && i <= len) out[KEY.snap(i / E)] = s;
    return out;
  }

  // One write with a retry. Returns false if storage refused both times (see commit).
  async save() {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const w = this.writes();
        await Promise.all(Object.entries(w).map(([k, v]) => this.ctx.storage.put(k, v)));
        this.dirty = null;
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
        return true;
      } catch (e) {
        console.error(`save failed (attempt ${attempt}) for room ${this.room.code}:`, e?.message || e);
      }
    }
    return false;
  }

  // Save a move, or take it back. A move storage would not keep must not stay on the phones: an evicted DO would
  // come back without it. So on a failed save the room goes back to what storage holds, the sender is told, and every
  // phone gets the saved room. Returns whether the move was kept.
  async commit(ws) {
    if (await this.save()) return true;
    try {
      const stored = migrateRoleIds((await this.ctx.storage.get('room')) || null);
      if (stored) { this.room = stored; await this.loadLog(); }
    } catch (e) { console.error(`reload after a failed save failed for room ${this.room?.code}:`, e?.message || e); }
    this.send(ws, { type: 'error', error: 'That move could not be saved. Try it again.' });
    this.broadcast();
    return false;
  }

  // Inactivity expiry: the alarm is pushed back on every save, so it only fires for a room nobody has touched for ROOM_TTL_MS.
  async alarm() { await this.ready; await this.closeRoom('expired'); }

  // Close the room for good: tell every socket why, drop them, wipe storage. The code is free to be dealt again.
  async closeRoom(reason) {
    for (const ws of this.ctx.getWebSockets()) { this.send(ws, { type: 'closed', reason }); try { ws.close(1000, 'closed'); } catch { /* already closed */ } }
    this.room = null; this.log = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async fetch(request) {
    await this.ready;
    const aiInternal = await handleAiInternal(this.ctx.storage, request); // reserved budget and cache instances only
    if (aiInternal) return aiInternal;
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (this.room) return new Response('exists', { status: 409 });
      const { code, hostKey } = await request.json();
      this.room = newRoom(code, hostKey);
      this.room.updated = Date.now();
      this.startLog();
      if (!(await this.save())) { this.room = null; this.log = null; return new Response('storage', { status: 503 }); } // the caller tries another code
      return new Response(JSON.stringify({ code, hostKey }), { status: 200 });
    }
    if (url.pathname === '/exists') return new Response(null, { status: this.room ? 200 : 404 });

    if (!this.room) return new Response('Room not found', { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ who: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  connectedIds() {
    const s = new Set();
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a?.playerId) s.add(a.playerId); }
    return s;
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ } }

  // Each view carries the log's revision; the Host's also says what Undo and Redo would do.
  stamp(m, att) {
    if (m.type !== 'view') return m;
    return att?.who === 'host' ? { ...m, rev: this.log.rev, hist: this.log.history() } : { ...m, rev: this.log.rev };
  }
  viewsFor(ws, connected, announce) { const att = ws.deserializeAttachment(); return messagesFor(this.room, att, connected, announce).map((m) => this.stamp(m, att)); }

  // `announce`: the game just ended, so each socket also gets the game-over event (see messagesFor).
  broadcast(announce = false) {
    if (!this.room) return; // closed: the sockets are already gone
    const connected = this.connectedIds();
    for (const ws of this.ctx.getWebSockets()) for (const m of this.viewsFor(ws, connected, announce)) this.send(ws, m);
  }

  // Undo / Redo (Host only): one Host step back or forward on the log. The room is rebuilt by replay, so deaths,
  // saves, blocks, results, wins and the morning report are exactly what they were at that step.
  async step(ws, msg) {
    const dir = msg.type === 'undo' ? 'undo' : 'redo';
    if (typeof msg.rev !== 'number' || msg.rev !== this.log.rev) {
      this.send(ws, { type: 'error', error: 'The game moved on. Showing the latest.' });
      for (const m of this.viewsFor(ws, this.connectedIds())) this.send(ws, m);
      return;
    }
    const before = this.room; const was = publicFace(before);
    const label = dir === 'undo' ? this.log.undoStep() : this.log.redoStep();
    if (label === null) { this.send(ws, { type: 'error', error: dir === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.' }); return; }
    this.room = this.log.room;
    if (!(await this.commit(ws))) return;
    this.broadcast(justEnded(before.phase, this.room));
    this.send(ws, { type: 'stepped', dir, label, host: true });
    if (NOTIFY_ON_UNDO && publicFace(this.room) !== was) {
      for (const s of this.ctx.getWebSockets()) if (s !== ws && s.deserializeAttachment()?.who) this.send(s, { type: 'stepped', dir });
    }
  }

  async webSocketMessage(ws, raw) {
    await this.ready;
    if (!this.room) { this.send(ws, { type: 'fatal', error: 'Room expired.' }); ws.close(1000, 'gone'); return; }
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || { who: null };

    // ---- handshake ----
    if (msg.type === 'hello') {
      if (msg.hostKey) {
        if (msg.hostKey !== this.room.hostKey) { this.send(ws, { type: 'fatal', error: 'Bad host key.' }); ws.close(1008, 'bad key'); return; }
        ws.serializeAttachment({ who: 'host' });
      } else if (msg.playerId) {
        const p = this.room.players.find((x) => x.id === msg.playerId);
        if (!p || p.token !== msg.token) { this.send(ws, { type: 'fatal', error: 'Could not rejoin. Join again with a new name.', clear: true }); ws.close(1008, 'bad token'); return; }
        ws.serializeAttachment({ who: 'player', playerId: p.id });
      } else if (msg.join) {
        const { res, changed } = this.apply({ anon: true }, { type: 'join', name: msg.join });
        if (res.error) { if (changed) await this.commit(ws); this.send(ws, { type: 'error', error: res.error }); return; }
        if (!(await this.commit(ws))) return;
        ws.serializeAttachment({ who: 'player', playerId: res.data.playerId });
        this.send(ws, { type: 'joined', ...res.data });
      } else {
        this.send(ws, { type: 'error', error: 'Bad hello.' }); return;
      }
      this.broadcast();
      return;
    }
    if (!att.who) return;

    // ---- end the game (host only) ----
    if (msg.type === 'endGame') {
      if (att.who !== 'host') { this.send(ws, { type: 'error', error: 'Only the Host can end the game.' }); return; }
      await this.closeRoom('ended');
      return;
    }

    // ---- back and forward (host only) ----
    if (msg.type === 'undo' || msg.type === 'redo') {
      if (att.who !== 'host') { this.send(ws, { type: 'error', error: 'Host only.' }); return; }
      await this.step(ws, msg);
      return;
    }

    // ---- actions ----
    const actor = att.who === 'host' ? { host: true } : { playerId: att.playerId };
    // A Host message sent against an older revision (a second Host phone, a late retry) is refused, never applied
    // to a later step. Clients that send no `rev` are not checked.
    if (actor.host && typeof msg.rev === 'number' && msg.rev !== this.log.rev) {
      this.send(ws, { type: 'error', error: 'The game moved on. Showing the latest.' });
      for (const m of this.viewsFor(ws, this.connectedIds())) this.send(ws, m);
      return;
    }
    const { rev: _rev, ...intent } = msg;
    const before = this.room.phase;
    const { res, changed } = this.apply(actor, intent);
    if (res.error) { if (changed) await this.commit(ws); this.send(ws, { type: 'error', error: res.error }); return; }
    if (!(await this.commit(ws))) return;
    this.broadcast(justEnded(before, this.room));
    if (res.data?.error) this.send(ws, { type: 'error', error: res.data.error }); // a restart that could not deal: the Host lands on setup with the reason
  }

  async webSocketClose(ws) { try { ws.close(); } catch { /* already closed */ } await this.ready; this.broadcast(); }
  async webSocketError() { await this.ready; this.broadcast(); }
}

// What every player can see of the game: the phase, the day and night, who is alive, and the winner. Undo or Redo
// that changes none of it (a night pick, a note) is not announced to players.
const publicFace = (r) => JSON.stringify([r.phase, r.day, r.night, r.players.map((p) => [p.id, p.alive]), r.winner?.side || null]);
const MAX_EVENTS = 6000;
