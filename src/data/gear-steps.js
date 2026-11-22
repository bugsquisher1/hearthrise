// ════════════════════════════════════════════════════════════════════════
// src/data/gear-steps.js — PLAIN GEAR COUNTED IN STEPS, AND THE FIRST FIVE TRAITS (designer, lane/g-gear-steps, 2026-11-22).
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
//   traitSteps 4/7/10   04 section 10: rank 1 to rank 3 spans 6 steps, under a third of a tier, so which Trait matters more than how
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
// TRAITS ARE HIDDEN. Five sample rows (CLAUDE.md section 10: a sample of about 5 before any pool). Nothing rolls them, no drop table
// names them, no fight reads them and no screen shows them: half-built features stay hidden. tests/gear-steps.mjs holds the rows'
// shape and that only src/data/danger.js imports this file.
//
// PURE ESM. Data only. Imports nothing.
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

/* THE TRAITS. A Trait is a RULE: while its `when` holds, the steps of its rank (GEAR_STEPS.traitSteps) raise one thing:
     offense  what the hero's blows and spells land          defense  what reaches the hero is lighter
     heal     what the hero's heals restore
   `when` is written in the bar's own conditions (src/data/condition-metrics.js METRICS, OPERATORS), so a player who can read a slot
   can read a Trait, and combat needs no new math (02 package 2). `slotOnly` metrics read the action that is landing.
   `key`     no stacking: two Traits of one key on a hero count the larger (04 guard 3). Every sample key is its own
   `scope`   'self' only in the sample. A party-wide Trait never stacks with another of its key across the party
   `source`  where it rolls: a hunting ground's id. The two Catacomb wings are the grounds 12-targets section 7 makes of the Catacombs
             in wave 2 (catacomb_bone_wing, catacomb_flooded_wing)
   `best`    the cell where it is sized (04 guard 1): the seat (src/data/hunt-roles.js HUNT_ROLES) and the ground
   `rule`    the player's words ({steps} is its rank's steps as the card will say it), `story` why the dead of that ground carry it */
export const TRAITS = Object.freeze({
  file_breaker: Object.freeze({
    name: 'File Breaker', slot: 'weapon', raises: 'offense', key: 'crowd', scope: 'self', source: 'muster_barrows',
    when: Object.freeze({ metric: 'enemies_in_aoe', op: 'gte', value: 3 }),
    best: Object.freeze({ seat: 'mage', ground: 'muster_barrows' }),
    rule: 'When an area attack would hit 3 or more monsters, it lands {steps} steps harder.',
    story: 'The Banded Company\'s pikemen were buried the way they stood, in files. A weapon that came up out of those barrows learned to swing at a line.',
  }),
  captains_due: Object.freeze({
    name: 'Captain\'s Due', slot: 'cape', raises: 'offense', key: 'boss', scope: 'self', source: 'muster_barrows',
    when: Object.freeze({ metric: 'target_is_boss', op: 'eq', value: true }),
    best: Object.freeze({ seat: 'melee_dps', ground: 'muster_barrows' }),
    rule: 'When your target is a boss, your hits land {steps} steps harder.',
    story: 'The officers Krell buried around Hask kept their cloaks. Every one of them is still waiting to settle up with the captain who sold them.',
  }),
  last_file: Object.freeze({
    name: 'Last File', slot: 'shield', raises: 'defense', key: 'low_hp', scope: 'self', source: 'muster_barrows',
    when: Object.freeze({ metric: 'self_hp_pct', op: 'lte', value: 40 }),
    best: Object.freeze({ seat: 'tank', ground: 'muster_barrows' }),
    rule: 'When your HP is at 40% or less, blows reach you {steps} steps lighter.',
    story: 'Krell\'s men cut the company down where it stood. The last file stood longest, and their shields went into the barrows still dented from it.',
  }),
  keepers_carry: Object.freeze({
    name: 'Keeper\'s Carry', slot: 'helmet', raises: 'heal', key: 'rescue', scope: 'self', source: 'catacomb_bone_wing',
    when: Object.freeze({ metric: 'ally_hp_pct', subject: 'lowest', op: 'lte', value: 50 }),
    best: Object.freeze({ seat: 'healer', ground: 'catacomb_bone_wing' }),
    rule: 'When the hero you heal is at half HP or less, your heal restores {steps} steps more.',
    story: 'The Keepers carried every pauper down the bone stairs on their backs. The ones who did it longest learned to lift a body that had nearly let go.',
  }),
  floodmark: Object.freeze({
    name: 'Floodmark', slot: 'boots', raises: 'defense', key: 'casting', scope: 'self', source: 'catacomb_flooded_wing',
    when: Object.freeze({ metric: 'enemy_casting', subject: 'self', op: 'gte', value: 1 }),
    best: Object.freeze({ seat: 'ranger', ground: 'catacomb_flooded_wing' }),
    rule: 'While a monster is casting at you, blows reach you {steps} steps lighter.',
    story: 'The river comes into the Flooded Wing every spring and leaves a line on the vault walls. Whoever stood above the line lived.',
  }),
});

/** The Traits that roll on `source` (a ground's pool, 02 package 2: "chasing a Trait means choosing a ground"). */
export const traitPool = (source) => Object.freeze(Object.keys(TRAITS).filter((id) => TRAITS[id].source === source));
