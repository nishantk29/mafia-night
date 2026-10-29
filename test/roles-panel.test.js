// Item 4: "Roles in this game". One model and one render for every viewer: the host, every player (alive or dead) and the
// one-phone screen read the same list, so the DOM is identical. A hidden setup sends no role ids at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolesModel, rolesPanel, rolesChip, setupRoleList } from '../public/js/roles_sheet.js';
import { HIDDEN_SETUP_SHOWS_BALANCE, HIDDEN_CHIP_LABEL } from '../public/js/config-defaults.js';
import { MAFIA_PRESETS } from '../public/js/preset-mixes.js';
import { newRoom, reduce, viewForPlayer, viewForHost } from '../public/js/room.js';

const HOST = { host: true };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const nm = (i) => `Nm${String.fromCharCode(97 + i)}z`;
function mk(roles, { hidden = false, reveal = true } = {}) {
  const room = newRoom('PANEL', 'hostkey');
  reduce(room, HOST, { type: 'addPlayers', names: roles.map((_, i) => nm(i)) });
  reduce(room, HOST, { type: 'setConfig', mode: 'app', roles, advanced: { hiddenSetup: hidden }, rules: { revealOnDeath: reveal }, revealPolicy: 2 });
  const d = reduce(room, HOST, { type: 'deal' }); if (d.error) throw new Error(d.error);
  return room;
}
const renders = (room) => {
  const out = [rolesModel(viewForHost(room))];
  for (const p of room.players) out.push(rolesModel(viewForPlayer(room, p.id)));
  return out;
};

test('every viewer gets the identical render, for every preset', () => {
  for (const pr of MAFIA_PRESETS) for (const n of [pr.min, pr.max]) {
    const room = mk(pr.mix(n), { hidden: !!pr.hiddenSetup });
    for (const phase of ['dealt', 'dead']) {
      if (phase === 'dead') room.players[1].alive = false;
      const ms = renders(room);
      for (const opts of [{ gate: true, button: 'See my role' }, { gate: false }]) {
        const html = ms.map((m) => rolesPanel(m, opts));
        assert.ok(html.every((h) => h === html[0]), `${pr.id}/${n} ${phase}`);
      }
      assert.ok(ms.every((m) => rolesChip(m) === rolesChip(ms[0])));
    }
  }
});

test('groups by team with totals, a count and one line per role', () => {
  const room = mk(['mafia', 'mafia', 'hooker', 'doctor', 'detective', 'villager', 'villager', 'jester']);
  const m = rolesModel(viewForPlayer(room, room.players[0].id));
  assert.deepEqual(m.groups.map((g) => [g.title, g.total]), [['Town', 4], ['Mafia', 3], ['On their own', 1]]);
  const html = rolesPanel(m, { gate: true });
  assert.match(text(html), /Town, 4/); assert.match(text(html), /Mafia, 3/); assert.match(text(html), /On their own, 1/);
  assert.match(text(html), /See my role/);
  assert.equal(m.count, 8);
  assert.match(rolesChip(m), />8 roles</);
  assert.equal((html.match(/class="rs-row /g) || []).length, 6);
});

test('no player name and no live state appears on the panel, the sheet or the chip', () => {
  const room = mk(['mafia', 'doctor', 'detective', 'villager', 'villager']);
  room.players[2].alive = false;
  for (const m of renders(room)) for (const h of [rolesPanel(m, { gate: true }), rolesPanel(m), rolesChip(m)]) {
    assert.doesNotMatch(h, /Nm[a-e]z/);
    assert.doesNotMatch(text(h), /\b(alive|dead|left|remaining)\b/i);
  }
});

test('disguised roles show as what their holder believes, on every phone', () => {
  const room = mk(['mafia', 'doctor', 'confused_detective', 'detective', 'villager', 'villager']);
  const ms = renders(room);
  assert.ok(ms.every((m) => !JSON.stringify(m).match(/confused/)));
  assert.ok(ms.every((m) => rolesPanel(m) === rolesPanel(ms[0])));
});

test('hidden setup: the view carries no role ids; the sheet says so and shows the count and the balance rule', () => {
  const room = mk(['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'jester', 'villager'], { hidden: true });
  const pv = viewForPlayer(room, room.players[0].id);
  assert.deepEqual(pv.setupRoles, []); assert.equal(pv.setupHidden, true);
  for (const m of renders(room)) {
    assert.equal(m.hidden, true);
    const t = text(rolesPanel(m));
    assert.match(t, /The host kept the roles secret this game/);
    assert.match(t, /8 players/);
    if (HIDDEN_SETUP_SHOWS_BALANCE) assert.match(t, /At least 1 Mafia.*Mafia are always fewer than Town/);
    assert.match(t, /Roles fill in here when a card is shown on death/);
    assert.doesNotMatch(t, /Doctor|Detective|Jester|Villager/);
    assert.match(rolesChip(m), new RegExp(HIDDEN_CHIP_LABEL.replace('?', '\\?')));
    assert.doesNotMatch(rolesChip(m), /\d roles/);
  }
});

test('hidden setup: roles fill in as they are shown on death, only with reveal on death', () => {
  const room = mk(['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'jester', 'villager'], { hidden: true });
  room.players.find((p) => p.roleId === 'doctor').alive = false;
  for (const m of renders(room)) {
    const t = text(rolesPanel(m));
    assert.match(t, /Shown so far/); assert.match(t, /Doctor/); assert.doesNotMatch(t, /Detective|Jester/);
  }
  const off = mk(['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'jester', 'villager'], { hidden: true, reveal: false });
  off.players.find((p) => p.roleId === 'doctor').alive = false;
  for (const m of renders(off)) { const t = text(rolesPanel(m)); assert.doesNotMatch(t, /Shown so far|Doctor/); assert.match(t, /stay hidden until the game ends/); }
});

test('a row opens the full rules of the role, the same text for everyone', () => {
  const room = mk(['mafia', 'doctor', 'detective', 'villager', 'villager']);
  const [a, b] = [rolesModel(viewForHost(room)), rolesModel(viewForPlayer(room, room.players[0].id))];
  const ha = rolesPanel(a, { openId: 'doctor' }); assert.equal(ha, rolesPanel(b, { openId: 'doctor' }));
  assert.match(text(ha), /At night/); assert.match(ha, /aria-expanded="true"/);
  assert.equal(setupRoleList(['villager', 'villager'])[0].roles[0].count, 2);
});
