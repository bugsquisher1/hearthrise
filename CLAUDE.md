# Hearthrise — rules for Claude

This file is auto-loaded into every Claude session in this workspace. The rules below are non-negotiable — follow them without asking.

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

- Cache buster lives in two places that must agree: `src/build-info.js` (`BUILD.cache`) and every `?v=NNN` in `index.html`. Bump both on every release.
- Service worker derives its cache name from the `?v=` it sees on script tags (`hearthrise-<NNN>`). The b124 universal kill-switch in `<head>` purges any cache whose name doesn't match the current build — don't reintroduce a fixed cache name.
- After bumping, give Tyler the literal git push command. He runs git himself.

---

## What lives where

- `src/legacy.js` — the ~9k-line monolith. Phase 3.5 (split into ESM modules) is still pending — task #129 in the task list.
- `src/styles/legacy.css` + `audit-overrides.css` + `theme-cozy.css` — three sheets that fight each other on specificity. When adding mobile rules, expect to need theme-prefixed selectors (`html:not([data-theme]) ...`) to outrank existing desktop rules.
- `src/features/smoke-test.js` — the test suite. Add tests here.
- `src/net/auth.js`, `src/net/sync.js`, `src/net/supabase-bootstrap.js` — Supabase wiring. Default cloud config is hard-coded in supabase-bootstrap.js (anon key only — never paste service role).
- `src/bug-report.js` — Discord webhook + screenshot capture. Has both direct-Discord and Cloudflare Worker bridge paths.
- `.legacy/snapshots/` — old monolith HTMLs, kept out of deploy root since b125. Don't restore them to root — they ship old service workers.
- `assets/icons-bundle/` — the only icon folder shipped on the deploy. `icons3/`, `assets/raw-bundle/`, etc. are NOT shipped (gitignored or never committed). The smoke test asserts `_itemPath` and `_monsterIcon` never reference unshipped folders.

---

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
