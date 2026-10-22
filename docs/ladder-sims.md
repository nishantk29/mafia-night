# Ladder simulations (easy to hard)

`LADDER=1 PER=5 SEED=<n> node scripts/sim-games.mjs` plays 40 online games: 5 at each size from 5 to 12 players, getting harder within each size.

| Tier | Setup |
|---|---|
| L0 classic | Mafia (1 per 4 players), Cop, Doctor, Villagers. App deal. |
| L1 standard | Godfather, Mafia, Cop, Doctor, Vigilante, Jester, Bodyguard, two Masons. App or claim deal. |
| L2 | A themed mix (blockers, investigators or killers). Any deal mode, with house-rule variation. |
| L3 | Third parties, converters, side wins or a Mafia-heavy table. All four house rules vary. |
| L4 | Everything: custom roles, random or same-role tables, all Mafia. Weird player names. |

Every game runs the same checks as the main simulator: no crashes, no secrecy leaks on any phone frame, and the rule oracles every night. Players act at random, the way a storyteller console allows. **This means the ladder can't catch engine rules bugs that need sensible play.** The known rule-2 engine issues (engine.js:387, roles.js:180) are not exercised.

Role coverage (185 of 185) is not checked in a ladder run, because the plain `GAMES=100` run covers that.

## Results (2026-10-21, Node 22.23.4, `wrangler dev` on 127.0.0.1)

Run on top of PR #1 (`grokbot/sim-upgrades` at 0e46664):

| Seed | Games | Clean | With problems | Exit | Winners |
|---|---|---|---|---|---|
| 1 | 40 | 40 | 0 | 0 | mafia 25, town 13, cult 2 |
| 2 | 40 | 40 | 0 | 0 | mafia 29, town 10, cult 1 |
| 3 | 40 | 40 | 0 | 0 | mafia 27, town 9, cult 3, killer 1 |

**That's 120 of 120 clean.** Each seed takes about 9 seconds. The largest frame was 8.0 KB, and the median host round-trip was 15 ms.

Wins by tier across all three seeds:

| Tier | L0 | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|
| Mafia | 16 | 17 | 14 | 16 | 18 |
| Town | 8 | 7 | 7 | 5 | 5 |
| Other | – | – | 3 | 3 | 1 |

Mafia wins about two thirds of games because random votes and random night picks favour the informed minority. That's expected for random play, not a balance finding. Reviewer's earlier run of the same script (on 94f1588) was also 120/120 clean. Seed 1 reproduced its winners exactly. Seeds 2 and 3 differ slightly, because the server deals with its own randomness.
