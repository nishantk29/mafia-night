// App shell: routing, transports (live WebSocket / local), event handling.
import { S, esc, store, loadLibrary, saveLibrary } from './state.js';
import { newRoom, reduce, viewForHost } from './room.js';
import { registerRoles, ROLE_BY_ID } from './roles.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { teamName } from './board.js';
import { hostScreen } from './host.js';
import { playerScreen, joinForm } from './player.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $html = document.documentElement;

// ---------------- rendering ----------------
// The whole page is re-rendered on every update. Focus is recorded by the element's data attributes
// and restored afterwards, so keyboard use (radiogroups, night picking, tabs) survives re-renders.
const FOCUS_KEYS = ['a', 'k', 'v', 'id', 'key', 'i', 'c', 'pid'];
function focusSelector(el) {
  const parts = FOCUS_KEYS.filter((k) => el.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`);
  return parts.length ? parts.join('') : null;
}

let pendingRender = false;
S.render = function render() {
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pendingRender = true; return; }
  pendingRender = false;
  const sel = a && a !== document.body && $app.contains(a) ? focusSelector(a) : null;
  const y = window.scrollY;
  const { phase, shell } = shellAttrs();
  $html.dataset.phase = phase;
  $html.dataset.shell = shell;
  const opened = S.ui.anim;
  $app.innerHTML = screen();
  S.ui.anim = null; // entrance/flip classes apply to one render only (DESIGN.md 15.1)
  applyRoleSearch();
  window.scrollTo(0, y);
  // A dialog that just opened takes focus; otherwise focus goes back to the element that had it.
  const dialogClose = (opened === 'sheet' || opened === 'modal') && $app.querySelector('.sheet .x-btn, .modal .x-btn, .overlay-in .x-btn');
  if (dialogClose) dialogClose.focus({ preventScroll: true });
  else if (sel) refocus(sel, a.className);
};
// Several elements can share data attributes (a seat on the table, in the seat list and in the roster):
// prefer the one with the same classes, and only ever focus a visible one.
function refocus(sel, cls) {
  const all = [...$app.querySelectorAll(sel)].filter((x) => x.getClientRects().length);
  const el = all.find((x) => x.className === cls) || all[0];
  if (el) el.focus({ preventScroll: true });
}
document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => S.render(), 50); });

function shellAttrs() {
  if (S.fatal || S.mode === 'home') return { phase: 'home', shell: 'home' };
  if (S.mode === 'host' || S.mode === 'local') return { phase: S.view?.phase || 'lobby', shell: 'host' };
  if (S.mode === 'play') return { phase: S.view?.kind === 'player' ? S.view.phase : 'lobby', shell: 'player' };
  return { phase: 'home', shell: 'home' };
}

const connecting = (text) => `<main class="wrap"><div class="empty">${ui('cards')}<p>${text}</p></div></main>`;

function screen() {
  const banner = !S.conn && (S.mode === 'host' || S.mode === 'play') ? `<div class="banner" role="status">${ui('wifi-off')} Reconnecting to the room…</div>` : '';
  if (S.fatal) {
    return `<main class="wrap fatal"><div class="empty">${ui('warning', 'is-big')}<h1 class="phase-title">${esc(S.fatal)}</h1>
      <a class="btn" href="#/">Go to the home page</a></div></main>`;
  }
  if (S.mode === 'home') return home();
  if (S.mode === 'local') return S.view ? hostScreen(S.view, true) : '';
  if (S.mode === 'host') return banner + (S.view ? hostScreen(S.view, false) : connecting('Connecting to your room…'));
  if (S.mode === 'play') {
    if (S.view?.kind === 'player') return banner + playerScreen(S.view);
    if (store.get(`mafia.player.${S.code}`)) return connecting('Connecting to the room…');
    return joinForm(S.code);
  }
  return '';
}

function home() {
  const hostCodes = Object.keys(localStorage).filter((k) => k.startsWith('mafia.host.')).map((k) => k.slice(11));
  return `<main class="wrap home">
    <div class="home-hero">
      <div class="card-fan" aria-hidden="true">${`<span class="rcard-back"><span class="rcard-back-mark">${ui('brand')}</span></span>`.repeat(3)}</div>
      <h1 class="wordmark">Mafia<br>Night</h1>
      <p class="lede">Secret roles for Mafia and Werewolf, dealt to phones or a deck of playing cards. The app runs the night for you.</p>
    </div>
    <div class="home-paths">
      <section class="path path-host"><h2 class="path-title">Be the storyteller</h2>
        <p class="muted">You run the night. Players join on their phones with a 6‑letter code.</p>
        <button type="button" class="btn big" data-a="hostLive">Host a game</button>
        ${hostCodes.map((c) => `<p class="resume-row"><a class="resume" href="#/host/${esc(c)}">Resume room <b class="code">${esc(c)}</b></a></p>`).join('')}</section>
      <section class="path path-join"><h2 class="path-title">Join a game</h2>
        <div class="join-row"><label class="field"><span>Room code</span><input class="code-input" data-i="joinCode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="ABCDEF" value="${esc(S.ui.draft.joinCode || '')}"></label>
        <button type="button" class="btn ghost" data-a="goJoin">Join</button></div></section>
      <section class="path path-local"><a class="path-link" href="#/local">No phones? Run the game on this device</a>
        <p class="muted">Use a deck of playing cards and this one screen.</p></section>
    </div>
    <p class="credits">Role icons from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> by Lorc, Delapouite and contributors (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>). Interface icons from <a href="https://phosphoricons.com" target="_blank" rel="noopener">Phosphor</a> (MIT).</p>
  </main>`;
}

// Role search and team filter in the lobby catalogue. Typing doesn't re-render, so this filters in place.
function applyRoleSearch() {
  const q = S.ui.search.trim().toLowerCase();
  const tiles = document.querySelectorAll('.role-tile');
  let shown = 0;
  tiles.forEach((t) => { const on = !q || t.dataset.name.includes(q); t.hidden = !on; if (on) shown++; });
  const none = document.querySelector('.search-empty');
  if (none) none.hidden = !(tiles.length && !shown);
}

// ---------------- toast ----------------
let toastT;
S.toast = (m) => { $toast.textContent = m; $toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.remove('on'), 3200); };

// ---------------- transports ----------------
function closeTransport() { S.transport?.close?.(); S.transport = null; S.view = null; S.fatal = null; S.conn = true; }

function wsTransport(code, helloFn) {
  let ws; let closed = false; let tries = 0; let timer;
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
    ws.onopen = () => { tries = 0; S.conn = true; const h = helloFn(); if (h) ws.send(JSON.stringify(h)); S.render(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'view') {
        // A new deal (different role) starts face down, so a phone left showing the old role doesn't flash the new one.
        if (m.view?.kind === 'player' && S.view?.kind === 'player' && m.view.me?.role?.id !== S.view.me?.role?.id) S.ui.reveal = false;
        S.view = m.view; S.render();
      }
      else if (m.type === 'error') S.toast(m.error);
      else if (m.type === 'joined') store.set(`mafia.player.${code}`, JSON.stringify({ playerId: m.playerId, token: m.token }));
      else if (m.type === 'fatal') { closed = true; if (m.clear) { store.del(`mafia.player.${code}`); S.view = null; S.toast(m.error); S.render(); } else { S.fatal = m.error; S.render(); } }
    };
    ws.onclose = () => { if (closed) return; S.conn = false; S.render(); timer = setTimeout(open, Math.min(8000, 400 * 2 ** tries++)); };
  };
  open();
  return {
    send: (a) => { if (ws?.readyState === 1) ws.send(JSON.stringify(a)); else S.toast('Not connected to the room yet. Try again in a moment.'); },
    close: () => { closed = true; clearTimeout(timer); ws?.close(); },
  };
}

function localTransport() {
  const KEY = 'mafia.local';
  let room;
  try { room = JSON.parse(store.get(KEY) || 'null'); } catch { room = null; }
  if (!room) { room = newRoom('LOCAL', 'local'); room.config.mode = 'cards'; }
  const emit = () => { store.set(KEY, JSON.stringify(room)); registerRoles(room.config.customRoles); S.view = viewForHost(room, new Set()); S.render(); };
  setTimeout(emit, 0);
  return {
    send(a) {
      if (a.type === 'resetLocal') { room = newRoom('LOCAL', 'local'); room.config.mode = 'cards'; emit(); return; }
      const r = reduce(room, { host: true }, a);
      if (r.error) S.toast(r.error);
      else if (r.data?.skipped?.length) S.toast(`Skipped: ${r.data.skipped.join(', ')}`);
      emit();
    },
    close() {},
  };
}

// ---------------- routing ----------------
async function route() {
  closeTransport();
  Object.assign(S.ui, { tab: 'game', sheet: null, reveal: false, showKey: false, showCode: false, modal: null, claim: null, claimSuit: null, anim: null });
  const h = location.hash.replace(/^#\/?/, '');
  const [kind, arg] = h.split('/');
  S.code = null;
  if (kind === 'local') { S.mode = 'local'; S.transport = localTransport(); S.send = (a) => S.transport.send(a); }
  else if (kind === 'host' && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = 'host'; S.code = arg.toUpperCase();
    const key = store.get(`mafia.host.${S.code}`);
    if (!key) { S.fatal = 'This device isn’t hosting that room. Open it on the device that created it.'; }
    else { S.transport = wsTransport(S.code, () => ({ type: 'hello', hostKey: key })); S.send = (a) => S.transport.send(a); }
  } else if ((kind === 'play' || kind === 'join') && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = 'play'; S.code = arg.toUpperCase();
    const ex = await fetch(`/api/room/${S.code}`).then((r) => r.ok).catch(() => false);
    if (!ex) { S.fatal = `There’s no room with the code ${S.code}. Check the letters and try again.`; }
    else {
      S.transport = wsTransport(S.code, () => { try { const c = JSON.parse(store.get(`mafia.player.${S.code}`) || 'null'); return c ? { type: 'hello', ...c } : null; } catch { return null; } });
      S.send = (a) => S.transport.send(a);
    }
  } else {
    S.mode = 'home';
    for (const k of Object.keys(localStorage).filter((x) => x.startsWith('mafia.host.'))) {
      const code = k.slice(11);
      fetch(`/api/room/${code}`).then((r) => { if (!r.ok) { store.del(k); if (S.mode === 'home') S.render(); } }).catch(() => {});
    }
  }
  S.render();
}
window.addEventListener('hashchange', route);


// ---------------- role tooltip (hover, focus or tap the "i") ----------------
const $tip = document.getElementById('tip') || document.createElement('div');
$tip.id = 'tip'; $tip.setAttribute('role', 'tooltip');
if (!$tip.isConnected) document.body.appendChild($tip);
function hideTip() { $tip.classList.remove('on'); $tip.dataset.for = ''; }
function showTip(el) {
  const r = ROLE_BY_ID[el.dataset.id];
  if (!r) return;
  const uses = (n) => (n === 1 ? 'once per game' : `${n} times per game`);
  const bits = [];
  if (r.action) bits.push(`<p><b>Night:</b> ${esc(r.action.prompt)}${Number.isFinite(r.action.uses) ? ` <span class="muted">(${uses(r.action.uses)})</span>` : ''}</p>`);
  if (r.meeting === 'mafia') bits.push('<p>Joins the Mafia night meeting.</p>');
  if (r.day) bits.push(`<p><b>Day:</b> ${esc(r.day)}</p>`);
  if (r.onDeath) bits.push(`<p><b>On death:</b> ${esc(r.onDeath)}</p>`);
  if (r.onCondemn) bits.push(`<p><b>If condemned:</b> ${esc(r.onCondemn)}</p>`);
  if (r.night1) bits.push(`<p><b>Night 1:</b> ${esc(r.night1)}</p>`);
  if (r.seesAs) bits.push(`<p><b>Thinks they are:</b> ${esc(ROLE_BY_ID[r.seesAs]?.name || r.seesAs)}</p>`);
  if (r.appearsAs) bits.push(`<p><b>Investigators see:</b> ${r.appearsAs === 'mafia' ? 'Mafia' : 'innocent'}</p>`);
  $tip.innerHTML = `<div class="tip-h"><span class="tip-glyph a-${r.alignment}">${ico(r)}</span><b>${esc(r.name)}</b><span class="team-tag a-${r.alignment}"><i class="team-mark a-${r.alignment}"></i>${teamName(r.alignment)}</span></div><p>${esc(r.blurb)}</p>${bits.join('')}`;
  $tip.dataset.for = r.id;
  $tip.classList.add('on');
  const b = el.getBoundingClientRect(); const w = Math.min(320, window.innerWidth - 16);
  $tip.style.width = w + 'px';
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, b.left + b.width / 2 - w / 2));
  $tip.style.left = left + 'px';
  const h = $tip.offsetHeight;
  const bottomChrome = window.innerWidth < 768 && $html.dataset.shell === 'host' ? 150 : 16; // tab bar + action dock
  const below = b.bottom + 8 + h < window.innerHeight - bottomChrome;
  $tip.style.top = (below ? b.bottom + 8 : Math.max(8, b.top - 8 - h)) + 'px';
}
document.addEventListener('pointerover', (ev) => { if (ev.pointerType === 'mouse') { const i = ev.target.closest?.('.rc-i'); if (i) showTip(i); } });
document.addEventListener('pointerout', (ev) => { if (ev.pointerType === 'mouse' && ev.target.closest?.('.rc-i') && !ev.relatedTarget?.closest?.('.rc-i')) hideTip(); });
document.addEventListener('focusin', (ev) => { const i = ev.target.closest?.('.rc-i'); if (i && i.matches(':focus-visible')) showTip(i); });
document.addEventListener('focusout', (ev) => { if (ev.target.closest?.('.rc-i')) hideTip(); });
document.addEventListener('click', (ev) => { if (!ev.target.closest?.('.rc-i')) hideTip(); }, true);
window.addEventListener('scroll', hideTip, { passive: true });
window.addEventListener('resize', hideTip);

// ---------------- events ----------------
const send = (a) => S.send(a);
const roleLib = () => loadLibrary();
function syncLibrary() { const lib = roleLib(); registerRoles(lib); send({ type: 'setCustomRoles', roles: lib }); }
const suitOf = (card) => (card === 'RJ' || card === 'BJ' ? 'J' : card ? card.slice(-1) : null);

const A = {
  async hostLive() {
    const res = await fetch('/api/create', { method: 'POST' }).then((r) => r.json()).catch(() => null);
    if (!res?.code) return S.toast('Couldn’t create a room. Check your connection and try again.');
    store.set(`mafia.host.${res.code}`, res.hostKey);
    location.hash = `#/host/${res.code}`;
  },
  goJoin() { const c = (S.ui.draft.joinCode || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c.length !== 6) return S.toast('Room codes have 6 letters.'); location.hash = `#/join/${c}`; },
  join() { const n = (S.ui.draft.joinName || '').trim(); if (!n) return S.toast('Type your name to join.'); S.transport?.send({ type: 'hello', join: n }); },
  tab(el) { S.ui.tab = el.dataset.v; S.render(); window.scrollTo(0, 0); },
  side(el) { S.ui.sideTab = el.dataset.v; S.render(); },
  toggleUi(el) { const k = el.dataset.k; S.ui[k] = !S.ui[k]; S.render(); },
  copy(el) { navigator.clipboard?.writeText(el.dataset.v).then(() => S.toast('Join link copied'), () => S.toast(el.dataset.v)); },
  // lobby
  addNames() {
    const names = (S.ui.draft.names || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) return S.toast('Type at least one name first.'); S.ui.draft.names = ''; send({ type: 'addPlayers', names });
  },
  rmPlayer(el) { send({ type: 'removePlayer', playerId: el.dataset.id }); },
  cfg(el) { send({ type: 'setConfig', [el.dataset.k]: el.dataset.v }); },
  suggest() { syncLibrary(); send({ type: 'suggestRoles' }); },
  clearRoles() { send({ type: 'setConfig', roles: [] }); },
  addRole(el) { syncLibrary(); send({ type: 'setConfig', roles: [...S.view.config.roles, el.dataset.id] }); },
  subRole(el) { const r = [...S.view.config.roles]; const i = r.lastIndexOf(el.dataset.id); if (i >= 0) r.splice(i, 1); send({ type: 'setConfig', roles: r }); },
  roleTeam(el) { S.ui.roleTeam = el.dataset.v; S.render(); },
  info(el) { if ($tip.dataset.for === el.dataset.id && $tip.classList.contains('on')) hideTip(); else showTip(el); },
  deal() { syncLibrary(); send({ type: 'deal' }); },
  undeal() { send({ type: 'undeal' }); },
  showKey() { S.ui.showKey = true; S.ui.anim = 'modal'; S.render(); },
  hideKey() { S.ui.showKey = false; S.render(); },
  resetLocal() { if (confirm('Remove every player and role and start a fresh game on this device?')) { S.ui.night = { n: 0, actions: {}, picks: {} }; send({ type: 'resetLocal' }); } },
  leaveGame() {
    if (!confirm('Leave this game on this phone? You can join again with the room code, but the storyteller may need to remove your old seat.')) return;
    store.del(`mafia.player.${S.code}`); location.hash = '#/';
  },
  showCode() { S.ui.showCode = true; S.ui.anim = 'modal'; S.render(); },
  hideCode() { S.ui.showCode = false; S.render(); },
  clearCard(el) { send({ type: 'clearCard', playerId: el.dataset.id }); },
  startNight() { S.ui.condemn = null; send({ type: 'startNight' }); },
  // custom role editor
  newRole() { S.ui.draft.role = { alignment: 'town', action: { type: '' } }; S.ui.modal = 'role'; S.ui.anim = 'modal'; S.render(); },
  closeModal() { S.ui.modal = null; S.render(); },
  saveRole() {
    const d = S.ui.draft.role || {};
    if (!(d.name || '').trim()) return S.toast('Give the role a name.');
    const id = 'c_' + [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
    const role = { ...d, id, appearsAs: d.appearsAs, action: d.action?.type ? { ...d.action, prompt: `${d.name}, wake up.` } : null };
    const lib = [...roleLib(), role].slice(-40);
    saveLibrary(lib); S.ui.modal = null; send({ type: 'setCustomRoles', roles: lib }); S.toast('Role saved');
  },
  // night
  pick(el) {
    const n = S.ui.night; const key = el.dataset.key; const id = el.dataset.id;
    const step = S.view.script.find((s) => s.key === key); if (!step) return;
    const cur = n.picks[key] || [];
    if (step.kind === 'identify') n.picks[key] = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < step.count ? [...cur, id] : cur;
    else {
      const need = step.targets || 1;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (next.length >= need) { n.actions[key] = { targets: next.slice(0, need) }; delete n.picks[key]; n.focus = null; } else n.picks[key] = next;
    }
    S.render();
  },
  focusStep(el) { S.ui.night.focus = el.dataset.key; S.render(); },
  confirmId(el) { S.ui.night.focus = null; const key = el.dataset.key; const ids = S.ui.night.picks[key] || []; delete S.ui.night.picks[key]; send({ type: 'identifyRole', roleId: el.dataset.role, playerIds: ids }); },
  skip(el) { S.ui.night.focus = null; S.ui.night.actions[el.dataset.key] = { targets: [] }; delete S.ui.night.picks[el.dataset.key]; S.render(); },
  alert(el) { S.ui.night.focus = null; S.ui.night.actions[el.dataset.key] = { on: el.dataset.v === '1', targets: [] }; S.render(); },
  infoDone(el) { S.ui.night.focus = null; S.ui.night.actions[el.dataset.key] = { done: true }; S.render(); },
  undoStep(el) { delete S.ui.night.actions[el.dataset.key]; S.ui.night.focus = el.dataset.key; S.render(); },
  resolve() { send({ type: 'submitNight', actions: S.ui.night.actions }); },
  // day
  selCondemn(el) { S.ui.condemn = S.ui.condemn === el.dataset.id ? null : el.dataset.id; S.render(); },
  condemn() { if (!S.ui.condemn) return; const id = S.ui.condemn; S.ui.condemn = null; send({ type: 'condemn', playerId: id }); },
  noCondemn() { send({ type: 'noCondemn' }); S.toast('Nobody condemned today'); },
  pend(el) { send({ type: 'resolvePending', pendingId: el.dataset.pid, targetId: el.dataset.id || null }); },
  useDay(el) { send({ type: 'useDay', playerId: el.dataset.id }); },
  declare() { const s = prompt('Who wins? Type town, mafia, or a player’s name.'); if (s) send({ type: 'declareWinner', side: s.toLowerCase(), reason: 'Declared by the Storyteller.' }); },
  newGame() { if (S.view.phase === 'over' || confirm('Abandon this game and go back to setup?')) { S.ui.night = { n: 0, actions: {}, picks: {} }; send({ type: 'newGame' }); } },
  // board
  seat(el) { if (S.mode === 'play') return; S.ui.anim = S.ui.sheet ? null : 'sheet'; S.ui.sheet = el.dataset.id; S.render(); },
  closeSheet() { S.ui.sheet = null; S.render(); },
  tag(el) { send({ type: 'toggleTag', playerId: el.dataset.id, tag: el.dataset.c }); },
  killp(el) { send({ type: 'kill', playerId: el.dataset.id, cause: 'host' }); },
  revive(el) { send({ type: 'revive', playerId: el.dataset.id }); },
  rename(el) { const n = prompt('New name'); if (n) send({ type: 'renamePlayer', playerId: el.dataset.id, name: n }); },
  legend(el) { const c = el.dataset.c; const n = prompt('What does this color mean?', S.view.config.legend[c]); if (n !== null) send({ type: 'setLegend', color: c, label: n }); },
  // player
  reveal() { S.ui.reveal = !S.ui.reveal; S.ui.anim = S.ui.reveal ? 'reveal' : 'hide'; S.render(); },
  pickSuit(el) { const v = el.dataset.v || null; S.ui.claimSuit = v; if (suitOf(S.ui.claim) !== v) S.ui.claim = null; S.render(); },
  pickCard(el) { S.ui.claim = el.dataset.v; S.ui.claimSuit = suitOf(el.dataset.v); S.render(); },
  claim() { if (S.ui.claim) send({ type: 'claimCard', card: S.ui.claim }); },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const fn = A[el.dataset.a];
  if (!fn) return;
  if (el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') { S.toast(el.dataset.why || el.textContent.trim()); return; }
  // Backdrops (overlay, sheet scrim) close only when the click lands outside the dialog itself.
  if (el.matches('.overlay, .sheet-bg') && ev.target.closest('[data-stop], .overlay-in')) return;
  fn(el, ev);
});

// ---------------- keyboard ----------------
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    // Renders are deferred while a field has focus, so leave the field first or the dialog would stay open.
    if ((S.ui.showKey || S.ui.showCode || S.ui.modal || S.ui.sheet) && $app.contains(document.activeElement)) { pendingRender = false; document.activeElement.blur(); }
    if (S.ui.showKey) { A.hideKey(); return; }
    if (S.ui.showCode) { A.hideCode(); return; }
    if (S.ui.modal) { A.closeModal(); return; }
    if (S.ui.sheet) { const id = S.ui.sheet; A.closeSheet(); refocus(`[data-a="seat"][data-id="${CSS.escape(id)}"]`, ''); return; }
    return;
  }
  // Enter in the home code field and the join name field submits.
  if (ev.key === 'Enter' && ev.target.dataset?.i === 'joinCode') { ev.preventDefault(); ev.target.blur(); A.goJoin(); return; }
  if (ev.key === 'Enter' && ev.target.dataset?.i === 'joinName') { ev.preventDefault(); A.join(); return; }
  // Arrow keys move through radiogroups and tablists (roving tabindex); the newly focused option is chosen.
  const item = ev.target.closest?.('[role="radio"], [role="tab"]');
  if (!item || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
  const group = item.closest('[role="radiogroup"], [role="tablist"]');
  if (!group) return;
  const items = [...group.querySelectorAll(':scope > [role="radio"], :scope > [role="tab"]')];
  const i = items.indexOf(item);
  if (i < 0) return;
  ev.preventDefault();
  const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1
    : (i + (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  items[next].focus();
  items[next].click();
});

function setDeep(obj, path, val) {
  const parts = path.split('.'); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ||= {};
  o[parts[parts.length - 1]] = val;
}

document.addEventListener('input', (ev) => {
  const el = ev.target; const i = el.dataset.i; if (!i) return;
  if (i === 'names') S.ui.draft.names = el.value;
  else if (i === 'joinName') S.ui.draft.joinName = el.value;
  else if (i === 'joinCode') S.ui.draft.joinCode = el.value.toUpperCase();
  else if (i === 'search') { S.ui.search = el.value; applyRoleSearch(); }
  else if (i === 'note') send({ type: 'setNote', playerId: el.dataset.id, note: el.value });
  else if (i === 'rf' && el.type !== 'checkbox' && el.tagName !== 'SELECT') setDeep(S.ui.draft.role ||= { alignment: 'town', action: {} }, el.dataset.k, el.value);
});

document.addEventListener('change', (ev) => {
  const el = ev.target; const i = el.dataset.i; if (!i) return;
  if (i === 'assign' && el.value) send({ type: 'assignCard', playerId: el.dataset.id, card: el.value });
  else if (i === 'setRole') send({ type: 'setRole', playerId: el.dataset.id, roleId: el.value });
  else if (i === 'rf') {
    const d = S.ui.draft.role ||= { alignment: 'town', action: {} };
    const k = el.dataset.k;
    if (el.type === 'checkbox') {
      if (k === 'appearsMafia') d.appearsAs = el.checked ? 'mafia' : undefined;
      else if (k === 'appearsInnocent') d.appearsAs = el.checked ? 'innocent' : undefined;
      else if (k === 'meetingMafia') d.meeting = el.checked ? 'mafia' : null;
      else if (k === 'jesterWin') d.sideWin = el.checked ? 'condemned' : undefined;
      else d[k] = el.checked;
    } else setDeep(d, k, el.value);
    if (k === 'alignment' || k === 'action.type') { pendingRender = false; S.render(); }
  }
});

route();
