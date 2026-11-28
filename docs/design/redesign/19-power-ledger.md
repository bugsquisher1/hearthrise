# 19. The power ledger: every source of hero power, in steps

2026-11-22, `lane/roads-v3`, game designer. Tyler: "make sure we adjust the rest of the game to make this fit well otherwise this is all for nothing", and "It seems like the buffs are way too strong too early". This file is the one table every source of hero power has to fit in, the early ramp, the changes other systems need, and the Lab runs that prove it. It builds on `04-math-strategy.md` sections 1, 10 and 12, `12-targets.md` (C-2, C-4 to C-7), `17-talent-tree.md` v3 and the built data (`src/data/danger.js`, `gear-steps.js`, `traits.js`, `wage.js`, `store-kit.js`, `monster-roles.js`, `abilities.js`).

**Tags.** MEASURED (real engine, with its run), COMPUTED (arithmetic on named inputs), CODE (read from `src/`), JUDGMENT (a design call, still to be tested).

**Units.** One step is one Level of rating: 0.35% power (`DANGER.powerStep`), about 0.7% pace held (`PAY.payStepXp`). One gear tier is 20 steps (`GEAR_STEPS.tierSteps`). One depth on Muster Barrows is about 11.5 steps (band 480 to 710 over 20 depths, `DANGER_GROUNDS`). 14 steps is 10% pace, 7 steps 5%. (MEASURED, lane/designer-sig-metric 2026-11-27: a HELD step buys about 0.43% Level XP an hour on the reference cells, not 0.7%, since the deeper monster is also 0.35% tougher and dies a little slower. The pace columns below are a kill's pay. Signatures are sized on the measured pace, `15` "Decision: the scale a Signature is sized on".)

---

## 1. The ledger

Sizes are the most a source gives on the cell that suits it best, at full size (Level 200 and up). Section 2 says how each one ramps in.

| # | Source | Kind | Full budget (steps) | Slice and cap | Ramp (section 2) | Status |
|---|---|---|---|---|---|---|
| 1 | **Level** | Always on | 1 a Level | The rating itself | None | Built (CODE, `danger.js` reference company) |
| 2 | **Talent ranks** (rank stones, open roads) | Always on once spent | A third of each Level's step, inside the Level, not on top. An unspent point is −1/3 | Inside the Level | None | Doc (02 1b, 17 v3) |
| 3 | **Gear base** | Always on | Item Level × slot weight. Tier = 20. Above the ground's base at 1000 permille, below at 500 (one-sided) | The rating. Edge over Level is `wearAhead` | None: `wearAhead` stays 10 at every Level (Tyler 2026-11-22) | Built: `POWER.weightGearPm` 1000, `weightGearBelowPm` 500, `tierSteps` 20, `wearAhead` 10 |
| 4 | **Temper** | Always on | 5 on a whole kit (ranks 1 to 5, each rank +1 item Level on the slot, slot-weighted) | Own cap 5, whole at every Level | Rank r opens at Level 40r (`21` D-2). Temper stays with the slot, never the piece | Built on steps (`src/data/temper.js`, `src/core/temper-steps.js`, the gear part), the old rungs retired (`21` section 7, lane/tp-im-steps). The kit is a K1 kit trade, one a band |
| 5 | **Traits** | Conditional | Rank 4 / 7 / 10 | **Gear slice: 20** (`conditionalStepsMax`), shared with the Signature, at every Level | None on what is worn. Max rank by the ground's entry Level (what drops) | Built as hidden data (`traits.js`, `gear-steps.js` `maxRankAt`) |
| 6 | **Signature** | Conditional or rule | **10** (half a tier, was "one tier") | Inside the gear slice | None. By measured size (`15` "Decision: how a Signature stays inside the gear slice"): the cap clamps steps, and a Signature is a mechanic | Doc (15) |
| 7 | **Crossroads, waystones, final form, Mileposts** | Conditional or rule | Best and worst option at most 3 apart on any ground | **Build slice: 14** | Numbers × ramp. Cap × ramp | Doc (17 v3) |
| 8 | **Vows** (3 slots: 30, 50, 200) | Trade | +18 on its condition, −8 always. Net +10 best, −8 worst, about 0 on the mix | Inside the build slice. Gains minus costs clamped at 14. Costs never clamped | Numbers × ramp | Doc (17 v3) |
| 9 | **Borrowed moves** (2) | A move on an idle lane | Priced to its value band: never over a vow. Protective Ward (18.4) and Turning Cut (11) sit in the 10 to 20 band (`18` section 7, every V0 on the engine's own borrow). Greater Mend (40.3) sits in the fourth band, 20 to 50 at −80% at a border, never at Havora (the decision below) | Inside the build slice (Lab-held) | Opens at `max(20, 200 × V ÷ 14)` Levels. Ward at 140, Greater Mend at 120 | MEASURED (18-measured, `23`), rule doc |
| 10 | **Imbuements, draught, camp pot** | Conditional, timed | Imbuement 2 each (3 a hero), draught 3, camp pot 2 (once a party) | **Consumable slice: 6**. Three imbuements fill it, so a draught or a camp pot is chosen in place of an imbuement, never on top (`21` D-1) | Whole at every Level, numbers and cap (`21` D-16: goods bought with a band, gated by the band) | Cap built (`src/data/power-ledger.js`). Imbuement rows, the worn set and the room rule built (`21` D-11, lane/tp-im-steps); the bench, the apply and the leech and conversion rules owed |
| 11 | **Inner Flame** | Luck | 0 steps. Moves how often a Rare drops and its rank | Under `kitSpreadMax` (20) | None | Doc (02 2b) |
| 12 | **Risk stance** | Where the edge sits | 0 steps. Changes the fall-back and climb lines. The hero holding the Challenge reads a lower line, `HOLDER.linePm` 700 (Steady 17.5%, Careful 31.5%; `29` sections 3.4, 3.9 and 6: 800 while the Ford played rows, 700 once every ground plays the formula) | Pay: Careful 0.55 to 0.70 of Steady (C-5). Bold beats Steady watched, loses over a day (C-4) | None | Built (`RISKS`, `HOLDER`), MEASURED (`29` section 3.9) |
| 13 | **Monster roles** | The ground's question | 0 steps. Decide which conditions hold, so which builds fit | Every condition keys to a role or state that exists | None | Built (`monster-roles.js`). Caster and Warder have no body yet, so every "casting" or "winding up" node, vow and Trait is dead on Muster Barrows and Hask's Ford until C2 (`23` section 5) |
| 14 | **Party size** | The cell | 0 steps a hero. Party-scope rows (party Traits, auras, Winter Guard) count once a party, in the wearer's slice | C-6: 1.2 to 1.6 a head in a four. C-7: solo 0.5 to 0.8 of a four's head | None | Owed (V6) |
| 15 | **Premium, bought hours, Blessings** | Days, death cost | 0 steps | Read in days, never steps (04 section 12) | None | Doc |
| 16 | **Clan buffs, event rewards** | Reserved | 0 until designed. A new source takes a slice or is refused | | | |
| 17 | **Factions** | Looks and social | 0 steps. A side gives no stat, step or rule. `validateFactions` refuses a row that names one | No slice | None | Doc (`25-factions.md`) |

**How they add up (COMPUTED).**

| Reading | Sum | In depths | In pace | Target | Verdict |
|---|---|---|---|---|---|
| **Choice ceiling:** best saved build per ground against the suggested path, same Level and kit | Build slice: 14 | 1.2 | +10% | 5 to 10% (1b, 17 v3 section 9) | **Fits by construction** for step rows (engine clamp). Rules and borrows held by the Lab (V5, V6) |
| **Luck ceiling:** lucky kit against unlucky, same Level and hours | Gear slice: 20 | 1.7 | +15% | `kitSpreadMax` one tier (04 section 10) | **Fits.** It didn't before: Signature at one tier on top of a Trait cap of one tier made 40 |
| **Gold ceiling:** what gold buys over a plain hero | Temper 5 + consumables 6 + Traits bought on the market (inside 20) | up to 2.7 | up to +22% | Under two tiers | Fits. Never a step from Premium or Crowns directly |
| **Everything at once, best case:** a fully decked hero against a plain one, same Level | wearAhead 10 + Temper 5 + gear 20 + build 14 + consumables 6 = **55** | 4.8 | +47% | Under three tiers | Fits. On a real ground conditions hold about half the time: about 35 steps, 3 depths, +28% |
| **C-2:** one gear tier moves the hold 1 to 3 depths | Tier = 20 steps. MEASURED +20.8 ± 3.6 held steps a tier ahead (r9) | 1.8 ahead, about 0.9 back (one-sided 500) | | 1 to 3 depths | **Fits.** No other source is as big as a tier on average, so a tier still reads |
| **The next tier always wins** | Tier-up with no luck (20) against tier-down with full luck (20 conditional) | | | Tier-up wins on average | **Fits.** Tie on the best cell only. Build, Temper and consumables are open to both |

**Bottom line: it adds up,** with four conditions. (1) Signatures shrink to half a tier and share the gear slice with Traits. (2) A build slice of 14 on the net of all talent steps, so vows can be big without stacking past the ceiling. (3) Borrowed Greater Mend lands at 10 steps or less under the heal rule. It was 39 at −30% and is the one open risk: until V4 passes, Greater Mend isn't borrowable. V4 runs after Greater Mend's re-size (`healPm` 2540, `23` section 6), since the native move is 207 held steps today. (MEASURED 2026-11-27, lane/e5-borrowing, the re-size not adopted: under the heal rule the hammer beside a healer reads 7.5, so V4 passes, but a sword in a four with no healer reads 40.3 and 18 at −50%, past the last band: 18 section 7c. RULED the same day, lane/designer-greater-mend: a fourth band lends it at −80% at a border, +6.0 held without a healer, the decision below.) (4) What a hero grows into (talents, vows, borrows) ramps in to full at Level 200. What a hero finds (gear, Traits, Signatures), Temper's steps and what it buys with a band (imbuements and the consumable slice, `21` D-16) never do (section 2).

## 2. The early ramp

**The rule (one formula):** `ramp(L) = min(1, L / 200)`, at the hero's Level. It applies ONLY to what a hero grows into: talent ranks, crossroads, vows and borrowed moves. Never to gear, Traits or Signatures. Tyler, 2026-11-22: "Gear scaling with level seems wrong right? I don't want to punish people who are theory crafting or getting lucky with drops." Used three ways, never per node:

1. **Scale what you grow into.** Every number on a talent node and vow is that number × ramp. Rows are written at full size and the engine's clamp applies the ramp once (`src/core/power-ledger.js`). The card shows the hero's own number. Rules (who it hits, what it unlocks, what it stops) are whole from the start. The build cap is × ramp too. The consumable slice is whole at every Level: its goods carry a band, and the band gates them (`21` D-16, 2026-11-27). Temper is not scaled: rank r opens at Level 40r and each rank is a whole +1 item Level on its slot (`21` D-2).
2. **Gate what drops, never what is worn.** A ground's Trait pool rolls a rank only if its steps ≤ 20 × ramp(the ground's entry Level). Rank 1 (4 steps) from entry 40, rank 2 (7) from 70, rank 3 (10) from 100, so Muster Barrows (entry 55) rolls rank 1 only. That is where luck comes from, not a penalty. The gear slice cap is 20 at every Level, so a found or bought Trait counts whole on any hero.
3. **Gate what you borrow.** A borrow opens at the Level where its value fits the build slice: `max(20, 200 × V ÷ 14)`, rounded up to a 10.

No base rule: `wearAhead` stays 10 at every Level. The earlier min(10, floor(L / 6)) is dropped (Tyler, above).

**Why 200:** Level 200 is the big one. It becomes the Level your whole build is at full size, with the third vow and the final form. Lever band 120 to 200 (V8).

**A hero at Level 10, 30, 60 and 200** (COMPUTED, best case on its cell: everything it could hold at that Level):

| Source | Level 10 | Level 30 | Level 60 | Level 200 |
|---|---|---|---|---|
| ramp | 0.05 | 0.15 | 0.30 | 1 |
| Level | 10 | 30 | 60 | 200 |
| Gear base over Level (`wearAhead`) | up to 10 | up to 10 | 10 | 10 |
| Talent ranks | 0 (on the curve) | 0 | 0 | 0 |
| Crossroads, waystones | 0.7 | inside 2.1 | inside 4.2 | inside 14 |
| Vows | 0 (slot at 30) | 1.5 (one vow) | 3 to 4.2 (two vows) | 14 with the rest |
| Borrowed moves | 0 (none open) | inside 2.1 (Challenge, Hunter's Mark) | inside 4.2 (Frost Lance opens at 60) | inside 14 |
| **Build slice total** | **0.7** | **2.1** | **4.2** | **14** |
| Traits | 0 (no pool before Muster, entry 55) | 0 | 4 to 12 found on Muster (rank 1 only); more if bought from a deeper ground (cap 20) | 20 with the Signature |
| Signature | 0 | 0 | inside 20 | inside 20 |
| Temper | 0 (rank 1 opens at 40) | 0 | 1 | 5 |
| Consumables | 0.3 | 0.9 | 1.8 | 6 |
| **Level and gear** | **10 to 20 (91 to 95%)** | **30 to 40 (91 to 93%)** | **70 (79 to 86%)** | **210 (82%)** |
| **Talents, vows, Traits, Signatures, borrows, Temper, consumables** | **1.0 (5 to 9%)** | **3.0 (7 to 9%)** | **11 to 19 (14 to 21%)** | **45 (18%)** |

(COMPUTED again 2026-11-22 after Tyler's ruling: no ramp on gear, Traits, Signatures or Temper, Temper rank r at Level 40r. A lucky or market-bought Trait can push the Level 60 column past 19, by design: the cap is 20 at every Level.)

**What feels right (JUDGMENT):**

- **First week** (Levels 1 to about 28, about 70 hunted hours): Level and gear are 85% or more of a hero. The build is rules: Long Hold keeps a taunt longer, Split Mending heals two. Met: 90%.
- **About a month** (Level 60, the first Traits): the build and the kit start to show, 15 to 20%. Met.
- **Level 200 and past:** the build is worth about a tier, about 20%. Met, and it falls slowly after (10% at Level 400) as Levels keep coming.

**Way too strong too early, by these numbers, before the ramp** (v3 sizes at full, no ramp):

| Flag | Level | Steps | Share of the hero | Fixed by |
|---|---|---|---|---|
| `wearAhead` 10 on early tiers | 10 | +10 | Doubles the Level's power | Kept on purpose (Tyler 2026-11-22: gear is never scaled by Level). Early drops come from grounds whose base sits near the Level |
| 16's crossroads percents at face value (Hard Challenge −15% damage taken is about 46 defense steps by the Trait convention) | 5 to 9 | up to ~46 | 4× the Level | Numbers × ramp. Options within 3 steps |
| A full vow | 30 | +10 net | A third of the Level | × ramp: 1.5 at 30 |
| Borrowed Greater Mend at −30% | 17 to 30 | +39 MEASURED | More than the Level | Heal rule, the fourth band (−80% at a border, +6.0 MEASURED), opens at 120 |
| Consumables at full | 10 | +6 | 60% of the Level | None worn: every imbuement's band is 45 or more, worn from 35 (`21` D-16). A draught or camp pot carries a band the same way when built |
| Signature on top of the Trait cap (15 as written) | 60 | +40 | About 40% | Inside the gear slice (20 with the Traits) |
| Without the ramp, all of it | 10 / 30 / 60 | ~17 / ~25 (64 with the borrowed heal) / ~65 | 37% / 38% (59%) / 48% of total | The ramp |

## 3. The pieces that interact

| Interaction | What happens | Rule |
|---|---|---|
| Vows and the Trait cap | Separate slices. A vow never pushes a Trait out | Build slice 14, gear slice 20 |
| Vows and saved builds per ground (R3) | A vow worn only where it fits would be a free +10 | Every vow's cost always bites. The ceiling reads the best saved build per ground |
| Vows and Risk | Low-health effects never fired under Steady and Careful | Keyed to "near fall-back": 15 points over the stance's line (Careful 60%, Steady 40%, Bold 27%). For the hero holding the Challenge, 15 over its holder line (Steady 30%, Careful 42%) |
| The Challenge and the fall back | The fall back reads the lowest HP any hero reached, so a tank that pulls every blow made the four 63 steps shallower (MEASURED, `23` section 3) | Suggested condition "my HP is at least 60%" now (+39 held). The holder line next. Every Shield node, Signature #1 and #3 and the Hearth Guard vow re-measured after |
| Vows and monster roles | A cost keyed to a role is free on grounds without it. A max-health cut breaks the Stalker rule (one back-row blow under the Steady line) | Costs are always on and never cut max health. Gains key to roles from `monster-roles.js` |
| Borrowing and lanes | A borrow sits on an idle lane, so its cost is mana, not the penalty | Value bands priced from measurement. Heals share Mend's clock |
| Borrowing and Magic training | A melee hero casting Greater Mend trained Magic at 1600 | Borrowed spells pay Magic at Mend's rate (250) |
| Borrowing and the supply bill | MEASURED +173 to +459 gold a hero-hour, about 120 more drinks an hour | Re-measured under the heal rule (V4). Store references re-measured with library builds (lane L9) |
| Vow mana costs and the store | Still Mind, Spellbow, Braced raise mana use | Sized inside the vow's −8. The store's `refRestore` re-measured with vows worn (lane L9) |
| Signatures and the suggested path | A Signature-aligned build beats a suggested path that ignores it | The suggested path reads the worn Signature (17 v3 section 2) |
| Party-scope rows | Four copies of a party Trait or aura | Count once a party, in the wearer's slice |
| Gold an hour and depth | MEASURED: +50 held steps moved gold by −4 ± 64. Builds that buy depth don't pay coin | Investigation lane L10. The build preview shows XP and depth, and gold only from 8 h cells |
| Cooldown cuts and full lanes | Sword and club offense lanes run 83% full, ranged and wand 78%, the heal lane up to 77% | No cut on a lane over 75%, except moves of 30 s or more (17 v3 section 9) |
| Report readers | Two builds both read "Depth 14" | Healing by source, damage taken by seat, supplies by depth (lane L7) |

## 4. Docs fixed in this lane

| File | Change |
|---|---|
| `17-talent-tree.md` | v3, all of the above |
| `15-signature-candidates.md` | Size: half a tier (10 steps), inside the gear slice with Traits. Ramp note |
| `14-trait-candidates.md` | The cap is shared with the Signature and ramps in. Max rank by the ground's entry Level |
| `16-talent-branches.md` | v3 note: crossroads after rank stone 3 and 5, numbers ramp, Quick Strike becomes Cheap Strike, Answering held |
| `12-targets.md` | C-13, the early ramp target. Rank by depth capped by the ground's max rank (3.3) |
| `04-math-strategy.md` | Section 12's step ledger points here with the slices |
| `02-architecture.md` | 1b: the ceiling is read per ground against the best saved build. Points to 17 v3 and here |

## 5. Data and engine changes, as lanes

None of these touch the live game until wave 3 or 4 ships its system. The order is the roadmap's: engine pieces first, then the sample.

| Lane | Kind | Exact scope | Owner | Needs |
|---|---|---|---|---|
| **L1 Ramp and slices** | Data + engine (core) | BUILT (lane/ledger-l1-l3). `src/data/power-ledger.js`: `rampLevel` 200, `buildStepsMax` 14, `consumableStepsMax` 6, `temperStepsMax` 5, `clanStepsMax` 4 (closed: 0 until clans ship, `20`), and `LEDGER_SLICES` with `ramps` true only for build (consumable whole since `21` D-16) (`conditionalStepsMax` 20 stays in `gear-steps.js`). `ramp(level)` in the data module, `sliceCap` and `clampLedger` in `src/core/power-ledger.js`: rows written at full size, ramping slices × ramp, signed net for build, gains only for the others, one key counts its largest, an ally's party row counted once in the wearer's slice. The power step (`src/core/hunt/danger.js powerPm`) reads it. Test: `tests/hunt-core/danger.mjs` case `ledger` | Systems | Lands dark: no source writes a row yet |
| **L2 Wear ahead** | DROPPED | Tyler 2026-11-22: "Gear scaling with level seems wrong right? I don't want to punish people who are theory crafting or getting lucky with drops." `wearAhead` stays 10 at every Level | | |
| **L3 Trait rank by ground** | Data | BUILT (lane/ledger-l1-l3). `gear-steps.js` `maxRankAt(entryLevel)` (whole-number form of the ramp gate). `DANGER_GROUNDS` rows carry `entryLevel` (held equal to the hunt's band floor) and `maxRank`. Muster Barrows rolls rank 1 only. Carry-over as data: `GEAR_STEPS.carryOver` same slot, tier the same or higher. `tests/gear-steps.mjs` GS-3 and GS-5 | Systems | L1 |
| **L4 Near fall-back** | Data + engine | `danger.js` `RISKS` gains `nearFallPm` 150 (one lever, all stances). `condition-metrics.js` adds `hp_near_fall` (self and ally). Engine reads the hunt's stance. Test on all three stances | Systems | Nothing |
| **L4b Holder line** | Data + engine | `danger.js` `RISKS` gains `holderLinePm` 600: the hero holding a Challenge falls back at `fallPm × 0.6` and climbs at `cleanPm × 0.6`, read in `breaksOff` and the clean check. `hp_near_fall` reads it for that hero. The Challenge row's suggested `trigger` "my HP is at least 60%" lands first. Test: Steady still has no deaths (V1 on the tank's four) | Systems | Nothing |
| **L5 Bar metrics** | Data + engine | `condition-metrics.js`: `target_hp_pct`, `target_marked`, `target_bleed_stacks`, `last_cast`. Engine in `src/core/hunt/conditions.js` | Systems | Nothing |
| **L6 Borrowing** | Engine + server | BUILT (lane/e5-borrowing, 2026-11-27, STAGED). `hunt-spawn.js heroSetup` plays one borrow list: the moves the server's build lends at its Level (`hr_talents_view` nodes through `grantsOf`, at most `maxBorrowed` 2, the wraps too: 17's Hearth) and, for the Lab and tests only, a borrow handed whole with its price. Every lent row (`talent-rows.js` lend, `src/data/talents.js BORROW_RULES`) reads the native weapon's reference blow; a borrowed heal shares Mend's clock (it stands in for a Mend: `replaces`, the mechanism `clock: 'mend'` would have duplicated); a borrowed spell pays Magic at Mend's rate (250); an ally heal or ward reaches its native role's 7 tiles (target rule and the slot's "lowest ally"); no native unlock (the opening Level is the gate); a lent Challenge taunts from any seat (a non-tank takes only the overflow), its hold at its price. The server's catalogue already checks the opening Level (1064's `opens_at`). Not built: a borrowed shot's own arrows. **The reading (18 section 7c):** V4's cell (the hammer beside a healer) **7.5 ± 3.2, passes**; 17's V0 cell (a sword in a four with no healer) **40.3 ± 2.6, past the last band**, RULED (the decision below): the fourth band lends it at −80% at a border, +6.0 ± 1.6 on that cell, opening at 120, never at Havora. Circle of Renewal on Mend's clock 2.0 (was 7.1) | Systems, Backend | V4 (passed on both cells) |
| **L7 Report readers** | Engine | `src/core/hunt/tally.js` and `report.js`: healing by ability and source (own, borrowed, ally), damage taken by seat (front, back), store bill bucketed by held depth. Counters in the session row, no statement per kill | Systems | Nothing |
| **L8 Talent catalogue** | Data, then server | `src/data/talents.js` (the path `the-path.js` already names): node rows in steps with stacking keys, the 9 border rows, vow rows (gain, cost, key, best/weak roles), Mileposts, the free reset per release. The sample first: the Hearth, Shield, Restoration, Shield · Restoration. Server: spend, vow (never by the standing rule), reset, free release reset | Designer, Backend | L1, L4, L5 |
| **L9 Store references** | Data | `store-kit.js` `refRestore` and `refCharges` re-measured on the library's suggested builds with vows and borrows worn. `wage.js` unchanged. Check: the store kit stays 0.2 to 0.3 of pay | Designer | L8 sample, V9 |
| **L10 Gold and depth** | Engine (investigation) | Why +50 held steps moved gold −4 ± 64 when coin a kill is × 1.004 a step (`danger.js` PAY, `wage.js` `payStepCoin`). Read kills an hour and loot at the store's price per depth | Systems | Nothing |
| **L11 Temper on steps** | Data | `temper.js` rebuilt on gear steps: ranks 1 to 5, rank r opens at Level 40r (`21` D-2), each rank +1 item Level on its slot × slot weight, never × ramp, Temper stays with the slot, priced by `temperHours` (09). Replaces the 1% rungs on scale grounds | Designer | L1. Wave 4 |
| **L12 Roles content** | Data | A Caster and a Warder body (12-targets row 2), and two more scale grounds (R10), so the library test has three role mixes | Designer | Already planned |
| **L13 The support** | Data + engine | `22-fists-support.md` section 6: the `support` role and `wraps` key, the start set (7 moves), Armor Break, Silenced and the `caster` target, `selfHealPm` retired, `fists` renamed `wraps`. Party-scope nodes count at their party sum in the wearer's slice | Designer, Systems | E2, E3 |
| **L14 The moves pass** | Data + engine | From `23` section 9: Shelter's condition, Greater Mend 2540 and Circle 2080 (Lab first), Undertow cut into the alone rule (`aloneHitPm` 2000 on Green Sickness and the wraps' strikes), Mark and Precision Shot targets (`marked`, `back_threat`), Updraft's row removed. Wave 3: blow wind-ups, `winding_up`, Stagger (ends a wind-up), Parry, Gash. Sizes: Parry's and Gash's nodes on the build slice like any move | Designer, Systems | L4b first |

## 6. Validation: Lab runs that prove the budget

Every run: Muster Barrows unless named, held start, 8 seeds, Steady unless named. Report held depth, deaths, XP an hour, gold an hour and the supply bill, never one score. A cell is about 5 to 9 CPU-minutes (MEASURED). "Runs today" means the tool exists. "Owed" names what has to be added first.

| # | What it proves | Pass | Command | Today |
|---|---|---|---|---|
| V1 | C-2: one tier ahead and back | 1 to 3 depths each way | `node tools/balance-program/redesign/v1-climb.mjs --candidate power-tier-ahead --risks steady --seeds 8 --hours 12` and the same with `--candidate power-tier-back` | Runs today |
| V2 | Borrow values at full power (V0) for every borrowable move | Each move placed in its band | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q3 --seeds 8 --hours 8 --workers 6 --json q3.json` | Runs today for 5 moves. Owed: a plan `q4` with every borrowable move |
| V3 | The value bands | Each borrow at its band lands at or under its cap (4, 7, 10) | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q3f --seeds 8 --hours 8` | Runs today for Fireball. Owed: one row per band |
| V4 | The heal rule | Borrowed Greater Mend on the hammer at 10 steps or less | `bash tools/balance-program/redesign/roads/e5/run.sh` then `node tools/balance-program/redesign/roads/e5/sum.mjs` (the engine's own heal rule, 12 seeds x 8 h) | **PASSED 2026-11-27** on its cell, 7.5 ± 3.2 (lane/e5-borrowing). 17's V0 cell (no healer) reads 40.3 at full power and **6.0 ± 1.6 at the fourth band's −80%** (lane/designer-greater-mend), so it passes there too: 18 section 7c |
| V5 | Each vow on its best and worst cell | Net +8 to +12 best, −6 to −10 worst | `node tools/balance-program/redesign/roads/vow-run.mjs --vow <id> --cells best,worst --seeds 8 --hours 12` | Owed: L1, L8, a `vow-run.mjs` |
| V6 | The choice ceiling and the library | Best saved build per ground within 7 to 14 steps of suggested. Every build top 3 somewhere, top in no more than 25% of cells | `node tools/balance-program/redesign/roads/library.mjs --grounds <three scale grounds> --plans suggested,best --parties 1,4 --risks careful,steady,bold --seeds 8 --hours 12` | Owed: L8, L12 and the reader (04 section 14) |
| V7 | Near fall-back nodes fire on every stance | Each fires on the dummy analyzer on all three stances, 0 Steady deaths | `node tools/balance-program/redesign/v1-climb.mjs --candidate near-fall --risks careful,steady,bold --seeds 8 --hours 12` | Owed: L4 and the `near-fall` candidate |
| V8 | The early ramp | Section 2's shares within ±5 points at Levels 30 and 60 | `node tools/balance-program/redesign/v1-climb.mjs --ground <scale ground> --level 30 --candidate ramp-on --seeds 8 --hours 12`, then `--candidate ramp-off` | Owed: a scale ground under Level 55 (R10) and L1. Level 60 runs on Muster once L1 lands |
| V9 | The supply bill with vows and borrows | Store kit 0.2 to 0.3 of pay with the library's suggested builds | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q1 --seeds 8 --hours 8` (store column), then the library builds | Runs today for borrows. Owed: vows (L8) |
| V10 | The luck ceiling with the Signature inside the gear slice | Lucky against unlucky kit at most 20 steps at the 10th and 90th percentile | `node tools/balance-program/redesign/kit-sampler.mjs --levels 60,120,200 --hours 40,200,1000` | Owed: the kit sampler (04 section 10) |
| V11 | Party size with builds worn | C-6 1.2 to 1.6 a head in a four, C-7 solo 0.5 to 0.8 | V6 with `--parties 1,4` | Owed with V6 |
| V12 | The support against a fourth damage dealer | `22-fists-support.md` 4.1: within 14 steps on every cell, ahead by 7+ on 25%+ of cells and behind by 7+ on 25%+, ahead on at most 50% | V6 with `--builds support` (22 run F7) | Owed: L13, the `support` style, V6 |
| V13 | Gold follows depth | Gold a hero-hour rises with held depth at about `payStepCoin` a step | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q1 --seeds 8 --hours 8` (gold against held) | Runs today. Feeds L10 |
| V14 | The move table after the moves pass | No live move worth less than nothing on its played bar. The Challenge positive on the tank's four | `node tools/balance-program/redesign/spells/spell-run.mjs --plan M`, then `--plan T` and `--plan S` | Runs today (`23`). Re-run after L4b, the Greater Mend re-size and Shelter's condition |

**Order:** V1, V2 and V13 now. V1 again on the tank's four after L4b. V14 after L4b. V4 after the Greater Mend re-size, before L6. V5, V7, V9 with the sample (L8). V6, V8, V10, V11 once R10 opens more scale grounds.

## Decision: the borrowed heal in a four with no healer (2026-11-27)

Game designer, `lane/designer-greater-mend`, on CONFLICTS 2026-11-27 (E5). RULED.

**How it plays.** A Shield hero at the Shield · Restoration town, or a Destruction hero at the Destruction · Restoration town, can take Greater Mend at a fifth of its power. It opens at Level 120 and Havora never lends it. It shares Mend's 6 s clock, so each cast is a small heal on the most hurt ally within 7 tiles in place of a Mend on yourself. A four with no healer falls back less often and holds about half a depth deeper, and pays about 14% more for supplies. Its Level XP doesn't move. Beside a real healer it costs depth, since the borrower gives up its own Mends for small heals, so it's a pick only for a four without one. It's the drop hunter's pick, not a stand-in for a healer.

**The rule (one data row, `src/data/talents.js BORROW_BANDS`).** A fourth value band: V0 20 to 50 lends at −80% at a border town and is not offered at Havora. Each band's top lands at or under its cap after its price: 4, 7, 10, and now 10. Greater Mend's V0 stays 40.3, so its value after the price is 8.06 and it opens at `max(20, 200 × 8.06 ÷ 14)`, rounded up to 120. A move measured past 50 is still never offered (the refusal `not_offered` stays, proven by a planted value). With it, every town now lends a move to both of its countries: the last two dead sides (Shield at its Restoration town, Destruction at its Restoration town) were Greater Mend.

**Measured** (`tools/balance-program/redesign/roads/e5/run.sh` + `sum.mjs`, Muster Barrows Level 60 Steady, MID kits, 12 seeds × 8 h, paired, held from hour 4):

| Greater Mend borrowed | Held delta (se) | Pace steps (se) | Value | Casts / h | Level XP / h | Store / hero-h |
|---|---|---|---|---|---|---|
| The sword, no healer, full power (17's V0 cell) | +40.3 (2.6) | +29.0 (2.6) | 40.3 | 464 | +3.3% | +17.5% |
| The same at −50% | +18.0 (1.9) | +7.6 (2.7) | 18.0 | 458 | +0.3% | +16.1% |
| The same at −75% | +7.0 (2.4) | +0.4 (1.8) | 7.0 | 450 | −0.3% | +13.6% |
| **The same at −80%, the fourth band** | **+6.0 (1.6)** | **−1.4 (1.1)** | **6.0** | 448 | −0.6% | +13.9% (kit share 0.24) |
| The hammer beside a healer at −80% (V4's cell) | −9.3 (2.0) | −8.5 (1.9) | 0 | 335 | −2.1% | +3.6% |

**Why this lever and not the others.**
- **Keep the fallback (no borrowed heal):** leaves two town picks on the map that buy nothing and leaves a four with no healer one sustain borrow worth 2 steps (Circle of Renewal). A dead pick is a design bug.
- **A power cut (chosen):** the engine already plays a border price on what a heal lands, and under the heal rule the value follows power (40.3, 31.5, 18.0, 7.0, 6.0). One row, no engine code, in band at 6.0 against the cap of 10. −80% rather than −75% so the band's own top (50) lands at the cap, as the other three do.
- **A cooldown share:** already the heal rule (one 6 s clock with Mend). It cut the casts from 1,421 to about 450 an hour. A longer clock of its own is engine code and buys nothing the price doesn't.
- **A no-healer-party rule:** a borrow whose power reads who else is in the four is a rule the card can't show, and it would weaken the borrow exactly where it is wanted. Refused.
- **The heal on the borrower's own Magic (CONFLICTS call c):** engine code that moves every borrowed spell, and 17's rule "a club is never the best healer" already reads the native weapon's blow. Not for v0.3.0.
- **Sizing on the four beside a healer (call d):** refused. The four with no healer is the hybrid the build slice has to hold.

**Known limits.** Measured at Level 60, where the borrow is not yet open (every V0 uses this cell; the build sample, V8, reads it at 120 and up). The opening Level reads the linear value (8.06) and the measured one is 6.0, so it opens a little late, in band. The Talents card shows the opening Level but not the price (DISCOVERIES 2026-11-27, Art Director and Systems client).

## Changes from the spell audit

2026-11-22, from `23-spell-audit.md` section 8, and Tyler's ruling the same day (the tank falls back at 15% on Steady).

- Row 9: Hoarfrost and Protective Ward placed in the 10 to 20 borrow band, opening at 120.
- Row 12: the holder line, `holderLinePm` 600 (Steady 15%, Careful 27%).
- Row 13: every "casting" and "winding up" condition is dead on Muster Barrows and Hask's Ford until C2.
- Bottom line (3): V4 runs after Greater Mend's re-size.
- Section 3: near fall-back for the Challenge holder, and a new row on the Challenge and the fall back.
- L4b: the holder line and the Challenge's condition, new.
- L13: the support's 7 moves, Silenced in place of the interrupt (the interrupt is now Stagger's).
- L14: the moves pass, new.
- V14: re-run the move table, new. Order updated.
- Section 2: the first-week example names Long Hold, not Wide Challenge.
