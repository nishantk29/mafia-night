// Host screens.
// Layout (DESIGN.md 6.2): app bar, then a console with the game pane and a side (table, who is who, log).
// Phones show one pane at a time via the tab bar; tablets show game + side switch; wide screens show everything.
import { castList } from './world.js';
import { S, esc, initial, loadLibrary, store } from './state.js';
import { loadDayStage } from './day-talk.js';
import { ROLES, ROLE_BY_ID, registerRoles, ACTION_TYPES, pickerEntries, GROUP_BY_ID, groupAlsoText } from './roles.js';
import { board, legend, sheet, roleChip, pc, cardText, teamName } from './board.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { nightModel, dayModel, card, timeline, tokens, stepBody, talkBody, TALK_TODO } from './host-timeline.js';
import { previewNight, checkCard, stepCues, doneStepLines, START_CUE, END_CUE, setupWarnings, balanceOf, roleMax, MAX_PLAYERS, DEFAULT_RULES, cardInfo, LATEST_NIGHT_VERSION, upgradeTarget } from './engine.js';
import { roomFromView } from './room.js';
import { THEMES } from './theme.js';
import { graveyardPanel } from './graveyard.js';
import { toolsButton, toolsPanel, phaseBadge, timerRunning, turnRunning } from './tools.js';
import { animOn, dur } from './fx.js';
import { rolesModel, rolesChip, rolesLayer, rolesGateOpen } from './roles_sheet.js';
import { SIMPLE_ROLES, simpleCounts, countsOf, isSimpleSet, deckFitText, simpleCardKey } from './simple.js';

import { setupView } from './setup-actions.js';
import { passLayer, passPanel, seatSheet } from './seating.js';
import { activePass, passSeen } from './seating-actions.js';
import { maskedLocal } from './seat-model.js';
import { callNum, checkCaption, balanceSplit, declareSides, SIDE_GROUPS } from './host_v2.js';
import { byTeamType } from './role-types.js';
import { qrSvg, joinUrl } from './qr.js';
import { hostHelpButton, hostHelpOverlay, hostHelpSettingsRow } from './host_help.js';

const qrCache = new Map();
const qrFor = (url) => { if (!qrCache.has(url)) qrCache.set(url, qrSvg(url, `QR code for ${url}`)); return qrCache.get(url); };

const pname = (v, id) => v.players.find((p) => p.id === id)?.name || '?';
const rname = (id) => ROLE_BY_ID[id]?.name || id;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const names = (v, ids) => ids.map((id) => `<b>${esc(pname(v, id))}</b>`).join(', ');
const empty = (icon, text, extra = '') => `<div class="empty">${ui(icon)}<p>${text}</p>${extra}</div>`;
// Disabled buttons stay clickable and explain themselves in a toast (data-why).
const btn = (cls, a, label, { on = true, why = '', attrs = '' } = {}) =>
  `<button type="button" class="btn ${cls} ${on ? '' : 'disabled'}" ${on ? '' : `aria-disabled="true" data-why="${esc(why || label)}"`} data-a="${a}" ${attrs}>${label}</button>`;

const PHASE = { lobby: ['cards', 'Setting up'], dealt: ['cards', 'Roles dealt'], over: ['crown', 'Game over'] };

export function hostScreen(v, local) {
  registerRoles(v.config.customRoles);
  const tab = S.ui.tab;
  const side = S.ui.sideTab;
  const title = local ? 'On this device<span class="appbar-sub">Private to this device</span>' : `<button type="button" class="appbar-code" data-a="showCode" aria-label="Room code ${esc(v.code.split('').join(' '))}. Tap to show the code full screen">${ui('expand')}<b class="code">${esc(v.code)}</b></button>`;
  const [picon, plabel] = v.phase === 'night' ? ['moon', `Night ${v.night}`] : v.phase === 'day' ? ['sun', `Day ${v.day}`] : PHASE[v.phase];
  if (v.phase !== 'lobby') S.ui.deckShown = [];
  const ps = activePass(v);
  if (ps && !rolesGateOpen(v)) return passLayer(v, ps); // a seat on this phone is looking: nothing else on screen
  if (rolesGateOpen(v)) return rolesLayer(v); // the first look at the setup comes before the console, so it holds the one gold button
  const { body, dock, bar = '' } = ({ lobby, dealt, night, day, over })[v.phase](v, local);
  const tabs = [['game', 'Game'], ['table', 'Table'], ['log', 'Log']];
  return `<header class="appbar">
    <a class="appbar-mark" href="#/" aria-label="Home page">${ui('brand')}<span class="appbar-mark-label">Home</span></a>
    <div class="appbar-title">${title}</div>
    ${['night', 'day'].includes(v.phase) ? '' : phaseBadge(picon, plabel, '')}${v.phase !== 'lobby' && (timerRunning() || turnRunning()) ? toolsButton() : ''}
    ${v.phase !== 'lobby' ? rolesChip(rolesModel(v)) : ''}${hostHelpButton()}<button type="button" class="icon-btn" data-a="openSettings" aria-label="Menu" title="Menu">${ui('gear')}</button>${bar}
  </header>
  <main class="console" data-tab="${tab}" data-side="${side}">
    <section class="pane pane-game" aria-label="Game">${v.stalemate ? `<section class="block stalemate"><p class="note">${ui('crown')} ${esc(v.stalemate.reason)}</p><div class="btn-row"><button type="button" class="btn" data-a="declare">Declare a winner</button></div></section>` : ''}${body}
      <div class="action-dock">${dock}</div>
    </section>
    <div class="side">
      <div class="side-switch" role="tablist" aria-label="Side panel">
        ${[['table', 'Table'], ['log', 'Log']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${side === k}" tabindex="${side === k ? 0 : -1}" data-a="side" data-v="${k}">${ui(k)} ${l}</button>`).join('')}
      </div>
      <section class="pane pane-table" aria-label="Table">${tablePane(v)}</section>
      <section class="pane pane-roster" aria-label="Who is who">${roster(v)}</section>
      <section class="pane pane-log" aria-label="Log">${logPane(v)}</section>
    </div>
  </main>
  <nav class="tabbar" aria-label="Sections">${tabs.map(([k, l]) => `<button type="button" data-a="tab" data-v="${k}" ${tab === k ? 'aria-current="page"' : ''}>${ui(tab === k ? `${k}-on` : k)}<span>${l}</span></button>`).join('')}</nav>
  ${sheet(v)}${S.ui.showKey ? keyOverlay(v) : ''}${S.ui.showCode && !local ? codeOverlay(v) : ''}${S.ui.showQr && !local ? qrOverlay(v) : ''}${S.ui.modal === 'role' ? roleModal() : ''}${S.ui.tools ? toolsPanel(v, true) : ''}${rolesLayer(v)}${S.ui.seatSheet ? seatSheet(v, S.ui.seatSheet) : ''}${S.ui.addRole && v.phase === 'lobby' ? addRoleSheet(v) : ''}${S.ui.settings ? settingsSheet() : ''}${hostHelpOverlay(v)}${S.ui.gy && S.mode === 'host' ? graveyardSheet() : ''}${S.ui.endConfirm && !local ? endGameSheet() : ''}${S.ui.restartConfirm && v.phase !== 'lobby' ? restartSheet() : ''}${S.ui.declare && ['day', 'night'].includes(v.phase) ? declareSheet(v) : ''}`;
}

// Declare a winner: an in-page sheet (a native prompt() can lock the tab). Opens by itself when only the Cult and the
// Serial Killer are left (v.stalemate), offering just those two and a draw: Nishant's rule, the Host decides.
const DECLARE_SIDES = { town: 'Town', mafia: 'Mafia', killer: 'Serial Killer', cult: 'Cult', draw: 'Draw' };
function declareSheet(v) {
  const st = v.stalemate;
  const sides = st ? st.sides : declareSides(v.config.roles);
  return `<div class="sheet-bg" data-a="closeDeclare"><div class="sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="declare-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="declare-title">Declare a winner</h2><button type="button" class="icon-btn x-btn" data-a="closeDeclare" aria-label="Close">${ui('x')}</button></div>
    <p class="muted">${st ? esc(st.reason) : 'End the game now and choose who wins.'}</p>
    <div class="declare-sides">${sides.map((k) => `<button type="button" class="btn ${k === 'draw' ? 'ghost' : ''}" data-a="declareSide" data-v="${k}">${k === 'draw' ? 'Draw' : `${DECLARE_SIDES[k]} wins`}</button>`).join('')}</div>
  </div></div>`;
}

function graveyardSheet() {
  return `<div class="sheet-bg" data-a="closeGy"><div class="sheet is-entering" role="dialog" aria-modal="true" aria-label="Graveyard" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><span></span><button type="button" class="icon-btn x-btn" data-a="closeGy" aria-label="Close">${ui('x')}</button></div>
    ${graveyardPanel('host', true)}</div></div>`;
}

// Settings sheet: one labelled switch for now. Same storage as before (fx.js setAnim).
function settingsSheet() {
  const on = animOn();
  return `<div class="sheet-bg" data-a="closeSettings"><div class="sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="settings-title">Settings</h2><button type="button" class="icon-btn x-btn" data-a="closeSettings" aria-label="Close">${ui('x')}</button></div>
    <div class="menu-list">
      ${S.view?.phase && S.view.phase !== 'lobby' ? `<button type="button" class="btn ghost" data-a="menuOpen" data-v="tools">${ui('tools')} Table tools</button>` : ''}
      ${S.mode === 'host' && S.view?.nightVersion >= 3 && S.view?.phase !== 'lobby' ? `<button type="button" class="btn ghost" data-a="menuOpen" data-v="gy">${ui('skull')} Graveyard</button>` : ''}
      <button type="button" class="btn ghost" data-a="menuOpen" data-v="roles">${ui('rules')} Roles in this game</button>
    </div>
    <div class="rules"><button type="button" class="rule" role="switch" aria-checked="${on}" data-a="toggleAnim">
      <span class="rule-text"><span class="rule-title">Animations</span><span class="rule-desc">Night and day scenes, card flips and the win screen. Off keeps everything still.</span></span>
      <span class="switch" aria-hidden="true"><i></i></span></button></div>
    ${hostHelpSettingsRow()}
    ${S.view?.phase && S.view.phase !== 'lobby' ? `<div class="end-game"><button type="button" class="btn ghost" data-a="restartAsk">Restart</button>
      <p class="muted">Same code and players. New roles, back to the reveal.</p></div>` : ''}
    ${S.mode === 'host' ? `<div class="end-game"><button type="button" class="btn danger" data-a="endGameAsk">End game</button>
      <p class="muted">Closes the room for everyone and frees the code.</p></div>` : ''}
  </div></div>`;
}

// Restart: a confirm sheet, because it throws away the current game (the room, players and setup stay).
function restartSheet() {
  return `<div class="sheet-bg" data-a="restartNo"><div class="sheet is-entering" role="alertdialog" aria-modal="true" aria-labelledby="restart-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="restart-title">Restart the game?</h2><button type="button" class="icon-btn x-btn" data-a="restartNo" aria-label="Close">${ui('x')}</button></div>
    <p>Same code and players. Everyone gets a new role and goes back to the reveal.</p>
    <div class="btn-row"><button type="button" class="btn ghost" data-a="restartNo">Keep playing</button><button type="button" class="btn ghost" data-a="restartSetup">Change setup first</button><button type="button" class="btn" data-a="restart">Restart now</button></div>
  </div></div>`;
}

// End game: a confirm sheet, because it closes the room for every player and cannot be undone.
function endGameSheet() {
  return `<div class="sheet-bg" data-a="endGameNo"><div class="sheet is-entering" role="alertdialog" aria-modal="true" aria-labelledby="end-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="end-title">End the game?</h2><button type="button" class="icon-btn x-btn" data-a="endGameNo" aria-label="Close">${ui('x')}</button></div>
    <p>This closes the room for every player and frees the code. It can’t be undone.</p>
    <div class="btn-row"><button type="button" class="btn ghost" data-a="endGameNo">Keep playing</button><button type="button" class="btn danger" data-a="endGameYes">End game for everyone</button></div>
  </div></div>`;
}

// ---------------- lobby ----------------
function lobby(v, local) { return setupView(v, local); }

// The role library: a searchable bottom sheet grouped by side. Tiles keep the addRole / subRole / info hooks.
export function addRoleSheet(v) {
  const counts = {};
  for (const id of v.config.roles) counts[id] = (counts[id] || 0) + 1;
  const custom = loadLibrary().map((x) => ROLE_BY_ID[x.id] || x);
  const vname = (r) => r.variant || r.name;
  const tile = (r, inGroup = false) => `<div class="role-tile a-${r.alignment} ${counts[r.id] ? 'is-picked' : ''}" data-name="${esc((r.name + ' ' + (r.variant || '') + ' ' + (r.group ? GROUP_BY_ID[r.group].name : '')).toLowerCase())}" data-team="${r.alignment}">
      <button type="button" class="role-add" data-a="addRole" data-id="${r.id}" aria-label="Add ${esc(vname(r))}${counts[r.id] ? ` (${counts[r.id]} in the game)` : ''}"><span class="role-glyph">${ico(r)}</span><span class="role-name">${esc(vname(r))}${inGroup ? `<small class="variant-team a-${r.alignment}">${esc(teamName(r.alignment))}</small>` : ''}</span></button>
      ${inGroup && counts[r.id] ? `<button type="button" class="icon-btn role-minus" data-a="subRole" data-id="${r.id}" aria-label="One fewer ${esc(vname(r))}">${ui('minus')}</button>` : ''}
      ${counts[r.id] ? `<span class="role-count" aria-hidden="true">${counts[r.id]}</span>` : ''}
      <button type="button" class="icon-btn role-info rc-i" data-a="info" data-id="${r.id}" aria-label="About ${esc(vname(r))}">${ui('info')}</button>
    </div>`;
  // Aliases: first name plus a "+N" chip, " · " between names, no "Also:" prefix.
  const aliasLine = (e) => {
    const names = groupAlsoText(e).replace(/^Also: /, '').split(', ').filter(Boolean);
    return names.length > 2 ? `${esc(names[0])}<span class="alias-more" aria-label="and ${names.length - 1} more">+${names.length - 1}</span>` : esc(names.join(' · '));
  };
  // A group is one picker entry; any number of its roles can be added, each counted on its own.
  const entry = (e) => {
    if (e.role) return tile(e.role);
    if (e.variants.length === 1) return tile(e.variants[0]);
    const total = e.variants.reduce((n, r) => n + (counts[r.id] || 0), 0);
    return `<details class="role-group ${total ? 'is-picked' : ''}" data-group="${e.group.id}" ${total ? 'open' : ''}>
      <summary><span class="role-glyph">${ico(e.variants[0])}</span><span class="role-name">${esc(e.group.name)}<small class="role-also">${aliasLine(e)}</small></span>${total ? `<span class="role-count" aria-hidden="true">${total}</span>` : ''}</summary>
      <div class="role-variants">${e.variants.map((r) => tile(r, true)).join('')}</div></details>`;
  };
  const inGame = (t) => v.config.roles.filter((id) => (ROLE_BY_ID[id]?.alignment || 'town') === t).length;
  const teams = byTeamType(ROLES, (r) => r.alignment);
  return `<div class="sheet-bg" data-a="closeAddRole"><div class="sheet add-role-sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="addrole-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="addrole-title">Add role</h2><button type="button" class="icon-btn x-btn" data-a="closeAddRole" aria-label="Close">${ui('x')}</button></div>
    <div class="add-role-top"><label class="search-field">${ui('search')}<input class="search" data-i="search" placeholder="Search roles" aria-label="Search roles" value="${esc(S.ui.search)}"></label></div>
    <div class="add-role-list">${teams.map((g) => `<section class="side-group tg a-${g.team}" data-side="${g.team}" data-team="${g.team}"><h3 class="tg-h"><span class="tg-name">${g.title}</span><span class="tg-n">${inGame(g.team) ? `${inGame(g.team)} in game` : ''}</span></h3>
      ${g.types.map((x) => `<div class="tg-sub" data-team="${g.team}" data-type="${esc(x.type)}"><h4 class="tg-type">${x.type}</h4><div class="role-grid">${pickerEntries(x.items).map(entry).join('')}</div></div>`).join('')}</section>`).join('')}
      ${custom.length ? `<section class="side-group" data-side="custom"><h3 class="side-title">Yours</h3><div class="role-grid">${pickerEntries(custom).map(entry).join('')}</div></section>` : ''}
      <p class="muted search-empty" hidden>No roles match that search.</p></div>
    <button type="button" class="btn big add-role-done" data-a="closeAddRole">Done</button>
  </div></div>`;
}

// Steps that get a live result, and checks that are a coin flip by design.
const LIVE = ['investigate', 'track', 'watch', 'autopsy', 'execCheck'];
const COIN = ['fake'];

// ---------------- dealt ----------------
// Night 1, or day 1 under the "Start with a day" house rule (never with a blind card deal).
function firstStart(v) {
  const blind = v.config.mode === 'cards' && v.config.cardFlow === 'blind';
  return v.config.rules?.dayStart && !blind ? btn('big', 'startDay', 'Start day 1') : btn('big', 'startNight', 'Start night 1');
}
function dealt(v, local) {
  const cards = v.config.mode === 'cards';
  const blind = cards && v.config.cardFlow === 'blind';
  const back = `<button type="button" class="btn ghost back-setup" data-a="undeal">${ui('back')} Back to setup</button>`;
  const stack = (main) => `<div class="dock-stack">${back}${main}</div>`;
  if (!cards) {
    return {
      body: `<header class="phase-head"><h2 class="phase-title">${v.players.every((p) => p.offline) ? 'Roles are dealt' : 'Roles are on everyone’s phones'}</h2>
        <p class="muted">${v.players.every((p) => p.offline) ? 'Pass this phone so each player looks in private, then start the first night.' : 'Ask everyone to check their role in private, then start the first night.'}</p></header>
        ${passPanel(v, passSeen(v))}`,
      dock: stack(firstStart(v)),
    };
  }
  const left = v.players.filter((p) => !p.roleId).length;
  const claimed = v.players.filter((p) => p.card).length;
  const step3 = blind
    ? 'Show the key to the table. Each player finds their card in it and keeps it secret.'
    : local ? 'Each player shows you their card in private. Choose it next to their name below.'
      : 'Each player enters their card on their phone. You can also choose it for them below.';
  const body = `<section class="block"><h2 class="block-title">Card key</h2>${keyTable(v)}
      <button type="button" class="btn ghost" data-a="showKey">${ui('eye')} Show the key to the table</button></section>
    <section class="block"><h2 class="block-title">Hand out the codes</h2>
      <ol class="steps"><li>These ${v.deck.map.length} card codes are in play.</li>
        <li>Give one to each player in private.</li><li>${step3}</li></ol>
      ${blind ? '<p class="muted">Then start night 1. As you call each role, tap who wakes up.</p>'
        : `<p class="muted">${claimed} of ${v.players.length} cards entered.</p>${assignList(v)}`}
    </section>`;
  const ok = blind || !left;
  return { body, dock: stack(`${ok ? firstStart(v) : btn('big', 'startNight', `${plural(left, 'player')} still need${left === 1 ? 's' : ''} a card`, { on: false })}`) };
}

// big = the key shown to the whole table: disguised roles appear as what they think they are.
// The Host's own key shows the truth, with what the player believes.
function keyTable(v, big = false) {
  const shown = (m) => (big && ROLE_BY_ID[ROLE_BY_ID[m.roleId].seesAs]) || ROLE_BY_ID[m.roleId];
  const rows = [...v.deck.map].sort((a, b) => shown(a).alignment.localeCompare(shown(b).alignment) || shown(a).id.localeCompare(shown(b).id) || a.card.localeCompare(b.card));
  const fits = big ? `${rows.length <= 9 ? ' fits-9' : ''}${rows.length <= 16 ? ' fits-16' : ''}` : '';
  return `<div class="keygrid ${big ? 'is-big' : ''}${fits}">${rows.map((m) => { const r = shown(m); const real = ROLE_BY_ID[m.roleId];
    const thinks = !big && real.seesAs ? ` <span class="meta">thinks: ${esc(ROLE_BY_ID[real.seesAs].name)}</span>` : '';
    return `<div class="keyrow a-${r.alignment}">${pc(m.card)}<span class="key-glyph">${ico(r)}</span><span class="key-name">${esc(r.name)}${thinks}</span><i class="team-mark a-${r.alignment}" role="img" aria-label="${teamName(r.alignment)}"></i></div>`; }).join('')}</div>`;
}
// Where players type the code. The workers.dev address is long, so point people at the short domain.
function joinSite() {
  return location.hostname === 'mafia-app.hatethespurs.workers.dev' ? 'mafia.hatethespurs.com' : location.host;
}
// Full-screen room code: hold the phone up or turn the laptop toward the room.
function codeOverlay(v) {
  const joined = v.players.filter((p) => !p.offline).length;
  return `<div class="overlay code-show" data-a="hideCode"><div class="overlay-in${S.ui.anim === 'modal' ? ' is-entering' : ''}" role="dialog" aria-modal="true" aria-labelledby="code-title">
    <button type="button" class="icon-btn x-btn" data-a="hideCode" aria-label="Close">${ui('x')}</button>
    <p class="code-show-site" id="code-title">Go to <b>${esc(joinSite())}</b> and enter</p>
    <div class="code-show-code code" aria-label="Room code ${esc(v.code.split('').join(' '))}">${esc(v.code)}</div>
    <p class="code-show-count">${joined ? `${plural(joined, 'player')} joined` : 'Waiting for players'}</p>
    <button type="button" class="btn ghost" data-a="showQr">${ui('expand')} Show QR code</button>
  </div></div>`;
}
// Full-screen join QR: players point their camera at it.
function qrOverlay(v) {
  const link = joinUrl(location.origin, v.code);
  return `<div class="overlay code-show qr-show" data-a="hideQr"><div class="overlay-in${S.ui.anim === 'modal' ? ' is-entering' : ''}" role="dialog" aria-modal="true" aria-labelledby="qr-title">
    <button type="button" class="icon-btn x-btn" data-a="hideQr" aria-label="Close">${ui('x')}</button>
    <p class="code-show-site" id="qr-title">Scan to join, or go to <b>${esc(joinSite())}</b> and enter <b class="code">${esc(v.code)}</b></p>
    <div class="qr-big">${qrFor(link)}</div>
  </div></div>`;
}
function keyOverlay(v) {
  if (!v.deck) return '';
  return `<div class="overlay key-show" data-a="hideKey"><div class="overlay-in${S.ui.anim === 'modal' ? ' is-entering' : ''}" role="dialog" aria-modal="true" aria-labelledby="key-title">
    <button type="button" class="icon-btn x-btn" data-a="hideKey" aria-label="Close">${ui('x')}</button>
    <h2 class="phase-title" id="key-title">Find your card. Keep it secret.</h2>
    ${keyTable(v, true)}
    <button type="button" class="btn big" data-a="hideKey">Done</button></div></div>`;
}
function assignList(v) {
  const free = v.deck.map.filter((m) => !v.deck.claimed[m.card]);
  return `<div class="assign">${v.players.map((p) => `<div class="arow"><span class="arow-name">${esc(p.name)}</span>${p.card
    ? `${pc(p.card)}${p.roleId ? roleChip(ROLE_BY_ID[p.roleId]) : ''}<button type="button" class="icon-btn" data-a="clearCard" data-id="${p.id}" aria-label="Clear ${esc(p.name)}’s card">${ui('x')}</button>`
    : `<select data-i="assign" data-id="${p.id}" aria-label="Card for ${esc(p.name)}"><option value="">Choose a card</option>${free.map((m) => `<option value="${m.card}">${esc(cardText(m.card))}</option>`).join('')}</select>`}</div>`).join('')}</div>`;
}

// ---------------- night ----------------
function night(v) {
  const n = S.ui.night;
  if (n.n !== v.night) { n.n = v.night; n.actions = {}; n.picks = {}; n.acked = {}; n.opened = false; }
  n.acked ||= {};
  const steps = v.script;
  syncCheck(v, steps.filter((s) => s.kind === 'action' && (s.type === 'investigate' || (v.nightVersion >= 7 && LIVE.includes(s.type)))));
  const m = nightModel(v, n);
  const total = steps.length;
  const finished = steps.filter((s) => s.kind !== 'identify' && !!n.actions[s.key]).length;
  const alive = v.players.filter((p) => p.alive);
  const first = m.intro;
  let current = '';
  if (m.intro) current = card({ kicker: 'Everyone', key: '@open', say: m.card.say, todo: m.card.todo });
  else if (m.card) current = stepCard(v, m.card, alive);
  else if (total) current = card({ kicker: 'Everyone', key: '@close', say: v.story?.close || END_CUE, todo: 'Wait until every eye is open. Tap Wake everyone up.' });
  const prep = first && v.story?.prep?.length ? `<button type="button" class="linkish st-peek" data-a="toggleUi" data-k="prepOpen" aria-expanded="${!!S.ui.prepOpen}">${ui('ear')} Private notes for tonight</button>${S.ui.prepOpen ? `<section class="story-prep"><ul>${v.story.prep.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul></section>` : ''}` : '';
  const body = `<header class="phase-head"><h2 class="phase-title">Night ${v.night}</h2>
      ${v.shield ? `<p class="note is-warn">${ui('shield')} Virgin shield: nobody can be killed tonight.</p>` : ''}</header>
    ${first ? upgradeCard(v) : ''}${prep}
    ${total ? timeline({ done: m.done, upcoming: m.idle ? [] : m.upcoming, current }) : empty('moon', 'No roles wake tonight. Wake everyone up when you’re ready.')}`;
  const b = total ? m.button : { label: 'Wake everyone up', enabled: true, action: 'resolve' };
  const cur = m.card?.step;
  const fix = !b.enabled && cur ? `<p class="dock-why">${esc(b.why)} <button type="button" class="linkish" data-a="${cur.kind === 'identify' ? 'skipIdentify' : 'skip'}" data-key="${esc(cur.key)}" data-role="${esc(cur.roleId || '')}">Skip this step</button></p>` : '';
  const label = m.idle || b.action === 'resolve' ? `${ui('sun')} ${b.label}` : b.label;
  const dock = `${fix}${btn('big', b.action === 'startCalls' ? 'startCalls' : 'nextStep', label, { on: b.enabled, why: b.why || b.label, attrs: `data-left="${m.nav.open.length}" aria-label="${esc(m.nav.enabled ? b.label : b.why)}" title="${esc(b.label)}"` })}`;
  const bar = total ? `<div class="night-progress" role="progressbar" aria-label="Night progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${finished}"><i style="--p:${(finished / total).toFixed(3)}"></i></div>` : '';
  return { body: body + checkOverlay(v), dock, bar };
}

// The current step's card: the exact line in quotes, what to do, the picker. Nobody is named but the players on the picker.
function stepCard(v, c, alive) {
  const n = S.ui.night; const s = c.step; const set = n.actions[s.key];
  const body = stepBody(v, s, n, alive);
  const peek = s.hint || v.story?.steps?.[s.key]?.notes?.length
    ? `<button type="button" class="linkish st-peek" data-a="toggleUi" data-k="peek" aria-expanded="${!!S.ui.peek}">${ui('ear')} ${S.ui.peek ? 'Hide private note' : 'Private note'}</button>${S.ui.peek ? `<div class="story-notes"><ul>${[s.hint, s.realRole && `Real role: ${s.realRole}`, ...(v.story?.steps?.[s.key]?.notes || [])].filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}` : '';
  const after = set ? `${afterBits(v, s, set)}${s.kind === 'action' && checkFor(v, s, set) ? `<button type="button" class="link" data-a="showCheck" data-key="${s.key}">Show card again</button>` : ''}` : '';
  return card({ kicker: c.name, key: s.key, say: c.say, todo: c.todo, dead: c.dead, body: `${body}${after}${peek}`, then: set ? '' : c.then });
}

// The lines the Host reads or does after a step is answered (Then say, live answer, coin flip). Empty when there are none.
const afterBits = (v, s, set) => `${v.story?.steps?.[s.key]?.then ? `<div class="story-say"><p class="story-then"><span class="story-tag">Then say:</span> <q>${esc(v.story.steps[s.key].then)}</q></p></div>` : ''}${tellNow(v, s, set)}${afterCoin(s, set, doneLines(v, s, set))}`;
// v4: one big read-aloud block, with the Host-only notes below it.
function storySay(text, then, notes = []) {
  return `<div class="story-say"><p class="story-line"><span class="story-tag">Say:</span> <q>${esc(text)}</q></p>${then ? `<p class="story-then"><span class="story-tag">Then say:</span> <q>${esc(then)}</q></p>` : ''}</div>${storyNotes(notes)}`;
}
function storyNotes(notes) {
  return notes?.length ? `<div class="story-notes"><h4 class="story-just">${ui('ear')} Just for you <span class="private-tag">Private</span></h4><ul>${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
}
// Full-screen check card for the investigator step that just got its answer (v4). UI state only.
function checkOverlay(v) {
  const c = S.ui.checkCard;
  if (!v.story || !c) return '';
  return `<div class="check-card${c.kind === 'alignment' && c.text === 'MAFIA' ? ' is-mafia' : c.kind === 'role' ? ' is-role' : ''}" data-a="closeCheck" role="dialog" aria-modal="true" aria-label="Show this card">
    ${c.caption ? `<p class="check-caption">${c.num ? `<span class="call-badge" data-num="${c.num}" aria-hidden="true">${c.num}</span>` : ''}<span>${esc(c.caption)}</span></p>` : ''}<p class="check-text">${esc(c.text)}</p><p class="check-close">Tap to close</p></div>`;
}
// Opens the card once, the first time a step's answer exists; `again` re-opens it.
function checkFor(v, s, set) {
  if (!v.story) return null;
  const res = liveResult(v, s, set);
  const card = res ? checkCard(roomFromView(v), s, res) : null;
  // The caption names the call and who it checked (the investigator knows both); it never holds the answer.
  return card && { ...card, num: callNum(s.label), caption: checkCaption(s.label || rname(s.roleId), (set.targets || []).map((id) => pname(v, id))) };
}
export const checkCardFor = (s) => checkFor(S.view, s, S.ui.night.actions[s.key]);
function syncCheck(v, steps) {
  if (!v.story) return;
  const seen = (S.ui.checkSeen ||= {});
  const key = (s) => `${v.night}:${s.key}`;
  for (const s of steps) {
    const set = S.ui.night.actions[s.key];
    const card = set && checkFor(v, s, set);
    if (!card) { delete seen[key(s)]; continue; }
    if (!seen[key(s)]) { seen[key(s)] = 1; S.ui.checkCard = card; }
  }
}

// A line the host reads aloud, in the same ear-icon style as the live answers.
function sayLine(text) { return `<div class="tell-now"><p class="tell-say"><span class="tell-tag">Say:</span> <b>${esc(text)}</b></p></div>`; }
function gestureLine(text) { return `<div class="tell-now"><p class="tell-say is-gesture"><span class="tell-tag">Gesture:</span> <b>${esc(text)}</b></p></div>`; }
const plain = (t) => String(t || '').replace(/[\s"“”'‘’]+/g, ' ').trim().toLowerCase();
// The story step already shows its close-eyes line ("Then say"), so the same line is not shown twice.
const doneLines = (v, s, set) => doneStepLines(s, liveResult(v, s, set))
  .filter((l) => !(l.type === 'say' && v.story?.steps?.[s.key]?.then && plain(l.text) === plain(v.story.steps[s.key].then)))
  .map((l) => (l.type === 'gesture' ? gestureLine(l.text) : sayLine(l.text))).join('');

// Live result for an investigator; null when there is none yet (not live, no target, or a coin flip pending).
function liveResult(v, s, set) {
  if (s.kind !== 'action' || !LIVE.includes(s.type) || !(set?.targets?.length || (s.type === 'execCheck' && set?.on))) return null;
  if (COIN.includes(s.check) && !set.coin) return null;
  try { return previewNight(roomFromView(v), S.ui.night.actions, s.key); } catch { return null; }
}

// Live answer for an investigator, worked out from the choices of everyone who woke earlier tonight.
// Confused Detective: a 3D coin flip lands on the stored coin (set.flip), then the result, gesture and close-eyes cue fade in.
// set.flipAt is when the target was entered; a re-render mid-flip joins the animation where it is instead of restarting it.
const FLIP_MS = dur(400);
const coinAge = (set) => (animOn() && set.flipAt ? Date.now() - set.flipAt : Infinity);
function coinEl(set) {
  const heads = set.flip === 'heads'; const age = coinAge(set); const live = age < FLIP_MS;
  return `<div class="coin-stage"><div class="coin3d${live ? ' is-flipping' : ''}" data-face="${heads ? 'heads' : 'tails'}" style="--coin-end:${heads ? 360 : 540}deg;${live ? `animation-delay:-${Math.round(age)}ms` : ''}" aria-hidden="true">
    <span class="coin-face coin-heads">H</span><span class="coin-face coin-tails">T</span></div>
    <p class="coin-label${live ? ' is-waiting' : ''}"${live ? ` style="animation-delay:${FLIP_MS - Math.round(age)}ms"` : ''} role="status">${heads ? 'Heads: TRUE answer' : 'Tails: FLIPPED answer'}</p></div>`;
}
function afterCoin(s, set, html) {
  if (s.check !== 'random' || s.silentFlip || !html) return html;
  const age = coinAge(set); const wait = age < FLIP_MS;
  return `<div class="coin-after${wait ? ' is-waiting' : ''}"${wait ? ` style="animation-delay:${FLIP_MS - Math.round(age)}ms"` : ''}>${html}</div>`;
}
function tellNow(v, s, set) {
  if (s.kind !== 'action' || !LIVE.includes(s.type) || !set?.targets?.length) return '';
  const nightOnly = s.type === 'investigate' ? v.nightVersion >= 5 : v.nightVersion >= 7; // the check card is the only place the answer appears
  if (s.check === 'random' && set.flip && !s.silentFlip) {
    const res = liveResult(v, s, set);
    return coinEl(set) + (res && !nightOnly ? afterCoin(s, set, `<div class="tell-now"><p class="tell-say">${ui('ear')} Tell them now: <b>${esc(res.text)}</b></p></div>`) : '');
  }
  if (COIN.includes(s.check) && !set.coin) {
    return `<div class="tell-now"><p class="note is-private">${ui('ear')} This result is a coin flip. Flip it now and say the answer as if it were true.</p>
      <button type="button" class="btn" data-a="coin" data-key="${s.key}">${ui('coin')} Flip a coin</button></div>`;
  }
  const res = liveResult(v, s, set);
  if (!res || nightOnly) return '';
  if (res.blocked) return `<div class="tell-now"><p class="note is-private">${ui('ear')} ${esc(res.note)} Tell them nothing happened.</p></div>`;
  return `<div class="tell-now"><p class="tell-say">${ui('ear')} Tell them now: <b>${esc(res.text)}</b></p>${res.note ? `<p class="note is-private">${esc(res.note)}</p>` : ''}</div>`;
}

// Legacy rooms (night script < latest): host-only opt-in, applied when the next night starts, never mid-step.
function upgradeCard(v) {
  if (v.nightVersion >= upgradeTarget(v) || v.phase === 'lobby') return '';
  const queued = !!v.upgradeNext;
  return `<section class="block upgrade-night"><h2 class="block-title">Use the new night script from next night</h2>
    <p class="callout" role="note">${ui('info')} <span>${v.nightVersion >= 2 ? 'Adds the v9 order: the Mafia pick before the Doctor and Bodyguard. A blocked player still wakes and picks. Two players with the same role each get a number. Also the v8 rules: a Doctor and Bodyguard on one target save both, used-up roles are still called, the Coroner and Psychic get less certain, and an Executioner whose target dies becomes a Jester.' : 'Dead roles are still called at night, so nobody can tell who died.'} Takes effect when the next night starts; nothing changes mid-step.</span></p>
    ${queued ? `<p class="note is-private">Switches on at the start of night ${v.night + 1}.</p><button type="button" class="btn ghost" data-a="upgradeNight" data-off="1">Undo</button>`
      : `<button type="button" class="btn" data-a="upgradeNight">Use the new night script</button>`}</section>`;
}

// ---------------- day ----------------
function day(v) {
  if (!S.ui.dayStage) { const saved = loadDayStage(store, v.code, v.gameNo, v.day); if (saved) S.ui.dayStage = saved; } // a refresh mid-talk comes back to the step
  const ds = S.ui.dayStage?.day === v.day ? S.ui.dayStage : {};
  const m = dayModel(v, { stage: ds.stage, minutes: ds.minutes, startedAt: ds.startedAt, talkDone: ds.talkDone, sel: S.ui.condemn, result: S.ui.dayResult?.day === v.day ? S.ui.dayResult.text : '' }, v.config.rules?.revealOnDeath !== false);
  const { rep, alive } = m;
  const pend = v.pending.map((p) => `<section class="cue is-current pending"><div class="cue-body">
      <span class="meta">${esc(pname(v, p.playerId))}</span><p class="say">${esc(p.text)}</p>
      <div class="pick">${alive.map((q) => `<button type="button" class="pk" data-a="pend" data-pid="${p.id}" data-id="${q.id}">${esc(q.name)}</button>`).join('')}</div>
      <button type="button" class="link" data-a="pend" data-pid="${p.id}" data-id="">Nobody</button></div></section>`).join('');
  const names2 = (ids) => ids.map((id) => pname(v, id)).join(' and ');
  let current;
  if (m.stage === 'morning') {
    const said = v.story?.morning?.say || `The sun is up. ${rep.deaths.length ? `${names2(rep.deaths.map((d) => d.id))} did not survive the night.` : 'Nobody died last night.'}`;
    current = card({ kicker: 'Morning', key: 'morning', say: said, todo: 'Read this out, then tap Next.' });
  } else if (m.stage === 'talk') {
    current = card({ kicker: 'Talk', key: 'talk', say: 'Talk it out', todo: TALK_TODO, body: talkBody(m.talk) });
  } else if (m.stage === 'vote') {
    const sel = m.sel;
    current = card({ kicker: 'Vote', key: 'vote', say: m.say, todo: 'Tap who’s out.', dead: 'A tie? Tap No one, or vote again.',
      body: tokens(alive.map((p) => ({ id: p.id, name: p.name })), { picked: sel && sel !== 'none' ? [sel] : [], action: 'selCondemn', none: { on: sel === 'none', attrs: 'data-a="selCondemn" data-id="none"' } }) });
  } else current = card({ kicker: `Night ${v.night + 1}`, key: 'night', todo: v.pending.length ? 'Answer the questions below first.' : `Tap Start night ${v.night + 1} when everyone is ready.` });
  const private_ = rep ? `${rep.info.length ? `<section class="whisper"><h3 class="whisper-title">${ui('ear')} Tell these players in private</h3>
        ${rep.info.map((i) => `<div class="whisper-item">${names(v, i.actorIds)} <span class="muted">${esc(rname(i.roleId))}</span><p>${esc(i.text)}</p>${i.note ? `<p class="note is-private">${esc(i.note)}</p>` : ''}</div>`).join('')}</section>` : ''}
      ${v.story?.morning ? storyNotes(v.story.morning.notes) : `<ul class="events">${rep.saves.map((x) => `<li class="event is-save">${ui('save')}<div>${esc(x.text)}</div></li>`).join('')}${rep.conversions.map((c) => `<li class="event is-convert">${ui('convert')}<div>${esc(c.text)}</div></li>`).join('')}${rep.notes.map((t) => `<li class="event is-note">${ui('info')}<div>${esc(t)}</div></li>`).join('')}</ul>`}` : '';
  const abilities = alive.filter((p) => ROLE_BY_ID[p.roleId]?.day).map((p) => {
    const r = ROLE_BY_ID[p.roleId]; const used = v.dayUsed[p.id] || 0; const max = r.dayUses;
    return `<div class="arow"><span class="arow-glyph a-${r.alignment}">${ico(r)}</span><span class="arow-name"><b>${esc(p.name)}</b> <span class="muted">${esc(r.day)}</span></span>
      ${max ? `<button type="button" class="mini" aria-pressed="${used >= max}" data-a="useDay" data-id="${p.id}">${used} of ${max} used</button>` : ''}</div>`;
  }).join('');
  const priv = private_.trim() || abilities ? `<button type="button" class="linkish st-peek" data-a="toggleUi" data-k="privOpen" aria-expanded="${!!S.ui.privOpen}">${ui('ear')} Private notes for today</button>${S.ui.privOpen ? `${private_}${abilities ? `<section class="block abilities"><h2 class="block-title">Day abilities</h2>${abilities}</section>` : ''}` : ''}` : '';
  const body = `<header class="phase-head"><h2 class="phase-title">Day ${v.day}</h2></header>${upgradeCard(v)}${pend}
    <ol class="cues one st-rail" data-night>${m.done.map((d) => `<li class="st-line is-done" data-sk="${d.key}"><span class="st-dot" aria-hidden="true"></span><span class="st-tick" aria-hidden="true">${ui('check')}</span><span class="st-text">${esc(d.text)}</span></li>`).join('')}${current}${m.upcoming.map((u) => `<li class="st-line is-next" data-sk="${u.key}"><span class="st-dot" aria-hidden="true"></span><span class="st-text">${esc(u.name)}</span></li>`).join('')}</ol>${priv}`;
  const b = m.button;
  return { body, dock: btn(b.enabled && b.action === 'startNight' ? 'big secondary' : 'big', b.action, b.label, { on: b.enabled && !(!['startNight', 'dayVote', 'dayTalk'].includes(b.action) && v.pending.length), why: v.pending.length ? 'Answer the questions above first' : b.why }) };
}

// ---------------- over ----------------
function over(v) {
  const w = v.winner;
  const winners = new Set(v.winners.map((x) => x.id));
  const side = { town: 'Town wins', mafia: 'Mafia wins', killer: 'Serial Killer wins', cult: 'Cult wins', none: 'Nobody wins', draw: 'It’s a draw' }[w?.side] || `${esc(w?.side || 'Nobody')} wins`;
  const ink = { town: 'a-town', mafia: 'a-mafia', none: '', draw: '' }[w?.side] ?? 'a-third';
  const players = v.players.map((p) => ({ ...p, win: winners.has(p.id) }));
  return {
    body: `<section class="win ${ink}"><span class="win-mark">${ui('crown')}</span><h2 class="phase-title">${side}</h2><p class="muted">${esc(w?.reason || '')}</p></section>
      <div class="cast-wrap${S.ui.anim === 'roles' ? ' reveal-rows' : ''}">${castList(players, (p) => ROLE_BY_ID[p.roleId])}</div>`,
    dock: `<div class="end-actions"><button type="button" class="btn big" data-a="restart">Restart</button><button type="button" class="btn ghost" data-a="restartSetup">Change setup first</button></div>`,
  };
}

// ---------------- side panes ----------------
function tablePane(v) {
  return `<header class="block-head"><h2 class="block-title">Table</h2></header>
    <p class="muted">${v.players.length ? 'Tap a seat to add markers, a note or a role.' : 'Seats appear here as players join.'}</p>
    ${board(v, true)}${legend(v)}`;
}
function roster(v) {
  const lobbyPhase = v.phase === 'lobby';
  const rows = v.players.map((p) => {
    const r = p.roleId && !maskedLocal(v, p) ? ROLE_BY_ID[p.roleId] : null;
    return `<li><button type="button" class="rrow ${r ? `a-${r.alignment}` : ''} ${p.alive ? '' : 'is-dead'}" data-a="seat" data-id="${p.id}">
      <span class="rrow-glyph">${r ? ico(r) : initial(p.name)}</span><span class="rrow-name">${esc(p.name)}</span>
      ${r ? `<span class="rrow-role">${esc(r.name)}</span>` : lobbyPhase ? '' : `<span class="rrow-role is-unknown">${p.roleId ? 'Hidden for now' : 'Not known yet'}</span>`}
      ${p.note ? `<span class="rrow-note">${esc(p.note)}</span>` : ''}
      ${p.alive ? '' : `<span class="rrow-mark" aria-label="dead">${ui('skull')}</span>`}
      <span class="seat-dots">${(p.tags || []).map((t) => `<i class="dot d-${t}"></i>`).join('')}</span></button></li>`;
  }).join('');
  return `<h2 class="block-title">Who is who</h2>${rows ? `<ul class="roster">${rows}</ul>` : empty('table', 'Players appear here as they join.')}`;
}
const LOG_KIND = [[/killed|dies|died|shot|eliminated|voted out|lynch|executed|poison/i, 'kill', 'skull'], [/saved|protect|guard|healed|shield|survive/i, 'save', 'shield'],
  [/investigat|checked|searched|learn|watch|track|autopsy/i, 'look', 'eye'], [/jail|block|silenc|frame|clean|convert|swap/i, 'act', 'hand']];
const hl = (text, names) => {
  const t = esc(text);
  const list = [...new Set(names)].filter((n) => n && n.length > 1).sort((a, b) => b.length - a.length).map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return list.length ? t.replace(new RegExp(`(^|[^\\w])(${list.join('|')})(?![\\w])`, 'g'), '$1<mark>$2</mark>') : t;
};
function logPane(v) {
  const names = [...(v.players || []).map((p) => p.name), v.me?.name];
  let last = '';
  const lines = [...v.log].reverse().map((l) => {
    const text = l.text.replace(/ \(host\)\./, ' by the Host.');
    const kind = LOG_KIND.find(([re]) => re.test(text));
    const icon = ui(kind ? kind[2] : l.phase === 'night' ? 'moon' : l.phase === 'day' ? 'sun' : 'cards');
    const num = l.phase === 'night' ? l.night : l.phase === 'day' ? l.day : '';
    const key = `${l.phase}:${num}`;
    const head = key !== last && num ? `<li class="log-round is-${l.phase}">${ui(l.phase === 'night' ? 'moon' : 'sun')}<span>${l.phase === 'night' ? 'Night' : 'Day'} ${num}</span></li>` : '';
    if (num) last = key;
    return `${head}<li class="logl${kind ? ` k-${kind[1]}` : ''}">${icon}<span class="logl-text">${hl(text, names)}</span></li>`;
  }).join('');
  return `<h2 class="block-title">Log</h2>
    ${lines ? `<div class="log-head" aria-hidden="true"><span></span><span>Round · What happened</span></div><ol class="log">${lines}</ol>` : empty('log', 'The log fills up once night 1 starts.')}
    ${v.sideWins.length ? `<section class="block"><h2 class="block-title">Side wins</h2>${v.sideWins.map((s) => `<p class="note">${ui('trophy')} ${esc(s.reason)}</p>`).join('')}</section>` : ''}
    ${v.phase !== 'lobby' && v.phase !== 'over' ? `<section class="block tools"><h2 class="block-title">Host tools</h2>
      <div class="btn-row"><button type="button" class="btn ghost" data-a="declare">${ui('crown')} Declare a winner</button><button type="button" class="btn ghost" data-a="restartAsk">Restart</button></div></section>` : ''}`;
}

// ---------------- custom role editor ----------------
function roleModal() {
  const d = S.ui.draft.role || { alignment: 'town', action: { type: '' } };
  const types = ACTION_TYPES;
  const labels = { kill: 'Kill', protect: 'Protect from kills', guard: 'Guard (take the hit)', alert: 'Alert (kills visitors)', jail: 'Jail', block: 'Block a player', blockVisitors: 'Block everyone visiting a player', frame: 'Frame as Mafia', clean: 'Hide the victim’s role', convert: 'Convert to Mafia', copyRole: 'Copy a dead player’s role', investigate: 'Investigate', track: 'Track (who they visited)', watch: 'Watch (who visited)', autopsy: 'Examine a dead player' };
  const a = d.action || {};
  const check = (k, on, text) => `<label class="check"><input type="checkbox" data-i="rf" data-k="${k}" ${on ? 'checked' : ''}> ${text}</label>`;
  return `<div class="overlay" data-a="closeModal"><div class="modal${S.ui.anim === 'modal' ? ' is-entering' : ''}" data-stop="1" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header class="modal-head"><h2 class="block-title" id="m-title">New role</h2>
      <button type="button" class="icon-btn x-btn" data-a="closeModal" aria-label="Close">${ui('x')}</button></header>
    <div class="field-group">
      <label class="field"><span>Name</span><input data-i="rf" data-k="name" maxlength="24" value="${esc(d.name || '')}"></label>
      <div class="field-row">
        <label class="field"><span>Emoji</span><input data-i="rf" data-k="emoji" maxlength="4" value="${esc(d.emoji || '')}" placeholder="🦉"></label>
        <label class="field"><span>Team</span><select data-i="rf" data-k="alignment">${['town', 'mafia', 'third'].map((x) => `<option value="${x}" ${d.alignment === x ? 'selected' : ''}>${teamName(x)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>What it does</span><textarea data-i="rf" data-k="blurb" rows="2" maxlength="200">${esc(d.blurb || '')}</textarea></label>
    </div>
    <div class="field-group">
      <label class="field"><span>Night action</span><select data-i="rf" data-k="action.type"><option value="">None</option>${types.map((t) => `<option value="${t}" ${a.type === t ? 'selected' : ''}>${labels[t] || t}</option>`).join('')}</select></label>
      ${a.type === 'investigate' ? `<label class="field"><span>What they learn</span><select data-i="rf" data-k="action.check">${[['alignment', 'Mafia or not'], ['role', 'Exact role'], ['inverted', 'Backwards'], ['parity', 'Whether two players are on the same side'], ['fake', 'Random']].map(([k, l]) => `<option value="${k}" ${a.check === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      ${a.type ? `<label class="field"><span>Uses per game (leave blank for every night)</span><input data-i="rf" data-k="action.uses" type="number" min="1" max="9" inputmode="numeric" value="${esc(a.uses || '')}"></label>` : ''}
      <label class="field"><span>Day ability reminder (optional)</span><input data-i="rf" data-k="day" maxlength="120" value="${esc(d.day || '')}"></label>
      <label class="field"><span>When condemned (optional)</span><input data-i="rf" data-k="onCondemn" maxlength="120" value="${esc(d.onCondemn || '')}"></label>
    </div>
    <div class="checks">
      ${check('nightImmune', d.nightImmune, 'Can’t be killed at night')}
      ${check('retaliate', d.retaliate, 'Kills its attacker')}
      ${check('appearsMafia', d.appearsAs === 'mafia', 'Looks like Mafia to a Detective')}
      ${check('appearsInnocent', d.appearsAs === 'innocent', 'Looks innocent to a Detective')}
      ${d.alignment === 'mafia' ? check('meetingMafia', d.meeting === 'mafia', 'Joins the Mafia night meeting') : ''}
      ${d.alignment === 'third' ? check('jesterWin', d.sideWin === 'condemned', 'Wins if condemned') : ''}
    </div>
    <div class="btn-row modal-foot"><button type="button" class="btn ghost" data-a="closeModal">Cancel</button><button type="button" class="btn" data-a="saveRole">Save role</button></div>
  </div></div>`;
}
