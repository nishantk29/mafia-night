// Cop and Detective merge (night version 10). One Detective checks MAFIA or NOT MAFIA; the old exact-role Detective is the
// optional Investigator; Parity Cop is the Comparer. Rooms already in a game keep their roles and names (pinned by nightVersion).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, ROLE_BY_ID, LEGACY_ROLES, INVESTIGATOR_ID, INVESTIGATOR_NAME, OLD_TO_MERGED, MERGED_TO_LEGACY, MERGE_NIGHT_VERSION,
  mergedRoleId, legacyRoleId, storedToMerged, pinStoredId, pickerEntries,
} from '../public/js/roles.js';
import {
  LATEST_NIGHT_VERSION, NEUTRAL_ANSWER, nightScript, previewNight, checkCard, resolveNight, callNumbers, upgradeTarget, hasMergedDetective, setupWarnings,
} from '../public/js/engine.js';
import { newRoom, reduce, migrateRoleIds, viewForHost, viewForPlayer, roomFromView } from '../public/js/room.js';
import { PRESETS } from '../public/js/presets.js';
import { simpleCounts, countsOf, SIMPLE_ROLES } from '../public/js/simple.js';
import { rng, pickNightActions, livePreviews, disguiseLeaks } from '../scripts/sim-lib.mjs';

const HOST = { host: true }; const ANON = { anon: true };
const filler = (n, from = 1) => Array.from({ length: n }, (_, i) => [`V${from + i}`, 'villager']);
function mk(spec, { version = LATEST_NIGHT_VERSION, phase = 'night', night = 2 } = {}) {
  const room = newRoom('DM', 'hostkey');
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = true;
  }
  room.nightVersion = version; room.phase = phase; room.night = night; room.day = phase === 'day' ? night : 0; room.copSalt = 0.5;
  return room;
}
const stepOf = (room, who) => nightScript(room).find((s) => s.actors.includes(`p${who}`) && s.kind === 'action');
function ask(room, who, target, extra = {}) {
  const st = stepOf(room, who);
  const acts = { [st.key]: { targets: [`p${target}`], on: true, ...extra } };
  const pv = previewNight(room, acts, st.key);
  return { st, pv, card: checkCard(room, st, pv), rep: resolveNight(room, acts) };
}

describe('mapping', () => {
  test('the table: Cop -> Detective, Insane Cop -> Insane Detective, Parity Cop -> Comparer, old Detective -> Investigator', () => {
    assert.equal(mergedRoleId('cop'), 'detective');
    assert.equal(mergedRoleId('insane_cop'), 'insane_detective');
    assert.equal(mergedRoleId('parity_cop'), 'comparer');
    assert.equal(mergedRoleId('detective'), INVESTIGATOR_ID);
    assert.equal(ROLE_BY_ID.insane_detective.name, 'Insane Detective');
    assert.equal(ROLE_BY_ID.comparer.name, 'Comparer');
  });
  test('the other Cop variants follow', () => {
    for (const [old, id] of [['confused_cop', 'confused_detective'], ['naive_cop', 'naive_detective'], ['paranoid_cop', 'paranoid_detective'], ['dirty_cop', 'dirty_detective']]) {
      assert.equal(mergedRoleId(old), id);
      assert.ok(ROLE_BY_ID[id] && !ROLE_BY_ID[id].legacy, id);
      assert.equal(ROLE_BY_ID[id].name, ROLE_BY_ID[old].name.replace('Cop', 'Detective'));
      assert.equal(ROLE_BY_ID[id].action.check, ROLE_BY_ID[old].action.check, `${id} keeps its check`);
      assert.equal(ROLE_BY_ID[id].action.order, ROLE_BY_ID[old].action.order);
    }
    assert.equal(ROLE_BY_ID.naive_detective.seesAs, 'detective');
    assert.equal(ROLE_BY_ID.paranoid_detective.seesAs, 'detective');
    assert.equal(ROLE_BY_ID.insane_detective.seesAs, 'detective');
    assert.equal(ROLE_BY_ID.confused_detective.requiresPartner, 'detective');
  });
  test('one simultaneous pass, never chained: a list of old ids maps once', () => {
    assert.deepEqual(['cop', 'detective', 'villager', 'parity_cop'].map(mergedRoleId), ['detective', INVESTIGATOR_ID, 'villager', 'comparer']);
    assert.equal(mergedRoleId('constructor'), 'constructor');
    assert.equal(mergedRoleId('toString'), 'toString');
    assert.equal(mergedRoleId(undefined), undefined);
  });
  test('stored ids of a pinned room move to the merged ids once', () => {
    assert.deepEqual(['cop', 'detective_v1', 'insane_cop', 'parity_cop', 'mafia'].map(storedToMerged), ['detective', INVESTIGATOR_ID, 'insane_detective', 'comparer', 'mafia']);
    assert.equal(storedToMerged('detective_v1'), INVESTIGATOR_ID);
    assert.equal(storedToMerged('mafia'), 'mafia');
  });
  test('legacyRoleId is the inverse for pinned rooms, and the old exact-role Detective is detective_v1', () => {
    for (const [old, merged] of Object.entries(OLD_TO_MERGED)) assert.equal(legacyRoleId(merged), old === 'detective' ? 'detective_v1' : old);
    assert.equal(Object.keys(MERGED_TO_LEGACY).length, Object.keys(OLD_TO_MERGED).length);
    assert.equal(pinStoredId('detective'), 'detective_v1');
    assert.equal(pinStoredId(pinStoredId('detective')), 'detective_v1');
  });
  test('INVESTIGATOR_NAME is the one place the name lives', () => {
    assert.equal(ROLE_BY_ID[INVESTIGATOR_ID].name, INVESTIGATOR_NAME);
    assert.ok(ROLE_BY_ID[INVESTIGATOR_ID].action.prompt.startsWith(`${INVESTIGATOR_NAME},`));
    assert.equal(ROLE_BY_ID[INVESTIGATOR_ID].action.check, 'role');
  });
  test('the library has no Cop, the legacy roles are hidden from every picker but still resolve', () => {
    assert.ok(ROLES.every((r) => !r.legacy && !/\bCop\b/.test(r.name)));
    assert.ok(LEGACY_ROLES.every((r) => r.legacy && ROLE_BY_ID[r.id] === r));
    const names = pickerEntries().flatMap((e) => (e.role ? [e.role.name] : [e.group.name, ...e.variants.map((v) => v.name)]));
    for (const n of ['Detective', 'Insane Detective', 'Comparer', INVESTIGATOR_NAME]) assert.ok(names.includes(n), n);
    assert.ok(!names.some((n) => /Cop/.test(n)));
  });
  test('presets use merged ids and are valid at every size they claim', () => {
    for (const p of PRESETS) {
      assert.ok(p.roles.every((id) => ROLE_BY_ID[id] && !ROLE_BY_ID[id].legacy), p.id);
      assert.ok(p.roles.length >= 5, p.id);
      const room = newRoom('PR', 'k');
      reduce(room, HOST, { type: 'addPlayers', names: p.roles.map((_, i) => `P${i}`) });
      reduce(room, HOST, { type: 'setConfig', mode: 'app', roles: p.roles });
      assert.deepEqual(room.config.roles, p.roles, p.id);
      assert.ok(reduce(room, HOST, { type: 'deal' }).ok, p.id);
      assert.ok(!setupWarnings(p.roles, p.roles.length).some((w) => w.level === 'error'), p.id);
    }
    assert.ok(PRESETS.find((p) => p.id === 'classic7').roles.includes('detective'));
  });
  test('Simple mode: the Detective takes the old Cop cards (Q♥ then Q♦); a pinned room that lists `cop` still counts', () => {
    assert.ok(SIMPLE_ROLES.some((r) => r.id === 'detective' && r.name === 'Detective'));
    assert.equal(simpleCounts(8).detective, 1);
    assert.equal(countsOf(['mafia', 'cop', 'cop', 'villager']).detective, 2);
  });
});

describe('the merged Detective (night version 10)', () => {
  const spec = [['Mob', 'mafia'], ['God', 'godfather'], ['Det', 'detective'], ['Inv', INVESTIGATOR_ID], ['Ic', 'insane_detective'], ['Cmp', 'comparer'], ['Doc', 'doctor'], ...filler(3)];
  test('learns MAFIA or NOT MAFIA; the Godfather shows as NOT MAFIA', () => {
    assert.equal(ask(mk(spec), 'Det', 'Mob').card.text, 'MAFIA');
    assert.equal(ask(mk(spec), 'Det', 'God').card.text, 'NOT MAFIA');
    assert.equal(ask(mk(spec), 'Det', 'V1').card.text, 'NOT MAFIA');
    assert.equal(ask(mk(spec), 'Det', 'Mob').card.kind, 'alignment');
  });
  test('the Investigator still learns the exact role; the Godfather shows as a Villager', () => {
    assert.equal(ask(mk(spec), 'Inv', 'God').card.text, 'VILLAGER');
    assert.equal(ask(mk(spec), 'Inv', 'Mob').card.text, 'MAFIA'.replace('MAFIA', ROLE_BY_ID.mafia.name.toUpperCase()));
  });
  test('Insane Detective is flipped; Comparer compares two players', () => {
    assert.equal(ask(mk(spec), 'Ic', 'Mob').card.text, 'NOT MAFIA');
    assert.equal(ask(mk(spec), 'Ic', 'V1').card.text, 'MAFIA');
    const room = mk(spec); const st = stepOf(room, 'Cmp');
    const compare = (a, b) => checkCard(room, st, previewNight(room, { [st.key]: { targets: [`p${a}`, `p${b}`], on: true } }, st.key)).text;
    assert.equal(compare('V1', 'V2'), 'SAME');
    assert.equal(compare('Mob', 'V1'), 'DIFFERENT');
    assert.equal(compare('Mob', 'God'), 'DIFFERENT'); // the Godfather reads as NOT MAFIA
  });
  test('the call says Detective, and the phone never says Cop', () => {
    const solo = [['Mob', 'mafia'], ['Det', 'detective'], ...filler(4)];
    const room = mk(solo, { phase: 'dealt', night: 0 });
    assert.match(stepOf(mk(solo), 'Det').prompt, /^Detective, wake up\. Who do you check\?$/);
    const v = viewForPlayer(room, 'pDet');
    assert.equal(v.me.role.name, 'Detective');
    assert.ok(!/\bCop\b/.test(JSON.stringify(v)));
  });
  test('Insane Detective reads the Detective card on their phone, not their own name', () => {
    const v = viewForPlayer(mk(spec, { phase: 'dealt', night: 0 }), 'pIc');
    assert.equal(v.me.role.name, 'Detective');
    assert.ok(!JSON.stringify(v).includes('Insane'));
  });
  test('a Confused Detective needs a regular Detective, and is called as one', () => {
    const lone = [['Mob', 'mafia'], ['Cd', 'confused_detective'], ...filler(4)];
    assert.ok(setupWarnings(lone.map((x) => x[1]), 6).some((w) => w.level === 'error' && /regular Detective/.test(w.text)));
    const room = mk([['Mob', 'mafia'], ['Cd', 'confused_detective'], ['Det', 'detective'], ...filler(3)]);
    assert.deepEqual(nightScript(room).filter((s) => /Detective \d/.test(s.prompt)).map((s) => s.prompt.slice(0, 11)).sort(), ['Detective 1', 'Detective 2']);
  });
});

describe('two and three Detectives are called and numbered on their own', () => {
  for (const n of [2, 3]) {
    test(`${n} Detectives: Detective 1..${n}, each pick and result is their own`, () => {
      const dets = Array.from({ length: n }, (_, i) => [`D${i}`, 'detective']);
      const room = mk([...dets, ['Mob', 'mafia'], ['God', 'godfather'], ...filler(3)]);
      const steps = nightScript(room).filter((s) => s.kind === 'action' && s.roleId === 'detective');
      assert.deepEqual(steps.map((s) => s.label).sort(), Array.from({ length: n }, (_, i) => `Detective ${i + 1}`));
      assert.ok(steps.every((s) => s.prompt.startsWith(s.label + ',')));
      const nums = callNumbers(room);
      assert.deepEqual(Object.values(nums).map((x) => x.n).sort(), Array.from({ length: n }, (_, i) => i + 1));
      assert.ok(Object.values(nums).every((x) => x.family === 'Detective' && x.of === n));
      // Detective 1 checks the Mafia, the rest check the Godfather: results stay with whoever asked.
      const acts = {}; const by = {};
      for (const s of steps) { const mob = s.label === 'Detective 1'; acts[s.key] = { targets: [mob ? 'pMob' : 'pGod'], on: true }; by[s.key] = mob; }
      for (const s of steps) assert.equal(checkCard(room, s, previewNight(room, acts, s.key)).text, by[s.key] ? 'MAFIA' : 'NOT MAFIA');
      for (let i = 0; i < n; i++) assert.equal(viewForPlayer(room, `pD${i}`).me.callName, `Detective ${nums[`pD${i}`].n}`);
    });
  }
  test('a Detective and the Investigator are separate calls, never numbered together', () => {
    const room = mk([['D', 'detective'], ['I', INVESTIGATOR_ID], ['Mob', 'mafia'], ...filler(3)]);
    const calls = nightScript(room).filter((s) => s.kind === 'action').map((s) => s.prompt.split(',')[0]);
    assert.ok(calls.includes('Detective') && calls.includes(INVESTIGATOR_NAME));
    assert.ok(!calls.some((c) => /\d/.test(c)));
  });
});

describe('sims: 1, 2 and 3 Detectives', () => {
  const host = HOST;
  const ok = (room, a) => { const r = reduce(room, host, a); assert.ok(!r.error, `${a.type}: ${r.error}`); return r; };
  function play(k, seed, godfather) {
    const R = rng(seed);
    const roles = ['mafia', godfather ? 'godfather' : 'mafia', 'doctor', ...Array(k).fill('detective'), ...Array(8 - k).fill('villager')];
    const room = newRoom('SIM', 'k');
    ok(room, { type: 'addPlayers', names: roles.map((_, i) => `P${i}`) });
    ok(room, { type: 'setConfig', mode: 'app', roles });
    ok(room, { type: 'deal' });
    const problems = [];
    const leaks = () => { for (const p of room.players) problems.push(...disguiseLeaks(viewForPlayer(room, p.id), p.roleId)); };
    let checks = 0;
    leaks();
    for (let round = 0; round < 8 && room.phase !== 'over'; round++) {
      while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
      if (room.phase === 'over') break;
      ok(room, { type: 'startNight' });
      const before = viewForHost(room);
      const calls = before.script.filter((s) => s.kind === 'action' && s.roleId === 'detective').map((s) => s.label || s.prompt.split(',')[0]);
      if (k === 1) assert.ok(calls.every((c) => c === 'Detective'), calls.join());
      else assert.equal(new Set(calls).size, calls.length, `numbers are unique: ${calls}`);
      const actions = pickNightActions(R, before);
      const previews = livePreviews(before, actions);
      for (const s of before.script.filter((x) => x.roleId === 'detective')) {
        const pv = previews?.[s.key]; const t = before.players.find((p) => p.id === actions[s.key]?.targets?.[0]);
        if (!pv?.text || !t || pv.text === NEUTRAL_ANSWER) continue; // dead Detectives and skipped steps are called like any other
        checks++;
        const mafia = ROLE_BY_ID[t.roleId].alignment === 'mafia' && t.roleId !== 'godfather'; // the Godfather shows as NOT MAFIA
        assert.equal(pv.text, `${t.name} is ${mafia ? 'MAFIA' : 'NOT Mafia'}.`);
      }
      ok(room, { type: 'submitNight', actions });
      const after = viewForHost(room);
      problems.push(...(after.report?.info || []).filter((i) => i.roleId === 'detective').map(() => 'a Detective result reached the morning report'));
      for (const p of room.players) problems.push(...(viewForPlayer(room, p.id).me.results || []).map(() => `a result reached ${p.name}'s phone`));
      leaks();
      if (room.phase === 'over') break;
      while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
      const alive = room.players.filter((p) => p.alive);
      if (room.phase === 'day' && alive.length) ok(room, { type: 'condemn', playerId: R.pick(alive).id });
      leaks();
    }
    return { problems, checks };
  }
  for (const k of [1, 2, 3]) {
    test(`${k} Detective${k > 1 ? 's' : ''}: 60 games, no oracle problems, no leaks, every check reads MAFIA or NOT MAFIA`, () => {
      let all = []; let checks = 0;
      for (let g = 0; g < 60; g++) { const r = play(k, k * 1000 + g, g % 2 === 0); all = all.concat(r.problems.map((x) => `game ${g}: ${x}`)); checks += r.checks; }
      assert.deepEqual(all.slice(0, 8), []);
      assert.ok(checks > 20, `only ${checks} Detective checks ran`);
    });
  }
});

describe('pinned rooms keep the old roles and names', () => {
  const legacySpec = [['Mob', 'mafia'], ['God', 'godfather'], ['Cop', 'cop'], ['Det', 'detective_v1'], ['Ic', 'insane_cop'], ['Pc', 'parity_cop'], ['Doc', 'doctor'], ...filler(3)];
  test('a version 9 room behaves exactly as before: Cop sees a side, Detective the exact role (Godfather a Villager)', () => {
    const room = mk(legacySpec, { version: 9 });
    assert.equal(hasMergedDetective(room), false);
    assert.equal(ask(mk(legacySpec, { version: 9 }), 'Cop', 'God').card.text, 'NOT MAFIA');
    assert.equal(ask(mk(legacySpec, { version: 9 }), 'Cop', 'Mob').card.text, 'MAFIA');
    assert.equal(ask(mk(legacySpec, { version: 9 }), 'Det', 'God').card.text, 'VILLAGER');
    assert.equal(ask(mk(legacySpec, { version: 9 }), 'Det', 'Doc').card.text, 'DOCTOR');
    assert.equal(ask(mk(legacySpec, { version: 9 }), 'Ic', 'Mob').card.text, 'NOT MAFIA');
    const prompts = nightScript(room).filter((s) => s.kind === 'action' && s.type === 'investigate').map((s) => s.prompt.replace(/^(Cop|Detective|Parity Cop)( \d)?,.*/, '$1')).sort();
    assert.deepEqual(prompts, ['Cop', 'Cop', 'Detective', 'Parity Cop']);
  });
  test('names stay: Cop, Insane Cop, Parity Cop, and the old Detective is still called "Detective"', () => {
    assert.deepEqual(['cop', 'insane_cop', 'parity_cop', 'detective_v1'].map((id) => ROLE_BY_ID[id].name), ['Cop', 'Insane Cop', 'Parity Cop', 'Detective']);
    const v = viewForPlayer(mk(legacySpec, { version: 9, phase: 'dealt', night: 0 }), 'pCop');
    assert.equal(v.me.role.name, 'Cop');
  });
  test('stored data from before the merge: `detective` in a pinned room reads as the old exact-role Detective', () => {
    const room = mk([['Mob', 'mafia'], ['God', 'godfather'], ['Det', 'detective'], ...filler(4)], { version: 9 });
    room.config.roles = ['mafia', 'godfather', 'detective', 'villager'];
    migrateRoleIds(room);
    assert.equal(room.players.find((p) => p.name === 'Det').roleId, 'detective_v1');
    assert.deepEqual(room.config.roles, ['mafia', 'godfather', 'detective_v1', 'villager']);
    migrateRoleIds(room); // idempotent
    assert.equal(room.players.find((p) => p.name === 'Det').roleId, 'detective_v1');
    assert.equal(ask(room, 'Det', 'God').card.text, 'VILLAGER');
  });
  test('a view (host or phone) of a pinned room is migrated the same way', () => {
    const room = mk([['Mob', 'mafia'], ['Det', 'detective'], ...filler(4)], { version: 9, phase: 'dealt', night: 0 });
    migrateRoleIds(room);
    const back = roomFromView(viewForHost(room));
    assert.equal(back.players.find((p) => p.name === 'Det').roleId, 'detective_v1');
  });
  test('a version 10 room never rewrites `detective`', () => {
    const room = mk([['Mob', 'mafia'], ['Det', 'detective'], ...filler(4)]);
    migrateRoleIds(room);
    assert.equal(room.players.find((p) => p.name === 'Det').roleId, 'detective');
  });
  test('the pinned room is not touched by the merged library: a Detective picked in its setup is the Cop', () => {
    const room = mk([], { version: 9, phase: 'lobby', night: 0 });
    reduce(room, HOST, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
    assert.ok(reduce(room, HOST, { type: 'setConfig', roles: ['mafia', 'detective', INVESTIGATOR_ID, 'comparer', 'villager'] }).ok);
    assert.deepEqual(room.config.roles, ['mafia', 'cop', 'detective_v1', 'parity_cop', 'villager']);
  });
  test('a mid-game room cannot take the merge: the new-night-script switch stops at 9', () => {
    const room = mk(legacySpec, { version: 8, phase: 'day', night: 1 });
    assert.equal(upgradeTarget(room), MERGE_NIGHT_VERSION - 1);
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok);
    assert.equal(room.upgradeNext, 9);
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    assert.equal(room.nightVersion, 9);
    assert.equal(room.players.find((p) => p.name === 'Cop').roleId, 'cop');
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).error);
  });
  test('a lobby room can take the merge and its setup maps once', () => {
    const room = mk([], { version: 9, phase: 'lobby', night: 0 });
    room.config.roles = ['mafia', 'cop', 'detective_v1', 'parity_cop', 'insane_cop'];
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok);
    assert.equal(room.nightVersion, LATEST_NIGHT_VERSION);
    assert.deepEqual(room.config.roles, ['mafia', 'detective', INVESTIGATOR_ID, 'comparer', 'insane_detective']);
  });
  test('a new game (Restart) moves the setup to the merged roles, as the room moves to the latest version', () => {
    const room = newRoom('RS', 'hk');
    reduce(room, HOST, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E', 'F'] });
    reduce(room, HOST, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager'] });
    room.nightVersion = 9; room.config.roles = ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager'];
    assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
    assert.ok(reduce(room, HOST, { type: 'restart' }).ok);
    assert.equal(room.nightVersion, LATEST_NIGHT_VERSION);
    assert.ok(room.config.roles.includes('detective') && !room.config.roles.includes('cop'));
    assert.ok(room.players.every((p) => p.roleId !== 'cop'));
  });
  test('new rooms start merged', () => {
    assert.equal(newRoom('X', 'k').nightVersion, LATEST_NIGHT_VERSION);
    assert.ok(LATEST_NIGHT_VERSION >= MERGE_NIGHT_VERSION);
  });
});

describe('print links', () => {
  test('?roles= without v is an old link (cop is the Detective); v=10 links are read as merged ids', async () => {
    const { SETUP_LINK_VERSION } = await import('../public/js/roles.js');
    assert.equal(SETUP_LINK_VERSION, 10);
    const fromOld = (ids, v) => ids.map((id) => (v !== String(SETUP_LINK_VERSION) ? mergedRoleId(id) : id));
    assert.deepEqual(fromOld(['cop', 'detective'], undefined), ['detective', INVESTIGATOR_ID]);
    assert.deepEqual(fromOld(['detective', INVESTIGATOR_ID], '10'), ['detective', INVESTIGATOR_ID]);
  });
});
