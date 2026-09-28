-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-28-tick-harvest-off-rpc-surface.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE pg_net READER LEAVES EVERY PostgREST-EXPOSED SCHEMA.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- 2026-09-28-world-tick-stall-observability.sql (APPLIED 05:34 UTC) created
-- `public.hr_tick_edge_harvest()`, which reads `net._http_response` (dynamic
-- SQL). PUBLIC holds SELECT on that table (supabase_admin's grant, which our
-- roles cannot revoke — tests/pg-net-queue-unreachable.mjs header, T-5), so the
-- only thing between it and a browser is a routine on the RPC surface, and
-- `public` IS the RPC surface. Its production ACL is postgres-only, so no client
-- can execute it today; the guard's Q-1 is right that it must not exist there
-- at all (GitHub run 36385797281, `edge` job, T-5 step). The applied file's
-- bytes are the record of what landed and are not edited; this file supersedes
-- it in the apply order.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
-- §1 schema `hr_ops`, owned by postgres, NOT in PostgREST's exposed list
--    (public, graphql_public) and with every privilege revoked from the six
--    client/engine roles. It is the home for operator-only routines that must
--    read a table PUBLIC can read.
-- §2 hr_ops.hr_tick_edge_summary(text) and hr_ops.hr_tick_edge_harvest() —
--    the applied bodies, byte-for-byte, except that the harvest calls the
--    summary by its new schema.
-- §3 public.hr_tick_cron_note — restated ONLY at the harvest call site
--    (hr_ops.hr_tick_edge_harvest()). Its own body reads nothing in `net`.
-- §4 drop public.hr_tick_edge_harvest() and public.hr_tick_edge_summary(text).
--    Ordered AFTER §3 so the note never points at a dropped function, even
--    statement by statement. hr_tick_stall_status reads only hr_tick_cron_log
--    and hr_tick_shadow, and stays.
-- §5 revoke-before-grant (there is no grant): the owner and nobody else.
-- §6 self-check, executed.
--
-- NOTHING HERE MOVES VALUE. No table, no column, no client surface.
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE NON-EXPOSED SCHEMA ───────────────────────────────────────────────
create schema if not exists hr_ops authorization postgres;
revoke all on schema hr_ops from public;
revoke all on schema hr_ops from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §2 THE SUMMARY AND THE HARVEST, OFF THE RPC SURFACE ─────────────────────
-- Body identical to the applied public.hr_tick_edge_summary.
create or replace function hr_ops.hr_tick_edge_summary(p_body text)
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

-- Body identical to the applied public.hr_tick_edge_harvest but for the one
-- call site: hr_ops.hr_tick_edge_summary.
create or replace function hr_ops.hr_tick_edge_harvest()
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
             's', hr_ops.hr_tick_edge_summary(r.content)) order by r.id), '[]'::jsonb)
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

revoke execute on function hr_ops.hr_tick_edge_summary(text) from public;
revoke execute on function hr_ops.hr_tick_edge_summary(text)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function hr_ops.hr_tick_edge_harvest() from public;
revoke execute on function hr_ops.hr_tick_edge_harvest()
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 THE NOTE, RESTATED AT THE CALL SITE ONLY ─────────────────────────────
-- Byte-for-byte the 2026-09-28 note but for `hr_ops.` on the harvest call.
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
      v_edge := hr_ops.hr_tick_edge_harvest();
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

revoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb) from public;
revoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 THE BRIDGE LEAVES THE RPC SURFACE ────────────────────────────────────
drop function if exists public.hr_tick_edge_harvest();
drop function if exists public.hr_tick_edge_summary(text);

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ────────────────────────────────
--   h1  no routine in a PostgREST-exposed schema (public, graphql_public) has a
--       body that reads net.http_request_queue or net._http_response in a read
--       position — tests/pg-net-queue-unreachable.mjs Q-1, restated over the
--       CATALOGUE, i.e. at chain end on whatever database this runs against
--   h2  public.hr_tick_edge_harvest() and public.hr_tick_edge_summary(text)
--       no longer resolve; the hr_ops pair does
--   h3  the harvest runs against THIS database's pg_net schema without error,
--       and is NULL where pg_net is absent
--   h4  a `posted` note still executes and logs its row, and its harvest did
--       not fail (the note swallows a harvest error into `harvest_error`, so a
--       dangling call site would otherwise be silent)
--   h5  none of the six client/engine roles holds USAGE/CREATE on hr_ops or
--       EXECUTE on the harvest, the summary, the note or the stall status
--   h6  hr_ops is not named in any role's pgrst.db_schemas setting
-- The probe row is written inside the block and rolled back by the sentinel.
do $$
declare
  v_n    int;
  v_r    jsonb;
  v_d    jsonb;
  v_bad  text;
begin
  begin
    -- h1
    select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'graphql_public')
       and p.prosrc ~* '(from|join|into|update|using|copy)[[:space:]]+(only[[:space:]]+)?"?net"?[[:space:]]*[.][[:space:]]*"?(http_request_queue|_http_response)';
    if v_bad is not null then
      raise exception 'h1: routine(s) in an exposed schema read the pg_net queue: %', v_bad;
    end if;

    -- h2
    if to_regprocedure('public.hr_tick_edge_harvest()') is not null
       or to_regprocedure('public.hr_tick_edge_summary(text)') is not null then
      raise exception 'h2: the public harvest/summary still exist';
    end if;
    if to_regprocedure('hr_ops.hr_tick_edge_harvest()') is null
       or to_regprocedure('hr_ops.hr_tick_edge_summary(text)') is null then
      raise exception 'h2b: the hr_ops harvest/summary do not resolve';
    end if;

    -- h3
    v_r := hr_ops.hr_tick_edge_harvest();
    if to_regclass('net._http_response') is null and v_r is not null then
      raise exception 'h3: the harvest answered % on a database without pg_net', v_r;
    end if;
    if v_r is not null and jsonb_typeof(v_r) <> 'object' then
      raise exception 'h3b: the harvest answered a non-object: %', v_r;
    end if;

    -- h4
    perform public.hr_tick_cron_note('posted', 0, 0, null, '{"hr_ops_selfcheck":true}'::jsonb);
    select l.detail into v_d from public.hr_tick_cron_log l
     where l.detail ? 'hr_ops_selfcheck' order by l.id desc limit 1;
    if v_d is null then
      raise exception 'h4: a posted note did not log its row';
    end if;
    if v_d #>> '{edge,harvest_error}' is not null then
      raise exception 'h4b: the note''s harvest failed with %', v_d #>> '{edge,harvest_error}';
    end if;

    -- h5
    select count(*) into v_n
      from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
     where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
       and (has_schema_privilege(r.role, 'hr_ops', 'usage')
            or has_schema_privilege(r.role, 'hr_ops', 'create')
            or has_function_privilege(r.role, 'hr_ops.hr_tick_edge_harvest()', 'execute')
            or has_function_privilege(r.role, 'hr_ops.hr_tick_edge_summary(text)', 'execute')
            or has_function_privilege(r.role, 'public.hr_tick_cron_note(text, int, int, int, jsonb)', 'execute')
            or has_function_privilege(r.role, 'public.hr_tick_stall_status(timestamptz, int, int)', 'execute'));
    if v_n <> 0 then
      raise exception 'h5: % client/engine role(s) can reach hr_ops or the tick observability functions', v_n;
    end if;

    -- h6
    if exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c
                where c ilike 'pgrst.db_schemas=%' and c ~* '\mhr_ops\M') then
      raise exception 'h6: hr_ops is in a pgrst.db_schemas setting';
    end if;

    raise exception 'HR928B_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR928B_ROLLBACK_OK' then raise; end if;
  end;
end $$;
