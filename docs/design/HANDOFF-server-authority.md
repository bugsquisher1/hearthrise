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

## ⚠️ IN FLIGHT WHEN THE SESSION ENDED — VERIFY BEFORE ASSUMING
Two agents were running and their results were never seen. **Check actual state; do
not assume either completed.**
1. **Applying three security migrations to production** in order:
   `2026-08-11-authenticated-surface-lockdown.sql` → `-live-market-rls.sql` →
   `-grant-hygiene.sql`. Check: does `clan_upkeep_pay` still lack a period guard?
   Do `%__ungated` functions exist? What does `hr_assert_grant_hygiene(false)` report
   for the A9 count (41 = not applied, 0 = applied)?
   **The untested risk: the retrofit wraps 35 RPC bodies and PostgREST resolution was
   never exercised over HTTP.** If the game is broken for players, this is why —
   check `POST /rest/v1/rpc/hr_leaderboard` first.
2. **Deploying the accrual Edge Function.** Check `list_edge_functions`. Unknowns it
   was sent to settle: whether Supabase's Deno bundler accepts `?v=` on relative
   imports (fallback: `tools/pack-edge.mjs --strip-query`), and whether the pooler
   connection as `hr_engine_login` actually works.

## NEXT, IN ORDER
1. Confirm the two in-flight items above; finish or fix whatever is half-done.
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
