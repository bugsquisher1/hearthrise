-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-daily-board.sql              STAGED — REVIEW ONLY, NOT APPLIED
--
-- ONE DAILY BOARD (game-designer, lane daily-board). A new player was shown two
-- daily systems that both asked "kill N / gather N": Daily Tasks
-- (hr_claim_daily) on Home and Daily Goals (hr_claim_goal) in the Quests modal.
-- The Goals half survives — a catalogue table, a read projection, one claim RPC
-- for daily and weekly. What it lacked is the server deciding WHICH goals are
-- offered: the client dealt three of nine, and hr_claim_goal paid any of them.
--
--   §1 hr_goal_board(weekly, at) — the three goals of the day (or ISO week),
--      a port of src/data/goal-catalogue.js pickBoard. A row is dealt only while
--      hr_goal_rewards catalogues it.
--   §2 hr_goal_state__ungated — RESTATED: answers `board` and a per-row
--      `offered`, so the client paints the server's board, never its own.
--   §3 hr_claim_goal__ungated — ONE anchored insert: an unoffered goal is
--      refused `not_offered` (journalled) before any lock, read or credit.
--
-- ── WHY THE LIVE CLIENT IS UNAFFECTED BY THE APPLY ─────────────────────────
-- pickBoard is the client's historical picker in exact integer form;
-- floor(seed*n/233280) equals the old floor((seed/233280)*n) for every seed
-- and every n in 9..12 (tests/daily-board.mjs sweeps the whole seed space). The
-- goals a live client already shows are exactly the ones §3 accepts.
--
-- ── WHAT CANNOT BE MINTED (for the Security review) ────────────────────────
-- No reward, target, counter or once-guard moves. §3 only REFUSES more: the
-- daily ceiling falls from all nine catalogued dailies (2,600 g + 2 gems) to
-- the three dealt, the weekly from ten rows (24,900 g) to three. No client value
-- is read: the board is a function of the server clock and the catalogue.
--
-- ── ORDER ──────────────────────────────────────────────────────────────────
-- Apply BEFORE the client half (it reads `board`; without it the client paints
-- its own pick, which is the same set). 2026-10-12-retire-daily-tasks.sql is
-- applied only AFTER the client half is live.
-- Reversibility: re-run 2026-08-23-modal-goal-claims.sql §7 for hr_goal_state
-- and remove the §3 block with the inverse replace; drop hr_goal_board.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_goal_rewards') is null then raise exception 'hr_goal_rewards missing'; end if;
  if to_regprocedure('public.hr_claim_goal__ungated(text,boolean,int,uuid)') is null then
    raise exception 'hr_claim_goal__ungated missing — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_iso_week_key(timestamptz)') is null
     or to_regprocedure('public.hr_goal_week_days(timestamptz)') is null then
    raise exception 'the goal week helpers are missing — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection missing — a not_offered refusal would be unobservable';
  end if;
end $$;

-- ── 1. THE BOARD ───────────────────────────────────────────────────────────
-- The pools are the authored order of legacy.js DAILY_GOAL_POOL /
-- WEEKLY_GOAL_POOL (tests/goal-catalogue-drift.mjs binds all three copies).
-- Seeds: the UTC date as YYYYMMDD, and the Monday-aligned week number
-- floor((epoch days + 3) / 7). Every product stays below 2^63.
create or replace function public.hr_goal_board(p_weekly boolean, p_at timestamptz default now())
returns text[] language plpgsql stable set search_path = public, pg_catalog as $$
declare
  c_daily  constant text[] := array['kill_any','kill_more','gather_logs','mine_ore','cook','fish','gold_500','plant','level_up'];
  c_weekly constant text[] := array['wk_kills','wk_smith','wk_craft','wk_harvest','wk_bury','wk_rare','wk_gold','wk_gather','wk_logs','wk_cook','wk_levels'];
  v_weekly boolean := coalesce(p_weekly, false);
  v_pool   text[];
  v_n      int;
  v_d      date := (coalesce(p_at, now()) at time zone 'utc')::date;
  v_seed   bigint;
  v_ok     boolean[] := '{}';
  v_used   boolean[] := '{}';
  v_offer  int := 0;
  v_out    text[] := '{}';
  v_idx    int;
  v_step   int;
begin
  v_pool := case when v_weekly then c_weekly else c_daily end;
  v_n := array_length(v_pool, 1);
  v_seed := case when v_weekly then ((v_d - date '1970-01-01') + 3) / 7
                 else to_char(v_d, 'YYYYMMDD')::bigint end;
  for i in 1..v_n loop
    v_ok[i] := exists (select 1 from public.hr_goal_rewards g
                        where g.goal_id = v_pool[i] and g.weekly = v_weekly);
    v_used[i] := false;
    if v_ok[i] then v_offer := v_offer + 1; end if;
  end loop;
  for k in 1..least(3, v_offer) loop
    v_seed := (v_seed * 9301 + 49297) % 233280;
    v_idx := ((v_seed * v_n) / 233280)::int;
    v_step := 0;
    while v_step < v_n and (v_used[v_idx + 1] or not v_ok[v_idx + 1]) loop
      v_idx := (v_idx + 1) % v_n;
      v_step := v_step + 1;
    end loop;
    exit when v_used[v_idx + 1] or not v_ok[v_idx + 1];
    v_used[v_idx + 1] := true;
    v_out := v_out || v_pool[v_idx + 1];
  end loop;
  return v_out;
end $$;
revoke execute on function public.hr_goal_board(boolean, timestamptz) from public, anon, authenticated, service_role;

-- ── 2. hr_goal_state__ungated — RESTATED with `board` and `offered` ─────────
-- Identical to 2026-08-23-modal-goal-claims.sql §7 except the two board reads,
-- the per-row `offered` and the top-level `board`. Every row is still projected:
-- the weekly ledger and the hearth band read counters of goals not on the board.
create or replace function public.hr_goal_state__ungated(p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_day   text := public.hr_utc_day_key(now());
  v_week  text := public.hr_iso_week_key(now());
  v_days  text[] := public.hr_goal_week_days(now());
  v_dboard text[] := public.hr_goal_board(false, now());
  v_wboard text[] := public.hr_goal_board(true, now());
  v_gold_day  bigint;
  v_gold_week bigint;
  v_out   jsonb := '[]'::jsonb;
  r       record;
  v_have  bigint;
  v_period text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select coalesce(sum(gold), 0) into v_gold_day from public.player_ledger
   where user_id = v_uid and slot = v_slot and gold > 0
     and at >= public.hr_goal_period_start(false, now());
  select coalesce(sum(gold), 0) into v_gold_week from public.player_ledger
   where user_id = v_uid and slot = v_slot and gold > 0
     and at >= public.hr_goal_period_start(true, now());

  for r in select * from public.hr_goal_rewards order by weekly, goal_id loop
    v_period := case when r.weekly then v_week else v_day end;
    if r.counter_kind = 'ledger_gold' then
      v_have := case when r.weekly then v_gold_week else v_gold_day end;
    elsif r.weekly then
      select coalesce(sum(value), 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'daily'
         and key = r.counter_key and period_key = any (v_days);
    else
      select coalesce(value, 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'daily'
         and key = r.counter_key and period_key = v_day;
    end if;
    v_out := v_out || jsonb_build_object(
      'goal_id', r.goal_id, 'weekly', r.weekly, 'period', v_period,
      'target', r.target, 'have', coalesce(v_have, 0),
      'complete', coalesce(v_have, 0) >= r.target,
      'offered', r.goal_id = any (case when r.weekly then v_wboard else v_dboard end),
      'claimed', exists (select 1 from public.player_progress
                          where user_id = v_uid and slot = v_slot and kind = 'quest'
                            and key = 'goal:' || r.goal_id and period_key = v_period),
      'gold', r.gold, 'gems', r.gems, 'xp', r.xp, 'items', r.items);
  end loop;

  return jsonb_build_object('ok', true, 'slot', v_slot, 'day_key', v_day,
    'week_key', v_week, 'goals', v_out,
    'board', jsonb_build_object('daily', to_jsonb(v_dboard), 'weekly', to_jsonb(v_wboard)));
end $$;
revoke execute on function public.hr_goal_state__ungated(int) from public, anon, authenticated, service_role;

-- ── 3. hr_claim_goal__ungated — the not_offered gate (anchored, once) ──────
-- Inserted directly after the wrong_period refusal: the catalogue row is known,
-- nothing is locked, read or credited yet. CR-tolerant; refuses to patch blind.
do $$
declare
  v_src text; v_new text;
  c_anchor constant text :=
    '  if p_weekly is not null and p_weekly is distinct from v_cat.weekly then' || chr(10) ||
    '    return jsonb_build_object(''ok'', false, ''outcome'', ''refused'', ''error'', ''wrong_period'',' || chr(10) ||
    '      ''goal'', p_goal_id, ''weekly'', v_cat.weekly);' || chr(10) ||
    '  end if;';
begin
  v_src := replace(pg_get_functiondef('public.hr_claim_goal__ungated(text,boolean,int,uuid)'::regprocedure), chr(13), '');
  if position('''not_offered''' in v_src) > 0 then
    raise notice 'hr_claim_goal__ungated already refuses not_offered — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_claim_goal__ungated wrong_period anchor did not match exactly once — refusing to patch blind';
  end if;
  v_new := replace(v_src, c_anchor, c_anchor || chr(10) ||
    '  -- 2026-10-11-daily-board.sql: only the goals on today''s / this week''s board pay.' || chr(10) ||
    '  if not (p_goal_id = any (public.hr_goal_board(v_cat.weekly, now()))) then' || chr(10) ||
    '    perform public.hr_record_rejection(v_uid, v_slot, ''goal_claim'', ''not_offered'',' || chr(10) ||
    '      jsonb_build_object(''goal'', p_goal_id), 1);' || chr(10) ||
    '    return jsonb_build_object(''ok'', false, ''outcome'', ''refused'', ''error'', ''not_offered'',' || chr(10) ||
    '      ''goal'', p_goal_id);' || chr(10) ||
    '  end if;');
  execute v_new;
end $$;
revoke execute on function public.hr_claim_goal__ungated(text, boolean, int, uuid) from public, anon, authenticated, service_role;

-- ── 4. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Properties proven by executing SQL. Row-writing probes live in a
-- subtransaction discarded by a sentinel raise (HR819) and are asserted gone.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000db-0000-0000-0000-0000000000d1';
  v_slot constant int  := 0;
  v_day  text := public.hr_utc_day_key(now());
  v_b    text[];
  v_w    text[];
  v_off  text;
  v_on   text;
  v_cat  public.hr_goal_rewards%rowtype;
  v_g0 bigint; v_g1 bigint;
  v_bad  int := 0;
  v_at   timestamptz;
begin
  -- (a) PINNED VECTORS from src/data/goal-catalogue.js boardAt (tests/daily-board.mjs
  --     re-derives them), so the SQL port and the JS picker are bound by execution.
  if public.hr_goal_board(false, timestamptz '2026-10-11 00:00:00+00') is distinct from array['gold_500','kill_any','level_up']
     or public.hr_goal_board(false, timestamptz '2026-10-11 23:59:59+00') is distinct from array['gold_500','kill_any','level_up']
     or public.hr_goal_board(false, timestamptz '2027-01-01 00:00:00+00') is distinct from array['kill_more','cook','gather_logs']
     or public.hr_goal_board(false, timestamptz '2028-02-29 18:00:00+00') is distinct from array['level_up','fish','mine_ore']
     or public.hr_goal_board(true,  timestamptz '2026-10-11 00:00:00+00') is distinct from array['wk_harvest','wk_gather','wk_cook']
     or public.hr_goal_board(true,  timestamptz '2027-02-28 06:00:00+00') is distinct from array['wk_smith','wk_rare','wk_logs']
     or public.hr_goal_board(true,  timestamptz '2028-02-29 18:00:00+00') is distinct from array['wk_craft','wk_gather','wk_levels'] then
    raise exception 'GATE(a): hr_goal_board disagrees with the pinned JS vectors (2026-10-11 daily %, weekly %)',
      public.hr_goal_board(false, timestamptz '2026-10-11 00:00:00+00'),
      public.hr_goal_board(true,  timestamptz '2026-10-11 00:00:00+00');
  end if;
  -- …and the week rolls over at Monday 00:00 UTC, the claim period's boundary.
  if public.hr_goal_board(true, timestamptz '2026-10-05 00:00:00+00')
       is distinct from public.hr_goal_board(true, timestamptz '2026-10-11 23:59:59+00')
     or public.hr_goal_board(true, timestamptz '2026-10-12 00:00:00+00')
       is distinct from public.hr_goal_board(true, timestamptz '2026-10-18 23:59:59+00')
     or public.hr_goal_board(true, timestamptz '2026-10-11 23:59:59+00')
       is not distinct from public.hr_goal_board(true, timestamptz '2026-10-12 00:00:00+00') then
    raise exception 'GATE(a): the weekly board does not hold Monday..Sunday and roll at Monday 00:00 UTC';
  end if;

  -- (b) TWO YEARS: three distinct, catalogued, period-matching goals every day.
  for i in 0..729 loop
    v_at := timestamptz '2026-10-11 12:00:00+00' + make_interval(days => i);
    v_b := public.hr_goal_board(false, v_at);
    v_w := public.hr_goal_board(true, v_at);
    if array_length(v_b, 1) is distinct from 3 or array_length(v_w, 1) is distinct from 3
       or (select count(distinct x) from unnest(v_b) x) <> 3
       or (select count(distinct x) from unnest(v_w) x) <> 3
       or exists (select 1 from unnest(v_b) x where not exists
                   (select 1 from public.hr_goal_rewards g where g.goal_id = x and not g.weekly))
       or exists (select 1 from unnest(v_w) x where not exists
                   (select 1 from public.hr_goal_rewards g where g.goal_id = x and g.weekly)) then
      v_bad := v_bad + 1;
    end if;
  end loop;
  if v_bad > 0 then
    raise exception 'GATE(b): % of 730 days deal a board that is short, repeated or uncatalogued', v_bad;
  end if;

  -- (c) GRANTS: the board is reachable only through the definer bodies.
  if has_function_privilege('authenticated', 'public.hr_goal_board(boolean,timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.hr_goal_board(boolean,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_goal_state__ungated(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_claim_goal__ungated(text,boolean,integer,uuid)', 'execute') then
    raise exception 'GATE(c): a board helper or an __ungated inner is client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_goal(text,boolean,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_goal_state(integer)', 'execute') then
    raise exception 'GATE(c): a goal wrapper lost its authenticated grant — the feature is dead';
  end if;
  if (select count(*) from regexp_matches(
        pg_get_functiondef('public.hr_claim_goal__ungated(text,boolean,int,uuid)'::regprocedure),
        'hr_goal_board\(v_cat\.weekly', 'g')) <> 1 then
    raise exception 'GATE(c): hr_claim_goal__ungated does not carry exactly one not_offered gate';
  end if;

  -- (d) EXECUTED: an unoffered goal is refused with nothing written; an offered
  --     one pays; hr_goal_state answers the board and flags it per row.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;
    v_b := public.hr_goal_board(false, now());
    select g.goal_id into v_off from public.hr_goal_rewards g
     where not g.weekly and g.counter_kind = 'daily' and not (g.goal_id = any (v_b))
     order by g.goal_id limit 1;
    select g.goal_id into v_on from public.hr_goal_rewards g
     where not g.weekly and g.counter_kind = 'daily' and g.gold > 0 and g.goal_id = any (v_b)
     order by g.goal_id limit 1;
    if v_off is null or v_on is null then
      raise exception 'GATE(d): today''s board % leaves no offered and unoffered daily-counter goal to probe', v_b;
    end if;
    -- The restated projection stays PERIOD-scoped: a lifetime row counts for nothing.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select distinct v_uid, v_slot, 'stat', g.counter_key, 999999, '', 'active'
        from public.hr_goal_rewards g where g.counter_kind = 'daily';
    v := public.hr_goal_state__ungated(v_slot);
    if exists (select 1 from jsonb_array_elements(v->'goals') e
                where (e->>'have')::bigint <> 0 and (e->>'goal_id') not in
                      (select goal_id from public.hr_goal_rewards where counter_kind = 'ledger_gold')) then
      raise exception 'GATE(d): hr_goal_state graded a LIFETIME counter: %', v->'goals';
    end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'daily', g.counter_key, max(g.target), v_day, 'active'
        from public.hr_goal_rewards g
       where not g.weekly and g.counter_kind = 'daily'
       group by g.counter_key;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_goal__ungated(v_off, false, v_slot, null);
    if v->>'error' is distinct from 'not_offered' then
      raise exception 'GATE(d): an unoffered, complete goal (%) was not refused not_offered: %', v_off, v;
    end if;
    if exists (select 1 from public.player_progress where user_id = v_uid and kind = 'quest')
       or exists (select 1 from public.player_ledger where user_id = v_uid) then
      raise exception 'GATE(d): the not_offered refusal wrote a claim or ledger row';
    end if;
    select * into v_cat from public.hr_goal_rewards where goal_id = v_on;
    v := public.hr_claim_goal__ungated(v_on, false, v_slot, null);
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if coalesce(v->>'ok', '') <> 'true' or v_g1 - v_g0 <> v_cat.gold then
      raise exception 'GATE(d): an offered, complete goal (%) did not pay its % gold: %', v_on, v_cat.gold, v;
    end if;
    v := public.hr_goal_state__ungated(v_slot);
    if coalesce(v->>'ok', '') <> 'true'
       or (v->'board'->'daily') is distinct from to_jsonb(v_b)
       or (v->'board'->'weekly') is distinct from to_jsonb(public.hr_goal_board(true, now()))
       or exists (select 1 from jsonb_array_elements(v->'goals') e
                   where (e->>'offered')::boolean is distinct from
                         ((e->>'goal_id') = any (public.hr_goal_board((e->>'weekly')::boolean, now()))))
       or jsonb_array_length(v->'goals') <> (select count(*) from public.hr_goal_rewards) then
      raise exception 'GATE(d): hr_goal_state does not answer the board it enforces: %', v->'board';
    end if;
    raise exception using errcode = 'HR819', message = 'daily-board §4 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;

  -- (e) grant hygiene stays clean.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0
         or jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(e): grant hygiene is not clean: %', v_gh;
      end if;
    end;
  end if;

  raise notice 'daily-board: pinned vectors, 730-day sweep, grants, not_offered refusal, '
               'offered credit and the board projection all green';
end $$;
