// ════════════════════════════════════════════════════════════════════════
// src/data/codex.js — THE HEARTH CODEX: the in-game glossary.
//
// Every sentence here is a claim about the live game, and every claim names a
// predicate (`bind`) that tests/codex-claims.mjs evaluates against the engine
// (src/core, src/data) or the SQL authority (supabase/migrations, read as
// text). If the game changes under a sentence, that guard goes RED and the
// sentence is rewritten; the Codex cannot quietly drift into a lie.
//
// Shape: { id, group, term, text, door, claims: [{ s, bind }] }
//   s     the index of a sentence in `text` (split after each full stop)
//   bind  the name of a predicate in tests/codex-claims.mjs BINDS
//   door  { tab } → showTab(tab) · { opener } → window.<opener>() · null
//
// Deliberately absent (not live for players): Rested XP, Hunts, Hearth Tokens,
// Rooms. Field Salvage has no entry yet. Vigour states its away rate only: the
// attended top-up loot and the live combat-XP credit do not read Vigour yet
// (Security SEC-VIG-A1, 2026-09-27).
//
// No numbers, no state, no field named like an effect (recovery-relief-guard
// walks every src/data export). Reached ONLY through a dynamic import from
// src/features/codex.js, never from the hr-accrue bundle.
// ════════════════════════════════════════════════════════════════════════

const f = Object.freeze;
const entry = (id, group, term, text, door, claims) =>
  f({ id, group, term, text, door: door ? f(door) : null,
    claims: f(claims.map(([s, bind]) => f({ s, bind }))) });

export const CODEX_GROUPS = f([
  f({ id: 'first', label: 'First things' }),
  f({ id: 'fighting', label: 'Fighting' }),
  f({ id: 'home', label: 'Home and hands' }),
  f({ id: 'coin', label: 'Coin' }),
  f({ id: 'records', label: 'Records' }),
  f({ id: 'realm', label: 'The realm' }),
]);

export const CODEX_ENTRIES = f([
  entry('away-time', 'first', 'Away time',
    'Close the game and your hero keeps doing the last thing you set, at the same pace as if you were watching, though realm-wide blessings pause while you are gone. When you come back the realm pays out what was earned, up to your away limit.',
    { tab: 'profile' },
    [[0, 'awayPaysLiveRate'], [0, 'awayScope'], [1, 'awayCapped'], [1, 'awayCapNoRaiser']]),
  entry('your-hero', 'first', 'Your hero',
    'Your hero lives on the server, not in your browser, so closing a tab or switching device keeps everything you have earned.',
    null,
    [[0, 'residueNoProgression']]),
  entry('total-level', 'first', 'Total level',
    "Every skill's level added together, and the plainest measure of how much you have done. It also counts toward your renown.",
    { tab: 'character' },
    [[0, 'totalLevelSum'], [1, 'totalLevel']]),
  entry('daily-reward', 'first', 'Daily reward',
    'Claim one reward each day from the Home screen. The rewards climb through the week and each finished week makes the next one richer, but a missed day starts the streak over from the beginning.',
    { tab: 'profile' },
    [[0, 'daily'], [1, 'daily']]),
  entry('renown', 'first', 'Renown',
    "The realm's measure of what you have done: your levels, kills, bosses slain, items collected, days played in a row and gold. Every rank above Peasant pays a reward you claim, and a rank once reached is never taken away.",
    { opener: 'HearthriseRenown.openLadder' },
    [[0, 'renownTerms'], [1, 'rankRewards'], [1, 'rankRatchet']]),

  entry('combat-level', 'fighting', 'Combat level',
    'One number for how dangerous you are: your Defence, Hitpoints and half your Prayer, plus your strongest way of fighting, whether blade, bow or spell.',
    { tab: 'character' },
    [[0, 'prayerHalf'], [0, 'bestStyleOnly']]),
  entry('weakness', 'fighting', 'Weakness',
    'Every monster has a weapon it fears, and most also have an element they cannot stand. Bring the weapon it fears and your blows land more often and hit harder. A few strange foes hide their element until you have studied their class.',
    { tab: 'combat' },
    [[0, 'weakness'], [1, 'weakness'], [2, 'weakness']]),
  entry('knocked-out', 'fighting', 'Knocked out',
    'A fall does not end a fight. You stand back up on part of your health and carry on against the same foe. The first fall of each day costs no time, later falls can keep you down longer, and a hero who keeps falling without a single win pulls back to camp.',
    { tab: 'combat' },
    [[0, 'falls'], [1, 'falls'], [2, 'falls']]),
  entry('auto-eat', 'fighting', 'Auto-Eat',
    'Every hero starts owning Auto-Eat. When your health runs low it eats from your bag, in a fight you are watching or on a night away. Auto-Eat II, bought with Bounty Marks, lets you choose how low is low.',
    { tab: 'bounty' },
    [[0, 'autoEat'], [1, 'autoEat'], [2, 'autoEat']]),
  entry('bounty-marks', 'fighting', 'Bounty Marks',
    "Every finished bounty contract pays gold, Bounty Hunter experience and Marks. Marks buy Auto-Eat II and, in the Bounty Board's own shop, things like Auto-Accept, rerolls and the Hunter Cloak.",
    { tab: 'bounty' },
    [[0, 'bounty'], [1, 'bounty'], [1, 'autoEat']]),
  entry('vigour', 'fighting', 'Vigour',
    'Vigour is your daily allowance of hunting at the full rate, and it renews at midnight UTC. Past it a hunt carries on, and while you are away it pays only a small share of its usual rate. Gathering, cooking and crafting never spend Vigour, and refills are sold for gold on the Fight screen.',
    { tab: 'combat' },
    [[0, 'vigourBudget'], [1, 'vigourDryAway'], [2, 'vigourScope']]),
  entry('dungeons', 'fighting', 'Dungeons',
    "A dungeon is a short run behind a locked door that opens only with its own key, spent from your bag when the run is settled. Its chest is rolled by the realm, whatever your score, and it can hold room blueprints, rare boss gear and Farmer's Deeds. After a run each dungeon rests for a while before it opens again.",
    { tab: 'events' },
    [[0, 'dungeonKeys'], [1, 'dungeonChest'], [1, 'deeds'], [2, 'dungeonRest']]),
  entry('boss-of-the-day', 'fighting', 'Boss of the Day',
    'Each day the realm names a Boss of the Day, and each week a Weekly Boss. While featured, that monster drops its loot more often and gives more experience for each kill, watching or away, and the Weekly Boss gives the most.',
    { tab: 'combat' },
    [[0, 'botdPools'], [1, 'botdBonus']]),

  entry('property', 'home', 'Property',
    'Your home climbs tier by tier all the way to Hearthrise Castle. Each tier is paid for in gold and in things you gathered and made, and a bigger home lets you build more rooms, farm more plots and hire more hands.',
    { tab: 'house' },
    [[0, 'property'], [1, 'property']]),
  entry('hired-hands', 'home', 'Hired hands',
    'A hired hand works for you at a small share of your own pace, whether you are playing or away. Hands grow better with practice but never match you, and each one is hired with gold.',
    { tab: 'house' },
    [[0, 'workers'], [1, 'workers']]),
  entry('farmers-deeds', 'home', "Farmer's Deeds",
    'A Farmer\'s Deed turns up in dungeon chests. It can pay for your next farm plot upgrade instead of gold, and it sells on the Market, so a lucky delver can fund a farmer.',
    { tab: 'farming' },
    [[0, 'deeds'], [1, 'deeds']]),
  entry('companions', 'home', 'Companions',
    'Each companion is found its own way, from a monster that drops it to a shop, a skill worked long enough or a boss. The one you bring along earns experience from the work that suits it, and a higher level makes its help stronger.',
    { tab: 'stable' },
    [[0, 'companions'], [1, 'companions']]),

  entry('gems', 'coin', 'Gems',
    'Gems come from the daily reward, renown ranks and collection milestones. They buy extra hero slots, themes and looks, and never experience, levels or gear.',
    { tab: 'shops' },
    [[0, 'gems'], [1, 'gems']]),
  entry('dungeon-scrip', 'coin', 'Dungeon Scrip',
    'Scrip is paid out for clearing dungeons, and the quartermaster takes it for dungeon keys and room blueprints, so every clear helps pay for the next.',
    { opener: 'openQuartermaster' },
    [[0, 'scrip']]),

  entry('collection-log', 'records', 'Collection Log',
    'Every item you have ever found and every monster you have ever slain is noted in your Collection Log. Reaching a milestone pays a reward you claim, and some of them pay gems too.',
    { opener: 'HearthriseCollection.open' },
    [[0, 'collection'], [1, 'collection']]),
  entry('charms', 'records', 'Charms',
    "Slay enough monsters of one class and the realm grants you that class's charm. Its first rank reveals any element those foes were hiding, and each rank after makes them drop their loot a little more often.",
    { opener: 'openBestiary' },
    [[0, 'charms'], [1, 'charms']]),
  entry('trophies', 'records', 'Trophies',
    'Every monster keeps its own count of how many you have slain, and a long enough count earns its trophy. Each stage after the first makes that monster drop its loot a little more often, watching or away.',
    { opener: 'openBestiary' },
    [[0, 'trophies'], [1, 'trophies']]),
  entry('hearthfinds', 'records', 'Hearthfinds',
    'Once in a very long while something so rare turns up that the whole realm is told. A Hearthfind is announced in chat, under your name unless you have chosen to stay quiet, and you can copy its card to show it off.',
    null,
    [[0, 'hearthfind'], [1, 'hearthfind']]),
  entry('lucky-finds', 'records', 'Lucky finds',
    'A few hunting spots hide a lucky find, a named piece of gear that turns up only once in a very long while. The realm rolls it on every kill at that spot, watching or away, and never with the dice in your own browser.',
    { opener: 'openBestiary' },
    [[0, 'luckyRows'], [1, 'luckySilence']]),
  entry('the-common', 'realm', 'The Common',
    "The Common on Home shows who else is about in the realm and what each of them is doing, and a hero who has only just stepped away still shows for a little while, only dimmer. Press Go quiet and the hero you are playing, finds and all, is left off everyone else's Common until you rejoin.",
    { tab: 'profile' },
    [[0, 'commonShowsActivity'], [1, 'commonQuietHidesYou']]),
  entry('parties', 'realm', 'Parties',
    'A party is a small band you form on the Party screen, inviting adventurers by their name. Its leader picks a monster and a stance to start a hunt, and every member sees the kills and what each one earned. Whoever is away too long makes camp and rejoins by coming back. Party hunting switches on during the beta.',
    { tab: 'party' },
    [[0, 'partyInviteByName'], [1, 'partyHuntLeaderStarts'], [2, 'partyCampRejoinsOnReturn'], [3, 'partyHuntGated']]),
]);
