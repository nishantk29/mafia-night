// Plays many full online games over WebSockets with odd role mixes, odd names and dropped connections,
// checking after every move that nothing crashes and no phone ever sees a role it shouldn't. On top of that:
// - every built-in role is dealt at least once across the run (games are planned up front to fit them all in);
// - night choices are made the way the console allows them (nobody picks themselves, except protectors when the
//   house rule allows it; coin-flip checks get a coin);
// - rule oracles: what the console would tell each investigator live must match the morning report, and an
//   unframed, unblocked investigator gets the honest answer;
// - no phone holding a disguised role is ever sent that role's real name, id or description.
// The oracles live in sim-lib.mjs and also run in-process in test/sim-oracles.test.js.
// Usage: BASE=http://localhost:8787 GAMES=50 SEED=1 node scripts/sim-games.mjs   (ONLY=7 replays one game)
import { ROLES, ROLE_BY_ID, factionOf, registerRoles } from '../public/js/roles.js';
import { DEFAULT_RULES } from '../public/js/engine.js';
import { CATALOGUE, rng, planCoverage, pickNightActions, livePreviews, nightProblems, disguiseLeaks } from './sim-lib.mjs';

const BASE = process.env.BASE || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');
const GAMES = Number(process.env.GAMES || 50);
const ONLY = process.env.ONLY ? Number(process.env.ONLY) : null;
const PARALLEL = Number(process.env.PARALLEL || 5);
const SEED = Number(process.env.SEED || 1);
const MAX_ROUNDS = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- weird inputs ----------
const WEIRD_NAMES = ['😈', '<img src=x onerror=alert(1)>', 'Robert"); DROP', 'Zoë', 'محمد', 'שרה', '李小龙', 'a'.repeat(40),
  '   spaced   ', 'Ann​ie', '🃏🃏🃏', '${7*7}', '{{x}}', 'null', 'undefined', '__proto__', 'constructor', 'Ω≈ç√',
  'O\'Brien', 'tab\there', 'new\nline', '&amp;', '🏳️‍🌈', 'Dee (Bodyguard)', 'Mafia', 'Doctor', '1', 'x'];
const PLAIN = ['Sam', 'Priya', 'Jo', 'Ravi', 'Mei', 'Tom', 'Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jay', 'Kim', 'Lee',
  'Max', 'Ned', 'Oli', 'Pat', 'Quin', 'Rae', 'Sol', 'Tia', 'Uma', 'Vic', 'Wes', 'Xan', 'Yui', 'Zed'];

const BY = (pred) => ROLES.filter(pred).map((r) => r.id);
const MAFIA = BY((r) => factionOf(r.id) === 'mafia');
const TOWN = BY((r) => factionOf(r.id) === 'town');
const THIRD = BY((r) => factionOf(r.id) === 'third');
const ACT = (types) => BY((r) => r.action && types.includes(r.action.type));

// Role-mix strategies: each returns n role ids for a game.
const STRATEGIES = {
  random: (R, n) => [R.pick(MAFIA), ...Array.from({ length: n - 1 }, () => R.pick(ROLES).id)],
  mafiaHeavy: (R, n) => [...Array.from({ length: Math.ceil(n / 2) + R.int(2) }, () => R.pick(MAFIA)), ...Array.from({ length: n }, () => R.pick(TOWN))].slice(0, n),
  allMafia: (R, n) => Array.from({ length: n }, () => R.pick(MAFIA)),
  thirdParty: (R, n) => [R.pick(MAFIA), ...Array.from({ length: n - 1 }, () => R.pick(THIRD))],
  converters: (R, n) => [R.pick(MAFIA), ...Array.from({ length: n - 1 }, () => R.pick([...ACT(['convert', 'copyRole']), ...THIRD.filter((id) => ROLE_BY_ID[id].meeting === 'cult'), 'villager']))],
  blockers: (R, n) => [R.pick(MAFIA), R.pick(MAFIA), ...Array.from({ length: n - 2 }, () => R.pick([...ACT(['jail', 'block', 'blockVisitors']), 'villager']))],
  killers: (R, n) => [R.pick(MAFIA), ...Array.from({ length: n - 1 }, () => R.pick([...ACT(['kill', 'alert', 'guard', 'protect']), ...BY((r) => r.nightImmune || r.retaliate)]))],
  investigators: (R, n) => [R.pick(MAFIA), R.pick(ACT(['frame', 'clean']).concat(MAFIA)), ...Array.from({ length: n - 2 }, () => R.pick(ACT(['investigate', 'track', 'watch', 'autopsy'])))],
  sameRole: (R, n) => { const t = R.pick(TOWN); return ['mafia', ...Array(n - 1).fill(t)]; },
  sideWins: (R, n) => ['mafia', 'mafia', ...Array.from({ length: n - 2 }, () => R.pick(BY((r) => r.sideWin || r.winsWith || r.needsTarget).concat('villager')))],
  everything: (R, n) => R.shuffle(ROLES.map((r) => r.id)).slice(0, n - 1).concat(R.pick(MAFIA)),
  custom: (R, n, customs) => [R.pick(MAFIA), ...Array.from({ length: n - 1 }, () => (R.chance(0.5) ? R.pick(customs).id : R.pick(ROLES).id))],
};

// Ids are unique per game and seed, so every game's custom roles can stay registered in this process at once.
function customRoles(R, g) {
  const types = ['kill', 'protect', 'guard', 'alert', 'jail', 'block', 'blockVisitors', 'frame', 'clean', 'convert', 'copyRole', 'investigate', 'track', 'watch', 'autopsy'];
  return Array.from({ length: 6 }, (_, i) => {
    const alignment = R.pick(['town', 'mafia', 'third']);
    return {
      id: `c_${(SEED * 1000 + g).toString(36)}x${i}`, name: R.pick(['Weird ', 'Odd ', '😈 ', '<b>', '']) + R.pick(['Baker', 'Mime', 'Ghost', 'Clown', 'Oracle', 'Owl']) + i,
      emoji: R.pick(['🥖', '🎭', '👻', '🤡', '🔮', '🦉']), alignment, blurb: 'A test role with an odd power.',
      meeting: alignment === 'mafia' && R.chance(0.5) ? 'mafia' : null, nightImmune: R.chance(0.2), retaliate: R.chance(0.1),
      appearsAs: R.pick([undefined, 'mafia', 'innocent']), seesAs: R.pick([undefined, undefined, undefined, 'villager', 'cop']), day: R.chance(0.3) ? 'Once per day, shout.' : undefined, dayUses: 2,
      action: R.chance(0.85) ? { type: R.pick(types), uses: R.pick([undefined, 1, 2]), check: R.pick(['alignment', 'role', 'inverted', 'parity', 'fake']) } : undefined,
    };
  });
}

// ---------- plan every game up front ----------
// Each game's setup comes from its own random stream; then the coverage planner swaps missing roles into games
// that will deal, so the whole catalogue gets dealt in one run.
function planGame(g) {
  const R = rng(SEED * 100003 + g);
  const n = R.pick([5, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 25, 30, 40, 50]);
  const modeKind = R.pick(['app', 'app', 'claim', 'blind']);
  const strategy = R.pick(Object.keys(STRATEGIES));
  const customs = customRoles(R, g);
  registerRoles(customs);
  const roles = STRATEGIES[strategy](R, n, customs).map((id) => (ROLE_BY_ID[id] ? id : 'villager'));
  const rules = { revealOnDeath: R.chance(0.8), selfProtect: R.chance(0.7), firstNightKill: R.chance(0.8), dayStart: R.chance(0.15) };
  return { g, R, n, modeKind, strategy, customs, roles, rules };
}
const PLANS = Array.from({ length: GAMES }, (_, g) => planGame(g));
const UNPLACED = planCoverage(PLANS, rng(SEED * 7919));
const DEALT = new Set(); // built-in roles that really reached a player

// ---------- wire ----------
function connect(code, hello) {
  const ws = new WebSocket(`${WS}/ws/${code}`);
  const c = { ws, frames: [], fresh: [], views: [], seen: 0, errors: [], joined: null, fatal: null, closed: false, bytes: 0 };
  ws.onmessage = (e) => {
    c.frames.push(e.data); c.fresh.push(e.data); c.bytes = Math.max(c.bytes, e.data.length);
    if (c.frames.length > 40) c.frames.shift();
    const m = JSON.parse(e.data);
    if (m.type === 'view') { c.seen++; c.views.push(m.view); if (c.views.length > 5) c.views.shift(); }
    else if (m.type === 'error') c.errors.push(m.error);
    else if (m.type === 'joined') c.joined = m;
    else if (m.type === 'fatal') c.fatal = m.error;
  };
  ws.onclose = () => { c.closed = true; };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.last = () => c.views.at(-1);
  c.ready = new Promise((res, rej) => { ws.onopen = () => { if (hello) c.send(hello); res(); }; ws.onerror = () => rej(new Error('ws error')); });
  return c;
}
const LAT = []; // every host action's round-trip in ms
const until = async (fn, what, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(15); } throw new Error('timeout: ' + what); };

// ---------- one game ----------
async function playGame(plan) {
  const { g, R, n, modeKind, strategy, customs, roles, rules } = plan;
  const out = { g, problems: [], notes: [], rounds: 0, winner: null, maxFrame: 0 };
  const problem = (msg) => { if (!out.problems.includes(msg)) out.problems.push(msg); };
  const usesCustom = roles.some((id) => id.startsWith('c_'));
  Object.assign(out, { n, mode: modeKind, strategy, rules: Object.entries(rules).filter(([k, v]) => v !== DEFAULT_RULES[k]).map(([k, v]) => `${k}:${v ? 'on' : 'off'}`) });

  const { code, hostKey } = await (await fetch(`${BASE}/api/create`, { method: 'POST' })).json();
  out.code = code;
  let host = connect(code, { type: 'hello', hostKey }); host.isHost = true; await host.ready; await until(() => host.last(), 'host view');
  const all = [host];
  // Send a host action and wait for the broadcast it causes (or an error).
  const act = async (a, { expectError = false } = {}) => {
    const v0 = host.seen; const e0 = host.errors.length;
    const t = Date.now(); host.send(a);
    await until(() => host.seen > v0 || host.errors.length > e0, `host ${a.type}`);
    LAT.push(Date.now() - t);
    await sleep(5);
    const err = host.errors.length > e0 ? host.errors.at(-1) : null;
    if (err && !expectError) problem(`unexpected error on ${a.type}: ${err}`);
    return err;
  };
  // Every hello and every closed socket also makes the room broadcast. Before the host's next action it must
  // have received those, or act() would take one of them (a view from before the action) for the answer.
  const settle = async (s0, k, what) => {
    try { await until(() => host.seen >= s0 + k, what, 5000); } catch { problem(`host missed a broadcast after ${what} (${host.seen - s0} of ${k})`); }
  };
  // Resolve prompts until none are left: resolving one can raise another (a Hunter shooting a Hunter).
  const resolveAllPending = async (p = 1) => {
    for (let guard = 0; host.last().pending?.length && host.last().phase !== 'over' && guard < 50; guard++) {
      const al = host.last().players.filter((x) => x.alive);
      await act({ type: 'resolvePending', pendingId: host.last().pending[0].id, targetId: R.chance(p) && al.length ? R.pick(al).id : undefined });
    }
  };

  // Players: some on phones (weird names), some added by the host without phones.
  const phones = [];
  const phoneCount = modeKind === 'blind' ? R.int(Math.min(n, 4)) : Math.max(1, n - R.int(Math.ceil(n / 3)));
  const used = new Set();
  const joins0 = host.seen;
  for (let i = 0; i < phoneCount; i++) {
    let name = R.chance(0.35) ? R.pick(WEIRD_NAMES) : PLAIN[i % PLAIN.length] + (i >= PLAIN.length ? i : '');
    const p = connect(code, { type: 'hello', join: name }); all.push(p); await p.ready;
    await until(() => p.joined || p.errors.length || p.fatal || p.closed, 'join ' + JSON.stringify(name) + ` (player ${i + 1}, closed=${p.closed})`);
    if (!p.joined) { used.add(name.trim().toLowerCase()); p.ws.close(); continue; } // refused names are fine (duplicate, blank)
    phones.push(p);
  }
  await settle(joins0, phoneCount, 'joins'); // one broadcast per try: the join, or the refused socket closing
  // A duplicate of an existing name (different case) must be refused.
  if (phones[0]) {
    const dupName = phones[0].joined && host.last().players.find((x) => x.id === phones[0].joined.playerId)?.name;
    if (dupName) { const s0 = host.seen; const d = connect(code, { type: 'hello', join: dupName.toUpperCase() }); all.push(d); await d.ready; await until(() => d.joined || d.errors.length || d.fatal, 'dup'); if (d.joined && dupName.toUpperCase() !== dupName) problem(`duplicate name accepted: ${dupName.toUpperCase()}`); if (d.joined) { phones.push(d); await settle(s0, 1, 'duplicate join'); } }
  }
  const missing = n - host.last().players.length;
  if (missing > 0) await act({ type: 'addPlayers', names: Array.from({ length: missing }, (_, i) => `NoPhone${i}`) });
  let count = host.last().players.length;
  if (count > n) { // too many (duplicate let in): trim extra no-phone or phone players
    for (const p of host.last().players.slice(n)) await act({ type: 'removePlayer', playerId: p.id });
    count = host.last().players.length;
  }
  out.n = count;

  // Setup
  if (usesCustom) await act({ type: 'setCustomRoles', roles: customs });
  const mode = modeKind === 'app' ? 'app' : 'cards';
  await act({ type: 'setConfig', mode, cardFlow: modeKind === 'blind' ? 'blind' : 'claim', deckStyle: R.pick(['fixed', 'random']), roles: roles.slice(0, count), rules });
  const accepted = host.last().config.roles;
  if (accepted.length !== Math.min(roles.length, count)) problem(`setConfig dropped roles: sent ${roles.length}, kept ${accepted.length}`);
  const dealErr = await act({ type: 'deal' }, { expectError: true });
  if (dealErr) {
    out.notes.push(`deal refused, then fixed: ${dealErr.replace(/\..*/, '')}`);
    if (!/Mafia-aligned|exactly|already match|No Mafia|Fix the setup/i.test(dealErr)) problem(`deal refused unexpectedly: ${dealErr}`);
    // Like a host would: keep about one Mafia in four, turn the rest into Villagers, and deal again.
    let keep = Math.max(1, Math.floor(count / 4));
    const fixed = accepted.map((id) => (factionOf(id) !== 'mafia' ? id : keep-- > 0 ? id : 'villager'));
    if (!fixed.some((id) => factionOf(id) === 'mafia')) fixed[0] = 'mafia';
    await act({ type: 'setConfig', roles: fixed });
    const again = await act({ type: 'deal' }, { expectError: true });
    if (again) { problem(`deal still refused after fixing the setup: ${again}`); all.forEach((c) => c.ws.close()); return out; }
  }

  // Card flows
  if (modeKind === 'claim') {
    const map = host.last().deck.map; const free = R.shuffle(map.map((m) => m.card));
    const claims0 = host.seen; let claimed = 0;
    for (const p of phones) {
      if (R.chance(0.3)) { const e0 = p.errors.length; p.send({ type: 'claimCard', card: 'ZZ' }); await until(() => p.errors.length > e0, 'wrong claim'); }
      const card = free.pop(); if (!card) break;
      const e0 = p.errors.length;
      const s0 = p.seen;
      p.send({ type: 'claimCard', card });
      try { await until(() => p.last()?.me.role || p.errors.length > e0, 'claim'); }
      catch (e) { const H = host.last(); const slot = H.deck.map.find((m) => m.card === card); throw new Error(`claim timeout: card ${card} -> ${slot?.roleId}, player views ${s0}->${p.seen}, me.role=${JSON.stringify(p.last()?.me.role)}, card=${p.last()?.me.card}, closed=${p.closed}, errors=${JSON.stringify(p.errors)}, fatal=${p.fatal}`); }
      if (!p.last()?.me.role) problem(`claim failed: ${p.errors.at(-1)}`); else claimed++;
    }
    await settle(claims0, claimed, 'card claims'); // the host must see every claim before handing out the rest
    for (const q of host.last().players.filter((x) => !x.roleId)) { const card = free.pop(); if (card) await act({ type: 'assignCard', playerId: q.id, card }); }
    if (host.last().players.some((x) => !x.roleId)) problem('claim flow: someone left without a role');
  }

  // Roles dealt, counted once everyone holds one and before any night can change them.
  const recordDealt = () => { const H = host.last(); if (H.players.every((x) => x.roleId)) for (const x of H.players) if (CATALOGUE.includes(x.roleId)) DEALT.add(x.roleId); };
  recordDealt();

  // Secrecy check over every phone, every step.
  const tokens = phones.map((p) => p.joined?.token).filter(Boolean);
  // Phones get each broadcast a moment after the host, so first wait until every open phone has caught up
  // with the host's state; otherwise a phone's view from one step earlier is compared with newer roles.
  const inSync = (v, H) => v && v.phase === H.phase && v.night === H.night && v.day === H.day
    && v.players.filter((q) => q.alive).map((q) => q.id).join() === H.players.filter((q) => q.alive).map((q) => q.id).join();
  const checkSecrecy = async () => {
    const H = host.last(); if (!H) return;
    const open = phones.filter((p) => !p.closed && p.last()?.kind === 'player');
    try { await until(() => open.every((p) => p.closed || inSync(p.last(), H)), 'phones to catch up', 5000); }
    catch { problem(`a phone's view did not catch up with the host (${H.phase}, night ${H.night})`); return; }
    const byId = new Map(H.players.map((p) => [p.id, p]));
    // Every frame a phone was sent since the last check: a disguised role must not learn what it really is.
    for (const c of all) {
      if (c.isHost) continue;
      for (const f of c.fresh.splice(0)) {
        const m = JSON.parse(f);
        if (m.type === 'view' && m.view.kind === 'player') for (const x of disguiseLeaks(m.view, byId.get(m.view.me.id)?.roleId)) problem(x);
      }
    }
    for (const [i, p] of phones.entries()) {
      if (p.closed) continue;
      const v = p.last(); if (!v || v.kind !== 'player') continue;
      const me = byId.get(v.me.id); if (!me) continue;
      const over = v.phase === 'over';
      for (const q of v.players) {
        const real = byId.get(q.id);
        if (q.id === v.me.id) continue;
        if (!over && q.alive && q.role) problem(`LEAK: ${v.me.name} sees living ${q.name}'s role`);
        if (!over && !q.alive && real?.roleHidden && q.role) problem(`LEAK: Janitor-hidden role of ${q.name} visible`);
        if (!over && !q.alive && rules.revealOnDeath === false && q.role) problem(`LEAK: ${q.name}'s role shown on death with "reveal on death" off`);
      }
      // Teammates only for meeting roles
      const myReal = ROLE_BY_ID[me.roleId];
      if (!over && v.me.team.length && !myReal?.meeting) problem(`LEAK: ${myReal?.id} has teammates listed`);
      for (const t of v.me.team) if (byId.get(t.id) && ROLE_BY_ID[byId.get(t.id).roleId]?.meeting !== myReal?.meeting) problem(`LEAK: wrong teammate listed: ${v.me.name} (${me.roleId}, phone sees ${v.me.role?.id}, phase ${v.phase}/${H.phase} n${v.night}/${H.night}) is shown ${t.name} (${byId.get(t.id).roleId}, from ${byId.get(t.id).convertedFrom})`);
      // Public log must not name a living player's role.
      if (!over) for (const l of v.publicLog || []) for (const q of H.players) {
        if (!q.alive || q.id === v.me.id || !q.roleId) continue;
        const rn = ROLE_BY_ID[q.roleId]?.name; if (rn && q.name.length > 1 && l.text.includes(`${q.name} (${rn})`)) problem(`LEAK: public log shows "${q.name} (${rn})" while alive`);
      }
      for (const f of p.frames) {
        if (f.includes(hostKey) || f.includes('"hostKey"') || f.includes('"deck":')) problem('LEAK: host secret on a player socket');
        if (JSON.parse(f).type !== 'joined') tokens.forEach((t, j) => { if (j !== i && f.includes(t)) problem("LEAK: another player's token"); });
        if (modeKind === 'claim' && f.includes('"deckKey":[')) problem('LEAK: card key sent in claim flow');
      }
      out.maxFrame = Math.max(out.maxFrame, p.bytes, host.bytes);
    }
  };
  await checkSecrecy();

  // Players must not be able to drive the game.
  if (phones[0]) { const e0 = phones[0].errors.length; phones[0].send({ type: 'startNight' }); await until(() => phones[0].errors.length > e0 || phones[0].closed, 'player host action'); if (!phones[0].errors.includes('Host only.')) problem('player could send a host action'); }

  // House rule: open with a day of talk. Refused with a blind card deal (night 1 is when the storyteller learns who is who).
  if (rules.dayStart) {
    if (modeKind === 'blind') {
      if (!await act({ type: 'startDay' }, { expectError: true })) problem('a day start was allowed with a blind card deal');
    } else {
      await act({ type: 'startDay' });
      if (host.last().phase !== 'day') problem(`day start did not start a day (phase ${host.last().phase})`);
      const al = host.last().players.filter((x) => x.alive);
      if (R.chance(0.7)) await act({ type: 'condemn', playerId: R.pick(al).id }); else await act({ type: 'noCondemn' });
      await checkSecrecy();
    }
  }

  // ---------- rounds ----------
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    out.rounds = round;
    let H = host.last();
    if (H.phase === 'over') break;
    await resolveAllPending(0.7);
    if (host.last().phase === 'over') break;
    await act({ type: 'startNight' });
    H = host.last();
    if (H.phase !== 'night') { problem(`night did not start (phase ${H.phase})`); break; }

    // Blind night 1: identify every role slot.
    let guard = 0;
    while (host.last().script.some((s) => s.kind === 'identify') && guard++ < 60) {
      const step = host.last().script.find((s) => s.kind === 'identify');
      const open = host.last().players.filter((x) => !x.roleId);
      if (R.chance(0.1)) await act({ type: 'identifyRole', roleId: step.roleId, playerIds: [] }, { expectError: true }); // wrong count
      await act({ type: 'identifyRole', roleId: step.roleId, playerIds: R.shuffle(open).slice(0, step.count).map((x) => x.id) });
    }
    if (host.last().players.some((x) => !x.roleId)) { problem('blind: players left unmatched after identifying'); break; }
    recordDealt();
    await checkSecrecy();

    // Night actions as the console records them: random targets, sometimes skipped, now and then a dead target.
    // What the console would tell each investigator live is worked out before the night resolves.
    const night = host.last();
    const actions = pickNightActions(R, night, { odd: 0.05 });
    const previews = livePreviews(night, actions);
    const before = night.players.filter((x) => x.alive).length;
    await act({ type: 'submitNight', actions });
    H = host.last();
    if (!['day', 'over'].includes(H.phase)) { problem(`night did not resolve (phase ${H.phase})`); break; }
    const afterAlive = H.players.filter((x) => x.alive).length;
    if (afterAlive > before) problem('more players alive after the night than before');
    if (H.report?.night !== night.night) problem(`no morning report for night ${night.night}`);
    else for (const x of nightProblems(night, actions, H, previews)) problem(`night ${night.night}: ${x}`);
    await checkSecrecy();
    if (H.phase === 'over') break;

    // Mid-game chaos: reconnects, markers, notes, host drop.
    if (phones.length && R.chance(0.4)) {
      const i = R.int(phones.length); const p = phones[i]; const cred = p.joined;
      if (cred && !p.closed) {
        const s0 = host.seen;
        p.ws.close(); await sleep(20);
        const re = connect(code, { type: 'hello', playerId: cred.playerId, token: cred.token }); all.push(re); await re.ready;
        await until(() => re.last() || re.fatal, 'rejoin');
        if (re.fatal) problem(`rejoin refused: ${re.fatal}`); else await settle(s0, 2, 'a phone reconnect'); // close + hello
        re.joined = cred; phones[i] = re;
      }
    }
    if (R.chance(0.25)) {
      // The old socket's close is broadcast too; let a phone see it first so it can't reach the new host socket late.
      const watcher = phones.find((p) => !p.closed); const w0 = watcher?.seen;
      host.ws.close(); await sleep(20);
      if (watcher) { try { await until(() => watcher.seen > w0 || watcher.closed, 'host close broadcast', 5000); } catch { problem('the host leaving was never broadcast'); } } else await sleep(150);
      host = connect(code, { type: 'hello', hostKey }); host.isHost = true; all.push(host); await host.ready; await until(() => host.last(), 'host rejoin');
    }
    if (R.chance(0.3)) { const p = R.pick(host.last().players); await act({ type: 'toggleTag', playerId: p.id, tag: 'red' }, { expectError: true }); await act({ type: 'setNote', playerId: p.id, note: R.pick(WEIRD_NAMES) }); }

    // Day: pending prompts, day abilities, a vote.
    await resolveAllPending();
    if (host.last().phase === 'over') break;
    const dayAlive = host.last().players.filter((x) => x.alive);
    for (const p of dayAlive) if (ROLE_BY_ID[p.roleId]?.day && R.chance(0.3)) await act({ type: 'useDay', playerId: p.id });
    if (R.chance(0.8) && dayAlive.length) await act({ type: 'condemn', playerId: R.pick(dayAlive).id });
    else await act({ type: 'noCondemn' });
    // Odd host moves: condemn a dead player (must be refused or harmless), revive then kill again.
    if (R.chance(0.1)) { const dead = host.last().players.find((x) => !x.alive); if (dead) await act({ type: 'condemn', playerId: dead.id }, { expectError: true }); }
    if (R.chance(0.05)) { const dead = host.last().players.find((x) => !x.alive); if (dead) { await act({ type: 'revive', playerId: dead.id }); await act({ type: 'kill', playerId: dead.id, cause: 'storyteller' }); } }
    await checkSecrecy();
  }

  const H = host.last();
  out.winner = H.phase === 'over' ? H.winner?.side : null;
  if (H.phase === 'over') {
    if (!H.winner) problem('game over without a winner');
    // At the end everyone's role is public.
    for (const p of phones) { const v = p.last(); if (v && v.kind === 'player' && v.phase === 'over' && v.players.some((q) => !q.role)) problem('roles not revealed at game over'); }
  } else {
    // Still running: is it a real stalemate the storyteller must call?
    const factions = new Set(H.players.filter((x) => x.alive).map((x) => factionOf(x.roleId)));
    out.notes.push(`no auto-win after ${MAX_ROUNDS} rounds; alive factions: ${[...factions].join('+')} (${H.players.filter((x) => x.alive).length} alive)`);
  }
  // Undo/new game afterwards must work.
  await act({ type: 'newGame' });
  if (host.last().phase !== 'lobby') problem('new game did not return to setup');
  for (const p of phones) if (p.fatal) problem(`player got fatal: ${p.fatal}`);
  all.forEach((c) => { try { c.ws.close(); } catch {} });
  return out;
}

// ---------- run ----------
const results = [];
const t0 = Date.now();
for (let start = 0; start < GAMES; start += PARALLEL) {
  const ids = Array.from({ length: Math.min(PARALLEL, GAMES - start) }, (_, k) => start + k).filter((g) => ONLY === null || g === ONLY);
  const batch = ids.map((g) => { const t = Date.now(); return playGame(PLANS[g]).catch((e) => ({ g, problems: [`CRASH: ${e.message}`], notes: [] })).then((r) => ({ ...r, ms: Date.now() - t })); });
  for (const r of await Promise.all(batch)) {
    results.push(r);
    const tag = r.problems.length ? 'FAIL' : 'ok  ';
    console.log(`${tag} #${String(r.g).padStart(2)} ${String(r.n ?? '?').padStart(2)}p ${String(r.mode ?? '').padEnd(5)} ${String(r.strategy ?? '').padEnd(13)} rounds ${String(r.rounds ?? 0).padStart(2)} ${String(Math.round(r.ms / 1000)).padStart(3)}s  ${r.winner ? 'winner: ' + r.winner : ''}${r.rules?.length ? '  [' + r.rules.join(' ') + ']' : ''}${r.notes.length ? '  · ' + r.notes.join(' | ') : ''}`);
    for (const p of r.problems) console.log('       ✗ ' + p);
  }
}
const failed = results.filter((r) => r.problems.length);
const wins = {}; for (const r of results) if (r.winner) wins[r.winner] = (wins[r.winner] || 0) + 1;
console.log(`\n${results.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${results.length - failed.length} clean · ${failed.length} with problems`);
LAT.sort((a, b) => a - b);
console.log('host action round-trip ms: median', LAT[LAT.length >> 1], '· p99', LAT[Math.floor(LAT.length * 0.99)], '· max', LAT.at(-1), `· ${LAT.length} actions`);
console.log('winners:', JSON.stringify(wins), '· largest frame:', Math.max(...results.map((r) => r.maxFrame || 0)), 'bytes');
// Role coverage: every built-in role should have reached a player somewhere in the run.
let uncovered = [];
if (ONLY === null) {
  const missing = CATALOGUE.filter((id) => !DEALT.has(id));
  uncovered = missing.filter((id) => !UNPLACED.includes(id)); // planned into a game, but never dealt
  console.log(`roles dealt: ${CATALOGUE.length - missing.length} of ${CATALOGUE.length}`);
  if (UNPLACED.length) console.log(`  ${UNPLACED.length} roles did not fit in ${GAMES} games; run more games to deal them all`);
  if (uncovered.length) console.log(`  ✗ planned but never dealt: ${uncovered.join(', ')}`);
}
process.exit(failed.length || uncovered.length ? 1 : 0);
