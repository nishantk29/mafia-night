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
        <li><b>A real deck, players look up their card.</b> The app matches each role to a playing card. Deal the cards face down. Each player taps the card they got on their own phone and sees only their role.</li>
        <li><b>A real deck, the storyteller learns who is who.</b> The card key (which card is which role) is shown to the whole table, and you deal face down without looking. On night 1, as you call each role, the players with that card raise a hand and you tap them. The app builds the cast as you go.</li>
        <li><b>No phones, no app?</b> Print the <a href="/print.html" target="_blank" rel="noopener">card guide</a> and play with a deck on the table.</li>
        <li><b>Run on this device.</b> No phones at all: a deck of playing cards and the storyteller’s one screen. Choose “No phones? Run the game on this device” on the home page.</li>
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
    ['Can I add my own roles?', `
      <p>Yes. Tap New role in the lobby. Give it a name, a team and, if it acts at night, one of the night actions the app understands. It is saved on your device and sent to the room with the game.</p>`],
    ['How do I change where people sit?', `
      <p>Drag a seat on the table to where that person actually sits. A plain tap still opens the seat panel. In the seat panel, Move left and Move right move someone one place at a time. Seat order is what the table, the lists and the players’ phones show.</p>`],
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
    ${groups}
    <p class="faq-back"><a class="link" href="#/">Back to the home page</a></p>
  </main>`;
}
