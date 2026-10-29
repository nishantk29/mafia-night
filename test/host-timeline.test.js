// Item 1: the Host timeline. The cards come from nightScript (the data resolveNight walks), so the script cannot
// drift from the rules; they never show who holds a role; no step can block, dead and blocked roles included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAFIA_PRESETS } from '../public/js/preset-mixes.js';
import { PRESETS } from '../public/js/presets.js';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';
import { nightScript, resolveOrder, resolveNight, nightVersion } from '../public/js/engine.js';
import { ROLE_BY_ID } from '../public/js/roles.js';
import { pressNext } from '../public/js/night-nav.js';
import { nightModel, dayModel, stepName, collapsedText, card, timeline, stepBody } from '../public/js/host-timeline.js';

const HOST = { host: true };
const nm = (i) => `Nm${String.fromCharCode(97 + (i % 26))}${i >= 26 ? 'q' : ''}z`; // cannot collide with any word on the screen
function mkRoom(roles, { dead = [], blind = false } = {}) {
  const room = newRoom('STORY', 'hostkey');
  reduce(room, HOST, { type: 'addPlayers', names: roles.map((_, i) => nm(i)) });
  reduce(room, HOST, { type: 'setConfig', mode: 'app', roles });
  const d = reduce(room, HOST, { type: 'deal' }); if (d.error) throw new Error(`deal refused: ${d.error}`);
  for (const i of dead) room.players[i].alive = false;
  const s = reduce(room, HOST, { type: 'startNight' }); if (s.error) throw new Error(s.error);
  return room;
}
const MIXES = [
  ...MAFIA_PRESETS.flatMap((p) => [p.min, Math.ceil((p.min + p.max) / 2), p.max].map((n) => ({ id: `${p.id}/${n}`, roles: p.mix(n) }))),
  ...PRESETS.map((p) => ({ id: p.id, roles: p.roles })),
  { id: 'three-detectives', roles: ['mafia', 'godfather', 'doctor', 'detective', 'detective', 'detective', 'villager', 'villager', 'villager', 'tracker'] },
];
const freshUi = () => ({ n: 1, actions: {}, picks: {} });
const NAMES = (room) => room.players.map((p) => p.name);
const leaks = (html, names) => names.filter((n) => html.includes(n));

test('timeline order equals the reducer order for every preset and role mix', () => {
  for (const m of MIXES) {
    for (const dead of [[], [0, 3]]) {
      const room = mkRoom(m.roles, { dead });
      const v = viewForHost(room);
      assert.deepEqual(v.script.map((s) => s.key), nightScript(room).map((s) => s.key), m.id);
      const model = nightModel(v, freshUi());
      // every script step is on the timeline exactly once, in script order: the current card, then the upcoming rows
      const keys = [model.card.step?.key, ...model.upcoming.map((u) => u.key)].filter((k) => k && !k.startsWith('@'));
      const fromScript = v.script.map((s) => s.key);
      assert.deepEqual(model.intro ? model.upcoming.map((u) => u.key).filter((k) => !k.startsWith('@')) : keys, fromScript, `${m.id} dead=${dead}`);
      // the steps resolveNight walks are, in order, the action steps of that same list
      assert.deepEqual(resolveOrder(room).map((s) => s.key), v.script.filter((s) => s.kind === 'action' && s.type !== 'execCheck').map((s) => s.key), m.id);
    }
  }
});

test('resolveNight acts in resolveOrder', () => {
  const room = mkRoom(['mafia', 'godfather', 'doctor', 'detective', 'villager', 'villager', 'villager']);
  const order = resolveOrder(room).map((s) => s.key);
  const sorted = [...order].sort((a, b) => nightScript(room).findIndex((s) => s.key === a) - nightScript(room).findIndex((s) => s.key === b));
  assert.deepEqual(order, sorted);
  assert.ok(resolveNight(structuredClone(room), {}).ok !== false);
});

test('the current card, the timeline and the dock name no role holder', () => {
  for (const m of MIXES) {
    const room = mkRoom(m.roles, { dead: [1] });
    const v = viewForHost(room); const names = NAMES(room);
    const ui = freshUi();
    for (let i = 0; i < 40; i++) {
      const model = nightModel(v, ui);
      if (!model.card && !model.intro) break;
      const c = model.card;
      const body = c.step ? stepBody(v, c.step, ui) : '';
      const picker = /<div class="st-pick"[\s\S]*?<\/button><\/div>/.exec(body)?.[0] || '';
      const outside = timeline({ done: model.done, upcoming: model.upcoming, current: card({ kicker: c.name, key: c.key, say: c.say, todo: c.todo, dead: c.dead, body: body.replace(picker, ''), then: c.then }) }) + model.button.label;
      assert.deepEqual(leaks(outside, names), [], `${m.id} step ${i}: ${c.key}`);
      // the picker is the same for everyone: every living player (the dead on a dead-target step), the actor included
      if (picker && c.step.kind === 'action' && c.step.targets) {
        const want = (c.step.dead ? v.players.filter((p) => !p.alive) : v.players.filter((p) => p.alive)).map((p) => p.id);
        const got = [...picker.matchAll(/data-id="([^"]+)"/g)].map((x) => x[1]);
        assert.deepEqual(got, want, `${m.id} picker ${c.key}`);
      }
      const r = pressNext(v, ui);
      if (r.blocked) { ui.actions[c.key] = { targets: [], skipped: true }; ui.focus = c.key; if (!model.intro) continue; }
      if (model.intro) ui.opened = true;
      if (r.send) break;
    }
  }
});

test('done steps collapse to a role and a verb, never a name', () => {
  const room = mkRoom(['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager']);
  const v = viewForHost(room);
  const mafia = v.script.find((s) => s.roleId === 'mafia' && s.kind === 'action');
  assert.equal(collapsedText(mafia), 'Mafia picked a target');
  const ui = freshUi(); ui.opened = true; ui.actions[mafia.key] = { targets: [room.players[2].id] };
  const model = nightModel(v, ui);
  assert.ok(model.done.some((d) => d.text === 'Mafia picked a target'));
  assert.deepEqual(leaks(model.done.map((d) => d.text).join(' '), NAMES(room)), []);
  assert.deepEqual(model.upcoming.map((u) => u.name).filter((n) => /Doctor|Detective|Everyone/.test(n)), model.upcoming.map((u) => u.name));
  assert.equal(model.upcoming.at(-1).name, 'Everyone');
});

test('dead roles still get their call, worded the same as living ones', () => {
  const roles = ['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager'];
  const alive = viewForHost(mkRoom(roles));
  const gone = viewForHost(mkRoom(roles, { dead: [2, 3] }));
  assert.deepEqual(gone.script.map((s) => stepName(s)), alive.script.map((s) => stepName(s)));
  const a = nightModel(alive, { ...freshUi(), opened: true }); const g = nightModel(gone, { ...freshUi(), opened: true });
  assert.equal(g.card.say, a.card.say); assert.equal(g.card.todo, a.card.todo); assert.equal(g.card.dead, a.card.dead);
});

test('no step can block: with dead and blocked roles every card gets past Next, Skip at worst', () => {
  for (const m of MIXES) {
    for (const dead of [[], [1], [0, 1, 2, 3]]) {
      const room = mkRoom(m.roles, { dead });
      const v = viewForHost(room); const ui = freshUi();
      let sent = null;
      for (let i = 0; i < v.script.length + 3 && !sent; i++) {
        const model = nightModel(v, ui);
        if (model.intro) { ui.opened = true; continue; }
        if (!model.button.enabled) {
          // the dock names the reason and offers Skip: skipping always enables Next
          assert.ok(model.button.why, `${m.id}: disabled Next names a reason`);
          const s = model.card.step; ui.actions[s.key] = { targets: [] }; ui.focus = s.key;
          assert.ok(nightModel(v, ui).button.enabled, `${m.id}: ${s.key} still blocks after Skip`);
        }
        const r = pressNext(v, ui); assert.ok(!r.blocked, `${m.id}: ${r.blocked}`);
        sent = r.send;
      }
      assert.equal(sent?.type, 'submitNight', `${m.id} dead=${dead}: the night reaches submit`);
    }
  }
});

test('day vote: tap who is out, No one for a tie, a gold button that names the choice, no tally', () => {
  const room = mkRoom(['mafia', 'doctor', 'detective', 'villager', 'villager']);
  reduce(room, HOST, { type: 'submitNight', actions: {} });
  const v = viewForHost(room);
  assert.equal(v.phase, 'day');
  const dee = v.players[3];
  let m = dayModel(v, { stage: 'vote' });
  assert.equal(m.button.enabled, false); assert.match(m.button.why, /Tap who/);
  m = dayModel(v, { stage: 'vote', sel: dee.id });
  assert.equal(m.button.label, `Vote ${dee.name} out`); assert.equal(m.button.action, 'condemn'); assert.equal(m.button.enabled, true);
  assert.ok(m.upcoming.some((u) => u.name === `${dee.name} shows their card`));
  m = dayModel(v, { stage: 'vote', sel: 'none' });
  assert.equal(m.button.label, 'No one is out'); assert.equal(m.button.action, 'noCondemn');
  m = dayModel(v, { stage: 'vote', sel: dee.id, result: `${dee.name} was voted out` });
  assert.equal(m.button.label, 'Start night 2');
  assert.equal(ROLE_BY_ID.villager.name, 'Villager');
});
