// Setup carousel behaviour: state, actions, syncing the roles and Advanced settings into the room, slide, focus and swipe.
import { S, store } from './state.js';
import { SLIDE_MS, SWIPE_PX } from './config-defaults.js';
import { MAFIA_PRESETS, mafiaPresetById } from './preset-mixes.js';
import { loadSetup, saveSetup, loadAdvanced, saveAdvanced, loadSaved, writeSaved, addSaved, renameSaved, deleteSaved, presetOf, desiredRoles, stepProblem, localDealConfig, cleanName } from './setup-store.js';
import { setupCtx, carousel, dock, presetsPage, presetsDock, previewSheet, customizePage, customizeDock, saveSheet, menuSheet } from './setup-ui.js';
import { animOn } from './fx.js';

const roomKey = (local) => (local ? 'LOCAL' : S.code);
const last = {}; // what was last sent for each kind of sync, so a rejected or sliced value can't loop
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// The state for this room, loaded once from storage (mafia.setup.v1) and kept on S.ui.setup.
function state(local) {
  const key = roomKey(local);
  if (S.ui.setupKey !== key) {
    S.ui.setupKey = key; S.ui.setup = { ...loadSetup(store, key, local), page: null, sheet: null, advOpen: false, from: null, focus: false };
    S.ui.advanced = loadAdvanced(store); S.ui.saved = loadSaved(store);
    for (const k of Object.keys(last)) delete last[k];
  }
  return S.ui.setup;
}
const persist = () => saveSetup(store, S.ui.setupKey, S.ui.setup);
const ctx = () => { const local = S.mode === 'local'; return setupCtx(S.view, local, state(local), S.ui.saved, S.ui.advanced); };

// ---- what the host screen shows in the lobby ----
export function setupView(v, local) {
  const st = state(local);
  const c = setupCtx(v, local, st, S.ui.saved, S.ui.advanced);
  const sh = st.sheet;
  const sheets = !sh ? '' : sh.k === 'preview' ? previewSheet(c, sh.id) : sh.k === 'save' ? saveSheet(c) : sh.k === 'menu' ? menuSheet(c, sh.id) : '';
  if (st.page === 'presets') return { body: presetsPage(c) + sheets, dock: `<div class="dock-in">${presetsDock(c)}</div>` };
  if (st.page === 'customize') return { body: customizePage(c) + sheets, dock: `<div class="dock-in">${customizeDock(c)}</div>` };
  return { body: carousel(c) + sheets, dock: `<div class="dock-in">${dock(c)}</div>` };
}

// ---- keep the room in line with the setup, before each paint ----
export function syncSetup() {
  const v = S.view;
  if (!v || v.kind === 'player' || v.phase !== 'lobby' || (S.mode !== 'host' && S.mode !== 'local')) return;
  const local = S.mode === 'local';
  const st = state(local);
  const n = v.players.length;
  const push = (k, payload) => { const j = JSON.stringify(payload); if (last[k] === j) return; last[k] = j; S.send(payload); };
  const want = desiredRoles(st, S.ui.saved, n, v.limits.min);
  if (want && !sameList(want, v.config.roles)) push('roles', { type: 'setConfig', roles: want }); else delete last.roles;
  const a = S.ui.advanced; const cur = v.advanced || {};
  if (a.dayTimer !== !!cur.dayTimer || a.hiddenSetup !== !!cur.hiddenSetup || a.cardOnDeath !== (v.config.rules?.revealOnDeath !== false)) {
    push('adv', { type: 'setConfig', advanced: { dayTimer: a.dayTimer, hiddenSetup: a.hiddenSetup }, rules: { revealOnDeath: a.cardOnDeath } });
  } else delete last.adv;
  if (local) {
    const wantCfg = localDealConfig(st.deal, v.config.roles);
    if (Object.entries(wantCfg).some(([k, x]) => v.config[k] !== x)) push('deal', { type: 'setConfig', ...wantCfg }); else delete last.deal;
  }
}

// ---- after each paint: size the viewport to the active card, slide, move focus, announce ----
let live;
const liveEl = () => live || (live = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'setup-live', className: 'sr-only' }), live.setAttribute('role', 'status'), live.setAttribute('aria-live', 'polite'), live);
export function afterSetupPaint(root) {
  const st = S.ui.setup;
  const track = root.querySelector('.setup-track');
  if (!track || !st) { if (st && st.focus && root.querySelector('.setup-page')) { root.querySelector('#setup-h')?.focus({ preventScroll: true }); st.focus = false; return true; } return false; }
  const active = track.querySelector('.setup-card.is-active');
  const fit = () => { track.parentElement.style.height = `${active.offsetHeight}px`; };
  fit();
  if (st.from != null && st.from !== st.step) {
    if (animOn()) {
      track.style.transition = 'none'; track.style.transform = `translateX(-${st.from * 100}%)`; void track.offsetWidth;
      track.style.transition = ''; track.style.transform = `translateX(-${st.step * 100}%)`;
    } else active.classList.add('is-fade');
    st.from = null;
  }
  let moved = false;
  if (st.focus) {
    st.focus = false; moved = true;
    active.querySelector('#setup-h')?.focus({ preventScroll: true });
    const label = root.querySelector('.setup-count')?.textContent;
    if (label) liveEl().textContent = label.replace(':', ',');
  }
  return moved;
}

// ---- actions ----
const go = (idx, focus = true) => { const st = S.ui.setup; if (idx === st.step) return; st.from = st.step; st.step = idx; st.focus = focus; persist(); S.render(); };
const closeSheet = () => { S.ui.setup.sheet = null; delete S.ui.draft.presetName; };
function applyPreset(id, saved) {
  const st = S.ui.setup; const prev = presetOf(st, S.ui.saved);
  const p = saved ? S.ui.saved.find((x) => x.id === id) : mafiaPresetById(id);
  if (!p) return;
  if (saved) { st.source = 'saved'; st.savedId = id; Object.assign(S.ui.advanced, { ...S.ui.advanced, ...p.advanced }); }
  else { st.source = 'preset'; st.presetId = id; st.savedId = null; if (p.hiddenSetup) S.ui.advanced.hiddenSetup = true; else if (prev.hiddenSetup) S.ui.advanced.hiddenSetup = false; }
  saveAdvanced(store, S.ui.advanced); S.ui.deckShown = [];
}
const isSaved = (id) => S.ui.saved.some((x) => x.id === id);

export const SETUP_ACTIONS = {
  setupGo(el) { const i = Number(el.dataset.v); if (i <= S.ui.setup.step) go(i); },
  setupBack() { go(Math.max(0, S.ui.setup.step - 1)); },
  setupNext() { const c = ctx(); const p = stepProblem(c.key, c); if (p) return S.toast(p.reason); go(Math.min(c.steps.length - 1, S.ui.setup.step + 1)); },
  focusAdd() { document.getElementById('add-name')?.focus(); },
  setupSeating(el) { S.ui.setup.seating = el.dataset.v; persist(); S.render(); },
  setupDeal(el) { S.ui.setup.deal = el.dataset.v; persist(); S.render(); },
  setupAdvOpen() { S.ui.setup.advOpen = !S.ui.setup.advOpen; S.render(); },
  setupAdv(el) { const k = el.dataset.k; S.ui.advanced[k] = !S.ui.advanced[k]; saveAdvanced(store, S.ui.advanced); S.render(); },
  setupPresets() { const st = S.ui.setup; st.sheet = null; st.page = 'presets'; st.focus = true; S.render(); },
  setupCustomize() { const st = S.ui.setup; st.sheet = null; st.page = 'customize'; st.focus = true; S.render(); },
  setupClosePage() { const st = S.ui.setup; st.page = null; st.sheet = null; S.render(); },
  setupPreview(el) { S.ui.setup.sheet = { k: 'preview', id: el.dataset.v }; S.ui.anim = 'sheet'; S.render(); },
  setupSheetClose() { closeSheet(); S.render(); },
  setupUse(el) { const id = el.dataset.v; applyPreset(id, isSaved(id)); const st = S.ui.setup; st.sheet = null; st.page = null; persist(); S.render(); },
  setupCustomizeFrom(el) { const id = el.dataset.v; applyPreset(id, isSaved(id)); const st = S.ui.setup; st.source = 'custom'; st.sheet = null; st.page = 'customize'; st.focus = true; persist(); S.render(); },
  setupAddPlayers() { const st = S.ui.setup; st.sheet = null; st.page = null; st.from = st.step; st.step = 0; st.focus = true; persist(); S.render(); },
  setupSave() { S.ui.setup.sheet = { k: 'save' }; S.ui.anim = 'sheet'; S.render(); },
  setupSaveDo() {
    const name = cleanName(S.ui.draft.presetName ?? 'My setup'); const v = S.view;
    const r = addSaved(S.ui.saved, name || 'My setup', v.config.roles, S.ui.advanced);
    S.ui.saved = r.list; writeSaved(store, r.list);
    const st = S.ui.setup; st.source = 'saved'; st.savedId = r.id; closeSheet(); persist(); S.toast('Preset saved on this phone'); S.render();
  },
  setupMenu(el) { S.ui.setup.sheet = { k: 'menu', id: el.dataset.v }; S.ui.setup.menuMode = null; S.ui.anim = 'sheet'; S.render(); },
  setupMenuMode(el) { S.ui.setup.menuMode = el.dataset.v; S.render(); },
  setupRenameDo(el) { S.ui.saved = renameSaved(S.ui.saved, el.dataset.v, S.ui.draft.presetName); writeSaved(store, S.ui.saved); closeSheet(); S.render(); },
  setupDeleteDo(el) {
    const id = el.dataset.v; S.ui.saved = deleteSaved(S.ui.saved, id); writeSaved(store, S.ui.saved);
    const st = S.ui.setup; if (st.source === 'saved' && st.savedId === id) { st.source = 'preset'; st.savedId = null; }
    closeSheet(); persist(); S.render();
  },
  printKey() { document.documentElement.classList.add('printing-key'); const done = () => { document.documentElement.classList.remove('printing-key'); removeEventListener('afterprint', done); }; addEventListener('afterprint', done); window.print(); },
};
// Called by the role steppers: any hand edit makes the roles the host's own.
export function markCustom() { const st = S.ui.setup; if (st && st.source !== 'custom') { st.source = 'custom'; persist(); } }
export const setupProblem = () => { const c = ctx(); return stepProblem(c.key, c); };
export const setupDealProblem = () => { const c = ctx(); return stepProblem(c.steps.at(-1)[0], c); };

// ---- swipe and arrow keys ----
export function wireSetupGestures() {
  let d = null;
  document.addEventListener('pointerdown', (ev) => { const vp = ev.target.closest?.('.setup-viewport'); d = vp && ev.isPrimary && !ev.target.closest('input,textarea,button,a') ? { x: ev.clientX, y: ev.clientY } : null; });
  document.addEventListener('pointerup', (ev) => {
    if (!d) return; const dx = ev.clientX - d.x; const dy = ev.clientY - d.y; d = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5 || !S.ui.setup) return;
    if (dx < 0) { const c = ctx(); if (S.ui.setup.step < c.steps.length - 1) SETUP_ACTIONS.setupNext(); } else if (S.ui.setup.step > 0) SETUP_ACTIONS.setupBack();
  });
  document.addEventListener('pointercancel', () => { d = null; });
  document.addEventListener('keydown', (ev) => {
    const dot = ev.target.closest?.('.setup-dot'); if (!dot || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault();
    if (ev.key === 'ArrowLeft') { if (S.ui.setup.step > 0) go(S.ui.setup.step - 1, false); } else { const c = ctx(); const p = stepProblem(c.key, c); if (p) S.toast(p.reason); else if (S.ui.setup.step < c.steps.length - 1) go(S.ui.setup.step + 1, false); }
  });
}
