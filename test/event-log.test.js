// The event log (public/js/event-log.js): the room is replay(base, events), so every step can be gone back to and
// forward again. Seeded random games across every mode and table size check, after every event:
//   - replay(log) equals the live room (from the base, and from the nearest checkpoint)
//   - undo to any point gives exactly the room as it was then, and redo from there gives the room back
//   - a JSON round trip of the whole log (a refresh, a cold start) restores the same room
// Long runs: EVENT_LOG_GAMES=2000 EVENT_LOG_SEED=7 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameLog, replay, applyEvent, makeEvent, SNAP_EVERY } from '../public/js/event-log.js';
import { randU32 } from '../public/js/entropy.js';
import { newRoom } from '../public/js/room.js';
import { rng as simRng } from '../scripts/sim-lib.mjs';
import { playGame as play } from './kit/mafia-games.mjs';

const GAMES = Number(process.env.EVENT_LOG_GAMES || 60);
const SEED = Number(process.env.EVENT_LOG_SEED || 1);
const HOST = { host: true };
const T0 = 1_800_000_000_000;
const playGame = (g, onEvent) => play(g, onEvent, { SEED, nightPicks: g % 2 === 1 });

const json = (x) => JSON.stringify(x);

test(`replay(log) equals the live room after every event (${GAMES} games, seed ${SEED})`, () => {
  let events = 0;
  for (let g = 0; g < GAMES; g++) {
    const { log, tag } = playGame(g, (log, tag) => {
      events++;
      if (log.cursor % 10 === 0) assert.equal(json(replay(log.base, log.events)), json(log.room), `${tag}: replay from base differs at event ${log.cursor}`);
      assert.equal(json(log.stateAt(log.cursor)), json(log.room), `${tag}: replay from checkpoint differs at event ${log.cursor}`);
    });
    assert.equal(json(replay(log.base, log.events)), json(log.room), `${tag}: replay from base differs at the end`);
  }
  assert.ok(events > GAMES * 20, `only ${events} events`);
});

test(`undo to any point gives the room as it was then; redo gives it back (${GAMES} games)`, () => {
  for (let g = 0; g < GAMES; g++) {
    const seen = [];
    const { log, tag } = playGame(g, (l) => { seen[l.cursor] = json(l.room); });
    seen[0] = json(log.base);
    const end = json(log.room); const len = log.events.length;
    const R = simRng(SEED * 7 + g);
    for (let k = 0; k < 6; k++) {
      const i = R.int(len + 1);
      assert.ok(log.moveTo(i));
      assert.equal(json(log.room), seen[i], `${tag}: undo to ${i} of ${len} is not the room as it was`);
      assert.ok(log.redo(len - i));
      assert.equal(json(log.room), end, `${tag}: undo to ${i} then redo is not the same room`);
    }
    assert.equal(log.undo(len + 1), false, 'undo past the start is refused');
    assert.ok(log.undo(len)); assert.equal(json(log.room), json(log.base), `${tag}: undo all the way is the starting room`);
    assert.equal(log.canUndo(), false); assert.equal(log.redo(len + 1), false);
  }
});

test('a JSON round trip of the log (refresh, cold start) restores the same room and the same undo history', () => {
  for (let g = 0; g < Math.min(GAMES, 30); g++) {
    const { log, tag } = playGame(g, () => {});
    const back = GameLog.restore(JSON.parse(JSON.stringify(log.toJSON())));
    assert.equal(json(back.room), json(log.room), tag);
    assert.equal(back.rev, log.rev);
    const i = Math.floor(log.events.length / 2);
    assert.equal(json(back.stateAt(i)), json(log.stateAt(i)), `${tag}: history after restore`);
  }
});

test('a new move after undo drops the redo branch; rev goes up on every change', () => {
  const log = new GameLog(newRoom('BRCH', 'hk'));
  log.apply(HOST, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] }, T0, [1, 2, 3, 4]);
  log.apply(HOST, { type: 'toggleTag', playerId: log.room.players[0].id, tag: 'red' }, T0 + 1, [5, 6, 7, 8]);
  const rev = log.rev;
  log.undo(); assert.equal(log.rev, rev + 1); assert.ok(log.canRedo());
  log.apply(HOST, { type: 'toggleTag', playerId: log.room.players[1].id, tag: 'blue' }, T0 + 2, [9, 9, 9, 9]);
  assert.equal(log.canRedo(), false); assert.equal(log.events.length, 2);
  assert.deepEqual(log.room.players[0].tags, []); assert.deepEqual(log.room.players[1].tags, ['blue']);
  const r = log.apply(HOST, { type: 'bogus' }, T0 + 3, [1, 1, 1, 1]);
  assert.ok(r.error); assert.equal(r.kept, false); assert.equal(log.events.length, 2, 'a refused move that changed nothing is not an event');
});

test('a refused move that still changed the room (a wrong card guess) is kept, so replay counts the strike', () => {
  const log = new GameLog(newRoom('STRK', 'hk'));
  for (const name of ['A', 'B', 'C', 'D', 'E']) log.apply({ anon: true }, { type: 'join', name }, T0, [1, 2, 3, name.charCodeAt(0)]);
  log.apply(HOST, { type: 'setConfig', mode: 'cards', cardFlow: 'claim', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'] }, T0, [4, 4, 4, 4]);
  log.apply(HOST, { type: 'deal' }, T0, [5, 5, 5, 5]);
  const r = log.apply({ playerId: log.room.players[0].id }, { type: 'claimCard', card: 'ZZ' }, T0, [6, 6, 6, 6]);
  assert.ok(r.error); assert.equal(r.kept, true);
  assert.equal(replay(log.base, log.events).players[0].wrongClaims, 1);
});

test('the same event replays to the same room: ids, tokens, deals, coins and times come from the event', () => {
  const base = newRoom('SAME', 'hk');
  const a = structuredClone(base), b = structuredClone(base);
  const ev = makeEvent({ anon: true }, { type: 'join', name: 'Ann' }, T0, [11, 22, 33, 44]);
  applyEvent(a, ev); applyEvent(b, ev);
  assert.equal(json(a), json(b));
  assert.equal(a.updated, T0);
  // outside an event the reducer is still crypto-random, as before
  assert.notEqual(randU32(), randU32());
});

test(`checkpoints every ${SNAP_EVERY} events, and a replay never runs more than ${SNAP_EVERY} events`, () => {
  const log = new GameLog(newRoom('SNAP', 'hk'));
  log.apply(HOST, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E'] }, T0, [1, 1, 1, 1]);
  for (let i = 0; i < 3 * SNAP_EVERY; i++) log.apply(HOST, { type: 'toggleTag', playerId: log.room.players[i % 5].id, tag: 'red' }, T0 + i, [i + 1, 2, 3, 4]);
  assert.deepEqual([...log.snaps.keys()], [SNAP_EVERY, 2 * SNAP_EVERY, 3 * SNAP_EVERY]);
  log.undo(SNAP_EVERY + 1); // below a checkpoint: the later ones go when a new move drops the redo branch
  log.apply(HOST, { type: 'setNote', playerId: log.room.players[0].id, note: 'x' }, T0, [7, 7, 7, 7]);
  assert.deepEqual([...log.snaps.keys()], [SNAP_EVERY, 2 * SNAP_EVERY]);
  assert.equal(json(replay(log.base, log.events)), json(log.room));
});
