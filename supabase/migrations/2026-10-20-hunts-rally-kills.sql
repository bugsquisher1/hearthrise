-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — RALLY POINTS PRICE A NAMED HUNT'S KILLS BY THE MONSTER KILLED
-- Lane C1, Security GO-WITH-CHANGES item C3 (2026-10-13).
--
-- A named hunt journals its accrue row with `mon` = the AREA id (one pointer
-- per window) — so hr_rally_points_of's tier join found nothing and scored
-- every hunt kill at the tier-1 floor (under-pay). The engine now journals
-- `km` = {monster_id: kills} on a hunt's row (accrual.js; the world tick's
-- foldCombatMeta sums it), and this restatement prices each monster at its
-- SERVER tier (hr_bounty_monsters). `km` counts only when it sums EXACTLY to
-- the row's `kills`; anything else falls back to the pre-C1 arithmetic, so a
-- training row (no `km`) scores byte-for-byte as before.
--
-- Restated WHOLE from 2026-10-10-rally-points-server.sql §3 (the only prior
-- definition; no patch chain). Two hunks: the kill_any term and one lateral.
-- Reversible: re-run that file's §3. Moves rankable/contributable points, so
-- Security GO required before apply.
-- ════════════════════════════════════════════════════════════════════════

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
  -- THE WINDOW AT THE ENGINE'S PRECISION. Engine spans are ISO strings to the
  -- MILLISECOND; a join/window bound carries MICROSECONDS. Unaligned, a span
  -- that starts on the bound overlaps it by 600 s minus a few us, and the floor
  -- below turns 20 actions into 19 (production apply 2026-10-12: 419.99997).
  -- Both bounds are truncated to the millisecond, so a ms span is cut exactly.
  p_from := date_trunc('milliseconds', p_from);
  p_to   := date_trunc('milliseconds', p_to);
  if p_to <= p_from then
    return jsonb_build_object('points', 0, 'units', '{}'::jsonb, 'by', '{}'::jsonb);
  end if;
  v_rules := public.hr_rally_point_rules(public.hr_rally_event_for_key(p_event_key));
  v_w     := v_rules->'weights';

  select jsonb_build_object(
    -- 2026-10-20 (lane C1, Security C3): a NAMED HUNT's row journals `km`, its
    -- kills BY MONSTER, because its `mon` is an area id and would score every
    -- kill at the tier-1 floor. Each monster's tier is the SERVER catalogue's
    -- (hr_bounty_monsters), never a journalled number. `km` is honoured only
    -- when it ACCOUNTS FOR the row's kills exactly; any other shape falls back
    -- to the pre-C1 term (kills x tier of `mon`, an area id scoring tier 1).
    'kill_any', coalesce(sum(case when r.kind = 'combat' and r.verb = 'accrue' then w.ov
                  * (case when k.km_kills is not null
                           and k.km_kills = (case when r.meta->>'kills' ~ c_int then (r.meta->>'kills')::numeric else -1 end)
                          then k.km_units
                          else ((case when r.meta->>'kills' ~ c_int then (r.meta->>'kills')::numeric else 0 end)
                              + (case when r.meta #>> '{att,top}' ~ c_int then (r.meta #>> '{att,top}')::numeric else 0 end))
                               * coalesce(m.tier, 1) end)
                  * (v_w->>'kill_per_tier')::numeric / w.sp end), 0),
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
    -- The hunt fold: kills and tier-weighted units over `km`, NULL when absent or
    -- malformed (a non-object, or any count that is not a bounded integer).
    cross join lateral (
      select (case when r.kind = 'combat' and jsonb_typeof(r.meta->'km') = 'object'
                    and not exists (select 1 from jsonb_each_text(r.meta->'km') e where e.value !~ c_int)
                   then (select sum(e.value::numeric) from jsonb_each_text(r.meta->'km') e) end) as km_kills,
             (case when r.kind = 'combat' and jsonb_typeof(r.meta->'km') = 'object'
                   then (select sum(case when e.value ~ c_int then e.value::numeric else 0 end * coalesce(bm.tier, 1))
                           from jsonb_each_text(r.meta->'km') e
                           left join public.hr_bounty_monsters bm on bm.monster_id = e.key) end) as km_units) k
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

-- ── §4 SELF-CHECK — executed, net zero ────────────────────────────────────
-- player_ledger is append-only, so each case is its own disjoint 20-minute
-- window rather than a delete-and-retry.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000c1a3';
  v_base timestamptz := date_trunc('milliseconds', now()) - interval '2 hours';
  v_ek   text;
  v_r    jsonb;
  v_t1   int; v_t2 int;
  v_role text;
  v_case int;
  v_meta jsonb;
  v_want numeric;
  v_f timestamptz; v_t timestamptz;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_rally_points_of(uuid,int,text,timestamptz,timestamptz)', 'execute') then
      raise exception 'GATE(a): % can execute hr_rally_points_of', v_role; end if;
  end loop;
  select tier into v_t1 from public.hr_bounty_monsters where monster_id = 'rat';
  select tier into v_t2 from public.hr_bounty_monsters where monster_id = 'hobgoblin';
  if v_t1 is null or v_t2 is null or v_t2 <= v_t1 then
    raise exception 'GATE CANNOT RUN: rat/hobgoblin tiers (%/%) are not a usable pair', v_t1, v_t2; end if;
  select x.k into v_ek
    from (select to_char(date '2026-01-01' + g, 'YYYY-MM-DD') || '#' || h as k
            from generate_series(0, 400) g, unnest(array['1', '13']) h) x
   where (public.hr_rally_point_rules(public.hr_rally_event_for_key(x.k))->'sources') ? 'kill_any'
   order by 1 limit 1;
  if v_ek is null then raise exception 'GATE CANNOT RUN: no event key resolves to a kill_any rally'; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC1C ──────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_create_character(0);
    for v_case in 1..3 loop
      v_f := v_base + (v_case - 1) * interval '30 minutes';
      v_t := v_f + interval '20 minutes';
      v_meta := case v_case
        -- (b) A HUNT ROW: 4 rats + 2 hobgoblins, the area id in `mon`.
        when 1 then jsonb_build_object('kills', 6, 'mon', 'ridge_camp', 'km', jsonb_build_object('rat', 4, 'hobgoblin', 2))
        -- (c) a `km` that does not account for the kills is IGNORED (tier-1 floor).
        when 2 then jsonb_build_object('kills', 6, 'mon', 'ridge_camp', 'km', jsonb_build_object('hobgoblin', 60))
        -- (d) TRAINING IS UNCHANGED: no km, `mon` a monster.
        else jsonb_build_object('kills', 6, 'mon', 'hobgoblin') end;
      v_want := case v_case when 1 then (4 * v_t1 + 2 * v_t2) * 25 when 2 then 6 * 25 else 6 * v_t2 * 25 end;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, 0, 'combat', 'accrue', 0, v_meta || jsonb_build_object(
                'from', to_char(v_f at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'to',   to_char(v_t at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
      v_r := public.hr_rally_points_of(v_uid, 0, v_ek, v_f, v_t);
      if coalesce((v_r #>> '{units,kill_any}')::numeric, -1) <> v_want then
        raise exception 'GATE(case %): % scored % kill units, want %', v_case, v_meta, v_r->'units', v_want; end if;
    end loop;
    raise exception using errcode = 'HRC1C', message = 'hunts-rally-kills §4 complete — rolling back';
  exception when sqlstate 'HRC1C' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): §4 LEAKED a probe row'; end if;
  raise notice 'hunts-rally-kills: EXECUTED - a hunt row priced per monster tier, an inflated km ignored, training unchanged; net zero';
end $$;
