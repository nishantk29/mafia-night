import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuide, COUNTS, simpleRows, simplePage, guidePage, sheetPages, hostWords } from '../public/js/print.js';
import { FULL_DECK, cardInfo } from '../public/js/engine.js';
import { SIMPLE_CARDS, simpleCounts, simpleRoleIds, simpleDeckMap, deckFit } from '../public/js/simple.js';

test('card guide: every player count gets distinct real cards and a script', () => {
  for (const n of COUNTS) {
    const g = buildGuide(n);
    assert.equal(g.map.length, n);
    assert.equal(new Set(g.map.map((m) => m.card)).size, n);
    assert.ok(g.map.every((m) => FULL_DECK.includes(m.card)));
    assert.ok(g.steps.length > 0, `${n} players: night script`);
  }
});

test('simple key: counts are the app’s suggested counts and add up to the player count', () => {
  const rows = simpleRows();
  assert.deepEqual(rows.map((r) => r.n), COUNTS);
  for (const r of rows) {
    assert.deepEqual(r.counts, simpleCounts(r.n));
    assert.equal(Object.values(r.counts).reduce((s, v) => s + v, 0), r.n);
  }
});

test('simple key: up to 25 players fit one deck; 26 to 30 are flagged for phones', () => {
  for (const r of simpleRows()) {
    assert.equal(r.fits, r.n <= 25, `${r.n} players`);
    assert.equal(r.fits, deckFit(simpleRoleIds(r.counts)).ok, `${r.n} players agrees with deckFit`);
    if (!r.fits) assert.ok(r.counts.mafia > SIMPLE_CARDS.mafia.length, `${r.n} players: more Mafia than cards`);
  }
});

test('simple key: every count that fits deals real cards, and Villagers are number cards', () => {
  for (const r of simpleRows().filter((x) => x.fits)) {
    const map = simpleDeckMap(simpleRoleIds(r.counts));
    const cards = map.map((m) => m.card);
    assert.equal(new Set(cards).size, r.n, `${r.n} players: distinct cards`);
    assert.ok(cards.every((c) => FULL_DECK.includes(c)));
    for (const m of map.filter((x) => x.roleId === 'villager')) {
      const rank = m.card.slice(0, -1);
      assert.ok(Number(rank) >= 2 && Number(rank) <= 10, `${m.card} is a number card`);
    }
  }
});

test('simple key: the words on the card key match the cards the app deals', () => {
  // Black Aces, then black Kings, then black Jacks: the Mafia list the key describes.
  assert.deepEqual(SIMPLE_CARDS.mafia.map((c) => c.slice(0, -1)), ['A', 'A', 'K', 'K', 'J', 'J']);
  assert.ok(SIMPLE_CARDS.mafia.every((c) => !cardInfo(c).red));
  // Red Kings for the Doctor, red Queens for the Cop.
  assert.ok(SIMPLE_CARDS.doctor.every((c) => c.startsWith('K') && cardInfo(c).red));
  assert.ok(SIMPLE_CARDS.cop.every((c) => c.startsWith('Q') && cardInfo(c).red));
  const page = simplePage();
  for (const c of SIMPLE_CARDS.mafia.slice(0, 2)) assert.ok(page.includes(cardInfo(c).label), `key shows ${cardInfo(c).label}`);
  assert.ok(page.includes('Black Aces, then black Kings, then black Jacks.'));
});

test('simple page: one card key, the counts table and the night script in the order the app runs', () => {
  const page = simplePage();
  assert.ok(page.indexOf('Card key') < page.indexOf('Players and suggested counts'));
  assert.ok(page.indexOf('Setting up') < page.indexOf('Each night'));
  assert.match(page, /Mafia, wake up\. Who do you kill\?/);
  assert.match(page, /Doctor, wake up\. Who do you protect\?/);
  assert.match(page, /Cop, wake up\. Who do you check\?/);
  assert.equal((page.match(/<tr class="over">/g) || []).length, 5, '26 to 30 players are flagged');
});

test('Host, never storyteller: no printed view says storyteller', () => {
  assert.equal(hostWords('The Storyteller relays your questions.'), 'The Host relays your questions.');
  assert.equal(hostWords('the storyteller console'), 'the host console');
  const all = [simplePage(), guidePage(8), sheetPages(8), ...COUNTS.map((n) => guidePage(n))].join('\n');
  assert.doesNotMatch(all, /storyteller/i);
  assert.match(all, /The Host doesn’t play/);
});
