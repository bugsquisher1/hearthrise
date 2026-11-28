// ============================================================
// src/data/slot-ladders.js — THE FOUR EMPTY LANES (round-2 itemization)
//
// Four equipment lanes were structurally incomplete. This file closes them as
// DATA ONLY (docs/SYSTEMS_MAP.md: "grow by adding data, not code"), in the
// shape wave3-uniques.js established: items + recipes + flavour, spread into
// ITEMS / ARTISAN_RECIPES / ITEM_DESC by their owning modules.
//
//   EARRINGS  0 items, though `earrings` is in EQUIP_SLOTS and the equip doll
//             renders the socket for every player. Verified at runtime: the
//             Character > Equipment doll shows an "Earrings" square that
//             nothing in the 400-item catalogue could ever fill.
//   AMMO      1 item (`iron_arrows`). A bow climbs 7 material tiers; its ammo
//             never upgraded once.
//   CAPE      5 items with holes at tiers 1/2/4/5/7 — a player went from a
//             level-35 cape straight to a level-76 one.
//   JEWELRY   6 items across 2 of 3 jewelry slots, and no capstone at all.
//
// ── THE STAT RULE THIS LADDER IS BUILT ON (the b343 accuracy ruling) ────────
// (HISTORY: since 2026-11-20 the to-hit is a ratio, src/data/to-hit.js, with no
// ceiling a stat can run into, so the reasoning below describes the rule the
// ladder was cut on, not today's.) Executed then against `playerCombatRolls`:
//   0.55 + ((skill + accBonus) − monsterDef × ACC_DEF_MUL) × 0.01, clamped 0.95.
// The highest defScore in the game is the Green Dragon's 93, so the clamp binds
// at `skill + accBonus ≥ 133`. At level 99 a full ranged kit already carries
// **186** points of rangeAtkB and a magic kit **204** — 2.5-3x past the ceiling
// against every monster in the game. Melee's atkB tops out at 42 and is live at
// every rung (bronze sword vs the dragon at 99: 0.6825, NOT clamped).
//
// So: **accuracy is a real stat for melee and a dead one for ranged/magic.**
// Every rung below follows from that:
//   • melee-flavoured pieces may carry `atkB` at any tier;
//   • ranged/magic pieces carry accuracy ONLY in the low tiers where it is
//     still live, and pay in DAMAGE (`rangeStrB`), crit or defence above that;
//   • no piece here carries `magicAtkB` above a token amount, because those
//     points are already 100% wasted before this file adds any.
//
// ── AND ON SPEED ───────────────────────────────────────────────────────────
// NOT ONE ITEM IN THIS FILE CARRIES `spdB`. The best-in-slot spdB sum is
// already 0.16 against an engine clamp of 0.20 (swingIntervalMs); six new slots
// of speed gear would push past the clamp and turn every future speed item into
// a null item. See the b343 spdB ruling — the speed ladder is CLOSED.
// ============================================================

import { withGearStats } from './gear-profiles.js';
import { STEP_MATERIALS, materialWord, stepOf, onTier } from './gear-tiers.js';
import { SUPPLY_GATES } from './core-model.js';

/* THE TRAIT CRAFT'S BASES OF A TIER WITH HOMES (lane/gear-phase-b; gear-tiers.js STEP_MATERIALS): the line its word comes from, its label and
   book multiplier (the shipped rungs' vmul). No bench makes them since the cut (09-crafting.md 4.13): a piece with no real door is held for
   Artificing's Trait craft only by its own ruled row (TRAIT_BASE_HOLDS below; catalogue-coherence UNREACHABLE_FATES traitBase). */
const STEP_JEWELS = Object.freeze([
  Object.freeze({ key: 'ring', label: 'Ring', line: 'metal', slot: 'ring', type: 'jewelry', icon: '💍', vmul: 200 }),
  Object.freeze({ key: 'earrings', label: 'Earrings', line: 'metal', slot: 'earrings', type: 'jewelry', icon: '💎', vmul: 100 }),
  Object.freeze({ key: 'necklace', label: 'Necklace', line: 'metal', slot: 'necklace', type: 'jewelry', icon: '📿', vmul: 200 }),
  Object.freeze({ key: 'cloak', label: 'Cloak', line: 'cloth', slot: 'cape', type: 'armor', icon: '🦸', vmul: 240 }),
]);
/* A step cloak's Steady armor (an attribute the cloak line carries, not a base stat: gear-profiles.js) steps as armor steps (balance ruling
   section 9: each tier's best cape lets through 95 to 97% of what the tier below does; tests/hunt-core/temper.mjs a-cape-steps-like-armor):
   from the shipped top's (the Dawnlit Mantle, tier 7, 255) each rung keeps STEP_CAPE_KEEP_PM of the damage, so tier 8 is 285 (the Wyrmgilt
   Mantle's own), 9 313, 10 341, 11 367. STARTING VALUE: the band's middle. */
const STEP_CAPE_TOP = Object.freeze({ tier: 7, steadyPm: 255 });
const STEP_CAPE_KEEP_PM = 960;
const stepCapeSteadyPm = (tier) => 1000 - Math.round((1000 - STEP_CAPE_TOP.steadyPm) * (STEP_CAPE_KEEP_PM / 1000) ** (tier - STEP_CAPE_TOP.tier));

/* Book values follow the audit's §5.4 recommendation: `v` derives from the
   material tier's own economic curve rather than a hand-guessed number.
   value multipliers: [0.6, 1.3, 5, 15, 45, 130, 360] for tiers 1..7.       */
const TIER_VALUE = [0.6, 1.3, 5, 15, 45, 130, 360];
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];
const priced = (vmul, tier) => Math.max(1, Math.round((vmul * TIER_VALUE[tier - 1]) / 5) * 5);

export const SLOT_ITEMS = withGearStats({
  /* ══ AMMO — the other half of the weapon pair ═══════════════════════════
     Arrows pay in `rangeStrB` (damage), because `rangeAtkB` is dead from the
     mid-game on. Accuracy appears only on tiers 1-3, where it still moves.

     THESE ARE CONSUMABLES. `ammoPerShot` is the per-swing burn, authored as
     DATA so a future "one arrow in five is recovered" perk, or a heavy bolt
     that costs two, is a data change and not a code change.

     `ammoPerShot: 0` on Bronze Arrows is deliberate and is a ruling, not an
     oversight (designer 2026-10-31, PRIORITY_BOARD Decisions, flagged for Tyler):
     at the store's smallest price, 1 g a shot, shots take 46-64% of a bow's income
     on the first grounds and buy no XP, so there is NO integer price at which this
     arrow costs less than a third of the income it earns. Bronze is therefore the
     one free arrow, with no store row; paying starts at the next one, Iron Arrows
     at 1 g a shot. The rule: a basic attack costs nothing you can run out of; what
     is better costs. Air Runes no longer exist, and Coarse Whetstones wear at 0.02
     a swing.

     THESE ARE SPENT: the one hunt engine pays `ammoPerShot` per shot from the
     hunt's bag (src/core/hunt/abilities.js) and wears a hone per swing
     (src/core/member.js), watched or not.  */
  bronze_arrows:    { n: 'Bronze Arrows',      icon: '🏹', v: 0,  type: 'ammo', slot: 'ammo', tier: 1, rarity: 'common',    reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[0], madeLv: 1,  rangeAtkB: 2, rangeStrB: 2,  ammoPerShot: 0 },
  steel_arrows:     { n: 'Steel Arrows',       icon: '🏹', v: 1,  type: 'ammo', slot: 'ammo', tier: 3, rarity: 'rare',      reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[2], madeLv: 30, rangeAtkB: 4, rangeStrB: 5,  critB: 0.01,  ammoPerShot: 1 },
  mithril_arrows:   { n: 'Mithril Arrows',     icon: '🏹', v: 4,  type: 'ammo', slot: 'ammo', tier: 4, rarity: 'epic',      reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[3], madeLv: 45,               rangeStrB: 8,  critB: 0.01,  ammoPerShot: 1 },
  rune_arrows:      { n: 'Rune Arrows',        icon: '🏹', v: 6,  type: 'ammo', slot: 'ammo', tier: 5, rarity: 'legendary', reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[4], madeLv: 60,               rangeStrB: 11, critB: 0.015, ammoPerShot: 1 },
  emberhead_arrows: { n: 'Emberhead Arrows',   icon: '🏹', v: 9,  type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[5], madeLv: 75,               rangeStrB: 14, critB: 0.02,  ammoPerShot: 1 },
  dawnpoint_arrows: { n: 'Dawnpoint Arrows',   icon: '🏹', v: 12, type: 'ammo', slot: 'ammo', tier: 7, rarity: 'mythic',    reqSkill: 'ranged', reqLv: SUPPLY_GATES.ranged[6], madeLv: 88,               rangeStrB: 18, critB: 0.03,  ammoPerShot: 1 },

  /* ══ EARRINGS — the precision slot ══════════════════════════════════════
     A brand-new lane needs an identity that is not "more of what the necklace
     already does". Earrings are crit + a little ward: the smallest numbers in
     the game, in the smallest slot, worn by the hero's Level like every piece
     of gear (gear-tiers.js LEVEL_REQ, Tyler 2026-10-24), so no build is
     excluded by it — unlike gating on a skill, which would lock out a style.

     Crit headroom checked: best-in-slot critB is 0.308 today and the engine cap
     (COMBAT_BALANCE.critCap) is 0.60. This lane adds at most 0.04.            */
  /* b542 — the tier-1 rung was the ONE earring in this lane with no reqSkill/reqLv,
     which read as "tier 1 needs no gate" and left hr_items.req_lv NULL on the only
     rung a new player actually reaches. reqLv 1 restricts nobody (the gate is
     `level < req_lv`); it states the lane's requirement so the column is non-NULL across
     all seven rungs and the server has one shape to read. */
  copper_studs:        { n: 'Copper Studs',        icon: '💎', v: priced(100, 1), type: 'jewelry', slot: 'earrings', tier: 1, rarity: 'common',    reqSkill: 'level', reqLv: 1 },
  fang_studs:          { n: 'Fang Studs',          icon: '💎', v: priced(100, 2), type: 'jewelry', slot: 'earrings', tier: 2, rarity: 'uncommon',  reqSkill: 'level', ...onTier(2) },
  spidereye_studs:     { n: 'Spider-Eye Studs',    icon: '💎', v: priced(100, 3), type: 'jewelry', slot: 'earrings', tier: 3, rarity: 'rare',      reqSkill: 'level', reqLv: 34 },
  wraithglass_drops:   { n: 'Wraithglass Drops',   icon: '💎', v: priced(100, 4), type: 'jewelry', slot: 'earrings', tier: 4, rarity: 'epic',      reqSkill: 'level', reqLv: 50 },
  rubyfire_studs:      { n: 'Rubyfire Studs',      icon: '💎', v: priced(100, 5), type: 'jewelry', slot: 'earrings', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 66 },
  /* The capstone the code has been waiting for. `gemcutter_note` has existed as
     a recipe scroll since b145 pointing at `dragon_gem_earrings`, deliberately
     NOT dropped because "a scroll that unlocks nothing is a confusing dead
     end" (legacy.js:10976). Its own instructions: define the item in
     src/data/items.js, add the recipe with `gated:`, add the drop in
     src/data/monsters.js. All three are done. */
  dragon_gem_earrings: { n: 'Dragon Gem Earrings', icon: '💎', v: 24000, type: 'jewelry', slot: 'earrings', tier: 8, rarity: 'unique', reqSkill: 'level', reqLv: 82 },

  /* ══ CAPE — the holes at tiers 1/2/4/5/7 ════════════════════════════════
     DELIBERATELY HAND-AUTHORED, NOT GENERATED. Adding a `cape` row to
     ARMOUR_SLOTS in gear-tiers.js would generate 21 capes (3 archetypes x 7
     tiers) from one line — but it would also (a) add a SEVENTH slot to
     armorSetBonus's 5-of-6 threshold, making every set bonus in the game
     easier to complete, and (b) hand every archetype a free defence rung at
     every tier. That is a global balance change smuggled in as a data row.
     A cape is a reward, not a crafting tier; five hand-cut rungs is the
     smaller, stronger change.

     `armourClass: 'cape'` keeps these OUT of the plate/leather/cloth set
     buckets. Note the pre-existing quirk this sidesteps: the three tiered
     capes already in the game carry no armourClass, so armorSetBonus counts
     them as PLATE today. Raised as a handoff; not changed here.             */
  /* THE FIRST-HOUR RUNG (designer 2026-10-28, lane/b-first-hour): the gear between the practice kit and Level 15.
     A fresh hero's Thicket stretch (Level 5 to 15, about 19 h on the 10-25 curve) had nothing new to wear past its
     tier-1 armor, and What next read "Level 12: Grayjaw's Ruff", a 15 h Rare. One cape every way to fight wears
     (no style's accuracy or damage pays for it). A Scarce drop of the Thicket's Gray Wolves since the bench cut (09-crafting 4.13:
     gear drops). Between the Shop's Traveler Cape (Level 1, defense 1) and Grayjaw's Ruff (Level 12, defense 3 and crit). */
  graypelt_cloak:  { n: 'Graypelt Cloak',  icon: '🦸', v: 150, type: 'armor', slot: 'cape', armourClass: 'cape', tier: 1, rarity: 'common', reqSkill: 'level', reqLv: 8, steadyPm: 30 },
  woolen_cloak:    { n: 'Woollen Cloak',   icon: '🦸', v: priced(240, 1), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 1, rarity: 'common',    reqSkill: 'level', reqLv: 12, steadyPm: 30 },
  houndskin_cloak: { n: 'Houndskin Cloak', icon: '🦸', v: priced(240, 2), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 22, steadyPm: 70 },
  /* THE TIER 3 CLOAK (itemization plan §4 phase 2, lane/d-jewelry-sample 2026-11-18): a Scarce drop of Hask's Ford's Banded Pikemen since
     the bench cut (09-crafting 4.13). Was a wave-3 unique with no source; re-cut to the cape ladder (worn from tier 3's Level
     30, book priced like its rungs, armourClass cape so it never counts toward a plate set) and its plain stats help every way to fight (the
     plan's rule): the ladder's cut between the Houndskin's 70 and the Trollhide's 150, and a point of damage for each style. Ships plain until
     the cloak's perks (Slip, Stride) are hooked. */
  warband_bulwark: { n: 'Warband Bulwark', icon: '🦸', v: priced(240, 3), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 3, rarity: 'rare',      reqSkill: 'level', ...onTier(3), steadyPm: 110 },
  shadowsilk_cape: { n: 'Spidersilk Cape', icon: '🦸', v: priced(240, 5), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 63, steadyPm: 185 },
  dawnlit_mantle:  { n: 'Dawnlit Mantle',  icon: '🦸', v: priced(240, 7), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 7, rarity: 'mythic',    reqSkill: 'level', ...onTier(7), steadyPm: 255 },

  /* ══ NECKLACE — accuracy low, damage high ═══════════════════════════════ */
  /* CRAFTED NOW (Tyler 2026-11-18: the two dropped Wickstead jewels become crafted; src/data/jewelry.js): Smithing 15. Its plain stats help every way to
     fight (the itemization plan's rule: atkB 3 alone gave a hammer +1.0% and a bow or a wand nothing, measured 2026-11-18), a Banded Signet's +2 +2 each. */
  wolfbone_torc:     { n: 'Wolfbone Necklace', icon: '📿', v: priced(200, 2), type: 'jewelry', slot: 'necklace', tier: 2, rarity: 'uncommon', reqSkill: 'level', ...onTier(2) },
  spidersilk_choker: { n: 'Spidersilk Choker', icon: '📿', v: priced(200, 3), type: 'jewelry', slot: 'necklace', tier: 3, rarity: 'rare',     reqSkill: 'level', reqLv: 34 },
  warlords_torc:     { n: "Warlord's Necklace",icon: '📿', v: priced(200, 4), type: 'jewelry', slot: 'necklace', tier: 4, rarity: 'epic',     reqSkill: 'level', reqLv: 52 },
  dawnbound_amulet:  { n: 'Dawnbound Amulet',  icon: '📿', v: priced(200, 7), type: 'jewelry', slot: 'necklace', tier: 7, rarity: 'mythic',   reqSkill: 'level', reqLv: 86 },

  /* ══ RING — the hybrid, and remember BOTH ring slots take one ═══════════
     Every number here is doubled in practice (ring1 + ring2), which is why the
     ring rungs are roughly half the necklace's.                             */
  /* CRAFTED NOW (src/data/jewelry.js, the designer's spec 2026-11-05): plain pieces read for EVERY style, +2 +2, since a bow or a
     wand drew nothing from a ring that paid melee only. Its Fine and Hallmarked rows copy this row. */
  banded_signet:     { n: 'Banded Signet',     icon: '💍', v: priced(200, 2), type: 'jewelry', slot: 'ring', tier: 2, rarity: 'uncommon',  reqSkill: 'level', ...onTier(2) },
  /* THE TIER 3 RING (itemization plan §4 phase 2, lane/d-jewelry-sample 2026-11-18): Smithing 30 makes it from Steel Bars, and a Seam Jasper, the
     Warrens' gem, is set in it. Every style a point more than the Banded Signet, as that one is for all three. A Hallmarked Banded Signet
     reforges into one (src/data/jewelry.js REFORGE_OFFERS). */
  seam_jasper_band:  { n: 'Seam Jasper Band',  icon: '💍', v: priced(200, 3), type: 'jewelry', slot: 'ring', tier: 3, rarity: 'rare',      reqSkill: 'level', ...onTier(3) },
  ruby_signet:       { n: 'Ruby Signet',       icon: '💍', v: priced(200, 5), type: 'jewelry', slot: 'ring', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 52 },
  /* The second scroll the code has been waiting for: `spellstone_diagram` →
     `spellstone_ring`, same b145 note, same three steps. Magic-flavoured
     because its material is a Warlock's cracked spellstone — but note it pays
     mostly in `magicAtkB`, which is a courtesy stat at that level, plus a
     modest `magicStrB`: magic is already the strongest family in the game by
     a factor of 2.26x at BiS and this lane does not widen that. */
  spellstone_ring:   { n: 'Spellstone Ring',   icon: '💍', v: 26000,          type: 'jewelry', slot: 'ring', tier: 6, rarity: 'unique',     reqSkill: 'level',   reqLv: 68 },
  dawnforged_signet: { n: 'Dawnforged Signet', icon: '💍', v: priced(200, 7), type: 'jewelry', slot: 'ring', tier: 7, rarity: 'mythic',     reqSkill: 'level', reqLv: 84 },

  /* ══ EVERY TIER WITH HOMES (lane/gear-phase-b; src/data/gear-tiers.js STEP_MATERIALS): one ring, one pair of earrings, one necklace and one cloak
     a step tier, worn from its Level, their stats the one formula's at the tier's item Level. Never dropped: they are the Trait craft's bases
     (09-crafting.md 4.13), held sourceless until Artificing's Trait craft ships after v0.3.0. ══ */
  ...Object.fromEntries(STEP_MATERIALS.flatMap((m) => STEP_JEWELS.map((j) => {
    const [wid, word] = materialWord(m, j.line);
    return [wid + '_' + j.key, { n: word + ' ' + j.label, icon: j.icon, v: Math.max(1, Math.round((j.vmul * m.value) / 5) * 5), type: j.type,
      slot: j.slot, ...(j.slot === 'cape' ? { armourClass: 'cape', steadyPm: stepCapeSteadyPm(m.tier) } : {}), tier: m.tier, rarity: m.rarity,
      reqSkill: 'level', reqLv: m.level, ...stepOf(m) }];
  }))),
});

/** EVERY STEP TIER'S RING, EARRINGS, NECKLACE AND CLOAK, by id: what Artificing's Trait craft could set a Trait on. Derived, so a new tier
    joins it, and joining it is no source and no hold (the door catalogue-coherence opens for the hold's proof, C11). */
export const STEP_TRAIT_PIECES = Object.freeze(STEP_MATERIALS.flatMap((m) => STEP_JEWELS.map((j) => materialWord(m, j.line)[0] + '_' + j.key)));

/** THE HELD BASES: the sixteen pieces no bench makes and no ground drops, kept for the Trait craft after v0.3.0, each with the section of
    09-crafting.md whose ruling names it held (the fate table's "Held as the Trait craft's bases" rows, ruled in 4.13). TYPED, never derived:
    a new tier's ring or cloak is NOT held until the designer rules it, so it needs a real door. tests/gear-stats.mjs GSF-9 reads the ruling
    in the named section; tests/catalogue-coherence.mjs C11 counts every row against its ceiling. */
export const TRAIT_BASE_HOLDS = Object.freeze({
  ember_ring: '4.15', ember_earrings: '4.15', ember_necklace: '4.15', archmage_cloak: '4.15',
  dawn_ring: '4.16', dawn_earrings: '4.16', dawn_necklace: '4.16', duskweave_cloak: '4.16',
  cobalt_ring: '4.16', cobalt_earrings: '4.16', cobalt_necklace: '4.16', samite_cloak: '4.16',
  wolfram_ring: '4.16', wolfram_earrings: '4.16', wolfram_necklace: '4.16', cerecloth_cloak: '4.16',
});

export const SLOT_DESC = {
  bronze_arrows: 'Plain arrows with blunt bronze heads. They\'re free, and you never run out of them',
  steel_arrows: 'Arrows with needle-sharp steel points. They fly straight even at long range',
  mithril_arrows: 'Arrows with light mithril heads. They fly so fast you can barely see them, and they don\'t bend on armor',
  rune_arrows: 'Arrows with rune-carved points. They hit a lot harder than you\'d expect from something so light',
  emberhead_arrows: 'Arrows with emberforged heads that never fully cool down. They\'re still glowing when they hit',
  dawnpoint_arrows: 'Arrows with dawnsteel points. They\'re the best arrows there are, and you\'ll burn through them by the quiverful',

  copper_studs: 'Two small copper earrings, the kind a village smith makes for weddings. Fighters wear them for luck in a scrap',
  fang_studs: 'Wolf fangs capped in bronze and worn as earrings. Trackers wear them for an edge in every fight',
  spidereye_studs: 'A venom spider\'s eyes set in steel and worn as earrings. They help you find the soft spot on a monster',
  wraithglass_drops: 'Earrings of cold glass with a wraith\'s veil melted into them. Light looks strange coming through them',
  rubyfire_studs: 'Ruby earrings in rune-carved settings. They flash like sparks when the light hits them',
  dragon_gem_earrings: 'A dragon\'s heart-gem cut in half to make a pair of earrings. It\'s the best work a gemcutter can do',

  woolen_cloak: 'A plain wool cloak that keeps the rain off. It\'s the first cloak most people ever own',
  warband_bulwark: 'Bear pelts sewn over a steel frame and worn on your back. Every hit you take lands a little softer',
  houndskin_cloak: 'A cape for any fighter, with more force behind a blade or a hammer. Wolf pelts backed with bear hide, cut short for the swing',
  shadowsilk_cape: 'A cape of spider silk, woven tight on a cave loom. It doesn\'t move, even when you\'re running',
  dawnlit_mantle: 'A cape woven from duskwood thread with strands of dawnsteel through it. The hem shines when the sun\'s up',

  wolfbone_torc: 'A wolf bone necklace bound in bronze. Hunters keep count of their kills on it',
  spidersilk_choker: 'A tight necklace of spider silk spun with gold thread',
  warlords_torc: 'Two warlords\' badges melted down into one necklace. The second warlord didn\'t hand his over',
  dawnbound_amulet: 'A dawnsteel and dragon gem amulet on a gold chain. It\'s worth more than most towns',

  banded_signet: 'A copper ring with a bronze band around it. The Banded Company gave one to each of its soldiers',
  seam_jasper_band: 'A plain steel band cut to hold a jasper from the Warrens seams. Smiths make them in pairs, one for each hand',
  ruby_signet: 'A ruby as big as your thumbnail on a mithril band. Everyone notices it on your hand',
  spellstone_ring: 'A warlock\'s cracked spellstone wrapped in runes. It still hums when a spell goes off',
  dawnforged_signet: 'A ring forged from dawnsteel, death-steel and gold. It\'s about as tough as a ring gets',
};
