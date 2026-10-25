// v7 rooms: every look-alike call family is numbered 1..N, the phone shows the number, the Confused Cop is a disguised Cop.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, checkCard, stepScript, stepCues, doneStepLines, callNumbers, shownRoleId } from '../public/js/engine.js';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';

const ANON = { anon: true };
const BAD = /insane|naive|paranoid|confused|\breal\b/i;
function mk(roles, { version = 7, salt = 0.5, dead = [], godfather = false } = {}) {
  const room = newRoom('NC', 'hostkey');
  const spec = [...roles.map((r, i) => [`C${i}`, r]), ['Mob', 'mafia'], ...(godfather ? [['God', 'godfather']] : []), ['V1', 'villager'], ['V2', 'villager']];
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = !dead.includes(name);
  }
  room.nightVersion = version; room.phase = 'night'; room.night = 2; room.copSalt = salt;
  return room;
}
const steps = (room, id) => nightScript(room).filter((s) => s.actors[0] === `p${id}`);
const lines = (room, st) => {
  const sc = stepScript(st, room); const c = stepCues(st);
  return [sc.say, sc.then, c.open, c.close, ...doneStepLines(st, { text: 'X is MAFIA.' }).filter((l) => l.type === 'say').map((l) => l.text)].filter(Boolean);
};
const answer = (room, name, target = 'Mob') => {
  const st = steps(room, name)[0];
  const ans = { [st.key]: { targets: [`p${target}`], on: true, flip: 'heads' } };
  const pv = previewNight(room, ans, st.key);
  return { st, pv, card: checkCard(room, st, pv) };
};

describe('v7 numbered calls', () => {
  for (const [label, roles] of [['2', ['cop', 'insane_cop']], ['3', ['cop', 'cop', 'paranoid_cop']], ['5', ['cop', 'naive_cop', 'confused_cop', 'insane_cop', 'cop']]]) {
    test(`${label} cops: one step each, Cop 1..N once, clean Say lines`, () => {
      const room = mk(roles);
      const cops = nightScript(room).filter((s) => s.label);
      assert.equal(cops.length, roles.length);
      assert.deepEqual(cops.map((s) => s.label).sort(), roles.map((_, i) => `Cop ${i + 1}`));
      for (const st of cops) {
        assert.equal(st.actors.length, 1);
        for (const l of lines(room, st)) { assert.ok(!BAD.test(l), l); assert.ok(l.includes(st.label), l); }
        assert.ok(!BAD.test(st.hint));
        assert.ok(!BAD.test((stepScript(st, room).notes || []).join(' ')));
      }
    });
  }

  test('numbering is random per game but stable within it', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const room = mk(['cop', 'insane_cop'], { salt: Math.random() });
      seen.add(callNumbers(room).pC0.n);
      const a = JSON.stringify(callNumbers(room));
      room.night = 3; room.players[1].alive = false;
      assert.equal(JSON.stringify(callNumbers(room)), a);
      assert.deepEqual(viewForPlayer(room, 'pC0').me.callName, viewForPlayer(room, 'pC0').me.callName);
    }
    assert.deepEqual([...seen].sort(), [1, 2]);
  });

  test('skewed results on each card', () => {
    const room = mk(['cop', 'insane_cop', 'paranoid_cop', 'naive_cop', 'confused_cop']);
    assert.equal(answer(room, 'C0', 'Mob').card.text, 'MAFIA');
    assert.equal(answer(room, 'C1', 'Mob').card.text, 'NOT MAFIA');
    assert.equal(answer(room, 'C2', 'V1').card.text, 'MAFIA');
    assert.equal(answer(room, 'C3', 'Mob').card.text, 'NOT MAFIA');
    const c = answer(room, 'C4', 'Mob');
    assert.ok(['MAFIA', 'NOT MAFIA'].includes(c.card.text));
    assert.ok(c.st.silentFlip);
  });

  test('dead cops keep their numbered steps with NO ANSWER', () => {
    const room = mk(['cop', 'cop', 'insane_cop'], { dead: ['C1', 'C2'] });
    const before = JSON.stringify(callNumbers(room));
    const cops = nightScript(room).filter((s) => s.label);
    assert.equal(cops.length, 3);
    assert.equal(answer(room, 'C1').card.text, 'NO ANSWER');
    assert.equal(answer(room, 'C2').card.text, 'NO ANSWER');
    assert.notEqual(answer(room, 'C0').card.text, 'NO ANSWER');
    room.players[1].alive = true;
    assert.equal(JSON.stringify(callNumbers(room)), before);
  });

  for (const n of [2, 3]) {
    test(`${n} Detectives are numbered; Godfather stays a Villager`, () => {
      const room = mk(Array(n).fill('detective'), { godfather: true });
      const ds = nightScript(room).filter((s) => s.roleId === 'detective');
      assert.deepEqual(ds.map((s) => s.label).sort(), Array.from({ length: n }, (_, i) => `Detective ${i + 1}`));
      for (let i = 0; i < n; i++) {
        const r = answer(room, `C${i}`, 'God');
        assert.equal(r.card.text, 'VILLAGER');
      }
    });
  }

  test('phone: confused cop shows Cop and the call name; v6 unchanged', () => {
    const room = mk(['cop', 'confused_cop']);
    room.players.forEach((p) => { p.roleId = p.roleId; });
    const me = viewForPlayer(room, 'pC1').me;
    assert.equal(me.role.name, 'Cop');
    assert.match(me.callName, /^Cop [12]$/);
    assert.equal(callNumbers(room).pC0.n + callNumbers(room).pC1.n, 3);
    assert.equal(viewForPlayer(room, 'pV1').me.callName, null);
    const six = mk(['cop', 'confused_cop'], { version: 6 });
    assert.equal(viewForPlayer(six, 'pC1').me.role.name, 'Confused Cop');
    assert.equal(viewForPlayer(six, 'pC1').me.callName, null);
    assert.equal(shownRoleId('confused_cop', room), 'cop');
    assert.equal(shownRoleId('confused_cop', six), 'confused_cop');
  });

  test('a single Cop is not numbered', () => {
    const room = mk(['cop']);
    const st = nightScript(room).find((s) => s.roleId === 'cop');
    assert.equal(stepCues(st).open.startsWith('Cop, open your eyes.'), true);
    assert.equal(st.label, undefined);
    assert.equal(viewForPlayer(room, 'pC0').me.callName, null);
  });

  test('v6 rooms keep the old numbering', () => {
    const room = mk(['cop', 'insane_cop', 'detective', 'detective'], { version: 6 });
    const s = nightScript(room);
    assert.deepEqual(s.filter((x) => /^Cop \d/.test(x.prompt)).length, 2);
    assert.ok(s.filter((x) => x.roleId === 'detective').every((x) => !/Detective \d/.test(x.prompt)));
    assert.ok(s.every((x) => !x.label));
  });
});
