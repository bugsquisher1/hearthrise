-- ============================================================
-- Hearthrise — migration 2026-08-08 · LEADERBOARDS (backlog #11, Wave 3)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing table, view, policy
-- or function belonging to another system is dropped or altered. The two
-- existing views (public.leaderboard, public.clan_leaderboard) are left exactly
-- as they are, because the pre-migration client still reads them.
--
-- WHAT THIS IS
--   The leaderboard grew from three boards to twenty, and every one of them
--   must answer the question the old one could not: "where am I?". A player
--   ranked #412 saw fifteen strangers and no sign of themselves. That is the
--   single most demotivating thing a leaderboard can do (leaderboards.md §1).
--
--   Answering it cheaply is the whole design problem. `select count(*) from
--   leaderboard where total_level > :mine` is a full scan per view per player,
--   and it has to happen on twenty boards. So the ranks are computed ONCE, in
--   a materialized view, in LONG format:
--
--       (board, subject_id, name, clan_name, score, rank, saved_at)
--
--   One row per player per board. That single shape means:
--     • top N          → where board = $1 and rank <= 25      (index scan)
--     • your rank      → where board = $1 and subject_id = me  (index scan)
--     • your rivals    → where board = $1 and rank between r-1 and r+1
--   …are all O(log n) at any player count, and adding board #21 later is one
--   more UNION branch — no schema change, no new index, no client change.
--
--   At 10k players × 20 boards the view is ~200k narrow rows: a refresh is
--   well under a second and the whole thing fits comfortably in cache.
--
-- WHY RANK IS A STRICT TOTAL ORDER
--   The window is `row_number() over (partition by board order by score desc,
--   subject_id)`. Ties are broken by subject_id, so ranks are 1..N with no
--   gaps and no shared positions. That is what makes "the rival directly above
--   you" a single, always-present row rather than an ambiguous set — the entire
--   retention hook depends on there being exactly one person to catch.
--
-- FRESHNESS
--   Boards are NOT real-time and do not need to be. hr_leaderboard() refreshes
--   the view opportunistically when it is more than five minutes stale, behind
--   a non-blocking advisory lock so exactly one caller pays for it and everyone
--   else reads the slightly-stale copy. Every response carries `refreshed_at`
--   so the client can stamp "updated 2m ago" instead of implying live data.
--   If pg_cron is available the same function is also scheduled; if it is not
--   (Supabase free tier), the opportunistic path alone keeps boards current.
--
-- CLIENT-FIRST COMPATIBILITY — read before running:
--   • Every object created here is NEW. A client built before this migration is
--     completely unaffected.
--   • The b222 client FEATURE-DETECTS hr_leaderboard (404 / PGRST202 →
--     'unsupported') and degrades to the pre-migration behaviour: the three
--     boards the old `leaderboard` view can serve (Total Level, Combat, Wealth)
--     plus Clan Power, with self-rank derived from a PostgREST exact-count
--     query. The boards that need data the old view does not carry (Throne,
--     the fifteen skills, Bosses) are simply not offered until the server can
--     serve them honestly.
--     → THE CLIENT MAY SHIP FIRST. Ship b222, then run this file.
--
-- DEPENDS ON THE CLIENT WRITING THREE SNAPSHOT FIELDS (b222 src/net/sync.js):
--     snapshot.renown      — computeRenown(G), the Throne board's score
--     snapshot.combatLevel — the existing `leaderboard` view already reads this
--                            and NOTHING had ever written it, so combat_level
--                            was null for every player on every row
--     snapshot.bossKills   — boss kills summed over the client's MONSTERS table
--   A player who has not yet saved on b222 simply does not appear on those
--   three boards (score is null → excluded). No fabricated zeroes.
--
-- ECONOMY GUARANTEE
--   Nothing here grants anything. There is no claim, no ledger, no currency and
--   no code path that names gold, gems or hearth_token. Ranking is prestige:
--   the client draws titles from rank alone, which cannot be forged because the
--   rank is computed here. Seasonal gem awards and the "Climbers" board
--   (leaderboards.md §5–6) need a claim ledger and a season baseline table and
--   are deliberately NOT in this file — they will land as their own migration
--   rather than as a half-built economy.
-- ============================================================

-- ── 0. Preconditions ──────────────────────────────────────────
do $$
begin
  if to_regclass('public.game_saves') is null then
    raise exception 'public.game_saves is missing — run supabase/schema.sql first';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing — run supabase/schema.sql first';
  end if;
  if to_regclass('public.clans') is null then
    raise exception 'public.clans is missing — run supabase/schema.sql first';
  end if;
end $$;

-- ── 1. Safe numeric extraction ────────────────────────────────
-- A save snapshot is player-authored JSON. `(snapshot->>'gold')::bigint` throws
-- on a float, on a string, on null and on absent — and one such row would take
-- the entire materialized view down with it. This returns NULL instead, which
-- the view then filters out: a malformed save costs its owner a board entry,
-- never the board.
create or replace function public.hr_lb_num(p_obj jsonb, p_key text)
returns bigint language sql immutable as $$
  select case
    when p_obj is not null
     and jsonb_typeof(p_obj) = 'object'
     and p_obj ? p_key
     and (p_obj->>p_key) ~ '^-?[0-9]+(\.[0-9]+)?$'
    then floor((p_obj->>p_key)::numeric)::bigint
  end
$$;

-- ── 2. The board namespace ────────────────────────────────────
-- The closed list of board keys. It is a function rather than a table so there
-- is no row to forget to insert, and it is the single place both the reader RPC
-- and the view agree on what a board is. The fifteen skill ids MUST match
-- src/data/skills.js SKILLS_DEF (note the camelCase `bountyHunter`).
create or replace function public.hr_lb_skills()
returns text[] language sql immutable as $$
  select array[
    'attack','strength','defense','hitpoints','prayer','magic','ranged',
    'woodcutting','mining','fishing','farming',
    'cooking','crafting','smithing','bountyHunter'
  ]
$$;

create or replace function public.hr_lb_boards()
returns text[] language sql stable as $$
  select array['renown','total_level','combat_level','wealth','bosses','clan_power']
      || array(select 'skill:' || s from unnest(public.hr_lb_skills()) s)
$$;

-- ── 3. The ranked board (materialized) ────────────────────────
-- Dropped and recreated rather than `if not exists`, so re-running this file
-- after a board is added actually updates the definition. It holds only derived
-- data — there is nothing here that cannot be rebuilt from game_saves and clans
-- in one statement, so dropping it loses nothing.
drop materialized view if exists public.leaderboard_ranked cascade;

create materialized view public.leaderboard_ranked as
with base as (
  select gs.user_id,
         gs.snapshot,
         gs.saved_at,
         coalesce(p.display_name, gs.snapshot->>'playerName', 'Adventurer') as name,
         c.name as clan_name
  from public.game_saves gs
  left join public.profiles p on p.id = gs.user_id
  left join public.clans    c on c.id = p.clan_id
  where gs.slot = 0
),
scores as (
  select 'total_level'::text as board, b.user_id as subject_id, b.name, b.clan_name,
         public.hr_lb_num(b.snapshot, 'totalLevel') as score, b.saved_at
  from base b
  union all
  select 'combat_level', b.user_id, b.name, b.clan_name,
         public.hr_lb_num(b.snapshot, 'combatLevel'), b.saved_at from base b
  union all
  select 'wealth', b.user_id, b.name, b.clan_name,
         public.hr_lb_num(b.snapshot, 'gold'), b.saved_at from base b
  union all
  select 'renown', b.user_id, b.name, b.clan_name,
         public.hr_lb_num(b.snapshot, 'renown'), b.saved_at from base b
  union all
  select 'bosses', b.user_id, b.name, b.clan_name,
         public.hr_lb_num(b.snapshot, 'bossKills'), b.saved_at from base b
  union all
  -- One lateral over the skills object covers all fifteen per-skill boards.
  -- Filtering against hr_lb_skills() keeps the board namespace CLOSED: a save
  -- carrying a junk skill key cannot invent a board.
  select 'skill:' || s.key, b.user_id, b.name, b.clan_name,
         public.hr_lb_num(coalesce(b.snapshot->'skills', '{}'::jsonb), s.key), b.saved_at
  from base b
  cross join lateral jsonb_each_text(
    case when jsonb_typeof(b.snapshot->'skills') = 'object'
         then b.snapshot->'skills' else '{}'::jsonb end
  ) as s(key, value)
  where s.key = any (public.hr_lb_skills())
  union all
  -- Clans are ranked by castle tier first, treasury second — the composite
  -- keeps the whole board in one integer column so clans share the exact same
  -- rank/neighbour machinery as players. `subject_id` is the CLAN id here,
  -- which is why the column is not called user_id.
  select 'clan_power', c.id, c.name, c.name,
         (coalesce(c.castle_tier, 0)::bigint * 1000000000)
           + least(greatest(coalesce(c.treasury, 0), 0), 999999999)::bigint,
         null::timestamptz
  from public.clans c
)
select board,
       subject_id,
       name,
       clan_name,
       score,
       saved_at,
       row_number() over (partition by board order by score desc, subject_id) as rank
from scores
where score is not null
  and score > 0;

-- CONCURRENTLY needs a unique index; (board, subject_id) is also exactly the
-- lookup "what is my rank on this board".
create unique index if not exists leaderboard_ranked_subject_idx
  on public.leaderboard_ranked (board, subject_id);
-- Top-N and the neighbour window.
create index if not exists leaderboard_ranked_rank_idx
  on public.leaderboard_ranked (board, rank);

grant select on public.leaderboard_ranked to anon, authenticated;

-- ── 4. Freshness bookkeeping ──────────────────────────────────
create table if not exists public.leaderboard_meta (
  id           int primary key default 1 check (id = 1),
  refreshed_at timestamptz not null default now()
);
insert into public.leaderboard_meta (id, refreshed_at)
  values (1, now()) on conflict (id) do nothing;
alter table public.leaderboard_meta enable row level security;
drop policy if exists "leaderboard meta readable" on public.leaderboard_meta;
create policy "leaderboard meta readable" on public.leaderboard_meta
  for select using (true);
-- No write policy: the refresh function is security definer and is the only
-- writer, so a client cannot claim the boards are fresher than they are.

-- ── 5. Refresh ────────────────────────────────────────────────
-- Non-blocking by design. If another connection is already refreshing we return
-- immediately with the stale timestamp rather than queueing — a leaderboard
-- read must never wait on a leaderboard write.
-- Two things here are deliberate and worth reading before editing:
--
--  1. THE CONCURRENT REFRESH IS ATTEMPTED, NOT ASSUMED. `refresh materialized
--     view concurrently` is the one we want (readers are never blocked), but
--     whether it is permitted from inside a function depends on the server, and
--     a leaderboard must not be hostage to that. If it refuses, we fall back to
--     the plain refresh, which is unambiguously allowed in a transaction and
--     costs a brief exclusive lock on a view that rebuilds in well under a
--     second. If BOTH refuse we return the stale timestamp and the boards keep
--     serving yesterday's ranks — degraded, never broken.
--  2. THE ADVISORY LOCK IS ALWAYS RELEASED. Every exit path unlocks; a leaked
--     session lock would freeze refreshes until that connection was recycled.
create or replace function public.hr_leaderboard_refresh(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_stale constant interval := interval '5 minutes';
  c_lock  constant bigint   := 811951001;   -- arbitrary, fixed: the boards' lock
  v_at  timestamptz;
  v_err text;
begin
  select refreshed_at into v_at from public.leaderboard_meta where id = 1;
  if not coalesce(p_force, false) and v_at is not null and now() - v_at < c_stale then
    return jsonb_build_object('ok', true, 'refreshed', false, 'refreshed_at', v_at);
  end if;

  if not pg_try_advisory_lock(c_lock) then
    return jsonb_build_object('ok', true, 'refreshed', false, 'busy', true, 'refreshed_at', v_at);
  end if;

  begin
    refresh materialized view concurrently public.leaderboard_ranked;
  exception when others then
    v_err := sqlerrm;
    begin
      refresh materialized view public.leaderboard_ranked;
      v_err := null;
    exception when others then
      v_err := v_err || ' / ' || sqlerrm;
    end;
  end;

  if v_err is null then
    update public.leaderboard_meta set refreshed_at = now() where id = 1;
    perform pg_advisory_unlock(c_lock);
    return jsonb_build_object('ok', true, 'refreshed', true, 'refreshed_at', now());
  end if;

  perform pg_advisory_unlock(c_lock);
  return jsonb_build_object('ok', true, 'refreshed', false, 'error', v_err, 'refreshed_at', v_at);
end $$;
-- anon may trigger it: the boards are public, and the five-minute gate plus the
-- advisory lock bound the cost to one refresh per five minutes no matter how
-- many callers there are.
grant execute on function public.hr_leaderboard_refresh(boolean) to anon, authenticated;

-- ── 6. The reader — one round trip per board ──────────────────
-- Returns the honour roll AND the self block in a single call, because they are
-- always rendered together and two calls would mean two chances to disagree
-- about which refresh they came from.
create or replace function public.hr_leaderboard(
  p_board text,
  p_limit int default 25,
  p_span  int default 1
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit   int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_span    int := least(greatest(coalesce(p_span, 1), 0), 5);
  v_subject uuid;
  v_at      timestamptz;
  v_total   bigint;
  v_rank    bigint;
  v_top     jsonb;
  v_near    jsonb;
begin
  if p_board is null or not (p_board = any (public.hr_lb_boards())) then
    return jsonb_build_object('ok', false, 'error', 'unknown_board');
  end if;

  -- Opportunistic: a no-op unless the boards are more than five minutes old,
  -- and never allowed to take the READ down with it. A stale board is a small
  -- disappointment; a board that errors is a broken screen.
  begin
    perform public.hr_leaderboard_refresh(false);
  exception when others then null;
  end;
  select refreshed_at into v_at from public.leaderboard_meta where id = 1;

  -- On a clan board "you" is your clan. Everywhere else it is you.
  if p_board = 'clan_power' then
    select clan_id into v_subject from public.profiles where id = auth.uid();
  else
    v_subject := auth.uid();
  end if;

  select count(*) into v_total from public.leaderboard_ranked where board = p_board;

  select jsonb_agg(jsonb_build_object(
           'rank', t.rank, 'id', t.subject_id, 'name', t.name,
           'clan', t.clan_name, 'score', t.score, 'saved_at', t.saved_at
         ) order by t.rank)
    into v_top
    from (select * from public.leaderboard_ranked
           where board = p_board order by rank limit v_limit) t;

  if v_subject is not null then
    select rank into v_rank from public.leaderboard_ranked
      where board = p_board and subject_id = v_subject;
  end if;

  if v_rank is not null then
    select jsonb_agg(jsonb_build_object(
             'rank', t.rank, 'id', t.subject_id, 'name', t.name,
             'clan', t.clan_name, 'score', t.score, 'saved_at', t.saved_at
           ) order by t.rank)
      into v_near
      from (select * from public.leaderboard_ranked
             where board = p_board
               and rank between v_rank - v_span and v_rank + v_span
             order by rank) t;
  end if;

  return jsonb_build_object(
    'ok', true, 'board', p_board, 'refreshed_at', v_at, 'total', coalesce(v_total, 0),
    'top', coalesce(v_top, '[]'::jsonb),
    'rank', v_rank,
    'near', coalesce(v_near, '[]'::jsonb)
  );
end $$;
grant execute on function public.hr_leaderboard(text, int, int) to anon, authenticated;

-- ── 7. Scheduled refresh, if this project has pg_cron ─────────
-- Optional. Wrapped so a project without the extension (or without rights to
-- create it) applies the rest of the migration cleanly — the opportunistic
-- refresh in §6 is the guaranteed path, and this is the nicety.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%) — boards will refresh opportunistically instead.', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('hearthrise-leaderboards');
  exception when others then null;
  end;
  perform cron.schedule('hearthrise-leaderboards', '*/5 * * * *',
                        'select public.hr_leaderboard_refresh(true)');
  raise notice 'pg_cron scheduled: leaderboards refresh every 5 minutes.';
exception when others then
  raise notice 'pg_cron scheduling skipped (%) — opportunistic refresh still applies.', sqlerrm;
end $$;

-- ── 8. Self-check ─────────────────────────────────────────────
-- Asserts the migration actually took, that the board namespace is the size the
-- client expects, and that the reader answers. Raises loudly rather than
-- leaving half a leaderboard behind.
do $$
declare
  v_boards text[];
  v_out jsonb;
begin
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'leaderboard_ranked missing';
  end if;
  if to_regclass('public.leaderboard_meta') is null then
    raise exception 'leaderboard_meta missing';
  end if;

  v_boards := public.hr_lb_boards();
  if array_length(v_boards, 1) <> 21 then
    raise exception 'expected 21 boards (6 + 15 skills), got %', array_length(v_boards, 1);
  end if;
  if not ('skill:bountyHunter' = any (v_boards)) then
    raise exception 'skill ids must match SKILLS_DEF exactly (camelCase bountyHunter)';
  end if;

  -- Malformed snapshot values must yield NULL, never an exception.
  if public.hr_lb_num('{"gold":"lots"}'::jsonb, 'gold') is not null then
    raise exception 'hr_lb_num must reject non-numeric values';
  end if;
  if public.hr_lb_num('{"gold":12.7}'::jsonb, 'gold') <> 12 then
    raise exception 'hr_lb_num must floor fractional values';
  end if;
  if public.hr_lb_num('{}'::jsonb, 'gold') is not null then
    raise exception 'hr_lb_num must return null for an absent key';
  end if;

  v_out := public.hr_leaderboard('total_level', 25, 1);
  if (v_out->>'ok')::boolean is not true then
    raise exception 'hr_leaderboard(total_level) failed: %', v_out;
  end if;
  if jsonb_typeof(v_out->'top') <> 'array' then
    raise exception 'hr_leaderboard must return a top array';
  end if;

  v_out := public.hr_leaderboard('skill:mining', 25, 1);
  if (v_out->>'ok')::boolean is not true then
    raise exception 'hr_leaderboard(skill:mining) failed: %', v_out;
  end if;

  v_out := public.hr_leaderboard('not_a_board', 25, 1);
  if (v_out->>'error') <> 'unknown_board' then
    raise exception 'unknown boards must be refused, got %', v_out;
  end if;

  -- Ranks must be a strict total order: no ties, no gaps, per board.
  if exists (
    select 1 from (
      select board, count(*) as n, count(distinct rank) as d, max(rank) as m
      from public.leaderboard_ranked group by board
    ) q where q.n <> q.d or q.m <> q.n
  ) then
    raise exception 'rank must be 1..N with no ties and no gaps';
  end if;

  raise notice 'LEADERBOARDS migration OK — % boards, ranked view and reader verified.',
    array_length(v_boards, 1);
end $$;
