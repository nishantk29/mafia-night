# Mafia Night: handoff for the next agent

Read this before changing anything. Visual design (tokens, layouts, components) is in DESIGN.md. Running and deploying is in README.md. This file holds the product and rules decisions, the code's ground rules, and what is left to do.

## What it is

- **The game:** Nishant's own version of mafiarole.com / mafia.gg, for playing Mafia or Werewolf around a real table.
- **Who uses it:** one storyteller runs the game from their screen. Players get secret roles on their phones, or from a real deck of playing cards.
- **Live site:** https://mafia-app.hatethespurs.workers.dev, plus a 302 redirect from mafia.hatethespurs.com (set at Spaceship).
- **Backup:** private repo github.com/nishantk29/mafia-night, branch `main`.

## Architecture

- **Hosting:** Cloudflare Worker + SQLite-backed Durable Objects, one per room, using WebSocket hibernation. Static files are served as Workers Static Assets. Decision: stay on Cloudflare, not Railway. It's free, global, already works, and fits WebSocket rooms.
- **One shared engine:** `public/js/engine.js`, `room.js` and `roles*.js` are pure ES modules. The same code runs in the Worker (`src/worker.js`), in the browser for offline "Run the game on this device" mode, and in node tests. Never import browser or Worker APIs into them.
- **Projections:** `room.js` exports the reducer (`reduce(room, actor, action)`) and two views:
  - `viewForHost` (sees everything).
  - `viewForPlayer` (sees only what that player may know).
- **Client:** `app.js` (router, transport, action table, render loop), `host.js` (storyteller console), `player.js` (phone), `board.js` (table), `tools.js`, `theme.js`, `role_guide.js`, `faq.js`.
- **PWA:** cache-first service worker. `npm run deploy` stamps a new VERSION in `public/sw.js`, so clients update.

## Hard rules (break these and secrets leak or games break)

1. **Secrecy lives in the projections.** Anything added to `viewForPlayer` must contain only that player's own information. The secrecy suite (`test/room.test.js`) and `test/rules.test.js` must pass.
2. **Disguised roles never learn their true variant.** This is Nishant's explicit rule. It covers Insane, Confused, Naive and Paranoid Cop, the Miller, the Traitor, and every role with `seesAs`.
   - Phones, the card key, the Mafia team list, spoken night lines, blind-identify calls and the role guide all use `seesAs`. A disguised custom role is woken with the prompt of the role it thinks it is.
   - The table may know one of two Cops is fake, but never which.
   - The real result goes only to the storyteller, as a private note.
3. **Roles are data.** Behaviour comes from fields: `action {type, order, targets, uses, check, dead}`, `meeting`, `seesAs`, `appearsAs`, `night1`, `day/dayUses`, `onDeath/onCondemn`, `winsWith`, `sideWin`, `nightImmune`, `shield`, `retaliate`, `weight`. Add new roles in `roles_extra*.js`, never as special cases in the engine.
4. **Wake order matters.** The `action.order` bands are:

   | Order | What wakes |
   |---|---|
   | 5 | Night-1 info |
   | 10–14 | Jail and blocks |
   | 20–22 | Protects and guards |
   | 31 | Cult |
   | 40 | Frames |
   | 50 | Mafia team kill |
   | 50.5 | Janitor |
   | 53 | Vigilante |
   | 58 | Coroner and Vulture autopsy |
   | 59 | Wannabe |
   | 60–64 | Investigators, tracker and lookout |

   A test checks the whole catalogue's order. Keep it green.
5. **Night rules decided with Nishant:**
   - A team kill is carried out by one free member, so blockers, Lookouts and Veterans see one visitor. If one member is blocked, another carries it out. A lone blocked Mafia kills nobody.
   - Nobody can target themselves, except protectors (and the "Doctors can protect themselves" house rule can turn that off). The console never offers it, and `resolveNight` also drops such targets (and duplicate targets) if a request sends them.
   - Investigators get live results. `previewNight` dry-runs the night on a copy, using only the choices of roles that woke earlier: the steps before it in the script, so at the same wake order, the ones listed first. Coin-flip checks (random, fake) need the storyteller to tap "Flip a coin".
   - The morning report and the phone's results say exactly what was told live. So a Tracker or Lookout only sees visits by roles that woke before them (a Tracker following a Lookout sees them "stay home").
6. **Setup safety:** `setupWarnings` levels are error, warn and tip.
   - Errors block dealing: no Mafia, or Mafia already matching everyone else.
   - `balanceOf` / `rebalance` give a points balance, Ultimate-Werewolf style. "Suggest roles" always returns a balanced set: at most one of each special role, and between 1 and floor(n/3) Mafia.
7. **Themes are a display layer only.**
   - Rules and the catalogue are written once, in Mafia words. `theme.js` renames text after each render (`themeDom`), and in toasts and tooltips.
   - Theme ids are `city` (Mafia) and `village` (Werewolf). Never use `mafia` or `werewolf` as theme ids: they are role ids, and the secrecy tests search for them.
   - Mark any element whose text must not be renamed with `data-raw`: player names in tools, and the theme picker labels.
   - Player names are protected inside sentences but not in role labels.
   - The plain role "Mafia" becomes "Werewolf" when it stands alone as a role label, and "Werewolves" when it means the team.
8. **House rules** live in `room.config.rules`, with defaults in `DEFAULT_RULES` in engine.js:
   - `revealOnDeath`, `selfProtect`, `firstNightKill`, `dayStart`.
   - `dayStart` is refused with a blind card deal, because night 1 is when the storyteller learns who is who.
   - The role guide reads the rules.
9. **Tools are local.** Timer, votes, pick, coin and dice live in `S.ui` on one device and are never sent to the room. Votes reset each day. The timer updates its own text through `tickTools`, without a full re-render.
10. **Rendering contract.**
    - `S.render()` rebuilds `#app` from template strings, then runs `themeDom`.
    - Renders are held while an input is focused or a seat is being dragged.
    - Buttons use `data-a="action"`, handled by the `A` table in app.js. Inputs use `data-i`.
    - Disabled controls use `aria-disabled` with a `data-why` toast. Keep this pattern.
11. **Never permanently delete files.** Archive to `.backups/` with a timestamp prefix.

## Features as of 2026-10-20

- **Three ways to play:** on phones; a real deck where players look up their card; or a real deck where only the storyteller learns who is who. Offline "on this device" mode makes zero network requests.
- **Storyteller console:**
  - Night script in wake order, with spoken lines and private notes.
  - Shoulder-tap hints when two players answer the same call.
  - Live investigator results, morning report, day voting, pending death triggers.
  - Seat drag-and-drop, plus Move left/right in the seat panel.
  - Big room code with a full-screen view.
- **Lobby:** role picker, balance meter with "Balance it for me", setup warnings, Mafia-or-Werewolf choice, house rules.
- **Phone:**
  - Role card, plus a "how to play" guide for that role: how you win, at night, by day, good to know.
  - Teammates, and night results the player was told (only behind "Show my role").
  - Private notes saved on that phone.
  - Coin and dice, and a leave-game link.
- **Tools (storyteller):** talk timer, vote counter with the majority line, random player, coin, dice.
- **Ways out:** start over (local mode), switch to phones, leave a game. There is also a FAQ page at `#/faq`.
  - The logo on every screen is labelled "Home". Going home keeps your seat or room.
  - The home page lists "Resume room" for rooms this device hosts and "Back to your seat in room" for rooms it joined (keys `mafia.host.*` / `mafia.player.*`). Links to closed rooms are dropped.

## How to verify (do all of this before deploying)

1. `npm test` runs the node tests: 301 on 2026-10-21, all must pass. `test/sim-oracles.test.js` plays 450 games in-process with the simulator's oracles.
2. `npx wrangler dev --port 8799 --ip 127.0.0.1`. Wrangler 4 and the simulator (global `WebSocket`) need Node 22+. If the machine has an older Node, `npm install --prefix .qa/node22 node@22` and put `.qa/node22/node_modules/node/bin` first on `PATH` (`.qa/` is gitignored).
3. `BASE=http://127.0.0.1:8799 GAMES=100 node scripts/sim-games.mjs` simulates online games. 100 of 100 must be clean, and it must end with "roles dealt: 185 of 185". It covers:
   - weird names, all modes, varied house rules, reconnects, and secrecy checks;
   - every role dealt at least once;
   - console-like night choices (no self-targets, coin results passed);
   - rule oracles: the live preview matches the morning report, and an unframed, unblocked investigator gets the truth;
   - no disguised role's real name, id or blurb in any frame its phone is sent.

   `ONLY=<game>` replays one game; `SEED` changes the run. Roles are dealt by the server's own randomness, so a replay is close but not identical.
4. Browser checks: playwright-core with headless Brave (`/Applications/Brave Browser.app`). In a page, `await import('/js/state.js')` gives the live `S`, so `S.send(action)` drives the room. Check phone (390×844) and desktop (1280+) widths.
5. After deploying: `node scripts/live-smoke.mjs` against production.

## Deploy

- **Preferred: GitHub Actions.** Run `gh workflow run deploy.yml --repo nishantk29/mafia-night`, or use the Actions tab → Deploy → Run workflow.
  - It runs `npm test`, then `npm run deploy`, then the live smoke test.
  - It reads the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, so no 1Password is needed.
  - It runs only when started by hand, never on push. Only Nishant or his own Claude sessions start it; Grokbot doesn't deploy.
  - Watch it with `gh run watch`.
- **Fallback from the Mac:** run `npm run deploy` yourself. The Cloudflare token is in 1Password, vault Dev-Services: "Cloudflare API token and R2" (see README for the passwordless deploy command).
- Read it with `op item get "<name>" --vault Dev-Services --fields credential --reveal` (and `--fields "Account ID"`). The old Private item had a '+' in its name that broke `op read`; the renamed one doesn't.
- Pass it as an env var. Never print it or save it anywhere.
- If op says "authorization timeout", Nishant needs to unlock 1Password.
- Commit with a clear message and push to `main`.

## Done on 2026-10-21 (branch `grokbot/sim-upgrades`, PR #1; not merged, not deployed)

- **Simulator upgrades:** all five items. The pure parts are in `scripts/sim-lib.mjs`, shared with `test/sim-oracles.test.js`. Results:
  - 100 of 100 clean on seeds 1, 2 and 3.
  - All 185 roles dealt in each run.
- **Engine bugs it found, now fixed with regression tests:**
  - Trackers and Lookouts saw visits by roles that woke after them. The morning report and phone then contradicted what the storyteller had said live.
  - The Mafia team list showed a disguised teammate's real role, so a disguised custom Mafia role could learn its own variant from a twin.
  - Disguised custom roles were woken aloud by their real name.
  - Self-targets were only refused by the console, not by the engine.
- **Simulator races fixed** (they were never engine bugs):
  - Phone views compared before they caught up.
  - Join, claim and reconnect broadcasts mistaken for the reply to the host's next action.
  - Chained pending prompts.
- **Role gaps helper:** `node scripts/role-gaps.mjs` lists role names from mafia.gg (its app bundle) and mafiarole.com (role headings) that we don't have. It reads names only and never saves or prints descriptions.
  - `--save names.txt` keeps the fetched names.
  - `--offline --file names.txt` works from a saved or pasted list.
  - On 2026-10-21 it found 200 mafia.gg names we don't have, and none from mafiarole.com. Many are joke or site-specific roles: a human should pick.

## Open work (agreed or requested, not done yet)

- **New roles from the role-gaps list:** Nishant picks which names are worth adding, then they are written in our own words in `roles_extra*.js` (with icons, `npm run assets`). Never copy text from the source sites.
- **Full playability review** of every phase on phone and desktop, in both themes. This includes a browser check that the console's live "Tell them now" results still render: `roomFromView` moved from host.js to room.js.
- **Chat:** Nishant hasn't decided. The recommendation was no general chat for in-person play (it invites cheating), and maybe dead-player chat only. Ask him first.
- **Old questions for Nishant:** re-enable DNSSEC at Spaceship? Delete the unused pending Cloudflare zone? Ask; don't do either alone.
- **Local-mode privacy wording** (2026-10-21): local mode now says "Private to this device" in the appbar, with a note in the lobby. Check whether it's deployed by looking for that text on the live site.
- **Deploy:** production was last deployed from `main` at c585c3b (GitHub Actions run 39593454056, 2026-10-21). Everything from PR #1 (`grokbot/sim-upgrades`: simulator upgrades, engine fixes, role-gaps helper) is undeployed until it is merged to `main` and the Deploy workflow is run. Nishant wants one deploy at the end.

## Where memory lives

- Lore (Notion "Lore Vault") holds four memories under scope `mafia-app`:
  - Current state.
  - The disguised-roles rule.
  - The deploy runbook.
  - The hosting decision.
- The Notion Home → Projects row is "Mafia Night (mafia-app)". Update its Next action when work moves on.
