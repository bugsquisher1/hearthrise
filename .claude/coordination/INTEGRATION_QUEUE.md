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

**Render-layer strangler-fig — FIRST extraction (Systems Engineer, 2026-08-18) — READY. Worktree `agent-a09a919272ad21d55`, NOT bumped, NOT committed.**

Pure refactor: the Lifetime Stats modal moved out of `src/legacy.js` into a new render module. Behavior + appearance IDENTICAL (verified). Establishes the pattern for the weeks-long render-extraction track.

| Order | Agent | Change | Files | Gate status |
|---|---|---|---|---|
| — | Systems Engineer | **Extract Lifetime Stats modal → `src/render/lifetime-stats.js`** (first render extraction; `_fmtTime` + `openLifetimeStats` + trigger installer + ESC, ~155 lines out of legacy.js) | `src/render/lifetime-stats.js` (new), `src/legacy.js` (−155), `index.html` (+1 `<script>` after death-sheet.js), `src/features/smoke-test.js` (+1 test), `docs/design/render-extraction-pattern.md` (new playbook) | Smoke **916/916 ×2, 0 runtime errors**. Browser-verified: modal opens, tokens resolve under Hearthlight (card `rgb(36,29,22)`, gold title), ESC closes, trigger self-installs, console clean. CSS already tokenised — no colour conversion needed. **RELEASE VISUAL GATE owed by Coordinator/Art Director** (profile modal + combat + inventory, desktop 1440×900 + landscape 922×423, both themes). |

**Integration note:** touches `index.html` (one added script tag) and `smoke-test.js` (one added array entry, independent of any other queued insertion). `bump-version.sh` will version the new `?v=` on the script tag at ship. No economy/save-path changes; b305 battery untouched and green.

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

## Clan domain pass 2 (security conditions, 2026-08-18)
- BEFORE NEXT BUILD: fix clan_deposit slot derivation (order by updated_at desc nulls last, or refuse ambiguous_slot) — the current derivation is slot-0-hardcoded, S6/b339 class.
- Next server pass (domain stays blocked until done): clan_contribute ownership debit (P1 mint, 10M/member/day into treasury), clan_feast_deposit food debit (P1), player_ledger row for deposit debit (with slot), D7 budget-clamp ownership test, `revoke insert, update, delete on public.clans from anon, authenticated` (loaded-trap grants).
- Do NOT wire any treasury-withdraw UI: clan_withdraw is currently a sink with no source (devtools call destroys treasury, credits nothing).
