# DISCOVERIES

_Important things agents learn about the codebase, game, or constraints. Append new entries at the top. Every entry: DATE · AGENT · DISCOVERY · AFFECTED SYSTEMS · REQUIRED ACTION. This is how the team avoids rediscovering the same knowledge._

---

## 2026-08-16 · Art Director · Hearthfire art pilot: what the 13 Recraft exports actually did in-game
**Affected systems:** `applyLocalIcons()` in `src/legacy.js`, `assets/icons-bundle/`, the art-prompt specs.

**1 · `items/oak_log.png` is a byte-for-byte duplicate of `weapons/bronze_sword.png`** (both md5
`807eea02c0963e92643ba68859891b8e`). It depicts a sword. Withheld from the wiring; 12 of 13 shipped.
The generic lesson: **hash the batch before wiring it.** A duplicate across two *different category
folders* is invisible to a filename check and invisible to an alpha/size check — only a content hash
or a human eye catches it, and at 426 files a human eye will not.
→ REQUIRED ACTION: add a duplicate-hash gate to the batch QC before the full run.

**2 · The exports come back ~3% translucent, and it is not deliberate.** Every one of the 13 has its
SOLID interior sitting at alpha 240–254 (mean ≈ 247/255), not 255 — measured with a per-file alpha
histogram, not sampled. Over the hearthlight dark surface that reads as a faint wash on every icon.
The fix is one line and belongs in the pipeline, not in the prompt: lift `a >= 240` to 255 **on the
1024 source, before the downscale**, so the resample interpolates already-correct values. The true
anti-aliased edge ramp lives below 240 and must be left alone. `tools/art-pilot-process.mjs` does this.

**3 · The arena portrait is a CIRCLE, and `monster-art-prompts.md` does not say so.** The spec's
framing rule is "eyes and face inside the middle 70%", which `elk_king` satisfies — and its antlers,
which are the entire silhouette read of the character, are still clipped, because `.arena-portrait` is
a **92 px circular mask with `object-fit: cover`**. A 256 × 256 square loses its four corners there.
→ REQUIRED ACTION: amend the monster spec — the whole readable silhouette must fit the **inscribed
circle**, not the square. Horned / antlered / winged / haloed subjects are the ones this bites.

**4 · 128 px long-edge for items ignores devicePixelRatio.** The figure in `item-art-prompts.md` was
derived from the 64 px CSS box of the item-detail modal. At DPR 2 that box is 128 device px, so 128 px
art is exactly 1:1 with zero headroom; on a DPR 3 phone it is upscaled. The pilot ships **256 px
long-edge** (~120 KB/icon) to restore the intended 2×. Proposed amendment, not yet ratified.

**5 · The pipeline needs no image dependency — Playwright's chromium is enough.** `sharp`/`jimp` are
not installed and do not need to be. Canvas `drawImage` + `getImageData` does alpha stats, alpha-bbox
auto-crop, high-quality downscale and RGBA re-encode; the PNG IHDR is then re-read from disk to *prove*
dimensions and colour type 6 rather than trusting the encoder. See `tools/art-pilot-process.mjs`.

**6 · How to screenshot any screen headlessly, for any agent.** `page.addInitScript` setting
`window.__HR_TEST_HARNESS__ = true` clears the account wall; **also set
`localStorage['hearthrise:ftue:completed'] = '1'`** or the 6-step welcome tour dims every capture, and
expect the daily-reward modal on top of that. For an arena portrait, set `G.playerMaxHp`/`G.playerHp`
high first — a dead champion drops the arena back to "Choose a foe" and there is nothing to photograph.
Harness: `tools/art-pilot-shots.mjs`.
### 2026-08-17 · Game Designer · P1 · THE PER-CALL ITEM CLAMP IS A CONTENT-DESIGN CONSTANT, AND IT PINS EVERY CONSUMABLE BATCH IN THE GAME

Found while sizing Runecrafting and Stonemason (b357). `hr_apply`'s `c_max_item_delta` is **1,000,000
units of any one item per call** and the reachable offline cap is **15 h**, so the arithmetic every
future recipe author needs is:

```
units_at_the_cap = floor(54,000,000 / (recipe.ms × PACE.actionMs)) × recipe.outputQty
```

That caps production at **~40,000 units per hour of crafting, for anything**, and the guard line is
60% of the clamp. It is not a server detail — it is the single hardest constraint on consumable
design in the game, and it decides the answer to "how long does supplying a night cost?" before any
designer opens a spreadsheet. Magic burns 1,429 runes/h, so the clamp *mandates* ~21 hours of
casting supplied per hour of crafting and no more. The seven shipped `fletch_*` rows (batch 500-1000)
sit at **4.0-7.7×** the clamp and are amnestied in `AMMO_CLAMP_BASELINE`; they pay a player ~1/8 of
their night with an incident logged on every degrade attempt.

**AFFECTED:** every `outputQty` in `src/data/**`, `tests/accrual-engine.mjs` clamp guard, Fletching.
**ACTION:** size batches from the formula, not from "how many arrows feels like a stack". The full
derivation — and the design argument for why ~23 min/night is *better* than the 500-batch's ~4 min —
lives in the header of `src/data/stonecraft.js`. Do not add to the amnesty list.

---

### 2026-08-17 · Game Designer · P2 · A NEW SKILL RENDERS CORRECTLY AND LOOKS UNFINISHED — TWO ART GAPS, NEITHER MINE TO FIX

Verified in a real browser (1440×980, zero console errors) with Runecrafting 34 / Stonemason 48.
Both skills list, open, paint their tile grid and drive the lane strip natively. Two legibility gaps:

**1. NO SKILL MEDALLION (→ Art Director).** In the Activities rail every existing skill shows a gilt
medallion; Runecrafting and Stonemason show **blank space** where it should be, because
`HearthriseIconSet.medallion(id, 30)` has no entry for them and the fallback is empty rather than a
glyph. Two rows in the sixteen read as broken rather than as new.

**2. EVERY RECIPE TILE FALLS BACK TO A PLACEHOLDER (→ Asset Director).** All 11 Runecrafting tiles
draw the same **chest** glyph and all 7 whetstone tiles the same **sparkle**, because the 24 new item
ids have no entry in `LOCAL_ITEM_ICON` / `_itemPath`. A ladder whose rungs are visually identical is
a ladder the player reads as one thing — which is precisely what the tier tint (`itemTintClass`) was
introduced to solve for shared sprites, and it cannot help here because there is no sprite at all.

**AFFECTED:** `applyLocalIcons()` in `src/legacy.js`, `assets/icons-bundle/resources/`,
`HearthriseIconSet.medallion`. **ACTION:** 24 item icons (3 stone, 3 block, 3 blank, 7 rune,
7 whetstone, 1 ashlar) + 2 skill medallions. The mechanics are complete and tested; this is the
difference between shipping it and shipping it well.

---

### 2026-08-16 · Art Director · P1 · A `<span>` INSIDE A NUMERAL IS RESTYLED BY THIS CODEBASE, AND `|| 0` IS A FULL-BALANCE BUG WITH THE SIGN HIDDEN

**Three findings from the UNKNOWN-balance sweep (b356), all measured, all of which will bite the next agent.**

**1. NEVER WRAP A RENDERED NUMBER IN A NEW ELEMENT.** `src/styles/*` ship several
`… span { font-size: … }` and `… span { color: … }` readability blankets. Adding
`<span class="bal-known">1,234,567</span>` inside an existing `<b>` — purely for DOM symmetry, no
styling of its own — dropped Home's user-card gold figure from **21.5px to 14.5px** and changed its
colour in cozy-light. The blankets target the tag, so the wrapper is the thing that gets styled.
**AFFECTED:** any renderer that thinks about wrapping a value for a hook. **ACTION:** put the class
on the element that already holds the number (`paintBalance` does), or emit bare text. If you must
introduce an element, it needs `font-size: inherit` and a colour at a specificity that beats an
id-anchored `!important` — see §16 of `art-direction.css` for the measured numbers.

**2. A STATE CLASS NEEDS MORE THAN `!important` HERE — READ THE MATCHED-RULE LIST.** Two live rules
are `!important` **and** id-anchored (`body[data-theme="hearthlight"] #top-gems`,
`body[data-theme="hearthlight"] #panel-house :not(…)`). A new `.my-state { color: X !important }`
loses to both. The reliable way to find out *which* rule is winning is to walk
`document.styleSheets` and `el.matches(sel)` on the live element — guessing from source cost an hour.

**3. `(G.value || 0)` AS A BASELINE IS A FULL-VALUE BUG, NOT A ROUNDING ONE.** Three independent
copies of "record today's starting gold" used `G.gold || 0`. Once `gold` can be UNKNOWN the baseline
is recorded as **zero**, and the first server envelope's *entire balance* is then reported as
"earned today" — auto-completing the *Earn 500 gold* daily and inflating two Home surfaces.
**AFFECTED:** every watermark/delta pattern, not just gold — inventory, skill xp and hearth tokens
follow the same field onto `SERVER_OF_RECORD`. **ACTION:** a baseline you cannot measure is not
taken. Refuse and re-attempt on the next tick; do not substitute a zero.

**AND A NOTE ON CENSUSES:** the handoff's "359 unguarded `G.gold` reads" counted `smoke-test.js`,
which owns 330 of the 501 occurrences in `src/**`. The production surface was 171. Re-derive a
census before you plan against it.

### 2026-08-15 · Systems Engineer · P0 (integration) · A DERIVED SERVER LIST WIDENS SILENTLY, AND THE CLIENT HALF OF THE CONTRACT DOES NOT COME WITH IT

**Discovery:** `supabase/functions/hr-accrue/set-activity.js` defines
`SETTABLE_KINDS = ['idle', ...PAYABLE_KINDS]`. Deriving it is *good* design and its author says so
in a comment — "when gathering accrual lands, PAYABLE_KINDS grows and this grows with it, in one
edit, with no second list to remember." That is exactly what happened, and it is precisely why b348
shipped broken: the edit that taught the engine to pay gathering **also widened the client-facing
contract, in a file no client author was reading, with no diff on the client side to review.**
The client's `ACTIVITY_KINDS` stayed `['combat','idle']`, `startSkill` declared nothing, and Tyler's
first switch-on test died in minutes with `player_intents` at 0 rows and `player_state.version` at 0.

**The general lesson, which is bigger than this seam:** *derivation removes the second list, it does
not remove the second SIDE.* Any derived server-side allowlist that a client must mirror needs a
mechanical link, or the derivation actively hides the widening from review. Both halves looked
correct in isolation and both were reviewed.

**Affected systems:** the activity intent (client `src/net/activity.js`, `src/legacy.js`; server
`set-activity.js`, `accrual.js`), and every future intent that copies this shape — gold, inventory,
craft, equip. Nine more intents are planned on this pattern.

**Required action (done for this one, and the pattern to copy):** two links, because one cannot
cover both failure modes.
  1. `tests/activity-seam.mjs` (Node, in `run-smoke.mjs`) — the server's list and the client's list
     must be the SAME SET, and every settable kind must have a declaration CALL SITE. Catches
     "nobody wrote it".
  2. `B348-2/3/4` (browser) — iterate the client's list and drive a **real player gesture** for each,
     asserting the bytes on the wire. Catches "it is written and unreachable".
Mutation-proven: widening `PAYABLE_KINDS` to include `artisan` now turns the build red by name.

**Second discovery, same investigation:** `active_kind = 'idle'` on the wire is TWO different
sentences — "you stopped, and I know because you told me" and "I have never been told anything" —
and they are byte-identical. Every character that has never declared starts idle, so treating idle
as authority ends the session of every player whose save predates the seam. The client must track
which of its own declarations the server ACKNOWLEDGED (`isActivityConfirmed`) and only obey an idle
that contradicts an acknowledged pointer; an unacknowledged one is a cue to DECLARE, not to stop.
Any future intent that reconciles a client pointer to a server default has this same problem.

---

### 2026-08-15 · Systems Engineer · P0 (test integrity) · `tryRun(name, asyncFn)` IS AN ALWAYS-GREEN TEST — the sync runner cannot see an async body fail

**Discovery:** `smoke-test.js`'s `tryRun` is `try { fn(); return pass(name); } catch {...}`. Give it an
`async` function and it gets a **promise**: nothing throws synchronously, the catch is unreachable, and
`pass(name)` is returned before one assertion has executed. The test prints `✓` and is
indistinguishable from a real one. `tryRunAsync` is the awaiting runner (18 tests use it correctly).

**How it was found — and this is the transferable part.** I wrote two of these while fixing Xarn's
reports. Seven separate mutations, **including restoring the exact bug the tests were written for**,
all came back **GREEN**. Reading the tests would never have found it; only mutation did. This is the
same family as b347's lying `buffsPaused` guard and b332's "proof of the adjacent thing", moved one
layer down: not a wrong assertion, but a runner that never reaches any assertion.

**AFFECTED SYSTEMS:** every test in `src/features/smoke-test.js`; by extension every count this
project has ever reported.

**REQUIRED ACTION (DONE in b348):** `tryRun` now detects a thenable return and FAILS with
`ASYNC BODY ON A SYNC RUNNER … Register it with tryRunAsync()`. Mutation-proven: registering an async
body on `tryRun` is RED. Audited at the time of writing — only my two new tests were affected;
the other 676 registrations are clean. **If you write an async test, use `tryRunAsync`.**

### 2026-08-15 · Systems Engineer · P1 · THE GEAR LADDER HAS TWO AUTHORITIES, AND SIXTEEN RUNGS SIT OFF THE CURVE

**Discovery:** `src/data/gear-tiers.js` generates a level curve; `src/data/recipes.js` hand-authored
rows are spread FIRST and win the merge. **Five of those rows share an ID with their generated twin**
(`forge_iron_helm`, `forge_steel_helm`, `forge_iron_platebody`, `forge_steel_platebody`,
`forge_bronze_belt`), so `mergeGenerated` drops the generated recipe by id and the hand-authored `req`
replaces the curve leaving **no trace at all**. Measured across all 22 lanes: **16 rungs off the
curve, 3 lanes disordered** — plate/platebody INVERTED (steel 60 > mithril 55, exactly Xarn's report),
plate/helm and plate/belt TIED.

**Why no test could see it:** a guard that rebuilt the lanes from item-id patterns would carry a
SECOND copy of the id scheme (plate is `mat.id + '_' + slot.key`; leather and cloth are
`tierId + '_' + slot.slot`), i.e. the same two-authority bug one layer up.

**AFFECTED SYSTEMS:** every craftable tiered weapon and armour piece; the b343 availability guard;
the generated `hr_activities` catalogue.

**REQUIRED ACTION (DONE in b348):** the generator now publishes `GEAR_LADDERS` — every lane, its
rungs in tier order, each carrying `itemId`, `recipeId` and the `curveReq` it generated. The guard
reads that and grades the LIVE merged `ARTISAN_RECIPES` gate for **strict monotonicity** (a deviation
from the curve stays legal; a deviation that DISORDERS the ladder does not), and looks rungs up by
**OUTPUT** so an override that renames the recipe (`tailor_leather_boots` beating
`craft_leather_boots`) is still seen. Mutation-proven five ways, including blinding it with an empty
lane set.

### 2026-08-15 · Systems Engineer · P2 · `window.renderInvFancy` HAS NEVER EXISTED — seven guarded call sites resolve to nothing

**Discovery:** the published name is `window._renderInvFancy` (underscore). `item-ux.js` ×2,
`dungeons.js` ×3, `companions.js` ×3, `admin.js` and `dungeon-scavenger.js` all call
`window.renderInvFancy()` behind a `typeof` guard, so they have silently done nothing for their whole
lives. **Verified at runtime:** `typeof window.renderInvFancy === 'undefined'`.

It is masked because `addItem`/`removeItem` are wrapped (legacy.js) to repaint an active bag anyway —
which is why nobody noticed, and why this is a latent trap rather than a live bug.

**REQUIRED ACTION (DONE in b348):** aliased, and DELEGATING rather than binding, so it always resolves
the currently-wrapped implementation (the drag/drop hook re-wraps `_renderInvFancy` later in the file).

### 2026-08-15 · Systems Engineer · P1 · `power-budget.js` RE-WRAPS `window.getBonus` EVERY SECOND, FOREVER — any test that substitutes it is stable for under a second

**Discovery:** `src/features/power-budget.js` installs itself as the OUTERMOST `window.getBonus`
wrapper and then runs `setInterval(ensureOutermost, 1000)` permanently. It re-wraps anything that
does not carry `getBonus.__hrPowerBudget === true`. So a test that does

```js
window.getBonus = (k) => k === 'allXP' ? real(k) + 3 : real(k);
await something();          // <-- one second passes
window.actionRate(...)      // <-- reads a DIFFERENT, re-clamped stack
```

is measuring a stack it did not install. **Measured:** an override reading `3.03` came back as
`0.28` at the next assertion, and the same fixture produced a 3,724ms action interval during a run
and 3,763ms when read back a moment later. The existing synchronous overrides in the suite
(`smoke-test.js` ~3269–3298) are safe *because they are synchronous*; every async one is exposed.

**Affected systems:** any async test or measurement that substitutes `getBonus`, and any code that
caches a bonus across more than a second. It is also the most likely explanation for the
long-standing `b227: OFFLINE output is byte-identical…` flake (it replays a 3h absence twice against
the wall clock).

**Required action:** if you must substitute `window.getBonus`, set `f.__hrPowerBudget = true` on
your replacement — that is power-budget's own published idempotence flag, so it stays outermost and
untouched — and restore the original in `finally`. If your assertion depends on an ACTION INTERVAL,
pin the speed keys (`gatherSpeed`/`cookSpeed`/`smithSpeed`/`craftSpeed`/`prayerSpeed`) to a constant
too; buffs decay and world events rotate underneath a running test. Do NOT buy a tolerance instead —
a tolerance on a span accepts a genuinely mis-measured one.

---

### 2026-08-15 · Systems Engineer · P1 · A GUARDED CALL TO A NAME THAT IS NOT IN SCOPE — `legacy.js` block scope is not one scope

**Discovery:** `processOffline`'s artisan away loop read
`if(typeof hasInputs==='function' && !hasInputs(rec)) break;`. `hasInputs` is declared inside the
IIFE that begins around `legacy.js:10670` and is never published, so at `processOffline`'s scope the
free identifier resolves against the **global object** and is `undefined` — the `typeof` test was
false and **the `break` never executed in the function's entire life**. Measured: 7,500
`doArtisanAction` calls into a bag that had been empty since call 9 (11,250 at the 12h cap); with a
global `hasInputs` published, 8.

**The trap under the trap:** naively "fixing" the guard *removes player-facing behaviour*. The
honest stop the player currently gets — `G.activeSkill` cleared and the "Out of Raw Shrimp — cooking
stopped" toast — comes from `doArtisanAction`'s own refusal branch, i.e. from the extra call the
broken loop kept making. Proved by mutation: publishing a global `hasInputs` left `activeSkill`
stuck on `'cooking'` and deleted that toast entirely.

**Affected systems:** every `typeof someName === 'function'` guard in `legacy.js` that names a
function declared inside one of its ~30 IIFE blocks. `grep` finds the declaration and makes the
guard look wired.

**Required action:** in `legacy.js`, a cross-block call must go through `window.X` (and be *published*
there) or through `window.HearthriseCore.*`, which is in scope everywhere. A bare `typeof X` guard
across block boundaries is silently always-false. When you repair one, check what the broken path was
incidentally *doing* before you delete it.

---

### 2026-08-14 · Systems Engineer · P0 · A WRAPPER PAIR IS A DOUBLE-COUNT. b228 fixed one instance; there were four more in the same feature

**Discovery:** the b228 companion double-count was not a one-off, it was a **pattern**, and the b228
fix only removed the first instance of it. `src/legacy.js` and `src/features/companions.js` each
installed a full, independently-correct set of wrappers on `window.killMonster`,
`window.combatTick`, `window.addItem`, `window.invItemTap` and `window.harvestPlot`. Each wrapper
calls the next, so every one of those seams ran its post-effect **twice**.

Measured in the real client (headless Chromium, real `index.html`, proc chance forced to 1 and the
payout marked so nothing else could be confused with it):

| seam | before | after |
|---|---|---|
| `killMonster` proc | 2 applications, 2 toasts | 1, 1 |
| `killMonster` pet XP | 1.0 (a utility pet earns 0.5) | 0.5 |
| `combatTick` proc | 2, 2 | 1, 1 |
| `addItem` gather proc | 2, 2 | 1, 1 |
| `addItem` cook proc | 2, 2 | 1, 1 |
| `killMonster` companion drop | 2 independent rolls | 1 |
| `invItemTap` Dragon Egg | **2 `confirm()` prompts** | 1 |
| `harvestPlot` `cropsHarvested` | **+2 per harvest** | +1 |

**The lesson worth keeping:** this is invisible to review — *each wrapper is correct on its own*, in
a different file, written by a different layer. Neither `grep` nor reading finds it. The only thing
that finds it is **executing the seam once and counting the applications.** b228's own note said so
and the fix still missed the four instances next door.

**Affected systems:** companions/pets (procs, XP, drops, acquisition), the power budget's companion
census, `HearthrisePetSession` (it only heard from the ESM copy, so it under-reported by exactly
half), the farm/bunny quest and the weekly `wk_harvest` ladder.

**Required action for everyone:** when a feature exists in both `legacy.js` and an ESM module,
**assume the wrappers are duplicated until you have counted them at runtime.** The remaining
suspects are the other seams `legacy.js` and `src/features/*` both wrap — `addXp`, `getBonus`,
`showTab` (wrapped 23×), `renderProfile`, `updateDaily`. Each needs one behavioural count, not a
read. `showTab` in particular is the highest-fanout seam in the codebase and nobody has counted it.

**Guarded by:** `b342 P0: a companion proc applies EXACTLY ONCE per trigger` and
`b342: one harvest counts once, and one Dragon Egg tap asks once`, both mutation-proven RED against
`git checkout HEAD -- src/legacy.js`.

---

### 2026-08-14 - Systems Engineer - P1 - `information_schema` DOES NOT LIST MATERIALIZED VIEWS. Every grant check written against it reads NULL on a matview, forever

**Discovery:** materialized views are not in the SQL standard, so PostgreSQL omits them from
**every** `information_schema` relation - including `role_table_grants`. A check of the form
`select ... from information_schema.role_table_grants where table_name='leaderboard_ranked'`
therefore returns NO ROWS whether or not `anon` holds SELECT on it, and a self-check built on it
passes on a database where the grant is still live.

Found in my own SS5(b) of `2026-08-14-leaderboard-view-lockdown.sql`, by the `matview_left_readable`
mutation firing on the *behavioural* check (SS5(g), `set role authenticated`) instead of on the grant
check that was supposed to catch it. Instance **#14** of the assertion-that-asserts-nothing family,
and the fourteenth was caught only because the mutation proof asserts WHICH assertion fires, not
merely that the migration was refused.

**AFFECTED SYSTEMS:** any migration or audit reasoning about privileges on `leaderboard_ranked`
(the only matview in this schema today) or on any future one. `hr_assert_grant_hygiene` check (4)
uses `information_schema.role_table_grants` for TRUNCATE/REFERENCES/TRIGGER and is blind to matviews
for the same reason - not a live risk today (a matview has no such grants worth holding), but it is
the same hole and it is now written down.

**REQUIRED ACTION:** ask `has_table_privilege(role, relation, priv)` - it reads the ACL directly,
follows role membership, and works on every relkind. Keep the behavioural `set role` probe beside it
anyway: the catalogue answer and the answer a role actually gets are different questions, and this
is the second time on this project that only the second one was true.

**GENERALISE:** a mutation proof that only asserts "the migration was refused" would have scored
this as a pass. Assert the MESSAGE, so a defect caught by the wrong check is a failure.

---

### 2026-08-14 · Systems Engineer · P1 — `pg_depend` CANNOT SEE A PL/pgSQL CALLER. Every "nothing else calls this" assertion built on it reads 0 forever

**Discovery:** a PL/pgSQL function body is stored as an opaque string (`pg_proc.prosrc`). Calling
another function from it creates **no `pg_depend` edge**. Measured on production: `pg_depend`
callers of `hr_rate_ok` = **0**; bodies whose text contains `public.hr_rate_ok(` = **6**.

`2026-08-14-character-bootstrap.sql` §5(K) used `pg_depend` to assert "nothing else calls
`hr_create_character`, so no future STABLE caller can reintroduce the A11 25006 outage". It returned
0 on every database, including the day such a caller is added — the exact outage it was written for.
Instance #13 of the assertion-that-asserts-nothing family, and it was inside the guard that exists
*because of* instance #12.

**AFFECTED SYSTEMS:** any migration self-check reasoning about callers. `prosrc ~ '\yname\y'` is
the measurement that works (it is already the idiom in `authenticated-surface-lockdown` §A9 and
`grant-hygiene`); `pg_depend` works for tables/types/views, not for call edges.

**REQUIRED ACTION:** never assert a caller set through `pg_depend`. And a `prosrc` scan is only
worth more than `pg_depend` if something proves it is SIGHTED: §5(K) now plants a known caller,
requires the scan to find it by name, drops it, and only then believes the zero — with **one query
text executed twice** so the control and the assertion cannot be blinded separately. Mutation-proven
both ways (`nonvolatile_caller_planted`, `caller_scan_blinded`, `caller_scan_pattern_blinded` in
`tests/character-bootstrap-guard.mjs`).

---

### 2026-08-14 · Systems Engineer · P1 — a test that does its own setup of the module under test cannot see the CALLER being wrong. Mutate the caller

**Discovery:** b339's S6 fix made `src/net/accrue.js` resolve the active character slot instead of
using a hard-coded 0, and removed `slot: 0` from `src/net/auth.js`. The new test configured
`accrue.js` itself, so when the mutation put `slot: 0` back **in auth.js**, the suite stayed GREEN —
the bug was fully restored and nothing noticed. Same family as b332's "a proof of the ADJACENT
thing": both halves were real, and the join between them was untested.

**AFFECTED SYSTEMS:** every module in `src/net/**` whose configuration is built inside
`enableLiveSync()`, which no test can reach without a live session.

**REQUIRED ACTION:** when a fix spans a module and its caller, run the mutation on **the caller**.
If the caller is unreachable from a test, that is the bug — extract it. `auth.js` now exports
`buildIntentWiring`/`wireServerIntents`, which the suite drives with spy modules and asserts the
literal objects handed over (B339-3b).

---

### 2026-08-12 · QA Engineer · P1 — HALF THE WEEKLY BLESSING POOL CAN NEVER BE DEALT. `hash()` in world-events.js is not FNV-1a: `h * 0x01000193` is a FLOAT multiply, and the product exceeds 2^53
**Discovery:** `world-events.js` documents its picker as "FNV-1a — tiny, deterministic, good enough
spread". It is not FNV-1a. FNV requires a 32-bit wrapping multiply; this line

```js
h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0;
```

does an IEEE-754 double multiply first. `h` reaches ~2^32 and the prime is ~2^24, so the product is
~2^56 — past the 53-bit mantissa — and the low bits, which are the only bits `>>> 0` keeps, are
rounded away. The result is a hash with almost no avalanche on the near-identical sequential keys
this module feeds it (`hr-weekly-w2947`, `hr-weekly-w2948`, …).

**Measured, in the shipped client, over 730 consecutive days (104 weeks) from 2026-08-12:**

| pool | dealt | never dealt |
|---|---|---|
| WEEKLY (6) | `guild_works` 261d · `grand_fair` 224d · `deep_veins` 245d | **`kings_bounty`, `war_drums`, `long_harvest` — 0 days** |
| DAILY (9) | all nine, 72–91 days each | — |

So **The King's Bounty (+4% gold find), War Drums (+4% combat XP) and The Long Harvest (+1 farm
yield · +4% gather speed) are shipped content that no player will ever see** — and `kings_bounty`
is the worked example the pacing and bonus-rebase docs both cite. The dailies survive only because
9 happens to be a kinder modulus than 6; the daily spread is still visibly lumpy and the same key
repeats for several days running.

**Reproduce:** in the live client — `W = HearthriseWorldEvents;` walk `W.weekly('w' + n)` for
n = 2947…3051 and collect the ids; only three ever appear. (Note you must use the game's own
`_hash`; re-implementing it with `Math.imul` gives a DIFFERENT and correctly-spread answer, which
is itself the proof of the defect.)

**Affected systems:** `src/features/world-events.js` (`hash`, `daily`, `weekly`) and anything that
reads the calendar — the blessing card, the login toast, the live activity note, `liveBonusFor`,
and the power budget's `blessingPart`.

**Required action → Systems Engineer (root cause) + Game Designer (sign-off).** The fix is one
character-class — `h = Math.imul(h, 0x01000193) >>> 0` — but it **re-rolls every player's daily and
weekly blessing**, so it is a player-visible change that needs a Designer nod and a CHANGELOG line,
not a QA drive-by. Ship it with a guard in the same commit: walk both pools over ≥ 2 years of keys
and assert **every** pool member is dealt at least once, and that no single member takes more than
~2× its fair share. That guard fails today, which is exactly why it belongs with the fix. QA has
NOT added it — a knowingly-red test on `main` is the thing this whole ticket existed to remove.

### 2026-08-12 · QA Engineer · P2 — A DATE-DEPENDENT TEST IS A REAL BUG CLASS HERE: the calendar wraps `getBonus`, so any test whose baseline is "ambient bonus is zero" is red on the days its key is blessed
**Discovery:** the long-standing red on `main` (`b222 SEAM 1: goldFind multiplies monster gold`,
first assertion "with no goldFind, gold must be untouched") was **the test, not the game**.
`goldFind` is properly wired (`pacing.applyGoldFind` → `combat-sim.resolveKill`), but since b227 the
daily pool contains `open_coffers` (+3% gold find) and the weekly contains `kings_bounty` (+4%),
and `world-events.js` wraps `window.getBonus` — so on a blessed day the ambient `goldFind` is 0.03
and `applyGoldFind(1000)` correctly returns 1030. **Settled by execution: the UNMODIFIED test passes
under a clock pinned to 2026-08-15 (`harvest_fest`) and fails under 2026-08-12 (`open_coffers`),
with zero code change in between.** It went red roughly 1 day in 4.

A sweep of the whole suite under a pinned clock across all nine dailies found **three more instances
of the same class**, all latent and due to land on the next `steady_fire` day (2026-08-29): the
b225 burn tests assume an open fire is 25%, and `steady_fire` pays `noBurn 0.25`.

**Affected systems:** any test asserting on `getBonus`, `applyGoldFind`, `cookBurnChance`,
`burnRiskLine`, `activityIntervalMs`, `harvestPlot` or `addXp` without pinning the calendar. The ten
blessed keys are `allXP · combatXP · gatherSpeed · cookSpeed · smithSpeed · craftSpeed ·
prayerSpeed · farmYield · goldFind · noBurn`.

**Required action:** none outstanding — all four are fixed. **If your test needs a known baseline for
any of the ten keys above, say so: `E._force({ daily: E.QUIET, weekly: E.QUIET })`, restored with
`E._force(null)` in `finally`.** The idiom already existed and these four simply never adopted it.
And when you pin the calendar, spend the extra three lines asserting the blessing you pinned
actually PAYS — the red was, accidentally, the only evidence anywhere that a gold-find blessing
reaches a gold drop. That is now asserted on purpose.

**Also worth knowing (→ Game Designer):** the burn curve is SUBTRACTIVE
(`burn% = BASE − noBurn − relief`), so `steady_fire`'s `noBurn 0.25` against the 25% base makes an
open camp fire **completely burn-proof for the day** — that is Kitchen L3 (the Cast-Iron Range),
the endpoint of a ladder costing a build and three upgrades, handed out free on ~1 day in 9. The
`noBurn`-is-outside-the-power-budget argument ("burn-proof is burn-proof and there is no
burn-proof-er") is about stacking, and does not address a blessing that reaches the endpoint on its
own. Balance call, not a bug — flagging, not changing.

---

### 2026-08-12 · Systems · The `?v=` bundler answer was WRONG, and `bump-version.sh` has a blind spot
**Discovery (1):** the first real `supabase functions deploy hr-accrue` failed at the bundler with a
clean 400 — **Supabase's hosted eszip resolves a relative specifier as a literal FILE PATH, query
string included** (`Module not found "file:///tmp/user_fn_.../vendor/core/combat.js?v=326"`). The
handoff recorded the opposite ("keep them, no `--strip-query` needed"), proven with local Deno 2.9.5
`deno bundle`. That proof was real and it proved the ADJACENT thing; its own caveat — "not yet run
against Supabase's hosted eszip" — was the finding. New variant of the assertion-that-asserts-nothing
family: **a sound proof of a near-identical stand-in, recorded as if it were the result.**

**Discovery (2), independent:** `bump-version.sh` walks `src/` only (`find src -name '*.js'`), so
`supabase/functions/**` and `tests/**` were never bumped. The Edge Function's imports sat frozen at
`?v=326` while their vendored targets moved to `?v=331` — **five builds of silent drift**, invisible
because the query is inert in Node. `tests/conservation-fuzz.mjs` had the same rot at `?v=328`,
hidden behind a `const V = '?v=328'` indirection that no specifier-shaped regex would find.

**Affected systems:** Edge deploy, `tools/pack-edge.mjs`, the cache-buster contract, smoke suite.

**Required action:** the cache-buster contract is now split with no overlap and no gap —
`bump-version.sh --check` says everything the BROWSER loads carries the CURRENT version;
`versionQueryGuard()` (`tools/pack-edge.mjs`, run by `run-smoke.mjs`) says everything the browser
does NOT load carries NONE. **Do not "fix" the drift by widening the bump script's `find`** — that
would put a version where it has no job and make every bump move the Edge payload hash. `pack()` now
takes no option that can change the payload, so the guard and the deploy pack identically by
construction. Payload is `752c6a7a…` (22 files, 230,560 bytes) — always derive, never trust a
transcribed digest.

---

### 2026-08-11 · Systems Engineer · A "flaky test" on this project has meant a fixture that does not guarantee what it asserts — twice, and both times the fix was a SEAM, never a tolerance
**Discovery:** two long-standing intermittent failures were diagnosed to root cause rather than
patched.
1. **`b260`** (~1 run in 4) replays five real minutes of away combat through `combat-sim`, whose rng
   is seeded from `Math.random()` at boot — so **every run fought a different five minutes**, and on
   the unlucky seeds the player *died*. A death clears `G.activeMonster`, so `resumeActiveActivity()`
   correctly re-armed nothing and the test called the engine broken. Proven by execution: weakening
   the fixture on purpose produced 2 failures out of 2 with that exact message.
2. **`b307`** asserted "a second read of the SAME INSTANT banks nothing" while sampling `Date.now()`
   five separate times; it only held when two calls landed in the same millisecond (an instrumented
   run measured 160/200 returning 1–4ms). `claimOfflineMs(now, active)` *takes the instant as a
   parameter* for exactly this reason.
**Affected systems:** every test that drives `combat-sim`, `processOffline`, `__hrResume`,
`claimOfflineMs` or anything else reading the wall clock or the global rng.
**Required action:** if your test runs the simulator, **pin the seed** (`HearthriseCore.reseed(n)`,
restore with `randomSeed()`) or make the outcome impossible to vary, and **assert the precondition**
so a future balance change fails loudly instead of going flaky. If your test names an instant, pass
that instant — a tolerance on a double-pay guard silently accepts a real double-pay (the b214 class).

### 2026-08-11 · Systems Engineer · `RoomModal.paint()` rebuilt every form control from its descriptor, so any repaint silently reverted what the player had picked or typed
**Discovery:** `refresh()` is called by an armed button, a finished RPC and a 30-second feast timer.
Each one destroyed and rebuilt the modal. Found by driving the panel in a browser with a stubbed
`fetch`: choosing a 24-hour ban and clicking Remove (which arms, which repaints) **sent 168 hours**.
The Storehouse's deposit picker had the identical latent defect.
**Affected systems:** every `kind:'field'` control in the clan-seat room modal, and any future
consumer of the room-modal component (the homestead is specced to reuse it).
**Required action:** none — fixed in `paint()`, which now carries `[data-cs-sel|qty|txt]` values,
focus and caret across a repaint (it already carried `scrollTop` for the same reason) and re-fires
`change` so derived previews stay honest. Guarded by `b330`. **Do not add a new form control that
keeps its state anywhere other than the DOM**, or it will fall outside this.

### 2026-08-11 · Art Director · `legacy.css`'s mobile `.panel.active` declares ONE explicit grid track in each axis, `!important` — any panel that tries to become a real grid on a phone silently lands in implicit tracks
**Discovery:** in `@media (max-width:900px), (max-height:540px) and (max-width:1024px)`,
`legacy.css` sets `.panel.active { grid-template-columns: 1fr !important; grid-template-rows: auto !important }`.
Two consequences that look like browser bugs and cost me an hour:
1. `grid-column: 1 / -1` resolves `-1` against the **explicit** grid, i.e. line 2 — so a "span
   everything" item is laid out at the width of column 1. Measured: 607px where 842px was expected.
2. With one explicit row, everything you place lands in implicit `auto` rows, and `align-content`'s
   default `stretch` then splits the panel's height **evenly** between them. A 30px sub-tab strip
   measured **106px**.
Neither declaration errors, neither shows up in `getComputedStyle` as wrong (it faithfully reports
the implicit tracks), and both are silent.
**Affected systems:** any panel-level grid authored inside a mobile/short-viewport media query
(inventory now; combat, skills, farm next).
**Required action:** when you declare `grid-template-columns/rows` on `.panel.active` inside a mobile
media query, declare them `!important` — otherwise your track list never applies. Prefer explicit line
numbers over `-1` there, and set `align-content: start` unless you want the even split.

### 2026-08-11 · Art Director · `.main` still reserves 68px for a bottom nav that is a LEFT RAIL in landscape — 16% of a 423px screen
**Discovery:** `theme-cozy.css` `@media (max-width:540px), (max-height:540px) and (max-width:1024px)`
sets `.main, #app .main, .panel.active { padding-bottom: calc(60px + var(--safe-b) + 8px) !important }`.
b317 reclaimed that reserve on `.panel.active` and `#panel-combat.active` but **not on `.main`**, so
in the b310 landscape-rail layout (where the bottom nav is a left rail and the reserve is a phantom)
every panel was capped at 287px of a 423px viewport before it rendered anything. Fixed for landscape
only — in PORTRAIT the bottom nav is real and the reserve must stay.
**Affected systems:** every panel on a landscape phone, not just inventory.
**Required action:** other short-viewport work should assume it now has ~68px more to spend, and
should not re-add a bottom-nav-sized bottom pad in the landscape-rail block.

### 2026-08-11 · Art Director · `renderInvFancy()` destroys the inventory's own Bag/Equip/Saved navigation on every tick; it was only restored by a 1500ms poll
**Discovery:** `renderInvFancy()` does `panel.innerHTML = …` on the whole `#panel-inventory`, which
deletes `#inv-mob-tabs` (inserted by `inventory-mobile-tabs.js` as `firstChild`). The only thing
putting it back was a `setInterval(…, 1500)`. It fires on every combat/skill tick, so on a phone the
screen's primary in-screen navigation was blinking out for up to a second and a half at a time.
Same shape as the b230 finding (`market.js` re-rendering its own nav control away).
**Affected systems:** `src/inventory-mobile-tabs.js`, `renderInvFancy` in `legacy.js`.
**Required action:** fixed with a `MutationObserver` on the panel (restores within one microtask; the
poll stays as a backstop) and `window.HearthriseInvSubTabs = {install, paintIcons, subs}` is now
published so a caller — or a test — can restore it synchronously. **If you add another strip that a
wholesale re-render can eat, observe the mutation; do not poll.**
### 2026-08-11 · Designer → QA · TWO smoke tests in the offline area are wall-clock flaky (measured)
**Discovery:** while verifying b329 I hit intermittent reds in `b307: the offline cap is PER-ABSENCE`
and `b260: robust resume re-arms combat`. Neither has any causal path to the change under test. I
measured the b307 one directly: its assertion

```
assert(window.claimOfflineMs(Date.now(), true) === 0,
  'a second read of the same instant must bank nothing (timer reset / double-pay guard)');
```

only passes when the two `Date.now()` calls land in the **same millisecond**. Instrumented in the
browser, 200 iterations with 0–4 ms of intervening work: **160/200 returned 1–4 ms, not 0.** So the
test passes today by luck of scheduling and fails whenever the machine is busy or the suite is a
little slower. The behaviour it guards (no double-pay) is correct — the assertion is just too sharp.

`b260` is in the same family: it drives a real 5-minute away replay through `__hrResume` and asserts
the combat loop is armed afterwards. Driven 40× in isolation it was 40/40 stable, so it is
suite-context/timing dependent, not seed dependent.

**Affected systems:** `src/features/smoke-test.js` (b307, b260), CI reliability.
**Required action (QA):** give the b307 re-claim assertion a tolerance (`< 50` rather than `=== 0`,
or freeze the clock for the block) and find b260's suite-context dependency. A test that fails ~1 run
in 3 for reasons unrelated to any change trains the team to re-run instead of investigate, which is
how a real red gets waved through.

### 2026-08-11 · Designer · Xarn was right — and the same audit found a WHOLLY dead style stat
**Discovery (the report):** no combat style has EVER had a speed term. `combatTickMs()` read gear
speed (`spdB`) and the weapon-FAMILY identity (`WEAPON_SPEED_MOD`) and nothing else, so a style
literally named *Rapid* swung at exactly the interval of Precise and Longrange — 2112 ms on a bare
bow, all three. Fixed in b329: `speedMod` added to the style table, consumed by a new shared
`swingIntervalMs(eq, style)` in `src/core/combat.js` that BOTH `combatTickMs()` and the accrual
engine's `deriveTickMs()` now delegate to (they were two hand-copies reconciled by a comment).

**Discovery (the bigger one — NOT fixed here): `style.defenseMod` is read by NOTHING.** It is
authored on all 13 style rows (`defensive` 1.05, `guard` 1.05, `longrange` 1.05, `warded` 1.05,
`controlled` 1.02) and consumed in zero places — `monsterCombatRolls` builds `playerDefense` from
skill + `defB` + `bonus('defense')` and never looks at the style. Four styles have quietly promised
5% mitigation since combat styles v2. It never became a complaint only because the picker showed no
numbers at all — the same root cause as Xarn's report.
**Deliberately left dead:** wiring it changes monster accuracy against every player on four styles at
once, i.e. a combat-wide rebalance, not a ranged bug fix. b329's copy therefore never promises
defence as a stat, and guards in `tests/core-purity.mjs` + the smoke test enforce that until it is.

**Discovery (third): magic `focus` strictly dominates `cast`** — +8% accuracy AND +3% max hit for no
cost, so `cast` is a dead option for every magic player. Same class of bug as the ranged triple: a
"choice" that is not one. Untouched here; pricing it needs its own magic pass.

**Affected systems:** combat styles, swing interval, the away tick budget, the style picker.
**Required action:** `defenseMod` and `focus` are Designer backlog — raised in HANDOFFS.

---

### 2026-08-11 · Art Director · The Active Effects card — the game's ONLY buff panel — has been `display:none` since the Home dashboard shipped
**Discovery:** `#active-effects-card` (food buffs + house buffs, `renderActiveEffects` in legacy.js
block 8) is appended to `#panel-profile`. `home-dashboard.js`'s b213 reset hides every legacy card in
that panel: `#panel-profile.active:has(#hd-root) > .card{display:none !important}`. Measured in-browser:
computed `display:none`, rect 0x0. So `__renderBuffsSection` has been painting buff rows into an
invisible container, and the ONLY visible statement about buffs anywhere in the game was Home's
one-liner **"Food buff active."** — no name, no magnitude, no clock. House buffs have no visible surface
at all.
**Affected systems:** `legacy.js` block 8 (`renderActiveEffects`), block 36 (`__renderBuffsSection`,
`refreshBuffTimers`), `home-dashboard.js`, `audit-overrides.css` + `legacy.css` `.buff-row` /
`.active-effects-card` rules (~30 selectors styling a hidden element).
**Required action:** b326 gave buffs a real home — Home's **Upkeep** block now renders the full ladder
(name · magnitude · preserved time · paused state), which is where the away ruling's "a paused buff
renders as paused" clause actually lands. The legacy card is still dead: someone should either delete it
and its food section outright, or **give HOUSE buffs a surface** — they are currently unreadable, and
`renderActiveEffects` still emits literal emoji for them (🍳🔨⭐🍀🌿🌾🎃🔥🧰), a 0-emoji-rule violation
that is only invisible by accident. Systems/Asset Director.

### 2026-08-08 · Systems Engineer · ES modules re-wrap `window.*` AFTER every classic script — never assert a hook by reading a marker off a live global
**Discovery:** `window.killMonster` / `window.addXp` are wrapped by at least six places (legacy's bestiary
+ level-up IIFEs, `collection-log.js`, `pets.js`, `dungeons.js`, and `companions.js`). Five are classic
scripts and run in document order; **`companions.js` is an ES module imported by `main.js`**, so it is
deferred and re-wraps AFTER *every* classic script has finished — including anything appended at the very
bottom of `index.html`. Your wrapper is still in the chain and still fires, but a `fn.__myMarker` flag you
set is no longer on the outermost function, so a test that reads the marker off the global reports a hook
you definitely installed as missing. Cost a red smoke test on the Chronicle wave.
**Affected systems:** anything wrapping a legacy global — collection-log, pets, companions, dungeons,
chronicle, and any future decorator.
**Required action:** compose (capture `orig`, call it, never replace), and if you need to *prove* the hook
exists, keep your own installation registry inside your module (`HearthriseChronicle._hooks()` is the
pattern) rather than probing the global.

### 2026-08-08 · Systems Engineer · There are TWO save allowlists and they fail in opposite directions
**Discovery:** new persistent state on `G` has to be registered in two unrelated places, and forgetting
either is silent.
1. `snapshotG()` in `src/features/smoke-test.js` — a manual field list the suite restores after every
   player-action test. **Missing → the suite writes its test data into the real player's save.**
2. `snapshot(G)` in `src/net/events.js` — the CLOUD payload allowlist. **Missing → the field survives
   locally forever and is silently destroyed the first time the player restores on another device.**
The local save itself is `JSON.stringify(G)`, so it needs no registration at all — which is exactly why
these two get forgotten: everything looks fine until a test run or a device switch.
**Affected systems:** every feature that adds a `G.*` field.
**Required action:** when you add persistent state, add it to BOTH lists in the same commit, with a
comment saying why it belongs in the cloud payload (or a deliberate note saying why it does not).

### 2026-08-09 · Systems Engineer · `isPresent()` is TRUE during offline catch-up — a presence gate alone is not a gate
**Discovery:** `processOffline()` runs inside `loadLocal()`, on a **visible** tab, with the presence
input timestamp **freshly initialised** and an activity **set**. Every clause of "the player is here"
is satisfied while the game is simulating an absence. Anything gated on presence therefore applies in
full to offline output unless it *also* checks an explicit offline-replay flag. This is not
hypothetical: b204's world-event blessings applied to every offline catch-up from the day they
shipped, and b226's flat ×1.12 presence bonus multiplied every offline `addXp` grant for the same
reason. Measured in the browser: a 3h absence paid **11,250 XP** with the b227 latch and **36,000 XP**
with the latch removed and nothing else changed.

**Second half of the same trap:** bonuses that are *baked* rather than *read* escape any live gate.
`G.skillMs` froze the gather/artisan speed stack at `startSkill()`, and the offline replay divides
elapsed time by it — so a session begun under a speed bonus carried that speed into the night no
matter what the gate said. Live-read keys (`allXP`, `combatXP`, `goldFind`, `farmYield`, `noBurn`)
gate themselves; baked ones must be re-derived.

**Affected systems:** `legacy.js` (`processOffline`, `processOfflineCombat`, `addXp`, `startSkill`,
`startArtisan`), `features/world-events.js`, and **every future system that pays differently online**.

**Required action — regression tripwire:**
1. Every new simulator of elapsed wall-clock runs inside `withOfflineReplay()`. No exceptions. This
   is the b214 double-pay class of bug wearing a different hat.
2. Gate on `HearthrisePresence.blessingsApply()`, never on `isPresent()` alone.
3. A bonus that affects a DURATION must be re-derived through `activityIntervalMs()`, not stored.
4. Guard tests: *"OFFLINE output is byte-identical with and without an active blessing"* and *"the
   replay latch shuts the blessing even on a visible, active, freshly-touched tab"* in `smoke-test.js`.

**Also found (filed, not fixed):** `#dash-active` — the legacy Home dashboard block — is
`display:none` since the b219 Home rewrite. The offline welcome-back line it hosts (b225's burn
count, b226's daily-budget readout, b227's rate note) is **invisible to players**; the only surface
they see is the transient `processOffline()` toast.

**Also found:** `getBonus('rareDrop')` has **no consumer**. `rareDrop` exists only as an
equipment/pet ITEM stat (`getEquipmentStats().rareDrop`). Do not grant it from rooms, clans, renown
or events until a drop-roll seam reads it.

---

### 2026-08-08 · Coordinator · Seeded ground-truth (from project memory + audits)
**Discovery:** The following are established facts, carried in so no agent relearns them the hard way.
- **Data double-copy trap (fixed b215):** `legacy.js` top-level `const ITEMS/MONSTERS/...` lexically shadow `window.*`, so ESM data never reached the engine. Fix: `legacy` publishes `window.__LEGACY_INLINE`; `main.js` identity-merges ESM in. Guard test asserts identity. **Do not reintroduce.**
- **Theme-leak trap (fixed b216):** ~310 `html:not([data-theme])` rules were always-true, painting retired cozy-light under hearthlight; plus unscoped cocoa/cream rules; `:root` held light tokens. Fix: rescoped to `body[data-theme="cozy-light"]`; `:root` now dark. Guard tests fail if patterns return.
- **Offline rewards paid 2–3×/login (fixed b214):** processOffline + two catch-up systems read the same unrefreshed `G.lastSeen`.
- **Stored XSS (fixed b214):** market `sellerName` → `innerHTML` (JWT theft). Sanitize all user-supplied strings before DOM insertion.
- **hearth_token minted in PvE (fixed b214):** dropped at chance 1.0 in all 6 dungeons — the IAP-only bond must never mint in PvE.
- **XP_TABLE gap (fixed b215):** level 99 needs 11,805,606; it was missing, making 99 unreachable.
**Affected systems:** engine data flow, theming, economy, offline, security.
**Required action:** All agents treat these as regression tripwires — guard tests exist; keep them green.

**Affected systems:** all.
**Required action:** none — reference material.

---

### 2026-08-08 · Coordinator · b224 ship incident — two traps, both mine
**Discovery:** (1) A worktree contained a `node_modules` JUNCTION into the main tree; `rm -rf` on the worktree dir followed it and gutted the main tree's node_modules. (2) My ship command chained gate→commit→push as separate statements in one call: the gate silently failed (no node_modules), the commit never happened, and the push still ran — production briefly served hotfix code under the OLD ?v cache keys (the exact CLAUDE.md mixed-cache trap). Caught within minutes; bump committed and pushed; kill-switch + v=224 heals all clients.
**Affected systems:** ship discipline.
**Required action (binding on Coordinator):** never `rm -rf` a worktree that may contain junctions — use `git worktree remove` and if it fails, inspect before force-deleting. Never put gate/commit/push in one compound call — run the gate, READ its output, then commit, then push, as separate verified steps. Agents: do not create junctions in worktrees; run tests via an explicit path to the main tree's node_modules instead.

### 2026-08-08 · Game Designer · THREE LIVE PRODUCTION EXPLOITS in the raid economy
**Discovery:** (1) **P1 — unlimited raid strikes:** the 1/day limit is client-side only (`raids.js:93`, `G.raids.lastStrikeDay`); the `raid_strike` RPC (`schema.sql:377`) has NO day check — a tampered save strikes unlimited times (bounded only by the 50k clamp). (2) **P2 — chest-hopping:** `claim()` pays the FULL chest to any contributor and `clan_members` join/leave is open (`schema.sql:288-293`) — join a near-dead pool, strike once, claim, leave, repeat. (3) **P3 — solo claim replay:** `st.claimed[wk]` is local-only; a save edit re-grants the chest.
**Affected systems:** raids, clan economy, gold/gem supply.
**Required action:** Systems Engineer hardening task dispatched (Wave 1b). Server-side enforcement in Supabase; client mirrors for UX only. Also note: `HearthriseWorldEvents` doubles as the shared clock utility raids depends on (`_hash`, `utcDayKey`, `utcWeekKey`) — never rename/restructure it; add new systems ALONGSIDE.

### 2026-08-08 · Coordinator · Feature code is more modular than the monolith memory implies — use the right file
**Discovery:** `legacy.js` lives at **`src/legacy.js`** (not repo root). Several requested areas have dedicated modules: `src/features/companions.js`, `src/features/clans.js`, `src/features/ui-overlap.js` (chat/notification overlap handling), `src/chat.js`, `src/net/auth.js`, `src/multi-character.js`, `src/market.js`, plus renown/raids/pets/homestead/daily-reward/collection-log under `src/features/`. Styles: `src/styles/{legacy,theme-cozy,audit-overrides}.css`.
**Affected systems:** all UI/feature work.
**Required action:** Prefer editing the dedicated feature module over `src/legacy.js` when one exists — smaller blast radius, fewer merge collisions. `src/legacy.js` is still the entangled core (render loop, tabs, toasts) — announce edits to it in `ACTIVE_WORK.md`.

### 2026-08-08 · Coordinator · `src/legacy.js` entanglement forbids reckless parallel edits
**Discovery:** Almost every backlog item ultimately touches `src/legacy.js` (render loop, `showTab`, toasts, inventory). Fanning out many agents to edit it in parallel guarantees merge conflicts and semantic breakage.
**Affected systems:** integration strategy.
**Required action:** Serialize `legacy.js` implementation across waves; parallelize only work with disjoint footprints (CSS vs engine) via worktree isolation, plus read-only design/spec work. Coordinator integrates one logical change at a time.

_(New discoveries below this line, newest first.)_

### 2026-08-11 · QA · The server tier is now RUNNABLE IN `node` — PGlite executes the real migrations
**Discovery:** all four server-authority migrations (`player-state`, `catalogue.generated`,
`apply-engine`, `market-v2`) apply **verbatim and clean** to **PGlite 0.5.4 (PostgreSQL 18, WASM)**
in-process. The only scaffolding needed is `tests/sql/pglite-fixture.sql`: `auth.users`, `auth.uid()`
(reads `request.jwt.claim.sub`, exactly as Supabase does), `public.profiles`, and a `cron.*` shim
whose `unschedule()` raises on a missing job (that raise is why `hr_cron_drop` exists, so the shim
keeps the guard live). The fixture also recreates the **pre-market-v2 world** — the v1 table plus the
two armed nightly jobs — so market-v2 §0c's escrow-ordering assertion is a real check here and not
vacuous. `hr_apply` is reachable via `set role hr_engine`; `pg_advisory_xact_lock`,
`hashtextextended`, `gen_random_uuid`, PL/pgSQL, RLS DDL and `SECURITY DEFINER` all work.

**Affected systems:** the whole server tier's testability.
**Required action (Systems Engineer):** `tests/sql/server-authority.test.sql` today can only run by
being emitted and pasted at a live database — 215 KB through an HTTP-fetch trick, against production,
inside a rolled-back transaction. It could run **on every push** through this fixture instead. Worth
doing: the S6 intent-collision defect was found only when someone actually executed a block that had
passed three reviews by being read.
**Limits, stated:** the harness runs as owner, so RLS and EXECUTE grants are NOT enforced against it
(those stay with `run-sql-tests.mjs` + the behavioural suite), and PGlite is a single backend, so
locks are exercised but never raced.

### 2026-08-11 · QA · Conservation fuzz shipped; 10/10 planted violations caught, 0 real ones found
**Discovery:** `tests/conservation-fuzz.mjs` proves the property Security asked for — after N seeded
random ops across M characters, `Σ inventory + Σ equipment + Σ listings` per item and
`Σ gold + Σ market_sales.tax` reconcile against modelled mint/burn counters. ~61,000 ops across 24
seeds, up to 4,000 ops × 12 characters: **no conservation violation in the foundation.** The escrow
path (list→cancel, list→buy, list→expire) conserves exactly, rejections move nothing, replays apply
once, and the b328 degrade ladder reaches `accrue_forfeit` moving the watermark and nothing else.
**A clean fuzz is worth nothing on its own**, so `--selftest` plants ten real conservation bugs in
the migration text and demands each is caught. All ten are. Two of the ten exist only to prove
sub-assertions are not decoration.
**Affected systems:** market v2, hr_apply, accrual, CI.
**Required action:** keep `node tests/conservation-fuzz.mjs --selftest --ops=400` green (~22s, wired
into `.github/workflows/smoke.yml`). **Adding an RPC that moves value without adding an op to the
fuzz's table is how this stops being a proof.** Anyone editing the migrations must re-check the
injection anchors — a stale anchor fails LOUD (exit 2) by design, not silently.

---

## 2026-08-16 · Art Director — b357: creature portraits are SQUARE, and four measured art-pipeline facts

**1 · The arena portrait was cropping twice, and the second crop was invisible.** It was a 96 px
**circle** with `object-fit: cover`. `cover` throws away the overflow of a non-square source — 30 of
the 36 shipped monster files are 128 px long-edge and non-square — and the circle then took the
corners off whatever survived. Corners are where a creature keeps the information a bestiary is read
by: antlers, horns, a scythe, a crest. It also silently imposed a "compose inside an inscribed
circle" rule on every future generation, which costs ~21% of a square frame, 600 times over.
**Every creature-portrait surface is now a square plate with `contain`** — arena, bestiary row,
monster row, preview modal, bounty notice, pet badge, companion badge — on one shared token
`--r-portrait: 6px`. Guarded by smoke test `b357`. **The medallion (`.hr-med`) stays a circle
deliberately: it is a struck coin holding a centred vector glyph at 60% size, so it never crops.**

**2 · The delivered AI art is not opaque, and it is not a fringe.** Measured across all 13 Hearthfire
pilots by canvas pixel read: only **0.3–2.0%** of pixels in any file are alpha 255. The modal interior
alpha is **254**, with **50–80% of the canvas** sitting at 252–254. That is an artefact of Recraft's
`removeBackground` matting, which runs after generation — **no prompt wording can affect it.** Fixed
by `tools/qc-art.mjs --snap` (a>=250 -> 255, a<=16 -> 0, 17–249 untouched). Proven: opaque goes to
16–64%, the soft band to 4–8%, and a second run changes 0 files.

**3 · A duplicate download is completely silent, and one shipped.** `oak_log.png` and
`bronze_sword.png` in the pilot are **byte-identical** (SHA-256 match). Nothing in the pipeline
noticed. `tools/qc-art.mjs` now hashes the whole batch. **Any batch-download tool needs this check.**

**4 · A warm key light repaints neutral materials.** `iron_ore` is specced as grey rock with rust
streaks and came back polychrome red/violet — 38% of its opaque pixels warm-dominant, against 16% for
the correctly-cold `iron_sword`. The cause is structural, not a bad line: **when a subject's material
is a neutral (stone, ore, bone, ash, coal, plain iron, dressed masonry) the palette clause has
nothing legitimate to land on, so it repaints the material.** The production wrapper now pins the
palette to the LIGHT and to stated trim only.

**Affected systems:** every monster/creature render surface; the whole art batch pipeline.
**Required action (Asset Director + whoever runs the batch):** monster art must now be composed to
the **full square with a small even margin and nothing touching the edge** — the old "eyes inside the
middle 70%" rule is retired. Run `node tools/qc-art.mjs <dir> --snap --neutral <ids>` as the gate
before wiring anything.

---

## 2026-08-16 · Art Director — three measured facts about how icons actually render

**1 · No item icon in this game is ever displayed above 64 × 64 px.** Measured in-browser (six real
stylesheets inlined into a 1440×900 same-origin iframe with real container markup under
`body[data-theme="hearthlight"]`, every host read with `getBoundingClientRect()`). The ladder is
15 px (cost chip) → 22 → 30 → 34 → 36 → ~44 (equip doll) → ~54–68 (inventory tile) → **64 (item detail
modal, the maximum)**. `itemization-and-art-pipeline.md` cites a 96 px level-up celebration icon as an
item render size: **it is dead.** `legacy.css:2390` declares `width:96px;height:96px`;
`audit-overrides.css:128` overrides it to `32px !important` and wins. This is why 128 px long-edge is
the correct source spec — a clean 2×, not a guess.

**2 · The `painted/monsters/` set is NOT all 256 × 256, and 30 of its 36 files are being cropped in
production.** A PNG header walk of all 36: **30 are 128 px long-edge and non-square** (as extreme as
`venom_spider.png` at 128 × 83), only the 6 Hunt bosses are 256 × 256. `itemization-and-art-pipeline.md`
Appendix D says the whole set is 256 × 256 — it sampled only those six. This matters because the
**bestiary row and the arena portrait both use `object-fit: cover` on a SQUARE box**: a 128 × 83
portrait is upscaled and has ~35% of its width cropped away today. Item icons are the opposite —
`contain` at every measured site, plus an inline `object-fit:contain` written into `window._itemSVG` by
`applyLocalIcons()` — so item icons may safely be non-square, and monsters may not.

**3 · A complete item-art set makes `SLOT_ART` dead code, and that is the point.** The generated-gear
fallback mapper in `applyLocalIcons()` opens with `if (LOCAL_ITEM_ICON[id]) return;`. Landing a file for
every id therefore retires the mapper entirely — and with it the game's current worst art defect: nine
different plate gauntlets spanning tiers 1–8, including the raid-boss unique `choirbone_gauntlets`, all
rendering the identical `leather_gloves.png`. **Delete the mapper in the same pass** rather than leaving
it as a silent trap for the next item added.


## 2026-08-16 - Systems Engineer - findings from the monster roster wave

### 1. `data-integrity.js` has been BLIND since b137, and completely so since b214
`legacy.js` publishes `window.__LEGACY_INLINE_ITEMS = ITEMS` and
`window.__LEGACY_INLINE_MONSTERS = MONSTERS`. Those are **references, not copies**, and `main.js`
`unifyObject` merges the ESM data INTO those same objects. So by the time the check runs (1500 ms
later) it compares the merged object against the ESM module - i.e. against itself - and prints
"in sync" unconditionally. That is precisely the b137 bug the snapshot was added to prevent,
reintroduced by aliasing, and it is why b342 could find 14 of 31 monster entries diverging (two of
them silently deleting a live `troll_hide` drop) with a permanently green guard.
**MONSTERS half: fixed at the source** - legacy.js declares no roster at all now
(`const MONSTERS={}`), and an eagerly-evaluated COUNT (a number, immune to the merge) is what the
guard asserts stays 0. Guarded by `MON-ONECOPY-1`.
**ITEMS half: STILL BLIND.** `__LEGACY_INLINE_ITEMS` is still a reference to the object main.js
merges into. Reconciling the inline ITEMS literal is its own change and I did not take it in this
one. **Next Systems agent: this is the highest-value item on the debt list.**

### 2. `remapItemIds` never walked `G.dropLog[monster].drops[item]` - fixed
Pre-existing since b244 and flagged by b342. An item rename has always orphaned the per-monster drop
history. Counts now merge rather than overwrite (a save can hold both ids either side of a deploy).
Guarded by `MON-ALIAS-5`.

### 3. A bounty id cannot be parsed positionally - monster ids contain underscores
`makeBounty` builds `type_<monsterId>_<now>_<rand>`, and `weak_skeleton` / `dark_wizard` /
`goblin_warlord` all contain `_`. The obvious `split('_')[1]` reads "weak", so the rewrite silently
does nothing and an accepted bounty can never complete. Parse from BOTH ENDS instead. **My own test
caught this before commit** - `MON-ALIAS-2` went red on exactly this, which is the mutation proof
that the alias regression suite is not vacuous.

### 4. The b332 pooled-selector fairness floor was fitted to the pools that existed
The constant 0.5 is a large-sample claim. The weekly draw is sampled per DAY but keyed per WEEK, so
1461 days is only ~209 distinct draws. At the historical 7-member pool that gives expected 29.9 per
member, sd 5.1, so a 3-sigma-low bin already landed at ratio 0.49 - the floor was only *just*
satisfiable, and ANY growth of the weekly pool would fail it on legitimate content rather than on
skew. The weekly row now carries an explicit `minRatio: 0.25` with the arithmetic written out (the
same pattern the daily-tasks row already used). It is still far above the 0.08 the b332 float-hash
bug produced, and `dead.length === 0` - the actual unreachable-content assertion - is untouched.

### 5. The `neutral` retirement was a hidden 13% drop nerf
Deleting `neutral` deletes `weaknessInfo`'s only path to `NEUTRAL_DROP_BONUS`, which 7 monsters -
including the Green Dragon, the game's capstone - were being paid for opting out of the triangle.
**Ruling (DEC-NEUT-01 open item, closed):** re-homed as an explicit per-monster `dropBonus: 1.15` on
exactly those 7 rows. Nobody is worse off, the engine loses a magic constant, and drop-rate identity
becomes a data lever any monster can carry rather than a side effect of having no weakness. Guarded
by `MON-NEUT-1`, which asserts all 7 still measure exactly 1.15 and that `goblin` did not acquire one.
