// Targeted EDICE (UNDO-PLAN.md section 5.5 point 6): the steps whose dice matter, built on purpose instead of
// waiting for random games to reach them. A Confused Detective check with no stored flip draws its coin when the
// night runs; a blind-deal match of an Executioner draws the target. An edit keeps the step's own seed words, so
// a same-value edit leaves the room exactly as it was, and an edit to another part of the night keeps the coin.
// FreshDiceLog (a log that gives an edited step new dice) must fail each case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameLog } from '../public/js/event-log.js';
import { newRoom } from '../public/js/room.js';
import { nightScript } from '../public/js/engine.js';
import { withEntropy, seededEntropy } from '../public/js/entropy.js';
import { diceSteps } from './kit/mafia-edit-props.mjs';
import { rng as simRng } from '../scripts/sim-lib.mjs';

const H = { host: true }; const J = (x) => JSON.stringify(x);
const GAMES = Number(process.env.EDICE_GAMES || 40);
class FreshDiceLog extends GameLog { editedStep(el, ev, j) { return { ...super.editedStep(el, ev, j), e: ev.e }; } }

// A seeded table: every clock and seed word comes from `seed`.
function table(seed, Log, roles, config = {}) {
  let t = 1_900_000_000_000; const S = simRng(seed * 7717 + 3);
  const next = () => [S.int(2 ** 32), S.int(2 ** 32), S.int(2 ** 32), S.int(2 ** 32)];
  const base = withEntropy(seededEntropy(next(), t), () => newRoom('DICE', 'hk'));
  const log = new Log(base);
  const ap = (m) => { const r = log.apply(H, m, (t += 1000), next()); assert.ok(!r.error, `${m.type}: ${r.error}`); return r; };
  const edit = (id, msg, o = {}) => log.op({ type: 'edit', id, msg }, { now: (t += 1000), seed: next(), ...o });
  ap({ type: 'addPlayers', names: roles.map((_, i) => `P${i}`) });
  ap({ type: 'setConfig', mode: 'app', roles, ...config });
  ap({ type: 'deal' });
  return { log, ap, edit };
}
const coins = (room) => (room.log || []).map((l) => l.text).filter((s) => /coin landed/.test(s));

function cdNight(seed, Log) {
  const roles = ['mafia', 'detective', 'confused_detective', 'villager', 'villager', 'villager', 'villager'];
  const g = table(seed, Log, roles); g.ap({ type: 'startNight' });
  const r = g.log.room; const sc = nightScript(r).filter((s) => s.kind === 'action');
  const by = (role) => r.players.filter((p) => p.roleId === role);
  const kill = sc.find((s) => s.type === 'kill').key, cd = sc.find((s) => s.roleId === 'confused_detective').key;
  const vill = by('villager');
  const actions = (victim) => ({ [kill]: { targets: [victim] }, [cd]: { targets: [by('mafia')[0].id] } }); // no flip: the night draws it
  g.ap({ type: 'submitNight', actions: actions(vill[0].id), n: 1 });
  const step = g.log.els.find((s) => s.m.type === 'submitNight');
  return { ...g, step, actions, vill };
}

test(`a Confused Detective check with no stored flip is a step that draws dice (${GAMES} tables)`, () => {
  let heads = 0, tails = 0, dice = 0;
  for (let s = 1; s <= GAMES; s++) {
    const { log, step } = cdNight(s, GameLog);
    if (diceSteps(log).some((x) => x.id === step.id)) dice++; // other seed words land the coin the other way about half the time
    const c = coins(log.room); assert.equal(c.length, 1, `seed ${s}`);
    if (/Heads/.test(c[0])) heads++; else tails++;
  }
  assert.ok(heads > 0 && tails > 0, `the coin always landed the same way: ${heads} heads, ${tails} tails`);
  assert.ok(dice >= GAMES / 4, `only ${dice} of ${GAMES} nights count as dice steps`);
});

test(`a same-value edit of that night leaves the room exactly as it was; an edit to the kill keeps the coin (${GAMES} tables)`, () => {
  for (let s = 1; s <= GAMES; s++) {
    const { log, step, edit, actions, vill } = cdNight(s, GameLog);
    const room = J(log.room), coin = coins(log.room);
    assert.ok(edit(step.id, structuredClone(step.m), { force: true }).kept);
    assert.equal(J(log.room), room, `seed ${s}: a same-value edit changed the room`);
    log.undoStep();
    assert.ok(edit(step.id, { ...step.m, actions: actions(vill[1].id) }).kept, `seed ${s}: kill another villager`);
    assert.deepEqual(coins(log.room), coin.map((c) => c), `seed ${s}: changing the kill reflipped the Confused Detective's coin`);
  }
});

test('mutation: a log that gives an edited night new dice reflips the coin, and the checks above fail', () => {
  let caught = 0;
  for (let s = 1; s <= GAMES; s++) {
    const { log, step, edit } = cdNight(s, FreshDiceLog);
    const room = J(log.room);
    edit(step.id, structuredClone(step.m), { force: true });
    if (J(log.room) !== room) caught++;
  }
  assert.ok(caught >= GAMES / 4, `only ${caught} of ${GAMES} reflips caught`);
});

// Blind cards: the Executioner's card is matched at the night 1 wake-up, and the match draws the target.
function blindExec(seed, Log) {
  const roles = ['mafia', 'executioner', 'villager', 'villager', 'villager', 'villager', 'villager'];
  const g = table(seed, Log, roles, { mode: 'cards', cardFlow: 'blind' });
  g.ap({ type: 'startNight' });
  const ids = g.log.room.players.map((p) => p.id);
  g.ap({ type: 'identifyRole', roleId: 'mafia', playerIds: [ids[0]] });
  g.ap({ type: 'identifyRole', roleId: 'executioner', playerIds: [ids[1]] });
  const step = g.log.els.find((s) => s.m.type === 'identifyRole' && s.m.roleId === 'executioner');
  return { ...g, step, ids };
}
const execTarget = (room) => room.players.find((p) => p.roleId === 'executioner').target;

test(`a blind match of the Executioner draws the target; a same-value edit keeps it (${GAMES} tables)`, () => {
  const targets = new Set(); let dice = 0;
  for (let s = 1; s <= GAMES; s++) {
    const { log, step, edit } = blindExec(s, GameLog);
    if (diceSteps(log).some((x) => x.id === step.id)) dice++;
    const room = J(log.room); targets.add(execTarget(log.room) && log.room.players.findIndex((p) => p.id === execTarget(log.room)));
    assert.ok(edit(step.id, structuredClone(step.m), { force: true }).kept);
    assert.equal(J(log.room), room, `seed ${s}: a same-value edit redrew the target`);
    assert.equal(log.undoStep(), 'A change to an earlier step'); assert.equal(J(log.room), room);
  }
  assert.ok(targets.size > 2, 'the target is drawn, not fixed');
  assert.ok(dice >= GAMES / 2, `only ${dice} of ${GAMES} matches count as dice steps`);
});

test('mutation: a log that gives an edited match new dice redraws the Executioner target', () => {
  let caught = 0;
  for (let s = 1; s <= GAMES; s++) {
    const { log, step, edit } = blindExec(s, FreshDiceLog);
    const t = execTarget(log.room);
    edit(step.id, structuredClone(step.m), { force: true });
    if (execTarget(log.room) !== t) caught++;
  }
  assert.ok(caught >= GAMES / 4, `only ${caught} of ${GAMES} redraws caught`);
});
