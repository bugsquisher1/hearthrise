# Designer rulings on the HELD demolition items (game-designer, final authority, 2026-10-14, grep-verified on 6ee379c8)
Prices, whetstone XP and the other numbers below are UNVERIFIED until a sim or vitals run.

## 1. Stonemason: CUT. Each output moves to the skill that consumes it.
- **Whetstones → Smithing.**
  - Move the 7 `grind_*` rows (`stonecraft.js:452-458`) into `RECIPES.smithing`. Keep their xp and ms.
  - New reqs and inputs:

    | Whetstone | Req | Inputs |
    |---|---|---|
    | coarse | 1 | `{copper_ore:2}` |
    | copper | 10 | `{copper_bar:1, copper_ore:5}` |
    | iron | 20 | `{iron_bar:2, iron_ore:3}` |
    | steel | 35 | `{steel_bar:2, coal:7}` |
    | mithril | 50 | `{mithril_bar:1, coal:9}` |
    | rune | 65 | `{rune_bar:1, mithril_bar:1, coal:2}` |
    | dawn | 90 | `{dawn_bar:1, rune_bar:1}` |

  - Add `{key:'whetstones',label:'Whetstones'}` to `ARTISAN_CATEGORIES.smithing`.
  - Add `if(type==='ammo') return 'whetstones'` to the smithing branch of `recipeCategory`.
  - `start-kit` coarse_whetstone 10 and the shop row `seed.coarse_whetstone` stay.
- **Rune blanks → Runecrafting.**
  - `cut_fine_blanks`: `{rune_essence:6, coal:3}`, req 38, makes 14.
  - `cut_deep_blanks`: `{fine_rune_blank:14, coal:4, magic_essence:2}`, req 74, makes 20.
- **Keystone → Crafting** as `craft_keystone`. Id, inputs, req 60 and xp unchanged.
- **Ashlar is deleted.** Replacement costs:
  - `property.manor`: ashlar 6 → `iron_fitting 6, timber_beam 6`
  - `property.keep`: ashlar 12 → `iron_fitting 12, timber_beam 12`
  - `property.castle`: ashlar 25 → `keystone 6`
- **Delete:**
  - the quarry, dress and ashlar recipe rows
  - the items `rubble, granite, basalt, dressed_block, granite_block, basalt_block, ashlar` (`items.js:925` RAW_QUARRIED, `library2-items.js:284`)
  - `skills.stonemason`, the `ARTISAN_CATEGORIES.stonemason` lanes, reveal `skill:stonemason`, route `stone`
- **ITEM_ROUTE:** remove `ashlar`; add `iron_fitting:'smith'`, `timber_beam:'craft'`, `keystone:'craft'`.
- **Spine step 13** becomes:
  - `step(13,'building_stock',[item('iron_fitting',6),item('timber_beam',6)],['skill:smithing','skill:crafting'],'make six iron fittings and six timber beams')`
  - Pointer title: "Make 6 iron fittings and 6 timber beams"
  - Why: "Stonecross Manor is framed in timber and bound in iron."
  - Parts: `level('smithing',25)`, `level('crafting',25)` and the two items
  - Opens: "Building stock in hand"

## 2. Dungeons, blueprints, keys, scrip, farm_deed: CUT all of them.
- **Blueprints:**
  - Delete the 8 `*_blueprint_t2/t3` items (`items.js:563-591`).
  - Delete the `roomRungItemGate` branch in `upgradeRoom`.
  - The 8 `hr_unlock_offers.req_item` values become null (SQL, M2).
  - Room rungs 2–3 keep their gold and material costs.
- **Keys:**
  - Delete the 6 `dungeon.*` shop offers (shops.js, around L187–227).
  - Strip every `tag:'key'` id from monster drop lists: bone_key (weak_skeleton, skeleton, zombie), goblin_seal (goblin), arcane_tome.
- **farm_deed:**
  - Delete `farm_plot.2-.5` (`shops.js:310-331`).
  - Delete the `deeds` column of `PLOT_TIER_PRICES` and `PLOT_TIERS[].cost` (`core/farm.js`).
  - Delete `BOUNTY_DEED_CHANCE`, `KILL_DEED_CHANCE` and `MIN_DEED_TIER`.
  - Delete the client mint `farm-progression.js:290` and `profile-launchpad` deedsDropped.
  - Plots become gold-only: 500 / 5k / 25k / 100k. `hr_farm_upgrade_plot` is restated gold-only (SQL, Security GO).
- **Spine step 17** becomes:
  - `step(17,'bear_hunt',[combat(45),item('bear_pelt',5)],['pane:combat'],'reach Combat 45 and bring home five bear pelts')`
  - Pointer: "Bring home 5 bear pelts"
  - Why: "Ironvale Keep needs bear pelts, and bears only face fighters of Combat 45."
  - Opens: "Pelts in hand"
- **Also delete:** reveals `pane:dungeons` and `war:dungeon`, and route `crypt`.

## 3. Castle goods and the other room-cost items: KEEP, with no new source needed.
- `timber_beam`, `iron_fitting` and `field_ration` are made by recipes. `wolf_pelt`, `rat_tail`, `small_fang`, `dragon_gem` and `ancient_rune` drop from monsters.
- Keep `tag:'castle'` and `isCastleGood`.
- Relabel the `'castle'` lanes "Building Materials" and strip only the clan Storehouse filter. Without a lane these goods fall into `uncategorized`, which breaks its test.

## 4. Gems: all gems leave the game until monetization is decided.
- `character_slot.1-.4` cost gold: 15,000 / 75,000 / 250,000 / 750,000.
- `multi-character.js:39` uses `SLOT_COSTS_GOLD`. `hr_hero_slots` is restated (SQL, Security GO).
- Delete `bank.gems` (`shops.js:73`). The bank grows only through `bankRungPrice`.
- `account_wallet.gems` drops in M2.

## 5. Chronicle: SIMPLIFY.
- Keep "Recent" (the session ring of toasts). Cut "Milestones".
- Delete the milestone hooks and reconcile.
- Remove `'chronicle'` from `RESIDUE_FIELDS` (`client-state.js:123`).
- Remove the `G.chronicle` boss read (`legacy.js:943-946`).
- The Journal's Deeds tab becomes "Recent".

## 6. Road quests that paid tools or bone_key: re-reward at the same value (SQL `hr_quest_rewards` restatement, Security GO).
`goal-catalogue.js:112-116`:

| Quest | New reward | Pointer copy |
|---|---|---|
| `road_forge` | `{iron_bar:3}` | "three iron bars, enough for your first iron fitting" |
| `road_craft` | `{oak_plank:5}` | "five oak planks for your first timber beams" |
| `road_cook` | `{lobster:3}` | "three raw lobsters, which cook at Cooking 30" |
| `road_hunt` | `{cooked_lobster:2}` | "two cooked lobsters for the climb to Combat 45" |

Gold rewards are unchanged.

## Open wall
The Keep, Castle and rung 4/5 materials (bear_pelt, dragon_scale, war_crown, dragon_gem) drop only from T3–T6 monsters, reached through the legacy tier picker, not from the 4 hunts. If single-monster fights are retired, those costs need hunting grounds first.
