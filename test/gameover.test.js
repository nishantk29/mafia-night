import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, messagesFor, justEnded } from '../public/js/room.js';

const HOST = { host: true };
function game(n = 6) {
  const room = newRoom('ROOM', 'k');
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(reduce(room, { anon: true }, { type: 'join', name: `P${i + 1}` }).data.playerId);
  reduce(room, HOST, { type: 'setConfig', roles: ['mafia', 'mafia', 'villager', 'villager', 'villager', 'villager'].slice(0, n) });
  assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
  return { room, ids };
}
// What the Durable Object does: one attachment per open socket (host, TV/table screen = a second host socket, every phone).
const sockets = (ids) => [{ who: 'host' }, { who: 'host' }, ...ids.map((playerId) => ({ who: 'player', playerId }))];

describe('game-over event', () => {
  test('every connected client receives it, once, when the game ends', () => {
    const { room, ids } = game();
    const socks = sockets(ids);
    const before = room.phase;
    assert.ok(reduce(room, HOST, { type: 'declareWinner', side: 'mafia', reason: 'Boss elected' }).ok);
    assert.ok(justEnded(before, room));
    for (const att of socks) {
      const msgs = messagesFor(room, att, new Set(), justEnded(before, room));
      const ev = msgs.filter((m) => m.type === 'gameOver');
      assert.equal(ev.length, 1, `socket ${att.who} ${att.playerId || ''}`);
      assert.equal(ev[0].side, 'mafia');
      assert.equal(ev[0].theme, 'mafia');
      assert.equal(ev[0].reason, 'Boss elected');
      assert.equal(msgs[0].type, 'view');
    }
  });

  test('not sent for ordinary updates or after the game was already over', () => {
    const { room, ids } = game();
    assert.equal(messagesFor(room, { who: 'host' }, new Set(), justEnded(room.phase, room)).length, 1);
    reduce(room, HOST, { type: 'declareWinner', side: 'town' });
    assert.equal(justEnded('over', room), false);
    assert.equal(messagesFor(room, { who: 'player', playerId: ids[0] }, new Set(), false).length, 1);
  });

  test('"You won" / "You lost" is per player and carries no role information', () => {
    const { room, ids } = game();
    reduce(room, HOST, { type: 'declareWinner', side: 'mafia' });
    const win = room.players.filter((p) => p.roleId === 'mafia').map((p) => p.id);
    for (const id of ids) {
      const ev = messagesFor(room, { who: 'player', playerId: id }, new Set(), true).find((m) => m.type === 'gameOver');
      assert.equal(ev.won, win.includes(id));
      assert.equal(JSON.stringify(ev).includes('roleId'), false);
      assert.deepEqual(Object.keys(ev).sort(), ['reason', 'side', 'team', 'theme', 'type', 'won']);
    }
    const hostEv = messagesFor(room, { who: 'host' }, new Set(), true).find((m) => m.type === 'gameOver');
    assert.equal('won' in hostEv, false);
  });

  test('a real win (last mafia out) also triggers it', () => {
    const { room } = game();
    reduce(room, HOST, { type: 'startNight' }); reduce(room, HOST, { type: 'submitNight', actions: {} });
    assert.equal(room.phase, 'day');
    const before = room.phase;
    for (const p of room.players.filter((q) => q.roleId === 'mafia')) reduce(room, HOST, { type: 'condemn', playerId: p.id });
    assert.ok(justEnded(before, room));
    const ev = messagesFor(room, { who: 'host' }, new Set(), true).find((m) => m.type === 'gameOver');
    assert.equal(ev.theme, 'town');
  });
});

describe('playAgain', () => {
  test('host or any seated player resets to the lobby with the same players, only once over', () => {
    const { room, ids } = game();
    assert.ok(reduce(room, { playerId: ids[0] }, { type: 'playAgain' }).error);
    reduce(room, HOST, { type: 'declareWinner', side: 'town' });
    assert.ok(reduce(room, { anon: true }, { type: 'playAgain' }).error);
    assert.ok(reduce(room, { playerId: ids[2] }, { type: 'playAgain' }).ok);
    assert.equal(room.phase, 'lobby');
    assert.equal(room.players.length, 6);
    assert.equal(room.winner, null);
  });
});
