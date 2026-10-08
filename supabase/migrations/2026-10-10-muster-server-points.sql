-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-muster-server-points.sql — MUSTER POINTS ARE THE SERVER'S.
--                                       THE CLIENT SENDS NO NUMBER.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C:
--   it rewrites a client RPC's signature on a SHARED surface — the muster's
--   community bar — and changes what feeds the muster chest's band). The
--   Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-muster-server-points.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC). NO EDGE CHANGE.
--   ORDER: this file BEFORE the client half (src/features/muster.js calls
--   world_event_contribute(p_event_key) with no number). An old client calling
--   the retired 2-arg form after the apply gets PGRST202 (no such function) and
--   its muster feature-detects as unsupported — it loses its contribution for
--   that window, it cannot mint one. Apply OUTSIDE a muster window (01:00-01:45
--   / 13:00-13:45 UTC) so no live window straddles the switch.
--
-- ── THE DEFECT (whole-game review, 2026-10-08) ──────────────────────────────
-- world_event_contribute(p_event_key, p_points) took the CLIENT's points — the
-- browser summed every updateDaily event x a weight x the event multiplier
-- (src/features/muster.js pointsFor), plus a one-shot "rally" whose size was a
-- client-rolled raid strike — and added them to the player's join row and the
-- SHARED world_event_totals.progress, clamped only at 400/call and 6,000/muster.
-- So a forged number moved another player's community bar (whether the muster
-- is "held", which pays everyone x1.5 gold + 2 gems + a seal) and set the
-- caller's band against the median. CLAUDE.md §1: a client value must never
-- cross into another player's economy.
--
-- ── THE RULING (Game Designer, final) ───────────────────────────────────────
-- "Points are derived on the server from the player's own counter deltas during
--  the window. The client sends no number."
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 world_event_joins.baseline jsonb — the caller's counter snapshot at join,
--      per character slot: { "<slot>": {kill, gather, harvest, cooked, smithed,
--      crafted} }.
--   §2 hr_muster_points() / hr_muster_sources(event_id) — ⟦DERIVED⟧ from
--      src/data/muster.js MUSTER_POINTS / MUSTER_EVENT_SOURCES, bound both ways
--      by tests/muster-server-points.mjs. Owner-only.
--   §3 hr_muster_score(user) — the snapshot function. Every input is a SERVER
--      lifetime counter (kind='stat', period ''):
--        kill     Σ over monsters of MUSTER_POINTS.kill_any x hr_bounty_monsters.tier
--                 x greatest(0, ev:kill_monster:<id> - ev:kill_credited:<id>)
--                 — the bestiary counter MINUS the part hr_credit_kills' client-
--                 reachable bounty branch supplied (the renown R5 discount), so a
--                 client kill credit scores ZERO muster points;
--        others   ev:gather / ev:harvest / ev:cooked / ev:smithed / ev:crafted,
--                 written by hr_apply's settle and hr_farm_harvest only.
--   §4 world_event_join__ungated — stamps baseline := hr_muster_score(caller)
--      in the same insert that consumes the once-per-day join.
--   §5 world_event_contribute(p_event_key text) — REPLACES the (text, int) pair
--      (wrapper + __ungated). It reads the join row FOR UPDATE, recomputes
--          points = least(cap, floor( Σ_slot Σ_type mult[type] x pts[type]
--                                     x (now[type] - baseline[type]) ))
--      raises the row to it (never lowers — greatest()), and adds exactly the
--      rise to the shared bar. Idempotent by construction: a repeat with no new
--      counter movement adds 0. hr_client_rpc_baseline swaps the row.
--   §6 self-check — executed, net-zero.
--
-- ── KNOWN LIMITATION, STATED ────────────────────────────────────────────────
-- Counters move when the SERVER settles, not when the action happened. Work
-- done before the join but SETTLED after it (an away night collected during
-- the window) counts toward the window. That is still the player's own,
-- server-computed work — never a client number — and the 6,000/player cap
-- bounds it exactly as before; but a player can time a settle into a muster.
-- Closing it needs counter rows stamped by action time, which the engine does
-- not keep. Named for the Designer, not hidden.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One jsonb column on world_event_joins (≤6 slots x 6 numbers ≈ 300 B per
-- join, one join per player per day). hr_muster_score is an indexed read of the
-- caller's own stat rows (≤ ~120 bestiary + 5 goal keys per slot) — once at
-- join and once per contribute call (client cadence 30 s, rate-gated 60/min).
-- No new table, no per-tick journal.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-create the 2-arg pair from 2026-08-08-muster.sql §6 + the lockdown wrapper
-- and restore its baseline row; drop the 1-arg pair; the baseline column may
-- stay (nothing else reads it). Points already earned stay on the join rows.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.world_event_join__ungated(text)') is null
     or to_regprocedure('public.world_event_join(text)') is null then
    raise exception 'PRECONDITION: world_event_join(__ungated)(text) is absent';
  end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception 'PRECONDITION: hr_bounty_monsters is absent - the kill points have no tier';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate / hr_note_rejection are absent';
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: hr_client_rpc_baseline is absent';
  end if;
end $$;

-- ── 1. THE JOIN-TIME SNAPSHOT ────────────────────────────────────────────────
alter table public.world_event_joins add column if not exists baseline jsonb;

-- ── 2. THE CATALOGUE — ⟦DERIVED⟧ src/data/muster.js ──────────────────────────
create or replace function public.hr_muster_points()
returns jsonb language sql immutable parallel safe as $$
  select '{"kill_any": 10, "gather": 4, "harvest": 6, "cooked": 12, "smithed": 12, "crafted": 12}'::jsonb
$$;
create or replace function public.hr_muster_sources(p_event_id text)
returns jsonb language sql immutable parallel safe as $$
  select case p_event_id
    when 'ashen_horde'   then '{"kill_any": 1}'::jsonb
    when 'long_harvest'  then '{"harvest": 1, "gather": 1}'::jsonb
    when 'forge_levy'    then '{"smithed": 1, "crafted": 1}'::jsonb
    when 'deep_seam'     then '{"gather": 1}'::jsonb
    when 'keep_kitchens' then '{"cooked": 1}'::jsonb
    when 'all_hands'     then '{"kill_any": 0.5, "gather": 0.5, "harvest": 0.5, "cooked": 0.5, "smithed": 0.5, "crafted": 0.5}'::jsonb
    else '{}'::jsonb end
$$;
revoke execute on function public.hr_muster_points() from public, anon, authenticated, service_role;
revoke execute on function public.hr_muster_sources(text) from public, anon, authenticated, service_role;

-- ── 3. THE SCORE — server counters only ─────────────────────────────────────
create or replace function public.hr_muster_score(p_user uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(ps.slot::text, jsonb_build_object(
    'kill', (select coalesce(sum((public.hr_muster_points()->>'kill_any')::numeric * m.tier
                                 * greatest(0, b.value - coalesce(c.value, 0))), 0)
               from public.player_progress b
               join public.hr_bounty_monsters m on b.key = 'ev:kill_monster:' || m.monster_id
               left join public.player_progress c
                 on c.user_id = b.user_id and c.slot = b.slot and c.kind = 'stat'
                and c.period_key = '' and c.key = 'ev:kill_credited:' || m.monster_id
              where b.user_id = p_user and b.slot = ps.slot and b.kind = 'stat' and b.period_key = ''),
    'gather',  (select coalesce(sum(value), 0) from public.player_progress where user_id = p_user and slot = ps.slot and kind = 'stat' and period_key = '' and key = 'ev:gather'),
    'harvest', (select coalesce(sum(value), 0) from public.player_progress where user_id = p_user and slot = ps.slot and kind = 'stat' and period_key = '' and key = 'ev:harvest'),
    'cooked',  (select coalesce(sum(value), 0) from public.player_progress where user_id = p_user and slot = ps.slot and kind = 'stat' and period_key = '' and key = 'ev:cooked'),
    'smithed', (select coalesce(sum(value), 0) from public.player_progress where user_id = p_user and slot = ps.slot and kind = 'stat' and period_key = '' and key = 'ev:smithed'),
    'crafted', (select coalesce(sum(value), 0) from public.player_progress where user_id = p_user and slot = ps.slot and kind = 'stat' and period_key = '' and key = 'ev:crafted'))),
    '{}'::jsonb)
    from public.player_state ps where ps.user_id = p_user
$$;
revoke execute on function public.hr_muster_score(uuid) from public, anon, authenticated, service_role;

-- The points a score delta is worth for one event. Pure; owner-only.
create or replace function public.hr_muster_points_between(p_event_id text, p_base jsonb, p_now jsonb)
returns bigint language sql immutable parallel safe as $$
  select coalesce(floor(sum(
           coalesce((public.hr_muster_sources(p_event_id) ->> t)::numeric, 0)
         * case when t = 'kill_any' then 1 else coalesce((public.hr_muster_points() ->> t)::numeric, 0) end
         * greatest(0, coalesce((s.v ->> (case when t = 'kill_any' then 'kill' else t end))::numeric, 0)
                     - coalesce((p_base -> s.k ->> (case when t = 'kill_any' then 'kill' else t end))::numeric, 0))
         )), 0)::bigint
    from jsonb_each(coalesce(p_now, '{}'::jsonb)) s(k, v)
    cross join unnest(array['kill_any','gather','harvest','cooked','smithed','crafted']) t
$$;
revoke execute on function public.hr_muster_points_between(text, jsonb, jsonb) from public, anon, authenticated, service_role;

-- ── 4. THE JOIN STAMPS THE BASELINE (anchored, exactly once) ────────────────
do $$
declare
  v_def text;
  c_anchor constant text := $anc$  insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end)
  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at)$anc$;
  c_new constant text := $new$  -- 2026-10-10-muster-server-points.sql: the counter snapshot the window's
  -- points are measured from, taken in the same statement that consumes the join.
  insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, baseline)
  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, public.hr_muster_score(auth.uid()))$new$;
begin
  v_def := replace(pg_get_functiondef('public.world_event_join__ungated(text)'::regprocedure), chr(13), '');
  if strpos(v_def, '2026-10-10-muster-server-points.sql') > 0 then
    raise notice 'world_event_join__ungated already stamps the baseline - patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE world_event_join__ungated insert did not match exactly once - not the '
                    '2026-08-08-muster.sql §5 body. Do NOT patch a body you cannot account for.';
  end if;
  execute replace(v_def, c_anchor, c_new);
end $$;
revoke execute on function public.world_event_join__ungated(text) from public, anon, authenticated, service_role;

-- ── 5. world_event_contribute(p_event_key) — NO NUMBER ──────────────────────
drop function if exists public.world_event_contribute(text, integer);
drop function if exists public.world_event_contribute__ungated(text, integer);

create or replace function public.world_event_contribute__ungated(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_total_cap constant bigint := 6000;   -- src/data/muster.js MUSTER_POINT_CAP
  v_join  public.world_event_joins%rowtype;
  v_event text;
  v_pts   bigint;
  v_add   bigint;
  v_tot   public.world_event_totals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select * into v_join from public.world_event_joins
   where user_id = auth.uid() and event_key = p_event_key
   for update;
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if now() >= v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'window_closed', 'points', v_join.points);
  end if;
  v_event := public.hr_rally_event_for_key(v_join.event_key);
  -- A join written before this file has no baseline: it measures from NOW
  -- (the first call stamps it), so it can never count work from before the
  -- switch — the fail-safe direction.
  if v_join.baseline is null then
    update public.world_event_joins set baseline = public.hr_muster_score(auth.uid())
     where day_key = v_join.day_key and user_id = auth.uid();
    return jsonb_build_object('ok', true, 'added', 0, 'points', v_join.points, 'rebased', true);
  end if;
  v_pts := least(c_total_cap, public.hr_muster_points_between(v_event, v_join.baseline,
                                                            public.hr_muster_score(auth.uid())));
  v_add := greatest(0, v_pts - v_join.points);
  if v_add > 0 then
    update public.world_event_joins set points = points + v_add
     where day_key = v_join.day_key and user_id = auth.uid()
     returning * into v_join;
    update public.world_event_totals
       set progress = progress + v_add,
           met_at = case when met_at is null and progress + v_add >= goal then now() else met_at end
     where event_key = v_join.event_key
     returning * into v_tot;
  else
    select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  end if;
  return jsonb_build_object('ok', true, 'added', v_add, 'points', v_join.points,
    'capped', v_join.points >= c_total_cap,
    'progress', coalesce(v_tot.progress, 0), 'goal', coalesce(v_tot.goal, 0),
    'met', v_tot.met_at is not null);
end $$;
revoke execute on function public.world_event_contribute__ungated(text) from public, anon, authenticated, service_role;

create or replace function public.world_event_contribute(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.hr_rpc_gate('world_event_contribute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_note_rejection('world_event_contribute', 0, public.world_event_contribute__ungated($1));
end $$;
revoke execute on function public.world_event_contribute(text) from public, anon, authenticated, service_role;
grant  execute on function public.world_event_contribute(text) to authenticated;

delete from public.hr_client_rpc_baseline
 where proname = 'world_event_contribute' and identity_args = 'p_event_key text, p_points integer';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, approved_at, note)
select 'world_event_contribute', 'p_event_key text', 'authenticated', now(),
       '2026-10-10-muster-server-points.sql: replaces (p_event_key, p_points) - the client sends no number'
 where not exists (select 1 from public.hr_client_rpc_baseline
                    where proname = 'world_event_contribute' and identity_args = 'p_event_key text');

-- ── 6. SELF-CHECK — executed, net-zero (sentinel HR8A6) ─────────────────────
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000c0-0000-0000-0000-00000000a106';
  v_ev    text;
  v_key   text;
  v_mon   text;
  v_tier  int;
  v_p0    bigint;
  v_n     int;
  v_hyg   jsonb;
begin
  -- (a) the retired 2-arg surface is GONE; the new one is authenticated-only.
  if to_regprocedure('public.world_event_contribute(text,integer)') is not null
     or to_regprocedure('public.world_event_contribute__ungated(text,integer)') is not null then
    raise exception 'VERIFY(a): the client-number contribute (text,int) still exists';
  end if;
  if not has_function_privilege('authenticated', 'public.world_event_contribute(text)', 'execute')
     or has_function_privilege('anon', 'public.world_event_contribute(text)', 'execute')
     or has_function_privilege('authenticated', 'public.world_event_contribute__ungated(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_muster_score(uuid)', 'execute') then
    raise exception 'VERIFY(a): the contribute/score grants are wrong';
  end if;
  v_hyg := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v_hyg->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_hyg->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'VERIFY(a): grant hygiene: %', v_hyg;
  end if;

  -- (b) every rotated event has a source row, and the sources only name priced types.
  select count(*) into v_n from unnest(public.hr_rally_pool()) e
   where public.hr_muster_sources(e) = '{}'::jsonb;
  if v_n > 0 then raise exception 'VERIFY(b): % rotated muster event(s) count nothing', v_n; end if;

  -- (c) behaviour, on a synthetic ashen_horde window.
  select e into v_ev from unnest(public.hr_rally_pool()) e where e = 'ashen_horde';
  select monster_id, tier into v_mon, v_tier from public.hr_bounty_monsters order by tier desc, monster_id limit 1;
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version) values (v_uid, 0, 0, 0, 1);
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:kill_monster:' || v_mon, 50, '', 'active');
    -- a key whose rotation picks ashen_horde on some day/slot, found by search
    select d || '#' || s into v_key
      from generate_series(date '2020-01-01', date '2020-03-01', interval '1 day') g,
           lateral (select public.hr_utc_day_key(g) d) dd, unnest(array[1, 13]) s
     where public.hr_rally_event_for_key(d || '#' || s) = 'ashen_horde' limit 1;
    insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, baseline)
      values (split_part(v_key, '#', 1), v_uid, v_key, split_part(v_key, '#', 2)::int,
              now() + interval '30 minutes', public.hr_muster_score(v_uid));
    insert into public.world_event_totals (event_key, participants, goal, progress)
      values (v_key, 1, 6000, 0) on conflict (event_key) do nothing;
    select progress into v_p0 from public.world_event_totals where event_key = v_key;

    -- no new work: 0 points, and the pre-join 50 kills count for nothing.
    v := public.world_event_contribute__ungated(v_key);
    if coalesce(v->>'ok','') <> 'true' or (v->>'points')::bigint <> 0 then
      raise exception 'VERIFY(c): pre-join kills scored: %', v; end if;

    -- 7 server kills of a tier-T monster: 10 x T x 7 points, onto the shared bar.
    update public.player_progress set value = 57
     where user_id = v_uid and key = 'ev:kill_monster:' || v_mon;
    v := public.world_event_contribute__ungated(v_key);
    if (v->>'points')::bigint <> 10 * v_tier * 7 or (v->>'added')::bigint <> 10 * v_tier * 7 then
      raise exception 'VERIFY(c): 7 tier-% kills scored %, expected %', v_tier, v->>'points', 10 * v_tier * 7; end if;
    if (select progress from public.world_event_totals where event_key = v_key) <> v_p0 + 10 * v_tier * 7 then
      raise exception 'VERIFY(c): the shared bar did not move by exactly the derived points'; end if;

    -- a repeat with no new counter movement adds NOTHING (idempotent).
    v := public.world_event_contribute__ungated(v_key);
    if (v->>'added')::bigint <> 0 then raise exception 'VERIFY(c): a repeat added %', v->>'added'; end if;

    -- CLIENT-CREDITED kills (hr_credit_kills' bounty branch) score ZERO.
    update public.player_progress set value = 157
     where user_id = v_uid and key = 'ev:kill_monster:' || v_mon;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:kill_credited:' || v_mon, 100, '', 'active');
    v := public.world_event_contribute__ungated(v_key);
    if (v->>'added')::bigint <> 0 then
      raise exception 'VERIFY(c): client-credited kills scored % muster points', v->>'added'; end if;

    -- gathering does not count for a combat muster.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:gather', 9999, '', 'active');
    v := public.world_event_contribute__ungated(v_key);
    if (v->>'added')::bigint <> 0 then raise exception 'VERIFY(c): gathering scored in a combat muster'; end if;

    -- the cap holds.
    update public.player_progress set value = 100000
     where user_id = v_uid and key = 'ev:kill_monster:' || v_mon;
    v := public.world_event_contribute__ungated(v_key);
    if (v->>'points')::bigint <> 6000 then raise exception 'VERIFY(c): cap not applied: %', v; end if;

    -- a closed window refuses and moves nothing.
    update public.world_event_joins set window_end = now() - interval '1 second'
     where user_id = v_uid and event_key = v_key;
    v := public.world_event_contribute__ungated(v_key);
    if v->>'error' <> 'window_closed' then raise exception 'VERIFY(c): closed window accepted: %', v; end if;

    raise exception using errcode = 'HR8A6', message = 'muster-server-points §6 complete - rolling back';
  exception when sqlstate 'HR8A6' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.world_event_joins where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §6 LEAKED a probe row';
  end if;
  raise notice 'muster-server-points: the client-number contribute is gone; points are derived from server '
               'counters since the join snapshot (tier-priced kills, credited kills discounted to 0, '
               'off-event work 0, cap 6000, repeat adds 0, closed window refused) — all green';
end $$;
