-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-22-live-events.sql — LIVE EVENTS ON THE SERVER CLOCK: A BONUS XP WEEKEND AND OPEN HALLS (lane/c-live-events, backend-architect,
--   2026-11-07; Tyler 2026-11-07 approved "live events from data"; the designer's plan, docs/planning/PRIORITY_BOARD.md "2026-11-07 Live
--   events", steps 1 and 2's server half).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §8. ON THE EA SECURITY LIST: Level XP feeds a ranked board, a Call out's fee is a price, the announcer writes a world line.
-- ORDER: after 2027-03-22-live-events-catalogue.generated.sql (the rows), 2027-03-21-feature-switches.sql (the switches) and
-- 2027-03-21-scaled-hunts.sql (the instance-read and apply-member images §0 pins). EDGE: either order. With no window a member's read
-- carries no live_xp and the engine sets no hook, so every hunt plays as before; the engine sends `xp_event` only when an event added XP.
-- NOTHING IS TURNED ON HERE: both switches are seeded OFF. Turning one on is a Coordinator migration (testers first), no release.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   THE SWITCHES event_xp_bonus, event_open_halls (hr_feature_switches), seeded OFF once (on conflict do nothing: a re-apply never reverts
--     a flip). AN EVENT IS LIVE FOR AN ACCOUNT ONLY WHEN ITS WINDOW HOLDS THE SERVER INSTANT AND hr_feature_on(its type's switch, account).
--   hr_live_event_windows(event, from, to)   the event's windows overlapping [from, to): first_at + k x every_days, hours long, while the
--                                            start is at or before until_at (one window when every_days is null)
--   hr_live_events_at(t)                     the rows live at t, each with its window (switches aside: who they're live for is the switch's)
--   hr_live_xp_windows(account, ground, from, to) -> [[from_ms, to_ms, pm], ...]   THE XP DIAL over a span, for one account on one ground:
--                                            every xpPm row whose switch is on for the account and whose scope holds the ground ('world' or
--                                            the id), summed above the row (add), capped at the type's top; segments at 1000 left out
--   hr_live_xp_max_pm(account, ground, from, to)   the most that dial reaches in the span (1000: none), the value bound's factor
--   hr_live_fee_of(account, call, t) -> { pm, event }, hr_live_fee_pm(...) -> pm   THE FEE DIAL at t: the lowest live feePm row (min)
--                                            whose switch is on for the account and whose scope holds the call; 1000 and no event when none
--   hr_live_events_view(user, slot)          the section `live_events`: every row live now or starting within 7 days whose switch is on for
--                                            the account { id, type, dial, pm, starts, ends, scope, live }; null when none (an idle week costs
--                                            one PK read a type)
--   hunt_session_tally.xp_event (NEW)        the Level XP a live event added to the session, kept apart for the best and the analyzer
--   hr_live_event_notices (NEW), hr_live_events_announce(t)   THE ANNOUNCER, run each minute by pg_cron (hr-live-events-announce): a
--                                            window's start and end, once each (keyed on the event, the window's start and the edge), within
--                                            the hour after the edge, written to the System tab only while the switch is `everyone` (a
--                                            System line is read by all, so a testers' or accounts' event never names itself there)
--   hr_boss_call_quote RESTATED              the price is the fee x hr_live_fee_pm / 1000, rounded up; the quote names fee, fee_pm and event
--   ANCHORED SPLICES (pinned, a second apply finds the marker and skips): hr_hunt_instance_read (each member's live_xp over its span),
--     hr_hunt_apply_member (the Level XP bound x the member's own most dial; `xp_event` stripped before the session half, bounded by the
--     window's Level XP, kept on the tally), hr_boss_call (a free call: price 0 accepted, no gold moved, its row still journalled with the
--     dial and the event, so the day's 3 count it), hr_hunt_best_fold (a best's XP an hour leaves the event's part out), hr_hunt_view (the
--     tally's xp_event, for the analyzer's row).
--
-- ── THE RULES IT HOLDS (the designer's, binding) ────────────────────────────
-- A percent dial on what the server already computes: Level XP a kill and the Call out fee. Never gold into a purse, never coin, drops, rares,
-- skill XP or the death loss. Rows of one dial add, then cap at the type's top (xp_bonus: +50%). A kill earns the dial live at its own
-- combat time (the engine reads these windows, src/core/live-events.js). Nothing sells or extends an event.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client reaches any table or helper here; the only client-visible pieces are the section and the boss call's quote, both computed from
-- server rows and the server clock. The Level XP bound grows only by the account's own live dial over the window's own span, so a forged
-- claim can't widen it past a real event. `xp_event` only lowers the hero's own best and is bounded by the window's Level XP and the dial.
-- A free call moves no gold and still spends one of the account's 3 a day.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- Per settle read, per member: one PK read a type when no switch is on (the early out). Per envelope: the same. Per minute: the announcer
-- walks 2 events' windows in the last hour. Rows: the notices table gains at most 4 rows a fortnight.
--
-- REVERSIBILITY: re-apply the six pre-images §0 pins, drop the section row, the cron job, the helpers, hr_live_event_notices and
-- hunt_session_tally.xp_event; the two switch rows may stay (off). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hr_live_events') is null or to_regclass('public.hr_live_event_types') is null then
    raise exception 'PRECONDITION: apply 2027-03-22-live-events-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_scaled_hunt_of(uuid)') is null
     or to_regclass('public.hr_boss_calls') is null or to_regclass('public.hunt_session_tally') is null then
    raise exception 'PRECONDITION: the feature switches, scaled hunts (2027-03-21) and Call out (2027-03-12) first'; end if;
  -- each spliced body is EXACTLY the image this file was written against (normalised md5) or already carries this file's marker
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '9f79583ff0e795b830cce3821c4c11a4'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'd12e2b39cd6c1afa8b73e79e70758d0e'),
    ('public.hr_boss_call_quote(uuid,integer,text)', 'e08d04a92e029799395cbb7de557af20'),
    ('public.hr_boss_call(integer,text,bigint,uuid)', 'ee93f2247d5ae64b71d45b5ba8102095'),
    ('public.hr_hunt_best_fold(uuid)', 'e012345c58f6f3809ff99af19ce86b71'),
    ('public.hr_hunt_view(uuid)', 'af08091953819020803db47d6b4f0b52')) t(fn, pre) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and strpos(v_def, 'LIVE-EVENTS (2027-03-22-live-events.sql)') = 0 then
      raise exception 'PIN: % is neither its expected image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre,
        md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
  end loop;
end $mig$;

-- ── §1 THE SWITCHES (OFF) AND THE TALLY'S COLUMN ─────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('event_xp_bonus', 'off', '2027-03-22-live-events.sql: who a live xp_bonus event (the Bonus XP weekend) is live for. Off: nobody.'),
  ('event_open_halls', 'off', '2027-03-22-live-events.sql: who a live open_halls event (Open Halls, a free Call out) is live for. Off: nobody.')
  on conflict (switch_id) do nothing;
alter table public.hunt_session_tally add column if not exists xp_event bigint not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_xp_event_check') then
    alter table public.hunt_session_tally add constraint hunt_session_tally_xp_event_check check (xp_event >= 0); end if;
end $mig$;
comment on column public.hunt_session_tally.xp_event is
  '2027-03-22-live-events.sql: the Level XP a live event added to this session (written only by hr_hunt_apply_member, bounded by each window''s Level XP), so a personal best leaves it out.';

-- ── §2 THE WINDOWS AND THE DIALS ─────────────────────────────────────────────
create or replace function public.hr_live_event_windows(p_event text, p_from timestamptz, p_to timestamptz)
returns table (starts timestamptz, ends timestamptz) language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare e public.hr_live_events%rowtype; v_step interval; v_k0 bigint; v_k1 bigint; v_s timestamptz; i bigint;
begin
  select * into e from public.hr_live_events x where x.event_id = p_event;
  if not found or p_from is null or p_to is null or p_to <= p_from then return; end if;
  if e.every_days is null then
    if e.first_at < p_to and e.first_at + make_interval(hours => e.hours) > p_from then
      starts := e.first_at; ends := e.first_at + make_interval(hours => e.hours); return next; end if;
    return;
  end if;
  v_step := make_interval(days => e.every_days);
  -- a window is never longer than its repeat (the catalogue's CHECK), so only the one started at or before p_from can still hold it
  v_k0 := greatest(0, floor(extract(epoch from (p_from - e.first_at)) / extract(epoch from v_step)))::bigint;
  v_k1 := floor(extract(epoch from (p_to - e.first_at)) / extract(epoch from v_step))::bigint;
  v_k1 := least(v_k1, v_k0 + 400);   -- a fuse on a caller's span, never on the schedule
  i := v_k0;
  while i <= v_k1 loop
    v_s := e.first_at + v_step * i;
    exit when e.until_at is not null and v_s > e.until_at;
    if v_s < p_to and v_s + make_interval(hours => e.hours) > p_from then
      starts := v_s; ends := v_s + make_interval(hours => e.hours); return next; end if;
    i := i + 1;
  end loop;
end $fn$;

create or replace function public.hr_live_events_at(p_at timestamptz)
returns table (event_id text, type_id text, pm int, scope text[], starts timestamptz, ends timestamptz)
language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return query
    select e.event_id, e.type_id, e.pm, e.scope, w.starts, w.ends
      from public.hr_live_events e
     cross join lateral public.hr_live_event_windows(e.event_id, p_at, p_at + interval '1 millisecond') w
     order by e.event_id;
end $fn$;

create or replace function public.hr_live_xp_windows(p_user uuid, p_ground text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_out jsonb;
begin
  if p_user is null or p_ground is null or p_from is null or p_to is null or p_to <= p_from then return '[]'::jsonb; end if;
  -- the early out: no XP type switched on for this account (the switches start off), nothing to read
  if not exists (select 1 from public.hr_live_event_types t where t.dial = 'xpPm' and public.hr_feature_on(t.switch_id, p_user)) then
    return '[]'::jsonb; end if;
  with ev as (
    select e.event_id, e.pm, t.hi
      from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id
     where t.dial = 'xpPm' and (e.scope @> array['world'] or e.scope @> array[p_ground]) and public.hr_feature_on(t.switch_id, p_user)),
  w as (
    select ev.pm, ev.hi, greatest(x.starts, p_from) as a, least(x.ends, p_to) as b
      from ev cross join lateral public.hr_live_event_windows(ev.event_id, p_from, p_to) x),
  pts as (select a as p from w union select b from w),
  seg as (select p as a, lead(p) over (order by p) as b from pts),
  dial as (
    select s.a, s.b, least(min(w.hi), 1000 + sum(w.pm - 1000))::int as pm
      from seg s join w on w.a <= s.a and w.b >= s.b
     where s.b is not null and s.b > s.a
     group by s.a, s.b)
  select coalesce(jsonb_agg(jsonb_build_array(floor(extract(epoch from d.a) * 1000)::bigint, floor(extract(epoch from d.b) * 1000)::bigint, d.pm)
                            order by d.a), '[]'::jsonb)
    into v_out from dial d where d.pm <> 1000;
  return v_out;
end $fn$;

create or replace function public.hr_live_xp_max_pm(p_user uuid, p_ground text, p_from timestamptz, p_to timestamptz)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return greatest(1000, coalesce((select max((w->>2)::int) from jsonb_array_elements(public.hr_live_xp_windows(p_user, p_ground, p_from, p_to)) w), 1000));
end $fn$;

create or replace function public.hr_live_fee_of(p_user uuid, p_call text, p_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_pm int; v_event text;
begin
  if p_user is null or p_call is null or p_at is null then return jsonb_build_object('pm', 1000, 'event', null); end if;
  select greatest(t.lo, least(t.hi, a.pm)), a.event_id into v_pm, v_event
    from public.hr_live_events_at(p_at) a join public.hr_live_event_types t on t.type_id = a.type_id
   where t.dial = 'feePm' and (a.scope @> array['world'] or a.scope @> array[p_call]) and public.hr_feature_on(t.switch_id, p_user)
   order by greatest(t.lo, least(t.hi, a.pm)), a.event_id limit 1;
  return jsonb_build_object('pm', least(1000, coalesce(v_pm, 1000)), 'event', case when v_pm is not null and v_pm < 1000 then v_event end);
end $fn$;

create or replace function public.hr_live_fee_pm(p_user uuid, p_call text, p_at timestamptz)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return (public.hr_live_fee_of(p_user, p_call, p_at)->>'pm')::int;
end $fn$;

-- ── §3 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_live_events_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_out jsonb;
begin
  if p_user is null or not exists (select 1 from public.hr_live_event_types t where public.hr_feature_on(t.switch_id, p_user)) then return null; end if;
  select jsonb_agg(jsonb_build_object('id', x.event_id, 'type', x.type_id, 'dial', x.dial, 'pm', x.pm, 'scope', to_jsonb(x.scope),
                                      'starts', x.starts, 'ends', x.ends, 'live', x.starts <= now()) order by x.starts, x.event_id)
    into v_out
    from (select e.event_id, e.type_id, t.dial, e.pm, e.scope, w.starts, w.ends
            from public.hr_live_events e
            join public.hr_live_event_types t on t.type_id = e.type_id
           cross join lateral (select y.starts, y.ends from public.hr_live_event_windows(e.event_id, now(), now() + interval '7 days') y
                                order by y.starts limit 1) w
           where public.hr_feature_on(t.switch_id, p_user)) x;
  return v_out;
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('live_events', 'hr_live_events_view', '2027-03-22-live-events.sql: the live events on now or starting within 7 days whose switch is on for this account (null when none)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 OPEN HALLS: THE CALL OUT'S FEE THROUGH THE DIAL ───────────────────────
create or replace function public.hr_boss_call_quote(p_user uuid, p_slot int, p_call text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r public.hr_boss_calls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype; v_seats int := 0; v_used int; v_why text; v_fee jsonb; v_price bigint;
begin
  -- LIVE-EVENTS (2027-03-22-live-events.sql): the price is the row's fee x the live fee dial (Open Halls: 0) at the server's instant, rounded up.
  select * into r from public.hr_boss_calls where call_id = p_call;
  if not found then return null; end if;
  v_used := (select count(*) from public.player_ledger l
              where l.user_id = p_user and l.kind = 'shop' and l.intent like 'boss\_call:%' and l.at >= public.hr_utc_day_start(now()))::int;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party;
    v_seats := (select count(*) from public.hunt_party_members m where m.party_id = v_party)::int;
  end if;
  v_why := case when v_party is null or v_p.closed_at is not null or v_seats < r.party_min then 'call_party'
                when not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader'
                when v_used >= r.per_day then 'call_limit' end;
  v_fee := public.hr_live_fee_of(p_user, r.call_id, now());
  v_price := (r.fee::bigint * (v_fee->>'pm')::int + 999) / 1000;
  return jsonb_build_object('call', r.call_id, 'available', v_why is null, 'why', v_why, 'price', v_price,
                            'used', v_used, 'per_day', r.per_day, 'left', greatest(0, r.per_day - v_used), 'seats', v_seats, 'party_min', r.party_min,
                            'fee', r.fee, 'fee_pm', (v_fee->>'pm')::int, 'event', v_fee->'event');
end $$;
revoke execute on function public.hr_boss_call_quote(uuid, int, text) from public, anon, authenticated, service_role;

do $mig$
declare
  a1 constant text := $a$  if p_price is null or p_price < 1 or p_price > 1000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;$a$;
  r1 constant text := $a$  -- LIVE-EVENTS (2027-03-22-live-events.sql): an Open Halls call is free (price 0); the quote below still decides every price.
  if p_price is null or p_price < 0 or p_price > 1000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;$a$;
  a2 constant text := $a$    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_call', 'call', p_call, 'n', (v_q->>'used')::int + 1, 'party', v_party, 'hunt', v_c.hunt_id))));$a$;
  r2 constant text := $a$    -- LIVE-EVENTS: a free call moves no gold and still journals its row (the day's 3 count it), with the dial and the event that freed it.
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, (case when p_price > 0 then jsonb_build_object('gold', -p_price) else '{}'::jsonb end) || jsonb_build_object(
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_call', 'call', p_call, 'n', (v_q->>'used')::int + 1, 'party', v_party, 'hunt', v_c.hunt_id,
                                                                      'fee_pm', (v_q->>'fee_pm')::int, 'event', v_q->'event'))));$a$;
  v_a text[] := array[a1, a2]; v_b text[] := array[r1, r2];
  v_def text; v_n int; i int;
begin
  v_def := replace(pg_get_functiondef('public.hr_boss_call(integer,text,bigint,uuid)'::regprocedure), chr(13), '');
  if position('LIVE-EVENTS (2027-03-22-live-events.sql)' in v_def) > 0 then
    raise notice 'live-events §4: hr_boss_call already takes a free call - skipped'; return; end if;
  for i in 1 .. array_length(v_a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_a[i], ''))) / length(v_a[i]);
    if v_n <> 1 then raise exception 'live-events §4: hr_boss_call anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a[i], v_b[i]);
  end loop;
  execute v_def;
end $mig$;

-- ── §5 THE SETTLE: THE WINDOWS IN, THE BOUND, THE EVENT'S PART, THE BEST ─────
do $mig$
declare
  a1 constant text := $a$                 'state', public.hr_hunt_member_state(h.user_id, h.slot))$a$;
  r1 constant text := $a$                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))$a$;
  v_def text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if position('LIVE-EVENTS (2027-03-22-live-events.sql)' in v_def) > 0 then
    raise notice 'live-events §5(a): hr_hunt_instance_read already carries live_xp - skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if v_n <> 1 then raise exception 'live-events §5(a): the hr_hunt_instance_read anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, a1, r1);
end $mig$;

do $mig$
declare
  a1 constant text := $a$  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';$a$;
  r1 constant text := $a$  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';$a$;
  a2 constant text := $a$  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then$a$;
  r2 constant text := $a$  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then$a$;
  a3 constant text := $a$  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW:$a$;
  r3 constant text := $a$  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW:$a$;
  a4 constant text := $a$  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then$a$;
  r4 constant text := $a$  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' then$a$;
  a5 constant text := $a$       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),$a$;
  r5 constant text := $a$       set xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),$a$;
  v_a text[] := array[a1, a2, a3, a4, a5]; v_b text[] := array[r1, r2, r3, r4, r5];
  v_def text; v_n int; i int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if position('LIVE-EVENTS (2027-03-22-live-events.sql)' in v_def) > 0 then
    raise notice 'live-events §5(b): hr_hunt_apply_member already reads the live dial - skipped'; return; end if;
  for i in 1 .. array_length(v_a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_a[i], ''))) / length(v_a[i]);
    if v_n <> 1 then raise exception 'live-events §5(b): hr_hunt_apply_member anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a[i], v_b[i]);
  end loop;
  execute v_def;
end $mig$;

do $mig$
declare
  a1 constant text := $a$  v_xp := (v_ph->>'xp')::numeric::bigint;$a$;
  r1 constant text := $a$  -- LIVE-EVENTS (2027-03-22-live-events.sql): a best is XP an hour without a live event's part, so a weekend never sets a best a normal day can't beat.
  v_xp := round((v_ph->>'xp')::numeric - coalesce((select t.xp_event from public.hunt_session_tally t where t.session_id = p_session), 0) / v_wall_h)::bigint;$a$;
  a2 constant text := $a$'bought', t.bought, 'supply_gold', t.supply_gold) || case when t.fight is null then '{}'::jsonb else jsonb_build_object('fight', t.fight) end$a$;
  r2 constant text := $a$'bought', t.bought, 'supply_gold', t.supply_gold) || case when t.fight is null then '{}'::jsonb else jsonb_build_object('fight', t.fight) end
                       || case when coalesce(t.xp_event, 0) > 0 then jsonb_build_object('xp_event', t.xp_event) else '{}'::jsonb end -- LIVE-EVENTS (2027-03-22-live-events.sql)$a$;
  v_def text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_best_fold(uuid)'::regprocedure), chr(13), '');
  if position('LIVE-EVENTS (2027-03-22-live-events.sql)' in v_def) = 0 then
    v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
    if v_n <> 1 then raise exception 'live-events §5(c): the hr_hunt_best_fold anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, a1, r1);
  end if;
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if position('LIVE-EVENTS (2027-03-22-live-events.sql)' in v_def) = 0 then
    v_n := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
    if v_n <> 1 then raise exception 'live-events §5(d): the hr_hunt_view anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, a2, r2);
  end if;
end $mig$;

-- ── §6 THE ANNOUNCER ─────────────────────────────────────────────────────────
create table if not exists public.hr_live_event_notices (
  event_id     text        not null check (event_id ~ '^[a-z0-9_]{1,64}$'),
  window_start timestamptz not null,
  edge         text        not null check (edge in ('start', 'end')),
  lines        int         not null check (lines between 0 and 1),
  at           timestamptz not null default now(),
  primary key (event_id, window_start, edge)
);
alter table public.hr_live_event_notices enable row level security;
revoke all on public.hr_live_event_notices from public, anon, authenticated, service_role;
comment on table public.hr_live_event_notices is
  '2027-03-22-live-events.sql: each live-event window edge the announcer has passed, once (lines 1: a System line went out; 0: its switch was not everyone). Server-only.';

-- The edges of every event in the hour up to p_at, each once. A line goes to the System tab only while the type's switch is `everyone`: the
-- System channel is read by all, so a testers' or accounts' event is announced to nobody (its section still shows it to them). Times are
-- written in UTC: a chat line can't know its reader's clock. The name trigger stamps an insert under a session as that session's hero, so
-- the one insert runs with no session (hr_town_notice's way, 2027-03-04-town-works.sql).
create or replace function public.hr_live_events_announce(p_at timestamptz default now())
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  r record; w record; v_edge text; v_at timestamptz; v_on boolean; v_body text; v_next timestamptz; v_n int := 0; v_ins int;
  utc constant text := 'FMDay at HH24:MI "UTC"';
begin
  for r in select e.*, t.switch_id, t.dial from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id order by e.event_id loop
    for w in select * from public.hr_live_event_windows(r.event_id, p_at - interval '1 hour' - make_interval(hours => r.hours), p_at + interval '1 millisecond') loop
      foreach v_edge in array array['start', 'end'] loop
        v_at := case v_edge when 'start' then w.starts else w.ends end;
        continue when v_at > p_at or v_at <= p_at - interval '1 hour';
        v_on := exists (select 1 from public.hr_feature_switches f where f.switch_id = r.switch_id and f.scope = 'everyone');
        insert into public.hr_live_event_notices (event_id, window_start, edge, lines) values (r.event_id, w.starts, v_edge, case when v_on then 1 else 0 end)
          on conflict do nothing;
        get diagnostics v_ins = row_count;
        continue when v_ins = 0 or not v_on;
        v_body := case v_edge when 'start' then r.start_words else r.end_words end;
        v_body := replace(v_body, '{pct}', ((r.pm - 1000) / 10)::text);
        v_body := replace(v_body, '{end}', to_char(w.ends at time zone 'UTC', utc));
        select y.starts into v_next from public.hr_live_event_windows(r.event_id, w.ends, w.ends + make_interval(days => coalesce(r.every_days, 0) + 1)) y
         where y.starts >= w.ends order by y.starts limit 1;
        v_body := case when v_next is null then regexp_replace(v_body, '\s*[^.]*\{next\}[^.]*\.', '')
                       else replace(v_body, '{next}', to_char(v_next at time zone 'UTC', 'FMDay DD FMMonth at HH24:MI "UTC"')) end;
        perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
        insert into public.chat_messages (id, channel, from_id, from_name, body) values (gen_random_uuid(), 'system', null, 'Havora', left(v_body, 240));
        perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);
        v_n := v_n + 1;
      end loop;
    end loop;
  end loop;
  return v_n;
end $fn$;

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'live-events §6: pg_cron absent here; hr-live-events-announce is not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-live-events-announce', '* * * * *', 'select public.hr_live_events_announce()');
end $mig$;

-- ── §7 GRANTS: nobody but the owner, the engine's read untouched ─────────────
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_live_event_windows(text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_events_at(timestamp with time zone)',
                               'public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_xp_max_pm(uuid,text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_fee_of(uuid,text,timestamp with time zone)', 'public.hr_live_fee_pm(uuid,text,timestamp with time zone)',
                               'public.hr_live_events_view(uuid,integer)', 'public.hr_live_events_announce(timestamp with time zone)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', v_sig); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke all on function %s from hr_tick', v_sig); end if;
  end loop;
  revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
  revoke all on function public.hr_hunt_apply_member(uuid, uuid, integer, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
  revoke all on function public.hr_hunt_best_fold(uuid) from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine; end if;
  revoke execute on function public.hr_boss_call(int, text, bigint, uuid) from public, anon, service_role;
  grant execute on function public.hr_boss_call(int, text, bigint, uuid) to authenticated;
end $grants$;

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the splices are in, once each; no client role reaches a helper or a table; both switches exist and the catalogue's two are off unless flipped
-- (b) the window math at the edges: a one-off; a repeat's first, its next and its last (start at `until`), nothing after; an instant
--     a millisecond before a start and at an end is outside
-- (c) the XP dial: off is nobody; `accounts` only the listed; `testers` only the allowlist; two rows add (+25% and +10% make +35%) and a
--     third caps at the type's top; the segments meet at the window edges; a ground out of scope gets none
-- (d) the fee: the lowest live row wins; off or out of scope is the row's fee; the quote prices it, rounded up
-- (e) the section lists what is on or near for the account, null when nothing is
-- (f) the announcer: an edge in the last hour posts once with its words filled (UTC), never twice; a testers' event posts nothing
do $$
declare
  c_in  constant uuid := '000000c0-0000-4000-a000-0000e7e00001';   -- on the allowlist
  c_out constant uuid := '000000c0-0000-4000-a000-0000e7e00002';   -- a stranger
  t0    constant timestamptz := '2020-01-06 00:00:00+00';          -- before every real row's first window
  v jsonb; v_src text; v_role text; v_sig text; v_n int; v_now timestamptz := date_trunc('second', now());
begin
  -- (a)
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'public.hr_live_xp_max_pm(', ''))) / length('public.hr_live_xp_max_pm(') <> 2
     or strpos(v_src, '''tick_ms'' - ''xp_event''') = 0 or strpos(v_src, 'set xp_event = t.xp_event + coalesce((p_hunt->>''xp_event'')::bigint, 0),') = 0
     or strpos(v_src, 'or p_hunt ? ''xp_event'' then') = 0 then
    raise exception 'live-events §8(a): hr_hunt_apply_member does not bound and keep the event''s part'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure), '''live_xp'', public.hr_live_xp_windows(') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_best_fold(uuid)'::regprocedure), 'xp_event') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_boss_call(integer,text,bigint,uuid)'::regprocedure), 'p_price < 0') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_view(uuid)'::regprocedure), '''xp_event'', t.xp_event') = 0 then
    raise exception 'live-events §8(a): a splice is missing (instance read, best fold, boss call or hunt view)'; end if;
  foreach v_sig in array array['public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_fee_pm(uuid,text,timestamp with time zone)', 'public.hr_live_events_view(uuid,integer)',
                               'public.hr_live_events_announce(timestamp with time zone)', 'public.hr_live_events_at(timestamp with time zone)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'live-events §8(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_live_event_notices', 'select,insert,update,delete') then
      raise exception 'live-events §8(a): % reaches hr_live_event_notices', v_role; end if;
  end loop;
  if (select count(*) from public.hr_feature_switches where switch_id in ('event_xp_bonus', 'event_open_halls')) <> 2 then
    raise exception 'live-events §8(a): a switch row is missing'; end if;

  begin
    insert into auth.users (id) values (c_in), (c_out) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_in, 'live-events §8 probe') on conflict (user_id) do nothing;
    insert into public.hr_live_event_types (type_id, switch_id, dial, lo, hi, stack, scope_kind) values
      ('zz_probe_xp', 'zz_probe_xp_on', 'xpPm', 1000, 1500, 'add', 'grounds'),
      ('zz_probe_fee', 'zz_probe_fee_on', 'feePm', 0, 1000, 'min', 'calls');
    insert into public.hr_feature_switches (switch_id, scope) values ('zz_probe_xp_on', 'off'), ('zz_probe_fee_on', 'off');
    insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
      ('zz_probe_once', 'zz_probe_xp', 1100, '{world}', t0 + interval '3 hours', 2, null, null, 'Probe', 'Probe on until {end}.', 'Probe off. Next {next}.'),
      ('zz_probe_rep', 'zz_probe_xp', 1250, '{world}', t0, 4, 1, t0 + interval '2 days', 'Probe', 'Probe on, {pct}% until {end}.', 'Probe off. The next one starts {next}.'),
      ('zz_probe_big', 'zz_probe_xp', 1400, '{mosslight_glade}', t0 + interval '3 hours 30 minutes', 1, null, null, 'Probe', 'x', 'y');
    -- (b)
    if (select count(*) from public.hr_live_event_windows('zz_probe_rep', t0 - interval '1 day', t0 + interval '10 days')) <> 3
       or not exists (select 1 from public.hr_live_event_windows('zz_probe_rep', t0 + interval '2 days', t0 + interval '2 days 1 hour') w where w.starts = t0 + interval '2 days')
       or exists (select 1 from public.hr_live_events_at(t0 + interval '3 days 1 hour') a where a.event_id like 'zz\_probe%')
       or exists (select 1 from public.hr_live_events_at(t0 - interval '1 millisecond') a where a.event_id = 'zz_probe_rep')
       or exists (select 1 from public.hr_live_events_at(t0 + interval '4 hours') a where a.event_id = 'zz_probe_rep')
       or not exists (select 1 from public.hr_live_events_at(t0 + interval '1 day 3 hours') a where a.event_id = 'zz_probe_rep')
       or (select count(*) from public.hr_live_events_at(t0 + interval '3 hours 1 minute') a where a.event_id in ('zz_probe_once', 'zz_probe_rep')) <> 2 then
      raise exception 'live-events §8(b): the window math is wrong at an edge'; end if;
    -- (c) off: nobody; accounts: the listed; testers: the allowlist; everyone: the sum under the cap, cut at the window edges, in scope
    if public.hr_live_xp_windows(c_in, 'mill_cellar', t0, t0 + interval '6 hours') <> '[]'::jsonb then
      raise exception 'live-events §8(c): a switch off still gives a window'; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_out] where switch_id = 'zz_probe_xp_on';
    if public.hr_live_xp_windows(c_out, 'mill_cellar', t0, t0 + interval '6 hours') = '[]'::jsonb
       or public.hr_live_xp_windows(c_in, 'mill_cellar', t0, t0 + interval '6 hours') <> '[]'::jsonb then
      raise exception 'live-events §8(c): `accounts` is not the listed account alone'; end if;
    update public.hr_feature_switches set scope = 'testers', accounts = '{}' where switch_id = 'zz_probe_xp_on';
    if public.hr_live_xp_windows(c_in, 'mill_cellar', t0, t0 + interval '6 hours') = '[]'::jsonb
       or public.hr_live_xp_windows(c_out, 'mill_cellar', t0, t0 + interval '6 hours') <> '[]'::jsonb then
      raise exception 'live-events §8(c): `testers` is not the allowlist alone'; end if;
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'zz_probe_xp_on';
    v := jsonb_build_array(
      jsonb_build_array(floor(extract(epoch from t0) * 1000)::bigint, floor(extract(epoch from t0 + interval '3 hours') * 1000)::bigint, 1250),
      jsonb_build_array(floor(extract(epoch from t0 + interval '3 hours') * 1000)::bigint, floor(extract(epoch from t0 + interval '4 hours') * 1000)::bigint, 1350),
      jsonb_build_array(floor(extract(epoch from t0 + interval '4 hours') * 1000)::bigint, floor(extract(epoch from t0 + interval '5 hours') * 1000)::bigint, 1100));
    if public.hr_live_xp_windows(c_out, 'mill_cellar', t0, t0 + interval '6 hours') <> v then
      raise exception 'live-events §8(c): two rows on the Cellar read %, want %', public.hr_live_xp_windows(c_out, 'mill_cellar', t0, t0 + interval '6 hours'), v; end if;
    if public.hr_live_xp_max_pm(c_out, 'mosslight_glade', t0, t0 + interval '6 hours') <> 1500
       or public.hr_live_xp_max_pm(c_out, 'mill_cellar', t0, t0 + interval '6 hours') <> 1350
       or public.hr_live_xp_max_pm(c_out, 'mill_cellar', t0 - interval '2 days', t0 - interval '1 day') <> 1000
       or not exists (select 1 from jsonb_array_elements(public.hr_live_xp_windows(c_out, 'mosslight_glade', t0, t0 + interval '6 hours')) w
                       where (w->>0)::bigint = floor(extract(epoch from t0 + interval '3 hours 30 minutes') * 1000)::bigint and (w->>2)::int = 1500) then
      raise exception 'live-events §8(c): three rows do not cap at the type''s top, or a ground out of scope got one'; end if;
    -- (d) the fee: the lowest live row wins; off or out of scope is the row's fee; the quote prices it
    insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
      ('zz_probe_fee_a', 'zz_probe_fee', 500, '{rat_king}', v_now - interval '1 hour', 2, null, null, 'Probe', 'x', 'y'),
      ('zz_probe_fee_b', 'zz_probe_fee', 0, '{world}', v_now - interval '30 minutes', 1, null, null, 'Probe', 'x', 'y');
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_in] where switch_id = 'zz_probe_fee_on';
    if (public.hr_live_fee_of(c_in, 'rat_king', v_now)->>'pm')::int <> 0 or public.hr_live_fee_of(c_in, 'rat_king', v_now)->>'event' is distinct from 'zz_probe_fee_b'
       or public.hr_live_fee_pm(c_in, 'chief_coppercap', v_now) <> 0 or public.hr_live_fee_pm(c_out, 'rat_king', v_now) <> 1000
       or public.hr_live_fee_of(c_out, 'rat_king', v_now)->'event' <> 'null'::jsonb
       or public.hr_live_fee_pm(c_in, 'rat_king', v_now + interval '45 minutes') <> 500 or public.hr_live_fee_pm(c_in, 'chief_coppercap', v_now + interval '45 minutes') <> 1000 then
      raise exception 'live-events §8(d): the fee dial is not the lowest live row for the account and the call'; end if;
    if (public.hr_boss_call_quote(c_in, 0, 'rat_king')->>'price')::bigint <> 0
       or (public.hr_boss_call_quote(c_out, 0, 'rat_king')->>'price')::bigint <> (select fee from public.hr_boss_calls where call_id = 'rat_king') then
      raise exception 'live-events §8(d): the quote prices % and %', public.hr_boss_call_quote(c_in, 0, 'rat_king'), public.hr_boss_call_quote(c_out, 0, 'rat_king'); end if;
    -- (e) the section
    v := public.hr_live_events_view(c_in, 0);
    if v is null or not exists (select 1 from jsonb_array_elements(v) x where x->>'id' = 'zz_probe_fee_b' and (x->>'live')::boolean)
       or exists (select 1 from jsonb_array_elements(coalesce(public.hr_live_events_view(c_out, 0), '[]'::jsonb)) x where x->>'id' like 'zz\_probe\_fee%') then
      raise exception 'live-events §8(e): the section reads % and %', v, public.hr_live_events_view(c_out, 0); end if;
    -- (f) the announcer: once, filled, in UTC; a testers' event says nothing
    insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
      ('zz_probe_ann', 'zz_probe_xp', 1250, '{world}', v_now - interval '10 minutes', 1, 7, null, 'Probe', 'The probe started. {pct}% until {end}.', 'x');
    v_n := public.hr_live_events_announce(v_now);
    v_n := public.hr_live_events_announce(v_now);
    if (select count(*) from public.chat_messages m where m.channel = 'system' and m.body like 'The probe started. 25\% until %UTC.') <> 1
       or (select count(*) from public.hr_live_event_notices n where n.event_id = 'zz_probe_ann' and n.edge = 'start' and n.lines = 1) <> 1 then
      raise exception 'live-events §8(f): the start line went out % times', (select count(*) from public.chat_messages m where m.body like 'The probe started.%'); end if;
    update public.hr_feature_switches set scope = 'testers' where switch_id = 'zz_probe_xp_on';
    insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
      ('zz_probe_ann2', 'zz_probe_xp', 1250, '{world}', v_now - interval '5 minutes', 1, 7, null, 'Probe', 'The quiet probe started.', 'x');
    perform public.hr_live_events_announce(v_now);
    if exists (select 1 from public.chat_messages m where m.body like 'The quiet probe started.%')
       or not exists (select 1 from public.hr_live_event_notices n where n.event_id = 'zz_probe_ann2' and n.lines = 0) then
      raise exception 'live-events §8(f): a testers'' event was announced to everyone'; end if;
    raise exception using errcode = 'HR923', message = 'live-events §8 complete - rolling back';
  exception when sqlstate 'HR923' then
    null;
  end;
  if exists (select 1 from public.hr_live_events where event_id like 'zz\_probe%') or exists (select 1 from public.hr_feature_switches where switch_id like 'zz\_probe%')
     or exists (select 1 from public.hr_live_event_notices where event_id like 'zz\_probe%') then
    raise exception 'live-events §8: LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'live-events: the windows, the XP and fee dials, the switches, the section and the announcer hold; nothing is on; all green';
end $$;
