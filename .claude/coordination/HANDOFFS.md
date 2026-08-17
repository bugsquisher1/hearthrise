# HANDOFFS

_The primary agent-to-agent teaching mechanism. When your work affects another specialist, write a handoff here. Append newest at top._

### 2026-08-17 · FROM Art Director (b368) → TO QA Engineer + every agent · **There is now a SIGNED-IN harness mode. If your surface changes when a player is signed in, a signed-out assertion proves nothing about it.**

`HearthriseIdentity._installHarnessIdentity({ name, avatar, userId })` / `._clearHarnessIdentity()`.
It fabricates the client-side state a signed-in player has — session object with a user id, claimed
display name, portrait as a local data URL — with **no real Supabase session and no network**.
Guarded by delegation to `HearthriseGate.isHarnessContext` (explicit global AND non-player origin,
fail-closed), so it is inert on hearthrise.net. See COMBAT-UI-22 for the usage pattern, including
proving the seam REFUSES before proving it works.

**Why this matters to you more than to me.** Until today every automated pass in this project played
as NOBODY — the gate's harness bypass lets the suite in without an account, so no signed-in-only
rendering path had ever been exercised. That is how a champion plate that ignores the player's chosen
avatar shipped, and why four of my own in-browser probes walked past it. **Please treat "does this
surface look different when signed in?" as a coverage question from now on**; if yes, the test needs
this seam.

**Two traps I already paid for.** (1) A simulated identity must adopt the user id as already-seen, or
identity's 2s tick fires three live Supabase reads that can only fail — two unhandled `Failed to
fetch`, which your clean-log guard correctly caught. The seam handles this; if you build a similar
seam elsewhere, expect it. (2) I asserted `isHarnessContext(win, 'hearthrise.net') === false` from my
test. It passed and turned the suite RED, because the gate answers that by design with a loud
`console.error`. **Re-asserting another module's rule from outside can trip that module's own alarm** —
assert it once, in the file that owns it.

**What I could NOT cover, and it is yours to escalate:** the real RPCs — name claim, avatar upload,
profile reconcile, anything checking a genuine `auth.uid()`. That needs a dedicated test account in
the project's own Supabase. Filed in DISCOVERIES as a Tyler decision.

### 2026-08-16 · FROM Art Director (b368) → TO Systems Engineer · **legacy.js's `setupArenaVs()` is an unacknowledged second author of the Fight stage — I patched the symptom, the ownership is yours**

Three player-reported defects this pass (vanished swing bar, missing management/action rows,
completely empty preview stage) were one bug: `setupArenaVs()` builds a pre-b365 `.arena-vs` into
`#panel-combat .combat-arena` from a 200ms interval, and on a **cold load into a running fight** it
beats `setupCombatScreens()` to the arena. `buildStage()` treated "an `.arena-vs` exists" as "my work
is done" and stood down permanently. Then `refreshArenaVs()` parks inline `display:none` on that
element whenever no fight is live, and the rule that un-hides the stage in preview is scoped
`.arena-vs.fs-stage` — so the preview went completely blank. Tyler's screenshot reproduced exactly.

**What I changed (mine, and it holds):** `buildStage` now tests for the `fs-stage` CLASS rather than
the element, REPLACES a legacy stage instead of deferring to it (so the shared ids —
`arena-player-hp`, `arena-foe-portrait`, … — are never duplicated), and `ensureStage()` re-asserts on
every render so a later rebuild self-heals. Guarded by COMBAT-UI-19c; its mutation also fails
COMBAT-UI-13 and COMBAT-UI-21.

**What is yours, and why I did not do it:** deleting or gating `setupArenaVs`'s builder is an engine
change to a 17k-line file with several other wrappers around the same nodes, and doing it inside a
visual defect fix would bury it. Right now my module wins the race by re-asserting every 200ms, which
is a patch, not an ownership statement — and the reclaimed stage stays visible only because b365's
`[data-combat-view="fight"] .arena-vs.fs-stage` rule carries `!important` that outranks legacy's
inline `display:none`. Two authors, one region, resolved by specificity. Please make it one author.

Also FYI on your surface: `src/net/accrue.js` does **not** persist the accrual halt (no localStorage,
no snapshot field) — the field report that looked like persistence was the SHEET outliving the
outage, because `hideAccrualHaltedSheet` had exactly one caller. Fixed with a self-retraction in
`settle()` plus `verifyHaltedState()` on the foreground edge; HALT-BOOT-1 covers both directions.

### 2026-08-16 · FROM Art Director (b366) → TO Systems Engineer · **Two overlaps with your in-flight equip work, and a worktree hazard neither of us chose**

**1 · WE BOTH WROTE A SLOT-EXPANSION TABLE TODAY.** Your uncommitted `src/data/gathering.js` adds
`SLOT_EXPANSION` / `expandItemSlot()` (`ring -> ring1|ring2`) as the single home for authored-slot to
player-slot. My Fight-screen slot picker needs the REVERSE question ("what could go in THIS slot?")
and answers it with a local `slotsForItem()` in `combat-screens.js`, which also maps
`head->helmet, legs->pants, hands->gloves, feet->boots` — mappings your table does not carry because
`getPreferredSlot()` in legacy.js owns them. **That is two-and-a-half copies of one fact.** I did not
call `expandItemSlot()` because it would have been wrong for four of the twelve slots, and I did not
extend it because the equip INTENT is yours and mid-flight. **Proposal: your table absorbs the legacy
aliases and both my picker and `getPreferredSlot()` become callers.** Your call, your file.

**2 · THE FIGHT SCREEN NOW EQUIPS.** `openSlotPicker()` calls `window.equipItem()` / `window.unequip()`
from a live fight — a path that previously only ran from the Inventory screen. When the equip intent
goes server-authoritative this is a second call site, and it fires *while a combat activity pointer is
set*. Worth a thought in your envelope design; the b363 equip-dupe hotfix is why I am flagging it
rather than assuming it is inert.

**3 · WORKTREE HAZARD (no blame, just facts).** We are both writing in the SAME checkout: I found
`src/data/gathering.js`, `supabase/functions/hr-accrue/*`, `src/net/equip.js`, `tools/*` and ~190 new
lines of EQUIP-* tests in `smoke-test.js` changing under me mid-pass, and the branch moved from
`settlement-phase2` to `fight-screen-density` when I branched. My commit `fbf2716` contains ONLY my
four files (I applied my smoke-test hunk to the index by patch rather than staging the file), so your
work is untouched and still uncommitted in the tree. **The Edge payload guard is red and it is yours,
not mine** — proved by stashing my four files and re-packing: identical payload hash `395e3af1...`
either way.

---

### 2026-08-16 (b361 brand session) — FROM Coordinator (brand/logo session) → TO the OTHER active session · **Ship the Hearthrise rebrand + avatar picker as b361. Two branches READY, both verified green, NOT pushed — you own the assembled visual gate + the push.**

Tyler asked me to hand today's work to you to take live. Everything below is READY and mergeable; **nothing is on `main` yet and nothing is pushed.** Two feature branches + one art handoff + backlog updates.

**1 · TWO BRANCHES TO INTEGRATE (either order — independent features):**
- **Brand rebrand** — branch `worktree-agent-a8761ff99aed27a3f`, commit **`70e8cdf`**. Smoke **767/767**. Shield+wordmark lockup (sidebar/login/favicon), dawn login-splash bg, favicon+apple-touch from the crest, **"Idle Homestead" dropped — game is now just "Hearthrise"**, and deduped login-gate copy. Touches: `index.html`, `src/styles/art-direction.css`, `src/legacy.js` (manifest name/icons), `src/net/account-gate.js`, `src/features/smoke-test.js` (append + 3 lines inside the b224 wall test), new `assets/brand/hearthrise-{crest,mark,wordmark,splash,badge}.*`, `tools/brand-process.mjs`; **deleted** `assets/brand/hearthrise-logo.svg`.
- **Prefab avatar picker** — branch `worktree-agent-a1092c5052fa1bf61`, commit **`ca700f5`**. Smoke **778/778 ×3**. 10 selectable portraits + upload, `player.png` retired as default (→ neutral placeholder), avatar watermarks stripped, prefab picks sync cross-device via the existing pipeline. Touches: `src/features/identity.js`, `src/features/home-dashboard.js` (1 line), `index.html` (1-line topbar `src`), `src/features/smoke-test.js` (append + b186/b221/b229 updates), `.gitignore`, 11 new `assets/avatars/*.webp`.

**2 · MERGE NOTES / overlaps (small, non-semantic):** both touch `index.html` (one-liners each) and `smoke-test.js` (both append + insert just before the final `];` — resolve as two independent array entries). No `legacy.js` collision between them.

**3 · ⚠️ RELEASE VISUAL GATE — MANDATORY before you push (per CLAUDE.md, Tyler NON-NEGOTIABLE).** These two branches were each verified ALONE. The gate exists precisely because breaks emerge from the *interaction* of individually-green branches — and this pair is high-risk for exactly that: the avatar picker introduces 256px portraits and the brand branch restyles the topbar/character chrome. **Boot the ASSEMBLED main (both merged), and READ screenshots of: the login gate, the sidebar, the Character screen (avatar picker + hero portrait), the topbar portrait, plus Combat and Inventory (densest) — at desktop AND mobile-landscape 922×423.** Measurements/smoke do not satisfy this gate; eyes on the assembled build do.

**4 · VERSION + PUSH:** run `bump-version.sh 361` ONCE after both are folded in (do NOT bump per-branch). Then CHANGELOG + build-info date by hand. Push is yours to time.

**5 · OPEN DECISION for Tyler (fold into b361):** the login wordmark currently shows the tagline **"An Online Realm."** Tyler was undecided keep-vs-drop and never confirmed — confirm with him before push; dropping it is a one-line change in `account-gate.js`.

**6 · ART HANDOFF (you own the item pipeline):** the AI-GENERATED watermark spot-check found **all 74 monsters clean**, but **28 item icons carried the pill**. 26 are re-exported CLEAN (id-named 1024² sources) in **`assets/_wm-fixed-item-sources/`** (gitignored) — **run your trim/resize on those 26 and replace the watermarked icons in `hearthfire/items/`.** The remaining 2 (`dragon_scale`, `riftmaw_husk`) aren't in the Recraft items project → backlog #31, deferred by Tyler. Full detail in DISCOVERIES.

---

### 2026-08-16 (b362) — FROM Art Director → TO Coordinator + Asset Director · **Tyler's hand-made wave is wired: 428 → 473 of 512, for $0.00. The worklist is 20, and FIVE of the ids you should re-shoot are ones that already SHIPPED**

Supersedes the counts below (65 → **20**). No API spend of any kind; the four flattened exports were
matted locally. Suite 775/775 ×3, 0 404s, 0 console errors, screenshots in
`assets/art-pilot/_screenshots/wave2/`. No version bump, no push.

1. **`src/data/item-art.js` is still the worklist and it is still data.** `REJECTED_WRONG_SUBJECT` is
   now **20**. `UNRESOLVED_FILES` is unchanged except that **`deathsteel_ingot` finally resolved — the
   live id is `death_steel`** — which is worth knowing because the other 26 entries are the same kind
   of near-miss and are still an Asset Director RENAME job, not a generation job. This wave delivered
   good art for seven of them (`blight_arrows`, `frost_arrows`, `chitinweave_chaps`,
   `chitinweave_helm`, `masons_rule_t4`, `masons_rule_t7`, `watchknight_sabatons`): the pictures are
   correct and there is simply no id to hang them on. **Resolve those seven names and seven icons
   land with no further art work at all** — the raws are in `assets/art-pilot/wave2-raw/`.
2. **FIVE ALREADY-WIRED ICONS ARE WRONG and are the top of the re-shoot list** — `oak_plank`,
   `duskwood_plank`, `runewood_plank` (all round shields), `bronze_bar` (a hammer on an anvil),
   `copper_bar` (a sphere). Full detail + how they were found in DISCOVERIES b362. They shipped in
   b358/b361 and nothing re-reviews a shipped id. Please fold them into the next shoot.
3. **The staff/rod class is HALF solved and the half that failed failed the same way as always.**
   4 of 6 fishing rods and 4 of 7 staves are now correct — the rods Tyler redid by hand in the web UI
   are the best in the programme. `apprentice_staff`, `maple_staff` and `oak_staff` came back as the
   identical **short fat baton** b361 documented, and `maple_rod` as a solid cone. **b361's ruling
   stands: do not re-word that class a fifth time.** But note what DID work — Tyler typing a plain
   correction at the image ("way too thick to be a fishing rod", "give me this exact pole but in a
   duskwood shade") produced the four best rods in two years of this programme. **Iterative correction
   in the web UI beat every prompt-engineering round.** That is the technique to repeat.
4. **`assets/items/` is 51 MB of source raws tracked at the deploy root** (DISCOVERIES b362 item 3).
   Coordinator: worth an ignore or a move before the next release.
5. **10 refusals with a one-line reason each are in `tools/art-wave2-select.mjs` `REFUSED`** — code,
   not prose, so the next shoot can import them. The two that need a design steer rather than a
   re-roll: `widows_fang` came back as a broad crescent sickle with an eyeball boss (the brief says
   "slim dagger" — the sickle is honestly the more interesting object, so **Game Designer/Asset
   Director may prefer to change the ITEM rather than the art**), and `rune_needle` is a runed sword,
   which suggests the model cannot hold "needle" at heroic proportions at all.

### 2026-08-16 (b361) — FROM Art Director → TO Coordinator + Asset Director · **the re-roll is done; the worklist is 65, and one blocker is Tyler-only**

Supersedes the counts in the handoff below (107 → **65**). 428 of 512 item icons are now wired.

1. **THE RECRAFT API ACCOUNT IS OUT OF CREDITS.** The batch stopped at 57 of 66 with
   `HTTP 400 not_enough_credits`; the 9 refusals were not charged. **Only Tyler can clear this** — API
   units are purchased separately from the web subscription. Nine ids are unfunded rather than failed
   and will generate as-is the moment credits exist:
   `items/{rubble,granite,granite_block,basalt_block,deep_rune_blank,vaultstone,heartwood_cape,mithril_whetstone}`,
   `food/ratters_bait`. Manifest + palettes are already assembled and cap-clean.
2. **`src/data/item-art.js` is still the worklist and it is still data, not prose.**
   `REJECTED_WRONG_SUBJECT` is 65; `UNRESOLVED_FILES` (27, filenames that resolve to no live id) is
   **unchanged and is an Asset Director rename job, not a generation job** — 9 of them sit in both
   lists and I deliberately spent nothing on them.
3. **Do NOT re-roll staves or fishing rods** (16 ids). Two funded probes proved this is a model limit,
   not a prompt defect — full ruling in `art-direction-picker.md` §0.10d. A fifth re-wording round is
   the failure mode to avoid here.
4. **The prompt sheet is fixed for all 65 anyway.** Every remaining rejected line has been rewritten
   with per-word disambiguation, and `gen-art-colors.mjs --report` is green over all 512 (100% palette
   coverage, max 987/1000 chars). Whoever funds the next batch does not need to write a line.
5. **New raws are preserved at `assets/art-pilot/b361/` and `probe{,2}-b361/` in the main checkout**
   (non-destructive — the originals the previous pass judged are untouched in `batch-items/`).
### 2026-08-16 — FROM Art Director → TO Asset Director · **7 monster portraits owed; and the legacy 30 are now the worst-looking art in the game**

**1. FOUR WAVE-1 REJECTS, worklisted in code.** `src/data/monster-art.js` exports
`WAVE1_REJECTED` with a one-line regeneration brief each, and the smoke suite fails if any of them is
ever both withheld and shipped (or lands on disk at all). All four keep their glyph fallback today.

| id | why | what the re-roll must fix |
|---|---|---|
| `cyclops` | **has two eyes** | the subject line says "a heavy jutting brow over a SINGLE wide eye" — this is a one-word failure and should re-roll cleanly |
| `void_mote` | a heavy goggled humanoid in a headscarf | the subject is "a small hovering hole in the world with a faint prismatic rim" — the humanoid ban is being ignored; describe the SHAPE, not the concept |
| `elder_cinder` | no coals, no ash, no core glow — a plain grey brute | side by side it is indistinguishable from `ogre`, `rock_troll` and `mountain_troll`, all shipped. The palette clause is not landing on a neutral-material subject — the same defect the b357 SUFFIX ruling names |
| `ooze` | the floating eyes and mouth are absent and it sits on a humanoid torso | reads as a diseased man at 36px. It needs to be a FREESTANDING blob — no shoulders, no neck |

**2. THREE MONSTERS WERE NEVER DELIVERED AT ALL:** `jackal`, `air_elemental`, `wyrmling`. They are not
in the wave folder. Subject lines exist in `docs/design/monster-session-pack.txt`.

**3. `alts/locust_swarm__alt1` is unshippable and should not be retried as-is** — it has a painted sky
backdrop, and `art-wave-matte.mjs` refuses it outright ("no light neutral key on the border ring").
The PRIMARY `locust_swarm` is fine and is shipped; nothing is owed here, this is just a note so nobody
tries to rescue the alt.

**4. THE BIG ONE — the mixed shelf is now the most visible art problem in Hearthrise, and I have
photographs.** 74 hearthfire portraits now sit beside **30 legacy `painted/` ones**, and the game puts
them side by side on its two most-looked-at surfaces:
- the **bestiary grid**, where `Slime`, `Field Rat`, `Goblin`, `Small Wolf` and `Weak Skeleton` are
  flat bright cartoon vectors in the same 36px row as the painted `Barn Rat`, `Hive Wasp`, `Wild Boar`,
  `Mandrake` and `Kobold`;
- the **combat screen's two boss cards**, where `War King` (legacy, teal-green airbrush) renders at
  ~280px directly beside `The Unlit` (wave 1) at the same size.

Before this wave the mix was 5-vs-30 and easy to excuse. It is now 74-vs-30, and the 30 read as
placeholder art. `LEGACY_ART_IDS` in `monster-art.js` is the exact list and the migration is one line
per delivery. **This is the highest-value art request in the queue and it did not exist as an
argument until the wave landed.** Evidence: `assets/art-pilot/_screenshots/monsters-wave1/08-bestiary.png`
and `07-combat-screen-fighting.png`.

**5. Two pipeline notes so you do not re-derive them.** Flattened deliveries do NOT need paid
background removal — run `tools/art-bg-probe.mjs`, then `tools/art-wave-matte.mjs` (see DISCOVERIES).
And the shipped monster spec is confirmed **256x256 SQUARE, PNG colour-type 6, subject contained and
centred** — matching the wave-0 pilot exactly; `art-wave-matte.mjs --px 256` produces it.

**6. Bundle size, unresolved and inherited.** `assets/icons-bundle/hearthfire/monsters/` is now 74
PNG-24 files at ~112 KB mean. Palette quantisation would cut that substantially and there is still no
optimiser in the toolchain. Same open item my b358 handoff raised for the item set; it is an
asset-pipeline job, not an art-direction one.

---
### 2026-08-16 (b361) — FROM Art Director → TO Coordinator + Asset Director · **the rebrand is wired; two things are owed and one folder is now generated**

Branch `agent-a8761ff99aed27a3f` (worktree). Suite **767/767**, no version bump, not merged.

1. **`assets/brand/**` IS GENERATED. Never hand-edit it.** `tools/brand-process.mjs` derives all five
   files from Tyler's four approved exports, which now live at `assets/art-pilot/brand-src/`
   (gitignored, like the rest of art-pilot). Re-run the tool; do not touch the output. Three of the
   pipeline's steps exist because of a defect I could only see by RENDERING the output — the crest's
   flat matte, the wordmark's four plate-coloured counters, and a mask region that silently blanked
   the whole wordmark. All three are documented in the tool header.
2. **OWED, and it is small: a simplified crest for 16px.** The heraldic crest is legible down to
   ~32px and becomes a warm smudge at 16 — the browser tab. Tyler mentioned he has a simpler shield
   variant. **What it needs to be:** the shield outline + the sun dome + the flame, scrollwork and
   finial DELETED, stroke weights roughly doubled. Ship it as `assets/brand/hearthrise-mark-32.png`
   (or an SVG) and add a second `<link rel="icon" sizes="32x32">` in index.html — the 512 mark stays
   for the PWA. Evidence: `assets/art-pilot/_screenshots/brand/favicon.png` (a nearest-neighbour
   blow-up of the true 16 and 32 rasters, so the muddiness is measured, not asserted).
3. **The two PNGs are unoptimised PNG-24 (178 KB + 273 KB).** Same standing limitation the b358 item
   batch has: there is no palette quantiser in this toolchain. I cut what I could without one — the
   crest is 384 long-edge because its largest render site anywhere is 104 CSS px (DPR 3 = 312), which
   saved 93 KB for zero visible change at 6× magnification. An optimiser is an asset-pipeline job.
4. **`assets/brand/hearthrise-badge.svg` is wired to nothing.** The hearth roundel, cleaned and
   metadata-stripped, sitting there for a loading / welcome-back surface. Wiring it is a deliberate
   design decision, not a chore — do not add it just because it exists.
5. **For the Coordinator, at integration:** the merge surface is deliberately narrow — one block in
   `index.html`, §30 of `art-direction.css`, two constants + the manifest icons in `legacy.js`, the
   gate's stylesheet + lockup in `account-gate.js`, and an appended block in `smoke-test.js` plus
   **three edited assertion lines in the existing b224 test** (that one is not appended and will
   conflict if another branch touched it — the wall's lockup is no longer type + inline SVG, so the
   old assertions could not survive).

### 2026-08-16 — FROM Art Director → TO Asset Director · **134 item files to re-generate or rename, itemised in code**

I wired 386 of the delivered 512 item icons. The other 126 are held back and **the worklist is data, not
prose** — `src/data/item-art.js` exports three frozen lists, and the smoke suite fails if any of them
is ever also shipped:

1. **`REJECTED_WRONG_SUBJECT` — 107 files, `category/id`.** These depict the wrong object. I judged
   every one on a contact sheet at render size against `docs/design/item-art-prompts.md`. The failures
   cluster: **staffs, rods, arrows, needles, cloaks/mantles/capes and whetstones** come back as swords,
   axes and hammers, and a few `_body`/`_pants` come back as a round shield. Eight are **humanoid
   figures** (`potato`, `gold_ore`, `granite`, `troll_hide`, `basalt_block`, `shadowsilk_cape`,
   `maple_plank`, `warlock_body`) and nine are **out-of-world objects** — a pool 8-ball, a chessboard,
   a dartboard, dice, poker chips, a tank. Those two groups violate the shared prompt suffix's hard
   bans, so re-running the same prompt is unlikely to fix them; the noun classes above need their
   **silhouette described** rather than just named.
2. **`UNRESOLVED_FILES` — 27 files whose name is not a live `ITEMS` key.** These are the prompt sheet's
   speculative Review-Book ids. **I did not guess them into place** and I recommend you don't either
   without the Designer: `chitinweave_*`→`chitin_*` and `watchknight_cuirass`→`watchknight_body` are
   near-certain, but `fletchers_knife_t1|t4|t7` against `bone_|steel_|dawn_fletching_knife` and
   `masons_rule_t1|t4|t7` against `bronze_|steel_|dawn_masons_rule` are a **tier-order guess**, and
   `blight_*`→`*_of_poison` is a rename decision, not a fact. Renaming these 27 is the cheapest 27
   icons in the programme — no generation cost at all.
3. **`REGENERATE_DESPITE_SHIPPING` — `items/iron_ore`.** Still the pilot's export, still weak (my
   predecessor: "reads as raw meat"), kept only so this pass caused no regression. The batch's
   replacement is a hammer.

Two things that will save you time. **`tools/art-batch-process.mjs`** is the processor to use — the
pilot's version's bbox crop does not fire on these exports (see DISCOVERIES). **`tools/art-contact-sheet.mjs`**
is how you review a delivery: `node tools/art-contact-sheet.mjs <dir> <out.png> --from 0 --count 48`.
Deliver at **1024² into `assets/art-pilot/batch-items/<category>/<id>.png`**; adding an id to `SHIPPED`
in `item-art.js` and dropping the processed 128 px file in the matching `hearthfire/` folder is the
whole wiring, one line per delivery, and the suite reconciles it against the filesystem both ways.

### 2026-08-16 — FROM Art Director → TO Game Designer · **`elderscale_heart` and the 27 unresolved ids need a ruling**

The batch delivered art under 27 filenames that are not live `ITEMS` keys (listed as
`UNRESOLVED_FILES` in `src/data/item-art.js`). Most are obvious renames, but three need a decision
that is yours, not mine: whether `fletchers_knife_t1/t4/t7` map to `bone_/steel_/dawn_fletching_knife`
in that tier order, the same for `masons_rule_t1/t4/t7`, and whether `blight` and `poison` are the
same thing in the item vocabulary (`rune_of_blight` vs the live `rune_of_poison`). Cheap to answer,
and it converts 27 already-paid-for images into shipped art with no generation cost.

### 2026-08-16 — FROM Art Director → TO Game Designer · **I need ONE colour table, and it unblocks 512 icons**

`docs/design/art-direction-picker.md` §0.10c: the item batch is now a **conditional GO**, and the single
remaining blocker is yours, not mine. Recraft only honours a named colour if it is sent as
`controls.colors` RGB triples — prompt words are ignored, proven across 27 generations.

**What I need:** a **colour-name → RGB table** covering the ~40 colour names already used in
`item-art-prompts.md` (*char black, ash grey, ruddy bronze, cold grey, silver-blue, tanned tan,
rust-brown, golden crust, snow white, pale ice blue, raw madder-red, …*). Then 512 palettes are
**derived** from the subject lines you already wrote — 2–4 triples each, most-dominant first — instead
of hand-authored 512 times. Please put it in the sheet as data (a table), not prose, so
`gen-art.mjs --colors` can be fed from it mechanically.

**Two subject-line notes, both from opened files, neither a wrapper problem:**
1. `iron_ore` still generates as a **sphere**, not "a rough chunk", and at 48 px it currently resembles
   `wheat_bread` — a real silhouette collision (§0.9a failure mode 1) between an ore and a loaf.
   The line needs faceting/angularity language, not a colour fix; its colour is now correct.
2. The **two-headed Hellhound came back single-headed in 7/7 generations** across every configuration.
   Recraft does not reliably render "two-headed". Either the line leads with the count much harder or
   the monster's identity should not depend on it.

### 2026-08-16 — FROM Art Director → TO QA Engineer / Systems Engineer · pre-existing smoke failure, not mine

`node tests/run-smoke.mjs` on my branch: **761/762, 0 runtime errors**, one failure —
`✗ B349-1: Kitchen 5 cookSpeed is 0.11, expected 0.10 — the rung's bk half is not reaching getBonus`.
My change surface is `docs/design/art-direction-picker.md` and `tools/gen-art.mjs`; `gen-art.mjs` is
not referenced anywhere in `tests/`, `src/` or `index.html` (grepped), so it cannot be in the browser
test graph. Recording it here rather than silently passing it by — it wants an owner.

### 2026-08-16 — FROM Art Director → TO Coordinator / Asset Director · **HOLD THE BATCH. NO-GO, both of them.**
> **UPDATE 2026-08-16 (§0.10c):** partially lifted. **Items are a conditional GO** under the colour
> anchor `96fc6650-…` **plus `controls.colors`**; **monsters remain NO-GO** and should be generated by
> hand in the Recraft web UI. Everything below still stands as the reason the batch was stopped.

**Do not fire the 85-monster batch or the 512-item batch.** Full ruling and evidence:
`docs/design/art-direction-picker.md` **§0.10b**. Short version, from looking at 16 real generations:

- **The anchor-reversal finding is REVERSED BACK.** The "un-anchored is better" result came from
  `gen-art.mjs` sending no style at all, which makes Recraft default to **`realistic_image`** — those
  files are photographs, app-store tiles and a badge with a forest in it. The good warm% scores were
  the *backdrop*. There was no control in that comparison. **The tool now refuses to run with neither
  `--style` nor `--style-id`** (verified, exit 2), and `--style`/`--substyle` were added.
- **The named-colour suppression is NOT the SUFFIX.** Isolated under a fixed style, old and new
  suffix both produced vivid ember markings. **The SUFFIX is unchanged — I cut a replacement, measured
  it to 383/393 chars, and then binned it because the evidence said it fixes nothing.**
- **It IS the custom anchors.** They transfer palette, not just hand: the same anchored Hellhound
  prompt gave white-and-ice-blue on one run and a black-and-tan rottweiler on the next; the item
  anchor paints cold iron **salmon pink**. 4/4 monsters also lost their subject's structure.
- **Do not "fix" this by dropping the anchor** — anchored output is the only output that respects
  "no backdrop / ground / frame / text". Un-anchored, one item came back as a **parchment infographic
  with gibberish labels.**

**The unblock is (a) rebuild both anchors with many more, palette-spread seeds, or (b) if Recraft caps
seeds at 5, seed them palette-NEUTRAL and put the hand words back in the wrapper — which means finding
~150 characters under the 1000 cap.** Verify on Hellhound + Winter Wolf + an elemental; that is under
$0.20. **Real root cause: the only configuration that ever produced correct art is the WEB UI at
1141–1665 chars, and the API rejects anything over 1000.** ~$0.40 spent proving this; a GO would have
burned ~$25–30 and a reviewer's day.

### 2026-08-16 — FROM Art Director → TO Asset Director / whoever fires the ~600-image batch (b357 + the ratified Hearthfire wrapper)

**1 · The monster framing rule CHANGED. Do not use the old one.** Creature portraits are no longer
masked by a circle (b357: square plate + `object-fit: contain`, at every surface). The "eyes inside
the middle 70%" instruction is **retired** — the subject may now use the **whole square, corners
included**, which is ~21% more usable frame and is why an antlered boss finally fits. What replaces
it is a hard **no-clipping** rule: `contain` shows the file's true edge, so an antler tip touching
the canvas is a permanent defect nothing downstream can repair. `monster-art-prompts.md`'s
output-spec table is updated; `art-direction-picker.md` §0.4 is the prefix to use.

**2 · The production wrapper is `art-direction-picker.md` §0 and nothing else.** Three prefixes,
three conditional clauses, one shared suffix, an assembly table by category. Both prompt sheets now
point at it. Every clause is annotated with the specific failure it prevents — please do not add one
without that.

**3 · Run the QC gate before wiring anything:**
`node tools/qc-art.mjs <out-dir> --snap --neutral <ids.txt>` — six automatable checks, zero API cost,
exits non-zero. It also applies the alpha snap, which is a **pipeline** fix for the translucency
finding (no prompt clause can affect a matting artefact). On the 13-image pilot it independently
caught exactly the two known defects: `iron_ore`'s neutral-material failure, and `oak_log.png` being
**byte-identical** to `bronze_sword.png` — a silent duplicate download.

**4 · Game Designer: the Hellhound test you asked for was never really run.** The delivered monster
pilots have **painted opaque backdrops** rather than transparent ones, so "do the pale frost-cracks
survive a golden key light on a char-black body" was not honestly put. Inside b357's framed plate
they read fine, but the spec says transparent and the suffix now bans "backdrop wash / vignette" in
as many words. **Re-check the frost-cracks on the re-run** before trusting the two-signal grammar at
scale. C-SIGNAL (§0.7) is the wrapper's enforcement of your §0.1 — it restates and overrides nothing.

**5 · Merged with the pilot wiring (main `ab36938`).** b357 sits on top of `HEARTHFIRE_ITEM_ICON` / `HEARTHFIRE_MONSTER_ICON`, not around them. My review shots predate that merge and injected `window._monsterIcon` at runtime, so the mask is verified and the *wiring* is verified, but not yet in the same run.

### 2026-08-16 — FROM Art Director → TO Asset Director (Hearthfire pilot: one bad file + two spec amendments before the full run)

**Blocking, one file.** `assets/art-pilot/hearthfire/items/oak_log.png` is a **byte-for-byte duplicate of
`weapons/bronze_sword.png`** (md5 `807eea02c0963e92643ba68859891b8e` on both). It is a sword, not a log.
I withheld it rather than wire it — this repo has shipped a boar named `bear.png`. **Needs a re-export.**
Before the 426-file run, put a **duplicate-hash gate** in the batch QC: a cross-category duplicate passes
every filename, dimension and alpha check there is.

**Two identity/legibility calls that are mine, not defects in your process:**
1. **`iron_ore` does not read as iron ore.** At the 40–64 px it actually renders, the polychrome
   red/violet/cream faceting reads as raw meat or a gemstone. The metal ladder in `item-art-prompts.md`
   §1 says iron is *"plain dark grey iron, honest and unadorned, faint rust at the edges"* — the export
   is not that. It is the only one of the 12 whose subject is unreadable in-game. Re-prompt with the
   ladder words and far less hue variety.
2. **`elk_king` is clipped by the arena's circular mask** — see DISCOVERIES #3. Not a fault in the
   image (it is the strongest of the five monsters), but the spec needs amending before the roster run:
   the readable silhouette must fit the **inscribed circle** of the 256 square, not the square.

**Pipeline you can reuse as-is:** `tools/art-pilot-process.mjs` (alpha-normalise → alpha-bbox crop →
downscale → verify the written PNG's IHDR). Needs only Playwright, which is already a devDependency.
Raws stay in `assets/art-pilot/` which I added to `.gitignore`; shipping copies go to
`assets/icons-bundle/hearthfire/`.
### 2026-08-17 — FROM Game Designer → TO Coordinator, Systems, Security, Art/Asset Director, Fletching (b357 — Runecrafting + Stonemason are playable; the shared ammo primitive exists and is NOT yet wired into the fight)

Worktree `agent-a2bb233eab00fdee4`. Smoke **745/745, 0 runtime errors, three consecutive runs.** No version bump, nothing deployed, no migration applied. New files: `src/core/ammo.js`, `src/data/stonecraft.js`, `supabase/migrations/2026-08-17-leaderboard-skills.sql`.

**1. TO WHOEVER BUILDS FLETCHING — THE PRIMITIVE IS BUILT, AND THE ONE THING LEFT IS THE EXPENSIVE ONE.** `src/core/ammo.js` owns the whole of R1-R5 as pure functions: `ammoPerShot`, `consumablesPerHour`, `hoursOfSupply`, `dryAtMs`, the deterministic `advanceAmmoCarry` (the `advanceToolCarry` twin, `+1e-9` and all), `ammoDamageMult` (the ×0.25 fail-soft), `readAmmo` and `spendForSwings`. Published on `HearthriseCore.ammo`. **`combat-sim.js` does NOT call it** — that is design-doc E1, it touches the file that is vendored byte-for-byte into `hr-accrue` under a SHA-pinned payload with the `AWAY-1` parity contract on it, and landing content and an engine re-pin together means a parity failure has two candidate causes. Import it; do not write a second copy. **No player-facing copy may say ammo is spent until E1 lands.**

**2. TO FLETCHING SPECIFICALLY — YOUR BATCH SIZES ARE WRONG AND MINE SHOW THE FIX.** Security routed the over-clamp `fletch_*` yields to this desk as a design defect. Every rung I shipped sits under 60% of `c_max_item_delta` at the 15h reachable cap (worst: 54.4%, `deepbind_earth`), so neither skill joins `AMMO_CLAMP_BASELINE`. Adopt the same sizing and the seven `fletch_*` ids come OFF the amnesty list — property (3) of that baseline already reports a stale exception, so it will tell you when you have. Formula and the full design argument are in the header of `src/data/stonecraft.js`; see also the P1 DISCOVERIES entry.

**3. TO THE COORDINATOR — ONE MIGRATION IS STAGED AND MUST BE APPLIED WITH THE DEPLOY, OR TWO BOARDS ARE EMPTY.** `2026-08-17-leaderboard-skills.sql` adds the two skills to `public.hr_lb_skills()`, the CLOSED board namespace. It is in `tests/schema-apply-order.json` under "order" with a note. **Unapplied it is honest, not broken** — `hr_leaderboard('skill:stonemason')` returns an empty board, which on a brand-new skill on wipe day is indistinguishable from the truth. Two generated files also changed and are staged, not applied: `2026-08-11-catalogue.generated.sql` (450 items, 373 activities) and `2026-08-16-unlock-offers.generated.sql` (ashlar entered three property-tier prices, which `hr_unlock_buy` charges out of). **The Edge payload guard is RED and correctly so:** `src/core` and `src/data` changed, so `hr-accrue` needs a repack + redeploy.

**4. TO SYSTEMS — I RULED ON §8.4 AND IT DELIBERATELY AVOIDS YOUR ENGINE.** Stone comes from an input-free **Quarry lane** in Stonemason (P2), not from a mining by-product (P1, the doc's recommendation). The deciding reason is yours: P1 edits `resolveGatherAction`, which is vendored into `hr-accrue`; P2 is legal server-side today because `artisan` is a PAYABLE_KIND and `recipeInputs({})` already works. Both benches are **server-payable** — asserted by name in `tests/artisan-accrual.mjs` T6a-2, not left to the "unlisted benches pay" default. Neither can reach a value-destroying bonus key (`noBurn` is `skillId === 'cooking'`; `craftSave` is `'crafting'`). I also collapsed **five hand-written copies** of the `{cooking:'cookSpeed', …}` speed map onto one `window.speedKeyFor` — the fallback is `gatherSpeed`, so an unwired bench does not fail absent, it runs at the *Garden's* rate.

**5. TO SECURITY — ONE FAUCET, PRICED, WITH A GUARD.** The Quarry lane mints from nothing, so all three stones are `raw: true` (vendor bids 20%) and a smoke guard asserts that **every input-free artisan output is flagged raw**, derived from the recipe table — items.js cannot import recipes.js, so the flag list there is by hand and this is what stops a future quarry rung slipping past it. Every recipe was checked against the anti-faucet rule (`batch × v ≤ ~2 × input value`); worst is 1.96×.

**6. TO ART / ASSET DIRECTOR — the two P2 gaps in DISCOVERIES are yours:** no skill medallion for either new skill (blank space in the rail), and 24 new items with no icon, so all 11 rune tiles draw one chest glyph and all 7 whetstone tiles one sparkle. Mechanics are done and verified in-browser; this is what stands between shipping it and shipping it well.

### 2026-08-16 — FROM Art Director → TO Coordinator, Systems Engineer, Security, QA (b356 — the UNKNOWN-balance blocker is cleared; the flip is a one-line change now)

Worktree `agent-aa23f5924255d1d3d`. Smoke **732 → 734/734, 0 runtime errors, three consecutive runs.** `bump-version.sh --check` OK. **No version bump, nothing deployed, `supabase/**` untouched.** New file: `src/net/balance.js`.

**1. TO THE COORDINATOR / WHOEVER OWNS THE FLIP COMMIT — deferred item (2) is DONE, and item (5) is now genuinely one line.** `gold` and `gems` stay COMMENTED in `SERVER_OF_RECORD` on purpose: arming them is item (5), which the handoff says wants Security's look at the 33 deferred sites. What has changed is that the *client* no longer blocks it. Every display renders a pending em dash, every affordability check is fail-closed, and no path does arithmetic on a balance it has not been told. `src/net/record.js`'s b353 block now says so, and **`B353-3b` proves it in CI**: it deletes both fields from a live `G` — exactly the state arming those entries produces — and drives five real render paths. When you uncomment the two entries, that guard is your evidence, not a hope.

**2. TO SYSTEMS — I CHANGED THE B353-3 CONTROL, AND YOU SHOULD KNOW WHY.** Its old control set `G.gold = null` and required a throw. That premise was *"the gold render sites are unguarded"*, so the moment this sweep guarded them B353-3 went **RED while the thing it guards got strictly better** — I hit that on my first run. It now poisons `Number.prototype.toLocaleString`, which proves the same property (these renders propagate a throw) without depending on any site staying broken. **General rule worth carrying: a control whose premise is the bug will fail when the bug is fixed.**

**3. TO SYSTEMS — THREE REAL BUGS, NOT RENDERING BUGS, FIXED IN THIS COMMIT.** All the same shape: `(G.gold||0)` reading UNKNOWN as **zero** into a baseline, so the first envelope's *entire balance* is later measured as income. `legacy.js` `checkDailyGold`, `legacy.js`'s `_goldSeen` poller, and `features/profile-launchpad.js`'s midnight snapshot. Each now refuses to take a baseline it cannot measure. **The same pattern exists for every field that follows gold onto the registry** — inventory qty, skill xp, hearth tokens all have watermark/delta readers. Worth a sweep of its own when those move.

**4. TO SECURITY — the affordability direction, stated so you can disagree.** `canAfford` on an UNKNOWN balance returns **false**, everywhere, with no exception. A purchase gesture cannot be started against a number the client has not been told. `affordability()` returns a third answer (`'unknown'`) so the *copy* can distinguish "you are short" from "we have not been told" — a player told "Not enough gold" during a transport hiccup would file a bug about missing money and be right to. Nothing in this commit touches a write path, an envelope, or the prediction ledger.

**5. TO QA — what to re-run and what it costs.** `B353-3b` and the rewritten `B353-3` control are the only new/changed arms. Reproduce the browser verification with Playwright + `__HR_TEST_HARNESS__` against a static server, `delete G.gold; delete G.gems`, then run `updateTopbar/renderProfile/renderShop/renderHouse/renderInventory/renderFarm/refreshAll`. Expect 0 throws, `#top-gold`/`#top-gems` = `—` with class `bal-pending` + `aria-label`, and every shop Buy control disabled. Verified at 1440×900 and 922×423 in hearthlight and cozy-light.

**6. TO THE ASSET DIRECTOR / SYSTEMS — two live 0-emoji violations in copy I touched and deliberately did NOT change.** `src/legacy.js`: `'Need more 💎. Open the Store.'` (buyTheme) and `'Not enough gems. Tap "Get Gems".'` (buyCosmetic, buyBankSpaceGem). Rewriting player-facing copy was out of scope for a correctness sweep, but these are emoji rendered as art in a notification.

### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Security, QA (b349 — the 42501 flood is two sources, one of them ours on purpose)

Worktree `agent-aea11985dd254af77`, commit **`ce9dc9c`**. Smoke **710/710** (baseline 707; +3), 0 runtime errors, four consecutive runs, nine mutations each RED on target. **No version bump, nothing deployed. No grant changed, `hr_client_rpc_baseline` untouched.**

**1. TO SECURITY — I did NOT change a grant, and I am recommending you do not either.** `hr_server_now` is `authenticated`-only by the deliberate §3 ruling in `2026-08-11-authenticated-surface-lockdown.sql`, and that file's own header predicted this failure class in words ("would 42501 the muster clock for every signed-in player, at page load, with no client change to blame it on"). Opening it to `anon` would silence ~3,196 log lines a day and fix **nothing**: the client was calling an authenticated RPC without a token, and the pattern — not that one function's grant — is the bug. It would also add an anon-callable `volatile` function to the surface you just closed. **Recommendation: leave the grant exactly as it is.** If anyone later wants the clock public, it is a grant change plus a `tests/rpc-resolution.targets.json` entry plus an `ANON_CALLABLE` entry in `src/net/server-rpc.js`, in one commit — and a new node-side guard now FAILS the build if those two disagree in either direction.

**2. TO QA + COORDINATOR — 39% of the flood is `tests/rpc-resolution.mjs`, working exactly as designed. Do not "fix" it.** 38 deliberate anon probes × ~53 CI runs = ~2,014 42501s/day. This is arithmetic, not inference: `53` divides every non-`hr_server_now` offender row to the exact integer, and the multiplier is the number of probe targets sharing that parameter signature (6→318, 3→159, 2→106, 1→53). The probe is production-safe by construction (38 of 41 calls are refused before the function body runs) and it is the only thing standing between us and a silent `PGRST202` breaking every RPC for real players. **The consequence for the dashboard is what matters: our own CI is now the single largest source of logged database errors, so "42501 count" can never be an incident signal on its own.** Grade the RATIO instead — see the confirmation SQL below, which calibrates CI's contribution from a row only CI can produce.

**3. TO WHOEVER ADDS THE NEXT SERVER-BACKED FEATURE — there is now a seam, use it.**
  - **"May this call go out?"** → `HearthriseRpc.mayCall(name, hasSession)` in `src/net/server-rpc.js`. **Inverted and fails CLOSED** — an RPC nobody listed needs a session. `hasSession` must be a literal `true`; a caller that has not looked yet passes `undefined` and is refused, which is the whole point.
  - **"When is there a session?"** → `HearthriseGate.whenSignedIn(fn, label)` in `src/net/account-gate.js`. Holds; runs on the first live session; **never runs at all if one never arrives** — a 42501 is an answer, not a retryable failure. It is not a promise, deliberately: a promise must settle and the honest answer here is often "never". `label` makes "what is blocked on sign-in?" answerable.
  - **Do not** re-derive either from `auth.js`. `whenOpen()` is NOT the same question — the harness and a stale cached session both open the gate with no live token, and conflating the two is what this cost.

**4. TO THE COORDINATOR — an unrelated guard has been RED all session and it is not mine.** The Edge payload guard: deployed `hr-accrue` reports `a2a42250dd81e795…`, this repo packs `2f6334133c627f81…`. GREEN on my first run of the session, RED on every run after, with no change from me — my diff touches no `src/core`, `src/data` or `supabase/functions/**`. Another agent deployed a different payload mid-session; someone owes a redeploy or a re-pack.
### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Security, Game Designer, Art Director (b348 — the switch-on test failed because HALF the seam shipped; it is whole now)

Branch `agent-aa4009fd4c0be62ae`. Smoke **712/712** (baseline 707; +5), 0 runtime errors, 0 console errors, four consecutive runs; `AWAY-1 PARITY` green; `bump-version.sh --check` green at 348. **16 mutations, all RED and each naming its own fault** (8 against the new Node guard, 8 against the new browser tests), every one preceded by a green control and followed by a green restore. No version bump, nothing deployed, `supabase/functions/**` and `supabase/migrations/**` NOT touched.

**1. THE ROOT CAUSE, CONFIRMED ON THE WIRE — and the Coordinator's second hypothesis is FALSIFIED by the server's own records.** b347 wired four combat declaration sites. The next merge widened `PAYABLE_KINDS` to `['combat','gather']`, which widened `SETTABLE_KINDS` by derivation — the server half was finished — and no client site was added. Reproduced before fixing, in a real browser with the switch armed: starting woodcutting put **zero** requests on the wire and `player_state` stayed `idle`/version 0, matching production exactly (0 `player_intents`, version 0).

**But the brief's other claim — that "the state application re-armed the daily panel" — cannot be what happened, and the server proves it.** `version 0` + `0 intents` means `hr_apply` never ran, so no envelope with `accrued:true` ever came back, so `applyEnvelopeState` never executed. Nothing in the accrue/record/activity path writes `G.dailyReward` at all. I could not reproduce the daily re-presenting across three increasingly faithful harnesses (harness-flag; plain reload; **no** harness flag so the real 4-second resume watchdog runs). The claim persists to the local save and survives a reload. **The daily modal has exactly one auto-opener — `daily-reward.js autoBoot`, once per page load, which returns early when `isClaimable` is false — so for it to re-present, `G.dailyReward.lastClaimDay` must have been rolled back, which needs a cloud restore (`auth.js pullAndMaybeRestore` → `applyCloudOverlay` + `location.reload()`) or a save rollback.** I have no DB access from this worktree to check Tyler's `game_saves` row. **ASK TYLER ONE QUESTION: did the page reload itself?** If yes it is the cloud-overlay path and it is a different bug in a different file.

**2. ⚠ P1 TO THE COORDINATOR + GAME DESIGNER — MY FIX MAKES b339 REACHABLE ON A ROUTINE TAP, AND IT TAKES THE DAILY REWARD BACK.** This is the next thing that will end a switch-on test, and it is a design ruling, not a bug, so I did not overturn it. Measured end-to-end: claim the daily (+500 gold → 1,000), tap a tree. The declaration now COLLECTS, so an envelope comes back, and `applyEnvelopeState` replaces `G.gold` wholesale with the server's fresh character — **gold 1,000 → 500, the daily reward silently gone.** b339's replacement sheet is what stops that being silent, and it fires correctly (I verified it, and B348-8 asserts nothing moves while it is refusing) — **but `hr:serverAccrual:replaceAck` is a permanent localStorage latch, and Tyler almost certainly set it during the b347 combat test.** For him the first tap of a tree will replace his character with no prompt at all. Before the next switch-on run: either clear that key on his device, or rule on re-asking when the loss is materially larger than what was consented to. b339's own note ("today this cannot fire, because accrual.js refuses any activeKind !== combat") is now stale — I have marked it in this handoff rather than editing accrue.js, which is adjacent to another workstream.

**3. TO SECURITY — the retry question you would have asked, answered.** `activity_unsupported` is classified ANSWERED and is **not** retried: `shouldRetryActivity` retries only unanswered outcomes and `version_conflict`. Asserted in `tests/activity-seam.mjs` S5 **with a control** (the two outcomes that must retry still do, so S5 cannot pass because retrying was switched off wholesale). Mutation M7 turns it red. Also asserted: a REFUSED switch is never recorded as an acknowledgement even when it carries a perfectly good envelope — a refusal's `activity` field is the server's OLD state, and treating it as agreement would let a refused switch stop a player's run.

**4. THE GUARD YOU ASKED FOR, AND IT IS TWO LINKS, NOT ONE.** A single check could not cover both failure modes. `tests/activity-seam.mjs` (Node, wired into `run-smoke.mjs`, gates every push) asserts the server's `SETTABLE_KINDS` and the client's `ACTIVITY_KINDS` are the SAME SET, that every settable kind has a declaration call site in `legacy.js`, that the client gather index and the engine's `GATHER_NODES` have identical keys, and that a non-settable game activity is downgraded to `idle` rather than dropped. `B348-2/3/4` (browser) then iterates `ACTIVITY_KINDS` and drives a **real player gesture** for each, failing by name when one has none. Chain: *server list ≡ client list* ∧ *client list ⇒ a gesture that puts the bytes on the wire*. **Widening `PAYABLE_KINDS` to include `artisan` now fails the build twice before it can ship server-only.** Proven: mutation M1 does exactly that and the guard says so by name.

**5. TO THE GAME DESIGNER — an activity the engine cannot price now declares `idle`, and that is a deliberate, visible behaviour change.** Starting a cooking/smithing/crafting run sends `{kind:'idle'}`. Silence was NOT the neutral option: it leaves the server's pointer on the previous activity, so a player who chops oak for an hour and then cooks is **paid for oak for as long as they cook**. `idle` collects what was really earned and stops the meter; the artisan time itself pays nothing, which is the deferral `PAYABLE_KINDS` already documents. The day artisan becomes payable, every one of those call sites starts declaring `artisan` with no edit — the downgrade is a function of the kind list, not a literal at the call site.

**6. TO WHOEVER TOUCHES THE RESUME PATH — a load observation, not mine to fix.** With the switch ON, the b260 watchdog runs `processOffline()` every 4 seconds while visible, and under the switch that is `hr-accrue` + `hr_load` on every tick. Measured in a real browser with no harness flag: **1 create + 5 loads + 3 accruals in 30 seconds**, which is consistent with the 7/7 counters in Tyler's window and burns a real share of the 30/min budget for an answer that cannot change between ticks.

---

### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Art Director, Game Designer, QA, Security (b347 — the activity seam is BUILT, and the record template is fixed)

Branch `worktree-agent-aa3e8484ab2c37486`, commit **`b0b7ac4`**. Smoke **702/702** (baseline 692; +10), 0 runtime errors, 0 console errors, four consecutive runs. Thirteen mutations, each RED on exactly its target. `AWAY-1 PARITY` untouched. **No version bump, nothing deployed.** `src/core/**`, `supabase/functions/**`, `src/data/**` and `docs/design/*.md` NOT touched.

**1. TO THE ART DIRECTOR — a new receipt appears on a surface you own, and its copy is now slightly wrong.** A successful `set_activity` COLLECTS first, so it pays. That payment is written to `G.lastOfflineSummary` deliberately — through `summaryFromAway`, the away card's own translator — because the alternative is the numbers appearing out of nowhere at the next `hr_load`. Consequence: **the Home away card (`home-dashboard.js`, 30-minute freshness box, `hrs >= 0.1` gate) and the welcome-back modal can now show a receipt for a window the player was NOT away for.** The card's sentence says "away". I did not change it — copy is yours — and the receipt carries everything you need to branch: `source === 'switch'` (vs absent/`undefined` for a real absence), `serverAuthoritative: true`, and `activity: {kind, id}` naming what they switched TO. The toast already says the truthful thing ("Collected 30m — +512 gold, …"). This only fires with the b337 kill switch ON, which is off by default, so there is no live-beta urgency.

**2. TO THE GAME DESIGNER — a balance consequence that is the CONTRACT's, not mine, and it is named in the spec.** `hr_apply` stamps `accrued_to = now()` on any delta carrying `activity`, so **a switch closes the window whatever it paid**, and a sub-`ACCRUE_MIN_MS` (60 s) remainder is discarded. The spec's own note (intents.js, `SAFE_SKIP_REASONS`) states the cost honestly: the bound that matters is a FRACTION, not 60 seconds — *a player whose mean switch interval is under a minute never accumulates a payable span and accrues nothing at all, indefinitely.* Target-hopping is ordinary idle behaviour (chasing a bounty, clearing a slayer list, re-targeting after a death). The client coalesces rapid taps into one call, which bounds the REQUESTS but not the loss. The real fix is letting a closing collect price a sub-minute span, which changes the accrual engine's contract and is a balance call. Yours.

**3. TO SECURITY — C1 is implemented as specified, and here is where to look.** `src/net/activity.js` `nextIntentKey(prevKey, verdict)` is the only place a retry's key is chosen. Reuse happens for exactly two outcomes — `unreachable` and `timeout`, i.e. UNANSWERED. Every answered outcome, refusal or success, rotates to a fresh `crypto.randomUUID()`. Automatic retry is bounded at 2 attempts total and only for (a) unanswered → same key, (b) `version_conflict` → new key. A `stage:'collect'` refusal is NEVER retried; it kicks the accrue verb once, which is the contract's stated recovery. `ACT-2` proves both halves pure AND end-to-end off the wire, and mutation M6 (`nextIntentKey` always reuses) turns it red. **C2 is consumed by shape, not by a copy of your list:** the client asks whether the body carries a decodable envelope (`envelopeOf`) rather than mirroring `STATELESS_REFUSALS`. A client copy of a server-side list is a second registry that drifts silently; adding a code to the stateful side needs no client change.

**4. TO WHOEVER MOVES GOLD NEXT — the template is now safe to copy, and it was not before.** `offlineBudget` had TWO live client writers after b340 moved its record (`saveLocal`'s watermark advance; the cloud overlay's re-stamp, three lines after the strip removed the field from that same snapshot). Measured: server 06:00Z, client 09:30Z, `recordValue` answering `source:'server'` throughout. Copy this pattern, not the old one:
  - ask before writing: `HearthriseAccrual.mayClientWrite('gold', window)` — ONE implementation, switch read from accrue.js and field list from record.js so neither vouches for the other's absence, and it FAILS CLOSED;
  - every `SERVER_OF_RECORD` entry must carry a `fingerprint` (asserted against `REGISTRY_FIELDS` by B347-R3), so `recordValue` can answer `{known:false, source:'client-overwrote'}` instead of putting the server's name on a client number;
  - `record.js`'s ordering rule stands and is now enforceable: **the record follows the writer.** Gold has ~40 writers; every one of them needs the guard before `gold` joins the registry.
  - EXEMPT, on purpose and documented at both ends: `accrue.js stampAwayWatermarks`, which runs from `setServerAccrualEnabled` at the instant authority changes hands. It is not a writer of the record; it is the thing that decides whose record it is. Guarding it breaks B339-4 in both directions.

**5. TO QA — what is proven and what is NOT.** Proven by execution in real Chromium against the real `index.html`, kill switch armed, `fetch` intercepted: a real `startCombat` tap put `{"verb":"set_activity","slot":0,"intentId":"<uuid v4>","activity":{"kind":"combat","id":"slime"}}` on `/functions/v1/hr-accrue` with `Authorization: Bearer …` and `apikey`, applied the envelope (gold 500 → 1012), wrote the receipt (+512 gold, +1600 XP, +3 items, 7 kills, `hrs 0.5`, `source:'switch'`), moved the record to the SERVER's `accrued_to` (`recordValue` → `known:true, source:'server', version 4211`), and a following `saveLocal()` with `lastSeen` forced to 0 left that watermark **unchanged**. Zero console/page errors. **NOT proven: anything past the transport boundary.** No real JWT, no real Edge Function round trip — `tools/switch-on-test.mjs` reads an email and password from stdin and I did not have or enter credentials. The bytes are asserted against the spec, not against a live 200.

**6. Reachability, stated rather than implied.** Seam 3 (`drainBountySwitch`) is UNREACHABLE while the seam is armed: with the b337 switch ON, `processOffline` returns before any client-side away replay, and `requestBountySwitch` only queues during a replay. It is wired because the contract names all four writers and because the alternative is a fifth writer appearing the day the two paths overlap. Gathering/artisan (`startSkill`, `startArtisan`) are NOT declared — the server answers `activity_unsupported` for them today — but the activity mutex means starting one calls `stopCombat()`, which correctly declares `idle`. When the server engine learns gathering, those are seams 5 and 6 and they go in the same place.

**7. Known limitation, measured, not fixed.** Under the switch, live client-side combat still mints XP and gold locally while the server's character does not know about it — so a switch envelope can be BEHIND local, `describeReplacement` reports the switch as destructive, and `applyIntentEnvelope` refuses and raises the b339 replacement sheet instead of applying. I reproduced this once in the browser. That is the designed consequence of server authority plus a client that still simulates live play, the sheet is the designed mitigation (asks once, in numbers, then silent), and the acknowledgement key is shared with the accrual path because it is one consent. It stops being a question when live ticks move server-side.
### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Game Designer, QA (b348 — Xarn's five reports)

Branch `agent-a597c79506d8d0445`. Suite **696/696** (baseline 692; +4), 0 runtime errors, 0 console errors, five consecutive full runs. **Seventeen mutations, each RED on exactly one test.** No version bump, nothing deployed, nothing applied. Labelled **b348** because b347 is the merged away-buff work.

**1. TO THE COORDINATOR — TWO THINGS NEED YOU.**
- **The Edge payload no longer matches.** `src/data/recipes.js` changed, so `hr-accrue` packs to a different hash than the deployed function. The guard is RED and correctly so. **Redeploy needed, not performed.**
- **The catalogue migration was REGENERATED and needs re-applying.** `node tools/gen-catalogues.mjs` run; the diff is exactly five `hr_activities` rows (the reconciled reqs) and nothing else — no items, no slot pairs. **Not applied.**

**2. TO THE GAME DESIGNER — five craft gates moved, and one systemic thing you own.**
The reconciliation is listed exhaustively in my report for Tyler's veto (all five move DOWN, onto the generated curve). Three lanes were genuinely disordered: platebody INVERTED (steel 60 > mithril 55 — Xarn's report), helm and belt TIED. **Eleven other hand-authored rungs still sit off the curve and were left alone** because they are ordered; changing them would be balance churn with no defect behind it. They are listed in the report if you want them.

**The systemic thing, measured and NOT fixed:** on the generated ladder a tier's gear can unlock BELOW the bar it is made from. Bronze gauntlets req 2, boots 3, belt 4, helm 6, platebody 11 — but `smelt_bronze` is Smithing **8**. Mithril gauntlets 46 / boots 47 / belt 48 vs `smelt_mithril` **55**: nine levels of recipes you can select and cannot supply. This is pre-existing in shipped generated content, it is a MATERIAL_TIERS-vs-smelt-req relationship, and it is a design call, not a bug fix.

**3. TO QA — the trap I fell into, now impossible.** `tryRun(name, fn)` is synchronous. Hand it an `async` body and it receives a promise, nothing throws synchronously, and it returns PASS **before a single assertion runs**. I wrote two of these and only found out because seven separate mutations — including restoring the exact reported bug — all came back GREEN. `tryRun` now detects a thenable return and fails loudly naming `tryRunAsync`. Mutation-proven (M17). Only my two tests were affected; the other 676 registrations are clean.

**Also for QA: `AWAY-16` is FLAKY.** It failed twice across ~20 harness runs under mutations that cannot touch it (`_renderInvSummary`, a comment edit) and passed every other time. It re-runs an 8h absence and compares piles, so it is the same wall-clock-boundary shape as the known-flaky `b227 OFFLINE parity`. Someone should pin its clock. It is not mine and it is not new.

**4. TO THE ART DIRECTOR — three surfaces gained a line, all on existing components and tokens.**
- `.ttl-req` in the hover tooltip (uses the `.ttl-cmp` card vocabulary; `--gold-2` met / `--red` + `--red-bg` unmet).
- `.at-wear` on every artisan tile whose output is wieldable (`--gold-2` met / `--red` short) — 39 of 50 tiles on the Armour lane.
- `.invc-space-free` in the bag header, and `.invc-slot-more` for the surplus chip past the 600-tile render ceiling.
`theme-cozy.css`'s mobile rule `#panel-combat .csb-btn small{display:none}` is GONE — it was hiding the combat style XP label AND b329's swing time on every phone. `.csb-meta` is now shown on the dedicated Style sub-tab only. Measured at 922×423 and 500×900: zero horizontal overflow, block height 145px/126px.

### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Game Designer, Art Director, QA (b347 — the held away-buff branch is UNBLOCKED)

**THE GATHER/ARTISAN AWAY REPLAY NOW HAS A TIMELINE. Branch `agent-a06ecbcee310aa2c7` is merged and shippable.**
Smoke **692/692** (baseline 689 + the branch's 690 + 2 new), 0 runtime errors, four consecutive full runs, seven mutations. `src/data/**`, `supabase/functions/**` and `docs/design/*.md` NOT touched. No version bump, nothing deployed.

**1. The held branch merged with 5 conflicts, all mechanical.** `src/core/combat-sim.js` (import versions: main had moved `?v=342 → ?v=346`, took main's and versioned the branch's new `buffs.js` import to match) and `src/features/smoke-test.js` (main renamed `LICENCE-4 → AWAY-SCOPE-1` when the licence was removed; kept main's name, kept the branch's `buff: true` pin and its rationale). Three coordination markdown files, both sides kept. **`AWAY-1 PARITY` green before, during and after — it never moved.**

**2. The bug, measured on the real engine, 8h on woodcutting Normal Tree with one 10-minute consumable eaten on the way out.** BEFORE: `gather_speed +4%` bought **250 extra actions** (6,250 vs a 6,000 control) and `all_xp +5%` bought **+20.0% XP** (36,000 vs 30,000) — and **0 of the buff's 600,000 ms drained**, so it came back reading 10:00, reusable every night forever. AFTER: **+5 actions** and **+0.417% XP**, and the buff is spent to zero and pruned. **50× and 48× overpay, closed.** A combat test passes with all of that present, which is exactly how it survived.

**3. The shape is `utcDaySegments`, not a second mechanism.** `replayAwaySpan` (legacy.js, beside `offlineIntervalMs`) splits the span at buff-expiry boundaries and runs each slice at its own re-derived rate, carrying the sub-tick remainder across exactly as `simulateSpan` carries it across UTC midnight. Combat can ask "is a buff alive?" per swing because its tick length is fixed; here `gather_speed` changes THE INTERVAL, which is the number the tick count comes from — so the segment shape is the correct one, not laziness. With no buff held there is exactly ONE slice and the arithmetic is identical to the flat loop it replaces, which is what keeps every pre-existing away test honest instead of re-baselined. The clock is `advanceBuffClock`; the boundary oracle is `nextBuffExpiryMs`, added to `src/core/buffs.js` beside `activeBuffs` so it applies the same liveness rule.

**4. TO THE GAME DESIGNER — the balance consequence, NOT retuned (magnitudes are Tyler's).** With the shipped catalogue (magnitudes 1–5, durations 2–20 min), the most a deliberate eat-then-logoff can now buy on an 8-hour night is **≈0.08% more actions** and **≈0.42% more XP** — the value of the buff's own minutes, which is the stated rule. It was up to **+4.17% actions / +20% XP** before. Two notes: (a) the +20% figure is a FLOOR artefact and worth knowing — Normal Tree's paced XP is 5.85, so `floor(5.85)=5` and `floor(5.85×1.05)=6`, i.e. a 5% buff pays 20% on that node and ~5% on a high-XP node. That is pre-existing and unchanged by b347; it just makes small buffs lumpy on low-XP content. (b) A buff now genuinely runs out overnight, so "eat before bed" is no longer a strategy. If you want it to be one, that is a DURATION change in `src/data/items.js`, not an away-rule change.

**5. TO THE ART DIRECTOR / whoever owns the welcome-back card.** `buffsPaused` is now unconditionally **false** on BOTH arms of the receipt (it used to be `G.buffs.some(alive)` on the non-combat arm — a lie in both directions on a gather night). `home-dashboard.js:624` handles false by printing nothing, so nothing breaks, but **the "Food buffs paused — their time was kept, not spent." line is now dead code.** Replacing it: `buffPaidMs` (ms of the absence at least one buff was live) and `buffsExpired` (the types that ran out), now on the gather/artisan receipt too, in the same shape combat already reported. "Your Hunter's Feast covered the first 14 minutes" is sayable. The buff-row footnote lost its *"and freezes entirely while you are away"* clause for the same reason.

**6. TO QA — the mutation that caught a lying guard of mine.** My first `buffsPaused` assertion sat on the EXPIRING-buff scenario and mutation (iv) came back **GREEN**: that buff is pruned during the replay, so the old `G.buffs.some(alive)` expression is coincidentally false by the time the summary is written. The two expressions only differ when a buff **outlives** the absence, so that is where the assertion now lives. Also: `tests/run-smoke.mjs` waits **6,000 ms** after `__smokeTest` exists before running; a private harness that waits less will see `#wbv-overlay.show` mid-suite and cascade a false failure into `b342-4`. Match the 6 s.

**7. Redeploy needed, NOT done.** `src/core/**` is vendored into `hr-accrue`, so the payload hash moved to `b44d378eedbd983a…` (deployed is still `c36dcc63696c3be4…`). The only core change is the pure `nextBuffExpiryMs` plus the branch's buff work; the server builds `state` from DB rows with no `buffs` field, so it is inert there. The Edge payload guard is RED until someone redeploys.

**8. Standing, not fixed — three things I measured and left.** (a) `supabase/functions/hr-accrue/accrual.js:483` still passes `activeBuffCount: 0` into the sim ctx; that input is now dead everywhere (I removed the `legacy.js` one) but the file is outside this branch's boundary. (b) A gather run that stops because its node vanished from the data between sessions still reports the FULL absence as `paidMs` — `doSkillAction` returns without clearing `G.activeSkill`, so the loop cannot tell. Pre-existing, identical before and after b347, and it needs a `stoppedBy` value which is a copy call. (c) An entry with `remainingMs: 0` is never pruned by any path (`tickBuffs` skips an already-dead buff, so `changed` stays false) — it pays nothing, but a "0s" row can sit in the queue. Also pre-existing, and true on the combat path too.

### 2026-08-15 — FROM Systems Engineer → TO Coordinator, Game Designer, QA (b345, three player-found bugs)

Branch `worktree-agent-a7cbb539ab26abecb`. Smoke **687/687** (baseline 684; +3), 0 runtime errors,
four consecutive full runs plus twelve mutation runs. No version bump, nothing deployed.

**1. MERGE WATCH — I am in `src/legacy.js` at the same time as the Field-Licence removal agent.**
My edits are at **1153–1560** (processOffline + three new helpers), **~9400** (one 6-line row in the
welcome-back modal), **~13030** (one line in the render key) and **~12700 / ~12830** (the two tile
builders). Their listed lines are 1293, 2709, 7366, 7947, 9297. The only close call is the modal
row: I inserted it immediately ABOVE the `_off.licence.declined` row they will delete. If git
conflicts there, keep both intentions — my row is `_off.stoppedBy`, theirs is `_off.licence`.
I did NOT touch the licence copy, the licence branch of processOffline, or the away card's licence
notes.

**2. TO THE GAME DESIGNER — two copy/design calls I made, and one I refused to make.**
- I made: the away card and the offline toast now SUPPRESS the "capped at your Nh away max —
  upgrades raise this" line when the run stopped early. It was rendering directly beneath "Cooking
  ran out of Raw Shrimp 30s in — the remaining 11h 59m paid nothing", which sells an upgrade that
  would have bought that player nothing. Same principle as away-combat-licence.md §3.3.1. A capped
  night that ran the whole way keeps the line (asserted both ways).
- I made: the card now states a consumption RATE — "Away, this run uses about 957 Raw Shrimp an
  hour — stock up before you log off." Derived in processOffline (the only place that knows the away
  interval and the recipe together) and carried on the receipt as `stoppedPerHour`, so no renderer
  re-derives it. **No balance value changed.** If you would rather it named the cap total (11,250
  shrimp for a 12h night on Cook Shrimp) than a per-hour rate, that is a one-line copy change.
- I refused: **whether the daily-reward sheet should auto-open at all at that moment.** It fires the
  instant the FTUE hands control back — i.e. exactly when the player is about to take their first
  action — which is *why* it eats the first click. I fixed the interception (every click it takes now
  produces a visible result, and it never takes a second one); the timing is a retention-design call
  and it is yours. Round 2 wipes everyone to first boot, so all 20 players walk this path.

**3. TO QA — two test hazards, both measured, both now documented in DISCOVERIES.**
- `power-budget.js` re-wraps `window.getBonus` on a permanent 1-second interval. Any ASYNC test that
  substitutes getBonus is measuring a different stack after one second. Set
  `yourFn.__hrPowerBudget = true` (its own idempotence flag) and restore in `finally`. If your
  assertion involves an action interval, pin the speed keys too — they move under you.
- `window.offlineIntervalMs()` resolves the CURRENTLY ACTIVE action. Reading it after a run that
  stopped the activity silently falls back to a stale `G.skillMs` left by an earlier test (measured:
  3,763 against a run that used 3,840). Capture it before the run.

**4. STANDING, NOT FIXED — three things I measured and deliberately left alone.**
- `actionRate()` omits the gathering TOOL's XP bonus (`toolXpB`), which `doSkillAction` applies
  before `addXp`. So every xp/hr readout in the game understates a tooled gatherer by up to 14%.
  Fixing it means touching `src/core/pacing.js`, which is shared with the accrual payload — a
  deliberate coordination point, not a drive-by.
- `actionRate()` also omits artisan TOOL speed, which the live loop's `activityIntervalMs()` applies.
  Same file, same reason. Neither is a live/away divergence (both away and live go through
  `activityIntervalMs`), and the server calls neither function today.
- `src/features/activities-grid.js` is a DEAD renderer for the activity tiles — legacy.js block 27
  assigns `window.renderSkillDetail` last, so its twin builders paint nothing. Measured: reverting
  its XP expression left the whole suite green. I fixed it anyway (it is the documented twin) and
  published `window.HearthriseActivitiesGrid.__tileForGather/__tileForArtisan` so the suite can grade
  it. Someone should decide whether that file still earns its place.
### 2026-08-15 - FROM Systems Engineer -> TO Coordinator, whoever holds `src/legacy.js`, Game Designer, Art Director

**PERSONAL BUFFS NOW PAY AWAY — AND SPEND AWAY. Core half only; the gather/artisan half is a BLOCKER on `legacy.js` (see CONFLICTS.md).**
Branch `worktree-agent-a06ecbcee310aa2c7`. Smoke **685/685**, 0 runtime errors, four consecutive runs. `src/legacy.js`, `src/data/**`, `supabase/functions/**` NOT touched.

**1. The line was never timed-vs-permanent; it is SERVER-WIDE vs PERSONAL.** `AWAY_SCOPE.buff` false -> **true**, `blessing` stays false. b326 froze buffs away because they are timed; Tyler's rule (2026-08-14) is that a Feast the player ate is theirs and stays true while they sleep, while a rotating blessing is something the world does for people who are in it. `clan` was already on the permanent channel for the same reason — the table was already half-drawn on the right line.

**2. Paying and spending are ONE rule, not two.** `buff: true` on its own is a bigger mint than the one b326 closed: measured, a 5-minute consumable covered a full 3,600,000ms absence — **12x**. `simulateSpan` now drives `tickBuffs` per tick, so a 10-minute Feast covers exactly 600,000ms of an 8-hour night (250 of 12,000 ticks) and expires mid-night. `tickBuffs` still freezes on `active === false` — idling is not work — and that is now its ONLY freeze.

**3. Nothing was plumbed to make the payout follow, and that is the point.** `ctx.bonus` is the client's getBonus chain, whose buff term reads the same `G.buffs` the clock drains. One identity, not two copies. The server builds `state` from DB rows with no `buffs`, so the whole clock is an inert no-op in Deno (asserted, AWAY-15e).

**4. THE KNOCK-ON THE TASK NAMED, MEASURED.** `damage_crit` food is on the BUFF channel, so it now reaches away crit rolls. Effective away crit goes **7.67% -> 11.25% for the buffed window only**; across a full 12h night that is **+1.7% more crits** (1380 -> 1404). The `CHANNEL.CRIT` comment claiming crit is "gear-sourced by construction when away" was made false by this change and is rewritten in the same commit.

**5. Two mutations caught what review did not.** (a) A "queue reassigned mid-span" test was **vacuous** — `pruneBuffs` filters to a new array whose ELEMENTS are the same objects, so a stale reference drains correctly anyway; capturing the array once passed it unchanged. The distinguishing case is a buff *appearing* in an empty queue, and that is what AWAY-15(f) now asserts. (b) Fixing it exposed a real off-by-one: reading the queue again *after* the tick charged a buff added during that tick for an interval it was never alive for (597,600 vs 600,000). The queue is read once, before the tick, and both charged and drained.

**6. Art Director / whoever owns the welcome-back card.** `buffsPaused` from `simulateSpan` is now **always false** — nothing is paused. The key is kept (three renderers read it unguarded). Two new honest facts replace it: **`buffPaidMs`** (ms of the absence a buff was actually live) and **`buffsExpired`** (the types that ran out mid-night). "Your Hunter's Feast covered the first 14 minutes" is now sayable without a renderer inferring anything. `home-dashboard.js:565` is deliberately untouched — its "your buffs were paused" line can only be reached from legacy's non-combat branch now, which is the same defect as the gather blocker and should be fixed with it.

**7. Redeploy needed, not done.** `src/core/**` is vendored into `hr-accrue`, so the Edge payload hash moved `65f0e8ed297f71b5` -> `95d8adf9c138425b`. No behaviour change server-side (no buff queue there), but the bytes differ.

**8. Measured, reported, NOT changed: the offline cap does not stop the character.** Full table in CONFLICTS.md. Today the payout is capped and the activity is still running on return; Tyler described the character stopping. Separately, the credited window is the LAST `cap` hours before returning rather than the FIRST after leaving, which credits a long absence against the wrong day's Boss of the Day.

### 2026-08-14 - FROM Systems Engineer -> TO Coordinator, Game Designer (b343, gold step 1)

**THE PRICE CATALOGUE IS EXTRACTED AND GUARDED — step 1 of the gold ordering is done.**
`tools/gen-shops.mjs` -> `src/data/shops.js`, **128 offers across 16 tables in 7 files**,
plus **6 prices that are formulas and are deliberately NOT in it**. Nothing consumes the file
yet; phase one moves no authority and changes no price. Branch
`worktree-agent-a7eec0a87d32fa4ce`. Smoke **682/682**, 0 runtime errors, three consecutive runs.
`src/legacy.js` NOT touched.

**1. The handoff's counts were low, and two of its claims were wrong. Re-measured:**
- `TRAITS` holds **1** priced entry, not 7 (`auto_eat`, 100 Bounty Marks). The other six do not exist.
- `workers.js` is **not formula-derived** — `HIRE_COSTS = [500, 2500, 10000, 30000, 80000, 200000]`
  is a table with a clamped index. All six rungs extracted.
- `dungeons.js` is **not formula-derived either** — six entries costing a key ITEM
  (`cost:{key:'bone_key'}`), no gold anywhere. Extracted. Its `cost.gold` and
  `cost.hearth_token` branches are live code with no data using them.
- Six priced tables the handoff never named: the inline `cosmetics` array inside `renderShop()`
  (4, gems), `BANK_SPACE.gem` (1), `SLOT_COSTS_GEMS` in `multi-character.js` (4, gems),
  companion shop prices encoded in `COMPANIONS[id].source` strings (4, gold),
  `PLOT_TIERS` deed costs in `core/farm.js` (4, items), and `IAP_CATALOG` (9, real money).

**2. GAME DESIGNER — two prices to rule on. I changed neither.**
- **`COMPANIONS.owl` costs 50 gold.** `source:'shop:50:prayer50'`. It is the only companion with a
  Prayer-50 gate — the highest in the set — and it costs 100x less than the *ungated* Sparrow
  (5,000) and 500x less than the Raccoon (25,000). Reads as a truncated `50000`. The parse is not
  in doubt: `parseSource()` at `legacy.js:13955` splits the same string the same way, so the shop
  really does charge 50.
- **`legacy.js:6152` holds a SECOND, unguarded copy of the Auto-Eat price** —
  `(window.TRAITS && window.TRAITS.auto_eat) || {cost:100, currency:'marks'}`. Normally dead
  (`window.TRAITS` is published at load), but if the Marks price ever moves, that sentence in the
  food tooltip keeps quoting 100 forever. It is the exact duplicate-price class this extraction
  exists to end, and it is inside `legacy.js` where I was asked not to edit. One-line fix for
  whoever next holds that file: drop the literal and let the tooltip skip itself when TRAITS is absent.

**3. COORDINATOR — what the next phase needs from me, and what it must not assume.**
- `hr_shop_buy(p_offer_id, p_intent_id, p_version)` is the shape the file is built for: the client
  sends an **offer id**, never a price. Postgres transliteration is
  `hr_shop_lines(offer_id, side, ord, kind, id, amount)` and `gen-catalogues.mjs` already knows how
  to emit exactly that.
- **`marks` has no server column at all.** `player_state` carries `gold`, `gems`, `hearth_tokens`
  and nothing else (verified in `2026-08-11-player-state.sql`). 6 cost lines are priced in Marks
  (`BOUNTY_SHOP` x5, `TRAITS` x1) and cannot be authorised server-side until that column exists.
- **`hearth_token` is BOTH an `hr_items` row and a `player_state` column.** The dungeon spend path
  debits it from `G.inventory` (as an item); IAP grants it as a currency. That is why every cost
  line carries a `kind` and not just a currency name — a bare `{currency:'hearth_token'}` is
  genuinely ambiguous, in the one currency the Final Directive says may never be minted.
- **No version bump, no CHANGELOG entry** — those belong to whoever picks the build number.


### 2026-08-14 - FROM Systems Engineer -> TO Coordinator, Game Designer, Art Director (b342)

**1. The Field Licence gate is client-only, and a comment in the engine says otherwise.**
`legacy.js:1205` states "The authority is hr-accrue, which asks the same fieldLicence() against
server-known `stats.kills`". Grep `licence` across `supabase/functions/hr-accrue/**`: zero hits.
`summaryFromAway()` in `src/net/accrue.js` carries no `licence` field either. `isServerAccrualEnabled()`
is off by default so the client path IS the beta, and everything b342 built works — but the moment
that switch flips, a declined night goes silent again (the card, the modal and the toast all read
`lastOfflineSummary.licence`, which the server never sends). I did NOT add a speculative passthrough:
plumbing a field the server never populates is how a surface starts lying quietly. Spec §3.2/§11.

**2. The welcome-back modal's TRIGGER is a race — that is a design call, not a bug fix.**
Both welcome modals gate on `Date.now() - G.lastSeen`, and `chronicle.js reconcile()` calls
`saveLocal()` at ~315ms, which stamps `lastSeen = now` — before the 1500ms boot timer reads it. So a
seeding or newly-levelled account never sees the modal and a quiet established one does. b342 fixed
what it SAYS (one span row, the real gains, glyphs, the declined night) and deliberately did not make
it fire more often: there are still TWO welcome modals, and deciding which survives is a design call
b341 already flagged. If the answer is "the Home away card is the durable surface and the modal
goes", that is a clean deletion and I will take it.

**3. Art Director — two readouts landed on your surfaces using existing classes only.**
The Combat activity bar's licence counter reuses `.ab-tkills` + `.ab-xph.ab-away` (zero new CSS), and
the away card's `[ Train a skill ]` CTA reuses `.hd-cta` with one positioning rule
(`.hd-away-cta{align-self:flex-start;margin-top:7px}`). Both are token-only and deliberately
conservative — placement and weight are yours if they want to be different.

**4. Emoji-as-art still shipping, adjacent to this work, not fixed here.** `QUEST_DEFS.field_licence`
carries a literal medal in its completion toast (`legacy.js:2672`), and the arena's own
`.ce-next` / combat-empty region still has a hardcoded `⚔️` in `index.html:399`. The welcome-back
modal's six are cleared.

### 2026-08-14 - FROM Systems Engineer -> TO Security Engineer, Coordinator (b340)

**market-v2's stated blocker is closed; a SECOND one that was on nobody's list is not.**
`src/net/supabase-market-backend.js` now prefers `market_list` / `market_cancel` / `market_buy` and
keeps the v1 table write only as a proven-absence fallback. But `collectSales()` PATCHes
`market_sales.collected`, and **market-v2 recreates that table with no `collected` column** - the
handoff's blocker list named lines 73/93/107/120 and stopped there. Left alone, applying the
migration would have turned that into a silent 400 polled once a minute forever
(`if (!res.ok) return []`). It now stops on a proven-v2 server, and identifies v2 from a `42703`.

**Still blocking market-v2, and NOT mine to close:** `player_inventory` holds zero rows, so
`market_list`'s escrow (`select qty from player_inventory ... for update`) would refuse 100% of
legitimate listings. And under v2 the server moves gold/items while `src/market.js` still moves
`G.gold`/`G.inventory` locally - two disjoint universes until the client rewire. **market-v2 is
unblocked on the CLIENT-WRITE precondition only.** Do not read "unblocked" as "appliable".

**F5 is closeable now.** `src/features/clans.js` is off both views (`hr_clan_browser` for the clan
browser, `HearthriseLeaderboards.fetchBoard` for `NetClient.leaderboard`).
`supabase/migrations/2026-08-14-leaderboard-view-lockdown.sql` is **STAGED, NOT APPLIED** - it drops
`leaderboard` + `clan_leaderboard` and revokes `anon`/`authenticated` SELECT on `leaderboard_ranked`.
**ORDER IS LOAD-BEARING: b340 must be DEPLOYED first.** Players on b339 still read both views;
applying first breaks the clan browser for everyone on the old build.

**One new client-callable RPC:** `hr_clan_browser(int)` - authenticated only, `anon` EXECUTE false,
VOLATILE (it calls `hr_rate_ok`, which writes - STABLE here is the 25006 sign-up outage again),
rate-gated 120/min with the C2/S6 recorded+sampled rejection shape, limit clamped 1..50 server-side,
and recorded through `hr_grant_baseline_sync` so the widening prints its own diff.
`hr_leaderboard`'s `p_limit <= 100` clamp stops being decorative the moment the matview revoke lands.

**Proof:** `tests/leaderboard-lockdown-guard.mjs` replays the WHOLE repo chain (schema.sql + every
file in the declared apply order) and applies the staged file on top - 5 mutations, all RED.
`tests/market-offers-guard.mjs` and `tests/schema-drift.mjs` unchanged and green;
`tests/rpc-resolution.mjs` 41/41 identical to baseline. Suite 645/645.

**Read DISCOVERIES first** - my own SS5(b) grant check was blind because `information_schema` does not
list materialized views.

---

### 2026-08-14 · FROM Systems Engineer → TO Security Engineer, Coordinator (b339, CLEAR-WITH-CONDITIONS)

All six conditions on the client rewire are addressed. **The switch still must NOT be flipped for a
real account** — S2's ordering is unchanged and is the reason.

**S1 · §5(K) rewritten and mutation-proven.** `pg_depend` cannot see a PL/pgSQL caller (see
DISCOVERIES). The scan now plants a STABLE caller, must find it by name, drops it, and only then
believes its zero — ONE query text `execute`d twice so control and assertion cannot be blinded
separately. Three mutations RED: `nonvolatile_caller_planted` (fails on the volatility message, by
name), `caller_scan_blinded` (schema filter), `caller_scan_pattern_blinded` (regex). `--selftest`
18/18. **The file is edited, NOT applied.**

**S2 · nothing flipped, and the client now says so.** A 200 that is `ok:true` with no `created`
flag is `console.error`'d by name — it names the pre-b338 body and the migration to apply — and is
asked **once** per session instead of re-asking on every `processOffline` (the live body charges the
6/hour creation bucket before its slot_taken check, so six reloads exhaust it). B339-6.

**S3 · corrected.** `accrue.js`'s header no longer claims CORS makes it inert. It names the kill
switch and, as a temporary and explicitly-not-a-safety-property second gate, `no_created_flag`.

**S5 · latch is now an identity.** `latchKey(url, userId, slot)`; `null` user never matches.
`signOut()` calls `resetCharacterIntent()` — which had no caller anywhere in `src/` — and the test
drives the real sign-out path rather than reading the source.

**S6 · slot resolved live** from `HearthriseProfile.activeSlot()` (published by the module that owns
it; the net layer never parses the profile record). `auth.js` passes no slot at all.
⚠ **The mutation "put `slot: 0` back in auth.js" SLIPPED** past the first version of the test —
see DISCOVERIES. `enableLiveSync`'s inline literals are now `buildIntentWiring`/`wireServerIntents`,
asserted with spy modules (B339-3b). Both mutations RED now.

**S7 · both watermarks stamped on every CHANGE of the switch, in both directions.** Cost stated in
the code: an UNCLAIMED local absence at the instant of a flip is confiscated. That is the safe
direction and the flip is a tester action. Two mutations RED (stamp-on-only, stamp-always).

**S4 · NOT fixed, made loud** exactly as asked. `applyEnvelope` refuses the first replacement that
would actually destroy something and shows a sheet stating gold / skill XP / items lost, with
"Keep my local save". Acknowledged once, silent thereafter; a device with nothing to lose never sees
it. Semantics unchanged — B339-5 asserts the acknowledged path still replaces wholesale.

**"exactly five" corrected** in the migration header and in `docs/design/server-authority.md`, which
said "7"/"six of the seven" while its own table listed nine and production holds eight. Both now
refuse to state a count and point at `hr_assert_grant_hygiene()` check 7, which is an allowlist of
signatures — **no live assertion ever depended on any of those numbers**, verified.

**For QA:** `b227: OFFLINE output is byte-identical with and without an active blessing` failed once
in ~13 runs (11390 vs 11415 XP) and passed the other twelve. It runs two wall-clock 3h absences and
compares them; crossing a tick boundary between them changes the pile. Pre-existing, unrelated to
b339 (it runs long before anything here), and it needs its clock pinned.

Suite **640/640**, 0 runtime errors. No version bump.

---

### 2026-08-12 · FROM Game Designer → TO Systems Engineer, Art Director, QA

WHAT I CHANGED. The Hunt's reward band no longer compares players to each other. Full reasoning in
`DECISIONS.md` (2026-08-12) and at the top of `supabase/migrations/2026-08-12-raid-band-fairness.sql`.

**Systems — three things are yours.**
1. **The migration is STAGED, not applied.** Its `do $$` block is the commit gate and is designed to
   run on production unaided: it asserts the ladder as a truth table, asserts `raid_claim`'s compiled
   `prosrc` contains neither `percentile_cont` nor `below_band`, asserts the four eligibility refusals
   survived the rewrite (the control), and round-trips one real solo claim through a synthetic uuid
   before deleting it. Nothing else on production is touched.
2. **The response envelope changed: `median` → `share`, plus `ratio` and `members`.** I deliberately
   did NOT alias `median` to the new number. A pre-b331 client would have rendered "Median 5,500" —
   a correct number under a label that is now a lie, which is the ranged-styles failure mode. Old
   clients read `+out.median` as 0 and show nothing, which is honest. `src/features/raids.js` is
   updated in the same commit.
3. **`p_damage` is still client-authored fiction with a ceiling** and this does not pretend otherwise.
   What it removes is the CROSSING: a forged number can now only inflate the forger's own band. It
   can no longer reach into a stranger's chest. When combat becomes server-owned, nothing here needs
   revisiting — the benchmark is already a pure function of the boss.

**A design/security note worth carrying forward:** the security pass was right to call this a design
question, and right that R2/R3 raised the cost without removing the primitive. But the two remedies it
offered are not alternatives. Banding against `max_hp` alone leaves the same primitive laundered
through HP contention (the pool is finite, so a heavy hitter eats shares others would have earned).
The FLOOR is what closes it. **When a fix is offered as "A or B", check whether each one alone leaves
a pipe open.**

**Art Director — one thing is yours.** The Hunt card gained a three-line rule paragraph under
`.hunt-you` (`src/features/raids.js`, `clanHuntHtml`). It is there because a reward rule a player
cannot see is the same failure as a stat that renders no number — but three lines of body copy on a
card that already carries a portrait, a bar, a button and two stat spans is a density call, and that
is yours, not mine. `tests/raid-card-copy.mjs` asserts the SENTENCES, not the markup, so you can
restructure it freely (a details/summary, a tooltip, a second line) without touching the test. Do not
delete the clauses: the share, "never against your clanmates", the strike price, and the ladder.

**QA — what to try to break.** A clan of exactly 2 and of exactly 40 (the share is
`max_hp / members_at_declare`, so it tends to `per_member` as the roster grows and carries the whole
`base` in a duo — that skew is intended and documented). A legacy `clan_raids` row with
`members_at_declare = 0` (falls back to the live roster; can only LOWER the bar, and with no unpaid
band a lower bar cannot deny). And a partial week, where the band floors at `full` on purpose.

### 2026-08-11 · FROM Systems Engineer (b330) → TO Art Director, QA, Game Designer, whoever owns the membership SQL next

WHAT I LEARNED — three things, and the first is the one that generalises.

1. **A "flaky test" is nearly always a fixture asserting something its own setup does not guarantee.** `b260` failed ~1 run in 4. Nothing about the resume code was flaky: the test replays five real minutes of away combat through a simulator whose rng is seeded from `Math.random()` at boot, so every run fought a *different* five minutes, and on the unlucky seeds **the player died**. A death clears `G.activeMonster`, so `resumeActiveActivity()` correctly re-armed nothing and "resume must re-arm the live combat loop" failed. I proved the mechanism instead of guessing at it — weakening the fixture on purpose (hitpoints 500) turned it into 2 failures out of 2 with exactly that message. Fixed structurally: death is removed **by construction** (an HP pool five minutes of goblin swings cannot empty; `combat-sim` takes `playerMaxHp` as given), the seed is **pinned** via `HearthriseCore.reseed()` and restored after, and the fixture's own precondition is now an assertion — so if a balance change ever makes it killable again it fails **loudly with the reason** instead of going flaky. **If you write a test that runs the simulator, pin the seed or assert the precondition. Otherwise you have written a dice roll.**
2. **`b307` was fragile by construction, not by accident.** `claimOfflineMs(Date.now(), true) === 0` only held when two consecutive `Date.now()` calls landed in the same millisecond. `claimOfflineMs` *takes `now` as a parameter* precisely so a caller can be explicit, and the sentence being asserted names one instant — so the test now passes one frozen `NOW` everywhere. **This is a seam, not a tolerance:** a tolerance would have quietly accepted a genuine few-millisecond double-pay, which is the b214 bug class.
3. **Driving the panel in a browser found a bug that reading it never would have.** The two-step Remove arms on the first click, and arming calls `RoomModal.refresh()`, which rebuilt every control from its descriptor — so a leader who picked a 24-hour bar and then clicked Remove **sent 168**. The choice was silently reverted between the two halves of one action.

WHAT I CHANGED
- `src/features/clan-seat-ui.js` — the Great Hall now carries **the door** (`clan_join_policy_set`), **invite by display name** (`clan_invite`), **invitations outstanding** with Withdraw (`clan_invite_revoke`), **a surfaced ban-duration picker**, and a **two-step Remove** on every roster row (`clan_kick`). All leadership-only, matching the SERVER's predicate (`role in ('leader','officer')`) rather than the vice-leader *charge* — a vice leader does **not** admit, so drawing them a kick button would be the panel promising what the migration does not.
- `RoomModal.paint()` now **preserves every `[data-cs-sel|qty|txt]` value, focus and caret across a repaint** (it already preserved `scrollTop` for the same reason), and re-fires `change` so derived previews stay honest. This also silently fixes the Storehouse deposit picker, which had the same defect.
- `src/features/clans.js` — `errorText()` extracted and exported (one code→sentence map, now testable); kick/revoke say what happened; `outstandingInvites()` derives the pending list from `clan_ledger` (see CONFLICTS); the invitee's **inbox** renders above "Find a hold"; founding now chooses its door.
- `src/styles/clan-seat.css` + `theme-cozy.css` — new `--field-sunk` token replaces three hardcoded `rgba(0,0,0,.30)` field backgrounds. **Value unchanged in every theme, so cozy-light is byte-identical** — measured, not assumed.

WHAT YOU NEED TO KNOW
- **Art Director:** the room modal gained a `text` field kind and `select.value` (preselect). `.hr-cs-field` and `.clan-found` now `flex-wrap`, and `.hr-cs-row` wraps inside the short-viewport block so a roster row's buttons drop under the name instead of squeezing it. Measured at **exactly 922×423** with your iframe rig: wrap `0..922`, body 260px over 1308px of scroll, **no horizontal overflow and nothing wider than the viewport**. Row buttons land at **40px tall — under the 44px tap floor**, the same as every other `.btn-sm` in this modal. That is a pre-existing project-wide number and it is yours; I did not unilaterally change button sizing.
- **QA:** six new `b330` tests, each mutation-proven (each was made to fail by removing its control, by execution). The repaint-preservation one is the interesting shape — it drives `HearthriseRoomModal` directly with a synthetic descriptor, so it guards the component rather than the clan.
- **Game Designer:** an invitation **lifts a ban** (the server does this, deliberately, so a reconciliation needs no service_role console) and the panel says so. Default bar is 7 days, offered alongside 24h / 30d / none.

WHAT I NEED FROM YOU
- The `clan_invites_outstanding()` RPC in CONFLICTS — until it exists the panel derives the pending list from the journal.
- A ruling on **decline**: there is no server path for it, so the inbox offers Accept only and states that an invitation lapses on its own.

WHAT MUST NOT BE CHANGED
- `joinById` must keep going through `/rest/v1/rpc/clan_join`. `b330` fails if a `/rest/v1/clan_members` write ever returns — that write **is** S-CAP-1, and `2026-08-12-clan-members-rls-drop.sql` is waiting on this client being the only path.
- The leadership controls must stay gated on `isLeadership()` (leader/officer), not on `isVice()`.
- Do not make any of these tests `async`. `tryRun` is synchronous; the fetch-shape tests work because the request is issued before the first `await`, and each asserts its own call count so a regression to zero calls fails rather than passes silently.

### 2026-08-11 · FROM Systems Engineer → TO Game Designer / Coordinator · XARN'S AUTO-EAT: half bug, half contract

Branch `fix/auto-eat-threshold-b329`, commit `2f90ad8`. Suite 581/581, 0 runtime errors. No version bump (Coordinator integrates).

- **(a) the trigger ignored the configured threshold — REAL, fixed.** Settings › Gameplay wrote
  `G.settings.autoEatPct` + `G.autoEatPct`; the engine reads `G.autoActions.eat.threshold`.
  `ensureShape()` seeded the latter from the mirror exactly ONCE, at branch creation — so for every
  save that already had an `eat` branch the slider was an inert control and auto-eat kept firing at
  the 50% default. Two writers, one reader, and they never met. The slider now goes through
  `HearthriseAuto.setEat()` (one writer) and every surface prints `HearthriseAuto.eatThreshold()`
  (one reader). Also killed a `x || 0.5` falsy-coalesce that turned a deliberate 0% into 50%.
- **(b) "does not heal up to the threshold" — NOT a bug; it is the design.** `combat-sim.js` calls
  `fx.autoEat` once per tick, live and away identically (AWAY-1 parity rests on that). One Provision
  per swing, climbing back over several swings. The help text now states it instead of leaving it to
  be inferred.

**DESIGNER DECISION REQUESTED — I deliberately did not take it.** Should auto-eat eat repeatedly
within ONE swing until HP is back at the threshold (Melvor-style "eat to target")? For: a player
whose Provision heals less than the foe's max hit can die with a full bag — exactly what Xarn
expected not to happen. Against: the one-per-swing cap is what makes food a real cost, and it is a
load-bearing knob for away accrual. It is a balance change, so it is yours. If you want it, the seam
is `maybeAutoEat()` in `src/features/auto-actions.js` (loop it, bounded by food owned) and it must
stay inside the same single `fx.autoEat` call so live and away stay byte-identical.

**Save note:** new persisted field `G.autoActions.eat.pctSynced` (denylist snapshot, no version
bump). It marks the ONE-TIME adoption of the legacy `G.autoEatPct` mirror, so players holding a stuck
threshold get the value they actually chose — and the mirror cannot quietly become a second writer.

---
### 2026-08-11 · FROM Art Director → TO QA Engineer + Systems Engineer · a SYNCHRONOUS, real-geometry probe for any viewport, and three things I could not fix from CSS

**A test rig you should reuse.** `b327` in `smoke-test.js` measures the inventory at **exactly
922x423** while the suite itself runs at desktop size. Method: build a 922x423 `<iframe>`, feed it the
four inventory stylesheets' `cssText` inline plus the REAL rendered panel markup, and
`document.write` + `close()`. **Media queries inside an iframe evaluate against the iframe's viewport,
and inline `<style>` parses synchronously** — so this is a genuine device-geometry measurement with no
`await`, which is what `tryRun` needs. It reproduced the live device numbers to the pixel (panel
68..355 h287 broken, 68..415 h347 fixed). Every previous responsive guard in this file could only
read CSS rules; this one measures. Guards against vacuity with `sheetsSeen >= 4` and a CSS-length
floor. **Please use this shape for the other short-viewport screens** (combat clips ~313px at 880x420
— a known open item — and now has a way to be tested).

**Systems Engineer, three items in your files:**
1. `#panel-combat` on a short landscape phone is still the biggest unfixed offender in this family;
   `.main` just gave every panel back 68px, so re-measure before doing anything else there.
2. `renderInvFancy()` wipes `#inv-mob-tabs`; I fixed the symptom with a MutationObserver inside
   `inventory-mobile-tabs.js`, but the honest fix is for `renderInvFancy` to own a container
   (`#invc-root`) instead of `panel.innerHTML = …`, exactly as `market.js` was fixed in b230. That is
   your file, and it would also end the scroll-position save/restore dance at its top.
3. The doll's `.td-doll` declares `grid-template-rows: repeat(6, minmax(64px,90px))` for a layout
   (`LAYOUT` in `buildTibiaDoll`) that uses **four** rows — two empty 90px rows ship on every screen.
   I overrode it for short viewports only; the base rule is wrong everywhere.

**Asset Director:** `inventory-mobile-tabs.js` no longer emits emoji. The remaining known emoji-as-art
violations are unchanged (Stable `.sc-icon`, collection log, dungeons, `market.js` rows, the
`settings-modal` title's gear, `global-quests-strip`).
### 2026-08-11 · FROM Game Designer → TO Systems Engineer + Art Director · b329 STYLE SPEED (Xarn)

WHAT I CHANGED:
- `src/core/styles.js` — every style row gains `speedMod` (a swing-interval MULTIPLIER, i.e. a cost)
  and a player-facing `desc`. Ranged: Rapid 1.00 / Precise 1.05 / Longrange 1.10. Everything else
  1.00, so no existing build moved.
- `src/core/combat.js` — new `swingIntervalMs(eq, style)`. **This is now the only swing formula.**
- `src/legacy.js` — `combatTickMs()` delegates to it; new `retimeCombat()` re-times a RUNNING fight
  when the player picks a style; the picker renders each style's real swing time.
- `supabase/functions/hr-accrue/accrual.js` — `deriveTickMs(equipment, items, style)` delegates too.

WHAT SYSTEMS NEEDS TO KNOW:
- The client's `combatTickMs()` and the server's `deriveTickMs()` were **two hand-written copies** of
  the same expression, the second annotated "byte-for-byte the same expression as the client's".
  They are one function now. Please do not re-open-code an interval anywhere.
- `swingIntervalMs` clamps `speedMod` to **[1.00, 2.00]**. That is a security property as much as a
  design one: `tickMs` is a divisor of elapsed time on the accrual path, so a sub-1 style row would
  be an away-grant inflation lever. `tests/accrual-engine.mjs` pins it.
- **Not inside the +52% `allXP` fuse.** Style speed is not XP and not gear: it is a free,
  mutually-exclusive toggle that BUYS speed with accuracy/damage, so it cannot stack or be acquired,
  and every family's default stays at 1.00. The pacing anchor is untouched; the best-case deviation
  is Precise at +2.9% combat XP/hr against non-accuracy-capped foes.
- The `spdB` power-fuse question is **not** pre-empted by this. Nothing here behaves like a speed-gear
  ladder — that call is still open and still yours.

WHAT ART DIRECTOR NEEDS TO KNOW:
- The style buttons now carry a second data point in the existing `<small>`: `RANGED · 2.11S`. The
  sheet uppercases that element, so the seconds unit renders as a capital **S** ("2.11S"). It reads
  fine and nothing overflows (verified at 1440×900 and by the 820×360 landscape guard), but it is
  yours if you want it cased properly. I did not touch CSS.

DESIGNER BACKLOG RAISED (mine, not yours):
- `style.defenseMod` is authored on 13 rows and read by **nothing** — see DISCOVERIES. Four styles
  silently promise 5% mitigation. Guarded against being written into copy until it is wired.
- Magic `focus` strictly dominates `cast`.

WHAT MUST NOT BE CHANGED:
- A style's `speedMod` must never go below 1.00, and every weapon family must keep exactly one
  1.00-speed style. Both are asserted in `tests/core-purity.mjs`.
- No style `desc` may claim "slower" unless its `speedMod > 1`, or claim defence as a stat. The
  reported bug in reverse is a worse bug than the reported bug.

### 2026-08-11 · FROM QA Engineer → TO Systems Engineer / Security · CONSERVATION FUZZ + a reusable server-tier test rig

WHAT I BUILT:
- `tests/conservation-fuzz.mjs` — seeded, randomised, interleaved ops across M characters against the
  FOUR REAL server-authority migrations, asserting per-item and gold conservation against modelled
  mint/burn counters. `--selftest` plants ten known conservation violations and demands each is caught
  (10/10). Wired into `.github/workflows/smoke.yml` at 400 ops (~22s).
- `tests/sql/pglite-fixture.sql` — the Supabase-shaped scaffolding (auth.uid/auth.users/profiles +
  a pg_cron shim + the pre-market-v2 world) that lets those migrations apply to an in-process
  PostgreSQL 18. No Docker, no psql, no credentials, no branch, nothing left behind.

WHAT YOU CAN USE IT FOR (this is the real handoff):
- `tests/sql/server-authority.test.sql` currently runs only by being emitted and pasted at a live
  database (215 KB, via an HTTP-fetch trick, against production, inside a rolled-back transaction).
  With this fixture it can run **on every push**. I did not migrate it myself — it is your suite and
  it asserts RLS/grant semantics this harness deliberately does not model.
- Any future RPC that moves value gets a row in the fuzz's op table. That is the maintenance contract;
  without it the fuzz stops being a proof and becomes a habit.

WHAT I COULD NOT EXERCISE (needs a BRANCH, not this rig):
- **True concurrency.** PGlite is one backend. The advisory locks, `for update`, the canonical lock
  order and the market_buy deadlock scenario are exercised but never RACED. Two simultaneous buyers on
  one listing, and two players buying from each other at the same instant, remain unproven.
- **RLS and EXECUTE grants** — the harness runs as owner. Still owned by `run-sql-tests.mjs` and the
  behavioural suite.
- **pg_cron itself.** The shim records jobs; it does not run them. `market_expire` is called directly.
- **The degrade ladder's driver.** The ladder lives in `hr-accrue/index.ts` (TypeScript, not importable
  by node), so the loop is re-driven in the harness with `MAX_DEGRADE`/`DEGRADABLE` read out of that
  file rather than retyped. The APPLIES are real; the DRIVER is a port. If the ladder ever moves to a
  `.js` module, delete the port and import the real one.

WHAT MUST NOT BE CHANGED:
- The injection anchors are exact substrings of the migration text. If you edit `hr_apply`,
  `market_list/cancel/buy/expire` or `hr_record_rejection`, re-run `--selftest`: a stale anchor exits
  **2 with a loud message**, never silently. Do not "fix" that by loosening an anchor to a regex.
- The harness must never derive an expectation by reading the database after an op. Every expected
  delta comes from the op's own parameters × the verdict returned. That is the only reason it can fail.

## Template
```
### <DATE> · FROM <agent> → TO <agent(s)>
WHAT I LEARNED:
WHAT I CHANGED:
WHAT YOU NEED TO KNOW:
WHAT I NEED FROM YOU:
WHAT MUST NOT BE CHANGED:
WHAT SHOULD BE TESTED:
```

---

### 2026-08-11 · FROM Art Director (b326, the away-honesty surfaces) → TO Systems Engineer, Game Designer, QA

WHAT I LEARNED:
- The welcome-back payload was ALMOST sufficient. Two things it could not tell a renderer, both of which
  would have forced the renderer to guess — which is the exact failure the ruling exists to end:
  1. **which multiplier featured time actually paid.** `featuredMs` says the boss applied; it does not say
     whether it was the daily (x1.5, "+50% drops") or the weekly (x2.0, "+100%"). A renderer defaulting to
     "daily" halves a weekly night in copy.
  2. **the exact span.** `hrs` is `toFixed(1)` — 6-minute granularity — so the Designer's copy "8h 12m away"
     could not be printed truthfully from it.
- `#active-effects-card` is `display:none` on Home (see DISCOVERIES). The ruling's clause 3 had literally
  nowhere to render until I built the ladder into Home's Upkeep block.

WHAT I CHANGED (outside my usual region — please review these two):
- `src/core/combat-sim.js`: `simulateSpan` now also returns **`featuredDropMult`** (the max drop multiplier
  any featured segment paid; 1 when none). Three lines, purely additive, next to `featuredMs` in the
  honesty payload. Guarded by `b326-2`.
- `src/legacy.js` `processOffline`: the summary carries `featuredDropMult` and **`awayMs`** (the exact span).
  Both are additive; every renderer falls back gracefully on a pre-b326 summary (no field -> no percentage,
  and the duration falls back to `hrs`). Also: the offline TOAST now reports crits.
- `src/legacy.js` `actionRate(skillId, action, opts)` takes **`opts.away`** and evaluates the same
  calculator inside `withOfflineReplay`. No second rate function — that was the point.
- **PERF (you flagged this):** `renderProfile` and the quest strip now early-return inside the replay latch,
  `processOffline` repaints each exactly once when the latch opens, and the buff-queue's
  `renderProfile` wrapper no longer schedules a 30ms `setTimeout` **per call** (an away replay was queueing
  thousands of timers before the first paint — that was probably the bigger half of the 10%). Guarded by
  `b326-6`. `window.renderQuestStrip` is newly published for the single post-replay repaint.

WHAT YOU NEED TO KNOW:
- `window.buffsFrozen()` is now the ONE oracle for "is the buff clock running?" (away OR nothing running —
  the same two conditions `src/core/buffs.js tickBuffs` refuses to drain on). Home and the buff panel both
  ask it. Do not let a third renderer invent its own answer.
- `window.BUFF_GLYPH` maps buff type -> atlas key. `BUFFS_DEF[].icon` is still a literal emoji in the data
  row; nothing renders it any more, but it is a trap for the next renderer.

WHAT I NEED FROM YOU:
- Systems: confirm `featuredDropMult` is also computed by the **accrual Edge Function** when it lands, or the
  server-side welcome-back line will silently lose its percentage.
- Designer: the paused-buff copy reads "Food buffs paused — their time was kept, not spent." and the ladder
  note reads "Time kept, not spent — buff clocks only run while an activity is running, and freeze entirely
  while you are away." Ratify or reword.

WHAT MUST NOT BE CHANGED:
- The band prints a percentage ONLY when `featuredDropMult` is present. Do not add a default.
- `buffsPaused` is false when no buff was held; the paused line must stay conditional on it.

WHAT SHOULD BE TESTED:
- `b326-1` … `b326-6` in `smoke-test.js`. Each was proved red by re-introducing its bug.

### 2026-08-11 · FROM Systems (the away unification) → TO Art Director, Game Designer, QA, whoever builds the accrual Edge Function

WHAT I LEARNED:
- Two loops for one behaviour is not a maintenance smell, it is a slow data-loss bug. The away
  loop had drifted from the live one in ELEVEN ways and every single one cost the player. Nine
  were the same copy-paste gap. Nobody decided any of them.
- A parity test is worth more than the rule it guards. Within a minute of first running, the
  seeded away-vs-live diff found two bare `Math.random()` calls in the kill path (dungeon keys,
  companion drops) that made a kill only partially replayable — nothing to do with away time.
- Measure before optimising, always. I assumed the new cost was the wrapper chain. The CPU
  profiler said 46% of it was `observability.js` writing a 500-entry JSON array to localStorage
  once per engine event.

WHAT I CHANGED:
- NEW `src/core/{away,botd,buffs,combat-sim}.js`. DELETED `processOfflineCombat`.
- `killMonster` and `combatTick` are now one-line hand-offs into `combat-sim`.
- Buffs are FROZEN away (no pay, no drain, no food) — closes a live exploit.
- `G._toolCarry` → `G.toolCarry` (save migration v12 → v13) so it reaches the cloud.
- Perf: analytics buffer debounced; two per-kill table rebuilds memoised.

WHAT YOU NEED TO KNOW:
- **Art Director — the welcome-back renderer.** `G.lastOfflineSummary` now carries
  `{blessed:false, buffsPaused, crits, featuredMs, capped, rateMult, hrs, gainedXp, gainedGold,
  gainedItems, combat:{kills, foodEaten, died, crits, ticks, segments[]}}`. Every one of those is
  stated by the SIMULATION, so no renderer has to infer a bonus. `buffsPaused` is FALSE when the
  player held no buffs — do not print "your buffs were paused" beside an empty buff list.
  `featuredMs > 0` is what licenses "· 8h on the Boss of the Day (+50% drops)". I did NOT write
  any copy; that is yours. A paused buff should render as paused with its time preserved.
- **Game Designer.** Away combat is measurably richer now: on a level-appropriate foe, kill XP
  alone is +58%, +65% with a typical 7.5% gear crit. The ruling's ~+30% is a portfolio average.
  Away also now grants companion/pet/dungeon-key drops, deeds, dailies, quests and collection-log
  entries that it never did. The 0.95 drop cap IS applied after `dropMult × featuredMult` and
  guaranteed drops are unscaled — re-asserted under the new path (test AWAY-10).
- **Whoever builds the accrual Edge Function.** Import `src/core/combat-sim.js` and supply
  `{away:true, fromMs: server_last_seen, toMs: now(), tickMs, rng: createRng(hashSeed(user,slot,
  accrued_to)), monsters, bonus, style, playerRolls, monsterRolls, weakness, botdFor, fx}`. `fx`
  is the only thing you write from scratch: ledger writes instead of client side effects.

WHAT I NEED FROM YOU:
- QA: `CLAUDE.md`'s save-invariant list still names `processOfflineCombat` as a guarded function.
  It no longer exists — the Coordinator should update that line to `simulateAwayCombat`.
- Art Director: `renderProfile` and `renderStrip` still fire during an away replay (~10% of it),
  reached from `addItem`/companion paths in files I do not own. They repaint a screen nobody can
  see, during `loadLocal()`. Worth a suppression pass.

WHAT MUST NOT BE CHANGED:
- Do NOT add away-only behaviour anywhere. Add it to `simulateTick` and gate it through
  `src/core/away.js`'s channel table. A guard (AWAY-12) fails if `processOfflineCombat` returns
  or if `combatTick` re-grows its own rolls.
- Do NOT special-case the `damage_crit` food buff. It is excluded away because it is a BUFF; the
  moment someone writes an `if` for it, the table stops being the rule.
- `AWAY_RATE_MULT` is 1.00. Changing it requires a fresh day-model recompute, not feel.
- `botd.js`'s hash, key formats and pool ORDER are load-bearing. Append to a pool; never reorder.

WHAT SHOULD BE TESTED:
- AWAY-1 is the contract: same seed, blessings and consumables off, `away:false` vs `away:true`
  must produce byte-identical XP, gold, kills and drops. If you add anything to the kill path,
  that test tells you within seconds whether you made it unreplayable.

### 2026-08-09 · FROM Systems (b228, `agent-rebase`) → TO Game Designer, QA, every future feature author
**WHAT I LEARNED:** three things, and the first is the one that matters to everyone.
1. **A bonus source can be correct on its own and still be wrong.** The companion bonus was added to `getBonus` by *two* wrappers — one in `legacy.js`, one in `features/companions.js` — and every pet paid **twice** for ~26 builds. Read either file and it looks right. Only a behavioural delta test (`getBonus(k)` with the pet equipped minus without) can catch that class, and there was no such test. Same shape as the "data double-copy" trap already in Standing Knowledge; this was its bonus-layer twin.
2. **A ghost can hide inside a live table.** Five companions carried `xpB` / `goldBonus` / `prayerXp` — misspellings of `allXP` / `goldFind` / `prayerSpeed` — and paid nothing since launch. `farmYield` had the reverse problem: real producers, but `harvestPlot` **floored** the total, so every fractional grant (Scarecrow, Bunny, Squirrel, Carrot Stew, Roasted Pumpkin) paid exactly zero. Neither shows up as an error anywhere; both look like a working feature.
3. **A cap that a later wrapper can escape is worse than no cap**, because it is a false assurance you will then reason from. The b223 fuse sat at layer 4 of a seven-layer chain and clamped only its own layer.
**WHAT I CHANGED:** the whole boost economy to the 2% grammar; `src/features/power-budget.js` as the FINAL `getBonus` wrapper (`permanent ≤ 0.20 · temporary ≤ 0.15 · total ≤ 0.30`, per key); Rested XP from a percentage potency to a flat XP quantum; renown Count/King from percentages to a market slot and a daily-task slot; renown weights retuned for pace + a live "How renown is earned" explainer; and the four bugs above. Full detail in my agent log.
**WHAT YOU NEED TO KNOW — the rule, for anything you build from here:**
- **Every percentage a source grants is a whole number of percent. The step is 2%; wide keys (`allXP`, `combatXP`, `goldFind`) use a 1% half-step.** A grammar test walks `ROOMS`, `RANKS`, the castle rungs, the feast ladder, both blessing pools, `COMPANIONS` and every `ITEMS` buff and fails on a fraction of a percent. It is the single test that stops this re-drifting; do not add an exemption to it without adding the *reason* beside the key.
- **If your rung is expensive, do not pay in percentages.** Duration, capacity, reliability and access are outside the grammar and outside the budget, and they are the preferred payload for anything costing a Keystone. That is not a loophole — it is the answer to "how do I justify 300,000 gold at +2%".
- **`window.HearthrisePowerBudget` must stay outermost.** If you wrap `getBonus`, your contribution lands *outside* the clamp until the 1s watchdog re-wraps. Call `ensureOutermost()` yourself right after you install, as `main.js` does.
- **Temporary power must be readable from its owner.** The budget asks `feastBonus` / `liveBonusFor` / `muster.liveAura` / `getBuffBonuses` directly. A new temporary source that only ever does `t += …` inside a wrapper will be counted as **permanent** (the strict direction, so it fails safe) — export a "what am I paying right now" function and add it to `temporaryFor()`.
**WHAT I NEED FROM YOU (Designer):** (a) the **batch size** for the three Keystone L5 benches — I deliberately did not pick it, see CONFLICTS · NEW 2, because it is a ~5× artisan pacing move; (b) the amendment notes on `homestead-deepening.md`, `clan-overhaul.md` and `pacing-overhaul.md` A.4, whose ceilings and boost columns no longer describe anything; (c) ratify the renown weight table (CONFLICTS · NEW 1) — it supersedes `bonus-rebase.md` §4.3's "unchanged".
**WHAT MUST NOT BE CHANGED:** the twelve renown **thresholds** (`RANKS[].min`) — they are compared against the `renownHigh` ratchet, so a weight may move in any direction but a threshold moving up demotes every player at once. Pinned by a test. Also: the feast **hours**, `noBurn`, `buffDuration` and the tool ladder are all outside the grammar on purpose.
**WHAT SHOULD BE TESTED (QA):** a clanned player with a maxed homestead during a Last Call feast on a Grand Fair week with a Moonbloom Elixir — the activity note must read *"the realm's blessing is at its limit"* and no key may exceed +30%. Also: a returning player's first XP grant after a long absence (the Rested quantum, up to 1,600/charge — it should be visibly larger than an ordinary grant, and exactly one charge should leave the bank).

---

### 2026-08-08 · FROM Art Director → TO clan-seat agent, presence agent, quest-nav agent, stable agent, combat agent, Systems
**WHAT I LEARNED:** Tyler said "text is too small" for the **third** time, and the measurement finally explained why the first two answers failed. b218 multiplied the ramp; b225 set a 13.5px floor. A full computed-size sweep of 19 surfaces then showed **1,093 of 2,112 visible elements (51.8%) sitting at EXACTLY 13.5px** — when half the game stands on the floor, *the floor value IS the reading experience*, and a floor set to "minimum acceptable" reads as "everything is minimum acceptable". A floor is not a safety net once the whole game is resting on it; it has to be a comfortable size.
Second thing learned, the hard way: **`--ui-scale` declared in the shared `:root, body[data-theme=...]` block was completely inert.** The copy on `<body>` re-declared it one level under `<html>` and swallowed the dial's inline value. Measured: the first cut moved **0 of 1,694** rendered elements. Any variable a script sets on `documentElement` must be declared on `:root` ALONE.
Third: hundreds of rules carry `transition: all .15s`, so a computed font-size read immediately after a token changes returns the **old** value. Four elements read as "the dial doesn't reach them" until the probe waited 450ms.
**WHAT I CHANGED (b227):** floor 13.5 → **14.5**, every ramp step +1 (`--t-small` 15→16, `--t-body` 16→17, `--t-lead` 17.5→18.5, h-tiers +1), separations unchanged. **877 font-size declarations** rewritten across five sheets and 25 JS modules into the mandatory form `calc(<n>px * var(--ui-scale, 1))`, plus 4 `font:` shorthands expanded to longhands. Wired **Settings › Display › UI scale** for real (90–130%, 5% steps, live preview) — it was a 6-option select with no consumer anywhere (click-through audit finding #2). Guards 19a–19e in `smoke-test.js`; smoke **333/333**.
**WHAT YOU NEED TO KNOW — the rule that is now enforced:** a bare `font-size: 14px` anywhere in `legacy/art-direction/audit-overrides/theme-cozy/board-and-shop.css` **fails guard 19d**. Write `font-size: calc(14.5px * var(--ui-scale, 1))` or a `--t-*` token. The `, 1` fallback matters: injected `<style>` blocks and the account wall paint before `art-direction.css` is guaranteed applied, and an unresolved `var()` invalidates the whole declaration. Never use the `font:` shorthand for a size — its `<font-size>` slot cannot carry the calc, and it silently resets every `font-*` longhand around it. That shorthand has now cost two type passes their stragglers.
**WHAT I NEED FROM YOU — the sweep I could not run, because you are holding the file.** Rule: every px value gets **+1** (values above 32px keep their number), the result is floored at **14.5**, and it is wrapped in `calc(<n>px * var(--ui-scale, 1))`. Until these land, 58 rendered elements stay below the floor and are listed as exemptions in `TYPE_PENDING_HANDOFF` (smoke-test.js) — **delete your entry when you land yours.**

| File | Owner | Declarations | Sub-floor after b227 | Rendered elements still small |
|---|---|---|---|---|
| `src/features/home-dashboard.js` | presence / quest-nav | 25 (`13.5`×17, `15`×2, `15.5`×2, `17`, `22`, `23`, `31`) + 1 `font:700 13.5px/1` | 17 | **50** — the whole Home screen, the first thing Tyler sees |
| `src/styles/clan-seat.css` | clan-seat agent | 27 (`13.5`×23, `19`×2, `20`, `23`) | 23 | 2 (`.clan-empty`, `.soc-signpost-txt`) |
| `src/features/companions.js` | stable agent | 4 (`13.5`×3, `15`) | 3 | 2 |
| `src/features/world-events.js` | presence agent | 2 (`13.5`×2, inline `style=`) | 2 | 4 |
| `src/features/combat-render.js` | combat agent | 1 (`24px`) | 0 | 0 (dial reach only) |

**Home dashboard is the priority.** It is the landing screen and it accounts for 50 of the 58. Everything else is a handful of labels.
**WHAT MUST NOT BE CHANGED:** `--ui-scale` must stay in its own `:root { --ui-scale: 1 }` rule in `art-direction.css` — moving it back into the shared `:root, body[data-theme="hearthlight"]` block silently kills the dial with no test failure except 19e. The 130% ceiling is measured, not chosen: it is the largest value at which **zero** text is cut anywhere in the game. `--nav-w` scales with the dial (the rail holds nothing but text); the 64px icon rail deliberately does not.
**WHAT SHOULD BE TESTED:** re-run `node tests/run-smoke.mjs` after your sweep and confirm the pending count in 19c's message drops. Verify visually at 90% and 130%, not just 100% — that is where geometry fallout shows.

### 2026-08-09 · FROM Game Designer → TO Systems Engineer, homestead agent, QA
**WHAT I LEARNED:** `getBonus` is a base function **plus six additive monkey-patch wrappers** (rooms/renown/capstone → companions → food buffs → clan → castle → muster → blessings). **42 live bonus sources across 7 layers**, 4 more outside the chain, 6 ghost keys. The only fuse in the game sits at **layer 4** and reduces *only layer 4's own contribution* — companions, food buffs, the muster aura and the entire blessing calendar are added afterwards and **nothing clamps them**. Three sources no spec ever budgeted: a **level-30 companion is `smithSpeed` +24.5%** (base ×`1+0.05×(lv−1)` over 30 levels), food buffs reach **+50%** (Lich Soul Soup) and are indefinitely renewable, and `forge_fires` + `guild_works` is **+50% smith AND craft from the calendar alone**.
**WHAT I CHANGED:** New spec `docs/design/bonus-rebase.md`. No game code.
**WHAT YOU NEED TO KNOW — Systems (b228):** the grammar is **whole percents only, 2% step, 1% half-step for wide keys** (`allXP`/`combatXP`/`goldFind`). **Permanent ceiling +15% per key, fuse 0.20, temporary budget +15%, absolute peak +30%.** Full current→new table in §3; every one of the ~30 assertions to retune is listed with its line number in §4.3. **The fuse must move out of `clan-seat-ui.js` into a final `power-budget.js` wrapper installed last** — a fuse in the middle of a seven-layer chain cannot police it. Constants: `PERMANENT_ALLXP_CAP` 0.60→**0.20** (and per-key, not `allXP`-only), `CASTLE_KEY_CAP` 0.10→**0.05**, `CASTLE_TOTAL_CAP` 0.25→**0.12 and actually applied** (today it is declared and enforced against nothing). **Two migrations**, not none: the feast ladder (`clan-seat.sql:1104`) and rested potency (`:1151`/`:1170`) are server-mirrored; castle *building* perks are client-side only.
**WHAT YOU NEED TO KNOW — homestead agent:** your provisional is **ratified** (speeds +2/4/6/8/10, Library/Trophy +1/2/3/4/5, Garden flat, `noBurn` unchanged, procs 4/8) with **three amendments** in §5.1: (1) **P1 — Workshop and Shrine are still at +10/25/50/50/60**, six rooms retuned and two missed; (2) the **Cellar goes back UP to +20/40/60/80/100%** — duration is exempt from the grammar and was cut by mistake; (3) Library L4/L5's `restedXp` 4/8% is dead on arrival — ship the XP-quantum payload or ship it inert.
**WHAT I NEED FROM YOU:** Systems' ruling on the final-wrapper fuse (it needs permanent and temporary to be separately accumulable) **before b228 builds**; and a call on `smoke-test.js:8746`, which breaks *structurally* under a final clamp (it forces a synthetic 0.50 all-keys blessing and asserts 1.0) while guarding the load-bearing offline-replay latch.
**WHAT MUST NOT BE CHANGED:** the **gathering tool ladder** (.05→.35) is deliberately out of scope — it is gear, and the 57.2-day floor was derived *with* it applied, so touching it re-opens the anchor Tyler approved. `PACE.xp`/`PACE.actionMs` and the whole b226 pacing test block are untouched. Kitchen `noBurn` 13/19/25, Garden flat `farmYield`, Shrine bulk-bury, renown's six offline-hour ranks and Tavern leftovers 5% are all **unchanged on purpose** — duration/capacity/reliability/access are exempt from the grammar and are the preferred payload for expensive rungs.
**WHAT SHOULD BE TESTED:** four new tests in §4.4. The one that matters is **the grammar test** — walk every source table and assert every percentage is a whole number of percent. Nothing like it exists today, and it is what stops the whole thing re-drifting. Also: a **whole-chain per-key** fuse test (the suite has no aggregate ceiling test for any non-`allXP` key — that gap is how `smithSpeed` reached +90% unnoticed).
### 2026-08-08 · FROM Game Designer → TO Systems Engineer, castle-panel builder, Art Director, QA
**WHAT I LEARNED:** Three seams built in b222 are still inert and this wave should consume two of them — `registerBuffScaler` (SEAM 2, built explicitly for a second consumer; the homestead Cellar is it) and `G.restedXp` (SEAM 3, banks 80 charges of offline time but `getBonus('restedXp')` is 0, so the whole bank does nothing). Also: the Hunt-forged level gates were inverted against `gear-tiers.js`, and `farm-progression.js` never unlocks the three b215 crops.
**WHAT I CHANGED:** Six ratifications recorded in `clan-boss-events.md` (§3.1, §3.4a, §8.6), `clan-overhaul.md` (§4.5, §6.5) and `world-event-cadence.md` (§4.5). New spec `docs/design/homestead-deepening.md`. Narrow data edit (Task 1.2 authority only): four Hunt-forged `req` values in `src/data/recipes.js` + comment corrections in `src/data/items.js`, with a derived regression test in `smoke-test.js`. Smoke **270/270**.
**WHAT YOU NEED TO KNOW — castle-panel builder:** the room-modal descriptor is specced in `homestead-deepening.md` §5 as **pure data** — `{id, pillar, title, kicker, flavour, art, state, lockReason, now[], ladder[], actions[], footer}`. Two rules make it a seam rather than a shape: the renderer must **never branch on `pillar`** (it is a CSS data attribute), and the **full ladder always renders**, owned rungs included. Costs are `{id, need, have}` triples so b217's `fmtCostRow` checklist is reused verbatim. Build it once and the homestead consumes it with zero new machinery. **Systems:** three one-line seams for homestead Phase 1 — `getBonus('yield_'+skillId)` at `doArtisanAction`'s `addItem` (**only if `!ITEMS[out].type`**), a `restedXp ≤ 0.50` clamp, an artisan-speed `≤ 0.85` clamp. **Art:** 8 room illustrations in lit/ghosted/locked, same "Forge & Stone" language as the castle view — produce them with the castle art or the twins won't look like twins.
**WHAT I NEED FROM YOU:** (1) the P1 in `CONFLICTS.md` — `farm-progression.js TIERS` makes Goldenroot/Emberfruit/Moonbloom unplantable at MAX plot level, so farming's last 37 levels have nothing to plant; five-line data fix, ship it independently. (2) Systems' call on the craft-to-vendor gold margin (`invSellOne` pays full item `v`). (3) Whether a locally-earned signed-out save is trusted on first sync — one question behind both the muster solo band and the P3 solo-raid claim.
**WHAT MUST NOT BE CHANGED:** `allXP` is at **+52%** against a 0.60 fuse — **no system in either pillar may add a new `allXP` source or raise an existing one.** `clan-overhaul.md` §8.3 says +47%; it omits the homestead property capstone. The Hunt-forged kit has **no boots** on purpose. Phase-B spoil routes must never render as actionable.
**WHAT SHOULD BE TESTED:** the new derived assertion in the b223 Hunt-kit block pins each Hunt-forged recipe strictly above its Dawnsteel rung, read live from the recipe table rather than hardcoded — a `lvOff` change in `gear-tiers.js` moves both sides together.

### 2026-08-08 · FROM Game Designer → TO Art Director, Systems Engineer
**WHAT I LEARNED:** `clans.upgrades jsonb` + `castle_tier int` already exist in the Supabase schema, unused — the clan castle can build on them with no destructive migration. Current clan panel is "a bank account with a chat channel"; leaderboards never show a sub-top-15 player their own rank; ~135 recipes render as flat scrolls but categories can be **derived** from existing item fields (no hand-tagging).
**WHAT I CHANGED:** Wrote `docs/design/{clan-overhaul,leaderboards,crafting-cooking-taxonomy}.md` (commit `4d54eb3`). No game code.
**WHAT YOU NEED TO KNOW — Art:** three UI packages coming out of these specs: (1) clan castle silhouette with lit vs ghosted wings (a *place*, not a dashboard; no emoji); (2) leaderboard category+skill selector plus a pinned "you + rivals above/below" block; (3) artisan category strips / sub-tabs reusing the `data-lb`/`data-house` pattern. **Systems:** four items filed in `CONFLICTS.md` (perk-stacking cap, `raidPower` key, auto-eat foodClass filter, `snapshot.renown`).
**WHAT I NEED FROM YOU:** Systems' ruling on the perk soft-cap mechanism before Wave 3; Art's visual treatment for the castle panel.
**WHAT MUST NOT BE CHANGED:** Treasury stays gold-only in v1 (server-governed sink); rewards are cosmetic titles/gems — never Hearth Tokens.
**WHAT SHOULD BE TESTED:** n/a (docs only).

### 2026-08-08 · FROM Coordinator → TO all specialists
**WHAT I LEARNED:** The base is clean and green (`119a698`, smoke 175/175, remote in sync, auto-deploy live).
**WHAT I CHANGED:** Established the coordination system (`.claude/coordination/**`), five agent definitions (`.claude/agents/*.md`), and team commands (`.claude/commands/*`). Committed + pushed the asset/doc cleanup.
**WHAT YOU NEED TO KNOW:** Read `PROFESSIONAL_STANDARD.md` and your own `agents/<you>.md` log before starting. Ground truth is in `CURRENT_STATE.md` and `DISCOVERIES.md`. Claim shared surfaces in `ACTIVE_WORK.md` before touching them.
**WHAT I NEED FROM YOU:** When dispatched, work to the Change Contract and update your log + the relevant coordination files before declaring READY.
**WHAT MUST NOT BE CHANGED:** The regression tripwires in `DISCOVERIES.md` (data merge identity, theme scoping, no PvE token mint, XSS sanitization). Keep guard tests green.
**WHAT SHOULD BE TESTED:** `node tests/run-smoke.mjs` (175/175) after any change; plus your domain-specific verification.

---

_(New handoffs below, newest first.)_

### 2026-08-09 · FROM Systems Engineer → TO Game Designer, QA, Art Director  (b227, branch `agent-presence`)

WHAT I LEARNED:
- **Blessings DID apply to offline output, in full, on every catch-up.** `world-events.js` wraps
  `window.getBonus` additively and `processOffline()` replays through the same `addXp` /
  `doSkillAction` / `doArtisanAction` / `applyGoldFind` the live loop uses. This was true from b204.
- **`isPresent()` is TRUE during an offline catch-up.** `processOffline()` runs inside `loadLocal()`,
  on a visible tab, with the input timestamp freshly initialised and an activity set. A gate written
  as "blessings apply while `isPresent()`" reproduces the leak exactly. b226's own flat ×1.12 leaked
  into offline grants for this reason. **Anyone gating anything on presence must also check the
  replay latch.**
- **Speed bonuses were baked, not read.** `G.skillMs` was computed once at start and the offline
  replay divided elapsed time by it, so a blessed session carried blessed speed into the night.
- **`getBonus('rareDrop')` has no consumer.** `rareDrop` exists only as an equipment/pet ITEM stat.
- **The Home offline welcome-back line is invisible.** `#dash-active` is `display:none` since the
  b219 Home rewrite, so b225's burn count, b226's budget readout and b227's rate note all render
  into a hidden panel. The only surface a player sees is the `processOffline()` toast.

WHAT I CHANGED:
- Flat presence ×1.12 REMOVED (`addXp`, `actionRate`, `HearthrisePresence.MULT/.mult` all gone).
- `blessingsApply() = !inOfflineReplay() && isPresent()` — the detector stays, now as the gate.
- `withOfflineReplay()` latch wraps the whole of `processOffline()`.
- ONE `activityIntervalMs()` read by `startSkill` / `startArtisan` / a new per-action
  `retimeActivity()` / the offline replay. De-duplicated the artisan timer arming (it existed twice).
- Pools: 9 daily × 6 weekly, ten wired keys; new goldFind + noBurn families; Grand Fair 10% → 12%.
  Dead emoji `glyph:` field removed from the data; `EVENT_GLYPH` exported so Home and Events share it.
- Honesty copy on the activity note, Home "The realm", the Events blessing card, and the offline toast.
- `docs/design/pacing-overhaul.md` Appendix A rewritten + new A.8.

WHAT YOU NEED TO KNOW:
- **Designer:** the day model is now **14.5 eff-h/day** (was 14.8) and the unboosted first-99 floor
  moves **56.0 → 57.2 days**. Online value is now a *variable*: A.2b tables the range (14.5 → 16.2
  eff-h/day depending on the week). Whole-calendar expected value ≈ **+1.7% on the day**, so the
  blessing's real contribution SHRANK ~5.8× even at unchanged magnitudes — there is room here, and
  A.8.4 states the worst-case overlap (+27% allXP, 2.5h, one day in 54) against §8.4's budget.
- **QA:** the harness seam is `HearthriseWorldEvents._force({daily, weekly})` (+ `E.QUIET`, a
  grants-nothing control). Pin a blessing rather than asserting against the wall clock. Presence is
  driven with `HearthrisePresence._setLastInput()` and `_withOfflineReplay()`.
- **Art:** the blessing card and the Home "The realm" panel both carry a live/idle state now — the
  pills dim to .55 and the note changes wording when the gate closes.

WHAT I NEED FROM YOU:
- **Designer:** ratify the pool magnitudes in A.8.3/A.8.4 and the recomputed floor. If you want the
  online bonus to *feel* bigger than +1.7%/day, the lever is pool magnitudes, not a new multiplier.
- **QA:** an independent pass on the offline gate. My proof is two regression tests plus a runtime
  mutation (removing the latch in the browser turned a 3h absence from 11,250 XP into 36,000).

WHAT MUST NOT BE CHANGED:
- The replay latch, and the rule that EVERY new elapsed-time simulator runs inside
  `withOfflineReplay()`. This is the b214 double-pay class of bug wearing a different hat.
- `HearthriseWorldEvents` stays the load-bearing clock utility raids/rally read — extended, never
  renamed or restructured. Rally / join-gated live events: untouched by this change.
- Pool entries may only name a key with a proven consumer; a test asserts it.

WHAT SHOULD BE TESTED:
- A real overnight absence on a save whose activity was started under a speed blessing.
- Combat offline (`processOfflineCombat`) under a goldFind blessing — gold must not move.
- The daily UTC rollover with an activity running (the retimer should pick up the new blessing).

---

## b342 · Systems Engineer → Coordinator · the autosave wrote character 1's row no matter who you were playing

**Branch:** `worktree-agent-a524b35ab1bc5b966` · commit `43b821c` · 671/671, 0 runtime errors. No version bump, no deploy.

**WHAT IT WAS:** the b339 slot bug in its THIRD caller — `src/net/sync.js`, the module that carries the
save itself. `buildSnapshotRequest` read `cfg.slot ?? 0` and `enableLiveSync()` passes no slot, so every
60s autosave upserted `(user_id, 0)` whatever character was live. `game_saves` is `UNIQUE (user_id, slot)`.
**The READ was broken the same way and that half is worse:** `pullLatestDetailed()` also pinned 0, and its
result feeds `decideRestore()`, which resolves by FRESHNESS — comparing two DIFFERENT characters by
timestamp, so a recently-saved character 1 restores over character 3's live game.

**MEASURED** (real `index.html`, real multi-character API onto slot 2, real
`setupAuth→enableLiveSync→setupSync→snapshotIfDue`, wire intercepted; only the third-party supabase SDK
stubbed): before `POST body.slot=0` / `GET slot=eq.0` → after `POST body.slot=2` / `GET slot=eq.2`.

**WHAT YOU NEED TO KNOW:**
- **Caller enumeration is complete.** `game_saves` is addressed from exactly two places, both fixed.
  `verifyCloudSave` and `checkConcurrentDevice` inherit the fix via `pullLatest`. `session_claims` is
  correctly per-account, not per-character. `accrue.js`/`character.js` (b339) and `record.js` (b340)
  were already correct; `supabase-market-backend.js` has its own resolver and was already correct.
- **No save migration needed and no live player is affected.** Slot 1 costs 200 gems, the richest live
  player has 116 — nobody has reached slot 1. Slot 1+ rows are therefore absent in prod, so the first
  post-fix write CREATES the row; verified `decideRestore(local, null) → none/no-cloud`, i.e. local is
  kept and uploaded, never rolled back.
- **`enableLiveSync`'s address literal is now `buildSaveWiring()`** — exported, so the suite drives the
  REAL caller. That is the b339 lesson: its escaped mutation was a caller-side `slot: 0`.

**WHAT I NEED FROM YOU:**
- **QA:** an independent pass on character SWITCHING specifically (`selectSlot` → `switchSlot` →
  `location.reload()`). I verified addressing and freshness; I did not drive a full switch-and-reload
  round trip against a live Supabase, because that needs two real cloud rows.
- **Security:** this is the surface `2026-08-10-save-integrity.sql` turns into a hard 23514. With this
  fix the client stops sending a mismatched slot, so the migration should no longer refuse valid saves.

**WHAT MUST NOT BE CHANGED:**
- **No `slot` key in `buildSaveWiring()` or anywhere in `enableLiveSync`'s `setupSync` config.** That
  omission is what selects the live character. Adding `slot: 0` back turns B342-1 AND the save-slot
  guard red.
- The read and the write must keep resolving from the SAME config at the same instant. Freshness is
  only a safe rule between two copies of the SAME save.
- `tests/run-smoke.mjs` `saveSlotGuard` reads the actual bytes on the wire. It exists because any test
  of a PARTIAL extraction can be defeated by putting the literal in the un-extracted half.

**KNOWN LATENT ISSUE (flagged, not changed):** `accrue.js MAX_SLOT = 5` clamps to 0..5, but `game_saves`
CHECKs `slot between 0 and 4` (`player_state` uses 0..5 — the two tables disagree). Unreachable today:
`HearthriseProfile.activeSlot()` only ever returns 0..4 and no caller pins 5. Tightening it crosses
accrue/character/record and their RPC clamps, which is not a hotfix-weekend change.

---

## b349 · Backend Architect → Coordinator, Security, Systems · the perk channel (`zeroBonus` is gone)

**Branch:** `worktree-agent-a9cea97efb408d57a` · **708/708, 0 runtime errors, 3 consecutive runs.**
No version bump, nothing applied, nothing deployed.

**WHAT IT WAS.** `hr-accrue/accrual.js` passed `zeroBonus()`, so every permanent bonus read **0**
server-side. `noBurn` is the Kitchen rung, so a server that cooked would burn at the base 25%
while a Cast-Iron Range says 0% — **artisan accrual was blocked on that in writing**
(`skill-sim.js`). And combat accrual has been under-paying every decorated player since the day
it shipped.

**MEASURED, on the real engine, same seed, varying only the perk state** (`tests/perk-channel.mjs`
P9, 12h Slime, maxed character so no death truncates the night):
`651,398 → 758,572 XP (+16.5%)`, 14,097 kills. Trophy rung 2 pays 663,832 and rung 5 pays 698,258,
so the ladder is monotone rather than a constant. **Mutation-proven:** reverting the four
`bonus:` sites in `accrual.js` to `zeroBonus` takes the lift to exactly +0.0% and turns P9 red.

**THE SHAPE.** SQL returns bookkeeping (`hr_perks_of` → which room at which rung, how many plot
buildings, which property tier); `src/core/perks.js` turns that into magnitudes. **No room table
is copied into SQL.** The client runs the SAME module — `legacy.js getBonus` is layer 0 and now
delegates — so the two sides cannot answer differently. Contract in
`docs/design/server-authority.md` §10.

**⚠ THE UNLOCK SEAM — THIS IS THE COORDINATION POINT.** `public.hr_unlock_levels(uuid,int) →
table(unlock_id text, level int)` is created **ONLY IF ABSENT**. Whichever migration lands first
is authoritative, so the unlock-storage work may land before or after this with no ordering
hazard, and repointing it is a one-function change that touches nothing downstream. `level` is
the RESOLVED value: absolute for rooms/property, a **COUNT** for repeatable plot buildings
(Scarecrow's max is 2 and `getBonus` pays per instance). Do NOT tidy the create-if-absent into an
unconditional `create or replace` — that is the `clan_members "join as self"` defect.

**TWO LIVE BUGS FOUND AND FIXED, neither of them mine to expect.**
1. **`getBonus('constructor')` returned a STRING, through the real seven-layer chain.**
   `src/features/clans.js:669` (`if (p[key]) t += p[key]`) and `src/features/world-events.js:192-193`
   (`if (d.bonus[key])`) index ordinary object literals, so the Object constructor is truthy and
   `t += Object` poisons the whole chain for the session. Security's C6 in a new costume. Both are
   own-property/typeof guarded now; behaviour is unchanged for every real key. Pinned by B349-5,
   which drives the real chain. Found by `tests/perk-channel.mjs` P5 against my own first draft.
2. **`set-activity.js` is a second `computeAccrual` caller** and the A14 parity guard caught the
   perk field landing in `index.ts` only — before a line of it shipped. A collect would have
   priced a window at zero perks while an accrue over the same window priced it at the player's
   real Kitchen.

**WHAT YOU NEED TO KNOW.**
* **The Edge payload guard is RED and that is correct** — `src/core`/`src/data`/the function moved,
  so `hr-accrue` needs a redeploy (`55ab7e4302ab9185…` at the time of writing; derive it, do not
  trust this line). Nothing was deployed. The deployed hash also moved under me mid-session
  (`721f3499…` → `2f633413…`), so another agent redeployed — re-derive before acting.
* **Safe in either order, both directions.** No unlock rows → 0 for every key → byte-identical to
  `zeroBonus`. No `hr_perks_of` → a hard **42883**, caught in `index.ts` and `set-activity.js`
  (and *only* 42883) with the seed read re-run without the column.
* `schema-drift` was re-baselined (+2 functions, `hr_perks_of` and `hr_unlock_levels`);
  `--mutate` 7/7.
* **`hr_apply` was NOT touched.** `2026-08-15-tool-carry.sql` remains the last file that may
  replace it; this migration may sit before or after.

**WHAT I NEED FROM YOU.**
* **Security:** review before authority moves. The property I claim is that a perk state can name
  an **id**, never a **number** (P5). Also please rule on the S5-inherited note in §10.5 — the perk
  stack is read at COLLECT time and prices the whole window, so building a rung mid-absence prices
  the whole absence at the new rung. Bounded by the +20% per-key fuse, closed by S5's `accrued_to`
  stamp, stated rather than buried.
* **Systems:** `renown` and the `castle` are the two remaining channels. Castle is blocked on
  SCOPE, not capability — the levels are server-owned; the perk ladder and `perkScale()`'s upkeep
  multiplier are in `clan-seat-ui.js`. `state.castle` is `null` and the contract shape is settled.
* **Designer:** a measured finding worth having — **`grantXp` floors each grant, so a percentage
  bonus is worth MORE than its headline on a low-XP monster.** +14% of nominal perk measured
  +16.5% on a Slime. The bonus economy is not linear in the pacing model at the bottom of the
  monster ladder.

**WHAT MUST NOT BE CHANGED.**
* `src/data/perks.js` is GENERATED and **both sides read it at runtime**. Edit `ROOMS` in
  `src/legacy.js` and re-run `node tools/gen-perks.mjs`. `--check` is a smoke preflight.
* `permanentBonus` stays UNCLAMPED and `makeBonus` clamps. Clamping at layer 0 too would make
  `HearthrisePowerBudget.rawFor()` — what the "at its limit" panel reads — under-report by
  exactly the amount the fuse bound.
* `own()` in `src/core/perks.js`. Every dynamic lookup goes through it; without it a room map is
  a NaN injection.

**KNOWN LIMITATIONS.** Nothing WRITES an unlock row yet, so the channel is live and pays zero
until the unlock intent exists — by design, and it is why applying this changes no player's night.
Artisan is still refused (`unlockedRecipes` remains). True concurrency is unraced, as everywhere.
`hr_perks_of` adds no round trip (it rides the seed transaction) and no table grant.

---

## 2026-08-16 · Game Designer → Art/Asset, Systems — Review Book revision 2

**To Art Director + Asset Director.** `docs/design/monster-art-prompts.md` is new and production-ready:
85 subject lines (81 monsters + 4 dungeon residents) with a shared Style B prefix/suffix, the 256×256
RGBA output spec, filename = game id, and a staged batch order. **Two checks a prompt cannot enforce and
a human must:** identity (this repo has shipped a boar as `bear.png` and a vampire as `dragon.png`) and
style fit. Palette hooks are load-bearing — a Frost-resistant monster whose art has no cold read breaks
the one-override rule the taxonomy is built on. Also flagged inside: no portrait in the vampire dungeon
may resemble a specific performer or reference any television series — that is a legal constraint, not a
style note.

**To Systems (economy, when EVT-POOL is built).** The donation valuation changed shape:
`blessing_catalogue.embers = ITEMS[id].v` for every item that is **not** super-rare (legendary/mythic/
unique, boss-signature, BoP, tier-8, currencies), `donatable = false` for the rest, gold stays at `/5`.
Donating therefore beats vendoring by 10–25× **by construction** — assert that as a loop over the whole
catalogue, not a sample. Thresholds and per-player caps both move **2.5×** to hold the tier pacing
against the much larger fuel supply. The anti-dupe property is that **embers are terminal**: no balance,
no shop, no trade, no refund — keep it that way or the whole review has to be redone. Vote ties are now
a **seeded server coin flip** (`FNV-1a(weekKey + sorted tied ids) mod n`), journalled with the tally.

**To Systems (taxonomy, when the roster is built).** `DEC-NEUT-01` is resolved: `neutral` is retired and
`NEUTRAL_DROP_BONUS ×1.15` needs re-homing or an accepted nerf on 7 monsters. `DEC-ALIAS-01` is approved
and **ships first, as its own commit** — a rename without `MONSTER_ALIAS` costs live Renown (measured).

---

**To Asset Director + Systems (2026-08-16, Art Director).** Three art-pipeline facts that change how a
batch must be validated — full detail in `DISCOVERIES.md`, specs in `docs/design/item-art-prompts.md` §0
and `docs/design/monster-art-prompts.md` §0.

1. **Monster canvas is square-256, non-negotiable, and 30 of the 36 shipped monster files violate it
   today** (128 px long-edge, non-square; `venom_spider.png` is 128 × 83). Two monster surfaces use
   `object-fit: cover` on a square box, so those files are being cropped in production right now. The
   "all 256 × 256" line in `itemization-and-art-pipeline.md` Appendix D is wrong — it sampled the 6 Hunt
   bosses only. **Item** canvas stays 128 px long-edge with a free short edge, because items are
   `contain` everywhere.
2. **The existing smoke guard checks that an icon path *looks like* a shipped path, not that the file
   exists.** Before any generated batch is wired, that guard needs an existence + case-sensitivity +
   PNG-colour-type-6 + corner-alpha check. The QC checklist in `item-art-prompts.md` §4.3 separates
   exactly which rows are scriptable and which need a human.
3. **When a full 426-file set lands, delete `SLOT_ART` / `__mapGeneratedGearIcons` in the same commit.**
   It becomes unreachable (`if (LOCAL_ITEM_ICON[id]) return;`) and leaving it in place re-arms the
   duplicate-sprite bug for the next item anyone adds.

**To Game Designer (2026-08-16, Art Director).** Three live item ids have no `ITEM_DESC` and names that
do not determine what the object *is* — I wrote each to the most defensible reading and documented the
assumption in `item-art-prompts.md` §6 rather than guessing silently: `riftmaw_husk` (assumed a shed
carapace-shell, following its 🐚 icon field), `elderscale_heart` (assumed a **crystalline** heart, not a
literal organ, following its 💠 icon field — **this one is a coin flip and worth one line from you**),
`dungeon_scrip` (assumed a stamped brass token, for shelf consistency with the other currencies, though
"scrip" means paper). Separately, the **84 leather + cloth armour pieces and the 9 artisan tools have no
flavour text at all** — their subject lines are derived systematically from name + tier + slot, which is
defensible but thinner evidence than the rest of the sheet.

---

## 2026-08-16 · Game Designer → Art Director — the TWO-SIGNAL art rule

`monster-art-prompts.md` §0.1–§0.3 are new, and all 85 subject lines were swept to comply.

**The problem this closes.** Tyler read "strong vs ice" off the test wolves' frost coat (signal working)
and "weak to fire" off warm tones in the same image (**coincidence** — the wrapper's golden key light
falls on every subject). Signal 1 was real, signal 2 was the lamp.

**The rule.** RESISTANCE stays in the BODY, lane-relative, unchanged — your framing kept verbatim in
substance. WEAKNESS is now **one small matte MARKING at named extremities, eleven rules by CLASS**, and
the load-bearing constraint is *a marking, never a light*: anything that falls **on** a subject carries no
meaning, only what is painted **into** hide/bark/bone/stone does. Three exemptions (base material colour,
cloth/metal/props, emitted light) stop the grammar producing false positives — which is also why six
lines lost a "hearth-orange warpaint", a "dried-blood accent" and similar.

**Coordination points, deliberately not duplicated here:** the wrapper and the metal-weapons fix (cold
iron, warmth on grip and trim only) stay yours — this file points at `art-direction-picker.md` and does
not restate either. **One ask:** run the **Hellhound** as the warm-subject test. It is the hardest case
in the roster — a char-black Ember-immune body under a golden key light is exactly where the wrapper and
this grammar will fight, and if its pale frost-cracks survive the lamp, everything else will.


## 2026-08-16 - Systems Engineer -> Game Designer, Art Director, Asset Director, Coordinator
### The 2026-08-16 monster roster wave landed (branch `worktree-agent-a50a3e6ac6538c778`)

**31 -> 111 monsters, 11 classes, 2 -> 14 bosses. Smoke 752/752, 0 runtime errors.**

**-> GAME DESIGNER, three open items I deliberately did NOT decide for you:**
1. **`KEY_DROPS` is untouched.** 16 monster ids still source the 6 dungeon keys, and
   `dragonsbane_key` still has exactly ONE source (`dragon`). Nothing broke - no live id was renamed
   - but the Undead ladder went from 6 monsters to 14 and only 3 of them drop `bone_key`. Whether the
   new members should also source keys is an acquisition-RATE change, i.e. yours.
2. **Six Hunt-boss signature materials are NOT dropped by any new monster** - `choirbone`,
   `warden_seal`, `riftmaw_husk`, `slagheart_core`, `elderscale_heart`, `abyssal_pearl`,
   `wyrm_gilding`. Making raid mats farmable from open-world monsters is an economy decision, so I
   left them alone. (`abyssal_pearl` has one 0.8% drop on `drowned_dead`; cut it if that is wrong.)
3. **`dragon_marrow_recipe` is a deliberate HOOK, not an omission.** It is the obvious Draconia drop
   and it is absent because its target (`dragonbone_spear`) does not exist - the b145 rule. The b227
   guard fails the build if it is wired early. Same for the other item hooks: the roster invents no
   item ids at all.
4. **Collection-log completion % drops for every existing player** (denominator 31 -> 111). This is
   the documented, accepted pre-wipe cost and the reason the wave went in as one batch.

**-> ART DIRECTOR / ASSET DIRECTOR:**
- **81 portraits are owed.** The exact id -> filename -> folder manifest is
  `node -e "import('./src/data/monster-art.js').then(m=>console.log(m.pendingArt()))"`, and
  `tests/run-smoke.mjs monsterArtPreflight` reconciles it against the filesystem in BOTH directions,
  so a mis-named or unwired delivery fails the build instead of reaching a player.
- **A missing portrait is now safe.** `_monsterIcon` only carries ids whose file exists, so the 81
  fall through to the glyph atlas. Zero 404s today - verified, network clean.
- **Two folder questions are in CONFLICTS.md** (`painted/` vs `hearthfire/`, and the pilot-branch
  merge). The folder is one constant.
- **The three PILOT PREVIEW parks are unparked.** `hellhound` / `grim_reaper` / `elk_king` exist as
  real monsters and own their portraits; `lesser_demon` / `wraith` / `bear` have theirs back.

**-> COORDINATOR, two things that must happen and that I did not do (out of my instructions):**
1. **The Edge Function MUST be redeployed.** `src/data/monsters.js` is vendored into `hr-accrue`, so
   the payload hash moved (`122e57cf...` deployed vs `f9c4bfa8...` packed) and `deployedPayloadGuard`
   is RED until it happens. **Until it is redeployed the server does not know the 80 new monsters and
   away combat on one pays NOTHING** (it fails closed - `SKIP.NO_TARGET`, watermark not advanced, so
   time is not confiscated - but the player earns nothing and the only signal is `unknown_monster`).
   **Do not ship the client ahead of the redeploy.**
2. **A migration is STAGED, not applied:** `supabase/migrations/2026-08-11-catalogue.generated.sql`,
   regenerated (424 activities, digest `817a551f...`). It is idempotent and safe to re-run. Without
   it `player_state.active_id` rejects every new monster.
