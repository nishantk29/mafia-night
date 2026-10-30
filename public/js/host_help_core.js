// Host help, generic half: a "What do I do now?" bottom sheet and a first-time walkthrough. No game text and no
// imports, so another game can copy this file as is (see docs/host-help-pattern.md). The game supplies the words.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "Seen" flag, once per device. Storage can be blocked, so every call is guarded.
export const helpSeen = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
export const markHelpSeen = (key) => { try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ } };

// The (?) button: 44px via .icon-btn. `icon` is the already-rendered icon markup.
export const helpButton = (icon, label = 'What do I do now?', action = 'openHostHelp') =>
  `<button type="button" class="icon-btn host-help-btn" data-a="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`;

// The per-phase sheet. help = { title, lines[] }. `replay` is the label of the "show the walkthrough again" button.
export function helpSheet(help, { icons, replay = 'How hosting works', close = 'closeHostHelp', replayAction = 'hhReplay' }) {
  return `<div class="sheet-bg" data-a="${close}"><div class="sheet is-entering host-help-sheet" role="dialog" aria-modal="true" aria-labelledby="hh-title" data-stop>
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2 class="sheet-title" id="hh-title">${esc(help.title)}</h2><button type="button" class="icon-btn x-btn" data-a="${close}" aria-label="Close">${icons.x}</button></div>
    <ol class="hh-lines">${help.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    <div class="btn-row"><button type="button" class="btn ghost" data-a="${replayAction}">${esc(replay)}</button><button type="button" class="btn" data-a="${close}">Done</button></div>
  </div></div>`;
}

// The walkthrough: cards = [{ title, lines[] }], i = current card, dir = 1 forward / -1 back (for the slide).
export function walkthrough(cards, i, { dir = 1, label = 'How hosting works', close = 'hhSkip', next = 'hhNext', back = 'hhBack' } = {}) {
  const c = cards[i];
  const last = i === cards.length - 1;
  return `<div class="sheet-bg" data-a="${close}"><div class="sheet is-entering host-help-walk" role="dialog" aria-modal="true" aria-label="${esc(label)}" data-stop>
    <div class="sheet-grab"></div>
    <div class="hw-card" data-dir="${dir > 0 ? 'fwd' : 'back'}" data-i="${i}" aria-live="polite">
      <p class="hw-step">${i + 1} of ${cards.length}</p>
      <h2 class="hw-title">${esc(c.title)}</h2>
      ${c.lines.map((l) => `<p class="hw-line">${esc(l)}</p>`).join('')}
    </div>
    <div class="hw-dots" aria-hidden="true">${cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="btn-row hw-actions">${i > 0 ? `<button type="button" class="btn ghost" data-a="${back}">Back</button>` : `<button type="button" class="btn ghost" data-a="${close}">Skip</button>`}<button type="button" class="btn" data-a="${next}">${last ? 'Done' : 'Next'}</button></div>
  </div></div>`;
}
