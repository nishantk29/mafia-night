// The day's "Talk it out" step: pure helpers (no DOM). The step never blocks: the countdown is text only, reaching 0 changes
// nothing but the words, and Next and Skip are always on. The timing lives on the Host's phone (not in the room), so it
// cannot touch the game; a refresh brings the step back from storage.
import { TALK_MINUTES, TALK_MIN, TALK_MAX, TALK_STORE_KEY } from './config-defaults.js';

export const clampMinutes = (n) => Math.min(TALK_MAX, Math.max(TALK_MIN, Math.round(Number(n)) || TALK_MINUTES));
export const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Time left on the countdown (never below 0).
export const talkLeft = (t, now) => Math.max(0, clampMinutes(t?.minutes) * 60000 - Math.max(0, now - (t?.startedAt || now)));
// What the finished step says in the timeline: the minutes actually used (at least 1), or that it was skipped.
export function talkDoneText({ timed, skipped, startedAt, now }) {
  if (skipped) return 'Skipped the talk';
  if (!timed) return 'Talked it out';
  const m = Math.max(1, Math.round(Math.max(0, now - (startedAt || now)) / 60000));
  return `Talked it out for ${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

// Saved on the Host's phone: { code, gameNo, day, stage, minutes, startedAt, talkDone }.
export function loadDayStage(store, code, gameNo, day) {
  try {
    const s = JSON.parse(store.get(TALK_STORE_KEY) || 'null');
    return s && s.code === code && s.gameNo === gameNo && s.day === day && ['morning', 'talk', 'vote'].includes(s.stage) ? s : null;
  } catch { return null; }
}
export const saveDayStage = (store, code, gameNo, s) => store.set(TALK_STORE_KEY, JSON.stringify({ ...s, code, gameNo }));
