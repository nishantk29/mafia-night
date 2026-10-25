// The Mafia team is called "Mafia", never "Mafias", however many of them are still unidentified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewForHost } from '../public/js/room.js';
import { stepCues } from '../public/js/engine.js';
import { dealt, hostScreen, S, ok, freshUi } from './night-drive-lib.mjs';

for (const flow of ['blind']) {
  test(`the Mafia call says "Mafia, open your eyes." (unidentified, blind cards)`, () => {
    const g = dealt({ roles: ['mafia', 'mafia', 'mafia', 'doctor', 'villager', 'villager', 'villager'], version: 8, flow, seed: 5 });
    ok(g.room, { type: 'startNight' });
    const view = viewForHost(g.room);
    const calls = view.script.filter((s) => s.roleId === 'mafia');
    assert.ok(calls.some((s) => s.kind === 'identify' && s.count > 1), 'an unidentified Mafia step for several players');
    for (const s of calls) {
      assert.match(stepCues(s).open, /^Mafia, open your eyes\./);
      assert.doesNotMatch(s.prompt, /Mafias/);
    }
    S.ui.night = freshUi(g.room);
    assert.doesNotMatch(hostScreen(view, true).body || String(hostScreen(view, true)), /Mafias/);
  });
}

import { shortLabel, SHORT_MAX } from '../public/js/night-nav.js';
import { ROLES } from '../public/js/roles.js';

test(`every Next label variant is at most ${SHORT_MAX} characters (one line at 390px)`, () => {
  for (const r of ROLES) {
    for (const kind of ['identify', 'target', 'answer', 'show']) {
      for (const count of [1, 2, 9]) {
        for (const label of [undefined, 'Cop 1', 'Confused Cop 12']) {
          const t = shortLabel(kind, { roleId: r.id, count, label });
          assert.ok(t.length <= SHORT_MAX, `${r.id}/${kind}: "${t}" is ${t.length}`);
        }
      }
    }
  }
  for (const t of ['Next', 'Wake everyone up']) assert.ok(t.length <= SHORT_MAX);
});
