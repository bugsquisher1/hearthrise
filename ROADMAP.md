# Hearthrise — Enhancement Roadmap

> Single source of truth for the multi-batch enhancement effort that started after the user-story playthroughs (b129–b132).
> Tyler approved the 34 items + the housing-gated farming design on 2026-05-04.

---

## Engineering principles

These are the rules every batch in this roadmap follows. They live here AND in `CLAUDE.md` so future Claude sessions don't drift.

1. **Every commit ships with regression tests** — `TESTING.md` has the rule.
2. **State migrations for every `G` shape change.** Goes through `applyMigrations()`. Old saves must load.
3. **Architecture-first per batch.** API contracts in comment blocks before any feature code. Other features must use the API, not poke internals.
4. **Single source of truth.** Auto-actions config = one object on `G`. Drop log = one table. Don't scatter state.
5. **Backward compatible defaults.** Missing field → safe default. Never crash the loader.
6. **Smoke test stays green commit-to-commit.** A red test means the commit is wrong, not the test.
7. **No tempting one-liners in unrelated files.** Find something else? Add a roadmap entry, don't slip a fix into an unrelated diff.
8. **CHANGELOG entries explain what AND why.** Future-me reading in 6 weeks should understand.

---

## Batches

| # | Batch | Build | Items | Status |
|---|---|---|---|---|
| A | Foundations — auto-action engine + drop log + migrations + this doc | b133 | (no user-visible features) | **shipped** |
| B | Idle automation, combat side | b134 | #7 Auto-eat at HP threshold · #15 Train-to-level-X auto-stop | **shipped** |
| — | b135 hotfix — drop-log test live-reference bug + snapshotG tightening | b135 | (test-only) | **shipped** |
| C | Farming + housing gate | b136 | #24 Plant all · #25 Auto-replant · #26 Plot visual variation (deferred) · **Housing-gated crop progression (deed drops)** | **shipped** |
| — | b137 hotfix — items.js farm_deed divergence + data-integrity meta-bug fix | b137 | (hotfix) | **shipped** |
| D | Profile launchpad | b138 | #1 Resume last activity · #2 Today's progress · #3 Next milestone · #5 Editable display name | **in progress** |
| E | Inventory QoL | b139 | #19 Slot tooltips · #20 Sort/filter · #21 Compare-on-hover · #22 Bulk-sell · #23 Right-click menu | pending |
| F | Combat enhancements | b140 | #8 Log scrollback · #9 Drop log UI · #10 Weakness filter · #11 Loadout swap · #13 Tier-6 ceremony | pending |
| G | Activities click-switch | b141 | #14 Click-to-switch active · #18 Locked tier preview tooltip | pending |
| H | House polish | b142 | #27 Material gathering shortcut · #28 House visual paper-doll (art-bound) · #29 Theme preview hover | pending |
| I | Flow + retention | b143 | #30 FTUE · #31 Level-up celebration · #32 Offline auto-pop · #33 "What do you want to do?" helper | pending |
| J | Mobile + topbar polish | b144 | #35 Unclaimed badge · #37 Swipe gestures · #38 Haptic · #39 Mobile bottom-nav badges | pending |
| K | Social + retention | b145 | #41 Co-op XP bonus · #42 Friends online feed | pending — depends on Social backend |

---

## Cross-cutting design specs

### Housing-gated farm progression (Batch C)

Tyler's design ask: farm crop unlocks gated by Plot upgrades, but the upgrade cost is an item that **drops** from gameplay (not gold/materials). Tradable on the market — not BoP.

**Item:**
- `farm_deed` — icon 📜, name "Farmer's Deed", value 250g, NOT bind-on-pickup
- Stack-able

**Drop rates:**
- 0.5% per bounty completion (any tier, any monster)
- 0.1% per mob kill at Tier 2+ (Tier 1 stays farm-and-bounty-only to keep early game pure-progression)

**Plot tier mapping:**
| Plot Lv | Crops unlocked | Cumulative deeds spent | This-tier cost |
|---|---|---|---|
| 1 (default) | Turnip | 0 | — |
| 2 | + Carrot, Wheat | 1 | 1 |
| 3 | + Potato, Tomato | 4 | 3 |
| 4 | + Pumpkin | 9 | 5 |
| 5 (max) | all crops | 17 | 8 |

**State:** new field `G.plotLevels = 1` (single integer; one farm plot upgrade level applies to all 8 plots). Migration default = 1 so existing saves keep current Turnip-only behavior.

**UI:**
- Farm panel: locked seed entries display "Locked — upgrade Farm Plot to Lv 2 (House → Plot tab)" with deep-link
- House → Plot tab: new "Farm Plot · Lv X/5" card with "Spend Deed (1)" button when deeds available + level < 5
- Inventory: deeds appear as a stackable item

**API:**
```js
window.HearthriseFarm = {
  getPlotLevel(),               // → number 1..5
  getPlotUnlockedCrops(),       // → ['turnip', 'carrot', ...]
  canPlantCrop(cropId),         // → boolean
  getDeedsRequiredForNextLevel(), // → number
  upgradePlot(),                // spend deeds, level++, fire UI refresh
};
```

### Auto-action engine (Batch A)

Centralised state for every "do this automatically" toggle. Used by Batch B (auto-eat, train-to-level) and Batch C (auto-replant).

**Shape:**
```js
G.autoActions = {
  // b134 — Combat panel
  eat: {
    enabled: false,             // master toggle
    threshold: 0.5,             // 0..1, eat when playerHp/playerMaxHp <= this
    foodId: null,               // specific food, or null = best in bag
  },
  // b134 — Skills panel
  trainGoal: {
    enabled: false,
    skillId: null,              // 'mining', 'cooking', etc
    targetLevel: null,          // stop at this level
  },
  // b135 — Farm panel
  farmReplant: {
    enabled: false,
    cropId: null,               // 'turnip', 'carrot', etc — must be unlocked by plot level
  },
};
```

**API:**
```js
window.HearthriseAuto = {
  getEat(),                     // → {enabled, threshold, foodId}
  setEat(opts),                 // { enabled?, threshold?, foodId? }
  getTrainGoal(),               // → {enabled, skillId, targetLevel}
  setTrainGoal(opts),
  getFarmReplant(),             // → {enabled, cropId}
  setFarmReplant(opts),
  // Engine hooks — called by combat tick, harvest handler, etc.
  maybeAutoEat(),               // returns true if a food was consumed
  maybeStopTraining(),          // returns true if goal reached + skill stopped
  maybeReplant(plotIdx),        // returns true if replanted
};
```

**Persistence:** part of normal `saveLocal()` — round-trips through localStorage.

### Drop log table (Batch A)

Centralised history for every monster kill. Used by Batch F (per-monster drop log UI). Cheap to record at kill-time, valuable to display.

**Shape:**
```js
G.dropLog = {
  // monsterId → { kills, drops: { itemId: count }, firstSeen, lastSeen }
  slime: {
    kills: 47,
    drops: { slime_gel: 4, bones: 1, sticky_core: 2 },
    firstSeen: 1777887461131,
    lastSeen: 1777887999999,
  },
};
```

**API:**
```js
window.HearthriseDropLog = {
  recordKill(monsterId, dropsObj), // dropsObj = {itemId: count}
  getMonsterStats(monsterId),       // → entry or null
  getAllStats(),                    // → full table
};
```

**Persistence:** part of `saveLocal()`. Migration default = `{}`.

---

## What's NOT in scope

Items from the design pass that Tyler did NOT pick — kept here so we don't accidentally re-add them:

- #4 Recommended actions card on Profile
- #6 Activity ticker on Profile
- #12 Auto-fight next monster
- #16 Combat skills surfaced in Activities sidebar
- #17 Sort tiers by XP/hr
- #34 Toast click-to-navigate
- #36 Smart "Add to Home Screen" prompt
- #40 Direct gift sending

If a future batch needs one of these, raise it then.

---

## Backlog (post-roadmap)

Real engineering tasks captured outside the 11 batches. Each gets its own batch when prioritised.

### Single-session enforcement (raised b135, 2026-05-04)

**Problem:** A character can currently be logged in at two places at once (phone + browser, two tabs, etc). Both clients write to the same Supabase save → conflicts, lost progress, ongoing offline-tick polling stomping on each other.

**Why it's not in the current 11 batches:** orthogonal to UX/feature work. Touches Supabase auth + sync layer, not Profile / Combat / Farm UI.

**Approach options to evaluate:**
1. **Heartbeat-based.** Each session pings `device_sessions` table every ~30s with a session ID. New session starts → server checks for active heartbeats < 60s old → if found, current session takes over and the existing one gets a "logged in elsewhere" toast on next sync attempt + soft-kick.
2. **Session token.** Server issues a monotonic session token at login. Client sends it on every save / sync. If a newer token has been issued, the old one's writes are rejected — existing client sees "your session expired" and reloads.
3. **Supabase Realtime presence.** Use the `presence` channel — when a new device joins, broadcast a kick message; old device receives, signs out gracefully.

**Recommended:** Option 2 (session token). Simpler than presence channels, more authoritative than heartbeats, easy to reason about for save conflicts.

**Acceptance criteria:**
- Player signs in on Device A, then Device B → A is signed out within ~10s with a "Logged in elsewhere" notice
- A's offline tick stops; A's pending sync is rejected (no overwrite of B's progress)
- Reconnecting on A signs in fresh (not a forced loop)
- Edge case: two tabs same device same browser → newer tab wins, older tab notifies

**Rough effort:** M-L. Schema change to Supabase + auth.js wiring + sync.js token gating + UI for the kicked-out toast.

### ESM module cache-buster gap (raised b136, 2026-05-04)

**Problem:** The b124 service-worker kill-switch wipes SW caches + unregisters SWs whenever the build cache name doesn't match. It does NOT touch the browser's HTTP cache. GitHub Pages serves modules with `Cache-Control: max-age=600`, so when `main.js?v=NNN` is bumped on a release, the browser re-fetches `main.js` (cache-busted by the query) but its static imports (`./features/smoke-test.js`, etc — no query) still come from the 10-minute HTTP cache. Result: `?v=` bumps on `main.js` don't reliably propagate to ESM-imported feature files.

**Symptom we hit:** b135 fixed a smoke-test bug but the LIVE page kept running the old assertion text for ~10 min after deploy, even after `?reset-sw=1` and a hard reload. Confirmed by dynamic `import('?bust=Date.now()')` getting fresh code (89/89 green) while the static-imported module was still stale.

**Approaches:**
1. **Append `?v=NNN` to every static import inside `main.js`** — explicit cache-bust per module, but needs to be regenerated each release.
2. **Generate an importmap on deploy** that maps every module to a versioned URL. Centralised, harder to drift.
3. **Lower max-age via meta http-equiv** or a SW that injects no-cache headers. Heavyweight + the SW has to live across releases.
4. **Live with it.** Tyler's release cadence means a 10-min cache lag is annoying but not blocking.

**Recommended:** Option 1 (versioned static imports). Cheapest fix, mirrors the pattern already used for `<script src=?v=>` tags in `index.html`. A small build step (or a sed in `bump-version.sh`) can keep imports in sync.

**Acceptance criteria:**
- `?v=NNN` bump on `main.js` causes ALL ESM-imported modules to refetch on next reload.
- No new "stale module" reports during release verification.

**Rough effort:** S. ~10 imports in `main.js` to update + a bump-script tweak.
