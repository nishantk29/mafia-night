// Nishant 2026-10-28: "you might be overdoing the artdeco font" / "We should keep it in Mafia only".
// Limelight stays in Mafia, for headings and titles only, and Mafia loads it on its own (not through the shared family.css).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

// The subset Limelight is a Modified Version under the SIL OFL and Limelight is a Reserved Font Name, so it ships as
// "Mafia Deco" (scripts/fonts/subset.py). Same outlines, same metrics.
test('Mafia loads its Limelight-based display face itself: @font-face with swap, preload, and its own display variable', () => {
  const r = css('redesign.css');
  assert.match(r, /@font-face\{font-family:"Mafia Deco";[^}]*font-display:swap[^}]*mafia-deco-400-core\.woff2/);
  assert.match(r, /--mafia-display:"Mafia Deco","Limelight Fallback"/);
  assert.match(r, /--f-display-font:var\(--mafia-display\)/, 'family.css can drop Limelight without changing Mafia');
  assert.match(css('index.html'), /rel="preload" href="\/fonts\/mafia-deco-400-core\.woff2"/);
});
test('metric-matched fallbacks for both fonts (no layout jump when the web fonts arrive)', () => {
  const r = css('redesign.css');
  for (const f of ['Limelight Fallback', 'Rubik Fallback']) assert.match(r, new RegExp(`@font-face\\{font-family:"${f}";[^}]*size-adjust:[^}]*ascent-override:`));
});
test('the last word on fonts: Limelight only on headings and titles; Say lines, buttons, role names and FAQ use Rubik', () => {
  const r = css('redesign.css');
  const tail = r.slice(r.lastIndexOf('Type tone-down'));
  const display = /\n(\.wordmark[^{]+)\{font-family:var\(--mafia-display\)\}/.exec(tail)[1].split(',').map((s) => s.trim());
  for (const s of display) assert.match(s, /wordmark|^h1$|^h2$|title|table-phase|rcard-name|fx-|check-text/, `${s} is a heading or title`);
  for (const s of ['.btn', '.role-name', '.faq-q summary', '.faq-a', '.suggest-name', '.home-rules b']) assert.ok(tail.includes(s), s);
  assert.match(tail, /\.story-say \.story-line q\{font-family:var\(--font-ui\)/);
});
