// Themed flourishes: blood running off the logo letters, the knife strike on the Host card, game suggestions, kill splatter.
// Markup only; the motion lives in redesign.css (transform and opacity, off with reduced motion).
import { esc } from './state.js';
import { WORDMARK_SVG } from './wordmark.js';

// The wordmark is outlined Limelight with the blood drips running off the letter bottoms (see tools/build-wordmark.py).
export const wordmark = () => `<span class="sr-only">Mafia Night</span>${WORDMARK_SVG}`;

// The knife plays its strike once per browser session; later home renders show it already stuck.
const KNIFE_KEY = 'mafia.knife';
let knifeSeen = false;
try { knifeSeen = sessionStorage.getItem(KNIFE_KEY) === '1'; } catch { /* private mode */ }
export function knifeSvg() {
  const fresh = !knifeSeen;
  if (fresh) { knifeSeen = true; try { sessionStorage.setItem(KNIFE_KEY, '1'); } catch { /* ignore */ } }
  return `<div class="knife${fresh ? ' is-new' : ''}" aria-hidden="true"><svg viewBox="0 0 200 70" focusable="false">
    <path d="M6 35C40 8 96 6 134 28l20 7-20 7C96 64 40 62 6 35z" fill="#D9DEE6"/>
    <path d="M6 35C40 8 96 6 134 28l20 7z" fill="#F3F6FA"/>
    <path d="M30 35h104" stroke="#9AA3B0" stroke-width="2"/>
    <path d="M30 35C60 24 96 24 128 33" fill="none" stroke="#B3121F" stroke-width="3" stroke-linecap="round" opacity=".85"/>
    <rect x="152" y="28" width="9" height="14" rx="2" fill="#5A4636"/>
    <rect x="161" y="30" width="38" height="10" rx="5" fill="#2A1A14"/><rect x="170" y="31" width="3" height="8" fill="#6E4A34"/><rect x="180" y="31" width="3" height="8" fill="#6E4A34"/></svg></div>`;
}

const GAMES = [
  { href: 'https://avalon.hatethespurs.com/', cls: 'is-quest', name: 'Quest Night', line: 'Knights and traitors. A hidden-team quest for 5 to 10.',
    icon: '<path fill="currentColor" d="M4 18h16l1-9-5 3-4-6-4 6-5-3zM5 20h14v2H5z"/>' },
  { href: 'https://secrethitler.hatethespurs.com/', cls: 'is-gilded', name: 'The Gilded Chamber', line: 'Pass laws, hunt the impostor. A secret-role game for 5 to 10.',
    icon: '<g fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 1l1.4 4h-2.8zM12 23l-1.4-4h2.8zM1 12l4-1.4v2.8zM23 12l-4 1.4v-2.8zM4.2 4.2l4 1.6-1.9 1.9zM19.8 19.8l-4-1.6 1.9-1.9zM19.8 4.2l-1.6 4-1.9-1.9zM4.2 19.8l1.6-4 1.9 1.9z"/></g>' },
];
export function suggestions() {
  return `<section class="suggest" aria-labelledby="suggest-h"><div class="suggest-head"><h2 class="suggest-title" id="suggest-h">More from Game Night</h2>
    <a class="suggest-all" href="https://gamenight.hatethespurs.com/">Game library</a></div>
    <div class="suggest-grid">${GAMES.map((g) => `<a class="suggest-card ${g.cls}" href="${g.href}"><span class="suggest-token"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${g.icon}</svg></span>
      <span class="suggest-name">${esc(g.name)}</span><span class="suggest-line">${esc(g.line)}</span></a>`).join('')}</div></section>`;
}

// A short splatter behind the "Killed" card: a burst, a few spots and two runs. ~1s, transform and opacity.
export function bloodSplat() {
  const spots = [[16, 22, 3.2], [84, 18, 2.6], [8, 62, 2.2], [92, 70, 3], [30, 92, 2], [70, 6, 2.2]]
    .map(([x, y, r]) => `<circle class="spot" cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<div class="fx-blood" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
    <path class="splat" d="M50 30l7 8 12-6-4 11 13 2-10 8 9 9-13-1 2 13-10-8-8 10-3-12-12 4 5-11-12-5 12-6-6-11 12 3z"/>
    <path class="splat d2" d="M50 40l5 5 8-2-3 7 8 4-9 2 3 8-8-4-4 7-3-8-9 1 5-7-8-5 8-3-2-8 7 3z"/>${spots}
    <path class="run" d="M30 52h3.4v30a1.7 1.7 0 0 1-3.4 0z"/><path class="run r2" d="M66 56h3.4v22a1.7 1.7 0 0 1-3.4 0z"/></svg></div>`;
}
