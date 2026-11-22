// ════════════════════════════════════════════════════════════════════════
// src/data/gear-steps.js — PLAIN GEAR COUNTED IN STEPS, AND THE TRAIT BUDGET (designer, lane/g-gear-steps and lane/traits-20, 2026-11-22).
//
// docs/design/redesign/04-math-strategy.md sections 1 and 10, 02-architecture.md package 2, 12-targets.md sections 3.3, 7 and 8.
// Tyler 2026-11-22: "we aren't using the old tier item levels". On a ground the Danger scale opens on (src/data/danger.js
// DANGER_GROUNDS) a piece is its ITEM LEVEL and nothing else: no armor table, no attack table, no value ladder. Grounds off the scale
// keep src/data/gear-tiers.js until R10 moves them.
//
// THE INTERFACE (the engine's power step, lane R9, reads it; .claude/coordination/HANDOFFS.md 2026-11-22 lane/g-gear-steps):
//   a worn piece of item Level iL in slot s adds   iL x GEAR_STEPS.slotPm[s] / 1000   steps to the hero's GEAR part
//   the slot weights sum to 1000, so a whole kit at item Level X is a gear part of exactly X (an empty slot adds 0)
//   a two-handed weapon also fills the shield's weight (GEAR_STEPS.twoHand), so no style loses a slot's share for its weapon
//   the gear part then enters the hero's rating at the engine's own `weightGear` (04 section 1; R9's lever, not this file's)
// A TIER is exactly `tierSteps` item Levels (tierLevel). Tier 0 is the starting kit. A ground drops ONE base tier at every depth
// (12-targets 3.3); depth raises only the Rare odds and the Trait's rank (rankDepths).
// WEAR AHEAD: a piece of item Level iL is worn from hero Level iL - wearAhead (never under 1), so a company at a ground's entry Level
// wears that ground's base, and a kit can never run more than wearAhead steps past its hero (04 section 10).
//
// STARTING VALUES, NOT RULINGS (the Lab tunes them; in band is enough):
//   tierSteps 20        04 section 1's worked value: at powerStep 0.35% a tier is +7.2% of power; R9 is done when a tier moves the
//                       held step by about 20 (11-build-audit R9)
//   wearAhead 10        JUDGMENT: half a tier. Muster Barrows opens at Level 55 and drops item Level 60, worn from 50
//   slotPm              JUDGMENT: the weapon a fifth, the body the largest armor share, jewelry small. Sums to 1000
//   traitSteps 4/7/10   (shown as 1.5 / 2.5 / 3.5%, shownPct below) 04 section 10: rank 1 to rank 3 spans 6 steps, under a third of a tier, so which Trait matters more than how
//                       high. A Trait's steps are steps of the hero's GEAR PART (the unit of a whole kit's item Level) and are NOT
//                       weighted by slot, so a rank is worth the same on a ring as on a weapon (04 guard 1)
//   conditionalStepsMax 20   every conditional step on one hero at once, at most one tier (04 guard 3, and the kit spread limit). So a
//                       whole kit a tier up beats any kit a tier down, Traits and all: X + 20 + its Traits >= X + at most 20. One
//                       piece is different on purpose: a rank 3 Trait outweighs its slot's next base (a weapon's tier is 20 x 20% = 4
//                       gear steps), so a good Rare lives several tiers, and carry-over (02 package 2) moves its Trait to a new base
//   traitAverageSharePm 500  a Trait's worth averaged over every ground is at most half its best case (04 guard 2)
//   dominanceMaxPm 400       no Trait in the best kit on more than 40% of slot, seat and ground cells (04 guard 4)
//   rankDepths 1/8/15        the depth each rank starts at on a 20-depth band (12-targets 3.3, re-cut to three ranks here)
//
// THE PIECE: one account-owned row (slot, base, tier, Traits and ranks, rarity, find line, escrow state) and its market rules, in
// docs/design/redesign/12-targets.md section 8 and 13-market.md section 2.3. Temper stays with the hero's slot, never the piece.
//
// TRAITS ARE HIDDEN. The 40 rows are src/data/traits.js (lane/traits-20). Nothing rolls them, no drop table names them, no fight reads them
// and no screen shows them: half-built features stay hidden. tests/gear-steps.mjs holds the rows' shape and who may import either file.
//
// PURE ESM. Data only. Imports only src/data/traits.js (re-exported below).
// ════════════════════════════════════════════════════════════════════════

export const GEAR_STEPS = Object.freeze({
  tierSteps: 20,
  wearAhead: 10,
  /* permille of the gear part a slot carries at its item Level (src/data/gathering.js EQUIP_SLOTS, ammo excluded: ammo is a supply) */
  slotPm: Object.freeze({
    weapon: 200, shield: 80, body: 120, pants: 90, helmet: 70, boots: 60, gloves: 60, belt: 50, cape: 60,
    necklace: 70, ring1: 50, ring2: 50, earrings: 40,
  }),
  /* a two-handed weapon carries these slots' weights together */
  twoHand: Object.freeze(['weapon', 'shield']),
  /* a Trait of rank 1, 2, 3 is worth this many steps on the cell that suits it best (04 guard 1: one budget a rank, every Trait) */
  traitSteps: Object.freeze([4, 7, 10]),
  /* a TRADE Trait (traits.js trade, Hask's Bargain): its offense rises by tradeSteps while its defense falls by traitSteps of the same
     rank, so its net (7-4, 13-7, 18-10) stays under one rank's budget, and its gain under conditionalStepsMax (GS-3) */
  tradeSteps: Object.freeze([7, 13, 18]),
  /* THE PERCENT A TRAIT CARD SHOWS (the Coordinator 2026-11-22: clean numbers). The steps above are the source: traitSteps at powerStep
     0.35% are 1.41 / 2.48 / 3.55%, tradeSteps 2.48 / 4.65 / 6.49%. These round them, each within a quarter of a point (GS-3) */
  shownPct: Object.freeze({ rank: Object.freeze([1.5, 2.5, 3.5]), tradeGain: Object.freeze([2.5, 4.5, 6.5]) }),
  /* a Trait's slot (src/data/traits.js) and the equip slots it sits in: a ring Trait fits either ring */
  traitSlots: Object.freeze({
    weapon: Object.freeze(['weapon']), shield: Object.freeze(['shield']), body: Object.freeze(['body']), pants: Object.freeze(['pants']),
    helmet: Object.freeze(['helmet']), boots: Object.freeze(['boots']), gloves: Object.freeze(['gloves']), belt: Object.freeze(['belt']),
    cape: Object.freeze(['cape']), necklace: Object.freeze(['necklace']), ring: Object.freeze(['ring1', 'ring2']), earrings: Object.freeze(['earrings']),
  }),
  /* THE VERY RARE PAIR RULE (12-targets 8.1): the first Trait from the ground's pool for the slot, the second any other Trait of the
     slot, never two of one key, never a pair listed here (ids sorted, joined by '+'). Empty until the dominance check (V7) plays the 40 */
  veryRareBanned: Object.freeze([]),
  conditionalStepsMax: 20,
  traitAverageSharePm: 500,
  dominanceMaxPm: 400,
  rankDepths: Object.freeze([1, 8, 15]),
  /* how many Traits a piece of each rarity carries (02 package 2: a Very Rare's second Trait waits until one Trait a piece has been
     played). Two Traits on one piece never share a stacking key */
  traitsByRarity: Object.freeze({ rare: 1, very_rare: 2 }),
  /* 04 guard 5: the Rare roll rises after each miss so the long-run rate is the stated one (the roller's, wave 4) */
  pity: Object.freeze({ rare: true }),
});

/** The item Level of base tier `tier` (tier 0 is the starting kit). */
export const tierLevel = (tier) => tier * GEAR_STEPS.tierSteps;

/* THE TRAITS live in src/data/traits.js (lane/traits-20: the 40 Tyler picked). Re-exported here so a scale ground row reads its pool
   from the gear table it already imports (danger.js DANGER_GROUNDS traits). */
export { TRAITS, traitPool } from './traits.js';
