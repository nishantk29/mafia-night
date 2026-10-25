# Host help pattern

Two things for the person running the game: a first-time **walkthrough** (3-4 cards) and a **"What do I do now?"**
bottom sheet on every host screen. Host only. Players never see either.

## Modules
- `public/js/host_help_core.js` (shared copy: `code-team/shared/host-help/host-help.js`). Generic, no imports, no game text.
  `helpButton(icon)`, `helpSheet(help, {icons})`, `walkthrough(cards, i, {dir})`, `helpSeen(key)`, `markHelpSeen(key)`.
- `public/js/host_help.js` (per game). The words and the UI state:
  - `WALKTHROUGH = [{ title, lines[] }]` (title in the display font, one or two lines each).
  - `hostHelp(view, step) -> { title, lines[] }`: pure. A phase map (`PHASE_HELP`) plus per-step text built from the
    game's own data (here: night step `kind`, `type`, `targets`, and the call line from `stepCues`). Import the game's
    strings, never copy them. 2-3 lines, no hidden info (only what the host screen already shows).
  - `hostHelpOverlay(view)`, `hostHelpButton()`, `hostHelpSettingsRow()`, `HOST_HELP_ACTIONS`.

## Wiring (host screen only)
1. Import from `host_help.js` in the host screen module.
2. Put `hostHelpButton()` in the host top bar (44px `.icon-btn`).
3. Render `hostHelpOverlay(view)` with the other overlays/sheets. It opens the walkthrough by itself the first time a
   host reaches the lobby (`localStorage` key `<game>.hostHelpSeen`, once per device).
4. Add `hostHelpSettingsRow()` to the host menu so the walkthrough can be replayed ("How hosting works").
5. Spread `HOST_HELP_ACTIONS` into the action table; close help first in the Escape handler.
6. Add both files to the service worker precache.

## State
`S.ui.hhWalk = { i, dir } | null`, `S.ui.hhSheet`, `S.ui.hhAuto` (auto-open already tried this page load).

## CSS
Copy the `/* host help */` block from `public/redesign.css`. It reuses `.sheet-bg`, `.sheet`, `.btn`, `.icon-btn`.
Durations are `calc(<ms> * var(--dur-scale))`; reduced motion removes the card slide.

## Tests (`test/host-help.test.js`)
- every phase in the game's phase set has help (derive the set from the room reducer);
- every night step kind and action type gets 2-3 lines that name the step's call;
- help text never contains a role name other than the step's own;
- the core file has no game text and no imports;
- seen flag set on finish/skip, replay resets;
- the player screen never contains the button, sheet or walkthrough markup.
