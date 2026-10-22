// The role-gaps helper: reads only role NAMES from other sites' pages or a saved list. Fixtures here are made up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { norm, knownKeys, namesFromMafiaGG, namesFromMafiaRole, parseList, missingNames, fetchSource } from '../scripts/role-gaps.mjs';

describe('role-gaps', () => {
  test('reads names, never descriptions, from an app bundle', () => {
    const bundle = 'x=[{name:"Glass Cannon",description:"SECRET TEXT one",alignment:"town"},{name:"(Random Cop)",description:"slot"},'
      + '{name:"Quote \\"Man\\"",description:"SECRET TEXT two"}]';
    const names = namesFromMafiaGG(bundle);
    assert.deepEqual(names, ['Glass Cannon', 'Quote "Man"']);
    assert.ok(!JSON.stringify(names).includes('SECRET'));
  });

  test('reads role headings (followed by an emoji) from a page, and nothing else', () => {
    const html = '<h2>How to play</h2><p>SECRET</p><h3>Glass Cannon</h3><span class="x" aria-hidden="true">💥</span><p>SECRET TEXT</p>'
      + '<h4>Tom &amp; Jerry</h4><span aria-hidden="true">🐭</span>';
    assert.deepEqual(namesFromMafiaRole(html), ['Glass Cannon', 'Tom & Jerry']);
  });

  test('parses a pasted list with comments and source groups', () => {
    const groups = parseList('# my notes\nGlass Cannon\n\n# source: Some wiki\n  Mime  \n(Random Villager)\n', 'pasted.txt');
    assert.deepEqual(groups, [{ source: 'pasted.txt', names: ['Glass Cannon'] }, { source: 'Some wiki', names: ['Mime'] }]);
  });

  test('matches our roles by name, id, alias, case, accents and "the"', () => {
    const keys = knownKeys();
    assert.equal(norm('The Côp'), 'cop');
    assert.deepEqual(missingNames(['Cop', 'the doctor', 'INSANE COP', 'insane_cop', 'Mafioso', 'Glass Cannon', 'glass-cannon'], keys), ['Glass Cannon']);
  });

  test('a failed fetch is reported and skipped, not fatal', async () => {
    const errors = []; const orig = console.error; console.error = (m) => errors.push(m);
    try {
      const g = await fetchSource({ source: 'nowhere', url: 'http://127.0.0.1:9/', extract: () => [] });
      assert.equal(g, null);
    } finally { console.error = orig; }
    assert.match(errors.join(' '), /nowhere: could not read role names.*--file/);
  });
});
