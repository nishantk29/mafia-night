// Role selector grouped by team, then type (approved 2026-10-29). role-types.js maps every built-in role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { TYPES, TYPE_OF, TYPE_ORDER, TEAM_ORDER, TEAM_TITLE, teamOf, typeOf, byTeamType } from '../public/js/role-types.js';
import { customizePage } from '../public/js/setup-ui.js';
import { S } from '../public/js/state.js';

const text = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('every built-in role (and every retired id) has a type on its own team', () => {
  assert.equal(ROLES.length, 184);
  for (const r of Object.values(ROLE_BY_ID)) {
    const t = TYPE_OF[r.id];
    assert.ok(t, `${r.id} has no type`);
    assert.equal(t.team, teamOf(r), `${r.id} team`);
    assert.ok(TYPE_ORDER[t.team].includes(t.type), `${r.id} type ${t.type}`);
  }
});

test('each id is listed once and every listed id is a real role', () => {
  const all = Object.values(TYPES).flatMap((m) => Object.values(m).flat());
  assert.equal(new Set(all).size, all.length);
  for (const id of all) assert.ok(ROLE_BY_ID[id], id);
  assert.equal(all.length, ROLES.length);
});

test('approved type set: Plain kept, Mafia Killing and Support apart, no Vote type', () => {
  assert.deepEqual(TYPE_ORDER.town, ['Investigative', 'Protective', 'Killing', 'Support', 'Plain']);
  assert.deepEqual(TYPE_ORDER.mafia, ['Killing', 'Support']);
  assert.ok(!Object.values(TYPE_ORDER).flat().includes('Vote'));
  assert.deepEqual(TEAM_ORDER, ['town', 'mafia', 'third']);
  assert.equal(TEAM_TITLE.third, 'Neutral');
});

test('byTeamType keeps team then type order and drops empty buckets', () => {
  const ids = ['jester', 'villager', 'mafia', 'doctor', 'detective', 'framer', 'killer'];
  const g = byTeamType(ids.map((id) => ROLE_BY_ID[id]));
  assert.deepEqual(g.map((x) => [x.team, x.types.map((t) => [t.type, t.items.map((r) => r.id)])]), [
    ['town', [['Investigative', ['detective']], ['Protective', ['doctor']], ['Plain', ['villager']]]],
    ['mafia', [['Killing', ['mafia']], ['Support', ['framer']]]],
    ['third', [['Killing', ['killer']], ['Tricksters', ['jester']]]],
  ]);
  assert.deepEqual(byTeamType([]), []);
  // a role this file does not know (a custom role) still lands somewhere: its team's last type
  assert.equal(typeOf({ id: 'my_custom', alignment: 'mafia' }), 'Support');
});

test('Customize list: team sections, a type subhead even for a single type, data-team / data-type hooks', () => {
  S.ui.deckShown = [];
  const roles = ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'jester'];
  const h = customizePage({ v: { config: { roles, advanced: {} } }, n: 6, roles });
  assert.match(text(h), /Town 3 cards Protective Doctor .* Plain Villager .* Mafia 2 cards Killing Mafia .* Neutral 1 card Tricksters Jester/);
  assert.equal((h.match(/<section class="tg a-(town|mafia|third)" data-team="\1"/g) || []).length, 3);
  for (const ty of ['Protective', 'Plain', 'Killing', 'Tricksters']) assert.match(h, new RegExp(`class="tg-sub" data-team="[a-z]+" data-type="${ty}"`));
  // one subhead per type section; Mafia has only Killing and still gets it
  assert.equal((h.match(/class="tg-type"/g) || []).length, (h.match(/class="tg-sub"/g) || []).length);
  assert.match(h, /data-type="Killing"><h4 class="tg-type">Killing<\/h4>/);
});

test('Add role sheet source: sections carry data-team / data-type and the top has room for a filter row', () => {
  const src = fs.readFileSync(new URL('../public/js/host.js', import.meta.url), 'utf8');
  assert.match(src, /class="add-role-top"/);
  assert.match(src, /class="tg-sub" data-team="\$\{g\.team\}" data-type=/);
  assert.match(src, /data-side="\$\{g\.team\}" data-team="\$\{g\.team\}"/);
  const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /\.add-role-list \.tg-sub, \.add-role-list \.side-group/, 'search hides empty type sections');
});

test('type subheads are 16px; team headings 22px, at least 1.25x the 17px rows', () => {
  const css = fs.readFileSync(new URL('../public/story.css', import.meta.url), 'utf8');
  assert.match(css, /\.tg-type\{[^}]*font:600 1rem\//);
  assert.match(css, /\.tg-h\{[^}]*font:700 1\.375rem\//);
});

test('role-types.js is precached', () => {
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/js\/role-types\.js'/);
});
