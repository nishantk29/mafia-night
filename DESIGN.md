## Nishant's design rules (apply to every build)

- [ ] Film-noir art deco: Limelight display font; blood dripping from the letters of the Mafia wordmark.
- [ ] Animations 2x slower than default (`--dur-scale: 2`, `calc(<ms> * var(--dur-scale))`, `dur()`), smooth easing (no linear, no bouncy), `prefers-reduced-motion` respected, motion uses transform and opacity only.
- [ ] No generic AI look: no side-stripe cards (no `border-left` accents), no gradient-blob filler, no emoji confetti decoration, no hyphen breaks.
- [ ] Phone-first at 390px, tap targets 44px or more (48 preferred), ONE obvious primary action per screen; secondary actions go in a tidy menu.
- [ ] FAQ answers are short grouped lists, never walls of text; link text is descriptive, never a file name.
- [ ] Storyteller lines: clear "Say:" lines and big-caps check cards that read at a glance in a dark room.
- [ ] Nothing on screen leaks deaths or roles; host-private notes are visually marked private.
- [ ] Same look across all four sites (Mafia Night, Quest Night, The Gilded Chamber, The Odd Card) and the hub.
- [ ] Every UI change: check it against this list and take 390px screenshots.

## Historical spec (2026-10)

# Mafia Night: design spec

> Update: the display face is Limelight (art deco), restored after PR #32; Big Shoulders was dropped. References below are historical.

Owner: design lead. Builders: STYLES, LAYOUT, PWA (see section 13 for who owns which file).
Status: final direction for the redesign. Builders follow this document literally. Where it is silent, follow the
principles in section 3 and do not invent new colours, fonts, radii or icons.

Contents
1. What I saw (audit of the current build)
2. Design plan: first draft, self-review, final direction
3. Principles (the rules everything else follows)
4. Tokens: colour, type, spacing, radii, elevation, motion, z-index
5. Fonts
6. Responsive system and layouts per screen
7. The seating table (the bold element on the host side)
8. The role card (the bold element on the player side) and the one orchestrated motion
9. Lobby "How will you deal?" redesign (priority fix)
10. Components
11. Icons: UI icon set, emoji mapping, role icon swaps
12. Copy changes
13. PWA
14. File ownership and build order
15. Rendering constraints every builder must respect
16. DOM/class contract per screen
17. QA checklist

---

## 1. What I saw (audit of the current build)

Screens captured in local mode at 375, 768, 1024 and 1440 px wide (Claude browser pane; the Playwright MCP could not
start because Chrome is not installed at /Applications/Google Chrome.app).

Defects (fix as part of this work):
- **Phone tabs do nothing.** `.m-hide` is only defined inside `@media (min-width:1000px)`, so on phones every pane
  renders stacked (page was 2979px tall at 375px; tapping "Board" changed only the highlighted tab). Section 6.2
  replaces this mechanism.
- At 768px (iPad portrait) the host gets one 720px column with the table 1,500px down the page. Wasted width.
- At 1024 and 1440 the seats stay ~40px wide on a 540px table: names at 10 to 12px, unreadable from arm's length.
- "Who is who" roster renders twice on phones (once in the Game pane via `.m-only`, once in the Board pane).
- Card key rows truncate role names at 375px ("Godf...", "Body...", "Detec...").
- The joker card shows the 🃏 emoji instead of a card index.
- Morning report showed "Dee (Bodyguard) died protecting Jo." twice. This text comes from the engine (out of scope
  for this redesign; logged as an open issue, do not change engine.js).
- The lobby deal setup (section 9) is confusing, as the user said.

Looks cheap, cramped or wasted:
- Everything is the same rounded dark card with the same 1px grey border: lobby sections, night steps, report, roster.
  Nothing tells you what is an object, what is a section, and what is "now".
- Emoji as UI icons (🎬 🪑 📜 🎭 🌙 ☀️ 🗳️ 🤫 💀 🛟 🔁) render differently per OS and fight the game-icons role glyphs.
- Playfair Display + Jost is a stock "elegant" pairing; Jost at 13px muted grey is hard to read in a dark room.
- Tracked uppercase labels (TOWN 90, team tags, role-card name), middle-dot meta strings, "→" in results.
- The role card has three competing effects: deal-in flip on every render, pointer tilt, rainbow foil.
- 185 roles as ragged pills (Town 90, Mafia 57, Third party 38): long and hard to scan.
- The felt seating table is the one good idea in the current UI. Keep it and make it the centrepiece.

---

## 2. Design plan

### 2.1 Subject, audience, job
A social-deduction party game played in person, in a living room, at night with low light. One storyteller runs it from
a laptop, iPad or phone; players hold phones or a real deck of playing cards. The primary job: deal secret roles and let
the storyteller run each night quickly and confidently, reading prompts aloud without squinting.

Real-world sources: a card table under a single lamp; the wooden rail and green baize of that table; deluxe black
playing cards with brass foil; a theatre prompt book with numbered cues; Prohibition-era Chicago signage (the Mafia
side of the genre); a ballot passed hand to hand.

### 2.2 First draft (recorded so the review below is honest)
- Colour: full baize-green UI (#123326 background, #1B4535 panels), brass #D4A64A accent, card-red #D23A3A for Mafia,
  gold for Town (as now), violet for third party.
- Type: Limelight (art deco display) for headings, Playfair-style serif body.
- Layout: every section a rounded panel; two-column host at >=1000px; role card with foil and tilt kept.
- Icons: keep emoji in headings, add a few SVGs.

### 2.3 Self-review against the brief: what read as generic and what I changed
| Draft choice | Why it is generic or wrong for this brief | Change |
|---|---|---|
| Green baize everywhere | Every poker/casino app looks like this. Also green Town vs red Mafia fails for red-green colour blindness | Baize appears **only on the seating table**. The room is walnut brown (lamp-lit wood). Town is moonlight blue, so Town vs Mafia is blue vs red |
| Gold for Town and gold for buttons | Same colour meant "team" and "press here" | Brass only ever means "act here / this is now". Town gets its own colour |
| Limelight art-deco display | Theme-park kitsch; one weight; poor at small sizes | **Big Shoulders Display**: a condensed gothic drawn from Chicago signage, the city the Mafia genre comes from. Variable weight, readable from across a table |
| Serif or geometric body (Jost) | Geometric sans has closed apertures that blur at 13px on a dim phone | **Alegreya Sans** for UI and body (humanist, open, built for long reading), with **Alegreya italic** as the storyteller's spoken voice |
| Every section in a rounded card | The SaaS card kit | Only objects get boxes: cards, the table, seats, choices, dialogs. Sections are type and space |
| One radius everywhere | Same tell | Radius follows the object: controls 10px, playing-card objects 6% of width, panels 16px, status pills round |
| Foil + tilt + deal-in + transitions on every card | Scattered motion | One orchestrated moment: the role-card flip. Everything else moves only in answer to a tap |
| Uppercase tracked tags, middle-dot meta, arrows on buttons | Template chrome | Sentence case, separate meta elements, no arrows appended to labels |
| Emoji headings | Inconsistent across OSes; noisy | One UI icon set (Phosphor, bold weight). Game-icons only for roles. Headings carry no icons |

Accessory removed before shipping: the rainbow foil + pointer tilt on the role card (and its JS in app.js).

### 2.4 Final direction: "The card room after midnight"
Warm walnut darkness, one pool of green baize (the table), brass for whatever you can act on, and three team inks
(moonlight, rouge, velvet) that read in low light and are also told apart by shape. Headlines are Chicago signage
type; what the storyteller reads aloud is set in a calligraphic italic, like lines in a prompt book. The night script
is a numbered cue sheet because it really is a sequence. The role card is a deluxe black playing card that flips once.

---

## 3. Principles

1. **Only objects get boxes.** A box means "this is a thing you can hold or tap": a card, a seat, a choice, a dialog,
   the current night cue. Sections are headings plus space. Never wrap a section in a panel just to group it.
2. **Brass means act or now.** Primary buttons, the current night step, focus rings, the selected radio mark. Nothing
   decorative is brass.
3. **Team is colour plus shape.** Town: moonlight, solid edge. Mafia: rouge, double edge. Third party: velvet, dashed
   edge. Always with a word ("Town", "Mafia", "Third party") where space allows. Team colours appear on host screens
   and on the player's **own** card only (role secrecy).
4. **Read aloud = Alegreya italic.** Any line the storyteller says out loud uses the voice style. Nothing else does
   (exception: role blurbs on the player's card, which are the role's "line").
5. **Sequence gets numbers, nothing else does.** Night cues and seat order (in the seat list fallback) are numbered.
   Role lists, players and options are not.
6. **Phone in a dark room first.** Body 17px minimum on phones, no text below 14px, no grey below 4.5:1 for text,
   tap targets 44px minimum (48px for primary controls).
7. **One bold thing per screen.** Host: the table. Player: the card. Home: the wordmark. Everything else quiet.

---

## 4. Tokens (STYLES writes these on `:root` exactly)

### 4.1 Colour
Core palette (6 named colours):

| Token | Hex | Name | Use |
|---|---|---|---|
| `--room` | `#1B1410` | Walnut night | page background (lobby, day) |
| `--brass` | `#E0AE52` | Brass | primary action, current step, focus, selected mark |
| `--candle` | `#F1E6D2` | Candlelight | primary text |
| `--baize` | `#1F4A3A` | Baize | the seating table only |
| `--card` | `#F4E9D3` | Card stock | "face up" selected picks, playing-card faces in the card key and picker |
| `--rouge` | `#F26B66` | Rouge | Mafia team ink, death, destructive actions |

Full token set:
```css
:root{
  /* surfaces */
  --room:#1B1410;          /* lobby/day background */
  --room-night:#150F0C;    /* background during night phase (darker; the lamp is lower) */
  --panel:#251C16;         /* objects: choices, dialogs, sheet, collapsed steps */
  --panel-2:#31261E;       /* raised: current step, hovered choice, inputs */
  --rule:#4A3A2C;          /* dividers and unselected object edges (non-text, decorative-strength) */
  --rule-strong:#866D52;   /* input borders, ghost-button borders, unselected radio marks (3.75:1 on --room, 3:1 on --panel-2) */
  /* text */
  --candle:#F1E6D2;        /* body text, 14.7:1 on --room */
  --smoke:#BFAE95;         /* secondary text, 8.4:1 on --room, 6.8:1 on --panel-2 */
  --faint:#8C7A64;         /* disabled text and placeholders only (4.4:1); never for content */
  /* action */
  --brass:#E0AE52;  --brass-hi:#EBBE68;  --brass-lo:#B98A35;  --on-brass:#1B1410; /* 9:1 */
  --focus:#F7D58A;         /* focus ring, always outline-offset 2px so it sits on the background */
  /* objects */
  --card:#F4E9D3;  --card-ink:#1B1410;  --card-red:#B3262E;  /* playing-card faces */
  --lacquer:#20150F;       /* black-card stock for the role card */
  --baize:#1F4A3A;  --baize-lit:#2A5E4A;  --baize-deep:#143128;  --rail:#3A2A1C;
  /* teams */
  --town:#8DB6E8;   /* moonlight, 8.6:1 */
  --mafia:#F26B66;  /* rouge: 6.1:1 on --room, 5.6 on --panel, 4.96 on --panel-2 */
  --third:#B996F0;  /* velvet, 7.5:1 */
  --town-dim:#2A3A4E;  --mafia-dim:#4A2224;  --third-dim:#3A2E52;  /* team-tinted fills for chips/tiles */
  /* marker dots (user-defined meanings, keep vivid) */
  --d-red:#FF5A5F; --d-orange:#FF9F43; --d-yellow:#FFE066; --d-green:#5BD68A;
  --d-blue:#5AA9FF; --d-purple:#B48CFF; --d-pink:#FF85C8; --d-white:#F4F1EA;
}
html[data-phase="night"]{ --room:var(--room-night); }
```
Rules:
- No other hex values in styles.css except inside the role-card backdrop variables (section 8) and the dot colours.
- Never use pure `#000`/`#111`/`#0B0B0B` as a background. Shadows may use `rgba(8,5,3,.x)` (warm black).
- Disabled controls: `--panel-2` fill, `--faint` text, `--rule` dashed border. Not opacity alone.
- Status: "ok" uses `--town` text with a check icon; "warn" uses `--brass` text with a warning icon; "dead" uses
  `--mafia` with a skull icon. No green status colour (green is reserved for the baize).

### 4.2 Type scale
Ratio ~1.25 on phones opening to ~1.333 at 1440px. `rem` = 16px browser default; body is set larger than 1rem.
```css
:root{
  --font-display:"Big Shoulders Display","Arial Narrow",sans-serif-condensed,sans-serif;
  --font-ui:"Alegreya Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-voice:"Alegreya",Georgia,serif;  /* italic only */

  --fs-xs: .875rem;                                   /* 14px: meta, legend. Smallest size in the app */
  --fs-sm: clamp(.9375rem, .9rem + .15vw, 1rem);      /* 15-16px: secondary text */
  --fs-md: clamp(1.0625rem, 1rem + .25vw, 1.125rem);  /* 17-18px: body, buttons */
  --fs-lg: clamp(1.25rem, 1.12rem + .5vw, 1.5rem);    /* 20-24px: spoken lines, sub-headings */
  --fs-xl: clamp(1.625rem, 1.35rem + 1.1vw, 2.25rem); /* 26-36px: section titles (display face) */
  --fs-2xl: clamp(2.25rem, 1.7rem + 2.4vw, 3.75rem);  /* 36-60px: phase title, role name */
  --fs-3xl: clamp(3.25rem, 2rem + 6vw, 7.5rem);       /* 52-120px: home wordmark, room code */

  --lh-tight:1.02; --lh-head:1.12; --lh-ui:1.45; --lh-voice:1.5;
  --measure: 66ch;
}
```
Usage:
| Element | Family | Weight | Size | Notes |
|---|---|---|---|---|
| Home wordmark "Mafia Night" | display | 800 | `--fs-3xl` | `letter-spacing:-.005em`, `line-height:--lh-tight`, sentence case as written |
| Room code (lobby, join) | display | 700 | `--fs-3xl` (lobby: `--fs-2xl`) | `letter-spacing:.12em`, `font-variant-numeric:tabular-nums` |
| Phase title ("Night 2", "Morning of day 2") | display | 800 | `--fs-2xl` | |
| Section title (h2 `.block-title`) | display | 700 | `--fs-xl` | sentence case, `--lh-head` |
| Sub-heading (h3) | ui | 700 | `--fs-lg` | |
| Role name on role card | display | 800 | `--fs-2xl` | not uppercase |
| Spoken line (`.say`) | voice italic | 500 | `--fs-lg` (current step: `clamp(1.375rem,1.1rem+1.2vw,2rem)`) | `--lh-voice`, `max-width:--measure`, curly quotes in the copy |
| Body | ui | 400 | `--fs-md` | `--lh-ui` |
| Buttons | ui | 700 | `--fs-md` | sentence case |
| Secondary text `.muted` | ui | 400 | `--fs-sm` | colour `--smoke` (never 13px) |
| Meta, legend, tallies | ui | 500 | `--fs-xs` | `font-variant-numeric:tabular-nums` |
| Night cue numerals | display | 700 | `--fs-lg` | tabular |
| Card indices (A♠, 10♥) | display | 700 | per component | tabular |

Never: uppercase transforms, letter-spacing on body/labels, monospace anywhere, italic on UI text.

### 4.3 Spacing
`--s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px; --s8:72px;`
Page gutter: `--gutter: clamp(16px, 4vw, 40px)` plus safe-area insets (section 6.6).
Section rhythm: `--s7` between lobby sections on phone, `--s8` on >=1024. Inside a section: `--s3`/`--s4`.

### 4.4 Radii (by object, not one radius)
`--r-control:10px` (buttons, inputs, choices) · `--r-tag:8px` (role chips, tiles) · `--r-panel:16px` (dialogs,
sheet top corners, current step) · `--r-pill:999px` (status pills, legend, dots) ·
playing-card objects: `border-radius: 6% / 4.3%` of their own box (real poker-card proportions).

### 4.5 Elevation
No grey drop shadow under sections. Only lifted objects cast shadow, warm-black:
```css
--lift-1: 0 1px 0 rgba(8,5,3,.6), 0 6px 14px -8px rgba(8,5,3,.9);     /* seats, chips on felt */
--lift-2: 0 2px 0 rgba(8,5,3,.5), 0 18px 40px -16px rgba(8,5,3,.95);  /* role card, dialogs, sheet */
--lamp:   0 0 0 1px var(--brass), 0 0 48px -14px rgba(224,174,82,.45); /* the current night step only */
```

### 4.6 Motion
```css
--ease-out: cubic-bezier(.2,.7,.1,1);  --ease-in-out: cubic-bezier(.6,0,.3,1);
--t-press:90ms; --t-open:200ms; --t-reveal:650ms;
```
- Allowed: press feedback (`transform:translateY(1px)` on `:active`), hover colour change on pointer devices
  (`@media (hover:hover)` only), sheet/dialog open (gated, section 15), night step completing (gated), the role-card
  flip (section 8). Nothing animates on page load.
- `@media (prefers-reduced-motion:reduce)`: all transforms off; flip becomes a 120ms opacity cross-fade; durations 0
  for everything else.

### 4.7 Z-index
`appbar 20 · tabbar 25 · action-dock 22 · sheet/scrim 40 · dialog 45 · banner 50 · toast 60 · tip 80`.

---

## 5. Fonts

All OFL-1.1, self-hosted, verified on npm 2026-10-20 (`npm view <pkg> version license`).

| Family | Package (devDependency) | Version | File to copy -> `public/fonts/` | Weights used |
|---|---|---|---|---|
| Big Shoulders Display | `@fontsource-variable/big-shoulders-display` | 5.3.0 | `files/big-shoulders-display-latin-wght-normal.woff2` -> `big-shoulders-display-var.woff2` (35 KB) | 700, 800 (variable 100-900) |
| Alegreya Sans | `@fontsource/alegreya-sans` | 5.3.0 | `files/alegreya-sans-latin-{400,500,700,800}-normal.woff2` -> `alegreya-sans-{400,500,700,800}.woff2` (~24 KB each) | 400, 500, 700, 800 |
| Alegreya (italic only) | `@fontsource-variable/alegreya` | 5.3.0 | `files/alegreya-latin-wght-italic.woff2` -> `alegreya-italic-var.woff2` (44 KB) | 500 (variable 400-900) |

Total about 175 KB. `@font-face` (STYLES, top of styles.css):
```css
@font-face{font-family:"Big Shoulders Display";font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/big-shoulders-display-var.woff2) format("woff2")}
@font-face{font-family:"Alegreya Sans";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/alegreya-sans-400.woff2) format("woff2")}
/* ...500, 700, 800 the same pattern */
@font-face{font-family:"Alegreya";font-style:italic;font-weight:400 900;font-display:swap;src:url(/fonts/alegreya-italic-var.woff2) format("woff2")}
```
- Remove `@fontsource/playfair-display` and `@fontsource-variable/jost` from devDependencies (`npm uninstall -D`).
  Move the old `public/fonts/playfair-*.woff2` and `jost-var.woff2` to
  `.backups/<YYYYMMDD-HHMMSS>_old-fonts/` (never delete).
- PWA agent adds to index.html: `<link rel="preload" href="/fonts/alegreya-sans-400.woff2" as="font" type="font/woff2" crossorigin>`
  and the same for `big-shoulders-display-var.woff2`.
- Body: `font: 400 var(--fs-md)/var(--lh-ui) var(--font-ui); font-kerning:normal; text-rendering:optimizeLegibility;
  -webkit-font-smoothing:antialiased;` (antialiased keeps light-on-dark text from blooming).

---

## 6. Responsive system and layouts

### 6.1 Ranges
Fluid inside each range (clamp type, auto-fit grids, container queries). Page structure changes at three widths only:

| Range | Devices | Host console | Player | Home |
|---|---|---|---|---|
| < 640 | phones | one pane at a time, bottom tab bar | one column | one column |
| 640-767 | large phones, small tablets, phone landscape, iPad split view | same as phone, wider grids (3-col role grid, 3-col key) | one column, card max 360px | one column, wider |
| 768-1023 | iPad portrait (768/810/834), large phones in landscape | two columns: script / side (table or log via switch) | two columns: card / table | two columns |
| 1024-1439 | iPad landscape, laptops | two columns, side wider, side sticky | two columns | two columns |
| >= 1440 | desktops, wide laptops | three columns: script / table / roster+log | two columns, centred | two columns, centred |

Media queries used (exactly these): `(min-width:640px)`, `(min-width:768px)`, `(min-width:1024px)`, `(min-width:1440px)`.
Plus container queries on `.pane` and `.board` for internal component layouts.

### 6.2 Host console layout (replaces `.m-hide` / `.m-only` / `.col-main` / `.col-side`)
Markup (LAYOUT, host.js):
```html
<header class="appbar">...</header>
<main class="console" data-tab="game|table|log" data-side="table|log">
  <section class="pane pane-game" aria-label="Game">...phase content...
    <div class="action-dock">primary action of the phase</div>   <!-- always the LAST child of .pane-game -->
  </section>
  <div class="side">
    <div class="side-switch" role="tablist">  <!-- [Table] [Log] -->
      <button role="tab" aria-selected="true" data-a="side" data-v="table">{ui table} Table</button>
      <button role="tab" aria-selected="false" data-a="side" data-v="log">{ui log} Log</button>
    </div>
    <section class="pane pane-table" aria-label="Table">board + legend</section>
    <section class="pane pane-roster" aria-label="Who is who">roster</section>
    <section class="pane pane-log" aria-label="Log">log + side wins + storyteller tools</section>
  </div>
</main>
<nav class="tabbar">Game / Table / Log</nav>
```
CSS behaviour (STYLES):
- **< 768**: `.pane{display:none}`; `[data-tab=game] .pane-game`, `[data-tab=table] .pane-table`,
  `[data-tab=table] .pane-roster`, `[data-tab=log] .pane-log` are `display:block`. `.side-switch{display:none}`.
  Tab bar visible. `.action-dock` is `position:fixed; bottom:calc(64px + env(safe-area-inset-bottom))`, full width,
  `--room` background with a 1px `--rule` top edge; it hides with `.pane-game` on the other tabs for free.
- **768-1439**: `.console{display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,.9fr); gap:var(--s5)}`;
  at >=1024 `minmax(380px,1fr) minmax(440px,1.15fr)` with `gap:var(--s6)`. Width check (gutter = 4vw capped at 40px):
  768 -> 707px usable, columns ~360 + 323; 1024 -> 944px usable, needs 852; 1440 -> 1360px usable, three columns need
  1264. No horizontal scroll at any width from 360 up. `.pane-game` always shown; `.side` is
  `position:sticky; top:calc(var(--appbar-h) + var(--s4)); max-height:calc(100dvh - var(--appbar-h) - var(--s5)); overflow:auto`.
  Inside `.side`: `[data-side=table]` shows `.pane-table` and `.pane-roster`; `[data-side=log]` shows `.pane-log`.
  `data-tab` is ignored. Tab bar hidden. `.action-dock` becomes `position:sticky; bottom:0` inside the game column (`--room` background,
  padding `--s3` 0 `calc(var(--s3) + env(safe-area-inset-bottom))`).
- **>= 1440**: `.console{grid-template-columns:minmax(380px,1fr) minmax(520px,1.35fr) minmax(300px,.7fr);
  grid-template-areas:"game table roster" "game table log"; grid-template-rows:auto 1fr}`;
  `.side{display:contents}`; `.side-switch{display:none}`; all four panes visible; `.pane-table` sticky.
  Max width 1680px, centred.

Wireframes:
```
PHONE <768 (tab = Game, night)          TABLET 768-1023                     
+--------------------------------+      +------------------------------------------+
| [mask] Room ABCDEF   Night 1 ☾ |      | [mask] Room ABCDEF              Night 1 ☾ |
+--------------------------------+      +---------------------+--------------------+
| Night 1                        |      | Night 1             | [Table] [ Log ]    |
| Read each line aloud...        |      | 1 ● Doctor   done   |   .------------.   |
| (1)-Doctor            done     |      | 2 ◉ Mafia  <- lamp  |  /  seats on   \  |
| (2)=MAFIA====================  |      |   "Mafia, open..."  | |    baize      | |
|  | "Mafia, open your eyes..."  |      |   [Ann][Ben][Cy]    |  \            /  |
|  | [Ann ][Ben ][Cy  ]          |      | 3 ○ Cop             |   '-----------'   |
|  | [Dee ][Eli ][Fay ]          |      | 4 ○ Jester          | Who is who        |
| (3)-Cop                        |      |                     | Ann  Godfather    |
| (4)-Jester                     |      | [  Wake everyone up  ] dock (sticky)     |
| [    Wake everyone up     ]    |      +---------------------+--------------------+
+--------------------------------+
|  Game     Table     Log        |  <- tab bar, safe-area padded
+--------------------------------+

LAPTOP 1024-1439                               WIDE >=1440
+-----------------+--------------------+      +--------------+----------------------+-----------+
| script          | [Table] [Log]      |      | script       |     .-----------.    | Who is who|
| (cues)          |   .------------.   |      | (cues)       |   /   table      \   | Ann  God..|
|                 |  /   table      \  |      |              |  |   fills col    |  | ...       |
|                 |  \              /  |      |              |   \             /   +-----------+
|                 |   '------------'   |      |              |    '-----------'    | Log       |
|                 | Who is who         |      | [dock]       |  legend             | Tools     |
+-----------------+--------------------+      +--------------+----------------------+-----------+
```
Alignment: everything left-aligned (ragged right). Centred text only for: the home wordmark block on phones, the
table centre label, the role card, empty states. Column tops align to the first heading baseline.

### 6.3 Player layout
```html
<header class="appbar">mask · player name · phase badge</header>
<main class="seat-view">
  <section class="hand">role card or card picker or waiting state</section>
  <section class="table-side">shared board (no team colours) or player list, "What happened"</section>
</main>
```
- < 768: one column. `.hand` first, card `width:min(100%, 360px)` centred. Below: table, then "What happened".
- >= 768: `grid-template-columns:minmax(300px,420px) minmax(0,1fr); gap:var(--s7)`; `.hand` sticky.
- >= 1440: same, `max-width:1200px` centred.
- Player screens never render team colours or roles of anyone but the player. The board on player screens uses the
  neutral seat style (initials, no team edges). Do not add `a-town/a-mafia/a-third` to anything in player.js except
  the player's own card and teammates the server already sends in `me.team` (text only, no colours).

### 6.4 Home
```
PHONE                                  >=768
+--------------------------+           +--------------------------------------------------+
|  [fan of 3 card backs]   |           |  Mafia            |  Host a game                 |
|  Mafia                   |           |  Night            |  You'll be the storyteller.  |
|  Night                   |           |  (wordmark 120px) |  [   Host a game         ]   |
|  Secret roles for Mafia  |           |  Secret roles...  |  Resume room JRFVLS          |
|  and Werewolf...         |           |  [fan of cards]   |  ------------------------    |
|  [    Host a game     ]  |           |                   |  Join a game                 |
|  Resume room JRFVLS      |           |                   |  [ A B C D E F ] [Join]      |
|  Join a game             |           |                   |  ------------------------    |
|  [ABCDEF        ][Join]  |           |                   |  No phones? Run the game on  |
|  No phones? Run the game |           |                   |  this device with a deck.    |
|  on this device          |           |                   |                              |
|  credits                 |           |  credits                                         |
+--------------------------+           +--------------------------------------------------+
```
- Wordmark: "Mafia Night" in two lines, display 800, `--fs-3xl`, candle colour. No accent word.
- Fan: three role-card backs (section 8 back design), rotated -8°, 0°, 8°, static. This is the only decoration.
- Host is the primary action (brass button). Join is an inline code field + ghost button. Local is a text link with
  one line of description. These are three different weights, not three identical cards.
- Separators between the three paths are `--rule` 1px lines (they encode "or"), not boxes.
- Left column `align-self:center`; right column max 440px.

### 6.5 Board scaling: see section 7.

### 6.6 Safe areas and chrome
- `<meta name="viewport" ... viewport-fit=cover>` stays (PWA agent).
- `.appbar`: `padding: calc(env(safe-area-inset-top) + 10px) max(var(--gutter), env(safe-area-inset-right)) 10px max(var(--gutter), env(safe-area-inset-left))`.
- `.tabbar`: height 64px + `env(safe-area-inset-bottom)`.
- Page bottom padding on phones: `calc(64px + 72px + env(safe-area-inset-bottom))` (tab bar + dock).
- Toast: phones (host) `bottom: calc(64px + 72px + env(safe-area-inset-bottom) + 12px)`; player and >=768
  `bottom: calc(24px + env(safe-area-inset-bottom))`. Use `html[data-shell="host"]` to tell them apart.
- `--appbar-h: 56px` (STYLES sets; used for sticky offsets).

---

## 7. The seating table (host bold element)

The table is a felt ellipse inside a wooden rail, lit from above. It is the only baize in the app.

Markup (LAYOUT, board.js):
```html
<div class="board" style="--n:10" data-density="lg|md|sm|xs" data-host="1|0">
  <div class="table" aria-label="Seating, clockwise from the top">
    <div class="table-mid"><b class="table-phase">Night 1</b><span class="table-alive">8 alive</span></div>
    <button class="seat a-town is-dead is-selected" style="--x:50%;--y:9%" data-a="seat" data-id="..."
            aria-label="Ann, Godfather, dead">
      <span class="seat-card"><span class="seat-glyph">{role icon or initial}</span></span>
      <span class="seat-name">Ann</span>
      <span class="seat-dots"><i class="dot d-red"></i></span>
      <span class="seat-mark">{ui skull}</span>   <!-- only when dead -->
    </button>
    ...
  </div>
  <ol class="seatlist">  <!-- same seats, in seating order, for crowded tables on narrow screens -->
    <li><button class="seatrow a-town" data-a="seat" data-id="..."><span class="seatrow-n">1</span>
        <span class="seatrow-glyph">{icon/initial}</span><span class="seatrow-name">Ann</span>
        <span class="seatrow-role">Godfather</span><span class="seat-dots">...</span></button></li>
  </ol>
</div>
```
- Seat positions: LAYOUT computes x/y as now (percent of the table box, radius 41%) and writes them as `--x/--y`
  custom properties. CSS does `left:var(--x); top:var(--y); transform:translate(-50%,-50%)`.
- `data-density` keeps the existing thresholds: lg <= 12, md 13-18, sm 19-28, xs 29-50 (`MAX_PLAYERS` is 50).
- Unknown role and player screens: `.seat-glyph` shows the player's initial (first letter, display 700) instead of a
  generic person icon. Host with a known role: the role's game-icon in team ink.

Sizing (STYLES):
```css
.board{container:board/inline-size}
.table{container:table/inline-size;   /* seats size off the real table, not the column */
       position:relative; aspect-ratio:1; margin-inline:auto; border-radius:50%;
       width:min(100%, calc(100dvh - var(--appbar-h) - 140px));  /* stays a true circle when height is short */
       background:radial-gradient(ellipse at 50% 38%, var(--baize-lit), var(--baize) 55%, var(--baize-deep));
       border:clamp(8px,2.2cqi,16px) solid var(--rail);
       box-shadow:inset 0 0 0 2px rgba(255,220,160,.08), inset 0 18px 40px rgba(8,5,3,.55)}
.seat{--arc:calc(257cqi / var(--n));                     /* ring circumference 2*pi*0.41*W per seat */
      --seat:clamp(44px, calc(165cqi / var(--n)), 96px);  /* ~64% of the arc: leaves room between seats */
      width:var(--seat)}
.seat-card{width:var(--seat); aspect-ratio:5/6; border-radius:6% / 5%}
.seat-name{max-width:max(44px, calc(var(--arc) - 6px)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
```
- Portrait phones (`@container board (max-width:519px)`): `.table{aspect-ratio:4/5}` (an oval adds perimeter; seats
  stay >= 44px up to 18 players).
- Worked numbers (table width W): W=340, n=10 -> seat 56px, arc 87px; W=340, n=18 -> seat 44px, arc 49px (names
  ~5 characters); W=640, n=12 -> seat 88px, arc 137px; W=560, n=28 -> seat 44px, arc 51px; W=880, n=50 -> seat
  44px, arc 45px. These set the fallback thresholds below.
- Crowded tables fall back to the seat list, which keeps every target 48px tall:
  - `sm` (19-28): table if container >= 560px, otherwise `.table{display:none}` and `.seatlist{display:grid}`.
  - `xs` (29-50): table if container >= 880px, otherwise the seat list.
  - The seat list is `grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))`, numbered (seat order is a sequence).
  - At every other size `.seatlist{display:none}`.
- Seat names: `--fs-xs` at sm/xs, `--fs-sm` at md, `--fs-md` at lg. Max width is the arc (above), ellipsis; the full
  name is in the seat's `aria-label` and in the sheet.
  Names sit under the seat card on the felt in candle with `text-shadow:0 1px 2px rgba(8,5,3,.9)`.
- Seat card face: `--panel` fill, 2px edge. Team edges (host only): `.a-town` solid `--town`, `.a-mafia`
  `border:4px double var(--mafia)`, `.a-third` `2px dashed var(--third)`. Unknown: `--rule-strong` solid.
- `.is-dead`: the seat card shows the card-back pattern (section 8) at 60% opacity, glyph hidden, name in `--faint`,
  skull badge top-right (rouge). Do not grayscale-filter the whole seat.
- `.is-selected` (sheet open for this seat): brass 2px outline offset 3px + `--lamp` glow.
- `.table-mid`: phase in display 800 at `clamp(1.25rem, 6cqi, 2.75rem)` in candle; "8 alive" in `--fs-sm` smoke.
- Legend below the table: pills (`.lg`), `--fs-xs`, tap to rename.

---

## 8. The role card (player bold element) and the one orchestrated motion

A deluxe black playing card. Low luminance on purpose: a bright card face would light up a dark room and let the
neighbour read it.

```html
<div class="rcard a-mafia" data-face="front|back" (class "is-flipping" only on the reveal render)>
  <div class="rcard-inner">
    <div class="rcard-face rcard-front">
      <span class="rcard-index rcard-index-tl">{role icon}</span>
      <div class="cardart a-mafia">...existing procedural art (art.js) ...</div>
      <div class="rcard-body">
        <span class="team-tag a-mafia">{team mark} Mafia</span>
        <h2 class="rcard-name">Godfather</h2>
        <p class="rcard-blurb">You lead the Mafia...</p>
      </div>
      <span class="rcard-index rcard-index-br">{role icon}</span>
    </div>
    <div class="rcard-face rcard-back" aria-hidden="true"><span class="rcard-back-mark">{brand mask}</span></div>
  </div>
</div>
<div class="dossier">   <!-- outside the card: target, teammates, known Mafia -->
  <p class="note">Your team: <b>Ben</b> (Mafia)</p>
</div>
<button class="btn big" data-a="reveal">Show my role | Hide my role</button>
```
- Proportions: `aspect-ratio:63/88`, `width:min(100%,360px)` (420px at >=1024). Radius `6% / 4.3%`.
- Front: `--lacquer` stock; 1px brass hairline frame inset 10px (`box-shadow: inset 0 0 0 10px var(--lacquer),
  inset 0 0 0 11px rgba(224,174,82,.55)`); team colour carried by the glyph ink, the corner indices and the art tint
  (keep the existing `--c1/--c2/--c3/--ray/--ink/--glow` variables per team; recolour town to moonlight:
  `--c1:#2C4466;--c2:#16233A;--c3:#0C121D;--ink:#D7E6FA;--glow:rgba(141,182,232,.55)`).
- Corner indices: role icon 22px in team ink, top-left upright, bottom-right rotated 180°, like a real card.
- Name: display 800 `--fs-2xl`, candle. Team tag: sentence case word + team mark (solid/double/dashed 10px ring),
  `--fs-sm` 700, team ink. Blurb: voice italic `--fs-md`, smoke, max 30ch.
- Back: lacquer with a fine brass lattice (`repeating-linear-gradient(45deg, rgba(224,174,82,.10) 0 1px,
  transparent 1px 9px)` both directions) inside the same hairline frame, brand mask 40% width in brass. Used for:
  the hidden role card, home fan, dead seats, the "waiting" state.
- **The one orchestrated moment.** On tapping "Show my role" the card turns over: `.rcard-inner` rotates
  `rotateY(180deg -> 0)` over `--t-reveal` with `--ease-out`, with a single brass glint (a 30%-wide diagonal
  highlight) sweeping once across the front during the last 250ms. "Hide my role" turns it back with no glint
  (200ms). Both faces are always in the DOM; `data-face` sets the resting state; the keyframe runs only when
  `.is-flipping` is present (see section 15 for gating). Reduced motion: 120ms cross-fade, no glint.
- Removed: `.foil`, pointer tilt, `data-tilt`, `--rx/--ry/--mx/--my`, and the `dealin` animation on insert.

---

## 9. Lobby "How will you deal?" redesign (priority)

### 9.1 Problem recap
Rows 2-3 had no question; selected and unselected both looked like buttons; the dependency on "physical deck" was
invisible; option names were jargon ("Classic key (Ace♠ = Mafia...)").

### 9.2 The guided choice
Each decision is a plain question. Options are radio cards: a radio mark, a title, and one line saying what actually
happens at the table. Defaults are pre-selected and marked "Recommended". The card-flow question appears only under
the deck option, visually nested and connected to it. The card-key choice sits behind "More card options".

**Live room (host on a room code)** — `c.mode` default `app`, `c.cardFlow` default `blind`, `c.deckStyle` default `random`.

> **How do players get their roles?**
>
> (●) **On their phones** · *Recommended*
>     Everyone joins with the room code and sees their role in private.
>
> ( ) **From a deck of playing cards**
>     You hand out real cards. The app tells you which card is which role.
>
> &nbsp;&nbsp;&nbsp;│ **How does each player find out their role?** *(only when deck is selected)*
> &nbsp;&nbsp;&nbsp;│ (●) **They check the card key** · *Recommended*
> &nbsp;&nbsp;&nbsp;│     You show the key to the table and each player finds their card. You learn who's who on night 1 as each role wakes.
> &nbsp;&nbsp;&nbsp;│ ( ) **They enter their card on their phone**
> &nbsp;&nbsp;&nbsp;│     Each player taps their card on their own phone and sees their role in private. You see every role right away.
> &nbsp;&nbsp;&nbsp;│
> &nbsp;&nbsp;&nbsp;│ [More card options ▾]  Card key: new every game
> &nbsp;&nbsp;&nbsp;│   **Which card stands for which role?**
> &nbsp;&nbsp;&nbsp;│   (●) **A new key every game** · *Recommended*  Cards are matched to roles at random each deal, so nobody remembers last game's key.
> &nbsp;&nbsp;&nbsp;│   ( ) **The same key every game**  Each role keeps its usual card, such as the ace of spades for Mafia. Handy if your group plays often.

(The `·` above is only notation in this document; in the UI "Recommended" is a separate tag element.)

**Local mode (`#/local`, one device, no phones)** — mode is forced to `cards` by app.js; do not ask question 1.
Show one sentence instead: "{ui cards} You're dealing a real deck of playing cards from this device." Then ask the
card-flow question as the top-level question (not nested), with local copy:
- **They check the card key** · Recommended — "You show the key to the table and each player finds their card. You
  learn who's who on night 1 as each role wakes."
- **You enter each player's card** — "Players show you their card in private and you record it. You know every role
  before night 1." (This is the existing `claim` flow; the host assigns cards from the list on the dealt screen.)
- "More card options" as above.

No change to room.js/engine semantics: the same `setConfig` keys and values are sent.

### 9.3 Markup contract (LAYOUT)
Use buttons, not native radios (see section 15: native inputs defer rendering and double-fire delegated clicks).
```html
<section class="block deal-setup">
  <h2 class="block-title" id="q-mode">How do players get their roles?</h2>
  <div class="choices" role="radiogroup" aria-labelledby="q-mode">
    <button type="button" class="choice" role="radio" aria-checked="true"
            data-a="cfg" data-k="mode" data-v="app">
      <span class="choice-mark" aria-hidden="true"></span>
      <span class="choice-icon">{ui device-mobile}</span>
      <span class="choice-text">
        <span class="choice-title">On their phones <span class="choice-tag">Recommended</span></span>
        <span class="choice-desc">Everyone joins with the room code and sees their role in private.</span>
      </span>
    </button>
    <button type="button" class="choice" role="radio" aria-checked="false" data-a="cfg" data-k="mode" data-v="cards">
      ... {ui cards} From a deck of playing cards ...
    </button>
  </div>
  <!-- only when mode === 'cards'; directly after the group so it hangs under the deck option -->
  <div class="followup">
    <h3 class="followup-q" id="q-flow">How does each player find out their role?</h3>
    <div class="choices" role="radiogroup" aria-labelledby="q-flow"> ...blind / claim choices (data-k="cardFlow")... </div>
    <button type="button" class="disclosure" aria-expanded="false" aria-controls="more-deck"
            data-a="toggleUi" data-k="dealMore">
      {ui caret-down} More card options <span class="disclosure-value">Card key: new every game</span>
    </button>
    <div class="disclosure-body" id="more-deck" hidden>
      <h3 class="followup-q" id="q-key">Which card stands for which role?</h3>
      <div class="choices" role="radiogroup" aria-labelledby="q-key"> ...random / fixed (data-k="deckStyle")... </div>
    </div>
  </div>
</section>
```
- Local mode: replace the first `h2` + group with `<p class="deal-fixed">{ui cards} You're dealing...</p>`, and the
  `.followup` gets the extra class `followup--top` (not indented, its `h3` styled like the `h2`).
- `S.ui.dealMore` (boolean) holds the disclosure state; `toggleUi` flips `S.ui[el.dataset.k]` and re-renders.
  `aria-expanded` and `hidden` follow it. Rotate the caret 180° when expanded (no transition needed).
- Arrow keys inside a `radiogroup`: LAYOUT adds a keydown handler in app.js: Left/Up and Right/Down move focus to the
  previous/next `[role=radio]` in the same group and click it. Tab moves into the checked one only
  (`tabindex="0"` on the checked radio, `-1` on the others).

### 9.4 Styles (STYLES)
- `.choices{display:grid; gap:var(--s2)}`, always stacked one per row at every width (two-up would put the deck
  option on the right and the follow-up line would hang under the wrong parent). Max width `40rem`.
- `.choice`: full-width, text-left, `display:grid; grid-template-columns:24px auto 1fr; gap:var(--s3);
  align-items:start; padding:var(--s4); min-height:64px; border-radius:var(--r-control);
  background:var(--panel); border:1px solid var(--rule); color:var(--candle)`.
- `.choice-mark`: 22px circle, `border:2px solid var(--rule-strong)`, margin-top 2px.
- `.choice-title`: ui 700 `--fs-md` candle. `.choice-desc`: ui 400 `--fs-sm` smoke, `max-width:52ch`.
- `.choice-tag`: inline, `--fs-xs` 500, `--brass` text, `border:1px solid var(--brass-lo)`, `--r-pill`,
  padding 1px 8px, sentence case "Recommended", margin-left `--s2`.
- `.choice-icon`: 24px UI icon in smoke; brass when checked.
- **Selected** (`.choice[aria-checked="true"]`): `background:var(--panel-2); border:2px solid var(--brass);`
  padding reduced by 1px to keep size; `.choice-mark` becomes a brass ring with a 10px brass centre dot
  (`box-shadow: inset 0 0 0 4px var(--panel-2); background:var(--brass); border-color:var(--brass)`).
  Unselected stays quiet; it must not look like a button (no fill change on hover beyond `--panel` -> `--panel-2`
  on `(hover:hover)`).
- `.followup`: `margin:var(--s2) 0 0 27px; padding:var(--s3) 0 var(--s2) var(--s5);
  border-left:2px solid var(--brass)`. 27px = choice padding 16 + border 1 + half the 22px mark, minus 1px for half
  the line, so the brass line drops from the centre of the deck option's radio mark (the selected state keeps the same
  geometry: 2px border, 15px padding). The line *is* the dependency. `.followup-q`: ui 700 `--fs-lg` candle.
- `.followup--top`: no margin/border/padding-left; `.followup-q` uses the `.block-title` style.
- `.disclosure`: text button, smoke, ui 500 `--fs-sm`, 44px tall, icon + label; `.disclosure-value` in `--smoke`
  at `--fs-xs` after a `--s2` gap (it states the current choice so hosts who never open it still know).
- Use attribute selectors for state, never `.on` combined with element selectors, so nothing cancels out.

### 9.5 QA for this section
At 390px and 1440px: each group has a question above it; exactly one option per group shows the brass border and
filled mark; follow-up appears only after choosing the deck and is connected by the brass line; in `#/local` question
1 is absent; "More card options" shows the current key choice while closed; keyboard: Tab reaches each group once,
arrows change the choice, focus ring visible.

---

## 10. Components

### 10.1 App bar `.appbar`
`position:sticky; top:0`; `background:color-mix(in srgb, var(--room) 92%, transparent); backdrop-filter:blur(10px);
border-bottom:1px solid var(--rule)`. Left: `.appbar-mark` (brand mask 24px brass, links to `#/`), then
`.appbar-title` (ui 700 `--fs-md`): "Room <b class="code">ABCDEF</b>" / "On this device" / player name. Right:
`.phase-badge` (ui 700 `--fs-sm`, candle, icon + text, `--r-pill`, `--panel` fill, 1px `--rule`): moon icon for
night, sun-horizon for day, cards for lobby/dealt, crown for over.

### 10.2 Tab bar `.tabbar` (phones only)
Three equal buttons, 64px tall, icon 24px above label `--fs-xs` 500. Inactive: smoke, bold-weight icon. Active
(`aria-current="page"`): brass label, **fill** icon variant, 2px brass bar on the top edge of the button. Background
`--panel` with 1px top `--rule`.

### 10.3 Side switch `.side-switch` (768-1439)
Segmented control, 44px, two buttons, `--r-control`. Selected (`aria-selected="true"`): `--panel-2` fill + candle
text + brass 2px underline. Unselected: smoke text, transparent.

### 10.4 Buttons
| Class | Look | Use |
|---|---|---|
| `.btn` | brass fill, `--on-brass` text, ui 700, `--r-control`, min-height 48px, padding 0 20px | the one primary action in view |
| `.btn.ghost` | transparent, 1.5px `--rule-strong` border, candle text | secondary |
| `.btn.danger` | `--mafia` fill, `--on-brass` text | confirmed destructive (Condemn Ann, Eliminate) |
| `.btn.ghost.danger` | transparent, 1.5px `--mafia` border, `--mafia` text | destructive secondary (Abandon game) |
| `.btn.big` | full width, min-height 56px, `--fs-md` 800 | phase actions in the dock |
| `.btn.disabled` / `[aria-disabled=true]` | `--panel-2` fill, `--faint` text, 1.5px dashed `--rule` | still clickable: shows its reason as a toast (existing behaviour) |
| `.icon-btn` | 44x44, transparent, smoke icon 20px; hover candle | remove, close, info |
| `.link` | text, smoke, underline offset 3px | change, skip |
Icons in buttons sit before the label, 20px, `gap:var(--s2)`. Hover (`hover:hover`): brass -> `--brass-hi`;
ghost border -> `--brass`. Active: `translateY(1px)`. Focus: `outline:3px solid var(--focus); outline-offset:2px`
on every focusable element via `:focus-visible`.

### 10.5 Inputs
`--panel-2` fill, 1.5px `--rule-strong` border, `--r-control`, min-height 48px, `--fs-md` (>=16px avoids iOS zoom),
placeholder `--faint`. Focus: border `--brass` + focus ring. Labels above, ui 500 `--fs-sm` smoke. Room code input:
display 700 `--fs-xl`, `letter-spacing:.3em`, uppercase is the data itself (codes are letters), centred.

### 10.6 Role chip `.rc`
Inline label for a role in running text (night steps, report, roster). `--r-tag`, padding 2px 10px 2px 6px,
`--fs-sm` 700, icon 18px. Team: text in team ink, fill `--{team}-dim`, edge style per principle 3 (1px solid town,
3px double mafia, 1px dashed third).

### 10.7 Role tiles (lobby catalogue)
Replace the ragged pills with a grid:
- `.role-filter` segmented: All, Town, Mafia, Third party, Yours (custom). `S.ui.roleTeam`. Team words in team ink.
- `.role-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr)); gap:var(--s2)}`.
- `.role-tile`: `--panel` fill, `--r-tag`, left edge 3px in team style (solid/double/dashed), min-height 52px.
  Contains `.role-add` (button: icon 24px in team ink + name ui 500 `--fs-sm`), and `.role-info` (44px icon button,
  `ph:info`). When count > 0: `.role-tile.is-picked` shows `.role-count` (brass circle, `--on-brass` text, 700) and
  the tile fill becomes `--panel-2` with a 1px brass outline.
- Above the catalogue, the hand you are building: `.deck-list` of `.deck-item` chips (role chip + stepper
  `[− n +]`, each stepper button 36px visible / 44px hit area). Empty: "Tap roles below to add them, or let the app
  suggest a balanced set."
- Tally `.tally` next to the "Roles" title: "10 of 10 roles" with check icon in moonlight when equal; "8 of 10
  roles" with warning icon in brass when short; "12 of 10 roles" in rouge when over.

### 10.8 Night cue sheet (the script)
```
 (1)  Doctor                         done: "Ann"
  |
 (2)  Mafia                          <- current: panel-2, --lamp, --r-panel
  |   "Mafia, open your eyes and choose who to kill."
  |   [Ann ][Ben ][Cy  ][Dee ]
  |   Pick 1 player · skip link
 (3)  Cop                            upcoming: one line, tap to open
```
- `.cues` is an `<ol>`; each `.cue` has a numeral marker `.cue-n` (32px circle, display 700) on a 2px vertical rail
  (`--rule`). States: done = brass fill numeral replaced by a check icon, rail segment brass; current = brass ring
  numeral, cue body is a panel with `--lamp`; upcoming = `--rule-strong` ring, body is one line (role chip + what
  happens: "Find who it is" / "Record their choice"), the whole row a 48px button.
- Current cue: spoken line in voice italic at the larger size; target picker `.pick` below.
- `.pick{display:grid; grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr)); gap:var(--s2)}`; `.pk` 48px,
  `--panel-2`, `--r-control`, ui 500 `--fs-md`. Selected (`aria-pressed="true"`): **face up**: `--card` fill,
  `--card-ink` text, 700. Dead or ineligible players are not rendered (as now).
- Done cue result: "Target: Ann" / "Skipped" / "On alert" / "Staying in", ui 700 candle, plus a `.link` "Change".

### 10.9 Morning report and vote (day)
- Phase title "Morning of day 2" (display). Events list `.events` (no box): each `.event` = 24px icon + text:
  death (skull, rouge icon), nobody died (sun-horizon), save (lifebuoy, moonlight), conversion (arrows-clockwise,
  velvet), note (info). Cause line in smoke below.
- "Tell these players in private" block: `.whisper` panel (an object: it is a slip you act on), `--panel`, 1px
  dashed `--rule-strong` edge, ear icon in the title row. Each item: names bold, role in smoke, message on next line.
- Vote: `h2` "Who does the town condemn?" + `.pick` grid (same face-up selection) + row: `.btn.danger`
  "{gavel} Condemn Ann" (disabled until chosen: "Choose who to condemn") and `.btn.ghost` "Nobody today".
- Day abilities: list rows with role icon, name, reminder text and a uses counter button "1 of 2 used".

### 10.10 Card key (dealt screen + "Show key to the table" overlay)
- `.keygrid{grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))}`; at < 400px container: one column so names
  never truncate. `.keyrow`: playing-card index chip `.pc` (card stock, `--card-ink` or `--card-red`, display 700,
  44x56px, radius `6%/5%`), role icon in team ink, role name (wraps, no ellipsis), team mark at the end.
- Jokers: `.pc` shows "Jkr" with a small joker glyph (game-icons `card-joker`), red or black ink. No emoji.
- Overlay (`.overlay.key-show`): full screen, `--room` background, title "Find your card. Keep it secret." in display
  `--fs-2xl`, grid at `minmax(14rem,1fr)` with `.pc` 64x88px and names at `--fs-lg` so the table can read it from
  their seats. Close button top-right (icon-btn) and a big "Done" button at the bottom.

### 10.11 Sheet (seat details) `.sheet`
- < 768: bottom sheet, `--panel`, top radius `--r-panel`, max-height 85dvh, grab handle (36x4px `--rule-strong`),
  scrim `rgba(8,5,3,.6)`.
- >= 768: docks to the **left** edge over the script column (the table stays visible on the right), width
  `min(420px, 46vw)`, full height below the app bar, right radius `--r-panel`, `--lift-2`; scrim transparent
  (clicking outside still closes). The selected seat shows `.is-selected` on the table.
- Content: title row (name display 700 `--fs-xl`, status pill), meta row as separate spans (role chip, "Card 9♥"),
  marker grid `.dots-edit` (2 columns phone, 4 columns >= 768; each `.dotbtn` 48px with dot + label; selected:
  `aria-pressed=true`, 2px candle edge), note input, role select (text only, no emoji), action row (Eliminate as
  `.btn.danger` / Bring back `.btn`, Rename `.btn.ghost`).
- Open animation gated (section 15): phone slides up 200ms; desktop slides in from the left 200ms.

### 10.12 Dialog `.modal` (custom role editor) and overlays
Phone: full-screen sheet. >= 768: centred, `max-width:600px`, `--r-panel`, `--lift-2`, `--panel`. Title display
`--fs-xl`. Field groups separated by `--s5`. Footer buttons right-aligned on >= 768 (Cancel ghost, Save role primary).

### 10.13 Tooltip `#tip`
Keep the id and positioning code. Style: `--panel-2`, 1px `--rule-strong`, `--r-tag`, `--lift-2`, max 320px,
`--fs-sm`. Header: role icon in team ink + name (ui 700) + team tag (sentence case, team ink, no caps).

### 10.14 Pills and status
`.pill`: `--r-pill`, `--panel`, 1px `--rule`, ui 700 `--fs-xs`, icon 14px. Variants `.pill.ok` (moonlight text),
`.pill.warn` (brass), `.pill.dead` (rouge). Never coloured fills.

### 10.15 Empty states (copy and layout)
Centred, icon 32px smoke, one sentence, and the next action as a button where one exists.
- Players: "Nobody's here yet. Share the code, or add names for people without phones."
- Log: "The log fills up once night 1 starts."
- Night with no actions: "No roles wake tonight. Wake everyone up when you're ready."
- Nobody to pick: "Nobody can be chosen right now."

### 10.16 Toast `#toast` and banner
Toast: `--card` fill, `--card-ink` text, ui 700, `--r-pill`, `--lift-2`; positions in 6.6. Banner (reconnecting):
fixed top under the safe area, `--panel-2`, brass text, wifi-slash icon: "Reconnecting to the room..."

### 10.17 Players list (lobby)
`<ul class="people">`, chips: name (ui 500), status icon (device-mobile in moonlight = connected phone; pencil in
smoke = added by you, `title="No phone: added by you"`; offline phone = device-mobile in faint), remove icon-btn.
Add form: textarea label "Add players without phones (one per line, or separated by commas)", button "Add players".

---

## 11. Icons

### 11.1 UI icon set
**Phosphor** via `@iconify-json/ph` 1.2.2, licence **MIT** (verified). Use the `-bold` variant for all UI icons and
the `-fill` variant only for the active tab. viewBox 256. Role icons remain game-icons (CC BY 3.0); the brand mark and
joker glyph also come from game-icons (`carnival-mask`, `card-joker`).

Generator: new `scripts/build-ui-icons.mjs` (LAYOUT) reads `node_modules/@iconify-json/ph/icons.json` and
`node_modules/@iconify-json/game-icons/icons.json`, writes `public/js/ui_icons.js`:
```js
// GENERATED by scripts/build-ui-icons.mjs. Phosphor icons (MIT); brand/joker from game-icons.net (CC BY 3.0).
export const UI = { 'moon': {vb:256, body:'...'}, 'brand': {vb:512, body:'...'}, ... };
export function ui(name, cls = '') { const i = UI[name]; if (!i) console.warn('ui icon missing:', name); return i ? `<svg class="ui-ico ${cls}" viewBox="0 0 ${i.vb} ${i.vb}" aria-hidden="true" focusable="false">${i.body}</svg>` : ''; }
```
STYLES adds `"icons:ui": "node scripts/build-ui-icons.mjs"` to package.json scripts in its single package.json
edit (LAYOUT never edits package.json; it can always run `node scripts/build-ui-icons.mjs` directly). The generator
exits non-zero on unknown names. CSS: `.ui-ico{width:1.25em;height:1.25em;flex:none;fill:currentColor;vertical-align:-.22em}`.

Keys (key -> source icon). Every `-bold` and `-fill` name below was checked against the ph `icons.json` (width
256) on 2026-10-20. Templates may only call `ui()` with these keys:
`brand`->game-icons:carnival-mask · `joker`->game-icons:card-joker · `game`->ph:cards-three-bold ·
`game-on`->ph:cards-three-fill · `table`->ph:users-three-bold · `table-on`->ph:users-three-fill ·
`log`->ph:scroll-bold · `log-on`->ph:scroll-fill · `moon`->ph:moon-stars-bold ·
`sun`->ph:sun-horizon-bold · `cards`->ph:cards-bold · `phone`->ph:device-mobile-bold · `skull`->ph:skull-bold ·
`shield`->ph:shield-bold · `save`->ph:lifebuoy-bold · `convert`->ph:arrows-clockwise-bold · `ear`->ph:ear-bold ·
`gavel`->ph:gavel-bold · `crown`->ph:crown-simple-bold · `trophy`->ph:trophy-bold · `user`->ph:user-bold ·
`question`->ph:question-bold · `check`->ph:check-bold · `x`->ph:x-bold · `plus`->ph:plus-bold ·
`minus`->ph:minus-bold · `pencil`->ph:pencil-simple-bold · `info`->ph:info-bold · `back`->ph:caret-left-bold ·
`caret-down`->ph:caret-down-bold · `copy`->ph:copy-bold · `warning`->ph:warning-circle-bold ·
`wifi-off`->ph:wifi-slash-bold · `eye`->ph:eye-bold · `eye-off`->ph:eye-slash-bold · `crosshair`->ph:crosshair-bold ·
`search`->ph:magnifying-glass-bold · `sparkle`->ph:sparkle-bold (Suggest roles).

### 11.2 Emoji -> icon mapping (by file and line in the current source)
| File:line | Now | Becomes |
|---|---|---|
| host.js:20 | 🎭 brand in header | `ui('brand')` in `.appbar-mark` |
| host.js:28 | 🎬 🪑 📜 tabs | `game`, `table`, `log`; active tab uses `game-on`, `table-on`, `log-on`; labels Game, Table, Log |
| host.js:44 | − (role minus) | `ui('minus')` in stepper |
| host.js:52 | ✎ added by you / ✕ remove | `ui('pencil')` / `ui('x')` icon-btn with aria-label "Remove Sam" |
| host.js:57 | 📱 🃏 | `ui('phone')`, `ui('cards')` in `.choice-icon` |
| host.js:62 | ♠ in "Classic key" | removed (new copy, section 9) |
| host.js:65 | ＋ New role | `ui('plus')` + "New role" |
| host.js:79 | 📱 in heading | removed (headings carry no icons) |
| host.js:84 | 🃏 in "Card key" heading | removed |
| host.js:91 | ← Back to setup | `ui('back')` + "Back to setup" |
| host.js:107 | ✕ clear card | `ui('x')` icon-btn, aria-label "Clear Sam's card" |
| host.js:124 | 🌙 Night heading | removed from heading; `ui('moon')` in phase badge |
| host.js:126 | 🛡️ shield note | `ui('shield')` |
| host.js:154 | ✓ done | `ui('check')` |
| host.js:162 | → result | removed; "Target: Ann" |
| host.js:182 | ☀️ Morning | removed from heading; `ui('sun')` in phase badge |
| host.js:183 | 💀 / ❔ / 🌅 | `ui('skull')` / `ui('question')` / `ui('sun')` |
| host.js:184 | 🛟 | `ui('save')` |
| host.js:185 | 🔁 | `ui('convert')` |
| host.js:187 | 🤫 | `ui('ear')` in the whisper slip title row |
| host.js:197 | 🗳️ | removed; `ui('gavel')` on the Condemn button |
| host.js:210 | 🕴️ 🏘️ 🏆 | `ui('crown')` 56px in the winning team's ink (rouge/moonlight/velvet; brass for "Nobody wins") |
| host.js:212 | ❔ 💀 🏆 | `ui('question')`, `ui('skull')`, `ui('trophy')` |
| host.js:220 | 👤 roster unknown | player's initial in `.rrow-glyph` |
| host.js:227 | 🌙 ☀️ • log | `ui('moon')` / `ui('sun')` / nothing |
| host.js:228 | 🏆 side wins | `ui('trophy')` |
| host.js:240 | 🦉 placeholder | keep (it is an example of what to type into the emoji field) |
| app.js:29 | 😵 fatal | `ui('warning')` 40px |
| app.js:43 | 🎭 home hero | the three-card fan (section 6.4); no emoji |
| player.js:10, 23 | 🎭 header | `ui('brand')` |
| player.js:20 | 🎭 lobby waiting | a single card back (section 8), 120px wide |
| player.js:37, 56, 76 | 💀 | `ui('skull')` |
| player.js:39 | ♠ card back mark | brand mask (section 8 back) |
| player.js:48 | 🂠 waiting | card back |
| player.js:67 | 🃏 jokers | `.pcb` showing `ui('joker')` + "Red joker" / "Black joker" |
| player.js:75 | 🏆 / 🎭 over | `ui('trophy')` / `ui('crown')` |
| player.js:76 | ❔ | `ui('question')` |
| board.js:23 | 👤 / ✕ seat | initial / `ui('skull')` in `.seat-mark` |
| board.js:41 | `${x.emoji}` in role `<option>` | removed (options are text only) |
| board.js:45 | ✕ close | `ui('x')` icon-btn aria-label "Close" |

Custom roles have no game-icon: `ico()` keeps its emoji fallback (`.emo-fb`) because the host typed that emoji.

### 11.3 Role icons to replace (PWA agent edits `public/js/role_icons.js`, then `npm run assets`)
All names verified in `node_modules/@iconify-json/game-icons/icons.json`, checked against the role blurbs, and
not already used by another role:

| Role id | Now | Problem | Use |
|---|---|---|---|
| insane_cop | police-officer-head | reads as the plain Cop | `potion-of-madness` (results come out backwards) |
| gallis | slipknot | duplicates the noose idea of Hangman (gibbet) and reads as a kill role | `achilles-heel` (one vote is enough to condemn you) |
| prophet | enlightenment | an open book; nothing about timing | `sands-of-time` (names a moment of the game) |
| creepy_girl | matryoshka-dolls | reads as souvenir dolls, not creepy | `haunting` (skull-headed spectre; distinct from medium's ghost and poltergeist's floating-ghost) |
| whisperer | thought-bubble | means "thinking", not whispering | `lips` (sends secret messages) |

---

## 12. Copy changes (LAYOUT applies; STYLES removes the uppercase rules)

Uppercase and tracking to remove (styles.css): `h4{text-transform:uppercase;letter-spacing}` (group headings),
`.al-tag{text-transform:uppercase}` (team tags), `.rc-name{text-transform:uppercase;letter-spacing}` (role card
name), `.code{letter-spacing:.14em}` stays only on room codes (data, not a label).

Middle dots, arrows and labels to rewrite:
| Where | Now | New |
|---|---|---|
| index.html `<title>` (PWA) | Mafia Night · Deal everyone in | Mafia Night |
| host.js:17 phase names | Lobby / Dealt / Night N / Day N / Game over | Setting up / Roles dealt / Night N / Day N / Game over |
| host.js:46 picked summary | "Mafia · Doctor · Villager ×2" | `.deck-list` chips with steppers (10.7) |
| host.js:53 | Add players by name (one per line or comma-separated) | Add players without phones (one per line, or separated by commas) |
| host.js:55 | Add | Add players |
| host.js:65 | Suggest for N players | {sparkle} Suggest roles for N players |
| host.js:66 | Tap roles to add them. Tap again for more copies. | Tap roles below to add them, or let the app suggest a balanced set. |
| host.js:70 | Deal roles / Need N more players / Pick N more roles | Deal roles / Add N more players / Pick N more roles / Remove N roles |
| host.js:79 | Roles are on the phones 📱 | Roles are on everyone's phones |
| host.js:85 | Show key to the table | Show the key to the table |
| host.js:92 | Start night 1 and learn the roles | Start night 1 |
| host.js:125 | Say each prompt aloud... | Read each line aloud. When a role wakes, tap who it is, then record what they do. |
| host.js:128 | Wake everyone up · resolve night | Wake everyone up |
| host.js:128 | Identify every role first / N steps left | Find every role first / N steps left (singular "1 step left") |
| host.js:139 | Identify: tap to open / Wake: tap to open | Find who it is / Record their choice |
| host.js:143 | Pick 1 · 1 chosen | Pick 1 player (live: "1 of 1 picked") |
| host.js:145 | Confirm 0/1 | Confirm Doctor |
| host.js:159 | " · N use left" | separate meta span: "1 use left" / "2 uses left" |
| host.js:162 | → Ann | Target: Ann (also "Skipped", "On alert", "Staying in") |
| host.js:162 | change | Change |
| host.js:172 | Nobody / skip | Skip, nobody tonight |
| host.js:182 | ☀️ Morning · Day N | Morning of day N |
| host.js:183 | Nobody died in the night. | Nobody died last night. |
| host.js:187 | Tell them quietly | Tell these players in private |
| host.js:197 | Vote / Tap the player the town condemns. | Who does the town condemn? (no helper line) |
| host.js:199 | Condemn / No one | Condemn Ann (disabled: "Choose who to condemn") / Nobody today |
| host.js:201 | Resolve the prompts above | Answer the questions above first |
| host.js:213 | New game · same players | New game with the same players |
| host.js:220 | " · note" in roster | separate `.rrow-note` span |
| host.js:224 | Seating / Tap a seat to mark it... | Table / Tap a seat to add markers, a note or a role. |
| host.js:227 | Nothing yet. | The log fills up once night 1 starts. |
| board.js:40 | — no role yet — | No role yet |
| board.js:44 | "Role · alignment · card X" | separate spans: role chip, "Card 9♥" |
| board.js:48 | Role (correct a mistake) | Role (fix a mistake) |
| player.js:20 | You're in, Sam / Waiting for the host to deal the roles. | You're in, Sam / Waiting for the storyteller to deal. |
| player.js:41 | Show my role / Hide my role | keep |
| player.js:46 | Find your card | keep; helper: "Find the card you were dealt in this key. The storyteller will call your role on night 1." |
| player.js:48 | Waiting for your role… | Waiting for the storyteller to deal. |
| player.js:68-69 | Which card did you get? / Pick a card / Use 9 of hearts | Which card did you get? / step 1 "Pick the suit", step 2 "Pick the number" / Show my role |
| app.js:58 toasts | Copied. | Join link copied |
| app.js:180 | Could not create a room. | Couldn't create a room. Check your connection and try again. |
| app.js:79 | Not connected yet. | Not connected to the room yet. Try again in a moment. |
| app.js:184 | Codes have 6 letters. | Room codes have 6 letters. |
| app.js:185 | Enter your name. | Type your name to join. |
| app.js home | Host a game (twice), Join, Run on this device | Host a game; Join a game / Join; "No phones? Run the game on this device" |

Action names stay consistent through a flow: "Deal roles" -> phase badge "Roles dealt"; "Save role" -> toast "Role
saved"; "Condemn Ann" -> log "Ann was condemned"; "Show the key to the table" -> overlay "Done".

Card picker (player.js) becomes two steps: `S.ui.claimSuit` holds the suit. Step 1: five 64px buttons (Spades,
Hearts, Diamonds, Clubs, Joker) with the suit symbol large in card ink. Step 2: ranks as card-stock `.pcb` buttons
in a `repeat(auto-fill,minmax(56px,1fr))` grid, plus "Change suit". Selected rank: brass 3px outline.

---

## 13. PWA

- `public/manifest.webmanifest`:
  ```json
  {"name":"Mafia Night","short_name":"Mafia Night","description":"Deal secret roles for Mafia and Werewolf to phones or a deck of playing cards, and run the night as storyteller.",
   "start_url":"/","scope":"/","display":"standalone","orientation":"any",
   "background_color":"#1B1410","theme_color":"#1B1410","categories":["games","entertainment"],
   "icons":[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},
            {"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},
            {"src":"/icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"},
            {"src":"/icons/favicon.svg","sizes":"any","type":"image/svg+xml","purpose":"any"}]}
  ```
- Icon concept: the brass carnival mask (game-icons `carnival-mask`, CC BY 3.0) on Walnut night `#1B1410`.
  `any` icons: a rounded square with a brass hairline inset frame like the role-card back, mask at 58% width,
  colour `#E0AE52`. Maskable 512: full-bleed `#1B1410`, no frame, mask within the central 60% (safe zone).
  `apple-touch-icon.png` 180x180: full-bleed like the maskable (iOS rounds corners itself). `favicon.svg`: mask in
  brass on a `#1B1410` rounded square (rx 22%), so it reads on light and dark tabs.
- Files: `public/icons/favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.
  Author the SVGs in `public/icons/` (keep sources), rasterise with a tool already on the machine (macOS `qlmanage -t
  -s <size>` renders SVG to PNG; no new npm dependency).
- index.html: `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="icon" href="/icons/favicon.svg"
  type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`,
  `<meta name="theme-color" content="#1B1410">`, `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, font preloads (section 5),
  `<title>Mafia Night</title>`, and register the service worker after load. Keep the existing SVG `<defs>` (grain,
  vignette) used by art.js.
- `public/sw.js`: versioned cache (`mafia-v<N>`); precache `/`, `/index.html`, `/styles.css`, all `/js/*.js`,
  `/fonts/*.woff2`, `/icons/*`; cache-first for those, network-first with cache fallback for navigations; **never**
  cache `/api/*` or `/ws/*`; delete old caches on activate. Local mode (`#/local`) must work fully offline after one
  visit.
- `src/worker.js`: only if needed, add `Cache-Control: no-cache` for `/sw.js` and the correct
  `application/manifest+json` type for the manifest. No game-logic changes.

---

## 14. File ownership and build order

Strict, no overlap:

| Agent | Owns (may edit) | Must not touch |
|---|---|---|
| STYLES | `public/styles.css`, `public/fonts/*`, `package.json` (devDependencies for fonts **and** `@iconify-json/ph`, plus the `icons:ui` script line), `package-lock.json`, the `// ---- fonts ----` block of `scripts/build-assets.mjs` | any JS, index.html |
| LAYOUT | `public/js/host.js`, `player.js`, `board.js`, `app.js`, `state.js`, new `public/js/ui_icons.js`, new `scripts/build-ui-icons.mjs` | styles.css, index.html, role_icons.js, engine/room/roles |
| PWA | `public/index.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `public/js/role_icons.js`, generated `public/js/icon_data.js` (via `npm run assets`), `src/worker.js` headers/routes only | styles.css, the other JS |

Nobody edits `engine.js`, `room.js`, `roles*.js`, or game logic in `src/worker.js`.

Order (only one agent runs npm install):
1. **STYLES first actions, in this order**: (a) `npm install -D @fontsource-variable/big-shoulders-display
   @fontsource/alegreya-sans @fontsource-variable/alegreya @iconify-json/ph`; (b) rewrite the `// ---- fonts ----`
   block of build-assets.mjs to the new file list (section 5); (c) copy the fonts and move the old woff2 files to
   `.backups/`; (d) only then `npm uninstall -D @fontsource/playfair-display @fontsource-variable/jost` and add the
   `icons:ui` script line.
2. LAYOUT writes code immediately, but runs `node scripts/build-ui-icons.mjs` only once
   `node_modules/@iconify-json/ph/icons.json` exists. LAYOUT never runs `npm install`.
3. PWA runs `npm run assets` only after the fonts block in `scripts/build-assets.mjs` references
   `big-shoulders-display` (the script also copies fonts, and would fail on the old Playfair/Jost paths once those
   packages are uninstalled). PWA never runs `npm install`.
4. Everyone: `npm test` (232 must pass) before reporting done. The tests cover only engine.js and room.js
   (`test/engine.test.js`, `test/room.test.js`); no UI copy or class names are pinned, so the copy changes in
   section 12 are safe.

---

## 15. Rendering constraints every builder must respect

1. **Whole-page re-render.** `S.render()` replaces `#app.innerHTML` on every view update. Consequences:
   - CSS transitions between states never run (the element is a new node). Do not design state transitions.
   - Keyframe animations on an element replay on every render. Therefore every entrance animation is opt-in by a
     class that LAYOUT adds **only on the render where the thing opened**: `S.ui.anim = 'sheet' | 'reveal' |
     'hide' | 'modal' | null`. LAYOUT sets it in the action handler (`seat`, `reveal`, `newRole`, `showKey`), the
     template adds `is-entering` (sheet/modal/overlay) or `is-flipping` / `is-unflipping` (role card) when it matches,
     and app.js clears `S.ui.anim = null` right after `$app.innerHTML = screen()` without re-rendering.
   - STYLES only animates `.is-entering` and `.is-flipping` / `.is-unflipping`. No `animation` on base classes.
2. **Render deferral.** `render()` is skipped while focus is in an INPUT/TEXTAREA/SELECT. So selections are buttons
   (`role="radio"`/`aria-pressed`), not native radios or checkboxes, except in the custom role editor (existing
   checkboxes there are fine).
3. **Delegated clicks.** Every action is `[data-a]` on a button or link. Never wrap a `[data-a]` element in a
   `<label>`.
4. **State in attributes.** Selected/active/expanded state is expressed with ARIA attributes (`aria-checked`,
   `aria-pressed`, `aria-selected`, `aria-current`, `aria-expanded`) or `is-*` classes. STYLES keys off those. The
   old `.on` class is retired.
5. **Shell attributes.** app.js sets on `<html>` each render: `data-phase` (`home|lobby|dealt|night|day|over`),
   `data-shell` (`home|host|player`).
6. **Focus survives re-renders.** Because `innerHTML` is replaced, focus is lost on every update unless restored.
   In `S.render()` (app.js), before replacing the markup, record the focused element's `data-a`, `data-k`, `data-v`,
   `data-id`, `data-key` (and `data-i` for inputs); after rendering, find the element with the same attributes and
   call `focus({preventScroll:true})`. Without this, radiogroup arrow keys, Tab order and night picking by keyboard
   all break. Add `Escape` to close the sheet, modal and key overlay.
7. **Stable ids.** `#app`, `#toast`, `#tip` stay.
8. **Specificity.** One class per component state; no `#id` or element-qualified selectors in components
   (`.choice[aria-checked="true"]`, not `section .seg button.on`). Utility classes (`.muted`, `.small`) never set
   margins.

---

## 16. DOM/class contract per screen

Notation: `{ui name}` = `ui('name')`; `{role}` = existing `ico(role)`; team modifier is always `a-town|a-mafia|a-third`
(host screens and the player's own card only).

### 16.1 Shared
```html
<header class="appbar">
  <a class="appbar-mark" href="#/" aria-label="Mafia Night home">{ui brand}</a>
  <div class="appbar-title">Room <b class="code">ABCDEF</b></div>
  <span class="phase-badge">{ui moon} Night 1</span>
</header>
<div class="banner" role="status">{ui wifi-off} Reconnecting to the room...</div>   <!-- when disconnected -->
<main class="wrap ...">...</main>
```
Section pattern (no box): `<section class="block"><header class="block-head"><h2 class="block-title">..</h2>
<span class="tally|pill">..</span></header> ... </section>`.
Box (object) classes: `.panel` (generic object surface), `.choice`, `.cue.is-current .cue-body`, `.whisper`,
`.sheet`, `.modal`, `.rcard`, `.seat-card`, `.role-tile`, `.pc`, `.pcb`.
Text helpers: `.muted` (smoke, `--fs-sm`), `.meta` (`--fs-xs` 500 smoke), `.say` (voice), `.code`.

### 16.2 Home (`main.wrap.home`)
```html
<main class="wrap home">
  <div class="home-hero">
    <div class="card-fan" aria-hidden="true"><span class="rcard-back"></span>x3</div>
    <h1 class="wordmark">Mafia<br>Night</h1>
    <p class="lede">Secret roles for Mafia and Werewolf, dealt to phones or a deck of playing cards. The app runs the night for you.</p>
  </div>
  <div class="home-paths">
    <section class="path path-host"><h2 class="path-title">Host a game</h2><p class="muted">You'll be the storyteller. Players join on their phones with a 6-letter code.</p>
      <button class="btn big" data-a="hostLive">Host a game</button>
      <a class="resume" href="#/host/JRFVLS">Resume room <b class="code">JRFVLS</b></a></section>
    <section class="path path-join"><h2 class="path-title">Join a game</h2>
      <div class="join-row"><label class="field"><span>Room code</span><input class="code-input" data-i="joinCode" ...></label>
      <button class="btn ghost" data-a="goJoin">Join</button></div></section>
    <section class="path path-local"><a class="path-link" href="#/local">No phones? Run the game on this device</a>
      <p class="muted">Use a deck of playing cards and this one screen.</p></section>
  </div>
  <p class="credits">...</p>
</main>
```
`.home` grid: one column < 768; `grid-template-columns:1.1fr minmax(320px,440px)` >= 768; `.path + .path` has a 1px
`--rule` top border and `--s5` padding (the rule means "or").

### 16.3 Host lobby (`.pane-game` content)
```html
<section class="block join-code">  <!-- live only -->
  <p class="muted">Players join at</p><div class="room-code code">ABCDEF</div>
  <p class="meta join-link">mafia.example/#/join/ABCDEF</p>
  <button class="btn ghost" data-a="copy" data-v="...">{ui copy} Copy join link</button>
</section>
<section class="block players"><header class="block-head"><h2 class="block-title">Players</h2><span class="tally">10</span></header>
  <ul class="people"><li class="person is-offline"><span class="person-name">Sam</span>{ui phone|pencil}<button class="icon-btn" data-a="rmPlayer" data-id aria-label="Remove Sam">{ui x}</button></li></ul>
  <label class="field">..<textarea data-i="names">..</textarea></label><button class="btn ghost" data-a="addNames">Add players</button>
</section>
<section class="block deal-setup">...section 9.3...</section>
<section class="block roles">
  <header class="block-head"><h2 class="block-title">Roles</h2><span class="tally" data-state="ok|short|over">{ui check} 10 of 10 roles</span></header>
  <div class="btn-row"><button class="btn" data-a="suggest">{ui sparkle} Suggest roles for 10 players</button>
    <button class="btn ghost" data-a="clearRoles">Clear</button><button class="btn ghost" data-a="newRole">{ui plus} New role</button></div>
  <ul class="deck-list"><li class="deck-item"><span class="rc a-mafia">{role} Mafia</span>
    <span class="stepper"><button class="icon-btn" data-a="subRole" data-id aria-label="One fewer Mafia">{ui minus}</button><b class="stepper-n">2</b>
    <button class="icon-btn" data-a="addRole" data-id aria-label="One more Mafia">{ui plus}</button></span></li></ul>
  <div class="role-filter" role="tablist"><button role="tab" aria-selected="true" data-a="roleTeam" data-v="all">All</button>...</div>
  <label class="search-field">{ui search}<input class="search" data-i="search" placeholder="Search roles"></label>
  <div class="role-grid">
    <div class="role-tile a-town is-picked" data-name="doctor" data-team="town">
      <button class="role-add" data-a="addRole" data-id="doctor"><span class="role-glyph">{role}</span><span class="role-name">Doctor</span></button>
      <span class="role-count">1</span>
      <button class="icon-btn role-info rc-i" data-a="info" data-id="doctor" aria-label="About Doctor">{ui info}</button>
    </div>
  </div>
</section>
<!-- action dock holds: <button class="btn big" data-a="deal">Deal roles</button> -->
```
LAYOUT updates app.js search filtering from `.rchip` to `.role-tile` (keep `data-name`), and keeps `.rc-i` on the
info buttons (tooltip code uses it). Team filter hides tiles by `data-team`.

### 16.4 Host dealt
```html
<section class="block"><h2 class="block-title">Card key</h2>
  <div class="keygrid"><div class="keyrow a-mafia"><span class="pc is-red">9♥</span><span class="key-glyph">{role}</span><span class="key-name">Godfather</span><i class="team-mark a-mafia" aria-label="Mafia"></i></div></div>
  <button class="btn ghost" data-a="showKey">{ui eye} Show the key to the table</button></section>
<section class="block"><h2 class="block-title">Deal the cards</h2><ol class="steps"><li>..</li></ol>
  <p class="muted">..</p><div class="assign"><div class="arow"><span class="arow-name">Sam</span><span class="pc">A♠</span><span class="rc a-town">..</span><button class="icon-btn" data-a="clearCard" aria-label="Clear Sam's card">{ui x}</button></div></div></section>
<!-- dock: <button class="btn ghost" data-a="undeal">{ui back} Back to setup</button><button class="btn big" data-a="startNight">Start night 1</button> -->
```
`.steps` is a real `<ol>` (it is a sequence): numerals in display 700 brass.

### 16.5 Host night
```html
<header class="phase-head"><h2 class="phase-title">Night 1</h2><p class="muted">Read each line aloud...</p>
  <p class="note is-warn">{ui shield} Virgin shield: nobody can be killed tonight.</p></header>
<ol class="cues">
  <li class="cue is-done"><span class="cue-n">{ui check}</span><div class="cue-line">..role chip.. <span class="cue-result">Target: Ann</span>
      <button class="link" data-a="undoStep" data-key>Change</button></div></li>   <!-- row itself is not clickable -->
  <li class="cue is-current"><span class="cue-n">2</span><div class="cue-body">
      <span class="rc a-mafia">{role} Mafia</span><span class="meta">Ann, Ben</span>
      <p class="say">“Mafia, open your eyes and choose who to kill.”</p>
      <div class="pick"><button class="pk" aria-pressed="false" data-a="pick" data-key data-id>Cy</button></div>
      <p class="meta">Pick 1 player</p><button class="link" data-a="skip" data-key>Skip, nobody tonight</button></div></li>
  <li class="cue"><span class="cue-n">3</span><button class="cue-line" data-a="focusStep" data-key><span class="rc a-town">{role} Cop</span><span class="meta">Record their choice</span></button></li>
</ol>
<!-- dock: <button class="btn big [disabled]" data-a="resolve">Wake everyone up</button> -->
```
Identify cues: same structure; picker + `<button class="btn" data-a="confirmId">Confirm Doctor</button>`.
Info cues: `.cue-body` with `.note` lines and `<button class="btn ghost" data-a="infoDone">Done</button>`.
Yes/no cues: `.btn-row` with the two buttons.

### 16.6 Host day
```html
<header class="phase-head"><h2 class="phase-title">Morning of day 1</h2></header>
<ul class="events"><li class="event is-death">{ui skull}<div><b>Dee</b> was the <span class="rc a-town">..</span><p class="meta">took the hit for Jo</p></div></li>
  <li class="event is-save">{ui save}<div>..</div></li></ul>
<section class="whisper"><h3 class="whisper-title">{ui ear} Tell these players in private</h3><div class="whisper-item"><b>Eli</b> <span class="muted">Cop</span><p>Jo is not Mafia.</p></div></section>
<section class="cue is-current pending">...pending prompts use the current-cue look...</section>
<section class="block vote"><h2 class="block-title">Who does the town condemn?</h2><div class="pick">..pk..</div>
  <div class="btn-row"><button class="btn danger" data-a="condemn">{ui gavel} Condemn Ann</button><button class="btn ghost" data-a="noCondemn">Nobody today</button></div></section>
<section class="block abilities"><h2 class="block-title">Day abilities</h2><div class="arow">..<button class="mini" data-a="useDay" aria-pressed>1 of 2 used</button></div></section>
<!-- dock: Start night 2 -->
```

### 16.7 Host over
```html
<section class="win a-mafia"><span class="win-mark">{ui crown}</span><h2 class="phase-title">Mafia wins</h2><p class="muted">reason</p></section>
<section class="block"><h2 class="block-title">Final roles</h2><div class="arow is-winner">..{role} <b>Ann</b> <span class="muted">Godfather</span> {ui skull if dead} <span class="meta">{ui trophy} reason</span></div></section>
<!-- dock: New game with the same players -->
```
`.win` is centred; the crown is 56px in the team ink (`.win.a-town` etc; no modifier = brass).

### 16.8 Table pane, roster pane, log pane
```html
<section class="pane pane-table"><header class="block-head"><h2 class="block-title">Table</h2></header>
  <p class="muted">Tap a seat to add markers, a note or a role.</p> {board()} <div class="legend">..lg..</div></section>
<section class="pane pane-roster"><h2 class="block-title">Who is who</h2>
  <ul class="roster"><li><button class="rrow a-mafia is-dead" data-a="seat" data-id><span class="rrow-glyph">{role or initial}</span>
    <span class="rrow-name">Ann</span><span class="rrow-role">Godfather</span><span class="rrow-note">claimed Doctor</span><span class="seat-dots">..</span></button></li></ul></section>
<section class="pane pane-log"><h2 class="block-title">Log</h2><ol class="log"><li class="logl">{ui moon}<span class="meta">1</span> text</li></ol>
  <section class="block">side wins</section><section class="block tools"><h2 class="block-title">Storyteller tools</h2>..</section></section>
```
`.rrow`: 48px row, 1px `--rule` bottom border (a divider between people; it encodes a list item boundary), dead rows
`--faint` name with skull.

### 16.9 Sheet, modal, key overlay
```html
<div class="sheet-bg" data-a="closeSheet"><div class="sheet is-entering" data-stop="1" role="dialog" aria-label="Ann">
  <div class="sheet-grab" aria-hidden="true"></div>
  <header class="sheet-head"><h2 class="sheet-title">Ann</h2><span class="pill dead">{ui skull} Dead</span>
    <button class="icon-btn x-btn" data-a="closeSheet" aria-label="Close">{ui x}</button></header>
  <div class="sheet-meta"><span class="rc a-mafia">..</span><span class="meta">Card 9♥</span></div>
  <div class="dots-edit"><button class="dotbtn" aria-pressed="true" data-a="tag" ..><i class="dot d-red"></i><span>Suspect</span></button></div>
  <label class="field">Note<input data-i="note" ..></label><label class="field">Role (fix a mistake)<select data-i="setRole">..</select></label>
  <div class="btn-row"><button class="btn danger" data-a="killp">Eliminate</button><button class="btn ghost" data-a="rename">Rename</button></div>
</div></div>
<div class="overlay" data-a="closeModal"><div class="modal is-entering" data-stop="1" role="dialog" aria-labelledby="m-title">..</div></div>
<div class="overlay key-show" data-a="hideKey"><div class="overlay-in" role="dialog">..keygrid..<button class="btn big" data-a="hideKey">Done</button></div></div>
```

### 16.10 Player
```html
<main class="wrap seat-view">
  <section class="hand">
    <!-- lobby -->   <div class="waiting"><span class="rcard-back"></span><h2 class="phase-title">You're in, Sam</h2><p class="muted">Waiting for the storyteller to deal.</p></div>
    <!-- role -->    ...section 8 markup... <div class="dossier">..</div> <button class="btn big" data-a="reveal">Show my role</button>
                     <p class="note is-out">{ui skull} You're out of the game. Stay quiet and enjoy the show.</p>
    <!-- picker -->  <section class="block card-picker"><h2 class="block-title">Which card did you get?</h2>
                     <div class="suit-pick"><button class="suit" data-a="pickSuit" data-v="S" aria-pressed>♠ Spades</button>..</div>
                     <div class="rank-pick"><button class="pcb" data-a="pickCard" data-v="AS" aria-pressed>A♠</button>..</div>
                     <button class="btn big" data-a="claim">Show my role</button></section>
    <!-- key -->     <section class="block"><h2 class="block-title">Find your card</h2><p class="muted">..</p>..keygrid..</section>
  </section>
  <section class="table-side">{board(v,false)} or <ul class="people">..</ul>
    <section class="block"><h2 class="block-title">What happened</h2><ol class="log">..</ol></section></section>
</main>
```
Join form: `<main class="wrap join"><h1 class="phase-title">Join room <span class="code">ABCDEF</span></h1>
<label class="field">Your name<input data-i="joinName"></label><button class="btn big" data-a="join">Join game</button></main>`.

### 16.11 Tab bar and dock
```html
<div class="action-dock"><button class="btn big" data-a="...">..</button></div>
<nav class="tabbar" aria-label="Sections"><button data-a="tab" data-v="game" aria-current="page">{ui game-on}<span>Game</span></button>
  <button data-a="tab" data-v="table">{ui table}<span>Table</span></button><button data-a="tab" data-v="log">{ui log}<span>Log</span></button></nav>
```
New `S.ui` fields (state.js): `sideTab:'table'`, `dealMore:false`, `roleTeam:'all'`, `claimSuit:null`, `anim:null`.
`S.ui.tab` values become `game|table|log` (was `board`).

---

## 17. QA checklist
- Widths 360, 390, 768 (portrait iPad), 1024 (landscape iPad), 1280, 1440, 1920: no horizontal scroll; host layout
  matches section 6.2 at each; phone tabs switch panes (the `.m-hide` defect is gone).
- Tables of 6, 12, 18, 24, 40 players at 390 and 1440: seats >= 44px or seat list fallback; names readable.
- Lobby deal setup per section 9.5, in live and local modes.
- Contrast: body text >= 7:1, secondary >= 4.5:1, focus ring visible on brass buttons and on dark surfaces.
- Keyboard: every action reachable; radiogroups use arrows; sheet/modal close with Escape (LAYOUT adds keydown).
- Reduced motion: no flips, no slides.
- Role secrecy: player screens show no team colours or roles except the player's own card and server-provided team.
- No emoji left in UI chrome (grep host/player/board/app for the characters in 11.2); no `text-transform:uppercase`
  in styles.css; no ` · ` joins in templates.
- `npm test`: 232 pass. PWA: Lighthouse installable; `#/local` works offline after one load.
- Screenshots: Playwright MCP needs Chrome (`npx playwright install chrome`); the Claude browser pane works with
  `resize_window` as a fallback.

---

## 18. Transit-style look, motion and Liquid Glass (supersedes the "no new radii/motion" rule in the intro)

The design freeze is lifted; the pre-redesign look is tagged `pre-transit-redesign`.

- **Look**: flat saturated blocks from the existing palette (phase header: brass by day, town blue at night; the win block takes the winner's team colour), 24 to 28px cards, pill buttons and picks, heavy type, big numbers (vote counts, timer). Springy presses use `--spring`.
- **Motion** (`public/js/fx.js`, `#fx` layer): role card deal pop and flip, night falling (moon, stars), day breaking (sun burst), pop-out reveal with a stamp for a vote or a kill, victory card, number tick. Only `transform` and `opacity` animate. `will-change` exists only inside animating classes. At most 18 particles per burst (8 on low-end). No idle loops: tilt comes only from a mouse pointer (never touch or motion sensors), throttled with rAF. Every one-shot overlay finishes within 600ms (victory card included); sheets enter in 220ms with no backdrop blur; nothing is tied to scroll. Effects never take input.
- **Switches**: `html[data-fx="off"]` (host appbar toggle, saved per device, or `prefers-reduced-motion`) skips all motion. `html[data-lite="1"]` (`hardwareConcurrency <= 4` or `deviceMemory <= 4`) uses flat 2D pops, fewer particles and solid backgrounds.
- **Liquid Glass** (`.glass`, `.sheet`, the Tools sheet, the main action button, victory buttons): blur(18px) saturate(1.5), thin light border, tinted by `--tint`, specular sheen that slides with the tilt. Blur is never animated. Not used on lists; `@supports` and low-end fall back to a solid 96% background.
- **Secrets**: the pop-out shows a role only if the viewer already sees it (`revealOnDeath`, `roleHidden`). The game-over event carries the team, the reason and, on a player's own phone only, `won`.
- **Game over**: the room sends `{type:'gameOver'}` to every socket right after the final view (`messagesFor` in `room.js`). The card has Play again (`playAgain`: back to the lobby with the same players) and Close, which reveals the final roles.
