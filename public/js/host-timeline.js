// The Host's night and day view: one big card for the current step, a vertical timeline around it. Pure: no DOM, no state.
// Table-safe: nothing here says who holds a role. Done steps collapse to "<Role> <verb>", upcoming steps are named by role,
// and the player picker always lists every player, so who is missing (or picked) never points at a role.
// The steps come from view.script, which is nightScript(room): the same list resolveNight walks (engine.resolveOrder).
import { ROLE_BY_ID } from './roles.js';
import { nightNav } from './night-nav.js';
import { stepCues, START_CUE, END_CUE } from './engine.js';
import { esc, initial } from './state.js';
import { ui } from './ui_icons.js';
import { NIGHT_PICK_COLLAPSE, DAY_SAYS } from './config-defaults.js';

// The role a step calls ("Detective", "Detective 1", "Mafia"), taken from the line the Host reads, so a disguised role is
// named by what it believes it is.
export function stepName(s) {
  if (s.label) return s.label;
  const said = /^(.+?),\s/.exec(stepCues(s)?.open || s.prompt || '')?.[1];
  const r = ROLE_BY_ID[s.roleId];
  return said || (ROLE_BY_ID[r?.seesAs] || r)?.name || 'Everyone';
}

// What a finished step says in the timeline: a role and a verb, never a player.
export function collapsedText(s) {
  const name = stepName(s);
  const kind = s.kind === 'identify' ? 'identify' : s.kind === 'info' ? 'info' : s.type === 'execCheck' ? 'show' : s.targets === 0 ? 'answer' : 'target';
  return `${name} ${NIGHT_PICK_COLLAPSE[kind]}`;
}

// Short "What to do", by kind. The same words whether the role is alive or dead.
export function whatToDo(s) {
  const name = stepName(s);
  if (s.kind === 'identify') return `${s.count > 1 ? `Tap the ${s.count} players who wake` : 'Tap the player who wakes'}, or No one if nobody holds this card.`;
  if (s.kind === 'info') return 'Nothing to record. Tap Next.';
  if (s.type === 'execCheck') return `Show the ${name} their card, or skip it.`;
  if (s.targets === 0) return s.type === 'alert' ? 'Wait for a nod or a shake. Tap their answer.' : 'Wait for a nod or a shake. Tap Yes or No.';
  const team = ROLE_BY_ID[s.roleId]?.meeting === 'mafia' || s.roleId === 'mafia';
  return `${team ? 'Wait for the team to agree' : `Wait for the ${name} to point`}. Tap ${s.targets > 1 ? `the ${s.targets} players` : 'that player'}.`;
}
const deadLine = (s) => (s.kind === 'action' && s.type !== 'execCheck' ? 'If they are out of the game, read the line anyway and wait a few seconds.' : '');

// The night, as data. uiNight is the Host's night UI state (actions, picks, focus, opened).
export function nightModel(view, uiNight = {}) {
  const nav = nightNav(view, uiNight);
  const steps = nav.steps; const cur = nav.current;
  const isDone = (s) => s.kind !== 'identify' && !!uiNight.actions?.[s.key];
  const started = !!uiNight.opened || !!uiNight.focus || Object.values(uiNight.picks || {}).some((x) => x?.length) || steps.some(isDone) || (cur && steps.indexOf(cur) > 0);
  const intro = !started && !!steps.length;
  const line = (text) => ({ text });
  const done = [];
  if (!intro && steps.length) done.push({ key: '@open', text: 'Everyone closed their eyes' });
  for (const s of steps) if (s !== cur && isDone(s)) done.push({ key: s.key, text: collapsedText(s) });
  const upcoming = steps.filter((s) => (intro || s !== cur) && !isDone(s)).map((s) => ({ key: s.key, name: stepName(s) }));
  if (cur || intro) upcoming.push({ key: '@close', name: 'Everyone' });
  const nextName = intro ? stepName(cur || steps[0]) : upcoming[0]?.name || 'Everyone';
  let card = null;
  if (intro) card = { key: '@open', name: 'Everyone', say: view.story?.open || START_CUE, todo: 'Wait until every eye is closed. Tap Next.', kind: 'intro' };
  else if (cur) {
    const st = view.story?.steps?.[cur.key];
    card = { key: cur.key, step: cur, name: stepName(cur), say: st?.say || stepCues(cur)?.open || '', todo: whatToDo(cur), dead: deadLine(cur), kind: cur.kind,
      then: !upcoming.some((u) => u.key !== '@close') ? (view.story?.close || END_CUE) : '' };
  }
  const idle = !cur && !intro; // no step left, or no roles wake tonight
  return { nav, intro, done, card, upcoming, idle, nextName,
    button: intro ? { label: `Next: ${nextName}`, enabled: true, action: 'startCalls' }
      : { label: nav.enabled ? (nav.action === 'resolve' ? 'Next: Everyone' : `Next: ${nextName}`) : nav.short, enabled: nav.enabled, why: nav.label, action: nav.action } };
}

// The day: morning (if there was a night) then the vote. ui = { stage, sel } with sel a player id or 'none'.
export function dayModel(view, uiDay = {}, revealCard = true) {
  const rep = view.report && view.report.night === view.night ? view.report : null;
  const alive = view.players.filter((p) => p.alive);
  const stage = uiDay.stage || (rep ? 'morning' : 'vote');
  const sel = uiDay.sel === 'none' || alive.some((p) => p.id === uiDay.sel) ? uiDay.sel || null : null;
  const name = (id) => view.players.find((p) => p.id === id)?.name || '?';
  const morningText = rep ? (rep.deaths.length ? `Morning: ${rep.deaths.map((d) => name(d.id)).join(' and ')} ${rep.deaths.length > 1 ? 'were' : 'was'} killed` : 'Morning: no one died') : '';
  const done = [];
  if (stage !== 'morning' && morningText) done.push({ key: 'morning', text: morningText });
  if (uiDay.result) done.push({ key: 'vote', text: uiDay.result });
  const upcoming = [];
  if (stage === 'vote' && !uiDay.result) {
    if (sel && sel !== 'none' && revealCard) upcoming.push({ key: 'reveal', name: `${name(sel)} shows their card` });
  }
  upcoming.push({ key: 'night', name: `Night ${view.night + 1}` });
  const voted = !!uiDay.result;
  return { stage: voted ? 'night' : stage, rep, alive, sel, done, upcoming, voted, say: DAY_SAYS.vote,
    button: stage === 'morning' ? { label: 'Next: Vote', enabled: true, action: 'dayVote' }
      : voted ? { label: `Start night ${view.night + 1}`, enabled: !view.pending.length, why: 'Answer the questions first', action: 'startNight' }
        : { label: sel === 'none' ? 'No one is out' : sel ? `Vote ${name(sel)} out` : 'Tap who’s out', enabled: !!sel, why: 'Tap who’s out, or No one', action: sel === 'none' ? 'noCondemn' : 'condemn' } };
}

// ---- markup ----
const rail = (items, cls) => items.map((i) => `<li class="st-line ${cls}" data-sk="${esc(i.key)}"><span class="st-dot" aria-hidden="true"></span>${cls === 'is-done' ? `<span class="st-tick" aria-hidden="true">${ui('check')}</span>` : ''}<span class="st-text">${esc(i.text || i.name)}</span></li>`).join('');

// Player tokens: a disc with the initial, the name under it. Everyone is listed; `none` adds the "No one" token.
export function tokens(players, { picked = [], none = null, action = 'pick', key = '', extra = '' }) {
  const tok = (p) => `<button type="button" class="st-tok" aria-pressed="${picked.includes(p.id)}" data-a="${action}" ${key ? `data-key="${esc(key)}"` : ''} data-id="${esc(p.id)}"><span class="st-disc" data-i="${initial(p.name)}" aria-hidden="true"></span><span class="st-nm">${esc(p.name)}</span></button>`;
  const no = none ? `<button type="button" class="st-tok is-none" aria-pressed="${!!none.on}" ${none.attrs}><span class="st-disc is-x" aria-hidden="true">${ui('x')}</span><span class="st-nm">No one</span></button>` : '';
  return `<div class="st-pick" role="group" aria-label="Players">${players.map(tok).join('')}${no}${extra}</div>`;
}

// The big card. `body` is the step-specific block (picker, buttons) built by the caller.
export function card({ kicker, say, todo, dead = '', body = '', then = '', key = '', mark = '' }) {
  return `<li class="cue is-current st-card" data-ck="${esc(key)}" aria-current="step"><span class="st-dot is-now" aria-hidden="true"></span>
    <p class="st-kicker">${esc(kicker)}</p>${say ? `<p class="tell-say st-say"><b>“${esc(say)}”</b></p>` : ''}
    <p class="st-todo">${esc(todo)}</p>${dead ? `<p class="st-dead">${esc(dead)}</p>` : ''}${mark}${body}${then ? `<p class="st-then">Then say: “${esc(then)}”</p>` : ''}</li>`;
}

export function timeline({ done, upcoming, current, title }) {
  return `<ol class="cues one st-rail" data-night>${rail(done, 'is-done')}${current}${rail(upcoming, 'is-next')}</ol>`;
}

// The step-specific block: the picker (every player, never the actor alone left out) or the yes/no buttons.
const plain = (list) => list.map((p) => ({ id: p.id, name: p.name }));
export function stepBody(v, s, n, alive = v.players.filter((p) => p.alive)) {
  const set = n.actions?.[s.key];
  const plural = (k, one) => `${k} ${k === 1 ? one : `${one}s`}`;
  if (s.kind === 'identify') {
    const picks = n.picks?.[s.key] || [];
    return `${tokens(plain(v.players.filter((p) => s.candidates.includes(p.id))), { picked: picks, key: s.key, none: { attrs: `data-a="skipIdentify" data-key="${esc(s.key)}" data-role="${esc(s.roleId)}"` } })}
      <p class="meta">${picks.length ? `${picks.length} of ${s.count} picked` : `Pick ${plural(s.count, 'player')}`}</p>`;
  }
  if (s.kind !== 'action') return '';
  if (s.type === 'execCheck') return `<div class="btn-row"><button type="button" class="btn" data-a="alert" data-key="${s.key}" data-v="1">Show card</button><button type="button" class="btn ghost" data-a="skip" data-key="${s.key}">Skip</button></div>`;
  if (s.targets === 0) {
    const [yes, no] = s.type === 'alert' ? ['Go on alert', 'Not tonight'] : ['Yes', 'No'];
    return `<div class="btn-row"><button type="button" class="btn ${set && !set.on ? 'ghost' : ''}" aria-pressed="${!!set?.on}" data-a="alert" data-key="${s.key}" data-v="1">${yes}</button><button type="button" class="btn ghost" aria-pressed="${!!set && !set.on}" data-a="alert" data-key="${s.key}" data-v="0">${no}</button></div>`;
  }
  const list = s.dead ? v.players.filter((p) => !p.alive) : alive;
  const picks = set ? set.targets : n.picks?.[s.key] || [];
  const need = s.targets || 1;
  return `${tokens(plain(list), { picked: picks, key: s.key, none: { on: !!set && !set.targets.length, attrs: `data-a="skip" data-key="${esc(s.key)}"` } })}${need > 1 ? `<p class="meta">Pick ${need} players${picks.length && !set ? ` (${picks.length} of ${need} picked)` : ''}</p>` : ''}`;
}
