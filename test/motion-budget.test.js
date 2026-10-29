// Motion budget (Nishant, 2026-10-29): presses are snappy (100-150ms, never scaled) and nothing runs over 400ms.
// Replaces the old "--dur-scale is 2" expectation: --dur-scale is 1, so what is written is what is seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mb from './kit/motion-budget.mjs';
import { errorPage } from '../src/error-page.js';

const pub = fileURLToPath(new URL('../public', import.meta.url));
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('no animation or transition resolves above 400ms (duration, and delay + duration)', () => {
  assert.deepEqual(mb.overBudget(pub), []);
  const { rows, props } = mb.timings(mb.cssSources(pub));
  assert.ok(rows.length > 80, 'the scan found the stylesheets');
  assert.deepEqual([...props.get('--dur-scale')], ['1']);
  for (const t of ['--f-dur-med', '--f-dur-slow', '--t-open', '--t-reveal', '--t-enter']) assert.ok(mb.evalTime(`var(${t})`, props) <= mb.CAP, t);
});

test('per-element delays finish by 400ms: particles, stars, the cast list', () => {
  const fx = read('js/fx.js'); const css = read('styles.css');
  const p = /animation:fx-p calc\((\d+)ms \* var\(--dur-scale\)\)/.exec(css); const pd = /--d:\$\{dur\(\(i \* (\d+)\) % (\d+)\)\}ms`;/.exec(fx);
  assert.ok(+p[1] + +pd[2] - 1 <= mb.CAP, 'burst particles');
  const st = /animation:fx-star calc\((\d+)ms \* var\(--dur-scale\)\)/.exec(css); const sd = /--d:\$\{dur\(\(i \* (\d+)\) % (\d+)\)\}ms"><\/i>/.exec(fx);
  assert.ok(+st[1] + +sd[2] - 1 <= mb.CAP, 'night stars');
  const step = /--cast-step:calc\((\d+)ms \* var\(--dur-scale\)\)/.exec(css); const enter = /--t-enter:calc\((\d+)ms \* var\(--dur-scale\)\)/.exec(css);
  assert.ok(+enter[1] + 14 * +step[1] <= mb.CAP, 'the cast stagger caps --i at 14 (world.js)');
  assert.match(fs.readFileSync(new URL('../public/js/world.js', import.meta.url), 'utf8'), /--i:\$\{Math\.min\(i, 14\)\}/);
  for (const m of fx.matchAll(/`, (\d+)\);|'confetti'\), (\d+)\);/g)) assert.ok(+(m[1] || m[2]) <= mb.CAP, m[0]);
});

test('the error page fits the budget too', () => {
  const css = [...errorPage({ status: 404 }).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const rows = mb.timings([...mb.cssSources(pub), { file: 'error-page', css }]).rows.filter((r) => r.where.startsWith('error-page'));
  assert.ok(rows.length >= 4);
  assert.deepEqual(rows.filter((r) => r.ms > mb.CAP || r.end > mb.CAP).map((r) => r.where), []);
});

test('press feedback is 100-150ms, not scaled, scale .97; choice rows highlight instead of scaling', () => {
  assert.deepEqual(mb.pressProblems(mb.cssSources(pub), { rowSelectors: ['.choice'] }), []);
  assert.match(read('styles.css'), /\.choice:active\{background-image:linear-gradient\(var\(--f-press-row\),var\(--f-press-row\)\)\}/);
  assert.match(read('styles.css'), /--t-press:var\(--f-release\)/);
  assert.match(read('styles.css'), /\.block:active,\.whisper:active,\.guide:active,\.path:active\{scale:var\(--f-press-scale\)\}/);
  assert.match(read('family.css'), /--f-press:120ms;/);
});

test('JS motion stays within 400ms', () => {
  assert.deepEqual(mb.jsOverBudget(pub, 1), []);
  assert.match(read('js/host.js'), /FLIP_MS = dur\(400\)/);
});

test('the scans catch violations (verified red)', () => {
  const src = (css) => [{ file: 'x.css', css }];
  assert.equal(mb.timings(src(':root{--s:2;--t:calc(280ms * var(--s))}.a{animation:x var(--t) ease 0s}')).rows[0].ms, 560);
  assert.equal(mb.timings(src('.a{animation:x 300ms ease 200ms}')).rows[0].end, 500);
  assert.ok(mb.pressProblems(src(':root{--s:2;--f-press:calc(120ms * var(--s));--f-press-scale:.97}.b:active{transition-duration:var(--f-press)}')).some((x) => /scaled/.test(x)));
  assert.ok(mb.pressProblems(src(':root{--f-press:120ms;--f-press-scale:.97}.b:active{transition-duration:var(--f-press);transform:translateY(3px) scale(.96)}')).length);
  assert.ok(mb.pressProblems(src(':root{--f-press:120ms;--f-press-scale:.97}.b:active{transition-duration:var(--f-press)}.choice:active{transform:scale(.97)}'), { rowSelectors: ['.choice'] }).length);
});
