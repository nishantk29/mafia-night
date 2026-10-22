# Agent-played games (T7), done with scripted agents, NOT Haiku

**Method.** The plan was 40 end-to-end games with one Claude Haiku agent per seat. Tonight Claude Code wasn't used at all, on Nishant's instruction, so **no language model played these games**. Instead, every seat is a **scripted heuristic agent** (`scripts/sim-agents.mjs`) that stands in for what a Haiku seat was meant to do:

- Each seat decides only from what **its own phone** was sent: its card (the disguise, if it has one), its team list, the Mafia list (for roles that see it) and its own investigation results. That mirrors the "one agent per seat, own context only" design. A seat without a phone (an offline player) knows only its card.
- **Night:**
  - The Mafia and other hostile roles never target a teammate, and go after anyone who accused them at the table.
  - Investigators pick someone they haven't checked yet.
  - Protectors cover a claimed investigator or a cleared player, otherwise themselves.
  - Town killers (Vigilante etc.) shoot only someone they have evidence against, and otherwise hold fire.
- **Morning talk:** an investigator with a guilty result usually says so (80%). A Mafia member whose teammate was named sometimes counter-accuses the accuser (60%).
- **Day vote:** everyone votes in a random order.
  - Townsfolk with evidence vote on it. Without evidence they follow the current leader or go with a hunch.
  - The Mafia agree on one target for the day.
  - The Jester votes noisily.
  - A clear leader with at least a third of the table is condemned; otherwise nobody is.

The storyteller then records what the agents chose. So every game still runs all of `sim-games.mjs`'s checks: no crashes, no secrecy leaks on any phone frame (rules 1 and 2), the rule oracles every night, refused illegal host moves, reconnects and host drops. Random revive/kill host moves are turned off in agent mode.

**Run:** `AGENTS=1 LADDER=1 PER=5 SEED=<n> node scripts/sim-games.mjs`, which plays 40 games, 5 at each size from 5 to 12, easy to hard (see `docs/ladder-sims.md`). Add `RESULTS=out.json` for per-game data.

## Results (2026-10-21, Node 22.23.4, wrangler dev, on `grokbot/edge-sims`)

| Seed | Games | Clean | Problems | Exit | Winners | Days condemned (of them Mafia) / nobody |
|---|---|---|---|---|---|---|
| 1 | 40 | 40 | 0 | 0 | mafia 27, town 10, cult 2, killer 1 | 95 (20) / 18 |
| 2 | 40 | 40 | 0 | 0 | mafia 29, town 9, cult 2 | 95 (20) / 23 |
| 3 | 40 | 40 | 0 | 0 | mafia 31, town 6, cult 2, killer 1 | 95 (17) / 20 |

**Result: 120 of 120 games clean.** That's the 40-game plan plus two extra seeds. There were no leaks, no stuck games, no wrong-phase transitions and no crashes. Every game ended with a winner (none hit the 25-round cap). Some games had the expected note "deal refused, then fixed", where the ladder's Mafia-heavy tables were trimmed so the deal is legal.

Wins by tier (all three seeds; average rounds):

| Tier | Mafia | Town | Other | Avg rounds |
|---|---|---|---|---|
| L0 classic | 17 | 7 | – | 4.0 |
| L1 standard | 18 | 6 | – | 4.1 |
| L2 | 17 | 3 | 4 | 3.9 |
| L3 | 17 | 5 | 2 | 3.3 |
| L4 | 18 | 4 | 2 | 3.2 |

## What this does and doesn't show

- **It shows** that the engine, server and phones stay correct and leak-free when roles act with intent: teammates spared, accusers targeted, coordinated votes. That's the bar the Haiku games were meant to clear.
- **It doesn't show game balance.** The Mafia winning about three quarters of games comes from these simple agents: the town has little to go on beyond one or two investigators, and the Mafia vote as a block. Real players (or Haiku agents) talk and read each other. Don't use these numbers to change role counts.
- **It doesn't exercise** the known rule-2 engine issues (engine.js:387, roles.js:180). Those need targeted tests (T6).
- If the real Haiku-per-seat run is still wanted, it's a separate, Claude-using job (earlier cap: $25 projected). It's not done.
