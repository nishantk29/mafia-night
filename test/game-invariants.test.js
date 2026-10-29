// The shared invariants kit (test/kit/game-invariants.mjs) over Mafia Night: no step can block, game over is terminal,
// no leaks (a phone never changes when roles it may not know are shuffled), no Undo after game over.
// Cases cover one, two and three Detectives (the merged Cop and Detective), with and without a Godfather.
import { rng as simRng, pickNightActions } from '../scripts/sim-lib.mjs';
import { gameInvariantTests } from './kit/game-invariants.mjs';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';
import { factionOf } from '../public/js/roles.js';

const HOST = { host: true };
const CASES = [1, 2, 3].flatMap((k) => [false, true].map((godfather) => ({
  k, godfather, roles: ['mafia', godfather ? 'godfather' : 'mafia', 'doctor', ...Array(k).fill('detective'), ...Array(7 - k).fill('villager'), 'tracker'].slice(0, 10),
})));
// A hidden setup (Advanced) is one more case: the phones carry no role ids, so shuffling secrets can't move a view.
CASES.push({ k: 1, godfather: false, hidden: true, roles: ['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager', 'villager', 'jester', 'villager'] });
const asActor = (id) => (id === 'host' ? HOST : { playerId: id });
const alive = (room) => room.players.filter((p) => p.alive);

function setup(c) {
  const room = newRoom('INV', 'hostkey');
  reduce(room, HOST, { type: 'addPlayers', names: c.roles.map((_, i) => `P${i}`) });
  reduce(room, HOST, { type: 'setConfig', mode: 'app', roles: c.roles, ...(c.hidden ? { advanced: { hiddenSetup: true } } : {}) });
  const d = reduce(room, HOST, { type: 'deal' }); if (d.error) throw new Error(`deal refused: ${d.error}`);
  return room;
}
const adapter = {
  name: 'mafia-night',
  cases: CASES,
  setup,
  apply: (room, actor, msg) => { const r = reduce(room, asActor(actor), msg); return { ok: !r.error, state: room }; },
  isOver: (room) => room.phase === 'over',
  progress(room, rng) {
    if (room.pending.length) return [['host', { type: 'resolvePending', pendingId: room.pending[0].id }]];
    if (room.phase === 'dealt') return [['host', { type: 'startNight' }]];
    if (room.phase === 'night') {
      const R = simRng(Math.floor(rng() * 1e9));
      return [['host', { type: 'submitNight', actions: pickNightActions(R, viewForHost(room)) }]];
    }
    if (room.phase === 'day') {
      const a = alive(room);
      return room.condemnedDay === room.day ? [['host', { type: 'startNight' }]]
        : [['host', { type: 'condemn', playerId: a[Math.floor(rng() * a.length)].id }], ['host', { type: 'noCondemn' }]];
    }
    return [];
  },
  fallback(room) {
    if (room.pending.length) return ['host', { type: 'resolvePending', pendingId: room.pending[0].id }];
    if (room.phase === 'night') return ['host', { type: 'submitNight', actions: {} }];
    if (room.phase === 'day') return ['host', { type: room.condemnedDay === room.day ? 'startNight' : 'noCondemn' }];
    if (room.phase === 'dealt') return ['host', { type: 'startNight' }];
    return null;
  },
  // Not probed: setRole, the Host's manual role correction, has no phase check and works on the end screen too (pre-existing, see REPORT).
  probes(room) {
    const p = room.players[0].id;
    return [['host', { type: 'startNight' }], ['host', { type: 'startDay' }], ['host', { type: 'submitNight', actions: {} }], ['host', { type: 'condemn', playerId: p }],
      ['host', { type: 'noCondemn' }], ['host', { type: 'kill', playerId: p, cause: 'storyteller' }], ['host', { type: 'revive', playerId: p }],
      ['host', { type: 'declareWinner', side: 'town', reason: 'x' }], ['host', { type: 'deal' }], ['host', { type: 'undeal' }]];
  },
  undo: () => ['host', { type: 'undeal' }],
  fingerprint: (room) => JSON.stringify({ phase: room.phase, winner: room.winner, sideWins: room.sideWins, roles: room.players.map((p) => [p.id, p.roleId, p.alive]), day: room.day, night: room.night }),
  viewers: (room) => room.players.map((p) => p.id),
  view: (room, id) => viewForPlayer(room, id),
  secretsRevealed: (room) => room.phase === 'over',
  secretHolders: (room) => room.players.filter((p) => p.alive).map((p) => p.id),
  withSecrets(room, mapping) {
    const c = structuredClone(room);
    // A secret is the role and the call number that goes with it ("Detective 2"), so both move together.
    for (const [id, from] of Object.entries(mapping)) {
      c.players.find((p) => p.id === id).roleId = room.players.find((p) => p.id === from).roleId;
      if (c.callNo) { if (room.callNo?.[from]) c.callNo[id] = room.callNo[from]; else delete c.callNo[id]; }
    }
    return c;
  },
  // A viewer knows their own team's members exactly; everyone else is an unknown living player.
  knowledgeClass(room, viewerId, otherId) {
    const v = room.players.find((p) => p.id === viewerId); const o = room.players.find((p) => p.id === otherId);
    if (factionOf(v.roleId) === 'mafia' && factionOf(o.roleId) === 'mafia') return null;
    return 'unknown';
  },
};

gameInvariantTests(adapter, { games: 120, leakViewers: 2 });
