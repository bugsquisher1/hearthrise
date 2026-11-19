-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-14-arm-switches.sql — THE LIVE EVENTS ON FOR EVERYONE: the server switches `event_xp_bonus` and `event_open_halls` move to
--   everyone (lane/c-arm-switches, systems-engineer, 2026-11-18; Tyler approved every feature built but OFF, master backlog 2026-11-18 item 4
--   "ARM features built but OFF"; CLAUDE.md §3.3b: no cohort, no soak, armed for everyone). The scaled hunts arm in their own later file,
--   2027-05-18-arm-scaled-hunts.sql, once they scale loot and stay out of a ground's best (the Coordinator's split, 2026-11-18).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §2. RANKED AND PRICED SURFACES OPENED (a Level XP dial on a ranked board, a fee waiver, a world chat line): ON THE EA SECURITY
-- LIST with their parents, 2027-03-22-live-events.sql and 2027-04-24-boss-call-series.sql, whose contracts, concurrency and exploit notes are
-- unchanged by this file.
-- ORDER: after 2027-05-07-open-halls-words-live-events-catalogue.generated.sql (the schedule and words this arms). 2027-03-22-live-events.sql
--   seeds both rows OFF with `on conflict do nothing`, so a re-apply never reverts this flip.
-- EDGE: none. The hr-accrue live since v0.2.109 reads `live_xp` from the instance read and plays every hunt as before without it. CLIENT:
--   none (the World's event plate, the Hunts lines, a ground's page and the Call out line already read the `live_events` section; each
--   appears from the next envelope).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- TWO ROWS: hr_feature_switches.event_xp_bonus, .event_open_halls: scope -> everyone, accounts '{}', updated_at now(). The house pattern for
--   moving a switch (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"; 2027-05-03-tower-arm.sql). No table, function, grant, policy,
--   catalogue row or number moves; scaled_hunts is not touched (§1 compares it with every other row).
-- THE SCHEDULE IT ARMS is the catalogue's as built (src/data/live-events.js LIVE_EVENTS, the designer's board section "2026-11-07 Live
--   events", measured against the pace curve: every other weekend keeps a nightly player inside the curve's 10% band, every weekend does not):
--     Bonus XP weekend   +25% Level XP a kill on every ground, Friday 12:00 to Monday 12:00 UTC, every 14 days from 2026-11-20
--     Open Halls         the Call out fee waived (stamina still paid), Wednesday 17:00 to Thursday 05:00 UTC, every 7 days from 2026-11-18
--   No new generated file: the rows are live already (2027-05-07-open-halls-words-live-events-catalogue.generated.sql, APPLIED 2026-11-18).
-- FROM THE NEXT CALL, for every account: hr_live_xp_windows and hr_live_fee_of read the calendar's rows for the account; the `live_events`
--   section lists what is on or starts within 7 days (the plate shows it from a day before); the announcer (hr-live-events-announce, each
--   minute) writes each window's start and end to the System tab, which it does only while a switch is `everyone`.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE over two primary keys. A verb, settle or envelope in flight reads each switch once per call (hr_feature_on, STABLE): off or
--   on, never half. A kill pays the dial live at its own combat time (2027-03-22-live-events.sql), and the value bound reads the same
--   windows, so it never refuses the window it widened. The UPDATE matches only a row not already at everyone / '{}', so a second apply
--   writes nothing (updated_at kept): the second apply is byte-identical. §1 compares every OTHER switch row before and after.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No verb is added or opened. The XP dial widens the Level XP bound only by the account's own windows (a forged claim can't pass a real
--   event), xp_event is bounded and leaves a best untouched, and a free call still spends its stamina and journals its row
--   (2027-03-22-live-events.sql, tests/live-events.mjs LE-BOUND and LE-FEE).
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added by this file. Per envelope, the `live_events` section (two event rows' next window); per settle read, each member's XP
--   windows (two rows); per minute, the announcer's walk of two events' last hour. The notices table gains at most 4 rows a fortnight.
--
-- REVERSIBILITY: a later dated file sets a scope back to 'off' (this shape). Tallies and notices stay where they are; with an event switch
-- off its dial reads 1000 from the next settle and the section lists nothing. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if (select count(*) from public.hr_feature_switches where switch_id in ('event_xp_bonus', 'event_open_halls')) <> 2 then
    raise exception 'PRECONDITION: an event switch row is missing: apply 2027-03-22-live-events.sql first'; end if;
  if to_regprocedure('public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)') is null
     or to_regprocedure('public.hr_live_fee_of(uuid,text,timestamp with time zone)') is null
     or to_regprocedure('public.hr_live_events_view(uuid,integer)') is null
     or to_regprocedure('public.hr_live_event_windows(text,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the live events (2027-03-22-live-events.sql) are not installed'; end if;
  -- the calendar this arms: every switch it moves names a type, and each type has a row (the generated catalogue)
  if (select count(distinct t.switch_id) from public.hr_live_event_types t join public.hr_live_events e on e.type_id = t.type_id
       where t.switch_id in ('event_xp_bonus', 'event_open_halls')) <> 2 then
    raise exception 'PRECONDITION: the live events catalogue has no row for an event switch: apply its generated catalogue first'; end if;
end $mig$;

-- ── §1 THE FLIP (two rows; every other switch row compared before and after) ───
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id not in ('event_xp_bonus', 'event_open_halls');
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id in ('event_xp_bonus', 'event_open_halls') and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id not in ('event_xp_bonus', 'event_open_halls');
  if v_after is distinct from v_before then raise exception 'arm-switches §1: another switch row moved'; end if;
  raise notice 'arm-switches §1: % row(s) moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, read-only ────────────────────────
-- (a) the rows: everyone, no account list
-- (b) on for any account, a stranger on no list included; a null account still reads off (the fail-safe read is untouched); the
--     stranger's `features` section names both
-- (c) THE CALENDAR REACHES A STRANGER, on the catalogue's own next window of each event (read from the rows, never a date typed here,
--     so it holds on any day the file is applied): inside the next xp window its Level XP dial on the Mill Cellar is the row's pm; at the
--     next fee window the rat_king call's fee dial is the row's pm and names the event; the `live_events` section lists every event
--     whose next window starts within its week
-- (d) nothing else: no client or service_role privilege on the table, no policy on it; the grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-0000a2e50a01';   -- never inserted anywhere: `everyone` asks no list
  v_r record; v jsonb; s jsonb; v_role text; v_sig text; v_w jsonb; v_win record; v_n int;
begin
  -- (a)
  for v_r in select switch_id, scope, accounts from public.hr_feature_switches where switch_id in ('event_xp_bonus', 'event_open_halls') loop
    if v_r.scope is distinct from 'everyone' or cardinality(v_r.accounts) <> 0 then
      raise exception 'arm-switches §2(a): % reads % %', v_r.switch_id, v_r.scope, v_r.accounts; end if;
  end loop;
  -- (b)
  foreach v_sig in array array['event_xp_bonus', 'event_open_halls'] loop
    if not public.hr_feature_on(v_sig, c_stranger) then raise exception 'arm-switches §2(b): % off for a stranger', v_sig; end if;
    if public.hr_feature_on(v_sig, null) then raise exception 'arm-switches §2(b): % on for a null account', v_sig; end if;
    if not (public.hr_features_view(c_stranger, 0) ? v_sig) then
      raise exception 'arm-switches §2(b): the features section reads %, without %', public.hr_features_view(c_stranger, 0), v_sig; end if;
  end loop;
  -- (c) each event's next window, from its own row
  v_n := 0;
  for v_r in select e.event_id, e.pm, e.every_days, t.dial from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id
              where t.switch_id in ('event_xp_bonus', 'event_open_halls') order by e.event_id loop
    select w.starts, w.ends into v_win from public.hr_live_event_windows(v_r.event_id, now(), now() + make_interval(days => coalesce(v_r.every_days, 400) + 1)) w
     order by w.starts limit 1;
    if v_win.starts is null then continue; end if;   -- a one-off already over, or an `until` passed: nothing left to arm
    v_n := v_n + 1;
    if v_r.dial = 'xpPm' then
      v_w := public.hr_live_xp_windows(c_stranger, 'mill_cellar', greatest(v_win.starts, now()), least(v_win.ends, greatest(v_win.starts, now()) + interval '1 minute'));
      if jsonb_array_length(v_w) = 0 or (v_w->0->>2)::int < v_r.pm then
        raise exception 'arm-switches §2(c): inside %''s window a stranger''s Level XP dial reads % (want at least %)', v_r.event_id, v_w, v_r.pm; end if;
    elsif v_r.dial = 'feePm' then
      v := public.hr_live_fee_of(c_stranger, 'rat_king', greatest(v_win.starts, now()) + interval '1 second');
      if (v->>'pm')::int > v_r.pm or v->>'event' is null then
        raise exception 'arm-switches §2(c): inside %''s window a stranger''s Call out fee dial reads % (want % or less, named)', v_r.event_id, v, v_r.pm; end if;
    end if;
    if v_win.starts <= now() + interval '7 days' then
      s := public.hr_live_events_view(c_stranger, 0);
      if s is null or not exists (select 1 from jsonb_array_elements(s) x where x->>'id' = v_r.event_id) then
        raise exception 'arm-switches §2(c): % starts % but a stranger''s live_events section reads %', v_r.event_id, v_win.starts, s; end if;
    end if;
  end loop;
  if v_n = 0 then raise exception 'arm-switches §2(c): no event row has a window ahead: the calendar arms nothing'; end if;
  -- (d)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'arm-switches §2(d): % holds a privilege on hr_feature_switches', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'arm-switches §2(d): hr_feature_switches carries a policy'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'arm-switches §2 OK: the live events on for everyone, each event''s next window reaches a stranger, nothing else moved';
end $chk$;
