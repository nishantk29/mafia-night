// Shared client state + tiny helpers.
export const S = {
  mode: 'home', // home | host | play | local
  code: null, view: null, fatal: null, ended: null, conn: true,
  ui: {
    tab: 'game', // game | table | log (phone tab bar)
    sideTab: 'table', // table | log (side switch, 768-1439px)
    sheet: null, reveal: false, modal: null, search: '', roleTeam: 'all', dealMore: false,
    night: { n: 0, actions: {}, picks: {} }, condemn: null, draft: {}, showKey: false,
    claim: null, claimSuit: null, roles: false, deckShown: [], // roles: the "Roles in this game" sheet; deckShown: roles kept visible at 0 while the host sets up
    anim: null, // 'sheet' | 'reveal' | 'hide' | 'modal' | null: set by an action, cleared after one render
  },
  send: () => {}, render: () => {}, toast: () => {}, transport: null,
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// First letter of a name, for seats and rows whose role is unknown or secret.
export const initial = (name) => esc(([...String(name || '').trim()][0] || '?').toUpperCase());

const LIB_KEY = 'mafia.library';
export function loadLibrary() { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch { return []; } }
export function saveLibrary(list) { try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch { /* storage blocked */ } }

// Haptics: a short buzz where the browser has one (Android Chrome); a no-op elsewhere.
export const buzz = (pattern = 12) => { try { navigator.vibrate?.(pattern); } catch { /* not allowed */ } };

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
