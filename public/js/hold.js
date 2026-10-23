// Hold-to-reveal state machine for the private role card. No DOM in here, so it can be tested on its own.
// press() shows the card; release() hides it; the card also hides itself after maxMs even if still held,
// and cancel() (tab hidden, page leaving, window blur) hides it at once. One press = at most one reveal.
export function createHold(onChange, { maxMs = 3000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let shown = false; let pressed = false; let timer = null;
  const show = (on) => { if (shown === on) return; shown = on; onChange(on); };
  const stop = () => { if (timer != null) clearTimer(timer); timer = null; };
  return {
    get shown() { return shown; },
    get pressed() { return pressed; },
    press() { if (pressed) return; pressed = true; show(true); stop(); timer = setTimer(() => { timer = null; show(false); }, maxMs); },
    release() { pressed = false; stop(); show(false); },
    cancel() { pressed = false; stop(); show(false); },
  };
}
