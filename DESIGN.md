# Mafia Night: design

Concept: **noir film night.** The host's phone is the director's script. A player's phone is a sealed envelope.
Black and blood red, one gold action, Limelight for the marquee, Rubik for everything you read.

The long 2026-10 spec (tokens, layouts per screen, DOM contract) is in git history: `git show 9bf5a48^:DESIGN.md`.

## House style (applies to every build)

- Film-noir art deco: Limelight display font; blood dripping from the letters of the wordmark.
- Animations 2x slower than default (`--dur-scale: 2`, `calc(<ms> * var(--dur-scale))`, `dur()`), smooth easing (no linear, no bouncy), `prefers-reduced-motion` respected, motion uses transform and opacity only.
- No generic AI look: no side-stripe cards, no gradient-blob filler, no emoji confetti, no hyphen breaks.
- Phone first at 390px, tap targets 44px or more, ONE obvious primary action per screen.
- FAQ answers are short grouped lists, never walls of text; link text is descriptive, never a file name.
- Nothing on screen leaks deaths or roles; host-private notes are visually marked private.
- Same family look across Mafia Night, Quest Night, The Gilded Chamber, The Odd Card and the hub.

## Rules

1. **Two fonts.** Limelight is display only: wordmark, titles, role names, big-caps check results, win headings, the host's "Say:" line. Rubik is everything else: all buttons, labels, tabs, errors, small headings, sheet titles that are sentences. Sentence case, letter-spacing 0, no uppercase transform on buttons or labels. No Alegreya, no Arial fallbacks.
2. **Colour and buttons.** Black and blood red base. Gold is the single accent, used for the ONE primary action per screen. Exactly three button looks: gold filled primary, outlined secondary, red-outlined danger (End game only; Condemn is a primary). Disabled is the secondary look at 50% opacity, never dashed. Labels never wrap (`white-space: nowrap`); if two buttons would not fit side by side, stack them full width (`.btn-row` does this under a container query). Primary 52px min, others 44px.
3. **Day and night are a world change.** Night: deep blue-black, vignette, faint moon. Day: warm sepia, low sunlight. Slow cross-fade at 2x. Same layout in both (no leaks). Every phone flips at the same moment, dead players included.
4. **The dead.** First screen says it plainly: "You're in the Graveyard", with a subtle desaturated ghost card. Graveyard chat is at the top. Never visible to living players.
5. **Host night script.** One step per screen. The "Say:" line is large Limelight; "Just for you" notes are small Rubik below. Progress is a thin bar or dots in the header, never a pill over content. One sticky gold primary at the bottom. The room code is its own tappable chip (tap shows full code and QR), never clipped. "Start night 1" is a full-width primary with a small secondary "Back to setup" above it.
6. **Check card.** Big caps result (MAFIA, NOT MAFIA, or the role) with one small line above: "Cop 1 checked Ben". Tap or long-press to close; soft fade in. Each Cop or Detective number is visually distinct.
7. **Setup.** Presets first ("Classic 7", "Chaos 10", Suggest). Then a compact "In this game" list with minus/plus steppers and a live balance meter (Town, Mafia, Neutral). The full role library lives in a searchable "+ Add role" sheet grouped by side. Setup fits about two screens.
8. **Declare winner.** Only sides actually in this game. Uniform full-width buttons; Draw is secondary.
9. **End screen.** No stale "You won, waiting for host" after the host ended the game. One cinematic winner reveal, then "The cast": every player and role revealed one by one at 2x. Restart is primary; "Change setup first" is a full-width secondary. One heading only.
10. **Errors and 404.** Noir "This page slipped into the shadows". Gold "Go to Game Night home" plus a secondary link to the game's home. Multi-line error text is Rubik sentence case.
11. **Family system.** `public/family.css` (an identical copy is shared by every game in the family) holds the shared tokens: spacing `--f-s1..8`, type `--f-fs-xs..3xl`, radii, `--f-btn-h` 52px, `--f-btn-h-sm` 44px, `--f-tap` 44px, header height, motion, plus `.f-btn`, `.f-btn--primary|secondary|danger`, `.f-header`, `.f-footer`. A site links it FIRST, then sets four hooks: `--f-accent`, `--f-display-font`, `--f-bg`, `--f-ink`. Mafia: gold on black, Limelight. Quest: navy, Cinzel. Gilded: orange, Limelight with its own treatment. Odd Card: its own. The hub is a shelf of boxed games: the same card shape per game, each in its own art. Existing class names (Mafia's `.btn`) keep working; restyle them to the three looks with the family tokens.
12. **Footer credit links** have a 44px tap height.

## Keep

Limelight wordmark with blood drips; 2x slower animations with smooth easing; reduced motion; grouped FAQ lists; descriptive link titles; no-AI-look polish.

## QA checklist

- [ ] 390px wide: no horizontal overflow, nothing clipped (room code, buttons).
- [ ] Every tap target is at least 44px (primary 52px). Footer credit links included.
- [ ] No button label wraps; side-by-side buttons stack at narrow widths.
- [ ] Only one gold primary per screen; danger appears only on End game.
- [ ] Only Limelight and Rubik load. No uppercase or letter-spacing on buttons and labels.
- [ ] Reduced motion: no animation; `data-fx="off"` too. Durations are `calc(<ms> * var(--dur-scale))`.
- [ ] No leaks: day and night, living and dead, host and player show the same layout and no role or death info.
- [ ] `node --test test/*.test.js` is green (`test/dur-scale.test.js` included).
- [ ] Screenshot review: capture every screen at phone and desktop widths and look at each one.
