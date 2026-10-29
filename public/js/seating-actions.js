// Seating behaviour on the host phone: the seat sheet, moving seats, and the pass-the-phone flow. Rendering is in seating.js.
import { S, store } from './state.js';
import { loadPass, savePass, passSeats, nextUnseen } from './seat-model.js';
import { passReveal } from './seating.js';

const send = (a) => S.send(a);

// The pass state for this game on this phone, loaded once per room and game. `id` is the seat looking now, `stage` is 'gate' or 'card'.
function pass(v) {
  const key = `${v.code || 'LOCAL'}|${v.gameNo || 1}`;
  if (S.ui.passKey !== key) { S.ui.passKey = key; S.ui.pass = loadPass(store, v.code || 'LOCAL', v.gameNo || 1); }
  return S.ui.pass;
}
const persist = () => { const v = S.view; if (v && S.ui.pass) savePass(store, v.code || 'LOCAL', S.ui.pass); };
export const passSeen = (v) => pass(v).seen;
// The pass in progress, or null. It ends by itself when the game leaves the dealt screen or the seat is no longer on this phone.
export function activePass(v) {
  const ps = pass(v);
  const ok = ps.id && ps.stage && passSeats(v).some((p) => p.id === ps.id);
  if (!ok && ps.id) { ps.id = null; ps.stage = null; persist(); }
  return ok ? ps : null;
}

const show = (id, chain) => { const ps = pass(S.view); ps.id = id; ps.stage = 'gate'; ps.chain = !!chain; persist(); S.ui.focusPass = true; S.render(); };
const end = () => { const ps = pass(S.view); ps.id = null; ps.stage = null; ps.chain = false; persist(); S.render(); };

export const SEAT_ACTIONS = {
  // ---- the seat sheet ----
  seatOpen(el) { S.ui.seatSheet = { id: el.dataset.id, mode: 'menu' }; delete S.ui.draft.seatName; S.ui.anim = 'sheet'; S.render(); },
  seatClose() { S.ui.seatSheet = null; delete S.ui.draft.seatName; S.render(); },
  seatPull(el) { S.ui.seatSheet = { id: el.dataset.id, mode: 'pull' }; S.ui.anim = 'sheet'; S.render(); },
  seatLocal(el) { send({ type: 'seatWhere', playerId: el.dataset.id, where: 'local' }); S.ui.seatSheet = null; S.render(); },
  seatRelease(el) { send({ type: 'seatWhere', playerId: el.dataset.id, where: 'open' }); S.ui.seatSheet = null; S.render(); },
  seatRename(el) {
    const name = (S.ui.draft.seatName ?? S.view.players.find((p) => p.id === el.dataset.id)?.name ?? '').trim();
    if (!name) return S.toast('Type a name first.');
    send({ type: 'renamePlayer', playerId: el.dataset.id, name }); S.ui.seatSheet = null; delete S.ui.draft.seatName; S.render();
  },
  seatRemove(el) { send({ type: 'removePlayer', playerId: el.dataset.id }); S.ui.seatSheet = null; S.render(); },
  // ---- pass the phone ----
  passStart() { const v = S.view; const seats = passSeats(v); const first = nextUnseen(seats, passSeen(v)) || seats[0]; if (first) show(first.id, true); },
  passTo(el) { show(el.dataset.id, false); },
  passIm() { const ps = pass(S.view); ps.stage = 'card'; S.ui.focusPass = true; S.render(); },
  passSkip() { end(); },
  passDone() {
    const v = S.view; const ps = pass(v);
    passReveal(false);
    if (ps.id && !ps.seen.includes(ps.id)) ps.seen.push(ps.id);
    const nxt = ps.chain ? nextUnseen(passSeats(v), ps.seen, ps.id) : null;
    if (nxt) show(nxt.id, true); else end();
  },
};
