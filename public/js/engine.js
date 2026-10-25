// Pure game logic. Shared by the Cloudflare Worker, the browser (local mode) and node tests.
import { ROLES, ROLE_BY_ID, factionOf } from './roles.js';
import { simpleDeckMap } from './simple.js';

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
  return rebalance(roles.slice(0, n)); // even the suggestion out with the same scores the lobby shows
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
  if (style === 'simple') return simpleDeckMap(roleIds);
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
// Ordered list of steps for the Host to walk through.
export const isBlind = (room) => room.config?.mode === 'cards' && room.config?.cardFlow === 'blind';

// Roles in the deck that nobody has been matched to yet: [{roleId, remaining}]
export function unidentifiedSlots(room) {
  if (!room.deck) return [];
  const want = {};
  for (const m of room.deck.map) want[m.roleId] = (want[m.roleId] || 0) + 1;
  for (const p of room.players) if (p.roleId && want[p.roleId]) want[p.roleId]--;
  return Object.entries(want).filter(([, n]) => n > 0).map(([roleId, remaining]) => ({ roleId, remaining }));
}

// House rules the Host can switch in the lobby.
export const DEFAULT_RULES = { revealOnDeath: true, selfProtect: true, firstNightKill: true, dayStart: false };
export const rulesOf = (room) => ({ ...DEFAULT_RULES, ...(room?.config?.rules || {}) });

// Night-script rules version, stored on the room when it is created. 1 (or no field: a legacy room) skips dead
// roles at night; 2 calls them exactly like living ones (their action then does nothing, see resolveNight).
export const nightVersion = (room) => room?.nightVersion || 1;
// 3 adds the graveyard rules: shared calls list every holder (dead ones too), so the Host's step looks the same
// alive or dead, and a dead investigator gets a neutral non-answer instead of the real result (previewNight).
export const hasGraveyard = (room) => nightVersion(room) >= 3;
export const NEUTRAL_ANSWER = 'No answer tonight.';
// 4 adds the Host script (stepScript, prepNotes, morningAnnouncement, checkCard) and keeps every v2/v3 rule.
// In v4 the night step list holds only calls that wake somebody; silent host notes move to prepNotes.
export const hasStoryScript = (room) => nightVersion(room) >= 4;
// 5: investigator results (Cop, Detective...) are given only at night through the check card; never in the morning report, host day screens or the player's phone.
export const hasNightOnlyChecks = (room) => nightVersion(room) >= 5;
// 6: the Godfather shows as a Villager to the Detective's exact-role check (the Cop still sees NOT MAFIA via appearsAs).
export const hasGodfatherDisguise = (room) => nightVersion(room) >= 6;
export const LATEST_NIGHT_VERSION = 6;
// 7: every look-alike call family is numbered 1..N (Cop 1, Cop 2...), the player's phone shows their number, and the Confused Cop is a disguised Cop
export const hasNumberedCalls = (room) => nightVersion(room) >= 7;

// The role id a player believes they hold. v7 treats the Confused Cop as a disguised Cop (older rooms keep it open).
export const shownRoleId = (roleId, room) => (hasNumberedCalls(room) && roleId === 'confused_cop' ? 'cop' : ROLE_BY_ID[roleId]?.seesAs || roleId);
const callHash = (room, id) => [...`${room.copSalt}:${id}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
// Holders of each family that has its own individual wake-up call (alive and dead, so numbers never move on a death).
function callFamilies(room) {
  const fams = {};
  for (const p of room.players || []) {
    const r = ROLE_BY_ID[p.roleId];
    if (!r?.action || r.action.group || r.meeting) continue;
    const fam = ROLE_BY_ID[shownRoleId(p.roleId, room)] || r;
    (fams[fam.id] ||= { fam, ids: [] }).ids.push(p.id);
  }
  return Object.values(fams).filter((f) => f.ids.length > 1);
}
// { playerId: { family, n, of } } for every holder of a family with 2+ players. Uses the stored room.callNo shuffle
// when it still covers the family exactly, otherwise a deterministic shuffle seeded by copSalt.
export function callNumbers(room) {
  const out = {};
  if (!room || !hasNumberedCalls(room)) return out;
  for (const { fam, ids } of callFamilies(room)) {
    const stored = ids.map((id) => room.callNo?.[id]);
    const ok = [...stored].sort((a, b) => a - b).every((n, i) => n === i + 1);
    const order = [...ids].sort((a, b) => (ok ? room.callNo[a] - room.callNo[b] : callHash(room, a) - callHash(room, b) || (a < b ? -1 : 1)));
    order.forEach((id, i) => { out[id] = { family: fam.name, n: i + 1, of: ids.length }; });
  }
  return out;
}
// Stores a fresh random numbering on the room (deal time, role changes, night start). Keeps families that are already valid.
export function assignCallNumbers(room) {
  if (!hasNumberedCalls(room)) return;
  const callNo = {};
  for (const { ids } of callFamilies(room)) {
    const keep = room.callNo && ids.every((id) => room.callNo[id]) && [...ids].map((id) => room.callNo[id]).sort((a, b) => a - b).every((n, i) => n === i + 1);
    if (keep) { for (const id of ids) callNo[id] = room.callNo[id]; continue; }
    const pool = [...ids];
    for (let i = pool.length - 1; i > 0; i--) { const j = randInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    pool.forEach((id, i) => { callNo[id] = i + 1; });
  }
  room.callNo = callNo;
}

const isQuiet = (st) => st.kind === 'info' && !st.spoken;
export function nightScript(room) {
  const steps = scriptSteps(room);
  return hasStoryScript(room) ? steps.filter((st) => !isQuiet(st)) : steps;
}

function scriptSteps(room) {
  const rules = rulesOf(room);
  const steps = [];
  const v2 = nightVersion(room) >= 2;
  const alive = room.players.filter((p) => (v2 || p.alive) && p.roleId);
  // Who answers a shared call: the living members, or all of them when none is left (v2 only), so the call still happens.
  const answering = (pred) => {
    const all = alive.filter(pred);
    const live = all.filter((q) => q.alive);
    if (hasGraveyard(room)) return all.map((q) => q.id);
    return (live.length ? live : all).map((q) => q.id);
  };
  const firstNight = room.night === 1;
  const blindNow = isBlind(room) && firstNight;
  if (blindNow) {
    const open = room.players.filter((p) => !p.roleId).map((p) => p.id);
    for (const { roleId, remaining } of unidentifiedSlots(room)) {
      if (roleId === 'villager') continue;
      const r = ROLE_BY_ID[roleId];
      const base = r.action?.order ?? (r.meeting === 'mafia' ? 50 : r.meeting === 'cult' ? 31 : 80);
      // Call people by the role they THINK they have; never say a disguised role's real name aloud.
      const shown = ROLE_BY_ID[r.seesAs] || r;
      const twins = room.deck.map.filter((m) => m.roleId !== roleId && (ROLE_BY_ID[m.roleId]?.seesAs || m.roleId) === shown.id);
      const cards = room.deck.map.filter((m) => m.roleId === roleId).map((m) => m.card);
      steps.push({ key: `id:${roleId}`, kind: 'identify', roleId, count: remaining, candidates: open, order: base - 0.5,
        prompt: `${shown.name}${remaining > 1 ? 's' : ''}, open your eyes. Tap who ${remaining > 1 ? 'they are' : 'it is'}.`,
        hint: r.seesAs || twins.length
          ? `Several players think they are the ${shown.name}. Ask them to show you their card without a word: ${cards.join(' or ')} is the ${r.name}.` : '' });
    }
  }
  const seenMeeting = new Set();
  const seenInfo = new Set();

  for (const p of alive) {
    const r = ROLE_BY_ID[p.roleId];
    if (firstNight && r.night1 && !seenInfo.has(r.id)) {
      seenInfo.add(r.id);
      const actors = answering((q) => q.roleId === r.id);
      // Lines that call players awake are read aloud; everything else is a private note for the Host.
      const spoken = !r.seesAs && /open your eyes/i.test(r.night1);
      steps.push({ key: `n1:${r.id}`, kind: 'info', roleId: r.id, actors, prompt: r.night1, spoken, order: blindNow ? 105 : 5 });
    }
    if (r.meeting && !seenMeeting.has(r.meeting)) {
      seenMeeting.add(r.meeting);
      const actors = answering((q) => ROLE_BY_ID[q.roleId].meeting === r.meeting);
      if (r.meeting === 'mafia' && firstNight && !rules.firstNightKill) {
        // No kill tonight, but the Mafia still need to see who their teammates are.
        steps.push({ key: 'meeting:mafia', kind: 'info', roleId: 'mafia', actors, spoken: true, order: 50,
          prompt: 'Mafia, open your eyes and look at each other. There is no kill tonight. Close your eyes.' });
      } else if (r.meeting === 'mafia') {
        steps.push({ key: 'meeting:mafia', kind: 'action', type: 'kill', roleId: 'mafia', actors, targets: 1,
          prompt: 'Mafia, wake up. Who do you kill?', order: 50, source: 'mafia' });
      } else if (r.meeting === 'cult') {
        steps.push({ key: 'meeting:cult', kind: 'action', type: 'convert', roleId: 'cult', actors, targets: 1,
          prompt: 'Cult, wake up. Who do you recruit?', order: 31, to: 'cult' });
      }
    }
    if (r.action && !r.action.group) {
      if (firstNight && !rules.firstNightKill && r.action.type === 'kill') continue;
      const used = usedCount(room, p.id);
      if (used >= r.action.uses) continue;
      steps.push({ key: `act:${p.id}`, kind: 'action', roleId: r.id, actors: [p.id], ...r.action });
    }
  }
  if (hasNumberedCalls(room)) {
    const nums = callNumbers(room);
    for (const st of steps) {
      const num = st.kind === 'action' && st.key.startsWith('act:') && nums[st.actors[0]];
      if (!num) continue;
      const label = `${num.family} ${num.n}`;
      st.prompt = /^[^,]+,/.test(st.prompt) ? st.prompt.replace(/^[^,]+,/, `${label},`) : `${label}, ${st.prompt}`;
      st.order += num.n * 0.001;
      st.label = label;
      st.realRole = ROLE_BY_ID[st.roleId]?.name;
      if (st.check === 'random') st.silentFlip = true;
      st.hint = `${label} is ${nameOf(room, st.actors[0])}. Tap them on the shoulder so only they wake.`;
    }
  }
  // Several players who look like "Cop" (real, disguised, or the same type twice) each get their own neutral
  // numbered call. Numbers follow a per-game shuffled rank stored on the room, so they never hint at the real role.
  const looksCop = (st) => st.kind === 'action' && (ROLE_BY_ID[ROLE_BY_ID[st.roleId]?.seesAs] || ROLE_BY_ID[st.roleId])?.id === 'cop';
  const copSteps = hasNumberedCalls(room) ? [] : steps.filter(looksCop);
  if (copSteps.length > 1) {
    const rank = (st) => [...`${room.copSalt}:${st.actors[0]}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
    copSteps.sort((a, b) => rank(a) - rank(b));
    copSteps.forEach((st, i) => {
      const label = `Cop ${i + 1}`;
      st.prompt = st.prompt.replace(/^Cop,/, `${label},`);
      st.order += i * 0.001;
      st.hint = `${label} is ${nameOf(room, st.actors[0])}. Tap them on the shoulder so only they wake.`;
    });
  }
  // Confused Cops are an open role: own calls, numbered only when there are several.
  const confSteps = hasNumberedCalls(room) ? [] : steps.filter((st) => st.kind === 'action' && st.roleId === 'confused_cop');
  if (confSteps.length > 1) confSteps.forEach((st, i) => {
    st.prompt = st.prompt.replace(/^Confused Cop,/, `Confused Cop ${i + 1},`);
    st.order += i * 0.001;
    st.hint = `Confused Cop ${i + 1} is ${nameOf(room, st.actors[0])}.`;
  });
  // Any other shared call (two Lookouts, say): wake them one by one.
  const said = {};
  for (const st of steps) if (st.kind === 'action' && !st.hint) (said[st.prompt] ||= []).push(st);
  for (const group of Object.values(said)) if (group.length > 1) for (const st of group) {
    st.hint = `More than one player answers to this call. Tap ${st.actors.map((id) => nameOf(room, id)).join(' and ')} on the shoulder so only they wake.`;
  }
  return steps.sort((a, b) => a.order - b.order);
}

// ---------- Host script (v4) ----------
// Host-only "Before night N" notes: the steps where nobody wakes (private notes such as an Executioner's target).
export function prepNotes(room) {
  if (!hasStoryScript(room)) return [];
  return scriptSteps(room).filter(isQuiet).map((st) => ({ key: st.key, roleId: st.roleId, actors: st.actors, text: st.prompt }));
}
export const nightOpen = () => START_CUE;
export const nightClose = () => END_CUE;

// One read-aloud line per step: { say, then, notes }. `say` calls the step, `then` closes it after the choice
// (null when `say` already closes), `notes` are for the Host only. Identical alive or dead.
export function stepScript(step, room) {
  if (!hasStoryScript(room) || !step) return null;
  const cues = stepCues(step);
  if (!cues) return null;
  const notes = [];
  let say = cues.open;
  if (step.kind === 'info' && cues.close) {
    // "Merlin, open your eyes. Show them the Mafia.": only the call is spoken, the rest tells the Host what to do.
    const parts = String(step.prompt).match(/[^.!?]+[.!?]*/g).map((x) => x.trim()).filter(Boolean);
    const at = Math.max(0, parts.findIndex((x) => /open your eyes/i.test(x)));
    say = parts.slice(0, at + 1).join(' ');
    if (parts.length > at + 1) notes.push(parts.slice(at + 1).join(' '));
  }
  if (step.kind === 'identify') {
    notes.push(`Tap who ${step.count > 1 ? 'they are' : 'it is'} in the app.`);
  }
  if (step.hint) notes.push(step.hint);
  else if (step.kind === 'action' && step.actors.length === 1 && !step.key.startsWith('meeting:')) notes.push(`Tap ${nameOf(room, step.actors[0])} on the shoulder so only they wake.`);
  if (step.kind === 'action') {
    notes.push(step.targets === 0 ? 'Tap their yes / no answer in the app.' : `Tap the ${step.targets > 1 ? `${step.targets} players` : 'player'} they point to.`);
    if (step.type === 'investigate') notes.push('Then show them the result card.');
  }
  return { say, then: cues.close, notes };
}

// What the Host says out loud around a night step: { open, close }, or null when nobody wakes
// (private notes, announcements). Teams are called by their team name; lines already in the prompt are reused.
const TEAM_NAME = { mafia: 'Mafia', cult: 'Cult', mason: 'Masons' };
const ASK = {
  kill: 'Pick someone to eliminate.', protect: 'Pick someone to protect.', guard: 'Pick someone to guard.',
  alert: 'Go on alert tonight, or stay in?', jail: 'Pick someone to jail.', block: 'Pick someone to block.',
  blockVisitors: 'Pick someone to shield from visitors.', frame: 'Pick someone to frame.', clean: 'Clean up tonight, or not?',
  convert: 'Pick someone to recruit.', copyRole: 'Pick a dead player to copy.', investigate: 'Pick someone to investigate.',
  track: 'Pick someone to follow.', watch: 'Pick someone to watch.', autopsy: 'Pick a dead player to examine.',
};
// A fair crypto coin for roles whose answer is a coin flip. Decided once, when the target is entered.
export const flipCoin = () => (randInt(2) ? 'heads' : 'tails');
export const START_CUE = 'Everyone, close your eyes.';
export const END_CUE = 'Everyone, open your eyes.';
export function stepCues(step) {
  if (!step || (step.kind === 'info' && !step.spoken)) return null;
  const r = ROLE_BY_ID[step.roleId];
  const said = String(step.prompt || '').replace(/\s*Tap who (it is|they are)\.?\s*$/, '');
  const name = TEAM_NAME[r?.meeting] || /^(.+?),\s/.exec(said)?.[1] || (ROLE_BY_ID[r?.seesAs] || r)?.name || 'Everyone';
  const open = /open your eyes/i.test(said) ? said
    : `${name}, open your eyes.${step.kind === 'action' ? ` ${ASK[step.type] || 'Make your choice.'}` : ''}`;
  return { open, close: /close your eyes/i.test(said) ? null : `${name}, close your eyes.` };
}

// The silent gesture the Host gives after a role's private choice is recorded: { kind, text }, or null.
// `result` is the previewNight answer for investigators (null while a coin flip is pending). Yes/no results
// (Mafia / not Mafia) get a nod or shake; every other private choice gets an acknowledging nod.
export function stepGesture(step, result) {
  if (!stepCues(step) || step.kind !== 'action') return null;
  if (['investigate', 'track', 'watch', 'autopsy'].includes(step.type)) {
    if (!result || result.blocked) return null;
    if (result.neutral && step.type === 'investigate') return { kind: 'yesno', text: 'Give no sign: keep your hand flat and still' };
    const m = /^(.+) is (MAFIA|NOT Mafia)\.$/.exec(result.text || '');
    if (step.type === 'investigate' && m) {
      return m[2] === 'MAFIA'
        ? { kind: 'yesno', text: `Nod your head / Thumbs up — ${m[1]} is Mafia` }
        : { kind: 'yesno', text: `Shake your head / Thumbs down — ${m[1]} is not Mafia` };
    }
  }
  return { kind: 'ack', text: 'Give them a nod: choice recorded' };
}

// Lines read or shown after a done step's result, in order: the gesture, then the close-eyes cue.
export function doneStepLines(step, result) {
  const out = [];
  const g = stepGesture(step, result);
  if (g) out.push({ type: 'gesture', ...g });
  const close = stepCues(step)?.close;
  if (close) out.push({ type: 'say', text: close });
  return out;
}

// What the Host should tell an investigator right now, given only the choices made by roles that woke
// earlier tonight (steps before it in the script; at the same wake order, the ones listed first).
// Runs the night on a copy of the room, so nothing changes.
export function previewNight(room, actions, stepKey) {
  const steps = nightScript(room);
  const me = steps.find((st) => st.key === stepKey);
  if (!me) return null;
  // v3: a dead investigator's screen has the same shape as a real result, but says the same neutral thing for any target.
  if (hasGraveyard(room) && ['investigate', 'track', 'watch', 'autopsy'].includes(me.type) && !me.actors.some((id) => playerById(room, id)?.alive)) {
    return { text: NEUTRAL_ANSWER, note: '', neutral: true };
  }
  const sofar = {};
  for (const st of steps.slice(0, steps.indexOf(me) + 1)) if (actions?.[st.key]) sofar[st.key] = actions[st.key];
  const copy = structuredClone(room);
  copy.log = []; copy.pending = [];
  resolveNight(copy, sofar, { ghost: stepKey, preview: true }); // a dead investigator's call looks like any other to the Host
  return copy.lastReport.info.find((i) => i.key === stepKey) || { text: '', note: 'No result: they were blocked or stayed home.', blocked: true };
}

// Advice about a role set before dealing. level: 'error' blocks the deal, 'warn' is risky, 'tip' is a nudge.
export function setupWarnings(roleIds, playerCount) {
  const out = [];
  const roles = roleIds.map((id) => ROLE_BY_ID[id]).filter(Boolean);
  const n = Math.max(playerCount, roles.length);
  const count = (pred) => roles.filter(pred).length;
  const mafia = roles.filter((r) => factionOf(r.id) === 'mafia');
  const mafiaWeight = mafia.reduce((t, r) => t + (r.weight || 1), 0);
  const third = count((r) => factionOf(r.id) === 'third');
  const town = count((r) => factionOf(r.id) === 'town');
  const has = (id) => roles.some((r) => r.id === id);
  const hasCheck = roles.some((r) => r.action?.type === 'investigate' && ['alignment', 'role', 'parity'].includes(r.action.check));
  if (!mafia.length) out.push({ level: 'error', text: 'Add at least one Mafia role.' });
  if (mafia.length && mafiaWeight >= n - mafia.length) out.push({ level: 'error', text: `The Mafia already match everyone else (${mafia.length} of ${n}). They would win before anyone wakes up.` });
  else if (mafia.length && mafiaWeight / n > 0.4) out.push({ level: 'warn', text: `${mafia.length} Mafia in ${n} players is a lot. Around 1 in 4 is usual.` });
  else if (n >= 8 && mafia.length && mafia.length / n < 0.17) out.push({ level: 'warn', text: `Only ${mafia.length} Mafia in ${n} players. Town will usually win; around 1 in 4 is usual.` });
  if (third / n > 0.3) out.push({ level: 'warn', text: `${third} third-party roles is a lot. Town and Mafia may never finish each other off.` });
  const soloKillers = count((r) => factionOf(r.id) === 'third' && r.action?.type === 'kill');
  if (soloKillers >= 2) out.push({ level: 'warn', text: `${soloKillers} solo killers: games end very fast.` });
  if (count((r) => r.meeting === 'mason') === 1) out.push({ level: 'warn', text: 'A single Mason has nobody to meet. Add a second or remove it.' });
  if (has('lover') && count((r) => r.id === 'lover') !== 2) out.push({ level: 'warn', text: 'Lovers come in pairs. Use exactly two.' });
  const deceivers = roles.filter((r) => r.appearsAs === 'innocent' || r.action?.type === 'frame' || r.appearsAs === 'mafia');
  if (deceivers.length && !hasCheck) out.push({ level: 'tip', text: `${[...new Set(deceivers.map((r) => r.name))].join(', ')} only matter${deceivers.length === 1 ? 's' : ''} if someone investigates. Add a Cop or Detective.` });
  if (n >= 7 && !hasCheck) out.push({ level: 'tip', text: 'Nobody can investigate, so Town has to guess. Add a Cop for a classic game.' });
  // Generic pairing rule: a role with requiresPartner needs that role in the game, or the deal is blocked.
  for (const r of roles) {
    const need = r.requiresPartner && ROLE_BY_ID[r.requiresPartner];
    if (need && !has(need.id)) {
      const text = `${r.name} needs a regular ${need.name} in the game. Add a ${need.name}.`;
      if (!out.some((w) => w.text === text)) out.push({ level: 'error', text });
    }
  }
  if (has('placebo_doctor') && !has('doctor')) out.push({ level: 'tip', text: 'A Placebo Doctor works best with a real Doctor in the game.' });
  for (const r of roles.filter((x) => x.seesAs && x.seesAs !== 'villager')) {
    if (!has(r.seesAs)) out.push({ level: 'tip', text: `The ${r.name} thinks they are the ${ROLE_BY_ID[r.seesAs].name}, and there is no real ${ROLE_BY_ID[r.seesAs].name}. That's fine, but nobody will contradict them.` });
  }
  const killers = count((r) => r.action?.type === 'kill' || r.meeting === 'mafia' && r.id === 'mafia') || (mafia.length ? 1 : 0);
  const savers = count((r) => ['protect', 'guard', 'jail'].includes(r.action?.type));
  if (savers > killers + 1) out.push({ level: 'warn', text: `${savers} protectors against ${killers} killer${killers === 1 ? '' : 's'}: nights may often end with nobody dead.` });
  const uniques = ['godfather', 'doctor', 'cop', 'jailer', 'mayor', 'president', 'janitor'];
  for (const id of uniques) if (count((r) => r.id === id) > 1) out.push({ level: 'tip', text: `More than one ${ROLE_BY_ID[id].name}. That works, but it's unusual.` });
  return out;
}

// When every non-villager slot is matched, hand the rest of the table the Villager slots.
export function finalizeBlind(room) {
  const slots = unidentifiedSlots(room);
  const open = room.players.filter((p) => !p.roleId);
  if (slots.length && slots.every((s) => s.roleId === 'villager') && slots[0].remaining === open.length) {
    for (const p of open) p.roleId = 'villager';
  }
  assignCallNumbers(room);
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
export function log(room, text, opts = {}) {
  room.log ||= [];
  room.log.push({ night: room.night, day: room.day, phase: room.phase, text, ...(opts.private ? { private: true } : {}) });
  if (room.log.length > 400) room.log.splice(0, room.log.length - 400);
}

// ---------- night resolution ----------
// actions: { [stepKey]: { targets: [playerId...], on?: boolean } }
export function resolveNight(room, actions, opts = {}) {
  const steps = nightScript(room).filter((s) => s.kind === 'action');
  const rep = { night: room.night, deaths: [], saves: [], info: [], conversions: [], notes: [] };
  const alivePlayer = (id) => playerById(room, id);
  const selfProtect = rulesOf(room).selfProtect;

  // Nobody targets themselves, except protectors when the house rule allows it. The console never offers it;
  // this keeps a stale or hand-made request from doing it anyway. The same player can't be picked twice.
  const acts = steps.map((s, idx) => {
    const raw = actions?.[s.key] || {};
    const selfOk = s.type === 'protect' && selfProtect;
    const targets = [...new Set(raw.targets || [])].filter((id) => playerById(room, id) && (selfOk || !s.actors.includes(id)));
    const need = s.targets ?? 1;
    const on = need === 0 ? !!raw.on : targets.length >= need;
    return { s, idx, targets, on, coin: raw.coin === 'mafia' || raw.coin === 'innocent' ? raw.coin : null, flip: raw.flip === 'heads' || raw.flip === 'tails' ? raw.flip : null };
  }).filter((a) => a.on)
    // v2: a dead role is still called, but what the Host records for it does nothing. (`ghost` is previewNight only.)
    .filter((a) => nightVersion(room) < 2 || a.s.key === opts.ghost || a.s.actors.some((id) => playerById(room, id)?.alive));

  // usage
  room.usage ||= {};
  for (const a of acts) if (Number.isFinite(a.s.uses) && a.s.type !== 'clean') for (const id of a.s.actors) room.usage[id] = usedCount(room, id) + 1;

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

  // 2) who visited whom (non-blocked acts). A team kill is carried out by ONE free member: a plain killer if
  // possible, otherwise whoever is free. Blocked members stay home, so they are not seen and not shot.
  for (const a of active) {
    const free = a.s.actors.filter((id) => !blockedPlayers.has(id) && (!hasGraveyard(room) || playerById(room, id)?.alive));
    const plain = free.find((id) => !ROLE_BY_ID[playerById(room, id)?.roleId]?.action || ROLE_BY_ID[playerById(room, id)?.roleId]?.action?.type === 'kill');
    a.visitors = a.s.actors.length > 1 ? [plain || free[0]].filter(Boolean) : a.s.actors;
    if (a.s.actors.length > 1 && a.s.type === 'kill' && a.visitors[0]) rep.notes.push(`${nameOf(room, a.visitors[0])} carried out the ${ROLE_BY_ID[a.s.roleId]?.name || 'team'} kill.`);
  }
  const visits = {};
  for (const a of active) for (const t of a.targets) (visits[t] ||= []).push(...a.visitors);

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
    if (tr.nightImmune) { rep.saves.push({ target: t, text: `${tp.name} (${tr.name}) cannot be killed at night.` }); continue; }
    if (jailed.has(t) || alertSet.has(t)) { rep.saves.push({ target: t, text: `${tp.name} survived the attack.` }); continue; }
    if (guardMap[t]?.length) { // each bodyguard absorbs one hit; a second attacker gets through
      const bg = guardMap[t].shift();
      markDeath(bg, `took the hit for ${tp.name}`);
      rep.saves.push({ target: t, text: `${nameOf(room, bg)} (${ROLE_BY_ID[playerById(room, bg)?.roleId]?.name || 'Bodyguard'}) died protecting ${tp.name}.` });
      continue;
    }
    if (protectedSet.has(t)) { rep.saves.push({ target: t, text: `${tp.name} was attacked but saved.` }); continue; }
    markDeath(t, src === 'mafia' ? 'killed by the Mafia' : src === 'killer' ? 'killed by the Serial Killer' : src === 'vigilante' ? 'shot by the Vigilante' : 'killed in the night');
    if (tr.retaliate) for (const k of a.visitors) markDeath(k, `blown up by ${tp.name} (${tr.name})`);
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

  // 7) information. `text` is exactly what the Host says; `note` is for the Host only.
  // Trackers and Lookouts only see visits by roles that woke before them: that is what the Host could
  // tell them live (previewNight), so the morning report and the phone must say the same.
  const wokeBy = (a) => active.filter((x) => x.idx <= a.idx);
  const sideName = (v) => (v === 'mafia' ? 'MAFIA' : 'NOT Mafia');
  for (const a of active.filter((x) => ['investigate', 'track', 'watch', 'autopsy'].includes(x.s.type))) {
    const actorIds = a.s.actors;
    const t = alivePlayer(a.targets[0]);
    let text; let note = ''; let coinInfo = null;
    if (a.s.type === 'investigate') {
      const chk = a.s.check;
      if (chk === 'alignment') text = `${t.name} is ${sideName(appearsAs(room, t))}.`;
      else if (chk === 'inverted') { text = `${t.name} is ${sideName(appearsAs(room, t) === 'mafia' ? 'innocent' : 'mafia')}.`; note = 'Insane Cop: this is the flipped result. Say it as if it were true.'; }
      else if (chk === 'random') {
        // Open role: heads = the true Cop result, tails = the opposite. The flip is decided when the target is entered.
        const flip = a.flip || flipCoin();
        const truth = appearsAs(room, t);
        text = `${t.name} is ${sideName(flip === 'heads' ? truth : truth === 'mafia' ? 'innocent' : 'mafia')}.`;
        note = flip === 'heads' ? 'Confused Cop: coin landed Heads, this is the TRUE answer.' : 'Confused Cop: coin landed Tails, this is the FLIPPED answer.';
        coinInfo = { flip, text: `Confused Cop ${nameOf(room, actorIds[0])} checked ${t.name}: coin landed ${flip === 'heads' ? 'Heads (true answer)' : 'Tails (flipped answer)'}.` };
      }
      else if (chk === 'naive') { text = `${t.name} is ${sideName('innocent')}.`; note = 'Naive Cop: everyone looks innocent to them. Say it as if it were true.'; }
      else if (chk === 'paranoid') { text = `${t.name} is ${sideName('mafia')}.`; note = 'Paranoid Cop: everyone looks guilty to them. Say it as if it were true.'; }
      else if (chk === 'role') {
        const disguised = hasGodfatherDisguise(room) && t.roleId === 'godfather' && (a.s.roleId === 'detective' || ROLE_BY_ID[a.s.roleId]?.seesAs === 'detective');
        text = `${t.name} is the ${ROLE_BY_ID[disguised ? 'villager' : t.roleId].name}.`;
      }
      else if (chk === 'parity') {
        const u = alivePlayer(a.targets[1]);
        const same = appearsAs(room, t) === appearsAs(room, u);
        text = `${t.name} and ${u.name} are ${same ? 'on the SAME side' : 'on DIFFERENT sides'}.`;
      } else if (chk === 'fake') {
        text = `${t.name} is ${sideName(a.coin || (randInt(2) ? 'mafia' : 'innocent'))}.`; note = 'Made-up result (a coin flip).';
      }
    } else if (a.s.type === 'track') {
      const went = wokeBy(a).filter((x) => x.visitors.includes(t.id) && x.targets.length).flatMap((x) => x.targets).map((id) => nameOf(room, id));
      text = went.length ? `${t.name} visited ${[...new Set(went)].join(', ')}.` : `${t.name} stayed home.`;
    } else if (a.s.type === 'watch') {
      const who = wokeBy(a).filter((x) => x.targets.includes(t.id)).flatMap((x) => x.visitors).filter((id) => !actorIds.includes(id)).map((id) => nameOf(room, id));
      text = who.length ? `${[...new Set(who)].join(', ')} visited ${t.name}.` : `Nobody visited ${t.name}.`;
    } else if (a.s.type === 'autopsy') {
      text = `${t.name} was the ${ROLE_BY_ID[t.roleId].name}.`;
    }
    if (!(hasNightOnlyChecks(room) && a.s.type === 'investigate' && !opts.preview)) rep.info.push({ actorIds, roleId: a.s.roleId, key: a.s.key, text, note, ...(coinInfo ? { flip: coinInfo.flip } : {}) });
    if (coinInfo) { (rep.coins ||= []).push({ key: a.s.key, flip: coinInfo.flip, text: coinInfo.text }); log(room, `Night ${room.night}: ${coinInfo.text}`, { private: true }); }
  }

  // 8) apply deaths
  const hide = !!clean && cleaned.size > 0;
  if (hide) {
    rep.notes.push(`Janitor cleaned the victim: do not reveal their role.`);
    if (Number.isFinite(clean.s.uses)) for (const id of clean.s.actors) room.usage[id] = usedCount(room, id) + 1; // single use is only spent on a real clean
  }
  for (const [id, cause] of dying) {
    const hideRole = hide && cleaned.has(id);
    if (killPlayer(room, id, cause, { hideRole })) rep.deaths.push({ id, cause, hidden: hideRole });
  }

  room.shield = false;
  room.day = room.night;
  room.phase = 'day';
  room.lastReport = rep;
  // Each investigator's own results, kept for their phone. Only the text they are told; never the private note.
  room.results ||= [];
  for (const i of rep.info) if (i.text && i.actorIds?.length) room.results.push({ night: room.night, ids: i.actorIds, text: i.text });
  if (room.results.length > 200) room.results.splice(0, room.results.length - 200);
  log(room, rep.deaths.length ? `Night ${room.night}: ${rep.deaths.map((d) => nameOf(room, d.id)).join(', ')} died.` : `Night ${room.night}: nobody died.`);
  applyWinChecks(room);
  return rep;
}

// ---------- day events ----------
// The morning read-aloud (v4): { say, notes }. `say` is only what the table may hear (deaths, and their roles when
// the rules show them); saves, results, coins and the Janitor stay in `notes`. Computed from the night's report.
export function morningAnnouncement(room, report) {
  if (!hasStoryScript(room)) return null;
  const rep = report || room.lastReport || { deaths: [], saves: [], info: [], conversions: [], notes: [] };
  const reveal = rulesOf(room).revealOnDeath;
  const say = ['Everyone, open your eyes.'];
  if (!rep.deaths?.length) say.push('Nobody died last night.');
  for (const d of rep.deaths || []) {
    say.push(`${nameOf(room, d.id)} was killed in the night.`);
    if (d.hidden) say.push('Their role stays a mystery.');
    else if (reveal) say.push(`They were the ${ROLE_BY_ID[playerById(room, d.id)?.roleId]?.name || 'Villager'}.`);
  }
  const notes = [];
  for (const sv of rep.saves || []) notes.push(sv.text);
  for (const i of rep.info || []) if (i.text) notes.push(`${i.actorIds.map((id) => nameOf(room, id)).join(', ')} (${ROLE_BY_ID[i.roleId]?.name}): ${i.text}${i.note ? ` ${i.note}` : ''}`);
  for (const c of rep.coins || []) notes.push(c.text);
  for (const c of rep.conversions || []) notes.push(c.text);
  for (const d of rep.deaths || []) notes.push(`${nameOf(room, d.id)}: ${d.cause}.`);
  notes.push(...(rep.notes || []));
  return { say: say.join(' '), notes };
}

// The Host's full-screen "show the player" card for an investigation: { kind, text }, or null. `result` is the
// previewNight answer (null while a coin flip is pending). Never holds a player name or a number.
export function checkCard(room, step, result) {
  if (!hasStoryScript(room) || !step || step.kind !== 'action' || step.type !== 'investigate' || !result) return null;
  if (result.neutral) return { kind: 'none', text: 'NO ANSWER' };
  if (result.blocked) return null;
  const t = String(result.text || '');
  if (step.check === 'role') {
    const hit = Object.values(ROLE_BY_ID).filter((r) => t.endsWith(` is the ${r.name}.`)).sort((a, b) => b.name.length - a.name.length)[0];
    return hit ? { kind: 'role', text: hit.name.toUpperCase() } : null;
  }
  if (step.check === 'parity') return t.endsWith('SAME side.') ? { kind: 'parity', text: 'SAME' } : t.endsWith('DIFFERENT sides.') ? { kind: 'parity', text: 'DIFFERENT' } : null;
  if (t.endsWith(' is MAFIA.')) return { kind: 'alignment', text: 'MAFIA' };
  if (t.endsWith(' is NOT Mafia.')) return { kind: 'alignment', text: 'NOT MAFIA' };
  return null;
}

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
    if (q.alive && ROLE_BY_ID[q.roleId]?.sideWin === 'target' && q.target === id) {
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
  if (room.players.some((p) => !p.roleId)) return null; // roles not all known yet (lobby / blind night 1)
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
// Cult vs Serial Killer: when they are the only sides left, checkWin has no rule for it and the nights can loop.
// Nishant's rule (2026-10-23): the Host decides each time. Returns the sides to offer, or null.
export function stalemateOf(room) {
  if (!['day', 'night'].includes(room.phase) || room.winner) return null;
  if (room.players.some((p) => !p.roleId)) return null;
  const alive = room.players.filter((p) => p.alive);
  if (!alive.length) return null;
  const sides = new Set(alive.map((p) => factionOf(p.roleId)));
  if (sides.size === 2 && sides.has('cult') && sides.has('killer')) {
    return { sides: ['cult', 'killer', 'draw'], reason: 'Only the Cult and the Serial Killer are left. Neither side can win, so the Host decides.' };
  }
  return null;
}
export function applyWinChecks(room) {
  if (room.pending?.length) return; // a Hunter's shot (or other prompt) resolves first; resolvePending re-checks
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

// ---------- balance ----------
// Every role gets a strength score in the style of Ultimate Werewolf: Town roles help Town (+), Mafia and
// solo threats hurt Town (−). A setup that adds up to about 0 gives both sides a fair game.
// A role can override its score with `power`.
const TOWN_ACTION = { protect: 4, guard: 3, jail: 5, block: 3, blockVisitors: 3, kill: 4, track: 4, watch: 4, autopsy: 2, alert: 3 };
const TOWN_CHECK = { alignment: 7, role: 8, parity: 5, inverted: 2, random: 0, naive: -1, paranoid: -1, fake: 0 };
const MAFIA_EXTRA = { block: -2, jail: -2, frame: -2, clean: -1, convert: -4, kill: -2, protect: -1, guard: -1, watch: -1, track: -1, alert: -1, blockVisitors: -1 };
export function rolePower(roleId) {
  const r = ROLE_BY_ID[roleId];
  if (!r) return 0;
  if (typeof r.power === 'number') return r.power;
  const t = r.action?.type; const side = factionOf(r.id);
  if (side === 'town') {
    let p = t === 'investigate' ? TOWN_CHECK[r.action.check] ?? 5 : TOWN_ACTION[t] ?? (r.showMafia ? 7 : r.meeting === 'mason' ? 2 : (r.day || r.onDeath || r.onCondemn) ? 2 : 1);
    if (r.appearsAs === 'mafia') p -= 1;
    if (r.nightImmune) p += 1;
    return p;
  }
  if (side === 'mafia') {
    let p = r.alignment === 'mafia' && !r.meeting && t !== 'kill' ? -5 : -6;
    if (r.appearsAs === 'innocent') p -= 2;
    if (t === 'investigate') p += r.action.check === 'role' ? -2 : r.action.check === 'parity' ? -1 : 0;
    else if (t && t !== 'kill') p += MAFIA_EXTRA[t] ?? 0;
    else if (t === 'kill' && !r.meeting) p -= 2;
    if (r.nightImmune) p -= 1;
    p -= ((r.weight || 1) - 1) * 3;
    return p;
  }
  // third party
  if (t === 'kill') return r.nightImmune || r.appearsAs === 'innocent' ? -8 : -7;
  if (r.meeting === 'cult') return t === 'convert' ? -8 : -3;
  if (r.winsWith === 'mafia') return -3;
  if (r.winsWith === 'town-loss') return -2;
  if (t === 'protect' || t === 'guard') return 1;
  if (t === 'investigate') return -2;
  if (r.sideWin) return -1;
  return 0;
}

// { score, verdict: 'even' | 'town' | 'mafia', strength: 'even' | 'slight' | 'strong', text }
export function balanceOf(roleIds) {
  const score = roleIds.reduce((t, id) => t + rolePower(id), 0);
  const a = Math.abs(score);
  const strength = a <= 3 ? 'even' : a <= 8 ? 'slight' : 'strong';
  const verdict = strength === 'even' ? 'even' : score > 0 ? 'town' : 'mafia';
  const side = verdict === 'town' ? 'Town' : 'the Mafia';
  const text = strength === 'even' ? 'Even: both sides have a fair chance.'
    : strength === 'slight' ? `Leans toward ${side}.` : `Strongly favors ${side}.`;
  return { score, verdict, strength, text };
}

// Swap roles one at a time, keeping the player count, until the setup is about even. Prefers small changes:
// it only swaps in common roles, and only touches Villagers, plain Mafia and the role it just added.
const SWAP_IN = ['villager', 'mafia', 'doctor', 'cop', 'godfather', 'vigilante', 'bodyguard', 'tracker', 'jester', 'hooker', 'framer'];
export function rebalance(roleIds) {
  let roles = [...roleIds];
  const score = (rs) => Math.abs(balanceOf(rs).score);
  const fine = (rs) => {
    const m = rs.filter((id) => factionOf(id) === 'mafia').length;
    return m >= 1 && m <= Math.max(1, Math.floor(rs.length / 3)) && !setupWarnings(rs, rs.length).some((w) => w.level === 'error');
  };
  for (let step = 0; step < 16 && score(roles) > 2; step++) {
    let best = null;
    for (let i = 0; i < roles.length; i++) {
      for (const x of SWAP_IN) {
        if (x === roles[i]) continue;
        if (!['villager', 'mafia'].includes(x) && roles.includes(x)) continue; // one of each special role
        const next = roles.slice(); next[i] = x;
        if (!fine(next)) continue;
        // Prefer replacing filler (Villagers, plain Mafia) over a role the host picked on purpose.
        const cost = score(next) + (['villager', 'mafia'].includes(roles[i]) ? 0 : 0.5);
        if (!best || cost < best.cost) best = { cost, next };
      }
    }
    if (!best || score(best.next) >= score(roles)) break;
    roles = best.next;
  }
  return roles;
}
