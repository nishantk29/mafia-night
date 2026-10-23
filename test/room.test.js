import { roleGuide } from '../public/js/role_guide.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForPlayer, viewForHost, roleCard } from '../public/js/room.js';
import { nightScript, suggestRoles, MIN_PLAYERS, MAX_PLAYERS, FULL_DECK, playerById } from '../public/js/engine.js';
import { ROLE_BY_ID, sanitizeRole, registerRoles, factionOf } from '../public/js/roles.js';

// ---------- helpers ----------
const HOST = { host: true };
const ANON = { anon: true };
const H = (room, a) => reduce(room, HOST, a);

function lobby(names) {
  const room = newRoom('ROOM', 'hostkey-SECRET-123');
  const tokens = {};
  for (const n of names) {
    const r = reduce(room, ANON, { type: 'join', name: n });
    assert.ok(r.ok, r.error);
    tokens[n] = r.data;
  }
  return { room, tokens };
}
const names = (n) => Array.from({ length: n }, (_, i) => `Player${i + 1}`);
const P = (room, name) => room.players.find((p) => p.name === name);
const pid = (room, name) => P(room, name).id;

function dealt(roles, mode = 'app', deckStyle = 'random', cardFlow = 'claim') {
  const { room } = lobby(names(roles.length));
  assert.ok(H(room, { type: 'setConfig', roles, mode, deckStyle, cardFlow }).ok);
  const r = H(room, { type: 'deal' });
  assert.ok(r.ok, r.error);
  return room;
}

// ---------- join validation ----------
describe('join', () => {
  test('returns playerId + token and adds the player', () => {
    const { room, tokens } = lobby(['Amy']);
    assert.equal(room.players.length, 1);
    assert.ok(tokens.Amy.playerId && tokens.Amy.token);
    assert.equal(room.players[0].token, tokens.Amy.token);
  });
  test('rejects empty / whitespace / markup-only names', () => {
    const room = newRoom('R', 'k');
    for (const n of ['', '   ', '<>', null, undefined, '\u0001\u0002']) assert.ok(reduce(room, ANON, { type: 'join', name: n }).error, String(n));
    assert.equal(room.players.length, 0);
  });
  test('rejects duplicate names case-insensitively', () => {
    const { room } = lobby(['Amy']);
    assert.ok(reduce(room, ANON, { type: 'join', name: 'amy' }).error);
    assert.ok(reduce(room, ANON, { type: 'join', name: ' AMY ' }).error);
    assert.equal(room.players.length, 1);
  });
  test('over-long names are clamped to 20 chars (or rejected)', () => {
    const room = newRoom('R', 'k');
    const r = reduce(room, ANON, { type: 'join', name: 'x'.repeat(100) });
    if (r.ok) assert.ok(room.players[0].name.length <= 20);
    else assert.ok(r.error);
  });
  test('strips < and > from names', () => {
    const room = newRoom('R', 'k');
    reduce(room, ANON, { type: 'join', name: '<b>Bob</b>' });
    assert.ok(!/[<>]/.test(room.players[0].name));
  });
  test('lobby only', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    assert.ok(reduce(room, ANON, { type: 'join', name: 'Late' }).error);
    const { room: r2 } = lobby(['A']);
    r2.phase = 'night';
    assert.ok(reduce(r2, ANON, { type: 'join', name: 'B' }).error);
  });
  test('room capacity', () => {
    const { room } = lobby(names(MAX_PLAYERS));
    assert.ok(reduce(room, ANON, { type: 'join', name: 'OneTooMany' }).error);
  });
  test('players cannot use host actions', () => {
    const { room, tokens } = lobby(names(5));
    const r = reduce(room, { playerId: tokens.Player1.playerId }, { type: 'deal' });
    assert.ok(r.error);
    assert.ok(reduce(room, ANON, { type: 'setConfig', mode: 'cards' }).error);
    assert.equal(room.config.mode, 'app');
  });
  test('unknown host action is an error', () => {
    const { room } = lobby(names(5));
    assert.ok(H(room, { type: 'bogus' }).error);
  });
});

// ---------- deal ----------
describe('deal', () => {
  test('needs >= MIN_PLAYERS', () => {
    const { room } = lobby(names(MIN_PLAYERS - 1));
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).error);
    assert.equal(room.phase, 'lobby');
  });
  test('roles.length must equal players.length', () => {
    const { room } = lobby(names(6));
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).error);
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).error);
  });
  test('needs at least one mafia-aligned role', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setConfig', roles: ['doctor', 'cop', 'villager', 'villager', 'jester'] });
    assert.ok(H(room, { type: 'deal' }).error);
    H(room, { type: 'setConfig', roles: ['killer', 'doctor', 'cop', 'villager', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).error, 'a killer alone is not mafia-aligned');
  });
  test('setConfig filters unknown role ids', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setConfig', roles: ['mafia', 'nope', 'villager'] });
    assert.deepEqual(room.config.roles, ['mafia', 'villager']);
  });
  test('app mode gives every player a role (multiset preserved)', () => {
    const roles = ['mafia', 'doctor', 'cop', 'villager', 'villager', 'jester'];
    const room = dealt(roles, 'app');
    assert.equal(room.phase, 'dealt');
    assert.ok(room.players.every((p) => p.roleId));
    assert.deepEqual(room.players.map((p) => p.roleId).sort(), [...roles].sort());
    assert.equal(room.deck, null);
  });
  test('cards mode builds a deck without assigning roles', () => {
    const roles = ['mafia', 'doctor', 'cop', 'villager', 'villager', 'jester'];
    const room = dealt(roles, 'cards', 'fixed');
    assert.equal(room.phase, 'dealt');
    assert.ok(room.players.every((p) => !p.roleId));
    assert.equal(room.deck.map.length, roles.length);
    assert.deepEqual(room.deck.claimed, {});
  });
  test('cannot deal twice; undeal resets', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    assert.ok(H(room, { type: 'deal' }).error);
    assert.ok(H(room, { type: 'undeal' }).ok);
    assert.equal(room.phase, 'lobby');
    assert.ok(room.players.every((p) => !p.roleId));
  });
  test('suggestRoles action fills config', () => {
    const { room } = lobby(names(9));
    H(room, { type: 'suggestRoles' });
    assert.equal(room.config.roles.length, 9);
    assert.ok(H(room, { type: 'deal' }).ok);
  });
  test('setConfig refused mid-game', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    H(room, { type: 'startNight' });
    assert.ok(H(room, { type: 'setConfig', mode: 'cards' }).error);
  });
});

// ---------- cards ----------
describe('claimCard / assignCard', () => {
  const setup = () => {
    const roles = ['mafia', 'doctor', 'cop', 'villager', 'villager'];
    const { room } = lobby(names(5));
    H(room, { type: 'setConfig', roles, mode: 'cards', deckStyle: 'random', cardFlow: 'claim' });
    H(room, { type: 'deal' });
    return room;
  };
  const claim = (room, who, card) => reduce(room, { playerId: pid(room, who) }, { type: 'claimCard', card });

  test('claim assigns the role once', () => {
    const room = setup();
    const [a, b] = room.deck.map;
    assert.ok(claim(room, 'Player1', a.card).ok);
    assert.equal(P(room, 'Player1').roleId, a.roleId);
    assert.equal(room.deck.claimed[a.card], pid(room, 'Player1'));
    // claiming a second card does not change anything
    assert.ok(claim(room, 'Player1', b.card).ok);
    assert.equal(P(room, 'Player1').card, a.card);
    assert.equal(P(room, 'Player1').roleId, a.roleId);
    assert.equal(room.deck.claimed[b.card], undefined);
  });
  test('rejects unknown card and non-card strings', () => {
    const room = setup();
    const inDeck = new Set(room.deck.map.map((m) => m.card));
    const notInDeck = FULL_DECK.find((c) => !inDeck.has(c));
    assert.ok(claim(room, 'Player1', notInDeck).error);
    assert.ok(claim(room, 'Player1', 'ZZ').error);
    assert.ok(claim(room, 'Player1', undefined).error);
    assert.equal(P(room, 'Player1').roleId, null);
  });
  test('rejects a card someone else holds', () => {
    const room = setup();
    const c = room.deck.map[0].card;
    claim(room, 'Player1', c);
    const r = claim(room, 'Player2', c);
    assert.ok(r.error);
    assert.equal(P(room, 'Player2').roleId, null);
  });
  test('locks out after 5 wrong tries, even for a right card', () => {
    const room = setup();
    for (let i = 0; i < 5; i++) assert.ok(claim(room, 'Player1', 'ZZ').error);
    const r = claim(room, 'Player1', room.deck.map[0].card);
    assert.ok(r.error);
    assert.equal(P(room, 'Player1').roleId, null);
    assert.equal(viewForPlayer(room, pid(room, 'Player1')).me.claimsLeft, 0);
    // host can still assign and resets the counter
    assert.ok(H(room, { type: 'assignCard', playerId: pid(room, 'Player1'), card: room.deck.map[0].card }).ok);
    assert.equal(P(room, 'Player1').wrongClaims, 0);
  });
  test('claim not allowed in app mode, lobby, or for non-members', () => {
    const { room, tokens } = lobby(names(5));
    assert.ok(reduce(room, { playerId: tokens.Player1.playerId }, { type: 'claimCard', card: 'AS' }).error);
    assert.ok(reduce(room, { playerId: 'ghost' }, { type: 'claimCard', card: 'AS' }).error);
    assert.ok(reduce(room, ANON, { type: 'claimCard', card: 'AS' }).error);
  });
  test('assignCard by host; reassign frees the old card; duplicate rejected', () => {
    const room = setup();
    const [a, b] = room.deck.map;
    assert.ok(H(room, { type: 'assignCard', playerId: pid(room, 'Player1'), card: a.card }).ok);
    assert.equal(P(room, 'Player1').roleId, a.roleId);
    assert.ok(H(room, { type: 'assignCard', playerId: pid(room, 'Player2'), card: a.card }).error);
    assert.ok(H(room, { type: 'assignCard', playerId: pid(room, 'Player1'), card: b.card }).ok);
    assert.equal(room.deck.claimed[a.card], undefined);
    assert.equal(P(room, 'Player1').roleId, b.roleId);
    assert.ok(H(room, { type: 'assignCard', playerId: pid(room, 'Player3'), card: 'nope' }).error);
  });
  test('clearCard releases a card', () => {
    const room = setup();
    const a = room.deck.map[0];
    H(room, { type: 'assignCard', playerId: pid(room, 'Player1'), card: a.card });
    H(room, { type: 'clearCard', playerId: pid(room, 'Player1') });
    assert.equal(P(room, 'Player1').roleId, null);
    assert.equal(room.deck.claimed[a.card], undefined);
  });
  test('startNight needs every player to have a role', () => {
    const room = setup();
    const r = H(room, { type: 'startNight' });
    assert.ok(r.error);
    assert.equal(room.phase, 'dealt');
    room.deck.map.forEach((m, i) => H(room, { type: 'assignCard', playerId: pid(room, `Player${i + 1}`), card: m.card }));
    assert.ok(H(room, { type: 'startNight' }).ok);
    assert.equal(room.phase, 'night');
    assert.equal(room.night, 1);
  });
});

// ---------- phase machine ----------
describe('phase machine', () => {
  test('startNight blocked by pending prompts; submitNight only at night; condemn only by day', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager']);
    assert.ok(H(room, { type: 'submitNight', actions: {} }).error);
    assert.ok(H(room, { type: 'condemn', playerId: room.players[0].id }).error);
    H(room, { type: 'startNight' });
    assert.ok(H(room, { type: 'startNight' }).error, 'cannot start night while already night');
    H(room, { type: 'submitNight', actions: {} });
    room.pending.push({ id: 'pendX', playerId: room.players[0].id, text: 'x' });
    assert.ok(H(room, { type: 'startNight' }).error);
    H(room, { type: 'resolvePending', pendingId: 'pendX' });
    assert.ok(H(room, { type: 'startNight' }).ok);
  });
  test('executioner gets a town target at night 1', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'executioner']);
    H(room, { type: 'startNight' });
    const ex = room.players.find((p) => p.roleId === 'executioner');
    assert.ok(ex.target);
    assert.equal(factionOf(playerById(room, ex.target).roleId), 'town');
    assert.notEqual(ex.target, ex.id);
  });
  test('revive, kill, tags, notes, legend validation', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    // A Villager, not players[0]: if the deal made players[0] the Mafia, the kill ended the game and revive was refused (#21).
    const p = room.players.find((x) => x.roleId === 'villager');
    room.phase = 'day';
    H(room, { type: 'kill', playerId: p.id, cause: 'host' });
    assert.equal(p.alive, false);
    H(room, { type: 'revive', playerId: p.id });
    assert.equal(p.alive, true);
    assert.ok(H(room, { type: 'toggleTag', playerId: p.id, tag: 'red' }).ok);
    assert.deepEqual(p.tags, ['red']);
    assert.ok(H(room, { type: 'toggleTag', playerId: p.id, tag: 'chartreuse' }).error);
    H(room, { type: 'setNote', playerId: p.id, note: '<script>x'.repeat(30) });
    assert.ok(!/[<>]/.test(p.note) && p.note.length <= 80);
    assert.ok(H(room, { type: 'setLegend', color: 'nope', label: 'x' }).error);
  });
  test('host kill ends the game when it eliminates the last threat', () => {
    // BUG candidate: the host `kill` action never calls the win check, so killing the last
    // Mafia (e.g. a Mad Bomber blowing himself up) leaves the game running in 'day'.
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    H(room, { type: 'startNight' });
    H(room, { type: 'submitNight', actions: {} });
    const mob = room.players.find((p) => p.roleId === 'mafia');
    H(room, { type: 'kill', playerId: mob.id, cause: 'exploded' });
    assert.equal(room.phase, 'over');
    assert.equal(room.winner?.side, 'town');
  });
  test('newGame resets the board but keeps players', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    H(room, { type: 'startNight' });
    H(room, { type: 'newGame' });
    assert.equal(room.phase, 'lobby');
    assert.equal(room.players.length, 5);
    assert.ok(room.players.every((p) => p.alive && !p.roleId));
  });
});

// ---------- seat order ----------
describe('moveSeat', () => {
  const order = (room) => room.players.map((p) => p.name).join(',');
  test('moves a seat forward and backward', () => {
    const { room } = lobby(['A', 'B', 'C', 'D']);
    assert.ok(H(room, { type: 'moveSeat', playerId: pid(room, 'A'), toIndex: 2 }).ok);
    assert.equal(order(room), 'B,C,A,D');
    assert.ok(H(room, { type: 'moveSeat', playerId: pid(room, 'D'), toIndex: 0 }).ok);
    assert.equal(order(room), 'D,B,C,A');
  });
  test('clamps the index and works mid-game', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager']);
    H(room, { type: 'startNight' });
    const first = room.players[0].id; const last = room.players[4].id;
    assert.ok(H(room, { type: 'moveSeat', playerId: first, toIndex: 99 }).ok);
    assert.equal(room.players[4].id, first);
    assert.ok(H(room, { type: 'moveSeat', playerId: last, toIndex: -5 }).ok);
    assert.equal(room.players[0].id, last);
    assert.ok(H(room, { type: 'moveSeat', playerId: last, toIndex: 'x' }).ok);
    assert.equal(room.players[0].id, last);
    assert.equal(room.players.length, 5);
  });
  test('rejects unknown players and non-hosts', () => {
    const { room, tokens } = lobby(['A', 'B', 'C']);
    assert.equal(H(room, { type: 'moveSeat', playerId: 'ghost', toIndex: 0 }).error, 'Bad player.');
    assert.ok(reduce(room, { playerId: tokens.C.playerId }, { type: 'moveSeat', playerId: tokens.C.playerId, toIndex: 0 }).error);
    assert.ok(reduce(room, ANON, { type: 'moveSeat', playerId: pid(room, 'C'), toIndex: 0 }).error);
    assert.equal(order(room), 'A,B,C');
  });
});

// ---------- full smoke games ----------
describe('full game smoke', () => {
  test('town wins: lobby -> deal -> night -> day -> condemn mafia -> over', () => {
    const { room } = lobby(['Amy', 'Ben', 'Cy', 'Di', 'Ed', 'Flo']);
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager', 'villager'], mode: 'app' });
    assert.ok(H(room, { type: 'deal' }).ok);
    // fix roles so the script is predictable
    const assign = { Amy: 'mafia', Ben: 'doctor', Cy: 'cop', Di: 'villager', Ed: 'villager', Flo: 'villager' };
    for (const [n, r] of Object.entries(assign)) H(room, { type: 'setRole', playerId: pid(room, n), roleId: r });
    assert.ok(H(room, { type: 'startNight' }).ok);
    const v = viewForHost(room);
    assert.equal(v.phase, 'night');
    const keys = v.script.map((s) => s.key);
    assert.ok(keys.includes('meeting:mafia') && keys.includes(`act:${pid(room, 'Ben')}`));
    assert.ok(H(room, {
      type: 'submitNight',
      actions: {
        'meeting:mafia': { targets: [pid(room, 'Di')] },
        [`act:${pid(room, 'Ben')}`]: { targets: [pid(room, 'Ed')] },
        [`act:${pid(room, 'Cy')}`]: { targets: [pid(room, 'Amy')] },
      },
    }).ok);
    assert.equal(room.phase, 'day');
    assert.equal(P(room, 'Di').alive, false);
    assert.match(room.lastReport.info[0].text, /Amy is MAFIA/);
    assert.ok(H(room, { type: 'condemn', playerId: pid(room, 'Amy') }).ok);
    assert.equal(room.phase, 'over');
    assert.equal(room.winner.side, 'town');
    const hv = viewForHost(room);
    assert.ok(hv.winners.some((w) => w.id === pid(room, 'Cy')));
    assert.ok(!hv.winners.some((w) => w.id === pid(room, 'Amy')));
    // after the game, new game works
    assert.ok(H(room, { type: 'newGame' }).ok);
    assert.equal(room.phase, 'lobby');
  });

  test('mafia wins by attrition with noCondemn days', () => {
    const room = dealt(['mafia', 'villager', 'villager', 'villager', 'villager']);
    const mob = room.players.find((p) => p.roleId === 'mafia');
    for (let i = 0; i < 6 && room.phase !== 'over'; i++) {
      assert.ok(H(room, { type: 'startNight' }).ok);
      const victim = room.players.find((p) => p.alive && p.id !== mob.id);
      H(room, { type: 'submitNight', actions: { 'meeting:mafia': { targets: [victim.id] } } });
      if (room.phase === 'day') H(room, { type: 'noCondemn' });
    }
    assert.equal(room.phase, 'over');
    assert.equal(room.winner.side, 'mafia');
    assert.equal(room.players.filter((p) => p.alive).length, 2);
  });

  test('cards-mode game from claims to over', () => {
    const roles = ['mafia', 'villager', 'villager', 'villager', 'villager'];
    const { room } = lobby(names(5));
    H(room, { type: 'setConfig', roles, mode: 'cards', deckStyle: 'fixed', cardFlow: 'claim' });
    assert.ok(H(room, { type: 'deal' }).ok);
    room.players.forEach((p, i) => assert.ok(reduce(room, { playerId: p.id }, { type: 'claimCard', card: room.deck.map[i].card }).ok));
    assert.ok(H(room, { type: 'startNight' }).ok);
    const mob = room.players.find((p) => p.roleId === 'mafia');
    H(room, { type: 'submitNight', actions: {} });
    assert.ok(H(room, { type: 'condemn', playerId: mob.id }).ok);
    assert.equal(room.phase, 'over');
  });

  test('declareWinner ends the game manually', () => {
    const room = dealt(['mafia', 'villager', 'villager', 'villager', 'villager']);
    room.phase = 'day';
    H(room, { type: 'declareWinner', side: 'town', reason: 'because' });
    assert.equal(room.phase, 'over');
    assert.equal(viewForPlayer(room, room.players[0].id).winner.side, 'town');
  });

  // Randomised play across many table sizes: nothing may throw, invariants hold, views never leak.
  for (const n of [5, 6, 7, 8, 9, 11, 13, 16, 20, 30, 50]) {
    test(`fuzz game n=${n}: no crashes, always terminates or stays consistent`, () => {
      const { room } = lobby(names(n));
      H(room, { type: 'setConfig', roles: suggestRoles(n), mode: 'app' });
      assert.ok(H(room, { type: 'deal' }).ok);
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      for (let round = 0; round < 80 && room.phase !== 'over'; round++) {
        assert.ok(H(room, { type: 'startNight' }).ok || room.pending.length, 'startNight');
        if (room.phase !== 'night') { // pending blocked it
          for (const pd of [...room.pending]) H(room, { type: 'resolvePending', pendingId: pd.id, targetId: pick(room.players.filter((p) => p.alive))?.id });
          if (room.phase === 'over') break;
          assert.ok(H(room, { type: 'startNight' }).ok);
        }
        const actions = {};
        for (const s of nightScript(room)) {
          if (s.kind !== 'action') continue;
          const pool = s.dead ? room.players : room.players.filter((p) => p.alive);
          const targets = Array.from({ length: s.targets }, () => pick(pool).id);
          actions[s.key] = { on: Math.random() < 0.7, targets };
        }
        assert.ok(H(room, { type: 'submitNight', actions }).ok);
        let guard = 0;
        while (room.pending.length && guard++ < 20) {
          const pd = room.pending[0];
          H(room, { type: 'resolvePending', pendingId: pd.id, targetId: Math.random() < 0.7 ? pick(room.players.filter((p) => p.alive))?.id : null });
        }
        // views must be buildable for everyone at every stage
        viewForHost(room);
        for (const p of room.players) JSON.stringify(viewForPlayer(room, p.id));
        if (room.phase === 'day') {
          const livePlayers = room.players.filter((p) => p.alive);
          if (livePlayers.length && Math.random() < 0.8) H(room, { type: 'condemn', playerId: pick(livePlayers).id });
          guard = 0;
          while (room.pending.length && guard++ < 20) H(room, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: null });
        }
      }
      if (room.phase === 'over') {
        assert.ok(room.winner && room.winner.side);
        assert.ok(Array.isArray(viewForHost(room).winners));
      }
    });
  }
});

// ---------- SECRECY ----------
describe('secrecy: viewForPlayer', () => {
  // Nine unique roles so every role string is a unique secret.
  const ROLES9 = [
    ['Cara', 'villager'], ['Ivy', 'insane_cop'], ['Mill', 'miller'], ['Trey', 'traitor'], ['Mob', 'mafia'],
    ['Fath', 'godfather'], ['Jan', 'janitor'], ['Vic', 'veteran'], ['Exe', 'executioner'],
  ];
  function game9() {
    const { room, tokens } = lobby(ROLES9.map(([n]) => n));
    H(room, { type: 'setConfig', roles: ROLES9.map(([, r]) => r), mode: 'app' });
    assert.ok(H(room, { type: 'deal' }).ok);
    for (const [n, r] of ROLES9) H(room, { type: 'setRole', playerId: pid(room, n), roleId: r });
    assert.ok(H(room, { type: 'startNight' }).ok);
    return { room, tokens };
  }
  const secretsOf = (roleId) => {
    const r = ROLE_BY_ID[roleId];
    return [`"${r.id}"`, r.name, r.emoji, r.blurb];
  };
  const allTokens = (room) => room.players.map((p) => p.token);

  test('no view ever contains hostKey, tokens, or deck.map', () => {
    const { room } = game9();
    for (const p of room.players) {
      const s = JSON.stringify(viewForPlayer(room, p.id, new Set(room.players.map((q) => q.id))));
      assert.ok(!s.includes(room.hostKey), 'hostKey leaked');
      assert.ok(!/hostKey/i.test(s));
      for (const t of allTokens(room)) assert.ok(!s.includes(t), 'token leaked');
      assert.ok(!/"deck"|"map"|"claimed"/.test(s));
    }
  });

  test('cards-mode views never contain deck.map or other roles', () => {
    const roles = ['mafia', 'doctor', 'cop', 'jester', 'villager'];
    const room = dealt(roles, 'cards', 'fixed');
    const mine = room.deck.map[0];
    reduce(room, { playerId: room.players[0].id }, { type: 'claimCard', card: mine.card });
    for (const p of room.players) {
      const v = viewForPlayer(room, p.id);
      const s = JSON.stringify(v);
      assert.ok(!/"deck"|"map"|"claimed"/.test(s));
      assert.equal(v.deckCards, 5);
      if (p.id !== room.players[0].id) {
        assert.equal(v.me.role, null);
        for (const m of room.deck.map) {
          assert.ok(!s.includes(`"${m.card}"`), `card ${m.card} leaked`);
          for (const sec of secretsOf(m.roleId).slice(0, 2)) assert.ok(!s.includes(sec), `role ${m.roleId} leaked`);
        }
      }
    }
  });

  test('a living player sees no other living player\'s role', () => {
    const { room } = game9();
    for (const [viewer] of ROLES9) {
      const v = viewForPlayer(room, pid(room, viewer));
      for (const q of v.players) {
        if (q.id !== pid(room, viewer)) assert.equal(q.role, null, `${viewer} sees ${q.name}'s role`);
      }
    }
  });

  test('Cara (plain villager) sees none of the secret roles anywhere in her JSON', () => {
    const { room } = game9();
    const v = viewForPlayer(room, pid(room, 'Cara'));
    assert.deepEqual(v.me.guide, roleGuide('villager')); // her own guide; it names the Mafia as the enemy
    const s = JSON.stringify({ ...v, me: { ...v.me, guide: null } });
    for (const [n, r] of ROLES9) {
      if (n === 'Cara') continue;
      for (const sec of secretsOf(r)) assert.ok(!s.includes(sec), `${r} secret ${sec} leaked to Cara`);
    }
    assert.ok(!s.includes('Mafia'));
  });

  test('insane cop is told she is a Cop, and the real role never appears', () => {
    const { room } = game9();
    const v = viewForPlayer(room, pid(room, 'Ivy'));
    assert.equal(v.me.role.id, 'cop');
    const s = JSON.stringify(v);
    for (const sec of secretsOf('insane_cop')) assert.ok(!s.includes(sec), `insane_cop secret ${sec}`);
    assert.ok(!/Insane/i.test(s));
  });

  test('miller is told villager; traitor is told villager', () => {
    const { room } = game9();
    for (const [who, real] of [['Mill', 'miller'], ['Trey', 'traitor']]) {
      const v = viewForPlayer(room, pid(room, who));
      assert.equal(v.me.role.id, 'villager');
      // The guide is the plain villager guide (which names the Mafia as the enemy); everything else stays silent.
      assert.deepEqual(v.me.guide, roleGuide('villager'));
      const s = JSON.stringify({ ...v, me: { ...v.me, guide: null } });
      for (const sec of secretsOf(real)) assert.ok(!s.includes(sec), `${real} secret ${sec}`);
      assert.ok(!/Mafia/.test(s.replace(/"alignment":"[a-z]+"/g, '')), 'mafia mentioned in traitor/miller view');
    }
  });

  test('other players never learn a seesAs role holder\'s real role, even via the players list', () => {
    const { room } = game9();
    for (const [viewer] of ROLES9) {
      const s = JSON.stringify(viewForPlayer(room, pid(room, viewer)));
      if (viewer !== 'Ivy') assert.ok(!s.includes('insane_cop'));
      if (viewer !== 'Mill') assert.ok(!s.includes('"miller"'));
      if (viewer !== 'Trey') assert.ok(!s.includes('"traitor"'));
    }
  });

  test('mafia see teammates (with roles) but not outsiders', () => {
    const { room } = game9();
    const v = viewForPlayer(room, pid(room, 'Mob'));
    const team = v.me.team.map((t) => t.name).sort();
    assert.deepEqual(team, ['Fath', 'Jan']);
    assert.equal(v.me.team.find((t) => t.name === 'Fath').role.id, 'godfather');
    const s = JSON.stringify(v);
    for (const r of ['insane_cop', 'miller', 'traitor', 'veteran', 'executioner']) assert.ok(!s.includes(`"${r}"`), r);
    // town does not see mafia
    const c = viewForPlayer(room, pid(room, 'Cara'));
    assert.deepEqual(c.me.team, []);
  });

  test('masons see each other without roles; merlin knows mafia names only', () => {
    const { room } = lobby(names(6));
    H(room, { type: 'setConfig', roles: ['mafia', 'mason', 'mason', 'merlin', 'villager', 'cop'] });
    H(room, { type: 'deal' });
    const set = { Player1: 'mafia', Player2: 'mason', Player3: 'mason', Player4: 'merlin', Player5: 'villager', Player6: 'cop' };
    for (const [n, r] of Object.entries(set)) H(room, { type: 'setRole', playerId: pid(room, n), roleId: r });
    const m = viewForPlayer(room, pid(room, 'Player2'));
    assert.deepEqual(m.me.team.map((t) => t.name), ['Player3']);
    assert.equal(m.me.team[0].role, null);
    const mer = viewForPlayer(room, pid(room, 'Player4'));
    assert.deepEqual(mer.me.knows.map((k) => k.name), ['Player1']);
    assert.ok(!JSON.stringify(mer).includes('"mafia"'), 'merlin learns names, not role cards');
  });

  test('dead non-hidden players\' roles are visible (real role, even for seesAs roles)', () => {
    const { room } = game9();
    P(room, 'Mill').alive = false; P(room, 'Mill').deathCause = 'condemned';
    P(room, 'Mob').alive = false; P(room, 'Mob').deathCause = 'condemned';
    const v = viewForPlayer(room, pid(room, 'Cara'));
    assert.equal(v.players.find((q) => q.name === 'Mill').role.id, 'miller');
    assert.equal(v.players.find((q) => q.name === 'Mob').role.id, 'mafia');
    assert.equal(v.players.find((q) => q.name === 'Ivy').role, null);
  });

  test('roleHidden (janitor-cleaned) dead players\' roles are NOT visible until game over', () => {
    const { room } = game9();
    const t = P(room, 'Trey');
    t.alive = false; t.deathCause = 'killed by the Mafia'; t.roleHidden = true;
    const v = viewForPlayer(room, pid(room, 'Cara'));
    assert.equal(v.players.find((q) => q.name === 'Trey').role, null);
    const s = JSON.stringify(v);
    for (const sec of secretsOf('traitor')) assert.ok(!s.includes(sec));
    // the dead player still knows their own role
    assert.equal(viewForPlayer(room, t.id).me.role.id, 'villager');
    // at game over everything is public
    room.phase = 'over'; room.winner = { side: 'town', reason: 'x' };
    const over = viewForPlayer(room, pid(room, 'Cara'));
    assert.equal(over.players.find((q) => q.name === 'Trey').role.id, 'traitor');
    assert.equal(over.players.find((q) => q.name === 'Ivy').role.id, 'insane_cop');
  });

  test('at phase over all roles are visible', () => {
    const { room } = game9();
    room.phase = 'over'; room.winner = { side: 'town', reason: 'x' };
    const v = viewForPlayer(room, pid(room, 'Cara'));
    for (const [n, r] of ROLES9) assert.equal(v.players.find((q) => q.name === n).role.id, r);
    assert.ok(Array.isArray(v.winners));
  });

  test('winners/won are null/empty while the game runs', () => {
    const { room } = game9();
    const v = viewForPlayer(room, pid(room, 'Cara'));
    assert.equal(v.winner, null);
    assert.deepEqual(v.winners, []);
    assert.equal(v.me.won, null);
  });

  test('executioner sees only the target\'s name, others never see targets', () => {
    const { room } = game9();
    const ex = P(room, 'Exe'); ex.target = pid(room, 'Cara');
    assert.equal(viewForPlayer(room, ex.id).me.target, 'Cara');
    assert.equal(viewForPlayer(room, pid(room, 'Cara')).me.target, null);
    assert.ok(!JSON.stringify(viewForPlayer(room, pid(room, 'Mob'))).includes('executioner'));
  });

  test('public log and death causes never reveal living players\' roles', () => {
    // night: veteran on alert kills a visiting cop-type; janitor etc not involved
    const room2 = lobby(['Vet', 'Cop', 'Mob', 'A', 'B', 'C']).room;
    const set = { Vet: 'veteran', Cop: 'cop', Mob: 'mafia', A: 'villager', B: 'villager', C: 'villager' };
    for (const [n, r] of Object.entries(set)) P(room2, n).roleId = r;
    room2.phase = 'night'; room2.night = 1;
    reduce(room2, HOST, {
      type: 'submitNight',
      actions: { [`act:${pid(room2, 'Vet')}`]: { on: true }, [`act:${pid(room2, 'Cop')}`]: { targets: [pid(room2, 'Vet')] } },
    });
    assert.equal(P(room2, 'Cop').alive, false);
    for (const p of room2.players) {
      const v = viewForPlayer(room2, p.id);
      const s = JSON.stringify(v);
      // The public cause must stay neutral. (The Veteran's own role blurb legitimately says "go on alert".)
      if (p.name !== 'Vet') assert.ok(!/on alert/i.test(s), `view of ${p.name} leaks the veteran: ${s.match(/shot by[^"]*/)?.[0]}`);
      assert.ok(!s.includes('shot by Vet'));
    }
  });

  test('view for unknown player is gone; host view is separate kind', () => {
    const { room } = game9();
    assert.equal(viewForPlayer(room, 'nobody').kind, 'gone');
    assert.equal(viewForHost(room).kind, 'host');
    assert.equal(viewForPlayer(room, pid(room, 'Cara')).kind, 'player');
  });

  test('roleCard shape', () => {
    assert.deepEqual(Object.keys(roleCard('cop')).sort(), ['alignment', 'blurb', 'emoji', 'id', 'meeting', 'name']);
    assert.equal(roleCard('nope'), undefined);
  });

  test('fuzzed secrecy: across a whole random game no living player\'s role leaks via role fields', () => {
    for (let g = 0; g < 10; g++) {
      const n = 8 + g;
      const { room } = lobby(names(n));
      H(room, { type: 'setConfig', roles: suggestRoles(n), mode: 'app' });
      H(room, { type: 'deal' });
      for (let round = 0; round < 30 && room.phase !== 'over'; round++) {
        if (!H(room, { type: 'startNight' }).ok) { for (const pd of [...room.pending]) H(room, { type: 'resolvePending', pendingId: pd.id }); if (!H(room, { type: 'startNight' }).ok) break; }
        const actions = {};
        const live = room.players.filter((p) => p.alive);
        for (const s of nightScript(room)) if (s.kind === 'action') {
          actions[s.key] = { on: true, targets: Array.from({ length: s.targets }, () => live[Math.floor(Math.random() * live.length)].id) };
        }
        H(room, { type: 'submitNight', actions });
        for (const pd of [...room.pending]) H(room, { type: 'resolvePending', pendingId: pd.id });
        for (const viewer of room.players) {
          const v = viewForPlayer(room, viewer.id);
          if (room.phase === 'over') break;
          const teamIds = new Set(v.me.team.filter((t) => t.role).map((t) => t.id));
          for (const q of v.players) {
            if (q.id === viewer.id) continue;
            const real = room.players.find((x) => x.id === q.id);
            if (q.role) assert.ok(!real.alive ? !real.roleHidden : false, `${viewer.name} sees living/hidden ${real.name}`);
            void teamIds;
          }
          const s = JSON.stringify(v);
          assert.ok(!s.includes(room.hostKey));
          for (const p of room.players) assert.ok(!s.includes(p.token));
        }
        if (room.phase === 'day') {
          const lv = room.players.filter((p) => p.alive);
          if (lv.length) H(room, { type: 'condemn', playerId: lv[0].id });
          for (const pd of [...room.pending]) H(room, { type: 'resolvePending', pendingId: pd.id });
        }
      }
    }
  });
});


// ---------- blind card flow (default for cards mode) ----------
describe('blind card flow', () => {
  const blindGame = (roles = ['mafia', 'doctor', 'cop', 'villager', 'villager']) => {
    const { room } = lobby(names(roles.length));
    assert.ok(H(room, { type: 'setConfig', roles, mode: 'cards', deckStyle: 'fixed' }).ok);
    assert.equal(room.config.cardFlow, 'blind', 'blind is the default flow');
    assert.ok(H(room, { type: 'deal' }).ok);
    return room;
  };

  test('night 1 may start with no roles known, and offers identify steps', () => {
    const room = blindGame();
    assert.ok(H(room, { type: 'startNight' }).ok);
    const ids = nightScript(room).filter((s) => s.kind === 'identify');
    assert.deepEqual(ids.map((s) => s.roleId).sort(), ['cop', 'doctor', 'mafia']);
    assert.ok(ids.every((s) => s.count === 1 && s.candidates.length === 5));
  });

  test('submitNight is refused until everyone is matched; identifyRole validates', () => {
    const room = blindGame();
    H(room, { type: 'startNight' });
    assert.ok(H(room, { type: 'submitNight', actions: {} }).error);
    assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [] }).error, 'wrong count');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player1'), pid(room, 'Player2')] }).error);
    assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: ['ghost'] }).error);
    assert.ok(H(room, { type: 'identifyRole', roleId: 'jester', playerIds: [pid(room, 'Player1')] }).error, 'role not in deck');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player1')] }).ok);
    assert.equal(P(room, 'Player1').roleId, 'mafia');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'doctor', playerIds: [pid(room, 'Player1')] }).error, 'already matched');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player2')] }).error, 'role fully matched');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'doctor', playerIds: [pid(room, 'Player2')] }).ok);
    assert.ok(H(room, { type: 'submitNight', actions: {} }).error, 'cop still unmatched');
    assert.ok(H(room, { type: 'identifyRole', roleId: 'cop', playerIds: [pid(room, 'Player3')] }).ok);
    // the remaining players are auto-assigned Villager
    assert.equal(P(room, 'Player4').roleId, 'villager');
    assert.equal(P(room, 'Player5').roleId, 'villager');
    assert.ok(H(room, { type: 'submitNight', actions: {} }).ok);
    assert.equal(room.phase, 'day');
  });

  test('blind Executioner is never handed an already-identified Mafia player as target', () => {
    for (let i = 0; i < 40; i++) {
      const room = blindGame(['mafia', 'mafia', 'executioner', 'villager', 'villager', 'villager']);
      H(room, { type: 'startNight' });
      // script order: the Mafia team is identified before the Executioner wakes
      const order = nightScript(room).filter((s) => s.kind === 'identify').map((s) => s.roleId);
      assert.ok(order.indexOf('mafia') < order.indexOf('executioner'));
      assert.ok(H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player2'), pid(room, 'Player3')] }).ok);
      assert.ok(H(room, { type: 'identifyRole', roleId: 'executioner', playerIds: [pid(room, 'Player1')] }).ok);
      const exe = P(room, 'Player1');
      assert.ok(exe.target, 'target known when the Executioner wakes');
      assert.equal(room.players.find((q) => q.id === exe.target).roleId, 'villager');
    }
  });

  test('identifyRole only on night 1', () => {
    const room = blindGame();
    H(room, { type: 'startNight' });
    for (const [n, r] of [['Player1', 'mafia'], ['Player2', 'doctor'], ['Player3', 'cop']]) H(room, { type: 'identifyRole', roleId: r, playerIds: [pid(room, n)] });
    H(room, { type: 'submitNight', actions: {} });
    H(room, { type: 'startNight' });
    assert.ok(H(room, { type: 'identifyRole', roleId: 'cop', playerIds: [pid(room, 'Player4')] }).error);
  });

  test('claim flow still demands every role before night', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'], mode: 'cards', cardFlow: 'claim' });
    H(room, { type: 'deal' });
    assert.ok(H(room, { type: 'startNight' }).error);
  });

  test('player views before identification expose no roles and no tokens/hostKey', () => {
    const room = blindGame();
    H(room, { type: 'startNight' });
    for (const p of room.players) {
      const v = viewForPlayer(room, p.id);
      const s = JSON.stringify(v);
      assert.equal(v.me.role, null);
      assert.ok(v.players.every((q) => q.role === null));
      assert.ok(!s.includes(room.hostKey));
      for (const q of room.players) assert.ok(!s.includes(q.token));
      assert.ok(!/"claimed"|"map"/.test(s));
    }
  });

  test('identified players see their own role; others still see nothing', () => {
    const room = blindGame();
    H(room, { type: 'startNight' });
    H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player1')] });
    assert.equal(viewForPlayer(room, pid(room, 'Player1')).me.role.id, 'mafia');
    assert.equal(viewForPlayer(room, pid(room, 'Player2')).players.find((q) => q.name === 'Player1').role, null);
  });

  test('claim flow exposes no deckKey; app mode neither', () => {
    const room = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager'], 'cards', 'fixed', 'claim');
    assert.equal(viewForPlayer(room, room.players[0].id).deckKey, null);
    const app = dealt(['mafia', 'doctor', 'cop', 'villager', 'villager'], 'app');
    assert.equal(viewForPlayer(app, app.players[0].id).deckKey, null);
  });

  test('blind deckKey (the card legend) lists roles by card but never by player', () => {
    const room = blindGame();
    H(room, { type: 'startNight' });
    H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player1')] });
    const v = viewForPlayer(room, pid(room, 'Player2'));
    const s = JSON.stringify(v.deckKey);
    for (const q of room.players) assert.ok(!s.includes(q.id) && !s.includes(q.name));
    assert.ok(!/"deck"/.test(JSON.stringify(v)));
  });

  test('blind game plays to the end', () => {
    const room = blindGame(['mafia', 'villager', 'villager', 'villager', 'villager']);
    H(room, { type: 'startNight' });
    H(room, { type: 'identifyRole', roleId: 'mafia', playerIds: [pid(room, 'Player1')] });
    assert.ok(H(room, { type: 'submitNight', actions: { 'meeting:mafia': { targets: [pid(room, 'Player2')] } } }).ok);
    assert.equal(P(room, 'Player2').alive, false);
    assert.ok(H(room, { type: 'condemn', playerId: pid(room, 'Player1') }).ok);
    assert.equal(room.winner.side, 'town');
  });
});

// ---------- custom roles ----------
describe('custom roles', () => {
  test('a disguised Mafia teammate is listed as what they think they are, so a twin never learns the real role', () => {
    const { room } = lobby(names(8));
    const sleeper = { id: 'c_sleep1', name: 'Deep Sleeper', alignment: 'mafia', meeting: 'mafia', seesAs: 'villager', blurb: 'Secretly Mafia.' };
    assert.ok(H(room, { type: 'setCustomRoles', roles: [sleeper] }).ok);
    assert.ok(H(room, { type: 'setConfig', roles: ['c_sleep1', 'c_sleep1', 'mafia', 'villager', 'villager', 'villager', 'villager', 'cop'] }).ok);
    assert.ok(H(room, { type: 'deal' }).ok);
    const twins = room.players.filter((p) => p.roleId === 'c_sleep1');
    for (const me of twins) {
      const v = viewForPlayer(room, me.id);
      assert.equal(v.me.role.id, 'villager');
      const dump = JSON.stringify(v);
      assert.ok(!dump.includes('Deep Sleeper') && !dump.includes('c_sleep1'), dump);
      const twin = v.me.team.find((t) => twins.some((p) => p.id === t.id));
      assert.equal(twin.role.id, 'villager');
      assert.equal(v.me.team.find((t) => P(room, t.name).roleId === 'mafia').role.id, 'mafia', 'undisguised teammates show as usual');
    }
  });

  test('a disguised custom role is woken by the name it thinks it has, never its real one', () => {
    const r = sanitizeRole({ id: 'c_dis01', name: 'Secret Seer', seesAs: 'cop', action: { type: 'investigate', check: 'role', prompt: 'Secret Seer, wake up.' } });
    assert.equal(r.action.prompt, ROLE_BY_ID.cop.action.prompt);
    assert.equal(sanitizeRole({ id: 'c_dis02', name: 'Hidden', seesAs: 'villager', action: { type: 'protect' } }).action.prompt, 'Villager, wake up.');
    assert.equal(sanitizeRole({ id: 'c_dis03', name: 'Open', action: { type: 'protect' } }).action.prompt, 'Open, wake up.');
  });

  test('sanitizeRole rejects bad ids and missing names', () => {
    for (const bad of [null, undefined, 5, 'x', {}, { id: 'c_ab', name: 'x' }, { id: 'C_abcd', name: 'x' }, { id: 'c_abcd' },
      { id: 'c_abcd', name: '   ' }, { id: 'c_abcd', name: '<>' }, { id: 'c_abcdefghijklm', name: 'x' }, { id: 'cop', name: 'Fake Cop' },
      { id: 'c_ab-cd', name: 'x' }]) {
      assert.equal(sanitizeRole(bad), null, JSON.stringify(bad));
    }
    assert.ok(sanitizeRole({ id: 'c_abcd', name: 'Okay' }));
  });

  test('clamps lengths', () => {
    const r = sanitizeRole({
      id: 'c_len01', name: 'n'.repeat(100), blurb: 'b'.repeat(1000), emoji: 'abcdefghij', day: 'd'.repeat(500),
      onDeath: 'x'.repeat(500), onCondemn: 'y'.repeat(500), night1: 'z'.repeat(500), weight: 99,
      action: { type: 'protect', prompt: 'p'.repeat(500), uses: 99 },
    });
    assert.ok(r.name.length <= 24);
    assert.ok(r.blurb.length <= 200);
    assert.ok(r.emoji.length <= 4);
    assert.ok(r.day.length <= 120 && r.onDeath.length <= 120 && r.onCondemn.length <= 120 && r.night1.length <= 120);
    assert.equal(r.weight, 1, 'out-of-range weight falls back to 1');
    assert.ok(r.action.prompt.length <= 120);
    assert.equal(r.action.uses, Infinity, 'out-of-range uses is unlimited');
    assert.equal(sanitizeRole({ id: 'c_w3aa', name: 'W', weight: 3 }).weight, 3);
    assert.equal(sanitizeRole({ id: 'c_w3ab', name: 'W', action: { type: 'kill', uses: 2 } }).action.uses, 2);
  });

  test('strips < and > (and control chars) from text', () => {
    const r = sanitizeRole({
      id: 'c_xss01', name: '<img src=x onerror=1>Bob', blurb: '<script>alert(1)</script>', emoji: '<b>', day: '<i>d</i>',
      onDeath: '>>x<<', onCondemn: '<c>', night1: '<n>', action: { type: 'protect', prompt: '<p>go</p>' },
    });
    const dump = JSON.stringify(r);
    assert.ok(!/[<>]/.test(dump), dump);
    assert.ok(!/[\u0000-\u001f]/.test(sanitizeRole({ id: 'c_ctl01', name: 'a\u0000b\nc' }).name));
  });

  test('never lets a custom role override a built-in id', () => {
    const before = ROLE_BY_ID.cop;
    registerRoles([{ id: 'cop', name: 'Evil', alignment: 'mafia' }, { id: 'mafia', name: 'Nope' }, { id: '__proto__', name: 'x' }]);
    assert.equal(ROLE_BY_ID.cop, before);
    assert.equal(ROLE_BY_ID.cop.name, 'Cop');
    assert.equal(ROLE_BY_ID.mafia.name, 'Mafia');
    const room = newRoom('R', 'k');
    reduce(room, HOST, { type: 'setCustomRoles', roles: [{ id: 'cop', name: 'Evil' }] });
    assert.deepEqual(room.config.customRoles, []);
    assert.equal(ROLE_BY_ID.cop.name, 'Cop');
  });

  test('custom role cannot claim a custom seesAs, cannot be mafia-meeting unless mafia-aligned', () => {
    const r = sanitizeRole({ id: 'c_sees1', name: 'S', seesAs: 'c_other1', meeting: 'mafia', alignment: 'town' });
    assert.equal(r.seesAs, undefined);
    assert.equal(r.meeting, null);
    const m = sanitizeRole({ id: 'c_sees2', name: 'S', seesAs: 'cop', meeting: 'mafia', alignment: 'mafia' });
    assert.equal(m.seesAs, 'cop');
    assert.equal(m.meeting, 'mafia');
    assert.equal(sanitizeRole({ id: 'c_sees3', name: 'S', alignment: 'bogus' }).alignment, 'town');
  });

  test('setCustomRoles is host only and lobby/dealt only', () => {
    const { room, tokens } = lobby(names(5));
    assert.ok(reduce(room, { playerId: tokens.Player1.playerId }, { type: 'setCustomRoles', roles: [] }).error);
    assert.ok(reduce(room, ANON, { type: 'setCustomRoles', roles: [] }).error);
    H(room, { type: 'setConfig', roles: ['mafia', 'doctor', 'cop', 'villager', 'villager'] });
    H(room, { type: 'deal' }); H(room, { type: 'startNight' });
    assert.ok(H(room, { type: 'setCustomRoles', roles: [] }).error);
  });

  test('registers roles and removes stale custom ids from config.roles', () => {
    const { room } = lobby(names(5));
    const a = { id: 'c_keep1', name: 'Keeper', alignment: 'town' };
    const b = { id: 'c_gone1', name: 'Goner', alignment: 'town' };
    assert.ok(H(room, { type: 'setCustomRoles', roles: [a, b, { id: 'bad', name: 'x' }, 'junk'] }).ok);
    assert.equal(room.config.customRoles.length, 2);
    assert.ok(ROLE_BY_ID.c_keep1 && ROLE_BY_ID.c_gone1);
    H(room, { type: 'setConfig', roles: ['mafia', 'c_keep1', 'c_gone1', 'villager', 'cop'] });
    assert.deepEqual(room.config.roles, ['mafia', 'c_keep1', 'c_gone1', 'villager', 'cop']);
    H(room, { type: 'setCustomRoles', roles: [a] });
    assert.deepEqual(room.config.roles, ['mafia', 'c_keep1', 'villager', 'cop']);
    assert.deepEqual(room.config.customRoles.map((r) => r.id), ['c_keep1']);
    H(room, { type: 'setCustomRoles', roles: 'not-an-array' });
    assert.deepEqual(room.config.customRoles, []);
    assert.deepEqual(room.config.roles, ['mafia', 'villager', 'cop']);
  });

  test('caps the number of custom roles at 40', () => {
    const { room } = lobby(names(5));
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `c_m${String(i).padStart(3, '0')}`, name: `R${i}` }));
    H(room, { type: 'setCustomRoles', roles: many });
    assert.equal(room.config.customRoles.length, 40);
  });

  test('a custom role with action {type:protect} appears in nightScript', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setCustomRoles', roles: [{ id: 'c_prot1', name: 'Medic', alignment: 'town', action: { type: 'protect', prompt: 'Medic, who?' } }] });
    P(room, 'Player1').roleId = 'c_prot1';
    P(room, 'Player2').roleId = 'mafia';
    room.phase = 'night'; room.night = 1;
    const step = nightScript(room).find((s) => s.key === `act:${pid(room, 'Player1')}`);
    assert.ok(step);
    assert.equal(step.type, 'protect');
    assert.equal(step.prompt, 'Medic, who?');
    // and it functions: protects a target from the mafia
    P(room, 'Player3').roleId = 'villager'; P(room, 'Player4').roleId = 'villager'; P(room, 'Player5').roleId = 'villager';
    reduce(room, HOST, { type: 'submitNight', actions: {
      'meeting:mafia': { targets: [pid(room, 'Player3')] }, [`act:${pid(room, 'Player1')}`]: { targets: [pid(room, 'Player3')] } } });
    assert.equal(P(room, 'Player3').alive, true);
  });

  test('custom role survives a deal and shows up in views', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setCustomRoles', roles: [{ id: 'c_view1', name: 'Viewer', emoji: '👀', alignment: 'town', blurb: 'Sees things' }] });
    H(room, { type: 'setConfig', roles: ['mafia', 'c_view1', 'cop', 'villager', 'villager'] });
    assert.ok(H(room, { type: 'deal' }).ok);
    const holder = room.players.find((p) => p.roleId === 'c_view1');
    assert.equal(viewForPlayer(room, holder.id).me.role.name, 'Viewer');
    const other = room.players.find((p) => p.roleId === 'cop');
    assert.ok(!JSON.stringify(viewForPlayer(room, other.id)).includes('c_view1'));
  });

  test('custom role in a mafia meeting joins meeting:mafia', () => {
    const { room } = lobby(names(5));
    H(room, { type: 'setCustomRoles', roles: [{ id: 'c_maf01', name: 'Thug', alignment: 'mafia', meeting: 'mafia' }] });
    P(room, 'Player1').roleId = 'c_maf01'; P(room, 'Player2').roleId = 'mafia';
    for (const n of ['Player3', 'Player4', 'Player5']) P(room, n).roleId = 'villager';
    room.phase = 'night'; room.night = 1;
    const m = nightScript(room).find((s) => s.key === 'meeting:mafia');
    assert.equal(m.actors.length, 2);
    assert.equal(factionOf('c_maf01'), 'mafia');
  });
});

void FULL_DECK; void MIN_PLAYERS;
