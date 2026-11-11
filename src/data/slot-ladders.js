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
// Executed against the real `playerCombatRolls`: player accuracy is
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

/* Book values follow the audit's §5.4 recommendation: `v` derives from the
   material tier's own economic curve rather than a hand-guessed number.
   value multipliers: [0.6, 1.3, 5, 15, 45, 130, 360] for tiers 1..7.       */
const TIER_VALUE = [0.6, 1.3, 5, 15, 45, 130, 360];
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];
const priced = (vmul, tier) => Math.max(1, Math.round((vmul * TIER_VALUE[tier - 1]) / 5) * 5);

export const SLOT_ITEMS = {
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

     THESE ARE SPENT (E1, 2026-08-31). `src/core/ammo.js spendForSwings` is
     called by `src/core/combat-sim.js simulateTick` on every swing, live and
     away, and the debit lands in the server accrual's signed `items` delta.
     Before that date `ammoPerShot` was inert and this block said so.  */
  bronze_arrows:    { n: 'Bronze Arrows',      icon: '🏹', v: 0,  type: 'ammo', slot: 'ammo', tier: 1, rarity: 'common',    reqSkill: 'ranged', reqLv: 1,  rangeAtkB: 2, rangeStrB: 2,  ammoPerShot: 0 },
  barbed_arrows:    { n: 'Barbed Arrows',      icon: '🏹', v: 1,  type: 'ammo', slot: 'ammo', tier: 2, rarity: 'uncommon',  reqSkill: 'ranged', reqLv: 15, rangeAtkB: 3, rangeStrB: 3,  ammoPerShot: 1 },
  steel_arrows:     { n: 'Steel Arrows',       icon: '🏹', v: 1,  type: 'ammo', slot: 'ammo', tier: 3, rarity: 'rare',      reqSkill: 'ranged', reqLv: 30, rangeAtkB: 4, rangeStrB: 5,  critB: 0.01,  ammoPerShot: 1 },
  mithril_arrows:   { n: 'Mithril Arrows',     icon: '🏹', v: 4,  type: 'ammo', slot: 'ammo', tier: 4, rarity: 'epic',      reqSkill: 'ranged', reqLv: 45,               rangeStrB: 8,  critB: 0.01,  ammoPerShot: 1 },
  rune_arrows:      { n: 'Rune Arrows',        icon: '🏹', v: 6,  type: 'ammo', slot: 'ammo', tier: 5, rarity: 'legendary', reqSkill: 'ranged', reqLv: 60,               rangeStrB: 11, critB: 0.015, ammoPerShot: 1 },
  emberhead_arrows: { n: 'Emberhead Arrows',   icon: '🏹', v: 9,  type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75,               rangeStrB: 14, critB: 0.02,  ammoPerShot: 1 },
  dawnpoint_arrows: { n: 'Dawnpoint Arrows',   icon: '🏹', v: 12, type: 'ammo', slot: 'ammo', tier: 7, rarity: 'mythic',    reqSkill: 'ranged', reqLv: 88,               rangeStrB: 18, critB: 0.03,  ammoPerShot: 1 },

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
  copper_studs:        { n: 'Copper Studs',        icon: '💎', v: priced(100, 1), type: 'jewelry', slot: 'earrings', tier: 1, rarity: 'common',    reqSkill: 'level', reqLv: 1, critB: 0.005 },
  fang_studs:          { n: 'Fang Studs',          icon: '💎', v: priced(100, 2), type: 'jewelry', slot: 'earrings', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 15, critB: 0.01 },
  spidereye_studs:     { n: 'Spider-Eye Studs',    icon: '💎', v: priced(100, 3), type: 'jewelry', slot: 'earrings', tier: 3, rarity: 'rare',      reqSkill: 'level', reqLv: 34, critB: 0.015, strB: 2 },
  wraithglass_drops:   { n: 'Wraithglass Drops',   icon: '💎', v: priced(100, 4), type: 'jewelry', slot: 'earrings', tier: 4, rarity: 'epic',      reqSkill: 'level', reqLv: 50, critB: 0.02,  strB: 3 },
  rubyfire_studs:      { n: 'Rubyfire Studs',      icon: '💎', v: priced(100, 5), type: 'jewelry', slot: 'earrings', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 66, critB: 0.025, strB: 3 },
  /* The capstone the code has been waiting for. `gemcutter_note` has existed as
     a recipe scroll since b145 pointing at `dragon_gem_earrings`, deliberately
     NOT dropped because "a scroll that unlocks nothing is a confusing dead
     end" (legacy.js:10976). Its own instructions: define the item in
     src/data/items.js, add the recipe with `gated:`, add the drop in
     src/data/monsters.js. All three are done. */
  dragon_gem_earrings: { n: 'Dragon Gem Earrings', icon: '💎', v: 24000, type: 'jewelry', slot: 'earrings', tier: 8, rarity: 'unique', reqSkill: 'level', reqLv: 82, critB: 0.04, strB: 4, rangeStrB: 4, magicStrB: 4 },

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
     (no style's accuracy or damage pays for it), MADE in Crafting from the Thicket's own Wolf Pelts (about 31 an hour
     at the floor, tests/hunt-core/forest-cave.mjs --play): the hunt feeds the bench. Between the Shop's Traveler Cape
     (Level 1, defense 1) and Grayjaw's Ruff (Level 12, defense 3 and crit). Book 150 sells for 75 (tier 1 at 0.5,
     loot-bands.js) against six pelts' 210: stitching is never a gold faucet (style-gear.js's economy rule). */
  graypelt_cloak:  { n: 'Graypelt Cloak',  icon: '🦸', v: 150, type: 'armor', slot: 'cape', armourClass: 'cape', tier: 1, rarity: 'common', reqSkill: 'level', reqLv: 8, steadyPm: 30, critB: 0.005 },
  woolen_cloak:    { n: 'Woollen Cloak',   icon: '🦸', v: priced(240, 1), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 1, rarity: 'common',    reqSkill: 'level', reqLv: 12, steadyPm: 30 },
  houndskin_cloak: { n: 'Houndskin Cloak', icon: '🦸', v: priced(240, 2), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 22, steadyPm: 70,  strB: 1 },
  trollhide_cape:  { n: 'Trollhide Cape',  icon: '🦸', v: priced(240, 4), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 4, rarity: 'epic',      reqSkill: 'level', reqLv: 50, steadyPm: 150, strB: 2 },
  shadowsilk_cape: { n: 'Shadowsilk Cape', icon: '🦸', v: priced(240, 5), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 63, steadyPm: 185, strB: 3 },
  dawnlit_mantle:  { n: 'Dawnlit Mantle',  icon: '🦸', v: priced(240, 7), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 7, rarity: 'mythic',    reqSkill: 'level', reqLv: 88, steadyPm: 255, strB: 3, critB: 0.01 },

  /* ══ NECKLACE — accuracy low, damage high ═══════════════════════════════ */
  wolfbone_torc:     { n: 'Wolfbone Torc',     icon: '📿', v: priced(200, 2), type: 'jewelry', slot: 'necklace', tier: 2, rarity: 'uncommon', reqSkill: 'level', reqLv: 15, atkB: 3},
  spidersilk_choker: { n: 'Spidersilk Choker', icon: '📿', v: priced(200, 3), type: 'jewelry', slot: 'necklace', tier: 3, rarity: 'rare',     reqSkill: 'level', reqLv: 34, atkB: 5, critB: 0.01 },
  warlords_torc:     { n: "Warlord's Torc",    icon: '📿', v: priced(200, 4), type: 'jewelry', slot: 'necklace', tier: 4, rarity: 'epic',     reqSkill: 'level', reqLv: 52, atkB: 6, strB: 5},
  dawnbound_amulet:  { n: 'Dawnbound Amulet',  icon: '📿', v: priced(200, 7), type: 'jewelry', slot: 'necklace', tier: 7, rarity: 'mythic',   reqSkill: 'level', reqLv: 86, atkB: 8, strB: 7},

  /* ══ RING — the hybrid, and remember BOTH ring slots take one ═══════════
     Every number here is doubled in practice (ring1 + ring2), which is why the
     ring rungs are roughly half the necklace's.                             */
  /* CRAFTED NOW (src/data/jewelry.js, the designer's spec 2026-11-05): plain pieces read for EVERY style, +2 +2, since a bow or a
     wand drew nothing from a ring that paid melee only. Its Fine and Hallmarked rows copy this row. */
  banded_signet:     { n: 'Banded Signet',     icon: '💍', v: priced(200, 2), type: 'jewelry', slot: 'ring', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 15, atkB: 2, strB: 2, rangeAtkB: 2, rangeStrB: 2, magicAtkB: 2, magicStrB: 2 },
  ruby_signet:       { n: 'Ruby Signet',       icon: '💍', v: priced(200, 5), type: 'jewelry', slot: 'ring', tier: 5, rarity: 'legendary', reqSkill: 'level', reqLv: 52, atkB: 4, strB: 4, critB: 0.01 },
  /* The second scroll the code has been waiting for: `spellstone_diagram` →
     `spellstone_ring`, same b145 note, same three steps. Magic-flavoured
     because its material is a Warlock's cracked spellstone — but note it pays
     mostly in `magicAtkB`, which is a courtesy stat at that level, plus a
     modest `magicStrB`: magic is already the strongest family in the game by
     a factor of 2.26x at BiS and this lane does not widen that. */
  spellstone_ring:   { n: 'Spellstone Ring',   icon: '💍', v: 26000,          type: 'jewelry', slot: 'ring', tier: 6, rarity: 'unique',     reqSkill: 'level',   reqLv: 68, magicAtkB: 6, magicStrB: 4, critB: 0.01 },
  dawnforged_signet: { n: 'Dawnforged Signet', icon: '💍', v: priced(200, 7), type: 'jewelry', slot: 'ring', tier: 7, rarity: 'mythic',     reqSkill: 'level', reqLv: 84, atkB: 6, strB: 6, critB: 0.01 },
};

/* ══════════════════════════════════════════════════════════════════════════
   RECIPES

   ── FLETCHING INTERFACE — READ BEFORE TOUCHING THE `fletch_*` ROWS ────────
   The seven `fletch_*` recipes below are authored under CRAFTING because that
   is the skill that exists today, and because an item with no source fails the
   b243 reachability guard. They are the Fletching agent's to relocate: every id
   is prefixed `fletch_` so one grep finds all of them.

   What Fletching must satisfy, derived by executing the real combat engine
   (bow swing interval 2112 ms, 1 arrow per swing):

     • BURN RATE is flat across tiers: **~1,705 arrows per hour**, **13,636 per
       8-hour absence**, **20,455 per 12-hour absence** (12 h is the base
       `offlineCapHours` for every account; more with earned perks).
     • PROVISIONING BUDGET: making a full night's arrows must cost the player
       under five minutes of Fletching, or ranged becomes the punished style.
       At ~3.5 s an action that means a batch of **at least 500** (41 actions
       for a 12-hour night). The batches below are 500, and 1000 at tier 7.
     • INPUT BUDGET: total input value per arrow must land at **10-20% of the
       gross (gold + expected drop value) that arrow earns**. Executed, that is
       ~0.25 g/arrow at tier 2 rising to ~1.5-2.5 g/arrow at tier 7.
     • ANTI-FAUCET: `batch x arrow.v` must stay within ~2x the input value or
       fletching becomes a gold printer that beats combat. Every row below sits
       at 1.2-1.9x, against a house median of 2.14x. For contrast, the existing
       `craft_iron_arrows` sits at **16.7x** — see the handoff.

   The jewellery and cape recipes that used to follow were deleted with
   crafted gear (demolition, 2026-10-14); their items stay until the roster.
   ══════════════════════════════════════════════════════════════════════════ */
export const SLOT_RECIPES = {
  crafting: [
    /* ── fletching interface (see the block above) ── */
    /* b374 — BATCH CUT 500→50 (Tyler, said twice: "500 bronze arrows seems like
       way too much for 1 craft"). The 500 figure was a real burn-rate calc, but
       it made one 5-second craft supply ~18 minutes of ranged, which reads absurd
       and — the engineering cost — put every fletch row OVER c_max_item_delta on a
       15-hour offline auto-craft, so all seven lived on the AMMO_CLAMP_BASELINE
       amnesty (a standing exception the consumable-economy doc flagged for removal).
       At ×50 a full 15h offline fletch moves ~527k of one arrow, under the 600k
       (60%) honest-play line, so the amnesty is DELETED with this change (see
       tests/accrual-engine.mjs). xp-per-action is UNCHANGED, so Fletching's
       time-to-99 is untouched — only the arrows-per-action moved. Consequence,
       stated: arrow throughput per craft drops 10×, so a ranged main fletches
       more often to stay stocked. That is correct for the ammo-HUNGRY style
       (ammoPerShot 1.0, against the whetstone's 0.02 charge) and it makes ammo a
       real recurring craft rather than a five-second lifetime supply. Batches are
       uniform 50 across the ladder (dawnpoint drops its ×2). */
    { id: 'fletch_bronze_arrows',    name: 'Fletch Bronze Arrows ×50',    icon: '🏹', inputs: { bronze_bar: 6, normal_plank: 4 },                 output: 'bronze_arrows',    outputQty: 50,  xp: 90,  req: 5,  ms: 3200 },
    { id: 'fletch_barbed_arrows',    name: 'Fletch Barbed Arrows ×50',    icon: '🏹', inputs: { iron_bar: 3, oak_plank: 3 },                      output: 'barbed_arrows',    outputQty: 50,  xp: 150, req: 18, ms: 3400 },
    { id: 'fletch_steel_arrows',     name: 'Fletch Steel Arrows ×50',     icon: '🏹', inputs: { steel_bar: 2, willow_plank: 2 },                  output: 'steel_arrows',     outputQty: 50,  xp: 230, req: 33, ms: 3600 },
    { id: 'fletch_mithril_arrows',   name: 'Fletch Mithril Arrows ×50',   icon: '🏹', inputs: { mithril_bar: 2, maple_plank: 2 },                 output: 'mithril_arrows',   outputQty: 50,  xp: 330, req: 48, ms: 3800 },
    { id: 'fletch_rune_arrows',      name: 'Fletch Rune Arrows ×50',      icon: '🏹', inputs: { rune_bar: 1, yew_plank: 1 },                      output: 'rune_arrows',      outputQty: 50,  xp: 450, req: 63, ms: 4000 },
    { id: 'fletch_emberhead_arrows', name: 'Fletch Emberhead Arrows ×50', icon: '🏹', inputs: { ember_bar: 1, silk_thread: 16 },                  output: 'emberhead_arrows', outputQty: 50,  xp: 600, req: 78, ms: 4200 },
    { id: 'fletch_dawnpoint_arrows', name: 'Fletch Dawnpoint Arrows ×50', icon: '🏹', inputs: { dawn_bar: 1, duskwood_plank: 1 },                 output: 'dawnpoint_arrows', outputQty: 50, xp: 820, req: 91, ms: 4400 },
    /* The first-hour rung (graypelt_cloak above): Crafting 1, so a hero who never crafted can stitch it the day it reaches Level 8. */
    { id: 'stitch_graypelt_cloak', name: 'Stitch Graypelt Cloak', icon: '🦸', inputs: { wolf_pelt: 6 }, output: 'graypelt_cloak', xp: 30, req: 1, ms: 3200 },
    /* THE GLADE'S RUNG (designer 2026-11-04, played: nothing new to wear by Level from 15 to 28, and What next named one cape at 0.099% a kill). A cape every way to fight wears, at Level 22, made from what the Glade
       drops: a Bear Pelt only comes with a party or on a harder hunt (hunt-tiers.js), so the rung asks for the one step up Levels 10 to 30 turn on, and Crafting 1, as the Graypelt does: at the bench's real XP, Crafting 5 was 35 more cloaks with no decision in them. Twelve pelts' 420 and the Bear's 260 of book stand over the cloak's 310: never a gold faucet. */
    { id: 'stitch_houndskin_cloak', name: 'Stitch Houndskin Cloak', icon: '🦸', inputs: { wolf_pelt: 12, bear_pelt: 1 }, output: 'houndskin_cloak', xp: 60, req: 1, ms: 3400 },
  ],
};

export const SLOT_DESC = {
  bronze_arrows: 'Plain arrows with blunt bronze heads. They\'re free, and you never run out of them',
  barbed_arrows: 'Iron arrowheads filed with a hook on the back, so they tear on the way out',
  steel_arrows: 'Arrows with needle-sharp steel points. They fly straight even at long range',
  mithril_arrows: 'Arrows with light mithril heads. They fly so fast you can barely see them, and they don\'t bend on armor',
  rune_arrows: 'Arrows with rune-carved points. They hit a lot harder than you\'d expect from something so light',
  emberhead_arrows: 'Arrowheads cooled from the emberforge that stay a little warm. They\'re still glowing when they hit',
  dawnpoint_arrows: 'Arrows with dawnsteel points. Each head costs about as much as a cheap sword, and you shoot them by the quiverful',

  copper_studs: 'Two small copper earrings, the kind a village smith makes for weddings. They help you land a crit now and then',
  fang_studs: 'Wolf fangs capped in bronze and worn as earrings. Trackers like them because they help you crit',
  spidereye_studs: 'A venom spider\'s eyes set in steel and worn as earrings. They help you find the soft spot on a monster',
  wraithglass_drops: 'Earrings of cold glass with a wraith\'s veil melted into them. Light looks strange coming through them',
  rubyfire_studs: 'Ruby earrings in rune-carved settings. They flash like sparks when the light hits them',
  dragon_gem_earrings: 'A dragon\'s heart-gem cut in half to make a pair of earrings. It\'s the best work a gemcutter can do',

  woolen_cloak: 'A plain wool cloak that keeps the rain off. It\'s the first cloak most people ever own',
  houndskin_cloak: 'A cape for any fighter, with more force behind a blade or a hammer. Wolf pelts backed with bear hide, cut short for the swing',
  trollhide_cape: 'Troll hide over bear pelt, thick enough to blunt a blade and heavy enough to notice',
  shadowsilk_cape: 'A cape of shadow silk woven on a spider\'s loom. It doesn\'t move, even when you\'re running',
  dawnlit_mantle: 'A cape woven from duskwood thread with strands of dawnsteel through it. The hem shines when the sun\'s up',

  wolfbone_torc: 'A wolf bone necklace bound in bronze. Hunters keep count of their kills on it',
  spidersilk_choker: 'A tight necklace of spider silk spun with gold thread. It helps your hits land and crit',
  warlords_torc: 'Two warlords\' badges melted down into one necklace. The second warlord didn\'t hand his over',
  dawnbound_amulet: 'A dawnsteel and dragon gem amulet on a gold chain. It\'s worth more than most towns',

  banded_signet: 'A copper ring with a bronze band around it. The Banded Company gave one to each of its soldiers',
  ruby_signet: 'A ruby as big as your thumbnail on a mithril band. Everyone notices it on your hand',
  spellstone_ring: 'A warlock\'s cracked spellstone wrapped in runes. Mages wear it for stronger spells and more crits',
  dawnforged_signet: 'A ring forged from dawnsteel, death-steel and gold. It\'s about as tough as a ring gets',
};
