# Mafia Night

Secret roles for Mafia / Werewolf, dealt to phones, with a storyteller console that runs the night.

Live: https://mafia-app.hatethespurs.workers.dev

## Three ways to play
| Mode | How it works |
|---|---|
| **App deals to phones** | Host makes a room (6-letter code). Players join on their phones, no login. Each phone shows one secret role. |
| **Physical deck, "I'll learn who's who tonight"** | The app maps each role to a playing card (classic key or shuffled) and shows the key to the table. The storyteller deals face down without looking. On night 1, as each role is called, the storyteller taps who raised a hand; the app builds the cast as it goes. |
| **Physical deck, players look up on phones** | Same card key, but secret: each player enters their card on their phone and sees only their own role. |

"Run on this device" does the whole thing without a server: the game is stored only in that browser (`localStorage`) and nothing is sent anywhere. Once the site has been opened, the installed app also works offline.

The host can show the room code full screen (tap the code in the header). Players can leave a game from their phone, and an on-this-device game can be started over.

**Installable:** `manifest.webmanifest` and `sw.js` make it a web app you can add to a home screen. `npm run deploy` stamps a new cache version into `sw.js` automatically, so installed phones pick up each release.

## Storyteller console
Night script ordered by role, auto-resolution of kills, protects, guards, jails, blocks, frames, conversions and investigations; morning report with "tell them quietly" lines; pending triggers (Hunter, Poacher...); day-ability reminders; condemn; win checks (town, mafia with weights, serial killer, cult) plus side wins (Jester, Executioner, Survivor, Opportunist, Traitor).
**Seating board:** everyone around a table, 8 colored dots per player with editable meanings, ring color by team, notes, role correction, eliminate/revive.

## Roles are data, and growable
- 185 built-in roles: `public/js/roles.js` (core), `roles_extra.js` and `roles_extra2.js` (inspired by the wider Mafia / EpicMafia family, written in our own words). Add one with `R(...)` / `A(...)`, give it an icon in `role_icons.js`, run `npm run assets`; it shows up everywhere.
- **In-app role editor** ("＋ New role" in the lobby): name, emoji, team, a night action from the engine's supported types, uses, day reminder, condemn trigger, immunity, "looks like Mafia". Saved to the host's browser library and sent with the room (validated by `sanitizeRole`).
- Engine night actions: kill, protect, guard, alert, jail, block, blockVisitors, frame, clean, convert, copyRole, investigate (alignment/role/inverted/parity/fake), track, watch, autopsy. Anything else is a day reminder or a trigger the storyteller adjudicates.

## Artwork
- **Icons:** every role maps to a game-icons.net glyph (`public/js/role_icons.js`, generated into `icon_data.js` by `npm run assets`). Credit is shown on the home screen (CC BY 3.0: Lorc, Delapouite and contributors).
- **Procedural card art:** each role card is built in code: a team-tinted backdrop with a per-role pattern (sunburst / rings / art-deco fans), a vignette and the role's icon. The card flips once when revealed.
- **Interface icons:** Phosphor (MIT), generated into `public/js/ui_icons.js` by `npm run icons:ui`.
- **Painted portraits (optional):** `npm run art:brief` writes `art-source/BRIEF.md` (31 ChatGPT/Gemini prompts, 6 roles per image, most-used roles first). Save each image as `art-source/sheets/sheet-NN.png`, run `npm run art:slice -- art-source/sheets/sheet-NN.png`, then deploy. Portraits in `public/art/<roleId>.webp` replace the procedural art automatically.
- **Fonts:** Big Shoulders Display (headlines), Alegreya Sans (interface) and Alegreya italic (lines the storyteller reads aloud), self-hosted in `public/fonts`, copied from `@fontsource` by `npm run assets`.
- **Look and layout:** "the card room after midnight" (walnut and brass, green felt only on the table). The full spec is in `DESIGN.md`. Phones get one pane and a tab bar, tablets and laptops two columns, and wide screens three.

## Layout
```
public/            static site (index.html, styles.css)
public/js/engine.js   pure game logic (shared by worker, browser, tests)
public/js/room.js     room state, reducer, per-viewer projections (secrecy lives here)
public/js/roles*.js   role catalog + custom-role validation
src/worker.js         Cloudflare Worker + Room Durable Object (WebSockets, hibernation)
scripts/live-smoke.mjs  end-to-end + role-secrecy check against a running server
scripts/sim-games.mjs   plays many full online games with odd role mixes, names and reconnects, deals every role,
                        and checks the rule oracles (live results = morning report, honest checks, disguises)
scripts/sim-lib.mjs     the simulator's pure parts (coverage planning, console-like nights, oracles)
scripts/role-gaps.mjs   lists role NAMES from mafia.gg / mafiarole.com that we don't have yet, for review
test/                 301 unit tests (node --test), including the oracles over 450 in-process games
scripts/build-assets.mjs  icons, fonts, portrait manifest
scripts/art-brief.mjs, slice-art.mjs  ChatGPT/Gemini art workflow
```

## Run, test, deploy
```bash
npm install            # wrangler and the simulator need Node 22+
npm run dev            # http://localhost:8787
npm test               # unit tests
BASE=http://localhost:8787 node scripts/live-smoke.mjs   # needs `npm run dev` running
BASE=http://localhost:8787 GAMES=50 SEED=1 node scripts/sim-games.mjs   # 50 simulated online games (ONLY=7 replays one)
node scripts/role-gaps.mjs             # role names other sites have and we don't (names only)
node scripts/role-gaps.mjs --offline --file names.txt   # same, from a saved or pasted list (one name per line)
npm run deploy         # needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment
```
Usual way to deploy: `gh workflow run deploy.yml` (GitHub Actions: tests, deploy, live smoke test; the Cloudflare values are repo secrets, so no 1Password prompt).
Cloudflare token, account ID and R2 keys, and the Spaceship API key and secret, are in 1Password, vault **Dev-Services** (items "Cloudflare API token and R2" and "Spaceship API key"; moved from Private on 2026-10-21). Never commit them.

## Design notes / gotchas
- Free-plan Durable Objects must be SQLite-backed: migration uses `new_sqlite_classes`.
- One Room object per code (`idFromName`); state is persisted on every action and wiped by an alarm after 12 hours idle.
- A player's socket only ever receives their own role (plus teammates for Mafia/Masons/Cult). Dead players' roles become public unless the Janitor hid them. Checked by `test/room.test.js` and `scripts/live-smoke.mjs`.
- Custom roles register into a process-wide lookup under unguessable `c_xxxx` ids; built-in ids can never be overridden.
- Custom domain: `mafia.hatethespurs.com` is a 302 redirect set at Spaceship (DNS stays there, email untouched) to the `workers.dev` address. A true custom domain on the Worker would need the zone moved to Cloudflare.
- 1Password: the Cloudflare item was renamed to "Cloudflare API token and R2" (no `+`), so `op read` and `op item get --fields` both work now.
- **Deploy without typing a password:** any agent whose 1Password service-account token is set (`OP_SERVICE_ACCOUNT_TOKEN`, which can read the Dev-Services vault) can deploy:
  `export CLOUDFLARE_API_TOKEN=$(op item get "Cloudflare API token and R2" --vault Dev-Services --fields credential --reveal) CLOUDFLARE_ACCOUNT_ID=$(op item get "Cloudflare API token and R2" --vault Dev-Services --fields "Account ID") && npm run deploy`
  On the Mac the desktop app also works, but it can ask for approval; the service-account token never does.
- Win rules: mafia (weighted) >= everyone else with no killer/cult; killer wins on parity when no mafia/cult; cult wins when all alive are cult. If Mafia and Killer both remain, no auto-win: the storyteller can declare a winner.
