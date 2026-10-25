// Pure helpers for the v2 host screens (night script, check card, setup meter, declare sheet). No DOM.
import { factionOf } from './roles.js';

// "Cop 2" -> 2. Calls without a trailing number have none.
export const callNum = (label) => { const m = /(\d+)\s*$/.exec(String(label || '')); return m ? Number(m[1]) : null; };

// The small line above the big check result: who checked whom. Built only from the call name and the target names,
// never from the answer, so it cannot leak the result.
export const checkCaption = (label, targetNames) => {
  const t = (targetNames || []).filter(Boolean);
  if (!label || !t.length) return '';
  return `${label} checked ${t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}` : t[0]}`;
};

// Town vs Mafia vs Neutral (every other faction) for the live setup meter.
export function balanceSplit(roleIds) {
  const n = { town: 0, mafia: 0, neutral: 0 };
  for (const id of roleIds) { const f = factionOf(id); n[f === 'town' ? 'town' : f === 'mafia' ? 'mafia' : 'neutral']++; }
  const total = roleIds.length;
  const pct = (k) => (total ? Math.round((n[k] / total) * 100) : 0);
  return { ...n, total, pct: { town: pct('town'), mafia: pct('mafia'), neutral: pct('neutral') } };
}

// Sides that can win this game, from the dealt roles. A draw is always possible. Lone third-party roles (Jester and
// the like) win on their own, so they are not a side. With no roles known, offer every side.
const SIDE_ORDER = ['town', 'mafia', 'killer', 'cult'];
export function declareSides(roleIds) {
  if (!roleIds?.length) return [...SIDE_ORDER, 'draw'];
  const have = new Set(roleIds.map(factionOf));
  return [...SIDE_ORDER.filter((s) => have.has(s)), 'draw'];
}

// The role library's groups in the "+ Add role" sheet.
export const SIDE_GROUPS = [['town', 'Good'], ['mafia', 'Evil'], ['third', 'Neutral']];
