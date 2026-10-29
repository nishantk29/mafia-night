// Mixed seating on the host screen: the seat rows, the seat sheet, the pass-the-phone gate and hidden card, the "gone" screen for a moved seat.
// Logic that needs no DOM is in seat-model.js; the actions are in seating-actions.js.
import { S, esc, initial } from './state.js';
import { ui } from './ui_icons.js';
import { ico } from './art.js';
import { teamName } from './board.js';
import { roomFromView, viewForPlayer } from './room.js';
import { ALLOW_SEAT_TAKEOVER } from './config-defaults.js';
import { whereOf, WHERE_TEXT, passSeats } from './seat-model.js';

const WHERE_ICON = { local: 'phone', remote: 'phone', dropped: 'timer', open: 'plus' };
const whereLine = (p) => { const w = whereOf(p); return `<span class="seat-where is-${w}">${ui(WHERE_ICON[w])}<span>${WHERE_TEXT[w]}</span></span>`; };

// Step 1: one row per seat. Tap a row for rename, move and release. `chip` and `chip-phone` stay so the older setup checks still read it.
export function seatRows(v) {
  return `<ul class="chips seat-rows">${v.players.map((p) => `<li class="chip seat-row"><button type="button" class="seat-btn" data-a="seatOpen" data-id="${p.id}" aria-label="${esc(p.name)}, ${WHERE_TEXT[whereOf(p)]}. Change seat">
    <span class="chip-i">${initial(p.name)}</span><span class="seat-t"><span class="chip-name">${esc(p.name)}</span>${whereLine(p).replace('class="seat-where', `class="seat-where${whereOf(p) === 'remote' ? ' chip-phone' : ''}`)}</span><span class="seat-more" aria-hidden="true">⋯</span></button></li>`).join('')}</ul>`;
}

const shell = (title, inner) => `<div class="sheet-bg" data-a="seatClose"><div class="sheet setup-sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="seat-title" data-stop>
  <div class="sheet-grab"></div><div class="sheet-head"><h2 class="sheet-title" id="seat-title">${title}</h2><button type="button" class="icon-btn x-btn" data-a="seatClose" aria-label="Close">${ui('x')}</button></div>${inner}</div></div>`;

// The sheet for one seat. mode: 'menu' | 'pull' (confirm moving a seat that is on a phone to this phone).
export function seatSheet(v, sh) {
  const p = v.players.find((x) => x.id === sh?.id);
  if (!p) return '';
  const w = whereOf(p); const lobby = v.phase === 'lobby';
  if (sh.mode === 'pull') {
    return shell(`Move ${esc(p.name)} to this phone?`, `<p>${esc(p.name)} will play on this phone from now on. ${w === 'remote' ? 'Their own phone stops showing the game.' : 'Their old phone can’t take the seat back.'} The seat keeps its role.</p>
      <div class="sheet-actions"><button type="button" class="btn big" data-a="seatLocal" data-id="${p.id}">Move to this phone</button><button type="button" class="linkish" data-a="seatClose">Keep it where it is</button></div>`);
  }
  const acts = [];
  if (w !== 'local') acts.push(`<button type="button" class="btn ghost" data-a="${w === 'open' ? 'seatLocal' : 'seatPull'}" data-id="${p.id}">${w === 'open' ? 'Take it back to this phone' : 'Move to this phone'}</button>`);
  if (w === 'local' && ALLOW_SEAT_TAKEOVER) acts.push(`<button type="button" class="btn ghost" data-a="seatRelease" data-id="${p.id}">Release for takeover</button>`);
  if (lobby) acts.push(`<button type="button" class="linkish" data-a="seatRemove" data-id="${p.id}">Remove ${esc(p.name)}</button>`);
  const how = w === 'local' ? (ALLOW_SEAT_TAKEOVER ? `${esc(p.name)} plays on this phone. To hand the seat to their own phone, release it, then they join with the room code and the name ${esc(p.name)}.` : `${esc(p.name)} plays on this phone.`)
    : w === 'open' ? `Waiting for someone to join with the room code and the name ${esc(p.name)}.`
      : w === 'dropped' ? `${esc(p.name)}’s phone isn’t connected. It reconnects by itself, or you can move the seat to this phone.` : `${esc(p.name)} plays on their own phone.`;
  return shell(esc(p.name), `<p class="muted seat-how">${whereLine(p)} <span>${how}</span></p>
    <label class="field"><span>Name</span><input class="add-input" data-i="seatName" maxlength="20" autocomplete="off" value="${esc(S.ui.draft.seatName ?? p.name)}"></label>
    <div class="sheet-actions"><button type="button" class="btn big" data-a="seatRename" data-id="${p.id}">Save name</button>${acts.join('')}</div>`);
}

// ---- pass the phone ----
// A role card for the host phone. It is the same card the seat's own phone would show, drawn only while the card is held.
export function passFront(v, id) {
  const pv = viewForPlayer(roomFromView(v), id);
  const me = pv.me; const r = me?.role;
  if (!r) return '';
  const team = me.team?.length ? `<p class="pass-line">Your team: ${me.team.map((t) => `<b>${esc(t.name)}</b>${t.role ? ` (${esc(t.role.name)})` : ''}`).join(', ')}</p>` : '';
  const knows = me.knows?.length ? `<p class="pass-line">The Mafia are: ${me.knows.map((t) => `<b>${esc(t.name)}</b>`).join(', ')}</p>` : '';
  return `<span class="pass-front a-${r.alignment}"><span class="pass-glyph">${ico(r)}</span><span class="team-tag rcard-team a-${r.alignment}">${teamName(r.alignment)}</span>
    <span class="pass-role">${esc(r.name)}</span>${me.callName ? `<span class="pass-line">You are <b>${esc(me.callName)}</b>. Wake when the Host calls ${esc(me.callName)}.</span>` : ''}
    <span class="pass-blurb">${esc(r.blurb)}</span>${me.target ? `<span class="pass-line">Your target: <b>${esc(me.target)}</b></span>` : ''}${team}${knows}</span>`;
}
export const passReveal = (on) => {
  const btn = document.querySelector('.pass-hold'); if (!btn) return;
  btn.classList.toggle('is-open', on);
  const face = btn.querySelector('[data-pass-face]');
  if (face) face.innerHTML = on && S.ui.pass?.id ? passFront(S.view, S.ui.pass.id) : '';
};

// The whole screen while a seat is looking. Gate: nothing private. Card: the back at the top, the role only while held.
export function passLayer(v, ps) {
  const p = v.players.find((x) => x.id === ps.id); const name = esc(p.name);
  if (ps.stage === 'gate') {
    return `<main class="pass pass-gate" aria-label="Pass the phone"><div class="pass-mid"><span class="pass-tok">${initial(p.name)}</span><p class="pass-lead">Hand this phone to</p><h1 class="pass-name" tabindex="-1">${name}</h1>
      <p class="pass-note">Nothing private is on screen. ${name}, tap when you have the phone.</p></div>
      <div class="pass-dock"><button type="button" class="linkish pass-skip" data-a="passSkip">Not ${name}? Skip for now</button><button type="button" class="btn big" data-a="passIm">I’m ${name}</button></div></main>`;
  }
  return `<main class="pass pass-look" aria-label="${name}’s card"><p class="pass-top" tabindex="-1">${name}’s card. Only ${name} looks.</p>
    <button type="button" class="pass-hold" data-hold aria-label="Hold to look at ${name}’s card. Let go to hide it. It hides by itself after 3 seconds."><span class="rcard-back pass-back" aria-hidden="true"><span class="rcard-back-mark">${ui('brand')}</span></span><span class="pass-face" data-pass-face aria-live="polite"></span></button>
    <p class="pass-hint">${ui('hand')} Press and hold the card to look. Let go to hide.</p>
    <div class="pass-dock"><button type="button" class="btn big" data-a="passDone">Hide and pass back</button></div></main>`;
}

// On the dealt screen: who plays on this phone, with no role anywhere. Identical for every seat.
export function passPanel(v, seen) {
  const seats = passSeats(v);
  if (!seats.length) return '';
  const left = seats.filter((p) => !seen.includes(p.id)).length;
  return `<section class="block pass-panel"><h2 class="block-title">Pass the phone</h2>
    <p class="muted">${seats.length === 1 ? `${esc(seats[0].name)} plays` : `${seats.length} seats play`} on this phone. Hand it over one at a time. Each looks alone, then hands it back.</p>
    <ul class="pass-list">${seats.map((p) => `<li class="pass-row"><span class="chip-i">${initial(p.name)}</span><span class="pass-row-t"><b>${esc(p.name)}</b><span class="muted">${seen.includes(p.id) ? 'Looked' : 'Not yet'}</span></span><button type="button" class="btn ghost small" data-a="passTo" data-id="${p.id}">Hand to ${esc(p.name)}</button></li>`).join('')}</ul>
    ${left > 1 ? `<button type="button" class="linkish" data-a="passStart">Pass to each in turn</button>` : ''}
    ${left ? `<p class="muted">You can start the night without waiting. A seat that hasn’t looked can look later.</p>` : ''}</section>`;
}

export const goneScreen = () => `<main class="wrap gone"><h1 class="phase-title">This seat moved</h1>
  <p class="muted">The host moved this seat to the host phone, or someone took it over. To play, join again with your name.</p>
  <a class="btn big" href="#/">Back to home</a></main>`;
