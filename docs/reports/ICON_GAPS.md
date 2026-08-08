# Hearthrise — Icon Asset Gaps

Status as of: May 2026 icon audit pass.

I walked the 92 asset packs in `assets/raw-bundle/` against every game item, skill, and monster. Most categories are now well-mapped, but the following gaps remain — items currently rendering with **placeholder** icons that will read poorly in the inventory grid. Each gap is sized so a typical 48-icon Itch.io pack would cover it.

> All placeholder mappings are tagged `/* PLACEHOLDER */` or `/* THEME-MISMATCH */` in `src/legacy.js` so they're easy to find and replace once the real assets land.

## Priority 1 — Logs & Planks (10 items)

The single most visible gap. None of the 92 packs contain felled-tree, wood-grain, or sawn-plank visuals. The previous mapping pointed into the mining-tool pack, so trees were rendering as horseshoes, snail spirals, and golden keys. I've moved them to `earthly-loot-rpg-icon-pack` which has wood-textured pebbles — better than the mining set but still not actually logs.

**Items affected:**
- `normal_log`, `oak_log`, `willow_log`, `maple_log`, `yew_log`
- `normal_plank`, `oak_plank`, `willow_plank`, `maple_plank`, `yew_plank`

**Search terms:**
- "log icons rpg"
- "lumber icons"
- "wood material pack"
- "stacked logs"

**Recommended budget:** $5–10 for one pack.

## Priority 2 — Skeleton / Skeletal Undead (4 monsters)

The current `monster-rpg-256x256-icons` pack contains **zero skeleton-shaped creatures**. It has wraiths, ghosts, mushroom-spirits, and pumpkin-knights, but nothing recognizable as bone-walking undead. I've routed skeletons to ghosts and a pumpkin-knight as substitutes — the gameplay reads "Undead" but the visual is wrong.

**Monsters affected:**
- `weak_skeleton` — currently using ghost (`shadow/37.png`)
- `skeleton` — currently using green spirit (`shadow/32.png`)
- `death_knight` — currently using pumpkin-knight (`shadow/14.png`)
- `lich` — currently using mushroom-spirit (`shadow/31.png`)

**Search terms:**
- "rpg skeleton enemies"
- "undead monster icons"
- "boss skeleton pack"
- "skeletal warrior set"

**Recommended budget:** $8–15 for a 24- or 48-icon pack.

## Priority 3 — Big Cats & Wolves (3 monsters)

`monster-rpg-256x256-icons` has one bear and one generic "brown beast" — that's it for mammals. Multiple Hearthrise monsters need this niche.

**Monsters affected:**
- `dire_wolf` — currently using gray boar (`shadow/28.png`) /* THEME-MISMATCH */
- `panther` — currently using brown beast (`shadow/16.png`) /* THEME-MISMATCH, no panther */
- `ancient_bear` — currently using pink mushroom (`shadow/8.png`) /* THEME-MISMATCH, was forced to share with `bear` */

**Search terms:**
- "wolf rpg icons"
- "panther beast pack"
- "feline monster set"

**Recommended budget:** $5–10.

## Priority 4 — War King variation (1 monster)

`war_king` is currently forced to share an icon with `hobgoblin` (both at `shadow/4.png`). Any "armored boss" or "king monster" icon would resolve this.

**Search terms:**
- "rpg boss icons"
- "monster king pack"

**Recommended budget:** Probably included in any pack from Priority 2 or 3.

## Priority 5 — Polish: dedicated key pack (6 items, optional)

The dungeon keys (`bone_key`, `goblin_seal`, `arcane_tome`, `obsidian_sigil`, `void_fragment`, `dragonsbane_key`) are functional with the current mapping (two literal keys from the mining pack and four artifact icons), but a dedicated "fantasy keys" pack would let each dungeon have a distinct, themed key.

**Search terms:**
- "fantasy key icons"
- "rpg key set"
- "dungeon key pack"

**Recommended budget:** $3–5 — these are a polish pass, not a launch blocker.

## Total budget recommendation

**$25–40 on Itch.io** would close every gap above. Order of impact:

1. Logs/planks pack — highest ROI, every Activities player sees these every minute.
2. Skeleton pack — closes the four worst visual mismatches in combat.
3. Big-cat / wolf pack — fixes three more combat mismatches.
4. Key pack — pure polish.

## What's already well-mapped

For reference, these categories are in good shape and don't need new assets:

- All 6 armor pieces (helmet, body, gloves, belt, cape, boots)
- All 8 weapon types (sword, dagger, mace, hammer, axe, lance, staff, bow)
- All 6 ores + 6 bars (mineral pack has 48 distinct crystal/ore icons)
- All 7 fish (fishing pack)
- All 6 crops + 6 seeds (vegetable + berries-and-seeds packs)
- All 8 housing blueprints (magic-book pack — 48 distinct tome icons)
- All cooked food (medieval-food pack — 50 plated dishes)
- All recipe scrolls (scroll pack — 48 variations)
- All raid currencies (dragon-loot, magic-artifact, achievement packs)
- 24 of 30 monsters (mushrooms, frogs, spiders, demons, dragons all good)
- All 14 skills

## Where the audit lives

- Audit contact sheet: `assets/icon-audit.html` (loads every relevant pack in a single grid for visual comparison — open it in the browser and ctrl-F to find specific items)
- Icon mappings: `src/legacy.js` lines ~8946 onwards (`BUNDLE_SKILL_ICON`, `BUNDLE_ITEM_ICON`, `BUNDLE_MONSTER_ICON`)
- The `BUNDLE_ICON_GAPS` comment block at the bottom of `BUNDLE_MONSTER_ICON` repeats the priority list above for in-code reference.
