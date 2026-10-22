// Scripted seat agents for the simulator (AGENTS=1). They stand in for the planned Haiku-per-seat games: each seat
// decides from what its own phone was sent (its card, team list, Mafia list and results), plus what the whole
// table heard (deaths, public claims). No language model is called. The storyteller still records whatever the
// agents choose, so the game, its checks and the secrecy oracles are exactly the ones sim-games.mjs runs.
import { ROLE_BY_ID } from '../public/js/roles.js';
import { candidates, COIN } from './sim-lib.mjs';

const MAFIA_RE = /\bis (MAFIA|WEREWOLF)\.$/i;
const INNOCENT_RE = /\bis NOT (Mafia|a Werewolf)\.$/i;

// Which player a result line is about: the longest name the text starts with (names can contain spaces).
function subjectOf(text, players) {
  let best = null;
  for (const p of players) if (text.startsWith(p.name + ' ') && (!best || p.name.length > best.name.length)) best = p;
  return best;
}

// What one seat knows. `view` is the last frame its phone got, or null for a seat without a phone, which then knows
// only the card it was dealt (`shownRoleId`, already the disguise if it has one).
export function knowledge(view, seat) {
  const role = view?.me?.role?.id ?? seat.shownRoleId ?? null;
  const r = role ? ROLE_BY_ID[role] : null;
  const k = { id: seat.id, role, side: r?.alignment ?? 'town', team: new Set(), mafia: new Set(), guilty: new Set(), cleared: new Set(), checked: new Set() };
  if (!view?.me) return k;
  for (const t of view.me.team || []) k.team.add(t.id);
  for (const t of view.me.knows || []) k.mafia.add(t.id);
  for (const res of view.me.results || []) {
    const who = subjectOf(res.text, view.players || []);
    if (!who) continue;
    k.checked.add(who.id);
    if (MAFIA_RE.test(res.text)) k.guilty.add(who.id);
    else if (INNOCENT_RE.test(res.text)) k.cleared.add(who.id);
  }
  return k;
}

const isMafiaSide = (k) => k.side === 'mafia';
const KILLS = new Set(['kill']);
const HOSTILE = new Set(['convert', 'frame', 'clean', 'block', 'blockVisitors', 'jail']);
const PROTECTIVE = new Set(['protect', 'guard', 'alert']);
const SEEKING = new Set(['investigate', 'track', 'watch']);

// One night step: the first actor's agent chooses, the way the console lets it. `claims` are public accusations
// and investigator claims made at the table: [{ by, target, guilty }].
export function chooseStep(R, view, step, know, claims) {
  const pool = candidates(view, step);
  const need = step.targets ?? 1;
  if (!need) return { on: R.chance(0.6), targets: [] };
  if (pool.length < need) return null;
  const k = know.get(step.actors[0]) || { team: new Set(), mafia: new Set(), guilty: new Set(), cleared: new Set(), checked: new Set(), side: 'town' };
  const ids = pool.map((p) => p.id);
  const claimers = new Set(claims.map((c) => c.by));
  let prefer = [];
  if (step.dead) prefer = ids;
  else if (isMafiaSide(k) && (KILLS.has(step.type) || HOSTILE.has(step.type))) {
    const notTeam = ids.filter((id) => !k.team.has(id) && !step.actors.includes(id));
    prefer = notTeam.filter((id) => claimers.has(id)); // go after whoever is talking about results
    if (!prefer.length) prefer = notTeam;
  } else if (KILLS.has(step.type)) {
    // Town or third-party killers: town only shoots someone they have reason to suspect; others pick anyone.
    if (k.side === 'town') { prefer = ids.filter((id) => k.guilty.has(id) || k.mafia.has(id)); if (!prefer.length) return { targets: [] }; }
    else prefer = ids.filter((id) => !k.team.has(id));
  } else if (PROTECTIVE.has(step.type)) {
    prefer = ids.filter((id) => claimers.has(id) || k.cleared.has(id));
    if (!prefer.length && ids.includes(k.id)) prefer = [k.id];
  } else if (SEEKING.has(step.type)) {
    prefer = ids.filter((id) => !k.checked.has(id) && !k.team.has(id) && !k.mafia.has(id));
  }
  if (prefer.length < need) prefer = ids;
  const out = { targets: R.shuffle(prefer).slice(0, need) };
  if (step.type === 'investigate' && COIN.includes(step.check)) out.coin = R.pick(['mafia', 'innocent']);
  return out;
}

// Morning talk: an investigator with a guilty result usually says so; a Mafia member whose teammate was named
// sometimes counter-accuses the accuser.
export function morningClaims(R, alive, know) {
  const said = [];
  for (const p of alive) {
    const k = know.get(p.id); if (!k) continue;
    for (const g of k.guilty) if (alive.some((q) => q.id === g) && R.chance(0.8)) said.push({ by: p.id, target: g, guilty: true });
  }
  for (const c of [...said]) {
    for (const p of alive) {
      const k = know.get(p.id);
      if (k && isMafiaSide(k) && k.team.has(c.target) && R.chance(0.6)) said.push({ by: p.id, target: c.by, guilty: true });
    }
  }
  return said;
}

// Everyone votes, one after another in a random order, the way talk goes round a table. The Mafia agree on one
// target for the day (an accuser of theirs if there is one). Townsfolk with evidence vote on it; without any they
// mostly follow the current leader (a bandwagon) or go with a hunch. Returns the id to condemn, or null.
export function dayVote(R, alive, know, claims) {
  const tally = new Map();
  const vote = (id) => tally.set(id, (tally.get(id) || 0) + 1);
  const leader = () => { let best = null; for (const [id, n] of tally) if (!best || n > best[1]) best = [id, n]; return best?.[0] ?? null; };
  const mafiaPick = new Map(); // team key -> agreed target
  for (const p of R.shuffle(alive)) {
    const k = know.get(p.id) || { team: new Set(), mafia: new Set(), guilty: new Set(), cleared: new Set(), side: 'town' };
    const others = alive.filter((q) => q.id !== p.id).map((q) => q.id);
    if (!others.length) continue;
    if (k.role === 'jester') { vote(R.pick(others)); continue; } // wants to be noticed, votes noisily
    if (isMafiaSide(k)) {
      const teamKey = [p.id, ...k.team].sort().join(',');
      const team = new Set([p.id, ...k.team]);
      let t = [...mafiaPick].find(([key]) => key.split(',').some((id) => team.has(id)))?.[1];
      if (!t || !others.includes(t)) {
        const accusers = claims.filter((c) => team.has(c.target)).map((c) => c.by).filter((id) => others.includes(id) && !team.has(id));
        const pool = accusers.length ? accusers : others.filter((id) => !team.has(id));
        t = pool.length ? R.pick(pool) : null;
        mafiaPick.set(teamKey, t);
      }
      if (t) vote(t);
      continue;
    }
    const score = new Map(others.map((id) => [id, 0]));
    for (const id of others) {
      if (k.guilty.has(id) || k.mafia.has(id)) score.set(id, score.get(id) + 3);
      if (k.cleared.has(id)) score.set(id, score.get(id) - 3);
      for (const c of claims) if (c.target === id && c.by !== p.id) score.set(id, score.get(id) + (k.cleared.has(c.by) ? 2 : 1));
    }
    const top = Math.max(...score.values());
    if (top > 0) { vote(R.pick(others.filter((id) => score.get(id) === top))); continue; }
    const lead = leader();
    const fine = others.filter((id) => score.get(id) >= 0);
    if (lead && others.includes(lead) && score.get(lead) >= 0 && R.chance(0.6)) vote(lead); // bandwagon
    else if (fine.length && R.chance(0.6)) vote(R.pick(fine)); // a hunch
  }
  if (!tally.size) return null;
  const best = Math.max(...tally.values());
  const leaders = [...tally].filter(([, n]) => n === best).map(([id]) => id);
  return leaders.length === 1 && best * 3 > alive.length ? leaders[0] : null; // a clear lead with at least a third of the table
}
