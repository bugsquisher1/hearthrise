// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/model.mjs — THE ONE SHARED BALANCE MODEL, AS DATA (balance program, phase 1).
// The words are in docs/design/balance-program/01-model.md; this file is what measure.mjs and every
// phase-2 dive read so that a number means the same thing in every dive.
//
//   LEDGERS            the ten quantities every system is booked in (a source, a sink or a converter)
//   STACK_CLASSES      the four ways a lever may combine, and the cap each class carries
//   LEVERS             every lever known today, its class and its size (label: MEASURED / CITED / RULED / PROPOSED)
//   LEVER_CLASSES      the classes a lever may hold: the four stack classes, a gold source or sink, cut, dark
//   LEVER_KEYS         every lever the DATA carries, by the key the balance guard's scan reads (G14), and the LEVERS row that classes it
//   REF_POINTS         the Levels and grounds every dive measures at
//   REF_SEATS          the three played parties that are "1.00" at a point
//   REFERENCE_PLAYERS  the seven accounts every dive prices its system for (re-based on real players)
//   REAL_OWN_FOUR_NET  what real own fours net in gold; HARNESS_GAPS where the harness disagrees with real play
//   REAL_KRELL_FOUR    the heavy four's Krell hunt of 2026-11-20 (11-krell-hunt-2026-11-20.md): the harness's calibration point
//   SERVER_AGES        the three server ages every dive answers for
//   POPULATIONS        the three populations every dive answers for
//
// PURE ESM. Data only. Imports nothing. Nothing here is a combat number: sizes are citations of measurements,
// kept so a dive can see when its own measurement disagrees.
// ════════════════════════════════════════════════════════════════════════

export const LEDGERS = Object.freeze([
  { id: 'power', unit: 'x REF Level XP an hour (kill speed) and x REF damage taken an hour, at a REF point', home: 'measure.mjs what' },
  { id: 'level_xp', unit: 'Level XP an hour a hero; hours to a Level against LEVEL_PACE (src/data/core-model.js)', home: 'measure.mjs ref' },
  { id: 'skill_xp', unit: 'skill XP an hour a hero, by skill; combat skills against the career line (tools/balance-sim/skill-lines.json), bench skills against hours to 99', home: 'measure.mjs ref' },
  { id: 'gold', unit: 'gold an hour a hero (in, store bill, net); a price in REF HOURS = price / REF net gold an hour at the buyer\'s Level', home: 'measure.mjs price' },
  { id: 'items', unit: 'pieces an hour by gear tier and loot band; hours a named row (1 / rate); stock made an hour at a bench', home: 'cell rows rareEveryH, loot' },
  { id: 'hunt_hours', unit: 'hero-hours hunted a day: 12 a hero for every reference player (RULED, Tyler 2026-11-21); the hours real people hunted are REFERENCE_PLAYERS.realHuntHoursADay, a record only', home: 'REFERENCE_PLAYERS.huntHoursADay' },
  { id: 'town_hours', unit: 'hero-hours a day at a node or a bench (REAL: 1.57 for every hunted hour; a hero rests its stamina while it works)', home: 'REFERENCE_PLAYERS.townHoursADay' },
  { id: 'attention', unit: 'attended minutes a day, the human\'s own time (REAL: a visit is 2 to 5 minutes, 2 to 6 visits a day)', home: 'REFERENCE_PLAYERS.attendedMinADay' },
  { id: 'stamina', unit: 'hours of bar; 1:1 drain hunting, 1:1 refill resting', home: 'src/data (stamina rows), rulings' },
  { id: 'server_cost', unit: 'statements, row writes and ledger rows a hero-hour; edge CPU ms a settle', home: 'measure.mjs cost (tests/per-player-cost.mjs)' },
]);

/* HOW A LEVER MAY COMBINE. Every lever is exactly one class; a dive that finds a lever in no class has found a system change. */
export const STACK_CLASSES = Object.freeze([
  { id: 'replace', rule: 'One worn at a time; the better one replaces the other. Never sums with its own kind.', cap: 'the next tier\'s step (a tier is +5 to +9% XP)', examples: 'weapon tier, armor tier, Tower weapon, a unique, a Catacomb piece' },
  { id: 'add', rule: 'Small optional sources on the gear side. They ADD into one pool and the pool is capped.', cap: 'the whole pool at most ONE weapon tier step of XP (+9%) and one armor tier step of damage taken, at every Level', examples: 'accessories, perks, Tempering, worn in, linings (one shared 40% cap an element), +skill from items and the yard, room rungs on combat' },
  { id: 'multiply', rule: 'A choice of how to play. It multiplies with everything, so each one is budgeted by name and the PRODUCT is capped.', cap: 'product of every multiply lever a head at most 2.0x REF (pace band), lone or party', examples: 'the way you fight, tier, party, solo boost, events, new spell slots on the bar, faction skills' },
  { id: 'time', rule: 'Hours, not rate. Multiplies account output, never a hero\'s rate.', cap: 'a hero 24 hunted hours a day; an account four heroes', examples: 'stamina cap, refills, Premium\'s 12 h bar, hero slots' },
]);

export const LEVERS = Object.freeze([
  { id: 'weapon-tier', cls: 'replace', on: 'power', size: '+5 to +9% XP a tier', label: 'MEASURED', system: 'gear-tiers' },
  { id: 'armor-tier', cls: 'replace', on: 'power', size: '12 to 47% more damage taken a tier behind', label: 'MEASURED', system: 'gear-tiers' },
  { id: 'tower-weapon', cls: 'replace', on: 'power', size: '+0.0 to +0.9% XP today; ruled "pretty major"', label: 'MEASURED', system: 'hearth-chest' },
  { id: 'accessories', cls: 'add', on: 'power', size: '+4 to +8% XP hammer, +0.4 to +3% mage; -4 to -12% taken', label: 'MEASURED', system: 'jewelry' },
  { id: 'tempering', cls: 'add', on: 'power', size: '+2.3 to +3.5% XP; -0.3 to -8% taken (both tracks 5 of 5)', label: 'MEASURED', system: 'tempering' },
  { id: 'skill-bump', cls: 'add', on: 'power', size: '+10 skills: +1 to +7% XP; -64% taken at Level 10 falling to 0 at 105', label: 'MEASURED', system: 'training' },
  { id: 'linings', cls: 'add', on: 'power', size: '20 / 25 / 30% of one element, 40% cap with gear', label: 'CITED', system: 'linings' },
  { id: 'perks-worn-in', cls: 'add', on: 'power', size: 'about +1% a perk; worn in under half a weapon step', label: 'PROPOSED', system: 'worn-in' },
  { id: 'way', cls: 'multiply', on: 'level_xp', size: 'mage / hammer alone 1.23 to 1.74', label: 'MEASURED', system: 'weapon-roles' },
  { id: 'tier-party', cls: 'multiply', on: 'level_xp', size: 'Deadly four a head / lone hammer 0.54 to 2.33', label: 'MEASURED', system: 'difficulty-tiers' },
  { id: 'solo-boost', cls: 'multiply', on: 'level_xp', size: '+15% alone', label: 'RULED', system: 'parties' },
  { id: 'new-elements', cls: 'multiply', on: 'level_xp', size: 'lone sword +12.8% (one spell), +29.2% (both)', label: 'CITED', system: 'necrotic-storm' },
  { id: 'bonus-weekend', cls: 'multiply', on: 'level_xp', size: '+25% for 3 days in 14', label: 'DESIGNED', system: 'live-events' },
  { id: 'faction-skill', cls: 'multiply', on: 'level_xp', size: 'unsized', label: 'PROPOSED', system: 'faction-skills' },
  { id: 'stamina-cap', cls: 'time', on: 'hunt_hours', size: 'free 8 h bar, premium 12 h bar', label: 'RULED', system: 'stamina' },
  { id: 'refills', cls: 'time', on: 'hunt_hours', size: 'up to 4 h each, six a day', label: 'RULED', system: 'stamina-refill' },
  { id: 'hero-slots', cls: 'time', on: 'hunt_hours', size: 'x4 heroes at once', label: 'RULED', system: 'hero-slots' },
  { id: 'magic-find', cls: 'add', on: 'items', size: 'one budget of 104 a hero, Rare rows only', label: 'RULED', system: 'luck' },
  { id: 'rarer-past-krell', cls: 'multiply', on: 'items', size: 'Rare rows -15% at band 8 to -25% at band 18', label: 'RULED', system: 'loot' },
  { id: 'good-batch', cls: 'add', on: 'items', size: '2% at 1 to 10% at 99, consumables', label: 'RULED', system: 'crafting-chase' },
  /* Booked 2026-11-20 by the balance guard's lever scan (G14, lane/c-balance-guard): levers the data carries that had no row. A class marked
     PROPOSED is the guard lane's reading of 30-plan section B for the designer to confirm; nothing in the game moved. */
  { id: 'food-xp-buffs', cls: 'cut', on: 'level_xp', size: 'a meal: +2 to +3% Level, combat XP or drops for minutes', label: 'READ FROM DATA; cut RULED-pending (23-6, C6, C14)', system: 'cooking' },
  { id: 'food-combat-buffs', cls: 'add', on: 'power', size: 'a meal: +2 to +5 damage, crit or Defense for minutes; the Cellar lengthens them', label: 'READ FROM DATA; class PROPOSED (C6 keeps them)', system: 'cooking' },
  { id: 'town-speed', cls: 'add', on: 'town_hours', size: 'room rungs and meals: +2 to +10% a bench, plots, no-burn, materials saved', label: 'READ FROM DATA; class PROPOSED', system: 'rooms' },
  { id: 'charms', cls: 'cut', on: 'items', size: 'x1.01 to x1.03 drops, x1.01 to x1.03 damage a creature', label: 'READ FROM DATA; cut (C14, 30-9)', system: 'bestiary' },
  { id: 'trophy-multipliers', cls: 'cut', on: 'items', size: 'trophy x1.03 drops, x1.01 damage; memory x1.07 drops', label: 'READ FROM DATA; cut (27-3, L20)', system: 'bestiary' },
  { id: 'band-boost', cls: 'cut', on: 'items', size: 'a studied relic x1.25 on the Trophy row', label: 'READ FROM DATA; cut (C14)', system: 'loot' },
  { id: 'monster-drop-bonus', cls: 'cut', on: 'items', size: 'x1.15 drops on the seven rows that were once neutral', label: 'READ FROM DATA; class PROPOSED (C14: one drop budget)', system: 'loot' },
  { id: 'companions', cls: 'dark', on: 'power', size: 'a pet: +1% XP, rare drops, gold find, town speed, procs', label: 'READ FROM DATA; held with no lane (30-plan D)', system: 'companions' },
  { id: 'session-share', cls: 'multiply', on: 'level_xp', size: 'the Tower and the Catacombs pay 375 permille of a hunt\'s Level XP', label: 'READ FROM DATA', system: 'tower' },
  { id: 'scaled-hunts', cls: 'multiply', on: 'level_xp', size: 'a scaled early hunt: XP, coin and drops by its own dials', label: 'READ FROM DATA; dark until L31 (22-9)', system: 'scaled-hunts' },
  { id: 'event-fee', cls: 'multiply', on: 'gold', size: 'open halls: a Call-out fee cut for the event', label: 'READ FROM DATA', system: 'live-events' },
  { id: 'blessings', cls: 'sink', on: 'gold', size: 'keeps 25 / 50 / 75% of a death\'s Level XP for a fee by Level', label: 'RULED (11-10)', system: 'blessings' },
  { id: 'premium-gift', cls: 'source', on: 'items', size: 'Premium\'s daily gift', label: 'RULED (24-4, amended C9)', system: 'premium' },
]);

/* THE CLASSES A LEVER MAY HOLD (balance guard G14). The four stack classes, a gold source or sink (30-plan section B's "Source" and "Sink"),
   and two that hold a lever still to be decided: `cut` (ruled or proposed out; its rows may only shrink, the guard pins their count) and
   `dark` (in the data and unreachable by a player; pinned the same way until it is classed). */
export const LEVER_CLASSES = Object.freeze([...STACK_CLASSES.map((c) => c.id), 'source', 'sink', 'cut', 'dark']);

/* EVERY LEVER THE DATA CARRIES (balance guard G14, tools/balance-program/guard-cells.mjs LEVER_CARRIERS reads them): the key a carrier
   answers -> the LEVERS row that classes it. A key the scan finds that is not here is a stranger, and G14 is red. Adding a lever is one
   row here (and a LEVERS row when it is a new kind), in the same commit as the data that carries it. */
export const LEVER_KEYS = Object.freeze({
  'buff:all_xp': 'food-xp-buffs', 'buff:combat_xp': 'food-xp-buffs', 'buff:drop_rate': 'food-xp-buffs',
  'buff:damage': 'food-combat-buffs', 'buff:damage_crit': 'food-combat-buffs', 'buff:defense': 'food-combat-buffs',
  'buff:gather_speed': 'town-speed', 'buff:farm_yield': 'town-speed',
  'room-perk:buffDuration': 'food-combat-buffs', 'room-perk:cookSpeed': 'town-speed', 'room-perk:craftSave': 'town-speed', 'room-perk:craftSpeed': 'town-speed',
  'room-perk:farmPlots': 'town-speed', 'room-perk:noBurn': 'town-speed', 'room-perk:flameSpeed': 'town-speed', 'room-perk:runeSpeed': 'town-speed',
  'room-perk:smithSpeed': 'town-speed',
  'jewel-perk:keen': 'perks-worn-in', 'jewel-perk:surge': 'perks-worn-in', 'jewel-perk:follow': 'perks-worn-in', 'jewel-perk:thrift': 'perks-worn-in',
  'jewel-perk:deflect': 'perks-worn-in', 'jewel-perk:second_wind': 'perks-worn-in', 'jewel-perk:steady': 'perks-worn-in', 'jewel-perk:focus': 'perks-worn-in',
  'charm:drop': 'charms', 'charm:damage': 'charms',
  'trophy:drop': 'trophy-multipliers', 'trophy:damage': 'trophy-multipliers', 'memory:drop': 'trophy-multipliers',
  'band-boost:trophy': 'band-boost',
  'monster:dropBonus': 'monster-drop-bonus',
  'companion:bonus': 'companions', 'companion:proc': 'companions',
  'tier:dangerous': 'tier-party', 'tier:deadly': 'tier-party', 'party:class-xp': 'tier-party', 'party:solo': 'solo-boost',
  'session-mode:tower': 'session-share', 'session-mode:catacomb': 'session-share',
  'scaled-hunt': 'scaled-hunts',
  'event:xp_bonus': 'bonus-weekend', 'event:open_halls': 'event-fee',
  'skill-xp:ability': 'way', 'skill-xp:basic': 'way',
  'temper:blows': 'tempering', 'temper:armor': 'tempering',
  'training-item': 'skill-bump',
  'blessing': 'blessings',
  'stamina:free': 'stamina-cap', 'stamina:premium': 'stamina-cap', 'premium:stamina': 'stamina-cap', 'premium:login': 'premium-gift',
  'refill': 'refills',
  'hero-slot': 'hero-slots',
});

/* WHERE every dive measures. `open` false = the ground is staged; measure.mjs plays it with gear.openAlso. */
export const REF_POINTS = Object.freeze([
  { id: 'thicket', ground: 'meadowbrook_thicket', level: 10, gearTier: 1, open: true },
  { id: 'glade', ground: 'mosslight_glade', level: 30, gearTier: 3, open: true },
  { id: 'ford', ground: 'hasks_ford', level: 50, gearTier: 4, open: true },
  { id: 'slake', ground: 'the_slake', level: 60, gearTier: 5, open: true },
  { id: 'pyre', ground: 'pyre_field', level: 80, gearTier: 6, open: true },
  { id: 'hold', ground: 'krells_hold', level: 105, gearTier: 7, open: true },
  { id: 'rest', ground: 'carters_rest', level: 118, gearTier: 7, open: false },
  { id: 'catacombs', ground: 'unmarked_catacombs', level: 175, gearTier: 7, open: false },
]);
/* Levels past the last playable ground are answered from formulas only (measure.mjs curves): 240, 400. */
export const FORMULA_ONLY_LEVELS = Object.freeze([240, 400]);

/* WHO is 1.00. Played profile (tools/balance-sim/played.mjs), skills on the career line, store supplies. */
export const REF_SEATS = Object.freeze([
  { id: 'lone', name: 'lone hammer, Normal', party: ['hammer'], tier: 'normal', note: 'THE unit: 1.00 of every power and gold ratio' },
  { id: 'mage', name: 'lone Mage, Normal', party: ['mage'], tier: 'normal', note: 'the fastest lone way; the caster\'s supply bill' },
  { id: 'four', name: 'four (tank, Healer, bow, Mage), hardest tier the ground has, a head', party: ['tank', 'healer', 'bow', 'mage'], tier: 'hardest', note: 'the party ceiling' },
]);

/* WHO pays. Re-based 2026-11-20 on docs/design/balance-program/10-real-players.md (4 people, 16 heroes, 1,334 hunted hours;
   thin past Level 46). REAL rows are what people did; ASSUMED rows are players nobody has been yet, kept because the game must
   hold against them. weight is the share of design attention, not a population share: the own four is 91% of real hunt hours.
   huntHoursADay and townHoursADay are a hero's. spends = the share of earned gold the account puts into sinks.

   RE-BASED 2026-11-21 (Tyler, verbatim: "you should always be assuming that every person is going to hunt 12 hours a day since it's an
   idle game."). huntHoursADay is 12 for every player but the Ceiling (24, the guard row). Real-player data calibrates RATES (XP, gold,
   drops, deaths an hour), never hours: what each real player hunted stays as realHuntHoursADay, read by nothing that counts days or weeks.
   WHY 12 NEEDS NO REFILL: stamina drains 1:1 hunting and rests 1:1 in town, so a hero that hunts every hour its bar allows hunts exactly
   half the day, 12 h, whatever its cap. The cap sets the visits: the free 8 h bar needs two starts a day 12 h apart (8 h, rest 4, 4 h,
   rest 8), Premium's 12 h bar one. Each refill adds 2 h a day (4 h hunted, 4 h of rest lost), so six make the Ceiling's 24.
   refillsADay is therefore 0 at 12 h. A free hero started ONCE a day hunts 8 h and buys one refill for 12 (FREE_ONE_VISIT). */
export const HUNT_HOURS_A_DAY = 12;
export const FREE_ONE_VISIT = Object.freeze({ huntHoursADay: 8, refillsFor12: 1 });
export const REFERENCE_PLAYERS = Object.freeze([
  { id: 'new', name: 'New', heroes: 1, seat: 'lone', premium: false, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: 2, townHoursADay: 2, attendedMinADay: 10, refillsADay: 0, stock: 'store', spends: 0.1, weight: 'high', label: 'REAL, thin (2 people, 18 h)',
    note: 'one or two heroes alone on Normal, Levels 1 to 15. Dies 8.9 times in 100 hours. Both real ones stopped at Level 7 to 9: one never met the town, one never came back from it' },
  { id: 'ownfour', name: 'Own four', heroes: 4, seat: 'four', premium: false, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: 3.3, townHoursADay: 5, attendedMinADay: 10, refillsADay: 0, stock: 'third own', spends: 0.17, weight: 'highest', label: 'REAL (2 people, 813 h)',
    note: 'THE real player: one person, four of their own heroes as a Deadly party from about Level 10, two visits a day of under four minutes, away eleven hours (really 3.3 hunted hours a hero a day; counted at 12, the ruling). Saves: holds 2.09M with nothing it wants' },
  { id: 'heavy', name: 'Heavy four', heroes: 4, seat: 'four', premium: false, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: 8.4, realRefillsADay: 1.4, townHoursADay: 6, attendedMinADay: 35, refillsADay: 0, stock: 'third own', spends: 0.97, weight: 'high', label: 'REAL, thin (1 person, 503 h)',
    note: 'the own four checked six times a day (really 8.4 hunted hours a hero a day on 1.4 refills; counted at 12 with none). Level 75 in 100 to 119 hunted hours a hero. Spends everything: Tempering, rooms, refills' },
  { id: 'premium', name: 'Premium own four', heroes: 4, seat: 'four', premium: true, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: null, townHoursADay: 5, attendedMinADay: 10, refillsADay: 0, stock: 'third own', spends: 0.17, weight: 'medium', label: 'ASSUMED',
    note: 'the Own four with Premium on every hero. Both hunt 12 hours a day: the free four by starting its hunts twice a day, this one once. Premium\'s 12 hour bar buys the second visit back, not more hours' },
  { id: 'ceiling', name: 'Ceiling', heroes: 4, seat: 'four', premium: true, huntHoursADay: 24, realHuntHoursADay: null, townHoursADay: 0, attendedMinADay: 120, refillsADay: 6, stock: 'own', spends: 1, weight: 'guard', label: 'ASSUMED',
    note: 'nobody yet: four heroes hunting every hour the rules allow. The pace and inflation ceiling a server of 1,000 will contain' },
  { id: 'whale', name: 'Buyer', heroes: 4, seat: 'four', premium: true, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: null, townHoursADay: 0, attendedMinADay: 35, refillsADay: 0, stock: 'market', spends: 1, weight: 'guard', label: 'ASSUMED',
    note: 'the Heavy four who sells Crowns for gold: gold is no limit, so every gold sink is bought the day it opens. At 12 hours like everyone; with all six refills it is the Ceiling' },
  { id: 'friends', name: 'Four friends', heroes: 1, seat: 'four', premium: false, huntHoursADay: HUNT_HOURS_A_DAY, realHuntHoursADay: null, townHoursADay: 3, attendedMinADay: 30, refillsADay: 0, stock: 'third own', spends: 0.5, weight: 'promise', label: 'ASSUMED (0 real hours with another person)',
    note: 'four ACCOUNTS, one hero each, hunting together: the party the game is sold on, and so far never played' },
]);

/* WHAT REAL OWN FOURS NET, gold a hero-hour (10-real-players.md section 4: income less store supplies, by account, with a third of
   supplies home-made). [top Level of the account, net]. The harness's four buys every supply at the store and reads NEGATIVE where
   the real four is +9k: until the harness plays own stock, measure.mjs price uses these for four-seat players up to Level 84. THIN. */
export const REAL_OWN_FOUR_NET = Object.freeze([[46, 6530], [55, 7495], [84, 9078]]);

/* THE HEAVY FOUR'S KRELL HUNT (docs/design/balance-program/11-krell-hunt-2026-11-20.md, REAL, THIN: one person, one day, 39 hero-hours on
   v0.2.142): the one reading of a real four at Krell's Hold on Deadly with its tier, supplies and every settle on record. The balance guard
   plays the harness's own four in these seats (calibration line K1) and prints the gap. Seats are mid-hunt (sections 1 and 2); Level XP is
   the 17.8 hero-hours before the Bonus XP weekend opened; gold uses all 39 (section 10). Runes: Carved for the Mage, Etched for the Healer (section 4).
   `skills` holds only what the hunt recorded; a skill it did not record is the party career line's at the seat's Level (skill-lines.mjs). */
export const REAL_KRELL_FOUR = Object.freeze({
  ground: 'krells_hold', tier: 'deadly', read: '2026-11-20', label: 'REAL, THIN (one person, one day)',
  seats: Object.freeze([
    /* THE SEATS AS PLAYED (read from production 2026-11-21, 51-baseline.md fault F16): the front hero wields a two-handed HAMMER, so it carries no
       shield and cannot cast Challenge (abilities.js: disciplines ['shield']); the Healer sits in the LAST seat, which is where an unchallenged
       Hask's Lookout shoots. The row read `tank, healer, bow, mage` until then: a shield tank that Challenged every Lookout onto itself. */
    Object.freeze({ style: 'hammer', level: 79, skills: Object.freeze({ melee: 60, defense: 59 }) }),
    Object.freeze({ style: 'bow', level: 79, skills: Object.freeze({ ranged: 61 }) }),
    Object.freeze({ style: 'mage', level: 79, skills: Object.freeze({ magic: 59 }) }),
    Object.freeze({ style: 'healer', level: 77, skills: Object.freeze({ magic: 63, defense: 32 }) }),
  ]),
  damageShareLastSeat: 0.27,       // REAL, five hunts, 30 clock hours: the Healer in the last seat takes 25 to 28% of the four's damage, the front hero 69 to 75%
  damageAClockHour: 176000,        // REAL, the same five hunts: 167k to 188k for the four
  runeTierByRole: Object.freeze({ mage: 'carved', healer: 'etched' }),
  ownStockShare: 0.24,             // section 4: home-made is 24% of all supply units used
  levelXpAHeroHour: 1001000,       // section 2, before the event
  xContract: 2.85,                 // section 2
  killsAClockHour: 1251,           // section 2, the party
  netGoldAHeroHour: 9700,          // section 4: coin 15,100 + loot sold 4,700 + tally 440 - store 10,600
  storeAHeroHour: 10600,           // section 4
  deaths: 0, heroHours: 39,        // section 1
});

/* WHERE THE HARNESS IS KNOWN TO DISAGREE WITH REAL PLAYERS (10-real-players.md section 1). A dive quotes these beside any number they touch. */
export const HARNESS_GAPS = Object.freeze([
  { on: 'level_xp', gap: 'a real own four earns 2.9 to 3.0x the pace contract at Levels 45 to 84; the harness four reads 1.8 to 2.6x' },
  { on: 'gold', gap: 'the harness four buys every supply and nets under zero from Level 80; the real one nets +9,078 a hero-hour' },
  { on: 'deaths', gap: 'the harness reports 0 deaths everywhere; real lone heroes die 6.7 times in 100 hours (8.9 under Level 16), fours 1.2' },
  { on: 'skills', gap: 'real main skill is 7 to 10 under the lone career line by Level 60; Defense is the front seat at about its main skill and the back three at 13 to 30' },
  { on: 'route', gap: 'real players live on Coppercap Warrens (32% of hours, from Level 10) and Mosslight Glade; Wickstead, Hask\'s Ford and Muster Barrows are 45 hours together' },
  { on: 'tower', gap: 'the one real climb: a Level 72 to 74 four reached floor 182 and was stopped by the server; it paid 0.26 of hunting XP' },
]);

export const SERVER_AGES = Object.freeze([
  { id: 'day1', name: 'Day 1', note: 'no market stock, no crafted supply for sale, nobody above Level 15, empty boards, no clans' },
  { id: 'month1', name: 'Month 1', note: 'the Heavy is past Krell (Level 110 in about 12 days), the Median near Level 50; the market has tiers 1 to 5' },
  { id: 'month6', name: 'Month 6', note: 'a NEW player arrives beside veterans: old gear is cheap, low grounds are empty of parties, top boards are out of reach, clans are full' },
]);

export const POPULATIONS = Object.freeze([
  { id: 'p10', online: 10, note: 'today, and every quiet hour of a small server: no party to find, no market depth, a clan of three' },
  { id: 'p1k', online: 1000, note: 'the Early Access target: about 4,000 hunting heroes' },
  { id: 'p10k', online: 10000, note: 'the north star: shards, about 40,000 hunting heroes' },
]);

/* SERVER COST (corrected by the platform dive, docs/design/balance-program/28-platform.md, 2026-11-20).
   REAL = production, read-only: `node tools/balance-program/platform-read.local.mjs` (pg_stat_statements since 2026-10-31,
   the journal since 2026-10-19). MEASURED = tests/per-player-cost.baseline.json on the replayed chain. The first cut of this
   block said 360 settles an hour: nothing settles at the 10 s cadence. An away hero commits 36 times an hour (the 90 s flush),
   a watched one 198, and the journal says real heroes ran at 110 (87 over the last nine days). */
export const COST = Object.freeze({
  commitsAnHour: { watched: 198, away: 36 },   // CITED (audit 11-19), and REAL: away days journal 36 to 52 accrue rows a hero-hour
  real: {
    read: '2026-11-20',
    combatSettlesAHeroHour: 110,               // REAL: 178,830 combat accrue rows / 1,630 hunted hero-hours (87 over the last nine days)
    watchedShareOfHuntedHours: 0.48,           // REAL, derived: (114 - 36) / (198 - 36) on the real accounts. A tab left open counts, pressed or not
    dbMsAHeroSettle: 70,                       // REAL: apply 197 ms + read 19 + perks and holder, an instance of 3 heroes on average
    townSettlesAHeroHour: 37,                  // REAL: gather 36.0, craft 39.7 accrue rows a town hero-hour
    townDbMsASettle: 19,                       // REAL: hr_tick_settle's mean
    tabHourReadsS: { today: 36.2, afterServerCostLane: 16.6 }, // REAL means x the client's cadences: state 10.7, accrue read 4.4, polls 1.5, the 60 s off-screen hr_load 19.6
    ledgerRowsAHuntedHeroHour: 216,            // REAL, last five days: accrue 96, supply_buy 61, supply_own 53, pack and return 6 (the fixtures say 44 to 48)
    ledgerRowsATownHeroHour: 38,               // REAL
    ledgerBytesARow: 625,                      // REAL: 309 MB with its index / 494,141 rows
    fixedCronSADay: 1010,                      // REAL: cron.job_run_details, one day, with nobody or everybody playing
  },
  ledgerKeepDays: 90,
  ledgerPruneRowsADay: { live: 480000, staged: 5760000 }, // staged: lane/c-server-cost 1006 (every 5 minutes)
  dbBusyTarget: 0.7,                           // the audit's line
  peakOverMean: 2,                             // ASSUMED: the busiest hour against the day's mean
  /* Supabase compute add-ons: cores and USD a month. ASSUMED from the published list as last read; Tyler checks the page before any spend.
     Small and Medium are shared, burstable cores: sustained load needs Large or more. */
  plans: [['Small', 2, 15], ['Large', 2, 110], ['XL', 4, 210], ['2XL', 8, 410], ['4XL', 16, 960], ['8XL', 32, 1870], ['12XL', 48, 2800], ['16XL', 64, 3730]],
  /* a NEW or changed system's allowance, a hero that uses it (01 section 7, CONFIRMED by 28-platform.md with two lines added):
     nothing per settle, at most 1 ledger row and 1 row write a hero-HOUR, no poll, no cron whose work grows with accounts,
     nothing that grows with players x players. A dive that needs more says so and the platform dive owns the answer. */
  allowance: { statementsASettle: 0, ledgerRowsAHeroHour: 1, rowWritesAHeroHour: 1, pollsAnAccountHour: 0 },
});
