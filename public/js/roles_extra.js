// Extra roles. `R` and `A` are the helpers from roles.js (R(id,name,emoji,alignment,blurb,opts), A(type,order,prompt,extra)).
// Only engine-supported fields are used. Informational triggers (onDeath/onCondemn) say "dismiss" when the
// Host should NOT pick a target, because resolving a pending prompt with a target kills that player.
export function buildExtra(R, A) {
  return [
    // =====================================================================
    // TOWN
    // =====================================================================

    // --- day abilities (Host adjudicates) ---
    R('mayor', 'Mayor', '🏙️', 'town', 'Once per game you may unmask yourself. From then on your vote counts triple.',
      { day: 'Mayor may reveal now: their vote counts 3 for the rest of the game (once).', dayUses: 1 }),
    R('judge', 'Judge', '🔨', 'town', 'Once per game, throw out today\'s vote entirely. Nobody is condemned that day.',
      { day: 'Judge may cancel today\'s vote (once).', dayUses: 1 }),
    R('marshal', 'Marshal', '⭐', 'town', 'Once per game, demand a second vote after the first one ends.',
      { day: 'Marshal may call a second vote today (once).', dayUses: 1 }),
    R('oracle', 'Oracle', '🧿', 'town', 'Once per game, name two players and learn whether they are on the same side.',
      { day: 'Oracle names two players; tell them privately if they look like the same side (once).', dayUses: 1 }),
    R('census_taker', 'Census Taker', '📋', 'town', 'Once per game, find out exactly how many Mafia are still alive.',
      { day: 'Census Taker may ask how many Mafia are alive (once).', dayUses: 1 }),
    R('scholar', 'Scholar', '🎓', 'town', 'Twice per game, ask whether a specific role is in play at all.',
      { day: 'Scholar may ask if a named role is in this game (twice).', dayUses: 2 }),
    R('inquisitor', 'Inquisitor', '🔍', 'town', 'Twice per game, put one yes-or-no question to a player. They must answer truthfully.',
      { day: 'Inquisitor asks one player a yes/no question; the Host enforces a true answer (twice).', dayUses: 2 }),
    R('town_crier', 'Town Crier', '📣', 'town', 'Once per game, send an anonymous message to the whole table through the Host.',
      { day: 'Town Crier gives the Host one anonymous message to read aloud (once).', dayUses: 1 }),
    R('chairperson', 'Chairperson', '🪑', 'town', 'Whenever the vote ends in a tie, you decide who is condemned.',
      { day: 'If the vote is tied, the Chairperson breaks the tie.' }),
    R('scribe', 'Scribe', '✍️', 'town', 'Write a sealed note during the game. If you die, it is read to everyone.',
      { onDeath: 'The Scribe has died. Read their sealed note aloud to the table, then dismiss (pick nobody).' }),

    // --- first-night information ---
    R('soothsayer', 'Soothsayer', '🔢', 'town', 'On the first night you learn exactly how many Mafia are in the game.',
      { night1: 'Soothsayer, open your eyes. Show them, on your fingers, how many Mafia are in the game.' }),
    R('archivist', 'Archivist', '🗃️', 'town', 'On the first night you learn one role that is definitely NOT in this game.',
      { night1: 'Archivist, open your eyes. Show them one role card that nobody was dealt.' }),
    R('tipster', 'Tipster', '📞', 'town', 'On the first night you get a tip: one player who is definitely Mafia. Just one.',
      { night1: 'Tipster, open your eyes. Point out exactly one Mafia member (not the whole team).' }),
    R('nosy_neighbor', 'Nosy Neighbor', '🏠', 'town', 'On the first night you learn whether the players sitting either side of you are Mafia.',
      { night1: 'Nosy Neighbor, open your eyes. Tell them whether the players seated to their left and right look Mafia.' }),

    // --- public / suspicious-looking power roles ---
    R('sheriff', 'Sheriff', '🤠', 'town', 'An openly announced Detective. Everyone knows your badge, so stay alive and check someone each night.',
      { revealToTown: true, night1: 'Announce the Sheriff to the town.',
        action: A('investigate', 60, 'Sheriff, wake up. Who do you check?', { check: 'alignment' }) }),
    R('back_alley_doctor', 'Back-Alley Doctor', '💉', 'town', 'You save lives each night, but your shady reputation makes you look like Mafia to investigators.',
      { appearsAs: 'mafia', action: A('protect', 20, 'Back-Alley Doctor, wake up. Who do you patch up?') }),
    R('dirty_detective', 'Dirty Detective', '🚔', 'town', 'You check one player each night, but investigators think you are Mafia.',
      { appearsAs: 'mafia', action: A('investigate', 60, 'Dirty Detective, wake up. Who do you check?', { check: 'alignment' }) }),
    R('peeping_tom', 'Peeping Tom', '🪟', 'town', 'You watch one house each night and see who visits. Investigators find you suspicious.',
      { appearsAs: 'mafia', action: A('watch', 64, 'Peeping Tom, wake up. Whose window do you watch?') }),
    R('retired_hitman', 'Retired Hitman', '🧓', 'town', 'You cannot be killed at night, but your past makes you look like Mafia to investigators.',
      { nightImmune: true, appearsAs: 'mafia' }),
    R('doorman', 'Doorman', '🧱', 'town', 'Each night, stand at one door and turn away every visitor. Nobody can kill you at night.',
      { nightImmune: true, action: A('blockVisitors', 14, 'Doorman, wake up. Whose door do you guard?') }),

    // --- hidden-trigger lookalikes ---
    R('trapper', 'Trapper', '🎁', 'town', 'You think you are a plain Villager, but you carry a hidden trap. A night attacker dies with you.',
      { seesAs: 'villager', retaliate: true }),
    R('placebo_doctor', 'Placebo Doctor', '💊', 'town', 'You believe you are the Doctor, but your protection never works. Do not rely on it.',
      { seesAs: 'doctor', night1: 'Wake the Placebo Doctor alongside the real Doctor every night and let them choose, but protect nobody.' }),

    // --- triggers ---
    R('saint', 'Saint', '😇', 'town', 'If the town condemns you, the last player to vote against you is struck down.',
      { onCondemn: 'The Saint was condemned. Who cast the last vote against them? That player is struck down.' }),
    R('witness', 'Witness', '👀', 'town', 'Before dying, you whisper one name to the Host. They announce if that player looks Mafia.',
      { onDeath: 'The Witness has died. Announce whether the player they named looks Mafia, then dismiss (pick nobody).' }),
    R('lover', 'Lover', '💘', 'town', 'You have a secret partner. If one of you dies, the other dies of heartbreak.',
      { night1: 'Lovers, open your eyes and find each other. If one dies, the other follows.',
        onDeath: 'A Lover has died. Their partner dies of heartbreak: pick the partner (dismiss if already dead).' }),

    // --- limited night action ---
    R('sharpshooter', 'Sharpshooter', '🎯', 'town', 'Twice per game, take a shot at a player during the night. Do not miss on the wrong person.',
      { action: A('kill', 53, 'Sharpshooter, wake up. Do you take a shot?', { uses: 2, source: 'sharpshooter' }) }),

    // =====================================================================
    // MAFIA
    // =====================================================================
    R('consigliere', 'Consigliere', '🍷', 'mafia', 'The Mafia\'s advisor. Each night you learn one player\'s exact role.',
      { meeting: 'mafia', action: A('investigate', 61, 'Consigliere, wake up. Whose role do you want to know?', { check: 'role' }) }),
    R('spy', 'Spy', '🕶️', 'mafia', 'Each night you tail one player and see who visits them.',
      { meeting: 'mafia', action: A('watch', 64, 'Spy, wake up. Whose door do you watch?') }),
    R('shadow', 'Shadow', '🌑', 'mafia', 'Each night you follow one player and learn where they went.',
      { meeting: 'mafia', action: A('track', 63, 'Shadow, wake up. Who do you follow?') }),
    R('bookkeeper', 'Bookkeeper', '📒', 'mafia', 'Each night, compare two players and learn if they are on the same side.',
      { meeting: 'mafia', action: A('investigate', 62, 'Bookkeeper, wake up. Which two players do you compare?', { check: 'parity', targets: 2 }) }),
    R('family_doctor', 'Family Doctor', '🧑‍⚕️', 'mafia', 'Twice per game, shield one player from a night kill. Usually a Mafia teammate.',
      { meeting: 'mafia', action: A('protect', 20, 'Family Doctor, wake up. Who do you shield?', { uses: 2 }) }),
    R('muscle', 'Muscle', '💪', 'mafia', 'Each night you bodyguard one player. If they are attacked, you take the hit instead.',
      { meeting: 'mafia', action: A('guard', 21, 'Muscle, wake up. Who do you guard?') }),
    R('sentinel', 'Sentinel', '🚧', 'mafia', 'Twice per game, go on alert. Anyone who visits you that night is shot.',
      { meeting: 'mafia', action: A('alert', 22, 'Sentinel, wake up. Going on alert tonight?', { targets: 0, uses: 2 }) }),
    R('kidnapper', 'Kidnapper', '📦', 'mafia', 'Each night you lock one player away. They cannot act and cannot be harmed.',
      { meeting: 'mafia', action: A('jail', 10, 'Kidnapper, wake up. Who do you lock away?') }),
    R('hitman', 'Hitman', '💼', 'mafia', 'Twice per game, make a second kill on top of the team\'s kill.',
      { meeting: 'mafia', action: A('kill', 51, 'Hitman, wake up. Do you make an extra hit?', { uses: 2, source: 'mafia' }) }),
    R('con_artist', 'Con Artist', '🎭', 'mafia', 'You look innocent to investigators, and twice per game you can frame another player.',
      { meeting: 'mafia', appearsAs: 'innocent', action: A('frame', 40, 'Con Artist, wake up. Who do you frame?', { uses: 2 }) }),
    R('kingpin', 'Kingpin', '💎', 'mafia', 'Your word is law. You count triple toward the Mafia\'s majority.',
      { meeting: 'mafia', weight: 3 }),
    R('made_man', 'Made Man', '🦾', 'mafia', 'Untouchable. Night attacks cannot kill you, only the vote can.',
      { meeting: 'mafia', nightImmune: true }),
    R('booby_goon', 'Booby-Trapped Goon', '💥', 'mafia', 'If someone kills you at night, your attacker goes down with you.',
      { meeting: 'mafia', retaliate: true }),
    R('smoke_bomber', 'Smoke Bomber', '🌫️', 'mafia', 'If you are condemned, the smoke covers the town: nobody can be killed the next night.',
      { meeting: 'mafia', shield: true, onCondemn: 'The Smoke Bomber was condemned: nobody can be killed tonight.' }),
    R('snitch', 'Snitch', '🐀', 'mafia', 'A liability. If you are condemned, you must give up one of your teammates.',
      { meeting: 'mafia', onCondemn: 'The Snitch was condemned. They must name one Mafia teammate; announce it, then dismiss (pick nobody).' }),
    R('sleeper_agent', 'Sleeper Agent', '😴', 'mafia', 'Secret Mafia who does not know it yet. You think you are a Villager and look innocent until woken.',
      { seesAs: 'villager', appearsAs: 'innocent',
        night1: 'Do NOT wake the Sleeper Agent. On night 3, tap them and show them who the Mafia are.' }),
    R('talent_scout', 'Talent Scout', '🔦', 'mafia', 'On the first night you learn which power roles town has this game.',
      { meeting: 'mafia', night1: 'Talent Scout, open your eyes. Show them every town power role in the game (not who holds them).' }),
    R('blackmailer', 'Blackmailer', '✉️', 'mafia', 'Twice per game, silence one player so they cannot speak for the rest of the day.',
      { meeting: 'mafia', day: 'Blackmailer may silence one player for the rest of the day (twice).', dayUses: 2 }),
    R('ballot_stuffer', 'Ballot Stuffer', '📮', 'mafia', 'Once per game, add two extra votes against a player.',
      { meeting: 'mafia', day: 'Ballot Stuffer adds 2 votes against a player of their choice (once).', dayUses: 1 }),
    R('bagman', 'Bagman', '💰', 'mafia', 'Once per game, bribe the count: strike two votes cast against a player.',
      { meeting: 'mafia', day: 'Bagman removes 2 votes cast against a player (once).', dayUses: 1 }),
    R('riot_starter', 'Riot Starter', '🪧', 'mafia', 'Once per game, whip up chaos and force the day\'s vote to be cancelled.',
      { meeting: 'mafia', day: 'Riot Starter cancels today\'s vote (once).', dayUses: 1 }),
    R('mob_lawyer', 'Mob Lawyer', '👔', 'mafia', 'Once per game, make a Mafia player immune from condemnation for the day.',
      { meeting: 'mafia', day: 'Mob Lawyer shields a Mafia player from today\'s condemnation (once).', dayUses: 1 }),

    // =====================================================================
    // THIRD PARTY
    // =====================================================================

    // --- win by being condemned ---
    R('poltergeist', 'Poltergeist', '👻', 'third', 'You win if you are condemned, and you haunt one of your accusers to death.',
      { sideWin: 'condemned', onCondemn: 'The Poltergeist was condemned and wins. Who do they haunt to death?' }),
    R('patsy', 'Patsy', '🤡', 'third', 'You look like Mafia to investigators. You win if the town condemns you.',
      { sideWin: 'condemned', appearsAs: 'mafia' }),
    R('trickster', 'Trickster', '🪄', 'third', 'You cannot be killed at night. Only the vote can end you, and that is exactly what you want.',
      { sideWin: 'condemned', nightImmune: true }),
    R('zealot', 'Zealot', '🙏', 'third', 'You win if condemned, and your sacrifice calms the town: no kills the following night.',
      { sideWin: 'condemned', shield: true, onCondemn: 'The Zealot was condemned and wins: nobody can be killed tonight.' }),

    // --- win by getting a target condemned ---
    R('vendetta', 'Vendetta', '🩸', 'third', 'You are out for a Mafia member. You win if the town condemns your target.',
      { sideWin: 'target', needsTarget: true, night1: 'Secretly give the Vendetta player a Mafia member as their target.' }),
    R('rival', 'Rival', '⚔️', 'third', 'You hold a grudge against a Town player. You win if they are condemned.',
      { sideWin: 'target', needsTarget: true, night1: 'Secretly give the Rival a Town player as their target.' }),
    R('stalker', 'Stalker', '🕷️', 'third', 'Obsessed with one target. Watch them each night and win by getting them condemned.',
      { sideWin: 'target', needsTarget: true, night1: 'Secretly tell the Stalker their target.',
        action: A('watch', 64, 'Stalker, wake up. Whose door do you watch?') }),

    // --- survive-to-win ---
    R('hermit', 'Hermit', '🏔️', 'third', 'You win if you are alive at the end. Night attacks cannot kill you.',
      { winsWith: 'survivor', nightImmune: true }),
    R('prepper', 'Prepper', '🥫', 'third', 'Survive to the end. Twice per game, barricade yourself and shoot any visitor.',
      { winsWith: 'survivor', action: A('alert', 22, 'Prepper, wake up. Barricade tonight?', { targets: 0, uses: 2 }) }),
    R('mercenary', 'Mercenary', '🪖', 'third', 'Survive to the end. Each night you can bodyguard someone for the right side.',
      { winsWith: 'survivor', action: A('guard', 21, 'Mercenary, wake up. Who do you guard?') }),
    R('smuggler', 'Smuggler', '🚢', 'third', 'Survive to the end. Each night, block everyone who goes through one door.',
      { winsWith: 'survivor', action: A('blockVisitors', 14, 'Smuggler, wake up. Whose door do you seal?') }),
    R('hired_gun', 'Hired Gun', '🥷', 'third', 'You only need to survive. Three times per game you may kill at night.',
      { winsWith: 'survivor', action: A('kill', 53, 'Hired Gun, wake up. Who do you take out?', { uses: 3, source: 'hired_gun' }) }),

    // --- profit when town falls ---
    R('vulture', 'Vulture', '🦅', 'third', 'You win if you are alive when the town loses. Each night, pick at a corpse to learn its role.',
      { winsWith: 'town-loss', action: A('autopsy', 58, 'Vulture, wake up. Which dead player do you pick over?', { dead: true }) }),
    R('profiteer', 'Profiteer', '📈', 'third', 'You win if you are alive when the town loses. Each night, watch who visits one player.',
      { winsWith: 'town-loss', action: A('watch', 64, 'Profiteer, wake up. Whose door do you watch?') }),
    R('agent_provocateur', 'Agent Provocateur', '🧪', 'third', 'You win if you are alive when the town loses. Each night, frame a player to stir up trouble.',
      { winsWith: 'town-loss', action: A('frame', 40, 'Agent Provocateur, wake up. Who do you frame?') }),

    // --- secret allies of the Mafia ---
    R('informant', 'Informant', '📡', 'third', 'You win with the Mafia. Each night you learn a player\'s exact role.',
      { winsWith: 'mafia', action: A('investigate', 61, 'Informant, wake up. Whose role do you check?', { check: 'role' }) }),
    R('collaborator', 'Collaborator', '🧤', 'third', 'You win with the Mafia. Each night, distract a player so they cannot act.',
      { winsWith: 'mafia', action: A('block', 11, 'Collaborator, wake up. Who do you distract?') }),
    R('fifth_columnist', 'Fifth Columnist', '🪆', 'third', 'You win with the Mafia while looking perfectly innocent to investigators.',
      { winsWith: 'mafia', appearsAs: 'innocent' }),

    // --- killing factions ---
    R('werewolf', 'Werewolf', '🐺', 'third', 'A lone killer who cannot be killed at night. Kill every night and outlast everyone.',
      { faction: 'killer', nightImmune: true, action: A('kill', 52, 'Werewolf, wake up. Who do you maul?', { source: 'werewolf' }) }),
    R('arsonist', 'Arsonist', '🔥', 'third', 'A lone killer who looks innocent to investigators. Burn the town down.',
      { faction: 'killer', appearsAs: 'innocent', action: A('kill', 52, 'Arsonist, wake up. Who do you burn?', { source: 'arsonist' }) }),

    // --- cult members (need a Cult Leader in the game) ---
    R('cult_seer', 'Cult Seer', '👁️', 'third', 'Cult member who recruits with the leader and each night learns one player\'s exact role.',
      { faction: 'cult', meeting: 'cult', action: A('investigate', 61, 'Cult Seer, wake up. Whose role do you see?', { check: 'role' }) }),
    R('cult_guard', 'Cult Guard', '🗿', 'third', 'Cult member who recruits with the leader and each night bodyguards one player.',
      { faction: 'cult', meeting: 'cult', action: A('guard', 21, 'Cult Guard, wake up. Who do you guard?') }),
  ];
}
