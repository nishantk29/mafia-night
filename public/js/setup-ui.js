// Setup screens as HTML strings: the four-step carousel (three offline), the Presets page, the preview sheet, Customize,
// the own-deck key. Logic lives in setup-store.js and setup-actions.js; this file draws.
import { S, esc, initial } from './state.js';
import { ROLE_BY_ID } from './roles.js';
import { ui } from './ui_icons.js';
import { ico } from './art.js';
import { balanceOf, setupWarnings, roleMax, MAX_PLAYERS } from './engine.js';
import { balanceSplit } from './host_v2.js';
import { MAFIA_PRESETS, inRange, misfitLine } from './preset-mixes.js';
import { HIDDEN_SETUP_SHOWS_BALANCE } from './config-defaults.js';
import { OFFLINE_DEALS } from './modes.js';
import { ownDeckFor, KEY, CORE_KEY, EXTRA_KEY, NEEDS_PRINTABLE } from './deck-key.js';
import { seatRows } from './seating.js';
import { stepsOf, stepProblem, presetOf, seatingOf, counts, savedAsPreset } from './setup-store.js';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const DIFF = { Beginner: 1, Classic: 2, Veteran: 3, Saved: 0 };
const NEXT_LABEL = { players: 'Next: Pick roles', preset: 'Next: Seating', seating: 'Next: Review' };
const HEADINGS = { players: 'Who’s playing?', preset: 'Pick roles', seating: 'How is everyone playing?', deal: 'Ready to deal?', cards: 'How do you want to deal roles?' };

// ---- small pieces ----
const diffDots = (d) => (DIFF[d] ? `<span class="diff" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= DIFF[d] ? 'on' : ''}"></i>`).join('')}</span>` : '');
const iconRow = (roles, max = 6) => {
  const g = counts(roles); const shown = g.slice(0, max); const rest = g.slice(max).reduce((t, [, c]) => t + c, 0);
  return `<span class="pi-row" role="img" aria-label="${esc(g.map(([id, c]) => `${c} ${ROLE_BY_ID[id]?.name || id}`).join(', '))}">${shown.map(([id, c]) => `<span class="pi a-${ROLE_BY_ID[id]?.alignment || 'town'}">${ico(ROLE_BY_ID[id])}${c > 1 ? `<small>×${c}</small>` : ''}</span>`).join('')}${rest ? `<span class="pi-more">+${rest}</span>` : ''}</span>`;
};
const rangeText = (p, n) => (inRange(p, n) ? (p.saved ? `${p.min} players` : `${p.min}–${p.max} players`) : n < p.min ? `Needs ${p.min}+ players` : `Needs ${p.max} or fewer`);
// The mix a card shows: for a count in range the real one; out of range, the nearest count the preset is made for.
const shownMix = (p, n) => p.mix(Math.max(p.min, Math.min(p.max, n)));
const balanceBar = (roles) => {
  const sp = balanceSplit(roles); const b = balanceOf(roles);
  const seg = (k) => (sp[k] ? `<i class="split-seg is-${k}" style="flex-grow:${sp[k]}" aria-hidden="true"></i>` : '');
  return `<div class="balance balance-split" data-strength="${b.strength}"><div class="split-bar" role="img" aria-label="Town ${sp.town}, Mafia ${sp.mafia}, Neutral ${sp.neutral}">${seg('town')}${seg('mafia')}${seg('neutral')}</div>
    <p class="split-legend"><span class="is-town">Town ${sp.town}</span><span class="is-mafia">Mafia ${sp.mafia}</span>${sp.neutral ? `<span class="is-neutral">Neutral ${sp.neutral}</span>` : ''}</p></div>`;
};
const balanceLine = (roles, hidden) => (hidden && !HIDDEN_SETUP_SHOWS_BALANCE ? '' : `<p class="balance-text">${esc(balanceOf(roles).text)}</p>`);
const sheetShell = (id, title, inner, close = 'setupSheetClose') => `<div class="sheet-bg" data-a="${close}"><div class="sheet setup-sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="${id}-title" data-stop>
  <div class="sheet-grab"></div><div class="sheet-head"><h2 class="sheet-title" id="${id}-title">${title}</h2><button type="button" class="icon-btn x-btn" data-a="${close}" aria-label="Close">${ui('x')}</button></div>${inner}</div></div>`;
const back = (a, label = 'Back') => `<button type="button" class="setup-back linkish" data-a="${a}">${ui('back')} ${label}</button>`;

// ---- context the screens share ----
export function setupCtx(v, local, st, saved, adv) {
  const n = v.players.length; const min = v.limits.min; const roles = v.config.roles;
  const preset = presetOf(st, saved);
  const steps = stepsOf(local);
  return { v, local, st, saved, adv, n, min, roles, preset, steps, key: steps[st.step][0] };
}

// ---- the carousel ----
export function carousel(c) {
  const { st, steps, local } = c;
  const total = steps.length;
  const dots = steps.map(([k, label], i) => {
    const done = i < st.step; const cur = i === st.step;
    return `<button type="button" class="setup-dot ${cur ? 'is-cur' : done ? 'is-done' : ''}" data-a="setupGo" data-v="${i}" ${cur ? 'aria-current="step"' : ''} ${i > st.step ? 'aria-disabled="true" tabindex="-1"' : ''} aria-label="Step ${i + 1}, ${label}${done ? ', done' : ''}"><span aria-hidden="true">${done ? ui('check') : i + 1}</span></button>`;
  }).join('');
  const cards = steps.map(([k], i) => `<section class="setup-card ${i === st.step ? 'is-active' : ''}" data-card="${k}" ${i === st.step ? '' : 'inert aria-hidden="true"'}>${i === st.step ? cardBody(k, c) : ''}</section>`).join('');
  return `<div class="setup" data-step="${st.step}">
    <div class="setup-progress" role="group" aria-label="Setup steps"><div class="setup-dots">${dots}</div><span class="setup-count">Step ${st.step + 1} of ${total}: ${esc(steps[st.step][1])}</span></div>
    <div class="setup-viewport"><div class="setup-track" style="transform:translateX(-${st.step * 100}%)">${cards}</div></div>
  </div>`;
}

export function dock(c) {
  const { st, steps, local } = c;
  const last = st.step === steps.length - 1;
  const p = stepProblem(c.key, c);
  const fixes = p ? ` ${p.fixes.map((f) => `<button type="button" class="linkish" data-a="${f.a}" ${f.v != null ? `data-v="${f.v}"` : ''}>${esc(f.label)}</button>`).join('')}` : '';
  const why = p ? `<p class="dock-why" id="setup-why">${esc(p.reason)}${fixes}</p>` : '';
  const label = last ? `Deal ${c.n} role${c.n === 1 ? '' : 's'}` : (local && c.key === 'preset' ? 'Next: How to deal' : NEXT_LABEL[c.key]);
  const a = last ? 'setupDeal2' : 'setupNext';
  const next = `<button type="button" class="btn big ${p ? 'disabled' : ''}" data-a="${a}" ${p ? `aria-disabled="true" aria-describedby="setup-why" data-why="${esc(p.reason)}"` : ''}>${label}</button>`;
  return `${why}<div class="dock-row">${st.step > 0 ? `<button type="button" class="btn ghost dock-back" data-a="setupBack">Back</button>` : ''}${next}</div>`;
}

function cardBody(k, c) {
  const h = `<h2 class="setup-h" tabindex="-1" id="setup-h">${HEADINGS[k]}</h2>`;
  if (k === 'players') return h + playersCard(c);
  if (k === 'preset') return h + presetCard(c);
  if (k === 'seating') return h + seatingCard(c);
  if (k === 'cards') return h + cardsCard(c);
  return h + dealCard(c);
}

function playersCard({ v, local, n }) {
  const chips = v.players.map((p) => `<li class="chip"><span class="chip-i">${initial(p.name)}</span><span class="chip-name">${esc(p.name)}</span>${!local && !p.offline && p.connected ? `<span class="chip-phone" title="Joined on their own phone">${ui('phone')}<span class="sr-only">joined on their own phone</span></span>` : ''}<button type="button" class="chip-x" data-a="rmPlayer" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ui('x')}</button></li>`).join('');
  const anyPhone = !local && v.players.some((p) => !p.offline && p.connected);
  return `${local ? '' : `<p class="room-chip">${ui('expand')} <span>Players join with code <b class="code">${esc(v.code)}</b></span><button type="button" class="linkish" data-a="showQr">Show QR</button></p>`}
    <div class="tally-row"><b data-tick="players">${plural(n, 'player')}</b>${anyPhone ? `<span class="legend-phone">${ui('phone')} joined on their own phone</span>` : ''}</div>
    ${n ? (local ? `<ul class="chips">${chips}</ul>` : seatRows(v)) : `<p class="muted setup-empty">${local ? 'Nobody’s here yet. Add everyone’s names below.' : 'Nobody’s here yet. Share the code, or add names for people without phones.'}</p>`}
    <form class="add-name" data-a-submit="addNames"><input class="add-input" data-i="names" id="add-name" placeholder="Add a name" aria-label="Add a name" autocomplete="off" enterkeyhint="done" value="${esc(S.ui.draft.names || '')}"><button type="button" class="btn ghost" data-a="addNames">${local ? 'Add' : 'Seat on this phone'}</button></form>
    <p class="callout local-note" role="note">${ui('info')} <span>Names are saved only on this device.</span></p>`;
}

const firstLine = (t = '') => (t.match(/^[^.!?]*[.!?]/) || [t])[0];
function presetCard({ preset, st, n, min, roles, local }) {
  const hidden = preset.hiddenSetup;
  const showMix = roles.length ? roles : shownMix(preset, Math.max(n, min));
  const miss = st.source === 'custom' ? '' : misfitLine(preset, n);
  const name = st.source === 'custom' ? 'Your own mix' : preset.name;
  const rows = counts(showMix).map(([id, cnt]) => `<li class="mix-row"><span class="mix-n">${cnt}</span><span class="mix-ico a-${ROLE_BY_ID[id]?.alignment || 'town'}">${ico(ROLE_BY_ID[id])}</span><span class="mix-name">${esc(ROLE_BY_ID[id]?.name || id)}${hidden ? '' : `<small>${esc(firstLine(ROLE_BY_ID[id]?.blurb))}</small>`}</span></li>`).join('');
  return `<article class="preset-pick ${miss ? 'is-misfit' : ''}"><div class="pp-head"><h3 class="pp-name">${esc(name)}</h3>${st.source === 'preset' && preset.recommended ? '<span class="badge">Recommended</span>' : preset.saved ? '<span class="badge">★ Saved</span>' : ''}</div>
    <p class="pp-vibe">${esc(st.source === 'custom' ? `Edited from ${preset.name}.` : preset.vibe)}</p>
    <p class="pp-meta">${esc(rangeText(preset, n))} ${diffDots(preset.difficulty)}</p>
    ${iconRow(showMix, 8)}${balanceLine(showMix, hidden)}
    ${hidden ? '<p class="pp-meta">Hidden setup is on: players will not see the mix.</p>' : ''}
    <div class="pp-actions"><button type="button" class="btn ghost" data-a="setupPresets">Change preset</button><button type="button" class="linkish" data-a="setupCustomize">Customize</button></div></article>
    <ul class="mix-list" aria-label="Roles in this setup">${rows}</ul>`;
}

const SEATS = [
  ['own', 'Own phones', 'Everyone joined with the room code.'],
  ['one', 'One phone', 'Pass this phone around the table.'],
  ['mixed', 'Mixed', 'Some on their phones, the rest on this phone.'],
];
function seatingCard({ v, st }) {
  const cur = seatingOf(st, v.players);
  const byName = v.players.filter((p) => p.offline); const phones = v.players.filter((p) => !p.offline);
  const list = (l) => l.map((p) => esc(p.name)).join(', ');
  let more = '';
  if (cur === 'own' && byName.length) {
    more = `<p class="callout is-warn" role="note">${ui('warning')} <span>${list(byName)} ${byName.length === 1 ? 'was' : 'were'} added by name and ${byName.length === 1 ? 'has' : 'have'} no phone. When you deal, ${byName.length === 1 ? 'they look' : 'each looks'} on this phone.</span></p>
      <div class="btn-row"><button type="button" class="btn ghost" data-a="setupSeating" data-v="mixed">Seat on this phone</button><button type="button" class="linkish" data-a="setupGo" data-v="0">Back to Players</button></div>`;
  } else if (cur === 'one' && phones.length) {
    more = `<p class="callout" role="note">${ui('info')} <span>${list(phones)} joined on ${phones.length === 1 ? 'their own phone' : 'their own phones'}. When you deal, ${phones.length === 1 ? 'that seat moves' : 'those seats move'} to this phone.</span></p>`;
  }
  return `<div class="setup-choices" role="radiogroup" aria-labelledby="setup-h">${SEATS.map(([id, t, d]) => `<button type="button" class="setup-choice" role="radio" aria-checked="${cur === id}" tabindex="${cur === id ? 0 : -1}" data-a="setupSeating" data-v="${id}"><span class="choice-mark" aria-hidden="true"></span><span class="choice-text"><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>
    <p class="muted">${plural(phones.length, 'player')} joined on their own phone. ${plural(byName.length, 'player')} on this phone.</p>${more}`;
}

function cardsCard({ st, roles, n }) {
  const deck = ownDeckFor(roles);
  const opts = OFFLINE_DEALS.map((o) => `<button type="button" class="setup-choice" role="radio" aria-checked="${st.deal === o.id}" tabindex="${st.deal === o.id ? 0 : -1}" data-a="setupDeal" data-v="${o.id}"><span class="choice-mark" aria-hidden="true"></span><span class="choice-text"><b>${o.name}</b><small>${o.how}</small></span></button>`).join('');
  let more = '';
  if (st.deal === 'printable') more = `<p class="callout" role="note">${ui('info')} <span>Print the deck first, then deal. <a class="linkish" href="/print.html" target="_blank" rel="noopener">Get the printable deck</a></span></p>`;
  if (st.deal === 'own') more = deck.ok ? ownDeckPanel(roles) + keySheet(roles) : `<p class="callout is-warn" role="note">${ui('warning')} <span>${NEEDS_PRINTABLE}.</span></p><div class="btn-row"><button type="button" class="btn ghost" data-a="setupDeal" data-v="printable">Use the printable deck</button><button type="button" class="btn ghost" data-a="setupDeal" data-v="pass">Use no cards</button></div>`;
  if (st.deal === 'pass') more = `<p class="callout" role="note">${ui('info')} <span>You deal on this phone. Each player looks at their role in private.</span></p>`;
  return `<div class="setup-choices" role="radiogroup" aria-labelledby="setup-h">${opts}</div>${more}`;
}

// Playing card faces drawn as text: rank and suit, red suits in red.
const face = (c) => `<span class="pcard ${/[♥♦]/.test(c) ? 'is-red' : ''}" aria-label="${esc(c)}">${esc(c)}</span>`;
export function ownDeckPanel(roles) {
  const d = ownDeckFor(roles);
  const groups = counts(roles).map(([id]) => [id, d.cards.filter((x) => x.role === id).map((x) => x.card)]);
  const rows = groups.map(([id, cards]) => `<li class="key-row a-${ROLE_BY_ID[id]?.alignment || 'town'}"><span class="mix-ico">${ico(ROLE_BY_ID[id])}</span><span class="key-name">${esc(ROLE_BY_ID[id]?.name || id)} <small>×${cards.length}</small></span><span class="key-cards">${id === 'villager' ? `${face(cards[0])}<span class="muted">to</span>${face(cards[cards.length - 1])}` : cards.map(face).join('')}</span></li>`).join('');
  return `<section class="own-deck" aria-label="Your own deck key"><h3 class="own-h">Pull these cards</h3><ul class="key-list">${rows}</ul>
    <p class="muted own-rule">Black Aces and black picture cards are the Mafia side. Red Kings, Queens and Aces are Town. Red Jacks play for themselves. Number cards are Villagers.</p>
    <h3 class="own-h">Extra roles</h3><ul class="extras-row">${Object.entries(EXTRA_KEY).map(([id, [c]]) => `<li>${face(c)}<span>${esc(ROLE_BY_ID[id].name)}</span></li>`).join('')}</ul>
    <button type="button" class="btn ghost" data-a="printKey">Print this key</button></section>`;
}
// One A5 page: the cards for this game on top, the full table underneath. Plain black on white.
export function keySheet(roles) {
  const d = ownDeckFor(roles);
  const mine = counts(roles).map(([id]) => `<tr><th>${esc(ROLE_BY_ID[id]?.name || id)}</th><td>${d.cards.filter((x) => x.role === id).map((x) => esc(x.card)).join(' ') || 'needs the printable deck'}</td></tr>`).join('');
  const all = Object.entries(KEY).map(([id, cards]) => `<tr><th>${esc(ROLE_BY_ID[id]?.name || id)}</th><td>${id === 'villager' ? 'Any number card, 2 to 10' : cards.map(esc).join(' ')}</td></tr>`).join('');
  return `<div class="key-sheet" aria-hidden="true"><h1>Mafia Night card key</h1><h2>Cards for this game (${roles.length} players)</h2><table>${mine}</table><h2>Full key</h2><table>${all}</table><p>Black Aces and black picture cards: Mafia side. Red Kings, Queens and Aces: Town. Red Jacks: play for themselves. Number cards: Villagers.</p></div>`;
}

function dealCard({ v, n, preset, st, adv, roles }) {
  const seat = SEATS.find((s) => s[0] === seatingOf(st, v.players))[1];
  const pname = st.source === 'custom' ? 'Your own mix' : preset.name;
  const row = (label, value, step) => `<li class="sum-row"><span class="sum-l">${label}</span><b class="sum-v">${esc(value)}</b><button type="button" class="linkish" data-a="setupGo" data-v="${step}" aria-label="Edit ${label.toLowerCase()}">Edit</button></li>`;
  const open = !!S.ui.setup?.advOpen;
  const sw = (k, title, desc) => `<button type="button" class="rule" role="switch" aria-checked="${!!adv[k]}" data-a="setupAdv" data-k="${k}"><span class="rule-text"><span class="rule-title">${title}</span><span class="rule-desc">${desc}</span></span><span class="switch" aria-hidden="true"><i></i></span></button>`;
  const names = v.players.map((p) => p.name); const who = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  const local = v.players.filter((p) => p.offline).length; const sk = seatingOf(st, v.players); const seatV = sk === 'own' && !local ? seat : sk === 'one' ? `${seat}: all ${n} on this phone` : `${seat}: ${local} on this phone`;
  return `<ul class="sum-list">${row('Players', n ? `${n}: ${who}` : '0', 0)}${row('Preset', pname, 1)}${row('Seating', seatV, 2)}</ul>
    ${preset.hiddenSetup || adv.hiddenSetup ? '' : `<h3 class="sum-h">Roles in this game</h3>${iconRow(roles, 8)}`}
    <button type="button" class="disclosure" aria-expanded="${open}" aria-controls="adv-body" data-a="setupAdvOpen">${ui('caret-down', open ? 'is-open' : '')} Advanced <span class="disclosure-value">Optional</span></button>
    <div class="disclosure-body rules" id="adv-body" ${open ? '' : 'hidden'}>
      ${sw('dayTimer', 'Day timer', 'Off: the table talks as long as it likes.')}
      ${sw('cardOnDeath', 'Show a player’s card when they die', 'Off: cards stay secret until the game ends.')}
      ${sw('hiddenSetup', 'Hidden setup', 'On: players never see the mix of roles.')}
      <p class="muted">Saved on this phone for next time. Pinned to this game when you deal.</p></div>`;
}

// ---- Presets page ----
export function presetsPage(c) {
  const { n, st, saved } = c;
  const cur = presetOf(st, saved);
  const rec = MAFIA_PRESETS.find((p) => p.recommended);
  const card = (p, picked) => `<li><button type="button" class="pcard-btn ${inRange(p, n) ? '' : 'is-dim'} ${picked ? 'is-picked' : ''}" data-a="setupPreview" data-v="${p.id}">
      <span class="pc-head"><span class="pc-name">${esc(p.name)}</span>${p.saved ? '<span class="badge">★ Saved</span>' : ''}${picked ? `<span class="picked">${ui('check')} Picked</span>` : ''}</span>
      <span class="pc-vibe">${esc(p.vibe)}</span><span class="pc-meta">${esc(rangeText(p, n))} ${p.difficulty === 'Saved' ? '' : esc(p.difficulty)} ${diffDots(p.difficulty)}</span>${iconRow(shownMix(p, n))}</button>
      ${p.saved ? `<button type="button" class="icon-btn pc-more" data-a="setupMenu" data-v="${p.id}" aria-label="More for ${esc(p.name)}">⋯</button>` : ''}</li>`;
  const rest = MAFIA_PRESETS.filter((p) => !p.recommended);
  const mine = saved.map(savedAsPreset);
  const pickedId = st.source === 'custom' ? null : cur.id;
  return `<div class="setup-page">${back('setupClosePage')}
    <h2 class="setup-h" tabindex="-1" id="setup-h">Presets</h2><p class="muted">${plural(n, 'player')}. Tap one to see its roles.</p>
    <h3 class="group-h">Recommended for ${n}</h3><ul class="pc-list">${card(rec, pickedId === rec.id)}</ul>
    <h3 class="group-h">Built in</h3><ul class="pc-list">${rest.map((p) => card(p, pickedId === p.id)).join('')}</ul>
    ${mine.length ? `<h3 class="group-h">Saved on this phone</h3><ul class="pc-list">${mine.map((p) => card(p, pickedId === p.id)).join('')}</ul>` : ''}
    <p class="callout local-note" role="note">${ui('info')} <span>Saved presets stay on this device only.</span></p></div>`;
}
export const presetsDock = (c) => `<div class="dock-row"><button type="button" class="btn big" data-a="setupClosePage">${c.st.source === 'custom' ? 'Done' : `Use ${esc(c.preset.name)}`}</button></div>`;

export function previewSheet(c, id) {
  const { n, saved } = c;
  const p = MAFIA_PRESETS.find((x) => x.id === id) || saved.map(savedAsPreset).find((x) => x.id === id);
  if (!p) return '';
  const fits = inRange(p, n); const mix = shownMix(p, n);
  const rows = counts(mix).map(([rid, cnt]) => `<li class="mix-row"><span class="mix-n">${cnt}</span><span class="mix-ico a-${ROLE_BY_ID[rid]?.alignment || 'town'}">${ico(ROLE_BY_ID[rid])}</span><span class="mix-name">${esc(ROLE_BY_ID[rid]?.name || rid)}<small>${esc(ROLE_BY_ID[rid]?.blurb || '')}</small></span></li>`).join('');
  const actions = fits
    ? `<button type="button" class="btn big" data-a="setupUse" data-v="${p.id}">Use this</button><button type="button" class="linkish" data-a="setupCustomizeFrom" data-v="${p.id}">Customize from here</button>`
    : `<p class="callout is-warn" role="note">${ui('warning')} <span>${esc(misfitLine(p, n))}</span></p><button type="button" class="btn big" data-a="setupAddPlayers">Add players</button><button type="button" class="linkish" data-a="setupSheetClose">Pick another</button>
       <button type="button" class="linkish" data-a="setupUse" data-v="${p.id}">Use it anyway</button>`;
  return sheetShell('pv', esc(p.name), `<p class="pp-vibe">${esc(p.vibe)}</p><p class="pp-meta">${p.saved ? '★ Saved · ' : ''}${esc(rangeText(p, n))} ${p.difficulty === 'Saved' ? '' : esc(p.difficulty)} ${diffDots(p.difficulty)}</p>
    <ul class="mix-list">${rows}</ul>${balanceBar(mix)}${balanceLine(mix, p.hiddenSetup)}<div class="sheet-actions">${actions}</div>`);
}

// ---- Customize ----
export function customizePage(c) {
  const { v, n, roles } = c;
  const cnt = Object.fromEntries(counts(roles));
  const order = [...new Set([...(S.ui.deckShown || []), ...roles])].filter((id) => ROLE_BY_ID[id]);
  for (const id of roles) if (!S.ui.deckShown.includes(id)) S.ui.deckShown.push(id);
  const ws = setupWarnings(roles, n);
  const rowsHtml = order.map((id) => { const r = ROLE_BY_ID[id];
    return `<li class="deck-item"><span class="rc a-${r.alignment}">${ico(r)} ${esc(r.name)}</span><span class="stepper"><button type="button" class="icon-btn" data-a="subRole" data-id="${id}" aria-label="One fewer ${esc(r.name)}" ${cnt[id] ? '' : 'disabled'}>${ui('minus')}</button><b class="stepper-n">${cnt[id] || 0}</b><button type="button" class="icon-btn" data-a="addRole" data-id="${id}" aria-label="One more ${esc(r.name)}" ${(cnt[id] || 0) >= roleMax(id) || roles.length >= MAX_PLAYERS ? 'disabled' : ''}>${ui('plus')}</button></span></li>`; }).join('');
  const note = roles.length !== n ? `<p class="note is-warn">${ui('warning')} ${plural(roles.length, 'role')} for ${plural(n, 'player')}. They need to match.</p>` : '';
  const flags = ws.filter((w) => w.level !== 'tip').map((w) => `<li class="note ${w.level === 'error' ? 'is-error' : 'is-warn'}">${ui('warning')} <span><b>${w.level === 'error' ? 'Can’t start yet' : 'Heads up'}.</b> ${esc(w.text)}</span></li>`).join('');
  return `<div class="setup-page">${back('setupClosePage')}
    <div class="page-head"><h2 class="setup-h" tabindex="-1" id="setup-h">Customize</h2><button type="button" class="btn ghost small" data-a="setupSave">${ui('save')} Save preset</button></div>
    <p class="muted"><button type="button" class="linkish" data-a="setupPresets">Presets</button> · ${plural(roles.length, 'role')} for ${plural(n, 'player')}</p>
    ${roles.length ? balanceBar(roles) + balanceLine(roles, v.config.advanced?.hiddenSetup) : ''}${note}${flags ? `<ul class="advice">${flags}</ul>` : ''}
    <ul class="deck-list">${rowsHtml}</ul>
    <button type="button" class="btn ghost" data-a="openAddRole">${ui('plus')} Add role</button></div>`;
}
export const customizeDock = () => `<div class="dock-row"><button type="button" class="btn big" data-a="setupClosePage">Use this setup</button></div>`;

// ---- small sheets: save a preset, a saved preset's menu ----
export function saveSheet(c) {
  return sheetShell('sv', 'Save preset', `<label class="field"><span>Name</span><input class="add-input" data-i="presetName" maxlength="28" value="${esc(S.ui.draft.presetName || 'My setup')}" autocomplete="off"></label>
    <p class="muted">Keeps these roles and your Advanced settings. Saved only on this device.</p><div class="sheet-actions"><button type="button" class="btn big" data-a="setupSaveDo">Save</button></div>`);
}
export function menuSheet(c, id) {
  const p = c.saved.find((x) => x.id === id); if (!p) return '';
  const mode = S.ui.setup?.menuMode;
  if (mode === 'rename') return sheetShell('mn', 'Rename', `<label class="field"><span>Name</span><input class="add-input" data-i="presetName" maxlength="28" value="${esc(S.ui.draft.presetName ?? p.name)}" autocomplete="off"></label><div class="sheet-actions"><button type="button" class="btn big" data-a="setupRenameDo" data-v="${id}">Rename</button></div>`);
  if (mode === 'delete') return sheetShell('mn', 'Delete preset', `<p>Delete ${esc(p.name)}? This can’t be undone.</p><div class="sheet-actions"><button type="button" class="btn big danger" data-a="setupDeleteDo" data-v="${id}">Delete</button><button type="button" class="linkish" data-a="setupSheetClose">Keep it</button></div>`);
  return sheetShell('mn', esc(p.name), `<div class="sheet-actions"><button type="button" class="btn ghost" data-a="setupMenuMode" data-v="rename">Rename</button><button type="button" class="btn ghost" data-a="setupMenuMode" data-v="delete">Delete</button></div>`);
}
