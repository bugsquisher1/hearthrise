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
     oversight: a tier-1 ranged player fires ~13,900 arrows across an 8-hour
     absence and grosses ~18,600 gold doing it, so there is NO integer price at
     which tier-1 ammo costs less than a third of the income it earns. The first
     rung is therefore free — training arrows — and the supply loop starts at
     tier 2, where the same 13,600 arrows cost ~27% of gross at book value.

     NOTHING CONSUMES THESE YET. `src/core/**` contains no reference to `ammo`
     at all (verified by grep across src/core and supabase/functions). The
     engine change is specified in the handoff; until it lands `ammoPerShot` is
     inert, and no flavour line below promises a burn that does not happen.  */
  bronze_arrows:    { n: 'Bronze Arrows',      icon: '🏹', v: 1,  type: 'ammo', slot: 'ammo', tier: 1, rarity: 'common',    reqSkill: 'ranged', reqLv: 1,  rangeAtkB: 2, rangeStrB: 2,  ammoPerShot: 0 },
  barbed_arrows:    { n: 'Barbed Arrows',      icon: '🏹', v: 1,  type: 'ammo', slot: 'ammo', tier: 2, rarity: 'uncommon',  reqSkill: 'ranged', reqLv: 15, rangeAtkB: 3, rangeStrB: 3,  ammoPerShot: 1 },
  steel_arrows:     { n: 'Steel Arrows',       icon: '🏹', v: 2,  type: 'ammo', slot: 'ammo', tier: 3, rarity: 'rare',      reqSkill: 'ranged', reqLv: 30, rangeAtkB: 4, rangeStrB: 5,  critB: 0.01,  ammoPerShot: 1 },
  mithril_arrows:   { n: 'Mithril Arrows',     icon: '🏹', v: 4,  type: 'ammo', slot: 'ammo', tier: 4, rarity: 'epic',      reqSkill: 'ranged', reqLv: 45,               rangeStrB: 8,  critB: 0.01,  ammoPerShot: 1 },
  rune_arrows:      { n: 'Rune Arrows',        icon: '🏹', v: 6,  type: 'ammo', slot: 'ammo', tier: 5, rarity: 'legendary', reqSkill: 'ranged', reqLv: 60,               rangeStrB: 11, critB: 0.015, ammoPerShot: 1 },
  emberhead_arrows: { n: 'Emberhead Arrows',   icon: '🏹', v: 9,  type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75,               rangeStrB: 14, critB: 0.02,  ammoPerShot: 1 },
  dawnpoint_arrows: { n: 'Dawnpoint Arrows',   icon: '🏹', v: 12, type: 'ammo', slot: 'ammo', tier: 7, rarity: 'mythic',    reqSkill: 'ranged', reqLv: 88,               rangeStrB: 18, critB: 0.03,  ammoPerShot: 1 },

  /* ══ EARRINGS — the precision slot ══════════════════════════════════════
     A brand-new lane needs an identity that is not "more of what the necklace
     already does". Earrings are crit + a little ward: the smallest numbers in
     the game, in the smallest slot, gated on Defence so every build can wear
     them (the generated armour ladder already gates on Defence, so no build is
     excluded by it — unlike gating on Attack, which would lock out mages).

     Crit headroom checked: best-in-slot critB is 0.308 today and the engine cap
     (COMBAT_BALANCE.critCap) is 0.60. This lane adds at most 0.04.            */
  copper_studs:        { n: 'Copper Studs',        icon: '💎', v: priced(100, 1), type: 'jewelry', slot: 'earrings', tier: 1, rarity: 'common',    defB: 1, critB: 0.005 },
  fang_studs:          { n: 'Fang Studs',          icon: '💎', v: priced(100, 2), type: 'jewelry', slot: 'earrings', tier: 2, rarity: 'uncommon',  reqSkill: 'defense', reqLv: 18, defB: 2, critB: 0.01 },
  spidereye_studs:     { n: 'Spider-Eye Studs',    icon: '💎', v: priced(100, 3), type: 'jewelry', slot: 'earrings', tier: 3, rarity: 'rare',      reqSkill: 'defense', reqLv: 34, defB: 3, critB: 0.015, strB: 2 },
  wraithglass_drops:   { n: 'Wraithglass Drops',   icon: '💎', v: priced(100, 4), type: 'jewelry', slot: 'earrings', tier: 4, rarity: 'epic',      reqSkill: 'defense', reqLv: 50, defB: 4, critB: 0.02,  strB: 3 },
  rubyfire_studs:      { n: 'Rubyfire Studs',      icon: '💎', v: priced(100, 5), type: 'jewelry', slot: 'earrings', tier: 5, rarity: 'legendary', reqSkill: 'defense', reqLv: 66, defB: 5, critB: 0.025, strB: 3 },
  /* The capstone the code has been waiting for. `gemcutter_note` has existed as
     a recipe scroll since b145 pointing at `dragon_gem_earrings`, deliberately
     NOT dropped because "a scroll that unlocks nothing is a confusing dead
     end" (legacy.js:10976). Its own instructions: define the item in
     src/data/items.js, add the recipe with `gated:`, add the drop in
     src/data/monsters.js. All three are done. */
  dragon_gem_earrings: { n: 'Dragon Gem Earrings', icon: '💎', v: 24000, type: 'jewelry', slot: 'earrings', tier: 8, rarity: 'unique', reqSkill: 'defense', reqLv: 82, defB: 8, critB: 0.04, strB: 4, rangeStrB: 4, magicStrB: 4 },

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
  woolen_cloak:    { n: 'Woollen Cloak',   icon: '🦸', v: priced(240, 1), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 1, rarity: 'common',    reqSkill: 'defense', reqLv: 12, defB: 2 },
  houndskin_cloak: { n: 'Houndskin Cloak', icon: '🦸', v: priced(240, 2), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 2, rarity: 'uncommon',  reqSkill: 'defense', reqLv: 28, defB: 4,  strB: 1 },
  trollhide_cape:  { n: 'Trollhide Cape',  icon: '🦸', v: priced(240, 4), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 4, rarity: 'epic',      reqSkill: 'defense', reqLv: 50, defB: 11, strB: 2 },
  shadowsilk_cape: { n: 'Shadowsilk Cape', icon: '🦸', v: priced(240, 5), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 5, rarity: 'legendary', reqSkill: 'defense', reqLv: 63, defB: 16, strB: 3 },
  dawnlit_mantle:  { n: 'Dawnlit Mantle',  icon: '🦸', v: priced(240, 7), type: 'armor', slot: 'cape', armourClass: 'cape', tier: 7, rarity: 'mythic',    reqSkill: 'defense', reqLv: 88, defB: 30, strB: 3, critB: 0.01 },

  /* ══ NECKLACE — accuracy low, damage high ═══════════════════════════════ */
  wolfbone_torc:     { n: 'Wolfbone Torc',     icon: '📿', v: priced(200, 2), type: 'jewelry', slot: 'necklace', tier: 2, rarity: 'uncommon', reqSkill: 'defense', reqLv: 16, atkB: 3, defB: 2 },
  spidersilk_choker: { n: 'Spidersilk Choker', icon: '📿', v: priced(200, 3), type: 'jewelry', slot: 'necklace', tier: 3, rarity: 'rare',     reqSkill: 'defense', reqLv: 34, atkB: 5, critB: 0.01 },
  warlords_torc:     { n: "Warlord's Torc",    icon: '📿', v: priced(200, 4), type: 'jewelry', slot: 'necklace', tier: 4, rarity: 'epic',     reqSkill: 'defense', reqLv: 52, atkB: 6, strB: 5, defB: 3 },
  dawnbound_amulet:  { n: 'Dawnbound Amulet',  icon: '📿', v: priced(200, 7), type: 'jewelry', slot: 'necklace', tier: 7, rarity: 'mythic',   reqSkill: 'defense', reqLv: 86, atkB: 8, strB: 7, defB: 4 },

  /* ══ RING — the hybrid, and remember BOTH ring slots take one ═══════════
     Every number here is doubled in practice (ring1 + ring2), which is why the
     ring rungs are roughly half the necklace's.                             */
  banded_signet:     { n: 'Banded Signet',     icon: '💍', v: priced(200, 2), type: 'jewelry', slot: 'ring', tier: 2, rarity: 'uncommon',  reqSkill: 'defense', reqLv: 18, atkB: 2, strB: 2 },
  ruby_signet:       { n: 'Ruby Signet',       icon: '💍', v: priced(200, 5), type: 'jewelry', slot: 'ring', tier: 5, rarity: 'legendary', reqSkill: 'defense', reqLv: 52, atkB: 4, strB: 4, critB: 0.01 },
  /* The second scroll the code has been waiting for: `spellstone_diagram` →
     `spellstone_ring`, same b145 note, same three steps. Magic-flavoured
     because its material is a Warlock's cracked spellstone — but note it pays
     mostly in `magicAtkB`, which is a courtesy stat at that level, plus a
     modest `magicStrB`: magic is already the strongest family in the game by
     a factor of 2.26x at BiS and this lane does not widen that. */
  spellstone_ring:   { n: 'Spellstone Ring',   icon: '💍', v: 26000,          type: 'jewelry', slot: 'ring', tier: 6, rarity: 'unique',     reqSkill: 'magic',   reqLv: 68, magicAtkB: 6, magicStrB: 4, defB: 3, critB: 0.01 },
  dawnforged_signet: { n: 'Dawnforged Signet', icon: '💍', v: priced(200, 7), type: 'jewelry', slot: 'ring', tier: 7, rarity: 'mythic',     reqSkill: 'defense', reqLv: 84, atkB: 6, strB: 6, critB: 0.01 },
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
       8-hour absence**, **20,455 per 12-hour absence** (12 h is the F2P
       `offlineCapHours`; 16 h with Offline+, more with perks).
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

   Everything else in this table is ordinary crafting and is not Fletching's.
   ══════════════════════════════════════════════════════════════════════════ */
export const SLOT_RECIPES = {
  smithing: [],
  crafting: [
    /* ── fletching interface (see the block above) ── */
    { id: 'fletch_bronze_arrows',    name: 'Fletch Bronze Arrows',    icon: '🏹', inputs: { bronze_bar: 6, normal_plank: 4 },                 output: 'bronze_arrows',    outputQty: 500,  xp: 90,  req: 5,  ms: 3200 },
    { id: 'fletch_barbed_arrows',    name: 'Fletch Barbed Arrows',    icon: '🏹', inputs: { iron_bar: 2, oak_plank: 2 },                      output: 'barbed_arrows',    outputQty: 500,  xp: 150, req: 18, ms: 3400 },
    { id: 'fletch_steel_arrows',     name: 'Fletch Steel Arrows',     icon: '🏹', inputs: { steel_bar: 2, willow_plank: 2 },                  output: 'steel_arrows',     outputQty: 500,  xp: 230, req: 33, ms: 3600 },
    { id: 'fletch_mithril_arrows',   name: 'Fletch Mithril Arrows',   icon: '🏹', inputs: { mithril_bar: 1, maple_plank: 2 },                 output: 'mithril_arrows',   outputQty: 500,  xp: 330, req: 48, ms: 3800 },
    { id: 'fletch_rune_arrows',      name: 'Fletch Rune Arrows',      icon: '🏹', inputs: { rune_bar: 1, yew_plank: 1 },                      output: 'rune_arrows',      outputQty: 500,  xp: 450, req: 63, ms: 4000 },
    { id: 'fletch_emberhead_arrows', name: 'Fletch Emberhead Arrows', icon: '🏹', inputs: { ember_bar: 1, silk_thread: 16 },                  output: 'emberhead_arrows', outputQty: 500,  xp: 600, req: 78, ms: 4200 },
    { id: 'fletch_dawnpoint_arrows', name: 'Fletch Dawnpoint Arrows', icon: '🏹', inputs: { dawn_bar: 1, duskwood_plank: 1 },                 output: 'dawnpoint_arrows', outputQty: 1000, xp: 820, req: 91, ms: 4400 },

    /* ── earrings ── */
    { id: 'jewel_copper_studs',        name: 'Set Copper Studs',        icon: '💎', inputs: { copper_bar: 2 },                                            output: 'copper_studs',        xp: 60,   req: 10, ms: 2600 },
    { id: 'jewel_fang_studs',          name: 'Set Fang Studs',          icon: '💎', inputs: { small_fang: 4, bronze_bar: 1 },                             output: 'fang_studs',          xp: 130,  req: 22, ms: 3000 },
    { id: 'jewel_spidereye_studs',     name: 'Set Spider-Eye Studs',    icon: '💎', inputs: { spider_eye: 1, steel_bar: 1 },                              output: 'spidereye_studs',     xp: 340,  req: 38, ms: 3600 },
    { id: 'jewel_wraithglass_drops',   name: 'Set Wraithglass Drops',   icon: '💎', inputs: { wraith_veil: 1, mithril_bar: 1 },                           output: 'wraithglass_drops',   xp: 760,  req: 54, ms: 4200 },
    { id: 'jewel_rubyfire_studs',      name: 'Set Rubyfire Studs',      icon: '💎', inputs: { ruby: 2, rune_bar: 1, shadow_thread: 2 },                   output: 'rubyfire_studs',      xp: 1560, req: 70, ms: 5000 },
    { id: 'jewel_dragon_gem_earrings', name: 'Cut Dragon Gem Earrings', icon: '💎', inputs: { dragon_gem: 1, gold_bar: 3, dawn_bar: 1 },                  output: 'dragon_gem_earrings', xp: 3400, req: 86, ms: 6200, gated: 'gemcutter_note' },

    /* ── capes ── */
    { id: 'tailor_woolen_cloak',    name: 'Tailor Woollen Cloak',   icon: '🦸', inputs: { wolf_pelt: 3, bone_chips: 2 },                                 output: 'woolen_cloak',    xp: 110,  req: 12, ms: 2800 },
    { id: 'tailor_houndskin_cloak', name: 'Tailor Houndskin Cloak', icon: '🦸', inputs: { wolf_pelt: 5, bat_wing: 4 },                                   output: 'houndskin_cloak', xp: 260,  req: 28, ms: 3400 },
    { id: 'tailor_trollhide_cape',  name: 'Tailor Trollhide Cape',  icon: '🦸', inputs: { troll_hide: 4, bear_pelt: 4, silk_thread: 4 },                 output: 'trollhide_cape',  xp: 940,  req: 50, ms: 4400 },
    { id: 'tailor_shadowsilk_cape', name: 'Tailor Shadowsilk Cape', icon: '🦸', inputs: { shadow_pelt: 4, shadow_thread: 6, silk_thread: 8 },            output: 'shadowsilk_cape', xp: 1900, req: 63, ms: 5000 },
    { id: 'tailor_dawnlit_mantle',  name: 'Tailor Dawnlit Mantle',  icon: '🦸', inputs: { duskwood_plank: 4, dawn_bar: 8, silk_thread: 12 },             output: 'dawnlit_mantle',  xp: 4600, req: 91, ms: 6600 },

    /* ── necklaces ── */
    { id: 'jewel_wolfbone_torc',     name: 'String Wolfbone Torc',     icon: '📿', inputs: { big_bones: 3, wolf_pelt: 2, bronze_bar: 1 },                 output: 'wolfbone_torc',     xp: 150,  req: 20, ms: 3000 },
    { id: 'jewel_spidersilk_choker', name: 'String Spidersilk Choker', icon: '📿', inputs: { silk_thread: 6, spider_eye: 1, gold_bar: 1 },                output: 'spidersilk_choker', xp: 400,  req: 38, ms: 3600 },
    { id: 'jewel_warlords_torc',     name: "Forge Warlord's Torc",     icon: '📿', inputs: { warlord_badge: 2, mithril_bar: 2, gold_bar: 1 },             output: 'warlords_torc',     xp: 900,  req: 56, ms: 4400 },
    /* req 86, not 89: the b343 ladder guard measures AVAILABILITY (the higher of
       the wield gate and the craft gate), and 89 opened a 21-level hole above
       the Panther's Eye Pendant at 68. */
    { id: 'jewel_dawnbound_amulet',  name: 'Cast Dawnbound Amulet',    icon: '📿', inputs: { dawn_bar: 4, gold_bar: 6, dragon_gem: 1, ancient_claw: 2 },  output: 'dawnbound_amulet',  xp: 4200, req: 86, ms: 6400 },

    /* ── rings ── */
    { id: 'jewel_banded_signet',     name: 'Set Banded Signet',     icon: '💍', inputs: { bronze_bar: 2, copper_bar: 2, magic_essence: 1 },                          output: 'banded_signet',     xp: 160,  req: 22, ms: 3000 },
    /* The ring lane's craft gates track their wield gates exactly (52 / 70 / 87).
       By AVAILABILITY — the higher of the wield gate and the craft gate, which
       is what the b343 ladder guard measures — ring was the worst ladder in the
       game: Hollow Sigil at 35, then nothing until 58. A 23-level dead zone in
       a slot the player wears two of. */
    { id: 'jewel_ruby_signet',       name: 'Set Ruby Signet',       icon: '💍', inputs: { ruby: 3, gold_bar: 6, rune_bar: 1 },                                      output: 'ruby_signet',       xp: 1200, req: 52, ms: 4600 },
    { id: 'jewel_spellstone_ring',   name: 'Bind Spellstone Ring',  icon: '💍', inputs: { cracked_spellstone: 3, ancient_rune: 6, rune_bar: 4, gold_bar: 4 },       output: 'spellstone_ring',   xp: 2400, req: 70, ms: 5400, gated: 'spellstone_diagram' },
    { id: 'jewel_dawnforged_signet', name: 'Forge Dawnforged Signet', icon: '💍', inputs: { dawn_bar: 6, gold_bar: 8, death_steel: 4 },                             output: 'dawnforged_signet', xp: 4000, req: 87, ms: 6300 },
  ],
};

export const SLOT_DESC = {
  bronze_arrows: 'Blunt bronze heads on plain shafts — a fletcher\'s first hundred, and they cost nothing but an afternoon',
  barbed_arrows: 'Iron heads filed with a backward tooth, so what goes in does not come out clean',
  steel_arrows: 'Steel points ground to a needle, true over distance and cruel at the end of it',
  mithril_arrows: 'Mithril heads so light the shaft outruns the eye, and so hard they turn on nothing',
  rune_arrows: 'Runed points that hum on the string and bite deeper than their weight has any right to',
  emberhead_arrows: 'Heads quenched in emberforge heat and still faintly warm — they go in glowing',
  dawnpoint_arrows: 'Dawnsteel points, each one worth a lesser sword, spent a quiverful at a time',

  copper_studs: 'Two beaten copper studs, a village smith\'s wedding work — small, honest, and they steady the eye',
  fang_studs: 'Wolf fangs capped in bronze, worn by trackers who like a kill to be quick',
  spidereye_studs: 'A venom-spider\'s eyes set in steel, still black and still watching for the soft place',
  wraithglass_drops: 'Wraith-veil fused into cold glass — light passes through and comes out wrong',
  rubyfire_studs: 'Rubies caught in runed settings that catch the light like a struck spark',
  dragon_gem_earrings: 'The gemcutter\'s masterwork: a dragon\'s heart-gem split in two and hung where it can see everything you fight',

  woolen_cloak: 'Honest wool against honest weather — the first cloak that is warmer than a rumour',
  houndskin_cloak: 'Hound-pelt lined with bat-leather, cut short so it never catches on a swing',
  trollhide_cape: 'Troll hide over bear pelt, thick enough to blunt a blade and heavy enough to notice',
  shadowsilk_cape: 'Panther-shadow woven on a spider\'s loom — it hangs perfectly still even when you do not',
  dawnlit_mantle: 'Duskwood thread shot through with dawnsteel, so the hem catches first light before you do',

  wolfbone_torc: 'A ring of wolfbone bound in bronze, worn by hunters who count their kills on it',
  spidersilk_choker: 'Spider-silk drawn to a thread of gold, close at the throat and quietly deadly',
  warlords_torc: 'Two warlords\' badges melted into one collar — the second one was not given willingly',
  dawnbound_amulet: 'Dawnsteel and dragon-gem hung on gold, an amulet a kingdom would notice missing',

  banded_signet: 'Bronze banded over copper, the signet a free company issues to its own',
  ruby_signet: 'A ruby the size of a thumbnail on a rune-bar band — it makes the hand it is on obvious',
  spellstone_ring: 'A warlock\'s cracked spellstone bound in runes, whispering the next word before you reach it',
  dawnforged_signet: 'Dawnsteel, death-steel and gold, forged into a ring that outlasts the finger wearing it',
};
