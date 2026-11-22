-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1060-watched-stamp.sql — THE SERVER KNOWS WHAT THE PLAYER WATCHED: THE AWAY CARD'S BASELINE IS A SERVER MARK
--   (lane/watched-stamp, backend-architect, 2026-11-22; AR-6 follow-up, the board's "Away card: server-side watched stamp", the
--   Coordinator's ruling: option (a), the engine records the viewed hero's numbers at each viewed poll; not option (b), a client put
--   a minute, which reverses the 2026-11-01 cost cut).
--
-- STATUS: supabase/migration-notes/1060-watched-stamp.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after 1032-approved-cuts.sql,
--   whose detector carries this file's engine entry: §0 refuses without it). Applied as ONE transaction by the apply tool; never
--   begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The away card (src/shell/away-recap.js) counts what the absence earned from the last-seen stamp, a display residue the client writes
-- (`awaySeen`): on a hunt's first sight, every AWAY_MIN_MS in view (10 min, 3 for a new hero) and on the way out (the goodbye). The
-- goodbye can be lost (1fa051ff0 made it rare: a keepalive in the caller's turn), but a crash or an OS kill sends nothing, and the card
-- then counts up to one renewal of WATCHED hunting as earned while away (AR-6: "+33,583 Level XP" for an hour, most of it watched).
-- The server already sees every viewed poll: the live view's ask (hunt-settle.js, a player door with `live`). Marking the hero there
-- costs no request and no statement: the mark rides that ask's one read.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- TABLE hunt_watch (user_id, slot) PK — one row a hero the player has watched hunt:
--   mark  jsonb        the numbers at the LAST viewed ask, in the residue stamp's own shape (away-recap.js awayStampOf), each the
--                      server's own row: { s: the open session, at: ms of now(), h: its hunt, xp: Level XP, lv: hr_char_level(xp),
--                      gold: coins + cover_gold, sp: supply_gold, kills (the session's tally, hr_hunt_stats_of's terms),
--                      k, sx, sl: the skill the session trains (a yard session's own, or the yard its plan goes on to: away-recap.js
--                      trainedSkillOf) with its XP and hr_skill_level }. The SAVED numbers, as the record the page holds says them.
--   at    timestamptz  when the mark was taken (now(), the server's clock)
--   away  jsonb        the mark that closed the last ABSENCE: the old mark a viewed ask found at least hr_hunt_watch_gap() old
--   back  timestamptz  when that ask came (the visit's first)
-- hr_hunt_watch_note(p_user, p_slot) -> boolean   NEW. SECURITY DEFINER, VOLATILE, EXECUTE for hr_engine only, every client role
--   and hr_tick refused by its body too. Called ONLY by a viewed ask, with the engine's verified subject: a term of its read
--   (hunt-settle.js HUNT_READ_WATCHED_SQL) and, when the ask saves, of its commit after the apply landed (HUNT_APPLY_WATCHED_SQL), so
--   the mark is the record that ask answered with. No open hunt: false, nothing written. Else one upsert of the caller's own row: a
--   mark at least the gap old moves to `away` (with `back` = now()) before the new mark lands. Moves no value; reads only this hero's
--   own rows. The world tick never calls it.
-- hr_hunt_watch_view(p_user, p_slot) -> jsonb      NEW. The section `watched` (hr_state_sections): the mark a RETURN is judged
--   from, or null. A mark at least the gap old (no viewed ask since the absence began: this read is the return's first) is the
--   mark; a mark fresher than that whose `back` is too (the return's first ask already marked) is `away`; anything else is a hero
--   being watched: null, and the page's own stamp decides as before.
-- hr_hunt_watch_gap() -> interval                  NEW. 1 minute, the one constant both read: above the live view's longest ask
--   (huntPollMs 16 s, src/session/config.js) with room for a held ask, below the shortest absence the card speaks of (3 min).
-- THE CLIENT (src/shell/away-recap.js judgedStampOf, src/session/hunt-sections.js watchedOf): the return compares with the LATER of
--   its own stamp and this mark (same shape, both the server's numbers). A lost goodbye leaves the mark at the last viewed ask, so
--   the card can overstate by at most one ask (16 s), never one renewal (10 min); a landed goodbye is later and still wins.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The upsert locks only this hero's own watch row; two tabs asking at once serialise on it and each sees the other's mark (ON
-- CONFLICT re-reads the latest row), so `away` moves only past a real gap. It reads player_state, hunt_sessions and the tally
-- without a lock and takes no hero lock (hr_hunt_lock) of its own: on a read it never waits on, nor holds up, a settle's commit; on
-- a commit it runs after the apply, inside the apply's transaction, and reads the rows that apply wrote. A replayed ask
-- is a fresh mark at its own now(): marks are a clock, not a ledger. A second apply restates the same bodies, grants and row.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No client RPC, no client grant, no policy (hr_client_rpc_baseline unchanged). The note is the engine's: hr_engine only, refused to
-- every client role in its body. Its whole input is the verified (user, slot); every number it writes is that hero's own server row
-- and the server clock. The section is read-only, the owner's alone. A player can move only their own mark, only by asking their
-- own live view, and the mark only ever makes their own away card say LESS. Nothing crosses to another player.
--
-- ── COST (measured: tests/per-player-cost.mjs, tests/settle-budget.mjs) ──────
-- No request, no statement and no round trip: the note is a term of statements the viewed ask already sends. One upsert of one
-- narrow row a viewed ask (two on a saving one; a HOT update: no indexed column moves) and four primary-key reads. MEASURED on the
-- heavy watched four (24 polls + 14 early asks, 4 of them saving): 42 hunt_watch writes (1 insert, 41 updates, 40 HOT), ~98 a
-- hero-hour, 3.9% of the fixture's row writes; statements and round trips a hero-hour unchanged (724.2, 2730.5); every closed
-- fixture 0. At 100x players (~800 heroes, a quarter viewed): 800 rows of ~300 bytes; ~14 updates a second, each one row's WAL. The
-- section is one primary-key read an envelope.
--
-- EDGE: hunt-settle.js reads and commits a viewed ask with the watched statements; a database without this file answers 42883 at
--   parse (nothing ran) and the ask goes with HUNT_READ_SQL / HUNT_APPLY_SQL, as before (EDGE-ORDER: either). CLIENT: away-recap.js
--   reads the section; a page without it reads only its own stamp, as before.
-- REVERSIBLE: drop the section row, the three functions and the table (the client then reads no section: its own stamp, as before).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_session_tally') is null or to_regclass('public.player_skills') is null
     or to_regclass('public.hr_training_grounds') is null or to_regclass('public.hr_hunt_after_choices') is null
     or to_regclass('public.hr_hunt_after_rule') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: the hunt sessions, the tally, the skills, the training grounds, the hunt-after catalogue or the section registry is missing'; end if;
  if to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_hunt_new_session(uuid,integer,text,uuid,integer,integer)') is null then
    raise exception 'PRECONDITION: hr_char_level / hr_skill_level / hr_state_of / hr_hunt_new_session is missing'; end if;
  -- the detector already allows the grant §2 makes (1032's link 25): without it the grant would read engine_execute_outside_allowlist
  if strpos((select prosrc from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure),
            '''hr_hunt_watch_note(uuid,integer)''') = 0 then
    raise exception 'PRECONDITION: hr_assert_grant_hygiene''s c_engine_allow lacks hr_hunt_watch_note(uuid,integer): apply 1032-approved-cuts.sql (link 25) first'; end if;
end $mig$;

-- ── §1 THE ROW ───────────────────────────────────────────────────────────────
create table if not exists public.hunt_watch (
  user_id uuid        not null references auth.users (id) on delete cascade,
  slot    smallint    not null check (slot between 0 and 32),
  mark    jsonb       not null check (jsonb_typeof(mark) = 'object'),
  at      timestamptz not null,
  away    jsonb       check (away is null or jsonb_typeof(away) = 'object'),
  back    timestamptz,
  primary key (user_id, slot)
);
alter table public.hunt_watch enable row level security;
revoke all on public.hunt_watch from public, anon, authenticated, service_role;
comment on table public.hunt_watch is
  '1060-watched-stamp.sql: the numbers at the last viewed ask of a hero''s hunt (mark, at) and the mark that closed its last absence (away, back). Display only: the away card''s baseline. Written only by hr_hunt_watch_note (hr_engine), read only by the `watched` section.';

-- ── §2 THE GAP, THE NOTE, THE SECTION ────────────────────────────────────────
-- A plain IMMUTABLE sql constant: inlined into its callers' plans (tests/settle-budget.mjs SB-3 flags only the ones that can't be).
create or replace function public.hr_hunt_watch_gap()
returns interval language sql immutable parallel safe as $fn$
  select interval '1 minute'
$fn$;

create or replace function public.hr_hunt_watch_note(p_user uuid, p_slot integer)
returns boolean language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
-- WATCHED-STAMP (1060-watched-stamp.sql): the viewed ask's mark (hunt-settle.js HUNT_READ_WATCHED_SQL). The open hunt's numbers as
-- the server holds them now, in the shape of the page's own stamp (away-recap.js awayStampOf); a mark the gap old moves to `away`.
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_xp   bigint;
  v_t    public.hunt_session_tally%rowtype;
  v_k    text;
  v_sx   bigint;
  v_m    jsonb;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_hunt_watch_note: not callable by %', v_role using errcode = '42501';
  end if;
  select * into v_s from public.hunt_sessions s where s.user_id = p_user and s.slot = p_slot and s.ended_at is null;   -- hunt_sessions_one_open
  if not found then return false; end if;
  select greatest(0, coalesce(ps.level_xp, 0)) into v_xp from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return false; end if;
  select * into v_t from public.hunt_session_tally t where t.session_id = v_s.id;
  -- THE SKILL THIS SESSION TRAINS (away-recap.js trainedSkillOf): a yard session's own, else the yard its plan goes on to (the
  -- `hunt_after` section's `now`: the session's frozen choice, the rule's default when it has none)
  select g.skill into v_k from public.hr_training_grounds g where g.hunt_id = v_s.hunt_id;
  if v_k is null and v_s.after_skill is not null and exists (
       select 1 from public.hr_hunt_after_choices c
        where c.runs = 'training' and c.choice = coalesce(v_s.after_choice, (select r.default_choice from public.hr_hunt_after_rule r where r.id))) then
    v_k := v_s.after_skill;
  end if;
  if v_k is not null then
    select k.xp into v_sx from public.player_skills k where k.user_id = p_user and k.slot = p_slot and k.skill_id = v_k;
  end if;
  v_m := jsonb_build_object('s', v_s.id, 'at', floor(extract(epoch from now()) * 1000)::bigint, 'h', v_s.hunt_id,
                            'xp', v_xp, 'lv', public.hr_char_level(v_xp))
      || case when v_t.session_id is not null
              then jsonb_build_object('gold', v_t.coins + v_t.cover_gold, 'sp', v_t.supply_gold, 'kills', v_t.kills) else '{}'::jsonb end
      || case when v_sx is not null
              then jsonb_build_object('k', v_k, 'sx', v_sx, 'sl', public.hr_skill_level(v_k, v_sx)) else '{}'::jsonb end;
  insert into public.hunt_watch as w (user_id, slot, mark, at) values (p_user, p_slot, v_m, now())
  on conflict (user_id, slot) do update
     set away = case when w.at <= now() - public.hr_hunt_watch_gap() then w.mark else w.away end,
         back = case when w.at <= now() - public.hr_hunt_watch_gap() then now() else w.back end,
         mark = excluded.mark,
         at   = excluded.at;
  return true;
end $fn$;

-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_hunt_watch_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- WATCHED-STAMP (1060-watched-stamp.sql): the mark a return is judged from (see the file's contract), or null.
declare w public.hunt_watch%rowtype;
begin
  select * into w from public.hunt_watch x where x.user_id = p_user and x.slot = p_slot;
  if not found then return null; end if;
  if w.at <= now() - public.hr_hunt_watch_gap() then return w.mark; end if;
  if w.back is not null and w.back > now() - public.hr_hunt_watch_gap() then return w.away; end if;
  return null;
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_hunt_watch_note(uuid,integer)', 'public.hr_hunt_watch_view(uuid,integer)', 'public.hr_hunt_watch_gap()'] loop
    execute format('revoke all on function %s from public', v_sig);
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_watch_note(uuid, integer) to hr_engine; end if;
end $mig$;

-- ── §3 THE SECTION ───────────────────────────────────────────────────────────
insert into public.hr_state_sections (key, fn, note) values
  ('watched', 'hr_hunt_watch_view', '1060-watched-stamp.sql: the numbers at the last viewed ask before this return (the away card''s baseline), or null while the hero is being watched')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe is rolled back ─────────
-- (a) THE GRANTS: hr_engine may run the note, nobody else; no client role reads the section, the gap or the row; RLS on, no policy
-- (b) A VIEWED ASK MARKS: the open hunt's numbers, each the server's own row (Level XP and its Level, the session's coins + cover,
--     store gold and kills, the hunt); while the hero is watched the section is null
-- (c) A CLOSED HUNT MOVES NO MARK: a settle's credit (Level XP, the tally) after the last ask leaves the mark as it was; the absence's
--     mark is what the section says once it is the gap old
-- (d) THE RETURN'S FIRST ASK: the old mark moves to `away`, the section still names it; a second ask inside the gap moves neither
-- (e) A YARD SESSION: the trained skill, its XP and its Level ride the mark
-- (f) NO HUNT: false and nothing written; the detector passes with the new grant
do $chk$
declare
  u    constant uuid := '000000c0-0000-4000-a000-00000a7c1060';
  v_sid uuid; v_m jsonb; v_s jsonb; v jsonb; v_xp bigint; v_at timestamptz; v_yard text; v_skill text; v_role text;
begin
  -- (a)
  if not has_function_privilege('hr_engine', 'public.hr_hunt_watch_note(uuid,integer)', 'execute') then
    raise exception 'watched-stamp §4(a): hr_engine cannot run the note'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) and (
         has_function_privilege(v_role, 'public.hr_hunt_watch_note(uuid,integer)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_watch_view(uuid,integer)', 'execute')
         or has_table_privilege(v_role, 'public.hunt_watch', 'select,insert,update,delete')) then
      raise exception 'watched-stamp §4(a): % reaches the note, the section or the row', v_role; end if;
  end loop;
  if has_function_privilege('hr_engine', 'public.hr_hunt_watch_view(uuid,integer)', 'execute') then
    raise exception 'watched-stamp §4(a): hr_engine reads the section directly'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hunt_watch'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_watch') then
    raise exception 'watched-stamp §4(a): hunt_watch is not RLS-on with no policy'; end if;

  begin
    perform set_config('request.jwt.claim.sub', u::text, true);
    insert into auth.users (id) values (u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (u, '1060-watched-stamp §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'watched-stamp §4: hr_create_character refused: %', v; end if;

    -- (f) no hunt: false, nothing written
    if public.hr_hunt_watch_note(u, 0) is not false or exists (select 1 from public.hunt_watch where user_id = u) then
      raise exception 'watched-stamp §4(f): a hero with no hunt was marked'; end if;

    -- (b) a viewed ask on an open hunt
    v_sid := public.hr_hunt_new_session(u, 0, 'mill_cellar', null, 0, null);
    update public.player_state set level_xp = public.hr_char_xp_for_level(6) + 17 where user_id = u and slot = 0;
    update public.hunt_session_tally set kills = 40, coins = 300, cover_gold = 25, supply_gold = 90 where session_id = v_sid;
    if public.hr_hunt_watch_note(u, 0) is not true then raise exception 'watched-stamp §4(b): the note did not mark an open hunt'; end if;
    select mark, at into v_m, v_at from public.hunt_watch where user_id = u and slot = 0;
    v_xp := public.hr_char_xp_for_level(6) + 17;
    if v_m->>'s' is distinct from v_sid::text or v_m->>'h' <> 'mill_cellar' or (v_m->>'xp')::bigint <> v_xp
       or (v_m->>'lv')::int <> public.hr_char_level(v_xp) or (v_m->>'lv')::int <> (public.hr_state_of(u, 0)->'level'->>'level')::int
       or (v_m->>'gold')::bigint <> 325 or (v_m->>'sp')::bigint <> 90 or (v_m->>'kills')::bigint <> 40
       or (v_m->>'at')::bigint <> floor(extract(epoch from v_at) * 1000)::bigint or v_m ? 'k' then
      raise exception 'watched-stamp §4(b): the mark reads %', v_m; end if;
    if public.hr_state_of(u, 0)->'watched' <> 'null'::jsonb then
      raise exception 'watched-stamp §4(b): a hero being watched has a section %', public.hr_state_of(u, 0)->'watched'; end if;

    -- (c) the browser closes; the closed hunt settles on: its credit moves no mark, and the gap later the section is the mark
    update public.player_state set level_xp = level_xp + 5000 where user_id = u and slot = 0;
    update public.hunt_session_tally set kills = kills + 30, coins = coins + 200 where session_id = v_sid;
    if (select mark from public.hunt_watch where user_id = u and slot = 0) <> v_m then
      raise exception 'watched-stamp §4(c): a settle moved the mark'; end if;
    update public.hunt_watch set at = at - interval '30 minutes',
           mark = jsonb_set(mark, '{at}', to_jsonb((mark->>'at')::bigint - 1800000)) where user_id = u and slot = 0;
    v_m := (select mark from public.hunt_watch where user_id = u and slot = 0);
    v_s := public.hr_state_of(u, 0)->'watched';
    if v_s is distinct from v_m then raise exception 'watched-stamp §4(c): thirty minutes after the last ask the section reads %', v_s; end if;

    -- (d) the return's first ask: the old mark is the absence's, still named; a second ask inside the gap moves neither
    perform public.hr_hunt_watch_note(u, 0);
    if (select away from public.hunt_watch where user_id = u and slot = 0) is distinct from v_m
       or (select back from public.hunt_watch where user_id = u and slot = 0) is distinct from now()
       or ((select mark from public.hunt_watch where user_id = u and slot = 0)->>'xp')::bigint <> v_xp + 5000 then
      raise exception 'watched-stamp §4(d): the return''s ask left %', (select to_jsonb(w) from public.hunt_watch w where user_id = u and slot = 0); end if;
    if public.hr_state_of(u, 0)->'watched' is distinct from v_m then
      raise exception 'watched-stamp §4(d): after the return''s first ask the section reads %', public.hr_state_of(u, 0)->'watched'; end if;
    perform public.hr_hunt_watch_note(u, 0);
    if (select away from public.hunt_watch where user_id = u and slot = 0) is distinct from v_m then
      raise exception 'watched-stamp §4(d): an ask inside the gap moved the absence''s mark'; end if;
    -- ...and once the return is the gap old with the hero still watched (the mark fresh), the section is null again
    update public.hunt_watch set back = back - interval '2 minutes' where user_id = u and slot = 0;
    if public.hr_state_of(u, 0)->'watched' <> 'null'::jsonb then
      raise exception 'watched-stamp §4(d): a hero watched since a return two minutes ago has a section %', public.hr_state_of(u, 0)->'watched'; end if;

    -- (e) a yard session (the account's second hero): the trained skill rides the mark
    select g.hunt_id, g.skill into v_yard, v_skill from public.hr_training_grounds g order by g.ord, g.hunt_id limit 1;
    if v_yard is null then raise exception 'watched-stamp §4(e): no training ground to probe with'; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'watched-stamp §4(e): hr_create_character(1) refused: %', v; end if;
    v_sid := public.hr_hunt_new_session(u, 1, v_yard, null, 0, null);
    insert into public.player_skills (user_id, slot, skill_id, xp) values (u, 1, v_skill, 4321)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    perform public.hr_hunt_watch_note(u, 1);
    v_m := (select mark from public.hunt_watch where user_id = u and slot = 1);
    if v_m->>'s' is distinct from v_sid::text or v_m->>'k' is distinct from v_skill or (v_m->>'sx')::bigint <> 4321
       or (v_m->>'sl')::int <> public.hr_skill_level(v_skill, 4321) then
      raise exception 'watched-stamp §4(e): a yard session''s mark reads %', v_m; end if;

    raise exception using errcode = 'HR060', message = '1060-watched-stamp §4 complete - rolling back';
  exception when sqlstate 'HR060' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = u) or exists (select 1 from public.hunt_watch where user_id = u)
     or exists (select 1 from auth.users where id = u) then
    raise exception 'watched-stamp §4: a probe row leaked'; end if;
  -- (f) the detector passes with the new grant
  perform public.hr_assert_grant_hygiene(true);
  raise notice '1060-watched-stamp §4 OK: the grants, a viewed ask''s mark, a closed hunt moves none, the return names the absence, a yard''s skill, no hunt no mark';
end $chk$;
