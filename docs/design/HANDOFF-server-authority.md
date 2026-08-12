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

**WHAT BLOCKS THE DEPLOY: a `SUPABASE_ACCESS_TOKEN` — and the reason is NOT the one
previously recorded here.** This was re-examined 2026-08-11 on the theory that "needs a
token" was a context-budget limit misfiled as an authorization limit. It is not. The
budget arithmetic is real (230,698 chars ≈ 64–68k output tokens in ONE tool call, plus
~67k to read the files in), but the disqualifying problem is deeper and independent of
budget:

**`deploy_edge_function` takes file contents as tool ARGUMENTS, so the agent hand-authors
all 230,698 bytes — including `payload-hash.js`, which is where `PAYLOAD_SHA256` is
typed.** The deployed `GET` returns that constant, and `deployedPayloadGuard` compares
against it. A transcription slip anywhere in the other 21 files therefore yields a payload
that REPORTS A HASH IT DOES NOT HAVE, and the guard passes on it. `ezbr_sha256` is
Supabase's own eszip digest with no local reference, so there is no independently-sourced
second value to catch it. A corrupted number inside the 63 KB of `items.js` / `gear-tiers.js`
would be silent — in the component that is about to own every progression value in the game.
That is the tenth instance of the assertion-that-asserts-nothing family, pre-registered.
**Do not "unblock" this by hand-transcribing the payload.** Tyler generates a token at
supabase.com/dashboard/account/tokens; the mechanical path is in
`.claude/coordination/HANDOFFS.md`. If an agent should ever do this unattended, the fix is
a `tools/deploy-edge.mjs` that reads the packed directory off disk and POSTs multipart to
the Management API — deliberately NOT written yet, because an untested deploy client is the
same decoration problem in a new file.

**CANONICAL PAYLOAD SHA256 — DO NOT TRUST A NUMBER WRITTEN HERE; DERIVE IT.** The hash is a
property of the tree, and every merge that touches `supabase/functions/**`, `src/core/**` or
`src/data/**` moves it. `payload-hash.js` in the repo holds the literal `'unpacked'`;
`tools/pack-edge.mjs` computes the digest and injects it at pack time, so there is no
hand-typed constant to go stale — but a value transcribed into prose like this one does.
Worked example of exactly that: `fb1880617115f418…` was the b330 tree and `d362761eb17b85b9…`
is b331 — the bump alone moved it, because `?v=NNN` is part of the vendored core/data bytes.
The value below was correct for b328 and is kept only to date the change:
`7466c50ebdecf4e24a932d829fdd6b1fc5647dd7fbd274b603139f5ae36dca4f`
(22 files, 230,698 bytes, all LF). The old `6de4f8cd…` was WRONG TWICE OVER: `core.autocrlf=true`
with no `.gitattributes` meant the index held LF while the worktree held CRLF for whichever
payload files an editor had rewritten (`index.ts` 430 CRLFs, `accrual.js` 451), so one commit
packed to different hashes on different machines — it was reproducible on exactly one box.
The b329 combat merge then moved it again. Fixed in `60df672`: `.gitattributes` pins
`supabase/functions/**`, `src/core/**`, `src/data/**` to `eol=lf`, and the payload
fingerprint is now a property of the commit. **The deploy is NOT deployed** — proven by
execution, not by reading: three controls firing 401 / 400 / 404 differently, against a
uniform 404 on every `hr-accrue` verb and auth shape.

**The D3 failure mode is genuinely closed** — all five functions `index.ts` calls
(`hr_rate_gate`, `hr_state_of`, `hr_offline_cap_ms`, `hr_seed`, `hr_apply`) exist and are
`hr_engine`-only, `authenticated`/`anon` false. `hr_rate_ok` is still NOT engine-executable,
so the engine cannot name its own limit.

**First test to run AFTER the deploy** (cheapest honest end-to-end): sign in as any existing
player and POST `{"slot":5}`. An empty slot returns `409 no_character` **after** a successful
`hr_rate_gate` + `hr_state_of` round trip — which proves the pooler string, the
`set local role`, and all five grants at once, while writing nothing but a rate-bucket row.
Everything reachable without a real user JWT stops at 401, so "deployed and correctly
refusing" cannot otherwise be told apart from "deployed but 500ing on `HR_ENGINE_DB_URL`".

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

## STATE OF PRODUCTION AT END OF 2026-08-11 (each line verified by query, by the Coordinator, after the agent reported it)

Applied today beyond the three security files: `clan_member_cap`, `raid_claim_authority`,
`daily_budget`, `clan_membership_authority`, `clan_leaderboard_join_policy`,
`clan_join_policy_merge_r4_tolerance`.

Confirmed live by direct query: all eight new clan RPCs (`clan_join`, `clan_kick`,
`clan_leave`, `clan_create`, `clan_invite`, `clan_invite_revoke`, `clan_invites_list`,
`clan_join_policy_set`) are `SECURITY DEFINER`, `search_path` pinned, `authenticated`-only,
`anon` FALSE; `hr_clan_may_admit` is not client-executable at all; `clans.join_policy`
exists defaulting to `'open'`; `clan_bans` exists.

**The C5 daily-budget primitives are INERT in production** — they exist, nothing calls
them, and no role can execute them. `apply-engine.sql` (the enforcement half) is
deliberately NOT applied; see the stale-`hr_apply` section below.

⚠ **TWO DEBTS CREATED TODAY, both deliberate:**

1. **db ≠ repo, textually, for `2026-08-11-clan-membership-authority.sql`.** What was
   applied used a `format()` grant loop; the committed file uses literal
   `revoke`/`grant` statements so `run-sql-tests.mjs`'s static lints can see them
   (a dynamic grant would have opted eight brand-new client-callable RPCs out of the
   repo's only static defence). The differences are privilege-identical and already
   reconciled by the third migration — verified live: the `clan_members` INSERT policy
   carries ALL THREE concerns at once (A1's column pins, R4's ±2min `joined_at`/`cp_at`
   pin, and the `join_policy = 'open'` door). The file is idempotent; re-apply it
   **from a file, via CLI/psql — NOT by pasting it into a tool argument.** Hand-authoring
   61 KB of security SQL is the same transcription-risk class that correctly stopped the
   Edge Function deploy.
2. **`2026-08-12-clan-members-rls-drop.sql` is staged, NOT applied**, and its own
   self-check refuses to run until a real `clan_ledger` row of `kind='member'` exists —
   i.e. until a live player has actually joined through the RPC. Until then, joining an
   **open** clan by raw INSERT still bypasses the ban list, invite bookkeeping, journal
   and rate limit. It does NOT bypass the member cap (trigger), one-clan-per-account
   (unique index), the timestamp pins, or the invite-only door (all policy-enforced).
   What remains open there is bookkeeping, not authority.

**A LATENT BUG WORTH MORE THAN THE FEATURE THAT FOUND IT:** three separate migrations
had each defined `clan_members."join as self"` — `clan-write-policy-pin` (A1),
`raid-claim-authority` (R4) and `clan-membership-authority` (the door). **In filename
order the shortest sorts last**, so a clean replay of the migration set would have
installed A1's version and SILENTLY DELETED both R4's timestamp pin and the door — and
all three self-checks would still have passed, because each asserts only its own terms.
Now one file owns the definition, the other two cede it and assert against whatever is
live (their guards got stronger), and `tests/run-sql-tests.mjs` fails the build on a
second definition or on the loss of any of eight load-bearing terms. **Generalise this:
a self-check that only tests its own file's terms cannot detect a later file undoing it.**

**MIGRATIONS ARE NO LONGER APPLIED BY AGENTS.** Two were flagged for applying schema
changes to a live database on a Coordinator's authorization rather than Tyler's. Agents
now stage the file, commit, and report; the Coordinator reviews and applies. Rolled-back
single-call `begin … rollback` probes and read-only queries are unchanged — that is how
an exploit gets proven open before it is closed, and that bar stays.

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

## ⚠ PRODUCTION'S `hr_apply` IS A STALE REVISION (found 2026-08-11, by execution)

`supabase/migrations/2026-08-11-apply-engine.sql` at HEAD is **not what production runs.**
Measured directly: production's `hr_apply` body is 25,966 chars against the file's 40,754, it
declares `c_max_xp_delta := 5000000` (the file says 12,000,000 — the Security ruling never
landed), it carries **no `intent_mismatch` branch** (the S6 accrual self-DoS is open), and its
clamp header still says *"treat any rejection as an incident, not a tuning problem"*, a sentence
the current file explicitly records as deleted. The file's own §6(e-ii) textual assertion would
**fail** against production today, which is proof the current revision was never applied.

Consequence: several things this handoff describes as live are only live *in the repo*. Applying
the file is required and safe (`player_state` has 0 rows, `hr_apply` is `hr_engine`-only and the
Edge Function is not deployed) — but it is a larger change than any single diff, so it needs its
own review pass rather than riding along with someone else's migration.

## CUTOVER BLOCKERS (Security's, still open)
- **C5 / X3 — ledger-derived daily budget: BUILT, and HALF LIVE.**
  `supabase/migrations/2026-08-11-daily-budget.sql` is **applied to production** (migrations
  `daily_budget_c5_x3_ledger_derived` + `daily_budget_pin_search_path`) and verified there:
  limits `{gold 25M, xp 40M, qty 1M}` per character-day, breach detail correct, **zero grants to
  any client role or to `hr_engine`**, `hr_assert_grant_hygiene` still clean, the 3 residue
  ledger rows untouched. Design + numbers: `docs/design/server-authority.md` §3 "Daily caps".
  **The ENFORCEMENT half is not live**, because it lives in `hr_apply` — see the stale-revision
  note above. `2026-08-11-apply-engine.sql` now (a) fails closed in §0 without
  `hr_day_budget_check`, (b) checks the budget after the per-call clamps and before the state
  UPDATE, (c) stamps `gold_in/xp_in/qty_in` on every ledger row it writes, and (d) proves all of
  that behaviourally in §6(g) with a real character inside a rolled-back subtransaction.
  **Applying that file is the remaining step.**
  Also needed, and NOT done (owned by whoever holds `supabase/functions/**`): add
  `'daily_budget'` to `DEGRADABLE` in `hr-accrue/index.ts`, so an honest accrual that lands on
  the ceiling costs part of one absence instead of bricking the watermark.
- **Phase-D S4/S5 — HALF CLOSED.** `accrued_to = now()` on any equipment- or activity-changing
  write is now in `hr_apply` (same file), which makes the 12.8×/20× over-payment
  *arithmetically empty* rather than merely detected: after an equip there is no unpaid window
  left for the new gear to price. **The other half is open and is not SQL:** the intent surface
  must COLLECT BEFORE IT EQUIPS (otherwise the same rule confiscates the elapsed window — an
  under-payment), and the fail-closed `active_since` rule lives in `hr-accrue/accrual.js`'s
  preconditions. Both are in `supabase/functions/**`.
- **True concurrency — STILL OPEN, and still not raced.** The daily-budget work did not
  close this and does not claim to. PGlite is one backend; `create_branch` needs a
  `confirm_cost` tool that is not exposed in this environment; `execute_sql` cannot hold a
  transaction open across calls. So the budget's serialisation chain (advisory lock →
  `for update` → VOLATILE ledger sum → insert, all in one transaction) is **exercised on every
  fuzz run and contended by nothing.** The one word that would break it — `STABLE` instead of
  `VOLATILE` on `hr_day_budget_used` — is asserted structurally by the migration
  (`provolatile = 'v'`), which is the same strength of guard `apply-engine` §6(f) uses for
  `hr_state_of`. It is not a substitute for a race.
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
