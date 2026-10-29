// How it works and FAQ (#/faq). Static copy in native <details> accordions: opening one never re-renders.
import { ui } from './ui_icons.js';
import { ROLES, INVESTIGATOR_NAME } from './roles.js';
import { PLAY_MODES, OFFLINE_DEALS } from './modes.js';
import { esc } from './state.js';
import { siteFooter } from './footer.js';

const SITE = 'mafia.hatethespurs.com';

const L = (items) => `<ul>${items.map(([b, d]) => `<li><b>${b}</b>${d ? ` <span>${d}</span>` : ''}</li>`).join('')}</ul>`;
const H = (t) => `<h3 class="faq-sub">${t}</h3>`;

// Generated from the game's data, never hand-copied: every play mode (modes.js) and every role (roles.js).
const waysToDeal = () => L(PLAY_MODES.map((m) => [m.name, m.how]).map(([b, d], i) => [`<span data-mode="${PLAY_MODES[i].id}">${b}.</span>`, d]));
const whichMode = () => L(PLAY_MODES.map((m) => [`${m.name}.`, m.pick])) + `<p>Switch between phones and a card key in the lobby before you deal.</p>`;
const TEAM_ORDER = [['town', 'Town'], ['mafia', 'Mafia'], ['third', 'Third party']];
export const roleSections = () => TEAM_ORDER.map(([al, name]) => {
  const rs = ROLES.filter((r) => r.alignment === al);
  return [`${name} roles (${rs.length})`, `<ul class="faq-roles">${rs.map((r) => `<li data-role="${r.id}"><b>${esc(r.name)}</b><span>${esc(r.blurb)}</span></li>`).join('')}</ul>`];
});

const GROUPS = () => [
  ['The basics', [
    ['What is Mafia Night?', `
      <p>An app for playing Mafia (also called Werewolf) around a real table. One person is the Host. They don’t play: they run the game from their screen. Everyone else gets a secret role.</p>
      ${H('Each round')}
      ${L([['Night.', 'Everyone closes their eyes. The Host wakes each role and taps who they pick.'], ['Morning.', 'The app tells the Host who died and what each role learned.'], ['Day.', 'The table argues and votes someone out.']])}
      ${H('Who wins')}
      ${L([['Town', 'wins when every Mafia member and every other killer is gone.'], ['Mafia', 'win when they match or outnumber everyone else.']])}`],
    ['What are the ways to deal?', waysToDeal()],
    ['How do players join?', `
      ${L([['Go to', `<b>${SITE}</b> on their phone.`], ['Type', 'the 6-letter room code and a name.'], ['Nothing else:', 'no account, no app to install.']])}
      <p>The Host can tap the room code at the top of their screen to show it full screen for the room.</p>`],
  ]],
  ['Privacy and connection', [
    ['Is my game private?', `
      ${H('On this device')}
      ${L([['Nothing is sent to a server.', 'The game is stored only in that browser.']])}
      ${H('In a room')}
      ${L([['Each phone', 'only ever receives its own role.'], ['Mafia, Masons and Cult members', 'also see their teammates.'], ['The Host', 'sees everyone.'], ['Once someone dies,', 'their role is shown to the table if the Host left “Show a player’s role when they die” on. A Janitor can hide it.']])}`],
    ['Someone’s phone died or they closed the tab. What now?', `
      ${L([['Same phone:', 'open the same link and they’re back in their seat with their role.'], ['Different phone, or a closed private tab:', 'the Host removes their seat in the lobby and they join again.'], ['After the deal:', 'play on. The Host still sees their role and can run it for them.']])}`],
    ['How do I end a game?', `
      ${L([['Host:', 'tap the gear, then End game, then confirm. This closes the room for everyone.'], ['Players', 'see “The host ended the game” with a link home.'], ['The code', 'is freed straight away.']])}
      <p>Home screen chips for old rooms have an x to forget them. A chip for a room that has closed disappears by itself.</p>`],
    ['How long does a room last?', `
      <p>A room closes by itself after 12 hours with no activity. Players see that it expired and can head home. Ending the game closes it at once.</p>`],
  ]],
  ['Running the night', [
    ['In what order do roles wake, and why?', `
      <ol>
        <li>Blockers and jailers first.</li>
        <li>Veterans and other roles that go on alert.</li>
        <li>Converters, such as the Cult, and framers.</li>
        <li>The Mafia’s kill, then the Janitor.</li>
        <li>Other killers, such as the Serial Killer and the Vigilante.</li>
        <li>Protectors (Doctor, Bodyguard and friends), after the killers have picked.</li>
        <li>Detectives, and the ${INVESTIGATOR_NAME} if you use one.</li>
        <li>Trackers and lookouts last.</li>
      </ol>
      <p>So a plain game goes Mafia, then Doctor, then Detective. The night screen lists the order for you.</p>
      <p>Roles whose player has died are still called, so nobody can tell who is gone.</p>
      <p>Games started before this order came in keep their old order until a new game or the “Use the new night script” switch.</p>`],
    ['A blocker picked me. Do I still wake up and choose?', `
      ${L([['Yes.', 'A blocked or jailed player wakes and points like any other night. The table can’t tell.'], ['The block cancels what they did.', 'A blocked Doctor saves nobody. A blocked Detective gets a NO RESULT card.'], ['A role with limited uses', 'still spends the use.']])}`],
    ['Two players have the same role. Who wakes?', `
      ${L([['Each one gets a number:', 'Detective 1, Detective 2, Hooker 1, Hooker 2.'], ['Their phone shows it:', '“You are Detective 2.”'], ['The Host taps', 'that player on the shoulder, so only they wake.'], ['Each pick and each result', 'belongs to that player alone.']])}`],
    ['Some roles don’t know what they really are. How does that work?', `
      ${L([['Told something else.', 'The Insane, Naive, Paranoid and Confused Detective, the Placebo Doctor and the Miller are told something other than the truth.'], ['Their phone and the card key', 'show what they think they are.'], ['The table', 'may know a fake Detective is in play, but never which player.'], ['The Host', 'is told privately, and the app gives that player the right (wrong) results.']])}`],
    ['What is the Confused Detective?', `
      <p>A hidden role. The player thinks they are a Detective. Their phone says Detective, and the Host calls them as a Detective (Detective 1, Detective 2).</p>
      ${H('Each check')}
      ${L([['Coin flip', 'made by the app when the Host enters the pick.'], ['Heads', 'gives the TRUE result.'], ['Tails', 'gives the OPPOSITE.'], ['Only the Host', 'sees how it landed, in a private note. The player gets the usual card.']])}
      <p>A regular Detective must be in the game too. Without one, the app blocks the deal and asks you to add a Detective.</p>`],
    ['What does the Detective do? Where did the Cop go?', `
      ${L([['Each night', 'the Detective points at one player and learns MAFIA or NOT MAFIA.'], ['The Godfather', 'shows as NOT MAFIA.'], ['Two Detectives', 'are called one at a time: Detective 1, then Detective 2.'], ['The Cop is now the Detective.', 'The Insane Cop is the Insane Detective, and the Parity Cop is the Comparer.'], ['The old exact-role Detective', `is now the ${INVESTIGATOR_NAME}, an optional role: it learns a player’s exact role, and the Godfather shows as a Villager.`], ['A game already under way', 'keeps its old roles and names. New games use the new ones.']])}`],
    ['The Hooker blocked one Mafia member. Does the kill still happen?', `
      ${L([['Yes,', 'if any Mafia member is free to carry it out.'], ['It only stops', 'when every Mafia member is blocked.'], ['Trackers and lookouts', 'see one visitor, never the blocked one.']])}`],
  ]],
  ['Setting up', [
    ['How many Mafia should I use?', `
      ${L([['About one Mafia', 'for every 3 to 4 players.'], ['Examples:', '2 in a game of 8, 3 in a game of 11.']])}
      <p>Suggest roles builds a balanced set for your player count, and the lobby warns you about risky setups before you deal.</p>`],
    ['Which play mode should I pick?', whichMode()],
    ['Why are some roles grouped together in the role list?', `
      ${L([['Near-twins are one entry,', 'for example Bodyguard with Muscle and Mercenary, or Jester with Patsy, Poltergeist and Zealot.'], ['The entry shows the other names,', 'for example “Also: Muscle, Mercenary”. Tap it to open it.'], ['Each one is its own role', 'with its own team label, night action and info button. Add several at once, each with its own count.'], ['Search', 'for the group name to find every role in it.']])}
      ${H('Good to know')}
      ${L([['Grandma and Granny', 'are one entry. Granny also shoots anyone who visits her.'], ['Villager and the old Civilian', 'are one role. Older saved rooms still load.'], ['Traitor and Fifth Columnist, Telepath and Whisperer,', 'are grouped but stay separate because their team or what the player is told differs.']])}`],
    ['Can I add my own roles?', `
      ${L([['Tap New role', 'in the lobby.'], ['Give it', 'a name, a team and, if it acts at night, one of the night actions the app knows.'], ['It is saved', 'on your device and sent to the room with the game.']])}`],
    ['How do I change where people sit?', `
      ${L([['Drag a seat', 'on the table to where that person sits.'], ['Tap a seat', 'to open the seat panel, then use Move left or Move right.'], ['Seat order', 'is what the table, the lists and the players’ phones show.']])}`],
  ]],
  ['Table tools and Host tools', [
    ['What are Table Tools?', `
      <p>The Tools button at the top of the game screen opens helpers that live on your device only. Nothing is sent to the room. The Host gets a discussion timer, a talk-turn timer, a vote counter, a random living player, a coin and dice. Players get the coin and dice.</p>
      ${L([['Timer.', 'Counts down 1, 2, 3 or 5 minutes and keeps running with the panel closed. A tone sounds at zero.'], ['Turns.', 'Gives each living player 30, 60 or 90 seconds in seat order. Tap Next speaker to pass early.'], ['Dice.', 'One to six dice, six-sided or twenty-sided, with the total shown.'], ['Screen stays on', 'while a timer runs, where the browser allows it.']])}`],
    ['What can the Host do that players can’t?', `
      ${H('Game flow')}
      ${L([['See every role,', 'with hints on night steps that need care.'], ['Run the night:', 'the app lists who to wake, in order, and works out the result.'], ['End the game', 'for everyone from the gear menu.']])}
      ${H('Setup')}
      ${L([['House rules', 'in the lobby.'], ['Choose roles', 'or let the app suggest a set.'], ['Rearrange seats.', '']])}
      ${H('Players and tools')}
      ${L([['Lost phone:', 'remove a seat in the lobby, or run a player’s role after the deal.'], ['Full Table Tools,', 'including the timers and the vote counter.']])}`],
    ['What does the app know about me?', `
      ${L([['No account.', 'A room game needs a name for your seat and a room code.'], ['The room', 'is kept on the server so every phone can reach it.'], ['Saved in your browser:', 'games on this device, your notes and your custom roles.'], ['Table Tools', 'never leave your device.']])}`],
  ]],
  ['Playing offline', [
    ['How do I deal roles offline?', `
      <p>Choose Play offline on the home page. After players and roles, pick how to deal:</p>
      ${L(OFFLINE_DEALS.map((o) => [`<span data-offline="${o.id}">${o.name}.</span>`, o.how]))}`],
    ['Can I play without internet?', `
      <ol>
        <li>Open Mafia Night once while you’re online, or install it: on iPhone tap Share, then Add to Home Screen; on Android tap Install app.</li>
        <li>After that it opens without internet.</li>
        <li>For play without internet, choose This Device (Host-only mode): the Host’s phone deals and runs the night. Phones mode needs internet for now.</li>
      </ol>
      <p>On iPhone, the Home Screen app and Safari keep separate copies, so open the one you’ll use while you’re online.</p>
      <span hidden>offline internet wifi wi-fi install no signal</span>`],
  ]],
  ['The app', [
    ['How do I install it?', `
      ${L([['iPhone and iPad:', 'open the site in Safari, tap Share, then Add to Home Screen.'], ['Android:', 'open the site in Chrome, tap the menu, then Install app.'], ['Computer:', 'in Chrome or Edge, click the install icon in the address bar.']])}
      <p>It opens full screen like any other app and keeps itself up to date.</p>`],
  ]],
];

export function faqScreen() {
  const allGroups = GROUPS(); allGroups.splice(4, 0, ['Every role', roleSections()]);
  const groups = allGroups.map(([title, qs], i) => `<section class="faq-group"><h2 class="block-title">${title}</h2>
    ${qs.map(([q, a]) => `<details class="faq-q"><summary>${q}${ui('caret-down')}</summary><div class="faq-a">${a}</div></details>`).join('')}</section>`).join('');
  return `<header class="appbar">
    <a class="appbar-mark" href="#/" aria-label="Home page">${ui('brand')}<span class="appbar-mark-label">Home</span></a>
    <div class="appbar-title">How it works</div>
  </header>
  <main class="wrap faq">
    <h1 class="phase-title">How it works and FAQ</h1>
    <p class="lede">Short answers for Hosts and players.</p>
    <label class="field"><span>Search</span><input type="search" data-faq="search" placeholder="Try “tie”, “night”, “timer”" autocomplete="off"></label>
    <p class="muted" data-faq="none" hidden>Nothing matches. Try a different word.</p>
    ${groups}
    <p class="faq-back"><a class="link" href="#/">Back to the home page</a></p>
    ${siteFooter()}
  </main>`;
}

// Live filter for the FAQ screen: case-insensitive, opens matches, hides empty groups. Typing never re-renders.
export function wireFaqSearch(root) {
  root.addEventListener('input', (e) => {
    if (e.target.dataset.faq !== 'search') return;
    const q = e.target.value.trim().toLowerCase(); let any = false;
    for (const d of root.querySelectorAll('.faq-q')) { const hit = !q || d.textContent.toLowerCase().includes(q); d.hidden = !hit; if (hit) any = true; if (q && hit) d.open = true; }
    for (const g of root.querySelectorAll('.faq-group')) g.hidden = ![...g.querySelectorAll('.faq-q')].some((d) => !d.hidden);
    const none = root.querySelector('[data-faq="none"]'); if (none) none.hidden = any;
  });
}
