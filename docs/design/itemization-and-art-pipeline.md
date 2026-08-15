# Itemization & Art Pipeline — Round 2 Audit and Plan

**Author:** Asset Director. **Scope:** audit + plan only — no assets moved, no
`legacy.js` edits (another agent owns that file this session). Every number
below was produced by executing real code against the real repo, not by
reading data files and inferring; the methodology (with a deliberate-fail
control for each check) is in the Appendix.

---

## TL;DR

- **400 items** in the catalogue (`src/data/items.js`, merged with the
  generated gear ladder). **149 have a wired painted icon; 251 do not.**
  Of the 149, only **81 are distinct paintings** — 91 items (61% of "covered"
  items) recycle one of 23 shared files, including cases where a **raid-boss
  unique shows the identical sprite as a mid-tier craftable.**
- The single biggest visual hole is not "251 missing icons" scattered evenly —
  it's structural: **the entire leather and cloth armour archetypes (84 items
  — every ranged and every magic character's own armour, every slot, every
  tier) have zero painted art**, because the icon fallback mapper has no
  entry for those archetypes. A ranged or magic build never sees a painted
  armour icon for itself, at any level.
- Two of the 30 "covered" monster portraits are **wrong-identity, not just
  reused**: `bear.png`/`ancient_bear.png` is a wild boar, and `dragon.png` —
  used by the game's own capstone "Green Dragon" boss — is a pale vampire
  bust. The code's own comments already admit both.
- The existing smoke suite checks that every wired icon path **looks like a
  shipped path** (regex on the string), not that **the file actually
  exists**. That gap is real — I found and verified it by execution (see
  Appendix) — and it's exactly the "assertion that passes while asserting
  nothing" pattern this repo keeps getting bitten by. I recommend closing it
  before the AI-art pipeline starts landing files.
- Section 3 gives the concrete art spec (dimensions, transparency, palette,
  naming, wiring) derived from the *actual* shipped bundle, not generic
  advice. Section 4 gives a ranked commissioning list. Section 5 gives a
  concrete data-shape recommendation for the price-extraction work.

---

## 1. Itemization inventory — what we have

**Source of truth:** `src/data/items.js` (`ITEMS`), which spreads
`GEAR_ITEMS` (generated, `src/data/gear-tiers.js`) and `WAVE3_ITEMS`
(curated uniques, `src/data/wave3-uniques.js`) first, then ~232 hand-authored
entries (materials, consumables, currencies, keys, blueprints, scrolls,
dungeon signature loot, castle goods, tools, jewelry). This is also
*mechanically* the catalogue: `tools/gen-catalogues.mjs` imports this exact
file to generate the server's `hr_items` table (400 rows, digest-verified,
`--check` is a CI preflight) — so these counts are already load-bearing, not
just descriptive.

```
Total items:                 400
  GEAR_ITEMS (generated):    154   (3 armour archetypes × 6 slots × 7 tiers = 126,
                                      + 4 weapon families × 7 tiers = 28)
  WAVE3_ITEMS (curated):      14   (14 named uniques routing ~26 orphan boss drops)
  Hand-authored (items.js):  232   (materials, food, currencies, keys, blueprints,
                                      scrolls, castle goods, tools, jewelry, dungeon loot)
```

**By type:**

| type | count |
|---|---|
| armor | 140 |
| weapon | 41 |
| tool | 30 |
| jewelry | 6 |
| ammo | 1 |
| companion | 1 |
| trophy | 3 |
| *(untyped — materials/food/currency/keys/scrolls)* | 178 |

**By equip slot:**

| slot | count | | slot | count |
|---|---|---|---|---|
| weapon | 41 | | necklace | 3 |
| body | 24 | | cape | 5 |
| pants | 23 | | ring | 3 |
| helmet | 23 | | ammo | 1 |
| gloves | 22 | | companion | 1 |
| belt | 22 | | **earrings** | **0** |
| boots | 21 | | | |

**By material tier** (the generated bronze→dawnsteel spine + a floating
"tier 8" unique/capstone band):

| tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | none |
|---|---|---|---|---|---|---|---|---|---|
| count | 23 | 24 | 26 | 23 | 27 | 28 | 25 | 7 | 217 |

### Which ladders are complete, which have real (data-level) holes

- **Weapons** (sword / warhammer / bow / staff): **complete**, all 4 families
  run the full 7 material tiers with generated stats + recipes
  (`gear-tiers.js`), no gaps.
- **Armour** (plate / leather / cloth): **complete at the data level** — all
  3 archetypes × 6 slots × 7 tiers exist with stats and a recipe
  (smithing for plate; crafting for leather/cloth). This is the ladder whose
  *art*, not data, is the problem (Section 2).
- **Ammo: a real content gap.** There is exactly **one** ammo item in the
  entire game — `iron_arrows`. A ranged build's bow climbs 7 tiers; its
  ammo never upgrades once. This caps ranged DPS scaling on one side of the
  weapon pair and, unlike armour, isn't an art problem — there is no data
  row to paint. Genuinely missing content.
- **Cape: real holes, not a full ladder.** Capes were never added to
  `ARMOUR_SLOTS`, so the 5 cape items that exist (`traveler_cape` v150,
  `warband_bulwark` tier 3/reqLv 35, `alpha_cloak` v1500 no tier,
  `chitinweave_cloak` tier 6/reqLv 76, `wyrmgilt_mantle` tier 8) leave gaps
  at tiers 1(-ish)/2/4/5/7 — a player can go from a level-35 cape straight
  to a level-76 one with nothing between.
- **Jewelry: thin.** 6 items across only 2 of the 3 jewelry-shaped slots
  (ring, necklace). **Nothing fills `earrings`** — verified by executing a
  slot-usage scan of `ITEMS`: `helmet/necklace/earrings/cape/weapon/ammo/
  ring1/body/ring2/gloves/belt/pants/boots/companion` is the full
  `EQUIP_SLOTS` list in `legacy.js`, and `earrings` has **zero** items in
  `ITEMS` targeting it. The doll almost certainly still renders an empty
  earring slot with nothing that could ever fill it.
- **Where progression actually runs out:** the generated bronze→dawnsteel
  spine covers character levels ~1–88 across every weapon and every armour
  slot. Above that sits a deliberately thin "capstone" layer — 6 Hunt-forged
  uniques (helm/body/legs/gloves/belt/cape; **boots excluded on purpose**,
  a ratified design decision, Dawnsteel Boots stay BiS), 1 Wave-3
  legendary weapon (`dragonrend_greatblade`), and 5 dungeon-boss BoP
  signature weapons gated at 35/45/65/80/95. **Ammo and jewelry have no
  capstone at all**, and cape's capstone is reached with real holes below it.
  If round 2's "finished itemization" means closing this, ammo and jewelry
  are the two lanes with the least existing content to build on.

---

## 2. Which items have art, and which don't — verified by execution

**Method (see Appendix for full detail and controls):** I extracted the
literal `applyLocalIcons()` IIFE out of `src/legacy.js` (the single source of
truth per `CLAUDE.md`) and *ran it* in a Node VM against the real, fully
merged `ITEMS` object — not a re-implementation, the actual function,
including the generated-gear fallback mapper. I then resolved every path it
produced against the real filesystem, cross-checked with a second,
independent method (grep every `assets/icons-bundle/...` literal across
`src/**` + `index.html`, diff against a real directory walk), and ran a
**case-sensitive** existence check (Windows' filesystem is case-insensitive;
GitHub Pages/Linux is not — a check that only calls `fs.existsSync` would
pass on this box and still 404 in production). All three methods agree.

```
Total items:                          400
Wired to a local painted-art path:    149   — ALL 149 verified present on disk,
                                               correct case, 0 broken (0 would-404)
No local art (icon-field fallback):   251
  icon field is a real emoji:         249
  icon field is something else:         2   (muster_seal: deliberate inline SVG;
                                               bear_claw: a stray CJK glyph '爪',
                                               not an emoji — looks like a historical typo)
```

**Control check** (so this isn't a blind assertion): the script asserts a
known-good file (`painted/gear/bronze_sword.png`) exists AND that a
fabricated nonexistent path does not, before trusting any real result. The
case-sensitivity script additionally asserts a deliberately wrong-case path
(`Bronze_Sword.png`) is correctly rejected. Both controls behaved as
expected; full output in the Appendix.

### The 149 "covered" items are mostly recycled art, not 149 paintings

```
Distinct painted files behind the 149 wired items:   81
  Items with a truly unique 1:1 painting:             58
  Items sharing 1 of 23 recycled files:                91
```

Some sharing is **deliberate and documented** (every wood-log tier shares one
sprite, CSS-tinted per tier; every plank tier likewise; a seed shows its
crop's own icon) — that's the house convention, not a gap.

The rest is an **undocumented structural fallback**, and it's severe. The
generated-gear icon mapper (`__mapGeneratedGearIcons` / `SLOT_ART`, bottom of
`legacy.js`) only defines fallback art for `helm / platebody / gauntlets /
belt / sword / warhammer / bow / staff`, using arrays as short as **one
entry** for gauntlets and belt — meaning literally *every tier, forever,*
resolves to index 0:

| shared file | item ids pointing at it | span |
|---|---|---|
| `leather_gloves.png` | 9 ids: every plate gauntlet, bronze→dawnsteel, **plus the Hunt-forged raid-boss unique `choirbone_gauntlets`** | tiers 1–8 |
| `bronze_belt.png` | 7 ids: every plate belt, bronze→dawnsteel | tiers 1–7 |
| `steel_helm.png` | 6 ids incl. the Hunt-forged unique `regent_helm` | tiers 3–8 |
| `steel_platebody.png` | 6 ids incl. the Hunt-forged unique `slagheart_platebody` | tiers 3–8 |
| `iron_warhammer.png` | 6 ids (every warhammer tier 2–7) | tiers 2–7 |
| `oak_staff.png` | 7 ids incl. the Wave-3 unique `demoncaller_staff` | tiers 2–7 |
| `longbow.png` | 7 ids incl. the Wave-3 unique `alphaheart_longbow` | tiers 2–7 |
| `rune_sword.png` | 3 ids (rune/emberforged/dawnsteel sword) | tiers 5–7 |

The practical effect: a level-99 raid-boss-exclusive **Choirbone Gauntlets**
and a level-1 **Bronze Gauntlets** render the pixel-identical image. That's
worse than "no art" — it actively undersells the game's best rewards at the
exact moment art is supposed to pay off the grind.

### The structural hole: leather and cloth armour have *zero* art, at any tier

This is the finding I'd lead with. `__mapGeneratedGearIcons` has **no
`boots`/`pants` key at all**, and (by a deliberate b282 fix, to stop a worse
bug — cloth hats being painted as steel plate helms) it explicitly refuses
to let the leather/cloth archetypes borrow the plate fallback. Net result,
verified against the live `ITEMS` object:

- **All 42 leather-armour items** (helm/body/pants/boots/gloves/belt × 7
  tiers — the ranged archetype) — **zero painted icons.**
- **All 42 cloth-armour items** (same shape — the magic archetype) —
  **zero painted icons.**
- **Plate boots and platelegs, all 7 tiers each (14 items)** — also zero,
  because those two slot keys simply don't exist in `SLOT_ART`.

A ranged or magic-focused character **never sees a single piece of painted
armour for their own build, at any level of the game.** A melee/plate
character at least sees recycled art for helm/body/hands/waist. This is the
highest-leverage fix available (Section 4).

### Consumables and tools: a clean "before/after the original curation pass" line

- The **original** 4-tier cooking ladder (`turnip_mash`, `cooked_shrimp`,
  `cooked_trout`, `cooked_lobster`, `cooked_shark`) and every base crop are
  fully painted.
- But **all four raw fish** (`shrimp`, `trout`, `lobster`, `shark`) have **no
  art** even though their cooked forms do — including `shrimp`, which is in
  every new character's starting inventory from minute one.
- The **entire b215 late-game resource/food lane (levels 55–90)** — 3 late
  crops + 3 seeds + 3 cooked dishes, 4 late fish + 4 cooked dishes, 17 items
  total — has **zero** art, raw or cooked.
- The original 5-tier gathering-tool ladder (axe/pickaxe/rod, bronze→rune)
  is fully painted; its 2-tier late extension (Emberforged/Dawnsteel) and
  the entire Wave-3 artisan-tool category (hammer/needle/knife × 3 tiers,
  9 items) have none.
- Jewelry: only the two oldest/cheapest pieces (`copper_ring`,
  `hunter_necklace`) have art; the next tier up (`gold_ring`, `gold_amulet`)
  and both Wave-3 unique jewelry pieces do not.

**Pattern:** art coverage is a snapshot frozen at whatever existed when the
CraftPix bundle was curated (b186–b217). Nearly everything added since —
b215's late-game tiers, Wave 3 uniques, castle goods, the Hunt-forged kit
(except the 6 boss *portraits*, not the *gear itself*), dungeon signature
loot, blueprints, keys, recipe scrolls — is on the fallback path. That's a
useful mental model for round 2: **"pre-b217" is covered, "post-b217" isn't,
with a handful of named exceptions from the two promotion passes (b224,
b229).**

### The render-fallback isn't as safe as the "0 emoji" rule implies

There is a proper no-emoji backstop — `itemFallbackIcon()`/`itemGlyphKey()`
in `legacy.js`, which draws a category-correct gilt medallion (sword icon
for weapons, food icon for anything that heals, bone icon for burial items,
etc.) instead of the raw emoji. It's wired into the two highest-traffic
surfaces: the main Inventory grid (`itemImg()`) and cost/requirement chips
(`_costPart()`).

**It is not wired everywhere.** Reading the other render call sites directly
(line numbers are current as of this audit), these still interpolate the
raw `def.icon` emoji character when no `_itemPath` exists: the item detail
modal (`legacy.js:6141`), the Bounty Board (`:6297`, `:5980`), several
equip-slot/loadout buttons (`:4176`, `:4303`, `:6359`, `:6391`, `:6369`),
the Market listing row (`:7011`), and combat/monster-detail portrait
fallbacks (`:7529`, `:7813`). **This was confirmed by reading the literal
render code, not by a runtime screenshot in this pass — flagged as such
(NOT runtime-verified visually).** Practically: an item with no painted art
gets a correct gilt glyph in the inventory grid, but may still show a raw
browser emoji in the item detail popup, the market, or the bounty board.
This is a pre-existing, narrow violation of the game's own "0 emoji
rendered as art" rule, not something round 2's art alone fixes — flagging
for whoever owns render-site consistency next (Systems/Art), since closing
251 art gaps makes it visible less often but doesn't close the code path.

### Monsters (context, not the primary ask, but directly bears on "judge fit")

30 of 31 monsters have a painted portrait (`mountain_troll`, tier 4, does
not). Two "covered" monsters are **wrong-identity**, confirmed visually and
already admitted in the code's own comments:

- `bear.png` (used by `bear` and `ancient_bear`) is a **wild boar** —
  tusked snout, hoofed legs, no bear features.
- `dragon.png` (used by `dragon`, the game's own capstone-flavored "Green
  Dragon" boss) is a **pale humanoid vampire-lord bust** — no draconic
  features at all.

These pass a naive "does this item have art" check but fail the fit test
this role exists to apply. Worth a companion commission alongside the item
work, even though monsters are outside "itemization" proper.

### Reverse check: shipped files nothing references, and dead map entries

Diffing every `assets/icons-bundle/...` literal in `src/**` + `index.html`
against the real directory (139 files) found **3 shipped-but-unreferenced
files**: `buildings/Building_01_temple_nobg.png`, `painted/items/seed.png`,
and `resources/Res_124_woodlog.png` (the last is literally the sprite a
b217 fix comment says the code *moved away from* — it's dead weight left
behind by that fix, never removed). Also found **6 dead entries inside
`LOCAL_ITEM_ICON` itself** mapping ids that no longer exist in `ITEMS`
(`silver_ore`, `silver_bar`, `stone`, `mushroom`, `dragon_egg`, `anvil`) —
harmless (they never fire), but free cleanup whenever `legacy.js` is next
open for other reasons. Not touched in this pass per the no-`legacy.js`-edit
rule.

### A guard gap worth closing before the AI pipeline lands files

The existing smoke suite (`src/features/smoke-test.js`) checks that every
`_itemPath`/`_monsterIcon` value **looks like** a shipped path — a regex
asserting the string starts with `assets/icons-bundle/` and doesn't
reference `raw-bundle`/`icons3`/`assets/pixel`. It does **not** check that
the file actually exists, is correctly cased, or is a valid image. That
guard would stay green even if a referenced PNG were deleted, renamed, or
had its case changed — the exact class of "assertion that passes while
asserting nothing" this codebase keeps rediscovering. I verified this by
reading the guard's own assertions (`smoke-test.js:246-397` and others) — it
is genuinely a string-shape check, not an existence check. **Recommendation
for whoever owns `smoke-test.js` next:** add one guard that walks every
value in `_itemPath`/`_monsterIcon` and asserts (a) the file exists on disk
at build time, case-sensitive, and (b) it's a real PNG/SVG. This is exactly
the script this audit already wrote (Appendix) — it just needs to become a
permanent CI check instead of a one-off audit.

---

## 3. The art pipeline — spec derived from the shipped bundle

The house style is **not one thing** — the shipped `painted/` set is
genuinely two sub-styles by surface, and new art must match whichever one
it's replacing. I judged this by opening representative files, not by
reading filenames.

### Style A — "Icon" (weapons, armour, tools, jewelry, consumables, materials)
Folders: `assets/icons-bundle/painted/gear/`, `painted/items/`.

- **Format:** PNG-24 with a real alpha channel (verified RGBA, colour type 6,
  8-bit, on every sampled file — not a flattened white/black background).
- **Canvas:** **not a fixed square.** The long edge is scaled to **128px**;
  the short edge is whatever the subject's own silhouette needs (samples
  ranged 70–128px on the short axis). There is **no explicit padding/safe
  area baked in** — the object fills its bounding box edge-to-edge on the
  long axis. Practical instruction for a generation pipeline: ask for "no
  background, no drop shadow, subject fills the frame," then let the
  pipeline itself (not the artist/model) auto-crop to content and resize the
  long edge to 128px, so a batch of AI generations with inconsistent
  self-padding doesn't produce a mismatched-density shelf.
- **Rendering:** flat/cel-shaded painterly hybrid — a thick, near-black ink
  outline (roughly 3% of the icon's width), 2–3 flat-toned shading bands
  per surface rather than a smooth photographic gradient, one crisp
  specular highlight on metal. Not photorealistic, not flat vector, not
  pixel art.
- **Palette:** warm, slightly desaturated medieval material colours —
  bronze/gold, iron blue-gray, steel silver-blue, leather browns, parchment
  cream. Matches `ASSET_MANIFEST.md`'s "Forge & Stone" direction exactly.
- **Framing:** single object, centered, a loose 3/4 top-down "loot icon"
  angle (not a flat side profile, not an isometric render). No text, no UI
  chrome, no ground/shadow plane.
- **Real display size:** these render at **38–72px** in the game (verified
  in `src/styles/legacy.css`: main Inventory grid `.item-slot` is
  `min-height:64px`; equip-doll `.inv-slot` is `min-height:44px`; the held-
  tool rail is `min-height:38px`; the item detail modal's
  `.inv-detail-icon` is an explicit `64×64px` box — the single largest
  common display size). 128px source is a clean 2× of that, which is the
  right ratio — don't over-render fine detail that dies below ~4px at
  128px (it won't survive the downscale to 44–64px).
- **Silhouette weight:** must read correctly at thumbnail size — the whole
  point of the thick outline + 2–3 tone shading convention is that it still
  reads as "sword" or "helmet" at 44px. A generated icon that only looks
  good at full size is not usable here.

### Style B — "Portrait" (monster / boss / companion / NPC busts)
Folders: `painted/monsters/`, `painted/companions/`, `painted/npc/`.

- **Format:** PNG-24, RGBA, transparent background.
- **Canvas:** fixed **256×256**, every sample without exception.
- **Framing:** head-and-bust crop, subject centered with the face/eyes
  inside the inner ~70% of the frame — several render sites place this art
  inside a **circular** medallion using `object-fit:cover` (which crops to
  fill, unlike the `contain` used for item icons), so an off-center subject
  gets clipped at the edges.
- **Rendering:** more painterly and semi-realistic than Style A — visible
  soft brush-like shading, a warm rim/backlight, still clearly "painted,"
  not photographic.
- **Reference file:** use the 36-file `painted/monsters/` set (e.g.
  `emberclad_tyrant.png`) as the primary style anchor. **Do not use the 2
  companion files (`wolf_pup.png`, `hawk.png`) as the reference** — I
  opened them and they read noticeably more photographic/realistic than the
  monster set (softer light falloff, blended fur texture vs. the monsters'
  flatter painted-illustration look). They're a known, already-logged style
  outlier (promoted from a different source pack in b229), not the house
  style — 36 files should out-vote 2.
- **Real display size:** small — a 40px gilt-bordered circle in Hunt/boss
  cards, similar sizes elsewhere. Same "must read at thumbnail" rule as
  Style A.

### Naming and wiring (no architecture change — this already works)

- **Filename = the exact game item id**, `snake_case`, e.g. `bronze_sword.png`,
  `oak_staff.png`. This is the existing, unbroken convention across all 149
  wired items — new files must match it exactly (case included; see the
  Windows/Linux case-sensitivity finding above).
- **Location:** `assets/icons-bundle/painted/gear/` for anything equippable
  (weapon/armor/jewelry/tool); `assets/icons-bundle/painted/items/` for
  consumables, materials, and drops. **No new subfolders** — the structure
  is intentionally frozen (`CLAUDE.md`, `ASSET_MANIFEST.md`).
- **Wiring a new file is one line.** Add
  `<item_id>: 'assets/icons-bundle/painted/<gear|items>/<item_id>.png',`
  to the `LOCAL_ITEM_ICON` map inside `applyLocalIcons()` (bottom of
  `src/legacy.js`). The fallback mapper already skips any id with a
  hand-mapped entry, and every render path that matters already checks
  `_itemPath` first — nothing else needs to change. (Not done in this pass —
  another agent owns `legacy.js` right now — but this is the entire
  mechanical step for whoever lands the next batch.)

### What an incoming batch should be checked for — and what's automatable

| Check | Automatable? | Notes |
|---|---|---|
| File exists at the exact wired path | **Yes** | Not currently guarded (see gap above) — the script in the Appendix does this today; promote it to a permanent CI check. |
| Case-sensitive filename match | **Yes** | Windows-blind-spot class of bug; demonstrated with a deliberate-fail control in this audit. |
| Correct format (PNG, RGBA/alpha present) | **Yes** | Read the PNG header; assert colour type 6, reject flattened opaque images that merely *claim* RGBA. |
| Correct canvas shape (128px long edge for Style A; exactly 256×256 for Style B) | **Yes** | Same header read. |
| Actually transparent (not RGBA-format-but-opaque) | **Yes** | Sample corner/edge pixel alpha; AI generators frequently ignore "transparent background" and this catches it. |
| No accidental duplicate bytes wired to two different ids | **Yes** | Content-hash every new file; flag collisions for review (some sharing is intentional — flag, don't hard-fail). |
| Style/palette/rendering fit | **No** | Needs a human eye against Section 3's reference files — same as every promotion pass in this repo's history. |
| Identity/silhouette correctness ("is this actually a dragon") | **No** | This audit's own boar/vampire findings prove file-exists checks can't catch this. Requires a human sign-off, ideally against the item's flavour text/description, not just its name. |

Recommendation: automate everything in the "Yes" rows as one CI-style guard
(a Node script identical in shape to the one in the Appendix) that runs
against a batch **before** it's wired in, and keep the "No" rows as a
mandatory Asset/Art Director visual pass before merge — the same two-tier
discipline the b224 and b229 promotion passes already used successfully.

---

## 4. Prioritized gap list

Ranked by what a player actually sees, not by catalogue order. Batches, so
Tyler can pick a cut line for whatever N the round-2 art budget supports.

### Batch 1 — first hour, ~13 icons
What a brand-new character equips, holds, or unlocks almost immediately:

1. **`shrimp` (Raw Shrimp)** — literally in every new character's starting
   bag (`START_INVENTORY`). Currently no art at all, only its cooked form
   is painted.
2. **Cloth armour, tier 1, all 6 slots** (`apprentice_helmet/body/pants/
   boots/gloves/belt`) — 6 icons. Gives every starting mage build visible
   gear for the first time, ever.
3. **Leather armour, tier 1, all 6 slots** (`leather_helmet/body/pants/
   gloves/belt` — note `leather_boots`/`leather_gloves` already have hand-
   authored art) — the remaining ~4-5 icons close the same gap for ranged
   builds.
4. **`bronze_boots` + `bronze_platelegs`** — the plate archetype's only two
   slots with *zero* fallback art at *any* tier; painting tier 1 here also
   establishes the reference the mapper can reuse for tiers 2+ the same way
   it already does for helm/body/gauntlets/belt.

Why first: this is the highest ratio of "players who see it" to "icons
painted" in the whole audit — every single new character, regardless of
combat style, is affected within their first session.

### Batch 2 — closes the structural hole, ~20-30 icons (can be staged by level)
5. **Leather + cloth armour, tiers 2–7, all 6 slots** (60 icons total if done
   exhaustively; can be sequenced by how fast players actually reach each
   tier — e.g. tiers 2–3 next, 4–7 later).
6. **Plate boots + platelegs, tiers 2–7** (12 icons) — closes the last
   plate-line hole.
7. **3 monster identity fixes**: a real dragon for the `dragon`/"Green
   Dragon" boss, a real bear for `bear`/`ancient_bear`, and a portrait for
   `mountain_troll`. Cheap (3 files), high visibility (these are boss/named
   encounters, not trash mobs).

### Batch 3 — pays off the grind at the top of the ladder, ~15-20 icons
8. **A unique painting for the top rung of every recycled weapon/armour
   group** — at minimum: `dawn_sword`/`ember_sword` (currently share
   `rune_sword.png`), `dawn_warhammer` (shares `iron_warhammer.png`),
   `regent_helm` + `slagheart_platebody` + `choirbone_gauntlets` (the
   Hunt-forged raid uniques, currently indistinguishable from mid-tier
   craftables), `alphaheart_longbow`, `demoncaller_staff`. These are the
   items players grind hardest for and are most likely to screenshot;
   recycled art undersells exactly the moment art should reward effort.

### Batch 4 — the b215 late-game lane, 17 icons
9. `goldenroot`/`emberfruit`/`moonbloom` (+ seeds, + `goldenroot_roast`/
   `ember_tart`/`moonbloom_elixir`) and `herring`/`frostfin`/`swordfish`/
   `moonfish` (+ cooked forms) — the entire levels-55–90 farming/fishing/
   cooking lane, currently 100% unpainted top to bottom.

### Batch 5 — tools, 15 icons
10. `ember_axe`/`dawn_axe`/`ember_pickaxe`/`dawn_pickaxe`/`duskwood_rod`/
    `dawnsteel_rod` (the late gathering-tool extension) + the 9 Wave-3
    artisan tools (hammer/needle/knife × 3 tiers).

### Lowest priority — currency/key/blueprint/scroll/boss-material items
These already render an on-brand gilt category glyph via `itemGlyphKey()`
in the primary Inventory view (a scroll icon for recipe scrolls, a key icon
for dungeon keys, etc.), so the marginal value of bespoke art is lowest.
Only worth commissioning after the batches above.

---

## 5. Price data — a recommendation for the extraction, made now while it's cheap

I don't own pricing (Game Designer/Systems do), but the *shape* of item data
is squarely my domain, so here's what I found and what I'd recommend before
the extraction locks in a shape.

**What's actually hardcoded where, verified by grep, not by the ~96/100
figure alone:**
- `ITEMS[id].v` (book value) — already clean, single-sourced data in
  `items.js`, already flows into the server via `gen-catalogues.mjs` →
  `hr_items.value`. **No extraction needed here — this part is done.**
- Separately, **several small shop tables live only in `legacy.js` as plain
  array literals**, not in `src/data/*`, and each uses a *different* shape
  for the same concept ("how much does this cost"):
  - `EQUIP_SHOP` (20 rows): `{id, cost:<number, implicitly gold>}`
  - `SEED_SHOP` (9 rows): `{id, qty, cost:<number>}`
  - `BOUNTY_SHOP` (5 rows): `{id, cost:<number>, currency:'marks' via a
    separate flag}`
  - `HOUSE_THEMES` (6 rows): `{id, price:<number>, currency:'gem'}` — note
    `price`, not `cost`, for the same concept
  - Room/plot upgrade costs (`ROOMS`, ~10 entries): `cost:{gold, <material>}`
    — an *object*, not a number, because these are multi-currency
  - `IAP_CATALOG` (~9 rows): `price:'$6.99'` — a **string**, real-money
  - Plus a scattering of one-off `cost:`/`price:` literals (traits, cosmetics)

That's the real "~96 hardcoded price entries" — not `item.v`, but this set
of shop-offer tables, each with its own ad hoc field name and shape.

**Recommendation, before extraction locks a shape in:**

1. **Keep `ITEMS[id].v` exactly as-is** as the single "book value" — it's
   already the sell-back anchor, market baseline, and castle-CP input, and
   it's already server-catalogued. Don't conflate it with a shop's buy
   price; the existing gap between `bronze_sword.v` (50) and
   `EQUIP_SHOP`'s buy cost for it (100) is a deliberate, healthy buy/sell
   spread — extraction should preserve that as **two distinct facts**, not
   collapse them into one number.
2. **Normalize every shop-offer table to one shape** before or during
   extraction: `{ id, itemId, qty, cost: [{ currency, amount }], ... }`.
   An array for `cost` (not a single `{currency, amount}` object) because
   room/plot upgrades are already genuinely multi-currency (gold + a
   material) — model that from day one instead of bolting it on as a
   special case later.
3. **Move the tables into `src/data/shops.js`** (one file, several named
   exports — `EQUIP_SHOP`, `SEED_SHOP`, `BOUNTY_SHOP`, `HOUSE_THEMES`,
   `ROOM_COSTS`), the same pattern `gear-tiers.js`/`items.js` already use.
   This is the smallest possible change: `tools/gen-catalogues.mjs` already
   knows how to turn a data array into a generated, digest-verified
   Postgres catalogue (it does exactly this for `hr_items`/`hr_activities`
   today) — extending that generator to also emit `hr_shop_offers` from the
   new file is mechanical, not a new pattern.
4. **New items should default to generated pricing, not hand-typed
   numbers.** `MATERIAL_TIERS[i].value` in `gear-tiers.js` already defines a
   value-multiplier curve (0.6 → 360 across 7 tiers) that every generated
   item's `v` derives from. Any new tiered item added for round 2 should
   plug into that same curve rather than getting a hand-guessed price —
   consistent with `docs/SYSTEMS_MAP.md`'s "grow by adding data, not code."
   Reserve hand-typed `v`/`cost` values for genuinely unique/boss items, as
   is already the convention.
5. **Add one guard**, mirroring the existing reachability guard: every
   `itemId` referenced by a shop-offer row must exist in `ITEMS` (this is
   already implicitly true today because nothing checks it — a typo'd id in
   `EQUIP_SHOP` would silently sell nothing rather than fail loudly).

---

## Appendix — methodology and full verification log

**Everything below was executed, not inferred.** Scripts were run from the
repo root against the live filesystem; the disk state was **not** modified.

### A. Icon-path resolution (Section 2's core numbers)

Extracted the literal `applyLocalIcons()` IIFE (offsets 811987–833220 of
`src/legacy.js`, 21,233 chars) and ran it in a `node:vm` sandbox against the
real, fully-merged `ITEMS` object (imported from `src/data/items.js`, which
itself already spreads `GEAR_ITEMS` + `WAVE3_ITEMS` — identical to what the
browser has after `main.js`'s merge completes). This is the actual
production function, not a re-implementation.

```
[icons-bundle b103] applied: 155 items, 6 rooms, 3 plot buildings
=== TOTALS ===
total items: 400
has a wired local-art path: 149
  of those, file VERIFIED on disk: 149
  of those, file MISSING on disk (would 404): 0
no local-art path (emoji/icon fallback): 251
  of those, icon looks like an emoji: 249
  of those, icon is something else (html/text/empty): 2

=== CONTROL CHECK (would fail if this script were blind) ===
control path exists (must be false): false
known-good bronze_sword.png exists (must be true): true
```

### B. Reverse check — referenced vs. shipped files

Grepped every `assets/icons-bundle/...(png|jpg|jpeg|svg|webp)` literal
across `src/**/*.{js,css,html}` + `index.html` (136 distinct paths),
diffed against a real directory walk of `assets/icons-bundle/` (139 files):

```
files on disk: 139
distinct paths referenced in src/**+index.html: 136
REFERENCED BUT MISSING ON DISK (would 404): 0
ON DISK BUT REFERENCED BY NOTHING:
  assets/icons-bundle/buildings/Building_01_temple_nobg.png
  assets/icons-bundle/painted/items/seed.png
  assets/icons-bundle/resources/Res_124_woodlog.png
```

### C. Case-sensitivity control

Windows' `fs.existsSync` is case-insensitive; GitHub Pages (Linux) is not.
Walked real directory entries and case-sensitively matched every segment of
every one of the 86 distinct wired item-art paths:

```
checked 86 distinct item-art paths, case-sensitive mismatches: 0
control (deliberately wrong case) ok= false (must be false): case mismatch:
  wired "Bronze_Sword.png" vs disk "bronze_sword.png"
control (correct case) ok= true (must be true)
```

### D. PNG format sampling (Section 3's spec)

Read the PNG IHDR chunk directly (no library) for 21 representative files
across every category. All sampled files: 8-bit, colour type 6 (RGBA).
Style A (`painted/gear/`, `painted/items/`) samples ranged 70–128px on the
short axis with 128px on the long axis; Style B (`painted/monsters/`,
`painted/companions/`, `painted/npc/`, `resources/`, `buildings/`,
`medieval/`) were all exactly 256×256.

### E. Visual inspection

Opened and visually judged: `bronze_sword.png`, `steel_platebody.png`,
`iron_helm.png` (Style A samples); `dragon.png`, `slime.png`,
`emberclad_tyrant.png`, `wolf.png`, `bear.png` (Style B / monster samples);
`wolf_pup.png`, `player.png` (companion/NPC samples). This is what
surfaced the `dragon.png` = vampire and `bear.png` = boar mismatches, and
the companion-portrait style deviation from the monster-portrait set.

### F. Monster coverage

Same VM-execution method applied to `_monsterIcon`:

```
total monsters: 31
with painted portrait: 30
without (emoji/glyph fallback): 1  (mountain_troll)
monster icon files missing on disk: 0
```

### G. What was NOT verified at runtime

- The "raw emoji still renders in several other panels" finding (Section 2)
  is sourced from reading the literal render code with line numbers, not
  from a live browser screenshot — the account-gate's test-harness bypass
  requires a pre-navigation init script (Playwright's `addInitScript`),
  which the tools available in this session can't set before first paint.
  Flagged explicitly as NOT runtime-screenshotted; the code citations are
  exact and load-bearing (`legacy.js:6141`, `:6297`, `:5980`, `:4176`,
  `:4303`, `:6359`, `:6391`, `:6369`, `:7011`, `:7529`, `:7813`).
- No live `read_network_requests` walk was performed against a running
  preview in this pass, since no asset was moved/added/renamed — there is
  nothing new for a runtime 404 check to catch that the on-disk + case-
  sensitive checks above don't already cover. If this changes (a future
  agent lands new art), that pass should still include the standard
  0-404/console-clean walk per the Asset Director's own standing practice.

### H. Files touched this session

**None.** No asset moved, renamed, added, or deleted. `src/legacy.js` was
read only, never edited (per the task's explicit rule — another agent owns
it this session). The only file written is this document. All scripts used
for verification were run from the scratchpad directory and are not part of
the repo.
