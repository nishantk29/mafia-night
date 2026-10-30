// App shell: routing, transports (live WebSocket / local), event handling.
import { S, esc, store, loadLibrary, saveLibrary, buzz } from './state.js';
import { newRoom, viewForHost, migrateRoleIds } from './room.js';
import { registerRoles, ROLE_BY_ID } from './roles.js';
import { rebalance, DEFAULT_RULES, REVEAL_POLICY, flipCoin } from './engine.js';
import { themeOf, themeText, themeDom } from './theme.js';
import { TOOL_ACTIONS, tickTools } from './tools.js';
import { TALK_MINUTES, UNDO_PAST_GAME_OVER, NOTIFY_ON_UNDO } from './config-defaults.js';
import { GameLog } from './event-log.js';
import { clampMinutes, talkDoneText, saveDayStage } from './day-talk.js';
const seatNames = () => [...(S.view?.players || []).map((p) => p.name), S.view?.me?.name].filter(Boolean);
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { teamName } from './board.js';
import { hostScreen, checkCardFor } from './host.js';
import { rolesGateKey, markRolesSeen } from './roles_sheet.js';
import { pressNext } from './night-nav.js';
import { worldOf, applyClosed } from './world.js';
import { patchGraveyard, scrollGraveyard } from './graveyard.js';
import { playerScreen, joinForm, notesKey } from './player.js';
import { faqScreen, wireFaqSearch } from './faq.js';
import { observe, afterRender, showVictory, closeVictory, victoryOpen, setAnim, animOn, restartIn, deathCardOpen, closeDeathCard } from './fx.js';
import { gameOverEvent, isNewGame } from './room.js';
import { SEAT_ACTIONS } from './seating-actions.js';
import { seatingOf } from './setup-store.js';
import { passReveal, goneScreen } from './seating.js';
import { SETUP_ACTIONS, syncSetup, afterSetupPaint, markCustom, setupDealProblem, wireSetupGestures } from './setup-actions.js';
import { step, gameAwake } from './motion.js';
import { enterKeys, settle } from './settle.js';
import { createHold } from './hold.js';
import { siteFooter } from './footer.js';
import { HOST_HELP_ACTIONS, hostHelpOpen } from './host_help.js';
import { errorBody, errorButtons, crashHtml, FATAL, ENDED } from './error-screen.js';
import { wordmark, knifeSvg, suggestions } from './flair.js';
import { wakeReconnect } from './wake.js';
import { backClosesSheets } from './back-sheet.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $html = document.documentElement;

// ---------------- rendering ----------------
// The whole page is re-rendered on every update. Focus is recorded by the element's data attributes
// and restored afterwards, so keyboard use (radiogroups, night picking, tabs) survives re-renders.
const FOCUS_KEYS = ['a', 'k', 'v', 'id', 'key', 'i', 'c', 'pid', 'hold'];
function focusSelector(el) {
  const parts = FOCUS_KEYS.filter((k) => el.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`);
  return parts.length ? parts.join('') : null;
}

let pendingRender = false;
// Back (Android Back, the iOS edge swipe) closes the top sheet or overlay first, the same as a tap on its backdrop.
// A layer with no backdrop action (the roles gate) is left alone, so Back still leaves from there.
const backNav = backClosesSheets(() => {
  const d = [...document.querySelectorAll('[aria-modal="true"]')].filter((x) => x.getClientRects().length).at(-1);
  const el = d?.closest('[data-a]');
  if (!el || !A[el.dataset.a]) return null;
  return {
    key: `${el.dataset.a}|${d.getAttribute('aria-labelledby') || d.getAttribute('aria-label') || ''}`,
    close: () => { const f = document.activeElement; if (f && $app.contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) { pendingRender = false; f.blur(); } el.click(); },
  };
});
// The private role card: shown only while pressed (or Space/Enter held), at most 3s, gone the moment the page is hidden.
const hold = createHold((on) => {
  document.querySelectorAll('.secret').forEach((s) => {
    s.classList.toggle('is-open', on);
    s.querySelectorAll('.rcard, .secret-rest').forEach((el) => { if (on) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true'); el.toggleAttribute('inert', !on); });
  });
  passReveal(on);
  if (on) buzz(12);
});
const endHold = (all) => { if (all) hold.cancel(); else hold.release(); if (pendingRender && !drag) setTimeout(() => S.render(), 0); };
S.render = function render() {
  if (drag || hold.pressed || hold.shown) { pendingRender = true; return; } // a seat is being dragged or the role card is held: the end renders
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !S.ui.addFlush) { pendingRender = true; if (a.dataset.i === 'gyText') patchGraveyard(); return; }
  pendingRender = false; S.ui.addFlush = false;
  try { syncSetup(); step(paint); } catch (e) { crash(e); }
};
function paint() {
  try { paintScreen(); } catch (e) { crash(e); }
}
// A render that throws, or an uncaught error before anything is on screen, ends on the friendly error page.
function crash(e) {
  console.error(e);
  try { $html.dataset.phase = 'home'; $html.dataset.shell = 'home'; $app.innerHTML = crashHtml(); } catch { /* nothing more to do */ }
}
const nothingShown = () => !$app.firstElementChild;
addEventListener('error', (ev) => { if (nothingShown()) crash(ev.error || ev.message); });
addEventListener('unhandledrejection', (ev) => { if (nothingShown()) crash(ev.reason); });
// Host night script: when the current step changes (a pick, No one, Next, Undo), bring it into view. Smooth unless motion is off.
function followCue() {
  const cur = $app.querySelector('.cues .cue.is-current[data-ck]');
  const key = cur ? `${S.view?.night}:${cur.dataset.ck}` : null;
  if (!cur || key === S.ui.lastCue) { if (!cur) S.ui.lastCue = null; return; }
  S.ui.lastCue = key;
  // A tall step (the line to read plus its picker) is aligned to its top, under the app bar, so the line to read stays on screen.
  requestAnimationFrame(() => cur.scrollIntoView({ behavior: animOn() ? 'smooth' : 'auto', block: cur.offsetHeight > innerHeight * 0.55 ? 'start' : 'center' }));
}
// The key of what a player's hand shows. When it changes (joined, dealt, card entered, a new phase, a new game, a death)
// the screen opens at the top, where the face-down card is, instead of keeping the old screen's scroll position.
// The Host's screen does the same when the phase changes (Deal roles, Start night, dawn), since its button sits at the bottom.
const handKey = (mode, v) => (mode === 'play' ? `${v ? `${v.kind}|${v.gameNo}|${v.phase}|${v.me?.role?.id || ''}|${v.me?.card ? 1 : 0}|${v.me?.alive}` : 'join'}`
  : (mode === 'host' || mode === 'local') && v ? `host|${v.gameNo}|${v.phase}|${v.night || 0}` : null);
function paintScreen() {
  const a = document.activeElement;
  const sel = a && a !== document.body && $app.contains(a) ? focusSelector(a) : null;
  const hk = handKey(S.mode, S.view);
  const toTop = S.ui.toTop || (hk !== null && hk !== S.ui.handKey);
  S.ui.handKey = hk; S.ui.toTop = false;
  const y = toTop ? 0 : window.scrollY;
  const { phase, shell } = shellAttrs();
  $html.dataset.phase = phase;
  $html.dataset.shell = shell;
  $html.dataset.world = shell === 'player' ? worldOf(phase) : 'neutral'; // follows the broadcast phase, dead players included
  const opened = S.ui.anim;
  const keepMark = $app.querySelector('.splash .wordmark'); // the static splash logo stays (its drips and hub handoff keep playing)
  const shown = enterKeys($app); // entrances already on screen do not replay on this repaint
  $app.innerHTML = screen();
  settle($app, shown);
  if (keepMark) $app.querySelector('.home-hero .wordmark')?.replaceWith(keepMark);
  themeDom($app, themeOf(S.view), seatNames());
  S.ui.anim = null; // entrance/flip classes apply to one render only (DESIGN.md 15.1)
  applyRoleSearch();
  afterRender();
  const focusMoved = afterSetupPaint($app);
  if (S.ui.focusPass) { S.ui.focusPass = false; $app.querySelector('.pass-name, .pass-top')?.focus({ preventScroll: true }); }
  followCue();
  if (opened === 'restart') restartIn();
  gameAwake((S.mode === 'host' || S.mode === 'local') && ['dealt', 'night', 'day'].includes(S.view?.phase));
  if (opened === 'deal') buzz(18);
  window.scrollTo(0, y);
  // A dialog that just opened takes focus; otherwise focus goes back to the element that had it.
  const dialogClose = (opened === 'sheet' || opened === 'modal') && $app.querySelector('.sheet .x-btn, .modal .x-btn, .overlay-in .x-btn');
  if (dialogClose) dialogClose.focus({ preventScroll: true });
  else if (sel && !focusMoved) refocus(sel, a.className);
  backNav.sync();
}
// Several elements can share data attributes (a seat on the table, in the seat list and in the roster):
// prefer the one with the same classes, and only ever focus a visible one.
function refocus(sel, cls) {
  const all = [...$app.querySelectorAll(sel)].filter((x) => x.getClientRects().length);
  const el = all.find((x) => x.className === cls) || all[0];
  if (el) el.focus({ preventScroll: true });
}
document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => S.render(), 50); });

function shellAttrs() {
  if (S.fatal || S.ended || S.mode === 'home' || S.mode === 'faq') return { phase: 'home', shell: 'home' };
  if (S.mode === 'host' || S.mode === 'local') return { phase: S.view?.phase || 'lobby', shell: 'host' };
  if (S.mode === 'play') return { phase: S.view?.kind === 'player' ? S.view.phase : 'lobby', shell: 'player' };
  return { phase: 'home', shell: 'home' };
}

// The room is gone: the host ended the game, or it expired from inactivity. Nothing to resume.
const errorScreen = ({ title, line, icon = 'warning' }) => errorBody({ title, line, icon: ui(icon, 'is-big') });
function endedScreen(why) { return errorScreen({ ...(ENDED[why] || ENDED.expired), icon: 'cards' }); }

const connecting = (text) => `<main class="wrap"><div class="empty">${ui('cards')}<p>${text}</p></div></main>`;

function screen() {
  const lost = !S.conn && (S.mode === 'host' || S.mode === 'play');
  const banner = lost ? `<div class="banner${S.connLong ? ' banner-lost' : ''}" role="status"><span>${ui('wifi-off')} Reconnecting to the room…</span>${S.connLong ? errorButtons() : ''}</div>` : pausedBanner();
  if (S.fatal) return errorScreen(S.fatal);
  if (S.ended) return endedScreen(S.ended);
  if (S.mode === 'home') return home();
  if (S.mode === 'faq') return faqScreen();
  if (S.mode === 'local') return S.view ? hostScreen(S.view, true) : '';
  if (S.mode === 'host') return banner + (S.view ? hostScreen(S.view, false) : connecting('Connecting to your room…'));
  if (S.mode === 'play') {
    if (S.view?.kind === 'player') return banner + playerScreen(S.view);
    if (S.view?.kind === 'gone') return goneScreen();
    if (store.get(`mafia.player.${S.code}`)) return connecting('Connecting to the room…');
    return joinForm(S.code);
  }
  return '';
}

// The host changed an earlier step and a later one no longer fits: players keep the last confirmed game and wait;
// the host is told where it stopped and why (the fix sheet is PR E-3; until then Undo goes back to before the change).
function pausedBanner() {
  const h = S.mode === 'host' ? S.hist?.hold : null;
  if (h) return `<div class="banner" role="status"><span>Paused: ${esc(h.label)}. ${esc(h.why?.[0] || '')} Undo goes back to before the change.</span></div>`;
  if (S.mode === 'play' && S.paused && S.view?.kind === 'player') return '<div class="banner" role="status"><span>The host is fixing an earlier step. Hold on.</span></div>';
  return '';
}

let introDone = false;
// The first home paint rises in section by section (transform + opacity); every later render is plain.
const introOnce = () => { if (introDone) return ''; introDone = true; return ' home-intro'; };
function home() {
  const hostCodes = Object.keys(localStorage).filter((k) => k.startsWith('mafia.host.')).map((k) => k.slice(11));
  const playCodes = Object.keys(localStorage).filter((k) => k.startsWith('mafia.player.')).map((k) => k.slice(13));
  const intro = introOnce();
  return `<main class="wrap home${intro}">
    <a class="hub-link" href="https://gamenight.hatethespurs.com/">${ui('caret-down')}<span>All games</span></a>
    <div class="home-hero">
      <div class="card-fan" aria-hidden="true"><span class="rcard-back"><span class="rcard-back-mark">${ui('brand')}</span></span></div>
      <h1 class="wordmark">${wordmark()}</h1>
      <p class="lede">Night falls. Pick how your table plays.</p>
    </div>
    <div class="home-paths">
      <ul class="path-list" aria-label="How do you want to play?">
        <li class="path path-host"><button type="button" class="path-row" data-a="hostRow">${ui('phone', 'path-ico')}<span class="path-text"><b class="path-title">Host on phones</b><span class="muted">Everyone joins with a code. You run the night.</span></span>${ui('caret-down', 'path-go')}</button>
          ${hostCodes.map((c) => `<p class="resume-row"><a class="resume" href="#/host/${esc(c)}">Resume room <b class="code">${esc(c)}</b></a><button type="button" class="resume-x" data-a="forgetRoom" data-k="mafia.host.${esc(c)}" aria-label="Forget room ${esc(c)}">${ui('x')}</button></p>`).join('')}</li>
        <li class="path path-join"><details ${S.ui.draft.joinCode || playCodes.length ? 'open' : ''}><summary class="path-row">${ui('expand', 'path-ico')}<span class="path-text"><b class="path-title">Join a game</b><span class="muted">Got a code from the host?</span></span>${ui('caret-down', 'path-go')}</summary>
          <div class="join-row"><label class="field"><span>Code from the host</span><input class="code-input" data-i="joinCode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="6 letters" value="${esc(S.ui.draft.joinCode || '')}"></label>
          <button type="button" class="btn ghost" data-a="goJoin">Join</button></div>
          ${playCodes.map((c) => `<p class="resume-row"><a class="resume" href="#/play/${esc(c)}">Rejoin <b class="code">${esc(c)}</b></a><button type="button" class="resume-x" data-a="forgetRoom" data-k="mafia.player.${esc(c)}" aria-label="Forget room ${esc(c)}">${ui('x')}</button></p>`).join('')}</details></li>
        <li class="path path-local"><a class="path-row" href="#/local">${ui('cards', 'path-ico')}<span class="path-text"><b class="path-title">Play offline</b><span class="muted">One phone. Our cards, your own deck, or no cards.</span></span>${ui('caret-down', 'path-go')}</a></li>
      </ul>
      <a class="home-rules" href="#/faq"><span><b>Rules &amp; FAQ</b><small>Roles, play modes and tricky calls.</small></span>${ui('caret-down')}</a>
      ${suggestions()}
      <section class="home-how"><h2 class="home-how-title">How to Play</h2>
        <ol class="how">
          <li><h3>Deal</h3><p>Host a game on this screen. Players join with the room code, and each gets a secret role.</p></li>
          <li><h3>Night</h3><p>Everyone closes their eyes. The Host wakes each role in turn and taps their pick.</p></li>
          <li><h3>Day</h3><p>At dawn the app shows who died. The table talks, then votes someone out with a majority.</p></li>
          <li><h3>Win</h3><p>Town wins when every Mafia member and every other killer is gone. Mafia win when they match or outnumber everyone else.</p></li>
        </ol></section>
    </div>
    <div class="home-cta"><button type="button" class="btn big" data-a="hostLive">Host a game</button></div>
    ${siteFooter()}
  </main>`;
}

// Role search and team filter in the lobby catalogue. Typing doesn't re-render, so this filters in place.
function applyRoleSearch() {
  const q = S.ui.search.trim().toLowerCase();
  const tiles = document.querySelectorAll('.role-tile');
  let shown = 0;
  tiles.forEach((t) => { const on = !q || t.dataset.name.includes(q); t.hidden = !on; if (on) shown++; });
  document.querySelectorAll('.role-group').forEach((g) => { // a group shows while any of its variants match, and opens to show them
    const any = !!g.querySelector('.role-tile:not([hidden])'); g.hidden = !any; if (q && any) g.open = true;
  });
  // Type and team sections hide while none of their roles match, so a search never leaves a bare heading.
  document.querySelectorAll('.add-role-list .tg-sub, .add-role-list .side-group').forEach((sec) => { sec.hidden = !sec.querySelector('.role-tile:not([hidden])'); });
  const none = document.querySelector('.search-empty');
  if (none) none.hidden = !(tiles.length && !shown);
}

// ---------------- toast ----------------
let toastT;
S.toast = (m) => { $toast.textContent = themeText(String(m), themeOf(S.view), seatNames()); $toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.remove('on'), 3200); };

// ---------------- transports ----------------
function closeTransport() { closeVictory(); S.transport?.close?.(); S.transport = null; S.view = null; S.fatal = null; S.ended = null; S.conn = true; S.connLong = false; }

function wsTransport(code, helloFn) {
  let ws; let closed = false; let tries = 0; let timer; let longTimer;
  const open = () => {
    // Each socket's handlers check s === ws, so a socket abandoned by a wake-up reconnect can't schedule another one.
    const s = ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
    ws.onopen = () => { if (s !== ws) return s.close(); tries = 0; S.conn = true; S.connLong = false; clearTimeout(longTimer); longTimer = null; const h = helloFn(); if (h) ws.send(JSON.stringify(h)); S.render(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'view') {
        // A new deal (different role) starts face down, so a phone left showing the old role doesn't flash the new one.
        if (m.view?.kind === 'player' && S.view?.kind === 'player' && m.view.me?.role?.id !== S.view.me?.role?.id) { S.ui.reveal = false; if (m.view.me?.role) S.ui.anim = 'deal'; }
        const prev = S.view; if (isNewGame(prev, m.view)) newGameUi(m.view); if (m.view?.phase === 'over' && prev?.phase !== 'over') S.ui.anim = 'roles'; S.view = m.view; S.rev = m.rev; S.hist = m.hist || null; S.paused = !!m.paused; adoptNightUi(m.view); leftOver(prev, m.view); if (m.view?.kind === 'player' && m.view.me?.alive) S.graveyard = null; autoDeclare(prev, m.view); S.render(); observe(prev, m.view);
      }
      else if (m.type === 'graveyard') { S.graveyard = m.entries; S.render(); }
      else if (m.type === 'gameOver') showVictory(m); // sent by the room to every connected client at once
      else if (m.type === 'error') S.toast(m.error);
      else if (m.type === 'stepped') stepped(m);
      else if (m.type === 'changed') S.toast(m.host ? m.label : 'The host changed an earlier step');
      else if (m.type === 'paused') S.toast(m.error);
      else if (m.type === 'joined') store.set(`mafia.player.${code}`, JSON.stringify({ playerId: m.playerId, token: m.token }));
      else if (m.type === 'closed') { closed = true; store.del(`mafia.host.${code}`); store.del(`mafia.player.${code}`); applyClosed(m, S.mode, closeVictory); S.render(); }
      else if (m.type === 'fatal') { closed = true; if (m.clear) { store.del(`mafia.player.${code}`); S.view = null; S.toast(m.error); S.render(); } else { S.fatal = FATAL.closed; S.render(); } }
    };
    ws.onclose = () => { if (closed || s !== ws) return; S.conn = false; if (!longTimer) { longTimer = setTimeout(() => { if (!S.conn && !closed) { S.connLong = true; S.render(); } }, 20000); } S.render(); timer = setTimeout(open, Math.min(8000, 400 * 2 ** tries++)); };
  };
  open();
  // Phone back (screen on, app switched back, signal back): reconnect now instead of waiting up to 8 s for the timer.
  const stopWake = wakeReconnect({ getSocket: () => ws, isStopped: () => closed, reconnect: () => { clearTimeout(timer); tries = 0; open(); } });
  return {
    send: (a) => { if (ws?.readyState === 1) ws.send(JSON.stringify(a)); else S.toast('Not connected to the room yet. Try again in a moment.'); },
    close: () => { closed = true; stopWake(); clearTimeout(timer); clearTimeout(longTimer); ws?.close(); },
  };
}

// ---------- back and forward ----------
// The room keeps the Host's night picks (nightUi). A view brings them back after a reload, an Undo or on a second
// Host phone. Picks this phone sent that the room hasn't echoed yet (a higher seq) are not overwritten.
function adoptNightUi(v) {
  if (v?.kind !== 'host' || v.phase !== 'night') return;
  const s = v.nightUi;
  if (s && s.n === v.night) { if ((s.seq || 0) >= (S.nightSeq || 0)) { S.ui.night = structuredClone(s); S.nightSeq = s.seq || 0; } }
  else if (!S.nightSeq && S.ui.night.n === v.night) S.ui.night = { n: v.night, actions: {}, picks: {}, acked: {}, opened: S.ui.night.opened };
}
// The Host's night screen changed on this phone: keep it in the room.
function syncNight() {
  if (!['host', 'local'].includes(S.mode) || S.view?.phase !== 'night') return;
  S.nightSeq = (S.nightSeq || 0) + 1;
  send({ type: 'nightUi', ui: { ...S.ui.night, seq: S.nightSeq } });
}
// Undo past the end screen: the victory card closes and every role is hidden again.
function leftOver(prev, v) { if (prev?.phase === 'over' && v && v.phase !== 'over') closeVictory(); }
function stepped(m) {
  if (m.host) return S.toast(`${m.dir === 'undo' ? 'Undid' : 'Redid'}: ${m.label}`);
  if (NOTIFY_ON_UNDO) S.toast(m.dir === 'undo' ? 'The host went back a step' : 'The host went forward a step');
}

// A restarted game (same code, new gameNo): forget everything tied to the old game; the stored player token still works.
function newGameUi(next) {
  closeVictory();
  Object.assign(S.ui, { night: { n: 0, actions: {}, picks: {} }, checkCard: null, checkSeen: {}, reveal: false, endConfirm: false, restartConfirm: false, condemn: null, declare: false, gy: false, tab: 'game', sheet: null, settings: false, anim: 'restart' });
  S.graveyard = null; S.gyShown = 0;
  if (next?.kind === 'player') S.toast('New game started');
}

// Cult + Serial Killer stalemate: open the Host's Declare a winner sheet once, the moment it starts.
function autoDeclare(prev, view) {
  if (view?.kind === 'host' && view.stalemate && !prev?.stalemate) { S.ui.declare = true; S.ui.anim = 'modal'; }
  if (!view?.stalemate && prev?.stalemate) S.ui.declare = false;
}

function localTransport() {
  const KEY = 'mafia.local', LOG_KEY = 'mafia.local.log';
  let room;
  try { room = migrateRoleIds(JSON.parse(store.get(KEY) || 'null')); } catch { room = null; }
  if (!room) { room = newRoom('LOCAL', 'local'); room.config.mode = 'cards'; }
  // The same event log as the room server: Undo and Redo on this device, kept across a reload when it fits.
  let log = null;
  try { const j = JSON.parse(store.get(LOG_KEY) || 'null'); if (j) { const g = GameLog.restore(j); if (JSON.stringify(migrateRoleIds(g.room)) === JSON.stringify(room)) log = g; } } catch { log = null; }
  if (!log) log = new GameLog(room);
  room = log.room;
  const fresh = () => { const r = newRoom('LOCAL', 'local'); r.config.mode = 'cards'; log = new GameLog(r); room = log.room; };
  const emit = (stepMsg) => {
    store.set(KEY, JSON.stringify(room)); registerRoles(room.config.customRoles);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log.toJSON())); } catch { store.del(LOG_KEY); } // too big for this browser: Undo still works until a reload
    const prev = S.view; const next = viewForHost(room, new Set()); if (isNewGame(prev, next)) newGameUi(next); S.view = next; S.rev = log.rev; S.hist = log.history(); adoptNightUi(next); leftOver(prev, next); autoDeclare(prev, S.view); S.render(); observe(prev, S.view);
    if (stepMsg) stepped(stepMsg);
    if (prev && prev.phase !== 'over' && room.phase === 'over') showVictory(gameOverEvent(room)); // single device: no server to announce it
  };
  setTimeout(emit, 0);
  return {
    send(a) {
      if (a.type === 'resetLocal') { fresh(); emit(); return; }
      if (a.type === 'undo' || a.type === 'redo') {
        const label = a.type === 'undo' ? log.undoStep() : log.redoStep();
        if (label === null) return S.toast(a.type === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
        room = log.room; emit({ dir: a.type, label, host: true }); return;
      }
      const r = log.apply({ host: true }, a, Date.now()); room = log.room;
      if (r.error) S.toast(r.error);
      else if (r.data?.skipped?.length) S.toast(`Skipped: ${r.data.skipped.join(', ')}`);
      if (r.data?.error) S.toast(r.data.error);
      emit();
    },
    close() {},
  };
}

// ---------------- routing ----------------
async function route() {
  closeTransport();
  closeVictory();
  hold.cancel();
  S.graveyard = null; S.gyShown = 0;
  Object.assign(S.ui, { setupKey: null, gy: false, tab: 'game', sheet: null, reveal: false, showKey: false, showCode: false, showQr: false, addRole: false, tools: false, votes: {}, picked: null, modal: null, claim: null, claimSuit: null, anim: null });
  const h = location.hash.replace(/^#\/?/, '');
  const [kind, arg] = h.split('/');
  S.code = null;
  if (kind === 'local') { S.mode = 'local'; S.transport = localTransport(); S.send = (a) => S.transport.send(a); }
  else if (kind === 'host' && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = 'host'; S.code = arg.toUpperCase();
    const key = store.get(`mafia.host.${S.code}`);
    if (!key) { S.fatal = FATAL.notHost; }
    else { S.transport = wsTransport(S.code, () => ({ type: 'hello', hostKey: key })); S.send = (a) => S.transport.send(a); }
  } else if ((kind === 'play' || kind === 'join') && /^[A-Za-z]{6}$/.test(arg || '')) {
    S.mode = 'play'; S.code = arg.toUpperCase();
    const ex = await fetch(`/api/room/${S.code}`).then((r) => r.ok).catch(() => false);
    if (!ex) { S.fatal = FATAL.noRoom(S.code); }
    else {
      S.transport = wsTransport(S.code, () => { try { const c = JSON.parse(store.get(`mafia.player.${S.code}`) || 'null'); return c ? { type: 'hello', ...c } : null; } catch { return null; } });
      S.send = (a) => S.transport.send(a);
    }
  } else if (kind === 'faq') S.mode = 'faq';
  else {
    S.mode = 'home';
    // Drop resume links for rooms that have closed.
    for (const k of Object.keys(localStorage).filter((x) => x.startsWith('mafia.host.') || x.startsWith('mafia.player.'))) {
      const code = k.slice(k.lastIndexOf('.') + 1);
      fetch(`/api/room/${code}`).then((r) => { if (!r.ok) { store.del(k); if (S.mode === 'home') S.render(); } }).catch(() => {});
    }
  }
  // Every new screen opens at the top (a player's hand shows the face-down card first).
  window.scrollTo(0, 0); S.ui.toTop = true; S.ui.handKey = null;
  S.render();
}
window.addEventListener('hashchange', route);
// The browser must not put back an old scroll position on reload or Back: the app decides (see paintScreen).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';


// ---------------- role tooltip (hover, focus or tap the "i") ----------------
const $tip = document.getElementById('tip') || document.createElement('div');
$tip.id = 'tip'; $tip.setAttribute('role', 'tooltip');
if (!$tip.isConnected) document.body.appendChild($tip);
// Where the Popover API exists the tip lives in the top layer (above sheets and dialogs); elsewhere it is the same fixed div.
const POP = typeof $tip.showPopover === 'function';
if (POP) $tip.setAttribute('popover', 'manual');
function hideTip() { $tip.classList.remove('on'); $tip.dataset.for = ''; if (POP) try { $tip.hidePopover(); } catch { /* not open */ } }
function showTip(el) {
  const r = ROLE_BY_ID[el.dataset.id];
  if (!r) return;
  if (POP) try { if (!$tip.matches(':popover-open')) $tip.showPopover(); } catch { /* already open */ }
  const uses = (n) => (n === 1 ? 'once per game' : `${n} times per game`);
  const bits = [];
  if (r.action) bits.push(`<p><b>Night:</b> ${esc(r.action.prompt)}${Number.isFinite(r.action.uses) ? ` <span class="muted">(${uses(r.action.uses)})</span>` : ''}</p>`);
  if (r.meeting === 'mafia') bits.push('<p>Joins the Mafia night meeting.</p>');
  if (r.day) bits.push(`<p><b>Day:</b> ${esc(r.day)}</p>`);
  if (r.onDeath) bits.push(`<p><b>On death:</b> ${esc(r.onDeath)}</p>`);
  if (r.onCondemn) bits.push(`<p><b>If condemned:</b> ${esc(r.onCondemn)}</p>`);
  if (r.night1) bits.push(`<p><b>Night 1:</b> ${esc(r.night1)}</p>`);
  if (r.seesAs) bits.push(`<p><b>Thinks they are:</b> ${esc(ROLE_BY_ID[r.seesAs]?.name || r.seesAs)}</p>`);
  if (r.appearsAs) bits.push(`<p><b>A Detective sees:</b> ${r.appearsAs === 'mafia' ? 'MAFIA' : 'NOT MAFIA'}</p>`);
  $tip.innerHTML = `<div class="tip-h"><span class="tip-glyph a-${r.alignment}">${ico(r)}</span><b>${esc(r.name)}</b><span class="team-tag a-${r.alignment}"><i class="team-mark a-${r.alignment}"></i>${teamName(r.alignment)}</span></div><p>${esc(r.blurb)}</p>${bits.join('')}`;
  themeDom($tip, themeOf(S.view), seatNames());
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

// Leave any focused field so the render deferred while typing flushes once a submit has been triggered.
const leaveField = () => { const a = document.activeElement; if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur(); };

const A = {
  openGy() { S.ui.gy = true; S.ui.anim = 'sheet'; S.render(); setTimeout(scrollGraveyard, 0); },
  closeGy() { S.ui.gy = false; S.render(); },
  gySend() {
    const el = $app.querySelector('[data-i="gyText"]'); const text = (el?.value || '').trim();
    if (!text) return;
    send({ type: 'chat', channel: 'graveyard', text });
    if (el) el.value = ''; S.ui.draft.gyText = '';
    setTimeout(scrollGraveyard, 0);
  },
  hostRow() { return A.hostLive(); },
  async hostLive() {
    leaveField();
    const res = await fetch('/api/create', { method: 'POST' }).then((r) => r.json()).catch(() => null);
    if (!res?.code) return S.toast('Couldn’t create a room. Check your connection and try again.');
    store.set(`mafia.host.${res.code}`, res.hostKey);
    location.hash = `#/host/${res.code}`;
  },
  goJoin() { leaveField(); const c = (S.ui.draft.joinCode || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c.length !== 6) return S.toast('Room codes have 6 letters.'); location.hash = `#/join/${c}`; },
  join() { leaveField(); const n = (S.ui.draft.joinName || '').trim(); if (!n) return S.toast('Type your name to join.'); S.transport?.send({ type: 'hello', join: n }); },
  tab(el) { S.ui.tab = el.dataset.v; S.render(); window.scrollTo(0, 0); },
  side(el) { S.ui.sideTab = el.dataset.v; S.render(); },
  toggleUi(el) { const k = el.dataset.k; S.ui[k] = !S.ui[k]; S.render(); },
  copy(el) { navigator.clipboard?.writeText(el.dataset.v).then(() => S.toast('Join link copied'), () => S.toast(el.dataset.v)); },
  // lobby
  addNames() {
    const names = (S.ui.draft.names || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) return S.toast('Type at least one name first.'); S.ui.draft.names = ''; S.ui.addFlush = true; send({ type: 'addPlayers', names });
  },
  rmPlayer(el) { send({ type: 'removePlayer', playerId: el.dataset.id }); },
  cfg(el) { send({ type: 'setConfig', [el.dataset.k]: el.dataset.v }); },
  suggest() { markCustom(); S.ui.deckShown = []; syncLibrary(); send({ type: 'suggestRoles' }); },
  rebalance() { markCustom(); const roles = S.view?.config?.roles || []; if (roles.length) send({ type: 'setConfig', roles: rebalance(roles) }); },
  clearRoles() { markCustom(); S.ui.deckShown = []; send({ type: 'setConfig', roles: [] }); },
  addRole(el) { markCustom(); syncLibrary(); send({ type: 'setConfig', roles: [...S.view.config.roles, el.dataset.id] }); },
  subRole(el) { markCustom(); const r = [...S.view.config.roles]; const i = r.lastIndexOf(el.dataset.id); if (i >= 0) r.splice(i, 1); send({ type: 'setConfig', roles: r }); },
  roleTeam(el) { S.ui.roleTeam = el.dataset.v; S.render(); },
  info(el) { if ($tip.dataset.for === el.dataset.id && $tip.classList.contains('on')) hideTip(); else showTip(el); },
  deal() { syncLibrary(); send({ type: 'deal' }); },
  setupDeal2(el) {
    const p = setupDealProblem(); if (p) return S.toast(p.reason);
    // One phone: every seat plays here, so seats on their own phones move to this phone before the roles are dealt.
    if (S.mode === 'host' && seatingOf(S.ui.setup, S.view.players) === 'one') for (const q of S.view.players) if (!q.offline) send({ type: 'seatWhere', playerId: q.id, where: 'local' });
    A.deal();
  },
  undeal() { send({ type: 'undeal' }); },
  showKey() { S.ui.showKey = true; S.ui.anim = 'modal'; S.render(); },
  closeCheck() { S.ui.checkCard = null; S.render(); },
  showCheck(el) {
    const s = S.view?.script?.find((x) => x.key === el.dataset.key);
    const c = s && S.ui.night.actions[s.key] && S.view.story && checkCardFor(s);
    if (c) { S.ui.checkCard = c; S.render(); }
  },
  hideKey() { S.ui.showKey = false; S.render(); },
  resetLocal() { if (confirm('Remove every player and role and start a fresh game on this device?')) { S.ui.deckShown = []; S.ui.night = { n: 0, actions: {}, picks: {} }; send({ type: 'resetLocal' }); } },
  leaveGame() {
    if (!confirm('Leave this game on this phone? You can join again with the room code, but the Host may need to remove your old seat.')) return;
    store.del(`mafia.player.${S.code}`); location.hash = '#/';
  },
  showCode() { S.ui.showCode = true; S.ui.anim = 'modal'; S.render(); },
  hideCode() { S.ui.showCode = false; S.render(); },
  showQr() { S.ui.showCode = false; S.ui.showQr = true; S.ui.anim = 'modal'; S.render(); },
  hideQr() { S.ui.showQr = false; S.render(); },
  // The system share sheet where there is one; otherwise (and if it fails) the link is copied.
  async share(el) {
    const url = el.dataset.v;
    try { await navigator.share({ title: 'Mafia Night', text: 'Join my Mafia Night game', url }); }
    catch (e) { if (e?.name !== 'AbortError') A.copy(el); }
  },
  clearCard(el) { send({ type: 'clearCard', playerId: el.dataset.id }); },
  upgradeNight(el) { send({ type: 'upgradeNight', off: el.dataset.off === '1' }); },
  startNight() { S.ui.condemn = null; send({ type: 'startNight' }); },
  startDay() { send({ type: 'startDay' }); },
  rule(el) { if (el.getAttribute('aria-disabled') === 'true') return S.toast(el.dataset.why); const k = el.dataset.k; const cur = { ...DEFAULT_RULES, ...(S.view?.config?.rules || {}) }; send({ type: 'setConfig', rules: { [k]: !cur[k] }, revealPolicy: REVEAL_POLICY }); },
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
      if (next.length >= need) { n.actions[key] = { targets: next.slice(0, need) }; if (step.check === 'random') Object.assign(n.actions[key], { flip: flipCoin(), flipAt: Date.now() }); delete n.picks[key]; n.focus = key; } else n.picks[key] = next;
    }
    syncNight(); S.render();
  },
  focusStep(el) { S.ui.night.focus = el.dataset.key; S.render(); },
  confirmId(el) { S.ui.night.focus = null; const key = el.dataset.key; const ids = S.ui.night.picks[key] || []; delete S.ui.night.picks[key]; send({ type: 'identifyRole', roleId: el.dataset.role, playerIds: ids }); },
  skip(el) { S.ui.night.focus = el.dataset.key; S.ui.night.actions[el.dataset.key] = { targets: [] }; delete S.ui.night.picks[el.dataset.key]; syncNight(); S.render(); },
  skipIdentify(el) { const n = S.ui.night; n.focus = null; delete n.picks[el.dataset.key]; send({ type: 'skipIdentify', roleId: el.dataset.role }); },
  nextStep(el) {
    if (el.getAttribute('aria-disabled') === 'true') return S.toast(el.dataset.why);
    const r = pressNext(S.view, S.ui.night);
    if (r.blocked) return S.toast(r.blocked);
    if (r.send) return send(r.send.type === 'submitNight' ? { ...r.send, n: S.view.night } : r.send);
    syncNight(); S.render(); // followCue() scrolls to the next step
  },
  alert(el) { const n = S.ui.night; const k = el.dataset.key; n.actions[k] = { on: el.dataset.v === '1', targets: [] }; n.focus = k; syncNight(); S.render(); },
  startCalls() { S.ui.night.opened = true; syncNight(); S.render(); },
  infoDone(el) { const n = S.ui.night; const k = el.dataset.key; n.actions[k] = { done: true }; n.focus = k; syncNight(); S.render(); },
  undoStep(el) { delete S.ui.night.actions[el.dataset.key]; S.ui.night.focus = el.dataset.key; syncNight(); S.render(); },
  // Back and forward: one Host step on the room's event log, the same on every phone.
  undo(el) {
    if (el?.getAttribute('aria-disabled') === 'true') return S.toast(el.dataset.why);
    if (S.view?.phase === 'over' && UNDO_PAST_GAME_OVER) { S.ui.undoOverConfirm = true; S.ui.anim = 'modal'; return S.render(); }
    S.nightSeq = 0; send({ type: 'undo', rev: S.rev });
  },
  undoOverYes() { S.ui.undoOverConfirm = false; S.nightSeq = 0; send({ type: 'undo', rev: S.rev }); S.render(); },
  undoOverNo() { S.ui.undoOverConfirm = false; S.render(); },
  redo(el) { if (el?.getAttribute('aria-disabled') === 'true') return S.toast(el.dataset.why); S.nightSeq = 0; send({ type: 'redo', rev: S.rev }); },
  // A coin flip for results that are random by design; kept with the step so the morning report says the same thing.
  coin(el) {
    const set = S.ui.night.actions[el.dataset.key]; if (!set) return;
    set.coin = crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'mafia' : 'innocent'; syncNight();
    S.toast(set.coin === 'mafia' ? 'Heads: say MAFIA.' : 'Tails: say NOT Mafia.'); S.render();
  },
  resolve() { send({ type: 'submitNight', actions: S.ui.night.actions, n: S.view.night }); },
  // day
  selCondemn(el) { S.ui.condemn = S.ui.condemn === el.dataset.id ? null : el.dataset.id; S.render(); },
  dayTalk() { setDayStage({ stage: 'talk', minutes: TALK_MINUTES, startedAt: Date.now() }); },
  talkAdj(el) { const d = S.ui.dayStage; if (d?.stage === 'talk') setDayStage({ ...d, minutes: clampMinutes(d.minutes + Number(el.dataset.v)) }); },
  talkSkip() { setDayStage({ stage: 'vote', talkDone: talkDoneText({ skipped: true }) }); },
  dayVote() { // the Next from the talk step: the minutes used go into the timeline
    const d = S.ui.dayStage?.day === S.view.day ? S.ui.dayStage : null;
    setDayStage(d?.stage === 'talk' ? { stage: 'vote', talkDone: talkDoneText({ timed: !!S.view.advanced?.dayTimer, startedAt: d.startedAt, now: Date.now() }) } : { stage: 'vote' });
  },
  condemn() { if (!S.ui.condemn) return; const id = S.ui.condemn; const name = S.view.players.find((p) => p.id === id)?.name || 'They'; S.ui.condemn = null; S.ui.dayResult = { day: S.view.day, text: `${name} was voted out` }; buzz([30, 40, 30]); send({ type: 'condemn', playerId: id }); },
  noCondemn() { S.ui.condemn = null; S.ui.dayResult = { day: S.view.day, text: 'No one was voted out' }; send({ type: 'noCondemn' }); },
  seeRoles() { markRolesSeen(S.view); S.render(); },
  roleRules(el) { S.ui.rolesOpen = S.ui.rolesOpen === el.dataset.v ? null : el.dataset.v; S.render(); },
  pend(el) { send({ type: 'resolvePending', pendingId: el.dataset.pid, targetId: el.dataset.id || null }); },
  useDay(el) { send({ type: 'useDay', playerId: el.dataset.id }); },
  declare() { S.ui.declare = true; S.ui.anim = 'modal'; S.render(); },
  closeDeclare() { S.ui.declare = false; S.render(); },
  declareSide(el) {
    const side = el.dataset.v; S.ui.declare = false;
    const reason = S.view?.stalemate ? 'Only the Cult and the Serial Killer were left. The Host decided.' : 'Declared by the Host.';
    send({ type: 'declareWinner', side, reason });
  },
  playAgain() { closeVictory(); S.ui.night = { n: 0, actions: {}, picks: {} }; send({ type: 'playAgain' }); },
  restart() { S.ui.restartConfirm = false; S.ui.settings = false; send({ type: 'restart' }); },
  restartSetup() { S.ui.restartConfirm = false; S.ui.settings = false; send({ type: 'restart', setup: true }); },
  restartAsk() { S.ui.settings = false; S.ui.restartConfirm = true; S.ui.anim = 'modal'; S.render(); },
  restartNo() { S.ui.restartConfirm = false; S.render(); },
  closeVictory() { closeVictory(); S.ui.anim = 'roles'; S.render(); },
  openAddRole() { S.ui.addRole = true; S.ui.anim = 'sheet'; S.render(); },
  closeAddRole() { S.ui.addRole = false; S.render(); },
  menuOpen(el) { S.ui.settings = false; ({ tools: () => A.tools(), gy: () => A.openGy(), roles: () => A.openRoles() })[el.dataset.v]?.(); },
  ...HOST_HELP_ACTIONS,
  openRoles() { S.ui.roles = true; S.ui.anim = 'sheet'; S.render(); },
  closeRoles() { S.ui.roles = false; S.ui.rolesOpen = null; S.render(); },
  openSettings() { S.ui.settings = true; S.ui.anim = 'modal'; S.render(); },
  closeSettings() { S.ui.settings = false; S.render(); },
  endGameAsk() { S.ui.settings = false; S.ui.endConfirm = true; S.ui.anim = 'modal'; S.render(); },
  endGameNo() { S.ui.endConfirm = false; S.render(); },
  endGameYes() { S.send({ type: 'endGame' }); S.ui.endConfirm = false; S.render(); },
  forgetRoom(el) { store.del(el.dataset.k); S.render(); },
  toggleAnim() { setAnim(!animOn()); S.render(); },
  newGame() { if (S.view.phase === 'over' || confirm('Abandon this game and go back to setup?')) { S.ui.night = { n: 0, actions: {}, picks: {} }; send({ type: 'newGame' }); } },
  // board
  seat(el) { if (S.mode === 'play') return; S.ui.anim = S.ui.sheet ? null : 'sheet'; S.ui.sheet = el.dataset.id; S.render(); },
  // One place round the table. At the ends the first and last seats swap, so nobody else shifts.
  moveSeat(el) {
    const ps = S.view.players; const n = ps.length; const i = ps.findIndex((p) => p.id === el.dataset.id);
    if (i < 0 || n < 2) return;
    const j = (i + Number(el.dataset.v) + n) % n;
    if (Math.abs(j - i) === 1) return moveSeat(ps[i].id, j);
    const other = ps[j].id; moveSeat(ps[i].id, j); moveSeat(other, i);
  },
  closeSheet() { S.ui.sheet = null; S.render(); },
  tag(el) { send({ type: 'toggleTag', playerId: el.dataset.id, tag: el.dataset.c }); },
  killp(el) { send({ type: 'kill', playerId: el.dataset.id, cause: 'host' }); },
  revive(el) { send({ type: 'revive', playerId: el.dataset.id }); },
  rename(el) { const n = prompt('New name'); if (n) send({ type: 'renamePlayer', playerId: el.dataset.id, name: n }); },
  legend(el) { const c = el.dataset.c; const n = prompt('What does this color mean?', S.view.config.legend[c]); if (n !== null) send({ type: 'setLegend', color: c, label: n }); },
  // player
  pickSuit(el) { const v = el.dataset.v || null; S.ui.claimSuit = v; if (suitOf(S.ui.claim) !== v) S.ui.claim = null; S.render(); },
  pickCard(el) { S.ui.claim = el.dataset.v; S.ui.claimSuit = suitOf(el.dataset.v); S.render(); },
  claim() { if (S.ui.claim) send({ type: 'claimCard', card: S.ui.claim }); },
};
// The day step on the Host's phone, saved so a refresh comes back to it.
function setDayStage(next) {
  S.ui.dayStage = { ...next, day: S.view.day }; saveDayStage(store, S.view.code, S.view.gameNo, S.ui.dayStage); S.render();
}
Object.assign(A, TOOL_ACTIONS, SETUP_ACTIONS, SEAT_ACTIONS);
wireSetupGestures();
setInterval(tickTools, 500);

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

// ---------------- seat drag and drop (host) ----------------
// Drag a seat round the table, or a row of the crowded seat list, to change where someone sits. The drag
// starts after 8px so a tap still opens the seat panel. Renders wait for the drop (see S.render). Touch on
// the list needs a short hold first, so the list still scrolls; the seat panel's Move buttons do the rest.
let drag = null; let swallowClick = null; // the one click the browser fires at the end of a drag
function moveSeat(id, to) {
  const ps = S.view?.players || []; const from = ps.findIndex((p) => p.id === id);
  if (from < 0 || to < 0 || to === from) return;
  const next = [...ps]; next.splice(to, 0, ...next.splice(from, 1));
  S.view = { ...S.view, players: next }; // reorder now so the seat doesn't jump back while the room answers
  send({ type: 'moveSeat', playerId: id, toIndex: to });
  S.render();
}
function dragOn() {
  const d = drag; if (!d || d.on) return;
  clearTimeout(d.hold); d.hold = null; d.on = true;
  try { d.el.setPointerCapture(d.pid); } catch { /* synthetic or finished pointer */ }
  const box = d.el.closest(d.list ? '.seatlist' : '.table');
  d.area = box.getBoundingClientRect();
  d.slots = [...box.querySelectorAll(d.list ? '.seatrow' : '.seat')].map((el) => {
    const b = el.getBoundingClientRect(); return { el, x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  d.el.classList.add('is-dragging');
  $html.classList.add('is-seat-dragging');
}
function dragEnd(drop) {
  const d = drag; if (!d) return;
  drag = null; clearTimeout(d.hold);
  $html.classList.remove('is-seat-dragging');
  if (d.on) {
    clearTimeout(swallowClick); swallowClick = setTimeout(() => { swallowClick = null; }, 0);
    d.el.classList.remove('is-dragging'); d.el.style.removeProperty('--dx'); d.el.style.removeProperty('--dy');
    d.target?.classList.remove('is-drop');
    if (drop && d.target) moveSeat(d.id, S.view.players.findIndex((p) => p.id === d.target.dataset.id));
  }
  if (pendingRender) setTimeout(() => { if (pendingRender && !drag) S.render(); }, 0);
}
document.addEventListener('pointerdown', (ev) => {
  if (drag) dragEnd(false);
  if (!ev.isPrimary || ev.button !== 0 || S.mode === 'play') return;
  const el = ev.target.closest?.('.board[data-host="1"] .seat, .board[data-host="1"] .seatrow');
  if (!el) return;
  const list = el.classList.contains('seatrow');
  drag = { el, list, id: el.dataset.id, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, on: false, target: null,
    hold: list && ev.pointerType !== 'mouse' ? setTimeout(dragOn, 350) : null };
});
document.addEventListener('pointermove', (ev) => {
  const d = drag; if (!d || ev.pointerId !== d.pid) return;
  const dx = ev.clientX - d.x0; const dy = ev.clientY - d.y0;
  if (!d.on) {
    if (Math.hypot(dx, dy) < 8) return;
    if (d.hold) return dragEnd(false); // moved before the hold: the list is being scrolled
    dragOn();
  }
  ev.preventDefault();
  d.el.style.setProperty('--dx', `${dx}px`); d.el.style.setProperty('--dy', `${dy}px`);
  // Land on the nearest seat centre, or nowhere once the pointer leaves the table.
  const a = d.area; const x = ev.clientX; const y = ev.clientY;
  let best = null; let bestD = Infinity;
  if (x > a.left - 40 && x < a.right + 40 && y > a.top - 40 && y < a.bottom + 40) {
    for (const s of d.slots) { const dist = Math.hypot(s.x - x, s.y - y); if (dist < bestD) { bestD = dist; best = s.el; } }
  }
  const target = best && best !== d.el ? best : null;
  if (target !== d.target) { d.target?.classList.remove('is-drop'); target?.classList.add('is-drop'); d.target = target; }
});
document.addEventListener('pointerup', (ev) => { if (drag && ev.pointerId === drag.pid) dragEnd(true); });
document.addEventListener('pointercancel', (ev) => { if (drag && ev.pointerId === drag.pid) dragEnd(false); });
document.addEventListener('touchmove', (ev) => { if (drag?.on) ev.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (ev) => { if (drag?.list) ev.preventDefault(); });
// The click that follows a drop is not a tap on the seat.
document.addEventListener('click', (ev) => { if (swallowClick) { clearTimeout(swallowClick); swallowClick = null; ev.preventDefault(); ev.stopPropagation(); } }, true);

// ---------------- keyboard ----------------
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && drag) { dragEnd(false); return; }
  if (ev.key === 'Escape' && deathCardOpen()) { closeDeathCard(); return; }
  if (ev.key === 'Escape' && S.ui.checkCard) { A.closeCheck(); return; }
  if (ev.key === 'Escape' && victoryOpen()) { A.closeVictory(); return; }
  if (ev.key === 'Escape') {
    // Renders are deferred while a field has focus, so leave the field first or the dialog would stay open.
    if ((S.ui.tools || S.ui.roles || S.ui.gy || S.ui.showKey || S.ui.showCode || S.ui.showQr || S.ui.addRole || S.ui.modal || S.ui.sheet || S.ui.setup?.sheet || S.ui.seatSheet) && $app.contains(document.activeElement)) { pendingRender = false; document.activeElement.blur(); }
    if (hostHelpOpen()) { S.ui.hhWalk ? A.hhSkip() : A.closeHostHelp(); return; }
    if (S.ui.roles) { A.closeRoles(); return; }
    if (S.ui.gy) { A.closeGy(); return; }
    if (S.ui.showKey) { A.hideKey(); return; }
    if (S.ui.tools) { A.closeTools(); return; }
    if (S.ui.addRole) { A.closeAddRole(); return; }
    if (S.ui.seatSheet) { A.seatClose(); return; }
    if (S.ui.pass?.id && S.ui.pass.stage && (S.mode === 'host' || S.mode === 'local')) { A.passSkip(); return; }
    if (S.ui.setup?.sheet) { A.setupSheetClose(); return; }
    if (S.ui.showCode) { A.hideCode(); return; }
    if (S.ui.showQr) { A.hideQr(); return; }
    if (S.ui.modal) { A.closeModal(); return; }
    if (S.ui.undoOverConfirm) { A.undoOverNo(); return; }
    if (S.ui.endConfirm) { A.endGameNo(); return; }
    if (S.ui.restartConfirm) { A.restartNo(); return; }
    if (S.ui.declare) { A.closeDeclare(); return; }
    if (S.ui.sheet) { const id = S.ui.sheet; A.closeSheet(); refocus(`[data-a="seat"][data-id="${CSS.escape(id)}"]`, ''); return; }
    return;
  }
  // Enter in the home code field and the join name field submits.
  if (ev.key === 'Enter' && ev.target.dataset?.i === 'gyText' && !ev.isComposing) { ev.preventDefault(); A.gySend(); return; }
  if (ev.key === 'Enter' && ev.target.dataset?.i === 'names') { ev.preventDefault(); A.addNames(); return; }
  if (ev.key === 'Enter' && ev.target.dataset?.i === 'joinCode') { ev.preventDefault(); A.goJoin(); return; }
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

wireFaqSearch(document);
document.addEventListener('input', (ev) => {
  const el = ev.target; const i = el.dataset.i; if (!i) return;
  if (i === 'names') S.ui.draft.names = el.value;
  else if (i === 'gyText') S.ui.draft.gyText = el.value;
  else if (i === 'presetName') S.ui.draft.presetName = el.value;
  else if (i === 'seatName') S.ui.draft.seatName = el.value;
  else if (i === 'joinName') S.ui.draft.joinName = el.value;
  else if (i === 'joinCode') S.ui.draft.joinCode = el.value.toUpperCase();
  else if (i === 'search') { S.ui.search = el.value; applyRoleSearch(); }
  else if (i === 'note') send({ type: 'setNote', playerId: el.dataset.id, note: el.value });
  else if (i === 'myNotes' && S.view?.me) store.set(notesKey(S.view), el.value);
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

// Sending to the Graveyard keeps the keyboard up: the button must not take focus from the input.
document.addEventListener('pointerdown', (ev) => { if (ev.target.closest?.('[data-a="gySend"]')) ev.preventDefault(); });

// ---------------- private role card: hold to reveal ----------------
document.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest?.('[data-hold]');
  if (!b || !ev.isPrimary || ev.button > 0) return;
  ev.preventDefault();
  try { b.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
  hold.press();
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(t, () => { if (hold.pressed) endHold(); });
document.addEventListener('keydown', (ev) => {
  if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.closest?.('[data-hold]')) { ev.preventDefault(); if (!ev.repeat) hold.press(); }
});
document.addEventListener('keyup', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && hold.pressed) endHold(); });
document.addEventListener('contextmenu', (ev) => { if (ev.target.closest?.('[data-hold]')) ev.preventDefault(); });
document.addEventListener('focusout', (ev) => { if (ev.target.closest?.('[data-hold]') && hold.pressed) endHold(); });
// Anything that takes the screen away from the card blurs it at once.
document.addEventListener('visibilitychange', () => { if (document.hidden) endHold(true); });
addEventListener('pagehide', () => endHold(true));
addEventListener('blur', () => endHold(true));

route();
