// What the Host's Next button does on a night screen. Pure: no DOM, no state; host.js renders it, app.js acts on it.
// There is always a way forward: a step that needs a choice names it, and every such step can be skipped.
import { ROLE_BY_ID } from './roles.js';

const shownRole = (s) => { const r = ROLE_BY_ID[s.roleId]; return ROLE_BY_ID[r?.seesAs] || r; };
const roleName = (s) => shownRole(s)?.name || 'role';
const isMafiaCall = (s) => s.roleId === 'mafia' || ROLE_BY_ID[s.roleId]?.meeting === 'mafia';

// A step that is finished: an action or info step with a recorded answer. Identify steps vanish from the script once confirmed.
const isDone = (s, ui) => s.kind !== 'identify' && !!ui.actions?.[s.key];

// Does the Host have to record something for this step? Info, used-up and dead-cover steps need nothing but Next.
export function stepNeeds(view, s) {
  if (s.kind === 'identify') return 'identify';
  if (s.kind !== 'action' || s.spent) return null;
  if (s.actors.every((id) => !view.players.find((p) => p.id === id)?.alive)) return null;
  return s.type === 'execCheck' ? 'show' : s.targets === 0 ? 'answer' : 'target';
}

export function missingLabel(kind, s) {
  if (kind === 'identify') {
    if (isMafiaCall(s)) return 'Mark who is Mafia';
    return s.count > 1 ? `Mark the ${s.count} ${roleName(s)}s` : `Mark who is the ${roleName(s)}`;
  }
  if (kind === 'target') return `Tap who the ${s.label || roleName(s)} picked`;
  if (kind === 'answer') return `Tap the ${roleName(s)}’s answer`;
  return `Show the ${roleName(s)} their card`;
}

export function nightNav(view, uiNight = {}) {
  const ui = { actions: {}, picks: {}, ...uiNight };
  const steps = view.script || [];
  const open = steps.filter((s) => s.kind === 'identify' || !isDone(s, ui));
  const current = steps.find((s) => s.key === ui.focus) || open[0] || null;
  const out = { current, steps, open, needs: null, label: 'Wake everyone up', enabled: true, action: 'resolve', canSkip: false };
  if (!current) return out;
  const need = isDone(current, ui) ? null : stepNeeds(view, current);
  if (need) {
    out.canSkip = true;
    // An identify step whose players are already picked just waits for Next, which confirms them.
    const picked = need === 'identify' && (ui.picks?.[current.key] || []).length === current.count;
    if (!picked) {
      out.needs = { kind: need, key: current.key };
      out.label = missingLabel(need, current); out.enabled = false; out.action = 'next';
      return out;
    }
  }
  const rest = open.filter((s) => s !== current);
  out.label = rest.length ? 'Next' : 'Wake everyone up';
  out.action = rest.length ? 'next' : 'resolve';
  // An identify step still has to be confirmed before the night can go on, so it never ends the night itself.
  if (current.kind === 'identify') { out.action = 'next'; if (!rest.length) out.label = 'Next'; }
  return out;
}

// What tapping Next records for a step with nothing to pick (info, used-up, dead cover); null when it needs a choice or has one.
export function autoRecord(view, s, uiNight = {}) {
  if (uiNight.actions?.[s.key] || s.kind === 'identify' || stepNeeds(view, s)) return null;
  return s.kind === 'info' ? { done: true } : { targets: [], skipped: true };
}

// Tapping Next. Records a step with nothing to pick, then either moves on to the next open step or ends the night.
// Mutates the Host's night UI state (actions, picks, focus) and returns { blocked } (label: why not), { send } (an
// action for the room) or { focus } (the step to scroll to).
export function pressNext(view, ui) {
  const nav = nightNav(view, ui); const cur = nav.current;
  if (!nav.enabled) return { blocked: nav.label };
  ui.picks ||= {}; ui.actions ||= {};
  if (cur?.kind === 'identify') {
    const ids = ui.picks[cur.key] || []; delete ui.picks[cur.key]; ui.focus = null;
    return { send: { type: 'identifyRole', roleId: cur.roleId, playerIds: ids } };
  }
  const rec = cur && autoRecord(view, cur, ui);
  if (rec) ui.actions[cur.key] = rec;
  ui.focus = null;
  if (nav.action === 'resolve') return { send: { type: 'submitNight', actions: ui.actions } };
  ui.focus = nightNav(view, ui).current?.key || null;
  return { focus: ui.focus };
}
