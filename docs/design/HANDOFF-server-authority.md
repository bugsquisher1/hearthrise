# HANDOFF — server-authority program (as of 2026-08-11, b328 / commit 511736d)

Read this first, then `docs/design/server-authority.md` (the architecture) and
`docs/design/away-time-ruling.md` (binding balance ruling). CLAUDE.md's
"Server authority (locked 2026-08-10)" section is the governing rule.

## THE GOAL (locked by Tyler, do not re-litigate)
Multiplayer-ONLY, online-ONLY, fully server-authoritative. **There is no solo
progression** — rejected three times. Every progression value is computed and owned
by the server; the client sends intents and renders results. "Offline progression"
means server-side accrual (activity + server timestamp → server computes on return),
not offline play. **The beta WILL BE WIPED at cutover**, so design correctly, not
compatibly. Tyler has pre-approved the wipe; execute it only at the end.

## WHERE THINGS STAND

### Shipped to the game (b319–b328)
Simulation core extracted to `src/core/*` (DOM-free, deterministic, Node+Deno
runnable); away/active combat unified into ONE loop (`processOfflineCombat` deleted,
11 divergences closed); away-honesty UI; cold-load readiness gate; telemetry firehose
capped; Discord webhook removed from the client; mobile freeze/settings/landscape fixes.

### Applied to production (all verified by execution, not assertion)
- Foundation files 1–3: `player_state`/`player_inventory`/`player_ledger`/
  `player_progress`/`player_intents` + `hr_apply`. **`hr_engine` holds ZERO table and
  column grants across all schemas** — verified directly.
- Security fixes: chat-name authority + profiles lockdown; anon-execute lockdown +
  the GLOBAL default-ACL fix; `revoke hr_engine from authenticator` (a live P0 chain
  to `hr_apply(p_user := anyone)`); clan write-policy pin (two live P0s — any player
  could become leader of any clan with forged cp, or create a clan with forged
  treasury/standing); bug-report relay; telemetry retention; `game_events` truncated
  (DB 245 MB → 16 MB); the two escrow-destroying crons disarmed.

### Built, not yet live
- **Accrual Edge Function** (`supabase/functions/hr-accrue/`) — in-function JWKS
  verification, rate gate before the read, server-derived tickMs, degrade ladder.
- **`hr_engine_login` EXISTS** and its shape is verified (LOGIN, NOINHERIT,
  connlimit 20, member of exactly `{hr_engine}`, zero own grants, password set).
  Tyler stored `HR_ENGINE_DB_URL` as an Edge Function secret (pooler port 6543).

## ⚠️ PARTIAL APPLY — VERIFIED STATE AT HANDOFF (checked directly, not assumed)

**File 1 `2026-08-11-authenticated-surface-lockdown.sql` IS APPLIED.** Confirmed:
35 `%__ungated` wrappers exist, `hr_rpc_gate` exists, `hr_utc_day_key` is no longer
executable by `authenticated`, and `clan_upkeep_pay` (the confirmed treasury drain) is
revoked.

**THE GAME IS WORKING.** The biggest risk in that file was that the 35-RPC wrapper
retrofit had never been exercised over HTTP. Verified after the apply:
`POST /rest/v1/rpc/hr_leaderboard` with the anon key returns **HTTP 200** with correct
data, and live players were active minutes before. PostgREST resolution survives the
retrofit.

**File 2 `2026-08-11-live-market-rls.sql` IS APPLIED** (`live_market_rls_a6_a8_a11`,
2026-08-11 14:31 UTC — after the self-check fix in f4a2915). Re-verified by querying
production 2026-08-11: `beta_invite_check` exists, `market_listings` carries 2 triggers,
its `FOR ALL` policy is GONE (only SELECT/INSERT/DELETE remain), and `market_sales`
keeps exactly one UPDATE policy — the deliberately narrowed
`USING (uid = seller AND collected = false) WITH CHECK (uid = seller AND collected = true)`
one-way flip, which is what §2 is supposed to leave behind, not the old row-level policy.
**A6 and A8 are CLOSED.**

**File 3 `2026-08-11-grant-hygiene.sql` IS APPLIED** (`grant_hygiene_v3_detector`,
14:33 UTC). `hr_assert_grant_hygiene` exists and its body contains the S9 `hr_engine`
capability pin.

**A11 — client half DONE (commit efe6539), server half DELIBERATELY NOT APPLIED YET.**
`src/settings-page.js` no longer reads `beta_invites`; it calls `beta_invite_check`,
verified over HTTP with the real anon key (valid → `{"ok":true}`, unknown → refused).
The read is now module-scope and published as `HearthriseInvite.validate` so its request
shape is testable; the regression test is mutation-proven (577/578 with the table read
put back). §3b — the world-readable policy drop behind
`hearthrise.beta_invites_lockdown_ok = 'yes'` — **must be applied only AFTER this client
is deployed**, because b324 is what players are running and it still reads the table.
Control run 2026-08-11: the anon key still lists all 20 codes. **A11 remains OPEN
until the bump ships and the file is applied a second time.**

**Edge Function: NOT DEPLOYED — and that was the right outcome.** The deploy would have
been 100% broken on arrival: `index.ts` makes `public.hr_rate_gate(...)` the FIRST
statement of the read transaction, and that function did not exist in production —
`2026-08-11-accrue-gate.sql` had never been applied, so D3's SQL half was NOT closed
despite the code half being done. Every authenticated POST would have thrown "function
does not exist", been swallowed by the outer catch, and returned a generic 500 that looks
exactly like a bad secret or a pooler misconfiguration. **I have since applied it** and
verified: gate exists, executable by `hr_engine` only (authenticated/anon false), and
`hr_rate_ok` is NOT executable by the engine — so the engine cannot name its own limit.

**The `?v=` bundler question is ANSWERED: keep them.** Proven with real Deno 2.9.5 rather
than by deploying — `deno check` built the whole graph including `npm:postgres`, and
`deno bundle --platform=deno` produced "32 modules in 55ms, 204.47 KB", both with `?v=326`
intact on every relative specifier. **No `--strip-query` needed.** (Not yet run against
Supabase's hosted eszip, which is the same deno_graph but not identical.)

**THE SERVER CAN COMPUTE PROGRESSION — proven end to end against production.** A real
character driven through the real RPCs with the packed engine, using the cap/seed/envelope
read out of the server: gold 0→4, attack XP 0→26, hitpoints 1154→1164, `rat_tail` ×1,
version 1→2, watermark advanced and clamped into `[old, now()]`. A replay of the same
intent id carrying a HOSTILE delta (`gold:999999, xp.attack:999999`) returned
`replayed:true` and applied nothing. Stale version → `version_conflict`. Key reused on
another slot → refused. The ledger holds exactly ONE compact aggregated row (not per-tick),
and deletion from it is refused. Only the HTTP/JWT/pooler shell is unverified.

**WHAT BLOCKS THE DEPLOY NOW: a `SUPABASE_ACCESS_TOKEN`.** `deploy_edge_function` needs the
225 KB payload passed inline as tool arguments (~60k tokens), which is beyond one response
budget, and the management tools were refused by the permission classifier. A CLI-deployable
tree is staged in the scratchpad; `npx supabase functions deploy hr-accrue --project-ref
nezapsylztqbbwuwembx` gets as far as `LegacyPlatformAuthRequiredError: Access token not
provided`. Tyler generates one at supabase.com/dashboard/account/tokens. Payload sha256 to
verify against the deployed `GET`: `6de4f8cdd8a6d70f4db157f32b835f9e31b2ac3d52397b999791590b05a5d727`.

**Residue:** 3 rows remain in `player_ledger` from that verification (append-only refused
deletion, correctly). All player-facing tables are back to 0 rows. Beta wipes at cutover.

Note cron is at 9 jobs (was 10) — consistent with the two disarmed market crons plus the
retention/hygiene additions; re-derive rather than trusting this number.


## SEQUENCE COMPLETE + TWO CORRECTIONS (verified after the handoff was first written)

**All three security migrations are APPLIED.** `live_market_rls_a6_a8_a11`
(`20260811143110`) and `grant_hygiene_v3_detector` (`20260811143332`) both applied first
try, self-checks passed, transcriptions sha-verified. `hr_assert_grant_hygiene(true)` is
clean with **`ungated_client_rpcs: []`** — the A9 detector is live and reporting 0.
A6/A8 re-verified as the real `authenticated` role: forged `seller_name` overwritten,
`seller_user_id` pinned, bop item refused (22023), `ask_each`/`gold_total`/`buyer_name`
PATCH all 42501, double-collect refused — while collect, cancel and **`buy_listing`
end-to-end** still work. PostgREST probe 41/41 identical. `2026-08-11-accrue-gate.sql`
also applied (D3's missing SQL half).

**CORRECTION 1 — the org IS on Pro, not Free.** An agent report claimed "Free tier, no
backups, no PITR" and carried it as the biggest open risk. `get_organization` says
`plan: "pro"`, so **daily backups with 7-day retention exist**. The database is not a
single point of total loss. What remains true and still matters: **no restore has ever
been tested**, and Pro's daily backups accept up to 24h of loss where PITR (a separate
add-on) accepts minutes. Before cutover makes the DB the sole record of progression,
do one real restore test and decide on PITR.

**CORRECTION 2 — C4 did NOT ship, and Security's own wording for it is wrong.**
`hr_engine_login` appears nowhere in `supabase/migrations/*.sql`; file 3 asserts only
`hr_engine`'s allowlist and zero grants. Every property was verified by hand and holds
today, but **drift in it is currently undetectable.** And the assertion as specified —
"`hr_engine` has no members other than `postgres`" — would now FAIL: its members are
`{hr_engine_login, postgres}`, and `hr_engine_login` MUST be a member, because that is
the entire point of the login/capability split. The correct form is **"no members
outside `{postgres, hr_engine_login}`"**. Fix the wording before implementing it.

**A11 remains open by design** — an anon key still returns the invite codes. The RPC half
shipped; the read-lockdown half waits on the one-line `src/settings-page.js:279` swap,
then a second apply of the file.

**New permanent guard:** `tests/rpc-resolution.mjs` (+ targets/baseline JSON) runs 41
PostgREST probes on every push, reads url/key from `supabase-bootstrap.js` rather than
duplicating them, and **exits 1 if its own control stops firing** — a probe that cannot
prove it can see failure is treated as broken, not as a pass.

## NEXT, IN ORDER
1. Get a `SUPABASE_ACCESS_TOKEN` from Tyler and deploy the Edge Function from the staged tree; then set `HR_ACCRUE_URL` so `deployedPayloadGuard` stops skipping. Re-confirmed 2026-08-11: `list_edge_functions` returns `bug-report-bridge` ONLY, so this is still the live blocker.
1b. **After the next client bump ships**, apply `2026-08-11-live-market-rls.sql` a SECOND
   time with `set hearthrise.beta_invites_lockdown_ok = 'yes'` — that closes A11's
   server half. The client half is already in (efe6539); doing it before the deploy
   would break sign-up for anyone on b324.
2. **The client rewire** — the largest remaining risk, explicitly low confidence. It
   touches `legacy.js` everywhere, so agents cannot parallelise on it. Must NOT be
   wired to a non-deployed engine.
3. `market-v2.sql` — **blocked** until the client is off direct `market_listings`
   writes (`src/net/supabase-market-backend.js:73,93,107,120`). It drops/recreates
   the market tables and needs `hearthrise.market_wipe_ok = 'yes'`.
4. Cutover + wipe.

## CUTOVER BLOCKERS (Security's, still open)
- **C5 / X3** — ledger-derived daily budget. Now also a *blocking precondition* for
  the first client-reachable combat accrual intent.
- **Phase-D S4/S5** — fail-closed `active_since`, and `accrued_to = now()` on any
  activity- or equipment-changing write. **This is an OVER-payment path**: the engine
  prices a past absence with equipment read at collect time — measured 12.8× gold and
  20× XP for the same window and seed. Deferred only because `player_state` has 0 rows
  and no client path can create an activity yet.
- **True concurrency** — the conservation fuzz is single-backend, so locks are
  exercised but never raced. Needs a Supabase branch.
- **16 of 43 SECURITY DEFINER bodies are NOT AUDITED** — Security said so explicitly
  rather than implying coverage. Budget another pass.

## KNOWN-OPEN, DELIBERATELY ACCEPTED
- `buy_listing` moves no gold and checks no gold — free market acquisition. Closes
  with market-v2. **If the wipe slips, this becomes a blocker.**
- `clan_contribute` / `clan_board_progress` / `raid_strike` take client-authored
  values that cross to other players. Bounded and journalled; close when the relevant
  domain moves server-side.
- `A11` beta_invites is HALF closed — the world-readable policy drop sits behind a GUC
  that is OFF, because `src/settings-page.js:279` reads that table with the anon key
  *before* sign-up. Needs a one-line client patch, then apply the file a second time.

## DESIGNER-OWNED, QUEUED (not blocking)
- `spdB` sits outside the +52% permanent power fuse. **Do not ship a speed-gear ladder
  before that call** — the pacing anchor stops holding.
- `atkB` is a dead stat at 99 (accuracy clamps at 0.95 even with a bronze sword),
  making sword the worst endgame family.

## HOW TO WORK ON THIS — the lessons that cost the most
1. **VERIFY BY EXECUTING, NEVER BY READING.** The "always-null probe" class — an
   assertion that passes while asserting nothing — has bitten **eight times**:
   `to_regproc` with an argument list (always NULL); an assertion listing a function it
   had just granted; a `to_regprocedure` signature stale after a param was added;
   `pack-edge --check` re-running the transform under test; a source-text regex standing
   in for a numeric assertion; a parity test whose before/after were the same object;
   an "un-collect" probe that passed by absence of an exception; and
   `pg_get_function_identity_arguments()` returning parameter NAMES so any
   `to_regprocedure` built from it is NULL on every database. **Prove a test fails when
   the bug is present**, or it is decoration.
2. **`tests/conservation-fuzz.mjs` runs all four migrations against PGlite** — real
   PostgreSQL 18 in WASM, in-process, no Docker, no credentials, production untouched.
   Use `tests/sql/pglite-fixture.sql` to prove migrations. This is far better than
   rolled-back production probes, which is what earlier rounds were forced into.
3. **A guarded RPC is only as strong as the write privileges on the table it reads
   authority from.** That is how the clan takeover worked — the permission functions
   were correct; the attacker wrote the row they consulted.
4. Supabase's default ACL grants EXECUTE to PUBLIC on every new function. Only a
   **GLOBAL** `alter default privileges` (no `IN SCHEMA`) suppresses it; a schema-scoped
   one can only ADD to the hardwired base.
5. Every migration must ship a self-verifying `do $$` block; `apply_migration` is atomic
   on this project, so that block is a commit gate.
6. Dispatch agents with `isolation:"worktree"` unless they must share the tree — I
   patched over a live agent's work twice by forgetting.
7. `execute_sql` does NOT preserve a session between calls; a chunked `begin` will not
   hold and would commit destructive DDL. A single-call `begin … rollback` IS honoured.
8. Use heredocs for commit messages — backticks get shell-evaluated.
