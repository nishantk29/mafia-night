import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestRoles, dealRoles, buildDeckMap, isCard, nightScript, resolveNight, condemn, resolvePending,
  checkWin, finalWinners, playerById, FULL_DECK,
} from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID, factionOf } from '../public/js/roles.js';
import { newRoom, reduce } from '../public/js/room.js';

// ---------- helpers ----------
// spec: [[name, roleId], ...]. Players join through the real reducer, then roles are set directly.
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
const filler = (n, start = 1) => Array.from({ length: n }, (_, i) => [`Fill${start + i}`, 'villager']);
const alive = (room, name) => P(room, name).alive;
const sorted = (a) => [...a].sort();
const infoText = (rep) => rep.info.map((i) => i.text).join(' | ');

// ---------- suggestRoles ----------
describe('suggestRoles', () => {
  for (let n = 5; n <= 50; n++) {
    test(`n=${n}: valid, sane mafia count`, () => {
      const roles = suggestRoles(n);
      assert.equal(roles.length, n);
      for (const r of roles) assert.ok(ROLE_BY_ID[r], `unknown role ${r}`);
      const mafia = roles.filter((r) => factionOf(r) === 'mafia');
      assert.ok(mafia.length >= 1, 'needs a mafia-aligned role');
      assert.ok(mafia.length <= n / 3, `mafia ${mafia.length} > n/3 for n=${n}`);
    });
  }

  test('never suggests a lone Mason (Masons must know each other)', () => {
    const bad = [];
    for (let n = 5; n <= 50; n++) {
      const masons = suggestRoles(n).filter((r) => r === 'mason').length;
      if (masons === 1) bad.push(n);
    }
    // BUG: TOWN_PRIORITY lists 'mason' twice back to back; when powerSlots cuts between them
    // (e.g. n=21) a single Mason is dealt, who has nobody to meet.
    assert.deepEqual(bad, [], `lone Mason for n=${bad.join(',')}`);
  });
});

// ---------- dealRoles ----------
describe('dealRoles', () => {
  test('every player gets one role; multiset preserved', () => {
    for (const n of [5, 12, 30, 50]) {
      const roles = suggestRoles(n);
      const ids = Array.from({ length: n }, (_, i) => 'p' + i);
      const map = dealRoles(roles, ids);
      assert.deepEqual(Object.keys(map).sort(), [...ids].sort());
      assert.deepEqual(sorted(Object.values(map)), sorted(roles));
    }
  });
  test('does not mutate the input roles array', () => {
    const roles = suggestRoles(10); const copy = [...roles];
    dealRoles(roles, Array.from({ length: 10 }, (_, i) => 'p' + i));
    assert.deepEqual(roles, copy);
  });
});

// ---------- buildDeckMap ----------
describe('buildDeckMap', () => {
  for (const style of ['fixed', 'random']) {
    for (const n of [5, 12, 30, 50]) {
      test(`${style} n=${n}`, () => {
        const roles = suggestRoles(n);
        const map = buildDeckMap(roles, style);
        assert.equal(map.length, n);
        const cards = map.map((m) => m.card);
        assert.equal(new Set(cards).size, n, 'duplicate cards');
        for (const c of cards) assert.ok(isCard(c), `not a card: ${c}`);
        assert.deepEqual(sorted(map.map((m) => m.roleId)), sorted(roles));
      });
    }
  }
  test('fixed is deterministic for the same input', () => {
    for (const n of [5, 12, 30, 50]) {
      const roles = suggestRoles(n);
      assert.deepEqual(buildDeckMap(roles, 'fixed'), buildDeckMap([...roles], 'fixed'));
    }
  });
  test('fixed gives the canonical home cards', () => {
    const map = buildDeckMap(['godfather', 'doctor', 'cop', 'villager', 'villager'], 'fixed');
    const card = (r) => map.find((m) => m.roleId === r).card;
    assert.equal(card('godfather'), 'AS');
    assert.equal(card('doctor'), 'AH');
    assert.equal(card('cop'), 'KH');
  });
  test('full 54-card deck works; 55 roles throws', () => {
    const map = buildDeckMap(Array(54).fill('villager'), 'fixed');
    assert.equal(new Set(map.map((m) => m.card)).size, 54);
    assert.throws(() => buildDeckMap(Array(55).fill('villager'), 'random'));
  });
  test('FULL_DECK has 54 distinct cards', () => {
    assert.equal(FULL_DECK.length, 54);
    assert.equal(new Set(FULL_DECK).size, 54);
  });
  test('isCard rejects junk', () => {
    for (const bad of ['', 'XX', '1S', 'AS ', null, undefined, 5, 'ace']) assert.equal(isCard(bad), false);
  });
});

// ---------- nightScript ----------
describe('nightScript', () => {
  test('only alive players contribute steps', () => {
    const room = mk([['Doc', 'doctor'], ['Cop', 'cop'], ['Mob', 'mafia'], ...filler(3)]);
    P(room, 'Doc').alive = false;
    const keys = nightScript(room).map((s) => s.key);
    assert.ok(!keys.includes(key(room, 'Doc')));
    assert.ok(keys.includes(key(room, 'Cop')));
  });

  test('meeting:mafia has all alive meeting-mafia actors only', () => {
    const room = mk([
      ['Mob', 'mafia'], ['God', 'godfather'], ['Don', 'don'], ['Hook', 'hooker'], ['Jan', 'janitor'], ['Dead', 'mafia'],
      ['Slow', 'slowpoke'], ['Ass', 'assassin'], ['Vil', 'villager'], ['Cop', 'cop'],
    ]);
    P(room, 'Dead').alive = false;
    const steps = nightScript(room);
    const meeting = steps.filter((s) => s.key === 'meeting:mafia');
    assert.equal(meeting.length, 1);
    assert.deepEqual(sorted(meeting[0].actors), sorted(['Mob', 'God', 'Don', 'Hook', 'Jan'].map((n) => id(room, n))));
    // Slowpoke attends nothing, Assassin acts alone
    assert.ok(!meeting[0].actors.includes(id(room, 'Slow')));
    assert.ok(!meeting[0].actors.includes(id(room, 'Ass')));
    assert.ok(steps.some((s) => s.key === key(room, 'Ass')));
    // grouped roles do not also get their own kill step
    assert.ok(!steps.some((s) => s.key === key(room, 'God')));
  });

  test('no mafia step when every meeting mafia is dead', () => {
    const room = mk([['Mob', 'mafia'], ['Cop', 'cop'], ...filler(3)]);
    P(room, 'Mob').alive = false;
    assert.ok(!nightScript(room).some((s) => s.key === 'meeting:mafia'));
  });

  test('exhausted uses are skipped', () => {
    const room = mk([['Vig', 'vigilante'], ['Vet', 'veteran'], ['Mob', 'mafia'], ...filler(3)]);
    assert.ok(nightScript(room).some((s) => s.key === key(room, 'Vig')));
    room.usage[id(room, 'Vig')] = 1;
    assert.ok(!nightScript(room).some((s) => s.key === key(room, 'Vig')));
    room.usage[id(room, 'Vet')] = 2;
    assert.ok(nightScript(room).some((s) => s.key === key(room, 'Vet')));
    room.usage[id(room, 'Vet')] = 3;
    assert.ok(!nightScript(room).some((s) => s.key === key(room, 'Vet')));
  });

  test('night-1-only info steps appear only on night 1', () => {
    const spec = [['M1', 'mason'], ['M2', 'mason'], ['Mer', 'merlin'], ['Pres', 'president'], ['Pup', 'puppy'], ['Mob', 'mafia']];
    const n1 = nightScript(mk(spec, { night: 1 }));
    const info1 = n1.filter((s) => s.kind === 'info');
    assert.deepEqual(sorted(info1.map((s) => s.roleId)), sorted(['mason', 'merlin', 'president', 'puppy']));
    const mason = info1.find((s) => s.roleId === 'mason');
    assert.equal(mason.actors.length, 2, 'one info step for both masons');
    const n2 = nightScript(mk(spec, { night: 2 }));
    assert.equal(n2.filter((s) => s.kind === 'info').length, 0);
  });

  test('steps sorted by order; jail before doctor before kill before cop', () => {
    const room = mk([['Cop', 'cop'], ['Mob', 'mafia'], ['Doc', 'doctor'], ['Jail', 'jailer'], ['V', 'villager']]);
    const orders = nightScript(room).map((s) => s.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    const types = nightScript(room).map((s) => s.type);
    assert.ok(types.indexOf('jail') < types.indexOf('protect'));
    assert.ok(types.indexOf('protect') < types.indexOf('kill'));
    assert.ok(types.indexOf('kill') < types.indexOf('investigate'));
  });

  test('cult meeting step exists for cult players', () => {
    const room = mk([['Cult', 'cult'], ['Mob', 'mafia'], ...filler(3)]);
    const s = nightScript(room).find((x) => x.key === 'meeting:cult');
    assert.ok(s); assert.equal(s.type, 'convert');
  });
});

// ---------- resolveNight ----------
describe('resolveNight', () => {
  const mafiaKills = (room, victim) => ({ 'meeting:mafia': { targets: [id(room, victim)] } });

  test('unprotected target dies', () => {
    const room = mk([['Mob', 'mafia'], ['Vic', 'villager'], ...filler(3)]);
    const rep = resolveNight(room, mafiaKills(room, 'Vic'));
    assert.equal(alive(room, 'Vic'), false);
    assert.equal(P(room, 'Vic').deathCause, 'killed by the Mafia');
    assert.equal(rep.deaths.length, 1);
    assert.equal(room.phase, 'day');
    assert.equal(room.day, 1);
  });

  test('no action means nobody dies', () => {
    const room = mk([['Mob', 'mafia'], ['Vic', 'villager'], ...filler(3)]);
    const rep = resolveNight(room, {});
    assert.equal(rep.deaths.length, 0);
    assert.ok(room.players.every((p) => p.alive));
  });

  test('doctor protect beats mafia kill', () => {
    const room = mk([['Mob', 'mafia'], ['Doc', 'doctor'], ['Vic', 'villager'], ...filler(3)]);
    const rep = resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'Doc')]: { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), true);
    assert.equal(rep.saves.length, 1);
    assert.equal(rep.deaths.length, 0);
  });

  test('doctor protecting someone else does not save the victim', () => {
    const room = mk([['Mob', 'mafia'], ['Doc', 'doctor'], ['Vic', 'villager'], ['Oth', 'villager'], ...filler(2)]);
    resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'Doc')]: { targets: [id(room, 'Oth')] } });
    assert.equal(alive(room, 'Vic'), false);
  });

  test('bodyguard dies in place of target; target lives', () => {
    const room = mk([['Mob', 'mafia'], ['BG', 'bodyguard'], ['Vic', 'villager'], ...filler(3)]);
    const rep = resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'BG')]: { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), true);
    assert.equal(alive(room, 'BG'), false);
    assert.equal(rep.deaths.length, 1);
  });

  test('grandma survives a kill', () => {
    const room = mk([['Mob', 'mafia'], ['Gran', 'grandma'], ...filler(3)]);
    const rep = resolveNight(room, mafiaKills(room, 'Gran'));
    assert.equal(alive(room, 'Gran'), true);
    assert.equal(rep.saves.length, 1);
  });

  test('jailed target survives; jailed player cannot act', () => {
    const room = mk([['Mob', 'mafia'], ['Jail', 'jailer'], ['Vic', 'villager'], ['Doc', 'doctor'], ['Cop', 'cop'], ...filler(2)]);
    const rep = resolveNight(room, {
      ...mafiaKills(room, 'Vic'),
      [key(room, 'Jail')]: { targets: [id(room, 'Vic')] },
    });
    assert.equal(alive(room, 'Vic'), true);
    // jailed cop cannot investigate
    const room2 = mk([['Mob', 'mafia'], ['Jail', 'jailer'], ['Cop', 'cop'], ['Vic', 'villager'], ...filler(2)]);
    const rep2 = resolveNight(room2, {
      [key(room2, 'Jail')]: { targets: [id(room2, 'Cop')] },
      [key(room2, 'Cop')]: { targets: [id(room2, 'Vic')] },
    });
    assert.equal(rep2.info.length, 0);
    assert.ok(rep2.notes.some((n) => /Cop/.test(n)));
    void rep;
  });

  test('veteran on alert kills a visitor, and survives the Mafia', () => {
    const room = mk([['Mob', 'mafia'], ['Vet', 'veteran'], ['Cop', 'cop'], ...filler(3)]);
    const rep = resolveNight(room, {
      [key(room, 'Vet')]: { on: true },
      [key(room, 'Cop')]: { targets: [id(room, 'Vet')] },
      ...mafiaKills(room, 'Vet'),
    });
    assert.equal(alive(room, 'Cop'), false);
    assert.equal(alive(room, 'Vet'), true);
    assert.ok(rep.deaths.some((d) => d.id === id(room, 'Cop')));
    assert.equal(room.usage[id(room, 'Vet')], 1);
  });

  test('veteran not on alert: visitors live, uses not consumed', () => {
    const room = mk([['Mob', 'mafia'], ['Vet', 'veteran'], ['Cop', 'cop'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Vet')]: { on: false }, [key(room, 'Cop')]: { targets: [id(room, 'Vet')] } });
    assert.equal(alive(room, 'Cop'), true);
    assert.equal(room.usage[id(room, 'Vet')] || 0, 0);
  });

  for (const blocker of [['Drunk', 'drunk'], ['Hook', 'hooker']]) {
    test(`${blocker[1]} blocking a doctor makes the protect fail`, () => {
      const room = mk([['Mob', 'mafia'], blocker, ['Doc', 'doctor'], ['Vic', 'villager'], ...filler(3)]);
      const rep = resolveNight(room, {
        ...mafiaKills(room, 'Vic'),
        [key(room, blocker[0])]: { targets: [id(room, 'Doc')] },
        [key(room, 'Doc')]: { targets: [id(room, 'Vic')] },
      });
      assert.equal(alive(room, 'Vic'), false);
      assert.ok(rep.notes.some((n) => /Doctor/.test(n)));
    });
  }

  for (const guard of [['SG', 'security_guard'], ['Bounce', 'bouncer']]) {
    test(`${guard[1]} (blockVisitors) blocks a visiting cop`, () => {
      const room = mk([['Mob', 'mafia'], guard, ['Cop', 'cop'], ['Vic', 'villager'], ...filler(3)]);
      const rep = resolveNight(room, {
        [key(room, guard[0])]: { targets: [id(room, 'Vic')] },
        [key(room, 'Cop')]: { targets: [id(room, 'Vic')] },
      });
      assert.equal(rep.info.length, 0);
      assert.ok(rep.notes.some((n) => /Cop/.test(n)));
    });
  }

  test('blockVisitors also stops a mafia kill on the guarded player', () => {
    const room = mk([['Mob', 'mafia'], ['SG', 'security_guard'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'SG')]: { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), true);
  });

  describe('investigations', () => {
    const check = (spec, target, extra = {}) => {
      const room = mk([['Mob', 'mafia'], ['Cop', spec], ['Tgt', target], ...filler(3)]);
      const actions = { [key(room, 'Cop')]: { targets: [id(room, 'Tgt')] } };
      for (const [name, roleId] of Object.entries(extra.add || {})) { room.players.find((p) => p.name === name).roleId = roleId; }
      return { room, rep: resolveNight(room, actions) };
    };
    test('cop on godfather => NOT Mafia', () => {
      assert.match(infoText(check('cop', 'godfather').rep), /Tgt is NOT Mafia/);
    });
    test('cop on miller => MAFIA', () => {
      assert.match(infoText(check('cop', 'miller').rep), /Tgt is MAFIA/);
    });
    test('cop on mafia => MAFIA; on villager => NOT Mafia', () => {
      assert.match(infoText(check('cop', 'mafia').rep), /is MAFIA/);
      assert.match(infoText(check('cop', 'villager').rep), /is NOT Mafia/);
    });
    test('cop on traitor / killer => NOT Mafia', () => {
      assert.match(infoText(check('cop', 'traitor').rep), /NOT Mafia/);
      assert.match(infoText(check('cop', 'killer').rep), /NOT Mafia/);
    });
    test('framer overrides godfather', () => {
      const room = mk([['Fr', 'framer'], ['God', 'godfather'], ['Cop', 'cop'], ...filler(3)]);
      const rep = resolveNight(room, {
        [key(room, 'Fr')]: { targets: [id(room, 'God')] },
        [key(room, 'Cop')]: { targets: [id(room, 'God')] },
      });
      assert.match(infoText(rep), /God is MAFIA/);
    });
    test('frame lasts one night only', () => {
      const room = mk([['Fr', 'framer'], ['God', 'godfather'], ['Cop', 'cop'], ...filler(3)]);
      resolveNight(room, { [key(room, 'Fr')]: { targets: [id(room, 'God')] } });
      room.phase = 'night'; room.night = 2;
      const rep = resolveNight(room, { [key(room, 'Cop')]: { targets: [id(room, 'God')] } });
      assert.match(infoText(rep), /God is NOT Mafia/, 'frame from night 1 should not persist');
    });
    test('insane cop flips', () => {
      assert.match(infoText(check('insane_cop', 'mafia').rep), /is NOT Mafia/);
      assert.match(infoText(check('insane_cop', 'villager').rep), /is MAFIA/);
      assert.match(infoText(check('insane_cop', 'godfather').rep), /is MAFIA/);
    });
    test('detective sees exact role', () => {
      assert.match(infoText(check('detective', 'godfather').rep), /the Godfather/);
    });
    test('wannabe gives some result', () => {
      assert.match(infoText(check('wannabe', 'villager').rep), /Tgt is (MAFIA|NOT Mafia)/);
    });
    test('parity cop: two targets', () => {
      const room = mk([['PC', 'parity_cop'], ['Mob', 'mafia'], ['God', 'godfather'], ['V1', 'villager'], ['V2', 'villager'], ['Mil', 'miller']]);
      const run = (a, b) => {
        const r = structuredClone(room); r.phase = 'night';
        return infoText(resolveNight(r, { [key(r, 'PC')]: { targets: [id(r, a), id(r, b)] } }));
      };
      assert.match(run('V1', 'V2'), /SAME/);
      assert.match(run('Mob', 'V1'), /DIFFERENT/);
      assert.match(run('Mob', 'Mil'), /SAME/);
      assert.match(run('God', 'V1'), /SAME/);
      assert.match(run('God', 'Mob'), /DIFFERENT/);
    });
    test('parity cop with one target does nothing', () => {
      const room = mk([['PC', 'parity_cop'], ['Mob', 'mafia'], ['V1', 'villager'], ...filler(2)]);
      const rep = resolveNight(room, { [key(room, 'PC')]: { targets: [id(room, 'V1')] } });
      assert.equal(rep.info.length, 0);
    });
    test('tracker and lookout', () => {
      const room = mk([['Trk', 'tracker'], ['Look', 'lookout'], ['Cop', 'cop'], ['Vic', 'villager'], ['Mob', 'mafia'], ...filler(2)]);
      const rep = resolveNight(room, {
        [key(room, 'Cop')]: { targets: [id(room, 'Vic')] },
        [key(room, 'Trk')]: { targets: [id(room, 'Cop')] },
        [key(room, 'Look')]: { targets: [id(room, 'Vic')] },
      });
      assert.match(infoText(rep), /Cop visited Vic/);
      assert.match(infoText(rep), /Cop visited Vic\.|Cop visited Vic/);
      assert.ok(rep.info.some((i) => /visited Vic/.test(i.text) && i.roleId === 'lookout'));
    });
    test('coroner learns role of the dead', () => {
      const room = mk([['Cor', 'coroner'], ['Dead', 'godfather'], ['Mob', 'mafia'], ...filler(3)]);
      P(room, 'Dead').alive = false;
      const rep = resolveNight(room, { [key(room, 'Cor')]: { targets: [id(room, 'Dead')] } });
      assert.match(infoText(rep), /Dead was the Godfather/);
    });
  });

  test('bomb kills the killer who hit it', () => {
    const room = mk([['Sk', 'killer'], ['Bomb', 'bomb'], ['Mob', 'mafia'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Sk')]: { targets: [id(room, 'Bomb')] } });
    assert.equal(alive(room, 'Bomb'), false);
    assert.equal(alive(room, 'Sk'), false);
    assert.equal(alive(room, 'Mob'), true);
  });

  test('bomb hit by mafia kills the attacker(s)', () => {
    const room = mk([['Mob', 'mafia'], ['Bomb', 'bomb'], ...filler(4)]);
    resolveNight(room, mafiaKills(room, 'Bomb'));
    assert.equal(alive(room, 'Bomb'), false);
    assert.equal(alive(room, 'Mob'), false);
  });

  test('bomb protected by doctor does not blow up', () => {
    const room = mk([['Sk', 'killer'], ['Bomb', 'bomb'], ['Doc', 'doctor'], ['Mob', 'mafia'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Sk')]: { targets: [id(room, 'Bomb')] }, [key(room, 'Doc')]: { targets: [id(room, 'Bomb')] } });
    assert.equal(alive(room, 'Bomb'), true);
    assert.equal(alive(room, 'Sk'), true);
  });

  test('janitor hides victim role (roleHidden)', () => {
    const room = mk([['Mob', 'mafia'], ['Jan', 'janitor'], ['Vic', 'villager'], ...filler(3)]);
    const rep = resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'Jan')]: { on: true } });
    // BUG: clean has targets:0, so resolveNight's `on = targets.length >= need && need > 0` is always false
    // for it (only 'alert' is special-cased). The Janitor can never activate, and uses are never spent.
    assert.equal(P(room, 'Vic').roleHidden, true);
    assert.equal(rep.deaths[0].hidden, true);
    assert.equal(room.usage[id(room, 'Jan')], 1);
  });

  test('janitor with targets: [] also should activate', () => {
    const room = mk([['Mob', 'mafia'], ['Jan', 'janitor'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'Jan')]: { on: true, targets: [] } });
    // BUG: same root cause as above.
    assert.equal(P(room, 'Vic').roleHidden, true);
  });

  test('janitor does not hide a non-mafia kill, and not without being switched on', () => {
    const room = mk([['Sk', 'killer'], ['Jan', 'janitor'], ['Vic', 'villager'], ['Mob', 'mafia'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Sk')]: { targets: [id(room, 'Vic')] }, [key(room, 'Jan')]: { on: true } });
    assert.equal(!!P(room, 'Vic').roleHidden, false);
    const room2 = mk([['Mob', 'mafia'], ['Jan', 'janitor'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room2, mafiaKills(room2, 'Vic'));
    assert.equal(!!P(room2, 'Vic').roleHidden, false);
  });

  test('cult recruit converts: roleId changes', () => {
    const room = mk([['Cult', 'cult'], ['Vic', 'villager'], ['Mob', 'mafia'], ...filler(3)]);
    const rep = resolveNight(room, { 'meeting:cult': { targets: [id(room, 'Vic')] } });
    assert.equal(P(room, 'Vic').roleId, 'cult');
    assert.equal(P(room, 'Vic').convertedFrom, 'villager');
    assert.equal(rep.conversions.length, 1);
  });

  test('yakuza converts to mafia once, then is no longer offered', () => {
    const room = mk([['Mob', 'mafia'], ['Yak', 'yakuza'], ['Vic', 'villager'], ['Vic2', 'villager'], ...filler(3)]);
    resolveNight(room, { [key(room, 'Yak')]: { targets: [id(room, 'Vic')] } });
    assert.equal(P(room, 'Vic').roleId, 'mafia');
    room.phase = 'night'; room.night = 2;
    assert.ok(!nightScript(room).some((s) => s.key === key(room, 'Yak')));
  });

  test('yakuza cannot convert an existing mafia member (no-op)', () => {
    const room = mk([['Mob', 'mafia'], ['Yak', 'yakuza'], ['God', 'godfather'], ...filler(3)]);
    const rep = resolveNight(room, { [key(room, 'Yak')]: { targets: [id(room, 'God')] } });
    assert.equal(P(room, 'God').roleId, 'godfather');
    assert.equal(rep.conversions.length, 0);
  });

  test('conversion of someone who dies that night is skipped', () => {
    const room = mk([['Mob', 'mafia'], ['Yak', 'yakuza'], ['Vic', 'villager'], ...filler(3)]);
    resolveNight(room, { ...mafiaKills(room, 'Vic'), [key(room, 'Yak')]: { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), false);
    assert.equal(P(room, 'Vic').roleId, 'villager');
  });

  test('amnesiac becomes a dead player\'s role', () => {
    const room = mk([['Amn', 'amnesiac'], ['Dead', 'doctor'], ['Mob', 'mafia'], ...filler(3)]);
    P(room, 'Dead').alive = false;
    resolveNight(room, { [key(room, 'Amn')]: { targets: [id(room, 'Dead')] } });
    assert.equal(P(room, 'Amn').roleId, 'doctor');
  });

  test('vigilante uses:1 is not offered the second night', () => {
    const room = mk([['Vig', 'vigilante'], ['Mob', 'mafia'], ['Vic', 'villager'], ...filler(4)]);
    assert.ok(nightScript(room).some((s) => s.key === key(room, 'Vig')));
    const rep = resolveNight(room, { [key(room, 'Vig')]: { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), false);
    assert.equal(P(room, 'Vic').deathCause, 'shot by the Vigilante');
    assert.equal(rep.deaths.length, 1);
    room.phase = 'night'; room.night = 2;
    assert.ok(!nightScript(room).some((s) => s.key === key(room, 'Vig')));
  });

  test('vigilante that does not shoot keeps its bullet', () => {
    const room = mk([['Vig', 'vigilante'], ['Mob', 'mafia'], ...filler(4)]);
    resolveNight(room, {});
    room.phase = 'night'; room.night = 2;
    assert.ok(nightScript(room).some((s) => s.key === key(room, 'Vig')));
  });

  test('killer and mafia can both kill in one night', () => {
    const room = mk([['Sk', 'killer'], ['Mob', 'mafia'], ['A', 'villager'], ['B', 'villager'], ...filler(3)]);
    resolveNight(room, { ...mafiaKills(room, 'A'), [key(room, 'Sk')]: { targets: [id(room, 'B')] } });
    assert.equal(alive(room, 'A'), false); assert.equal(alive(room, 'B'), false);
  });

  test('night kill of a hunter creates a pending prompt', () => {
    const room = mk([['Mob', 'mafia'], ['Hank', 'hunter'], ...filler(4)]);
    resolveNight(room, mafiaKills(room, 'Hank'));
    assert.equal(room.pending.length, 1);
    assert.equal(room.pending[0].playerId, id(room, 'Hank'));
  });

  test('resolveNight advances to day and logs', () => {
    const room = mk([['Mob', 'mafia'], ...filler(5)]);
    resolveNight(room, {});
    assert.equal(room.phase, 'day');
    assert.ok(room.log.some((l) => /nobody died/.test(l.text)));
  });

  test('kill step targeting a dead player is ignored', () => {
    const room = mk([['Mob', 'mafia'], ['Dead', 'villager'], ...filler(4)]);
    P(room, 'Dead').alive = false;
    const rep = resolveNight(room, mafiaKills(room, 'Dead'));
    assert.equal(rep.deaths.length, 0);
  });
});

// ---------- checkWin / finalWinners ----------
describe('checkWin', () => {
  test('town wins when no mafia remain', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager'], ['B', 'cop'], ['C', 'villager']]);
    P(room, 'Mob').alive = false;
    assert.equal(checkWin(room).side, 'town');
  });
  test('null while mafia are outnumbered', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager'], ['B', 'cop'], ['C', 'villager']]);
    assert.equal(checkWin(room), null);
  });
  test('mafia wins at parity', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager'], ['B', 'cop']]);
    P(room, 'B').alive = false;
    assert.equal(checkWin(room).side, 'mafia');
  });
  test('don counts double', () => {
    const room = mk([['Don', 'don'], ['A', 'villager'], ['B', 'cop'], ['C', 'villager']]);
    assert.equal(checkWin(room), null, 'weight 2 vs 3');
    P(room, 'C').alive = false;
    assert.equal(checkWin(room).side, 'mafia', 'weight 2 vs 2');
  });
  test('godfather and plain mafia count one each', () => {
    const room = mk([['God', 'godfather'], ['A', 'villager'], ['B', 'cop'], ['C', 'villager']]);
    assert.equal(checkWin(room), null);
    P(room, 'C').alive = false;
    assert.equal(checkWin(room), null, '1 vs 2');
  });
  test('killer-only parity', () => {
    const room = mk([['Sk', 'killer'], ['A', 'villager'], ['B', 'villager']]);
    assert.equal(checkWin(room), null);
    P(room, 'B').alive = false;
    assert.equal(checkWin(room).side, 'killer');
  });
  test('mafia and killer both alive: no result yet', () => {
    const room = mk([['Sk', 'killer'], ['Mob', 'mafia'], ['A', 'villager']]);
    assert.equal(checkWin(room), null);
  });
  test('cult wins when everyone alive is cult', () => {
    const room = mk([['C1', 'cult'], ['C2', 'cult'], ['A', 'villager'], ['Mob', 'mafia']]);
    P(room, 'A').alive = false; P(room, 'Mob').alive = false;
    assert.equal(checkWin(room).side, 'cult');
  });
  test('cult not yet when a villager lives', () => {
    const room = mk([['C1', 'cult'], ['A', 'villager'], ['B', 'villager']]);
    assert.equal(checkWin(room), null);
  });
  test('everyone dead => none', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager']]);
    room.players.forEach((p) => { p.alive = false; });
    assert.equal(checkWin(room).side, 'none');
  });
  test('slowpoke and assassin count as mafia', () => {
    const room = mk([['Sl', 'slowpoke'], ['A', 'villager']]);
    assert.equal(checkWin(room).side, 'mafia');
  });
  test('resolveNight ends the game when mafia reach parity', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager'], ['B', 'villager']]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'A')] } });
    assert.equal(room.phase, 'over');
    assert.equal(room.winner.side, 'mafia');
  });
});

describe('finalWinners', () => {
  const winners = (room) => finalWinners(room).map((w) => w.id);
  test('no winner => empty', () => {
    const room = mk([['Mob', 'mafia'], ['A', 'villager']]);
    assert.deepEqual(finalWinners(room), []);
  });
  test('traitor wins with mafia', () => {
    const room = mk([['Mob', 'mafia'], ['Tr', 'traitor'], ['A', 'villager'], ['B', 'villager']]);
    room.winner = { side: 'mafia', reason: 'x' };
    const w = winners(room);
    assert.ok(w.includes(id(room, 'Mob')) && w.includes(id(room, 'Tr')));
    assert.ok(!w.includes(id(room, 'A')));
  });
  test('traitor loses when town wins', () => {
    const room = mk([['Mob', 'mafia'], ['Tr', 'traitor'], ['A', 'villager']]);
    room.winner = { side: 'town', reason: 'x' };
    const w = winners(room);
    assert.ok(w.includes(id(room, 'A')));
    assert.ok(!w.includes(id(room, 'Tr')));
  });
  test('survivor wins only if alive', () => {
    const room = mk([['Mob', 'mafia'], ['Sv', 'survivor'], ['Sv2', 'survivor'], ['A', 'villager']]);
    P(room, 'Sv2').alive = false;
    room.winner = { side: 'mafia', reason: 'x' };
    const w = winners(room);
    assert.ok(w.includes(id(room, 'Sv')));
    assert.ok(!w.includes(id(room, 'Sv2')));
  });
  test('opportunist wins if alive and town lost, not when town won', () => {
    const room = mk([['Mob', 'mafia'], ['Op', 'opportunist'], ['A', 'villager']]);
    room.winner = { side: 'mafia', reason: 'x' };
    assert.ok(winners(room).includes(id(room, 'Op')));
    room.winner = { side: 'town', reason: 'x' };
    assert.ok(!winners(room).includes(id(room, 'Op')));
    room.winner = { side: 'mafia', reason: 'x' };
    P(room, 'Op').alive = false;
    assert.ok(!winners(room).includes(id(room, 'Op')));
  });
  test('jester wins via sideWins even when town wins', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ['A', 'villager'], ['B', 'villager'], ['C', 'villager']]);
    condemn(room, id(room, 'Jes'));
    room.winner = { side: 'town', reason: 'x' };
    assert.ok(winners(room).includes(id(room, 'Jes')));
  });
  test('winning faction members all listed (including dead)', () => {
    const room = mk([['Mob', 'mafia'], ['God', 'godfather'], ['A', 'villager']]);
    P(room, 'God').alive = false;
    room.winner = { side: 'mafia', reason: 'x' };
    assert.deepEqual(sorted(winners(room)), sorted([id(room, 'Mob'), id(room, 'God')]));
  });
  test('killer and cult sides', () => {
    const room = mk([['Sk', 'killer'], ['Cu', 'cult'], ['A', 'villager']]);
    room.winner = { side: 'killer', reason: 'x' };
    assert.deepEqual(winners(room), [id(room, 'Sk')]);
    room.winner = { side: 'cult', reason: 'x' };
    assert.deepEqual(winners(room), [id(room, 'Cu')]);
  });
});

// ---------- condemn / pending ----------
describe('condemn', () => {
  const base = (...extra) => mk([['Mob', 'mafia'], ...extra, ...filler(4)], { phase: 'day', night: 1 });

  test('cannot condemn a dead or unknown player', () => {
    const room = base(['A', 'villager']);
    P(room, 'A').alive = false;
    assert.ok(condemn(room, id(room, 'A')).error);
    assert.ok(condemn(room, 'nope').error);
  });

  test('plain condemn kills with cause condemned', () => {
    const room = base(['A', 'villager']);
    assert.deepEqual(condemn(room, id(room, 'A')), { ok: true });
    assert.equal(alive(room, 'A'), false);
    assert.equal(P(room, 'A').deathCause, 'condemned');
  });

  test('jester condemned => sideWins entry', () => {
    const room = base(['Jes', 'jester']);
    condemn(room, id(room, 'Jes'));
    assert.equal(room.sideWins.length, 1);
    assert.equal(room.sideWins[0].id, id(room, 'Jes'));
  });

  test('jester killed at night does not win', () => {
    const room = mk([['Mob', 'mafia'], ['Jes', 'jester'], ...filler(4)]);
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Jes')] } });
    assert.equal((room.sideWins || []).length, 0);
  });

  test('executioner target condemned => sideWins; other condemn => none', () => {
    const room = base(['Exe', 'executioner'], ['Tgt', 'villager'], ['Oth', 'villager']);
    P(room, 'Exe').target = id(room, 'Tgt');
    condemn(room, id(room, 'Oth'));
    assert.equal(room.sideWins.length, 0);
    condemn(room, id(room, 'Tgt'));
    assert.equal(room.sideWins.length, 1);
    assert.equal(room.sideWins[0].id, id(room, 'Exe'));
  });

  test('hunter condemned => pending prompt; resolvePending kills chosen target', () => {
    const room = base(['Hank', 'hunter'], ['Vic', 'villager']);
    condemn(room, id(room, 'Hank'));
    assert.equal(room.pending.length, 1);
    const pid = room.pending[0].id;
    assert.deepEqual(resolvePending(room, pid, id(room, 'Vic')), { ok: true });
    assert.equal(alive(room, 'Vic'), false);
    assert.equal(room.pending.length, 0);
    assert.equal(P(room, 'Vic').deathCause, 'taken down by Hank');
  });

  test('resolvePending with no target just clears; unknown id errors', () => {
    const room = base(['Hank', 'hunter'], ['Vic', 'villager']);
    condemn(room, id(room, 'Hank'));
    assert.ok(resolvePending(room, 'bogus', null).error);
    resolvePending(room, room.pending[0].id, null);
    assert.equal(alive(room, 'Vic'), true);
    assert.equal(room.pending.length, 0);
  });

  test('resolvePending ignores an already-dead target', () => {
    const room = base(['Hank', 'hunter'], ['Vic', 'villager']);
    condemn(room, id(room, 'Hank'));
    P(room, 'Vic').alive = false;
    resolvePending(room, room.pending[0].id, id(room, 'Vic'));
    assert.equal(room.pending.length, 0);
  });

  test('poacher condemned => pending', () => {
    const room = base(['Poa', 'poacher'], ['Vic', 'villager']);
    condemn(room, id(room, 'Poa'));
    assert.equal(room.pending.length, 1);
  });

  test('a hunter taken down by a hunter chains another prompt', () => {
    const room = base(['H1', 'hunter'], ['H2', 'hunter']);
    condemn(room, id(room, 'H1'));
    resolvePending(room, room.pending[0].id, id(room, 'H2'));
    assert.equal(room.pending.length, 1);
    assert.equal(room.pending[0].playerId, id(room, 'H2'));
  });

  test('virgin condemned sets shield; next night nobody can be killed, then it resets', () => {
    const room = base(['Vir', 'virgin'], ['Vic', 'villager']);
    condemn(room, id(room, 'Vir'));
    assert.equal(room.shield, true);
    room.phase = 'night'; room.night = 2;
    const rep = resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), true);
    assert.equal(rep.deaths.length, 0);
    assert.equal(room.shield, false);
    room.phase = 'night'; room.night = 3;
    resolveNight(room, { 'meeting:mafia': { targets: [id(room, 'Vic')] } });
    assert.equal(alive(room, 'Vic'), false);
  });

  test('shield also blocks other killers (vigilante, killer)', () => {
    const room = mk([['Mob', 'mafia'], ['Sk', 'killer'], ['Vig', 'vigilante'], ['A', 'villager'], ['B', 'villager'], ...filler(3)], { phase: 'day', night: 1 });
    room.shield = true; room.phase = 'night'; room.night = 2;
    resolveNight(room, {
      'meeting:mafia': { targets: [id(room, 'A')] },
      [key(room, 'Sk')]: { targets: [id(room, 'B')] },
      [key(room, 'Vig')]: { targets: [id(room, 'A')] },
    });
    assert.ok(alive(room, 'A') && alive(room, 'B'));
  });

  test('condemning the last mafia ends the game with a town win', () => {
    const room = base(['A', 'villager']);
    condemn(room, id(room, 'Mob'));
    assert.equal(room.phase, 'over');
    assert.equal(room.winner.side, 'town');
  });
});

// sanity: every role in the catalog is internally consistent
describe('role catalog', () => {
  test('ids unique, fields valid', () => {
    assert.equal(new Set(ROLES.map((r) => r.id)).size, ROLES.length);
    for (const r of ROLES) {
      assert.ok(['town', 'mafia', 'third'].includes(r.alignment), r.id);
      if (r.action) assert.ok(r.action.order > 0 && r.action.type, r.id);
      if (r.meeting) assert.ok(['mafia', 'mason', 'cult'].includes(r.meeting), r.id);
    }
  });
  test('playerById', () => {
    const room = mk([['A', 'villager']]);
    assert.equal(playerById(room, id(room, 'A')).name, 'A');
    assert.equal(playerById(room, 'x'), undefined);
  });
});
