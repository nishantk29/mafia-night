// Role artwork: game-icons glyphs, procedural card backdrops, and optional painted portraits in /art.
// Icons: game-icons.net by Lorc, Delapouite and contributors, CC BY 3.0.
import { ROLE_ICON } from './role_icons.js';
import { ART } from './art_manifest.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Small inline icon (falls back to the role's emoji when no icon is mapped, e.g. custom roles).
// The glyph comes from the sprite /icons/roles.svg (built by scripts/build-assets.mjs, which fails on an unknown name),
// so the glyph data is not part of the startup bundle.
export function ico(role, cls = '') {
  const name = role && ROLE_ICON[role.id];
  if (name) return `<svg class="ico ${cls}" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><use href="/icons/roles.svg#${name}"/></svg>`;
  return `<span class="ico emo-fb ${cls}" aria-hidden="true">${esc(role?.emoji || '❔')}</span>`;
}

export const hasPortrait = (role) => !!(role && ART[role.id]);

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const f = (n) => n.toFixed(1);

// Deterministic backdrop: every role gets its own pattern, tinted by team through CSS variables.
function backdrop(id) {
  const h = hash(id); const kind = h % 3; const n = 10 + ((h >> 3) % 10);
  let g = '';
  if (kind === 0) { // sunburst
    for (let i = 0; i < n * 2; i += 2) {
      const a1 = (i * Math.PI) / n; const a2 = ((i + 1) * Math.PI) / n;
      g += `<path d="M100 120 L${f(100 + 320 * Math.cos(a1))} ${f(120 + 320 * Math.sin(a1))} L${f(100 + 320 * Math.cos(a2))} ${f(120 + 320 * Math.sin(a2))}Z" fill="var(--ray)"/>`;
    }
  } else if (kind === 1) { // rings and lattice
    for (let r = 18; r < 230; r += 20) g += `<circle cx="100" cy="120" r="${r}" fill="none" stroke="var(--ray2)" stroke-width="${r % 40 === 18 ? 2.5 : 1}"/>`;
    for (let i = 0; i < 6; i++) g += `<path d="M${-20 + i * 48} 0 L${28 + i * 48} 130 L${-20 + i * 48} 260" fill="none" stroke="var(--ray)" stroke-width="1"/>`;
  } else { // art-deco fans
    for (let row = 0; row < 5; row++) for (let i = -1; i < 6; i++) {
      const cx = i * 44 + (row % 2) * 22; const cy = 40 + row * 50;
      g += `<path d="M${cx - 22} ${cy} A22 22 0 0 1 ${cx + 22} ${cy}" fill="none" stroke="var(--ray2)" stroke-width="1.2"/><path d="M${cx - 14} ${cy} A14 14 0 0 1 ${cx + 14} ${cy}" fill="none" stroke="var(--ray)" stroke-width="1.2"/>`;
    }
  }
  return `<svg class="bgart" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${g}
    <rect width="200" height="240" fill="url(#vig)"/></svg>`;
}

// Artwork block for a role card. A painted portrait in /art/<id>.* replaces the procedural art.
export function cardArt(role) {
  const portrait = ART[role.id] ? `<img class="portrait" src="/art/${encodeURIComponent(ART[role.id])}" alt="" decoding="async">` : '';
  return `<div class="cardart a-${role.alignment} ${portrait ? 'has-art' : ''}">${portrait || `${backdrop(role.id)}${ico(role, 'big')}`}</div>`;
}
