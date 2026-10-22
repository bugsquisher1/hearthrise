-- ════════════════════════════════════════════════════════════════════════════
-- 2026-11-20-hunt-forfeit-durable.sql — A FORFEITED HUNT STAYS FORFEITED:
--   THE FACT MOVES OFF THE PRUNED LEDGER ONTO ITS SESSION ROW.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/a-v0229-dbreds (backend-architect,
-- 2026-10-22), fix-forward of v0.2.29's db-replay red "LEDGER PRUNE FAILED":
-- 2026-11-17-hunt-density-home.sql made hr_hunt_view read `forfeit` as
-- `exists (player_ledger … intent = 'window_forfeit')` with no time predicate.
-- player_ledger is pruned at hr_ledger_config.retain_days (90, min 7), so the
-- day the prune passes a forfeited session's row, that hunt silently reads as
-- a plain "the server ended it" — a lifetime fact read from a 90-day journal
-- (tests/ledger-rollup.mjs property 5). The game is CLOSED: this applies on its
-- passing §4 (tools/apply-migration.mjs, one file, never inside begin/commit,
-- never 00:00–00:10 UTC); Security reviews it with every closed-mode surface at
-- the reopen gate. ORDER: after 2026-11-17-hunt-density-home.sql (it restates
-- that file's hr_hunt_view) and 2026-11-16-hunt-density-bounds.sql (it restates
-- that file's hr_hunt_forfeit). No edge deploy; the client is unchanged (it
-- already reads the view's boolean `forfeit`).
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- §1 hunt_sessions.forfeit boolean NOT NULL DEFAULT false, with a CHECK that it
--    is true only on a session ENDED `server` or `left` (the only two ends
--    hr_hunt_forfeit writes). Backfilled ONCE from the ledger rows that exist at
--    apply time (a plain statement, not a function: no standing ledger reader).
-- §2 hr_hunt_forfeit (restated whole from 2026-11-16-hunt-density-bounds.sql,
--    one line added): after hr_hunt_close it sets the session's forfeit, in the
--    same transaction as its window_forfeit journal row. The journal row is
--    unchanged (still the audit record of code/detail/boundary).
-- §3 hr_hunt_view (restated whole from 2026-11-17-hunt-density-home.sql, one
--    expression changed): `forfeit` reads s.forfeit. It no longer reads
--    player_ledger at all.
-- §4 SELF-CHECK, EXECUTED, every probe rolled back.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None. No new function, grant or policy; hunt_sessions keeps RLS and its
-- own-read policy (no client write). The new column is written only by the
-- owner-only hr_hunt_forfeit. No value moves: forfeit is a display fact.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-run 2026-11-17's hr_hunt_view and 2026-11-16's hr_hunt_forfeit bodies,
-- then `alter table public.hunt_sessions drop column forfeit` (the CHECK goes
-- with it). Nothing else reads the column.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One boolean per hunt_sessions row (padding-free in practice); the view loses
-- a ledger probe per read. The backfill touches only forfeited sessions.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §1 THE DURABLE FACT ─────────────────────────────────────────────────────
alter table public.hunt_sessions add column if not exists forfeit boolean not null default false;
comment on column public.hunt_sessions.forfeit is
  '2026-11-20-hunt-forfeit-durable.sql: the session was ended by the refused-window rule (hr_hunt_forfeit, '
  'which also journals a window_forfeit ledger row). Durable: the ledger is pruned at retain_days, this is not.';

update public.hunt_sessions s set forfeit = true
 where not s.forfeit and s.ended_at is not null and s.end_reason in ('server', 'left')
   and exists (select 1 from public.player_ledger l
                where l.session_id = s.id and l.kind = 'hunt' and l.intent = 'window_forfeit');

alter table public.hunt_sessions drop constraint if exists hunt_sessions_forfeit_ck;
alter table public.hunt_sessions add constraint hunt_sessions_forfeit_ck
  check (not forfeit or (ended_at is not null and end_reason in ('server', 'left')));

-- ── §2 THE FORFEIT WRITES IT ────────────────────────────────────────────────
create or replace function public.hr_hunt_forfeit(p_instance uuid, p_code text, p_detail jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_i public.hunt_instances%rowtype;
  v_s record;
  v_end text;
  v_n int := 0;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql). The caller holds the instance lock.
  -- FORFEIT-DURABLE (2026-11-20-hunt-forfeit-durable.sql): the session row carries the fact.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return null; end if;
  for v_s in select h.id, h.user_id, h.slot, h.leave_at, h.change_at from public.hunt_sessions h
              where h.instance_id = p_instance and h.ended_at is null order by h.user_id, h.slot loop
    perform public.hr_hunt_lock(v_s.user_id, v_s.slot);
    v_end := case when v_s.leave_at is not null or v_s.change_at is not null then 'left' else 'server' end;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
      values (v_s.user_id, v_s.slot, 'hunt', 'window_forfeit', 0, 0,
              jsonb_build_object('reason', 'window_forfeit', 'code', left(coalesce(p_code, ''), 64), 'detail', p_detail,
                                 'from', v_i.settled_to, 'world_swing', v_i.world_swing, 'refusals', v_i.refusals, 'end', v_end),
              v_s.id);
    perform public.hr_hunt_close(v_s.id, v_end, v_i.settled_to, true);
    update public.hunt_sessions set forfeit = true where id = v_s.id;
    v_n := v_n + 1;
  end loop;
  update public.hunt_instances set world = null, refusals = 0, version = version + 1 where id = p_instance;
  return jsonb_build_object('sessions', v_n, 'at', v_i.settled_to);
end $$;
revoke execute on function public.hr_hunt_forfeit(uuid, text, jsonb) from public;
revoke execute on function public.hr_hunt_forfeit(uuid, text, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 THE VIEW READS IT ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_view(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `forfeit`, the session ended by the refused-window rule.
  -- FORFEIT-DURABLE (2026-11-20-hunt-forfeit-durable.sql): read from the session row (hr_hunt_forfeit sets it;
  -- its CHECK keeps it to an ended `server`/`left` session), never from the pruned ledger.
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'instance', s.instance_id, 'unit', s.unit_id, 'seat', s.seat,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason,
    'forfeit', s.forfeit,
    'home_at',
    case when s.ended_at is not null then s.ended_at + make_interval(secs => coalesce(
      (select travel_s from public.hr_hunt_travel t where t.hunt_id = s.hunt_id), 0)) end,
    'seen_event_id', s.seen_event_id, 'version', s.version,
    'phase', case when s.ended_at is not null then 'ended'
                  when s.leave_at is not null or s.change_at is not null then 'leaving'
                  when now() < s.hunt_from then 'walking' else 'hunting' end,
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded,
                       'left', b.qty_left, 'essential', b.essential) order by b.item_id)
                     from public.hunt_bag b where b.session_id = s.id), '[]'::jsonb),
    'tally', (select jsonb_build_object('kills', t.kills, 'xp', t.xp, 'coins', t.coins, 'loot', t.loot,
                       'supplies', t.supplies, 'deaths', t.deaths, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
$function$;
revoke execute on function public.hr_hunt_view(uuid) from public, anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the column is NOT NULL DEFAULT false with its CHECK; (b) hr_hunt_view no longer reads
-- player_ledger; (c) the backfill left no window_forfeit-journalled server/left session unflagged;
-- (d) a forfeit through hr_hunt_forfeit itself flags the session, reads forfeit in the view and the
-- hunt section, and journals exactly one zero-value row; (e) a plain server end reads not forfeit;
-- (f) the flag cannot sit on an open session; (g) neither body is reachable by any client or engine role.
do $$
declare
  v_u     constant uuid := '000000c0-0000-4000-a000-0000f0f00001';
  v_hunt  text := 'mill_cellar';
  v       jsonb;
  v_sid   uuid;
  v_inst  uuid;
  v_gold  bigint;
  v_role  text;
begin
  -- (a)
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions'
                  and column_name = 'forfeit' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false')
     or not exists (select 1 from pg_constraint where conrelid = 'public.hunt_sessions'::regclass and conname = 'hunt_sessions_forfeit_ck') then
    raise exception 'VERIFY(a): hunt_sessions.forfeit is not NOT NULL DEFAULT false with its CHECK'; end if;
  -- (b)
  if (select prosrc from pg_proc where oid = 'public.hr_hunt_view(uuid)'::regprocedure) ilike '%player_ledger%' then
    raise exception 'VERIFY(b): hr_hunt_view still reads player_ledger'; end if;
  if (select prosrc from pg_proc where oid = 'public.hr_hunt_forfeit(uuid,text,jsonb)'::regprocedure) not like '%set forfeit = true where id = v_s.id%' then
    raise exception 'VERIFY(b): hr_hunt_forfeit does not set the session''s forfeit'; end if;
  -- (c)
  if exists (select 1 from public.hunt_sessions s
              where not s.forfeit and s.ended_at is not null and s.end_reason in ('server', 'left')
                and exists (select 1 from public.player_ledger l
                             where l.session_id = s.id and l.kind = 'hunt' and l.intent = 'window_forfeit')) then
    raise exception 'VERIFY(c): a journalled forfeit was not backfilled'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'forfeit-durable §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    -- (d) a forfeit through the real body
    v_sid := public.hr_hunt_new_session(v_u, 0, v_hunt, null, 0, null);
    select instance_id into v_inst from public.hunt_sessions where id = v_sid;
    if (public.hr_hunt_view(v_sid)->>'forfeit') is distinct from 'false' then
      raise exception 'VERIFY(d): an open hunt reads forfeit %', public.hr_hunt_view(v_sid)->'forfeit'; end if;
    v := public.hr_hunt_forfeit(v_inst, 'probe', '{}'::jsonb);
    if (v->>'sessions')::int is distinct from 1 then raise exception 'VERIFY(d): the forfeit answered %', v; end if;
    if (select forfeit from public.hunt_sessions where id = v_sid) is distinct from true
       or (select end_reason from public.hunt_sessions where id = v_sid) is distinct from 'server'
       or (public.hr_hunt_view(v_sid)->>'forfeit') is distinct from 'true'
       or (public.hr_hunt_section_view(v_u, 0)->'session'->>'forfeit') is distinct from 'true' then
      raise exception 'VERIFY(d): the forfeited hunt reads row %, view %, section %',
        (select forfeit from public.hunt_sessions where id = v_sid), public.hr_hunt_view(v_sid)->'forfeit',
        public.hr_hunt_section_view(v_u, 0)->'session'->'forfeit'; end if;
    if (select count(*) from public.player_ledger where session_id = v_sid and kind = 'hunt' and intent = 'window_forfeit'
          and coalesce(gold, 0) = 0) <> 1
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold then
      raise exception 'VERIFY(d): the forfeit is not journalled exactly once, or it moved the purse'; end if;
    -- (e) a plain server end is no forfeit
    v_sid := public.hr_hunt_new_session(v_u, 0, v_hunt, null, 0, null);
    -- (f) the flag cannot sit on an open session
    begin
      update public.hunt_sessions set forfeit = true where id = v_sid;
      raise exception 'VERIFY(f): an open session took the forfeit flag';
    exception when check_violation then null;
    end;
    perform public.hr_hunt_close(v_sid, 'server', (select settled_to from public.hunt_sessions where id = v_sid), true);
    if (select forfeit from public.hunt_sessions where id = v_sid) is distinct from false
       or (public.hr_hunt_view(v_sid)->>'forfeit') is distinct from 'false' then
      raise exception 'VERIFY(e): a plain server end reads forfeit %', public.hr_hunt_view(v_sid)->'forfeit'; end if;
    raise exception using errcode = 'HRF20', message = 'forfeit-durable §4 complete - rolling back';
  exception when sqlstate 'HRF20' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY: §4 LEAKED a probe row'; end if;
  -- (g)
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_forfeit(uuid,text,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_view(uuid)', 'execute') then
      raise exception 'VERIFY(g): % reaches hr_hunt_forfeit or hr_hunt_view', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_sessions' and cmd <> 'SELECT') then
    raise exception 'VERIFY(g): hunt_sessions has a client write policy'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'forfeit-durable: a forfeited hunt is flagged on its own row, the view reads the row, never the pruned ledger';
end $$;
