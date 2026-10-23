// Simple mode: four roles (Mafia, Doctor, Cop, Villager), suggested counts and a playing-card key. Pure, no DOM.
// Simple role names map onto the existing role ids, so the engine and room code are unchanged.
export const SIMPLE_ROLES = [
  { id: 'mafia', name: 'Mafia' },
  { id: 'doctor', name: 'Doctor' },
  { id: 'cop', name: 'Cop' },
  { id: 'villager', name: 'Villager' },
];
export const SIMPLE_IDS = SIMPLE_ROLES.map((r) => r.id);
export const isSimpleSet = (roleIds) => roleIds.every((id) => SIMPLE_IDS.includes(id));

export const SIMPLE_KEY = 'mafia.setupMode';

// Suggested counts for n players: 1 Mafia per ~4 players, 1 Doctor, 1 Cop, the rest Villagers.
export function simpleCounts(n) {
  const players = Math.max(0, Math.floor(n) || 0);
  const mafia = Math.max(1, Math.round(players / 4));
  const doctor = players >= 5 ? 1 : 0;
  const cop = players >= 5 ? 1 : 0;
  return { mafia, doctor, cop, villager: Math.max(0, players - mafia - doctor - cop) };
}

// Counts -> the flat role id list the room config uses.
export const simpleRoleIds = (counts) => SIMPLE_IDS.flatMap((id) => Array(Math.max(0, counts[id] || 0)).fill(id));

// Role id list -> counts (ignores anything outside the Simple set).
export function countsOf(roleIds) {
  const c = { mafia: 0, doctor: 0, cop: 0, villager: 0 };
  for (const id of roleIds) if (id in c) c[id]++;
  return c;
}

// Playing-card key, same idea as Black Aces: black Aces (and the black King) are Mafia,
// red King is the Doctor, red Queen is the Cop, number cards are Villagers.
// Each list is in the order cards are used; extra copies of a role spill into the next card.
export const SIMPLE_CARDS = {
  mafia: ['AS', 'AC', 'KS', 'KC', 'JS', 'JC'],
  doctor: ['KH', 'KD'],
  cop: ['QH', 'QD'],
  villager: ['2', '3', '4', '5', '6', '7', '8', '9', '10'].flatMap((r) => ['S', 'H', 'D', 'C'].map((s) => r + s)),
};

// What a role stands for, in words, for the host.
export const SIMPLE_CARD_TEXT = {
  mafia: 'Black Aces (Black King if there are 3)',
  doctor: 'Red King',
  cop: 'Red Queen',
  villager: 'Number cards, 2–10',
};

// Does this role set fit one 52-card deck? Returns { ok, over: [{id, have, max}] }.
export function deckFit(roleIds) {
  const c = countsOf(roleIds);
  const over = SIMPLE_IDS.filter((id) => c[id] > SIMPLE_CARDS[id].length).map((id) => ({ id, have: c[id], max: SIMPLE_CARDS[id].length }));
  return { ok: over.length === 0, over };
}

// Plain sentence for a set that can't fit, or '' when it fits.
export function deckFitText(roleIds) {
  const { ok, over } = deckFit(roleIds);
  if (ok) return '';
  const name = (id) => SIMPLE_ROLES.find((r) => r.id === id).name;
  return `One deck can’t hold this set: ${over.map((o) => `${o.have} ${name(o.id)} (most is ${o.max})`).join(', ')}. Lower the count or use phones.`;
}

// [{card, roleId}], one card per role slot, in the same shape as the engine's buildDeckMap.
export function simpleDeckMap(roleIds) {
  const used = { mafia: 0, doctor: 0, cop: 0, villager: 0 };
  return roleIds.map((roleId) => {
    const list = SIMPLE_CARDS[roleId];
    if (!list) throw new Error(`Not a Simple role: ${roleId}`);
    const card = list[used[roleId]++];
    if (!card) throw new Error('Too many of one role for a single deck');
    return { card, roleId };
  });
}

// Card key lines for the host: role name and the cards to pull, for the counts in play.
export function simpleCardKey(roleIds) {
  const map = simpleDeckMap(roleIds.filter((id) => SIMPLE_IDS.includes(id)));
  return SIMPLE_ROLES.map((r) => ({ id: r.id, name: r.name, cards: map.filter((m) => m.roleId === r.id).map((m) => m.card) }))
    .filter((r) => r.cards.length);
}

// Setup mode from the URL and storage. ?mode=simple | cards -> Simple (cards also turns the card option on);
// ?mode=complex -> Complex; otherwise the stored choice; otherwise Simple.
export function setupModeFrom(search = '', stored = null) {
  const q = new URLSearchParams(search).get('mode');
  if (q === 'cards') return { mode: 'simple', cards: true };
  if (q === 'simple') return { mode: 'simple', cards: false };
  if (q === 'complex') return { mode: 'complex', cards: false };
  return { mode: stored === 'complex' ? 'complex' : 'simple', cards: false };
}
