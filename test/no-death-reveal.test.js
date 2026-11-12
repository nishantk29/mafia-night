// Decided Oct 29 2026 ("We dont reveal the role"): by default a death never names a role. With "show card on death"
// off (the default, and every room made before the default changed), the morning line, the vote result, the public log,
// the roles sheet and every phone payload carry no role for the dead, across every preset and every role. Game over shows all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost, viewForPlayer, messagesFor } from '../public/js/room.js';
import { morningAnnouncement, killPlayer, condemn, rulesOf, REVEAL_POLICY } from '../public/js/engine.js';
import { ROLES, ROLE_BY_ID } from '../public/js/roles.js';
import { MAFIA_PRESETS } from '../public/js/preset-mixes.js';
import { dayModel } from '../public/js/host-timeline.js';
import { rolesModel } from '../public/js/roles_sheet.js';
import { ADVANCED_DEFAULTS } from '../public/js/config-defaults.js';

const HOST = { host: true };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLE_WORDS = new RegExp(`\\b(${[...new Set(Object.values(ROLE_BY_ID).map((r) => r.name))].sort((a, b) => b.length - a.length).map(esc).join('|')})\\b`, 'i');
const nm = (i) => `Q${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`;
const blank = { saves: [], info: [], conversions: [], notes: [], coins: [] };

function deal(roles, { legacy = false, staleOn = false, hidden = false } = {}) {
  const room = newRoom('NOREV', 'hostkey');
  const names = roles.map((_, i) => nm(i));
  for (const name of names) assert.ok(reduce(room, { anon: true }, { type: 'join', name }).ok);
  const r = reduce(room, HOST, { type: 'setConfig', mode: 'app', roles, advanced: { hiddenSetup: hidden } });
  assert.ok(r.ok, r.error);
  if (staleOn) reduce(room, HOST, { type: 'setConfig', rules: { revealOnDeath: true } }); // an old cached client, no stamp: refused
  if (legacy) { delete room.config.revealPolicy; room.config.rules.revealOnDeath = true; } // a room saved by the old build
  const d = reduce(room, HOST, { type: 'deal' }); assert.ok(d.ok, d.error);
  assert.ok(reduce(room, HOST, { type: 'startNight' }).ok);
  return room;
}

function noLeak(room, label) {
  assert.equal(rulesOf(room).revealOnDeath, false, `${label}: reveal must be off`);
  const host = viewForHost(room);
  assert.equal(host.config.rules.revealOnDeath, false, `${label}: host view must read reveal as off (pop-out, roles sheet, vote steps)`);
  const dead = room.players.filter((p) => !p.alive);
  // night: one death, then the morning line
  const victim = room.players.find((p) => p.alive);
  killPlayer(room, victim.id, 'killed in the night');
  room.lastReport = { ...blank, deaths: [{ id: victim.id, cause: 'killed in the night', hidden: false }] };
  room.phase = 'day'; room.day = 1;
  const m = morningAnnouncement(room, room.lastReport);
  assert.equal(m.say, `Everyone, open your eyes. ${victim.name} was killed in the night.`, `${label}: morning`);
  // day vote
  const out = room.players.find((p) => p.alive && p.id !== victim.id);
  condemn(room, out.id);
  const day = dayModel(viewForHost(room), { stage: 'vote', sel: out.id, result: '' }, viewForHost(room).config.rules.revealOnDeath !== false);
  assert.ok(!day.upcoming?.some((s) => s.key === 'reveal'), `${label}: no "shows their card" step`);
  if (room.phase === 'over') return; // game over may reveal everything
  const gone = [victim, out, ...dead];
  for (const me of room.players) {
    for (const msg of messagesFor(room, { who: 'player', playerId: me.id })) {
      const v = msg.view; if (!v) continue;
      for (const q of v.players) if (q.id !== me.id && !q.alive) assert.equal(q.role, null, `${label}: ${me.name} sees dead ${q.name}'s role`);
      for (const l of v.publicLog) assert.ok(!ROLE_WORDS.test(l.text), `${label}: public log names a role: ${l.text}`);
      const pub = JSON.stringify({ players: v.players.filter((q) => q.id !== me.id), log: v.publicLog });
      for (const g of gone) if (g.id !== me.id) assert.ok(!pub.includes(`"${g.roleId}"`), `${label}: ${g.name}'s role id on ${me.name}'s phone`);
      assert.deepEqual(rolesModel(v).revealed, [], `${label}: roles sheet fills in on ${me.name}'s phone`);
    }
  }
  assert.deepEqual(rolesModel(viewForHost(room)).revealed, [], `${label}: host roles sheet fills in`);
}

test('default: "show card on death" is off, in config-defaults and on a new room', () => {
  assert.equal(ADVANCED_DEFAULTS.cardOnDeath, false);
  assert.equal(rulesOf(newRoom('A', 'k')).revealOnDeath, false);
});

test('every preset, smallest and largest table, new room / legacy room / stale client: no role on death', () => {
  for (const pr of MAFIA_PRESETS) for (const n of [pr.min, pr.max]) for (const mode of ['new', 'legacy', 'staleOn']) {
    const room = deal(pr.mix(n), { legacy: mode === 'legacy', staleOn: mode === 'staleOn', hidden: !!pr.hiddenSetup });
    noLeak(room, `${pr.id} ${n} ${mode}`);
  }
});

test('every built-in role dies with its role kept secret', () => {
  const ids = ROLES.map((r) => r.id).filter((id) => !ROLE_BY_ID[id].requiresPartner);
  for (const id of ids) for (const legacy of [false, true]) {
    const roles = [id, 'mafia', 'villager', 'villager', 'villager', 'doctor'];
    let room;
    try { room = deal(roles, { legacy }); } catch { continue; } // a mix the setup rules refuse is not a game
    const p = room.players.find((q) => q.roleId === id) || room.players[0];
    const m0 = room.players.find((q) => q.id !== p.id && q.alive);
    killPlayer(room, p.id, 'killed in the night');
    room.lastReport = { ...blank, deaths: [{ id: p.id, cause: 'killed in the night', hidden: false }] };
    room.phase = 'day'; room.day = 1;
    const say = morningAnnouncement(room, room.lastReport).say;
    assert.ok(!ROLE_WORDS.test(say.replace(p.name, '')), `${id}: ${say}`);
    if (room.phase !== 'over') for (const q of room.players) if (q.id !== p.id) assert.equal(viewForPlayer(room, q.id).players.find((x) => x.id === p.id).role, null, `${id} legacy=${legacy}`);
    void m0;
  }
});

test('the host can still turn it on (with the stamp), and game over shows every role', () => {
  const room = deal(MAFIA_PRESETS[0].mix(MAFIA_PRESETS[0].min));
  const t = newRoom('ON', 'k');
  for (let i = 0; i < 6; i++) reduce(t, { anon: true }, { type: 'join', name: nm(i) });
  assert.ok(reduce(t, HOST, { type: 'setConfig', rules: { revealOnDeath: true }, revealPolicy: REVEAL_POLICY }).ok);
  assert.equal(rulesOf(t).revealOnDeath, true);
  room.phase = 'over';
  for (const p of room.players) for (const q of viewForPlayer(room, p.id).players) assert.ok(q.role, 'game over reveals all');
});
