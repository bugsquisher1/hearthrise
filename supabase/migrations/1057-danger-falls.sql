-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1057-danger-falls.sql — WHY A HUNT FELL BACK, KEPT BY THE SERVER: each fall back and death on the Danger scale with
--   its hero, HP and monster, the deepest step, and the stance and step it ended on, in the hunt view and past hunts; and a plan that names
--   no stance plays the default (Steady) on a scale ground (lane/r2-danger-falls, backend-architect, 2026-11-22;
--   docs/design/redesign/11-build-audit.md section 4 R2; 02-architecture.md package 3 and package 8).
--
-- STATUS: supabase/migration-notes/1057-danger-falls.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1054 (the world shape with lowHero / lowBy and the limit
--   report_falls_max, folded into that STAGED file), 1055 (hr_danger_rules.default_risk, folded in too), 1053-hunt-report.sql (whose
--   hr_hunt_report_ok, hr_hunt_report_add, hr_hunt_view and hr_hunt_analyzer_basic it restates) and 1056-danger-scale.sql (whose
--   hr_danger_freeze it restates, and whose hunt_sessions.risk_end / danger_end it projects). §0 pins every restated body.
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §7 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The report's "fell back: Bram at 23% to a Barrow Brute" and "Held 606 on Steady" (R5) need counters only the engine sees as they happen:
-- which hero broke a pull off, how low it stood, whose blow did it, and how deep the company went. The engine now names them on every fall
-- back's `danger` event (src/core/hunt/danger.js pullEnds; the hero by its SEAT, the one identity the server keeps after a dead hero has
-- left the world; the blow's monster and HP ride the world, so a blow and its break-off on either side of a settle cut name the same).
-- The analyzer tally folds them into the hunt report it already proposes (src/core/hunt/report.js `deep`, `falls`), and this file is the
-- server half: it bounds what the edge may propose, folds it the same way, and shows it. Separately, design package 8 has the first
-- party ground run on Steady: a plan that names no stance now freezes the catalogue's default on a scale ground, with no verb first.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hunt_session_tally.report (1053's column, one row a session) gains, on the Danger scale only (a tier hunt's report is unchanged):
--   deep   int                     the deepest step the company stood at in this session (a pull made, or a step reached)
--   falls  [{ at, from, to, hero?, pm, monster }]   each fall back and death, oldest first, the last hr_hunt_limit('report_falls_max')
--          (12, src/data/hunt-report.js HUNT_REPORT.fallsMax): `at` the pull's end (epoch ms), `from` / `to` the steps, `hero` the SEAT of
--          the hero that broke the pull off (hunt_sessions.seat; absent when it had none), `pm` its HP permille then (0: it died), `monster`
--          the kind whose blow took it there ('unknown' for none). Every hero of the hunt carries the company's same list.
-- hr_hunt_report_ok (now STABLE: it reads the catalogue, only when a report carries these keys): `deep` 0..hr_danger_rules.step_max;
--   `falls` 1..report_falls_max entries, exactly those keys, whole numbers, `to` <= `from` <= `deep` (a fall never climbs, nor starts past
--   the deepest step), `pm` under the boldest stance's trigger (max hr_danger_stances.fall_pm; a death reads 0), `hero` one digit, `monster`
--   an id; `falls` never without `deep`. Anything else: the window is refused bad_analyzer before anything is written (1053's rule).
-- hr_hunt_report_add (now STABLE): `deep` the greater; `falls` the two lists as one, one entry an instant (the stored side's kept), oldest
--   first, the last report_falls_max: the same fold as report.js addReport, so a viewed hunt's windows and a closed hunt's fold alike.
-- READERS. hr_hunt_view (the `hunt` section; the premium analyzer's session): tally.report.falls each gain `name`, the character that held
--   that seat of this instance at the fall's instant (hr_character_name: the server's names, never the edge's), and an ENDED scale session
--   gains `risk_end` and `danger_end` (1056's stamp). hr_hunt_analyzer_basic (the free analyzer: an earlier hunt's card, past-hunt.js): its
--   session block gains `risk_end` / `danger_end` the same way; the report (falls with names, deep) rides its `report` as before.
-- THE DEFAULT STANCE. hr_danger_freeze: on a ground of hr_danger_grounds, a leader's plan that names no stance (never picked, or 'none')
--   freezes hr_danger_rules.default_risk ('steady', src/data/danger.js DEFAULT_RISK, tools/gen-danger.mjs). A named stance is frozen as
--   before; a ground off the scale freezes nothing (the tier path). The engine reads the frozen stance through hr_hunt_instance_read, the
--   one read the tick (browser closed) and the viewed settle both make, so both play it.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- No new writer. The report's keys are folded in hr_hunt_apply_member's ONE tally write a member (1053), under the instance's lock and the
-- session's swing CAS (a replayed commit lands nothing); the fold is associative and order-stable, so any cut of the windows (viewed or
-- closed) stores the same `falls` and `deep` (tests/danger-db.mjs DZ-6). The freeze is the same trigger in the same transaction as before.
-- A second apply finds every body at its post pin (§0) and restates the same text: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No client verb, grant, table or write path. The new keys are display counters on the hero's own session: nothing prices, pays, gates or
-- ranks on them. The edge proposes; the database bounds every number by its own catalogue (step_max, the stances' triggers, the falls cap)
-- and derives every name itself from the seat (a forged seat can only name a character that sat in the same instance, i.e. a party member
-- the reader already sees). `deep` is NOT re-proved against the window's climb bound: a ranked depth must read hunt_instances.danger_top /
-- hunt_density.danger_held, which 1056 proves. The default stance changes no bound: hr_danger_prove proves whatever stance froze.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No row and no statement: two keys in a column already written. A scale session's report grows by at most ~1.5 KB (12 falls of ~110 bytes
-- and the depth; the widest folded report is proved under its 32 KB CHECK in §7 c), written by every member of a party alike: at 100x
-- (~60k sessions a month, all on the scale at worst) ~90 MB a month inside hunt_session_tally, pruned with it. CPU: on the scale, three
-- catalogue reads in the shape check and one limit read in the fold a member window; off the scale none (the keys are absent). The view
-- adds one indexed lookup (hunt_sessions_instance_idx) a fall shown, at most 12, only when a session has falls.
--
-- EDGE: the hr-accrue carrying R2's src/core proposes `deep` and `falls` on scale hunts only. 1053's body refuses both (bad_analyzer),
--   so THIS FILE MUST BE IN BEFORE ANY SCALE HUNT SETTLES ON THAT ENGINE. Scale hunts open only after 1056, so apply 1057 in the same sitting
--   as 1056, before any hero sets out on Muster Barrows; either side of the hr-accrue deploy is safe (the deploy itself follows 1054, which
--   must carry R2's world shape: tools/gen-hunt-sessions.mjs). Over the old engine this file is safe: nothing proposes the keys.
-- REVERSIBLE: restate the four 1053 bodies and 1056's hr_danger_freeze from their pre images (§0 pins them); a stored report's `deep` /
--   `falls` then fail the old shape check only if re-proposed (they are never re-proposed: the fold reads the stored row unchecked).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is the image this file was written against (the replayed chain on set/v0.2.144 with R2's 1054 and 1055) or this
-- file's own (a second apply): md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions' and column_name = 'danger_end') then
    raise exception 'PRECONDITION: apply 1056-danger-scale.sql first (hunt_sessions.risk_end / danger_end)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_session_tally' and column_name = 'report') then
    raise exception 'PRECONDITION: apply 1053-hunt-report.sql first (hunt_session_tally.report)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_danger_rules' and column_name = 'default_risk')
     or not exists (select 1 from public.hr_danger_rules r join public.hr_danger_stances s on s.risk = r.default_risk where r.id) then
    raise exception 'PRECONDITION: apply 1055-danger-scale-danger-catalogue.generated.sql as R2 regenerated it (hr_danger_rules.default_risk)'; end if;
  if coalesce(public.hr_hunt_limit('report_falls_max'), 0) < 1 then
    raise exception 'PRECONDITION: apply 1054-danger-scale-hunt-sessions-catalogue.generated.sql as R2 regenerated it (hr_hunt_limits.report_falls_max)'; end if;
  if not exists (select 1 from public.hr_hunt_world_shape w where w.id and w.fields->'world' ? 'lowHero' and w.fields->'world' ? 'lowBy') then
    raise exception 'PRECONDITION: apply 1054-danger-scale-hunt-sessions-catalogue.generated.sql as R2 regenerated it (the world''s lowHero / lowBy)'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_report_ok(jsonb)', 'a735dfe0e7d1cc0431ae6acef76d6848', 'b911a0ddf2a7dde3819efba30aa86b3d'),
    ('public.hr_hunt_report_add(jsonb,jsonb)', '48ed840a0601e1a005eeccf866c2035c', 'ac10b01bb463d158d5ab755633ec318a'),
    ('public.hr_hunt_view(uuid)', '9b06a593569430f6dca6c8cc5575c08e', '812ab2041a78d10ad28eb9e91011b05b'),
    ('public.hr_hunt_analyzer_basic(jsonb)', '039309e15bfe6d18c2314216f7075b26', '8d5fe398a14f4b44e0133e477b1ff2a4'),
    ('public.hr_danger_freeze()', '57f421e32f561527e25422a967ea96f1', 'f236ffa1d6854e55d198025ba05c5cc1')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE SHAPE: hr_hunt_report_ok RESTATED WHOLE (1053's, + `deep` and `falls`; now STABLE) ─────────────────────────────────────────
create or replace function public.hr_hunt_report_ok(p jsonb)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_k text; v_v jsonb; v_e jsonb; v_smax int; v_fmax int; v_max int; v_cap int; v_key text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  -- DANGER-FALLS (1057-danger-falls.sql): the scale's bounds, read only when the report carries its keys (a tier hunt's never does); the
  -- deepest step proved first, so each fall is read against it
  if p ? 'deep' or p ? 'falls' then
    select r.step_max into v_smax from public.hr_danger_rules r where r.id;
    select max(s.fall_pm) into v_fmax from public.hr_danger_stances s;
    v_max := public.hr_hunt_limit('report_falls_max');
    if v_smax is null or v_fmax is null or v_max is null then return false; end if;
    if not p ? 'deep' or jsonb_typeof(p->'deep') <> 'number' or (p->>'deep') !~ '^[0-9]{1,4}$' then return false; end if;
    if (p->>'deep')::int > v_smax then return false; end if;
  end if;
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
      when 'deep' then
        null;  -- DANGER-FALLS: proved above
      when 'heal', 'took' then
        -- THE LEDGER (19-power-ledger L7, folded in while staged): the company's healing by source { id: n } (at most 16) and damage taken by
        -- seat { one digit: n } (at most 10), whole numbers of at most 12 digits
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        -- (the cap and the key pattern set first: a SQL CASE inside an IF would end the condition at its own THEN)
        v_cap := 10; v_key := '^[0-9]$';
        if v_k = 'heal' then v_cap := 16; v_key := '^[a-z0-9_]{1,64}$'; end if;
        if (select count(*) from jsonb_object_keys(v_v)) > v_cap
           or exists (select 1 from jsonb_each(v_v) h where h.key !~ v_key
                        or jsonb_typeof(h.value) <> 'number' or (h.value #>> '{}') !~ '^[0-9]{1,12}$') then return false; end if;
      when 'sup' then
        -- THE LEDGER: the hero's store bill and time by step bucket { step: [gold, ms] } (at most 32, each a step of the scale)
        if jsonb_typeof(v_v) <> 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(v_v)) > 32
           or exists (select 1 from jsonb_each(v_v) u where u.key !~ '^[0-9]{1,4}$' or jsonb_typeof(u.value) <> 'array') then return false; end if;
        if exists (select 1 from jsonb_each(v_v) u where jsonb_array_length(u.value) <> 2
                     or jsonb_typeof(u.value->0) is distinct from 'number' or (u.value->>0) !~ '^[0-9]{1,12}$'
                     or jsonb_typeof(u.value->1) is distinct from 'number' or (u.value->>1) !~ '^[0-9]{1,12}$') then return false; end if;
        -- (keys are whole numbers by now: the cast cannot raise)
        if exists (select 1 from jsonb_object_keys(v_v) k where k::int > coalesce((select r.step_max from public.hr_danger_rules r where r.id), -1)) then
          return false; end if;
      when 'falls' then
        -- DANGER-FALLS (1057-danger-falls.sql): [{ at, from, to, hero?, pm, monster }], 1..report_falls_max of them
        if jsonb_typeof(v_v) <> 'array' then return false; end if;
        if jsonb_array_length(v_v) < 1 or jsonb_array_length(v_v) > v_max then return false; end if;
        for v_e in select value from jsonb_array_elements(v_v) loop
          if jsonb_typeof(v_e) <> 'object' then return false; end if;
          if exists (select 1 from jsonb_object_keys(v_e) k where k not in ('at', 'from', 'to', 'hero', 'pm', 'monster'))
             or jsonb_typeof(v_e->'at') is distinct from 'number' or (v_e->>'at') !~ '^[0-9]{1,15}$'
             or jsonb_typeof(v_e->'from') is distinct from 'number' or (v_e->>'from') !~ '^[0-9]{1,4}$'
             or jsonb_typeof(v_e->'to') is distinct from 'number' or (v_e->>'to') !~ '^[0-9]{1,4}$'
             or jsonb_typeof(v_e->'pm') is distinct from 'number' or (v_e->>'pm') !~ '^[0-9]{1,4}$'
             or (v_e ? 'hero' and (jsonb_typeof(v_e->'hero') is distinct from 'number' or (v_e->>'hero') !~ '^[0-9]$'))
             or jsonb_typeof(v_e->'monster') is distinct from 'string' or (v_e->>'monster') !~ '^[a-z0-9_]{1,64}$' then return false; end if;
          -- (whole numbers by now) a fall never climbs, never starts past the deepest step, and reads under a stance's trigger (0: a death)
          if (v_e->>'to')::int > (v_e->>'from')::int or (v_e->>'from')::int > (p->>'deep')::int or (v_e->>'pm')::int >= v_fmax then
            return false; end if;
        end loop;
      else return false;
    end case;
  end loop;
  return true;
end $fn$;
revoke execute on function public.hr_hunt_report_ok(jsonb) from public, anon, authenticated, service_role;

-- ── §2 THE FOLD: hr_hunt_report_add RESTATED WHOLE (1053's, + `deep` and `falls`; now STABLE) ───────────────────────────────────────
-- Two reports folded (src/core/hunt/report.js addReport): the lower `low` (a tie to the earlier blow), `close`, `fired` and `waits`
-- added, `bar` and `gear` the later one's, `dry` each item's first instant, `deep` the greater, `falls` one an instant (the first side's
-- kept) oldest first, the last report_falls_max. A count map keeps its old keys first, then the new ones by name, up to its cap; an empty
-- part is left out (jsonb_strip_nulls), so folding nothing into a report answers the same report.
create or replace function public.hr_hunt_report_add(p_a jsonb, p_b jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  a jsonb := case when jsonb_typeof(p_a) = 'object' then p_a else '{}'::jsonb end;
  b jsonb := case when jsonb_typeof(p_b) = 'object' then p_b else '{}'::jsonb end;
  v_low jsonb; v_fired jsonb; v_waits jsonb; v_dry jsonb; v_inner jsonb; v_k text; v_av jsonb; v_bv jsonb;
  v_falls jsonb; v_max int; v_heal jsonb; v_took jsonb; v_sup jsonb;
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
  -- DANGER-FALLS (1057-danger-falls.sql): the falls of both, read only when a side has any (a settle off the scale reads nothing more)
  if jsonb_typeof(a->'falls') = 'array' or jsonb_typeof(b->'falls') = 'array' then
    v_max := greatest(0, coalesce(public.hr_hunt_limit('report_falls_max'), 0));
    select jsonb_agg(k.e order by k.at) into v_falls from (
      select d.e, d.at from (
        select distinct on (u.at) u.e, u.at from (
          select value as e, (value->>'at')::bigint as at, 0 as o
            from jsonb_array_elements(case when jsonb_typeof(a->'falls') = 'array' then a->'falls' else '[]'::jsonb end)
          union all
          select value, (value->>'at')::bigint, 1
            from jsonb_array_elements(case when jsonb_typeof(b->'falls') = 'array' then b->'falls' else '[]'::jsonb end)) u
        order by u.at, u.o) d
      order by d.at desc limit v_max) k;
  end if;
  -- THE LEDGER (19-power-ledger L7, folded in while staged): `heal` and `took` added key by key (old keys first, then new by name, up to
  -- 16 and 10), `sup` each bucket's [gold, ms] added (up to 32); read only when a side has the key
  if jsonb_typeof(a->'heal') = 'object' or jsonb_typeof(b->'heal') = 'object' then
    select jsonb_object_agg(k, v) into v_heal from (
      select k, sum(n) as v from (
        select key as k, (value #>> '{}')::numeric as n, 0 as o from jsonb_each(case when jsonb_typeof(a->'heal') = 'object' then a->'heal' else '{}'::jsonb end)
        union all
        select key, (value #>> '{}')::numeric, 1 from jsonb_each(case when jsonb_typeof(b->'heal') = 'object' then b->'heal' else '{}'::jsonb end)) u
      group by k order by min(o), k limit 16) f;
  end if;
  if jsonb_typeof(a->'took') = 'object' or jsonb_typeof(b->'took') = 'object' then
    select jsonb_object_agg(k, v) into v_took from (
      select k, sum(n) as v from (
        select key as k, (value #>> '{}')::numeric as n, 0 as o from jsonb_each(case when jsonb_typeof(a->'took') = 'object' then a->'took' else '{}'::jsonb end)
        union all
        select key, (value #>> '{}')::numeric, 1 from jsonb_each(case when jsonb_typeof(b->'took') = 'object' then b->'took' else '{}'::jsonb end)) u
      group by k order by min(o), k limit 10) f;
  end if;
  if jsonb_typeof(a->'sup') = 'object' or jsonb_typeof(b->'sup') = 'object' then
    select jsonb_object_agg(k, jsonb_build_array(g, ms)) into v_sup from (
      select k, sum(g) as g, sum(ms) as ms from (
        select key as k, (value->>0)::numeric as g, (value->>1)::numeric as ms, 0 as o
          from jsonb_each(case when jsonb_typeof(a->'sup') = 'object' then a->'sup' else '{}'::jsonb end)
        union all
        select key, (value->>0)::numeric, (value->>1)::numeric, 1
          from jsonb_each(case when jsonb_typeof(b->'sup') = 'object' then b->'sup' else '{}'::jsonb end)) u
      group by k order by min(o), k limit 32) f;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'low', v_low,
    'close', nullif(coalesce((a->>'close')::bigint, 0) + coalesce((b->>'close')::bigint, 0), 0),
    'fired', v_fired, 'waits', v_waits,
    'bar', coalesce(b->'bar', a->'bar'), 'gear', coalesce(b->'gear', a->'gear'),
    'dry', v_dry,
    'deep', greatest((a->>'deep')::bigint, (b->>'deep')::bigint), 'falls', v_falls,
    'heal', v_heal, 'took', v_took, 'sup', v_sup));
end $fn$;
revoke execute on function public.hr_hunt_report_add(jsonb, jsonb) from public, anon, authenticated, service_role;

-- (lane/retire-tier-chain, 2026-11-26: an ended session's `tier` is out of this body, folded in from 1071-retire-tier-chain.sql, which
--  drops hunt_sessions.tier: a staged body is edited in place, never moved by a later file)
-- ── §3 THE HUNT VIEW: hr_hunt_view RESTATED WHOLE (1053's, its plan-cache wrapper kept) ─────────────────────────────────────────────
-- The report's falls each name the character that held the seat (DANGER-FALLS), and an ended scale session its end stance and step.
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
                            'dealt', coalesce(t.dealt->'byAbility', '{}'::jsonb), 'healed', coalesce(t.healed->'bySource', '{}'::jsonb))
                            -- DANGER-FALLS (1057-danger-falls.sql): each fall back names its hero's character, the one that held that seat of this
                            -- instance at the fall's instant (the server's names, never the edge's); a fall with no seat names nobody
                            || case when jsonb_typeof(t.report->'falls') is distinct from 'array' then '{}'::jsonb else jsonb_build_object('falls', (
                                 select coalesce(jsonb_agg(f.e || case when f.e ? 'hero' then jsonb_strip_nulls(jsonb_build_object('name', (
                                          select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
                                           where o.instance_id = s.instance_id and o.seat = (f.e->>'hero')::int
                                             and o.entered_at <= to_timestamp((f.e->>'at')::double precision / 1000)
                                           order by o.entered_at desc, o.id limit 1))) else '{}'::jsonb end order by f.n), '[]'::jsonb)
                                   from jsonb_array_elements(t.report->'falls') with ordinality f(e, n))) end
                            -- THE LEDGER (19-power-ledger L7, folded in while staged): `seats` { seat: name }, each seat that took damage named
                            -- by the character that held it last in this instance (the server's names, never the edge's)
                            || case when jsonb_typeof(t.report->'took') is distinct from 'object' then '{}'::jsonb else jsonb_build_object('seats', (
                                 select coalesce(jsonb_object_agg(k.seat, k.name) filter (where k.name is not null), '{}'::jsonb) from (
                                   select q.key as seat, (select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o
                                          where o.instance_id = s.instance_id and o.seat = q.key::int
                                          order by o.entered_at desc, o.id limit 1) as name
                                     from jsonb_object_keys(t.report->'took') q(key) where q.key ~ '^[0-9]$') k)) end) end
              from public.hunt_session_tally t where t.session_id = s.id))
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a Call out series, the server's own count and bill; no other hunt gains a key.
    || case when s.call_fights is null then '{}'::jsonb else jsonb_build_object('call', jsonb_build_object(
         'fights', s.call_fights, 'fight', s.call_fight, 'won', s.call_won, 'fee', s.call_fee, 'stamina_ms', s.call_stamina_ms,
         'paid_gold', s.call_fight::bigint * s.call_fee, 'paid_stamina_ms', s.call_fight::bigint * s.call_stamina_ms)) end
    -- DANGER-FALLS (1057-danger-falls.sql): the stance and step an ended hunt on the Danger scale stood at (1056's end stamp); off it, no key
    || case when s.danger_end is null then '{}'::jsonb else jsonb_build_object('risk_end', s.risk_end, 'danger_end', s.danger_end) end
  from public.hunt_sessions s where s.id = p_session
  ) as hr_q(v) limit 1);
end
$function$;
revoke execute on function public.hr_hunt_view(uuid) from public, anon, authenticated, service_role;

-- ── §4 THE FREE ANALYZER: hr_hunt_analyzer_basic RESTATED WHOLE (1053's, its plan-cache wrapper kept) ───────────────────────────────
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
                 'report', p_a->'session'->'tally'->'report')
               -- DANGER-FALLS (1057-danger-falls.sql): the stance and step an ended hunt on the Danger scale stood at; off it, no key
               || case when p_a->'session' ? 'danger_end' then jsonb_build_object('risk_end', p_a->'session'->'risk_end',
                    'danger_end', p_a->'session'->'danger_end') else '{}'::jsonb end,
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

-- ── §5 THE DEFAULT STANCE: hr_danger_freeze RESTATED WHOLE (1056's) ─────────────────────────────────────────────────────────────────
create or replace function public.hr_danger_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_i public.hunt_instances%rowtype; v_lu uuid; v_ls int; v_risk text; v_start int; v_margin int;
begin
  -- DANGER-SCALE (1056-danger-scale.sql): the instance's first session (density still null: hr_hunt_density_freeze fires after this one,
  -- by name) freezes the leader's stance and the start step; nothing writes them again until a restart nulls density.
  select * into v_i from public.hunt_instances where id = new.instance_id;
  if not found or v_i.density is not null then return null; end if;
  select p.leader_user, p.leader_slot into v_lu, v_ls from public.hunt_parties p where p.id = new.instance_id and p.closed_at is null;
  select hp.risk into v_risk from public.hero_plans hp where hp.user_id = coalesce(v_lu, new.user_id) and hp.slot = coalesce(v_ls, new.slot);
  -- DANGER-FALLS (1057-danger-falls.sql): on a ground the scale opens on, a plan that names no stance plays the catalogue's default
  -- (hr_danger_rules.default_risk, src/data/danger.js DEFAULT_RISK: 02 package 8, the first party ground runs on Steady); no verb first
  if v_risk is null and exists (select 1 from public.hr_danger_grounds g where g.hunt_id = v_i.hunt_id) then
    select r.default_risk into v_risk from public.hr_danger_rules r where r.id;
  end if;
  if v_risk is null or not exists (select 1 from public.hr_danger_stances s where s.risk = v_risk)
     or not exists (select 1 from public.hr_danger_grounds g where g.hunt_id = v_i.hunt_id) then
    if v_i.risk is not null then update public.hunt_instances set risk = null, danger = null, danger_top = null where id = new.instance_id; end if;
    return null;
  end if;
  select r.start_margin into v_margin from public.hr_danger_rules r where r.id;
  select greatest(0, coalesce(min(coalesce(d.danger_held, 0)), 0) - coalesce(v_margin, 0)) into v_start
    from (select m.user_id, m.slot from public.hunt_party_members m where m.party_id = new.instance_id
          union select new.user_id, new.slot) s
    left join public.hunt_density d on d.user_id = s.user_id and d.slot = s.slot and d.hunt_id = v_i.hunt_id;
  update public.hunt_instances set risk = v_risk, danger = v_start, danger_top = v_start where id = new.instance_id;
  return null;
end $fn$;
revoke execute on function public.hr_danger_freeze() from public, anon, authenticated, service_role;

-- ── §6 THE ENGINE ROLES: none of the restated bodies is theirs to call (each runs inside a server function) ─────────────────────────
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke execute on function public.hr_hunt_view(uuid) from hr_engine; revoke execute on function public.hr_danger_freeze() from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke execute on function public.hr_hunt_view(uuid) from hr_tick; revoke execute on function public.hr_danger_freeze() from hr_tick; end if;
end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-00000000f057';
  k        text := '000000c0-0000-4000-a000-0000';
  c_ground constant text := (select g.hunt_id from public.hr_danger_grounds g order by g.hunt_id limit 1);
  c_plain  constant text := 'mosslight_glade';
  c_good   constant jsonb := '{"deep": 606, "falls": [{"at": 1800000000000, "from": 606, "to": 588, "hero": 1, "pm": 230, "monster": "rat"},
                               {"at": 1800000060000, "from": 600, "to": 480, "pm": 0, "monster": "unknown"}]}'::jsonb;
  v_max    int := public.hr_hunt_limit('report_falls_max');
  v_smax   int := (select r.step_max from public.hr_danger_rules r where r.id);
  v_fmax   int := (select max(s.fall_pm) from public.hr_danger_stances s);
  v_def    text := (select r.default_risk from public.hr_danger_rules r where r.id);
  v jsonb; v_x jsonb; v_bad jsonb; v_role text; v_iid uuid; v_sid uuid; v_at bigint; v_fn text;
begin
  -- (a) THE CATALOGUE AND THE GRANTS: the falls cap and the default stance are the data's rows; no client role reaches a restated body
  if v_max is null or v_max < 1 or v_smax is null or v_fmax is null or v_def is null or c_ground is null then
    raise exception 'VERIFY(a): the catalogue reads cap %, step_max %, fall_pm %, default %, ground %', v_max, v_smax, v_fmax, v_def, c_ground; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_fn in array array['public.hr_hunt_report_ok(jsonb)', 'public.hr_hunt_report_add(jsonb,jsonb)', 'public.hr_hunt_view(uuid)',
                                 'public.hr_hunt_analyzer_basic(jsonb)', 'public.hr_danger_freeze()'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then raise exception 'VERIFY(a): % reaches %', v_role, v_fn; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_session_tally' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'VERIFY(a): a client write policy sits on hunt_session_tally'; end if;

  -- (b) THE SHAPE: a scale report passes, a full list passes, an empty report and 1053's keys alone still pass; each forgery is refused
  if not public.hr_hunt_report_ok(c_good) or not public.hr_hunt_report_ok('{}'::jsonb)
     or not public.hr_hunt_report_ok('{"low": {"pm": 140, "by": "rat", "blow": "gnaw", "at": 1800000000000}, "close": 2}'::jsonb)
     or not public.hr_hunt_report_ok(jsonb_build_object('deep', v_smax, 'falls', (select jsonb_agg(jsonb_build_object('at', 1800000000000 + g,
          'from', v_smax, 'to', v_smax - 18, 'hero', 9, 'pm', v_fmax - 1, 'monster', repeat('m', 64))) from generate_series(1, v_max) g))) then
    raise exception 'VERIFY(b): a good report was refused'; end if;
  foreach v_bad in array array[
      c_good || '{"falls": {}}', c_good || '{"falls": []}', c_good - 'deep', c_good || '{"deep": 1.5}', c_good || '{"deep": "606"}',
      c_good || jsonb_build_object('deep', v_smax + 1, 'falls', jsonb_build_array(c_good->'falls'->0)),
      c_good || '{"deep": 500}',                                                                          -- a fall starting past the deepest
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 9, "pm": 10, "monster": "rat"}]}',                 -- a fall that climbs
      c_good || jsonb_build_object('falls', jsonb_build_array(jsonb_build_object('at', 1, 'from', 6, 'to', 0, 'pm', v_fmax, 'monster', 'rat'))),
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 0, "pm": 10, "hero": 10, "monster": "rat"}]}',
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 0, "pm": 10, "hero": "1", "monster": "rat"}]}',
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 0, "pm": 10, "monster": "Rat"}]}',
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 0, "pm": 10}]}',
      c_good || '{"falls": [{"at": 1, "from": 6, "to": 0, "pm": 10, "monster": "rat", "name": "x"}]}',
      c_good || '{"falls": [{"at": -1, "from": 6, "to": 0, "pm": 10, "monster": "rat"}]}',
      c_good || '{"falls": [{"at": 1.5, "from": 6, "to": 0, "pm": 10, "monster": "rat"}]}',
      c_good || '{"falls": [5]}',
      -- THE LEDGER (19-power-ledger L7): a source that is no id, a seat of two digits, a count that is no whole number, a bucket past the
      -- scale, a bucket that is no pair, too many sources
      '{"heal": {"Mend": 5}}', '{"took": {"10": 5}}', '{"took": {"1": -5}}', '{"heal": {"mend": 1.5}}', '{"took": []}',
      jsonb_build_object('sup', jsonb_build_object((v_smax + 1)::text, jsonb_build_array(1, 1))), '{"sup": {"600": [1]}}',
      '{"sup": {"600": [1, "2"]}}', '{"sup": {"600": {"g": 1}}}', '{"sup": {"6x": [1, 1]}}',
      (select jsonb_build_object('heal', jsonb_object_agg('h' || g, 1)) from generate_series(1, 17) g)]::jsonb[] loop
    if public.hr_hunt_report_ok(v_bad) then raise exception 'VERIFY(b): a bad report passed: %', v_bad; end if;
  end loop;
  if not public.hr_hunt_report_ok('{"heal": {"mend": 40, "greater_mend": 30}, "took": {"0": 64, "1": 20}, "sup": {"600": [4180, 3600000], "610": [0, 5]}}'::jsonb) then
    raise exception 'VERIFY(b): a good ledger was refused'; end if;
  if public.hr_hunt_report_ok(jsonb_build_object('deep', 606, 'falls', (select jsonb_agg(c_good->'falls'->0 || jsonb_build_object('at', g)) from generate_series(1, v_max + 1) g))) then
    raise exception 'VERIFY(b): a report of % falls passed', v_max + 1; end if;

  -- (c) THE FOLD (src/core/hunt/report.js addReport): the deeper step; one fall an instant, the stored side's kept; oldest first; the last
  --     report_falls_max; nothing folded in answers the same report; a tier hunt's report gains no key; the widest fits its 32 KB CHECK
  v := public.hr_hunt_report_add(c_good, '{"deep": 610, "falls": [{"at": 1800000060000, "from": 1, "to": 0, "pm": 1, "monster": "slime"},
         {"at": 1800000030000, "from": 610, "to": 592, "hero": 0, "pm": 100, "monster": "slime"}]}'::jsonb);
  if (v->>'deep')::int <> 610 or jsonb_array_length(v->'falls') <> 3 or (v->'falls'->1->>'at')::bigint <> 1800000030000
     or v->'falls'->2->>'monster' <> 'unknown' or v->'falls'->0 <> c_good->'falls'->0 then
    raise exception 'VERIFY(c): the fold answered %', v; end if;
  -- THE LEDGER: counts added key by key, each bucket's gold and time added, a side without the keys moving nothing
  v := public.hr_hunt_report_add('{"heal": {"mend": 40}, "took": {"0": 64}, "sup": {"600": [100, 1000]}}'::jsonb,
                                 '{"heal": {"mend": 2, "shelter": 7}, "took": {"0": 1, "1": 20}, "sup": {"600": [5, 10], "610": [1, 2]}}'::jsonb);
  if v->'heal' <> '{"mend": 42, "shelter": 7}'::jsonb or v->'took' <> '{"0": 65, "1": 20}'::jsonb
     or v->'sup' <> '{"600": [105, 1010], "610": [1, 2]}'::jsonb then raise exception 'VERIFY(c): the ledger folded to %', v; end if;
  if public.hr_hunt_report_add(c_good, c_good) ?| array['heal', 'took', 'sup'] then raise exception 'VERIFY(c): a report with no ledger gained one'; end if;
  if public.hr_hunt_report_add(c_good, '{}'::jsonb) <> c_good or public.hr_hunt_report_add('{}'::jsonb, c_good) <> c_good then
    raise exception 'VERIFY(c): folding nothing moved the falls'; end if;
  v_x := '{"low": {"pm": 140, "by": "rat", "blow": "gnaw", "at": 1800000000000}, "close": 2}'::jsonb;
  if public.hr_hunt_report_add(v_x, v_x - 'low') ?| array['deep', 'falls'] then raise exception 'VERIFY(c): a tier hunt''s report gained a Danger key'; end if;
  v_x := '{}'::jsonb;
  for i in 1..3 loop
    v_x := public.hr_hunt_report_add(v_x, jsonb_build_object('deep', 606, 'falls', (select jsonb_agg(c_good->'falls'->0 || jsonb_build_object('at', i * 100 + g) order by g)
             from generate_series(1, v_max) g)));
  end loop;
  if jsonb_array_length(v_x->'falls') <> v_max or (v_x->'falls'->0->>'at')::int <> 301 or (v_x->'falls'->(v_max - 1)->>'at')::int <> 300 + v_max then
    raise exception 'VERIFY(c): the falls are not the last % oldest first: %', v_max, v_x->'falls'; end if;
  --     THE WORST REPORT THE FOLD CAN KEEP (1053's widest windows, each with the widest falls and depth the shape passes) fits its CHECK
  v_x := '{}'::jsonb;
  for i in 1..4 loop
    v_bad := (select jsonb_build_object(
      'low', jsonb_build_object('pm', 0, 'by', repeat('m', 64), 'blow', repeat('b', 64), 'at', 999999999999999), 'close', 999999999,
      'fired', jsonb_object_agg(lpad(i::text || g::text, 24, 'r'), 999999999),
      'waits', jsonb_object_agg(lpad(i::text || g::text, 24, 'w'), (select jsonb_object_agg(lpad(chr(96 + h), 16, 'y'), 999999999) from generate_series(1, 8) h)),
      'bar', (select jsonb_agg(jsonb_build_array(lpad(k2::text, 24, 'r'), repeat('u', 64), 999)) from generate_series(1, 16) k2),
      'gear', jsonb_build_object('w', 9999, 'a', 9999, 'n', 9999),
      'deep', v_smax,
      'falls', (select jsonb_agg(jsonb_build_object('at', 999999999999000 + i * 100 + f, 'from', v_smax, 'to', v_smax, 'hero', 9, 'pm', v_fmax - 1,
                 'monster', repeat('z', 64))) from generate_series(1, v_max) f),
      -- THE LEDGER at its widest (each window new sources and buckets: the fold keeps the first 16 and 32)
      'heal', (select jsonb_object_agg(lpad(i::text || h::text, 64, 'h'), 999999999999) from generate_series(1, 16) h),
      'took', (select jsonb_object_agg(st::text, 999999999999) from generate_series(0, 9) st),
      'sup', (select jsonb_object_agg((v_smax - i * 100 - b)::text, jsonb_build_array(999999999999, 999999999999)) from generate_series(1, 32) b))
      from generate_series(1, 32) g);
    if not public.hr_hunt_report_ok(v_bad) then raise exception 'VERIFY(c): the widest good window was refused'; end if;
    v_x := public.hr_hunt_report_add(v_x, v_bad || jsonb_build_object('dry',
             (select jsonb_object_agg(lpad(i::text || d::text, 64, 'd'), 999999999999999) from generate_series(1, 40) d)));
  end loop;
  if octet_length(v_x::text) > 32768 then raise exception 'VERIFY(c): the widest folded report is % bytes, past its 32 KB CHECK', octet_length(v_x::text); end if;
  raise notice '1057-danger-falls: the widest folded report is % bytes of its 32768', octet_length(v_x::text);

  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Falls') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, '1057-danger-falls §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = v_u and slot = 0;
    insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values (v_u, 0, c_ground, 0, 300)
      on conflict (user_id, slot, hunt_id) do update set danger_held = 300;
    -- (d) THE DEFAULT STANCE (the Coordinator's R2 add-on): a hero whose plan names no stance, sent no verb, enters a scale ground: the
    --     instance freezes the catalogue's default a margin under its held step, and hr_hunt_instance_read (what the tick, browser closed,
    --     and the viewed settle both read) hands the engine that stance and step; the `danger` section names it as playing
    if exists (select 1 from public.hero_plans where user_id = v_u and slot = 0 and risk is not null) then raise exception 'VERIFY(d): CONTROL: the probe''s plan names a stance'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || 'f0570001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): entering answered %', v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select risk from public.hunt_instances where id = v_iid) is distinct from v_def
       or (select danger from public.hunt_instances where id = v_iid) is distinct from 300 - (select start_margin from public.hr_danger_rules where id) then
      raise exception 'VERIFY(d): a plan with no stance froze % at % on %, not the default %', (select risk from public.hunt_instances where id = v_iid),
        (select danger from public.hunt_instances where id = v_iid), c_ground, v_def; end if;
    v := public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options';
    if v->>'risk' is distinct from v_def or (v->>'danger')::int is distinct from 300 - (select start_margin from public.hr_danger_rules where id) then
      raise exception 'VERIFY(d): both doors read options %, not the default stance', v; end if;
    if public.hr_state_of(v_u, 0)->'danger'->'playing'->>'from' is distinct from v_def then
      raise exception 'VERIFY(d): the section reads %', public.hr_state_of(v_u, 0)->'danger'; end if;
    -- (e) THE READERS: the stored falls reach the `hunt` section with the seat's character named (none for a fall with no seat); an open
    --     session has no end stance; once ended it does, in the view and the free analyzer's session block
    v_at := floor(extract(epoch from now()) * 1000)::bigint + 1000;
    update public.hunt_session_tally set report = jsonb_build_object('deep', 606, 'falls', jsonb_build_array(
        jsonb_build_object('at', v_at, 'from', 606, 'to', 588, 'hero', 0, 'pm', 230, 'monster', 'rat'),
        jsonb_build_object('at', v_at + 1, 'from', 588, 'to', 570, 'pm', 200, 'monster', 'unknown'))) where session_id = v_sid;
    v := public.hr_hunt_view(v_sid);
    if v->'tally'->'report'->'falls'->0->>'name' is distinct from public.hr_character_name(v_u, 0) or v->'tally'->'report'->'falls'->1 ? 'name'
       or (v->'tally'->'report'->>'deep')::int is distinct from 606 or (v->'tally'->'report'->'falls'->0->>'pm')::int is distinct from 230 then
      raise exception 'VERIFY(e): the hunt section''s falls read %', v->'tally'->'report'; end if;
    if v ? 'risk_end' or v ? 'danger_end' then raise exception 'VERIFY(e): an open session shows an end stance: %', v->'risk_end'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    v := public.hr_hunt_view(v_sid);
    if v->>'risk_end' is distinct from v_def or (v->>'danger_end')::int is distinct from 300 - (select start_margin from public.hr_danger_rules where id) then
      raise exception 'VERIFY(e): the ended session shows % at %', v->'risk_end', v->'danger_end'; end if;
    v := public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(v_u, 0, v_sid));
    if v->'session'->>'risk_end' is distinct from v_def or v->'session'->'danger_end' is null
       or v->'session'->'report'->'falls'->0->>'name' is distinct from public.hr_character_name(v_u, 0) then
      raise exception 'VERIFY(e): the free analyzer''s session block reads %', v->'session'; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (f) a ground off the scale freezes nothing for a plan with no stance (the tier path), and no end stance shows there
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_plain, '[]'::jsonb, 0, null, (k || 'f0570002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): entering the plain ground answered %', v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select risk from public.hunt_instances where id = v_iid) is not null
       or public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->'risk' is distinct from 'null'::jsonb then
      raise exception 'VERIFY(f): a ground off the scale froze %', (select risk from public.hunt_instances where id = v_iid); end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if public.hr_hunt_view(v_sid) ? 'risk_end' then raise exception 'VERIFY(f): a tier session shows an end stance'; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (g) a stance the plan names is frozen as named: the default never overrides a pick
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_risk_set(0, 'careful', (k || 'f0570003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(g): the pick answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || 'f0570004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(g): entering again answered %', v; end if;
    select h.instance_id into v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select risk from public.hunt_instances where id = v_iid) is distinct from 'careful' then
      raise exception 'VERIFY(g): a plan naming careful froze %', (select risk from public.hunt_instances where id = v_iid); end if;
    raise exception using errcode = 'HR157', message = '1057-danger-falls §7 complete - rolling back';
  exception when sqlstate 'HR157' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u)
     or exists (select 1 from public.hero_plans where user_id = v_u) then
    raise exception 'VERIFY(h): §7 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice '1057-danger-falls: the falls and the depth are shaped, folded and named by the server, an ended scale hunt shows its end stance, and a plan with no stance plays the default on a scale ground; all green';
end $$;
