# Hearthrise — Asset Manifest

_Last updated: 2026-08-08 (asset-organization pass, build b216)._

The single reference for how Hearthrise's shipped assets are organized, what the
art direction is, and where everything that isn't shipped went. Supersedes the
old exploratory `ASSET_AUDIT.md` (May 2026), which described a plan that has
since been executed.

---

## Art direction (what "fits Hearthrise")

Hearthrise is **100% painted RPG icons** in the CraftPix house style, framed by a
moody **"Forge & Stone"** dark UI (hearthlight theme: desaturated stone/iron
darks, candlelight warmth, gilt chrome). Verified against the running game:
homestead, skills, combat, inventory, equipment doll, farm, house.

An asset **fits** if it is:
- Hand-**painted** (not pixel-art, not flat vector, not 3D render),
- Warm/desaturated medieval palette with soft painterly rendering,
- Consistent lighting and outline weight with the shipped `painted/` sets.

An asset is **wrong** if it is pixel-art, a different rendering style, or from an
unrelated pack that would break cohesion. Gear tiers are conveyed by **rarity
borders**, not sprite recolors (bronze=gray … mythic=deep-red); shared material
sprites (e.g. one log for five wood tiers) are **hue-tinted** in CSS, not faked
as separate art.

---

## Active asset structure (`assets/` — this is what ships)

Only files actually referenced by the game live here. The tree was left in its
existing shape on purpose: `assets/icons-bundle/` is the single deployed icon
root, and its paths are hard-wired in ~360 places in `src/legacy.js` plus the
smoke test — renaming folders would break references for zero visual gain.

```
assets/
├── brand/            hearthrise-logo.svg              — crest / favicon
├── bg/               homestead-scene.svg              — brand scene art
├── ornaments/        corner-flourish.svg, wax-seal.svg — UI frame flourishes
├── icons/            24 SVG nav/topbar glyphs          — our own cocoa-line set
└── icons-bundle/     ← the only deployed icon root
    ├── painted/
    │   ├── monsters/ 30 enemy portraits (rat … dragon, lich, death_knight)
    │   ├── items/    30 resource/food/drop icons (ores absent → resources/)
    │   ├── gear/     35 weapon/armour/tool/jewelry icons
    │   └── npc/      player.png
    ├── resources/    19 material icons (bars, logs, stones, mushroom, egg)
    ├── buildings/    10 homestead/room/plot structures (forge, farm, tower…)
    ├── medieval/     BlacksmithInstruments.png (anvil)
    └── backgrounds/  dungeon.jpg (combat/dungeon backdrop)
```

**How icons are wired:** every game item/monster/room ID maps to a path in the
`LOCAL_*_ICON` maps inside `applyLocalIcons()` at the bottom of `src/legacy.js`.
That IIFE is the single source of truth. Generated tier gear is mapped to the
closest owned slot art by `window.__mapGeneratedGearIcons()`. Nav/topbar SVGs are
applied by `src/icon-swap.js` (map keyed by `data-tab`).

### Naming
Existing conventions were preserved (renaming would break the wired paths):
- Painted sets use game-ID `snake_case` (`death_knight.png`, `iron_sword.png`).
- The `resources/` pack keeps its vendor `Res_NN_name.png` names — these are
  referenced verbatim in code, so they were intentionally **not** renamed.
- Buildings keep their `Building_NN_role_nobg.png` pack names, likewise wired.

---

## Quarantine (`_archive/` — recoverable, never ships, gitignored)

Nothing was deleted. Everything questionable was moved here. See
[`_archive/README.md`](_archive/README.md).

| Location | Count | Tier | Notes |
|---|---|---|---|
| `_archive/reserve-art/resources/` | 150 | 2 — compatible reserve | painted materials/food/potions/gems for future content |
| `_archive/reserve-art/buildings/` | 47 | 2 — compatible reserve | painted structures for future homestead/property tiers |
| `_archive/reserve-art/monsters/` | 31 | 2–3 — superseded | the OLD painted monster portraits, replaced by `painted/monsters/` |
| `_archive/reserve-art/medieval/` | 29 | 3 — possibly useful | props/tools; a few no-game-use (chess, toy, steering wheel) |
| `_archive/reserve-art/backgrounds/` | 1 | 2 — compatible reserve | `ruins.jpg` alt backdrop |
| `_archive/pixel-packs/` | 526 | 4 — off-style | abandoned pixel-art packs + `.psd` sources (was `assets/pixel/`) |
| `_archive/asset-tooling/` | 10 | n/a — not art | icon-curation HTML/JSON/TXT dev tools |

---

## Audit summary

| Metric | Count |
|---|---|
| Files audited under `assets/` (start) | 949 |
| **Currently used (kept active)** | **150** |
| Kept active but unreferenced (our own brand/UI SVGs, intentionally kept) | 5 |
| Unused-but-compatible → reserve (`_archive/reserve-art/`) | 258 |
| Off-style pixel packs → archive (`_archive/pixel-packs/`) | 526 |
| Dev tooling → archive (`_archive/asset-tooling/`) | 10 |
| Duplicates found | 5 groups (intentional — one painting shared by several game IDs; left as-is) |
| Files renamed | 0 (renaming would break wired paths) |
| Permanently deleted | 0 |

**Deploy impact:** `assets/` went from 949 files to 155; the ~256 unreferenced
painted icons and ~628 KB of tooling JSON no longer ship, with everything
recoverable from `_archive/`.

### Duplicate note
Five byte-identical groups exist in `painted/gear` and `painted/monsters`
(all fishing rods share one rod painting; wolves/bears share a portrait;
several pickaxes share art). These are **deliberate** — each game ID needs its
own wired path even when the art is shared — so they were not deduplicated.

---

## Uncertain / future review
- `reserve-art/medieval/` holds a few painted-but-purposeless props (chess set,
  toy, steering wheel, drums). Cohesive art, but no game system uses them —
  revisit if a matching feature ships, otherwise they can be dropped later.
- `reserve-art/monsters/` is the previous monster portrait set. It's fully
  superseded by `painted/monsters/`; keep until certain no content needs the old
  variants (e.g. the human `Warrior`/`Duke`/`ElfMage` portraits could become NPCs).

---

## Verification (this pass)
- Smoke suite: **170/170 green**, 0 runtime errors.
- Headless load of every major screen (home, character, skills, combat,
  inventory, farm, house, market, dungeons, bounty, social, stable, shop):
  **0 failed/404 requests**.
- Pixel-diff before/after: only the animated status ticker and dynamic
  content differ (≤0.3%); no asset region changed; all painted portraits,
  gear, materials, buildings, and backgrounds render intact.
