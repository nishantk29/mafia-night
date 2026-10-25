// The FAQ is generated from the game's own data. This fails if a role or play mode is missing from it, or if it names one the game does not have.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../public/js/roles.js';
import { PLAY_MODES, ROOM_MODES, CARD_FLOWS } from '../public/js/modes.js';
import { newRoom, reduce } from '../public/js/room.js';
import { faqScreen, roleSections } from '../public/js/faq.js';
import { GAME_LINKS } from '../public/js/footer.js';

const html = faqScreen();
const attr = (name) => [...html.matchAll(new RegExp(`data-${name}="([^"]+)"`, 'g'))].map((m) => m[1]);

describe('FAQ matches the game', () => {
  test('every role appears exactly once, with its name and description', () => {
    const ids = attr('role');
    assert.deepEqual([...ids].sort(), ROLES.map((r) => r.id).sort(), 'FAQ role list differs from the game roles');
    const text = roleSections().map(([, h]) => h).join('');
    for (const r of ROLES) assert.ok(text.includes(`>${r.name.replace(/&/g, '&amp;')}</b>`) || text.includes(r.name), `role ${r.id} missing its name`);
    assert.ok(ROLES.every((r) => r.blurb), 'every role has a description to show');
  });

  test('role section counts add up to the role total', () => {
    const counts = roleSections().map(([t]) => Number(t.match(/\((\d+)\)/)[1]));
    assert.equal(counts.reduce((a, b) => a + b, 0), ROLES.length);
  });

  test('every play mode appears, and the room accepts exactly the modes listed', () => {
    assert.deepEqual(attr('mode').sort(), PLAY_MODES.map((m) => m.id).sort());
    const room = newRoom('ABCDEF', 'k');
    const accepted = (a) => { const r = newRoom('ABCDEF', 'k'); reduce(r, { host: true }, { type: 'setConfig', ...a }); return r.config; };
    for (const m of ROOM_MODES) assert.equal(accepted({ mode: m }).mode, m);
    for (const f of CARD_FLOWS) assert.equal(accepted({ cardFlow: f }).cardFlow, f);
    assert.equal(accepted({ mode: 'bogus' }).mode, room.config.mode, 'unknown mode must be rejected');
    for (const m of PLAY_MODES.filter((x) => x.mode)) assert.ok(ROOM_MODES.includes(m.mode) && (!m.cardFlow || CARD_FLOWS.includes(m.cardFlow)));
    for (const mode of ROOM_MODES) assert.ok(PLAY_MODES.some((m) => m.mode === mode), `room mode ${mode} has no FAQ entry`);
    for (const flow of CARD_FLOWS) assert.ok(PLAY_MODES.some((m) => m.cardFlow === flow), `card flow ${flow} has no FAQ entry`);
  });

  test('no stale names or raw filenames in links', () => {
    assert.ok(!/Council Night/i.test(html));
    assert.ok(!/>[^<]*\.(html|css|js|pdf)</.test(html), 'link text must not be a filename');
    assert.deepEqual(GAME_LINKS.map(([n]) => n), ['All Games', 'Quest Night', 'The Gilded Chamber']);
  });
});
