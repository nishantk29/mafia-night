// Host help, Mafia half: the words (built from the game's own phases and night steps) and the UI state.
// The generic sheet and walkthrough markup lives in host_help_core.js. Host only: player.js never imports this.
import { S } from './state.js';
import { ui } from './ui_icons.js';
import { ROLE_BY_ID } from './roles.js';
import { stepCues } from './engine.js';
import { helpSeen, markHelpSeen, helpButton, helpSheet, walkthrough } from './host_help_core.js';

export const SEEN_KEY = 'mafia.hostHelpSeen';

export const WALKTHROUGH = [
  { title: 'Set up roles', lines: ['Add your players, then pick the roles in the deck.', 'The app warns you if the mix looks lopsided.'] },
  { title: 'Share the code', lines: ['Players open the site and type your room code, or scan the QR.', 'Everyone sees only their own role.'] },
  { title: 'Read the night script aloud', lines: ['Each night the app gives you lines to say, in order.', 'Tap what each role chooses, then wake everyone up.'] },
  { title: 'Run the day vote', lines: ['Read the morning announcement, let the table talk, then condemn someone.', 'No majority? Tap Nobody today.'] },
];

// What to do in each phase. day has two faces: the morning (a report from last night is on screen) and the plain vote.
const PHASE_HELP = {
  lobby: { title: 'Setting up', lines: ['Add every player, or wait for them to join with the room code.', 'Pick the roles in the deck. The app flags a lopsided mix.', 'When the count fits, deal the roles.'] },
  dealt: { title: 'Roles dealt', lines: ['Everyone looks at their own role, privately.', 'Wait until every player has seen theirs.', 'Then start the first night.'] },
  night: { title: 'Night', lines: ['Say the first line: everyone closes their eyes.', 'Go down the list. Read each call aloud and tap what that role chooses.', 'When every step is done, wake everyone up.'] },
  morning: { title: 'Morning', lines: ['Read the announcement aloud.', 'Answer any questions the app asks first.', 'Then run the vote below.'] },
  day: { title: 'Day vote', lines: ['Let the table talk.', 'Tap the player the table votes out, then condemn them, or tap Nobody today.', 'Then start the next night.'] },
  over: { title: 'Game over', lines: ['Tell the table who won.', 'Restart keeps the same code and players with new roles.', 'Or change the setup first.'] },
};
export const HELP_PHASES = Object.keys(PHASE_HELP);

// The name the step is called by ("Cop 2", "Mafia"): the call line already names it; quiet steps use the role name.
export function callName(step) {
  const open = stepCues(step)?.open;
  return /^(.+?),\s+open your eyes/i.exec(open || '')?.[1] || ROLE_BY_ID[step?.roleId]?.name || 'This role';
}

// Plain lines for one night step, by its kind and type.
function stepHelp(step) {
  const who = callName(step);
  const say = stepCues(step)?.open;
  const call = say ? [`Say: “${say}”`] : [];
  if (step.kind === 'identify') return { title: `${who}: who are they?`, lines: [`Wake nobody yet. Ask who the ${who} is.`, `Tap ${step.count > 1 ? 'each player' : 'the player'} in the app.`] };
  if (step.kind === 'info') {
    return { title: `${who}: no choice to make`, lines: [...(call.length ? call : [`${who} wakes only if the script says so.`]), 'Nothing to tap but the Done button. Read the lines on screen.'] };
  }
  if (step.type === 'execCheck') return { title: `${who}: show the card`, lines: [...call, 'Tap Show card, then show them the card.', 'Close the card and tap Done.'] };
  if (step.type === 'investigate') return { title: `${who}: show the card`, lines: [...call, 'Tap the player they point to.', 'Then show them the result card. Do not say it aloud.'] };
  if (step.spent) return { title: `${who}: used up`, lines: [`${who} has no uses left.`, 'Tap Skip, and read the close-your-eyes line.'] };
  if (step.targets === 0) return { title: `${who}: yes or no`, lines: [...call, 'Tap their yes or no answer.'] };
  return { title: `${who}: pick a player`, lines: [...call, `Tap the ${step.targets > 1 ? `${step.targets} players` : 'player'} they point to.`, 'Give a nod so they know it was recorded.'] };
}

// help for the host's current screen. view = the host view; step = the night step the host is on (night only).
export function hostHelp(view, step = null) {
  const phase = view?.phase;
  if (phase === 'night' && step) {
    const s = stepHelp(step);
    return { title: s.title, lines: [...s.lines.slice(0, 2), 'The full night order is on the Game tab.'].slice(0, 3) };
  }
  if (phase === 'day' && view.report && view.report.night === view.night) return PHASE_HELP.morning;
  return PHASE_HELP[phase] || PHASE_HELP.lobby;
}

// The step the host is on: the same rule as the night screen (the focused step, else the first open one).
export function currentStep(view) {
  if (view?.phase !== 'night') return null;
  const n = S.ui.night || {};
  const steps = view.script || [];
  return steps.find((s) => s.key === n.focus) || steps.find((s) => s.kind === 'identify' || !n.actions?.[s.key]) || null;
}

const walk = () => S.ui.hhWalk;
// Rendered by host.js with the other overlays. First lobby visit opens the walkthrough once per device.
export function hostHelpOverlay(view) {
  if (!S.ui.hhAuto && view.phase === 'lobby' && !helpSeen(SEEN_KEY)) { S.ui.hhAuto = true; S.ui.hhWalk = { i: 0, dir: 1 }; }
  if (walk()) return walkthrough(WALKTHROUGH, walk().i, { dir: walk().dir });
  if (S.ui.hhSheet) return helpSheet(hostHelp(view, currentStep(view)), { icons: { x: ui('x') } });
  return '';
}
export const hostHelpButton = () => helpButton(ui('question'));
// A row for the settings sheet that replays the walkthrough.
export const hostHelpSettingsRow = () => `<div class="end-game"><button type="button" class="btn ghost" data-a="hhReplay">How hosting works</button></div>`;
export const hostHelpOpen = () => !!(S.ui.hhWalk || S.ui.hhSheet);

const done = () => { S.ui.hhWalk = null; markHelpSeen(SEEN_KEY); S.render(); };
export const HOST_HELP_ACTIONS = {
  openHostHelp() { S.ui.hhSheet = true; S.ui.anim = 'sheet'; S.render(); },
  closeHostHelp() { S.ui.hhSheet = false; S.render(); },
  hhReplay() { S.ui.hhSheet = false; S.ui.settings = false; S.ui.hhWalk = { i: 0, dir: 1 }; S.ui.anim = 'sheet'; S.render(); },
  hhNext() { const w = walk(); if (!w) return; if (w.i >= WALKTHROUGH.length - 1) return done(); S.ui.hhWalk = { i: w.i + 1, dir: 1 }; S.render(); },
  hhBack() { const w = walk(); if (!w) return; S.ui.hhWalk = { i: Math.max(0, w.i - 1), dir: -1 }; S.render(); },
  hhSkip: done,
};
