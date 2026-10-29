// Setup carousel logic: step state, saved presets, which step is valid and why not. Pure data, no DOM.
// Storage is passed in ({ get, set }) so tests can use a Map.
import { SETUP_STORE_KEY, SAVED_PRESETS_KEY, ADVANCED_STORE_KEY, ADVANCED_DEFAULTS, DEFAULT_PRESET_ID, DEFAULT_OFFLINE_DEAL, MAX_SAVED_PRESETS } from './config-defaults.js';
import { MAFIA_PRESETS, mafiaPresetById, inRange } from './preset-mixes.js';
import { setupWarnings } from './engine.js';
import { ownDeckFor, NEEDS_PRINTABLE } from './deck-key.js';

export const STEPS = {
  host: [['players', 'Players'], ['preset', 'Preset'], ['seating', 'Seating'], ['deal', 'Deal']],
  local: [['players', 'Players'], ['preset', 'Roles'], ['cards', 'Cards']],
};
export const stepsOf = (local) => (local ? STEPS.local : STEPS.host);

const read = (storage, key, fallback) => { try { const v = JSON.parse(storage.get(key) || 'null'); return v ?? fallback; } catch { return fallback; } };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---- step state, one entry per room (or LOCAL) inside mafia.setup.v1 ----
export const defaultSetup = () => ({ step: 0, presetId: DEFAULT_PRESET_ID, source: 'preset', savedId: null, seating: null, deal: DEFAULT_OFFLINE_DEAL });
export function loadSetup(storage, roomKey, local = false) {
  const all = read(storage, SETUP_STORE_KEY, {});
  const st = { ...defaultSetup(), ...(all[roomKey] || {}) };
  if (!['preset', 'custom', 'saved'].includes(st.source)) st.source = 'preset';
  if (!mafiaPresetById(st.presetId)) st.presetId = DEFAULT_PRESET_ID;
  st.step = Math.max(0, Math.min(stepsOf(local).length - 1, Number(st.step) || 0));
  return st;
}
export function saveSetup(storage, roomKey, st) {
  const all = read(storage, SETUP_STORE_KEY, {});
  const keys = Object.keys(all);
  if (keys.length > 20 && !(roomKey in all)) delete all[keys[0]]; // old rooms fall off
  all[roomKey] = { step: st.step, presetId: st.presetId, source: st.source, savedId: st.savedId, seating: st.seating, deal: st.deal };
  storage.set(SETUP_STORE_KEY, JSON.stringify(all));
}

// ---- Advanced: saved on the phone, then sent to each room ----
export const loadAdvanced = (storage) => ({ ...ADVANCED_DEFAULTS, ...read(storage, ADVANCED_STORE_KEY, {}) });
export const saveAdvanced = (storage, adv) => storage.set(ADVANCED_STORE_KEY, JSON.stringify({ ...ADVANCED_DEFAULTS, ...adv }));

// ---- saved presets (this phone only) ----
export const loadSaved = (storage) => { const l = read(storage, SAVED_PRESETS_KEY, []); return Array.isArray(l) ? l.filter((p) => p && p.id && Array.isArray(p.roles)) : []; };
export const writeSaved = (storage, list) => storage.set(SAVED_PRESETS_KEY, JSON.stringify(list.slice(0, MAX_SAVED_PRESETS)));
export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 28);
export function addSaved(list, name, roles, advanced) {
  const id = `s_${Math.random().toString(36).slice(2, 8)}${list.length}`;
  return { list: [{ id, name: cleanName(name) || 'My setup', roles: [...roles], advanced: { ...ADVANCED_DEFAULTS, ...advanced } }, ...list].slice(0, MAX_SAVED_PRESETS), id };
}
export const renameSaved = (list, id, name) => list.map((p) => (p.id === id && cleanName(name) ? { ...p, name: cleanName(name) } : p));
export const deleteSaved = (list, id) => list.filter((p) => p.id !== id);

// A saved preset looks like a built-in one: { id, name, vibe, min, max, difficulty, mix(n) }. It fits one player count: its own.
export const savedAsPreset = (p) => ({ id: p.id, name: p.name, vibe: 'Your own setup.', min: p.roles.length, max: p.roles.length, difficulty: 'Saved', saved: true, hiddenSetup: !!p.advanced?.hiddenSetup, advanced: p.advanced, mix: () => [...p.roles] });
export const presetOf = (st, saved) => (st.source === 'saved' && saved.find((p) => p.id === st.savedId) ? savedAsPreset(saved.find((p) => p.id === st.savedId)) : mafiaPresetById(st.presetId) || mafiaPresetById(DEFAULT_PRESET_ID));

// Roles the preset wants for n players, or null when the host has customised them (or there are too few players to deal).
export function desiredRoles(st, saved, n, min) {
  if (st.source === 'custom' || n < min) return null;
  return presetOf(st, saved).mix(n);
}

// ---- seating: preselected from who joined, then the host's choice wins ----
export function seatingAuto(players) {
  const phones = players.filter((p) => !p.offline).length;
  if (!players.length || phones === 0) return 'one';
  return phones === players.length ? 'own' : 'mixed';
}
export const seatingOf = (st, players) => st.seating || seatingAuto(players);

// ---- validity: null when the step can be left, else { reason, fixes } so a disabled Next always names a way out ----
export function stepProblem(key, c) {
  const { n, min, roles, preset, st, local } = c;
  const toPlayers = { label: 'Back to Players', a: 'setupGo', v: '0' };
  if (key === 'players') return n < min ? { reason: `Add ${plural(min - n, 'more player')} to start (${min} minimum).`, fixes: [{ label: 'Add a name', a: 'focusAdd' }] } : null;
  if (key === 'preset') {
    if (st.source === 'custom' || inRange(preset, n)) return null;
    const why = n < preset.min ? `${preset.name} needs ${preset.min}+ players. Change preset or add players.` : `${preset.name} is made for up to ${preset.max} players. Change preset or remove players.`;
    return { reason: why, fixes: [{ label: 'Change preset', a: 'setupPresets' }, toPlayers] };
  }
  if (key === 'seating') return null;
  // deal / cards: everything that could stop the deal, each with the step that fixes it
  if (n < min) return { reason: `Add ${plural(min - n, 'more player')} to start (${min} minimum).`, fixes: [toPlayers] };
  if (roles.length !== n) return { reason: `You have ${plural(n, 'player')} and ${plural(roles.length, 'role')}. They need to match.`, fixes: [{ label: 'Change roles', a: 'setupCustomize' }, { label: 'Change preset', a: 'setupPresets' }] };
  const err = setupWarnings(roles, n).find((w) => w.level === 'error');
  if (err) return { reason: `Can't start yet: ${err.text}`, fixes: [{ label: 'Change roles', a: 'setupCustomize' }] };
  if (local && st.deal === 'own' && !ownDeckFor(roles).ok) return { reason: NEEDS_PRINTABLE, fixes: [{ label: 'Use the printable deck', a: 'setupDeal', v: 'printable' }, { label: 'Use no cards', a: 'setupDeal', v: 'pass' }] };
  return null;
}

// What the room config should hold for an offline deal choice.
export function localDealConfig(deal, roles) {
  if (deal === 'pass') return { mode: 'app' };
  if (deal === 'own' && ownDeckFor(roles).ok) return { mode: 'cards', deckStyle: 'simple', cardFlow: 'blind' };
  return { mode: 'cards', deckStyle: 'fixed', cardFlow: 'blind' };
}

export const counts = (roles) => { const m = new Map(); for (const r of roles) m.set(r, (m.get(r) || 0) + 1); return [...m]; };
export { MAFIA_PRESETS };
