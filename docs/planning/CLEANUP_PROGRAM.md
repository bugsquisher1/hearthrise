# Cleanup Program (maintained plan)

Started 2026-09-06 from three same-day audits (client systems, UI/CSS + tests, server). Updated as slices land.

## Thesis

Hearthrise is not architecturally broken — zero circular imports, one combat engine, a server that owns the economy — it is *unreadable and unprovable in the places that changed fastest*. The cost sits in four measurable pools: dual code paths kept alive "just in case" after a cutover that explicitly forbids back-compat (§1), presentation smeared across nine stylesheets with 2,317 hardcoded colour literals against a §7 rule that says zero, a 54k-line test file whose 3,054 direct `G.*` seeds test the client's own beliefs rather than the server's answers, and a server surface where two functions carry 41 patch chains between them. None of that is fixed by a rewrite; all of it is fixed by deleting what is provably dead and putting a *ratchet* on every number so it can only move one way. Guards come first, because a cleanup without a guard is a cleanup that gets undone by build+3. Every slice below is lane-B sized (≤1 day), ordered by risk-reduction per hour and by dependency.

## The slices

### Slice 1 — Guard floor (no behaviour change)
- **Goal:** every scoreboard number becomes a ratchet *before* anyone tries to improve it.
- **Files:** `tests/css-literal-ratchet.mjs` (new, + baseline JSON), `tests/breakpoint-guard.mjs` (new), `.github/workflows/smoke.yml` (registration point per §5).
- **Guard:** the slice is the guard. Literal ratchet fails if hardcoded colour count or `!important` count rises; breakpoint guard fails on any spelling outside the approved set (the documented mobile query in §7, plus 1024px until slice 5 collapses it).
- **Gate:** lane B. Security GO no. Play-gate no (no shipped file changes).
- **Size:** ~250 lines of tooling.
- **Must NOT touch:** any file under `src/**`. A guard slice that edits product code cannot be trusted as a baseline.

### Slice 2 — Guards that have never been red
- **Goal:** `--selftest`/mutation proof on the 14 CI-gating guards that lack one; wire `tests/visual-qa.mjs` in as a real CI step; adopt or delete the 6 orphan guards.
- **Files:** 14 files under `tests/`, `.github/workflows/smoke.yml`.
- **Guard:** a meta-guard that enumerates workflow steps and fails when a CI-gating guard has no self-test path (§4: a guard that has never been red is not a guard).
- **Gate:** lane B. GO no. Play-gate no.
- **Size:** ~1 day; the mutation proofs are the work, not the plumbing.
- **Must NOT touch:** guard *thresholds*. Loosening anything to get green is forbidden (§2).

### Slice 3 — Deletions proven dead
- **Goal:** remove code with zero reachable callers — `skill-authority.js` (whole module), the 64 zero-occurrence exports, 101 dead CSS class rules, `hr_import_apply` (46 KB), 6 dead clan RPCs, 4 orphan trigger bodies.
- **Files:** `src/**` (deletions only), the stylesheets, one migration for the server half.
- **Guard:** an export/rule census that is *derived* on each run, not hand-pinned, and fails when a zero-occurrence export reappears.
- **Gate:** client half lane B; server half lane C with **Security GO yes** (dropping functions moves the RPC surface and `hr_client_rpc_baseline`). Play-gate yes, one pass.
- **Size:** ~1 day, split client/server.
- **Must NOT touch:** anything reached dynamically (string-keyed dispatch, `window.Hearthrise*` reach-ins). Zero grep hits is not proof for those; they wait for slice 8.

### Slice 4 — Dual-path removal (the cutover debt)
- **Goal:** the client stops carrying a pre-cutover twin: the farm client fall-through (~110 lines under `farmSyncArmed()`), the `isBlobRetired()` dead else-branches (15 sites), the blob-era `processOffline` body (580 lines, mostly dead), the 24 `deferred` gold sites, and the 8 hand-rolled `rpc()` copies collapsed onto `HearthriseRpc`.
- **Files:** `src/legacy.js`, `src/net/*.js`, callers of `src/core/away.js`.
- **Guard:** extend `tests/arm-flag-honesty.mjs` (landed today) to fail on any new arm flag or `isXRetired()` branch; plus an ATTENDED and an AWAY regression test per §4.
- **Gate:** lane B, **play-gate yes and mandatory** — reload → claim → fight → gather → buy → hire → water → reload.
- **Size:** ~1 day. Farm, blob, gold as three commits on one branch so a red bisects in minutes.
- **Must NOT touch:** boot order, `restoreG`, the residue allowlist. Removing a fallback is not the same as reordering the thing that used it.

### Slice 5 — CSS consolidation, densest screen first
- **Goal:** 9 sheets → 5 with `tokens.css` extracted first; then combat (spread over 7 sheets today) and inventory converted literal→token, one component per pass.
- **Files:** `tokens.css` (new), `legacy.css`, `audit-overrides.css`, `theme-cozy.css`, +6.
- **Guard:** the slice-1 ratchet (counts must fall), plus the full visual gate on the *assembled* main at desktop AND 922×423 with screenshots READ (§3.3).
- **Gate:** lane B, visual gate non-negotiable, play-gate yes.
- **Size:** 1 day per pass; expect 3 passes (tokens, combat, inventory), each shipped separately.
- **Must NOT touch:** the documented mobile media query or the landscape-phone rail layout (b310).

### Slice 6 — Split `smoke-test.js` (pure move)
- **Goal:** 54k lines → ~20 section modules. Zero test-body edits in this slice.
- **Files:** `src/features/smoke-test.js` → `src/features/smoke/*.js` plus an index preserving registration order.
- **Guard:** equality of the ordered test-name list (hashed) before and after; the in-page suite must report the identical 1,150.
- **Gate:** lane B. GO no. Play-gate no; the suite *is* the gate.
- **Size:** 1 day, mechanical.
- **Must NOT touch:** the 3,054 `G.*` seeds. Converting seeds to gestures is a later program (9:1 today, worth doing) and mixing it in destroys the equality proof.

### Slice 7 — Server consolidation restatements
- **Goal:** collapse the patch chains — `hr_rpc_gate` (24) first, then `hr_apply` (17), then `hr_state_of` (39) — into single authored bodies, proved equivalent by `--codediff`.
- **Files:** one `supabase/migrations/*.sql` per function, one apply per call; `tests/live-hash-drift.baseline.json` re-measured by the **Coordinator only** (§2).
- **Guard:** `schema-drift` byte-identical second apply, `apply-order-honesty`, a §4 self-check block asserting properties by executing SQL, and `--codediff` whys.
- **Gate:** lane C. **Security GO yes** (`hr_apply` moves money). Play-gate yes after apply.
- **Size:** one function per day. Never two in one apply.
- **Must NOT touch:** behaviour. A restatement that fixes a bug in passing is not a restatement — split it.

### Slice 8 — CI matrix, then monolith extraction (incremental, last)
- **Goal:** 33 sequential steps (~40–60 min) → a matrix by guard family with a cached PGlite chain; then begin `legacy.js` extraction in the audited order — icons → inventory → combat → progress → refreshAll — one unit per branch, replacing `window.Hearthrise*` reach-ins with imports as each unit moves, and folding the 34 raw `window.showTab=` wraps and 164 direct `localStorage.` sites onto their seams.
- **Files:** `.github/workflows/smoke.yml`; then `src/render/*` (§7: render helpers before screen controllers).
- **Guard:** a CI wall-clock budget check; for extraction, a module-graph guard asserting still-zero circular imports plus a reach-in ratchet.
- **Gate:** lane B per unit, play-gate yes per unit.
- **Size:** open-ended; never more than one extraction unit per build.
- **Must NOT touch:** more than one unit at a time — and nothing here starts until slices 3–4 have been live a week.

> **Correction (2026-09-07):** `src/data/skill-authority.js` is NOT dead — `serverAccruedSkill` is a live import in `src/net/accrue.js` (the anti-forgery carve-out that lets an absolute envelope lower a skill) and `window.HearthriseSkillAuthority` is read by `legacy.js` and `home-dashboard.js`. Only four helper exports (`buildSkillAuthority`, `skillAuthority`, `rebuildSkillAuthority`, `classifySkill`) are unused; unexporting them is cosmetic and touches a security-relevant module — leave it. Slice 3a landed 31 dead exports + 23 dead CSS rules instead.

## Do not touch

1. **The module graph pattern.** Zero circular imports is the property that makes extraction possible at all. A change that would introduce one is rejected, not worked around.
2. **Derivation-guarded censuses** — `live-hash-drift.baseline.json`, `restore-census`, `hr_client_rpc_baseline`, the arm-flag census. Regenerated by their own tools, by the Coordinator; never hand-edited to go green.
3. **Boot, `processOffline`, `restoreG`, the residue allowlist** — frozen until slices 3–4 have been live a full week. This is where a silent regression costs a player their progress.
4. **The Realtime WAL poller trim** (staged today, saves ~0 on two empty tables). It is a scale fix, not cleanup; it ships when those tables carry traffic.

## Scoreboard

| Metric | Today (2026-09-06) | Target | Slice |
|---|---|---|---|
| Hardcoded colour literals (CSS) | 2,009 measured (comments stripped) | < 400 | 1, 5c |
| `!important` | 1,093 measured | < 500 | 1, 5c |
| Stylesheets / CSS lines | 10 / 17,436 (was 9 / 17,398; tokens.css extracted) | 5 / < 12,000 | 5 |
| Dead CSS class rules | 101 | 0 | 3 |
| Breakpoint spellings | 27 canonical / 27 raw (was 28 / 35) | 2 | 1, 5b |
| Inline `style=` in JS / hex in JS | ~300 / ~250 | < 50 / 0 | 5 |
| CI-gating guards without `--selftest` | 14 | 0 | 2 |
| Orphan guards (incl. `visual-qa.mjs`) | 6 | 0 | 2 |
| `smoke-test.js` lines / files | 54,000 / 1 | < 4,000 / ~20 | 6 |
| Test `G.*` seeds : gestures | 3,054 : 346 (9:1) | 3:1 | later |
| Zero-occurrence exports | 64 | 0 | 3 |
| `isBlobRetired()` dead branches | 15 | 0 | 4 |
| Farm client fall-through lines | ~110 | 0 | 4 |
| `deferred` gold sites | 24 | 0 | 4 |
| Hand-rolled `rpc()` copies | 8 | 0 (all `HearthriseRpc`) | 4 |
| Private `toast()` / `itemImg` copies | 6 / 3 | 1 / 1 | 4 |
| Raw `window.showTab=` wraps | 34 | 0 (registry) | 8 |
| Direct `localStorage.` sites | 164 | < 10 (storage seam) | 8 |
| `window.Hearthrise*` reach-ins | 1,101 | < 400 | 8 |
| `legacy.js` lines / functions | 22,365 / 510 | < 12,000 | 8 |
| Patch chains: state_of / rpc_gate / apply | 39 / 24 / 17 | 1 / 1 / 1 | 7 |
| Public functions / total size | 278 / 791 KB | < 240 / < 650 KB | 3, 7 |
| Advisors: ERROR / mutable search_path | 1 / 30 | 0 / 0 | 3, 7 |
| RLS initplan / multi-permissive warnings | 27 / 35 | 0 / < 10 | later |
| CI wall clock | 40–60 min | < 15 min | 8 |
| Migrations recorded in `supabase_migrations` | 27 of 149 | 149 of 149 | 7 |

> **Slice 5 steps 1-2 result (2026-09-07):** the token ladder has one home and breakpoints have
> one spelling, both at **zero visual delta, measured** (`5af5bb36`, `7e9303b2`).
> **Step 1:** 367 root-ish custom-property declarations across four sheets -> `src/styles/tokens.css`
> (loaded first), in the original load order with the original selectors. **41 were dead on arrival**
> — same property, same selector, redeclared later with a different value; `--bg-0` was written three
> times and two were never read. 326 winners survive, byte-identical. Guard:
> `tests/token-single-source.mjs --selftest` (no token declared on a root selector outside
> tokens.css; four element-scoped variables on an allowlist with reasons; bare-`var()`-with-no-
> declaration ratcheted at 1). **Step 2:** 35 raw @media spellings -> 27, canonical 28 -> 27 (one
> commutative `and`-reorder); no numeric value touched.
> **Proof, not assertion:** the ordered cascade-winner list is identical before and after, every
> per-file ratchet count is unchanged (2009 / 1093, tokens.css enters at 0/0), the visual gate is
> 36 vs 36 twice, and `tools/css-ab-pixel-diff.mjs` (new) reports **0 differing pixels** on
> combat/inventory/home/farm at 1440x900 AND 922x423 against the pre-slice base — with an A/A
> control floor of 0 and a `--mutate` proof of 44,607 px. That tool exists because naive
> before/after screenshots of an UNCHANGED tree differ by up to 38,799 px; see DISCOVERIES.
> **Still open in slice 5:** (5b) converge the eight 900px mobile-rail rules onto 540/1024 — a real
> layout change, visual gate at 922x423 per rule, NOT a spelling pass; (5c) literal -> token, combat
> and inventory, one component per pass. **Next absorption, recommended in this order:**
> `combat-hud.css` -> `combat-screens.css` (330 lines, 0 literals, one screen, and index.html
> already calls combat-screens "the last statement about #panel-combat"), then
> `audit-overrides.css` -> `components.css` (531 literals / 159 `!important`) — the second is a
> specificity move between three sheets that fight, so it is per-component with the pixel tool, not
> per-commit.
>
> **Slice 4 result (2026-09-07):** farm dual path removed (`7cbfdb4b`, fail-closed, guard `tests/no-client-farm-mint.mjs`). RPC consolidation refused with proof (`HearthriseRpc` is the decision seam, not the transport; `hr_clan_browser` is legitimately anonymous) — a ratchet landed instead (`9544d21f`). Blob/offline deletion refused: `isBlobRetired()` is NOT constant — it reads the live b353 kill switch `hr:serverAccrual`, so all 13 forks are reachable; that switch is itself a client-authored fallback §1 forbids. **Decision owed (Coordinator + Security): retire the b353 kill switch, then slice 8 deletes the blob machinery.** Gold: 24 deferred rows are a migration backlog with named server blockers, not twins. Surfaced bug: farm goal counters `planted/harvested` have had no writer since b454 (lane-A fix dispatched).
