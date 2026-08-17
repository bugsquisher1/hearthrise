-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-18-leaderboard-server-source.sql
--   SECURITY CONDITION S2 — THE BOARDS STOP RANKING A CLIENT-AUTHORED BLOB.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────
-- `public.leaderboard_ranked` (2026-08-08-leaderboards.sql:138-198) is a
-- materialized view over `game_saves.snapshot`. That column is written by the
-- client, by design — it is the save blob — so EVERY board ranked a number the
-- ranked player typed. `G.gold = 1e12` → autosave → #1 on Wealth. The same one
-- line took Total Level, Combat Level, every skill board, Renown and Bosses.
-- CLAUDE.md save-invariant #6 recorded this as a documented limitation
-- ("leaderboard values are self-forgeable"). This file closes it.
--
-- It is also, quietly, an IMPERSONATION fix. The old `base` CTE read
--     coalesce(p.display_name, gs.snapshot->>'playerName', 'Adventurer')
-- so a player with no `profiles` row published a name of their own choosing to
-- every other player's screen. Names are now derived from `profiles` alone —
-- "never trust a client-supplied value that crosses to another player, not even
-- a display name" (CLAUDE.md, server authority).
--
-- ── WHERE EACH BOARD'S SCORE NOW COMES FROM ─────────────────────────────
--   wealth        player_state.gold                            SERVER-OWNED
--   skill:<id>    player_skills.xp                             SERVER-OWNED
--   total_level   sum(hr_level_from_xp(player_skills.xp))      DERIVED
--   combat_level  hr_lb_combat_level(seven derived levels)     DERIVED
--   clan_power    clans.castle_tier / clans.treasury           SERVER-OWNED
--                 (already server-owned before this file; definition unchanged)
--   renown        ✗ NO SERVER SOURCE — see below
--   bosses        ✗ NO SERVER SOURCE — see below
--
-- ⚠ THE TWO BOARDS THIS FILE CANNOT REBUILD, STATED PLAINLY.
--   `renown` and `bosses` have NO server-side source, and inventing one would
--   be a balance change, not a migration.
--     · Renown is src/features/renown.js computeRenown(G). Four of its terms
--       (quests completed, collection-log entries, the login streak, the
--       bestiary) live ONLY in the save blob. The server already knows this and
--       says so: 2026-08-15-perk-channel.sql:261 records the renown perk source
--       as the literal string 'blocked:no_server_renown_score'.
--     · Boss kills are summed from `G.bestiary` against the client's MONSTERS
--       table (renown.js:180-188). `hr_hunt_bosses` is the CLAN raid boss and
--       is a different quantity entirely — using it here would rank a number
--       that is not the one the board is named after.
--   Rather than quietly keep ranking the blob for these two while claiming the
--   rebuild is done, they are REMOVED FROM THE RANKED VIEW and declared
--   unsourced (§3). They keep their board ids so `hr_leaderboard('renown')`
--   answers rather than erroring — the precedent set by
--   2026-08-17-leaderboard-skills.sql, where an unmigrated skill yields an
--   empty honour roll instead of a broken screen — and the response now carries
--   `available:false` + `unavailable:'no_server_source'` so the client can stop
--   offering them. Those are ADDITIVE keys: src/features/leaderboards.js
--   reduceBoard() reads only ok/board/refreshed_at/total/top/rank/near, so it
--   needs no change to keep working, and it degrades to "No one has ranked on
--   this board yet" until the chips are hidden. That is the KNOWN GAP of this
--   pass, and it is named here rather than discovered later.
--
-- ── THE HONEST FRESHNESS CAVEAT ─────────────────────────────────────────
-- The live client tick still accrues XP locally between settlements, and the
-- accrual engine settles on a ~90s cadence. So a skill board can lag a player's
-- true XP by up to ~90s plus whatever has not settled. That is a LAG, not a
-- forgery: the number ranked is one the SERVER computed and stored, it is
-- merely a slightly older one. Boards refresh every five minutes anyway (§5 of
-- the 2026-08-08 file, unchanged here), so the settle cadence is not the
-- binding constraint on freshness.
--
-- ── SLOT 0 ONLY ─────────────────────────────────────────────────────────
-- `subject_id` is the USER id and the unique index is (board, subject_id), so a
-- player with characters in several slots must contribute exactly one row per
-- board or `refresh materialized view concurrently` fails on a duplicate key.
-- The old view took `game_saves.slot = 0`; this one takes `player_state.slot=0`
-- and `player_skills.slot = 0`. Same behaviour, same limitation: only your
-- first character ranks. Changing that is a design decision, not a security one.
--
-- ── APPLY AFTER: 2026-08-17-leaderboard-skills.sql ──────────────────────
-- §0's gate is BEHAVIOURAL and DISCRIMINATING (the SKILL-8 lesson): it requires
-- `hr_lb_skills()` to contain 'stonemason', which is a term the 2026-08-08
-- predecessor's body does NOT contain — that file's list stops at
-- 'bountyHunter' with fifteen entries. Anchoring instead on something both
-- bodies mention (say, 'bountyHunter', or the mere existence of the function)
-- would let this file install onto a database that never received the skills
-- migration, and the two new skill boards would then be silently absent from a
-- view that had just been rebuilt and looked correct.
--
-- SAFE TO RE-RUN. Everything here is a `create or replace` or a drop-and-
-- recreate of derived data.
--
-- ⚠⚠ REVERSIBILITY — RE-APPLYING 2026-08-08-leaderboards.sql IS **NOT** A
--    SUPPORTED REVERT PATH. DO NOT RUN THAT FILE AGAINST A LIVE DATABASE.
--    (Security review C2. An earlier draft of this note named only the first of
--    the two consequences below, which is exactly how the second one gets
--    forgotten at 3am during a rollback.)
--
--    That file is written for a 2026-08-08 database and does TWO things that
--    are now destructive, and only one of them is visible in its own output:
--
--    (1) `grant select on public.leaderboard_ranked to anon, authenticated`
--        (:208) — re-opens F5, the direct
--        `/rest/v1/leaderboard_ranked?limit=100000` dump of every player's uuid
--        and display name, around hr_leaderboard's p_limit clamp.
--
--    (2) `create or replace function public.hr_leaderboard(...)` (:287) plus
--        `grant execute ... to anon, authenticated` (:357) — the public name is
--        no longer the reader, it is the A9 RATE-GATE WRAPPER installed by §4 of
--        2026-08-11-authenticated-surface-lockdown.sql. Re-applying OVERWRITES
--        that wrapper with an ungated body and re-grants it to anon, leaving an
--        ungated, anon-callable, unrate-limited RPC. Nothing in the 2026-08-08
--        file mentions the gate, so it reports success while removing it. This
--        is not theoretical: the first revision of THIS file made the same
--        mistake in one line, and it surfaced only as
--        `hr_assert_grant_hygiene → ungated_client_rpcs`, two guards away.
--
--    THE SUPPORTED REVERT is a NEW forward migration. Nothing here holds state
--    — leaderboard_ranked is derived data, rebuildable in one statement — so a
--    revert is purely definitional:
--      (a) drop + recreate public.leaderboard_ranked using the SELECT body
--          COPIED OUT of 2026-08-08-leaderboards.sql §3, then
--          `revoke all on public.leaderboard_ranked from public, anon,
--          authenticated, service_role` (do NOT copy that file's grant);
--      (b) `create or replace function public.hr_leaderboard__ungated(...)`
--          — the __ungated TWIN, NEVER the public name — with the reader body
--          copied out of that file's §6;
--      (c) touch neither the A9 wrapper nor its grants.
--    Copy those two bodies by hand. Do not execute the file they live in.
--
--    IF SOMEONE RUNS IT ANYWAY, the database is left insecure in both ways
--    above and BOTH of these must then be re-applied, in this order:
--      · §4 of 2026-08-11-authenticated-surface-lockdown.sql — re-wraps
--        hr_leaderboard. It is re-runnable: it skips already-wrapped targets
--        (its `v_n_skip` counter) and re-wraps unwrapped ones.
--      · 2026-08-14-leaderboard-view-lockdown.sql — re-revokes the matview.
--    Verify with §6(b) and §6(i) of this file, or with LB-5/LB-11 in
--    tests/leaderboard-server-source.mjs.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions ────────────────────────────────────────────────────
do $$
declare v_skills text[];
begin
  -- (a) The leaderboard program itself.
  if to_regproc('public.hr_lb_boards') is null
     or to_regclass('public.leaderboard_ranked') is null
     or to_regprocedure('public.hr_leaderboard(text, int, int)') is null then
    raise exception 'run 2026-08-08-leaderboards.sql first — this file rebuilds '
                    'leaderboard_ranked and replaces hr_leaderboard, and a create-or-replace '
                    'against a database with no leaderboard would SUCCEED and leave objects '
                    'nothing reads';
  end if;

  -- (b) THE DISCRIMINATING PREDECESSOR GATE. 'stonemason' is present in
  --     2026-08-17-leaderboard-skills.sql's hr_lb_skills() and ABSENT from
  --     2026-08-08-leaderboards.sql's. Anything both files contain would pass
  --     here against an unmigrated database — that is the SKILL-8 defect, made
  --     three times on the hr_apply chain, and this is the same class of gate.
  --     tests/leaderboard-server-source.mjs holds the positive AND negative
  --     source controls for exactly this term.
  v_skills := public.hr_lb_skills();
  if not ('stonemason' = any (v_skills)) or not ('runecrafting' = any (v_skills)) then
    raise exception 'apply 2026-08-17-leaderboard-skills.sql first — hr_lb_skills() has % entries '
                    'and no stonemason/runecrafting, so it is still the 2026-08-08 body. Rebuilding '
                    'the view now would drop those two boards while looking correct.',
                    array_length(v_skills, 1);
  end if;

  -- (c) The server tables the new view reads. Without these there is nothing to
  --     rank and the rebuild would produce an EMPTY board for every player,
  --     which is a total leaderboard outage wearing a green self-check.
  if to_regclass('public.player_state') is null or to_regclass('public.player_skills') is null then
    raise exception 'run 2026-08-11-player-state.sql first — player_state/player_skills are the '
                    'server-owned source this file ranks';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'run 2026-08-11-player-state.sql first — hr_level_from_xp() derives every level';
  end if;
  if not exists (select 1 from public.hr_xp_table) then
    raise exception 'hr_xp_table is EMPTY — every derived level would be 1 and the Total Level and '
                    'Combat boards would rank a constant';
  end if;

  -- (d) THE A9 RETROFIT MUST ALREADY BE IN PLACE. §4 replaces
  --     hr_leaderboard__ungated; if that name does not exist, the retrofit was
  --     never applied and §4 would create a NEW function that the (unwrapped)
  --     public name does not call — a rebuilt view served by a reader nothing
  --     invokes, with every self-check below still green because they all call
  --     the public name. Refuse instead.
  if to_regprocedure('public.hr_leaderboard__ungated(text,int,int)') is null then
    raise exception 'REFUSING: public.hr_leaderboard__ungated(text,int,int) does not exist, so '
                    '2026-08-11-authenticated-surface-lockdown.sql''s A9 retrofit has not been '
                    'applied. Apply it first. Replacing the PUBLIC hr_leaderboard instead would '
                    'delete the hr_rpc_gate wrapper and leave an ungated anon-callable RPC';
  end if;
end $$;

-- ── 1. Combat level, server-side ────────────────────────────────────────
-- The ONE piece of client LOGIC this file ports: src/core/xp.js combatLevel().
-- It is deliberately a pure function of seven LEVELS rather than of a skills
-- blob, so it is directly comparable against the JS in a test — and
-- tests/leaderboard-server-source.mjs sweeps it against src/core/xp.js over
-- boundary and seeded-random tuples, because two hand-written copies of one
-- formula is precisely the drift this repo has been burned by.
--
-- float8, not numeric, so the server computes in the same IEEE754 double the
-- client does. HONEST NOTE ON HOW MUCH THAT IS WORTH: it is faithfulness to the
-- source, NOT a behavioural necessity, and the difference was MEASURED rather
-- than assumed. The whole expression reduces to
--     floor(B * 0.25 + X * 0.325)
-- where B = defense + hitpoints + floor(prayer/2) is an integer in [2,247] and
-- X = max(attack+strength, floor(ranged*1.5), floor(magic*1.5)) is an integer in
-- [2,198]. That is 49,551 reachable (B,X) pairs, and double arithmetic agrees
-- with exact rational arithmetic ((10B + 13X)/40) on ALL of them — zero
-- disagreements. So a numeric version would behave identically everywhere a
-- player can actually stand, and the mutation harness in
-- tests/leaderboard-server-source.mjs deliberately carries NO numeric mutant,
-- because a mutant that provably cannot change an answer would only ever report
-- SLIPPED and look like a gap in the guard. Keep the casts (they cost nothing
-- and they document the intent), but do not describe them as load-bearing.
create or replace function public.hr_lb_combat_level(
  p_attack int, p_strength int, p_defense int, p_hitpoints int,
  p_prayer int, p_ranged int, p_magic int
) returns int language sql immutable as $$
  select floor(
      (p_defense::float8 + p_hitpoints::float8 + floor(p_prayer::float8 / 2::float8))
        * 0.25::float8
    + greatest(
        (p_attack::float8 + p_strength::float8)        * 0.325::float8,
        floor(p_ranged::float8 * 1.5::float8)          * 0.325::float8,
        floor(p_magic::float8  * 1.5::float8)          * 0.325::float8)
  )::int
$$;
revoke all on function public.hr_lb_combat_level(int, int, int, int, int, int, int)
  from public, anon, authenticated, service_role;

-- ── 2. The ranked board, over SERVER tables ─────────────────────────────
drop materialized view if exists public.leaderboard_ranked cascade;

create materialized view public.leaderboard_ranked as
with base as (
  /* One row per RANKED CHARACTER.

     ⚠ `saved_at` IS DELIBERATELY NULL, AND IT IS A WAL DECISION. MEASURED.
       The obvious source is player_state.updated_at (a server clock, stamped
       now() by hr_apply). It is also stamped on EVERY settle — every ~90s for
       every active player — so putting it in a ranked row makes that row
       *change* every 90s even when the player's score, rank, name and clan are
       all identical. `refresh materialized view concurrently` diffs, so it only
       writes rows that changed; a volatile timestamp makes every active
       player's rows change, which defeats the diff entirely.

       Measured on the replay (8 players, 32 ranked rows, tuple xmin compared
       across a concurrent refresh):
         plain refresh, nothing changed ............ 32 of 32 rows rewritten
         concurrently, nothing changed .............  0 of 32   (it diffs)
         concurrently, ONE player settles ..........  4 of 32   (that player's)
         concurrently, ALL players settle .......... 32 of 32   (full churn)
         concurrently, a real xp gain ..............  4 rewritten + 1 added
       i.e. with updated_at in the row, an all-active population reproduces
       100% churn THROUGH the diff. That is the load reliability measured in
       production: ~107 rows, 11,188 inserts + 11,175 deletes over 34h ≈ 27
       rows per 5-minute refresh — about a quarter of the board, which is the
       active subset, not the whole thing. (A non-diffing plain refresh would
       have produced 408 × 107 ≈ 43,656.) So CONCURRENTLY was already working;
       the residual churn was the timestamp.

       And the column RENDERS NOTHING. src/features/leaderboards.js normRow()
       copies it to `savedAt` (:186) and no code path reads it again — the
       "updated Nm ago" stamp comes from the board-level `refreshed_at` in
       leaderboard_meta, not from a per-row value. So the fix is to stop
       sourcing it, NOT to add upsert-and-prune machinery on top of a refresh
       that already upserts and prunes.

       The COLUMN stays (as null, exactly like the clan_power branch always
       has) so the matview shape, the RPC's jsonb_build_object and the client's
       normRow() are all untouched. If a "last active" signal is ever wanted on
       a board, source it as a COARSE bucket (date_trunc('day', …)) so it
       churns once a day rather than once a settle — and measure it again. */
  select ps.user_id,
         ps.gold,
         null::timestamptz                          as saved_at,
         coalesce(p.display_name, 'Adventurer')     as name,
         c.name                                     as clan_name
  from public.player_state ps
  left join public.profiles p on p.id = ps.user_id
  left join public.clans    c on c.id = p.clan_id
  where ps.slot = 0
),
lv as (
  -- Levels are DERIVED from stored XP, never stored. Filtering against
  -- hr_lb_skills() keeps the board namespace CLOSED exactly as before: a
  -- player_skills row for an id outside the catalogue cannot invent a board.
  select s.user_id,
         s.skill_id,
         s.xp,
         public.hr_level_from_xp(s.xp) as level
  from public.player_skills s
  where s.slot = 0
    and s.skill_id = any (public.hr_lb_skills())
),
agg as (
  -- LEFT JOIN + coalesce, so a character whose skill rows have not been seeded
  -- yet ranks at BOOTSTRAP values rather than dropping out or producing NULL.
  -- The coalesce default is 1, not 0, because src/core/xp.js levelOf() returns
  -- levelFromXp(0) = 1 for a skill key that is absent — the server must agree
  -- with the client about what an unlevelled skill is worth, or a fresh
  -- character's combat level differs between the board and their own screen.
  select b.user_id,
         coalesce(sum(l.level), 0)::bigint as total_level,
         public.hr_lb_combat_level(
           coalesce(max(l.level) filter (where l.skill_id = 'attack'),    1),
           coalesce(max(l.level) filter (where l.skill_id = 'strength'),  1),
           coalesce(max(l.level) filter (where l.skill_id = 'defense'),   1),
           coalesce(max(l.level) filter (where l.skill_id = 'hitpoints'), 1),
           coalesce(max(l.level) filter (where l.skill_id = 'prayer'),    1),
           coalesce(max(l.level) filter (where l.skill_id = 'ranged'),    1),
           coalesce(max(l.level) filter (where l.skill_id = 'magic'),     1)
         )::bigint as combat_level
  from base b
  left join lv l on l.user_id = b.user_id
  group by b.user_id
),
scores as (
  select 'total_level'::text as board, b.user_id as subject_id, b.name, b.clan_name,
         a.total_level as score, b.saved_at
  from base b join agg a on a.user_id = b.user_id
  union all
  select 'combat_level', b.user_id, b.name, b.clan_name, a.combat_level, b.saved_at
  from base b join agg a on a.user_id = b.user_id
  union all
  select 'wealth', b.user_id, b.name, b.clan_name, b.gold, b.saved_at
  from base b
  union all
  -- One row per skill per player, straight off the stored XP. The client's
  -- scoreText() renders this through its own XP table as "Lv n", which is why
  -- the score is XP and not a level: it was XP before, and the read shape is
  -- unchanged.
  select 'skill:' || l.skill_id, l.user_id, b.name, b.clan_name, l.xp, b.saved_at
  from lv l join base b on b.user_id = l.user_id
  union all
  -- Clans, unchanged from 2026-08-08. Already server-owned: castle_tier and
  -- treasury are written by the clan RPCs, never by a client PATCH.
  select 'clan_power', c.id, c.name, c.name,
         (coalesce(c.castle_tier, 0)::bigint * 1000000000)
           + least(greatest(coalesce(c.treasury, 0), 0), 999999999)::bigint,
         null::timestamptz
  from public.clans c
  -- NOTE: no 'renown' branch and no 'bosses' branch. See the header. Their
  -- absence here is the security fix; §3 is what makes the absence legible.
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

create unique index if not exists leaderboard_ranked_subject_idx
  on public.leaderboard_ranked (board, subject_id);
create index if not exists leaderboard_ranked_rank_idx
  on public.leaderboard_ranked (board, rank);

-- ⚠ REVOKE, NOT GRANT — AND THIS LINE IS THE WHOLE OF F5.
--   2026-08-14-leaderboard-view-lockdown.sql:223 revoked client SELECT on this
--   matview so hr_leaderboard's p_limit clamp is the only door onto it; a
--   direct `/rest/v1/leaderboard_ranked?limit=100000` was dumping every
--   player's uuid and name. That revoke was an ACL on an object THIS FILE HAS
--   JUST DROPPED. The replacement is a brand-new object and inherits the
--   schema's DEFAULT PRIVILEGES, which on Supabase grant `all` on tables (and
--   matviews) to anon/authenticated — so doing nothing here silently REOPENS
--   the hole, and copying the 2026-08-08 file's `grant select … to anon,
--   authenticated` would reopen it loudly. §6(b) asserts the revoke took.
revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;

-- ── 3. The unsourced boards, declared rather than faked ─────────────────
-- The closed list of board ids that this server CANNOT score honestly. It is a
-- function next to hr_lb_boards() for the same reason that one is: there is no
-- row to forget to insert, and the reader and the self-check read one list.
create or replace function public.hr_lb_unsourced()
returns text[] language sql immutable as $$
  -- renown: computeRenown(G) reads quests, the collection log, the streak and
  --         the bestiary — none of which the server owns. See
  --         2026-08-15-perk-channel.sql:261 'blocked:no_server_renown_score'.
  -- bosses: summed from G.bestiary against the client MONSTERS table. There is
  --         no per-player boss-kill counter on the server. hr_hunt_bosses is
  --         the CLAN raid boss and is a different quantity.
  select array['renown','bosses']
$$;

-- ── 4. The reader ───────────────────────────────────────────────────────
-- Body is 2026-08-08-leaderboards.sql §6 verbatim, plus TWO ADDITIVE response
-- keys and one early return. This file TAKES OVER as the last that may
-- `create or replace` the reader body.
--
-- ⚠⚠ IT REPLACES `hr_leaderboard__ungated`, NOT `hr_leaderboard`. THE ONE-WAY
--   DOOR. §4 of 2026-08-11-authenticated-surface-lockdown.sql A9-retrofitted
--   this RPC: it renamed the original body to hr_leaderboard__ungated(text,int,
--   int) and installed a thin rate-gated wrapper at the public name (see its
--   c_targets list, line 500). A `create or replace` on the PUBLIC name
--   therefore does not update the reader — it OVERWRITES THE WRAPPER, deleting
--   the hr_rpc_gate call and leaving an ungated, anon-callable RPC behind. That
--   is not a hypothetical: the first revision of this file did exactly that,
--   and `hr_assert_grant_hygiene` reported
--       ungated_client_rpcs: ["hr_leaderboard(text,integer,integer)"]
--   which failed two unrelated smoke guards. §0(d) now refuses to install
--   unless the retrofit is present, and §6(i) asserts the wrapper still calls
--   the gate afterwards.
--
-- `available` / `unavailable` are ADDITIVE: reduceBoard() in
-- src/features/leaderboards.js reads ok, board, refreshed_at, total, top, rank
-- and near, and ignores everything else, so an unchanged client keeps working.
create or replace function public.hr_leaderboard__ungated(
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

  select refreshed_at into v_at from public.leaderboard_meta where id = 1;

  -- An unsourced board is answered HONESTLY and cheaply: ok (so the screen does
  -- not error), empty (so nothing forged is published), and flagged (so the
  -- client can hide the chip). It deliberately does NOT trigger a refresh —
  -- there is nothing for a refresh to change.
  if p_board = any (public.hr_lb_unsourced()) then
    return jsonb_build_object(
      'ok', true, 'board', p_board, 'refreshed_at', v_at, 'total', 0,
      'top', '[]'::jsonb, 'rank', null, 'near', '[]'::jsonb,
      'available', false, 'unavailable', 'no_server_source');
  end if;

  -- Opportunistic: a no-op unless the boards are more than five minutes old,
  -- and never allowed to take the READ down with it.
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
    'near', coalesce(v_near, '[]'::jsonb),
    'available', true
  );
end $$;
-- The ungated twin is reachable ONLY through the wrapper. Its grants are
-- restated (not merely inherited) because `create or replace` preserves the
-- existing ACL and a future rename could not be relied on to.
revoke all on function public.hr_leaderboard__ungated(text, int, int)
  from public, anon, authenticated, service_role;
-- The PUBLIC name is deliberately untouched here: it is the A9 wrapper, it
-- already carries the correct grants, and replacing or re-granting it is how
-- the rate gate gets deleted.

-- ── 5. Populate ─────────────────────────────────────────────────────────
refresh materialized view public.leaderboard_ranked;
update public.leaderboard_meta set refreshed_at = now() where id = 1;

-- ── 6. SELF-VERIFICATION ────────────────────────────────────────────────
-- Every assertion below is paired with something that could actually be false,
-- and the two DEPENDENCY checks carry an explicit positive control — an
-- always-passing probe is the failure mode this repo has been bitten by
-- repeatedly, and "the view no longer reads game_saves" is precisely the shape
-- of claim that a one-sided check would rubber-stamp.
do $$
declare
  v_dep_saves int;
  v_dep_state int;
  v_boards    text[];
  v_out       jsonb;
  v_uid       uuid;
  v_mv        bigint;
  v_fn        bigint;
  v_role      text;
begin
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'leaderboard_ranked missing';
  end if;

  -- (a) THE LOAD-BEARING PROPERTY: the ranked view no longer depends on
  --     game_saves, and DOES depend on player_state. Read off pg_depend rather
  --     than off the file, so it grades the object that exists rather than the
  --     text that was submitted.
  select count(*) into v_dep_saves
    from pg_depend d join pg_rewrite r on r.oid = d.objid
   where d.classid = 'pg_rewrite'::regclass
     and r.ev_class = 'public.leaderboard_ranked'::regclass
     and d.refobjid = 'public.game_saves'::regclass;
  select count(*) into v_dep_state
    from pg_depend d join pg_rewrite r on r.oid = d.objid
   where d.classid = 'pg_rewrite'::regclass
     and r.ev_class = 'public.leaderboard_ranked'::regclass
     and d.refobjid = 'public.player_state'::regclass;
  if v_dep_state = 0 then
    raise exception 'POSITIVE CONTROL FAILED: leaderboard_ranked does not depend on player_state, '
                    'so the dependency probe is measuring nothing and (a) cannot fail honestly';
  end if;
  if v_dep_saves > 0 then
    raise exception 'S2 OPEN: leaderboard_ranked still depends on game_saves — the boards are '
                    'still ranking a client-authored blob';
  end if;

  -- (b) The client cannot read the matview directly. It is a NEW object and
  --     inherited the schema default privileges; the F5 revoke in
  --     2026-08-14-leaderboard-view-lockdown.sql applied to the DROPPED one.
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role, 'public.leaderboard_ranked', 'select') then
      raise exception 'F5 REOPENED: leaderboard_ranked is client-selectable by % — recreating the '
                      'matview re-inherited the schema default grant, and hr_leaderboard''s limit '
                      'clamp is no longer the only door', v_role;
    end if;
  end loop;

  -- (c) The namespace is intact (23 boards) and the two unsourced ones are
  --     still ADDRESSABLE — removing their ids would turn the client's existing
  --     chips into an `unknown_board` error screen rather than an empty roll.
  v_boards := public.hr_lb_boards();
  if array_length(v_boards, 1) <> 23 then
    raise exception 'hr_lb_boards() has % entries, expected 23 (6 fixed + 17 skills)',
                    array_length(v_boards, 1);
  end if;
  if not ('renown' = any (v_boards)) or not ('bosses' = any (v_boards)) then
    raise exception 'renown/bosses were removed from the namespace — the client still offers those '
                    'chips and would now show an error instead of an empty board';
  end if;

  -- (d) …and they rank NOTHING. This is the half of the renown/bosses decision
  --     that is a security property rather than a UX one.
  if exists (select 1 from public.leaderboard_ranked
              where board = any (public.hr_lb_unsourced())) then
    raise exception 'an unsourced board has ranked rows — it can only have got them from the blob';
  end if;
  v_out := public.hr_leaderboard('renown', 25, 1);
  if (v_out->>'ok')::boolean is not true
     or (v_out->>'available')::boolean is not false
     or (v_out->>'unavailable') <> 'no_server_source'
     or jsonb_array_length(v_out->'top') <> 0 then
    raise exception 'hr_leaderboard(renown) must answer ok, empty and flagged, got %', v_out;
  end if;

  -- (e) The sourced boards still answer, and still carry the shape the client
  --     parses. (c) and (d) would both pass against a totally broken reader.
  for v_role in select unnest(array['total_level','combat_level','wealth',
                                    'skill:mining','skill:stonemason','clan_power']) loop
    v_out := public.hr_leaderboard(v_role, 25, 1);
    if (v_out->>'ok')::boolean is not true
       or jsonb_typeof(v_out->'top')  <> 'array'
       or jsonb_typeof(v_out->'near') <> 'array'
       or (v_out->>'available')::boolean is not true then
      raise exception 'hr_leaderboard(%) failed: %', v_role, v_out;
    end if;
  end loop;
  if (public.hr_leaderboard('not_a_board', 25, 1)->>'error') <> 'unknown_board' then
    raise exception 'unknown boards must still be refused';
  end if;

  -- (f) Rank is still a strict total order: 1..N, no ties, no gaps, per board.
  if exists (
    select 1 from (
      select board, count(*) as n, count(distinct rank) as d, max(rank) as m
      from public.leaderboard_ranked group by board
    ) q where q.n <> q.d or q.m <> q.n
  ) then
    raise exception 'rank must be 1..N with no ties and no gaps';
  end if;

  -- (g) TOTAL LEVEL AGREES WITH THE OTHER SERVER DEFINITION. hr_total_level()
  --     (2026-08-11-player-state.sql:922) and this view's `agg` CTE are two
  --     independent expressions of one fact, which is the exact shape that
  --     drifts. Graded against a real ranked player if there is one; skipped
  --     rather than faked on an empty database, and tests/leaderboard-server-
  --     source.mjs drives a real character so it is never skipped there.
  select subject_id into v_uid from public.leaderboard_ranked
   where board = 'total_level' order by rank limit 1;
  if v_uid is not null then
    select score into v_mv from public.leaderboard_ranked
     where board = 'total_level' and subject_id = v_uid;
    select public.hr_total_level(v_uid, 0) into v_fn;
    if v_mv <> v_fn then
      raise exception 'total_level drift: the ranked view says % and hr_total_level() says %',
                      v_mv, v_fn;
    end if;
  end if;

  -- (h) The ported combat-level formula, on vectors computed from
  --     src/core/xp.js. A fresh character (every skill level 1) is 1; the
  --     all-99 maximum is 126; and the ranged/magic arms must actually beat the
  --     melee one when they are ahead, which a `greatest` collapsed to its
  --     first argument would not.
  if public.hr_lb_combat_level(1,1,1,1,1,1,1) <> 1 then
    raise exception 'combat level of a fresh character is %, expected 1',
                    public.hr_lb_combat_level(1,1,1,1,1,1,1);
  end if;
  if public.hr_lb_combat_level(99,99,99,99,99,99,99) <> 126 then
    raise exception 'combat level of an all-99 character is %, expected 126',
                    public.hr_lb_combat_level(99,99,99,99,99,99,99);
  end if;
  -- (50, not 51 — MEASURED against src/core/xp.js, not reasoned about. base
  -- 2.75 + floor(99*1.5)*0.325 = 2.75 + 48.1 = 50.85 -> 50, and the melee arm
  -- there is 0.65, so a `greatest` collapsed to its first argument would answer
  -- 3 and this would fail.)
  if public.hr_lb_combat_level(1,1,1,10,1,99,1) <> 50 then
    raise exception 'the RANGED arm is not winning: got %, expected 50',
                    public.hr_lb_combat_level(1,1,1,10,1,99,1);
  end if;
  if public.hr_lb_combat_level(1,1,1,10,1,1,99) <> 50 then
    raise exception 'the MAGIC arm is not winning: got %, expected 50',
                    public.hr_lb_combat_level(1,1,1,10,1,1,99);
  end if;

  -- (h2) NO VOLATILE COLUMN IN A RANKED ROW. `refresh materialized view
  --      concurrently` writes only the rows that CHANGED, so any column that
  --      moves on every settle (player_state.updated_at does) makes every
  --      active player's rows churn on every refresh and defeats the diff. See
  --      the measurement in the base CTE. A non-null saved_at here means the
  --      timestamp was re-sourced and the WAL churn is back.
  if exists (select 1 from public.leaderboard_ranked where saved_at is not null) then
    raise exception 'a ranked row carries a non-null saved_at — a per-settle timestamp in a '
                    'ranked row rewrites that row on every refresh, which is the WAL churn this '
                    'design removed. Source it as a coarse bucket or not at all.';
  end if;

  -- (i) THE RATE GATE SURVIVED. §4 replaced the __ungated twin precisely so
  --     the A9 wrapper at the public name is left alone; this asserts the
  --     wrapper is still a wrapper. Carries its own POSITIVE control — the
  --     ungated twin must NOT reference the gate — so a scan that matched
  --     everything (or nothing) cannot report a clean bill.
  select prosrc into v_role from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_leaderboard';
  if v_role is null or position('hr_rpc_gate' in v_role) = 0 then
    raise exception 'THE ONE-WAY DOOR: public.hr_leaderboard no longer calls hr_rpc_gate — the A9 '
                    'wrapper was overwritten and the board RPC is now ungated and anon-callable';
  end if;
  select prosrc into v_role from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_leaderboard__ungated';
  if v_role is null or position('leaderboard_ranked' in v_role) = 0 then
    raise exception 'hr_leaderboard__ungated does not read leaderboard_ranked — §4 replaced the '
                    'wrong body';
  end if;
  if position('hr_rpc_gate' in v_role) > 0 then
    raise exception 'POSITIVE CONTROL FAILED: the __ungated twin references hr_rpc_gate, so the '
                    'scan above does not discriminate the wrapper from the body';
  end if;
  -- …and the twin is not directly client-callable, or the gate is optional.
  foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_leaderboard__ungated(text,int,int)', 'execute') then
      raise exception '% can execute hr_leaderboard__ungated directly, bypassing the rate gate',
                      v_role;
    end if;
  end loop;

  raise notice 'LEADERBOARD SERVER SOURCE OK — % boards ranked from player_state/player_skills; '
               'renown+bosses declared unsourced; matview not client-readable.',
               array_length(v_boards, 1) - array_length(public.hr_lb_unsourced(), 1);
end $$;
