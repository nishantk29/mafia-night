import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupRoleList, rolesSheet } from '../public/js/roles_sheet.js';
import { newRoom, reduce, viewForPlayer, viewForHost } from '../public/js/room.js';
const handle = (room, _a, a) => reduce(room, { host: true }, a);
import { ROLE_BY_ID, registerRoles } from '../public/js/roles.js';

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const SETUP = ['mafia', 'mafia', 'godfather', 'cop', 'insane_cop', 'doctor', 'miller', 'villager', 'villager', 'villager'];
const flat = (l) => l.flatMap((g) => g.roles);

test('host list matches the setup and groups by team', () => {
  const l = setupRoleList(SETUP);
  assert.deepEqual(l.map((g) => g.title), ['Good', 'Evil']);
  const f = flat(l);
  for (const id of new Set(SETUP)) assert.equal(f.find((x) => x.id === id).count, SETUP.filter((x) => x === id).length);
  assert.ok(l[1].roles.every((r) => ['mafia', 'godfather'].includes(r.id)));
});

test('player list merges disguised roles and hides variant ids', () => {
  const l = setupRoleList(SETUP, { forPlayer: true });
  const f = flat(l);
  assert.equal(f.find((x) => x.id === 'cop').count, 2);
  assert.equal(f.find((x) => x.id === 'villager').count, 4);
  assert.ok(!f.some((x) => ['insane_cop', 'miller'].includes(x.id)));
  const t = text(rolesSheet(l));
  assert.match(t, /Cop ×2 \(one may be unreliable\)/);
  assert.doesNotMatch(rolesSheet(l), /insane_cop|miller|Insane|Miller/);
});

test('confused, naive and paranoid cops show as Cop', () => {
  const f = flat(setupRoleList(['cop', 'confused_cop', 'naive_cop', 'paranoid_cop', 'mafia'], { forPlayer: true }));
  assert.equal(f.find((x) => x.id === 'cop').count, 4);
  assert.equal(f.length, 2);
});

test('sheet carries no live state and custom roles appear', () => {
  const room = newRoom('ABCD', 'host');
  handle(room, null, { type: 'setCustomRoles', roles: [{ id: 'c_zz1234', name: 'Zed Zorro', emoji: '🦊', alignment: 'town', blurb: 'A custom helper.' }] });
  for (const n of ['Alice', 'Bob', 'Cleo', 'Dan', 'Eve']) handle(room, null, { type: 'addPlayer', name: n });
  room.config.roles = ['mafia', 'cop', 'insane_cop', 'doctor', 'villager'];
  const snap = (phase) => {
    const hv = viewForHost(room); const pv = viewForPlayer(room, room.players[0].id);
    const a = rolesSheet(setupRoleList(hv.config.roles));
    const b = rolesSheet(setupRoleList(pv.setupRoles, { forPlayer: true, unreliable: pv.setupUnreliable }));
    for (const h of [a, b]) {
      const t = text(h);
      assert.doesNotMatch(t, /Alice|Bob|Cleo|Dan|Eve/, phase);
      assert.doesNotMatch(t, /\b(alive|dead|left|remaining)\b/i, phase);
    }
    assert.ok(!JSON.stringify(pv.setupRoles).match(/insane_cop|miller|confused_cop|naive_cop|paranoid_cop/));
    return [a, b];
  };
  const lobby = snap('lobby');
  const r = handle(room, null, { type: 'deal' }); assert.ok(r.ok !== false, JSON.stringify(r));
  const dealt = snap('dealt');
  assert.deepEqual(dealt, lobby);
  room.players[1].alive = false;
  assert.deepEqual(snap('dead'), lobby);
  assert.match(text(rolesSheet(setupRoleList(['c_zz1234', 'mafia']))), /Zed Zorro/);
});
