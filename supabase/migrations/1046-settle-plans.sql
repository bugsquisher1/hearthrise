-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1046-settle-plans.sql — THE SETTLE'S PLANS READ EACH THING ONCE, AND AN ALARM ON THE SETTLE READ
--   (lane/c-settle-cost FB-4, reliability-engineer, 2026-11-21; docs/design/balance-program/48-platform-cost.md sections 8 and
--   10.5, build plan 13 section 2.6 FB-4 "the plan fixes" and "an alarm").
--
-- STATUS: supabase/migration-notes/1046-settle-plans.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHAT MOVES, AND WHY (MEASURED on the replay: tools/balance-program/platform-cost.mjs profile, a closed Krell four) ──────
-- (1) THE PARTY READ READS EACH MEMBER ONCE. hr_hunt_instance_read joined `lateral (select hr_hunt_member_read(h) as r0) m0`
--     and then referenced m0.r0 in `mr` and mr.r in the member object: PostgreSQL pulls a plain subquery up into its parent,
--     so the stable call was copied into every reference, 6 member reads a member (24 for a four). Inside, hr_hunt_member_read
--     did the same with `(select hr_hunt_setup_of(p_s) as v) st` and its 7 references (176 setup reads a four's settle, each
--     with its hunt-limit read: 172 of the settle's 431 hr_hunt_limit calls). `offset 0` is the planner's fence: the
--     subquery is evaluated once a row and its column is read, never re-derived. No result moves (the same call, once, in
--     the same snapshot). The bodies are SPLICED (one anchor a site, each matching once, §1), never restated, so the guards
--     that plant in their last restating file (tests/alpha-server.mjs READ_LAST, tests/target-kind-db.mjs LEVER_FILE) still
--     plant in the body that runs.
-- (2) THE CURVES ARE READ BY XP. hr_skill_level's combat branch and hr_level_from_xp asked `max(level) where xp <= x`: the
--     planner answers a max() from the Level key, walking it down from the top until xp <= x (REAL: hr_skill_curve_pkey
--     3.03 billion tuples, hr_xp_table_pkey 0.85 billion; the replay read 11,902 hr_skill_curve rows a four's settle). Now
--     `order by xp desc, level desc limit 1` on an index of (xp, level): one probe. It equals max(level) wherever xp does not
--     fall as the Level rises, which §4(b) proves on the curves as they stand (exhaustively, at every breakpoint and either
--     side of it) and §0 requires.
-- (3) THE SETTLE READ HAS AN ALARM (48 section 10.5: it rose from 19 to 185 ms and nothing told us). The capacity sample
--     (1002-ops-capacity-sample.sql) keeps the settle read's mean beside db_pct each minute: pg_stat_statements' calls and
--     time of every statement that calls hr_hunt_instance_read, as a delta since the previous sample. Over
--     settle_read_alarm_ms (40) for alarm_after (10 minutes) it files one critical episode (capacity-settle-read) through
--     hr_ops.alert_note, as a wall does, and clears itself. Null (no read in the minute, no extension) never fires.
--
-- NOT IN THIS FILE, and why: the hunt limits' remaining reads (about 259 a four's settle after (1)) are in hr_hunt_apply_member
--   and the vitals helpers, one each a member, read at plan-cached cost; moving them is a restatement of the apply that eleven
--   guards plant in (tests/alpha-server.mjs MEMBER_LAST). The journal's day reads shrink with the hourly journal (1047), which
--   is where "the journal by user and day" is fixed.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Each splice runs once: a second apply finds the post text and the post pin (§0) and splices nothing. `create index if not
--   exists`, `add column if not exists`, `create or replace` of the sampler: a second apply is byte-identical (schema-drift).
--   The index builds take a SHARE lock on two catalogue tables of 99 and 476 rows that only curve files write: milliseconds.
-- EXPLOIT SURFACE: none. No verb, grant or write path moves; the reads return what they returned. The alarm is operator-only.
-- COST: the settle's read and its apply get cheaper (MEASURED in the lane's report); the sampler adds one aggregate over
--   pg_stat_statements a minute (bounded by pg_stat_statements.max, as its db wall already is).
-- EDGE: none (hunt-settle.js's `materialized` read is the edge half of read once, in the same release). CLIENT: none.
-- REVERSIBLE: re-apply the pre-image bodies (pinned in §0: 1005-lever-horizon.sql's member read, 1025-own-heroes-apart.sql's
--   instance read, the plan-cache file's curves, 1002's sampler); drop the two indexes and the three new sample columns.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_skill_curve') is null or to_regclass('public.hr_xp_table') is null
     or to_regclass('hr_ops.capacity_samples') is null or to_regclass('hr_ops.capacity_config') is null
     or to_regprocedure('hr_ops.alert_note(text,boolean,interval,text,jsonb)') is null then
    raise exception 'PRECONDITION: a curve, the capacity sampler (1002) or the alert note is missing'; end if;
  -- the curves' order is the rule (2) rests on: xp never falls as the Level rises
  if exists (select 1 from (select xp, lag(xp) over (order by level) as prev from public.hr_skill_curve) a where xp < prev)
     or exists (select 1 from (select xp, lag(xp) over (order by level) as prev from public.hr_xp_table) a where xp < prev) then
    raise exception 'PRECONDITION: a curve''s xp falls as its Level rises; max(level) is not the last row by xp'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_member_read(public.hunt_sessions)', '5cb3d1b94655838354f94555fa81544d', '037ffba44e5d14d04af6abb053656d72'),
    ('public.hr_hunt_instance_read(uuid,integer)', '0b3c4e82711f295c68f040eb5b684bcf', '43c031340d414ede76522755f7060233'),
    ('public.hr_skill_level(text,bigint)', '052678f95f2e9c16005a5dd91e17435b', '45e3f51dbe83604aa92709d82f8e03e9'),
    ('public.hr_level_from_xp(bigint)', 'db9d93abfe7598cc1e079ee9754c482b', '645545c0f4c6b966c1e970ab75abf704'),
    ('hr_ops.capacity_sample(text,interval)', 'f8d9d4bf048544713b342d7732edc47a', 'a3d64ccabd14150741c619af824d2cf2')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- A RETRY AFTER 1053-lever-gates.sql (staged after this file) finds the instance read at 1053's image: this file's fences
    -- already in it, plus 1053's hold seat read. The splices below then find their post text and move nothing. After
    -- 1056-danger-scale.sql, at 1056's: the same, plus the frozen stance in the overlay. After 1062-store-step.sql, the member read
    -- at 1062's image (restated whole with this file's fence in it, its store priced at the buyer's step). After
    -- 1069-skill-time-parity.generated.sql, hr_skill_level at 1069's image (restated with this file's splice (4) text in it, verbatim,
    -- and an Inner Flame branch on its own curve's index). After 1071-trait-pieces.sql, the instance read at 1071's image (restated
    -- whole with this file's fences in it, plus the worn pieces). After 1076-personal-loot.sql, at 1076's (restated whole again: 1074's
    -- flame and the instance's frozen loot rule added). After 1077-worn-imbues.sql, at 1077's (each member's worn imbuements added).
    -- After 1077-tick-dials.sql, the capacity sample at 1077's image (restated
    -- whole: its tick wall read in heroes); this file restates it whole again below and 1077 restates it again after.
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_instance_read(uuid,integer)' and v_md5 in ('558e8c46c20b0d06bd770fa67c2ec6f9', '4bea2795d54d2a680390d46b8d7c0f0b', '293bfcbd1027c4665941a29de791ba6e', '251299cf2e9abba9e5071de2fe8308d9', '3d6b400342a45792fd331fb61566c862', 'f90bff161e33d7db33ac8ff585156ede'))
       and not (v_r.fn = 'public.hr_hunt_member_read(public.hunt_sessions)' and v_md5 = '8cf75f1bce69a3273f3490e52650354c')
       and not (v_r.fn = 'public.hr_skill_level(text,bigint)' and v_md5 = 'e01730edbac721c3eb5ea4c3f32a7514')
       and not (v_r.fn = 'hr_ops.capacity_sample(text,interval)' and v_md5 = 'b0dc4820391387c415c8ca77ba74718e') then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE PARTY READ AND THE CURVES, ONE ANCHORED SPLICE A SITE ────────────
-- Each anchor and its replacement are dollar-quoted, so the line a body holds after the splice is written here verbatim.
create index if not exists hr_skill_curve_xp_level_idx on public.hr_skill_curve (xp, level);
create index if not exists hr_xp_table_xp_level_idx on public.hr_xp_table (xp, level);

do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    (1, 'public.hr_hunt_member_read(public.hunt_sessions)',
     $a$    from (select public.hr_hunt_setup_of(p_s) as v) st$a$,
     $b$    from (select public.hr_hunt_setup_of(p_s) as v offset 0) st$b$),
    (2, 'public.hr_hunt_instance_read(uuid,integer)',
     $a$cross join lateral (select public.hr_hunt_member_read(h) as r0) m0$a$,
     $b$cross join lateral (select public.hr_hunt_member_read(h) as r0 offset 0) m0$b$),
    (3, 'public.hr_hunt_instance_read(uuid,integer)',
     $a$'{}'::jsonb)) as r) mr$a$,
     $b$'{}'::jsonb)) as r offset 0) mr$b$),
    (4, 'public.hr_skill_level(text,bigint)',
     $a$coalesce((select max(c.level) from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0))), 1)$a$,
     $b$coalesce((select c.level from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0)) order by c.xp desc, c.level desc limit 1), 1)$b$),
    (5, 'public.hr_level_from_xp(bigint)',
     $a$(select max(level) from public.hr_xp_table$a$,
     $b$(select level from public.hr_xp_table$b$),
    (6, 'public.hr_level_from_xp(bigint)',
     $a$where xp <= greatest(0, coalesce(p_xp, 0))), 1)$a$,
     $b$where xp <= greatest(0, coalesce(p_xp, 0)) order by xp desc, level desc limit 1), 1)$b$)) t(n, fn, find, repl)
    order by n loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the body already holds the replacement and the old text is gone
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;
    if v_n <> 1 then raise exception 'SPLICE %: % holds its anchor % times, want 1', v_r.n, v_r.fn, v_n; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §2 THE SETTLE READ'S ALARM ───────────────────────────────────────────────
alter table hr_ops.capacity_config add column if not exists settle_read_alarm_ms numeric not null default 40
  check (settle_read_alarm_ms > 0);
alter table hr_ops.capacity_samples add column if not exists settle_read_ms numeric;
alter table hr_ops.capacity_samples add column if not exists settle_read_calls bigint;           -- cumulative: the next sample's delta
alter table hr_ops.capacity_samples add column if not exists settle_read_total double precision; -- cumulative ms: the next sample's delta

/* One episode while the settle read's mean is over its line (hr_ops.alert_note files it, the relay posts it, a clear acks it).
   Pure in its inputs, so §4 judges it on planted numbers. Answers whether it fires. */
create or replace function hr_ops.settle_read_alarm(p_ms numeric, p_prefix text default 'capacity-', p_after interval default null)
returns boolean language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare c hr_ops.capacity_config%rowtype; v_on boolean;
begin
  select * into c from hr_ops.capacity_config where id;
  v_on := p_ms is not null and p_ms > c.settle_read_alarm_ms;
  perform hr_ops.alert_note(coalesce(p_prefix, 'capacity-') || 'settle-read', v_on, coalesce(p_after, c.alarm_after),
    format('Capacity: the hunt settle read averages %s ms (alarm over %s ms for %s): a plan regressed or the party read is '
           'evaluated more than once a settle (48-platform-cost.md section 8); profile it before it costs the busy hour.',
           p_ms, c.settle_read_alarm_ms, coalesce(p_after, c.alarm_after)),
    jsonb_build_object('wall', 'settle_read', 'ms', p_ms, 'alarm_ms', c.settle_read_alarm_ms));
  return v_on;
end $fn$;

-- THE SAMPLE (1002's body, restated whole; the settle read's lines are marked SETTLE-READ).
create or replace function hr_ops.capacity_sample(p_prefix text default 'capacity-', p_after interval default null)
returns jsonb language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c hr_ops.capacity_config%rowtype;
  v_prev hr_ops.capacity_samples%rowtype;
  v_stmt double precision; v_ins bigint; v_secs numeric;
  v_cadence numeric; v_flush numeric; v_body int; v_bodies int; v_cap bigint;
  v_open int := 0; v_worst numeric;
  v_edge_bodies int := 0; v_edge_max numeric; v_edge_def int := 0; v_edge_err text;
  v_db_ms double precision; v_rows_day numeric;
  v_rd_calls bigint; v_rd_total double precision; v_rd_ms numeric;   -- SETTLE-READ
  v_obs jsonb; v_walls jsonb; v_firing text[];
begin
  select * into c from hr_ops.capacity_config where id;
  select * into v_prev from hr_ops.capacity_samples order by at desc, id desc limit 1;
  v_secs := extract(epoch from now() - v_prev.at);

  -- db: the extension may be absent (a replay) or unreadable; either is null, never a failed sample.
  if to_regclass('extensions.pg_stat_statements') is not null then
    begin execute 'select sum(total_exec_time) from extensions.pg_stat_statements' into v_stmt;
    exception when others then v_stmt := null; end;
    -- SETTLE-READ: every statement that calls the party read (hunt-settle.js HUNT_READ_SQL, either spelling), cumulative.
    begin execute 'select sum(calls)::bigint, sum(total_exec_time) from extensions.pg_stat_statements
                    where query like ''%hr_hunt_instance_read(%''' into v_rd_calls, v_rd_total;
    exception when others then v_rd_calls := null; v_rd_total := null; end;
  end if;
  -- A delta needs a previous sample between 30 s and 15 min old, and no stats reset between (a negative delta).
  if v_stmt is not null and v_prev.stmt_ms_total is not null and v_secs between 30 and 900 and v_stmt >= v_prev.stmt_ms_total then
    v_db_ms := v_stmt - v_prev.stmt_ms_total;
  end if;
  -- SETTLE-READ: the mean of the reads made since the previous sample; none made (or a reset) is null, never 0.
  if v_rd_calls is not null and v_prev.settle_read_calls is not null and v_secs between 30 and 900
     and v_rd_calls > v_prev.settle_read_calls and v_rd_total >= v_prev.settle_read_total then
    v_rd_ms := round(((v_rd_total - v_prev.settle_read_total) / (v_rd_calls - v_prev.settle_read_calls))::numeric, 1);
  end if;

  -- ledger: cumulative inserts on the journal and any partition of it; no scan of the table.
  select sum(s.n_tup_ins)::bigint into v_ins from pg_stat_user_tables s
   where s.relid = 'public.player_ledger'::regclass
      or s.relid in (select i.inhrelid from pg_inherits i where i.inhparent = 'public.player_ledger'::regclass);
  if v_ins is not null and v_prev.ledger_ins_total is not null and v_secs between 30 and 900 and v_ins >= v_prev.ledger_ins_total then
    v_rows_day := round((v_ins - v_prev.ledger_ins_total) * 86400 / v_secs);
  end if;

  -- tick: what the roster can lease in one settle window, and what is open.
  select coalesce(t.cadence_seconds, 10), coalesce(t.flush_seconds, 90), coalesce(t.hunt_body_max, 1), coalesce(t.hunt_bodies_max, 1)
    into v_cadence, v_flush, v_body, v_bodies from public.hr_tick_config t where t.id;
  v_cap := floor((coalesce(v_flush, 90) + coalesce(v_cadence, 10)) / greatest(coalesce(v_cadence, 10), 1))::bigint
           * coalesce(v_bodies, 1) * coalesce(v_body, 1);
  -- From the OPEN sessions (the partial index hunt_sessions_one_open holds exactly them), never a scan of every instance ever.
  select count(distinct s.instance_id)::int, max(extract(epoch from now() - i.settled_to)) into v_open, v_worst
    from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
   where s.ended_at is null;

  -- edge: the tick answers pg_net holds from the last minute (an unreadable answer is skipped, never a failed sample).
  if to_regclass('net._http_response') is not null then
    begin
      execute $q$
        select count(*)::int, max(e.ms), coalesce(sum(e.def), 0)::int
          from (select case when (b#>>'{hunts,engine_ms}') ~ '^[0-9]{1,9}$' then (b#>>'{hunts,engine_ms}')::numeric end as ms,
                       case when (b#>>'{hunts,deferred}') ~ '^[0-9]{1,9}$' then (b#>>'{hunts,deferred}')::int else 0 end as def
                  from (select r.content::jsonb as b from net._http_response r
                         where r.created > now() - interval '1 minute' and length(r.content) < 65536
                           and r.content like '{%' and r.content like '%"op":"tick"%') x
                 where b ? 'hunts') e $q$
        into v_edge_bodies, v_edge_max, v_edge_def;
    exception when others then v_edge_err := sqlstate; v_edge_bodies := null;   -- unreadable: null, never a false 0%
    end;
  end if;

  v_obs := jsonb_build_object(
    'db_exec_ms', v_db_ms, 'db_secs', case when v_db_ms is not null then v_secs end, 'db_cores', c.db_cores,
    'tick_open', v_open, 'tick_capacity', v_cap,
    'edge_bodies', v_edge_bodies, 'edge_max_ms', v_edge_max, 'edge_budget_ms', c.edge_budget_ms,
    'ledger_rows_day', v_rows_day, 'ledger_prune_rows_day', c.ledger_prune_rows_day);
  v_walls := hr_ops.capacity_walls(v_obs);

  insert into hr_ops.capacity_samples (db_pct, tick_pct, edge_pct, ledger_pct, stmt_ms_total, ledger_ins_total,
                                       settle_read_ms, settle_read_calls, settle_read_total, detail)
  values ((v_walls->>'db')::numeric, (v_walls->>'tick')::numeric, (v_walls->>'edge')::numeric, (v_walls->>'ledger')::numeric,
          v_stmt, v_ins, v_rd_ms, v_rd_calls, v_rd_total,
          v_obs || jsonb_build_object('tick_worst_lag_s', round(v_worst), 'edge_deferred', v_edge_def,
                                      'edge_error', v_edge_err, 'active_backends',
                                      (select count(*) from pg_stat_activity where state = 'active' and backend_type = 'client backend')));

  v_firing := hr_ops.capacity_alarm(v_walls, p_prefix, p_after);
  if hr_ops.settle_read_alarm(v_rd_ms, p_prefix, p_after) then v_firing := v_firing || 'settle_read'::text; end if;   -- SETTLE-READ

  -- RETENTION, in the same file as the table (bounded a run).
  delete from hr_ops.capacity_samples d
   where d.id in (select o.id from hr_ops.capacity_samples o where o.at < now() - c.keep order by o.id limit 5000);

  return v_walls || jsonb_build_object('settle_read_ms', v_rd_ms, 'firing', to_jsonb(v_firing));
end $fn$;

do $mig$
declare r text;
begin
  foreach r in array array['hr_ops.settle_read_alarm(numeric,text,interval)', 'hr_ops.capacity_sample(text,interval)'] loop
    execute format('revoke execute on function %s from public', r);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated, service_role', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      execute format('revoke execute on function %s from hr_engine', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then
      execute format('revoke execute on function %s from hr_tick', r); end if;
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe row is this block's own and is removed ──
-- (a) every splice holds its post text once and its anchor nowhere
-- (b) the curves: the new lookups answer exactly what max(level) answers at every breakpoint, either side of it, and at
--     0, a negative, null and a huge xp; and each reads its (xp, level) index (sequential scans off: the replay has no statistics)
-- (c) the alarm on planted numbers: 41 ms files one critical episode, a second minute adds no row, 39 ms clears it, null never fires
-- (d) a real sample lands with its three settle-read columns written (null until a read is counted twice) and operator-only grants
do $chk$
declare
  v_fn text; v_def text; v_x bigint; v_old int; v_new int; v_plan text; v_r record; v_ref text; v_n0 bigint;
begin
  foreach v_fn in array array['public.hr_hunt_member_read(public.hunt_sessions)', 'public.hr_hunt_instance_read(uuid,integer)'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if (length(v_def) - length(replace(v_def, ' offset 0) ', ''))) / length(' offset 0) ')
       <> (case when v_fn like '%member_read%' then 1 else 2 end) then
      raise exception 'settle-plans §4(a): % does not hold its offset-0 fences', v_fn; end if;
  end loop;
  if strpos(pg_get_functiondef('public.hr_skill_level(text,bigint)'::regprocedure), 'max(c.level)') > 0
     or strpos(pg_get_functiondef('public.hr_level_from_xp(bigint)'::regprocedure), 'max(level)') > 0 then
    raise exception 'settle-plans §4(a): a curve still answers max(level)'; end if;

  for v_x in select x from (select c.xp + d as x from public.hr_skill_curve c, (values (-1), (0), (1)) t(d)
                            union select c.xp + d from public.hr_xp_table c, (values (-1), (0), (1)) t(d)
                            union select v from (values (0::bigint), (-5::bigint), (9000000000000000000::bigint)) z(v)) a loop
    v_old := coalesce((select max(c.level) from public.hr_skill_curve c where c.xp <= greatest(0, v_x)), 1);
    v_new := public.hr_skill_level('melee', v_x);
    if v_new is distinct from v_old then raise exception 'settle-plans §4(b): hr_skill_level(melee, %) = %, max(level) = %', v_x, v_new, v_old; end if;
    v_old := coalesce((select max(level) from public.hr_xp_table where xp <= greatest(0, v_x)), 1);
    v_new := public.hr_level_from_xp(v_x);
    if v_new is distinct from v_old then raise exception 'settle-plans §4(b): hr_level_from_xp(%) = %, max(level) = %', v_x, v_new, v_old; end if;
  end loop;
  if public.hr_level_from_xp(null) is distinct from 1 or public.hr_skill_level('melee', null) is distinct from 1 then
    raise exception 'settle-plans §4(b): a null xp is not Level 1'; end if;
  begin
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_bitmapscan', 'off', true);
    for v_r in select * from (values
      ('public.hr_skill_curve', 'hr_skill_curve_xp_level_idx', 'select c.level from public.hr_skill_curve c where c.xp <= 123456 order by c.xp desc, c.level desc limit 1'),
      ('public.hr_xp_table', 'hr_xp_table_xp_level_idx', 'select level from public.hr_xp_table where xp <= 123456 order by xp desc, level desc limit 1')) t(tbl, idx, q) loop
      v_plan := '';
      for v_def in execute 'explain ' || v_r.q loop v_plan := v_plan || v_def || ' / '; end loop;
      if strpos(v_plan, v_r.idx) = 0 or v_plan ~ 'Sort' then
        raise exception 'settle-plans §4(b): % is not read by %: %', v_r.tbl, v_r.idx, v_plan; end if;
    end loop;
    raise exception using errcode = 'HRSP1', message = 'plans read - rolling back';
  exception when sqlstate 'HRSP1' then null;
  end;

  if hr_ops.settle_read_alarm(41, 'capacity-selfcheck-', interval '0 seconds') is not true then
    raise exception 'settle-plans §4(c): a 41 ms read did not fire'; end if;
  select a.ref into v_ref from public.maintenance_alerts a
   where a.ref like 'watch:capacity-selfcheck-settle-read:%' and a.severity = 'critical' and a.acked_at is null;
  if v_ref is null then raise exception 'settle-plans §4(c): a read over 40 ms filed no critical alarm'; end if;
  perform hr_ops.settle_read_alarm(55, 'capacity-selfcheck-', interval '0 seconds');
  if (select count(*) from public.maintenance_alerts a where a.ref like 'watch:capacity-selfcheck-settle-read:%') <> 1 then
    raise exception 'settle-plans §4(c): a sustained slow read filed a second row in one episode'; end if;
  if hr_ops.settle_read_alarm(39, 'capacity-selfcheck-', interval '0 seconds') then
    raise exception 'settle-plans §4(c): a 39 ms read fired'; end if;
  if exists (select 1 from public.maintenance_alerts a where a.ref = v_ref and a.acked_at is null)
     or not exists (select 1 from public.maintenance_alerts a where a.ref like 'watch-clear:capacity-selfcheck-settle-read:%') then
    raise exception 'settle-plans §4(c): a 39 ms read did not clear the episode'; end if;
  if hr_ops.settle_read_alarm(null, 'capacity-selfcheck-', interval '0 seconds') then
    raise exception 'settle-plans §4(c): no read counted (null) fired'; end if;
  delete from public.maintenance_alerts a where a.ref like 'watch:capacity-selfcheck-%' or a.ref like 'watch-clear:capacity-selfcheck-%';
  delete from hr_ops.watch_state w where w.code like 'capacity-selfcheck-%';

  select count(*) into v_n0 from hr_ops.capacity_samples;
  perform hr_ops.capacity_sample();
  if (select count(*) from hr_ops.capacity_samples) <> v_n0 + 1 then raise exception 'settle-plans §4(d): a sample did not land'; end if;
  for v_r in select x.role from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) x(role)
             where exists (select 1 from pg_roles where rolname = x.role) loop
    if has_function_privilege(v_r.role, 'hr_ops.settle_read_alarm(numeric,text,interval)', 'execute')
       or has_function_privilege(v_r.role, 'hr_ops.capacity_sample(text,interval)', 'execute') then
      raise exception 'settle-plans §4(d): % may run the sampler or its alarm', v_r.role; end if;
  end loop;
  if exists (select 1 from hr_ops.watch_state where code like 'capacity-selfcheck-%')
     or exists (select 1 from public.maintenance_alerts where ref like '%capacity-selfcheck-%') then
    raise exception 'settle-plans §4(d): the self-check left a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'settle-plans: the party read once a member, the curves by xp, the settle read''s alarm at 40 ms; all green';
end $chk$;
