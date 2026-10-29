// "Your own playing cards": the fixed card key Nishant chose. Pure data; the setup needs the printable deck when a role has no card left.
export const CORE_KEY = {
  mafia: ['A♠', 'A♣', 'K♠', 'K♣', 'J♠', 'J♣'],
  doctor: ['K♥', 'K♦'],
  detective: ['Q♥', 'Q♦'],
  villager: ['2', '3', '4', '5', '6', '7', '8', '9', '10'].flatMap((v) => ['♠', '♣', '♥', '♦'].map((s) => v + s)),
};
export const EXTRA_KEY = { hooker: ['Q♠'], godfather: ['Q♣'], jester: ['J♥'], killer: ['J♦'], bodyguard: ['A♥'], vigilante: ['A♦'] };
export const KEY = { ...CORE_KEY, ...EXTRA_KEY };

// roleIds -> { ok, cards: [{role, card}], missing: [roleId...] }. Never throws; missing roles mean "This setup needs the printable deck".
export function ownDeckFor(roleIds) {
  const used = {}; const cards = []; const missing = [];
  for (const r of roleIds) {
    const pool = KEY[r] || []; const i = used[r] || 0;
    if (i < pool.length) { cards.push({ role: r, card: pool[i] }); used[r] = i + 1; } else missing.push(r);
  }
  return { ok: missing.length === 0, cards, missing: [...new Set(missing)] };
}
export const NEEDS_PRINTABLE = 'This setup needs the printable deck';
