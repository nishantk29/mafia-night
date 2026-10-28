// v9 (Nishant 2026-10-28): "I think the order of mafia is wrong" and "I dont think a blocker can stop an action from being chosen."
// 1) Wake order: Mafia (and every other killer) -> protectors (Doctor, Bodyguard) -> investigators, in every mode.
// 2) A blocked role wakes and picks exactly like an unblocked one; the block only cancels the effect when the night resolves.
// Both are pinned per room: v8 and older rooms keep their old order and behaviour.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nightScript, previewNight, checkCard, stepGesture, stepScript, resolveNight, LATEST_NIGHT_VERSION } from '../public/js/engine.js';
import { newRoom, reduce, viewForHost, viewForPlayer } from '../public/js/room.js';
import { nightNav, pressNext } from '../public/js/night-nav.js';
import { buildGuide } from '../public/js/print.js';
import { hostScreen, S, freshUi, dealt, playGame } from './night-drive-lib.mjs';

const HOST = { host: true };
// Modes: multi-phone (roles on phones), single-phone host with a card key the Host enters (claim), and the
// Black Aces / playing-card key where the Host learns who is who on night 1 (blind).
const MODES = {
  'multi-phone': { mode: 'app', cardFlow: 'blind', local: false },
  'single-phone host': { mode: 'cards', cardFlow: 'claim', local: true },
  'Black Aces (simple card key)': { mode: 'cards', cardFlow: 'blind', deckStyle: 'simple', local: true },
};
function mk(spec, { version = LATEST_NIGHT_VERSION, night = 2, mode = 'multi-phone' } = {}) {
  const m = MODES[mode];
  const room = newRoom('NO', 'hk');
  assert.ok(reduce(room, HOST, { type: 'addPlayers', names: spec.map(([n]) => n) }).ok);
  for (const [name, roleId] of spec) { const p = room.players.find((q) => q.name === name); p.id = `p${name}`; p.roleId = roleId; }
  Object.assign(room.config, { mode: m.mode, cardFlow: m.cardFlow, ...(m.deckStyle ? { deckStyle: m.deckStyle } : {}), roles: spec.map(([, r]) => r) });
  if (m.mode === 'cards') room.deck = { map: spec.map(([, r], i) => ({ card: `${i + 2}S`, roleId: r })), claimed: {} };
  room.nightVersion = version; room.phase = 'night'; room.night = night; room.copSalt = 0.5;
  return room;
}
const order = (room) => nightScript(room).filter((s) => s.kind === 'action').map((s) => s.roleId);
const before = (list, a, b) => { assert.ok(list.includes(a) && list.includes(b), `${a} and ${b} called`); return list.indexOf(a) < list.indexOf(b); };
const SIMPLE = [['M', 'mafia'], ['D', 'doctor'], ['C', 'cop'], ['V1', 'villager'], ['V2', 'villager']];
const FULL = [['J', 'jailer'], ['H', 'hooker'], ['M', 'mafia'], ['G', 'godfather'], ['D', 'doctor'], ['B', 'bodyguard'], ['K', 'killer'], ['Vi', 'vigilante'],
  ['Co', 'cop'], ['De', 'detective'], ['Cr', 'coroner'], ['T', 'tracker'], ['L', 'lookout'], ['Ve', 'veteran'], ['F', 'framer'], ['Jn', 'janitor'], ['X', 'villager']];

describe('v9 night order: Mafia, then Doctor, then Detective', () => {
  for (const mode of Object.keys(MODES)) {
    test(`${mode}: Mafia -> Doctor -> Cop, blockers first, protectors after every killer, trackers last`, () => {
      const simple = order(mk(SIMPLE, { mode }));
      assert.deepEqual(simple, ['mafia', 'doctor', 'cop']);
      const o = order(mk(FULL, { mode }));
      for (const blocker of ['jailer', 'hooker']) assert.ok(before(o, blocker, 'mafia'), `${blocker} before the Mafia`);
      for (const killer of ['mafia', 'killer', 'vigilante']) for (const prot of ['doctor', 'bodyguard']) assert.ok(before(o, killer, prot), `${killer} before ${prot}`);
      for (const prot of ['doctor', 'bodyguard']) for (const inv of ['cop', 'detective', 'coroner', 'tracker', 'lookout']) assert.ok(before(o, prot, inv), `${prot} before ${inv}`);
      assert.ok(before(o, 'detective', 'tracker') && before(o, 'tracker', 'lookout'));
      // What the Host reads (the Say lines and the host view) follows the same order as the script the reducer resolves.
      const room = mk(FULL, { mode });
      const v = viewForHost(room);
      assert.deepEqual(v.script.map((s) => s.key), nightScript(room).map((s) => s.key));
      assert.deepEqual(Object.keys(v.story.steps), nightScript(room).map((s) => s.key).filter((k) => v.story.steps[k]));
      const says = nightScript(room).map((s) => stepScript(s, room)?.say).filter(Boolean);
      assert.ok(says.findIndex((t) => /^Mafia/.test(t)) < says.findIndex((t) => /^Doctor/.test(t)));
      assert.ok(says.findIndex((t) => /^Doctor/.test(t)) < says.findIndex((t) => /^Detective/.test(t)));
    });
  }
  test('Black Aces night 1: the Host identifies the Mafia before the Doctor', () => {
    const room = mk(SIMPLE, { mode: 'Black Aces (simple card key)', night: 1 });
    for (const p of room.players) p.roleId = null;
    room.deck = { map: [{ card: 'AS', roleId: 'mafia' }, { card: 'KH', roleId: 'doctor' }, { card: 'QH', roleId: 'cop' }, { card: '2S', roleId: 'villager' }, { card: '3S', roleId: 'villager' }], claimed: {} };
    const keys = nightScript(room).map((s) => s.key);
    assert.ok(keys.indexOf('id:mafia') < keys.indexOf('id:doctor') && keys.indexOf('id:doctor') < keys.indexOf('id:cop'), keys.join(' '));
  });
  test('the printed eyes-closed script uses the same order', () => {
    const steps = buildGuide(6, ['mafia', 'doctor', 'cop', 'hooker', 'villager', 'villager']).steps.filter((s) => s.kind === 'action').map((s) => s.roleId);
    assert.deepEqual(steps, ['hooker', 'mafia', 'doctor', 'cop']);
  });
  test('pinned: a v8 room keeps the old call order (Doctor before the Mafia)', () => {
    assert.deepEqual(order(mk(SIMPLE, { version: 8 })), ['doctor', 'mafia', 'cop']);
  });
  test('resolution is unchanged: a Doctor save works the same at v8 and v9', () => {
    for (const version of [8, 9]) {
      const room = mk(SIMPLE, { version });
      const k = (r) => nightScript(room).find((s) => s.roleId === r).key;
      const rep = resolveNight(room, { [k('mafia')]: { targets: ['pV1'] }, [k('doctor')]: { targets: ['pV1'] } });
      assert.equal(rep.deaths.length, 0, `v${version}`);
    }
  });
});

// ---------- blocker rule ----------
const BLOCK = [['H', 'hooker'], ['M', 'mafia'], ['D', 'doctor'], ['C', 'cop'], ['L', 'lookout'], ['V1', 'villager'], ['V2', 'villager'], ['V3', 'villager']];
const key = (room, roleId) => nightScript(room).find((s) => s.roleId === roleId).key;
const norm = (h) => h.replace(/data-a="undoStep"[^>]*>/g, '');
function stepHtml(room, mode, ui, focus) {
  S.ui.night = { ...ui, focus }; S.ui.checkSeen = {}; S.ui.checkCard = null;
  const view = viewForHost(room);
  S.view = view;
  return hostScreen(view, MODES[mode].local);
}

describe('v9 blocker rule: a blocked role still wakes and chooses; only the effect is cancelled', () => {
  for (const mode of Object.keys(MODES)) {
    test(`${mode}: the blocked Cop and the blocked Doctor open their picker and record a target`, () => {
      const room = mk(BLOCK, { mode });
      for (const blocked of ['C', 'D']) {
        const ui = { ...freshUi(room), actions: { [key(room, 'hooker')]: { targets: [`p${blocked}`] }, [key(room, 'mafia')]: { targets: ['pV1'] } } };
        const target = nightScript(room).find((s) => s.actors.includes(`p${blocked}`));
        S.ui.night = { ...ui, focus: target.key };
        const view = viewForHost(room);
        const nav = nightNav(view, S.ui.night);
        assert.equal(nav.current.key, target.key, 'the blocked role is still called');
        assert.equal(nav.needs?.kind, 'target', 'and asked for a target');
        const html = stepHtml(room, mode, ui, target.key);
        for (const p of ['V1', 'V2', 'V3', 'L']) assert.match(html, new RegExp(`data-a="pick" data-key="${target.key}" data-id="p${p}"`), `${p} can be picked`);
        S.ui.night.actions[target.key] = { targets: ['pV2'] };
        assert.ok(nightNav(viewForHost(room), S.ui.night).enabled, 'Next is open once the blocked role has picked');
        assert.ok(pressNext(viewForHost(room), S.ui.night));
      }
    });
    test(`${mode}: the block nullifies the effect at resolution (Doctor's save fails, Cop gets NO RESULT)`, () => {
      const room = mk(BLOCK, { mode });
      const kH = key(room, 'hooker'), kM = key(room, 'mafia'), kD = key(room, 'doctor'), kC = key(room, 'cop');
      // Doctor blocked: the save fails.
      const r1 = structuredClone(room);
      const rep = resolveNight(r1, { [kH]: { targets: ['pD'] }, [kM]: { targets: ['pV1'] }, [kD]: { targets: ['pV1'] } });
      assert.deepEqual(rep.deaths.map((d) => d.id), ['pV1']);
      // Cop blocked: no answer, shown as a NO RESULT card with a flat hand, never a MAFIA / NOT MAFIA.
      const acts = { [kH]: { targets: ['pC'] }, [kC]: { targets: ['pM'] } };
      const pv = previewNight(room, acts, kC);
      const step = nightScript(room).find((s) => s.key === kC);
      assert.deepEqual(checkCard(room, step, pv), { kind: 'none', text: 'NO RESULT' });
      assert.match(stepGesture(step, pv).text, /no sign/i);
      const r2 = structuredClone(room);
      const rep2 = resolveNight(r2, acts);
      assert.equal(rep2.info.some((i) => i.key === kC), false, 'no result in the report');
    });
  }
  test('limited-use: a blocked Vigilante still picks and loses the use (v8 rule 3, unchanged at v9)', () => {
    const room = mk([['H', 'hooker'], ['M', 'mafia'], ['Vi', 'vigilante'], ['V1', 'villager'], ['V2', 'villager']]);
    const kV = key(room, 'vigilante');
    const rep = resolveNight(room, { [key(room, 'hooker')]: { targets: ['pVi'] }, [kV]: { targets: ['pV1'] } });
    assert.equal(rep.deaths.length, 0);
    assert.equal(room.usage.pVi, 1);
  });
  for (const mode of Object.keys(MODES)) {
    test(`${mode}: non-interference: later roles see and can pick exactly the same, block or no block`, () => {
      const room = mk(BLOCK, { mode });
      const kH = key(room, 'hooker'), kC = key(room, 'cop');
      const run = (blockTarget) => {
        const actions = { [kH]: { targets: [blockTarget] }, [key(room, 'mafia')]: { targets: ['pV1'] }, [key(room, 'doctor')]: { targets: ['pV2'] } };
        const out = {};
        for (const s of nightScript(room).filter((x) => x.kind === 'action' && x.key !== kH)) {
          out[s.key] = norm(stepHtml(room, mode, { ...freshUi(room), actions: { ...actions } }, s.key)).match(/<li class="cue is-current[\s\S]*?<\/li>/)[0];
        }
        // The blocked (or not) Cop records a check: a card is shown either way, so the step plays out the same.
        const cAct = { ...actions, [kC]: { targets: ['pM'] } };
        out.card = !!checkCard(room, nightScript(room).find((s) => s.key === kC), previewNight(room, cAct, kC));
        out.players = room.players.map((p) => JSON.stringify(viewForPlayer(room, p.id)));
        return out;
      };
      const blocked = run('pC'), free = run('pV3');
      for (const k of Object.keys(free)) assert.deepEqual(blocked[k], free[k], k);
    });
  }
  test('invariants at v9: random games in every mode never dead-end and end final', () => {
    let games = 0;
    for (let i = 0; i < 30; i++) {
      const flow = ['app', 'claim', 'blind'][i % 3];
      const g = dealt({ roles: ['hooker', 'jailer', 'mafia', 'doctor', 'bodyguard', 'cop', 'detective', 'lookout', 'villager', 'villager'], version: 9, flow, seed: 900 + i });
      if (!g) continue;
      games++;
      playGame(g, { local: flow !== 'app', rounds: 12 });
      if (g.room.phase === 'over') {
        const snap = JSON.stringify(g.room);
        for (const a of [{ type: 'startNight' }, { type: 'submitNight', actions: {} }, { type: 'condemn', playerId: g.room.players[0].id }]) reduce(g.room, HOST, a);
        assert.equal(JSON.stringify(g.room), snap, 'game over stays final');
      }
    }
    assert.ok(games >= 25);
  });
});

describe('v9: only the Mafia kill call says "Mafia"; team members with their own action are called by their role', () => {
  const TEAM = [['H', 'hooker'], ['F', 'framer'], ['Jn', 'janitor'], ['M', 'mafia'], ['D', 'doctor'], ['C', 'cop'], ['V1', 'villager'], ['V2', 'villager']];
  for (const mode of Object.keys(MODES)) {
    test(`${mode}: one "Mafia, open your eyes" per night, and it is the kill`, () => {
      const room = mk(TEAM, { mode });
      const says = nightScript(room).map((s) => [s.roleId, stepScript(s, room)?.say]).filter(([, t]) => t);
      const mafiaCalls = says.filter(([, t]) => /^Mafia, open your eyes/.test(t));
      assert.deepEqual(mafiaCalls.map(([r]) => r), ['mafia'], JSON.stringify(says));
      assert.match(says.find(([r]) => r === 'hooker')[1], /^Hooker, open your eyes\. Pick someone to block\./);
      assert.match(says.find(([r]) => r === 'framer')[1], /^Framer, open your eyes\./);
      assert.match(says.find(([r]) => r === 'janitor')[1], /^Janitor, open your eyes\./);
      const v = viewForHost(room);
      assert.match(v.story.steps[key(room, 'hooker')].then, /^Hooker, close your eyes\./);
    });
  }
  test('pinned: a v8 room still calls the Hooker as "Mafia"', () => {
    const room = mk(TEAM, { version: 8 });
    const st = nightScript(room).find((s) => s.roleId === 'hooker');
    assert.match(stepScript(st, room).say, /^Mafia, open your eyes\. Pick someone to block\./);
  });
});

describe('FAQ matches what ships', () => {
  test('the FAQ wake order and blocker rule match the v9 engine', async () => {
    const { faqScreen } = await import('../public/js/faq.js');
    const html = faqScreen();
    const at = (t) => { const i = html.indexOf(t); assert.ok(i >= 0, t); return i; };
    assert.ok(at('Blockers and jailers first') < at('The Mafia’s kill') && at('The Mafia’s kill') < at('Protectors (Doctor') && at('Protectors (Doctor') < at('Investigators, such as the Cop'));
    at('Mafia, then Doctor, then Cop');
    at('A blocked or jailed player wakes and points like any other night');
    at('NO RESULT card');
    at('Cop 1, Cop 2, Hooker 1, Hooker 2');
    assert.ok(!/skip anyone who has died/i.test(html));
  });
});
