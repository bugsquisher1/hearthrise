# Hearthrise — Asset Audit (May 2026, build 102)

Comprehensive review of every asset folder in the repo, scored against the
cozy-parchment theme. Goal: figure out what we can ship, what we can't, and
how to wire the survivors into the game without breaking the deploy.

---

## Theme target (for reference)

The visual language we're matching:
- Hand-painted illustrations (NOT pixel-art, NOT 3D-rendered)
- Warm earth tones — cocoa, cream, amber, copper, forest green
- Soft rounded forms with dark cocoa outlines (#3d2417)
- Slight hand-drawn imperfection
- Cinzel for display, Quicksand for body
- Wax-stamp red for primary actions

If an asset would feel out of place next to the parchment Profile sheet or the
Hearthrise crest, it's wrong for this theme.

---

## Folder map

| Folder | Size | File count | Verdict |
|---|---|---|---|
| `assets/icons/` | ~10 KB | 24 SVGs | ✅ **Ship** — these are the cocoa-line nav icons, our own work |
| `assets/brand/` | ~5 KB | 1 SVG | ✅ **Ship** — Hearthrise crest logo |
| `assets/bg/` | ~8 KB | 1 SVG | ✅ **Ship** — homestead-scene background |
| `assets/ornaments/` | ~3 KB | 2 SVGs | ✅ **Ship** — corner flourish + wax seal |
| `assets/raw-bundle/` | — | **DOES NOT EXIST** | ⚠️ Code references this directory but it's not on disk. See below. |
| `Icons/` | 286 KB | 256 PNGs + sprite sheet | ❌ **Skip** — original pixel-sprite pack, doesn't match cozy theme |
| `icons2/` | 820 KB | 121 PNGs | ❌ **Skip** — pixel-art / 3D-rendered, off-theme |
| `icons3/` | 772 MB | 8,474 PNGs | 🟡 **Cherry-pick** — gold mine, but huge. Subfolder-by-subfolder verdicts below. |
| `icons4/` | 5.3 GB | 23 files | 🟡 **Mostly skip** — 5GB of AI/EPS source. The 4 battle-background PNGs are usable. |

---

## icons3/ subfolder breakdown (the important pack)

This is the only collection with hand-painted, on-theme art. But it's 772 MB
and 8,474 files — we ship only what we use.

### ✅ KEEP — perfect for cozy theme

#### `icons3/ProfessionIcons/ResourceIcons/` (~50 PNGs)
Wood planks, copper/iron/gold/silver bars, stones, magic bars. Warm hand-painted, matches Smithing + Crafting + Mining materials exactly.

**Wire into:** material items (`normal_log`, `copper_bar`, `iron_bar`, etc.)

#### `icons3/ProfessionIcons/LootIcons/` (~80 PNGs)
Coins, claws, fruit, generic loot. Hand-painted, warm palette.

**Wire into:** drop items, gold display, monster trophies.

#### `icons3/MedievalIcons/Update/` and others (~150 PNGs)
Anvils, blacksmith tools, belts with swords, ceramic items, chess pieces.
Stunning hand-painted medieval-RPG aesthetic. Best subset of the entire collection.

**Wire into:** smithing UI, equipment slots, house decorations.

#### `icons3/WeaponIcons/WeaponIconsVol1/` and `Vol2/` (~200 PNGs)
Arrows, swords, axes, bows, daggers. Hand-painted, warm wood + steel.

**Wire into:** weapon items, weapon-style indicators (Melee/Ranged), combat icons.

#### `icons3/ArmorIcons/BasicArmor_Icons/` (~100 PNGs)
Pieces: backs, chest, gloves, boots, helms. Hand-painted, brown/gray leather + steel.

**Wire into:** armor items, paper-doll equipment slots.

#### `icons3/ArmorIcons/RingAndNeck_Icons/` (~50 PNGs)
Rings, amulets, necklaces. Gold/silver hand-painted.

**Wire into:** jewelry slots in inventory.

#### `icons3/AvatarIconsMegapack/BuildingIcons/Building_nobg/` (~30 PNGs)
Blacksmith cottage, barracks, barricades. Hand-painted homestead buildings — exactly the vibe. **The blacksmith building is on the same visual page as the Hearthrise crest.**

**Wire into:** House system (8 rooms × 5 levels) — this is huge, we currently use emojis there.

### 🟡 USE SELECTIVELY — has dark/off-theme outliers

#### `icons3/SkillsIcons/Skillicons1/Skill_nobg/` (~98 PNGs per category)
Skill icons exist BUT many have dark green/skull/horror halos baked in (e.g. ArcherSkill on a green skull background). The "_nobg" naming is misleading — they still have decorative backgrounds.

**Recommendation:** Hand-pick ~12 cleanest ones for the 9 game skills. Skip the horror-themed ones.

#### `icons3/AvatarIconsMegapack/CharacterIcons/Characters_nobg/` (~96 PNGs)
Civilian characters, soldiers, beasts, dolphins(?), cultists. Random fantasy avatars — useful but unpredictable.

**Recommendation:** Manually map 30 monsters → handpicked characters. Skip the truly off-theme ones (the dolphin, cyberpunk-looking chars). Don't auto-map.

#### `icons3/MedievalIcons/SkillsMedieval/`, `Formation/`, `TechnologiesMedieval/`
Medieval RTS-style icons (formations, banners, tech tree). Some on-theme, some clearly meant for a different game type.

**Recommendation:** Spot-check, take what fits.

### ❌ SKIP — off-theme

#### `icons3/AvatarIconsMegapack/BuildingIcons/Building_01_temple_nobg.png` and similar
Dark cult altars with cowled figures. Cool art but tonally wrong for cozy homestead game.

**Recommendation:** Reserve for a "darker dungeon" if/when we add one. Not for the main homestead/town UI.

#### `icons3/MedievalIcons/Update/ChessDesk.png`, `ChessFigure*.png`
Chess pieces. Beautiful but no game system uses chess.

#### Any `_WithBackground` variants
The `_nobg` versions are universally cleaner; the `_WithBackground` variants have themed backdrops that fight with the parchment.

---

## icons2/ — full skip

Sample render of `armor_01.png`, `melee_weapon_01.png`, `consumables/usable_item_01.png`, `book_01.png`, `key_01.png`: dark/saturated 32x32 pixel-art / detailed-rendered hybrid. Not hand-painted, not on-palette, not the right aesthetic.

**Recommendation:** Don't use. Already gitignored, leave as-is.

---

## icons4/ — mostly skip

Structure: `AI/`, `EPS/`, `PNG/`, `TXT/`. Total 5.3 GB.
- `AI/` and `EPS/` — Adobe Illustrator + EPS source files for editing. Useful for designers, not for shipping. Skip.
- `PNG/` — only 4 game backgrounds: pirate ship, 3 unknown. Detailed pixel-art-style backgrounds. Could work for **specific dungeon themes** (one obvious: pirate-themed dungeon).
- `TXT/` — license/readme files.

**Recommendation:** Pull out the 4 backgrounds, save them as low-res JPG (web-friendly), use only if/when we build matching dungeon themes. Otherwise the whole folder is too large to ship.

---

## Icons/ (capital I) — full skip

256 small PNGs (~400-800 bytes each) plus an "Icon Sheet.png" (85 KB).
Original pixel-sprite pack. Sample: `icon10.png` is a tiny pixel-art fire/flame. Too pixelated, too small, wrong style.

**Recommendation:** Delete or move to a cold-storage folder. Already used in the inline base64 sprite sheet from an earlier iteration; can drop now that we have the cozy SVG nav system.

---

## What to do about `assets/raw-bundle/`

The code in `src/legacy.js` lines 9216-9259 expects a directory tree like:
```
assets/raw-bundle/monster-rpg-256x256-icons/shadow/13.png
assets/raw-bundle/48-mineral-rpg-icons/shadow/25.png
assets/raw-bundle/earthly-loot-rpg-icon-pack/shadow/3.png
...
```

That tree **does not exist on disk**. The 92-pack curation in `assets/decisions.json` was decisioned but the physical files were never moved into the repo. So every monster + item icon currently 404s on the live deploy.

I already added a startup probe in build 102 that detects the absence and clears the icon maps so renders fall through to emoji glyphs cleanly (no 404 spam). That's a sane fallback but it's not the goal.

**Two paths forward:**

### Path A — Wire the existing icons3/ subfolders into the code (recommended, fastest)

1. Move (or copy) the cherry-picked icons3 subfolders into `assets/icons-bundle/`:
   ```
   assets/icons-bundle/resources/    ← icons3/ProfessionIcons/ResourceIcons
   assets/icons-bundle/loot/         ← icons3/ProfessionIcons/LootIcons
   assets/icons-bundle/medieval/     ← icons3/MedievalIcons/Update
   assets/icons-bundle/weapons/      ← icons3/WeaponIcons/WeaponIconsVol1
   assets/icons-bundle/armor/        ← icons3/ArmorIcons/BasicArmor_Icons
   assets/icons-bundle/jewelry/      ← icons3/ArmorIcons/RingAndNeck_Icons
   assets/icons-bundle/buildings/    ← icons3/AvatarIconsMegapack/BuildingIcons/Building_nobg
   ```
   Total ship size: maybe 8-15 MB depending on resolution. Manageable.

2. Update `BUNDLE_ITEM_ICON`, `BUNDLE_MONSTER_ICON`, `BUNDLE_SKILL_ICON` paths in `src/legacy.js` to point at the new locations.

3. Update `.gitignore` to *un-ignore* `assets/icons-bundle/` (currently `icons3/` is ignored at the top level; we'd add `!assets/icons-bundle/`).

4. Remove the runtime probe + map-clearing fallback from build 102 once the assets are confirmed deployed.

### Path B — Replace bundle paths with inline SVG (slower, smaller, scales better)

Migrate the 30-or-so monster + 60-or-so item icons into inline SVG matching our cocoa-line aesthetic. Pro: tiny payload, scales to any resolution, perfect theme consistency. Con: design work. Probably 2-3 weeks of dedicated time.

**Pragmatic call:** Do Path A now (gets monsters + items rendered properly for beta), do Path B later as a polish pass once we know which 30 monsters + which items players actually see.

---

## Quick-win shortlist for build 103

If you want immediate visible improvement on the live deploy, in priority order:

1. **House buildings** — copy `icons3/AvatarIconsMegapack/BuildingIcons/Building_nobg/` into `assets/icons-bundle/buildings/`, wire to the 8 House rooms. The blacksmith cottage alone makes the House tab look real.

2. **Material icons** — copy `icons3/ProfessionIcons/ResourceIcons/` → `assets/icons-bundle/resources/`, wire to ~20 material items (logs, planks, bars, stones). Inventory becomes instantly more readable.

3. **Weapon + armor** — copy the basic weapon/armor packs, wire to ~30 equipment items. Combat preview + paper-doll start showing real gear.

That's a half-day of asset shuffling + code path updates for a massive visual upgrade. The other 7,000+ icons can sit in `icons3/` (gitignored) until we need them.

---

## Files to delete vs keep on Tyler's local disk

You don't need to commit any of these — but you also don't need to keep them all locally.

| Folder | Action |
|---|---|
| `assets/` | **Keep** (already shipped) |
| `Icons/` | **Delete** — superseded by `assets/icons/` SVGs |
| `icons2/` | **Delete** — wrong style, low value |
| `icons3/` | **Keep on disk** — source for asset cherry-picking |
| `icons4/AI/`, `icons4/EPS/`, `icons4/TXT/` | **Move to external storage** — 5GB of source files you'll edit at most once a year |
| `icons4/PNG/` | **Keep** — 4 backgrounds, ~100 MB |

That'd shrink your local working folder from ~6 GB to ~770 MB, none of which would have shipped anyway.

---

## Decision needed from Tyler

Three things:

1. **Path A vs Path B for the icon-bundle?** I lean Path A for beta (cherry-pick icons3 → ship as PNGs), Path B for v1.0 polish (custom SVG library).

2. **Should I prepare the build-103 quick-wins now?** That's: pull buildings + resources + weapons + armor PNGs into `assets/icons-bundle/`, rewire BUNDLE paths, remove the absence-probe. About 30 minutes of work on my side; you'd review + push.

3. **Delete `Icons/` and `icons2/` from local disk?** They have zero value going forward — fully superseded by what we have.

Tell me yes / no to each and I'll get moving.
