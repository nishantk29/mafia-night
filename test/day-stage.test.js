// The day's steps in the room (UNDO-PLAN.md section 10, PR E-4): morning, Talk it out, Continue to the vote. They used
// to live on the Host's phone (S.ui.dayStage + localStorage); now they are room moves {type:'dayStage'}, so a reload,
// a second Host phone and Undo all see the same step, and the times come from the event (a replay gives the same ones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { GameLog, replay, stepLabel } from '../public/js/event-log.js';
import { newRoom, viewForHost, viewForPlayer } from '../public/js/room.js';
import { withEntropy, seededEntropy } from '../public/js/entropy.js';
import { newGame, legalActions, stream } from './kit/mafia-props.mjs';
import { rng as simRng } from '../scripts/sim-lib.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

const H = { host: true }; const J = (x) => JSON.stringify(x); const MIN = 60_000;
// A day-1 table on a log with a clock we control.
function dayLog({ dayTimer = true } = {}) {
  let t = 1_900_000_000_000; let n = 0; const seed = () => [++n * 2654435761 >>> 0, n * 40503, n, 9];
  const log = new GameLog(withEntropy(seededEntropy(seed(), t), () => newRoom('DAYSTG', 'hk')));
  const ap = (m, dt = 1000) => log.apply(H, m, (t += dt), seed());
  ap({ type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] });
  ap({ type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'], rules: { firstNightKill: true }, advanced: { dayTimer } });
  ap({ type: 'deal' }); ap({ type: 'startNight' }); ap({ type: 'submitNight', actions: {}, n: 1 });
  assert.equal(log.room.phase, 'day');
  return { log, ap, now: () => t };
}

test('the steps: talk starts the clock at the event time, a minute more keeps it, the vote writes the minutes used', () => {
  const { log, ap, now } = dayLog();
  assert.equal(viewForHost(log.room).dayStage, null, 'a new day starts at the morning');
  ap({ type: 'dayStage', stage: 'talk', minutes: 5 });
  const started = now();
  assert.deepEqual(viewForHost(log.room).dayStage, { stage: 'talk', minutes: 5, startedAt: started, day: 1 });
  ap({ type: 'dayStage', stage: 'talk', minutes: 6 }, 30_000);
  assert.deepEqual(viewForHost(log.room).dayStage, { stage: 'talk', minutes: 6, startedAt: started, day: 1 }, 'a minute more keeps the start');
  ap({ type: 'dayStage', stage: 'vote' }, 3 * MIN);
  assert.deepEqual(viewForHost(log.room).dayStage, { stage: 'vote', talkDone: 'Talked it out for 4 minutes', day: 1 });
  ap({ type: 'dayStage', stage: 'vote', skipped: true });
  assert.equal(viewForHost(log.room).dayStage.talkDone, 'Skipped the talk');
  const refused = log.apply(H, { type: 'dayStage', stage: 'nap' }, now() + 1, [1, 2, 3, 4]);
  assert.equal(refused.error, 'Bad day step.');
  assert.equal(log.apply({ playerId: log.room.players[0].id }, { type: 'dayStage', stage: 'talk' }, now() + 2, [1, 2, 3, 5]).error, 'Host only.');
  ap({ type: 'noCondemn' }); ap({ type: 'startNight' });
  assert.equal(log.room.dayStage, undefined, 'the night clears it');
  assert.equal(log.apply(H, { type: 'dayStage', stage: 'talk' }, now() + 3, [1, 2, 3, 6]).error, 'It is not day.');
  assert.equal(J(replay(log.base, log.events)), J(log.room), 'a replay gives the same steps and times');
});

test('without the day timer the vote says "Talked it out"', () => {
  const { log, ap } = dayLog({ dayTimer: false });
  ap({ type: 'dayStage', stage: 'talk', minutes: 5 }); ap({ type: 'dayStage', stage: 'vote' }, 2 * MIN);
  assert.equal(log.room.dayStage.talkDone, 'Talked it out');
});

test('Continue to the vote is an Undo step: Undo goes back to the talk with the same clock, Redo forward again', () => {
  const { log, ap } = dayLog();
  ap({ type: 'dayStage', stage: 'talk', minutes: 5 }); const talk = J(log.room.dayStage);
  ap({ type: 'dayStage', stage: 'vote' }, 2 * MIN);
  assert.equal(log.history().undoLabel, 'Start of the vote');
  assert.equal(log.undoStep(), 'Start of the vote');
  assert.equal(J(log.room.dayStage), talk);
  assert.equal(log.undoStep(), 'Talk it out'); assert.equal(log.room.dayStage, undefined);
  assert.equal(log.redoStep(), 'Talk it out'); assert.equal(log.redoStep(), 'Start of the vote');
  assert.equal(stepLabel({ m: { type: 'dayStage', stage: 'morning' } }), 'Back to the morning');
});

test('a change that ends the day earlier voids a later day step (it never pauses the game)', () => {
  const { log, ap } = dayLog();
  const mafia = log.room.players.find((p) => p.roleId === 'mafia'); const vill = log.room.players.filter((p) => p.roleId === 'villager');
  ap({ type: 'kill', playerId: vill[0].id, cause: 'storyteller' });
  const kill = log.els.at(-1).id;
  ap({ type: 'dayStage', stage: 'talk', minutes: 5 }); const talk = log.els.at(-1).id;
  ap({ type: 'condemn', playerId: vill[1].id });
  // Eliminate the Mafia instead: the town wins right there, so the talk no longer fits (void) and the vote pauses.
  assert.ok(log.op({ type: 'edit', id: kill, msg: { type: 'kill', playerId: mafia.id, cause: 'storyteller' } }, { now: 1_999_000_000_000, seed: [5, 6, 7, 8] }).kept);
  assert.ok(log.voids.includes(talk), 'the day step is void');
  assert.equal(log.hold?.type, 'condemn', 'the vote is what pauses');
});

test(`no leaks: player views never change with the day step (random games)`, () => {
  let days = 0;
  for (let seed = 500; seed < 560; seed++) {
    const g = newGame(seed); const st = stream(seed); const R = simRng(seed);
    for (let i = 0; i < 200 && g.log.room.phase !== 'over'; i++) {
      const acts = legalActions(g.log.room, R.next); if (!acts.length) break;
      g.log.apply(H, R.pick(acts), st.now(), st.seed());
      const r = g.log.room; if (r.phase !== 'day') continue;
      days++;
      const other = structuredClone(r); other.dayStage = { day: r.day, stage: 'talk', minutes: 9, startedAt: 1 };
      const none = structuredClone(r); delete none.dayStage;
      for (const p of r.players) assert.equal(J(viewForPlayer(other, p.id)), J(viewForPlayer(none, p.id)), `seed ${seed}: ${p.name}'s phone shows the day step`);
    }
  }
  assert.ok(days > 100, `only ${days} day states`);
});

// ---- the room server: a reload mid-talk keeps the step; a second Host phone sees it ----
function fakeCtx(store = new Map()) {
  const sockets = [];
  return { store, sockets, ctx: {
    storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  } };
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const view = (ws) => ws.sent.filter((m) => m.type === 'view').at(-1)?.view;
test('room server: a reload mid-talk keeps the step; a second Host phone sees it; players never get it', async () => {
  const f = fakeCtx(); const room = new Room(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'DAYSXX', hostKey: 'hk' }) }));
  const host = sock(), a = sock(); f.sockets.push(host, a);
  await send(room, host, { type: 'hello', hostKey: 'hk' }); await send(room, a, { type: 'hello', join: 'Ann' });
  await send(room, host, { type: 'addPlayers', names: ['Cy', 'Dee', 'Eve', 'Fay'] });
  await send(room, host, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'] });
  await send(room, host, { type: 'deal' }); await send(room, host, { type: 'startNight' }); await send(room, host, { type: 'submitNight', actions: {}, n: 1 });
  await send(room, host, { type: 'dayStage', stage: 'talk', minutes: 7 });
  const ds = view(host).dayStage;
  assert.equal(ds.stage, 'talk'); assert.equal(ds.minutes, 7); assert.ok(Math.abs(ds.startedAt - Date.now()) < 5000);
  assert.equal(view(a).dayStage, undefined, 'not on a player phone');
  const again = new Room(f.ctx, {}); await again.ready;
  const h2 = sock(); f.sockets.push(h2); await send(again, h2, { type: 'hello', hostKey: 'hk' });
  assert.deepEqual(view(h2).dayStage, ds, 'a cold start and a second Host phone come back to the same step and clock');
});
