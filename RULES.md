# Mafia Night house rules and the tests that guard them

`build-deploy` runs the whole suite first (`scripts/test-gate.mjs`) and writes nothing if any test fails. Every rule below has a row here and a named test.
"Since" is the `nightVersion` that introduced the rule; a room keeps the version it was created with (rule 10). Latest is 8.
`rules-gate` = `test/rules-gate.test.js`. Test names are the exact `describe` / `test` strings.

| # | House rule (plain words) | Since | Test (file: describe → test) |
|---|---|---|---|
| R1 | Dead roles are called out loud exactly like living ones: same words, same cues, same place in the order. | v2 | rules-gate: `house rule: dead roles are called exactly like living ones` → `v2…v7: every night role has the same wording, cues and position dead or alive`. Also dead-roles-called, night-v3, audit-v7 `dead roles at night (v7)`. |
| R2 | Investigators get their answer only at night. Nothing in the morning report, the Host's day lists or any phone. Tracker, Lookout and Coroner too from v7. | v5 (Cop, Detective); v7 (Tracker, Lookout, Coroner) | rules-gate: `house rule: investigator results are given only at night` → `v5/v6/v7: Cop and Detective results never reach report.info, the morning notes or any phone`; `v7: Tracker, Lookout and Coroner are night-only too: no result anywhere`; `v7: the night check card still gives the result`. Also night-upgrade-v5, restart `v7 night-only Tracker, Lookout and Coroner`. |
| R3 | The Detective sees the exact role. The Godfather reads as a plain Villager to the Detective. | v1 exact; v6 Godfather | rules-gate: `house rule: the Detective sees the exact role; the Godfather reads as a Villager from v6` → `v4…v7: Detective sees VILLAGER/GODFATHER…`. Also godfather-detective-v6. |
| R4 | The Cop sees MAFIA or NOT MAFIA. The Godfather is NOT MAFIA. | v1 | rules-gate: `house rule: the Cop sees MAFIA or NOT MAFIA; the Godfather is NOT MAFIA` → `v1…v7: Mafia is MAFIA, Godfather and Villager are NOT MAFIA`. Also audit-v7 `Cop cards: alignment cards say MAFIA / NOT MAFIA, never the role`. |
| R5 | A dead Cop or investigator gets "No answer tonight." (card: NO ANSWER), whoever they ask about. | v3 | rules-gate: `house rule: a dead Cop or investigator gets "No answer tonight."` → `v3…v7: every dead investigator gets the same neutral answer for any target`. Also night-v3 `dead investigators get a neutral non-answer`. |
| R6 | Several Cops (or Detectives) are numbered 1..N at random, once each. The number stays for the whole game. The Say lines never name a variant (Insane, Naive, Confused...). | v7 | rules-gate: `house rule: Cops and Detectives are numbered 1..N (v7)` → `each label 1..N appears once…`, `numbers are random across games`, `stable within a game…`, `Say lines, cues and the then-lines never name a variant`, `v6 rooms do not number`. Also numbered-calls-v7, audit-v7 `Confused Cop is called exactly like the other Cops (v7)`. |
| R7 | Pair and shared calls (Masons, Mafia, Cult, Lovers...) include the dead partners. | v3 | rules-gate: `house rule: pair and shared calls list dead partners (v3+)` → `v3…v7: Masons, Mafia and every other meeting role include the dead partner in the call`. Also night-v3 `v3 info and meeting calls are identical alive vs dead`. |
| R8 | Living players never receive the Graveyard, including after reconnecting. Dead players and the Host do. | v3 | rules-gate: `house rule: living players never receive the Graveyard` → `messagesFor: dead players and the Host get it, living players do not, before and after reconnect`, `a living player view has no graveyard key or text, at every phase`, `pre-v3 rooms have no graveyard for anyone`. Also graveyard, worker-reconnect `Graveyard after reconnect…`. |
| R9 | Nothing leaks to a phone: no other player's role (unless revealed on death or the game is over), result, call number, variant id, host key or token. | v1 (variant ids: v7) | rules-gate: `house rule: nothing leaks to a player phone` → `v4…v7 reveal false/true: no other role, token, key, call number or variant id on any phone, in any phase`; `a player view never shows another player's call number`. Also audit-v7 `phones never carry other players' secrets`. |
| R10 | A room keeps the night version it was created with. Only starting the next night applies a host-requested upgrade. Restart and New game move it to the latest. A v1 room (no field) reads as 1 and is never rewritten. | v1 | rules-gate: `house rule: a room keeps the night version it was created with` → `new rooms get the latest version`, `v2…v6: kept through deal, night, day, condemn, kill, revive and another night`, `v2…v6: only startNight applies a pending upgrade`, `v2…v6: Restart and newGame move the room to the latest`, `a v1 room (no field) reads as 1 and is never backfilled…`, `in the lobby the upgrade applies at once…`. Also night-version-legacy, restart. |

## v8 rules

All gated on `nightVersion >= 8`; v1..v7 rooms behave exactly as before. Every rule is tested three ways: what it does, that the table (Say lines, steps, cues, morning announcement, other phones) cannot tell whether it happened, and that v7 is unchanged. All tests are in `rules-gate`.

| # | House rule (plain words) | Test (rules-gate: describe → test) |
|---|---|---|
| V8-1 | A Doctor and a Bodyguard on the same target: the Bodyguard takes the hit, the Doctor heals them, nobody dies and the attacker lives. It reads like any Doctor save. A Bodyguard alone still dies; a Doctor on the Bodyguard directly is unchanged. | `house rule: v8 a Doctor and a Bodyguard on the same target: nobody dies` → `v8: the Bodyguard is healed, nobody dies, the attacker lives`; `v8: the table cannot tell it from a plain Doctor save (Say lines, steps, saves, morning, phones)`; `v8: a Bodyguard with no Doctor on the target still takes the hit`; `v7 unchanged: the Bodyguard dies even with a Doctor on the same target` |
| V8-2 | Used-up limited-use roles (Vigilante, Veteran, Janitor, Hitman, anything with uses) are still called every night with the same words and timing. The call does nothing: no effect, no use counted, no report line. The Host sees "Used up: tap Skip." | `house rule: v8 used-up roles are still called every night, and the call does nothing` → `<role>: spent and unspent look the same to the table at v8; the old versions still skip it` (one per limited-use role); `v8: a spent Vigilante's recorded shot kills nobody, spends nothing and leaves no report line`; `v8: a spent Janitor does not clean`. Old behaviour stays locked by dead-roles-called. |
| V8-3 | A blocked or jailed limited-use role still loses the use. Unchanged from v1; locked at v7 and v8. | `house rule: v8 a blocked or jailed limited-use role still loses the use (unchanged, locked at v7 and v8)` → `v7/v8: Vigilante, Veteran, Hitman jailed/blocked still uses up a use` (12 tests) |
| V8-4 | The Coroner examining a Janitor-cleaned body learns "cleaned, role unknown" (card: CLEANED, ROLE UNKNOWN). The Vulture and Amnesiac still get the true role. | `house rule: v8 the Coroner learns "cleaned, role unknown" from a cleaned body` → `v8: Coroner text and card; an uncleaned body still reads the true role`; `v8: the Vulture still learns the true role of a cleaned body`; `v8: cleaned and uncleaned look the same to the table`; `v8: the Amnesiac still copies the true role of a cleaned body`; `v7 unchanged: the Coroner still reads the true role of a cleaned body` |
| V8-5 | If anybody visited the Psychic that night (counting only roles that woke before the Psychic, like the Tracker and Lookout), the Psychic sees nothing: "No vision tonight." (card: NO VISION TONIGHT). | `house rule: v8 the Psychic gets no vision when anybody visited them` → `v8: visited gives NO VISION TONIGHT, otherwise the true side`; `v8: only roles that woke before the Psychic count (the live card and the final result agree)`; `v8: visited and not visited look the same to the table (only the private card differs)`; `v7 unchanged: a visited Psychic still reads the true side` |
| V8-6 | An Executioner whose target dies any way but a day vote (night kill, Hunter, Host kill...) becomes a Jester and wins if condemned. Every Executioner, alive or dead, is called every night; the card says YOU ARE NOW THE JESTER the first night after the change, then NO CHANGE (dead: NO ANSWER). Their phone card turns into the Jester after that night. Nothing is announced. | `house rule: v8 an Executioner whose target dies any way but a vote becomes a Jester` → `every living Executioner gets a call every night, with a card: NO CHANGE until it happens`; `target killed at night: that night says NO CHANGE, the next night says YOU ARE NOW THE JESTER once, then NO CHANGE`; `the Jester wins if condemned; the phone card turns into the Jester only after the night that told them`; `a day vote on the target is still an Executioner win and no conversion`; `Hunter shot and Host kill also convert; reviving before they were told undoes it`; `a dead Executioner is still called, with NO ANSWER`; `converted vs not looks the same to the table: steps, Say lines, cues, morning and every other phone`; `v7 unchanged: no Executioner call, no conversion` |
| V8-v | Version plumbing: latest is 8, v7 rooms can upgrade (applied at the next night), Restart / New game / Play again move to 8. | `house rule: v8 version plumbing` → `latest is 8, v7 rooms are offered the upgrade, v8 rooms are not`; also R10 above and restart. |

Notes: only the plain `executioner` role converts (Rival, Stalker and Vendetta are unchanged). Blurbs for Bodyguard, Coroner, Janitor, Psychic and Executioner describe these rules and show in every room.

## Roles that act on death or condemnation

| House rule | Since | Test |
|---|---|---|
| Every role with an on-death or on-condemn trigger (Hunter, Lover, Tinkerer, Baker, Bleeder, Actress, Virgin, Poacher, Scribe, Witness, Saint, Snitch...) can die at night or be condemned without an error. The prompt appears where the engine defines one. The next night cannot start until prompts are settled. The win check runs once they are. | all | on-death-roles: `on-death roles: killed at night` → `<role>: dies at night, prompt if the engine defines one, startNight blocked until resolved, win check runs`; `on-condemn roles: condemned by day` → `<role>: condemned by day, …`; `on-death prompts: the Host picks a target` (3 tests). |

## Reconnects through the real Durable Object

| House rule | Since | Test (worker-reconnect) |
|---|---|---|
| The Host's key gets the Host view; a wrong key is refused and closed. | all | `hello with the host key gives the Host view; a wrong key is refused and closed` |
| Joining gives an id and token; a taken name is refused. | all | `join: a new name gets an id and token, and the whole room is told; a taken name is an error` |
| A player token reconnects; a bad token or unknown id is refused and told to clear its saved login. | all | `hello with a player token reconnects; a bad token or unknown id is refused with clear:true`; `an unauthenticated socket cannot act` |
| Reconnecting mid-night restores the night view, with no one else's role; a dropped phone shows offline, then online. | all | `reconnect mid-night: the player gets the night view with their own call name, never anyone else's role`; `a dropped socket shows the player offline; the reconnect shows them online` |
| After reconnect the Graveyard is still for the dead and the Host only. | v3 | `Graveyard after reconnect: dead players and the Host get it, living players never do` |
| Restart reaches every phone and the Host with the new game number; only the Host can restart. | v7 | `Restart reaches every socket with the new gameNo, the Graveyard is cleared for everyone`; `only the Host can restart; a player's restart is rejected and nothing changes` |

## Seeded simulations (many whole games)

File `test/sim-invariants.test.js`.

| House rule | Since | Test |
|---|---|---|
| No game ever reaches an impossible state (dead player acting, two winners, a living player with no role...). | all | `sim: no impossible states` |
| The winner is always the right side for who was left alive. | all | `sim: right winner` |
| Every living night role is called once per night. | v2 | `sim: every alive night role called once per night` |

## v7 audit fixes (MAFIA-AUDIT-REPORT.md, "Fixed")

All in `test/audit-v7.test.js` unless noted. Gated on v7 unless stated.

| Fix | Test (describe → test) |
|---|---|
| Confused Cop is called in number order, with the Cops' exact wording. | `Confused Cop is called exactly like the other Cops (v7)` |
| Blocking or jailing the last living Mafia member (or a Hooker or Drunk target) stops the kill even when a teammate is dead. | `a team call is stopped when every LIVING member is blocked (v7)` |
| The Psychic reads the true side, ignoring frames and the Godfather disguise. | `Psychic reads the true side (v7)` |
| A cleaned (Janitor) victim does not stand out when roles are never announced. All v4+ rooms, display only. | `Janitor victim is not singled out when roles are never announced` |
| Reviving a wrongly condemned player removes the Jester or Executioner win, the shield and the day lock. | `reviving a condemned player undoes the condemnation (v7)` |
| "Nobody today" works only by day and only before a condemnation. | `no-condemn and restart housekeeping (v7)` |
| Restart clears the Host's notes with the tags. | `no-condemn and restart housekeeping (v7)` → `restart clears the Host's per-player notes with the tags` |

## Other drift guards

| House rule | Test |
|---|---|
| The FAQ lists every role once, every mode, and no stale names. | faq-drift: `FAQ matches the game` (4 tests) |
| The service worker version matches the content hash of `public/`, so installed phones pick up changes. | sw-version: `public/sw.js VERSION matches the content hash of public/`; `build-deploy` also checks it. |
| The deploy gate blocks on a red test, never passes on a crash or no tests, and build-deploy has no bypass. | deploy-gate: `deploy gate: …` (6 tests) |

## How to add a rule

1. Write the rule in one line, in the words you would use at the table.
2. If it changes how a game plays, pin it to a new `nightVersion` (bump `LATEST_NIGHT_VERSION`, gate the code with `nightVersion(room) >= N`). Old rooms keep the old rule. Display-only fixes need no pin.
3. Add a named test in `test/rules-gate.test.js`: `describe('house rule: <the line>')`, one test per version where it applies, plus one that shows older versions are unchanged.
4. Add a row to this file with the exact describe/test names and the "since" version.
5. Run `node scripts/build-deploy.mjs <out>`: it runs every test first and refuses to write the deploy file until all pass. There is no bypass.
