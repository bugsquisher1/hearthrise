-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-11-daily-budget.sql — THE LEDGER-DERIVED DAILY BUDGET (C5 / X3).
--
-- The last clamp in the accrual chain, and the one that makes the other two
-- worth having. Read this header before changing a number in it.
--
-- ── WHAT PROBLEM THIS SOLVES ────────────────────────────────────────────
-- hr_apply already clamps a SINGLE delta (12,000,000 XP, 50,000,000 gold,
-- 1,000,000 units of one item). apply-engine.sql says out loud what that is
-- worth against someone holding the Edge Function: nothing much. hr_rate_gate
-- permits 30 accrues/minute, so the reachable rate WITHOUT a daily ceiling is
--
--     XP    12,000,000 x 30/min = 360,000,000/min = 518,400,000,000 / day
--     gold  50,000,000 x 30/min = 1.5e9/min       = 2,160,000,000,000 / day
--
-- i.e. every skill in the game to 99 (13,034,431 XP each) roughly every two
-- seconds. The per-call clamp is a speed bump measured in seconds. The daily
-- budget is the actual ceiling:
--
--     XP    40,000,000 / day   →  12,960x lower than the reachable rate
--     gold  25,000,000 / day   →  86,400x lower
--     units  1,000,000 / day
--
-- ── WHY IT IS DERIVED BY SUMMING AN APPEND-ONLY LEDGER ──────────────────
-- A stored counter is a value. A value can be moved: by a bug that forgets to
-- increment it, by a reset job that runs at the wrong hour, by a future RPC
-- that writes the row it consults (which is EXACTLY how the clan takeover
-- worked — the permission functions were correct; the attacker wrote the row
-- they read). A sum over an append-only table is not a value, it is a
-- consequence. player_ledger already refuses UPDATE, refuses TRUNCATE, and
-- refuses DELETE inside the 90-day retention window, so the only way to lower
-- today's usage is to not have earned it. This is the clan_deposit budget
-- pattern (2026-08-08-clan-seat.sql:579-589), applied to progression.
--
-- ── WHY THREE NEW COLUMNS RATHER THAN SUMMING `meta` ────────────────────
-- The obvious implementation sums the jsonb `meta->'delta'` that hr_apply
-- already writes. Two things are wrong with it:
--   1. It parses jsonb for every row of the day on every value-minting apply,
--      on the hottest path in the game.
--   2. It cannot tell hr_apply's rows apart from market_v2's. market_buy
--      credits a seller's gold and journals it (market-v2.sql:829). That gold
--      is a TRANSFER from another player who already paid for it out of their
--      own budget when they minted it. Counting it again would mean a player
--      who sells a hoard on the market gets locked out of progression for the
--      rest of the day — a fuse firing on the most honest behaviour there is.
-- So hr_apply stamps three dedicated columns, itself, on every row it writes.
-- NULL means "not written by hr_apply", which is precisely the set of rows
-- that must not consume progression budget, and it is expressed as an absence
-- rather than as a flag someone has to remember to set.
--
--   ⚠ THE COLUMNS ARE NOT CALLER-SUPPLIED. hr_apply computes them from the
--     delta it is about to apply; there is no delta key for them, and the
--     ledger has no client write grant and no client write policy. A
--     compromised engine cannot understate its own consumption, and it cannot
--     evade the budget by choosing `journal.kind` either — the stamp is
--     unconditional, so 'admin', 'trade' and 'iap' are budgeted exactly like
--     'accrue'.
--
-- ── GROSS INFLOW, NOT NET ───────────────────────────────────────────────
-- Only the POSITIVE part of each dimension is recorded. If the budget summed
-- signed deltas it would be a counter again, with a free reset button: mint
-- 25,000,000 gold, spend it at a vendor, and the day's usage is back to zero.
-- Gross inflow is monotonic, which is the whole property.
--
-- The cost of that choice, stated: a transfer that passes THROUGH hr_apply
-- (selling a stockpile to the vendor) is counted as inflow even though it
-- created no new value. That is deliberate double-counting and it is why the
-- gold ceiling is 25,000,000 and not 2,000,000 — see the headroom numbers
-- below.
--
-- ── HOW THIS COMPOSES WITH THE PER-ABSENCE OFFLINE CAP (b307) ───────────
-- READ docs/design/away-time-ruling.md. b226 shipped a DAILY away-time bucket
-- and it was REPLACED because it pinned every save to its cap; b307 made the
-- cap PER-ABSENCE and that ruling is binding. Nothing here resurrects it, and
-- the reason is structural rather than a promise:
--
--   the offline cap    is a PACING control. It acts on ELAPSED TIME, BEFORE
--                      the simulation, in the Edge Function, via
--                      hr_offline_cap_ms. It CLAMPS — it reduces the grant.
--                      It is SUPPOSED to fire; it fires on every honest
--                      overnight. It is the Game Designer's number.
--
--   the daily budget   is an ABUSE CEILING. It acts on MINTED VALUE, AFTER
--                      the simulation, in hr_apply, via a ledger sum. It
--                      REJECTS — it never reduces a grant, never pays part of
--                      one, and never rewrites a number. It must NEVER fire in
--                      honest play. It is a blast radius, like the per-call
--                      clamps.
--
-- A daily bucket pins output AT the cap. A fuse that only two outcomes — "pay
-- in full" or "refuse and record an incident" — cannot pin anything, because
-- it never changes what is paid. b307's pacing is untouched.
--
-- ⚠ IF THEY EVER CONFLICT, THE PER-ABSENCE CAP WINS AND THIS FILE IS RAISED.
--   If a balance change ever makes honest play approach these numbers, the
--   correct response is to raise the budget, not to let it clip a player.
--   That is not a convention: tests/accrual-engine.mjs' dayBudgetGuard fails
--   the build when the measured honest maximum crosses 35% of any of them.
--
-- ── THE NUMBERS, AND WHERE THEY COME FROM ───────────────────────────────
-- Measured by executing the real engine (supabase/functions/hr-accrue/
-- accrual.js) over EVERY monster in the catalogue at maxed skills and
-- best-in-slot gear, at the 24h span (hr_offline_cap_ms' own ceiling), summing
-- across skills and across items rather than taking the per-call maximum:
--
--     total XP across skills   3,551,245   (24h goblin_brute)
--     gold                       524,593   (24h warlock)
--     item units                  63,831   (24h small_wolf)
--
-- A single UTC day's ledger can hold at most TWO of those windows: a 24h-capped
-- absence collected at 00:01 (which paid for yesterday) plus a full 24h of
-- today. So the honest ceiling per character-day is 2x the row above, and the
-- budget is set with ~5x headroom on top of that for the gathering, artisan and
-- farm accrual slices that do not exist yet:
--
--     dimension   honest max/day   budget        used
--     XP           7,102,490       40,000,000    17.8%
--     gold         1,049,186       25,000,000     4.2%
--     units          127,662        1,000,000    12.8%
--
-- ── SCOPE: PER (user, slot), DELIBERATELY ───────────────────────────────
-- The budget window is one CHARACTER, which is exactly what hr_apply's
-- advisory lock and its `select ... for update` on player_state already
-- serialise. An account may hold up to 6 characters (player_state.slot is
-- CHECKed 0..5), so the account-level total is up to 6x these numbers.
--
-- That is intended, not an oversight. A per-ACCOUNT budget would have to be
-- sized for six characters' honest play anyway — 6x looser — so it buys
-- nothing in exchange for a second advisory lock and a new lock-ordering
-- proof. The character is the unit of gold, of inventory, of the leaderboard
-- and of a market listing; it is the right unit for the fuse too.
--
-- ── ADDITIVE AND IDEMPOTENT ─────────────────────────────────────────────
-- Three nullable columns (add column IF NOT EXISTS), two constraints added
-- only when absent, three CREATE OR REPLACE FUNCTIONs. No table is dropped, no
-- row is touched, no index is added (the existing player_ledger_user_idx
-- (user_id, slot, at desc) already serves the window query — a second index on
-- the hottest insert path in the game would cost more than the check does).
-- Reversibility is in §7.
--
-- APPLY ORDER: after 2026-08-11-player-state.sql, BEFORE (or on production,
-- immediately before re-applying) 2026-08-11-apply-engine.sql, which fails
-- closed without hr_day_budget_check.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ──────────────────────────────────────
do $$
begin
  if to_regclass('public.player_ledger') is null then
    raise exception 'player_ledger missing — run 2026-08-11-player-state.sql first';
  end if;
  -- hr_utc_day_key is the project's ONE definition of a UTC day. §1 derives the
  -- day's start from it rather than writing a second definition, and asserts
  -- they agree. A missing day key means the boundary would be invented here.
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key(timestamptz) missing — run 2026-08-08-clan-seat.sql first';
  end if;
end $$;

-- ── 1. The day boundary — SERVER CLOCK, one definition ──────────────────
-- hr_utc_day_key() returns a TEXT key ('2026-8-11'); a range scan needs a
-- timestamptz. Rather than write `date_trunc('day', now() at time zone 'utc')`
-- inline at the call site — a second, drifting definition of "a day" — the
-- boundary gets a function, and §8 asserts by EXECUTION that the two agree at
-- the boundary and one microsecond either side of it.
--
-- IMMUTABLE, with `now()` only as the caller-side default: the expression
-- itself depends on nothing but its argument, so it is usable in a range scan
-- the planner can push into player_ledger_user_idx.
--
-- `set search_path` even though this is SECURITY INVOKER and touches nothing
-- but pg_catalog: get_advisors flags every function without one
-- (function_search_path_mutable), and "it is harmless here" is an argument that
-- has to be re-made by every future reader. The cost is that the planner can no
-- longer INLINE it — but the argument is still evaluated once per statement and
-- used as an index bound on player_ledger_user_idx, which is the property §4
-- actually needs.
create or replace function public.hr_utc_day_start(p_at timestamptz default now())
returns timestamptz language sql immutable set search_path = public as $$
  select (date_trunc('day', p_at at time zone 'utc')) at time zone 'utc'
$$;

-- ── 2. The stamp columns ────────────────────────────────────────────────
-- NULL = "this row was not written by hr_apply" = not progression budget.
-- See the header for why that is the right default and why it is an absence
-- rather than a boolean somebody has to remember to set.
alter table public.player_ledger add column if not exists gold_in bigint;
alter table public.player_ledger add column if not exists xp_in   bigint;
alter table public.player_ledger add column if not exists qty_in  bigint;

-- Gross inflow is non-negative BY CONSTRUCTION, and the database says so. If a
-- future writer ever stamps a signed value here, the budget silently becomes a
-- counter with a reset button (header, "GROSS INFLOW, NOT NET") — so it is a
-- CHECK, which fails the write, and not a comment.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_ledger'::regclass
                    and conname  = 'player_ledger_inflow_nonneg') then
    alter table public.player_ledger add constraint player_ledger_inflow_nonneg
      check (coalesce(gold_in, 0) >= 0
         and coalesce(xp_in,   0) >= 0
         and coalesce(qty_in,  0) >= 0);
  end if;
end $$;

-- ── 3. The limits — ONE place, read by the engine AND by the guard test ──
-- Declared as c_* constants inside the function body on purpose: that is the
-- shape tests/accrual-engine.mjs' clampsFromMigration() already parses out of
-- apply-engine.sql, so the guard reads the real number instead of a second
-- copy of it. A second copy of a number is a drift generator, which is the
-- failure this whole program is organised around.
create or replace function public.hr_day_budget_limits()
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  -- 23.8x the measured honest maximum for a character-day (see the header).
  c_day_gold_budget constant bigint := 25000000;
  -- 5.6x. Also: 3 skills from 0 to 99 per day for someone holding the engine,
  -- against ~40,000 skills/day without a ceiling.
  c_day_xp_budget   constant bigint := 40000000;
  -- 7.8x. Units, summed across item ids — the tradeable surface, so this is
  -- the one that bounds a market faucet.
  c_day_qty_budget  constant bigint := 1000000;
begin
  return jsonb_build_object(
    'gold', c_day_gold_budget, 'xp', c_day_xp_budget, 'qty', c_day_qty_budget);
end $$;

-- ── 4. Today's usage — THE SUM. This is the whole design. ───────────────
-- Half-open [day_start, day_start + 1 day). The upper bound is not decoration:
-- `at` defaults to now() and no client can write this table, but a row stamped
-- in the future by a future admin path would otherwise consume every day's
-- budget from here to eternity, and a fuse that can be armed permanently by one
-- bad row is worse than no fuse.
--
-- ⚠ VOLATILE, AND PL/pgSQL, AND BOTH OF THOSE ARE THE CONCURRENCY CONTROL.
--   This is the RL1 lesson that apply-engine.sql §6(f) already asserts for
--   hr_state_of, and it matters more here. A STABLE function uses the snapshot
--   established by the CALLING QUERY. hr_apply's flow is:
--
--       pg_advisory_xact_lock(user:slot)     ← T2 blocks here while T1 runs
--       select … from player_state FOR UPDATE
--       <budget check>                       ← must see T1's ledger row
--       …
--       insert into player_ledger            ← committed before the lock drops
--
--   T2's outer statement `select hr_apply(…)` began BEFORE T1 committed. If the
--   sum ran on that statement's snapshot, T2 would read a pre-T1 world, both
--   calls would pass the check, and both would spend the same budget — the
--   exact double-spend this control exists to prevent. A VOLATILE PL/pgSQL
--   function gets a FRESH snapshot for every statement it executes, so the sum
--   is taken after T1's commit is visible.
--
--   §8(i) asserts provolatile = 'v'. Do not "optimise" it to STABLE.
create or replace function public.hr_day_budget_used(
  p_user uuid, p_slot int, p_at timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
           'gold', coalesce(sum(gold_in), 0),
           'xp',   coalesce(sum(xp_in),   0),
           'qty',  coalesce(sum(qty_in),  0),
           'rows', count(*),
           'day',  public.hr_utc_day_key(p_at))
    into v_out
    from public.player_ledger
   where user_id = p_user
     and slot    = p_slot
     and at >= public.hr_utc_day_start(p_at)
     and at <  public.hr_utc_day_start(p_at) + interval '1 day';
  return v_out;
end $$;

-- ── 5. The check ────────────────────────────────────────────────────────
-- Returns NULL when the proposed inflow fits, and the breach detail otherwise.
-- NULL-means-ok rather than a boolean so the caller can put `used`, `add`,
-- `limit` and the day key straight into the rejection envelope: a fired fuse
-- has to be diagnosable at 3am from the response alone.
--
-- ⚠ THE ZERO-INFLOW SHORT-CIRCUIT IS A PERFORMANCE CONTROL, NOT A HOLE. An
--   apply that mints nothing (equip, unequip, a craft that only consumes, a
--   watermark-only accrue_forfeit, a pure spend) cannot move any of the three
--   sums, so the day's rows are not read at all. The scan happens only on the
--   applies that actually create value.
create or replace function public.hr_day_budget_check(
  p_user uuid, p_slot int,
  p_gold_in bigint, p_xp_in bigint, p_qty_in bigint)
--
-- VOLATILE for the same reason hr_day_budget_used is — see the block above it.
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_lim  jsonb;
  v_used jsonb;
  v_g bigint := greatest(0, coalesce(p_gold_in, 0));
  v_x bigint := greatest(0, coalesce(p_xp_in,   0));
  v_q bigint := greatest(0, coalesce(p_qty_in,  0));
begin
  if v_g = 0 and v_x = 0 and v_q = 0 then return null; end if;

  v_lim  := public.hr_day_budget_limits();
  v_used := public.hr_day_budget_used(p_user, p_slot, now());

  -- Checked in a fixed order so the same over-budget delta always names the
  -- same dimension. A rejection code whose detail depends on hash order is a
  -- support ticket nobody can reproduce.
  if v_g > 0 and (v_used->>'gold')::bigint + v_g > (v_lim->>'gold')::bigint then
    return jsonb_build_object('dim', 'gold', 'used', (v_used->>'gold')::bigint,
                              'add', v_g, 'limit', (v_lim->>'gold')::bigint,
                              'day', v_used->>'day');
  end if;
  if v_x > 0 and (v_used->>'xp')::bigint + v_x > (v_lim->>'xp')::bigint then
    return jsonb_build_object('dim', 'xp', 'used', (v_used->>'xp')::bigint,
                              'add', v_x, 'limit', (v_lim->>'xp')::bigint,
                              'day', v_used->>'day');
  end if;
  if v_q > 0 and (v_used->>'qty')::bigint + v_q > (v_lim->>'qty')::bigint then
    return jsonb_build_object('dim', 'qty', 'used', (v_used->>'qty')::bigint,
                              'add', v_q, 'limit', (v_lim->>'qty')::bigint,
                              'day', v_used->>'day');
  end if;
  return null;
end $$;

-- ── 6. GRANTS — revoke from PUBLIC first, then from the named roles ─────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL additionally grants anon/authenticated/service_role. Revoking
-- one of the four leaves the privilege intact three other ways.
--
-- NOTHING IS GRANTED TO hr_engine EITHER, and that is the point. hr_apply is
-- SECURITY DEFINER and owned by postgres, so it calls these as the owner
-- regardless of grants. If the ENGINE could call hr_day_budget_limits it could
-- read its own ceiling and pace itself right up to it; if it could call
-- hr_day_budget_used it could tell, per character, exactly how much room is
-- left. Neither is information the proposer of a delta needs, and the design's
-- own capability table (docs/design/server-authority.md §2a) is a list nobody
-- may extend without re-deriving why. hr_offline_cap_ms is on that list because
-- the engine genuinely needs the number; these three it does not.
revoke execute on function public.hr_utc_day_start(timestamptz) from public;
revoke execute on function public.hr_utc_day_start(timestamptz)
  from anon, authenticated, service_role;
revoke execute on function public.hr_day_budget_limits() from public;
revoke execute on function public.hr_day_budget_limits()
  from anon, authenticated, service_role;
revoke execute on function public.hr_day_budget_used(uuid, int, timestamptz) from public;
revoke execute on function public.hr_day_budget_used(uuid, int, timestamptz)
  from anon, authenticated, service_role;
revoke execute on function public.hr_day_budget_check(uuid, int, bigint, bigint, bigint) from public;
revoke execute on function public.hr_day_budget_check(uuid, int, bigint, bigint, bigint)
  from anon, authenticated, service_role;

-- ── 7. REVERSIBILITY ────────────────────────────────────────────────────
--   1. Re-apply the previous revision of 2026-08-11-apply-engine.sql (the one
--      whose §0 does not require hr_day_budget_check). hr_apply is a single
--      CREATE OR REPLACE, so that is the whole rollback of the enforcement.
--   2. drop function if exists public.hr_day_budget_check(uuid,int,bigint,bigint,bigint);
--      drop function if exists public.hr_day_budget_used(uuid,int,timestamptz);
--      drop function if exists public.hr_day_budget_limits();
--      drop function if exists public.hr_utc_day_start(timestamptz);
--   3. The three columns and the CHECK may stay: they are nullable, they cost
--      nothing on a row that does not use them, and dropping a column from the
--      largest table in the database is a maintenance-window decision rather
--      than a rollback step. If they must go:
--        alter table public.player_ledger drop constraint player_ledger_inflow_nonneg;
--        alter table public.player_ledger drop column gold_in, drop column xp_in, drop column qty_in;
-- No cron job, no data migration, no row rewritten. Raising a LIMIT is a
-- one-line edit to §3 and needs no other change anywhere.

-- ── 8. SELF-VERIFICATION ────────────────────────────────────────────────
-- Every claim below is EXECUTED. The "always-null probe" — an assertion that
-- passes while asserting nothing — has bitten this program nine times, so:
--   • signatures use to_regprocedure, never to_regproc (to_regproc with an
--     argument list is NULL on every database);
--   • the behavioural probes write REAL rows into player_ledger and read them
--     back through the REAL function, inside a subtransaction that is rolled
--     back by a raised HR999. PL/pgSQL variables survive that rollback, the
--     rows do not — so the probe is genuinely executed and leaves nothing
--     behind in an append-only table that (correctly) refuses DELETE;
--   • §8(g) then re-reads usage after the rollback and requires it to be zero,
--     which is what proves the probe's own cleanup rather than assuming it.
do $$
declare
  v_p oid; v_bad text;
  v_u uuid := gen_random_uuid();
  v_lim jsonb;
  -- captured inside the rolled-back subtransaction
  v_used_today jsonb; v_used_other jsonb;
  v_fits jsonb; v_breach jsonb; v_neg_ok boolean := false;
  v_after jsonb;
begin
  -- (a) The four functions exist with the signatures the callers name.
  foreach v_bad in array array[
    'public.hr_utc_day_start(timestamptz)',
    'public.hr_day_budget_limits()',
    'public.hr_day_budget_used(uuid,int,timestamptz)',
    'public.hr_day_budget_check(uuid,int,bigint,bigint,bigint)']
  loop
    if to_regprocedure(v_bad) is null then
      raise exception '% missing — the signature in the assertion does not match the one created', v_bad;
    end if;
  end loop;

  -- (b) The three stamp columns exist and are bigint. A budget that silently
  --     stamps into a column that is not there would be a no-op fuse.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'player_ledger'
         and column_name in ('gold_in','xp_in','qty_in') and data_type = 'bigint') <> 3 then
    raise exception 'player_ledger is missing one of gold_in/xp_in/qty_in as bigint';
  end if;

  -- (c) NOT executable by anything a request can arrive as, and NOT by the
  --     engine either (see §6). Checked for all four functions at once.
  for v_bad in
    select f || ' → ' || r
      from unnest(array[
             'public.hr_utc_day_start(timestamptz)',
             'public.hr_day_budget_limits()',
             'public.hr_day_budget_used(uuid,int,timestamptz)',
             'public.hr_day_budget_check(uuid,int,bigint,bigint,bigint)']) f,
           unnest(array['public','anon','authenticated','service_role','hr_engine']) r
     where has_function_privilege(r, to_regprocedure(f), 'execute')
  loop
    raise exception 'daily-budget function is executable by a role it must not be: % — revoke before grant', v_bad;
  end loop;

  -- (d) THE DAY BOUNDARY AGREES WITH hr_utc_day_key, at the boundary and on
  --     both sides of it. Executed, not reasoned about: this is the one number
  --     that decides which day a grant lands in.
  if public.hr_utc_day_key(public.hr_utc_day_start(now()))
     is distinct from public.hr_utc_day_key(now()) then
    raise exception 'hr_utc_day_start(now()) is not in the same UTC day as now()';
  end if;
  if public.hr_utc_day_key(public.hr_utc_day_start(now()) - interval '1 microsecond')
     = public.hr_utc_day_key(now()) then
    raise exception 'hr_utc_day_start is not a boundary — one microsecond earlier is still today';
  end if;
  if public.hr_utc_day_start(public.hr_utc_day_start(now()))
     is distinct from public.hr_utc_day_start(now()) then
    raise exception 'hr_utc_day_start is not idempotent';
  end if;
  -- …and it is a UTC boundary specifically, not the server's local midnight.
  if extract(hour from (public.hr_utc_day_start(now()) at time zone 'utc')) <> 0
     or extract(minute from (public.hr_utc_day_start(now()) at time zone 'utc')) <> 0 then
    raise exception 'hr_utc_day_start did not land on 00:00 UTC';
  end if;

  v_lim := public.hr_day_budget_limits();
  if coalesce((v_lim->>'gold')::bigint, 0) <= 0
     or coalesce((v_lim->>'xp')::bigint, 0) <= 0
     or coalesce((v_lim->>'qty')::bigint, 0) <= 0 then
    raise exception 'hr_day_budget_limits returned a non-positive limit: %', v_lim;
  end if;

  -- (e)+(f) THE BEHAVIOURAL PROBE. Real rows, real function, rolled back.
  begin
    -- Three rows for one synthetic character:
    --   today, stamped by "hr_apply"        → MUST be counted
    --   today, NOT stamped (a market credit) → MUST NOT be counted
    --   yesterday, stamped                   → MUST NOT be counted
    -- The second and third are the two ways this control fails silently: a
    -- budget that eats transfers locks honest traders out, and a budget with no
    -- day window locks everybody out permanently after one big day.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, at)
      values (v_u, 0, 'accrue', 'probe_today', 1000, 1000, 2000, 30, now());
    insert into public.player_ledger (user_id, slot, kind, intent, gold, at)
      values (v_u, 0, 'trade', 'probe_market_credit', 999999999, now());
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, at)
      values (v_u, 0, 'accrue', 'probe_yesterday', 999999999, 999999999, 999999999, 999999999,
              public.hr_utc_day_start(now()) - interval '1 hour');

    v_used_today := public.hr_day_budget_used(v_u, 0, now());
    -- The same character, queried for YESTERDAY, must see the yesterday row and
    -- not today's. That is the day window proven in both directions rather than
    -- once.
    v_used_other := public.hr_day_budget_used(v_u, 0, now() - interval '1 day');

    -- A delta that fits.
    v_fits   := public.hr_day_budget_check(v_u, 0, 10, 10, 10);
    -- A delta that crosses the gold ceiling by exactly one.
    v_breach := public.hr_day_budget_check(
                  v_u, 0, (v_lim->>'gold')::bigint - 1000 + 1, 0, 0);

    -- A NEGATIVE stamp must be impossible — the CHECK constraint, executed.
    begin
      insert into public.player_ledger (user_id, slot, kind, gold_in) values (v_u, 0, 'accrue', -1);
    exception when check_violation then v_neg_ok := true;
    end;

    raise exception 'daily-budget probe rollback' using errcode = 'HR999';
  exception when sqlstate 'HR999' then null;
  end;

  if (v_used_today->>'gold')::bigint <> 1000
     or (v_used_today->>'xp')::bigint <> 2000
     or (v_used_today->>'qty')::bigint <> 30 then
    raise exception 'hr_day_budget_used counted the wrong rows for today: % '
                    '(expected gold 1000 / xp 2000 / qty 30 — a market credit and a '
                    'yesterday row were both in the table and must not be counted)',
                    v_used_today;
  end if;
  if (v_used_today->>'rows')::bigint <> 2 then
    raise exception 'hr_day_budget_used saw % rows in the day window, expected 2',
                    v_used_today->>'rows';
  end if;
  if (v_used_other->>'gold')::bigint <> 999999999 then
    raise exception 'hr_day_budget_used did not see yesterday''s row when asked for yesterday: %',
                    v_used_other;
  end if;
  if v_fits is not null then
    raise exception 'hr_day_budget_check refused a delta that fits: %', v_fits;
  end if;
  if v_breach is null or v_breach->>'dim' <> 'gold' then
    raise exception 'hr_day_budget_check did not refuse a delta one unit over the gold ceiling: %',
                    coalesce(v_breach::text, 'null');
  end if;
  if (v_breach->>'used')::bigint <> 1000 then
    raise exception 'the breach detail reports used=% — it must report the LEDGER SUM, not a counter',
                    v_breach->>'used';
  end if;
  if not v_neg_ok then
    raise exception 'player_ledger accepted a negative gold_in — the inflow CHECK is not enforced, '
                    'and a signed stamp turns the budget back into a resettable counter';
  end if;

  -- (g) The probe left NOTHING. player_ledger refuses DELETE inside its
  --     retention window, so a probe that did not roll back cleanly would be
  --     permanent residue in the audit trail. Proven, not assumed.
  v_after := public.hr_day_budget_used(v_u, 0, now());
  if (v_after->>'rows')::bigint <> 0 then
    raise exception 'the daily-budget probe left % rows behind in player_ledger', v_after->>'rows';
  end if;
  if exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'the daily-budget probe left rows behind in player_ledger';
  end if;

  -- (h) ZERO-INFLOW SHORT-CIRCUIT: an apply that mints nothing is never
  --     refused, whatever the day's usage is. This is what keeps the
  --     watermark-only accrue_forfeit path (the last rung of the b328 degrade
  --     ladder) reachable even for a character that has spent its whole budget
  --     — without it, a budget breach would brick accrual instead of costing
  --     one span.
  if public.hr_day_budget_check(v_u, 0, 0, 0, 0) is not null
     or public.hr_day_budget_check(v_u, 0, -5, 0, 0) is not null then
    raise exception 'hr_day_budget_check refused a zero-inflow delta — accrue_forfeit is unreachable';
  end if;

  -- (i) VOLATILITY — the concurrency control, asserted. See the block above
  --     hr_day_budget_used for why STABLE would let two concurrent applies both
  --     pass the check and both spend. One word, and it is the difference
  --     between a serialised budget and a double-spend, so it gets an assertion
  --     rather than a comment — exactly as apply-engine.sql §6(f) does for
  --     hr_state_of after the same class of defect.
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_day_budget_used(uuid,int,timestamptz)')) <> 'v' then
    raise exception 'hr_day_budget_used is not VOLATILE — it would sum a stale snapshot and two '
                    'concurrent applies could both spend the same budget';
  end if;
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_day_budget_check(uuid,int,bigint,bigint,bigint)')) <> 'v' then
    raise exception 'hr_day_budget_check is not VOLATILE — see hr_day_budget_used';
  end if;
  -- …and hr_utc_day_start must stay IMMUTABLE, or the day window stops being a
  -- planner-visible range and the sum degrades to a scan of the character's
  -- whole ledger history.
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_utc_day_start(timestamptz)')) <> 'i' then
    raise exception 'hr_utc_day_start is not IMMUTABLE — the day window can no longer be an index range';
  end if;

  -- (j) EVERY function in this file pins its search_path. get_advisors'
  --     function_search_path_mutable found two of the four the first time this
  --     was applied to production, so the rule gets an assertion rather than a
  --     round of review comments.
  for v_bad in
    select f from unnest(array[
             'public.hr_utc_day_start(timestamptz)',
             'public.hr_day_budget_limits()',
             'public.hr_day_budget_used(uuid,int,timestamptz)',
             'public.hr_day_budget_check(uuid,int,bigint,bigint,bigint)']) f
     where not exists (select 1 from pg_proc p
                        where p.oid = to_regprocedure(f)
                          and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%')
  loop
    raise exception '% has a mutable search_path', v_bad;
  end loop;

  raise notice 'DAILY BUDGET OK — ledger-derived, UTC-day windowed, gross-inflow, gold %/xp %/qty % per character-day.',
    v_lim->>'gold', v_lim->>'xp', v_lim->>'qty';
end $$;
