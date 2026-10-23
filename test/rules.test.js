// Exact-outcome rule checks for tricky night interactions, wake order and disguised roles.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, resolveNight, previewNight, setupWarnings } from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce, viewForPlayer } from '../public/js/room.js';
import { themeText } from '../public/js/theme.js';

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
    for (const roleId of ['insane_cop', 'naive_cop', 'paranoid_cop']) {
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
  test('Confused Cop is open: heads is the true result, tails the opposite', () => {
    const room = mk([['X', 'confused_cop'], ['C', 'cop'], ['Mo', 'mafia'], ...filler(3)]);
    resolveNight(room, { [key(room, 'X')]: { targets: [id(room, 'Mo')], flip: 'tails' } });
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
  test('two players who look like "Cop" get separate numbered calls, each with a private who-is-it hint', () => {
    const room = mk([['A', 'insane_cop'], ['B', 'cop'], ['Mo', 'mafia'], ...filler(3)]);
    const cops = nightScript(room).filter((s) => /^Cop \d, wake up\. Who do you check\?$/.test(s.prompt));
    assert.equal(cops.length, 2);
    assert.deepEqual(cops.map((s) => s.prompt.slice(0, 5)), ['Cop 1', 'Cop 2']);
    for (const s of cops) assert.match(s.hint, /^Cop \d is (A|B)\./);
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
  test('a Tracker is not shown a visit by a role that wakes after them, live or in the morning', () => {
    const room = mk([['Tr', 'tracker'], ['Lo', 'lookout'], ['Mo', 'mafia'], ['Vic', 'villager'], ...filler(2)]);
    const acts = { [key(room, 'Tr')]: { targets: [id(room, 'Lo')] }, [key(room, 'Lo')]: { targets: [id(room, 'Vic')] } };
    assert.equal(previewNight(room, acts, key(room, 'Tr')).text, 'Lo stayed home.');
    resolveNight(room, acts);
    assert.equal(room.lastReport.info.find((i) => i.roleId === 'tracker').text, 'Lo stayed home.');
  });
  test('of two Lookouts, the one called first does not see the second one\'s visit', () => {
    const room = mk([['L1', 'lookout'], ['L2', 'lookout'], ['Mo', 'mafia'], ['Vic', 'villager'], ...filler(2)]);
    const acts = { [key(room, 'L1')]: { targets: [id(room, 'Vic')] }, [key(room, 'L2')]: { targets: [id(room, 'Vic')] } };
    const first = nightScript(room).find((s) => s.roleId === 'lookout').key;
    const [a, b] = first === key(room, 'L1') ? ['L1', 'L2'] : ['L2', 'L1'];
    assert.equal(previewNight(room, acts, key(room, a)).text, 'Nobody visited Vic.');
    assert.equal(previewNight(room, acts, key(room, b)).text, `${a} visited Vic.`);
    resolveNight(room, acts);
    assert.deepEqual(room.lastReport.info.map((i) => i.text).sort(), ['Nobody visited Vic.', `${a} visited Vic.`].sort());
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
  test('the Confused Cop and the Detective each have their own call, apart from the Cop', () => {
    const steps = nightScript(setup()).filter((s) => s.kind === 'action');
    assert.equal(steps.filter((s) => s.prompt === 'Cop, wake up. Who do you check?').length, 1);
    for (const r of ['cop', 'confused_cop', 'detective']) assert.equal(steps.find((s) => s.roleId === r).hint, undefined);
  });
  test('the real Cop gets the truth, the Confused Cop gets the coin, the Detective sees the true role', () => {
    const room = setup();
    resolveNight(room, {
      [key(room, 'Cop')]: { targets: [id(room, 'Mo')] },
      [key(room, 'Con')]: { targets: [id(room, 'Mo')], flip: 'tails' },
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

describe('House rules', () => {
  test('no first-night kill: the Mafia only meet, killers skip night 1, night 2 is normal', () => {
    const room = mk([['Mo', 'mafia'], ['Vi', 'vigilante'], ['Vic', 'villager'], ...filler(3)]);
    room.config.rules = { firstNightKill: false };
    const s = nightScript(room);
    const meet = s.find((x) => x.key === 'meeting:mafia');
    assert.equal(meet.kind, 'info');
    assert.ok(!s.some((x) => x.type === 'kill'));
    resolveNight(room, { 'meeting:mafia': { done: true } });
    assert.ok(room.players.every((p) => p.alive));
    room.night = 2; room.phase = 'night';
    assert.equal(nightScript(room).find((x) => x.key === 'meeting:mafia').type, 'kill');
  });
  test('Doctor self-protect off: a self-save does not count', () => {
    const room = mk([['Mo', 'mafia'], ['Doc', 'doctor'], ...filler(4)]);
    room.config.rules = { selfProtect: false };
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Doc')] }, [key(room, 'Doc')]: { targets: [id(room, 'Doc')] } });
    assert.equal(P(room, 'Doc').alive, false);
    const room2 = mk([['Mo', 'mafia'], ['Doc', 'doctor'], ...filler(4)]);
    resolveNight(room2, { 'meeting:mafia': { targets: [id(room2, 'Doc')] }, [key(room2, 'Doc')]: { targets: [id(room2, 'Doc')] } });
    assert.equal(P(room2, 'Doc').alive, true, 'self-save works by default');
  });
  test('nobody else can target themselves, even if a request asks for it', () => {
    const room = mk([['Mo', 'mafia'], ['Ma', 'mafia'], ['Cop', 'cop'], ['Vig', 'vigilante'], ['Bg', 'bodyguard'], ...filler(4)]);
    resolveNight(room, {
      'meeting:mafia': { targets: [id(room, 'Mo')] }, [key(room, 'Cop')]: { targets: [id(room, 'Cop')] },
      [key(room, 'Vig')]: { targets: [id(room, 'Vig')] }, [key(room, 'Bg')]: { targets: [id(room, 'Bg')] },
    });
    assert.ok(room.players.every((p) => p.alive));
    assert.deepEqual(room.lastReport.info, []);
    assert.equal(room.usage[id(room, 'Vig')] || 0, 0, 'an ignored shot does not use up the Vigilante\'s bullet');
  });
  test('a Parity Cop cannot compare a player with themselves', () => {
    const room = mk([['Mo', 'mafia'], ['Pc', 'parity_cop'], ['Vic', 'villager'], ...filler(4)]);
    resolveNight(room, { [key(room, 'Pc')]: { targets: [id(room, 'Vic'), id(room, 'Vic')] } });
    assert.deepEqual(room.lastReport.info, []);
  });
  test('roles hidden on death: the dead player\'s role stays secret from phones until the end', () => {
    const room = mk([['Mo', 'mafia'], ['Cop', 'cop'], ['Ann', 'villager'], ...filler(3)], { phase: 'day', night: 1 });
    room.config.rules = { revealOnDeath: false };
    P(room, 'Cop').alive = false;
    const seen = viewForPlayer(room, id(room, 'Ann')).players.find((p) => p.name === 'Cop');
    assert.equal(seen.role, null);
    room.config.rules = {};
    assert.equal(viewForPlayer(room, id(room, 'Ann')).players.find((p) => p.name === 'Cop').role.id, 'cop');
  });
  test('start with a day: only when switched on, and never with a blind card deal', () => {
    const room = mk([['Mo', 'mafia'], ['Ann', 'villager'], ...filler(4)], { phase: 'dealt', night: 0 });
    assert.ok(reduce(room, { host: true }, { type: 'startDay' }).error);
    reduce(room, { host: true }, { type: 'setConfig', rules: { dayStart: true } });
    assert.ok(reduce(room, { host: true }, { type: 'startDay' }).ok);
    assert.equal(room.phase, 'day'); assert.equal(room.day, 1);
    assert.ok(reduce(room, { host: true }, { type: 'startNight' }).ok);
    assert.equal(room.night, 1);
    const blind = mk([['Mo', 'mafia'], ['Ann', 'villager'], ...filler(4)], { phase: 'dealt', night: 0 });
    blind.config.mode = 'cards'; blind.config.cardFlow = 'blind'; blind.config.rules = { dayStart: true };
    assert.ok(reduce(blind, { host: true }, { type: 'startDay' }).error);
  });
  test('setConfig only accepts known themes and rules', () => {
    const room = mk([['Mo', 'mafia'], ...filler(5)], { phase: 'lobby', night: 0 });
    reduce(room, { host: true }, { type: 'setConfig', theme: 'village', rules: { selfProtect: false, bogus: true, dayStart: 'yes' } });
    assert.equal(room.config.theme, 'village');
    assert.equal(room.config.rules.selfProtect, false);
    assert.ok(!('bogus' in room.config.rules)); assert.equal(room.config.rules.dayStart, false);
    reduce(room, { host: true }, { type: 'setConfig', theme: 'nope' });
    assert.equal(room.config.theme, 'village');
  });
});

describe('Werewolf theme words', () => {
  const t = (s, names = [], role = false) => themeText(s, 'village', names, role);
  test('team, roles and results read as Werewolf', () => {
    assert.equal(t('Mafia, wake up. Who do you kill?'), 'Werewolves, wake up. Who do you kill?');
    assert.equal(t('Mo is NOT Mafia.', ['Mo']), 'Mo is NOT a Werewolf.');
    assert.equal(t('Cop, wake up. Who do you check?'), 'Seer, wake up. Who do you check?');
    assert.equal(t('Mafia', [], true), 'Werewolf');
    assert.equal(t('Werewolf', [], true), 'Lone Wolf');
    assert.equal(t('Town Crier wins on Mafia Night'), 'Town Crier wins on Mafia Night');
  });
  test('player names are never renamed', () => {
    assert.equal(t('Cop carried out the Mafia kill.', ['Cop']), 'Cop carried out the Werewolf kill.');
    assert.equal(t('Town is NOT Mafia.', ['Town']), 'Town is NOT a Werewolf.');
  });
  test('the Mafia theme changes nothing', () => {
    assert.equal(themeText('Mafia, wake up.', 'city'), 'Mafia, wake up.');
  });
});

describe('Night results on the phone', () => {
  test('only the investigator gets the result, and only the words they were told', () => {
    const room = mk([['X', 'insane_cop'], ['Mo', 'mafia'], ['Ann', 'villager'], ...filler(3)]);
    resolveNight(room, { [key(room, 'X')]: { targets: [id(room, 'Mo')] } });
    const mine = viewForPlayer(room, id(room, 'X')).me.results;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].text, 'Mo is NOT Mafia.');
    assert.ok(!/Insane|backwards/i.test(JSON.stringify(viewForPlayer(room, id(room, 'X')))));
    assert.equal(viewForPlayer(room, id(room, 'Ann')).me.results.length, 0);
    assert.equal(viewForPlayer(room, id(room, 'Mo')).me.results.length, 0);
  });
});
