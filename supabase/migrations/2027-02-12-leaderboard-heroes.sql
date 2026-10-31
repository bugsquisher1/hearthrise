-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-12-leaderboard-heroes.sql — THE BOARDS RANK HEROES, BY THEIR OWN NAMES.
--
-- STATUS: STAGED (lane/b-leaderboards, 2026-10-31). Pre-EA: applies on its passing §7
-- (CLAUDE.md §2: no per-change Security review before the Early Access wipe). On the EA
-- Security list: a RANKED surface (names and standings cross to every player). EDGE: none.
-- CLIENT: the Roll of Honor window (src/shell/windows/honor.js) rides the next release AFTER
-- this applies; no shipped client calls hr_leaderboard today (the old client was scrapped).
-- ORDER: last in the chain (after 2027-02-11-db-retention.sql). No begin/commit.
--
-- ── WHAT WAS FALSE (measured on the replayed chain, 2026-10-31) ──────────────────────────
--   Two accounts, three heroes: account A has Brannoc (slot 0, Level XP 0) and Wennet
--   (slot 1, Level XP 50,000, Mining XP 20,000); account B has Osric (slot 0, Level XP 900).
--   The boards (2026-12-15-account-gold.sql §3d, the last restatement) said:
--     level        #1 'Adventurer' 900          — Wennet, the strongest hero, is on NO board
--     total_level  #1 'Adventurer' 13, #2 'Adventurer' 13
--     wealth       #1 'Adventurer' 1000, #2 'Adventurer' 500
--     skill:mining (empty)                       — Wennet's 20,000 Mining XP ranks nowhere
--   Three defects, each a lie a player would see:
--   (1) SLOT 0 ONLY. `where ps.slot = 0` / `s.slot = 0`: a board was one row per ACCOUNT,
--       built from its first hero. Since the character-session rebuild an account plays up
--       to five heroes, each with its own XP; every hero after the first never ranked.
--   (2) THE ACCOUNT'S NAME, NOT THE HERO'S. The name was profiles.display_name, else
--       'Adventurer'. Heroes are named in character_names (hr_create_hero); handle_new_user
--       writes a profile with NO display name and the rebuilt client never claims one, so
--       every row on every board read 'Adventurer'.
--   (3) WEALTH IS THE ACCOUNT PURSE (2026-12-15-account-gold.sql: one purse per account).
--       A board of heroes cannot say which hero holds it; it is cut (below).
--   Also: every row published the ranked player's account uuid (`id`) to any caller.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────────────────
--   §1 public.hr_lb_hidden — the accounts and heroes the boards leave out: reason 'test'
--      (QA and staff accounts), 'banned', or 'name' (a hero whose name is under review).
--      slot NULL = every hero of the account. Server-only: RLS on, no policy, no grant to
--      any client role. Seeded with the play-gate QA account (closed-mode §1), joined to
--      auth.users so a rebuilt database without it inserts nothing. To hide someone, the
--      Coordinator applies a one-line migration:
--        insert into public.hr_lb_hidden (user_id, slot, reason, note) values (...);
--        select public.hr_leaderboard_refresh(true);
--   §2 hr_lb_boards(): 'wealth' and 'clan_power' leave the list (game-designer, 2026-10-31):
--      wealth ranks an account, rewards hoarding against the game's gold sinks and is the
--      one ranked value another account can hand you; clans have no client in the rebuild.
--      'renown' and 'bosses' stay, declared unsourced (hr_lb_unsourced, 2026-08-18): they
--      answer ok + available:false and rank nobody. Stonemason and Bounty Hunter stay in
--      hr_lb_skills() (a fixed list other files pin) and rank nobody: no hero has the skill.
--   §3 leaderboard_ranked restated: ONE ROW PER HERO PER BOARD, keyed (board, user_id, slot);
--      name = hr_character_name(user_id, slot) (the hero's own name, else the account name,
--      numbered after slot 0, else 'Adventurer' — the same name chat and the town show);
--      `level` is the number a player reads (hr_char_level / hr_skill_level / the total);
--      `place` is the shared standing (rank(): equal scores share a place, so twenty fresh
--      heroes at Total level 13 are all 1st, not 1st to 20th by uuid); `rank` stays the strict
--      order (score desc, user_id, slot) the top list and the neighbour window page by.
--      Hidden accounts and heroes (§1) are not in it, so they hold no place.
--      Dropped columns: subject_id (now user_id + slot), clan_name, saved_at (always null).
--   §4 hr_lb_row(leaderboard_ranked, uuid) — the row shape below, in one place. Not client-
--      callable. It takes the view's row type, so a later `drop materialized view ... cascade`
--      drops it too: a restatement of the view recreates it, or the reader fails at its next call.
--   §5 hr_leaderboard__ungated restated (the A9 twin; the public wrapper is NOT touched, see
--      2026-08-18-leaderboard-server-source.sql §4, the one-way door). The answer:
--        { ok, board, available, refreshed_at, total, top: [row], mine: [row + near] }
--        row = { rank, place, name, level, score } + { mine: true, slot } on the CALLER's own
--        heroes only. No account id crosses to another player.
--        mine = every one of the caller's heroes ranked on that board (the client shows the
--        one being viewed, even when it is far off the top list), each with `near`: the rows
--        p_span either side of it (the hero to catch, and the one behind).
--      A name the CURRENT blocklist refuses is replaced by 'Name hidden' as it is read
--      (hr_name_blocked on the returned rows only: at most p_limit + 5 x (2 p_span + 1)).
--      Hero names are checked at creation, so this catches a blocklist that grew after.
--   §6 the board rebuilt now, the freshness stamp moved.
--   §7 SELF-CHECK (CLAUDE.md §4), executed, every probe rolled back.
--
-- ── REFRESH AND ITS COST (unchanged mechanism) ──────────────────────────────────────────
--   hr_leaderboard_refresh (2026-08-08 §5): the cron 'hearthrise-leaderboards' forces one
--   every 5 minutes on production (restore-census `not_observable_in_replay`), and a read
--   more than 5 minutes after the last one refreshes first, behind a non-blocking advisory
--   lock. `refresh ... concurrently` diffs, and no ranked column moves on its own (no
--   timestamps; place/level move only with the score), so a quiet refresh rewrites nothing
--   (tests/leaderboard-server-source.mjs LB-12). Rows: heroes x (2 + skills trained), about
--   15 per hero. The cost per refresh is one pass over player_state + player_skills of the
--   ranked heroes plus one hr_character_name lookup per hero; measured in the lane's commit.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────────────────
--   Read-only. Every score is a server column (player_state.level_xp, player_skills.xp); the
--   name is the server's (character_names, validated and unique at creation). No client
--   value is ranked or stamped. The answer carries less than before (no account uuid, no
--   clan). The matview and hr_lb_hidden stay unreadable by every client role.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────────────────
--   Derived data only: re-apply 2026-12-15-account-gold.sql §3d's view text and
--   2026-08-18-leaderboard-server-source.sql §4's reader body (into the __ungated twin, never
--   the public name), restore 2026-10-27-core-bodies.sql's hr_lb_boards(), and drop
--   hr_lb_hidden and hr_lb_row. Nothing a player holds moves.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.leaderboard_ranked') is null or to_regclass('public.leaderboard_meta') is null
     or to_regclass('public.character_names') is null or to_regclass('public.player_skills') is null then
    raise exception 'PRECONDITION: leaderboard_ranked / leaderboard_meta / character_names / player_skills absent'; end if;
  if to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_name_blocked(text)') is null
     or to_regprocedure('public.hr_char_level(bigint)') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_leaderboard_refresh(boolean)') is null
     or to_regprocedure('public.hr_lb_unsourced()') is null then
    raise exception 'PRECONDITION: a function this file reads is absent (hr_character_name, hr_name_blocked, '
      'hr_char_level, hr_skill_level, hr_leaderboard_refresh, hr_lb_unsourced)'; end if;
  -- The skill list is the core rebuild's with Inner Flame (2027-01-31-total-level-flame.sql).
  if not ('inner_flame' = any (public.hr_lb_skills())) then
    raise exception 'PRECONDITION: hr_lb_skills() does not name inner_flame; apply 2027-01-31-total-level-flame.sql first'; end if;
  -- The A9 door: the public name is the rate-gated wrapper over the twin this file replaces.
  select prosrc into v_src from pg_proc where oid = 'public.hr_leaderboard(text,integer,integer)'::regprocedure;
  if v_src is null or strpos(v_src, 'hr_rpc_gate') = 0 or strpos(v_src, 'hr_leaderboard__ungated') = 0 then
    raise exception 'PRECONDITION: public.hr_leaderboard is not the A9 wrapper over hr_leaderboard__ungated'; end if;
  -- The reader's pre-image: 2026-08-18-leaderboard-server-source.sql §4, or this file's own body.
  select prosrc into v_src from pg_proc where oid = 'public.hr_leaderboard__ungated(text,integer,integer)'::regprocedure;
  if md5(v_src) <> 'ab25f8d7603e8bc002031bdbaa93f699' and strpos(v_src, 'hr_lb_row(') = 0 then
    raise exception 'PIN: hr_leaderboard__ungated moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_lb_boards()'::regprocedure;
  if md5(v_src) <> '9c37419cd6ffdef1d47fdf674a092c77' and strpos(v_src, 'clan_power') > 0 then
    raise exception 'PIN: hr_lb_boards moved (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE ACCOUNTS AND HEROES THE BOARDS LEAVE OUT ─────────────────────────────────────
create table if not exists public.hr_lb_hidden (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  slot     int         check (slot is null or slot between 0 and 5),
  reason   text        not null check (reason in ('test', 'banned', 'name')),
  note     text        not null check (length(note) between 1 and 120),
  added_at timestamptz not null default now()
);
create unique index if not exists hr_lb_hidden_one on public.hr_lb_hidden (user_id, coalesce(slot, -1));
alter table public.hr_lb_hidden enable row level security;
do $mig$
declare r text;
begin
  revoke all on public.hr_lb_hidden from public;
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.hr_lb_hidden from %I', r);
    end if;
  end loop;
end $mig$;
comment on table public.hr_lb_hidden is
  '2027-02-12-leaderboard-heroes.sql: accounts (slot null) and heroes the leaderboards leave out (test, banned, name). '
  'Server-only; the Coordinator writes it by migration and refreshes the boards.';

insert into public.hr_lb_hidden (user_id, slot, reason, note)
select v.user_id, null, 'test', v.note
  from (values ('0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid, 'QA account (play gate)')) v (user_id, note)
  join auth.users u on u.id = v.user_id
 where not exists (select 1 from public.hr_lb_hidden h where h.user_id = v.user_id and h.slot is null);

-- ── §2 THE BOARD LIST: wealth and clan_power are cut ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_lb_boards()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array['renown','total_level','level','bosses']
      || array(select 'skill:' || s from unnest(public.hr_lb_skills()) s)
$function$;

-- ── §3 THE RANKED VIEW: one row per hero per board ──────────────────────────────────────
drop materialized view if exists public.leaderboard_ranked cascade;
create materialized view public.leaderboard_ranked as
with heroes as (
  select ps.user_id, ps.slot, ps.level_xp,
         public.hr_character_name(ps.user_id, ps.slot) as name
  from public.player_state ps
  where not exists (select 1 from public.hr_lb_hidden h
                     where h.user_id = ps.user_id and (h.slot is null or h.slot = ps.slot))
),
lv as (
  select s.user_id, s.slot, s.skill_id, s.xp, public.hr_skill_level(s.skill_id, s.xp) as level
  from public.player_skills s
  join heroes h on h.user_id = s.user_id and h.slot = s.slot
  where s.skill_id = any (public.hr_lb_skills())
),
agg as (
  select h.user_id, h.slot, coalesce(sum(l.level), 0)::bigint as total_level
  from heroes h
  left join lv l on l.user_id = h.user_id and l.slot = h.slot
  group by h.user_id, h.slot
),
scores as (
  select 'total_level'::text as board, h.user_id, h.slot, h.name,
         a.total_level as score, a.total_level::int as level
  from heroes h join agg a on a.user_id = h.user_id and a.slot = h.slot
  union all
  select 'level', h.user_id, h.slot, h.name, h.level_xp, public.hr_char_level(h.level_xp)
  from heroes h
  union all
  select 'skill:' || l.skill_id, l.user_id, l.slot, h.name, l.xp, l.level
  from lv l join heroes h on h.user_id = l.user_id and h.slot = l.slot
  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (§2).
)
select board, user_id, slot, name, score, level,
       rank() over (partition by board order by score desc) as place,
       row_number() over (partition by board order by score desc, user_id, slot) as rank
from scores
where score is not null
  and score > 0;
create unique index if not exists leaderboard_ranked_hero_idx on public.leaderboard_ranked (board, user_id, slot);
create index if not exists leaderboard_ranked_rank_idx on public.leaderboard_ranked (board, rank);
revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;

-- ── §4 ONE ROW SHAPE ────────────────────────────────────────────────────────────────────
-- (Before §5: the reader names it.) A name the current blocklist refuses never leaves the
-- server; the caller's own heroes carry their slot so the client can mark the one it shows.
create or replace function public.hr_lb_row(r public.leaderboard_ranked, p_viewer uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
           'rank', r.rank, 'place', r.place,
           'name', case when public.hr_name_blocked(r.name) then 'Name hidden' else r.name end,
           'level', r.level, 'score', r.score)
         || case when p_viewer is not null and r.user_id = p_viewer
                 then jsonb_build_object('mine', true, 'slot', r.slot) else '{}'::jsonb end
$$;
revoke all on function public.hr_lb_row(public.leaderboard_ranked, uuid) from public, anon, authenticated, service_role;

-- ── §5 THE READER (the A9 twin; the public wrapper is untouched) ────────────────────────
create or replace function public.hr_leaderboard__ungated(
  p_board text,
  p_limit int default 25,
  p_span  int default 1
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_span  int := least(greatest(coalesce(p_span, 1), 0), 5);
  v_uid   uuid := auth.uid();
  v_at    timestamptz;
  v_total bigint;
  v_top   jsonb;
  v_mine  jsonb;
begin
  if p_board is null or not (p_board = any (public.hr_lb_boards())) then
    return jsonb_build_object('ok', false, 'error', 'unknown_board');
  end if;

  select refreshed_at into v_at from public.leaderboard_meta where id = 1;

  -- An unsourced board answers honestly and cheaply: ok, empty, flagged, no refresh.
  if p_board = any (public.hr_lb_unsourced()) then
    return jsonb_build_object(
      'ok', true, 'board', p_board, 'refreshed_at', v_at, 'total', 0,
      'top', '[]'::jsonb, 'mine', '[]'::jsonb,
      'available', false, 'unavailable', 'no_server_source');
  end if;

  -- Opportunistic: a no-op unless the boards are more than five minutes old, and never
  -- allowed to take the READ down with it.
  begin
    perform public.hr_leaderboard_refresh(false);
  exception when others then null;
  end;
  select refreshed_at into v_at from public.leaderboard_meta where id = 1;

  select count(*) into v_total from public.leaderboard_ranked where board = p_board;

  select jsonb_agg(public.hr_lb_row(t.r, v_uid) order by (t.r).rank)
    into v_top
    from (select r from public.leaderboard_ranked r
           where r.board = p_board order by r.rank limit v_limit) t;

  -- Every one of the caller's ranked heroes, each with the rows p_span either side of it.
  if v_uid is not null then
    select jsonb_agg(public.hr_lb_row(m, v_uid) || jsonb_build_object('near',
             coalesce((select jsonb_agg(public.hr_lb_row(n, v_uid) order by n.rank)
                         from public.leaderboard_ranked n
                        where n.board = p_board
                          and n.rank between m.rank - v_span and m.rank + v_span), '[]'::jsonb))
           order by m.slot)
      into v_mine
      from public.leaderboard_ranked m
     where m.board = p_board and m.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true, 'board', p_board, 'available', true, 'refreshed_at', v_at,
    'total', coalesce(v_total, 0),
    'top', coalesce(v_top, '[]'::jsonb),
    'mine', coalesce(v_mine, '[]'::jsonb));
end $$;
revoke all on function public.hr_leaderboard__ungated(text, int, int)
  from public, anon, authenticated, service_role;

-- ── §6 THE BOARD, REBUILT NOW ───────────────────────────────────────────────────────────
refresh materialized view public.leaderboard_ranked;
update public.leaderboard_meta set refreshed_at = now() where id = 1;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────────────────
do $mig$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-00000ead0001';
  v_b  constant uuid := '000000c0-0000-4000-a000-00000ead0002';
  v_role text; v jsonb; v_row jsonb; v_n int; v_src text;
  v_na text; v_na2 text; v_nb text; v_bad text; v_stem text;
  v_place_a bigint; v_place_b bigint; v_rank_a bigint; v_rank_b bigint;
begin
  -- (a) THE SOURCES, read off pg_depend (the object, not the text): heroes and their names,
  --     never the save blob; and no client role can read the view or the hide list.
  if not exists (select 1 from pg_depend d join pg_rewrite rw on rw.oid = d.objid
                  where d.classid = 'pg_rewrite'::regclass and rw.ev_class = 'public.leaderboard_ranked'::regclass
                    and d.refobjid = 'public.player_state'::regclass)
     or not exists (select 1 from pg_depend d join pg_rewrite rw on rw.oid = d.objid
                  where d.classid = 'pg_rewrite'::regclass and rw.ev_class = 'public.leaderboard_ranked'::regclass
                    and d.refobjid = 'public.hr_lb_hidden'::regclass) then
    raise exception 'leaderboard-heroes §7(a): the view does not read player_state and hr_lb_hidden (the probe is blind)'; end if;
  if exists (select 1 from pg_depend d join pg_rewrite rw on rw.oid = d.objid
              where d.classid = 'pg_rewrite'::regclass and rw.ev_class = 'public.leaderboard_ranked'::regclass
                and d.refobjid in ('public.game_saves'::regclass, 'public.account_wallet'::regclass)) then
    raise exception 'leaderboard-heroes §7(a): the view reads game_saves or the account purse'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.leaderboard_ranked', 'select')
       or has_table_privilege(v_role, 'public.hr_lb_hidden', 'select')
       or has_table_privilege(v_role, 'public.hr_lb_hidden', 'insert')
       or has_function_privilege(v_role, 'public.hr_leaderboard__ungated(text,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_lb_row(public.leaderboard_ranked,uuid)', 'execute') then
      raise exception 'leaderboard-heroes §7(a): % can read the view / the hide list or call the twin / hr_lb_row', v_role; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_lb_hidden'::regclass) then
    raise exception 'leaderboard-heroes §7(a): hr_lb_hidden has no RLS'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_leaderboard(text,integer,integer)'::regprocedure;
  if strpos(v_src, 'hr_rpc_gate') = 0 or strpos(v_src, 'hr_leaderboard__ungated') = 0 then
    raise exception 'leaderboard-heroes §7(a): the public hr_leaderboard is no longer the A9 wrapper'; end if;

  -- (b) THE CUT BOARDS: unknown, and nothing ranks on them.
  if 'wealth' = any (public.hr_lb_boards()) or 'clan_power' = any (public.hr_lb_boards())
     or not ('level' = any (public.hr_lb_boards())) or not ('skill:inner_flame' = any (public.hr_lb_boards())) then
    raise exception 'leaderboard-heroes §7(b): hr_lb_boards() is %', public.hr_lb_boards(); end if;
  if exists (select 1 from public.leaderboard_ranked where board in ('wealth', 'clan_power', 'renown', 'bosses')) then
    raise exception 'leaderboard-heroes §7(b): a cut or unsourced board ranks someone'; end if;

  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'leaderboard-heroes §7')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'leaderboard-heroes §7'), (v_b, 'leaderboard-heroes §7')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'leaderboard-heroes §7: hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'leaderboard-heroes §7: hr_create_character(1) refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'leaderboard-heroes §7: hr_create_character(0) for B refused: %', v; end if;
    -- Probe names generated per run and checked absent: never a real hero's name.
    loop
      v_na := 'Zq' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_na2 := 'Zr' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      v_nb := 'Zs' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      exit when not exists (select 1 from public.character_names
                             where canonical in (public.hr_canon_display_name(v_na), public.hr_canon_display_name(v_na2),
                                                 public.hr_canon_display_name(v_nb)));
    end loop;
    insert into public.character_names (user_id, slot, name, canonical) values
      (v_a, 0, v_na, public.hr_canon_display_name(v_na)), (v_a, 1, v_na2, public.hr_canon_display_name(v_na2)),
      (v_b, 0, v_nb, public.hr_canon_display_name(v_nb))
      on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical;
    -- Server-side scores, written as the settle writes them: A's SECOND hero is the strong one;
    -- A's first and B's hero tie on Mining (a value no real hero is likely to hold, though a tie
    -- with one would not change the assertion: equal scores share a place).
    update public.player_state set level_xp = 50000 where user_id = v_a and slot = 1;
    update public.player_state set level_xp = 900 where user_id = v_b and slot = 0;
    update public.player_skills set xp = 20011 where user_id = v_a and slot = 1 and skill_id = 'mining';
    update public.player_skills set xp = 7919 where (user_id, slot) in ((v_a, 0), (v_b, 0)) and skill_id = 'mining';
    refresh materialized view public.leaderboard_ranked;
    update public.leaderboard_meta set refreshed_at = now() where id = 1;

    -- (c) EVERY HERO RANKS, under its own name, with the level a player reads.
    if not exists (select 1 from public.leaderboard_ranked where board = 'level' and user_id = v_a and slot = 1
                    and name = v_na2 and score = 50000 and level = public.hr_char_level(50000)) then
      raise exception 'leaderboard-heroes §7(c): the slot-1 hero is not on the Level board by its own name'; end if;
    if exists (select 1 from public.leaderboard_ranked where board = 'level' and user_id = v_a and slot = 0) then
      raise exception 'leaderboard-heroes §7(c): a hero with 0 Level XP ranks on the Level board'; end if;
    if (select count(*) from public.leaderboard_ranked where board = 'total_level' and user_id = v_a) <> 2 then
      raise exception 'leaderboard-heroes §7(c): account A''s two heroes are not two Total level rows'; end if;
    if not exists (select 1 from public.leaderboard_ranked where board = 'skill:mining' and user_id = v_a and slot = 1
                    and score = 20011 and level = public.hr_skill_level('mining', 20011)) then
      raise exception 'leaderboard-heroes §7(c): the slot-1 hero''s Mining XP does not rank'; end if;
    if exists (select 1 from public.leaderboard_ranked where user_id in (v_a, v_b) and name = 'Adventurer') then
      raise exception 'leaderboard-heroes §7(c): a named hero ranks as Adventurer'; end if;
    -- (d) TIES SHARE A PLACE; the strict rank still orders them.
    select place, rank into v_place_a, v_rank_a from public.leaderboard_ranked where board = 'skill:mining' and user_id = v_a and slot = 0;
    select place, rank into v_place_b, v_rank_b from public.leaderboard_ranked where board = 'skill:mining' and user_id = v_b and slot = 0;
    if v_place_a is null or v_place_a <> v_place_b or v_rank_a = v_rank_b then
      raise exception 'leaderboard-heroes §7(d): tied heroes hold places %/% and ranks %/%', v_place_a, v_place_b, v_rank_a, v_rank_b; end if;

    -- (e) THE READER, as account A: no account id on any row; the caller's heroes are marked and
    --     listed in `mine` with their neighbours; the cut and unsourced boards answer honestly.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_leaderboard__ungated('skill:mining', 100, 1);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'available', '') <> 'true' or v->'refreshed_at' is null then
      raise exception 'leaderboard-heroes §7(e): the reader answered %', left(v::text, 300); end if;
    if exists (select 1 from jsonb_array_elements(v->'top') e
                where e ? 'id' or e ? 'user_id' or e ? 'clan'
                   or ((e ? 'slot' or e ? 'mine') and not coalesce((e->>'mine')::boolean, false))) then
      raise exception 'leaderboard-heroes §7(e): a top row carries an account id, a clan, or another player''s slot'; end if;
    if jsonb_array_length(v->'mine') <> 2
       or (v->'mine'->0->>'slot')::int <> 0 or (v->'mine'->1->>'slot')::int <> 1
       or v->'mine'->1->>'name' <> v_na2 or (v->'mine'->1->>'score')::bigint <> 20011
       or jsonb_array_length(v->'mine'->1->'near') < 1 then
      raise exception 'leaderboard-heroes §7(e): mine is %', left((v->'mine')::text, 400); end if;
    if exists (select 1 from jsonb_array_elements(v->'mine'->0->'near') e
                where e->>'name' = v_nb and (e ? 'slot' or e ? 'mine')) then
      raise exception 'leaderboard-heroes §7(e): B''s hero is marked as the caller''s'; end if;
    v := public.hr_leaderboard__ungated('wealth', 25, 1);
    if v->>'error' is distinct from 'unknown_board' then
      raise exception 'leaderboard-heroes §7(e): wealth answered %', v; end if;
    v := public.hr_leaderboard__ungated('clan_power', 25, 1);
    if v->>'error' is distinct from 'unknown_board' then
      raise exception 'leaderboard-heroes §7(e): clan_power answered %', v; end if;
    v := public.hr_leaderboard__ungated('renown', 25, 1);
    if coalesce(v->>'ok', '') <> 'true' or v->>'available' <> 'false' or jsonb_array_length(v->'top') <> 0 then
      raise exception 'leaderboard-heroes §7(e): renown answered %', v; end if;

    -- (f) A NAME THE BLOCKLIST REFUSES NEVER LEAVES THE SERVER (written past the creation check,
    --     as a blocklist that grew after the hero was named would leave it).
    select b.stem into v_stem from public.hr_name_blocklist b
     where b.match = 'substring' and length(b.stem) between 3 and 12 order by length(b.stem), b.stem limit 1;
    if v_stem is null then raise exception 'leaderboard-heroes §7(f): the blocklist has no substring stem (fixture)'; end if;
    v_bad := initcap(v_stem) || 'qz';
    if not public.hr_name_blocked(v_bad) then
      raise exception 'leaderboard-heroes §7(f) (the FIXTURE control): the probe name is not blocked'; end if;
    update public.character_names set name = v_bad, canonical = public.hr_canon_display_name(v_bad) where user_id = v_b and slot = 0;
    refresh materialized view public.leaderboard_ranked;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_leaderboard__ungated('skill:mining', 100, 1);
    if strpos(v::text, v_bad) > 0 or v->'mine'->0->>'name' <> 'Name hidden' then
      raise exception 'leaderboard-heroes §7(f): a blocked name reached the answer'; end if;

    -- (g) HIDDEN: a hidden hero holds no place; a hidden account has no row at all.
    insert into public.hr_lb_hidden (user_id, slot, reason, note) values (v_a, 1, 'name', 'leaderboard-heroes §7');
    insert into public.hr_lb_hidden (user_id, slot, reason, note) values (v_b, null, 'test', 'leaderboard-heroes §7');
    refresh materialized view public.leaderboard_ranked;
    if exists (select 1 from public.leaderboard_ranked where user_id = v_b)
       or exists (select 1 from public.leaderboard_ranked where user_id = v_a and slot = 1) then
      raise exception 'leaderboard-heroes §7(g): a hidden hero or account still ranks'; end if;
    if not exists (select 1 from public.leaderboard_ranked where board = 'total_level' and user_id = v_a and slot = 0) then
      raise exception 'leaderboard-heroes §7(g) (the CONTROL): hiding one hero took the account''s other hero with it'; end if;

    raise exception 'leaderboard-heroes §7 rollback';
  exception when others then
    if sqlerrm <> 'leaderboard-heroes §7 rollback' then raise; end if;
  end;

  -- (h) THE PROBES ARE GONE.
  if exists (select 1 from public.leaderboard_ranked where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b))
     or exists (select 1 from public.hr_lb_hidden where note = 'leaderboard-heroes §7') then
    raise exception 'leaderboard-heroes §7(h): a probe row survived'; end if;
end $mig$;
