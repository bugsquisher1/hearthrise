# 24. The content pipeline: adding one more of everything

Tyler, 2026-11-22: "I also want EVERYTHING we've done to be scalable for later content."

This file answers one question per content type: **how do I add one more, and what does it cost?** For each: what is data, what is code, which tool writes it, which guard catches a mistake, which Lab run proves it, and what would force existing rows to be rebalanced. Section 5 lists every place where adding content still needs code or a rebalance, with the design fix or the reason it has to stay.

Built in this lane (lane/content-pipeline, systems):

| Tool | What it does | Its test |
|---|---|---|
| `node tools/new-ground.mjs <ground> --entry L --top L [--mid L] [--write]` | Runs the three v1-climb cells R10 ran by hand (LOW at entry, BIS at top, MID at the middle), cuts the band by R10's rule, prints OPEN / REVIEW / STAGED. `--write` sets the band on the ground's row and pins it with a print of the rows it was measured on | `tests/new-ground.mjs`: R10's three bands come back exactly from R10's own reports |
| `tests/content-coherence.mjs` (+ `--mutate`, 29 mutants) | Every scale ground has a band, gear base, one drop home and a Trait pool. Its band matches the pin and was measured on its current rows. Every Trait and Signature has a home that exists. Every live move has an icon, and its road and Signature once the Roads are live | its own `--mutate` |
| `node tools/content-checklist.mjs move <id>` / `weapon <discipline>` | The section 3.6 and 3.7 tables as a checklist for one id, ticked from the data | `tests/content-checklist.mjs` |
| `tests/danger-band-pins.json` | The measured band of each scale ground and its print. Written by `new-ground --write` only | read by CC-2 |

All four run in one CI step next to gear-steps (`.github/workflows/smoke.yml`, job in-page-2).

---

## 1. The rule

1. **A new piece of content is rows.** Code changes only when the content needs a mechanic the engine doesn't have yet (a new status, trigger or target shape). That's an engine lane first, then the content lane.
2. **Every number is bounded by a slice, so new rows never rebalance old ones** (`19-power-ledger.md`). A new Trait or Signature sits inside the gear slice (20). A new vow, crossroads or borrow sits inside the build slice (14). A new imbuement or draught sits inside the consumable slice (6). The engine clamps each slice. What a new row can change is which build is best on which ground. It can't change how big the best build is.
3. **Measured numbers carry what they measured.** A band is a measurement of one ground's rows (`danger.js`: "a step is a step of the ground's own rows"). The pin records the print of those rows, and CC-2 reds the band when the rows change.
4. **Samples, then batches of 20 or fewer** (CLAUDE.md section 10). Every table below is per row, so a batch is the same steps repeated.

## 2. A hunting ground on the Danger scale

| | |
|---|---|
| **Steps** | 1. Author the pack: `node tools/pack.mjs new <id> --like <ground> --band lo,hi`, then `pack.mjs propose <id> --write` for the formula's stats. 2. `pack.mjs check <id>` (lint, plus the grader on the real engine). 3. Pick the gear base (`gearLevel: tierLevel(t)`), the drop home (`ladderTier` or `named`) and the Trait pool (`traitPool('<id>')`). These are design calls. `entryLevel` is the hunt's band floor (it sets the highest Trait rank, `maxRankAt`). 4. `node tools/new-ground.mjs <id> --entry lo --top hi` (about 3 × 4 seeds × 12 h on 6 workers). It prints the row to paste. 5. Paste the row, then `node tools/new-ground.mjs <id> ... --write` pins it. 6. `node tools/gen-danger.mjs` and a staged migration (`node tools/new-migration.mjs <slug>`). 7. `pack.mjs ship <id>` for the ground's own server rows |
| **Data** | `src/data/grounds/<id>/{pack,map}.js`, the row in `src/data/danger.js DANGER_GROUNDS`, the pin in `tests/danger-band-pins.json` |
| **Code** | None |
| **Generators** | `tools/pack.mjs`, `tools/new-ground.mjs` (new), `tools/gen-danger.mjs` (server catalogue `hr_danger_grounds`), `tools/gen-hunt-sessions.mjs` |
| **Guards** | `tests/content-coherence.mjs` CC-1 (band order, top at most `gapMax` over ref, gear base on the tier grid, exactly one drop home, Trait pool), CC-2 (pin and print). `tools/gen-danger.mjs --check` (floor < ref < top), `tests/hunt-core/danger.mjs` (every scale drop carries the ground's item Level), `tests/ground-pack.mjs`, `tests/catalogue-coherence.mjs` C11 (its drops are reachable) |
| **Lab** | `new-ground.mjs` is the Lab run: the Steady mixed four, held from hour 4. Verdict STAGED if any Steady cell died (C-3). The floor is cut from the LOW four by `danger.js BAND_RULE` (its lowest seed less 10, G3), so a fresh company always holds depth 1 to 3. REVIEW if the band is out of order. `tests/level-curve.mjs` C7 for the pay at the band's middle |
| **Rework risk** | **None for other grounds.** The band belongs to the ground (12-targets 2.5), and pay is the hours table split over the ground's own kill rate (`refKillsHead`). Changing this ground's monsters later is caught by CC-2 (re-measure). An engine-wide change (the combat engine, `powerStep`, `CLIMB`) moves every band. That's a re-run per ground, now one command each (see F2) |

## 3. Every other content type

### 3.1 A monster and its role

| | |
|---|---|
| **Steps** | Add the row to the ground's pack (each ground owns its own rows under its own ids, so changing one never touches another ground). Set `role` from `src/data/monster-roles.js` and `cls`. `pack.mjs propose --write` for its stats from `src/data/balance-sheet.js`. Add art via `src/data/monster-art.js` (`pack.mjs art <id>` lists what's owed) |
| **Data / code** | Data. **A new role** (a new behavior, such as the Caster or Warder bodies the ledger says don't exist) **is code** in the hunt engine. That's justified: a role is a behavior, and roles are few by design (each is a question the ground asks, 19 row 13) |
| **Guards** | `tests/ground-pack.mjs`, `tests/monster-facts.mjs`, hunt-grounds `validate()`, `tests/pixel-icons.mjs` and the monster art manifest. On a scale ground, CC-2 reds the band until it's re-measured |
| **Lab** | `pack.mjs check` (grader). On a scale ground, `new-ground.mjs` again |
| **Rework risk** | Only the ground it stands on (CC-2 makes that loud) |

### 3.2 A drop-table row

| | |
|---|---|
| **Steps** | An entry in the monster's `drops` with `id`, `ch` and `band` (`src/data/loot-bands.js`). The item must exist with a use. Regenerate the server catalogue (`node tools/gen-catalogues.mjs`) as a staged migration, lane C |
| **Data / code** | Data |
| **Guards** | `tests/catalogue-coherence.mjs` C1, C2, C11 (source, use, reachable), `tests/settle-drop-bounds.mjs`, the catalogue drift guards, `tests/hunt-core/danger.mjs` (a gear drop on a scale ground carries its item Level) |
| **Lab** | v1-climb's gold lines (coin, income, kit share) on that ground. `node tools/gen-gold-estimate.mjs --check` |
| **Rework risk** | That ground's income only (the band's print leaves drops out on purpose, since loot doesn't move the held step). The kit share (0.2 to 0.3 of pay, `store-kit.js`) is per ground, so one rich drop never reprices the store. **Design fix (F4): author a rare drop as `everyHours` (one in N hunted hours, 04 section 11) rather than a hand `ch`.** A generator converts it using the ground's measured kills an hour (`refKillsHead`), so a re-measured band keeps its drop rates without retuning |

### 3.3 A gear base tier and its items

| | |
|---|---|
| **Steps** | On the scale a piece is its item Level alone (`gear-steps.js`). A new tier is `tierLevel(t)` (t × 20) and a ground that drops it (`gearLevel`). Its items come from the ladder (`gear-tiers.js WEAPON_FAMILIES` and slot ladders, one entry per tier per family) or a named set (`catacomb-armor.js`). `scaleItemLevels` writes each piece's `iL` |
| **Data / code** | Data. Extending the old ladder past tier 7 means one more entry in each family's arrays. That's wide but mechanical, and it retires with wave 3 |
| **Guards** | `tests/gear-steps.mjs` (slot weights, tier, Trait budget), `tests/hunt-core/danger.mjs` (one base a ground, one item Level a piece: `scaleItemLevels` throws on two), `tests/catalogue-coherence.mjs` C8 (armor climbs), `tests/pixel-icons.mjs` |
| **Lab** | v1-climb `--gear` low/mid/bis on the ground. r9's "one tier moves the hold 1 to 3 depths" (C-2) |
| **Rework risk** | **None by construction.** A tier is always 20 steps above the last. Gear above a ground's base counts at 1000‰ and below at 500‰ (one-sided), so a higher tier never shifts how an older ground plays. **Known seam (G9):** two tier counts live side by side until wave 3 (Muster's `gearLevel` is tier 3 while its `ladderTier` is 5). Don't add a third: a new ground names both until the ladder retires |

### 3.4 A Trait

| | |
|---|---|
| **Steps** | One row in `src/data/traits.js`: `slot`, `raises`, `when` (one of the bar's own conditions, `condition-metrics.js`), `key` (the stacking table in 15), `source` (its home ground), `seat`, `tip` |
| **Data / code** | Data, as long as `when` uses an existing condition metric. A new metric is engine code (the bar's condition vocabulary) |
| **Guards** | `tests/gear-steps.mjs` GS-1..6 (shape, budget, the Very Rare pair rule, hidden), CC-1 (the ground's pool holds only its own Traits), CC-3 (the home exists. A home off the scale warns while Traits are hidden and goes red once `GEAR_STEPS.traitsLive` is true) |
| **Lab** | The dominance check (V7, 04 guard 4: no Trait in the best kit on more than 40% of cells), average share at most half the best case (guard 2) |
| **Rework risk** | Size never (one budget a rank, inside the 20-step gear slice). **Odds: adding a Trait to a pool dilutes the Traits already there.** Design fix (F5): the wave-4 roller rolls the slot first, then a Trait from that ground and slot. A new Trait then dilutes only its own cell, and the rule "at most 2 Traits a cell" keeps any one chase from slowing by more than half. Data: `GEAR_STEPS.traitRoll`. No cell holds more than 2 since lane/band-floor (the Bone Wing helmet's 3 resolved), GS-5 holds it, and CC-8 warns on a Trait whose home never drops its slot |

### 3.5 A Signature

| | |
|---|---|
| **Steps** | One row in `src/data/signatures.js` (section 4 contract): `move` or `family` (or neither, for a proc/aura/utility one), one `home` `{ kind: 'ground' \| 'monster' \| 'chest', id }`, the rule, its stacking key. A drop row on its home at "one in 30 to 60 hunted hours" (as `everyHours`, F4). Security before it trades (13-market) |
| **Data / code** | The row is data. **Most of the 46 need an engine piece** (15 "New engine pieces needed": procs, resets, auras, shields from gear). Justified: a Signature is by definition "a rule nothing else gives". The pipeline rule is that a Signature built on existing pieces is a row, and one that needs a new piece goes to an engine lane that adds the piece for the whole family (one "cooldown reset on X" piece serves #3, #5, #6, #11, #14) |
| **Guards** | CC-5 (every live move and rune family has one, red once `SIGNATURE_RULES.live`), CC-6 (home exists, the move or family is real, red always) |
| **Lab** | 10 steps on its best cells, inside the gear slice. "Works with every branch" is the build library (17 section 9) |
| **Rework risk** | None on size (gear slice). One per hero and no self-stacking are rules, not numbers |

### 3.6 A move (its branches, rank stones, Signature and icon)

| | |
|---|---|
| **Steps** | `node tools/content-checklist.mjs move <id>` prints and ticks them: the row in `abilities.js` (the spell rule's share and base floor), its rune family, its icon (`ABILITY_ART` and the png), its hit effect, the default bar if a style should hold it (`rule-subjects.js`), the server catalogue (`gen-hunt-sessions.mjs`, lane C, edge deploy), its road (5 rank stones, 2 crossroads of 3, 2 waystones, an open road, a final form), its Signature, a stacking key for every new effect, its borrow V0 |
| **Data / code** | The row is data. **A new effect is code** (a new status, target shape or trigger). Justified as in 3.5. The rule: a move ships on existing vocabulary, or behind an engine lane |
| **Guards** | CC-4 (icon, red now), CC-5 (road and Signature, red once live), CC-7 (nodes name a live move), `tests/pixel-icons.mjs`, `tests/hunt-core/spell-rule.mjs`, `tools/gen-hunt-sessions.mjs --check` |
| **Lab** | `tools/balance-sim/staged/spell-audit.mjs` (the share). The dummy analyzer (every option fires). The build library (no build top in over 25% of cells). Borrow V0 (`tools/balance-program/redesign/roads/roads-run.mjs`) |
| **Rework risk** | Rank stones are a third of a Level's step inside the Level, so a new move's ranks never add power on top. Crossroads and vows sit inside the build slice (14). **A new move on a full lane** (over 75% on its weapon's bar) can't take a cooldown option (17 section 9). That's a design check, not a rebalance |

### 3.7 A weapon family and its Roads country

| | |
|---|---|
| **Steps** | `node tools/content-checklist.mjs weapon <discipline>`: its weapon line (in `gear-tiers.js`, or its own module behind a `live` switch, as `src/data/fists.js` did), `DISCIPLINES` row, `ROLE_KEYS`, `FAMILY_SKILL`/`DAMAGE_XP_FAMILIES`, its moves (each via 3.6), the prep text, its country (moves' roads, 4 vows), its borders (one row per neighbor), the Lab style, the server catalogues |
| **Data / code** | Data, spread over 6 modules today (the fists line is the template, with one `live` switch spreading into each). **Code: the Lab's styles are a hand list** (`progression-grid.mjs MAIN`, `grid-kit.mjs`), see G6. A new seat behavior (the support's own heal) is engine code, as `selfHealPm` was |
| **Guards** | `tests/catalogue-coherence.mjs` (its items), `tests/hunt-core/fist-play.mjs` is the precedent for a play test, CC-7 (vows and borders name real countries, a border joins two) |
| **Lab** | v1-climb `--styles` with the new seat in the four. The build library. The seat's comparison (22 section 4). `tools/balance-sim/fist-table.mjs` |
| **Rework risk** | **Borders only add** (17 section 6: "a new country adds rows and never cuts one"). Each new border adds a hybrid vow and crossroads inside the build slice. A release that adds nodes gives every hero one free reset (17 section 2), so new content never strands a build |

### 3.8 A Roads node, vow or border

| | |
|---|---|
| **Steps** | A row in `src/data/talents.js TALENT_NODES` (section 4). A vow: +18 steps on its condition, −8 always, never a max-health cost, a stacking key. A border: two countries, a town (pick 1 of the two borrows), a hybrid crossroads of 3, a hybrid vow. A Milepost: same size as a crossroads, from the latest release |
| **Data / code** | Data, once the Roads engine exists (19 section 5, L1 and L8). A node whose rule needs a new effect is code (as 3.6) |
| **Guards** | CC-5, CC-7. The server checks every node, link and pick against its catalogue (17 section 11), so a generated catalogue plus drift guard is owed with L8 |
| **Lab** | Crossroads options at most 3 steps apart, vows +10 best and −8 worst, the build library, the dummy |
| **Rework risk** | None on size: the build slice (14) clamps the net of every talent step. A third vow buys coverage, not size |

### 3.9 A rune family

| | |
|---|---|
| **Steps** | `src/data/runes.js RUNE_FAMILIES` (behind a switch while hidden, as Storm and Bone are), `stonecraft.js CRAFTED_RUNE_FAMILIES`, the Plain store rune in `supply-basics.js`, its icon, the moves that spend it (`rune` on the row), its Signature (CC-5) |
| **Data / code** | Data. One tier ladder (`RUNE_TIERS stepPm`) serves every family |
| **Guards** | `tests/w0e-ammo-runecraft-prayer.mjs`, `tests/supplies-catalogue.mjs`, `tests/catalogue-coherence.mjs`, CC-5/CC-6 |
| **Lab** | The store bill line of v1-climb (`charge`) for the seat that spends it |
| **Rework risk** | None: one ladder, priced by the store kit |

### 3.10 A consumable or imbuement

| | |
|---|---|
| **Steps** | Imbuement (21 section 3.4): one row in `src/data/imbue-rules.js` (new, replaces `imbuements.js`): `kind`, `when`, `key`, `part` (a rare part from a **different** ground than its best one), `best`. The made stack as an item. A draught or camp pot: an item with its effect kind (`item-effects.js`) |
| **Data / code** | Data, once `imbue-rules.js` and the worn-slot row exist (not built) |
| **Guards** | `tests/catalogue-coherence.mjs` C3 (every effect kind is live), the consumable slice clamp (19 L1, owed) |
| **Lab** | 21 section 3.8 (`imbueSteps` 2 on its best cell, average at most half) |
| **Rework risk** | None on size: one of each kind a hero, inside the consumable slice (6) |

### 3.11 A profession recipe and tool row

| | |
|---|---|
| **Steps** | A row in `src/data/recipes.js ARTISAN_RECIPES` (skill, level, inputs, output, work time). Its output needs a use (C2). A tool that wears (09 section 3.7) is not built yet |
| **Data / code** | Data |
| **Guards** | `tests/recipe-yield-guard.mjs`, `tests/craft-wages.mjs`, `tests/catalogue-coherence.mjs` C1/C2/C4/C11, `tools/gen-catalogues.mjs --check` |
| **Lab** | 09 section 5.8 (labor ratio). The output's V is computed (3.12), so no price to tune |
| **Rework risk** | None: V comes from work-hours and the wage, so a new recipe is priced by the same formula as every old one |

### 3.12 A market item value (V)

| | |
|---|---|
| **Steps** | Nothing per item. V is a pure function (13 section 3.2): a crafted good from its work-hours × the wage at its band step, a stream from its share × the wage, a piece from rarity hours × the wage at its item step. A new item carries the inputs it already has (band, work, rarity) |
| **Data / code** | Data. One function in `src/core`, owed (13 section 5) |
| **Guards** | Owed with the market: V is generated into the server catalogue and drift-guarded like every catalogue |
| **Lab** | `src/core/wage.js` calibration (lane W) |
| **Rework risk** | A wage lever change reprices everything at once. That's by design: one lever, never a per-item price |

## 4. The contract for the Roads and Signatures data (so CC-5..CC-7 bind the day it lands)

`src/data/the-path.js` already points at `src/data/talents.js TALENT_RULES` (`live`, `opensAt`, `pointLevels`). The guard reads:

| Module | Export | Shape the guard reads |
|---|---|---|
| `src/data/talents.js` | `TALENT_RULES` | `{ live: boolean, ... }`. While false, a move missing its road is a warning |
| | `TALENT_NODES` | rows (array or object of rows) `{ id, kind, move?, country?, countries?, options? }`. `kind` is one of rank, crossroads, waystone, border, hybrid, vow, open, final, milepost. A move's road has at least 5 `rank` rows and 2 `crossroads` rows of at least 2 options naming it. A `vow` or `border` names a country (a `DISCIPLINES` id, or `hearth`). A `border` has `countries` of two different ones |
| `src/data/signatures.js` | `SIGNATURE_RULES` | `{ live: boolean }` |
| | `SIGNATURES` | `{ id: { move?, family?, home: { kind: 'ground' \| 'monster' \| 'chest', id } } }`. Every live move and every shown rune family has one. `chest` ids are `chests.js HEARTH_CHEST_KEYS` ids |

The Roads sample lane (20 R-S) is free to add fields. Renaming these means changing `tests/content-coherence.mjs` and `tools/content-checklist.mjs` in the same commit.

## 5. Where adding content still costs code or a rebalance

| # | Gap | Today | Fix / reason | Status |
|---|---|---|---|---|
| G1 | A ground's band was cut by hand from three Lab runs | R10 read three reports by eye | `tools/new-ground.mjs`, one command plus review | **Built** |
| G2 | A re-fit monster silently moves its ground's band | Nothing noticed | Pin plus print, CC-2 | **Built** |
| G3 | **Muster Barrows' fresh company can't hold depth 1.** The LOW four at Level 55 holds 320.9 against a floor of 480 (the wings' LOW fours also sit under their floors). A first-ever hunt starts at the floor (12-targets 3.1) | The Muster pin carries a `hand` reason | **Ruled (designer, lane/band-floor 2026-11-22): re-cut the band from the entry party up.** The LOW kit already is the entry kit (one tier back, no jewelry), so raising it would only hide the gap, and 12-targets 3.1 already defines depth 1 as where a fresh company holds. `danger.js BAND_RULE`: floor = the LOW four's lowest seed less 10, down to 5; ref and top as R10. Re-measured 8 seeds x 12 h (`tools/new-ground.mjs --write`): Muster floor 480 to 320 (its fresh four's lowest seed 333; its refStep 590 kept by hand as the pay anchor, while the MID four now holds 634.5 at Level 65, an economy call), the Ford 470 kept (top 710 to 700), the Bone Wing 415 to 380, the Flooded Wing 370 to 350. Every fresh four reads depth 2. Depths stay even from floor to top, so the MID four reads depth 11 to 16 | **Built** |
| G4 | **Hask's Ford is on the scale with no Trait home.** 23 of the 40 Traits live on 5 grounds that aren't on the scale | CC-1 and CC-3 warn (Traits are hidden) | **Re-homed (designer, lane/band-floor 2026-11-22), all 40 kept.** Under G8 a Trait rolls only where its ground drops its slot, and of the scale grounds' 17 only 7 did (the wings drop helmets and boots only). Moved: Hask's Bargain, Slack Water, Numbed, Goaded and Carter's Flight to the Ford; Snuffed and Long Rite to Muster; Keeper's Carry to the Flooded Wing (Keeper Dunn's). Rollable now: Muster 5 (mage, melee, tank, healer), the Ford 4 (ranger, melee, tank, healer), each wing 2 (Bone mage and tank, Flooded healer and ranger). CC-1 holds every scale ground's rollable pool to 2+ seats, red now. Krell's Hold and Pyre Field keep theirs for their cut. **Still open:** the 14 cape and jewelry Traits roll nowhere (capes and jewelry are made, never dropped). CC-8 warns, and goes red with `traitsLive`. The roller lane decides how a made piece rolls | **Built; jewelry and capes open (roller)** |
| G5 | The Roads and Signatures have no data, so no move can show its road or Signature | CC-5 warns | The section 4 contract. Lanes R-S and the Signature sample build to it | **Roads sample built (lane/roads-sample 2026-11-23): `src/data/talents.js` (the Hearth, Shield, Restoration, their border), its catalogue `tools/gen-talents.mjs`, dark behind `TALENT_RULES.live`. Signatures: contract written** |
| G6 | **The Lab's styles are a hand list** (`progression-grid.mjs MAIN`, `grid-kit.mjs`). A new weapon needs Lab code | Code | Derive the ways from `ROLE_KEYS` and the kits from the weapon lines. Follow-up lane F1 (systems) | **Follow-up** |
| G7 | An engine change (combat-sim, `powerStep`, `CLIMB`) moves every band | Nothing flags it | Inherent: a step is the engine's unit. F2: put the levers' hash in each pin so a lever change reds every pin, and give `new-ground.mjs --all` from the pins' levels | **Follow-up** |
| G8 | Pool dilution: a new Trait slows every chase on its ground | Uniform pool | Roll slot first, then the (ground, slot) cell, at most 2 a cell (3.4). **Data:** `GEAR_STEPS.traitRoll` `{ slotFirst, cellMax: 2, seatsMin: 2 }` (lane/band-floor). GS-5 holds every cell to `cellMax`, and the Bone Wing's helmet cell of 3 is resolved | **Ruled as data; the roller follows it** |
| G9 | Two tier counts (scale `gearLevel` tier and the old ladder tier) | Muster: tier 3 against ladder tier 5 | Retires with wave 3. Until then a ground names both | **Justified** |
| G10 | Rare drop rates are hand `ch` values tied to today's kill rate | A re-measured ground drifts its drop hours | Author `everyHours`, generate `ch` from `refKillsHead` (F4) | **Done (lane/drop-formula 2026-11-22):** every monster row of a scale pack carries `everyHours` and the `ch` it derives (`tools/gen-drop-hours.mjs`, `--write` after a re-measure; `tests/drop-formula.mjs` DF-1 reds a stale or typed one); the wings derive at load from `ARMOR_EVERY_HOURS`. Off-scale grounds keep typed `ch` until R10 (`--convert <ground>`) |
| G11 | New effects (statuses, triggers, auras) for moves, Signatures and nodes | Engine code | Justified: the engine's vocabulary. Build each piece once for its whole family (15's list), then content is rows | **Justified** |
| G12 | The next ground's floor should sit just under the last one's top (12-targets 3.1 hand-off). Nothing checks it | By eye | F3: `new-ground.mjs` reads the scale ground whose top Level is this one's entry and notes the overlap | **Follow-up** |
| G13 | `ABILITY_ART` is a hand list beside `ABILITIES` | Two lists | Kept (the page reads item-art without the ability rows). CC-4 and `tests/pixel-icons.mjs` bind them | **Justified** |

### Follow-up lanes, smallest first

- **F2** (systems, S): the levers' hash (`DANGER`, `CLIMB`, `RISKS`, `PAY`, `POWER`) in each pin and in CC-2, and `new-ground.mjs --all`.
- **F3** (systems, S): the hand-off overlap note in `new-ground.mjs`.
- **F4** (backend + designer, M): `everyHours` for Rare, Very Rare and Signature drops, generated into `ch` from the ground's kill rate, lane C.
- **F1** (systems, M): the Lab's ways derived from the data, so `v1-climb --styles` takes a new weapon with no code.
