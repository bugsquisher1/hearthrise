-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GOLD RUNWAY: A BEST CARRIES ITS SUPPLY SPEND PER HOUR (lane
-- c-hunt-screens-server, backend-architect, 2026-10-22; designer plan "Hunts,
-- Hunt prep and the Party finder", docs/planning/PRIORITY_BOARD.md, item A #6:
-- "about 6 h of gold at your best pace here"). STAGED, NOT APPLIED. Game
-- CLOSED: applies on its passing §4; part of the reopen Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hunt_bests.supply_h (NEW, nullable bigint): the store gold an hour spent by
--    the run that holds xp_h (the "best pace" a hunt card leads with), i.e. that
--    run's analyzer `per_hour.waste` (hr_hunt_stats_of: store supplies bought,
--    never own stock). NULL = not known (a best whose session is gone).
-- §2 hr_hunt_best_fold RESTATED WHOLE (§0 pins the 2026-11-10 image): the fold
--    writes supply_h beside xp_h and moves it only when xp_h moves, so the two
--    always describe the same run. hr_hunt_bests_view RESTATED WHOLE (§0 pin):
--    each mode object gains `supply_h` beside xp_h / balance_h.
-- §3 BACKFILL, once: every best whose xp_session still exists gets that run's
--    spend (idempotent: a re-apply finds supply_h set and moves nothing).
-- The client computes the runway as gold / supply_h and hides it when supply_h is
-- null or 0 (no store spend = no runway limit).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None: no RPC, no grant, the caller's own rows only; display only (nothing
-- gates, spends or ranks on it); derived only from the server's tallies.
-- ── COST ────────────────────────────────────────────────────────────────────
-- 8 bytes per existing best row; the fold already computed per_hour.
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_best_fold from 2026-11-10-hunt-xp-split.sql and
-- hr_hunt_bests_view from 2026-11-04-hunt-bests.sql; drop the column.
-- ORDER: after 2026-12-05-hunt-setup-per-ground.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (md5 of the CR-stripped prosrc: the chain-end image, or this file's own) ──
do $mig$
declare v_src text;
begin
  if to_regclass('public.hunt_bests') is null or to_regprocedure('public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)') is null then
    raise exception 'PRECONDITION: hunt_bests / hr_hunt_stats_of missing'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_best_fold(uuid)'::regprocedure;
  if md5(v_src) <> 'ed412fd5ff3f16e28fb24c7500c5890d' and strpos(v_src, 'BESTS-SUPPLY') = 0 then
    raise exception 'PIN: hr_hunt_best_fold is neither the 2026-11-10 xp-split image (ed412fd5...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_bests_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'a4f882fe6f1c288a13f0640b74c13451' and strpos(v_src, 'BESTS-SUPPLY') = 0 then
    raise exception 'PIN: hr_hunt_bests_view is neither the 2026-11-04 image (a4f882fe...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.hunt_bests add column if not exists supply_h bigint;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_bests_supply_h_range') then
    alter table public.hunt_bests add constraint hunt_bests_supply_h_range check (supply_h is null or supply_h >= 0);
  end if;
end $mig$;
comment on column public.hunt_bests.supply_h is
  '2026-12-06-hunt-bests-supply.sql: store gold an hour spent by the run that holds xp_h (its analyzer per_hour.waste); '
  'moves only with xp_h. NULL = unknown. The picker''s gold runway is gold / supply_h.';

-- ── §2 THE FOLD AND THE SECTION ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_best_fold(p_session uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): the run that holds xp_h also gives supply_h (its store gold an hour).
  v_s      public.hunt_sessions%rowtype;
  v_wall_h numeric;
  v_mode   text;
  v_ph     jsonb;
  v_xp     bigint;
  v_bal    bigint;
  v_sup    bigint;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  if not found or v_s.ended_at is null or v_s.ended_at - v_s.entered_at < public.hr_hunt_best_min() then return; end if;
  -- THE ANALYZER'S CLOCK: wall hours, entered -> ended (hr_hunt_analyzer_of's v_wall_h).
  v_wall_h := extract(epoch from (v_s.ended_at - v_s.entered_at)) / 3600.0;
  -- THE ANALYZER'S PARTY: another character's session in this instance whose hunt overlapped this one.
  v_mode := case when exists (
      select 1 from public.hunt_sessions h
       where h.instance_id = v_s.instance_id and h.id <> v_s.id
         and (h.user_id, h.slot) <> (v_s.user_id, v_s.slot)
         and h.entered_at <= v_s.ended_at and coalesce(h.ended_at, now()) >= v_s.entered_at)
    then 'party' else 'solo' end;
  -- THE HERO'S OWN figures, exactly as its analyzer showed them (never the party's sum).
  v_ph := public.hr_hunt_stats_of(array[v_s.id], v_wall_h, null, null)->'per_hour';
  v_xp := (v_ph->>'xp')::numeric::bigint;
  v_bal := (v_ph->>'balance')::numeric::bigint;
  v_sup := (v_ph->>'waste')::numeric::bigint;
  if v_xp is null or v_bal is null then return; end if;
  insert into public.hunt_bests as b (user_id, slot, hunt_id, mode, xp_h, xp_session, balance_h, balance_session, supply_h)
    values (v_s.user_id, v_s.slot, v_s.hunt_id, v_mode, v_xp, v_s.id, v_bal, v_s.id, v_sup)
  on conflict (user_id, slot, hunt_id, mode) do update
    set xp_h            = greatest(b.xp_h, excluded.xp_h),
        xp_session      = case when excluded.xp_h > b.xp_h then excluded.xp_session else b.xp_session end,
        supply_h        = case when excluded.xp_h > b.xp_h then excluded.supply_h else b.supply_h end,
        balance_h       = greatest(b.balance_h, excluded.balance_h),
        balance_session = case when excluded.balance_h > b.balance_h then excluded.balance_session else b.balance_session end,
        updated_at      = case when excluded.xp_h > b.xp_h or excluded.balance_h > b.balance_h then now() else b.updated_at end;
end $function$;
revoke execute on function public.hr_hunt_best_fold(uuid) from public;
revoke execute on function public.hr_hunt_best_fold(uuid) from anon, authenticated, service_role, hr_engine, hr_tick;

CREATE OR REPLACE FUNCTION public.hr_hunt_bests_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): each mode also carries supply_h, the xp_h run's store gold an hour.
  select jsonb_build_object(
    'min_ms', (extract(epoch from public.hr_hunt_best_min()) * 1000)::bigint,
    'grounds', coalesce((select jsonb_object_agg(g.hunt_id, g.modes)
                           from (select b.hunt_id, jsonb_object_agg(b.mode, jsonb_build_object('xp_h', b.xp_h, 'balance_h', b.balance_h,
                                                                                                'supply_h', b.supply_h)) as modes
                                   from public.hunt_bests b
                                  where b.user_id = p_user and b.slot = p_slot
                                  group by b.hunt_id) g), '{}'::jsonb))
$function$;
revoke execute on function public.hr_hunt_bests_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 BACKFILL, ONCE: the xp_h run's spend, where that run is still kept ─────
update public.hunt_bests b
   set supply_h = (public.hr_hunt_stats_of(array[s.id], extract(epoch from (s.ended_at - s.entered_at)) / 3600.0, null, null)
                   ->'per_hour'->>'waste')::numeric::bigint
  from public.hunt_sessions s
 where s.id = b.xp_session and s.ended_at is not null and b.supply_h is null;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-00005e760001';
  v_g  text;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v jsonb;
begin
  begin
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Runway') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bests-supply §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- three finished 30-minute solo runs: (1) 1,000 Level XP, 50 gp of store supplies; (2) more XP, 10 gp; (3) less XP, more coins, 200 gp.
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_u, 0, v_g, now() - interval '6 hours', now() - interval '6 hours', now() - interval '330 minutes',
              now() - interval '330 minutes', now() - interval '330 minutes', 'left') returning id into v_s1;
    insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins, supply_gold)
      values (v_s1, v_u, 0, '{"level": 1000}'::jsonb, 100, 50) on conflict (session_id) do update set xp = excluded.xp, coins = excluded.coins, supply_gold = excluded.supply_gold;
    perform public.hr_hunt_best_fold(v_s1);
    v := public.hr_state_of(v_u, 0)->'hunt_bests'->'grounds'->v_g->'solo';
    if (v->>'xp_h')::bigint <> 2000 or (v->>'supply_h')::bigint <> 100 or (v->>'balance_h')::bigint <> 100 then
      raise exception 'VERIFY(a): the first best reads %', v; end if;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_u, 0, v_g, now() - interval '5 hours', now() - interval '5 hours', now() - interval '270 minutes',
              now() - interval '270 minutes', now() - interval '270 minutes', 'left') returning id into v_s2;
    insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins, supply_gold)
      values (v_s2, v_u, 0, '{"level": 1500}'::jsonb, 0, 10) on conflict (session_id) do update set xp = excluded.xp, coins = excluded.coins, supply_gold = excluded.supply_gold;
    perform public.hr_hunt_best_fold(v_s2);
    v := public.hr_state_of(v_u, 0)->'hunt_bests'->'grounds'->v_g->'solo';
    if (v->>'xp_h')::bigint <> 3000 or (v->>'supply_h')::bigint <> 20 or (v->>'balance_h')::bigint <> 100 then
      raise exception 'VERIFY(b): a better XP run reads %', v; end if;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (v_u, 0, v_g, now() - interval '4 hours', now() - interval '4 hours', now() - interval '210 minutes',
              now() - interval '210 minutes', now() - interval '210 minutes', 'left') returning id into v_s3;
    insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins, supply_gold)
      values (v_s3, v_u, 0, '{"level": 500}'::jsonb, 1000, 200) on conflict (session_id) do update set xp = excluded.xp, coins = excluded.coins, supply_gold = excluded.supply_gold;
    perform public.hr_hunt_best_fold(v_s3);
    v := public.hr_state_of(v_u, 0)->'hunt_bests'->'grounds'->v_g->'solo';
    if (v->>'xp_h')::bigint <> 3000 or (v->>'supply_h')::bigint <> 20 or (v->>'balance_h')::bigint <> 1600 then
      raise exception 'VERIFY(c): a better-balance, worse-XP run moved the runway: %', v; end if;
    -- a re-fold (idempotent) moves nothing
    perform public.hr_hunt_best_fold(v_s1);
    if public.hr_state_of(v_u, 0)->'hunt_bests'->'grounds'->v_g->'solo' <> v then
      raise exception 'VERIFY(d): a re-fold moved the best to %', public.hr_state_of(v_u, 0)->'hunt_bests'->'grounds'->v_g->'solo'; end if;
    -- the backfill's arithmetic equals the fold's: null it, re-run the backfill statement on this row, read 20 back
    update public.hunt_bests set supply_h = null where user_id = v_u;
    update public.hunt_bests b
       set supply_h = (public.hr_hunt_stats_of(array[s.id], extract(epoch from (s.ended_at - s.entered_at)) / 3600.0, null, null)
                       ->'per_hour'->>'waste')::numeric::bigint
      from public.hunt_sessions s
     where s.id = b.xp_session and s.ended_at is not null and b.supply_h is null and b.user_id = v_u;
    if (select supply_h from public.hunt_bests where user_id = v_u and slot = 0 and hunt_id = v_g and mode = 'solo') is distinct from 20::bigint then
      raise exception 'VERIFY(e): the backfill computed %', (select supply_h from public.hunt_bests where user_id = v_u and hunt_id = v_g); end if;
    if has_function_privilege('authenticated', 'public.hr_hunt_best_fold(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_bests_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): a grant is wrong'; end if;
    raise exception using errcode = 'HR897', message = 'bests-supply §4 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(g): §4 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'bests-supply: the xp_h run''s store spend an hour rides with it, a balance best never moves it, the section carries it; all green';
end $$;
