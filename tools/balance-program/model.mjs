// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/model.mjs — THE ONE SHARED BALANCE MODEL, AS DATA (balance program, phase 1).
// The words are in docs/design/balance-program/01-model.md; this file is what measure.mjs and every
// phase-2 dive read so that a number means the same thing in every dive.
//
//   LEDGERS            the ten quantities every system is booked in (a source, a sink or a converter)
//   STACK_CLASSES      the four ways a lever may combine, and the cap each class carries
//   LEVERS             every lever known today, its class and its size (label: MEASURED / CITED / RULED / PROPOSED)
//   REF_POINTS         the Levels and grounds every dive measures at
//   REF_SEATS          the three played parties that are "1.00" at a point
//   REFERENCE_PLAYERS  the seven accounts every dive prices its system for (re-based on real players)
//   REAL_OWN_FOUR_NET  what real own fours net in gold; HARNESS_GAPS where the harness disagrees with real play
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
  { id: 'hunt_hours', unit: 'hero-hours hunted a day (stamina-bound)', home: 'REFERENCE_PLAYERS.huntHoursADay' },
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
]);

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
   huntHoursADay and townHoursADay are a hero's. spends = the share of earned gold the account puts into sinks. */
export const REFERENCE_PLAYERS = Object.freeze([
  { id: 'new', name: 'New', heroes: 1, seat: 'lone', premium: false, huntHoursADay: 2, townHoursADay: 2, attendedMinADay: 10, refillsADay: 0, stock: 'store', spends: 0.1, weight: 'high', label: 'REAL, thin (2 people, 18 h)',
    note: 'one or two heroes alone on Normal, Levels 1 to 15. Dies 8.9 times in 100 hours. Both real ones stopped at Level 7 to 9: one never met the town, one never came back from it' },
  { id: 'ownfour', name: 'Own four', heroes: 4, seat: 'four', premium: false, huntHoursADay: 3.3, townHoursADay: 5, attendedMinADay: 10, refillsADay: 0, stock: 'third own', spends: 0.17, weight: 'highest', label: 'REAL (2 people, 813 h)',
    note: 'THE real player: one person, four of their own heroes as a Deadly party from about Level 10, two visits a day of under four minutes, away eleven hours. Saves: holds 2.09M with nothing it wants' },
  { id: 'heavy', name: 'Heavy four', heroes: 4, seat: 'four', premium: false, huntHoursADay: 8.4, townHoursADay: 6, attendedMinADay: 35, refillsADay: 1.4, stock: 'third own', spends: 0.97, weight: 'high', label: 'REAL, thin (1 person, 503 h)',
    note: 'the own four checked six times a day, with refills. Level 75 in 100 to 119 hunted hours a hero. Spends everything: Tempering, rooms, refills' },
  { id: 'premium', name: 'Premium own four', heroes: 4, seat: 'four', premium: true, huntHoursADay: 3.3, townHoursADay: 5, attendedMinADay: 10, refillsADay: 0, stock: 'third own', spends: 0.17, weight: 'medium', label: 'ASSUMED',
    note: 'the Own four with Premium on every hero. It hunts 3.3 hours a day against an 8 hour bar, so the 12 hour bar gives it nothing: what does Premium give it?' },
  { id: 'ceiling', name: 'Ceiling', heroes: 4, seat: 'four', premium: true, huntHoursADay: 24, townHoursADay: 0, attendedMinADay: 120, refillsADay: 6, stock: 'own', spends: 1, weight: 'guard', label: 'ASSUMED',
    note: 'nobody yet: four heroes hunting every hour the rules allow. The pace and inflation ceiling a server of 1,000 will contain' },
  { id: 'whale', name: 'Buyer', heroes: 4, seat: 'four', premium: true, huntHoursADay: 8.4, townHoursADay: 0, attendedMinADay: 35, refillsADay: 6, stock: 'market', spends: 1, weight: 'guard', label: 'ASSUMED',
    note: 'the Heavy four who sells Crowns for gold: gold is no limit, so every gold sink is bought the day it opens' },
  { id: 'friends', name: 'Four friends', heroes: 1, seat: 'four', premium: false, huntHoursADay: 3.3, townHoursADay: 3, attendedMinADay: 30, refillsADay: 0, stock: 'third own', spends: 0.5, weight: 'promise', label: 'ASSUMED (0 real hours with another person)',
    note: 'four ACCOUNTS, one hero each, hunting together: the party the game is sold on, and so far never played' },
]);

/* WHAT REAL OWN FOURS NET, gold a hero-hour (10-real-players.md section 4: income less store supplies, by account, with a third of
   supplies home-made). [top Level of the account, net]. The harness's four buys every supply at the store and reads NEGATIVE where
   the real four is +9k: until the harness plays own stock, measure.mjs price uses these for four-seat players up to Level 84. THIN. */
export const REAL_OWN_FOUR_NET = Object.freeze([[46, 6530], [55, 7495], [84, 9078]]);

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

/* SERVER COST budget lines (tools/qa/audit-2026-11-19-server/findings.md, CITED; tests/per-player-cost.baseline.json, MEASURED). */
export const COST = Object.freeze({
  settlesAnHour: 360,                      // the 10 s cadence
  commitsAnHour: { watched: 198, away: 36 }, // CITED: a watched hero commits 198 times an hour against 36
  ledgerPruneRowsADay: 480000,             // CITED: outrun near 560 daily heroes at 43 to 49 rows a hero-hour
  accountsOnlineCeiling: [110, 130],       // CITED: before the database passes 70% CPU on Small (2 cores)
  /* a NEW system's allowance, a hunting hero: no new statement on the settle path, no new ledger row a kill,
     nothing that grows with heroes x heroes. A dive that needs more says so and it goes to the platform dive. */
  allowance: { statementsASettle: 0, ledgerRowsAHeroHour: 1, rowWritesASettle: 1, pollsAMinute: 0 },
});
