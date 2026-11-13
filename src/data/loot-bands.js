// ════════════════════════════════════════════════════════════════════════
// src/data/loot-bands.js — THE FIVE LOOT BANDS (game-designer loot redesign,
// approved by Tyler 2026-10-23: "trust the designer's gut")
//
// Every drop row of a converted ground names its `band` (src/data/monsters.js);
// the roller reads it (src/core/drops.js bandOf). A band is a PROMISE IN HOURS
// of hunting per hero at the ground's floor, not a fixed chance: a row's `ch`
// is tuned on the real settle until its band's target holds, and
// tests/hunt-core/drop-tables.mjs measures it every run.
//
//   common    over 15% a kill: creature parts and bones; each sells or feeds a
//             bench. The kill's loot line.
//   uncommon  5% to 15% a kill: the monster's imbuement item. The loot line.
//   scarce    each piece about every hour: the ground's own-tier armour in all three
//             weights (each monster one slot, in heavy, medium and light) and
//             the weapons its creatures carry. Split round-robin in a party.
//   rare      each item every 10-20 h: next-tier pieces, named pieces, the
//             carrier's trophies. The reveal, and the party's rare roll.
//   trophy    every 100-150 h, bosses only, the boss's LAST row: one named
//             prize per boss. The reveal.
//
// Rows sit on a monster in this order, so a row added to a later band (a
// boss's trophy) never moves an earlier row's draw on the seeded stream.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/** The bands, in the order a monster's rows list them. `key` sits after `rare`, so a key row added to a monster never moves the draw
    of a row it already had (lane/b-krells-hold-pack: the Gatekeeper's Hall Key; carried onto the set by lane/d-packs-retune so the
    staged Krell's Hold rows lint, tests/hunt-core/drop-tables.mjs). */
export const LOOT_BANDS = Object.freeze(['common', 'uncommon', 'scarce', 'rare', 'key', 'trophy']);

/** The bands the server reveals (a `rare_drop` event) and the party's rare roll decides. */
export const REVEAL_BANDS = Object.freeze(['rare', 'trophy']);

/* Each band's promise. `odds` = (above, max] a kill; `hours` = [min, max] expected hours per piece per hero at the
   ground's floor, for rows at or under `oddsMax` a kill (an hours band is never a common). */
const odds = (above, max) => Object.freeze({ odds: Object.freeze([above, max]) });
const hours = (min, max) => Object.freeze({ hours: Object.freeze([min, max]), oddsMax: 0.05 });
/* Scarce: about ONE piece an hour per slot per armour weight (Tyler 2026-10-23, replacing the draft's 1-3 h), held to
   [0.75, 1.5] h so a re-tune moves odds, not the band. PROVISIONAL with every loot number (Tyler 2026-10-23): re-tuned
   once combat is balanced and the economy sims run again; the guards hold whatever the numbers become. */
export const BAND_TARGETS = Object.freeze({
  common: odds(0.15, 1),
  uncommon: odds(0.05, 0.15),
  scarce: hours(0.75, 1.5),
  rare: hours(10, 20),
  /* a hall's key: one try at a fight you can lose, used up either way (Krell's Hold, lane/b-krells-hold-pack). PROPOSED, the design's "about every
     two hours" held to [1.5, 3] the way Scarce holds its hour to [0.75, 1.5]; its pace guard (drop-tables key-pace) lands with that lane */
  key: hours(1.5, 3),
  /* the Bestiary's full stage multiplies a boss's relic chance by up to 1.25 (Tyler 2026-10-19): the base sits at
     125-150 h so a fully studied boss still drops it no faster than every 100 h */
  trophy: Object.freeze({ ...hours(100, 150), boostMax: 1.25 }),
});

/* A SLOT'S HOME (designer 2026-10-23): each Scarce slot on a ground has ONE home a player can learn: one monster, or
   the ground's few slow monsters as one named group (LOOT_GROUPS), each carrying the slot's full set. A monster carries
   at most two armour slots and one Scarce weapon. The 5% row ceiling (the Uncommon / Scarce line) still holds. */
export const SLOT_LIMITS = Object.freeze({ armourSlots: 2, weapons: 1 });
export const LOOT_GROUPS = Object.freeze({
  /* the Warrens' three slow goblins (about 90 kills an hour between them for a party of four) share the bodies */
  coppercap_warrens: Object.freeze([Object.freeze({ name: 'the Chief\'s crew', monsters: Object.freeze(['goblin_skulker', 'hobgoblin_foreman', 'chief_coppercap']) })]),
});

/* ROWS WAITING ON THEIR ITEM (designer 2026-10-23): a row the ruling places whose item does not exist yet. Never a
   stand-in item: drop-tables pending-rows fails the day the item exists while its row is still parked here (move it
   onto the monster then, after `after`), and the plays print the pace it will have. */
/* None waits now: the Kingsgrate (src/data/shields.js, lane b-spell-roles 2026-10-23) rides the Rat King, after his Crown Shard. */
export const PENDING_ROWS = Object.freeze([]);

/* WHAT WORN GEAR SELLS FOR (Tyler 2026-10-23: keep the Scarce pace and meet the value caps through what dropped gear
   sells for). The trader pays a share of a weapon's, armour's, off-hand's or jewel's book value (`v`), floored at 1,
   by the piece's TIER, one price per item wherever it came from; the shop buy-back cap still applies on top
   (supabase/functions/hr-accrue/catalogue.js vendorPriceOf). Book value itself is untouched. By tier because the pace is
   the same on every ground (about a piece an hour per slot per weight) while book value climbs 2-4x a tier and coin
   barely moves (DM-16): tier 3 sells at 0.14 so the Warrens' gear stays under half its coin, as tiers 1-2 do at 0.5,
   and every piece still sells for at least its lower-tier twin (drop-tables sale-ladder; the designer, 2026-10-23).
   A tier above the table (no ground drops one yet) sells at its last rate; a piece with no tier at tier 1's. Measured
   against the caps by tests/hunt-core/drop-tables.mjs. PROVISIONAL. */
/* TIER 4 (designer 2026-11-08, lane/b-phase0-tier4; the 10-29 plan's 0.075): the Slake, the first tier-4 ground, drops its set in three weights
   about hourly, and tier-4 book is 3x tier 3's. Measured on the real settle (drop-tables, a lone tank at the Slake's floor): at tier 3's 0.14 its
   gear sold for 57% of its coin and the hour totalled +36% over its pin; the window that holds both caps and the sale ladder is 0.047-0.107,
   and 0.075 sits in its middle.
   TIERS 5 AND 6 (designer 2026-11-08, the same lane, for the Pyre Field: tier-5 armor hourly, tier-6 weapons as its Provost's Rares). ONE LADDER
   from tier 4 up: each tier's piece sells for about 1.3x its lower-tier twin while book climbs about 3x a tier (tier 5 45/15, tier 6 130/45), so
   the rate is the last one x 1.3 / that climb: tier 5 0.033 (the twin rule's floor is 0.025, the Pyre Field's faucet cap 0.05), tier 6 0.015
   (its window about 0.01-0.016). TIER 7 (designer 2026-11-13, lane/d-barrow-data, Krell's hall prize): the same ladder, 0.015 x 1.3 / 2.77
   (Dawnsteel book 360 against Emberforged 130) = 0.007, so a tier-7 piece sells for about 1.3x its tier-6 twin and not 2.8x. */
export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.14, 0.075, 0.033, 0.015, 0.007]);
export const VENDOR_GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand', 'jewelry']);
/* THE GLADE'S ARMOR SELLS UNDER THE WARRENS' (designer 2026-11-03, lane/c-gold-matters; Tyler the same day: harder monsters pay more).
   Tier 2's helmet, body, legs and boots come about hourly in three weights on Wickstead, the Sewer and the Glade, and at 0.5 of book an Iron
   Platebody sold for 200 g against a Steel one's 210 g: the flood of the hours when gold goes dead, and no reward for the harder ground. At 0.3
   the plate line reads 90 / 120 / 210 and every piece still clears its lower-tier twin (drop-tables sale-ladder). Tier 2's weapons, shield,
   jewels, gloves and belts keep the table: a player forges those to sell (tests/craft-wages.mjs W-FORGE) and the outfitter's belt and gloves
   hold those twins' bids up. Tiers 1 and 3 keep it too, so the starter grounds keep their gold (Tyler 10-20) and the Warrens pay what they paid. */
export const VENDOR_HOURLY_ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);
export const VENDOR_HOURLY_ARMOR_T2_RATE = 0.3;

/** The share of book value the trader pays for `item` if it is worn gear, else 1. */
export function gearSaleRate(item) {
  if (!item || !VENDOR_GEAR_TYPES.includes(item.type)) return 1;
  const t = Math.max(1, Math.floor(Number(item.tier) || 1));
  if (t === 2 && item.type === 'armor' && VENDOR_HOURLY_ARMOR_SLOTS.includes(item.slot)) return VENDOR_HOURLY_ARMOR_T2_RATE;
  return VENDOR_GEAR_RATES[Math.min(t, VENDOR_GEAR_RATES.length) - 1];
}
