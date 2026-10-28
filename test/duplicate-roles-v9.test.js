// Nishant 2026-10-28: "bugs like the cop 1 and cop 2 thing ruin games." For 2 and 3 copies of EVERY role with a night action:
// each copy gets its own numbered call that wakes only its own player, its pick is kept apart, and its result goes to its own
// player. Root cause fixed in v9: team members with their own action (Hooker, Framer, Janitor, Consigliere...) were left out
// of the numbering (engine callFamilies), so two Hookers shared one call ("Mafia, open your eyes" before v9) and both woke.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, resolveNight, stepScript, callNumbers, assignCallNumbers, LATEST_NIGHT_VERSION } from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce, viewForPlayer, viewForHost } from '../public/js/room.js';

const HOST = { host: true };
function mk(roleId, n, version = LATEST_NIGHT_VERSION) {
  const spec = [...Array(n)].map((_, i) => [`R${i}`, roleId]).concat([['M', roleId === 'mafia' ? 'villager' : 'mafia'], ['A', 'villager'], ['B', 'villager'], ['C', 'villager'], ['Dd', 'villager', false]]);
  const room = newRoom('DU', 'hk');
  assert.ok(reduce(room, HOST, { type: 'addPlayers', names: spec.map(([a]) => a) }).ok);
  for (const [nm, rid, alive = true] of spec) { const p = room.players.find((q) => q.name === nm); p.id = `p${nm}`; p.roleId = rid; p.alive = alive; }
  const partner = ROLES.find((r) => r.id === roleId).requiresPartner;
  if (partner) room.players.find((q) => q.name === 'C').roleId = partner;
  room.config.roles = room.players.map((p) => p.roleId);
  room.nightVersion = version; room.phase = 'night'; room.night = 2; room.copSalt = 0.37; assignCallNumbers(room);
  return room;
}
const mine = (room) => nightScript(room).filter((s) => s.kind === 'action' && s.key.startsWith('act:') && s.actors.some((id) => /^pR/.test(id)));
const NIGHT_ROLES = ROLES.filter((r) => r.action && !r.action.group);

describe('v9: two or three copies of any night role each get their own call, pick and result', () => {
  for (const r of NIGHT_ROLES) for (const n of [2, 3]) {
    test(`${r.id} x${n}`, () => {
      const room = mk(r.id, n);
      const steps = mine(room);
      assert.equal(steps.length, n, 'one step per copy');
      assert.deepEqual(steps.map((s) => s.actors.length), Array(n).fill(1), 'each step wakes exactly one player');
      assert.equal(new Set(steps.map((s) => s.actors[0])).size, n, 'every copy is called');
      const says = steps.map((s) => stepScript(s, room).say);
      assert.equal(new Set(says).size, n, `distinct Say lines: ${says.join(' / ')}`);
      const nums = callNumbers(room);
      for (const s of steps) {
        assert.ok(s.label, 'numbered');
        assert.ok(says[steps.indexOf(s)].startsWith(`${s.label},`), 'the Say line calls this copy by its number');
        assert.equal(`${nums[s.actors[0]].family} ${nums[s.actors[0]].n}`, s.label);
        assert.equal(viewForPlayer(room, s.actors[0]).me.callName, s.label, 'the phone shows the same number');
        assert.match(s.hint, new RegExp(`${s.label} is R\\d`), 'the Host is told who to tap');
      }
      // Picks stay apart and results go to the right player.
      if (steps[0].targets >= 1 && !steps[0].dead) {
        const targets = ['pA', 'pB', 'pC'];
        const acts = Object.fromEntries(steps.map((s, i) => [s.key, { targets: s.targets === 2 ? [targets[i], 'pM'] : [targets[i]], flip: 'heads', coin: 'innocent' }]));
        for (const [i, s] of steps.entries()) {
          const pv = previewNight(room, acts, s.key);
          if (pv?.text && ['investigate', 'track', 'watch'].includes(s.type)) assert.match(pv.text, new RegExp(['A', 'B', 'C'][i]), `${s.label}'s result is about its own pick`);
        }
        const copy = structuredClone(room);
        const rep = resolveNight(copy, acts);
        for (const i of rep.info) assert.equal(i.actorIds.length, 1, 'a result belongs to one player');
      }
    });
  }
  test('numbers stay put across nights and deaths', () => {
    const room = mk('hooker', 3);
    const before = JSON.stringify(callNumbers(room));
    resolveNight(room, {}); room.phase = 'day';
    room.players.find((p) => p.name === 'R1').alive = false;
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    assert.equal(JSON.stringify(callNumbers(room)), before);
  });
  test('pinned: a v8 room keeps the shared team call for two Hookers', () => {
    const room = mk('hooker', 2, 8);
    const steps = mine(room);
    assert.deepEqual(steps.map((s) => s.label), [undefined, undefined]);
    assert.equal(viewForHost(room).nightVersion, 8);
  });
});
