// Host Restart (same code and players, new deal, latest night version) and night-only Tracker/Lookout/Coroner (v7).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, checkCard, nightVersion, LATEST_NIGHT_VERSION } from '../public/js/engine.js';
import { newRoom, reduce, viewForHost, viewForPlayer, roomFromView, isNewGame } from '../public/js/room.js';


const HOST = { host: true }, ANON = { anon: true };
const ROLES = ['mafia', 'godfather', 'doctor', 'cop', 'villager', 'villager', 'tracker'];
function mk({ version = 7, mode = 'app', roles = ROLES, phase = 'night' } = {}) {
  const room = newRoom('RS', 'hostkey');
  room.config.mode = mode; room.config.roles = [...roles]; room.config.rules.selfProtect = false; room.config.timers = { day: 90 };
  roles.forEach((_, i) => assert.ok(reduce(room, ANON, { type: 'join', name: `P${i}` }).ok));
  assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
  if (version === 1) delete room.nightVersion; else room.nightVersion = version;
  if (version < 7) room.upgradeNext = 7;
  room.phase = phase; room.night = 2; room.day = 1;
  room.graveyard = [{ id: 1, text: 'boo' }]; room.results = [{ night: 1, ids: ['x'], text: 'old' }]; room.lastReport = { info: [] };
  room.log.push({ text: 'old line' }); room.usage = { a: 1 }; room.winner = { side: 'town', reason: 'x' };
  room.players[0].alive = false; room.players[0].deathCause = 'killed';
  return room;
}
const snap = (room) => JSON.stringify({ code: room.code, hostKey: room.hostKey, config: room.config, players: room.players.map((p) => [p.id, p.name, p.token]) });

describe('restart', () => {
  test('keeps code, hostKey, players and config; re-deals app mode', () => {
    const room = mk(); const before = snap(room);
    const r = reduce(room, HOST, { type: 'restart' });
    assert.deepEqual(r, { ok: true, data: { dealt: true } });
    assert.equal(snap(room), before);
    assert.equal(room.phase, 'dealt');
    assert.ok(room.players.every((p) => p.roleId && p.alive && !p.deathCause));
    assert.deepEqual(room.players.map((p) => p.roleId).sort(), [...ROLES].sort());
  });
  test('cards mode gets a new deck', () => {
    const room = mk({ mode: 'cards' }); const old = room.deck;
    assert.ok(reduce(room, HOST, { type: 'restart' }).data.dealt);
    assert.equal(room.phase, 'dealt');
    assert.notEqual(room.deck, old);
    assert.deepEqual(room.deck.claimed, {});
    assert.ok(room.players.every((p) => !p.card && !p.roleId));
  });
  test('bumps v1, v5 and v6 rooms to 7 and clears upgradeNext', () => {
    for (const v of [1, 5, 6]) {
      const room = mk({ version: v });
      reduce(room, HOST, { type: 'restart' });
      assert.equal(nightVersion(room), LATEST_NIGHT_VERSION); assert.equal(room.nightVersion, 7);
      assert.equal(room.upgradeNext, undefined);
    }
  });
  test('clears per-game state; only the started line stays in the log', () => {
    const room = mk(); reduce(room, HOST, { type: 'restart', setup: true });
    assert.equal(room.graveyard, undefined);
    assert.deepEqual(room.results, []); assert.equal(room.lastReport, null);
    assert.equal(room.winner, null); assert.deepEqual(room.usage, {});
    assert.equal(room.log.length, 1); assert.match(room.log[0].text, /^Game 2 started\.$/);
    assert.ok(room.players.every((p) => p.alive));
  });
  test('gameNo increments and is in host and player views', () => {
    const room = mk();
    assert.equal(viewForHost(room).gameNo, 1);
    reduce(room, HOST, { type: 'restart' });
    assert.equal(viewForHost(room).gameNo, 2);
    assert.equal(viewForPlayer(room, room.players[1].id).gameNo, 2);
    assert.equal(roomFromView(viewForHost(room)).gameNo, 2);
    reduce(room, HOST, { type: 'restart' });
    assert.equal(viewForHost(room).gameNo, 3);
  });
  test('setup:true stays in the lobby on v7', () => {
    const room = mk({ version: 5 });
    assert.deepEqual(reduce(room, HOST, { type: 'restart', setup: true }), { ok: true, data: { dealt: false } });
    assert.equal(room.phase, 'lobby'); assert.equal(room.nightVersion, 7);
    assert.ok(room.players.every((p) => !p.roleId));
    assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
  });
  test('newGame and playAgain bump to 7 and stay in the lobby', () => {
    for (const t of ['newGame', 'playAgain']) {
      const room = mk({ version: 5, phase: 'over' });
      assert.ok(reduce(room, HOST, { type: t }).ok);
      assert.equal(room.phase, 'lobby'); assert.equal(room.nightVersion, 7); assert.equal(room.gameNo, 2);
    }
  });
  test('playAgain is for seated players at game over only', () => {
    const room = mk({ phase: 'over' });
    assert.ok(reduce(room, { playerId: room.players[1].id }, { type: 'playAgain' }).ok);
    const live = mk({ phase: 'day' });
    assert.ok(reduce(live, { playerId: live.players[1].id }, { type: 'playAgain' }).error);
  });
  test('non-host restart is rejected; so is restart in the lobby', () => {
    const room = mk(); const before = snap(room);
    assert.ok(reduce(room, { playerId: room.players[1].id }, { type: 'restart' }).error);
    assert.ok(reduce(room, ANON, { type: 'restart' }).error);
    assert.equal(room.phase, 'night'); assert.equal(snap(room), before);
    const lobby = newRoom('LB', 'k');
    assert.ok(reduce(lobby, HOST, { type: 'restart' }).error);
    assert.equal(lobby.gameNo, undefined);
  });
  test('a failed deal leaves the room in the lobby on v7 with dealt:false and the error', () => {
    const room = mk({ version: 5 }); room.config.roles = ['mafia', 'doctor'];
    const r = reduce(room, HOST, { type: 'restart' });
    assert.equal(r.ok, true); assert.equal(r.data.dealt, false); assert.ok(r.data.error);
    assert.equal(room.phase, 'lobby'); assert.equal(room.nightVersion, 7);
  });
  test('a reconnecting player sees the reveal step with their new role', () => {
    const room = mk(); const me = room.players[3];
    reduce(room, HOST, { type: 'restart' });
    const v = viewForPlayer(room, me.id);
    assert.equal(v.phase, 'dealt'); assert.equal(v.me.role.id, me.roleId);
    assert.equal(v.me.alive, true);
  });
  test('isNewGame is true only for the same code with a different gameNo', () => {
    assert.equal(isNewGame({ code: 'A', gameNo: 1 }, { code: 'A', gameNo: 2 }), true);
    assert.equal(isNewGame({ code: 'A', gameNo: 1 }, { code: 'A', gameNo: 1 }), false);
    assert.equal(isNewGame({ code: 'A' }, { code: 'A', gameNo: 1 }), false);
    assert.equal(isNewGame({ code: 'A', gameNo: 1 }, { code: 'B', gameNo: 2 }), false);
    assert.equal(isNewGame(null, { code: 'A', gameNo: 2 }), false);
  });
});

describe('v7 night-only Tracker, Lookout and Coroner', () => {
  const SPEC = [['Mob', 'mafia'], ['Doc', 'doctor'], ['Trk', 'tracker'], ['Look', 'lookout'], ['Cor', 'coroner'], ['Dead', 'villager'], ['V1', 'villager'], ['V2', 'villager']];
  function room7(version, deadActor) {
    const room = newRoom('T7', 'hostkey');
    for (const [name, roleId] of SPEC) {
      reduce(room, ANON, { type: 'join', name });
      const p = room.players.find((q) => q.name === name); p.id = `p${name}`; p.roleId = roleId; p.alive = true;
    }
    room.players.find((p) => p.name === 'Dead').alive = false;
    if (deadActor) room.players.find((p) => p.name === deadActor).alive = false;
    room.nightVersion = version; room.phase = 'night'; room.night = 2; room.copSalt = 0.5;
    return room;
  }
  const stepOf = (room, roleId) => nightScript(room).find((s) => s.roleId === roleId);
  const run = (room, roleId, target, extra = {}) => {
    const st = stepOf(room, roleId);
    const ans = { ...extra, [st.key]: { targets: [`p${target}`], on: true } };
    const pv = previewNight(room, ans, st.key);
    return { st, pv, card: checkCard(room, st, pv), rep: resolveNight(room, ans) };
  };
  const docAns = (room) => ({ [stepOf(room, 'doctor').key]: { targets: ['pV1'], on: true } });

  test('absent from report.info in v7, present in v6', () => {
    for (const [role, target] of [['tracker', 'Doc'], ['lookout', 'V1'], ['coroner', 'Dead']]) {
      assert.equal(run(room7(7), role, target).rep.info.filter((i) => i.roleId === role).length, 0, `${role} v7`);
      assert.equal(run(room7(6), role, target).rep.info.filter((i) => i.roleId === role).length, 1, `${role} v6`);
    }
  });
  test('the phone has no results in v7 (and the room keeps none)', () => {
    const room = room7(7); run(room, 'tracker', 'Doc');
    assert.deepEqual(room.results || [], []);
    assert.deepEqual(viewForPlayer(room, 'pTrk').me.results, []);
  });
  test('cards in v7', () => {
    const r1 = room7(7); const t = run(r1, 'tracker', 'Doc', docAns(r1));
    assert.deepEqual(t.card, { kind: 'track', text: 'V1' });
    const r2 = room7(7); assert.deepEqual(run(r2, 'tracker', 'V2').card, { kind: 'track', text: 'STAYED HOME' });
    const r3 = room7(7); assert.deepEqual(run(r3, 'lookout', 'V1', docAns(r3)).card, { kind: 'watch', text: 'DOC' });
    const r4 = room7(7); assert.deepEqual(run(r4, 'lookout', 'V2').card, { kind: 'watch', text: 'NOBODY' });
    const r5 = room7(7); assert.deepEqual(run(r5, 'coroner', 'Dead').card, { kind: 'role', text: 'VILLAGER' });
  });
  test('cards are null in v6 (and v4)', () => {
    for (const v of [4, 6]) for (const [role, target] of [['tracker', 'Doc'], ['lookout', 'V1'], ['coroner', 'Dead']]) {
      assert.equal(run(room7(v), role, target).card, null, `${role} v${v}`);
    }
  });
  test('a dead Tracker gets NO ANSWER; a blocked one gets no card', () => {
    const room = room7(7, 'Trk');
    assert.deepEqual(run(room, 'tracker', 'Doc').card, { kind: 'none', text: 'NO ANSWER' });
    const live = room7(7); const st = stepOf(live, 'tracker');
    assert.equal(checkCard(live, st, { text: '', blocked: true }), null);
  });
});
