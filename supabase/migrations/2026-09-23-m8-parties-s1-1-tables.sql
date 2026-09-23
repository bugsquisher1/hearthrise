-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-23-m8-parties-s1-1-tables.sql — M8 SLICE 1, FILE 1 OF 3:
--   THE THREE MEMBERSHIP TABLES, THE TWO PREDICATES, AND THE ONE CROSS-USER READ.
--
-- Scope is Security's own ruling on the M8 design (docs/planning/
-- WORLD_TICK_DESIGN.md §18-SEC.0): *"YES — M8 slice 1 may be briefed to a
-- backend lane now, scoped to MEMBERSHIP ONLY … touching NO money surface: no
-- party_hunt, no party_tick_lease, no settle, no split, no hr_apply
-- reachability."* Nothing in this batch can move a coin, an item, an XP point
-- or a rank, and §7(z) of THIS file asserts that by execution rather than by
-- claim — the money-surface functions are named and proved absent.
--
-- ── WHAT LANDS HERE ─────────────────────────────────────────────────────────
--   public.party           the roster object (§18.2.1), minus everything S2 owns
--   public.party_member    the membership row + INVARIANT 1 and INVARIANT 2
--   public.party_invite    clan_invites' shape at a 15-minute expiry (§18.2.1)
--   hr_party_of(uuid,int)      -> uuid    which live party a character is in
--   hr_party_role(uuid,uuid,int) -> text  'leader' | 'member' | null
--   hr_party_hunt_live(uuid)   -> boolean S2's predicate, FALSE in S1 (S-11)
--   hr_party_view(uuid)        -> jsonb   the ONE cross-user read (S-7)
--
-- The five verbs are file 2. The client-surface record is file 3. Read the
-- three as one batch: file 1 GRANTS hr_party_view to `authenticated`, and until
-- file 3 records it in hr_client_rpc_baseline the nightly hr-grant-hygiene job
-- RAISES on `unapproved_client_rpcs`. That is the S-14 rule and it is the same
-- warning 2026-09-22-engine-allowlist-hunt-reads.sql carries:
--
--   ⚠ FILES 1, 2 AND 3 APPLY IN ONE SITTING, IN ORDER. A detector expected to
--     be red hides the next real regression, and that is the whole cost.
--
-- ── WHAT DELIBERATELY DOES NOT LAND ─────────────────────────────────────────
-- No `party_hunt`. No `party_tick_lease`. No `hr_tick_ownership.party_id`
-- (S-8 ruled that column may not be the authority). No settle, no split, no
-- roster sibling, no ledger row, no `hr_apply` call site, no meta key, no
-- `hr_tick_shadow` column, and no widening of any CHECK anywhere. §18-SEC.1
-- S-1 through S-4 are unanswered P0s in the design and every one of them
-- blocks S2 — none of them is reachable from anything in this file.
--
-- Also deliberately absent (S-16): the columns §18-SEC ruled out. `party` has
-- no `dissolved_by`, no member counter, no denormalised roster; a count is a
-- count under the row lock, which is what T-6 says a count must be.
--
-- ── RLS: NOBODY WRITES ANY OF THESE TABLES THROUGH A POLICY ─────────────────
-- §18.2.2, quoting 2026-08-11-clan-membership-authority.sql: *a client that
-- could INSERT here could invite itself.* Every table below is
-- `enable row level security` with SELECT policies ONLY. There is no INSERT,
-- UPDATE or DELETE policy anywhere in this file, so with RLS armed and no
-- policy, every client write is refused by absence rather than by predicate —
-- the strongest form available, and §7(a) EXECUTES it as `authenticated`
-- against all three tables and all three verbs rather than asserting it.
--
-- ── S-7: THE SELECT POLICY MAY NOT READ ITS OWN TABLE ───────────────────────
-- §18.2.2 proposed `party_member`'s SELECT policy as *"auth.uid() = user_id OR
-- live co-member"*, where the co-member predicate selects from `party_member`.
-- A policy on T whose USING clause reads T recurses, and the panel is then not
-- slow, it is dead. S-7's proposed fix — put hr_party_of in the USING clause —
-- CANNOT BE BUILT: a USING clause runs as the CALLING role, so it needs EXECUTE
-- granted to `authenticated`, which is the oracle S-7's own citation of
-- hr_clan_may_admit forbids. §5e states the measurement and the resolution:
-- the policy reads the caller's OWN row and nothing else, and the roster is
-- read through hr_party_view. THIS IS A FINDING BACK TO SECURITY, not a
-- deviation taken quietly.
--
-- ── S-7, THE SECOND HALF: hr_party_view IS THE ONLY CROSS-USER READ M8 ADDS ──
-- The panel renders another player's name, combat level and HP bar. None of
-- these three tables carries any of that, so without a designed read surface it
-- gets invented at code time by someone reaching for a cross-user select on
-- player_state. hr_party_view is that surface and its column set is FROZEN:
--
--     display name · combat level · hp · hp_max · recovering_until
--     · share_bp · xp · gold   (the last settled window's — NULL in S1)
--
-- and nothing else. Never inventory, never a gold BALANCE, never the ledger,
-- never activity detail, never another member's envelope. The three settle
-- columns exist and answer NULL because S2 owns what fills them: the shape is
-- reviewed now, once, rather than arriving inside the money slice. §7(c)
-- asserts the key set EXACTLY — an added key fails the apply, which is the
-- point of freezing it.
--
-- ── S-11: hr_party_hunt_live IS S2'S, AND IT IS FALSE TODAY ─────────────────
-- `party_accept` must be refused with `party_hunt_running` while the party has
-- a live hunt (S-11: otherwise the new member is inside the next party window
-- with their own accrued_to days back, and the settle either wedges forever or
-- confiscates that player's entire away window). There is no `party_hunt` table
-- in S1, so the predicate is one function that returns FALSE and says who owns
-- it. The REFUSAL PATH AND ITS TEST EXIST NOW, so S2 changes one function body
-- and inherits a tested refusal instead of writing one under time pressure.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Apply file 3, then 2, then 1 in reverse:
--   drop function public.hr_party_view(uuid), public.hr_party_hunt_live(uuid),
--                 public.hr_party_role(uuid,uuid,int), public.hr_party_of(uuid,int);
--   drop table public.party_invite, public.party_member, public.party cascade;
-- Purely additive: no existing table, function, policy, grant, CHECK or
-- catalogue row is touched by this file. Nothing to roll back but its own
-- objects, and no player row exists in them until a player forms a party.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS ───────────────────────────────────────────────────────
-- Every one of these is read or called by something below. A file that creates
-- its objects against a missing dependency installs a function that fails on
-- its first real call instead of at apply time.
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'PRECONDITION: public.player_state is absent — apply 2026-08-11-player-state.sql first.';
  end if;
  if to_regclass('public.player_skills') is null then
    raise exception 'PRECONDITION: public.player_skills is absent — hr_party_view derives combat level from it.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'PRECONDITION: public.profiles is absent — it is the display-name source for hr_party_view.';
  end if;
  if to_regprocedure('public.hr_lb_combat_level(int,int,int,int,int,int,int)') is null then
    raise exception 'PRECONDITION: hr_lb_combat_level is absent — apply 2026-08-18-leaderboard-server-source.sql first. A second copy of the combat-level formula is the drift that file exists to refuse.';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null
     and to_regprocedure('public.hr_level_from_xp(numeric)') is null then
    raise exception 'PRECONDITION: hr_level_from_xp is absent — levels are DERIVED from stored xp, never stored.';
  end if;
end $$;

-- ── 2. public.party — THE ROSTER OBJECT ────────────────────────────────────
-- §18.2.1 verbatim, minus nothing and plus nothing. `size_cap` carries the
-- CHECK `between 2 and 4` that T-6 names as one of its two enforcement points;
-- the other is the re-count under the row lock, which lives in file 2's accept.
create table if not exists public.party (
  id            uuid primary key default gen_random_uuid(),
  leader_user   uuid not null references auth.users(id) on delete cascade,
  leader_slot   int  not null check (leader_slot between 0 and 5),
  size_cap      int  not null default 4 check (size_cap between 2 and 4),
  created_at    timestamptz not null default now(),
  dissolved_at  timestamptz,
  version       bigint not null default 0
);
comment on table public.party is
  'M8 S1 (2026-09-23). The roster unit. Written ONLY by the hr_party_* verbs '
  '(SECURITY DEFINER, server clock, per-call and per-day clamps). No client '
  'INSERT/UPDATE/DELETE policy exists and none may be added: a client that '
  'could write here could make itself a leader.';

alter table public.party enable row level security;
-- TABLE PRIVILEGE **AND** RLS, not RLS alone. Supabase's default ACL on
-- `public` grants ALL on a new table to anon/authenticated/service_role, and
-- with the privilege left in place an UPDATE or DELETE that RLS filters returns
-- ZERO ROWS RATHER THAN AN ERROR — indistinguishable in a log from a write that
-- was simply about nothing. Revoked, every client write raises 42501 whatever
-- the predicate would have said, and §7(a) can require an ERROR rather than a
-- row count. service_role is BYPASSRLS, so for it the revoke is the ONLY fence.
revoke all on public.party from public, anon, authenticated, service_role;
grant  select on public.party to authenticated;

-- The SELECT policy is §5e, AFTER hr_party_of exists: it resolves membership
-- through that SECURITY DEFINER predicate (S-7) and the predicate reads
-- party_member, so the tables must be created before either can be written.

-- ── 3. public.party_member — AND THE TWO INVARIANTS AS INDEXES ─────────────
-- §18.2.3 invariants 1 and 2, *"enforced by indexes rather than by a read"*.
-- A read-then-write check is the shape the clan member-cap bug turned on: two
-- concurrent accepts both read 3 and both insert. A partial unique index cannot
-- be raced, and §7(d) EXECUTES both duplicate inserts and requires the unique
-- violation — an index that has never been red is not an invariant.
create table if not exists public.party_member (
  party_id  uuid not null references public.party(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  slot      int  not null check (slot between 0 and 5),
  role      text not null default 'member' check (role in ('leader','member')),
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  -- WHO REMOVED THEM. NULL = they left of their own accord. It is the removal
  -- audit, and it is also the ONLY thing that makes §18.3's stated
  -- `party_kick` clamp — *"20 / PARTY / day"* — spellable: player_progress is
  -- keyed (user, slot, kind, key, period_key), i.e. PER CHARACTER, so a kick
  -- counter kept there is per-leader and resets the moment leadership moves
  -- (invariant 3), which is a lever rather than a clamp. Counted off this
  -- column the clamp is exactly what §18.3 says it is.
  removed_by uuid references auth.users(id) on delete set null,
  primary key (party_id, user_id, slot)
);
comment on table public.party_member is
  'M8 S1 (2026-09-23). One row per character per party, left_at NULL while '
  'live. INVARIANT 1 (one party per character) and INVARIANT 2 (one character '
  'per user per party) are the two partial unique indexes below, not a read.';

-- INVARIANT 1 — one party per character.
create unique index if not exists party_member_one_live
  on public.party_member (user_id, slot) where left_at is null;
-- INVARIANT 2 — one character per USER per party. An account cannot fill a
-- party with its own slots (T-6's boxed-alt half).
create unique index if not exists party_member_one_char_per_user
  on public.party_member (party_id, user_id) where left_at is null;
-- The roster read every verb does: live members of one party, in the tenure
-- order invariant 3 transfers leadership by.
create index if not exists party_member_live_roster
  on public.party_member (party_id, joined_at, user_id) where left_at is null;

alter table public.party_member enable row level security;
revoke all on public.party_member from public, anon, authenticated, service_role;
grant  select on public.party_member to authenticated;

-- ── 4. public.party_invite — clan_invites' SHAPE, 15-MINUTE EXPIRY ─────────
-- §18.2.1: *"clan_invites' shape verbatim, with a 15-minute expiry instead of
-- 7 days and a slot column … plus the same partial unique index on the LIVE
-- row."*
--
-- ⚠ THE `slot` COLUMN IS THE RECEIVER'S CHARACTER, RESOLVED SERVER-SIDE.
--   A display name belongs to an ACCOUNT (public.profiles has one per user),
--   and a party is a list of CHARACTERS, so something has to choose which
--   character an invite is addressed to. It is not the sender: a sender-chosen
--   slot is a client value naming another player's character, and it would also
--   hand the sender a second oracle ("does Bram have a slot 3?") on top of the
--   one S-13 exists to close. File 2 resolves it inside hr_party_invite as the
--   target's MOST RECENTLY UPDATED character, which is a server value derived
--   from a server timestamp. That is also what makes S-13's receiver clamp
--   spellable: *"at most 5 live invites and 20 received PER CHARACTER per UTC
--   day"* has no meaning unless an invite names a character.
--
--   OPEN FOR SECURITY, stated rather than buried: the alternative is to address
--   the ACCOUNT and bind the slot at accept, which needs a different unique
--   index than the one §18.2.1 states and is a redesign of the accept path. S1
--   takes the shape §18 wrote down; the day joining mid-hunt is wanted (S-11's
--   own "returns later as collectsFirst plus a joined_at floor") is the day to
--   revisit both together.
create table if not exists public.party_invite (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references public.party(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  slot            int  not null check (slot between 0 and 5),
  invited_by_user uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '15 minutes'),
  accepted_at     timestamptz,
  revoked_at      timestamptz
);
comment on table public.party_invite is
  'M8 S1 (2026-09-23). A 15-minute invite addressed to one CHARACTER. The '
  'target is resolved from a display name INSIDE hr_party_invite and the '
  'sender is told nothing about the result (S-13): one refusal, '
  'invite_target_unavailable, for every unavailable reason alike.';

create unique index if not exists party_invite_live
  on public.party_invite (party_id, user_id, slot)
  where accepted_at is null and revoked_at is null;
-- The receiver's inbox read, and the index S-13's two clamps are counted on.
create index if not exists party_invite_inbox
  on public.party_invite (user_id, slot, created_at desc);

alter table public.party_invite enable row level security;
revoke all on public.party_invite from public, anon, authenticated, service_role;
grant  select on public.party_invite to authenticated;

-- ── 5. THE PREDICATES — SECURITY DEFINER, REVOKED FROM EVERY CLIENT ROLE ───
-- hr_clan_may_admit's shape (2026-08-11-clan-membership-authority.sql §6) and
-- for its reason: the permission a policy consults must be one the caller
-- cannot author, and a predicate a client can CALL is a membership oracle it
-- can sweep. Both are `stable sql`, read one table, and write nothing.

-- 5a. WHICH LIVE PARTY A CHARACTER IS IN. The one function every policy above
--     resolves membership through, so the recursion of S-7 has exactly one
--     place it could ever come back, and §7(b) watches that place.
create or replace function public.hr_party_of(p_user uuid, p_slot int)
returns uuid language sql stable security definer
set search_path = public, pg_catalog as $$
  select m.party_id from public.party_member m
   where m.user_id = p_user and m.slot = p_slot and m.left_at is null
$$;
revoke execute on function public.hr_party_of(uuid, int) from public;
revoke execute on function public.hr_party_of(uuid, int)
  from anon, authenticated, service_role;

-- 5b. THE LEADER PREDICATE. 'leader' | 'member' | null, §18.2.2's
--     hr_party_role(p_party, p_user, p_slot).
create or replace function public.hr_party_role(p_party uuid, p_user uuid, p_slot int)
returns text language sql stable security definer
set search_path = public, pg_catalog as $$
  select m.role from public.party_member m
   where m.party_id = p_party and m.user_id = p_user and m.slot = p_slot
     and m.left_at is null
$$;
revoke execute on function public.hr_party_role(uuid, uuid, int) from public;
revoke execute on function public.hr_party_role(uuid, uuid, int)
  from anon, authenticated, service_role;

-- 5b-ii. THE CHARACTER'S COMBAT LEVEL — ONE DERIVATION, ONE PLACE.
-- Both the level spread (S-12, re-checked on every accept in file 2) and
-- hr_party_view's roster row need it, and 2026-08-18-leaderboard-server-source
-- .sql says in its own header why a second copy is refused: *"two hand-written
-- copies of one formula is precisely the drift this repo has been burned by."*
-- So there is exactly one call site of hr_lb_combat_level for parties, here,
-- and the spread and the panel can never disagree about what level a member is.
--
-- The `coalesce(..., 1)` defaults are the leaderboard's, for its reason: a
-- character with no player_skills row yet is level 1 in the client's levelOf()
-- too, and a fresh character's combat level must not differ between the party
-- panel and their own screen.
create or replace function public.hr_party_level(p_user uuid, p_slot int)
returns int language sql stable security definer
set search_path = public, pg_catalog as $$
  select public.hr_lb_combat_level(
           coalesce(max(lv.level) filter (where lv.skill_id = 'attack'),    1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'strength'),  1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'defense'),   1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'hitpoints'), 1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'prayer'),    1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'ranged'),    1),
           coalesce(max(lv.level) filter (where lv.skill_id = 'magic'),     1))
    from (select s.skill_id, public.hr_level_from_xp(s.xp) as level
            from public.player_skills s
           where s.user_id = p_user and s.slot = p_slot) lv
$$;
revoke execute on function public.hr_party_level(uuid, int) from public;
revoke execute on function public.hr_party_level(uuid, int)
  from anon, authenticated, service_role;

-- 5c. S-11'S PREDICATE, AND ITS OWNER IS NAMED ──────────────────────────────
-- ⚠ S2 OWNS THIS BODY. It returns FALSE because in S1 there is no party_hunt
--   table for it to read, and it exists at all so that the refusal path it
--   guards — party_accept -> 'party_hunt_running' — is WRITTEN AND TESTED NOW
--   (tests/party-membership.mjs stubs it to TRUE and requires the refusal).
--   When S2 lands `public.party_hunt`, this body becomes
--
--     select exists (select 1 from public.party_hunt h
--                     where h.party_id = p_party and h.ended_at is null)
--
--   and nothing else in the batch changes. A `false` literal here is not a
--   stub that will be forgotten: file 2's accept calls it on every call, and
--   the node guard's stub proves the call site is reached.
create or replace function public.hr_party_hunt_live(p_party uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select false
$$;
comment on function public.hr_party_hunt_live(uuid) is
  'M8 S1 (2026-09-23), Security S-11. FALSE in S1 — there is no party_hunt '
  'table yet. OWNED BY S2: when public.party_hunt lands, this body becomes a '
  'live-row existence test and the party_hunt_running refusal in '
  'hr_party_accept starts firing. The refusal path and its test exist now.';
revoke execute on function public.hr_party_hunt_live(uuid) from public;
revoke execute on function public.hr_party_hunt_live(uuid)
  from anon, authenticated, service_role;

-- ── 5e. THE SELECT POLICIES — SELECT ONLY, AND PROVABLY NON-RECURSIVE ─────
--
-- ⚠ S-7'S FIX AS WRITTEN CANNOT BE BUILT, AND THIS IS THE FINDING THIS FILE
--   OWES BACK TO SECURITY. §18-SEC.1 S-7 says: *"Use hr_party_of(auth.uid(),
--   slot), which S1 builds anyway."* MEASURED on the chain replay: a policy
--   USING clause is evaluated AS THE CALLING ROLE, so `authenticated` reading
--   party_member gets
--
--       42501  permission denied for function hr_party_of
--
--   on every read. Making that work means granting EXECUTE on hr_party_of to
--   `authenticated` — which is precisely what S-7's own citation forbids
--   (hr_clan_may_admit is revoked from every client role because a
--   client-callable membership predicate is an oracle it can sweep: hand it
--   any (user, slot) and it answers which party that character is in, for
--   every character in the game). The two halves of S-7 cannot both be had by
--   putting the predicate in the policy.
--
--   THE RESOLUTION, and it is narrower than §18.2.2 in every direction:
--   TAKE THE RECURSION OUT BY REMOVING THE READ, not by hiding it in a
--   function. A player's policy on party_member is `auth.uid() = user_id` —
--   their OWN row, no subselect, no function, nothing to recurse into — and
--   the ROSTER is read through hr_party_view, which is S-7's own second half:
--   SECURITY DEFINER, refuses a non-member, FROZEN column set, one reviewed
--   surface. So the cross-user read still exists, still works, and now has
--   exactly one door instead of two. hr_party_of and hr_party_role stay
--   revoked from anon, authenticated and service_role, which §7(g) asserts
--   per role.
--
--   §7(b) proves BOTH halves: no policy on these tables names party_member or
--   either predicate in its USING clause (the static half), and a member reads
--   their row while a non-member reads zero, neither raising (the behavioural
--   half, which is the only one that would have caught 42P17 or 42501).

-- `party` — readable by a live member of it. This reads party_member, a
-- DIFFERENT table, whose own policy below reads nothing at all — so the chain
-- terminates in one step and cannot recurse however it is entered.
drop policy if exists "party readable by live members" on public.party;
create policy "party readable by live members" on public.party
  for select to authenticated
  using (exists (select 1 from public.party_member m
                  where m.party_id = party.id
                    and m.user_id = (select auth.uid())
                    and m.left_at is null));

-- `party_member` — YOUR OWN ROW. `(select auth.uid())` rather than the bare
-- call so the planner evaluates it once as an InitPlan instead of per row:
-- get_advisors flags the bare form as auth_rls_initplan, and 2026-08-11-player
-- -state.sql took the same care on all eight player tables for the same reason.
-- The roster is hr_party_view's job.
drop policy if exists "party members readable by the party" on public.party_member;
create policy "party members readable by the party" on public.party_member
  for select to authenticated using ((select auth.uid()) = user_id);

-- `party_invite` — §18.2.2: *"auth.uid() = user_id (your own invites only)"*.
-- Deliberately NOT readable by the SENDER: a sender who could read the row
-- could tell a live invite from a refused one, which is exactly the oracle
-- S-13 closes at the verb.
drop policy if exists "own party invites readable" on public.party_invite;
create policy "own party invites readable" on public.party_invite
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── 5d. THE `party` RATE BUCKET — PROGRAMMATIC ADDITIVE PATCH ──────────────
-- It lands HERE, ahead of hr_party_view, because an UNKNOWN bucket fails CLOSED
-- (`else return false`): without it the view and all five verbs of file 2 would
-- answer `rate_limited` forever and deploy green and dead. Patched at the case
-- terminator rather than restated, so this file takes over no last-toucher role
-- for hr_rpc_gate and cannot silently revert a bucket another lane added
-- (2026-09-22-vigour-refill.sql §5's idiom, and its lesson).
--
-- 12/min, the RAREST band — the one clan_create/clan_join/clan_kick sit in, for
-- the reason 2026-08-11-clan-membership-authority.sql §7 gives: forming a
-- party, inviting, accepting, leaving and kicking are once-in-a-while acts, and
-- 12/min is already far above any human rate. It is the invite storm this band
-- is sized against, not the honest player.
--
-- ⚠ THE BUCKET IS NOT THE DAY CLAMP, and the two must not be confused. The
--   bucket is per USER per MINUTE and it is a flood fence. §18.3's per-day
--   clamps (20 invites / 20 accepts / 20 kicks / 10 creates per CHARACTER per
--   UTC day) are counted on player_progress `daily` rows in file 2, keyed by
--   (user, slot, key, hr_utc_day_key(now())) — per character, on the server
--   clock, exactly like ev:vigour_refills. A per-minute bucket cannot express
--   "20 a day" and a daily counter cannot stop a burst; S-13 needs both.
do $$
declare v_src text; v_new text; c_anchor constant text := 'else return false;' || chr(10) || '  end case;';
begin
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate is absent — an ungated client verb is not shippable.';
  end if;
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');
  if position('''party''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits the party bucket — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to patch blind.';
  end if;
  v_new := replace(v_src, c_anchor,
    'when ''party'' then v_limit := 12;' || chr(10) ||
    '    ' || c_anchor);
  execute v_new;
  raise notice 'hr_rpc_gate patched: the party bucket admitted at 12/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 6. hr_party_view — THE FROZEN CROSS-USER READ (S-7) ────────────────────
-- SECURITY DEFINER, and it refuses any caller who is not a live member of the
-- party it is asked about. The refusal is checked against auth.uid() and the
-- CALLER'S OWN characters — a caller cannot name someone else's slot to borrow
-- their membership, because the loop below only ever consults rows whose
-- user_id is auth.uid().
--
-- THE COLUMN SET IS FROZEN AND §7(c) ASSERTS IT EXACTLY. Adding a key here is
-- a code change with a review, which is the point: this is the one new
-- cross-user read M8 introduces, so it is where the review attention belongs.
--
-- share_bp / xp / gold are the LAST SETTLED WINDOW'S, and they are NULL in S1
-- because nothing settles yet. They are present so the shape is reviewed once,
-- now, rather than arriving inside the slice that also moves money.
create or replace function public.hr_party_view(p_party uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean := false;
  v_out jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_party is null then
    return jsonb_build_object('ok', false, 'error', 'bad_party');
  end if;

  -- THE MEMBERSHIP FENCE. Only the caller's OWN characters are consulted.
  select exists (select 1 from public.player_state ps
                  where ps.user_id = v_uid
                    and public.hr_party_of(v_uid, ps.slot) = p_party)
    into v_ok;
  if not v_ok then
    -- One refusal for "no such party" and "not your party" alike: a
    -- distinguishable pair would answer "does party <uuid> exist", and a uuid
    -- is guessable often enough over a day of a 120/min bucket to matter.
    return jsonb_build_object('ok', false, 'error', 'not_in_party');
  end if;

  select jsonb_build_object('ok', true, 'party_id', p_party,
           'members', coalesce(jsonb_agg(r.row order by r.joined_at, r.user_id), '[]'::jsonb))
    into v_out
    from (
      select m.joined_at, m.user_id,
             jsonb_build_object(
               'name',             coalesce(pr.display_name, 'Adventurer'),
               'combat_level',     public.hr_party_level(m.user_id, m.slot),
               'hp',               ps.hp,
               'hp_max',           ps.max_hp,
               'recovering_until', ps.recovering_until,
               -- S2's three. NULL until a party window settles; the KEYS are
               -- frozen here so the panel's shape is reviewed before the money
               -- slice, never after it.
               'share_bp',         null::int,
               'xp',               null::bigint,
               'gold',             null::bigint) as row
        from public.party_member m
        join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
        -- profiles.display_name, which claim_display_name keeps in step with
        -- public.display_names.name (2026-08-08-unique-names.sql §5b) — the
        -- same string file 2 resolves an invite and a kick against, so the
        -- panel never shows a member under a name the verbs will not accept.
        left join public.profiles pr on pr.id = m.user_id
       where m.party_id = p_party and m.left_at is null
    ) r;

  return v_out;
end $fn$;
comment on function public.hr_party_view(uuid) is
  'M8 S1 (2026-09-23), Security S-7. THE ONE cross-user read M8 adds. Refuses '
  'any caller who is not a live member. FROZEN column set: name, combat_level, '
  'hp, hp_max, recovering_until, share_bp, xp, gold — never inventory, never a '
  'gold BALANCE, never the ledger, never activity detail, never another '
  'member''s envelope. A column added here is a code change with a review.';

revoke execute on function public.hr_party_view(uuid)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_party_view(uuid) to authenticated;

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Security's own list for S1 (§18-SEC.3), EXECUTED — properties asserted by
-- running SQL, not by markers. The block plants two characters inside a
-- subtransaction and rolls every row back at HR823; §7(z) then COUNTS what is
-- left, because "player state is never fabricated" (CLAUDE.md §2) is a claim
-- this block has to prove about itself, not one it gets to make.
--
-- The verb-level arms (S-11, S-12, S-13) live in file 2's gate, where the verbs
-- exist. This gate is the tables, the policies, the indexes and the reads.
do $$
declare
  v_a    constant uuid := '00000000-0000-4000-8000-0000b8010001';
  v_b    constant uuid := '00000000-0000-4000-8000-0000b8010002';
  v_p    uuid;
  v_r    jsonb;
  v_err  text;
  v_n    int;
  v_keys text[];
  t      text;
  v_dml  text;
  v_state text;
begin
  -- (a) NO CLIENT DML, ON ANY OF THE THREE, BY EXECUTION.
  --     `set local role authenticated` and attempt each of INSERT, UPDATE and
  --     DELETE against each table: NINE attempts, every one required to RAISE.
  --     This is the clan lesson §18.2.2 quotes, run rather than quoted.
  --
  --     ⚠ THE ASSERTION IS ON THE SQLSTATE, NOT ON "it threw". A bare
  --       `when others then null` would grade a typo in the probe SQL as the
  --       fence working, which is the vacuous-proof failure tests/guard-
  --       hygiene.mjs R3 exists over. 42501 is the privilege refusal the
  --       revoke above produces; 42P01/42703 (the probe naming a table or
  --       column that is not there) are re-raised.
  foreach t in array array['party','party_member','party_invite'] loop
    foreach v_dml in array array['insert','update','delete'] loop
      v_state := null;
      begin
        set local role authenticated;
        execute case
          when v_dml <> 'insert' then
            -- A column that EXISTS on each table: a no-such-column probe raises
            -- 42703 during parse analysis and never reaches the privilege
            -- check, which is a gate measuring its own typo.
            format('%s public.%I %s where true',
                   case when v_dml = 'delete' then 'delete from' else v_dml end, t,
                   case when v_dml <> 'update' then ''
                        when t = 'party' then 'set size_cap = size_cap'
                        else 'set slot = slot' end)
          when t = 'party' then
            'insert into public.party (leader_user, leader_slot) values ('''
            || v_a || '''::uuid, 0)'
          when t = 'party_member' then
            'insert into public.party_member (party_id, user_id, slot) values '
            || '(gen_random_uuid(), ''' || v_a || '''::uuid, 0)'
          else
            'insert into public.party_invite (party_id, user_id, slot, invited_by_user) '
            || 'values (gen_random_uuid(), ''' || v_a || '''::uuid, 0, ''' || v_a || '''::uuid)'
        end;
        get diagnostics v_n = row_count;
      exception when others then
        v_state := sqlstate;
      end;
      reset role;
      if v_state is null then
        raise exception 'GATE(a): `authenticated` %ED public.% and it was ACCEPTED (% row(s)). A client that can write here can make itself a member (§18.2.2). The RPCs are the only door.', upper(v_dml), t, v_n;
      end if;
      if v_state <> '42501' then
        raise exception 'GATE(a): the % probe on public.% raised % — that is not the privilege refusal this gate measures, so the gate is grading its own typo rather than the fence.', v_dml, t, v_state;
      end if;
    end loop;
  end loop;

  -- (a2) AND RLS IS ACTUALLY ARMED, WITH NO WRITE POLICY. (a) above would also
  --      pass on a table nobody granted anything on; this says the refusal
  --      comes from the shape we designed.
  foreach t in array array['party','party_member','party_invite'] loop
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

  -- (c) hr_party_view's KEY SET IS FROZEN. Asserted on the real function's
  --     output shape, which is why it is built from a planted member below
  --     rather than from a literal.
  --
  -- (b)(c)(d)(e) all need rows. ── SUBTRANSACTION ───────────────────────────
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

    -- (d) THE TWO INVARIANTS ARE INDEXES, AND THEY BITE.
    --     INVARIANT 1 — one party per character.
    begin
      insert into public.party (leader_user, leader_slot) values (v_b, 0);
      insert into public.party_member (party_id, user_id, slot, role)
        values ((select id from public.party where leader_user = v_b), v_a, 0, 'member');
      raise exception 'GATE(d): party_member_one_live did NOT refuse a SECOND live party for the same character. Invariant 1 is not enforced, and a character could be settled by two parties in one window.';
    exception when unique_violation then null;
    end;
    --     INVARIANT 2 — one character per user per party.
    begin
      insert into public.party_member (party_id, user_id, slot, role) values (v_p, v_a, 1, 'member');
      raise exception 'GATE(d): party_member_one_char_per_user did NOT refuse a second SLOT of the same user in one party. Invariant 2 is not enforced, and one account could fill a party with itself (T-6).';
    exception when unique_violation then null;
    end;

    -- (b) S-7, BOTH HALVES.
    --     STATIC: no policy on party_member may read party_member, and no
    --     policy on any of the three may reach a predicate the caller does not
    --     hold EXECUTE on. Either shape is a read that raises rather than a
    --     read that returns, and the behavioural arm below would catch it only
    --     for the exact pair of roles it happens to try.
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'party_member'
                  and coalesce(qual,'') || coalesce(with_check,'') like '%party_member%') then
      raise exception 'GATE(b): a policy on party_member READS party_member in its own USING clause. That is S-7: Postgres answers 42P17 on the first read and the panel is dead, not slow.';
    end if;
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename in ('party','party_member','party_invite')
                  and (coalesce(qual,'') || coalesce(with_check,'') like '%hr_party_of%'
                    or coalesce(qual,'') || coalesce(with_check,'') like '%hr_party_role%')) then
      raise exception 'GATE(b): a policy reaches hr_party_of or hr_party_role. A USING clause runs as the CALLING role, so this only works if the predicate is GRANTED to authenticated — and a client-callable membership predicate is an oracle it can sweep (hr_clan_may_admit''s rule, which S-7 itself cites). Read the roster through hr_party_view instead.';
    end if;

    --     BEHAVIOURAL: as the member, a SELECT returns WITHOUT error (42P17
    --     recursion and 42501 on a predicate both land here, every time).
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    begin
      select count(*) into v_n from public.party_member where party_id = v_p;
    exception when others then
      reset role;
      raise exception 'GATE(b): reading party_member as a LIVE MEMBER raised % (%) — a party panel that cannot read the table it renders is the whole of S-7.', sqlstate, sqlerrm;
    end;
    reset role;
    if v_n < 1 then
      raise exception 'GATE(b): a live member read % of their own party_member rows — the policy is not recursing, it is refusing.', v_n;
    end if;
    --     As a non-member: zero rows, and still no error.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    begin
      select count(*) into v_n from public.party_member where party_id = v_p;
    exception when others then
      reset role;
      raise exception 'GATE(b): reading party_member as a NON-MEMBER raised % (%) — it must return zero rows, not an error.', sqlstate, sqlerrm;
    end;
    reset role;
    if v_n <> 0 then
      raise exception 'GATE(b): a NON-MEMBER read % party_member row(s) of a party they are not in.', v_n;
    end if;

    -- (e) S-7: hr_party_view REFUSES A NON-MEMBER.
    v_r := public.hr_party_view(v_p);          -- still auth.uid() = v_b
    if coalesce(v_r->>'error','') <> 'not_in_party' then
      raise exception 'GATE(e): hr_party_view answered a NON-MEMBER % — it is the one cross-user read M8 adds and it must refuse (S-7).', v_r;
    end if;
    if v_r ? 'members' then
      raise exception 'GATE(e): hr_party_view''s REFUSAL carried a members array — the refusal leaked the read it refused.';
    end if;

    -- (c) THE FROZEN COLUMN SET, read off the real answer to a real member.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_party_view(v_p);
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(c): hr_party_view refused a LIVE MEMBER: %', v_r; end if;
    if jsonb_array_length(v_r->'members') <> 1 then
      raise exception 'GATE(c): hr_party_view returned % member row(s) for a party of one', jsonb_array_length(v_r->'members'); end if;
    select array(select jsonb_object_keys(v_r->'members'->0) order by 1) into v_keys;
    if v_keys <> array['combat_level','gold','hp','hp_max','name','recovering_until','share_bp','xp'] then
      raise exception 'GATE(c): hr_party_view''s member shape is %, not the FROZEN set (S-7). Never inventory, never a gold balance, never the ledger, never activity detail, never another member''s envelope — and a NEW key is a code change with a review, which is why this is an equality.', v_keys;
    end if;
    if (v_r->'members'->0->>'share_bp') is not null
       or (v_r->'members'->0->>'xp') is not null
       or (v_r->'members'->0->>'gold') is not null then
      raise exception 'GATE(c): the last-settled-window fields answered non-NULL in S1. Nothing settles in this slice; a number here would be fabricated.';
    end if;

    -- (f) S-11'S PREDICATE EXISTS AND IS FALSE, AND ITS OWNER IS RECORDED.
    if public.hr_party_hunt_live(v_p) is distinct from false then
      raise exception 'GATE(f): hr_party_hunt_live is not FALSE in S1 — there is no party_hunt table for it to read.';
    end if;
    if to_regclass('public.party_hunt') is not null
       or to_regclass('public.party_tick_lease') is not null then
      raise exception 'GATE(f): a money-surface table from S2 exists. S1 is MEMBERSHIP ONLY (§18-SEC.0) and S-1 through S-4 are unanswered P0s that block S2.';
    end if;

    raise exception using errcode = 'HR823', message = 'm8-parties-s1-1 §7 complete — rolling back';
  exception when sqlstate 'HR823' then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (g) THE PREDICATES ARE CALLABLE BY NO CLIENT ROLE, AND THE VIEW BY
  --     `authenticated` ONLY. §18-SEC.3's S1 list, spelled per role.
  foreach t in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(t, 'public.hr_party_role(uuid,uuid,integer)', 'execute') then
      raise exception 'GATE(g): % holds EXECUTE on hr_party_role — the leader predicate is a permission the caller must not be able to consult, let alone author (hr_clan_may_admit''s rule).', t; end if;
    if has_function_privilege(t, 'public.hr_party_of(uuid,integer)', 'execute') then
      raise exception 'GATE(g): % holds EXECUTE on hr_party_of — a client-callable membership predicate is an oracle it can sweep.', t; end if;
    if has_function_privilege(t, 'public.hr_party_hunt_live(uuid)', 'execute') then
      raise exception 'GATE(g): % holds EXECUTE on hr_party_hunt_live', t; end if;
    if has_function_privilege(t, 'public.hr_party_level(uuid,integer)', 'execute') then
      raise exception 'GATE(g): % holds EXECUTE on hr_party_level — it reads another character''s skills and is internal to the party surface.', t; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_party_view(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_party_view(uuid)', 'execute') then
    raise exception 'GATE(g): hr_party_view is executable by anon or service_role — it is `authenticated` ONLY.'; end if;
  if not has_function_privilege('authenticated', 'public.hr_party_view(uuid)', 'execute') then
    raise exception 'GATE(g): `authenticated` cannot call hr_party_view — the panel''s only read surface ships dead.'; end if;
  -- And it is rate-gated: A9 (hr_assert_grant_hygiene check 8) requires every
  -- client-callable SECURITY DEFINER function to reach a gate, and a read the
  -- whole party polls is exactly the one that must.
  if position('hr_rpc_gate' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.proname = 'hr_party_view')) = 0 then
    raise exception 'GATE(g): hr_party_view is client-callable and does not reach hr_rpc_gate';
  end if;

  -- (z) THE BLOCK LEAVES NO ROWS. CLAUDE.md §2: player state is never
  --     fabricated, and a self-check that plants rows must prove it took them
  --     all back. Counting is the proof; the HR823 rollback is only the method.
  if exists (select 1 from public.party_member where user_id in (v_a, v_b))
     or exists (select 1 from public.party_invite where user_id in (v_a, v_b))
     or exists (select 1 from public.party where leader_user in (v_a, v_b))
     or exists (select 1 from public.player_state    where user_id in (v_a, v_b))
     or exists (select 1 from public.player_skills   where user_id in (v_a, v_b))
     or exists (select 1 from public.player_inventory where user_id in (v_a, v_b))
     or exists (select 1 from public.player_intents  where user_id in (v_a, v_b))
     or exists (select 1 from auth.users             where id in (v_a, v_b)) then
    raise exception 'GATE(z): §7 LEAKED a probe row';
  end if;
  -- And it created nothing in the three tables AT ALL — the strongest form,
  -- because it also catches a row planted under some other id.
  select (select count(*) from public.party)
       + (select count(*) from public.party_member)
       + (select count(*) from public.party_invite) into v_n;
  if v_n <> 0 then
    raise exception 'GATE(z): the party tables hold % row(s) after apply. This file ships them EMPTY: a party exists because two players formed one, never because a migration seeded it.', v_n;
  end if;

  raise notice 'm8-parties-s1-1: three tables RLS-armed with SELECT-only policies and no client DML on any of the nine verb/table pairs; both invariants refused their duplicate by unique violation; party_member''s policy reads the caller''s OWN row and nothing else, so there is no recursion to have and no predicate grant to need — S-7''s stated fix could not be built (a USING clause runs as the CALLING role) and the read was REMOVED instead; §7(b) refuses any policy that names party_member or either predicate, and behaviourally a member reads their own row while a non-member reads zero, neither erroring; the ROSTER is hr_party_view''s job; hr_party_view refuses a non-member, answers a member with the FROZEN eight-key shape and NULL settle fields; hr_party_hunt_live is FALSE and S2 owns it; the predicates are callable by no client role and the view by authenticated only, gated; and the block left ZERO rows behind';
end $$;
