// Printable card guide (/print.html), three views:
// 1. Simple mode: one page with the playing-card key and suggested counts for 5 to 30 players.
// 2. Complex mode: for one player count, which card means which role, setup steps and an eyes-closed night script.
// 3. Complex mode: a sheet of role cards to cut out.
import { suggestRoles, buildDeckMap, FULL_DECK, cardInfo, nightScript, MIN_PLAYERS, START_CUE, END_CUE } from './engine.js';
import { ROLE_BY_ID } from './roles.js';
import { cardArt } from './art.js';
import { SIMPLE_ROLES, SIMPLE_CARDS, simpleCounts, simpleRoleIds, deckFit } from './simple.js';

export const COUNTS = Array.from({ length: 26 }, (_, i) => i + MIN_PLAYERS); // 5 to 30 players
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEAM = { town: 'Town', mafia: 'Mafia', third: 'On their own' };
const VIEWS = [['simple', 'Simple card key, one page'], ['guide', 'Complex card key and script'], ['sheet', 'Complex role cards, 9 per page']];

// Safety net: if any role text ever says "story teller", the printed guide says Host (COPY-STYLE.md).
export const hostWords = (s) => String(s ?? '').replace(/story\s?teller/gi, (w) => (w[0] === 'S' ? 'Host' : 'host'));
const say = (s) => esc(hostWords(s));

// Everything one Complex player count needs. The fixed key is used so a printed page stays true game after game.
export function buildGuide(n) {
  const roleIds = suggestRoles(n);
  const map = buildDeckMap(roleIds, 'fixed');
  const rows = map.map(({ card, roleId }) => ({ card, info: cardInfo(card), role: ROLE_BY_ID[roleId] }))
    .sort((a, b) => (a.role.alignment === 'town') - (b.role.alignment === 'town') || a.role.alignment.localeCompare(b.role.alignment)
      || a.role.name.localeCompare(b.role.name) || FULL_DECK.indexOf(a.card) - FULL_DECK.indexOf(b.card));
  const room = { night: 1, config: { mode: 'cards' }, usage: {}, players: map.map((m, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, alive: true, roleId: m.roleId })) };
  return { n, roleIds, map, rows, steps: nightScript(room) };
}

// Script lines in wake order. Info steps that are not read aloud are notes for the Host.
function scriptLines(g) {
  return g.steps.filter((s) => s.prompt).map((s) => {
    const text = String(s.prompt).replace(/\s+/g, ' ').trim();
    const note = s.kind === 'info' && !s.spoken;
    const cards = g.map.filter((m) => m.roleId === s.roleId).map((m) => cardInfo(m.card).label).join(' ');
    return { text: note ? text : `${text} Then: “Close your eyes.”`, note, cards };
  });
}

const narration = (g) => `<ol class="script">
  <li class="say">Night falls. Everyone, close your eyes and keep them closed.</li>
  ${scriptLines(g).map((l) => `<li class="${l.note ? 'note' : 'say'}">${l.note ? '<span class="tag">Quietly</span> ' : ''}${say(l.text)}${l.cards ? ` <span class="cards">${esc(l.cards)}</span>` : ''}</li>`).join('')}
  <li class="say">Everyone, open your eyes. It is morning. Tell the table who did not wake up.</li>
</ol>`;

const setup = (g) => `<ol class="setup">
  <li>Take out the ${g.map.length} cards in the key and put the rest of the deck away. Shuffle them well.</li>
  <li>Deal one card face down to each of the ${g.n} players. The Host doesn’t play: they keep the key and read the script. (If the Host wants to play, ask a friend to read it.)</li>
  <li>Each player peeks at their own card, remembers it, and puts it back face down. Nobody shows a card.</li>
  <li>Run the night script below, then let the table talk and vote someone out each day.</li>
</ol>`;

const keyTable = (g) => `<table class="key"><thead><tr><th>Card</th><th>Role</th><th>Team</th><th>What they do</th></tr></thead><tbody>
  ${g.rows.map((r) => `<tr class="t-${r.role.alignment}"><td class="c ${r.info.red ? 'red' : ''}">${esc(r.info.label)}</td><td><b>${esc(r.role.name)}</b></td><td>${TEAM[r.role.alignment]}</td><td>${say(r.role.blurb)}</td></tr>`).join('')}
</tbody></table>`;

export function guidePage(n) {
  const g = buildGuide(n);
  const mafia = g.roleIds.filter((id) => ROLE_BY_ID[id].alignment === 'mafia').length;
  return `<section class="page guide">
    <p class="eyebrow">Complex mode</p>
    <h2>${n} players <small>${mafia} Mafia · ${n - mafia} others</small></h2>
    <h3>Card key</h3>${keyTable(g)}
    <h3>Setting up</h3>${setup(g)}
    <h3>Eyes-closed script, night 1</h3>${narration(g)}
    <p class="fine">Later nights use the same order and skip anyone who has died. The Mafia win when they match everyone else; the town wins when every Mafia member is out.</p>
  </section>`;
}

const cardFace = (row) => `<div class="pcard a-${row.role.alignment}">
  <span class="corner tl ${row.info.red ? 'red' : ''}">${esc(row.info.label)}</span><span class="corner br ${row.info.red ? 'red' : ''}">${esc(row.info.label)}</span>
  ${cardArt(row.role)}<div class="pcard-name">${esc(row.role.name)}</div><div class="pcard-team">${TEAM[row.role.alignment]}</div><p>${say(row.role.blurb)}</p></div>`;

export function sheetPages(n) {
  const { rows } = buildGuide(n);
  const pages = [];
  for (let i = 0; i < rows.length; i += 9) pages.push(rows.slice(i, i + 9));
  return pages.map((p) => `<section class="page sheet">${p.map(cardFace).join('')}</section>`).join('');
}

// ---------- Simple mode: four roles from one deck, suggested counts for every player count ----------

// Suggested counts for each player count. `fits` is false when the key runs out of cards for that many Mafia.
export function simpleRows() {
  return COUNTS.map((n) => {
    const counts = simpleCounts(n);
    return { n, counts, fits: deckFit(simpleRoleIds(counts)).ok };
  });
}

const SIMPLE_MEANS = {
  mafia: 'Black Aces, then black Kings, then black Jacks.',
  doctor: 'Red Kings.',
  cop: 'Red Queens.',
  villager: 'Number cards, 2 to 10. Villagers are never called, so any suit works.',
};
const cardLabel = (id) => { const c = cardInfo(id); return `<span class="${c.red ? 'red' : ''}">${esc(c.label)}</span>`; };

const simpleKey = () => `<table class="key"><thead><tr><th>Role</th><th>Cards, in this order</th><th>Means</th></tr></thead><tbody>
  ${SIMPLE_ROLES.map((r) => `<tr class="${r.id === 'mafia' ? 't-mafia' : ''}"><td><b>${esc(r.name)}</b></td><td class="cards">${r.id === 'villager' ? '2–10, any suit' : SIMPLE_CARDS[r.id].map(cardLabel).join(' ')}</td><td>${SIMPLE_MEANS[r.id]}</td></tr>`).join('')}
</tbody></table>`;

// Three tables side by side on paper and wide screens, stacked on a phone.
const suggestTable = (rows) => `<table class="suggest"><thead><tr><th>Players</th><th>Mafia</th><th>Doctor</th><th>Cop</th><th>Villagers</th></tr></thead><tbody>
  ${rows.map((r) => `<tr class="${r.fits ? '' : 'over'}"><th scope="row">${r.n}${r.fits ? '' : ' *'}</th><td>${r.counts.mafia}</td><td>${r.counts.doctor}</td><td>${r.counts.cop}</td><td>${r.counts.villager}</td></tr>`).join('')}
</tbody></table>`;
const suggestTables = (rows) => {
  const per = Math.ceil(rows.length / 3);
  return `<div class="suggest-wrap">${[0, 1, 2].map((i) => suggestTable(rows.slice(i * per, (i + 1) * per))).join('')}</div>`;
};

const simpleSetup = () => `<ol class="setup">
  <li>Find your player count in the table. Take those cards in the key’s order and put the rest of the deck away.</li>
  <li>Shuffle them and deal one card face down to each player.</li>
  <li>Each player looks at their card in private, then puts it back face down. Nobody shows a card. The Host doesn’t look.</li>
  <li>Put the key on the table for everyone to see. The Host doesn’t play: they read the script below.</li>
</ol>`;

const simpleNight = () => `<ol class="script">
  <li class="say">${START_CUE}</li>
  <li class="note"><span class="tag">Night 1</span> Call Mafia, Doctor and Cop with eyes open: “Doctor, open your eyes. Whoever holds a Doctor card, raise a hand.” Note the hands, then close their eyes.</li>
  <li class="say">Mafia, wake up. Who do you kill? Then: “Mafia, close your eyes.”</li>
  <li class="say">Doctor, wake up. Who do you protect? Then: “Doctor, close your eyes.”</li>
  <li class="say">Cop, wake up. Who do you check? Nod if they are Mafia, shake your head if not. Then: “Cop, close your eyes.”</li>
  <li class="say">${END_CUE} It is morning. Tell the table who did not wake up.</li>
</ol>`;

export function simplePage() {
  const rows = simpleRows();
  return `<section class="page guide simple">
    <h2>Simple mode card key <small>Mafia, Doctor, Cop, Villager</small></h2>
    <p>Four roles from one 52-card deck. Keep this key on the table, where everyone can see it.</p>
    <h3>Card key</h3>${simpleKey()}
    <h3>Players and suggested counts</h3>${suggestTables(rows)}
    <p class="fine">* More Mafia than the key holds (${SIMPLE_CARDS.mafia.length} cards). Use phones mode for these counts.</p>
    <div class="simple-steps">
      <div><h3>Setting up</h3>${simpleSetup()}</div>
      <div><h3>Each night</h3>${simpleNight()}</div>
    </div>
    <p class="fine">Later nights use the same order and skip anyone who has died. The Mafia win when they match the rest; the town wins when every Mafia member is out.</p>
  </section>`;
}

export function render(root, params) {
  const view = VIEWS.some(([v]) => v === params.view) ? params.view : 'simple';
  const all = params.n === 'all';
  const n = COUNTS.includes(Number(params.n)) ? Number(params.n) : 8;
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
  const body = view === 'simple' ? simplePage() : view === 'sheet' ? sheetPages(n) : (all ? COUNTS : [n]).map(guidePage).join('');
  root.innerHTML = `<header class="bar noprint">
      <a class="back" href="/#/faq">← How it works</a>
      <h1>Printable card guide</h1>
      <p>Play Mafia with a normal deck of cards. Start with the Simple card key, one page for four roles. For Complex mode, print the key and script for one player count, or the role cards to cut out.</p>
      <div class="controls">
        <label>Print <select id="view">${VIEWS.map(([v, l]) => opt(v, l, view)).join('')}</select></label>
        <label ${view === 'simple' ? 'hidden' : ''}>Players <select id="n">${COUNTS.map((c) => opt(c, c, all ? '' : n)).join('')}${view === 'guide' ? opt('all', 'All counts', all ? 'all' : '') : ''}</select></label>
        <button type="button" id="go">Print</button>
      </div>
      <p class="fine">Card sheets are 63 × 88 mm, the size of a playing card. Print at 100% scale, cut along the edges, and tape each one to the back of its card or slip it into a sleeve in front.</p>
    </header>
    ${body}`;
  const nav = () => {
    const vw = root.querySelector('#view').value;
    const nv = root.querySelector('#n').value;
    location.search = new URLSearchParams(vw === 'simple' ? { view: vw } : { n: vw === 'sheet' && nv === 'all' ? '8' : nv, view: vw }).toString();
  };
  root.querySelector('#n').addEventListener('change', nav);
  root.querySelector('#view').addEventListener('change', nav);
  root.querySelector('#go').addEventListener('click', () => window.print());
}

if (typeof document !== 'undefined') render(document.getElementById('app'), Object.fromEntries(new URLSearchParams(location.search)));
