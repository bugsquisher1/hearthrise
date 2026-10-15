# Design rulings v2: gear and imbuements, house gates, bestiary stages, EA housing (game-designer, 2026-10-15, read-only)
Precedence: Tyler's 10-14/10-15 answers (memory steam-launch-decisions) > MDR v1.1 (b6db45be) > ruling D (superseded wherever it disagrees). "UNV" = unverified: no simulation, analyzer or vitals behind it yet. Ids were checked against `src/data/*` on main 6ee379c8; "NEW" marks rows that do not exist yet.

## 1. Ruling D v2: gear, imbuements, preparations
**Purpose test.** (1) Problem: with fixed stats, gear upgrades stop between drops. (2) Decision: which kinds go on which piece, how many hours to buy, and one-hand+shield breadth vs two-hand depth. (3) Source and consumer: monster products → imbues; Smithing → honing stones; Woodcrafting → charms; gold sink (fees). (4) Tradeoff: you can't trade an imbued item, and you pay per hour against the supplies it saves. (5) It still matters at hour 1,000 because every new region adds products and grades. (6) It adds depth if v1 stays at 5 kinds.

**Rules**
- **Gear class → slots:** Class 1 (normal drop or smith) = 0, Class 2 (rare) = 1, Class 3 (extra-rare) = 2, Class 4 (boss) = 3. Slot count is DERIVED from `gclass`; it is never typed per item.
- **Only these slot types take imbuements:** weapon, shield, helmet, body, pants, boots. Jewellery, cape, gloves, belt, ammo and companion take 0 whatever their class (their fixed stats are their value, and this keeps the imbue sheet small).
- **One-hand weapons and shields** get the class's slot count at **0.5× power and 0.5× cost** (materials charged as ceil(h × q × 0.5)). A Class-4 one-hand + shield carries 6 half-power kinds; a two-hand carries 3 full-power kinds. That breadth is intentional (MDR §6).
- **Per gear piece.** The hours live on the item instance. **Each kind stacks once per character** across everything worn; Element Ward:Fire and Element Ward:Frost count as different kinds. The server refuses an equip that would duplicate a kind, with the copy "You already wear a Keen imbuement."
- **Clock:** a 1–50 h target slider in 1 h steps. A top-up charges (target − remaining) hours, and a target at or below the remaining hours is refused as a no-op. A different kind or grade is an overwrite: it forfeits the remaining hours and pays the removal fee. Time runs only while the piece is **equipped during an active hunt**; it pauses in town, while walking, while knocked out and in the depot. Expiry lands on a swing boundary (`imbue_out`), and apply/remove are refused while a hunt is open.
- **Trade lock:** an imbued piece can't be listed, traded or sold to the NPC. The equip doll, the depot and a home display are allowed. You unlock it by hunting it to 0 or by paid removal.
- **Removal fee** (UNV) = max(50 g, ceil(0.10 × hours_left × gold_per_hour(grade) × power)), where power is 0.5 for one-hand/shield. It's a pure sink: the remaining hours are forfeit and nothing is refunded. It stays small on purpose: forfeiting the hours is the real cost, and the fee only stops overwrite spam.
- **Grade gate:** none. Any slot takes grades I–III and cost does the gating. With 3 grades in v1, each new region adds a grade row (data, not code).

**v1 kinds (5) and the slot eligibility map** (all values UNV; they are bounded by the existing clamps: critCap 0.60 and the damage clamp 1.90)
| Kind | Slots | Grade I / II / III (full power) | Engine hook |
|---|---|---|---|
| Keen | weapon | crit +2 / +4 / +6 pts | exists (crit) |
| Life Leech | weapon, body | heal 3 / 6 / 10% of damage dealt | NEW (U2 engine) |
| Mana Leech | weapon, helmet | mana 2 / 4 / 6% of damage dealt | NEW (needs mana, U2) |
| Ward | shield, body, helmet | physical damage taken −2 / 4 / 6% | exists (ward path, total ≤10%) |
| Element Ward:<family> | shield, helmet, body, pants, boots | that element's damage taken −4 / 8 / 12% | needs resistances (R lane) |
**Cut from v1:** skill +N, regen (Prayer owns it), Bane, Strike/element edge (runes own elements), and every speed kind. **Ship order:** Keen and Ward first (existing hooks), the Leeches with U2, Element Ward with the rune/resistance lane.
- **Cost per hour** (UNV): grade I = 1 product + 20 g; II = 1 grade-I product + 1 grade-II product + 100 g; III = adds 1 grade-III product + 400 g. Products are unique per monster (Tyler 10-14). Placeholders until the Greenhaven roster lands: Keen small_fang → razor_claw; Life Leech rat_tail; Mana Leech slime_gel; Ward wolf_pelt → troll_hide; Element Ward roster TBD. Guard target (ruling D carried over): imbue cost per hour = 0.4–0.7 of the supply value it saves or adds.
- **Honing stones (Smithing)** and **protective charms (Woodcrafting)** are **character preparations, not item imbues**, so they never trade-lock. They use the same 1–50 h hunting-time clock and linear top-up, at **1 stone (or charm) = 1 hour**. **One active hone and one active charm per character (RULED).** Switching tier or kind forfeits the remaining hours and costs no fee. Hone = weapon damage +3 / 5 / 7 / 9 / 11 / 13 / 15% across the 7 stone tiers (UNV). Charm = damage taken −5% from one creature family (UNV), so preparing for a specific hunt becomes the decision. It does not overlap Element Ward, which is per element. Charms are post-EA content, but the slot ships with the clock.
- **Drop bands** (Tyler's simple tables plus MDR §8): every monster drops gold + 1 junk (auto-sold at hunt end) + 1 imbue product + bones if it has bones + **Class 1** gear at its tier, about 1 piece per 1–2 h per hunt (UNV). **One carrier monster per hunt** (a common spawn) holds **Rare = Class 2, about 1 per 10–20 h** and **Extra-rare = Class 3, 1 per 100–200 h, centred on 150 h**. The extra-rare slot may instead be a trophy or a pet (later). **Class 4 drops only from boss hunts**, so EA ships Classes 1–3 and Class 4 arrives with the first boss hunt. No pity and no guaranteed timers. Only the bestiary boosts the extra-rare (§3); the rare is never boosted.
- **Smith NPC stock** (the smithy in `town_common`): Class 1, tier 1 only, priced at 2× item `v`, sells back at `v`. Heavy: bronze_helm, bronze_platebody, bronze_platelegs, bronze_boots. Medium: leather_helmet, leather_body, leather_pants, leather_boots. Light: apprentice_helmet, apprentice_body, apprentice_pants, apprentice_boots. Weapons: bronze_sword (one-hand), stone_maul, shortbow, apprentice_staff (two-hand). NEW `board_shield` (Class 1, Woodcrafting look, v≈60). Jewellery: copper_ring, hunter_necklace, traveler_cape. Tier 2 and up comes only from drops.

**Data shape** (`src/data/imbuements.js` NEW, pure ESM, imported by the edge)
```
CLASS_SLOTS = [null, 0, 1, 2, 3]            IMBUE_SLOT_TYPES = ['weapon','shield','helmet','body','pants','boots']
HALF_POWER = { shield: 0.5, weapon_hands_1: 0.5 }   PREP_HOURS = { min: 1, max: 50, step: 1 }
IMBUE_KINDS = [{ id:'keen', slots:['weapon'], stat:'critPts', grades:[2,4,6] }, ... { id:'element_ward', perElement:true, ... }]
IMBUE_GRADES = [{ g:1, goldPerHour:20, products:{ keen:['small_fang'], ... } }, { g:2, ... }, { g:3, ... }]
REMOVAL = { floor: 50, pctOfRemaining: 0.10 }      PREPS = { hone: { skill:'smithing', perChar:1 }, charm: { skill:'crafting', perChar:1 } }
items.js gear rows: + gclass (1..4), + hands (1|2) on weapons, + weight ('heavy'|'medium'|'light', U lane); − reqLv/reqSkill; − bop
DB (lane C, Security GO): player_gear_imbues(instance_id, idx, kind, element, grade, hunt_ms_left); player_char_prep(user, char_slot, kind 'hone'|'charm', item_id, hunt_ms_left)
```
**KEEP / ADAPT / DELETE in today's data**
| Today | Verdict | To |
|---|---|---|
| 260 gear rows (items.js, gear-tiers, slot-ladders, stonecraft): fixed stats | ADAPT | keep stats; add gclass=1, hands, weight; strip reqLv/reqSkill on all 260 |
| `bop` on 8 rows | DELETE | MDR: no binding |
| gear-tiers smith/craft/bars/planks/lvOff | DELETE | gear is not crafted; keep only the def/atk/str curves |
| 27 `lucky` rows + wave3-uniques | ADAPT | Class 2 rare candidates (the roster picks one per carrier) |
| 12 `champion` relic rows | ADAPT | Class 3 extra-rare candidates |
| bosses, boss-forge, raid-bosses | DELETE now | Class 4 returns with boss hunts |
| 47 field-salvage rows | ADAPT | Class 1 drop rows |
| 7 whetstones (library2-items) | ADAPT | Honing Stones: ids kept, names "… Honing Stone", 1 stone = 1 h |
| 6 elemental `_of_<element>` whetstones | DELETE | runes own elements |
| equip shop rows; `fox_companion` | ADAPT; DELETE | smith stock above; companions are retired |
| start kit `coarse_whetstone: 10` | KEEP | 10 h of Coarse hone, the first preparation |

## 2. House gates → plots and hands bought with gold, the house only holds benches, depot and trophies
**Purpose test.** (1) Problem: property tier gates plots (`(prop_tier+1)*2` in `hr_farm_plant`) and hands (`req_property_tier` in gold-ladders.js), which breaks MDR §9 "no resource advantage". (2) Decision: spend gold on capacity (plots, hands) or on looks (property). (3) It reuses the existing `hr_unlock_buy` MAX ladders with no new RPC. (4) Tradeoff: gold spent on output vs prestige. (5) It works at any hour because the ladders are long. (6) It is a simplification.

**Ruling.** Plots and hands are per-character gold ladders, open in any home. Hands are hired at the town noticeboard (`town_common` object), and every home layout draws the same 12-bed garden strip (bought beds tilled, the rest weeds), so a property can never add a bed.
- `gold-ladders.js`: `workerReqTier → 0`, `farmReqTier → 0`. The FARM_LAND price becomes escalating: rungs 1–2 free (granted at creation), then rungs 3–12 = round50(500 × 1.55^(n−3)) = 500, 775, 1.2k, 1.85k, 2.9k, 4.45k, 6.9k, 10.7k, 16.6k, 25.75k (≈72k total, UNV) + `normal_log: 5` each. WORKER costs are unchanged (500 → 750k); hands' output counts against Tyler's gathering caps.
- `start-kit.js START_CURRENCY.farmPlots: 4 → 2`.
- homestead.js TIERS (camp → castle, with plots/workers/rooms) is DELETED and replaced by `src/data/properties.js`. Rooms lose `roomMinTier`, so any bench can be built in any home.
- perks.js: DELETE allXP/combatXP, the castle +2% XP, `library` rested, `cellar` +500 storage (it feeds nothing; capacity is the bank ladder), `garden` crop perks, `trophy` room perks and the watchtower. KEEP forge/kitchen/workshop speed/noBurn/craftSave as bench rungs. Re-theme `shrine` → Rune Table (Runecrafting).
- SQL (lane C, Security GO, moves gold): `hr_farm_plant` reads the `plot:farm_land` rung instead of the property tier; `hr_unlock_offers.req_property_tier = 0` on the worker/plot rows; the property-tier ladder offers are dropped.
- Guard `no-property-advantage`: a `properties.js` row may carry only {id, name, price, map, frontage, footprint, blurb}, and the mutant (adding `plots` or `xp` to a row) must go red.

## 3. Bestiary stages (decision 4)
**Purpose test.** (1) Problem: farming kills is the core loop but leaves no memory, and the relic chase is pure luck. (2) Decision: pay the fee on this creature now, or save the gold. (3) Source: kills (`ev:kill_monster:<id>`, server-owned). Consumer: the carrier's extra-rare roll. It is also a gold sink and feeds the trophy shelf. (4) Tradeoff: about 2 h of earnings, paid up front, for a relic boost only a committed hunter of that ground recoups. (5) Every new creature adds a ladder. (6) It is depth: one sentence to learn, four stages.

| Stage | Kills (UNV, same for every creature) | Shows | Boost (fee to activate) |
|---|---|---|---|
| 0 | 0 | silhouette, "Found at <hunt>" | — |
| 1 Sighted | 25 | art, HP, XP, damage type, weakness and resistance, junk/product/Class-1 drop names | — (knowledge is free) |
| 2 Tracked | 250 | rare and extra-rare names and rarity labels | extra-rare ×1.05, fee 0.25 × G(L) |
| 3 Studied | 1,000 | drop odds as bands, your best kills/h there | ×1.12, fee 0.5 × G(L) |
| 4 Mastered | 2,500 | claimable trophy for the home shelf, name plate | ×1.25, fee 1.25 × G(L) |
- **Fee curve:** fee = c_stage × G(L), where L is the creature's level (a NEW `lv` field from the roster) and G(L) is the reference gold-equivalent per hour the hunt-balance guard uses for a ground at level L. Until that table exists, G(L) = 600 × L (UNV; it sits between the measured old-economy 674/L at Mill Cellar and 359/L at Ridge Camp, ruling D). Examples: an L5 creature costs 750 / 1.5k / 3.75k g; an L100 creature 15k / 30k / 75k. Fees are paid in stage order, are permanent, are per character, and each stage replaces the previous boost (it does not multiply). Gold never skips kills.
- **Why ≈2 h of earnings:** relic EV is ≤10% of burn (ruling D guard). A +25% boost adds about 2.5% of burn per hour, which over the roughly 110 h left after mastery (2,500 carrier kills ≈ 15–70 h, UNV) repays about 2.75 h. That is positive for committed hunters and negative for dabblers.
- **Data:** `bestiary.js` TROPHY_STAGES becomes {stage, id: sighted|tracked|studied|mastered, at, relicMult, feeHours}. Drop `drop`/`dmg` (no damage, XP or rare boost), `MAX_MEMORY_DROP_MULT` becomes `MAX_BESTIARY_RELIC_MULT = 1.25`, and `bestiary-charms.js` is DELETED. Server: the `bestiary:<monster>` MAX ladder in `hr_unlock_buy`, rungs 2–4, with a new `req_kills` prereq read from `player_progress` (lane C, Security GO: it is a drop-rate path). A party's extra-rare roll uses the members' **average** active boost. Guard: `bestiary-pace` (Mastered at the reference rate ≤ 0.5 × the ground's extra-rare hours, and the boosted extra-rare ≥ 80 h).

## 4. EA housing v1
**Purpose test.** (1) Problem: rich players have no prestige sink, and the home needs one place to prepare. (2) Decision: which look to own and when to spend. (3) The cottage holds the benches/depot/trophies every other loop feeds; a property is a gold sink. (4) Tradeoff: looks vs gold. (5) It earns its place at hour 1,000 only with post-EA showcase scoring (pushback below). (6) It stays simple: 3 layouts, looks only, one home per account.
- **Greenhaven naming voice** (write this into the `properties.js` header): pastoral and working-town roots (brook, mill, ford, croft, green, cote, yard); trades (miller, cooper, chandler, tanner); founders' surnames. No filler words. Note: Tyler's region sheet has "Forgotten Rootcellar", which breaks §2 and gets a rename at the roster.
- **Starter cottage** (`home_cottage`, free, everyone): depot chest (`chest_iron`); hearth = Kitchen bench; ghost outlines with signposts for the Forge, Workshop and Rune Table benches (rungs bought with gold + materials); a trophy shelf with 3 pegs that Mastered trophies fill; a weapon rack, armour stand and display case (look-only; real-item displays post-EA); the 12-bed garden strip. No XP, regen or storage perks.

| Property (NEW) | Where (on the route) | Layout | Price band (UNV) |
|---|---|---|---|
| Millrace Cottage | beside the mill's waterwheel on the Mill Cellar path | narrow two-room, stream-side yard | 75k–125k g (≈10 h of G at L15) |
| Cooper's Yard | east lane by the woodpile and barrels | workshop house, walled courtyard | 400k–600k g (≈20 h at L40) |
| Wellgate House | facing the plaza well | two-storey frontage, front garden | 1.5M–2.5M g (≈40 h at L80) |
Gold only, never Crowns. The unlock is permanent and account-wide, and one property is active. Benches, depot and trophies follow you to the active home unchanged (`account_property(user_id, property_id, active)`, lane C, Security GO).

## Walk-through: a fresh hero's first preparation, imbue and stage (kit = 500 g, 20 cooked_shrimp, 10 shrimp, 50 bronze_arrows, 50 air_rune, 10 coarse_whetstone, 8 turnip_seed, bronze_sword equipped)
| # | Step | Holds or reaches from steps 1..N−1 + kit | Doable? |
|---|---|---|---|
| 1 | Hone: Coarse, 10 h | 10 coarse_whetstone (kit) | yes |
| 2 | Hunt Mill Cellar (rat 5 / slime 3 / hive_wasp 2) | the hone from step 1; cooked_shrimp | yes (C2 fresh-hero fix pending) |
| 3 | Loot | rat_tail, small_fang, slime_gel, bones, leather_helmet (hive_wasp 0.002) | yes (ids verified) |
| 4 | Buy board_shield at the smithy | gold from steps 2–3 | NO until the `board_shield` row is added (NEW) |
| 5 | Sighted on rat after 25 kills; Tracked at 250 kills + the fee | kills (step 2), gold (step 3) | yes once `lv` exists (rat: L≈1, so the fee is ≈150 g) |
| 6 | First Class-2 rare (≈10–20 h) → Keen I × 10 h at the smithy anvil | small_fang × 10 (step 3) + 200 g | NO until a carrier rare row exists (roster) |
| 7 | List the imbued rare | — | refused by design: "Hunt it out or remove it (fee)" |

## Pushback
Ship Honing first (it reuses 7 ids and proves the hunting-time clock), then Keen and Ward, then the Leeches with U2. Charms are post-EA. The 3 properties are a sink with nothing to win until showcase scoring exists; build them last in EA.

## Open questions for Tyler (2)
1. One home per account: I made the home, benches and trophy shelf **account-wide** (shared by Hero 1/2/3), and the depot, plots, hands, bestiary and preparations **per hero**. Confirm.
2. Extra-rare: MDR says 100–200 h, your 10-14 note says 100–150 h. I centred it on 150 h with the 100–200 band (the bestiary pulls the floor to 80 h). OK?
