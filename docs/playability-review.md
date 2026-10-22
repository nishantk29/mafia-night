# Playability review (2026-10-21)

Branch `grokbot/playability-review`, reviewed against `main` at c585c3b.

**Scope.** One full online game per theme (city, village) per viewport: phone (390×844) and desktop (1280×800). That's four games and 104 screenshots, covering home, lobby, join, deal (hidden and revealed, Mafia and town), night 1 and night 2 scripts (including the Cop's live "Tell them now" result), the morning report, day voting, condemn, and the end screens for the host, a winner and a loser. Each game had 5 phones and 1 offline player. They were driven with `wrangler dev` plus headless Chrome (playwright-core), following HANDOFF.md "How to verify" step 4.

**Evidence.** The screenshots and `observations.json` (console errors, horizontal overflow, tap targets under 44×44, theme-word leaks, investigator results per step) are kept out of git because they're about 20 MB. They're on the box at `/workspace/code-team/mafia-night/playability-shots/`, and the harness is `playability-shots.mjs` in the same folder. Screenshot names below are relative to that folder.

**Rule for fixes.** Nothing here changes the visual design. Each proposed fix keeps the current look (DESIGN.md) and only changes behaviour or layout where something is broken or easy to misuse. No app code is changed on this branch.

## Headline results

- **No breakage found.** There were no console errors, no failed requests and no horizontal overflow on any of the 104 screens. No theme-word leaks either: city never showed werewolf wording, and village never showed Mafia wording.
- **"Tell them now" renders** at every investigator step on both nights, in both themes and both viewports (8 of 8). Examples: city "Chen is MAFIA." / "Dev is NOT Mafia."; village "Dev is WEREWOLF." / "Fay is NOT a Werewolf." On main, `roomFromView` is still in `public/js/host.js`. PR #1 moves it to `public/js/room.js`, so **re-run this check after PR #1 merges** (task P0 below).
- One flow note from the harness: in one game the offline player drew the Cop, so the harness swapped roles (`setRole`) to keep a Cop on a phone. That's expected, not a bug.

## Findings

| # | Severity | Where | What happens | Screenshots |
|---|---|---|---|---|
| 1 | Medium | Day screen, host console: `public/js/host.js:459` (dock button) | **"Start night N" is the big primary button and can skip the vote.** It's only disabled while questions are pending. A storyteller who taps the big gold button before "Condemn" / "Nobody today" goes straight to night with no vote recorded. The vote buttons sit higher on the page and are smaller. | `city-phone-19-day1-vote-selected.png`, `village-phone-19-day1-vote-selected.png`, `city-desktop-17-day1-vote-selected.png` |
| 2 | Low–medium | Night console, investigator step: `host.js:357` markup, `public/styles.css:1038` (`.tell-say`) | **"Tell them now:" wraps into a narrow column** ("Tell / them / now:") beside the result. `.tell-say` is a flex row, so the bare text node becomes a flex item that shrinks to its min-content width. It's readable, but it's the line the storyteller reads aloud. | `city-desktop-11-night-n1-cop-tell-now.png`, `city-phone-11-night-n1-cop-tell-now.png`, `*-night-n2-cop-tell-now.png` |
| 3 | Low (unconfirmed) | Phone app bar, room code | **The room-code full-screen icon can get squeezed** by a long phase label, because the label pill and the Tools button share the row. The first pass reported it. On re-checking the saved 390 px screenshots, the row is tight but the icon still renders at full size with "Night 2", so this would only show up with longer labels or narrower phones (320–360 px). | `village-phone-21-night2-first-step.png`, `city-phone-22-night-n2-cop-tell-now.png` |
| 4 | Low (wording) | Investigator results: `public/js/engine.js:388`, `public/js/theme.js:15`, coin toast `public/js/app.js:331` | **Capitalisation is inconsistent:** "is MAFIA." vs "is NOT Mafia." (village: "WEREWOLF." vs "NOT a Werewolf."). The caps are deliberate emphasis for reading aloud, but the two halves don't match. | the `*-tell-now.png` screenshots, `*-day1-morning-report.png` |
| 5 | Low (design call) | Phone lobby, role picker | **The phone lobby is about 8,000 px tall**, because all 185 role tiles are listed. Picking roles on a phone means a lot of scrolling. | `city-phone-05-lobby-ready.png`, `village-phone-05-lobby-ready.png` |
| 6 | Low (a11y) | App bar and home footer: `.appbar-tools` (`styles.css:1065`), `.credits a` (`styles.css:325`) | **Small tap targets.** Tools is 44×40 (2 px under the 44×44 guideline). The credit links (game-icons.net, CC BY 3.0, Phosphor) are about 14 px tall. | `observations.json` → `smallTargets`, e.g. `city-phone-01-home.png`, `city-phone-04-lobby-waiting-player.png` |

## Proposed fix tasks

Each task is small, keeps the look, and needs `npm test` plus the 3-seed sim to stay green.

- **P0: re-check "Tell them now" after PR #1.** Re-run the harness on main once PR #1 has merged. The expected result is 8/8 rendered and no console errors. No code change unless it fails.
- **P1 (finding 1): guard "Start night" on the day screen.** Pick one of these (Nishant's choice; the look stays the same):
  - (a) Until a vote is recorded, the dock button reads "Record the vote first" and is disabled, the same way it already behaves for pending questions. "Nobody today" counts as a vote.
  - (b) Keep it enabled, but the first tap without a vote asks "Skip today's vote?" with a confirm.
  - The recommendation is (a), because it reuses the existing disabled state and wording pattern.
  - Add a host-console test, and have the sim keep calling `noCondemn`/`condemn` before `startNight`.
- **P2 (finding 2): stop the "Tell them now:" label from wrapping.** Wrap the label and result in one `<span>` inside `.tell-say` (or give the text `flex:1; min-width:0`), so the label and the result flow as one line of text that wraps normally. Fonts, colours and the icon don't change. Check on phone and desktop in both themes.
- **P3 (finding 3): keep the full-screen icon from shrinking.** First reproduce it at 320–360 px. Give it `flex-shrink:0` and let the phase label truncate with an ellipsis instead. No visual change at normal widths.
- **P4 (finding 4): consistent result wording.** This needs Nishant's OK on the wording. Options: "is MAFIA." / "is NOT MAFIA.", or "is Mafia." / "is not Mafia.", with village following the same pattern. Change `engine.js:388`, `theme.js` and the coin toast together, then update the tests that match the strings.
- **P5 (finding 5): shorter phone lobby.** This is a design call, so ask first. One option that keeps the tile look: collapse each faction group behind its existing heading on narrow screens (expanded on desktop), or show the selected roles first with "Show all roles" below.
- **P6 (finding 6): tap targets.** Set `.appbar-tools` `min-height:44px`. Give the credit links vertical padding (`padding-block:.9em` or `display:inline-block; min-height:44px; line-height:44px`) so they look the same but have a bigger hit area.

## Not covered (next pass)

These weren't covered: deck mode, single-device (local) mode, house-rule variations, tablet widths, reconnect and rejoin flows, real Safari/iOS, landscape, and screen readers. The screenshot harness can be extended for most of them.

## Related

- The test script on main (`node --test "test/**/*.test.js"`) passes 279/279 on Node 22 and 24, but fails on Node 20 ("Could not find test/**/*.test.js"). CI uses Node 24, so this only matters for local runs on Node 20.
- Main's simulator passed 100/100 in the playability run. Main's sim doesn't print the "roles dealt" line; that arrives with PR #1.
