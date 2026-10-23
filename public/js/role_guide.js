// Plain-language "how to play" guide for one role, built from the role's own fields so every role
// (including custom ones) gets one. Always call it with the role the player is TOLD they are (seesAs),
// never the real one, so a disguised player reads the guide for the role they believe they have.
import { ROLE_BY_ID, factionOf } from './roles.js';

const TIMES = (n) => (n === 1 ? 'once per game' : n === 2 ? 'twice per game' : `${n} times per game`);

// What the player physically does when called, by action type.
const DO = {
  investigate: (a) => (a.targets === 2 ? 'point at two players' : 'point at one player'),
  track: () => 'point at one player to follow',
  watch: () => 'point at one player to watch',
  autopsy: () => 'point at one dead player',
  protect: (a, rules) => (rules.selfProtect === false ? 'point at one other player to protect' : 'point at one player to protect (you can pick yourself)'),
  guard: () => 'point at one player to guard',
  alert: () => 'nod if you go on alert tonight, or shake your head',
  kill: () => 'point at the player you want to kill, or shake your head to hold fire',
  jail: () => 'point at one player to lock up',
  blockVisitors: () => 'point at the player whose door you guard',
  block: () => 'point at the player you distract',
  frame: () => 'point at the player you frame',
  clean: () => 'nod if you clean up the Mafia’s victim tonight, or shake your head',
  convert: () => 'point at the player you recruit',
  copyRole: () => 'point at a dead player whose role you take',
};
// What comes back to them.
const LEARN = {
  investigate: (a) => (a.check === 'role' ? 'The Host silently shows you their role.'
    : a.check === 'parity' ? 'The Host silently signals whether those two are on the same side.'
      : 'The Host silently signals whether they look like Mafia.'),
  track: () => 'The Host silently shows you who they visited.',
  watch: () => 'The Host silently shows you who visited them.',
  autopsy: () => 'The Host silently shows you their true role.',
};

function goal(r) {
  const f = factionOf(r.id);
  if (r.sideWin === 'condemned') return 'Get yourself voted out by the town. If they condemn you, you win.';
  if (r.sideWin === 'target') return 'Your phone shows a target. Get the town to vote them out and you win.';
  if (r.winsWith === 'survivor') return 'Stay alive until the game ends. You win alongside whoever wins.';
  if (r.winsWith === 'town-loss') return 'Stay alive and see the town lose. You win if anyone but the town wins.';
  if (r.winsWith === 'mafia') return 'You secretly help the Mafia. You win if they win, though they do not know who you are.';
  if (f === 'mafia') return 'Kill and out-vote the town until the Mafia match or outnumber everyone else.';
  if (f === 'killer') return 'Kill everyone who stands in your way. You win if you are the last threat standing.';
  if (f === 'cult') return 'Recruit or outlast everyone. You win when everyone left alive is in the Cult.';
  return 'Find every Mafia member (and any other killer) and vote them out.';
}

export function roleGuide(roleId, rules = {}) {
  const r = ROLE_BY_ID[roleId];
  if (!r) return null;
  const night = []; const day = []; const death = []; const know = [];
  const a = r.action;

  if (r.meeting === 'mafia') night.push(`Every night you wake with the Mafia. Agree silently on one player to kill and point at them together.${rules.firstNightKill === false ? ' On the first night you only meet each other: no kill.' : ''}`);
  if (r.meeting === 'cult') night.push('Every night you wake with the Cult. Agree silently on one player to recruit and point at them together.');
  if (r.meeting === 'mason') night.push('On the first night you open your eyes and meet the other Masons. You can trust each other.');
  if (r.night1 && !r.meeting) night.push('On the first night the Host wakes you on your own to show you something. Keep it to yourself.');
  // A team role's kill (Mafia) or recruit (Cult) is the team's shared pick above, not a second wake-up.
  const teamPick = a && ((r.meeting === 'mafia' && a.type === 'kill') || (r.meeting === 'cult' && a.type === 'convert'));
  if (a && !teamPick) {
    const call = (r.meeting === 'mafia' || r.meeting === 'cult') ? 'Then, when the Host calls your role on its own' : 'When the Host calls your role';
    const act = (DO[a.type] || (() => 'point at your choice'))(a, rules);
    night.push(`${call}, open your eyes and ${act}.${a.uses !== Infinity && a.uses ? ` You can do this ${TIMES(a.uses)}.` : ''}`);
    if (LEARN[a.type]) night.push(LEARN[a.type](a));
    if (a.type === 'kill' && rules.firstNightKill === false) night.push('Nobody can kill on the first night.');
    if ((a.type !== 'protect' || rules.selfProtect === false) && a.type !== 'alert' && a.type !== 'clean' && a.targets) night.push('You can’t pick yourself.');
  }
  if (!night.length) night.push('Keep your eyes shut all night. Nobody will call you.');

  if (r.day) day.push(r.dayUses ? `You have a daytime power you can use ${TIMES(r.dayUses)}. Raise your hand and tell the Host when you use it.` : 'You have a daytime power. Raise your hand and tell the Host when you use it.');
  day.push(r.sideWin === 'condemned' ? 'Act just suspicious enough that the town votes you out. Don’t make it obvious.'
    : r.alignment === 'third' && !r.meeting ? 'Talk and vote however helps you win. Nobody else shares your goal.'
      : factionOf(r.id) !== 'town' ? 'Talk, vote and blend in with the town.' : 'Talk, share what you know when it helps, and vote.');

  if (r.onDeath) death.push('When you die, the Host gives you one last move before you go quiet.');
  if (r.onCondemn) death.push('If the town votes you out, something happens. The Host handles it.');
  if (r.retaliate) death.push('If you are killed at night, whoever attacked you dies too.');
  if (r.nightImmune) death.push('You can’t be killed at night.');
  if (r.shield) death.push('If the town votes you out, nobody can be killed the night after.');

  if (r.appearsAs === 'innocent' && r.alignment !== 'town') know.push('To a Cop’s check you look innocent.');
  if (r.appearsAs === 'mafia' && r.alignment === 'town') know.push('To a Cop’s check you look like Mafia, even though you are town.');
  if (r.meeting === 'mafia') know.push('Your phone lists your Mafia teammates.');
  if (r.showMafia) know.push('Your phone lists who the Mafia are. Don’t make it obvious that you know.');

  return { goal: goal(r), night, day, death, know };
}
