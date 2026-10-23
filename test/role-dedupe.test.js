// Role list dedupe: retired twin ids are aliases, near-duplicates are grouped picker entries.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROLE_BY_ID, ROLE_ALIASES, ROLE_GROUPS, resolveRoleId, roleOf, pickerEntries } from '../public/js/roles.js';
import { newRoom, reduce, viewForHost, roomFromView, migrateRoleIds } from '../public/js/room.js';
import { setupWarnings, nightScript, buildDeckMap } from '../public/js/engine.js';

const HOST = { host: true };
const H = (room, a) => reduce(room, HOST, a);

// type:order of every grouped variant, as it was before grouping (grouping must not touch mechanics).
const ACTIONS = {
  grandma: '-', granny: 'alert:22', bodyguard: 'guard:21', muscle: 'guard:21', mercenary: 'guard:21',
  security_guard: 'blockVisitors:14', bouncer: 'blockVisitors:13', doorman: 'blockVisitors:14', smuggler: 'blockVisitors:14',
  jailer: 'jail:10', kidnapper: 'jail:10', drunk: 'block:11', hooker: 'block:12', collaborator: 'block:11',
  veteran: 'alert:22', sentinel: 'alert:22', prepper: 'alert:22', parity_cop: 'investigate:62', bookkeeper: 'investigate:62', oracle: '-',
  tracker: 'track:63', shadow: 'track:63', lookout: 'watch:64', spy: 'watch:64', hangman: '-', defense_attorney: '-', mob_lawyer: '-',
  jester: '-', patsy: '-', poltergeist: '-', zealot: '-', executioner: '-', rival: '-', stalker: 'watch:64', vendetta: '-',
  survivor: '-', hermit: '-', opportunist: '-', profiteer: 'watch:64', vulture: 'autopsy:58',
  traitor: '-', fifth_columnist: '-', telepath: '-', whisperer: '-',
};

describe('role aliases', () => {
  test('every alias resolves to an existing canonical role', () => {
    assert.ok(Object.keys(ROLE_ALIASES).length >= 1);
    for (const [old, id] of Object.entries(ROLE_ALIASES)) {
      assert.equal(resolveRoleId(old), id);
      assert.ok(ROLE_BY_ID[id] && !ROLES.some((r) => r.id === old), old);
      assert.equal(roleOf(old), ROLE_BY_ID[id]);
      assert.equal(ROLE_BY_ID[old], ROLE_BY_ID[id]);
    }
    assert.equal(resolveRoleId('villager'), 'villager');
    assert.equal(resolveRoleId('constructor'), 'constructor');
  });

  test('setConfig with old ids loads as the canonical role', () => {
    const room = newRoom('T', 'k');
    assert.ok(H(room, { type: 'setConfig', roles: ['civilian', 'fifth_columnist', 'whisperer', 'mafia'] }).ok);
    assert.deepEqual(room.config.roles, ['villager', 'fifth_columnist', 'whisperer', 'mafia']);
    assert.equal(ROLE_BY_ID.fifth_columnist.alignment, 'third');
    assert.equal(ROLE_BY_ID.whisperer.alignment, 'mafia'); // not a twin of Telepath (Town), so it stays its own role
  });

  test('a restored room and a host view with old ids work', () => {
    const room = newRoom('T', 'k');
    room.config.roles = ['civilian', 'mafia', 'cop', 'civilian'];
    for (const n of ['A', 'B', 'C', 'D']) H(room, { type: 'addPlayer', name: n });
    room.players[0].roleId = 'civilian';
    room.deck = { map: [{ card: 'AS', roleId: 'civilian' }], claimed: {} };
    migrateRoleIds(room);
    assert.deepEqual(room.config.roles, ['villager', 'mafia', 'cop', 'villager']);
    assert.equal(room.players[0].roleId, 'villager');
    assert.equal(room.deck.map[0].roleId, 'villager');
    const v = JSON.parse(JSON.stringify(viewForHost(room)));
    v.config.roles = ['civilian', 'cop']; v.players[1].roleId = 'civilian';
    const back = roomFromView(v);
    assert.deepEqual(back.config.roles, ['villager', 'cop']);
    assert.equal(back.players[1].roleId, 'villager');
    assert.doesNotThrow(() => setupWarnings(['civilian', 'mafia', 'cop'].map(resolveRoleId), 3));
    assert.doesNotThrow(() => buildDeckMap(['civilian', 'mafia', 'cop'].map(resolveRoleId)));
  });

  test('reduce rewrites old ids on a stored room (setRole too)', () => {
    const room = newRoom('T', 'k');
    room.config.roles = ['civilian'];
    H(room, { type: 'addPlayer', name: 'A' });
    assert.ok(H(room, { type: 'setRole', playerId: room.players[0].id, roleId: 'civilian' }).ok);
    assert.equal(room.players[0].roleId, 'villager');
    assert.deepEqual(room.config.roles, ['villager']);
  });
});

describe('role groups', () => {
  test('each group has distinct existing variants, all keeping their action and night order', () => {
    const seen = new Set();
    for (const g of ROLE_GROUPS) {
      assert.ok(g.ids.length >= 2, g.id);
      assert.equal(new Set(g.ids).size, g.ids.length);
      for (const id of g.ids) {
        const r = ROLE_BY_ID[id];
        assert.ok(r, id); assert.ok(!seen.has(id), `${id} in two groups`); seen.add(id);
        assert.equal(r.group, g.id);
        const a = r.action;
        assert.equal(a ? `${a.type}:${a.order}` : '-', ACTIONS[id], id);
      }
    }
    assert.deepEqual([...seen].sort(), Object.keys(ACTIONS).sort());
    assert.ok(ROLE_BY_ID.granny.variant.includes('shoots visitors'));
  });

  test('the Cop family stays ungrouped', () => {
    for (const id of ['cop', 'insane_cop', 'naive_cop', 'paranoid_cop', 'confused_cop']) assert.equal(ROLE_BY_ID[id].group, undefined, id);
  });

  test('picker entries: one per group, and two variants of one group count independently', () => {
    const entries = pickerEntries();
    assert.equal(entries.length, ROLES.length - ROLE_GROUPS.reduce((n, g) => n + g.ids.length - 1, 0));
    const e = entries.find((x) => x.group?.id === 'bodyguard');
    assert.deepEqual(e.variants.map((v) => v.id), ['bodyguard', 'muscle', 'mercenary']);
    const room = newRoom('T', 'k');
    for (const id of ['bodyguard', 'muscle', 'muscle']) H(room, { type: 'setConfig', roles: [...room.config.roles, id] });
    const counts = {}; for (const id of room.config.roles) counts[id] = (counts[id] || 0) + 1;
    assert.deepEqual(counts, { bodyguard: 1, muscle: 2 });
    assert.deepEqual(entries.filter((x) => x.role).every((x) => !x.role.group), true);
  });

  test('a night with two variants of one group wakes each at its own order', () => {
    const room = newRoom('T', 'k');
    for (const n of ['A', 'B', 'C', 'D', 'E']) H(room, { type: 'addPlayer', name: n });
    H(room, { type: 'setConfig', roles: ['drunk', 'hooker', 'mafia', 'cop', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).ok);
    const ids = new Set(nightScript(room).map((s) => s.roleId));
    assert.ok(ids.has('drunk') && ids.has('hooker') && !ids.has('civilian'));
  });
});
