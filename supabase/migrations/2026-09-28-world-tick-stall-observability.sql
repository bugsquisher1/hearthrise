-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-28-world-tick-stall-observability.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE FIRE LOG CARRIES WHAT THE EDGE ANSWERED, AND A STALL IS A QUERY.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- Production, 2026-09-26/27: the tick journalled ZERO hr_tick_shadow rows for
-- 21.9 h (combat) and 14.7 h (gather) while pg_cron fired every 10 s, every
-- fire `posted`, rostered = 2, HTTP 200. Every cron-grain read — rows/h by
-- outcome, the refused counts — read GREEN through the whole stall, because
-- `hr_tick_cron_log.detail` carries only {auth, bucket, holder, shadow,
-- cursor_wrapped}. What the edge actually answered — `refused: 1, reasons:
-- {window_already_settled: 1}` on every fire — lived only in pg_net's response
-- table, which keeps ~6 h. The cause (a microsecond mark against a millisecond
-- window start) is fixed on the edge in the same lane
-- (tick-contract.js fenceWindowFrom, tests/world-tick-stall-after-repoint.mjs).
-- This file makes the NEXT stall visible from the database alone.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
-- §1 hr_tick_edge_summary(text) — pure: one edge response body -> the counts
--    {settled, shadowed, skipped, refused}, `below_flush`, and the top
--    skip/refuse reason other than `below_flush` (which is the benign reason
--    on 8 of every 9 fires and would otherwise always win).
-- §2 hr_tick_edge_harvest() — reads the tick's own responses out of
--    `net._http_response` (SELECT is PUBLIC there, granted by supabase_admin;
--    dynamic SQL so this file applies where pg_net is absent), every response
--    since the last one a fire recorded, bounded, and folds them into one
--    summary. Nothing is written by it.
-- §3 hr_tick_cron_note — restated: a `posted` fire's detail gains `edge`, the
--    summary of every tick response that landed since the previous harvest. One
--    fire of lag (pg_net answers after this transaction commits), and no new
--    grant: the note already runs as the owner, from the cron driver only.
-- §4 hr_tick_stall_status(...) — the invariant as a query: "rostered >= 1 and
--    shadow rows/h < 30 for 2 h => stalled", per hour bucket, with the edge's
--    own top reason beside each bucket so a red explains itself.
--    tests/world-tick-stall-guard.mjs is the standing guard over it.
--
-- NOTHING HERE MOVES VALUE. No table, no column, no client surface. Every
-- function is revoked from every role but the owner.
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE SUMMARY OF ONE EDGE BODY ─────────────────────────────────────────
-- Pure and total: an unparseable or foreign body is NULL, never an error, so a
-- garbage response can never make a fire fail to log. The reason string is the
-- edge's own (bounded at 64 by tick.js) with any long hex run masked, because
-- this log is read by an operator and d8 of 2026-09-22-world-tick-derived-token
-- keeps 64-hex runs out of `detail`.
create or replace function public.hr_tick_edge_summary(p_body text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_b      jsonb;
  v_top    text;
  v_top_n  bigint;
begin
  if p_body is null or length(p_body) > 65536 then return null; end if;
  begin
    v_b := p_body::jsonb;
  exception when others then
    return null;
  end;
  if jsonb_typeof(v_b) <> 'object' or coalesce(v_b->>'op', '') <> 'tick' then return null; end if;
  if jsonb_typeof(v_b->'reasons') = 'object' then
    select r.key, (r.value)::bigint into v_top, v_top_n
      from jsonb_each_text(v_b->'reasons') r
     where r.key <> 'below_flush' and r.value ~ '^[0-9]{1,12}$'
     order by (r.value)::bigint desc, r.key asc
     limit 1;
  end if;
  return jsonb_build_object(
    'settled',  case when (v_b->>'processed') ~ '^[0-9]{1,9}$' then (v_b->>'processed')::int else 0 end,
    'shadowed', case when (v_b->>'shadowed')  ~ '^[0-9]{1,9}$' then (v_b->>'shadowed')::int  else 0 end,
    'skipped',  case when (v_b->>'skipped')   ~ '^[0-9]{1,9}$' then (v_b->>'skipped')::int   else 0 end,
    'refused',  case when (v_b->>'refused')   ~ '^[0-9]{1,9}$' then (v_b->>'refused')::int   else 0 end,
    'below_flush', case when (v_b#>>'{reasons,below_flush}') ~ '^[0-9]{1,9}$'
                        then (v_b#>>'{reasons,below_flush}')::int else 0 end,
    'disabled', coalesce((v_b->>'disabled') = 'true', false),
    'top_reason', case when v_top is null then null
                       else left(regexp_replace(v_top, '[0-9a-fA-F]{32,}', '<hex>', 'g'), 64) end,
    'top_n', coalesce(v_top_n, 0));
end $$;

-- ── §2 THE HARVEST ──────────────────────────────────────────────────────────
-- Every tick response since the last one a fire recorded (`edge.last_id` on
-- the newest log row carrying one), capped at 32 and at 10 minutes of age, so
-- a first harvest after a quiet spell cannot fold six hours into one row. The
-- filter is on the BODY (`"op":"tick"` — the edge's own summary shape), because
-- `net._http_response` is shared with every other pg_net caller in the project.
-- A response with no parseable tick body (a 401, a gateway 5xx, a timeout) is
-- still COUNTED, by status, because "the edge answered something else" is the
-- other stall this log has to show.
create or replace function public.hr_tick_edge_harvest()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_last   bigint;
  v_rows   jsonb;
  v_out    jsonb;
begin
  if to_regclass('net._http_response') is null then return null; end if;

  select max((l.detail#>>'{edge,last_id}')::bigint) into v_last
    from public.hr_tick_cron_log l
   where l.at > now() - interval '6 hours'
     and l.outcome = 'posted'
     and (l.detail#>>'{edge,last_id}') ~ '^[0-9]{1,18}$';

  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'status', r.status_code, 'timed_out', coalesce(r.timed_out, false),
             's', public.hr_tick_edge_summary(r.content)) order by r.id), '[]'::jsonb)
      from (select id, status_code, timed_out, content
              from net._http_response
             where id > coalesce($1, 0)
               and created > now() - interval '10 minutes'
               and (content like '%"op":"tick"%' or content like '%"op": "tick"%'
                    or status_code is distinct from 200)
             order by id
             limit 32) r
  $q$ into v_rows using v_last;

  if jsonb_array_length(v_rows) = 0 then return null; end if;

  select jsonb_build_object(
           'responses',   count(*),
           'non_tick',    count(*) filter (where e->'s' is null or jsonb_typeof(e->'s') = 'null'),
           'last_status', (array_agg((e->>'status') order by (e->>'id')::bigint desc))[1],
           'timed_out',   count(*) filter (where (e->>'timed_out')::boolean),
           'settled',     coalesce(sum((e#>>'{s,settled}')::int), 0),
           'shadowed',    coalesce(sum((e#>>'{s,shadowed}')::int), 0),
           'skipped',     coalesce(sum((e#>>'{s,skipped}')::int), 0),
           'refused',     coalesce(sum((e#>>'{s,refused}')::int), 0),
           'below_flush', coalesce(sum((e#>>'{s,below_flush}')::int), 0),
           'last_id',     max((e->>'id')::bigint))
    into v_out
    from jsonb_array_elements(v_rows) e;

  -- The top reason ACROSS the folded responses, by summed count.
  return v_out || coalesce((
    select jsonb_build_object('top_reason', t.reason, 'top_n', t.n)
      from (select e#>>'{s,top_reason}' as reason, sum((e#>>'{s,top_n}')::bigint) as n
              from jsonb_array_elements(v_rows) e
             where (e#>>'{s,top_reason}') is not null
             group by 1
             order by 2 desc, 1 asc
             limit 1) t), '{}'::jsonb);
end $$;

-- ── §3 THE NOTE, RESTATED ───────────────────────────────────────────────────
-- Byte-for-byte the 2026-09-21 note plus ONE thing: a `posted` fire's detail
-- gains `edge`. The harvest cannot fail the note — a pg_net schema that moved
-- under us costs the edge block on that row, never the row itself.
create or replace function public.hr_tick_cron_note(
  p_outcome text, p_ms int, p_rostered int default 0,
  p_eff int default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_edge   jsonb;
  v_detail jsonb := p_detail;
begin
  if p_outcome in ('disabled', 'locked')
     and exists (select 1 from public.hr_tick_cron_log
                  where outcome = p_outcome and at > now() - interval '5 minutes') then
    return;
  end if;
  if p_outcome = 'posted' then
    begin
      v_edge := public.hr_tick_edge_harvest();
    exception when others then
      v_edge := jsonb_build_object('harvest_error', sqlstate);
    end;
    if v_edge is not null then
      v_detail := coalesce(v_detail, '{}'::jsonb) || jsonb_build_object('edge', v_edge);
    end if;
  end if;
  insert into public.hr_tick_cron_log (outcome, ms, rostered, effective_cadence_seconds, detail)
  values (p_outcome, coalesce(p_ms, 0), coalesce(p_rostered, 0), p_eff, v_detail);
end $$;

-- ── §4 THE STALL, AS A QUERY ────────────────────────────────────────────────
-- Per whole hour ending at `p_now`, over `p_hours` buckets:
--   rostered_fires  `posted` fires that handed the edge >= 1 character
--   shadow_rows     hr_tick_shadow rows journalled in the bucket
--   edge            the harvested counts and top reason of the bucket
-- STALLED when the tick is enabled IN SHADOW and EVERY bucket had rostered
-- fires and fewer than `p_min_rows_per_hour` shadow rows. Armed, shadow rows
-- are zero by design and this query does not judge (`judged: false`) — the
-- armed read is the ledger, and it is not this file's.
-- `p_now` is a parameter so the self-check (and the guard) can plant a history
-- at an instant no real row occupies.
create or replace function public.hr_tick_stall_status(
  p_now timestamptz default now(), p_hours int default 2, p_min_rows_per_hour int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg     public.hr_tick_config%rowtype;
  v_hours   int := least(greatest(coalesce(p_hours, 2), 1), 48);
  v_min     int := greatest(coalesce(p_min_rows_per_hour, 30), 1);
  v_buckets jsonb;
  v_stalled boolean;
begin
  select * into v_cfg from public.hr_tick_config where id;

  with b as (
    select g as i,
           p_now - make_interval(hours => g + 1) as lo,
           p_now - make_interval(hours => g)     as hi
      from generate_series(0, v_hours - 1) g
  )
  select jsonb_agg(jsonb_build_object(
           'from', b.lo, 'to', b.hi,
           'rostered_fires', (select count(*) from public.hr_tick_cron_log l
                               where l.at >= b.lo and l.at < b.hi
                                 and l.outcome = 'posted' and l.rostered >= 1),
           'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                               where s.at >= b.lo and s.at < b.hi),
           'edge', (select jsonb_build_object(
                             'refused', coalesce(sum((l.detail#>>'{edge,refused}')::int), 0),
                             'shadowed', coalesce(sum((l.detail#>>'{edge,shadowed}')::int), 0),
                             'top_reason', (select l2.detail#>>'{edge,top_reason}'
                                              from public.hr_tick_cron_log l2
                                             where l2.at >= b.lo and l2.at < b.hi
                                               and l2.detail#>>'{edge,top_reason}' is not null
                                             group by 1 order by count(*) desc, 1 limit 1))
                      from public.hr_tick_cron_log l
                     where l.at >= b.lo and l.at < b.hi and l.detail ? 'edge'))
           order by b.i)
    into v_buckets
    from b;

  v_stalled := coalesce(v_cfg.enabled, false) and coalesce(v_cfg.shadow, false)
    and not exists (select 1 from jsonb_array_elements(v_buckets) e
                     where (e->>'rostered_fires')::int < 1
                        or (e->>'shadow_rows')::int >= v_min);

  return jsonb_build_object(
    'ok', not v_stalled,
    'stalled', v_stalled,
    'judged', coalesce(v_cfg.enabled, false) and coalesce(v_cfg.shadow, false),
    'mode', case when not coalesce(v_cfg.enabled, false) then 'off'
                 when coalesce(v_cfg.shadow, false) then 'shadow' else 'armed' end,
    'hours', v_hours, 'min_rows_per_hour', v_min, 'at', p_now,
    'buckets', v_buckets);
end $$;

-- ── §5 GRANTS ───────────────────────────────────────────────────────────────
-- The owner and nobody else, on all four. `hr_tick_edge_summary` is pure and
-- harmless but is revoked anyway: one rule for the file is checkable.
revoke execute on function public.hr_tick_edge_summary(text) from public;
revoke execute on function public.hr_tick_edge_summary(text)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_edge_harvest() from public;
revoke execute on function public.hr_tick_edge_harvest()
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb) from public;
revoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ────────────────────────────────
--   o1  the summary reads counts and the top non-flush reason off a real body
--   o2  a foreign / garbage / non-object body is NULL, never an error
--   o3  a long hex run in a reason is masked (d8's rule, restated here)
--   o4  the harvest runs against THIS database's pg_net schema without error
--       (column names are the thing a pg_net upgrade would move), or is NULL
--       where pg_net is absent
--   o5  a PLANTED stall at an instant no real row occupies reads stalled
--   o6  the same history with >= 30 shadow rows in every hour reads ok
--   o7  one healthy hour out of two is not a stall (the 2 h threshold holds)
--   o8  armed, the query does not judge
--   o9  no function in this file is executable by any client or engine role
-- Every probe row is written inside the block and rolled back by the sentinel.
do $$
declare
  v_s    jsonb;
  v_r    jsonb;
  v_n    int;
  v_u    uuid := '00000000-0000-4000-8000-00000000f928';
  v_at   timestamptz := '2000-01-01 12:00:00+00';
  v_shadow_before  boolean;
  v_enabled_before boolean;
begin
  begin
    -- o1
    v_s := public.hr_tick_edge_summary(
      '{"ok":true,"op":"tick","processed":0,"skipped":1,"shadowed":0,"refused":1,"ms":41,'
      || '"reasons":{"below_flush":1,"window_already_settled":1}}');
    if v_s is null or (v_s->>'refused')::int <> 1 or (v_s->>'skipped')::int <> 1
       or (v_s->>'below_flush')::int <> 1 or v_s->>'top_reason' <> 'window_already_settled' then
      raise exception 'o1: the summary misread a real edge body: %', v_s;
    end if;
    v_s := public.hr_tick_edge_summary(
      '{"ok":true,"op":"tick","processed":0,"skipped":2,"shadowed":0,"refused":0,"reasons":{"below_flush":2}}');
    if v_s->>'top_reason' is not null then
      raise exception 'o1b: below_flush was reported as the top reason: %', v_s;
    end if;
    -- o2
    if public.hr_tick_edge_summary('not json') is not null
       or public.hr_tick_edge_summary('[1,2]') is not null
       or public.hr_tick_edge_summary('{"op":"push","refused":9}') is not null
       or public.hr_tick_edge_summary(null) is not null then
      raise exception 'o2: a foreign or garbage body produced a summary';
    end if;
    -- o3
    v_s := public.hr_tick_edge_summary('{"op":"tick","refused":1,"reasons":{"error:'
      || repeat('ab', 20) || '":1}}');
    if v_s->>'top_reason' ~ '[0-9a-fA-F]{32,}' then
      raise exception 'o3: a long hex run survived into the reason: %', v_s->>'top_reason';
    end if;
    -- o4
    v_r := public.hr_tick_edge_harvest();
    if to_regclass('net._http_response') is null and v_r is not null then
      raise exception 'o4: the harvest answered % on a database without pg_net', v_r;
    end if;
    if v_r is not null and jsonb_typeof(v_r) <> 'object' then
      raise exception 'o4b: the harvest answered a non-object: %', v_r;
    end if;

    -- o5..o8: a planted history, two hours ending at v_at (year 2000).
    select shadow, enabled into v_shadow_before, v_enabled_before from public.hr_tick_config where id;
    update public.hr_tick_config set enabled = true, shadow = true where id;
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10,
           jsonb_build_object('edge', jsonb_build_object('refused', 1, 'shadowed', 0,
                                                         'top_reason', 'window_already_settled'))
      from generate_series(1, 719) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'stalled')::boolean is distinct from true then
      raise exception 'o5: a planted 2 h stall read %', v_r;
    end if;
    if v_r#>>'{buckets,0,edge,top_reason}' is distinct from 'window_already_settled' then
      raise exception 'o5b: the stalled bucket does not name the edge reason: %', v_r->'buckets';
    end if;
    -- o7: one healthy hour (the most recent) is enough to not be a stall.
    insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    select v_at - make_interval(secs => g * 90), v_u, 0, 'gather', 'selfcheck',
           v_at - make_interval(secs => g * 90 + 90), v_at - make_interval(secs => g * 90),
           1, gen_random_uuid(), '{}'::jsonb
      from generate_series(1, 39) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'stalled')::boolean then
      raise exception 'o7: one healthy hour of two still read as a stall: %', v_r->'buckets';
    end if;
    -- o6: both hours healthy.
    insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    select v_at - interval '1 hour' - make_interval(secs => g * 90), v_u, 0, 'gather', 'selfcheck',
           v_at - interval '1 hour' - make_interval(secs => g * 90 + 90),
           v_at - interval '1 hour' - make_interval(secs => g * 90),
           1, gen_random_uuid(), '{}'::jsonb
      from generate_series(1, 39) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'ok')::boolean is distinct from true then
      raise exception 'o6: a healthy history read %', v_r->'buckets';
    end if;
    -- o8
    update public.hr_tick_config set shadow = false where id;
    v_r := public.hr_tick_stall_status(v_at, 2, 30000);
    if (v_r->>'judged')::boolean or (v_r->>'stalled')::boolean then
      raise exception 'o8: the armed branch was judged on shadow rows: %', v_r;
    end if;
    update public.hr_tick_config set shadow = v_shadow_before, enabled = v_enabled_before where id;

    -- o9
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
     where n.nspname = 'public'
       and p.proname in ('hr_tick_edge_summary', 'hr_tick_edge_harvest',
                         'hr_tick_cron_note', 'hr_tick_stall_status')
       and exists (select 1 from pg_roles where rolname = r.role)
       and has_function_privilege(r.role, p.oid, 'execute');
    if v_n <> 0 then
      raise exception 'o9: % (function, role) pair(s) can execute this file''s functions', v_n;
    end if;

    raise exception 'HR928_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR928_ROLLBACK_OK' then raise; end if;
  end;
end $$;
