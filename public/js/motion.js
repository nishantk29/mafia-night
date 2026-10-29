// Step transitions, the game wake lock and scroll reveals. Everything is feature-detected and skipped when
// animations are off (prefers-reduced-motion or the in-app toggle, both folded into animOn()).
import { S } from './state.js';
import { animOn, dur } from './fx.js';
import { nightNav } from './night-nav.js';
export { dur };

const $html = document.documentElement;
const hasVT = () => typeof document.startViewTransition === 'function';

// What counts as "a step": changing it slides the main column. Picking a name or typing never does.
export function stepKey() {
  const v = S.view; const n = S.ui.night;
  if (S.mode === 'host' || S.mode === 'local') {
    if (!v) return `${S.mode}:wait`;
    // The step is the card on screen: tapping a name or Undo keeps it, Next (or the room confirming a step) moves on.
    if (v.phase === 'night') { let cur = ''; try { cur = nightNav(v, n || {}).current?.key || ''; } catch { /* no script yet */ } return `${S.mode}:night${v.night}:${cur}`; }
    if (v.phase === 'day') return `${S.mode}:day${v.day}:${v.report ? 'r' : ''}:${v.pending?.length ? 'q' : ''}`;
    return `${S.mode}:${v.phase}`;
  }
  if (S.mode === 'play') return v?.kind === 'player' ? `play:${v.phase}:${v.me?.role ? 'role' : 'none'}:${v.me?.alive === false ? 'out' : ''}` : 'play:join';
  return `${S.mode}:${S.code || ''}`;
}

// Runs paint() inside a view transition when the browser has them (the role card morphs from the card back to its
// face, the column slides and springs). Elsewhere paint() runs at once and `.step-in` replays the same slide in CSS.
let last = null;
export function step(paint) {
  const key = stepKey(); const changed = last !== null && key !== last; last = key;
  if (!changed || !animOn()) return paint();
  if (hasVT()) {
    $html.dataset.vt = '1';
    const t = document.startViewTransition(paint);
    const done = () => { delete $html.dataset.vt; };
    t.ready.catch(() => {}); t.finished.then(done, done);
    return undefined;
  }
  paint();
  const col = document.querySelector('#app .pane-game, #app > main');
  if (col) { col.classList.remove('step-in'); void col.offsetWidth; col.classList.add('step-in'); col.addEventListener('animationend', () => col.classList.remove('step-in'), { once: true }); }
  return undefined;
}

// ---------------------------------------------------------------- screen wake lock (host device while a game runs)
let lock = null; let want = false; let busy = false;
async function acquire() {
  if (!want || lock || busy || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  busy = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    if (!want) l.release().catch(() => {}); else { lock = l; l.addEventListener('release', () => { if (lock === l) lock = null; }); }
  } catch { /* denied, unsupported or low battery */ }
  busy = false;
}
export function gameAwake(on) {
  want = !!on;
  if (want) acquire(); else if (lock) { const l = lock; lock = null; l.release().catch(() => {}); }
}
// The browser drops the lock when the page is hidden: take it again on return.
document.addEventListener('visibilitychange', acquire);
