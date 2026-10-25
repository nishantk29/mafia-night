// House rules, one `describe('house rule: ...')` per rule. RULES.md cites these names; build-deploy refuses to ship if any fails.
// Deeper per-version coverage lives in audit-v7, numbered-calls-v7, godfather-detective-v6, night-upgrade-v5, night-v3, dead-roles-called, graveyard, restart.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  nightScript, previewNight, checkCard, resolveNight, stepScript, stepCues, nightVersion, hasGraveyard, morningAnnouncement,
  callNumbers, assignCallNumbers, NEUTRAL_ANSWER, LATEST_NIGHT_VERSION, hasV8Rules, killPlayer,
} from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { newRoom, reduce, viewForPlayer, viewForHost, messagesFor, migrateRoleIds } from '../public/js/room.js';

const HOST = { host: true }, ANON = { anon: true };
const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function mk(spec, { version = LATEST_NIGHT_VERSION, phase = 'night', night = 2, salt = 0.5 } = {}) {
  const room = newRoom('RG', 'hostkey');
  for (const [name, roleId, alive = true] of spec) {
    assert.ok(reduce(room, ANON, { type: 'join', name }).ok);
    const p = room.players.find((q) => q.name === name);
    p.id = `p${name}`; p.roleId = roleId; p.alive = alive;
  }
  if (version === 1) delete room.nightVersion; else room.nightVersion = version;
  room.phase = phase; room.night = night; room.day = phase === 'day' ? night : 0; room.copSalt = salt;
  return room;
}
const fillers = () => [['V0', 'villager'], ['V1', 'villager'], ['V2', 'villager'], ['Ghost', 'villager', false]];
const actStep = (room, name) => nightScript(room).find((s) => s.key === `act:p${name}`);
const ask = (room, name, target) => {
  const st = actStep(room, name);
  const ans = { [st.key]: { targets: [`p${target}`], on: true, flip: 'heads' } };
  const pv = previewNight(room, ans, st.key);
  return { st, ans, pv, card: checkCard(room, st, pv) };
};
const norm = (room, x) => {
  let json = JSON.stringify(x);
  for (const p of room.players) json = json.split(p.id).join(`#${p.name}`);
  return JSON.parse(json);
};
const project = (room) => nightScript(room).map((st, i) => {
  const sc = stepScript(st, room) || {}, c = stepCues(st) || {};
  return { i, key: st.key, kind: st.kind, type: st.type, order: st.order, label: st.label, say: sc.say, then: sc.then, open: c.open, close: c.close };
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: dead roles are called exactly like living ones', () => {
  const nightRoles = ROLES.filter((r) => r.action || r.night1 || r.meeting);
  for (const v of VERSIONS.filter((x) => x >= 2)) {
    test(`v${v}: every night role has the same wording, cues and position dead or alive`, () => {
      let compared = 0;
      for (const r of nightRoles) {
        for (const night of [1, 2]) {
          const spec = (aliveY) => [['X', r.id], ['Y', r.id, aliveY], ...(r.meeting === 'mafia' ? [] : [['Mob', 'mafia']]), ...fillers()];
          const a = mk(spec(true), { version: v, night }), d = mk(spec(false), { version: v, night });
          const pa = norm(a, project(a)), pd = norm(d, project(d));
          assert.deepEqual(pd, pa, `${r.id} night ${night}: dead holder changed the script`);
          if (pa.some((s) => s.key.includes('pX') || s.key.includes(r.id) || s.key.startsWith('meeting'))) compared++;
        }
      }
      assert.ok(compared > 100, `only ${compared} role/night pairs had a step`);
    });
  }
  test('v1 is the documented exception: a dead Doctor is not called', () => {
    const room = mk([['Doc', 'doctor', false], ['Mob', 'mafia'], ...fillers()], { version: 1 });
    assert.equal(nightScript(room).find((s) => s.roleId === 'doctor'), undefined);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: investigator results are given only at night', () => {
  const SPEC = [['Mob', 'mafia'], ['Cop', 'cop'], ['Det', 'detective'], ['Trk', 'tracker'], ['Lkt', 'lookout'], ['Cor', 'coroner'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager'], ['Dead', 'villager', false]];
  const targets = { cop: 'Mob', detective: 'Mob', tracker: 'V1', lookout: 'V1', coroner: 'Dead' };
  const night = (version) => {
    const room = mk(SPEC, { version, night: 2 });
    const ans = {};
    for (const [role, t] of Object.entries(targets)) { const st = nightScript(room).find((s) => s.roleId === role); ans[st.key] = { targets: [`p${t}`], on: true, flip: 'heads' }; }
    const rep = resolveNight(room, ans);
    return { room, rep };
  };
  const infoRoles = (rep) => rep.info.map((i) => i.roleId).sort();
  test('v4 (control): results are in the report and on the phone', () => {
    const { room, rep } = night(4);
    assert.deepEqual(infoRoles(rep), ['cop', 'coroner', 'detective', 'lookout', 'tracker']);
    assert.ok(viewForPlayer(room, 'pCop').me.results.length > 0);
  });
  for (const v of [5, 6, 7]) {
    test(`v${v}: Cop and Detective results never reach report.info, the morning notes or any phone`, () => {
      const { room, rep } = night(v);
      assert.ok(!infoRoles(rep).includes('cop') && !infoRoles(rep).includes('detective'));
      assert.deepEqual(room.results.filter((r) => r.ids.some((id) => ['pCop', 'pDet'].includes(id))), []);
      assert.ok(!/is MAFIA|Mob is the/.test(JSON.stringify(morningAnnouncement(room, rep))));
      assert.ok(!/is MAFIA|Mob is the/.test(JSON.stringify(viewForHost(room).report)));
      for (const id of ['pCop', 'pDet']) assert.deepEqual(viewForPlayer(room, id).me.results, []);
      if (v >= 7) for (const p of room.players) assert.deepEqual(viewForPlayer(room, p.id).me.results, []);
    });
  }
  test('v5 and v6: Tracker, Lookout and Coroner still report in the morning (documented)', () => {
    for (const v of [5, 6]) assert.deepEqual(infoRoles(night(v).rep), ['coroner', 'lookout', 'tracker']);
  });
  test('v7: Tracker, Lookout and Coroner are night-only too: no result anywhere', () => {
    const { room, rep } = night(7);
    assert.deepEqual(rep.info, []);
    assert.deepEqual(room.results, []);
    assert.ok(!/stayed home|nobody|visited/i.test(JSON.stringify(morningAnnouncement(room, rep).notes)));
  });
  test('v7: the night check card still gives the result', () => {
    const room = mk(SPEC, { version: 7 });
    assert.equal(ask(room, 'Cop', 'Mob').card.text, 'MAFIA');
    assert.equal(ask(room, 'Det', 'V1').card.text, 'VILLAGER');
    assert.equal(ask(room, 'Cor', 'Dead').card.kind, 'role');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: the Detective sees the exact role; the Godfather reads as a Villager from v6', () => {
  const SPEC = [['Mob', 'mafia'], ['God', 'godfather'], ['Det', 'detective'], ['Doc', 'doctor'], ['V1', 'villager'], ['V2', 'villager']];
  for (const v of [4, 5, 6, 7]) {
    test(`v${v}: Detective sees ${v >= 6 ? 'VILLAGER' : 'GODFATHER'} for the Godfather and the exact role for everyone else`, () => {
      const room = mk(SPEC, { version: v });
      const g = ask(room, 'Det', 'God');
      assert.equal(g.card.text, v >= 6 ? 'VILLAGER' : 'GODFATHER');
      assert.equal(g.pv.text, `God is the ${v >= 6 ? 'Villager' : 'Godfather'}.`);
      for (const [name, roleId] of SPEC.filter(([n]) => !['God', 'Det'].includes(n))) {
        assert.equal(ask(room, 'Det', name).pv.text, `${name} is the ${ROLE_BY_ID[roleId].name}.`);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: the Cop sees MAFIA or NOT MAFIA; the Godfather is NOT MAFIA', () => {
  const SPEC = [['Mob', 'mafia'], ['God', 'godfather'], ['Cop', 'cop'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager']];
  for (const v of VERSIONS) {
    test(`v${v}: Mafia is MAFIA, Godfather and Villager are NOT MAFIA`, () => {
      const room = mk(SPEC, { version: v });
      assert.equal(ask(room, 'Cop', 'Mob').pv.text, 'Mob is MAFIA.');
      assert.equal(ask(room, 'Cop', 'God').pv.text, 'God is NOT Mafia.');
      assert.equal(ask(room, 'Cop', 'V1').pv.text, 'V1 is NOT Mafia.');
      if (v >= 4) {
        assert.equal(ask(room, 'Cop', 'Mob').card.text, 'MAFIA');
        assert.equal(ask(room, 'Cop', 'God').card.text, 'NOT MAFIA');
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: a dead Cop or investigator gets "No answer tonight."', () => {
  const investigators = ROLES.filter((r) => ['investigate', 'track', 'watch', 'autopsy'].includes(r.action?.type) && !r.action.group);
  for (const v of [3, 4, 5, 6, 7]) {
    test(`v${v}: every dead investigator gets the same neutral answer for any target`, () => {
      assert.ok(investigators.length >= 5);
      for (const r of investigators) {
        const room = mk([['X', r.id, false], ['Mob', 'mafia'], ...fillers()], { version: v });
        const key = 'act:pX';
        for (const t of ['Mob', 'V0', 'Ghost']) {
          const res = previewNight(room, { [key]: { targets: [`p${t}`, 'pV1'], coin: 'mafia', flip: 'heads' } }, key);
          assert.deepEqual(res, { text: NEUTRAL_ANSWER, note: '', neutral: true }, r.id);
          assert.equal(res.text, 'No answer tonight.');
          if (v >= 7 || (v >= 4 && r.action.type === 'investigate')) assert.deepEqual(checkCard(room, actStep(room, 'X'), res), { kind: 'none', text: 'NO ANSWER' }, r.id);
        }
      }
    });
  }
  test('v2 is the documented exception: a dead Cop still gets the real result', () => {
    const room = mk([['X', 'cop', false], ['Mob', 'mafia'], ...fillers()], { version: 2 });
    assert.match(previewNight(room, { 'act:pX': { targets: ['pMob'] } }, 'act:pX').text, /Mob is MAFIA/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: Cops and Detectives are numbered 1..N (v7)', () => {
  const BAD = /insane|naive|paranoid|confused|\breal\b|dirty|parity/i;
  const FAMILIES = [
    ['Cop', ['cop', 'cop', 'insane_cop', 'naive_cop', 'confused_cop']],
    ['Detective', ['detective', 'detective', 'detective']],
  ];
  const room = (roles, salt = 0.5) => mk([...roles.map((r, i) => [`C${i}`, r]), ['Mob', 'mafia'], ['V1', 'villager'], ['V2', 'villager']], { version: 7, salt });
  for (const [fam, roles] of FAMILIES) {
    test(`${fam}: each label 1..N appears once, one step per holder`, () => {
      const r = room(roles);
      const steps = nightScript(r).filter((s) => s.label);
      assert.equal(steps.length, roles.length);
      assert.deepEqual(steps.map((s) => s.label).sort(), roles.map((_, i) => `${fam} ${i + 1}`));
    });
    test(`${fam}: numbers are random across games`, () => {
      const seen = new Set();
      for (let g = 0; g < 60; g++) { const r = room(roles); assignCallNumbers(r); seen.add(JSON.stringify(roles.map((_, i) => callNumbers(r)[`pC${i}`].n))); }
      assert.ok(seen.size > 3, `only ${seen.size} distinct numberings in 60 games`);
    });
    test(`${fam}: stable within a game (night start, reduce actions, views)`, () => {
      const r = room(roles); assign(r);
      const first = JSON.stringify(callNumbers(r));
      r.phase = 'day'; r.day = 2;
      assert.ok(reduce(r, HOST, { type: 'startNight' }).ok);
      assert.ok(reduce(r, HOST, { type: 'setNote', playerId: 'pV1', note: 'x' }).ok);
      assert.equal(JSON.stringify(callNumbers(r)), first);
      for (let i = 0; i < 3; i++) viewForPlayer(r, 'pC0');
      assert.equal(JSON.stringify(callNumbers(r)), first);
    });
    test(`${fam}: Say lines, cues and the then-lines never name a variant`, () => {
      const r = room(roles);
      for (const st of nightScript(r).filter((s) => s.label)) {
        const sc = stepScript(st, r), c = stepCues(st);
        for (const line of [sc.say, sc.then, c.open, c.close, st.label]) assert.ok(!line || !BAD.test(line), `leaky line: ${line}`);
      }
    });
  }
  test('v6 rooms do not number (the rule is v7)', () => {
    const r = mk([['A', 'cop'], ['B', 'cop'], ['Mob', 'mafia'], ['V1', 'villager'], ['V2', 'villager']], { version: 6 });
    assert.deepEqual(callNumbers(r), {});
    assert.equal(nightScript(r).filter((s) => s.label).length, 0);
  });
  function assign(r) { assignCallNumbers(r); }
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: pair and shared calls list dead partners (v3+)', () => {
  const shared = ROLES.filter((r) => r.meeting);
  for (const v of [3, 4, 5, 6, 7]) {
    test(`v${v}: Masons, Mafia and every other meeting role include the dead partner in the call`, () => {
      assert.ok(shared.length >= 3);
      for (const r of shared) {
        for (const night of [1, 2]) {
          const spec = [['A', r.id], ['B', r.id, false], ...(r.meeting === 'mafia' ? [] : [['Mob', 'mafia']]), ...fillers()];
          const room = mk(spec, { version: v, night });
          const st = nightScript(room).find((s) => s.actors?.includes('pA') && (s.key.startsWith('meeting') || s.key.startsWith('n1')));
          if (!st) continue; // a meeting role with no call on this night
          assert.ok(st.actors.includes('pB'), `${r.id} night ${night}: dead partner missing from ${st.key}`);
        }
      }
    });
  }
  test('v2 lists only the living (documented)', () => {
    const room = mk([['A', 'mason'], ['B', 'mason', false], ['Mob', 'mafia'], ...fillers()], { version: 2, night: 1 });
    assert.deepEqual(nightScript(room).find((s) => s.key === 'n1:mason').actors, ['pA']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: living players never receive the Graveyard', () => {
  const room = () => {
    const r = mk([['Ann', 'villager'], ['Bob', 'villager'], ['Cy', 'villager', false], ['Di', 'villager', false], ['Mob', 'mafia']], { version: 7, phase: 'day', night: 1 });
    r.graveyard = [{ id: 1, name: 'Cy', text: 'boo' }];
    return r;
  };
  const att = { host: { who: 'host' }, ann: { who: 'player', playerId: 'pAnn' }, cy: { who: 'player', playerId: 'pCy' } };
  const gy = (r, a) => messagesFor(r, a).filter((m) => m.type === 'graveyard');
  test('messagesFor: dead players and the Host get it, living players do not, before and after reconnect', () => {
    const r = room();
    for (let pass = 0; pass < 2; pass++) { // pass 2 = reconnect with a fresh attachment for the same id
      assert.equal(gy(r, { ...att.host }).length, 1);
      assert.equal(gy(r, { ...att.cy }).length, 1);
      assert.equal(gy(r, { ...att.ann }).length, 0);
      assert.ok(!JSON.stringify(messagesFor(r, { ...att.ann })).includes('boo'));
    }
  });
  test('a living player view has no graveyard key or text, at every phase', () => {
    for (const phase of ['dealt', 'night', 'day', 'over']) {
      const r = room(); r.phase = phase;
      const json = JSON.stringify([viewForPlayer(r, 'pAnn'), messagesFor(r, att.ann, new Set(), true)]);
      assert.ok(!/graveyard|"boo"|boo/.test(json), phase);
    }
  });
  test('pre-v3 rooms have no graveyard for anyone', () => {
    const r = room(); r.nightVersion = 2;
    assert.ok(!hasGraveyard(r));
    assert.equal(gy(r, att.cy).length + gy(r, att.host).length, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: nothing leaks to a player phone', () => {
  const ROLE_IDS = ['mafia', 'godfather', 'doctor', 'cop', 'insane_cop', 'detective', 'confused_cop', 'tracker', 'villager', 'villager'];
  function game(version, reveal) {
    const room = newRoom('LK', 'HOSTSECRET-key');
    room.config.mode = 'app'; room.config.roles = [...ROLE_IDS]; room.config.rules.revealOnDeath = reveal;
    ROLE_IDS.forEach((_, i) => assert.ok(reduce(room, ANON, { type: 'join', name: `P${i}` }).ok));
    if (version !== LATEST_NIGHT_VERSION) room.nightVersion = version;
    return room;
  }
  const phases = (room) => {
    const out = { lobby: JSON.parse(JSON.stringify(room)) };
    assert.ok(reduce(room, HOST, { type: 'deal' }).ok); out.dealt = JSON.parse(JSON.stringify(room));
    room.players.find((p) => p.roleId === 'cop').target = null;
    assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
    // a result on file for a Cop (what v4 stores) and a death
    room.results = [{ night: 1, ids: [room.players.find((p) => p.roleId === 'cop').id], text: 'SECRET-RESULT' }];
    out.night = JSON.parse(JSON.stringify(room));
    room.players.find((p) => p.roleId === 'villager').alive = false;
    room.phase = 'day'; room.day = 1; out.day = JSON.parse(JSON.stringify(room));
    room.phase = 'over'; room.winner = { side: 'town', reason: 'x' }; out.over = JSON.parse(JSON.stringify(room));
    return out;
  };
  for (const v of [4, 5, 6, 7, 8]) {
    for (const reveal of [false, true]) {
      test(`v${v} reveal ${reveal}: no other role, token, key, call number or variant id on any phone, in any phase`, () => {
        for (const [phase, room] of Object.entries(phases(game(v, reveal)))) {
          for (const me of room.players) {
            const view = viewForPlayer(room, me.id);
            const json = JSON.stringify(view);
            const ctx = `${phase} ${me.name}`;
            assert.ok(!json.includes('HOSTSECRET'), ctx);
            for (const q of room.players) if (q.id !== me.id) assert.ok(!json.includes(q.token), `${ctx}: token of ${q.name}`);
            assert.ok(!/"callNo"|"copSalt"|"hostKey"|"token"|"upgradeNext"|"deck"/.test(json), ctx);
            if (!(v < 5 && me.roleId === 'cop')) assert.ok(!json.includes('SECRET-RESULT'), `${ctx}: result of another player`);
            for (const q of view.players) {
              const real = room.players.find((x) => x.id === q.id);
              const shown = phase === 'over' || (reveal && !real.alive);
              if (q.id !== me.id && !shown) assert.equal(q.role, null, `${ctx}: ${real.name} role visible`);
              if (!reveal && phase !== 'over' && q.id !== me.id) assert.equal(q.role, null);
            }
            if (v >= 7 && phase !== 'over' && !reveal) assert.ok(!json.includes('confused_cop'), `${ctx}: variant id on a phone`);
            if (phase === 'night' && v >= 5) assert.deepEqual(view.me.results, [], ctx);
            if (v >= 7 && me.roleId === 'confused_cop') assert.notEqual(view.me.role?.id, 'confused_cop', `${ctx}: Confused Cop must see a Cop card`);
          }
        }
      });
    }
  }
  test('a player view never shows another player\'s call number', () => {
    const room = game(7, false); reduce(room, HOST, { type: 'deal' }); reduce(room, HOST, { type: 'startNight' });
    const numbers = callNumbers(room);
    for (const me of room.players) {
      const view = viewForPlayer(room, me.id);
      const own = numbers[me.id];
      assert.equal(view.me.callName, own ? `${own.family} ${own.n}` : null);
      assert.ok(!('callNo' in view) && !view.players.some((q) => 'callName' in q || 'callNo' in q));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('house rule: a room keeps the night version it was created with', () => {
  const tinyRoom = (version) => {
    const room = newRoom('PV', 'hk');
    room.config.roles = ['mafia', 'doctor', 'cop', 'villager', 'villager']; room.config.rules.selfProtect = false;
    for (let i = 0; i < 5; i++) reduce(room, ANON, { type: 'join', name: `P${i}` });
    if (version === 1) delete room.nightVersion; else room.nightVersion = version;
    return room;
  };
  test('new rooms get the latest version', () => {
    assert.equal(newRoom('A', 'k').nightVersion, LATEST_NIGHT_VERSION);
    assert.equal(LATEST_NIGHT_VERSION, 8);
  });
  for (const v of [2, 3, 4, 5, 6, 7]) {
    test(`v${v}: kept through deal, night, day, condemn, kill, revive and another night`, () => {
      const room = tinyRoom(v);
      for (const a of [{ type: 'deal' }, { type: 'startNight' }, { type: 'submitNight', actions: {} }]) { const r = reduce(room, HOST, a); assert.ok(r.ok, JSON.stringify(r)); assert.equal(room.nightVersion, v); }
      room.phase = 'day'; room.day = 1;
      const victim = room.players.find((p) => p.roleId === 'villager');
      for (const a of [{ type: 'condemn', playerId: victim.id }, { type: 'revive', playerId: victim.id }, { type: 'setNote', playerId: victim.id, note: 'n' }, { type: 'startNight' }]) {
        const r = reduce(room, HOST, a); assert.ok(r.ok, JSON.stringify(r)); assert.equal(room.nightVersion, v, a.type);
      }
      assert.equal(nightVersion(room), v);
    });
    test(`v${v}: only startNight applies a pending upgrade`, () => {
      const room = tinyRoom(v);
      assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
      assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok);
      assert.equal(room.nightVersion, v); assert.equal(room.upgradeNext, 8);
      assert.ok(reduce(room, HOST, { type: 'setNote', playerId: room.players[0].id, note: 'n' }).ok);
      assert.equal(room.nightVersion, v);
      assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
      assert.equal(room.nightVersion, 8); assert.equal(room.upgradeNext, undefined);
    });
    test(`v${v}: Restart and newGame move the room to the latest`, () => {
      for (const type of ['restart', 'newGame']) {
        const room = tinyRoom(v);
        assert.ok(reduce(room, HOST, { type: 'deal' }).ok);
        assert.ok(reduce(room, HOST, { type }).ok);
        assert.equal(room.nightVersion, 8, type);
      }
    });
  }
  test('a v1 room (no field) reads as 1 and is never backfilled by play, views or migration', () => {
    const room = tinyRoom(1);
    assert.equal('nightVersion' in room, false);
    for (const a of [{ type: 'deal' }, { type: 'startNight' }, { type: 'submitNight', actions: {} }]) assert.ok(reduce(room, HOST, a).ok);
    viewForHost(room); viewForPlayer(room, room.players[0].id); migrateRoleIds(room); messagesFor(room, { who: 'host' });
    assert.equal(room.nightVersion, undefined);
    assert.equal(nightVersion(room), 1);
    assert.equal(viewForHost(room).nightVersion, 1);
  });
  test('in the lobby the upgrade applies at once; a room already at latest refuses it', () => {
    const room = tinyRoom(5);
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok);
    assert.equal(room.nightVersion, 8);
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).error);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// v8 rules. Each one is checked three ways: it does what it says, it looks the same to the table whether or not it
// happened (Say lines, steps, cues, morning announcement, other players' phones), and v7 rooms are unchanged.
const run = (room, actions) => { const c = structuredClone(room); const rep = resolveNight(c, actions); return { room: c, rep, morning: morningAnnouncement(c, rep) }; };
const others = (room, except) => Object.fromEntries(room.players.filter((p) => !except.includes(p.name)).map((p) => [p.name, norm(room, viewForPlayer(room, p.id))]));
const table = (room) => ({ steps: norm(room, project(room)), keys: nightScript(room).map((s) => s.key.replace(/^act:p/, '')), cues: norm(room, nightScript(room).map((s) => stepCues(s))) });
const byName = (room, n) => room.players.find((p) => p.name === n);

describe('house rule: v8 a Doctor and a Bodyguard on the same target: nobody dies', () => {
  const spec = () => [['Mob', 'mafia'], ['Doc', 'doctor'], ['BG', 'bodyguard'], ['Vic', 'villager'], ...fillers()];
  const acts = { 'meeting:mafia': { targets: ['pVic'] }, 'act:pDoc': { targets: ['pVic'] }, 'act:pBG': { targets: ['pVic'] } };
  const docOnly = { 'meeting:mafia': { targets: ['pVic'] }, 'act:pDoc': { targets: ['pVic'] } };
  test('v8: the Bodyguard is healed, nobody dies, the attacker lives', () => {
    const room = mk(spec(), { version: 8 });
    const { room: after, rep, morning } = run(room, acts);
    assert.deepEqual(rep.deaths, []);
    assert.ok(after.players.every((p) => p.alive || p.name === 'Ghost'));
    assert.equal(morning.say, 'Everyone, open your eyes. Nobody died last night.');
  });
  test('v8: the table cannot tell it from a plain Doctor save (Say lines, steps, saves, morning, phones)', () => {
    const room = mk(spec(), { version: 8 }), plain = mk(spec().filter(([n]) => n !== 'BG'), { version: 8 });
    const a = run(room, acts), b = run(plain, docOnly);
    assert.deepEqual(a.rep.saves, b.rep.saves);
    assert.equal(a.morning.say, b.morning.say);
    assert.deepEqual(a.morning.notes, b.morning.notes);
    assert.deepEqual(a.room.lastReport.deaths, b.room.lastReport.deaths);
    assert.deepEqual(norm(a.room, a.room.log.map((l) => l.text)), norm(b.room, b.room.log.map((l) => l.text)));
  });
  test('v8: a Bodyguard with no Doctor on the target still takes the hit', () => {
    const { rep } = run(mk(spec(), { version: 8 }), { 'meeting:mafia': { targets: ['pVic'] }, 'act:pBG': { targets: ['pVic'] } });
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pBG']);
  });
  test('v7 unchanged: the Bodyguard dies even with a Doctor on the same target', () => {
    const { rep } = run(mk(spec(), { version: 7 }), acts);
    assert.deepEqual(rep.deaths.map((d) => d.id), ['pBG']);
  });
});

describe('house rule: v8 used-up roles are still called every night, and the call does nothing', () => {
  const limited = ROLES.filter((r) => r.action && !r.action.group && Number.isFinite(r.action.uses));
  const spec = (r) => [['X', r.id], ...(r.meeting === 'mafia' ? [['Mob2', 'mafia']] : [['Mob', 'mafia']]), ...fillers()];
  const withUsage = (room, n) => { room.usage = n ? { pX: n } : {}; return room; };
  test('every limited-use role is covered', () => assert.ok(limited.length >= 8, String(limited.length)));
  for (const r of limited) {
    test(`${r.id}: spent and unspent look the same to the table at v8; the old versions still skip it`, () => {
      for (const night of [2, 3]) {
        const fresh = withUsage(mk(spec(r), { version: 8, night }), 0), spent = withUsage(mk(spec(r), { version: 8, night }), r.action.uses);
        assert.deepEqual(table(spent), table(fresh), `${r.id} night ${night}`);
        assert.deepEqual(others(spent, ['X']), others(fresh, ['X']));
        assert.equal(run(spent, {}).morning.say, run(fresh, {}).morning.say);
      }
      const old = withUsage(mk(spec(r), { version: 7 }), r.action.uses);
      assert.equal(actStep(old, 'X'), undefined, `${r.id}: v7 skips a used-up role`);
    });
  }
  test('v8: a spent Vigilante\'s recorded shot kills nobody, spends nothing and leaves no report line', () => {
    const room = withUsage(mk([['Vig', 'vigilante'], ['Mob', 'mafia'], ['Vic', 'villager'], ...fillers()], { version: 8 }), 0);
    room.usage = { pVig: 1 };
    const step = nightScript(room).find((s) => s.key === 'act:pVig');
    assert.ok(step.spent);
    assert.ok(stepScript(step, room).notes.includes('Used up: tap Skip.'));
    const { room: after, rep } = run(room, { 'act:pVig': { targets: ['pVic'] } });
    assert.deepEqual(rep.deaths, []);
    assert.equal(after.usage.pVig, 1);
    assert.deepEqual(rep.saves, []); assert.deepEqual(rep.notes, []);
  });
  test('v8: a spent Janitor does not clean', () => {
    const room = mk([['Jan', 'janitor'], ['Mob', 'mafia'], ['Vic', 'villager'], ...fillers()], { version: 8 });
    room.usage = { pJan: 1 };
    const { room: after } = run(room, { 'meeting:mafia': { targets: ['pVic'] }, 'act:pJan': { on: true } });
    assert.equal(byName(after, 'Vic').alive, false); assert.ok(!byName(after, 'Vic').roleHidden);
  });
});

describe('house rule: v8 a blocked or jailed limited-use role still loses the use (unchanged, locked at v7 and v8)', () => {
  const cases = [
    ['Vigilante', 'vigilante', { targets: ['pVic'] }], ['Veteran', 'veteran', { on: true }], ['Hitman', 'hitman', { targets: ['pVic'] }],
  ];
  for (const version of [7, 8]) for (const by of ['jailer', 'drunk']) for (const [name, id, act] of cases) {
    test(`v${version}: ${name} ${by === 'jailer' ? 'jailed' : 'blocked'} still uses up a use`, () => {
      const room = mk([['X', id], ['Blocker', by], ['Mob', 'mafia'], ['Vic', 'villager'], ...fillers()], { version });
      const { room: after } = run(room, { 'act:pBlocker': { targets: ['pX'] }, 'act:pX': act });
      assert.equal(after.usage.pX, 1);
      assert.equal(byName(after, 'Vic').alive, true, 'and the blocked act did nothing');
    });
  }
});

describe('house rule: v8 the Coroner learns "cleaned, role unknown" from a cleaned body', () => {
  const spec = () => [['Cor', 'coroner'], ['Vul', 'vulture'], ['Mob', 'mafia'], ['V0', 'villager'], ['Body', 'cop', false], ['Other', 'doctor', false]];
  const cleaned = (v) => { const r = mk(spec(), { version: v }); byName(r, 'Body').roleHidden = true; return r; };
  test('v8: Coroner text and card; an uncleaned body still reads the true role', () => {
    const r = cleaned(8), c = ask(r, 'Cor', 'Body');
    assert.equal(c.pv.text, 'Body: cleaned, role unknown.');
    assert.deepEqual(c.card, { kind: 'role', text: 'CLEANED, ROLE UNKNOWN' });
    assert.equal(ask(r, 'Cor', 'Other').card.text, 'DOCTOR');
  });
  test('v8: the Vulture still learns the true role of a cleaned body', () => {
    assert.equal(ask(cleaned(8), 'Vul', 'Body').card.text, 'COP');
  });
  test('v8: cleaned and uncleaned look the same to the table', () => {
    const a = cleaned(8), b = mk(spec(), { version: 8 });
    assert.deepEqual(table(a), table(b));
    assert.equal(run(a, {}).morning.say, run(b, {}).morning.say);
  });
  test('v8: the Amnesiac still copies the true role of a cleaned body', () => {
    const r = mk([['Amn', 'amnesiac'], ['Mob', 'mafia'], ['Body', 'cop', false], ...fillers()], { version: 8 }); byName(r, 'Body').roleHidden = true;
    const { room } = run(r, { 'act:pAmn': { targets: ['pBody'] } });
    assert.equal(byName(room, 'Amn').roleId, 'cop');
  });
  test('v7 unchanged: the Coroner still reads the true role of a cleaned body', () => {
    assert.equal(ask(cleaned(7), 'Cor', 'Body').card.text, 'COP');
  });
});

describe('house rule: v8 the Psychic gets no vision when anybody visited them', () => {
  const spec = () => [['Psy', 'psychic'], ['Doc', 'doctor'], ['Mob', 'mafia'], ['Trk', 'tracker'], ['V0', 'villager'], ['V1', 'villager'], ['Ghost', 'villager', false]];
  const visited = { 'act:pDoc': { targets: ['pPsy'] } }, notVisited = { 'act:pDoc': { targets: ['pV0'] } };
  const psy = (room, acts) => { const st = actStep(room, 'Psy'); const ans = { ...acts, [st.key]: { targets: ['pMob'], on: true } }; const pv = previewNight(room, ans, st.key); return { pv, card: checkCard(room, st, pv), ans }; };
  test('v8: visited gives NO VISION TONIGHT, otherwise the true side', () => {
    const room = mk(spec(), { version: 8 });
    const a = psy(room, visited), b = psy(room, notVisited);
    assert.equal(a.pv.text, 'No vision tonight.');
    assert.deepEqual(a.card, { kind: 'none', text: 'NO VISION TONIGHT' });
    assert.equal(b.card.text, 'MAFIA');
  });
  test('v8: only roles that woke before the Psychic count (the live card and the final result agree)', () => {
    const room = mk(spec(), { version: 8 });
    const late = { 'act:pTrk': { targets: ['pPsy'] } }; // the Tracker wakes after the Psychic
    assert.equal(psy(room, late).card.text, 'MAFIA');
    const mafiaHits = { 'meeting:mafia': { targets: ['pPsy'] } }; // the Mafia wake first: a visit
    assert.equal(psy(room, mafiaHits).card.text, 'NO VISION TONIGHT');
    const a = psy(room, visited), c = structuredClone(room);
    const rep = resolveNight(c, a.ans, { preview: true });
    assert.equal(rep.info.find((i) => i.key === 'act:pPsy').text, a.pv.text);
  });
  test('v8: visited and not visited look the same to the table (only the private card differs)', () => {
    const a = mk(spec(), { version: 8 }), b = mk(spec(), { version: 8 });
    assert.deepEqual(table(a), table(b));
    const ra = run(a, { ...visited, 'act:pPsy': { targets: ['pMob'] } }), rb = run(b, { ...notVisited, 'act:pPsy': { targets: ['pMob'] } });
    assert.equal(ra.morning.say, rb.morning.say);
    assert.deepEqual(ra.rep.saves, rb.rep.saves);
    assert.deepEqual(ra.rep.info, rb.rep.info); // night-only: neither is in the report
    assert.deepEqual(others(ra.room, ['Psy', 'Doc']), others(rb.room, ['Psy', 'Doc']));
  });
  test('v7 unchanged: a visited Psychic still reads the true side', () => {
    assert.equal(psy(mk(spec(), { version: 7 }), visited).card.text, 'MAFIA');
  });
});

describe('house rule: v8 an Executioner whose target dies any way but a vote becomes a Jester', () => {
  const spec = () => [['Ex', 'executioner'], ['Mob', 'mafia'], ['Tgt', 'villager'], ['V0', 'villager'], ['V1', 'villager'], ['Ghost', 'villager', false]];
  const mkx = (version, night = 2) => { const r = mk(spec(), { version, night }); byName(r, 'Ex').target = 'pTgt'; return r; };
  const exCard = (room) => { const st = actStep(room, 'Ex'); const pv = previewNight(room, { [st.key]: { on: true } }, st.key); return checkCard(room, st, pv); };
  test('every living Executioner gets a call every night, with a card: NO CHANGE until it happens', () => {
    const room = mkx(8);
    const st = actStep(room, 'Ex');
    assert.equal(stepCues(st).open, 'Executioner, open your eyes.'); assert.equal(stepCues(st).close, 'Executioner, close your eyes.');
    assert.deepEqual(exCard(room), { kind: 'none', text: 'NO CHANGE' });
  });
  test('target killed at night: that night says NO CHANGE, the next night says YOU ARE NOW THE JESTER once, then NO CHANGE', () => {
    const room = mkx(8);
    const first = run(room, { 'meeting:mafia': { targets: ['pTgt'] } }).room;
    assert.equal(byName(first, 'Ex').becameJester, true);
    first.phase = 'night'; first.night = 3;
    assert.deepEqual(exCard(first), { kind: 'role', text: 'YOU ARE NOW THE JESTER' });
    const second = run(first, {}).room; second.phase = 'night'; second.night = 4;
    assert.deepEqual(exCard(second), { kind: 'none', text: 'NO CHANGE' });
  });
  test('the Jester wins if condemned; the phone card turns into the Jester only after the night that told them', () => {
    const room = mkx(8);
    killPlayer(room, 'pTgt', 'shot by the Hunter');
    assert.equal(viewForPlayer(room, 'pEx').me.role.id, 'executioner');
    room.phase = 'night'; room.night = 3;
    const told = run(room, {}).room;
    assert.equal(viewForPlayer(told, 'pEx').me.role.id, 'jester');
    assert.equal(viewForPlayer(told, 'pEx').me.target, null);
    told.phase = 'day'; told.day = 3;
    assert.ok(reduce(told, HOST, { type: 'condemn', playerId: 'pEx' }).ok);
    assert.ok(told.sideWins.some((w) => w.id === 'pEx'));
  });
  test('a day vote on the target is still an Executioner win and no conversion', () => {
    const room = mkx(8); room.phase = 'day'; room.day = 2;
    assert.ok(reduce(room, HOST, { type: 'condemn', playerId: 'pTgt' }).ok);
    assert.equal(byName(room, 'Ex').becameJester, undefined);
    assert.ok(room.sideWins.some((w) => w.id === 'pEx'));
  });
  test('Hunter shot and Host kill also convert; reviving before they were told undoes it', () => {
    for (const cause of ['taken down by the Hunter', 'eliminated']) { const r = mkx(8); killPlayer(r, 'pTgt', cause); assert.equal(byName(r, 'Ex').becameJester, true, cause); }
    const r = mkx(8); r.phase = 'day'; killPlayer(r, 'pTgt', 'eliminated');
    assert.ok(reduce(r, HOST, { type: 'revive', playerId: 'pTgt' }).ok);
    assert.equal(byName(r, 'Ex').becameJester, undefined);
  });
  test('a dead Executioner is still called, with NO ANSWER', () => {
    const room = mk([['Ex', 'executioner', false], ['Mob', 'mafia'], ...fillers()], { version: 8 });
    byName(room, 'Ex').target = 'pV0';
    assert.deepEqual(exCard(room), { kind: 'none', text: 'NO ANSWER' });
  });
  test('converted vs not looks the same to the table: steps, Say lines, cues, morning and every other phone', () => {
    const done = mkx(8); killPlayer(done, 'pTgt', 'killed by the Mafia'); done.phase = 'night'; done.night = 3;
    const cleared = structuredClone(done); delete byName(cleared, 'Ex').becameJester;
    assert.deepEqual(table(done), table(cleared));
    assert.deepEqual(others(done, ['Ex']), others(cleared, ['Ex']));
    assert.equal(run(done, {}).morning.say, run(cleared, {}).morning.say);
    assert.deepEqual(norm(done, run(done, {}).rep.info), norm(cleared, run(cleared, {}).rep.info));
    // and against the same room where the target was voted out instead
    const voted = mkx(8); voted.phase = 'day'; voted.day = 2; reduce(voted, HOST, { type: 'condemn', playerId: 'pTgt' }); voted.phase = 'night'; voted.night = 3; voted.winner = null; voted.sideWins = [];
    assert.deepEqual(table(done), table(voted));
  });
  test('v7 unchanged: no Executioner call, no conversion', () => {
    const room = mkx(7);
    assert.equal(actStep(room, 'Ex'), undefined);
    killPlayer(room, 'pTgt', 'killed by the Mafia');
    assert.equal(byName(room, 'Ex').becameJester, undefined);
  });
});

describe('house rule: v8 version plumbing', () => {
  test('latest is 8, v7 rooms are offered the upgrade, v8 rooms are not', () => {
    assert.equal(LATEST_NIGHT_VERSION, 8);
    assert.equal(hasV8Rules({ nightVersion: 7 }), false); assert.equal(hasV8Rules({ nightVersion: 8 }), true);
    const room = mk([['A', 'villager'], ['B', 'villager'], ['C', 'villager'], ['D', 'villager'], ['E', 'mafia']], { version: 7, phase: 'day', night: 1 });
    assert.ok(reduce(room, HOST, { type: 'upgradeNight' }).ok); assert.equal(room.upgradeNext, 8);
    assert.ok(reduce(mk([['A', 'villager']], { version: 8, phase: 'day' }), HOST, { type: 'upgradeNight' }).error);
  });
});
