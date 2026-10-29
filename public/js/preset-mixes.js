// The seven themed Mafia presets (proposals/3-role-selector README). Pure data + mix(n) -> role ids; no DOM.
export const mafiaCount = (n) => Math.max(1, Math.round(n / 4));
const fill = (head, n) => { const out = head.slice(0, n); while (out.length < n) out.push('villager'); return out; };
const mafiaTo = (lead, n) => { const m = mafiaCount(n); const out = lead.slice(0, Math.max(m, 1)); while (out.length < m) out.push('mafia'); return out; };

export const MAFIA_PRESETS = [
  { id: 'speakeasy', name: 'Speakeasy', vibe: 'The standard game. A good first night.', min: 5, max: 16, difficulty: 'Beginner', recommended: true,
    mix: (n) => fill([...mafiaTo([], n), 'doctor', 'detective', ...(n >= 9 ? ['jester'] : [])], n) },
  { id: 'last-orders', name: 'Last Orders', vibe: 'Short and simple. One save a night, no checks.', min: 5, max: 8, difficulty: 'Beginner',
    mix: (n) => fill([...mafiaTo([], n), 'doctor'], n) },
  { id: 'smoke-and-mirrors', name: 'Smoke and Mirrors', vibe: "The Detective can't trust every result.", min: 8, max: 14, difficulty: 'Classic',
    mix: (n) => fill([...mafiaTo(['godfather', ...(n >= 11 ? ['framer'] : [])], n), 'doctor', 'detective'], n) },
  { id: 'tommy-gun-night', name: 'Tommy Gun Night', vibe: 'Fast, loud, lots of night kills.', min: 9, max: 16, difficulty: 'Classic',
    mix: (n) => fill([...mafiaTo([], n), 'doctor', 'detective', 'vigilante', ...(n >= 11 ? ['killer'] : []), ...(n >= 12 ? ['jester'] : [])], n) },
  { id: 'family-business', name: 'The Family Business', vibe: 'A full crime family against two sworn Masons.', min: 10, max: 16, difficulty: 'Classic',
    mix: (n) => fill([...mafiaTo(['godfather', 'hooker', 'janitor'], n), 'doctor', 'detective', 'bodyguard', 'mason', 'mason'], n) },
  { id: 'hard-boiled', name: 'Hard Boiled', vibe: 'Every role has a twist. For groups who know the game.', min: 12, max: 20, difficulty: 'Veteran',
    mix: (n) => fill([...mafiaTo(['godfather', 'hooker', 'framer'], n), 'doctor', 'detective', 'tracker', 'lookout', 'veteran', 'jester', 'executioner'], n) },
  { id: 'blind-tiger', name: 'Blind Tiger', vibe: 'Speakeasy roles, but nobody sees the mix.', min: 9, max: 16, difficulty: 'Veteran', hiddenSetup: true,
    mix: (n) => fill([...mafiaTo([], n), 'doctor', 'detective', ...(n >= 9 ? ['jester'] : [])], n) },
];
export const mafiaPresetById = (id) => MAFIA_PRESETS.find((p) => p.id === id);
export const inRange = (p, n) => n >= p.min && n <= p.max;
// Out of range presets stay openable; this is the plain line the page shows.
export const misfitLine = (p, n) => (n < p.min ? `Needs ${p.min} or more players. You have ${n}.` : n > p.max ? `Made for up to ${p.max} players. You have ${n}.` : '');
