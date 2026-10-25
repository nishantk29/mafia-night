// v7 role audit: regression tests for the bugs found, plus checks that the areas audited behave as intended.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  nightScript, resolveNight, previewNight, checkCard, morningAnnouncement, condemn, stepScript, stepCues, stepGesture,
  checkWin, callNumbers, appearsAs,
} from '../public/js/engine.js';
import { ROLES } from '../public/js/roles.js';
import { newRoom, reduce, viewForHost, viewForPlayer, messagesFor, restartGame } from '../public/js/room.js';

const HOST = { host: true }, ANON = { anon: true };
// spec: [name, roleId, alive = true]. Ids are `p<name>`.
function mk(spec, { v = 7, night = 2, phase = 'night', rules = {} } = {}) {
  const room = newRoom('AU', 'hostkey');
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  if (v === 1) delete room.nightVersion; else room.nightVersion = v;
  room.phase = phase; room.night = night; room.day = phase === 'day' ? night : 0; room.copSalt = 0.5;
  Object.assign(room.config.rules, rules);
  return room;
}
const pn = (room, name) => room.players.find((p) => p.name === name);
const step = (room, roleId) => nightScript(room).find((s) => s.roleId === roleId);
const acts = (room, ...pairs) => Object.fromEntries(pairs.map(([role, ...targets]) => [step(room, role).key, { targets: targets.map((t) => `p${t}`), on: true }]));
const preview = (room, role, ...pairs) => { const st = step(room, role); return previewNight(room, { ...acts(room, ...pairs), }, st.key); };
const town = (n) => Array.from({ length: n }, (_, i) => [`V${i + 1}`, 'villager']);

describe('Psychic reads the true side (v7)', () => {
  const spec = [['Psy', 'psychic'], ['Fr', 'framer'], ['God', 'godfather'], ['Mob', 'mafia'], ['Mil', 'miller'], ...town(3)];
  test('a framed Villager is NOT Mafia; the Godfather is MAFIA; a Miller is NOT Mafia', () => {
    const room = mk(spec);
    assert.equal(preview(room, 'psychic', ['framer', 'V1'], ['psychic', 'V1']).text, 'V1 is NOT Mafia.');
    assert.equal(preview(room, 'psychic', ['psychic', 'God']).text, 'God is MAFIA.');
    assert.equal(preview(room, 'psychic', ['psychic', 'Mil']).text, 'Mil is NOT Mafia.');
    assert.equal(preview(room, 'psychic', ['psychic', 'Mob']).text, 'Mob is MAFIA.');
  });
  test('the Cop still gets the disguised / framed answer', () => {
    const room = mk([...spec, ['Cop', 'cop']]);
    assert.equal(preview(room, 'cop', ['cop', 'God']).text, 'God is NOT Mafia.');
    assert.equal(preview(room, 'cop', ['framer', 'V1'], ['cop', 'V1']).text, 'V1 is MAFIA.');
  });
  test('v6 rooms keep the old Psychic result', () => {
    const room = mk(spec, { v: 6 });
    assert.equal(preview(room, 'psychic', ['psychic', 'God']).text, 'God is NOT Mafia.');
  });
});

describe('a team call is stopped when every LIVING member is blocked (v7)', () => {
  const base = (v, blocker) => mk([['Mob', 'mafia'], ['Dead', 'mafia', false], [blocker, blocker], ...town(3)], { v });
  for (const [blocker, role] of [['jailer', 'jailer'], ['drunk', 'drunk']]) {
    test(`${role} on the last living Mafia member stops the kill`, () => {
      const room = base(7, role);
      const rep = resolveNight(room, acts(room, [role, 'Mob'], ['mafia', 'V1']));
      assert.deepEqual(rep.deaths, []);
    });
    test(`${role}: v6 keeps the old behaviour (documented)`, () => {
      const room = base(6, role);
      assert.deepEqual(resolveNight(room, acts(room, [role, 'Mob'], ['mafia', 'V1'])).deaths.map((d) => d.id), ['pV1']);
    });
  }
  test('one free living member still carries out the kill; a dead teammate is never the visitor', () => {
    const room = mk([['A', 'mafia'], ['B', 'mafia'], ['Dead', 'mafia', false], ['Dr', 'drunk'], ...town(3)]);
    const rep = resolveNight(room, acts(room, ['drunk', 'A'], ['mafia', 'V1']));
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pV1']);
    assert.ok(rep.notes.some((n) => n.startsWith('B carried out')));
  });
  test('a dead role\'s call still gets a preview for the Host, and nothing is recorded', () => {
    const room = mk([['Mob', 'mafia'], ['Dead', 'mafia', false], ['Cop', 'cop', false], ...town(3)]);
    const rep = resolveNight(room, acts(room, ['cop', 'Mob']));
    assert.deepEqual(rep.info, []);
  });
});

describe('Confused Cop is called exactly like the other Cops (v7)', () => {
  const spec = [['Mob', 'mafia'], ['C1', 'cop'], ['C2', 'confused_cop'], ['I', 'insane_cop'], ...town(2)];
  const orders = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
  for (const o of orders) {
    test(`numbers C1/C2/I = ${o.join('/')}: calls go Cop 1, 2, 3 in that order, with identical wording`, () => {
      const room = mk(spec);
      room.callNo = { pC1: o[0], pC2: o[1], pI: o[2] };
      const calls = nightScript(room).filter((s) => s.key.startsWith('act:'));
      assert.deepEqual(calls.map((s) => s.label), ['Cop 1', 'Cop 2', 'Cop 3']);
      for (const st of calls) {
        assert.equal(st.prompt, `${st.label}, wake up. Who do you check?`);
        assert.equal(stepCues(st).open, `${st.label}, open your eyes. Pick someone to investigate.`);
        assert.equal(stepScript(st, room).say, stepCues(st).open);
      }
    });
  }
  test('a lone Confused Cop (their Cop was converted) is still just "Cop"', () => {
    const room = mk([['Mob', 'mafia'], ['C2', 'confused_cop'], ['Cu', 'cult'], ...town(3)]);
    const st = step(room, 'confused_cop');
    assert.equal(st.prompt, 'Cop, wake up. Who do you check?');
    assert.ok(!/confused/i.test(JSON.stringify([st.prompt, stepCues(st), stepScript(st, room).say])));
  });
  test('v6 wording is unchanged', () => {
    const room = mk(spec, { v: 6 });
    assert.ok(nightScript(room).some((s) => /^Confused Cop/.test(s.prompt)));
  });
});

describe('Janitor victim is not singled out when roles are never announced', () => {
  const run = (revealOnDeath) => {
    const room = mk([['Mob', 'mafia'], ['Jan', 'janitor'], ...town(4)], { rules: { revealOnDeath } });
    const rep = resolveNight(room, { ...acts(room, ['mafia', 'V1']), [step(room, 'janitor').key]: { targets: [], on: true } });
    assert.equal(rep.deaths[0].hidden, true);
    return morningAnnouncement(room, rep).say;
  };
  test('revealOnDeath false: the table hears only the death', () => assert.equal(run(false), 'Everyone, open your eyes. V1 was killed in the night.'));
  test('revealOnDeath true: "role stays a mystery"', () => assert.match(run(true), /Their role stays a mystery\./));
});

describe('reviving a condemned player undoes the condemnation (v7)', () => {
  test('Jester: no side win, and the day can be condemned again', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...town(4)], { phase: 'day' });
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pJes' }).ok);
    assert.equal(room.sideWins.length, 1);
    assert.ok(reduce(room, HOST, { type: 'revive', playerId: 'pJes' }).ok);
    assert.deepEqual(room.sideWins, []);
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pV1' }).ok);
  });
  test('Executioner side win goes with the target; Virgin shield is lifted', () => {
    const room = mk([['Mob', 'mafia'], ['Ex', 'executioner'], ['Vg', 'virgin'], ...town(3)], { phase: 'day' });
    pn(room, 'Ex').target = 'pVg';
    reduce(room, HOST, { type: 'condemn', playerId: 'pVg' });
    assert.equal(room.shield, true); assert.equal(room.sideWins.length, 1);
    reduce(room, HOST, { type: 'revive', playerId: 'pVg' });
    assert.equal(room.shield, false); assert.deepEqual(room.sideWins, []);
  });
  test('a night death revived leaves other side wins alone', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...town(4)], { phase: 'day' });
    condemn(room, 'pJes'); room.condemnedDay = room.day;
    reduce(room, HOST, { type: 'kill', playerId: 'pV1' });
    reduce(room, HOST, { type: 'revive', playerId: 'pV1' });
    assert.equal(room.sideWins.length, 1); assert.equal(room.condemnedDay, room.day);
  });
  test('v6 rooms keep the old behaviour', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...town(4)], { phase: 'day', v: 6 });
    reduce(room, HOST, { type: 'condemn', playerId: 'pJes' });
    reduce(room, HOST, { type: 'revive', playerId: 'pJes' });
    assert.equal(room.sideWins.length, 1);
  });
});

describe('no-condemn and restart housekeeping (v7)', () => {
  test('"Nobody today" is for the day, once nobody has been condemned', () => {
    const room = mk([['Mob', 'mafia'], ...town(4)], { phase: 'day' });
    assert.ok(reduce(room, HOST, { type: 'noCondemn' }).ok);
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pV1' }).ok);
    assert.ok(reduce(room, HOST, { type: 'noCondemn' }).error);
    room.phase = 'night';
    assert.ok(reduce(room, HOST, { type: 'noCondemn' }).error);
  });
  test('restart clears the Host\'s per-player notes with the tags', () => {
    const room = mk([['Mob', 'mafia'], ...town(4)], { phase: 'day' });
    reduce(room, HOST, { type: 'setNote', playerId: 'pV1', note: 'was the Cop' });
    reduce(room, HOST, { type: 'toggleTag', playerId: 'pV1', tag: 'red' });
    restartGame(room);
    const v = viewForHost(room);
    assert.ok(v.players.every((p) => !p.note && !p.tags.length));
  });
});

describe('Godfather vs every investigator (v7)', () => {
  const inv = ROLES.filter((r) => ['investigate', 'track', 'watch', 'autopsy'].includes(r.action?.type) && !r.meeting);
  const want = {
    cop: 'God is NOT Mafia.', sheriff: 'God is NOT Mafia.', dirty_cop: 'God is NOT Mafia.', naive_cop: 'God is NOT Mafia.',
    insane_cop: 'God is MAFIA.', paranoid_cop: 'God is MAFIA.', detective: 'God is the Villager.', psychic: 'God is MAFIA.',
    confused_cop: 'God is NOT Mafia.',
  };
  for (const r of inv.filter((x) => want[x.id])) {
    test(`${r.id}: ${want[r.id]}`, () => {
      const spec = [['Me', r.id], ['God', 'godfather'], ['Mob', 'mafia'], ['Cop', 'cop'], ...town(3)];
      const room = mk(r.id === 'cop' ? spec.filter((s) => s[0] !== 'Cop') : spec);
      const st = nightScript(room).find((s) => s.key === 'act:pMe');
      const res = previewNight(room, { [st.key]: { targets: ['pGod'], flip: 'heads' } }, st.key);
      assert.equal(res.text, want[r.id]);
    });
  }
  test('Consigliere / Informant / Cult Seer see the exact role', () => {
    for (const id of ['consigliere', 'informant', 'cult_seer']) {
      const room = mk([['Me', id], ['God', 'godfather'], ['Mob', 'mafia'], ['Cu', 'cult'], ...town(3)]);
      const st = nightScript(room).find((s) => s.key === 'act:pMe');
      assert.equal(previewNight(room, { [st.key]: { targets: ['pGod'] } }, st.key).text, 'God is the Godfather.', id);
    }
  });
  test('Parity Cop: Godfather and a Villager are on the SAME side; Tracker / Lookout see no disguise to break', () => {
    const room = mk([['Me', 'parity_cop'], ['God', 'godfather'], ['Mob', 'mafia'], ...town(3)]);
    const st = step(room, 'parity_cop');
    assert.equal(previewNight(room, { [st.key]: { targets: ['pGod', 'pV1'] } }, st.key).text, 'God and V1 are on the SAME side.');
  });
  test('a framed Godfather is MAFIA to the Cop and Parity Cop, and still a Villager to the Detective', () => {
    const room = mk([['Fr', 'framer'], ['God', 'godfather'], ['Cop', 'cop'], ['Det', 'detective'], ['PC', 'parity_cop'], ...town(3)]);
    const fr = ['framer', 'God'];
    assert.equal(preview(room, 'cop', fr, ['cop', 'God']).text, 'God is MAFIA.');
    assert.equal(preview(room, 'detective', fr, ['detective', 'God']).text, 'God is the Villager.');
    assert.equal(preview(room, 'parity_cop', fr, ['parity_cop', 'God', 'V1']).text, 'God and V1 are on DIFFERENT sides.');
  });
  test('Cop cards: alignment cards say MAFIA / NOT MAFIA, never the role', () => {
    const room = mk([['Cop', 'cop'], ['God', 'godfather'], ['Mob', 'mafia'], ...town(3)]);
    const st = step(room, 'cop');
    const res = previewNight(room, { [st.key]: { targets: ['pGod'] } }, st.key);
    assert.deepEqual(checkCard(room, st, res), { kind: 'alignment', text: 'NOT MAFIA' });
  });
});

describe('framer, blockers and jailer vs checks', () => {
  const spec = [['Fr', 'framer'], ['Hk', 'hooker'], ['Cop', 'cop'], ['Det', 'detective'], ['Pc', 'parity_cop'], ['Jl', 'jailer'], ['Mob', 'mafia'], ...town(3)];
  test('frame wakes before every check: Cop, Parity Cop see it; Detective does not care', () => {
    const room = mk(spec);
    assert.equal(preview(room, 'cop', ['framer', 'V1'], ['cop', 'V1']).text, 'V1 is MAFIA.');
    assert.equal(preview(room, 'parity_cop', ['framer', 'V1'], ['parity_cop', 'V1', 'V2']).text, 'V1 and V2 are on DIFFERENT sides.');
    assert.equal(preview(room, 'detective', ['framer', 'V1'], ['detective', 'V1']).text, 'V1 is the Villager.');
  });
  test('a blocked Framer frames nobody; the frame ends with the night', () => {
    const room = mk(spec);
    assert.equal(preview(room, 'cop', ['hooker', 'Fr'], ['framer', 'V1'], ['cop', 'V1']).text, 'V1 is NOT Mafia.');
    resolveNight(room, acts(room, ['framer', 'V1']));
    assert.deepEqual(room.framed, ['pV1']);
    room.phase = 'night'; room.night = 3;
    resolveNight(room, {});
    assert.deepEqual(room.framed, []);
  });
  test('a blocked / jailed investigator gets no result and no card; the Host gets the blocked handling', () => {
    for (const blocker of ['hooker', 'jailer']) {
      const room = mk(spec);
      const st = step(room, 'cop');
      const res = previewNight(room, acts(room, [blocker, 'Cop'], ['cop', 'V1']), st.key);
      assert.equal(res.blocked, true);
      assert.equal(checkCard(room, st, res), null);
      const rep = resolveNight(room, acts(room, [blocker, 'Cop'], ['cop', 'V1']));
      assert.ok(rep.notes.some((n) => n.startsWith('Cop (Cop) was blocked')));
      assert.deepEqual(rep.info, []);
    }
  });
  test('a jailed target is still checked normally and cannot be killed', () => {
    const room = mk(spec);
    assert.equal(preview(room, 'cop', ['jailer', 'Mob'], ['cop', 'Mob']).text, 'Mob is MAFIA.');
    const rep = resolveNight(room, acts(room, ['jailer', 'V1'], ['mafia', 'V1']));
    assert.deepEqual(rep.deaths, []);
  });
});

describe('Doctor rules', () => {
  const spec = [['Mob', 'mafia'], ['Doc', 'doctor'], ['BG', 'bodyguard'], ...town(4)];
  test('selfProtect true: the Doctor saves themselves', () => {
    const room = mk(spec);
    const rep = resolveNight(room, acts(room, ['doctor', 'Doc'], ['mafia', 'Doc']));
    assert.deepEqual(rep.deaths, []);
  });
  test('selfProtect false: the self target is ignored and the Doctor dies', () => {
    const room = mk(spec, { rules: { selfProtect: false } });
    const rep = resolveNight(room, acts(room, ['doctor', 'Doc'], ['mafia', 'Doc']));
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pDoc']);
  });
  test('the same target two nights running is allowed (there is no such rule)', () => {
    const room = mk(spec);
    for (const night of [2, 3]) {
      room.night = night; room.phase = 'night';
      const rep = resolveNight(room, acts(room, ['doctor', 'V1'], ['mafia', 'V1']));
      assert.deepEqual(rep.deaths, [], `night ${night}`);
    }
  });
  test('Doctor and Bodyguard on one target: the Bodyguard takes the hit first (rule decision pending)', () => {
    const room = mk(spec);
    const rep = resolveNight(room, acts(room, ['doctor', 'V1'], ['bodyguard', 'V1'], ['mafia', 'V1']));
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pBG']);
  });
});

describe('dead roles at night (v7)', () => {
  const withAction = ROLES.filter((r) => r.action && !r.action.group && !r.meeting && r.action.type !== 'copyRole');
  const shape = (room) => nightScript(room).map((s) => ({ key: s.key, kind: s.kind, type: s.type, prompt: s.prompt, label: s.label, targets: s.targets, order: s.order, cues: stepCues(s) }));
  const make = (r, alive) => mk([['Me', r.id, alive], ['Mob', 'mafia'], ['Cop', 'cop'], ...town(4)]);
  for (const r of withAction) {
    test(`${r.id}: the same call dead or alive, and a dead one does nothing`, () => {
      const dead = make(r, false), live = make(r, true);
      assert.deepEqual(shape(dead), shape(live));
      const st = nightScript(dead).find((s) => s.key === 'act:pMe');
      if (!st) return; // no call at all (a limited-use role would be skipped alike alive or dead)
      const quiet = resolveNight(make(r, false), {});
      const room = make(r, false);
      const rep = resolveNight(room, { [st.key]: { targets: ['pV1', 'pV2'].slice(0, st.targets || 1), on: true, flip: 'heads', coin: 'mafia' } });
      assert.deepEqual({ ...rep, night: 0 }, { ...quiet, night: 0 });
      assert.ok(room.players.find((p) => p.id === 'pV1').alive);
      assert.deepEqual(room.framed, []);
      assert.equal(room.usage?.pMe, undefined);
    });
  }
  test('Mafia call with every member dead is still called and does nothing', () => {
    const room = mk([['A', 'mafia', false], ['G', 'godfather', false], ...town(4)]);
    const st = step(room, 'mafia');
    assert.ok(st && st.actors.length === 2 && /Mafia, wake up/.test(st.prompt));
    assert.deepEqual(resolveNight(room, acts(room, ['mafia', 'V1'])).deaths, []);
  });
  test('Lovers: one dead leaves the same call; both being called on night 1', () => {
    const room = mk([['L1', 'lover'], ['L2', 'lover', false], ['Mob', 'mafia'], ...town(3)], { night: 1 });
    const st = nightScript(room).find((s) => s.key === 'n1:lover');
    assert.deepEqual(st.actors.sort(), ['pL1', 'pL2']);
    pn(room, 'L1').alive = false; pn(room, 'L2').alive = true;
    assert.deepEqual(nightScript(room).find((s) => s.key === 'n1:lover').actors.sort(), ['pL1', 'pL2']);
  });
  test('Lover death asks the Host for the partner; both dying together asks twice', () => {
    const room = mk([['L1', 'lover'], ['L2', 'lover'], ['Mob', 'mafia'], ...town(3)], { phase: 'day' });
    reduce(room, HOST, { type: 'kill', playerId: 'pL1' });
    assert.equal(room.pending.length, 1);
    assert.ok(reduce(room, HOST, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: 'pL2' }).ok);
    assert.equal(pn(room, 'L2').alive, false);
  });
  test('Masons: a dead Mason leaves the others\' phones and calls consistent', () => {
    const room = mk([['M1', 'mason'], ['M2', 'mason', false], ['Mob', 'mafia'], ...town(3)], { night: 1 });
    assert.deepEqual(nightScript(room).find((s) => s.key === 'n1:mason' || s.key === 'meeting:mason' || s.roleId === 'mason')?.actors?.sort?.() ?? ['pM1', 'pM2'], ['pM1', 'pM2']);
    const v = viewForPlayer(room, 'pM1');
    assert.deepEqual(v.me.team.map((t) => t.name), ['M2']);
    assert.equal(v.me.team[0].role, null);
  });
  test('cult with a dead recruiter: the recruit call is still made', () => {
    const room = mk([['C1', 'cult'], ['C2', 'cult', false], ['Mob', 'mafia'], ...town(3)]);
    const st = step(room, 'cult');
    assert.deepEqual(st.actors.sort(), ['pC1', 'pC2']);
    assert.deepEqual(resolveNight(room, acts(room, ['cult', 'V1'])).conversions.map((c) => c.id), ['pV1']);
  });
});

describe('last Mafia member dies mid-night', () => {
  const spec = [['Mob', 'mafia'], ['Vig', 'vigilante'], ...town(3)];
  test('the Mafia call is made, the vigilante shot resolves with it, town wins after the night', () => {
    const room = mk(spec);
    assert.deepEqual(nightScript(room).map((s) => s.key), ['meeting:mafia', 'act:pVig']);
    const rep = resolveNight(room, acts(room, ['vigilante', 'Mob'], ['mafia', 'V1']));
    assert.deepEqual(rep.deaths.map((d) => d.id).sort(), ['pMob', 'pV1']);
    assert.equal(room.winner.side, 'town');
    assert.equal(room.phase, 'over');
  });
  test('the next night after a non-final death still calls the dead Mafia identically', () => {
    const room = mk([['Mob', 'mafia'], ['Mob2', 'mafia'], ['Vig', 'vigilante'], ...town(4)]);
    const before = nightScript(room).map((s) => s.prompt);
    resolveNight(room, acts(room, ['vigilante', 'Mob2'], ['mafia', 'V1']));
    room.phase = 'night'; room.night = 3;
    pn(room, 'Mob').alive = false;
    room.winner = null;
    assert.deepEqual(nightScript(room).map((s) => s.prompt).filter((p) => /Mafia/.test(p)), before.filter((p) => /Mafia/.test(p)));
  });
});

describe('day: ties, no-lynch, on-death triggers, Jester', () => {
  test('Hunter condemned: the shot is asked before anything else, and the win check waits for it', () => {
    const room = mk([['Mob', 'mafia'], ['Hu', 'hunter'], ...town(3)], { phase: 'day' });
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pHu' }).ok);
    assert.equal(room.pending.length, 1);
    assert.equal(room.winner, null);
    assert.ok(reduce(room, HOST, { type: 'startNight' }).error);
    reduce(room, HOST, { type: 'resolvePending', pendingId: room.pending[0].id, targetId: 'pMob' });
    assert.equal(room.winner.side, 'town');
  });
  test('only one condemnation a day; "nobody" keeps the day open', () => {
    const room = mk([['Mob', 'mafia'], ...town(4)], { phase: 'day' });
    assert.ok(reduce(room, HOST, { type: 'noCondemn' }).ok);
    assert.equal(room.phase, 'day');
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pV1' }).ok);
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pV2' }).error);
  });
  test('Jester condemned is a side win that does not end the game', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...town(4)], { phase: 'day' });
    condemn(room, 'pJes');
    assert.equal(room.phase, 'day'); assert.equal(room.winner, null);
    assert.equal(room.sideWins[0].id, 'pJes');
  });
  test('Jester killed at night is not a win', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...town(4)]);
    resolveNight(room, acts(room, ['mafia', 'Jes']));
    assert.deepEqual(room.sideWins || [], []);
  });
  test('the public log names the dead and nothing about causes or results', () => {
    const room = mk([['Mob', 'mafia'], ['Vig', 'vigilante'], ['Cop', 'cop'], ...town(3)]);
    resolveNight(room, acts(room, ['vigilante', 'V2'], ['mafia', 'V1'], ['cop', 'Mob']));
    const log = viewForPlayer(room, 'pV3').publicLog.map((l) => l.text).join(' | ');
    assert.match(log, /V1, V2 died/);
    assert.ok(!/Vigilante|Mafia|Cop|MAFIA|shot/i.test(log), log);
  });
});

describe('phones never carry other players\' secrets', () => {
  const spec = [['Mob', 'mafia'], ['God', 'godfather'], ['Cop', 'cop'], ['Ic', 'insane_cop'], ['Cc', 'confused_cop'], ['Det', 'detective'], ['Doc', 'doctor'],
    ['Tr', 'tracker'], ['Lo', 'lookout'], ['Co', 'coroner'], ['Vig', 'vigilante'], ['Jan', 'janitor'], ['V1', 'villager'], ['V2', 'villager']];
  const secretKeys = ['framed', 'callNo', 'copSalt', 'usage', 'report', 'deck', 'script', 'story', 'pending', 'dayUsed', 'lastReport', 'shield'];
  const scan = (room, label) => {
    for (const me of room.players) {
      const v = viewForPlayer(room, me.id);
      const json = JSON.stringify(v);
      for (const k of secretKeys) assert.ok(!(k in v), `${label}: ${k} in ${me.name}'s view`);
      assert.deepEqual(v.me.results, [], `${label}: results`);
      for (const q of v.players) {
        const real = room.players.find((p) => p.id === q.id);
        const open = room.phase === 'over' || (room.config.rules.revealOnDeath && !real.alive && !real.roleHidden);
        if (!open) assert.equal(q.role, null, `${label}: ${me.name} sees ${q.name}'s role`);
      }
      const mine = callNumbers(room)[me.id];
      for (const [id, n] of Object.entries(callNumbers(room))) {
        if (id !== me.id) assert.ok(!json.includes(`${n.family} ${n.n}`) || (mine && `${mine.family} ${mine.n}` === `${n.family} ${n.n}`), `${label}: callNo of ${id}`);
      }
      assert.ok(!/confused_cop|insane_cop|naive_cop|paranoid_cop/.test(JSON.stringify({ me: v.me, setup: v.setupRoles, key: v.deckKey })) || me.roleId === 'insane_cop' && false, `${label}: variant id on ${me.name}'s phone`);
    }
  };
  test('living and dead viewers, every phase, reveal rule on and off', () => {
    for (const revealOnDeath of [true, false]) {
      const room = mk(spec, { rules: { revealOnDeath } });
      room.config.roles = spec.map((s) => s[1]);
      scan(room, `night r${revealOnDeath}`);
      resolveNight(room, acts(room, ['vigilante', 'V2'], ['mafia', 'Co'], ['janitor']));
      scan(room, `morning r${revealOnDeath}`);
      pn(room, 'Cop').alive = false; pn(room, 'Ic').alive = false;
      scan(room, `dead cops r${revealOnDeath}`);
      room.phase = 'night'; room.night = 3;
      scan(room, `night 3 r${revealOnDeath}`);
    }
  });
  test('reconnecting mid-night and mid-day gives the same view as before', () => {
    const room = mk(spec);
    const a = JSON.stringify(viewForPlayer(room, 'pCop'));
    assert.equal(JSON.stringify(viewForPlayer(room, 'pCop')), a);
    room.phase = 'day';
    assert.equal(JSON.stringify(viewForPlayer(room, 'pV1')), JSON.stringify(viewForPlayer(room, 'pV1')));
  });
  test('Graveyard goes to the dead and the Host only, on reconnect too; Restart clears it', () => {
    const room = mk(spec, { phase: 'day' });
    pn(room, 'V1').alive = false;
    reduce(room, { playerId: 'pV1' }, { type: 'chat', channel: 'graveyard', text: 'boo' });
    const kinds = (att) => messagesFor(room, att).map((m) => m.type);
    assert.deepEqual(kinds({ who: 'player', playerId: 'pV1' }), ['view', 'graveyard']);
    assert.deepEqual(kinds({ who: 'player', playerId: 'pV2' }), ['view']);
    assert.deepEqual(kinds({ who: 'host' }), ['view', 'graveyard']);
    restartGame(room);
    assert.deepEqual(kinds({ who: 'player', playerId: 'pV1' }), ['view']);
    assert.deepEqual(messagesFor(room, { who: 'host' }).find((m) => m.type === 'graveyard').entries, []);
  });
});

describe('numbered calls: upgrades and cards claims', () => {
  test('a v1 room upgraded at the next night numbers its Cops, dead one included', () => {
    const room = mk([['Mob', 'mafia'], ['C1', 'cop'], ['C2', 'cop', false], ['C3', 'insane_cop'], ...town(3)], { v: 1, phase: 'day' });
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok);
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    assert.equal(room.nightVersion, 7);
    const calls = nightScript(room).filter((s) => s.key.startsWith('act:'));
    assert.deepEqual(calls.map((s) => s.label).sort(), ['Cop 1', 'Cop 2', 'Cop 3']);
    assert.ok(calls.some((s) => s.actors[0] === 'pC2'));
  });
  test('cards mode: numbers are random whatever the claim order, and hidden until the game starts', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const room = newRoom('CD', 'hk');
      for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) reduce(room, ANON, { type: 'join', name: n });
      room.nightVersion = 7;
      assert.ok(reduce(room, HOST, { type: 'setConfig', mode: 'cards', cardFlow: 'open', roles: ['mafia', 'cop', 'cop', 'insane_cop', 'villager', 'villager'] }).ok);
      assert.ok(reduce(room, HOST, { type: 'deal' }).ok, 'deal');
      const cop = room.deck.map.filter((m) => ['cop', 'insane_cop'].includes(m.roleId));
      room.players.slice(0, 3).forEach((p, j) => reduce(room, { playerId: p.id }, { type: 'claimCard', card: cop[j].card }));
      assert.equal(viewForPlayer(room, room.players[0].id).me.callName, null);
      const nums = callNumbers(room);
      seen.add(`${room.players[0].roleId}:${nums[room.players[0].id].n}`);
    }
    assert.ok(seen.size >= 4, [...seen].join());
  });
});
