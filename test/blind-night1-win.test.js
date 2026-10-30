// Regression (undo-proto STRICT seeds 1019, 1038, 1055, 1109, 1141): in a blind card deal, "No one has this card" on the
// Mafia step left no Mafia in play, but the room stayed in Night 1 until the night was submitted, with Town already winning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, viewForHost } from '../public/js/room.js';
import { dealt, ok, host } from './night-drive-lib.mjs';

test('blind night 1: no one has the Mafia card, so Town wins at once and the night ends', () => {
  const g = dealt({ roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'], flow: 'blind', seed: 1019 });
  assert.ok(g);
  const { room, truth } = g;
  ok(room, { type: 'startNight' });
  // The Host matches every town card, then says no one has the Mafia card (the card was left out of play).
  for (const roleId of ['doctor', 'cop']) {
    const ids = room.players.filter((p) => truth[p.id] === roleId).map((p) => p.id);
    ok(room, { type: 'identifyRole', roleId, playerIds: ids });
    assert.equal(room.phase, 'night');
  }
  ok(room, { type: 'skipIdentify', roleId: 'mafia' });
  assert.ok(room.players.every((p) => p.roleId), 'every seat is matched');
  assert.equal(room.phase, 'over');
  assert.equal(room.winner?.side, 'town');
  assert.equal(viewForHost(room).phase, 'over');
  assert.ok(reduce(room, host, { type: 'submitNight', actions: {} }).error, 'the night cannot be submitted after the game ended');
});

test('blind night 1: matching cards one by one never ends the game early', () => {
  const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'cop', 'villager', 'villager'], flow: 'blind', seed: 1038 });
  const { room, truth } = g;
  ok(room, { type: 'startNight' });
  const ids = room.players.filter((p) => truth[p.id] === 'mafia').map((p) => p.id);
  ok(room, { type: 'identifyRole', roleId: 'mafia', playerIds: ids });
  assert.equal(room.phase, 'night');
  assert.equal(room.winner, null);
});
