// "Roles in this game": the setup, never who holds what. One model, one render, for every viewer (player, host,
// one-phone, cards mode): rolesModel() reads only what the room shows everyone, so the DOM is identical on every phone.
// Static: no names, no alive or dead, no counts left.
import { ROLE_BY_ID, believedSetup } from './roles.js';
import { teamName } from './board.js';
import { roleGuide } from './role_guide.js';
import { DEFAULT_RULES } from './engine.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { TYPE_ORDER, typeOf, TEAM_TITLE } from './role-types.js';
import { S, esc, store } from './state.js';
import { HIDDEN_SETUP_SHOWS_BALANCE, HIDDEN_CHIP_LABEL, ROLES_BLURB_MAX, ROLES_GATE_KEY } from './config-defaults.js';

const TEAMS = [['town', 'town', 'Town'], ['mafia', 'mafia', 'Mafia'], ['third', 'third', TEAM_TITLE.third]];
const teamKey = (r) => { const t = r.faction || r.alignment; return t === 'town' || t === 'mafia' ? t : 'third'; };

// Roles grouped by team with counts. roleIds are already what the holder believes (see believedSetup for the host).
export function setupRoleList(roleIds, { unreliable = [] } = {}) {
  const bad = new Set(unreliable);
  const counts = new Map();
  for (const id of roleIds) if (ROLE_BY_ID[id]) counts.set(id, (counts.get(id) || 0) + 1);
  return TEAMS.map(([key, , title]) => {
    const roles = [...counts].filter(([id]) => teamKey(ROLE_BY_ID[id]) === key).map(([id, count]) => {
      const r = ROLE_BY_ID[id];
      return { id, name: r.name, count, blurb: r.blurb, teamName: teamName(r.alignment), team: key, ...(bad.has(id) ? { unreliable: true } : {}) };
    });
    return { team: key, title, total: roles.reduce((t, x) => t + x.count, 0), roles };
  }).filter((g) => g.roles.length);
}

// One model for any view. Host views carry config.roles (real ids, mapped to what each holder believes); player views carry
// setupRoles (already believed). Hidden setups carry no role ids at all: only the player count, the rules and, with reveal
// on death, the roles of players who have been shown.
export function rolesModel(v) {
  const hidden = v.kind === 'host' ? !!v.advanced?.hiddenSetup : !!v.setupHidden;
  const rules = { ...DEFAULT_RULES, ...(v.rules || v.config?.rules || {}) };
  const players = (v.players || []).length;
  let ids; let unreliable = [];
  if (v.kind === 'host') { const b = believedSetup(v.config.roles || []); ids = hidden ? [] : b.ids; unreliable = b.unreliable; }
  else { ids = v.setupRoles || []; unreliable = v.setupUnreliable || []; }
  const over = v.phase === 'over';
  const shown = (v.players || []).filter((p) => !p.alive && (over || rules.revealOnDeath !== false) && !p.roleHidden)
    .map((p) => (v.kind === 'host' ? p.roleId : p.role?.id)).filter(Boolean).map((id) => believedSetup([id]).ids[0]);
  return {
    hidden, players, rules, count: ids.length,
    groups: hidden ? [] : setupRoleList(ids, { unreliable }),
    revealed: hidden ? setupRoleList(shown) : [],
    revealOn: rules.revealOnDeath !== false,
  };
}

export const rolesChip = (m) => `<button type="button" class="roles-chip" data-a="openRoles" aria-label="${m.hidden ? 'Roles in this game: hidden. Open the list' : `Roles in this game: ${m.count}. Open the list`}">${ui('table')}<span>${m.hidden ? esc(HIDDEN_CHIP_LABEL) : `${m.count} roles`}</span></button>`;

const rulesBlock = (id, rules) => {
  const g = roleGuide(id, rules);
  if (!g) return '';
  const part = (h, lines) => (lines.length ? `<p class="rs-h">${h}</p>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}` : '');
  return `<div class="rs-rules" id="rs-rules-${esc(id)}">${part('How it wins', [g.goal])}${part('At night', g.night)}${part('By day', g.day)}${part('Good to know', [...g.death, ...g.know])}</div>`;
};

function row(x, openId, rules) {
  const open = openId === x.id;
  const r = ROLE_BY_ID[x.id];
  const first = x.blurb.split(/(?<=[.!?])\s/)[0]; // one line: the first sentence
  const line = first.length > ROLES_BLURB_MAX ? `${first.slice(0, first.lastIndexOf(' ', ROLES_BLURB_MAX - 1)).replace(/[,;:]$/, '')}…` : first;
  return `<li class="rs-row a-${x.team}" data-role="${esc(x.id)}"><button type="button" class="rs-btn" data-a="roleRules" data-v="${esc(x.id)}" aria-expanded="${open}" aria-controls="rs-rules-${esc(x.id)}">
      <span class="rs-ico">${ico(r)}</span>
      <span class="rs-main"><span class="rs-name">${esc(x.name)}${x.unreliable ? ` <span class="rs-warn">${x.count > 1 ? '(one may be unreliable)' : '(may be unreliable)'}</span>` : ''}</span>
        <span class="rs-blurb">${esc(open ? x.blurb : line)}</span></span>
      <span class="rs-n" aria-label="${x.count} in this game">${x.count}</span></button>${open ? rulesBlock(x.id, rules) : ''}</li>`;
}

const groups = (list, openId, rules) => list.map((g) => `<section class="rs-group tg a-${g.team}" data-team="${g.team}"><h3 class="tg-h"><span class="tg-name">${esc(g.title)}</span><span class="tg-n">${g.total}</span></h3>${TYPE_ORDER[g.team].map((ty) => [ty, g.roles.filter((x) => typeOf(ROLE_BY_ID[x.id]) === ty)]).filter(([, l]) => l.length).map(([ty, l]) => `<div class="tg-sub" data-team="${g.team}" data-type="${ty}"><h4 class="tg-type">${ty}</h4><ul class="rs-list">${l.map((x) => row(x, openId, rules)).join('')}</ul></div>`).join('')}</section>`).join('');

function hiddenBody(m) {
  const balance = HIDDEN_SETUP_SHOWS_BALANCE ? `<li><b>At least 1 Mafia</b><span>Mafia are always fewer than Town.</span></li>` : '';
  const fill = m.revealOn ? '<li><b>Roles fill in here</b><span>when a card is shown on death.</span></li>' : '<li><b>Roles stay hidden</b><span>until the game ends.</span></li>';
  return `<p class="rs-callout">${ui('lock')} The host kept the roles secret this game.</p>
    <ul class="rs-facts"><li><b>${m.players} players</b></li>${balance}${fill}</ul>${m.revealed.length ? `<h3 class="rs-team">Shown so far</h3>${groups(m.revealed, null, m.rules)}` : ''}`;
}

// Same markup for the sheet (the chip) and the first-look panel (before a role is seen). `gate` swaps the close X for the big button.
export function rolesPanel(m, { gate = false, button = 'See my role', openId = null } = {}) {
  const lead = m.hidden ? '' : `<p class="rs-lead">${m.players} players. Every phone shows this same list.</p>`;
  const body = m.hidden ? hiddenBody(m) : groups(m.groups, openId, m.rules);
  const foot = m.hidden ? '' : '<p class="rs-foot">This is what’s in the game, not who has what. Tap a role for its full rules.</p>';
  const act = gate ? `<button type="button" class="btn big" data-a="seeRoles">${esc(button)}</button>` : `<button type="button" class="btn big" data-a="closeRoles">${m.hidden ? 'Got it' : 'Close'}</button>`;
  const inner = `<div class="sheet-grab"></div>
    <h2 class="sheet-title" id="roles-title">Roles in this game</h2>${lead}<div class="rs-body">${body}${foot}</div><div class="rs-act">${act}</div>`;
  return gate
    ? `<div class="roles-gate" role="dialog" aria-modal="true" aria-labelledby="roles-title" data-gate>${inner}</div>`
    : `<div class="sheet-bg" data-a="closeRoles"><div class="sheet roles-sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="roles-title" data-stop>${inner}</div></div>`;
}

// The first look: shown once per game on each phone, after the deal and before anyone sees a role. Hosts only get it on the
// dealt screen (they have no card to see); players get it until they tap through.
export const rolesGateKey = (v) => (v && v.phase !== 'lobby' && v.phase !== 'over' ? `${v.code || 'local'}.${v.gameNo || 1}` : null);
const seenMap = () => { try { return JSON.parse(store.get(ROLES_GATE_KEY) || '{}'); } catch { return {}; } };
export function rolesGateOpen(v) {
  const k = rolesGateKey(v);
  if (!k || (v.kind === 'host' && v.phase !== 'dealt')) return false;
  return S.ui.rolesSeenKey !== k && !seenMap()[k];
}
export function markRolesSeen(v) {
  const k = rolesGateKey(v); if (!k) return;
  S.ui.rolesSeenKey = k;
  store.set(ROLES_GATE_KEY, JSON.stringify(Object.fromEntries(Object.entries({ ...seenMap(), [k]: 1 }).slice(-20))));
}
// The panel layer for any screen: the gate when it is due, else the sheet when the chip opened it.
export const rolesLayer = (v) => {
  const m = rolesModel(v);
  if (rolesGateOpen(v)) return rolesPanel(m, { gate: true, button: v.kind === 'host' ? 'Continue' : 'See my role', openId: S.ui.rolesOpen });
  return S.ui.roles ? rolesPanel(m, { openId: S.ui.rolesOpen }) : '';
};
