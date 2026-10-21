// Pure game logic. Shared by the Cloudflare Worker, the browser (local mode) and node tests.
import { ROLES, ROLE_BY_ID, factionOf } from './roles.js';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 50;

// ---------- randomness ----------
export function randInt(n) {
  const a = new Uint32Array(1);
  const lim = Math.floor(0x100000000 / n) * n;
  let x;
  do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim);
  return x % n;
}
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- role suggestion ----------
const TOWN_PRIORITY = ['doctor', 'cop', 'detective', 'bodyguard', 'vigilante', 'tracker', 'hunter', 'jailer',
  'lookout', 'mason', 'mason', 'coroner', 'security_guard', 'merlin', 'governor', 'grandma'];

export function suggestRoles(n) {
  const m = Math.max(1, Math.round((n - 1) / 4));
  const mafia = ['mafia'];
  if (n >= 8 && m >= 2) mafia.push('godfather');
  if (n >= 11 && m >= 3) mafia.push('hooker');
  while (mafia.length < m) mafia.push('mafia');
  const third = n >= 9 ? ['jester'] : [];
  if (n >= 16) third.push('killer');
  const minVillagers = Math.max(1, Math.floor(n / 5));
  const powerSlots = Math.max(0, n - mafia.length - third.length - minVillagers);
  let power = TOWN_PRIORITY.slice(0, Math.min(powerSlots, TOWN_PRIORITY.length));
  if (power.filter((r) => r === 'mason').length === 1) power = power.filter((r) => r !== 'mason'); // a lone Mason has nobody to meet
  const roles = [...mafia, ...third, ...power];
  while (roles.length < n) roles.push('villager');
  return roles.slice(0, n);
}

export function dealRoles(roleIds, playerIds) {
  const shuffled = shuffle(roleIds);
  return Object.fromEntries(playerIds.map((id, i) => [id, shuffled[i]]));
}

// ---------- playing-card deck ----------
export const SUITS = [
  { id: 'S', sym: '♠', red: false }, { id: 'H', sym: '♥', red: true },
  { id: 'D', sym: '♦', red: true }, { id: 'C', sym: '♣', red: false },
];
export const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
export const FULL_DECK = [...SUITS.flatMap((s) => RANKS.map((r) => r + s.id)), 'RJ', 'BJ'];

export function cardInfo(id) {
  if (id === 'RJ') return { id, label: 'Red Joker', short: '🃏', red: true, name: 'Red Joker' };
  if (id === 'BJ') return { id, label: 'Black Joker', short: '🃏', red: false, name: 'Black Joker' };
  const rank = id.slice(0, -1);
  const suit = SUITS.find((s) => s.id === id.slice(-1));
  if (!suit || !RANKS.includes(rank)) return null;
  const rn = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' }[rank] || rank;
  const sn = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }[suit.id];
  return { id, label: `${rank}${suit.sym}`, short: `${rank}${suit.sym}`, red: suit.red, name: `${rn} of ${sn}` };
}
export const isCard = (id) => typeof id === 'string' && FULL_DECK.includes(id);

const lowRed = ['2', '3', '4', '5', '6', '7', '8', '9', '10'].flatMap((r) => ['H', 'D'].map((s) => r + s));
const redHigh = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'].flatMap((r) => ['H', 'D'].map((s) => r + s));
const blackHigh = RANKS.flatMap((r) => ['S', 'C'].map((s) => r + s));
const FIXED_HOME = {
  godfather: ['AS'], don: ['KS'], mafia: ['AC', 'KC', 'QS', 'QC', 'JS', 'JC', '10S', '10C'],
  doctor: ['AH'], cop: ['KH'], detective: ['QH'], bodyguard: ['JH'], vigilante: ['KD'],
  mason: ['AD', 'QD'], jester: ['RJ'], killer: ['BJ'], villager: lowRed,
};
const FIXED_POOL = { town: redHigh, mafia: blackHigh, third: ['RJ', 'BJ', ...[...blackHigh].reverse()] };

// Returns [{card, roleId}] — one card per role slot.
export function buildDeckMap(roleIds, style = 'random') {
  if (roleIds.length > FULL_DECK.length) throw new Error('Too many roles for one deck');
  if (style === 'random') {
    const cards = shuffle(FULL_DECK).slice(0, roleIds.length);
    return shuffle(roleIds).map((roleId, i) => ({ card: cards[i], roleId }));
  }
  const used = new Set();
  const out = [];
  const take = (list) => { const c = list.find((x) => !used.has(x)); if (c) used.add(c); return c; };
  const order = [...roleIds].sort((a, b) => (a === 'villager') - (b === 'villager'));
  for (const roleId of order) {
    const al = ROLE_BY_ID[roleId]?.alignment || 'town';
    const card = take(FIXED_HOME[roleId] || []) || take(FIXED_POOL[al]) || take(FULL_DECK);
    out.push({ card, roleId });
  }
  return out;
}

// ---------- helpers on a room ----------
export const playerById = (room, id) => room.players.find((p) => p.id === id);
const nameOf = (room, id) => playerById(room, id)?.name || '?';
const usedCount = (room, id) => room.usage?.[id] || 0;

// What a Cop-style check shows for a player: 'mafia' | 'innocent'
export function appearsAs(room, p) {
  if (room.framed?.includes(p.id)) return 'mafia';
  const r = ROLE_BY_ID[p.roleId];
  if (r?.appearsAs) return r.appearsAs;
  return r?.alignment === 'mafia' ? 'mafia' : 'innocent';
}

// ---------- night script ----------
// Ordered list of steps for the storyteller to walk through.
export const isBlind = (room) => room.config?.mode === 'cards' && room.config?.cardFlow === 'blind';

// Roles in the deck that nobody has been matched to yet: [{roleId, remaining}]
export function unidentifiedSlots(room) {
  if (!room.deck) return [];
  const want = {};
  for (const m of room.deck.map) want[m.roleId] = (want[m.roleId] || 0) + 1;
  for (const p of room.players) if (p.roleId && want[p.roleId]) want[p.roleId]--;
  return Object.entries(want).filter(([, n]) => n > 0).map(([roleId, remaining]) => ({ roleId, remaining }));
}

export function nightScript(room) {
  const steps = [];
  const alive = room.players.filter((p) => p.alive && p.roleId);
  const firstNight = room.night === 1;
  const blindNow = isBlind(room) && firstNight;
  if (blindNow) {
    const open = room.players.filter((p) => !p.roleId).map((p) => p.id);
    for (const { roleId, remaining } of unidentifiedSlots(room)) {
      if (roleId === 'villager') continue;
      const r = ROLE_BY_ID[roleId];
      const base = r.action?.order ?? (r.meeting === 'mafia' ? 50 : r.meeting === 'cult' ? 31 : 80);
      steps.push({ key: `id:${roleId}`, kind: 'identify', roleId, count: remaining, candidates: open, order: base - 0.5,
        prompt: `${r.name}${remaining > 1 ? 's' : ''}, open your eyes. Tap who ${remaining > 1 ? 'they are' : 'it is'}.` });
    }
  }
  const seenMeeting = new Set();
  const seenInfo = new Set();

  for (const p of alive) {
    const r = ROLE_BY_ID[p.roleId];
    if (firstNight && r.night1 && !seenInfo.has(r.id)) {
      seenInfo.add(r.id);
      const actors = alive.filter((q) => q.roleId === r.id).map((q) => q.id);
      steps.push({ key: `n1:${r.id}`, kind: 'info', roleId: r.id, actors, prompt: r.night1, order: blindNow ? 105 : 5 });
    }
    if (r.meeting && !seenMeeting.has(r.meeting)) {
      seenMeeting.add(r.meeting);
      const actors = alive.filter((q) => ROLE_BY_ID[q.roleId].meeting === r.meeting).map((q) => q.id);
      if (r.meeting === 'mafia') {
        steps.push({ key: 'meeting:mafia', kind: 'action', type: 'kill', roleId: 'mafia', actors, targets: 1,
          prompt: 'Mafia, wake up. Who do you kill?', order: 50, source: 'mafia' });
      } else if (r.meeting === 'cult') {
        steps.push({ key: 'meeting:cult', kind: 'action', type: 'convert', roleId: 'cult', actors, targets: 1,
          prompt: 'Cult, wake up. Who do you recruit?', order: 31, to: 'cult' });
      }
    }
    if (r.action && !r.action.group) {
      const used = usedCount(room, p.id);
      if (used >= r.action.uses) continue;
      steps.push({ key: `act:${p.id}`, kind: 'action', roleId: r.id, actors: [p.id], ...r.action });
    }
  }
  return steps.sort((a, b) => a.order - b.order);
}

// When every non-villager slot is matched, hand the rest of the table the Villager slots.
export function finalizeBlind(room) {
  const slots = unidentifiedSlots(room);
  const open = room.players.filter((p) => !p.roleId);
  if (slots.length && slots.every((s) => s.roleId === 'villager') && slots[0].remaining === open.length) {
    for (const p of open) p.roleId = 'villager';
  }
}

// ---------- killing ----------
export function killPlayer(room, id, cause, opts = {}) {
  const p = playerById(room, id);
  if (!p || !p.alive) return false;
  p.alive = false;
  p.deathCause = cause;
  p.deathDay = room.day;
  p.deathNight = room.night;
  if (opts.hideRole) p.roleHidden = true;
  const r = ROLE_BY_ID[p.roleId];
  if (r?.onDeath) addPending(room, p, r.onDeath);
  if (cause === 'condemned' && r?.onCondemn) addPending(room, p, r.onCondemn);
  return true;
}
function addPending(room, p, text) {
  room.pending ||= [];
  room.pending.push({ id: 'pend' + (room.seq = (room.seq || 0) + 1), playerId: p.id, text });
}
export function log(room, text) {
  room.log ||= [];
  room.log.push({ night: room.night, day: room.day, phase: room.phase, text });
  if (room.log.length > 400) room.log.splice(0, room.log.length - 400);
}

// ---------- night resolution ----------
// actions: { [stepKey]: { targets: [playerId...], on?: boolean } }
export function resolveNight(room, actions) {
  const steps = nightScript(room).filter((s) => s.kind === 'action');
  const rep = { night: room.night, deaths: [], saves: [], info: [], conversions: [], notes: [] };
  const alivePlayer = (id) => playerById(room, id);

  const acts = steps.map((s) => {
    const raw = actions?.[s.key] || {};
    const targets = (raw.targets || []).filter((id) => playerById(room, id));
    const need = s.targets ?? 1;
    const on = need === 0 ? !!raw.on : targets.length >= need;
    return { s, targets, on };
  }).filter((a) => a.on);

  // usage
  room.usage ||= {};
  for (const a of acts) if (Number.isFinite(a.s.uses)) for (const id of a.s.actors) room.usage[id] = usedCount(room, id) + 1;

  // 1) jail / block / door-guards (iterate: a blocker can itself be blocked)
  const jailed = new Set(acts.filter((a) => a.s.type === 'jail').map((a) => a.targets[0]));
  let blockedPlayers = new Set(jailed);
  let blockedActs = new Set();
  const isBlocked = (a) => blockedActs.has(a) || a.s.actors.every((id) => blockedPlayers.has(id));
  for (let i = 0; i < 4; i++) {
    const active = acts.filter((a) => !isBlocked(a));
    const nbp = new Set(jailed);
    for (const a of active) if (a.s.type === 'block') nbp.add(a.targets[0]);
    const guards = active.filter((a) => a.s.type === 'blockVisitors');
    const nba = new Set();
    for (const a of acts) {
      if (!a.targets.length) continue;
      for (const g of guards) if (g !== a && a.targets.includes(g.targets[0])) nba.add(a);
    }
    blockedPlayers = nbp; blockedActs = nba;
  }
  const active = acts.filter((a) => !isBlocked(a));
  for (const a of acts) if (!active.includes(a)) {
    rep.notes.push(`${a.s.actors.map((id) => nameOf(room, id)).join(', ')} (${ROLE_BY_ID[a.s.roleId].name}) was blocked. Tell them nothing happened, or that they were distracted.`);
  }

  // 2) who visited whom (non-blocked acts)
  const visits = {};
  for (const a of active) for (const t of a.targets) (visits[t] ||= []).push(...a.s.actors);

  // 3) protections
  const protectedSet = new Set(jailed);
  const protectedBy = {};
  for (const a of active.filter((x) => x.s.type === 'protect')) { protectedSet.add(a.targets[0]); (protectedBy[a.targets[0]] ||= []).push(a.s.actors[0]); }
  const guardMap = {};
  for (const a of active.filter((x) => x.s.type === 'guard')) (guardMap[a.targets[0]] ||= []).push(a.s.actors[0]);
  const alertSet = new Set(active.filter((x) => x.s.type === 'alert').flatMap((a) => a.s.actors));

  // 4) frames last for tonight only
  room.framed = active.filter((a) => a.s.type === 'frame').map((a) => a.targets[0]);

  // 5) kills
  const dying = new Map(); // id -> cause
  const cleaned = new Set();
  const markDeath = (id, cause) => { if (!dying.has(id)) dying.set(id, cause); };
  for (const a of active.filter((x) => x.s.type === 'alert')) {
    for (const v of visits[a.s.actors[0]] || []) markDeath(v, `shot by ${nameOf(room, a.s.actors[0])} on alert`);
  }
  for (const a of active.filter((x) => x.s.type === 'kill')) {
    const t = a.targets[0];
    const tp = alivePlayer(t);
    const tr = ROLE_BY_ID[tp.roleId];
    const src = a.s.source || 'kill';
    if (!tp.alive) continue;
    if (room.shield) { rep.saves.push({ target: t, text: `${tp.name} survived: nobody can be killed tonight.` }); continue; }
    if (tr.nightImmune) { rep.saves.push({ target: t, text: `${tp.name} (Grandma) cannot be killed at night.` }); continue; }
    if (jailed.has(t) || alertSet.has(t)) { rep.saves.push({ target: t, text: `${tp.name} survived the attack.` }); continue; }
    if (guardMap[t]?.length) { // each bodyguard absorbs one hit; a second attacker gets through
      const bg = guardMap[t].shift();
      markDeath(bg, `took the hit for ${tp.name}`);
      rep.saves.push({ target: t, text: `${nameOf(room, bg)} (Bodyguard) died protecting ${tp.name}.` });
      continue;
    }
    if (protectedSet.has(t)) { rep.saves.push({ target: t, text: `${tp.name} was attacked but saved.` }); continue; }
    markDeath(t, src === 'mafia' ? 'killed by the Mafia' : src === 'killer' ? 'killed by the Serial Killer' : src === 'vigilante' ? 'shot by the Vigilante' : 'killed in the night');
    if (tr.retaliate) for (const k of a.s.actors) markDeath(k, `blown up by ${tp.name} (Bomb)`);
    if (src === 'mafia') cleaned.add(t);
  }
  const clean = active.find((a) => a.s.type === 'clean');

  // 6) conversions and role copying
  for (const a of active.filter((x) => x.s.type === 'convert')) {
    const t = alivePlayer(a.targets[0]);
    if (!t.alive || dying.has(t.id)) continue;
    const to = a.s.to;
    if (factionOf(t.roleId) === (to === 'mafia' ? 'mafia' : to)) continue;
    const from = t.roleId;
    t.convertedFrom = from;
    t.roleId = to;
    rep.conversions.push({ id: t.id, from, to, text: `${t.name} was converted to ${ROLE_BY_ID[to].name}. Tell them quietly.` });
  }
  for (const a of active.filter((x) => x.s.type === 'copyRole')) {
    const t = alivePlayer(a.targets[0]);
    const me = alivePlayer(a.s.actors[0]);
    if (t && !t.alive && me) {
      me.convertedFrom = me.roleId; me.roleId = t.roleId;
      rep.conversions.push({ id: me.id, from: 'amnesiac', to: t.roleId, text: `${me.name} remembers: they are now ${ROLE_BY_ID[t.roleId].name}.` });
    }
  }

  // 7) information
  const sideName = (v) => (v === 'mafia' ? 'MAFIA' : 'NOT Mafia');
  for (const a of active.filter((x) => ['investigate', 'track', 'watch', 'autopsy'].includes(x.s.type))) {
    const actorIds = a.s.actors;
    const t = alivePlayer(a.targets[0]);
    let text;
    if (a.s.type === 'investigate') {
      const chk = a.s.check;
      if (chk === 'alignment') text = `${t.name} is ${sideName(appearsAs(room, t))}.`;
      else if (chk === 'inverted') text = `${t.name} is ${sideName(appearsAs(room, t) === 'mafia' ? 'innocent' : 'mafia')} (Insane Cop: result is flipped; say it as true).`;
      else if (chk === 'role') text = `${t.name} is the ${ROLE_BY_ID[t.roleId].name}.`;
      else if (chk === 'parity') {
        const u = alivePlayer(a.targets[1]);
        const same = appearsAs(room, t) === appearsAs(room, u);
        text = `${t.name} and ${u.name} are ${same ? 'on the SAME side' : 'on DIFFERENT sides'}.`;
      } else if (chk === 'fake') {
        text = `${t.name} is ${sideName(randInt(2) ? 'mafia' : 'innocent')} (Wannabe: made-up result).`;
      }
    } else if (a.s.type === 'track') {
      const went = active.filter((x) => x.s.actors.includes(t.id) && x.targets.length).flatMap((x) => x.targets).map((id) => nameOf(room, id));
      text = went.length ? `${t.name} visited ${[...new Set(went)].join(', ')}.` : `${t.name} stayed home.`;
    } else if (a.s.type === 'watch') {
      const who = (visits[t.id] || []).filter((id) => !actorIds.includes(id)).map((id) => nameOf(room, id));
      text = who.length ? `${[...new Set(who)].join(', ')} visited ${t.name}.` : `Nobody visited ${t.name}.`;
    } else if (a.s.type === 'autopsy') {
      text = `${t.name} was the ${ROLE_BY_ID[t.roleId].name}.`;
    }
    rep.info.push({ actorIds, roleId: a.s.roleId, text });
  }

  // 8) apply deaths
  const hide = !!clean && cleaned.size > 0;
  if (hide) { rep.notes.push(`Janitor cleaned the victim: do not reveal their role.`); }
  for (const [id, cause] of dying) {
    const hideRole = hide && cleaned.has(id);
    if (killPlayer(room, id, cause, { hideRole })) rep.deaths.push({ id, cause, hidden: hideRole });
  }

  room.shield = false;
  room.day = room.night;
  room.phase = 'day';
  room.lastReport = rep;
  log(room, rep.deaths.length ? `Night ${room.night}: ${rep.deaths.map((d) => nameOf(room, d.id)).join(', ')} died.` : `Night ${room.night}: nobody died.`);
  applyWinChecks(room);
  return rep;
}

// ---------- day events ----------
export function condemn(room, id) {
  const p = playerById(room, id);
  if (!p || !p.alive) return { error: 'Player is not alive' };
  const r = ROLE_BY_ID[p.roleId];
  killPlayer(room, id, 'condemned');
  log(room, `${p.name} was condemned.`);
  if (r.shield) room.shield = true;
  // side wins
  room.sideWins ||= [];
  if (r.sideWin === 'condemned') room.sideWins.push({ id: p.id, reason: `${p.name} (Jester) got condemned.` });
  for (const q of room.players) {
    if (ROLE_BY_ID[q.roleId]?.sideWin === 'target' && q.target === id) {
      room.sideWins.push({ id: q.id, reason: `${q.name} (Executioner): target ${p.name} was condemned.` });
    }
  }
  applyWinChecks(room);
  return { ok: true };
}

export function resolvePending(room, pendingId, targetId) {
  const i = (room.pending || []).findIndex((x) => x.id === pendingId);
  if (i < 0) return { error: 'No such prompt' };
  const [pend] = room.pending.splice(i, 1);
  if (targetId) {
    const t = playerById(room, targetId);
    if (t?.alive) {
      killPlayer(room, targetId, `taken down by ${nameOf(room, pend.playerId)}`);
      log(room, `${t.name} was taken down by ${nameOf(room, pend.playerId)}.`);
    }
  }
  applyWinChecks(room);
  return { ok: true };
}

// ---------- win conditions ----------
export function checkWin(room) {
  const alive = room.players.filter((p) => p.alive && p.roleId);
  if (!alive.length) return { side: 'none', reason: 'Everyone is dead.' };
  const mafia = alive.filter((p) => factionOf(p.roleId) === 'mafia');
  const killers = alive.filter((p) => factionOf(p.roleId) === 'killer');
  const cult = alive.filter((p) => factionOf(p.roleId) === 'cult');
  const mafiaWeight = mafia.reduce((s, p) => s + (ROLE_BY_ID[p.roleId].weight || 1), 0);
  if (!mafia.length && !killers.length && !cult.length) return { side: 'town', reason: 'All threats have been eliminated.' };
  if (cult.length === alive.length) return { side: 'cult', reason: 'Everyone left alive is in the cult.' };
  if (killers.length && !mafia.length && !cult.length && killers.length >= alive.length - killers.length) {
    return { side: 'killer', reason: 'The Serial Killer outlasted everyone.' };
  }
  if (mafia.length && !killers.length && !cult.length && mafiaWeight >= alive.length - mafia.length) {
    return { side: 'mafia', reason: 'The Mafia now match or outnumber the rest.' };
  }
  return null;
}
export function applyWinChecks(room) {
  const w = checkWin(room);
  if (w && !room.winner) {
    room.winner = w; room.phase = 'over';
    log(room, `Game over: ${w.side} wins. ${w.reason}`);
  }
}

// Players who count as winners once the game is over.
export function finalWinners(room) {
  const w = room.winner;
  if (!w) return [];
  const out = new Map();
  const add = (p, reason) => { if (!out.has(p.id)) out.set(p.id, reason); };
  for (const p of room.players) {
    if (!p.roleId) continue;
    const r = ROLE_BY_ID[p.roleId];
    const f = factionOf(p.roleId);
    if (w.side === f) add(p, `${r.name} team wins`);
    if (w.side === 'mafia' && r.winsWith === 'mafia') add(p, 'Traitor wins with the Mafia');
    if (r.winsWith === 'survivor' && p.alive) add(p, 'Survived to the end');
    if (r.winsWith === 'town-loss' && p.alive && w.side !== 'town') add(p, 'Alive when the town lost');
  }
  for (const s of room.sideWins || []) { const p = playerById(room, s.id); if (p) add(p, s.reason); }
  return [...out].map(([id, reason]) => ({ id, reason }));
}

export { ROLES, ROLE_BY_ID, factionOf };
