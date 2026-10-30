// Cloudflare Worker: serves the API + WebSocket entry points. Static files come from Workers Static Assets.
import { DurableObject } from 'cloudflare:workers';
import { errorResponse } from './error-page.js';
import { newRoom, migrateRoleIds, messagesFor, justEnded } from '../public/js/room.js';
import { commit, KEY, SNAP_EVERY, LOG_VERSION, chunkOf, writesAfterAppend } from '../public/js/event-log.js';
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
    this.elog = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = migrateRoleIds((await ctx.storage.get('room')) || null);
      if (this.room) await this.loadLog(await ctx.storage.get(KEY.meta));
    });
  }

  // The event log (public/js/event-log.js) kept in this room's storage next to `room`. Only the meta and the
  // current chunk are held in memory. A room stored before the log existed, or one whose log is out of step with
  // `room` (written by an older build after a rollback), starts a fresh log with its current state as the base.
  async loadLog(meta) {
    if (meta?.v === LOG_VERSION && meta.updated === this.room.updated && meta.cursor === meta.len) {
      const tail = meta.len % meta.snapEvery ? (await this.ctx.storage.get(KEY.chunk(chunkOf(meta.len, meta.snapEvery)))) || [] : [];
      if (tail.length === meta.len % meta.snapEvery) { this.elog = { meta, tail, writes: {} }; return; }
    }
    this.startLog();
  }
  startLog() {
    const meta = { v: LOG_VERSION, rev: 0, cursor: 0, len: 0, snapEvery: SNAP_EVERY, updated: this.room.updated };
    this.elog = { meta, tail: [], writes: { [KEY.base]: structuredClone(this.room), [KEY.meta]: meta } };
  }

  // Every change to the room goes through here: the message is applied as an event, and kept if it changed the room.
  apply(actor, msg) {
    const r = commit(this.room, actor, msg, Date.now());
    if (r.changed) {
      const L = this.elog;
      L.tail.push(r.ev);
      L.meta = { ...L.meta, len: L.meta.len + 1, cursor: L.meta.len + 1, rev: L.meta.rev + 1, updated: this.room.updated };
      Object.assign(L.writes, writesAfterAppend(L.meta, L.tail.slice(), structuredClone(this.room)));
      if (L.meta.len % L.meta.snapEvery === 0) L.tail = [];
    }
    return r;
  }

  // A failed write must never swallow a move: retry once, and if storage is still unhappy keep going with the
  // in-memory room (it is what every screen is showing) and try again on the next action.
  // The room, the log meta, the current chunk and any checkpoint go out together: puts with no await between them
  // are one atomic write in a Durable Object.
  async save() {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const writes = { room: this.room, ...(this.elog?.writes || {}) };
        await Promise.all(Object.entries(writes).map(([k, v]) => this.ctx.storage.put(k, v)));
        if (this.elog) this.elog.writes = {};
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
        return true;
      } catch (e) {
        console.error(`save failed (attempt ${attempt}) for room ${this.room.code}:`, e?.message || e);
      }
    }
    return false;
  }

  // Inactivity expiry: the alarm is pushed back on every save, so it only fires for a room nobody has touched for ROOM_TTL_MS.
  async alarm() { await this.ready; await this.closeRoom('expired'); }

  // Close the room for good: tell every socket why, drop them, wipe storage. The code is free to be dealt again.
  async closeRoom(reason) {
    for (const ws of this.ctx.getWebSockets()) { this.send(ws, { type: 'closed', reason }); try { ws.close(1000, 'closed'); } catch { /* already closed */ } }
    this.room = null; this.elog = null;
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
      await this.save();
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

  // `announce`: the game just ended, so each socket also gets the game-over event (see messagesFor).
  broadcast(announce = false) {
    if (!this.room) return; // closed: the sockets are already gone
    const connected = this.connectedIds();
    for (const ws of this.ctx.getWebSockets()) {
      for (const m of messagesFor(this.room, ws.deserializeAttachment(), connected, announce)) this.send(ws, m.type === 'view' ? { ...m, rev: this.elog?.meta.rev ?? 0 } : m);
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
        if (res.error) { if (changed) await this.save(); this.send(ws, { type: 'error', error: res.error }); return; }
        await this.save();
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

    // ---- actions ----
    const actor = att.who === 'host' ? { host: true } : { playerId: att.playerId };
    const before = this.room.phase;
    // A Host message sent against an older revision (a second Host phone, a late retry) is refused, never applied
    // to a later step. Clients that send no `rev` are not checked.
    if (actor.host && typeof msg.rev === 'number' && msg.rev !== this.elog.meta.rev) {
      this.send(ws, { type: 'error', error: 'The game moved on. Showing the latest.' });
      for (const m of messagesFor(this.room, att, this.connectedIds())) this.send(ws, m.type === 'view' ? { ...m, rev: this.elog.meta.rev } : m);
      return;
    }
    const { rev: _rev, ...intent } = msg;
    const { res, changed } = this.apply(actor, intent);
    if (res.error) { if (changed) await this.save(); this.send(ws, { type: 'error', error: res.error }); return; }
    await this.save();
    this.broadcast(justEnded(before, this.room));
    if (res.data?.error) this.send(ws, { type: 'error', error: res.data.error }); // a restart that could not deal: the Host lands on setup with the reason
  }

  async webSocketClose(ws) { try { ws.close(); } catch { /* already closed */ } await this.ready; this.broadcast(); }
  async webSocketError() { await this.ready; this.broadcast(); }
}
