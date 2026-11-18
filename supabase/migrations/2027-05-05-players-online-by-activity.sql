-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-05-players-online-by-activity.sql — "14 ONLINE" COUNTS EVERY HERO THAT PLAYS, WITH THE GAME OPEN OR CLOSED, AND SAYS WHAT
--   THEY ARE DOING (lane/c-online-afk, backend-architect, 2026-11-18; Tyler the same day: the counter "reads low" because it counts
--   only heroes open in a browser; "for the sake of transparency" it shows every hero still playing, and on hover what they do, never
--   "hunting" for a hero that mines, crafts or trains; cost rule "unless that is going to cause optimization issues": counted ONCE a
--   world tick into one cache row, and the poll only READS it).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (the apply tool, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §6. No value, rank or shared surface moves: a count of characters, no name or id of anyone. ON THE EA SECURITY LIST: it
-- splices the world tick's driver (one guarded call, before the kill switch).
-- EDGE: none. CLIENT: src/social/players-online.js + src/shell/widgets/online.js read `online_by` and ride the next release AFTER this
-- applies. Either half alone is safe: a tab on v0.2.137 reads `online` (now the total) and ignores `online_by`; a new tab on the old
-- server gets no `online_by`, takes the answer as no reading and shows "— online", never a number its lines do not add up to.
--
-- ── THE RULE (the one definition, hr_players_online_counts) ─────────────────────────────────────────────────────────
-- A CHARACTER IS COUNTED when it PLAYS ON THE SERVER (hr_playing's definition, 2027-01-19-play-cap.sql: an open hunt session, or
--   an activity pointer other than idle) OR it is OPEN IN A CLIENT (a character_presence stamp inside the 75 s online window, the
--   window hr_social_state and the old count used) and not set to appear offline (presence_quiet). EACH CHARACTER ONCE, by
--   construction: three DISJOINT arms in one statement's snapshot, (1) an open session (one a character: hunt_sessions_one_open; its
--   hero exists: hunt_sessions_char_fk), (2) a pointer other than idle with no open session, (3) a fresh stamp on an idle hero with no
--   open session. Each source is read once.
-- ITS ONE LINE, so the lines always add up to the total:
--   training  an open session on a training ground (hr_training_grounds: the yard or the house dummy; training is a hunt session)
--   tower     an open session whose instance plays the `tower` mode (hunt_instances.session_mode, frozen by the server at its start)
--   hunting   any other open session (or a `combat` pointer, which hr_playing counts too)
--   gathering the pointer `gather`
--   hearth    the pointer `artisan` on an Inner Flame recipe (hr_activities.req_skill = 'inner_flame': "Fuel the hearth", the errand
--             included, 2027-04-27-hearth-errand.sql's hr_hearth_errand reads the same column)
--   crafting  the pointer `artisan` on any other recipe
--   town      open in a client and none of the above; and a pointer this file does not name (none today: the CHECK allows idle,
--             gather, artisan and combat, §0 pins it) is counted here rather than dropped, so a new job is never missing from the total.
-- A hero set to appear offline is not counted while idle (as before), and IS counted on its activity while it plays: an appear-offline
--   hero then reads exactly like one whose player closed the game, which is what appearing offline means. No one is named either way.
--
-- ── THE COST RULE (Tyler 2026-11-18) ───────────────────────────────────────────────────────────────────────────────
-- THE TICK COUNTS, ONCE A FIRE. hr_tick_cron_run (pg_cron, every 10 s, ONE backend under the fire's advisory lock) calls
--   hr_players_online_refresh right after it holds the lock and before its kill switch (so a switched-off tick still counts), inside
--   its own exception block (a failed count raises a WARNING and the fire goes on: a counter never stops the world). The count reads
--   the presence stamps too (they are rows), so nothing is left on the poll path: the WHOLE breakdown, the "in town" line included,
--   is the tick's.
-- THE POLL READS ONE ROW. hr_players_online (still called by hr_social_poll as the definer) stamps the caller's own open heroes as
--   before, then reads hr_players_online_cache by its primary key: no count, no GROUP BY, no write, no row lock (the old verb took
--   the cache row's lock on every ask and recounted under it every 15 s, so concurrent polls queued behind a recount).
-- FRESHNESS: a row older than 60 s (six fires missed: pg_cron or the tick is down) is no answer: count_stale, and the poll answers
--   `online` and `online_by` null (the client shows "— online", never the last number).
-- MEASURED 2026-11-18 on the replayed chain (PGlite = PostgreSQL 18 in WASM, warm: its ms are not production's, its plans and
--   buffer counts are). 100x: 8,001 heroes, 82,001 sessions (2,001 open), 1,200 at a town job, 1,201 fresh stamps, 4,001 counted:
--   the count is ONE statement, 2,930 buffer hits, 20 ms (a union-then-join draft read hunt_sessions twice: 15,064, 41 ms); with
--   24,000 more dormant heroes it is 2,892 with player_state_playing and 3,616 (a seq scan that grows with every registered hero)
--   without it, so its cost follows PLAYING heroes, not registered ones. The poll's read: one primary-key probe, 2 buffers, 0.02 ms.
--   An idle fire (tools/commit-cost.mjs --idle, before -> after): 1.46 -> 3.43 ms, 262 -> 344 B WAL, 10 -> 17 blocks, +1 row
--   updated. tests/settle-budget.mjs: every call budget holds (the settle does not call the count).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────────────────────────────────────────────
-- hr_players_online_cache   +7 columns hunting, tower, gathering, crafting, training, hearth, town (int >= 0) and the CHECK n = their
--   sum (n is now the TOTAL). Still one row, RLS on, no client grant. Written only by hr_players_online_refresh.
-- player_state_playing      NEW partial index player_state (user_id, slot) WHERE active_kind <> 'idle': the working heroes only.
-- hr_players_online_counts(p_users uuid[] default null) -> jsonb  NEW, owner-only, stable. { n, hunting, tower, gathering, crafting,
--   training, hearth, town } for everyone (null) or for the named accounts only (the self-check's probes: the same statement, so §6
--   proves the tick's own rule on its own rows, untouched by any real player).
-- hr_players_online_refresh() -> void  NEW, owner-only. Writes the counts and at = now() into the one row.
-- hr_tick_cron_run()        SPLICED once (§3): the guarded call after the lock. Every other byte unchanged; §0 pins its pre-image.
-- hr_players_online(int[])  RESTATED WHOLE (2026-11-07-players-online.sql's image, §0 pins it): stamps as before, then answers
--   { ok, online: n, by: { hunting, tower, gathering, crafting, training, hearth, town } } from the row, or
--   { ok: false, error: count_stale }. Still no client grant (2027-02-20-players-online-revoke.sql).
-- hr_social_poll(int, int[]) RESTATED WHOLE (2027-02-17-social-poll.sql's image, §0 pins it): `online` (the total) and `online_by` (the
--   breakdown) from that answer, both null when it refuses. Same signature, grant, rate gate and baseline row (its note re-worded).
-- ERROR TAXONOMY: count_stale (NEW, inside the poll: never a client verb's answer; the poll maps it to null). Nothing else new.
--
-- ── CONCURRENCY AND IDEMPOTENCY ────────────────────────────────────────────────────────────────────────────────────
-- One writer: the tick, under its own advisory lock, so two refreshes never interleave; a poll reads the committed row (MVCC, no
-- lock). The count is a snapshot of one statement: a hero that starts or stops after it is in the next fire's count, 10 s later. No
-- intent, key or value: nothing to replay. The splice and every body are CREATE OR REPLACE with a marker: a second apply writes the
-- same bodies, skips the splice, and leaves the row as it is (the reset in §1 runs only with the CHECK's first creation).
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────────────────────────────────────────────
-- No new client verb, grant, policy, argument or delta key. A client can move a count only by really playing or being open, as before:
-- the stamp still writes the caller's OWN heroes only (auth.uid(), slots it holds). The answer carries counts only (§6(f): exactly
-- these keys). The two new functions are owner-only (no request role executes them, §6(a)). The tick's driver gains one call that
-- reads rows and writes one operational row; it cannot lease, post or pay.
--
-- ── ROWS AND BYTES (100x players) ──────────────────────────────────────────────────────────────────────────────────
-- No table and no row: 7 ints on the one cache row. One update of that row a fire (8,640 a day, 72 B of WAL each measured, ~0.6 MB
-- a day at ANY player count). The partial index holds one entry a WORKING hero (a few KB at 100x); a pointer write that stays
-- non-idle and moves no indexed column keeps its HOT update. Per poll: one primary-key read instead of a locked conditional
-- UPDATE (and a recount every 15 s). Nothing per settle, nothing journalled (a count is not a value transfer).
--
-- REVERSIBILITY: re-apply hr_players_online from 2026-11-07-players-online.sql (then the 2027-02-20 revoke) and hr_social_poll from
-- 2027-02-17-social-poll.sql; reverse §3's splice (r -> a); drop hr_players_online_refresh, hr_players_online_counts, the index and
-- the CHECK; the 7 columns are inert. No row of any character needs repair.
-- ORDER: after 2027-05-04-setup-swap-mid-hunt.sql (the last file). FREE against every staged file that does not restate
-- hr_players_online, hr_social_poll or hr_tick_cron_run. No begin/commit (CLAUDE.md §2).
-- After apply: live-hash-drift wants hr_players_online, hr_social_poll and hr_tick_cron_run re-measured and the two new bodies tracked
-- (Coordinator). restore-census: no table, no seeded row (the cache's note re-worded in this lane).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS: FAIL CLOSED IF ANOTHER FILE MOVED A RESTATED OR SPLICED BODY ─────────────────────
-- md5 of pg_get_functiondef with whitespace runs as one (tests/live-hash-drift.baseline.json's normalisation): each pre-image is the
-- value MEASURED ON PRODUCTION (2026-11-17, equal to the replay's), or this file's own (a second apply).
do $mig$
declare v_md5 text; r record; v_kinds text;
begin
  if to_regclass('public.character_presence') is null or to_regclass('public.hr_players_online_cache') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_instances') is null
     or to_regclass('public.hr_training_grounds') is null or to_regclass('public.hr_activities') is null
     or to_regclass('public.hunt_sessions_one_open') is null or to_regclass('public.character_presence_seen_at') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_instances' and column_name = 'session_mode')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'presence_quiet')
     or not exists (select 1 from public.hr_session_modes where mode_id = 'tower')
     or to_regprocedure('public.hr_playing(uuid,integer)') is null then
    raise exception 'PRECONDITION: the presence stamps, the open-session index, the session modes (tower), the training grounds or hr_playing are missing';
  end if;
  -- THE POINTER KINDS THE LINES NAME. A kind added later still counts (as town), but this file was written for exactly these.
  select pg_get_constraintdef(c.oid) into v_kinds from pg_constraint c
   where c.conrelid = 'public.player_state'::regclass and c.conname = 'player_state_active_kind_check';
  if v_kinds is distinct from 'CHECK ((active_kind = ANY (ARRAY[''idle''::text, ''gather''::text, ''artisan''::text, ''combat''::text])))' then
    raise exception 'PIN: player_state.active_kind allows %, not idle/gather/artisan/combat: name the new kind''s line in hr_players_online_counts', v_kinds;
  end if;
  -- THE ONE DEFINITION OF PLAYING this count extends (an open session, or a pointer other than idle).
  if position('active_kind <> ''idle''' in (select prosrc from pg_proc where oid = 'public.hr_playing(uuid,integer)'::regprocedure)) = 0
     or position('ended_at is null' in (select prosrc from pg_proc where oid = 'public.hr_playing(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'PIN: hr_playing no longer reads "a pointer other than idle, or an open session": re-derive the count''s population';
  end if;
  for r in select * from (values
    ('public.hr_players_online(integer[])', 'f9d636dfab258bef48a945f97e8992c7', '5965062ba22ed5a0f9a15c5f99483190', '2026-11-07-players-online.sql'),
    ('public.hr_social_poll(integer,integer[])', '2e2a0c71e61d4915a73d2c3a5b58d450', 'b56ec76a124b924756893a3cced0d8b9', '2027-02-17-social-poll.sql'),
    ('public.hr_tick_cron_run()', '49c044e97553339355aa5abe2cc1c2db', '9185f97c63d3324abe8e26f21e6ac487', '2027-04-08-idle-clock.sql')
  ) p(sig, pre, post, src) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(r.sig::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ROW AND THE INDEX ─────────────────────────────────────────────────
alter table public.hr_players_online_cache add column if not exists hunting   integer not null default 0 check (hunting >= 0);
alter table public.hr_players_online_cache add column if not exists tower     integer not null default 0 check (tower >= 0);
alter table public.hr_players_online_cache add column if not exists gathering integer not null default 0 check (gathering >= 0);
alter table public.hr_players_online_cache add column if not exists crafting  integer not null default 0 check (crafting >= 0);
alter table public.hr_players_online_cache add column if not exists training  integer not null default 0 check (training >= 0);
alter table public.hr_players_online_cache add column if not exists hearth    integer not null default 0 check (hearth >= 0);
alter table public.hr_players_online_cache add column if not exists town      integer not null default 0 check (town >= 0);
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_players_online_cache_sum' and conrelid = 'public.hr_players_online_cache'::regclass) then
    -- n counted heroes open in a client; from here it is the total. The old number is no answer (stale until the first fire).
    update public.hr_players_online_cache set n = 0, at = '-infinity' where id;
    alter table public.hr_players_online_cache add constraint hr_players_online_cache_sum
      check (n = hunting + tower + gathering + crafting + training + hearth + town);
  end if;
end $mig$;
comment on table public.hr_players_online_cache is
  '2026-11-07-players-online.sql; 2027-05-05-players-online-by-activity.sql: ONE row, the "N online" count and its breakdown by activity (n = the sum of the seven), written once a world tick fire by hr_players_online_refresh (hr_tick_cron_run) at `at`, read by hr_players_online (the social poll). Counts only, no name or id. Older than 60 s it is no answer.';

-- The working heroes only: the count's second source, by index (hr_tick_owed and hr_tick_enrol read player_state by kind too).
create index if not exists player_state_playing on public.player_state (user_id, slot) where active_kind <> 'idle';

-- ── §2 THE COUNT AND ITS REFRESH ─────────────────────────────────────────────
-- plpgsql, not LANGUAGE sql: a SQL body with a SET clause is never inlined and PostgreSQL 17 plans it again on every statement that
-- calls it (tests/settle-budget.mjs SB-3); plpgsql keeps its plans for the backend.
create or replace function public.hr_players_online_counts(p_users uuid[] default null)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  -- BY-ACTIVITY (2027-05-05-players-online-by-activity.sql): THE ONE RULE of who is counted and on which line (the file's header).
  c_online constant interval := interval '75 seconds';   -- open in a client: stamped within (hr_social_state's window)
  v jsonb;
begin
  select jsonb_build_object(
           'n',         count(*),
           'hunting',   count(*) filter (where x.k = 'hunting'),
           'tower',     count(*) filter (where x.k = 'tower'),
           'gathering', count(*) filter (where x.k = 'gathering'),
           'crafting',  count(*) filter (where x.k = 'crafting'),
           'training',  count(*) filter (where x.k = 'training'),
           'hearth',    count(*) filter (where x.k = 'hearth'),
           'town',      count(*) filter (where x.k = 'town'))
    into v
    -- THREE DISJOINT ARMS, each source read once, all in this statement's one snapshot: a character is in exactly one (an open
    -- session is one a character, hunt_sessions_one_open; a job excludes an open session; a stamp needs idle and no session).
    from (-- (1) AN OPEN SESSION: its ground says the line (the instance's mode, frozen by the server at its start)
          select case when t.hunt_id is not null then 'training'
                      when i.session_mode = 'tower' then 'tower'
                      else 'hunting' end as k
            from public.hunt_sessions h
            left join public.hunt_instances i on i.id = h.instance_id
            left join public.hr_training_grounds t on t.hunt_id = h.hunt_id
           where h.ended_at is null and (p_users is null or h.user_id = any (p_users))
          union all
          -- (2) A JOB: a pointer other than idle, no open session (a pointer this file does not name counts in town, never dropped)
          select case when ps.active_kind = 'combat' then 'hunting'
                      when ps.active_kind = 'gather' then 'gathering'
                      when ps.active_kind = 'artisan' and a.req_skill = 'inner_flame' then 'hearth'
                      when ps.active_kind = 'artisan' then 'crafting'
                      else 'town' end
            from public.player_state ps
            left join public.hr_activities a on a.kind = ps.active_kind and a.activity_id = ps.active_id
           where ps.active_kind <> 'idle' and (p_users is null or ps.user_id = any (p_users))
             and not exists (select 1 from public.hunt_sessions h2 where h2.user_id = ps.user_id and h2.slot = ps.slot and h2.ended_at is null)
          union all
          -- (3) OPEN IN A CLIENT: a stamp inside the window, idle, no open session, not appearing offline
          select 'town'
            from public.character_presence cp
            join public.player_state ps on ps.user_id = cp.user_id and ps.slot = cp.slot
           where cp.seen_at > now() - c_online and cp.seen_at <= now() + interval '60 seconds'
             and ps.active_kind = 'idle' and not ps.presence_quiet and (p_users is null or cp.user_id = any (p_users))
             and not exists (select 1 from public.hunt_sessions h3 where h3.user_id = cp.user_id and h3.slot = cp.slot and h3.ended_at is null)
         ) x(k);
  return v;
end $fn$;
revoke execute on function public.hr_players_online_counts(uuid[]) from public, anon, authenticated, service_role;

create or replace function public.hr_players_online_refresh()
returns void language plpgsql set search_path = public, pg_catalog as $fn$
declare v jsonb;
begin
  -- BY-ACTIVITY (2027-05-05-players-online-by-activity.sql): the world tick's one write of the count (hr_tick_cron_run, once a fire).
  v := public.hr_players_online_counts(null);
  update public.hr_players_online_cache c
     set n = (v->>'n')::int, hunting = (v->>'hunting')::int, tower = (v->>'tower')::int, gathering = (v->>'gathering')::int,
         crafting = (v->>'crafting')::int, training = (v->>'training')::int, hearth = (v->>'hearth')::int, town = (v->>'town')::int,
         at = now()
   where c.id;
end $fn$;
revoke execute on function public.hr_players_online_refresh() from public, anon, authenticated, service_role;

-- ── §3 hr_tick_cron_run: ONE ANCHORED EDIT (a is the pre-image, verbatim; r replaces it) ──────────────────────────────
do $mig$
declare
  c_sig constant text := 'public.hr_tick_cron_run()';
  v_def text; v_n int;
  a constant text := $a$    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
$a$;
  r constant text := $a$    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (1b) BY-ACTIVITY (2027-05-05-players-online-by-activity.sql): THE "N ONLINE" COUNT, ONCE A FIRE, under this fire's lock and
  --         before the kill switch (a switched-off tick still counts). Its own block: a count that fails is a WARNING, never a
  --         fire that stops. The social poll only reads the row it writes.
  begin
    perform public.hr_players_online_refresh();
  exception when others then
    raise warning 'hr_tick_cron_run: the players-online count failed (%): %', sqlstate, sqlerrm;
  end;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
$a$;
begin
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('BY-ACTIVITY' in v_def) > 0 then
    raise notice 'players-online-by-activity §3: hr_tick_cron_run already carries the edit - splice skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_n <> 1 then raise exception 'players-online-by-activity §3: hr_tick_cron_run anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, a, r);
end $mig$;
revoke execute on function public.hr_tick_cron_run() from public;

-- ── §4 THE POLL'S HALF: hr_players_online RESTATED WHOLE ──────────────────────
create or replace function public.hr_players_online(p_slots int[])
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PLAYERS-ONLINE (2026-11-07-players-online.sql); BY-ACTIVITY (2027-05-05-players-online-by-activity.sql): the count is the world
  -- tick's (hr_players_online_refresh, once a fire); this verb stamps the caller's open heroes and reads one row.
  c_floor  constant interval := interval '20 seconds';   -- one stamp per character per floor
  c_stale  constant interval := interval '60 seconds';   -- an older count is no answer (six fires missed: the tick is down)
  v_uid uuid := auth.uid();
  v_c   public.hr_players_online_cache%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slots is not null and (cardinality(p_slots) > 8 or exists (select 1 from unnest(p_slots) s where s is null or s < 0 or s > 32)) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'online', 6, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The caller's OWN characters only (a player_state row), never a slot it does not hold.
  if p_slots is not null and cardinality(p_slots) > 0 then
    insert into public.character_presence as cp (user_id, slot, seen_at)
      select ps.user_id, ps.slot, now() from public.player_state ps where ps.user_id = v_uid and ps.slot = any (p_slots)
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at
      where cp.seen_at < now() - c_floor or cp.seen_at > now() + interval '60 seconds';
  end if;
  -- ONE ROW, by its key: no count here, no lock, no write.
  select * into v_c from public.hr_players_online_cache c where c.id;
  if not found or v_c.at < now() - c_stale then return jsonb_build_object('ok', false, 'error', 'count_stale'); end if;
  return jsonb_build_object('ok', true, 'online', v_c.n,
    'by', jsonb_build_object('hunting', v_c.hunting, 'tower', v_c.tower, 'gathering', v_c.gathering, 'crafting', v_c.crafting,
                             'training', v_c.training, 'hearth', v_c.hearth, 'town', v_c.town));
end $$;
-- No client role asks it (2027-02-20-players-online-revoke.sql): hr_social_poll calls it as the definer.
revoke execute on function public.hr_players_online(int[]) from public;
revoke execute on function public.hr_players_online(int[]) from anon, authenticated, service_role;

-- ── §5 hr_social_poll RESTATED WHOLE, AND ITS BASELINE NOTE ───────────────────
create or replace function public.hr_social_poll(p_slot int, p_slots int[])
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_state jsonb; v_count jsonb;
begin
  -- SOCIAL-POLL (2027-02-17-social-poll.sql): both answers, one request; a refused read asks no count.
  -- BY-ACTIVITY (2027-05-05-players-online-by-activity.sql): `online` is the total, `online_by` its lines; both null with no fresh count.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:poll', 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_state := public.hr_social_state(p_slot);
  if v_state->>'ok' is distinct from 'true' then return v_state; end if;
  v_count := public.hr_players_online(p_slots);
  return v_state || jsonb_build_object('online', case when v_count->>'ok' = 'true' then v_count->'online' end,
                                       'online_by', case when v_count->>'ok' = 'true' then v_count->'by' end);
end $$;
revoke execute on function public.hr_social_poll(integer, integer[]) from public, anon, service_role;
grant  execute on function public.hr_social_poll(integer, integer[]) to authenticated;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_social_poll';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_social_poll', 'p_slot integer, p_slots integer[]', 'authenticated',
   'added 2027-02-17: hr_social_state and hr_players_online answered in one request (their rate limits, floors and access check unchanged); 2027-05-05: online is every character playing or open, online_by its lines by activity, both read from the one row the world tick writes; counts only; moves no value');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $chk$
declare
  c_u  constant uuid[] := array[
    '000000c0-0000-4000-a000-00000a5b00a1',   -- A: two heroes. 0 HUNTS (then its hunt ends), 1 CRAFTS with the game open
    '000000c0-0000-4000-a000-00000a5b00a2',   -- B: TRAINS at the yard, with the game open (counted once, on its line)
    '000000c0-0000-4000-a000-00000a5b00a3',   -- C: CLIMBS the Tower, game closed
    '000000c0-0000-4000-a000-00000a5b00a4',   -- D: GATHERS, game closed
    '000000c0-0000-4000-a000-00000a5b00a5',   -- E: FEEDS THE HEARTH, game closed
    '000000c0-0000-4000-a000-00000a5b00a6',   -- F: idle, game open: IN TOWN
    '000000c0-0000-4000-a000-00000a5b00a7',   -- G: idle, game open, appears offline: not counted
    '000000c0-0000-4000-a000-00000a5b00a8'    -- H: idle, last seen 2 minutes ago: not counted
  ]::uuid[];
  k    constant text := '000000c0-0000-4000-a000-0000';
  c_lines constant text[] := array['hunting', 'tower', 'gathering', 'crafting', 'training', 'hearth', 'town'];
  v jsonb; v_u uuid; i int; r text;
  v_hunt text; v_gather text; v_craft text; v_flame text; v_yard public.hr_training_grounds%rowtype; v_fee bigint;
  v_sid uuid; v_want jsonb; v_c public.hr_players_online_cache%rowtype; v_def text;
  v_hs bigint; v_hi bigint; v_cs bigint;
  v_tick boolean := (select c.enabled from public.hr_tick_config c where c.id);
  v_tower jsonb := (select jsonb_build_array(s.scope, s.accounts) from public.hr_feature_switches s where s.switch_id = 'burning_tower');
begin
  -- (a) THE SHAPE: the two new bodies are no request role's; the poll is the client's one door to the count; the tick calls the
  --     refresh exactly once, after its lock and before its kill switch, in its own exception block.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(r, 'public.hr_players_online_counts(uuid[])', 'execute')
       or has_function_privilege(r, 'public.hr_players_online_refresh()', 'execute')
       or has_function_privilege(r, 'public.hr_players_online(integer[])', 'execute')
       or has_function_privilege(r, 'public.hr_tick_cron_run()', 'execute') then
      raise exception 'by-activity §6(a): % can execute the count, its refresh, hr_players_online or the tick', r; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_social_poll(integer,integer[])', 'execute')
     or has_function_privilege('anon', 'public.hr_social_poll(integer,integer[])', 'execute') then
    raise exception 'by-activity §6(a): hr_social_poll''s grants are wrong'; end if;
  if has_table_privilege('authenticated', 'public.hr_players_online_cache', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.hr_players_online_cache', 'select,insert,update,delete') then
    raise exception 'by-activity §6(a): a client role reaches the cache row'; end if;
  v_def := replace(pg_get_functiondef('public.hr_tick_cron_run()'::regprocedure), chr(13), '');
  if (length(v_def) - length(replace(v_def, 'perform public.hr_players_online_refresh();', ''))) / length('perform public.hr_players_online_refresh();') <> 1
     or position('perform public.hr_players_online_refresh();' in v_def) < position('pg_try_advisory_xact_lock(hashtext(''hr_tick_cron_run''))' in v_def)
     or position('perform public.hr_players_online_refresh();' in v_def) > position('(2) THE KILL SWITCH' in v_def)
     or position('exception when others then' in substr(v_def, position('perform public.hr_players_online_refresh();' in v_def), 80)) = 0 then
    raise exception 'by-activity §6(a): hr_tick_cron_run does not call the refresh once, guarded, between its lock and its kill switch'; end if;
  if (select count(*) from public.hr_players_online_cache) <> 1 then raise exception 'by-activity §6(a): the cache is not one row'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'player_state_playing'
                  and indexdef like '%(user_id, slot)%WHERE (active_kind <> ''idle''::text)%') then
    raise exception 'by-activity §6(a): the working heroes'' index is missing or reads another predicate'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- THE PROBES: eight accounts, nine heroes, every one made by the game's own verbs.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     where not exists (select 1 from public.hr_training_grounds t where t.hunt_id = g.hunt_id)
       and not exists (select 1 from public.hr_ground_session_modes m where m.hunt_id = g.hunt_id and m.mode_id <> 'hunt')
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select a.activity_id into v_gather from public.hr_activities a where a.kind = 'gather' order by a.activity_id limit 1;
    select a.activity_id into v_craft from public.hr_activities a
     where a.kind = 'artisan' and a.req_skill is distinct from 'inner_flame' order by a.activity_id limit 1;
    select a.activity_id into v_flame from public.hr_activities a
     where a.kind = 'artisan' and a.req_skill = 'inner_flame' order by a.activity_id limit 1;
    select * into v_yard from public.hr_training_grounds where place = 'yard' order by ord, hunt_id limit 1;
    if v_hunt is null or v_gather is null or v_craft is null or v_flame is null or v_yard.hunt_id is null then
      raise exception 'by-activity §6-harness: a ground %, gather %, recipe %, Hearth fuel % or yard % is missing', v_hunt, v_gather, v_craft, v_flame, v_yard.hunt_id; end if;
    for i in 1 .. 8 loop
      v_u := c_u[i];
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Count ' || chr(64 + i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'players-online-by-activity §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'by-activity §6-harness: hr_create_character(0) refused for %: %', v_u, v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u;
    end loop;
    -- A's second hero, in the slot it buys (2027-03-25-hero-slots-one.sql: a new account owns slot 0 alone).
    update public.account_wallet set gold = 2000000 where user_id = c_u[1];
    perform set_config('request.jwt.claim.sub', c_u[1]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[1], 'role', 'authenticated')::text, true);
    v := public.hr_buy_hero_slot__ungated(1, 0, (k || 'a5b0e001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'by-activity §6-harness: A''s slot 1 refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'by-activity §6-harness: A''s second hero refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u[1] and slot = 1;
    -- A0 HUNTS (the enter every hunt takes).
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || 'a5b0e002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'by-activity §6-harness: entering % answered %', v_hunt, v; end if;
    v_sid := (v->>'session_id')::uuid;
    if v_sid is null then select h.id into v_sid from public.hunt_sessions h where h.user_id = c_u[1] and h.slot = 0 and h.ended_at is null; end if;
    -- A1 CRAFTS at a bench, and the game is open on it (the poll's own stamp).
    update public.player_state set active_kind = 'artisan', active_id = v_craft, active_left = null, active_since = now(), accrued_to = now()
     where user_id = c_u[1] and slot = 1;
    delete from public.hr_rate_counters where user_id = c_u[1];
    perform public.hr_players_online(array[1]);
    -- B TRAINS at the yard (its one door, at the rules' Level, the fee the server quotes), and the game is open on it.
    update public.account_wallet set gold = 1000000 where user_id = c_u[2];
    update public.player_state set level_xp = public.hr_char_xp_for_level((select max(tr.min_level) from public.hr_training_rules tr))
     where user_id = c_u[2] and slot = 0;
    perform set_config('request.jwt.claim.sub', c_u[2]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[2], 'role', 'authenticated')::text, true);
    v_fee := (public.hr_training_quote(c_u[2], 0, v_yard.skill, 'yard')->>'price')::bigint;
    delete from public.hr_rate_counters where user_id = c_u[2];
    v := public.hr_training_start(0, v_yard.skill, 'yard', v_fee, (k || 'a5b0e003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'by-activity §6-harness: the yard answered %', v; end if;
    delete from public.hr_rate_counters where user_id = c_u[2];
    perform public.hr_players_online(array[0]);
    -- C CLIMBS the Tower (its one door; the switch opened for the probe alone if it is not on for it).
    if not public.hr_feature_on('burning_tower', c_u[3]) then
      update public.hr_feature_switches set scope = 'accounts', accounts = array[c_u[3]] where switch_id = 'burning_tower'; end if;
    perform set_config('request.jwt.claim.sub', c_u[3]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[3], 'role', 'authenticated')::text, true);
    delete from public.hr_rate_counters where user_id = c_u[3];
    v := public.hr_tower_start(0, 0, (k || 'a5b0e004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'by-activity §6-harness: the Tower answered %', v; end if;
    -- D GATHERS, E FEEDS THE HEARTH (a run of three fuels: not an errand), both with the game closed.
    update public.player_state set active_kind = 'gather', active_id = v_gather, active_left = null, active_since = now(), accrued_to = now()
     where user_id = c_u[4] and slot = 0;
    update public.player_state set active_kind = 'artisan', active_id = v_flame, active_left = 3, active_since = now(), accrued_to = now()
     where user_id = c_u[5] and slot = 0;
    -- F, G and H are idle with the game open; G appears offline; H's stamp is two minutes old.
    for i in 6 .. 8 loop
      perform set_config('request.jwt.claim.sub', c_u[i]::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[i], 'role', 'authenticated')::text, true);
      delete from public.hr_rate_counters where user_id = c_u[i];
      perform public.hr_players_online(array[0]);
    end loop;
    update public.player_state set presence_quiet = true where user_id = c_u[7] and slot = 0;
    update public.character_presence set seen_at = now() - interval '2 minutes' where user_id = c_u[8];
    if (select count(*) from public.character_presence where user_id = any (c_u)) <> 5
       or not exists (select 1 from public.hunt_sessions h join public.hunt_instances hi on hi.id = h.instance_id
                       where h.user_id = c_u[3] and h.ended_at is null and hi.session_mode = 'tower')
       or not exists (select 1 from public.hunt_sessions h where h.user_id = c_u[2] and h.ended_at is null and h.hunt_id = v_yard.hunt_id) then
      raise exception 'by-activity §6-harness: the probes are not as planted (stamps %, Tower %, yard %)',
        (select count(*) from public.character_presence where user_id = any (c_u)),
        (select to_jsonb(h) from public.hunt_sessions h where h.user_id = c_u[3] and h.ended_at is null),
        (select to_jsonb(h) from public.hunt_sessions h where h.user_id = c_u[2] and h.ended_at is null); end if;

    -- (b) ★ EVERY LINE, EACH HERO ONCE: A0 hunting, A1 crafting (its account's other hero, the game open on it: once, on its job),
    --     B training (open: once), C on the Tower, D gathering, E at the Hearth, F in town; G (appears offline, idle) and H (gone
    --     two minutes) are nobody. The lines add up to the total.
    v_want := jsonb_build_object('n', 7, 'hunting', 1, 'tower', 1, 'gathering', 1, 'crafting', 1, 'training', 1, 'hearth', 1, 'town', 1);
    v := public.hr_players_online_counts(c_u);
    if v is distinct from v_want then raise exception 'by-activity §6(b): the probes count %, wanted %', v, v_want; end if;
    -- An appear-offline hero that PLAYS is counted on its line, as a hero whose game is closed is.
    update public.player_state set presence_quiet = true where user_id = c_u[2] and slot = 0;
    if public.hr_players_online_counts(c_u) is distinct from v_want then
      raise exception 'by-activity §6(b): an appear-offline hero training reads %', public.hr_players_online_counts(c_u); end if;
    update public.player_state set presence_quiet = false where user_id = c_u[2] and slot = 0;

    -- (c) ★ AN ENDED SESSION IS NOBODY: A0's hunt ends as every hunt ends (hr_hunt_close: the session closed, the hero home, idle,
    --     the game closed). Its session row stays, ended; it is not counted on any line, and A1 still is.
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    if not exists (select 1 from public.hunt_sessions where id = v_sid and ended_at is not null)
       or (select active_kind from public.player_state where user_id = c_u[1] and slot = 0) <> 'idle' then
      raise exception 'by-activity §6-harness: A0''s hunt did not end home and idle'; end if;
    v_want := v_want || jsonb_build_object('n', 6, 'hunting', 0);
    v := public.hr_players_online_counts(c_u);
    if v is distinct from v_want then raise exception 'by-activity §6(c): after an ended hunt the probes count %, wanted %', v, v_want; end if;

    -- (d) ★ THE TICK WRITES THE ROW. This fire's lock first (the tick's own key: a real fire meanwhile skips as `locked`), the tick
    --     switched off for this one rolled-back fire (so it leases and posts nothing), the row set to a sentinel; the real driver
    --     then counts before its kill switch. The row is now(), and every line holds at least the probes' (real players can only
    --     add), and n is their sum (the CHECK).
    for i in 1 .. 200 loop
      exit when pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run'));
      if i = 200 then raise exception 'by-activity §6-harness: the tick''s lock stayed held for 10 s'; end if;
      perform pg_sleep(0.05);
    end loop;
    update public.hr_tick_config set enabled = false where id;
    update public.hr_players_online_cache
       set n = 0, hunting = 0, tower = 0, gathering = 0, crafting = 0, training = 0, hearth = 0, town = 0, at = '-infinity' where id;
    v := public.hr_tick_cron_run();
    if v->>'outcome' is distinct from 'disabled' then raise exception 'by-activity §6-harness: the switched-off fire answered %', v; end if;
    select * into v_c from public.hr_players_online_cache where id;
    if v_c.at is distinct from now() then raise exception 'by-activity §6(d): a fire did not write the count (at %)', v_c.at; end if;
    if v_c.n < 6 or v_c.tower < 1 or v_c.gathering < 1 or v_c.crafting < 1 or v_c.training < 1 or v_c.hearth < 1 or v_c.town < 1
       or v_c.n <> v_c.hunting + v_c.tower + v_c.gathering + v_c.crafting + v_c.training + v_c.hearth + v_c.town then
      raise exception 'by-activity §6(d): the fire wrote % (every line at least the probes'', n their sum)', to_jsonb(v_c); end if;

    -- (e) ★ THE POLL READS THAT ROW, AND COUNTS NOTHING: F's poll answers the row's total and lines, and reads no hunt session or
    --     instance at all and scans no presence stamp (this transaction's own counters, pg_stat_xact_user_tables; player_state is
    --     not asserted: the caller's own row is read by key, and a tiny table may be read by a scan whatever the query). The
    --     CONTROL: the count itself reads hunt_sessions, so counters that never move cannot pass this.
    perform set_config('request.jwt.claim.sub', c_u[6]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[6], 'role', 'authenticated')::text, true);
    delete from public.hr_rate_counters where user_id = c_u[6];
    select coalesce(sum(coalesce(s.seq_scan, 0) + coalesce(s.idx_scan, 0)) filter (where s.relid = 'public.hunt_sessions'::regclass), 0),
           coalesce(sum(coalesce(s.seq_scan, 0) + coalesce(s.idx_scan, 0)) filter (where s.relid = 'public.hunt_instances'::regclass), 0),
           coalesce(sum(coalesce(s.seq_scan, 0)) filter (where s.relid = 'public.character_presence'::regclass), 0)
      into v_hs, v_hi, v_cs from pg_stat_xact_user_tables s;
    v := public.hr_social_poll(0, array[0]);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'online')::int is distinct from v_c.n
       or v->'online_by' is distinct from jsonb_build_object('hunting', v_c.hunting, 'tower', v_c.tower, 'gathering', v_c.gathering,
            'crafting', v_c.crafting, 'training', v_c.training, 'hearth', v_c.hearth, 'town', v_c.town) then
      raise exception 'by-activity §6(e): the poll answered % / %, the row reads %', v->'online', v->'online_by', to_jsonb(v_c); end if;
    if (select coalesce(sum(coalesce(s.seq_scan, 0) + coalesce(s.idx_scan, 0)), 0) from pg_stat_xact_user_tables s where s.relid = 'public.hunt_sessions'::regclass) <> v_hs
       or (select coalesce(sum(coalesce(s.seq_scan, 0) + coalesce(s.idx_scan, 0)), 0) from pg_stat_xact_user_tables s where s.relid = 'public.hunt_instances'::regclass) <> v_hi
       or (select coalesce(sum(coalesce(s.seq_scan, 0)), 0) from pg_stat_xact_user_tables s where s.relid = 'public.character_presence'::regclass) <> v_cs then
      raise exception 'by-activity §6(e): the poll read the hunts or scanned the presence stamps (it must read one row)'; end if;
    perform public.hr_players_online_counts(null);
    if (select coalesce(sum(coalesce(s.seq_scan, 0) + coalesce(s.idx_scan, 0)), 0) from pg_stat_xact_user_tables s where s.relid = 'public.hunt_sessions'::regclass) <= v_hs then
      raise exception 'by-activity §6(e)-control: this transaction''s scan counters do not move (the poll''s "no scan" would prove nothing)'; end if;

    -- (f) A COUNT ONLY, AND NO STALE NUMBER: the answer carries exactly ok, online and by; the lines are exactly the seven; a row
    --     older than 60 s answers count_stale, and the poll answers null for both (never the last number).
    delete from public.hr_rate_counters where user_id = c_u[6];
    v := public.hr_players_online(null);
    if (select array_agg(x order by x) from jsonb_object_keys(v) x) is distinct from array['by', 'ok', 'online']
       or (select array_agg(x order by x) from jsonb_object_keys(v->'by') x) is distinct from (select array_agg(x order by x) from unnest(c_lines) x) then
      raise exception 'by-activity §6(f): the answer carries more or less than the count and its lines: %', v; end if;
    update public.hr_players_online_cache set at = now() - interval '61 seconds' where id;
    if public.hr_players_online(null)->>'error' is distinct from 'count_stale' then
      raise exception 'by-activity §6(f): a count 61 s old was answered'; end if;
    v := public.hr_social_poll(0, array[0]);
    if coalesce(v->>'ok', '') <> 'true' or not (v ? 'online') or not (v ? 'online_by') or v->'online' <> 'null'::jsonb or v->'online_by' <> 'null'::jsonb then
      raise exception 'by-activity §6(f): the poll on a stale count answered % / %', v->'online', v->'online_by'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    if public.hr_social_poll(0, array[0])->>'error' is distinct from 'not_signed_in' then
      raise exception 'by-activity §6(f): a signed-out poll was answered'; end if;

    raise exception using errcode = 'HRA5B', message = 'players-online-by-activity §6 complete - rolling back';
  exception when sqlstate 'HRA5B' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = any (c_u)) or exists (select 1 from public.player_state where user_id = any (c_u))
     or exists (select 1 from public.character_presence where user_id = any (c_u))
     or exists (select 1 from public.hunt_sessions where user_id = any (c_u)) then
    raise exception 'by-activity §6: LEAKED a probe row'; end if;
  if (select c.enabled from public.hr_tick_config c where c.id) is distinct from v_tick
     or (select jsonb_build_array(s.scope, s.accounts) from public.hr_feature_switches s where s.switch_id = 'burning_tower') is distinct from v_tower then
    raise exception 'by-activity §6: LEAKED the tick''s switch or the Tower''s'; end if;
  raise notice 'players-online-by-activity: every hero that plays or is open counted once on one line (hunting, tower, gathering, crafting, training, hearth, town), an ended hunt and an idle appear-offline or gone hero not, the tick writes the row, the poll reads it and scans no player; all green';
end $chk$;
