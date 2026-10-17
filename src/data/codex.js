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
// Rooms. Daily rewards, renown, bounties, dungeons, Boss of the Day, gems,
// charms and parties left with their systems (demolition, 2026-10-14). Field Salvage has no entry yet. Vigour states its away rate only: the
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
  f({ id: 'records', label: 'Records' }),
  f({ id: 'realm', label: 'The realm' }),
]);

export const CODEX_ENTRIES = f([
  entry('away-time', 'first', 'Away time',
    'Close the game and your hero keeps doing the last thing you set, at the same pace as if you were watching. When you come back the realm pays out what was earned, up to your away limit.',
    { tab: 'profile' },
    [[0, 'awayPaysLiveRate'], [0, 'awayScope'], [1, 'awayCapped'], [1, 'awayCapNoRaiser']]),
  entry('your-hero', 'first', 'Your hero',
    'Your hero lives on the server, not in your browser, so closing a tab or switching device keeps everything you have earned.',
    null,
    [[0, 'residueNoProgression']]),
  entry('total-level', 'first', 'Total level',
    "Every skill's level added together, and the plainest measure of how much you have done.",
    { tab: 'character' },
    [[0, 'totalLevelSum']]),
  entry('combat-level', 'fighting', 'Combat level',
    'One number for how dangerous you are: your Defense, Hitpoints and half your Prayer, plus your strongest way of fighting, whether blade, bow or spell.',
    { tab: 'character' },
    [[0, 'prayerHalf'], [0, 'bestStyleOnly']]),
  entry('weakness', 'fighting', 'Weakness',
    'Every monster has a weapon it fears, and most also have an element they cannot stand. Bring the weapon it fears and your blows land more often and hit harder.',
    { tab: 'combat' },
    [[0, 'weakness'], [1, 'weakness']]),
  entry('knocked-out', 'fighting', 'Knocked out',
    'A fall does not end a hunt. You lie knocked out for a short while, the same short while for every fall, then stand back up on part of your health and carry on hunting.',
    { tab: 'combat' },
    [[0, 'falls'], [1, 'falls']]),
  entry('property', 'home', 'Property',
    'Your home climbs tier by tier all the way to Hearthrise Castle. Each tier is paid for in gold and in things you gathered and made, and a bigger home lets you build more rooms, farm more plots and hire more hands.',
    { tab: 'house' },
    [[0, 'property'], [1, 'property']]),
  entry('hired-hands', 'home', 'Hired hands',
    'A hired hand works for you at a small share of your own pace, whether you are playing or away. Hands grow better with practice but never match you, and each one is hired with gold.',
    { tab: 'house' },
    [[0, 'workers'], [1, 'workers']]),

  entry('collection-log', 'records', 'Collection Log',
    'Every item you have ever found and every monster you have ever slain is noted in your Journal, under Collection. Reaching a milestone pays a reward you claim.',
    { tab: 'collection' },
    [[0, 'collection'], [1, 'collection']]),
  entry('trophies', 'records', 'Trophies',
    'Every monster keeps its own count of how many you have slain, and a long enough count earns its trophy. A trophy is a record to show off, and it never changes what that monster drops.',
    { tab: 'bestiary' },
    [[0, 'trophies'], [1, 'trophies']]),
  entry('hearthfinds', 'records', 'Hearthfinds',
    'Once in a very long while something so rare turns up that the whole realm is told. A Hearthfind is announced in chat, under your name unless you have chosen to stay quiet, and you can copy its card to show it off.',
    null,
    [[0, 'hearthfind'], [1, 'hearthfind']]),
  entry('lucky-finds', 'records', 'Lucky finds',
    'A few hunting spots hide a lucky find, a named piece of gear that turns up only once in a very long while. The realm rolls it on every kill at that spot, watching or away, and never with the dice in your own browser.',
    { tab: 'collection' },
    [[0, 'luckyRows'], [1, 'luckySilence']]),
  entry('the-common', 'realm', 'The Common',
    "The Common on Home shows who else is about in the realm and what each of them is doing, and a hero who has only just stepped away still shows for a little while, only dimmer. Press Go quiet and the hero you are playing, finds and all, is left off everyone else's Common until you rejoin.",
    { tab: 'profile' },
    [[0, 'commonShowsActivity'], [1, 'commonQuietHidesYou']]),
]);
