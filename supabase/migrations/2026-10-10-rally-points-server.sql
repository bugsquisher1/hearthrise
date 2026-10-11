-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-rally-points-server.sql — RALLY POINTS ARE DERIVED BY THE SERVER
--   FROM THE CHARACTER'S OWN JOURNALLED ACTIVITY IN THE RALLY WINDOW, PAID BY
--   TIME, BANDED ON FIXED THRESHOLDS. THE BROWSER NO LONGER NAMES A NUMBER.
--
-- STATUS: STAGED, NOT APPLIED — Security review required (the points decide
-- the band, so the chest's gold and its up to 3,000 XP/day). Lane C
-- (lane/b568-rally-points-server). The Coordinator applies
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). CHAIN POSITION: AFTER 2026-10-10-muster-chest-xp-credit.sql
-- (the online claim body is restated FROM it) and AFTER
-- 2026-10-10-rally-action-times.generated.sql (the action-time catalogue).
-- §0 refuses otherwise.
--
-- REV.2 (Security GO-WITH-CHANGES @2c0f6174 + game-designer ruling 2026-10-10):
--   C1  crafts scored by ACTION, never by output (split_rune_blanks made 20 per
--       tick, 240 pts/tick, the cap in ~2 min). Now every action pays TIME.
--   C2  worker / dungeon / xp_credit / death rows are proven to score 0.
--   #3  FAIL CLOSED: an accrue row without a valid server span (or one > 24 h)
--       scores 0; only the instant farm rows read their own `at`.
--   D1  score by TIME: a gather / artisan action pays its PACED duration in
--       seconds (hr_rally_action_s, generated from src/data); kills 25 x tier;
--       farm harvest 200 / plant 20 / water 20 per plot. ~3,600 pts/h focused.
--   D2  FIXED bands: Answered 600, Silver 1,500, Gold 2,500; cap 3,000. The
--       median no longer decides anything.
--   D3  the browser's Rally one-shot is replaced by a server-granted, fixed
--       +300 on the first join of the day, journalled, no roll.
--   Every weight lives in ONE table: hr_rally_point_rules.
--
-- ── THE DEFECT (accepted residual, now closed; Security) ────────────────────
-- world_event_contribute(p_event_key, p_points) took the POINTS from the
-- browser (<= 400/call, <= 6,000/rally). The band, so the chest's gold and the
-- up-to-3,000 XP it converts, and through the median every other participant's
-- band, rode a client number. The Rally one-shot rolled a "strike" locally and
-- sent that too. CLAUDE.md §1.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   world_event_contribute(p_event_key text)            — NEW SIGNATURE
--     The (text, integer) wrapper and inner are DROPPED. The call is a REFRESH:
--     the server re-derives the caller's tally and returns it. Idempotent by
--     construction (a replay re-derives the same number).
--     → {ok, points, added, progress, goal, met, closed, by:{source:points},
--        bonus, char_slot, event_key, day_key}
--     errors: not_signed_in | not_joined | rate_limited
--   world_event_join(p_event_key text)                  — signature unchanged
--     records world_event_joins.char_slot (the CHARACTER whose activity scores,
--     hr_rally_pledge_char: the caller's own, latest heartbeat) and grants the
--     join bonus into world_event_joins.bonus (journalled: one player_ledger
--     row kind 'rally', intent 'rally_join_bonus:<day>'). The bonus is granted
--     ONLY by the insert that creates the day's join; the primary key
--     (day_key, user_id) makes that once per day. New error: no_character.
--   world_event_claim(p_day_key text, p_slot int)       — signature unchanged
--     re-derives the tally (hr_rally_refresh) BEFORE the band; bands are the
--     fixed thresholds in hr_rally_point_rules. Below Answered the claim is
--     refused (no_contribution at 0, below_answered {points, need} otherwise)
--     BEFORE the consume, so nothing is spent. The response drops `median`.
--
--   NEW, no client grant:
--     hr_rally_point_rules(event_id)  THE ONE WEIGHTS TABLE (sources per rally,
--                                     per-action weights, bench routing, bands,
--                                     cap, join bonus)
--     hr_rally_points_of(user, slot, event_key, from, to)   the derivation
--     hr_rally_refresh(user, day_key) lock + derive + set + bar delta
--
-- ── THE DERIVATION (hr_rally_points_of) ─────────────────────────────────────
-- Source: player_ledger rows of (user, the join's char_slot) in
-- [joined_at, window_end], both server-stamped at join. Only these rows score:
--   kill_any  combat / accrue      (meta.kills + meta.att.top) x kill_per_tier
--                                  x tier (hr_bounty_monsters by meta.mon; no
--                                  `mon` = tier 1, never over-credit)
--   gather    gather / accrue      meta.ticks x paced_s(node) x per_paced_second
--   crafted | smithed | cooked
--             craft / accrue       (meta.ticks - meta.burnt) x paced_s(recipe)
--                                  x per_paced_second, routed by meta.skill
--                                  through `bench` (prayer — burying bones —
--                                  counts as crafted)
--   harvest   farm / farm_harvest | farm_plant | farm_water  per row (plot)
-- Quantity NEVER counts (a multi-yield recipe pays the same as any action of
-- its duration). Every other ledger kind or verb — worker, dungeon, xp_credit,
-- death, eat, shop… — scores nothing. An unknown node/recipe scores 0.
-- WINDOW BOUNDS, FAIL CLOSED. An accrue row counts the OVERLAP share of its
-- server span (meta.from / meta.to, ISO with zone, 0 < span <= 24 h) with the
-- window, applied as units x overlap / span; an accrue row with no valid span
-- scores 0. Only the instant farm rows count by their own server `at`.
-- Each source is multiplied by the rally's weight (sources) and the sum
-- floored; the tally is least(derived + join bonus, cap).
--
-- ── THE CATALOGUE COPIES (drift-guarded) ────────────────────────────────────
-- hr_rally_action_s is GENERATED (tools/gen-rally-action-times.mjs --check).
-- hr_rally_point_rules' sources / bands / cap / bonus are mirrored for DISPLAY
-- in src/features/muster.js (EVENTS[].sources, BANDS, TOTAL_CAP, JOIN_BONUS);
-- tests/rally-points-server.mjs RPS-9 holds them equal. The browser never
-- scores.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- hr_rally_refresh takes the join row FOR UPDATE, derives, and SETS points
-- (never raise-only); the bar moves by the signed difference in the same
-- transaction (floored at 0; met_at is never unset). The join bonus rides the
-- join's own insert (ON CONFLICT DO NOTHING; row_count decides), so a replayed
-- or concurrent join cannot grant it twice. The claim's once-guard is unchanged.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Strictly narrower: no client value reaches the tally — event key, character,
-- window, every unit and every weight are the server's own rows. Points stored
-- by the old RPC are CORRECTED on the next refresh or claim.
--
-- ── KNOWN LIMITATIONS (stated for review) ───────────────────────────────────
--   · The tally lags play by the settle cadence (attended ~90 s, away up to the
--     tick's fold). The claim settles-first on the CLAIM slot; unsettled
--     activity of a different join character is not counted.
--   · met_at may be set by a refresh after the window closes, from activity
--     inside the window that settled late.
--   · Dungeon kills are not scored (the client never scored them either).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One new row per join (the bonus journal; the join itself is already one row).
-- One indexed range scan of player_ledger_user_idx (user, slot, at >= joined_at)
-- per refresh, ~24–120 rows per character per day, plus PK lookups into two
-- small catalogues. The browser refreshes every 30 s while joined (the old
-- flush cadence): call rate unchanged at 100x players.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-08-08-muster.sql §5–§6 bodies under the A9 names with the A9
-- wrapper and the baseline row, re-apply 2026-10-10-muster-chest-xp-credit.sql
-- §2, drop the four new functions. char_slot / bonus may stay.
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
  if to_regclass('public.hr_rally_action_s') is null
     or not exists (select 1 from public.hr_rally_action_s where kind = 'artisan')
     or not exists (select 1 from public.hr_rally_action_s where kind = 'gather') then
    raise exception '§0: hr_rally_action_s missing or empty — apply 2026-10-10-rally-action-times.generated.sql FIRST';
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

-- ── 1. THE JOIN RECORDS WHICH CHARACTER SCORES, AND ITS BONUS ──────────────
-- world_event_joins.slot is the rally WINDOW (1 | 13) and always was. char_slot
-- is the character, derived server-side at join (never a client value). bonus
-- is the server-granted join bonus, written only by the insert that creates
-- the day's join.
alter table public.world_event_joins add column if not exists char_slot int;
alter table public.world_event_joins add column if not exists bonus int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'world_event_joins_char_slot_ck'
                  and conrelid = 'public.world_event_joins'::regclass) then
    alter table public.world_event_joins
      add constraint world_event_joins_char_slot_ck check (char_slot is null or char_slot between 0 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'world_event_joins_bonus_ck'
                  and conrelid = 'public.world_event_joins'::regclass) then
    alter table public.world_event_joins
      add constraint world_event_joins_bonus_ck check (bonus between 0 and 1000);
  end if;
end $$;
comment on column public.world_event_joins.char_slot is
  'The CHARACTER whose journalled activity scores this rally, server-derived at join by '
  'hr_rally_pledge_char (2026-10-10-rally-points-server.sql). `slot` is the rally WINDOW (1|13).';
comment on column public.world_event_joins.bonus is
  'The server-granted join bonus (hr_rally_point_rules weights.join_bonus), written only by the '
  'insert that creates the day''s join and journalled as rally_join_bonus:<day> (2026-10-10-rally-points-server.sql).';

-- ── 2. THE ONE WEIGHTS TABLE (pure; no client grant) ───────────────────────
-- Game Designer owns every number here (ruling 2026-10-10). A balance change is
-- an edit to THIS function and nothing else. `sources` and `bands`/`cap`/
-- `join_bonus` are mirrored for display in src/features/muster.js (RPS-9).
create or replace function public.hr_rally_point_rules(p_event_id text)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    -- which activity each rally counts, and at what share
    'sources', case p_event_id
      when 'ashen_horde'   then '{"kill_any":1}'::jsonb
      when 'long_harvest'  then '{"harvest":1,"gather":1}'::jsonb
      when 'forge_levy'    then '{"smithed":1,"crafted":1}'::jsonb
      when 'deep_seam'     then '{"gather":1}'::jsonb
      when 'keep_kitchens' then '{"cooked":1}'::jsonb
      when 'all_hands'     then '{"kill_any":0.5,"gather":0.5,"harvest":0.5,"cooked":0.5,"smithed":0.5,"crafted":0.5}'::jsonb
      else '{}'::jsonb end,
    -- what one action is worth. Gather/artisan pay paced seconds
    -- (hr_rally_action_s) x per_paced_second; ~3,600 pts per focused hour.
    'weights', '{"per_paced_second":1,"kill_per_tier":25,"farm_harvest":200,"farm_plant":20,"farm_water":20,"join_bonus":300}'::jsonb,
    -- which counter an artisan bench feeds
    'bench',   '{"cooking":"cooked","smithing":"smithed","crafting":"crafted","runecrafting":"crafted","stonemason":"crafted","prayer":"crafted"}'::jsonb,
    -- FIXED band thresholds (points), and the per-rally cap
    'bands',   '{"answered":600,"silver":1500,"gold":2500}'::jsonb,
    'cap',     3000)
$$;
revoke execute on function public.hr_rally_point_rules(text) from public;
revoke execute on function public.hr_rally_point_rules(text) from anon, authenticated, service_role;

-- ── 3. THE DERIVATION (stable; no client grant) ────────────────────────────
create or replace function public.hr_rally_points_of(p_user uuid, p_slot int, p_event_key text,
                                                     p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  -- An engine timestamp: ISO-8601 with an explicit zone.
  c_iso      constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$';
  c_int      constant text := '^[0-9]{1,9}$';
  c_max_span constant interval := interval '24 hours';
  v_rules jsonb;
  v_w     jsonb;
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
  v_w     := v_rules->'weights';

  select jsonb_build_object(
    'kill_any', coalesce(sum(case when r.kind = 'combat' and r.verb = 'accrue' then w.ov
                  * ((case when r.meta->>'kills' ~ c_int then (r.meta->>'kills')::numeric else 0 end)
                   + (case when r.meta #>> '{att,top}' ~ c_int then (r.meta #>> '{att,top}')::numeric else 0 end))
                  * (v_w->>'kill_per_tier')::numeric * coalesce(m.tier, 1) / w.sp end), 0),
    'gather',   coalesce(sum(case when r.kind = 'gather' and r.verb = 'accrue' then w.ov
                  * (case when r.meta->>'ticks' ~ c_int then (r.meta->>'ticks')::numeric else 0 end)
                  * coalesce(a.paced_s, 0) * (v_w->>'per_paced_second')::numeric / w.sp end), 0),
    'crafted',  coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'crafted' then w.ov
                  * greatest(0::numeric, (case when r.meta->>'ticks' ~ c_int then (r.meta->>'ticks')::numeric else 0 end)
                                       - (case when r.meta->>'burnt' ~ c_int then (r.meta->>'burnt')::numeric else 0 end))
                  * coalesce(a.paced_s, 0) * (v_w->>'per_paced_second')::numeric / w.sp end), 0),
    'smithed',  coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'smithed' then w.ov
                  * greatest(0::numeric, (case when r.meta->>'ticks' ~ c_int then (r.meta->>'ticks')::numeric else 0 end)
                                       - (case when r.meta->>'burnt' ~ c_int then (r.meta->>'burnt')::numeric else 0 end))
                  * coalesce(a.paced_s, 0) * (v_w->>'per_paced_second')::numeric / w.sp end), 0),
    'cooked',   coalesce(sum(case when r.kind = 'craft' and r.verb = 'accrue'
                  and v_rules->'bench'->>(r.meta->>'skill') = 'cooked' then w.ov
                  * greatest(0::numeric, (case when r.meta->>'ticks' ~ c_int then (r.meta->>'ticks')::numeric else 0 end)
                                       - (case when r.meta->>'burnt' ~ c_int then (r.meta->>'burnt')::numeric else 0 end))
                  * coalesce(a.paced_s, 0) * (v_w->>'per_paced_second')::numeric / w.sp end), 0),
    'harvest',  coalesce(sum(case when r.kind = 'farm' then w.ov
                  * (case r.verb when 'farm_harvest' then (v_w->>'farm_harvest')::numeric
                                 when 'farm_plant'   then (v_w->>'farm_plant')::numeric
                                 when 'farm_water'   then (v_w->>'farm_water')::numeric
                                 else 0::numeric end) / w.sp end), 0))
    into v_units
    from (select l.kind, split_part(l.intent, ':', 1) as verb, l.at, l.meta,
                 case when l.meta->>'from' ~ c_iso and l.meta->>'to' ~ c_iso
                      then (l.meta->>'from')::timestamptz end as f,
                 case when l.meta->>'from' ~ c_iso and l.meta->>'to' ~ c_iso
                      then (l.meta->>'to')::timestamptz end as t
            from public.player_ledger l
           where l.user_id = p_user and l.slot = p_slot
             and l.at >= p_from                       -- nothing settled before the window can overlap it
             and l.kind in ('combat', 'gather', 'craft', 'farm')) r
    -- THE WINDOW, FAIL CLOSED. ov / sp is the row's share inside
    -- [p_from, p_to]: an accrue row's server-span overlap over its span (no
    -- valid span: 0), an instant farm row 1/1 by its own `at`. Applied as
    -- units x ov / sp, so 1,200 x 20/240 is 100 and not 99.999...
    cross join lateral (
      select (case
        when r.kind = 'farm' then (case when r.at <= p_to then 1::numeric else 0::numeric end)
        when r.f is not null and r.t > r.f and r.t - r.f <= c_max_span then
          greatest(0::numeric, (extract(epoch from (least(r.t, p_to) - greatest(r.f, p_from))))::numeric)
        else 0::numeric end) as ov,
             (case
        when r.kind <> 'farm' and r.f is not null and r.t > r.f and r.t - r.f <= c_max_span then
          (extract(epoch from (r.t - r.f)))::numeric
        else 1::numeric end) as sp) w
    left join public.hr_bounty_monsters m on r.kind = 'combat' and m.monster_id = r.meta->>'mon'
    left join public.hr_rally_action_s a
           on (r.kind = 'gather' and a.kind = 'gather'  and a.activity_id = r.meta->>'node')
           or (r.kind = 'craft'  and a.kind = 'artisan' and a.activity_id = r.meta->>'recipe');

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
  v_join public.world_event_joins%rowtype;
  v_tot  public.world_event_totals%rowtype;
  v_char int;
  v_d    jsonb;
  v_cap  bigint;
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
  v_cap := (public.hr_rally_point_rules(public.hr_rally_event_for_key(v_join.event_key))->>'cap')::bigint;
  -- SET, never raise-only: a number the old RPC stored on a client's word is
  -- corrected here, down as well as up. The join bonus is the server's own row.
  v_new := least(greatest(coalesce((v_d->>'points')::bigint, 0), 0) + v_join.bonus, v_cap);
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
    'by', coalesce(v_d->'by', '{}'::jsonb), 'bonus', v_join.bonus, 'char_slot', v_char,
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

-- ── 6. THE JOIN (restated from 2026-08-08-muster.sql §5: char_slot + bonus) ─
create or replace function public.world_event_join__ungated(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_goal_per_player constant bigint := 2000;
  c_min_goal        constant bigint := 6000;
  c_freeze_min      constant int    := 10;
  w record;
  v_rows  int;
  v_char  int;
  v_bonus int;
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

  -- THE JOIN BONUS rides the insert that creates the day's join: a fixed
  -- server number, no roll; the primary key makes it once per day.
  v_bonus := coalesce((public.hr_rally_point_rules(public.hr_rally_event_for_key(w.event_key))
                        #>> '{weights,join_bonus}')::int, 0);

  insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, char_slot, bonus, points)
  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char, v_bonus, v_bonus)
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

  -- The bonus is journalled (a points grant, not a value movement: every
  -- value column 0).
  if v_bonus > 0 then
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (auth.uid(), v_char, 'rally', 'rally_join_bonus:' || w.day_key, 0, 0, 0, 0, 0,
       jsonb_build_object('points', v_bonus, 'event_key', w.event_key, 'window', w.slot));
  end if;

  insert into public.world_event_totals (event_key, participants, goal, goal_frozen_at)
    values (w.event_key, 0, c_min_goal, w.started_at + make_interval(mins => c_freeze_min))
    on conflict (event_key) do nothing;
  update public.world_event_totals
     set participants = participants + 1,
         progress = progress + v_bonus,
         goal = case when now() < goal_frozen_at
                     then greatest(c_min_goal, c_goal_per_player * (participants + 1))
                     else goal end
   where event_key = w.event_key
   returning * into v_tot;

  return jsonb_build_object('ok', true, 'day_key', w.day_key, 'event_key', w.event_key,
    'slot', w.slot, 'char_slot', v_char, 'bonus', v_bonus, 'points', v_bonus,
    'ends_at', w.ends_at, 'participants', v_tot.participants,
    'goal', v_tot.goal, 'progress', v_tot.progress);
end $$;
revoke execute on function public.world_event_join__ungated(text) from public;
revoke execute on function public.world_event_join__ungated(text) from anon, authenticated, service_role;

-- ── 7. THE ONLINE CLAIM (restated from 2026-10-10-muster-chest-xp-credit.sql §2:
--       the tally is re-derived, the bands are FIXED) ────────────────────────
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
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
  -- the server's tally and its fixed bands (2026-10-10-rally-points-server.sql)
  v_ref      jsonb;
  v_bands    jsonb;
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
  v_bands := public.hr_rally_point_rules(public.hr_rally_event_for_key(v_join.event_key))->'bands';
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if v_join.points < (v_bands->>'answered')::bigint then
    return jsonb_build_object('ok', false, 'error', 'below_answered',
                              'points', v_join.points, 'need', (v_bands->>'answered')::bigint);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  -- FIXED bands (game-designer ruling 2026-10-10): nobody else's tally moves
  -- yours. Ceiling per §5.2: 7,500 gold · 10 gems. No hearth_token.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= (v_bands->>'silver')::bigint then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= (v_bands->>'gold')::bigint then
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
                        'points', v_join.points, 'bonus', v_join.bonus,
                        'char_slot', v_join.char_slot, 'points_by', v_ref->'by'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'points', v_join.points,
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
  v_ps_oak int;
  v_ps_split int;
  v_ps_bury int;
  v_want   bigint;
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
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
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
     or strpos(v_def, 'insert into public.player_skills') = 0 or strpos(v_def, 'percentile_cont') > 0 then
    raise exception 'GATE(a): the claim body does not re-derive the tally, lost the XP credit, or bands on a median';
  end if;

  -- (b) THE WEIGHTS TABLE (the designer's numbers) and an unknown rally.
  v_r := public.hr_rally_point_rules('all_hands');
  if public.hr_rally_point_rules('not-a-rally')->'sources' <> '{}'::jsonb
     or (v_r->'sources'->>'kill_any')::numeric <> 0.5
     or v_r->'bands' <> '{"answered":600,"silver":1500,"gold":2500}'::jsonb
     or (v_r->>'cap')::int <> 3000 or (v_r#>>'{weights,join_bonus}')::int <> 300
     or (v_r#>>'{weights,kill_per_tier}')::int <> 25 then
    raise exception 'GATE(b): hr_rally_point_rules is not the ruled table: %', v_r;
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
  select paced_s into v_ps_oak   from public.hr_rally_action_s where kind = 'gather'  and activity_id = 'oak_tree';
  select paced_s into v_ps_split from public.hr_rally_action_s where kind = 'artisan' and activity_id = 'split_rune_blanks';
  select paced_s into v_ps_bury  from public.hr_rally_action_s where kind = 'artisan' and activity_id = 'bury_bones';
  if v_mon3 is null or v_ps_oak is null or v_ps_split is null or v_ps_bury is null then
    raise exception 'GATE(b) CANNOT RUN: catalogue rows missing (tier-3 monster, oak_tree, split_rune_blanks, bury_bones)';
  end if;

  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing';
  end if;

  begin  -- ── SUBTRANSACTION, discarded by the HR868 sentinel ─────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;
    insert into public.player_state (user_id, slot, gold, gems, version) values (v_uid, 1, 0, 0, 1);
    update public.player_state set last_seen_at = now() - interval '1 hour' where user_id = v_uid and slot = 1;
    update public.player_state set last_seen_at = now() where user_id = v_uid and slot = 0;

    -- THE JOURNAL (the shapes hr_apply writes). Window = [v_from, v_to].
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
    select v_uid, x.slot, x.kind, x.intent, 0, 0, 0, x.qty, 0, x.meta, x.at
      from (values
      -- gather inside: 50 actions of oak  -> 50 x ps_oak
      (0, 'gather', 'accrue', 50, jsonb_build_object('ticks', 50, 'qty', 50, 'node', 'oak_tree',
         'from', to_char((v_from + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- gather straddling the START, half inside: 20 x ps_oak
      (0, 'gather', 'accrue', 40, jsonb_build_object('ticks', 40, 'qty', 999, 'node', 'oak_tree',
         'from', to_char((v_from - interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- gather AFTER the window: 0
      (0, 'gather', 'accrue', 99, jsonb_build_object('ticks', 99, 'qty', 99, 'node', 'oak_tree',
         'from', to_char((v_to + interval '5 seconds') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_to + interval '50 seconds') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- gather with NO span, stamped inside the window: FAIL CLOSED, 0
      (0, 'gather', 'accrue', 500, '{"ticks":500,"qty":500,"node":"oak_tree"}'::jsonb, v_from + interval '6 minutes'),
      -- combat inside, tier 3, attended top-up: (3 + 1) x 25 x 3 = 300
      (0, 'combat', 'accrue', 0, jsonb_build_object('kills', 3, 'mon', v_mon3,
         'att', jsonb_build_object('claimed', 4, 'cap', 9, 'sim', 3, 'top', 1),
         'from', to_char((v_from + interval '12 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '14 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- combat inside, no `mon`: 2 x 25 x 1 = 50
      (0, 'combat', 'accrue', 0, jsonb_build_object('kills', 2,
         'from', to_char((v_from + interval '15 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '16 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- MULTI-YIELD craft: 12 actions (240 made) of split_rune_blanks -> 12 x ps_split
      (0, 'craft', 'accrue', 0, jsonb_build_object('ticks', 12, 'burnt', 0, 'made', 240, 'skill', 'stonemason',
         'recipe', 'split_rune_blanks',
         'from', to_char((v_from + interval '17 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '18 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- burying bones, 10 actions -> 10 x ps_bury (prayer counts as crafted)
      (0, 'craft', 'accrue', 0, jsonb_build_object('ticks', 10, 'made', 0, 'skill', 'prayer', 'recipe', 'bury_bones',
         'from', to_char((v_from + interval '19 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '20 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      -- farm inside: harvest 200 + plant 20; water AFTER the window: 0
      (0, 'farm', 'farm_harvest:9', 3, '{"crop":"wheat","plot":9}'::jsonb, v_from + interval '21 minutes'),
      (0, 'farm', 'farm_plant:9',   0, '{"crop":"wheat","plot":9}'::jsonb, v_from + interval '22 minutes'),
      (0, 'farm', 'farm_water:9',   0, '{"crop":"wheat","plot":9}'::jsonb, now()),
      -- rows that must score NOTHING: worker, dungeon, xp_credit, death, and the decoy character
      (0, 'worker', 'accrue', 400, jsonb_build_object('qty', 400, 'ticks', 400, 'node', 'oak_tree', 'kills', 50,
         'from', to_char((v_from + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now()),
      (0, 'dungeon', 'dungeon_settle', 9, '{"kills":40,"item_qty":9}'::jsonb, v_from + interval '23 minutes'),
      (0, 'combat', 'xp_credit', 0, '{"kills":60,"credit":26}'::jsonb, v_from + interval '24 minutes'),
      (0, 'combat', 'death', 0, jsonb_build_object('monster', v_mon3, 'kills', 70), v_from + interval '25 minutes'),
      (1, 'gather', 'accrue', 500, jsonb_build_object('ticks', 500, 'qty', 500, 'node', 'oak_tree',
         'from', to_char((v_from + interval '5 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'to',   to_char((v_from + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now())
      ) x(slot, kind, intent, qty, meta, at);
    -- all_hands: floor(0.5 x (70 x ps_oak + 350 + 12 x ps_split + 10 x ps_bury + 220))
    v_want := floor(0.5 * (70 * v_ps_oak + 350 + 12 * v_ps_split + 10 * v_ps_bury + 220));

    -- (c) THE DERIVATION.
    v_r := public.hr_rally_points_of(v_uid, 0, v_ek, v_from, v_to);
    if (v_r->>'points')::bigint <> v_want then
      raise exception 'GATE(c): all_hands derived % points, expected %: %', v_r->>'points', v_want, v_r;
    end if;
    v_r := public.hr_rally_points_of(v_uid, 0, v_ek_c, v_from, v_to);
    if (v_r->>'points')::bigint <> 350 then
      raise exception 'GATE(c): ashen_horde derived % points, expected 350 (kills only): %', v_r->>'points', v_r;
    end if;

    -- (d) A FORGED STORED TALLY is corrected by the refresh (+ the join's own
    --     bonus), and the bar moves by the difference.
    insert into public.world_event_totals (event_key, participants, goal, progress)
      values (v_ek, 1, 6000, 6000) on conflict (event_key) do update set progress = 6000, met_at = null;
    insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot, bonus)
      values (v_today, v_uid, v_ek, 13, v_from, v_to, 6000, 0, 300);
    v_r := public.world_event_contribute(v_ek);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'points')::bigint <> v_want + 300
       or (select points from public.world_event_joins where user_id = v_uid) <> v_want + 300
       or (select progress from public.world_event_totals where event_key = v_ek) <> v_want + 300 then
      raise exception 'GATE(d): the refresh did not SET the forged 6000 to the derived % + 300: %', v_want, v_r;
    end if;
    v_r := public.world_event_contribute(v_ek);
    if (v_r->>'added')::bigint <> 0 then
      raise exception 'GATE(d): a replayed refresh moved the tally: %', v_r;
    end if;

    -- (e) THE CLAIM re-derives before the FIXED band, even from a forged value.
    update public.world_event_joins set points = 6000 where user_id = v_uid;
    v_r := public.world_event_claim(v_today, 0);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'points')::bigint <> v_want + 300
       or v_r->>'band' <> (case when v_want + 300 >= 2500 then 'gold' when v_want + 300 >= 1500 then 'silver' else 'answered' end) then
      raise exception 'GATE(e): the claim did not band the derived % on the fixed thresholds: %', v_want + 300, v_r;
    end if;

    -- (f) BELOW ANSWERED (a forged stored 6000, 100 real points): refused, nothing spent.
    delete from public.world_event_joins where user_id = v_uid;
    insert into public.world_event_joins (day_key, user_id, event_key, slot, joined_at, window_end, points, char_slot, bonus)
      values (v_today, v_uid, v_ek, 13, now() - interval '3 minutes', now() - interval '2 minutes', 6000, 0, 100);
    select count(*) into v_led0 from public.player_ledger where user_id = v_uid and kind = 'rally';
    v_r := public.world_event_claim(v_today, 0);
    if coalesce(v_r->>'error', '') <> 'below_answered' or (v_r->>'points')::int <> 100
       or (select claimed from public.world_event_joins where user_id = v_uid)
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'rally') <> v_led0 then
      raise exception 'GATE(f): a tally below Answered was not refused cleanly: %', v_r;
    end if;

    -- (g) THE JOIN records the character and grants the bonus on its insert only.
    select prosrc into v_def from pg_proc where oid = 'public.world_event_join__ungated(text)'::regprocedure;
    if strpos(v_def, 'v_char := public.hr_rally_pledge_char(auth.uid());') = 0
       or strpos(v_def, 'values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at, v_char, v_bonus, v_bonus)') = 0 then
      raise exception 'GATE(g): the join does not record the server-derived character and bonus';
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

  raise notice 'rally-points-server: time-scored from the journal (all_hands % = %, ashen_horde % = 350), fixed bands, '
               'forged tallies corrected, claim re-derives, contribute takes no points', v_ek, v_want, v_ek_c;
end $$;
