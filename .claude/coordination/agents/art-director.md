# Art Director — running log

_Your private journal. Append what you learn, decide, and change (newest at top). The Coordinator and other agents read this to understand your domain. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

### 2026-08-16 · b361 — the re-roll: 386 → 428 wired, 107 rejected → 65. The handed-down
### verdicts did not survive my own eye, and the staff class is a MODEL limit, not a prompt bug.

**The first thing I did was disbelieve the brief, and I was right to.** I was handed a list of
"~15 CLEAR PASSES" from the previous 41-image experiment and told not to re-derive them. I built a
contact sheet of all 66 re-rolls and looked anyway, because processing and wiring a file is the one
irreversible step in this pipeline. **`yew_staff` — the flagship example in my own b358 entry — was on
the pass list and is visibly a HAMMER. `dawnpoint_arrows` was on it and is a mallet. And
`steel_arrows`, listed as an "archery target", is a round SHIELD with a boss.** Four of the fifteen
were wrong and four more were marginal. I wired **8**, not 15. A verdict you did not make yourself is
a hypothesis, and the cost of testing it here was ten minutes.

**Spend: $2.68 of a $3.30 cap** (10 probe + 57 batch images; the run stopped at 57 of 66 on
`not_enough_credits` — the account is empty, the 9 refusals were not charged). Programme total $4.36.

**The one reproducible fix, and it is the strongest finding this programme has produced.** A garment
must be described as an **object at rest, not as clothing**: *"an empty hooded cloak hanging flat with
no one wearing it"*, *"a pair of empty leggings laid out flat side by side, no wearer"*. Cloaks,
capes, mantles, robes, sashes and leggings went from a **73% class failure rate to 15 of 17 correct.**
**And it vindicates b360's disconfirmation rather than overturning it.** My predecessor measured that
anatomy words ("shoulders", "hem") were NOT the fault and threw away a half-written fix. That was
correct: **the fault was never a word that was present, it was a state that was absent.** Every one of
those rewritten lines still names shoulders and collars.

Two more that hold: an arrow must be spelled out as parts in reading order (*"a single arrow: one long
straight shaft, three feather vanes at the lower end, a small point at the upper end"* — 5 of 8, up
from 0), and a bow needs its **string** named, which is the one feature nothing else in the batch has.
The generalisation is the same shape all three times and is now the rule in the picker: **name what
the object uniquely HAS or the state it is uniquely IN; never name what it must not be.**

**The class I stopped spending on, and stopping was the decision I would defend hardest.** Staves and
fishing rods: two funded probes, ten generations, three wrapper cuts. Removing *"filling the frame"*
and *"chunky-heroic exaggerated proportions"* from P-SHAFT **did** kill the hammer head — 28 of 28
before, 0 after, so that diagnosis was right — but the model then returns a short fat baton and simply
**ignores an explicit eight-to-one aspect ratio**, while obeying it perfectly for arrows in the same
run. Naming a canonical thin noun made it worse: **`oak_staff` came back as a signpost with the word
"Quarterstaff" rendered as text on it, `yew_staff` as a candy cane.** Sixteen ids are deferred
unrolled. This is the fourth round of re-wording that class would have been, and this document's own
standing lesson says the lever is an API field, not prose. I saved $0.64 and, more to the point, I did
not hand the next person a fifth round.

**What I would not let through.** `dire_fang` came back as a molar rather than a canine and
`willow_rod` is the best of seven rods in a class whose other six are unsolved — both held back. A
mixed shelf inside one family is worse than a consistent fallback.

**Honest score on the 60 judged: 34 pass, 26 fail.** Garments 15/17. Arrows 5/8. Bows 1/2. **Bars 0/4**
— `iron_bar` is an ANVIL even when the line reads "a single solid rectangular brick-shaped block",
`steel_bar` came back as a framed landscape **painting**. `gold_ore` is a golden **fist**. `potato` has
returned a humanoid figure **three times running**. Those are the next class to diagnose and the method
is b360's: base-rate against the SHIPPED control, never read the failing prompts alone.

**A test failure that was a real message, not a nuisance.** Wiring `dawn_platebody` turned the b358
guard's control **vacuous** — it pinned the suffixes `_helm|_platebody|_sword`, and I had just covered
the last one, so a control meant to prove the generated mapper still runs instead proved only that its
list was exhausted. **A control keyed to a hardcoded id shape has a shelf life and this batch is still
growing.** I rewrote it to read live state. My first rewrite was a clear-and-repaint MUTATION and it
**failed** — `mapGeneratedGear` opens with `if (LOCAL_ITEM_ICON[id]) return`, so it is idempotent by
short-circuit and can never repaint. I deleted the mutation and wrote down why, because the next
person will reach for exactly that.

**Verified in-browser, my own server rooted in my own worktree.** 8 surfaces × 3 contexts:
**0 404s, 0 console errors, 0 broken `<img>`, 0 tiny `<img>`, 1060 hearthfire icons rendered, 428
wired.** Then I opened the inventory capture and read it — the new arrows, cloaks and robes hold at
34 px and the shelf still reads as one set. Captures in `assets/art-pilot/_screenshots/b361/`.
**Suite 764/764, three green runs. No version bump, no push.** (The pre-existing Edge-payload red from
b357/b358 has cleared on its own — deployed now matches the repo.)

**Standing lesson to add to the pile: the failing half is never the words — until the wrapper is right,
and then it is exactly the words.** §0.10b and §0.10c were correct to refuse to blame prose, and this
pass was correct to blame it. Which one applies is decided by whether an API-field lever is still
unexhausted, not by taste.

### 2026-08-16 · b358 — the full item batch is WIRED, and it is 386 of 512, not 512 of 512

**I was told the batch was done and asked to wire it. It is not done, and I found that by looking.**
512 files, all technically clean — 1024² RGBA, real alpha, no hash-duplicates, no backdrops; I
re-verified all three claims and all three hold. Then I built a contact-sheet tool and looked at every
one of the 512 at render size on the hearthlight surface against the prompt sheet. **107 depict the
wrong object.** `yew_staff` is a woodcutting axe. `iron_ore` is a hammer. `slime_gel` is a pool
8-ball, `yew_plank` is a chessboard, `spellstone_diagram` is a dartboard. `potato`, `gold_ore`,
`granite`, `troll_hide` and four others are **humanoid figures** — the one thing the shared suffix
bans outright. **Wiring all 512 would have been the worst regression this repo has shipped**, and it
would have passed every guard in the suite, because no guard can tell a hammer from an ore.

**So I split the ruling rather than obeying it or refusing it.** Tyler's "all 426 or nothing" is about
STYLE adoption — a mixed shelf of two art directions — and that argument is untouched by a file
depicting the wrong noun. The 386 correct files are wired **game-wide**; the 107 wrong ones and the 27
whose filename resolves to no live id are withheld, keep their existing fallback, and are worklisted
in code (`REJECTED_WRONG_SUBJECT`, `UNRESOLVED_FILES`, `REGENERATE_DESPITE_SHIPPING`) with a suite
guard that fails if a withheld file is ever also shipped. **Total adoption stays available at the cost
of one array** once the re-generations land. That is the decision I'd defend: I did not quietly
downgrade the directive, and I did not ship a chessboard called "yew plank".

**The size discrepancy is dead, and the pilot was wrong — including where the pilot was me.** 128, not
256. The pilot's DPR argument double-counts: the measured ceiling is 64 CSS px, which at DPR 2 is 128
DEVICE px, so 128 px art is 1:1 there; a DPR 3 phone renders items at 34–44 CSS px = 102–132 device
px, so 128 is ~1:1 there too. **I did not argue it, I rendered it** — a 128-vs-256 A/B into the real
64 px and 34 px boxes at DPR 2, indistinguishable — and 256 costs **47 MB against 14 MB** on a
6 MB icon bundle. Shipped set is 13 MB. The measurements live in the header of `src/data/item-art.js`.

**Two mechanism decisions worth keeping.**
*The manifest, not a literal* — `src/data/item-art.js` is the item twin of `monster-art.js`: the
filename is DERIVED from the id, so a 386-line map cannot drift, and `itemArtPreflight()` in
`run-smoke.mjs` reconciles it against the real filesystem in both directions plus "is this a live
ITEMS key" plus "is this id in two folders".
*The applier, not an import* — the merge-order trap is real and I proved it rather than reasoning
about it. `__mapGeneratedGearIcons()` re-runs **1500 ms after load** and only skips ids it can see in
legacy's own `LOCAL_ITEM_ICON` closure. Writing `window._itemPath` directly from main.js — the obvious
way — would have let a generic iron platebody overwrite ~90 real paintings a second and a half after
the player saw them land. So legacy exposes `__applyHearthfireItemIcons()` and main.js calls it, and
the b358 guard **re-runs the generated mapper as its mutation** and asserts nothing moved, with a
control proving the generated mapper is still doing its job for uncovered ids.

**Three things I nearly shipped wrong, all caught by checking rather than assuming.**
`iron_ore` — my copy step wiped the pilot's file because the batch's replacement was rejected, which
would have been a silent regression caused by *my* change. Re-ran the pilot raw at the new spec and
kept it. `muster_seal` — the batch has a perfectly good painting and I withheld it anyway: it is a
CURRENCY rendered inside the `.hr-med` medallion, whose whole design language is a centred vector
glyph that cannot go soft. I widened the `b193` guard (its property is "a curated shipped folder",
like `b186` before it) but **left `b220` strict** rather than weakening a guard to let my own change
through. And the screenshot harness told me "recipe-book control found: true" **twice while
photographing the wrong screen** — `dismiss()` was deleting the overlay I had just opened. A harness
that reports success is not evidence; the capture is.

**Verified in-browser, my own server rooted in my own worktree** (the pilot's twenty-minute lesson).
8 surfaces × 3 contexts: **0 404s, 0 console errors, 0 broken `<img>`, 0 tiny `<img>`**, 990 hearthfire
icons rendered, including a recipe book carrying 726 of them on one screen. Desktop hearthlight,
cozy-light (no leak, icons read fine on the light surface), mobile-landscape 922×423 scaled-desktop.
9 captures in `assets/art-pilot/_screenshots/full-wire/`.

**Suite 764/764, three consecutive green runs, no version bump, no push, monsters and supabase
untouched.** One caveat, chased down rather than waved at: a mid-pass run showed **763/764 and I had
not captured which test**, so I kept running until it reappeared with its name. It is the **Edge
payload guard** — the deployed `hr-accrue` reports `f616d3b8…` while this repo packs to `7ad2bd94…`.
**Not mine**, and I proved that rather than assuming it: the repo-side hash is `7ad2bd94…` in the
FIRST run of my pass (when it passed) and identical in the last, and `node tools/pack-edge.mjs` shows
`src/data/item-art.js` is not among the 50 packed files. The DEPLOYED side moved under us. My
predecessor's b357 entry already records this guard as pre-existing red. **Lesson I'd repeat: a
failure you cannot name is not a flake, it is an unread message — run it again until it speaks.**

**Known limitations.** The item-detail popup capture landed on `turnip_seed`, which keeps its painted
crop art by the b217 seed ruling — so the largest item render is photographed, but not wearing a
hearthfire icon. The shipped bundle is now 13 MB of PNG-24; **palette quantisation would cut that
60–75% and I did not do it** — no optimiser in the toolchain, and it is an asset-pipeline job. And
`rune_*` items read bright teal while `void*`/`warlock_*` read heavily purple; both are legible tier
languages rather than drift, but they are the two palettes the standing non-negotiables name, so they
should get an explicit ruling rather than arriving by default.

### 2026-08-16 · The Recraft unblock — both proposed levers FAIL; `controls.colors` is the one that works

Ran the two unblock paths Tyler said "try both" to, plus a third I derived from what A proved.
**27 generations, $1.09.** Full ruling in `docs/design/art-direction-picker.md` §0.10c. Short version:

- **Seed cap is 5** (`400 … "Number of images must be between 0 and 5"`). "More seeds" was never available.
- **A — palette-neutral (greyscale) anchor: NO-GO, and it disproves the premise.** True-greyscale seeds
  produced **monochrome output**, 5/5, while composition and bans were flawless. So a Recraft custom
  style transfers the seeds' **colour distribution**, not just their hand — "hand without palette" does
  not exist by construction. Do not re-propose it.
- **B — built-in style + HAND words + hardened bans: NO-GO.** Fits the cap (975/1000 worst case) and
  changed nothing: a landscape painting with a sword leaning in it, a boulder on a grass disc, a
  doberman in an ornate border with a forged artist's signature. **Hardening a ban does not make
  Recraft v3 obey it, and naming the exact artefact does not help.**
- **The lever: `controls: {colors:[{rgb}]}`, accepted alongside `style_id`** (verified by execution;
  undocumented). It **overrides the anchor's palette** — the property nothing else in this programme
  has had. `iron_sword` came back cold grey with a warm grip, `bronze_sword` warm, and **`iron_ore`
  came back neutral grey with rust streaks: the defect that started this whole programme is fixed.**
- **Items: CONDITIONAL GO** (blocker is a colour-name → RGB table so 512 palettes are derived, not
  hand-authored). **Monsters: NO-GO** — on a bust the palette is spent as a **backdrop wash**, and an
  explicit ban naming that exact artefact did not stop it across 4 rounds; the two-headed Hellhound
  came back single-headed 7/7. Recommend Tyler hand-generates the 85 monsters in the web UI.

**Standing lesson, third time in this programme.** The failing half is never the words. §0.2 blamed
prompt length, §0.10b blamed the anchor, this pass was asked to blame seed spread — the actual levers
have all been **API request fields**, not prose. Before re-cutting a wrapper again, ask which field is
wrong.

**Wired:** `tools/gen-art.mjs --colors <file.json>`, which refuses without `--style-id`. Judged every
file by opening it at full size (never a warm%/clear% proxy, per §0.10b); contact sheets at
`assets/art-pilot/_sheet.png` and `_sheetG.png`.

### 2026-08-16 · HEARTHFIRE ART PILOT wired + photographed (branch only — no bump, no push)

Processed 13 Recraft 1024² exports, wired **12**, shot the game wearing them. Suite 736/736.
Files: `tools/art-pilot-{process,alpha,shots}.mjs`, `assets/icons-bundle/hearthfire/**` (12 PNGs),
two clearly-fenced blocks in `applyLocalIcons()`, one widened smoke assertion, one `.gitignore` line.

**My verdict, stated plainly so it is on the record.** The Hearthfire lane is a real step up in
*character* — the winter wolf, hellhound, grim reaper, elk king, shrimp, bread, leather jerkin and
plate cuirass all read instantly at the sizes they render, and the brushwork has an authored quality
the old CraftPix set never had. But **it is a different game's art**, and the inventory grid proves it:
loose visible strokes and a dark rim-lit key against the old set's smooth airbrush and light rim.
There is no half-adoption. **Go means all 426 items and the whole monster roster, or nothing.** That is
the decision I'd put in front of Tyler, not "do these look nice".

**Two things I would fix before a full run** (both in HANDOFFS to Asset Director): `iron_ore` is the one
export that fails at render size — it reads as raw meat, not the ladder's "plain dark grey iron"; and
`oak_log.png` is literally a copy of `bronze_sword.png`, which is the batch-QC lesson of the whole
exercise (hash the set — a cross-category duplicate defeats every other automated check).

**Three spec corrections I own and should land before the roster run** (detail in DISCOVERIES):
the arena portrait is a **circle**, so the silhouette must fit the inscribed circle and not the square;
item long-edge should be **256, not 128**, because the 128 figure ignored devicePixelRatio; and the
exports arrive **~3% translucent** on their solid interior, which the pipeline now normalises.

**Habit worth keeping:** I judged nothing from source. Every claim above came off a rendered screen,
and the two failures I found (`oak_log`, `iron_ore`) were both invisible in the file browser and
obvious in the inventory grid.

## Standing knowledge
- Non-negotiables: 0 emoji as art; **"Forge & Stone" = the WORLD (castle, hearth, iron, stone, leather, timber) — as of 2026-08-16 it is a subject-matter rule, NOT a palette rule**; hearthlight (dark) default; earned containment (no wall-of-cards); Alegreya Sans + Cinzel; locked colour roles; wide surface value-ladder.
- **Art direction is being reset (2026-08-16).** The shipped `assets/icons-bundle/painted/` set is retired as a style anchor — do not defend it, do not match it. Candidate directions live in `docs/design/art-direction-picker.md`; subject clauses (style-agnostic) in `item-art-prompts.md` + `monster-art-prompts.md`. **Item icons max out at 64×64 on screen; monster art must be square 256.**
- Inspect RENDERED screens (preview `hearthrise-qa`, port 8123). Sticky cache — force-reload and confirm the build.
- Apply the design-review standard before declaring done; verify desktop + mobile-landscape.
- Icons = baked atlas `src/data/glyphs.js`. Theme rules must be scoped.

## Log
### 2026-08-16 · b357c — NO-GO on the batch. The QC proxy was scoring the backdrop.

**I was handed two findings and reversed one of them by opening the files.** The brief said the style
anchor was harmful and the un-anchored wrapper was the fix, on `qc-art.mjs` warm-percentages
(`iron_ore` 38%→10%, Hellhound 18%→3%). Both numbers are real and both conclusions are wrong.
**The un-anchored "best score in the batch" `iron_sword` is a smooth airbrushed sword on a teal-blue
app-store TILE. The un-anchored Hellhound — the 3% — is a photorealistic 3-D wolf standing in a snowy
forest. `oak_log` is a badge with a ring border and a pine forest inside it.** The proxy counts warm
pixels over the whole opaque canvas and the majority of that canvas was a backdrop the prompt bans.
A February sky scores 3%.

**Mechanism, one line of code:** with no `--style-id`, `gen-art.mjs` sent neither `style` nor
`style_id`, so Recraft applied its default — `realistic_image`. **"No anchor" was never a control; it
was a fourth, worse style.** The tool now refuses to run when neither is passed (proved: exit 2), and
`--style`/`--substyle` exist so a built-in can be chosen on purpose. The old "WARNING: no --style-id"
line is gone — it was advisory about the wrong thing.

**Finding 2 — the suffix is innocent, and I did not rewrite it.** I cut a re-phrased SUFFIX that
leads with the permission rather than the ban, measured it to 383 chars against a 393 ceiling (the
312-char Vampire Bride subject is the binding constraint), and then **the controlled test said not to
ship it**: under a fixed built-in style the Hellhound came back with vivid red markings on the OLD
suffix (`v2-C`) *and* the new one (`v2-A`). No observed failure behind the change, so no change. That
is this document's own rule and it applies to me.

**What is actually broken is the anchor, and it is worse than suppression.** Same anchor, same two
prompts, run twice: Hellhound (*char black, ember red*) → white-and-ice-blue, then black-and-tan
rottweiler. Winter Wolf (*snow white, pale ice blue*) → char black with ember-orange horns, then
brown. **Four generations, four palettes, none of them the one its subject line names**, and run 1
looks like the two seed images swapped onto the wrong prompts. **A 4–5 image Recraft custom style
transfers PALETTE, not just hand.** The item anchor does the same, louder: cold iron and neutral grey
rock come back SALMON PINK, because `wheat_bread` + `cooked_shrimp` generalised into a palette. The
anchor defeats C-METAL and the neutral-material lock — the two clauses it was created to reinforce.

**But dropping it is not the answer either, and this is the part I'd have got wrong from source.**
Every ANCHORED generation is properly isolated — one object, no scenery, no ground, no frame, no
text. Every un-anchored and built-in one ignores those bans wholesale; the low point is a built-in
`iron_sword` that came back as a **parchment infographic with callout lines and five labels of
gibberish pseudo-text.** **Prompt bans do not survive Recraft v3 — only the anchor holds composition.**
So the anchor is simultaneously the only thing holding the framing and the thing destroying the
colour. Neither "keep it" nor "drop it" is a ruling; rebuilding it is.

**NO-GO on both batches** (85 monsters, 512 items). No variant tested produces a shippable item icon.
Firing them would have cost ~$25–30 and a reviewer's day. **The only configuration that has ever
produced correct output is the approved 13-image pilot: the Recraft WEB UI at 1141–1665 characters,
which the API rejects at 1000.** That is the real blocker and it has now been mislabelled twice.

**One guard I built, tested, and then DELETED.** I found that colour-type 6 is not the same as "has a
cut-out" and wrote a from-scratch PNG decoder to check corner alpha. Then I ran it against all nine
real files: **not one had opaque corners.** The backdrop leaks through as a semi-transparent 16–249
band instead (the built-in `iron_ore` is 83% of canvas in that band), which `qc-art.mjs` check 1
already catches. A guard with no observed failure behind it is dead weight I'd have to maintain, so I
reverted it. Recording it because the *finding* — soft-alpha band, not corner alpha, is the backdrop
detector — is worth keeping even though the code was not.

**$0.40 spent, 10 images.** Suite **752/752, 0 runtime errors.** Tools + docs only, no `src/`, no
version bump, no push. Ruling written up as `art-direction-picker.md` §0.10b, with §0.10's
"always run with `--style-id`" paragraph explicitly marked superseded rather than quietly edited.

### 2026-08-16 · b357b — the wrapper was re-cut by an API limit, and the limit improved it

**The blocker, found by execution.** The Coordinator built both style anchors and ran my own §0.10
step-4 verification on four pilots before the batch. All four returned
`HTTP 400 — "prompt length should be in [1, 1000]"`. **Recraft caps a prompt at 1000 characters.**
My first cut assembled to a **median of 1141 and a max of 1665: 15 of 16 over the cap**, so the
600-image batch would have failed 100%. **It cost $0.00 because rejected requests are not charged.**
I wrote that step as "an anchor that changes the pilot will change everything" — it earned its place
for an entirely different reason. **Keep a cheap end-to-end call in front of every funded batch; the
failure it catches is rarely the one you wrote it for.** I did not catch this myself, and the reason
is worth naming: I measured *pixels* everywhere in this pass and never once measured my own output.

**Why the re-cut is genuinely better and not a compromise.** The clauses eating the budget were
brushwork, the lighting recipe, the value-range sentence and the palette enumeration — that is the
**hand**, and my own §0.10 argues that the anchor carries the hand far more strongly than words. They
were redundant the moment the anchors existed; I had just left them in "belt and braces". The wrapper
now carries only what an anchor cannot express: framing, the hard bans, and four rules that each
prevent a specific observed failure.

**Budgeted, not guessed.** Measured the longest subject clause across both sheets FIRST — **312**
(MON-UND-07 Vampire Bride; items max 200, `iron_ore`) — then sized the wrapper to fit around it.
Pieces: P-ITEM 248, P-WEAPON 239, P-MONSTER 212, C-METAL 118, C-ENCHANT 83, C-SIGNAL 83, SUFFIX 333.
Assembled over all **597** live subject lines: **median 782, max 944, zero over 950, zero over 1000.**
The monster path is the binding constraint (longest subjects, so the shortest wrapper budget); that
is now written into the monster sheet as a **~318-character ceiling per subject line**.

**One cut I had to think about.** Dropping C-METAL's "warmth only on leather, cord, wood and brass
fittings" half felt like giving up the metal fix. It is safe for a specific reason: the item anchor
is seeded with **two cold-metal exemplars** (`iron_sword`, `iron_platebody`) that demonstrate exactly
that, and demonstration beats description. The half that survives is the half a picture cannot
argue — which metals are cold and which stay warm.

**The guard, mutation-proved four ways.** `gen-art.mjs` refuses to run (exit 2, before the dry-run
summary and before any network call) on a prompt over 1000 or empty, naming every offender and its
overage. 1001 → refused; **exactly 1000 → accepted** (an off-by-one guard is a broken guard); empty
→ refused; and **the real pre-re-cut pilot manifest → refused with 6 offenders named, worst
`grim_reaper.png` at 1147.** That last one is the proof that matters — the guard was tested against
the exact file that would have burned the batch. It also now warns when `--style-id` is missing,
because a wrapper that no longer describes brushwork produces poor output without its anchor.

**All 13 pilot prompts re-assembled too** (max 891), because a manifest that cannot execute is a
trap: with the guard in place the old file would have exited 2 and blocked the three re-runs sitting
at the bottom of it. Style ids recorded in §0.10 so the batch is reproducible:
items `96fc6650-52e5-458f-855f-62da2757f065`, monsters `52693fa5-649f-4d7c-993b-5ce9e5b33f91`.

**Smoke 737/737, all green.** No src change in this pass — docs and tools only.

### 2026-08-16 · b357 — the square portrait + the ratified Hearthfire batch wrapper

**Job 1 — the mask.** Tyler: *"should we just not use a circle for the portraits instead?"* He is
right and the reason is stronger than taste. The arena portrait was a 96 px **circle** with
`object-fit: cover` — **two crops stacked.** `cover` discards the overflow of a non-square source and
30 of the 36 shipped monster files are 128 px long-edge and non-square; the circle then removed the
corners of what was left. **Corners are where a creature keeps its silhouette** — antlers, horns, a
scythe, ears, a crest — which is exactly the information a bestiary is read by. And it was not just
a display bug: an inscribed circle costs ~21% of a square frame and quietly imposes a "keep the
subject inside the circle" composition rule on **every one of the ~600 generations still to come.**

**I changed the mask, not the styling.** One shared token `--r-portrait: 6px` in art-direction.css
§2 (the sheet's own shape language is 2/3/5 px — "stone and iron have arrises, not 16 px fillets" —
so 6 px on a 96 px plate reads deliberately near-square), and the arena plate keeps its 2 px gilt
border and gains a proper sunken plinth (`--surf-sunken` + `--surf-sunken-edge` + a soft radial) and
a drop-shadow on the subject so it stands ON the plate instead of being pasted over it.

**Every creature surface took the same treatment, because a mask that is square in one place and
round in five is worse than either.** Arena portrait + the pet badge perched on it, bestiary row,
monster row, mob-preview modal (120 px), monster detail portrait (128 px — it carried a 24 px fillet
of its own), the bounty-board "printed cut" (a wanted notice carries a printed plate, not a locket),
and `companionIconHtml`'s inline style. **Six of those also moved `cover` -> `contain`**, which is
the crop that actually mattered. **The medallion `.hr-med` stays a circle on purpose** and I want
that written down: it is a struck coin holding a centred vector glyph at 60% size — it cannot crop,
and it is the game's "this is a thing in the world" affordance for skills and currencies too.

**Two tokens, no literals.** The foe frame had a hardcoded `#e36161`. `--red` is oxblood `#b23a2c`
and a 2 px ring in it goes to mud on near-black, so `--red-line` now exists in all four theme blocks
(the `--green-line` precedent from b326) and the ring is `var(--red-line, var(--red))`.

**Verified in-browser, which took three tries and each failure is worth keeping.** Headless Chromium
against my own static server (the shared launch.json is rooted in the main checkout, so a
`preview_start` server serves the WRONG tree — I lost twenty minutes debugging edits that were live
on disk and absent from the page; the Browser pane still never composites in this session, so no
`computer{screenshot}`). Then: **`element.screenshot()` waits for the element to be STABLE and the
arena is never stable** — a one-shot kill plays the b297 death throe on a loop — so every capture
goes through `page.screenshot({clip})` off a measured rect. And **`startCombat(sameId)` toggles the
fight OFF**, which silently emptied the arena for the last capture in the loop.
Measured: **96x96 desktop / 56x56 mobile-landscape, radius 6 px, `object-fit: contain`, border
`rgb(207,83,64)`** on all five pilot monsters at both sizes. 20 captures in
`assets/art-pilot/_screenshots/square/`, including a real before/after (the old declarations
re-injected, not remembered) on the Elk King — the antler tips and the shoulder come back.

**Job 2 — the wrapper, and the finding that changed it.** The brief listed the clauses to include;
the measurement found the one nobody had. **`iron_ore` came back polychrome red/violet not because
its subject line was bad — it is correct — but because when a subject's material is a NEUTRAL
(stone, ore, bone, ash, coal, plain iron, masonry) the warm palette clause has nothing legitimate to
land on and repaints the material itself.** Numbers, not impressions: 38% of its opaque pixels are
warm-dominant against 16% for the correctly-cold `iron_sword`. **Every neutral-material icon in a
600-image batch was exposed to that**, so the fix belongs in the shared SUFFIX — *the palette
belongs to the LIGHT and to stated trim only* — and it is the single most valuable sentence in the
document.

**Ratified wrapper is `art-direction-picker.md` §0** (three prefixes, three conditional clauses, one
shared suffix, an assembly table, and every clause annotated with the specific failure it prevents —
a clause with no observed failure behind it was cut). Both prompt sheets now point at it instead of
carrying style language.

**Ruling: use a Recraft custom Style anchor, two of them.** Prompt text pins subject, composition and
bans; it does not pin *hand*, and hand-drift across 600 generations is invisible per image and
glaring on a shelf — which is the whole studio-quality property. **`bronze_sword` is deliberately
excluded from the item anchor**: it is a beautiful, correct image, but bronze warmth is a per-item
*subject* property and anchoring it risks bleeding warm metal back into the ~200 cold-metal icons
that C-METAL exists to protect. **And I said the true thing about seeds:** Recraft's v3 generation
endpoint exposes no seed in the call we make, so there is no seeding lever; contiguous family
ordering is a **QC** lever, not a consistency one (generation is stateless — ordering changes what a
reviewer sees side by side, not what the model produces). Inventing a seed strategy would have
sounded better and been false.

**Two sweeps of the item sheet, both driven by an observed failure.** 38 lines carried "a handful/
pile/heap/stack/bundle of…" or "…on a wooden board" — the shrimp defect, generalised: at 34 px the
board IS the silhouette. All rewritten to one oversized specimen (bowls and pots survive where the
vessel IS the item). And the neutral-material lines got a local colour lock on top of the wrapper
clause. **426 rows before, 426 after** — verified by count, ids untouched.

**`tools/qc-art.mjs` is new and it is the deliverable I would defend hardest.** Six automatable
checks over a whole batch, zero API cost, exits non-zero. On the 13-image pilot it independently
caught **exactly the two known defects and nothing else**: `iron_ore`'s neutral failure, and
`oak_log.png` being **byte-identical to `bronze_sword.png`** — a silent duplicate download that no
part of the pipeline noticed. It also carries the alpha snap (a>=250 -> 255, a<=16 -> 0): measured,
only **0.3–2.0%** of pixels in any delivered pilot are opaque, the modal interior alpha is **254**,
and 50–80% of the canvas sits at 252–254. **That is a matting artefact and no prompt clause can
touch it** — spending words on it would only dilute the clauses that work. After the snap: opaque
16–64%, soft band 4–8%, and a re-run changes 0 files.

**One live hazard fixed in `gen-art.mjs` while I was there:** a manifest that redefines an output
file (the re-run block does exactly that) generated it **twice in one run**, and which prompt
survived depended on which worker finished last. Last definition now wins, loudly.

**Smoke 737/737, 0 runtime errors.** The `b357` guard builds the real nesting off-screen and asserts
no circle + `contain` at the arena AND the bestiary row, plus that the mask is one shared token so a
future screen cannot invent its own. No version bump.

**Known limitations — be honest.**
- **Merged with main `ab36938` mid-pass, and re-verified after it.** The brief said the pilot was
  already on main; it was not at that moment (another worktree held it) and my first shoot
  therefore injected `window._monsterIcon` at runtime. After merging I re-shot all ten captures
  **through the real `applyLocalIcons` path** — sources now report `natural 256x256` from
  `assets/icons-bundle/hearthfire/monsters/*`, plate 96x96 desktop / 56x56 landscape, radius 6 px,
  `contain`. So the mask and the wiring are now verified in the same run.
- **The monster pilots came back with painted backdrops**, not transparent — the elk sits on an
  opaque dark-red tile. Inside a framed plate it happens to read fine, but it is a spec violation and
  the batch's busts must not do it. The suffix now bans "backdrop wash / vignette" explicitly;
  unproven until the re-run.
- **I have not verified the Recraft `/v1/styles` file cap** (documented as 5) or that `style_id` is
  accepted alongside our body — both need one cheap call before the batch, and §0.10 says so.
- **`.hr-botd .botd-icon` has no size box** and its `<img>` is `width:100%;height:100%` — likely
  resolving to intrinsic size. Spotted while walking monster render sites; out of scope, unmeasured.
- Pre-existing red in the suite: the **Edge payload guard** fails (deployed `hr-accrue` hash !=
  repo). Unrelated to this pass and present before it.

### 2026-08-16 · the art-direction reset — picker + 512 subject lines (docs only)

**The directive, and what it does and does not retire.** Tyler, binding: *"I don't like any of our
current art; I want to move in a different direction and have that AI bot do all of the items
tonight."* Then two corrections that arrived mid-task and both mattered: the warm **Forge & Stone
palette is no longer a constraint** ("we've kind of veered off it a bit anyway"), but **Forge & Stone
survives as the WORLD** ("I still like the idea of forge and stone in terms of castle and hearth etc").
So the picker's intro now says the thing that keeps five lanes from becoming five games: **every lane
depicts the same world — iron, stone, hearth, castle, leather, timber. What varies is how it is painted
and what temperature it runs.** Without that sentence a five-lane picker drifts into sci-fi and chibi by
lane three. **Update the standing-knowledge line above: "Forge & Stone medieval" is now a SUBJECT-MATTER
non-negotiable, not a palette one.**

**Three deliverables, all docs — I touched no `src/`, no `assets/`, no review book.**
`docs/design/art-direction-picker.md` (five lanes), `docs/design/item-art-prompts.md` (512 subject
lines), and a surgical revision to `docs/design/monster-art-prompts.md` (style wrapper replaced by a
pointer to the picker; all 85 subject lines byte-untouched, verified by count).

**The measurement that decided the recommendation, and it corrected a repo doc on the way.** I did not
argue lanes from taste. I inlined the six real stylesheets into a 1440×900 same-origin iframe with real
container markup under `body[data-theme="hearthlight"]` and measured every icon host. **No item icon in
this game is ever displayed above 64 × 64.** The ladder is 15 → 22 → 30 → 34 → 36 → ~44 → ~54–68 → 64.
`itemization-and-art-pipeline.md` cites a 96 px level-up icon as an item render size — **it is dead**:
`legacy.css:2390` declares 96 px, `audit-overrides.css:128` overrides to `32px !important` and wins.
That ceiling is the whole argument. Three of the four alternative lanes fix "the current art is
unmemorable" by adding *subtlety*, and 64 px destroys subtlety before a player ever sees it. **Hearthfire
(warm, high-contrast, hand-painted, Hearthstone-adjacent) fixes it by adding CONFIDENCE** — exaggerated
proportions and a wide value range are thumbnail engineering, not decoration. Recommended it, with
Guildmark named as the safe pick and Cold Iron as the second, and Chronicle argued against outright.

**The most useful honest thing in the picker: Guildmark is the smallest step from what Tyler just
rejected.** The shipped set is already a flat/cel hybrid with a thick near-black outline; the clean
bold-icon lane is that set with higher saturation and cleaner geometry. It is objectively the best
thumbnail performer and the most reproducible across 500 generations — and recommending it without
saying it is a *refinement of the rejected direction* would have been the easy, wrong answer. Said it in
the lane and again in the recommendation.

**A monster defect found by header-walking rather than by trusting the audit.**
`itemization-and-art-pipeline.md` Appendix D says `painted/monsters/` is all 256 × 256. It sampled six
files. All 36 read: **30 are 128 px long-edge and NON-SQUARE** (`venom_spider.png` is 128 × 83), only the
6 Hunt bosses are 256. That is live damage, not trivia — the bestiary row and the arena portrait both use
**`object-fit: cover` on a square box**, so a 128 × 83 portrait is upscaled and loses ~35% of its width
today. Items are the opposite: `contain` at every measured site plus an inline `object-fit:contain`
written into `window._itemSVG`. **Hence the two specs genuinely differ — monsters square-256, items
128-long-edge with a free short edge — and that asymmetry is now written down with its reason.**

**Verified the item sheet by execution, not by reading it back.** Parsed my own 426 live rows out of the
markdown and diffed against `Object.keys(ITEMS)` from a real import of `src/data/items.js` (with `?v=`
stripped, so `GEAR_ITEMS` + `WAVE3_ITEMS` + `SLOT_ITEMS` merge exactly as the browser sees them):
**426 rows, 426 unique, 0 missing, 0 invented, 0 filename-column mismatches.** That check caught nothing
in the ids — but the same script caught **six wrong counts in my own section headers and batch table**
(§2.16 said 15 rows and had 18; the batch table summed to 440 against a catalogue of 426). **A count you
typed is a claim; a count you ran is a fact.** Batch table now sums to 512 = 426 + 86.

**Design decision worth keeping: the subject sheets carry ZERO style language.** Prefix/suffix live only
in the picker, and each lane ships **two** prefixes (ITEMS = single object, loot-icon angle; MONSTERS =
head-and-shoulders bust) over **one shared suffix**. The shared suffix is the mechanism that makes the
item shelf and the bestiary look like one game, and the split means the lane can be swapped without
rewriting 512 lines. The monster doc's palette-hook rule survives the reset because it is *design*, not
style — but it is now expressed **relatively** ("the palette's coldest, palest note") instead of as fixed
Forge & Stone swatches, so it still works in a cool or high-saturation lane.

**What I refused to guess.** Three live ids have no `ITEM_DESC` and names that do not determine what the
object *is*: `riftmaw_husk`, `elderscale_heart`, `dungeon_scrip`. I wrote each to the most defensible
reading — following the `icon` field, the only evidence in the repo — and put the assumption in §6 with
the correction it would need, rather than burying a guess in 512 lines. `elderscale_heart` (crystalline
vs. literal organ) is a genuine coin flip and is flagged to the Designer. Separately the **84 leather +
cloth armour pieces and 9 artisan tools have no flavour text at all**; those 93 lines are derived
systematically from the tier ladders in §1 and are the thinnest evidence in the sheet. Said so.

**Known limitations — be honest.**
- **I generated no images.** Every lane's thumbnail claim is a professional prediction from the measured
  render sizes, not an observed result. **The five test prompts exist precisely so the prediction gets
  tested before 512 generations are spent on it** — run all five on the iron longsword, view at 34 px on
  both themes, then pick.
- **No screenshots of the game itself.** The preview at :8123 was already running from another session
  and sits behind the account gate, which needs a pre-navigation init script this session cannot set. All
  render sizes are `getBoundingClientRect()` / `getComputedStyle()` measurements from the real
  stylesheets in a real iframe — true geometry, not a picture.
- **The 86 new-item lines are speculative content.** Those ids are Review Book ids; the `File` column
  proposes a `snake_case` game id, and if the implementing agent picks a different one the file must be
  renamed. Flagged in §3.
- **I did not verify the picker's lanes against `style-lanes.html`'s three older lanes** beyond reading
  their headings. That doc is pre-rejection history and treating it as constraint was explicitly out of
  scope.

### 2026-08-16 · b356 — the UNKNOWN-balance sweep (branch `agent-aa23f5924255d1d3d`)

**The brief, and the number in it was wrong in a way worth recording.** Handoff item (2) said "359
unguarded `G.gold` reads block gold/gems entering `SERVER_OF_RECORD`". Measured: 359 was a `G.gold`
grep over ALL of `src/**` **including `smoke-test.js`, which owns 330 of them**. The real production
surface is **171 raw `G.gold`/`G.gems` occurrences in 28 files**, of which the gold-site census
already accounts for **60 as WRITES** (not mine, untouched by contract). So the job was ~67 READ
occurrences, not 359 — and knowing that is the difference between a two-day mechanical crawl and a
pass that can be reviewed as a whole. **Count the census before you accept the census.**

**The seam that was "ready" was the RECORD half, not the RENDER half.** `record.js`'s `recordValue`,
`decodeBalance` and `fingerprintBalance` are live and correct — they answer `{known:false}`. What did
not exist anywhere was a thing to DO with `known:false`. So `src/net/balance.js` is new, and its whole
content is that a balance has **three** states and every caller must pick which of three forms it
wants: `balanceNum` (arithmetic, **null** on UNKNOWN — not 0, not NaN), `fmtBalance`/`balanceMarkup`
(display, an em dash), `canAfford` (decision, **fail-closed**), `balanceOr` (an explicit, greppable
fallback for the reads that genuinely are not authority). `||0` was never a sentence; `balanceOr` is.

**UNKNOWN is reachable WITHOUT arming the registry, and that is the design decision the guard rests
on.** Two sources, unioned: the registry (`recordValue`, incl. its b347 fingerprint check) **or**
presence (absent / non-finite / negative). So `delete G.gold` puts the client in exactly the state
the flip produces — testable today — while the accessor is a byte-for-byte no-op on every live save,
because `G.gold` is a finite number on all of them. A sweep of 100+ sites that cannot change today's
behaviour is a sweep you can actually ship.

**Three bugs found in the sweep that were NOT rendering bugs, and each would have shipped with the
flip.** All three are the same shape — `(G.gold||0)` reading UNKNOWN as **zero** and then being
subtracted from a later real number:
- `checkDailyGold` took the midnight baseline as `{gold: 0}`, so the **first envelope's entire
  fortune** read as "earned today" and auto-completed the *Earn 500 gold* daily.
- The `_goldSeen` income poller had it verbatim, one function down.
- `profile-launchpad.js`'s daily snapshot had a THIRD copy, feeding two more surfaces.
Each now refuses to take a baseline it cannot measure. **A zero-valued baseline is not a small error;
it is a full-balance error with the sign hidden.**

**Art direction — the pending state, and it took three measured corrections to get right.**
Em dash (not `0` — a claim; not `?` — an error; not a spinner in a numeral slot), `--ink-3`,
`min-inline-size` so it cannot collapse, a 2.4s opacity breath with `prefers-reduced-motion`
honoured, `aria-label` + `title` because a bare dash tells a screen reader nothing.
1. **`!important` was NOT enough.** Two rules are *also* `!important` **and id-anchored**:
   `body[data-theme="hearthlight"] #top-gems` painted the pending gem dash in the **gem role colour**
   (the one thing this state must never look like) and `#panel-house :not(…)` painted the House cost
   dash in full `--ink`. Found by reading the **matched-rule list off the live element**, not by
   guessing. The colour rule is now exactly one step above the higher of the two (1,3,1) and no
   further.
2. **The pending dash rendered at 14.5px inside a 21.5px `<b>`.** This codebase ships several
   `… span { font-size: … }` readability blankets, so `font-size: inherit` is the only answer that is
   right on every host at once — and it stays reachable by the b227 dial, which a px value would not.
3. **⚠ THE ONE I SHIPPED AND THEN CAUGHT: wrapping the KNOWN figure in `<span class="bal-known">`
   "for DOM symmetry" restyled it.** Measured on Home's user card: 21.5px → **14.5px**, and a
   different colour again in cozy-light. Those same span blankets. **A KNOWN balance now emits NO
   ELEMENT AT ALL**, which makes "the sweep is invisible when the balance is known" structural
   instead of hoped for. **Never introduce a wrapper inside a numeral in this codebase.** Guarded.

**The B353-3 control was a countdown, not a control.** It set `G.gold = null` and required a throw —
its entire premise being that the gold sites are UNGUARDED. The moment this sweep guarded them the
control stopped throwing and **B353-3 went red while the thing it guards got strictly better.** It
now poisons `Number.prototype.toLocaleString` instead: independent of the registry and of how any one
site is written, and it additionally proves the renders still format a number at all. **A control
that fails when the code is fixed is not a control.**

**`B353-3b` is the new guard and it is the one that actually proves the flip.** B353-3 sweeps the
fields already on the registry — today only `offlineBudget`, which nothing formats — so it passes
without ever touching the failure it was written about. B353-3b sweeps the **candidates**: deletes
`gold`+`gems` from the live G, runs five real render paths, and asserts (1) nothing throws, (2)
nothing lies — no `NaN`/`undefined`/`null` and specifically **not the string `0`**, and (3) it says
something — the glyph, the class, the accessible label — plus that the state **clears** again.
**Proved RED four ways**, each by re-introducing the real bug: the original `G.gold.toLocaleString()`
(named the site), `fmtBalance` answering `'0'`, `canAfford` treating UNKNOWN as yes, and the
`bal-known` wrapper.

**Verified in-browser** (Playwright + `__HR_TEST_HARNESS__`, static server on :8231) at **1440×900
and 922×423**, in **hearthlight AND cozy-light**, with both fields deleted from a live `G`:
seven render paths, **0 throws, 0 page errors**, all four pending sites at `--ink-3` and at their
host's own size, **10/10 shop Buy controls disabled**, 0 `NaN`/`undefined`/`0` in any balance slot,
and the topbar back to `500` with the class and the aria-label removed. Smoke **732→734/734, 0
runtime errors, three consecutive runs**; `bump-version.sh --check` OK; **no version bump**.

**Known limitations — be honest.**
- **No screenshots again.** The Browser pane in this session never composited
  (`the Browser pane is not displayed`), same as b327. Everything above is `getComputedStyle` /
  `getBoundingClientRect` measurement and matched-rule inspection, not a picture.
- **I did not arm the registry.** `gold`/`gems` stay commented in `SERVER_OF_RECORD`. That is item
  (5) of the operational list and wants Security's look at the 33 deferred sites; the client is now
  ready for it and `record.js` says so.
- **Ten raw reads remain and every one is accounted for**: five are the fallback arm of a
  `typeof window.balOr === 'function' ? … : raw` ternary in the files that load BEFORE legacy.js
  publishes the bridge (`observability.js`, `profile-launchpad.js`, `bug-report.js`, `renown.js`);
  two are documented exemptions (`__FRESH_START` reads the fresh-G **literal**, not a player balance;
  `snapshotG` must restore G *exactly*, including absent); one is `accrue.js`'s
  `describeReplacement`, which sits UNDER record.js in the dependency chain and compares against a
  save rather than displaying; two are `events.js`'s `snapshot()`, which record.js explicitly states
  is UNCHANGED.
- **Pre-existing emoji in copy I edited was kept verbatim** — `'Need more 💎. Open the Store.'` and
  `'Not enough gems. Tap "Get Gems".'` in `legacy.js`. Changing them was out of scope for a
  correctness sweep, but they are live 0-emoji-rule violations in player-facing copy.
- The topbar numeral slot still narrows ~8px when the figure becomes a dash. `min-inline-size:1.6ch`
  stops a collapse; it cannot reserve the width of a number nobody has been told.

### 2026-08-11 · b327 — the bag on a 423px-tall screen (paione bug #24, LIVE)

**The report, and it was literally true.** "inventory screen is like overlapping, can't see my
inventory... the words are too big and only have like a 5mm viewing window." Android landscape,
**922x423**. Reproduced at exactly that viewport before touching anything: `.invc-bag-col` **h=20px**
— one clipped row of tiles — with the HERO stat card at 298..411 over a bag whose visible box was
283..303. A real rectangle intersection, not a perceived one.

**922 > 900, so this device is CORRECTLY in the scaled-desktop rail layout (b310).** The premise the
brief handed me was right and worth restating: the layout choice is not the bug; the bug is that the
rail layout **had never been given a short-viewport treatment**. Four independent things ate the 423px:

1. **A phantom bottom-nav reserve, 68px — 16% of the screen.** `theme-cozy.css`'s mobile block sets
   `padding-bottom: calc(60px + safe-b + 8px) !important` on `.main, #app .main, .panel.active`.
   **b317 reclaimed it on `.panel.active` and `#panel-combat.active` and missed `.main`** — so the
   panel could never be taller than 287px of the 423, no matter what I did inside it. My own previous
   pass left this; finding your own miss is the cheapest 68px in the game.
2. **Four full-width chrome bands before the first item** — sub-tabs 47 + slots/actions 54 + search 40
   + category chips 36 + gaps = ~211 of the 287 that remained.
3. **The Bag/Equip/Saved buttons stacked an icon ABOVE the label — and the icon line was EMPTY.** The
   strip shipped literal 🎒/🛡️/⭐, and `icon-set.js`'s `stripChromeEmoji` sweep (which lists `.imt-btn`)
   had been deleting them at runtime for months. So 47px of height bought one word in a 14.5px face.
   The 0-emoji rule was being *enforced* by a sweep that left a hole where the icon should be.
4. **The overlap is a MISSED SELECTOR, not a stacking bug.** b111's `[data-mobile-sub="bag"]` rule
   hides `.invc-equip-col`. `.invc-stats-col` (Hero / Weapon Styles / Bonuses) was added to the
   renderer **later** and was never added to that rule — so in BAG mode the right-hand region still
   laid itself out, as the second row of a one-column grid whose single row track was already
   overfull, and painted across the bag. **Fix hides the REGION (`.invc-right`), not one of its
   children**, so the next column added there cannot repeat this. That is the whole lesson.

**The two hours I lost, and the discovery that came out of it.** My panel-level grid "worked" but
`grid-column: 1 / -1` laid out at the width of column 1, and in equip/loadouts mode the 30px sub-tab
strip measured **106px**. Cause: `legacy.css`'s mobile `.panel.active` declares
`grid-template-columns: 1fr !important; grid-template-rows: auto !important`. One explicit track per
axis means (a) `-1` resolves to line 2, so "span everything" spans one column, and (b) everything you
place lands in **implicit** rows, which `align-content: stretch` then splits **evenly**. Neither errors;
`getComputedStyle` faithfully reports the implicit tracks, so the source looks correct and the pixels
are wrong. **Any track list you author on `.panel.active` inside a mobile media query must be
`!important`.** Filed in DISCOVERIES — this will bite the next screen.

**What shipped** (one documented block, `art-direction.css` §15b, keyed on `max-height`, so it reaches
any short screen regardless of width; geometry and tokens only, zero new colour):
`.main` reserve reclaimed (landscape-rail only — portrait's bottom nav is real); the panel becomes a
3-row grid so **the slot counter+actions and the search+Reset share one line**; the sub-tab icon moves
BESIDE its label (47 -> 30px) — **height bought by re-flowing the button, not by shrinking the words,
every label still on the 14.5 floor**; chrome type down from 16/17 to the floor and boxes to 34px
(34 not b285's 40: on a 423px screen the header is not where the thumb lives, and the tiles stay at
58-64px); category chips one non-wrapping 30px rank; and **the bag is the scroller with a 132px
min-height floor** — if chrome ever grows again the PANEL runs out of room first, which is a visible
bug instead of a silent 20px slit.

**Measured, 922x423:** bag **20 -> 222px**, **39 item tiles fully visible** (was ~9, all clipped
mid-icon), HERO 113px-and-drawn -> 0x0, panel 287 -> 347, no horizontal overflow, 0 clipped strings,
every visible string 15px.

**Two adjacent defects I found by walking the other two tabs, and fixed rather than filed.**
- **EQUIP had the same disease worse: ZERO gear slots visible.** b216's doll is a 4-wide grid of
  SQUARE cells, so across an 842px column each cell became 200px and four rows measured 544px inside
  a 256px scroller. On a short-but-WIDE screen the answer is to spend the axis you have: doll and stat
  sheet side by side, doll capped so its squares stay ~48px. **0 -> 14 of 14 gear slots above the
  fold, column scrollHeight == clientHeight.** (The doll also declares SIX row tracks for a layout
  that uses four — two empty 90px rows ship on every screen. Overridden here, handed to Systems.)
- **SAVED rendered an empty column.** b111 hides `.invc-equip-col` in loadouts mode and the loadout
  picker lives *inside* it. Show the column, drop the doll.

**A live bug found on the way.** `renderInvFancy()` does `panel.innerHTML = …` on every combat/skill
tick, which **deletes the Bag/Equip/Saved strip** — the screen's primary navigation — and the only
thing restoring it was a `setInterval(…, 1500)`. The b230 `market.js` finding, verbatim, in another
file. MutationObserver now restores it within one microtask (verified: `syncAfterRender:false,
afterMicrotask:true`); `window.HearthriseInvSubTabs = {install, paintIcons, subs}` is published so a
caller — or a test — can do it synchronously. The structural fix (own a container, don't rebuild the
panel) is Systems' and is in HANDOFFS.

**The guard, and the rig behind it — `b327`, worth reusing.** The suite runs at desktop size, so to
measure 922x423 I build a **922x423 iframe**, inline the four inventory stylesheets' `cssText` and the
REAL rendered panel markup, and `document.write` + `close()`. Media queries inside an iframe evaluate
against the iframe's viewport and inline `<style>` parses **synchronously**, so it is a true
device-geometry measurement with no `await` — which is what `tryRun` requires. It reproduced the live
numbers to the pixel (panel h287 broken / h347 fixed). Asserts: `.main` doesn't reserve a nav that
isn't there · BAG mode hides the whole `.invc-right` REGION · the HERO card shares **no pixel** with
the bag (rectangle intersection, not `top >= bottom` — "beside" is also a correct answer) · bag ≥140px
and >50% of the panel · the BAG is the scroller and the panel is not · strip ≤44px with ≥3 atlas
glyphs and no emoji. Guarded against vacuity with `sheetsSeen >= 4` + a CSS-length floor.
**Proved red three ways**, each by re-introducing the exact historical bug: media block neutralised
(bag 257 -> 26px), b111's `.invc-equip-col`-only rule restored (names itself: "found display:flex"),
`.main` reserve restored (68px). Smoke **577 -> 578/578, 0 runtime errors**; `bump-version.sh --check`
OK; **no version bump** — the Coordinator integrates.

**Verified in-browser** at 922x423 (the reported device), 852x339 (Tyler's iPhone landscape — bag
138px, 22 tiles, equip 12/14 slots, no overflow), 1280x800 desktop (**byte-identical to the pre-pass
baseline**: panel 91..800 h709, bag 542, tile 74, cat chip 36, doll 544, slot 75, hero 844..958, 0
clipped, 0 overflow) and 375x812 portrait (unchanged by design — the bottom nav is real there, so the
reserve stays; the only change that reaches it is the emoji -> glyph swap: 3 glyphs, 0 emoji).
Console: only Supabase 401s from the unauthenticated local session, no layout or JS errors.

**Known limitations — be honest.**
- **No screenshots.** The Browser pane in this session never composited (`screenshot failed: the
  Browser pane is not displayed`), at every viewport, before and after. Everything above is
  `getBoundingClientRect` / `getComputedStyle` measurement and a sorted visible-text ladder, not a
  picture. Someone with a working pane should eyeball it once.
- In **portrait** BAG mode the stats column still renders below the bag. It stacks (the panel scrolls
  there), so there is no overlap and no reported symptom — but it is the same missed selector, left
  alone deliberately because portrait is a gated form factor and I did not want the risk.
- At **852x339** the equip column still needs a ~50px scroll for the last gear row. 423px is fine.
- The cozy-light copy of the sub-tab strip's colours is still hardcoded in `theme-cozy.css`
  (pre-existing; I changed geometry there, not colour). cozy-light remains unreachable through the UI,
  so none of this is visually confirmed in that theme — all new rules are token-only and
  theme-agnostic under `body[data-theme]`.
- `.invc-topbar`'s copy now reads "133,682 items · 71,416,410 gp" — the slot count the bug report
  quoted ("53/100 SLOTS") is gone from this build. Not mine, not touched.

### 2026-08-11 · b326 — the away-honesty surfaces (the game finally says what it paid you)

**The brief.** b325's engine returns `{blessed:false, buffsPaused, crits, featuredMs, capped, rateMult, combat:{segments[]}}`; nobody had written the UI. The Designer ruled the surfaces are part of the ruling, not a follow-up — *the silent penalty was the actual sin*.

**The finding that reframed the job.** Clause 3 ("a paused buff renders as PAUSED with its time preserved") had **nowhere to render**. `#active-effects-card` — the only buff panel in the game — computes `display:none` on Home: `home-dashboard.js`'s own b213 reset hides every legacy `> .card` in `#panel-profile`. Measured in-browser: rect 0x0. `__renderBuffsSection` has been painting into an invisible container, and the entire visible statement about buffs was Home's **"Food buff active."** — no name, no magnitude, no clock. So the honest fix was not to style the paused row; it was to give buffs a surface. Home's **Upkeep** block now carries the ladder: name · magnitude · preserved time · `PAUSED` pill · one rule line. Filed in DISCOVERIES — the legacy card is still dead, and HOUSE buffs still have no surface at all (and still emit 9 literal emoji, invisible only by accident).

**Composition decision that mattered most.** The welcome-back card was in the RIGHT-HAND RAIL, fifth item, under "Your heroes". The rail is the second grid column — so on Tyler's 852×339 landscape phone the grid collapses to one column and the one thing a returning player opens the game to read sat three screens down, after Next up and Your holding. **A welcome-back summary below the fold is not a welcome-back summary.** It is now a full-width band leading the whole grid, above both columns, time-boxed to 30 minutes off `summary.at` so it greets and then vanishes. Above 1000px it adopts `.hd-grid`'s own `1.55fr 1fr` so its notes column lands on exactly the same vertical as the rail below — flex basis alone cannot promise that alignment, and a lead band 110px off the columns it leads reads as a bug.

**Copy, and the two things the payload could not tell me.**
1. `hrs` is `toFixed(1)` — 6-minute granularity — so the Designer's "8h 12m away" was not printable from it. Added **`awayMs`** to the summary.
2. `featuredMs` says the boss applied; it does **not** say whether it was the daily (×1.5) or the weekly (×2.0). A renderer defaulting to "daily" halves a weekly night in copy — the same sin pointed the other way. Added **`featuredDropMult`** to `simulateSpan`'s payload (3 lines, additive, next to `featuredMs`) and flagged it to Systems. **The band prints a percentage ONLY if the payload carries one**; a pre-b326 summary reports the boss and quotes no number.

**Three tones, three roles** (`.hd-away-note`): the RULE is quiet ink-3, what it PAID is gilt, what it HELD BACK is muted ink — **never `--red`**. A paused buff is not a penalty; the ruling's whole point is that its time was preserved, and the preserved number beside it IS the reassurance.

**Why the paused state is permanent, not a welcome-back banner.** `tickBuffs` freezes on two conditions — `away`, and `active === false`. Both are the same rule to the player. A clock that ticks in front of you while the engine is not draining it teaches the rule by surprise, which is the failure being fixed. So the row states its own clock state, always, through one published oracle (`window.buffsFrozen()`) that Home and the buff panel both ask.

**Token work.** `--green-line` added to all four theme blocks (the moss hairline was inlined per component). Converted **7 baked cozy greens** — `rgba(127,154,79,.08/.02/.2/.3)` and `#7f9a4f` ×3 — across `legacy.css`, `audit-overrides.css` (`.buff-row` had TWO competing copies) and the activity bar's `.ab-hp`. Converted 2 dial-unreachable bare `font-size:15px` in home-dashboard. Every new colour is a token; no new `!important` war (the buff-ladder rules sit after the generic `.hd-mini` blanket at equal specificity and win on source order).

**The away preview (item 5).** `actionRate(skillId, action, {away:true})` — the SAME calculator, evaluated inside `withOfflineReplay`, because a second "offline rate" function is exactly the duplicated-loop mistake the ruling was written to end. Surfaced where the decision is made: the activity bar prints a muted `5,062 away` beside the gilt live rate **only when they differ** (i.e. only when a blessing/buff is inflating what you see). Memoised on the live rate — sound, not merely cheap: the away stack is a strict subset, so nothing moves away without moving live.

**Perf (the Engineer's flag, and it was worse than 10%).** `renderProfile` and the quest strip now early-return inside the latch and are repainted once when it opens. The real cost was the buff-queue's `renderProfile` wrapper, which scheduled a **30ms `setTimeout` per call** — thousands of timers queued before the first paint of a return.

**Guards `b326-1`…`b326-6`, every one proved red by re-introducing its bug.** Each asserts BOTH directions — the clause appears when the payload carries it and is **absent** when it does not (no crits line with 0 kills, no boss line at `featuredMs:0`, no paused line at `buffsPaused:false`, no percentage without `featuredDropMult`, and the band disappears once the news is an hour old). Smoke **571 → 577/577, 0 runtime errors.** No version bump.

**One test flake I caught and fixed rather than shipped:** b326-5 first used a `gather_speed` buff to prove live ≠ away. Speed passes through `SPEED_FUSE` (0.70), so on a save whose perks and tools saturate the fuse the buff changes nothing and the test is flaky rather than wrong. It uses `all_xp` now — an uncapped additive term — so the divergence is arithmetic, not circumstantial. (Measured in-browser: `getBuffBonuses().allXP = 0.6` but `getBonus('allXP') = 0.15` — the power budget clamps it. Worth knowing before anyone writes another buff-magnitude assertion.)

**Verified in-browser** at 1440×900 and **852×339** (Tyler's real box): band leads and fits in ~110px including its heading, all three notes on one line each at 852; paused ladder legible; both boss cards carry the away line on one line (it sits OUTSIDE `.botd-main` — inside that 145px text column the sentence wrapped three ways); activity bar shows `6,617 xp/hr · 5,062 away` with no overflow at either size. 0 console errors from these screens, 0 emoji in any buff surface.

**Known limitations / handoffs.**
- The legacy Active Effects card is dead code with ~30 selectors styling it, and HOUSE buffs are invisible + emoji-bearing. Systems/Asset Director (DISCOVERIES).
- `global-quests-strip` still renders 🎯 / 🎁 as chrome; `settings-modal`'s ⚙️ from b316 is still there. Pre-existing.
- I could not verify cozy-light deeply — it is unreachable through the UI. All new rules are token-only and theme-agnostic, so it should follow, but it is unproven.
- `featuredDropMult` must also be computed by the accrual Edge Function or the server-side line silently loses its percentage.

### 2026-08-10 · b317 — full-bleed safe-area fill (REAL fix) + reclaim the wasted landscape width/bottom (Tyler's iPhone PWA data)

**Device data (Tyler bug report, build b316).** Installed PWA, display-mode:standalone, iOS 18.7, landscape. Viewport 852×339. safe-area insets top 0 / **right 59 / bottom 20 / left 59**. The black "frame" IS the safe area (Dynamic Island reserved both sides in landscape + home indicator).

**Why b315 failed — corrected the brief's theory.** The brief said `html{background:var(--bg-0)}` resolved `--bg-0` to the base `:root` fallback `#100e0b`. NOT what happens here: I read computed style in-browser — `--bg-0` resolves to **`#0a0806`** in BOTH html and body scope (art-direction.css:1841 overrides both `:root` and `body[hearthlight]` to #0a0806), and `html` background WAS already `rgb(10,8,6)` = correctly themed. So b315's token WAS right; it failed because **the ROOT element's painted background does not reliably cover the inset region under standalone viewport-fit=cover.** The real fix is geometry, not token scope: a `position:fixed; inset:0` layer is sized to the whole screen INCLUDING the insets.

**PART A — full-bleed layer.** `body::before{position:fixed;inset:0;background:var(--bg-0);z-index:-1;pointer-events:none}` in legacy.css (~line 89, superseding the b315 comment; kept `html{background}` belt-and-suspenders). Uses `body::before` (not html) so `--bg-0` resolves in body scope. **Key craft point verified in-browser:** `<body>` is not a stacking context, so a negative-z ::before paints in the ROOT stacking context BEFORE body's own radial-gradient background (CSS painting order) — the layer bleeds into the insets while the gradient still covers the content area on top. Confirmed the warm top-right gradient survives; desktop pixel-identical.

**PART B — reclaim the wasted width (Tyler: "use the full screen like Idle Clans").** b315 stacked a FULL safe-area on BOTH sides: `.app` padding-left `rail-w+safe-l` AND padding-right `safe-r`, PLUS the panel's own 12px → ~71px dead right margin, a ~658px column on 852. The Dynamic Island is a SINGLE zone and the left NAV RAIL already absorbs it (rail width includes safe-l, internally padded), so the right edge needs only corner clearance. Fix (theme-cozy.css landscape rail block ~836): `.app,#app` padding-right → **0** (panel BACKGROUNDS now bleed to the true right screen edge, full-bleed layer behind); `.panel.active` right pad → `max(12px, calc(var(--safe-r) - 36px))` = 23px at 59px inset. Measured with simulated insets: content width 658→**694px**, panel right edge at 852 (bleeds to edge).

**PART C — reclaim the bottom dead reserve (Tyler read it as a bottom black bar).** In the rail layout there's no bottom nav, but `#panel-combat.active` (combat-hud.css:203, id-specificity 1,1,0) still reserved `72px+safe-b` to clear a nav that only exists in PORTRAIT. `body[data-theme] .panel.active` (0,2,1) couldn't beat it. Added `body[data-theme] #panel-combat.active{padding-bottom:max(10px,var(--safe-b))}` (1,2,1) in the landscape block. Measured: `#panel-combat.active` bottom 92→**20px** (home-indicator inset only); `.panel.active` bottom already `max(10px,safe-b)`. Portrait keeps 72px (combat-hud's media has no `landscape` keyword → untouched).

**Verified.** In-browser at 852×339 (emulated Chromium reports safe-*=0, so I injected `:root{--safe-l/r:59px;--safe-b:20px}` to simulate). Full-bleed layer computed: `position:fixed`, top/left/right/bottom 0, `z-index:-1`, bg `rgb(10,8,6)` (themed token, body scope, NOT #100e0b), pointer-events none. `.app` pl123/pr0/full-width 852. `.panel.active` pl12/pr23/pb20. `#panel-combat.active` pb20. No horizontal overflow (scrollWidth==clientWidth==852). Desktop reload: pixel-identical hero band + gradient + rail. Removed all sim injections. **CANNOT reproduce real iOS insets in-browser** — proved the mechanism (fixed layer, behind content, token, reduced padding) by computed-style measurement, not by faking an inset.

**Guard.** Replaced the b315 tryRun with **b317** (same CSS-reading family): asserts (1) the fixed full-bleed `body::before` exists with token bg (not hardcoded, not transparent), (2) html keeps its token bg, (3) hero still ≤72px, (4) landscape `.app` does NOT re-add full `safe-r`, (5) `.panel.active` right pad CAPS the inset via `calc(var(--safe-r) - Npx)`, (6) `.panel.active` + `#panel-combat.active` don't keep a bottom-nav-height (56/60/62/68/72/76px) reserve. Read rule `cssText` for the `padding:` shorthand because jsdom's CSSOM doesn't expand a `padding:` shorthand containing `max()`/`calc()` into `paddingRight`. Proved red 3 ways (removed the layer → "must exist"; combat 72px reserve → "must NOT keep bottom-nav-height"; shorthand parse). Smoke **534→535/535, 0 runtime errors**. No version bump — Coordinator integrates.

**Files.** `src/styles/legacy.css` (full-bleed `body::before`), `src/styles/theme-cozy.css` (landscape `.app` padding-right 0, `.panel.active` reduced right pad, `#panel-combat.active` bottom reclaim), `src/features/smoke-test.js` (b315→b317 guard). Untouched: home-dashboard.js (b315 hero strip), portrait blocks, cozy-light, combat-hud.css (its 72px reserve is correct for portrait).

**Needs Tyler's on-device confirmation (be honest):** that the black bars are gone in the installed PWA landscape, that content now uses the full width without anything critical hidden under the Dynamic Island, and that the foot reaches the home-indicator line. Emulator can't render real insets; I proved the CSS mechanism, not the device result.

### 2026-08-10 · b316 — Settings reachable from the nav rail (landscape phone was locked out)

**Bug (Tyler).** On a landscape phone Settings was UNREACHABLE. Two doors only: the topbar gear `#btn-settings` (clips off the right edge on a narrow landscape screen) and `#btn-settings-mobile` inside `#more-modal`. No direct rail entry.

**The premise correction that mattered.** The brief said add it to `#sidebar`. But the landscape phone rail is NOT `#sidebar` — at 932×430 `.sidebar` is `display:none` and the visible left rail is `#bottom-nav` rotated vertical (b114/b310/b312, in `theme-cozy.css:739` `@media (max-height:540px) and (orientation:landscape) and (max-width:1024px)`). Verified in-browser: `#sidebar` computed `display:none`, `#bottom-nav` rect x0/w64/h430. So a `#sidebar`-only entry would be invisible on the exact device that was locked out. **Both nav hosts need their own Settings door.**

**Shipped.** A footer utility button in each rail, opening the settings modal directly. `#btn-settings-rail` (class `nav-btn nav-util`) in `#sidebar`; `#btn-settings-rail-m` (class `bn-btn nav-util`) in `#bottom-nav`. NEITHER carries `data-tab` — Settings is a modal, and `showTab` has no `#panel-settings`, so a data-tab would blank the active panel. Bound in `bindEvents` to `(window.openSettings||openSettings)()` (the settings-page.js rebuild). icon-set paints the gilt `uiSettings` glyph into each `.ic`; label is sr-only in the icon-only landscape rail. Tokened CSS only (`var(--line)`, `var(--ink-3)`) — a hairline sets it apart as chrome, adapts per theme, no cozy-light leak.

**A latent blank-screen bug fixed on the way.** The generic nav binding was `.nav-btn,.bn-btn → showTab(dataset.tab)`. Any rail control without a data-tab (my utility button, or any future one) would hit `showTab(undefined)` → clears every `.panel.active` and returns → blank screen behind the modal. Narrowed the selector to `.nav-btn[data-tab],.bn-btn[data-tab]`. Verified: clicking the desktop sidebar Settings opens the modal AND leaves `panel-profile` active.

**Reachability.** The rail scrolls (b312). Settings sits at the foot beside the connection indicator; on a short screen it is scrolled-to. Verified at 932×430: button rect 56×52 at the rail foot, glyph rendered, `#bottom-nav` scrollHeight 781 > 430 (scrollable), real click opened the full Settings modal. Desktop 1280×800: sidebar Settings at the rail foot with the hairline separator, real `.click()` opens the modal, panel not blanked.

**Guard.** `b316` (next to the b230 nav-shape family in `smoke-test.js`): loops both hosts — control present, a rail entry (`nav-btn`/`bn-btn`), not `display:none` in the visible layout, labelled, no emoji, atlas glyph present, NO `data-tab`, and clicking opens `#settings-modal`. Proved red by deleting the sidebar button → "no reachable Settings control". Smoke **533→534/534 green, 0 runtime errors**. No version bump — Coordinator integrates.

**Files.** `index.html` (both rail buttons), `src/legacy.js` (data-tab-guarded nav binding + both click bindings), `src/features/icon-set.js` (glyph paint for both), `src/styles/legacy.css` (`.nav-util` footer style), `src/features/smoke-test.js` (b316 guard). Untouched: settings-page.js (the modal it opens), the topbar gear (kept), the More-sheet button (kept), cozy-light rules.

**Known limitations.** The settings-modal TITLE still renders a `⚙️` emoji (`#settings-modal` header) — pre-existing 0-emoji-rule violation in chrome, not something I added; noted for Systems/Asset Director. On an 800px-tall desktop the rail overflows so Settings is a short scroll from the foot (consistent with the b225 scrollable-rail design), not pinned-visible.

### 2026-08-10 · b315 — compact hero strip + safe-area edge fill (short landscape phone)

**Ask (Tyler, follow-up to b314).** The Home hero band ("WANDERER'S CAMP" backdrop + big avatar + "TYLER" + rank/status) was desktop-sized on a ~430px-tall landscape phone, eating a third of the screen and pushing "Next up" off the bottom. Plus black bars behind the notch/home-indicator safe-area insets (a letterbox frame), and a suspicious RIGHT bar.

**Root cause of the height.** `.hd-hearth` is `height:clamp(104px,24vh,204px)` with a 22px bottom skirt — at 430px tall that's 104+22 = 126px, and the topbar sits above it, so ~192px (45%) was gone before any content. The existing `@media(max-width:640px),(max-height:520px)` block only shrank the avatar to 52px and the name to 23px; the band itself stayed at the 104px floor.

**Fix (landscape-scoped, `@media (max-height:540px) and (orientation:landscape) and (max-width:1024px)`, added INSIDE `home-dashboard.js`'s `css()` next to the other responsive rules).** The `.hd-*` rules are injected with a two-ID prefix (`#panel-profile #hd-root`), so a `body[data-theme]` selector (0,2,1) CANNOT beat them — b314's trick doesn't apply here. Co-located the override under the same prefix + later source order instead, which wins cleanly. Band → `height:56px`, skirt 22→10px, avatar 40px, name 19px, ledger numerals 22→19px, `.hd-eyebrow` (homestead name) `display:none` — the one line dropped, least load-bearing, name carries identity. Every readable string stays ≥14.5px (sub measured 14.5px, name is a 19px display face). Measured band footprint 126→66px; "Next up" h3 moved from off-screen up to top≈261px on a 430 screen, and the Attack quest + Train CTA are fully visible.

**Safe-area black bars — root cause + fix.** `<html>` had NO background (`backgroundColor: rgba(0,0,0,0)`), and with `viewport-fit=cover` iOS paints the region behind the insets with the ROOT element's background → flat black letterbox. Gave `html` a token background `var(--bg-0)` (dark stone; the body radial gradient still covers the whole content area on top, so this only ever shows inside the insets — zero desktop/content change, verified html computes to a dark stone value, body unchanged). The RIGHT bar was NOT a stray max-width/margin — I measured the app/panels reaching R=932 (full width) in the emulator; it's a genuine `safe-area-inset-right` (landscape reserves both sides). Added `padding-right: var(--safe-r)` to `.app,#app` in the landscape block so tappable UI clears the inset while the themed edge bleeds behind it. `--safe-r` is 0 off notched hardware → no-op on desktop/Android.

**Guard.** `b315` (CSS-reading family, next to b314): asserts a landscape rule caps `.hd-hearth ≤72px`, that `<html>` carries a TOKEN background (not hardcoded, not black), and that the landscape app grid reserves `var(--safe-r)`. Proved red by bumping the band to 96px → "found height=96px". Smoke 532→**533/533 green, 0 runtime errors**.

**Verified in-browser** at 932×430 and 844×390 (compact strip, no horizontal scroll, Next up + Train visible, html edge = dark stone) and desktop 1143×909 (hearth 204px, avatar 74px, eyebrow visible, name 31px — UNCHANGED). Emulated Chromium reports `--safe-*`=0 so the inset strips can't be seen here; the html-background + safe-r fixes are verified by reading computed values, not by faking an iOS inset.

**Files.** `src/features/home-dashboard.js` (compact landscape hero block), `src/styles/legacy.css` (`html{background:var(--bg-0)}` edge fill), `src/styles/theme-cozy.css` (`.app,#app` padding-right safe-r in the landscape block), `src/features/smoke-test.js` (b315 guard). Untouched: backdrop.js (scene just crops), the b314 rail/FAB rules, portrait blocks, cozy-light.

**Known limitations / handoffs.**
- In the landscape RAIL layout the panels still inherit the b108/b109 `padding-bottom: calc(60px + safe-b + 8px)` (there's no bottom nav to clear), reserving ~60px of dead space at the foot. b314 boosted `.panel.active` to reclaim it — worth confirming that boost still wins after this pass; if the foot still feels short, that's the next lever. Left it to avoid scope-creep into b314's rule.
- The compact strip's ledger (XP/Kills/Harvest) is kept in-band; on the very narrowest landscape phones it could be dropped in favour of the name if width ever gets tight (it doesn't at 844–932).

### 2026-08-08 · b230 — Shops: one door, three toggles (branch `agent-shopsia`)

**The ask (Tyler).** "Market tabs need some organization. Right now it's hard to find the in-game shop." · "Inventory should be under Character and 'shops' should be under Realm." · three toggles behind Shops: Local Shop / Market / Premium Shop. · "Just remove the Economy tab for now."

**Root cause, and it is not a taste problem.** `theme-cozy.css:264` was `\.nav-btn[data-tab="shop"]{display:none!important}`. The in-game shop's only static door was switched off, and the only visible commerce entry in the rail was the **Market button `market.js` injected at runtime** (with a 📈 in it). So the ECONOMY group rendered as "Inventory + Market" and the shop Tyler was looking for genuinely had no entry. This is the b220 dungeons failure verbatim — *inject a nav entry and then hide it in CSS* — a third time. Both hide rules are deleted and a smoke guard now fails if anything hides Shops.

**A second dead route found while grepping.** The item flyout's "Buy from Seed Shop" and "Buy from Equipment Shop" call `showTab('store')`. There has never been a `#panel-store`; `showTab` bails on the missing element. **Those two buttons have done nothing at all, silently, for as long as they have shipped.** `store` is now in the alias table and in the route guard.

**The shape.** Home / Character / **Inventory** (unlabelled head block = "you"), Adventure, Homestead, Realm = Clan · **Shops** · Social. I did *not* wrap the head block in a "Character" group label: a group and an entry with the same name one row apart is a smell, and the unlabelled head block already reads as the player. Shops sits **between** Clan and Social, not at the foot of the group — Clan has to stay adjacent to House across the divider (b225's twin pillars), and burying the entry Tyler could not find at the very bottom of the rail repeats the original mistake.

**Two hosts, one destination — and why that was the right call.** `#panel-shop` keeps Local Shop + Premium Shop; `#panel-market` keeps the Market. Renaming the host to `#panel-shops` would have re-opened **every** `#panel-shop …` rule in board-and-shop.css (the entire b221 shopfront), art-direction.css and both themes' readability blankets — ~60 selectors, for a change the player cannot see. `data-shops-pane` on the section picks the local side; the strip is **duplicated as static markup into both hosts**, so nothing can re-render it away. Routing lives in the base `showTab`, not a wrapper, so it cannot be bypassed and the alias table has one home. Default = Local Shop, session-scoped in `window._shopsPane` (the `_tdPane` convention) — it survives re-render and round trips, but a fresh load always opens the front door, because "hard to find" is the actual complaint.

**The self-deleting Premium Store button, fixed structurally rather than patched.** `nav-consolidation.js` appended `#hr-store-link` to `#panel-market`; `market.js` then did `panel.innerHTML = …` on **every** re-render — every search keystroke, sort change, listing and cancellation — so the only route to the premium store destroyed itself and reappeared only because `bootAll` ran on a 500 ms interval. **A navigation control re-injected twelve times a second is not navigation.** `render()` now owns `#market-root` and never touches the panel; `injectMarketStoreLink` + `injectShopBackLink` + `injectNav` + market's `showTab` wrapper are all deleted, along with their dead CSS in three sheets. `showTab` calls the already-published `window.renderMarket` seam, so there is one render path for every alias.

**Colour role.** The Premium segment is sapphire in every state — glyph and label, selected or not (art-direction §6). It is carved out of the hearthlight + Cozy Day readability blankets in theme-cozy.css using b222's documented add-a-root string (28 sites), so it needed **zero new `!important`** in board-and-shop.css — that file's stated exit condition holds.

**Two defects the widening caused, both found by measuring, both fixed.** The Premium pane went from a ~330px sidecar to the full panel and `.card-head` is `space-between`, so "Premium Store" and "Real-money packs" ended up 1,100px apart — the b225 lesson exactly. And the strip sat **6px lower and 6px right on the Market** than on the other two panes, because `#panel-market.active` carried `padding:16px` while every other panel uses `var(--gap)`: a segmented control that moves under the cursor as you click through it reads as a bug. Market joins the rest.

**Three existing tests were wrong and are now right, not weakened.**
1. **The b213 stored-XSS guard has never actually run.** It rendered through market.js's `setTimeout(render, 0)` wrapper and asserted against an empty panel. Synchronous rendering exposed that *and* that its assertion was a false positive: `escapeAttr` makes the payload TEXT, and innerHTML re-serialisation escapes `< > &` but **not quotes**, so `onerror="…"` reappears inside a perfectly safe text node. Asserting on serialised source cannot tell live markup from escaped text — it asks the DOM now, and asserts the row rendered so it can never pass vacuously again.
2. `clicks: every sidebar nav item activates its panel` assumed `panel-<data-tab>`. The invariant is "every entry leads somewhere live" — it asserts a panel activated, and that it is the named one when a named one exists.
3. The b221 shop test's "something is covering the buy control" only ever passed because the shop list started low enough that the offending rows fell **off-screen**. With the Local Shop at the top of its panel the FTUE tour card and the chat dock/toast stack land on it. Deliberate global overlays are not shop chrome — they are veiled for the measurement and restored after. (The chat-dock overlap is the audit's filed #8 and is global to every scrolling panel.)

**Guards (345 → 350), each proved to fail by re-introducing its bug in source and watching the suite go red:** the nav shape (Economy gone, Inventory directly under Character, Shops under Realm, visible, static, atlas glyph, no emoji, no stray `shop`/`market` entries); every alias (16 routes) resolving to the right host **with the right toggle preselected** and the rail entry lit; three toggles in both hosts, switching and persisting across re-render + a trip away; the Premium segment's sapphire in both selected states and not flattened to `--ink` by a blanket; and the market renderer owning a container so four hard re-renders cannot eat the strip.

**Mobile.** Inventory was **never** a bottom-nav slot — the 6 slots are Home/Character/Combat/Skills/Farm/More and Inventory has always been the More sheet's "Items". Nothing had to be displaced. The More sheet's "💎 Store" (which routed to the premium packs) becomes **Shops**, which also gives mobile a route to the in-game shop and the player market **for the first time** — the injected Market button lived in the desktop sidebar, which is `display:none` on a phone. It is no longer `btn-gem`: this door leads to gold spending first, and sapphire means real money.

**Verified.** Static server :8175, Playwright + the `__HR_TEST_HARNESS__` seam. All three toggles at 1440×900, 900×760 and 880×420 landscape, **hearthlight and Cozy Day** (forced), plus the sidebar at full width and in the 1100px icon rail. Every route walked. 0 console errors. Smoke **350/350, 0 runtime errors**; `bump-version.sh --check` OK, no bump.

**Known limitations / handoffs.**
- The Local Shop still leaves ~150px empty below the counter at desktop height. Content depth, not layout (b221 said the same of the bounty board); inventing filler would be worse.
- `market.js` still renders `📥`/`📦` emoji inside its own rows and a `📦` item fallback. Out of a hosting pass's region — **Systems/Asset Director**, and it wants the same atlas treatment `.si` got in b221.
- Cozy Day's active nav is still the oxblood gradient Forge & Stone was created to kill (pre-existing, that theme only, already in the audit).
- Two of the three panes share `#panel-shop` on purpose. If anyone ever splits them, the ~10 `#panel-shop … #iap-panel` selectors in board-and-shop.css and the `:has(> #iap-panel)` head rule move with the premium card — they are the whole sapphire treatment.

### 2026-08-08 · b227 — the floor again (14.5), and the dial that ends the argument (branch `agent-typescale`)

**Tyler said "too small" a THIRD time. The measurement is the whole entry.** b218 multiplied (×1.13). b225 set a floor (13.5). I swept every visible text element across 19 surfaces again and got the answer both passes had missed:

| | at 13.5px exactly | total visible text | |
|---|---|---|---|
| after b225, 1440×900 | **1,093** | 2,112 | **51.8 %** |

**Half the game was standing ON the floor.** That is the failure mode nobody names: a floor stops being a safety net the moment the majority of your type is resting on it — at that point *the floor value is the reading experience*, and 13.5px is the size you pick when you are asking "what is the minimum I can defend", not "what is comfortable at arm's length from a monitor". b225's own log said *never answer "too small" with a multiplier; answer it with a floor.* The correction it needed: **and never set that floor to the minimum acceptable value, because most of the game will end up sitting exactly on it.**

**What moved.** Floor 13.5 → **14.5**; every step +1 so the separations are byte-identical (`--t-small` 15→16, `--t-body` 16→17, `--t-lead` 17.5→18.5, `--t-h3` 15.5→16.5, `--t-h2` 21.5→22.5, `--t-h1` 30→31, `--t-num` 26→27). Result: **51.8 % → 2.7 %** below the floor, and every one of the remaining 58 elements is in a file another agent was holding this wave (handed off, table in `HANDOFFS.md`).

**The real fix is the dial, not the number.** The click-through audit found Settings › Display › UI scale writing `G.settings.scale` with **no consumer anywhere** — at 150 % it left `documentElement` zoom at 1 and font-size at 16px. It is the control a player reaches for *before* filing "text is too small", so it was actively teaching players that the game could not be made readable. It now works: 90–130 %, 5 % steps, live preview while dragging, persisted to `G.settings.uiScale` (rides the per-account save) **and** to the platform storage seam (so the first painted frame is already at the player's size instead of flashing 100 %). Verified end to end: drag to 125 % → body type 17 → **21.25px live**, readout tracks, survives close/reopen **and a full page reload**.

**How it reaches px-authored CSS — the decision.** `documentElement.style.fontSize` moves nothing here (the codebase is px-authored, not rem-authored). CSS `zoom` scales everything but does **not** change computed font-size, so no test could ever assert on it. So: one `--ui-scale` custom property, and **877 font-size declarations mechanically rewritten** into `calc(<n>px * var(--ui-scale, 1))` across five sheets and 25 JS modules. **95.6 % of rendered text obeys the dial** (1,616 / 1,690); the missing 4.4 % is exactly the five handed-off files and nothing else. `git diff -U0 | grep -v font-size` is comments plus four shorthand expansions — not one line of logic.

**Three traps, all found by measurement, all worth remembering.**
1. **A variable declared in a shared `:root, body[...]` block cannot be driven from `<html>`.** My first cut put `--ui-scale: 1` in the existing token block. The copy on `<body>` re-declared it one level below the inline value and swallowed it whole — the dial moved **0 of 1,694** elements while looking completely correct in the source. It now lives in its own `:root { --ui-scale: 1 }` rule. **Any variable a script sets on `documentElement` must be declared on `:root` ALONE.**
2. **`transition: all .15s` makes a computed font-size read lie.** Four elements measured as "the dial can't reach them" until the probe waited 450 ms. A probe that changes a token and reads immediately is reading the pre-transition value.
3. **The `font:` shorthand is a permanent straggler factory.** Its `<font-size>` slot cannot carry a calc, and it silently resets every `font-*` longhand around it. b225 needed a second regex to find 7; b227 found 4 more — including `.hr-gate-go`, the **account wall's primary button** — and expanded them all to longhands, so the class of bug is gone rather than re-found next pass.

**Layout fallout — one real regression, found and fixed.** At 900×760 the raised type pushed the **fifth monster in the combat picker 39px BELOW its clipped edge** (last row bottom 779 against a picker bottom of 740, where it had been 68px *inside*). A monster you cannot click is not a cosmetic overflow. The card still clips — it is a framed card with a header — and its `.card-body` scrolls instead; `min-height:0` is what makes that scroller real. Same answer b225 gave the sidebar.
Everything else is identical to the pre-pass baseline, verified by measuring **main at the same viewports**: 1440×900 **0 clips**, 900×760 `combat-arena dx15` (baseline), 880×420 `cr-name` +1px and `#panel-combat dy313` (pre-existing, documented), cozy-light the same 5 `.td-slot` clips ±2px. `span.bb-cut dy7` recurs in runs before *and* after — it is a 44px circular **image** crop, deliberate, not type.

**The ceiling is measured, not chosen.** 130 % is the largest value at which **zero text is cut anywhere in the game**. Getting there took two fixes: the doll tabs ("Equipment"/"Companion", ellipsised by ~15px) now let the strip wrap and refuse to shrink under their own words; and `--nav-w` scales with the dial, because the rail holds nothing but text and without it 130 % pushed the wordmark flush against the left edge and wrapped "Bounty Board" onto two lines — the dial was making type bigger without giving it anywhere to go. At 100 % both compute to exactly what they always were. The 64px icon rail deliberately does **not** scale: it shows no labels, so its width is an icon measurement.

**Guards 19a–19e (331 → 333), every one proved by poisoning the tree and watching it go red.**
19a ramp + ordering · 19b no declared sub-floor size — **now parses the calc form too**, since `calc(9px * var(--ui-scale))` would have sailed straight past the old `^([0-9.]+)px$` regex · 19c nothing *renders* below the floor · **19d every font-size in the five owned sheets is dial-reachable** (a bare px is a size no player setting can move — the exact shape of the bug the audit found) · **19e the dial moves a real computed size, clamps 400→130 and 10→90, snaps to the 5 % grid, and persists to both the seam and the save**.
19d guards itself with `sheetsSeen >= 4`: b225 shipped a vacuous 19b, and a sheet-scan test that stops matching its own hrefs passes on nothing. My first 19a poison also failed to fire, for trap #1 above — I poisoned `--t-micro` on `<html>` and body's copy overrode it. **Poison at the level the value actually resolves.**

**Known limitations / handoffs.**
- **58 rendered elements stay under the floor**, all in five files other agents hold this wave — **50 of them on Home**, the landing screen. Exact declaration lists in `HANDOFFS.md`; enumerated in `TYPE_PENDING_HANDOFF` in `smoke-test.js` so they are counted rather than ignored, and each entry must be deleted as its file lands.
- `index.html` ships **literal emoji as chrome** — `⚙️ Settings` (modal title + mobile button, lines 493/502) and `💬 Chat` (line 491), plus a `💬` in a chat notification (`chat.js:1019`). Live 0-emoji-rule violations in permanent chrome, seen on every screen. Not a type surface. **Systems + Asset Director.**
- `#panel-combat` still clips ~313px of content on a 420px-tall landscape phone (was 290 pre-pass). Pre-existing unreachable content, grown by the type raise but not caused by it. **Systems/mobile.**
- Portrait 420×820: topbar overflow 100 → 119px. Explicitly abandoned form factor.
- `HearthriseUIScale.apply()` paints without writing (it is the live-preview path), so a direct call can leave the Settings readout disagreeing with the paint. Reachable from code only, never from the UI.

### 2026-08-08 · b227 — the castle FOUNDATION, and the 2px that ate a T (branch `agent-clanscene`)

**Tyler, two things.** (1) *"The clan banner should look more like a castle layout rather than a farm layout… I'm thinking 'castle foundation'."* (2) A screenshot of the clan panel with "The Great Hall" / "TIER 1" clipped in the door strip.

**The clip, found by measurement, not by squinting.** My first probe said the panel was clean at 1440×900 and 900×760 — because it only tested `scrollHeight > clientHeight`, and **ink overflow does not contribute to scrollHeight**. Rebuilt it to compare a `Range`'s bounding rect against the *padding* box of every ancestor that hides overflow, and swept 9 widths × 5 tiers × 2 themes plus all 6 room modals. Exactly one class of finding, at **every desktop width in the shipped theme**: `.hr-cs-door-nm` "The Great Hall" and `.hr-cs-door-lv` "TIER n" clipped **2px on the left** by `#clan-panel`. Ink at 188, clip edge at 190.
- **Root cause.** `.hr-cs-doors` bleeds `margin: 0 -12px` "against the card's own 12px padding" (index.html says so in a comment). **The card body's padding is 0** in hearthlight — 14px only in Cozy Day, which is why Cozy Day never showed it. So the first cell's 10px inset landed its text 2px *outside* a box that hides its overflow. b225 taking those labels 12.5 → 13.5px is what turned an invisible shave into a chopped-off T. **A negative margin is only ever correct relative to a padding somebody else owns. Never write the number twice.**
- **Fix.** `--cs-bleed`/`--cs-inset` declared once on `.hr-cs`; the band and strip derive their margins from the first, the cells their padding from the second, and the strip carries `padding: 0 var(--cs-bleed)` so **the mortar bleeds to the frame and the blocks stop where the text does**. The first door's label now sits on the same vertical axis as the STANDING label below it — it never did before.
- **Cramping, fixed as geometry not type.** Cells were 57.3px for two 13.5px lines: 2px above the ascenders, 3px below the descenders. Padding 9 → 11, gap 1 → 2, and **both labels now declare `line-height: 1.45`** — `.hr-cs-door-nm` hides its overflow for the ellipsis, so its box is exactly one line box tall and inherited leading tighter than the face shears the glyphs. Column floor 118 → 126px so "The Great Hall" never ellipsises.
- **Result: 0 clipped text in 198 measured states** (90 panel + 108 modal), both themes.

**The scene: tier 1 was a CAMP and now it is a FOUNDATION.** Two tents and a fire is the *homestead's* vocabulary — it told a clan its shared castle began as somebody's smallholding. Tier 1 now draws the building site: batter boards at both corners, cord strung along the run, the first course of footings laid from the left corner to the gate, an **open trench with its spoil thrown up** where the masons have got to, bare stakes where they have only measured, gate piers begun, a **claim pole on the gate line**, a cresset burning, a mason's lean-to with a lamp over the banker, a tip cart and stacks of dressed stone. Tier 2 is the plinth complete with a boarded wall going up on it — four runs in four **states** (clad / bare with the next course landed on it / clad / standarded-but-unclad), a scaffold and a **lifting gin with a block in mid-air**.

**The spine: `WALL_L/WALL_R/TOWER_L/TOWER_R/GATE_L/GATE_R`.** Tiers 1-4 now draw on one rectangle to the unit — tier 1's setting-out lines *are* tier 4's curtain wall, and the banner pole stands exactly where the gatehouse rises. Tier 3 kept its b223 silhouette (crest 54, towers 76, roofs 96) and gained the shared footprint plus the footing course, so the stone thread runs unbroken 1→5. Its timber-over-stone is deliberate and unchanged: motte-and-bailey before the rebuild in masonry.

**The measurement that saved the whole thing.** My correct, complete building site was **invisible**. Hearthlight's ground tokens are `--scene-build #090705`, `--scene-ridge-near #0b0806`, `--scene-ridge-mid #120e0a` — three values inside **9/255** of each other. Every structure in this picture that reads, reads because it is silhouetted against the *sky*, and the foundation stage is by definition shorter than the horizon. Two fixes: a **terrace** (the levelled platform a castle is actually begun on) in `--scene-ridge-far #1a150f`, the only ground token with real separation; and `.hrcs-arris`, a proper catch-light on cut stone, because `--scene-rim` at α.20 has no sky behind it down there. **Anything drawn below this scene's horizon needs a lighter ground put behind it first.**

**The one mark that answers Tyler's question.** `.hrcs-plan` — the mason's *drawing* of the finished castle, gilt, fine, long-dashed, α.28, at tier 4's exact coordinates, over the ground it will stand on. Deliberately NOT the `.is-ghost` dash the unbuilt wings wear: a ghosted wing is a *building that is absent*, drawn in the scene's own ink; this is a *drawing*, so it is set in the same gilt as the tier name above it. Every other mark says *work is happening here*; only this one says *and this is what it will be*.

**Three craft failures walked back, in order.** (1) The first heights — footings 15, pads 26 — were the right proportions and unreadable; a low tier has to be *drawn taller than it is* to survive the plate scrim. (2) A 650-unit unbroken highlight along the terrace's far edge reads as a **wire stretched across the picture**, not as ground; the value step is the edge. (3) `function banner()` already existed 500 lines down for the room interiors — hoisting silently ate my arguments and shipped `v undefined` into a path. Renamed `claimPole`.

**Guards (331 → 333), each proved to fail by re-introducing its bug and watching the suite go red.**
1. *no door-strip label is clipped by the panel that bleeds it* — rect containment against every clipping ancestor's padding box, plus the label's own line box, plus an ellipsis check, at tiers 1/3/5. Restoring `padding: 0 0 1px` → red.
2. *every tier draws the castle on one footprint, and the ladder only goes up* — the Great Hall group's drawn extent must span 500–1100 at every tier (the plan excluded — it is a drawing, not stone), the crest must never fall as the tier rises, and tier 1 must carry both a plan and a terrace. `WALL_L` 516 → 560 → red; claim pole 118 → 150 (taller than tier 2's roof) → red.
   `getBBox()` is a **layout** query — on a detached node every box is 0×0 and the guard passes vacuously. It renders into a fixed off-screen host.

**Verified.** Static server :8168, Playwright through the `__HR_TEST_HARNESS__` seam, `_setClan`/`_setSeat` at tiers 1/2/3/4/5. 1600×950 → 760×900, hearthlight AND Cozy Day, every tier and all six room modals. Overlays cleared by a **MutationObserver installed before boot** — a one-shot clear loses the race, and the daily-reward scrim's `backdrop-filter` silently blurred my entire first screenshot pass. Smoke **333/333, 0 runtime errors**, 0 console errors from these screens; `bump-version.sh --check` OK, no bump.

**Known limitations / handoffs.**
- **The words now contradict the picture. `clan-seat.js:97` still calls tier 1 "Wayside Camp"** (and tier 2 "Palisade", now half-true — it is a stone plinth with timber rising on it). Display-only strings, no persistence, one line — but that file is the Systems Engineer's. Tyler asked for a foundation and the eyebrow over it still says *camp*. **Someone should rename it; I would not change another agent's data file silently.**
- `--scene-ink/-2/-3` and `--scene-gilt` are declared **only** under `body[data-theme="hearthlight"]` (`theme-cozy.css:3965`), not in the Cozy Day block. It renders, so something resolves them, but a scene ink role that only one theme declares is a trap for the next person who draws on a picture. Not my file this wave.
- Cozy Day still paints the hold's name near-black on its own dark scrim — that theme's mirror blanket, pre-existing, and Cozy Day is not selectable.
- The site furniture (lean-to, cart, stacks) sits partly over the ghosted wings at tiers 1-2. It reads as objects standing in front of planned buildings, which is true, but a wider ward would let them breathe.
- Still SVG silhouette, not painting. The b219 brief stands: painted dusk plates would beat it.
### 2026-08-08 · Backlog #19 — the type FLOOR (b225, branch `agent-type-floor`)

**Why b218 didn't fix it, stated plainly.** b218 multiplied every size by ~1.13 (body 14→16). A proportional scale keeps the ratio between the top and the bottom of a ramp — so a tier that started at 11px landed at 12.5px, which is still unreadable at a monitor's viewing distance. Tyler's second complaint was correct and specific: *"in a lot of places"*, not *"everywhere"*. **Never answer "too small" with a multiplier. Answer it with a floor.**

**Measure first — the numbers that made this a decision instead of a taste argument.** I rebuilt the b222-style harness: harness-authed past the account wall (`__HR_TEST_HARNESS__`, the same seam `run-smoke.mjs` declares), walk 28 surfaces (13 nav destinations, 5 sub-views, 9 modals, plus the wall in its own un-harnessed context), and dump the **computed** font-size of every element that owns visible text, plus an overflow/clipping detector on the same walk.

| | <13.5px | total | |
|---|---|---|---|
| before, 1440×900 | **1870** | 3665 | **51 %** |
| after, 1440×900 | **0** | 3690 | |
| after, cozy-light | 0 | 3820 | |
| after, 900×760 | 0 | 3195 | |
| after, 880×420 landscape | 0 | 3065 | |

The before-histogram is the whole story: 861 elements at 12.5px (`--t-micro`), 298 at 10px, 286 at 11.5px, 186 at 8px. Nearly a *thousand* elements sat on or below the ramp's bottom step.

**What moved.**
- **Token tier (4 values).** `--t-micro` 12.5 → **13.5 (the floor)**, `--t-small` 14 → 15, `--t-h3` 14.5 → **15.5**, `--t-lead`/`--t-body`/`--t-h2`/`--t-h1`/`--t-num` untouched. `--t-body` staying at 16 is deliberate: the ramp compresses at the bottom, where the problem was. **`--t-h3` gets +1px over its tier** because it is set in Alegreya Sans SC — genuine small caps have no ascenders and a cap-height near the regular face's x-height, so 14.5px SC reads like ~12.5px regular. A floor pass that ignores the SC face under-raises every section label in the game.
- **409 hardcoded declarations in 5 sheets** and **143 in 25 JS style strings**, by monotone map: `<13.5 → 13.5`, `14 & 14.5 → 15`, everything else untouched.
- **7 `font:` shorthands** — a second regex, and the reason the first sweep left 12 stragglers (`.td-tab`, `.hd-cta`, the FTUE and gate buttons, `network-status`). **`font-size:` alone does not find all of it.**
- One `calc(var(--t-micro) - 1px)` — the only rule in the codebase that deliberately undercut the ramp's bottom step, which is now the floor.

**The JS half is the half b218 missed, and it is 25 files.** Almost all of it is injected `<style>` strings (home-dashboard 19, account-gate 7, renown 10, identity 6, muster 6, collection-log 9, leaderboards 5…) plus inline `style="font-size:11px"` in template literals. That is CSS living in a `.js` file — the **wall itself** carried 11px field labels. Verified with `git diff -U0 | grep -v font-size` returning **empty**: not one line of logic changed. Any future type work must sweep JS too or it will ship half a pass.

**Layout fallout, all found by measurement, all fixed (4).**
1. **The sidebar overflowed by 4px on every screen.** `height:100vh;overflow:hidden`, and the three group labels went 10 → 13.5px — the "Offline" foot fell off the bottom. The type stayed; the spacing paid (3 labels × 3px + 2px off the brand).
2. **`.td-tab` clipped "COMPANION" mid-word.** At 13.5px the uppercase + `.08em` treatment needed ~136px in a 102px tab. **Uppercase and tracking were the luxury the width could not afford, not the size** — sentence case measures ~65px and matches the sidebar nav.
3. **`.td-slot.empty` also matches the generic `.empty` rule and inherited `padding:30px 20px`** — a 72px slot with a 32px content box, so every doll label overflowed its own padding box. Invisible (centred, unclipped) and therefore live for months; the floor made the number big enough to notice.
4. **Stable cards: `.sc-lvl` is absolutely positioned top-right and the name row never reserved its gutter.** "Rock Golem", "Phoenix Chick", "Dragonling" ran under the chip. First fix used `overflow-wrap:break-word` and produced "HONEYBE / E" — worse. Correct answer: reserve the gutter, wrap at spaces only, let a long word lean into slack the chip isn't using.

**Guards (294 → 297), each proved to fail by re-introducing its bug at runtime.**
1. tokens hold the floor *and their ordering* — and `--t-body` rising is explicitly not a way to pass it;
2. no stylesheet rule declares a sub-floor font-size;
3. **nothing in the rendered document draws text below the floor** — the guard that would have caught b218, because inline `style=` and `font:` shorthand never touch a token.
**Guard 2 was vacuous on its first draft.** `if (rule.cssRules) { recurse; continue; }` — Chromium's nested-CSS support gives every `CSSStyleRule` a `cssRules` list, and an **empty `CSSRuleList` is truthy**, so the first branch swallowed every style rule and the test passed on a tree I had just poisoned. Check `rule.style` *before* recursing. (Same failure mode as the b222 empty-catalogue guard. Always poison the tree and watch the test go red.)
**Documented exception:** `font-size:0` is exempt in guard 2 — it is the glyph-suppression idiom (7 rules: skill icons, monster/fighter portraits, activity-bar icon), not small type.

**Verified.** Full harness sweep at 1440×900 both themes, 900×760, 880×420 landscape, 420×820 portrait; screenshots of all 13 destinations + doll + sidebar + topbar + the wall. Every post-pass overflow is byte-identical to the pre-pass baseline (`bb-cut y+7`, `combat-arena x+15`, `cr-name y+3`) — **zero new fallout in any supported configuration.** Smoke **297/297, 0 runtime errors**; `bump-version.sh --check` OK, no bump.

**Known limitations / handoffs.**
- **Portrait (420×820) is the one place the floor costs width.** The topbar already overflowed by 68px before this pass; it is now ~101px. Portrait is an explicitly abandoned form factor (landscape-only), and the pills' padding is set by a cascade of five competing rules — I wrote a `@media (max-width:540px)` compensation, measured it as **inert**, and deleted it rather than ship dead CSS. Fixing it properly means restructuring the topbar for portrait, which is a layout decision, not a type pass.
- **`#panel-combat` clips ~290px of content on a 420px-tall landscape phone** (was ~235). It computes `display:grid;overflow:hidden` there — something outranks the mobile `display:block;overflow-y:auto`. **Pre-existing and unreachable content, not cosmetic.** Systems/mobile.
- **The Stable renders ~22 literal emoji as companion art** (🦊🐺🐦🐰🐝…) — a live 0-emoji-rule violation on a whole screen, in `.sc-icon`. Out of a type pass's region; needs atlas glyphs or painted portraits. **Asset Director + Systems.**
- The Cozy Day topbar draws the player name near-black on near-black. Pre-existing, that theme only.

### 2026-08-08 · Screen-by-screen UI/UX audit (read-only) — `docs/reports/AUDIT-2026-08-08-ui-review.md`

**Scope.** b224 + account wall (`4bda860`). 40+ screen states — wall, every panel, every sub-tab, the castle + all six rooms, the modal fleet — at 1440×900 and 900×820, hearthlight and cozy-light. ~90 captures. **34 findings: 0 P0 · 9 P1 · 15 P2 · 8 P3 · 2 P4.**

**Method worth keeping.** Playwright with the smoke suite's `__HR_TEST_HARNESS__` `addInitScript` seam (localhost-only) is the way to audit this build now that the wall is up — the MCP browser cannot set a global before page scripts run, so it cannot get past the front door. Seed state by writing `G.skills[s] = XP_TABLE[lv-1]` + `window.addItem` directly rather than via `window.Admin` (admin.js is gated behind `?admin=1` and injects its own panel into every screenshot). Overlays must be cleared *before each shot*, not once after boot — the daily-reward scrim and the renown celebration arrive on delays and silently dimmed my entire first pass. And `fullPage:true` is useless here: `.panel` scrolls internally, so a second pass that scrolls the tallest overflowing descendant is the only way to see below the fold.

**The finding that dwarfs the rest: 112 emoji still render as art.** A DOM sweep counting only visible text nodes, over every panel and modal: Stable 22 at **48px** (the entire screen's art), Collection log 32, Events/Dungeons 24, House→Themes 6, Store→Equipment 5, Combat active-effects 4, Settings 4, House→Plot 3. The b217/b221 passes genuinely worked — Home, Character, Inventory, Bounty, Skills, Market, Social, Farm are clean — but every selector `icon-set.js` never listed is still emoji: `.sc-icon`, `.dgn-loot`, `.dgn-icon`, `.iap-icon`, `.at-icon`, `.hr-cl-ic`, `.modal-title`. **The sweep script is the guard we've never had** — it belongs in `smoke-test.js`; a strip-list is a blocklist and it will keep losing.

**Three defects a visual pass alone would have missed, all found by measuring.**
1. **Skills detail is stale by design.** `showTab('skills')` renders only the list; `refreshAll` re-renders the detail *only if `G.activeSkill`*. Until you click a tile, a level-58 skill displays "Level 1 · 0/83 XP" **with padlocks on Oak/Willow/Maple**. Not ugly — untrustworthy.
2. **`character-page.js:225-227`** passes `lv('ranged')` into rows hardcoded `Attack / Strength`, so Melee and Ranged print two different numbers for "Attack" side by side.
3. **Two dialogs render simultaneously.** Settings + the FTUE step-1 card; More + the What's-New sheet. `welcome-modal.js`'s `BLOCKING_OVERLAYS` guard exists but doesn't include `.modal.show` or the FTUE root.

**Against my own standing brief.** The castle's six rooms are the entry affordance Tyler asked to feel like doors and they are a 6-cell bordered text table under a scene band; the room modals behind them are two-tone greybox (the Tavern is an arch, three lines and three plain black rectangles). `ROOM_ART` already draws one illustration per room — cropping those into the door tiles fixes the strip with zero new assets. Also: the Tavern tells the player the Board "needs the **clan-seat-2** migration" — a Supabase filename in shipped copy.

**Colour discipline is slipping in three specific places**, all measured, none of them taste: the clan-boss bar is `linear-gradient(90deg, rgb(178,58,44), rgb(212,99,63))` at 1210×8 rendered **100% full above a caption that says "Unmeasured"**; the Store's nine Buy buttons are the highest-chroma block in the build and read violet rather than sapphire; and cozy-light's active nav is still `linear-gradient(rgb(212,74,58), rgb(139,42,31))` — the exact oxblood Forge & Stone was created to kill, one hand-set attribute away.

**Where the value language is still absent.** House prints met and unmet requirements in the identical `rgb(236,225,204)` (Home colours the same data red); artisan recipe cards state inputs with no have/need and no disabled state; room-modal upgrade rows print `240/139 Timber Beam` which inverts into nonsense when you're over. That is **one atom** — a have/need pair with met/short states — owed to three screens.

**The front door shows nothing of the game.** The account wall is a 402×386 card in a 1440×900 flat-black field (78% empty), with its value proposition stated twice in different words 250px apart. `HearthriseBackdrop.homesteadScene(5)` already exists, is already tokenised, and would fix it behind a scrim for free.

**What holds up.** Bounty and the Store shopfront read as places and are now the internal reference for the Farm (eight diagonal-hatch plots — the most generated surface left), the Market (the last un-themed economy screen) and the castle. Home remains the strongest screen. Console clean, zero horizontal overflow at both widths, on every screen.

**Deliberately not filed** (per brief): #18 nav placement, #19 text floors, the known asset gaps, mobile-portrait, everything in BACKLOG/CONFLICTS. Two are recorded in the report's "Not filed" section because the measurements change their sequencing: at 900px the chat dock and bug button sit **on top of the "More" bottom-nav tab** — the only route to five destinations on mobile, so #8 is a navigation block, not an overlap; and #19 is chasing an 8px floor (`.hr-cl-nm`), 9px (`.dgn-bop`, `.brand-tagline`) and a wide 10–10.5px band.

**Note on overlap with b225 (below).** The audit was captured against `4bda860`, *before* the Clan destination shipped. Findings 3, 4, 25 and 27 are about the castle panel's own composition and the room modals, not its placement, so they survive the move unchanged — but they should be re-verified against b225's panel host before anyone acts on the pixel coordinates.

**Limitations, honest.** cozy-light was checked but shallowly — it is unreachable through the UI, so depth there would have been spent badly. The Stable's 22 companion glyphs are a genuine asset ask, not a mapping job, and I have not confirmed the atlas can cover them. Captures live in the session scratchpad and are not committed; the report names the harness so any of them regenerates in one command.

### 2026-08-08 · b225 (#18) — the Clan Seat gets its own destination

**The ask (Tyler, P1).** "The clan page needs to be different than the social/leaderboards tab... it should be easier to find."

**Placement decision.** New top-level sidebar entry labelled **Clan**, in a new group **Realm**, sitting directly under House. Reasoning:
- *Why top level at all* — DECISIONS 2026-08-08 makes the clan castle and the personal homestead the twin ultimate progression pillars. One of them had a nav entry (House); the other was the bottom half of a card underneath the leaderboards. Peers in the design have to be peers in the navigation. Events earned the same promotion in b220 for the same reason.
- *Why "Clan" and not "Castle" / "Clan Seat"* — "Clan" is the word the player already uses (it is the word Tyler used). "Castle" names a room ~90% of players do not own yet, so it would be a lie for anyone without a clan, and "Clan Seat" is internal vocabulary. One word also matches every other entry in the rail and survives the icon-rail tooltip.
- *Why a "Realm" group instead of extending "Homestead"* — a clan castle is explicitly NOT the homestead. Everything under Realm involves other players: Clan (your hold) and Social (the wider world's boards + friends). Social moving under it also finally explains what Social is now that the clan left it.
- *Position* — first in its group, one row below House, so the two pillars are adjacent across the divider.
- *No-clan state* — the entry never dead-ends. Signed out → "Your hold awaits" + Sign in. Signed in, no clan → "Find a hold, or found one" + the live clan list + the found-a-hold field. In a clan → the castle.
- *Mobile* — the 6-slot bottom nav is full, so the More sheet carries it, second, directly under Events (exactly what b220 did). No emoji on the new entry.

**Clan Activity moved with the hold, Friends stayed in Social.** The feed's subject is your members and its audience is your hold — leaving the one true clan surface inside Social is the defect #18 names. A friend list is cross-clan and global, so it belongs beside the leaderboards. Consequence: Social = the wider world (rankings + friends); Clan = your hold.

**Second door.** The topbar clan tag `[Emberfall Watch]` is the only place a player's hold is named on every screen, so it became a `<button>` routing to the Clan Seat. Styled to stay the quiet gilt tag it always was (verified: Alegreya Sans SC, 11.5px, 22px tall, pointer, focus ring).

**Two things the move broke, and the fixes.**
1. *The rail overflowed.* `.sidebar` was `overflow:hidden` at `height:100vh`. At 1440x900 the list already stood 25px from the edge before this (two more entries — Stable, Market — are injected at runtime), so the new entry pushed the connection indicator off-screen with no way to reach it. The rail now scrolls (`overflow-y:auto`, `overscroll-behavior:contain`, `.sidebar > *{flex-shrink:0}` so nothing gets squeezed instead). Verified: scrollHeight 955 / client 900, foot reachable, brand 108px, tap targets still 44px. This is also the right answer at 10x content — an OSRS-scale game keeps adding destinations, and a nav that cannot grow starts hiding things.
2. *Measure.* Inside Social the castle was a ~330px column, so `.hr-cs-line`'s space-between read as a label/value pair. At full panel width the same rule put "Treasury" and "42,500 gold" 1,200px apart. Capped the stacked lines, the find-or-found list and the Social signpost to a 760px column; the hold band, the six doors and the three-column week strip still take every pixel. **Lesson: a component tuned inside a narrow column does not survive being promoted to a full screen — re-check every space-between row when you widen a screen.**

**Files.** `index.html` (nav entry + Realm label + `#panel-clan` + More entry + Social card head + clan-tag button), `src/legacy.js` (showTab aliases + `renderClan`/`syncClanActivity`/`clanDisplayName`, Social's clan half became friends + signpost, `injectFriendsStub` retired), `src/features/clans.js` (hosts `#clan-panel`, owns `renderClan`, `refreshClanScreens`), `src/features/clan-seat-ui.js` (**hosting only** — `renderIfOpen` looks at `#panel-clan`), `src/features/icon-set.js` (`clan: 'uiCastle'`), `src/styles/clan-seat.css` (all of #18's CSS, one place, loads last), `src/styles/legacy.css` (the rail scroll fix), `src/chat.js` + `src/features/raids.js` ("join a clan" CTAs now have a destination), `src/features/smoke-test.js` (2 guards).

**Verified.** Static server :8157, Playwright with the `__HR_TEST_HARNESS__` init-script seam to get past the account wall. Desktop 1440x900, tablet 1100x820 (icon-rail: labels hidden, glyph correct), narrow 430x900. Hearthlight AND cozy-light (forced — the picker ships one theme now). Rendered the real castle via `_setClan`/`_setSeat`: hold band, six doors, standing bar, week strip, room modal all correct in the new home. Find-or-found state, Social's leaderboards + friends + signpost, More-sheet route, all five `showTab` aliases, activity card toggling with membership, 0 emoji in the touched chrome, 0 console/page errors. Smoke **296/296** (294 + 2 new), `bump-version.sh --check` OK, no bump.

**Known limitations.**
- A tier-1 hold leaves the lower ~40% of the screen empty. That is content depth, not layout — it fills as the hold grows. Worth a Designer look if it still reads thin once Work Orders are live.
- The Clan Activity feed is still a stub empty state (it was in Social; it is now in the right place). Real events need a server feed — Systems.
- The mobile More sheet's older labels still carry emoji (Items/House/Social/Store/Chat/Save/Settings). `icon-set.js` strips them at runtime so nothing renders, but the markup should be cleaned and given atlas glyphs. Not mine this wave.
- FTUE never referenced Social or clans, so no tour step needed changing. If a clan step is ever added it should target `button[data-tab="clan"]`.
### 2026-08-08 · Standing brief — castle beauty pass (from Tyler)
Castle blocks (stone/masonry) as the page's material language; every building clickable → a modal that feels like the INSIDE of that room (tavern warmth, vault iron, forge heat...), each carrying its upgrade ladder. Quality over speed — Tyler explicitly budgeted time for refinement. Build on the validated scene-composition craft.

### 2026-08-08 · Product-owner validation
Tyler on the b221 bounty board: "looks awesome." The scene-composition approach (in-world object + drawn SVG craft + readable type on scene surfaces) is now the validated standard for screen identity work — apply it to the castle panel beauty pass and any future screen that should feel like a place.

### 2026-08-08 · Wave 3a — the CSS substrate (b222)

**Purpose.** Pay down the debt that taxes every new screen: the b174 `!important` blankets, the unscoped stragglers, and the inert cozy-light CSS. Structural pass, not a redesign. Files: `theme-cozy.css`, `board-and-shop.css`, `smoke-test.js` (guards only).

**Method — and this is the part worth keeping.** Eyeballing 36 screens cannot prove "unchanged". I built a Playwright harness that, for every screen × both themes, dumps the computed value of 17 properties for **every visible element** plus a screenshot, and diffs two runs. Baseline noise: **0 style differences, ~0.013 % pixels** (only the muster countdown, after seeding `Math.random`). That turned every decision from taste into measurement, and it caught four things a visual pass would have missed. Anyone doing CSS surgery here should rebuild it before touching anything.

**Debt 1 — the blankets. What they actually were.** The b174 comment says they exist to beat unscoped `#panel-x * {color:#3d2817!important}` cocoa rules. b216 already scoped those to `cozy-light`, so the stated reason is gone — but the blankets are now load-bearing in their own right, and they fight *other `!important` rules in the same file*. Deleting them is not available. What IS available is to stop them reaching where they are **wrong**: an in-world surface (parchment, lit counter wood, a scene band) is lit by its picture, not by the theme.
- Added one carve-out — `:not(.bb-board,.sc-scene,.sc-counter,.iap-card, …descendants)` — to the six hearthlight blankets that a matched-rule audit proved were the *only* `!important` colour rules reaching those subtrees. Same string everywhere, greppable, documented with an add-a-root instruction.
- **`board-and-shop.css`: 35 stacked-id selectors → 1**, and every `!important` that survives is now attributable. It is 30 `color` + 4 `.iap-card` surface + 1 `border-left-color`, and *none of them are for hearthlight* — they are Cozy Day's mirror blankets (untouched on purpose) and one mobile media query. The header states the exit condition: delete Cozy Day, delete its blankets, and they all go.
- **Found the blanket re-asserting a b216 fix.** Blanket B carefully excludes `.ribbon/.chip/.btn-*` so filled controls keep their own contrast — and blanket A, one id lower and with no carve-outs, put `--ink` back on them anyway. Live consequence: **cream "Buy" text on struck gilt, and cream coin glyphs on parchment price tags (~2:1)** in the shop, for months. The carve-out let board-and-shop's own ink land: dark on gilt, dark on paper, sapphire on the premium packs.
- **Deleted an impossible selector.** `body[data-theme="cozy-light"] body[data-theme="hearthlight"] #panel-profile *` — b216's rescoping script prefixed a *comment*, and a comment is whitespace to the tokenizer, so the prefix glued itself to the next selector. Two `<body>` in one chain = never matches. **Home has rendered without the readability blanket since b216 and is the best-looking screen in the game.** That is the exit criterion now written into the file: a screen leaves the list when it stops needing it. A second instance (`body[…] body`) was found by the new guard.

**Debt 2 — the stragglers. 25 of them, and two were live.** Every rule in the "cozy-light component fine-tuning" block was a pair: `body[data-theme="cozy-light"] X, :root X`. `:root` is `<html>`; the theme attribute is on `<body>`; so the second half matched under every theme. Deleted all 25 `:root <descendant>` halves. Two were visibly painting:
- `.nav-btn.active` — the light theme's flat fill plus a **real 3px `border-left`**, which defeated b217's gilt wash and put a second spine beside the intended inset one. It also pushed every active nav label 3px right, so the selected item never lined up with the others. Both fixed.
- `.status-pill` — wore the light theme's plate and keyline.
- (`#hr-bug-btn` too, but the delta is a hairline.)

**The one that only exists on phones.** `:root .bottom-nav` set `linear-gradient(#e8d4a0,#ede0b8)` — so **the mobile bottom nav has been a cream parchment bar under the dark theme on every portrait phone**, with grey-on-cream labels. Invisible to every desktop pass ever run, including mine until I built a 420×820 sweep. Now dark. Lesson: any theme-leak audit that does not open a phone viewport is incomplete. (Follow-up: the value it falls back to is `rgba(8,15,22,.96)` — a *cool* blue-black in a warm theme. Reads near-black in situ, but it should be a `--bg-*` token.)

**Debt 3 — 636 lines / 28 KB of dead CSS deleted, with zero computed-style change.** Two provable criteria only:
- 296 selectors that were **literal duplicates inside their own rule's list** (no-ops).
- 171 selectors + 23 whole rules whose class/id hooks **appear nowhere** in `index.html` or any `src/**/*.js` — verified by regex over the full shipped corpus with a word-boundary guard, then spot-checked by hand. They are stale renames: `.invc-bag` (the real one is `.invc-bag-col`), `#quests-strip` (`#global-quests-strip`), `.ftue-tooltip/.ftue-next/.ftue-button` (FTUE ships `.ftue-card/.ftue-btn`), `.stat-val` (`.mp-stat-val`), plus `.qbtn/.bag-grid/.tier-tab/.suggested-card/.welcome-card/.item-detail`…
- Plus 3 rules byte-identical to a later rule with the same selector and `@media`.
- **Deliberately kept:** everything scoped to `cozy-light` whose hooks still exist (that theme must stay pixel-identical); 8 rules with comments interleaved in their selector list; anything reached by `[class*="…"]`. When in doubt it stayed. CURRENT_STATE's "~3,000 lines" is the *plausible* number once Cozy Day is actually retired; 636 is what is provable while it is still selectable.

**A false start worth recording.** My first dead-code cutter deleted raw *lines*. It corrupted brace pairing and left the sheet parsing as 7 rules instead of 652 — and the screenshot diff looked merely "wrong", not "broken". The fix was to rebuild each rule's **selector region** instead, and to verify by parsing both files with the browser's own CSS engine and asserting *nothing new or changed* in the output. Never line-edit CSS; edit regions and verify with a parser.

**Guards (b222 suite, 221 → 225).** Each one was proved to fail by re-introducing its bug at runtime, not assumed:
1. no always-true `:root <descendant>` in **any** sheet (b216's guard only knew `html:not([data-theme])`, only in one file);
2. no selector chaining two `<body>`/`<html>` — the comment-prefix accident;
3. **the blankets stay out of in-world surfaces** — builds a synthetic `.bb-board`/`.sc-counter`/`.iap-card` fixture and asserts no foreign `!important` colour rule matches it, so the next in-world screen never has to start an arms race;
4. `board-and-shop.css` never stacks panel ids (≤1).

**Verified.** Static server :8148. 36 screen×theme combinations swept at 1440×900 (home, character, inventory, combat, bounty, shop ×3 tabs, skills, artisan detail, farm, house, social, events, market, stable, dungeons, settings), each also captured scrolled to the bottom of its panel; plus a 20-combination mobile sweep at 880×420 landscape and 420×820 portrait. Both themes throughout. **Cozy Day: exactly one computed-style difference in the entire sweep** (a `border-bottom` on the last shop row, see limitations). Hearthlight differences are all listed above. Smoke **225/225, 0 runtime errors**; `bump-version.sh --check` OK; `findUiOverlaps()` empty; console clean apart from the pre-existing offline Supabase 404.

**Known limitations / handoffs.**
- **Cozy Day is not actually selectable, and the code says two different things.** `theme-picker.js` lists only hearthlight, and `applyTheme('cozy-light')` *removes* `data-theme` rather than setting it — so the ~900 `body[data-theme="cozy-light"]` rules can only be reached by setting the attribute by hand. Someone should decide: retire it properly (then ~2,400 more lines and 30 `!important`s fall out of this pass automatically) or make it real. **Systems decision, not mine to take alone.**
- `home-dashboard.js:182` injects `'html:not([data-theme]) …'` from JavaScript — the exact always-true pattern b216 killed, in a place CSS guards cannot police (my guards skip sheets with no `href`, or they would fail on every injected style). **Systems handoff.**
- The mobile bottom nav's new (correct, dark) background is a cool blue-black; it wants a warm token.
- The companion rows in the shop's Equipment tab are injected by a `setInterval(…, 1500)` poll, so they can take up to 1.5 s to appear. Not cosmetic — it made my screenshot harness non-deterministic until I raised the settle time. **Systems handoff.**
- One intentional visual difference in Cozy Day: the last row under "Under the counter" loses a 1px hairline. b221's own `.shop-row:last-child{border-bottom:0}` had been defeated by its author's 3-id rule; collapsing the ids let the author's intent apply.

### 2026-08-08 · Wave 2b — the board is a board, the shop is a shop (#5)

**The ask (Tyler).** "The bounty board should feel more like an actual 'board' and the 'shop' should feel like a shop.. a little chick behind a counter with offers on the table."

**The board.** `#bounty-board-body` was three bordered rows in a card — a list that happened to be called a board. It is now a built object: timber frame, a top beam with a lantern hung off it, a recessed plank field lit from that corner, and each bounty a parchment notice nailed to the wood. Pin x-position and sheet rotation are **indexed constants, never `Math.random`** — the panel re-renders on every kill, and a board whose notices jump each repaint is not furniture. Notices are `auto-fill minmax(202px,1fr)`, so the tier-2 board's extra bounties post without a code change. The claimed bounty **stays on the board**, over-stamped with one oxblood clerk's stamp (`mix-blend-mode:multiply`, struck at -11°) — one strong device, not a torn corner *and* a stamp *and* a tint.

**The shop.** `#shop-panel` was a price list. It is now a shopfront: an SVG band of a lit interior — shelves, a shuttered window at dusk, strung herbs, a burning lantern, a keeper leaning on her counter, and **a hen sitting on the wood beside the wares**. "A little chick behind a counter" is genuinely ambiguous (a young woman, or a bird); the scene answers both rather than guessing. The counter's top surface runs out of the picture and *becomes* the offers list — same wood, same lighting — and each ware sits on a stitched cloth mat with a notched price tag. At ≥1060px the offers go two-across, because one column on a 1,080px counter left a 500px void down the middle of every row.

**Three craft failures I had to walk back, in order:**
1. **Wrong aspect, again.** I drew the scene at 900×200 and dropped it in an 8:1 strip; `slice` cropped 100 viewBox units off the top and only the keeper's shoulders survived. Exactly the b219 hearth-band lesson. Fixed by authoring at 1600×200 and pinning `.sc-scene{aspect-ratio:8/1}` so the frame and the drawing agree.
2. **Rim light by offset copy reads as a sticker.** Drawing the silhouette twice, offset toward the lantern, outlines the figure on *every* side. The rim is now an **open stroke along the lit contour only** — crown, brow, cheek, jaw, neck, shoulder, the fall of the skirt.
3. **A circle on a mass is not a person, and one closed blob is not a hen.** First keeper read as a lollipop; first hen as a lump. Both are now hand-authored contours with separate parts (coif, apron, forearm / tail, body, neck, head, comb, wattle).

**The blanket problem, named.** `theme-cozy.css` carries the b174 readability blankets — `#panel-bounty#panel-bounty *:not(…){color:var(--ink)!important}` and `#panel-shop#panel-shop [class*="card"]{background:var(--bg-2)!important}`. Parchment and lit counter wood are **light surfaces in both themes**, so those blankets put parchment ink on parchment. `!important` cannot be beaten by specificity alone, so every contested declaration in `board-and-shop.css` repeats `!important` at three ids. That is documented at the top of the file, and it comes off with the blankets whenever they are deleted (already listed as debt in CURRENT_STATE). New sheet rather than appending 400 lines to a 5,000-line file, and it keeps this wave's footprint off the file another agent may be editing.

**Emoji found live on both screens (0-emoji rule was being violated):**
- Bounty: `🎯` ×6 whenever a bounty was **active** — `.bounty-title` is not in `icon-set.js`'s strip list, so the 1.2s sweep never touched it. Plus the panel title, the More-sheet entry, the Marks price, and three toasts.
- Shop: the four cosmetics shipped `icon:'✨'/'🐲'/'🦅'/'😎'` straight into `.si` — the sweep only covers `#panel-bounty .si`, so they had been live for months. Now baked-atlas glyphs. `avatar_dragon` asked for `dragon`, which lives in `HR_MONSTER_GLYPHS` not `HR_GLYPHS`, so `HR.icon` would have drawn nothing — it uses `navProfile` (the thing the cosmetic actually changes).

**Real money is sapphire now.** The store's Buy button was `btn-primary` — the identical struck-gilt control that spends in-game gold one card lower on the same screen. `art-direction.css §6` already reserves sapphire for real money; the store now uses it, along with a sapphire card-head keyline, cool-cast card surfaces, sapphire ribbons and price ink. Gem-priced cosmetics on the warm counter keep sapphire on their tag *and* their art, so a row agrees with itself about which currency it wants.

**Bug found and fixed in passing (P2, not cosmetic).** Top-level `const` in a classic script lives in the global *lexical* scope, not on `window` — so `window.SEED_SHOP`, `window.EQUIP_SHOP`, `window.IAP_CATALOG` and `window.TRAITS` were all `undefined`. Three shipped consumers were silently degraded by their own `|| []`: `item-ux.js:28-29` ("buy another" affordance), `admin.js:458-459` (obtainable-item audit), and — worst — **the b215 "no purchasable XP multiplier" guard, which has been iterating an empty catalogue and passing vacuously since it was written.** Published the four the way b220 published `DAILY_TASK_POOL`. That guard is real again.

**Contrast fixes made from measurement, not taste:** notice tertiary ink was 4.3:1 on parchment (→ `#63503a`); the Cozy Day counter was a golden-hour tan carrying cream scene-ink at ~2.2:1 — the counter now holds the **same value range in both themes** on purpose, because the type on it reads the `--scene-ink*` roles, which stay light in both.

**Verified:** static server :8145, hearthlight default. Desktop 1280×800 and 1440×900; narrow 900×760 (mobile layout, bottom nav); scene inspected 1:1 at 800px viewport. Both screens in every state: empty board, 3-notice board, claimed/stamped board, and shop seeds/equipment/cosmetics tabs. Cozy Day checked on both. FTUE welcome modal + the 6-step tour spotlight overlay the bounty screen correctly. Combat's compact "Active bounty" pill still renders and no full board leaks into `#panel-combat`. No horizontal overflow, no 404s, 0 console errors from these screens. Smoke **211/211, 0 runtime errors** (206 + 5 new); `bump-version.sh --check` OK.

**Known limitations (honest):**
- The shopfront is **flat vector silhouette art**, not painting. It reads as a lit room with a person and a bird in it, and it is cohesive with the b219 hearth band — but next to `dungeon.jpg` or the painted item icons it is clearly a different medium. A painted plate would beat it.
- The bounty panel still has a large empty area below the Unlocks row at desktop height. That is the screen having little content, not the board; inventing filler would be worse.
- The monster portraits on the notices are the painted PNGs desaturated and multiplied into the paper. It reads as a printed woodcut, which is the intent, but at 44px the detail is nearly gone; a purpose-drawn line portrait set would be better.
- `#panel-combat` still renders ~16 emoji (equipment-slot icons, `EQUIP_SLOT_META`). Out of this wave's region — flagged for Systems.

**Asset Director brief (non-blocking).**
1. **A shopkeeper NPC portrait.** `assets/icons-bundle/` ships exactly one human: `painted/npc/player.png`, which is the player's own avatar and would read as the player serving themselves. `_archive/reserve-art/monster-portraits/` (NOT shipped) holds painted human busts — `Duke_nb.png`, `Warrior_nb.png`, `ElfMage_nb.png`, `Cultist_nb.png` — in exactly the shipped painted style. `Duke_nb.png` is a strong merchant/keeper candidate. Promoting one (or commissioning a keeper in that style) would let the scene swap the SVG figure for real art.
2. **A painted shopfront plate, ~1600×200 (an 8:1 band):** dark timber interior, shelves of stock, one warm lantern as the only light, a counter running the full width with its top edge at ~82% height so the offers list continues it. Same treatment as `backgrounds/dungeon.jpg`. Drops straight into `SHOP_SCENE` as an `<img>`.
3. **A hen/chick icon** — `reserve-art/monster-portraits/Animals_*.png` are a dolphin, a falcon and others; there is no chicken anywhere in the library, shipped or archived. Tyler asked for one by name.
4. Still open from b219: painted dusk homestead plates per property tier.

### 2026-08-08 · Wave 1 — Home: no background, dead space (#6)

**Root cause of "no background".** `backdrop.js` (b158) has drawn a full-screen dusk scene since b158 — and it has never been visible on a single screen. `body` paints an opaque `--app-bg` and every `.panel` paints an opaque gradient on top of that, so `#hr-backdrop` (z-index 0, fixed) is fully occluded everywhere. Un-painting the shell would drag every other panel with it, so Home now composes a scene INTO the page instead of hoping to see one behind it.

**The hearth band.** The top of Home is a full-bleed dusk vista of the player's own holding (`HearthriseBackdrop.homesteadScene(tier)`, new in backdrop.js), with the identity block standing on it bottom-left and the day's ledger (XP / kills / harvest) in the dark right corner. Authored at **1600x300 — the band's own aspect**. My first cut was drawn at 1600x420 and sliced into a 5.6:1 strip: the whole ember horizon fell below the crop and all that survived was dark sky and a black ridge. Draw for the frame you have.

**Tier-aware, so the picture never lies.** camp → cottage (+barn/haystacks/windmill at farmstead) → hall + watchtower → castle with banner. Verified at tiers 0, 2 and 5 in the browser. Every colour is a `--scene-*` token in `theme-cozy.css` (dark + a golden-hour cozy-light set); SVG elements carry classes, nothing hardcoded.

**Things that read as "generated" and had to be fixed:** flat-fill glow ellipses render as hard-edged amber lozenges floating in the sky (→ radial gradients); concentric stacked smoke puffs read as bubbles (→ downwind drift + thinning); plain box+triangle buildings read as cardboard (→ lean-to, chimney cap, rim light on the sunward roof edge, lit tent flap standing on the ground rather than a lit rectangle inside the canvas).

**Type on a picture gets its own ink role.** `--scene-ink/-2/-3/--scene-gilt` stay light in BOTH themes, because the background of that type is the scene under a scrim, not the theme surface. Reading `--ink` there put cocoa text on a sunset in Cozy Day.

**Dead space.** Columns were 364 (left) / 490 (right) with ~200px of unexplained panel below. Now 580 / 561, no void, composed only from systems that already existed: **Your holding** (left — homestead tier, what it grants, next tier + its cost with shortfalls in red, door to House) and **The realm** (right — the daily + weekly world events, which change every skill's speed and were only ever stated in a one-line ticker pinned behind the chat button). "Today" moved out of the rail and onto the band as the ledger. Band height is `clamp(104px,24vh,204px)` — always ~a quarter of the screen, generous on a monitor, never eating a landscape phone's working area.

**Regression found and fixed (was live since b216).** `backdrop.js` carried Home-scoped overrides written when Home floated transparent cards over the global backdrop. At two IDs + an attribute they outranked home-dashboard's own CSS and silently undid the b217 pass: `.hd-card` got an opaque plate plus a 10px `backdrop-filter` (12 blurred layers per render, for a picture that is not behind them) and `.hd-mile-badge` lost its struck-metal disc to a flat 5% white — that is why the milestone/renown/daily badges read as grey pucks. Deleted; verified `backdropFilter` count 12 → 0 and the radial disc restored.

**Emoji.** Homestead tiers (⛺🏡🌾🏛️🏰👑) and world events (🔥🎪⛏🌾📜🌙🍲🕯⛰🥁🛠) both carry emoji in their data. Home maps every id onto the baked atlas (`HOLDING_GLYPH` / `EVENT_GLYPH`); 0 emoji in the Home DOM, verified by regex over `#hd-root`.

**Verified:** static server :8131, hearthlight default. Desktop 1400x900, 1000x820 (icon-rail), 900x760, 900x600, mobile-landscape 880x420, portrait 420x820. FTUE welcome modal + the 6-step tour + the daily-reward modal all overlay Home correctly. Cozy Day checked (legible, not broken). 0 console errors, no horizontal overflow. Smoke 177/177, 0 runtime errors; `bump-version.sh --check` OK.

**Known limitations / handoffs:**
- No regression test added — `src/features/smoke-test.js` was outside my allowed files this wave. **Systems/QA should add one**: Home renders `.hd-hearth` with an `.hrs-svg` child, `#hd-root` contains 0 emoji, and `.hd-mile-badge` keeps a `radial-gradient` background (that last one is the guard for the b216 override class of bug).
- The **global** `backdrop.js` `scene()` is still hardcoded hex and still 100% occluded on every screen. It should either be deleted or the shell should be made translucent deliberately — a decision, not a patch. Not mine to take alone.
- Beta-notice modal still renders literal emoji (🌱, 🐛) in its copy. Still Systems/content.

**Asset Director brief (non-blocking).** The band is CSS/SVG silhouette art because no painted homestead plate exists (`assets/icons-bundle/backgrounds/` holds only `dungeon.jpg`; `assets/bg/homestead-scene.svg` is bright golden-hour vector from the cozy era and is referenced nowhere). Wanted: **painted dusk homestead plates, ~1600x300 (a 5:1 band), one per property tier** (camp / cottage / farmstead / manor / keep / castle), matching `dungeon.jpg`'s treatment — warm desaturated CraftPix-adjacent painting, subject right of centre, left third readable-dark for the identity block, ember horizon, lit windows. They drop straight in behind the existing scrim by swapping `homesteadScene()`'s body for an `<img>`. Do NOT compose one from `assets/icons-bundle/buildings/*_nobg.png` — those are 3/4-isometric icons with baked ground patches; lined up on a horizon they read as stickers.

### 2026-08-08 · Wave 0 — type scale (#1) + brand wordmark (#2)
**#1 Text too small.** Root cause: ~700 font-size declarations hardcoded in px across `legacy.css` / `audit-overrides.css` / `art-direction.css` (base body was 14px), so a token-only bump would leave row titles/nav/chrome behind and break hierarchy. Fix: uniform proportional scale (~x1.13, rounded to 0.5px) applied mechanically to all reading/UI text in the 7-26px range across the three sheets (hero/celebration display >26px left alone), plus the 8-step `--t-*` token ramp raised to match (body 14->16). Ramp ratios preserved, so hierarchy is unchanged — only the base grew.

**#2 Logo.** The old mark was a light-background crest asset (`assets/brand/hearthrise-logo.svg`) whose dark-brown wordmark sat at near-zero contrast on the near-black hearthlight sidebar — that is why it "looked bad." Replaced the `<img>` with a real game-logo lockup: a compact inline-SVG rising-sun/hearth shield emblem drawn to read on dark, above "HEARTHRISE" in gilt Cinzel caps (ember->struck-gold gradient via background-clip, ember glow + dark contact edge) with a tracked "IDLE HOMESTEAD" SC tagline, on an incised rule. Vertical/centred because the sidebar is only 180px (a horizontal lockup clipped to "HEARTH"). Collapses to emblem-only in the <=1180px icon-rail. SVG file kept for the favicon.

**Verified:** preview on :8131, hearthlight. Screens inspected at desktop: home, character, inventory (+ overflow check: no document/button overflow), skills — all clearly legible, hierarchy intact. Smoke 175/175, 0 runtime errors; `bump-version.sh --check` OK.

**Limitation:** this browser env pins innerWidth at 1745px; `resize_window` had no effect, so mobile-landscape + icon-rail could not be screenshotted. Scaling was applied uniformly inside the mobile media queries so the ramp holds there, but QA should confirm on a real narrow viewport.

**Asset Director brief (non-blocking):** a bespoke drawn wordmark could beat pure type later — horizontal primary lockup + standalone crest emblem, gilt-on-dark SVG + light variant, sized for 180px sidebar / 64px rail / wide Steam capsule. Build on the rising-sun-over-hearth-shield emblem now in CSS.

**Also spotted (not mine to fix):** a beta-notice / welcome modal renders literal emoji (🌱, 🐛) in its copy — violates the 0-emoji-as-art rule. Owner is content/onboarding (Systems). Flagged to the Coordinator.

### 2026-08-08 · bootstrap
Domain seeded from project memory (`art-direction-system`, `design-review-standard`, `art-direction`). No active task. b217 art pass is live.
