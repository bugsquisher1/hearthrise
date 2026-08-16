# Art Direction Picker — five lanes for the whole game's iconography

**Author:** Art Director · **Date:** 2026-08-16 · **Status:** decision input. Pick ONE lane; everything
else in the art program hangs off it.

**Why this exists.** Tyler, 2026-08-16, binding: *"I don't like any of our current art; I want to move in
a different direction and have that AI bot do all of the items tonight."* The shipped painted set
(`assets/icons-bundle/painted/`) is therefore **history, not an anchor**. Nothing below is written to
match it, and two of the five lanes are deliberately further from it than the others.

---

## 0 · The one thing that does NOT change

**Forge & Stone survives as the WORLD, not as the look.** Tyler, same day: *"I still like the idea of
'forge and stone' in terms of castle and hearth etc."*

So all five lanes depict **the same game**: iron and bronze and dawnsteel, quarried stone, timber and
tanned leather, hearths, castles, root vegetables, bones, wolves and wyrms. The subject matter, the
material language and the medieval-cosy fiction are fixed.

**What is in play is how that world is PAINTED and what TEMPERATURE it runs at.** A cool, moody
Hearthrise and a hot, saturated Hearthrise are both unmistakably castle-and-hearth. If a lane starts
suggesting a different *world* — sci-fi, grimdark-horror, chibi-modern — the lane is being read wrong.
Five looks, one world.

The old "warm slightly desaturated Forge & Stone palette" instruction is **retired** as a prompt
constraint. Each lane below carries its own palette identity, and that is part of what is being tested.

---

## 1 · How to read this document

Each lane gives you:

- **Identity** — what the game feels like in this style.
- **Palette identity** — the lane's own colour temperature and range. This is a *variable*, not a
  constant, across the five.
- **STYLE PREFIX — ITEMS** and **STYLE PREFIX — MONSTERS** — the framing clause. Items and monsters are
  framed differently (single object vs. head-and-shoulders bust) but share one style DNA.
- **STYLE SUFFIX (both)** — the rendering, palette and hard-requirement clause. Identical for items and
  monsters *within a lane*, which is the mechanism that keeps the two sets looking like one game.
- **At 64px** — strengths and risks at thumbnail. **This is the non-negotiable criterion.** See §2.
- **Theme fit** — icons render on BOTH the dark default (`hearthlight`) and the light secondary
  (`cozy-light`). Flagged honestly per lane.
- **Test prompt** — the same control subject for all five, fully assembled and paste-ready.

**Assembly is always:**

```
<STYLE PREFIX>  +  <the subject clause>  +  <STYLE SUFFIX>
```

Subject clauses live in `item-art-prompts.md` (items) and `monster-art-prompts.md` (monsters). Neither
of those files contains any style language — that is deliberate, so the lane can be swapped without
rewriting 500 lines.

---

## 2 · The measured constraint every lane is judged against

These numbers were measured in-browser against the real stylesheets (see §9), not assumed.

| Surface | Rendered box | `object-fit` |
|---|---|---|
| Cost / requirement chip | **15 px** | contain |
| Combat drop row | 22 px | contain |
| Bounty / boss art | 30 px | contain |
| Shop row | 34 px | contain |
| Market row | 36 px | contain |
| Equip-doll slot | ~44 px | contain |
| Inventory tile | ~54–68 px (image is 100% × 75% of a ≥72 px tile) | contain |
| **Item detail modal** | **64 × 64 px — the LARGEST item render in the game** | contain |
| Bestiary row (monster) | 36 px | **cover** |
| Monster row (monster) | 38 px | contain |
| Arena portrait (monster) | 96 px desktop / 72 / 58 / 56 px narrower | **cover** |
| Monster detail portrait | 120 px | contain |

**Three consequences that decide this pick:**

1. **No item icon is ever displayed above 64 px.** Any lane whose appeal lives in detail finer than
   ~1/16th of the frame is buying something the player will never see. This kills fine engraving,
   micro-texture, filigree and legible surface wear as *selling points*.
2. **Silhouette and value contrast are the whole game.** At 34 px a sword is a shape and two tones.
   Every lane's suffix therefore carries an explicit silhouette-first clause; the lanes differ in how
   much they *need* it.
3. **Two backgrounds.** The default theme is dark (near-black stone); the secondary is cream. An icon
   that relies on the background for contrast fails on one of them. This is where lane C gets into
   real trouble and lane B gets a free win.

---

## 3 · Lane A — **HEARTHFIRE**
*(high-contrast stylized hand-painted — Hearthstone / Blizzard-cinematic adjacent)*

**Identity.** The game as a story told loudly across a tavern table. Every object is exaggerated for
effect — an oversized pommel, a blade that tapers faster than physics allows, a helmet with a brow
heavier than any smith would forge — and lit like a stage prop by a fire just out of frame. It reads
generous, boisterous and expensive; it is the lane that makes a common bronze sword look like a prize.

**Palette identity — WARM, wide-range.** Ember orange and hearth gold as the light, deep umber and
near-black as the shadow, with cooled steel-blue used sparingly *as contrast rather than as colour*.
Saturation is moderate-to-high in the lights and crushed in the darks. The defining trait is not hue —
it is the **enormous value range** between the lit edge and the shadow side.

### STYLE PREFIX — ITEMS
> Stylized hand-painted fantasy game icon of a single object, three-quarter top-down loot-icon angle,
> object centred and filling the frame edge to edge, proportions deliberately exaggerated and
> chunky-heroic for readability,

### STYLE PREFIX — MONSTERS
> Stylized hand-painted fantasy creature portrait, head-and-shoulders bust, subject centred and facing
> three-quarters toward the viewer, eyes inside the middle 70% of the frame, proportions deliberately
> exaggerated and chunky-heroic for readability,

### STYLE SUFFIX (both)
> painted in confident thick brush strokes with heavy darkened edges instead of an inked outline, bold
> beveled forms, dramatic single warm key light from the upper left with a cool bounce fill from the
> lower right and one hot specular highlight, very wide value range from a bright lit edge to a
> near-black shadow side, warm palette of ember orange, hearth gold, deep umber and cool steel-blue
> accents, silhouette-first design that stays readable when shrunk to a 40-pixel thumbnail, no fine
> detail smaller than one-sixteenth of the frame, fully transparent background, no background scenery,
> no ground plane, no cast shadow, no drop shadow, no frame or border, no text, no watermark, no
> signature, no UI chrome.

### At 64px
- **Strengths.** Best silhouette of the painterly lanes — exaggerated proportions *are* thumbnail
  optimisation; this is precisely why Hearthstone's art looks the way it does (it is designed to be read
  at card size on a phone). The wide value range means the object separates from any background without
  needing an outline. Tier ladders differentiate by material *and* by light, so 7 rungs of one sword
  family stay distinguishable.
- **Risks.** Warm-on-warm collapse: a gold item on a gold key light loses its edge — the suffix's
  "cool bounce fill" clause exists to fight exactly that, and gold/brass items should be spot-checked
  first. Second risk: this lane flatters weapons and armour far more than it flatters a stew, a bar of
  metal or a seed. Expect the materials shelf to look weaker than the gear shelf.

### Theme fit
**Good on both.** Its value range is wide by construction, so it separates from near-black *and* from
cream. The only lane that needs no theme-specific instruction.

### Test prompt (paste-ready)
```
Stylized hand-painted fantasy game icon of a single object, three-quarter top-down loot-icon angle,
object centred and filling the frame edge to edge, proportions deliberately exaggerated and
chunky-heroic for readability, an iron longsword with a leather-wrapped grip, painted in confident
thick brush strokes with heavy darkened edges instead of an inked outline, bold beveled forms,
dramatic single warm key light from the upper left with a cool bounce fill from the lower right and
one hot specular highlight, very wide value range from a bright lit edge to a near-black shadow side,
warm palette of ember orange, hearth gold, deep umber and cool steel-blue accents, silhouette-first
design that stays readable when shrunk to a 40-pixel thumbnail, no fine detail smaller than
one-sixteenth of the frame, fully transparent background, no background scenery, no ground plane, no
cast shadow, no drop shadow, no frame or border, no text, no watermark, no signature, no UI chrome.
```

---

## 4 · Lane B — **GUILDMARK**
*(clean bold game-icon with dark outlines — Melvor Idle / mobile-idle adjacent)*

**Identity.** The game as a well-kept ledger of things you own. Every icon is a crisp badge: flat
planes, one confident dark outline, two shading steps and one highlight, nothing fussy. It says *this is
a systems game, and every object in it is a countable, tradeable, stackable unit.* Honest about what
Hearthrise actually is.

**Palette identity — HIGH SATURATION, cool-leaning, deliberately vivid.** Not the muted medieval band:
true cyan-steel, oxide green, rich crimson, saturated brass, violet-slate, all sitting on a hard
near-black outline. The colours are chosen so that **hue alone can encode a tier**, which no other lane
can do. This is a decidedly non-warm lane.

### STYLE PREFIX — ITEMS
> Clean bold game-icon illustration of a single object, three-quarter top-down loot-icon angle, object
> centred and filling the frame edge to edge, simplified graphic shapes with a strong readable
> silhouette,

### STYLE PREFIX — MONSTERS
> Clean bold game-icon illustration of a creature, head-and-shoulders bust, subject centred and facing
> three-quarters toward the viewer, eyes inside the middle 70% of the frame, simplified graphic shapes
> with a strong readable silhouette,

### STYLE SUFFIX (both)
> flat cel-shaded rendering with a uniform dark near-black contour line about four percent of the icon
> width around the whole subject and along major internal divisions, exactly two flat shadow tones plus
> one crisp highlight per surface and no gradients, no texture, no noise, vivid high-saturation palette
> of cyan-steel, oxide green, rich crimson, saturated brass and violet-slate, colour blocks large and
> unbroken, silhouette-first design that stays readable when shrunk to a 40-pixel thumbnail, no fine
> detail smaller than one-sixteenth of the frame, fully transparent background, no background scenery,
> no ground plane, no cast shadow, no drop shadow, no frame or border, no text, no watermark, no
> signature, no UI chrome.

### At 64px
- **Strengths.** **The best thumbnail performance of the five, and it is not close.** The contour line
  guarantees edge separation on any background, at any size, in any theme — this is the only lane that
  is genuinely background-independent. It is also the most *reproducible*: the style is a short list of
  hard rules (one outline weight, two tones, one highlight, no gradient), which a stochastic image
  model can hit repeatedly across 500 generations. Batch consistency is a real cost centre and this
  lane pays the least of it.
- **Risks.** 426 items in this style can read as clip-art or asset-store filler — it has the least
  *authored* feeling of the five. Tier ladders differentiate mainly by hue, so a 7-rung ladder becomes
  a rainbow rather than a material progression. And it is **the smallest step away from what Tyler just
  rejected**: the shipped set is already a flat/cel hybrid with a thick near-black outline. Guildmark is
  that set with higher saturation and cleaner geometry — a real improvement, but a *refinement* of the
  rejected direction rather than a different direction. Said plainly because it is the single most
  important thing to know before picking it.

### Theme fit
**Excellent on both — its defining practical advantage.** The contour line means the icon carries its
own edge and never borrows contrast from the background.

### Test prompt (paste-ready)
```
Clean bold game-icon illustration of a single object, three-quarter top-down loot-icon angle, object
centred and filling the frame edge to edge, simplified graphic shapes with a strong readable
silhouette, an iron longsword with a leather-wrapped grip, flat cel-shaded rendering with a uniform
dark near-black contour line about four percent of the icon width around the whole subject and along
major internal divisions, exactly two flat shadow tones plus one crisp highlight per surface and no
gradients, no texture, no noise, vivid high-saturation palette of cyan-steel, oxide green, rich
crimson, saturated brass and violet-slate, colour blocks large and unbroken, silhouette-first design
that stays readable when shrunk to a 40-pixel thumbnail, no fine detail smaller than one-sixteenth of
the frame, fully transparent background, no background scenery, no ground plane, no cast shadow, no
drop shadow, no frame or border, no text, no watermark, no signature, no UI chrome.
```

---

## 5 · Lane C — **CHRONICLE**
*(storybook ink-and-wash)*

**Identity.** The game as a hand-kept field journal. Objects are drawn first in a nervous brown-black
pen line, then washed with thin transparent colour that does not quite stay inside it. Intimate,
literate, hand-made — a world someone *recorded* rather than a product someone shipped. It is the only
lane with a voice you could recognise across a room.

**Palette identity — NEUTRAL-TO-COOL, low saturation, high white.** Walnut ink, parchment cream, thin
indigo and slate washes, muted moss. One warm ochre is reserved per image for the single most important
element, so warmth is *information*, not atmosphere. Large amounts of untouched white space are part of
the style.

### STYLE PREFIX — ITEMS
> Storybook ink-and-wash illustration of a single object, three-quarter top-down angle, object centred
> and filling the frame edge to edge, drawn as a page from a hand-kept field journal,

### STYLE PREFIX — MONSTERS
> Storybook ink-and-wash illustration of a creature, head-and-shoulders bust, subject centred and facing
> three-quarters toward the viewer, eyes inside the middle 70% of the frame, drawn as a page from a
> hand-kept bestiary,

### STYLE SUFFIX (both)
> confident walnut-brown-black pen line of varying weight with visible cross-hatching for shadow,
> overlaid with thin transparent watercolour washes that bleed slightly past the line and leave hard
> wash edges and small blooms, deliberate untouched white gaps, faint paper tooth, restrained
> neutral-cool palette of walnut ink, parchment cream, indigo, slate grey and muted moss with a single
> warm ochre accent on the most important element, line weight heavy enough to survive being shrunk to
> a 40-pixel thumbnail, no fine detail smaller than one-sixteenth of the frame, fully transparent
> background with no paper texture behind the subject, no background scenery, no ground plane, no cast
> shadow, no drop shadow, no frame or border, no text, no lettering, no watermark, no signature, no UI
> chrome.

### At 64px
- **Strengths.** The most distinctive lane by a distance, and the only one that would give Hearthrise a
  visual identity nobody else on the idle-game shelf has. It also handles the *non-gear* half of the
  catalogue best — a bundle of wheat, a cookbook, a burial bone all belong in a journal in a way they
  never belong in a hero-lit loot icon.
- **Risks.** **The highest thumbnail risk of the five.** Thin pen lines and pale washes are exactly the
  information that dies first in a downscale; below ~40 px the hatching becomes noise and the washes
  become a grey smear. Untreated, a meaningful fraction of a 426-image batch would be unusable at 34 px
  shop-row size. It is also the hardest style to keep consistent across a large batch, because "loose
  hand-drawn" is precisely the axis a model varies most.

### Theme fit
**This is the lane's disqualifying practical problem.** Ink-and-wash is a light-ground idiom: its
contrast comes from a dark line on a pale field. On `hearthlight` — the **default** theme, near-black
stone — a walnut-ink line on a transparent background loses almost all of its separation, and the pale
washes are the only thing left holding the shape. Making it work would mean giving every icon its own
pale parchment bed, which directly contradicts the transparent-background requirement and would put a
cream disc behind 426 icons on a dark UI. **Do not pick this lane without first accepting that trade.**

### Test prompt (paste-ready)
```
Storybook ink-and-wash illustration of a single object, three-quarter top-down angle, object centred
and filling the frame edge to edge, drawn as a page from a hand-kept field journal, an iron longsword
with a leather-wrapped grip, confident walnut-brown-black pen line of varying weight with visible
cross-hatching for shadow, overlaid with thin transparent watercolour washes that bleed slightly past
the line and leave hard wash edges and small blooms, deliberate untouched white gaps, faint paper
tooth, restrained neutral-cool palette of walnut ink, parchment cream, indigo, slate grey and muted
moss with a single warm ochre accent on the most important element, line weight heavy enough to
survive being shrunk to a 40-pixel thumbnail, no fine detail smaller than one-sixteenth of the frame,
fully transparent background with no paper texture behind the subject, no background scenery, no
ground plane, no cast shadow, no drop shadow, no frame or border, no text, no lettering, no
watermark, no signature, no UI chrome.
```

---

## 6 · Lane D — **QUARRYLIGHT**
*(chunky low-poly render)*

**Identity.** The game as a set of beautifully machined toys. Every object is a faceted, matte, softly
lit form that looks 3D-printed and then photographed on a seamless sweep. Tactile, modern, precise, a
little cold — it reads *premium contemporary* rather than *traditional fantasy*, and it is the lane that
would make Hearthrise look like a 2026 product rather than a 2011 one.

**Palette identity — DECIDEDLY COOL, low-to-mid saturation.** Slate blue, cool quarry grey, oxidised
steel, pale mint, bone white — with **exactly one warm accent per object** (an ember, a leather wrap, a
brass band), so warmth carries meaning instead of mood. The coolest of the five.

### STYLE PREFIX — ITEMS
> Chunky low-poly 3D render of a single object, three-quarter top-down loot-icon angle, object centred
> and filling the frame edge to edge, forms simplified into a small number of large flat facets,

### STYLE PREFIX — MONSTERS
> Chunky low-poly 3D render of a creature, head-and-shoulders bust, subject centred and facing
> three-quarters toward the viewer, eyes inside the middle 70% of the frame, forms simplified into a
> small number of large flat facets,

### STYLE SUFFIX (both)
> clean faceted geometry with visible flat planes and crisp edges, soft three-point studio lighting with
> a broad key from the upper left, gentle ambient occlusion in the crevices and a pale cool rim light
> along the shadow-side edge so the object separates from a dark background, matte low-roughness
> materials with no mirror reflections and no outline, cool palette of slate blue, quarry grey,
> oxidised steel, pale mint and bone white with exactly one warm accent colour on the object, strong
> simple silhouette that stays readable when shrunk to a 40-pixel thumbnail, no fine detail smaller
> than one-sixteenth of the frame, fully transparent background, no background scenery, no ground
> plane, no cast shadow, no contact shadow, no drop shadow, no frame or border, no text, no watermark,
> no signature, no UI chrome.

### At 64px
- **Strengths.** Geometry is simplified at the source, so silhouettes are inherently strong and the
  style degrades gracefully. Consistent lighting across a batch is easy to specify and models honour it
  well, so batch coherence is second only to Guildmark. Materials read as materials (stone is stone,
  metal is metal) without any surface detail, which is exactly right for 34 px.
- **Risks.** Two real ones. First, **low value contrast against a dark theme**: cool grey-blue on
  near-black, with no outline, is the classic edge-dissolve — the suffix's rim-light clause is
  load-bearing and its absence would sink the lane. Second, **the least medieval of the five**: a
  low-poly warhammer can read as a modern rubber mallet, and a low-poly cooked shark can read as a toy.
  Expect to add material words ("hand-forged", "riveted", "rough-hewn") to individual subject clauses
  more often here than anywhere else.

### Theme fit
**Strong on `cozy-light`; needs the rim-light clause to survive `hearthlight`.** That clause is already
in the suffix and must not be edited out. Spot-check the grey/stone items (`rubble`, `keystone`,
`iron_bar`) on the dark theme before committing to a full batch.

### Test prompt (paste-ready)
```
Chunky low-poly 3D render of a single object, three-quarter top-down loot-icon angle, object centred
and filling the frame edge to edge, forms simplified into a small number of large flat facets, an iron
longsword with a leather-wrapped grip, clean faceted geometry with visible flat planes and crisp edges,
soft three-point studio lighting with a broad key from the upper left, gentle ambient occlusion in the
crevices and a pale cool rim light along the shadow-side edge so the object separates from a dark
background, matte low-roughness materials with no mirror reflections and no outline, cool palette of
slate blue, quarry grey, oxidised steel, pale mint and bone white with exactly one warm accent colour
on the object, strong simple silhouette that stays readable when shrunk to a 40-pixel thumbnail, no
fine detail smaller than one-sixteenth of the frame, fully transparent background, no background
scenery, no ground plane, no cast shadow, no contact shadow, no drop shadow, no frame or border, no
text, no watermark, no signature, no UI chrome.
```

---

## 7 · Lane E — **COLD IRON**
*(dark-fantasy painterly — modern OSRS / RuneScape-adjacent)*

**Identity.** The game as a place with weather. Objects are painted semi-realistically and honestly worn
— nicked edges, dulled metal, damp leather, a haft polished by use — under a flat overcast northern
light. Grown-up and grounded. It is the lane that makes a tier-7 sword feel genuinely *dangerous* rather
than decorative, and the one that best supports the idea that this world is old and has been used.

**Palette identity — COOL, DESATURATED, moody.** Gunmetal, wet slate, moss green, ash blue, bone and
weathered oak. Warmth appears only as rust, brass or firelight, and is therefore always meaningful. The
narrowest saturation band of the five, and the second decidedly non-warm lane.

### STYLE PREFIX — ITEMS
> Dark-fantasy painterly illustration of a single object, three-quarter top-down loot-icon angle, object
> centred and filling the frame edge to edge, semi-realistic proportions, honestly worn and used,

### STYLE PREFIX — MONSTERS
> Dark-fantasy painterly illustration of a creature, head-and-shoulders bust, subject centred and facing
> three-quarters toward the viewer, eyes inside the middle 70% of the frame, semi-realistic proportions,
> scarred and weathered,

### STYLE SUFFIX (both)
> semi-realistic painterly rendering with blended visible brushwork, physically believable materials
> where metal picks up the cool sky and leather absorbs it, nicked edges, dulled surfaces and honest
> wear, flat overcast key light from above with a colder bounce from below, restrained specular
> highlights, cool desaturated palette of gunmetal, wet slate, moss green, ash blue, bone and weathered
> oak with warmth only as rust, brass or firelight, deliberately exaggerated dark-to-light value range
> so the silhouette stays readable when shrunk to a 40-pixel thumbnail, wear and texture kept broad and
> never finer than one-sixteenth of the frame, fully transparent background, no background scenery, no
> ground plane, no cast shadow, no drop shadow, no frame or border, no text, no watermark, no
> signature, no UI chrome.

### At 64px
- **Strengths.** The highest perceived production value of the five — this is what "expensive" looks
  like to most players, and it is the only lane that would let a screenshot of the inventory pass for a
  mainstream RPG. Critically for a 7-rung ladder, it **differentiates tiers by MATERIAL rather than by
  hue** (bronze → iron → steel → mithril → rune → emberforged → dawnsteel each read as a different
  metal, not a different colour), which is a better fit for Hearthrise's itemization than anything else
  here.
- **Risks.** Desaturated + low contrast + no outline is the hardest combination to read small; without
  the suffix's explicit "exaggerated value range" clause, roughly half a batch would be mud at 38 px.
  It is also the **least reproducible** lane — its appeal is nuance, and nuance is exactly what a
  stochastic model varies most across 500 generations. Budget for re-rolls, and generate each item
  family in one sitting so the family at least agrees with itself.

### Theme fit
**Excellent on `hearthlight` (the default). Weaker on `cozy-light`** — cool desaturated greys go flat
and lifeless against cream, and the wear detail disappears. If this lane wins, spot-check the light
theme early; a small "keep the darkest value near black" instruction fixes most of it.

### Test prompt (paste-ready)
```
Dark-fantasy painterly illustration of a single object, three-quarter top-down loot-icon angle, object
centred and filling the frame edge to edge, semi-realistic proportions, honestly worn and used, an iron
longsword with a leather-wrapped grip, semi-realistic painterly rendering with blended visible
brushwork, physically believable materials where metal picks up the cool sky and leather absorbs it,
nicked edges, dulled surfaces and honest wear, flat overcast key light from above with a colder bounce
from below, restrained specular highlights, cool desaturated palette of gunmetal, wet slate, moss
green, ash blue, bone and weathered oak with warmth only as rust, brass or firelight, deliberately
exaggerated dark-to-light value range so the silhouette stays readable when shrunk to a 40-pixel
thumbnail, wear and texture kept broad and never finer than one-sixteenth of the frame, fully
transparent background, no background scenery, no ground plane, no cast shadow, no drop shadow, no
frame or border, no text, no watermark, no signature, no UI chrome.
```

---

## 8 · The recommendation

**Pick Lane A — HEARTHFIRE.** The rejected set failed in a specific way, and it matters which way:
it is *austere* — muted, flat, correct, and totally unmemorable at 34 pixels. Three of the four
alternatives fix "unmemorable" by adding **subtlety** (Chronicle's hand, Cold Iron's wear, Quarrylight's
material honesty), and subtlety is exactly the thing a 64-pixel maximum render size destroys before the
player ever sees it — I measured that ceiling rather than assumed it, and it is the hardest constraint
in this document. Hearthfire is the only lane that fixes "unmemorable" by adding **confidence**:
exaggerated proportions, theatrical lighting and a very wide value range are not decoration here, they
are thumbnail engineering, and they are why Hearthstone's art survives being looked at on a phone.
It also happens to be the only lane that needs no theme-specific rescue clause, the only one whose tier
ladders read by both material and light, and — being a warm, dramatic, hand-painted lane against a
muted flat one — a genuinely different direction rather than a tidy-up of the thing Tyler just threw
out. **Guildmark is the safe pick and I would take it if the batch has to be right first time** — its
outline makes it bulletproof at 15 px on both themes and it is by far the most reproducible across 500
generations — but it is also the *smallest* step from the rejected art, and choosing it risks spending a
whole night to land somewhere Tyler has already said no to. **Cold Iron is my second choice and the
right one if the objection was "too cartoony/generic-mobile" rather than "too flat"** — accept up-front
that it will need re-rolls and a light-theme check. **I would not ship Chronicle**, however much I like
it: it is a light-ground idiom and Hearthrise's default theme is near-black, and no prompt fixes that.

---

## 9 · How the numbers in §2 were obtained (so they can be trusted or challenged)

Measured in-browser against the live preview on `localhost:8123`, not read off source. The six real
stylesheets (`legacy.css`, `art-direction.css`, `audit-overrides.css`, `combat-hud.css`,
`board-and-shop.css`, `theme-cozy.css` — 694,400 bytes total) were fetched with `cache:'reload'`,
inlined into a 1440×900 same-origin iframe carrying the real container markup with
`body[data-theme="hearthlight"]`, and every icon host measured with `getBoundingClientRect()` +
`getComputedStyle().objectFit`.

**Two findings from that pass that correct documents already in the repo:**

1. **`itemization-and-art-pipeline.md` cites a 96 px level-up celebration icon as an item render size.
   It is dead.** `legacy.css:2390` declares `width:96px;height:96px`, but `audit-overrides.css:128`
   overrides it to `32px !important` and wins. Measured: 32 px. **The true maximum item render in the
   game is the 64 × 64 detail modal**, which makes the 128 px long-edge source spec a clean 2× and
   confirms it — for the right reason this time.
2. **The `painted/monsters/` set is NOT "all 256 × 256" as that document's Appendix D states.** A full
   header walk of all 36 files: **30 are 128 px long-edge and non-square** (as low as 128 × 83 for
   `venom_spider.png`), and only the **6 Hunt bosses** are 256 × 256. That is a live defect, not
   trivia — the arena portrait and bestiary row both use `object-fit: cover` on a **square** box, so a
   128 × 83 portrait is scaled up and has ~35% of its width cropped away today. The monster spec in
   `monster-art-prompts.md` has been corrected accordingly (square, 256 × 256, non-negotiable).

Item icons, by contrast, are `object-fit: contain` at **every** measured site, and
`applyLocalIcons()` writes an inline `object-fit:contain` into `window._itemSVG` as well — so item
icons may safely be non-square and letterboxed. That asymmetry is why the two hard-spec tables differ.
