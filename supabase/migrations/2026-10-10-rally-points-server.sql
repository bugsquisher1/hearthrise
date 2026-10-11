-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-rally-points-server.sql — RALLY POINTS ARE DERIVED BY THE SERVER
--   FROM THE CHARACTER'S OWN JOURNALLED ACTIVITY IN THE RALLY WINDOW.
--   THE BROWSER NO LONGER NAMES A NUMBER.
--
-- STATUS: STAGED, NOT APPLIED — Security review required (the points decide
-- the band, so the chest's gold and its up to 3,000 XP/day). Lane C
-- (lane/b568-rally-points-server). The Coordinator applies
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). CHAIN POSITION: AFTER 2026-10-10-muster-chest-xp-credit.sql
-- — the online claim body below is restated FROM that file's (XP-crediting)
-- body; §0 refuses to apply unless it is live.
--
-- ── THE DEFECT (accepted residual, now closed; Security) ────────────────────
-- world_event_contribute(p_event_key, p_points) took the POINTS from the
-- browser, clamped to 400 per call and 6,000 per rally. The band (answered /
-- silver / gold against the median) is computed from those points, so a
-- modified client could forge its way to the gold band — the chest's gold and
-- the up-to-3,000 XP it converts — and, through the median, move every other
-- participant's band too. The same file's rally() one-shot rolled a "strike"
-- in the browser and sent THAT as points. CLAUDE.md §1: nothing authored by
-- the client crosses into another player's economy.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   world_event_contribute(p_event_key text)            — NEW SIGNATURE
--     The (text, integer) wrapper and inner are DROPPED; the points parameter
--     no longer exists. The call is now a REFRESH: the server re-derives the
--     caller's tally and returns it. Idempotent by construction (a replay
--     re-derives the same number), so it needs no idempotency key.
--     → {ok, points, added, progress, goal, met, closed, by:{source:points},
--        char_slot, event_key, day_key}
--     errors: not_signed_in | not_joined | rate_limited
--   world_event_join(p_event_key text)                  — signature unchanged
--     records world_event_joins.char_slot (NEW): the CHARACTER whose activity
--     scores, server-derived by hr_rally_pledge_char (the caller's own
--     character with the latest heartbeat). New error: no_character.
--   world_event_claim(p_day_key text, p_slot int)       — signature unchanged
--     re-derives the caller's tally (hr_rally_refresh) BEFORE the band, so the
--     band is priced from server-recorded activity even if the browser never
--     refreshed. A stored number is never trusted: the refresh SETS it.
--
--   NEW, no client grant:
--     hr_rally_point_rules(event_id)  the scoring table (sources per rally,
--                                     points per unit, bench -> counter)
--     hr_rally_points_of(user, slot, event_key, from, to)   the derivation
--     hr_rally_refresh(user, day_key) lock + derive + set + bar delta
--
-- ── THE DERIVATION (hr_rally_points_of) ─────────────────────────────────────
-- Source: player_ledger rows of (user, the join's char_slot) — the append-only
-- journal hr_apply writes for every settle (attended cadence, away accrue, the
-- world tick's folded rows: all the same shape). The window is
-- [joined_at, window_end], both server-stamped at join.
--   kill_any  combat/accrue rows: (meta.kills + meta.att.top) x 10 x tier,
--             tier from hr_bounty_monsters by meta.mon (generated from
--             src/data/monsters.js); a row with no `mon` (written before the
--             engine half below deploys) scores tier 1 — never over-credit.
--   gather    gather/accrue rows: meta.qty x 4 (the character's own gathering;
--             crew/worker output is not the character's play and is excluded)
--   harvest   farm/farm_harvest rows: qty_in x 6
--   cooked | smithed | crafted
--             craft/accrue rows: meta.made x 12, routed by meta.skill through
--             core BENCH_COUNTERS' progress key (cooking -> cooked, smithing ->
--             smithed, crafting/runecrafting/stonemason -> crafted; any other
--             bench scores nothing — the client's counters said the same)
-- Each source is multiplied by the rally's own weight (EVENTS[].sources) and
-- the sum floored. Unknown rally: no sources, zero points.
-- WINDOW BOUNDS. A row with a valid server span (meta.from / meta.to, ISO,
-- 0 < span <= 24 h) counts the OVERLAP FRACTION of that span with the window
-- (an away row covering 8 h of which 20 min were the window counts 20/480 of
-- its kills); any other row counts only if its own server timestamp `at`
-- falls inside the window. Units are taken as integers of at most 9 digits.
-- CAP: 6,000 per rally (unchanged). The per-call 400 clamp is gone: there is
-- no call value to clamp — the tally is bounded by what the engine paid.
--
-- ── THE CATALOGUE COPY (drift-guarded) ──────────────────────────────────────
-- hr_rally_point_rules restates POINTS / EVENTS[].sources from
-- src/features/muster.js and BENCH_COUNTERS from src/core/artisan.js, as
-- hr_rally_theme already restates THEMES. tests/rally-points-server.mjs RPS-9
-- compares this function's output to both JS sources, so neither copy can drift.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- hr_rally_refresh takes the join row FOR UPDATE (one row per user per day),
-- derives, and SETS points = least(derived, 6000); the bar moves by the signed
-- difference in the same transaction (floored at 0; met_at is never unset). Two
-- concurrent refreshes serialise on the join row; the second derives the same
-- or a larger number and moves the bar by the remainder only. The claim calls
-- the same function inside its own transaction before the conditional-flip
-- once-guard, which is unchanged.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Strictly narrower: the last client number on the rally surface is gone. No
-- client value reaches the tally — event key, character, window and every unit
-- are the server's own rows. A modified client can no longer add a point; it
-- can only cause a re-derivation of what the engine already journalled.
-- Points stored by the old RPC (client-asserted) are CORRECTED DOWN on the
-- next refresh or claim, never kept (set, not raise-only).
--
-- ── KNOWN LIMITATIONS (stated for review) ───────────────────────────────────
--   · The tally lags play by the settle cadence (attended ~90 s, away up to the
--     tick's fold). The claim's settle-before-mutate runs on the CLAIM slot;
--     activity of a different join character still unsettled at claim time is
--     not counted.
--   · The median is read from stored tallies; another player's tally is as
--     fresh as their last refresh.
--   · met_at may be set by a refresh after the window closes, from activity
--     inside the window that settled late; a player who claimed earlier did not
--     see the hold. Unchanged in kind from the old contribute.
--   · Dungeon kills (kind 'dungeon') are not scored; the client never scored
--     them either.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- No new rows. One indexed range scan of player_ledger_user_idx (user, slot,
-- at >= joined_at) per refresh: ~24–120 rows per character per day. The
-- browser refreshes every 30 s while joined (the old flush cadence), so at
-- 100x players the call rate is unchanged and each call reads a few dozen rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-08-08-muster.sql §5–§6 bodies under the A9 names
-- (world_event_join__ungated, world_event_contribute__ungated(text,int)) with
-- the A9 wrapper and the baseline row, re-apply 2026-10-10-muster-chest-xp-
-- credit.sql §2, drop the four new functions. char_slot may stay (nullable).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS (fail closed) ─────────────────────────────────────────
do $$
declare v_src text; v_h text;
begin
  if to_regprocedure('public.hr_rally_xp_credit(text,jsonb)') is null
     or to_regprocedure('public.hr_rally_pledge_char(uuid)') is null then
    raise exception '§0: apply 2026-10-10-muster-chest-xp-credit.sql FIRST (this file restates its claim body)';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.world_event_claim__ungated(text,integer)'::regprocedure;
  if strpos(v_src, 'hr_rally_xp_credit') = 0 or v_src ~ '\mv_seal\M' then
    raise exception '§0: world_event_claim__ungated is not the XP-crediting body this file restates from';
  end if;
  if to_regprocedure('public.world_event_join__ungated(text)') is null
     or to_regprocedure('public.world_event_join(text)') is null then
    raise exception '§0: the muster join surface is missing';
  end if;
  -- The join inner is restated FROM 2026-08-08-muster.sql §5 (A9-renamed).
  -- Live == replay measured 2026-10-10: bbd482b1f1216450fb365fdba1bb8f2e.
  select md5(replace(prosrc, chr(13), '')) into v_h from pg_proc
   where oid = 'public.world_event_join__ungated(text)'::regprocedure;
  if v_h <> 'bbd482b1f1216450fb365fdba1bb8f2e' and strpos(
       (select prosrc from pg_proc where oid = 'public.world_event_join__ungated(text)'::regprocedure),
       'hr_rally_pledge_char') = 0 then
    raise exception '§0: world_event_join__ungated has drifted (md5 %) from the body this file restates', v_h;
  end if;
  if to_regprocedure('public.world_event_contribute(text,integer)') is null
     and to_regprocedure('public.world_event_contribute(text)') is null then
    raise exception '§0: world_event_contribute is missing';
  end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception '§0: hr_bounty_monsters missing — apply 2026-08-23-bounty-monsters.generated.sql';
  end if;
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception '§0: hr_note_rejection / hr_rpc_gate / hr_client_rpc_baseline missing';
  end if;
end $$;

-- ── 1. THE JOIN RECORDS WHICH CHARACTER SCORES ─────────────────────────────
-- world_event_joins.slot is the rally WINDOW (1 | 13) and always was. char_slot
-- is the character, derived server-side at join (never a client value).
alter table public.world_event_joins add column if not exists char_slot int;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'world_event_joins_char_slot_ck'
                  and conrelid = 'public.world_event_joins'::regclass) then
    alter table public.world_event_joins
      add constraint world_event_joins_char_slot_ck check (char_slot is null or char_slot between 0 and 5);
  end if;
end $$;
comment on column public.world_event_joins.char_slot is
  'The CHARACTER whose journalled activity scores this rally, server-derived at join by '
  'hr_rally_pledge_char (2026-10-10-rally-points-server.sql). `slot` is the rally WINDOW (1|13).';

-- ── 2. THE SCORING TABLE (pure; no client grant) ───────────────────────────
-- POINTS and EVENTS[].sources from src/features/muster.js; bench from
-- src/core/artisan.js BENCH_COUNTERS[skill].progress. Drift-guarded (RPS-9).
create or replace function public.hr_rally_point_rules(p_event_id text)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'sources', case p_event_id
      when 'ashen_horde'   then '{"kill_any":1}'::jsonb
      when 'long_harvest'  then '{"harvest":1,"gather":1}'::jsonb
      when 'forge_levy'    then '{"smithed":1,"crafted":1}'::jsonb
      when 'deep_seam'     then '{"gather":1}'::jsonb
      when 'keep_kitchens' then '{"cooked":1}'::jsonb
      when 'all_hands'     then '{"kill_any":0.5,"gather":0.5,"harvest":0.5,"cooked":0.5,"smithed":0.5,"crafted":0.5}'::jsonb
      else '{}'::jsonb end,
    'base',  '{"kill_tier":10,"gather":4,"harvest":6,"cooked":12,"smithed":12,"crafted":12}'::jsonb,
    'bench', '{"cooking":"cooked","smithing":"smithed","crafting":"crafted","runecrafting":"crafted","stonemason":"crafted"}'::jsonb,
    'cap',   6000)
$$;
revoke execute on function public.hr_rally_point_rules(text) from public;
revoke execute on function public.hr_rally_point_rules(text) from anon, authenticated, service_role;

-- ── 3. THE DERIVATION (stable; no client grant) ────────────────────────────
create or replace function public.hr_rally_points_of(p_user uuid, p_slot int, p_event_key text,
                                                     p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  -- An engine timestamp: ISO-8601 with an explicit zone. Anything else is not
  -- a span and the row falls back to its own server `at`.
  c_iso      constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$';
  c_int      constant text := '^[0-9]{1,9}$';
  c_max_span constant interval := interval '24 hours';
  v_rules jsonb;
  v_units jsonb;
  v_by    jsonb := '{}'::jsonb;
  v_total numeric := 0;
  v_k     text;
  v_m     numeric;
  v_u     numeric;
begin
  if p_user is null or p_slot is null or p_from is null or p_to is null or p_to <= p_from then
    return jsonb_build_object('points', 0, 'units', '{}'::jsonb, 'by', '{}'::jsonb);
  end if;
  v_rules := public.hr_rally_point_rules(public.hr_rally_event_for_key(p_event_key));

  select jsonb_build_object(
    'kill_any', coalesce(sum(case when r.kind = 'combat' and r.verb = 'accrue' then w.ov
                  * ((case when r.meta->>'kills' ~ c_int then (r.meta->>'kills')::numeric else 0 end)
                   + (case when r.meta #>> '{att,top}' ~ c_int then (r.meta #>> '{att,top}')::numeric else 0 end))
                  * (v_rules->'base'->>'kill_tier')::numeric * coalesce(m.tier, 1) / w.sp end), 0),
    'gather',   coalesce(sum(case when r.kind = 'gather' and r.verb = 'accrue' then w.ov
                  * (case when r.meta->>'qty' ~ c_int then (r.meta->>'qty')::numeric else 0 end)
                  * (v_rules->'base'->>'gather')::numeric / w.sp end), 0),
    'harvest',  coalesce(sum(case when r.kind = 'farm' and r.verb = 'farm_harvest' then w.ov
                  * least(greatest(coalesce(r.qty_in, 0), 0), 999999999)
                  * (v_rules->'base'->>'harvest')::numeric / w.sp end), 0),
    'cooked',   coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'cooked' then w.ov
                  * (case when r.meta->>'made' ~ c_int then (r.meta->>'made')::numeric else 0 end)
                  * (v_rules->'base'->>'cooked')::numeric / w.sp end), 0),
    'smithed',  coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'smithed' then w.ov
                  * (case when r.meta->>'made' ~ c_int then (r.meta->>'made')::numeric else 0 end)
                  * (v_rules->'base'->>'smithed')::numeric / w.sp end), 0),
    'crafted',  coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'crafted' then w.ov
                  * (case when r.meta->>'made' ~ c_int then (r.meta->>'made')::numeric else 0 end)
                  * (v_rules->'base'->>'crafted')::numeric / w.sp end), 0))
    into v_units
    from (select l.kind, split_part(l.intent, ':', 1) as verb, l.at, l.qty_in, l.meta,
                 case when l.meta->>'from' ~ c_iso and l.meta->>'to' ~ c_iso
                      then (l.meta->>'from')::timestamptz end as f,
                 case when l.meta->>'from' ~ c_iso and l.meta->>'to' ~ c_iso
                      then (l.meta->>'to')::timestamptz end as t
            from public.player_ledger l
           where l.user_id = p_user and l.slot = p_slot
             and l.at >= p_from                       -- nothing settled before the window can overlap it
             and l.kind in ('combat', 'gather', 'craft', 'farm')) r
    -- THE WINDOW. ov / sp is the share of the row inside [p_from, p_to]:
    -- the overlap of its server span over the span, or 1/1 | 0/1 for a row
    -- with no valid span by its own `at`. Kept as a ratio and applied as
    -- units * ov / sp, so 1,200 x 20/240 is 100 and not 99.999...
    cross join lateral (
      select (case
        when r.f is not null and r.t > r.f and r.t - r.f <= c_max_span then
          greatest(0::numeric, (extract(epoch from (least(r.t, p_to) - greatest(r.f, p_from))))::numeric)
        when r.at <= p_to then 1::numeric
        else 0::numeric end) as ov,
             (case
        when r.f is not null and r.t > r.f and r.t - r.f <= c_max_span then
          (extract(epoch from (r.t - r.f)))::numeric
        else 1::numeric end) as sp) w
    left join public.hr_bounty_monsters m on r.kind = 'combat' and m.monster_id = r.meta->>'mon';

  for v_k, v_m in select key, value::numeric from jsonb_each_text(v_rules->'sources') loop
    -- rounded to 6 places before the floor: a sum of exact ratios may carry a
    -- 1e-20 residue, and a floor must never turn 100 into 99.
    v_u := round(coalesce((v_units->>v_k)::numeric, 0) * v_m, 6);
    v_by := v_by || jsonb_build_object(v_k, floor(v_u)::bigint);
    v_total := v_total + v_u;
  end loop;
  return jsonb_build_object('points', floor(v_total)::bigint, 'units', v_units, 'by', v_by);
end $$;
revoke execute on function public.hr_rally_points_of(uuid, int, text, timestamptz, timestamptz) from public;
revoke execute on function public.hr_rally_points_of(uuid, int, text, timestamptz, timestamptz) from anon, authenticated, service_role;

-- ── 4. THE REFRESH (lock, derive, SET, move the bar; no client grant) ──────
create or replace function public.hr_rally_refresh(p_user uuid, p_day_key text)
returns jsonb language plpgsql volatile set search_path = public as $$
declare
  c_cap  constant bigint := 6000;
  v_join public.world_event_joins%rowtype;
  v_tot  public.world_event_totals%rowtype;
  v_char int;
  v_d    jsonb;
  v_new  bigint;
  v_add  bigint;
begin
  select * into v_join from public.world_event_joins
   where day_key = p_day_key and user_id = p_user
   for update;
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;

  -- A join made before char_slot existed names its character on first refresh
  -- (the same server derivation the join now uses); never a client value.
  v_char := v_join.char_slot;
  if v_char is null then
    v_char := public.hr_rally_pledge_char(p_user);
    if v_char is not null then
      update public.world_event_joins set char_slot = v_char
       where day_key = p_day_key and user_id = p_user;
    end if;
  end if;

  if v_char is null then
    v_d := jsonb_build_object('points', 0, 'by', '{}'::jsonb);
  else
    v_d := public.hr_rally_points_of(p_user, v_char, v_join.event_key, v_join.joined_at, v_join.window_end);
  end if;
  -- SET, never raise-only: a number the old RPC stored on a client's word is
  -- corrected here, down as well as up.
  v_new := least(greatest(coalesce((v_d->>'points')::bigint, 0), 0), c_cap);
  v_add := v_new - v_join.points;

  if v_add <> 0 then
    update public.world_event_joins set points = v_new
     where day_key = p_day_key and user_id = p_user;
    update public.world_event_totals
       set progress = greatest(0, progress + v_add),
           met_at = case when met_at is null and greatest(0, progress + v_add) >= goal then now() else met_at end
     where event_key = v_join.event_key
     returning * into v_tot;
  else
    select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  end if;

  return jsonb_build_object('ok', true, 'points', v_new, 'added', v_add,
    'progress', coalesce(v_tot.progress, 0), 'goal', coalesce(v_tot.goal, 0),
    'met', v_tot.met_at is not null, 'closed', now() >= v_join.window_end,
    'by', coalesce(v_d->'by', '{}'::jsonb), 'char_slot', v_char,
    'event_key', v_join.event_key, 'day_key', v_join.day_key);
end $$;
revoke execute on function public.hr_rally_refresh(uuid, text) from public;
revoke execute on function public.hr_rally_refresh(uuid, text) from anon, authenticated, service_role;

-- ── 5. world_event_contribute: THE POINTS PARAMETER IS GONE ────────────────
drop function if exists public.world_event_contribute(text, integer);
drop function if exists public.world_event_contribute__ungated(text, integer);

create or replace function public.world_event_contribute__ungated(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- The key only FINDS the caller's own join; it is never a value.
  select j.day_key into v_day from public.world_event_joins j
   where j.user_id = auth.uid() and j.event_key = p_event_key;
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  return public.hr_rally_refresh(auth.uid(), v_day);
end $$;
revoke execute on function public.world_event_contribute__ungated(text) from public;
revoke execute on function public.world_event_contribute__ungated(text) from anon, authenticated, service_role;

-- The A9 wrapper (rate gate + refusal journal), refusals noted on the join's
-- CHARACTER (-1 when there is none), never on a guessed 0.
create or replace function public.world_event_contribute(p_event_key text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
declare
  v_cs int;
begin
  if not public.hr_rpc_gate('world_event_contribute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  if auth.uid() is not null then
    select j.char_slot into v_cs from public.world_event_joins j
     where j.user_id = auth.uid() and j.event_key = $1;
  end if;
  return public.hr_note_rejection('world_event_contribute', coalesce(v_cs, -1),
                                  public.world_event_contribute__ungated($1));
end $w$;
revoke execute on function public.world_event_contribute(text) from public, anon, service_role;
grant execute on function public.world_event_contribute(text) to authenticated;

delete from public.hr_client_rpc_baseline where proname = 'world_event_contribute';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('world_event_contribute',
   pg_get_function_identity_arguments('public.world_event_contribute(text)'::regprocedure),
   'authenticated',
   'restated 2026-10-10 (rally-points-server): the points parameter is GONE. The call re-derives '
   'the caller''s own rally tally from their join character''s journalled activity in the window '
   '(hr_rally_refresh) and returns it. Caller surface: an event key that only finds their own join.');

-- ── 6. THE JOIN (restated from 2026-08-08-muster.sql §5; only char_slot) ───
create or replace function public.world_event_join__ungated(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_goal_per_player constant bigint := 2000;
  c_min_goal        constant bigint := 6000;
  c_freeze_min      constant int    := 10;
  w record;
  v_rows int;
  v_char int;
  v_tot  public.world_event_totals%rowtype;
  v_existing public.world_event_joins%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into w from public.hr_muster_window();
  if w.event_key is null then
    return jsonb_build_object('ok', false, 'error', 'not_live',
                              'day_key', public.hr_utc_day_key());
  end if;
  if p_event_key is distinct from w.event_key then
    return jsonb_build_object('ok', false, 'error', 'stale_event',
                              'event_key', w.event_key, 'day_key', w.day_key);
  end if;

  -- THE CHARACTER whose journalled activity scores this rally: the caller's
  -- own, most recently present. Derived here, never named by the client.
  v_char := public.hr_rally_pledge_char(auth.uid());
  if v_char is null then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, char_slot)
  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char)
  on conflict (day_key, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select * into v_existing from public.world_event_joins
      where day_key = w.day_key and user_id = auth.uid();
    return jsonb_build_object('ok', false, 'error', 'already_joined',
      'day_key', w.day_key, 'event_key', v_existing.event_key,
      'slot', v_existing.slot, 'points', v_existing.points,
      'claimed', v_existing.claimed);
  end if;

  insert into public.world_event_totals (event_key, participants, goal, goal_frozen_at)
    values (w.event_key, 0, c_min_goal, w.started_at + make_interval(mins => c_freeze_min))
    on conflict (event_key) do nothing;
  update public.world_event_totals
     set participants = participants + 1,
         goal = case when now() < goal_frozen_at
                     then greatest(c_min_goal, c_goal_per_player * (participants + 1))
                     else goal end
   where event_key = w.event_key
   returning * into v_tot;

  return jsonb_build_object('ok', true, 'day_key', w.day_key, 'event_key', w.event_key,
    'slot', w.slot, 'char_slot', v_char, 'ends_at', w.ends_at, 'participants', v_tot.participants,
    'goal', v_tot.goal, 'progress', v_tot.progress);
end $$;
revoke execute on function public.world_event_join__ungated(text) from public;
revoke execute on function public.world_event_join__ungated(text) from anon, authenticated, service_role;

-- ── 7. THE ONLINE CLAIM (restated from 2026-10-10-muster-chest-xp-credit.sql §2;
--       the only change: the tally is re-derived before the band) ──────────
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
  v_median   numeric;
  v_rows     int;
  v_slot     int := coalesce(p_slot, 0);
  v_gold     bigint := 0;
  v_gems     int    := 0;
  v_band     text   := 'none';
  v_held     boolean := false;
  -- themed-chest locals
  v_chest    jsonb;
  v_gold_out bigint;
  v_gems_out int;
  v_it       jsonb;
  v_iid      text;
  v_iqty     bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
  -- the server's tally (2026-10-10-rally-points-server.sql)
  v_ref      jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  -- ── THE TALLY IS THE SERVER'S. Re-derived from the join character's
  --    journalled activity in [joined_at, window_end] and SET on the row (and
  --    the bar) before anything reads it. A stored number is never trusted.
  v_ref := public.hr_rally_refresh(auth.uid(), p_day_key);
  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Ceiling per §5.2: 7,500 gold · 10 gems. No hearth_token.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2;
  end if;

  v_chest    := public.hr_rally_chest(v_join.event_key, v_gold, v_gems, 0);
  v_gold_out := coalesce((v_chest->>'gold')::bigint, v_gold);
  v_gems_out := coalesce((v_chest->>'gems')::int,    v_gems);

  v_xc       := public.hr_rally_xp_credit(v_join.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);
    end if;
  end if;

  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         gems = coalesce(gems, 0) + v_gems_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_slot, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold_out, 0, v_xp_total, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems', v_gems_out,
                        'day_key', p_day_key,
                        'event_key', v_join.event_key,
                        'band_gold', v_gold, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp',
                        'points', v_join.points, 'char_slot', v_join.char_slot,
                        'points_by', v_ref->'by'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true, 'chest', true);
end $$;
revoke execute on function public.world_event_claim__ungated(text, int) from public;
revoke execute on function public.world_event_claim__ungated(text, int) from anon, authenticated, service_role;

-- ── 8. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every property EXECUTED. ONE block, no begin/commit; a raise anywhere reverts
-- the whole file. The row-writing probe lives in a subtransaction discarded by
-- the HR868 sentinel.
do $$
declare
  v_uid    constant uuid := '00000000-0000-4000-8000-0000b5680a01';
  v_today  text := public.hr_utc_day_key();
  v_ek     text;           -- an all_hands event key (every source at 0.5)
  v_ek_c   text;           -- an ashen_horde event key (kills only)
  v_d      date;
  v_h      int;
  v_k      text;
  v_r      jsonb;
  v_from   timestamptz := now() - interval '40 minutes';
  v_to     timestamptz := now() - interval '1 minute';
  v_mon3   text;
  v_n      bigint;
  v_p0     bigint;
  v_def    text;
  v_led0   bigint;
begin
  -- (a) GRANTS + SURFACE.
  foreach v_k in array array['public.hr_rally_point_rules(text)',
                             'public.hr_rally_points_of(uuid,integer,text,timestamp with time zone,timestamp with time zone)',
                             'public.hr_rally_refresh(uuid,text)',
                             'public.world_event_contribute__ungated(text)',
                             'public.world_event_join__ungated(text)',
                             'public.world_event_claim__ungated(text,integer)'] loop
    if has_function_privilege('authenticated', v_k, 'execute')
       or has_function_privilege('anon', v_k, 'execute') then
      raise exception 'GATE(a): % is client-executable', v_k;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.world_event_contribute(text)', 'execute')
     or has_function_privilege('anon', 'public.world_event_contribute(text)', 'execute') then
    raise exception 'GATE(a): world_event_contribute(text) grants are wrong';
  end if;
  if to_regprocedure('public.world_event_contribute(text,integer)') is not null
     or to_regprocedure('public.world_event_contribute__ungated(text,integer)') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('world_event_contribute', 'world_event_contribute__ungated')
                   and p.pronargs <> 1) then
    raise exception 'GATE(a): a points-taking world_event_contribute overload still exists';
  end if;
  if (select count(*) from public.hr_client_rpc_baseline where proname = 'world_event_contribute') <> 1
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'world_event_contribute'
                     and identity_args = 'p_event_key text' and grantee = 'authenticated') then
    raise exception 'GATE(a): hr_client_rpc_baseline does not hold exactly the one-argument contribute';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('world_event_joins', 'world_event_totals')
                and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'GATE(a): a client write grant exists on world_event_joins / world_event_totals';
  end if;
  select prosrc into v_def from pg_proc where oid = 'public.world_event_claim__ungated(text,integer)'::regprocedure;
  if strpos(v_def, 'hr_rally_refresh') = 0 or strpos(v_def, 'hr_rally_xp_credit') = 0
     or strpos(v_def, 'insert into public.player_skills') = 0 then
    raise exception 'GATE(a): the claim body does not re-derive the tally (or lost the XP credit)';
  end if;

  -- (b) THE SCORING TABLE: an unknown rally scores nothing.
  if public.hr_rally_point_rules('not-a-rally')->'sources' <> '{}'::jsonb
     or (public.hr_rally_point_rules('all_hands')->'sources'->>'kill_any')::numeric <> 0.5 then
    raise exception 'GATE(b): hr_rally_point_rules is wrong: %', public.hr_rally_point_rules('all_hands');
  end if;

  for v_d in select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date, interval '1 day')::date loop
    foreach v_h in array array[1, 13] loop
      v_k := public.hr_utc_day_key((v_d + interval '12 hours') at time zone 'utc') || '#' || v_h;
      if v_ek   is null and public.hr_rally_event_for_key(v_k) = 'all_hands'   then v_ek   := v_k; end if;
      if v_ek_c is null and public.hr_rally_event_for_key(v_k) = 'ashen_horde' then v_ek_c := v_k; end if;
    end loop;
    exit when v_ek is not null and v_ek_c is not null;
  end loop;
  if v_ek is null or v_ek_c is null then
    raise exception 'GATE(b) CANNOT RUN: no all_hands / ashen_horde key in 400 days';
  end if;
  select monster_id into v_mon3 from public.hr_bounty_monsters where tier = 3 order by monster_id limit 1;
  if v_mon3 is null then raise exception 'GATE(b) CANNOT RUN: no tier-3 monster in hr_bounty_monsters'; end if;

  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing';
  end if;

  begin  -- ── SUBTRANSACTION, discarded by the HR868 sentinel ─────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;
    -- a DECOY character in slot 1, whose activity must never score
    insert into public.player_state (user_id, slot, gold, gems, version) values (v_uid, 1, 0, 0, 1);
    update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = v_uid and slot = 1;
    update public.player_state set last_seen_at = now() where user_id = v_uid and slot = 0;

    -- THE JOURNAL (the shapes hr_apply writes). Window = [v_from, v_to].
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at) values
      -- gather wholly inside: 50 x 4 = 200
      (v_uid, 0, 'gather', 'accrue', 0, 0, 0, 50, 0, jsonb_build_object('qty', 50,
         'from', to_char((v_from + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- gather straddling the START, half inside: 40 x 0.5 x 4 = 80
      (v_uid, 0, 'gather', 'accrue', 0, 0, 0, 40, 0, jsonb_build_object('qty', 40,
         'from', to_char((v_from - interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- gather AFTER the window: 0
      (v_uid, 0, 'gather', 'accrue', 0, 0, 0, 999, 0, jsonb_build_object('qty', 999,
         'from', to_char((v_to + interval '5 seconds') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_to + interval '50 seconds') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- combat inside, tier 3, attended top-up: (3 + 1) x 10 x 3 = 120
      (v_uid, 0, 'combat', 'accrue', 0, 0, 0, 0, 0, jsonb_build_object('kills', 3, 'mon', v_mon3,
         'att', jsonb_build_object('claimed', 4, 'cap', 9, 'sim', 3, 'top', 1),
         'from', to_char((v_from + interval '12 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '14 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- combat inside, no `mon` (pre-engine row): 2 x 10 x 1 = 20
      (v_uid, 0, 'combat', 'accrue', 0, 0, 0, 0, 0, jsonb_build_object('kills', 2,
         'from', to_char((v_from + interval '15 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '16 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- smithing inside: 5 x 12 = 60; prayer (no counter) scores nothing
      (v_uid, 0, 'craft', 'accrue', 0, 0, 0, 0, 0, jsonb_build_object('made', 5, 'skill', 'smithing',
         'from', to_char((v_from + interval '17 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '18 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      (v_uid, 0, 'craft', 'accrue', 0, 0, 0, 0, 0, jsonb_build_object('made', 10, 'skill', 'prayer',
         'from', to_char((v_from + interval '19 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '20 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- an instant harvest INSIDE: 3 x 6 = 18; one AFTER the window: 0
      (v_uid, 0, 'farm', 'farm_harvest:9', 0, 0, 0, 3, 0, '{"crop":"wheat"}'::jsonb, v_from + interval '21 minutes'),
      (v_uid, 0, 'farm', 'farm_harvest:9', 0, 0, 0, 7, 0, '{"crop":"wheat"}'::jsonb, now()),
      -- the DECOY character's gathering inside the window: 0
      (v_uid, 1, 'gather', 'accrue', 0, 0, 0, 500, 0, jsonb_build_object('qty', 500,
         'from', to_char((v_from + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now());
    -- all_hands: (200 + 80 + 120 + 20 + 60 + 18) x 0.5 = 249

    -- (c) THE DERIVATION.
    v_r := public.hr_rally_points_of(v_uid, 0, v_ek, v_from, v_to);
    if (v_r->>'points')::bigint <> 249 then
      raise exception 'GATE(c): all_hands derived % points, expected 249: %', v_r->>'points', v_r;
    end if;
    v_r := public.hr_rally_points_of(v_uid, 0, v_ek_c, v_from, v_to);
    if (v_r->>'points')::bigint <> 140 then
      raise exception 'GATE(c): ashen_horde derived % points, expected 140 (kills only): %', v_r->>'points', v_r;
    end if;

    -- (d) A FORGED STORED TALLY (what the old RPC kept on a client's word) is
    --     corrected by the refresh, and the bar moves by the difference.
    insert into public.world_event_totals (event_key, participants, goal, progress)
      values (v_ek, 1, 6000, 6000) on conflict (event_key) do update set progress = 6000, met_at = null;
    insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot)
      values (v_today, v_uid, v_ek, 13, v_from, v_to, 6000, 0);
    v_r := public.world_event_contribute(v_ek);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'points')::bigint <> 249
       or (select points from public.world_event_joins where user_id = v_uid) <> 249
       or (select progress from public.world_event_totals where event_key = v_ek) <> 249 then
      raise exception 'GATE(d): the refresh did not SET the forged 6000 to the derived 249: %', v_r;
    end if;
    -- replay: nothing moves
    v_r := public.world_event_contribute(v_ek);
    if (v_r->>'added')::bigint <> 0 or (select progress from public.world_event_totals where event_key = v_ek) <> 249 then
      raise exception 'GATE(d): a replayed refresh moved the bar: %', v_r;
    end if;

    -- (e) THE CLAIM re-derives before the band, even from a forged stored value.
    update public.world_event_joins set points = 6000 where user_id = v_uid;
    select count(*) into v_led0 from public.player_ledger where user_id = v_uid and kind = 'rally';
    v_r := public.world_event_claim(v_today, 0);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'points')::bigint <> 249 then
      raise exception 'GATE(e): the claim banded on a stored number, not the derived 249: %', v_r;
    end if;
    if (select (meta->>'points')::bigint from public.player_ledger
         where user_id = v_uid and kind = 'rally' order by at desc, id desc limit 1) <> 249 then
      raise exception 'GATE(e): the rally ledger row does not journal the derived tally';
    end if;

    -- (f) NO ACTIVITY, FORGED TALLY: refused no_contribution, nothing spent.
    delete from public.world_event_joins where user_id = v_uid;
    insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot)
      values (v_today, v_uid, v_ek, 13, now() - interval '3 minutes', now() - interval '2 minutes', 6000, 0);
    select count(*) into v_led0 from public.player_ledger where user_id = v_uid and kind = 'rally';
    v_r := public.world_event_claim(v_today, 0);
    if coalesce(v_r->>'error', '') <> 'no_contribution'
       or (select claimed from public.world_event_joins where user_id = v_uid)
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'rally') <> v_led0 then
      raise exception 'GATE(f): a forged tally with no activity was not refused cleanly: %', v_r;
    end if;

    -- (g) THE JOIN records the character in play; a caller with none is refused.
    if public.hr_rally_pledge_char(v_uid) is distinct from 0 then
      raise exception 'GATE(g): the join character should be slot 0';
    end if;
    select prosrc into v_def from pg_proc where oid = 'public.world_event_join__ungated(text)'::regprocedure;
    if strpos(v_def, 'v_char := public.hr_rally_pledge_char(auth.uid());') = 0
       or strpos(v_def, 'values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char)') = 0 then
      raise exception 'GATE(g): the join does not record the server-derived character';
    end if;

    raise exception using errcode = 'HR868', message = 'rally-points-server §8 complete — rolling back';
  exception when sqlstate 'HR868' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state        where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.world_event_joins where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §8 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    perform public.hr_assert_grant_hygiene(true);
  end if;

  raise notice 'rally-points-server: points derived from the journal in the window (all_hands % = 249, '
               'ashen_horde % = 140), forged tallies corrected, claim re-derives, contribute takes no points',
               v_ek, v_ek_c;
end $$;
