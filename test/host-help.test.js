import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';
import { ROLES, ROLE_BY_ID, ACTION_TYPES, registerRoles } from '../public/js/roles.js';
import { nightScript } from '../public/js/engine.js';
import { hostHelp, callName, WALKTHROUGH, HELP_PHASES, HOST_HELP_ACTIONS } from '../public/js/host_help.js';
import { helpSheet, walkthrough, helpButton } from '../public/js/host_help_core.js';
import { S } from '../public/js/state.js';
import { playerScreen } from '../public/js/player.js';

const H = (room, a) => reduce(room, { host: true }, a);
function game(roleIds) {
  const room = newRoom('ROOM', 'hk'); room.nightVersion = 8;
  const toks = [];
  for (let i = 0; i < roleIds.length; i++) { const r = reduce(room, { anon: true }, { type: 'join', name: `P${i}` }); toks.push(r.playerId || room.players[i].id); }
  H(room, { type: 'setConfig', roles: roleIds, mode: 'app' });
  return room;
}
const ids = (room) => room.players.map((p) => p.id);
const bare = (h) => h.replace(/<[^>]+>/g, ' ');
const ROLE_RE = new RegExp(`(?<![A-Za-z])(${ROLES.map((r) => r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z])`);

test('every phase the app has gets help', () => {
  const src = readFileSync(new URL('../public/js/room.js', import.meta.url), 'utf8');
  const phases = [...new Set([...src.matchAll(/phase = '([a-z]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(phases.sort(), ['day', 'dealt', 'lobby', 'night', 'over']);
  for (const p of phases) {
    assert.ok(HELP_PHASES.includes(p), p);
    const h = hostHelp({ phase: p, night: 1, day: 1, script: [] });
    assert.ok(h.title && h.lines.length >= 2 && h.lines.length <= 3, p);
  }
  const m = hostHelp({ phase: 'day', day: 1, night: 1, report: { night: 1 } });
  assert.match(m.lines[0], /announcement/);
  assert.match(hostHelp({ phase: 'day', day: 2, night: 1 }).lines.join(' '), /Nobody today/);
  assert.match(hostHelp({ phase: 'over' }).lines.join(' '), /Restart/);
});

test('every night step kind and action type gets help that names the call', () => {
  const steps = [];
  for (const t of ACTION_TYPES) {
    const r = ROLES.find((x) => x.action?.type === t);
    assert.ok(r, `a role with ${t}`);
    steps.push({ key: `act:${t}`, kind: 'action', roleId: r.id, actors: ['p1'], ...r.action });
  }
  steps.push({ key: 'x', kind: 'action', type: 'execCheck', roleId: 'executioner', actors: ['p1'], targets: 0 });
  steps.push({ key: 'x2', kind: 'action', type: 'kill', roleId: 'vigilante', actors: ['p1'], targets: 1, spent: true });
  steps.push({ key: 'id', kind: 'identify', roleId: 'cop', count: 2, candidates: [] });
  steps.push({ key: 'i1', kind: 'info', roleId: 'mafia', actors: ['p1'], spoken: true, prompt: 'Mafia, open your eyes. Look at each other.' });
  steps.push({ key: 'i2', kind: 'info', roleId: 'merlin', actors: ['p1'], prompt: 'Merlin, you know the Mafia.' });
  // and the steps nightScript really produces
  const room = game(['mafia', 'mafia', 'godfather', 'cop', 'cop', 'doctor', 'executioner', 'villager', 'villager', 'merlin']);
  H(room, { type: 'deal' }); H(room, { type: 'startNight' });
  const real = nightScript(room); assert.ok(real.length >= 4, 'real night script');
  steps.push(...real);
  for (const st of steps) {
    const h = hostHelp({ phase: 'night' }, st);
    assert.ok(h.title && h.lines.length >= 2 && h.lines.length <= 3, st.key);
    const name = callName(st);
    assert.ok(name && name !== 'This role', st.key);
    assert.ok((h.title + h.lines.join(' ')).includes(name), `${st.key} mentions ${name}`);
  }
});

test('help never names another role or hidden info', () => {
  for (const p of HELP_PHASES) {
    const h = hostHelp({ phase: p === 'morning' ? 'day' : p, day: 1, night: 1, report: p === 'morning' ? { night: 1 } : null });
    assert.doesNotMatch(`${h.title} ${h.lines.join(' ')}`, ROLE_RE, p);
  }
  for (const c of WALKTHROUGH) assert.doesNotMatch(`${c.title} ${c.lines.join(' ')}`, ROLE_RE);
  // a step's help mentions only that step's own call name, never other players or roles in the room
  const room = game(['mafia', 'mafia', 'cop', 'cop', 'doctor', 'villager', 'villager']);
  H(room, { type: 'deal' }); H(room, { type: 'startNight' });
  const v = viewForHost(room);
  for (const st of v.script) {
    const text = (() => { const h = hostHelp(v, st); return `${h.title} ${h.lines.join(' ')}`; })();
    for (const p of v.players) assert.ok(!text.includes(p.name + ' ') || p.name.length < 3, 'no player names');
    const own = callName(st);
    const rest = text.split(own).join('');
    assert.doesNotMatch(rest.replace(/open your eyes|close your eyes/gi, ''), ROLE_RE, `${st.key}: ${text}`);
  }
});

test('core has no game text and walkthrough/sheet render accessibly', () => {
  const src = readFileSync(new URL('../public/js/host_help_core.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Mafia|mafia|night|Night/);
  assert.doesNotMatch(src, /^import /m);
  const w = walkthrough(WALKTHROUGH, 0);
  assert.match(w, /Skip/); assert.match(w, /data-a="hhNext"/);
  assert.match(walkthrough(WALKTHROUGH, WALKTHROUGH.length - 1), /Got it/);
  assert.equal((w.match(/<i/g) || []).length, WALKTHROUGH.length);
  assert.match(helpButton('<svg/>'), /aria-label="What do I do now\?"/);
  assert.match(helpSheet({ title: 'T', lines: ['a', 'b'] }, { icons: { x: 'x' } }), /sheet-bg/);
});

test('walkthrough is once per device and replayable', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  S.render = () => {}; S.ui.hhWalk = { i: 3, dir: 1 };
  HOST_HELP_ACTIONS.hhNext();
  assert.equal(S.ui.hhWalk, null);
  assert.equal(store.get('mafia.hostHelpSeen'), '1');
  HOST_HELP_ACTIONS.hhReplay();
  assert.equal(S.ui.hhWalk.i, 0);
  delete globalThis.localStorage;
});

test('player screens never contain host help', () => {
  const room = game(['mafia', 'mafia', 'cop', 'doctor', 'villager', 'villager', 'villager']);
  S.ui.hhWalk = { i: 0, dir: 1 }; S.ui.hhSheet = true;
  for (const phase of ['lobby', 'dealt', 'night']) {
    if (phase === 'dealt') H(room, { type: 'deal' });
    if (phase === 'night') H(room, { type: 'startNight' });
    const html = playerScreen({ ...viewForPlayer(room, room.players[0].id), kind: 'player' });
    assert.doesNotMatch(html, /host-help|hh-|hw-|What do I do now|How hosting works|openHostHelp/, phase);
  }
  S.ui.hhWalk = null; S.ui.hhSheet = false;
});
