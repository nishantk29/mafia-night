// @ts-check
// Role type for every built-in role, used to group the role selector, the Add role sheet and "Roles in this game"
// by team, then type (approved 2026-10-29: Plain kept, Mafia Killing and Support kept apart, no Vote type,
// a subhead even when a team has a single type). Teams follow roles_sheet.js teamKey: faction, else alignment.
// A role missing here falls back to its team's last type; test/role-types.test.js fails if a built-in role is missing.
export const TYPE_ORDER = {
  town: ['Investigative', 'Protective', 'Killing', 'Support', 'Plain'],
  mafia: ['Killing', 'Support'],
  third: ['Killing', 'Cult', 'With the Mafia', 'Survivors', 'Tricksters'],
};
const L = (s) => s.trim().split(/\s+/);
export const TYPES = {
  town: {
    Investigative: L(`detective insane_detective comparer investigator tracker lookout coroner medium merlin surveyor oracle
      census_taker scholar inquisitor soothsayer archivist tipster nosy_neighbor sheriff dirty_detective peeping_tom witness
      caroler dreamer journalist psychic invisible_man confused_detective naive_detective paranoid_detective chef`),
    Protective: L(`doctor bodyguard jailer security_guard grandma virgin back_alley_doctor doorman placebo_doctor blacksmith
      keymaker retired_hitman samurai`),
    Killing: L(`veteran vigilante hunter bomb trapper saint deputy gunsmith granny sharpshooter`),
    Support: L(`drunk mason president puppy governor queen representative defense_attorney prosecutor hangman mayor judge
      marshal town_crier chairperson scribe lover penguin agent telepath tinkerer party_host enchantress baker loudmouth
      treestump turncoat bleeder leader lightkeeper secretary gallis`),
    Plain: L(`villager miller sleepwalker`),
  },
  mafia: {
    Killing: L(`mafia godfather don assassin mad_bomber poacher hitman sentinel booby_goon interceptor poisoner sniper
      strongman voodoo_lady witch illusionist`),
    Support: L(`hooker bouncer framer janitor wannabe yakuza slowpoke consigliere spy shadow bookkeeper family_doctor muscle
      kidnapper con_artist kingpin made_man smoke_bomber snitch sleeper_agent talent_scout blackmailer ballot_stuffer bagman
      riot_starter mob_lawyer saboteur actress associate blinder disguiser driver enforcer fiddler gramps lawyer paparazzi
      paralyzer tailor ventriloquist whisperer`),
  },
  third: {
    Killing: L(`killer werewolf arsonist hired_gun`),
    Cult: L(`cult cult_seer cult_guard cthulhu`),
    'With the Mafia': L(`traitor fifth_columnist informant collaborator mastermind`),
    Survivors: L(`survivor opportunist amnesiac hermit prepper mercenary smuggler vulture profiteer agent_provocateur angel monk`),
    Tricksters: L(`jester executioner poltergeist patsy trickster zealot vendetta rival stalker creepy_girl politician prophet warlock`),
  },
};
// Retired ids that old saved setups and pinned rooms can still hold (the Cop to Detective merge).
const LEGACY = { cop: 'detective', detective_v1: 'detective', insane_cop: 'insane_detective', parity_cop: 'comparer',
  confused_cop: 'confused_detective', naive_cop: 'naive_detective', paranoid_cop: 'paranoid_detective', dirty_cop: 'dirty_detective' };
/** @type {Record<string, {team: string, type: string}>} */
export const TYPE_OF = {};
for (const [team, m] of Object.entries(TYPES)) for (const [t, ids] of Object.entries(m)) for (const id of ids) TYPE_OF[id] = { team, type: t };
for (const [old, now] of Object.entries(LEGACY)) TYPE_OF[old] = TYPE_OF[now];
// Order of team sections. data-team / data-type on each section are the hooks for a later team and type filter.
export const TEAM_ORDER = ['town', 'mafia', 'third'];
export const TEAM_TITLE = { town: 'Town', mafia: 'Mafia', third: 'Neutral' };
export const teamOf = (r) => { const t = r?.faction || r?.alignment; return t === 'town' || t === 'mafia' ? t : 'third'; };
export const typeOf = (r) => TYPE_OF[r?.id]?.type || TYPE_ORDER[teamOf(r)].at(-1);
// [{ team, title, types: [{ type, items }] }] for any list of roles, in team then type order; empty buckets dropped.
export function byTeamType(list, team = teamOf) {
  return TEAM_ORDER.map((t) => ({ team: t, title: TEAM_TITLE[t],
    types: TYPE_ORDER[t].map((ty) => ({ type: ty, items: list.filter((r) => team(r) === t && typeOf(r) === ty) })).filter((g) => g.items.length) }))
    .filter((g) => g.types.length);
}
