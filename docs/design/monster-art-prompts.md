# Monster Art Prompts — the full roster, ready to generate

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** production input, not a design doc.
**Serves:** `DEC-WAVE-01` — Tyler took the whole wave: *"all of it so I can get the AI artwork prompt
working asap."*

**Scope:** one AI-image-prompt-ready line for each of the **81 monster candidates** in
`docs/design/review-book-content.md` Library 1, plus the **4 residents** of Library 5's dungeon.
**85 lines.** Names, tiers and classes are the final ones from Review Book revision 2.

---

## 0 · How to use this file

Every line below is **the SUBJECT clause only**. It carries no style language — that is deliberate, so
the art direction can be swapped without rewriting 85 lines. Wrap it:

```
<STYLE PREFIX — MONSTERS>  +  <the subject line for this monster>  +  <STYLE SUFFIX>
```

### Where the wrapper comes from — **REVISED 2026-08-16**

> **The style wrapper that used to live here has been removed.** Tyler, 2026-08-16, binding:
> *"I don't like any of our current art; I want to move in a different direction."* The old prefix/suffix
> asked for a match to the shipped `painted/` set, and the old "style anchor = the existing 36-file set"
> instruction pointed at art that is no longer the target. Both are retired. The warm-desaturated
> "Forge & Stone" **palette** is likewise no longer a constraint — Forge & Stone survives as the
> **world** (castle, hearth, iron, stone, leather, timber), not as a colour temperature.

**Take the STYLE PREFIX — MONSTERS and the STYLE SUFFIX from the direction chosen in
[`art-direction-picker.md`](./art-direction-picker.md).** Use the **MONSTERS** prefix (head-and-shoulders
bust), not the ITEMS one. Items and monsters share one lane and one suffix on purpose — that shared
suffix is the mechanism that makes the item shelf and the bestiary look like one game. **Do not mix
lanes across a batch.**

### Output spec (hard requirements, checked before wiring)
| Property | Value |
|---|---|
| Format | PNG-24, RGBA, **real alpha** (colour type 6) — not a flattened white background |
| Canvas | **exactly 256 × 256, square — non-negotiable, and the shipped set gets this wrong today (see below)** |
| Framing | subject centred, eyes and face inside the middle **70%** of the frame |
| Filename | the monster's **game id**, `snake_case`, e.g. `winter_wolf.png` |
| Location | `assets/icons-bundle/painted/monsters/` — no new subfolders |
| Wiring | one line in `LOCAL_MONSTER_ICON` inside `applyLocalIcons()` at the bottom of `src/legacy.js` |

**Why square-and-256 is a hard rule, measured rather than assumed.** Monster art is rendered at
**36 px** (bestiary row), **38 px** (monster row), **56–96 px** (arena portrait) and **120 px** (monster
detail portrait) — and the bestiary row and the arena portrait both use **`object-fit: cover` on a square
box**, which crops to fill instead of letterboxing. A non-square portrait therefore loses its edges on
two of the game's four monster surfaces. **This is a live defect, not a hypothetical:** a header walk of
all 36 shipped files found **30 of them are 128 px long-edge and non-square** — `venom_spider.png` is
128 × 83, so roughly 35% of its width is cropped away in the arena today — and only the 6 Hunt bosses are
256 × 256. (An earlier audit's claim that the whole set is 256 × 256 was based on sampling only those
six.) 256 × 256 is a clean 2× of the 120 px detail portrait; the current 128 px files have no headroom at
all. Item icons are the opposite case — `contain` everywhere, so they may be non-square. See
`item-art-prompts.md`.

**Two things the prompt cannot enforce, so a human must check them:** *identity* (this repo has shipped a
boar labelled `bear.png` and a vampire labelled `dragon.png`) and *style fit*. Both need an Art Director
pass before wiring. Everything else — alpha, canvas, case-correct filename — is automatable and should be.

---

## 0.1 · The TWO-SIGNAL rule — **ADDED 2026-08-16, Tyler-approved**

**Why this exists, and it is worth knowing.** Tyler ran the test wolves through the Hearthfire wrapper
and read *"strong vs ice"* straight off the frost-armour coat without being told — the palette-hook rule
working exactly as designed, and the proof that art can carry mechanics here. He also read *"weak to
fire"* off warm tones in the same image, and **that one was a coincidence**: the wrapper puts a golden
key light on every subject, so *every* monster looks faintly fire-touched. One signal was real; one was
an accident of the lighting. This section makes the second signal real, and makes it impossible to
confuse with the lamp.

**A monster carries two readable facts, and they live in two different places.**

| | What it is | Where it lives |
|---|---|---|
| **Signal 1 — RESISTANCE** | the per-monster **override** axis (the Review Book's one-override rule) | **the BODY.** Frost-armour coat, char-and-ash hide, bone-dry Poison-immune skin. Big, structural, unmistakable. **Unchanged** — this is the rule that already worked. |
| **Signal 2 — WEAKNESS** | a **CLASS** property, so it is **eleven rules, not eighty-five** | **one small discrete MARKING** at named extremities, per §0.2's table |

**Signal 1 is unchanged and is restated here in full so nothing was lost in this rewrite** (the Art
Director's lane-relative form, kept verbatim in substance): the hooks are **relative notes against the
chosen lane's own palette**, not fixed swatches — Frost-resistant monsters carry the palette's
**coldest, palest** notes; Ember-resistant ones its **char and ash** notes; Poison-immune ones its
**bone and dry-stone** notes. In a cool lane the frost hook reads as the lightest value in frame; in a
warm lane it reads as the only cold thing in frame. Either way it must be the note that stands out. **If
a generation comes back without its hook, it is wrong even if it is beautiful.**

### The four constraints, in priority order

1. **A marking, never a light.** The accent is pigment *on* the creature — matte, patterned, slightly
   asymmetric — and it must survive being lit from any direction. It is never a glow, never a highlight,
   never a bloom. **This is the entire point:** a key light falls *on* a subject, so anything that falls
   on a subject carries no meaning. Only what is painted *into* the hide, bark, bone or stone means
   anything.
2. **Subtle.** Roughly 2–4% of the visible surface, at the extremities, desaturated. **The roster must
   not become traffic lights.** If the accent is the first thing you see, it is wrong.
3. **Consistent within a class**, so a player learns it once and it pays out eighty times.
4. **Three standing exemptions, so the grammar cannot produce false positives.** Signal lives *only* in
   discrete markings at the named locations. These say nothing and may be any colour: **(a) base hide /
   skin / scale / bark / stone colour** — that is material, not marking (a brick-red imp is just an
   imp); **(b) cloth, metal, props and jewellery** — a red surcoat, brass fittings and verdigris bronze
   are mute; **(c) emitted light** — glowing eyes, furnace seams, breath, a lit blade. **Corollary for
   the Ember-immune classes:** warm colour is allowed on them *only* as emitted light, never as a matte
   marking. That one restriction is what keeps the raw-red weakness accent unambiguous across the whole
   roster, and it is why several lines below lost a "hearth-orange warpaint" or a "dried-blood accent".

### When the two signals collide

**Resistance wins the body; the weakness accent moves to the smallest available extremity.** Do not blend
them and do not drop one — shrink it. Draconia is glacier-white horn to jaw (Frost-resistant) and carries
the raw-red line *only* along the jaw-scale edges. Winter Wolf is ice-blue and white with raw red *only*
at the ear tips.

**And the case where there is no second signal at all.** If a monster's one override **replaces** its
element axis with a resistance — the Dryad resists Ember, the Fire Elemental is immune to its own — it
has no weakness left to show and **carries no accent.** Painting one anyway is a lie. Frost Giant is the
inverse: his override redefines the element axis to Ember-weak, so he carries the **Ember** accent, not
Humanoid's Poison one. **The accent always follows the monster's actual weakness; the class table is the
default it inherits when it has not overridden.**

## 0.2 · The eleven class weakness accents

**Lane-safe by construction.** The *motif and placement* columns are absolute — they are shapes and body
parts, so they survive any style change. The *hue* is given as a relative rule against whatever palette
the chosen lane brings, with the concrete reading in brackets, exactly as Signal 1 is written.

| Class | Weakness | The accent — subtle, matte, ON the body |
|---|---|---|
| **Mammal** | Ember | the palette's rawest red at the **ear tips, nose leather and horn/antler tines** [raw madder-red] |
| **Vermin** | Frost | brittle pale **rime scarring along the chitin seams and wing/tail edges** [palest ice-blue] |
| **Plant** | Ember | a dry rust-red **curl on the outermost leaf and petal edges** — dead tinder, never burning |
| **Humanoid** | Poison | sickly staining in the **gums, nail beds and knuckle creases** [desaturated green-yellow] |
| **Human** | Poison | a faint sickly cast in the **veins at the temple, throat and back of the hands** |
| **Undead** | Ember | a dry waxy red **stain on exposed bone at the brow, jaw and knuckles** |
| **Demon** | Frost | hairline pale **cracks in the char crust at the horn base and knuckles** |
| **Dragon** | *(opposite of its breath)* | a thin line of the **opposing element's hue along the jaw scales or spine ridge**. A dragon that breathes nothing — Drake, Cave Wyrm, Elderscale — takes **Poison** |
| **Elemental** | *(opposite of its own)* | one thread of the **opposing element's hue running through the core seams** |
| **Construct** | Frost | hairline pale **frost-cracking at the joints and mortar seams** |
| **Extra Dimensional** | *hidden* | **no accent — the absence IS the signal.** Its element is unknown until 25 kills (PROG-01) and the art must not leak it |

Three hues, pinned so they cannot drift into each other or into the lamp: **Ember = the rawest, most
matte red available — never orange-gold and never glowing** (that is the key light) · **Frost = the
palest cold note, as scarring or cracking — never a wash or a sheen** · **Poison = a desaturated sickly
green-yellow in soft tissue — never a bright acid green** (that is a slime's material colour).

## 0.3 · For the record — lane and materials

- **Tyler has effectively chosen the HEARTHFIRE lane**, with final confirmation pending a warm-subject
  test. **Run the Hellhound.** It is the hardest case in the roster and therefore the only honest one: a
  char-black, Ember-immune body under a golden key light is exactly where the wrapper and this grammar
  are most likely to fight. If the Hellhound's pale frost-cracks survive the lamp, everything else will.
- **The metal-weapons materials fix is already agreed for the item sheet** — cold iron reads as cold
  metal, with warmth confined to grip and trim. **That lives in the Art Director's wrapper; this file
  does not restate it and must not fork it.** Noted here only so a later pass does not "fix" metals a
  second time in a different direction. Monster prompts inherit it for free: metal on a monster is an
  exempt surface under §0.1(4b) either way.

---

## 1 · Mammal — the tutorial class *(ranged / Ember)*

| id | Name | Subject line |
|---|---|---|
| MON-BEA-01 | Wild Boar | a bristled woodland boar with chipped yellow tusks and a mud-caked snout, small wary eyes, more stubborn than fierce; ochre bristle, wet-earth brown, dull ivory, raw madder-red ear tips |
| MON-BEA-02 | Stag | a lean red stag mid-turn as if about to bolt, wide branching antlers, alert and skittish; chestnut coat, pale antler bone, raw madder-red antler tines |
| MON-BEA-03 | Jackal | a wiry scavenging jackal with ears pricked and lip curled, ribs faintly showing, opportunistic rather than brave; dusty tan, grey muzzle, raw madder-red ear tips |
| MON-BEA-04 | Lynx | a thick-ruffed forest lynx with black ear tufts and a low ambusher's stare, shoulders coiled; smoke-grey spotted fur, cream chest, cold green eyes, raw madder-red ear tips |
| MON-BEA-05 | Mountain Ram | a heavy-horned mountain ram with a scarred blunt skull and deep curling horns, head lowered to charge; slate wool, weathered horn, cliff-grey, raw madder-red horn tips |
| MON-BEA-06 | Winter Wolf | a great wolf in a deep frost-laden white coat with ice crusted along its ruff, breath steaming, unbothered by cold; snow white, pale ice blue, dark storm grey, raw madder-red only at the ear tips **(Frost-resistant: the coat must read as armour against cold)** |
| MON-BEA-07 | Giant Boar | an enormous slab-shouldered boar gone fat and slow, half-closed eyes, a mountain of muscle and bristle; deep umber, muddy grey, raw madder-red ear tips |
| MON-BEA-08 | Mammoth | a shaggy tusked mammoth bust with a raised trunk and immense curved ivory, ancient and unhurried; dun-brown shag, cream ivory, cold blue shadow, raw madder-red ear edges |
| MON-BEA-09 | Elk King | **BOSS** — a colossal elk with a crown of antlers hung with moss and old votive ribbons, one eye clouded, regal and sorrowful; deep forest green, weathered bone antler, dusty cream ribbon, raw madder-red antler tines |

## 2 · Vermin — small, many, unimpressed by your sword *(hammer / Frost, Poison-immune)*

| id | Name | Subject line |
|---|---|---|
| MON-VER-01 | Barn Rat | a fat barn rat with a torn ear and a wet nose, whiskers forward, entirely unafraid of you; grubby brown fur, pink tail, straw flecks, brittle pale rime scarring on the tail |
| MON-VER-02 | Hive Wasp | an oversized hive wasp hovering at eye level, wings blurred, barbed abdomen curled forward; hazard yellow and black, chitin gloss, brittle pale rime scarring along the wing edges |
| MON-VER-03 | Locust Swarm | a dense boiling cluster of locusts forming a rough head-and-shoulders silhouette, individual insects readable at the edges; dry husk brown, dull olive, chaff dust, pale rime scarring on the nearest wings |
| MON-VER-08 | Ooze | a translucent gelatinous ooze holding a vague head shape, undissolved bones and a spoon suspended inside it; murky moss-grey, glassy highlights, cellar damp, brittle pale rime crust at the rim |
| MON-VER-04 | Centipede | a mine-dwelling centipede rearing up, dozens of legs and two hooked mandibles, segmented plate armour; blue-black chitin, dull bronze leg joints, pale rime scarring along the segment seams |
| MON-VER-05 | Giant Spider | a heavy-bodied giant spider with eight glassy eyes and silk trailing from its fangs, patient and still; charcoal fur, bone-white silk, dull slate markings, pale rime scarring at the leg joints |
| MON-VER-06 | Carrion Swarm | a thick humming cloud of carrion flies packed dense enough to hold a shape, the silhouette fraying at the edges; oil-slick green-black, dull grey haze, brittle pale rime frost on the outermost flies **(only cold thins it)** |
| MON-VER-07 | Broodmother | **BOSS** — a vast pale brood spider, abdomen swollen and faintly luminous with eggs, front legs raised in threat; sickly ivory, bruise purple, wet chitin black, pale rime scarring along the abdomen seams |

## 3 · Plant — rooted, patient, and it burns *(sword / Ember, resists Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-PLA-01 | Mandrake | a screaming mandrake root pulled half free of the soil, a knotted humanoid face in the tuber, mouth wide open; pale root cream, damp earth brown, bitter green leaves, dry rust-red curl at the leaf edges |
| MON-PLA-02 | Shrieker | a tall fungal shrieker with a bulbous cap split into a ragged vertical mouth, spores drifting; bruised violet cap, bone-pale stalk, drifting spores, dry rust-red curl at the cap fringe |
| MON-PLA-03 | Bog Vine | a mass of thorned bog vines knotted into a hunched torso with no face, arrows and a broken spear still stuck in it; wet moss green, black bog water, pale broken shafts, dry rust-red curl on the outer leaves |
| MON-PLA-04 | Carnivorous Plant | a huge hinged flytrap head on a thick stem, teeth-like fringes, a fishing rod handle still poking out between them; acid green, wet pink maw interior, sap gloss, dry rust-red curl at the fringe tips |
| MON-PLA-05 | Dryad | a bark-skinned dryad with a solemn woman's face grown into a living tree, leaves for hair, sap beading like sweat; green-black bark, spring leaf green, damp sap amber **(Ember-resistant: living wood, no char, and NO accent — she overrides the weakness)** |
| MON-PLA-06 | Treant | **BOSS** — an ancient oak treant, face carved deep into the trunk, moss-bearded, one great root-hand raised; storm-grey bark, deep amber heartwood in the cracks, moss green, dry rust-red curl at the leaf tips |

## 4 · Humanoid — goblins, trolls, ogres, giants *(sword / Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-HUM-02 | Kobold | a small snouted kobold in scavenged rags with a bone fetish necklace, cunning and twitchy; scaly grey-brown hide, rag brown, bone white, sickly green-yellow gums |
| MON-HUM-11 | Gnoll | a hyena-headed gnoll scavenger with a matted mane and a stolen helmet that does not fit, grinning; mangy tan fur, dented iron helm, sickly green-yellow gums |
| MON-HUM-04 | Rock Troll | a hulking rock troll whose hide is scabbed over with actual stone, heavy brow, quarry dust in every crease; granite grey, grey lichen, dull ore glints, sickly green-yellow in the knuckle creases |
| MON-HUM-05 | Ogre | a huge dull-eyed ogre with an underbite and a club resting on one shoulder, more slow than cruel; liver-brown skin, filthy hide wrap, rope and bone, sickly green-yellow nail beds |
| MON-HUM-10 | Minotaur | a broad bull-headed minotaur with a brass ring through its nose and one horn snapped short, head lowered to charge; black-brown hide, brass fittings, breath steam, sickly green-yellow gums |
| MON-HUM-06 | Frost Giant | a bearded northern giant with rime in his braids and frost-burned cheeks, furs and iron rings; pale ice blue, bleached fur white, cold iron grey, raw madder-red only at the ear tips and nose **(Frost-resistant, Ember-weak: the accent is Ember, not Poison; no other warm tone)** |
| MON-HUM-09 | Cyclops | a one-eyed cyclops with a heavy jutting brow over a single wide eye, scarred bald skull, dumbly furious; sallow slab skin, iron collar, bone-yellow tooth, sickly green-yellow nail beds |
| MON-HUM-08 | Stonejaw | **BOSS** — a scarred goblin chieftain with a crude iron jaw riveted to his face, a warlord's fur mantle and a circlet of enemy teeth; ash-grey skin, blackened iron, bone-white warpaint, sickly green-yellow gums |

## 5 · Human — bandits and casters both *(ranged / Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-ARC-01 | Witch's Apprentice | a nervous teenage apprentice in an oversized hood, one hand glowing badly and the other holding a dropped book; homespun brown, faint violet spell light, ink stains, faint sickly cast in the temple veins |
| MON-HUM-01 | Cutpurse | a wiry roadside thief with a scarf pulled over the nose, eyes bright with mischief, coins spilling from one fist; road-dust brown, tarnished silver, coin glint, faint sickly cast in the throat veins |
| MON-ARC-02 | Cultist | a hooded candle-cultist with wax running down the mask, expression hidden, small flame held at the chin; ash grey robe, dripping bone wax, small warm flame, faint sickly cast in the veins of the hand |
| MON-HUM-03 | Deserter | a grim deserting soldier in dented, badly-repaired plate with his unit's colours cut away, tired eyes; dull steel, faded surcoat red, leather straps, faint sickly cast in the temple veins **(plate: the reason a hammer answers him)** |
| MON-ARC-03 | Adept | a rune-scarred adept, sigils burned into shaved scalp and cheeks, holding a cracked essence stone; parchment-pale skin, cold rune blue, scholar's grey, faint sickly cast in the temple veins |
| MON-ARC-04 | Conjurer | a conjurer wreathed in a small orbiting ring of flame that does not burn him, calm and smug; char-black robe, hearth-orange fire, faint sickly cast in the veins of the hands **(Ember-immune: the fire is emitted light, never a marking)** |
| MON-ARC-05 | Astrologer | a star-reading astrologer in a deep hood scattered with tiny lights, eyes reflecting constellations, holding a bent brass instrument; midnight blue, brass, starlight white, faint sickly cast at the throat |
| MON-HUM-07 | Bandit Lord | a broad-shouldered bandit lord in mismatched stolen finery over road leathers, gold rings on every finger, entirely at ease; oxblood velvet, road-worn leather, stolen gold, faint sickly cast in the back-of-hand veins |
| MON-ARC-06 | Necromancer | **BOSS** — a gaunt necromancer with a bone crown and a hand full of grave dust, dead-eyed and utterly composed; shroud grey, tarnished silver, a faint sickly green cast in the veins under the skin |

## 6 · Undead — bones and grief *(hammer / Ember, Poison-immune, Frost-resistant)*

| id | Name | Subject line |
|---|---|---|
| MON-UND-01 | Wight | a churchyard wight in a rotted burial shroud, skin drawn tight, faint cold light in the eye sockets; grave-cloth grey, dried skin ochre, pale blue eye-light, dry madder-red stain on the brow bone |
| MON-UND-02 | Ghoul | a hunched ghoul with a distended jaw and blackened fingers, plague sores and a swollen belly; sallow grey-ochre, bruise purple, blackened sores, dry madder-red stain on the jawbone **(Poison-dealing, Poison-immune: sores are blackened, never sickly green)** |
| MON-UND-03 | Barrow Knight | a barrow-buried knight in verdigris-crusted mail with a heavy iron key at the belt, helm slitted and empty; oxidised green-bronze, grave dust, faint cold blue, dry madder-red stain on the exposed jawbone |
| MON-UND-04 | Drowned Dead | a bloated drowned corpse with waterlogged flesh, weed in the hair and a rope still round the neck, sea-water running out; drowned grey, kelp black, pale salt crust, dry madder-red stain at the knuckle bone |
| MON-UND-05 | Grave Banshee | a wailing banshee, mouth stretched impossibly wide, hair streaming upward, translucent at the edges; shroud white, cold spectral blue-green, hollow black mouth, dry madder-red stain along the jaw |
| MON-UND-06 | Revenant | a towering skeletal revenant of mismatched bones bound by dark sinew, rib cage hung with old trophies; bone yellow-white, tar-black sinew, dull iron, dry madder-red stain at brow and knuckles |
| MON-UND-07 | Vampire Bride | a poised vampire bride in a faded wedding veil, delicate and razor-sharp, drinking the *warmth* out of the air rather than blood, the air visibly dimming at her lips; bone porcelain skin, wine red, tarnished silver lace, dry madder-red flush at the fingertips **(the drain must read as energy, not gore — no blood)** |
| MON-UND-08 | Grim Reaper | **BOSS** — the Grim Reaper: a hooded skeletal figure, face a lit void under the cowl, scythe blade entering frame over one shoulder; void black robe, bone white, one cold point of light, dry madder-red stain along the jawbone |

## 7 · Demon — things that came up *(magic / Frost, Ember-immune)*

| id | Name | Subject line |
|---|---|---|
| MON-DEM-06 | Imp | a knee-high imp with bat wings and an enormous grin, tiny horns, holding a stolen spoon like a sword; brick-red hide, soot black, glowing orange eyes, hairline pale cracks at the horn base |
| MON-DEM-07 | Nightmare | a demon horse with a burning mane and no eyes, nostrils streaming smoke, bridle fused into the flesh; coal black, ember orange mane, scorched iron, hairline pale cracks at the horn base |
| MON-DEM-01 | Fire Devil | a squat fire devil with cracked charcoal skin glowing at the seams, small horns, arms folded smugly; charcoal black, molten orange seams, ash grey, hairline pale cracks in the crust at the knuckles **(Ember-immune: warm tones are emitted light, never markings)** |
| MON-DEM-02 | Hellhound | a lean two-headed hellhound mid-lunge, both jaws open, embers falling from the muzzles; char black fur, ember red glow, ash grey, hairline pale cracks in the crust along the muzzles **(the warm-subject lane test: the cracks must survive the key light)** |
| MON-DEM-03 | Chained Demon | a powerful demon bound in heavy rune-etched chains, head lowered, eyes fixed on you with terrible patience; bruised crimson hide, cold iron chain, faint rune blue, hairline pale cracks at the horn base |
| MON-DEM-04 | Fury | a winged fury with a glassy chitinous carapace and long blade-edged talons, shrieking; obsidian black, glass-blue sheen, molten cracks, hairline pale rime cracks at the talon base **(sword-resistant: the carapace must look like it would blunt a blade)** |
| MON-DEM-05 | Vharek | **BOSS** — Vharek, an enormous pit lord with a crown of broken horns, brimstone light in the throat and chest, mountainous and contemptuous; volcanic black hide, brimstone orange, blackened gold, hairline pale cracks at the base of the broken horns |

## 8 · Dragon — scaled against blades *(ranged / opposed to its breath)*

| id | Name | Subject line |
|---|---|---|
| MON-DRA-08 | Salamander | a hand-sized fire salamander clinging to a hot stone, skin patterned like cooling lava, tail curled; coal black, ember orange banding, ash grey, a thin pale rime line along the jaw scales |
| MON-DRA-01 | Wyrmling | a young marsh wyrmling with soft new scales and oversized eyes, frost breath curling from the nostrils; moss green scale, pale frost white, wet slate, a thin raw madder-red line along the jaw scales |
| MON-DRA-02 | Wyvern | a cliffside wyvern with hooked wing-claws and a barbed tail over the shoulder, ember smoke at the jaw; slate blue-grey scale, ember orange throat, bone spur, a thin pale rime line along the spine ridge |
| MON-DRA-03 | Cave Wyrm | a wingless burrowing wyrm with a blunt armoured snout and blind milky eyes, earth packed between the scales; dark ore grey, pale blind-eye white, clay brown, a thin sickly-green line along the jaw scales **(hammer-weak: no wings; breathes nothing, so Poison)** |
| MON-DRA-04 | Drake | a bronze-scaled drake with metallic overlapping plates and cold intelligent eyes, no breath glow at all; burnished bronze, smoke-grey shadow, amber eye, a thin sickly-green line along the jaw scales |
| MON-DRA-05 | Draconia | **BOSS** — Draconia, a great white dragon queen, frost sheeting off her horns and jaw, imperious and ancient; glacier white, deep ice blue, pale gold eye, a thin raw madder-red line only at the jaw-scale edges **(Frost-resistant, Ember-weak: accent shrunk to the smallest extremity)** |
| MON-DRA-06 | Ashwing | **BOSS** — Ashwing, a black dragon whose wings are burning at the trailing edge, ash falling constantly, ember light behind the teeth; char black, ember orange, drifting grey ash, a thin pale rime line along the spine ridge |
| MON-DRA-07 | Elderscale | **BOSS** — Elderscale, the elder raid wyrm, scales scarred and overgrown with ages of lichen, one enormous slitted eye dominating the frame; ancient bronze-green, lichen grey, deep amber, a thin sickly-green line along the jaw scales |

## 9 · Elemental — it *is* the element *(magic / opposed to its own)*

| id | Name | Subject line |
|---|---|---|
| MON-ELE-01 | Fire Elemental | a small hearth-fire elemental, a curled figure of living flame with two bright coal eyes, warm rather than hostile; hearth orange, ember gold, soot grey, one pale rime thread in the core seams |
| MON-ELE-02 | Water Elemental | a brook elemental of clear running water holding a rough head shape, pebbles and a trout suspended inside it; clear blue-green, river stone grey, white foam, one raw madder-red thread in the core |
| MON-ELE-03 | Air Elemental | a spiralling air elemental of dust and wind with a barely-there face, leaves and three arrows caught circling in it; dust ochre, pale sky grey, translucent white, one pale rime thread in the spiral **(ranged-resistant: arrows visibly passing through)** |
| MON-ELE-04 | Earth Elemental | a squat granite elemental with quartz veins and a jaw of loose scree, slow and unbothered; granite grey, quartz white, ore-vein brass, one pale rime thread in the quartz veins |
| MON-ELE-05 | Ice Elemental | a jagged ice elemental of fused blue-white shards with a hollow ringing chest cavity; glacier blue, frost white, deep shadow indigo, one raw madder-red thread deep in the shards **(Frost-immune, Ember-weak)** |
| MON-ELE-06 | Magma Elemental | a forge-hearted magma elemental of cooling black crust split by molten channels, slag dripping; obsidian black, molten gold-orange, grey slag, one pale rime thread in the cooling crust |
| MON-ELE-07 | Storm Elemental | a crackling storm elemental of dark cloud and lightning with a stormlit hollow face, rain sheeting through it; thunderhead grey-violet, lightning white, cold rain blue, one sickly-green thread in the cloud |
| MON-ELE-08 | Elder Cinder | **BOSS** — the Elder Cinder, a towering figure of banked coals and drifting ash with a slow deep glow at the core, immensely old; deep ember red, ash grey, blackened gold, one pale rime thread in the banked coals |

## 10 · Construct — no blood to spill *(hammer / Frost, Poison-immune, Ember-resistant)*

| id | Name | Subject line |
|---|---|---|
| MON-CON-01 | Scarecrow | a farmyard scarecrow that has stood up, sack head with stitched crooked eyes, straw bursting from the collar, a crow perched unbothered on one shoulder; straw gold, sackcloth cream, black stitching, hairline pale frost-cracking at the joints |
| MON-CON-02 | Stone Golem | a village millstone golem, a torso built from a cracked grinding wheel and dressed blocks, flour dust in the seams; mill grey, flour white, iron banding, hairline pale frost-cracking in the mortar seams |
| MON-CON-03 | Clay Golem | a heavy clay golem with thumbprints still visible in the surface and a rune pressed into the forehead, blank and patient; kiln red-brown clay, dry clay cream, faint rune blue, hairline pale frost-cracking at the joints |
| MON-CON-04 | Watchknight | an empty suit of animated plate armour standing at attention, visor open onto nothing but darkness; rusted steel, rust-brown streaks, faint cold void inside, hairline pale frost-cracking at the joints |
| MON-CON-05 | Gargoyle | a cathedral gargoyle mid-wakening, stone wings cracking free of centuries of moss, chipped snarling face; cathedral grey stone, moss green, rain-stain black, hairline pale frost-cracking along the wing seams |
| MON-CON-06 | Iron Colossus | **BOSS** — the Iron Colossus, the head and shoulders of a vast siege automaton, a lantern furnace burning behind its face grille, still following an order nobody remembers giving; blackened iron, hearth-orange furnace glow, verdigris bronze, hairline pale frost-cracking at the plate joints |

## 11 · Extra Dimensional — the thing after the end *(sword / one hidden element)*

**No weakness accent on any of these four — the absence is the signal.** No red at the extremities, no
rime scarring, no sickly green anywhere. This class's element is hidden until 25 kills, and art that
leaks it breaks PROG-01's only genuinely new idea. **Any accent-shaped marking here is a rejection.**

| id | Name | Subject line |
|---|---|---|
| MON-VOI-01 | Void Mote | a small hovering void mote, a hole in the world with a faint prismatic rim, the background visibly wrong around its edge; absolute black, thin prismatic rim, cold starlight, no weakness accent anywhere |
| MON-VOI-02 | Starhusk | the husk of a person hollowed out from inside, star-stuff spilling slowly from the eyes and mouth, still wearing a farmer's collar; ash grey skin, cold starlight white, homespun brown, no weakness accent anywhere **(tragic, not monstrous)** |
| MON-VOI-03 | The Silence | a tall faceless figure that seems to absorb sound, edges blurring into nothing, no mouth at all; matte void black, dull grey non-reflection, one faint pale seam, no weakness accent anywhere |
| MON-VOI-04 | The Unlit | **BOSS** — The Unlit, a vast crowned silhouette of pure absence with a single extinguished hollow where a hearth-fire should be, everything around it dimmed; deepest black, cold ash grey, one dead ember, no weakness accent anywhere |

## 12 · Dungeon residents — The Long Night *(Library 5)*

Same wrapper and same output spec as every other monster. These four share one visual grammar: **a
decaying manor's palette — wine red, dust, tarnished silver, candlelight — so the set reads as a
household even at thumbnail size.** Read those four notes as *relative* within the chosen lane (its
deepest red, its dustiest neutral, its most tarnished metal, its warmest light), not as fixed swatches.

| id | Name | Subject line |
|---|---|---|
| DNG-VAMP-02 | The Old Soldier | **BOSS** — an ancient warrior vampire in six-centuries-out-of-date armour, magnificent moustache, chest of tarnished medals, absolutely certain of his own importance; dusty crimson, tarnished silver, candlelight gold, dry madder-red stain along the jawbone |
| DNG-VAMP-03 | The Baron | **BOSS** — a flamboyant cursed aristocrat vampire in three centuries of layered stolen fashion, lace at the throat, one theatrical raised eyebrow; oxblood velvet, moth-eaten lace cream, candle gold, dry madder-red stain at the knuckle bone |
| DNG-VAMP-04 | The Bride | **BOSS** — reuse **MON-UND-07 Vampire Bride** — a poised vampire bride in a faded veil, drinking the warmth out of the room, the air visibly dimming at her lips, withering unamused stare; bone porcelain, wine red, tarnished silver lace, dry madder-red flush at the fingertips |
| DNG-VAMP-05 | The Familiar | **BOSS** — a devoted living human servant, ordinary and exhausted, cardigan over a butler's collar, holding a candle and a household ledger, utterly sincere; homespun grey-brown, warm candlelight, dust, faint sickly cast in the throat veins |

**Legal note, non-negotiable.** These four are original characters built from folklore archetypes that
long predate any modern work — the boastful ancient warrior, the decadent aristocrat, the sharp-tongued
bride, the loyal mortal servant. **No protected name, no character likeness, no quoted line, and no
reference to any television series may appear in a prompt, a filename, an item name or an item
description.** If a generated portrait resembles a specific real performer, it is rejected and
regenerated — that is an identity failure exactly like the boar-labelled-bear, and it needs the same
human sign-off.

---

## 13 · Batch order — **REVISED 2026-08-16**

The order below changed with the style change. Under the old plan the whole roster was new art on an
empty shelf; now **every portrait generated is a replacement for something a player is looking at
today**, so the 31 monsters that are actually live come first, ahead of every wave candidate.

### Batch M0 — the 31 LIVE monsters (`src/data/monsters.js`)

These 31 are in the game right now and 30 of them have a shipped portrait in the old style. Until all 31
are regenerated, the bestiary is a **mixed shelf** — half new direction, half rejected direction — which
looks worse than either style on its own. **Finish this batch before starting any candidate.**

Within the batch, work up the tiers, because that is the order players meet them:

| tier | ids |
|---|---|
| T1 | `slime` · `rat` · `goblin` · `weak_skeleton` · `small_wolf` |
| T2 | `giant_bat` · `hobgoblin` · `wolf` · `skeleton` · `dark_wizard` |
| T3 | `venom_spider` · `goblin_brute` · `dire_wolf` · `zombie` · `warlock` |
| T4 | `plague_swarm` · `goblin_warlord` · `bear` · `wraith` · `lesser_demon` · `mountain_troll` |
| T5 | `shadow_creeper` · `warband_captain` · `panther` · `death_knight` · `archmage` |
| T6 | `void_parasite` · `war_king` · `ancient_bear` · `lich` · `dragon` |

**Three of these 31 are not replacements but repairs, and they are the highest-value files in the whole
monster program.** Do them first inside their tier, not last:

- **`bear` / `ancient_bear`** — the shipped `bear.png` **is a wild boar** (tusked snout, hoofed legs, no
  bear features). Both ids point at it.
- **`dragon`** — the shipped `dragon.png` **is a pale humanoid vampire bust** with no draconic features
  at all, and it is used by the game's own capstone Green Dragon.
- **`mountain_troll`** — the one live monster with **no portrait at all**; it falls back to a glyph.

Also note that all six Hunt bosses' portraits (`emberclad_tyrant`, `crownless_wyrm`, `hollow_regent`,
`maw_below`, `sunken_choir`, `warden_long_dark`) live in the same folder and are on the same shelf — they
are not in `monsters.js` and so are not in the 31, but they must be regenerated in the same style before
the bestiary is coherent.

### Batches M1+ — the wave candidates, by tier

Only after M0 is complete.

1. **T1–T2 candidates, every class (21).** Highest ratio of "players who see it" to "portraits painted" —
   every new character meets these in the first hour.
2. **The eleven candidate bosses.** They are what players screenshot, and the live roster has two.
3. **T3–T4 (23).**
4. **T5–T6 non-boss (26).**
5. **The four dungeon residents** — they can ship with the dungeon rather than with the roster.

### Interleaving with the item batches

The item sheet (`item-art-prompts.md` §4.1) runs ten batches. **Run monster batch M0 between item batch
8 (uniques and boss loot) and item batch 9 (paperwork)** — the boss loot and the bosses that drop it are
the same screenshot, and they should change style in the same sitting.
