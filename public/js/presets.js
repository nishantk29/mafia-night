export { MAFIA_PRESETS as PRESET_LIST, mafiaPresetById } from './preset-mixes.js';
import { INVESTIGATOR_ID, INVESTIGATOR_NAME } from './roles.js';
// Setup presets (written with the merged role ids, night version 10): plain role lists applied with the existing setConfig roles action. Pure data, no DOM.
export const PRESETS = [
  { id: 'classic7', name: 'Classic 7', note: '2 Mafia, Doctor, Detective, 3 Villagers',
    roles: ['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager'] },
  { id: 'chaos10', name: 'Chaos 10', note: `Godfather, ${INVESTIGATOR_NAME}, Vigilante, Jester and a Serial Killer`,
    roles: ['mafia', 'godfather', 'doctor', INVESTIGATOR_ID, 'vigilante', 'jester', 'killer', 'villager', 'villager', 'villager'] },
];
export const presetById = (id) => PRESETS.find((p) => p.id === id);
