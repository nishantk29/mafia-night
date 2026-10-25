// Confused Cop: an open role with a server-side coin (heads = true Cop result, tails = opposite), its own night turn
// right after the Cop, and the generic requiresPartner pairing rule.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, setupWarnings, stepCues, stepGesture, doneStepLines, flipCoin } from '../public/js/engine.js';
import { ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce, viewForPlayer, viewForHost } from '../public/js/room.js';

const host = { host: true };
function mk(spec) {
  const room = newRoom('TEST', 'hostkey-secret'); room.nightVersion = 4; // pinned: v5 moves investigator results to the night check card (night-upgrade-v5.test.js)
  for (const [name, roleId] of spec) {
    assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
    room.players.find((p) => p.name === name).roleId = roleId;
  }
  room.phase = 'night'; room.night = 1;
  return room;
}
const id = (room, name) => room.players.find((p) => p.name === name).id;
const setup = () => mk([['Cop', 'cop'], ['Con', 'confused_cop'], ['Mo', 'mafia'], ['Vic', 'villager'], ['V2', 'villager'], ['V3', 'villager']]);

describe('Confused Cop coin', () => {
  test('flipCoin gives both outcomes', () => {
    const seen = new Set(Array.from({ length: 200 }, flipCoin));
    assert.deepEqual([...seen].sort(), ['heads', 'tails']);
  });
  test('over 400 runs without a stored flip: both outcomes, result = truth (heads) or opposite (tails)', () => {
    const seen = { heads: 0, tails: 0 };
    for (let i = 0; i < 400; i++) {
      const room = setup();
      const target = i % 2 ? 'Mo' : 'Vic';
      const truth = target === 'Mo' ? 'MAFIA' : 'NOT Mafia';
      const opposite = target === 'Mo' ? 'NOT Mafia' : 'MAFIA';
      resolveNight(room, { [`act:${id(room, 'Con')}`]: { targets: [id(room, target)] } });
      const info = room.lastReport.info[0];
      const flip = room.lastReport.coins[0].flip;
      seen[flip]++;
      assert.equal(info.text, `${target} is ${flip === 'heads' ? truth : opposite}.`);
    }
    assert.ok(seen.heads > 100 && seen.tails > 100, JSON.stringify(seen));
  });
  test('a stored flip is used by preview, resolution and the host log alike', () => {
    for (const flip of ['heads', 'tails']) {
      const room = setup();
      const key = `act:${id(room, 'Con')}`;
      const actions = { [key]: { targets: [id(room, 'Mo')], flip } };
      const want = `Mo is ${flip === 'heads' ? 'MAFIA' : 'NOT Mafia'}.`;
      assert.equal(previewNight(room, actions, key).text, want);
      resolveNight(room, actions);
      assert.equal(room.lastReport.info[0].text, want);
      assert.match(room.log.find((l) => l.private).text, flip === 'heads' ? /Heads/ : /Tails/);
    }
  });
});

describe('Confused Cop night turn', () => {
  test('is its own step directly after the Cop, not grouped with it', () => {
    const steps = nightScript(setup()).filter((s) => s.kind === 'action');
    const roles = steps.map((s) => s.roleId);
    assert.equal(roles.indexOf('confused_cop'), roles.indexOf('cop') + 1);
    assert.equal(steps.find((s) => s.roleId === 'cop').hint, undefined);
    assert.equal(steps.find((s) => s.roleId === 'confused_cop').hint, undefined);
    assert.equal(ROLE_BY_ID.confused_cop.seesAs, undefined);
  });
  test('Say / Gesture / Say flow', () => {
    const step = nightScript(setup()).find((s) => s.roleId === 'confused_cop');
    assert.equal(stepCues(step).open, 'Confused Cop, open your eyes. Who do you check?');
    assert.equal(stepCues(step).close, 'Confused Cop, close your eyes.');
    const lines = doneStepLines(step, { text: 'Mo is MAFIA.' });
    assert.deepEqual(lines.map((l) => l.type), ['gesture', 'say']);
    assert.match(stepGesture(step, { text: 'Mo is MAFIA.' }).text, /^Nod your head \/ Thumbs up/);
    assert.match(stepGesture(step, { text: 'Mo is NOT Mafia.' }).text, /^Shake your head \/ Thumbs down/);
    assert.equal(lines[1].text, 'Confused Cop, close your eyes.');
  });
});

describe('pairing rule (requiresPartner)', () => {
  test('confused_cop declares the Cop as partner', () => assert.equal(ROLE_BY_ID.confused_cop.requiresPartner, 'cop'));
  test('setup validation errors without the partner, passes with it', () => {
    const bad = setupWarnings(['confused_cop', 'mafia', 'villager', 'villager', 'villager', 'villager'], 6);
    assert.ok(bad.some((w) => w.level === 'error' && /Confused Cop needs a regular Cop in the game\. Add a Cop\./.test(w.text)));
    const good = setupWarnings(['confused_cop', 'cop', 'mafia', 'villager', 'villager', 'villager'], 6);
    assert.ok(!good.some((w) => w.level === 'error'));
  });
  test('the server refuses to deal without a Cop and accepts with one', () => {
    const run = (roles) => {
      const room = newRoom('X', 'k'); room.nightVersion = 4; // pinned: v5 moves investigator results to the night check card (night-upgrade-v5.test.js)
      reduce(room, host, { type: 'addPlayers', names: ['A', 'B', 'C', 'D', 'E', 'F'] });
      reduce(room, host, { type: 'setConfig', roles });
      return reduce(room, host, { type: 'deal' });
    };
    const bad = run(['confused_cop', 'mafia', 'villager', 'villager', 'villager', 'villager']);
    assert.ok(!bad.ok); assert.match(bad.error, /needs a regular Cop/);
    assert.ok(run(['confused_cop', 'cop', 'mafia', 'villager', 'villager', 'villager']).ok);
  });
});

describe('phone never learns the coin', () => {
  test('the result reaches the Confused Cop phone as plain text; no coin words anywhere in their view', () => {
    const room = setup();
    for (const flip of ['heads', 'tails']) {
      resolveNight(room, { [`act:${id(room, 'Con')}`]: { targets: [id(room, 'Mo')], flip } });
      room.phase = 'night'; room.night++;
    }
    const v = viewForPlayer(room, id(room, 'Con'));
    assert.equal(v.me.results.length, 2);
    assert.ok(v.me.results.every((r) => /^Mo is (MAFIA|NOT Mafia)\.$/.test(r.text)));
    assert.equal(v.me.role.id, 'confused_cop');
    // The role card's own rules text may explain the coin; nothing else (results, guide, log) may mention it.
    const strip = (view) => JSON.stringify(view, (k, val) => (k === 'blurb' ? undefined : val));
    for (const p of room.players) assert.doesNotMatch(strip(viewForPlayer(room, p.id)), /heads|tails|flip|coin/i, p.name);
    assert.match(JSON.stringify(viewForHost(room).log), /Heads/);
  });
});

describe('several cop types in one game', () => {
  const multi = () => mk([['Cop', 'cop'], ['Ins', 'insane_cop'], ['Con', 'confused_cop'], ['Par', 'paranoid_cop'], ['Mo', 'mafia'], ['Vic', 'villager'], ['V2', 'villager'], ['V3', 'villager']]);
  test('4 separate steps: three neutral numbered "Cop" calls, then the Confused Cop', () => {
    const steps = nightScript(multi()).filter((s) => s.kind === 'action' && s.type === 'investigate');
    assert.equal(steps.length, 4);
    assert.deepEqual(steps.slice(0, 3).map((s) => s.prompt), ['Cop 1', 'Cop 2', 'Cop 3'].map((n) => `${n}, wake up. Who do you check?`));
    assert.equal(steps[3].roleId, 'confused_cop');
    assert.equal(steps[3].prompt, 'Confused Cop, open your eyes. Who do you check?');
    for (const s of steps.slice(0, 3)) {
      assert.doesNotMatch(JSON.stringify([s.prompt, stepCues(s)]), /Insane|Naive|Paranoid|Confused/i);
      assert.match(stepCues(s).open, /^Cop \d, /);
      assert.match(s.hint, /^Cop \d is (Cop|Ins|Par)\./);
    }
    assert.equal(new Set(steps.slice(0, 3).map((s) => s.actors[0])).size, 3);
  });
  test('numbering is stable for the whole game', () => {
    const room = multi();
    const a = nightScript(room).map((s) => s.prompt + s.actors);
    assert.deepEqual(nightScript(room).map((s) => s.prompt + s.actors), a);
  });
  test('each one gets the right result', () => {
    const room = multi();
    const t = (n) => ({ targets: [id(room, n)] });
    resolveNight(room, {
      [`act:${id(room, 'Cop')}`]: t('Mo'), [`act:${id(room, 'Ins')}`]: t('Mo'),
      [`act:${id(room, 'Par')}`]: t('Vic'), [`act:${id(room, 'Con')}`]: { ...t('Mo'), flip: 'tails' },
    });
    const by = (r) => room.lastReport.info.find((i) => i.roleId === r).text;
    assert.equal(by('cop'), 'Mo is MAFIA.');
    assert.equal(by('insane_cop'), 'Mo is NOT Mafia.');
    assert.equal(by('paranoid_cop'), 'Vic is MAFIA.');
    assert.equal(by('confused_cop'), 'Mo is NOT Mafia.');
  });
  test('two Cops of the same type each get their own numbered turn', () => {
    const room = mk([['C1', 'cop'], ['C2', 'cop'], ['Mo', 'mafia'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager']]);
    const steps = nightScript(room).filter((s) => s.type === 'investigate');
    assert.deepEqual(steps.map((s) => s.prompt.split(',')[0]), ['Cop 1', 'Cop 2']);
    assert.notEqual(steps[0].actors[0], steps[1].actors[0]);
  });
  test('two Confused Cops are numbered; one stays plain', () => {
    const room = mk([['Cop', 'cop'], ['K1', 'confused_cop'], ['K2', 'confused_cop'], ['Mo', 'mafia'], ['V1', 'villager'], ['V2', 'villager']]);
    const steps = nightScript(room).filter((s) => s.roleId === 'confused_cop');
    assert.deepEqual(steps.map((s) => s.prompt.split(',')[0]), ['Confused Cop 1', 'Confused Cop 2']);
    assert.equal(stepCues(steps[1]).close, 'Confused Cop 2, close your eyes.');
    assert.equal(nightScript(setup()).find((s) => s.roleId === 'cop').prompt, 'Cop, wake up. Who do you check?');
  });
  test('one Cop satisfies any number of Confused Cops', () => {
    const w = setupWarnings(['cop', 'confused_cop', 'confused_cop', 'mafia', 'villager', 'villager', 'villager'], 7);
    assert.ok(!w.some((x) => x.level === 'error'));
  });
});
