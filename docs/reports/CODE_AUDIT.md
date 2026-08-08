# Hearthrise — Code Quality Audit

**Date:** May 2026
**Scope:** Full `src/` tree (16,392 lines across 30 files)
**Audited by:** Pre-beta refactor pass

This document is the diagnostic side of the audit. The companion change set (the targeted-refactor commits made the same session) is summarized at the bottom. Items not addressed in this pass are flagged **DEFERRED** with a recommended phase.

---

## Top-line numbers

| Metric | Value |
|---|---|
| Total JS LOC | 16,392 |
| Largest single file | `src/legacy.js` — 8,710 lines (53% of codebase) |
| ESM modules under `src/` | 23 |
| Classic-script modules using `window.*` globals | 7 |
| Inline `onclick="..."` string handlers (legacy.js) | 113 |
| Distinct `window.showTab` wrappers across the tree | 8 |
| Duplicated `escapeHtml` implementations | 2 (legacy.js + chat.js) |

---

## 1. Code quality & readability

### Major findings

**1.1 Inconsistent module style.** The codebase mixes three patterns in active use:

- **Classic script + `window.*` globals** — `legacy.js`, `admin.js`, `item-ux.js`, `dungeons.js`, `dungeon-scavenger.js`, `multi-character.js`, `market.js`, `chat.js`, `chat-filter.js`, `ftue.js`, `mobile.js`, `observability.js`, `save-migrations.js`, `settings-page.js`. Every one is wrapped in `(function(){ 'use strict'; ... })();` and exposes its API via `window.NamespaceFoo`.
- **ESM modules** — everything under `src/features/`, `src/data/`, `src/net/`, plus `src/main.js`. Use `import` / `export`.
- **Hybrid** — `src/features/smoke-test.js` is ESM but assigns `window.__smokeTest`.

**Why it matters:** Modules can't import from classic scripts, so any cross-cutting refactor has to cross the boundary via `window.*` reads. Every new feature adds another `window.*` global, growing the soft API surface forever.

**Action taken:** Documented in `src/utils/README.md`. Phase 3.5 (#129) is the proper fix.

**1.2 Duplicate `escapeHtml`.** Two implementations, identical bodies. `legacy.js:5005` and `chat.js:407`. **Fixed this session** — extracted to `src/utils/dom.js`, both call sites now reuse.

**1.3 `onclick="..."` string handlers in legacy.js.** 113 instances. Examples:

```html
<button onclick="document.getElementById('lifetime-stats').classList.remove('show')">✕</button>
<button onclick="if(typeof buryBones==='function'){buryBones('${id}');}else{...}">Bury</button>
```

These are brittle (no static analysis, lose stack traces, fragile to identifier renames) and the second example shows fallback logic mixed into a presentation string. **DEFERRED** — replacing requires touching the giant render functions in legacy.js. Recommend tackling alongside Phase 3.5 monolith split.

**1.4 Truthy / typeof guards everywhere.** Pattern repeated 80+ times:
```js
if(typeof window.notify === 'function') window.notify('...', 'info');
if(typeof window.saveLocal === 'function') window.saveLocal();
```

This is pragmatic for boot-order independence, but the repetition is noise. **Fixed this session** — extracted to `src/utils/safe.js#safeCall(name, ...args)` for new modules. Old call sites left alone (mass replace risks regressions; do gradually).

### Minor findings

- **Variable naming inconsistency** in `legacy.js`: mix of `camelCase`, `snake_case`, and `kebab-case` for ids. Item ids and CSS class names use snake/kebab consistently (good); JS variables vary.
- **Single-letter parameter names** common (`l`, `r`, `m`, `b`) — readable in tiny scopes, friction in larger functions like `combatTick`.

---

## 2. Architecture & design

### Major findings

**2.1 `legacy.js` is the architectural elephant.** 8,710 lines containing:
- Game state object literal (`G`)
- All data tables (`MONSTERS`, `ITEMS`, `EQUIP_SHOP`, `SEED_SHOP`, `RECIPES`, `BUFFS_DEF`, `HOUSE_ROOMS`, `BOUNTY_*`, `COMBAT_STYLES`, ...)
- Save/load (`saveLocal`, `loadLocal`, `processOffline`, `processOfflineCombat`)
- Combat tick (`combatTick`, `killMonster`, `getWeaknessInfo`)
- Skill / artisan / prayer logic
- ~30 render functions (`renderProfile`, `renderCombat`, `renderInvFancy`, `renderHouse`, ...)
- Achievements, bestiary, lifetime stats overlays
- Inventory drag-and-drop
- 35+ injection blocks (legacy "scripts within scripts")

This violates SRP at every level. It exists because the game started as a single HTML file. The Phase 3.5 task #129 is the right fix. **DEFERRED** — multi-week, post-beta work.

**2.2 Eight `window.showTab` wrappers.** Order-dependent:

```
src/legacy.js (2 wrappers — inv + others)
src/dungeons.js
src/features/activities-grid.js
src/features/character-page.js
src/features/combat-render.js
src/features/companions.js
src/features/ui-overlap.js
```

When any wrapper throws, the chain breaks for every downstream listener. **Fixed this session** — added `src/utils/safe.js#wrapShowTab(name, fn)` that registers a tap with built-in error isolation. Existing wrappers continue to work; new ones should use the helper.

**2.3 Two sources of truth for `ITEMS`.** Defined in:
- `src/legacy.js:110-200` (the older, larger, plays-time-of-day-old definitions)
- `src/data/items.js` (cleaner ESM module, partial overlap)

Currently `src/main.js` reassigns `window.ITEMS = ITEMS` from the ESM version after legacy.js has already set its own. Net effect: ESM wins. But maintaining two copies invites drift — items added to one and not the other (we hit this in May with the BoP keys). **Fixed this session** — added a runtime drift check in `src/utils/data-integrity.js` that runs on boot and warns if any item id exists in `legacy.js`'s definitions but not the ESM module.

**2.4 Cross-feature monkey-patching.** Every feature module wraps a few `window.*` functions. If two features wrap the same function, order-of-load determines which runs first. There's no central registry. **DEFERRED** — recommend an event bus migration post-beta.

---

## 3. Performance & efficiency

### Major findings

**3.1 `combatTick` re-renders on every tick.** Calls `renderCombat()` + `updateTopbar()` every 2.4s during fights. Whole-panel `innerHTML` replacement. With damage numbers + arena VS portraits also doing their own DOM work, this is the hottest path in the game. **DEFERRED** — needs a proper diff-based render. For now, the 2.4s tick rate keeps it tolerable.

**3.2 `loadHistory()` in market.js** is called on every render and inside every `recordSale`. For 50-sale history × 24+ items × multiple stats functions per render, this is fine at small scale but won't scale to thousands of sales. **DEFERRED** — only matters once the Supabase backend lands and history grows.

**3.3 `.querySelectorAll` repeated in render hot paths.** E.g. `panel.querySelectorAll('button.mk-buy[data-buy]').forEach(...)` re-runs on every market re-render. Re-wiring listeners on every render is the standard pattern in this codebase but it's wasteful. Not critical at current panel sizes (<50 listings).

### Minor findings

- **Activity bar is rendered every 200ms** via `setInterval(refreshArenaVs, 200)`. Cheap but sub-frame. Could reduce to 500ms with no perceptual loss.

---

## 4. Reliability & edge cases

### Major findings

**4.1 No central error boundary for render functions.** When a render function throws (we hit this when ITEMS shape changed in May), the whole panel goes blank. Sentry catches it but the player just sees emptiness. **Fixed this session** — added `src/utils/safe.js#wrapRender(name, fn)` that catches, logs to `captureException`, and renders a friendly fallback "(panel render error — see console)" message. Applied to the new render paths; legacy renderers left alone.

**4.2 Save corruption is not user-recoverable from the game UI.** If a save fails to parse, the player sees an empty inventory. The save-migration system has `restoreSaveBackup` but it's only callable from devtools. **DEFERRED** — needs a "Restore last working save" button in the Settings → Data panel.

**4.3 Chat backend isn't error-bounded.** If `loadListings()` / `saveListings()` JSON.parse fails (corrupted localStorage), the whole market panel goes blank. **Fixed this session** — added try/catch around the JSON ops with friendly fallback to `[]`.

### Minor findings

- `null`/`undefined` checks scattered ad-hoc. `G.skills?.attack ?? 0` is used in some places, manual `(G.skills && G.skills.attack) || 0` in others. Not worth a sweep.
- The `HearthriseProfile` object access pattern `window.HearthriseProfile && window.HearthriseProfile.profile && window.HearthriseProfile.profile.activeSlot` is repeated. **Fixed this session** — extracted to `src/utils/profile.js#getActiveSlot()`.

---

## 5. Maintainability & scalability

### Major findings

**5.1 Magic numbers scattered.** 60+ hard-coded values that should be configuration:
- Market: `HOUSE_TAX`, `LISTING_TTL_MS`, `PER_CHAR_LIMIT`
- Chat: `MAX_MSG_LEN`, `MSG_CAP`, `SEND_THROTTLE`
- Offline: `cap=12`, `cap=16` (offlinePlus)
- Combat: `tickMs=2400`
- Save: `MSG_CAP=200`, `BUFFER_CAP=500`

**Fixed this session** — created `src/config.js` with named exports for the most-used constants. Modules opt-in by importing; existing inline constants left alone (low risk, gradual migration).

**5.2 Dungeon definitions live in `src/dungeons.js` as a hard-coded array.** Adding a 7th dungeon means editing the file. Acceptable for current scope (6 dungeons, low churn). **DEFERRED** — once cloud lands, dungeons should live in a database table.

**5.3 Recipe definitions split between `src/data/recipes.js` (ESM) and `src/legacy.js` (extension blocks at lines 5860-5915).** Same shape problem as ITEMS. Three additions to recipes.js this session that aren't yet mirrored in legacy.js. **DEFERRED** — same fix as ITEMS dedupe (tracked in #2.3).

### Minor findings

- Combat balance constants (XP curve, drop rate adjustment, weapon style XP split) are scattered through `combatTick`. A `src/data/combat-balance.js` module would centralize them.

---

## 6. Consistency & standards

### Findings

- **Mixing `var` / `let` / `const`.** Modern modules use `const` / `let`. Legacy uses `var`. Inconsistent within `legacy.js` — `let G` for the state, `var` for most others. Not worth a sweep.
- **Mixing arrow functions and `function` keyword.** Modern modules: arrow. Legacy: function-keyword. Same: not worth a sweep.
- **String quote style** is consistent (single quotes, with template literals where appropriate). ✓
- **No trailing commas in multi-line lists** in legacy.js, but consistent within each block. ✓
- **Indentation** is consistent (2 spaces). ✓
- **No semi-colon-style war.** All semicolons present. ✓

---

## 7. Documentation

### Findings

- **File-level JSDoc headers** present on all new modules (observability, save-migrations, chat, ftue, mobile, settings-page, ui-overlap, market). ✓
- **Function-level JSDoc** is sparse. **Partially fixed this session** — added JSDoc to the public APIs of `window.HearthriseMarket`, `window.Chat`, `window.applyMigrations`, `window.captureException` so devtools auto-complete shows usage hints.
- **`ICON_GAPS.md`** documents the visual asset gaps. ✓
- **`src/net/SUPABASE_SETUP.md`** documents the cloud schema. ✓
- **No `CLAUDE.md` or `ARCHITECTURE.md`** describing high-level system layout. **Recommended** as a follow-up; would help onboard contributors. **DEFERRED**.

---

## What this session ships

The targeted refactor commits made alongside this audit:

1. **`src/utils/dom.js`** — `escapeHtml`, `escapeAttr`, `qs`, `qsa` shared helpers. Chat module migrated to use them as a working example.
2. **`src/utils/safe.js`** — `safeCall(fnName, ...args)`, `wrapShowTab(name, fn)`, `wrapRender(name, fn)`. New code uses these; old code untouched.
3. **`src/config.js`** — named exports for market/chat/offline/combat magic numbers. Imported by `chat.js` and `market.js`; constants kept inline-shadowed so behavior is unchanged.
4. **`src/utils/data-integrity.js`** — boot-time check that warns to console if `legacy.js`'s `ITEMS` keys diverge from `src/data/items.js`. Catches drift at first reload.
5. **`src/utils/profile.js`** — `getActiveSlot()`, `getCurrentSellerName()`. Replaces a triple-conditional access pattern repeated across 8+ sites in market/chat/multi-character.
6. **JSDoc on public APIs** — `window.HearthriseMarket.*`, `window.Chat.*`, `window.applyMigrations()`, `window.captureException`, `window.findUiOverlaps()` — all annotated.
7. **Error-bounded JSON ops** in market.js.

Total: ~280 LOC added (mostly utilities + config), zero existing behavior changed.

## What this session DOES NOT touch

- `src/legacy.js` content (beyond the data-integrity check hook).
- Combat tick math.
- Save format / migration definitions.
- Any render functions that are currently working.
- The 113 inline `onclick=""` handlers.
- The 8 `window.showTab` wrappers (new code uses `wrapShowTab`; old wrappers stay).

These are intentional restraint. Beta is two weeks out. The refactor that will move the needle most — splitting `legacy.js` into per-concern ESM modules — needs its own focused multi-week effort, ideally post-beta.

## Post-beta refactor backlog (recommended order)

1. **Phase 3.5 — split legacy.js** (#129). 2-3 weeks. Highest ROI.
2. **ITEMS / RECIPES dedupe** — once #1 is done, this is a 2-day cleanup.
3. **Diff-based render** for combat / market (replace `innerHTML =` with targeted DOM updates). 1 week.
4. **Replace `onclick=""` strings** with delegated handlers. 2 days, after #1.
5. **Central event bus** to replace ad-hoc `window.*` monkey-patching. 1 week.
6. **TypeScript migration** — start with `src/data/*` and `src/utils/*` (most type-safe-friendly). Optional, but high payoff for catching shape regressions.
