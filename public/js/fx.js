// Motion: night and day scenes, pop-out reveals, the victory card, confetti. See DESIGN.md section 18.
// Rules: CSS 3D transforms only; animate transform and opacity only; will-change lives only on elements that are
// mid-animation; at most 18 particles per burst (8 on low-end); nothing loops while idle; every effect is gone by 1.2s
// except the victory card, which stays until it is closed. Effects never take input (pointer-events:none).
import { S, esc, store, buzz } from './state.js';
import { ui } from './ui_icons.js';
import { ROLE_BY_ID } from './roles.js';
import { bloodSplat } from './flair.js';

const $html = document.documentElement;
// Animation length scale (--dur-scale in styles.css), read once; every JS wait or delay tied to a CSS animation goes through dur().
const SCALE = (typeof getComputedStyle === 'function' && parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-scale'))) || 1;
export const dur = (ms) => Math.round(ms * SCALE);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const KEY = 'mafia.anim';

// Only the Animations switch and the phone's reduced-motion setting turn effects off. No core-count check: iPhones
// report 4 cores and would lose every effect. The one downgrade left is blur, on phones with 2 GB of memory or less
// (navigator.deviceMemory, Chrome/Android only; Safari never reports it).
export const noBlur = () => (navigator.deviceMemory || 99) <= 2;
export const animOn = () => store.get(KEY) !== 'off' && !reduced.matches;
// <html data-fx="on|off">: motion. <html data-noblur="1">: solid (not frosted) panels and an opaque secret veil.
export function syncFx() { $html.dataset.fx = animOn() ? 'on' : 'off'; $html.dataset.noblur = noBlur() ? '1' : '0'; }
export function setAnim(on) { store.set(KEY, on ? 'on' : 'off'); syncFx(); }
reduced.addEventListener?.('change', syncFx);
syncFx();

const full = () => $html.dataset.fx === 'on';
const maxParticles = () => 26;
const rand = (a, b) => a + Math.random() * (b - a);
const layer = () => document.getElementById('fx');
const drop = (el, ms) => setTimeout(() => el.remove(), dur(ms));

function add(html, ms) {
  const host = layer(); if (!host) return null;
  const el = document.createElement('div');
  el.innerHTML = html; const node = el.firstElementChild;
  host.append(node);
  if (ms) drop(node, ms);
  return node;
}

// ---------------------------------------------------------------- particles
const PALETTE = {
  town: ['#E0AE52', '#F7D58A', '#8DB6E8', '#F4E9D3'],
  mafia: ['#F26B66', '#FF9F43', '#B3262E', '#F4E9D3'],
  third: ['#B996F0', '#E8DCFF', '#E0AE52', '#F4E9D3'],
  none: ['#BFAE95', '#F4E9D3', '#8C7A64'],
  ink: ['#F4E9D3', '#BFAE95'],
};
// One burst from the middle of `parent`: n small pieces flying out on transform + opacity, removed with their parent.
function burst(parent, theme, n = 18, mode = 'confetti') {
  const count = Math.min(n, maxParticles());
  const colors = PALETTE[theme] || PALETTE.town;
  const box = document.createElement('div'); box.className = `fx-burst is-${mode}`;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i'); p.className = 'fx-p';
    const a = rand(0, Math.PI * 2); const d = rand(90, 190);
    p.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 40).toFixed(0)}px;--r:${rand(-360, 360).toFixed(0)}deg;--c:${colors[i % colors.length]};--d:${dur((i * 8) % 120)}ms`;
    box.append(p);
  }
  parent.append(box);
  return box;
}

// ---------------------------------------------------------------- scenes
const MOON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#F1E6D2" d="M42 6a27 27 0 1 0 16 41A23 23 0 0 1 42 6z"/></svg>';
export function night() {
  if (!animOn()) return;
  const stars = Array.from({ length: Math.min(12, maxParticles()) }, (_, i) =>
    `<i class="fx-star" style="left:${rand(4, 96).toFixed(0)}%;top:${rand(4, 62).toFixed(0)}%;--s:${rand(.5, 1.2).toFixed(2)};--d:${dur((i * 20) % 240)}ms"></i>`).join('');
  add(`<div class="fx-scene fx-night" aria-hidden="true"><span class="fx-moon">${MOON}</span>${stars}</div>`, 620);
}
export function day() {
  if (!animOn()) return;
  add('<div class="fx-scene fx-day" aria-hidden="true"><span class="fx-rays"></span><span class="fx-sun"></span></div>', 620);
}

// ---------------------------------------------------------------- pop-out reveal (voted out or killed)
// items: [{ name, how: 'vote' | 'night', role?: string }]. Public facts only: callers pass a role only when the room shows it.
export function popOut(items) {
  if (!animOn() || !items.length) return;
  const vote = items.every((i) => i.how === 'vote');
  const names = items.map((i) => esc(i.name)).join(' and ');
  const role = items.length === 1 && items[0].role ? `<p class="fx-pop-role">${esc(items[0].role)}</p>` : '';
  const node = add(`<div class="fx-scene fx-out ${vote ? 'is-vote' : 'is-night'}" aria-hidden="true">
    <div class="fx-in"><div class="fx-card glass" data-tilt>${vote ? '' : bloodSplat()}
      <span class="fx-stamp">${vote ? 'Voted out' : 'Killed'}</span>
      <span class="fx-pop-ico">${ui('skull')}</span>
      <h2 class="fx-pop-name">${names}</h2>
      <p class="fx-pop-why">${vote ? 'was voted out' : 'did not survive the night'}</p>${role}
    </div></div></div>`, 620);
  if (!node) return;
  if (full()) shake();
  if (full()) burst(node.querySelector('.fx-in'), vote ? 'ink' : 'mafia', 10, 'sparks');
}

// A short shake of the page content (not the fixed bars), on dramatic beats.
export function shake() {
  if (!full()) return;
  // transform on an ancestor would re-anchor position:fixed children (the action dock), so those are left out
  const els = [...document.querySelectorAll('#app > main > *')].flatMap((el) => (el.classList.contains('pane-game') ? [...el.children].filter((c) => !c.classList.contains('action-dock')) : [el]));
  els.forEach((el) => { el.classList.remove('fx-shake'); void el.offsetWidth; el.classList.add('fx-shake'); el.addEventListener('animationend', () => el.classList.remove('fx-shake'), { once: true }); });
}

// The new game's screen fades up once (opacity + transform only); the action dock stays put because a transform would re-anchor it.
export function restartIn() {
  if (!animOn()) return;
  const els = [...document.querySelectorAll('#app > main > *')].flatMap((el) => (el.classList.contains('pane-game') ? [...el.children].filter((c) => !c.classList.contains('action-dock')) : [el]));
  els.forEach((el) => { el.classList.add('is-restarting'); el.addEventListener('animationend', () => el.classList.remove('is-restarting'), { once: true }); });
}

// ---------------------------------------------------------------- victory card
let victoryEl = null;
export const victoryOpen = () => !!victoryEl;
const REASON_ICON = { town: 'sun', mafia: 'fedora', third: 'sparkle', none: 'skull' };
export function showVictory(ev) {
  closeVictory();
  const host = layer(); if (!host) return;
  const isHost = S.view?.kind === 'host';
  const you = ev.won === true ? 'You won!' : ev.won === false ? 'You lost' : '';
  const el = document.createElement('div');
  el.className = `fx-victory is-${ev.theme}${animOn() ? '' : ' is-still'}`;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'fx-v-team');
  el.innerHTML = `<div class="fx-v-sun" aria-hidden="true"></div>
    <div class="fx-in"><div class="fx-v-card glass" data-tilt>
      <span class="fx-v-ico">${ui(REASON_ICON[ev.theme] || 'sparkle')}</span>
      ${you ? `<p class="fx-v-you ${ev.won ? 'is-win' : 'is-loss'}">${you}</p>` : ''}
      <h2 class="fx-v-team" id="fx-v-team">${esc(ev.team)} ${ev.theme === 'none' ? '' : 'won'}</h2>
      ${ev.reason ? `<p class="fx-v-reason">${esc(ev.reason)}</p>` : ''}
      ${isHost ? '' : '<p class="fx-v-reason">Waiting for the host to restart.</p>'}
      <div class="fx-v-actions">${isHost ? '<button type="button" class="btn big" data-a="playAgain">Restart</button>' : ''}
        <button type="button" class="btn ghost" data-a="closeVictory">Close</button></div>
    </div></div>`;
  host.append(el); victoryEl = el;
  if (ev.won !== false) buzz([40, 50, 90]);
  if (animOn()) { const b = burst(el.querySelector('.fx-in'), ev.theme, 26, ev.theme === 'mafia' ? 'sparks' : 'confetti'); drop(b, 700); }
  el.querySelector(isHost ? '[data-a="playAgain"]' : '[data-a="closeVictory"]').focus({ preventScroll: true });
}
export function closeVictory() { victoryEl?.remove(); victoryEl = null; }

// ---------------------------------------------------------------- reading changes between two views
// Called when a new view arrives. Everything here uses what that viewer is already allowed to see.
export function observe(prev, next) {
  if (!animOn() || !prev || !next || prev.kind !== next.kind || prev.code !== next.code || next.kind === 'gone') return;
  if (next.phase === 'lobby' || prev.phase === 'lobby') { if (prev.phase === 'over' && next.phase === 'lobby') closeVictory(); return; }
  let delay = 0;
  if (next.phase === 'night' && prev.phase !== 'night') { night(); }
  else if (next.phase === 'day' && prev.phase !== 'day') { day(); delay = dur(600); }
  if (next.phase === 'over') return; // the victory card takes the stage
  const was = new Map((prev.players || []).map((p) => [p.id, p]));
  const out = [];
  for (const p of next.players || []) {
    const b = was.get(p.id);
    if (!b || !b.alive || p.alive) continue;
    const vote = next.kind === 'host' ? p.deathCause === 'condemned' : p.cause === 'condemned';
    let role = null;
    if (next.kind === 'host') { if (next.config?.rules?.revealOnDeath !== false && !p.roleHidden) role = ROLE_BY_ID[p.roleId]?.name || null; }
    else role = p.role?.name || null;
    out.push({ name: p.name, how: vote ? 'vote' : 'night', role });
  }
  if (out.length) setTimeout(() => popOut(out), delay);
}

// ---------------------------------------------------------------- after every render
const ticks = new Map();
let railNight = null; let railDone = new Set(); let railSeen = false;
// Count from the old number to the new one over ~450ms (rAF, one text node write per frame). Text around the number is kept.
function rollUp(el, from, to) {
  const a = /\d+/.exec(from); const b = /\d+/.exec(to);
  if (!a || !b || a[0] === b[0]) return;
  const x = +a[0]; const y = +b[0]; const t0 = performance.now(); const len = dur(450);
  const frame = (t) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (t - t0) / len); const n = Math.round(x + (y - x) * (1 - (1 - p) ** 3));
    el.textContent = to.replace(/\d+/, n);
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
// Numbers marked data-tick roll in when their value changes (vote counts, tallies).
export function afterRender() {
  document.querySelectorAll('[data-tick]').forEach((el) => {
    const k = el.dataset.tick; const v = el.textContent;
    if (animOn() && ticks.has(k) && ticks.get(k) !== v) {
      el.classList.add('is-tick');
      el.addEventListener('animationend', () => el.classList.remove('is-tick'), { once: true });
      rollUp(el, ticks.get(k), v);
    }
    ticks.set(k, v);
  });
  // The night rail: a step that just finished fills its connector once; steps already done stay filled.
  const rail = document.querySelector('.cues[data-night]');
  const night = rail ? rail.dataset.night : null;
  if (night !== railNight) { railNight = night; railDone = new Set(); railSeen = false; }
  if (rail) {
    rail.querySelectorAll('.cue.is-done[data-ck]').forEach((li) => {
      if (railSeen && animOn() && !railDone.has(li.dataset.ck)) li.classList.add('is-fill');
      railDone.add(li.dataset.ck);
    });
    rail.querySelectorAll('.cue[data-ck]:not(.is-done)').forEach((li) => railDone.delete(li.dataset.ck));
    railSeen = true;
  }
  // will-change is only set by these classes: drop them as soon as the motion ends.
  document.querySelectorAll('.is-flipping,.is-unflipping,.is-popping').forEach((el) => {
    const inner = el.querySelector('.rcard-inner') || el;
    inner.addEventListener('animationend', () => el.classList.remove('is-flipping', 'is-unflipping', 'is-popping'), { once: true });
  });
}

// ---------------------------------------------------------------- pointer / device tilt (no idle loop)
let raf = 0; let tx = 0; let ty = 0;
const flush = () => {
  raf = 0;
  document.querySelectorAll('[data-tilt]').forEach((el) => { el.style.setProperty('--tx', tx.toFixed(2)); el.style.setProperty('--ty', ty.toFixed(2)); });
};
function tilt(x, y) {
  if (!full() || !document.querySelector('[data-tilt]')) return;
  tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y));
  if (!raf) raf = requestAnimationFrame(flush);
}
addEventListener('pointermove', (e) => e.pointerType !== 'touch' && tilt((e.clientX / innerWidth - .5) * 2, (e.clientY / innerHeight - .5) * 2), { passive: true });

// ---------------------------------------------------------------- card tilt and lift (hover pointers only)
// Sets --rx/--ry on the card under the pointer; rAF-throttled, no idle loop. The seating board is never tilted: seats are dragged by coordinates.
const CARDS = '.block,.whisper,.guide,.path,.faq-group,.role-tile,.role-group,.suggest-card';
const cardOK = (el) => el && !el.querySelector('.board');
let cardEl = null; let cx = 0; let cy = 0; let craf = 0;
const cardFlush = () => {
  craf = 0;
  if (cardEl) { cardEl.style.setProperty('--rx', (cy * -5).toFixed(2) + 'deg'); cardEl.style.setProperty('--ry', (cx * 6).toFixed(2) + 'deg'); }
};
const cardReset = (el) => { if (!el) return; el.removeAttribute('data-tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--lift'); };
addEventListener('pointermove', (e) => {
  if (!full() || e.pointerType === 'touch' || e.buttons) return;
  const el = e.target.closest?.(CARDS);
  if (el !== cardEl) { cardReset(cardEl); cardEl = cardOK(el) ? el : null; if (cardEl) { cardEl.dataset.tilting = ''; cardEl.style.setProperty('--lift', '-4px'); } }
  if (!cardEl) return;
  const r = cardEl.getBoundingClientRect();
  cx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - .5) * 2)); cy = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - .5) * 2));
  if (!craf) craf = requestAnimationFrame(cardFlush);
}, { passive: true });
document.addEventListener('pointerleave', () => { cardReset(cardEl); cardEl = null; }, { passive: true });

// Touch: a gentle press tilt toward the finger (about 3deg), released on lift or when a scroll takes over. Never idles.
addEventListener('pointerdown', (e) => {
  if (!full() || e.pointerType !== 'touch') return;
  const el = e.target.closest?.(CARDS);
  if (!cardOK(el)) return;
  cardReset(cardEl); cardEl = el; el.dataset.tilting = '';
  const r = el.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - .5) * 2)); const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - .5) * 2));
  el.style.setProperty('--rx', (y * -3).toFixed(2) + 'deg'); el.style.setProperty('--ry', (x * 3.5).toFixed(2) + 'deg');
}, { passive: true });
const touchEnd = (e) => { if (e.pointerType === 'touch' && cardEl) { cardReset(cardEl); cardEl = null; } };
addEventListener('pointerup', touchEnd, { passive: true });
addEventListener('pointercancel', touchEnd, { passive: true });
