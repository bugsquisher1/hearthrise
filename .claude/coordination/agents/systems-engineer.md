# Systems Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Content authored ONCE in `src/data/*`; `main.js` identity-merges ESM into `window.__LEGACY_INLINE`. Never reintroduce the data double-copy (top-level `const` shadowing). Guard test asserts identity.
- Theme: `:root` = dark tokens; `body[data-theme="cozy-light"]` for retired light. Guard tests fail if unscoped patterns return. When a visual bug recurs, find what re-asserts it — don't stack overrides.
- Economy server-authoritative (Supabase, `schema.sql` applied); no PvE Hearth Token mint; race-safe market + seller ledger.
- Save: `snapshotG` = manual 24-field allowlist (fragile); new state must survive save/load.
- Don't rewrite working architecture without strong evidence. Think at 10× content.

## Standing debt (b214 audit, grade C−)
`showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built, 0 consumers; 27 files use `localStorage` directly vs 3 on the seam; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.

## Log
### 2026-08-08 · Wave 1 — backlog #7 (toasts) + #8 (chat button) + beta-modal emoji · branch `worktree-agent-a6734a16f384fc2ed`

**#7 root cause (all three complaints, one corner).** `notify()` in `src/legacy.js` was six lines: 13.5px type, a flat 3500ms timeout, and `while(el.children.length>5) el.children[0].remove()` — which *destroys* toasts on arrival during a burst rather than queueing them. Positionally, `.notifs` (z 1000, bottom-right 12px), `#chat-dock.mini` (z 10000, bottom-right 16px) and `#hr-bug-btn` (bottom-right, bottom 62px) are **three pieces of floating chrome in one corner** — the chat pill outranks the toasts, so the newest notification was literally behind it. The `audit-overrides.css` zone comment claims `.notifs` owns "zone-toasts" while two other elements sit in it; the zone policy was documentation, not enforcement.
**Fix:** new `src/features/toasts.js` owns the queue (legacy `notify()` delegates, keeps a fallback render). Body-size type (`--t-body`), duration = 4s floor + 55ms/char capped at 9s, ≤4 visible with a real pending queue (stale entries >15s skipped, not shown minutes late), identical messages coalesce to one row with `xN`, pause-on-hover, click to dismiss. Clearance is **measured, not hardcoded**: `layout()` reads the live rects of everything in `OBSTACLES` (`#chat-dock`, `#hr-bug-btn`, `#bottom-nav`) and lifts the column above them; if the required lift exceeds 42% of the viewport (expanded chat panel) it side-steps horizontally instead. New floating chrome adds a selector — no new magic offsets.

**#8 root cause:** the chat pill had no position state at all. **Fix:** pointer-drag on `#chat-dock-min` with a 5px click/drag threshold, edge snap, and clamping that keeps it **below the topbar + activity strip** (movable must not create the same problem elsewhere). Position persists as normalised `{fx,fy}` fractions of the free space — raw pixels saved on a big monitor would strand the pill in a small window — through the **platform storage seam** (`HearthriseStorage`, 4th consumer; the 4 pre-existing chat keys still bypass it, migrating those is a separate change). Free positioning is desktop-only (`innerWidth > 540`); mobile media queries own the pill with `!important` there. Custom position applies to the mini pill only — the expanded panel keeps its default anchor, and the toast queue side-steps it.

**Found while verifying (real pre-existing bug):** claiming the daily reward printed ~700 characters of raw `<svg>` path data as a toast. `daily-reward.js` handed `rewardText()` (built for `innerHTML`) to `notify()`, which renders with `textContent`. Always broken; the b219 toast just stopped it being small and brief enough to miss. Fixed at the call site (plain text + a real toast type — `'gold'` was never one) **and** defensively in the renderer (tags stripped; still `textContent`, never `innerHTML` — that path was the b214 stored-XSS hole).

**Also (Final Directive, files already open):** chat send button was a dingbat arrow `➤` (the project's own emoji filter flags U+27A4) → line-art SVG; `DEFAULT_CHANNELS` carried dead emoji `icon` fields unrendered since b213 → removed.

**Verify:** smoke **185/185**, 0 runtime errors, stable across 3 consecutive runs; `bump-version.sh --check` OK; `findUiOverlaps()` empty; console clean. Each new test confirmed to FAIL without its fix (disabled `toasts.js` → 6 fail; reverted toast font to 13.5px → 1 fail; re-added `🌱` → 1 fail). Browser (own server :8132, cache-busted): real toasts from combat kills / drops / daily-reward claim measured clear of both the chat pill and the bug button (column bottom 808 vs bug top 818), 16px type, 4-up stack with `x6` coalescing, queue drains without dropping, drag persists across reload, click still toggles, expanded panel triggers the side-step, mobile 375px clears the bottom nav.

**Test-harness note for the team:** the game tick runs THROUGH the suite and earlier tests leave combat active, so a real toast can land in `#notifs` mid-test. Never assert on `querySelector('#notifs .notif')` — use the new `findToast(mark)` / `findToasts(mark)` helpers. Cost me 3 flaky failures.

**Flagged, not fixed (not mine / bigger than this change):** `theme-cozy.css:3995` has an unscoped `:root .notif {...}` — the same always-true theme-leak pattern DISCOVERIES records as fixed in b216. My `body[data-theme]` rules outrank it, but the leak is still there and there are likely siblings. Art Director's call.

Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · Wave 0 — backlog #3 (sub-tab snap-back) + #4 (companion tab) · branch `worktree-agent-a5fe79b25379a4838`
Both fixed. Files: `src/legacy.js` (buildTibiaDoll), `src/styles/theme-cozy.css`, `src/features/smoke-test.js`.

**#3 root cause:** the equipment doll (Equipment | Stats | Companion sub-tabs, `buildTibiaDoll()` ~L7280) is rebuilt from scratch on every panel re-render. On the Inventory page that re-render fires from the wrapped `updateTopbar`/`addItem`/`equip`/`unequip` (i.e. every resource gain / kill while idle-training), and each rebuild hardcoded the Equipment pane `active` — snapping the player back within seconds. NOT an idle-timer bug: 7s idle on inventory = 0 rebuilds; the trigger is activity. **Fix:** persist selected pane in `window._tdPane` (same `window._*` UI-state convention as `_invFilter`/`_invMultiSelect` — no new global pattern) and restore it via `applyPane(activePane)` on build.

**#4 root cause:** the Companion sub-tab pane held ONLY the companion equip slot (a lone icon) — no companion level/XP/stats. Beside the doll, `invc-stats-col` always shows the PLAYER's Hero/Weapon-Styles/Bonuses sheet, so opening "Companion" left the player looking at their own stats. All companion progression data already exists and is exposed on window by the companions ESM module (`companionLevelFromXp`, `companionXpToReach`, `getCompanionBonus`, `COMPANIONS[id]`), rendered correctly in the Stable + profile card but never wired into the doll tab. **Fix (contained, per task):** render the equipped companion's own name/level/XP-bar/effective-bonuses/proc into the pane, reusing those existing functions. Styled with tokens, scoped `body[data-theme="hearthlight"]`. No invented fields → nothing routed to Game Designer.

**Verify:** smoke 177/177 (added 2 b218 regression tests), 0 runtime errors; `bump-version.sh --check` OK. Browser (own server :8132, cache-busted, confirmed live code): Companion + Stats sub-tabs survive real `addItem`/`updateTopbar` re-renders and a 6s wait; Companion pane shows "Fox Lv 1 · UTILITY · 0/50 XP · +1 STR +2% XP +1 gold"; console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · bootstrap
Domain seeded. No active task. Base green at `119a698`.
