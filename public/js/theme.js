// Game themes. The rules and the role catalog are written once, in Mafia words; a theme renames the words
// on screen. It is applied to the rendered page's text (see app.js), so every screen, prompt and report
// follows it without each template knowing about themes.
export const THEMES = {
  city: { label: 'Mafia', sides: 'Mafia vs Town', note: 'The Mafia, the Town, the Cop and the Doctor.' },
  village: { label: 'Werewolf', sides: 'Werewolves vs Village', note: 'The Werewolves, the Village, the Seer and the Doctor.' },
};
export const themeOf = (v) => (THEMES[v?.config?.theme || v?.theme] ? (v.config?.theme || v.theme) : 'city');

// Longest phrases first: a regex alternation takes the first branch that matches at each position.
const WOLF = [
  ['Mafia Night', 'Mafia Night'], // the app's name stays
  ['Town Crier', 'Town Crier'],
  ['Mafia-aligned', 'Werewolf-aligned'],
  ['NOT Mafia', 'NOT a Werewolf'],
  ['like Mafia', 'like a Werewolf'],
  ['is Mafia', 'is a Werewolf'],
  ['Mafia members', 'Werewolves'],
  ['Mafia member', 'Werewolf'],
  ['Mafia team', 'Werewolf pack'],
  ['Mafia kill', 'Werewolf kill'],
  ['Mafia meeting', 'Werewolf meeting'],
  ['Mafia’s', 'Werewolves’'],
  ["Mafia's", "Werewolves'"],
  ['MAFIA', 'WEREWOLF'],
  ['Mafia', 'Werewolves'],
  ['mafia', 'werewolves'],
  ['Werewolf', 'Lone Wolf'], // the solo killer role, renamed so it can't be mistaken for the pack
  ['Godfather', 'Alpha Wolf'],
  ['Cops', 'Seers'],
  ['Cop', 'Seer'],
  ['Townsfolk', 'Villagers'],
  ['Town', 'Village'],
  ['town', 'village'],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(`(?<![\\w-])(?:${WOLF.map(([a]) => esc(a)).join('|')})(?![\\w-])`, 'g');
const MAP = new Map(WOLF);

// `names` are player names to leave alone (someone may really be called "Cop"). `asRole` is set when the
// text is a role's name on its own, where the plain Mafia role becomes one Werewolf rather than the pack.
export function themeText(text, theme, names = [], asRole = false) {
  if (theme !== 'village' || !text || !/[A-Za-z]/.test(text)) return text;
  if (asRole && text.trim() === 'Mafia') return text.replace('Mafia', 'Werewolf');
  if (asRole) names = []; // a role label is never a player's name, even if someone is called "Cop"
  const kept = [];
  let s = text;
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    if (n && s.includes(n)) s = s.split(n).join(`${kept.push(n) - 1}`);
  }
  s = s.replace(RE, (m) => MAP.get(m) ?? m);
  return kept.length ? s.replace(/(\d+)/g, (_, i) => kept[i]) : s;
}

// Elements whose whole text is a role name.
export const ROLE_NAME_SEL = '.rc, .role-name, .key-name, .rrow-role, .rcard-name, .seatrow-role, .tip-h > b';

export function themeDom(root, theme, names) {
  if (theme !== 'village' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('textarea, script, style, [data-raw]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const next = themeText(n.nodeValue, theme, names, !!n.parentElement?.closest(ROLE_NAME_SEL));
    if (next !== n.nodeValue) n.nodeValue = next;
  }
  for (const el of root.querySelectorAll('[aria-label], [placeholder], [data-why]')) {
    for (const k of ['aria-label', 'placeholder', 'data-why']) {
      const v = el.getAttribute(k); if (v) { const t = themeText(v, theme, names); if (t !== v) el.setAttribute(k, t); }
    }
  }
}
