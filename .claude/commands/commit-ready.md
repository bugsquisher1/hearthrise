---
description: Run the full verification required before an agent declares its branch READY
---

Perform the **commit-ready** gate for the change in progress. A change is NOT ready because it compiles or because tests pass — it must be verified and documented. Do all of this, honestly:

1. **Scope check:** `git status` / `git diff --stat`. Confirm only intended files changed; no stray edits, no debug leftovers.
2. **Tests:** `node tests/run-smoke.mjs` (expect 175/175, 0 runtime errors — or a new higher count with the added tests) and `bash bump-version.sh --check`. Paste the real counts.
3. **Runtime/browser verification** appropriate to the domain: start the preview, exercise the actual change, check console + network are clean, screenshot visual changes. State what you did and what you observed.
4. **Self-critique:** what did I miss? what could break? edge cases? save/load impact? 10×-content impact?
5. **Produce the Change Contract** (see `PROFESSIONAL_STANDARD.md`): agent, branch, purpose, files changed, files intentionally untouched, dependencies, potential conflicts (code + semantic), test results, browser verification, known limitations.
6. **Update coordination files:** your `agents/<you>.md` log, `DISCOVERIES.md`/`HANDOFFS.md` as needed, and set your row in `ACTIVE_WORK.md` to `ready-for-integration`.
7. **Commit** on your branch with a clear message (end with the Co-Authored-By line). Then add the item to `INTEGRATION_QUEUE.md` in dependency order.

If any gate fails, do NOT declare ready — fix it or route it, and say so plainly.
