// Storyteller (host) screens.
// Layout (DESIGN.md 6.2): app bar, then a console with the game pane and a side (table, who is who, log).
// Phones show one pane at a time via the tab bar; tablets show game + side switch; wide screens show everything.
import { S, esc, initial, loadLibrary } from './state.js';
import { ROLES, ROLE_BY_ID, registerRoles, ACTION_TYPES } from './roles.js';
import { board, legend, sheet, roleChip, pc, cardText, teamName } from './board.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { previewNight, stepCues, doneStepLines, START_CUE, END_CUE, setupWarnings, balanceOf, DEFAULT_RULES } from './engine.js';
import { roomFromView } from './room.js';
import { THEMES } from './theme.js';
import { toolsButton, toolsPanel } from './tools.js';
import { animOn } from './fx.js';

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
  const title = local ? 'On this device<span class="appbar-sub">Private to this device</span>' :`<button type="button" class="appbar-code" data-a="showCode" aria-label="Show room code ${esc(v.code)} full screen">Room <b class="code">${esc(v.code)}</b>${ui('expand')}</button>`;
  const [picon, plabel] = v.phase === 'night' ? ['moon', `Night ${v.night}`] : v.phase === 'day' ? ['sun', `Day ${v.day}`] : PHASE[v.phase];
  const { body, dock } = ({ lobby, dealt, night, day, over })[v.phase](v, local);
  const tabs = [['game', 'Game'], ['table', 'Table'], ['log', 'Log']];
  return `<header class="appbar">
    <a class="appbar-mark" href="#/" aria-label="Home page">${ui('brand')}<span class="appbar-mark-label">Home</span></a>
    <div class="appbar-title">${title}</div>
    <span class="phase-badge">${ui(picon)} ${plabel}</span>${v.phase === 'lobby' ? '' : toolsButton()}
    <button type="button" class="icon-btn anim-toggle" data-a="toggleAnim" role="switch" aria-checked="${animOn()}" aria-label="Animations" title="Animations ${animOn() ? 'on' : 'off'}">${ui('sparkle')}</button>
  </header>
  <main class="console" data-tab="${tab}" data-side="${side}">
    <section class="pane pane-game" aria-label="Game">${body}
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
  ${sheet(v)}${S.ui.showKey ? keyOverlay(v) : ''}${S.ui.showCode && !local ? codeOverlay(v) : ''}${S.ui.modal === 'role' ? roleModal() : ''}${S.ui.tools ? toolsPanel(v, true) : ''}`;
}

// ---------------- lobby ----------------
function lobby(v, local) {
  const n = v.players.length;
  const c = v.config;
  const min = v.limits.min;
  const link = `${location.origin}/#/join/${v.code}`;
  const counts = {};
  for (const id of c.roles) counts[id] = (counts[id] || 0) + 1;
  const lib = loadLibrary();

  const joinCode = local ? `<p class="note local-note">${ui('phone')} <span>This game is saved only in this browser on this device. Nobody else can see it, and nothing is sent online. Opening the site somewhere else starts fresh.</span></p>` : `<section class="block join-code">
    <p class="muted">Players go to <b>${esc(joinSite())}</b> and enter</p>
    <div class="room-code code" aria-label="Room code ${esc(v.code.split('').join(' '))}">${esc(v.code)}</div>
    <div class="join-actions">
      <button type="button" class="btn" data-a="showCode">${ui('expand')} Show code full screen</button>
      <button type="button" class="btn ghost" data-a="copy" data-v="${esc(link)}">${ui('copy')} Copy join link</button>
    </div>
  </section>`;

  const status = (p) => (local ? '' : p.offline
    ? `<span class="person-status" title="No phone: added by you">${ui('pencil')}</span>`
    : `<span class="person-status ${p.connected ? 'is-on' : ''}" title="${p.connected ? 'Connected on their phone' : 'Phone not connected'}">${ui('phone')}</span>`);
  const people = n
    ? `<ul class="people">${v.players.map((p) => `<li class="person ${p.offline || p.connected ? '' : 'is-offline'}"><span class="person-name">${esc(p.name)}</span>${status(p)}<button type="button" class="icon-btn" data-a="rmPlayer" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ui('x')}</button></li>`).join('')}</ul>`
    : empty('user', local ? 'Nobody’s here yet. Add everyone’s names below.' : 'Nobody’s here yet. Share the code, or add names for people without phones.');
  const players = `<section class="block players">
    <header class="block-head"><h2 class="block-title">Players</h2>${n ? `<span class="tally" data-tick="players">${plural(n, 'player')}</span>` : ''}</header>
    ${people}
    <label class="field"><span>${local ? 'Add players (one per line, or separated by commas)' : 'Add players without phones (one per line, or separated by commas)'}</span>
      <textarea data-i="names" rows="2" placeholder="Sam, Priya, Jo">${esc(S.ui.draft.names || '')}</textarea></label>
    <button type="button" class="btn ghost" data-a="addNames">${ui('plus')} Add players</button>
    ${local && (n || c.roles.length) ? `<button type="button" class="btn ghost danger" data-a="resetLocal">${ui('x')} Start over with no players</button>` : ''}
  </section>`;

  // Roles: the hand you are building, then the catalogue.
  const need = Math.max(n, min);
  const have = c.roles.length;
  const tallyState = have === need ? 'ok' : have < need ? 'short' : 'over';
  const order = [...new Set(c.roles)];
  const deckList = order.length
    ? `<ul class="deck-list">${order.map((id) => { const r = ROLE_BY_ID[id]; if (!r) return '';
      return `<li class="deck-item">${roleChip(r)}<span class="stepper">
        <button type="button" class="icon-btn" data-a="subRole" data-id="${id}" aria-label="One fewer ${esc(r.name)}">${ui('minus')}</button><b class="stepper-n">${counts[id]}</b>
        <button type="button" class="icon-btn" data-a="addRole" data-id="${id}" aria-label="One more ${esc(r.name)}">${ui('plus')}</button></span></li>`; }).join('')}</ul>`
    : '<p class="muted deck-empty">Tap roles below to add them, or let the app suggest a balanced set.</p>';
  const team = S.ui.roleTeam;
  const custom = lib.map((x) => ROLE_BY_ID[x.id] || x);
  const filters = [['all', 'All'], ['town', 'Town'], ['mafia', 'Mafia'], ['third', 'Third party']].concat(custom.length ? [['custom', 'Yours']] : []);
  const list = team === 'custom' ? custom : team === 'all' ? [...ROLES, ...custom] : ROLES.filter((r) => r.alignment === team);
  const tile = (r) => `<div class="role-tile a-${r.alignment} ${counts[r.id] ? 'is-picked' : ''}" data-name="${esc(r.name.toLowerCase())}" data-team="${r.alignment}">
      <button type="button" class="role-add" data-a="addRole" data-id="${r.id}" aria-label="Add ${esc(r.name)}${counts[r.id] ? ` (${counts[r.id]} in the game)` : ''}"><span class="role-glyph">${ico(r)}</span><span class="role-name">${esc(r.name)}</span></button>
      ${counts[r.id] ? `<span class="role-count" aria-hidden="true">${counts[r.id]}</span>` : ''}
      <button type="button" class="icon-btn role-info rc-i" data-a="info" data-id="${r.id}" aria-label="About ${esc(r.name)}">${ui('info')}</button>
    </div>`;
  const roles = `<section class="block roles">
    <header class="block-head"><h2 class="block-title">Roles</h2>
      <span class="tally" data-state="${tallyState}">${ui(tallyState === 'ok' ? 'check' : 'warning')} ${have} of ${need} roles</span></header>
    <div class="btn-row">
      <button type="button" class="btn ${have ? 'ghost' : ''}" data-a="suggest">${ui('sparkle')} Suggest roles for ${need} players</button>
      ${have ? '<button type="button" class="btn ghost" data-a="clearRoles">Clear</button>' : ''}
      <button type="button" class="btn ghost" data-a="newRole">${ui('plus')} New role</button>
    </div>
    ${deckList}${advice(c.roles, n)}
    <div class="role-filter" role="tablist" aria-label="Show roles from">${filters.map(([k, l]) => `<button type="button" role="tab" aria-selected="${team === k}" tabindex="${team === k ? 0 : -1}" class="${k === 'all' || k === 'custom' ? '' : `a-${k}`}" data-a="roleTeam" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="search-field">${ui('search')}<input class="search" data-i="search" placeholder="Search roles" aria-label="Search roles" value="${esc(S.ui.search)}"></label>
    <div class="role-grid">${list.map(tile).join('')}</div>
    <p class="muted search-empty" hidden>No roles match that search.</p>
  </section>`;

  const short = min - n;
  const blocked = have === n && setupWarnings(c.roles, n).some((w) => w.level === 'error');
  const label = n < min ? `Add ${plural(short, 'more player')}` : have < n ? `Pick ${plural(n - have, 'more role')}` : have > n ? `Remove ${plural(have - n, 'role')}` : blocked ? 'Fix the setup above first' : 'Deal roles';
  const ready = n >= min && have === n && !blocked;
  return {
    body: `${joinCode}${players}${dealSetup(c, local)}${gameStyle(c, local)}${roles}`,
    dock: btn('big', 'deal', label, { on: ready }),
  };
}

// "How do players get their roles?" A guided choice (DESIGN.md section 9).
function choices(qid, key, cur, opts) {
  return `<div class="choices" role="radiogroup" aria-labelledby="${qid}">${opts.map((o) => { const on = cur === o.v;
    return `<button type="button" class="choice" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-a="cfg" data-k="${key}" data-v="${o.v}">
      <span class="choice-mark" aria-hidden="true"></span>
      <span class="choice-icon">${ui(o.icon)}</span>
      <span class="choice-text"><span class="choice-title">${o.title}${o.rec ? ' <span class="choice-tag">Recommended</span>' : ''}</span>
        <span class="choice-desc">${o.desc}</span></span>
    </button>`; }).join('')}</div>`;
}
function dealSetup(c, local) {
  const flow = choices('q-flow', 'cardFlow', c.cardFlow, [
    { v: 'blind', icon: 'eye', rec: true, title: 'They check the card key',
      desc: 'You show the key to the table and each player finds their card. You learn who’s who on night 1 as each role wakes.' },
    local
      ? { v: 'claim', icon: 'pencil', title: 'You enter each player’s card',
        desc: 'Players show you their card in private and you record it. You know every role before night 1.' }
      : { v: 'claim', icon: 'phone', title: 'They enter their card on their phone',
        desc: 'Each player taps their card on their own phone and sees their role in private. You see every role right away.' },
  ]);
  const open = !!S.ui.dealMore;
  const keyNow = c.deckStyle === 'fixed' ? 'same every game' : 'new every game';
  const more = `<button type="button" class="disclosure" aria-expanded="${open}" aria-controls="more-deck" data-a="toggleUi" data-k="dealMore">
      ${ui('caret-down', open ? 'is-open' : '')} More card options <span class="disclosure-value">Card key: ${keyNow}</span></button>
    <div class="disclosure-body" id="more-deck" ${open ? '' : 'hidden'}>
      <h3 class="followup-q" id="q-key">Which card stands for which role?</h3>
      ${choices('q-key', 'deckStyle', c.deckStyle, [
        { v: 'random', icon: 'convert', rec: true, title: 'A new key every game',
          desc: 'Cards are matched to roles at random each deal, so nobody remembers last game’s key.' },
        { v: 'fixed', icon: 'cards', title: 'The same key every game',
          desc: 'Each role keeps its usual card, such as the ace of spades for Mafia. Handy if your group plays often.' },
      ])}
    </div>`;
  if (local) {
    return `<section class="block deal-setup">
      <p class="deal-fixed">${ui('cards')} You’ll hand out card codes and run the game from this device.</p>
      <p class="deal-switch muted">Want everyone to get their role on their own phone? <button type="button" class="linkish" data-a="hostLive">Host a game with a room code instead</button></p>
      <div class="followup followup--top">
        <h3 class="followup-q" id="q-flow">How does each player find out their role?</h3>
        ${flow}${more}
      </div>
    </section>`;
  }
  return `<section class="block deal-setup">
    <h2 class="block-title" id="q-mode">How do players get their roles?</h2>
    ${choices('q-mode', 'mode', c.mode, [
      { v: 'app', icon: 'phone', rec: true, title: 'On their phones',
        desc: 'Everyone joins with the room code and sees their role in private.' },
      { v: 'cards', icon: 'cards', title: 'With a card key',
        desc: 'You hand out card codes. The app tells you which code is which role.' },
    ])}
    ${c.mode === 'cards' ? `<div class="followup">
      <h3 class="followup-q" id="q-flow">How does each player find out their role?</h3>
      ${flow}${more}
    </div>` : ''}
  </section>`;
}

// Mafia or Werewolf words, and house rules. data-raw: the theme layer must not rename these labels.
const RULES = [
  ['revealOnDeath', 'Show a player’s role when they die', 'Off: roles stay secret until the game ends.'],
  ['selfProtect', 'Doctors can protect themselves', 'Off: protectors must pick someone else.'],
  ['firstNightKill', 'Kills on the first night', 'Off: on night 1 the Mafia only meet each other.'],
  ['dayStart', 'Start with a day', 'Everyone talks and votes before the first night.'],
];
function gameStyle(c, local) {
  const rules = { ...DEFAULT_RULES, ...(c.rules || {}) };
  const blind = (local || c.mode === 'cards') && c.cardFlow === 'blind';
  const changed = RULES.filter(([k]) => rules[k] !== DEFAULT_RULES[k]).length;
  const open = !!S.ui.rulesOpen;
  return `<section class="block game-style" data-raw>
    <h2 class="block-title" id="q-theme">Mafia or Werewolf?</h2>
    ${choices('q-theme', 'theme', THEMES[c.theme] ? c.theme : 'city', Object.entries(THEMES).map(([v, t]) => ({ v, icon: v === 'village' ? 'wolf' : 'fedora', title: t.label, desc: `${t.note} Same roles and rules, different names.` })))}
    <button type="button" class="disclosure" aria-expanded="${open}" aria-controls="house-rules" data-a="toggleUi" data-k="rulesOpen">
      ${ui('caret-down', open ? 'is-open' : '')} House rules <span class="disclosure-value">${changed ? `${changed} changed` : 'Standard'}</span></button>
    <div class="disclosure-body rules" id="house-rules" ${open ? '' : 'hidden'}>
      ${RULES.map(([k, title, desc]) => {
        const off = k === 'dayStart' && blind;
        return `<button type="button" class="rule" role="switch" aria-checked="${rules[k] && !off}" data-a="rule" data-k="${k}" ${off ? 'aria-disabled="true" data-why="With a blind card deal, night 1 is when you learn who is who."' : ''}>
          <span class="rule-text"><span class="rule-title">${title}</span><span class="rule-desc">${off ? 'Not with a blind card deal: night 1 is when you learn who is who.' : desc}</span></span>
          <span class="switch" aria-hidden="true"><i></i></span></button>`;
      }).join('')}
    </div>
  </section>`;
}

// Warnings about the role mix, shown under the hand being built.
function advice(roleIds, n) {
  if (!roleIds.length) return '';
  const ws = setupWarnings(roleIds, n);
  const b = balanceOf(roleIds);
  // The meter runs from -15 (Mafia) to +15 (Town); the marker sits at the setup's score.
  const pos = Math.max(0, Math.min(100, 50 + (b.score / 15) * 50));
  const meter = `<div class="balance" data-strength="${b.strength}" data-verdict="${b.verdict}">
    <div class="balance-head"><span class="balance-title">Balance</span><span class="balance-text">${esc(b.text)}</span></div>
    <div class="balance-bar" role="meter" aria-valuemin="-15" aria-valuemax="15" aria-valuenow="${b.score}" aria-label="Balance: ${esc(b.text)}">
      <span class="balance-end">Mafia</span><span class="balance-track"><i class="balance-mid"></i><i class="balance-dot" style="left:${pos.toFixed(1)}%"></i></span><span class="balance-end">Town</span></div>
    ${b.strength === 'even' ? '' : `<button type="button" class="btn ghost" data-a="rebalance">${ui('shuffle')} Balance it for me</button>`}
  </div>`;
  const icon = { error: 'warning', warn: 'warning', tip: 'info' };
  return `${meter}${ws.length ? `<ul class="advice">${ws.map((w) => `<li class="note advice-${w.level} ${w.level === 'tip' ? '' : 'is-warn'}">${ui(icon[w.level])} ${esc(w.text)}</li>`).join('')}</ul>` : ''}`;
}

// Steps that get a live result, and checks that are a coin flip by design.
const LIVE = ['investigate', 'track', 'watch', 'autopsy'];
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
  const back = `<button type="button" class="btn ghost" data-a="undeal">${ui('back')} Back to setup</button>`;
  if (!cards) {
    const noPhone = v.players.filter((p) => p.offline && p.roleId);
    return {
      body: `<header class="phase-head"><h2 class="phase-title">Roles are on everyone’s phones</h2>
        <p class="muted">Ask everyone to check their role in private, then start the first night.</p></header>
        ${noPhone.length ? `<section class="whisper"><h3 class="whisper-title">${ui('ear')} Tell these players their role in private</h3>
          ${noPhone.map((p) => `<div class="whisper-item"><b>${esc(p.name)}</b> ${roleChip(ROLE_BY_ID[p.roleId])}</div>`).join('')}</section>` : ''}`,
      dock: `${back}${firstStart(v)}`,
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
  return { body, dock: `${back}${ok ? firstStart(v) : btn('big', 'startNight', `${plural(left, 'player')} still need${left === 1 ? 's' : ''} a card`, { on: false })}` };
}

// big = the key shown to the whole table: disguised roles appear as what they think they are.
// The storyteller's own key shows the truth, with what the player believes.
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
  if (n.n !== v.night) { n.n = v.night; n.actions = {}; n.picks = {}; }
  const steps = v.script;
  const idSteps = steps.filter((s) => s.kind === 'identify');
  const actSteps = steps.filter((s) => s.kind === 'action');
  const pendingAct = actSteps.filter((s) => !n.actions[s.key]);
  const firstOpen = steps.find((s) => s.kind === 'identify' || (s.kind === 'action' && !n.actions[s.key]) || (s.kind === 'info' && !n.actions[s.key]));
  const current = steps.find((s) => s.key === n.focus) || firstOpen;
  const canResolve = !idSteps.length && !pendingAct.length;
  const alive = v.players.filter((p) => p.alive);
  const blind1 = v.night === 1 && v.config.mode === 'cards' && v.config.cardFlow === 'blind';
  const body = `<header class="phase-head"><h2 class="phase-title">Night ${v.night}</h2>
      <p class="muted">${blind1 ? 'Read each line aloud. When a role wakes, tap who it is, then record what they do.' : 'Read each line aloud and record what each role chooses.'}</p>
      ${v.shield ? `<p class="note is-warn">${ui('shield')} Virgin shield: nobody can be killed tonight.</p>` : ''}</header>
    ${steps.length ? `${sayLine(START_CUE)}<ol class="cues">${steps.map((s, i) => cue(v, s, i + 1, s === current, alive)).join('')}</ol>`
      : empty('moon', 'No roles wake tonight. Wake everyone up when you’re ready.')}`;
  const label = canResolve ? 'Wake everyone up' : idSteps.length ? 'Find every role first' : `${plural(pendingAct.length, 'step')} left`;
  return { body: body + (steps.length ? sayLine(END_CUE) : ''), dock: btn('big', 'resolve', canResolve ? `${ui('sun')} ${label}` : label, { on: canResolve, why: label }) };
}

// A line the host reads aloud, in the same ear-icon style as the live answers.
function sayLine(text) { return `<div class="tell-now"><p class="tell-say"><span class="tell-tag">Say:</span> <b>${esc(text)}</b></p></div>`; }
function gestureLine(text) { return `<div class="tell-now"><p class="tell-say is-gesture"><span class="tell-tag">Gesture:</span> <b>${esc(text)}</b></p></div>`; }
const doneLines = (v, s, set) => doneStepLines(s, liveResult(v, s, set))
  .map((l) => (l.type === 'gesture' ? gestureLine(l.text) : sayLine(l.text))).join('');

// Live result for an investigator; null when there is none yet (not live, no target, or a coin flip pending).
function liveResult(v, s, set) {
  if (s.kind !== 'action' || !LIVE.includes(s.type) || !set?.targets?.length) return null;
  if (COIN.includes(s.check) && !set.coin) return null;
  try { return previewNight(roomFromView(v), S.ui.night.actions, s.key); } catch { return null; }
}

// Live answer for an investigator, worked out from the choices of everyone who woke earlier tonight.
// Confused Cop: a 3D coin flip lands on the stored coin (set.flip), then the result, gesture and close-eyes cue fade in.
// set.flipAt is when the target was entered; a re-render mid-flip joins the animation where it is instead of restarting it.
const FLIP_MS = 1200;
const coinAge = (set) => (animOn() && set.flipAt ? Date.now() - set.flipAt : Infinity);
function coinEl(set) {
  const heads = set.flip === 'heads'; const age = coinAge(set); const live = age < FLIP_MS;
  return `<div class="coin-stage"><div class="coin3d${live ? ' is-flipping' : ''}" data-face="${heads ? 'heads' : 'tails'}" style="--coin-end:${heads ? 1080 : 1260}deg;${live ? `animation-delay:-${Math.round(age)}ms` : ''}" aria-hidden="true">
    <span class="coin-face coin-heads">H</span><span class="coin-face coin-tails">T</span></div>
    <p class="coin-label${live ? ' is-waiting' : ''}"${live ? ` style="animation-delay:${FLIP_MS - Math.round(age)}ms"` : ''} role="status">${heads ? 'Heads: TRUE answer' : 'Tails: FLIPPED answer'}</p></div>`;
}
function afterCoin(s, set, html) {
  if (s.check !== 'random' || !html) return html;
  const age = coinAge(set); const wait = age < FLIP_MS;
  return `<div class="coin-after${wait ? ' is-waiting' : ''}"${wait ? ` style="animation-delay:${FLIP_MS - Math.round(age)}ms"` : ''}>${html}</div>`;
}
function tellNow(v, s, set) {
  if (s.kind !== 'action' || !LIVE.includes(s.type) || !set?.targets?.length) return '';
  if (s.check === 'random' && set.flip) {
    const res = liveResult(v, s, set);
    return coinEl(set) + (res ? afterCoin(s, set, `<div class="tell-now"><p class="tell-say">${ui('ear')} Tell them now: <b>${esc(res.text)}</b></p></div>`) : '');
  }
  if (COIN.includes(s.check) && !set.coin) {
    return `<div class="tell-now"><p class="note is-private">${ui('ear')} This result is a coin flip. Flip it now and say the answer as if it were true.</p>
      <button type="button" class="btn" data-a="coin" data-key="${s.key}">${ui('coin')} Flip a coin</button></div>`;
  }
  const res = liveResult(v, s, set);
  if (!res) return '';
  if (res.blocked) return `<div class="tell-now"><p class="note is-private">${ui('ear')} ${esc(res.note)} Tell them nothing happened.</p></div>`;
  return `<div class="tell-now"><p class="tell-say">${ui('ear')} Tell them now: <b>${esc(res.text)}</b></p>${res.note ? `<p class="note is-private">${esc(res.note)}</p>` : ''}</div>`;
}

function cue(v, s, num, current, alive) {
  const n = S.ui.night;
  const r = ROLE_BY_ID[s.roleId];
  const roleEl = r ? roleChip(r) : '';
  const isDone = (s.kind === 'info' || s.kind === 'action') && !!n.actions[s.key];
  if (isDone && !current) {
    const set = n.actions[s.key];
    let result = 'Done';
    if (s.kind === 'action') {
      result = s.targets === 0
        ? (set.on ? (s.type === 'alert' ? 'On alert' : 'Yes') : (s.type === 'alert' ? 'Staying in' : 'No'))
        : set.targets.length ? `Target: ${set.targets.map((id) => esc(pname(v, id))).join(' and ')}` : 'Skipped';
    }
    return `<li class="cue is-done"><span class="cue-n" aria-label="Step ${num}, done">${ui('check')}</span><div class="cue-line">${roleEl}<span class="cue-result">${result}</span>
      ${s.kind === 'action' ? `<button type="button" class="link" data-a="undoStep" data-key="${s.key}">Change</button>` : ''}</div><div class="cue-after">${tellNow(v, s, set)}${afterCoin(s, set, doneLines(v, s, set))}</div></li>`;
  }
  if (!current) {
    const what = s.kind === 'identify' ? 'Find who it is' : s.kind === 'info' ? 'Wake them up' : 'Record their choice';
    return `<li class="cue"><span class="cue-n">${num}</span><button type="button" class="cue-line" data-a="focusStep" data-key="${s.key}">${roleEl}<span class="meta">${what}</span></button></li>`;
  }
  const cues = stepCues(s);
  const hint = s.hint ? `<p class="note is-private">${ui('ear')} ${esc(s.hint)}</p>` : '';
  const say = cues ? `${sayLine(cues.open)}${hint}` : `<p class="note is-private">${ui('ear')} Just for you: ${esc(s.prompt)}</p>`;
  let inner;
  if (s.kind === 'identify') {
    const picks = n.picks[s.key] || [];
    const done = picks.length === s.count;
    inner = `${roleEl}${say}
      <div class="pick">${s.candidates.map((id) => `<button type="button" class="pk" aria-pressed="${picks.includes(id)}" data-a="pick" data-key="${s.key}" data-id="${id}">${esc(pname(v, id))}</button>`).join('')}</div>
      <p class="meta">${picks.length ? `${picks.length} of ${s.count} picked` : `Pick ${plural(s.count, 'player')}`}</p>
      ${btn('', 'confirmId', `${ui('check')} Confirm ${esc(r?.name || '')}`, { on: done, why: `Pick ${plural(s.count - picks.length, 'more player')} first`, attrs: `data-key="${s.key}" data-role="${s.roleId}"` })}`;
  } else if (s.kind === 'info') {
    const rr = ROLE_BY_ID[s.roleId];
    let extra;
    if (rr?.showMafia) extra = `<p class="note">Show them: ${names(v, v.players.filter((p) => p.roleId && ROLE_BY_ID[p.roleId].alignment === 'mafia').map((p) => p.id)) || 'nobody yet'}</p>`;
    else if (rr?.needsTarget) extra = s.actors.map((id) => { const t = v.players.find((p) => p.id === id)?.target; return `<p class="note">${esc(pname(v, id))}’s target: <b>${esc(t ? pname(v, t) : '?')}</b></p>`; }).join('');
    else if (rr?.meeting === 'mason') extra = `<p class="note">Masons: ${names(v, s.actors)}</p>`;
    else extra = `<p class="note">${names(v, s.actors)}</p>`;
    inner = `${roleEl}${say}${extra}${n.actions[s.key] ? '<p class="cue-result">Done</p>' : `<button type="button" class="btn ghost" data-a="infoDone" data-key="${s.key}">${ui('check')} Done</button>`}`;
  } else {
    const who = s.actors.map((id) => esc(pname(v, id))).join(', ');
    const usesLeft = Number.isFinite(s.uses) ? s.uses - (v.usage[s.actors[0]] || 0) : null;
    const head = `${roleEl}<span class="meta">${who}</span>${usesLeft != null ? `<span class="meta">${plural(usesLeft, 'use')} left</span>` : ''}${say}`;
    if (s.targets === 0) {
      const [yes, no] = s.type === 'alert' ? ['Go on alert', 'Not tonight'] : ['Yes', 'No'];
      inner = `${head}<div class="btn-row"><button type="button" class="btn" data-a="alert" data-key="${s.key}" data-v="1">${yes}</button><button type="button" class="btn ghost" data-a="alert" data-key="${s.key}" data-v="0">${no}</button></div>`;
    } else {
      const list = s.dead ? v.players.filter((p) => !p.alive) : alive.filter((p) => (s.type === 'protect' && v.config.rules?.selfProtect !== false) || !s.actors.includes(p.id));
      const picks = n.picks[s.key] || [];
      const need = s.targets || 1;
      inner = `${head}${list.length
        ? `<div class="pick">${list.map((p) => `<button type="button" class="pk" aria-pressed="${picks.includes(p.id)}" data-a="pick" data-key="${s.key}" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>
          <p class="meta">${need > 1 ? `Pick ${need} players${picks.length ? ` (${picks.length} of ${need} picked)` : ''}` : s.dead ? 'Pick 1 dead player' : 'Pick 1 player'}</p>`
        : '<p class="muted">Nobody can be chosen right now.</p>'}
        <button type="button" class="link" data-a="skip" data-key="${s.key}">Skip, nobody tonight</button>`;
    }
  }
  return `<li class="cue is-current" aria-current="step"><span class="cue-n">${num}</span><div class="cue-body">${inner}</div></li>`;
}

// ---------------- day ----------------
function day(v) {
  const rep = v.report && v.report.night === v.night ? v.report : null;
  const alive = v.players.filter((p) => p.alive);
  const sel = S.ui.condemn && alive.some((p) => p.id === S.ui.condemn) ? S.ui.condemn : null;
  let report = `<header class="phase-head"><h2 class="phase-title">Day ${v.day}</h2></header>`;
  if (rep) {
    const deaths = rep.deaths.map((d) => {
      const r = ROLE_BY_ID[v.players.find((p) => p.id === d.id)?.roleId];
      const what = d.hidden ? 'died. Their role stays hidden.' : r ? `was the ${roleChip(r)}` : 'died.';
      return `<li class="event is-death">${ui('skull')}<div><b>${esc(pname(v, d.id))}</b> ${what}<p class="meta">${esc(d.cause)}</p></div></li>`;
    }).join('');
    report = `<header class="phase-head"><h2 class="phase-title">Morning of day ${v.day}</h2></header>
      <ul class="events">
        ${deaths || `<li class="event is-quiet">${ui('sun')}<div>Nobody died last night.</div></li>`}
        ${rep.saves.map((s) => `<li class="event is-save">${ui('save')}<div>${esc(s.text)}</div></li>`).join('')}
        ${rep.conversions.map((c) => `<li class="event is-convert">${ui('convert')}<div>${esc(c.text)}</div></li>`).join('')}
        ${rep.notes.map((t) => `<li class="event is-note">${ui('info')}<div>${esc(t)}</div></li>`).join('')}
      </ul>
      ${rep.info.length ? `<section class="whisper"><h3 class="whisper-title">${ui('ear')} Tell these players in private</h3>
        ${rep.info.map((i) => `<div class="whisper-item">${names(v, i.actorIds)} <span class="muted">${esc(rname(i.roleId))}</span><p>${esc(i.text)}</p>${i.note ? `<p class="note is-private">${esc(i.note)}</p>` : ''}</div>`).join('')}</section>` : ''}`;
  }
  const pend = v.pending.map((p) => `<section class="cue is-current pending"><div class="cue-body">
      <span class="meta">${esc(pname(v, p.playerId))}</span><p class="say">${esc(p.text)}</p>
      <div class="pick">${alive.map((q) => `<button type="button" class="pk" data-a="pend" data-pid="${p.id}" data-id="${q.id}">${esc(q.name)}</button>`).join('')}</div>
      <button type="button" class="link" data-a="pend" data-pid="${p.id}" data-id="">Nobody</button></div></section>`).join('');
  const abilities = alive.filter((p) => ROLE_BY_ID[p.roleId]?.day).map((p) => {
    const r = ROLE_BY_ID[p.roleId]; const used = v.dayUsed[p.id] || 0; const max = r.dayUses;
    return `<div class="arow"><span class="arow-glyph a-${r.alignment}">${ico(r)}</span><span class="arow-name"><b>${esc(p.name)}</b> <span class="muted">${esc(r.day)}</span></span>
      ${max ? `<button type="button" class="mini" aria-pressed="${used >= max}" data-a="useDay" data-id="${p.id}">${used} of ${max} used</button>` : ''}</div>`;
  }).join('');
  const vote = `<section class="block vote"><h2 class="block-title">Who does the town condemn?</h2>
      <div class="pick">${alive.map((p) => `<button type="button" class="pk" aria-pressed="${sel === p.id}" data-a="selCondemn" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>
      <div class="btn-row">${btn('danger', 'condemn', sel ? `${ui('gavel')} Condemn ${esc(pname(v, sel))}` : `${ui('gavel')} Choose who to condemn`, { on: !!sel, why: 'Choose who to condemn' })}
        <button type="button" class="btn ghost" data-a="noCondemn">Nobody today</button></div></section>`;
  return {
    body: `${report}${pend}${vote}${abilities ? `<section class="block abilities"><h2 class="block-title">Day abilities</h2>${abilities}</section>` : ''}`,
    dock: btn('big', 'startNight', v.pending.length ? 'Answer the questions above first' : `Start night ${v.night + 1}`, { on: !v.pending.length, why: 'Answer the questions above first' }),
  };
}

// ---------------- over ----------------
function over(v) {
  const w = v.winner;
  const winners = new Set(v.winners.map((x) => x.id));
  const side = { town: 'Town wins', mafia: 'Mafia wins', killer: 'Serial Killer wins', cult: 'Cult wins', none: 'Nobody wins' }[w?.side] || `${esc(w?.side || 'Nobody')} wins`;
  const ink = { town: 'a-town', mafia: 'a-mafia', none: '' }[w?.side] ?? 'a-third';
  const rows = v.players.map((p) => { const r = ROLE_BY_ID[p.roleId]; const why = v.winners.find((x) => x.id === p.id);
    return `<div class="arow ${winners.has(p.id) ? 'is-winner' : ''}"><span class="arow-glyph ${r ? `a-${r.alignment}` : ''}">${r ? ico(r) : initial(p.name)}</span>
      <span class="arow-name"><b>${esc(p.name)}</b> <span class="muted">${esc(r?.name || 'Role unknown')}</span></span>
      ${p.alive ? '' : `<span class="arow-mark" aria-label="dead">${ui('skull')}</span>`}
      ${why ? `<span class="meta">${ui('trophy')} ${/ team wins$/.test(why.reason) ? 'Won' : esc(why.reason)}</span>` : ''}</div>`; }).join('');
  return {
    body: `<section class="win ${ink}"><span class="win-mark">${ui('crown')}</span><h2 class="phase-title">${side}</h2><p class="muted">${esc(w?.reason || '')}</p></section>
      <section class="block${S.ui.anim === 'roles' ? ' reveal-rows' : ''}"><h2 class="block-title">Final roles</h2>${rows}</section>`,
    dock: `<button type="button" class="btn big" data-a="newGame">New game with the same players</button>`,
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
    const r = p.roleId ? ROLE_BY_ID[p.roleId] : null;
    return `<li><button type="button" class="rrow ${r ? `a-${r.alignment}` : ''} ${p.alive ? '' : 'is-dead'}" data-a="seat" data-id="${p.id}">
      <span class="rrow-glyph">${r ? ico(r) : initial(p.name)}</span><span class="rrow-name">${esc(p.name)}</span>
      ${r ? `<span class="rrow-role">${esc(r.name)}</span>` : lobbyPhase ? '' : '<span class="rrow-role is-unknown">Not known yet</span>'}
      ${p.note ? `<span class="rrow-note">${esc(p.note)}</span>` : ''}
      ${p.alive ? '' : `<span class="rrow-mark" aria-label="dead">${ui('skull')}</span>`}
      <span class="seat-dots">${(p.tags || []).map((t) => `<i class="dot d-${t}"></i>`).join('')}</span></button></li>`;
  }).join('');
  return `<h2 class="block-title">Who is who</h2>${rows ? `<ul class="roster">${rows}</ul>` : empty('table', 'Players appear here as they join.')}`;
}
function logPane(v) {
  const lines = [...v.log].reverse().map((l) => {
    const icon = l.phase === 'night' ? ui('moon') : l.phase === 'day' ? ui('sun') : ui('cards');
    const num = l.phase === 'night' ? l.night : l.phase === 'day' ? l.day : '';
    return `<li class="logl">${icon}<span class="meta">${num || ''}</span> <span class="logl-text">${esc(l.text.replace(/ \(host\)\./, ' by the storyteller.'))}</span></li>`;
  }).join('');
  return `<h2 class="block-title">Log</h2>
    ${lines ? `<ol class="log">${lines}</ol>` : empty('log', 'The log fills up once night 1 starts.')}
    ${v.sideWins.length ? `<section class="block"><h2 class="block-title">Side wins</h2>${v.sideWins.map((s) => `<p class="note">${ui('trophy')} ${esc(s.reason)}</p>`).join('')}</section>` : ''}
    ${v.phase !== 'lobby' && v.phase !== 'over' ? `<section class="block tools"><h2 class="block-title">Storyteller tools</h2>
      <div class="btn-row"><button type="button" class="btn ghost" data-a="declare">${ui('crown')} Declare a winner</button><button type="button" class="btn ghost danger" data-a="newGame">Abandon game</button></div></section>` : ''}`;
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
      ${check('appearsMafia', d.appearsAs === 'mafia', 'Looks like Mafia to investigators')}
      ${check('appearsInnocent', d.appearsAs === 'innocent', 'Looks innocent to investigators')}
      ${d.alignment === 'mafia' ? check('meetingMafia', d.meeting === 'mafia', 'Joins the Mafia night meeting') : ''}
      ${d.alignment === 'third' ? check('jesterWin', d.sideWin === 'condemned', 'Wins if condemned') : ''}
    </div>
    <div class="btn-row modal-foot"><button type="button" class="btn ghost" data-a="closeModal">Cancel</button><button type="button" class="btn" data-a="saveRole">Save role</button></div>
  </div></div>`;
}
