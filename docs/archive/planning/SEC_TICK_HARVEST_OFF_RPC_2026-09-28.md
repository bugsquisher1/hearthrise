# Security review — tick harvest off the RPC surface (2026-09-28)

Reviewer: security-engineer (veto). Lane `lane/tick-harvest-private-schema` @ e0e89da3, reviewed on `sec/tick-harvest-private-schema`. Read-only. No DB access from this sandbox, so every production fact below is quoted from the brief or from the applied file's note, not measured here.

## Verdicts

| Half | Verdict |
|---|---|
| **Migration** `2026-09-28-tick-harvest-off-rpc-surface.sql` | **GO** (file unchanged by this review) |
| **Guard refinement** (`pg-net-queue-unreachable` Q-1 chain end, `world-tick-stall-guard` P-IDEM) | **GO-WITH-CHANGES. The changes are landed on this branch.** Merge `sec/tick-harvest-private-schema`, not the lane branch. |

**Apply order:** after `2026-09-28-world-tick-stall-observability.sql` (APPLIED 05:34 UTC), which is already the manifest position. The file is independent of lane C F2/F3: it touches only `hr_tick_cron_note`, the harvest/summary pair and the new schema `hr_ops`. It may apply before or after them and does not need to wait. Condition on F2/F3: if either one restates `public.hr_tick_cron_note` or creates a routine in `public`, it must sort after this file, and Q-1 and Q-5 must stay green on the merged set. The F2/F3 files are not on `set/b560` or any branch visible here, so this condition is unverified.

## Answers (file:line = the branch after this review)

| # | Finding | Evidence |
|---|---|---|
| 1 | `hr_ops` is off every client surface **at apply time**. It is not in the exposed list: `config.toml` has no `[api] schemas`, so the default `public, graphql_public` applies, and the list is PGRST106-measured. h6 asserts `pgrst.db_schemas`. USAGE is revoked from PUBLIC and all six roles. Default privileges are covered: a global `alter default privileges for role postgres revoke execute on functions from public, anon, authenticated` exists. Every Supabase grant default is scoped to `in schema public`. Both functions also carry explicit revokes. **Gap (fixed here):** after the apply, nothing watched `hr_ops`. h5 and h6 run once. `schema-drift`'s inventory is `public`-only, so the `hr_ops` pair does not appear in its baseline. The lane note says "+hr_ops pair", but the baseline diff is only −2. Q-3 checks only `net`. So a later `grant usage on schema hr_ops`, a `pgrst.db_schemas` edit, a public wrapper `select hr_ops.hr_tick_edge_harvest()`, or `alter function hr_ops.… set schema public` would all have passed CI green. | `2026-09-28-tick-harvest-off-rpc-surface.sql:40-42,138-143,245-263`; `2026-08-11-anon-execute-lockdown.sql:104-105`; `tests/schema-replay.mjs:410-458`; new arm Q-5 in `tests/pg-net-queue-unreachable.mjs` |
| 2 | `hr_ops.hr_tick_edge_harvest()` is **SECURITY DEFINER**. Its owner is the applier (postgres, per the schema's `authorization postgres`). `search_path = public` is pinned, and every relation is schema-qualified (`public.hr_tick_cron_log`, `net._http_response`, `hr_ops.hr_tick_edge_summary`), so temp-schema shadowing does not apply. The summary is INVOKER and IMMUTABLE and reads no table. The only caller is `public.hr_tick_cron_note` (DEFINER, `returns void`). Its ACL is revoked from PUBLIC and all six roles in all three files that define it, and no migration grants it. It writes the harvest into `hr_tick_cron_log`, and every client and engine role has zero grants on that table under forced RLS. So a client can neither call the harvest indirectly nor read its output. The harvest also reads `_http_response`, never the header-bearing `http_request_queue`. The bodies are verified byte-identical to the applied ones except the three schema qualifiers. Q-5 now pins `hr_tick_cron_note` as the only allowed caller and turns any client grant on it red. | `…off-rpc-surface.sql:82-83,147-176`; `2026-09-21-world-tick-cron.sql:211-216,250-264`; diff of the applied vs moved bodies = 3 lines |
| 3 | **Atomic.** `apply-migration.mjs` POSTs `{query}` once to `database/query`. A multi-statement simple query is one implicit transaction. The file has no `begin`/`commit` and no statement that is illegal in a transaction (`create schema` is allowed). §3 (repoint) comes before §4 (drop), so even the file's own statement order never leaves a dangling call. A concurrent 10 s fire before COMMIT sees the committed catalogue, meaning the old note and the old public harvest, and runs normally, because function calls take no lock that DDL waits on. **One edge case:** a fire that has already parsed the old note and reaches the harvest call after COMMIT gets `42883`. The note's `exception when others` catches it and logs `{edge:{harvest_error:"42883"}}` on one `posted` row. Nothing is lost or wrong, and the next fire's harvest has 6 h of look-back. h4 writes its probe row inside the sentinel-rolled-back block, so the apply is net-zero. | `tools/apply-migration.mjs:39-45`; `…off-rpc-surface.sql:145-180,198-269` |
| 4 | **Ruling: the split is right. Q-1 judges the repo chain, and the deployment record (apply-order note → `apply-order-honesty` → `live-hash-drift --live`) says what production holds.** Q-1 does NOT require the clearing file to be APPLIED, for three reasons. (a) Q-1's premise is reachability, and the production bridge is already unreachable: ACL postgres-only, `net` not exposed per `--live`. (b) The other chain guards (`schema-drift`, `apply-order-honesty`) take the same position. (c) Keying a static guard on a free-text note prefix would make it depend on a hand-edited field. **But green must not claim more than it proves, so this is a required change, landed:** when the clearing file's note does not start with `APPLIED`/`LIVE`, the OK line and `--list` name the routine still held on production and the file awaiting apply. Today's output: *"2 of them by a STAGED file not yet applied — production holds public.hr_tick_edge_harvest until the Coordinator applies 2026-09-28-tick-harvest-off-rpc-surface.sql"*. After the apply, the Coordinator flips the note and the qualifier disappears. | `tests/pg-net-queue-unreachable.mjs` (header block "A clearance is a CHAIN property", `staged()` in `main`) |
| 5 | **The P-IDEM retarget is legitimate, not a loosening.** It now re-applies the chain-end definer of the note, summary and harvest, and `bodies()` hashes all four routines across `public`+`hr_ops`. The fourth (`hr_tick_stall_status`) is still sourced from the observability file, which remains its chain-end definer. Re-applying the superseded file would re-create the public bridge, and a guard that did that would be testing a state the chain never ends in. The second apply of the observability file is still covered by `schema-drift`'s byte-identical chain replay. Mutants are caught 4/4. | `tests/world-tick-stall-guard.mjs:17-24,50-85,193-207` |
| 6 | Touched files: the lane's five (the migration, `pg-net-queue-unreachable.mjs`, `schema-apply-order.json`, `schema-drift.baseline.json`, `world-tick-stall-guard.mjs`), plus this review's two (`pg-net-queue-unreachable.mjs` Q-5 and the staged label, and this doc). No edge, client or baseline-JSON change. Two additional notes. (i) The lane's `schema-apply-order.json` note is accurate apart from the drift claim in row 1. (ii) The drop's own Q-1 clearance is correct: `drop function if exists public.hr_tick_edge_harvest();` has an empty arg list and matches the zero-parameter create. | `git diff origin/set/b560...HEAD --stat` |

## What this review ran (exit codes, this sandbox)

| Command | Result |
|---|---|
| `node tests/pg-net-queue-unreachable.mjs` / `--list` | 0 before and after the Q-5 change (2 findings superseded, now labelled STAGED) |
| `node tests/pg-net-queue-unreachable.mjs --selftest` | lane: 26 caught / 10 silent. After this review: **36 caught / 12 silent**, with 10 new Q-5 plants and 2 controls. Controls include the lane's own revoke shape and the h6 assertion shape. |
| `node tests/schema-drift.mjs` | 0 (cdf331ef…) |
| `node tests/apply-order-honesty.mjs` | 0 |
| `node tests/world-tick-stall-guard.mjs` / `--selftest` | 0 (P-IDEM ✓) / 0 (4/4 mutants) |
| `node tests/world-tick-stall-after-repoint.mjs` | 0 |
| `node tests/run-ci-local.mjs --job edge` | 7/8 green. **`edge-jwt-gate --strict` is RED because it cannot reach the project from here** (403 host not in egress allowlist, CONTROL FAILED). This is not a code finding, and the Coordinator must run it. |
| `node tools/lane-done.mjs` | lane: all green. After this review: **all green (exit 0)**. |
| `node tools/pack-edge.mjs hr-accrue --hash` | lane (base 0e4abeef) fe3eaba4…. **The `set/b560` 76e0a964 + lane merge (scratch worktree, 0 conflicts) packs 00eea7ba7b27995b9433fb1df0db8d6d1dd75ff19664023fe6d51a22172a20c8**, the same as the set. The lane adds no edge change. |

## Q-5 (landed): `hr_ops` stays a sink

Q-5 is checked per file with no clearance. It fails on any of the following:
- a GRANT on `hr_ops` or on anything in it (to anyone but `postgres`), including a dynamic `execute '…'` grant;
- an `alter default privileges … in schema hr_ops … grant`;
- an exposed-schema routine or view that references `hr_ops.` from outside `SINK_CALLERS = {public.hr_tick_cron_note}`;
- a grant of a SINK_CALLER to a client or engine role;
- `hr_ops` in a `pgrst.db_schemas` assignment or in `config.toml` `schemas`;
- `alter schema hr_ops …` or `alter function hr_ops.… set schema|owner to|rename`.

Each of these is proved by a `--selftest` plant.

**Residual (accepted, named):** Q-5 follows one hop. If some public routine calls `hr_tick_cron_run` (which calls the note) and a client can execute it, the effect is a harvest written to a log nobody else can read, so there is no disclosure path. The in-database chain-end assertion recommended in T-5 (fold into the next `hr_assert_grant_hygiene` restatement) is still the thing that would close platform-side drift. It should cover `has_schema_privilege(role,'hr_ops','usage')` for the six roles.

## For the Coordinator after the apply

Flip the note to APPLIED. `live-hash-drift --live --write` should drop `public.hr_tick_edge_harvest` and `public.hr_tick_edge_summary`; `hr_ops` bodies are not in that baseline's scope. Re-run `pg-net-queue-unreachable.mjs` and check that the STAGED qualifier is gone. Run `edge-jwt-gate --strict` from a host that can reach the project.
