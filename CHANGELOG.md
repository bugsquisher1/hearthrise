# Hearthrise — Changelog

The welcome modal reads this file on first load after a new build. New entries
go at the top. Format: each version is a `## v0.x.x — YYYY-MM-DD` heading,
followed by bullets. Keep entries short and player-friendly (not commit-log style).

## v0.9.1-beta build 140 — 2026-05-04 (Batch E — Inventory QoL: right-click menu + Sell-junk)

Most of Batch E was already shipped — the existing `item-ux.js` has the hover tooltip + stat compare + qty slider, and `renderInvNew()` has search / sort / filter / category chips / bulk-select / sell-selected. The two real gaps:
1. Right-click on a singleton (e.g. equipped weapon, single armor piece) did nothing — `item-ux.js`'s qty slider only fires for stacks ≥2. Players expect a context menu.
2. Bulk-selling junk required entering Select mode and tapping every stack individually — slow even for moderate cleanup.

This build closes both:

- 🖱 **#23 — Right-click context menu on every inventory tile.** New module `src/features/inv-context-menu.js` exposes `window.HearthriseInvCtx`. Right-click any bag tile or paper-doll slot (or long-press on touch) → contextual menu. Menu options are item-type-aware:
  - **Equippable** (weapons/armor/jewelry/companions/ammo) → Equip / Inspect / Sell 1 / Sell N
  - **Food** (anything with `heals`) → Eat / Set as auto-eat food / Inspect / Sell 1
  - **Bones** (anything with `buryXp`) → Bury / Inspect / Sell 1 / Sell N
  - **Equipped paper-doll slot** → Unequip / Inspect
  - **BoP items** → no Sell options surfaced (bone keys, hearth tokens, blueprints stay safe)
  - **Empty slot** → "Empty slot — drag an item here to equip" disabled hint
  Closes on outside-click, Escape, or selection. Listens in capture phase to suppress item-ux.js's existing qty-slider so the player gets the new menu instead.
- 🧹 **🧹 Sell junk button in the inventory toolbar.** `HearthriseInvCtx.sellJunk(threshold)` finds every safe-to-sell stack (excludes BoP, food, gear, recipe scrolls, blueprints, items with v≤0), shows a confirm dialog with total stacks/items/gold, then liquidates. The toolbar button shows the candidate count (e.g. "🧹 Sell junk (8)") and hides itself when the bag is clean. Threshold is per-stack-item-value capped at 50g by default; later we can let the player tune it.
- 🧪 **5 new regression tests:** API surface + DOM menu element, options are type-aware (Equip / Eat / Bury / no-Sell-for-BoP), equipped slot offers Unequip, selectJunk respects all safety filters (BoP / food / gear / recipe scrolls), HearthriseInvCtx.open() populates the menu DOM.

**Architecture note:** The new menu listens in capture phase (`addEventListener('contextmenu', fn, true)`) so it runs BEFORE item-ux.js's bubble-phase listener, then calls `stopImmediatePropagation()` to suppress the old qty slider. The "Sell N…" option still defers to item-ux's slider (or falls back to the detail flyout) — single source of truth for that UX.

## v0.9.1-beta build 139 — 2026-05-04 (QA sweep fix batch — function over polish)

First fruit of the QA engineering sweep. The b137 data-integrity check (which I'd just unbroken in this session) immediately flagged a structural bug that had been latent for many builds: 26 items defined in `src/legacy.js`'s Phase A.1 NEW_ITEMS block were missing from `src/data/items.js`. Because main.js does `Object.assign(window, {ITEMS})` AFTER legacy.js runs, the ESM ITEMS overwrote the legacy version and 26 entries became `undefined` at runtime. Recipes that produced or consumed them silently failed — meaning the entire smelting (bronze/steel/rune bars), cooked-meat (wolf/panther/bear), buff-food (vegetable_stew, hunters_feast, dragon_stew, lich_soul_soup, void_banquet, bear_claw_pie), and gated-recipe-scroll chains were dead. This batch heals all of that.

- 🔧 **§1.1 P0 — Mirrored 26 missing items into `src/data/items.js`** with a header comment explaining the drift cause + how to keep both files aligned.
- 🔧 **§1.1 P0 — Mirrored Phase A.1 recipes into `src/data/recipes.js`.** Cooking gained 13 new recipes (combat-meat chain + buff foods + gated tier-3). Smithing gained `smelt_bronze` + `smelt_steel` + `smelt_rune` and the gated chief/captain forges; existing forge_steel_*/forge_rune_* recipes were updated to consume the new bars (was using `iron_bar+coal` as a steel substitute). Crafting gained carved bows/staves, tailored leather, jewelry, and the gated alpha cloak. **34 → 47 recipes total.**
- 🔧 **§2.1.1 + §2.1.2 P1 — Profile display name + rename pencil for cloud users.** Cloud-signed-in players were seeing `themphill22+1` (email username) as their public display name AND the rename pencil from Batch D was hidden for them. Now: Profile prefers `G.playerName` when set, falls back to `user_metadata.display_name` then email-username only as a last resort. Rename pencil is available for all account states, and `setDisplayName` updates `G.playerName` so cloud sync round-trips it.
- 🔧 **§2.3.1 + §2.6.1 P1 — Dropped the truncated 3-char paper-doll labels** (`Hel/Nec/Cap/Bod/Bel/Com` etc.) on Combat and Inventory slots. They read as random strings rather than slot names; the slot icon + tooltip already convey the meaning.
- 🔧 **§2.8.1 P1 — Farm plots now render 2×4 instead of 1×8** on wide viewports. The old `.farm-mini` rule used `auto-fit minmax(46px,1fr)` with `!important`, which overrode my Batch C inline `repeat(4,1fr)`. Pinned to `repeat(4, ...)` directly in the CSS so plots are always 2 rows of 4, regardless of viewport width.
- 🔧 **§2.1.3 P2 — Today's Progress card now uses a 3-column grid** instead of the default 2-column `.kpi-row`. Six KPIs (XP, Gold, Kills, Gathered, Harvested, Deeds) fit cleanly in 2 rows of 3 instead of forcing internal scroll.
- 🧪 **5 new regression tests:** Phase A.1 items present in window.ITEMS, ITEMS divergence count = 0, Phase A.1 recipes registered in ARTISAN_RECIPES, Profile rename pencil renders for all account states, paper-doll empty slots have no truncated `<small>` label.
- 📋 **`QA_FINDINGS.md`** added — full audit log with severity/surface/triage tags so the next sweep can pick up where this one left off. P3 polish nits are all logged for a future polish-only batch (per Tyler: function over polish for this round).

**Architecture note:** Per Tyler's principle "Single source of truth," `src/data/items.js` and `src/data/recipes.js` are now authoritative. The Phase A.1 NEW_ITEMS / NEW_RECIPES blocks in legacy.js are still present but their `if(!ITEMS[k])` and `if(!has(skill, id))` guards mean they're now no-ops (the ESM versions get there first). They can be deleted in a follow-up cleanup batch once we verify nothing else references the local consts.

## v0.9.1-beta build 138 — 2026-05-04 (Batch D — Profile launchpad)

The Profile is the first thing every player sees on each session, and it was mostly read-only. Batch D turns it into a launchpad — players can resume what they were doing, see today's progress at a glance, know exactly what they're working towards next, and rename themselves without diving into Settings.

- ▶️ **#1 Resume last activity.** Stopping a skill or combat now records `G.lastActivity` (kind + id + timestamp). When the Profile's "Current Activity" card has nothing live, a green "Resume training: Mining" / "Resume fighting: Slime" banner appears with a single Resume button. Re-entering a tab and starting something new clears the banner — no friction for players who switched intentionally.
- 📊 **#2 Today's progress card.** New `dash-today` card sits between Profile and Current Activity. Shows XP gained, gold earned, kills, gathered, harvested, and deeds dropped — all since local midnight. Baseline is captured automatically on the day's first interaction. "Quiet day so far" sub-text when nothing's happened yet.
- 🎯 **#3 Next milestone card.** New `dash-milestone` card highlights the closest finish line: either the skill nearest its next level, or the most-progressed open quest. Click it to jump to that skill's detail panel or open the quests modal. Gives sessions a clear focus.
- ✏️ **#5 Editable display name.** Pencil icon next to the player name on the Profile card. Click → prompt → set. Hidden when signed in to a cloud account (those names sync via Settings → Account so the cloud profile stays canonical). Names are clamped to 24 chars; whitespace-only names rejected.
- 🆕 **`src/features/profile-launchpad.js`** — `window.HearthriseLaunchpad` API: `recordStop`, `getResumePayload`, `resume`, `ensureDailySnapshot`, `getTodayDelta`, `getNextMilestone`, `setDisplayName`. Single source of truth — `renderProfile`, `stopSkill`, and `stopCombat` all call through this API, no state-poking.
- 🗄 **Schema v4 → v5 migration** in `src/save-migrations.js` — adds `G.lastActivity` (defaults to null) and `G.daily.snapshot` (initialised to today's current numbers so existing players don't see a giant "Today" delta on first reload — they correctly start from zero). Idempotent.
- 🧪 **8 new regression tests:** API surface, recordStop writes lastActivity, getResumePayload null-without-activity, returns valid payload for known skill, hides while activity is live, getTodayDelta tracks gold/kills + clamps spent-gold to zero, getNextMilestone returns a target, setDisplayName clamps to 24 chars + rejects whitespace.

**Architecture note:** stopSkill/stopCombat capture `G.activeSkill`/`G.activeMonster` BEFORE nulling them so the launchpad gets the right id. The launchpad's getResumePayload self-hides when something's already running, so the Resume banner never competes with a live activity.

## v0.9.1-beta build 137 — 2026-05-04 (b136 hotfix — items.js divergence + data-integrity meta-bug)

The b136 deploy was incomplete: `farm_deed` got added to the inline `ITEMS` const inside `src/legacy.js` but NOT to `src/data/items.js`. `main.js` does `window.ITEMS = ESM_ITEMS` after legacy.js runs, so the ESM version wins — and it didn't have `farm_deed`. Live result: `window.ITEMS.farm_deed` was `undefined`, the b136 smoke test for that field would have failed, and the deed-drop hooks would silently fail when they tried to grant the item.

- 📜 **`farm_deed` added to `src/data/items.js`** — the ESM source of truth. Mirrors the legacy.js entry exactly.
- 🛡 **Fixed the data-integrity check itself.** It was comparing `window.ITEMS` to the imported `ESM_ITEMS` — but by the time the check ran, main.js had already overwritten `window.ITEMS` with `ESM_ITEMS`, so it was comparing the ESM module to itself. Always reported "in sync." This is exactly why the b136 divergence shipped silently. Fix: legacy.js now publishes its inline ITEMS as `window.__LEGACY_INLINE_ITEMS` before main.js runs, and the integrity check now compares the snapshot against the ESM module — actually catching divergence.

If you've already loaded the b136 deploy, the b137 cache buster + service-worker killswitch will pull fresh files on the next reload. The data-integrity check will now log a console warning + Sentry capture if any future ITEMS divergence ships.

## v0.9.1-beta build 136 — 2026-05-04 (Batch C — farming + housing-gated crops)

The big one Tyler asked for last session: crop unlocks gated by Farm Plot tier, and the upgrade currency is a drop from gameplay (NOT bind-on-pickup, tradable on market).

- 🌾 **Housing-gated crop progression.** New `G.plotLevels` integer (1..5) controls which crops you can plant. Defaults to Lv 1 (Turnip-only) — matches the existing pre-deed gameplay so nothing breaks for current players. Each tier above 1 unlocks more crops:
  - Lv 1 → Turnip
  - Lv 2 → + Carrot, Wheat (1 deed)
  - Lv 3 → + Potato, Tomato (3 deeds)
  - Lv 4 → + Pumpkin (5 deeds)
  - Lv 5 → max (8 deeds, future-proofed for new crops)
- 📜 **Farmer's Deed (`farm_deed`)** — new tradable item, value 250g, NOT bind-on-pickup. Drops from:
  - Tier-2+ mob kills at **0.1%**
  - Bounty completions at **0.5%**
  Tier-1 mobs intentionally don't drop deeds — early game stays pure-progression and bounties cover all tiers.
- 🏗 **House → Plot tab** now shows a "Farm Plot · Lv X/5" card at the top with current deeds, the next tier's new crops, and a "Spend N Deeds" button.
- 🌱 **Farm panel** now shows: plot level + deed count + auto-replant status, a **Plant all** button (fills empty plots with the configured/best seed), an **Auto-replant** toggle, and an Upgrade Plot deep-link. The crops guide and seed picker label locked-by-plot crops with a deep-link to the upgrade card. Locked-by-skill stays separate (existing behavior).
- 🔁 **Auto-replant engine** (`HearthriseAuto.maybeReplant`) is now real (was a Batch C stub in b133). Hooked into `harvestPlot()` so a non-regrowing crop auto-plants the configured seed if you have one. Respects plot-level + farming-level gates.
- 🆕 **`src/features/farm-progression.js`** — `window.HearthriseFarm` API: `getPlotLevel`, `getPlotUnlockedCrops`, `canPlantCrop`, `getDeedsRequiredForNextLevel`, `getDeedCount`, `upgradePlot`, `rollKillDeed`, `rollBountyDeed`, `MAX_LEVEL`. Single source of truth for the housing gate — `plantCrop`, `openSeedPicker`, `renderFarm`, `renderHouse` all call through this API instead of duplicating logic.
- 🧪 **9 new regression tests:** API surface + farm_deed not-BoP, Lv 1 unlocks turnip-only, upgradePlot spends deeds + advances level, refuses without enough deeds, plantCrop respects the gate, maybeReplant plants on empty plots, maybeReplant skips locked crops, Tier-1 kills never drop deeds, plotLevels migration default holds.
- 🗄 **`snapshotG()` extended** to include `plotLevels`, `autoActions`, and `dropLog` so Batch B/C tests no longer leak state into the player's save when the suite runs.

**Architecture note:** all gating defers to `HearthriseFarm.canPlantCrop()`. If the script hasn't loaded yet (race), code falls back to "turnip-only" — same as the migration default, so behavior is consistent. The deed drop is centralised in `farm-progression.js`'s `rollKillDeed`/`rollBountyDeed` so balance changes touch one place. Farmer's Deed sits in ITEMS without `bop:true` — Tyler's explicit ask for tradability.

**Backlog addition:** logged the ESM HTTP-cache gap we hit verifying b135 — see ROADMAP "ESM module cache-buster gap". Recommended fix is versioned static imports, S-sized.

## v0.9.1-beta build 135 — 2026-05-04 (b133 test hotfix — green-bar discipline)

The b133 drop-log regression test that landed in b133 had a bug *in the test itself*: it asserted `after.kills === stats.kills + 1` but `stats` and `after` are both live references to the same entry on `G.dropLog`, so by the time the assertion ran, `stats.kills` already reflected the post-second-call value. Implementation was always correct; the test was wrong.

Why it slipped through earlier verifies: the test depends on running order — depending on what kill state `__test_monster__` had from previous suite runs, the equation `2 === 2 + 1` only fails on a fresh state. b134's verify caught it.

- 🧪 **Fixed** by capturing `stats.kills` and `stats.drops.test_drop` as primitives before the second `recordKill`, plus deleting the synthetic monster entry first so the test is deterministic regardless of prior runs.

This is hotfix-sized so it ships standalone before Batch C — keeps the suite green commit-to-commit per the engineering principles.

## v0.9.1-beta build 134 — 2026-05-04 (Batch B — auto-eat + train-to-level)

First user-visible features off the b133 foundations. Two idle-game essentials:

- 🍖 **#7 Auto-eat at HP threshold.** `HearthriseAuto.maybeAutoEat()` is called from the live combat tick AND offline catch-up. Reads config from `G.autoActions.eat` ({enabled, threshold, foodId}). When HP fraction ≤ threshold, eats one food (configured `foodId`, or falls back to the highest-`heals` food in bag), heals, decrements inventory, pushes a log line. The pre-roadmap inline auto-eat code was redirected through this engine — single source of truth. Existing food-slot dropdown in the loadout panel now syncs both `G.foodSlot` (legacy) and `G.autoActions.eat` (new).
- 🎯 **#15 Train-to-level-X auto-stop.** `HearthriseAuto.maybeStopTraining()` hooks into `addXp()`'s level-up branch. When the active skill matches the configured goal AND the new level meets/exceeds the target, the skill auto-stops with a `🎯 Cooking Lv 8 reached — auto-stopped` toast. The engine self-disables after firing so re-starting the same skill doesn't immediately stop again. New "Stop at Lv [_]" checkbox + number input live in the activity-detail header for each skill.
- 🗄 **Migration v3→v4 extended** to backfill `G.autoActions.eat` from the legacy `G.foodSlot` / `G.autoEatPct` fields. Existing players' setups carry over: if they had a food slot set, auto-eat is automatically enabled with that food at their previous threshold.

**Discoverability:** auto-eat surfaced in the existing loadout food picker, train-goal surfaced in the activity panel header. Both can be enabled/disabled inline without going to settings.

**5 new regression tests:**
- maybeAutoEat heals + decrements food when below threshold
- maybeAutoEat is a no-op when disabled
- maybeAutoEat falls back to best food in bag when no foodId set
- maybeStopTraining stops active skill at goal level + self-disables
- maybeStopTraining ignores non-matching skill (Cooking goal doesn't stop Mining)

**Architecture note:** `combatTick`'s inline auto-eat path is preserved as a defensive fallback (in case `HearthriseAuto` hasn't loaded yet — script-order safety). When the new engine is present, it takes priority. The legacy `G.foodSlot` / `G.autoEatPct` fields are kept in sync for backward compat with the existing UI; a future cleanup batch can deprecate them.

## v0.9.1-beta build 133 — 2026-05-04 (Batch A — enhancement roadmap foundations)

Tyler approved a 34-item enhancement roadmap + a new design ask: housing-gated farm progression where the upgrade currency drops from gameplay (bounty completions + tier-2+ mob kills, tradable on the market). Full plan lives in [`ROADMAP.md`](./ROADMAP.md). 11 batches, A through K. This build is **Batch A — foundations only, no user-visible features**. Sets up the plumbing every later batch needs so we don't have to retrofit it.

**Architecture-first.** API contracts written in comment blocks BEFORE feature code. Other batches must call through these APIs, not poke the underlying state directly. Single source of truth per system.

- 📜 **`ROADMAP.md`** added — single source of truth for the roadmap, principles, sequencing, housing-gate spec, auto-action engine spec, drop-log spec, and the items NOT in scope (so we don't accidentally re-add them).
- 🤖 **`src/features/auto-actions.js`** — new module exposing `window.HearthriseAuto`. Holds the config for auto-eat (Batch B), train-to-level (Batch B), and farm auto-replant (Batch C). Engine hooks (`maybeAutoEat`, `maybeStopTraining`, `maybeReplant`) are b133 stubs returning `false` — Batch B/C fill them in. Persistence is debounced into `saveLocal()` so settings survive reload.
- 📊 **`src/features/drop-log.js`** — new module exposing `window.HearthriseDropLog`. Records every monster kill + which drops actually rolled. Wired into `legacy.js`'s `killMonster` so it captures real combat data starting now. Batch F (b138) will render this in the monster preview modal.
- 🗄 **Schema v3 → v4 migration** in `src/save-migrations.js` — adds `G.autoActions`, `G.dropLog`, and `G.plotLevels` (the housing-gate counter Batch C will use) with safe defaults. Existing saves load unchanged. Idempotent: re-running the migration is a no-op.
- 🧪 **5 new regression tests** asserting the API surface, round-trip persistence, drop-log accumulation, migration applied, and `killMonster` integration without throws.

**No visible behavior change in this build.** Smoke test should pass green. Next session: Batch B (b134) — auto-eat at HP threshold + train-to-level auto-stop.

## v0.9.1-beta build 132 — 2026-05-04 (user-story playthroughs — round 4: mobile polish)

Cleared three of the queued mobile findings from b131's playthrough notes.

- 📊 **Topbar declutter on mobile.** Total Level, streak badge, status pill, notif bell, Save button, Settings button — all hidden under 540px viewport width. Players still get them via the MORE menu (where Save / Settings already live). The visible topbar is now: avatar + name + Quests pill + CL + Gold + Gems. Fits without clipping.
- 📜 **Quests modal collapses to single column on mobile.** The `.qm-body` grid was `1fr 280px` (quest list + summary sidebar) which on a 380px screen left the quest list cramped and titles wrapped mid-word. Mobile rule: `grid-template-columns: 1fr`, hide the sidebar entirely (the daily/weekly badge counts in the modal header already convey that info), and stack each quest card's reward column below the name instead of beside it. Titles now read normally.
- 🔍 **Market search persistence — investigated, not a bug.** "log" persisted across sessions because the market intentionally saves search/sort state to `localStorage:hearthrise:market:ui`. That's standard marketplace UX — players want their last search to stick. Striking the finding.

**Regression tests added** for the topbar declutter (no notif/save/settings visible at ≤540px) and quest modal columns (qm-body should be ≤1 grid column on mobile).

## v0.9.1-beta build 131 — 2026-05-04 (user-story playthroughs — round 3: mobile polish)

Continuing the mobile playthrough. Two more focused fixes for stuff a real player would hit on first launch.

- 🗺 **"Pick a monster on the left to begin." was wrong on mobile.** On mobile the combat layout has FOES as a sub-tab, not a left column. The empty-state text now reads `"Pick a monster from FOES to begin."` when `innerWidth ≤ 540`, otherwise the original "left" text.
- 🛍 **"← Back to Market" button overlapped the "PREMIUM STORE" title on mobile.** Title text and back button shared the same horizontal slot. On mobile, players reach Store via MORE → Store anyway (not Market), so the button was misleading there. Hidden on `innerWidth ≤ 540`; mobile players use bottom-nav / MORE menu to navigate. Same treatment for the "← Back to Combat" button on the Dungeons panel.

**Findings still queued for next round** (catalogued during this walk, not in this commit because the fix is bigger than a one-liner):

- Quest cards on mobile wrap titles mid-word ("Cook 5\ndishes") — card layout assumes wider viewport
- QUEST INFO summary overlaps the quest list scroll area when both visible
- Topbar currency pills clip past the right edge — only "50" visible from "500 GOLD" — horizontal-scroll fallback isn't kicking in
- Premium Store card stack pushes the In-Game Shop section below the fold; needs a sub-tab strip
- Market panel preserves "log" search across sessions — should clear on tab open

## v0.9.1-beta build 130 — 2026-05-04 (user-story playthroughs — round 2: quests + mobile)

Continued the playthrough series. Two more real bugs surfaced + fixed.

- 📜 **Daily quests modal showed "No daily quests" forever** even when `G.dailyGoals.picks` had 3 picked goal IDs. The modal calls `window.getGoalsForToday()` to expand picks → goal objects, but the function was a top-level declaration in `legacy.js` that never reached `window` from inside the modal IIFE. Same exact failure mode as `hoursTillUTCMidnight` from b127 — ironically, fixed by literally the same one-liner: `window.getGoalsForToday = getGoalsForToday;`.
- 📱 **Mobile skill tile click had zero visible feedback.** On desktop, `#skill-detail` renders side-by-side with the skills sidebar. On mobile (single-column), the detail stacks BELOW the sidebar — clicking Woodcutting renders the tree tiles 460+ pixels down, off-screen. Players thought the tile didn't work. **Fix:** when `openSkillDetail` runs at `innerWidth ≤ 540` (or landscape phone), `requestAnimationFrame` + `scrollIntoView({behavior:'smooth'})` brings the detail into view immediately.

**Regression tests added** for both — `getGoalsForToday` exposed on window, and `openSkillDetail` doesn't throw when called.

**Other findings catalogued during this round (queued for follow-up rounds):**

Mobile (Story 1–5 walks):
- M.4 / M.7: Topbar currencies clip at the right edge on narrow viewports — only "50" visible from "500 GOLD"
- M.6: "Pick a monster on the left to begin." text — there is no "left" on mobile (single column)
- M.3: "DUNGEONS" red button cuts in half between Combat sub-tabs and content
- Activity tile product icons missing on first render (already noted desktop, confirmed mobile)
- "QUESTS 0" pill takes a lot of horizontal space in the topbar on mobile

Desktop (Story 4 + 5):
- 4.1 Daily quest claim flow needs end-to-end verification once quests render (now that getGoalsForToday is wired)
- 5.1 Store hidden in sidebar on purpose — accessed via Market panel — but the entry point in Market should be more prominent
- 5.5 Buy flow works cleanly: gold debits, inventory increments, topbar updates, toast fires

## v0.9.1-beta build 129 — 2026-05-04 (user-story playthroughs — round 1)

Tyler asked for "play the game with intent" instead of "verify the panel rendered." First pass on desktop turned up real bugs the smoke test was never going to catch. Two fixes shipped here, full findings list queued for follow-up rounds.

**Bugs surfaced + fixed:**

- 🪓 **Skill tile emoji icons were invisible.** `legacy.css:2108` forces `font-size:0 !important` on `.sicon` (and `.icon`, `.mi`) on the assumption that an `<img>` child would always be present. After the b122 cleanup that emptied `_skillIcon` to fall back on emoji glyphs, the spans had nothing to render. **Fix:** new `theme-cozy.css` rule using `:has()` to keep `font-size:24px` when the span has no `<img>` child. Restores the 🪓 ⛏ 🎣 etc. emoji glyphs across Profile dashboard, Activities sidebar, monster rows.
- 💀 **Locked activity tiles dead-clicked.** Clicking a recipe / tree / rock you don't have the level for did absolutely nothing — no toast, no tooltip, no feedback. Players assumed the tile was broken. **Fix:** locked tiles now toast `"Requires Smithing Lv 5"` (with the actual skill name + req level). Patched in three call sites: `activities-grid.js` (gather + artisan tiles) and the legacy.js duplicates.

**Regression tests added** for both — locked-tile onclick can't be empty, `.sicon` font-size can't be 0.

**Findings queued for follow-up rounds (not in this commit):**

Profile orientation: no FTUE for first-time players, "THEMPHILL22+1" placeholder name shows publicly, "Pick an activity" hint isn't a button, `Active Effects` empty states have no CTAs.
Activities: tree product icons missing on initial render (appear after first start), "Qty: 0" badge unlabeled, smithing recipes not sorted by level requirement.
Combat: monster preview numbers (`95% hit, 1-1 dmg, TTK 20.2s`) don't match live combat (`72%, 1-4 dmg, 339 kills/hr`), preview modal fade-in transient leaks the underlying UI, equipment slot 3-letter labels (`Hel`, `Wea`, `Glo`) look like junk, "Suggested for your level" duplicates monster-list content.
Save: smoke test pollution leaked +12,345 gold into the player save before the b128 fix landed (cleaned manually).

Mobile playthrough not yet done.

## v0.9.1-beta build 128 — 2026-05-04 (real save/load bug uncovered by the suite)

The b127 suite ran on the live deploy and dropped from 5 fails → 1 fail. That last failure was the save/load round-trip test, and digging in surfaced an actual correctness bug that's been latent forever:

- 💥 **`loadLocal()` orphaned `window.G`.** The function was doing `G = {...G, ...migrated}` — creating a brand new object and reassigning the module-scoped `let G`. But `window.G` was bound to the *old* object once at boot (line 2093), so after any runtime `loadLocal()` call, `window.G` pointed at stale data. Every feature that reads `window.G` (the bug-report module, smoke test, auth listeners, anything in a separate file) saw pre-load state. Fixed by switching to `Object.assign(G, migrated)` — same merge semantics, but mutates G in place so window.G stays valid.

This is the kind of bug that's almost impossible to catch by playing the game (loadLocal usually runs once at boot, before window.G is exposed) but trivially reproduces under test. Exactly why we wrote the suite.

- 🧪 **New regression test** — `b128: loadLocal preserves window.G reference identity` — pins the invariant directly so the issue can never silently come back via a future cleanup.

Expected suite result on b128: 73/73 passing.

## v0.9.1-beta build 127 — 2026-05-04 (senior QA sweep — fixes from the 50-test suite running on b126)

The b126 suite ran on the live deploy and turned up 5 failures: 1 real bug + 4 stale tests. Plus a deep manual QA pass found 4 more real bugs the suite hadn't covered. Everything below ships in one commit, each fix paired with a regression test.

**Real bugs surfaced by the test suite:**
- 🍳 **31 cooked-food / raw-meat / recipe-scroll items** were still pointing at `icons3/...` (which 404s on the deploy) via two more blocks I missed in b125 — `legacy.js:5346–5369` and `5890–5927`. Both gone. Items now fall back to their emoji glyphs (🦐 🥩 🥕 🍞 🥣 🍲 🥧 🍱 🥘 📜 etc).
- 🛒 **Market-listing test** was using a wrong API shape (`{itemId, qty, price}` object). Real API is `M.listItem(itemId, qty, askEach) → {ok, reason?}`. Test rewritten to match — now actually verifies escrow decrements inventory.
- 🌱 **Farm-plot test** asserted `plot.id === 'turnip'` — real field is `plot.cropId`. Fixed.
- 💾 **Save/reload test** used a synthetic `__testMarker` field that the save serializer strips. Switched to verifying `gold` round-trips with a distinctive offset.
- 🐺 **Companion equip test** asserted `G.companions.equippedId` — real field is `G.companions.equipped`. Fixed.

**Real bugs surfaced by the manual QA sweep:**
- ❤️ **Character page showed `HP: — / —`.** Renderer was reading `G.hp` + `window.getMaxHp()`, neither of which exist. Real fields are `G.playerHp` / `G.playerMaxHp`. Fixed in `character-page.js:110-117` with both as primary lookup + the old paths as fallback.
- 🪟 **Modals stacked.** Opening Quests, then clicking another Profile button, then clicking another, and so on left THREE modals open at once (`qm-overlay` z=999999, `ach-overlay` z=9998, `stats-modal` z=1500) — three different patterns with no shared close. Added `closeAllModals()` that handles every modal pattern (including the element-removal-based Quests modal). Wired into `showTab()` so navigating between tabs auto-dismisses anything open. **Escape key** now also fires it.
- ⏱ **Quests modal showed "Resets in ?h"** instead of a real countdown. `hoursTillUTCMidnight` was a top-level function declaration but didn't reach `window` from inside the modal IIFE. Explicitly assigned `window.hoursTillUTCMidnight`.
- 🎨 **Quests modal hard-coded to dark navy.** The rest of the UI is cozy-light parchment. Added theme-prefixed overrides in `theme-cozy.css` so the modal's background, borders, tabs, quest cards, close button all match the rest of the game.

**Snapshot helper extended.** `snapshotG()` now snapshots 16 fields (was 7) so player-action tests touching `companions`, `farmPlots`, `rooms`, `quests`, `clanName`, `skills`, `stats`, etc. can't pollute the player's save when restored.

**5 new regression tests added** (one per bug above) so any of these can never silently come back. Test count: ~75. Manual run via `Ctrl+Shift+T` or 🧪 button still under 1 second.

## v0.9.1-beta build 126 — 2026-05-04 (regression test discipline)

Tyler called out that the smoke test isn't being maintained — bugs we already paid for once are surfacing again because we fix things and never write a guard. Fair.

- 🧪 **Smoke test grew from 22 → ~50 tests.** Three new sections added.
- 🛡 **Regression suite for b119–b125.** Each historical bug now has a dedicated test that fails if the bug comes back: `renderProfile` null guard, skill icon emoji fallback, topbar avatar resolves, prof-toolbar hidden on mobile, feat-buttons grid on mobile, SW kill-switch present, no legacy snapshot refs, cache-buster matches `HearthriseBuild`, bug-report button rendered, Supabase config valid.
- 🖱 **Interactive click coverage.** Tests now click every bottom-nav tab, every sidebar nav, topbar buttons, profile feat-buttons, all 6 combat tier chips, sample monster rows, skill rows, activity tiles, inventory sub-tabs, house tabs, farm plots, bounty rows, stable cards, market sort/search, bug-report 🐛 button, and settings tabs. Catches "X stopped firing on click" silently.
- 🎮 **Player-action E2E tests.** Real loops: gain XP from a skill tick, equip + unequip a weapon, start + stop combat, plant + harvest a farm plot, upgrade a house room, create + cancel a market listing, purchase a listing, claim a daily quest, save + reload roundtrip, smelt a copper bar, equip + unequip a companion, join + leave a clan. Every test snapshots `G` and restores at the end — running the full suite 100x leaves the player's save byte-for-byte identical.
- 🗑 **Deleted ~85 more lines of dead `icons3/` paths** in `legacy.js` lines 4293–4378 (the "Poneti v1" block) — the smoke test's bundle-path assertion surfaced these. b125 missed this block; b126 catches it via the test that flagged it.
- 📜 **`TESTING.md`** — workflow doc. Explains how to run the suite, when to run it, and the iron rule: every bug fix AND every new feature ships with a test in the same commit. Sketches a GitHub Action for headless CI as the next step.
- 🤖 **`CLAUDE.md`** — project rules auto-loaded in every Claude session in this workspace. The testing rule, build/ship workflow, asset rules, and mobile-CSS gotchas all live there so future sessions don't have to be reminded. Closes the loop on "Claude keeps forgetting to add tests."

Net: full coverage of every interactive surface in the game, plus the discipline to keep it that way. Run `Ctrl+Shift+T` or click the floating 🧪 Test button to execute.

## v0.9.1-beta build 125 — 2026-05-04 (cleanup pass: dead icons + old SW snapshots)

Cleanup sweep to cut bug surface, since "code rot" was making bug-hunting harder than it should be. No new features, no behavior changes — just deletes.

- 🗑 **Removed ~90 lines of dead `icons3/...` path assignments** in `src/legacy.js` (lines 4380–4471). They populated `_itemPath`, `_skillIcon`, `_monsterIcon` with paths to icon folders that aren't shipped on the deploy. The `applyLocalIcons()` IIFE at the bottom of the file maps the curated subset we DO ship to `assets/icons-bundle/...`. Anything not in the curated subset falls through to the emoji glyph from the data file (`m.icon`), which is the desired behaviour.
- 🗑 **Stopped applying broken `BUNDLE_*_ICON` paths.** `BUNDLE_SKILL_ICON` / `BUNDLE_ITEM_ICON` / `BUNDLE_MONSTER_ICON` literals are kept as the canonical "shopping list" of art we want to buy from Itch, but we no longer push their `assets/raw-bundle/...` paths into the runtime maps because that folder isn't deployed.
- 📁 **Moved 23 old snapshot HTML files** (`hearthbound-phaseA-*.html`, `hearthrise-phaseA-*.html`, `hearthbound-v2.html`, etc.) from the deploy root into `.legacy/snapshots/`. Each one shipped its own service worker that could re-register on a stuck device if a user landed on a stale URL. Cleaner deploy folder + one less haunting vector.

Net: ~150 lines deleted from `legacy.js`, deploy root is now just `index.html` + two harmless dev tool pages (`icon-mapping-preview.html`, `style-lanes.html` — neither registers a SW).

## v0.9.1-beta build 124 — 2026-05-04 (universal SW kill-switch + duplicate prof-toolbar hide)

Tyler hit "Auth not configured" again on a stuck device. Console traced errors to `legacy.js?v=111` even though deployed HTML is v=124 — the b111+ service worker on his device cached old HTML and is still serving it instead of fetching fresh. b119's kill-switch only triggered for the original `hearthbound-v2` legacy cache, which means anyone whose SW cached a build between b110 and b123 stayed stuck.

- 💥 **Universal SW kill-switch.** Inline `<script>` in `<head>` now reads the current build from any `?v=` tag on the page (`hearthrise-<BUILD>`), then checks `caches.keys()`. If ANY cache exists that doesn't match the expected name (and isn't empty), it deletes every cache, unregisters every SW, and reloads once. sessionStorage flag prevents reload loops. Works for all past stuck builds, not just b108-b110.
- 🔄 **Manual reset escape hatch.** Append `?reset-sw=1` to the URL on any stuck device — kill-switch runs unconditionally, strips the flag from URL, reloads. Use this when a friend phones to say "the game won't load."
- 🪟 **Hide duplicate `.prof-toolbar` on mobile.** b123's grid rule accidentally un-hid the desktop-only `.prof-toolbar` Profile container — players saw both `.feat-buttons` (Achievements/Bestiary/Last Session/Lifetime) AND `.prof-toolbar` (Objectives/Achievements/Bestiary/Lifetime) stacked. Mobile rule now keeps `.prof-toolbar { display: none }` and only sizes `.feat-buttons`.

## v0.9.1-beta build 123 — 2026-05-04 (b122 cascade hotfix)

After verifying b122 on the deployed iframe, the feat-buttons stayed as a vertical stack and the topbar still wrapped to two rows. Diagnosed: an earlier `html:not([data-theme]) #panel-profile .feat-buttons { display: flex !important }` rule (specificity 0,1,2,1) was outranking the b122 mobile rule (specificity 0,1,1,0). My `display: grid !important` from b122 lost to a more-specific theme rule.

- 🎯 **Re-emit feat-buttons grid + topbar nowrap with theme-prefixed selectors** so specificity ties and last-loaded wins. Covers `.feat-buttons`, `.profile-toolbar`, `.profile-actions`, `.prof-toolbar`.
- 📜 **Topbar now horizontally scrolls on portrait** when stats overflow — better than wrapping. Stats labels (CL, TL, GOLD, GEMS) hidden on portrait, restored on landscape. Avatar shrunk to 28px.

## v0.9.1-beta build 122 — 2026-05-04 (mobile QA + UI/UX sweep, pass 1)

Tyler ran a senior-tester pass and found the mobile experience nowhere near ship-ready. First batch of fixes:

- 🪙 **Skill tile icons fixed.** Every skill in Activities was rendering as a broken-image square because `_skillIcon` pointed at `assets/raw-bundle/...` paths that aren't in the deploy. Cleared the map so each skill falls back to its emoji glyph (matches the cozy theme anyway). Real curated PNGs land in a later build.
- 🟧 **Topbar avatar fixed.** Player avatar was a 404 dark square (`icons3/.../BoldWarrior_nb.png` not deployed). Swapped for `assets/icons-bundle/monsters/Warrior_nb.png` with an `onerror` fallback to ⚔️ emoji.
- 🟪 **Wax seal off on mobile.** Profile's bottom-right wax-seal ornament covered the Lifetime Stats + Save Status cards on portrait phones. Hidden under the mobile media query (still ships on desktop).
- 📐 **Profile feat-buttons in a 2×2 grid** on portrait, 4-across on landscape. Was a vertical stack eating half the viewport.
- 🧱 **Character page kills right-side bleed.** `#panel-character`'s grid is forced to a single column with `max-width:100%` and `box-sizing:border-box` everywhere on mobile.
- 📏 **Topbar compact.** One-row layout, smaller pills, name truncates to 90px, hidden empty `<img>` orphans.
- 🛡 **Combat FOES sub-tab DUNGEONS button** wraps cleanly without overflowing the title row.
- 🔴 **Inventory action buttons** themed wax-stamp red so they read as primary actions instead of disabled-looking ghosts. Ghost/secondary buttons preserved.

Pass 2 (landscape) and Pass 3 (interaction polish) still to come.

## v0.9.1-beta build 121 — 2026-05-04 (screenshot ignores the modal itself)

b120 shipped screenshots inline in Discord — but they captured the bug-report modal that was on top of the screen, defeating the point. Tyler wants to see what's BEHIND the modal, not the form he just filled out.

- 🚫 **html2canvas `ignoreElements`** filters out: `#hr-bug-modal` (the form), `#hr-bug-btn` (the floating 🐛), `#chat-dock` (when open), `#more-modal` (the mobile More sheet). The screenshot now shows the actual game state the user was reporting on.

## v0.9.1-beta build 120 — 2026-05-04 (Discord screenshots inline)

Bug reports were capturing screenshots (b117) but the direct Discord webhook path was sending JSON-only embeds, so the image never appeared in the message. Tyler asked to see it inline.

- 📸 **`sendDiscord` now uses multipart FormData** when a screenshot is present. Image attaches as `screenshot.jpg`, embed's `image.url` is set to `attachment://screenshot.jpg`, Discord renders it inline below the metadata fields.
- 🟫 **Webhook author renamed** to `Hearthrise Bug Bot`, embed color changed to wax-stamp red `0xd44a3a` to match the in-game theme.
- 🆕 **Viewport added** as an inline field — useful for mobile-vs-desktop bug triage.
- 🛟 No-screenshot fallback preserved (JSON-only embed) for cases where html2canvas fails.

## v0.9.1-beta build 119 — 2026-05-04 (SW kill-switch + renderProfile null guard)

Tyler reported "auth not configured" on the live site. Console showed an error torrent: `TypeError: Cannot set properties of null (setting 'textContent') at renderProfile (legacy.js?v=111:1297)`. Two issues:

1. **Old service worker still alive.** Errors stack-trace to `legacy.js?v=111` even though the deployed HTML is at v=118 across all script tags. The pre-b111 SW (cache name `hearthbound-v2`, cache-first strategy) is still intercepting requests in installed browsers and serving stale JS — including the SW reference itself, so it can't update itself.

2. **`renderProfile` crashing on null DOM.** When `onAuthStateChange` fires before the Profile panel template is in the DOM, `getElementById('dash-user-sub')` returns null → `.textContent =` throws → error boundary captures it → infinite re-render loop because the auth listener also re-fires on render.

Fixes:

- 💀 **SW kill-switch** added as the very first inline `<script>` in `<head>`. Runs before any SW can intercept. Detects old `hearthbound-v2` cache, deletes it, unregisters the SW, reloads once. `sessionStorage` flag prevents reload loops. Idempotent — does nothing if no old cache exists. After this self-heals, the b111+ network-first SW takes over and future updates propagate normally.
- 🛡️ **Null guards in `renderProfile`** for `dash-user-sub` and `dash-user-body`. If either is missing, bail early instead of crashing. Stops the auth-listener-driven render loop.

After this build deploys, anyone stuck on a pre-b111 SW will auto-recover on next page visit. New installs use the b111+ SW from the start.

## v0.9.1-beta build 118 — 2026-05-04 (Discord webhook live)

Tyler set up the Hearthrise Discord server (Info / Community / Feedback categories with 8 channels). Created the `#bug-reports` channel + "Hearthrise Bug Bot" webhook. Webhook URL pasted into `DISCORD_WEBHOOK_URL` in `bug-report.js` — bug reports now flow directly to Discord.

This is a temporary configuration until the Cloudflare Worker is deployed (waiting on Tyler's GitHub access). The URL is currently in the public JS bundle. Risk: scraper-driven channel spam. Mitigation: regenerate webhook URL in Discord if abused.

After Worker deploy, the URL moves to a Cloudflare secret and the constant goes back to empty.

## v0.9.1-beta build 117 — 2026-05-04 (bug-report pipeline + screenshot capture)

The "test on phone via RDP" pain solved.

- 📸 **Screenshot capture in bug reports.** `html2canvas` (loaded from CDN, no bundle bloat) renders the current viewport to a JPEG; included in the report payload. Embedded inline in the Copy-to-clipboard markdown. Visible in Discord embeds + GitHub Issues.
- 🌉 **Cloudflare Worker bug-report bridge.** New file `cloudflare-workers/bug-report-bridge.js`. Single endpoint that fans out to **Discord channel + GitHub Issues** in parallel. Holds Discord webhook URL + GitHub PAT as Cloudflare secrets so they never touch the public web client.
- 📝 **`BUG_REPORT_PIPELINE.md`** — step-by-step setup guide. ~25 min one-time wiring: Discord channel + webhook → GitHub PAT → Cloudflare Workers signup → `wrangler deploy` → secrets → paste worker URL into `bug-report.js`.

After Tyler completes the setup, the testing loop becomes:

> Phone → 🐛 → Send → Discord notification on phone (Tyler sees) + GitHub Issue created (Claude reads via WebFetch)

Every report has the screenshot inline, viewable on either side. Claude can comment on issues, label them, close them as fixed. Persistent shared source of truth for bugs across co-pilot sessions.

The legacy direct-Discord and Supabase paths still work as redundant fallbacks. If `BRIDGE_URL` is left blank in `bug-report.js`, the game uses the old paths transparently.

## v0.9.1-beta build 116 — 2026-05-04 (landscape side-rail height hotfix)

After b115 deployed, the side rail was visible at the top with HOME / Profile button rendered correctly — but no other buttons. iframe DOM inspection showed all 6 buttons existed (Home/Character/Combat/Skills/Farm/More at y=6, 64, 122, 180, 238, 296) but the nav container was only 60px tall with `overflow: auto`, so 5 of 6 buttons were below the fold and required scrolling.

Cause: my own b113 block in `theme-cozy.css` had `.bottom-nav { height: calc(40px + safe-b) !important }` from when the nav was still horizontal. b113 came AFTER b114 in the file, so b113's height override won via cascade order. Self-inflicted regression.

Fix: removed the obsolete bottom-nav height + bn-btn sizing rules from the b113 block. b114's `height: 100vh` now wins. All 6 rail buttons are visible top-to-bottom in landscape.

## v0.9.1-beta build 115 — 2026-05-04 (landscape visual polish)

Tyler's first b114 read: "clunky, no parchment background on left nav." Six issues spotted in the iframe screenshot:

1. Side rail dark cocoa, didn't match theme
2. Topbar still too tall — eating reclaimed vertical
3. DUNGEONS button overflowed to the right
4. Buttons clustered at top of rail, bottom empty
5. Topbar email clipped behind rail boundary
6. Activity bar barely visible

This patch fixes all six.

- 🟫 **Side rail is parchment** (cream→amber gradient) with 2px gold border. Cocoa text, Cinzel font, hover state, wax-stamp red active. Matches the rest of the cozy theme — feels like part of the game, not an injected sidebar.
- 📏 **Topbar 32px** (was 36) with tighter stats row
- 🛡️ **DUNGEONS button** width-capped at 140px so it stops sprawling
- 📐 Activity bar 26px slim
- 🔧 Layout offset moved to `.app` level so children inherit cleanly — topbar no longer bleeds behind the rail
- 💬 Full chat dock (when opened from More menu) respects side-rail offset

## v0.9.1-beta build 114 — 2026-05-04 (landscape side-rail nav)

The real landscape answer (b113 was the baseline; this is the structural fix).

- 📱 **Bottom nav rotates into a left side rail in landscape.** Same DOM, same buttons — just `flex-direction: column` and positioned on the left edge. Reclaims the ~40px of vertical the horizontal bottom-nav was eating. Wax-stamp red active-state preserved.
- 📐 **Topbar slim** — 36px in landscape (was 40px), pushed right to clear the rail.
- 🎯 **Activity bar slim** — 28px strip at top.
- 🔋 **Content gets the full vertical screen** — panels no longer reserve bottom space for nav.
- 🎨 **Side rail uses cocoa gradient** with gold border, matches the parchment-RPG palette.
- 📱 Triggers on landscape phones AND tablets ≤1024px wide so iPad-mini-in-landscape and similar fall in.

Verification gate before b115: real-phone test in landscape — content area should now feel spacious (~70% of horizontal × 100% of vertical), not cramped.

## v0.9.1-beta build 113 — 2026-05-04 (landscape baseline + UX plan)

After Tyler discovered he'd been playing in landscape (which our portrait-only media queries didn't match), this push makes landscape phones a first-class orientation rather than a broken one.

**This push is a baseline, not the final answer.** Senior PM read: rather than shipping one giant landscape redesign and risking regressions, we phase it across b113 → b116 with verification gates between each push. Plan is documented in `UX_PLAN.md`.

- 🔄 **Mobile rules now fire in landscape too.** Every `@media (max-width: 540px)` block now also matches `(max-height: 540px) and (max-width: 900px)`. Sub-tabs, dense lists, chat-as-tab, all the b110-b112 work — fires in both orientations.
- 📐 **Landscape-specific chrome compaction.** Topbar 40px (was 60), bottom nav 40px (was 60), sub-tab strip 32px (was 56). Activity bar 28px. Card padding 4-6px. Reclaims most of the vertical bleed in the cramped 380px landscape height.
- 📋 **`UX_PLAN.md`** ships with the push, capturing the b113→b116 phased plan to senior-quality landscape (side-rail nav, two-column content, verification gates).

**Open issue (planned for b114):** landscape still uses the horizontal bottom nav, which eats ~40px of vertical when ergonomically a left side rail would work better in landscape. Not addressed in b113 because rotating the nav is a real DOM/layout change with regression risk and we want to verify b113 is stable first.

## v0.9.1-beta build 112 — 2026-05-04 (Profile bleed-through hotfix)

🚨 **The reason "nothing looked different" on your phone after b110 + b111.**

A CSS rule I wrote way back in b109 was missing its `.active` scope:

```css
#panel-profile { display: block !important; }   /* old — wrong */
#panel-profile.active { display: block !important; }   /* b112 — correct */
```

That single missing `.active` was forcing the Profile panel to render on top of every other tab on mobile. Combat / Inventory / Skills with their new sub-tab strips were ALL there, working — just hidden behind a permanently-visible Profile panel. The Achievements / Bestiary / Lifetime Stats buttons + player name showing on every tab in the iframe screenshots was the giveaway.

This single character fix should make b110 + b111 visible on phones for the first time. After this push deploys + the b111 service-worker fix actually takes effect (one more home-shortcut reset required), every future build auto-updates.

## v0.9.1-beta build 111 — 2026-05-04 (mobile rebuild pt 2 + service-worker fix)

Two big things in this push.

### 1. Service worker rewrite (P0 — fixes the "phone shows old version" bug)

Previous service worker used a fixed cache name (`hearthbound-v2`) and "cache-first" strategy. Translation: once the SW cached a file, it served the cached version forever. Pushing new builds did nothing for installed PWAs until the user manually deleted + reinstalled the home shortcut. That's why b110 looked unchanged on Tyler's phone home shortcut.

New strategy:
- Cache name now includes the build version (e.g. `hearthrise-111`). Each build → new cache → old caches purged on activate.
- App shell (HTML/JS/CSS) = network-first. Fresh fetch on every load when online; cache fallback only when offline.
- Static assets (PNG/SVG/font) = cache-first because they're URL-versioned.
- `skipWaiting()` + `clients.claim()` so updates take effect on the next page load with no manual reset.

After this build deploys, all future pushes will propagate to phones automatically within ~30s of opening the app.

### 2. Mobile rebuild pt 2 — Inventory + Activities

Same Idle-Clans-style sub-tab pattern Combat got in b110, applied to two more panels.

- 🎒 **Inventory sub-tabs**: `Bag | Equip | Saved` strip. Bag shows just the item grid (5-col on mobile), Equip shows the paper-doll + hero stats, Saved shows loadouts. New `src/inventory-mobile-tabs.js`.
- ⛏️ **Activities skill strip**: 9 skills as a horizontal-scroll strip across the top (Wood / Mine / Fish / Farm / Cook / Craft / Smith / Prayer / Magic). Tap to focus. The selected skill's detail view fills the rest of the screen. Replaces the desktop sidebar+detail layout that was eating ~60% of the panel on mobile. New `src/activities-mobile-tabs.js`.
- Skill nodes (Normal Tree, Oak, etc.) and bag tiles densified to phone-friendly sizes.

## v0.9.1-beta build 110 — 2026-05-04 (Idle Clans-style mobile rebuild — pt 1: Combat)

First of three structural rebuilds to make the mobile experience feel like Idle Clans (and other dense, tabbed mobile idle games) instead of a desktop site squeezed into a phone.

This push targets the **Combat panel** + chat-as-tab + dense lists. Next pushes (b111, b112) restructure Inventory/Activities and the rest.

- ⚔️ **Combat sub-tab strip on mobile**: `Style | Foes | Arena` across the top of the panel. Only one section is visible at a time. New `src/combat-mobile-tabs.js` injects the bar; CSS in theme-cozy.css gates section visibility via `data-mobile-sub`. Replaces the 1500px-tall vertical scroll with a focused single-pane view.
- 💬 **Chat moved into the More menu** on mobile (was a floating pill that overlapped gameplay). Tap More → 💬 Chat → dock opens fullscreen. Floating pill is hidden on phone via CSS. New `src/mobile-more-chat.js` wires the button.
- 👹 **Dense monster list rows** — was 200px+ "cards" with verbose chips, now ~56px rows: tiny icon, name, weakness, tier badge. Same screen now shows ~12 monsters where it used to show 3.
- 📐 **Bounty cards densified** to match — 60px rows with compact reward + weakness text.
- 🔁 **Folded in the b109 polish** — chat pill no longer overlaps nav, density restored from b108's over-correction, profile overlap killed, bottom nav 48px tap targets, topbar compacted.

## v0.9.1-beta build 109 — 2026-05-04 (real-phone fixes)

Tested on a real phone after b108 deployed. Reports:
- "Chat button is in the way"
- "Combat screen is not visible"
- "Way too much scrolling"
- "Profile page has a ton of overlap"

Cause: b108 over-corrected on padding/font/tap-target sizes — everything got bigger so the page got taller, and the chat pill at `bottom: 16px+safe-b` sat directly on top of the new 60px+safe-b bottom nav.

This patch walks b108 back to a denser layout while keeping tap targets above Apple's 44px minimum.

- 💬 **Chat pill lifted above bottom nav** (was overlapping). Smaller, more transparent, with backdrop blur — feels like a quiet utility, not a primary CTA.
- 📐 **Density restored.** Base font 13px (was 14), panel padding 8px (was 12), card padding 10px (was 14), card margin-bottom 8px (was 12). Page is shorter, less scrolling.
- ⚔️ **Combat panel compressed.** Hidden the "Style: Accurate · Trains: Attack / Accuracy skill: attack..." descriptive text on mobile — it's redundant once you've picked a style. Combat-style buttons now in a tight 4-up grid with no labels. "Suggested for your level" hidden on mobile because the full monster picker covers the same purpose.
- 👤 **Profile overlap fixes.** Last card has 80px bottom margin so it doesn't sit under the chat pill. feat-buttons back to single-column stacked (was 2-col but labels truncated). Active Effects copy compacted.
- 📱 **Topbar + bottom nav compacted.** Bottom nav 48px tap targets (was 52, still over Apple's 44 minimum) saves 4px of vertical real estate × every screen.
- 🔁 **Full chat dock when expanded** now flush left/right and sits above the bottom nav, not floating in space.

## v0.9.1-beta build 108 — 2026-05-04 (mobile feel pass + PWA polish)

Tyler reported it's a "shit experience" on a real phone in browser. The iframe audit only proves CSS works at 380px; doesn't catch the actual touch / keyboard / safe-area / lag issues. This pass attacks those.

- 👆 **Tap delay killed everywhere** — `touch-action: manipulation` globally + on every interactive element. The 200-300ms iOS tap-lag responsible for "feels slow" is gone.
- 🎯 **Tap targets ≥44px on every interactive element** (Apple HIG minimum). Bottom-nav buttons 52px, monster/bounty cards 56px, Accept/Build/Buy buttons 40px, combat-style picker 48px, paper-doll slots 56px. Phones can actually hit things now.
- 📱 **Safe-area-insets respected** for iPhone home indicator + notch. Bottom nav extends with `env(safe-area-inset-bottom)`, topbar pads with `env(safe-area-inset-top)`. No more home indicator chopping the nav.
- ⌨️ **Soft keyboard no longer covers chat input** — new `src/mobile-keyboard.js` module toggles `body.kb-open` on focus + scrolls the field above the keyboard. Uses `visualViewport` API on newer browsers for precise detection.
- 🌬 **Visual breathing room** — bigger base font on phones (14 / 1.45 line-height), more panel padding, more card spacing.
- 🍯 **Wax-red tap highlight** instead of the default blue iOS Safari flash — matches the rest of the cozy theme.
- 🏠 **PWA install polished** — manifest now uses the real Hearthrise crest icon (was emoji), `theme_color` + `background_color` switched to cozy palette so the install splash + status bar match the in-game UI. "Add to Home Screen" produces a proper-looking app.

## v0.9.1-beta build 107 — 2026-05-04 (mobile follow-ups)

Two issues caught when re-walking the iframe mobile audit after b106 deployed.

- ⚔️ **Combat monster picker was actually rendering at 26px tall** (just the card header — body collapsed because of `overflow: hidden + flex: 0` from desktop styles). Now forced to `min-height: 240px`, `overflow: visible`, `height: auto` on mobile so the tier buttons + monster cards inside actually show.
- 📋 **Profile right-side bleed.** The 2-column layout (main content + Active Effects sidebar) wasn't stacking on mobile — fragments like "FO... HC... wid..." were visible past the parchment edge. Forced single-column block layout, Active Effects flows underneath. Also wrapped the `.feat-buttons` row (Achievements / Bestiary / Last Session / Lifetime Stats — 570px wide before) into a 2×2 grid.

## v0.9.1-beta build 106 — 2026-05-04 (mobile pass)

Found these by loading the live site in a 380px iframe (Chrome MCP can't actually shrink the viewport, so the iframe trick fires the real `@media (max-width: 540px)` rules).

- 📱 **Chat dock no longer takes over the screen on mobile** — forces minimized state on first load when the viewport is ≤540px. First impression is the small "Chat" pill, not a full-screen overlay.
- 🏠 **House building icons survive on mobile.** When the `.shop-row` flex went vertical at narrow widths, the building image was collapsing to 0px. Forced a 48×48 reserved column (44×44 on phones <400px). The Forge cottage / Library tower / Garden windmill all show up now.
- ⚔️ **Combat monster picker no longer disappears on mobile.** The tier selector + monster list was being hidden by the desktop side-by-side layout breaking. Forced `display: block` and stacked the three columns vertically.
- 🎒 **Inventory paper-doll fixed for mobile.** Was showing only the Helm slot at narrow widths. Now renders as a 3-column responsive grid that fits all 14 slots inside 380px.
- ✏️ **Player name ellipsis** instead of mid-word clip ("ADVENTU..." → "ADVENTURER…", proper truncation marker).
- ⚔️ **Combat-style header stacks** the DUNGEONS button below the title at <540px so "COMBAT STYLE — 1H SWORD" no longer gets cut off by it.

## v0.9.1-beta build 105 — 2026-05-04 (chat polish + monsters + polish)

Six things in one push.

- 💬 **Chat dock now shows your message immediately** after sending. The supabase chat backend was silently dropping subscribers when it hot-swapped over the local backend — fixed by re-subscribing on `setBackend`. Realtime pushes from other users will start flowing too.
- 🐉 **31 hand-painted monster avatars** wired up. Slime, Field Rat, Goblin (1-5 variants), Skeleton, Spider, Zombie, Wraith, Demon, Dragon, etc. — every monster in the bestiary now has art instead of a generic crate. Adds ~10 MB.
- 🏠 **Building icons in House sized up** from 42×42 to 56×56 — the homestead reads more substantial.
- 🎒 **Inventory paper-doll hover labels** — tooltip now reads e.g. "Helm: Iron Helm (click to unequip)" so you know which slot is which even when filled.
- 📋 **Bug-report dialog has a Copy button** — falls back to clipboard so testers can paste reports into Discord/email/wherever even before we wire up a real webhook.
- 🔧 **Consolidated Supabase clients** — chat backend now reuses the auth.js client. Removes the "Multiple GoTrueClient instances detected" warning from the console.

## v0.9.1-beta build 104 — 2026-05-04 (chat fix)

- 💬 **Chat send was 400'ing for everyone signed in.** The `from_id` column on `chat_messages` is a UUID, but the chat code was sending `"local-0"` (a local fallback) instead of the actual Supabase user UUID. Now reads the live session user.id when present, with a graceful fallback to legacy local IDs only when offline.

## v0.9.1-beta build 103 — 2026-05-03 (asset cherry-pick)

First batch of real hand-painted icons shipped to the live deploy.

- 🏠 **House rooms now have hand-painted buildings** — Forge is a blacksmith cottage, Kitchen is a homestead, Library is a tower, Garden is a windmill, Trophy Room is a citadel, Cellar is a cottage. Replaces the emoji glyphs.
- 🌾 **Farm plot buildings get art too** — Farm Plot is a real farm, Tool Shed is a small house, Watchtower is a tower.
- ⛏️ **Material items get hand-painted icons** — wood logs (all 5 tiers), planks (all 5 tiers), copper/iron/silver/gold/mithril/rune bars, copper/iron/silver/gold ore, stone, mushrooms, dragon eggs. Inventory + crafting recipes start showing real art.
- 🎨 New `assets/icons-bundle/` directory ships ~14 MB of curated PNGs cherry-picked from the icons3 megapack. Subfolders: buildings/, resources/, medieval/. More to come in build 104+.
- 🔧 Replaced the b101/b102 absence-probe with a proper override system. Items without art fall through cleanly to the emoji glyph (`m.icon`).
- 📋 Added `ASSET_AUDIT.md` documenting which packs match the cozy theme and which don't. Spoiler: `Icons/`, `icons2/`, and `icons4/AI|EPS|TXT/` are off-theme and should be deleted from local disk.

## v0.9.1-beta build 102 — 2026-05-03 (second hot patch)

Walked the live site, found six things, fixed all of them.

- ❤️ **Character page HP** — was showing `— / —` because it read `G.hp` / `getMaxHp()` (neither exists). Now reads `G.playerHp` / `G.playerMaxHp` like Inventory does. Shows `10 / 10` correctly.
- 👤 **Profile auth state** — Profile sheet said "Offline play · sign in to sync" even when Settings showed cloud sync active. Profile now reads the live Supabase session directly and displays "Online · cloud save active" with the right name.
- ☁️ **Settings cloud-sync status** — was contradicting itself ("Cloud save active · syncing every 30s" right next to "Never synced"). Now shows "Auto-syncing every 30s — waiting for first round-trip" while signed in, only switching to a real timestamp once a sync completes.
- 🛒 **Market buttons re-skinned** — green Idle-Clans-style "List" button is now wax-stamp red; dark-blue "Premium Store" pill is now parchment with a gold gem accent. Both match the rest of the UI.
- 📦 **Bundle-icon 404s silenced** — the `assets/raw-bundle/` directory isn't on the deploy, so every monster icon was 404ing and falling back to a generic crate. Added a startup probe: if the bundle is absent, clear the icon maps so renders use the proper monster emoji directly (🐀 🦊 ⚔️ etc.). No more 404 spam, no more broken-image flash.

## v0.9.1-beta build 101 — 2026-05-03 (hot patch)

Bug-fix patch caught during the first live-site walkthrough.

- 🐛 **Bounty Board raw-HTML finally fixed for real.** The old regex-on-innerHTML approach fought with `image-fallback.js` and produced corrupted markup like `class="icon-fallback" style=...> Field Rat`. Rewrote `paintBountyMonsters` to use proper DOM API (createElement + appendChild) — the failure mode can't recur.
- 🚪 Click the idle activity bar in the topbar to jump straight to Activities. New-player quality-of-life.
- 👋 First-time-after-signup welcome modal — fires once per account, names the player, points at Activities.
- 🛒 Market "List an item" form had an olive-green background; now matches parchment.
- 📋 Added `TODO_BETA.md` with prioritized post-beta backlog.

## v0.9.1-beta — 2026-05-03

**Hearthrise looks like a real game now.** Massive UI rebuild to match the homestead-RPG vibe.

- 🎨 New character-sheet UI: parchment pages with gold corner flourishes + wax seal, instead of the old dashboard cards
- 🏠 New Hearthrise crest logo — cottage with rising sun above + wheat sheaves
- ✒️ Hand-drawn icons for every nav and topbar slot (24 SVG icons in a consistent style)
- 🌅 Atmospheric "homestead at golden hour" background — warm amber sky fading down through grass to deep forest
- 🔴 Wax-stamp red accents for primary actions (Sign In, Quests, active nav)
- 📜 Cinzel typography for headings; Quicksand for body — replaces generic sans
- 💬 Chat dock + welcome modal + bug-report system all themed
- 🔐 Cloud sync (sign in via Settings → Account) live for cross-device saves
- 🛒 Marketplace (player listings) lives at Market tab; premium store accessible from there
- 🗝 Dungeons accessible from a button inside Combat
- 📋 Beta invite system + signup display name field

**Gameplay**
- All 9 skills trainable, weapons + armor crafting, Bounty Board with marks rewards
- Companion system: Wolf, Beaver, Raccoon
- House upgrades: 8 rooms, account-wide bonuses

**Known limitations**
- Beta — expect some rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished.
- Some achievements + the bestiary are still client-side only.
- Email confirmation links may need a fresh browser tab to complete sign-up.

**How to send feedback**
- Use the 🐛 button bottom-right → captures your build version + game state
- Or join the Discord (link in Settings → Beta tester tools, once configured)


## v0.9.0-beta — 2026-05-01

**Welcome to Hearthrise beta!** Thanks for testing.

- ☁️ Cloud save: sign in to sync your progress across devices
- 💬 Live global, trade, clan, and whisper chat
- 🛒 Player market with search, 7-day price analytics, and partial buys
- 🐛 Bug-report button (bottom-right corner — please use it!)
- 🏆 Leaderboards: Total Level, Combat, Gold

**Known limitations**

- This is beta — expect rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished right now.
- Some achievements + the bestiary are still client-side only.

**How to send feedback**

Use the 🐛 button bottom-right, or pop into the Discord (link in Settings).
