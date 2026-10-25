// Player (phone) screens.
// Role secrecy: nothing here shows another player's role or team colour, except what the server already makes
// public (dead players' roles, and everyone's role once the game is over). The player's own card is the only
// element with a team class.
import { S, esc, initial, store } from './state.js';
import { SUITS, RANKS } from './engine.js';
import { board, pc, cardName, teamName } from './board.js';
import { ico, cardArt } from './art.js';
import { ui } from './ui_icons.js';
import { setupRoleList, rolesSheet, rolesButton } from './roles_sheet.js';
import { graveyardPanel } from './graveyard.js';
import { toolsButton, toolsPanel, phaseBadge } from './tools.js';

const PHASE = { lobby: ['cards', 'Setting up'], dealt: ['cards', 'Roles dealt'], over: ['crown', 'Game over'] };
const appbar = (title, badge = '') => `<header class="appbar">
    <a class="appbar-mark" href="#/" aria-label="Home page">${ui('brand')}<span class="appbar-mark-label">Home</span></a>
    <div class="appbar-title">${title}</div>${badge}
  </header>`;
const back = (cls = '') => `<span class="rcard-back ${cls}" aria-hidden="true"><span class="rcard-back-mark">${ui('brand')}</span></span>`;

export function joinForm(code) {
  return `${appbar('Join a game')}
  <main class="wrap join">
    <h1 class="phase-title">Join room <span class="code">${esc(code)}</span></h1>
    <label class="field"><span>Your name</span><input data-i="joinName" maxlength="20" autocomplete="given-name" enterkeyhint="go" value="${esc(S.ui.draft.joinName || '')}" placeholder="The name everyone calls you"></label>
    <button type="button" class="btn big" data-a="join">Join game</button>
  </main>`;
}

export function playerScreen(v) {
  const me = v.me;
  const [picon, plabel] = v.phase === 'night' ? ['moon', `Night ${v.night}`] : v.phase === 'day' ? ['sun', `Day ${v.day}`] : PHASE[v.phase] || ['cards', ''];
  let hand;
  if (v.phase === 'over') hand = over(v);
  else if (v.phase === 'lobby') {
    hand = `<div class="waiting">${back()}<h2 class="phase-title">You’re in, ${esc(me.name)}</h2>
      <p class="muted">Waiting for the Host to deal.</p><p class="meta">Room <b class="code">${esc(v.code)}</b></p></div>`;
  } else hand = playing(v);
  return `${appbar(esc(me.name), `${phaseBadge(picon, plabel, v.phase === 'night' ? v.night : v.phase === 'day' ? v.day : '')}${toolsButton()}${rolesButton()}`)}
  <main class="wrap seat-view">
    <section class="hand" aria-label="Your role">${hand}${me.role ? `<p class="roles-link"><button type="button" class="linkish" data-a="openRoles">${ui('rules')} Roles in this game</button></p>` : ''}</section>
    ${!me.alive && S.graveyard ? graveyardPanel(me.id) : ''}
    <section class="table-side" aria-label="The table">${tableSide(v)}</section>
    <p class="leave-row"><button type="button" class="linkish" data-a="leaveGame">${ui('back')} Leave this game</button></p>
  </main>${S.ui.tools ? toolsPanel(v, false) : ''}${S.ui.roles ? rolesSheet(setupRoleList(v.setupRoles || [], { forPlayer: true, unreliable: v.setupUnreliable || [] })) : ''}`;
}

function playing(v) {
  const me = v.me;
  const needsCard = v.mode === 'cards' && !me.card && !me.role && v.phase === 'dealt' && !v.deckKey;
  if (me.role) return roleCard(v);
  if (needsCard) return cardPicker(me);
  if (v.deckKey) {
    return `<section class="block find-card"><h2 class="block-title">Find your card</h2>
      <p class="muted">Find your card in this key. The Host will call your role on night 1.</p>${key(v)}</section>`;
  }
  return `<div class="waiting">${back()}<h2 class="phase-title">Waiting for the Host to deal.</h2></div>`;
}

// The deluxe black playing card, face up but blurred under a veil. It is readable only while the card is held
// (pointer, or Space/Enter) and re-blurs on release, after 3s, or when the page loses focus: see hold.js and app.js.
// Everything role-specific sits in aria-hidden, inert parts that app.js opens while the card is held.
function roleCard(v) {
  const me = v.me; const r = me.role;
  const motion = S.ui.anim === 'deal' ? ' is-popping' : '';
  const hid = 'aria-hidden="true" inert';
  const team = me.team.length ? `<p class="note">Your team: ${me.team.map((t) => `<b>${esc(t.name)}</b>${t.role ? ` (${esc(t.role.name)})` : ''}${t.alive ? '' : ` ${ui('skull')} out`}`).join(', ')}</p>` : '';
  return `<div class="secret"><div class="secret-card"><div class="rcard a-${r.alignment}${motion}" data-tilt data-face="front" ${hid}>
      <div class="rcard-inner">
        <div class="rcard-face rcard-front">
          <span class="rcard-index rcard-index-tl" aria-hidden="true">${ico(r)}</span>
          ${cardArt(r)}
          <div class="rcard-body">
            <span class="team-tag a-${r.alignment}"><i class="team-mark a-${r.alignment}"></i>${teamName(r.alignment)}</span>
            <h2 class="rcard-name">${esc(r.name)}</h2>
            ${me.callName ? `<p class="rcard-call">You are <b>${esc(me.callName)}</b>. Wake when the Host calls ${esc(me.callName)}.</p>` : ''}
            <p class="rcard-blurb">${esc(r.blurb)}</p>
          </div>
          <span class="rcard-index rcard-index-br" aria-hidden="true">${ico(r)}</span>
        </div>
        <div class="rcard-face rcard-back" aria-hidden="true"><span class="rcard-back-mark">${ui('brand')}</span></div>
      </div>
    </div>
    <button type="button" class="secret-hold" data-hold aria-label="Hold to reveal your role. Press and hold, or hold Space or Enter. It hides again after 3 seconds."><span class="secret-veil" aria-hidden="true">${ui('eye')}<span>Swipe up to reveal</span><small>Make sure nobody is looking</small></span></button></div>
    <div class="secret-rest" ${hid}>${me.target || team || me.knows.length ? `<div class="dossier">
      ${me.target ? `<p class="note">Your target: <b>${esc(me.target)}</b></p>` : ''}${team}
      ${me.knows.length ? `<p class="note">The Mafia are: ${me.knows.map((t) => `<b>${esc(t.name)}</b>`).join(', ')}</p>` : ''}</div>` : ''}
    ${results(me.results)}${guide(me.guide)}</div></div>
    ${me.alive || S.graveyard ? '' : `<p class="note is-out">${ui('skull')} You’re out of the game. Stay quiet and enjoy the show.</p>`}`;
}

// What the Host told this player at night, newest first. Only readable while the card is held.
function results(list) {
  if (!list?.length) return '';
  return `<section class="block my-results" aria-label="Your night results"><h3 class="block-title">${ui('ear')} What you learned</h3>
    <ol class="log">${[...list].reverse().map((r) => `<li class="logl plain"><span class="logl-when">Night ${r.night}</span> <span class="logl-text">${esc(r.text)}</span></li>`).join('')}</ol></section>`;
}

// Private notes, kept only on this phone.
export const notesKey = (v) => `mafia.notes.${v.code}.${v.me.id}`;
function notes(v) {
  const open = !!S.ui.notesOpen; const text = store.get(notesKey(v)) || '';
  return `<section class="block my-notes">
    <button type="button" class="disclosure" aria-expanded="${open}" aria-controls="my-notes" data-a="toggleUi" data-k="notesOpen">
      ${ui('caret-down', open ? 'is-open' : '')} ${ui('note')} My notes <span class="disclosure-value">${text ? 'Saved on this phone' : 'Only you can see them'}</span></button>
    <div class="disclosure-body" id="my-notes" ${open ? '' : 'hidden'}>
      <div class="field"><textarea data-i="myNotes" rows="6" maxlength="4000" placeholder="Who claimed what, who you trust, who voted for whom. Saved on this phone only." aria-label="My notes">${esc(text)}</textarea></div>
    </div></section>`;
}

// How to play the role, in four short parts. Built on the server from the role the player was told they are.
function guide(g) {
  if (!g) return '';
  const part = (icon, title, lines) => (lines.length ? `<div class="guide-part"><h3 class="guide-title">${ui(icon)} ${title}</h3>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : '');
  return `<section class="guide" aria-label="How to play your role">
    ${part('crown', 'How you win', [g.goal])}
    ${part('moon', 'At night', g.night)}
    ${part('sun', 'By day', g.day)}
    ${part('skull', 'Good to know', [...g.death, ...g.know])}
  </section>`;
}

function tableSide(v) {
  const people = v.sharedBoard
    ? `<section class="block"><h2 class="block-title">The table</h2>${board(v, false)}</section>`
    : `<section class="block"><header class="block-head"><h2 class="block-title">Players</h2><span class="tally" data-tick="players">${v.players.length}</span></header>
      <ul class="people">${v.players.map((p) => `<li class="person ${p.alive ? '' : 'is-dead'}"><span class="person-name">${esc(p.name)}</span>${p.alive ? '' : `<span class="person-status" aria-label="out of the game">${ui('skull')}</span>`}</li>`).join('')}</ul></section>`;
  const log = v.publicLog.length
    ? `<ol class="log">${[...v.publicLog].reverse().map((l) => `<li class="logl plain"><span class="logl-text">${esc(l.text)}</span></li>`).join('')}</ol>`
    : '<p class="muted">Nothing yet. Deaths and votes show up here.</p>';
  return `${people}${v.phase === 'lobby' ? '' : notes(v)}<section class="block"><h2 class="block-title">What happened</h2>${log}</section>`;
}

// Public deck key (blind card deal): the whole table sees it, so it carries no team colours here.
function key(v) {
  return `<div class="keygrid">${v.deckKey.map((m) => `<div class="keyrow">${pc(m.card)}<span class="key-glyph">${ico(m.role)}</span><span class="key-name">${esc(m.role.name)}</span></div>`).join('')}</div>`;
}

// Two steps: pick the suit, then the number.
function cardPicker(me) {
  const sel = S.ui.claim;
  const suit = S.ui.claimSuit;
  const suits = [...SUITS.map((s) => ({ id: s.id, sym: s.sym, red: s.red, name: { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }[s.id] })), { id: 'J', name: 'Joker' }];
  const step1 = `<h3 class="picker-step"><span class="picker-n">1</span> Pick the suit</h3>
    <div class="suit-pick">${suits.map((s) => `<button type="button" class="suit ${s.red ? 'is-red' : ''}" aria-pressed="${suit === s.id}" data-a="pickSuit" data-v="${s.id}">
      <span class="suit-sym" aria-hidden="true">${s.id === 'J' ? ui('joker') : s.sym}</span><span class="suit-name">${s.name}</span></button>`).join('')}</div>`;
  let step2 = '';
  if (suit) {
    const s = SUITS.find((x) => x.id === suit);
    const ranks = suit === 'J'
      ? [['RJ', 'Red joker', true], ['BJ', 'Black joker', false]].map(([id, label, red]) => `<button type="button" class="pcb is-joker ${red ? 'is-red' : ''}" aria-pressed="${sel === id}" data-a="pickCard" data-v="${id}">${ui('joker')}<span>${label}</span></button>`).join('')
      : RANKS.map((r) => `<button type="button" class="pcb ${s.red ? 'is-red' : ''}" aria-pressed="${sel === r + s.id}" data-a="pickCard" data-v="${r}${s.id}" aria-label="${esc(cardName(r + s.id))}">${r}${s.sym}</button>`).join('');
    step2 = `<h3 class="picker-step"><span class="picker-n">2</span> ${suit === 'J' ? 'Pick the joker' : 'Pick the number'}</h3>
      <div class="rank-pick">${ranks}</div>
      <button type="button" class="link" data-a="pickSuit" data-v="">Change suit</button>`;
  }
  const tries = me.claimsLeft < 5 ? `<p class="meta">${me.claimsLeft} ${me.claimsLeft === 1 ? 'try' : 'tries'} left.</p>` : '';
  return `<section class="block card-picker"><h2 class="block-title">Which card did you get?</h2>
    <p class="muted">Keep your card hidden and tap the same one here to see your role.</p>
    ${step1}${step2}
    ${sel ? `<p class="muted">You picked the ${esc(cardName(sel))}.</p>` : ''}${tries}
    <button type="button" class="btn big ${sel ? '' : 'disabled'}" ${sel ? '' : 'aria-disabled="true" data-why="Pick your card first"'} data-a="claim">${ui('eye')} Show my role</button></section>`;
}

function over(v) {
  const me = v.me; const w = v.winner;
  const side = { town: 'Town wins', mafia: 'Mafia wins', killer: 'Serial Killer wins', cult: 'Cult wins', none: 'Nobody wins' }[w?.side] || `${esc(w?.side || 'Nobody')} wins`;
  const ink = { town: 'a-town', mafia: 'a-mafia', none: '' }[w?.side] ?? 'a-third';
  return `<section class="win ${ink}"><span class="win-mark">${ui(me.won ? 'trophy' : 'crown')}</span><h2 class="phase-title">${me.won ? 'You won' : side}</h2>
      ${me.won ? `<p class="muted">${side}.</p>` : ''}<p class="muted">${esc(w?.reason || '')}</p></section>
    <section class="block${S.ui.anim === 'roles' ? ' reveal-rows' : ''}"><h2 class="block-title">Final roles</h2>${v.players.map((p) => `<div class="arow"><span class="arow-glyph">${p.role ? ico(p.role) : initial(p.name)}</span>
      <span class="arow-name"><b>${esc(p.name)}</b> <span class="muted">${esc(p.role?.name || 'Role unknown')}</span></span>${p.alive ? '' : `<span class="arow-mark" aria-label="dead">${ui('skull')}</span>`}</div>`).join('')}</section>`;
}
