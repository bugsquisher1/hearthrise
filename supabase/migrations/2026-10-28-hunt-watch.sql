-- ============================================================================
-- 2026-10-28-hunt-watch.sql — THE WATCH BUCKET: the viewed character's near-live hunt.
--
-- WHY. The hunt scene plays the server's timeline. A window's track and events
-- reach the client only in a settle answer, and the player door settles at most
-- once per 15 s (hunt-settle.js HUNT_SETTLE_MIN_MS, the ledger-volume fuse), so
-- the picture had to play a whole poll behind (v0.2.8: 19 s; Tyler pressed Enter
-- and watched his hero stand still while the server logged 12 kills).
--
-- WHAT. A new edge verb, `hunt_watch`, polled every ~2 s by the VIEWED character
-- only. Past the floor it settles exactly like `hunt_settle` (one commit, one
-- ledger row per member, as today). BELOW the floor it answers the timeline of
-- the owed window [settled_to, now] WITHOUT COMMITTING: no write, no value, no
-- journal (the engine is window-cut invariant, so what it shows is what the next
-- settle commits; tests/hunt-watch.mjs). The ledger volume therefore does not
-- change: one settle per >= 15 s per viewed hunt, whatever the poll rate.
--
-- THIS FILE gives the verb its own budget in hr_rate_gate: bucket `watch`, 40 a
-- minute PER CHARACTER (the counter key is 'watch:<slot>'), so a 2 s poll (30 a
-- minute) never spends the `accrue` budget and a forged faster poll is refused
-- before any state is read, never simulated. Compute only: a peek simulates at
-- most the floor plus 5 s (HUNT_WATCH_MAX_MS).
--
-- hr_rate_gate RESTATED WHOLE from 2026-10-21-closed-mode.sql (its only body
-- since), with one `when` arm and the per-character key added. Nothing else
-- changes: the admitted line, the four buckets and their limits, the sampled
-- rejection record, the grants.
--
-- Reversible: re-apply 2026-10-21-closed-mode.sql's §6 body (the edge then
-- answers `rate_limited` to hunt_watch and the client falls back to its 16 s
-- accrue poll). Additive and idempotent.
-- ============================================================================

-- §0 the body this file restates (closed-mode's) or this file's own.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = 'public.hr_rate_gate(uuid,integer,text)'::regprocedure;
  if v_md5 is null then raise exception 'PRECONDITION: public.hr_rate_gate is absent'; end if;
  if position('hr_admitted' in (select prosrc from pg_proc where oid = 'public.hr_rate_gate(uuid,integer,text)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_rate_gate lacks the closed-mode admitted line (md5 %) — apply 2026-10-21-closed-mode.sql first', v_md5;
  end if;
end $mig$;

-- §1 hr_rate_gate, restated whole.
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
  v_key    text := p_bucket;
begin
  if p_user is null then return false; end if;
  -- CLOSED MODE (2026-10-21-closed-mode.sql): the hr-accrue engine never passes
  -- PostgREST's pre-request hook, so a character whose account is not admitted
  -- is refused here, before any budget is spent or any state is read.
  if not public.hr_admitted(p_user) then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, all of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue'   then v_limit := 30; v_window := interval '1 minute';
    -- b345. Matches `accrue` deliberately: set_activity runs a COLLECT apply
    -- and a SWITCH apply, so it is strictly more expensive per call and must
    -- not be the looser budget of the two.
    when 'activity' then v_limit := 30; v_window := interval '1 minute';
    -- b351. shop_buy AND vendor_sell, sharing one counter: they are one
    -- surface. Matches the other two rather than being looser, even though a
    -- spend is one apply — a shop verb moves VALUE, and the conservative
    -- number is the one that does not have to be argued down later.
    when 'shop'     then v_limit := 30; v_window := interval '1 minute';
    -- b349. 20/min, TIGHTER than the three above. A claim is a once-per-UTC-day
    -- gesture; the budget exists only to bound a retry storm, and 20 leaves ample
    -- room for the client's single automatic retry on `version_conflict` plus a
    -- player hammering a button. Choosing 30 "for consistency" would have been a
    -- number nobody decided.
    when 'claim'    then v_limit := 20; v_window := interval '1 minute';
    -- 2026-10-28-hunt-watch.sql. The viewed character's near-live hunt (`hunt_watch`),
    -- PER CHARACTER: a 2 s poll is 30 a minute; 40 leaves room for a retry, and a
    -- second character's watch is its own counter, never this one's budget. Below the
    -- settle floor a watch writes nothing and moves no value (compute only).
    when 'watch'    then v_limit := 40; v_window := interval '1 minute';
                         v_key := 'watch:' || coalesce(p_slot, 0)::text;
    else return false;
  end case;

  if public.hr_rate_ok(p_user, v_key, v_limit, v_window) then
    return true;
  end if;

  -- Sampled record. Same policy as hr_load and hr_apply: detection does not need
  -- every event, it needs to know the event is happening and roughly how much.
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, v_key) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', true), v_weight);
  end if;
  return false;
end $$;
revoke execute on function public.hr_rate_gate(uuid, int, text) from public;
revoke execute on function public.hr_rate_gate(uuid, int, text) from anon, authenticated, service_role;
grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;

-- §4 SELF-CHECK (executed; every probe row rolled back).
do $chk$
declare
  v_in  uuid := '00000000-0000-4000-8000-00000000a7c1';
  v_out uuid := '00000000-0000-4000-8000-00000000a7c2';
  v_ok  int := 0;
  i     int;
begin
  -- (a) no client role can call the gate; the engine can.
  if has_function_privilege('anon', 'public.hr_rate_gate(uuid,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_rate_gate(uuid,integer,text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_rate_gate(uuid,integer,text)', 'execute') then
    raise exception 'hunt-watch §4a: a client role can execute hr_rate_gate'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and not has_function_privilege('hr_engine', 'public.hr_rate_gate(uuid,integer,text)', 'execute') then
    raise exception 'hunt-watch §4a: hr_engine cannot execute hr_rate_gate'; end if;
  if (select prosecdef from pg_proc where oid = 'public.hr_rate_gate(uuid,integer,text)'::regprocedure) is not true then
    raise exception 'hunt-watch §4a: hr_rate_gate is not SECURITY DEFINER'; end if;

  -- (b) behaviour, rolled back.
  begin
    insert into auth.users (id) values (v_in), (v_out) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_in, 'hunt-watch self-check')
      on conflict (user_id) do nothing;
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'hunt-watch self-check')
      on conflict (key) do update set enabled = true;
    delete from public.hr_rate_counters where user_id in (v_in, v_out);

    if public.hr_rate_gate(v_out, 0, 'watch') then
      raise exception 'hunt-watch §4b: the watch bucket admitted a non-allowlisted user'; end if;
    for i in 1..41 loop
      if public.hr_rate_gate(v_in, 0, 'watch') then v_ok := v_ok + 1; end if;
    end loop;
    if v_ok <> 40 then raise exception 'hunt-watch §4b: slot 0 got % watches in a minute, want 40', v_ok; end if;
    if not public.hr_rate_gate(v_in, 1, 'watch') then
      raise exception 'hunt-watch §4b: slot 1''s watch was refused by slot 0''s spent counter (not per character)'; end if;
    if not public.hr_rate_gate(v_in, 0, 'accrue') then
      raise exception 'hunt-watch §4b: spending the watch budget spent the accrue budget'; end if;
    if public.hr_rate_gate(v_in, 0, 'watch:0') or public.hr_rate_gate(v_in, 0, 'nope') then
      raise exception 'hunt-watch §4b: an unknown bucket (or a raw counter key) was admitted'; end if;
    raise exception using errcode = 'HR858', message = 'hunt-watch §4 complete - rolling back';
  exception when sqlstate 'HR858' then null;
  end;
  if exists (select 1 from public.hr_rate_counters where user_id in (v_in, v_out))
     or exists (select 1 from public.hr_access_allowlist where user_id = v_in) then
    raise exception 'hunt-watch §4: the self-check leaked a probe row'; end if;
  raise notice 'hunt-watch OK: watch bucket 40/min per character; grants unchanged';
end $chk$;
