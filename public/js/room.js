// Room state + reducer + per-viewer projections. Pure functions: used by the Durable Object and by local mode.
import {
  FULL_DECK, MIN_PLAYERS, MAX_PLAYERS, suggestRoles, dealRoles, buildDeckMap, isCard, shuffle, randInt,
  applyWinChecks, playerById, nightScript, resolveNight, isBlind, unidentifiedSlots, finalizeBlind, condemn, resolvePending, killPlayer, log, finalWinners, stalemateOf,
  setupWarnings, DEFAULT_RULES, rulesOf,
} from './engine.js';
import { THEMES } from './theme.js';
import { ROLE_BY_ID, factionOf, registerRoles, sanitizeRole, resolveRoleId } from './roles.js';
import { roleGuide } from './role_guide.js';
import { ROOM_MODES, CARD_FLOWS } from './modes.js';

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
    nightVersion: 2, // dead roles are still called at night; rooms stored without this field are version 1 (see engine nightVersion)
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
  for (const p of room.players) { p.roleId = null; p.card = null; p.alive = true; p.tags = []; p.deathCause = null; p.roleHidden = false; p.target = null; p.convertedFrom = null; p.wrongClaims = 0; }
  room.copSalt = Math.random(); // seeds the neutral "Cop 1/2/..." numbering for this game
  room.deck = null; room.phase = 'lobby'; room.day = 0; room.night = 0; room.condemnedDay = null; room.usage = {}; room.dayUsed = {};
  room.pending = []; room.winner = null; room.sideWins = []; room.lastReport = null; room.results = []; room.shield = false; room.framed = [];
}

// actor: { host: true } | { playerId } | { anon: true }
export function reduce(room, actor, a) {
  registerRoles(room.config.customRoles);
  migrateRoleIds(room);
  if (a && typeof a.roleId === 'string') a = { ...a, roleId: resolveRoleId(a.roleId) };
  const host = !!actor.host;
  const err = (e) => ({ error: e });
  const t = a.type;

  // ---- anyone ----
  if (t === 'join') {
    if (room.phase !== 'lobby') return err('The game has already started.');
    const r = addPlayer(room, a.name, false);
    return r.error ? r : { ok: true, data: { playerId: r.player.id, token: r.player.token } };
  }

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
    room.deck.claimed[card] = me.id; me.card = card; me.roleId = slot.roleId;
    return { ok: true };
  }

  // The victory card's "Play again": the host or any seated player, once the game is over. Same players, back to the lobby.
  if (t === 'playAgain') {
    if (!host && !(actor.playerId && playerById(room, actor.playerId))) return err('Not in this room.');
    if (room.phase !== 'over') return err('The game is not over.');
    resetDeal(room); return { ok: true };
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
      if (Array.isArray(a.roles)) c.roles = a.roles.map(resolveRoleId).filter((r) => ROLE_BY_ID[r]).slice(0, MAX_PLAYERS);
      if (typeof a.sharedBoard === 'boolean') c.sharedBoard = a.sharedBoard;
      if (a.theme && THEMES[a.theme]) c.theme = a.theme;
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
      const n = room.players.length;
      if (n < MIN_PLAYERS) return err(`Need at least ${MIN_PLAYERS} players (you have ${n}).`);
      if (room.config.roles.length !== n) return err(`Pick exactly ${n} roles (you picked ${room.config.roles.length}).`);
      const needsMafia = room.config.roles.some((r) => factionOf(r) === 'mafia');
      if (!needsMafia) return err('Add at least one Mafia-aligned role.');
      const fatal = setupWarnings(room.config.roles, n).find((w) => w.level === 'error');
      if (fatal) return err(fatal.text);
      if (room.config.mode === 'app') {
        const map = dealRoles(room.config.roles, room.players.map((p) => p.id));
        for (const p of room.players) p.roleId = map[p.id];
      } else {
        room.deck = { map: buildDeckMap(room.config.roles, room.config.deckStyle), claimed: {} };
      }
      room.phase = 'dealt';
      log(room, room.config.mode === 'app' ? 'Roles dealt to phones.' : 'Card deck built. Deal the cards.');
      return { ok: true };
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
      room.deck.claimed[a.card] = p.id; p.card = a.card; p.roleId = slot.roleId; p.wrongClaims = 0;
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
      p.roleId = resolveRoleId(a.roleId); return { ok: true };
    }
    case 'startNight': {
      if (!['dealt', 'day'].includes(room.phase)) return err('Cannot start a night now.');
      if (room.pending.length) return err('Resolve the pending prompts first.');
      const blindFirst = isBlind(room) && room.night === 0;
      if (!blindFirst && room.players.some((p) => !p.roleId)) return err('Every player needs a role first.');
      room.night += 1; room.phase = 'night'; room.condemnedDay = null;
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
    case 'noCondemn': { if (!['day', 'night'].includes(room.phase)) return err('Not in play.'); log(room, 'Nobody was condemned.'); return { ok: true }; }
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
      p.alive = true; p.deathCause = null; p.roleHidden = false; p.deathDay = null; p.deathNight = null;
      room.pending = room.pending.filter((x) => x.playerId !== p.id); // no dead-player prompt for someone back in play
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
    case 'newGame': { resetDeal(room); return { ok: true }; }
    default: return err('Unknown action.');
  }
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
  const out = [{ type: 'view', view: host ? viewForHost(room, connected) : viewForPlayer(room, att.playerId, connected) }];
  if (announce && room.phase === 'over') out.push(gameOverEvent(room, host ? null : att.playerId));
  return out;
}

export function roleCard(roleId) {
  const r = ROLE_BY_ID[roleId];
  return r && { id: r.id, name: r.name, emoji: r.emoji, alignment: r.alignment, blurb: r.blurb, meeting: r.meeting };
}

export function viewForHost(room, connected = new Set()) {
  registerRoles(room.config.customRoles);
  const over = room.phase === 'over';
  return {
    kind: 'host', code: room.code, nightVersion: room.nightVersion || 1, phase: room.phase, day: room.day, night: room.night, config: room.config,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, offline: p.offline, connected: p.offline || connected.has(p.id), alive: p.alive,
      roleId: p.roleId, card: p.card, tags: p.tags, note: p.note, target: p.target || null,
      deathCause: p.deathCause || null, roleHidden: !!p.roleHidden, convertedFrom: p.convertedFrom || null,
    })),
    deck: room.deck, copSalt: room.copSalt, script: room.phase === 'night' ? nightScript(room) : [], pending: room.pending,
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
  if (c?.roles) c.roles = c.roles.map(resolveRoleId);
  for (const p of room?.players || []) { if (p.roleId) p.roleId = resolveRoleId(p.roleId); if (p.convertedFrom) p.convertedFrom = resolveRoleId(p.convertedFrom); }
  if (room?.deck?.map) for (const m of room.deck.map) m.roleId = resolveRoleId(m.roleId);
  return room;
}

export function roomFromView(v) {
  migrateRoleIds(v);
  return {
    code: v.code, nightVersion: v.nightVersion, phase: v.phase, night: v.night, day: v.day, config: v.config, deck: v.deck, copSalt: v.copSalt, winner: null,
    players: v.players.map((p) => ({ ...p, tags: [...(p.tags || [])] })), usage: { ...(v.usage || {}) },
    shield: v.shield, dayUsed: { ...(v.dayUsed || {}) }, sideWins: [...(v.sideWins || [])], pending: [], log: [], framed: [],
  };
}

export function viewForPlayer(room, playerId, connected = new Set()) {
  registerRoles(room.config.customRoles);
  const me = playerById(room, playerId);
  if (!me) return { kind: 'gone' };
  const over = room.phase === 'over';
  const real = me.roleId && ROLE_BY_ID[me.roleId];
  const shownId = real ? (real.seesAs || real.id) : null;
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
    kind: 'player', code: room.code, phase: room.phase, day: room.day, night: room.night, mode: room.config.mode, theme: room.config.theme || 'city',
    me: {
      id: me.id, name: me.name, alive: me.alive, card: me.card,
      role: shownId ? roleCard(shownId) : null, guide: shownId ? roleGuide(shownId, rulesOf(room)) : null,
      results: (room.results || []).filter((r) => r.ids.includes(me.id)).map((r) => ({ night: r.night, text: r.text })), team, knows,
      target: real?.needsTarget && me.target ? playerById(room, me.target)?.name : null,
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
      ? [...room.deck.map].sort((x, y) => FULL_DECK.indexOf(x.card) - FULL_DECK.indexOf(y.card)).map((m) => ({ card: m.card, role: roleCard(ROLE_BY_ID[m.roleId]?.seesAs || m.roleId) })) : null, // disguised roles show what they think they are
    winner: over ? room.winner : null,
    winners: over ? finalWinners(room) : [],
    publicLog: room.log.filter((l) => !l.private && /died|condemned|Game over|taken down|eliminated|nobody/i.test(l.text)).slice(-20).map((l) => ({ night: l.night, day: l.day, text: l.text.replace(/\s*\(.*?\)\s*$/, '') })),
  };
}
