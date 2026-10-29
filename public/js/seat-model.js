// Where each seat plays, and the pass-the-phone queue for seats on the host phone. Pure data, no DOM.
// Storage is passed in ({ get, set }) so tests can use a Map. Only seat ids are stored, never a role.
import { PASS_STORE_KEY } from './config-defaults.js';

// 'local' = this phone, 'remote' = their phone, 'dropped' = their phone, not connected right now, 'open' = released, waiting for someone to take it over
export const whereOf = (p) => (p.offline ? 'local' : p.open ? 'open' : p.connected ? 'remote' : 'dropped');
export const WHERE_TEXT = { local: 'This phone', remote: 'On their phone', dropped: 'Reconnecting…', open: 'Open seat' };

// The host phone shows a local seat's role only through the pass flow, so until the game moves on the screen masks it.
export const passOpen = (v) => !!v && v.phase === 'dealt' && v.config?.mode === 'app';
export const maskedLocal = (v, p) => passOpen(v) && !!p.offline;
export const passSeats = (v) => (passOpen(v) ? v.players.filter((p) => p.offline && p.roleId) : []);

const read = (storage, code) => { try { return JSON.parse(storage.get(PASS_STORE_KEY) || 'null')?.[code] || null; } catch { return null; } };
// What this host phone remembers for this room: which seats have looked this game, and which seat's gate was up.
export function loadPass(storage, code, gameNo) {
  const r = read(storage, code);
  return r && r.gameNo === gameNo ? { gameNo, seen: [...(r.seen || [])], id: r.id || null, stage: r.id ? 'gate' : null, chain: !!r.chain } : { gameNo, seen: [], id: null, stage: null, chain: false };
}
export function savePass(storage, code, st) {
  let all = {}; try { all = JSON.parse(storage.get(PASS_STORE_KEY) || '{}') || {}; } catch { all = {}; }
  const keys = Object.keys(all); if (keys.length > 10 && !(code in all)) delete all[keys[0]];
  all[code] = { gameNo: st.gameNo, seen: st.seen, id: st.id, chain: st.chain }; // a reload while a card was up comes back to its gate
  try { storage.set(PASS_STORE_KEY, JSON.stringify(all)); } catch { /* storage full: the pass still works this session */ }
}

// The next local seat after `afterId` (in seating order) that has not looked yet, or null. Wraps around once.
export function nextUnseen(seats, seen, afterId = null) {
  const i = afterId == null ? -1 : seats.findIndex((p) => p.id === afterId);
  const order = [...seats.slice(i + 1), ...seats.slice(0, i + 1)];
  return order.find((p) => !seen.includes(p.id) && p.id !== afterId) || null;
}
