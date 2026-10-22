import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every JS module and font the app ships must be in the service worker's offline cache,
// or the first offline launch after an install can fail to load a module.
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const listed = (dir, ext) => {
  const block = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('];', sw.indexOf('const PRECACHE')));
  const names = new Set();
  for (const arr of block.matchAll(/\.\.\.\[([^\]]*)\]\.map\(\(\w\) => `\/(\w+)\//g)) {
    if (arr[2] !== dir) continue;
    for (const m of arr[1].matchAll(/'([^']+)'/g)) names.add(`${m[1]}${ext}`);
  }
  return names;
};

for (const [dir, ext] of [['js', '.js'], ['fonts', '.woff2']]) {
  test(`service worker precaches every public/${dir} file`, () => {
    const files = readdirSync(new URL(`../public/${dir}/`, import.meta.url)).filter((f) => f.endsWith(ext));
    const have = listed(dir, ext);
    assert.deepEqual(files.filter((f) => !have.has(f)), []);
    assert.deepEqual([...have].filter((f) => !files.includes(f)), []);
  });
}
