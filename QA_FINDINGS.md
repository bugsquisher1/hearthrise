# Hearthrise — QA Engineering Sweep (b138)

> Live audit of the b138 deploy at https://bugsquisher1.github.io/hearthrise/
> Started 2026-05-04. Audit-first per Tyler's direction — log everything,
> triage together, fix as a single focused batch.

## Severity legend

- **P0** — Broken / blocks core loop / data loss / hard crash
- **P1** — Significant function bug, wrong number, dead button, broken art for a real item
- **P2** — Inconsistent or misleading state, edge-case glitch, error-only-with-specific-input
- **P3** — Smell / smaller polish / nice-to-have (logged but explicitly out of scope per Tyler — fix later)

## How to read this doc

Each finding has: severity, surface (desktop/mobile/engine/balance), where, what, suggested fix. Numbered for triage shorthand.

---

## §1 — Engine + console hygiene

_Things that surface on boot regardless of which tab the user is on._

### 1.1 — **P0 — 26 items missing from `src/data/items.js` (ESM source-of-truth wins)**

The b137 data-integrity fix (which I just shipped this session) is now firing for real on every boot:

```
[capture] Error: ITEMS divergence: 26 legacy-only, 0 esm-only
```

The 26 items are defined in `src/legacy.js`'s inline `NEW_ITEMS` block (line ~6098, "Phase A.1: NEW ITEMS") but missing from `src/data/items.js`. Because `src/main.js` does `Object.assign(window, { ITEMS })` AFTER legacy.js runs, the ESM ITEMS overwrites the legacy version, dropping these 26 entries on the floor.

**The 26 missing items:**
```
alpha_pattern  bear_claw_pie  bronze_bar  captain_recipe  chief_blade_recipe
cooked_bear_meat  cooked_panther_meat  cooked_wolf_meat  dragon_marrow_recipe
dragon_stew  field_cookbook  gemcutter_note  hunters_feast  lich_soul_soup
marrow_cookbook  raw_bear_meat  raw_panther_meat  raw_wolf_meat
roasted_carrot  roasted_pumpkin  rune_bar  soul_recipe  spellstone_diagram
steel_bar  vegetable_stew  void_banquet
```

**Concrete gameplay breakage (verified by walking legacy.js's NEW_RECIPES block at line ~6276):**

| Broken chain | Affected recipes | Player impact |
|---|---|---|
| Smelting — bronze/steel/rune bars | `smelt_bronze`, `smelt_steel`, `smelt_rune` | Smithing skill output items don't exist → silent fail when consumed |
| Forge weapons that need steel/rune bars | `forge_steel_sword`, `forge_rune_sword`, `forge_steel_helm`, `forge_steel_platebody`, `forge_bronze_belt`, `forge_captain_blade` | Recipes exist in ESM but their inputs (`steel_bar`, `rune_bar`, `bronze_bar`) are undefined items |
| Cooked meats from combat drops | cook_wolf / cook_panther / cook_bear chain | Tier 2-4 combat reward loop is dead |
| Buff foods | `vegetable_stew`, `roasted_carrot`, `roasted_pumpkin`, `hunters_feast`, `dragon_stew`, `lich_soul_soup`, `bear_claw_pie`, `void_banquet` | All Phase A.1 buff foods unobtainable |
| Recipe scrolls | `chief_blade_recipe`, `captain_recipe`, `alpha_pattern`, `field_cookbook`, `marrow_cookbook`, `gemcutter_note`, `spellstone_diagram`, `dragon_marrow_recipe`, `soul_recipe` | Gated unique-recipe drops never resolve |

Also found at runtime: `window.ARTISAN_RECIPES` has 34 recipes total (cooking:4, smithing:13, crafting:14, prayer:3). The Phase A.1 smelting recipes (`smelt_bronze` / `smelt_steel` / `smelt_rune`) are **not present in window.ARTISAN_RECIPES at all** — meaning legacy.js's `add(skill, recipe)` calls at line ~6246 fire BEFORE main.js's Object.assign overwrites the array. So both items AND the recipes that produce them are nuked.

**Recommended fix:**
1. Mirror the 26 items into `src/data/items.js` (single source of truth).
2. Mirror the Phase A.1 recipe additions into `src/data/recipes.js`.
3. Delete the `NEW_ITEMS` and Phase A.1 ARTISAN_RECIPES blocks in legacy.js once mirrored.
4. The data-integrity check will go silent → green smoke test stays green for real reasons.

**Effort:** M. ~1 hour to mirror + a few smoke tests asserting key items exist on `window.ITEMS`.

### 1.2 — **P3 — Stale `?v=88` on a few asset SVGs**

Network shows `combat-level.svg?v=88`, `total-level.svg?v=88`, `gold.svg?v=88`, `gems.svg?v=88` while everything else is on `?v=138`. Not a 404, but if those SVGs ever change they won't bust. Likely hardcoded in legacy.js. Cheap follow-up.

### 1.3 — **P3 — Skypack supabase request shows "pending" status**

Network entry #95 (`https://cdn.skypack.dev/new/@supabase/supabase-js@v2.101.1/dist=es2019`) was marked `pending` at audit time. Could be slow CDN, could be a hung load that delays cloud auth boot. Worth a longer observation window before classifying — leaving as P3.

---

## §2 — Desktop web walk

_Tab-by-tab walk at 1280×800. Cloud-signed-in account (`themphill22+1@gmail.com`)._

### 2.1 Profile

- **2.1.1 — P1 — Display name shows email local-part for cloud-signed-in users** (`THEMPHILL22+1`). Source: `renderProfile()` at line ~1432 falls back to `liveUser.email.split('@')[0]` when `user_metadata.display_name` isn't set. That's the entire signed-in user base showing their email username publicly. Suggest: prefer `G.playerName` when set, fall back to email-username only as last resort, or auto-populate `display_name` on first sign-in from `G.playerName`.
- **2.1.2 — P1 — Inline rename pencil from Batch D is hidden for cloud users.** My code: `const canRename = !liveUser && !G.account` — so the most-likely user (signed in) can never rename via the launchpad. Tyler's whole #5 ask was "easier than going to Settings." Suggest: show pencil for cloud users too; on click, sync to Supabase `user_metadata.display_name` (or update `G.playerName` and let cloud sync follow) instead of silently omitting.
- **2.1.3 — P2 — "Today" card overflows internal scroll when 5+ KPIs present.** Card body has fixed height; my 5-KPI grid wraps to a 2nd row but only ~4 fit on-screen, requiring scroll inside the card to see the 5th (Harvested). Suggest: switch the kpi-row to `display:flex; flex-wrap:wrap` with consistent min-width per cell, OR compact the cells, OR drop the deeds counter into the Profile card subtitle.
- **2.1.4 — P3 — Topbar `Idle — pick an activity` icon is `🚣` (rowing person)** which doesn't match "idle." Looks placeholder. Probably an icon-mapping smell — emoji for "idle" defaulted to whatever was first in the map.
- **2.1.5 — P3 — `QUESTS 0` button is wax-stamp red and visually prominent** even when zero — looks like an alert. Suggest: muted style at zero, accent only when ≥1.

### 2.2 Character

- **2.2.1 — P2 — Name inconsistency.** Profile says `themphill22+1`, Character page header says `ADVENTURER` and "Skilled Lumberjack" (auto-derived from top skill). Different sources of truth. Suggest: pick one canonical display name and reuse everywhere.
- **2.2.2 — P3 — Stat row format ambiguous.** "Attack Lv 14 +7" / "Strength Lv 3 +6" — the right-hand `+7`/`+6` looks like a level bonus but is the gear bonus. New player can't tell. Suggest: label or use a different glyph (`(+7 from gear)` or arrow-up).
- **2.2.3 — P3 — Lots of vertical empty space below Melee/Ranged/Magic stat trio.** Could fit something useful (top materials, prestige progress, etc.). Logged but Tyler said no polish.

### 2.3 Combat

- **2.3.1 — P1 — Loadout paper-doll text labels are truncated.** "Helmet" → `Hel`, "Necklace" → `Nec`, "Cape" → `Cap`, "Body" → `Bod`, "Belt" → `Bel`, "Companion" → `Com`. Same regression visible on Inventory's paper-doll. Looks like the slot label has a fixed font-size + small width and doesn't get a tooltip. Suggest: drop the visible text labels (the slot icon already tells you what it is), or tooltip-only.
- **2.3.2 — P2 — `DUNGEONS` button sits in the top-right of the COMBAT STYLE bar** — that bar is for stance selection, not navigation. The button location reads as "wax stamp red" attention-getter for an unrelated feature. Suggest: move to Adventure sidebar group or to its own header button on the combat panel.
- **2.3.3 — P3 — "Suggested for your level" panel duplicates the Monsters picker on the left.** With CL 8 and Tier 1 selected, both lists show Slime/Field Rat/Goblin. Wasted real estate. Suggest: hide the suggested panel when the picker is already showing matching tier, OR have it always show a TIER ABOVE current to encourage progression.

### 2.4 Bounty Board

- **2.4.1 — P3 — Looks correct.** Goblin bounty visible, Bounty Shop with marks pricing, Unlocks ladder readable. No findings.

### 2.5 Activities

- **2.5.1 — P2 — Yew Tree row shows `1/5 XP / 10.0s`.** Should be `175 XP / 10.0s` per `TREES` data (yew = `xp:175, ms:10000`). Looks like a string-template glitch — possibly the renderer is putting `qty[0]/qty[1]` (1, 1) in the wrong slot. Worth a quick code grep.
- **2.5.2 — P3 — Trees rendered as wood-plank icons instead of tree icons.** Visually misleading (output ≠ activity). Logged for non-scope.
- **2.5.3 — P3 — Top skill shelf shows Cooking (Lv 8) before Crafting (Lv 1)** — reasonable but mixes Gathering with Artisan groups. Logged for non-scope.

### 2.6 Inventory

- **2.6.1 — P1 — Same paper-doll label truncation as Combat (§2.3.1).** Single fix should resolve both.
- **2.6.2 — P2 — Topbar within Inventory tab puts gold-icon `🪙 7,694` adjacent to `Space: 165/360` with no separator** — reads as one number stream at a glance. Suggest: pipe or em-dash between.
- **2.6.3 — P3 — "Active Style" card is cut off at the bottom of the right rail** at this viewport height. Probably needs a `max-height` or the rail needs to scroll independently.

### 2.7 Store / Premium

- **2.7.1 — P2 — `Remove Ads` IAP uses 🚫 emoji as its icon.** Reads as "forbidden / not available" rather than "this removes ads." Suggest: a checkmark or shield-with-no-symbol.
- **2.7.2 — P3 — Premium store cards lack sub-pricing (price-per-gem) for comparison shopping.** Logged for non-scope.

### 2.8 Farm

- **2.8.1 — P1 — Plots render in ONE row of 8 instead of the intended 2 rows of 4.** My Batch C edit set `grid-template-columns:repeat(4,1fr)` but the rendered layout is 1×8. Either CSS specificity is wrong or the parent is `display:flex` upstream. Worth a `getComputedStyle()` check; visually wastes vertical space and forces the plots to be cramped.
- **2.8.2 — P3 — Crops guide list shows skill-level locks but no plot-level locks** at the player's current state (Farming Lv 1, all crops gated by skill). The plot-level deep-link in the seed-picker only fires when skill level passes — which is correct, but a player at Farming Lv 50 with Plot Lv 1 would suddenly see a wall of plot locks they hadn't anticipated. Suggest: surface the plot gate in the crops guide too.

### 2.9 House

- **2.9.1 — P2 — Rooms list is cropped: `Library` row shows a "..." truncation** (visible in screenshot at 656,372). The card body has fixed height; rows beyond the first ~2 are hidden until scroll. Suggest: let the card grow, or paginate with an explicit "more" affordance.
- **2.9.2 — P2 — Cost icons rendered as tiny dark dots** (e.g. Forge build cost shows `800 + 30 [dot]`). Material name is missing — player sees "30 of what?" Code path: `Object.entries(b.cost).map(([k,v])=>k==='gold'?'🪙':(ITEMS[k]?.icon||''))` — if `ITEMS[k]` is one of the §1.1 missing items, `.icon` is undefined → empty string. Suggest: defensive default + name-tooltip.
- **2.9.3 — P3 — My Batch C "Farm Plot · Lv 1/5" card wasn't visible in the Rooms tab walkthrough** — that's correct; it's on the Plot subtab. Verified separately on the Farm tab status header so no bug.

### 2.10 Social / Achievements / Bestiary

(Not walked in this pass — accessible via Profile feat-buttons and Social nav. Achievements and Bestiary modals are reachable but their internal rendering wasn't audited.)

### 2.11 Settings

(Not walked. Tyler historically-stable; deferred for next QA sweep iteration.)

### 2.12 Chat / Market / Dungeons / Scavenger

- **2.12.1 — Market — P3 — Looks correct.** Listings rules, list-an-item picker, search, "your listings 0/12". No findings at first pass.
- **2.12.2 — Chat / Dungeons / Scavenger — Not walked.** Each is gated behind a click that may have its own modal flow; deferring for the next iteration.

---

## §3 — Mobile (portrait + landscape)

_Cowork's browser tool resize_window resizes the OS window but doesn't change the page's `window.innerWidth` (stayed at 1920 even after `resize_window 390×844`), so true mobile viewport simulation requires DevTools device-emulation which isn't exposed. Static review of the mobile CSS rules + a real device pass with Tyler is the next step._

- **3.1 — UNVERIFIED — Walk on real phone or via Chrome DevTools device emulation needed.** All findings here are static observations from the audit-overrides + theme-cozy CSS sheets and prior changelog entries.
- **3.2 — P3 — `b123: Pass 2 — landscape phone UX polish` task #247 is still pending in the task list** — that work didn't ship; if Tyler still cares, fold into this batch.
- **3.3 — P2 — My Batch D `dash-today` and `dash-milestone` cards added new card slots to `panel-profile` without explicit mobile rules.** They'll fall back to whatever the generic `.card` mobile sizing does. Visual check needed; if they look broken on a phone, add specific rules under the existing `@media (max-width: 540px), (max-height: 540px) and (max-width: 900px)` block.
- **3.4 — P2 — My Batch C farm `farm-status` row** at the top of the farm panel uses `flex-wrap:wrap` + several buttons; this should wrap fine on mobile but unverified. Same need for a real-device check.

---

## §4 — Balance + economy spot-checks

- **4.1 — Subsumed by §1.1.** The §1.1 ITEMS divergence (missing `bronze_bar`, `steel_bar`, `rune_bar`, all cooked meats, all buff foods, all recipe scrolls) IS the primary economy bug. Until §1.1 is fixed, balance audit is moot for those chains.
- **4.2 — P2 — Bounty Hunter rewards: Goblin (Tier 1) bounty pays 320 gold + 6 Marks + 45 BH XP for "Defeat 9× Goblins"** — at ~7 gold per kill (gp:[2,8] avg ~5) the bounty is +35-50 gold premium for the same kills, plus marks/XP. Feels reasonable but spot-checks against Tier 4-6 bounties not done. Worth a spreadsheet pass once recipes are healed.
- **4.3 — P3 — Player has 7,694 gold and 25 gems on what looks like an early character (CL 8, no Tier 2 mob unlocks visible)** — reasonable for a beta tester with admin access; not a real balance signal.
- **4.4 — P3 — Premium pack pricing.** $4.99 (250 gems), $9.99 (700 gems), $24.99 (2050), $49.99 (5800). Per-gem ratios: 50, 70.07, 82.03, 116.06. Standard "bigger pack better deal" curve, OK.
- **4.5 — P3 — Crop unlock costs (b136 Batch C):** Lv1→2=1 deed, Lv2→3=3 deeds, Lv3→4=5 deeds, Lv4→5=8 deeds → cumulative 17 deeds for max plot. At 0.5% bounty / 0.1% kill drop, that's ~340 bounties OR ~3,400 Tier-2+ kills for max plot — feels grindy but rare-currency-grindy is the design ask. Watch for player feedback after launch.

---

## §5 — Recommended triage (Tyler to confirm)

I recommend bundling everything below into a single batch — call it `b139` — and shipping. The dependency order matters: §1.1 should land first because §2.7.x and §2.9.2 are downstream symptoms of it.

### Ship-now in b139 (P0 + P1)

1. **§1.1 P0 — Mirror 26 missing items + Phase A.1 recipes into `src/data/items.js` and `src/data/recipes.js`.** Single biggest player-impact fix. Smoke test should add an explicit assertion that `window.ITEMS.bronze_bar` etc. exist and have non-zero `v`. Effort M (~1h).
2. **§2.1.1 + §2.1.2 P1 — Display name handling** for cloud-signed-in users. (a) Prefer `G.playerName` when set, fall back to email-username only when neither display_name nor playerName exists. (b) Show the rename pencil for cloud users; on click, update both `G.playerName` and Supabase `user_metadata.display_name`. Effort S (~30m).
3. **§2.3.1 + §2.6.1 P1 — Paper-doll truncated labels.** Single fix in the equipment slot CSS — drop the visible 3-letter abbreviations, rely on icon + tooltip. Effort S (~15m).
4. **§2.8.1 P1 — Farm plots render in 1×8 instead of 2×4.** CSS audit on `.farm-mini` — likely a parent container override. Effort S (~15m).

### Ship-now in b139 (P2 — cheap fixes worth bundling)

5. **§2.1.3 — Today card overflow.** Switch to `flex-wrap:wrap` with sensible min-widths so the 5th KPI shows naturally. Effort XS.
6. **§2.5.1 — Yew Tree `1/5 XP` glitch.** Likely a string-template bug; quick grep + fix. Effort XS.
7. **§2.9.1 — House Rooms list cropped.** Either remove the fixed height or add scroll affordance. Effort XS.
8. **§2.9.2 — Cost icons rendered as dots.** Defensive fallback when `ITEMS[k].icon` is undefined — but this should mostly resolve once §1.1 lands. Effort XS once §1.1 ships.

### Defer / log-only (P3)

- §1.2, §1.3, §2.1.4, §2.1.5, §2.2.x, §2.3.3, §2.5.2, §2.5.3, §2.6.2, §2.6.3, §2.7.1, §2.7.2, §2.8.2, §4.x — all logged in this doc; revisit in a polish pass after the function-level batch is green.

### Real-device mobile pass (separate)

- §3.x — needs Tyler on his phone or DevTools emulation. Recommend doing this AFTER b139 so we're testing the fixed surface, not chasing pre-fix glitches.

### Estimated b139 scope

- ~5 small/medium edits + a dozen cheap polish nits.
- One new migration only IF we backfill anything for the missing items (the missing items are all NEW outputs — no save data to migrate).
- Tests: 3-5 new regressions covering the items existence + paper-doll labels + Today card layout assertions.
- Total LoC delta: ~250-400 lines across `src/data/items.js`, `src/data/recipes.js`, `src/legacy.js`, `src/styles/*.css`.
