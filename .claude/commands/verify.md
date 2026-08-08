---
description: Run the integrated test & validation suite and report honestly
---

Run the appropriate **verification suite** for the current state and report results plainly (real numbers, not "should pass").

1. **Automated:** `node tests/run-smoke.mjs` (report N/N + runtime errors) and `bash bump-version.sh --check`.
2. **Build/serve:** ensure the preview (`hearthrise-qa`, port 8123) starts clean; force-reload; confirm the build under test.
3. **Smoke the critical flows** in the browser: fresh game start / FTUE, save→reload→state intact, a gathering action, a combat encounter, inventory + equipment render, market open. Note anything off.
4. **Console + network scan:** 0 uncaught errors, 0 asset 404s.
5. **Regression tripwires** (see `DISCOVERIES.md`): data-merge identity guard, theme-scope guards, no PvE token mint, XSS sanitization — confirm still enforced.

Report: what passed, what failed (with repro), what you could not verify, and whether the current state is safe to integrate/ship. If invoked after an integration, update `CURRENT_STATE.md` with the fresh smoke count.
