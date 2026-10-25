// v4 Host script: one read-aloud line per night step, silent notes in prepNotes, a ready morning announcement.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, stepScript, prepNotes, nightOpen, nightClose, morningAnnouncement, resolveNight, hasStoryScript, hasGraveyard, nightVersion, START_CUE, END_CUE } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

function mk(spec, night, version = 4) {
  const room = newRoom('V4', 'hostkey'); room.nightVersion = 4; // pinned: v5 moves investigator results to the night check card (night-upgrade-v5.test.js)
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  room.nightVersion = version; room.phase = 'night'; room.night = night; room.copSalt = 0.5;
  return room;
}
const fillers = () => [['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager']];
const withRole = (id, alive, night) => mk([['X', id, alive], ['Mob', 'mafia'], ...fillers()], night);
const nightRoles = ROLES.filter((r) => r.action || r.night1 || r.meeting);

describe('v4 gating', () => {
  test('new rooms are v4 and keep the v2/v3 rules', () => {
    const room = newRoom('A', 'k'); room.nightVersion = 4; // pinned: v5 moves investigator results to the night check card (night-upgrade-v5.test.js)
    assert.equal(nightVersion(room), 4);
    assert.ok(hasStoryScript(room) && hasGraveyard(room));
    assert.ok(!hasStoryScript({ nightVersion: 3 }) && !hasStoryScript({}));
  });
  test('v1/v2/v3 keep silent info steps in nightScript; v4 is the same script minus them', () => {
    for (const r of nightRoles) for (const night of [1, 2]) {
      const v3 = nightScript(withRole(r.id, true, night));
      const v4 = nightScript(withRole(r.id, true, night));
      for (const v of [1, 2, 3]) {
        const room = withRole(r.id, true, night); room.nightVersion = v;
        assert.equal(stepScript(nightScript(room)[0], room), null);
        assert.deepEqual(prepNotes(room), []);
      }
      const old = withRole(r.id, true, night); old.nightVersion = 3;
      const full = nightScript(old);
      assert.deepEqual(v4, full.filter((s) => !(s.kind === 'info' && !s.spoken)), r.id);
      assert.ok(v3.length <= full.length);
    }
  });
});

describe('stepScript', () => {
  for (const r of nightRoles) for (const night of [1, 2]) {
    test(`${r.id} night ${night}: one say, then/notes shape, same alive or dead`, () => {
      const out = {};
      for (const alive of [true, false]) {
        const room = withRole(r.id, alive, night);
        out[alive] = nightScript(room).map((st) => {
          const s = stepScript(st, room);
          assert.equal(typeof s.say, 'string'); assert.ok(s.say.trim(), `${st.key} has no say`);
          assert.ok(s.then === null || (typeof s.then === 'string' && s.then.trim()));
          assert.ok(Array.isArray(s.notes) && s.notes.every((n) => typeof n === 'string' && n.trim()));
          // (Coroner / Amnesiac / Vulture legitimately ask for "a dead player": that is their target pool.)
          if (!['autopsy', 'copyRole'].includes(st.type)) assert.ok(!/\b(dead|died|death)\b/i.test(JSON.stringify(s)), 'script mentions death');
          assert.ok(!/\n/.test(s.say));
          return [st.key, s];
        });
        assert.ok(nightScript(room).every((st) => !(st.kind === 'info' && !st.spoken)));
      }
      assert.deepEqual(out[true], out[false]);
    });
  }
  test('silent steps go to prepNotes, not the step list', () => {
    const room = mk([['E', 'executioner'], ['Mer', 'merlin'], ['Mob', 'mafia'], ...fillers()], 1);
    const keys = nightScript(room).map((s) => s.key);
    assert.ok(!keys.includes('n1:executioner'));
    assert.ok(keys.includes('n1:merlin'));
    const notes = prepNotes(room);
    assert.deepEqual(notes.map((n) => n.key), ['n1:executioner']);
    assert.match(notes[0].text, /target/i);
    assert.deepEqual(prepNotes(mk([['E', 'executioner'], ['Mob', 'mafia'], ...fillers()], 2)), []);
  });
  test('info call splits the read-aloud line from the Host instruction', () => {
    const room = mk([['Mer', 'merlin'], ['Mob', 'mafia'], ...fillers()], 1);
    const st = nightScript(room).find((s) => s.key === 'n1:merlin');
    assert.deepEqual(stepScript(st, room), { say: 'Merlin, open your eyes.', then: 'Merlin, close your eyes.', notes: ['Show them the Mafia.'] });
  });
  test('open/close lines', () => {
    assert.equal(nightOpen(newRoom('A', 'k')), START_CUE);
    assert.equal(nightClose(newRoom('A', 'k')), END_CUE);
  });
});

describe('morningAnnouncement', () => {
  const base = () => mk([['Mob', 'mafia'], ['Doc', 'doctor'], ['Cop', 'cop'], ['Vic', 'villager'], ['Two', 'villager'], ['Jan', 'janitor']], 1);
  const act = (room, key, ...targets) => ({ [key]: { targets, on: true } });
  test('one death reveals the role', () => {
    const room = base(); const rep = resolveNight(room, act(room, 'meeting:mafia', 'pVic'));
    const m = morningAnnouncement(room, rep);
    assert.equal(m.say, 'Everyone, open your eyes. Vic was killed in the night. They were the Villager.');
  });
  test('two deaths', () => {
    const room = base();
    const rep = resolveNight(room, { ...act(room, 'meeting:mafia', 'pVic'), 'act:pDoc': { targets: ['pTwo'], on: true } });
    rep.deaths.push({ id: 'pTwo', cause: 'x', hidden: false }); room.players.find((p) => p.id === 'pTwo').alive = false;
    const m = morningAnnouncement(room, rep);
    assert.match(m.say, /Vic was killed in the night\. They were the Villager\. Two was killed in the night\. They were the Villager\.$/);
  });
  test('no deaths', () => {
    const room = base(); const rep = resolveNight(room, {});
    assert.equal(morningAnnouncement(room, rep).say, 'Everyone, open your eyes. Nobody died last night.');
  });
  test('save never names the protector in say', () => {
    const room = base();
    const rep = resolveNight(room, { ...act(room, 'meeting:mafia', 'pVic'), 'act:pDoc': { targets: ['pVic'], on: true } });
    const m = morningAnnouncement(room, rep);
    assert.equal(m.say, 'Everyone, open your eyes. Nobody died last night.');
    assert.ok(m.notes.some((n) => /saved/.test(n)));
    assert.ok(!/doctor|saved|protect/i.test(m.say));
  });
  test('cleaned victim stays a mystery', () => {
    const room = base();
    const rep = resolveNight(room, { ...act(room, 'meeting:mafia', 'pVic'), 'act:pJan': { on: true, targets: [] } });
    const m = morningAnnouncement(room, rep);
    assert.equal(m.say, 'Everyone, open your eyes. Vic was killed in the night. Their role stays a mystery.');
    assert.ok(m.notes.some((n) => /cleaned/i.test(n)));
  });
  test('revealOnDeath off', () => {
    const room = base(); room.config.rules.revealOnDeath = false;
    const rep = resolveNight(room, act(room, 'meeting:mafia', 'pVic'));
    assert.equal(morningAnnouncement(room, rep).say, 'Everyone, open your eyes. Vic was killed in the night.');
  });
  test('investigator results stay private; v3 rooms get null', () => {
    const room = base();
    const rep = resolveNight(room, act(room, 'act:pCop', 'pMob'));
    const m = morningAnnouncement(room, rep);
    assert.ok(!/Cop|MAFIA/.test(m.say) && m.notes.some((n) => /Mob is MAFIA/.test(n)));
    room.nightVersion = 3;
    assert.equal(morningAnnouncement(room, rep), null);
  });
});

describe('v4 host view story fields', () => {
  test('v4 view carries story; v3 does not', async () => {
    const { viewForHost } = await import('../public/js/room.js');
    const v4 = viewForHost(withRole('cop', true, 1));
    assert.ok(v4.story && v4.story.open && v4.story.close && v4.story.steps && Array.isArray(v4.story.prep));
    for (const st of v4.script) assert.ok(v4.story.steps[st.key]?.say || !stepScript(st, withRole('cop', true, 1)));
    const r3 = withRole('cop', true, 1); r3.nightVersion = 3;
    assert.equal(viewForHost(r3).story, undefined);
  });
});
