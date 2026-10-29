// Mixed seating: seat actions, takeover, the no-leak rules for seats on the host phone, the pass-the-phone queue and gate,
// and the Seating step's effect on dealing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost, viewForPlayer, messagesFor } from '../public/js/room.js';
import { ROLES } from '../public/js/roles.js';
import { whereOf, WHERE_TEXT, passSeats, maskedLocal, nextUnseen, loadPass, savePass } from '../public/js/seat-model.js';
import { ALLOW_SEAT_TAKEOVER } from '../public/js/config-defaults.js';
import { seatingOf, seatingAuto } from '../public/js/setup-store.js';

const HOST = { host: true };
const ROLES6 = ['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager'];
// Three seats joined on phones (Ana, Cal, Dee), two on the host phone (Ben, Gil) and two more phones, dealt in app mode.
function mixed({ deal = true } = {}) {
  const room = newRoom('SEATS', 'hostkey');
  const tokens = {};
  for (const n of ['Ana', 'Cal', 'Dee', 'Eve', 'Fay']) { const r = reduce(room, { anon: true }, { type: 'join', name: n }); tokens[n] = r.data; }
  reduce(room, HOST, { type: 'addPlayers', names: ['Ben', 'Gil'] });
  reduce(room, HOST, { type: 'setConfig', mode: 'app', roles: ROLES6 });
  if (deal) assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
  return { room, tokens, id: (n) => room.players.find((p) => p.name === n).id };
}
const connectedAll = (room) => new Set(room.players.filter((p) => !p.offline).map((p) => p.id));

test('where a seat plays: this phone, their phone, reconnecting, open', () => {
  assert.equal(whereOf({ offline: true }), 'local');
  assert.equal(whereOf({ offline: false, connected: true }), 'remote');
  assert.equal(whereOf({ offline: false, connected: false }), 'dropped');
  assert.equal(whereOf({ offline: false, open: true, connected: false }), 'open');
  assert.deepEqual(Object.values(WHERE_TEXT), ['This phone', 'On their phone', 'Reconnecting…', 'Open seat']);
  const { room } = mixed({ deal: false });
  const v = viewForHost(room, new Set([room.players[0].id]));
  assert.deepEqual(v.players.map((p) => whereOf(p)), ['remote', 'dropped', 'dropped', 'dropped', 'dropped', 'local', 'local']);
});

test('seatWhere: move to this phone keeps the role and cuts off the old phone', () => {
  const { room, tokens, id } = mixed();
  const role = room.players.find((p) => p.name === 'Cal').roleId;
  const before = room.players.find((p) => p.name === 'Cal').token;
  assert.ok(reduce(room, HOST, { type: 'seatWhere', playerId: id('Cal'), where: 'local' }).ok);
  const cal = room.players.find((p) => p.name === 'Cal');
  assert.equal(cal.offline, true); assert.equal(cal.roleId, role); assert.notEqual(cal.token, before); assert.notEqual(cal.token, tokens.Cal.token);
  // the socket that still holds the seat gets nothing of the game
  assert.deepEqual(messagesFor(room, { who: 'player', playerId: id('Cal') }, connectedAll(room))[0].view, { kind: 'gone' });
  assert.equal(reduce(room, { playerId: id('Ana') }, { type: 'seatWhere', playerId: id('Ana'), where: 'local' }).error, 'Host only.');
  assert.ok(reduce(room, HOST, { type: 'seatWhere', playerId: 'nope', where: 'local' }).error);
});

test('release for takeover, then a join with the same name takes the seat and its secret, in any phase', () => {
  assert.equal(ALLOW_SEAT_TAKEOVER, true);
  const { room, id } = mixed();
  const gil = room.players.find((p) => p.name === 'Gil'); const role = gil.roleId; const oldTok = gil.token;
  assert.ok(reduce(room, HOST, { type: 'seatWhere', playerId: id('Gil'), where: 'open' }).ok);
  assert.equal(gil.offline, false); assert.equal(gil.open, true);
  assert.equal(viewForHost(room).players.find((p) => p.name === 'Gil').connected, false);
  assert.equal(reduce(room, { anon: true }, { type: 'join', name: 'Nobody' }).error, 'The game has already started.');
  const r = reduce(room, { anon: true }, { type: 'join', name: 'gil' });
  assert.ok(r.ok); assert.equal(r.data.playerId, gil.id); assert.notEqual(r.data.token, oldTok);
  assert.equal(gil.open, false); assert.equal(gil.roleId, role);
  assert.ok(viewForPlayer(room, gil.id).me.role, 'the new phone gets the seat’s own role');
  assert.equal(reduce(room, { anon: true }, { type: 'join', name: 'Gil' }).error, 'The game has already started.', 'a taken seat is not open again');
});

test('a released seat is open, not on a phone: the old phone sees nothing', () => {
  const { room, id } = mixed();
  reduce(room, HOST, { type: 'seatWhere', playerId: id('Ana'), where: 'open' });
  assert.deepEqual(messagesFor(room, { who: 'player', playerId: id('Ana') }, connectedAll(room))[0].view, { kind: 'gone' });
  assert.equal(viewForHost(room, connectedAll(room)).players.find((p) => p.name === 'Ana').connected, false);
});

test('no leak: connected players never receive a seat on the host phone’s role', () => {
  for (let g = 0; g < 40; g++) {
    const { room } = mixed();
    const locals = room.players.filter((p) => p.offline);
    for (const viewer of room.players.filter((p) => !p.offline)) {
      const v = viewForPlayer(room, viewer.id, connectedAll(room));
      assert.ok(v.players.every((p) => p.role === null), 'no role for anyone in the player list while the game is on');
      for (const l of locals) {
        const t = v.me.team.find((x) => x.id === l.id);
        // only a teammate in the same meeting (the Mafia) is told, exactly as for a seat on a phone
        if (t) assert.ok(ROLES.find((r) => r.id === viewer.roleId).meeting && ROLES.find((r) => r.id === viewer.roleId).meeting === ROLES.find((r) => r.id === l.roleId).meeting);
        if (!t) assert.ok(!JSON.stringify(v.me).includes(`"${l.name}"`), 'a local seat is not named in a phone’s private data');
      }
    }
    // the host's view of a local seat is the host's own phone: it is masked on screen while dealt (see maskedLocal)
    const hv = viewForHost(room, connectedAll(room));
    assert.ok(hv.players.filter((p) => p.offline).every((p) => maskedLocal(hv, p)));
    assert.ok(hv.players.filter((p) => !p.offline).every((p) => !maskedLocal(hv, p)));
  }
});

test('pass queue: only local seats with a role, never a phone seat; nothing in it names a role', () => {
  const { room } = mixed();
  const hv = viewForHost(room, connectedAll(room));
  const seats = passSeats(hv);
  assert.deepEqual(seats.map((p) => p.name), ['Ben', 'Gil']);
  assert.ok(!Object.keys(seats[0]).includes('x'));
  room.phase = 'night'; assert.deepEqual(passSeats(viewForHost(room)), [], 'the pass is a dealt-screen step');
  const cards = mixed({ deal: false }).room; cards.config.mode = 'cards';
  assert.deepEqual(passSeats(viewForHost(cards)), []);
});

test('nextUnseen walks the seats in order, skips ones that looked, and ends', () => {
  const seats = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextUnseen(seats, [])?.id, 'a');
  assert.equal(nextUnseen(seats, ['a'])?.id, 'b');
  assert.equal(nextUnseen(seats, ['a'], 'b')?.id, 'c');
  assert.equal(nextUnseen(seats, ['b'], 'c')?.id, 'a', 'wraps once');
  assert.equal(nextUnseen(seats, ['a', 'b', 'c'], 'c'), null);
  assert.equal(nextUnseen(seats, ['a', 'b'], 'c'), null, 'the seat just done is never offered again');
});

test('pass state is kept per room and game, holds seat ids only, and a reload comes back to a gate', () => {
  const m = new Map(); const storage = { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) };
  const st = loadPass(storage, 'ROOM', 1);
  assert.deepEqual(st, { gameNo: 1, seen: [], id: null, stage: null, chain: false });
  st.seen.push('p1'); st.id = 'p2'; st.stage = 'card'; st.chain = true; savePass(storage, 'ROOM', st);
  const back = loadPass(storage, 'ROOM', 1);
  assert.deepEqual(back.seen, ['p1']); assert.equal(back.id, 'p2'); assert.equal(back.stage, 'gate', 'never restored onto a card');
  assert.deepEqual(loadPass(storage, 'ROOM', 2).seen, [], 'a new game starts fresh');
  assert.ok(![...m.values()].some((v) => ROLES.some((r) => v.includes(`"${r.name}"`))), 'no role text is stored');
  assert.deepEqual(loadPass({ get: () => 'not json', set() {} }, 'ROOM', 1).seen, []);
});

test('the Seating step: auto choice from who joined, and what each choice means at the deal', () => {
  const n = (offline) => ({ offline });
  assert.equal(seatingAuto([]), 'one');
  assert.equal(seatingAuto([n(false), n(false)]), 'own');
  assert.equal(seatingAuto([n(false), n(true)]), 'mixed');
  assert.equal(seatingAuto([n(true), n(true)]), 'one');
  assert.equal(seatingOf({ seating: 'own' }, [n(true)]), 'own', 'the host’s choice wins');
});

test('One phone at the deal: every seat is moved to the host phone first, and then every seat is in the pass queue', () => {
  const { room } = mixed({ deal: false });
  for (const p of room.players) if (!p.offline) assert.ok(reduce(room, HOST, { type: 'seatWhere', playerId: p.id, where: 'local' }).ok); // what setupDeal2 sends for One phone
  assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
  const hv = viewForHost(room, new Set());
  assert.equal(passSeats(hv).length, 7);
  assert.ok(hv.players.every((p) => whereOf(p) === 'local'));
});

test('Own phones with a seat added by name never blocks: the deal goes through and that seat is in the pass queue', () => {
  const { room } = mixed();
  assert.equal(room.phase, 'dealt');
  assert.deepEqual(passSeats(viewForHost(room, connectedAll(room))).map((p) => p.name), ['Ben', 'Gil']);
  assert.ok(reduce(room, HOST, { type: 'startNight' }).ok, 'a local seat that never looked does not stop the night');
});

test('moving a dropped player’s seat in the middle of a game keeps the game going', () => {
  const { room, id } = mixed();
  assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
  assert.ok(reduce(room, HOST, { type: 'seatWhere', playerId: id('Eve'), where: 'local' }).ok);
  assert.equal(room.phase, 'night');
  assert.equal(room.players.find((p) => p.name === 'Eve').offline, true);
});

// ---- what the host screen draws: strings only, so no browser is needed ----
const { passLayer, passPanel, passFront, seatRows, seatSheet } = await import('../public/js/seating.js');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const roleWords = (h) => ROLES.filter((r) => new RegExp(`\\b${r.name}\\b`).test(h)).map((r) => r.name);

test('host DOM: the gate, the card back and the panel hold no role text; the held card holds exactly one role', () => {
  for (let g = 0; g < 30; g++) {
    const { room, id } = mixed();
    const hv = viewForHost(room, connectedAll(room));
    const [ben, gil] = [id('Ben'), id('Gil')];
    const gate = passLayer(hv, { id: ben, stage: 'gate' });
    assert.deepEqual(roleWords(text(gate)), [], 'gate has no role');
    assert.ok(!/pass-role|pass-front|rcard-front|role-chip| rc /.test(gate));
    assert.match(text(gate), /Hand this phone to\s+Ben/); assert.match(gate, /Skip for now/); assert.match(gate, /I’m Ben/);
    const card = passLayer(hv, { id: ben, stage: 'card' });
    assert.deepEqual(roleWords(text(card)), [], 'the card back names no role');
    assert.match(card, /data-pass-face[^>]*><\/span>/, 'nothing is drawn on the card until it is held');
    assert.match(card, /Hide and pass back/);
    const panel = passPanel(hv, []);
    assert.deepEqual(roleWords(text(panel)), [], 'the panel lists seats and no role');
    assert.ok(panel.includes('Ben') && panel.includes('Gil') && !panel.includes('Ana'));
    // the same markup for every seat and role: only the name differs
    assert.equal(passLayer(hv, { id: ben, stage: 'gate' }).replaceAll('Ben', 'X').replace(/data-id="[^"]*"/g, ''), passLayer(hv, { id: gil, stage: 'gate' }).replaceAll('Gil', 'X').replace(/data-id="[^"]*"/g, '').replace(/>G</, '>B<'));
    // held: one seat's role only
    const front = passFront(hv, ben);
    assert.equal((front.match(/class="pass-role"/g) || []).length, 1);
    const gilRole = room.players.find((p) => p.id === gil).roleId, benRole = room.players.find((p) => p.id === ben).roleId;
    if (gilRole !== benRole) assert.ok(!front.includes(`>${ROLES.find((r) => r.id === gilRole).name}<`));
  }
});

test('host DOM: seat rows say where each seat plays, and the seat sheet offers move and release', () => {
  const { room, id } = mixed({ deal: false });
  const hv = viewForHost(room, new Set([room.players[0].id]));
  const rows = text(seatRows(hv));
  assert.match(rows, /This phone/); assert.match(rows, /On their phone/); assert.match(rows, /Reconnecting…/);
  const sheet = (n, extra = {}) => seatSheet(hv, { id: id(n), mode: 'menu', ...extra });
  assert.match(sheet('Ben'), /Release for takeover/); assert.ok(!/Move to this phone/.test(sheet('Ben')));
  assert.match(sheet('Cal'), /Move to this phone/); assert.match(sheet('Cal', { mode: 'pull' }), /Move Cal to this phone\?/);
  assert.match(sheet('Cal'), /Remove Cal/, 'removing is for the lobby');
  room.config.roles = ROLES6; reduce(room, HOST, { type: 'deal' });
  assert.ok(!/Remove /.test(seatSheet(viewForHost(room, new Set()), { id: id('Cal'), mode: 'menu' })), 'no removing once dealt');
});
