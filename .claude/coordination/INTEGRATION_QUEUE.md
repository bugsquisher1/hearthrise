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

**b361 Hearthrise rebrand + avatars (brand session, 2026-08-16) — READY, push to be COORDINATED with the other active session (Tyler's instruction). Do NOT push unilaterally.**

| Order | Agent | Change | Branch/Commit | Depends on | Gate status |
|---|---|---|---|---|---|
| A | Art Director (Coordinator) | **Brand: shield+wordmark lockup (sidebar/login/favicon), splash login bg, "Idle Homestead"→"Hearthrise", deduped gate copy** | `worktree-agent-a8761ff99aed27a3f` / `1b579a7` (+1 uncommitted Coordinator copy edit, being committed) | — | 767/767 at agent commit; re-running smoke after copy edit. Overlaps: `index.html`, `smoke-test.js` (append), `legacy.js` (1 line). |
| B | Systems Engineer | **Prefab avatar picker: 10 selectable portraits + upload, player.png default retired, watermark stripped** | `worktree-agent-a1092c5052fa1bf61` / `ca700f5` | Assets (its own) | 778/778 ×3. Overlaps: `smoke-test.js` (insertion just before final `];` — trivial merge vs A's append), `index.html` (1-line topbar `src`), `home-dashboard.js` (1 line). |

**Integration note:** A (brand/UI) and B (avatar/UI) are independent features; either order works. Both touch `index.html` + `smoke-test.js` in small, non-semantic ways — resolve the two `smoke-test.js` insertions as independent array entries. Coordinator to fold both, run full smoke, bump ONCE to b361, then sequence the push with the other session before it goes live.

<!-- prior placeholder header retained below for format reference -->
| Order | Agent | Change | Branch/Commit | Depends on | Gate status |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
