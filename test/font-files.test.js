// Every font file shipped in public/fonts is used, and every font the CSS or HTML asks for exists (tech review, Oct 28).
// Unused files still cost every phone a download: the service worker precaches all of public/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const pub = new URL('../public/', import.meta.url);
const text = ['index.html', 'print.html', '404.html', ...readdirSync(pub).filter((f) => f.endsWith('.css'))]
  .map((f) => { try { return readFileSync(new URL(f, pub), 'utf8'); } catch { return ''; } }).join('\n');
const files = readdirSync(new URL('fonts/', pub)).filter((f) => f.endsWith('.woff2'));
const asked = [...new Set([...text.matchAll(/\/fonts\/([\w.-]+\.woff2)/g)].map((m) => m[1]))];

test('no unreferenced font files', () => {
  for (const f of files) assert.ok(asked.includes(f), `${f} is shipped and precached but nothing uses it`);
});
test('no missing font files', () => {
  for (const f of asked) assert.ok(files.includes(f), `${f} is referenced but not in public/fonts`);
});
