// The day "Talk it out" step: the model, the pin per room, and that it can never block (timer 0, skip, refresh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, viewForHost, advancedOf } from '../public/js/room.js';
import { dayModel, talkBody } from '../public/js/host-timeline.js';
import { clampMinutes, talkLeft, talkDoneText, loadDayStage, saveDayStage } from '../public/js/day-talk.js';
import { TALK_MINUTES, TALK_MIN, TALK_MAX } from '../public/js/config-defaults.js';

const HOST = { host: true };
function dayRoom({ dayTimer = false, night = true } = {}) {
  const room = newRoom('TALKRM', 'hostkey');
  reduce(room, HOST, { type: 'addPlayers', names: ['Ana', 'Ben', 'Cal', 'Dee', 'Eve'] });
  reduce(room, HOST, { type: 'setConfig', mode: 'app', roles: ['mafia', 'doctor', 'detective', 'villager', 'villager'], advanced: { dayTimer } });
  assert.equal(reduce(room, HOST, { type: 'deal' }).error, undefined);
  if (night) { reduce(room, HOST, { type: 'startNight' }); reduce(room, HOST, { type: 'submitNight', actions: {} }); } else reduce(room, HOST, { type: 'startDay' });
  return room;
}
const NOW = 1_800_000_000_000;
const MIN = 60000;
const mem = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; };

test('defaults: 5 minutes, adjustable 1 to 15', () => {
  assert.equal(TALK_MINUTES, 5); assert.equal(TALK_MIN, 1); assert.equal(TALK_MAX, 15);
  assert.equal(clampMinutes(0), TALK_MINUTES); assert.equal(clampMinutes(-3), 1); assert.equal(clampMinutes(99), 15); assert.equal(clampMinutes(6), 6);
});

test('the day goes morning, talk, vote; Next names the next step', () => {
  const v = viewForHost(dayRoom({ dayTimer: true }));
  let m = dayModel(v, {}, true, NOW);
  assert.equal(m.stage, 'morning'); assert.equal(m.button.label, 'Next: Talk it out'); assert.equal(m.button.action, 'dayTalk');
  assert.ok(m.upcoming.some((u) => u.name === 'Talk it out'));
  m = dayModel(v, { stage: 'talk', startedAt: NOW }, true, NOW);
  assert.equal(m.stage, 'talk'); assert.equal(m.button.label, 'Next: Vote'); assert.equal(m.button.action, 'dayVote'); assert.ok(m.button.enabled);
  assert.equal(m.talk.timed, true); assert.equal(m.talk.left, 5 * MIN);
  assert.ok(m.upcoming.some((u) => u.name === 'Vote'));
  m = dayModel(v, { stage: 'vote' }, true, NOW);
  assert.ok(m.done.some((d) => d.key === 'talk' && d.text === 'Talked it out'));
});

test('a day with no night (day start) opens on the talk', () => {
  const m = dayModel(viewForHost(dayRoom({ night: false })), {}, true, NOW);
  assert.equal(m.stage, 'talk');
});

test('done row: minutes used, or skipped', () => {
  assert.equal(talkDoneText({ timed: true, startedAt: NOW - 5 * MIN, now: NOW }), 'Talked it out for 5 minutes');
  assert.equal(talkDoneText({ timed: true, startedAt: NOW - 10000, now: NOW }), 'Talked it out for 1 minute');
  assert.equal(talkDoneText({ timed: true, startedAt: NOW - 90 * MIN, now: NOW }), 'Talked it out for 90 minutes');
  assert.equal(talkDoneText({ timed: false }), 'Talked it out');
  assert.equal(talkDoneText({ skipped: true, timed: true }), 'Skipped the talk');
  const v = viewForHost(dayRoom());
  const m = dayModel(v, { stage: 'vote', talkDone: 'Skipped the talk' }, true, NOW);
  assert.deepEqual(m.done.map((d) => d.text).slice(-1), ['Skipped the talk']);
});

test('Day timer off: the step is untimed, no countdown, Next still goes to the vote', () => {
  const v = viewForHost(dayRoom({ dayTimer: false }));
  const m = dayModel(v, { stage: 'talk', startedAt: NOW }, true, NOW);
  assert.equal(m.talk.timed, false); assert.equal(m.talk.left, null);
  assert.doesNotMatch(talkBody(m.talk), /data-talk\b|\+1 min/); assert.match(talkBody(m.talk), /Skip the talk/);
  assert.equal(m.button.label, 'Next: Vote');
});

test('the talk is pinned per room: a room dealt before it keeps the old day', () => {
  const room = dayRoom();
  assert.equal(advancedOf(room).talkStep, true);
  delete room.dealtAdvanced.talkStep; // a room dealt before this change
  const v = viewForHost(room);
  assert.equal(advancedOf(room).talkStep, false);
  assert.equal(dayModel(v, {}, true, NOW).button.label, 'Next: Vote');
  assert.equal(dayModel(v, { stage: 'talk' }, true, NOW).stage, 'vote'); // a stale talk stage falls to the vote
  assert.equal(dayModel(v, { stage: 'vote' }, true, NOW).done.some((d) => d.key === 'talk'), false);
});

test('no step can block: timer at 0, long past 0, skip, adjust at the limits, refresh', () => {
  for (const dayTimer of [true, false]) {
    const v = viewForHost(dayRoom({ dayTimer }));
    for (const elapsed of [0, 5 * MIN - 1, 5 * MIN, 5 * MIN + 1, 60 * MIN]) {
      for (const minutes of [TALK_MIN, 5, TALK_MAX, undefined]) {
        const m = dayModel(v, { stage: 'talk', minutes, startedAt: NOW - elapsed }, true, NOW);
        assert.equal(m.stage, 'talk', 'reaching 0 never advances by itself');
        assert.ok(m.button.enabled && m.button.action === 'dayVote', `Next on at ${elapsed}`);
        const body = talkBody(m.talk); assert.match(body, /data-a="talkSkip"/);
        if (dayTimer) { assert.ok(m.talk.left >= 0); assert.doesNotMatch(body, /<button[^>]*\sdisabled[\s>=]/); }
      }
    }
    // Skip and Next both reach the vote, which can finish the day.
    assert.equal(dayModel(v, { stage: 'vote', talkDone: 'Skipped the talk' }, true, NOW).stage, 'vote');
  }
  assert.equal(talkLeft({ minutes: 5, startedAt: NOW - 99 * MIN }, NOW), 0);
});

test('adjust: the stored minutes move one at a time and stay in range', () => {
  const v = viewForHost(dayRoom({ dayTimer: true }));
  assert.equal(dayModel(v, { stage: 'talk', minutes: clampMinutes(5 + 1), startedAt: NOW }, true, NOW).talk.left, 6 * MIN);
  assert.equal(dayModel(v, { stage: 'talk', minutes: clampMinutes(1 - 1), startedAt: NOW }, true, NOW).talk.minutes, 5); // 0 reads as unset
  assert.equal(dayModel(v, { stage: 'talk', minutes: clampMinutes(15 + 1), startedAt: NOW }, true, NOW).talk.minutes, 15);
});

test('refresh mid-talk restores the step; another room, game or day does not', () => {
  const st = mem(); const s = { day: 1, stage: 'talk', minutes: 7, startedAt: NOW - 2 * MIN };
  saveDayStage(st, 'TALKRM', 1, s);
  assert.deepEqual(loadDayStage(st, 'TALKRM', 1, 1), { ...s, code: 'TALKRM', gameNo: 1 });
  const v = viewForHost(dayRoom({ dayTimer: true }));
  assert.equal(dayModel(v, loadDayStage(st, 'TALKRM', 1, 1), true, NOW).talk.left, 5 * MIN);
  assert.equal(loadDayStage(st, 'OTHER1', 1, 1), null); assert.equal(loadDayStage(st, 'TALKRM', 2, 1), null); assert.equal(loadDayStage(st, 'TALKRM', 1, 2), null);
  st.set('mafia.talk.v1', '{broken'); assert.equal(loadDayStage(st, 'TALKRM', 1, 1), null); // bad storage falls back to the morning
});

test('copy lint: the talk step wording is plain, with no em dashes', async () => {
  const { lintCopy } = await import('./kit/copy-lint.mjs');
  const { TALK_TODO, talkUpText } = await import('../public/js/host-timeline.js');
  const lines = [TALK_TODO, talkUpText, 'Talk it out', 'Skip the talk', 'Skipped the talk', 'Next: Talk it out', talkDoneText({ timed: true, startedAt: NOW - 5 * MIN, now: NOW }), talkBody({ timed: true, minutes: 5, left: 0 }).replace(/<[^>]+>/g, ' ')];
  for (const l of lines) { assert.deepEqual(lintCopy(l), [], l); assert.doesNotMatch(l, /[—–]/, l); }
});

test('after the vote the next night shows once: as the current card, not again as an upcoming row', () => {
  const v = viewForHost(dayRoom());
  const before = dayModel(v, { stage: 'vote' }, true, NOW);
  assert.deepEqual(before.upcoming.filter((u) => u.key === 'night').map((u) => u.name), [`Night ${v.night + 1}`]);
  const after = dayModel(v, { stage: 'vote', result: 'Ben was voted out' }, true, NOW);
  assert.equal(after.stage, 'night'); assert.equal(after.button.label, `Start night ${v.night + 1}`);
  assert.equal(after.upcoming.filter((u) => u.key === 'night').length, 0, after.upcoming.map((u) => u.name).join(' / '));
});
