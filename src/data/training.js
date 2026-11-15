// ════════════════════════════════════════════════════════════════════════
// src/data/training.js — COMBAT TRAINING: ONE FIXED RATE, THE YARD BY THE HOUR, THE HOUSE DUMMY BOUGHT ONCE, AND THE TRAINING ITEMS
// (data; the source of truth).
//
// Tyler 2026-11-08: "a public yard paid by the hour", "a personal training dummy for houses ... multiple unlocks for each combat
// skill ... the long term benefit is that you don't have to pay per hour at the public training grounds". Tyler 2026-10-14: skill
// XP only, costs gold. Tyler 2026-11-14, final: "Training should also be the same RATE for every skill/level, not comparative to
// hunting grounds. The rate should be the same regardless of the characters skill or level", "i do not want it to cost stamina",
// "training with the weapon should be 2:1", "all training weapons should be the same gold price", "yes store bought items other
// than crowns are non tradable". The designer's numbers: PRIORITY_BOARD "2026-11-14 Training: one fixed rate, training items at
// 200%". Every number below is a row Tyler or the designer can move; the server reads them as hr_training_rules,
// hr_training_grounds and hr_training_gear (tools/gen-hunt-sessions.mjs, whose --check fails a stale copy) and hr_items
// (tools/gen-catalogues.mjs).
//
// ONE ENGINE (CLAUDE.md §6). A training session IS a hunt session on a one-pocket ground (hunt-grounds.js TRAINING_GROUNDS, one per
// place and skill), settled by src/core/combat-sim.js like any hunt, viewed or not. Its one foe is the `dummy` monster row
// (monsters.js yard_dummy): it never falls (src/core/hunt/damage.js hurt), never walks, and its blow never takes a hero under
// hpFloorPm of its max HP. src/core/hunt/training.js is the yard's one door for pay: the trained skill only, by SETTLED TIME at
// xpPerHour (boostPermille of it while a training item's hours last), whatever the blows. NO Level XP, coin, drop, kill, Bestiary or
// task credit, and no supply spent: the hero swings its plain basic for free and its bar stays shut. No stamina is spent: the pool
// rests while the hero trains (the settle proposes none; hr_stamina_of).
//
// THE MONEY (2027-04-16-combat-training.sql). The yard charges at the START of each hour, from the account purse, on the server
// clock: hr_training_start pays the first hour (re-quoted, `quote_changed` if the price the player saw moved), and the settle that
// lands on each later hour's first instant pays that hour or ends the session `gold_out` there, nothing owed. An hour's fee is
// feeBase + feePerLevel x the trained skill's level at that instant. A session ends `hours` after maxHours. The house dummy charges
// nothing per hour: its price is a one-time unlock per skill on src/data/gold-sinks.js `house_dummy` (the account's ladder), it
// needs the account's home at `houseTier` or better, and one hero of the account trains on it at a time.
//
// THE TRAINING ITEMS (2027-04-23-training-gear.sql). One item a skill in two sizes (TRAINING_GEAR). Gold buys the tradable one from
// the Arms Master (hr_training_gear_buy, the server's flat price); the Crowns store's copy is a separate id flagged bound (`bop`:
// hr_items.tradeable false), which every trade surface refuses (Tyler 2026-11-14: everything bought with Crowns is bound to the
// account, only Crowns themselves trade). Opening one (hr_training_gear_open) moves its hours into the hero's bank for that skill;
// they burn only while that hero trains that skill, by played time on the server clock, never expire, and stay with the hero (a
// part-used item has no per-piece data, so it can't be traded). When the bank runs dry mid-session the next sealed item of that
// skill in the hero's bag opens itself.
//
// PURE ESM DATA. No imports, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** The skills a hero can train, in the order the Training panel lists them. */
export const TRAINING_SKILLS = Object.freeze(['melee', 'ranged', 'magic', 'defense']);

export const TRAINING_RULES = Object.freeze({
  /* THE RATE: skill XP an hour of settled training, the same for every skill, skill level and Level, at the yard and the house dummy
     (Tyler 2026-11-14). No XP perk, buff or pace dial moves it. The gate: tools/balance-sim/yard-table.mjs (one settled hour on the
     real engine pays exactly this, and boostPermille of it while an item's hours last). */
  xpPerHour: 30000,
  /* A hero trains from this Level on (the designer's 11-10 gate: the first hour stays a hunting hour). */
  minLevel: 10,
  /* A dummy's blow never takes a hero under this share (permille) of its max HP: nobody dies in the yard. */
  hpFloorPm: 500,
  /* The yard's fee for one hour: feeBase + feePerLevel x the trained skill's level at the hour's first instant. */
  feeBase: 50,
  feePerLevel: 6,
  /* The longest one session runs; it ends `hours` there. */
  maxHours: 12,
  hourMs: 3600000,
  /* The house dummy wants the account's home at this property tier or better (src/data/homestead-tiers.js PROPERTY_TIERS id). */
  houseTier: 'homestead',
});

/* THE PLACES. `fee`: whether an hour is charged (the yard); the house dummy is paid for once, per skill (gold-sinks.js house_dummy). */
export const TRAINING_PLACES = Object.freeze({
  yard: Object.freeze({ fee: true }),
  house: Object.freeze({ fee: false }),
});

/** The hunt (and ground) id of training `skill` at `place`: one per pair, so the engine reads the skill off the ground it settles.
    (`training_` first: a probe that picks the lowest ground by Level floor, then by id, still finds the Mill Cellar.) */
export const trainingHuntId = (place, skill) => 'training_' + place + '_' + skill;

/** Every training hunt id, place by place, skill by skill. */
export const TRAINING_HUNT_IDS = Object.freeze(Object.keys(TRAINING_PLACES).flatMap((p) => TRAINING_SKILLS.map((s) => trainingHuntId(p, s))));

/** What training hunt `huntId` trains, { place, skill }, or null for any other hunt. */
export function trainingOf(huntId) {
  for (const place of Object.keys(TRAINING_PLACES)) {
    for (const skill of TRAINING_SKILLS) if (trainingHuntId(place, skill) === huntId) return { place, skill };
  }
  return null;
}

/** The yard's fee for one hour at trained-skill level `level` (the server's hr_training_fee, the same rule). */
export function trainingFee(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return TRAINING_RULES.feeBase + TRAINING_RULES.feePerLevel * lv;
}

/* ── THE TRAINING ITEMS (Tyler 2026-11-14; the designer's numbers) ──────────────────────────────────────────────────────────────────
   One item a skill, in two sizes; every hero can use every one. `boostPermille` is the rate while its hours last (2000: "200%", never
   said as "2x"). `gold` is the Arms Master's flat price for each size (STEEP: a lone hero under Level 30 can't reach one with gold).
   `buyPerDay` is how many an ACCOUNT may buy from the Arms Master in a UTC day (the purchase verb's per-day clamp, the house pattern).
   `bidShare`: a gold-bought item's book value is its price / bidShare. That is the shop's bid for a sealed one (1% of its price back)
   and the market's floor, and the market's ceiling (hr_market_config.ceiling_mult x book, 100) is then the Arms Master's own price:
   nobody pays another player more than the shop asks. A bound row (the Crowns store's) is worth nothing to the shop and never reaches
   the market: a Crowns item that sold for gold would be a second road from Crowns to gold, past the weekly exchange cap. */
export const TRAINING_GEAR = Object.freeze({
  boostPermille: 2000,
  hours: Object.freeze([12, 24]),
  gold: Object.freeze({ 12: 250000, 24: 450000 }),
  buyPerDay: 10,
  bidShare: 100,
  names: Object.freeze({ melee: 'Training Sword', ranged: 'Training Bow', magic: 'Training Wand', defense: 'Training Shield' }),
  /* The id's word for each skill's item: training_<word>_<hours>h, and _bound after it for the Crowns store's copy. */
  words: Object.freeze({ melee: 'sword', ranged: 'bow', magic: 'wand', defense: 'shield' }),
  /* One line each, the item's look (src/data/item-descriptions.js reads TRAINING_GEAR_DESC). */
  flavour: Object.freeze({
    melee: 'From the Arms Master\'s own rack',
    ranged: 'A heavy draw from the archery lane',
    magic: 'Kept by the lectern in the rune corner',
    defense: 'Takes a beating so you learn to take one',
  }),
});

/** The item id of `skill`'s training item of `hours`, the Crowns store's bound copy when `bound`. */
export const trainingGearId = (skill, hours, bound) => 'training_' + TRAINING_GEAR.words[skill] + '_' + hours + 'h' + (bound ? '_bound' : '');

/** Every training item: { id, skill, hours, bound, gold (the Arms Master's price; null for a bound row, which no gold door sells) }. */
export const TRAINING_GEAR_ITEMS = Object.freeze(TRAINING_SKILLS.flatMap((skill) => TRAINING_GEAR.hours.flatMap((hours) => [false, true].map((bound) =>
  Object.freeze({ id: trainingGearId(skill, hours, bound), skill, hours, bound, gold: bound ? null : TRAINING_GEAR.gold[hours] })))));

/** The training item row of `id`, or null. */
export function trainingGearOf(id) {
  return TRAINING_GEAR_ITEMS.find((g) => g.id === id) || null;
}

/** The catalogue rows (src/data/items.js spreads them). `type: 'training'`: its one use is to be opened into a hero's training bank. A
    bound row is `bop` (hr_items.tradeable false) and worth nothing; a gold row's book is its price / bidShare. `training` names it. */
export const TRAINING_GEAR_ITEM_ROWS = Object.freeze(Object.fromEntries(TRAINING_GEAR_ITEMS.map((g) => [g.id, Object.freeze({
  n: TRAINING_GEAR.names[g.skill], v: g.bound ? 0 : g.gold / TRAINING_GEAR.bidShare, type: 'training', tag: 'training',
  ...(g.bound ? { bop: true } : {}), training: Object.freeze({ skill: g.skill, hours: g.hours, bound: g.bound }) })])));

/** One flavour line an item (src/data/item-descriptions.js spreads it). */
export const TRAINING_GEAR_DESC = Object.freeze(Object.fromEntries(TRAINING_GEAR_ITEMS.map((g) => [g.id, TRAINING_GEAR.flavour[g.skill]])));

/** The skill XP one settled hour of training pays: the rate, or boostPermille of it while a training item's hours last. */
export function trainingXpPerHour(boosted) {
  return boosted ? TRAINING_RULES.xpPerHour * TRAINING_GEAR.boostPermille / 1000 : TRAINING_RULES.xpPerHour;
}
