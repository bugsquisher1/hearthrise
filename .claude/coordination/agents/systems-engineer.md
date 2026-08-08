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
### 2026-08-08 · Wave 0 — backlog #3 (sub-tab snap-back) + #4 (companion tab) · branch `worktree-agent-a5fe79b25379a4838`
Both fixed. Files: `src/legacy.js` (buildTibiaDoll), `src/styles/theme-cozy.css`, `src/features/smoke-test.js`.

**#3 root cause:** the equipment doll (Equipment | Stats | Companion sub-tabs, `buildTibiaDoll()` ~L7280) is rebuilt from scratch on every panel re-render. On the Inventory page that re-render fires from the wrapped `updateTopbar`/`addItem`/`equip`/`unequip` (i.e. every resource gain / kill while idle-training), and each rebuild hardcoded the Equipment pane `active` — snapping the player back within seconds. NOT an idle-timer bug: 7s idle on inventory = 0 rebuilds; the trigger is activity. **Fix:** persist selected pane in `window._tdPane` (same `window._*` UI-state convention as `_invFilter`/`_invMultiSelect` — no new global pattern) and restore it via `applyPane(activePane)` on build.

**#4 root cause:** the Companion sub-tab pane held ONLY the companion equip slot (a lone icon) — no companion level/XP/stats. Beside the doll, `invc-stats-col` always shows the PLAYER's Hero/Weapon-Styles/Bonuses sheet, so opening "Companion" left the player looking at their own stats. All companion progression data already exists and is exposed on window by the companions ESM module (`companionLevelFromXp`, `companionXpToReach`, `getCompanionBonus`, `COMPANIONS[id]`), rendered correctly in the Stable + profile card but never wired into the doll tab. **Fix (contained, per task):** render the equipped companion's own name/level/XP-bar/effective-bonuses/proc into the pane, reusing those existing functions. Styled with tokens, scoped `body[data-theme="hearthlight"]`. No invented fields → nothing routed to Game Designer.

**Verify:** smoke 177/177 (added 2 b218 regression tests), 0 runtime errors; `bump-version.sh --check` OK. Browser (own server :8132, cache-busted, confirmed live code): Companion + Stats sub-tabs survive real `addItem`/`updateTopbar` re-renders and a 6s wait; Companion pane shows "Fox Lv 1 · UTILITY · 0/50 XP · +1 STR +2% XP +1 gold"; console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · bootstrap
Domain seeded. No active task. Base green at `119a698`.
