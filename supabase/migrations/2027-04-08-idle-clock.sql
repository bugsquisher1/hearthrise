-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-08-idle-clock.sql — THE CLOCK ASKS FIRST WHETHER ANYTHING IS OWED (lane/r-commit-cost, reliability-engineer,
--   2026-11-11). Evidence: .claude/coordination/commit-cost-2026-11-11.md (tools/commit-cost.mjs --idle) and
--   .claude/coordination/hunt-path-baseline-2026-11-10.md Part 2 (pg_stat_statements on production).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (the apply tool, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §5. ON THE EA SECURITY LIST: hr_tick_cron_run is the world tick's driver (it leases, it never pays; the fence
-- and hr_hunt_apply_instance decide every payment, unchanged). EDGE: none. CLIENT: none.
-- ORDER: after 2027-02-21-tick-gateway-apikey.sql (hr_tick_cron_run's last restatement) and 2027-02-20-tick-fuse-load.sql
-- (hr_tick_enrol's); independent of every other staged file. Anchored edits, each matched exactly once.
--
-- THE FINDING (production, pg_stat_statements since 2026-10-31): the clock costs more than the players. hr_tick_cron_run
--   fires 8,640 times a day at 26.0 ms mean, hr_tick_enrol 1,440 times at 49.9 ms, hr_ops.alert_run 1,440 times at 94.2 ms:
--   about 433 s of database time a day with nobody online, against 265 s for every hunt commit together. Each pg_cron run
--   is a new backend (pg_cron's default: a connection a run), so a fire pays catalogue loads, plan and compile for every
--   statement it reaches: the cron log's own clock read 28 ms + 17 ms a rostered row (2026-10-08, hr_tick_roster's note),
--   where the same body warm in one backend takes 1.8 ms (tools/commit-cost.mjs --idle). The fixed cost is the statements a
--   fire reaches, and an idle fire reached all of them: the admission count, a roster a shard, a cursor upsert a shard, the
--   retired config cursor's rewrite, the hunt roster, the log.
--
-- THE CHANGE.
--   §1 hr_tick_owed(channels, flush_seconds): two booleans, each a SUPERSET of what a roster could take, each the EXISTS of
--      a row test (hr_tick_hero_owed, hr_tick_session_owed) so §5 can prove it on a probe row:
--        gather  an owned hero on an armed or shadow channel whose mark could be due (accrued_to null or at least one flush
--                old, the flush capped at 24 h): every hero hr_tick_roster could lease and every hero the admission counter
--                could count (a dropped hero is 24 h or 7 days behind, so it is in) is in this set
--        hunts   an open session not ahead of now with a pending leave or change, the hunt switch off, or a clock at least
--                one flush old: every session hr_hunt_roster_sharded could lease is in this set (its watched / fold
--                multiplier is >= 1 and its lease test only removes)
--      Both read only server rows (no input). A no can only mean the half would have found nothing.
--   §2 hr_tick_cron_run: the gather half (admission count, shard rosters, shard cursors) runs only when `gather` is yes; the
--      hunt half (the packing roster) only when `hunts` is yes; the retired config cursor is cleared only when one is set.
--      With a no, a shard cursor left mid-pass is cleared exactly as an empty roster cleared it, and a clear one is not
--      rewritten. Every outcome, log row, body, MAC and post is byte-identical where anything is owed, and the log row
--      ('empty', the same fields) where nothing is. The 10 s cadence and the 90 s flush are untouched (CLAUDE.md §6).
--   §3 hr_tick_enrol: when no hero is on any cohort's channel, the owned count (0) and the candidate insert (none) are not
--      run; the answer is the same rows, field for field.
-- hr_ops.alert_run is NOT changed: it is the watchdog that sees the tick go silent and the dead-man ping that sees the
--   database go away. A watchdog that sleeps when nothing looks open cannot see the clock die. Its cost on production is
--   Vault reads and system views (not measurable on the replay: no Vault there); the evidence file lists what to measure.
--
-- EXPLOIT SURFACE DELTA: three functions, owner-only (no request role executes them: §5(a)), stable, no argument from a
--   request (the cron passes its own config row; the row tests take a row). They read player_state, hr_tick_ownership,
--   hunt_sessions and hr_hunt_config and write nothing. The roster functions, the lease, the MAC, the fence and the settle are untouched.
-- CONCURRENCY: hr_tick_owed runs under the fire's advisory lock, as a plain read: a hero who becomes due after it reads is
--   served by the next fire, 10 s later, exactly as one who became due after the roster's read always was.
-- IDEMPOTENT: CREATE OR REPLACE of §1; §2/§3 carry a marker and skip their splice (byte-identical second apply).
-- REVERSIBILITY: reverse §2/§3's anchors (r[i] -> a[i]) and drop the three functions; no row or value is involved.
-- COST: an idle fire runs 8 statements instead of 18 (nested ones counted) and writes its log row only (it wrote 3 rows);
--   a fire with work runs the probe and its row tests on top of what it ran before.
--   No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_tick_cron_run()') is null or to_regprocedure('public.hr_tick_enrol(integer)') is null
     or to_regprocedure('public.hr_hunt_roster_sharded(text,integer,integer)') is null
     or to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)') is null then
    raise exception 'PRECONDITION: the world tick (hr_tick_cron_run, hr_tick_enrol, the two rosters) is missing'; end if;
end $mig$;

-- ── §1 hr_tick_owed AND ITS TWO ROW TESTS ────────────────────────────────────
-- IDLE-CLOCK (2027-04-08-idle-clock.sql): could either half of a tick fire find anything? Two supersets, never a narrower
-- test than the rosters'. Each half is one row test, so §5 can prove it on a probe row alone (a self-check may not move
-- another player's row to make the world empty: tests/selfcheck-no-global-dml.mjs). plpgsql, not LANGUAGE sql: a SQL body
-- with a SET clause or SECURITY DEFINER is never inlined and PostgreSQL 17 plans it again on every statement that calls it
-- (tests/settle-budget.mjs SB-3); plpgsql keeps its plans for the backend.
--   hr_tick_hero_owed     hr_tick_roster's due line (mark <= now() - flush, and mark >= accrued_to) and the admission
--                         counter's drop (24 h or 7 days behind) both imply accrued_to null or at least a flush old (the
--                         flush capped at 24 h; a NULL flush is the roster's 0)
--   hr_tick_session_owed  hr_hunt_roster_sharded's due set implies an open session not ahead of now with a pending leave or
--                         change, the hunt switch off, or a clock at least a flush old (its watched / fold multiplier is
--                         >= 1; a NULL flush is its 90 s); its lease test only removes
create or replace function public.hr_tick_hero_owed(p_accrued_to timestamptz, p_flush_seconds integer)
returns boolean
language plpgsql
stable
set search_path = public, pg_catalog
as $$
begin
  return p_accrued_to is null
      or p_accrued_to <= now() - least(make_interval(secs => greatest(coalesce(p_flush_seconds, 0), 0)), interval '24 hours');
end $$;
create or replace function public.hr_tick_session_owed(p_settled_to timestamptz, p_leave_at timestamptz, p_change_at timestamptz,
                                                       p_hunts_on boolean, p_flush_seconds integer)
returns boolean
language plpgsql
stable
set search_path = public, pg_catalog
as $$
begin
  return p_settled_to <= now()
     and (p_leave_at is not null or p_change_at is not null or not coalesce(p_hunts_on, false)
          or p_settled_to <= now() - coalesce(make_interval(secs => p_flush_seconds), interval '90 seconds'));
end $$;
create or replace function public.hr_tick_owed(p_channels text[], p_flush_seconds integer)
returns table (gather boolean, hunts boolean)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
#variable_conflict use_column
begin
  -- IDLE-CLOCK (2027-04-08-idle-clock.sql): the gather half over the heroes the tick owns on its channels, the hunt half over
  -- the open sessions (the partial index hunt_sessions_one_open), each through its row test above.
  gather := exists (select 1
                      from public.hr_tick_ownership o
                      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
                     where o.owned
                       and o.channel = ps.active_kind
                       and ps.active_kind = any (coalesce(p_channels, '{}'::text[]))
                       and public.hr_tick_hero_owed(ps.accrued_to, p_flush_seconds));
  hunts := exists (select 1
                     from public.hunt_sessions h
                    where h.ended_at is null
                      and public.hr_tick_session_owed(h.settled_to, h.leave_at, h.change_at,
                            (select c.enabled from public.hr_hunt_config c where c.id), p_flush_seconds));
  return next;
end $$;
revoke all on function public.hr_tick_owed(text[], integer) from public, anon, authenticated, service_role;
revoke all on function public.hr_tick_hero_owed(timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.hr_tick_session_owed(timestamptz, timestamptz, timestamptz, boolean, integer) from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_tick_owed(text[], integer) from hr_engine;
    revoke all on function public.hr_tick_hero_owed(timestamptz, integer) from hr_engine;
    revoke all on function public.hr_tick_session_owed(timestamptz, timestamptz, timestamptz, boolean, integer) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_tick_owed(text[], integer) from hr_tick;
    revoke all on function public.hr_tick_hero_owed(timestamptz, integer) from hr_tick;
    revoke all on function public.hr_tick_session_owed(timestamptz, timestamptz, timestamptz, boolean, integer) from hr_tick; end if;
end $mig$;

-- ── §2 hr_tick_cron_run: FIVE ANCHORED EDITS (a[i] is the pre-image, verbatim; r[i] replaces it) ──────────────────
--   1  two declarations          2  the probe, and the gather half opened under it
--   3  the gather half closed; the retired config cursor cleared only when set
--   4  the hunt half opened      5  the hunt half closed
do $mig$
declare
  c_sig constant text := 'public.hr_tick_cron_run()';
  v_def text; v_n int;
  a constant text[] := array[
$a$  v_nhb      int := 0;
begin
$a$,
$a$  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
$a$,
$a$    end if;
  end loop;

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now() where id;
$a$,
$a$  v_hprefix := left('cron:' || coalesce(current_database(), 'db'), 58);
  for v_hb in
$a$,
$a$                                 'hunts', v_hb.sel)::text);
  end loop;
$a$];
  r constant text[] := array[
$a$  v_nhb      int := 0;
  -- IDLE-CLOCK (2027-04-08-idle-clock.sql): could either half find anything this fire (hr_tick_owed)?
  v_owe_g    boolean;
  v_owe_h    boolean;
begin
$a$,
$a$  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2a) IDLE-CLOCK (2027-04-08-idle-clock.sql): WHAT COULD BE OWED, ASKED ONCE. hr_tick_owed answers two supersets
  --         (a hero either roster below or the admission counter could see; a session the hunt roster could lease). A
  --         half whose answer is no is skipped whole: its statements could only have found nothing. An idle fire runs the
  --         probe and the log row, nothing else.
  select o.gather, o.hunts into v_owe_g, v_owe_h from public.hr_tick_owed(v_cfg.channels, v_cfg.flush_seconds) o;
  if not coalesce(v_owe_g, true) then
    -- No roster: a cursor left mid-pass is cleared as an empty roster clears it below; a clear one is not rewritten.
    update public.hr_tick_shard_cursor set cursor_at = null, cursor_user = null, cursor_slot = null, updated_at = now()
     where cursor_at is not null or cursor_user is not null or cursor_slot is not null;
  else

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
$a$,
$a$    end if;
  end loop;
  end if;   -- IDLE-CLOCK: the gather half

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  -- IDLE-CLOCK: only when one is set (it was rewritten, unchanged, on every fire).
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now()
   where id and (cursor_at is not null or cursor_user is not null or cursor_slot is not null);
$a$,
$a$  v_hprefix := left('cron:' || coalesce(current_database(), 'db'), 58);
  -- IDLE-CLOCK: the packing roster only when a session could be due (hr_tick_owed above).
  if coalesce(v_owe_h, true) then
  for v_hb in
$a$,
$a$                                 'hunts', v_hb.sel)::text);
  end loop;
  end if;   -- IDLE-CLOCK: the hunt half
$a$];
begin
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('IDLE-CLOCK' in v_def) > 0 then
    raise notice 'idle-clock §2: hr_tick_cron_run already carries the edit - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'idle-clock §2: hr_tick_cron_run anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
end $mig$;

-- ── §3 hr_tick_enrol: FIVE ANCHORED EDITS ────────────────────────────────────
--   1  a declaration   2  the probe, before the cohort loop   3  the owned count not read (it is 0)
--   4/5  the candidate insert not run (there is no candidate)
-- The (a, r) pairs are kept for §5 in a temporary table: §5 rebuilds the pre-image from the landed body by putting a back.
create temporary table if not exists idle_enrol_pairs (i int, a text, r text) on commit drop;
do $mig$
declare
  c_sig constant text := 'public.hr_tick_enrol(integer)';
  v_def text; v_n int;
  a constant text[] := array[
$a$  v_state  text;
begin
$a$,
$a$  for v_c in select * from public.hr_tick_cohort order by channel for update loop
    v_n := 0;
$a$,
$a$    select count(*)::int into v_have
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
     where o.channel = v_c.channel and o.owned
       and ps.active_kind = o.channel
       and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit';
$a$,
$a$        v_state := 'open';
$a$,
$a$        get diagnostics v_n = row_count;
$a$];
  r constant text[] := array[
$a$  v_state  text;
  -- IDLE-CLOCK (2027-04-08-idle-clock.sql): no hero is on any cohort's channel this run
  v_idle   boolean;
begin
$a$,
$a$  -- IDLE-CLOCK (2027-04-08-idle-clock.sql): with no hero on any cohort's channel the owned count below is 0 and there is
  -- no candidate (both need ps.active_kind = the channel). The loop still runs and answers the same rows; it skips the reads.
  v_idle := not exists (select 1 from public.player_state ps
                         where ps.active_kind = any (array(select c.channel from public.hr_tick_cohort c)));
  for v_c in select * from public.hr_tick_cohort order by channel for update loop
    v_n := 0;
$a$,
$a$    if v_idle then
      v_have := 0;
    else
    select count(*)::int into v_have
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
     where o.channel = v_c.channel and o.owned
       and ps.active_kind = o.channel
       and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit';
    end if;
$a$,
$a$        v_state := 'open';
        if v_idle then
          v_n := 0;
        else
$a$,
$a$        get diagnostics v_n = row_count;
        end if;
$a$];
begin
  delete from idle_enrol_pairs;
  insert into idle_enrol_pairs select i, a[i], r[i] from generate_subscripts(a, 1) i;
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('IDLE-CLOCK' in v_def) > 0 then
    raise notice 'idle-clock §3: hr_tick_enrol already carries the edit - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'idle-clock §3: hr_tick_enrol anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
end $mig$;

-- ── §4 GRANTS (the two bodies keep theirs: no role executes either; hr_tick_owed the same, §1) ──────────────────
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_enrol(integer) from public;


-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- The cron driver itself is NOT fired here: on production it would post (2026-11-04-hunt-tick-shards.sql's rule).
-- tests/hunt-tick-shards.mjs IDLE fires it on the replay against the pg_net stub: an idle fire writes only its log row, a
-- session owed 90 s is leased and posted within one fire, one owed 60 s is not.
-- No row this block did not create is written (tests/selfcheck-no-global-dml.mjs): each half is proved on its row test.
--   (a) the bodies carry the edits; hr_tick_owed reads its two row tests; no request role executes any of the five
--   (b) hr_tick_enrol (the tick switched on) answers what its pre-image answers in the database as it stands (no hero on a
--       channel on a fresh replay: the skipped path; the read path where heroes are): each run in a rolled-back block
--   (c) the row tests, on the edges the rosters draw: a session 91 s behind is owed, 60 s is not, a pending leave or change
--       10 s behind is, the hunt switch off is, a clock ahead of now is not, a NULL flush is the roster's 90 s; a hero 91 s
--       behind is owed, 30 s is not, two days (the admission counter's fenced hero) is, no mark at all is, a NULL flush is
--       the roster's 0
--   (d) AGREEMENT WITH THE ROSTER the fire calls: a probe session 91 s behind is owed by its row test AND leased by
--       hr_hunt_roster_sharded (called as the cron calls it); at 60 s it is neither; hr_tick_owed answers yes while it is
--       owed (it cannot answer no while the roster would lease it: the row test is a superset)
do $$
declare
  c_u    constant uuid := '000000d7-0000-4000-a000-0000000c10c1';
  v      jsonb; v_g text; v_s public.hunt_sessions%rowtype; v_cfg public.hr_tick_config%rowtype;
  v_def  text; v_pre text; v_x record; v_a jsonb; v_b jsonb;
begin
  -- (a)
  v_def := replace(pg_get_functiondef('public.hr_tick_cron_run()'::regprocedure), chr(13), '');
  if position('from public.hr_tick_owed(v_cfg.channels, v_cfg.flush_seconds) o;' in v_def) = 0
     or position('if not coalesce(v_owe_g, true) then' in v_def) = 0 or position('if coalesce(v_owe_h, true) then' in v_def) = 0
     or position('end if;   -- IDLE-CLOCK: the gather half' in v_def) = 0 or position('end if;   -- IDLE-CLOCK: the hunt half' in v_def) = 0
     or position('   where id and (cursor_at is not null or cursor_user is not null or cursor_slot is not null);' in v_def) = 0 then
    raise exception 'idle-clock §5(a): hr_tick_cron_run does not carry the five edits'; end if;
  v_def := replace(pg_get_functiondef('public.hr_tick_enrol(integer)'::regprocedure), chr(13), '');
  if position('    if v_idle then' in v_def) = 0 or position('        if v_idle then' in v_def) = 0
     or position('v_idle := not exists' in v_def) = 0 then
    raise exception 'idle-clock §5(a): hr_tick_enrol does not carry the five edits'; end if;
  v_def := replace(pg_get_functiondef('public.hr_tick_owed(text[],integer)'::regprocedure), chr(13), '');
  if position('public.hr_tick_hero_owed(ps.accrued_to, p_flush_seconds)' in v_def) = 0
     or position('public.hr_tick_session_owed(h.settled_to, h.leave_at, h.change_at,' in v_def) = 0
     or position('where o.owned' in v_def) = 0 or position('and o.channel = ps.active_kind' in v_def) = 0
     or position('where h.ended_at is null' in v_def) = 0 then
    raise exception 'idle-clock §5(a): hr_tick_owed does not read its two row tests over the tick''s heroes and the open sessions'; end if;
  if exists (select 1 from pg_roles r cross join (values ('public.hr_tick_owed(text[],integer)'), ('public.hr_tick_cron_run()'),
                                                         ('public.hr_tick_enrol(integer)'), ('public.hr_tick_hero_owed(timestamp with time zone,integer)'),
                                                         ('public.hr_tick_session_owed(timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,integer)')) f(sig)
              where r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick')
                and has_function_privilege(r.rolname, f.sig, 'execute')) then
    raise exception 'idle-clock §5(a): a request role executes one of the tick''s owed tests or bodies'; end if;

  -- (b) first, before any probe row exists: a run the live enroller holds answers `locked` and is asked again
  v_pre := replace(pg_get_functiondef('public.hr_tick_enrol(integer)'::regprocedure), chr(13), '');
  for v_x in select * from idle_enrol_pairs order by i loop v_pre := replace(v_pre, v_x.r, v_x.a); end loop;
  if position('IDLE-CLOCK' in v_pre) > 0 or position('v_idle' in v_pre) > 0 then
    raise exception 'idle-clock §5-harness: the hr_tick_enrol pre-image did not come back clean'; end if;
  for i in 1 .. 25 loop
    begin
      execute v_pre;
      update public.hr_tick_config set enabled = true where id;
      v_a := public.hr_tick_enrol(200);
      raise exception 'idle-a' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;
    begin
      update public.hr_tick_config set enabled = true where id;
      v_b := public.hr_tick_enrol(200);
      raise exception 'idle-b' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;
    exit when v_a->>'outcome' is distinct from 'locked' and v_b->>'outcome' is distinct from 'locked';
    perform pg_sleep(0.2);
  end loop;
  if v_b->>'outcome' is distinct from 'ran' or v_a <> v_b then
    raise exception 'idle-clock §5(b): hr_tick_enrol answered % where its pre-image answers %', v_b, v_a; end if;
  if position('v_idle' in replace(pg_get_functiondef('public.hr_tick_enrol(integer)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'idle-clock §5-harness: the landed hr_tick_enrol did not come back after the pre-image run'; end if;

  -- (c) the row tests on the rosters' edges
  if not public.hr_tick_session_owed(now() - interval '91 seconds', null, null, true, 90)
     or public.hr_tick_session_owed(now() - interval '60 seconds', null, null, true, 90)
     or not public.hr_tick_session_owed(now() - interval '10 seconds', now(), null, true, 90)
     or not public.hr_tick_session_owed(now() - interval '10 seconds', null, now(), true, 90)
     or not public.hr_tick_session_owed(now() - interval '10 seconds', null, null, false, 90)
     or not public.hr_tick_session_owed(now() - interval '10 seconds', null, null, null, 90)
     or public.hr_tick_session_owed(now() + interval '1 second', now(), null, false, 90)
     or not public.hr_tick_session_owed(now() - interval '91 seconds', null, null, true, null)
     or public.hr_tick_session_owed(now() - interval '89 seconds', null, null, true, null) then
    raise exception 'idle-clock §5(c): hr_tick_session_owed draws a line the hunt roster does not'; end if;
  if not public.hr_tick_hero_owed(now() - interval '91 seconds', 90)
     or public.hr_tick_hero_owed(now() - interval '30 seconds', 90)
     or not public.hr_tick_hero_owed(now() - interval '2 days', 90)
     or not public.hr_tick_hero_owed(null, 90)
     or not public.hr_tick_hero_owed(now() - interval '2 days', 172800)
     or not public.hr_tick_hero_owed(now() - interval '1 second', null)
     or public.hr_tick_hero_owed(now() + interval '1 second', null) then
    raise exception 'idle-clock §5(c): hr_tick_hero_owed draws a line the gather roster or the admission counter does not'; end if;

  -- (d) agreement with the fire's own roster, on a probe session
  begin
    select * into v_cfg from public.hr_tick_config where id;
    update public.hr_tick_config set flush_seconds = 90, fold_windows = 1 where id;
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'idle-clock §5 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'idle-clock §5-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'idle-clock §5-harness: the enter answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    delete from public.character_presence where user_id = c_u;
    update public.hunt_sessions set entered_at = now() - interval '10 minutes', hunt_from = now() - interval '5 minutes',
                                   settled_to = now() - interval '91 seconds'
     where user_id = c_u and slot = 0 and ended_at is null;
    select * into v_s from public.hunt_sessions where user_id = c_u and slot = 0 and ended_at is null;
    if not public.hr_tick_session_owed(v_s.settled_to, v_s.leave_at, v_s.change_at, true, 90)
       or not (select o.hunts from public.hr_tick_owed(v_cfg.channels, 90) o) then
      raise exception 'idle-clock §5(d): a session 91 s behind is not owed'; end if;
    -- (two statements: a lease the roster writes is not visible to the statement that called it)
    if not exists (select 1 from public.hr_hunt_roster_sharded('selfcheck:idle', 4, 30000) r where r.session_id = v_s.id) then
      raise exception 'idle-clock §5(d): the roster did not offer the session the row test calls owed'; end if;
    if not exists (select 1 from public.hunt_tick_lease l where l.session_id = v_s.id and l.holder like 'selfcheck:idle:h%' and l.lease_until > now()) then
      raise exception 'idle-clock §5(d): the roster did not lease the session the row test calls owed'; end if;
    delete from public.hunt_tick_lease where session_id = v_s.id;
    update public.hunt_sessions set settled_to = now() - interval '60 seconds' where id = v_s.id;
    select * into v_s from public.hunt_sessions where id = v_s.id;
    if public.hr_tick_session_owed(v_s.settled_to, v_s.leave_at, v_s.change_at, true, 90)
       or exists (select 1 from public.hr_hunt_roster_sharded('selfcheck:idle', 4, 30000) r where r.session_id = v_s.id) then
      raise exception 'idle-clock §5(d): a session 60 s behind is owed or rostered'; end if;
    raise exception 'idle-clock §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'idle-clock §5: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) then raise exception 'idle-clock §5: LEAKED a probe row'; end if;
  drop table if exists idle_enrol_pairs;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'idle-clock: the row tests draw the rosters'' lines, the roster leases what they call owed, the cron asks them first, the enrol answers as before; all green';
end $$;
