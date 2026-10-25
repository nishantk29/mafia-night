// Seating board: everyone around a felt table, with colored markers the Host can use to track who is who.
// Also the seat sheet (host only) and small shared bits: role chips and playing-card indices.
import { S, esc, initial } from './state.js';
import { ROLE_BY_ID } from './roles.js';
import { DOT_COLORS } from './room.js';
import { cardInfo } from './engine.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';

const TEAM = { town: 'Town', mafia: 'Mafia', third: 'Third party' };
export const teamName = (al) => TEAM[al] || 'Town';

// Role chip for running text (host screens and the player's own role only).
export const roleChip = (r, extra = '') => `<span class="rc a-${r.alignment} ${extra}">${ico(r)} ${esc(r.name)}</span>`;

// Playing-card index chip (A♠, 10♥, joker). Jokers use the game-icons joker glyph, never the emoji.
export function cardIndex(id) {
  const c = cardInfo(id);
  if (!c) return esc(id);
  if (id === 'RJ' || id === 'BJ') return `${ui('joker', 'pc-joker')}<span class="pc-jkr">Jkr</span>`;
  return esc(c.short);
}
export const pc = (id, cls = 'pc') => `<span class="${cls} ${cardInfo(id)?.red ? 'is-red' : ''}" aria-label="${esc(cardName(id))}">${cardIndex(id)}</span>`;
// Plain-text card label for <option>s and sentences: "9♥", "Red joker".
export function cardText(id) {
  if (id === 'RJ') return 'Red joker';
  if (id === 'BJ') return 'Black joker';
  return cardInfo(id)?.short || id;
}
// Spoken name: "9 of Hearts" -> "9 of hearts", "Red joker".
export function cardName(id) {
  if (id === 'RJ') return 'Red joker';
  if (id === 'BJ') return 'Black joker';
  const n = cardInfo(id)?.name;
  return n ? n.replace(/ of (\w)/, (m, ch) => ` of ${ch.toLowerCase()}`) : id;
}

const density = (n) => (n > 28 ? 'xs' : n > 18 ? 'sm' : n > 12 ? 'md' : 'lg');
const phaseLabel = (v) => ({ lobby: 'Setting up', dealt: 'Roles dealt', night: `Night ${v.night}`, day: `Day ${v.day}`, over: 'Game over' }[v.phase] || '');

// host=true: Host view (roles, team edges, markers, tappable seats).
// host=false: player view. Neutral seats with initials only; never a role or team colour.
export function board(view, host) {
  const ps = view.players;
  const n = ps.length;
  const aliveCount = ps.filter((p) => p.alive).length;
  const tag = host ? 'button' : 'span';
  const seats = ps.map((p, i) => {
    const th = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
    const x = 50 + 41 * Math.cos(th);
    const y = 50 + 41 * Math.sin(th);
    const r = host && p.roleId ? ROLE_BY_ID[p.roleId] : null;
    const team = r ? ` a-${r.alignment}` : '';
    const dots = host ? (p.tags || []).map((t) => `<i class="dot d-${t}"></i>`).join('') : '';
    const me = !host && view.me?.id === p.id;
    const label = [p.name, me ? 'you' : '', r?.name, p.alive ? '' : 'dead'].filter(Boolean).join(', ');
    const cls = `seat${team}${me ? ' is-me' : ''}${p.alive ? '' : ' is-dead'}${host && S.ui.sheet === p.id ? ' is-selected' : ''}`;
    const attrs = host ? `type="button" data-a="seat" data-id="${p.id}"` : 'role="img"';
    return `<${tag} class="${cls}" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%" ${attrs} aria-label="${esc(label)}">
      <span class="seat-card"><span class="seat-glyph">${r ? ico(r) : initial(p.name)}</span></span>
      <span class="seat-name">${esc(p.name)}</span>${dots ? `<span class="seat-dots">${dots}</span>` : ''}${p.alive ? '' : `<span class="seat-mark">${ui('skull')}</span>`}</${tag}>`;
  }).join('');
  const rows = ps.map((p, i) => {
    const r = host && p.roleId ? ROLE_BY_ID[p.roleId] : null;
    const dots = host ? (p.tags || []).map((t) => `<i class="dot d-${t}"></i>`).join('') : '';
    const inner = `<span class="seatrow-n">${i + 1}</span><span class="seatrow-glyph">${r ? ico(r) : initial(p.name)}</span>
      <span class="seatrow-name">${esc(p.name)}</span>${r ? `<span class="seatrow-role">${esc(r.name)}</span>` : ''}${p.alive ? '' : `<span class="seat-mark" aria-label="dead">${ui('skull')}</span>`}${dots ? `<span class="seat-dots">${dots}</span>` : ''}`;
    const cls = `seatrow${r ? ` a-${r.alignment}` : ''}${p.alive ? '' : ' is-dead'}`;
    return `<li>${host ? `<button type="button" class="${cls}" data-a="seat" data-id="${p.id}">${inner}</button>` : `<div class="${cls}">${inner}</div>`}</li>`;
  }).join('');
  const mid = n
    ? `<b class="table-phase">${phaseLabel(view)}</b><span class="table-alive">${view.phase === 'lobby' ? `${n} seated` : `${aliveCount} alive`}</span>`
    : `<b class="table-phase">${phaseLabel(view)}</b><span class="table-alive">No one seated yet</span>`;
  return `<div class="board" style="--n:${Math.max(n, 1)}" data-density="${density(n)}" data-host="${host ? 1 : 0}">
    <div class="table" role="group" aria-label="Seating, clockwise from the top${host ? '. Drag a seat to move someone.' : ''}">
      <div class="table-mid">${mid}</div>${seats}
    </div>
    ${n ? `<ol class="seatlist" aria-label="Seating order">${rows}</ol>` : ''}
  </div>`;
}

export function legend(view) {
  const L = view.config.legend;
  return `<div class="legend" aria-label="Marker colors. Tap one to rename it.">${DOT_COLORS.map((c) => `<button type="button" class="lg" data-a="legend" data-c="${c}" title="Rename this marker"><i class="dot d-${c}"></i>${esc(L[c])}</button>`).join('')}</div>`;
}

// Seat details: a bottom sheet on phones, a side panel on larger screens (host only).
export function sheet(view) {
  const p = view.players.find((x) => x.id === S.ui.sheet);
  if (!p) return '';
  const r = p.roleId ? ROLE_BY_ID[p.roleId] : null;
  const L = view.config.legend;
  const n = view.players.length; const seatNo = view.players.indexOf(p) + 1;
  const roleOptions = [`<option value="">No role yet</option>`].concat(
    Object.values(ROLE_BY_ID).sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.id}" ${x.id === p.roleId ? 'selected' : ''}>${esc(x.name)}</option>`)).join('');
  const entering = S.ui.anim === 'sheet' ? ' is-entering' : '';
  return `<div class="sheet-bg" data-a="closeSheet"><div class="sheet${entering}" data-stop="1" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-grab" aria-hidden="true"></div>
    <header class="sheet-head"><h2 class="sheet-title" id="sheet-title">${esc(p.name)}</h2>${p.alive ? '' : `<span class="pill dead">${ui('skull')} Dead</span>`}
      <button type="button" class="icon-btn x-btn" data-a="closeSheet" aria-label="Close">${ui('x')}</button></header>
    <div class="sheet-meta">${r ? roleChip(r) : '<span class="meta">Role not known yet</span>'}${p.card ? `<span class="meta">Card ${esc(cardText(p.card))}</span>` : ''}${p.convertedFrom ? `<span class="meta">Converted from ${esc(ROLE_BY_ID[p.convertedFrom]?.name || p.convertedFrom)}</span>` : ''}</div>
    <h3 class="sheet-sub">Markers</h3>
    <div class="dots-edit">${DOT_COLORS.map((c) => `<button type="button" class="dotbtn" aria-pressed="${p.tags.includes(c)}" data-a="tag" data-id="${p.id}" data-c="${c}"><i class="dot d-${c}"></i><span>${esc(L[c])}</span></button>`).join('')}</div>
    <label class="field"><span>Note</span><input data-i="note" data-id="${p.id}" maxlength="80" value="${esc(p.note)}" placeholder="For example: claimed Doctor on day 1"></label>
    <label class="field"><span>Role (fix a mistake)</span><select data-i="setRole" data-id="${p.id}">${roleOptions}</select></label>
    ${n > 1 ? `<h3 class="sheet-sub">Seat ${seatNo} of ${n}</h3>
    <div class="btn-row seat-move"><button type="button" class="btn ghost" data-a="moveSeat" data-id="${p.id}" data-v="-1">Move left</button><button type="button" class="btn ghost" data-a="moveSeat" data-id="${p.id}" data-v="1">Move right</button></div>` : ''}
    <div class="btn-row">
      ${p.alive ? `<button type="button" class="btn ghost" data-a="killp" data-id="${p.id}">${ui('skull')} Eliminate ${esc(p.name)}</button>` : `<button type="button" class="btn" data-a="revive" data-id="${p.id}">Bring ${esc(p.name)} back</button>`}
      <button type="button" class="btn ghost" data-a="rename" data-id="${p.id}">${ui('pencil')} Rename</button>
    </div>
  </div></div>`;
}
