// Setup presets: plain role lists applied with the existing setConfig roles action. Pure data, no DOM.
export const PRESETS = [
  { id: 'classic7', name: 'Classic 7', note: '2 Mafia, Doctor, Cop, 3 Villagers',
    roles: ['mafia', 'mafia', 'doctor', 'cop', 'villager', 'villager', 'villager'] },
  { id: 'chaos10', name: 'Chaos 10', note: 'Godfather, Detective, Vigilante, Jester and a Serial Killer',
    roles: ['mafia', 'godfather', 'doctor', 'detective', 'vigilante', 'jester', 'killer', 'villager', 'villager', 'villager'] },
];
export const presetById = (id) => PRESETS.find((p) => p.id === id);
