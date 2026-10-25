// Shared by the night-next tests: DOM stubs, room builders and a driver that plays a night the way the Host's
// screen allows (nightNav + pressNext + the same room actions), choosing or skipping at random.
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost } from '../public/js/room.js';
import { ROLE_BY_ID, registerRoles } from '../public/js/roles.js';
import { nightNav, pressNext } from '../public/js/night-nav.js';
import { rng, candidates, LIVE, COIN, dealRefusal } from '../scripts/sim-lib.mjs';

const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.location ??= { origin: 'https://x.test', hash: '', host: 'x.test' };
globalThis.document ??= { documentElement: { dataset: {} }, querySelector: () => null, addEventListener() {}, getElementById: () => null };
globalThis.navigator ??= {};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
export const { hostScreen } = await import('../public/js/host.js');
export const { S } = await import('../public/js/state.js');

export const host = { host: true };
export const ok = (room, a) => { const r = reduce(room, host, a); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
export const freshUi = (room) => ({ n: room.night, actions: {}, picks: {}, focus: null });

// A table dealt the way a game would be. flow: 'app' (roles to phones), 'blind' or 'claim' (card deck, single phone).
// Returns { room, truth } where truth maps player id to the role that player really holds.
export function dealt({ roles, version = 8, flow = 'app', seed = 1, rules = {}, dropCard = false, customRoles = [] }) {
  const R = rng(seed);
  const room = newRoom('NN', 'k'); room.nightVersion = version;
  ok(room, { type: 'addPlayers', names: roles.map((_, i) => `P${i}`) });
  if (customRoles.length) ok(room, { type: 'setCustomRoles', roles: customRoles });
  ok(room, { type: 'setConfig', roles, rules, mode: flow === 'app' ? 'app' : 'cards', cardFlow: flow === 'claim' ? 'claim' : 'blind' });
  const refused = reduce(room, host, { type: 'deal' }).error;
  if (refused) return null;
  const truth = {};
  if (flow === 'app') for (const p of room.players) truth[p.id] = p.roleId;
  else {
    const ids = R.shuffle(room.players.map((p) => p.id));
    room.deck.map.forEach((m, i) => { truth[ids[i]] = m.roleId; });
    if (dropCard) { // one card nobody holds: its player has a Villager card instead, so the table has a leftover card
      const gone = Object.entries(truth).find(([, r]) => r !== 'villager' && ROLE_BY_ID[r].alignment !== 'mafia' && !ROLE_BY_ID[r].meeting);
      if (!gone) return null;
      truth[gone[0]] = 'villager';
    }
    if (flow === 'claim') for (const p of room.players) ok(room, { type: 'assignCard', playerId: p.id, card: room.deck.map.find((m) => m.roleId === truth[p.id] && !room.deck.claimed[m.card]).card });
  }
  return { room, truth, R };
}

const NONE = /Find every role first/i;
// Records the Host's choice for one step exactly as the screen's taps do.
function choose(R, view, ui, nav, truth, stats) {
  const s = nav.current;
  const { kind } = nav.needs;
  if (kind === 'identify') {
    const holders = view.players.filter((p) => !p.roleId && truth[p.id] === s.roleId).map((p) => p.id);
    if (holders.length < s.count) { stats.skipIdentify++; return { send: { type: 'skipIdentify', roleId: s.roleId } }; }
    const ids = R.shuffle(holders).slice(0, s.count);
    if (s.count > 1) { ui.picks[s.key] = ids.slice(0, 1); assert.equal(nightNav(view, ui).enabled, false, 'partly picked: still waiting'); }
    ui.picks[s.key] = ids; ui.focus = s.key;
    return null;
  }
  if (R.chance(0.2)) { stats.noOne++; ui.actions[s.key] = { targets: [] }; ui.focus = null; return null; } // "No one" / "No" / "Skip"
  if (kind === 'answer') ui.actions[s.key] = { on: R.chance(0.5), targets: [] };
  else if (kind === 'show') ui.actions[s.key] = { on: true, targets: [] };
  else {
    const pool = candidates(view, s); const need = s.targets || 1;
    if (pool.length < need) { ui.actions[s.key] = { targets: [] }; ui.focus = null; return null; }
    const set = { targets: R.shuffle(pool).slice(0, need).map((p) => p.id) };
    if (s.type === 'investigate' && COIN.includes(s.check)) set.coin = R.pick(['mafia', 'innocent']);
    if (s.type === 'investigate' && s.check === 'random') set.flip = R.pick(['heads', 'tails']);
    ui.actions[s.key] = set;
  }
  ui.focus = null;
  return null;
}

// Plays the current night to the end through the Host's controls. Returns the number of taps it took.
export function playNight(room, truth, R, { local = true, render = false, stats = { skipIdentify: 0, noOne: 0 } } = {}) {
  const ui = freshUi(room);
  S.ui.night = ui;
  for (let i = 0; i < 400; i++) {
    const view = viewForHost(room);
    registerRoles(view.config.customRoles);
    const nav = nightNav(view, ui);
    assert.ok(nav.enabled || nav.canSkip, `dead end: "${nav.label}" is disabled and cannot be skipped`);
    assert.doesNotMatch(nav.label, NONE);
    if (render) {
      const html = hostScreen(view, local);
      assert.doesNotMatch(html, NONE);
      assert.match(html, /data-a="nextStep"/);
    }
    let r = { };
    if (!nav.enabled) r = choose(R, view, ui, nav, truth, stats);
    else r = pressNext(view, ui);
    if (r?.send) {
      const res = reduce(room, host, r.send);
      assert.ok(res.ok, `${r.send.type}: ${res.error}`);
      if (r.send.type === 'submitNight') return i + 1;
      ui.picks = {}; ui.focus = null;
    }
  }
  assert.fail('the night never ended');
}

// A whole game: nights and days until someone wins (or `rounds` run out).
export function playGame(g, { local = true, render = false, rounds = 10, stats } = {}) {
  const { room, truth, R } = g;
  const st = stats || { skipIdentify: 0, noOne: 0, nights: 0 };
  st.nights ??= 0;
  for (let round = 0; round < rounds && room.phase !== 'over'; round++) {
    while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
    if (room.phase === 'over') break;
    ok(room, { type: 'startNight' });
    playNight(room, truth, R, { local, render: render && round === 0, stats: st }); st.nights++;
    while (room.pending.length) ok(room, { type: 'resolvePending', pendingId: room.pending[0].id });
    if (room.phase !== 'day') continue;
    const alive = room.players.filter((p) => p.alive);
    if (alive.length && R.chance(0.7)) { const r = reduce(room, host, { type: 'condemn', playerId: R.pick(alive).id }); assert.ok(r.ok, r.error); }
    else ok(room, { type: 'noCondemn' });
  }
  return st;
}
export { dealRefusal, LIVE };
