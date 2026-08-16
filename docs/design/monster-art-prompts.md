# Monster Art Prompts — the full roster, ready to generate

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** production input, not a design doc.
**Serves:** `DEC-WAVE-01` — Tyler took the whole wave: *"all of it so I can get the AI artwork prompt
working asap."*

**Scope:** one AI-image-prompt-ready line for each of the **81 monster candidates** in
`docs/design/review-book-content.md` Library 1, plus the **4 residents** of Library 5's dungeon.
**85 lines.** Names, tiers and classes are the final ones from Review Book revision 2.

---

## 0 · How to use this file

Every line below is **the SUBJECT clause only**. Wrap it:

```
<STYLE PREFIX>  +  <the subject line for this monster>  +  <STYLE SUFFIX>
```

### STYLE PREFIX — paste before every subject
> Painted fantasy creature portrait in a warm cozy-medieval illustration style, head-and-shoulders bust,
> subject centred and facing three-quarters toward the viewer, eyes inside the middle 70% of the frame,

### STYLE SUFFIX — paste after every subject
> semi-realistic painterly rendering with visible soft brushwork, flat-toned shading rather than
> photographic gradients, one warm rim-light from the upper left and a cool fill from the lower right,
> warm slightly desaturated "Forge & Stone" palette (bronze, iron blue-grey, steel silver-blue, leather
> brown, parchment cream, hearth-orange accents), fully transparent background, no background scenery,
> no ground plane, no drop shadow, no border, no text, no watermark, no UI frame, square composition,
> reads clearly at thumbnail size.

### Output spec (hard requirements, checked before wiring)
| Property | Value |
|---|---|
| Format | PNG-24, RGBA, **real alpha** (colour type 6) — not a flattened white background |
| Canvas | **exactly 256 × 256** (house Style B; item icons are a different spec) |
| Filename | the monster's **game id**, `snake_case`, e.g. `winter_wolf.png` |
| Location | `assets/icons-bundle/painted/monsters/` — no new subfolders |
| Wiring | one line in `LOCAL_MONSTER_ICON` inside `applyLocalIcons()` at the bottom of `src/legacy.js` |
| Style anchor | the existing 36-file `painted/monsters/` set (e.g. `emberclad_tyrant.png`). **Do not** anchor on `wolf_pup.png`/`hawk.png` — they are a known style outlier |

**Two things the prompt cannot enforce, so a human must check them:** *identity* (this repo has shipped a
boar labelled `bear.png` and a vampire labelled `dragon.png`) and *style fit*. Both need an Art Director
pass before wiring. Everything else — alpha, canvas, case-correct filename — is automatable and should be.

**Palette hooks are deliberate and load-bearing.** A monster's element weakness is supposed to be
*legible from the art* (the Review Book's one-override rule). So Frost-resistant monsters get pale
blue-white notes, Ember-resistant ones get char and ash, Poison-immune ones get bone and dry stone. If a
generation comes back without its hook colour, it is wrong even if it is beautiful.

---

## 1 · Mammal — the tutorial class *(ranged / Ember)*

| id | Name | Subject line |
|---|---|---|
| MON-BEA-01 | Wild Boar | a bristled woodland boar with chipped yellow tusks and a mud-caked snout, small wary eyes, more stubborn than fierce; ochre bristle, wet-earth brown, dull ivory |
| MON-BEA-02 | Stag | a lean red stag mid-turn as if about to bolt, wide branching antlers, alert and skittish; chestnut coat, pale antler bone, autumn-gold highlights |
| MON-BEA-03 | Jackal | a wiry scavenging jackal with ears pricked and lip curled, ribs faintly showing, opportunistic rather than brave; dusty tan, grey muzzle, amber eye |
| MON-BEA-04 | Lynx | a thick-ruffed forest lynx with black ear tufts and a low ambusher's stare, shoulders coiled; smoke-grey spotted fur, cream chest, cold green eyes |
| MON-BEA-05 | Mountain Ram | a heavy-horned mountain ram with a scarred blunt skull and deep curling horns, head lowered to charge; slate wool, weathered horn, cliff-grey |
| MON-BEA-06 | Winter Wolf | a great wolf in a deep frost-laden white coat with ice crusted along its ruff, breath steaming, unbothered by cold; snow white, pale ice blue, dark storm grey **(Frost-resistant: the coat must read as armour against cold)** |
| MON-BEA-07 | Giant Boar | an enormous slab-shouldered boar gone fat and slow, half-closed eyes, a mountain of muscle and bristle; deep umber, muddy grey, warm ochre |
| MON-BEA-08 | Mammoth | a shaggy tusked mammoth bust with a raised trunk and immense curved ivory, ancient and unhurried; rust-brown shag, cream ivory, cold blue shadow |
| MON-BEA-09 | Elk King | **BOSS** — a colossal elk with a crown of antlers hung with moss and old votive ribbons, one eye clouded, regal and sorrowful; deep forest green, weathered bone antler, hearth-gold ribbon |

## 2 · Vermin — small, many, unimpressed by your sword *(hammer / Frost, Poison-immune)*

| id | Name | Subject line |
|---|---|---|
| MON-VER-01 | Barn Rat | a fat barn rat with a torn ear and a wet nose, whiskers forward, entirely unafraid of you; grubby brown fur, pink tail, straw flecks |
| MON-VER-02 | Hive Wasp | an oversized hive wasp hovering at eye level, wings blurred, barbed abdomen curled forward; hazard yellow and black, amber wing sheen, chitin gloss |
| MON-VER-03 | Locust Swarm | a dense boiling cluster of locusts forming a rough head-and-shoulders silhouette, individual insects readable at the edges; dry husk brown, sickly green-gold, chaff dust |
| MON-VER-04 | Ooze | a translucent gelatinous ooze holding a vague head shape, undissolved bones and a spoon suspended inside it; murky green-grey, glassy highlights, cellar damp |
| MON-VER-05 | Centipede | a mine-dwelling centipede rearing up, dozens of legs and two hooked mandibles, segmented plate armour; blue-black chitin, rust-orange leg joints, lantern glint |
| MON-VER-06 | Giant Spider | a heavy-bodied giant spider with eight glassy eyes and silk trailing from its fangs, patient and still; charcoal fur, bone-white silk, dull crimson markings |
| MON-VER-07 | Carrion Swarm | a thick humming cloud of carrion flies packed dense enough to hold a shape, the silhouette fraying at the edges; oil-slick green-black, dull grey haze, cold blue rim **(only cold thins it — a faint frost note at the edges)** |
| MON-VER-08 | Broodmother | **BOSS** — a vast pale brood spider, abdomen swollen and faintly luminous with eggs, front legs raised in threat; sickly ivory, bruise purple, wet chitin black |

## 3 · Plant — rooted, patient, and it burns *(sword / Ember, resists Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-PLA-01 | Mandrake | a screaming mandrake root pulled half free of the soil, a knotted humanoid face in the tuber, mouth wide open; pale root cream, damp earth brown, bitter green leaves |
| MON-PLA-02 | Shrieker | a tall fungal shrieker with a bulbous cap split into a ragged vertical mouth, spores drifting; bruised violet cap, bone-pale stalk, drifting gold spores |
| MON-PLA-03 | Bog Vine | a mass of thorned bog vines knotted into a hunched torso with no face, arrows and a broken spear still stuck in it; wet moss green, black bog water, pale broken shafts |
| MON-PLA-04 | Carnivorous Plant | a huge hinged flytrap head on a thick stem, teeth-like fringes, a fishing rod handle still poking out between them; acid green, blood-red maw interior, wet sap gloss |
| MON-PLA-05 | Dryad | a bark-skinned dryad with a solemn woman's face grown into a living tree, leaves for hair, sap beading like sweat; green-black bark, spring leaf green, damp sap amber **(Ember-resistant: green living wood, no char anywhere)** |
| MON-PLA-06 | Treant | **BOSS** — an ancient oak treant, face carved deep into the trunk, moss-bearded, one great root-hand raised; storm-grey bark, deep heartwood red in the cracks, moss green |

## 4 · Humanoid — goblins, trolls, ogres, giants *(sword / Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-HUM-02 | Kobold | a small snouted kobold in scavenged rags with a bone fetish necklace, cunning and twitchy; scaly grey-green hide, rag brown, bone white |
| MON-HUM-11 | Gnoll | a hyena-headed gnoll scavenger with a matted mane and a stolen helmet that does not fit, grinning; mangy tan fur, dented iron helm, dried-blood accents |
| MON-HUM-04 | Rock Troll | a hulking rock troll whose hide is scabbed over with actual stone, heavy brow, quarry dust in every crease; granite grey, lichen green, dull ore glints |
| MON-HUM-05 | Ogre | a huge dull-eyed ogre with an underbite and a club resting on one shoulder, more slow than cruel; liver-brown skin, filthy hide wrap, rope and bone |
| MON-HUM-10 | Minotaur | a broad bull-headed minotaur with a brass ring through its nose and one horn snapped short, head lowered to charge; black-brown hide, brass fittings, hot breath steam |
| MON-HUM-06 | Frost Giant | a bearded northern giant with rime in his braids and frost-burned cheeks, furs and iron rings; pale ice blue, bleached fur white, cold iron grey **(Frost-resistant, Ember-weak: no warm tones anywhere)** |
| MON-HUM-09 | Cyclops | a one-eyed cyclops with a heavy jutting brow over a single wide eye, scarred bald skull, dumbly furious; ruddy slab skin, iron collar, bone-yellow tooth |
| MON-HUM-08 | Stonejaw | **BOSS** — a scarred goblin chieftain with a crude iron jaw riveted to his face, a warlord's fur mantle and a circlet of enemy teeth; ash-grey skin, blackened iron, hearth-orange warpaint |

## 5 · Human — bandits and casters both *(ranged / Poison)*

| id | Name | Subject line |
|---|---|---|
| MON-ARC-01 | Witch's Apprentice | a nervous teenage apprentice in an oversized hood, one hand glowing badly and the other holding a dropped book; homespun brown, faint sickly green spell light, ink stains |
| MON-HUM-01 | Cutpurse | a wiry roadside thief with a scarf pulled over the nose, eyes bright with mischief, coins spilling from one fist; road-dust brown, tarnished silver, hearth-gold coin glint |
| MON-ARC-02 | Cultist | a hooded candle-cultist with wax running down the mask, expression hidden, small flame held at the chin; ash grey robe, dripping bone wax, small warm flame |
| MON-HUM-03 | Deserter | a grim deserting soldier in dented, badly-repaired plate with his unit's colours cut away, tired eyes; dull steel, faded surcoat red, leather straps **(plate: the reason a hammer answers him)** |
| MON-ARC-03 | Adept | a rune-scarred adept, sigils burned into shaved scalp and cheeks, holding a cracked essence stone; parchment-pale skin, cold rune blue, scholar's grey |
| MON-ARC-04 | Conjurer | a conjurer wreathed in a small orbiting ring of flame that does not burn him, calm and smug; char-black robe, hearth-orange fire, ember gold **(Ember-immune: fire sits comfortably on him)** |
| MON-ARC-05 | Astrologer | a star-reading astrologer in a deep hood scattered with tiny lights, eyes reflecting constellations, holding a bent brass instrument; midnight blue, brass gold, faint starlight white |
| MON-HUM-07 | Bandit Lord | a broad-shouldered bandit lord in mismatched stolen finery over road leathers, gold rings on every finger, entirely at ease; oxblood velvet, road-worn leather, stolen gold |
| MON-ARC-06 | Necromancer | **BOSS** — a gaunt necromancer with a bone crown and a hand full of grave dust, dead-eyed and utterly composed, faint green light under the skin; shroud grey, corpse green glow, tarnished silver |

## 6 · Undead — bones and grief *(hammer / Ember, Poison-immune, Frost-resistant)*

| id | Name | Subject line |
|---|---|---|
| MON-UND-01 | Wight | a churchyard wight in a rotted burial shroud, skin drawn tight, faint cold light in the eye sockets; grave-cloth grey, dried skin ochre, pale blue eye-light |
| MON-UND-02 | Ghoul | a hunched ghoul with a distended jaw and blackened fingers, plague sores and a swollen belly; sallow green-grey, bruise purple, sickly yellow **(Poison-dealing and Poison-immune — the sores must read as its weapon)** |
| MON-UND-03 | Barrow Knight | a barrow-buried knight in verdigris-crusted mail with a heavy iron key at the belt, helm slitted and empty; oxidised green-bronze, grave dust, faint cold blue |
| MON-UND-04 | Drowned Dead | a bloated drowned corpse with waterlogged flesh, weed in the hair and a rope still round the neck, sea-water running out; drowned grey-green, kelp black, pale salt crust |
| MON-UND-05 | Grave Banshee | a wailing banshee, mouth stretched impossibly wide, hair streaming upward, translucent at the edges; shroud white, cold spectral blue-green, hollow black mouth |
| MON-UND-06 | Revenant | a towering skeletal revenant of mismatched bones bound by dark sinew, rib cage hung with old trophies; bone yellow-white, tar-black sinew, dull iron |
| MON-UND-07 | Vampire Bride | a poised vampire bride in a faded wedding veil, delicate and razor-sharp, drinking the *warmth* out of the air rather than blood, faint frost on her lips; bone porcelain skin, wine red, tarnished silver lace **(the drain must read as energy, not gore — no blood)** |
| MON-UND-08 | Grim Reaper | **BOSS** — the Grim Reaper: a hooded skeletal figure, face a lit void under the cowl, scythe blade entering frame over one shoulder; void black robe, bone white, one cold hearth-ember point of light |

## 7 · Demon — things that came up *(magic / Frost, Ember-immune)*

| id | Name | Subject line |
|---|---|---|
| MON-DEM-06 | Imp | a knee-high imp with bat wings and an enormous grin, tiny horns, holding a stolen spoon like a sword; brick red, soot black, hearth-orange eyes |
| MON-DEM-07 | Nightmare | a demon horse with a burning mane and no eyes, nostrils streaming smoke, bridle fused into the flesh; coal black, ember orange mane, scorched iron |
| MON-DEM-01 | Fire Devil | a squat fire devil with cracked charcoal skin glowing at the seams, small horns, arms folded smugly; charcoal black, molten orange seams, ash grey **(Ember-immune: it is made of the thing)** |
| MON-DEM-02 | Hellhound | a lean two-headed hellhound mid-lunge, both jaws open, embers falling from the muzzles; char black fur, ember red glow, ash grey |
| MON-DEM-03 | Chained Demon | a powerful demon bound in heavy rune-etched chains, head lowered, eyes fixed on you with terrible patience; bruised crimson, cold iron chain, faint rune blue |
| MON-DEM-04 | Fury | a winged fury with a glassy chitinous carapace and long blade-edged talons, shrieking; obsidian black, glass-blue sheen, molten cracks **(sword-resistant: the carapace must look like it would blunt a blade)** |
| MON-DEM-05 | Vharek | **BOSS** — Vharek, an enormous pit lord with a crown of broken horns, brimstone light in the throat and chest, mountainous and contemptuous; volcanic black hide, brimstone orange, blackened gold |

## 8 · Dragon — scaled against blades *(ranged / opposed to its breath)*

| id | Name | Subject line |
|---|---|---|
| MON-DRA-08 | Salamander | a hand-sized fire salamander clinging to a hot stone, skin patterned like cooling lava, tail curled; coal black, ember orange banding, ash grey |
| MON-DRA-01 | Wyrmling | a young marsh wyrmling with soft new scales and oversized eyes, frost breath curling from the nostrils; moss green scale, pale frost white, wet slate |
| MON-DRA-02 | Wyvern | a cliffside wyvern with hooked wing-claws and a barbed tail over the shoulder, ember smoke at the jaw; slate blue-grey scale, ember orange throat, bone spur |
| MON-DRA-03 | Cave Wyrm | a wingless burrowing wyrm with a blunt armoured snout and blind milky eyes, earth packed between the scales; dark ore grey, pale blind-eye white, clay brown **(hammer-weak: heavy plated snout, no wings)** |
| MON-DRA-04 | Drake | a bronze-scaled drake with metallic overlapping plates and cold intelligent eyes, no breath glow at all; burnished bronze, verdigris shadow, amber eye |
| MON-DRA-05 | Draconia | **BOSS** — Draconia, a great white dragon queen, frost sheeting off her horns and jaw, imperious and ancient; glacier white, deep ice blue, pale gold eye **(Frost-resistant, Ember-weak: no warm colour but the eye)** |
| MON-DRA-06 | Ashwing | **BOSS** — Ashwing, a black dragon whose wings are burning at the trailing edge, ash falling constantly, ember light behind the teeth; char black, ember orange, drifting grey ash |
| MON-DRA-07 | Elderscale | **BOSS** — Elderscale, the elder raid wyrm, scales scarred and overgrown with ages of lichen, one enormous slitted eye dominating the frame; ancient bronze-green, lichen grey, deep amber |

## 9 · Elemental — it *is* the element *(magic / opposed to its own)*

| id | Name | Subject line |
|---|---|---|
| MON-ELE-01 | Fire Elemental | a small hearth-fire elemental, a curled figure of living flame with two bright coal eyes, warm rather than hostile; hearth orange, ember gold, soot grey |
| MON-ELE-02 | Water Elemental | a brook elemental of clear running water holding a rough head shape, pebbles and a trout suspended inside it; clear blue-green, river stone grey, white foam |
| MON-ELE-03 | Air Elemental | a spiralling air elemental of dust and wind with a barely-there face, leaves and three arrows caught circling in it; dust ochre, pale sky grey, translucent white **(ranged-resistant: arrows visibly passing through)** |
| MON-ELE-04 | Earth Elemental | a squat granite elemental with quartz veins and a jaw of loose scree, slow and unbothered; granite grey, quartz white, ore-vein gold |
| MON-ELE-05 | Ice Elemental | a jagged ice elemental of fused blue-white shards with a hollow ringing chest cavity; glacier blue, frost white, deep shadow indigo **(Frost-immune, Ember-weak)** |
| MON-ELE-06 | Magma Elemental | a forge-hearted magma elemental of cooling black crust split by molten channels, slag dripping; obsidian black, molten gold-orange, grey slag |
| MON-ELE-07 | Storm Elemental | a crackling storm elemental of dark cloud and lightning with a stormlit hollow face, rain sheeting through it; thunderhead grey-violet, lightning white, cold rain blue |
| MON-ELE-08 | Elder Cinder | **BOSS** — the Elder Cinder, a towering figure of banked coals and drifting ash with a slow deep glow at the core, immensely old; deep ember red, ash grey, blackened gold |

## 10 · Construct — no blood to spill *(hammer / Frost, Poison-immune, Ember-resistant)*

| id | Name | Subject line |
|---|---|---|
| MON-CON-01 | Scarecrow | a farmyard scarecrow that has stood up, sack head with stitched crooked eyes, straw bursting from the collar, a crow perched unbothered on one shoulder; straw gold, sackcloth cream, homespun brown, hearth-orange stitching |
| MON-CON-02 | Stone Golem | a village millstone golem, a torso built from a cracked grinding wheel and dressed blocks, flour dust in the seams; mill grey, flour white, iron banding |
| MON-CON-03 | Clay Golem | a heavy clay golem with thumbprints still visible in the surface and a rune pressed into the forehead, blank and patient; kiln red-brown, dry clay cream, faint rune blue |
| MON-CON-04 | Watchknight | an empty suit of animated plate armour standing at attention, visor open onto nothing but darkness; rusted steel, dried blood brown, faint cold void inside |
| MON-CON-05 | Gargoyle | a cathedral gargoyle mid-wakening, stone wings cracking free of centuries of moss, chipped snarling face; cathedral grey stone, moss green, rain-stain black |
| MON-CON-06 | Iron Colossus | **BOSS** — the Iron Colossus, the head and shoulders of a vast siege automaton, a lantern furnace burning behind its face grille, still following an order nobody remembers giving; blackened iron, hearth-orange furnace glow, verdigris bronze |

## 11 · Extra Dimensional — the thing after the end *(sword / one hidden element)*

| id | Name | Subject line |
|---|---|---|
| MON-VOI-01 | Void Mote | a small hovering void mote, a hole in the world with a faint prismatic rim, the background visibly wrong around its edge; absolute black, thin prismatic rim, cold starlight |
| MON-VOI-02 | Starhusk | the husk of a person hollowed out from inside, star-stuff spilling slowly from the eyes and mouth, still wearing a farmer's collar; ash grey skin, cold starlight white, homespun brown **(tragic, not monstrous)** |
| MON-VOI-03 | The Silence | a tall faceless figure that seems to absorb sound, edges blurring into nothing, no mouth at all; matte void black, dull grey non-reflection, one faint pale seam |
| MON-VOI-04 | The Unlit | **BOSS** — The Unlit, a vast crowned silhouette of pure absence with a single extinguished hollow where a hearth-fire should be, everything around it dimmed; deepest black, cold ash grey, one dead ember |

## 12 · Dungeon residents — The Long Night *(Library 5)*

Same Style B spec. These four share one visual grammar: **a decaying manor's palette — wine red, dust,
tarnished silver, candlelight — so the set reads as a household even at thumbnail size.**

| id | Name | Subject line |
|---|---|---|
| DNG-VAMP-02 | The Old Soldier | **BOSS** — an ancient warrior vampire in six-centuries-out-of-date armour, magnificent moustache, chest of tarnished medals, absolutely certain of his own importance; dusty crimson, tarnished silver, candlelight gold |
| DNG-VAMP-03 | The Baron | **BOSS** — a flamboyant cursed aristocrat vampire in three centuries of layered stolen fashion, lace at the throat, one theatrical raised eyebrow; oxblood velvet, moth-eaten lace cream, candle gold |
| DNG-VAMP-04 | The Bride | **BOSS** — reuse **MON-UND-07 Vampire Bride** — a poised vampire bride in a faded veil, drinking the warmth out of the room, faint frost at her lips, withering unamused stare; bone porcelain, wine red, tarnished silver lace |
| DNG-VAMP-05 | The Familiar | **BOSS** — a devoted living human servant, ordinary and exhausted, cardigan over a butler's collar, holding a candle and a household ledger, utterly sincere; homespun grey-brown, warm candlelight, dust |

**Legal note, non-negotiable.** These four are original characters built from folklore archetypes that
long predate any modern work — the boastful ancient warrior, the decadent aristocrat, the sharp-tongued
bride, the loyal mortal servant. **No protected name, no character likeness, no quoted line, and no
reference to any television series may appear in a prompt, a filename, an item name or an item
description.** If a generated portrait resembles a specific real performer, it is rejected and
regenerated — that is an identity failure exactly like the boar-labelled-bear, and it needs the same
human sign-off.

---

## 13 · Batch order (if the art budget is staged)

1. **T1–T2, every class (21 monsters).** Highest ratio of "players who see it" to "portraits painted" —
   every new character meets these in the first hour.
2. **The eleven bosses.** They are what players screenshot, and the roster currently has two.
3. **T3–T4 (23).**
4. **T5–T6 non-boss (26).**
5. **The four dungeon residents** — they can ship with the dungeon rather than with the roster.

Plus the three standing identity fixes from the Asset Director's audit, which should ride along with any
batch: a real dragon for `dragon`, a real bear for `bear`/`ancient_bear`, and the missing
`mountain_troll` portrait.
