// How it works and FAQ (#/faq). Static copy in native <details> accordions: opening one never re-renders.
import { ui } from './ui_icons.js';

const SITE = 'mafia.hatethespurs.com';

const GROUPS = [
  ['The basics', [
    ['What is Mafia Night?', `
      <p>An app for playing Mafia (also called Werewolf) around a real table. One person is the storyteller. They don’t play: they run the game from their screen. Everyone else gets a secret role.</p>
      <p>At night everyone closes their eyes. The storyteller wakes each role in turn and taps who they pick, and the app works out what happened. In the morning it tells the storyteller who died and what each role learned. During the day the table argues and votes someone out. The town wins when every Mafia member is gone. The Mafia win when they match the rest of the table.</p>`],
    ['What are the ways to deal?', `
      <ul>
        <li><b>On phones.</b> Tap Host a game. Players join with the room code and each phone shows one secret role.</li>
        <li><b>Card key, players look up their card.</b> The app matches each role to a card code. Each player taps the code they got on their own phone and sees only their role.</li>
        <li><b>Card key, the storyteller learns who is who.</b> The card key (which code is which role) is shown to the whole table. On night 1, as you call each role, the players with that code raise a hand and you tap them. The app builds the cast as you go.</li>
        <li><b>Run on this device.</b> No phones at all: the storyteller’s one screen. Choose “No phones? Run the game on this device” on the home page.</li>
      </ul>`],
    ['How do players join?', `
      <p>They go to <b>${SITE}</b> on their phone, type the 6-letter room code and their name. No account and no app to install. The storyteller can tap the room code at the top of their screen to show it full screen for the room.</p>`],
  ]],
  ['Privacy and connection', [
    ['Is my game private?', `
      <p>On this device: nothing is sent to a server. The game is stored only in that browser on that device.</p>
      <p>In a room: each phone only ever receives its own role. Mafia, Masons and Cult members also see their teammates. The storyteller sees everyone. Once someone dies their role is shown to the table, unless a Janitor hid it.</p>`],
    ['Can I play offline?', `
      <p>Yes, on this device. Open the site once and add it to your home screen (see below). After that, “Run the game on this device” works with no internet. Room games need a connection for every phone, because the room lives on the server.</p>`],
    ['Someone’s phone died or they closed the tab. What now?', `
      <p>Open the same link on the same phone and they’re back in their seat with their role. If that doesn’t work (a different phone, or a private tab that was closed), the storyteller can remove their seat in the lobby and they join again. After the deal, play on: the storyteller still sees their role and can run it for them.</p>`],
  ]],
  ['Running the night', [
    ['In what order do roles wake, and why?', `
      <ol>
        <li>Blockers and jailers, so anyone they stop is stopped before acting.</li>
        <li>Protectors (Doctor, Bodyguard and friends).</li>
        <li>Converters, such as the Cult.</li>
        <li>Framers and cleaners.</li>
        <li>The Mafia’s kill.</li>
        <li>Other killers.</li>
        <li>Investigators, such as the Cop.</li>
        <li>Trackers and lookouts last, so they see every visit made that night.</li>
      </ol>
      <p>You don’t need to remember this: the night screen lists the order for you.</p>`],
    ['Some roles don’t know what they really are. How does that work?', `
      <p>Roles like the Insane, Confused, Naive and Paranoid Cop, the Placebo Doctor or the Miller are told something other than the truth. Their phone and the card key show what they think they are. The table may know a fake Cop is in play, but never which player has it. The storyteller is told privately and the app gives that player the right (wrong) results.</p>`],
    ['The Hooker blocked one Mafia member. Does the kill still happen?', `
      <p>Yes, if any Mafia member is free to carry it out. Blocking one member only stops the kill when every Mafia member is blocked. Only one member actually visits the victim, so trackers and lookouts see one visitor, never the blocked one.</p>`],
  ]],
  ['Setting up', [
    ['How many Mafia should I use?', `
      <p>Roughly one Mafia for every 3 to 4 players: 2 in a game of 8, 3 in a game of 11. Suggest roles builds a balanced set for your player count, and the lobby warns you about risky setups before you deal.</p>`],
    ['Which play mode should I pick?', `
      <ul>
        <li><b>Phones</b> if everyone has a phone and a connection. Nobody can peek at anyone else’s role and the app deals for you.</li>
        <li><b>Card key, players look up their card</b> if you still want each role kept secret by the app. The key is hidden; each player taps their code on their own phone.</li>
        <li><b>Card key, blind</b> if players have no phones. The key is on the table, nobody looks at who holds what, and the cast is built on night 1 as people raise a hand when their code is called.</li>
      </ul>
      <p>You can switch between phones and a card key in the lobby before you deal.</p>`],
    ['Can I add my own roles?', `
      <p>Yes. Tap New role in the lobby. Give it a name, a team and, if it acts at night, one of the night actions the app understands. It is saved on your device and sent to the room with the game.</p>`],
    ['How do I change where people sit?', `
      <p>Drag a seat on the table to where that person actually sits. A plain tap still opens the seat panel. In the seat panel, Move left and Move right move someone one place at a time. Seat order is what the table, the lists and the players’ phones show.</p>`],
  ]],
  ['Table tools and storyteller tools', [
    ['What are Table Tools?', `
      <p>The Tools button at the top of the game screen opens a few helpers that live on your device only: nothing is sent to the room. The storyteller gets a discussion timer, a talk-turn timer, a vote counter, a random living player, a coin and dice. Players get the coin and dice.</p>
      <ul>
        <li><b>Timer.</b> Counts down 1, 2, 3 or 5 minutes and keeps running with the panel closed; the time shows beside the Tools button and a tone sounds at zero.</li>
        <li><b>Turns.</b> Gives each living player a slice of 30, 60 or 90 seconds in seat order. Tap Next speaker to pass early; when time runs out it moves on to the next person and waits for you.</li>
        <li><b>Dice.</b> One to six dice, either six-sided or twenty-sided, with the total shown.</li>
        <li><b>Screen stays on.</b> While any timer is running the app asks your device not to dim or lock the screen. Browsers that don’t support this simply ignore it, and it lets go the moment the timer stops.</li>
      </ul>`],
    ['What can the storyteller do that players can’t?', `
      <ul>
        <li>See every role, and get hints on night steps that need care.</li>
        <li>Set house rules in the lobby, choose roles or let the app suggest a set, and rearrange seats.</li>
        <li>Run the night: the app lists who to wake, in order, and works out the result.</li>
        <li>Use the full set of Table Tools, including the timers and the vote counter.</li>
        <li>Handle a lost phone: remove a seat in the lobby, or run a player’s role for them after the deal.</li>
      </ul>`],
    ['What does the app know about me?', `
      <p>You never make an account. A room game needs a name for your seat and a room code, and the room is kept on the server so every phone can reach it. Games on this device, your notes and your custom roles are saved in your own browser. Table Tools never leave your device.</p>`],
  ]],
  ['The app', [
    ['How do I install it?', `
      <ul>
        <li><b>iPhone and iPad:</b> open the site in Safari, tap Share, then Add to Home Screen.</li>
        <li><b>Android:</b> open the site in Chrome, tap the menu, then Install app (or Add to home screen).</li>
        <li><b>Computer:</b> in Chrome or Edge, click the install icon at the right of the address bar.</li>
      </ul>
      <p>It opens full screen like any other app and keeps itself up to date.</p>`],
    ['Who made the icons and fonts?', `
      <p>Role icons from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> by Lorc, Delapouite and contributors (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>). Interface icons from <a href="https://phosphoricons.com" target="_blank" rel="noopener">Phosphor</a> (MIT).</p>
      <p>Fonts: Big Shoulders Display, Alegreya Sans and Alegreya, all under the SIL Open Font License.</p>`],
  ]],
];

export function faqScreen() {
  const groups = GROUPS.map(([title, qs]) => `<section class="faq-group"><h2 class="block-title">${title}</h2>
    ${qs.map(([q, a]) => `<details class="faq-q"><summary>${q}${ui('caret-down')}</summary><div class="faq-a">${a}</div></details>`).join('')}</section>`).join('');
  return `<header class="appbar">
    <a class="appbar-mark" href="#/" aria-label="Home page">${ui('brand')}<span class="appbar-mark-label">Home</span></a>
    <div class="appbar-title">How it works</div>
  </header>
  <main class="wrap faq">
    <h1 class="phase-title">How it works and FAQ</h1>
    <p class="lede">Short answers for storytellers and players.</p>
    <label class="field"><span>Search</span><input type="search" data-faq="search" placeholder="Try “tie”, “night”, “timer”" autocomplete="off"></label>
    <p class="muted" data-faq="none" hidden>Nothing matches. Try a different word.</p>
    ${groups}
    <p class="faq-back"><a class="link" href="#/">Back to the home page</a></p>
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
