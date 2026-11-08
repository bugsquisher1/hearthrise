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
--     hr_boss_call (a free call: price 0 accepted, no gold moved, its row still journalled with the dial and the event, so the day's 3
--     count it).
--   RESTATED WHOLE (pinned pre-images; tests/patch-chain-guard.mjs: their chains were 2 deep or more): hr_hunt_apply_member (the Level XP
--     bound x the member's own most dial; `xp_event` stripped before the session half, bounded by the window's Level XP, kept on the
--     tally), hr_hunt_best_fold (a best's XP an hour leaves the event's part out), hr_hunt_view (the tally's xp_event, for the analyzer's row).
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
  -- each body is EXACTLY the image this file was written against (normalised md5) or this file's: a spliced body by its marker, a body
  -- restated whole by its own image, so a second apply after a later file moved one refuses, never undoes it
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '9f79583ff0e795b830cce3821c4c11a4', null),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'd12e2b39cd6c1afa8b73e79e70758d0e', 'fcd02cce2deb56e7e62cc2294bec14e4'),
    ('public.hr_boss_call_quote(uuid,integer,text)', 'e08d04a92e029799395cbb7de557af20', '445a7b269f24fdedf1f3254fb62e148c'),
    ('public.hr_boss_call(integer,text,bigint,uuid)', 'ee93f2247d5ae64b71d45b5ba8102095', null),
    ('public.hr_hunt_best_fold(uuid)', 'e012345c58f6f3809ff99af19ce86b71', 'fa7421f3a9d55fff27ae53d254196540'),
    ('public.hr_hunt_view(uuid)', 'af08091953819020803db47d6b4f0b52', '8b404643fc5c6507f83b2f4a396d188f')) t(fn, pre, own) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and (case when v_r.own is null then strpos(v_def, 'LIVE-EVENTS (2027-03-22-live-events.sql)') = 0
                 else md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.own end) then
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

-- (b) hr_hunt_apply_member RESTATED WHOLE (tests/patch-chain-guard.mjs: its chain was 4 deep since 2027-01-31-inner-flame.sql). The body is
--     2027-03-21-scaled-hunts.sql's with this file's three changes (each marked LIVE-EVENTS): `xp_event` stripped before the session
--     half; the Level XP bound x the account's own most dial over the window; the event's part bounded and kept on the tally's one
--     update. §0 pinned its pre-image.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
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
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' then
    update public.hunt_session_tally t
       set xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- (c) hr_hunt_best_fold RESTATED WHOLE (its chain was 2 deep): a best is XP an hour without a live event's part (marked LIVE-EVENTS).
CREATE OR REPLACE FUNCTION public.hr_hunt_best_fold(p_session uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): the run that holds xp_h also gives supply_h (its store gold an hour).
  v_s      public.hunt_sessions%rowtype;
  v_wall_h numeric;
  v_mode   text;
  v_ph     jsonb;
  v_xp     bigint;
  v_bal    bigint;
  v_sup    bigint;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  if not found or v_s.ended_at is null or v_s.ended_at - v_s.entered_at < public.hr_hunt_best_min() then return; end if;
  -- THE ANALYZER'S CLOCK: wall hours, entered -> ended (hr_hunt_analyzer_of's v_wall_h).
  v_wall_h := extract(epoch from (v_s.ended_at - v_s.entered_at)) / 3600.0;
  -- THE ANALYZER'S PARTY: another character's session in this instance whose hunt overlapped this one.
  v_mode := case when exists (
      select 1 from public.hunt_sessions h
       where h.instance_id = v_s.instance_id and h.id <> v_s.id
         and (h.user_id, h.slot) <> (v_s.user_id, v_s.slot)
         and h.entered_at <= v_s.ended_at and coalesce(h.ended_at, now()) >= v_s.entered_at)
    then 'party' else 'solo' end;
  -- THE HERO'S OWN figures, exactly as its analyzer showed them (never the party's sum).
  v_ph := public.hr_hunt_stats_of(array[v_s.id], v_wall_h, null, null)->'per_hour';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): a best is XP an hour without a live event's part, so a weekend never sets a best a normal day can't beat.
  v_xp := round((v_ph->>'xp')::numeric - coalesce((select t.xp_event from public.hunt_session_tally t where t.session_id = p_session), 0) / v_wall_h)::bigint;
  v_bal := (v_ph->>'balance')::numeric::bigint;
  v_sup := (v_ph->>'waste')::numeric::bigint;
  if v_xp is null or v_bal is null then return; end if;
  insert into public.hunt_bests as b (user_id, slot, hunt_id, mode, xp_h, xp_session, balance_h, balance_session, supply_h)
    values (v_s.user_id, v_s.slot, v_s.hunt_id, v_mode, v_xp, v_s.id, v_bal, v_s.id, v_sup)
  on conflict (user_id, slot, hunt_id, mode) do update
    set xp_h            = greatest(b.xp_h, excluded.xp_h),
        xp_session      = case when excluded.xp_h > b.xp_h then excluded.xp_session else b.xp_session end,
        supply_h        = case when excluded.xp_h > b.xp_h then excluded.supply_h else b.supply_h end,
        balance_h       = greatest(b.balance_h, excluded.balance_h),
        balance_session = case when excluded.balance_h > b.balance_h then excluded.balance_session else b.balance_session end,
        updated_at      = case when excluded.xp_h > b.xp_h or excluded.balance_h > b.balance_h then now() else b.updated_at end;
end $function$;

-- (d) hr_hunt_view RESTATED WHOLE (its chain was 2 deep since 2027-02-18-party-truth.sql): the tally's xp_event for the analyzer's row
--     (marked LIVE-EVENTS).
CREATE OR REPLACE FUNCTION public.hr_hunt_view(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

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
    -- ENDED-TIER (2027-03-16-ended-hunt-tier.sql): the tier an ended session ran at; null while open (hunt_tier.playing says it then)
    'tier', s.tier,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): a cascade end names the member whose own end at the same
    -- instant sent this hero home (its death for party_member_died), from the server's rows; else null.
    'end_by', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason not in ('party_member_died', 'party_member_left')
       order by (o.end_reason = 'died') = (s.end_reason = 'party_member_died') desc, o.seat, o.id limit 1) end,
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): what ended that member (stamina, left, gold_out ...), the same row's reason.
    'end_by_why', case when s.end_reason in ('party_member_died', 'party_member_left') then (
      select o.end_reason from public.hunt_sessions o
       where o.instance_id = s.instance_id and o.id <> s.id and o.ended_at = s.ended_at
         and o.end_reason <> all (array['party_member_died', 'party_member_left'])
       order by (o.end_reason = 'died') = (s.end_reason = 'party_member_died') desc, o.seat, o.id limit 1) end,
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
                       'bought', t.bought, 'supply_gold', t.supply_gold) || case when t.fight is null then '{}'::jsonb else jsonb_build_object('fight', t.fight) end
                       || case when coalesce(t.xp_event, 0) > 0 then jsonb_build_object('xp_event', t.xp_event) else '{}'::jsonb end -- LIVE-EVENTS (2027-03-22-live-events.sql) -- CALL-OUT (2027-03-12-boss-call.sql)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
  ) as hr_q(v) limit 1);
end
$function$;

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
