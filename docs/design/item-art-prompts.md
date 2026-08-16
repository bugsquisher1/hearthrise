> **ENCHANT-NEUTRALITY RULE (Tyler + Coordinator, 2026-08-16).** Base weapon and ammo icons
> must stay ELEMENT-NEUTRAL: no red/ember tips, no frost-blue edges, no sickly-green venom
> accents on unenchanted gear. Enchanted states render as a RUNTIME OVERLAY (element glow +
> corner pip, theme tokens — zero per-variant art), so a warm accent baked into a base arrow
> would read as a false "ember-enchanted" signal. Named unique enchanted items (the phase-two
> elements/enchanting set) are the exception: their element IS their identity and gets baked
> into dedicated icons using the two-signal colour language. The Hearthfire wrapper's warm
> grip/trim accents are fine — the ban is on element-hue effects at the business end
> (tips, blades, fletching, arrowheads).

# Item Art Prompts — the full catalogue, ready to generate

**Author:** Art Director · **Date:** 2026-08-16 · **Status:** production input, not a design doc.
**Serves:** Tyler, 2026-08-16 — *"I want to move in a different direction and have that AI bot do all of
the items tonight."*

**Scope:** one AI-image-prompt-ready subject line for **every one of the 426 live items** in
`src/data/items.js` (walked by execution, not by reading — see §5), plus **86 lines** covering the
approved new items in `docs/design/review-book-content.md` Library 2 (every ITEM-NEW survivor, expanded
where a candidate is a set or a tier ladder, and every ITEM-PLAN group whose members are actually
nameable from the specs). **512 subject lines total.**

---

## 0 · How to use this file

Every line below is **the SUBJECT clause only**. It carries no style language at all — that is
deliberate, so the art direction can be swapped without rewriting 512 lines. Wrap it:

```
<STYLE PREFIX — ITEMS>  +  <the subject line for this item>  +  <STYLE SUFFIX>
```

**RATIFIED 2026-08-16 — the lane is HEARTHFIRE and the production wrapper is
[`art-direction-picker.md` §0](./art-direction-picker.md).** Assemble every item prompt as

```
P-ITEM or P-WEAPON (picker §0.3/§0.4)  +  the subject line below
   +  C-METAL if the object is metal (§0.6)  +  C-ENCHANT if it is a weapon, ammo or tool (§0.7)
   +  SUFFIX (§0.9)
```

Use the **ITEMS** prefix for everything except weapons, ammo, staves, bows and the gathering tools,
which take the weapon prefix's fixed orientation. Do not mix lanes across a batch — the whole value of
a single direction is that 426 icons sit on one shelf and look like one game.

**Every prompt must assemble to ≤ 1000 characters** — Recraft's hard API cap, found by execution
(picker §0.2). The longest subject line in this file is 200 characters (`iron_ore`) and the worst
assembled item prompt is 929; `tools/gen-art.mjs` refuses to run if that ever stops being true.
**If you lengthen a subject line, re-run the dry run.**

**Two wrapper rules changed the subject lines in this file and you should know why before editing one.**
1. **ONE OVERSIZED SPECIMEN** (§0.3). Every "a handful of…", "a pile of…", "a heap of…", "a stack of…",
   "a bundle of…" and every "…on a wooden board" was rewritten to a single large object. The pilot's
   `cooked_shrimp` proved it: five small shrimp on a chopping board reads, at the 34 px shop row, as a
   board. **38 lines were affected.**
2. **MATERIAL HONESTY** (§0.9). The warm palette belongs to the light, never to the object's own
   material. The pilot's `iron_ore` — specced as grey rock with rust streaks — came back polychrome red
   and violet (38% of its opaque pixels warm-dominant, against 16% for the correctly-cold `iron_sword`).
   The wrapper now pins this for the whole batch, and the neutral-material lines below say it again
   locally, because those are the lines with no legitimate colour of their own for the palette to land
   on.

### Output spec (hard requirements — checked before wiring)

Derived from the live pipeline and **measured in-browser**, not assumed. Method and two corrections to
older docs are in §5.

| Property | Value |
|---|---|
| Format | PNG-24, RGBA, **real alpha** (colour type 6). An RGBA file with an opaque white background fails. |
| Canvas | **Long edge exactly 128 px; short edge is whatever the silhouette needs.** Square is fine but not required. |
| Alpha crop | Auto-crop to content, then scale the long edge to 128 px. **Do not** bake in padding — inconsistent self-padding across a batch is what produces a mismatched-density shelf. |
| Transparency | Every corner and edge pixel must be alpha 0. No cast shadow, no contact shadow, no ground plane, no vignette. |
| Filename | the item's **game id**, `snake_case`, e.g. `bronze_sword.png`. Case-exact — Windows is case-blind, the Linux host that serves the game is not. |
| Location | `assets/icons-bundle/painted/gear/` for anything equippable (weapon / armor / jewelry / ammo / tool / companion); `assets/icons-bundle/painted/items/` for everything else (materials, food, currencies, keys, blueprints, scrolls, trophies). **No new subfolders.** |
| Wiring | one line per file in `LOCAL_ITEM_ICON` inside `applyLocalIcons()` at the bottom of `src/legacy.js`: `<item_id>: 'assets/icons-bundle/painted/<gear\|items>/<item_id>.png',` |

**Why 128 px long-edge and not 256.** The largest an item icon is ever displayed in this game is
**64 × 64** (the item detail modal). Every other surface is smaller — down to a 15 px cost chip. 128 px
is a clean 2×, which is the correct ratio; 256 px would be paying for resolution no player can see and
would double the batch's disk footprint for nothing. **Item icons are `object-fit: contain` at every
render site measured**, so a non-square icon letterboxes safely and is never cropped. (Monsters are the
opposite case — square, 256 px, because two of their surfaces use `cover`. See `monster-art-prompts.md`.)

**What the prompt cannot enforce, so a human must check it:** *identity* (this repo has shipped a boar
named `bear.png` and a vampire named `dragon.png`) and *style fit*. Everything else — alpha, canvas,
case-correct filename, duplicate-byte detection — is automatable and should be.

---

## 1 · Shared material vocabulary — the thing that makes a set look like a set

**Use these words verbatim.** The catalogue is built from ladders: 7 tiers × 6 slots × 3 armour classes,
4 weapon families × 7 tiers, 5 tool ladders. If the tier-4 helmet and the tier-4 gauntlets are described
in different words, they will not look like a set, and no amount of style consistency will rescue that.
Every subject line below already uses this table; keep it if you edit them.

**Metal ladder** (plate armour, swords, warhammers, bars, most tools)

| T | Material | Words to use |
|---|---|---|
| 1 | Bronze | ruddy cast bronze, soft warm metal, slightly pitted |
| 2 | Iron | plain dark grey iron, honest and unadorned, faint rust at the edges |
| 3 | Steel | bright tempered steel, clean bevels, a hard mirror edge |
| 4 | Mithril | pale blue-silver metal, unnaturally light, fine seams |
| 5 | Rune | deep silvered metal with etched runes glowing faintly along the surface |
| 6 | Emberforged | dark heat-blued plate with glowing molten seams running through it |
| 7 | Dawnsteel | near-white radiant steel with warm gold inlay, flawless |
| 8 | Hunt-forged | (uniques — no shared material; each is described individually) |

**Hide ladder** (leather armour — the ranged class)

| T | Material | Words to use |
|---|---|---|
| 1 | Leather | plain tanned tan leather, simple stitching |
| 2 | Studded | dark brown leather set with rows of iron studs |
| 3 | Boarhide | coarse ochre boarhide with bristles still in it |
| 4 | Snakeskin | green scaled snakeskin with a fine repeating pattern |
| 5 | Wyvernhide | slate blue-grey wyvern scale, overlapping and hard |
| 6 | Dragonhide | deep oxblood-red dragon scale, thick and glossy |
| 7 | Voidhide | black scale with a faint violet sheen in the highlights |

**Cloth ladder** (cloth armour — the magic class)

| T | Material | Words to use |
|---|---|---|
| 1 | Apprentice | undyed coarse linen, plain and cheap |
| 2 | Adept | blue-grey wool with simple braid trim |
| 3 | Scholar | deep green cloth with brass fittings |
| 4 | Warlock | dark purple cloth with black leather bindings |
| 5 | Sorcerer | midnight blue cloth with silver embroidery |
| 6 | Archmage | white and gold cloth set with small gems |
| 7 | Voidweave | black cloth woven with starless violet thread |

**Wood ladder** (bows, staves, rods, planks, logs)

| T | Material | Words to use |
|---|---|---|
| 1 | plain / apprentice | pale untreated softwood, roughly finished |
| 2 | oak / longbow stock | warm brown oak, close-grained |
| 3 | willow | pale supple willow, slightly greenish |
| 4 | maple | golden-honey maple with a rippled figure |
| 5 | yew | red-brown yew with a cream sapwood stripe |
| 6 | runewood | dark timber with glowing rune-veins running through the grain |
| 7 | duskwood | near-black wood with a cold silver sheen along the grain |

---

## 2 · LIVE ITEMS (426) — `src/data/items.js`

### 2.1 Plate armour — the melee class (42)

| id | Name | Subject line | File |
|---|---|---|---|
| bronze_helm | Bronze Helm | a ruddy cast-bronze full helm with a simple nose guard and slightly pitted soft warm metal | `bronze_helm.png` |
| iron_helm | Iron Helm | a plain dark grey iron full helm, unadorned, with faint rust along the rim | `iron_helm.png` |
| steel_helm | Steel Helm | a bright tempered steel full helm with clean bevels and a hard mirror edge on the brow | `steel_helm.png` |
| mithril_helm | Mithril Helm | a pale blue-silver mithril helm, unnaturally light, with fine seams over the crown | `mithril_helm.png` |
| rune_helm | Rune Helm | a deep silvered rune helm with etched runes glowing faintly across the brow and cheek plates | `rune_helm.png` |
| ember_helm | Emberforged Helm | a dark heat-blued plate helm with glowing molten seams running down the faceplate | `ember_helm.png` |
| dawn_helm | Dawnsteel Helm | a near-white radiant steel helm with warm gold inlay around the visor, flawless | `dawn_helm.png` |
| bronze_platebody | Bronze Platebody | a ruddy cast-bronze breastplate with a plain shoulder line and pitted soft warm metal | `bronze_platebody.png` |
| iron_platebody | Iron Platebody | a plain dark grey iron breastplate, heavy and unadorned, faint rust at the rivets | `iron_platebody.png` |
| steel_platebody | Steel Platebody | a bright tempered steel cuirass with clean bevels and a hard mirror sheen across the chest | `steel_platebody.png` |
| mithril_platebody | Mithril Platebody | a pale blue-silver mithril cuirass, unnaturally light, with fine seams down the flanks | `mithril_platebody.png` |
| rune_platebody | Rune Platebody | a deep silvered rune breastplate with etched runes glowing faintly across the chest | `rune_platebody.png` |
| ember_platebody | Emberforged Platebody | a dark heat-blued cuirass with glowing molten seams tracing the ribs | `ember_platebody.png` |
| dawn_platebody | Dawnsteel Platebody | a near-white radiant steel breastplate with warm gold inlay along the collar, flawless | `dawn_platebody.png` |
| bronze_platelegs | Bronze Platelegs | ruddy cast-bronze legguards with plain overlapping thigh plates, pitted soft warm metal | `bronze_platelegs.png` |
| iron_platelegs | Iron Platelegs | plain dark grey iron legguards, unadorned and heavy, faint rust at the straps | `iron_platelegs.png` |
| steel_platelegs | Steel Platelegs | bright tempered steel legguards with clean bevelled thigh plates and a hard mirror finish | `steel_platelegs.png` |
| mithril_platelegs | Mithril Platelegs | pale blue-silver mithril legguards, unnaturally light, with fine seams at the knee | `mithril_platelegs.png` |
| rune_platelegs | Rune Platelegs | deep silvered rune legguards with etched runes glowing faintly down the thigh | `rune_platelegs.png` |
| ember_platelegs | Emberforged Platelegs | dark heat-blued legguards with glowing molten seams between the overlapping plates | `ember_platelegs.png` |
| dawn_platelegs | Dawnsteel Platelegs | near-white radiant steel legguards with warm gold inlay along the knee, flawless | `dawn_platelegs.png` |
| bronze_boots | Bronze Boots | ruddy cast-bronze armoured boots with plain banded toes and pitted soft warm metal | `bronze_boots.png` |
| iron_boots | Iron Boots | plain dark grey iron sabatons, unadorned and blunt, faint rust at the ankle | `iron_boots.png` |
| steel_boots | Steel Boots | bright tempered steel sabatons with clean bevelled bands and a hard mirror toe | `steel_boots.png` |
| mithril_boots | Mithril Boots | pale blue-silver mithril sabatons, unnaturally light, with fine seams over the instep | `mithril_boots.png` |
| rune_boots | Rune Boots | deep silvered rune sabatons with etched runes glowing faintly along the shin | `rune_boots.png` |
| ember_boots | Emberforged Boots | dark heat-blued sabatons with glowing molten seams between the toe bands | `ember_boots.png` |
| dawn_boots | Dawnsteel Boots | near-white radiant steel sabatons with warm gold inlay at the cuff, flawless | `dawn_boots.png` |
| bronze_gauntlets | Bronze Gauntlets | a pair of ruddy cast-bronze gauntlets with plain banded fingers and pitted soft warm metal | `bronze_gauntlets.png` |
| iron_gauntlets | Iron Gauntlets | a pair of plain dark grey iron gauntlets, unadorned, with faint rust at the knuckles | `iron_gauntlets.png` |
| steel_gauntlets | Steel Gauntlets | a pair of bright tempered steel gauntlets with clean bevelled knuckle plates | `steel_gauntlets.png` |
| mithril_gauntlets | Mithril Gauntlets | a pair of pale blue-silver mithril gauntlets, unnaturally light, with fine finger seams | `mithril_gauntlets.png` |
| rune_gauntlets | Rune Gauntlets | a pair of deep silvered rune gauntlets with etched runes glowing faintly across the back of the hand | `rune_gauntlets.png` |
| ember_gauntlets | Emberforged Gauntlets | a pair of dark heat-blued gauntlets with glowing molten seams between the finger plates | `ember_gauntlets.png` |
| dawn_gauntlets | Dawnsteel Gauntlets | a pair of near-white radiant steel gauntlets with warm gold inlay at the cuff, flawless | `dawn_gauntlets.png` |
| bronze_belt | Bronze Belt | a ruddy cast-bronze plated girdle on a leather strap, plain buckle, pitted soft warm metal | `bronze_belt.png` |
| iron_belt | Iron Belt | a plain dark grey iron-plated girdle with a heavy square buckle and faint rust | `iron_belt.png` |
| steel_belt | Steel Belt | a bright tempered steel girdle with clean bevelled plates and a mirror-polished buckle | `steel_belt.png` |
| mithril_belt | Mithril Belt | a pale blue-silver mithril girdle, unnaturally light, with fine seams between the plates | `mithril_belt.png` |
| rune_belt | Rune Belt | a deep silvered rune girdle with etched runes glowing faintly along the plates | `rune_belt.png` |
| ember_belt | Emberforged Belt | a dark heat-blued girdle with glowing molten seams between the waist plates | `ember_belt.png` |
| dawn_belt | Dawnsteel Belt | a near-white radiant steel girdle with warm gold inlay on the buckle, flawless | `dawn_belt.png` |

### 2.2 Leather armour — the ranged class (42)

| id | Name | Subject line | File |
|---|---|---|---|
| leather_helmet | Leather Coif | a plain tanned tan leather coif with simple stitching and a soft brow band | `leather_helmet.png` |
| studded_helmet | Studded Leather Coif | a dark brown leather coif set with rows of iron studs over the crown | `studded_helmet.png` |
| boarhide_helmet | Boarhide Coif | a coarse ochre boarhide coif with bristles still in the hide and a tusk-bone clasp | `boarhide_helmet.png` |
| snakeskin_helmet | Snakeskin Coif | a green scaled snakeskin coif with a fine repeating pattern across the crown | `snakeskin_helmet.png` |
| wyvernhide_helmet | Wyvernhide Coif | a slate blue-grey wyvern-scale coif with hard overlapping plates over the temples | `wyvernhide_helmet.png` |
| dragonhide_helmet | Dragonhide Coif | a deep oxblood-red dragon-scale coif, thick and glossy, with a ridged crest | `dragonhide_helmet.png` |
| voidhide_helmet | Voidhide Coif | a black scaled coif with a faint violet sheen in the highlights | `voidhide_helmet.png` |
| leather_body | Leather Body | a plain tanned tan leather jerkin with simple stitching and a laced front | `leather_body.png` |
| studded_body | Studded Leather Body | a dark brown leather jerkin set with rows of iron studs across the chest | `studded_body.png` |
| boarhide_body | Boarhide Body | a coarse ochre boarhide jerkin with bristles still in the hide and rough seams | `boarhide_body.png` |
| snakeskin_body | Snakeskin Body | a green scaled snakeskin jerkin with a fine repeating pattern down the torso | `snakeskin_body.png` |
| wyvernhide_body | Wyvernhide Body | a slate blue-grey wyvern-scale jerkin of hard overlapping plates | `wyvernhide_body.png` |
| dragonhide_body | Dragonhide Body | a deep oxblood-red dragon-scale jerkin, thick and glossy | `dragonhide_body.png` |
| voidhide_body | Voidhide Body | a black scaled jerkin with a faint violet sheen along the shoulders | `voidhide_body.png` |
| leather_pants | Leather Chaps | plain tanned tan leather chaps with simple stitching and side laces | `leather_pants.png` |
| studded_pants | Studded Leather Chaps | dark brown leather chaps set with rows of iron studs down the thigh | `studded_pants.png` |
| boarhide_pants | Boarhide Chaps | coarse ochre boarhide chaps with bristles still in the hide | `boarhide_pants.png` |
| snakeskin_pants | Snakeskin Chaps | green scaled snakeskin chaps with a fine repeating pattern | `snakeskin_pants.png` |
| wyvernhide_pants | Wyvernhide Chaps | slate blue-grey wyvern-scale chaps of hard overlapping plates | `wyvernhide_pants.png` |
| dragonhide_pants | Dragonhide Chaps | deep oxblood-red dragon-scale chaps, thick and glossy | `dragonhide_pants.png` |
| voidhide_pants | Voidhide Chaps | black scaled chaps with a faint violet sheen at the knee | `voidhide_pants.png` |
| leather_boots | Leather Boots | plain tanned tan leather boots with simple stitching and a soft turned-down cuff | `leather_boots.png` |
| studded_boots | Studded Leather Boots | dark brown leather boots set with rows of iron studs up the shin | `studded_boots.png` |
| boarhide_boots | Boarhide Boots | coarse ochre boarhide boots with bristles still in the hide and a thick sole | `boarhide_boots.png` |
| snakeskin_boots | Snakeskin Boots | green scaled snakeskin boots with a fine repeating pattern | `snakeskin_boots.png` |
| wyvernhide_boots | Wyvernhide Boots | slate blue-grey wyvern-scale boots of hard overlapping plates | `wyvernhide_boots.png` |
| dragonhide_boots | Dragonhide Boots | deep oxblood-red dragon-scale boots, thick and glossy | `dragonhide_boots.png` |
| voidhide_boots | Voidhide Boots | black scaled boots with a faint violet sheen along the shin | `voidhide_boots.png` |
| leather_gloves | Leather Gloves | a pair of plain tanned tan leather gloves with simple stitching | `leather_gloves.png` |
| studded_gloves | Studded Leather Vambraces | a pair of dark brown leather vambraces set with rows of iron studs | `studded_gloves.png` |
| boarhide_gloves | Boarhide Vambraces | a pair of coarse ochre boarhide vambraces with bristles still in the hide | `boarhide_gloves.png` |
| snakeskin_gloves | Snakeskin Vambraces | a pair of green scaled snakeskin vambraces with a fine repeating pattern | `snakeskin_gloves.png` |
| wyvernhide_gloves | Wyvernhide Vambraces | a pair of slate blue-grey wyvern-scale vambraces of hard overlapping plates | `wyvernhide_gloves.png` |
| dragonhide_gloves | Dragonhide Vambraces | a pair of deep oxblood-red dragon-scale vambraces, thick and glossy | `dragonhide_gloves.png` |
| voidhide_gloves | Voidhide Vambraces | a pair of black scaled vambraces with a faint violet sheen | `voidhide_gloves.png` |
| leather_belt | Leather Belt | a plain tanned tan leather belt with a simple brass buckle and stitched edge | `leather_belt.png` |
| studded_belt | Studded Leather Belt | a dark brown leather belt set with rows of iron studs and a heavy buckle | `studded_belt.png` |
| boarhide_belt | Boarhide Belt | a coarse ochre boarhide belt with bristles still in the hide and a tusk toggle | `boarhide_belt.png` |
| snakeskin_belt | Snakeskin Belt | a green scaled snakeskin belt with a fine repeating pattern | `snakeskin_belt.png` |
| wyvernhide_belt | Wyvernhide Belt | a slate blue-grey wyvern-scale belt of hard overlapping plates | `wyvernhide_belt.png` |
| dragonhide_belt | Dragonhide Belt | a deep oxblood-red dragon-scale belt, thick and glossy | `dragonhide_belt.png` |
| voidhide_belt | Voidhide Belt | a black scaled belt with a faint violet sheen on the buckle | `voidhide_belt.png` |

### 2.3 Cloth armour — the magic class (42)

| id | Name | Subject line | File |
|---|---|---|---|
| apprentice_helmet | Apprentice Hat | a soft undyed coarse linen pointed hat, plain and cheap, brim slightly drooping | `apprentice_helmet.png` |
| adept_helmet | Adept Hat | a blue-grey wool pointed hat with simple braid trim around the band | `adept_helmet.png` |
| scholar_helmet | Scholar Hat | a deep green cloth scholar's cap with brass fittings on the band | `scholar_helmet.png` |
| warlock_helmet | Warlock Hat | a dark purple wide-brimmed hat with black leather bindings around the crown | `warlock_helmet.png` |
| sorcerer_helmet | Sorcerer Hat | a midnight blue pointed hat with silver embroidery running up the crown | `sorcerer_helmet.png` |
| archmage_helmet | Archmage Hat | a white and gold ceremonial mage hat set with small gems at the band | `archmage_helmet.png` |
| voidweave_helmet | Voidweave Hat | a black hood-hat woven with starless violet thread, hanging in soft folds | `voidweave_helmet.png` |
| apprentice_body | Apprentice Robe Top | an undyed coarse linen robe top, plain and cheap, with a rope tie | `apprentice_body.png` |
| adept_body | Adept Robe Top | a blue-grey wool robe top with simple braid trim at the cuffs | `adept_body.png` |
| scholar_body | Scholar Robe Top | a deep green cloth robe top with brass clasps down the front | `scholar_body.png` |
| warlock_body | Warlock Robe Top | a dark purple robe top with black leather bindings across the chest | `warlock_body.png` |
| sorcerer_body | Sorcerer Robe Top | a midnight blue robe top with silver embroidery across the shoulders | `sorcerer_body.png` |
| archmage_body | Archmage Robe Top | a white and gold robe top set with small gems along the collar | `archmage_body.png` |
| voidweave_body | Voidweave Robe Top | a black robe top woven with starless violet thread, edges fading into shadow | `voidweave_body.png` |
| apprentice_pants | Apprentice Robe Bottom | an undyed coarse linen robe skirt, plain and cheap, hem uneven | `apprentice_pants.png` |
| adept_pants | Adept Robe Bottom | a blue-grey wool robe skirt with simple braid trim at the hem | `adept_pants.png` |
| scholar_pants | Scholar Robe Bottom | a deep green cloth robe skirt with brass hem weights | `scholar_pants.png` |
| warlock_pants | Warlock Robe Bottom | a dark purple robe skirt with black leather binding at the waist | `warlock_pants.png` |
| sorcerer_pants | Sorcerer Robe Bottom | a midnight blue robe skirt with silver embroidery along the hem | `sorcerer_pants.png` |
| archmage_pants | Archmage Robe Bottom | a white and gold robe skirt set with small gems at the hem | `archmage_pants.png` |
| voidweave_pants | Voidweave Robe Bottom | a black robe skirt woven with starless violet thread, hem dissolving into dark | `voidweave_pants.png` |
| apprentice_boots | Apprentice Slippers | a pair of undyed coarse linen slippers, plain, cheap and soft-soled | `apprentice_boots.png` |
| adept_boots | Adept Slippers | a pair of blue-grey wool slippers with simple braid trim at the ankle | `adept_boots.png` |
| scholar_boots | Scholar Slippers | a pair of deep green cloth slippers with small brass buckles | `scholar_boots.png` |
| warlock_boots | Warlock Slippers | a pair of dark purple slippers with black leather bindings crossing the instep | `warlock_boots.png` |
| sorcerer_boots | Sorcerer Slippers | a pair of midnight blue slippers with silver embroidery over the toe | `sorcerer_boots.png` |
| archmage_boots | Archmage Slippers | a pair of white and gold slippers set with a small gem on each toe | `archmage_boots.png` |
| voidweave_boots | Voidweave Slippers | a pair of black slippers woven with starless violet thread | `voidweave_boots.png` |
| apprentice_gloves | Apprentice Gloves | a pair of undyed coarse linen gloves, plain, cheap and fingerless | `apprentice_gloves.png` |
| adept_gloves | Adept Gloves | a pair of blue-grey wool gloves with simple braid trim at the wrist | `adept_gloves.png` |
| scholar_gloves | Scholar Gloves | a pair of deep green cloth gloves with brass wrist studs | `scholar_gloves.png` |
| warlock_gloves | Warlock Gloves | a pair of dark purple gloves with black leather bindings up the wrist | `warlock_gloves.png` |
| sorcerer_gloves | Sorcerer Gloves | a pair of midnight blue gloves with silver embroidery across the back of the hand | `sorcerer_gloves.png` |
| archmage_gloves | Archmage Gloves | a pair of white and gold gloves set with a small gem on each cuff | `archmage_gloves.png` |
| voidweave_gloves | Voidweave Gloves | a pair of black gloves woven with starless violet thread | `voidweave_gloves.png` |
| apprentice_belt | Apprentice Sash | a knotted undyed coarse linen sash, plain and cheap, ends frayed | `apprentice_belt.png` |
| adept_belt | Adept Sash | a blue-grey wool sash with simple braid trim along its length | `adept_belt.png` |
| scholar_belt | Scholar Sash | a deep green cloth sash with a brass clasp at the centre | `scholar_belt.png` |
| warlock_belt | Warlock Sash | a dark purple sash bound with black leather cord | `warlock_belt.png` |
| sorcerer_belt | Sorcerer Sash | a midnight blue sash with silver embroidery running its length | `sorcerer_belt.png` |
| archmage_belt | Archmage Sash | a white and gold sash set with small gems along the centre | `archmage_belt.png` |
| voidweave_belt | Voidweave Sash | a black sash woven with starless violet thread, ends trailing into shadow | `voidweave_belt.png` |

### 2.4 Weapons — the four generated families (28)

| id | Name | Subject line | File |
|---|---|---|---|
| bronze_sword | Bronze Sword | a short ruddy cast-bronze straight sword with a leather-wrapped grip, soft warm metal and a slightly pitted blade | `bronze_sword.png` |
| iron_sword | Iron Sword | a plain dark grey iron straight sword with a leather-wrapped grip and a simple crossguard | `iron_sword.png` |
| steel_sword | Steel Sword | a bright tempered steel straight sword with clean bevels and a hard mirror edge | `steel_sword.png` |
| mithril_sword | Mithril Sword | a pale blue-silver mithril straight sword, unnaturally light, with a slender fullered blade | `mithril_sword.png` |
| rune_sword | Rune Sword | a deep silvered straight sword with etched runes glowing faintly along the fuller | `rune_sword.png` |
| ember_sword | Emberforged Sword | a dark heat-blued straight sword with a glowing molten seam running the length of the blade | `ember_sword.png` |
| dawn_sword | Dawnsteel Sword | a near-white radiant steel straight sword with warm gold inlay on the crossguard, flawless | `dawn_sword.png` |
| stone_maul | Stone Maul | a crude maul with a rough grey stone head lashed to a thick timber haft with rawhide | `stone_maul.png` |
| iron_warhammer | Iron Warhammer | a heavy plain dark grey iron warhammer with a blunt square head and a wrapped haft | `iron_warhammer.png` |
| steel_warhammer | Steel Warhammer | a bright tempered steel warhammer with clean bevelled head faces and a hard mirror finish | `steel_warhammer.png` |
| mithril_warhammer | Mithril Warhammer | a pale blue-silver mithril warhammer, unnaturally light, with fine seams around the head | `mithril_warhammer.png` |
| rune_warhammer | Rune Warhammer | a deep silvered warhammer with etched runes glowing faintly across the head | `rune_warhammer.png` |
| ember_warhammer | Emberforged Warhammer | a dark heat-blued warhammer with glowing molten seams cracking through the head | `ember_warhammer.png` |
| dawn_warhammer | Dawnsteel Warhammer | a near-white radiant steel warhammer with warm gold inlay on the head collar, flawless | `dawn_warhammer.png` |
| shortbow | Shortbow | a small recurved shortbow of pale untreated softwood, roughly finished, with a plain hemp string | `shortbow.png` |
| longbow | Longbow | a tall warm brown oak longbow, close-grained, with a leather-bound grip and a taut string | `longbow.png` |
| willow_longbow | Willow Longbow | a tall pale supple willow longbow, slightly greenish, with a corded grip | `willow_longbow.png` |
| maple_bow | Maple Bow | a golden-honey maple bow with a rippled figure in the grain and horn nocks | `maple_bow.png` |
| yew_bow | Yew Bow | a red-brown yew bow with a cream sapwood stripe along its back and horn nocks | `yew_bow.png` |
| runewood_bow | Runewood Bow | a dark timber bow with glowing rune-veins running through the grain and a rune-etched grip | `runewood_bow.png` |
| duskwood_bow | Duskwood Bow | a near-black duskwood bow with a cold silver sheen along the grain and a silvered string | `duskwood_bow.png` |
| apprentice_staff | Apprentice Staff | a plain pale untreated softwood staff, roughly finished, with a natural knot at the head | `apprentice_staff.png` |
| oak_staff | Oak Staff | a sturdy warm brown oak staff, close-grained, with an iron ferrule at the foot | `oak_staff.png` |
| willow_staff | Willow Staff | a pale supple willow staff, slightly greenish, its head split around a small clear stone | `willow_staff.png` |
| maple_staff | Maple Staff | a golden-honey maple staff with a rippled figure in the grain and a brass-caged head | `maple_staff.png` |
| yew_staff | Yew Staff | a red-brown yew staff with a cream sapwood stripe and a carved head holding a pale gem | `yew_staff.png` |
| runewood_staff | Runewood Staff | a dark timber staff with glowing rune-veins in the grain and a floating rune at the head | `runewood_staff.png` |
| duskwood_staff | Duskwood Staff | a near-black duskwood staff with a cold silver sheen and a silent dark orb held at its head | `duskwood_staff.png` |

### 2.5 Wave-3 uniques (14)

| id | Name | Subject line | File |
|---|---|---|---|
| dragonrend_greatblade | Dragonrend | an enormous two-handed greatblade of grim dark death-steel, an ancient bear's claw bound at the crossguard and a red dragon heart-gem set in the pommel | `dragonrend_greatblade.png` |
| crown_of_the_fallen_king | Crown of the Fallen King | a heavy war-crown of near-white dawnsteel with broken blackened spires and old dried blood in the engraving | `crown_of_the_fallen_king.png` |
| emberfang_blade | Emberfang | a single-edged blade that runs visibly hot, a demon ember burning inside the fuller and insect-chitin scales along the spine | `emberfang_blade.png` |
| demoncaller_staff | Demoncaller | a dark runewood staff crowned with a caged coal from the underworld that will not die, demonfire licking between the bars | `demoncaller_staff.png` |
| panthers_eye_pendant | Panther's Eye Pendant | a night panther's ruby eye set in blackened silver and strung on braided shadow-silk cord | `panthers_eye_pendant.png` |
| wraithsilk_shroud | Wraithsilk Shroud | a hooded cowl of grey wraith-silk whose edges fade away into nothing, light seeming to drain into the weave | `wraithsilk_shroud.png` |
| widows_fang | Widow's Fang | a slim envenomed dagger with a green-black sheen along the edge and a spider's unblinking eye set in the pommel | `widows_fang.png` |
| plaguewarden_greaves | Plaguewarden Greaves | pale blue-silver mithril legguards stained and cured with sickly green swarm-ichor that has hardened into the plates | `plaguewarden_greaves.png` |
| hollow_sigil_ring | Hollow Sigil Ring | a heavy band of spent grey runes closed around a dark wizard's hollow black sigil | `hollow_sigil_ring.png` |
| fangdart_recurve | Fangdart Recurve | a light recurve bow strung with braided dire-wolf sinew, torn fangs bound along its limbs and night-bone shot at the grip | `fangdart_recurve.png` |
| alphaheart_longbow | Alphaheart Longbow | a tall longbow carved around a single enormous pack-alpha fang set into the riser, grey wolf-pelt wrapping the grip | `alphaheart_longbow.png` |
| nightstalker_pelt | Nightstalker's Pelt | a body armour of black panther hide stitched with shadow-silk and fastened with hooked claw clasps | `nightstalker_pelt.png` |
| warband_bulwark | Warband Bulwark | a heavy cape of shed bony brute-plating hammered over a riveted steel frame, scarred from use | `warband_bulwark.png` |
| chitinweave_cloak | Chitinweave Cloak | a weightless cloak of overlapping black void-carapace plates sewn onto panther shadow, edges catching a faint violet sheen | `chitinweave_cloak.png` |

### 2.6 Ammo — the arrow ladder (8)

| id | Name | Subject line | File |
|---|---|---|---|
| bronze_arrows | Bronze Arrows | a single oversized arrow with a blunt ruddy cast-bronze head, a plain pale shaft and grey goose fletching | `bronze_arrows.png` |
| barbed_arrows | Barbed Arrows | a single oversized arrow with a dark iron head filed with a backward barb, a plain shaft and brown fletching | `barbed_arrows.png` |
| steel_arrows | Steel Arrows | a single oversized arrow with a needle-ground bright steel point and neat white fletching | `steel_arrows.png` |
| mithril_arrows | Mithril Arrows | a single oversized arrow with a pale blue-silver mithril head, a slender shaft and pale fletching | `mithril_arrows.png` |
| rune_arrows | Rune Arrows | a single oversized arrow with a deep silvered rune-etched point glowing faintly at the tip | `rune_arrows.png` |
| emberhead_arrows | Emberhead Arrows | a single oversized arrow with a dark heat-blued head still glowing faintly orange and scorched fletching | `emberhead_arrows.png` |
| dawnpoint_arrows | Dawnpoint Arrows | a single oversized arrow with a near-white radiant dawnsteel point and a gold-banded shaft | `dawnpoint_arrows.png` |
| iron_arrows | Iron Arrows | a single oversized arrow with a plain dark grey iron head, a straight shaft and brown fletching | `iron_arrows.png` |

### 2.7 Jewelry — earrings (6)

| id | Name | Subject line | File |
|---|---|---|---|
| copper_studs | Copper Studs | a matched pair of small beaten copper stud earrings, plain village work, slightly uneven | `copper_studs.png` |
| fang_studs | Fang Studs | a matched pair of stud earrings, each a small wolf fang capped in ruddy bronze | `fang_studs.png` |
| spidereye_studs | Spider-Eye Studs | a matched pair of stud earrings, each a glossy black venom-spider eye set in bright steel | `spidereye_studs.png` |
| wraithglass_drops | Wraithglass Drops | a matched pair of drop earrings of cold pale glass with a wraith-veil frozen inside, light bending wrongly through them | `wraithglass_drops.png` |
| rubyfire_studs | Rubyfire Studs | a matched pair of stud earrings, each a cut ruby held in a deep silvered rune setting that catches light like a struck spark | `rubyfire_studs.png` |
| dragon_gem_earrings | Dragon Gem Earrings | a matched pair of drop earrings, each half of a split dragon heart-gem hung in a gold cage | `dragon_gem_earrings.png` |

### 2.8 Jewelry — capes, necklaces, rings (b343 ladders) (13)

| id | Name | Subject line | File |
|---|---|---|---|
| woolen_cloak | Woollen Cloak | a short honest undyed wool travelling cloak with a bone toggle and a weather-stained hem | `woolen_cloak.png` |
| houndskin_cloak | Houndskin Cloak | a short hound-pelt cloak lined with dark bat-leather, cut high so it never catches | `houndskin_cloak.png` |
| trollhide_cape | Trollhide Cape | a thick warty grey troll-hide cape backed with brown bear pelt, heavy and stiff | `trollhide_cape.png` |
| shadowsilk_cape | Shadowsilk Cape | a black panther-shadow cape woven on a spider's loom, hanging perfectly still with no drape | `shadowsilk_cape.png` |
| dawnlit_mantle | Dawnlit Mantle | a near-black duskwood-thread mantle shot through with dawnsteel so the hem glows with first light | `dawnlit_mantle.png` |
| wolfbone_torc | Wolfbone Torc | an open neck torc of carved wolfbone bound at the ends with ruddy bronze caps, kill-notches cut along it | `wolfbone_torc.png` |
| spidersilk_choker | Spidersilk Choker | a close-fitting choker of spider-silk drawn into a single gold thread with a small dark clasp | `spidersilk_choker.png` |
| warlords_torc | Warlord's Torc | a heavy collar hammered from two melted warlord badges, mismatched metals fused at a visible seam | `warlords_torc.png` |
| dawnbound_amulet | Dawnbound Amulet | a gold amulet on a heavy chain holding a near-white dawnsteel setting around a red dragon heart-gem | `dawnbound_amulet.png` |
| banded_signet | Banded Signet | a signet ring of ruddy bronze banded over copper with a plain free-company mark on the face | `banded_signet.png` |
| ruby_signet | Ruby Signet | a broad rune-bar band carrying a thumbnail-sized cut ruby raised high on the face | `ruby_signet.png` |
| spellstone_ring | Spellstone Ring | a heavy ring holding a cracked violet warlock's spellstone bound in place with fine rune wire | `spellstone_ring.png` |
| dawnforged_signet | Dawnforged Signet | a signet ring of near-white dawnsteel, grim death-steel and gold layered together, the face cut with a sunburst | `dawnforged_signet.png` |

### 2.9 Gathering tools (21)

| id | Name | Subject line | File |
|---|---|---|---|
| bronze_axe | Bronze Axe | a felling axe with a ruddy cast-bronze head, soft warm metal, on a plain timber haft | `bronze_axe.png` |
| iron_axe | Iron Axe | a felling axe with a plain dark grey iron head and a straight ash haft | `iron_axe.png` |
| steel_axe | Steel Axe | a felling axe with a bright tempered steel head and a leather-bound haft | `steel_axe.png` |
| mithril_axe | Mithril Axe | a felling axe with a pale blue-silver mithril head, unnaturally light, on a slender haft | `mithril_axe.png` |
| rune_axe | Rune Axe | a felling axe with a deep silvered rune-etched head glowing faintly along the edge | `rune_axe.png` |
| ember_axe | Emberforged Axe | a felling axe with a dark heat-blued head, a glowing molten seam along its edge, on a scorched haft | `ember_axe.png` |
| dawn_axe | Dawnsteel Axe | a felling axe with a near-white radiant steel head and warm gold inlay at the collar | `dawn_axe.png` |
| bronze_pickaxe | Bronze Pickaxe | a mining pick with a ruddy cast-bronze head, soft warm metal, on a plain timber haft | `bronze_pickaxe.png` |
| iron_pickaxe | Iron Pickaxe | a mining pick with a plain dark grey iron head and a straight ash haft | `iron_pickaxe.png` |
| steel_pickaxe | Steel Pickaxe | a mining pick with a bright tempered steel head and a leather-bound haft | `steel_pickaxe.png` |
| mithril_pickaxe | Mithril Pickaxe | a mining pick with a pale blue-silver mithril head, unnaturally light, on a slender haft | `mithril_pickaxe.png` |
| rune_pickaxe | Rune Pickaxe | a mining pick with a deep silvered rune-etched head glowing faintly at both points | `rune_pickaxe.png` |
| ember_pickaxe | Emberforged Pickaxe | a mining pick with a dark heat-blued head and glowing molten seams through the points | `ember_pickaxe.png` |
| dawn_pickaxe | Dawnsteel Pickaxe | a mining pick with a near-white radiant steel head and warm gold inlay at the collar | `dawn_pickaxe.png` |
| willow_rod | Willow Rod | a slender pale supple willow fishing rod, slightly greenish, with a hemp line and a bone hook | `willow_rod.png` |
| oak_rod | Oak Rod | a sturdy warm brown oak fishing rod, close-grained, with a corded grip and an iron hook | `oak_rod.png` |
| maple_rod | Maple Rod | a golden-honey maple fishing rod with a rippled grain figure and a brass line guide | `maple_rod.png` |
| yew_rod | Yew Rod | a red-brown yew fishing rod with a cream sapwood stripe and a leather-bound grip | `yew_rod.png` |
| runewood_rod | Runewood Rod | a dark timber fishing rod with glowing rune-veins running through the grain | `runewood_rod.png` |
| duskwood_rod | Duskwood Rod | a near-black duskwood fishing rod with a cold silver sheen along the grain and a silvered line | `duskwood_rod.png` |
| dawnsteel_rod | Dawnsteel Rod | a fishing rod of near-white radiant steel with warm gold fittings and a fine bright line | `dawnsteel_rod.png` |

### 2.10 Artisan tools (9)

| id | Name | Subject line | File |
|---|---|---|---|
| bronze_hammer | Bronze Hammer | a smith's cross-peen hammer with a ruddy cast-bronze head, soft warm metal, on a short timber haft | `bronze_hammer.png` |
| steel_hammer | Steel Hammer | a smith's cross-peen hammer with a bright tempered steel head and a leather-bound haft | `steel_hammer.png` |
| rune_hammer | Rune Hammer | a smith's cross-peen hammer with a deep silvered rune-etched head glowing faintly at the face | `rune_hammer.png` |
| bone_needle | Bone Needle | a long tailor's needle carved from pale bone, blunt-eyed, with a length of coarse thread through it | `bone_needle.png` |
| steel_needle | Steel Needle | a long bright tempered steel tailor's needle with a fine polished eye and a length of good thread | `steel_needle.png` |
| rune_needle | Rune Needle | a long deep silvered tailor's needle with runes etched down its shaft glowing faintly | `rune_needle.png` |
| bronze_knife | Bronze Knife | a short kitchen knife with a ruddy cast-bronze blade and a plain wooden handle | `bronze_knife.png` |
| steel_knife | Steel Knife | a short kitchen knife with a bright tempered steel blade and a riveted wooden handle | `steel_knife.png` |
| rune_knife | Rune Knife | a short kitchen knife with a deep silvered rune-etched blade glowing faintly along the edge | `rune_knife.png` |

### 2.11 Monster drop materials (46)

| id | Name | Subject line | File |
|---|---|---|---|
| bones | Bones | one large bleached animal thigh bone, knuckled at both ends; the bone is neutral chalk white, never pink or gold | `bones.png` |
| big_bones | Big Bones | one massive yellowed femur from a big brute, thick and heavy, cracked at one knuckle; aged ivory, never pink or gold | `big_bones.png` |
| dragon_bones | Dragon Bones | a single enormous blackened dragon rib, dense and deeply curved, cracked along one edge | `dragon_bones.png` |
| slime_gel | Slime Gel | a quivering blob of translucent green ooze holding a soft dome shape, glassy highlights | `slime_gel.png` |
| goblin_ear | Goblin Ear | a single severed pointed goblin ear, green-grey and notched, with a small brass hoop through it | `goblin_ear.png` |
| bat_wing | Bat Wing | a single torn leathery bat wing, dark grey membrane stretched between thin finger bones | `bat_wing.png` |
| wolf_pelt | Wolf Pelt | a rolled grey wolf pelt with the head still attached, tanned and tied with cord | `wolf_pelt.png` |
| troll_hide | Troll Hide | a thick folded slab of warty green-grey troll hide, coarse and stiff | `troll_hide.png` |
| vamp_dust | Vampire Dust | a torn cloth pouch tipped on its side, fine pale ash with a faint red glimmer spilling from its mouth | `vamp_dust.png` |
| demon_shard | Demon Shard | a jagged shard of hardened dark red demon flesh, still hot, glowing along its cracks | `demon_shard.png` |
| dragon_scale | Dragon Scale | a single large green dragon scale, thick and iridescent, one edge chipped | `dragon_scale.png` |
| lich_soul | Lich Soul | a cold pale blue soul-wisp curling inside a cracked glass phial, murmuring light | `lich_soul.png` |
| magic_essence | Magic Essence | a floating mote of raw arcane light condensed into a glowing violet-white drop | `magic_essence.png` |
| rune_frag | Rune Fragment | a chipped triangular fragment of grey runestone with part of a carved glyph still on it | `rune_frag.png` |
| ancient_rune | Ancient Rune | a whole flat runestone tablet carved with an old-tongue glyph glowing steadily | `ancient_rune.png` |
| dragon_gem | Dragon Gem | a large faceted blood-red gem cut from a dragon's hoard, catching light in its depths | `dragon_gem.png` |
| ruby | Ruby | a single deep-red cut ruby, cushion-shaped, clean and unmounted | `ruby.png` |
| sticky_core | Sticky Core | a dense gluey amber-green core prised from a giant slime, strands still trailing from it | `sticky_core.png` |
| rat_tail | Rat Tail | a single scrawny pink rat's tail, curled, with a few coarse hairs | `rat_tail.png` |
| small_fang | Small Fang | a single small ivory fang from a lesser beast, root end stained | `small_fang.png` |
| bone_chips | Bone Chips | a single large splintered bone shard, pale and sharp-edged, its broken end crumbling to coarse bone meal | `bone_chips.png` |
| ancient_fragment | Ancient Fragment | a worn broken shard of a carved stone relic, its surface half-effaced by age | `ancient_fragment.png` |
| goblin_totem | Goblin Totem | a crude goblin shaman's idol of lashed sticks, feathers and a carved wooden face | `goblin_totem.png` |
| night_fang | Night Fang | a long blackened fang from a nocturnal predator, glossy and needle-sharp | `night_fang.png` |
| dark_sigil | Dark Sigil | a flat black stone disc etched with a shadowed sigil that seems to absorb the light on it | `dark_sigil.png` |
| venom_sac | Venom Sac | an intact translucent green venom gland, taut and glistening, tied off at one end | `venom_sac.png` |
| silk_thread | Silk Thread | a neat skein of fine pale spider silk wound on a small wooden spool | `silk_thread.png` |
| spider_eye | Spider Eye | a single glassy black spider eye the size of a plum, wet and reflective | `spider_eye.png` |
| brute_plate | Brute Plate | a rough slab of shed bony plating from a brute, ridged and scarred at the edges | `brute_plate.png` |
| dire_fang | Dire Fang | a long curved yellowed fang from a dire beast, heavier than a hand | `dire_fang.png` |
| alpha_fang | Alpha Fang | an enormous ivory pack-alpha fang, notched with old scars and bound with a leather thong | `alpha_fang.png` |
| grave_dust | Grave Dust | a small mound of grey grave dust with a faint cold shimmer, spilling from a burlap pouch | `grave_dust.png` |
| cracked_spellstone | Cracked Spellstone | a fractured violet spellstone leaking spent magic from the crack as a thin escaping glow | `cracked_spellstone.png` |
| plague_ichor | Plague Ichor | a corked phial of vile yellow-green ichor, thick and slow, clouding the glass | `plague_ichor.png` |
| swarm_heart | Swarm Heart | the pulsing chitinous core of a hive-swarm, insect legs still folded around it, faintly luminous | `swarm_heart.png` |
| warlord_badge | Warlord Badge | a battered brass rank badge on a torn strap, dented and blood-darkened | `warlord_badge.png` |
| bear_pelt | Bear Pelt | a heavy rolled brown bear pelt with the head still attached, thick winter fur | `bear_pelt.png` |
| bear_claw | Bear Claw | a single large curved black bear claw, root end still bloodied | `bear_claw.png` |
| wraith_veil | Wraith Veil | a tattered grey spectral shroud hanging in still air, its lower edge fraying into nothing | `wraith_veil.png` |
| hell_ember | Hell Ember | a fist-sized black coal burning white-hot from within, never cooling, cracks running orange | `hell_ember.png` |
| shadow_thread | Shadow Thread | a skein of thread spun from living darkness on a black spool, the strands blurring at the edges | `shadow_thread.png` |
| void_chitin | Void Chitin | a curved plate of black void-touched chitin with a faint violet sheen and a hairline crack | `void_chitin.png` |
| captain_medal | Captain Medal | a heavy silver campaign medal on a torn crimson ribbon, edge nicked by a blade | `captain_medal.png` |
| shadow_pelt | Shadow Pelt | a rolled lightless black shadow-cat pelt that swallows the highlight falling on it | `shadow_pelt.png` |
| razor_claw | Razor Claw | a single wickedly thin curved claw honed to a mirror edge, pale and translucent at the tip | `razor_claw.png` |
| death_steel | Death Steel | a rough dark ingot of grim corpse-forged steel, its surface pocked and faintly greasy | `death_steel.png` |

### 2.12 Boss / mid-tier drops and early equipment (14)

| id | Name | Subject line | File |
|---|---|---|---|
| captains_ribblade | Captain's Ribblade | a wicked curved blade ground from a long rib bone, hilt wrapped in dark leather and bound with wire | `captains_ribblade.png` |
| hollow_sigil | Hollow Sigil | a heavy ring-shaped sigil of dull grey metal with nothing in its centre, edges carved with silent glyphs | `hollow_sigil.png` |
| void_core | Void Core | a dense dark sphere collapsed in on itself, thin violet light escaping the seams, humming | `void_core.png` |
| war_crown | War Crown | a heavy iron warlord's crown with blunt spikes, gold plating half worn away, dented on one side | `war_crown.png` |
| ancient_claw | Ancient Claw | a colossal grey-black claw longer than an arm, cracked and ridged with age | `ancient_claw.png` |
| chief_blade | Chief's Blade | a crude vicious goblin chieftain's blade of beaten iron with a saw-toothed edge and a bound-rag grip | `chief_blade.png` |
| alpha_cloak | Alpha Cloak | a cape of thick grey alpha-beast pelt fastened at the shoulder with a fang clasp, the head cowl hanging back | `alpha_cloak.png` |
| traveler_cape | Traveler Cape | a worn road-stained brown travelling cape with a frayed hem and a plain iron pin | `traveler_cape.png` |
| copper_ring | Copper Ring | a plain unadorned copper band, slightly bent, with a faint green patina in the groove | `copper_ring.png` |
| hunter_necklace | Hunter Necklace | a beaded hunter's necklace of carved wooden beads, small teeth and a single feather | `hunter_necklace.png` |
| gold_ring | Gold Ring | a plain polished gold band, heavy and unset, with a soft warm sheen | `gold_ring.png` |
| gold_amulet | Gold Amulet | a teardrop gold amulet on a fine gold chain, plain-faced and highly polished | `gold_amulet.png` |
| fox_companion | Fox Companion | a small alert red fox sitting upright with its tail curled around its paws, ears forward | `fox_companion.png` |
| farm_deed | Farmer's Deed | a rolled parchment land deed tied with twine, a red wax seal pressed at the fold | `farm_deed.png` |

### 2.13 Ores, logs and raw stone (10)

| id | Name | Subject line | File |
|---|---|---|---|
| copper_ore | Copper Ore | a rough chunk of plain grey stone with narrow bright orange-green copper veins across one face; the stone itself stays neutral grey | `copper_ore.png` |
| iron_ore | Iron Ore | a rough chunk of plain dark grey stone, matte and unpolished, with a few narrow rust-brown streaks of iron ore across two faces; the rock itself is neutral grey — no red, orange or violet in the stone | `iron_ore.png` |
| coal | Coal | a single large lump of glossy black coal with sharp fractured faces; the coal is pure black and stays black | `coal.png` |
| gold_ore | Gold Ore | a rough chunk of pale rock threaded with gleaming yellow gold | `gold_ore.png` |
| mithril_ore | Mithril Ore | a rough chunk of plain dark grey stone shot through with cold blue-tinged pale mithril; the stone itself stays neutral grey | `mithril_ore.png` |
| normal_log | Normal Log | a single short cut log of pale untreated softwood, bark on, sawn clean at both ends | `normal_log.png` |
| oak_log | Oak Log | a single short cut log of warm brown oak with thick furrowed bark and a close-grained end | `oak_log.png` |
| willow_log | Willow Log | a single short cut log of pale supple willow, slightly greenish, with thin smooth bark | `willow_log.png` |
| maple_log | Maple Log | a single short cut log of golden-honey maple with a rippled figure in the sawn end | `maple_log.png` |
| yew_log | Yew Log | a single short cut log of red-brown yew with a cream sapwood ring at the sawn end | `yew_log.png` |

### 2.14 Refined materials — bars and planks (16)

| id | Name | Subject line | File |
|---|---|---|---|
| copper_bar | Copper Bar | a single cast ingot of soft orange copper with rounded edges and a faint patina | `copper_bar.png` |
| bronze_bar | Bronze Bar | a single cast ingot of ruddy warm bronze, slightly pitted on the top face | `bronze_bar.png` |
| iron_bar | Iron Bar | a single cast ingot of plain dark grey iron with a rough scaled surface; the iron is cold neutral grey with no warm tint | `iron_bar.png` |
| steel_bar | Steel Bar | a single cast ingot of bright tempered steel with clean edges and a hard sheen; the steel is cold silver-blue with no warm tint | `steel_bar.png` |
| gold_bar | Gold Bar | a single cast ingot of gleaming yellow gold, mirror-bright on the top face | `gold_bar.png` |
| mithril_bar | Mithril Bar | a single cast ingot of pale blue-silver mithril, unnaturally light, with fine seams | `mithril_bar.png` |
| rune_bar | Rune Bar | a single cast ingot of deep silvered metal with runes glowing faintly across its face | `rune_bar.png` |
| ember_bar | Emberforged Bar | a single cast ingot of dark heat-blued metal with glowing molten seams still cooling in it | `ember_bar.png` |
| dawn_bar | Dawnsteel Bar | a single cast ingot of near-white radiant steel with warm gold light along its edges | `dawn_bar.png` |
| normal_plank | Normal Plank | a single dressed plank of plain sawn softwood, pale and roughly finished, one end cut clean | `normal_plank.png` |
| oak_plank | Oak Plank | a single dressed plank of warm brown oak, close-grained and cleanly dressed, one end cut clean | `oak_plank.png` |
| willow_plank | Willow Plank | a single dressed plank of pale supple willow, slightly greenish, one end cut clean | `willow_plank.png` |
| maple_plank | Maple Plank | a single dressed plank of golden-honey maple with a rippled figure in the grain | `maple_plank.png` |
| yew_plank | Yew Plank | a single dressed plank of red-brown yew with a cream sapwood stripe along one edge | `yew_plank.png` |
| runewood_plank | Runewood Plank | a single dressed dark plank with glowing rune-veins running through the grain | `runewood_plank.png` |
| duskwood_plank | Duskwood Plank | a single dressed plank of near-black duskwood with a cold silver sheen along the grain | `duskwood_plank.png` |

### 2.15 Late-game ores and logs (4)

| id | Name | Subject line | File |
|---|---|---|---|
| emberstone_ore | Emberstone Ore | a rough chunk of dark volcanic rock glowing orange from deep inside its cracks | `emberstone_ore.png` |
| dawnstone_ore | Dawnstone Ore | a rough chunk of pale rock threaded with radiant near-white dawnstone that lights its own fractures | `dawnstone_ore.png` |
| runewood_log | Runewood Log | a single short cut log of dark timber with glowing rune-veins running through the grain | `runewood_log.png` |
| duskwood_log | Duskwood Log | a single short cut log of near-black duskwood with a cold silver sheen on the sawn end | `duskwood_log.png` |

### 2.16 Crops and seeds (18)

| id | Name | Subject line | File |
|---|---|---|---|
| turnip | Turnip | a single pale purple-and-white turnip with the leafy green top still attached and soil on the root | `turnip.png` |
| carrot | Carrot | a single crisp orange carrot with a feathery green top and a little soil at the tip | `carrot.png` |
| wheat | Wheat | a small tied sheaf of golden wheat with full ripe ears bending at the top | `wheat.png` |
| potato | Potato | one large firm brown-skinned potato with soil still clinging to its eyes | `potato.png` |
| tomato | Tomato | a ripe red tomato on the vine with a green calyx and a bright highlight on its skin | `tomato.png` |
| pumpkin | Pumpkin | a fat ribbed orange pumpkin with a thick curled green stem | `pumpkin.png` |
| goldenroot | Goldenroot | a radiant amber tuber with translucent skin, glowing faintly, its fine roots trailing soil | `goldenroot.png` |
| emberfruit | Emberfruit | a hot-hued red-orange fruit with a smouldering glow under its skin and a scorched stem | `emberfruit.png` |
| moonbloom | Moonbloom | a silver night-blooming flower-fruit with pale petals folded around a luminous pale core | `moonbloom.png` |
| turnip_seed | Turnip Seed | a small burlap pouch spilling tiny round pale turnip seeds | `turnip_seed.png` |
| carrot_seed | Carrot Seed | a small burlap pouch spilling fine slivered carrot seeds | `carrot_seed.png` |
| wheat_seed | Wheat Seed | a small burlap pouch spilling plump golden wheat grains | `wheat_seed.png` |
| potato_seed | Potato Seed | a small burlap pouch holding cut seed potatoes with pale sprouting eyes | `potato_seed.png` |
| tomato_seed | Tomato Seed | a small burlap pouch spilling flat pale tomato seeds | `tomato_seed.png` |
| pumpkin_seed | Pumpkin Seed | a small burlap pouch spilling flat cream pumpkin seeds | `pumpkin_seed.png` |
| goldenroot_seed | Goldenroot Seed | a small burlap pouch spilling amber seeds that glow faintly through the weave | `goldenroot_seed.png` |
| emberfruit_seed | Emberfruit Seed | a small burlap pouch spilling dark seeds with hot orange centres, the cloth scorched | `emberfruit_seed.png` |
| moonbloom_seed | Moonbloom Seed | a small burlap pouch spilling pale silver seeds with a soft cold glow | `moonbloom_seed.png` |

*(Includes the three b215 late crops and their seeds rather than splitting them out.)*

### 2.17 Raw fish (8)

| id | Name | Subject line | File |
|---|---|---|---|
| shrimp | Raw Shrimp | one oversized raw prawn, translucent pink shell, black eye, still wet | `shrimp.png` |
| herring | Raw Herring | a single small silver baitfish, bony and raw, scales catching the light | `herring.png` |
| trout | Raw Trout | a single speckled brown river trout, raw and slick, mouth slightly open | `trout.png` |
| swordfish | Raw Swordfish | a single long-billed blue-grey swordfish, raw, its bill dominating the composition | `swordfish.png` |
| lobster | Raw Lobster | a single heavy-clawed dark blue-brown lobster, raw and cold, claws forward | `lobster.png` |
| frostfin | Raw Frostfin | a single pale ice-water fish, raw, frost crusting its fins and a chill haze on the scales | `frostfin.png` |
| moonfish | Raw Moonfish | a single silver-scaled fish with a soft luminous sheen along its flank, raw and rare | `moonfish.png` |
| shark | Raw Shark | a thick raw slab of grey shark steak with the fin still attached to the skin | `shark.png` |

### 2.18 Cooked fish and cooked meals (14)

| id | Name | Subject line | File |
|---|---|---|---|
| cooked_shrimp | Cooked Shrimp | one oversized seared prawn curled on itself, pink-orange shell with faint char across it | `cooked_shrimp.png` |
| cooked_herring | Cooked Herring | a small pan-cooked silver fish with browned crisped skin | `cooked_herring.png` |
| cooked_trout | Cooked Trout | a whole trout crisped over coals, skin browned and split | `cooked_trout.png` |
| cooked_swordfish | Swordfish Steak | a thick seared swordfish steak with dark grill marks across the pale flesh | `cooked_swordfish.png` |
| cooked_lobster | Cooked Lobster | a bright red cooked lobster with one claw cracked open showing white buttered meat | `cooked_lobster.png` |
| cooked_frostfin | Frostfin Supper | a steaming pale fish supper in a shallow wooden bowl, thin broth and a sprig of herb | `cooked_frostfin.png` |
| cooked_moonfish | Moonfish Fillet | a delicate pale fillet with a faint silver luminescence along its edge | `cooked_moonfish.png` |
| cooked_shark | Cooked Shark | a thick seared shark steak, dark crust outside and dense pale flesh | `cooked_shark.png` |
| turnip_mash | Turnip Mash | a rough bowl of pale mashed turnip with a knob of butter melting on top | `turnip_mash.png` |
| baked_potato | Baked Potato | a potato roasted soft in its skin, split open and steaming, butter melting into it | `baked_potato.png` |
| wheat_bread | Wheat Bread | a round crusty golden loaf of bread with a slashed top and a torn piece beside it | `wheat_bread.png` |
| carrot_stew | Carrot Stew | a wooden bowl of thick orange carrot-and-root stew with a horn spoon resting in it | `carrot_stew.png` |
| tomato_soup | Tomato Soup | a wooden bowl of bright red tomato soup with a swirl of cream and a torn crust beside it | `tomato_soup.png` |
| pumpkin_pie | Pumpkin Pie | a golden spiced pumpkin pie with a crimped crust and one slice cut away | `pumpkin_pie.png` |

### 2.19 Meat, roasts and feasts (15)

| id | Name | Subject line | File |
|---|---|---|---|
| raw_wolf_meat | Raw Wolf Meat | a tough dark red raw cut of wolf meat, sinew visible | `raw_wolf_meat.png` |
| raw_panther_meat | Raw Panther Meat | a lean dark raw cut of panther meat, close-grained and glossy | `raw_panther_meat.png` |
| raw_bear_meat | Raw Bear Meat | a thick fatty raw slab of bear meat, marbled with white fat | `raw_bear_meat.png` |
| cooked_wolf_meat | Cooked Wolf Meat | a roasted dark cut of wolf meat with a charred crust | `cooked_wolf_meat.png` |
| cooked_panther_meat | Cooked Panther Meat | a dark seared cut of panther meat sliced to show a rare pink centre | `cooked_panther_meat.png` |
| cooked_bear_meat | Cooked Bear Meat | a fat-rich roasted bear joint, crackling browned skin | `cooked_bear_meat.png` |
| roasted_carrot | Roasted Carrot | one large fire-roasted carrot, caramelised and darkened at the edges, still on its stem | `roasted_carrot.png` |
| roasted_pumpkin | Roasted Pumpkin | one thick roasted pumpkin wedge, caramelised at the edges and glistening | `roasted_pumpkin.png` |
| vegetable_stew | Vegetable Stew | a thick garden stew of mixed roots in a heavy iron pot, steam rising from it | `vegetable_stew.png` |
| bear_claw_pie | Bear Claw Pie | a rugged deep pie with a rough pastry lid, one bear claw pressed into the crust as decoration | `bear_claw_pie.png` |
| hunters_feast | Hunter's Feast | a laden wooden platter of roast joints, bread and root vegetables piled high | `hunters_feast.png` |
| dragon_stew | Dragon Stew | a fierce dark stew in a heavy iron pot, red-orange steam curling off it, a scale floating on top | `dragon_stew.png` |
| lich_soul_soup | Lich Soul Soup | a cold pale broth in a stone bowl with a faint blue wisp curling up out of it | `lich_soul_soup.png` |
| void_banquet | Void Banquet | a dark otherworldly spread on a black slab, unidentifiable dishes edged with faint violet light | `void_banquet.png` |
| burnt_food | Burnt Food | a charred blackened lump of inedible food, cracked and smoking faintly | `burnt_food.png` |

### 2.20 Late crop dishes (3)

| id | Name | Subject line | File |
|---|---|---|---|
| goldenroot_roast | Goldenroot Roast | a glistening roast of amber goldenroot, glowing faintly through its glaze | `goldenroot_roast.png` |
| ember_tart | Ember Tart | a small smouldering tart of emberfruit, filling glowing orange through a lattice crust | `ember_tart.png` |
| moonbloom_elixir | Moonbloom Elixir | a slim glass phial of luminous silver draught, corked, light rising through the liquid | `moonbloom_elixir.png` |

### 2.21 Recipes, patterns and cookbooks (9)

| id | Name | Subject line | File |
|---|---|---|---|
| chief_blade_recipe | Chief's Blade Recipe | a torn war-stained parchment scroll, half-unrolled, showing a crude blade drawn in charcoal | `chief_blade_recipe.png` |
| captain_recipe | Captain's Ribblade Recipe | a rolled vellum scroll showing a bone blade sketched in ink with measurement marks | `captain_recipe.png` |
| alpha_pattern | Alpha Cloak Pattern | a folded tailor's pattern of stitched hide panels with chalk lines and pinned thread | `alpha_pattern.png` |
| spellstone_diagram | Spellstone Diagram | an arcane diagram inked on stiff parchment, concentric rings and a ring-setting drawn at the centre | `spellstone_diagram.png` |
| dragon_marrow_recipe | Dragon Marrow Recipe | a grim set of loose notes on bloodstained parchment showing a spear-head drawn beside a bone | `dragon_marrow_recipe.png` |
| gemcutter_note | Gemcutter's Note | a small folded note pinned to a scrap of leather, facet angles sketched around a split gem | `gemcutter_note.png` |
| soul_recipe | Soul Recipe Scroll | a dread black-inked scroll with a sealed cord, a bowl and a wisp drawn on the open face | `soul_recipe.png` |
| marrow_cookbook | Marrow Cookbook | a thick leather-bound cookbook lying open, greasy fingerprints on the pages, a bone bookmark | `marrow_cookbook.png` |
| field_cookbook | Field Cookbook | a small weather-beaten hunter's cookbook tied shut with cord, a feather tucked into it | `field_cookbook.png` |

### 2.22 Homestead blueprints (8)

| id | Name | Subject line | File |
|---|---|---|---|
| kitchen_blueprint_t2 | Kitchen Blueprint II | a rolled builder's plan showing a hearth and oven drawn in ink, marked with a large II | `kitchen_blueprint_t2.png` |
| kitchen_blueprint_t3 | Kitchen Blueprint III | a rolled builder's plan showing a grand double hearth in ink, marked with a large III and a wax seal | `kitchen_blueprint_t3.png` |
| forge_blueprint_t2 | Forge Blueprint II | a rolled builder's plan showing a forge and anvil drawn in ink, marked with a large II | `forge_blueprint_t2.png` |
| forge_blueprint_t3 | Forge Blueprint III | a rolled builder's plan showing a great forge with bellows in ink, marked with a large III and a wax seal | `forge_blueprint_t3.png` |
| library_blueprint_t2 | Library Blueprint II | a rolled builder's plan showing shelving and a reading desk in ink, marked with a large II | `library_blueprint_t2.png` |
| library_blueprint_t3 | Library Blueprint III | a rolled builder's plan showing a galleried library in ink, marked with a large III and a wax seal | `library_blueprint_t3.png` |
| trophy_blueprint_t2 | Trophy Blueprint II | a rolled builder's plan showing mounted trophy racks in ink, marked with a large II | `trophy_blueprint_t2.png` |
| trophy_blueprint_t3 | Trophy Blueprint III | a rolled builder's plan showing a great trophy hall in ink, marked with a large III and a wax seal | `trophy_blueprint_t3.png` |

### 2.23 Castle goods and refined castle stock (4)

| id | Name | Subject line | File |
|---|---|---|---|
| timber_beam | Timber Beam | a single squared and seasoned timber beam with chamfered edges and a carpenter's mark burned into the end | `timber_beam.png` |
| iron_fitting | Iron Fitting | a cast-iron bracket with a heavy bolt through it, plain dark grey iron with faint rust | `iron_fitting.png` |
| field_ration | Field Ration | a dense dark travel loaf wrapped in waxed cloth and tied with cord, one end cut open | `field_ration.png` |
| keystone | Keystone | a cut wedge-shaped masonry keystone of pale dressed stone with clean chisel marks on its faces; the stone is neutral grey-cream and takes no colour from the light | `keystone.png` |

### 2.24 Hunt materials (5)

| id | Name | Subject line | File |
|---|---|---|---|
| slagheart_core | Slagheart Core | a molten core of half-set slag still glowing white-orange through a hardening black crust | `slagheart_core.png` |
| abyssal_pearl | Abyssal Pearl | a large cold iridescent pearl with deep blue-green fire moving under its surface | `abyssal_pearl.png` |
| choirbone | Choirbone | a smooth pale curved bone with fine tuned grooves cut along it, faint sound-rings shimmering at one end | `choirbone.png` |
| warden_seal | Warden's Seal | a heavy bronze seal-matrix on a short chain, its face cut with a warden's mark, wax still in the die | `warden_seal.png` |
| wyrm_gilding | Wyrm Gilding | a curl of flaked radiant gilding peeled from an elder wyrm's scale, gold with an oil-slick shimmer | `wyrm_gilding.png` |

### 2.25 Hunt-forged tier-8 gear (6)

| id | Name | Subject line | File |
|---|---|---|---|
| regent_helm | Hollow Regent Helm | a tall crowned great helm with an empty dark visor and no face behind it, blackened metal chased with worn gold | `regent_helm.png` |
| slagheart_platebody | Slagheart Platebody | a massive cuirass forged around a still-glowing slag core set in the chest, black scorched plate with orange light bleeding from the seams | `slagheart_platebody.png` |
| abyssal_greaves | Abyssal Greaves | legguards quenched in abyssal pearl, deep blue-green iridescence shifting across dark plate | `abyssal_greaves.png` |
| choirbone_gauntlets | Choirbone Gauntlets | a pair of gauntlets carved from pale singing bone, fine tuned grooves across the knuckles, faint sound-rings at the cuffs | `choirbone_gauntlets.png` |
| warden_girdle | Warden's Girdle | a broad dark girdle closed with a bronze warden's seal-plate, chains and old wax hanging from it | `warden_girdle.png` |
| wyrmgilt_mantle | Wyrmgilt Mantle | a heavy mantle of dark scale sheeted in radiant wyrm gilding, gold with an oil-slick shimmer at the shoulders | `wyrmgilt_mantle.png` |

### 2.26 Dungeon boss signature loot (11)

| id | Name | Subject line | File |
|---|---|---|---|
| warboss_standard | Warboss Standard | a crude battle standard on a notched spear-shaft, torn red banner nailed to a crossbar and hung with small skulls | `warboss_standard.png` |
| wartusk_cleaver | Wartusk Cleaver | a broad heavy cleaver whose blade is a great broken boar tusk edged in beaten iron, grip bound in rawhide | `wartusk_cleaver.png` |
| whispering_codex | Whispering Codex | a floating open grimoire with pale pages turning by themselves, faint whispering script lifting off the paper | `whispering_codex.png` |
| lexarch_seal | Archivist Seal | a pale bone seal-matrix on a ribbon, its face cut with an archivist's cipher, ink still in the die | `lexarch_seal.png` |
| ashcrown_greatsword | Ashcrown Greatsword | an enormous two-handed greatsword of black obsidian-veined steel, a smoking ash-crown wrought into the crossguard | `ashcrown_greatsword.png` |
| voidmaw_scepter | Voidmaw Scepter | a long dark scepter whose head is a small open rift ringed with teeth, violet light dragging inward | `voidmaw_scepter.png` |
| voidwoven_sigil | Voidwoven Sigil | a flat sigil woven from strands of void-dark thread that hold their shape in the air, violet light in the gaps | `voidwoven_sigil.png` |
| riftmaw_husk | Riftmaw Husk | a large shed carapace-shell from a rift-beast, black and curved, the inner face still lit with dim violet | `riftmaw_husk.png` |
| dragonfang_pike | Dragonfang Pike | a long two-handed pike whose head is an enormous dragon fang bound to a duskwood shaft with gold wire | `dragonfang_pike.png` |
| elderscale_heart | Elderscale Heart | a large crystalline heart of a great wyrm, faceted deep red-gold, still beating light out through its facets | `elderscale_heart.png` |
| dungeon_scrip | Dungeon Scrip | a stamped brass token chit punched with a keyhole mark, its edges worn smooth from handling | `dungeon_scrip.png` |

### 2.27 Dungeon keys (6)

| id | Name | Subject line | File |
|---|---|---|---|
| bone_key | Bone Key | a long key carved from a single pale bone, its teeth cut like vertebrae | `bone_key.png` |
| goblin_seal | Goblin Seal | a crude clay seal stamped with a jagged goblin sigil, pressed onto a leather thong | `goblin_seal.png` |
| arcane_tome | Arcane Tome | a small clasped tome bound in grey hide, its lock humming with faint violet light | `arcane_tome.png` |
| obsidian_sigil | Obsidian Sigil | a shard of polished black obsidian cut into a sigil shape, thin red light in the fracture lines | `obsidian_sigil.png` |
| void_fragment | Void Fragment | a jagged shard of pure absence, its outline sharp but its interior empty, edges bending the light around it | `void_fragment.png` |
| dragonsbane_key | Dragonsbane Key | a heavy dread key forged from blackened iron with a dragon's tooth set as its bit | `dragonsbane_key.png` |

### 2.28 Rare relics, currencies and trophies (4)

| id | Name | Subject line | File |
|---|---|---|---|
| dragon_relic | Dragon Relic | a mounted relic of a slain dragon, a great claw and a scale set into a gold-banded base | `dragon_relic.png` |
| void_essence | Void Essence | a stoppered crystal vial holding distilled nothingness, a hole in the light rather than a liquid | `void_essence.png` |
| hearth_token | Hearth Token | a thick gold-and-enamel coin struck with a hearth flame on its face, milled edge, warm to look at | `hearth_token.png` |
| muster_seal | Rally Seal | a round wax-and-bronze seal struck with crossed banners, a short cut cord still through its loop | `muster_seal.png` |

---

## 3 · NEW ITEMS — Review Book Library 2 (86)

These are **not in `items.js` yet.** Generate them only after the live 426, and only if Tyler wants the
new content covered in the same night — the item ids below are the Review Book ids and will need real
`snake_case` game ids when the content lands. **The proposed game id is given in the File column and is
the one to use;** if the implementing agent picks a different id, the file must be renamed to match.

### 3.1 Bane weapons — ITEM-NEW-02…07 (5)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-02 | Lazlo's Maul | a grave-robber's warhammer with a squat iron head cast from melted coffin-fittings, grip wrapped in shroud-cloth, pale grave dust in the pitting | `lazlos_maul.png` |
| ITEM-NEW-03 | Dragonrib Bow | a tall bow whose limbs are a single curved dragon rib, sinew-strung, scale fragments still fused to the bone | `dragonrib_bow.png` |
| ITEM-NEW-04 | Bramble Blade | a short cheap sword whose blade is chipped and green-stained from cutting roots, a living bramble creeping around the grip | `bramble_blade.png` |
| ITEM-NEW-05 | Void Censer | a hanging brass censer on three chains, its vents leaking violet light instead of smoke, the bowl thin and rift-scarred | `void_censer.png` |
| ITEM-NEW-07 | Rat Stick | a plain length of hard wood worn smooth at one end and bound with wire, notched dozens of times along its length | `rat_stick.png` |

### 3.2 Charms and amulets — ITEM-NEW-08…13 (6)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-08 | Hunter's Torc | an open neck torc of braided bronze wire ending in two carved stag heads, small pelts knotted at the back | `hunters_torc.png` |
| ITEM-NEW-09 | Frost Locket | a small hinged silver locket rimed with permanent frost, a pale blue crystal visible through the gap | `frost_locket.png` |
| ITEM-NEW-10 | Tally Ring | a plain iron band scored all round with dozens of small tally marks cut at different depths | `tally_ring.png` |
| ITEM-NEW-11 | Bone Earrings | a matched pair of drop earrings, each a small carved bone charm hung on a thin bronze wire | `bone_earrings.png` |
| ITEM-NEW-12 | Pathfinder Studs | a matched pair of stud earrings, each a tiny brass compass rose with a needle frozen off-north | `pathfinder_studs.png` |
| ITEM-NEW-13 | Unlit Earrings | a matched pair of drop earrings of blackened metal holding two dead unlit lamps that give no light | `unlit_earrings.png` |

### 3.3 Consumables — ITEM-NEW-14…21 (6)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-14 | Hearthbread | a dense dark round loaf baked on a hearthstone, ash still on the base, torn open to show a soft crumb | `hearthbread.png` |
| ITEM-NEW-15 | Traveller's Stew | a battered tin travelling pot of thick stew with the lid tipped back and a spoon standing in it | `travellers_stew.png` |
| ITEM-NEW-16 | Winterdraught | a squat frosted glass bottle of pale blue draught, ice crystals climbing its shoulders | `winterdraught.png` |
| ITEM-NEW-17 | Ratter's Bait | a small oilcloth bundle of pungent bait tied with twine, one greasy corner fallen open | `ratters_bait.png` |
| ITEM-NEW-20 | Grave Salt | a small horn jar of coarse grey salt with a bone scoop, salt spilling onto dark ground | `grave_salt.png` |
| ITEM-NEW-21 | Kettle Tea | a small iron kettle with steam rising from the spout and a chipped enamel cup beside it | `kettle_tea.png` |

### 3.4 Utility — ITEM-NEW-23…26 (4)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-23 | Field Ledger | a small leather-bound field ledger held shut by a strap, a stub of charcoal tucked under it | `field_ledger.png` |
| ITEM-NEW-24 | Tithe Box | a small iron-bound wooden box with a coin slot in the lid and a heavy hasp | `tithe_box.png` |
| ITEM-NEW-25 | Carter's Strap | a broad worn leather carrying strap with a brass buckle and a shoulder pad rubbed shiny | `carters_strap.png` |
| ITEM-NEW-26 | Surveyor's Chain | a coiled surveyor's measuring chain of iron links with brass tally tags at intervals | `surveyors_chain.png` |

### 3.5 Gear with identity + cosmetics — ITEM-NEW-28…40 (11; the two SETS are expanded in §3.6)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-28 | Colossus Plate | an oversized slab-fronted breastplate built from riveted construct armour panels, one shoulder still bearing a maker's gear-mark | `colossus_plate.png` |
| ITEM-NEW-29 | Heartwood Cape | a cape of overlapping living bark plates with green heartwood showing at the splits, small leaves still on the hem | `heartwood_cape.png` |
| ITEM-NEW-30 | Draconia's Jaw | a helmet made from a dragon's lower jaw worn as an open faceguard, teeth framing the wearer's face | `draconias_jaw.png` |
| ITEM-NEW-31 | Cutpurse Gloves | a pair of fingerless dark leather gloves worn thin at the fingertips, a small hooked blade sewn into one cuff | `cutpurse_gloves.png` |
| ITEM-NEW-34 | Quiet Coat | a long muffled dark coat with a high collar and no buckles or fittings of any kind, hem hanging dead still | `quiet_coat.png` |
| ITEM-NEW-35 | Pitlord Irons | a pair of heavy black iron boots with molten orange light in the tread and slag fused to the soles | `pitlord_irons.png` |
| ITEM-NEW-36 | Bestiary Cloak | a plain undyed heavy cape with a wide blank dye-band across the shoulders ready to take a colour | `bestiary_cloak.png` |
| ITEM-NEW-37 | Hearthstone Signet | a broad signet ring whose face is a tiny carved hearth with a warm ember set in the grate | `hearthstone_signet.png` |
| ITEM-NEW-38 | Chronicle Ribbon | a narrow silk commendation ribbon folded into a pin, one line of blank embossing across it | `chronicle_ribbon.png` |
| ITEM-NEW-39 | Colossus Seal | a heavy bronze gear-shaped seal with a keyed centre, half decoration and half mechanism | `colossus_seal.png` |
| ITEM-NEW-40 | Weathervane | a small iron weathervane on a spindle, an arrow and a hearth-flame cut-out turning on it | `weathervane.png` |

*(11 rows — the five cosmetics ITEM-NEW-36…40 are grouped here rather than given their own table.)*

### 3.6 The two armour sets, expanded to pieces — ITEM-NEW-32 / 33 (12)

**Chitin Weave** (leather-class, T4, made from Vermin chitin not pelt). Shared descriptors: *plates of
banded insect chitin, blue-black with rust-orange joint seams, lashed with silk cord.*

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-32a | Chitinweave Helm | a close helm of banded blue-black insect chitin plates with rust-orange joint seams, lashed with silk cord | `chitinweave_helm.png` |
| ITEM-NEW-32b | Chitinweave Body | a torso harness of overlapping blue-black insect chitin plates with rust-orange joint seams, silk-lashed | `chitinweave_body.png` |
| ITEM-NEW-32c | Chitinweave Chaps | leg guards of segmented blue-black insect chitin with rust-orange joint seams, silk-lashed at the thigh | `chitinweave_chaps.png` |
| ITEM-NEW-32d | Chitinweave Boots | boots plated in blue-black insect chitin with rust-orange joint seams and clawed toe segments | `chitinweave_boots.png` |
| ITEM-NEW-32e | Chitinweave Vambraces | vambraces of banded blue-black insect chitin with rust-orange joint seams, silk-lashed at the wrist | `chitinweave_vambraces.png` |
| ITEM-NEW-32f | Chitinweave Belt | a belt of linked blue-black insect chitin segments with rust-orange joint seams and a mandible clasp | `chitinweave_belt.png` |

**Watchknight Shell** (plate-class, T5, the away-defence set). Shared descriptors: *dull grey-green
patinated bronze plate, sealed seams, small dark lenses set into each piece, standing-watch stillness.*

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-33a | Watchknight Helm | a sealed great helm of dull grey-green patinated bronze with a narrow slit and a small dark lens above it | `watchknight_helm.png` |
| ITEM-NEW-33b | Watchknight Cuirass | a heavy sealed cuirass of dull grey-green patinated bronze with a small dark lens set over the heart | `watchknight_cuirass.png` |
| ITEM-NEW-33c | Watchknight Greaves | sealed legguards of dull grey-green patinated bronze with sealed joint seams and a small dark lens at the knee | `watchknight_greaves.png` |
| ITEM-NEW-33d | Watchknight Sabatons | heavy sealed sabatons of dull grey-green patinated bronze, wide-based and immovable | `watchknight_sabatons.png` |
| ITEM-NEW-33e | Watchknight Gauntlets | sealed gauntlets of dull grey-green patinated bronze with a small dark lens on each wrist | `watchknight_gauntlets.png` |
| ITEM-NEW-33f | Watchknight Girdle | a broad sealed girdle of dull grey-green patinated bronze with a heavy latch and a small dark lens | `watchknight_girdle.png` |

### 3.7 Tools and materials — ITEM-NEW-41…44 (8)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-NEW-41a | Fletcher's Knife (T1) | a small crooked fletching knife with a plain iron blade and an unfinished wooden handle, wood shavings curling from it | `fletchers_knife_t1.png` |
| ITEM-NEW-41b | Fletcher's Knife (T4) | a fine fletching knife with a pale blue-silver mithril blade and a shaped horn handle | `fletchers_knife_t4.png` |
| ITEM-NEW-41c | Fletcher's Knife (T7) | a master's fletching knife with a near-white radiant dawnsteel blade and a gold-collared handle | `fletchers_knife_t7.png` |
| ITEM-NEW-42a | Mason's Rule (T1) | a folding wooden mason's rule with worn brass hinges and chalk-dulled markings | `masons_rule_t1.png` |
| ITEM-NEW-42b | Mason's Rule (T4) | a folding mason's rule of pale blue-silver mithril with crisp engraved graduations | `masons_rule_t4.png` |
| ITEM-NEW-42c | Mason's Rule (T7) | a folding mason's rule of near-white radiant dawnsteel with gold hinges and glowing graduations | `masons_rule_t7.png` |
| ITEM-NEW-43 | Deathsteel Ingot | a cast ingot of grim corpse-forged death-steel, dark and pocked, a faint greasy sheen on its faces | `deathsteel_ingot.png` |
| ITEM-NEW-44 | Void-Chitin Weave | a folded sheet of woven black void-chitin strips with a faint violet sheen and a hot ember caught in the weave | `void_chitin_weave.png` |

### 3.8 ITEM-PLAN groups — the nameable ones (34)

Only the plan groups whose members are actually named in the source specs are listed. **ITEM-PLAN-01**
(arrows) and **-05**'s `keystone` are already live and appear in §2. **ITEM-PLAN-07** (bow re-home),
**-08** (signature drops), **-09** (descriptions) and **-10** (seal sink) add no new item art.

**ITEM-PLAN-02 — bound runes** (`consumable-economy.md` §6.2). Shared descriptors: *one large flat
rune-stone chip carved with a single glyph — ONE chip, never a stack or handful (picker §0.3).*

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-PLAN-02a | Air Rune | one large flat pale grey rune chip carved with a single glyph glowing soft white | `air_rune.png` |
| ITEM-PLAN-02b | Earth Rune | one large flat brown-ochre rune chip carved with a single glyph glowing dull amber | `earth_rune.png` |
| ITEM-PLAN-02c | Water Rune | one large flat blue-grey rune chip carved with a single glyph glowing cool blue | `water_rune.png` |
| ITEM-PLAN-02d | Fire Rune | one large flat red-black rune chip carved with a single glyph glowing hot orange | `fire_rune.png` |
| ITEM-PLAN-02e | Chaos Rune | one large flat cracked green-grey rune chip carved with a single unstable glyph | `chaos_rune.png` |
| ITEM-PLAN-02f | Death Rune | one large flat bone-white rune chip carved with a single glyph glowing pale violet | `death_rune.png` |
| ITEM-PLAN-02g | Blood Rune | one large flat dark red rune chip carved with a single glyph wet with a slow red glow | `blood_rune.png` |

**ITEM-PLAN-03 — whetstones** (§6.3). Shared descriptors: *a rectangular hand-stone with rounded worn
corners, one face scored from use.*

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-PLAN-03a | Coarse Whetstone | a rough grey rectangular hand whetstone with chipped corners and a gritty scored face | `coarse_whetstone.png` |
| ITEM-PLAN-03b | Copper Whetstone | a grey hand whetstone banded with a copper edge strip, one face worn glossy | `copper_whetstone.png` |
| ITEM-PLAN-03c | Iron Whetstone | a dark grey hand whetstone set in a plain dark iron frame, one face worn hollow | `iron_whetstone.png` |
| ITEM-PLAN-03d | Steel Whetstone | a fine grey hand whetstone in a bright tempered steel frame with clean bevelled edges | `steel_whetstone.png` |
| ITEM-PLAN-03e | Mithril Whetstone | a pale hand whetstone bound in blue-silver mithril, unnaturally light, faintly translucent | `mithril_whetstone.png` |
| ITEM-PLAN-03f | Rune Whetstone | a dark hand whetstone bound in deep silvered metal with runes glowing faintly along its edge | `rune_whetstone.png` |
| ITEM-PLAN-03g | Dawnsteel Whetstone | a pale hand whetstone bound in near-white radiant dawnsteel with warm gold at the corners | `dawn_whetstone.png` |

**ITEM-PLAN-04 — stone raws, blocks and blank runes** (§8.4, §9.5)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-PLAN-04a | Rubble | a loose heap of broken grey stone rubble, angular fragments and grit | `rubble.png` |
| ITEM-PLAN-04b | Granite | two rough chunks of speckled pink-grey granite with a fresh fractured face | `granite.png` |
| ITEM-PLAN-04c | Basalt | two rough chunks of dark columnar basalt with sharp hexagonal edges | `basalt.png` |
| ITEM-PLAN-04d | Dressed Block | a single squared grey building block, faces flattened with visible chisel marks | `dressed_block.png` |
| ITEM-PLAN-04e | Granite Block | a single squared speckled pink-grey granite block, faces dressed smooth | `granite_block.png` |
| ITEM-PLAN-04f | Basalt Block | a single squared dark basalt block, faces dressed smooth with a dull sheen | `basalt_block.png` |
| ITEM-PLAN-04g | Blank Rune | a small stack of blank uncarved flat grey stone chips with clean cut edges | `rune_blank.png` |
| ITEM-PLAN-04h | Fine Blank Rune | a small stack of blank uncarved flat granite chips, faces polished smooth | `fine_rune_blank.png` |
| ITEM-PLAN-04i | Deep Blank Rune | a small stack of blank uncarved flat basalt chips, faces polished to a dark mirror | `deep_rune_blank.png` |

**ITEM-PLAN-05 — castle goods** (`keystone` is already live, §2.23)

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-PLAN-05a | Ashlar | a single precisely squared ashlar facing stone, faces ground flat, edges knife-sharp | `ashlar.png` |
| ITEM-PLAN-05b | Vaultstone | a large curved vault voussoir of dark dressed stone with an iron lifting lewis set into its top | `vaultstone.png` |

**ITEM-PLAN-06 — phase-two elementals** (§11.2/§11.3). Shared descriptors per element: *frost = pale
blue-white with rime; ember = hot orange with char; blight = sickly yellow-green.*

| review id | Name | Subject line | File |
|---|---|---|---|
| ITEM-PLAN-06a | Rune of Frost | a single large flat rune-stone carved with a frost glyph, rime creeping out from the cut | `rune_of_frost.png` |
| ITEM-PLAN-06b | Rune of Ember | a single large flat rune-stone carved with an ember glyph, the cut glowing hot orange and char around it | `rune_of_ember.png` |
| ITEM-PLAN-06c | Rune of Blight | a single large flat rune-stone carved with a blight glyph, sickly yellow-green weeping from the cut | `rune_of_blight.png` |
| ITEM-PLAN-06d | Frost Arrows | a single oversized arrow with a pale blue-white head sheathed in rime, a straight shaft and frost-stiffened fletching | `frost_arrows.png` |
| ITEM-PLAN-06e | Ember Arrows | a single oversized arrow with a hot orange glowing head, a straight shaft and scorched blackened fletching | `ember_arrows.png` |
| ITEM-PLAN-06f | Blight Arrows | a single oversized arrow with a sickly yellow-green head beading with venom, a straight shaft and stained fletching | `blight_arrows.png` |
| ITEM-PLAN-06g | Frost Whetstone | a hand whetstone rimed pale blue-white, cold vapour sinking off its scored face | `frost_whetstone.png` |
| ITEM-PLAN-06h | Ember Whetstone | a hand whetstone glowing hot orange through its cracks with char blackening its corners | `ember_whetstone.png` |
| ITEM-PLAN-06i | Blight Whetstone | a hand whetstone slick with sickly yellow-green residue, its scored face pitted and stained | `blight_whetstone.png` |

---

## 4 · Batch workflow

### 4.1 Generation order — most visible first

Ordered by *how many players see it, how often*, not by catalogue order. Cut anywhere and the game is
still better off than it was.

| # | Batch | n | Why here |
|---|---|---|---|
| 1 | **Weapons — the 28 generated rungs** (§2.4) | 28 | Every player holds one from minute one and looks at it in the arena, the doll, the shop and the tooltip. Highest views-per-icon in the game. |
| 2 | **Plate armour, all 42** (§2.1) | 42 | The melee class is the default path; these are the doll's six slots × 7 tiers. |
| 3 | **Leather + cloth armour, all 84** (§2.2, §2.3) | 84 | **These 84 have never had a single painted icon in the game's history.** Every ranged and every magic character currently sees zero painted armour for its own build at any level. Biggest coverage delta in the document. |
| 4 | **Tools, 30** (§2.9, §2.10) | 30 | Held on the tool rail during every gathering session — high dwell time, low icon count. |
| 5 | **Food + crops + fish, 58** (§2.16–§2.20) | 58 | The inventory's densest shelf; also where the "wall of identical brown blobs" risk is highest, so generate the whole shelf in one sitting and compare it as a shelf. |
| 6 | **Materials + ores + bars + planks, 76** (§2.11, §2.13–§2.15) | 76 | Seen constantly in recipe requirement rows at 15–34 px. Prioritise silhouette over detail here more than anywhere. |
| 7 | **Jewelry, ammo, capes — 27** (§2.6–§2.8) | 27 | Smaller shelves, but the earrings/ammo/cape ladders are brand new content with no art at all. |
| 8 | **Uniques, Hunt-forged, dungeon loot — 50** (§2.5, §2.12, §2.24–§2.26) | 50 | The payoff shelf. Today several of these share a sprite with a mid-tier craftable — a raid-boss unique rendering as a tier-3 item is worse than no art. Do these before the paperwork. |
| 9 | **Keys, scrolls, blueprints, currencies — 31** (§2.21–§2.23, §2.27, §2.28) | 31 | Lowest dwell time and they already fall back to an on-brand gilt category glyph. |
| 10 | **New items (§3), 86** | 86 | Only after all 426 live items are done. This content is not in the game yet. |

**Monsters.** If monsters are being generated the same night, run them **between batch 8 and batch 9**,
in the order given in `monster-art-prompts.md` §4 — the **31 live monsters first** (they replace art the
player is looking at today, including two known wrong-identity files), then the wave candidates by tier.

### 4.2 Keeping set-pieces related

1. **Generate a family in ONE unbroken sitting.** Image models drift between sessions; they are far more
   consistent within one. A 7-rung sword ladder generated across two nights will not look like a ladder.
2. **Use the §1 material vocabulary verbatim.** The tier-4 helmet and the tier-4 gauntlets must contain
   the *same words* — "pale blue-silver metal, unnaturally light, fine seams" — or they will not read as
   one set no matter how good each image is.
3. **Generate ACROSS the slot at one tier, not down the tier for one slot.** Do all six mithril plate
   pieces, then all six rune pieces. A player equips a *set at one tier*; that is the comparison the eye
   makes, so that is the comparison to control.
4. **Fix the camera per family.** Weapons: all at the same three-quarter angle, all pointing the same
   way (blades tip-up reads best at 34 px). Bars/ingots: identical angle so the metal is the only
   variable. Bowls and platters: identical eye height.
5. **One seed per family where the tool supports it.** Changing only the material words against a fixed
   seed is the cheapest possible consistency win.
6. **The elementals (§3.8, ITEM-PLAN-06) must be recognisable as variants of their base item**, not new
   items. Generate the base first, then re-prompt with only the element clause changed.

### 4.3 QC checklist — run on every file before wiring

**Automatable — script these; do not eyeball them.**

- [ ] **Alpha is real.** PNG colour type 6, and the four corner pixels plus a mid-edge sample are alpha 0. Models routinely ignore "transparent background" and hand back an opaque white one.
- [ ] **Canvas.** Long edge exactly 128 px after auto-crop. Short edge anything. (Monsters: exactly 256 × 256, square.)
- [ ] **No baked shadow.** Sample the bottom edge band — a contact shadow shows up as a soft dark alpha gradient where there should be nothing.
- [ ] **Filename is the exact item id, case-correct.** Windows will not catch a wrong case; the Linux host serving the game will 404 on it.
- [ ] **No duplicate bytes.** Content-hash the batch; flag collisions for review rather than hard-failing (some sharing is deliberate house convention — every wood-log tier shares one tinted sprite).
- [ ] **The wired path resolves.** The current smoke guard only checks that the path *string looks right*, not that the file exists. Land the existence check with the batch.

**Human — nobody can script these.**

- [ ] **Identity.** Is this actually the thing? Check against the item's own `desc` line in `src/data/item-descriptions.js`, not just its name. This repo has shipped a boar named `bear.png` and a vampire named `dragon.png`; both passed every automated check ever run against them.
- [ ] **Thumbnail legibility — the non-negotiable.** View the file at **34 px** on the dark theme background and on the cream one. If you cannot name the object, it fails, however good it looks at full size. This is the single check most likely to be skipped and most likely to matter.
- [ ] **Shelf test.** Put the whole family on one row at 64 px. A ladder must read as a ladder — bronze through dawnsteel should be an obvious progression, not seven unrelated swords. A set must read as a set.
- [ ] **Style consistency.** Against the *chosen lane's* control image (the iron longsword from `art-direction-picker.md`), not against the retired painted set. Lighting direction, level of finish, saturation and outline weight are the four axes that drift.
- [ ] **No text, no watermark, no signature, no border, no UI frame.** Models add these unprompted, especially on scrolls, blueprints and books — the nine recipe scrolls and eight blueprints in §2.21–§2.22 are the highest-risk items in the whole catalogue for hallucinated lettering.
- [ ] **No emoji, ever.** Non-negotiable project rule. If a generation returns a glyph-like or emoji-like mark, discard it.

---

## 5 · Method, and two corrections to older documents

**The 426 count is executed, not read.** `src/data/items.js` was imported into Node with its `?v=`
import queries stripped, which resolves `GEAR_ITEMS` + `WAVE3_ITEMS` + `SLOT_ITEMS` + the hand-authored
entries exactly as the browser sees them after merge, and `Object.keys(ITEMS).length` was taken directly:
**426** (armor 145 · weapon 41 · jewelry 20 · ammo 8 · tool 30 · companion 1 · trophy 3 · untyped 178).
Subject lines were written against a dump of `{id, name, type, slot, tier, value, toolSkill}` joined
with `ITEM_DESC` from `src/data/item-descriptions.js`, so every line with flavour text is written from
the game's own fiction rather than from the item name alone.

**The render-size table in §0 was measured in-browser**, not inferred: six real stylesheets fetched with
`cache:'reload'` from the live preview on `localhost:8123`, inlined into a same-origin 1440 × 900 iframe
carrying the real container markup under `body[data-theme="hearthlight"]`, every icon host measured with
`getBoundingClientRect()` and `getComputedStyle().objectFit`. Two things that contradicts:

1. **`itemization-and-art-pipeline.md` cites a 96 px level-up icon as an item render size. It is dead.**
   `legacy.css:2390` declares `width:96px;height:96px`; `audit-overrides.css:128` overrides it to
   `32px !important` and wins. **The true maximum item render in the game is the 64 × 64 detail modal**
   — which is why 128 px long-edge is the right source spec, for the right reason.
2. **Item icons are `object-fit: contain` at every measured render site**, and `applyLocalIcons()` also
   writes an inline `object-fit:contain` into `window._itemSVG`. Non-square item icons are therefore
   always letterboxed and never cropped — confirming the variable-short-edge canvas rule. (Monster
   portraits are the opposite: two of their surfaces use `cover` on a square box, which is why their
   spec is square-only. That correction is in `monster-art-prompts.md`.)

**One structural note for whoever wires the batch.** `applyLocalIcons()`'s generated-gear fallback
(`SLOT_ART`) fires only when `LOCAL_ITEM_ICON[id]` is absent — `if (LOCAL_ITEM_ICON[id]) return;`. A
complete 426-file set therefore makes that entire fallback mapper **dead code**, and with it the current
worst art defect in the game (nine different plate gauntlets, tiers 1 through 8, including a raid-boss
unique, all rendering the identical `leather_gloves.png`). That is a good outcome and the mapper should
be deleted in the same pass, not left as a silent trap for the next item added.

---

## 6 · Items whose names alone were too vague — what I assumed, so it can be corrected

I did **not** guess wildly on these. Each has a subject line written to the most defensible reading, and
each reading is stated here so Tyler or the Game Designer can overrule it in one line.

| id | The ambiguity | What I assumed |
|---|---|---|
| `riftmaw_husk` | No description. "The Riftmaw" is a *devouring rift* (`bosses.js`), not an animal, so a "husk" could be a shed shell, a burnt-out rift remnant, or a corpse. Its `icon` field is 🐚 (a shell). | A shed carapace-shell, black and curved, violet light still in the inner face. Followed the icon field, which is the only evidence in the repo. |
| `elderscale_heart` | No description. "Heart" of a great wyrm could be a literal organ or a gem. Its `icon` field is 💠 (a faceted gem). | A crystalline faceted heart, deep red-gold, still beating light. Followed the icon field. **If it is meant to be a literal organ, this line is wrong and needs one word changed.** |
| `dungeon_scrip` | No description. "Scrip" is paper currency by definition, but its `icon` field is 🎟️ (a ticket) and every other currency in the game is metal. | A stamped brass token chit. Chose metal for shelf consistency with `hearth_token` and `muster_seal`. |

**Two systematic gaps, flagged rather than hidden.** The **84 leather and cloth armour pieces** (§2.2,
§2.3) and the **9 artisan tools** (§2.10) have **no `ITEM_DESC` flavour text at all** — their subject
lines are derived systematically from name + tier + slot against the §1 material ladders. That is a
defensible construction, not a guess, but it is thinner evidence than the rest of the sheet and those
93 lines are the ones most worth a designer's eye before generation.
