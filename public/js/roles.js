// Curated role catalog. Descriptions are written for this app.
// Fields:
//   alignment  town | mafia | third
//   meeting    team that wakes together at night (mafia | mason | cult)
//   action     { type, order, prompt, targets (0-2), uses }  night action; the Host console drives off this
//   appearsAs  'mafia' | 'innocent'  what a Cop-style check shows
//   seesAs     role the player is told they are (they actually act as the real role)
//   onDeath / onCondemn  trigger the Host must resolve
//   day        reminder shown in the day panel (optional uses)
//   winsWith   'mafia' | 'survivor' | 'town-loss'   third-party win conditions
//   weight     how much this player counts toward the mafia majority

import { buildExtra } from './roles_extra.js';
import { buildExtra2 } from './roles_extra2.js';

// The optional exact-role check. The name lives here once (open question: Nishant may rename it).
export const INVESTIGATOR_ID = 'investigator';
export const INVESTIGATOR_NAME = 'Investigator';

const R = (id, name, emoji, alignment, blurb, o = {}) => ({
  id, name, emoji, alignment, blurb, weight: 1, meeting: null, action: null, ...o,
});
const A = (type, order, prompt, extra = {}) => ({ type, order, prompt, targets: 1, uses: Infinity, ...extra });

export const ROLES = [
  // ---------- TOWN ----------
  R('villager', 'Villager', '🧑‍🌾', 'town', 'No powers. Win by reading people and voting well.'),
  R('detective', 'Detective', '🕵️', 'town', 'Each night, check one player. You learn MAFIA or NOT MAFIA. The Godfather shows as NOT MAFIA.',
    { action: A('investigate', 60, 'Detective, wake up. Who do you check?', { check: 'alignment' }) }),
  R('insane_detective', 'Insane Detective', '🥴', 'town', 'You think you are a Detective, but your results are always backwards.',
    { seesAs: 'detective', action: A('investigate', 60, 'Detective, wake up. Who do you check?', { check: 'inverted' }) }),
  R('comparer', 'Comparer', '🧭', 'town', 'Each night, pick two players and learn whether they are on the same side.',
    { action: A('investigate', 62, `Comparer, wake up. Which two players?`, { check: 'parity', targets: 2 }) }),
  R(INVESTIGATOR_ID, INVESTIGATOR_NAME, '🔎', 'town', 'Each night, check one player and learn their exact role. A Godfather shows as a Villager.',
    { action: A('investigate', 61, `${INVESTIGATOR_NAME}, wake up. Who do you investigate?`, { check: 'role' }) }),
  R('tracker', 'Tracker', '👣', 'town', 'Each night, follow one player and learn who they visited.',
    { action: A('track', 63, 'Tracker, wake up. Who do you follow?') }),
  R('lookout', 'Lookout', '🔭', 'town', 'Each night, watch one player and learn who visited them.',
    { action: A('watch', 64, 'Lookout, wake up. Who do you watch?') }),
  R('coroner', 'Coroner', '⚰️', 'town', 'Each night, examine a dead player and learn their true role. A body the Janitor cleaned reads as cleaned, role unknown.',
    { action: A('autopsy', 58, 'Coroner, wake up. Which dead player do you examine?', { dead: true }) }),
  R('medium', 'Medium', '🔮', 'town', 'You can speak with the dead. The Host relays your questions.',
    { day: 'Medium may ask the dead a yes/no question.' }),
  R('doctor', 'Doctor', '🩺', 'town', 'Each night, protect one player from a night kill.',
    { action: A('protect', 20, 'Doctor, wake up. Who do you protect?') }),
  R('bodyguard', 'Bodyguard', '🛡️', 'town', 'Guard one player. If they are attacked, you take the hit instead, unless a Doctor is also protecting them: then you both live.',
    { action: A('guard', 21, 'Bodyguard, wake up. Who do you guard?') }),
  R('veteran', 'Veteran', '🎖️', 'town', 'Three times per game, go on alert. Anyone who visits you that night dies.',
    { action: A('alert', 22, 'Veteran, wake up. Going on alert tonight?', { targets: 0, uses: 3 }) }),
  R('vigilante', 'Vigilante', '🔫', 'town', 'Once per game, shoot a player at night. Be sure.',
    { action: A('kill', 53, 'Vigilante, wake up. Do you shoot anyone?', { uses: 1, source: 'vigilante' }) }),
  R('hunter', 'Hunter', '🏹', 'town', 'When you die, you take one player down with you.',
    { onDeath: 'Hunter has fallen. Who do they shoot?' }),
  R('bomb', 'Bomb', '💣', 'town', 'If the Mafia kill you at night, whoever attacked you dies too.',
    { retaliate: true }),
  R('jailer', 'Jailer', '⛓️', 'town', 'Each night, lock a player up. They cannot act and cannot be killed.',
    { action: A('jail', 10, 'Jailer, wake up. Who do you jail?') }),
  R('security_guard', 'Security Guard', '💂', 'town', 'Each night, guard a door. Everyone who visits that player is blocked.',
    { action: A('blockVisitors', 14, 'Security Guard, wake up. Whose door do you guard?') }),
  R('drunk', 'Drunk', '🍺', 'town', 'Each night, distract a player so they cannot act.',
    { action: A('block', 11, 'Drunk, wake up. Who do you distract?') }),
  R('mason', 'Mason', '🤝', 'town', 'You know the other Masons are on your side. Confirmed town.',
    { meeting: 'mason', night1: 'Masons, open your eyes and meet each other.' }),
  R('merlin', 'Merlin', '🧙', 'town', 'You start knowing who the Mafia are. Guide the town, but do not get caught.',
    { night1: 'Merlin, open your eyes. Show them the Mafia.', showMafia: true }),
  R('president', 'President', '🎩', 'town', 'Your identity is revealed to the town. Stay alive.',
    { night1: 'Announce the President to the town.', revealToTown: true }),
  R('puppy', 'Puppy', '🐶', 'town', 'Everyone knows you are the Puppy. You are definitely not Mafia.',
    { night1: 'Announce the Puppy to everyone.', revealToTown: true }),
  R('grandma', 'Grandma', '👵', 'town', 'You cannot be killed at night. Only a vote can take you out.',
    { nightImmune: true }),
  R('virgin', 'Virgin', '👼', 'town', 'If the town condemns you, everyone is safe from kills the next night.',
    { onCondemn: 'Virgin was condemned: nobody can be killed tonight.', shield: true }),
  R('governor', 'Governor', '🏛️', 'town', 'Once per game, overturn the vote and choose who is condemned instead.',
    { day: 'Governor may overturn the vote (once).', dayUses: 1 }),
  R('queen', 'Queen', '👸', 'town', 'Before the vote closes, you may change one player\'s vote.',
    { day: 'Queen may change one vote each day.' }),
  R('representative', 'Representative', '🗳️', 'town', 'Your vote counts twice.',
    { day: 'Representative\'s vote counts as 2.' }),
  R('defense_attorney', 'Defense Attorney', '⚖️', 'town', 'Once per game, defend a player so they cannot be condemned that day.',
    { day: 'Defense Attorney may defend a player (once).', dayUses: 1 }),
  R('prosecutor', 'Prosecutor', '📜', 'town', 'Once per game, force the vote onto a player of your choice.',
    { day: 'Prosecutor may prosecute a player (once).', dayUses: 1 }),
  R('hangman', 'Hangman', '🪢', 'town', 'Once per game, spare a condemned player at the last second.',
    { day: 'Hangman may spare the condemned (once).', dayUses: 1 }),
  R('surveyor', 'Surveyor', '🗺️', 'town', 'Once per game, learn which roles are still alive.',
    { day: 'Surveyor may ask which roles are alive (once).', dayUses: 1 }),
  R('miller', 'Miller', '🥛', 'town', 'You are a regular villager who looks like Mafia to investigators.',
    { appearsAs: 'mafia', seesAs: 'villager' }),

  // ---------- MAFIA ----------
  R('mafia', 'Mafia', '🕴️', 'mafia', 'Choose a victim each night with your team. Blend in by day.',
    { meeting: 'mafia', action: A('kill', 50, 'Mafia, who do you kill?', { source: 'mafia', group: 'mafia' }) }),
  R('godfather', 'Godfather', '🤵', 'mafia', 'Mafia leader. A side check shows you as NOT MAFIA, and an exact-role check shows you as a Villager.',
    { meeting: 'mafia', appearsAs: 'innocent', action: A('kill', 50, 'Mafia, who do you kill?', { source: 'mafia', group: 'mafia' }) }),
  R('don', 'Don', '👑', 'mafia', 'Mafia boss. You count double toward the Mafia\'s majority.',
    { meeting: 'mafia', weight: 2, action: A('kill', 50, 'Mafia, who do you kill?', { source: 'mafia', group: 'mafia' }) }),
  R('hooker', 'Hooker', '💋', 'mafia', 'Each night, distract a player so they cannot act. You still join the Mafia meeting.',
    { meeting: 'mafia', action: A('block', 12, 'Hooker, wake up. Who do you distract?'), kills: 'mafia' }),
  R('bouncer', 'Bouncer', '🚪', 'mafia', 'Each night, guard a door. Everyone visiting that player is blocked.',
    { meeting: 'mafia', action: A('blockVisitors', 13, 'Bouncer, wake up. Whose door do you guard?'), kills: 'mafia' }),
  R('framer', 'Framer', '🖼️', 'mafia', 'Each night, frame a player so they look like Mafia to investigators.',
    { meeting: 'mafia', action: A('frame', 40, 'Framer, wake up. Who do you frame?'), kills: 'mafia' }),
  R('janitor', 'Janitor', '🧹', 'mafia', 'Once per game, clean up the Mafia\'s victim so their role stays hidden, even from the Coroner.',
    { meeting: 'mafia', action: A('clean', 50.5, 'Janitor, wake up. Do you clean up the Mafia\'s victim tonight?', { uses: 1, targets: 0 }), kills: 'mafia' }),
  R('wannabe', 'Wannabe', '🥸', 'mafia', 'Each night you "investigate", but the results are made up.',
    { meeting: 'mafia', action: A('investigate', 59, 'Wannabe, wake up. Who do you "check"?', { check: 'fake' }), kills: 'mafia' }),
  R('yakuza', 'Yakuza', '🐉', 'mafia', 'Once per game, convert a non-Mafia player into Mafia.',
    { meeting: 'mafia', action: A('convert', 32, 'Yakuza, wake up. Who do you convert?', { uses: 1, to: 'mafia' }), kills: 'mafia' }),
  R('mad_bomber', 'Mad Bomber', '🧨', 'mafia', 'Once per day, blow up yourself and another player.',
    { meeting: 'mafia', day: 'Mad Bomber may explode with another player (once).', dayUses: 1, kills: 'mafia' }),
  R('poacher', 'Poacher', '🪤', 'mafia', 'If you are condemned, take another player with you.',
    { meeting: 'mafia', onCondemn: 'Poacher was condemned. Who do they take down?', kills: 'mafia' }),
  R('assassin', 'Assassin', '🗡️', 'mafia', 'A lone killer on the Mafia team. You act alone, not with the meeting.',
    { action: A('kill', 51, 'Assassin, wake up. Who do you kill?', { source: 'assassin' }) }),
  R('slowpoke', 'Slowpoke', '🐌', 'mafia', 'Mafia member who does not attend the night meeting.',
    {}),

  // ---------- THIRD PARTY ----------
  R('jester', 'Jester', '🃏', 'third', 'You win if the town condemns you. Be suspicious, but not too suspicious.',
    { sideWin: 'condemned' }),
  R('executioner', 'Executioner', '🪓', 'third', 'You have a target. Get the town to condemn them and you win. If they die any other way, you become a Jester and win by being condemned. You learn it at night.',
    { sideWin: 'target', night1: 'Secretly tell the Executioner their target.', needsTarget: true }),
  R('survivor', 'Survivor', '🏕️', 'third', 'You win if you are alive when the game ends. Side with whoever keeps you safe.',
    { winsWith: 'survivor' }),
  R('opportunist', 'Opportunist', '🦊', 'third', 'You win if you are alive when the town loses.',
    { winsWith: 'town-loss' }),
  R('traitor', 'Traitor', '🐍', 'third', 'You look like town but win with the Mafia.',
    { winsWith: 'mafia', seesAs: 'villager' }),
  R('killer', 'Serial Killer', '🔪', 'third', 'A party of one. Kill every night and outlive everyone.',
    { faction: 'killer', action: A('kill', 52, 'Serial Killer, wake up. Who do you kill?', { source: 'killer' }) }),
  R('cult', 'Cult Leader', '🕯️', 'third', 'Recruit one player each night. The cult wins when everyone alive is a member.',
    { faction: 'cult', meeting: 'cult', action: A('convert', 31, 'Cult, wake up. Who do you recruit?', { to: 'cult', group: 'cult' }) }),
  R('amnesiac', 'Amnesiac', '🌀', 'third', 'Once per game, become a dead player\'s role and take up their cause.',
    { action: A('copyRole', 33, 'Amnesiac, wake up. Which dead player do you become?', { uses: 1, dead: true }) }),
];

ROLES.push(...buildExtra(R, A));
ROLES.push(...buildExtra2(R, A));

// ---------- legacy roles (pinned rooms only) ----------
// Before night version 10 the Cop checked a side and the Detective checked an exact role. Rooms already in a game keep
// those roles and names, so the old definitions stay in the lookup, hidden from every picker (`legacy: true`).
// The old exact-role Detective moved to the id `detective_v1` (the id `detective` now means the merged role).
export const LEGACY_ROLES = [
  R('cop', 'Cop', '👮', 'town', 'Each night, check one player. You learn whether they look like Mafia.',
    { action: A('investigate', 60, 'Cop, wake up. Who do you check?', { check: 'alignment' }) }),
  R('detective_v1', 'Detective', '🕵️', 'town', 'Each night, check one player and learn their exact role. A Godfather shows as a Villager.',
    { action: A('investigate', 61, 'Detective, wake up. Who do you investigate?', { check: 'role' }) }),
  R('insane_cop', 'Insane Cop', '🥴', 'town', 'You think you are a Cop, but your results are always backwards.',
    { seesAs: 'cop', action: A('investigate', 60, 'Cop, wake up. Who do you check?', { check: 'inverted' }) }),
  R('parity_cop', 'Parity Cop', '🧭', 'town', 'Each night, pick two players and learn whether they are on the same side.',
    { action: A('investigate', 62, 'Parity Cop, wake up. Which two players?', { check: 'parity', targets: 2 }) }),
  R('confused_cop', 'Confused Cop', '😵', 'town', 'Each night you check one player, but every check is a coin flip: heads gives the TRUE result, tails gives the OPPOSITE. Needs a regular Cop in the game.',
    { requiresPartner: 'cop', action: A('investigate', 60.5, 'Confused Cop, open your eyes. Who do you check?', { check: 'random' }) }),
  R('naive_cop', 'Naive Cop', '🐑', 'town', 'You think you are a Cop, but everyone always looks innocent to you.',
    { seesAs: 'cop', action: A('investigate', 60, 'Cop, wake up. Who do you check?', { check: 'naive' }) }),
  R('paranoid_cop', 'Paranoid Cop', '😰', 'town', 'You think you are a Cop, but everyone always looks guilty to you.',
    { seesAs: 'cop', action: A('investigate', 60, 'Cop, wake up. Who do you check?', { check: 'paranoid' }) }),
  R('dirty_cop', 'Dirty Cop', '🚔', 'town', 'You check one player each night, but investigators think you are Mafia.',
    { appearsAs: 'mafia', action: A('investigate', 60, 'Dirty Cop, wake up. Who do you check?', { check: 'alignment' }) }),
].map((r) => ({ ...r, legacy: true }));

// Old ids -> merged ids, for setups saved before the merge (presets, ?roles= links, a lobby upgraded to version 10).
// One simultaneous pass, never chained: the old `detective` becomes the Investigator while the old `cop` becomes `detective`.
export const OLD_TO_MERGED = {
  cop: 'detective', detective: INVESTIGATOR_ID, insane_cop: 'insane_detective', parity_cop: 'comparer',
  confused_cop: 'confused_detective', naive_cop: 'naive_detective', paranoid_cop: 'paranoid_detective', dirty_cop: 'dirty_detective',
};
export const mergedRoleId = (id) => (typeof id === 'string' && Object.hasOwn(OLD_TO_MERGED, id) ? OLD_TO_MERGED[id] : id);
// Merged ids -> the role a pinned (version 9 or older) room uses for it.
export const MERGED_TO_LEGACY = Object.fromEntries(Object.entries(OLD_TO_MERGED).map(([o, n]) => [n, o === 'detective' ? 'detective_v1' : o]));
export const legacyRoleId = (id) => (typeof id === 'string' && Object.hasOwn(MERGED_TO_LEGACY, id) ? MERGED_TO_LEGACY[id] : id);
// Stored ids in a pinned room: the old exact-role Detective (`detective`) is `detective_v1` from here on. Idempotent.
export const pinStoredId = (id) => (id === 'detective' ? 'detective_v1' : id);
// Ids stored in a pinned room -> merged ids (used once, when that room's setup moves to version 10: a restart or a lobby upgrade).
export const storedToMerged = (id) => (id === 'detective_v1' ? INVESTIGATOR_ID : mergedRoleId(id));
export const SETUP_LINK_VERSION = 10; // `v=10` on a ?roles= link means its ids are already merged ids
export const MERGE_NIGHT_VERSION = 10; // rooms at this version or later use the merged roles

// Retired ids that were exact twins of another role. Old setups, saved rooms and links still load.
export const ROLE_ALIASES = { civilian: 'villager' };
export const resolveRoleId = (id) => (typeof id === 'string' && Object.hasOwn(ROLE_ALIASES, id) ? ROLE_ALIASES[id] : id);

// Near-duplicates share one picker entry. Every variant stays its own role (id, mechanics, night order, cues);
// `group` is the shared key and `variant` an optional label for the picker.
export const ROLE_GROUPS = [
  { id: 'grandma', name: 'Grandma', ids: ['grandma', 'granny'], labels: { granny: 'Grandma, shoots visitors' } },
  { id: 'bodyguard', name: 'Bodyguard', ids: ['bodyguard', 'muscle', 'mercenary'] },
  { id: 'security_guard', name: 'Security Guard', ids: ['security_guard', 'bouncer', 'doorman', 'smuggler'] },
  { id: 'jailer', name: 'Jailer', ids: ['jailer', 'kidnapper'] },
  { id: 'drunk', name: 'Drunk', ids: ['drunk', 'hooker', 'collaborator'] },
  { id: 'veteran', name: 'Veteran', ids: ['veteran', 'sentinel', 'prepper'] },
  { id: 'comparer', name: 'Comparer', ids: ['comparer', 'bookkeeper', 'oracle'] },
  { id: 'tracker', name: 'Tracker', ids: ['tracker', 'shadow'] },
  { id: 'lookout', name: 'Lookout', ids: ['lookout', 'spy'] },
  { id: 'hangman', name: 'Hangman', ids: ['hangman', 'defense_attorney', 'mob_lawyer'] },
  { id: 'jester', name: 'Jester', ids: ['jester', 'patsy', 'poltergeist', 'zealot'] },
  { id: 'executioner', name: 'Executioner', ids: ['executioner', 'rival', 'stalker', 'vendetta'] },
  { id: 'survivor', name: 'Survivor', ids: ['survivor', 'hermit', 'opportunist', 'profiteer', 'vulture'] },
  // Not exact twins (Traitor believes they are a Villager; Whisperer is Mafia, Telepath is Town): grouped, not merged.
  { id: 'traitor', name: 'Traitor', ids: ['traitor', 'fifth_columnist'] },
  { id: 'telepath', name: 'Telepath', ids: ['telepath', 'whisperer'] },
];
export const GROUP_BY_ID = Object.fromEntries(ROLE_GROUPS.map((g) => [g.id, g]));
for (const g of ROLE_GROUPS) for (const id of g.ids) {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`role group ${g.id}: unknown role ${id}`);
  r.group = g.id;
  if (g.labels?.[id]) r.variant = g.labels[id];
}

export const ROLE_BY_ID = Object.fromEntries([...ROLES, ...LEGACY_ROLES].map((r) => [r.id, r]));
// Alias ids resolve to the canonical role in every lookup (non-enumerable, so role lists stay clean).
for (const [old, id] of Object.entries(ROLE_ALIASES)) Object.defineProperty(ROLE_BY_ID, old, { value: ROLE_BY_ID[id], enumerable: false });
export const roleOf = (id) => ROLE_BY_ID[resolveRoleId(id)];

// Picker entries: one per ungrouped role, one per group (at the position of its first variant).
export function pickerEntries(list = ROLES) {
  const out = []; const seen = new Set();
  for (const r of list) {
    if (!r.group) { out.push({ role: r }); continue; }
    if (seen.has(r.group)) continue;
    seen.add(r.group);
    out.push({ group: GROUP_BY_ID[r.group], variants: list.filter((x) => x.group === r.group) });
  }
  return out;
}

// "Also: Hooker, Collaborator": the other roles inside a group entry, by name (no "variant" counts).
// Only the roles the current filter shows, so the line always matches what opens.
export function groupAlsoText(e) {
  const head = e.variants.find((v) => (v.variant || v.name) === e.group.name);
  const others = e.variants.filter((v) => v !== head).map((v) => v.name);
  return head ? `Also: ${others.join(', ')}` : others.join(', ');
}

// ---------- custom roles (created in the host UI, stored with the room) ----------
export const ACTION_TYPES = ['kill', 'protect', 'guard', 'alert', 'jail', 'block', 'blockVisitors', 'frame', 'clean',
  'convert', 'copyRole', 'investigate', 'track', 'watch', 'autopsy'];
const DEFAULT_ORDER = { jail: 10, block: 11, blockVisitors: 14, protect: 20, guard: 21, alert: 22, convert: 32, frame: 40,
  clean: 50.5, kill: 53, investigate: 60, track: 63, watch: 64, autopsy: 58, copyRole: 33 };
const txt = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);

// Returns a safe role object, or null. Never trusts shape from the wire.
export function sanitizeRole(x) {
  if (!x || typeof x !== 'object') return null;
  const id = /^c_[a-z0-9]{4,12}$/.test(x.id) ? x.id : null;
  const name = txt(x.name, 24);
  if (!id || !name) return null;
  const alignment = ['town', 'mafia', 'third'].includes(x.alignment) ? x.alignment : 'town';
  const role = { id, name, emoji: txt(x.emoji, 4) || '❔', alignment, blurb: txt(x.blurb, 200), weight: 1, meeting: null, action: null, custom: true };
  const w = Number(x.weight); if (w >= 1 && w <= 3) role.weight = Math.floor(w);
  if (x.meeting === 'mafia' && alignment === 'mafia') role.meeting = 'mafia';
  if (x.appearsAs === 'mafia' || x.appearsAs === 'innocent') role.appearsAs = x.appearsAs;
  if (typeof x.seesAs === 'string' && ROLE_BY_ID[x.seesAs] && !ROLE_BY_ID[x.seesAs].custom) role.seesAs = ROLE_BY_ID[x.seesAs].id;
  if (x.nightImmune) role.nightImmune = true;
  if (x.retaliate) role.retaliate = true;
  if (x.onDeath) role.onDeath = txt(x.onDeath, 120);
  if (x.onCondemn) role.onCondemn = txt(x.onCondemn, 120);
  if (x.day) { role.day = txt(x.day, 120); const u = Number(x.dayUses); if (u >= 1 && u <= 9) role.dayUses = Math.floor(u); }
  if (x.night1) role.night1 = txt(x.night1, 120);
  if (alignment === 'third' && x.sideWin === 'condemned') role.sideWin = 'condemned';
  if (['survivor', 'town-loss', 'mafia'].includes(x.winsWith) && alignment === 'third') role.winsWith = x.winsWith;
  const a = x.action;
  if (a && ACTION_TYPES.includes(a.type)) {
    const targets = a.type === 'alert' || a.type === 'clean' ? 0 : a.type === 'investigate' && a.check === 'parity' ? 2 : 1;
    const u = Number(a.uses);
    role.action = {
      type: a.type, order: DEFAULT_ORDER[a.type], targets, uses: u >= 1 && u <= 9 ? Math.floor(u) : Infinity,
      prompt: txt(a.prompt, 120) || `${name}, wake up.`,
    };
    if (a.type === 'investigate') role.action.check = ['alignment', 'role', 'inverted', 'parity', 'fake'].includes(a.check) ? a.check : 'alignment';
    if (a.type === 'convert') role.action.to = 'mafia';
    if (a.type === 'autopsy' || a.type === 'copyRole') role.action.dead = true;
    if (a.type === 'kill') role.action.source = 'custom';
    // A disguised role is woken by the name it thinks it has: the prompt is read aloud.
    if (role.seesAs) { const shown = ROLE_BY_ID[role.seesAs]; role.action.prompt = shown.action?.prompt || `${shown.name}, wake up.`; }
  }
  return role;
}

// Add custom roles to the lookup. Never overrides built-ins. Safe to call repeatedly.
export function registerRoles(list) {
  for (const raw of list || []) {
    const r = sanitizeRole(raw);
    if (r && (!ROLE_BY_ID[r.id] || ROLE_BY_ID[r.id].custom)) ROLE_BY_ID[r.id] = r;
  }
}

// Which team a role plays for (faction used for win checks)
export function factionOf(roleId) {
  const r = ROLE_BY_ID[roleId];
  if (!r) return 'town';
  if (r.faction) return r.faction;
  return r.alignment;
}

// What a player may be told the setup is: each disguised role is listed as the role it believes it is.
// `unreliable` holds the believed ids that merged in at least one look-alike. Never exposes the real variant ids.
export const believedId = (id) => (id === 'confused_cop' ? 'cop' : id === 'confused_detective' ? 'detective' : ROLE_BY_ID[id]?.seesAs || id);
export function believedSetup(roleIds) {
  const ids = roleIds.map(believedId);
  const unreliable = [...new Set(roleIds.filter((id, i) => ids[i] !== id).map(believedId))];
  return { ids, unreliable };
}
