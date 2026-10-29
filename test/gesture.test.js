import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, stepCues, stepGesture, doneStepLines } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

const LIVE = ['investigate', 'track', 'watch', 'autopsy'];

function mk(roleId) {
  const room = newRoom('TEST', 'hostkey-secret');
  const spec = [['Sub', roleId], ['Sub2', roleId], ['Mo', 'mafia'], ['Vic', 'villager'], ['Vi2', 'villager'], ['Dead', 'villager'], ['Fi', 'villager']];
  for (const [name, rid] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    room.players.find((p) => p.name === name).roleId = rid;
  }
  room.players.find((p) => p.name === 'Dead').alive = false;
  room.phase = 'night'; room.night = 2;
  return room;
}
const pid = (room, name) => room.players.find((p) => p.name === name).id;

// Every private night step of every role, with the result the host sees after recording a choice.
const cases = [];
for (const role of ROLES) {
  const room = mk(role.id);
  for (const s of nightScript(room).filter((st) => st.kind === 'action' && st.roleId === role.id)) {
    const pick = (s.type === 'autopsy' || s.type === 'copyRole') ? 'Dead' : 'Vic';
    const targets = s.targets === 0 ? [] : [pid(room, pick), pid(room, 'Vi2')].slice(0, s.targets || 1);
    const actions = { [s.key]: { targets, on: true, coin: 'mafia' } };
    const result = LIVE.includes(s.type) ? previewNight(room, actions, s.key) : null;
    cases.push({ role, s, result });
  }
}

describe('night gestures', () => {
  test('covers a wide spread of roles', () => assert.ok(cases.length > 30));
  for (const { role, s, result } of cases) {
    test(`${role.id} (${s.type}): gesture, then close-eyes`, () => {
      const g = stepGesture(s, result);
      if (LIVE.includes(s.type) && (!result || result.blocked)) assert.equal(g, null);
      else if (s.type === 'investigate' && !['role', 'parity'].includes(s.check)) {
        assert.equal(g.kind, 'yesno');
        assert.match(g.text, /^(Nod your head \/ Thumbs up — .+ is Mafia|Shake your head \/ Thumbs down — .+ is not Mafia)$/);
        assert.equal(g.text.startsWith('Nod'), /is MAFIA\./.test(result.text));
      } else assert.deepEqual(g, { kind: 'ack', text: 'Give them a nod: choice recorded' });

      const lines = doneStepLines(s, result);
      const close = lines.findIndex((l) => l.type === 'say');
      assert.equal(lines[close]?.text, stepCues(s).close);
      if (g) assert.equal(lines.findIndex((l) => l.type === 'gesture'), close - 1);
      else assert.equal(close, 0);
    });
  }
  test('non-spoken info steps get no gesture', () => {
    const s = { kind: 'info', spoken: false, roleId: 'villager', prompt: 'Note' };
    assert.equal(stepGesture(s, null), null);
    assert.deepEqual(doneStepLines(s, null), []);
  });
  test('blocked or missing result gives no yes/no gesture', () => {
    const s = cases.find((c) => c.role.id === 'detective').s;
    assert.equal(stepGesture(s, { text: '', blocked: true }), null);
    assert.equal(stepGesture(s, null), null);
  });
  test('Detective: Mafia nods, not Mafia shakes', () => {
    const s = cases.find((c) => c.role.id === 'detective').s;
    assert.equal(stepGesture(s, { text: 'Mo is MAFIA.' }).text, 'Nod your head / Thumbs up — Mo is Mafia');
    assert.equal(stepGesture(s, { text: 'Vic is NOT Mafia.' }).text, 'Shake your head / Thumbs down — Vic is not Mafia');
  });
  test('role -> gesture kind table', () => {
    const t = {};
    for (const { role, s, result } of cases) t[role.id] = stepGesture(s, result)?.kind ?? 'none';
    console.log(JSON.stringify(t));
  });
});
