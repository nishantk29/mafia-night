// "Roles in this game": a static explanation of the setup. No live state: no names, no alive or dead, no counts left.
import { ROLE_BY_ID, believedSetup } from './roles.js';
import { teamName } from './board.js';
import { ico } from './art.js';
import { ui } from './ui_icons.js';
import { esc } from './state.js';

const TEAMS = [['town', 'good', 'Good'], ['mafia', 'evil', 'Evil'], ['third', 'neutral', 'Neutral']];

// roleIds: the host's real config.roles, or on a player's phone the believed ids from the view (pass `unreliable`).
export function setupRoleList(roleIds, { forPlayer = false, unreliable = null } = {}) {
  let ids = roleIds; let bad = new Set(unreliable || []);
  if (forPlayer && !unreliable) { const b = believedSetup(roleIds); ids = b.ids; bad = new Set(b.unreliable); }
  const counts = new Map();
  for (const id of ids) if (ROLE_BY_ID[id]) counts.set(id, (counts.get(id) || 0) + 1);
  const entries = [...counts].map(([id, count]) => ({ r: ROLE_BY_ID[id], count, bad: bad.has(id) }));
  const teamOf = (r) => (r.faction || r.alignment);
  return TEAMS.map(([al, team, title]) => ({
    team, title,
    roles: entries.filter((e) => teamOf(e.r) === al || (!['town', 'mafia', 'third'].includes(teamOf(e.r)) && al === 'third'))
      .map(({ r, count, bad: b }) => ({ id: r.id, name: r.name, count, blurb: r.blurb, teamName: teamName(r.alignment), ...(b ? { unreliable: true } : {}) })),
  })).filter((g) => g.roles.length);
}

export function rolesSheet(list) {
  const row = (x) => `<li class="rs-row" data-role="${esc(x.id)}"><span class="rs-ico">${ico(ROLE_BY_ID[x.id])}</span>
      <span class="rs-main"><span class="rs-name"><b>${esc(x.name)}</b>${x.count > 1 ? ` <span class="rs-n">×${x.count}</span>` : ''}${x.unreliable ? ` <span class="rs-warn">${x.count > 1 ? '(one may be unreliable)' : '(may be unreliable)'}</span>` : ''} <span class="team-tag a-${ROLE_BY_ID[x.id].alignment}">${esc(x.teamName)}</span></span>
      <span class="rs-blurb">${esc(x.blurb)}</span></span></li>`;
  const body = list.length
    ? list.map((g) => `<section class="rs-group" data-team="${g.team}"><h3 class="rs-team a-${g.team === 'good' ? 'town' : g.team === 'evil' ? 'mafia' : 'third'}">${g.title}</h3><ul class="rs-list">${g.roles.map(row).join('')}</ul></section>`).join('')
    : '<p class="muted">No roles have been picked yet.</p>';
  return `<div class="sheet-bg" data-a="closeRoles"><div class="sheet is-entering" role="dialog" aria-modal="true" aria-labelledby="roles-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="roles-title">Roles in this game</h2><button type="button" class="icon-btn x-btn" data-a="closeRoles" aria-label="Close">${ui('x')}</button></div>
    <p class="muted">The roles dealt this game, and how many of each. Who holds them is secret.</p>${body}
  </div></div>`;
}

export const rolesButton = () => `<button type="button" class="icon-btn" data-a="openRoles" aria-label="Roles in this game" title="Roles in this game">${ui('rules')}</button>`;
