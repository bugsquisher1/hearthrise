# 19. The power ledger: every source of hero power, in steps

2026-11-22, `lane/roads-v3`, game designer. Tyler: "make sure we adjust the rest of the game to make this fit well otherwise this is all for nothing", and "It seems like the buffs are way too strong too early". This file is the one table every source of hero power has to fit in, the early ramp, the changes other systems need, and the Lab runs that prove it. It builds on `04-math-strategy.md` sections 1, 10 and 12, `12-targets.md` (C-2, C-4 to C-7), `17-talent-tree.md` v3 and the built data (`src/data/danger.js`, `gear-steps.js`, `traits.js`, `wage.js`, `store-kit.js`, `monster-roles.js`, `abilities.js`).

**Tags.** MEASURED (real engine, with its run), COMPUTED (arithmetic on named inputs), CODE (read from `src/`), JUDGMENT (a design call, still to be tested).

**Units.** One step is one Level of rating: 0.35% power (`DANGER.powerStep`), about 0.7% pace held (`PAY.payStepXp`). One gear tier is 20 steps (`GEAR_STEPS.tierSteps`). One depth on Muster Barrows is about 11.5 steps (band 480 to 710 over 20 depths, `DANGER_GROUNDS`). 14 steps is 10% pace, 7 steps 5%.

---

## 1. The ledger

Sizes are the most a source gives on the cell that suits it best, at full size (Level 200 and up). Section 2 says how each one ramps in.

| # | Source | Kind | Full budget (steps) | Slice and cap | Ramp (section 2) | Status |
|---|---|---|---|---|---|---|
| 1 | **Level** | Always on | 1 a Level | The rating itself | None | Built (CODE, `danger.js` reference company) |
| 2 | **Talent ranks** (rank stones, open roads) | Always on once spent | A third of each Level's step, inside the Level, not on top. An unspent point is −1/3 | Inside the Level | None | Doc (02 1b, 17 v3) |
| 3 | **Gear base** | Always on | Item Level × slot weight. Tier = 20. Above the ground's base at 1000 permille, below at 500 (one-sided) | The rating. Edge over Level is `wearAhead` | `wearAhead` = min(10, floor(L / 6)) | Built: `POWER.weightGearPm` 1000, `weightGearBelowPm` 500, `tierSteps` 20. `wearAhead` is 10 today |
| 4 | **Temper** | Always on | 5 on a whole kit (ranks 1 to 5, 1 gear step a rank, slot-weighted) | Own cap 5 | × ramp | Doc here. Today's `temper.js` is the old game's (1% a rung) |
| 5 | **Traits** | Conditional | Rank 4 / 7 / 10 | **Gear slice: 20** (`conditionalStepsMax`), shared with the Signature | Cap × max(0.5, ramp). Max rank by the ground's entry Level | Built as hidden data (`traits.js`, `gear-steps.js`) |
| 6 | **Signature** | Conditional or rule | **10** (half a tier, was "one tier") | Inside the gear slice | Through the gear slice cap | Doc (15) |
| 7 | **Crossroads, waystones, final form, Mileposts** | Conditional or rule | Best and worst option at most 3 apart on any ground | **Build slice: 14** | Numbers × ramp. Cap × ramp | Doc (17 v3) |
| 8 | **Vows** (3 slots: 30, 50, 200) | Trade | +18 on its condition, −8 always. Net +10 best, −8 worst, about 0 on the mix | Inside the build slice. Gains minus costs clamped at 14. Costs never clamped | Numbers × ramp | Doc (17 v3) |
| 9 | **Borrowed moves** (2, fists 3) | A move on an idle lane | Priced to its value band: never over a vow | Inside the build slice (Lab-held) | Opens at `max(20, 200 × V ÷ 14)` Levels | MEASURED (18-measured), rule doc |
| 10 | **Imbuements, draught, camp pot** | Conditional, timed | Imbuement 2 each (3 a hero), draught 3, camp pot 2 (once a party) | **Consumable slice: 6** | Numbers × ramp. Cap × ramp | Doc (09). Imbuing not built (CODE) |
| 11 | **Inner Flame** | Luck | 0 steps. Moves how often a Rare drops and its rank | Under `kitSpreadMax` (20) | None | Doc (02 2b) |
| 12 | **Risk stance** | Where the edge sits | 0 steps. Changes the fall-back and climb lines | Pay: Careful 0.55 to 0.70 of Steady (C-5). Bold beats Steady watched, loses over a day (C-4) | None | Built (`RISKS`), MEASURED |
| 13 | **Monster roles** | The ground's question | 0 steps. Decide which conditions hold, so which builds fit | Every condition keys to a role or state that exists | None | Built (`monster-roles.js`). Caster and Warder have no body yet |
| 14 | **Party size** | The cell | 0 steps a hero. Party-scope rows (party Traits, auras, Winter Guard) count once a party, in the wearer's slice | C-6: 1.2 to 1.6 a head in a four. C-7: solo 0.5 to 0.8 of a four's head | None | Owed (V6) |
| 15 | **Premium, bought hours, Blessings** | Days, death cost | 0 steps | Read in days, never steps (04 section 12) | None | Doc |
| 16 | **Clan buffs, event rewards** | Reserved | 0 until designed. A new source takes a slice or is refused | | | |

**How they add up (COMPUTED).**

| Reading | Sum | In depths | In pace | Target | Verdict |
|---|---|---|---|---|---|
| **Choice ceiling:** best saved build per ground against the suggested path, same Level and kit | Build slice: 14 | 1.2 | +10% | 5 to 10% (1b, 17 v3 section 9) | **Fits by construction** for step rows (engine clamp). Rules and borrows held by the Lab (V5, V6) |
| **Luck ceiling:** lucky kit against unlucky, same Level and hours | Gear slice: 20 | 1.7 | +15% | `kitSpreadMax` one tier (04 section 10) | **Fits.** It didn't before: Signature at one tier on top of a Trait cap of one tier made 40 |
| **Gold ceiling:** what gold buys over a plain hero | Temper 5 + consumables 6 + Traits bought on the market (inside 20) | up to 2.7 | up to +22% | Under two tiers | Fits. Never a step from Premium or Crowns directly |
| **Everything at once, best case:** a fully decked hero against a plain one, same Level | wearAhead 10 + Temper 5 + gear 20 + build 14 + consumables 6 = **55** | 4.8 | +47% | Under three tiers | Fits. On a real ground conditions hold about half the time: about 35 steps, 3 depths, +28% |
| **C-2:** one gear tier moves the hold 1 to 3 depths | Tier = 20 steps. MEASURED +20.8 ± 3.6 held steps a tier ahead (r9) | 1.8 ahead, about 0.9 back (one-sided 500) | | 1 to 3 depths | **Fits.** No other source is as big as a tier on average, so a tier still reads |
| **The next tier always wins** | Tier-up with no luck (20) against tier-down with full luck (20 conditional) | | | Tier-up wins on average | **Fits.** Tie on the best cell only. Build, Temper and consumables are open to both |

**Bottom line: it adds up,** with four conditions. (1) Signatures shrink to half a tier and share the gear slice with Traits. (2) A build slice of 14 on the net of all talent steps, so vows can be big without stacking past the ceiling. (3) Borrowed Greater Mend lands at 10 steps or less under the heal rule. It was 39 at −30% and is the one open risk: until V4 passes, Greater Mend isn't borrowable. (4) Everything optional ramps in to full at Level 200.

## 2. The early ramp

**The rule (one formula):** `ramp(L) = min(1, L / 200)`, at the hero's Level. Used three ways, never per node:

1. **Scale what you choose or buy.** Every number on a talent node, vow, Temper rank and consumable is that number × ramp. The card shows the hero's own number. Rules (who it hits, what it unlocks, what it stops) are whole from the start. The build and consumable caps are × ramp too.
2. **Gate what drops.** A ground's Trait pool rolls a rank only if its steps ≤ 20 × ramp(the ground's entry Level). Rank 1 (4 steps) from entry 40, rank 2 (7) from 70, rank 3 (10) from 100. The gear slice cap is 20 × max(0.5, ramp), so a found Trait counts whole from the start.
3. **Gate what you borrow.** A borrow opens at the Level where its value fits the build slice: `max(20, 200 × V ÷ 14)`, rounded up to a 10.

Plus one base rule: `wearAhead` = min(10, floor(L / 6)). At Muster Barrows (entry 55) it's already 9, so the scale grounds don't change.

**Why 200:** Level 200 is the big one. It becomes the Level your whole build is at full size, with the third vow and the final form. Lever band 120 to 200 (V8).

**A hero at Level 10, 30, 60 and 200** (COMPUTED, best case on its cell: everything it could hold at that Level):

| Source | Level 10 | Level 30 | Level 60 | Level 200 |
|---|---|---|---|---|
| ramp | 0.05 | 0.15 | 0.30 | 1 |
| Level | 10 | 30 | 60 | 200 |
| Gear base over Level (`wearAhead`) | 1 | 5 | 10 | 10 |
| Talent ranks | 0 (on the curve) | 0 | 0 | 0 |
| Crossroads, waystones | 0.7 | inside 2.1 | inside 4.2 | inside 14 |
| Vows | 0 (slot at 30) | 1.5 (one vow) | 3 to 4.2 (two vows) | 14 with the rest |
| Borrowed moves | 0 (none open) | inside 2.1 (Challenge, Hunter's Mark) | inside 4.2 (Frost Lance opens at 60) | inside 14 |
| **Build slice total** | **0.7** | **2.1** | **4.2** | **14** |
| Traits | 0 (no pool before Muster, entry 55) | 0 | 4 to 10 (rank 1 only, cap 10) | 20 with the Signature |
| Signature | 0 | 0 | inside 10 | inside 20 |
| Temper | 0.25 | 0.75 | 1.5 | 5 |
| Consumables | 0.3 | 0.9 | 1.8 | 6 |
| **Level and gear** | **11 (90%)** | **35 (90%)** | **70 (80 to 86%)** | **210 (82%)** |
| **Talents, vows, Traits, Signatures, borrows, Temper, consumables** | **1.25 (10%)** | **3.75 (10%)** | **11.5 to 17.5 (14 to 20%)** | **45 (18%)** |

**What feels right (JUDGMENT):**

- **First week** (Levels 1 to about 28, about 70 hunted hours): Level and gear are 85% or more of a hero. The build is rules: Wide Challenge taunts three, Split Mending heals two. Met: 90%.
- **About a month** (Level 60, the first Traits): the build and the kit start to show, 15 to 20%. Met.
- **Level 200 and past:** the build is worth about a tier, about 20%. Met, and it falls slowly after (10% at Level 400) as Levels keep coming.

**Way too strong too early, by these numbers, before the ramp** (v3 sizes at full, no ramp):

| Flag | Level | Steps | Share of the hero | Fixed by |
|---|---|---|---|---|
| `wearAhead` 10 on early tiers | 10 | +10 | Doubles the Level's power | `wearAhead` = min(10, floor(L / 6)) |
| 16's crossroads percents at face value (Hard Challenge −15% damage taken is about 46 defense steps by the Trait convention) | 5 to 9 | up to ~46 | 4× the Level | Numbers × ramp. Options within 3 steps |
| A full vow | 30 | +10 net | A third of the Level | × ramp: 1.5 at 30 |
| Borrowed Greater Mend at −30% | 17 to 30 | +39 MEASURED | More than the Level | Heal rule, value band, opens at 80 to 150 |
| Consumables at full | 10 | +6 | 60% of the Level | × ramp |
| Signature on top of the Trait cap (15 as written) | 60 | +40 | About 40% | Inside the gear slice, cap 10 at 60 |
| Without the ramp, all of it | 10 / 30 / 60 | ~17 / ~25 (64 with the borrowed heal) / ~65 | 37% / 38% (59%) / 48% of total | The ramp |

## 3. The pieces that interact

| Interaction | What happens | Rule |
|---|---|---|
| Vows and the Trait cap | Separate slices. A vow never pushes a Trait out | Build slice 14, gear slice 20 |
| Vows and saved builds per ground (R3) | A vow worn only where it fits would be a free +10 | Every vow's cost always bites. The ceiling reads the best saved build per ground |
| Vows and Risk | Low-health effects never fired under Steady and Careful | Keyed to "near fall-back": 15 points over the stance's line (Careful 60%, Steady 40%, Bold 27%) |
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
| **L1 Ramp and slices** | Data + engine (core) | New levers in one data module (`src/data/power-ledger.js`): `rampLevel` 200, `gearRampFloor` 0.5, `buildStepsMax` 14, `consumableStepsMax` 6, `temperStepsMax` 5 (`conditionalStepsMax` 20 stays in `gear-steps.js`). A pure `ramp(level)` and `sliceCap(slice, level)` in `src/core`. The engine sums conditional steps per slice (signed for build, gains only for the others) and clamps. Party-scope rows counted once. Lever rows in `tools/balance-program/levers/`. Test: a hero at Levels 10, 30, 60, 200 reads the caps of section 2 | Systems | Nothing. Lands dark until Traits or talents are read |
| **L2 Wear ahead** | Data + server | `gear-steps.js` `wearAhead` 10 becomes `wearAheadMax` 10 and `wearAheadDiv` 6. The server's wear check and `danger.js` header read min(10, floor(L / 6)). Test: Level 10 can't wear item Level 20, Level 55 wears 60 | Systems | Lane C for the server half |
| **L3 Trait rank by ground** | Data | `gear-steps.js`: `maxRankAt(entryLevel)` from ramp. `DANGER_GROUNDS` rows carry the entry Level. Muster Barrows rolls rank 1 only. Carry-over only onto a base of the same or a higher tier. `tests/gear-steps.mjs` case | Designer | L1 |
| **L4 Near fall-back** | Data + engine | `danger.js` `RISKS` gains `nearFallPm` 150 (one lever, all stances). `condition-metrics.js` adds `hp_near_fall` (self and ally). Engine reads the hunt's stance. Test on all three stances | Systems | Nothing |
| **L5 Bar metrics** | Data + engine | `condition-metrics.js`: `target_hp_pct`, `target_marked`, `target_bleed_stacks`, `last_cast`. Engine in `src/core/hunt/conditions.js` | Systems | Nothing |
| **L6 Borrowing** | Engine + server | `hunt-spawn.js` accepts off-weapon rows from the server's borrow list (max 2, 3 for fists). A borrowed row reads the native weapon's reference blow at the hero's Level. `abilities.js` row field `clock: 'mend'` for borrowed heals (one 6 s cooldown with Mend). Borrowed spells pay `magicXpMult` 250. Reach from the native row. `targeting.js` `challengeable` takes a lent Challenge from any seat. Server checks the opening Level from the value table | Systems, Backend | V4 must pass first |
| **L7 Report readers** | Engine | `src/core/hunt/tally.js` and `report.js`: healing by ability and source (own, borrowed, ally), damage taken by seat (front, back), store bill bucketed by held depth. Counters in the session row, no statement per kill | Systems | Nothing |
| **L8 Talent catalogue** | Data, then server | `src/data/talents.js` (the path `the-path.js` already names): node rows in steps with stacking keys, the 9 border rows, vow rows (gain, cost, key, best/weak roles), Mileposts, the free reset per release. The sample first: the Hearth, Shield, Restoration, Shield · Restoration. Server: spend, vow (never by the standing rule), reset, free release reset | Designer, Backend | L1, L4, L5 |
| **L9 Store references** | Data | `store-kit.js` `refRestore` and `refCharges` re-measured on the library's suggested builds with vows and borrows worn. `wage.js` unchanged. Check: the store kit stays 0.2 to 0.3 of pay | Designer | L8 sample, V9 |
| **L10 Gold and depth** | Engine (investigation) | Why +50 held steps moved gold −4 ± 64 when coin a kill is × 1.004 a step (`danger.js` PAY, `wage.js` `payStepCoin`). Read kills an hour and loot at the store's price per depth | Systems | Nothing |
| **L11 Temper on steps** | Data | `temper.js` rebuilt on gear steps: ranks 1 to 5, 1 gear step a rank × slot weight, × ramp, priced by `temperHours` (09). Replaces the 1% rungs on scale grounds | Designer | L1. Wave 4 |
| **L12 Roles content** | Data | A Caster and a Warder body (12-targets row 2), and two more scale grounds (R10), so the library test has three role mixes | Designer | Already planned |
| **L13 Fist generalist** | Data | When `FIST_LINE.live`: fist strikes' shares 10% under the other weapons', borrow bands one softer, 3 borrow slots | Designer | L6 |

## 6. Validation: Lab runs that prove the budget

Every run: Muster Barrows unless named, held start, 8 seeds, Steady unless named. Report held depth, deaths, XP an hour, gold an hour and the supply bill, never one score. A cell is about 5 to 9 CPU-minutes (MEASURED). "Runs today" means the tool exists. "Owed" names what has to be added first.

| # | What it proves | Pass | Command | Today |
|---|---|---|---|---|
| V1 | C-2: one tier ahead and back | 1 to 3 depths each way | `node tools/balance-program/redesign/v1-climb.mjs --candidate power-tier-ahead --risks steady --seeds 8 --hours 12` and the same with `--candidate power-tier-back` | Runs today |
| V2 | Borrow values at full power (V0) for every borrowable move | Each move placed in its band | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q3 --seeds 8 --hours 8 --workers 6 --json q3.json` | Runs today for 5 moves. Owed: a plan `q4` with every borrowable move |
| V3 | The value bands | Each borrow at its band lands at or under its cap (4, 7, 10) | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q3f --seeds 8 --hours 8` | Runs today for Fireball. Owed: one row per band |
| V4 | The heal rule | Borrowed Greater Mend on the hammer at 10 steps or less | `node tools/balance-program/redesign/roads/make-lend.mjs --heal-rule shared` then `node tools/balance-program/redesign/roads/roads-run.mjs --plan heal --seeds 8 --hours 8` | Owed: `--heal-rule shared\|mend-cd\|magic` in `make-lend.mjs` and plan `heal` |
| V5 | Each vow on its best and worst cell | Net +8 to +12 best, −6 to −10 worst | `node tools/balance-program/redesign/roads/vow-run.mjs --vow <id> --cells best,worst --seeds 8 --hours 12` | Owed: L1, L8, a `vow-run.mjs` |
| V6 | The choice ceiling and the library | Best saved build per ground within 7 to 14 steps of suggested. Every build top 3 somewhere, top in no more than 25% of cells | `node tools/balance-program/redesign/roads/library.mjs --grounds <three scale grounds> --plans suggested,best --parties 1,4 --risks careful,steady,bold --seeds 8 --hours 12` | Owed: L8, L12 and the reader (04 section 14) |
| V7 | Near fall-back nodes fire on every stance | Each fires on the dummy analyzer on all three stances, 0 Steady deaths | `node tools/balance-program/redesign/v1-climb.mjs --candidate near-fall --risks careful,steady,bold --seeds 8 --hours 12` | Owed: L4 and the `near-fall` candidate |
| V8 | The early ramp | Section 2's shares within ±5 points at Levels 30 and 60 | `node tools/balance-program/redesign/v1-climb.mjs --ground <scale ground> --level 30 --candidate ramp-on --seeds 8 --hours 12`, then `--candidate ramp-off` | Owed: a scale ground under Level 55 (R10) and L1. Level 60 runs on Muster once L1 lands |
| V9 | The supply bill with vows and borrows | Store kit 0.2 to 0.3 of pay with the library's suggested builds | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q1 --seeds 8 --hours 8` (store column), then the library builds | Runs today for borrows. Owed: vows (L8) |
| V10 | The luck ceiling with the Signature inside the gear slice | Lucky against unlucky kit at most 20 steps at the 10th and 90th percentile | `node tools/balance-program/redesign/kit-sampler.mjs --levels 60,120,200 --hours 40,200,1000` | Owed: the kit sampler (04 section 10) |
| V11 | Party size with builds worn | C-6 1.2 to 1.6 a head in a four, C-7 solo 0.5 to 0.8 | V6 with `--parties 1,4` | Owed with V6 |
| V12 | The fist generalist | Top 3 in no cell, bottom 3 in no cell | V6 with `--builds fist` | Owed: `FIST_LINE.live`, L13 |
| V13 | Gold follows depth | Gold a hero-hour rises with held depth at about `payStepCoin` a step | `node tools/balance-program/redesign/roads/roads-run.mjs --plan q1 --seeds 8 --hours 8` (gold against held) | Runs today. Feeds L10 |

**Order:** V1, V2 and V13 now. V4 before L6. V5, V7, V9 with the sample (L8). V6, V8, V10, V11 once R10 opens more scale grounds.
