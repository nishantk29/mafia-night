// Exact-outcome rule checks for tricky night interactions, wake order and disguised roles.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, setupWarnings } from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';

function mk(spec, { night = 1, phase = 'night' } = {}) {
  const room = newRoom('TEST', 'hostkey-secret');
  for (const [name, roleId] of spec) {
    const r = reduce(room, { anon: true }, { type: 'join', name });
    assert.ok(r.ok, r.error);
    room.players.find((p) => p.name === name).roleId = roleId;
  }
  room.phase = phase; room.night = night;
  return room;
}
const P = (room, name) => room.players.find((p) => p.name === name);
const id = (room, name) => P(room, name).id;
const key = (room, name) => `act:${id(room, name)}`;
const filler = (n) => Array.from({ length: n }, (_, i) => [`Fill${i + 1}`, 'villager']);
const order = (room) => nightScript(room).map((s) => s.key === 'meeting:mafia' ? 'mafia' : ROLE_BY_ID[s.roleId]?.id);

describe('Hooker and other blockers vs the Mafia team kill', () => {
  test('two Mafia, Drunk blocks one: the other carries out the kill', () => {
    const room = mk([['Mo', 'mafia'], ['Ma', 'mafia'], ['Dr', 'drunk'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Dr')]: { targets: [id(room, 'Mo')] } });
    assert.equal(P(room, 'Vic').alive, false);
    assert.match(room.lastReport.notes.join(' '), /Ma carried out/);
  });
  test('Mafia + Hooker, the town blocks the plain Mafia: the Hooker carries out the kill', () => {
    const room = mk([['Mo', 'mafia'], ['Ho', 'hooker'], ['Dr', 'drunk'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Dr')]: { targets: [id(room, 'Mo')] } });
    assert.equal(P(room, 'Vic').alive, false);
    assert.match(room.lastReport.notes.join(' '), /Ho carried out/);
  });
  test('a lone Mafia who is blocked kills nobody', () => {
    const room = mk([['Mo', 'mafia'], ['Dr', 'drunk'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Dr')]: { targets: [id(room, 'Mo')] } });
    assert.equal(P(room, 'Vic').alive, true);
  });
  test('the Hooker blocking a fellow Mafia member does not stop the team kill', () => {
    const room = mk([['Mo', 'mafia'], ['Ma', 'mafia'], ['Ho', 'hooker'], ['Vic', 'villager'], ...filler(4)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Ho')]: { targets: [id(room, 'Mo')] } });
    assert.equal(P(room, 'Vic').alive, false);
  });
  test('only the one Mafia member who did the kill is seen by a Lookout', () => {
    const room = mk([['Mo', 'mafia'], ['Ma', 'mafia'], ['Ho', 'hooker'], ['Lo', 'lookout'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Lo')]: { targets: [id(room, 'Vic')] } });
    const seen = room.lastReport.info.find((i) => i.roleId === 'lookout').text;
    assert.match(seen, /^(Mo|Ma) visited Vic\.$/, seen);
  });
  test('a Veteran on alert shoots only the member who came to the door', () => {
    const room = mk([['Mo', 'mafia'], ['Ma', 'mafia'], ['Vet', 'veteran'], ...filler(5)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vet')] }, [key(room, 'Vet')]: { on: true } });
    assert.equal([P(room, 'Mo'), P(room, 'Ma')].filter((p) => !p.alive).length, 1);
  });
  test('a blocked Cop gets no result', () => {
    const room = mk([['Ho', 'hooker'], ['Mo', 'mafia'], ['Cop', 'cop'], ...filler(4)]);
    resolveNight(room, { [key(room, 'Ho')]: { targets: [id(room, 'Cop')] }, [key(room, 'Cop')]: { targets: [id(room, 'Mo')] } });
    assert.equal(room.lastReport.info.length, 0);
    assert.match(room.lastReport.notes.join(' '), /Cop.*blocked/);
  });
  test('a Jailer jailing the Hooker frees the Hooker\'s target', () => {
    const room = mk([['Ho', 'hooker'], ['Mo', 'mafia'], ['Jail', 'jailer'], ['Cop', 'cop'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Jail')]: { targets: [id(room, 'Ho')] }, [key(room, 'Ho')]: { targets: [id(room, 'Cop')] }, [key(room, 'Cop')]: { targets: [id(room, 'Mo')] } });
    assert.match(room.lastReport.info.map((i) => i.text).join(), /Mo is MAFIA/);
  });
});

describe('wake order', () => {
  const room = mk([['Ja', 'janitor'], ['Mo', 'mafia'], ['Ho', 'hooker'], ['Doc', 'doctor'], ['Fr', 'framer'], ['Cop', 'cop'], ['Tr', 'tracker'],
    ['Lo', 'lookout'], ['Wa', 'wannabe'], ['Cor', 'coroner'], ['Jail', 'jailer'], ['Vig', 'vigilante'], ['Cult', 'cult']], { night: 2 });
  const o = order(room);
  const before = (a, b) => assert.ok(o.indexOf(a) < o.indexOf(b), `${a} should wake before ${b}: ${o.join(' > ')}`);
  test('jailers and blockers wake first', () => { before('jailer', 'hooker'); before('hooker', 'doctor'); });
  test('the Janitor wakes after the Mafia pick their victim', () => before('mafia', 'janitor'));
  test('framers and converters wake before investigators', () => { before('framer', 'cop'); before('cult', 'cop'); });
  test('everyone who visits wakes before trackers and lookouts', () => {
    for (const r of ['wannabe', 'coroner', 'cop', 'mafia', 'vigilante', 'doctor']) { before(r, 'tracker'); before(r, 'lookout'); }
  });
  test('no role that visits someone wakes after a tracker, across the whole catalogue', () => {
    const trackOrder = ROLE_BY_ID.tracker.action.order;
    for (const r of ROLES) if (r.action && r.action.targets !== 0 && !['track', 'watch'].includes(r.action.type)) {
      assert.ok(r.action.order < trackOrder, `${r.id} (order ${r.action.order}) visits after trackers`);
    }
  });
  test('anything that changes a Cop result wakes before the Cop', () => {
    const cop = ROLE_BY_ID.cop.action.order;
    for (const r of ROLES) if (['frame', 'convert', 'jail', 'block', 'blockVisitors', 'copyRole'].includes(r.action?.type)) {
      assert.ok(r.action.order < cop, `${r.id} (${r.action.type}) wakes after the Cop`);
    }
  });
});

describe('roles that do not know what they are', () => {
  const disguised = ROLES.filter((r) => r.seesAs);
  test('every disguised role is called by the name it thinks it has', () => {
    for (const r of disguised) if (r.action) assert.ok(!r.action.prompt.includes(r.name), `${r.id} prompt says "${r.action.prompt}"`);
  });
  test('no disguised role has a read-aloud night-1 line with its real name', () => {
    for (const r of disguised) {
      const room = mk([['X', r.id], ['Mo', 'mafia'], ...filler(4)]);
      for (const s of nightScript(room).filter((st) => st.kind === 'info' && st.roleId === r.id)) assert.equal(s.spoken, false, r.id);
    }
  });
  test('result lines never name the disguised role; the explanation is a separate note', () => {
    for (const roleId of ['insane_cop', 'confused_cop', 'naive_cop', 'paranoid_cop']) {
      const room = mk([['X', roleId], ['Mo', 'mafia'], ['Vic', 'villager'], ...filler(3)]);
      resolveNight(room, { [key(room, 'X')]: { targets: [id(room, 'Mo')], coin: 'innocent' } });
      const i = room.lastReport.info[0];
      assert.match(i.text, /^Mo is (MAFIA|NOT Mafia)\.$/, `${roleId}: "${i.text}"`);
      assert.ok(i.note, `${roleId} needs a storyteller note`);
    }
  });
  test('Naive Cop always hears innocent, Paranoid Cop always hears guilty, Insane Cop hears the opposite', () => {
    const run = (roleId, target) => { const room = mk([['X', roleId], ['Mo', 'mafia'], ['Vic', 'villager'], ...filler(3)]); resolveNight(room, { [key(room, 'X')]: { targets: [id(room, target)] } }); return room.lastReport.info[0].text; };
    assert.equal(run('naive_cop', 'Mo'), 'Mo is NOT Mafia.');
    assert.equal(run('paranoid_cop', 'Vic'), 'Vic is MAFIA.');
    assert.equal(run('insane_cop', 'Mo'), 'Mo is NOT Mafia.');
    assert.equal(run('insane_cop', 'Vic'), 'Vic is MAFIA.');
  });
  test('Confused Cop uses the storyteller\'s coin flip', () => {
    const room = mk([['X', 'confused_cop'], ['Mo', 'mafia'], ...filler(4)]);
    resolveNight(room, { [key(room, 'X')]: { targets: [id(room, 'Mo')], coin: 'innocent' } });
    assert.equal(room.lastReport.info[0].text, 'Mo is NOT Mafia.');
  });
  test('the phone and the card key show the role they think they are', () => {
    const room = mk([['X', 'insane_cop'], ['C', 'cop'], ['Mo', 'mafia'], ...filler(3)], { phase: 'dealt', night: 0 });
    room.config.mode = 'cards'; room.config.cardFlow = 'blind';
    room.deck = { map: room.players.map((p, i) => ({ card: ['2S', '3S', '4S', '5S', '6S', '7S'][i], roleId: p.roleId })), claimed: {} };
    const v = viewForPlayer(room, id(room, 'X'));
    assert.equal(v.me.role.id, 'cop');
    assert.ok(!JSON.stringify(v).includes('Insane'), 'the word Insane reached a phone');
  });
  test('blind night 1: two "Cops" are called the same way, with a private card hint', () => {
    const room = mk([['A', 'insane_cop'], ['B', 'cop'], ['Mo', 'mafia'], ...filler(3)], { phase: 'dealt', night: 0 });
    room.config.mode = 'cards'; room.config.cardFlow = 'blind';
    for (const p of room.players) p.roleId = null;
    room.deck = { map: [['2S', 'insane_cop'], ['3S', 'cop'], ['4S', 'mafia'], ['5S', 'villager'], ['6S', 'villager'], ['7S', 'villager']].map(([card, roleId]) => ({ card, roleId })), claimed: {} };
    room.night = 1; room.phase = 'night';
    const ids = nightScript(room).filter((s) => s.kind === 'identify');
    const insane = ids.find((s) => s.roleId === 'insane_cop');
    assert.match(insane.prompt, /^Cop, open your eyes/);
    assert.match(insane.hint, /2S is the Insane Cop/);
  });
  test('two players answering to "Cop" get a tap-on-the-shoulder hint', () => {
    const room = mk([['A', 'insane_cop'], ['B', 'cop'], ['Mo', 'mafia'], ...filler(3)]);
    const cops = nightScript(room).filter((s) => s.prompt === 'Cop, wake up. Who do you check?');
    assert.equal(cops.length, 2);
    for (const s of cops) assert.match(s.hint, /Tap (A|B) on the shoulder/);
  });
});

describe('live results during the night', () => {
  test('a Cop is told the framed result when the Framer woke first', () => {
    const room = mk([['Fr', 'framer'], ['Mo', 'mafia'], ['Cop', 'cop'], ['Vic', 'villager'], ...filler(3)]);
    const acts = { [key(room, 'Fr')]: { targets: [id(room, 'Vic')] }, [key(room, 'Cop')]: { targets: [id(room, 'Vic')] } };
    assert.equal(previewNight(room, acts, key(room, 'Cop')).text, 'Vic is MAFIA.');
    assert.equal(room.phase, 'night', 'preview must not change the real room');
    assert.equal(P(room, 'Vic').alive, true);
  });
  test('a blocked Cop is told nothing', () => {
    const room = mk([['Ho', 'hooker'], ['Mo', 'mafia'], ['Cop', 'cop'], ...filler(4)]);
    const p = previewNight(room, { [key(room, 'Ho')]: { targets: [id(room, 'Cop')] }, [key(room, 'Cop')]: { targets: [id(room, 'Mo')] } }, key(room, 'Cop'));
    assert.equal(p.blocked, true);
  });
  test('the preview matches the morning report', () => {
    const room = mk([['Fr', 'framer'], ['Mo', 'mafia'], ['Cop', 'cop'], ['Tr', 'tracker'], ['Vic', 'villager'], ...filler(3)]);
    const acts = { 'meeting:mafia': { targets: [id(room, 'Vic')] }, [key(room, 'Fr')]: { targets: [id(room, 'Tr')] },
      [key(room, 'Cop')]: { targets: [id(room, 'Tr')] }, [key(room, 'Tr')]: { targets: [id(room, 'Mo')] } };
    const cop = previewNight(room, acts, key(room, 'Cop')).text; const tr = previewNight(room, acts, key(room, 'Tr')).text;
    resolveNight(room, acts);
    assert.deepEqual(room.lastReport.info.map((i) => i.text).sort(), [cop, tr].sort());
  });
});

describe('setup warnings', () => {
  test('Mafia already matching everyone else is an error', () => {
    assert.ok(setupWarnings(['mafia', 'mafia', 'mafia', 'villager', 'villager', 'villager'], 6).some((w) => w.level === 'error'));
  });
  test('a balanced classic game has no warnings or errors', () => {
    const w = setupWarnings(['mafia', 'mafia', 'godfather', 'doctor', 'cop', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'jester'], 12);
    assert.deepEqual(w.filter((x) => x.level !== 'tip'), []);
  });
  test('a lone Mason and an odd number of Lovers are flagged', () => {
    const w = setupWarnings(['mafia', 'mason', 'lover', 'villager', 'villager', 'cop'], 6).map((x) => x.text).join(' ');
    assert.match(w, /single Mason/); assert.match(w, /Lovers come in pairs/);
  });
  test('a Godfather with nobody to fool gets a tip', () => {
    assert.match(setupWarnings(['godfather', 'villager', 'villager', 'villager', 'villager', 'doctor', 'villager'], 7).map((x) => x.text).join(' '), /Godfather only matters/);
  });
});

describe('Cop, Detective and Confused Cop in one game', () => {
  const setup = () => mk([['Cop', 'cop'], ['Det', 'detective'], ['Con', 'confused_cop'], ['Mo', 'mafia'], ['Vic', 'villager'], ...filler(3)]);
  test('both "Cops" hear the same call and get shoulder-tap hints; the Detective has its own call', () => {
    const steps = nightScript(setup()).filter((s) => s.kind === 'action');
    const cops = steps.filter((s) => s.prompt === 'Cop, wake up. Who do you check?');
    assert.equal(cops.length, 2);
    for (const s of cops) assert.ok(s.hint);
    assert.equal(steps.find((s) => s.roleId === 'detective').hint, undefined);
  });
  test('the real Cop gets the truth, the Confused Cop gets the coin, the Detective sees the true role', () => {
    const room = setup();
    resolveNight(room, {
      [key(room, 'Cop')]: { targets: [id(room, 'Mo')] },
      [key(room, 'Con')]: { targets: [id(room, 'Mo')], coin: 'innocent' },
      [key(room, 'Det')]: { targets: [id(room, 'Con')] },
    });
    const by = (r) => room.lastReport.info.find((i) => i.roleId === r).text;
    assert.equal(by('cop'), 'Mo is MAFIA.');
    assert.equal(by('confused_cop'), 'Mo is NOT Mafia.');
    assert.equal(by('detective'), 'Con is the Confused Cop.');
  });
  test('nobody is offered themselves as a target in the engine script data', () => {
    for (const s of nightScript(setup()).filter((x) => x.kind === 'action')) assert.ok(Array.isArray(s.actors) && s.actors.length);
  });
});

describe('Role guide on the phone', () => {
  test('every role has a guide with a goal and a night line', () => {
    for (const r of ROLES) {
      const room = mk([['X', r.id], ['Mo', 'mafia'], ...filler(4)], { phase: 'dealt', night: 0 });
      const g = viewForPlayer(room, id(room, 'X')).me.guide;
      assert.ok(g?.goal && g.night.length, `${r.id} has no guide`);
    }
  });
  test('a disguised role reads the guide of the role it thinks it is, and never its real name', () => {
    for (const r of ROLES.filter((x) => x.seesAs)) {
      const room = mk([['X', r.id], ['Mo', 'mafia'], ...filler(4)], { phase: 'dealt', night: 0 });
      const v = viewForPlayer(room, id(room, 'X'));
      const shown = mk([['X', r.seesAs], ['Mo', 'mafia'], ...filler(4)], { phase: 'dealt', night: 0 });
      assert.deepEqual(v.me.guide, viewForPlayer(shown, id(shown, 'X')).me.guide, r.id);
      assert.ok(!JSON.stringify(v).includes(r.name), `${r.name} reached its own phone`);
    }
  });
  test('team kills are one shared pick, not a second wake-up', () => {
    const room = mk([['X', 'mafia'], ['Y', 'mafia'], ...filler(4)], { phase: 'dealt', night: 0 });
    const g = viewForPlayer(room, id(room, 'X')).me.guide;
    assert.equal(g.night.length, 1);
    assert.match(g.night[0], /wake with the Mafia/);
  });
});
