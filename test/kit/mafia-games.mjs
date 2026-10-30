// Seeded random Mafia games driven through a GameLog, shared by event-log.test.js and undo-redo.test.js.
// Every mode (app, cards claim, cards blind, local, mixed seating) and table sizes from 5 to 50.
import { GameLog } from '../../public/js/event-log.js';
import { withEntropy, seededEntropy } from '../../public/js/entropy.js';
import { newRoom, viewForHost } from '../../public/js/room.js';
import { suggestRoles, stalemateOf } from '../../public/js/engine.js';
import { ROLES } from '../../public/js/roles.js';
import { rng as simRng, pickNightActions, dealRefusal } from '../../scripts/sim-lib.mjs';

const HOST = { host: true };
export const COUNTS = [5, 6, 7, 8, 9, 10, 12, 16, 20, 30, 50];
export const MODES = ['app', 'cards-claim', 'cards-blind', 'local', 'mixed'];
const BUILT_IN = ROLES.filter((r) => !r.custom).map((r) => r.id);
const T0 = 1_800_000_000_000;

// A seeded game: the log's own seeds and clock come from R too, so a failing seed replays exactly.
export function playGame(g, onEvent = () => {}, { SEED = 1, nightPicks = false } = {}) {
  const R = simRng(SEED * 100003 + g);
  const n = COUNTS[g % COUNTS.length]; const mode = MODES[Math.floor(g / COUNTS.length) % MODES.length];
  let roles = R.chance(0.5) ? suggestRoles(n) : Array.from({ length: n }, () => R.pick(BUILT_IN));
  if (dealRefusal(roles, n)) roles = suggestRoles(n);
  let t = T0;
  const seed = () => [R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32), R.int(2 ** 32)];
  const base = withEntropy(seededEntropy(seed(), t), () => newRoom('LOGT', mode === 'local' ? 'local' : 'hk'));
  const log = new GameLog(base);
  const tag = `seed ${SEED} game ${g} n=${n} mode=${mode}`;
  const send = (actor, msg) => { t += 1 + R.int(5000); const r = log.apply(actor, msg, t, seed()); if (r.kept) onEvent(log, tag); return r; };
  const names = roles.map((_, i) => `P${i}`);
  if (mode === 'mixed' || mode === 'app') for (const nm of names.slice(0, mode === 'app' ? n : 3)) send({ anon: true }, { type: 'join', name: nm });
  if (mode !== 'app') send(HOST, { type: 'addPlayers', names: mode === 'mixed' ? names.slice(3) : names });
  const cfg = mode === 'app' || mode === 'mixed' ? { mode: 'app' } : mode === 'cards-claim' ? { mode: 'cards', cardFlow: 'claim' } : { mode: 'cards', cardFlow: 'blind' };
  send(HOST, { type: 'setConfig', ...cfg, roles, rules: { dayStart: R.chance(0.2), selfProtect: R.chance(0.7), firstNightKill: R.chance(0.8) } });
  if (send(HOST, { type: 'deal' }).error) return { tag, log, dealt: false };
  const room = () => log.room;
  if (cfg.cardFlow === 'claim') {
    const cards = R.shuffle(room().deck.map.map((m) => m.card));
    room().players.forEach((p, i) => (R.chance(0.3) ? send({ playerId: p.id }, { type: 'claimCard', card: R.chance(0.2) ? 'ZZ' : cards[i] }) : null));
    for (const [i, p] of room().players.entries()) if (!p.card) send(HOST, { type: 'assignCard', playerId: p.id, card: cards[i] });
  }
  for (let s = 0; s < 400 && room().phase !== 'over'; s++) {
    const r = room();
    if (stalemateOf(r)) { send(HOST, { type: 'declareWinner', side: 'draw' }); break; }
    if (R.chance(0.04)) { const p = R.pick(r.players); send(HOST, { type: 'toggleTag', playerId: p.id, tag: 'red' }); continue; }
    if (r.pending.length) { send(HOST, { type: 'resolvePending', pendingId: r.pending[0].id, targetId: R.chance(0.5) ? R.pick(r.players.filter((p) => p.alive))?.id : null }); continue; }
    if (r.phase === 'dealt') { send(HOST, { type: 'startNight' }); continue; }
    if (r.phase === 'night') {
      const v = viewForHost(r); const idf = v.script.find((x) => x.kind === 'identify');
      if (idf) {
        const free = r.players.filter((p) => !p.roleId);
        if (free.length < idf.count || R.chance(0.15)) send(HOST, { type: 'skipIdentify', roleId: idf.roleId });
        else send(HOST, { type: 'identifyRole', roleId: idf.roleId, playerIds: R.shuffle(free).slice(0, idf.count).map((p) => p.id) });
      } else {
        const actions = pickNightActions(R, v);
        if (nightPicks) { const ui = { n: r.night, actions: {}, picks: {}, seq: 0 }; for (const [k, x] of Object.entries(actions)) { ui.actions[k] = x; ui.seq++; send(HOST, { type: 'nightUi', ui: structuredClone(ui) }); } }
        if (send(HOST, { type: 'submitNight', actions, n: r.night }).error) send(HOST, { type: 'submitNight', actions: {} });
      }
      continue;
    }
    if (r.phase === 'day') {
      const al = r.players.filter((p) => p.alive);
      if (R.chance(0.05)) { const dead = r.players.find((p) => !p.alive); if (dead) send(HOST, { type: 'revive', playerId: dead.id }); }
      if (r.condemnedDay === r.day || R.chance(0.3)) send(HOST, { type: 'startNight' }); else send(HOST, { type: 'condemn', playerId: R.pick(al).id });
    }
  }
  if (room().phase === 'over' && R.chance(0.5)) send(HOST, { type: 'playAgain' });
  return { tag, log, dealt: true };
}

