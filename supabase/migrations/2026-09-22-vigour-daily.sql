-- ════════════════════════════════════════════════════════════════════════════
-- RESTATEMENT-DEBT-ACK: adds 1 anchored patch to hr_state_of (chain depth 4 since the 2026-09-14 restatement). Same trade as 2026-09-22-hunt-stance-stop.sql, whose header states it in full: the anchor is asserted exactly-once and RAISES otherwise, the spliced text is 4 lines, and a restatement of hr_state_of is owed before the next patch on it. Named as debt in this lane's report.
-- 2026-09-22-vigour-daily.sql — THE DAILY LIMITER, AND NOWHERE NEW TO PUT IT.
--
-- docs/design/HUNTS_AND_ANALYZER.md §4: Vigour is a daily budget of PAID
-- HUNTING MINUTES. Not a bar that blocks play — the line past which a hunt
-- stops paying full rate.
--
-- ── NO NEW TABLE AND NO NEW COLUMN (design §4.2) ────────────────────────────
--   player_progress(kind='daily', key='ev:vigour_min',    period_key=<utc day>)
--   player_progress(kind='daily', key='ev:vigour_rem_ms', period_key=<utc day>)
-- That is the existing daily-counter machinery, the existing c_max_progress_add
-- clamp, the existing per-period retention and the existing projection. A new
-- table would be a second place a number a player can act on lives, and two
-- places can disagree — the class Tyler ruled on 2026-09-14.
--
-- The two keys are ONE number — a quotient and its remainder — and §1(4) is the
-- only thing that ever adds them back together. That is finding S-1's fix: a
-- charge floored PER WINDOW made the daily limiter a function of the settle
-- cadence, so the remainder is now kept rather than discarded. §3 GATE(c7)
-- proves the conservation by execution.
--
-- ── THE GRANT IS DERIVED, NOT STORED (design §4.1) ──────────────────────────
-- `greatest(720, hr_offline_cap_ms / 60000)`. Three properties follow, and no
-- other shape has all three: nobody loses time they can already earn today (the
-- grant is by construction at least the offline cap they already play to), the
-- renown and property perks that extend offline time now extend the hunt budget
-- too instead of becoming obsolete, and there is NO NEW BALANCE NUMBER to tune.
-- A stored grant would drift from the perks it was derived from the first time a
-- player earned a rung.
--
-- ── THIS FILE SPENDS NO GOLD ────────────────────────────────────────────────
-- Refills are 2026-09-22-vigour-refill.sql, which is a money surface and takes
-- its own Security GO plus Tyler's four numbers (design §4.6). This file is the
-- meter: the read, the projection and the ceiling. Slice 1 ships it READ-ONLY.
--
-- LANE C. STAGED, NOT APPLIED. The engine half (accrual.js charging the counter)
-- rides the same review.
--
-- REVERSIBILITY
--   drop function public.hr_vigour_of(uuid,int);
--   -- re-apply 2026-09-14-hr-state-of-restatement.sql to drop the projection.
--   -- The player_progress rows are ordinary daily rows and age out on their own.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_offline_cap_ms(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_offline_cap_ms is absent - apply 2026-08-11-accrual.sql FIRST'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'PRECONDITION: hr_utc_day_key is absent - apply 2026-08-08-clan-seat.sql FIRST'; end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_state_of is absent'; end if;
end $$;

-- ── 1. hr_vigour_of — THE WHOLE METER IN ONE READ ──────────────────────────
-- Returns { grant_min, bought_min, budget_min, spent_min, remaining_min,
--           refills, refills_max, dry_mult, day_key, ceiling_min }.
--
-- ⚠ EVERY NUMBER IS DERIVED OR READ FROM A SERVER-OWNED ROW. Nothing on the
--   wire reaches it: the signature takes a user and a slot and nothing else, so
--   a forged call returns another shape of the caller's own data (design §5).
--
-- ⚠ THE CEILING IS A FUSE, NOT BALANCE. 22 hours of paid time in one UTC day is
--   the most any combination of a grant and five refills may produce, so "two
--   hours a day gold cannot buy" survives a mis-seeded perk table and any future
--   source of offline cap. It is `least`-ed LAST, after everything.
--
-- STABLE, not volatile: it writes nothing. The Analyzer is a read and so is
-- this; neither can be replayed into a gain.
create or replace function public.hr_vigour_of(p_user uuid, p_slot int default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  -- THE FLOOR, in minutes. 720 = 12 h = hr_offline_cap_ms's base for everybody,
  -- which is what makes "nobody loses what they can earn today" a property
  -- rather than a hope. Mirrors src/core/hunt.js VIGOUR_FLOOR_MIN.
  c_floor_min   constant int := 720;
  -- The hard daily ceiling on PAID minutes. src/core/hunt.js VIGOUR_CEILING_MIN.
  c_ceiling_min constant int := 22 * 60;
  -- Minutes one refill adds, and how many may be bought. The PRICE is not here
  -- and is not in this file at all - it is a catalogue row in the refill
  -- migration, because a price is money and money is tuned by data.
  c_refill_min  constant int := 120;
  c_refill_max  constant int := 5;
  v_day       text := public.hr_utc_day_key(now());
  v_grant     int;
  v_refills   int;
  v_bought    int;
  v_budget    int;
  v_spent     bigint;
  -- The day's charge in MILLISECONDS, before the single division. bigint on
  -- purpose: 22 h is 79,200,000 and an overspent night is larger still.
  v_spent_ms  bigint;
begin
  if p_user is null then return null; end if;

  -- (1) THE DERIVED GRANT. `hr_offline_cap_ms` is the server's own answer to
  --     "how long may this character be paid for while away"; Vigour is the
  --     same entitlement counted in minutes, so there is ONE ladder.
  v_grant := greatest(c_floor_min,
    (coalesce(public.hr_offline_cap_ms(p_user, coalesce(p_slot, 0)), 0) / 60000)::int);

  -- (2) WHAT WAS BOUGHT TODAY, from the append-only daily counter the refill
  --     verb increments - never from a column that verb maintains. A counter a
  --     purchase writes and a read trusts is one place; a second copy is where
  --     "you bought five" and "you bought three" come from.
  select coalesce(value, 0)::int into v_refills from public.player_progress
   where user_id = p_user and slot = coalesce(p_slot, 0)
     and kind = 'daily' and key = 'ev:vigour_refills' and period_key = v_day;
  v_refills := least(c_refill_max, greatest(0, coalesce(v_refills, 0)));
  v_bought  := v_refills * c_refill_min;

  -- (3) THE BUDGET. The ceiling is applied HERE and only here, so every reader
  --     of this function sees the same capped number.
  v_budget := least(c_ceiling_min, v_grant + v_bought);

  -- (4) WHAT HAS BEEN SPENT TODAY. Written by the engine out of a SETTLED
  --     window, from the same `ms` the payout was computed from, in the same
  --     transaction - so a window cannot pay and not charge (design §5).
  --
  -- ⚠ TWO ROWS, ONE NUMBER, AND THE DIVISION HAPPENS HERE (finding S-1).
  --   The engine writes the window's charge as a QUOTIENT ('ev:vigour_min',
  --   whole minutes) and a REMAINDER ('ev:vigour_rem_ms', the sub-minute ms it
  --   used to DISCARD). Summing the remainders and dividing ONCE, at read time,
  --   is what makes the charge conserve under subdivision:
  --
  --       floor(sum(w) / 60000) = sum(floor(w/60000)) + floor(sum(w mod 60000)/60000)
  --
  --   so a span cut into forty 90 s windows and the same span settled once
  --   charge the SAME number of minutes. Before this, `vigourChargeMin` floored
  --   PER WINDOW and threw the remainder away, and the daily limiter was a
  --   function of the poll cadence: 40 minutes for an hour at 90 s, ZERO for an
  --   hour of sub-minute set_activity collects. See §3 GATE(c7), which proves
  --   the property by EXECUTION rather than by this comment, and
  --   docs/planning/SEC_HUNTS_M6_2026-09-22.md S-1.
  --
  -- ⚠ WHY NOT RAW MS IN ONE ROW: hr_apply clamps a single progress `add` at
  --   c_max_progress_add = 1,000,000 and a capped 24 h window is 86,400,000 ms.
  --   One row would refuse the delta and cost the player their whole night.
  select coalesce(sum(case when key = 'ev:vigour_min' then value else 0 end), 0) * 60000
       + coalesce(sum(case when key = 'ev:vigour_rem_ms' then value else 0 end), 0)
    into v_spent_ms
    from public.player_progress
   where user_id = p_user and slot = coalesce(p_slot, 0)
     and kind = 'daily' and key in ('ev:vigour_min', 'ev:vigour_rem_ms')
     and period_key = v_day;
  v_spent := greatest(0, coalesce(v_spent_ms, 0)) / 60000;

  return jsonb_build_object(
    'day_key',       v_day,
    'grant_min',     v_grant,
    'refills',       v_refills,
    'refills_max',   c_refill_max,
    'bought_min',    v_bought,
    'budget_min',    v_budget,
    'ceiling_min',   c_ceiling_min,
    'spent_min',     v_spent,
    -- NEVER NEGATIVE. The panel renders a bar; a negative remaining would be a
    -- number a player cannot act on rendered as though they could.
    'remaining_min', greatest(0, v_budget - v_spent),
    -- The rate past the budget. Reported so the panel's "hunts pay a quarter"
    -- sentence comes from the server rather than from a client constant that
    -- could disagree with the engine that actually paid.
    'dry_mult',      0.25);
end $$;

comment on function public.hr_vigour_of(uuid, int) is
  'THE VIGOUR METER (2026-09-22). Derived grant (greatest(720, offline cap in minutes)) + bought minutes, capped at the 22h daily ceiling, minus what a settled window has charged. The charge is read as a QUOTIENT (ev:vigour_min) plus a REMAINDER (ev:vigour_rem_ms) and divided ONCE here, so it conserves under window subdivision (finding S-1): an hour costs an hour however the hour was cut up. READ-ONLY: it writes nothing, so it cannot be replayed into a gain. Mirrors src/core/hunt.js vigourBudgetMin and vigourCharge.';

-- Engine-only, like hr_offline_cap_ms and hr_bestiary_of beside it. The client
-- never asks: the number reaches the browser on the envelope (section 2), which
-- is the only surface allowed to state a value a player acts on.
revoke execute on function public.hr_vigour_of(uuid, int) from public;
revoke execute on function public.hr_vigour_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_vigour_of(uuid, int) to hr_engine;

-- ── 2. hr_state_of — PROJECT the meter, top-level ──────────────────────────
-- ONE anchored patch at the `total_level` anchor (the one 2026-09-14-gem-unlock
-- -buy.sql and four others use, which survives insertion because each appends
-- AFTER the anchor text). NO-OP on re-apply.
--
-- WHY THE ENVELOPE: the meter is a number a player ACTS on - it decides whether
-- to keep hunting tonight - so it is rendered from the server's projection and
-- REPLACED by each envelope, never predicted forward (CLAUDE.md §6). A client
-- that counted its own minutes down between settles would be the phantom-seed
-- bug with a different noun.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'vigour', public.hr_vigour_of$q$) > 0 then
    raise notice 'hr_state_of already projects vigour - patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once - refusing to patch a body this file cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
    -- vigour (2026-09-22): the daily hunting budget, derived and spent. One
    -- object, so the panel renders a bar and a sentence without holding any
    -- arithmetic of its own. Two indexed reads on player_progress, both on the
    -- (user, slot, kind, key, period) leading edge.
    'vigour', public.hr_vigour_of(p_user, v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope carries the vigour meter';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Probe-scoped: every row belongs to the synthetic user this block created, and
-- the subtransaction is discarded by a sentinel raise.
do $$
declare
  v_uid constant uuid := '00000000-0000-4000-8000-0000b5510002';
  v_v   jsonb;
  v_r   jsonb;
  v_i   int;
  v_day text := public.hr_utc_day_key(now());
begin
  -- (a) THE GRANT IS DERIVED, AND THE FLOOR HOLDS. Asserted against
  --     hr_offline_cap_ms itself, so the two cannot drift: if the cap ever rises
  --     above 12 h for a probe character, the grant must rise with it.
  if strpos(replace(pg_get_functiondef('public.hr_vigour_of(uuid,int)'::regprocedure), chr(13), ''),
            'hr_offline_cap_ms') = 0 then
    raise exception 'GATE(a): hr_vigour_of does not read hr_offline_cap_ms - the grant has become a second ladder';
  end if;

  -- (b) NO PRICE LIVES IN THIS FILE'S READ. The refill LADDER is money and
  --     belongs to a catalogue under a Security GO; a gold number typed into the
  --     meter would be a second copy of it. Comments are stripped first, for the
  --     reason 2026-09-14-gem-unlock-buy.sql GATE(a) states: the prose here
  --     cites 720 and 22 and an assertion that a comment cannot mention a number
  --     would be paid for by deleting the explanation.
  if (select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_vigour_of') ~ 'gold' then
    raise exception 'GATE(b): hr_vigour_of mentions gold - the meter must not know a price';
  end if;

  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;

    -- (c1) A FRESH CHARACTER HAS THE FLOOR, HAS SPENT NOTHING, AND HAS BOUGHT
    --      NOTHING. This is the shipped default, not something the probe set up.
    v_v := public.hr_vigour_of(v_uid, 0);
    if (v_v->>'grant_min')::int < 720 then
      raise exception 'GATE(c1): the grant is % min, below the 720 floor - a player would lose time they can already earn today', v_v->>'grant_min'; end if;
    if (v_v->>'spent_min')::bigint <> 0 or (v_v->>'refills')::int <> 0 then
      raise exception 'GATE(c1): a fresh character is not at zero: %', v_v; end if;
    if (v_v->>'remaining_min')::int <> (v_v->>'budget_min')::int then
      raise exception 'GATE(c1): remaining <> budget on an unspent day: %', v_v; end if;

    -- (c2) THE ENVELOPE CARRIES THE SAME OBJECT. A projection the read does not
    --      honour is worse than no projection: the player would act on one
    --      number while the engine charged against another.
    if (public.hr_state_of(v_uid, 0)->'vigour') is distinct from v_v then
      raise exception 'GATE(c2): hr_state_of and hr_vigour_of disagree about the meter';
    end if;

    -- (c3) SPENDING MOVES THE METER, THROUGH THE ORDINARY DAILY COUNTER AND
    --      THROUGH hr_apply - the only writer. Not an UPDATE this block wrote:
    --      the point is that the engine's ordinary progress op IS the charge.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'progress', jsonb_build_array(jsonb_build_object(
          'kind','daily','key','ev:vigour_min','period', v_day, 'add', 60, 'state','active')),
        'journal', jsonb_build_object('kind','admin','intent','vigour_probe')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c3): the daily charge was refused: %', v_r; end if;
    v_v := public.hr_vigour_of(v_uid, 0);
    if (v_v->>'spent_min')::bigint <> 60 then
      raise exception 'GATE(c3): 60 charged minutes read back as %', v_v->>'spent_min'; end if;
    if (v_v->>'remaining_min')::int <> (v_v->>'budget_min')::int - 60 then
      raise exception 'GATE(c3): remaining did not fall by the charge: %', v_v; end if;

    -- (c7) THE CHARGE CONSERVES UNDER WINDOW SUBDIVISION (finding S-1, P0).
    --      THE PROPERTY THIS WHOLE LIMITER RESTS ON, asserted by EXECUTING the
    --      engine's own two-row charge through hr_apply rather than by reading
    --      the comment above §1(4). An hour of hunting must cost an hour of
    --      Vigour however the hour was cut up - and before this fix it did not:
    --      forty 90 s windows charged 40 minutes and sixty-one 59 s windows
    --      charged ZERO, because the sub-minute remainder was thrown away once
    --      per window. A limiter rounded toward the player is a limiter that
    --      does not exist (docs/planning/SEC_HUNTS_M6_2026-09-22.md S-1).
    --
    --      Each iteration proposes exactly what computeAccrual proposes for
    --      that window: the whole minutes on 'ev:vigour_min' and the sub-minute
    --      remainder on 'ev:vigour_rem_ms'. Nothing here is an UPDATE this
    --      block wrote - hr_apply is the only writer, as in (c3).
    for v_i in 1..40 loop   -- 40 x 90 s = one hour at the ordinary poll cadence
      v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
        gen_random_uuid(), jsonb_build_object(
          'progress', jsonb_build_array(
            jsonb_build_object('kind','daily','key','ev:vigour_min','period', v_day, 'add', 1, 'state','active'),
            jsonb_build_object('kind','daily','key','ev:vigour_rem_ms','period', v_day, 'add', 30000, 'state','active')),
          'journal', jsonb_build_object('kind','admin','intent','vigour_probe')));
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(c7): the 90 s charge was refused on window %: %', v_i, v_r; end if;
    end loop;
    v_v := public.hr_vigour_of(v_uid, 0);
    if (v_v->>'spent_min')::bigint <> 60 + 60 then
      raise exception 'GATE(c7): forty 90 s windows paid one hour and charged % minutes on top of the first 60 - the charge is a function of the POLL CADENCE, not of elapsed time', (v_v->>'spent_min')::bigint - 60;
    end if;

    for v_i in 1..61 loop   -- 61 x 59 s: EVERY window is under a minute
      v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
        gen_random_uuid(), jsonb_build_object(
          'progress', jsonb_build_array(
            jsonb_build_object('kind','daily','key','ev:vigour_rem_ms','period', v_day, 'add', 59000, 'state','active')),
          'journal', jsonb_build_object('kind','admin','intent','vigour_probe')));
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(c7): the 59 s charge was refused on window %: %', v_i, v_r; end if;
    end loop;
    v_v := public.hr_vigour_of(v_uid, 0);
    -- 61 x 59,000 ms = 3,599,000 ms = 59 whole minutes and 59,000 ms left over.
    -- The leftover stays on the counter and is spent by the NEXT window, which
    -- is the difference between a carried remainder and a discarded one.
    if (v_v->>'spent_min')::bigint <> 120 + 59 then
      raise exception 'GATE(c7): sixty-one SUB-MINUTE windows paid 59.98 minutes and charged % - set_activity is exempt from ACCRUE_MIN_MS by design, so a client looping just under the minute would hunt at full rate forever', (v_v->>'spent_min')::bigint - 120;
    end if;

    -- The remainder row is the ledger's own unit and it must stay BELOW the
    -- c_max_progress_add clamp per add; a row that grew past it would be the
    -- refused-delta failure this shape exists to avoid.
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = 0 and kind = 'daily'
                      and key = 'ev:vigour_rem_ms' and period_key = v_day) then
      raise exception 'GATE(c7): no remainder row was written - the sub-minute time is being discarded again';
    end if;

    -- (c4) THE CEILING IS A FUSE. Even with the maximum refills recorded, the
    --      budget may never pass 22 hours - which is what keeps "richest player
    --      hunts most" from becoming "richest player hunts always".
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'progress', jsonb_build_array(jsonb_build_object(
          'kind','daily','key','ev:vigour_refills','period', v_day, 'add', 99, 'state','active')),
        'journal', jsonb_build_object('kind','admin','intent','vigour_probe')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c4): the refill counter write was refused: %', v_r; end if;
    v_v := public.hr_vigour_of(v_uid, 0);
    if (v_v->>'refills')::int <> 5 then
      raise exception 'GATE(c4): 99 recorded refills read back as % - the per-day clamp is not applied on READ', v_v->>'refills'; end if;
    if (v_v->>'budget_min')::int > 22 * 60 then
      raise exception 'GATE(c4): the budget reached % min, past the 22h ceiling - gold can buy the whole day', v_v->>'budget_min'; end if;

    -- (c5) REMAINING NEVER GOES NEGATIVE, however far past the budget a night
    --      ran. Past the budget the hunt keeps running and pays a quarter
    --      (design §4.3); it does not owe minutes.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'progress', jsonb_build_array(jsonb_build_object(
          'kind','daily','key','ev:vigour_min','period', v_day, 'add', 100000, 'state','active')),
        'journal', jsonb_build_object('kind','admin','intent','vigour_probe')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c5): the overspend charge was refused: %', v_r; end if;
    v_v := public.hr_vigour_of(v_uid, 0);
    if (v_v->>'remaining_min')::int <> 0 then
      raise exception 'GATE(c5): remaining is % past the budget - it must floor at 0', v_v->>'remaining_min'; end if;

    -- (c6) A DIFFERENT UTC DAY IS A DIFFERENT ROW. The refresh is the day key
    --      every other daily in the game already uses; nothing resets anything.
    if exists (select 1 from public.player_progress
                where user_id = v_uid and kind = 'daily' and key = 'ev:vigour_min'
                  and period_key <> v_day) then
      raise exception 'GATE(c6): the charge landed outside today''s period row';
    end if;

    raise exception using errcode = 'HR922', message = 'vigour-daily §3 complete - rolling back';
  exception when sqlstate 'HR922' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  raise notice 'vigour-daily: the grant is derived from hr_offline_cap_ms and floored at 720, no price lives in the meter, the envelope and the read agree, and EXECUTED - a settled charge moves it, THE CHARGE CONSERVES UNDER SUBDIVISION (40x90s and 61x59s cost the same as the span settled once), 99 recorded refills clamp to 5, the budget never passes the 22h ceiling, remaining floors at 0 and the charge lands on today''s period row - all green, net zero';
end $$;
