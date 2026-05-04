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
| A | Foundations — auto-action engine + drop log + migrations + this doc | b133 | (no user-visible features) | **in progress** |
| B | Idle automation, combat side | b134 | #7 Auto-eat at HP threshold · #15 Train-to-level-X auto-stop | pending |
| C | Farming + housing gate | b135 | #24 Plant all · #25 Auto-replant · #26 Plot visual variation · **Housing-gated crop progression (deed drops)** | pending |
| D | Profile launchpad | b136 | #1 Resume last activity · #2 Today's progress · #3 Next milestone · #5 Editable display name | pending |
| E | Inventory QoL | b137 | #19 Slot tooltips · #20 Sort/filter · #21 Compare-on-hover · #22 Bulk-sell · #23 Right-click menu | pending |
| F | Combat enhancements | b138 | #8 Log scrollback · #9 Drop log UI · #10 Weakness filter · #11 Loadout swap · #13 Tier-6 ceremony | pending |
| G | Activities click-switch | b139 | #14 Click-to-switch active · #18 Locked tier preview tooltip | pending |
| H | House polish | b140 | #27 Material gathering shortcut · #28 House visual paper-doll (art-bound) · #29 Theme preview hover | pending |
| I | Flow + retention | b141 | #30 FTUE · #31 Level-up celebration · #32 Offline auto-pop · #33 "What do you want to do?" helper | pending |
| J | Mobile + topbar polish | b142 | #35 Unclaimed badge · #37 Swipe gestures · #38 Haptic · #39 Mobile bottom-nav badges | pending |
| K | Social + retention | b143 | #41 Co-op XP bonus · #42 Friends online feed | pending — depends on Social backend |

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
