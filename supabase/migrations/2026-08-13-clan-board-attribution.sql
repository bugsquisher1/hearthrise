-- ============================================================================
-- 2026-08-13-clan-board-attribution.sql   — F3 (P1). STAGED, NOT APPLIED.
--
-- ⚠ APPLY 2026-08-13-clan-contribute-authority.sql FIRST. That file owns the
--   widened clan_ledger_kind_check that admits 'board_progress'. §0 here fails
--   closed without it rather than installing an RPC whose journal INSERT would
--   throw on every call — which would take the clan board offline.
--
-- WHAT IS OPEN (proven by execution against production, rolled back, by the
-- Security Engineer 2026-08-13):
--
--   clan_board_progress__ungated(p_clan_id, p_counter, p_delta) clamps p_delta
--   to 500 per call and writes clan_board.progress. There is NO ledger row and
--   NO per-user record of it anywhere in the schema — the delta is a client
--   integer that lands in a shared clan counter and leaves no trace of who
--   supplied it. hr_rpc_gate allows 60 calls a minute, so one member can move a
--   shared counter 30,000 a minute, forever.
--
--   THE CROSSOVER: clan_board_claim() then pays cp to the claimant and
--   `standing` to the clan — and standing is what gates clan_tier_up(). The
--   claim IS journalled, so the ledger records the PAYOUT and nothing at all
--   about the fabricated input. Executed in one transaction: standing
--   882 → 2037, cp 2473 → 5708, ledger rows naming who supplied the progress: 0.
--   That is worse than an unjournalled write: the books look complete.
--
-- WHAT THIS FILE DOES
--   (a) JOURNAL the delta to clan_ledger with user_id and the counter name, in
--       the same transaction as the clan_board write. `kind='board_progress'`,
--       `item_id = p_counter`, `qty = the amount charged`. clan_board_claim's
--       existing `kind='board'` payout row is untouched, so a board task now
--       has an input trail and an output trail that can be reconciled against
--       each other — which is the property that was missing.
--   (b) A PER-MEMBER PER-UTC-DAY CAP read from that ledger, same shape as
--       clan_deposit and as the companion contribute file.
--   (c) Journal NOTHING and charge NOTHING when the call moved no row (an
--       unknown counter, or every matching task already at target). A no-op
--       must not consume an honest player's budget, and it must not put a row
--       in an append-only journal that records no transfer.
--
-- WHAT THIS FILE DOES NOT DO: make the progress HONEST. p_delta is still a
-- client-authored number describing gameplay the server did not simulate. It
-- becomes honest when the progression domain moves server-side and the board
-- counters are derived from hr_apply's ledger instead of posted by the client.
-- Until then this is attribution and a bound, which is what was asked for, and
-- it is stated as that rather than as a fix.
--
-- BALANCE (Game Designer owns this number):
--   c_call_clamp = 500   — UNCHANGED from the live body.
--   c_day_clamp  = 5000  — NEW: per member, per UTC day. Chosen against the
--                  real task table: daily base_targets are 400–1000 and weekly
--                  are 4000–5000, so ONE member's daily budget alone still
--                  completes any daily task outright and clears a weekly inside
--                  one day. It is 10 calls' worth, against a gate that allows
--                  60 a minute. Effect on the exploit: 43,200,000/day →
--                  5,000/member/day, a factor of 8,640.
--
-- REVERSIBILITY: one `create or replace` of one function body. To undo,
-- re-apply the clan_board_progress__ungated definition from
-- 2026-08-09-clan-governance.sql. No player row is read, written or migrated;
-- the gated wrapper clan_board_progress(uuid,text,int) is not touched.
--
-- GUARDED BY: tests/clan-journal-guard.mjs (behavioural, PGlite/PG18),
-- mutation-proven — see that file's header.
-- ============================================================================

-- ── 0. PRECONDITIONS — fail closed ──────────────────────────────────────────
do $$
declare v_ok boolean; v_u uuid; v_clan uuid;
begin
  if to_regprocedure('public.clan_board_progress__ungated(uuid,text,integer)') is null then
    raise exception 'clan_board_progress__ungated(uuid,text,integer) is missing — apply 2026-08-11-authenticated-surface-lockdown.sql (the A9 retrofit) first';
  end if;
  if to_regclass('public.clan_board') is null then
    raise exception 'clan_board is missing — apply 2026-08-09-clan-governance.sql first';
  end if;
  -- The cap reads clan_ledger, so the client must not be able to write it.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'clan_ledger' and cmd <> 'SELECT') then
    raise exception 'clan_ledger has a non-SELECT client policy — a ledger-derived cap would be forgeable; refusing to install one';
  end if;
  -- 'board_progress' must already be legal, or every journal INSERT below
  -- throws and the clan board goes offline. Asserted by TRYING it, not by
  -- reading the constraint text: a constraint whose expression mentions the
  -- word is not the same claim as a constraint that accepts the value.
  --
  -- clan_ledger.clan_id is an FK to clans(id), so the probe needs a REAL clan.
  -- Inserting against a made-up uuid would fail with a foreign-key violation on
  -- a database where the kind is perfectly legal — a probe that is always
  -- false is the same defect as one that is always null.
  begin
    v_u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_u, '00000000-0000-0000-0000-000000000000'::uuid,
              'authenticated', 'authenticated', 'kindprobe@probe.invalid');
    insert into public.clans (name, created_by)
      values ('__kind_probe__', v_u) returning id into v_clan;
    begin
      insert into public.clan_ledger (clan_id, user_id, kind, qty)
        values (v_clan, v_u, 'board_progress', 0);
      v_ok := true;
    exception when check_violation then
      v_ok := false;
    end;
    raise exception using errcode = 'HR998', message = 'kind probe rollback';
  exception when sqlstate 'HR998' then
    null;
  end;
  -- CONTROL on the probe itself: if the clan was never created the probe never
  -- ran, and `v_ok` would be reporting on nothing.
  if v_clan is null then
    raise exception 'SELF-CHECK INVALID: the kind probe could not create its fixture clan, so it proved nothing about clan_ledger_kind_check';
  end if;
  if not v_ok then
    raise exception 'clan_ledger_kind_check does not accept ''board_progress'' — apply 2026-08-13-clan-contribute-authority.sql first (it owns the journal vocabulary)';
  end if;
end $$;

-- ── 1. THE RPC ──────────────────────────────────────────────────────────────
create or replace function public.clan_board_progress__ungated(p_clan_id uuid, p_counter text, p_delta integer)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  c_call_clamp constant int := 500;    -- unchanged from the live body
  c_day_clamp  constant int := 5000;   -- NEW: per member, per UTC day
  v_uid   uuid := auth.uid();
  v_day   text := public.hr_utc_day_key();
  v_week  text := public.hr_utc_week_key();
  v_spent bigint;
  v_budget int;
  v_n     int;
  v_rows  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.clan_members
                  where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_counter is null or p_delta is null or p_delta <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;

  -- Taken FIRST, before any row is touched, and taken by no other function —
  -- so it cannot appear in a waits-for cycle with the row locks that
  -- clan_board_claim takes in the opposite order (clan_board, then
  -- clan_members, then clans). See the same note in the contribute file.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr:clan_board_progress:' || v_uid::text, 0));

  select coalesce(sum(l.qty), 0) into v_spent
    from public.clan_ledger l
   where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'board_progress'
     and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

  v_budget := greatest(0, c_day_clamp - least(v_spent, c_day_clamp))::int;
  if v_budget <= 0 then
    return jsonb_build_object('ok', false, 'error', 'daily_cap',
      'spent_today', v_spent, 'day_cap', c_day_clamp,
      'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
  end if;

  v_n := least(p_delta, c_call_clamp, v_budget);

  -- v_n is added to EVERY still-open task on this counter — a counter can back
  -- both a daily and a weekly task and both should move. The member is charged
  -- v_n ONCE, not once per task: the budget prices the ACTIVITY the player is
  -- claiming to have done, and doing it once should not cost double because the
  -- board happens to be asking for it twice.
  update public.clan_board b
     set progress = least(b.target, b.progress + v_n)
    from public.hr_castle_board_tasks t
   where b.clan_id = p_clan_id
     and b.period_key in (v_day, v_week)
     and t.task_id = b.task_id
     and t.counter = p_counter
     and b.progress < b.target;
  get diagnostics v_rows = row_count;

  -- ── THE JOURNAL ──────────────────────────────────────────────────────────
  -- Only when something actually moved. One row per accepted submission, not
  -- per tick; a member is capped at c_day_clamp / 1 rows a day in the worst
  -- case and the RPC gate bounds the rest.
  if v_rows > 0 then
    insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty)
      values (p_clan_id, v_uid, 'board_progress', p_counter, v_n);
  end if;

  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = v_uid;

  return jsonb_build_object('ok', true,
    'accepted', case when v_rows > 0 then v_n else 0 end,
    'requested', p_delta,
    'tasks_moved', v_rows,
    'spent_today', v_spent + case when v_rows > 0 then v_n else 0 end,
    'day_cap', c_day_clamp,
    'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
end $$;

revoke execute on function public.clan_board_progress__ungated(uuid,text,integer) from public;
revoke execute on function public.clan_board_progress__ungated(uuid,text,integer)
  from anon, authenticated, service_role;

-- ── 2. SELF-CHECK — the commit gate ─────────────────────────────────────────
do $$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  c_day  constant int := 5000;
  v_u    uuid := gen_random_uuid();
  v_clan uuid;
  v_counter text;
  v_task    text;
  v_target  bigint;
  r_first jsonb; r_over jsonb; r_noop jsonb;
  v_rows_first int := -1;
  v_rows_noop  int := -1;
  v_sum   bigint := -1;
  v_user  uuid;
  v_prog  bigint := -1;
  i int;
  v_bad text;
begin
  if to_regprocedure('public.clan_board_progress(uuid,text,integer)') is null then
    raise exception 'the gated wrapper clan_board_progress(uuid,text,integer) is gone — the A9 retrofit was destroyed';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'clan_board_progress') !~ 'hr_rpc_gate' then
    raise exception 'clan_board_progress no longer calls hr_rpc_gate — it is ungated';
  end if;
  select string_agg(g, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.clan_board_progress__ungated(uuid,text,integer)', 'execute');
  if v_bad is not null then
    raise exception 'clan_board_progress__ungated is executable by: % — revoke before grant', v_bad;
  end if;

  select t.task_id, t.counter into v_task, v_counter
    from public.hr_castle_board_tasks t
   where t.live and not t.weekly
   order by t.task_id limit 1;
  if v_task is null then
    raise exception 'SELF-CHECK INVALID: no live daily board task exists to drive the probe against — the probe would prove nothing';
  end if;

  begin
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_u, c_inst, 'authenticated', 'authenticated', 'board@probe.invalid');
    insert into public.clans (name, created_by) values ('__board_probe__', v_u)
      returning id into v_clan;
    insert into public.clan_members (clan_id, user_id, role) values (v_clan, v_u, 'leader');

    -- A target far above the day cap, so the cap — not the target — is what
    -- stops the loop. If the task filled up first the probe would pass on a
    -- function with no cap at all.
    v_target := c_day * 10;
    insert into public.clan_board (clan_id, task_id, period_key, target, progress)
      values (v_clan, v_task, public.hr_utc_day_key(), v_target, 0);

    perform set_config('request.jwt.claim.sub', v_u::text, true);

    -- CONTROL · an honest submission is still accepted
    r_first := public.clan_board_progress(v_clan, v_counter, 500);
    select count(*) into v_rows_first
      from public.clan_ledger where clan_id = v_clan and kind = 'board_progress';

    -- PROPERTY · the day cap holds under repetition. 20 more calls of 500 is
    -- 10,000 requested against a 5,000 cap.
    for i in 1..20 loop
      r_over := public.clan_board_progress(v_clan, v_counter, 500);
    end loop;

    -- Two statements, not one: there is no builtin min(uuid) aggregate.
    select coalesce(sum(qty), 0) into v_sum
      from public.clan_ledger where clan_id = v_clan and kind = 'board_progress';
    select l.user_id into v_user
      from public.clan_ledger l where l.clan_id = v_clan and l.kind = 'board_progress' limit 1;
    select progress into v_prog
      from public.clan_board where clan_id = v_clan and task_id = v_task;

    -- PROPERTY · a call that moves no row journals nothing and charges nothing
    delete from public.clan_ledger where clan_id = v_clan;
    r_noop := public.clan_board_progress(v_clan, '__no_such_counter__', 500);
    select count(*) into v_rows_noop
      from public.clan_ledger where clan_id = v_clan and kind = 'board_progress';

    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR999', message = 'clan_board_progress fixture rollback';
  exception when sqlstate 'HR999' then
    perform set_config('request.jwt.claim.sub', '', true);
  end;

  -- CONTROL
  if (r_first->>'ok') is distinct from 'true' or (r_first->>'accepted')::int <> 500 then
    raise exception 'SELF-CHECK INVALID: an honest 500 submission was not accepted — clan_board_progress is now BROKEN, not fixed: %', r_first;
  end if;
  if v_rows_first <> 1 then
    raise exception 'SELF-CHECK FAILED: % ledger rows after one accepted submission (expected exactly 1) — the delta is still unattributed', v_rows_first;
  end if;
  -- PROPERTY 1 · attributed
  if v_user is null then
    raise exception 'SELF-CHECK FAILED: a journal row names no user — progress is still unattributable';
  end if;
  -- PROPERTY 2 · the day cap bounds the total, and the books agree with it
  if v_sum > c_day then
    raise exception 'SELF-CHECK FAILED: the journal totals % against a day cap of % — the cap is not applied', v_sum, c_day;
  end if;
  if v_prog > c_day then
    raise exception 'SELF-CHECK FAILED: clan_board.progress reached % against a day cap of % — progress moved without being charged', v_prog, c_day;
  end if;
  if v_prog <> v_sum then
    raise exception 'SELF-CHECK FAILED: clan_board.progress is % but the journal accounts for % — the input trail does not reconcile', v_prog, v_sum;
  end if;
  if (r_over->>'error') is distinct from 'daily_cap' then
    raise exception 'SELF-CHECK FAILED: the 21st submission was not refused by the day cap: %', r_over;
  end if;
  -- PROPERTY 3 · a no-op writes nothing
  if v_rows_noop <> 0 then
    raise exception 'SELF-CHECK FAILED: a submission that moved no task still wrote % journal row(s)', v_rows_noop;
  end if;
  if (r_noop->>'accepted')::int <> 0 then
    raise exception 'SELF-CHECK FAILED: a submission that moved no task was still charged: %', r_noop;
  end if;

  raise notice 'CLAN BOARD ATTRIBUTION OK — every accepted delta is journalled with a user_id, capped at %/member/UTC-day, and reconciles against clan_board.progress.', c_day;
end $$;
