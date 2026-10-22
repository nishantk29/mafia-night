// Table tools: talk timer, turn timer, vote counter, random player, coin and dice. They live on this device only
// (nothing is sent to the room), so the storyteller can use them mid-game without changing the game.
import { S, esc } from './state.js';
import { ui } from './ui_icons.js';

export const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
export const DICE_SIDES = [6, 20];
// `count` dice (1 to 6) with `sides` faces (6 or 20).
export function rollDice(count, sides) {
  const n = Math.min(6, Math.max(1, Math.floor(count) || 1));
  const s = DICE_SIDES.includes(sides) ? sides : 6;
  return Array.from({ length: n }, () => rnd(s) + 1);
}
const mmss =(ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function timerLeft() {
  const t = S.ui.timer; if (!t) return 0;
  return t.endAt ? t.endAt - Date.now() : t.left;
}
export const timerRunning = () => !!S.ui.timer?.endAt;

// Talk-turn timer: one speaker at a time, passed around the living players in seat order.
export function turnLeft() {
  const t = S.ui.turn; if (!t) return 0;
  return t.endAt ? t.endAt - Date.now() : t.left;
}
export const turnRunning = () => !!S.ui.turn?.endAt;
// The living player after `id` in seat order (the first living player if `id` is unset or no longer in play).
export function nextSpeaker(players, id) {
  const alive = players.filter((p) => p.alive);
  if (!alive.length) return null;
  const i = alive.findIndex((p) => p.id === id);
  return alive[(i + 1) % alive.length];
}
const speakerOf = (v) => v.players.find((p) => p.id === S.ui.turn?.pid && p.alive) || nextSpeaker(v.players, null);

// The appbar button. While a timer runs it shows the time left, so it can be watched with the panel shut.
export function toolsButton() {
  const main = timerRunning();
  const run = main || turnRunning();
  const attr = main ? 'data-timer' : 'data-turn';
  return `<button type="button" class="appbar-tools ${run ? 'is-running' : ''}" data-a="tools" aria-label="${run ? 'Tools. Timer running' : 'Tools'}">
    ${ui(run ? 'timer' : 'tools')}${run ? `<span class="appbar-timer" ${attr}>${mmss(main ? timerLeft() : turnLeft())}</span>` : '<span class="appbar-tools-label">Tools</span>'}</button>`;
}

export function toolsPanel(v, host) {
  const tabs = host
    ? [['timer', 'timer', 'Timer'], ['turns', 'user', 'Turns'], ['votes', 'hand', 'Votes'], ['pick', 'pick', 'Pick'], ['coin', 'coin', 'Coin'], ['dice', 'dice', 'Dice']]
    : [['coin', 'coin', 'Coin'], ['dice', 'dice', 'Dice']];
  const cur = tabs.some(([k]) => k === S.ui.toolTab) ? S.ui.toolTab : tabs[0][0];
  const body = { timer, turns, votes, pick, coin, dice }[cur](v);
  return `<div class="overlay tools-show" data-a="closeTools"><div class="overlay-in tools${S.ui.anim === 'modal' ? ' is-entering' : ''}" role="dialog" aria-modal="true" aria-labelledby="tools-title">
    <button type="button" class="icon-btn x-btn" data-a="closeTools" aria-label="Close">${ui('x')}</button>
    <h2 class="phase-title" id="tools-title">Tools</h2>
    <div class="tool-tabs" role="tablist" aria-label="Tools">${tabs.map(([k, icon, label]) => `<button type="button" role="tab" aria-selected="${cur === k}" tabindex="${cur === k ? 0 : -1}" data-a="toolTab" data-v="${k}">${ui(icon)}<span>${label}</span></button>`).join('')}</div>
    <div class="tool-body" role="tabpanel">${body}</div>
  </div></div>`;
}

function timer() {
  const t = S.ui.timer || { left: 120000, total: 120000, endAt: 0 };
  const run = !!t.endAt;
  const presets = [1, 2, 3, 5];
  return `<div class="tool-center">
    <p class="tool-big" data-timer aria-live="off">${mmss(timerLeft() || t.left)}</p>
    <div class="btn-row tool-presets" role="group" aria-label="Length">${presets.map((m) => `<button type="button" class="btn ghost" aria-pressed="${t.total === m * 60000}" data-a="timerSet" data-v="${m}">${m} min</button>`).join('')}</div>
    <div class="btn-row">
      <button type="button" class="btn big" data-a="timerGo">${ui(run ? 'pause' : 'play')} ${run ? 'Pause' : t.left < t.total ? 'Resume' : 'Start'}</button>
      <button type="button" class="btn ghost" data-a="timerReset">${ui('reset')} Reset</button>
    </div>
    <p class="muted">Keeps running if you close this panel; the time shows at the top of the screen.</p>
  </div>`;
}

function turns(v) {
  const t = S.ui.turn || { total: 60000, left: 60000, endAt: 0 };
  const who = speakerOf(v);
  const run = !!t.endAt;
  return `<div class="tool-center">
    <p class="tool-big tool-name" aria-live="polite" data-raw>${who ? esc(who.name) : 'No one left'}</p>
    <p class="tool-big" data-turn aria-live="off">${mmss(turnLeft() || t.left)}</p>
    <div class="btn-row tool-presets" role="group" aria-label="Time each">${[30, 60, 90].map((s) => `<button type="button" class="btn ghost" aria-pressed="${t.total === s * 1000}" data-a="turnSet" data-v="${s}">${s} sec</button>`).join('')}</div>
    <div class="btn-row">
      <button type="button" class="btn big" data-a="turnGo" ${who ? '' : 'disabled'}>${ui(run ? 'pause' : 'play')} ${run ? 'Pause' : t.left < t.total ? 'Resume' : 'Start'}</button>
      <button type="button" class="btn ghost" data-a="turnNext" ${who ? '' : 'disabled'}>Next speaker</button>
    </div>
    <p class="muted">Passes around the living players in seat order. When time runs out it moves to the next speaker and waits for you to start.</p>
  </div>`;
}

function votes(v) {
  const alive = v.players.filter((p) => p.alive);
  const tally = S.ui.votesDay === v.day ? S.ui.votes || {} : {}; // a new day starts a new count
  const need = Math.floor(alive.length / 2) + 1;
  const top = Math.max(0, ...alive.map((p) => tally[p.id] || 0));
  return `<p class="muted">Count hands for each player put up for the vote. A majority is <b>${need}</b> of ${alive.length} living players.</p>
    <ul class="vote-list">${alive.map((p) => { const n = tally[p.id] || 0;
      return `<li class="vote-row ${n && n === top ? 'is-top' : ''} ${n >= need ? 'is-majority' : ''}">
        <span class="vote-name" data-raw>${esc(p.name)}</span>
        <button type="button" class="icon-btn" data-a="vote" data-id="${p.id}" data-v="-1" aria-label="One fewer vote for ${esc(p.name)}" ${n ? '' : 'disabled'}>${ui('minus')}</button>
        <b class="vote-n" aria-label="${n} votes">${n}</b>
        <button type="button" class="icon-btn" data-a="vote" data-id="${p.id}" data-v="1" aria-label="One more vote for ${esc(p.name)}">${ui('plus')}</button>
      </li>`; }).join('')}</ul>
    ${top >= need ? `<p class="note is-warn">${ui('gavel')} <span><b data-raw>${esc(alive.find((p) => (tally[p.id] || 0) === top).name)}</b> has a majority.</span></p>` : ''}
    <button type="button" class="btn ghost" data-a="votesClear">${ui('reset')} Clear the count</button>`;
}

function pick(v) {
  const alive = v.players.filter((p) => p.alive);
  const got = alive.find((p) => p.id === S.ui.picked);
  return `<div class="tool-center">
    <p class="tool-big tool-name" aria-live="polite" data-raw>${got ? esc(got.name) : '?'}</p>
    <button type="button" class="btn big" data-a="pickPlayer" ${alive.length ? '' : 'disabled'}>${ui('pick')} Pick a living player</button>
    <p class="muted">For who speaks first, a tie-break, or anything else that needs a fair pick.</p>
  </div>`;
}

function coin() {
  const c = S.ui.coin;
  return `<div class="tool-center">
    <p class="tool-big" aria-live="polite">${c ? (c === 'heads' ? 'Heads' : 'Tails') : '?'}</p>
    ${c ? `<p class="tool-sub">${c === 'heads' ? 'Yes' : 'No'}</p>` : '<p class="tool-sub muted">Heads is yes, tails is no.</p>'}
    <button type="button" class="btn big" data-a="flipCoin">${ui('coin')} Flip</button>
  </div>`;
}

function dice() {
  const d = S.ui.dice || [];
  const count = S.ui.diceCount || 1;
  const sides = S.ui.diceSides || 6;
  return `<div class="tool-center">
    <p class="tool-big" aria-live="polite">${d.length ? d.join(' + ') + (d.length > 1 ? ` = ${d.reduce((a, b) => a + b, 0)}` : '') : '?'}</p>
    <div class="btn-row" role="group" aria-label="Kind of die">${DICE_SIDES.map((n) => `<button type="button" class="btn ghost" aria-pressed="${sides === n}" data-a="diceSides" data-v="${n}">d${n}</button>`).join('')}</div>
    <div class="btn-row" role="group" aria-label="How many dice">${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="btn ghost" aria-pressed="${count === n}" data-a="diceCount" data-v="${n}" aria-label="${n} ${n === 1 ? 'die' : 'dice'}">${n}</button>`).join('')}</div>
    <button type="button" class="btn big" data-a="rollDice">${ui('dice')} Roll</button>
  </div>`;
}

// Handlers, merged into the app's action table.
export const TOOL_ACTIONS = {
  tools() { S.ui.tools = true; S.ui.anim = 'modal'; S.render(); },
  closeTools() { S.ui.tools = false; S.render(); },
  toolTab(el) { S.ui.toolTab = el.dataset.v; S.render(); },
  timerSet(el) { const ms = Number(el.dataset.v) * 60000; S.ui.timer = { total: ms, left: ms, endAt: 0 }; S.render(); },
  timerGo() {
    const t = S.ui.timer ||= { total: 120000, left: 120000, endAt: 0 };
    if (t.endAt) { t.left = Math.max(0, t.endAt - Date.now()); t.endAt = 0; } else { if (t.left <= 0) t.left = t.total; t.endAt = Date.now() + t.left; }
    keepAwake(); S.render();
  },
  timerReset() { const t = S.ui.timer; const ms = t?.total || 120000; S.ui.timer = { total: ms, left: ms, endAt: 0 }; keepAwake(); S.render(); },
  turnSet(el) { const ms = Number(el.dataset.v) * 1000; S.ui.turn = { pid: S.ui.turn?.pid, total: ms, left: ms, endAt: 0 }; keepAwake(); S.render(); },
  turnGo() {
    const t = S.ui.turn ||= { pid: null, total: 60000, left: 60000, endAt: 0 };
    if (t.endAt) { t.left = Math.max(0, t.endAt - Date.now()); t.endAt = 0; } else {
      t.pid = speakerOf(S.view)?.id; if (t.left <= 0) t.left = t.total; t.endAt = Date.now() + t.left;
    }
    keepAwake(); S.render();
  },
  turnNext() { passTurn(S.view, S.ui.turn?.endAt > 0); S.render(); },
  vote(el) { if (S.ui.votesDay !== S.view?.day) { S.ui.votes = {}; S.ui.votesDay = S.view?.day; } const v = S.ui.votes; v[el.dataset.id] = Math.max(0, (v[el.dataset.id] || 0) + Number(el.dataset.v)); S.render(); },
  votesClear() { S.ui.votes = {}; S.render(); },
  pickPlayer() {
    const alive = (S.view?.players || []).filter((p) => p.alive);
    if (alive.length) { S.ui.picked = alive[rnd(alive.length)].id; S.render(); }
  },
  flipCoin() { S.ui.coin = rnd(2) ? 'heads' : 'tails'; S.render(); },
  diceCount(el) { S.ui.diceCount = Number(el.dataset.v); S.ui.dice = []; S.render(); },
  diceSides(el) { S.ui.diceSides = Number(el.dataset.v); S.ui.dice = []; S.render(); },
  rollDice() { S.ui.dice = rollDice(S.ui.diceCount || 1, S.ui.diceSides || 6); S.render(); },
};

// Move the turn timer to the next living player; it keeps running only if `run` is set.
function passTurn(v, run) {
  const t = S.ui.turn ||= { pid: null, total: 60000, left: 60000, endAt: 0 };
  const next = nextSpeaker(v?.players || [], speakerOf(v)?.id);
  t.pid = next?.id ?? null; t.left = t.total; t.endAt = run && next ? Date.now() + t.total : 0;
  keepAwake();
}

// Keep the screen awake while any timer runs, so a phone propped on the table doesn't lock mid-turn.
// The browser drops the lock when the page is hidden, so the tick takes it again when the page returns.
let wake = null; let waking = false;
export async function keepAwake() {
  const want = timerRunning() || turnRunning();
  if (want && !wake && !waking && navigator.wakeLock && document.visibilityState === 'visible') {
    waking = true;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch { /* denied or unsupported */ }
    waking = false;
  }
  if (!want && wake) { const w = wake; wake = null; try { await w.release(); } catch { /* already released */ } }
}

function ring() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
  } catch { /* no audio */ }
}

// One tick: update the timer text in place, and sound the end.
let beeped = false;
export function tickTools() {
  keepAwake();
  const turn = S.ui.turn;
  if (turn?.endAt) {
    const left = turn.endAt - Date.now();
    for (const el of document.querySelectorAll('[data-turn]')) el.textContent = mmss(left);
    if (left <= 0) {
      const name = speakerOf(S.view || { players: [] })?.name;
      ring(); passTurn(S.view, false); keepAwake();
      S.toast(name ? `Time’s up, ${name}.` : 'Time’s up.'); S.render();
    }
  }
  const t = S.ui.timer; if (!t?.endAt) return;
  const left = t.endAt - Date.now();
  for (const el of document.querySelectorAll('[data-timer]')) el.textContent = mmss(left);
  if (left <= 0 && !beeped) {
    beeped = true; t.endAt = 0; t.left = 0;
    ring(); keepAwake();
    S.toast('Time’s up.'); S.render();
  }
  if (left > 0) beeped = false;
}
