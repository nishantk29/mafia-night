// Graveyard chat: the dead and the Host talk here. The server only ever sends it to them (room.js messagesFor).
// The message list is patched in place while the input has focus, so new messages show without losing the typed text.
import { S, esc } from './state.js';
import { ui } from './ui_icons.js';

const list = (me) => (S.graveyard || []).map((m) => {
  const mine = m.from === me;
  return `<li class="gy-msg${mine ? ' is-mine' : ''}${m.from === 'host' ? ' is-host' : ''}${m.id > (S.gyShown || 0) ? ' gy-in' : ''}"><b class="gy-name">${mine ? 'You' : esc(m.name)}</b><span class="gy-text">${esc(m.text)}</span></li>`;
}).join('') || '<li class="gy-empty">Quiet down here. Say something.</li>';

const mark = () => { S.gyShown = S.graveyard?.at(-1)?.id || 0; };

export function graveyardPanel(me, host = false) {
  const html = `<section class="gy" aria-label="Graveyard">
    <h2 class="gy-title">${ui('skull')} Graveyard</h2>
    <p class="gy-sub">${host ? 'Only the dead and you can read this.' : 'Only the dead and the Host can read this.'}</p>
    <ol class="gy-list" role="log" aria-live="polite" data-gy="${esc(me)}">${list(me)}</ol>
    <div class="gy-form"><input class="gy-input" data-i="gyText" maxlength="280" autocomplete="off" enterkeyhint="send" aria-label="Message to the Graveyard" placeholder="Message the Graveyard" value="${esc(S.ui.draft.gyText || '')}"><button type="button" class="btn" data-a="gySend">Send</button></div>
  </section>`;
  mark();
  return html;
}

// Called instead of a full render while the Graveyard input is focused.
export function patchGraveyard() {
  const ol = document.querySelector('.gy-list'); if (!ol) return;
  const stick = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
  ol.innerHTML = list(ol.dataset.gy); mark();
  if (stick) ol.scrollTop = ol.scrollHeight;
}
export const scrollGraveyard = () => document.querySelectorAll('.gy-list').forEach((ol) => { ol.scrollTop = ol.scrollHeight; });
