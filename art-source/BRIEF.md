# Art brief

Use ChatGPT (image generation). One prompt gives six roles at once; free accounts have a daily image limit, so do the sheets in order (sheet 1 holds the most-used roles).

## Shared style (already included in every prompt)
Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.

## Workflow
1. Paste a prompt and ask for a **portrait 1024x1536** image. If the grid comes out wrong, say: "Redo as exactly 2 columns by 3 rows, six equal square cells, thin dark gutters."
2. Save the image as `art-source/sheets/sheet-NN.png` (matching the sheet number).
3. Run `npm run art:slice -- art-source/sheets/sheet-NN.png` to cut it into per-role portraits.
4. Run `npm run deploy`.

Keep the same chat for every sheet so the style stays consistent ("same style as before").

## Sheet 01: Mafia, Villager, Doctor, Cop, Detective, Godfather

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Mafia (mafia; palette: crimson red and black with cold shadow): Choose a victim each night with your team. Blend in by day.
2. Villager (town; palette: warm gold and amber light on deep brown): No powers. Win by reading people and voting well.
3. Doctor (town; palette: warm gold and amber light on deep brown): Each night, protect one player from a night kill.
4. Cop (town; palette: warm gold and amber light on deep brown): Each night, check one player. You learn whether they look like Mafia.
5. Detective (town; palette: warm gold and amber light on deep brown): Each night, check one player and learn their exact role.
6. Godfather (mafia; palette: crimson red and black with cold shadow): Mafia leader. Investigators see you as innocent.
```

## Sheet 02: Jester, Bodyguard, Vigilante, Hunter, Mason, Serial Killer

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Jester (third-party; palette: violet and indigo with pale lavender highlights): You win if the town condemns you. Be suspicious, but not too suspicious.
2. Bodyguard (town; palette: warm gold and amber light on deep brown): Guard one player. If the Mafia hit them, you take the bullet instead.
3. Vigilante (town; palette: warm gold and amber light on deep brown): Once per game, shoot a player at night. Be sure.
4. Hunter (town; palette: warm gold and amber light on deep brown): When you die, you take one player down with you.
5. Mason (town; palette: warm gold and amber light on deep brown): You know the other Masons are on your side. Confirmed town.
6. Serial Killer (third-party; palette: violet and indigo with pale lavender highlights): A party of one. Kill every night and outlive everyone.
```

## Sheet 03: Cult Leader, Executioner, Survivor, Jailer, Hooker, Framer

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Cult Leader (third-party; palette: violet and indigo with pale lavender highlights): Recruit one player each night. The cult wins when everyone alive is a member.
2. Executioner (third-party; palette: violet and indigo with pale lavender highlights): You have a target. Get the town to condemn them and you win.
3. Survivor (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive when the game ends. Side with whoever keeps you safe.
4. Jailer (town; palette: warm gold and amber light on deep brown): Each night, lock a player up. They cannot act and cannot be killed.
5. Hooker (mafia; palette: crimson red and black with cold shadow): Each night, distract a player so they cannot act. You still join the Mafia meeting.
6. Framer (mafia; palette: crimson red and black with cold shadow): Each night, frame a player so they look like Mafia to investigators.
```

## Sheet 04: Janitor, Veteran, Tracker, Lookout, Merlin, President

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Janitor (mafia; palette: crimson red and black with cold shadow): Once per game, clean up the Mafia's victim so their role stays hidden.
2. Veteran (town; palette: warm gold and amber light on deep brown): Three times per game, go on alert. Anyone who visits you that night dies.
3. Tracker (town; palette: warm gold and amber light on deep brown): Each night, follow one player and learn who they visited.
4. Lookout (town; palette: warm gold and amber light on deep brown): Each night, watch one player and learn who visited them.
5. Merlin (town; palette: warm gold and amber light on deep brown): You start knowing who the Mafia are. Guide the town, but do not get caught.
6. President (town; palette: warm gold and amber light on deep brown): Your identity is revealed to the town. Stay alive.
```

## Sheet 05: Traitor, Amnesiac, Opportunist, Miller, Grandma, Bomb

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Traitor (third-party; palette: violet and indigo with pale lavender highlights): You look like town but win with the Mafia.
2. Amnesiac (third-party; palette: violet and indigo with pale lavender highlights): Once per game, become a dead player's role and take up their cause.
3. Opportunist (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive when the town loses.
4. Miller (town; palette: warm gold and amber light on deep brown): You are a regular villager who looks like Mafia to investigators.
5. Grandma (town; palette: warm gold and amber light on deep brown): You cannot be killed at night. Only a vote can take you out.
6. Bomb (town; palette: warm gold and amber light on deep brown): If the Mafia kill you at night, whoever attacked you dies too.
```

## Sheet 06: Actress, Assassin, Associate, Bagman, Ballot Stuffer, Blackmailer

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Actress (mafia; palette: crimson red and black with cold shadow): Each night you pick a role to play. If you die, you are revealed as that role.
2. Assassin (mafia; palette: crimson red and black with cold shadow): A lone killer on the Mafia team. You act alone, not with the meeting.
3. Associate (mafia; palette: crimson red and black with cold shadow): Each night you may hand a gun to one non-Mafia player. It never hurts Mafia, and may expose the shooter.
4. Bagman (mafia; palette: crimson red and black with cold shadow): Once per game, bribe the count: strike two votes cast against a player.
5. Ballot Stuffer (mafia; palette: crimson red and black with cold shadow): Once per game, add two extra votes against a player.
6. Blackmailer (mafia; palette: crimson red and black with cold shadow): Twice per game, silence one player so they cannot speak for the rest of the day.
```

## Sheet 07: Blinder, Booby-Trapped Goon, Bookkeeper, Bouncer, Con Artist, Consigliere

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Blinder (mafia; palette: crimson red and black with cold shadow): Each night you cover one player's eyes. Tomorrow they cannot see who voted for whom. You skip the Mafia meeting.
2. Booby-Trapped Goon (mafia; palette: crimson red and black with cold shadow): If someone kills you at night, your attacker goes down with you.
3. Bookkeeper (mafia; palette: crimson red and black with cold shadow): Each night, compare two players and learn if they are on the same side.
4. Bouncer (mafia; palette: crimson red and black with cold shadow): Each night, guard a door. Everyone visiting that player is blocked.
5. Con Artist (mafia; palette: crimson red and black with cold shadow): You look innocent to investigators, and twice per game you can frame another player.
6. Consigliere (mafia; palette: crimson red and black with cold shadow): The Mafia's advisor. Each night you learn one player's exact role.
```

## Sheet 08: Disguiser, Don, Driver, Enforcer, Family Doctor, Fiddler

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Disguiser (mafia; palette: crimson red and black with cold shadow): Once per game, pick a player. If they die that night, you take over their identity.
2. Don (mafia; palette: crimson red and black with cold shadow): Mafia boss. You count double toward the Mafia's majority.
3. Driver (mafia; palette: crimson red and black with cold shadow): Each night you pick two players. Whatever happens to one is applied to the other and the reverse.
4. Enforcer (mafia; palette: crimson red and black with cold shadow): Each night you shield a player from conversion. A killer you shield flips to the Mafia side.
5. Family Doctor (mafia; palette: crimson red and black with cold shadow): Twice per game, shield one player from a night kill. Usually a Mafia teammate.
6. Fiddler (mafia; palette: crimson red and black with cold shadow): Each night you play a tune for one player. Tomorrow they cannot hear the town debate.
```

## Sheet 09: Gramps, Hitman, Illusionist, Interceptor, Kidnapper, Kingpin

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Gramps (mafia; palette: crimson red and black with cold shadow): You cannot be killed at night or shot by day. Anyone who visits you reveals their role to you.
2. Hitman (mafia; palette: crimson red and black with cold shadow): Twice per game, make a second kill on top of the team's kill.
3. Illusionist (mafia; palette: crimson red and black with cold shadow): You hold one gun. Once, pick a player to take the blame when you fire it.
4. Interceptor (mafia; palette: crimson red and black with cold shadow): Each night you stand outside one house. You kill one of its visitors, and the rest learn who you are.
5. Kidnapper (mafia; palette: crimson red and black with cold shadow): Each night you lock one player away. They cannot act and cannot be harmed.
6. Kingpin (mafia; palette: crimson red and black with cold shadow): Your word is law. You count triple toward the Mafia's majority.
```

## Sheet 10: Lawyer, Mad Bomber, Made Man, Mob Lawyer, Muscle, Paparazzi

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Lawyer (mafia; palette: crimson red and black with cold shadow): Each night you clear a Mafia teammate. If a Cop looks at them, they read as innocent.
2. Mad Bomber (mafia; palette: crimson red and black with cold shadow): Once per day, blow up yourself and another player.
3. Made Man (mafia; palette: crimson red and black with cold shadow): Untouchable. Night attacks cannot kill you, only the vote can.
4. Mob Lawyer (mafia; palette: crimson red and black with cold shadow): Once per game, make a Mafia player immune from condemnation for the day.
5. Muscle (mafia; palette: crimson red and black with cold shadow): Each night you bodyguard one player. If they are attacked, you take the hit instead.
6. Paparazzi (mafia; palette: crimson red and black with cold shadow): If you are condemned, you snap one last photo: the role of a player you name goes public.
```

## Sheet 11: Paralyzer, Poacher, Poisoner, Riot Starter, Saboteur, Sentinel

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Paralyzer (mafia; palette: crimson red and black with cold shadow): Once per game, you freeze the vote so no ballots count for the day.
2. Poacher (mafia; palette: crimson red and black with cold shadow): If you are condemned, take another player with you.
3. Poisoner (mafia; palette: crimson red and black with cold shadow): Each night you poison one player. They die two nights later unless a Doctor treats them.
4. Riot Starter (mafia; palette: crimson red and black with cold shadow): Once per game, whip up chaos and force the day's vote to be cancelled.
5. Saboteur (mafia; palette: crimson red and black with cold shadow): Each night you tamper with one player's gun. If they fire it, it blows up in their hand.
6. Sentinel (mafia; palette: crimson red and black with cold shadow): Twice per game, go on alert. Anyone who visits you that night is shot.
```

## Sheet 12: Shadow, Sleeper Agent, Slowpoke, Smoke Bomber, Sniper, Snitch

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Shadow (mafia; palette: crimson red and black with cold shadow): Each night you follow one player and learn where they went.
2. Sleeper Agent (mafia; palette: crimson red and black with cold shadow): Secret Mafia who does not know it yet. You think you are a Villager and look innocent until woken.
3. Slowpoke (mafia; palette: crimson red and black with cold shadow): Mafia member who does not attend the night meeting.
4. Smoke Bomber (mafia; palette: crimson red and black with cold shadow): If you are condemned, the smoke covers the town: nobody can be killed the next night.
5. Sniper (mafia; palette: crimson red and black with cold shadow): You own one gun and your identity stays hidden when you shoot. You skip the Mafia meeting.
6. Snitch (mafia; palette: crimson red and black with cold shadow): A liability. If you are condemned, you must give up one of your teammates.
```

## Sheet 13: Spy, Strongman, Tailor, Talent Scout, Ventriloquist, Voodoo Lady

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Spy (mafia; palette: crimson red and black with cold shadow): Each night you tail one player and see who visits them.
2. Strongman (mafia; palette: crimson red and black with cold shadow): Once per game, your strength guarantees the Mafia kill goes through, even past blocks and saves.
3. Tailor (mafia; palette: crimson red and black with cold shadow): Each night you sew a disguise for a player. When they die, their role is shown as the one on the suit.
4. Talent Scout (mafia; palette: crimson red and black with cold shadow): On the first night you learn which power roles town has this game.
5. Ventriloquist (mafia; palette: crimson red and black with cold shadow): You can throw your voice and pass yourself off as another player to one other person.
6. Voodoo Lady (mafia; palette: crimson red and black with cold shadow): Each night you pick a player and a word. If they say that word tomorrow, they die.
```

## Sheet 14: Wannabe, Whisperer, Witch, Yakuza, Agent Provocateur, Angel

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Wannabe (mafia; palette: crimson red and black with cold shadow): Each night you "investigate", but the results are made up.
2. Whisperer (mafia; palette: crimson red and black with cold shadow): You can send anonymous private messages to any players through the Storyteller.
3. Witch (mafia; palette: crimson red and black with cold shadow): Each night you curse a player. They die if anyone not on the Mafia team visits them that night.
4. Yakuza (mafia; palette: crimson red and black with cold shadow): Once per game, convert a non-Mafia player into Mafia.
5. Agent Provocateur (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive when the town loses. Each night, frame a player to stir up trouble.
6. Angel (third-party; palette: violet and indigo with pale lavender highlights): You guard one player for the whole game. Once you may take a hit for them. You win if they live. The Storyteller awards the win.
```

## Sheet 15: Arsonist, Collaborator, Creepy Girl, Cthulhu, Cult Guard, Cult Seer

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Arsonist (third-party; palette: violet and indigo with pale lavender highlights): A lone killer who looks innocent to investigators. Burn the town down.
2. Collaborator (third-party; palette: violet and indigo with pale lavender highlights): You win with the Mafia. Each night, distract a player so they cannot act.
3. Creepy Girl (third-party; palette: violet and indigo with pale lavender highlights): You hand a doll to one player. They pass it on each night. You win if you live and its original holder dies.
4. Cthulhu (third-party; palette: violet and indigo with pale lavender highlights): Anyone who visits you goes mad. You win only if the cult wins, and you die if a Mason visits.
5. Cult Guard (third-party; palette: violet and indigo with pale lavender highlights): Cult member who recruits with the leader and each night bodyguards one player.
6. Cult Seer (third-party; palette: violet and indigo with pale lavender highlights): Cult member who recruits with the leader and each night learns one player's exact role.
```

## Sheet 16: Fifth Columnist, Hermit, Hired Gun, Informant, Mastermind, Mercenary

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Fifth Columnist (third-party; palette: violet and indigo with pale lavender highlights): You win with the Mafia while looking perfectly innocent to investigators.
2. Hermit (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive at the end. Night attacks cannot kill you.
3. Hired Gun (third-party; palette: violet and indigo with pale lavender highlights): You only need to survive. Three times per game you may kill at night.
4. Informant (third-party; palette: violet and indigo with pale lavender highlights): You win with the Mafia. Each night you learn a player's exact role.
5. Mastermind (third-party; palette: violet and indigo with pale lavender highlights): You pull the strings from behind the Mafia. They win only if you also survive, and their meetings are anonymous.
6. Mercenary (third-party; palette: violet and indigo with pale lavender highlights): Survive to the end. Each night you can bodyguard someone for the right side.
```

## Sheet 17: Monk, Patsy, Politician, Poltergeist, Prepper, Profiteer

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Monk (third-party; palette: violet and indigo with pale lavender highlights): Your vote never counts. Each night you save one player, who also cannot be condemned next day. Save two players to win.
2. Patsy (third-party; palette: violet and indigo with pale lavender highlights): You look like Mafia to investigators. You win if the town condemns you.
3. Politician (third-party; palette: violet and indigo with pale lavender highlights): Your vote counts twice. Every two days a coin flip decides if you are Town or Mafia.
4. Poltergeist (third-party; palette: violet and indigo with pale lavender highlights): You win if you are condemned, and you haunt one of your accusers to death.
5. Prepper (third-party; palette: violet and indigo with pale lavender highlights): Survive to the end. Twice per game, barricade yourself and shoot any visitor.
6. Profiteer (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive when the town loses. Each night, watch who visits one player.
```

## Sheet 18: Prophet, Rival, Smuggler, Stalker, Trickster, Vendetta

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Prophet (third-party; palette: violet and indigo with pale lavender highlights): You name a moment of the game in secret. If the game ends then, you win.
2. Rival (third-party; palette: violet and indigo with pale lavender highlights): You hold a grudge against a Town player. You win if they are condemned.
3. Smuggler (third-party; palette: violet and indigo with pale lavender highlights): Survive to the end. Each night, block everyone who goes through one door.
4. Stalker (third-party; palette: violet and indigo with pale lavender highlights): Obsessed with one target. Watch them each night and win by getting them condemned.
5. Trickster (third-party; palette: violet and indigo with pale lavender highlights): You cannot be killed at night. Only the vote can end you, and that is exactly what you want.
6. Vendetta (third-party; palette: violet and indigo with pale lavender highlights): You are out for a Mafia member. You win if the town condemns your target.
```

## Sheet 19: Vulture, Warlock, Werewolf, Zealot, Agent, Archivist

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Vulture (third-party; palette: violet and indigo with pale lavender highlights): You win if you are alive when the town loses. Each night, pick at a corpse to learn its role.
2. Warlock (third-party; palette: violet and indigo with pale lavender highlights): Each night you name who will be condemned tomorrow. Two correct guesses win it for you.
3. Werewolf (third-party; palette: violet and indigo with pale lavender highlights): A lone killer who cannot be killed at night. Kill every night and outlast everyone.
4. Zealot (third-party; palette: violet and indigo with pale lavender highlights): You win if condemned, and your sacrifice calms the town: no kills the following night.
5. Agent (town; palette: warm gold and amber light on deep brown): You can slip anonymous notes to anyone who is not on the town team. The Storyteller carries them.
6. Archivist (town; palette: warm gold and amber light on deep brown): On the first night you learn one role that is definitely NOT in this game.
```

## Sheet 20: Back-Alley Doctor, Baker, Blacksmith, Bleeder, Caroler, Census Taker

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Back-Alley Doctor (town; palette: warm gold and amber light on deep brown): You save lives each night, but your shady reputation makes you look like Mafia to investigators.
2. Baker (town; palette: warm gold and amber light on deep brown): Each night you bake two loaves for players of your choice. If every Baker dies, the town starves.
3. Blacksmith (town; palette: warm gold and amber light on deep brown): Each night you forge a vest for one player. The vest saves them from one night attack.
4. Bleeder (town; palette: warm gold and amber light on deep brown): When shot, you do not die at once. You bleed out a day later.
5. Caroler (town; palette: warm gold and amber light on deep brown): Each night you sing to one player. They hear a carol naming three players, at least one of them Mafia.
6. Census Taker (town; palette: warm gold and amber light on deep brown): Once per game, find out exactly how many Mafia are still alive.
```

## Sheet 21: Chairperson, Chef, Civilian, Confused Cop, Coroner, Defense Attorney

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Chairperson (town; palette: warm gold and amber light on deep brown): Whenever the vote ends in a tie, you decide who is condemned.
2. Chef (town; palette: warm gold and amber light on deep brown): During the day you invite two players to dinner. At night they meet and learn each other's roles.
3. Civilian (town; palette: warm gold and amber light on deep brown): An ordinary citizen. The Mafia win once more than half of the Civilians are dead.
4. Confused Cop (town; palette: warm gold and amber light on deep brown): You think you are a Cop, but your results are random noise.
5. Coroner (town; palette: warm gold and amber light on deep brown): Each night, examine a dead player and learn their true role.
6. Defense Attorney (town; palette: warm gold and amber light on deep brown): Once per game, defend a player so they cannot be condemned that day.
```

## Sheet 22: Deputy, Dirty Cop, Doorman, Dreamer, Drunk, Enchantress

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Deputy (town; palette: warm gold and amber light on deep brown): You hold one secret gun to fire in daylight. Nobody learns you pulled the trigger.
2. Dirty Cop (town; palette: warm gold and amber light on deep brown): You check one player each night, but investigators think you are Mafia.
3. Doorman (town; palette: warm gold and amber light on deep brown): Each night, stand at one door and turn away every visitor. Nobody can kill you at night.
4. Dreamer (town; palette: warm gold and amber light on deep brown): Each night you dream. Sometimes it warns of three players with a Mafia among them, sometimes it clears one player.
5. Drunk (town; palette: warm gold and amber light on deep brown): Each night, distract a player so they cannot act.
6. Enchantress (town; palette: warm gold and amber light on deep brown): Once per game, you give a player a crystal ball to pass along each night. When the holder dies, the last receiver's role is revealed.
```

## Sheet 23: Gallis, Governor, Granny, Gunsmith, Hangman, Inquisitor

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Gallis (town; palette: warm gold and amber light on deep brown): You think you are a plain Villager, but a single vote is enough to condemn you.
2. Governor (town; palette: warm gold and amber light on deep brown): Once per game, overturn the vote and choose who is condemned instead.
3. Granny (town; palette: warm gold and amber light on deep brown): You keep a shotgun by the door. Nobody can kill you at night, and anybody who visits you is shot.
4. Gunsmith (town; palette: warm gold and amber light on deep brown): Each night you may hand a gun to one player. The holder fires it once by day, and half the time the shot stays anonymous.
5. Hangman (town; palette: warm gold and amber light on deep brown): Once per game, spare a condemned player at the last second.
6. Inquisitor (town; palette: warm gold and amber light on deep brown): Twice per game, put one yes-or-no question to a player. They must answer truthfully.
```

## Sheet 24: Insane Cop, Invisible Man, Journalist, Judge, Keymaker, Leader

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Insane Cop (town; palette: warm gold and amber light on deep brown): You think you are a Cop, but your results are always backwards.
2. Invisible Man (town; palette: warm gold and amber light on deep brown): Pick one player to trail. If they sit in a night meeting, you eavesdrop but hear no names.
3. Journalist (town; palette: warm gold and amber light on deep brown): Each night you shadow one player and get a copy of any private information they received.
4. Judge (town; palette: warm gold and amber light on deep brown): Once per game, throw out today's vote entirely. Nobody is condemned that day.
5. Keymaker (town; palette: warm gold and amber light on deep brown): Each night you cut a key for another player. With it they can lock their door on any night, so nobody can visit them.
6. Leader (town; palette: warm gold and amber light on deep brown): If you are killed, the next day's votes are anonymous.
```

## Sheet 25: Lightkeeper, Loudmouth, Lover, Marshal, Mayor, Medium

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Lightkeeper (town; palette: warm gold and amber light on deep brown): If you die, the lights go out. Tomorrow nobody can see who speaks or who votes.
2. Loudmouth (town; palette: warm gold and amber light on deep brown): You think you are a Villager. If anyone visits you at night, the Storyteller announces every visitor by name.
3. Lover (town; palette: warm gold and amber light on deep brown): You have a secret partner. If one of you dies, the other dies of heartbreak.
4. Marshal (town; palette: warm gold and amber light on deep brown): Once per game, demand a second vote after the first one ends.
5. Mayor (town; palette: warm gold and amber light on deep brown): Once per game you may unmask yourself. From then on your vote counts triple.
6. Medium (town; palette: warm gold and amber light on deep brown): You can speak with the dead. The Storyteller relays your questions.
```

## Sheet 26: Naive Cop, Nosy Neighbor, Oracle, Paranoid Cop, Parity Cop, Party Host

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Naive Cop (town; palette: warm gold and amber light on deep brown): You think you are a Cop, but everyone always looks innocent to you.
2. Nosy Neighbor (town; palette: warm gold and amber light on deep brown): On the first night you learn whether the players sitting either side of you are Mafia.
3. Oracle (town; palette: warm gold and amber light on deep brown): Once per game, name two players and learn whether they are on the same side.
4. Paranoid Cop (town; palette: warm gold and amber light on deep brown): You think you are a Cop, but everyone always looks guilty to you.
5. Parity Cop (town; palette: warm gold and amber light on deep brown): Each night, pick two players and learn whether they are on the same side.
6. Party Host (town; palette: warm gold and amber light on deep brown): Once per game, you throw a night party. Votes work as normal, but night talk is no longer secret.
```

## Sheet 27: Peeping Tom, Penguin, Placebo Doctor, Prosecutor, Psychic, Puppy

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Peeping Tom (town; palette: warm gold and amber light on deep brown): You watch one house each night and see who visits. Investigators find you suspicious.
2. Penguin (town; palette: warm gold and amber light on deep brown): Each night you waddle up to one player and whisper a secret. It is a harmless fun fact picked by the Storyteller.
3. Placebo Doctor (town; palette: warm gold and amber light on deep brown): You believe you are the Doctor, but your protection never works. Do not rely on it.
4. Prosecutor (town; palette: warm gold and amber light on deep brown): Once per game, force the vote onto a player of your choice.
5. Psychic (town; palette: warm gold and amber light on deep brown): Each night you read one mind and learn the true side of a player, past any disguise.
6. Puppy (town; palette: warm gold and amber light on deep brown): Everyone knows you are the Puppy. You are definitely not Mafia.
```

## Sheet 28: Queen, Representative, Retired Hitman, Saint, Samurai, Scholar

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Queen (town; palette: warm gold and amber light on deep brown): Before the vote closes, you may change one player's vote.
2. Representative (town; palette: warm gold and amber light on deep brown): Your vote counts twice.
3. Retired Hitman (town; palette: warm gold and amber light on deep brown): You cannot be killed at night, but your past makes you look like Mafia to investigators.
4. Saint (town; palette: warm gold and amber light on deep brown): If the town condemns you, the last player to vote against you is struck down.
5. Samurai (town; palette: warm gold and amber light on deep brown): You cannot be converted. Anyone who tries to convert you dies, up to two times per game.
6. Scholar (town; palette: warm gold and amber light on deep brown): Twice per game, ask whether a specific role is in play at all.
```

## Sheet 29: Scribe, Secretary, Security Guard, Sharpshooter, Sheriff, Sleepwalker

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Scribe (town; palette: warm gold and amber light on deep brown): Write a sealed note during the game. If you die, it is read to everyone.
2. Secretary (town; palette: warm gold and amber light on deep brown): If you are killed at night, there is no vote the next day.
3. Security Guard (town; palette: warm gold and amber light on deep brown): Each night, guard a door. Everyone who visits that player is blocked.
4. Sharpshooter (town; palette: warm gold and amber light on deep brown): Twice per game, take a shot at a player during the night. Do not miss on the wrong person.
5. Sheriff (town; palette: warm gold and amber light on deep brown): An openly announced Cop. Everyone knows your badge, so stay alive and check someone each night.
6. Sleepwalker (town; palette: warm gold and amber light on deep brown): You think you are a Villager, but every night you wander to a random house. It does nothing but looks suspicious.
```

## Sheet 30: Soothsayer, Surveyor, Telepath, Tinkerer, Tipster, Town Crier

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Soothsayer (town; palette: warm gold and amber light on deep brown): On the first night you learn exactly how many Mafia are in the game.
2. Surveyor (town; palette: warm gold and amber light on deep brown): Once per game, learn which roles are still alive.
3. Telepath (town; palette: warm gold and amber light on deep brown): You can send anonymous private messages to any player through the Storyteller.
4. Tinkerer (town; palette: warm gold and amber light on deep brown): If nobody visits you in a night, you build a gun and arm yourself. If you are killed, your workshop is raided.
5. Tipster (town; palette: warm gold and amber light on deep brown): On the first night you get a tip: one player who is definitely Mafia. Just one.
6. Town Crier (town; palette: warm gold and amber light on deep brown): Once per game, send an anonymous message to the whole table through the Storyteller.
```

## Sheet 31: Trapper, Treestump, Turncoat, Virgin, Witness

```text
Create ONE portrait-orientation image (1024x1536) containing exactly six separate square illustrations in a 2-column by 3-row grid, equal-sized cells separated by thin dark gutters, reading left to right then top to bottom. No labels or captions.
Style for all six: Vintage 1930s noir tarot-card illustration. Bold black ink linework, limited palette, flat shading with subtle halftone grain, dramatic chiaroscuro lighting, centered character or emblem, symmetrical art-deco composition, mysterious and slightly playful. No text, no letters, no numbers, no borders, no watermarks.
Each cell illustrates a different role from a Mafia / Werewolf party game (use the role name and description as inspiration for the character, props and mood):
1. Trapper (town; palette: warm gold and amber light on deep brown): You think you are a plain Villager, but you carry a hidden trap. A night attacker dies with you.
2. Treestump (town; palette: warm gold and amber light on deep brown): Once per game, turn into a tree for good. Trees cannot be killed or converted, and cannot vote.
3. Turncoat (town; palette: warm gold and amber light on deep brown): The Mafia cannot kill you. If they try, you quietly switch sides to the Mafia instead.
4. Virgin (town; palette: warm gold and amber light on deep brown): If the town condemns you, everyone is safe from kills the next night.
5. Witness (town; palette: warm gold and amber light on deep brown): Before dying, you whisper one name to the Storyteller. They announce if that player looks Mafia.
```

