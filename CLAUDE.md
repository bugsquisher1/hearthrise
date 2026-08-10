# Hearthrise — rules for Claude

This file is auto-loaded into every Claude session in this workspace. The rules below are non-negotiable — follow them without asking.

---

## Session operating mode (locked 2026-08-09)

**Every session on this project runs as the full autonomous dev team, with THIS session acting as the Coordinator.** Tyler should never have to open separate sessions to get parallel work done — the Coordinator dispatches the specialists here.

- The team is the 5-specialist system under `.claude/` (art-director, asset-director, game-designer, qa-engineer, systems-engineer), dispatched as subagents via the Agent tool / Workflow, coordinated through `.claude/coordination/`. Read `.claude/coordination/PROFESSIONAL_STANDARD.md` first.
- **Default to dispatching the team** for substantive work (features, audits, content, multi-file changes) and to running multiple asks as **parallel workstreams in THIS session** rather than spawning separate sessions or background task-chips. Use `isolation:"worktree"` when agents write in parallel; integrate one logical change at a time, verifying (`node tests/run-smoke.mjs`) after each.
- Apply judgment only for trivial conversational turns (a quick question, a one-line fix) — those don't need a full fan-out.
- The Coordinator still owns integration, testing discipline, and the ship flow below.

---

## Testing discipline

**Every bug fix and every new feature ships with a test in the same commit.** Full reasoning + mechanics are in [`TESTING.md`](./TESTING.md). The short version:

- **Bug fix** → add a regression test under "regression suite" in `src/features/smoke-test.js` that fails without the fix.
- **New feature** → add at least one happy-path E2E test under "player actions" or "interactive coverage" that exercises the feature the way a player would.
- Budget ~10–20% of feature build time for tests. Skipping it always costs more later.
- Don't disable a failing test to "unblock" a push — fix the test or fix the underlying behaviour. The test is the contract.

Run the suite with `Ctrl+Shift+T` or the floating 🧪 button.

---

## Build + ship workflow

- Cache buster lives in **three** places that must agree: `src/build-info.js` (`BUILD.cache`), every `?v=NNN` in `index.html`, and every `?v=NNN` on ESM import specifiers in `src/**/*.js` (added in b148 — static imports like `import './net/sync.js?v=NNN'` are fetched WITHOUT inheriting index.html's version, so a stale one runs old code for ~10 min after deploy). **Just run `./bump-version.sh <NNN>`** — it bumps all three in lockstep and verifies. Then bump the date in build-info.js + add a CHANGELOG entry by hand.
- Don't add a bare relative ESM import (`from './x.js'` with no `?v=`) — the bump script + smoke test expect every module import to carry a version. `bump-version.sh` fails loudly if it finds an unversioned one.
- Service worker derives its cache name from the `?v=` it sees on script tags (`hearthrise-<NNN>`). The b124 universal kill-switch in `<head>` purges any cache whose name doesn't match the current build — don't reintroduce a fixed cache name.
- After bumping, give Tyler the literal git push command. He runs git himself.

---

## Architecture direction (locked 2026-08-07)

Goal: scale in content **and ship to Steam + mobile from one web core.** Approach: **incremental refactor-in-place — never a rewrite.** Keep the live beta green. Proof-of-model: Melvor Idle (a web idle-RPG) shipped to Steam (desktop wrapper) and iOS/Android (mobile wrapper) from one web codebase. Steam = Electron/Tauri wrapper; mobile = Capacitor wrapper. The web stack is not the blocker — the monolith + CSS debt are.

Migrate toward four layers, strangler-fig, one domain at a time (combat, skills, farm, world/map, dungeon — this is roadmap task #129):
1. **Data** — content as data (`src/data/*.js`). Grow by adding data, not code.
2. **Logic** — idle ticks, combat, economy as pure, DOM-free, testable functions. Reusable across platforms.
3. **Render/UI** — a component layer that reads design **tokens only**.
4. **Platform seams** — storage / cloud save / notifications / purchases / achievements behind interfaces, so Steam & mobile swap implementations without touching game logic.

**HARD RULE — no hardcoded colors.** Every color comes from a CSS token (defined per theme in `theme-cozy.css`). The old cozy theme baked ~58 cream gradients straight into components; that debt is exactly why the Hearthlight theme (b150) only partially applied. Converting hardcoded → token IS the visual revamp, done screen-by-screen — cozy-light must look unchanged, Hearthlight must go dark. When you touch any component, convert its colors to tokens as you go.

---

## Adding content? Read the systems map first

Before building any item / recipe / drop / gathering node / progression change, read
[`docs/SYSTEMS_MAP.md`](./docs/SYSTEMS_MAP.md). Most content is a **data row** in
`src/data/*.js` that an existing engine consumes — not new code. The map shows each
system, its data shape, where to add, and which guard verifies it. Golden rule: grow
by adding data, not code.

## What lives where

- `src/legacy.js` — the ~9k-line monolith. Phase 3.5 (split into ESM modules) is still pending — task #129 in the task list.
- `src/styles/legacy.css` + `audit-overrides.css` + `theme-cozy.css` — three sheets that fight each other on specificity. When adding mobile rules, expect to need theme-prefixed selectors (`html:not([data-theme]) ...`) to outrank existing desktop rules.
- `src/features/smoke-test.js` — the test suite. Add tests here.
- `src/net/auth.js`, `src/net/sync.js`, `src/net/supabase-bootstrap.js` — Supabase wiring. Default cloud config is hard-coded in supabase-bootstrap.js (anon key only — never paste service role).
- `src/bug-report.js` — Discord webhook + screenshot capture. Has both direct-Discord and Cloudflare Worker bridge paths.
- `.legacy/snapshots/` — old monolith HTMLs, kept out of deploy root since b125. Don't restore them to root — they ship old service workers.
- `assets/icons-bundle/` — the only icon folder shipped on the deploy. `icons3/`, `assets/raw-bundle/`, etc. are NOT shipped (gitignored or never committed). The smoke test asserts `_itemPath` and `_monsterIcon` never reference unshipped folders.

---

## Save system — invariants (DO NOT BREAK)

The cloud save is the backbone. These rules are enforced by the **b305 stress battery** in `smoke-test.js` — any change to `src/net/{sync,auth,events}.js` or the save/offline path in `legacy.js` (`saveLocal`, `loadLocal`, `processOffline`, `processOfflineCombat`, `claimOfflineMs`) MUST keep that battery green and ship its own test.

1. **Cloud is authoritative; local is a cache + offline journal.** Local must NEVER overwrite a newer cloud. `decideRestore` resolves by **freshness (newest wins by timestamp)**, not level. A strictly-newer LOCAL is never rolled back (anti-rollback invariant). Ties keep local (no needless reload).
2. **Restore/evict only on CERTAINTY.** Never restore on a garbage/NaN/negative/timeless cloud timestamp. Never evict a device on a network error, missing table, or offline — only on a *definitive* different-owner-with-fresh-heartbeat row. A flaky connection must never lock a player out or discard their save.
3. **The snapshot is a DENYLIST, not an allowlist.** `snapshot()` uploads every G field EXCEPT `NO_SYNC` (in-flight combat/activity, `combatLog`, `lastOfflineSummary`, derived `totalLevel`/`combatLevel`) and `_`-prefixed scratch. **Adding a persistent-progress field to `NO_SYNC` = silent cloud data loss — forbidden.** New features persist by default; that is the safe direction.
4. **Single active session keys on the TAB (`sessionStorage` instance id), not the device** (`localStorage` is shared across a browser's tabs). Heartbeat + stale-takeover so closing a tab never false-locks the other.
5. **Offline is capped at the daily budget** (`offlineCapHours`) via the `offlineBudget.at` watermark — a forward clock jump or long absence can never mint unbounded progress; a future/garbage watermark grants nothing. The watermark only advances while `document.hidden` is false.
6. **RLS is per-user** (`auth.uid() = user_id`) on every table holding player data — no cross-player read/write. Public-readable tables (profiles/clans/market/display_names) are read-only to others by design. NOTE: the client snapshot is self-authoritative, so leaderboard values are self-forgeable — true prevention needs server-side simulation (out of scope; documented limitation, not a quick fix).

Before touching saves, read [`memory: cloud-save-program`] and confirm the b305 battery still passes.

## Asset rules

- New icons go in `assets/icons-bundle/` (subfolders: `buildings/`, `monsters/`, `resources/`, `medieval/`).
- Wire them in via the `LOCAL_*_ICON` maps inside `applyLocalIcons()` at the bottom of `src/legacy.js`. That IIFE is the single source of truth for icon paths.
- Don't add `BUNDLE_*_ICON` entries pointing at `assets/raw-bundle/...` — that folder is unshipped.

---

## Mobile rules

- Mobile media query is `@media (max-width: 540px), (max-height: 540px) and (max-width: 900px)` — covers portrait phones AND landscape phones.
- Bottom-nav: 6 tabs (Home/Character/Combat/Skills/Farm/More). Sidebar hidden on mobile.
- The desktop-only `.prof-toolbar` must stay `display:none` on mobile. The mobile-equivalent is `.feat-buttons`.

---

## File creation

- Don't create new docs (.md, .docx, .pdf, etc.) unless Tyler explicitly asks.
- When Tyler asks for "the command," give him the single bash block to run, no more no less.

---

## Behavior

- Trust but verify: when a fix lands, run the smoke test against the live deploy and report green/red.
- When something breaks for the second time, that's a sign there's no test guarding it. Add the test before fixing again.
- If the bash mount looks stale (file size disagrees with what `Read` sees), trust `Read`/`Edit`/`Write` — that's the live filesystem. Bash mount is sometimes cached.
