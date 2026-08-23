-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-23-client-grant-narrowing.sql — REVOKE THE GRANTS NO POLICY BACKS
-- (open-beta hardening)
--
-- Security Engineer, 2026-08-23.
--
-- ── THE FINDING ────────────────────────────────────────────────────────────
-- Supabase's default ACL hands `anon` and `authenticated` **arwd** — SELECT,
-- INSERT, UPDATE, DELETE — on every table created in `public`. Measured on
-- production today, seven tables still carry the full default:
--
--   bug_reports    anon=arwd authenticated=arwd
--   chat_blocks    anon=arwd authenticated=arwd
--   chat_messages  anon=ar   authenticated=ar
--   clan_members   anon=arwd authenticated=arwd
--   clans          anon=arwd authenticated=arwd
--   game_saves     anon=arwd authenticated=arwd
--   session_claims anon=arwd authenticated=arwd
--
-- Most of those privileges are backed by NO POLICY, so they do nothing today:
-- RLS refuses the write before the grant ever matters. That is exactly the
-- problem. A privilege that is inert only because a *second*, independent
-- mechanism happens to be right is not a control, it is a loaded gun with the
-- safety on — and this codebase has already been shot by that specific gun
-- twice, both live: the `for all` policy on `game_saves` (the `G.gold = 1e12`
-- audit finding) and the "claim your own contribution" UPDATE policy on
-- `raid_contributions` (schema.sql:400-404), each of which turned a dormant
-- default grant into an economy exploit the moment somebody wrote one
-- convenient policy.
--
-- With signup opening to the public internet, "one careless `create policy`
-- away" stops being a hypothetical about a trusted invitee list.
--
-- ── THE RULE THIS FILE APPLIES ─────────────────────────────────────────────
-- A client role keeps exactly the privileges that a policy actually uses, and
-- nothing else. `revoke ... from anon, authenticated` first, `grant` back the
-- ones that are load-bearing, and then ASSERT the resulting matrix — because a
-- revoke without an assertion is a comment.
--
-- ── THIS FILE IS BEHAVIOUR-NEUTRAL, AND THAT IS CHECKED, NOT CLAIMED ───────
-- Every privilege removed here is one that RLS already refuses:
--
--   · every `anon` write — every write policy on these tables tests
--     `auth.uid() = <someone>`, and `auth.uid()` is NULL for anon, so the
--     predicate is NULL, so the row is refused. Always. Today.
--   · every `anon` read on bug_reports / chat_blocks / game_saves /
--     session_claims — same reason: their SELECT policies are `auth.uid() =
--     user_id`.
--   · UPDATE on clans, clan_members — no UPDATE policy exists on either.
--     Clan state moves through the SECURITY DEFINER RPCs (clan_deposit,
--     clan_contribute, clan_tier_up…), never a client PATCH.
--   · DELETE on clans, bug_reports — no DELETE policy exists on either.
--
-- WHAT IS DELIBERATELY LEFT ALONE, so the next reviewer does not read this file
-- as "the surface is now closed":
--   · `anon` SELECT on chat_messages, clans, clan_members, profiles,
--     display_names, market_listings. These are genuinely public reads — the
--     anon key is public by design and these policies say `true` on purpose.
--     The consequence is real and accepted: anyone can enumerate the player
--     roster (uuid -> display name), the clan table and the order book. There
--     is no email or other PII in any of those columns (checked column by
--     column, 2026-08-23). Narrowing them is a product decision about how
--     public a public beta is, not a defect, and it is NOT made here.
--   · `authenticated` arwd on game_saves and session_claims — both have real
--     `for all` / four-verb own-row policies and both are strictly self-scoped.
--     A forged value in either reaches nobody but its author.
--
-- IDEMPOTENT + ADDITIVE. Safe to re-apply. Touches no data.
--
-- REVERSIBILITY: `grant <verb> on public.<table> to anon, authenticated;` for
-- whichever line turns out to be load-bearing after all. Nothing here drops an
-- object, so a mistake is one GRANT away from undone.
--
-- NO `begin;`/`commit;` (repo rule S5 — the applier owns the transaction).
-- ════════════════════════════════════════════════════════════════════════════

-- ── §0 · PREFLIGHT — fail closed on a database that is not this one ────────
do $$
declare v_missing text;
begin
  select string_agg(t, ', ') into v_missing
    from unnest(array['bug_reports','chat_blocks','chat_messages','clan_members',
                      'clans','game_saves','session_claims']) t
   where to_regclass('public.' || t) is null;
  if v_missing is not null then
    raise exception 'client-grant-narrowing: missing table(s): % — this is not the Hearthrise schema', v_missing;
  end if;
  -- RLS must already be the primary control. If it is not, revoking a grant
  -- would be the ONLY thing standing between a client and the table, and that
  -- is not a posture this file is willing to create by accident.
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not c.relrowsecurity
     and c.relname in ('bug_reports','chat_blocks','chat_messages','clan_members',
                       'clans','game_saves','session_claims');
  if v_missing is not null then
    raise exception 'client-grant-narrowing: RLS is OFF on % — fix that FIRST; grants are the second lock, not the first', v_missing;
  end if;
end $$;


-- ── §1 · bug_reports ───────────────────────────────────────────────────────
-- Policies: INSERT {authenticated} (auth.uid() = user_id) · SELECT own.
-- A bug report cannot be edited or withdrawn by its author — the triage state
-- (`status`, `triage_note`, `triaged_at`) lives on the same row and is
-- operator-owned. UPDATE here would be "the reporter rewrites the triage".
revoke all on table public.bug_reports from anon, authenticated;
grant  select, insert on table public.bug_reports to authenticated;

-- ── §2 · chat_blocks ───────────────────────────────────────────────────────
-- Policy: FOR ALL on blocker_id = auth.uid(). Self-scoped mute list; the player
-- genuinely needs all four verbs on their own rows.
revoke all on table public.chat_blocks from anon, authenticated;
grant  select, insert, update, delete on table public.chat_blocks to authenticated;

-- ── §3 · chat_messages ─────────────────────────────────────────────────────
-- Policies: INSERT (auth.uid() = from_id, channel-scoped) · SELECT public
-- channels / own clan / own whispers. NO update, NO delete — a sent message is
-- immutable (hr_chat_immutable) so that "what was said" cannot be rewritten
-- after a report. anon SELECT is KEPT: see the header.
revoke insert, update, delete, truncate, references, trigger
  on table public.chat_messages from anon;
revoke update, delete, truncate, references, trigger
  on table public.chat_messages from authenticated;
grant  select on table public.chat_messages to anon;
grant  select, insert on table public.chat_messages to authenticated;

-- ── §4 · clan_members ──────────────────────────────────────────────────────
-- Policies: SELECT true · INSERT {authenticated} (heavily constrained: own
-- user_id, zeroed counters, server-window timestamps, open clan or founder) ·
-- DELETE own (leave). There is NO UPDATE policy, and there must not be: `cp`
-- and `contributed` are what raid_claim and the clan boards pay out on, i.e.
-- the classic "post-hoc mutation of your own row" hole. They move only through
-- SECURITY DEFINER RPCs.
revoke all on table public.clan_members from anon, authenticated;
grant  select on table public.clan_members to anon;
grant  select, insert, delete on table public.clan_members to authenticated;

-- ── §5 · clans ─────────────────────────────────────────────────────────────
-- Policies: SELECT true · INSERT {authenticated} with every economic column
-- pinned to its zero value. No UPDATE policy — `treasury`, `standing`,
-- `castle_tier` and `upgrades` are clan-wide state and `castle_tier`/`treasury`
-- are literally the `clan_power` leaderboard score, so a client UPDATE would be
-- a forged rank for a whole clan. No DELETE policy — deleting a clan out from
-- under its members is an operator action.
revoke all on table public.clans from anon, authenticated;
grant  select on table public.clans to anon;
grant  select, insert on table public.clans to authenticated;

-- ── §6 · game_saves ────────────────────────────────────────────────────────
-- Policy: FOR ALL own (plus four redundant per-verb copies). Still the
-- client-authored blob — but since 2026-08-18 NOTHING cross-player reads it:
-- `leaderboard_ranked` was re-sourced onto player_state / player_skills / clans
-- (verified on production 2026-08-23; the view no longer mentions game_saves).
-- So a forgery in here reaches its author's own screen and stops. The
-- authenticated grants stay; anon's are dead weight.
revoke all on table public.game_saves from anon;

-- ── §7 · session_claims ────────────────────────────────────────────────────
-- Four own-row policies, self-scoped single-session bookkeeping.
revoke all on table public.session_claims from anon;


-- ── §8 · THE ASSERTION — the matrix, verb by verb ─────────────────────────
-- Written as data rather than as seven if-statements so that adding a table
-- means adding a row, and so that a privilege NOT listed here is a failure
-- rather than an omission. A revoke without this block is a comment.
do $$
declare
  r record;
  v_bad text := '';
  -- table, role, the EXACT set of verbs that role may hold. Anything the role
  -- holds beyond this set, or any verb in this set it does NOT hold, is a fail.
  c_matrix constant text[][] := array[
    ['bug_reports',    'anon',          ''],
    ['bug_reports',    'authenticated', 'select,insert'],
    ['chat_blocks',    'anon',          ''],
    ['chat_blocks',    'authenticated', 'select,insert,update,delete'],
    ['chat_messages',  'anon',          'select'],
    ['chat_messages',  'authenticated', 'select,insert'],
    ['clan_members',   'anon',          'select'],
    ['clan_members',   'authenticated', 'select,insert,delete'],
    ['clans',          'anon',          'select'],
    ['clans',          'authenticated', 'select,insert'],
    ['game_saves',     'anon',          ''],
    ['game_saves',     'authenticated', 'select,insert,update,delete'],
    ['session_claims', 'anon',          ''],
    ['session_claims', 'authenticated', 'select,insert,update,delete']
  ];
  i int;
  v_tbl text; v_role text; v_allowed text[]; v_have text[];
begin
  for i in 1 .. array_length(c_matrix, 1) loop
    v_tbl     := c_matrix[i][1];
    v_role    := c_matrix[i][2];
    v_allowed := case when c_matrix[i][3] = '' then array[]::text[]
                      else string_to_array(c_matrix[i][3], ',') end;
    select coalesce(array_agg(p order by p), array[]::text[]) into v_have
      from unnest(array['select','insert','update','delete','truncate','references','trigger']) p
     where has_table_privilege(v_role, 'public.' || v_tbl, p);
    if v_have <> (select coalesce(array_agg(a order by a), array[]::text[]) from unnest(v_allowed) a) then
      v_bad := v_bad || format(E'\n  %s / %s: has {%s}, must be exactly {%s}',
                               v_tbl, v_role, array_to_string(v_have, ','), c_matrix[i][3]);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception 'client-grant-narrowing: the grant matrix is wrong:%', v_bad;
  end if;

  -- THE CONTROL. The loop above would also pass with an empty matrix, a typo'd
  -- role name (has_table_privilege raises on an unknown role, but a role that
  -- exists and holds nothing would sail through), or a table list that shrank.
  -- Assert the shape of the check itself.
  if array_length(c_matrix, 1) <> 14 then
    raise exception 'client-grant-narrowing: the matrix has % rows, expected 14 — a table was dropped from the check',
      array_length(c_matrix, 1);
  end if;
  if not has_table_privilege('authenticated', 'public.chat_messages', 'insert') then
    raise exception 'client-grant-narrowing (CONTROL): authenticated cannot INSERT chat_messages — chat is dead';
  end if;
  if has_table_privilege('anon', 'public.clans', 'update') then
    raise exception 'client-grant-narrowing (CONTROL): the revokes did not take';
  end if;

  -- And the paired invariant: no write POLICY may exist where we just removed
  -- the write GRANT, or the two locks disagree and the next person to "fix" the
  -- grant re-opens a live hole.
  for r in
    select tablename, policyname, cmd from pg_policies
     where schemaname = 'public'
       and ((tablename in ('clans','clan_members') and cmd in ('UPDATE','ALL'))
         or (tablename = 'clans' and cmd = 'DELETE')
         or (tablename = 'bug_reports' and cmd in ('UPDATE','DELETE','ALL'))
         or (tablename = 'chat_messages' and cmd in ('UPDATE','DELETE','ALL')))
  loop
    raise exception 'client-grant-narrowing: %.% is a % policy on a surface this file just closed — '
                    'the grant and the policy disagree', r.tablename, r.policyname, r.cmd;
  end loop;

  raise notice 'client-grant-narrowing: APPLIED. 14 (table, role) pairs asserted verb by verb; '
               'anon holds nothing but the four deliberate public reads.';
end $$;

do $$
declare v_report jsonb;
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    execute 'select public.hr_assert_grant_hygiene(true)' into v_report;
    raise notice 'grant hygiene after client-grant-narrowing: %', v_report;
  else
    raise notice 'client-grant-narrowing: hr_assert_grant_hygiene absent — skipped the nightly-lint cross-check';
  end if;
end $$;
