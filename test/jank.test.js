// Jank fixes (design review, Oct 29 2026: "The way some elements appear are very janky"). Entrances are short, use only
// opacity and transform, play once per mount (a repaint does not replay them), and partitions use one divider token.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const CSS = ['styles.css', 'redesign.css', 'setup.css', 'story.css'];

test('a repaint notes the entrances on screen and settles them (no replay on socket updates)', () => {
  const app = read('js/app.js');
  const i = app.indexOf('$app.innerHTML = screen();');
  assert.ok(app.lastIndexOf('enterKeys($app)', i) > 0 && app.indexOf('settle($app, shown)', i) > i);
  assert.match(read('js/settle.js'), /ENTER_SEL = '\.is-entering, \.hw-card, \.check-card'/);
  assert.match(read('styles.css'), /\.is-settled\{animation:none!important\}/);
  assert.match(read('sw.js'), /'\/js\/settle\.js'/);
});

test('entrance timing is --t-enter: 180ms (as written; no scale knob)', () => {
  assert.match(read('styles.css'), /--t-enter:180ms/);
  const all = CSS.map(read).join('\n');
  for (const sel of ['.sheet.is-entering{animation:sheet-up var(--t-enter)', '::view-transition-new(step){animation:vt-in var(--t-enter)', '.step-in{animation:step-in var(--t-enter)', '.hw-card{min-height:11em;animation:hw-in var(--t-enter)', '.check-card{animation:check-fade var(--t-enter)', 'transition:transform var(--t-enter)'])
    assert.ok(all.includes(sel), sel);
});

test('no keyframes animate layout properties (only opacity, transform and paint)', () => {
  const bad = /\b(height|width|top|left|right|bottom|margin[\w-]*|padding[\w-]*|max-height|min-height|inset|font-size|line-height|gap)\s*:/;
  for (const f of CSS) for (const m of read(f).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) assert.ok(!bad.test(m[2]), `${f} @keyframes ${m[1]}`);
});

test('the night step key follows the card on screen, not each pick (one slide per Next)', () => {
  const m = read('js/motion.js');
  assert.match(m, /nightNav\(v, n \|\| \{\}\)\.current\?\.key/);
  assert.doesNotMatch(m, /Object\.keys\(n\.actions/);
});

test('the setup card being left keeps its content while it slides out', () => {
  assert.match(read('js/setup-ui.js'), /i === st\.step \|\| i === st\.from \? cardBody\(k, c\)/);
});

test('partitions: divider tokens, no white-alpha rules, whole-pixel borders', () => {
  const s = read('styles.css');
  assert.equal((s.match(/--divider:var\(--rule\);--divider-strong:var\(--rule-strong\);/g) || []).length, (s.match(/--rule-strong:[^;]+;/g) || []).length);
  for (const f of CSS) {
    const c = read(f);
    // One exception: the frosted .glass chip edge is an alpha on its own frosted surface only (sheets override it below).
    const rules = [...c.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => !/^\s*\.glass,/.test(m[1]));
    for (const m of rules) assert.doesNotMatch(m[2], /border(-top|-bottom|-left|-right)?:\s*[\d.]+px\s+solid\s+rgba\(255,\s*255,\s*255/, `${f} ${m[1].trim()}`);
    assert.doesNotMatch(c, /(border|outline)[\w-]*:\s*(0?\.5|1\.5)px/, f);
  }
});

test('the room view replacing the connecting placeholder does not start a second slide', () => {
  const m = read('js/motion.js');
  assert.match(m, /settling = last !== null && last\.endsWith\(':wait'\)/);
  assert.match(m, /changed = last !== null && key !== last && !settling/);
});

test('callouts use the divider token, not the .36 white family line', () => {
  assert.match(read('redesign.css'), /\.callout\{[^}]*border:1px solid var\(--divider-strong\)/);
});
