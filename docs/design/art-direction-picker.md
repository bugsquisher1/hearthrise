# Art Direction Picker — five lanes for the whole game's iconography

**Author:** Art Director · **Date:** 2026-08-16 · **Status:** **DECIDED — Lane A, HEARTHFIRE.**
Tyler, after seeing the 13-image pilot wired into the live screens: *"I like this look; i think it
fits."* §0 below is the ratified production wrapper and is the only part of this document the batch
reads. §1–§9 are kept as the record of how the decision was made.

---

# 0 · THE RATIFIED HEARTHFIRE WRAPPER — production, ~600 images

**This section is normative.** `item-art-prompts.md` and `monster-art-prompts.md` carry subject
clauses only; every generated prompt is assembled from the pieces below. Nothing here is decoration —
each clause is annotated with the specific failure it prevents, and a clause with no observed failure
behind it was cut. Long prompts dilute; this one is as short as the evidence allows.

## 0.1 · Assembly

```
<PREFIX>  +  " "  +  <subject clause from the sheet>  +  ", "  +  <CLAUSES>  +  ", "  +  <SUFFIX>
```

| Category | Prefix | Clauses (in this order) |
|---|---|---|
| Armour (plate / leather / cloth), jewellery, materials, ores, bars, logs, food, keys, scrolls, misc | **P-ITEM** | **C-METAL** if the object is metal |
| Weapons, ammo, staves, bows, and the gathering tools (axe, pickaxe, rod, harpoon, sickle, chisel) | **P-WEAPON** | **C-METAL** if the object is metal, then **C-ENCHANT** |
| Monsters (all 85) | **P-MONSTER** | **C-SIGNAL** |

The **STYLE ANCHOR carries the hand** — brushwork, edge darkness, bevel weight, value range, the
lighting recipe and the palette temperature (§0.10). None of that is in the text any more, and that
is the point: it is why every assembled prompt now fits under Recraft's 1000-character cap (§0.2).
The shared **SUFFIX** carries what an anchor cannot — the bans and the legibility floor — and is the
mechanism that makes the item shelf and the bestiary look like one game.
**Do not vary it per category, per tier or per batch.**

**Measured over all 597 live subject lines: median 782 characters, maximum 944, none over 1000.**
`tools/gen-art.mjs` refuses to run if that ever stops being true.

## 0.2 · THE 1000-CHARACTER CAP — the constraint that re-cut this wrapper

**Recraft's generation endpoint rejects any prompt over 1000 characters** —
`HTTP 400 invalid_request_parameter: "prompt length should be in [1, 1000]"`. The first cut of this
wrapper assembled to a **median of 1141 and a maximum of 1665** characters: **15 of 16 prompts were
over the cap**, so the entire 600-image batch would have failed, every request, 100%.

**It cost $0.00 to find, because the §0.10 step-4 verification ran four pilots through the real
endpoint before the batch and rejected requests are not charged.** That step was written as
"an anchor that changes the pilot will change everything"; it earned its place for a different
reason entirely. **Keep a cheap end-to-end call in front of every funded batch** — the failure it
catches is rarely the one you wrote it for.

**Why the re-cut is an improvement rather than a loss.** The clauses eating the character budget were
brushwork, the lighting recipe, the value-range sentence and the palette enumeration — which is
precisely the *hand*, and §0.10's whole argument is that **the style anchor carries the hand far more
strongly than words ever did.** They were redundant the moment the anchors existed. What survives is
exactly what an anchor cannot express: framing, composition, the hard bans, and the four rules that
each exist to stop a specific observed failure.

**Budgeted, not guessed.** Longest subject clause measured across both sheets: **312** characters
(MON-UND-07 Vampire Bride); item maximum **200** (`iron_ore`). The wrapper was then sized to fit
around them. Assembled over all **597** live subject lines: **median 782, maximum 944, zero over
950, zero over 1000.** `tools/gen-art.mjs` now refuses to run if any assembled prompt exceeds 1000,
so this can never again be discovered by spending money (§0.13).

## 0.3 · P-ITEM — the item prefix

> Game icon, ONE object, three-quarter top-down loot angle, centred, filling the frame, chunky-heroic
> exaggerated proportions, one oversized specimen — never a pile, handful or serving, never on a
> board, dish or cloth unless the object is the vessel,

*(248 chars.)* **Why the second half survived the cut.** The pilot's `cooked_shrimp` came back as five
small shrimp on a chopping board: at the 34 px shop row the **board** is the silhouette and the food
is texture on it. An icon has one job at 34 px — be one recognisable shape. The ban on serving
surfaces is the other half of the same fix: a board is a second, larger, competing object in a frame
with room for one. The anchor cannot express this; five of its own seed images are single objects,
but "how many things are in frame" is a subject decision, not a style one.

## 0.4 · P-WEAPON — weapons, ammo and long tools

> Game icon, ONE weapon flat to the screen in full profile on a diagonal, blade or head upper-left,
> grip lower-right, no foreshortening or tilt, centred, filling the frame, chunky-heroic exaggerated
> proportions, never a bundle, rack or pair,

*(239 chars.)* **Why the orientation is fixed and identical for all ~90 weapons.** A weapon
foreshortened toward the viewer loses its length, which is the only thing separating a dagger from a
greatsword at 38 px. Fixing one diagonal also buys the shelf its rhythm: 90 weapons on one axis read
as an armoury, 90 weapons at 90 angles read as a stock-image dump. **The cost is real and is paid
deliberately** — see §0.9a on silhouette collision, the failure this choice makes *more* likely and
which the subject lines, not the wrapper, must answer.

## 0.5 · P-MONSTER — the creature bust

> Creature bust, three-quarters to the viewer, filling a square frame with an even margin, the
> whole silhouette contained inside the frame and nothing cropped at any edge, eyes near centre,
> chunky-heroic exaggerated proportions,

> ⚠ **THE FEATURE-SUMMONING TRAP (proven live, 2026-08-17).** An earlier form of this clause read
> "horns, antlers, ears and blades whole and never touching the edge" — intending *protect these
> from cropping*. The model reads a named feature as a REQUEST: Tyler's first web-UI generation of
> the `cutpurse` (a tier-1 HUMAN pickpocket) came back with antlers, horns, and pointed ears — a
> demon-elk bandit. Never name an anatomical feature in a wrapper; only subject lines may name
> features, because there they are always intentional. Framing rules must be stated
> feature-neutrally ("whole silhouette", "nothing cropped").

*(212 chars.)* **The framing rule changed on 2026-08-16 and this is the new one.** The old rule —
"eyes inside the middle 70%" — existed because the arena portrait was a **circle** with
`object-fit: cover`, which threw away the corners of the frame, and the corners are exactly where a
creature keeps the information a bestiary is read by. **b357 made every creature portrait a square
plate with `contain`** — arena, bestiary row, monster row, preview modal, bounty notice, pet badge.
So the subject may now **use the whole square, corners included** — a 21% larger usable frame, and
why the Elk King's antlers survive. The only rule left is a **small even margin**, because `contain`
shows the file's true edge and an antler tip clipped by the canvas is a permanent defect no CSS can
undo.

## 0.6 · C-METAL — the cold-iron clause (metal objects only)

> iron, steel, mithril and dawnsteel read cold grey to silver-blue with no warm tint; bronze, copper
> and gold stay warm,

*(118 chars.)* **Why.** Under a golden key light the model paints every metal as bronze, which
collapses a seven-rung tier ladder — bronze → iron → steel → mithril → rune → emberforged →
dawnsteel — into one warm mass. Hearthfire differentiates tiers by **material**, so the ladder *is*
the itemization. The second half is not a hedge: bronze and gold are *supposed* to be warm, and a
blanket "make metal cold" would have made `bronze_sword` and `gold_bar` wrong instead. The re-cut
dropped the "warmth only on leather, cord, wood and brass fittings" half — the item anchor is seeded
with **two cold-metal exemplars** (`iron_sword`, `iron_platebody`) that demonstrate it, and the
neutral-material lock in the SUFFIX says it generally.

## 0.7 · C-ENCHANT — enchant-neutrality (weapons, ammo, tools)

> blade, point, arrowhead and fletching carry no elemental colour unless named above,

*(83 chars.)* **Why.** Enchanted states render as a **runtime overlay** (element glow + corner pip,
theme tokens, zero per-variant art). Warm colour baked into a base arrowhead is then
indistinguishable from a real ember enchant — the icon would **lie about an item's stats**. Named
unique enchanted items are the exception and their subject lines say so.

## 0.8 · C-SIGNAL — the two-signal enforcement clause (monsters)

> the element accent named above is matte pigment on the body, never a glow or sheen,

*(83 chars.)* **Why, and it does not fork §0.1–0.3 of `monster-art-prompts.md` — it enforces them.**
The Game Designer's grammar says a monster carries two facts: **resistance in the body** and
**weakness as one small marking**. That grammar has exactly one failure mode and this wrapper causes
it: a warm key light falls on every subject, so *every* monster looks faintly fire-touched and a real
Ember-weakness marking becomes indistinguishable from the lamp. This is the one sentence that keeps
the marking a marking. **If a generation comes back without its hook, it is wrong even if it is
beautiful.**

## 0.9 · SUFFIX — shared by items and monsters, never varied

> colour comes from the light, not the material — grey, black, bone and stone stay neutral, and only
> colours named above appear as local colour; silhouette-first, readable at 40px, no detail finer
> than a sixteenth of the frame; fully transparent background, no backdrop, vignette, scenery,
> ground, shadow, frame, text, watermark or UI.

*(333 chars — the largest single piece, and every clause in it is a ban or a legibility rule, which
is exactly what a style anchor cannot carry.)*

**The neutral-material lock is the most important sentence in this document.** The pilot's `iron_ore`
is specced as *"a rough chunk of grey rock streaked with rusty red-brown iron ore"* and came back
**polychrome red, orange and violet** — measured, not impressionistic: 38% of its opaque pixels are
warm-dominant and its mean colour is `127,94,94`, against `108,103,101` for the correctly-cold
`iron_sword`. At 40 px it reads as raw meat. The cause is structural rather than a bad line:
**when a subject's material is a neutral — stone, ore, bone, ash, coal, plain iron, dressed masonry —
the palette clause has nothing legitimate to land on, so it repaints the material itself.** Every
neutral-material icon in the batch was exposed. Pinning colour to the light fixes the whole class.

**The transparency ban is also load-bearing and also comes from an observed failure:** the pilot busts
arrived with painted backdrops, because "fully transparent background" alone does not stop a model
from painting atmosphere behind a portrait. Hence "no backdrop, vignette, scenery" spelled out.

## 0.9a · The three failure modes we have NOT yet seen at scale

Named here because a 13-image pilot cannot show them and a 600-image batch will.

1. **Silhouette collision.** ~90 weapons on one fixed diagonal (§0.3) will collide unless the
   *structure* differs: blade profile, guard, pommel, head mass. The wrapper cannot fix this — a
   generic "make it distinctive" clause is exactly the kind of decorative instruction that dilutes a
   prompt. It is answered in the **subject lines**, which already carry per-item shape language, and
   verified by the tier contact sheet in §0.11 rather than by hope.
2. **Tier legibility.** A player must read bronze → iron → steel → mithril → rune → emberforged →
   dawnsteel as a *ladder*. C-METAL protects the metal; the shared `§1` material vocabulary in
   `item-art-prompts.md` protects the words. **Generate each ladder contiguously** and QC it as a
   seven-image strip, never file-by-file — a rung that has drifted is invisible on its own and
   obvious beside its neighbours.
3. **Category coherence.** 145 armour pieces must read as one armoury. This is what the custom style
   anchor in §0.10 is for; it is the only lever that acts on all 600 at once.

## 0.10 · RULING — use a Recraft custom Style anchor. Two of them.

**Ruling: yes, and it is the single highest-leverage decision in this program.** Prompt text pins
*subject, composition and bans*; it does not pin *hand*. Across 600 stochastic generations the
brushwork, edge darkness, bevel weight and value range will drift, and drift is invisible per image
and glaring on a shelf — which is precisely the studio-quality property being bought. A style anchor
acts on all 600 at once; no wording does.

**Two styles, not one.** Items and monsters share a suffix but not a framing, and a single blended
anchor would teach the model to put bust-lighting on a bar of iron. Create:

| Style | Seed images (the approved pilots) | Why these |
|---|---|---|
| `hearthfire-items` | `iron_sword`, `iron_platebody`, `leather_body`, `cooked_shrimp` **(the re-run, not the board version)**, `wheat_bread` | Two cold-metal exemplars carry the C-METAL fix into the anchor itself, where it is far stronger than as words; `leather_body` anchors the organic half; the two foods anchor the **weakest** category, which is where consistency pays most. |
| `hearthfire-monsters` | `winter_wolf`, `hellhound`, `grim_reaper`, `elk_king` | The four Tyler approved, and they happen to span the full value and temperature range — pale/cold, warm/dark, near-black, mid/green. That spread is what stops the anchor from teaching one lighting recipe. |

**`bronze_sword` is deliberately NOT an anchor.** It is a beautiful image and the right result, but
bronze warmth is a *subject* property stated per item; putting it in the anchor risks bleeding warm
metal back into the 200-odd cold-metal icons, which is the exact defect C-METAL exists to prevent.
The same logic excludes `iron_ore` (defective) and `oak_log` (see §0.12).

**Seed from the 1024 px ORIGINALS in `assets/art-pilot/hearthfire/`, not the processed 256 px files
in `assets/icons-bundle/hearthfire/`.** More signal per image, and the processed set has been
auto-cropped and resized, which is composition information the anchor should not learn.

**BUILT AND CONFIRMED 2026-08-16 — record these so the batch is reproducible.**

| Style | `style_id` |
|---|---|
| `hearthfire-items` | **`96fc6650-52e5-458f-855f-62da2757f065`** |
| `hearthfire-monsters` | **`52693fa5-649f-4d7c-993b-5ce9e5b33f91`** |

Both created with `POST /v1/styles`, `style=digital_illustration`, seed files as multipart `file`
uploads. **Confirmed by execution, not by documentation:** the endpoint accepts **at least 5 files**,
and costs **5 credits** per style. When `style_id` is sent, `style` must **not** be — Recraft rejects
both together. `tools/gen-art.mjs --style-id <id>` is wired and working.

**The remaining steps, in order.**
1. **Re-run the 13 pilots through the style** (~$0.52) and diff them against the approved set before
   spending on 600. An anchor that changes the pilot is an anchor that will change everything. This
   step already paid for itself once — see §0.2; it is how the 1000-character cap was found for
   $0.00 instead of for a whole batch.
2. Generate **one full tier ladder** (seven rungs, contiguous) and read it as a strip before
   committing to the rest. Ladder legibility is the failure that only shows up in a row (§0.9a).
3. Then the batch, family by family, `--concurrency 3`.
4. `node tools/qc-art.mjs <out> --snap --neutral <ids>` as the gate before any wiring.

**On the wrapper text now that the anchors exist.** The style carries the hand and the text no longer
repeats it — that is what bought the character budget (§0.2). The trade is real and worth stating:
**if a `style_id` is ever omitted, the output will be far weaker than the pilot**, because the words
that used to describe the brushwork are gone. `gen-art.mjs` should therefore always be run with
`--style-id`, and a batch generated without one should be deleted rather than reviewed.

> **⚠ SUPERSEDED 2026-08-16 by §0.10b.** The paragraph above is right that a bare run is wrong, and
> wrong about why. It is *not* that the brushwork words are missing — it is that sending **no style at
> all makes Recraft default to `realistic_image`** and return photographs. And the ruling it supports
> — "always run with `--style-id`" — did not survive contact with real generations: **both custom
> anchors override the subject's named colours.** Read §0.10b before spending anything.
>
> **⚠ FURTHER SUPERSEDED 2026-08-16 by §0.10c.** §0.10b's two proposed unblocks BOTH fail (the seed cap
> is 5, and a palette-neutral anchor produces palette-neutral art). The lever that works is
> `controls.colors` sent alongside `style_id`. **Items: conditional GO. Monsters: still NO-GO —
> generate those by hand in the web UI.** Read §0.10c; it is the current ruling.

**On seeds — say the true thing.** Recraft's v3 generation endpoint exposes no seed parameter in the
call `gen-art.mjs` makes, so **there is no reproducibility lever from seeding** and any claim of one
would be invented. The levers that do exist are: the `style_id` above, a **fixed `model` and `size`**
for the whole batch, and **contiguous family ordering** — which is a *QC* lever, not a consistency
one (generation is stateless; ordering does not change the model's output, it changes what a reviewer
sees side by side). If a `random_seed` parameter does turn out to be accepted, it is worth one test
call, but do not design the batch around it.

## 0.10b · RULING 2026-08-16 — the batch is NO-GO, and the warm% proxy was measuring the backdrop

**This section is the current ruling and it overrides §0.10 wherever the two disagree.** It was
written after looking at sixteen real generations at full size. Every claim below is an observation
of a picture; the numbers are quoted only where they were *wrong*, because being wrong is their
contribution.

### The measurement that started it, and why it inverted

A verification run scored three wrapper variants with `tools/qc-art.mjs`'s warm-dominant-pixel
proxy and concluded that the style anchor was harmful and the un-anchored wrapper was the fix
(`iron_ore` warm 38% → 10%; Hellhound warm 18% → 3%). **Both conclusions are artefacts. The proxy
counts warm pixels over the whole opaque canvas, and in every un-anchored file the majority of that
canvas is a BACKDROP the model was told not to paint.** A grey overcast sky scores beautifully.

What the un-anchored files actually are — look at them, the numbers cannot see this:

| file | what the proxy said | what it is |
|---|---|---|
| `nostyle/weapons/iron_sword.png` | best score in the batch, 88% clear / 9% warm | a smooth airbrushed sword on a **teal-blue rounded-rectangle app-store tile** with a drop shadow — a UI frame, an opaque backdrop, stray teal, and the exact house style Tyler rejected |
| `nostyle/items/iron_ore.png` | best neutral score, 10% warm | a generic mobile-game boulder standing on a **ground disc with grass tufts and pebbles**, lava-orange cracks |
| `nostyle/items/oak_log.png` | — | a log inside a **decorative badge with a ring border, a pine forest, sky, soil and foliage** |
| `montest-plain/monsters/hellhound.png` | warm 18% → **3%**, the headline result | a **photorealistic 3-D wolf, full body, standing in a snowy forest under an overcast sky** |

**The mechanism is one line in `tools/gen-art.mjs`: with no `--style-id` it sent neither `style` nor
`style_id`, so the API applied its default, `realistic_image`.** "No anchor" was never a control. It
was a fourth, worse style. The 3% warm score on the Hellhound is the colour temperature of a February
sky. **`gen-art.mjs` now refuses to run when neither is passed** (verified: exit 2), and `--style` /
`--substyle` were added so a built-in style can be selected deliberately.

**Standing lesson, and it is the second time this exact shape has bitten this program (§0.2):
a proxy metric scores the frame, not the subject. Never accept a QC number as a verdict on art
without opening the file.** `qc-art.mjs` check 6 is documented as *advisory* for precisely this
reason; the verification treated it as authority.

### The real finding: the custom anchors override named colour

The suspicion under test was that the SUFFIX suppresses named colour. **It does not.** Isolating the
suffix under a fixed built-in style, the Hellhound came back with vivid red markings on **both** the
old suffix (`v2-C`) and the re-cut one (`v2-A`). The suffix is exonerated and is **left byte-for-byte
unchanged** — a clause with no observed failure behind it does not get rewritten, which is this
document's own rule.

The anchor is the culprit, and it is worse than suppression. The `hearthfire-monsters` anchor
(`52693fa5-…`) was run twice on the same two prompts:

| prompt | run 1 (`v2-B`) | run 2 (`v2-B2`) |
|---|---|---|
| **Hellhound** — *char black fur, ember red glow, ash grey, pale muzzle cracks* | a **white-and-ice-blue** beast | a **black-and-tan rottweiler**; no embers, no ash grey, no pale cracks |
| **Winter Wolf** — *snow white, pale ice blue, raw madder-red only at the ear tips* | **char black** with **ember-orange horns** | **brown and olive** |

Four generations, four palettes, **not one of them the palette its own subject line names**, and run 1
is close to the two anchors' seed images swapped onto the wrong prompts. **A five-image custom style
transfers PALETTE, not just hand, and with 85 monsters that is a roulette wheel over four seed
colourways.** It also lost the two-headedness in 4/4. Per `monster-art-prompts.md` §0.1 a portrait
with no hook is wrong even if it is beautiful — these are wrong *and* beautiful, which is the most
expensive combination.

The same defect on the item side is louder: `styletest/weapons/iron_sword.png` and
`styletest/items/iron_ore.png` (item anchor `96fc6650-…`) are **salmon-pink** — the anchor generalised
`wheat_bread` and `cooked_shrimp` into a palette and painted a cold-iron sword and a neutral grey rock
with it. That is C-METAL and the neutral-material lock defeated at the source, by the very lever that
was supposed to enforce them.

### What the anchor *does* buy, which is why the answer is not "drop it"

Across every anchored generation the subject is **isolated** — one object, no scenery, no ground, no
frame, no text. Across every **un-anchored and built-in** generation those bans were ignored wholesale;
the low point is `v2-D/weapons/iron_sword.png`, which came back as a **parchment infographic with
callout lines and five labels of gibberish pseudo-text**, and `v2-D/items/iron_ore.png`, a boulder in a
meadow inside a decorative border. **Prompt bans do not survive Recraft v3. Only the anchor enforces
composition.** So the anchor is simultaneously the only thing holding the framing and the thing
destroying the colour — which is exactly why neither "keep it" nor "drop it" is the answer.

### Ruling

1. **NO-GO on the 85-monster batch.** 4/4 anchored monsters missed the named palette; 4/4 missed the
   subject's structure. ~$4 of monsters would be re-generated wholesale.
2. **NO-GO on the 512-item batch.** Anchored items are pink; un-anchored and built-in items carry
   backdrops, ground, frames and text. **No variant tested produces a shippable item icon.** At
   $0.04–0.05 each this is a ~$25 mistake, and the real cost is a reviewer's day.
3. **The only configuration that has ever produced correct output is the approved 13-image pilot:
   the Recraft WEB UI with the pre-re-cut wrapper, 1141–1665 characters — which the API rejects at
   1000.** That is the actual blocker, and it has been mislabelled twice: §0.2 recorded the character
   cap as a constraint the anchors let us absorb, and the anchors do not.
4. **Next step is a fix, not a batch.** Two candidates, in order of cheapness, both testable for well
   under a dollar: **(a) rebuild both anchors with far more seeds** deliberately spread across the
   palette, so no colourway dominates — the current sets are 5 and 4 images and both over-fit; **(b)**
   if Recraft caps seeds at 5, **the anchors must be seeded to be palette-NEUTRAL** and the hand words
   must come back into the wrapper, which means finding the ~150 characters the re-cut freed. Verify
   with the same three subjects used here — Hellhound, Winter Wolf and an elemental are the cases where
   named colour *is* the identity.

**Spend on this ruling: $0.40 (10 images).** Evidence is local-only (`assets/art-pilot/` is
gitignored) in `v2-A` built-in/new-suffix, `v2-B` + `v2-B2` monster anchor, `v2-C` built-in/old-suffix,
`v2-D` built-in items — alongside the earlier `nostyle`, `styletest`, `montest-plain`,
`montest-anchor`.

## 0.10c · RULING 2026-08-16 — both proposed unblocks FAIL; a third lever (`controls.colors`) unblocks ITEMS only

**This section is the current ruling and it overrides §0.10 and §0.10b wherever they disagree.**
Twenty-seven real generations, **$1.09 total spend**, every verdict below reached by opening the file
at full size — never by a warm%/clear% proxy, which is the mistake §0.10b exists to record.

### The seed cap is 5, established by execution

`POST /v1/styles` with 7 files → `400 invalid_request_parameter: "Number of images must be between 0
and 5"`. §0.10b's option (a) — *"rebuild both anchors with far more seeds"* — **is not available**, and
would not have worked anyway: the monster anchor already used 4 seeds chosen for palette spread and
bled regardless. More spread does not average the palettes; it **randomises which one wins**.

### EXPERIMENT A — the palette-neutral anchor. NO-GO, and it disproves the whole idea.

Method: the five/four approved pilots converted to **true greyscale** (luminance-weighted, alpha
preserved) from the 1024 originals, then uploaded as seeds. Two new styles:
`7c9e2365-7b5d-4fad-af12-dc72200b2e5e` (items) and `c239d83a-0ae1-4f1f-9e84-e6d3d57d522a` (monsters).
Greyscale rather than "fewer seeds" or "conflicting seeds" because a 4-seed conflicting spread is
*exactly what already failed*; removing chroma is the only version of "neutral" the anchor cannot
sample its way out of.

**All five generations came back MONOCHROME.** The Hellhound is a black-and-grey dog, the Winter Wolf a
grey lion, `iron_sword` a grey sword with a **grey** leather grip, `iron_ore` a grey sphere with no
rust streaks at all. Composition was flawless — isolated subject, no backdrop, no ground, no frame,
no text, bans fully respected — and the hand is close to the pilot's. Only the colour is absent.

**This is the finding, and it kills the premise.** A Recraft custom style transfers the seeds'
**colour distribution**, not merely their hand. There is no "hand without palette" configuration:
a palette-neutral anchor produces palette-neutral art, by construction. Do not re-propose it.

### EXPERIMENT B — built-in style + hand words restored + bans hardened. NO-GO.

The wrapper was re-cut to fit: prefixes trimmed, a 133-char HAND clause restored (brushwork,
dry-brush, near-black contour accents, full value range, no airbrush) and the SUFFIX rewritten to ban
the exact observed artefacts (*border, badge, tile, infographic*). Worst-case assembled prompt
**975/1000** with the longest subject line in the batch, so it is batch-viable on length.

It made no difference. Under `--style digital_illustration`:

| file | what it is |
|---|---|
| `expB/weapons/iron_sword.png` | a **landscape painting** — snow mountains, a river, autumn trees — with a sword leaning across it, on a rounded-rectangle tile |
| `expB/items/iron_ore.png` | a photoreal boulder on a **grass-and-dirt ground disc with a sapling** |
| `expB/monsters/hellhound.png` | a doberman inside an **ornate corner border with a forged artist's signature**, opaque grey backdrop, one head |
| `expB/monsters/winter_wolf.png` | a wolf in a **snowy pine forest with falling snow** and a torn-paper border |

**Hardening a ban does not make Recraft v3 obey it, and naming the artefact does not help.** §0.10b's
"prompt bans do not survive Recraft v3; only the anchor enforces composition" is now proved twice, the
second time against a wrapper written specifically to break it. Neither is the HAND clause visible in
the output. **Words are not the lever. Stop spending characters on them.**

### THE ACTUAL UNBLOCK — `controls.colors`, accepted alongside `style_id`

Experiment A localised the defect precisely: the anchor was right about *everything except chroma*.
Chroma therefore needed a channel that is not prompt text. Recraft's generation endpoint takes
`controls: { colors: [{rgb:[r,g,b]}, …] }` and — **verified, not assumed** — accepts it **together with
a custom `style_id`**, which the docs do not promise.

**It overrides the anchor's palette.** That is the property nothing else in this programme has had.

| file | anchor | result |
|---|---|---|
| `expG/weapons/iron_sword.png` | colour item anchor `96fc6650-…` + `[[150,156,162],[26,28,32],[132,88,48]]` | **cold grey blade, warm leather grip, hard near-black contours, correct diagonal, isolated on empty ground.** The salmon-pink defect of §0.10b is gone. C-METAL satisfied through the anchor for the first time. |
| `expG/items/iron_ore.png` | same | **neutral grey rock with rust-brown streaks.** The `iron_ore` polychrome-meat failure that started this entire programme is FIXED. |
| `expF/weapons/bronze_sword.png` | same | ruddy **warm** bronze — so the ladder's other half survives too; iron and bronze read as different metals side by side at 48 px. |
| `expF/armour/{iron_platebody,leather_body}.png`, `expF/food/wheat_bread.png` | greyscale item anchor | all correct-palette, single-object, no backdrop/ground/frame/text; `leather_body` is very good |

### But it does NOT work on monsters, and that is a hard boundary

On a creature bust the model spends the palette as a **painted colour wash in the empty canvas behind
the creature** rather than as local colour on the body. `expC`, `expD`, `expE`, `expG` — four rounds,
every one. `expE` was written specifically against it, banning *"painted wash, colour block, brush
swatch, panel, halo"* by name and demanding *"pure empty white"*: the wash came back anyway, and the
subject also broke the margin rule by bleeding off the canvas edge. Subject fidelity is separately
bad — the two-headed Hellhound came back single-headed in **7/7** attempts across all experiments, and
the Winter Wolf came back as an elk, a bison and a lynx.

**Mechanism (best available reading): an item prompt fills the frame with one object, so the palette
has nowhere to go except onto the object. A bust leaves canvas around it, and the palette fills it.**

### Ruling

1. **512-item batch — CONDITIONAL GO.** Config: **custom colour anchor `96fc6650-52e5-458f-855f-62da2757f065`,
   the §0.1–0.9 wrapper unchanged (byte-for-byte — do not re-cut it again), plus a per-item
   `controls.colors` palette of 2–4 RGB triples.** Now wired as `gen-art.mjs --colors <file.json>`,
   which refuses to run without `--style-id`. **The condition is the palette file:** 512 items need
   512 palettes, and they must be *derived* from the colour words already in each subject line via one
   colour-name → RGB table (~40 names), not hand-authored 512 times. That table does not exist yet and
   is the only remaining blocker. Then generate ONE seven-rung tier ladder and read it as a strip
   (§0.9a) before funding the rest.
2. **85-monster batch — NO-GO. Recommend Tyler generates these by hand in the Recraft WEB UI**, which
   is the known-good path (it is where the four approved busts came from, at 1141–1665 characters that
   the API will not accept). 85 images is a long but finite session, and monsters are the surface where
   a wrong palette or a missing hook is most visible — arena portrait at 96 px, not a 34 px shop row.
   Do not spend API money on monsters until someone finds a lever that beats the backdrop wash; three
   have now been tried and failed.
3. **The 13-image pilot remains the target and is still the only fully correct set.** The `expG` items
   are in its family and are shippable; they are slightly lower-contrast and carry less rim light, and
   `iron_ore` still reads as a sphere rather than a rough chunk — a **subject-line** fix (and a
   silhouette-collision risk against `wheat_bread`, which it currently resembles at 48 px). That is the
   Game Designer's line to sharpen, not a wrapper clause.

**Spend on this ruling: $1.09** — 27 images at $0.04 plus 10 credits for two styles. Evidence is
local-only (`assets/art-pilot/` is gitignored) in `expA`–`expG`, with two contact sheets at
`assets/art-pilot/_sheet.png` and `_sheetG.png`.

## 0.10a · The two defective pilots, and which is which

- **`iron_ore` is a PROMPT failure and the prompt is fixed** (`item-art-prompts.md` §2.13, plus the
  material-honesty clause in §0.8 that generalises it to every neutral-material icon). Regenerate.
- **`oak_log` is NOT a prompt failure.** The delivered file is **byte-identical to
  `bronze_sword.png`** — a duplicate download, confirmed by SHA-256 and by identical pixel
  statistics. The subject line is correct and unchanged; the file just needs regenerating. This is
  the reason QC check 4 exists.

## 0.11 · QC — cheap enough to run unattended over 600 files

**The order is `gen-art.mjs` → `art-pilot-process.mjs` (crop, resize, canvas) → `qc-art.mjs --snap`
(fix + gate).** The three tools do not overlap: `art-pilot-alpha.mjs` *reports* an alpha histogram,
`qc-art.mjs` *fixes* the alpha, hashes the batch and exits non-zero. **One live inconsistency to
settle before the run:** `art-pilot-process.mjs` writes items at a **256 px** long edge while
`item-art-prompts.md` specs **128**. Harmless (every item site is `contain`), but pick one — that is
the Asset Director's call, not a thing to discover halfway through 600 files.

**Automatable (should gate the wiring; no human in the loop).**
1. **Alpha.** PNG colour type 6, all four corner pixels alpha 0, and — after the §0.12 snap — a
   sane alpha histogram (no more than ~15% of pixels in the 1–249 band; a higher figure means the
   matting ate the subject).
2. **Canvas.** Items: long edge exactly 128 px after auto-crop. Monsters: exactly 256 × 256, square.
3. **Filename.** Every name is in the live id set (`Object.keys(ITEMS)` / `MONSTERS`), case-exact.
   Nothing generated that the game will not load, nothing loaded that was not generated.
4. **Duplicate bytes — SHA-256 across the whole batch.** This is not hypothetical: in the 13-image
   pilot `oak_log.png` and `bronze_sword.png` are **byte-identical** (verified: identical size,
   alpha distribution, corner values and mean colour). A duplicate download is completely silent and
   a hash catches all of them for free.
5. **Not blank / not a rectangle.** Reject an image whose opaque area is under 8% or over 92% of the
   canvas — the first catches an empty generation, the second catches a full-bleed background that
   removeBackground failed to cut.
6. **Neutral-material check** (the `iron_ore` failure, automated): for every id whose subject line
   contains *grey, plain, black, pale, bone* or *neutral*, flag it if more than 25% of its opaque
   pixels are warm-dominant (`R > B + 40`). `iron_ore` scores 38% and fails; `iron_sword` scores 16%
   and passes. Derive the id list straight from the sheet rather than maintaining a second copy:
   ```bash
   awk -F'|' '/^\| [a-z][a-z0-9_]+ \|/ && $4 ~ /grey|bone|black|neutral/ \
     && $4 !~ /bronze|copper|gold|amber|ochre|brown|red|orange|rust|ember|green|purple|violet/ \
     {gsub(/^ +| +$/,"",$2); print $2}' docs/design/item-art-prompts.md | sort -u > /tmp/neutral-ids.txt
   ```
   That yields **62 ids** — every subject that names a neutral and no warm colour. Treat the flag as
   **advisory**: it points a reviewer at the file, it does not condemn it.

**Human, sampled — three passes, ~30 minutes for the whole batch.**
7. **Identity, 100% at thumbnail.** One contact sheet per category at 48 px. This repo has shipped a
   boar named `bear.png` and a vampire named `dragon.png`; no automated check can catch it.
8. **Ladder strips.** Each tier ladder as one 7-across strip at 48 px. Ask one question: *is this a
   progression?* A rung that reads as the wrong metal fails the whole strip, not the one file.
9. **Monsters only — the hook.** Does the resistance read in the body, and is the weakness marking
   present, matte and small? Per §0.1 of `monster-art-prompts.md`, a portrait with no hook is wrong
   even if it is beautiful.

## 0.12 · The translucency finding — a PIPELINE fix, not a prompt clause

**Measured across all 13 pilots** (canvas pixel read, not inference): only **0.3–2.0%** of pixels in
any file are fully opaque. The modal interior alpha is **254**, and typically **50–80% of the canvas**
sits in the 252–254 band. So the earlier "interiors arriving at alpha ~247" understated it — it is
not a fringe, it is the whole painted interior, one to three steps short of opaque.

**No prompt clause can affect this and one would be worse than useless** — it is an artefact of
Recraft's `removeBackground` matting, which runs *after* generation and knows nothing about the
prompt. Spending words on it would dilute the clauses that do work.

**The fix is shipped: `tools/qc-art.mjs --snap`.** It snaps `alpha >= 250 → 255` (the interior becomes
genuinely opaque) and `alpha <= 16 → 0` (kills matting residue — the pilot `barn_rat.png` carries an
alpha-12 corner pixel and `iron_sword.png` an alpha-5 one), leaving 17–249 untouched so real soft
edges survive. Re-encoding goes through Chromium's own PNG encoder rather than a hand-rolled codec,
because a codec bug across 600 funded images is not a thing to debug at 2 a.m.

**Proven on the real pilot files, not asserted:** after the snap, fully-opaque pixels go from
**0.3–2.0% → 16–64%** of canvas and the semi-transparent band collapses from **50–80% → 4–8%**; a
second run reports **0 files changed**, so it is idempotent and safe to re-run over a partially
processed batch. It is a **separate post-pass rather than a change to the generation path** on
purpose: the funded batch should not be the first run of new code inside the spend loop, and a
post-pass can be re-run on any subset.

**Run it as the gate:** `node tools/qc-art.mjs <out-dir> --snap --neutral <ids.txt>` — it exits
non-zero on any §0.11 failure. On the 13-image pilot it independently caught both known defects and
nothing else: the `iron_ore` neutral failure (38% warm) and `bronze_sword`/`oak_log` being
byte-identical.


## 0.13 · The guard, so this is never found by spending money again

`tools/gen-art.mjs` now **refuses to run** — exit 2, before the dry-run summary and before any
network call — if any assembled prompt is over 1000 characters or empty. It names every offender
with its length and overage. It also prints `prompt length: longest N/1000` on every successful run,
so the headroom is visible rather than assumed, and **warns when `--style-id` is missing**, because
the re-cut wrapper deliberately no longer describes brushwork.

**Mutation-proved four ways** (three synthetic, one real):
| Mutation | Expected | Result |
|---|---|---|
| a 1001-character prompt | refused | `✗ items/a.png: 1001 chars (cap 1000, over by 1)`, exit 2 |
| a prompt of **exactly** 1000 | **accepted** — an off-by-one guard is a broken guard | `longest 1000/1000 — all within the API cap`, exit 0 |
| an empty/whitespace prompt | refused (the API's lower bound is 1) | `✗ items/a.png: empty prompt`, exit 2 |
| **the real pre-re-cut pilot manifest** | refused | 6 offenders named, worst `monsters/grim_reaper.png: 1147`, exit 2 |

That last row is the one that matters: the guard was proved against **the exact file that would have
burned the batch**, not only against synthetic input.

---

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
