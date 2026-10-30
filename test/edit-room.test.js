// Changing an earlier step on the room server (UNDO-PLAN.md section 4, PR E-2): the real Durable Object with fake
// storage and three phones (host + two players). A pause never shows an unconfirmed result on a player phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true } : n(s, c); }`), import.meta.url);
const { Room } = await import('../src/worker.js');

const json = (x) => JSON.stringify(x);
function fakeCtx(store = new Map()) {
  const sockets = [];
  return { store, sockets, ctx: {
    storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, setAlarm: async () => {}, deleteAlarm: async () => {}, deleteAll: async () => { store.clear(); } },
    blockConcurrencyWhile: (f) => f(), getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws),
  } };
}
const sock = () => ({ sent: [], att: null, send(m) { this.sent.push(JSON.parse(m)); }, close() {}, serializeAttachment(a) { this.att = a; }, deserializeAttachment() { return this.att; } });
const send = (room, ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
const last = (ws, type) => ws.sent.filter((m) => m.type === type).at(-1);
const view = (ws) => last(ws, 'view')?.view;
const alive = (v) => v.players.filter((p) => p.alive).map((p) => p.id).sort().join(',');

// Five seats: Ann and Ben on their own phones, three on the host phone. Fixed roles. Night 1 the Mafia kill one
// villager, Day 1 the town votes out another, then night 2 begins.
async function played(f = fakeCtx(), Kind = Room) {
  const room = new Kind(f.ctx, {}); await room.ready;
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ code: 'EDITXX', hostKey: 'hk' }) }));
  const host = sock(), a = sock(), b = sock(); f.sockets.push(host, a, b);
  await send(room, host, { type: 'hello', hostKey: 'hk' });
  await send(room, a, { type: 'hello', join: 'Ann' }); await send(room, b, { type: 'hello', join: 'Ben' });
  await send(room, host, { type: 'addPlayers', names: ['Cy', 'Dee', 'Eve'] });
  await send(room, host, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'villager', 'villager', 'villager'], rules: { firstNightKill: true } });
  await send(room, host, { type: 'deal' });
  const rev = () => last(host, 'view').rev;
  const vill = room.room.players.filter((p) => p.roleId === 'villager');
  await send(room, host, { type: 'startNight' });
  const k = view(host).script.find((s) => s.type === 'kill').key;
  await send(room, host, { type: 'submitNight', actions: { [k]: { targets: [vill[0].id] } }, n: 1 });
  const nightId = room.log.els.find((s) => s.m.type === 'submitNight').id;
  await send(room, host, { type: 'condemn', playerId: vill[1].id });
  if (room.room.phase !== 'over') await send(room, host, { type: 'startNight' });
  assert.equal(room.room.phase, 'night', `the game goes on (${room.room.phase})`);
  return { f, room, host, a, b, rev, vill, k, nightId };
}

test('three phones: a change that breaks a later step pauses; players keep the confirmed game; a fix resumes on every phone', async () => {
  const { room, host, a, b, rev, vill, k, nightId } = await played();
  const confirmed = { a: alive(view(a)), b: alive(view(b)) };
  const toasts = a.sent.filter((m) => m.type === 'changed').length;
  // Night 1: the Mafia now kill the player the town voted out on Day 1. That vote no longer fits.
  await send(room, host, { type: 'edit', id: nightId, msg: { type: 'submitNight', actions: { [k]: { targets: [vill[1].id] } }, n: 1 }, rev: rev() });
  const hold = last(host, 'view').hist.hold;
  assert.ok(hold, 'the host view carries the pause');
  assert.equal(hold.type, 'condemn'); assert.deepEqual(hold.why, ['A player it picks can’t be picked now.']);
  assert.ok(hold.choices.includes('pick') && hold.choices.includes('drop'));
  assert.equal(last(host, 'changed').label, `Paused: ${hold.label}`);
  assert.ok(last(host, 'view').tail?.events.at(-1).m.type === 'edit', 'the host view carries the new event');
  for (const [ws, was] of [[a, confirmed.a], [b, confirmed.b]]) {
    const m = last(ws, 'view');
    assert.equal(m.paused, true, 'player views say paused');
    assert.equal(alive(m.view), was, 'no unconfirmed death on a player phone');
    assert.equal(m.view.phase, 'night');
  }
  assert.equal(a.sent.filter((m) => m.type === 'changed').length, toasts, 'no "changed" toast while paused');
  assert.equal(last(a, 'paused')?.error, 'The host is fixing an earlier step. Hold on.', 'players are told by toast too');
  assert.equal(last(host, 'paused'), undefined);
  // While paused: player moves and joins are refused; the host can't play on.
  await send(room, a, { type: 'chat', channel: 'graveyard', text: 'hi' });
  assert.equal(last(a, 'error').error, 'The host is fixing an earlier step. Hold on.');
  const c = sock(); room.ctx.getWebSockets().push(c); await send(room, c, { type: 'hello', join: 'Late' });
  assert.equal(last(c, 'error').error, 'The host is fixing an earlier step. Hold on.');
  await send(room, host, { type: 'startDay', rev: rev() });
  assert.equal(last(host, 'error').error, 'Fix the flagged step first.');
  // Fix: Day 1 votes out the other villager instead.
  await send(room, host, { type: 'edit', id: hold.id, msg: { type: 'condemn', playerId: vill[2].id }, rev: rev() });
  assert.equal(last(host, 'view').hist.hold, undefined);
  assert.equal(last(host, 'changed').label, 'Changed an earlier step');
  for (const ws of [a, b]) {
    const m = last(ws, 'view');
    assert.equal(m.paused, undefined); assert.equal(alive(m.view), alive(view(host)), 'players get the fixed game');
    assert.ok(!m.view.players.find((p) => p.id === vill[1].id).alive && !m.view.players.find((p) => p.id === vill[2].id).alive);
    assert.ok(m.view.players.find((p) => p.id === vill[0].id).alive, 'the first night victim is alive again');
  }
  assert.equal(a.sent.filter((m) => m.type === 'changed').length, toasts + 1, 'every phone is told once');
  assert.equal(b.sent.filter((m) => m.type === 'changed').length, toasts + 1);
});

test('a change needs the host and the current rev; a same-value change records nothing', async () => {
  const { room, host, a, rev, vill, k, nightId } = await played();
  const len = room.log.events.length; const msg = { type: 'submitNight', actions: { [k]: { targets: [vill[1].id] } }, n: 1 };
  await send(room, a, { type: 'edit', id: nightId, msg, rev: rev() });
  assert.equal(last(a, 'error').error, 'Host only.');
  await send(room, host, { type: 'edit', id: nightId, msg, rev: rev() - 1 });
  assert.equal(last(host, 'error').error, 'The game moved on. Showing the latest.');
  await send(room, host, { type: 'edit', id: nightId, msg });
  assert.equal(last(host, 'error').error, 'The game moved on. Showing the latest.', 'no rev, no change');
  await send(room, host, { type: 'edit', id: nightId, msg: room.log.els.find((s) => s.id === nightId).m, rev: rev() });
  assert.equal(last(host, 'error').error, 'That is already the choice there.');
  await send(room, host, { type: 'drop', id: nightId, rev: rev() });
  assert.equal(last(host, 'error').error, 'Only the flagged step can be removed.');
  assert.equal(room.log.events.length, len, 'nothing recorded');
});

test('a pause survives a cold start; Undo of the change gives every phone the game as it was', async () => {
  const f = fakeCtx(); const { room, host, a, rev, vill, k, nightId } = await played(f);
  const before = json(room.room); const shownA = json(view(a));
  await send(room, host, { type: 'edit', id: nightId, msg: { type: 'submitNight', actions: { [k]: { targets: [vill[1].id] } }, n: 1 }, rev: rev() });
  const hold = last(host, 'view').hist.hold;
  const again = new Room(f.ctx, {}); await again.ready;
  assert.equal(json(again.room), json(room.room)); assert.equal(json(again.log.holdInfo()), json(hold), 'same pause after a cold start');
  const h2 = sock(); f.sockets.push(h2); await send(again, h2, { type: 'hello', hostKey: 'hk' });
  assert.equal(json(last(h2, 'view').hist.hold), json(hold), 'a second host phone sees the pause');
  await send(again, h2, { type: 'undo', rev: last(h2, 'view').rev });
  assert.equal(last(h2, 'stepped').label, 'A change to an earlier step');
  assert.equal(json(again.room), before, 'Undo gives back the game exactly');
  assert.equal(last(a, 'view').paused, undefined);
  assert.equal(json(view(a)), shownA, 'the player phone shows what it showed before');
});

test('a change that ends the game earlier: players see the end only once the host confirms it, and are told then', async () => {
  const { room, host, a, b, rev } = await played();
  const mafia = room.room.players.find((p) => p.roleId === 'mafia');
  const vote = room.log.els.find((s) => s.m.type === 'condemn');
  const overs = a.sent.filter((m) => m.type === 'gameOver').length; const shownA = alive(view(a));
  // Day 1 now votes out the Mafia: the town wins there, so the start of night 2 no longer fits.
  await send(room, host, { type: 'edit', id: vote.id, msg: { type: 'condemn', playerId: mafia.id }, rev: rev() });
  const hold = last(host, 'view').hist.hold;
  assert.equal(hold.type, 'startNight'); assert.ok(hold.choices.includes('cut'), 'End the game here is offered');
  assert.equal(room.room.phase, 'over');
  assert.equal(view(a).phase, 'night', 'players still see the confirmed game'); assert.equal(alive(view(a)), shownA);
  assert.equal(a.sent.filter((m) => m.type === 'gameOver').length, overs, 'no ending announced while paused');
  await send(room, host, { type: 'cut', id: hold.id, rev: rev() });
  assert.equal(last(host, 'view').hist.hold, undefined); assert.equal(room.room.phase, 'over'); assert.equal(room.room.winner.side, 'town');
  for (const ws of [a, b]) {
    assert.equal(view(ws).phase, 'over'); assert.equal(last(ws, 'view').paused, undefined);
    assert.equal(ws.sent.filter((m) => m.type === 'gameOver').length, overs + 1, 'the ending is announced once, on confirm');
    assert.equal(last(ws, 'changed')?.type, 'changed');
  }
});

test('the host phone can fetch the current game\'s events', async () => {
  const { room, host, a } = await played();
  await send(room, host, { type: 'log', since: 0 });
  const m = last(host, 'log');
  assert.equal(m.cursor, room.log.cursor); assert.equal(m.rev, room.log.rev);
  assert.ok(m.from > 0, 'starts after the deal, not at the lobby');
  assert.equal(room.log.events[m.from - 1].m.type, 'deal');
  assert.equal(json(m.events), json(room.log.events.slice(m.from)));
  await send(room, a, { type: 'log', since: 0 });
  assert.equal(last(a, 'error').error, 'Host only.');
});

// Random host moves, changes, fixes, Undo, Redo and player moves on three phones. After every message: a player
// phone shows the last confirmed game (paused exactly while the host is paused), the host phone shows the room, and a
// cold start from storage gives the same room and the same pause.
import { legalActions } from './kit/mafia-props.mjs';
import { altMsg, FAMILY } from './kit/mafia-edit-props.mjs';
import { rng as simRng } from '../scripts/sim-lib.mjs';
import { viewForPlayer, viewForHost } from '../public/js/room.js';
const RUNS = Number(process.env.EDIT_ROOM_RUNS || 12);
test(`random changes, fixes, undo and player moves on three phones keep every phone on confirmed results (${RUNS} runs)`, async () => {
  let paused = 0, changes = 0;
  for (let g = 0; g < RUNS; g++) {
    const R = simRng(4242 + g); const f = fakeCtx();
    const { room, host, a, b, rev } = await played(f);
    for (let s = 0; s < 70; s++) {
      const L = room.log; const roll = R.next(); const tag = `run ${g} step ${s}`;
      if (L.hold) {
        const el = L.els[L.hold.pos];
        if (roll < 0.25) await send(room, host, { type: 'undo', rev: rev() });
        else if (roll < 0.55 && FAMILY[el.m.type]) { const m = altMsg(L.room, el.m, R); if (m) await send(room, host, { type: 'edit', id: el.id, msg: m, rev: rev() }); }
        else if (roll < 0.6) await send(room, R.pick([a, b]), { type: 'chat', channel: 'graveyard', text: 'hi' });
        else await send(room, host, { type: L.room.phase === 'over' && R.chance(0.5) ? 'cut' : 'drop', id: el.id, rev: rev() });
      } else if (roll < 0.3) {
        const cand = L.els.slice(L.gameStart()).filter((x) => x.a?.host && FAMILY[x.m.type]);
        if (cand.length) { const el = R.pick(cand); const m = altMsg(L.stateBefore(el.id), el.m, R); if (m) { await send(room, host, { type: 'edit', id: el.id, msg: m, rev: rev() }); changes++; } }
      } else if (roll < 0.38) await send(room, host, { type: 'undo', rev: rev() });
      else if (roll < 0.42) await send(room, host, { type: 'redo', rev: rev() });
      else if (roll < 0.47) await send(room, R.pick([a, b]), { type: 'chat', channel: 'graveyard', text: 'hi' });
      else { const acts = legalActions(L.room, R.next); await send(room, host, acts.length ? { ...R.pick(acts), rev: rev() } : { type: 'undo', rev: rev() }); /* at the end: go back and play it differently */ }
      if (room.log.hold) paused++;
      const shown = room.log.confirmedRoom();
      for (const ws of [a, b]) {
        const m = last(ws, 'view');
        assert.equal(!!m.paused, !!room.log.hold, `${tag}: paused flag`);
        assert.equal(json(m.view), json(viewForPlayer(shown, ws.att.playerId, room.connectedIds())), `${tag}: a player phone shows the confirmed game`);
      }
      assert.equal(json(view(host)), json(viewForHost(room.room, room.connectedIds())), `${tag}: the host phone shows the room`);
      if (s % 10 === 9) { const again = new Room(f.ctx, {}); await again.ready; assert.equal(json(again.room), json(room.room), `${tag}: cold start`); assert.equal(json(again.log.hold), json(room.log.hold), `${tag}: cold start pause`); }
    }
  }
  if (process.env.SHOW) console.log({ changes, paused });
  assert.ok(changes > RUNS && paused > 0, `only ${changes} changes, ${paused} paused steps`);
});

// A room that shows players the paused room instead of the last confirmed one: the three-phone test must catch it.
class LeakyRoom extends Room { shown() { return this.room; } }
test('mutation: a room that shows players the paused game leaks an unconfirmed death, and the check catches it', async () => {
  const { room, host, a, rev, vill, k, nightId } = await played(fakeCtx(), LeakyRoom);
  const was = alive(view(a));
  await send(room, host, { type: 'edit', id: nightId, msg: { type: 'submitNight', actions: { [k]: { targets: [vill[1].id] } }, n: 1 }, rev: rev() });
  assert.ok(room.log.hold);
  assert.notEqual(alive(view(a)), was, 'the leaky room shows the unconfirmed result');
});
