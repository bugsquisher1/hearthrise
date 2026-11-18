-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-14-arm-switches.sql — THE LIVE EVENTS AND THE SCALED HUNTS ON FOR EVERYONE: the server switches `event_xp_bonus`,
--   `event_open_halls` and `scaled_hunts` move to everyone (lane/c-arm-switches, systems-engineer, 2026-11-18; Tyler approved every
--   feature built but OFF, master backlog 2026-11-18 item 4 "ARM features built but OFF"; CLAUDE.md §3.3b: no cohort, no soak, armed for
--   everyone; the 11-18 lining ruling relies on the scaled hunts: "we already have a way to raise old spawns up").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §2. MONEY AND RANKED SURFACES OPENED (a gold purchase, a Level XP dial on a ranked board, a fee waiver, a world chat line):
-- ON THE EA SECURITY LIST with their parents, 2027-03-21-scaled-hunts.sql (+ 2027-04-19-key-under-lock.sql, the buy's lock), 2027-03-22-
-- live-events.sql and 2027-04-24-boss-call-series.sql, whose contracts, concurrency and exploit notes are unchanged by this file.
-- ORDER: LAST. After 2027-05-07-open-halls-words-live-events-catalogue.generated.sql (the schedule and words this arms) and every scaled-hunts
--   catalogue (2027-05-06-sewer-from-five-scaled-hunts-catalogue.generated.sql the newest). Each parent seeds its row OFF with `on conflict
--   do nothing`, so a re-apply never reverts this flip.
-- EDGE: none. The hr-accrue live since v0.2.109 (62f5f2ee; today c684d18c) reads `scale` and `live_xp` from the instance read and plays
--   the ground's own rows without them, so it already carries both features. CLIENT: none (the World's event plate, the Hunts lines, a
--   ground's page, the Call out line and the ground page's Scaled hunt section already read the `live_events` and `scaled_hunts` sections;
--   each appears from the next envelope).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THREE ROWS: hr_feature_switches.event_xp_bonus, .event_open_halls, .scaled_hunts: scope -> everyone, accounts '{}', updated_at now().
--   The house pattern for moving a switch (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"; 2027-05-03-tower-arm.sql). No table,
--   function, grant, policy, catalogue row or number moves.
-- THE SCHEDULE IT ARMS is the catalogue's as built (src/data/live-events.js LIVE_EVENTS, the designer's board section "2026-11-07 Live
--   events", measured against the pace curve: every other weekend keeps a nightly player inside the curve's 10% band, every weekend does not):
--     Bonus XP weekend   +25% Level XP a kill on every ground, Friday 12:00 to Monday 12:00 UTC, every 14 days from 2026-11-20
--     Open Halls         the Call out fee waived (stamina still paid), Wednesday 17:00 to Thursday 05:00 UTC, every 7 days from 2026-11-18
--   No new generated file: the rows are live already (2027-05-07-open-halls-words-live-events-catalogue.generated.sql, APPLIED 2026-11-18).
-- FROM THE NEXT CALL, for every account:
--   scaled hunts: hr_scaled_hunt_buy and hr_scaled_hunt_switch stop refusing feature_off; the `scaled_hunts` section stops answering null
--     (a ground's page shows its Scaled hunt section, the Hunts list its "Scalable" tag); hr_scaled_hunt_of reads a leader's banked hours.
--   live events: hr_live_xp_windows and hr_live_fee_of read the calendar's rows for the account; the `live_events` section lists what is
--     on or starts within 7 days (the plate shows it from a day before); the announcer (hr-live-events-announce, each minute) writes each
--     window's start and end to the System tab, which it does only while a switch is `everyone`.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE over three primary keys. A verb, settle or envelope in flight reads each switch once per call (hr_feature_on, STABLE): off
--   or on, never half. A settle whose span crosses the flip reads the windows of the account's switch as it reads them then; a kill pays
--   the dial live at its own combat time (2027-03-22-live-events.sql), and the value bound reads the same windows, so it never refuses
--   the window it widened. The UPDATE matches only a row not already at everyone / '{}', so a second apply writes nothing (updated_at
--   kept): the second apply is byte-identical. §1 compares every OTHER switch row before and after in the same block and refuses if one moved.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- hr_scaled_hunt_buy / hr_scaled_hunt_switch become reachable past their feature_off check for every signed-in account. Their own checks
--   (the price from the catalogue and the server's Level under the hero's lock, quote_changed, the bank and day clamps from the append-only
--   ledger, the idempotency key read under the lock, hr_apply's purse) and the settle's re-proof of every scale claim (scale_moved,
--   scale_over, the scaled roster's own value bound) are unchanged and were proved with the switch on by 2027-03-21-scaled-hunts.sql §8,
--   2027-04-19-key-under-lock.sql §3 and tests/scaled-hunts-server.mjs. The events add no verb: the XP dial widens the Level XP bound only by
--   the account's own windows (a forged claim can't pass a real event), xp_event is bounded and leaves a best untouched, and a free call
--   still spends its stamina and journals its row (2027-03-22-live-events.sql, tests/live-events.mjs LE-BOUND and LE-FEE).
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added by this file. What the parents priced for the switches on now runs for every account: per envelope, the `scaled_hunts`
--   section (the rule row, the hero's Level, <= 10 PK rows) and the `live_events` section (two event rows' next window); per settle read,
--   one PK read of the leader's bank and each member's XP windows (two rows); per minute, the announcer's walk of two events' last hour.
--   Rows: a purchase is ONE ledger row; the notices table gains at most 4 rows a fortnight.
--
-- REVERSIBILITY: a later dated file sets a scope back to 'off' (this shape). Banked hours, purchases, tallies and notices stay where they
-- are: with scaled_hunts off the verbs refuse feature_off again, the section reads null and a leader's hunt plays the ground's own rows,
-- spending nothing; with an event switch off its dial reads 1000 from the next settle and the section lists nothing. No begin/commit (§2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if (select count(*) from public.hr_feature_switches where switch_id in ('event_xp_bonus', 'event_open_halls', 'scaled_hunts')) <> 3 then
    raise exception 'PRECONDITION: a switch row is missing: apply 2027-03-21-scaled-hunts.sql and 2027-03-22-live-events.sql first'; end if;
  if to_regprocedure('public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)') is null
     or to_regprocedure('public.hr_scaled_hunt_switch(integer,text,boolean,uuid)') is null
     or to_regprocedure('public.hr_scaled_hunts_view(uuid,integer)') is null
     or to_regprocedure('public.hr_scaled_hunt_of(uuid)') is null
     or not exists (select 1 from public.hr_scaled_hunt_rule where id) or not exists (select 1 from public.hr_scaled_grounds) then
    raise exception 'PRECONDITION: the scaled hunts (2027-03-21-scaled-hunts.sql and a scaled-hunts catalogue) are not installed'; end if;
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

-- ── §1 THE FLIP (three rows; every other switch row compared before and after) ─
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id not in ('event_xp_bonus', 'event_open_halls', 'scaled_hunts');
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id in ('event_xp_bonus', 'event_open_halls', 'scaled_hunts') and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id not in ('event_xp_bonus', 'event_open_halls', 'scaled_hunts');
  if v_after is distinct from v_before then raise exception 'arm-switches §1: another switch row moved'; end if;
  raise notice 'arm-switches §1: % row(s) moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe hero rolled back ─────────
-- (a) the rows: everyone, no account list
-- (b) on for any account, a stranger on no list included; a null account still reads off (the fail-safe read is untouched); the
--     stranger's `features` section names all three
-- (c) THE CALENDAR REACHES A STRANGER, on the catalogue's own next window of each event (read from the rows, never a date typed here,
--     so it holds on any day the file is applied): inside the next xp window its Level XP dial on the Mill Cellar is the row's pm; at the
--     next fee window the rat_king call's fee dial is the row's pm and names the event; the `live_events` section lists every event
--     whose next window starts within its week
-- (d) A STRANGER'S HERO (the probe, rolled back: Level 20, a purse, allowlisted only because the game is CLOSED and hr_rpc_gate reads the
--     allowlist; no switch names it): its `scaled_hunts` section is not null and prices the first ground it outgrew at the catalogue's
--     price; ONE hr_scaled_hunt_buy of the slider's least hours sells (ok, the purse down by exactly that price, one shop ledger row,
--     the bank holding the hours); the section then reads them banked and on
-- (e) nothing else: no client or service_role privilege on the table, no policy on it; the two scaled verbs still reach authenticated
--     only; the grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-0000a2e50a01';   -- never inserted anywhere: `everyone` asks no list
  c_u        constant uuid := '000000c0-0000-4000-a000-0000a2e50a02';   -- the probe hero, rolled back
  c_idem     constant uuid := '000000c0-0000-4000-a000-0000a2e50a03';
  v_r record; v jsonb; s jsonb; v_role text; v_sig text; v_g text; v_p bigint; v_h int; v_w jsonb; v_win record; v_n int;
begin
  -- (a)
  for v_r in select switch_id, scope, accounts from public.hr_feature_switches
              where switch_id in ('event_xp_bonus', 'event_open_halls', 'scaled_hunts') loop
    if v_r.scope is distinct from 'everyone' or cardinality(v_r.accounts) <> 0 then
      raise exception 'arm-switches §2(a): % reads % %', v_r.switch_id, v_r.scope, v_r.accounts; end if;
  end loop;
  -- (b)
  foreach v_sig in array array['event_xp_bonus', 'event_open_halls', 'scaled_hunts'] loop
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
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Arm') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'arm-switches §2 probe (the game is closed)') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'arm-switches §2(d)-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, presence_quiet = true, level_xp = public.hr_char_xp_for_level(20)
     where user_id = c_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (c_u, 1000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    s := public.hr_scaled_hunts_view(c_u, 0);
    if s is null then raise exception 'arm-switches §2(d): a stranger''s hero reads no scaled_hunts section'; end if;
    select g.key, (g.value->>'price')::bigint into v_g, v_p from jsonb_each(s->'grounds') g where g.value->>'price' is not null order by g.key limit 1;
    if v_g is null then raise exception 'arm-switches §2(d): no ground scales for a Level 20 hero: %', s; end if;
    if v_p <> (select r.price_per_level::bigint from public.hr_scaled_hunt_rule r where r.id) * public.hr_scaled_level(v_g, 20) then
      raise exception 'arm-switches §2(d): % is priced % an hour, not the catalogue''s', v_g, v_p; end if;
    select r.min_hours into v_h from public.hr_scaled_hunt_rule r where r.id;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_scaled_hunt_buy(0, v_g, v_h, v_p * v_h, c_idem);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(c_u) <> 1000000 - v_p * v_h
       or (select h.banked_ms from public.player_scaled_hours h where h.user_id = c_u and h.slot = 0 and h.hunt_id = v_g) <> v_h * 3600000::bigint
       or (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'scaled\_hunt\_buy:%') <> 1 then
      raise exception 'arm-switches §2(d): a stranger''s purchase of % h on % answered % (purse %)', v_h, v_g, v, public.hr_purse_of(c_u); end if;
    s := public.hr_scaled_hunts_view(c_u, 0)->'grounds'->v_g;
    if (s->>'banked_ms')::bigint <> v_h * 3600000::bigint or (s->>'on')::boolean is not true then
      raise exception 'arm-switches §2(d): after the purchase the section reads %', s; end if;
    raise exception using errcode = 'HRA14', message = 'arm-switches §2 complete - rolling back';
  exception when sqlstate 'HRA14' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.profiles where id = c_u)
     or exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.hr_access_allowlist where user_id = c_u)
     or exists (select 1 from public.player_ledger where user_id = c_u) or exists (select 1 from public.player_scaled_hours where user_id = c_u)
     or exists (select 1 from public.account_wallet where user_id = c_u) then
    raise exception 'arm-switches §2(d): the probe leaked a row'; end if;
  -- (e)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'arm-switches §2(e): % holds a privilege on hr_feature_switches', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'arm-switches §2(e): hr_feature_switches carries a policy'; end if;
  foreach v_sig in array array['public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'public.hr_scaled_hunt_switch(integer,text,boolean,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'arm-switches §2(e): % is not authenticated-only', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'arm-switches §2 OK: the live events and the scaled hunts on for everyone, a stranger''s hero buys scaled hours and each event''s next window reaches it, nothing else moved';
end $chk$;
