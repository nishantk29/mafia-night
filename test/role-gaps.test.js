// The role-gaps helper: reads only role NAMES from other sites' pages or a saved list. Fixtures here are made up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, knownKeys, namesFromMafiaGG, namesFromMafiaRole, parseList, missingNames, missingBySource, fetchSource,
  isLikelyJoke, SITE_WORDS, picklistMarkdown } from '../scripts/role-gaps.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/role-gaps.mjs', import.meta.url));
const items = (md) => md.split('\n').filter((l) => l.startsWith('- '));
// The lines of one "## heading" section, up to the next blank line.
const section = (md, heading) => { const lines = md.split('\n'); const i = lines.indexOf(`## ${heading}`); if (i < 0) return null; const end = lines.indexOf('', i); return lines.slice(i + 1, end < 0 ? undefined : end); };

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

describe('role-gaps picklist', () => {
  test('isLikelyJoke: plain role names pass, accents and allowed punctuation included', () => {
    for (const n of ['Glass Cannon', 'Señorita', 'Fool\'s Errand', 'Jack-of-all-trades', 'Mr. Fixit', 'Salt & Pepper', 'Хранитель', 'Three Word Name'])
      assert.equal(isLikelyJoke(n), false, n);
  });

  test('isLikelyJoke: each clause flags', () => {
    assert.equal(isLikelyJoke('Agent 47'), true, 'digit');
    for (const n of ['Party 🎉', 'Who?', 'Boom!', '"Quoted"', 'Cop (Alt)', 'Either/Or', 'Snake_case'])
      assert.equal(isLikelyJoke(n), true, `character: ${n}`);
    assert.equal(isLikelyJoke('Four Words Right Here'), true, 'more than 3 words');
    assert.equal(isLikelyJoke('Discord Mod'), true, 'site word');
    assert.equal(isLikelyJoke('mafia.gg Legend'), true, 'site word after a period');
    assert.equal(isLikelyJoke('Party HOST'), true, 'site word, any case');
    assert.equal(isLikelyJoke('Hostage Taker'), false, 'site word only counts as a whole word');
    assert.equal(isLikelyJoke('Modest Bottle'), false);
    assert.ok(SITE_WORDS.includes('gg') && SITE_WORDS.includes('discord'));
  });

  test('format: header, one section per source, checkbox items, trailing newline', () => {
    const md = picklistMarkdown([{ source: 'Site A', names: ['Glass Cannon', 'Mime'] }, { source: 'Site B', names: ['Lantern Keeper'] }]);
    const lines = md.split('\n');
    assert.equal(lines[0], '# Role picks');
    assert.match(md, /Names only\..*our own words.*roles_extra\*\.js/);
    assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
    assert.deepEqual(lines.filter((l) => l.startsWith('## ')), ['## Site A', '## Site B']);
    assert.ok(items(md).length === 3 && items(md).every((l) => /^- \[ \] .+/.test(l)));
    assert.deepEqual(section(md, 'Site A'), ['- [ ] Glass Cannon', '- [ ] Mime']);
    assert.ok(!/\d{4}-\d\d-\d\d/.test(md), 'no dates');
    assert.equal(picklistMarkdown([{ source: 'Site A', names: ['Mime', 'Glass Cannon'] }]), picklistMarkdown([{ source: 'Site A', names: ['Glass Cannon', 'Mime'] }]));
  });

  test('known roles are left out, names are sorted and de-duplicated across sources (first source wins)', () => {
    const groups = [
      { source: 'Site A', names: ['zeta Watcher', 'Cop', 'Alpha Seer', 'beta Guard', 'Mafioso', 'alpha seer'] },
      { source: 'Site B', names: ['Beta Guard', 'Doctor', 'Gamma Ray'] },
    ];
    const md = picklistMarkdown(groups);
    assert.deepEqual(section(md, 'Site A'), ['- [ ] Alpha Seer', '- [ ] beta Guard', '- [ ] zeta Watcher']);
    assert.deepEqual(section(md, 'Site B'), ['- [ ] Gamma Ray']);
    assert.ok(!/Cop|Mafioso|Doctor/.test(md));
    assert.deepEqual(missingBySource(groups).map((m) => [m.source, m.total, m.names.length]), [['Site A', 6, 3], ['Site B', 3, 1]]);
  });

  test('likely jokes go last with their source, and empty sections are left out', () => {
    const md = picklistMarkdown([
      { source: 'Site A', names: ['Glass Cannon', 'Discord Mod', 'Agent 47'] },
      { source: 'Site B', names: ['Cop', 'Boom!'] },
      { source: 'Site C', names: ['Cop', 'Mafioso'] },
    ]);
    const heads = md.split('\n').filter((l) => l.startsWith('## '));
    assert.deepEqual(heads, ['## Site A', '## Probably jokes or site-specific']);
    assert.deepEqual(section(md, 'Probably jokes or site-specific'), ['- [ ] Agent 47 (Site A)', '- [ ] Boom! (Site B)', '- [ ] Discord Mod (Site A)']);
    assert.equal(md.trimEnd().split('\n').at(-1), '- [ ] Discord Mod (Site A)', 'the joke section is last');
    assert.ok(!picklistMarkdown([{ source: 'Site A', names: ['Glass Cannon'] }]).includes('Probably jokes'));
    assert.equal(items(picklistMarkdown([{ source: 'Site A', names: ['Cop'] }])).length, 0);
  });

  test('names are escaped so they stay one plain list item', () => {
    const md = picklistMarkdown([{ source: 'Site_[A]', names: ['[Click](http://x)', '*Bold*  _Under_', '<b>Tag</b>', '#Hash Tag', 'Back\\slash `tick`', 'Tab\tName'] }]);
    const all = items(md);
    assert.equal(all.length, 6);
    assert.deepEqual(section(md, 'Site\\_\\[A\\]'), ['- [ ] Tab Name'], 'whitespace collapsed; no longer a likely joke');
    assert.ok(all.includes('- [ ] \\[Click\\](http://x) (Site\\_\\[A\\])'));
    assert.ok(all.includes('- [ ] \\*Bold\\* \\_Under\\_ (Site\\_\\[A\\])'));
    assert.ok(all.includes('- [ ] \\<b\\>Tag\\</b\\> (Site\\_\\[A\\])'));
    assert.ok(all.includes('- [ ] \\#Hash Tag (Site\\_\\[A\\])'));
    assert.ok(all.includes('- [ ] Back\\\\slash \\`tick\\` (Site\\_\\[A\\])'));
    assert.ok(!md.includes('\t'));
  });

  test('end to end: --offline --file --picklist writes the checklist without touching the network', () => {
    const dir = mkdtempSync(join(tmpdir(), 'role-gaps-'));
    try {
      const list = join(dir, 'names.txt'); const out = join(dir, 'picks.md');
      writeFileSync(list, '# source: Site A\nMime\nCop\nGlass Cannon\nDiscord Mod\n# source: Site B\nmime\nMafioso\nLantern Keeper\n');
      // execFileSync throws on a non-zero exit code, so getting here means exit 0.
      const stdout = execFileSync(process.execPath, [SCRIPT, '--offline', '--file', list, '--picklist', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      assert.match(stdout, /Site A: 4 names, 3 we don't have:/);
      assert.equal(readFileSync(out, 'utf8'), [
        '# Role picks', '', 'Names only. Tick the ones worth adding, then write them in our own words in `roles_extra*.js`.',
        '', '## Site A', '- [ ] Glass Cannon', '- [ ] Mime',
        '', '## Site B', '- [ ] Lantern Keeper',
        '', '## Probably jokes or site-specific', '- [ ] Discord Mod (Site A)', '',
      ].join('\n'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
