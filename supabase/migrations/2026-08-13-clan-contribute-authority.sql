-- ============================================================================
-- 2026-08-13-clan-contribute-authority.sql   — F1 (P0). STAGED, NOT APPLIED.
--
-- WHAT IS OPEN (proven by execution against production, rolled back, by the
-- Security Engineer 2026-08-13; the live body was re-read to confirm):
--
--   clan_contribute__ungated(p_clan_id uuid, p_amount bigint) adds p_amount to
--   clans.treasury. The ONLY bounds are `p_amount > 10000000` and clan
--   membership. No gold is checked, held or debited; the body contains no
--   reference to clan_ledger and none to gold. hr_rpc_gate allows 60 calls a
--   minute in the 'clan_contribute' bucket, so an ordinary non-leader member
--   mints 600,000,000 gold of treasury per minute.
--
--   THE CROSSOVER — why this is a P0 and not a clan-internal balance bug.
--   leaderboard_ranked's `clan_power` score is
--       (castle_tier * 1000000000) + LEAST(GREATEST(treasury,0), 999999999)
--   so p_amount IS the public clan ranking score. It saturates the treasury
--   term in ~100 seconds. A forged client value crosses into another player's
--   ranking, which is the ONE property CLAUDE.md names as the target.
--
--   Executed as an ordinary member: treasury 1 → 120,000,001, clan level
--   1 → 8, clan_ledger rows 4 → 4. The handoff's KNOWN-OPEN entry describes
--   this RPC as "bounded and journalled". Execution disproves both halves;
--   docs/design/HANDOFF-server-authority.md is corrected in the same commit.
--
-- WHAT THIS FILE DOES — the 2026-08-08-clan-seat.sql `clan_deposit` shape,
-- which CLAUDE.md names as the house pattern, applied verbatim:
--   (a) JOURNAL the transfer to clan_ledger in the SAME transaction, attributed
--       to auth.uid(), BEFORE the level-up loop — so a clan level cannot commit
--       without the row that explains it.
--   (b) A PER-MEMBER PER-UTC-DAY CAP derived from that ledger rather than from
--       a stored counter: one fewer thing to reset, auditable by construction,
--       and — decisively — clan_ledger has a SELECT-only client policy, so the
--       number the cap is read from cannot be written by the caller. §3 asserts
--       that, because a ledger-derived cap that the client can insert into is
--       not a cap. (Lesson 3 in the handoff: a guarded RPC is only as strong as
--       the write privileges on the table it reads authority from.)
--   (c) SERIALISE the read-modify-write. Without it two concurrent calls read
--       the same "spent today" and each spend the whole budget.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO: debit real gold. Gold is not
-- server-owned until the market/inventory cutover, so there is nothing
-- authoritative to debit. Until then a contribution is still a fabrication —
-- this file makes it an ATTRIBUTED, RATE-BOUNDED fabrication. That distinction
-- is stated plainly rather than dressed up: see the RECOMMENDATION below.
--
-- ⚠ RECOMMENDATION, NOT TAKEN HERE (needs Designer + Security sign-off).
--   Even fully capped, treasury is free to produce, so `clan_power` still ranks
--   clans by a number nobody paid for — the cap only changes the slope. A
--   30-member clan can still add 300,000,000/day and saturate the term in ~3.3
--   days instead of ~100 seconds. The complete fix is to stop `clan_power`
--   reading `clans.treasury` at all and score the second term off the JOURNAL
--   instead, e.g. a trailing-7-day sum over clan_ledger. That term is
--   append-only, per-row attributed, and — once this file and the board-progress
--   file are applied — rate-bounded per member per day BY CONSTRUCTION, which
--   `clans.treasury` is not and cannot be made to be pre-cutover. It is a view
--   change (2026-08-08-leaderboards.sql) and a balance decision, so it is
--   recommended here and left to its owners rather than picked silently.
--
-- BALANCE (Game Designer owns these two numbers; both are chosen to change
-- nothing about honest play):
--   c_call_clamp = 10,000,000 — UNCHANGED from the live body.
--   c_day_clamp  = 10,000,000 — the pre-existing per-call maximum becomes the
--                  per-member daily maximum. No single contribution that was
--                  possible yesterday is impossible today; the only thing
--                  removed is the ability to repeat it 60 times a minute
--                  forever. Effect on the exploit: 600,000,000/minute →
--                  10,000,000/member/day, a factor of 86,400.
--
-- REVERSIBILITY: one `create or replace` of one function body, plus one
-- widened check constraint. To undo, re-apply the `clan_contribute__ungated`
-- definition from 2026-08-08-clan-seat.sql. No row of player data is read,
-- written or migrated. The gated wrapper `clan_contribute(uuid,bigint)` is NOT
-- touched, so the A9 retrofit and hr_rpc_gate stay exactly as they are.
--
-- GUARDED BY: tests/clan-journal-guard.mjs (behavioural, PGlite/PG18), which
-- runs this file against the real migration chain and asserts the cap and the
-- journal by executing the RPC. Mutation-proven — see that file's header.
-- ============================================================================

-- ── 0. PRECONDITIONS — fail closed, do not half-apply ───────────────────────
do $$
begin
  if to_regprocedure('public.clan_contribute__ungated(uuid,bigint)') is null then
    raise exception 'clan_contribute__ungated(uuid,bigint) is missing — apply 2026-08-11-authenticated-surface-lockdown.sql (the A9 retrofit) first';
  end if;
  if to_regclass('public.clan_ledger') is null then
    raise exception 'clan_ledger is missing — apply 2026-08-08-clan-seat.sql first';
  end if;
  -- The whole cap rests on this: the client may read the ledger and may not
  -- write it. If that ever stops being true the cap is decoration.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'clan_ledger' and cmd <> 'SELECT') then
    raise exception 'clan_ledger has a non-SELECT client policy — a ledger-derived cap would be forgeable; refusing to install one';
  end if;
end $$;

-- ── 1. THE JOURNAL VOCABULARY ───────────────────────────────────────────────
-- 2026-08-11-clan-membership-authority.sql §2 owns clan_ledger_kind_check. This
-- file redefines it as a strict SUPERSET and sorts AFTER that file, so a clean
-- replay installs this version. It is restated in full rather than altered,
-- because an `alter ... add` on a constraint that already exists is not a thing
-- and a second, narrower definition landing later would silently delete these
-- kinds — that is exactly the "clan_members join-as-self" latent bug the
-- handoff records (three files, filename order, shortest sorts last). §3
-- asserts every kind in the union is accepted, so a later re-narrowing by any
-- file is caught behaviourally by tests/clan-journal-guard.mjs rather than by
-- nobody.
do $$ begin
  alter table public.clan_ledger drop constraint if exists clan_ledger_kind_check;
  alter table public.clan_ledger add constraint clan_ledger_kind_check
    check (kind in ('deposit','labour','tier','withdraw','upkeep','feast','board',
                    'rested','role','member',
                    'contribute',        -- THIS FILE (F1)
                    'board_progress'));  -- 2026-08-13-clan-board-attribution.sql (F3)
end $$;

-- Reading the cap is a (clan_id, user_id, kind, at) range scan. The existing
-- clan_ledger_tier_idx is (clan_id, kind, at desc) and does not carry user_id,
-- so every contribution would re-scan the clan's whole ledger for that kind.
create index if not exists clan_ledger_member_day_idx
  on public.clan_ledger (clan_id, user_id, kind, at desc);

-- ── 2. THE RPC ──────────────────────────────────────────────────────────────
create or replace function public.clan_contribute__ungated(p_clan_id uuid, p_amount bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  -- Both owned HERE, in a body no caller can reach. A caller can choose
  -- neither its clamp nor its day.
  c_call_clamp constant bigint := 10000000;   -- unchanged from the live body
  c_day_clamp  constant bigint := 10000000;   -- NEW: per member, per UTC day
  v_uid      uuid := auth.uid();
  v_spent    bigint;
  v_budget   bigint;
  v_amount   bigint;
  v_treasury bigint;
  v_level    int;
  v_next     bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > c_call_clamp then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if not exists (select 1 from public.clan_members
                  where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  -- ── SERIALISATION ────────────────────────────────────────────────────────
  -- The cap is PER MEMBER, so the correct granularity is per member: two
  -- members contributing at once must not queue behind each other, and the
  -- same member contributing twice at once must.
  --
  -- Why a TRANSACTION-SCOPED ADVISORY LOCK and not `select ... for update` on
  -- the caller's clan_members row: a row lock would have to be taken in some
  -- order relative to the clans row, and the neighbouring clan RPCs disagree
  -- about that order — clan_deposit touches clan_members BEFORE clans, while
  -- clan_upkeep_settle (which clan_deposit calls first) touches clans before
  -- anything. Picking either order here makes a deadlock constructible with a
  -- concurrent deposit. This lock is taken FIRST, before any row is touched,
  -- and no other function takes it, so no waits-for cycle can pass through it:
  -- a holder is always inside this function, where it holds no row lock yet.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr:clan_contribute:' || v_uid::text, 0));

  -- ── THE LEDGER-DERIVED DAY BUDGET ────────────────────────────────────────
  -- Same expression clan_deposit uses for "since the start of the UTC day", so
  -- there is one idiom for the day boundary in the clan domain rather than two.
  select coalesce(sum(l.qty), 0) into v_spent
    from public.clan_ledger l
   where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'contribute'
     and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

  v_budget := greatest(0, c_day_clamp - v_spent);
  if v_budget <= 0 then
    return jsonb_build_object('ok', false, 'error', 'daily_cap',
      'spent_today', v_spent, 'day_cap', c_day_clamp);
  end if;

  -- CLAMP, do not refuse. A partial accept keeps an honest player who is near
  -- the ceiling moving, and the response reports both numbers so the client can
  -- say so truthfully rather than inventing one.
  v_amount := least(p_amount, v_budget);

  update public.clans set treasury = treasury + v_amount
    where id = p_clan_id returning treasury, level into v_treasury, v_level;
  if v_treasury is null then
    return jsonb_build_object('ok', false, 'error', 'no_clan');
  end if;

  update public.clan_members set contributed = contributed + v_amount
    where clan_id = p_clan_id and user_id = v_uid;

  -- ── THE JOURNAL ──────────────────────────────────────────────────────────
  -- Same transaction, and BEFORE the level loop. One row per value transfer,
  -- never per tick (the game_events lesson: 1.6M rows / 229 MB from 6 players
  -- in 4 days). A member is gate-limited to 60 of these a minute and capped at
  -- one day's budget, so the row count is bounded by the cap, not by traffic.
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, v_uid, 'contribute', v_amount);

  v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  while v_treasury >= v_next and v_level < 10 loop
    v_level := v_level + 1;
    update public.clans set level = v_level where id = p_clan_id;
    v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  end loop;

  return jsonb_build_object('ok', true,
    'treasury', v_treasury, 'level', v_level,
    'accepted', v_amount, 'requested', p_amount,
    'spent_today', v_spent + v_amount, 'day_cap', c_day_clamp);
end $$;

-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL adds anon/authenticated/service_role. `create or replace` keeps
-- the existing ACL, but restating the revoke costs nothing and means this file
-- is correct even if the function is ever dropped and recreated from it.
-- The __ungated body is reachable ONLY through the gated wrapper.
revoke execute on function public.clan_contribute__ungated(uuid,bigint) from public;
revoke execute on function public.clan_contribute__ungated(uuid,bigint)
  from anon, authenticated, service_role;

-- ── 3. SELF-CHECK — the commit gate ─────────────────────────────────────────
-- apply_migration is atomic on this project, so a raise here is a refused
-- migration. Every property below is proven by EXECUTING the RPC inside a
-- subtransaction that is rolled back; none is proven by reading source text.
do $$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  c_cap  constant bigint := 10000000;
  v_u    uuid := gen_random_uuid();
  v_clan uuid;
  r1 jsonb; r2 jsonb;
  v_ledger_rows  int  := -1;
  v_ledger_sum   bigint := -1;
  v_ledger_user  uuid;
  v_treasury_end bigint := -1;
  v_kinds text[] := array['deposit','labour','tier','withdraw','upkeep','feast',
                          'board','rested','role','member','contribute','board_progress'];
  k text;
  v_bad text;
begin
  -- (a) STRUCTURAL — the wrapper survived, and the gate still owns the bucket.
  if to_regprocedure('public.clan_contribute(uuid,bigint)') is null then
    raise exception 'the gated wrapper clan_contribute(uuid,bigint) is gone — the A9 retrofit was destroyed';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'clan_contribute') !~ 'hr_rpc_gate' then
    raise exception 'clan_contribute no longer calls hr_rpc_gate — it is ungated';
  end if;

  -- (b) STRUCTURAL — the __ungated body is not client-executable.
  select string_agg(g, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.clan_contribute__ungated(uuid,bigint)', 'execute');
  if v_bad is not null then
    raise exception 'clan_contribute__ungated is executable by: % — revoke before grant', v_bad;
  end if;

  -- (c) STRUCTURAL — every kind in the union is accepted by the constraint.
  -- Restating the list in a `check` proves nothing; inserting each one does.
  begin
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_u, c_inst, 'authenticated', 'authenticated', 'contrib@probe.invalid');
    insert into public.clans (name, created_by) values ('__contrib_probe__', v_u)
      returning id into v_clan;
    insert into public.clan_members (clan_id, user_id, role) values (v_clan, v_u, 'leader');

    foreach k in array v_kinds loop
      begin
        insert into public.clan_ledger (clan_id, user_id, kind, qty)
          values (v_clan, v_u, k, 0);
      exception when others then
        raise exception 'clan_ledger_kind_check rejects kind %, which the journal vocabulary must accept', k;
      end;
    end loop;
    delete from public.clan_ledger where clan_id = v_clan;

    -- (d) BEHAVIOURAL — drive the real RPC as the real caller.
    perform set_config('request.jwt.claim.sub', v_u::text, true);

    -- CONTROL: an honest first contribution must still work. Without this the
    -- three PROPERTY assertions below would all pass on a function that
    -- refuses everything, which is the always-null-probe failure.
    r1 := public.clan_contribute(v_clan, c_cap);

    -- PROPERTY 1: a second call the same UTC day is refused by the day cap.
    r2 := public.clan_contribute(v_clan, c_cap);

    -- Two statements, not one: there is no builtin min(uuid) aggregate.
    select count(*), coalesce(sum(qty), 0)
      into v_ledger_rows, v_ledger_sum
      from public.clan_ledger where clan_id = v_clan and kind = 'contribute';
    select l.user_id into v_ledger_user
      from public.clan_ledger l where l.clan_id = v_clan and l.kind = 'contribute' limit 1;
    select treasury into v_treasury_end from public.clans where id = v_clan;

    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR999', message = 'clan_contribute fixture rollback';
  exception
    when sqlstate 'HR999' then
      perform set_config('request.jwt.claim.sub', '', true);
  end;

  -- CONTROL
  if (r1->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK INVALID: an honest contribution was refused — clan_contribute is now BROKEN, not fixed: %', r1;
  end if;
  if (r1->>'accepted')::bigint <> c_cap then
    raise exception 'SELF-CHECK INVALID: the first honest contribution was clamped to % of % — the cap is too tight to play against', r1->>'accepted', c_cap;
  end if;
  -- PROPERTY 1 · the day cap holds
  if (r2->>'ok') is distinct from 'false' or (r2->>'error') is distinct from 'daily_cap' then
    raise exception 'SELF-CHECK FAILED: a second same-day contribution was accepted — the per-day cap is not applied: %', r2;
  end if;
  -- PROPERTY 2 · the transfer is journalled, attributed, in the same transaction
  if v_ledger_rows <> 1 then
    raise exception 'SELF-CHECK FAILED: % clan_ledger rows of kind=''contribute'' after one accepted contribution (expected exactly 1)', v_ledger_rows;
  end if;
  if v_ledger_sum <> c_cap then
    raise exception 'SELF-CHECK FAILED: the journal says % but % was contributed', v_ledger_sum, c_cap;
  end if;
  if v_ledger_user is null then
    raise exception 'SELF-CHECK FAILED: the journal row names no user — the contribution is unattributed';
  end if;
  -- PROPERTY 3 · treasury moved by exactly the journalled amount, no more
  if v_treasury_end <> c_cap then
    raise exception 'SELF-CHECK FAILED: treasury moved by % against a journal of % — the books do not reconcile', v_treasury_end, c_cap;
  end if;

  raise notice 'CLAN CONTRIBUTE AUTHORITY OK — journalled, attributed, capped at %/member/UTC-day; honest first contribution still accepted.', c_cap;
end $$;
