-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-23-m8-parties-s2-1-hunt-tables.sql — M8 SLICE 2, FILE 1 OF 3:
--   THE SESSION OBJECT, THE LEASE, THE DERIVED EXCLUSION, AND S-11'S PREDICATE
--   GIVEN ITS REAL BODY IN THE SAME FILE THAT CREATES THE TABLE IT READS.
--
-- Design: docs/planning/WORLD_TICK_DESIGN.md §18.2.1 / §18.2.3 (invariants 7
-- and 8) / §18.2.4, Security's §18-SEC.3 S2 self-check list, and §18-SEC-2.3's
-- S2 brief. SHADOW ONLY: nothing in this batch can move a coin, and file 2's
-- settle returns before hr_apply while `hr_tick_config.shadow` is true.
--
-- ⚠ THIS IS A MONEY-SURFACE REVIEW EVEN THOUGH IT PAYS NOTHING TODAY
--   (§18-SEC.3, Correction 1): *"S2 builds the settle whose armed branch
--   reaches hr_apply … Both are money-surface reviews under CLAUDE.md §2 even
--   though neither moves a coin on the day it applies — the money moves later,
--   on an operator `update`, with no further code review in between."* S1's
--   "structural review" sentence must not be read across to this batch.
--
-- ── WHAT LANDS HERE ─────────────────────────────────────────────────────────
--   public.party_hunt          the session object + the PARTY WATERMARK
--   public.party_tick_lease    hr_tick_ownership's semantics at party grain
--   public.hr_tick_shadow.party   one NULLABLE jsonb column (S-1, S-16)
--   hr_partied(uuid,int) -> boolean   invariant 7, POSITIVE and DERIVED (S-8)
--   hr_party_hunt_live(uuid)   S1's stub REPLACED by the real existence test
--   hr_tick_roster             ONE clause added by additive programmatic patch
--
-- File 2 is the roster sibling and the settle. File 3 is the engine allowlist
-- record (S-14). Read the three as ONE BATCH, applied in one sitting, in order:
-- file 2 grants hr_party_tick_settle to `hr_engine` and file 1 grants
-- hr_partied to `hr_engine`, and until file 3 records both in c_engine_allow
-- the nightly `hr-grant-hygiene` cron RAISES on
-- `engine_execute_outside_allowlist`. A detector expected to be red hides the
-- next real regression — the same warning
-- 2026-09-22-engine-allowlist-hunt-reads.sql carries.
--
-- ── B-A2: THE ROSTER PREDICATE IS READ OFF S1'S CODE, NOT OFF §18.2.2 ───────
-- §18-SEC-2 B-A2: *"§18.2.2's hr_party_view paragraph still describes the
-- policy the S1 lane measured unbuildable … S2's brief must not read the roster
-- predicate out of it."* §18.2.2 proposes SELECT policies resolved through
-- `hr_party_of`. A policy USING clause is evaluated AS THE CALLING ROLE, so
-- that needs EXECUTE on hr_party_of granted to `authenticated` — which is the
-- sweepable membership oracle hr_clan_may_admit's rule forbids, and which
-- 2026-09-23-m8-parties-s1-1-tables.sql §7(b) refuses BY EXECUTION for the
-- three S1 tables.
--
--   SO party_hunt's SELECT POLICY IS THE SHAPE S1 ACTUALLY BUILT FOR `party`:
--   `exists (select 1 from public.party_member m where m.party_id = … and
--   m.user_id = (select auth.uid()) and m.left_at is null)` — a read of a
--   DIFFERENT table whose own policy (`auth.uid() = user_id`) reads nothing, so
--   the chain terminates in one step and cannot recurse however it is entered.
--   §7(b) below refuses any policy of this file that names hr_party_of or
--   hr_party_role, and §7(b2) proves the policy BEHAVIOURALLY in both
--   directions — a member reads, a non-member reads zero, neither raising,
--   which is the only arm that would catch 42P17 or 42501.
--
--   `party_tick_lease` gets NO CLIENT POLICY AT ALL (§18.2.2). With RLS armed
--   and no policy, every client read is refused by ABSENCE.
--
-- ── INVARIANT 7 IS A JOIN, NOT A COLUMN (S-8) ──────────────────────────────
-- `hr_partied` is the predicate §18.2.3 invariant 7 writes out verbatim, and
-- `hr_tick_roster` gains `and not public.hr_partied(o.user_id, o.slot)` and NO
-- COLUMN. `hr_tick_ownership.party_id` is not created here and is not consulted
-- anywhere: a denormalised column that can be stale or absent fails at both
-- ends (a character servable by both rosters in between, and a character with
-- no ownership row at all whose exclusion never fires). §7(d) plants one
-- character in a party with a live hunt and asserts the two rosters are
-- DISJOINT on the same fire, which is the guard §18.2.3 invariant 7 asks for.
--
-- ── THE ROSTER IS PATCHED, NOT RESTATED ────────────────────────────────────
-- §5's patch reads the LIVE body with `pg_get_functiondef`, refuses unless its
-- anchor matches EXACTLY ONCE, inserts one line and re-executes — the idiom
-- 2026-09-22-vigour-refill.sql §5 and 2026-09-23-m8-parties-s1-1-tables.sql §5d
-- both used, and for the harder reason here: `hr_tick_roster` is NOT tracked in
-- tests/live-hash-drift.baseline.json, so a restatement of it would silently
-- revert whatever a parallel lane added and NOTHING in this repo would see it.
-- A patch cannot revert what it never re-types.
--
-- ── S-11's PREDICATE GETS ITS REAL BODY HERE, AND THE CALL SITE IS ASSERTED ─
-- §18-SEC-2.3's S2 brief: *"hr_party_hunt_live's body becomes the real
-- existence test in the SAME file that creates party_hunt, and S1's call site
-- is asserted still reached."* Both halves are §7(c): the body is replaced
-- immediately after `create table public.party_hunt`, §7(c1) reads
-- hr_party_accept's installed `prosrc` and requires it still NAMES the
-- predicate, and §7(c2) plants a live hunt and requires a real accept to answer
-- `party_hunt_running`. S1 proved that refusal against a stub; this file proves
-- it against the table.
--
-- ⚠ B9 (Security, S1 review) IS HONOURED: S1's §8(f) replaced the predicate
--   INSIDE the apply's own transaction and put it back. That was fine there and
--   is explicitly *"must not be carried into S2, where the predicate is
--   load-bearing and the tables are not empty."* Nothing below replaces it
--   temporarily; §7(c2) plants a real `party_hunt` row instead, and rolls it
--   back with everything else.
--
-- ── ⚠ AFTER APPLYING: live-hash-drift GOES RED ON THREE (Security, S2 review)
-- Measured credential-free, exit 1, three problems — not the one the lane
-- reported. Two of them are NEW AND ARE THIS FILE'S:
--
--   untracked hr_tick_roster        §5b's programmatic patch is one of the
--                                   three disjuncts the sweep derives tracking
--                                   from, so the body this file's own header
--                                   calls dangerously unwatched IS now watched.
--                                   That is the outcome argued for below, not
--                                   an accident.
--   untracked hr_party_hunt_live    §5a is the THIRD migration to restate it
--                                   (S1's three files, then this), which
--                                   crosses the 3+ threshold.
--   replay hr_assert_grant_hygiene  FILE 3's, chain link 14.
--
-- The three whys the Coordinator records are written out in full in this file's
-- entry in tests/schema-apply-order.json. `--codediff` FIRST, then
-- `--live --write`, then `touched_by` on all three. Agents never edit that
-- baseline (CLAUDE.md §2) and this lane has not.
--
-- ── ⚠ APPLY ALL THREE **BEFORE** THE EDGE DEPLOY (Security, S2 review) ─────
-- The reversed order is a TOTAL PLAY OUTAGE, not a measurement one, and that
-- is the opposite direction from RE-VERIFY 5's ordering constraint — so it is
-- written down here rather than inferred from it.
--
-- supabase/functions/hr-accrue/party-fence.js runs `select
-- public.hr_partied($1::uuid, $2::int)` at the intent door for `accrue` and
-- every `collectsFirst` verb, and it FAILS CLOSED on its own error. That is the
-- right direction (a false refusal costs a retry; a false pass re-prices a
-- window three other players are paid from) and it is exactly why the interim
-- is expensive: against a database where `hr_partied` does not exist, 42883 is
-- caught and EVERY `accrue`, `set_activity` and `equip` in the game is refused
-- 409 `party_settle_required` — every player, including the ~90 s attended
-- cadence and the return-from-away claim. Measured on the replay at the pre-S2
-- head; `eat`, `shop_buy` and `market_list` are `collectsFirst: false` and pass.
--
-- FORWARD the interim is inert: `hr_partied` exists, `party_hunt` is EMPTY, the
-- predicate answers false for everybody and the fence passes; and nothing posts
-- `body.parties` (hr_tick_cron_run builds its POST from hr_tick_roster alone,
-- and hr_party_hunt_start is S4's), so `hr_party_roster` returns no row and a
-- fire behaves exactly as it does today. tests/party-settle.mjs arm O1 executes
-- both readings rather than asserting them.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   re-apply 2026-09-20-world-tick-roster.sql (restores hr_tick_roster without
--   the clause), restore hr_party_hunt_live to `select false`, then
--     drop function public.hr_partied(uuid, int);
--     drop table public.party_tick_lease, public.party_hunt cascade;
--     alter table public.hr_tick_shadow drop column party;
--   No existing row is written by this file and no existing CHECK is widened.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.party') is null
     or to_regclass('public.party_member') is null then
    raise exception 'PRECONDITION: the M8 S1 membership tables are absent — apply 2026-09-23-m8-parties-s1-1-tables.sql first. S2 is the SESSION on top of S1''s roster; there is nothing to hunt with.';
  end if;
  if to_regprocedure('public.hr_party_of(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_party_of is absent — it is S1''s membership predicate and the settle resolves through it.';
  end if;
  if to_regprocedure('public.hr_party_hunt_live(uuid)') is null then
    raise exception 'PRECONDITION: hr_party_hunt_live is absent — S1 creates it as a stub and THIS file owns its real body (S-11).';
  end if;
  if to_regprocedure('public.hr_party_accept(int,uuid,uuid)') is null then  -- (p_slot, p_invite, p_idem)
    raise exception 'PRECONDITION: hr_party_accept is absent — §7(c1) asserts its call site of hr_party_hunt_live is still reached.';
  end if;
  if to_regclass('public.hr_tick_shadow') is null
     or to_regclass('public.hr_tick_config') is null
     or to_regclass('public.hr_tick_ownership') is null then
    raise exception 'PRECONDITION: the world-tick objects are absent — apply 2026-09-21-world-tick-settle-fence.sql and 2026-09-20-world-tick-roster.sql first.';
  end if;
  if to_regprocedure('public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)') is null then
    raise exception 'PRECONDITION: hr_tick_roster is absent at its cursor signature — §5 patches that exact body and refuses to patch blind.';
  end if;
end $$;

-- ── 2. public.party_hunt — THE SESSION OBJECT AND THE PARTY WATERMARK ──────
-- §18.2.1 verbatim. `accrued_to` is THE PARTY WATERMARK and by invariant 8 it
-- IS every live member's own `player_state.accrued_to` for the life of the
-- hunt; `hr_party_tick_settle` (file 2) is the only function that moves either.
create table if not exists public.party_hunt (
  id          uuid primary key default gen_random_uuid(),
  party_id    uuid not null references public.party(id) on delete cascade,
  active_id   text not null,
  stance      text not null default 'steady' check (stance in ('careful','steady','reckless')),
  stop        jsonb not null default '{}'::jsonb,
  started_at  timestamptz not null default now(),
  accrued_to  timestamptz not null,
  ended_at    timestamptz,
  stopped_by  text,
  version     bigint not null default 0,
  constraint party_hunt_stop_obj_ck check (jsonb_typeof(stop) = 'object'),
  -- An ended hunt names WHY, and a live one cannot pretend to. Both halves,
  -- because `stopped_by` is what §18.2.5a's member_unpayable branch writes and
  -- what the Analyzer reads.
  constraint party_hunt_ended_ck check ((ended_at is null) = (stopped_by is null))
);
comment on table public.party_hunt is
  'M8 S2 (2026-09-23). ONE live row per party; history is kept for the '
  'Analyzer. accrued_to is THE PARTY WATERMARK — invariant 8 makes it equal to '
  'every live member''s player_state.accrued_to, and hr_party_tick_settle is '
  'the ONLY writer of either. No client INSERT/UPDATE/DELETE policy exists and '
  'none may be added.';

-- ONE LIVE HUNT PER PARTY, as an index rather than as a read: two concurrent
-- starts both reading "no live hunt" is the shape the clan member-cap bug
-- turned on. §7(e) provokes it and requires the unique violation.
create unique index if not exists party_hunt_one_live
  on public.party_hunt (party_id) where ended_at is null;
-- The roster's own read: live hunts, furthest behind first.
create index if not exists party_hunt_live_roster
  on public.party_hunt (accrued_to, party_id) where ended_at is null;

alter table public.party_hunt enable row level security;
-- TABLE PRIVILEGE **AND** RLS, S1's rule and its reason: with the privilege
-- left in place an UPDATE or DELETE that RLS filters returns ZERO ROWS RATHER
-- THAN AN ERROR, indistinguishable in a log from a write that was about
-- nothing. service_role is BYPASSRLS — for it the revoke is the ONLY fence.
revoke all on public.party_hunt from public, anon, authenticated, service_role;
grant  select on public.party_hunt to authenticated;

-- THE SELECT POLICY — B-A2's shape, which is `party`'s own (S1 file 1 §5e).
-- It reads party_member, a DIFFERENT table whose policy is `auth.uid() =
-- user_id` and reads nothing, so the chain terminates in one step. It does NOT
-- reach hr_party_of: a USING clause runs as the CALLING role.
drop policy if exists "party hunt readable by live members" on public.party_hunt;
create policy "party hunt readable by live members" on public.party_hunt
  for select to authenticated
  using (exists (select 1 from public.party_member m
                  where m.party_id = party_hunt.party_id
                    and m.user_id = (select auth.uid())
                    and m.left_at is null));

-- ── 3. public.party_tick_lease — hr_tick_ownership AT PARTY GRAIN ──────────
-- §18.2.1 / §18.2.4: one lease, on the PARTY. A member cannot be leased away
-- from under it because invariant 7 means the member row is never offered to
-- the per-character roster at all.
--
-- `shadow_accrued_to` is §15c's shadow watermark at party grain, and it exists
-- for exactly §15c's reason: chaining on `party_hunt.accrued_to` while paying
-- nothing produces OVERLAPPING windows and a parity number that lies upward.
-- Arming clears it (file 2's armed branch).
--
-- `shadow_state` is RE-VERIFY 5's carrier, PER MEMBER, and its shape says so:
-- a jsonb OBJECT keyed `<user>:<slot>` whose values are each member's own
-- continuation state. RE-VERIFY 5 put the solo carrier on
-- hr_tick_ownership.shadow_state with a 16 KiB octet bound; a party window has
-- up to four continuations and carries them the same way, under the party
-- lease's own lock, in ONE statement with the mark. No fourth carrier is
-- invented — §18's one-sentence design forbids a second place where "what a
-- character is doing" lives, and four ownership rows updated separately would
-- be exactly that.
create table if not exists public.party_tick_lease (
  party_id          uuid primary key references public.party(id) on delete cascade,
  owned             boolean not null default false,
  lease_holder      text,
  lease_until       timestamptz,
  shadow_accrued_to timestamptz,
  shadow_state      jsonb,
  updated_at        timestamptz not null default now(),
  -- THE SAME TWO TERMS RE-VERIFY 5's CHECK carries, at party grain. The
  -- per-member bound stays 16 KiB and is enforced in the settle (file 2,
  -- `shadow_state_too_large`), so the refusal has a countable NAME rather than
  -- aborting the batch on a check_violation. This CHECK is the backstop under
  -- it, and a backstop that the fence in front of it can step past is not one.
  --
  -- ⚠ THE CEILING IS DERIVED, NOT ROUND (Security, S2 review). 64 KiB was
  --   `4 x 16 KiB` and it DID NOT COMPOSE: this object is not the concatenation
  --   of four member states, it is a jsonb OBJECT that also carries four
  --   `"<uuid>:<slot>": ` keys and its own separators — about 176 octets of
  --   structure. Measured on the replay, four members each at EXACTLY the
  --   per-member maximum the settle accepts (16 379 octets apiece, under 16 384)
  --   assembled to 65 712 and raised SQLSTATE 23514 out of the settle instead of
  --   answering `shadow_state_too_large` — the check_violation this whole design
  --   exists to replace, and one that wedges that party's shadow chain silently
  --   and forever, counted only as a `party_error:` reason.
  --
  --   So the ceiling is `c_max_members * c_state_max + 1024` = 66 560, and the
  --   slack is the structure with room to spare. It is a DERIVATION, so file 2's
  --   §5(f2) re-derives it from the settle's own two constants read out of the
  --   INSTALLED body and refuses to install if the two stop composing: the day
  --   PARTY_MAX or the per-member bound moves, this number must move with it.
  constraint party_tick_lease_shadow_state_ck
    check (shadow_state is null
           or (jsonb_typeof(shadow_state) = 'object'
               and octet_length(shadow_state::text) <= 66560))
);
comment on table public.party_tick_lease is
  'M8 S2 (2026-09-23). The world tick''s lease at PARTY grain, plus the shadow '
  'watermark and the per-member continuation carrier (RE-VERIFY 5''s '
  'shadow_state, keyed <user>:<slot>). NO CLIENT POLICY AT ALL (§18.2.2): with '
  'RLS armed and no policy every client read is refused by ABSENCE.';

create index if not exists party_tick_lease_owned_idx
  on public.party_tick_lease (owned) where owned;

alter table public.party_tick_lease enable row level security;
alter table public.party_tick_lease force row level security;
do $$
begin
  execute 'revoke all on public.party_tick_lease from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

-- ── 4. hr_tick_shadow.party — ATTRIBUTION AS ITS OWN NULLABLE COLUMN ───────
-- §18.2.1a, answering S-1 and S-16. A plain nullable add is CATALOG-ONLY: it
-- writes a pg_attribute row and rewrites no heap. §16's ACCESS EXCLUSIVE drain
-- argument was about a `GENERATED … STORED` column, which does rewrite — the
-- correction is §18.2.1a's, recorded rather than buried.
--
-- ⚠ THE DELTA STAYS KEY-FOR-KEY A SOLO SETTLE'S. `hr_tick_shadow.delta` is
--   stored verbatim and carries NO party key at all, which is what makes
--   §18.2.6 (P-a) a byte comparison after deleting `{journal,meta,party}` and
--   what keeps `c_delta_keys`' `unknown_delta_key` branch out of the party
--   path entirely.
alter table public.hr_tick_shadow add column if not exists party jsonb;
comment on column public.hr_tick_shadow.party is
  'M8 S2 (2026-09-23), Security S-1/S-16. The party attribution for THIS '
  'member''s window: {id,hunt,dmg_bp,xp_bp,floor,fellow_bp,roll}, the same '
  'object journal.meta.party will carry when the tick arms. NULL on every solo '
  'row. The 24 h parity read groups on this column instead of walking jsonb, '
  'and `delta` beside it stays byte-for-byte what hr_apply would receive.';

-- The parity read of §18.2.6 groups on it; a partial index keeps that free.
create index if not exists hr_tick_shadow_party_idx
  on public.hr_tick_shadow ((party->>'id'), window_from) where party is not null;

-- ── 5. hr_partied — INVARIANT 7, POSITIVE AND DERIVED (S-8) ────────────────
-- §18.2.3 invariant 7's body verbatim. It is the ONE predicate at every door:
-- the per-character roster's exclusion (§5b below), and the edge's invariant-8
-- fence on `accrue` and every `collectsFirst` verb.
create or replace function public.hr_partied(p_user uuid, p_slot int)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select exists (
    select 1
      from public.party_member m
      join public.party_hunt   h on h.party_id = m.party_id
     where m.user_id = p_user and m.slot = p_slot
       and m.left_at is null and h.ended_at is null);
$fn$;
comment on function public.hr_partied(uuid, int) is
  'M8 S2 (2026-09-23), Security S-8. Invariant 7, BY JOIN: is this character a '
  'live member of a party with a live hunt? Never a denormalised column — one '
  'that is stale makes a character servable by BOTH rosters, and one that is '
  'ABSENT makes the exclusion never fire at all. Granted to hr_engine (the '
  'edge''s invariant-8 fence) and to no client role: a client-callable '
  'membership predicate is an oracle it can sweep.';
revoke execute on function public.hr_partied(uuid, int) from public;
revoke execute on function public.hr_partied(uuid, int)
  from anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    -- READ-ONLY, and it takes the (p_user, p_slot) pair the engine ALREADY
    -- passes to hr_state_of and hr_apply. The holder of hr_apply can already
    -- WRITE any character it names; this is strictly narrower. Recorded in
    -- c_engine_allow by FILE 3 OF THIS BATCH (S-14).
    execute 'grant execute on function public.hr_partied(uuid, int) to hr_engine';
  else
    raise exception 'hr_engine does not exist — the invariant-8 fence would be unreachable by the role that enforces it';
  end if;
end $$;

-- ── 5a. hr_party_hunt_live — S1'S STUB REPLACED, IN THIS FILE (S-11) ───────
-- S1 shipped `select false` and named S2 as the owner, in the file's own
-- comment: *"when public.party_hunt lands, this body becomes … and nothing
-- else in the batch changes."* It lands here, immediately after the table, and
-- §7(c1)/§7(c2) assert both that S1's call site still names it and that a real
-- accept against a real live hunt is refused `party_hunt_running`.
create or replace function public.hr_party_hunt_live(p_party uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $fn$
  select exists (select 1 from public.party_hunt h
                  where h.party_id = p_party and h.ended_at is null)
$fn$;
comment on function public.hr_party_hunt_live(uuid) is
  'M8 S2 (2026-09-23), Security S-11. THE REAL EXISTENCE TEST, replacing S1''s '
  '`select false` in the same file that creates public.party_hunt. '
  'hr_party_accept refuses party_hunt_running on it: a joiner mid-hunt is '
  'otherwise inside the next party window with their own accrued_to days back, '
  'and the settle either wedges on them forever or confiscates their entire '
  'away window.';
revoke execute on function public.hr_party_hunt_live(uuid) from public;
revoke execute on function public.hr_party_hunt_live(uuid)
  from anon, authenticated, service_role;

-- ── 5b. hr_tick_roster GAINS ONE CLAUSE — ADDITIVE PROGRAMMATIC PATCH ──────
-- Invariant 7 at the per-character roster: `and not public.hr_partied(...)`.
-- ONE clause, NO column.
--
-- ⚠ PATCHED, NOT RESTATED, and the reason is stronger here than it was for
--   hr_rpc_gate. `hr_tick_roster` is NOT tracked in
--   tests/live-hash-drift.baseline.json, so a restatement that silently
--   reverted a parallel lane's change would be caught by NOTHING. Everything
--   but the inserted line is carried verbatim out of the LIVE body, so no
--   column, no clamp, no ordering and no cursor term can move.
--
-- The anchor is the absence-cap line of the `claim` CTE's WHERE. It is chosen
-- because it is the last predicate before the shard test and because it is
-- unambiguous in the installed text; the patch refuses unless it matches
-- EXACTLY ONCE, and §7(f) asserts the patched body carries the clause exactly
-- once afterwards.
do $$
declare
  v_src text;
  v_new text;
  c_anchor constant text := 'and ps.accrued_to > now() - c_max_span';
  c_clause constant text := 'and not public.hr_partied(o.user_id, o.slot)';
begin
  select pg_get_functiondef(
           'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)'::regprocedure)
    into v_src;
  v_src := replace(v_src, chr(13), '');
  if position(c_clause in v_src) > 0 then
    raise notice 'hr_tick_roster already excludes partied characters — patch skipped';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_tick_roster absence-cap anchor did not match exactly once — refusing to patch blind. A restatement here would silently revert whatever else moved this body, and nothing tracks it.';
  end if;
  v_new := replace(v_src, c_anchor,
    c_anchor || chr(10) ||
    '       -- INVARIANT 7 (M8 S2, Security S-8). POSITIVE AND DERIVED: a' || chr(10) ||
    '       -- character in a party with a LIVE hunt is served by' || chr(10) ||
    '       -- hr_party_roster and by NOTHING ELSE. Never a denormalised' || chr(10) ||
    '       -- column: stale, a character is servable by both rosters and the' || chr(10) ||
    '       -- solo settle pays the whole party stream to one member; absent,' || chr(10) ||
    '       -- the exclusion never fires at all.' || chr(10) ||
    '       ' || c_clause);
  execute v_new;
  raise notice 'hr_tick_roster patched: partied characters are excluded by join (invariant 7)';
end $$;
-- `create or replace function` preserves the ACL, and the grants are re-stated
-- anyway (CLAUDE.md §2, revoke-before-grant).
revoke execute on function public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int) from public;
revoke execute on function public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)
  from anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'grant execute on function public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int) to hr_tick';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    -- The SELECTOR and the SETTLER stay different roles and neither can become
    -- the other (§15c). hr_engine must not be able to stamp its own lease.
    execute 'revoke execute on function public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int) from hr_engine';
  end if;
end $$;

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Security's S2 list (§18-SEC.3) that belongs to THIS file, EXECUTED —
-- properties asserted by running SQL, not by markers. The privilege matrix and
-- the identity refusal on the settle and the roster sibling belong to file 2,
-- where those functions exist. The block plants inside a subtransaction and
-- rolls every row back at HR825; §7(z) then COUNTS what is left, because
-- "player state is never fabricated" (CLAUDE.md §2) is a claim this block has
-- to prove about itself.
do $$
declare
  v_a    constant uuid := '00000000-0000-4000-8000-0000b8020001';
  v_b    constant uuid := '00000000-0000-4000-8000-0000b8020002';
  v_p    uuid;
  v_h    uuid;
  v_card uuid;
  v_r    jsonb;
  v_n    int;
  v_m    int;
  t      text;
  v_dml  text;
  v_state text;
  v_src  text;
begin
  -- (a) NO CLIENT DML ON EITHER NEW TABLE, BY EXECUTION. SIX attempts, every
  --     one required to RAISE 42501 — the clan lesson §18.2.2 quotes, run
  --     rather than quoted. The assertion is on the SQLSTATE, never on "it
  --     threw": a bare `when others then null` would grade a typo in the probe
  --     as the fence working, which is the vacuous-proof failure
  --     tests/guard-hygiene.mjs R3 exists over.
  foreach t in array array['party_hunt','party_tick_lease'] loop
    foreach v_dml in array array['insert','update','delete'] loop
      v_state := null;
      begin
        set local role authenticated;
        execute case
          when v_dml = 'delete' then format('delete from public.%I where true', t)
          when v_dml = 'update' then
            format('update public.%I set %s where true', t,
                   case when t = 'party_hunt' then 'stance = stance'
                        else 'owned = owned' end)
          when t = 'party_hunt' then
            'insert into public.party_hunt (party_id, active_id, accrued_to) values '
            || '(gen_random_uuid(), ''slime'', now())'
          else
            'insert into public.party_tick_lease (party_id) values (gen_random_uuid())'
        end;
        get diagnostics v_n = row_count;
      exception when others then
        v_state := sqlstate;
      end;
      reset role;
      if v_state is null then
        raise exception 'GATE(a): `authenticated` %ED public.% and it was ACCEPTED (% row(s)). A client that can write here can start its own party hunt, or lease its own party away from the tick.', upper(v_dml), t, v_n;
      end if;
      if v_state <> '42501' then
        raise exception 'GATE(a): the % probe on public.% raised % — that is not the privilege refusal this gate measures, so the gate is grading its own typo rather than the fence.', v_dml, t, v_state;
      end if;
    end loop;
  end loop;

  -- (a2) RLS ARMED, AND NO WRITE POLICY ANYWHERE. (a) would also pass on a
  --      table nobody granted anything on; this says the refusal comes from the
  --      shape we designed.
  foreach t in array array['party_hunt','party_tick_lease'] loop
    if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = t) then
      raise exception 'GATE(a2): row level security is NOT enabled on public.%', t;
    end if;
    select count(*) into v_n from pg_policies
     where schemaname = 'public' and tablename = t and cmd <> 'SELECT';
    if v_n > 0 then
      raise exception 'GATE(a2): public.% carries % non-SELECT policy/policies. The RPCs are the only door (§18.2.2).', t, v_n;
    end if;
  end loop;
  -- (a3) THE TABLE PRIVILEGE MATRIX, EVERY ROLE, NOT JUST THE ONE (a) DROVE.
  --      S1's B11 exactly, at S2's two tables: (a) proves `authenticated` is
  --      refused, and a stray privilege left on `anon`, `PUBLIC`,
  --      `service_role`, `hr_engine` or `hr_tick` would pass it untouched. It
  --      matters most for `service_role`, which is BYPASSRLS — for it the
  --      revoke is the ONLY fence, and a SELECT there reads every party hunt in
  --      the game past every policy. `party_hunt`'s own revoke names four roles
  --      and the lease's names six; this asserts the RESULT rather than the
  --      list, so a role nobody thought to name is caught too.
  for v_dml, t in
    select g.grantee, g.table_name from information_schema.role_table_grants g
     where g.table_schema = 'public'
       and g.table_name in ('party_hunt','party_tick_lease')
       and g.grantee <> 'postgres'
       and not (g.table_name = 'party_hunt' and g.grantee = 'authenticated'
                and g.privilege_type = 'SELECT')
  loop
    raise exception 'GATE(a3): % holds a table privilege on public.% that this batch does not grant. authenticated gets SELECT on party_hunt and nothing else gets anything: party_tick_lease is the TICK''s bookkeeping and service_role is BYPASSRLS, so for it the revoke is the only fence there is.', v_dml, t;
  end loop;

  -- party_tick_lease has NO policy at all — §18.2.2, and the absence is the
  -- fence. A SELECT policy appearing here later would hand a player the tick's
  -- own lease bookkeeping.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'party_tick_lease';
  if v_n <> 0 then
    raise exception 'GATE(a2): public.party_tick_lease carries % policy/policies. §18.2.2 gives it NONE: with RLS armed and no policy a client read is refused by ABSENCE, which is the strongest form available.', v_n;
  end if;

  -- (b) B-A2, THE STATIC HALF. No policy of this file may reach a predicate
  --     the CALLING role does not hold EXECUTE on: a USING clause runs as the
  --     caller, so hr_party_of inside one needs the grant that makes it a
  --     sweepable membership oracle.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename in ('party_hunt','party_tick_lease')
                and (coalesce(qual,'') || coalesce(with_check,'') like '%hr_party_of%'
                  or coalesce(qual,'') || coalesce(with_check,'') like '%hr_party_role%'
                  or coalesce(qual,'') || coalesce(with_check,'') like '%hr_partied%')) then
    raise exception 'GATE(b): a policy on an S2 table reaches hr_party_of, hr_party_role or hr_partied. §18.2.2 proposes exactly that and the S1 lane MEASURED it unbuildable (a USING clause runs as the CALLING role, so it needs EXECUTE granted to authenticated). §18-SEC-2 B-A2 rules that S2 must not read the predicate out of §18.2.2 — read it out of S1''s code, which resolves through party_member.';
  end if;
  -- And it may not READ ITS OWN TABLE. The test is on a FROM position, not on
  -- a mention: pg_policies renders the policy's own table as a COLUMN
  -- qualifier (`m.party_id = party_hunt.party_id`), so a bare `like
  -- '%party_hunt%'` would grade the correct policy as the recursive one — a
  -- gate red for the shape it exists to require.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'party_hunt'
                and coalesce(qual,'') || coalesce(with_check,'')
                    ~* 'from[[:space:]]+(public[.])?party_hunt[^_a-z]') then
    raise exception 'GATE(b): party_hunt''s policy SELECTS FROM party_hunt in its own USING clause. Postgres answers 42P17 on the first read and the panel is dead, not slow (S-7).';
  end if;

  -- (c)(c1)(c2)(d)(e) need rows. ── SUBTRANSACTION ─────────────────────────
  begin
    insert into auth.users (id) values (v_a), (v_b);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', v_r->>'ok') is distinct from 'true' then
      raise exception 'GATE: no probe character A: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', v_r->>'ok') is distinct from 'true' then
      raise exception 'GATE: no probe character B: %', v_r; end if;

    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_p;
    insert into public.party_member (party_id, user_id, slot, role) values (v_p, v_a, 0, 'leader');

    -- (c) hr_party_hunt_live IS THE REAL EXISTENCE TEST NOW. False with no
    --     hunt, TRUE with one, false again once it ends — three readings,
    --     because a body that answered TRUE unconditionally would pass a
    --     one-reading gate and refuse every accept in the game.
    if public.hr_party_hunt_live(v_p) is distinct from false then
      raise exception 'GATE(c): hr_party_hunt_live answered TRUE for a party with NO hunt row. It would refuse every accept in the game.';
    end if;
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_p, 'slime', now() - interval '10 minutes') returning id into v_h;
    if public.hr_party_hunt_live(v_p) is distinct from true then
      raise exception 'GATE(c): hr_party_hunt_live answered FALSE against a LIVE party_hunt row. S1 shipped `select false` and named S2 as the owner of this body; it is still the stub, and S-11''s refusal is dead.';
    end if;
    update public.party_hunt set ended_at = now(), stopped_by = 'gate' where id = v_h;
    if public.hr_party_hunt_live(v_p) is distinct from false then
      raise exception 'GATE(c): hr_party_hunt_live answered TRUE for an ENDED hunt — it reads the row, not ended_at.';
    end if;
    update public.party_hunt set ended_at = null, stopped_by = null where id = v_h;

    -- (e) ONE LIVE HUNT PER PARTY, AND THE INDEX IS THE AUTHORITY.
    begin
      insert into public.party_hunt (party_id, active_id, accrued_to)
        values (v_p, 'rat', now());
      raise exception 'GATE(e): party_hunt_one_live did NOT refuse a SECOND live hunt for one party. Two live hunts means two watermarks for one member set, and invariant 8''s equality has no meaning.';
    exception when unique_violation then null;
    end;

    -- (c1) S1'S CALL SITE IS STILL REACHED — read off the INSTALLED body, with
    --      comments stripped so a commented-out call cannot pass.
    select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_party_accept';
    if v_src is null or position('hr_party_hunt_live' in v_src) = 0 then
      raise exception 'GATE(c1): hr_party_accept no longer NAMES hr_party_hunt_live. S1 built the refusal path so S2 could change one body and inherit a tested refusal; with the call site gone, giving the predicate a real body buys nothing and a player joins mid-hunt with their own accrued_to days back.';
    end if;

    -- (c2) AND THE REFUSAL FIRES, against a REAL live hunt rather than against
    --      a stub. S1 §8(f) proved it by replacing the predicate inside the
    --      apply's own transaction; Security's B9 rules that must NOT be
    --      carried into S2, where the predicate is load-bearing. So this arm
    --      plants the row instead, and the row is what the predicate reads.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters;
    v_r := public.hr_party_invite(0, (select coalesce(pr.display_name, '')
                                        from public.profiles pr where pr.id = v_b),
                                  gen_random_uuid());
    -- The invite is answered only if B has claimed a name; if this deployment
    -- has no display name for the probe, claim one and retry ONCE rather than
    -- grading the absence of a name as the absence of the refusal.
    if coalesce(v_r->>'ok','') <> 'true' then
      perform set_config('request.jwt.claim.sub', v_b::text, true);
      perform public.claim_display_name('Gate B8020002');
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      delete from public.hr_rate_counters;
      v_r := public.hr_party_invite(0, 'Gate B8020002', gen_random_uuid());
    end if;
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(c2): the probe invite was refused (%) — the arm cannot measure S-11''s refusal without a live card, and a gate that cannot reach its subject must say so rather than pass.', v_r;
    end if;
    select id into v_card from public.party_invite
     where party_id = v_p and user_id = v_b and accepted_at is null and revoked_at is null;
    if v_card is null then
      raise exception 'GATE(c2): no live invite card exists after an ok invite.';
    end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    delete from public.hr_rate_counters;
    v_r := public.hr_party_accept(0, v_card, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'party_hunt_running' then
      raise exception 'GATE(c2): accepting into a party with a LIVE party_hunt answered %. S-11 requires party_hunt_running, and this is the first time that refusal has ever been measured against a real hunt row rather than against a stub.', v_r;
    end if;
    if exists (select 1 from public.party_member where party_id = v_p and user_id = v_b
                 and left_at is null) then
      raise exception 'GATE(c2): the refused accept WROTE a membership row.';
    end if;

    -- (d) ★ THE TWO ROSTERS ARE DISJOINT ★ (S-8), for a character planted in a
    --     party with a live hunt. This is invariant 7's standing assertion and
    --     it is executed here at apply time as well as in
    --     tests/party-settle.mjs, because the failure is not symmetric: the
    --     solo settle would pay one member the whole party's stream and the
    --     party settle would then fail its CAS and the party would wedge.
    --
    --     The arm is only meaningful if the character WOULD otherwise be
    --     served, so it is built in two readings: with the hunt ENDED the
    --     per-character roster offers the character, and with it LIVE the
    --     roster offers nothing. A one-reading arm would pass against a roster
    --     that serves nobody at all.
    update public.player_state
       set active_kind = 'combat', active_id = 'slime', active_since = now(),
           accrued_to = now() - interval '5 minutes'
     where user_id = v_a and slot = 0;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
      values (v_a, 0, 'combat', true)
      on conflict (user_id, slot, channel) do update set owned = true;
    update public.hr_tick_config set enabled = true, channels = array['combat','gather']::text[]
     where id;

    update public.party_hunt set ended_at = now(), stopped_by = 'gate' where party_id = v_p;
    select count(*) into v_n from public.hr_tick_roster(array['combat']::text[], 0, 50, 'gate-s2')
     where user_id = v_a and slot = 0;
    if v_n <> 1 then
      raise exception 'GATE(d): with NO live hunt the per-character roster offered the planted character % time(s), not once. The disjointness arm below would then pass against a roster that serves nobody, which is the vacuous proof this reading exists to refuse.', v_n;
    end if;
    update public.hr_tick_ownership set lease_holder = null, lease_until = null
     where user_id = v_a and slot = 0 and channel = 'combat';

    update public.party_hunt set ended_at = null, stopped_by = null where party_id = v_p;
    if not public.hr_partied(v_a, 0) then
      raise exception 'GATE(d): hr_partied answered FALSE for a live member of a party with a live hunt. Invariant 7''s predicate does not fire, so nothing is excluded anywhere.';
    end if;
    select count(*) into v_n from public.hr_tick_roster(array['combat']::text[], 0, 50, 'gate-s2')
     where user_id = v_a and slot = 0;
    if v_n <> 0 then
      raise exception 'GATE(d): the PER-CHARACTER roster still offers a character whose party has a LIVE hunt (% row(s)). The two rosters are NOT disjoint: the solo settle would pay that member the whole party stream and the party settle would then fail its CAS and wedge (S-8).', v_n;
    end if;

    -- (f) THE ROSTER PATCH IS IN, EXACTLY ONCE, AND NOTHING ELSE MOVED.
    select regexp_replace(pg_get_functiondef(
             'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)'::regprocedure),
             chr(13), '', 'g') into v_src;
    v_n := (length(v_src) - length(replace(v_src, 'hr_partied(o.user_id, o.slot)', '')))
           / length('hr_partied(o.user_id, o.slot)');
    if v_n <> 1 then
      raise exception 'GATE(f): the installed hr_tick_roster carries the invariant-7 clause % time(s), not once.', v_n;
    end if;
    -- The terms the patch must NOT have moved. Each is load-bearing and each
    -- is named in the roster file''s own header: the effective-watermark
    -- LATERAL (M-1), the skip-locked claim (the rolling-deploy property), the
    -- keyset sentinel (D5), and the seed rendering (T-2).
    foreach t in array array['greatest(ps.accrued_to',
                             'for update of o skip locked',
                             'coalesce(p_after_slot, 2147483647)',
                             'to_jsonb(l.mark)'] loop
      if position(t in v_src) = 0 then
        raise exception 'GATE(f): the patched hr_tick_roster no longer carries "%". The patch is supposed to carry every other line VERBATIM out of the live body; something restated it.', t;
      end if;
    end loop;

    -- (g) hr_tick_shadow's CHANNEL CHECK IS UNCHANGED (§18-SEC.3's S2 list).
    --     `party` is a unit of SCHEDULING, not a kind of work: a party settle
    --     writes ordinary `channel = 'combat'` rows and neither CHECK widens.
    if not exists (select 1 from pg_constraint c
                    join pg_class r on r.oid = c.conrelid
                    join pg_namespace n on n.oid = r.relnamespace
                   where n.nspname = 'public' and r.relname = 'hr_tick_shadow'
                     and c.conname = 'hr_tick_shadow_channel_ck'
                     and pg_get_constraintdef(c.oid) like '%''combat''%'
                     and pg_get_constraintdef(c.oid) like '%''gather''%'
                     and pg_get_constraintdef(c.oid) like '%''artisan''%'
                     and pg_get_constraintdef(c.oid) not like '%party%') then
      raise exception 'GATE(g): hr_tick_shadow_channel_ck is not the three-value CHECK it was. `party` is NOT a new tick channel (§18.2.1a) and widening this is how it would quietly become one.';
    end if;
    -- And the new column is NULLABLE and carries no default — a catalog-only
    -- add. A NOT NULL or a DEFAULT here rewrites the heap, which is the whole
    -- of S-16's correction.
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'hr_tick_shadow' and column_name = 'party'
       and is_nullable = 'YES' and column_default is null and data_type = 'jsonb';
    if v_n <> 1 then
      raise exception 'GATE(g): hr_tick_shadow.party is not a plain NULLABLE jsonb with no default. A default or a NOT NULL rewrites the heap, which is exactly the ACCESS EXCLUSIVE drain §16 refused this column over (S-16).';
    end if;

    raise exception using errcode = 'HR825', message = 'm8-parties-s2-1 §7 complete — rolling back';
  exception when sqlstate 'HR825' then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (h) THE PRIVILEGE MATRIX FOR THIS FILE'S TWO FUNCTIONS, PER ROLE.
  foreach t in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(t, 'public.hr_partied(uuid,integer)', 'execute') then
      raise exception 'GATE(h): % holds EXECUTE on hr_partied — a client-callable membership predicate is an oracle it can sweep (hr_clan_may_admit''s rule).', t; end if;
    if has_function_privilege(t, 'public.hr_party_hunt_live(uuid)', 'execute') then
      raise exception 'GATE(h): % holds EXECUTE on hr_party_hunt_live', t; end if;
    if has_function_privilege(t, 'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)', 'execute') then
      raise exception 'GATE(h): % holds EXECUTE on hr_tick_roster', t; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    if not has_function_privilege('hr_engine', 'public.hr_partied(uuid,integer)', 'execute') then
      raise exception 'GATE(h): hr_engine cannot call hr_partied — the edge''s invariant-8 fence on `accrue` and every collectsFirst verb ships dead, and a partied character re-prices a window three other people are paid from.'; end if;
    -- THE SELECTOR AND THE SETTLER STAY DIFFERENT ROLES (§15c). A settling
    -- role that could roster could stamp its own lease, and "choose whose world
    -- ticks" would be one grant deep instead of two.
    if has_function_privilege('hr_engine', 'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)', 'execute') then
      raise exception 'GATE(h): hr_engine holds EXECUTE on hr_tick_roster. The selector and the settler are different roles and neither may become the other.'; end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    if not has_function_privilege('hr_tick', 'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)', 'execute') then
      raise exception 'GATE(h): hr_tick lost EXECUTE on hr_tick_roster — §5b''s patch re-executed the body and the grant did not survive.'; end if;
  end if;

  -- (z) THE BLOCK LEAVES NO ROWS, AND THE TWO NEW TABLES ARE EMPTY. Counting
  --     is the proof; the HR825 rollback is only the method.
  if exists (select 1 from public.party_hunt)
     or exists (select 1 from public.party_tick_lease)
     or exists (select 1 from public.party_member where user_id in (v_a, v_b))
     or exists (select 1 from public.party where leader_user in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_tick_ownership where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_tick_shadow where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'GATE(z): §7 LEAKED a probe row';
  end if;
  select (select count(*) from public.party_hunt)
       + (select count(*) from public.party_tick_lease) into v_n;
  if v_n <> 0 then
    raise exception 'GATE(z): the S2 tables hold % row(s) after apply. This file ships them EMPTY: a party hunt exists because a leader started one, never because a migration seeded it.', v_n;
  end if;

  raise notice 'm8-parties-s2-1: party_hunt and party_tick_lease are RLS-armed with no client DML on any of the six verb/table pairs (party_tick_lease carries NO policy at all); no policy reaches hr_party_of/hr_party_role/hr_partied (B-A2) and none reads its own table; hr_party_hunt_live is the REAL existence test and reads false/true/false across a hunt''s life; S1''s hr_party_accept still NAMES it and a real accept into a real live hunt answered party_hunt_running writing no row; the two rosters are DISJOINT for a planted party member and the same character IS offered with the hunt ended, so the arm is not vacuous; hr_tick_roster carries the invariant-7 clause exactly once with its watermark LATERAL, skip-locked claim, keyset sentinel and seed rendering all intact; hr_tick_shadow.channel''s CHECK is unchanged and `party` is a plain nullable jsonb with no default; hr_partied is hr_engine-only, hr_tick_roster is hr_tick-only and hr_engine does NOT hold it; and the block left ZERO rows behind';
end $$;
