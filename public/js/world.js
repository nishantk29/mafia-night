// Player v2 helpers that need no DOM: the day/night world, the end-screen cast, the room-closed state.
import { S, esc, initial } from './state.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';

// <html data-world>: the phase decides how the whole phone looks. Lobby, dealt and over stay neutral.
export const worldOf = (phase) => (phase === 'night' ? 'night' : phase === 'day' ? 'day' : 'neutral');

// "The cast": every player once, in seat order, role revealed one by one (--i drives the stagger in CSS).
// `roleOf(p)` returns the role object (or null when unknown).
export function castRows(players, roleOf) {
  return players.map((p, i) => {
    const r = roleOf(p);
    return `<li class="cast-row${p.alive ? '' : ' is-dead'}${p.win ? ' is-winner' : ''}" data-cast="${esc(p.id)}" style="--i:${Math.min(i, 14)}"><span class="arow-glyph ${r ? `a-${r.alignment}` : ''}">${r ? ico(r) : initial(p.name)}</span>
      <span class="arow-name"><b>${esc(p.name)}</b> <span class="muted">${esc(r?.name || 'Role unknown')}</span></span>${p.alive ? '' : `<span class="arow-mark" aria-label="dead">${ui('skull')}</span>`}${p.win ? `<span class="meta">${ui('trophy')} Won</span>` : ''}</li>`;
  }).join('');
}
export const castList = (players, roleOf) => `<section class="block cast"><h3 class="block-title">The cast</h3><ol class="cast-list">${castRows(players, roleOf)}</ol></section>`;

// The room closed (host ended the game, or it expired): drop everything the game was showing.
// `closeVictory` is passed in so the stale "You won" card can never outlive the room.
export function applyClosed(m, mode, closeVictory) {
  closeVictory?.();
  S.ui.endConfirm = false; S.ui.settings = false; S.view = null; S.graveyard = null;
  S.ended = m.reason === 'ended' ? (mode === 'host' ? 'host' : 'ended') : 'expired';
}
