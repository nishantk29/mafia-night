// One gold primary per screen: at most one enabled `.btn.big` that is not danger / ghost / secondary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';
import { dealt, hostScreen, S, ok, freshUi, host } from './night-drive-lib.mjs';

const gold = (html) => [...html.matchAll(/<button[^>]*class="btn big([^"]*)"[^>]*>/g)]
  .filter((m) => !/disabled|danger|ghost|secondary/.test(m[1]) && !/aria-disabled|\sdisabled[\s>]/.test(m[0]));
const check = (name, html) => assert.ok(gold(html).length <= 1, `${name}: ${gold(html).map((m) => m[0]).join(' | ')}`);
const render = (view, local = true, ui = {}) => { Object.assign(S.ui, { night: null, condemn: null, ...ui }); return hostScreen(view, local); };

test('lobby and dealt screens', () => {
  const room = newRoom('NN', 'k');
  ok(room, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E', 'F'] });
  check('lobby', render(viewForHost(room)));
  ok(room, { type: 'setConfig', roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], mode: 'app' });
  check('setup', render(viewForHost(room), false));
  ok(room, { type: 'deal' });
  check('dealt', render(viewForHost(room), false));
  for (const flow of ['claim', 'blind']) {
    const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], flow });
    check(`dealt ${flow}`, render(viewForHost(g.room)));
  }
});

test('night step with and without a pick', () => {
  const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], flow: 'app', rules: { firstNightKill: true } });
  ok(g.room, { type: 'startNight' });
  const view = viewForHost(g.room);
  const s = view.script.find((x) => x.roleId === 'doctor');
  const ui = freshUi(g.room); ui.focus = s.key;
  check('night, no pick', render(view, true, { night: ui }));
  ui.actions[s.key] = { targets: [view.players[0].id] };
  check('night, picked', render(view, true, { night: ui }));
});

test('day with and without a selection, pending questions; over', () => {
  const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], flow: 'app' });
  const view = viewForHost(g.room);
  const alive = view.players.filter((p) => p.alive);
  const day = { ...view, phase: 'day', day: 1, night: 1, report: null, pending: [], dayUsed: {} };
  const none = render(day, true, { condemn: null });
  check('day, no selection', none);
  assert.equal(gold(none).length, 1);
  const sel = render(day, true, { condemn: alive[0].id });
  check('day, selected', sel);
  assert.match(sel, /btn big secondary[^>]*data-a="startNight"/);
  assert.match(sel, /class="btn big\s*"[^>]*data-a="condemn"/);
  const pend = { ...day, pending: [{ id: 'q1', playerId: alive[0].id, text: 'Who?' }] };
  check('day, pending', render(pend, true, { condemn: alive[1].id }));
  check('day, pending, none', render(pend, true, { condemn: null }));
  const over = { ...view, phase: 'over', winner: { side: 'town' }, winners: [], night: 1, day: 1 };
  const end = render(over);
  assert.match(end, /data-a="restart"/);
  check('over', end);
});
