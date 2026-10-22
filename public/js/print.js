// Printable card guide (/print.html): for a standard 52-card deck plus jokers, which card means which role for a
// given player count, setup steps, an eyes-closed narration script, and a sheet of role cards to cut out.
import { suggestRoles, buildDeckMap, FULL_DECK, cardInfo, nightScript, MIN_PLAYERS } from './engine.js';
import { ROLE_BY_ID } from './roles.js';
import { cardArt } from './art.js';

export const COUNTS = Array.from({ length: 26 }, (_, i) => i + MIN_PLAYERS); // 5 to 30 players
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEAM = { town: 'Town', mafia: 'Mafia', third: 'On their own' };

// Everything one player count needs. The fixed key is used so a printed page stays true game after game.
export function buildGuide(n) {
  const roleIds = suggestRoles(n);
  const map = buildDeckMap(roleIds, 'fixed');
  const rows = map.map(({ card, roleId }) => ({ card, info: cardInfo(card), role: ROLE_BY_ID[roleId] }))
    .sort((a, b) => (a.role.alignment === 'town') - (b.role.alignment === 'town') || a.role.alignment.localeCompare(b.role.alignment)
      || a.role.name.localeCompare(b.role.name) || FULL_DECK.indexOf(a.card) - FULL_DECK.indexOf(b.card));
  const room = { night: 1, config: { mode: 'cards' }, usage: {}, players: map.map((m, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, alive: true, roleId: m.roleId })) };
  return { n, roleIds, map, rows, steps: nightScript(room) };
}

// Script lines in wake order. Info steps that are not read aloud are notes for the storyteller.
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
  ${scriptLines(g).map((l) => `<li class="${l.note ? 'note' : 'say'}">${l.note ? '<span class="tag">Quietly</span> ' : ''}${esc(l.text)}${l.cards ? ` <span class="cards">${esc(l.cards)}</span>` : ''}</li>`).join('')}
  <li class="say">Everyone, open your eyes. It is morning. Tell the table who did not wake up.</li>
</ol>`;

const setup = (g) => `<ol class="setup">
  <li>Take out the ${g.map.length} cards in the key and put the rest of the deck away. Shuffle them well.</li>
  <li>Deal one card face down to each of the ${g.n} players. The storyteller does not play: they keep the key and read the script. (If the storyteller wants to play, ask a friend to read it.)</li>
  <li>Each player peeks at their own card, remembers it, and puts it back face down. Nobody shows a card.</li>
  <li>Run the night script below, then let the table talk and vote someone out each day.</li>
</ol>`;

const keyTable = (g) => `<table class="key"><thead><tr><th>Card</th><th>Role</th><th>Team</th><th>What they do</th></tr></thead><tbody>
  ${g.rows.map((r) => `<tr class="t-${r.role.alignment}"><td class="c ${r.info.red ? 'red' : ''}">${esc(r.info.label)}</td><td><b>${esc(r.role.name)}</b></td><td>${TEAM[r.role.alignment]}</td><td>${esc(r.role.blurb)}</td></tr>`).join('')}
</tbody></table>`;

function guidePage(n) {
  const g = buildGuide(n);
  const mafia = g.roleIds.filter((id) => ROLE_BY_ID[id].alignment === 'mafia').length;
  return `<section class="page guide">
    <h2>${n} players <small>${mafia} Mafia · ${n - mafia} others</small></h2>
    <h3>Card key</h3>${keyTable(g)}
    <h3>Setting up</h3>${setup(g)}
    <h3>Eyes-closed script, night 1</h3>${narration(g)}
    <p class="fine">Later nights use the same order and skip anyone who has died. The Mafia win when they match everyone else; the town wins when every Mafia member is out.</p>
  </section>`;
}

const cardFace = (row) => `<div class="pcard a-${row.role.alignment}">
  <span class="corner tl ${row.info.red ? 'red' : ''}">${esc(row.info.label)}</span><span class="corner br ${row.info.red ? 'red' : ''}">${esc(row.info.label)}</span>
  ${cardArt(row.role)}<div class="pcard-name">${esc(row.role.name)}</div><div class="pcard-team">${TEAM[row.role.alignment]}</div><p>${esc(row.role.blurb)}</p></div>`;

function sheetPages(n) {
  const { rows } = buildGuide(n);
  const pages = [];
  for (let i = 0; i < rows.length; i += 9) pages.push(rows.slice(i, i + 9));
  return pages.map((p) => `<section class="page sheet">${p.map(cardFace).join('')}</section>`).join('');
}

export function render(root, params) {
  const all = params.n === 'all';
  const n = COUNTS.includes(Number(params.n)) ? Number(params.n) : 8;
  const view = params.view === 'sheet' ? 'sheet' : 'guide';
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
  root.innerHTML = `<header class="bar noprint">
      <a class="back" href="/#/faq">← How it works</a>
      <h1>Printable card guide</h1>
      <p>Play Mafia with a normal deck of cards. Pick a player count, then print the key and script for the storyteller, or the role cards to cut out.</p>
      <div class="controls">
        <label>Players <select id="n">${COUNTS.map((c) => opt(c, c, all ? '' : n)).join('')}${view === 'guide' ? opt('all', 'All counts', all ? 'all' : '') : ''}</select></label>
        <label>Print <select id="view">${opt('guide', 'Card key and script', view)}${opt('sheet', 'Role card sheet, 9 per page', view)}</select></label>
        <button type="button" id="go">Print</button>
      </div>
      <p class="fine">Card sheets are 63 × 88 mm, the size of a playing card. Print at 100% scale, cut along the edges, and tape each one to the back of its card or slip it into a sleeve in front.</p>
    </header>
    ${view === 'sheet' ? sheetPages(n) : (all ? COUNTS : [n]).map(guidePage).join('')}`;
  const nav = () => {
    const vw = root.querySelector('#view').value;
    const nv = root.querySelector('#n').value;
    location.search = new URLSearchParams({ n: vw === 'sheet' && nv === 'all' ? '8' : nv, view: vw }).toString();
  };
  root.querySelector('#n').addEventListener('change', nav);
  root.querySelector('#view').addEventListener('change', nav);
  root.querySelector('#go').addEventListener('click', () => window.print());
}

if (typeof document !== 'undefined') render(document.getElementById('app'), Object.fromEntries(new URLSearchParams(location.search)));
