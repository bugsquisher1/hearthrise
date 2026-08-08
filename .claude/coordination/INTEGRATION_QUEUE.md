# INTEGRATION_QUEUE

_Changes that are READY and waiting to integrate into `main`. Integrate **one logical change at a time**, verify after each, and stop on the first failure._

## Standard integration order (adjust to actual dependencies)
1. **Systems / infrastructure** (schema, engine, data-shape) — everything else builds on it.
2. **Assets** (files must exist before UI/design reference them).
3. **Gameplay / content** (data values, balance, loops).
4. **UI / visual** (presentation of the above).
5. **QA / regression** (tests that lock in the new behavior).

## Pre-merge gate (per item)
- [ ] Branch clean, commit exists
- [ ] Change Contract present and complete
- [ ] Smoke `175/175` (or new higher count) green
- [ ] `bump-version.sh --check` green
- [ ] Browser/runtime verification done
- [ ] File overlap checked against other queued items
- [ ] Semantic conflicts resolved (`CONFLICTS.md` clear for this change)

## Post-merge gate (per item)
- [ ] Smoke re-run green · production build ok · console clean · critical flows smoke-tested
- [ ] `CHANGELOG.md` + `CURRENT_STATE.md` updated

**If integration fails: STOP. Do not continue merging.** Identify the responsible change, return it to its specialist, log in `CONFLICTS.md`.

## Queue
_Empty as of 2026-08-08 bootstrap._

| Order | Agent | Change | Branch/Commit | Depends on | Gate status |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
