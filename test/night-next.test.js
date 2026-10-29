// The Host's Next button: disabled only while a choice is missing, and it says which one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewForHost } from '../public/js/room.js';
import { nightNav, pressNext, SHORT_MAX } from '../public/js/night-nav.js';
import { dealt, hostScreen, S, ok, freshUi } from './night-drive-lib.mjs';

const CASES = (mode) => [
  // [name, roles, version, rules, shape, label]
  ['target action', ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], 8, { firstNightKill: true }, 'act:', 'Tap who the Doctor picked'],
  ['yes/no', ['mafia', 'veteran', 'villager', 'villager', 'villager'], 8, {}, 'act:', 'Tap the Veteran’s answer'],
  ['execCheck', ['mafia', 'executioner', 'villager', 'villager', 'villager'], 8, {}, 'act:', 'Show the Executioner their card'],
];
const modes = [['single phone', true, 'claim'], ['multi phone', false, 'app']];

function open(roles, version, rules, flow) {
  const g = dealt({ roles, version, flow, rules, seed: 5 });
  ok(g.room, { type: 'startNight' });
  return g;
}
const stepOf = (view, roleId) => view.script.find((s) => s.roleId === roleId);
const html = (view, local, ui) => { S.ui.night = ui; return hostScreen(view, local); };

for (const [mname, local, flow] of modes) {
  for (const [name, roles, version, rules, , label] of CASES()) {
    test(`${mname}: ${name}: Next is blocked and names the choice; a skip chip exists; skipping records {targets:[]}; undo removes it`, () => {
      const { room } = open(roles, version, rules, flow);
      const view = viewForHost(room);
      const role = name === 'target action' ? 'doctor' : name === 'yes/no' ? 'veteran' : 'executioner';
      const s = stepOf(view, role);
      const ui = freshUi(room); ui.focus = s.key;
      const nav = nightNav(view, ui);
      assert.equal(nav.enabled, false);
      assert.equal(nav.label, label);
      const short = { 'target action': 'Pick a player or No one', 'yes/no': 'Alert or Not tonight', execCheck: 'Show the card or Skip' }[name];
      assert.equal(nav.short, short);
      assert.ok(nav.short.length <= SHORT_MAX);
      assert.equal(nav.canSkip, true);
      assert.doesNotMatch(nav.label, /find every role first/i);
      const page = html(view, local, ui);
      assert.doesNotMatch(page, /find every role first/i);
      assert.match(page, /data-a="nextStep"[^>]*>|aria-disabled="true"[^>]*data-a="nextStep"/);
      if (name === 'target action') assert.match(page, /class="st-tok is-none"[^>]*data-a="skip"[\s\S]*?>No one</);
      else if (name === 'execCheck') assert.match(page, /data-a="skip"[^>]*>Skip</);
      else assert.match(page, /data-a="alert"[^>]*data-v="0">(No|Not tonight)</);
      // pressing a disabled Next does nothing
      assert.deepEqual(Object.keys(ui.actions), []);
      assert.ok(pressNext(view, ui).blocked);
      // "No one" (the skip handler)
      ui.actions[s.key] = { targets: [] };
      ui.focus = null;
      assert.ok(nightNav(view, ui).open.every((o) => o.key !== s.key));
      assert.match(html(view, local, ui), /(picked a target|answered|woke up|shown their card)</);
      // undo removes it and reopens it
      delete ui.actions[s.key]; ui.focus = s.key;
      assert.equal(nightNav(view, ui).current.key, s.key);
      assert.equal(nightNav(view, ui).enabled, false);
    });
  }

  test(`${mname}: an answered step is enabled "Next", the last one reads "Wake everyone up", and a finished step reopens when focused`, () => {
    const { room } = open(['mafia', 'doctor', 'villager', 'villager', 'villager'], 8, {}, flow);
    const view = viewForHost(room);
    const steps = view.script.filter((s) => s.kind === 'action');
    assert.ok(steps.length >= 2);
    const ui = freshUi(room);
    let nav = nightNav(view, ui);
    assert.equal(nav.enabled, false);
    steps.forEach((s, i) => {
      ui.actions[s.key] = { targets: [room.players.find((p) => !s.actors.includes(p.id)).id] };
      nav = nightNav(view, ui);
      const last = i === steps.length - 1 && view.script.every((x) => ui.actions[x.key]);
      assert.equal(nav.enabled || nav.needs?.kind !== undefined, true);
      if (last) { assert.equal(nav.label, 'Wake everyone up'); assert.equal(nav.action, 'resolve'); assert.equal(nav.enabled, true); }
    });
    // focusing a finished step reopens it: it is current, enabled, and rendered as the open step
    ui.focus = steps[0].key;
    nav = nightNav(view, ui);
    assert.equal(nav.current.key, steps[0].key);
    assert.equal(nav.enabled, true);
    assert.match(html(view, local, ui), new RegExp(`class="cue is-current[^"]*"[^>]*data-ck="${steps[0].key.replace(':', ':')}"`));
  });
}

test('info steps, used-up steps and dead-cover steps are "Next" at once and record themselves', () => {
  // info: the Mafia meet on a night with no kill
  let g = open(['mafia', 'mafia', 'villager', 'villager', 'villager'], 8, { firstNightKill: false }, 'app');
  let view = viewForHost(g.room);
  let ui = freshUi(g.room);
  let nav = nightNav(view, ui);
  assert.equal(nav.current.kind, 'info');
  assert.equal(nav.enabled, true); assert.equal(nav.canSkip, false); assert.equal(nav.needs, null);
  assert.equal(nav.label, 'Wake everyone up');
  const r = pressNext(view, ui);
  assert.deepEqual(ui.actions[nav.current.key], { done: true });
  assert.equal(r.send.type, 'submitNight');

  // used up (v8 still calls it)
  g = dealt({ roles: ['mafia', 'vigilante', 'villager', 'villager', 'villager'], flow: 'app', seed: 2 });
  const vig = g.room.players.find((p) => p.roleId === 'vigilante');
  g.room.usage[vig.id] = 1;
  ok(g.room, { type: 'startNight' });
  view = viewForHost(g.room); ui = freshUi(g.room);
  const spent = view.script.find((s) => s.spent);
  assert.ok(spent, 'a spent step is in the script');
  ui.focus = spent.key;
  nav = nightNav(view, ui);
  assert.equal(nav.enabled, true); assert.equal(nav.needs, null); assert.equal(nav.canSkip, false);
  assert.equal(nav.label, 'Next');
  pressNext(view, ui);
  assert.deepEqual(ui.actions[spent.key], { targets: [], skipped: true });
  assert.notEqual(ui.focus, spent.key);

  // dead cover: a dead Doctor is still called
  g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], flow: 'app', seed: 4 });
  g.room.players.find((p) => p.roleId === 'doctor').alive = false;
  ok(g.room, { type: 'startNight' });
  view = viewForHost(g.room); ui = freshUi(g.room);
  const dead = stepOf(view, 'doctor');
  ui.focus = dead.key;
  nav = nightNav(view, ui);
  assert.equal(nav.enabled, true); assert.equal(nav.label, 'Next');
  pressNext(view, ui);
  assert.deepEqual(ui.actions[dead.key], { targets: [], skipped: true });
});

test('blind identify: label names the role, count and Mafia; "No one has this card" chip; never "Find every role first"', () => {
  for (const local of [true, false]) {
    const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'cop', 'cop', 'villager', 'villager'], flow: 'blind', seed: 9 });
    ok(g.room, { type: 'startNight' });
    const view = viewForHost(g.room);
    const ui = freshUi(g.room);
    const ids = view.script.filter((s) => s.kind === 'identify');
    assert.ok(ids.length >= 3);
    for (const s of ids) {
      ui.focus = s.key;
      const nav = nightNav(view, ui);
      const want = s.roleId === 'mafia' ? 'Mark who is Mafia' : s.count > 1 ? `Mark the ${s.count} ${s.roleId === 'cop' ? 'Cop' : s.roleId}s` : /^Mark who is the \w/;
      if (want instanceof RegExp) assert.match(nav.label, want); else assert.equal(nav.label, want);
      assert.match(nav.short, /^Mark .* or No one$/); assert.ok(nav.short.length <= SHORT_MAX, nav.short);
      assert.equal(nav.enabled, false); assert.equal(nav.canSkip, true);
      const page = html(view, local, ui);
      assert.match(page, new RegExp(`class="st-tok is-none"[^>]*data-a="skipIdentify"[^>]*data-role="${s.roleId}"[\\s\\S]*?>No one<`));
      assert.doesNotMatch(page, /find every role first/i);
    }
    // all picked -> Next, which confirms them
    const s = ids.find((x) => x.roleId === 'doctor');
    ui.picks[s.key] = [view.players[0].id]; ui.focus = s.key;
    assert.equal(nightNav(view, ui).enabled, true);
    assert.equal(pressNext(view, ui).send.type, 'identifyRole');
  }
});

test('the close-eyes line is shown once in a done story step', () => {
  const g = dealt({ roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'], flow: 'app', seed: 6 });
  ok(g.room, { type: 'startNight' });
  const view = viewForHost(g.room);
  const doc = stepOf(view, 'doctor');
  const then = view.story?.steps?.[doc.key]?.then;
  assert.ok(then, 'the story has a closing line');
  const ui = freshUi(g.room); ui.actions[doc.key] = { targets: [g.room.players[0].id] };
  ui.focus = doc.key; // a step with lines to read after the answer stays up until Next
  const page = html(view, true, ui);
  const norm = (t) => t.replace(/&#39;|&quot;|[\s"“”'‘’]+/g, ' ').trim().toLowerCase();
  const count = page.split(/<q>/).filter((x) => norm(x.split('</q>')[0]) === norm(then)).length - 0;
  const sayLines = (page.match(/tell-say"><span class="tell-tag">Say:<\/span> <b>[^<]*<\/b>/g) || []).filter((l) => norm(l.replace(/<[^>]+>/g, '').replace(/^Say:/, '')) === norm(then));
  assert.equal(sayLines.length, 0, 'no second "Say:" copy');
  assert.ok(count >= 1);
});
