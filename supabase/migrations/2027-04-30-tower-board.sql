-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-30-tower-board.sql — THE BURNING TOWER'S BOARD: EVERY HERO'S BEST FLOOR RANKED, KEPT AS IT RISES, READ BY THE WINDOW
--   (lane/c-tower-board, backend-architect, 2026-11-16; Tyler 2026-11-14 "a leaderboard", the board's "2026-11-14 The Burning Tower";
--   HANDOFFS 2026-11-16 systems-engineer (lane/b-tower-window, direction A): the window draws a rank and the heroes just above and below only
--   when the `tower` section sends `field`, and the end card's "Rank" and "Passed" need the board's place before the climb).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §6. ON THE EA SECURITY LIST: a RANKED surface (another hero's name and best floor cross to every player who climbs near it).
-- ORDER: after 2027-04-28-tower-section.sql (§0 pins its hr_tower_section), last in the chain. EDGE: none (the engine reads nothing here). CLIENT: the
-- Tower window (src/session/tower-sections.js fieldOf / lastOf, src/shell/windows/tower.js, src/shell/tower-words.js climbEnd) reads it; with
-- the switch off nothing of it is sent.
--
-- ── WHY A TABLE, NOT A `tower` ARM OF leaderboard_ranked ───────────────────────
-- The handoff proposed an arm of the 5-minute matview. Measured against what the window needs, it falls short three ways: (1) the end card is
-- read the moment a climb ends, and a matview up to 5 minutes old says the rank before it ("Rank +0", nobody passed); (2) "ties by who got
-- there first" needs the instant a floor was reached, which the matview's rows do not carry (its strict order is score, user_id, slot); (3)
-- restating the matview drops and recreates the object every board reads (2027-02-27-gold-given.sql's form) for one mode's rows. So the
-- board is its own table, written in the SAME transaction as the record it ranks, and read by bounded index scans.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_mode_board (mode_id, user_id, slot) NEW: score (the best floor), reached_at (when it was first reached: tower_progress.best_at, the
--   settle window's end), updated_at. ONE ROW PER HERO PER MODE: keyed by session mode so the Unmarked Catacombs' descent keeps its own board
--   with no new table (its progress feeds its mode's rows the way tower_progress feeds the Tower's). THE ORDER (one index):
--   score desc, reached_at asc (who got there first), then user_id, slot (a stable order for two who reached it in one settle window).
--   Written ONLY by the rise trigger below (and this file's backfill); raise-only. Server-only: RLS on, no policy, no client grant.
-- hr_mode_board_last (mode_id, user_id, slot) NEW: the hero's LAST climb's place on the board: session_id, from_score/from_at (its record when
--   the climb started), rank (its place when the climb ended; null past the board's depth), passed (how many heroes it passed), passed_user/
--   passed_slot (the best-placed of them: server-only, never projected; its NAME is, read at the time). One row per hero per mode, overwritten
--   by each new climb. Server-only: RLS on, no policy, no client grant.
-- THE TRIGGERS (owner-only):
--   hr_tower_board_rise AFTER INSERT / AFTER UPDATE OF best_floor ON tower_progress, WHEN the best floor rises: ONE upsert of the hero's own
--     board row (score, reached_at). A settle that clears no new best moves nothing (the WHEN is false; no function call).
--   hr_tower_board_run_start AFTER INSERT ON tower_runs: the hero's last-climb row reset to this session with its record now (from_*).
--   hr_tower_board_run_end AFTER UPDATE OF ended_at ON tower_runs (null -> a time): rank, passed and the best of those passed, once a climb.
-- THE READS (owner-only, plpgsql):
--   hr_mode_board_depth() -> 1000          the deepest place a read counts to (THE BOUND, below)
--   hr_mode_board_rank(mode, score, at)    1 + the heroes strictly ahead (a higher score, or the same reached earlier; two who reached it in the
--                                          same instant share a place); null past the depth. Heroes on hr_lb_hidden are not counted.
--   hr_mode_board_field(mode, user, slot)  { rank | over, above [{ name, floor, at, outfit }], below [...] } or null (the hero has no row):
--                                          the 2 heroes just above and the 2 just below in the board's order, top-down, never a hidden hero
--                                          and never a seat of the hero's own open party (they are the section's `party` already).
--                                          rank: the exact place; over: the depth, when more than that many heroes are ahead.
--   hr_mode_board_end(mode, user, slot, session)  { rank | over, passed, name } for that session's climb once it ended, else null.
--   hr_mode_board_hero (one rival's row), hr_mode_board_place ({ rank } or { over }), hr_tower_board_mode (the Tower's mode id, from its
--                                          ground's catalogue row: never a literal).
-- hr_tower_section RESTATED WHOLE (2027-04-28-tower-section.sql's image, §0 pins it). TOWER-BOARD marks two additions, nothing else moves:
--   `field` (hr_mode_board_field for the Tower's mode; ABSENT, not null, for a hero with no board row: the window draws no rank, as before),
--   and `last.board` (hr_mode_board_end for the last climb; null when none).
-- NAMES: hr_character_name (the hero's own validated name, the one the party, the town and chat show); a hidden hero (hr_lb_hidden: test, GM,
--   banned, a name under review) never appears and is never counted. No account id, slot or uuid leaves the server (§6 asserts it).
-- A HIDDEN VIEWER (the play-gate QA account, a walled GM) still sees its own field: the place it would hold and the heroes around it. Nobody
--   else ever sees it (it is not counted, not a neighbour, never "passed").
--
-- ── THE BOUND (why the depth, and what a hero past it sees) ───────────────────
-- The section is read on every settle of every hero (hr_state_of). An exact rank is a count of the heroes ahead; unbounded, that is the
-- per-settle count over every hero the brief rules out. Every read here is an index range on hr_mode_board_order cut by LIMIT: the rank
-- counts at most hr_mode_board_depth() index entries, the neighbours read 2 + 2 (plus the few hidden or party rows they step over). Past the
-- depth the hero reads `over: 1000` ("#1,000+"), the genre's usual "1000+". At 1,000 entries the count is an index-only range of a ~40-byte
-- key: tens of microseconds. The depth is one function, so the number is one place.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- The board row a rise writes is the hero's OWN, inside the settle that writes its record, under the character lock that settle already holds
-- (hr_hunt_apply_member -> hr_tower_write): no shared counter, no hot row, no new lock, so two heroes' settles never wait on each other here.
-- A replayed settle returns before hr_tower_write (hr_apply's replay), so it writes nothing. Readers take no lock (MVCC). The run triggers
-- write the hero's own last-climb row, in the transaction that opens or ends its run (hr_tower_start under the hero's Tower door lock and its
-- character lock; the session's end under the instance and character locks). A party start inserts one run a seat, each seat its own row.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new verb, no client grant, no client value: the score is tower_progress.best_floor (re-proved floor by floor by hr_tower_check), the time
-- is the settle's, the name the server's. NEW CROSSING: another hero's name, best floor and the DATE it was reached (a day, not an instant:
-- the instant would show when someone plays) reach a hero who climbs near it. A hero cannot place itself (no write path but the settle's), cannot
-- read the board rows (no grant), and learns nothing that identifies an account. Risk named for Security: the rival names are not re-run
-- through hr_name_blocked per read (1.4 ms a name on PGlite, four names a settle, every hero): they are names hr_validate_display_name passed
-- at creation or rename, the same the party, the town and chat show; a name the grown blocklist catches is taken off this board (and every
-- board) by its hr_lb_hidden 'name' row.
--
-- ── COST (rows and bytes at 100x players) ───────────────────────────────────
-- hr_mode_board: one row per hero who ever cleared a Tower floor, ~90 bytes + ~60 in its two indexes. 100x (2,000 accounts, up to 4 heroes):
-- at most 8,000 rows, about 1.2 MB. hr_mode_board_last: one row per hero who ever climbed, ~150 bytes: about 1.2 MB. Writes: one row update per
-- settle in which a hero's best rose (a record climb: about one a settle while it climbs past its best; none while it re-climbs below it), and
-- one row write at a climb's start and one at its end. Reads per section: one primary-key read, the bounded rank count, two LIMIT 2 index
-- ranges, at most four names and outfits (primary keys), and for the last climb one primary-key read and one name. No ledger row (law 6: a
-- place is derived, not a value moved); no per-floor or per-kill row.
--
-- REVERSIBILITY: re-apply 2027-04-28-tower-section.sql §1 (its hr_tower_section and section row), drop the four triggers (two on
-- tower_progress, two on tower_runs), the ten functions and the two tables. Nothing a player holds moves: the board is derived from tower_progress and rebuilds from it (§3's backfill).
-- IDEMPOTENT: a second apply finds the tables and indexes, restates every body byte-identical (§0 accepts its own post-image), re-creates the
-- triggers, the backfill moves nothing (raise-only), and §6 rolls back its probes.
-- WIPE: both tables join 2027-02-25-character-wipe.sql's c_wipe.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.tower_progress') is null or to_regclass('public.tower_runs') is null or to_regclass('public.hr_tower_rules') is null
     or to_regprocedure('public.hr_tower_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql and 2027-04-28-tower-section.sql first (the climb''s record, its runs, the section)'; end if;
  if to_regclass('public.hr_session_modes') is null or to_regclass('public.hr_ground_session_modes') is null
     or not exists (select 1 from public.hr_tower_rules r join public.hr_ground_session_modes g on g.hunt_id = r.hunt_id) then
    raise exception 'PRECONDITION: the Tower''s ground has no session mode (2027-04-24-tower-climb-session-modes-catalogue.generated.sql)'; end if;
  if to_regclass('public.hr_lb_hidden') is null or to_regclass('public.player_state') is null or to_regclass('public.player_outfits') is null
     or to_regclass('public.hunt_party_members') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: the boards'' hidden list, the hero, its outfit, its party and its name helpers first'; end if;
  -- hr_tower_section: 2027-04-28-tower-section.sql's image, or this file's own (a second apply)
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_tower_section(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '5688ec287138b5888567c5848e7c65c0' and v_md5 is distinct from 'fe24bd5fba49169a4caa474555285d9f' then
    raise exception 'PIN: hr_tower_section is neither 2027-04-28-tower-section.sql''s image (5688ec28) nor this file''s own (fe24bd5f): md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE BOARD AND THE LAST CLIMB'S PLACE (server-only: RLS on, no policy, no client grant) ──────────────
create table if not exists public.hr_mode_board (
  mode_id    text        not null check (mode_id ~ '^[a-z][a-z0-9_]{0,31}$'),
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  score      int         not null check (score >= 1),
  reached_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (mode_id, user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
-- THE ORDER: score desc (as -score asc), who reached it first, then a stable hero order. Every read is a range of it.
create index if not exists hr_mode_board_order on public.hr_mode_board (mode_id, (-score), reached_at, user_id, slot);
create index if not exists hr_mode_board_hero on public.hr_mode_board (user_id, slot);

create table if not exists public.hr_mode_board_last (
  mode_id     text        not null check (mode_id ~ '^[a-z][a-z0-9_]{0,31}$'),
  user_id     uuid        not null,
  slot        int         not null check (slot between 0 and 5),
  session_id  uuid        not null,
  from_score  int         not null default 0 check (from_score >= 0),
  from_at     timestamptz,
  rank        int         check (rank >= 1),
  passed      int         check (passed >= 0),
  passed_user uuid,
  passed_slot int         check (passed_slot between 0 and 5),
  ended_at    timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (mode_id, user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  constraint hr_mode_board_last_from check ((from_score = 0) = (from_at is null)),
  constraint hr_mode_board_last_passed check ((passed_user is null) = (passed_slot is null) and (passed_user is null or passed >= 1))
);
create index if not exists hr_mode_board_last_hero on public.hr_mode_board_last (user_id, slot);

do $mig$
declare t text; r text;
begin
  foreach t in array array['hr_mode_board', 'hr_mode_board_last'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public', t);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on table public.%I from %I', t, r); end if;
    end loop;
  end loop;
end $mig$;
comment on table public.hr_mode_board is
  '2027-04-30-tower-board.sql: one row per hero per session mode with a board (the Burning Tower; the Unmarked Catacombs'' descent later): its best score and when it was first reached. Written only by the rise trigger on the mode''s progress table, in the settle that writes the record; raise-only. Read only by hr_mode_board_rank / _field / _end. Server-only.';
comment on table public.hr_mode_board_last is
  '2027-04-30-tower-board.sql: each hero''s LAST climb''s place on its mode''s board: its record when the climb started, its rank when it ended, how many heroes it passed and the best of them. Written only by the run triggers. Server-only (passed_user never leaves the server).';

-- ── §2 THE READS (owner-only, plpgsql: the settle reads the section, and a sql function is re-planned every call, tests/settle-budget.mjs SB-3) ─
create or replace function public.hr_mode_board_depth()
returns int language plpgsql immutable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql): the deepest place a read counts to (the header's THE BOUND)
  return 1000;
end $fn$;

-- 1 + the heroes strictly ahead of (p_score, p_at) on p_mode's board (a higher score, or the same one reached earlier), hidden heroes not
-- counted; null when the depth is reached (more than depth - 1 ahead).
create or replace function public.hr_mode_board_rank(p_mode text, p_score int, p_at timestamptz)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_depth int := public.hr_mode_board_depth(); v_n int;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  select count(*) into v_n from (
    select 1 from public.hr_mode_board b
     where b.mode_id = p_mode and ((-b.score), b.reached_at) < ((-p_score), p_at)
       and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
     limit v_depth) t;
  return case when v_n >= v_depth then null else v_n + 1 end;
end $fn$;

-- One hero as another sees it on the board: the name the server shows, its score, the DAY it reached it, its worn outfit.
create or replace function public.hr_mode_board_hero(p_user uuid, p_slot int, p_score int, p_at timestamptz)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  return jsonb_build_object('name', public.hr_character_name(p_user, p_slot), 'floor', p_score,
    'at', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD'),
    'outfit', (select po.outfit_id from public.player_outfits po where po.user_id = p_user and po.slot = p_slot));
end $fn$;

-- The place word: { rank } or, past the depth, { over: depth }.
create or replace function public.hr_mode_board_place(p_rank int)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  return case when p_rank is null then jsonb_build_object('over', public.hr_mode_board_depth()) else jsonb_build_object('rank', p_rank) end;
end $fn$;

-- THE FIELD: the hero's place and the two heroes just above and below it, top-down; never a hidden hero, never a seat of its own open party.
create or replace function public.hr_mode_board_field(p_mode text, p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare me public.hr_mode_board%rowtype; v_party uuid; v_above jsonb; v_below jsonb;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  select * into me from public.hr_mode_board b where b.mode_id = p_mode and b.user_id = p_user and b.slot = p_slot;
  if not found then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  select coalesce(jsonb_agg(public.hr_mode_board_hero(t.user_id, t.slot, t.score, t.reached_at)
                            order by (-t.score), t.reached_at, t.user_id, t.slot), '[]'::jsonb) into v_above
    from (select b.user_id, b.slot, b.score, b.reached_at from public.hr_mode_board b
           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) < ((-me.score), me.reached_at, me.user_id, me.slot)
             and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
             and (v_party is null or not exists (select 1 from public.hunt_party_members pm
                                                  where pm.party_id = v_party and pm.user_id = b.user_id and pm.slot = b.slot))
           order by (-b.score) desc, b.reached_at desc, b.user_id desc, b.slot desc limit 2) t;
  select coalesce(jsonb_agg(public.hr_mode_board_hero(t.user_id, t.slot, t.score, t.reached_at)
                            order by (-t.score), t.reached_at, t.user_id, t.slot), '[]'::jsonb) into v_below
    from (select b.user_id, b.slot, b.score, b.reached_at from public.hr_mode_board b
           where b.mode_id = p_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)
             and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
             and (v_party is null or not exists (select 1 from public.hunt_party_members pm
                                                  where pm.party_id = v_party and pm.user_id = b.user_id and pm.slot = b.slot))
           order by (-b.score), b.reached_at, b.user_id, b.slot limit 2) t;
  return public.hr_mode_board_place(public.hr_mode_board_rank(p_mode, me.score, me.reached_at))
         || jsonb_build_object('above', v_above, 'below', v_below);
end $fn$;

-- THE LAST CLIMB'S PLACE, once it ended: { rank | over, passed, name } (name: the best-placed hero it passed, while that hero is still on the
-- board and not hidden; null when it passed nobody). Null for another session, an open climb, or a climb that left the hero off the board.
create or replace function public.hr_mode_board_end(p_mode text, p_user uuid, p_slot int, p_session uuid)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare l public.hr_mode_board_last%rowtype;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  select * into l from public.hr_mode_board_last x
   where x.mode_id = p_mode and x.user_id = p_user and x.slot = p_slot and x.session_id = p_session and x.ended_at is not null;
  if not found or l.passed is null then return null; end if;
  return public.hr_mode_board_place(l.rank) || jsonb_build_object('passed', l.passed, 'name',
    case when l.passed_user is not null
          and exists (select 1 from public.hr_mode_board b where b.mode_id = p_mode and b.user_id = l.passed_user and b.slot = l.passed_slot)
          and not exists (select 1 from public.hr_lb_hidden h where h.user_id = l.passed_user and (h.slot is null or h.slot = l.passed_slot))
         then public.hr_character_name(l.passed_user, l.passed_slot) end);
end $fn$;

-- The Tower's session mode (its ground's row): the board its rows are kept on.
create or replace function public.hr_tower_board_mode()
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  return (select g.mode_id from public.hr_tower_rules r join public.hr_ground_session_modes g on g.hunt_id = r.hunt_id where r.id);
end $fn$;

-- ── §3 THE WRITES: the rise, a climb's start, a climb's end (trigger functions, owner-only) ─────────────────
-- THE RISE: the hero's own board row raised to its new best, once per write of tower_progress that raised it (the triggers' WHEN).
create or replace function public.hr_tower_board_rise()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_mode text := public.hr_tower_board_mode();
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  if v_mode is null or new.best_floor < 1 then return null; end if;
  insert into public.hr_mode_board as b (mode_id, user_id, slot, score, reached_at, updated_at)
  select v_mode, new.user_id, new.slot, new.best_floor, coalesce(new.best_at, new.updated_at), now()
   where exists (select 1 from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot)
  on conflict (mode_id, user_id, slot) do update set score = excluded.score, reached_at = excluded.reached_at, updated_at = excluded.updated_at
   where excluded.score > b.score;
  return null;
end $fn$;
drop trigger if exists hr_tower_board_rise_new on public.tower_progress;
create trigger hr_tower_board_rise_new after insert on public.tower_progress for each row
  when (new.best_floor >= 1) execute function public.hr_tower_board_rise();
drop trigger if exists hr_tower_board_rise on public.tower_progress;
create trigger hr_tower_board_rise after update of best_floor on public.tower_progress for each row
  when (new.best_floor > old.best_floor) execute function public.hr_tower_board_rise();

-- A CLIMB'S START: the hero's last-climb row is this session's, with the record it starts from (the board row as it stands now).
create or replace function public.hr_tower_board_run_start()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_mode text := public.hr_tower_board_mode(); b public.hr_mode_board%rowtype;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  if v_mode is null then return null; end if;
  select * into b from public.hr_mode_board x where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot;
  insert into public.hr_mode_board_last as l (mode_id, user_id, slot, session_id, from_score, from_at, rank, passed, passed_user, passed_slot,
                                               ended_at, updated_at)
  select v_mode, new.user_id, new.slot, new.session_id, coalesce(b.score, 0), b.reached_at, null, null, null, null, null, now()
   where exists (select 1 from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot)
  on conflict (mode_id, user_id, slot) do update
    set session_id = excluded.session_id, from_score = excluded.from_score, from_at = excluded.from_at, rank = null, passed = null,
        passed_user = null, passed_slot = null, ended_at = null, updated_at = excluded.updated_at;
  return null;
end $fn$;
drop trigger if exists hr_tower_board_run_start on public.tower_runs;
create trigger hr_tower_board_run_start after insert on public.tower_runs for each row execute function public.hr_tower_board_run_start();

-- A CLIMB'S END: its place now, and the heroes it passed: those now behind it that were ahead of the record it started from (a hero with no
-- record passed nobody: it joined the board). Counted to the depth; the best of them named by its server id, never projected.
create or replace function public.hr_tower_board_run_end()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_mode text := public.hr_tower_board_mode(); v_depth int := public.hr_mode_board_depth();
  l public.hr_mode_board_last%rowtype; me public.hr_mode_board%rowtype; v_n int := 0; v_pu uuid; v_ps int;
begin
  -- TOWER-BOARD (2027-04-30-tower-board.sql)
  if v_mode is null then return null; end if;
  select * into l from public.hr_mode_board_last x
   where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot and x.session_id = new.session_id for update;
  if not found then return null; end if;
  select * into me from public.hr_mode_board x where x.mode_id = v_mode and x.user_id = new.user_id and x.slot = new.slot;
  if not found then
    update public.hr_mode_board_last set ended_at = new.ended_at, updated_at = now()
     where mode_id = v_mode and user_id = new.user_id and slot = new.slot;
    return null;
  end if;
  if l.from_score >= 1 and me.score > l.from_score then
    select count(*) into v_n from (
      select 1 from public.hr_mode_board b
       where b.mode_id = v_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)
         and ((-b.score), b.reached_at) < ((-l.from_score), l.from_at)
         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
       limit v_depth) t;
    if v_n > 0 then
      select b.user_id, b.slot into v_pu, v_ps from public.hr_mode_board b
       where b.mode_id = v_mode and ((-b.score), b.reached_at, b.user_id, b.slot) > ((-me.score), me.reached_at, me.user_id, me.slot)
         and ((-b.score), b.reached_at) < ((-l.from_score), l.from_at)
         and not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and (h.slot is null or h.slot = b.slot))
       order by (-b.score), b.reached_at, b.user_id, b.slot limit 1;
    end if;
  end if;
  update public.hr_mode_board_last
     set rank = public.hr_mode_board_rank(v_mode, me.score, me.reached_at), passed = v_n, passed_user = v_pu, passed_slot = v_ps,
         ended_at = new.ended_at, updated_at = now()
   where mode_id = v_mode and user_id = new.user_id and slot = new.slot;
  return null;
end $fn$;
drop trigger if exists hr_tower_board_run_end on public.tower_runs;
create trigger hr_tower_board_run_end after update of ended_at on public.tower_runs for each row
  when (old.ended_at is null and new.ended_at is not null) execute function public.hr_tower_board_run_end();

do $mig$
declare f text; r text;
begin
  foreach f in array array['public.hr_mode_board_depth()', 'public.hr_mode_board_rank(text,integer,timestamp with time zone)',
                           'public.hr_mode_board_hero(uuid,integer,integer,timestamp with time zone)', 'public.hr_mode_board_place(integer)',
                           'public.hr_mode_board_field(text,uuid,integer)', 'public.hr_mode_board_end(text,uuid,integer,uuid)',
                           'public.hr_tower_board_mode()', 'public.hr_tower_board_rise()', 'public.hr_tower_board_run_start()',
                           'public.hr_tower_board_run_end()'] loop
    execute format('revoke all on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $mig$;

-- THE BACKFILL: every record already climbed (none on production while the Tower is staged; a rebuilt database's replay). Raise-only, so a
-- second apply moves nothing.
insert into public.hr_mode_board as b (mode_id, user_id, slot, score, reached_at, updated_at)
select public.hr_tower_board_mode(), p.user_id, p.slot, p.best_floor, coalesce(p.best_at, p.updated_at), now()
  from public.tower_progress p
  join public.player_state ps on ps.user_id = p.user_id and ps.slot = p.slot
 where p.best_floor >= 1 and public.hr_tower_board_mode() is not null
on conflict (mode_id, user_id, slot) do update set score = excluded.score, reached_at = excluded.reached_at, updated_at = excluded.updated_at
 where excluded.score > b.score;

-- ── §4 THE SECTION, RESTATED WHOLE (2027-04-28-tower-section.sql's image + the board: `field` and `last.board`) ─────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_tower_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_tower_rules%rowtype; m public.hr_session_modes%rowtype; v_best int := 0; v_rec int;
  v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype; v_run_j jsonb := null; v_last_j jsonb := null;
  v_party uuid; v_party_j jsonb := '[]'::jsonb; v_before int := null; v_field jsonb;
begin
  -- TOWER-SECTION (2027-04-28-tower-section.sql)
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into r from public.hr_tower_rules where id;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = r.hunt_id;
  if not found then return null; end if;
  select p.best_floor into v_best from public.tower_progress p where p.user_id = p_user and p.slot = p_slot;
  v_best := coalesce(v_best, 0);
  -- the record the door reads its checkpoints from (a hero in a party: the lowest best of its seats)
  v_rec := public.hr_tower_record(p_user, p_slot);
  select * into v_run from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is null order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'floor', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  -- the newest climb STARTED that has ended (a run's end is its session's, the instant the engine stopped, which a late settle can put
  -- before a newer run's; its start is the door's own now()); its keys are the mint's own ledger rows for that session
  select * into v_last from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is not null
   order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    -- TOWER-SECTION-A: the best before that climb, read only when that climb holds the record (it reached the hero's best floor)
    if v_last.top_floor is not null and v_last.top_floor >= v_best then
      select coalesce(max(t.top_floor), 0) into v_before from public.tower_runs t
       where t.user_id = p_user and t.slot = p_slot and t.started_at < v_last.started_at and t.top_floor is not null;
    end if;
    v_last_j := jsonb_build_object('session', v_last.session_id, 'start', v_last.start_floor, 'top', v_last.top_floor, 'floors', v_last.floors,
      'end_reason', v_last.end_reason, 'ended_at', v_last.ended_at, 'best_before', v_before,
      -- the run's own ledger rows, never older than the run (player_ledger is pruned at retain_days: tests/ledger-rollup.mjs (5))
      'keys', coalesce((select jsonb_agg(jsonb_build_object('landing', (l.meta->>'landing')::int, 'key', l.meta->>'key') order by (l.meta->>'landing')::int)
                          from public.player_ledger l
                         where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key'
                           and l.at >= v_last.started_at), '[]'::jsonb),
      'withheld', (select count(*) from public.player_ledger l
                    where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key_withheld'
                      and l.at >= v_last.started_at)::int,
      -- TOWER-BOARD (2027-04-30-tower-board.sql): that climb's place on the board (rank, heroes passed, the best of them), or null
      'board', public.hr_mode_board_end(m.mode_id, p_user, p_slot, v_last.session_id));
  end if;
  -- TOWER-SECTION-A: the hero's party, every OTHER seat with its own name (as the party shows it), its best floor and its worn outfit
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot),
             'floor', coalesce(tp.best_floor, 0), 'outfit', po.outfit_id) order by pm.seat), '[]'::jsonb)
      into v_party_j
      from public.hunt_party_members pm
      left join public.tower_progress tp on tp.user_id = pm.user_id and tp.slot = pm.slot
      left join public.player_outfits po on po.user_id = pm.user_id and po.slot = pm.slot
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot);
  end if;
  -- TOWER-BOARD (2027-04-30-tower-board.sql): the hero's place and the heroes just above and below; absent (not null) with no board row
  v_field := public.hr_mode_board_field(m.mode_id, p_user, p_slot);
  return jsonb_build_object(
    'hunt', r.hunt_id,
    'rules', jsonb_build_object('room_size', r.room_size, 'landing_every', r.landing_every, 'floor_limit_ms', r.floor_limit_ms,
                                'landing_limit_ms', r.landing_limit_ms, 'floor_top', r.floor_top),
    'pays', jsonb_build_object('xp_pm', m.xp_pm, 'coin', m.coin, 'drops', m.drops, 'bestiary', m.bestiary, 'death_loss_pm', m.death_loss_pm,
                               'blessings', m.blessings, 'stamina', m.stamina),
    'best_floor', v_best,
    'record', v_rec,
    'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, v_rec)),
    'run', v_run_j,
    'last', v_last_j,
    'party', v_party_j,
    'chest', public.hr_chest_section(p_user, p_slot))
    || case when v_field is null then '{}'::jsonb else jsonb_build_object('field', v_field) end;
end $fn$;
revoke all on function public.hr_tower_section(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_tower_section(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('tower', 'hr_tower_section', '2027-04-28-tower-section.sql: the Burning Tower''s window (the checkpoints this hero may start after, the climb now and the last one with its keys, what a climb pays, the Hearth Chest''s menu), while the `burning_tower` switch is on for the account; 2027-04-30-tower-board.sql: the hero''s place on the Tower''s board and the heroes around it (field), and its last climb''s (last.board)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 (no verb: the board is read through the section; a Leaderboards board over hr_mode_board is a later lane) ─────────────

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────────────────────
do $chk$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000b0a4d0a1';
  v_b  constant uuid := '000000c0-0000-4000-a000-0000b0a4d0b2';
  v_c  constant uuid := '000000c0-0000-4000-a000-0000b0a4d0c3';
  v_d  constant uuid := '000000c0-0000-4000-a000-0000b0a4d0d4';
  v_e  constant uuid := '000000c0-0000-4000-a000-0000b0a4d0e5';
  k    constant text := '000000c0-0000-4000-b000-b0a4';
  v jsonb; s jsonb; f jsonb; v_scope text; v_sid uuid; v_tw jsonb; v_t0 timestamptz; v_t10 timestamptz; v_t13 timestamptz;
  r public.hr_tower_rules%rowtype; v_mode text; v_ctid tid; v_u uuid; v_role text; v_n int; v_name text;
  v_na text; v_nb text; v_nc text; v_nd text; v_ne text;
begin
  select * into r from public.hr_tower_rules where id;
  v_mode := public.hr_tower_board_mode();
  select scope into v_scope from public.hr_feature_switches where switch_id = 'burning_tower';
  if r.hunt_id is null or v_mode is null or v_scope is null then raise exception 'tower-board §6: the Tower''s rules, mode or switch are not there to probe with'; end if;

  -- (a) THE WALLS: no client role reads or writes either table or calls a helper; RLS on and no policy; the triggers stand where they should.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_mode_board', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_mode_board_last', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_mode_board_field(text,uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_mode_board_end(text,uuid,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_mode_board_rank(text,integer,timestamp with time zone)', 'execute')
       or has_function_privilege(v_role, 'public.hr_tower_section(uuid,integer)', 'execute') then
      raise exception 'tower-board §6(a): % reaches the board, its last-climb rows, a read or the section', v_role; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_mode_board'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.hr_mode_board_last'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_mode_board', 'hr_mode_board_last')) then
    raise exception 'tower-board §6(a): a board table has RLS off or a policy'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('hr_tower_board_rise_new', 'hr_tower_board_rise')
        and tgrelid = 'public.tower_progress'::regclass) <> 2
     or (select count(*) from pg_trigger where not tgisinternal and tgname in ('hr_tower_board_run_start', 'hr_tower_board_run_end')
        and tgrelid = 'public.tower_runs'::regclass) <> 2 then
    raise exception 'tower-board §6(a): the rise and run triggers are not on tower_progress and tower_runs'; end if;
  if exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang where p.proname in ('hr_mode_board_rank', 'hr_mode_board_field',
               'hr_mode_board_end', 'hr_mode_board_hero', 'hr_mode_board_place', 'hr_mode_board_depth', 'hr_tower_board_mode', 'hr_tower_section')
               and p.pronamespace = 'public'::regnamespace and l.lanname <> 'plpgsql') then
    raise exception 'tower-board §6(a): a read the settle reaches is not plpgsql'; end if;
  -- the board's every read is a range of its order index (with sequential scans off, the probe plans on the index)
  if to_regclass('public.hr_mode_board_order') is null then raise exception 'tower-board §6(a): the order index is missing'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    -- THE PROBE STANDS ALONE: every account already on a board is hidden for the probe's length (rolled back with it), so a real climber
    -- never shifts a place this block asserts and is never named in it
    insert into public.hr_lb_hidden (user_id, slot, reason, note)
    select distinct b.user_id, null::int, 'test', 'tower-board §6' from public.hr_mode_board b
     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = b.user_id and h.slot is null);
    -- five heroes, each its own account, named per run (never a real hero's name)
    loop
      v_na := 'Zt' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_nb := 'Zu' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_nc := 'Zv' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_nd := 'Zw' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_ne := 'Zx' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      exit when not exists (select 1 from public.character_names where canonical in (public.hr_canon_display_name(v_na),
        public.hr_canon_display_name(v_nb), public.hr_canon_display_name(v_nc), public.hr_canon_display_name(v_nd), public.hr_canon_display_name(v_ne)));
    end loop;
    foreach v_u in array array[v_a, v_b, v_c, v_d, v_e] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id) values (v_u) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-board §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-board §6: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    end loop;
    insert into public.character_names (user_id, slot, name, canonical) values
      (v_a, 0, v_na, public.hr_canon_display_name(v_na)), (v_b, 0, v_nb, public.hr_canon_display_name(v_nb)),
      (v_c, 0, v_nc, public.hr_canon_display_name(v_nc)), (v_d, 0, v_nd, public.hr_canon_display_name(v_nd)),
      (v_e, 0, v_ne, public.hr_canon_display_name(v_ne))
      on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_a, v_b, v_c, v_d, v_e] where switch_id = 'burning_tower';

    -- (b) THE RISE, through the settle's own write: A climbs floors 1 to a landing; its board row is that floor at the window's end. A hero
    --     who never climbed has no row and no field.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    s := public.hr_tower_section(v_a, 0);
    if s is null or s ? 'field' then raise exception 'tower-board §6(b): a hero who never climbed reads %', s; end if;
    v := public.hr_tower_start(0, 0, (k || '00000001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-board §6(b): the first climb answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    select h.settled_to into v_t0 from public.hunt_sessions h where h.id = v_sid;
    v_t10 := v_t0 + make_interval(secs => r.landing_every * r.stair_ms / 1000.0);
    v_tw := public.hr_tower_check(v_sid, ('{"tower": {"floors": ' || (select jsonb_agg(x) from generate_series(1, r.landing_every) x)::text || '}}')::jsonb, v_t0, v_t10);
    perform public.hr_tower_write(v_a, 0, v_sid, v_tw, r.landing_every * r.room_size, v_t10);
    if not exists (select 1 from public.hr_mode_board where mode_id = v_mode and user_id = v_a and slot = 0 and score = r.landing_every and reached_at = v_t10) then
      raise exception 'tower-board §6(b): after a landing the board reads %', (select to_jsonb(b) from public.hr_mode_board b where b.user_id = v_a); end if;
    select ctid into v_ctid from public.hr_mode_board where mode_id = v_mode and user_id = v_a and slot = 0;
    -- a write that raises no best (kills only; a best written lower) leaves the board row as it was
    perform public.hr_tower_write(v_a, 0, v_sid, jsonb_build_object('lo', r.landing_every + 1, 'n', 0), r.room_size - 1, v_t10 + interval '1 second');
    update public.tower_progress set best_floor = greatest(best_floor, 3), updated_at = now() where user_id = v_a and slot = 0;
    if (select ctid from public.hr_mode_board where mode_id = v_mode and user_id = v_a and slot = 0) is distinct from v_ctid then
      raise exception 'tower-board §6(b): a write that raised no best moved the board row'; end if;

    -- (c) TIES: B 12 (2 minutes before), C at A's floor a minute earlier, D at A's floor in A's own instant, E 3. Written as the settle writes
    --     the record (tower_progress), so the trigger keeps the board. Order: B, C, then A and D (same instant: one shared place), E.
    insert into public.tower_progress (user_id, slot, best_floor, best_landing, best_at) values
      (v_b, 0, r.landing_every + 2, r.landing_every, v_t10 - interval '2 minutes'), (v_c, 0, r.landing_every, r.landing_every, v_t10 - interval '1 minute'),
      (v_d, 0, r.landing_every, r.landing_every, v_t10), (v_e, 0, 3, 0, v_t10 - interval '5 minutes');
    if (select count(*) from public.hr_mode_board where mode_id = v_mode and user_id in (v_a, v_b, v_c, v_d, v_e)) <> 5 then
      raise exception 'tower-board §6(c): the board holds % of the five', (select count(*) from public.hr_mode_board where user_id in (v_a, v_b, v_c, v_d, v_e)); end if;
    if public.hr_mode_board_rank(v_mode, r.landing_every + 2, v_t10 - interval '2 minutes') <> 1
       or public.hr_mode_board_rank(v_mode, r.landing_every, v_t10 - interval '1 minute') <> 2
       or public.hr_mode_board_rank(v_mode, r.landing_every, v_t10) <> 3
       or public.hr_mode_board_rank(v_mode, 3, v_t10 - interval '5 minutes') <> 5 then
      raise exception 'tower-board §6(c): the places read B %, C %, A/D %, E %', public.hr_mode_board_rank(v_mode, r.landing_every + 2, v_t10 - interval '2 minutes'),
        public.hr_mode_board_rank(v_mode, r.landing_every, v_t10 - interval '1 minute'), public.hr_mode_board_rank(v_mode, r.landing_every, v_t10),
        public.hr_mode_board_rank(v_mode, 3, v_t10 - interval '5 minutes'); end if;
    -- A's field (A sorts before D: v_a < v_d): place 3, B and C above it top-down, D and E below it; no id of any kind
    s := public.hr_tower_section(v_a, 0);
    f := s->'field';
    if f is null or (f->>'rank')::int is distinct from 3 or f ? 'over'
       or (select jsonb_agg(e->>'name') from jsonb_array_elements(f->'above') e) <> jsonb_build_array(v_nb, v_nc)
       or (select jsonb_agg(e->>'name') from jsonb_array_elements(f->'below') e) <> jsonb_build_array(v_nd, v_ne)
       or (select jsonb_agg((e->>'floor')::int) from jsonb_array_elements(f->'above') e) <> jsonb_build_array(r.landing_every + 2, r.landing_every)
       or f->'above'->0->>'at' is distinct from to_char((v_t10 - interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD') then
      raise exception 'tower-board §6(c): A''s field reads %', f; end if;
    if strpos(f::text, v_b::text) > 0 or strpos(f::text, v_c::text) > 0 or strpos(f::text, v_d::text) > 0 or strpos(f::text, v_e::text) > 0
       or exists (select 1 from jsonb_array_elements(f->'above' || f->'below') e where e ? 'slot' or e ? 'user_id' or e ? 'id') then
      raise exception 'tower-board §6(c): the field carries an account id or a slot: %', f; end if;
    -- D shares A's place
    if (public.hr_tower_section(v_d, 0)->'field'->>'rank')::int is distinct from 3 then
      raise exception 'tower-board §6(c): D, tied with A in one instant, reads %', public.hr_tower_section(v_d, 0)->'field'; end if;

    -- (d) THE END OF A CLIMB: A's first climb ends; it started with no record, so it joined the board and passed nobody.
    perform public.hr_hunt_close(v_sid, 'died', now(), true);
    s := public.hr_tower_section(v_a, 0);
    if s->'last'->'board' is distinct from jsonb_build_object('rank', 3, 'passed', 0, 'name', null) then
      raise exception 'tower-board §6(d): a first climb''s board reads %', s->'last'->'board'; end if;
    -- A climbs again from its landing, clears three floors to a new best: it passes B and C (ahead of its old record), not D (tied) or E
    update public.tower_runs set started_at = started_at - interval '1 minute' where session_id = v_sid;
    v := public.hr_tower_start(0, r.landing_every, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-board §6(d): the second climb answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    if (select from_score from public.hr_mode_board_last where mode_id = v_mode and user_id = v_a) is distinct from r.landing_every then
      raise exception 'tower-board §6(d): the second climb starts from %', (select to_jsonb(l) from public.hr_mode_board_last l where l.user_id = v_a); end if;
    select h.settled_to into v_t0 from public.hunt_sessions h where h.id = v_sid;
    v_t13 := v_t0 + make_interval(secs => 3 * r.stair_ms / 1000.0);
    v_tw := public.hr_tower_check(v_sid, jsonb_build_object('tower', jsonb_build_object('floors', jsonb_build_array(r.landing_every + 1, r.landing_every + 2, r.landing_every + 3))), v_t0, v_t13);
    select ctid into v_ctid from public.hr_mode_board where mode_id = v_mode and user_id = v_a and slot = 0;
    perform public.hr_tower_write(v_a, 0, v_sid, v_tw, 3 * r.room_size, v_t13);
    if (select ctid from public.hr_mode_board where mode_id = v_mode and user_id = v_a and slot = 0) is not distinct from v_ctid
       or not exists (select 1 from public.hr_mode_board where mode_id = v_mode and user_id = v_a and score = r.landing_every + 3 and reached_at = v_t13) then
      raise exception 'tower-board §6(d): the rise to % did not reach the board', r.landing_every + 3; end if;
    -- while it climbs, A is on top, and the card of the climb before has no board facts (this climb's start took the hero's last-climb row)
    s := public.hr_tower_section(v_a, 0);
    if (s->'field'->>'rank')::int is distinct from 1 or s->'last'->'board' <> 'null'::jsonb then
      raise exception 'tower-board §6(d): A on top reads % (last.board %)', s->'field', s->'last'->'board'; end if;
    perform public.hr_hunt_close(v_sid, 'died', now(), true);
    s := public.hr_tower_section(v_a, 0);
    if (s->'last'->>'session')::uuid is distinct from v_sid
       or s->'last'->'board' is distinct from jsonb_build_object('rank', 1, 'passed', 2, 'name', v_nb) then
      raise exception 'tower-board §6(d): the record climb''s board reads % (last %)', s->'last'->'board', s->'last'->>'session'; end if;

    -- (e) A PARTY SEAT is the party's marker, not a rival: B seated with A leaves A's field; the next hero below steps up.
    perform public.hr_party_seat_into(public.hr_party_open(v_a, 0), v_b, 0);
    f := public.hr_tower_section(v_a, 0)->'field';
    if (select jsonb_agg(e->>'name') from jsonb_array_elements(f->'below') e) <> jsonb_build_array(v_nc, v_nd) or f->'above' <> '[]'::jsonb then
      raise exception 'tower-board §6(e): with B seated A''s field reads %', f; end if;

    -- (f) HIDDEN: a hidden hero is never counted or shown; the hidden viewer still reads its own place among the others.
    insert into public.hr_lb_hidden (user_id, slot, reason, note) values (v_c, null, 'test', 'tower-board §6');
    f := public.hr_tower_section(v_a, 0)->'field';
    if (select jsonb_agg(e->>'name') from jsonb_array_elements(f->'below') e) <> jsonb_build_array(v_nd, v_ne)
       or (public.hr_tower_section(v_d, 0)->'field'->>'rank')::int is distinct from 3 then
      raise exception 'tower-board §6(f): with C hidden A reads %, D reads %', f, public.hr_tower_section(v_d, 0)->'field'; end if;
    f := public.hr_tower_section(v_c, 0)->'field';
    if (f->>'rank')::int is distinct from 3 or (select jsonb_agg(e->>'name') from jsonb_array_elements(f->'above') e) <> jsonb_build_array(v_na, v_nb) then
      raise exception 'tower-board §6(f): hidden C reads its own field %', f; end if;

    -- (g) THE SWITCH: off for the account, no section, so no field and no board fact leaves.
    update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower';
    if public.hr_tower_section(v_a, 0) is not null then raise exception 'tower-board §6(g): the switch is off and the section reads %', public.hr_tower_section(v_a, 0); end if;

    raise exception using errcode = 'HRB01', message = 'tower-board §6 complete - rolling back';
  exception when sqlstate 'HRB01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is distinct from v_scope then
    raise exception 'tower-board §6: the probe left the switch moved'; end if;
  if exists (select 1 from public.hr_mode_board where user_id in (v_a, v_b, v_c, v_d, v_e))
     or exists (select 1 from public.hr_mode_board_last where user_id in (v_a, v_b, v_c, v_d, v_e))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c, v_d, v_e))
     or exists (select 1 from public.hr_lb_hidden where note = 'tower-board §6') then
    raise exception 'tower-board §6: a probe row leaked'; end if;
  raise notice 'tower-board §6 OK: the walls, a rise kept once and a non-rise not at all, ties by who got there first (one instant one place), the field with no id, a climb''s end with its place and the heroes it passed, a party seat not a rival, hidden heroes never shown, the switch';
end $chk$;
