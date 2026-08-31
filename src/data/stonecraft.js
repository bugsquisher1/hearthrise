// ============================================================
// src/data/stonecraft.js — RUNECRAFTING + STONEMASON, as data.
//
// docs/design/consumable-economy.md, rulings R1-R10. Two of the three new
// artisan skills; Fletching is sequenced separately and owns the `fletch_*`
// rows in slot-ladders.js — NOTHING in this file touches them.
//
// R6: both are ARTISAN skills, and that is a scope finding rather than a taste
// call. The gathering engine branches on three skill ids in ~14 sites of the
// 9k-line monolith; the artisan engine is generic over `ARTISAN_RECIPES[skill]`
// and `resolveArtisanAction(recipe, {skillId})`. A fourth gathering table is
// CODE. A fourth artisan lane is DATA — which is this file.
//
// ══════════════════════════════════════════════════════════════════════════
// b432 · THE RUNECRAFTING COHERENCE RULING (Designer, delegated authority)
//
// Tyler, verbatim: "it doesn't look like you ever fixed runecrafting to make
// more sense." Four things were wrong at once, and none of them was a bug in
// any one file — they were four correct decisions that never met each other:
//
//   1. RUNECRAFTING DID NOT MAKE THE RUNES THE GAME USES. Elements v1 shipped
//      `ember_rune` / `frost_rune` / `poison_rune` — the ones you spend to
//      brand a weapon, worth +15% against a monster weak to that element — as
//      CRAFTING recipes at level 25, in a Crafting lane literally labelled
//      "Runes". Fixed: all three now live in `runecrafting` below, at 25.
//
//   2. THE SKILL COULD NOT BE STARTED. Every rung wanted a Blank Rune and the
//      only blank in the game came from Stonemason 8, so a player who picked
//      Runecrafting first met eleven actions and could do none of them. Fixed
//      twice over: `cut_rune_blanks` drops to Stonemason 4, and the Local Shop
//      counter stocks Blank Runes (×50 for 400 g — above their 5 g book value,
//      so there is no vendor arbitrage and the mason lane stays the cheap
//      route). Runecrafting is now playable at level 1 with NOTHING else
//      trained.
//
//   3. ONE RUNE IDEA, NOT THREE. The catalogue carried `air_rune`-`blood_rune`
//      (staff runes), `ember_rune`-`poison_rune` (enchanting runes) AND a
//      dormant `rune_of_ember` / `rune_of_frost` / `rune_of_poison` trio that
//      was the SECOND authoring of the same three elements. The trio is
//      retired (library2-items.js) and its painted art moves to the live ids.
//
//   4. THE SCREEN NOW SAYS WHAT THE TWO LANES ARE FOR. `ARTISAN_CATEGORIES`
//      gives Runecrafting "Staff Runes" and "Weapon Enchants", so the answer
//      to *what do I make, from what, and why* is on the screen rather than in
//      this comment.
//
// WHAT WAS EXPLICITLY NOT IN THIS RULING: E1, the per-swing ammo spend. It
// LANDED 2026-08-31 — `simulateTick` charges `spendForSwings` every swing, so
// runes burn at 1/cast and whetstones at 0.02/swing on both the live and the
// away path. The item copy below still does not promise a burn, because the
// empty-quiver indicator (§14, Art Director) does not exist yet; the mechanic
// is real, the wording is held until the surface can show it.
// ══════════════════════════════════════════════════════════════════════════
//
// R8: STONEMASON NEEDS NO WORKBENCH, and it already has none: homestead.js's
// `hasWorkbench()` reads "skills without a workbench room pass". So the ruling
// is satisfied structurally, with zero edits, and the b213/b227 cost-deadlock
// class is impossible for the whole stone chain: `ashlar` can be required by a
// property tier because nothing about producing it depends on owning one.
//
// ══════════════════════════════════════════════════════════════════════════
// §8.4 RULED: WHERE THE STONE COMES FROM — THE QUARRY LANE (P2), NOT A
//             MINING BY-PRODUCT (P1).
//
// The design doc left this open and recommended P1 (`byprod:` on every ROCKS
// row + one line in `doSkillAction`). I hold the delegated design authority
// here and I am ruling for P2, the input-free Stonemason lane. Four reasons,
// in the order they mattered:
//
//   1. SERVER AUTHORITY DECIDES IT. P1 edits `resolveGatherAction`, which is
//      vendored into `supabase/functions/hr-accrue/` and covered by a pinned
//      payload hash. P2 is legal server-side TODAY: 'artisan' became a
//      PAYABLE_KIND in b356, and an input-free recipe needs no engine change
//      at all (`recipeInputs({})` is `{}`, `missingInput` returns null, and
//      Prayer's bury actions already ship the mirror case with `output: null`).
//      A content skill must not be the thing that re-pins the combat engine.
//
//   2. THE NEW-PLAYER WALL. With P1, a player who opens Stonemason without a
//      mining history finds an empty skill and a homework assignment. With P2
//      they press "Quarry Rubble" and are a mason ten seconds later. Round 2
//      is a WIPE — every player meets this skill at level 1 — so day-one
//      reachability is the single most consequential property it has.
//
//   3. TIME IS THE HONEST PRICE OF A CASTLE. P1 makes stone a free rider on
//      an activity the player was doing anyway, which means castle goods cost
//      no time that was not already spent. Quarrying is a CHOICE with an
//      opportunity cost, and the castle ladder is the better for it.
//
//   4. IT DOES NOT DUPLICATE THE MINING FANTASY, which was the doc's stated
//      objection to P2. Mining pulls METAL out of a seam for the forge;
//      quarrying cuts BUILDING STONE for the wall. Different verb, different
//      product, different consumer — and the two never compete for a rung,
//      because a quarry rung is not in `ROCKS` and therefore cannot disturb
//      the b226 "every gathering rung is strictly better" invariant.
//
// The cost of the ruling, stated rather than glossed: a lane that mints from
// nothing is a FAUCET, so every quarried stone is flagged `raw: true` in
// items.js and the vendor bids VENDOR_RAW_RATE (0.20). Measured at the top
// rung that is ~9,000 g/h of vendor value, against a Dawnstone miner's
// comparable figure — i.e. it is priced as what it is, a gathering rate.
// A smoke guard asserts the flag on every input-free artisan output, so a
// future quarry rung cannot be added without it.
//
// P1 remains available later as a pure CONVENIENCE (a mining by-product that
// tops up the same items), and it composes with this lane rather than
// replacing it. It is a better second change than it would have been a first.
// ══════════════════════════════════════════════════════════════════════════
//
// ══════════════════════════════════════════════════════════════════════════
// WHY THE BATCHES ARE ~50 AND NOT ~500 — THE CLAMP IS A DESIGN INPUT
//
// `hr_apply` clamps one apply at `c_max_item_delta = 1,000,000` units of any
// single item, and the reachable offline cap is 15 hours (12 base + 3 clan).
// The seven shipped `fletch_*` rows produce 500-1,000 arrows per craft, so a
// full night on one of them moves 4.0-7.7 MILLION units, blows the clamp, and
// the server's degrade ladder halves the proposal until it fits — paying the
// player roughly an EIGHTH of their night with an incident logged on every
// rejected attempt. Security held the clamp (raising it 12x would widen the
// blast radius of every compromised apply in the game) and routed the yield
// to this desk as a design defect. `AMMO_CLAMP_BASELINE` in
// tests/accrual-engine.mjs amnesties those seven ids and RATCHETS them.
//
// NOTHING IN THIS FILE JOINS THAT LIST. Every rung below is sized so a full
// 15-hour night moves under 60% of the clamp — measured, not estimated:
//   units = floor(54,000,000 / (ms x PACE.actionMs)) x outputQty
// The worst rung here sits at 54%. The guard fails the build otherwise, which
// is the intended behaviour and the reason the numbers look the way they do.
//
// WHAT THAT COSTS THE PLAYER, ARITHMETIC FIRST: the clamp caps production at
// ~40,000 units per hour of crafting. Magic burns 1,429 runes/h (a 2,520 ms
// cast interval, measured), so ONE HOUR OF RUNECRAFTING SUPPLIES ROUGHLY A DAY
// OF CASTING — and a typical 8-hour absence costs about 23 minutes of active
// crafting. I looked hard at that number and I think it is BETTER than the
// ~4 minutes the 500-batch would have given, not merely tolerable:
//
//   • it is the right idle-game shape — active preparation, passive payoff;
//   • at 4 minutes a night the skill is a tax with a level number attached,
//     and nobody would ever choose to train it for its own sake;
//   • it leaves the ladder somewhere to go: the rungs climb in throughput as
//     well as in stat, so levelling Runecrafting visibly shortens the chore.
//
// HANDOFF TO FLETCHING: adopt these batch sizes. Arrows burn at 1,705/h
// against magic's 1,429/h, so an arrow rung at the same ~45% of clamp supplies
// a night in ~28 minutes — and `fletch_*` comes OFF the amnesty list, which
// the baseline's property (3) already reports as a stale exception waiting to
// be removed.
// ══════════════════════════════════════════════════════════════════════════

/* ── R7: ONE STAT CURVE ACROSS ALL THREE AMMO LADDERS ─────────────────
   `2 / 3 / 5 / 8 / 11 / 14 / 18` at tiers 1-7, because arrows, runes and
   whetstones are the SAME SLOT and no style may be quietly ahead. It is the
   curve the shipped arrow ladder already carries; a guard asserts all three
   at once so a future item that breaks it names itself.

   And what these items DELIBERATELY DO NOT CARRY:
     • no `critB`. `equipmentStats` sums crit from every slot regardless of the
       active style, so a MELEE player equipping Dawnpoint Arrows gets +0.03
       crit for free today (measured). The shipped arrows have that leak; the
       two ladders below do not add to it.
     • no `spdB`. The best-in-slot spdB sum is 0.16 against the engine's 0.20
       clamp — the b343 speed ladder is CLOSED, and a new speed item would turn
       every future speed item into a null item.
   Runes carry `magicStrB` only; whetstones carry `strB` only. Each pays the
   one style that would ever equip it. */
const AMMO_STAT = [2, 3, 5, 8, 11, 14, 18];
const AMMO_REQ_LV = [1, 15, 30, 45, 60, 75, 88];
const AMMO_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];

/* ── THE TIER-1 RUNG IS FREE, AND IT IS A RULING ──────────────────────
   `ammoPerShot: 0` on the first rung of every ladder. The b343 ruling derived
   it for arrows and it applies identically here: a tier-1 caster fires ~13,900
   times across an 8-hour absence and grosses ~18,600 gold doing it, so there
   is NO integer price at which tier-1 ammo costs less than a third of the
   income it earns. Training ammo, permanently. The supply loop starts at
   tier 2, where the same night costs a real but bounded share of gross.

   Consequence worth knowing rather than discovering (it is true of Bronze
   Arrows today too): at `ammoPerShot: 0` a single Air Rune is a permanent
   supply, so the batch of 42 is generous rather than necessary. That is fine —
   it is a clean first Runecrafting action and an honest XP rung. */
const FREE = 0;

/* ══════════════════════════════════════════════════════════════════════════
   ITEMS
   ══════════════════════════════════════════════════════════════════════════ */
export const STONECRAFT_ITEMS = {
  /* ══ QUARRIED STONE — the roots of the whole chain (§8.4 ruling above) ═══
     Three grades, one per Stonemason band. Priced as gathered material: the
     vendor bids 20% of `v` because items.js flags all three `raw`, so the
     player market is the better price for them — which is exactly the role
     b226 assigned to raw materials. */
  rubble:  { n: 'Rubble',        icon: '🪨', v: 6,  tier: 1, rarity: 'common' },
  granite: { n: 'Granite Stone', icon: '🪨', v: 22, tier: 3, rarity: 'uncommon' },
  basalt:  { n: 'Basalt Stone',  icon: '🪨', v: 60, tier: 5, rarity: 'rare' },

  /* ══ STONE BLOCKS — the intermediate every Stonemason lane runs on ═══════
     Not a sink and not a reward: the common trunk. Whetstones, blank runes
     and castle goods all branch off these three, which is what stops the
     skill being four unrelated ladders sharing a name. (b374: the item id
     stays `dressed_block` so no catalogue/art re-key is needed — only the
     display name drops the "dressed" jargon Tyler flagged.) */
  dressed_block: { n: 'Stone Block', icon: '🧱', v: 22,  tier: 1, rarity: 'common' },
  granite_block: { n: 'Granite Block', icon: '🧱', v: 85,  tier: 3, rarity: 'uncommon' },
  basalt_block:  { n: 'Basalt Block',  icon: '🧱', v: 230, tier: 5, rarity: 'rare' },

  /* ══ RUNE BLANKS — the Stonemason→Runecrafting seam ═════════════════════
     THE DEPENDENCY IS THE POINT, and it is stated plainly rather than hidden:
     magic's supply crosses TWO artisan skills where ranged's crosses one.
     That is paid for by magic's 2,520 ms cast interval — it burns 16% fewer
     consumables per hour than a bow at identical item values (§6.2). The
     deeper chain buys the cheaper burn. */
  rune_blank:      { n: 'Blank Rune',      icon: '⬜', v: 5,  tier: 1, rarity: 'common' },
  fine_rune_blank: { n: 'Fine Blank Rune', icon: '🔲', v: 28, tier: 3, rarity: 'uncommon' },
  deep_rune_blank: { n: 'Deep Blank Rune', icon: '🔳', v: 60, tier: 5, rarity: 'rare' },

  /* ══ RUNES — magic's ammo. The staff has a socket; you load a bound rune ══
     Values are IDENTICAL to the arrow ladder at every tier (1/1/2/4/6/9/12).
     R7's real claim is not "the numbers match" but "the gold-per-hour cost of
     being fully supplied is the same for all three styles"; the item value is
     an OUTPUT of that constraint, bounded by the anti-faucet rule, not a
     number anybody chose.

     The names are picked so PHASE TWO can hang elements on them with no
     renames — an Ice Troll weak to both arrows and fire is the target shape,
     and none of it ships in round 2. */
  air_rune:   { n: 'Air Rune',   icon: '🌀', v: 1,  type: 'ammo', slot: 'ammo', tier: 1, rarity: AMMO_RARITY[0], reqSkill: 'magic', reqLv: AMMO_REQ_LV[0], magicStrB: AMMO_STAT[0], ammoPerShot: FREE },
  earth_rune: { n: 'Earth Rune', icon: '🌍', v: 1,  type: 'ammo', slot: 'ammo', tier: 2, rarity: AMMO_RARITY[1], reqSkill: 'magic', reqLv: AMMO_REQ_LV[1], magicStrB: AMMO_STAT[1], ammoPerShot: 1 },
  water_rune: { n: 'Water Rune', icon: '💧', v: 2,  type: 'ammo', slot: 'ammo', tier: 3, rarity: AMMO_RARITY[2], reqSkill: 'magic', reqLv: AMMO_REQ_LV[2], magicStrB: AMMO_STAT[2], ammoPerShot: 1 },
  fire_rune:  { n: 'Fire Rune',  icon: '🔥', v: 4,  type: 'ammo', slot: 'ammo', tier: 4, rarity: AMMO_RARITY[3], reqSkill: 'magic', reqLv: AMMO_REQ_LV[3], magicStrB: AMMO_STAT[3], ammoPerShot: 1 },
  chaos_rune: { n: 'Chaos Rune', icon: '🌪️', v: 6,  type: 'ammo', slot: 'ammo', tier: 5, rarity: AMMO_RARITY[4], reqSkill: 'magic', reqLv: AMMO_REQ_LV[4], magicStrB: AMMO_STAT[4], ammoPerShot: 1 },
  death_rune: { n: 'Death Rune', icon: '💀', v: 9,  type: 'ammo', slot: 'ammo', tier: 6, rarity: AMMO_RARITY[5], reqSkill: 'magic', reqLv: AMMO_REQ_LV[5], magicStrB: AMMO_STAT[5], ammoPerShot: 1 },
  blood_rune: { n: 'Blood Rune', icon: '🩸', v: 12, type: 'ammo', slot: 'ammo', tier: 7, rarity: AMMO_RARITY[6], reqSkill: 'magic', reqLv: AMMO_REQ_LV[6], magicStrB: AMMO_STAT[6], ammoPerShot: 1 },

  /* ══ WHETSTONES — melee's ammo, and the charge-not-timer ruling (R4) ═════
     Tyler asked for "sharpening stones that temporarily increase melee weapon
     stats". A TIMED BUFF cannot deliver that in this game and the reason is
     disqualifying rather than aesthetic: the away ruling (away-time-ruling.md,
     binding) freezes buffs while the player is away — "it neither pays nor
     ticks down" — so a duration-based whetstone pays NOTHING overnight, in a
     game whose entire pitch is that it plays while you are away. It also fails
     projection: "lasts 20 minutes" is a lie the moment the tab closes.

     So the whetstone is not a buff. It is a CHARGE on the consumption channel,
     at `ammoPerShot: 0.02` — one honing per fifty swings, ~30 stones an hour.
     Consequences: it works unattended; it is projectable by the same formula
     as arrows; it does not touch `AWAY_SCOPE` at all; and the player-facing
     copy can still read "Keen edge: 8h 00m", DERIVED from stones / rate and
     never stored, so it cannot drift from the thing it describes.

     ⚠ Recorded so nobody later "fixes" this into BUFFS_DEF: making a whetstone
       a timed buff would silently return it to paying zero overnight.

     R5 — MELEE'S FLOOR STAYS FREE. Whetstones buy melee's CEILING (+14-18%
     max hit); an unsharpened sword takes no x0.25 penalty. The starting weapon
     is a Bronze Sword, so a paid melee floor would put every brand-new
     character in the penalty state from second one, and the only other way to
     price the floor is weapon durability. The asymmetry is deliberate and it
     is stated in the item copy rather than hidden.

     `strB` only — see the stat-curve note above. */
  coarse_whetstone:  { n: 'Coarse Whetstone',   icon: '🪨', v: 4,   type: 'ammo', slot: 'ammo', tier: 1, rarity: AMMO_RARITY[0], reqSkill: 'attack', reqLv: AMMO_REQ_LV[0], strB: AMMO_STAT[0], ammoPerShot: FREE },
  copper_whetstone:  { n: 'Copper Whetstone',   icon: '🪨', v: 15,  type: 'ammo', slot: 'ammo', tier: 2, rarity: AMMO_RARITY[1], reqSkill: 'attack', reqLv: AMMO_REQ_LV[1], strB: AMMO_STAT[1], ammoPerShot: 0.02 },
  iron_whetstone:    { n: 'Iron Whetstone',     icon: '🪨', v: 48,  type: 'ammo', slot: 'ammo', tier: 3, rarity: AMMO_RARITY[2], reqSkill: 'attack', reqLv: AMMO_REQ_LV[2], strB: AMMO_STAT[2], ammoPerShot: 0.02 },
  steel_whetstone:   { n: 'Steel Whetstone',    icon: '🪨', v: 108, type: 'ammo', slot: 'ammo', tier: 4, rarity: AMMO_RARITY[3], reqSkill: 'attack', reqLv: AMMO_REQ_LV[3], strB: AMMO_STAT[3], ammoPerShot: 0.02 },
  mithril_whetstone: { n: 'Mithril Whetstone',  icon: '🪨', v: 190, type: 'ammo', slot: 'ammo', tier: 5, rarity: AMMO_RARITY[4], reqSkill: 'attack', reqLv: AMMO_REQ_LV[4], strB: AMMO_STAT[4], ammoPerShot: 0.02 },
  rune_whetstone:    { n: 'Rune Whetstone',     icon: '🪨', v: 365, type: 'ammo', slot: 'ammo', tier: 6, rarity: AMMO_RARITY[5], reqSkill: 'attack', reqLv: AMMO_REQ_LV[5], strB: AMMO_STAT[5], ammoPerShot: 0.02 },
  dawn_whetstone:    { n: 'Dawnsteel Whetstone',icon: '🪨', v: 990, type: 'ammo', slot: 'ammo', tier: 7, rarity: AMMO_RARITY[6], reqSkill: 'attack', reqLv: AMMO_REQ_LV[6], strB: AMMO_STAT[6], ammoPerShot: 0.02 },

  /* ══ CASTLE — the other half of Stonemason, and why Tyler wanted it ══════
     `tag: 'castle'` puts these in the derived Castle Stores lane and in the
     Storehouse deposit filter, through `isCastleGood()` — one predicate, two
     readers, no drift.

     `ashlar` is the PERSONAL capstone good, sitting beside `timber_beam`
     (Crafting) and `iron_fitting` (Smithing) so the three artisan pillars each
     contribute exactly one material to the property ladder. It is wired into
     Stonecross Manor / Ironvale Keep / Hearthrise Castle in homestead.js —
     tiers whose names have promised cut stone since launch and whose costs
     were logs and ore.

     `keystone` is ADOPTED from Crafting, recipe and cost unchanged (it is
     defined in items.js and its recipe id `craft_keystone` is preserved, so
     clan-seat.js's material route to it still resolves). A keystone is the
     single most masonic object in architecture and it had the same story as
     the `fletch_*` rows: written where a skill existed, waiting for the skill
     that should own it.

     `vaultstone` — the CLAN castle good — is DELIBERATELY NOT IN THIS FILE.
     §8.2 records the dependency: its numbers for `hr_castle_tiers` 4-5 must be
     set AFTER the `clan_power` treasury-term fix lands, or they will be tuned
     against a ranking that is about to change. Shipping the item now with no
     sink would be the Cellar's "+500 storage" bug wearing a new hat. */
  ashlar: { n: 'Ashlar', icon: '🧱', v: 1500, tier: 3, tag: 'castle' },
};

/* ══════════════════════════════════════════════════════════════════════════
   RECIPES

   XP is BOOK VALUE. The player receives `book x PACE.xp (0.39)` at the one
   choke-point, and the tiles print the effective number — never the book one.
   Calibrated so both skills land in the 25-35 hour band that Smithing (27.8 h)
   and Crafting (25.5 h) already occupy: anything slower would be a second
   Cooking (155 h), anything faster would be free. An artisan skill's real cost
   is its INPUT CHAIN, not its XP treadmill, which is exactly why three artisan
   skills add progression depth without adding a second grind.
   ══════════════════════════════════════════════════════════════════════════ */
export const STONECRAFT_RECIPES = {
  runecrafting: [
    /* ── THE BIND LADDER. Seven tiers, plus four "Deepbind" rungs that are
       strictly better on BOTH axes a player cares about — more runes per
       action AND more runes per blank. Seven rungs across 1-88 is a rung every
       twelve levels, which reads thin; interleaved with the Deepbinds it is a
       rung every ~8, which is the density pacing-overhaul asks for.

       (The doc's other thickener — the three enchanting runes — is PHASE TWO,
       explicitly gated on "once we get more robust monsters". The staff ladder
       is the phase-two thickener I would reach for next: `WEAPON_FAMILIES` in
       gear-tiers.js already carries `skill:` on every family and the generator
       ignores it, so moving staves to Runecrafting is a two-line generator
       change expressed as data. Left alone here because that same field routes
       BOWS to Fletching and that agent owns the change.) */
    { id: 'bind_air_runes',     name: 'Bind Air Runes',       icon: '🌀', inputs: { rune_blank: 6 },              output: 'air_rune',   outputQty: 42, xp: 9,   req: 1,  ms: 3200 },
    { id: 'bind_earth_runes',   name: 'Bind Earth Runes',     icon: '🌍', inputs: { rune_blank: 6 },              output: 'earth_rune', outputQty: 45, xp: 50,  req: 15, ms: 3400 },
    { id: 'deepbind_earth',     name: 'Deepbind Earth Runes', icon: '🌍', inputs: { rune_blank: 7 },              output: 'earth_rune', outputQty: 58, xp: 105,  req: 24, ms: 3600 },
    { id: 'bind_water_runes',   name: 'Bind Water Runes',     icon: '💧', inputs: { rune_blank: 6, coal: 1 },     output: 'water_rune', outputQty: 48, xp: 185,  req: 30, ms: 3600 },
    { id: 'deepbind_water',     name: 'Deepbind Water Runes', icon: '💧', inputs: { rune_blank: 7, coal: 1 },     output: 'water_rune', outputQty: 60, xp: 330, req: 39, ms: 3800 },
    { id: 'bind_fire_runes',    name: 'Bind Fire Runes',      icon: '🔥', inputs: { fine_rune_blank: 6, coal: 1 },output: 'fire_rune',  outputQty: 50, xp: 500, req: 45, ms: 3800 },
    { id: 'bind_chaos_runes',   name: 'Bind Chaos Runes',     icon: '🌪️', inputs: { fine_rune_blank: 6 },         output: 'chaos_rune', outputQty: 54, xp: 940, req: 60, ms: 4000 },
    { id: 'deepbind_chaos',     name: 'Deepbind Chaos Runes', icon: '🌪️', inputs: { fine_rune_blank: 7 },         output: 'chaos_rune', outputQty: 64, xp: 1400, req: 69, ms: 4200 },
    { id: 'bind_death_runes',   name: 'Bind Death Runes',     icon: '💀', inputs: { deep_rune_blank: 6 },         output: 'death_rune', outputQty: 56, xp: 1500, req: 75, ms: 4200 },
    { id: 'bind_blood_runes',   name: 'Bind Blood Runes',     icon: '🩸', inputs: { deep_rune_blank: 6 },         output: 'blood_rune', outputQty: 58, xp: 2200,req: 88, ms: 4400 },
    { id: 'deepbind_blood',     name: 'Deepbind Blood Runes', icon: '🩸', inputs: { deep_rune_blank: 7 },         output: 'blood_rune', outputQty: 68, xp: 2900,req: 93, ms: 4600 },

    /* ══ THE ENCHANTING RUNES — ADOPTED FROM CRAFTING (b432, Designer) ══════
       Tyler: "it doesn't look like you ever fixed runecrafting to make more
       sense." He is right, and this is the centre of it. Elements v1 shipped
       the three runes the game ACTUALLY uses — you spend one to brand a weapon
       with an element, and `elementMultFor()` pays +15% against a monster weak
       to it — and it shipped them as CRAFTING recipes at level 25, in a lane
       Crafting called "Runes", while the skill named Runecrafting made a
       different set of runes entirely. A player opening Runecrafting therefore
       found a skill that does not make runes, and a player who wanted a rune
       found it under a skill that is not called Runecrafting.

       RULING: RUNECRAFTING OWNS EVERY RUNE IN THE GAME. The three binds move
       here with their essence inputs UNCHANGED, so nobody's supply chain moves
       and the enchant flow keeps working end to end.

       WHAT DID CHANGE, AND WHY IT IS WORTH THE FOUR EXTRA STONES: every rune
       in this skill is now bound onto a BLANK RUNE. That gives the whole bench
       one grammar a player can state in a sentence — *a blank, plus something
       to write on it, makes a rune* — instead of two unrelated recipe shapes
       filed under one name. It also means the on-ramp (Blank Runes, stocked by
       the Local Shop) feeds the ENTIRE skill rather than half of it.

       ALL THREE SIT AT 25, AND THAT IS DELIBERATE. Their three essences drop
       from perfectly parallel sources — tier 3/4/5 monsters at 0.08/0.09/0.10
       apiece (Fire Devil · Horned Demon · Chained Demon; Centipede · Winter
       Wolf · Frost Giant; Venom Spider · Carnivorous Plant · Carrion Swarm) —
       so a level ladder between them would be a fiction, and a fiction that
       tells the player ember is "better" than frost when the whole point of
       the element axis is that the right one depends on what you are fighting.
       Three rungs at one level is a CHOICE, not a ladder. The gate itself is
       unchanged in spirit: it was Crafting 25 and it is Runecrafting 25, so no
       live player is pushed further from a feature they already had.

       XP sits between `deepbind_earth` (req 24) and `bind_water` (req 30) on
       this skill's own curve — 150/3200ms = 0.047 book-xp/ms against their
       0.029 and 0.051 — so adopting them neither creates a trap rung nor an
       XP exploit. It cannot be one anyway: four essences per craft against a
       ~0.09 drop rate is roughly 45 kills for ONE rune. */
    { id: 'bind_ember_rune',  name: 'Bind Ember Rune',  icon: '🔴', inputs: { rune_blank: 4, ember_essence: 4,  magic_essence: 1 }, output: 'ember_rune',  outputQty: 1, xp: 150, req: 25, ms: 3200 },
    { id: 'bind_frost_rune',  name: 'Bind Frost Rune',  icon: '🔵', inputs: { rune_blank: 4, frost_essence: 4,  magic_essence: 1 }, output: 'frost_rune',  outputQty: 1, xp: 150, req: 25, ms: 3200 },
    { id: 'bind_poison_rune', name: 'Bind Poison Rune', icon: '🟣', inputs: { rune_blank: 4, poison_essence: 4, magic_essence: 1 }, output: 'poison_rune', outputQty: 1, xp: 150, req: 25, ms: 3200 },
  ],

  stonemason: [
    /* ── THE QUARRY LANE — ROCK GATHERING, PAID TO MINING (b374, Tyler).
       Input-free by design: this is where stone enters the game. Tyler's
       ruling: "gathering the rocks should be mining, refining them is the
       stonemason part." So every quarry rung carries `xpSkill: 'mining'` — the
       action still lives on the Stonemason bench (it MUST stay an artisan lane,
       because a stone node in ROCKS would disturb the b226 "every mining rung
       strictly better" invariant that guards the ore ladder), but the XP it
       pays goes to Mining.

       The xp values were RE-TUNED for Mining's curve, not Stonemason's: each
       quarry rung now sits BELOW the comparable Mining ore rung's xp/second, so
       quarrying is a SUPPLY activity and never the optimal way to train Mining
       (rubble 1.7 · granite 3.3 · basalt 4.5 xp/s effective, against ore's
       4.4-9.3). Stonemason no longer earns anything from quarrying — it earns
       from DRESSING (below), which is exactly the "refining is the stonemason
       part" split. Its earliest XP is `dress_rubble` (Cut Stone Block, req 1),
       reachable from an
       empty bag by quarrying rubble first, so the skill is not stranded. */
    { id: 'quarry_rubble',  name: 'Quarry Rubble',  icon: '🪨', inputs: {}, output: 'rubble',  outputQty: 5, xp: 7,  req: 1,  ms: 2600, xpSkill: 'mining' },
    { id: 'quarry_granite', name: 'Quarry Granite', icon: '🪨', inputs: {}, output: 'granite', outputQty: 3, xp: 22, req: 30, ms: 4200, xpSkill: 'mining' },
    { id: 'quarry_basalt',  name: 'Quarry Basalt',  icon: '🪨', inputs: {}, output: 'basalt',  outputQty: 2, xp: 43, req: 70, ms: 6000, xpSkill: 'mining' },

    /* ── THE BLOCK LANE. The common trunk — everything else branches here.
       This is the "refining" half that pays Stonemason. Renamed b374 (Tyler:
       "wtf is dress") — the action makes a Stone/Granite/Basalt Block. */
    { id: 'dress_rubble',  name: 'Cut Stone Block',   icon: '🧱', inputs: { rubble: 4 },  output: 'dressed_block', outputQty: 2, xp: 16,   req: 1,  ms: 2400 },
    { id: 'dress_granite', name: 'Cut Granite Block', icon: '🧱', inputs: { granite: 4 }, output: 'granite_block', outputQty: 2, xp: 195,  req: 30, ms: 3400 },
    { id: 'dress_basalt',  name: 'Cut Basalt Block',  icon: '🧱', inputs: { basalt: 4 },  output: 'basalt_block',  outputQty: 2, xp: 900, req: 70, ms: 4600 },

    /* ── THE BLANK LANE — Runecrafting's supply. Two rungs on the base blank
       (the second is strictly better per block AND per action), then one per
       stone grade. `magic_essence` enters at the DEEP blank and nowhere below
       it: gating low-tier runes on a combat drop would make magic circular in
       the bad direction — you would need runes to farm the thing that makes
       runes. From the deep blank up the loop is the GOOD kind: kill mages,
       bind their essence, cast at mages. Sized at 1 essence per 20 blanks so a
       full capped night of tier-6 casting costs ~115 essence, against a drop
       rate of 0.40-0.80 per wizard kill over thousands of kills. */
    /* b432 — `cut_rune_blanks` DROPS FROM req 8 TO req 4. It was the wall in
       Tyler's complaint: Runecrafting's every rung wanted a Blank Rune, and the
       only source of one was level EIGHT of a different skill, so a player who
       picked Runecrafting first opened a bench of eleven actions and could
       perform none of them, forever. Four is the smallest number that keeps the
       opening ladder in order (dress at 1, blanks at 4, whetstones at 6) and it
       is about two minutes of dressing rather than a session. The GOLD route —
       Blank Runes on the Local Shop counter — closes the same hole for a player
       who never wants to be a mason at all; this closes it for the one who
       simply has not got there yet. */
    { id: 'cut_rune_blanks',   name: 'Cut Blank Runes',      icon: '⬜', inputs: { dressed_block: 2 },                       output: 'rune_blank',      outputQty: 12, xp: 36,  req: 4,  ms: 2800 },
    { id: 'split_rune_blanks', name: 'Split Blank Runes',    icon: '⬜', inputs: { dressed_block: 3 },                       output: 'rune_blank',      outputQty: 20, xp: 92,  req: 22, ms: 3000 },
    { id: 'cut_fine_blanks',   name: 'Cut Fine Blank Runes', icon: '🔲', inputs: { granite_block: 2, dressed_block: 2 },     output: 'fine_rune_blank', outputQty: 14, xp: 400, req: 38, ms: 3400 },
    { id: 'cut_deep_blanks',   name: 'Cut Deep Blank Runes', icon: '🔳', inputs: { basalt_block: 3, magic_essence: 1 },      output: 'deep_rune_blank', outputQty: 20, xp: 1500, req: 74, ms: 4000 },

    /* ── THE WHETSTONE LANE — melee's supply. Batches of 10 against a burn of
       ~30/hour, so one action covers twenty minutes of swinging. Every rung's
       `batch x v` sits at 1.8-1.95x its input value, just inside the
       anti-faucet rule: an earlier instinct of v=200 on the steel rung would
       have been a 3.03x gold printer, and the constraint caught it, which is
       why it is written down as arithmetic rather than as a table. */
    { id: 'grind_coarse_whetstone',  name: 'Grind Coarse Whetstones',   icon: '🪨', inputs: { dressed_block: 1 },                      output: 'coarse_whetstone',  outputQty: 10, xp: 19,    req: 6,  ms: 2600 },
    { id: 'grind_copper_whetstone',  name: 'Grind Copper Whetstones',   icon: '🪨', inputs: { dressed_block: 2, copper_bar: 1 },       output: 'copper_whetstone',  outputQty: 10, xp: 70,   req: 16, ms: 2900 },
    { id: 'grind_iron_whetstone',    name: 'Grind Iron Whetstones',     icon: '🪨', inputs: { dressed_block: 3, iron_bar: 2 },         output: 'iron_whetstone',    outputQty: 10, xp: 168,   req: 31, ms: 3200 },
    { id: 'grind_steel_whetstone',   name: 'Grind Steel Whetstones',    icon: '🪨', inputs: { granite_block: 3, steel_bar: 2 },        output: 'steel_whetstone',   outputQty: 10, xp: 500,  req: 46, ms: 3600 },
    { id: 'grind_mithril_whetstone', name: 'Grind Mithril Whetstones',  icon: '🪨', inputs: { granite_block: 4, mithril_bar: 1 },      output: 'mithril_whetstone', outputQty: 10, xp: 1000,  req: 61, ms: 4000 },
    { id: 'grind_rune_whetstone',    name: 'Grind Rune Whetstones',     icon: '🪨', inputs: { basalt_block: 3, rune_bar: 1 },          output: 'rune_whetstone',    outputQty: 10, xp: 1600,  req: 76, ms: 4400 },
    { id: 'grind_dawn_whetstone',    name: 'Grind Dawnsteel Whetstones',icon: '🪨', inputs: { basalt_block: 4, dawn_bar: 1 },          output: 'dawn_whetstone',    outputQty: 10, xp: 3000, req: 91, ms: 4800 },

    /* ── THE CASTLE LANE. `craft_keystone` is adopted here from Crafting with
       its id, inputs, xp and req UNCHANGED — see the item note above. */
    { id: 'cut_ashlar',    name: 'Cut Ashlar', icon: '🧱', inputs: { granite_block: 4, iron_fitting: 1 },                              output: 'ashlar',   outputQty: 1, xp: 680, req: 45, ms: 5200 },
    { id: 'craft_keystone',name: 'Set Keystone', icon: '🧱', inputs: { timber_beam: 3, iron_fitting: 3, ancient_fragment: 2, cracked_spellstone: 1 }, output: 'keystone', outputQty: 1, xp: 900, req: 60, ms: 6500 },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   FLAVOUR LIVES IN library2-items.js — `STONECRAFT_DESC` IS RETIRED (b432).

   It was 24 hand-written lines with NO IMPORTER. `src/data/item-descriptions.js`
   composes ITEM_DESC from WAVE3_DESC + SLOT_DESC + LIB2_DESC and never from
   this file, and LIB2_DESC happened to carry a line for all 24 of the same ids
   — so every word here was shadowed from the day it was written, and a
   designer editing it (as this desk did, first pass) changes nothing a player
   can read. Verified by measurement rather than by reading the imports:
   `itemDesc('air_rune')` in the live page returned the LIB2_DESC line.

   Same class of defect as the duplicate `rune_of_*` items this change retires,
   and it is left as a comment rather than silently deleted because the next
   person to want Stonemason flavour will look HERE first. The live copy — and
   the mechanic-first rewrite of the seven staff runes — is in LIB2_DESC.
   ══════════════════════════════════════════════════════════════════════════ */
