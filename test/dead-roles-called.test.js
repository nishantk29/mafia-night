// v2 night rules: the script calls DEAD night-acting roles exactly like living ones, and their action does nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, stepCues, stepGesture, doneStepLines, previewNight, nightVersion } from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';

const nightRoles = ROLES.filter((r) => r.action || r.night1 || r.meeting);

// spec: [[name, roleId, alive?], ...]
function mk(spec, night) {
  const room = newRoom('DEAD', 'hostkey');
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive; // fixed ids: the Cop numbering is ranked by id
  }
  room.phase = 'night'; room.night = night;
  return room;
}
const fillers = () => [['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager'], ['Ghost', 'villager', false]];
// The role under test as player "X"; a Mafia member is added unless the role is itself in the Mafia meeting.
const scene = (roleId, alive, night, twin = false) => {
  const r = ROLE_BY_ID[roleId];
  const spec = [['X', roleId, alive], ...(twin ? [['Y', roleId, true]] : []), ...(r.meeting === 'mafia' ? [] : [['Mob', 'mafia']]), ...fillers()];
  const room = mk(spec, night);
  room.copSalt = 0.5;
  return room;
};
// Player ids are random per room: compare with names in their place.
const norm = (room, steps) => {
  let json = JSON.stringify(steps.map((s) => ({ ...s, cues: stepCues(s), gesture: stepGesture(s, null), done: doneStepLines(s, null) })));
  for (const p of room.players) json = json.split(p.id).join(`#${p.name}`);
  return JSON.parse(json);
};

const normScene = (...a) => { const room = scene(...a); return norm(room, nightScript(room)); };

describe('v2 rooms call dead roles like living ones', () => {
  test('new rooms are version 2', () => assert.equal(nightVersion(newRoom('A', 'k')), 2));

  for (const night of [1, 2, 3]) for (const r of nightRoles) {
    test(`${r.id}: night ${night} script identical dead or alive`, () => {
      const alive = normScene(r.id, true, night);
      const dead = normScene(r.id, false, night);
      assert.deepEqual(dead, alive);
      // keys, order, kind, prompt, spoken, hint, targets are all inside the steps compared above
    });
  }

  for (const r of nightRoles.filter((x) => !x.meeting)) {
    test(`${r.id}: numbering and "more than one" hints stay stable with a twin`, () => {
      for (const night of [1, 2]) {
        // A shared first-night info call lists its living members, as before, so only its actors may differ.
        const same = (list) => list.map((s) => (s.kind === 'info' ? { ...s, actors: undefined } : s));
        const alive = same(normScene(r.id, true, night, true));
        const dead = same(normScene(r.id, false, night, true));
        assert.deepEqual(dead, alive);
      }
    });
  }

  test('a meeting with every member dead is still called; with some alive it behaves as before', () => {
    const allDead = mk([['M1', 'mafia', false], ['M2', 'mafia', false], ...fillers()], 2);
    const step = nightScript(allDead).find((s) => s.key === 'meeting:mafia');
    assert.equal(step.prompt, 'Mafia, wake up. Who do you kill?');
    const mixed = mk([['M1', 'mafia', false], ['M2', 'mafia'], ...fillers()], 2);
    const ms = nightScript(mixed).find((s) => s.key === 'meeting:mafia');
    assert.deepEqual(ms.actors, [mixed.players.find((p) => p.name === 'M2').id]);
  });

  test('exhausted uses are still skipped for a dead role (same as alive)', () => {
    for (const alive of [true, false]) {
      const room = scene('vigilante', alive, 2);
      room.usage[room.players[0].id] = 1;
      assert.ok(!nightScript(room).some((s) => s.key === `act:${room.players[0].id}`));
    }
  });
});

const snapshot = (room, rep) => JSON.parse(JSON.stringify({
  rep, usage: room.usage, framed: room.framed, results: room.results, log: room.log.map((l) => l.text), phase: room.phase, shield: room.shield,
  players: room.players.map((p) => [p.name, p.alive, p.roleId, p.deathCause]),
}));
const pick = (room, s) => {
  if (s.targets === 0) return { on: true };
  const pool = s.dead ? room.players.filter((p) => !p.alive) : room.players.filter((p) => p.alive && !s.actors.includes(p.id) && p.name !== 'V3');
  return { targets: pool.slice(0, s.targets ?? 1).map((p) => p.id), flip: 'heads', coin: 'mafia' };
};

describe('a dead role\'s recorded action has no effect', () => {
  for (const night of [1, 2]) for (const r of nightRoles) {
    test(`${r.id}: night ${night} dead action == no action`, () => {
      const base = scene(r.id, false, night);
      const steps = nightScript(base).filter((s) => s.kind === 'action');
      const mine = steps.filter((s) => s.roleId === r.id || (s.key === 'meeting:mafia' && r.meeting === 'mafia') || (s.key === 'meeting:cult' && r.meeting === 'cult'));
      const kill = steps.find((s) => s.key === 'meeting:mafia' && r.meeting !== 'mafia');
      const mafiaHit = kill ? { 'meeting:mafia': { targets: [base.players.find((p) => p.name === 'V0').id] } } : {};
      const withAct = { ...mafiaHit }; for (const s of mine) withAct[s.key] = pick(base, s);
      const run = (actions) => { const room = structuredClone(base); const rep = resolveNight(room, actions); return snapshot(room, rep); };
      const a = run(withAct); const b = run(mafiaHit);
      assert.deepEqual(a, b);
      assert.equal(a.rep.info.length, 0);
      assert.equal(a.rep.conversions.length, 0);
    });
  }

  test('dead Doctor cannot save the Mafia target', () => {
    const room = mk([['Doc', 'doctor', false], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager']], 2);
    const id = (n) => room.players.find((p) => p.name === n).id;
    const rep = resolveNight(room, { 'meeting:mafia': { targets: [id('V0')] }, [`act:${id('Doc')}`]: { targets: [id('V0')] } });
    assert.deepEqual(rep.deaths.map((d) => d.id), [id('V0')]);
    assert.equal(rep.saves.length, 0);
  });

  test('dead Cop reveals nothing, to the report or the phone', () => {
    const room = mk([['Cop', 'cop', false], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager']], 2);
    const id = (n) => room.players.find((p) => p.name === n).id;
    const rep = resolveNight(room, { [`act:${id('Cop')}`]: { targets: [id('Mob')] } });
    assert.equal(rep.info.length, 0);
    assert.equal(room.results.length, 0);
  });

  test('the Host console still gets a live answer for a dead investigator, but nothing is recorded', () => {
    const room = mk([['Cop', 'cop', false], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager']], 2);
    const id = (n) => room.players.find((p) => p.name === n).id;
    const key = `act:${id('Cop')}`;
    const live = previewNight(room, { [key]: { targets: [id('Mob')] } }, key);
    assert.match(live.text, /Mob is MAFIA/);
    assert.equal(room.lastReport, null);
    assert.equal(viewForHost(room).nightVersion, 2);
  });

  test('a dead investigator does not change what a living Lookout is told', () => {
    const room = mk([['Cop', 'cop', false], ['Lk', 'lookout'], ['Mob', 'mafia'], ['V0', 'villager'], ['V1', 'villager']], 2);
    const id = (n) => room.players.find((p) => p.name === n).id;
    const steps = nightScript(room).filter((s) => s.kind === 'action');
    const cop = steps.find((s) => s.roleId === 'cop'); const lk = steps.find((s) => s.roleId === 'lookout');
    const rep = resolveNight(room, { [cop.key]: { targets: [id('V0')] }, [lk.key]: { targets: [id('V0')] } });
    assert.match(rep.info.find((i) => i.key === lk.key).text, /Nobody visited V0/);
  });
});
