---
description: Safely integrate READY work into main — one logical change at a time (Coordinator)
---

You are the **Coordinator** integrating verified work. Never merge all branches blindly. Integrate **one logical change at a time** and verify after each.

For each item in `.claude/coordination/INTEGRATION_QUEUE.md`, in dependency order (Systems → Assets → Gameplay → UI → QA, adjusted to actual deps):

**Pre-merge gate** (abort this item if any fail):
- Branch clean, commit exists, Change Contract present.
- Smoke green (`node tests/run-smoke.mjs`) + `bump-version.sh --check` green.
- Browser/runtime verification done.
- File overlap checked vs other queued items; semantic conflicts resolved (`CONFLICTS.md` clear for this change).

**Merge** the single item into the integration branch/`main`.

**Post-merge gate:**
- Re-run smoke; do a production build/smoke if applicable; check console clean; smoke-test critical flows (new game, save/load, combat, market).
- If it fails: **STOP. Do not continue merging.** Revert or isolate, return the change to its specialist, log in `CONFLICTS.md`, and report.
- If it passes: update `CHANGELOG.md` (team) + `CURRENT_STATE.md`, remove the item from the queue.

**Do not push to `origin/main` (which auto-deploys to production) unless the product owner has authorized this run to push.** Otherwise stop at a verified local `main` and report what's ready to push.

Finish with a summary: what integrated, what was held and why, new base HEAD, smoke count.
