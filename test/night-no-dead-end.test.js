// The Host's night script never dead-ends: Next is only blocked while a choice is missing, and every such step can be
// skipped. ~300 seeded games through nightNav and the same room actions the screen sends, on every night version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, viewForHost } from '../public/js/room.js';
import { nightNav } from '../public/js/night-nav.js';
import { CATALOGUE, rng } from '../scripts/sim-lib.mjs';
import { dealt, playGame, playNight, ok, host, freshUi } from './night-drive-lib.mjs';

const MIXES = [
  ['mafia', 'mafia', 'cop', 'cop', 'cop', 'doctor', 'villager', 'villager'],
  ['mafia', 'godfather', 'detective', 'cop', 'doctor', 'bodyguard', 'villager', 'villager', 'villager'],
  ['mafia', 'executioner', 'doctor', 'bodyguard', 'vigilante', 'veteran', 'villager'],
  ['mafia', 'confused_cop', 'cop', 'cop', 'detective', 'doctor', 'villager', 'villager'],
  ['mafia', 'mafia', 'vigilante', 'veteran', 'executioner', 'executioner', 'doctor', 'villager', 'villager', 'villager'],
];

test('Host night script never dead-ends: Next names the missing choice, every choice has No one/Skip (~300 games)', () => {
  const R = rng(20261025);
  const total = { skipIdentify: 0, noOne: 0, nights: 0 };
  let games = 0;
  for (let i = 0; i < 300; i++) {
    const version = 1 + (i % 9);
    const flow = ['app', 'blind', 'claim', 'blind'][Math.floor(i / 8) % 4];
    const roles = i % 3 === 2
      ? ['mafia', ...Array.from({ length: 7 + (i % 5) }, () => R.pick(CATALOGUE))]
      : MIXES[i % MIXES.length];
    const g = dealt({ roles, version, flow, seed: 1000 + i, dropCard: flow === 'blind' && i % 4 === 1 });
    if (!g) continue;
    games++;
    playGame(g, { local: flow !== 'app', render: i % 10 === 0, stats: total });
  }
  assert.ok(games > 200, `only ${games} games were dealt`);
  assert.ok(total.nights > 400);
  assert.ok(total.skipIdentify > 0, 'the "no one has this card" path ran');
  assert.ok(total.noOne > 0, 'the "No one" path ran');
});

test('a deck with a card nobody holds: skipIdentify finishes the night, the Villagers fill the rest', () => {
  const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'cop', 'villager', 'villager'], flow: 'blind', dropCard: true, seed: 7 });
  assert.ok(g);
  const { room, truth, R } = g;
  ok(room, { type: 'startNight' });
  playNight(room, truth, R);
  assert.ok(room.players.every((p) => p.roleId));
  assert.ok(room.deck.map.some((m) => m.unused));
  // nothing else reads the card list for the rules: every player still holds exactly the role the Host matched
  assert.deepEqual(Object.fromEntries(room.players.map((p) => [p.id, p.roleId])), { ...truth });
});

test('skipIdentify is only for night 1 of a blind deal and a role still waiting', () => {
  const g = dealt({ roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'], flow: 'blind', seed: 3 });
  const { room } = g;
  assert.ok(reduce(room, host, { type: 'skipIdentify', roleId: 'doctor' }).error, 'not at night');
  ok(room, { type: 'startNight' });
  assert.ok(reduce(room, host, { type: 'skipIdentify', roleId: 'veteran' }).error, 'a role that is not waiting');
  assert.ok(reduce(room, host, { type: 'skipIdentify', roleId: 'doctor' }).ok);
  assert.ok(!viewForHost(room).script.some((s) => s.roleId === 'doctor'));
});

test('old rooms (v1..v7) caught mid-night 1, blind and partly identified, can finish the night', () => {
  for (let version = 1; version <= 7; version++) {
    for (const drop of [false, true]) {
      const g = dealt({ roles: ['mafia', 'mafia', 'cop', 'cop', 'doctor', 'villager', 'villager', 'villager'], version, flow: 'blind', seed: 50 + version, dropCard: drop });
      assert.ok(g, `v${version} dealt`);
      const { room, truth, R } = g;
      ok(room, { type: 'startNight' });
      // identify the first step like the Host would, then "reload" from a stored copy of the room
      const first = viewForHost(room).script.find((s) => s.kind === 'identify');
      if (first) {
        const ids = Object.keys(truth).filter((id) => truth[id] === first.roleId && !room.players.find((p) => p.id === id).roleId).slice(0, first.count);
        if (ids.length === first.count) ok(room, { type: 'identifyRole', roleId: first.roleId, playerIds: ids });
      }
      const copy = JSON.parse(JSON.stringify(room));
      assert.equal(copy.nightVersion ?? 1, version);
      playNight(copy, truth, R);
      assert.equal(copy.phase, 'day', `v${version}`);
    }
  }
});

test('the Doctor-done / Mafia-next screenshot: the dock names what is missing', () => {
  for (const [flow, want] of [['blind', 'Mark who is Mafia'], ['app', 'Tap who the Mafia picked']]) {
    const g = dealt({ roles: ['mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], flow, seed: 11 });
    const { room, truth } = g;
    ok(room, { type: 'startNight' });
    const ui = freshUi(room);
    let view = viewForHost(room);
    if (flow === 'blind') { // everyone but the Mafia identified, then the Doctor's step done
      for (const s of view.script.filter((x) => x.kind === 'identify' && x.roleId === 'doctor')) {
        ok(room, { type: 'identifyRole', roleId: s.roleId, playerIds: Object.keys(truth).filter((id) => truth[id] === 'doctor') });
      }
      view = viewForHost(room);
    }
    ui.actions[view.script.find((s) => s.roleId === 'doctor' && s.kind === 'action')?.key ?? 'x'] = { targets: [room.players[3].id] };
    const nav = nightNav(view, ui);
    assert.equal(nav.label, want);
    assert.equal(nav.enabled, false);
    assert.equal(nav.canSkip, true);
  }
});
