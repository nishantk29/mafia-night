// Pure helpers for the game simulator: seeded randomness, role-coverage planning, storyteller-like night
// choices and the rule oracles. No network here, so test/sim-oracles.test.js runs the same checks in node.
import { ROLES, ROLE_BY_ID, factionOf, registerRoles } from '../public/js/roles.js';
import { MIN_PLAYERS, setupWarnings, previewNight } from '../public/js/engine.js';
import { roomFromView } from '../public/js/room.js';

// Every built-in role id, taken before any custom role is registered.
export const CATALOGUE = ROLES.map((r) => r.id);

// ---------- deterministic randomness ----------
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n) => Math.floor(next() * n);
  const pick = (arr) => arr[int(arr.length)];
  const chance = (p) => next() < p;
  const shuffle = (arr) => { const b = [...arr]; for (let i = b.length - 1; i > 0; i--) { const j = int(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  return { next, int, pick, chance, shuffle };
}

// ---------- setup ----------
// The same checks the room's `deal` action makes. Returns the refusal text, or null if the deal would go through.
export function dealRefusal(roleIds, n) {
  if (n < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players.`;
  if (roleIds.length !== n) return `Pick exactly ${n} roles.`;
  if (roleIds.some((id) => !ROLE_BY_ID[id])) return 'Unknown role.';
  if (!roleIds.some((id) => factionOf(id) === 'mafia')) return 'Add at least one Mafia-aligned role.';
  return setupWarnings(roleIds, n).find((w) => w.level === 'error')?.text || null;
}

// Makes sure every built-in role is dealt somewhere in a run. `plans` is [{ roles, n }]; plans whose deal is
// refused on purpose are left alone. Each missing role replaces a slot whose role is dealt elsewhere too, and
// only where the setup stays dealable. Returns the roles there was no room for (raise GAMES to fit them).
export function planCoverage(plans, R, catalogue = CATALOGUE) {
  const dealable = plans.filter((p) => !dealRefusal(p.roles.slice(0, p.n), p.n));
  const count = new Map();
  const bump = (id, d) => count.set(id, (count.get(id) || 0) + d);
  for (const p of dealable) for (const id of p.roles.slice(0, p.n)) bump(id, 1);
  const unplaced = [];
  let at = 0;
  for (const want of R.shuffle(catalogue.filter((id) => !count.get(id)))) {
    let done = false;
    for (let k = 0; k < dealable.length && !done; k++) {
      const p = dealable[(at + k) % dealable.length];
      for (const i of R.shuffle([...Array(p.n).keys()])) {
        const old = p.roles[i];
        if (count.get(old) < 2) continue; // never un-deal the only copy of a role
        const next = p.roles.slice(0, p.n); next[i] = want;
        if (dealRefusal(next, p.n)) continue;
        p.roles = next; bump(old, -1); bump(want, 1);
        at = (at + k + 1) % dealable.length; done = true; break;
      }
    }
    if (!done) unplaced.push(want);
  }
  return unplaced;
}

// ---------- the night, as a storyteller would record it ----------
export const LIVE = ['investigate', 'track', 'watch', 'autopsy'];
export const COIN = ['fake'];
// Who a step may pick, exactly as the console offers it: the living, minus the actors themselves (protectors
// may pick themselves unless the "Doctors can protect themselves" house rule is off), or the dead for steps on the dead.
export function candidates(view, step) {
  if (step.dead) return view.players.filter((p) => !p.alive);
  const selfOk = step.type === 'protect' && view.config.rules?.selfProtect !== false;
  return view.players.filter((p) => p.alive && (selfOk || !step.actors.includes(p.id)));
}
// Random choices for every action step in a host view of a night. Sometimes skipped; coin-flip checks get a coin.
// `odd` is the chance a step picks from everyone, the dead included (a hand-made request; never the actors themselves).
export function pickNightActions(R, view, { skip = 0.15, odd = 0 } = {}) {
  const actions = {};
  for (const s of view.script.filter((x) => x.kind === 'action')) {
    if (R.chance(skip)) { if (R.chance(0.5)) actions[s.key] = { targets: [] }; continue; } // storyteller skips
    const need = s.targets ?? 1;
    if (!need) { actions[s.key] = { on: R.chance(0.6), targets: [] }; continue; }
    const pool = !s.dead && R.chance(odd) ? view.players.filter((p) => !s.actors.includes(p.id)) : candidates(view, s);
    if (pool.length < need) continue;
    actions[s.key] = { targets: R.shuffle(pool).slice(0, need).map((x) => x.id) };
    if (s.type === 'investigate' && COIN.includes(s.check)) actions[s.key].coin = R.pick(['mafia', 'innocent']);
    if (s.type === 'investigate' && s.check === 'random') actions[s.key].flip = R.pick(['heads', 'tails']);
  }
  return actions;
}

// ---------- rule oracles ----------
const side = (v) => (v === 'mafia' ? 'MAFIA' : 'NOT Mafia');
// What an honest check shows, from the role data alone.
const looks = (roleId) => { const r = ROLE_BY_ID[roleId]; return r.appearsAs || (r.alignment === 'mafia' ? 'mafia' : 'innocent'); };

// What the console would tell each investigator live, from the host's view of the night before it resolves.
export function livePreviews(before, actions) {
  registerRoles(before.config.customRoles);
  const out = {};
  for (const s of before.script) {
    if (s.kind !== 'action' || !LIVE.includes(s.type)) continue;
    const set = actions[s.key];
    if (!set?.targets?.length || set.targets.length < (s.targets ?? 1)) continue;
    out[s.key] = previewNight(roomFromView(before), actions, s.key);
  }
  return out;
}

// Checks one resolved night. `before` is the host view during the night, `after` the host view once it resolved
// (its report holds the results), `previews` what livePreviews said. Returns a list of problems.
export function nightProblems(before, actions, after, previews) {
  registerRoles(before.config.customRoles);
  const problems = [];
  const rep = after.report;
  if (!rep) return ['no morning report after the night'];
  const info = new Map(rep.info.map((i) => [i.key, i]));
  const pl = new Map(after.players.map((p) => [p.id, p]));
  const name = (id) => pl.get(id)?.name;
  const steps = before.script.filter((s) => s.kind === 'action');
  const chosen = (s) => { const set = actions[s.key]; return set?.targets?.length >= (s.targets ?? 1) ? set.targets : null; };
  const label = (s) => `${ROLE_BY_ID[s.roleId]?.name || s.roleId} (${s.actors.map(name).join(', ')})`;

  // 1) The live preview the storyteller read out must be what the morning report and the phone say.
  for (const [key, prev] of Object.entries(previews)) {
    const s = steps.find((x) => x.key === key);
    const got = info.get(key);
    if (prev.blocked && got) problems.push(`ORACLE: ${label(s)} was told nothing live, but the report says "${got.text}"`);
    else if (!prev.blocked && !got) problems.push(`ORACLE: ${label(s)} was told "${prev.text}" live, but the report has no result`);
    else if (got && (got.text !== prev.text || (got.note || '') !== (prev.note || ''))) problems.push(`ORACLE: ${label(s)} was told "${prev.text}" live, but the report says "${got.text}"`);
  }

  // 2) An investigator nobody blocked must get a result, and an honest check of an unframed player is the truth.
  const touched = (types, ids) => steps.some((x) => types.includes(x.type) && chosen(x)?.some((t) => ids.includes(t)));
  for (const s of steps) {
    const t = chosen(s);
    if (!t || !LIVE.includes(s.type)) continue;
    const mayBeBlocked = touched(['jail', 'block'], s.actors)
      || steps.some((g) => g.type === 'blockVisitors' && t.includes(chosen(g)?.[0]) && g.key !== s.key);
    if (mayBeBlocked) continue;
    const got = info.get(s.key);
    if (!got) { problems.push(`ORACLE: ${label(s)} was not blocked but got no result`); continue; }
    if (s.type !== 'investigate' && s.type !== 'autopsy') continue;
    const framed = touched(['frame'], t);
    const [a, b] = t.map((id) => pl.get(id));
    let want = null;
    if (s.type === 'autopsy') want = `${a.name} was the ${ROLE_BY_ID[a.roleId].name}.`;
    else if (s.check === 'alignment' && !framed) want = `${a.name} is ${side(looks(a.roleId))}.`;
    else if (s.check === 'inverted' && !framed) want = `${a.name} is ${side(looks(a.roleId) === 'mafia' ? 'innocent' : 'mafia')}.`;
    else if (s.check === 'naive') want = `${a.name} is NOT Mafia.`;
    else if (s.check === 'paranoid') want = `${a.name} is MAFIA.`;
    else if (s.check === 'random' && !framed) want = `${a.name} is ${side(actions[s.key].flip === 'heads' ? looks(a.roleId) : looks(a.roleId) === 'mafia' ? 'innocent' : 'mafia')}.`;
    else if (COIN.includes(s.check)) want = `${a.name} is ${side(actions[s.key].coin)}.`;
    else if (s.check === 'role') want = `${a.name} is the ${ROLE_BY_ID[a.roleId].name}.`;
    else if (s.check === 'parity' && !framed) want = `${a.name} and ${b.name} are ${looks(a.roleId) === looks(b.roleId) ? 'on the SAME side' : 'on DIFFERENT sides'}.`;
    if (want && got.text !== want) problems.push(`ORACLE: ${label(s)} should be told "${want}" but got "${got.text}"`);
  }
  return problems;
}

// A player holding a disguised role (anything with `seesAs`) must never be sent its real name, id or blurb
// while alive and the game is on. Other players' revealed roles are public and are left out of the check.
export function disguiseLeaks(view, realRoleId) {
  const real = ROLE_BY_ID[realRoleId];
  if (!real?.seesAs || !view || view.kind !== 'player' || view.phase === 'over' || !view.me?.alive) return [];
  const own = structuredClone(view);
  for (const q of own.players) if (q.id !== own.me.id) q.role = null;
  // Role checks name another player's real role by design ("Con is the Confused Cop."), even a twin's.
  const others = view.players.filter((q) => q.id !== view.me.id).map((q) => q.name);
  own.me.results = own.me.results.filter((r) => !others.some((n) => r.text.startsWith(`${n} is the `) || r.text.startsWith(`${n} was the `)));
  let text = JSON.stringify(own);
  // A player may be called "Insane Cop". Names shorter than any role name can't cause that, and stripping them
  // would hide real leaks, so only longer names are cut out.
  for (const q of view.players) { const n = JSON.stringify(q.name).slice(1, -1); if (n.length >= 4) text = text.split(n).join(''); }
  // The blurb only gives the role away if no other role shares it.
  const blurb = Object.values(ROLE_BY_ID).some((r) => r.id !== real.id && r.blurb === real.blurb) ? null : real.blurb;
  const hits = [`"${real.id}"`, real.name, blurb].filter((s) => s && text.includes(s));
  if (!hits.length) return [];
  // Say where: the first field whose text holds one of the hits.
  const where = [];
  const walk = (x, path) => {
    if (typeof x === 'string') { if (hits.some((h) => x.includes(h.replace(/^"|"$/g, '')))) where.push(path); return; }
    if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, `${path}.${k}`);
  };
  walk(own, 'view');
  return [`LEAK: ${view.me.name} (${real.name}, shown as ${ROLE_BY_ID[real.seesAs]?.name}) was sent ${hits.map((h) => JSON.stringify(h)).join(', ')} in ${where.slice(0, 3).join(', ') || '?'}`];
}
