// Role icons load from a sprite on first use instead of a 285 KB module in the startup bundle (tech review, Oct 28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ROLE_ICON } from '../public/js/role_icons.js';
import { ico, cardArt } from '../public/js/art.js';
import { ROLES } from '../public/js/roles.js';

const pub = (f) => new URL(`../public/${f}`, import.meta.url);
const sprite = readFileSync(pub('icons/roles.svg'), 'utf8');

test('the startup bundle no longer carries the icon data', () => {
  assert.equal(existsSync(pub('js/icon_data.js')), false);
  const html = readFileSync(pub('index.html'), 'utf8');
  assert.doesNotMatch(html, /icon_data|roles\.svg/, 'no preload of the icon data or the sprite');
  for (const f of ['art.js', 'app.js', 'host.js', 'player.js', 'board.js', 'world.js', 'roles_sheet.js']) assert.doesNotMatch(readFileSync(pub('js/' + f), 'utf8'), /icon_data/, f);
});
test('every mapped role icon is in the sprite, once, on the 512 grid', () => {
  const ids = [...sprite.matchAll(/<g id="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
  for (const [role, name] of Object.entries(ROLE_ICON)) assert.ok(ids.includes(name), `${role} -> ${name}`);
  assert.match(sprite, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
  assert.match(sprite, /game-icons\.net \(CC BY 3\.0\)/, 'licence credit kept');
  assert.doesNotMatch(sprite, /<script|on[a-z]+=/i);
});
test('ico() draws the same box as before, pointing at the sprite; custom roles keep the emoji fallback', () => {
  const r = ROLES.find((x) => ROLE_ICON[x.id]);
  assert.equal(ico(r, 'big'), `<svg class="ico big" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><use href="/icons/roles.svg#${ROLE_ICON[r.id]}"/></svg>`);
  assert.match(ico({ id: 'custom_x', emoji: '🦊' }), /emo-fb[^>]*>🦊</);
  assert.match(ico(null), /emo-fb/);
  assert.match(cardArt(r), /<use href="\/icons\/roles\.svg#/);
});
test('the service worker precaches the sprite, so icons work offline', () => {
  const sw = readFileSync(pub('sw.js'), 'utf8');
  assert.match(sw, /'\/icons\/roles\.svg'/);
  assert.doesNotMatch(sw, /icon_data/);
});
