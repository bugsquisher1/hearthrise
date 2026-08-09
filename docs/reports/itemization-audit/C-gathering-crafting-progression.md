# Itemization Audit — Slice C: Gathering · Refinement · Crafting/Smithing · Skills · Tools · The Cross-System Progression Map

**Auditor:** Game Designer · **Build:** b228 (`c15914a`) · **Date:** 2026-08-09 · **Type:** READ-ONLY, no game code changed
**Program:** re-Master Itemization & Progression (DECISIONS.md 2026-08-09, Phase 1 audit)

> Scope note: this slice covers the *making* half of the loop — how raw materials become gear, what skills feed it, and whether upgrades pull a player across systems. Combat depth, drop tables, dungeon/raid rewards and the token economy are other slices. Where I touch them (drop sources, buff closure) it is only to judge whether the crafting web actually connects.

---

## 1. The gather → refine → craft → equip trace (end to end)

The spine is **`src/data/gear-tiers.js`** — one generator producing every tiered weapon and armour piece and its recipe, off a 7-rung material ladder (`MATERIAL_TIERS`, lines 28-43): Bronze(1) → Iron(15) → Steel(30) → Mithril(45) → Rune(60) → Emberforged(75) → Dawnsteel(88). Hand-authored recipes in `recipes.js` win over generated ones (`mergeGenerated`, recipes.js:198-205), so historical early-game pieces keep bespoke costs and the generator fills the rest.

### One weapon tier — Steel Sword (the honest case)

| Step | System | Data | Requirement |
|---|---|---|---|
| Mine iron | Mining | `iron_rock` req 15, → `iron_ore` (gathering.js:39) | Mining 15 |
| Mine coal | Mining | `coal_rock` req 30 → `coal` (gathering.js:40) | Mining 30 |
| Smelt steel | Smithing | `smelt_steel` = 1 iron_bar + 2 coal → `steel_bar` (recipes.js:65) | Smithing 35 + **Forge room** |
| Chop willow | Woodcutting | `willow_tree` req 30 → `willow_log` (gathering.js:29) | Woodcutting 30 |
| Saw willow | Crafting | `saw_willow` req 30 → `willow_plank` (recipes.js:137) | Crafting 30 + **Workshop room** |
| Forge sword | Smithing | `forge_steel_sword` = 3 steel_bar + 1 willow_plank → `steel_sword` (recipes.js:80) | Smithing 40 |
| Equip / fight | Combat | `steel_sword` atkB/strB, slot weapon (gear-tiers.js generated) | Attack level to wield |

**This is the loop working as designed.** A single steel sword touches **Mining + Woodcutting + Smithing + Crafting + Combat + Homestead (two rooms)**. You *cannot* spam one skill to a steel sword — the willow plank forces woodcutting+crafting, the steel bar forces mining+smithing. This is exactly the "upgrades pull you across systems" goal the brief names.

### One armour tier — Steel Platebody (the weak case)

| Step | System | Data | Requirement |
|---|---|---|---|
| Mine iron + coal | Mining | as above | Mining 15/30 |
| Smelt steel ×7 | Smithing | `smelt_steel` (recipes.js:65) | Smithing 35 + Forge |
| Forge platebody | Smithing | `forge_steel_platebody` = **7 steel_bar only** → `steel_platebody` (recipes.js:88) | Smithing 60 |

**Armour is a shallower loop than weapons.** Every generated and hand-authored armour piece consumes **bars only** — no plank, no thread, no secondary (`ARMOUR_SLOTS` has `bars:` but no wood field, gear-tiers.js:51-58; the generator's armour branch writes only `inputs[mat.bar]`, gear-tiers.js:152-154). So a full armour set is **Mining → Smithing → equip**: two systems, and one of them (mining) can be replaced by *buying ore/bars on the market* or *assigning a worker* (workers.js gather ore while you do something else). **Armour is the place you can most nearly "spam one skill."** Weapons force breadth; armour does not.

### The asymmetry, stated plainly
- **Swords/warhammers** (smithing): bars **+ planks** → cross woodcutting.
- **Bows** (crafting): planks **+ silk_thread** → cross woodcutting + combat drop (spider/creeper).
- **Staves** (crafting): planks **+ magic_essence** → cross woodcutting + combat drop (wizard/mage).
- **All armour** (smithing): bars only → mining alone.

The four weapon families are well-interwoven; armour is a mono-skill sink. That is the single biggest legibility/interconnection gap in the crafting web.

---

## 2. The cross-system matrix (from real data)

Every skill in `SKILLS_DEF` (skills.js), judged on what it actually feeds. **FEEDS EQUIPMENT** = its output is a required input to a wearable/wieldable item. **DEAD-END** = trains a number but no other system consumes its output.

| System | Resources produced | Equipment connection | Progression purpose | Verdict |
|---|---|---|---|---|
| **Mining** | ore → (smithing) bars | ALL weapons (bars) + ALL armour (bars) + tools (axe/pick/rod heads) | The armour+weapon backbone | **CORE — feeds everything** |
| **Woodcutting** | logs → (crafting) planks | Sword/hammer secondaries, ALL bows & staves, tool handles, castle beams | Second backbone | **CORE — feeds everything** |
| **Smithing** | bars, weapons, armour, tools, castle goods (iron_fitting) | Direct producer of most gear | The refine+forge hub | **CORE — terminal maker** |
| **Crafting** | planks, bows, staves, jewellery, leather/cloth armour, rods, arrows, castle goods (timber_beam, keystone) | Direct producer of ranged/magic + wood tools | The other refine+make hub | **CORE — terminal maker** |
| **Fishing** | raw fish → (cooking) | Indirect: fish → cooked food → **heal + combat buff** | Sustain + buff supply | **CLOSES loop (soft) — via cooking** |
| **Cooking** | cooked food (heals + buffs) | Buffs: `damage`, `defense`, `all_xp`, `gather_speed`, `drop_rate`, `combat_xp` (items.js buff fields; wired via BUFFS_DEF + applyBuff, legacy.js:12189/12266) | HP sustain + temporary combat/gather power | **CLOSES loop (soft)** |
| **Farming** | crops → (cooking) + castle-room material costs | Indirect: crops → food buffs; crops (wheat/pumpkin/goldenroot/moonbloom) pay for Kitchen/Garden/Library rungs | Buff-food supply + homestead sink | **CLOSES loop (soft)** |
| **Combat (atk/str/def/hp)** | monster drops: pelts, thread, essence, meat, bones, boss mats | Consumes gear; **supplies** silk_thread, magic_essence, ancient_rune, dragon_scale, farm_deeds, boss mats | The consumer + the rare-material faucet | **CORE — both ends** |
| **Ranged / Magic** | — | Consume bows/staves | Combat styles | Consumer only |
| **Prayer** | — (bury bones, output:null, recipes.js:181-184) | **NONE.** Feeds only `getCombatLevel()` via `floor(p/2)` (legacy.js:1329) | Nudges combat level + total level/renown | **DEAD-END** |
| **Bounty Hunter** | bounty marks, farm_deed rolls | Marks buy auto-eat etc. (economy slice); deeds gate farm plots | Meta-currency | Out-of-slice, but note it gates Farming |

### Matrix headline
- **Four true cross-system cores:** Mining, Woodcutting, Smithing, Crafting — tightly interlocked, this is the healthy heart.
- **Three soft-closers:** Fishing → Cooking → combat/gather buffs, and Farming → Cooking, **do** close the loop — but only if the player manually eats for buffs, and only combat *style* skills consume the result. The fish/crop → cook → fight loop is real and wired (buffs apply through `applyBuff`), just quiet and easy to never notice.
- **One hard dead-end: Prayer.** Bury bones → prayer XP → a fractional combat-level bump and nothing else. No prayer-point / protection / altar-bonus mechanic exists. Bones (a universal 100%-rate drop) have exactly one use that produces nothing.

---

## 3. Dead-end inventory

Ordered by severity for the rework.

**P1 — Prayer is a whole skill that feeds nothing.** Three bury actions, `output:null`, contributes only `floor(p/2)` to combat level (which is itself largely cosmetic/matchmaking). Bones drop from nearly everything at 100% and have no other consumer. A skill-to-99 pitch with one skill that grants no capability is the loudest dead-end in the game.

**P1 — Armour is a mono-skill sink.** (See §1.) All armour = bars only. Half the equipment surface never leaves mining+smithing. This is a *design* dead-end: it removes the cross-system pull for 6 of ~10 equip slots.

**P2 — Farming's endgame crops are gated behind COMBAT, not farming.** `canPlantCrop` gates on **plot level** (farm-progression.js:74), and plot level rises only by spending `farm_deed` — which drops **only from combat** (0.1% tier-2+ kills, 0.5% bounties, farm-progression.js:125-146). Reaching plot Lv5 (goldenroot/emberfruit/moonbloom) needs cumulative **17 deeds** (costs 1+3+5+8, farm-progression.js:36-47). So a farming-focused player at Farming 88 with the *skill* for moonbloom still **cannot plant it** without grinding combat drops. The b223 fix added the crops to the tiers (they were previously unplantable at *any* plot level — the "b227 farming-crops-unplantable" class the brief names), but the deeper cross-gate remains: **farming's ceiling is bought with combat.** Legible? No. A player will hit "requires a higher plot level" with no on-screen path to a deed.

**P2 — Six recipe-scroll gated recipes were dead for ~80 builds; fixed b227, but the class is live.** The raw-meat + recipe-scroll drops were silently erased by the ESM merge (`unifyObject` per-key overwrite) until b227 moved them into `monsters.js` (legacy.js:9073-9110). The b227 comment itself flags this as a **general unswept trap**: "Any other legacy-side mutation of MONSTERS/ITEMS/CROPS that runs before main.js is equally dead." This should be swept during the rework, not assumed clean.

**P3 — Three Phase-B recipe scrolls unlock items that don't exist** (spellstone_diagram, dragon_marrow_recipe, gemcutter_note → spellstone_ring, dragonbone_spear, dragon_gem_earrings). Deliberately not dropped (legacy.js:9100-9109), so not live dead-ends — but they are authored half-content sitting in the data.

**P3 — Orphan-drop cleanup was done reactively.** b222 gave slime_gel, bone_chips, ancient_fragment, cracked_spellstone their *first* uses (castle goods, recipes.js:105-174). This was good work, but it reveals the pattern: materials get authored, then wait builds for a sink. Audit every low-tier drop for a consumer.

**Resolved / not dead-ends (verified):** the b213 "Workshop-deadlock" (tier costs demanding planks/bars before the room that makes them existed) is **fixed** — each homestead tier's new room feeds the *next* tier's cost (homestead.js:31-60), and the Forge moved to tier 2 (b226). Cooking is no longer Kitchen-gated (b225 campfire ruling). Farming crops are plantable (b223).

---

## 4. The progression map as-is (early → endgame)

```
EARLY (Lv 1–30)   Mine copper/iron → smelt bronze/iron bars → forge bronze/iron gear
                  Chop normal/oak → saw planks → carve shortbow / forge sword (+plank)
                  Fish shrimp/trout → cook → heal.   Build Homestead→Farmstead (Kitchen, Forge, Workshop).
                       │  entry points: mining, woodcutting, fishing (all req 1)
                       ▼
MID (Lv 30–60)    Steel & mithril bars → steel/mithril sets & swords (need willow/maple planks)
                  Willow/maple/yew woodcutting → planks → longbows, staves (need magic_essence from wizards)
                  Tool ladder: steel→mithril→rune axe/pick/rod accelerate gathering
                  Farming plots gated on combat-dropped deeds.  Manor→Keep property tiers.
                       │  bottleneck 1: rune_bar needs magic_essence (combat) + coal
                       ▼
LATE (Lv 60–88)   Rune → Emberforged → Dawnsteel bars (emberstone/dawnstone ore, WC 75/90)
                  Rune/ember/dawn full sets & weapons; ember/dawn tool tier (WC/mining speed +30/35%)
                  Castle-goods refine chain: planks→timber_beam→keystone; bars→iron_fitting
                  Homestead top rungs need castle goods + dragon_scale (boss drop)
                       │  bottleneck 2: top ore (emberstone/dawnstone) req WC-equivalent mining 75/90
                       ▼
ENDGAME (88–99)   Dawnsteel gear (best SOLO-earnable).
                  HUNT-FORGED KIT (recipes.js:127-178): 6 pieces above Dawnsteel, Smithing 90-99,
                  each needs a material that ONLY the clan Hunt drops (slagheart_core, abyssal_pearl,
                  choirbone, warden_seal, wyrm_gilding — raids.js:82-102; hollow_sigil also from
                  solo archmage/lich). The one gear the solo game cannot EARN — the two north-star
                  pillars (max smithing + active clan) meeting on purpose.
```

**Entry points:** Mining, Woodcutting, Fishing all open at req 1 with a visible next rung every ~15 levels (the b215 ladder closed the old cliffs). Good.

**Dependencies (the load-bearing cross-links):**
- `magic_essence` (dark_wizard .4 / warlock .55 / archmage .8) is required for **rune_bar** (recipes.js:68), staves, jewellery, and the Scriptorium room. A player who avoids combat cannot make rune bars. Strong, deliberate cross-link.
- `silk_thread` (venom_spider .3 / shadow_creeper .6) required for **every bow and rod** and cloth armour. Combat gates ranged progression.
- `dragon_scale` (Green Dragon .5, boss) required for **Castle property tier** (homestead.js:59) and several top room rungs. A boss kill gates the personal-homestead capstone.
- `farm_deed` (combat) gates **farming plot level** → gates high crops. (See §3 P2.)

**Bottlenecks:**
1. **Rune bar wall (Smithing ~75):** needs mithril_bar + magic_essence + 4 coal. Coal has no rung above `coal_rock` req 30 — every high bar eats 3-5 coal each, and coal throughput never improves. Coal is a silent grind tax on all late smithing.
2. **Top-ore gate:** emberstone (mining 75) / dawnstone (mining 90) — fine curve, but ember/dawn *bars* also each need 4-5 coal (recipes.js:70-71), compounding the coal tax.
3. **The Hunt wall:** the 6 best pieces require clan content. Correct by design, but it is a hard stop for solo players at Dawnsteel — the map genuinely *ends* at Dawnsteel unless you join a clan.

**Where it just stops:** Solo endgame terminates at Dawnsteel (tier 7). Prayer stops at "bury for XP." Cooking/farming stop at "make food nobody's forced to eat." Armour crafting stops being interesting after you realise it's bars-only.

---

## 5. Refinement-spine assessment

The brief asks: does the **player** crafting spine force refine steps (log→plank→beam), or can you skip?

**The two-stage refine is enforced and cannot be skipped:**
- **Ore → bar → item.** You cannot forge from ore; every weapon/armour recipe consumes *bars*, and bars come only from smelting (recipes.js:62-71). Genuine Stage-2.
- **Log → plank → item.** Every carve/forge that uses wood consumes *planks*, never logs; planks come only from sawing (recipes.js:135-163). Genuine Stage-2.

**Stage-3 goods exist and are real refine chains (b222/b228 castle goods):**
- `timber_beam` = 5 normal_plank + 2 oak_plank + 2 slime_gel (recipes.js:171) — Stage-3 wood.
- `iron_fitting` = 3 iron_bar + 2 copper_bar + 2 bone_chips (recipes.js:108) — Stage-3 metal.
- `keystone` = 3 timber_beam + 3 iron_fitting + 2 ancient_fragment + 1 cracked_spellstone (recipes.js:174) — **Stage-4**, combines both stage-3 goods plus rare drops.
- `field_ration` = wheat + cooked_wolf_meat + carrot (recipes.js:58) — Stage-3 food (combines a cooked good).

These feed the **homestead top room rungs** (Twin Range, Great Bellows, Scriptorium, Glasshouse, etc. — legacy.js:404-438 all cost timber_beam/keystone/iron_fitting/field_ration). So the personal pillar *does* enforce a deep refine spine at its top end.

**Assessment:** The refinement spine is the **strongest, most coherent part of the whole system.** log→plank→beam→keystone is a clean 4-deep ladder, each stage a real recipe, no skips. The "castle refuses raw materials" concept is genuinely realised on the *player* side via castle goods, even before the clan Storehouse lands. **Do not rework this; extend the same discipline to armour** (which currently skips straight bar→item with no interesting secondary).

**One gap:** the refine spine is *deep* but *narrow* — it all converges on the homestead/castle sink. The gear ladder itself only uses Stage-2 (bar/plank). No weapon or armour needs a Stage-3 good, so the beautiful beam/keystone/fitting chain never touches your character sheet. Bridging the refine spine into gear (e.g. a mid-tier weapon needing a timber_beam or fitting) would make the two best systems reinforce each other.

---

## 6. Tools ladder — coherence check

`items.js:17-31` + `184-189` define 7 tiers × 3 tools (axe/pick/rod). Best-owned auto-applies (tools.js `bestTool`), adding `toolSpeed` to the gather speed bonus (legacy.js:2535, 1668).

| Tier | Tool | Speed | Craft req (recipes.js) | Gates the ore/tree at |
|---|---|---|---|---|
| 1 | bronze | +5% | Smith/Craft 3 | copper/normal (req 1) |
| 2 | iron | +10% | 18 | iron/oak (15) |
| 3 | steel | +15% | 38 | coal/willow (30) |
| 4 | mithril | +20% | 58 | gold/maple (45) |
| 5 | rune | +25% | 78 | mithril/yew (60) |
| 6 | ember | +30% | 80/82 | emberstone/runewood (75) |
| 7 | dawn | +35% | 92/94 | dawnstone/duskwood (90) |

**Coherent and well-shaped:** monotonic +5% per tier, each tool crafted from that tier's own bar/plank, so the tool ladder *is* the material ladder (you make your rune axe from the rune bars you're already smelting). The 1.05→1.35 range is a meaningful but non-explosive accelerator.

**Two issues:**
1. **Tools accelerate but never GATE.** `toolSpeed` only speeds gathering; nothing checks that you *own* a pickaxe to mine. In OSRS a rune rock needs a rune pickaxe. Here a Mining-90 player with a bronze pick mines dawnstone at just −30% speed. Tools are a pure nice-to-have, not a gate — so the ladder is skippable and many players will ignore it. If the rework wants tools to matter, gate high rocks/trees on a minimum tool tier.
2. **The craft req slightly leads the payoff.** rune axe req 78 but rune tier ore (mithril rock) opens at mining 60 and the *next* ore (emberstone) at 75; the ember axe (req 80) can't be made until you're nearly at dawn territory. Minor, but the tool you'd most want for a rung tends to unlock a little after you've entered it.

---

## 7. Level-requirement coherence

Cross-checked recipe reqs against their material gather reqs. **Mostly coherent — the b215 generator enforces it structurally** (a tier's forge req = `mat.smith + slot.lvOff`, and the material tier's smith level tracks the ore's mining req). Spot checks:

- Steel sword: forge req **40**; needs steel_bar (smith 35, from iron ore mined at 15) + willow_plank (craft 30, willow at 30). Coherent — you can gather everything below the forge gate. ✔
- Rune bar: smelt req **75**; needs mithril_bar (smith 55) + magic_essence (combat) + coal (mine 30). The **magic_essence has no *level* gate** — a low-combat player who buys essence can smelt rune bars at Smithing 75. Fine, but worth noting the cross-gate is economic, not level-based. ✔ (intentional)
- **Contradiction found — the b223 inverted Hunt gates (already fixed, recorded here as the pattern):** generated Dawnsteel armour uses `88 + slot.lvOff` (gauntlets 89 … body 98), which had put Hunt-forged pieces *below* the Dawnsteel rung they replace. b223 re-pinned each Hunt piece one level above its rung (helm 94, body 99, etc., recipes.js:127-131). Verify no similar inversion survives elsewhere in the generated-vs-authored overlap.
- **Coal is the coherence outlier:** every late bar needs 3-5 coal but coal's only source (`coal_rock`) opens at Mining 30 and never scales. A Smithing-92 player smelting dawn bars is still mining level-30 coal. The *requirement* isn't contradictory, but the *supply curve* is flat under an exponential demand — a real bottleneck (see §4).

**Verdict:** No live level-requirement contradictions in the player crafting spine (the generator prevents drift, which is the whole reason gear-tiers.js exists). The risks are (a) the generated/authored overlap needing a re-verify each time reqs move, and (b) coal supply not being a *level* problem but a *throughput* one.

---

## 8. What works / what's confusing / what's underdeveloped

**Works (protect it):**
- The generated tier ladder (gear-tiers.js) — one table, no drift, every slot at every tier, no cliffs. Best architectural decision in the itemization system.
- The two-stage refine spine (ore→bar→item, log→plank→item) is enforced and clean.
- Castle-goods Stage-3/4 chain (beam/fitting/keystone) is a genuinely deep, well-motivated refine ladder.
- Weapon crafting genuinely forces cross-system play (mining+woodcutting+smithing+crafting+combat for staves/bows).
- The b220 derived recipe categories — new recipes self-file into the right tab, no manual tagging.

**Confusing:**
- **Armour vs weapon asymmetry** — a player learns "gear needs planks too" from swords, then finds armour ignores wood entirely. Inconsistent mental model.
- **Farming's real gate is invisible** — the crop says "Farming 88" but the wall is a combat-dropped deed and a plot level, with no on-screen path.
- **Buff food is a hidden system** — cooked food carries combat/gather buffs (items.js), fully wired, but nothing teaches the player to eat proactively; auto-eat only heals. The fish→cook→fight loop exists but is easy to play 50 hours without noticing.
- **Tools don't gate**, so their whole value is a speed % most players won't feel or seek.

**Underdeveloped:**
- **Prayer** — an entire skill with no capability payoff.
- **The refine spine never reaches gear** — beam/keystone/fitting only feed buildings, never your character.
- **Coal** — a single flat-supply chokepoint under all late smithing.
- **Jewellery/capes** — only a handful of hand-authored entries; these slots have almost no ladder (the b223 wyrmgilt_mantle is called out in-code as only the *third* cape entry ever, recipes.js:177).
- **Workers** produce raw resources only (workers.js) — a good idle seam, but they can *replace* the gathering half of the loop, weakening the cross-system pull for anyone who leans on them.

---

## 9. Top 5 highest-leverage changes (make progression interconnected and legible)

**1. Give Prayer a real payoff, or fold it in.** The single biggest dead-end. Either (a) add a prayer-point / blessing mechanic that spends bones-derived charges for combat effects (protection, damage, drop-rate — closing bones → prayer → combat), or (b) if Prayer stays passive, make its levels grant something a player can feel. Today it converts the game's most abundant drop into nothing. *Touches:* skills.js, recipes.js prayer block, combat formula. Highest leverage because it's a whole skill returning zero.

**2. Make armour cross-system like weapons are.** Add a wood/leather/thread secondary to armour recipes (the `ARMOUR_SLOTS` generator already has the shape — add a `plank`/`leather` field beside `bars`). Even 1 plank on a platebody, or leather on light armour, means 6 more equip slots stop being a mono-mining sink and start pulling woodcutting/combat. *Touches:* gear-tiers.js `ARMOUR_SLOTS` + generator. Cheap, structural, doubles the interconnection surface.

**3. Bridge the refine spine into gear.** Require a Stage-3 good (timber_beam / iron_fitting) in one or two mid-to-high gear recipes, so the game's deepest, best crafting chain actually touches your character sheet instead of only buildings. Makes the two strongest systems reinforce each other and gives beams/fittings a second demand sink. *Touches:* recipes.js / gear-tiers.js.

**4. Fix Farming's cross-gate legibility (and reconsider the combat dependency).** The farming ceiling is bought with combat deeds with no on-screen path. Minimum: surface the deed requirement on the locked crop ("needs Plot Lv5 — earn Farmer's Deeds from combat/bounties"). Better: add a *farming-earned* deed source (e.g. a rare deed from high-tier harvests) so a farmer can reach their own endgame. *Touches:* farm-progression.js, seed-picker UI.

**5. Solve coal + surface buff food.** Two smaller high-leverage fixes: (a) add a coal rung above Mining 30 (or a coal-yield scaling) so late smithing isn't taxed by flat level-30 supply; (b) teach/auto-apply combat buff food so the fish/crop→cook→fight loop is visible — either an "auto-buff" toggle beside auto-eat, or FTUE/tooltip surfacing. Both make already-built systems actually connect in play. *Touches:* gathering.js ROCKS, cooking/eat path (legacy.js eatFood/auto-eat).

---

## Appendix — key file:line references

- Material ladder & generator: `src/data/gear-tiers.js:28-194`
- Gather tables (trees/rocks/fish/crops): `src/data/gathering.js:26-85`
- Recipes (smelt/saw/forge/carve/cook/bury + castle goods): `src/data/recipes.js:19-185`
- Derived recipe categories: `src/data/recipes.js:246-347`
- Tool defs (7 tiers × 3): `src/data/items.js:17-31, 184-189`; best-tool logic `src/features/tools.js`
- Food heals/buffs: `src/data/items.js:67-196`; buff wiring `src/legacy.js:12189-12351`
- Artisan action path (consume/gate/yield/burn): `src/legacy.js:8820-9010`
- Homestead tiers, rooms-as-workbenches, room ladders: `src/features/homestead.js:28-64, 309-453`; room bonus rungs `src/legacy.js:401-438`
- Farm plot gating + growth: `src/features/farm-progression.js:36-146, 229-318`
- Workers (idle gathering): `src/features/workers.js`
- Hunt boss signature materials: `src/features/raids.js:82-102`; Hunt-forged recipes `src/data/recipes.js:127-178`
- Material drop sources: `src/data/monsters.js:5-47`
- Combat level (prayer contribution): `src/legacy.js:1326-1334`
