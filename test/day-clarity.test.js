// Day timeline clarity (approved 2026-10-29): one solid spine, filled done, brass current, outlined upcoming, a thin
// line before what comes next, and a 12px dock fade. Contrast targets: run/mockups/mafia-day-clarity/CONTRAST.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { timeline, card } from '../public/js/host-timeline.js';

const css = fs.readFileSync(new URL('../public/story.css', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const rule = (sel) => { const m = css.match(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm')); assert.ok(m, `no rule ${sel}`); return m[1]; };
// the Mafia redesign palette (the last :root block in styles.css wins)
const tok = (name) => { const all = [...styles.matchAll(new RegExp(`--${name}:(#[0-9A-Fa-f]{6})`, 'g'))]; return all.at(-1)[1]; };
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('timeline markup: done, then the current card, then upcoming, each with its own state', () => {
  const h = timeline({ done: [{ key: 'morning', text: 'Morning: Ana was killed' }], upcoming: [{ key: 'vote', name: 'Vote' }, { key: 'night', name: 'Night 2' }],
    current: card({ kicker: 'Talk', key: 'talk', say: 'Talk it out', todo: 'Talk.' }) });
  const states = [...h.matchAll(/class="(st-line is-done|st-line is-next|cue is-current st-card)"/g)].map((m) => m[1].split(' ').at(-1) === 'st-card' ? 'now' : m[1].split(' ')[1]);
  assert.deepEqual(states, ['is-done', 'now', 'is-next', 'is-next']);
  assert.match(h, /st-dot is-now/);
  assert.equal((h.match(/class="st-tick"/g) || []).length, 1, 'only done lines get a tick');
});

test('one solid spine: 3px --rule-strong, at least 3:1 on the room', () => {
  const r = rule('.st-rail::before');
  assert.match(r, /width:3px/); assert.match(r, /background:var\(--rule-strong\)/);
  assert.ok(ratio(tok('rule-strong'), tok('room')) >= 3, ratio(tok('rule-strong'), tok('room')).toFixed(2));
  assert.equal(tok('rule-strong').toUpperCase(), '#8A8A9A');
});

test('done is filled, upcoming is an outlined ring, both --smoke and readable', () => {
  assert.match(rule('.st-line.is-done .st-dot'), /background:var\(--smoke\)/);
  assert.doesNotMatch(rule('.st-line.is-done'), /opacity/, 'done lines are not dimmed');
  const next = rule('.st-line.is-next .st-dot');
  assert.match(next, /background:var\(--room\)/); assert.match(next, /border:3px solid var\(--smoke\)/);
  assert.match(rule('.st-line.is-next'), /color:var\(--smoke\)/);
  assert.ok(ratio(tok('smoke'), tok('room')) >= 4.5, 'upcoming labels pass 4.5:1');
});

test('current is brass with a ring', () => {
  const r = rule('.st-card .st-dot.is-now');
  assert.match(r, /background:var\(--brass\)/); assert.match(r, /0 0 0 6px var\(--brass\)/);
  assert.ok(ratio(tok('brass'), tok('room')) >= 3);
});

test('the thin line before what comes next stays, using the divider token', () => {
  assert.match(rule('.st-rail .st-card + .st-line.is-next::before'), /border-top:1px solid var\(--divider\)/);
});

test('the Next dock fades over 12px on timeline screens, not 38%', () => {
  assert.match(rule('html:has(.st-rail) .action-dock'), /linear-gradient\(to bottom,transparent,var\(--room\) var\(--s3\)\)/);
  assert.match(styles, /--s3:12px/);
});

test('no motion added: the timeline rules have no transition or animation', () => {
  for (const sel of ['.st-rail::before', '.st-dot', '.st-line.is-done .st-dot', '.st-line.is-next .st-dot', '.st-card .st-dot.is-now']) assert.doesNotMatch(rule(sel), /transition|animation/);
});
