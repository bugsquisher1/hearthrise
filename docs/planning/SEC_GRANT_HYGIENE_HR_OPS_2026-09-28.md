# Security review — lane/c-grant-hygiene-hr-ops @ 57ad6da9 (link 15, check (9) hr_ops_reachable)

Reviewer: security-engineer, 2026-09-28. Base set/b560 ef3cb6d1. Static read + PGlite replay only (Supabase egress 403). Changes landed on `sec/grant-hygiene-hr-ops-review`.

| # | Question | Finding | Evidence |
|---|---|---|---|
| 1 | Byte-for-byte vs link 14 | **Holds.** DERIVED block link 14 (656 lines) vs link 15: `diff` shows only insertions (`13a14`, `628a630,660`, `637a670`, `650a684`), **0 `<` lines**. Header `hr_assert_grant_hygiene(p_strict boolean default true) returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog` is unchanged. The revoke pair is identical (link 14 `2026-09-23-m8-parties-s2-3-engine-allowlist.sql:748-750`, link 15 `2026-09-28-grant-hygiene-hr-ops.sql:763-765` at 57ad6da9). After replay: owner postgres, prosecdef true, proconfig `search_path=public, pg_catalog`, proacl `{postgres=X/postgres}`. | `derive --check` rc 0 (15 links, 19 patches) |
| 2 | Control hygiene (b)/(c) | **No leak on any path.** Each probe sits in a `begin … exception when others` subtransaction whose last statement is an unconditional `raise … HR853` (mig :823-830 and :841-851 on the sec branch), so the block can only exit by exception, and that rolls the subtransaction back. `when others` does not catch query_canceled/assert_failure, but those abort the whole apply, which rolls back too. The post-checks (:835, :857) raise out of the file, which rolls back the entire request. The handler only concatenates `sqlstate`/`sqlerrm` and cannot fail. After two applies the replay has 2 routines in hr_ops (no probe) and the hr_ops ACL md5 is unchanged. | reapply probe rc 0 |
| 3 | Role coverage | **Two roles were missing: GO-WITH-CHANGES, landed.** The edge connects as **`hr_engine_login`** (`supabase/functions/hr-accrue/index.ts:13-14`, LOGIN NOINHERIT, `SET ROLE hr_engine`). PostgREST connects as **`authenticator`**, which is also granted hr_engine/hr_tick (`2026-08-11-player-state.sql:153`, `2026-09-20-world-tick-roster.sql:182`). A direct grant to either role runs before SET ROLE (or after `reset role` on a compromised edge), and the six-role list could not see it. Both were added (change 1). Rightly excluded: `supabase_admin`, `postgres` and any superuser are the owner class, and `has_*_privilege` is always true for them, so strict mode could never pass. `pg_read_all_data` has implicit USAGE on every schema but no EXECUTE, and hr_ops holds functions only (a member role that inherits it shows up under its own name anyway). `pg_execute_server_program` is COPY PROGRAM and has nothing to do with hr_ops. `supabase_auth_admin` and `dashboard_user` are platform roles that run no client- or edge-supplied SQL. Default privileges: an `alter default privileges … in schema hr_ops` only arms at the NEXT create, and check (9) reads the resulting ACL at that apply's GATE and at every nightly run. D4 already requires postgres's global default ACL to be fail-closed for PUBLIC/anon/authenticated. **Follow-up (not blocking):** report-only visibility of `pg_default_acl` rows on hr_ops, or global rows granting service_role/hr_engine/hr_tick. | PGlite probe: `schema:authenticator:USAGE` and `schema:hr_engine_login:USAGE` each reported and strict raised, clean chain reads `[]` (rc 0) |
| 4 | Production risk at apply | **Predicted clean.** `2026-09-28-tick-harvest-off-rpc-surface.sql:40-42` creates hr_ops `authorization postgres` and revokes ALL from public plus the five roles. `:138-143` revoke EXECUTE on both hr_ops functions from public plus the five. Nothing in the chain grants on hr_ops, and authenticator/hr_engine_login are NOINHERIT. GATE(a) would raise only if something typed outside the repo granted one of these, or if one of the eight is a superuser or inherits from postgres. In that case the apply rolls back cleanly and the raise names the grant. Run the query below read-only first. | chain read |
| 5 | Q-5 exemption | **Holes found: GO-WITH-CHANGES, landed.** `discardedGrant` blanked only `'…'` literals, so a raise hidden in text it does not model was taken as code. Three new plants **SLIPPED** at 57ad6da9 (selftest rc 1, "3 of 58 probes failed"): `sink-grant-raise-in-dollar-string` (`perform $x$; raise exception 'y'; $x$`), `sink-grant-raise-in-e-string` (`E'\'; raise exception x; \''`), and `sink-grant-call-commits` (a `call` of a procedure that COMMITs the grant before the raise). Fix (change 2): `call` added to `DISCARD_BLOCKERS`, and `DISCARD_OPAQUE` (`$ \ " -- /*` anywhere between the grant and the raise) now fails closed. Comment plants (`--`, `/* */`) were already caught, and they are kept as plants. The lane's own control shape stays silent, and the tree scan stays clean. | selftest after fix rc 0: **45/45 caught, 13 controls silent**. Guard on tree rc 0 |
| 6 | Idempotence and order | **Holds.** Re-executing the file on the replay leaves an identical md5 over every public+hr_ops routine (prosrc+acl+owner+secdef+config) and the hr_ops ACL (rc 0). The file is **last** in `tests/schema-apply-order.json` (index 235). Outside the DERIVED block it touches only the §1 precondition DO, the detector revokes and the §3 DO. | schema-drift 0 · run-sql-tests 0 · derive --check 0 · apply-order-honesty 0 · unlock-buy 0 · pg-net guard 0 · selftest 0 · lane-done 0 (all re-run after the changes) |
| 7 | Money-adjacent | **None.** No insert/update/delete/table/ledger/price/XP/gold/inventory/leaderboard path. The detector is `stable` and read-only. The only DDL is the discarded probes and the detector's own revokes. | grep of mig outside DERIVED + derived diff |

**Changes landed on `sec/grant-hygiene-hr-ops-review`** (at the sha named in the final report):
1. Check (9) role list gains `authenticator` and `hr_engine_login`. The edit is made in the `hr_ops_sink_check` patch in `tools/derive-grant-hygiene.mjs` and regenerated with `--write`, so the migration is still GENERATED and `--check` stays at 0. The migration header comment and the apply-order note were updated to match.
2. `tests/pg-net-queue-unreachable.mjs` Q-5: `call` is a blocker, and opaque quoting/comment forms between the grant and the raise fail closed. There are five new must-catch plants. Mutation proof: without the fix, 3 of those plants SLIP.

VERDICT: GO-WITH-CHANGES (1) authenticator + hr_engine_login added to check (9), (2) Q-5 exemption closed against dollar/E-string/`call` holes. Both are landed on `sec/grant-hygiene-hr-ops-review`, so the Coordinator should apply the file from that branch, not from lane head 57ad6da9.

## Pre-apply read-only query (Coordinator, management endpoint). Expected: zero rows

```sql
with r(role) as (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),('authenticator'),('hr_engine_login'))
select 'schema:' || r.role || ':' || pv as reach
  from r cross join unnest(array['USAGE','CREATE']) pv
 where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
   and has_schema_privilege(r.role, 'hr_ops', pv)
union all
select p.oid::regprocedure::text || ':' || r.role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join r
 where n.nspname = 'hr_ops'
   and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
   and has_function_privilege(r.role, p.oid, 'execute')
union all
select 'superuser:' || rolname from pg_roles
 where rolsuper and rolname in ('anon','authenticated','service_role','hr_engine','hr_tick','authenticator','hr_engine_login');
```
Any row means GATE(a) will raise and the apply will roll back. Read the row before applying; do not revoke by hand outside a migration.
