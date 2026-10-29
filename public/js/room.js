// Room state + reducer + per-viewer projections. Pure functions: used by the Durable Object and by local mode.
import {
  FULL_DECK, roleMax, MIN_PLAYERS, MAX_PLAYERS, suggestRoles, dealRoles, buildDeckMap, isCard, shuffle, randInt,
  applyWinChecks, playerById, nightScript, resolveNight, isBlind, unidentifiedSlots, finalizeBlind, condemn, resolvePending, killPlayer, log, finalWinners, stalemateOf,
  setupWarnings, DEFAULT_RULES, rulesOf, hasGraveyard, upgradeTarget, hasMergedDetective,
  hasStoryScript, hasNightOnlyChecks, assignCallNumbers, callNumbers, hasNumberedCalls, shownRoleId, LATEST_NIGHT_VERSION, nightVersion, stepScript, prepNotes, nightOpen, nightClose, morningAnnouncement,
} from './engine.js';
import { THEMES } from './theme.js';
import { ROLE_BY_ID, factionOf, registerRoles, sanitizeRole, resolveRoleId, legacyRoleId, pinStoredId, storedToMerged } from './roles.js';
import { roleGuide } from './role_guide.js';
import { ROOM_MODES, CARD_FLOWS } from './modes.js';
import { ADVANCED_DEFAULTS, ALLOW_SEAT_TAKEOVER } from './config-defaults.js';

export const DOT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white'];
const DEFAULT_LEGEND = {
  red: 'Suspect', orange: 'Protected', yellow: 'Blocked', green: 'Confirmed town',
  blue: 'Framed', purple: 'Converted', pink: 'Linked', white: 'Note',
};
const MAX_WRONG_CLAIMS = 5;

const rid = (n = 6) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function newRoom(code, hostKey) {
  return {
    code, hostKey, created: Date.now(),
    nightVersion: LATEST_NIGHT_VERSION, // the Godfather shows as a Villager to the Detective (6), investigator results only at night (5), dead roles are still called at night (2), the Host's steps look the same alive or dead (3), the Host script (4); rooms stored without this field are version 1 (see engine nightVersion)
    config: { theme: 'city', rules: { ...DEFAULT_RULES }, mode: 'app', cardFlow: 'blind', deckStyle: 'random', roles: [], customRoles: [], sharedBoard: true, legend: { ...DEFAULT_LEGEND } },
    players: [], deck: null, copSalt: Math.random(), phase: 'lobby', day: 0, night: 0,
    usage: {}, dayUsed: {}, pending: [], log: [], winner: null, sideWins: [], lastReport: null, shield: false, framed: [], seq: 0,
  };
}

const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);

function addPlayer(room, name, offline) {
  name = cleanName(name);
  if (!name) return { error: 'Enter a name.' };
  if (room.players.length >= MAX_PLAYERS) return { error: `Room is full (${MAX_PLAYERS} players).` };
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { error: 'That name is taken.' };
  const p = { id: 'p' + rid(4), name, token: rid(12), offline: !!offline, roleId: null, card: null, alive: true, tags: [], note: '', wrongClaims: 0 };
  room.players.push(p);
  return { ok: true, player: p };
}

function resetDeal(room) {
  for (const p of room.players) { p.roleId = null; p.card = null; p.alive = true; p.tags = []; p.deathCause = null; p.roleHidden = false; p.target = null; p.convertedFrom = null; p.wrongClaims = 0; delete p.note; delete p.becameJester; delete p.jesterSeen; }
  delete room.callNo; // fresh random Cop 1/2/... numbers each game
  room.copSalt = Math.random(); // seeds the neutral "Cop 1/2/..." numbering for this game
  room.deck = null; room.phase = 'lobby'; room.day = 0; room.night = 0; room.condemnedDay = null; room.usage = {}; room.dayUsed = {};
  room.pending = []; room.winner = null; room.sideWins = []; room.lastReport = null; room.results = []; room.shield = false; room.framed = [];
  delete room.graveyard;
}

// Restart: a fresh game for the same room. Keeps code, hostKey, players and config; moves the room to the latest night version.
export function restartGame(room) {
  resetDeal(room);
  if (!hasMergedDetective(room) && room.config?.roles) room.config.roles = room.config.roles.map(storedToMerged); // the merge starts with a new game
  room.nightVersion = LATEST_NIGHT_VERSION;
  delete room.upgradeNext;
  room.results = []; room.lastReport = null; room.log = []; room.framed = []; room.pending = [];
  room.gameNo = (room.gameNo || 1) + 1;
  log(room, `Game ${room.gameNo} started.`);
}

// A restart keeps the code and players but bumps gameNo; the client then drops its per-game UI state.
export const isNewGame = (prev, next) => !!prev && !!next && !!prev.code && prev.code === next.code && (prev.gameNo || 1) !== (next.gameNo || 1);

// ---------- Graveyard chat (v3 rooms) ----------
// Only the dead and the Host may post, and only the dead and the Host are ever sent it (see messagesFor).
// Any other channel is rejected, so a future living chat inherits "the dead can't speak to the living".
const GY_MAX = 150, GY_LEN = 280, GY_RATE = 5, GY_WINDOW = 10000;
const gyRate = new WeakMap(); // room -> sender -> recent post times (runtime only, never stored or sent)
export const canSeeGraveyard = (room, att) => hasGraveyard(room) && room.hostKey !== 'local' && (att?.who === 'host' || (att?.who === 'player' && playerById(room, att.playerId)?.alive === false));
function postChat(room, actor, a) {
  const err = (e) => ({ error: e });
  const me = actor.playerId && playerById(room, actor.playerId);
  if (a.channel !== 'graveyard') return err(me && !me.alive ? 'The dead can’t speak to the living.' : 'Chat is not available.');
  if (!hasGraveyard(room) || room.hostKey === 'local') return err('Chat is not available.');
  if (!actor.host && !(me && me.alive === false)) return err('Only the dead can use the Graveyard.');
  const text = String(a.text ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, GY_LEN).trim();
  if (!text) return err('Write something first.');
  const from = actor.host ? 'host' : me.id, now = Date.now();
  let m = gyRate.get(room); if (!m) gyRate.set(room, m = new Map());
  const recent = (m.get(from) || []).filter((x) => now - x < GY_WINDOW);
  if (recent.length >= GY_RATE) { m.set(from, recent); return err('Slow down a little.'); }
  recent.push(now); m.set(from, recent);
  const list = room.graveyard ||= [];
  const id = (list.at(-1)?.id || 0) + 1;
  list.push({ id, from, name: actor.host ? 'Host' : me.name, text, at: now });
  if (list.length > GY_MAX) list.splice(0, list.length - GY_MAX);
  return { ok: true };
}

// actor: { host: true } | { playerId } | { anon: true }
export function reduce(room, actor, a) {
  registerRoles(room.config.customRoles);
  migrateRoleIds(room);
  // A pinned room (before the Detective merge) keeps the old roles: ids from the new picker map back to them.
  const pin = (id) => (hasMergedDetective(room) ? id : legacyRoleId(id));
  if (a && typeof a.roleId === 'string') a = { ...a, roleId: pin(resolveRoleId(a.roleId)) };
  const host = !!actor.host;
  const err = (e) => ({ error: e });
  const t = a.type;

  // ---- anyone ----
  if (t === 'join') {
    // Taking over a released seat: the same name, on a new phone, in any phase. The seat keeps its secret; the old token stops working.
    const open = ALLOW_SEAT_TAKEOVER && room.players.find((p) => p.open && !p.offline && p.name.toLowerCase() === cleanName(a.name).toLowerCase());
    if (open) { open.open = false; open.token = rid(12); return { ok: true, data: { playerId: open.id, token: open.token } }; }
    if (room.phase !== 'lobby') return err('The game has already started.');
    const r = addPlayer(room, a.name, false);
    return r.error ? r : { ok: true, data: { playerId: r.player.id, token: r.player.token } };
  }

  // ---- chat (Graveyard only: dead players and the Host) ----
  if (t === 'chat') return postChat(room, actor, a);

  // ---- players ----
  if (t === 'claimCard') {
    const me = actor.playerId && playerById(room, actor.playerId);
    if (!me) return err('Not in this room.');
    if (room.config.mode !== 'cards' || room.phase !== 'dealt') return err('Card claiming is not open.');
    if (me.card) return { ok: true };
    if (me.wrongClaims >= MAX_WRONG_CLAIMS) return err('Too many wrong tries. Ask the host.');
    const card = String(a.card || '');
    const slot = room.deck?.map.find((m) => m.card === card);
    if (!isCard(card) || !slot) { me.wrongClaims++; return err('That card is not in this game.'); }
    if (room.deck.claimed[card] && room.deck.claimed[card] !== me.id) { me.wrongClaims++; return err('Someone already has that card.'); }
    room.deck.claimed[card] = me.id; me.card = card; me.roleId = slot.roleId; assignCallNumbers(room);
    return { ok: true };
  }

  // The victory card's "Play again": the host or any seated player, once the game is over. Same players, back to the lobby.
  if (t === 'playAgain') {
    if (!host && !(actor.playerId && playerById(room, actor.playerId))) return err('Not in this room.');
    if (room.phase !== 'over') return err('The game is not over.');
    restartGame(room); return { ok: true };
  }

  if (!host) return err('Host only.');

  // ---- host ----
  switch (t) {
    case 'addPlayer': {
      if (room.phase !== 'lobby') return err('Players can only be added in the lobby.');
      const r = addPlayer(room, a.name, true);
      return r.error ? r : { ok: true };
    }
    case 'addPlayers': {
      if (room.phase !== 'lobby') return err('Players can only be added in the lobby.');
      const names = (Array.isArray(a.names) ? a.names : []).slice(0, MAX_PLAYERS);
      let added = 0; const skipped = [];
      for (const n of names) { const r = addPlayer(room, n, true); if (r.error) skipped.push(String(n).slice(0, 20)); else added++; }
      return { ok: true, data: { added, skipped } };
    }
    case 'removePlayer': {
      if (room.phase !== 'lobby') return err('Only in the lobby.');
      room.players = room.players.filter((p) => p.id !== a.playerId);
      return { ok: true };
    }
    case 'moveSeat': { // seating order is the order of room.players; allowed in every phase
      const i = room.players.findIndex((p) => p.id === a.playerId);
      if (i < 0) return err('Bad player.');
      const to = Math.max(0, Math.min(room.players.length - 1, Math.trunc(Number(a.toIndex)) || 0));
      const [p] = room.players.splice(i, 1);
      room.players.splice(to, 0, p);
      return { ok: true };
    }
    case 'seatWhere': { // move a seat to this phone (local), or release it for takeover by someone's own phone; the seat keeps its secret, the old token stops working
      const p = playerById(room, a.playerId);
      if (!p) return err('Bad player.');
      if (a.where === 'local') { p.offline = true; p.open = false; p.token = rid(12); return { ok: true }; }
      if (a.where === 'open') {
        if (!ALLOW_SEAT_TAKEOVER) return err('Seats can’t be released here.');
        p.offline = false; p.open = true; p.token = rid(12); return { ok: true };
      }
      return err('Bad seat.');
    }
    case 'renamePlayer': {
      const p = playerById(room, a.playerId); const n = cleanName(a.name);
      if (!p || !n) return err('Bad name.');
      if (room.players.some((q) => q.id !== p.id && q.name.toLowerCase() === n.toLowerCase())) return err('That name is taken.');
      p.name = n; return { ok: true };
    }
    case 'setConfig': {
      if (!['lobby', 'dealt'].includes(room.phase)) return err('Cannot change the setup mid-game.');
      const c = room.config;
      if (a.mode && ROOM_MODES.includes(a.mode)) c.mode = a.mode;
      if (a.deckStyle && ['fixed', 'random', 'simple'].includes(a.deckStyle)) c.deckStyle = a.deckStyle;
      if (a.cardFlow && CARD_FLOWS.includes(a.cardFlow)) c.cardFlow = a.cardFlow;
      if (Array.isArray(a.roles)) {
        const seen = {};
        c.roles = a.roles.map(resolveRoleId).map(pin).filter((r) => ROLE_BY_ID[r]).filter((r) => (seen[r] = (seen[r] || 0) + 1) <= roleMax(r)).slice(0, MAX_PLAYERS);
      }
      if (typeof a.sharedBoard === 'boolean') c.sharedBoard = a.sharedBoard;
      if (a.theme && THEMES[a.theme]) c.theme = a.theme;
      if (a.advanced && typeof a.advanced === 'object') { // day timer and hidden setup; "show card on death" is the revealOnDeath rule below
        c.advanced = { ...(c.advanced || {}) };
        for (const k of ['dayTimer', 'hiddenSetup']) if (typeof a.advanced[k] === 'boolean') c.advanced[k] = a.advanced[k];
      }
      if (a.rules && typeof a.rules === 'object') {
        c.rules = rulesOf(room);
        for (const k of Object.keys(DEFAULT_RULES)) if (typeof a.rules[k] === 'boolean') c.rules[k] = a.rules[k];
      }
      return { ok: true };
    }
    case 'setCustomRoles': {
      if (!['lobby', 'dealt'].includes(room.phase)) return err('Cannot change roles mid-game.');
      const clean = (Array.isArray(a.roles) ? a.roles : []).map(sanitizeRole).filter(Boolean).slice(0, 40);
      room.config.customRoles = clean;
      registerRoles(clean);
      const ok = new Set(clean.map((r) => r.id));
      room.config.roles = room.config.roles.filter((id) => ROLE_BY_ID[id] && (!ROLE_BY_ID[id].custom || ok.has(id)));
      return { ok: true };
    }
    case 'suggestRoles': {
      room.config.roles = suggestRoles(Math.max(MIN_PLAYERS, room.players.length));
      return { ok: true };
    }
    case 'deal': {
      if (room.phase !== 'lobby') return err('Already dealt.');
      return dealNow(room);
    }
    case 'restart': {
      if (room.phase === 'lobby') return err('Nothing to restart yet.');
      restartGame(room);
      if (a.setup) return { ok: true, data: { dealt: false } };
      const r = dealNow(room);
      return r.error ? { ok: true, data: { dealt: false, error: r.error } } : { ok: true, data: { dealt: true } };
    }
    case 'undeal': {
      if (room.phase !== 'dealt') return err('Nothing to undo.');
      resetDeal(room); return { ok: true };
    }
    case 'assignCard': {
      const p = playerById(room, a.playerId);
      if (room.phase !== 'dealt' || !room.deck || !p) return err('Not available.');
      const slot = room.deck.map.find((m) => m.card === a.card);
      if (!slot) return err('That card is not in this game.');
      const owner = room.deck.claimed[a.card];
      if (owner && owner !== p.id) return err(`${playerById(room, owner)?.name || 'Someone'} already has that card.`);
      if (p.card) delete room.deck.claimed[p.card];
      room.deck.claimed[a.card] = p.id; p.card = a.card; p.roleId = slot.roleId; p.wrongClaims = 0; assignCallNumbers(room);
      return { ok: true };
    }
    case 'clearCard': {
      const p = playerById(room, a.playerId);
      if (!p || room.phase !== 'dealt') return err('Not available.');
      if (p.card && room.deck) delete room.deck.claimed[p.card];
      p.card = null; p.roleId = null; p.wrongClaims = 0; return { ok: true };
    }
    case 'setRole': { // manual correction by the host
      const p = playerById(room, a.playerId);
      if (!p || !ROLE_BY_ID[resolveRoleId(a.roleId)]) return err('Bad role.');
      p.roleId = resolveRoleId(a.roleId); assignCallNumbers(room); return { ok: true };
    }
    case 'upgradeNight': { // host opt-in for legacy rooms; always applied when the next night starts, never mid-step
      const target = upgradeTarget(room); // a room already in a game stops before the Detective merge
      if (nightVersion(room) >= target) return err('Already using the new night script.');
      if (a.off) delete room.upgradeNext;
      else if (room.phase === 'lobby') { room.nightVersion = target; if (room.config.roles) room.config.roles = room.config.roles.map(storedToMerged); }
      else room.upgradeNext = target;
      return { ok: true };
    }
    case 'startNight': {
      if (!['dealt', 'day'].includes(room.phase)) return err('Cannot start a night now.');
      if (room.pending.length) return err('Resolve the pending prompts first.');
      const blindFirst = isBlind(room) && room.night === 0;
      if (!blindFirst && room.players.some((p) => !p.roleId)) return err('Every player needs a role first.');
      if (room.upgradeNext) { room.nightVersion = Math.max(nightVersion(room), Math.min(room.upgradeNext, upgradeTarget(room))); delete room.upgradeNext; }
      room.night += 1; room.phase = 'night'; room.condemnedDay = null; assignCallNumbers(room);
      if (room.night === 1) {
        finalizeBlind(room);
        assignTargets(room);
        log(room, 'Night 1 begins.');
      } else log(room, `Night ${room.night} begins.`);
      return { ok: true };
    }
    case 'startDay': { // house rule: the game opens with a day of talk instead of night 1
      if (room.phase !== 'dealt') return err('Only right after dealing.');
      if (!rulesOf(room).dayStart) return err('Turn on "Start with a day" first.');
      if (isBlind(room)) return err('With a blind card deal, night 1 is when you learn who is who. Start with a night.');
      if (room.players.some((p) => !p.roleId)) return err('Every player needs a role first.');
      assignTargets(room);
      room.day = 1; room.phase = 'day';
      log(room, 'Day 1 begins.');
      return { ok: true };
    }
    case 'identifyRole': {
      if (room.phase !== 'night' || room.night !== 1 || !isBlind(room)) return err('Not available.');
      const slot = unidentifiedSlots(room).find((s) => s.roleId === a.roleId);
      const ids = [...new Set(Array.isArray(a.playerIds) ? a.playerIds : [])];
      if (!slot) return err('That role is already fully matched.');
      if (ids.length !== slot.remaining) return err(`Pick exactly ${slot.remaining}.`);
      const picked = ids.map((id) => playerById(room, id));
      if (picked.some((p) => !p || p.roleId)) return err('One of those players is already matched.');
      for (const p of picked) {
        p.roleId = a.roleId;
        if (ROLE_BY_ID[a.roleId].needsTarget) {
          // The Host tells the target at this wake-up, so pick now, but never from players
          // already identified as non-town (the Mafia team is identified before this step).
          const pool = room.players.filter((q) => q.id !== p.id && !picked.includes(q) && (!q.roleId || factionOf(q.roleId) === 'town'));
          p.target = pool.length ? pool[randInt(pool.length)].id : null;
        }
      }
      finalizeBlind(room);
      log(room, `${ROLE_BY_ID[a.roleId].name} identified.`);
      return { ok: true };
    }
    case 'skipIdentify': { // nobody holds this card: it is not in play, so the night can go on
      if (room.phase !== 'night' || room.night !== 1 || !isBlind(room)) return err('Not available.');
      const slot = unidentifiedSlots(room).find((s) => s.roleId === a.roleId);
      if (!slot) return err('That role is already fully matched.');
      let left = slot.remaining;
      for (const m of room.deck.map) if (left && m.roleId === a.roleId && !m.unused) { m.unused = true; left--; }
      finalizeBlind(room);
      log(room, `${ROLE_BY_ID[a.roleId].name}: no one has this card.`, { private: true });
      return { ok: true };
    }
    case 'setTarget': {
      const p = playerById(room, a.playerId); if (!p) return err('Bad player.');
      p.target = a.targetId || null; return { ok: true };
    }
    case 'submitNight': {
      if (room.phase !== 'night') return err('It is not night.');
      if (room.players.some((p) => !p.roleId)) return err('Some players are not matched to a role yet.');
      resolveNight(room, a.actions || {}); return { ok: true };
    }
    case 'condemn': {
      if (room.phase !== 'day') return err('It is not day.');
      if (room.condemnedDay === room.day) return err('Someone was already condemned today.');
      const r = condemn(room, a.playerId);
      if (r.ok) room.condemnedDay = room.day;
      return r;
    }
    case 'noCondemn': {
      if (!['day', 'night'].includes(room.phase)) return err('Not in play.');
      if (nightVersion(room) >= 7 && room.phase !== 'day') return err('It is not day.');
      if (nightVersion(room) >= 7 && room.condemnedDay === room.day) return err('Someone was already condemned today.');
      log(room, 'Nobody was condemned.'); return { ok: true }; }
    case 'resolvePending': return resolvePending(room, a.pendingId, a.targetId);
    case 'kill': {
      const p = playerById(room, a.playerId);
      if (!p) return err('Bad player.');
      if (!['day', 'night'].includes(room.phase)) return err('The game is not in play.');
      killPlayer(room, p.id, String(a.cause || 'eliminated').slice(0, 60));
      log(room, `${p.name} was eliminated (${a.cause || 'host'}).`);
      applyWinChecks(room);
      return { ok: true };
    }
    case 'revive': {
      const p = playerById(room, a.playerId); if (!p) return err('Bad player.');
      if (!['day', 'night'].includes(room.phase)) return err('The game is not in play.');
      if (p.alive) return err('Already alive.');
      const wasCondemned = p.deathCause === 'condemned', condemnedToday = p.deathDay === room.day;
      p.alive = true; p.deathCause = null; p.roleHidden = false; p.deathDay = null; p.deathNight = null;
      if (nightVersion(room) >= 8) for (const q of room.players) if (q.roleId === 'executioner' && q.target === p.id && !q.jesterSeen) delete q.becameJester; // not told yet: nothing changed
      room.pending = room.pending.filter((x) => x.playerId !== p.id); // no dead-player prompt for someone back in play
      if (nightVersion(room) >= 7 && wasCondemned) { // undoing a condemnation also undoes what it set off
        room.sideWins = (room.sideWins || []).filter((s) => s.by !== p.id);
        if (ROLE_BY_ID[p.roleId]?.shield) room.shield = false;
        if (condemnedToday && room.phase === 'day') room.condemnedDay = null;
      }
      applyWinChecks(room);
      return { ok: true };
    }
    case 'useDay': {
      const p = playerById(room, a.playerId); if (!p) return err('Bad player.');
      room.dayUsed[p.id] = (room.dayUsed[p.id] || 0) + (a.undo ? -1 : 1);
      if (room.dayUsed[p.id] < 0) room.dayUsed[p.id] = 0;
      return { ok: true };
    }
    case 'toggleTag': {
      const p = playerById(room, a.playerId);
      if (!p || !DOT_COLORS.includes(a.tag)) return err('Bad tag.');
      p.tags = p.tags.includes(a.tag) ? p.tags.filter((x) => x !== a.tag) : [...p.tags, a.tag];
      return { ok: true };
    }
    case 'setNote': {
      const p = playerById(room, a.playerId); if (!p) return err('Bad player.');
      p.note = String(a.note || '').replace(/[<>]/g, '').slice(0, 80); return { ok: true };
    }
    case 'setLegend': {
      if (!DOT_COLORS.includes(a.color)) return err('Bad colour.');
      room.config.legend[a.color] = String(a.label || '').replace(/[<>]/g, '').slice(0, 24); return { ok: true };
    }
    case 'declareWinner': {
      if (!['day', 'night'].includes(room.phase)) return err('The game is not in play.');
      room.winner = { side: String(a.side || 'manual').slice(0, 20), reason: String(a.reason || 'Declared by the Host.').slice(0, 120) };
      room.phase = 'over'; log(room, `Game over: ${room.winner.side} wins.`); return { ok: true };
    }
    case 'newGame': { restartGame(room); return { ok: true }; }
    default: return err('Unknown action.');
  }
}

// Validates the setup and deals (app mode: roles to phones; cards mode: builds the deck).
// Advanced settings as the room sees them: a room made before they existed gets the defaults (card on death = its current rule).
export const advancedOf = (room) => {
  const inGame = ['dealt', 'night', 'day', 'over'].includes(room?.phase);
  // talkStep (the day "Talk it out" step) is pinned at the deal: a room already in a game without the pin keeps the old day.
  return { ...ADVANCED_DEFAULTS, cardOnDeath: rulesOf(room).revealOnDeath, ...(inGame && room.dealtAdvanced ? room.dealtAdvanced : room?.config?.advanced || {}), talkStep: inGame ? room.dealtAdvanced?.talkStep === true : true };
};
function dealNow(room) {
  const err = (e) => ({ error: e });
  const n = room.players.length;
  if (n < MIN_PLAYERS) return err(`Need at least ${MIN_PLAYERS} players (you have ${n}).`);
  if (room.config.roles.length !== n) return err(`Pick exactly ${n} roles (you picked ${room.config.roles.length}).`);
  const needsMafia = room.config.roles.some((r) => factionOf(r) === 'mafia');
  if (!needsMafia) return err('Add at least one Mafia-aligned role.');
  const fatal = setupWarnings(room.config.roles, n).find((w) => w.level === 'error');
  if (fatal) return err(fatal.text);
  room.dealtAdvanced = undefined; room.dealtAdvanced = advancedOf(room); // pinned for this game: rooms already dealt keep what they were dealt with
  if (room.config.mode === 'app') {
    const map = dealRoles(room.config.roles, room.players.map((p) => p.id));
    for (const p of room.players) p.roleId = map[p.id];
    assignCallNumbers(room);
  } else {
    room.deck = { map: buildDeckMap(room.config.roles, room.config.deckStyle), claimed: {} };
  }
  room.phase = 'dealt';
  log(room, room.config.mode === 'app' ? 'Roles dealt to phones.' : 'Card deck built. Deal the cards.');
  return { ok: true };
}

// ---------- projections (what each viewer is allowed to see) ----------
// Executioner-style roles get a random town target when the game starts.
function assignTargets(room) {
  for (const p of room.players) {
    if (p.roleId && ROLE_BY_ID[p.roleId].needsTarget && !p.target) {
      const pool = room.players.filter((q) => q.id !== p.id && factionOf(q.roleId) === 'town');
      const pick = pool.length ? pool[randInt(pool.length)] : null; p.target = pick?.id || null;
    }
  }
}

// ---------- game-over event ----------
// Sent once, by the room, to every connected socket the moment the game ends, so every phone and the table screen
// show the victory card together. Public facts only; `won` is added for a player's own phone and is never in anyone else's.
const TEAM_NAME = { town: 'Town', mafia: 'The Mafia', killer: 'The Serial Killer', cult: 'The Cult', none: 'Nobody', draw: 'A draw' };
export function gameOverEvent(room, playerId = null) {
  const w = room.winner || { side: 'none', reason: '' };
  const theme = w.side === 'town' || w.side === 'mafia' ? w.side : w.side === 'none' || w.side === 'draw' ? 'none' : 'third';
  const ev = { type: 'gameOver', side: w.side, team: TEAM_NAME[w.side] || w.side, theme, reason: w.reason || '' };
  if (playerId) ev.won = finalWinners(room).some((x) => x.id === playerId);
  return ev;
}
export const justEnded = (phaseBefore, room) => phaseBefore !== 'over' && room.phase === 'over';

// Everything the room sends one socket after a change: its view, plus the game-over event when the game just ended.
export function messagesFor(room, att, connected = new Set(), announce = false) {
  if (!att?.who) return [];
  const host = att.who === 'host';
  const moved = !host && !!playerById(room, att.playerId)?.offline; // a socket still holding a seat that now plays on the host phone gets nothing of it
  const out = [{ type: 'view', view: host ? viewForHost(room, connected) : moved ? { kind: 'gone' } : viewForPlayer(room, att.playerId, connected) }];
  if (announce && room.phase === 'over') out.push(gameOverEvent(room, host ? null : att.playerId));
  if (canSeeGraveyard(room, att)) out.push({ type: 'graveyard', entries: room.graveyard || [] });
  return out;
}

export function roleCard(roleId) {
  const r = ROLE_BY_ID[roleId];
  return r && { id: r.id, name: r.name, emoji: r.emoji, alignment: r.alignment, blurb: r.blurb, meeting: r.meeting };
}

// v4 rooms only: the read-aloud script, computed here so the client never decides the version itself.
function storyOf(room) {
  if (!hasStoryScript(room)) return undefined;
  const steps = {};
  if (room.phase === 'night') for (const st of nightScript(room)) { const x = stepScript(st, room); if (x) steps[st.key] = x; }
  return {
    open: nightOpen(room), close: nightClose(room), prep: room.phase === 'night' ? prepNotes(room) : [], steps,
    morning: room.lastReport ? morningAnnouncement(room, room.lastReport) : null,
  };
}

export function viewForHost(room, connected = new Set()) {
  registerRoles(room.config.customRoles);
  const over = room.phase === 'over';
  return {
    story: storyOf(room),
    kind: 'host', code: room.code, gameNo: room.gameNo || 1, nightVersion: room.nightVersion || 1, upgradeNext: room.upgradeNext || null, phase: room.phase, day: room.day, night: room.night, config: room.config, advanced: advancedOf(room),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, offline: p.offline, open: !!p.open, connected: p.offline || (!p.open && connected.has(p.id)), alive: p.alive,
      roleId: p.roleId, card: p.card, tags: p.tags, note: p.note, target: p.target || null,
      deathCause: p.deathCause || null, roleHidden: !!p.roleHidden, convertedFrom: p.convertedFrom || null, becameJester: !!p.becameJester, jesterSeen: !!p.jesterSeen,
    })),
    deck: room.deck, copSalt: room.copSalt, callNo: room.callNo, script: room.phase === 'night' ? nightScript(room) : [], pending: room.pending,
    report: room.lastReport, log: room.log.slice(-60), winner: room.winner, winners: over ? finalWinners(room) : [],
    sideWins: room.sideWins, usage: room.usage, dayUsed: room.dayUsed, shield: room.shield,
    stalemate: stalemateOf(room),
    limits: { min: MIN_PLAYERS, max: MAX_PLAYERS },
  };
}

// Rebuilds enough of a room from the host's view to dry-run the night (live investigator results).
// Shared by the Host console and the simulator, so both preview exactly the same way.
// Old ids (see ROLE_ALIASES) in a stored room or host view are rewritten to the canonical role, in place.
export function migrateRoleIds(room) {
  const c = room?.config;
  // A room before night version 10 keeps its roles and names; its old exact-role Detective (`detective`) is stored as `detective_v1`.
  const fix = hasMergedDetective(room) ? resolveRoleId : (id) => pinStoredId(resolveRoleId(id));
  if (c?.roles) c.roles = c.roles.map(fix);
  for (const p of room?.players || []) { if (p.roleId) p.roleId = fix(p.roleId); if (p.convertedFrom) p.convertedFrom = fix(p.convertedFrom); }
  if (room?.deck?.map) for (const m of room.deck.map) m.roleId = fix(m.roleId);
  return room;
}

export function roomFromView(v) {
  migrateRoleIds(v);
  return {
    code: v.code, gameNo: v.gameNo, nightVersion: v.nightVersion, phase: v.phase, night: v.night, day: v.day, config: v.config, deck: v.deck, copSalt: v.copSalt, callNo: v.callNo, winner: null,
    players: v.players.map((p) => ({ ...p, tags: [...(p.tags || [])] })), usage: { ...(v.usage || {}) },
    shield: v.shield, dayUsed: { ...(v.dayUsed || {}) }, sideWins: [...(v.sideWins || [])], pending: [], log: [], framed: [],
  };
}

// Static setup for the "Roles in this game" sheet: believed roles only, so look-alike ids never reach a phone.
function setupFor(room) {
  // What each role looks like to its holder (v7: the Confused Cop is a Cop), so variant ids never reach phones.
  const roles = room.config.roles || [];
  const ids = roles.map((id) => shownRoleId(id, room));
  const unreliable = [...new Set(roles.filter((id, i) => ids[i] !== id).map((id, i) => shownRoleId(id, room)))];
  // Hidden setup: the roles never leave the room. Phones get the player count and the rules, nothing about the mix.
  if (advancedOf(room).hiddenSetup) return { setupRoles: [], setupUnreliable: [], setupHidden: true, rules: rulesOf(room) };
  return { setupRoles: ids, setupUnreliable: unreliable, setupHidden: false, rules: rulesOf(room) };
}

export function viewForPlayer(room, playerId, connected = new Set()) {
  registerRoles(room.config.customRoles);
  const me = playerById(room, playerId);
  if (!me || me.open) return { kind: 'gone' }; // a released seat: an old phone still holding it sees nothing (a seat moved to the host phone is handled in messagesFor)
  const over = room.phase === 'over';
  const real = me.roleId && ROLE_BY_ID[me.roleId];
  const jester = !!me.becameJester && !!me.jesterSeen && real?.id === 'executioner'; // v8: told at night, so the phone card follows
  const shownId = jester ? 'jester' : real ? shownRoleId(real.id, room) : null;
  const callNo = callNumbers(room)[me.id];
  const team = [];
  if (real?.meeting) {
    for (const q of room.players) {
      if (q.id !== me.id && q.roleId && ROLE_BY_ID[q.roleId].meeting === real.meeting) {
        // A disguised teammate is shown as what they think they are, so nobody holding the same role learns it.
        team.push({ id: q.id, name: q.name, role: real.meeting === 'mafia' ? roleCard(ROLE_BY_ID[q.roleId].seesAs || q.roleId) : null, alive: q.alive });
      }
    }
  }
  const knows = [];
  if (real?.showMafia) {
    for (const q of room.players) if (q.roleId && factionOf(q.roleId) === 'mafia') knows.push({ id: q.id, name: q.name });
  }
  const visible = (q) => over || (rulesOf(room).revealOnDeath && !q.alive && !q.roleHidden);
  return {
    kind: 'player', code: room.code, gameNo: room.gameNo || 1, phase: room.phase, day: room.day, night: room.night, mode: room.config.mode, theme: room.config.theme || 'city',
    me: {
      id: me.id, name: me.name, alive: me.alive, card: me.card,
      callName: callNo && room.phase !== 'lobby' && (room.config.mode === 'app' || room.phase !== 'dealt') ? `${callNo.family} ${callNo.n}` : null,
      role: shownId ? roleCard(shownId) : null, guide: shownId ? roleGuide(shownId, rulesOf(room)) : null,
      results: hasNightOnlyChecks(room) ? [] : (room.results || []).filter((r) => r.ids.includes(me.id)).map((r) => ({ night: r.night, text: r.text })), team, knows,
      target: !jester && real?.needsTarget && me.target ? playerById(room, me.target)?.name : null,
      claimsLeft: Math.max(0, MAX_WRONG_CLAIMS - me.wrongClaims),
      won: over ? finalWinners(room).some((w) => w.id === me.id) : null,
    },
    players: room.players.map((q) => ({
      id: q.id, name: q.name, alive: q.alive, connected: q.offline || connected.has(q.id),
      role: visible(q) ? roleCard(q.roleId) : null, cause: !q.alive ? (q.deathCause === 'condemned' ? 'condemned' : 'died in the night') : null,
    })),
    sharedBoard: room.config.sharedBoard,
    deckCards: room.config.mode === 'cards' && room.phase === 'dealt' ? room.deck?.map.length : null,
    deckKey: room.config.mode === 'cards' && room.config.cardFlow === 'blind' && room.deck
      ? [...room.deck.map].sort((x, y) => FULL_DECK.indexOf(x.card) - FULL_DECK.indexOf(y.card)).map((m) => ({ card: m.card, role: roleCard(shownRoleId(m.roleId, room)) })) : null, // disguised roles show what they think they are
    ...setupFor(room),
    winner: over ? room.winner : null,
    winners: over ? finalWinners(room) : [],
    publicLog: room.log.filter((l) => !l.private && /died|condemned|Game over|taken down|eliminated|nobody/i.test(l.text)).slice(-20).map((l) => ({ night: l.night, day: l.day, text: l.text.replace(/\s*\(.*?\)\s*$/, '') })),
  };
}
