-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1053-hunt-report.sql — THE HUNT REPORT'S COUNTERS IN THE SERVER TALLY (GR-66 free risk block and rules block)
--   (lane/c-hunt-report, build plan 13 FB-7, backend-architect, 2026-11-22; 08-player-experience.md section 2.3;
--    09-platform-and-measurement.md section 5 item 11, "the hunt tally's three fields").
--
-- STATUS: supabase/migration-notes/1053-hunt-report.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after 1005-lever-horizon.sql,
--   whose hr_hunt_apply_member it splices, 2027-03-22-live-events.sql + 2027-04-24-boss-call-series.sql, whose hr_hunt_view it
--   restates, and 2027-02-11-settle-plan-cache-2.generated.sql, whose hr_hunt_analyzer_basic it restates).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A death costs 6% of all Level XP and the player is mostly not watching, so every hunt ends with a report: how close it came to a
-- death and what each rule on the bar did (GR-66, free to every player, Tyler said yes 2026-11-21). The report is a screen over
-- counters the settle keeps; survival cannot be calibrated without the lowest health either (09 section 5 item 11). The engine
-- counts them in the analyzer tally (src/core/hunt/tally.js + report.js); this file stores them and shows them.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hunt_session_tally.report jsonb NOT NULL DEFAULT '{}' (CHECK: an object of at most 32 KB; the widest report the fold can keep is 19,879 bytes, §5 c). One row a session, as every tally column:
--   low    { pm, by, blow, at }   the lowest health the hero reached (permille of max HP after the blow), the monster kind and the
--                                 blow (an ability id, 'basic' for a swing), the blow's instant (epoch ms). The lowest wins, a tie
--                                 keeps the earlier blow.
--   close  n                      close calls: blows that took the hero from at least a quarter of its health to under it
--   fired  { rule id: n }         each bar rule's uses (a cast, a shot, a meal, a drink the bar picked)
--   waits  { rule id: { why: n } } why a rule whose conditions held could not act (rule_wait: mana, cooldown, no_stock, ...)
--   bar    [[rule, uses, place]]  the bar as last played (enabled slots, at most 16): a slot that never fired is named from it
--   gear   { w, a, n }            the gear worn as last played: weapon tier, armor tiers added, armor pieces (mean = a / n)
--   dry    { item: at }           each OWN stack that ran dry and its first instant (epoch ms): the DATABASE's, from its own
--                                 hunt_session_events slot_dry rows (hr_hunt_settle_session), never the edge's
-- The tier, the tally's third field, is hunt_sessions.tier (2027-03-16-ended-hunt-tier.sql: stamped as the session ends), read beside
-- this row by session_id; not copied.
-- WRITERS. hr_hunt_apply_member alone (owner-only), in the tally's ONE update a member it already makes (2027-04-08-member-write-
--   once.sql): the edge's analyzer may carry `report` (shape-checked by hr_hunt_report_ok, else the window is refused bad_analyzer
--   before anything is written), folded by hr_hunt_report_add with this window's slot_dry rows. NO ADDED STATEMENT a settle, no
--   journal row (tests/per-player-cost.mjs).
-- READERS. hr_hunt_view (the `hunt` section, every character): tally.report, with the damage by ability and healing by source the
--   rules block's shares read (GR-66: the share is free), only when the session has a report. hr_hunt_analyzer_basic (the free
--   analyzer, and the verb an earlier session's card reads, src/session/past-hunt.js): session.report. Premium's analyzer already
--   carries the whole hr_hunt_view.
-- HELPERS (owner-only, no client grant): hr_hunt_report_ok(jsonb) the edge's report, shape only; hr_hunt_report_add(jsonb, jsonb) the
--   fold, the same rule as src/core/hunt/report.js addReport (its maps capped: 48 rules, 8 reasons a rule, 32 dry items, so the
--   folded row never meets its CHECK and a settle is never refused by its own fold).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The fold runs inside hr_hunt_apply_member, under the instance's lock and the session's swing CAS (a replayed commit lands nothing,
-- 2027-04-08-member-write-once.sql), so a window's counters are folded once. The fold is order-stable: a viewed hunt's windows and a
-- closed hunt's windows fold to the same row (tests/hunt-sessions-settle.mjs REPORT, and BOTH-PATH over the whole tally row).
-- A second apply finds every body at its post pin (§0) and restates the same text: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Display counters on the hero's own session. Nothing reads them to price, pay, gate or rank: no value moves, nothing crosses to
-- another player (hr_hunt_view answers the caller's own session; the party aggregate is not extended). The edge proposes, the
-- database bounds the shape and keys and adds the dry instants itself. No new client verb, grant, table or write path.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No row and no statement: one column on an existing row a session, written by the update that already runs. About 0.3 to 2 KB a
-- session (a four-hero hour holds four); at 100x today's hunting (~60k sessions a month) ~60 MB a month inside hunt_session_tally,
-- pruned with it. CPU: one jsonb shape check and one fold a member a settle (the self-check times nothing; per-player-cost's CPU smoke
-- alarm reads it). The `hunt` section grows by the report (~0.5-2 KB) only once a session has one. The edge's events carry two more
-- integers on a blow at a hero (damage.js landHit `hp`, `max`).
-- EDGE: hr-accrue accrue-hunt.js proposes analyzer.report. APPLY THIS FILE BEFORE THAT EDGE DEPLOYS: the old body refuses an
--   analyzer key it does not know (bad_analyzer), and six refused windows forfeit a hunt. This file over an old edge is safe (no report
--   is sent; the column stays '{}').
-- REVERSIBLE: restate hr_hunt_view from 2027-03-22-live-events.sql (+ 2027-04-24-boss-call-series.sql's splice) and
--   hr_hunt_analyzer_basic from 2027-02-11-settle-plan-cache-2.generated.sql (§0 pins the pre images), remove this file's two
--   HUNT-REPORT lines from hr_hunt_apply_member (only after the edge stops sending `report`), drop the two helpers. The column may stay.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is the image this file was written against (the replayed chain on set/v0.2.144) or this file's own (a second apply):
-- md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hunt_session_tally') is null or to_regprocedure('public.hr_hunt_tally_ok(jsonb,text[])') is null
     or to_regclass('public.hunt_session_events') is null then
    raise exception 'PRECONDITION: the hunt tally (2026-10-23-hunt-analyzer-v2.sql) is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '0e0e304013e75ea2535dbb483c04d570', '309c695dc4dfc41d7cf0effe5f9b1dd1'),
    ('public.hr_hunt_view(uuid)', 'fb665623c7255cbf62c96d00cfc2da86', 'cd3f12fac63713be3c9d853b40106784'),
    ('public.hr_hunt_analyzer_basic(jsonb)', '5dd08adae4922c52ed813399c93da73b', '039309e15bfe6d18c2314216f7075b26')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- A RETRY AFTER 1056-danger-scale.sql (staged after this file) finds hr_hunt_apply_member at 1056's image: this file's two
    -- HUNT-REPORT lines already in it, plus the scale's bound. The splice below then finds its marker and moves nothing.
    -- A RETRY AFTER 1057-danger-falls.sql finds hr_hunt_view and hr_hunt_analyzer_basic at 1057's images (restated whole, the Danger
    -- scale's falls and end stance added): this file restates its own, and 1057's retry restates them back.
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)' and v_md5 = 'bdf1e6f5d5bf7266b64b82b2b9f7e5c1')
       and not (v_r.fn = 'public.hr_hunt_view(uuid)' and v_md5 = '32668b16635573452a939532e2c9ec9f')
       and not (v_r.fn = 'public.hr_hunt_analyzer_basic(jsonb)' and v_md5 = '8d5fe398a14f4b44e0133e477b1ff2a4') then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.hunt_session_tally add column if not exists report jsonb not null default '{}'::jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_report_ck'
                   and conrelid = 'public.hunt_session_tally'::regclass) then
    alter table public.hunt_session_tally add constraint hunt_session_tally_report_ck
      check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 32768);
  end if;
end $mig$;
comment on column public.hunt_session_tally.report is
  '1053-hunt-report.sql: the hunt report''s counters (GR-66): low {pm, by, blow, at}, close, fired, waits, bar, gear (the edge''s, shape-checked) and dry (the database''s slot_dry instants). Display only.';

-- ── §2 THE SHAPE AND THE FOLD ────────────────────────────────────────────────
-- Is `p` a report the edge may propose (src/core/hunt/report.js reportProposal)? Every key named, every number whole and bounded,
-- every id [a-z0-9_]. `dry` is never the edge's.
create or replace function public.hr_hunt_report_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare v_k text; v_v jsonb; v_e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for v_k, v_v in select key, value from jsonb_each(p) loop
    case v_k
      when 'low' then
        -- (each type is proved by its own statement before anything reads inside it: an OR's order is the planner's, never ours)
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(v_v)) <> 4
           or jsonb_typeof(v_v->'pm') is distinct from 'number' or (v_v->>'pm') !~ '^[0-9]{1,4}$'
           or jsonb_typeof(v_v->'by') is distinct from 'string' or (v_v->>'by') !~ '^[a-z0-9_]{1,64}$'
           or jsonb_typeof(v_v->'blow') is distinct from 'string' or (v_v->>'blow') !~ '^[a-z0-9_]{1,64}$'
           or jsonb_typeof(v_v->'at') is distinct from 'number' or (v_v->>'at') !~ '^[0-9]{1,15}$' then return false; end if;
        -- (a whole number by now: the cast cannot raise)
        if (v_v->>'pm')::int > 1000 then return false; end if;
      when 'close' then
        if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then return false; end if;
      when 'fired' then
        -- { rule id (conditions.js RULE_ID): uses }, at most 32 rules
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(v_v)) > 32
           or exists (select 1 from jsonb_each(v_v) f where f.key !~ '^[a-z0-9_]{1,24}$' or jsonb_typeof(f.value) <> 'number'
                        or (f.value #>> '{}') !~ '^[0-9]{1,9}$') then return false; end if;
      when 'waits' then
        -- { rule id: { why (events.js rule_wait): n } }, at most 32 rules and 8 reasons a rule
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(v_v)) > 32
           or exists (select 1 from jsonb_each(v_v) w where w.key !~ '^[a-z0-9_]{1,24}$' or jsonb_typeof(w.value) <> 'object') then return false; end if;
        if exists (select 1 from jsonb_each(v_v) w where (select count(*) from jsonb_object_keys(w.value)) > 8
                      or exists (select 1 from jsonb_each(w.value) x where x.key !~ '^[a-z_]{1,16}$' or jsonb_typeof(x.value) <> 'number'
                                   or (x.value #>> '{}') !~ '^[0-9]{1,9}$')) then return false; end if;
      when 'bar' then
        if jsonb_typeof(v_v) <> 'array' then return false; end if;
        if jsonb_array_length(v_v) > 16 then return false; end if;
        for v_e in select value from jsonb_array_elements(v_v) loop
          if jsonb_typeof(v_e) <> 'array' then return false; end if;
          if jsonb_array_length(v_e) <> 3
             or jsonb_typeof(v_e->0) <> 'string' or (v_e->>0) !~ '^[a-z0-9_]{1,24}$'
             or jsonb_typeof(v_e->1) <> 'string' or (v_e->>1) !~ '^[a-z0-9_]{1,64}$'
             or jsonb_typeof(v_e->2) <> 'number' or (v_e->>2) !~ '^[0-9]{1,3}$' then return false; end if;
        end loop;
      when 'gear' then
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(v_v)) <> 3
           or exists (select 1 from jsonb_each(v_v) g where g.key not in ('w', 'a', 'n') or jsonb_typeof(g.value) <> 'number'
                        or (g.value #>> '{}') !~ '^[0-9]{1,4}$') then return false; end if;
      else return false;
    end case;
  end loop;
  return true;
end $fn$;
revoke execute on function public.hr_hunt_report_ok(jsonb) from public, anon, authenticated, service_role;

-- Two reports folded (src/core/hunt/report.js addReport): the lower `low` (a tie to the earlier blow), `close`, `fired` and `waits`
-- added, `bar` and `gear` the later one's, `dry` each item's first instant. A count map keeps its old keys first, then the new ones
-- by name, up to its cap; an empty part is left out (jsonb_strip_nulls), so folding nothing into a report answers the same report.
create or replace function public.hr_hunt_report_add(p_a jsonb, p_b jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  a jsonb := case when jsonb_typeof(p_a) = 'object' then p_a else '{}'::jsonb end;
  b jsonb := case when jsonb_typeof(p_b) = 'object' then p_b else '{}'::jsonb end;
  v_low jsonb; v_fired jsonb; v_waits jsonb; v_dry jsonb; v_inner jsonb; v_k text; v_av jsonb; v_bv jsonb;
begin
  v_low := case when jsonb_typeof(b->'low') is distinct from 'object' then a->'low'
                when jsonb_typeof(a->'low') is distinct from 'object' then b->'low'
                when (b->'low'->>'pm')::int < (a->'low'->>'pm')::int
                  or ((b->'low'->>'pm')::int = (a->'low'->>'pm')::int and (b->'low'->>'at')::bigint < (a->'low'->>'at')::bigint) then b->'low'
                else a->'low' end;
  select jsonb_object_agg(k, v) into v_fired from (
    select k, sum(n) as v from (
      select key as k, (value #>> '{}')::numeric as n, 0 as o from jsonb_each(case when jsonb_typeof(a->'fired') = 'object' then a->'fired' else '{}'::jsonb end)
      union all
      select key, (value #>> '{}')::numeric, 1 from jsonb_each(case when jsonb_typeof(b->'fired') = 'object' then b->'fired' else '{}'::jsonb end)) u
    group by k order by min(o), k limit 48) f;
  for v_k, v_av, v_bv in
    select k, (array_agg(v) filter (where o = 0))[1], (array_agg(v) filter (where o = 1))[1]
      from (select key as k, value as v, 0 as o from jsonb_each(case when jsonb_typeof(a->'waits') = 'object' then a->'waits' else '{}'::jsonb end)
            union all
            select key, value, 1 from jsonb_each(case when jsonb_typeof(b->'waits') = 'object' then b->'waits' else '{}'::jsonb end)) u
     group by k order by min(o), k limit 48
  loop
    select jsonb_object_agg(why, v) into v_inner from (
      select why, sum(n) as v from (
        select key as why, (value #>> '{}')::numeric as n, 0 as o from jsonb_each(case when jsonb_typeof(v_av) = 'object' then v_av else '{}'::jsonb end)
        union all
        select key, (value #>> '{}')::numeric, 1 from jsonb_each(case when jsonb_typeof(v_bv) = 'object' then v_bv else '{}'::jsonb end)) r
      group by why order by min(o), why limit 8) s;
    v_waits := coalesce(v_waits, '{}'::jsonb) || jsonb_build_object(v_k, coalesce(v_inner, '{}'::jsonb));
  end loop;
  select jsonb_object_agg(k, v) into v_dry from (
    select k, min(at) as v from (
      select key as k, (value #>> '{}')::bigint as at, 0 as o from jsonb_each(case when jsonb_typeof(a->'dry') = 'object' then a->'dry' else '{}'::jsonb end)
      union all
      select key, (value #>> '{}')::bigint, 1 from jsonb_each(case when jsonb_typeof(b->'dry') = 'object' then b->'dry' else '{}'::jsonb end)) u
    group by k order by min(o), k limit 32) d;
  return jsonb_strip_nulls(jsonb_build_object(
    'low', v_low,
    'close', nullif(coalesce((a->>'close')::bigint, 0) + coalesce((b->>'close')::bigint, 0), 0),
    'fired', v_fired, 'waits', v_waits,
    'bar', coalesce(b->'bar', a->'bar'), 'gear', coalesce(b->'gear', a->'gear'),
    'dry', v_dry));
end $fn$;
revoke execute on function public.hr_hunt_report_add(jsonb, jsonb) from public, anon, authenticated, service_role;

-- ── §3 THE WRITER: hr_hunt_apply_member, ONE SPLICE (two anchors; the chain was 0 deep since 1005-lever-horizon.sql) ──
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'HUNT-REPORT') = 0 then
    v_old := $a$          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))$a$;
    v_new := $a$          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight', 'report'))
          -- HUNT-REPORT (1053-hunt-report.sql): the report's counters, shape only; the database adds `dry` from its own rows
          or (p_analyzer ? 'report' and not public.hr_hunt_report_ok(p_analyzer->'report'))$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: HUNT-REPORT shape anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',$a$;
    v_new := $a$           -- HUNT-REPORT (1053-hunt-report.sql): the report's counters and each own stack this window ran dry (its slot_dry rows,
           -- the server's own instants), folded in this same write: the lowest health, counts added, the bar and gear as last played
           report = public.hr_hunt_report_add(t.report,
             coalesce(case when jsonb_typeof(p_analyzer->'report') = 'object' then p_analyzer->'report' end, '{}'::jsonb)
             || coalesce((select jsonb_build_object('dry', jsonb_object_agg(x.item, x.at))
                            from (select e.data->>'item' as item, min(floor(extract(epoch from e.at) * 1000))::bigint as at
                                    from public.hunt_session_events e
                                   where e.session_id = p_session and e.id > v_ev0 and e.type = 'slot_dry' and e.data->>'item' ~ '^[a-z0-9_]{1,64}$'
                                   group by 1) x
                          having count(*) > 0), '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: HUNT-REPORT fold anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 THE READERS ───────────────────────────────────────────────────────────
-- (a) hr_hunt_view RESTATED WHOLE (its chain was 1 deep since 2027-03-22-live-events.sql: 2027-04-24-boss-call-series.sql's splice is
--     folded in here), its plan-cache wrapper kept: the tally gains `report` (marked HUNT-REPORT).
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
                       -- HUNT-REPORT (1053-hunt-report.sql): the report's counters once the session has any, with the damage by ability
                       -- and the healing by source its rules block reads each slot's share from (GR-66: the share is free)
                       || case when t.report = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('report', t.report || jsonb_build_object(
                            'dealt', coalesce(t.dealt->'byAbility', '{}'::jsonb), 'healed', coalesce(t.healed->'bySource', '{}'::jsonb))) end
              from public.hunt_session_tally t where t.session_id = s.id))
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a Call out series, the server's own count and bill; no other hunt gains a key.
    || case when s.call_fights is null then '{}'::jsonb else jsonb_build_object('call', jsonb_build_object(
         'fights', s.call_fights, 'fight', s.call_fight, 'won', s.call_won, 'fee', s.call_fee, 'stamina_ms', s.call_stamina_ms,
         'paid_gold', s.call_fight::bigint * s.call_fee, 'paid_stamina_ms', s.call_fight::bigint * s.call_stamina_ms)) end
  from public.hunt_sessions s where s.id = p_session
  ) as hr_q(v) limit 1);
end
$function$;

-- (b) hr_hunt_analyzer_basic RESTATED WHOLE (0 deep since 2027-02-11-settle-plan-cache-2.generated.sql), its plan-cache wrapper kept:
--     the basic session block gains the session's report (the free risk block; an earlier session's card reads it, past-hunt.js).
CREATE OR REPLACE FUNCTION public.hr_hunt_analyzer_basic(p_a jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- PLAN-CACHE (2027-02-11-settle-plan-cache-2.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when p_a is null or jsonb_typeof(p_a) <> 'object' then null else jsonb_build_object(
    'tier', 'basic',
    'session', jsonb_build_object('id', p_a->'session'->'id', 'hunt', p_a->'session'->'hunt',
                 'entered_at', p_a->'session'->'entered_at', 'ended_at', p_a->'session'->'ended_at',
                 'end_reason', p_a->'session'->'end_reason', 'phase', p_a->'session'->'phase',
                 -- HUNT-REPORT (1053-hunt-report.sql): the free risk and rules block (GR-66), the session's own
                 'report', p_a->'session'->'tally'->'report'),
    'wall_ms', p_a->'wall_ms', 'hunt_ms', p_a->'hunt_ms',
    'hero', jsonb_build_object(
      'kills', p_a->'hero'->'kills', 'xp', p_a->'hero'->'xp',
      'gold', p_a->'hero'->'gold', 'gold_basis', p_a->'hero'->'gold_basis', 'coins', p_a->'hero'->'coins',
      'loot_value', p_a->'hero'->'loot_value', 'loot', p_a->'hero'->'loot',
      'balance', p_a->'hero'->'balance',
      'supplies', jsonb_build_object('own', p_a->'hero'->'supplies'->'own', 'store', p_a->'hero'->'supplies'->'store'),
      'per_hour', case when jsonb_typeof(p_a->'hero'->'per_hour') = 'object' then jsonb_build_object(
                    'xp', p_a->'hero'->'per_hour'->'xp', 'gold', p_a->'hero'->'per_hour'->'gold',
                    'balance', p_a->'hero'->'per_hour'->'balance',
                    'kills', p_a->'hero'->'per_hour'->'kills') end))
  end
  ) as hr_q(v) limit 1);
end
$function$;
revoke execute on function public.hr_hunt_analyzer_basic(jsonb) from public, anon, authenticated, service_role;

-- ── §5 THE SELF-CHECK, BY EXECUTING IT (every probe rolled back) ─────────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-00001053feb7';
  c_full constant jsonb := '{"low": {"pm": 140, "by": "rat", "blow": "gnaw", "at": 1800000000000}, "close": 2,
     "fired": {"e0001aa01": 9, "d_attack": 3}, "waits": {"e0001bb02": {"mana": 2, "cooldown": 1}},
     "bar": [["e0001aa01", "rend", 0], ["e0001bb02", "mend", 1]], "gear": {"w": 3, "a": 14, "n": 5}}'::jsonb;
  v jsonb; v_x jsonb; v_sid uuid; v_def text; v_role text; v_bad jsonb;
begin
  -- (a) THE COLUMN and its bound.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_session_tally'
                   and column_name = 'report' and is_nullable = 'NO' and column_default like '''{}''::jsonb%') then
    raise exception 'VERIFY(a): hunt_session_tally.report is not a NOT NULL jsonb defaulting to {}'; end if;
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_report_ck' and conrelid = 'public.hunt_session_tally'::regclass) then
    raise exception 'VERIFY(a): the report''s CHECK is missing'; end if;
  -- (b) THE SHAPE: the full report passes, an empty one passes, and each forgery or slip is refused.
  if not public.hr_hunt_report_ok(c_full) or not public.hr_hunt_report_ok('{}'::jsonb) then raise exception 'VERIFY(b): a good report was refused'; end if;
  foreach v_bad in array array[
      c_full || '{"dry": {"bread": 1}}',                                  -- dry is the database's, never the edge's
      c_full || '{"gold": 5}',                                            -- an unnamed key
      c_full || '{"low": {"pm": 1001, "by": "rat", "blow": "gnaw", "at": 1}}',
      c_full || '{"low": {"pm": 10, "by": "Rat!", "blow": "gnaw", "at": 1}}',
      c_full || '{"low": {"pm": 10, "by": "rat", "blow": "gnaw"}}',
      c_full || '{"close": -1}', c_full || '{"close": 1.5}',
      c_full || '{"fired": {"e1": -3}}', c_full || '{"waits": {"e1": {"mana": "x"}}}',
      c_full || '{"bar": [["e1", "rend", 0, 9]]}', c_full || '{"bar": [["E1", "rend", 0]]}',
      c_full || '{"gear": {"w": 1, "a": 2, "n": 3, "x": 4}}', c_full || '{"gear": {"w": 1, "a": 2}}',
      c_full || '{"waits": {"e1": 5}}', c_full || '{"low": 5}', c_full || '{"fired": []}', c_full || '{"waits": {"e1": {"Mana": 1}}}',
      c_full || '{"fired": {"e123456789012345678901234": 1}}', c_full || '{"bar": [5]}', c_full || '{"gear": 7}',
      '[]'::jsonb]::jsonb[] loop
    if public.hr_hunt_report_ok(v_bad) then raise exception 'VERIFY(b): a bad report passed: %', v_bad; end if;
  end loop;
  if public.hr_hunt_report_ok(c_full || jsonb_build_object('fired', (select jsonb_object_agg('r' || g, 1) from generate_series(1, 33) g))) then
    raise exception 'VERIFY(b): a report of 33 rules passed'; end if;
  -- (c) THE FOLD (src/core/hunt/report.js addReport): the lower health wins, a tie keeps the earlier blow, counts add, the later bar and
  --     gear stand, each dry item keeps its first instant, nothing folded in answers the same report, and the maps stay capped.
  v := public.hr_hunt_report_add(c_full, '{"low": {"pm": 90, "by": "slime", "blow": "basic", "at": 1800000005000}, "close": 1,
         "fired": {"e0001aa01": 1, "e0001cc03": 4}, "waits": {"e0001bb02": {"mana": 1, "no_stock": 1}}, "bar": [["e0001cc03", "bread", 0]],
         "gear": {"w": 4, "a": 15, "n": 5}, "dry": {"bread": 1800000009000}}'::jsonb);
  if v->'low'->>'by' <> 'slime' or (v->>'close')::int <> 3 or (v->'fired'->>'e0001aa01')::int <> 10 or (v->'fired'->>'e0001cc03')::int <> 4
     or (v->'fired'->>'d_attack')::int <> 3 or v->'waits'->'e0001bb02' <> '{"mana": 3, "cooldown": 1, "no_stock": 1}'::jsonb
     or v->'bar' <> '[["e0001cc03", "bread", 0]]'::jsonb or (v->'gear'->>'w')::int <> 4 or (v->'dry'->>'bread')::bigint <> 1800000009000 then
    raise exception 'VERIFY(c): the fold answered %', v; end if;
  v_x := public.hr_hunt_report_add(v, '{"low": {"pm": 90, "by": "rat", "blow": "gnaw", "at": 1800000001000}, "dry": {"bread": 1800000008000}}'::jsonb);
  if v_x->'low'->>'by' <> 'rat' or (v_x->'dry'->>'bread')::bigint <> 1800000008000 then raise exception 'VERIFY(c): a tie or a dry instant kept the later: %', v_x; end if;
  v_x := public.hr_hunt_report_add(v, '{"low": {"pm": 90, "by": "rat", "blow": "gnaw", "at": 1800000009999}}'::jsonb);
  if v_x->'low'->>'by' <> 'slime' then raise exception 'VERIFY(c): a later tie took the low: %', v_x; end if;
  if public.hr_hunt_report_add(v, '{}'::jsonb) <> v or public.hr_hunt_report_add('{}'::jsonb, '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'VERIFY(c): folding nothing moved the report'; end if;
  v_x := '{}'::jsonb;
  for i in 1..3 loop
    v_x := public.hr_hunt_report_add(v_x, jsonb_build_object('fired', (select jsonb_object_agg('r' || lpad((i * 100 + g)::text, 4, '0'), 1) from generate_series(1, 30) g)));
  end loop;
  if (select count(*) from jsonb_object_keys(v_x->'fired')) <> 48 or not (v_x->'fired' ? 'r0101') then
    raise exception 'VERIFY(c): the rules map is not capped at 48 keeping the first: % keys', (select count(*) from jsonb_object_keys(v_x->'fired')); end if;
  --     THE WORST REPORT THE FOLD CAN KEEP fits its CHECK: windows of the widest shape hr_hunt_report_ok passes (32 rules of 24
  --     characters, 8 reasons of 16 a rule, 16 bar slots of the longest ids) folded with 40 dry items, each window a new set of rules.
  v_x := '{}'::jsonb;
  for i in 1..4 loop
    v_bad := (select jsonb_build_object(
      'low', jsonb_build_object('pm', 0, 'by', repeat('m', 64), 'blow', repeat('b', 64), 'at', 999999999999999), 'close', 999999999,
      'fired', jsonb_object_agg(lpad(i::text || g::text, 24, 'r'), 999999999),
      'waits', jsonb_object_agg(lpad(i::text || g::text, 24, 'w'), (select jsonb_object_agg(lpad(chr(96 + h), 16, 'y'), 999999999) from generate_series(1, 8) h)),
      'bar', (select jsonb_agg(jsonb_build_array(lpad(k::text, 24, 'r'), repeat('u', 64), 999)) from generate_series(1, 16) k),
      'gear', jsonb_build_object('w', 9999, 'a', 9999, 'n', 9999)) from generate_series(1, 32) g);
    if not public.hr_hunt_report_ok(v_bad) then raise exception 'VERIFY(c): the widest good window was refused'; end if;
    v_x := public.hr_hunt_report_add(v_x, v_bad || jsonb_build_object('dry',
             (select jsonb_object_agg(lpad(i::text || d::text, 64, 'd'), 999999999999999) from generate_series(1, 40) d)));
  end loop;
  if octet_length(v_x::text) > 32768 then raise exception 'VERIFY(c): the widest folded report is % bytes, past its 32 KB CHECK', octet_length(v_x::text); end if;
  raise notice '1053-hunt-report: the widest folded report is % bytes of its 32768', octet_length(v_x::text);
  -- (d) THE WRITER: both anchors spliced, and the tally's writes are the two the body had (the analyzer's one write a member and the
  --     store cover's; 2027-04-08-member-write-once.sql): no added statement a settle. The fold sits inside the analyzer's write.
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'public.hr_hunt_report_ok(p_analyzer->''report'')') = 0 or strpos(v_def, 'report = public.hr_hunt_report_add(t.report,') = 0
     or strpos(v_def, '''healed'', ''fight'', ''report''))') = 0 then
    raise exception 'VERIFY(d): hr_hunt_apply_member does not check and fold the report'; end if;
  if (length(v_def) - length(replace(v_def, 'update public.hunt_session_tally', ''))) / length('update public.hunt_session_tally') <> 2
     or (length(v_def) - length(replace(v_def, 'insert into public.hunt_session_tally', ''))) / length('insert into public.hunt_session_tally') <> 1 then
    raise exception 'VERIFY(d): hr_hunt_apply_member writes the tally in more statements than its two updates and one insert'; end if;
  if not (strpos(v_def, 'report = public.hr_hunt_report_add(t.report,') between strpos(v_def, '       set bought = case when v_cost > 0')
            and strpos(v_def, '     where t.session_id = p_session;
  end if;
  -- SCALED-BEST')) then
    raise exception 'VERIFY(d): the report is not folded inside the analyzer''s one write'; end if;
  -- (e) THE READERS, EXECUTED: a session's report reaches the `hunt` section with its shares, a session with none shows no key, and the
  --     free analyzer (verb and section) carries it in its session block.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, '1053-hunt-report §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): hr_create_character refused: %', v; end if;
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    if public.hr_hunt_view(v_sid)->'tally' ? 'report' then raise exception 'VERIFY(e): a session with no report shows one'; end if;
    update public.hunt_session_tally set report = c_full, dealt = '{"total": 90, "byAbility": {"basic": 60, "rend": 30}}'::jsonb,
           healed = '{"total": 12, "bySource": {"mend": 12}}'::jsonb where session_id = v_sid;
    v := public.hr_hunt_view(v_sid)->'tally'->'report';
    if v is null or v->'low' <> c_full->'low' or v->'bar' <> c_full->'bar' or v->'dealt' <> '{"basic": 60, "rend": 30}'::jsonb
       or v->'healed' <> '{"mend": 12}'::jsonb then raise exception 'VERIFY(e): the hunt section''s report reads %', v; end if;
    -- the free block (the basic subset of the whole read), and whichever block the verb and the section answer this character
    v := public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(v_uid, 0, null));
    if v->>'tier' <> 'basic' or v->'session'->'report'->'low' <> c_full->'low' or v->'hero' ? 'dealt' then
      raise exception 'VERIFY(e): the free analyzer block reads %', v; end if;
    v := public.hr_hunt_analyzer(0, null);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->'session'->'report', v->'session'->'tally'->'report')->'low' is distinct from c_full->'low' then
      raise exception 'VERIFY(e): the analyzer verb reads %', v; end if;
    v := public.hr_state_of(v_uid, 0)->'hunt_analyzer';
    if coalesce(v->'session'->'report', v->'session'->'tally'->'report')->'gear' is distinct from c_full->'gear' then
      raise exception 'VERIFY(e): the analyzer section lacks the report: %', v; end if;
    raise exception using errcode = 'HR053', message = '1053-hunt-report §5 complete - rolling back';
  exception when sqlstate 'HR053' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(f): §5 LEAKED a probe row'; end if;
  -- (f) NO CLIENT REACHES A HELPER OR A READER'S INSIDES.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_report_ok(jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_report_add(jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_analyzer_basic(jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'execute') then
      raise exception 'VERIFY(f): % reaches a report internal', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_session_tally' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'VERIFY(f): a client write policy sits on hunt_session_tally'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice '1053-hunt-report: the report column, its shape and fold, one tally write a member, the hunt section and the free analyzer carry it; all green';
end $$;
