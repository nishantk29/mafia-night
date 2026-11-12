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
  const key = stepKey();
  // The room's first view replacing the "connecting" placeholder is the same screen arriving, not a new step: no second slide.
  const settling = last !== null && last.endsWith(':wait') && last.split(':')[0] === key.split(':')[0];
  const prevKey = last;
  const changed = last !== null && key !== last && !settling; last = key;
  if (!changed || !animOn()) return paint();
  // Opening or leaving the FAQ (design review, Oct 30 2026: "janky"): no view transition. Its snapshot groups animate width, height
  // and backdrop-filter, and the home card morph ran 400ms. The page fades and slides in on opacity + transform only (.faq-in, 220ms).
  if (isFaq(prevKey) || isFaq(key)) { paint(); replay('faq-in'); return undefined; }
  if (hasVT()) {
    $html.dataset.vt = '1';
    const t = document.startViewTransition(paint);
    const done = () => { delete $html.dataset.vt; };
    t.ready.catch(() => {}); t.finished.then(done, done);
    return undefined;
  }
  paint();
  replay('step-in');
  return undefined;
}
const isFaq = (k) => typeof k === 'string' && k.startsWith('faq:');
// Replays a one-shot entrance class on the main column; the class is dropped when it ends (will-change never lingers).
function replay(cls) {
  const col = document.querySelector('#app .pane-game, #app > main');
  if (col) { col.classList.remove(cls); void col.offsetWidth; col.classList.add(cls); col.addEventListener('animationend', () => col.classList.remove(cls), { once: true }); }
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
