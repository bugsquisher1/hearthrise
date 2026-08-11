-- ============================================================================
-- 2026-08-11-clan-membership-authority.sql
--
-- CLOSES  S-CAP-1 (no server-side join path) and S-KICK (no remedy).
-- COMPANION TO  2026-08-11-clan-member-cap.sql, which is already applied and
--               which BOUNDS the blast radius of S-CAP-3 without making the
--               join surface legitimate. Nothing in this file changes that
--               trigger, and everything in this file respects its deliberate
--               choice of `pg_advisory_xact_lock` over `SELECT … FOR UPDATE`
--               on `clans` (see LOCK ORDER below).
--
-- ── THE HOLE, RE-PROVEN BY EXECUTION BEFORE THIS FILE WAS WRITTEN ──────────
-- Run against production 2026-08-11 inside a single `begin … rollback`, as
-- ROLE `authenticated` with `request.jwt.claim.sub` set — i.e. under real RLS,
-- not as the owner (`pg_roles.rolbypassrls` was MEASURED = false while
-- switched, because migrations apply as `postgres`, which bypasses RLS, and an
-- invisibility assumption taken as `postgres` has already misled this program
-- once):
--
--   probe_current_user                    authenticated
--   probe_role_bypasses_rls               false
--   ATTACK uninvited_raw_insert_accepted  true   (err: none)   members 1 -> 2
--   CONTROL_A forged_leader_row_accepted  false  (err: 42501)
--   CONTROL_B direct_treasury_update_took false
--   functions_inserting_clan_members      <NONE>
--   clan_join / clan_kick / clan_create / clan_leave exist   <NONE>
--
-- Both controls fired, so the probe was demonstrably able to see a refusal.
-- The join is a raw client table write and there is no server-side join, no
-- kick, no journal, no invite, no rate limit and no ban.
--
-- ── THE DESIGN CALL, AND HOW IT WAS MADE ──────────────────────────────────
-- "Open to all" vs "invite only" is a Game Design question. This file does not
-- answer it — it makes BOTH expressible (`clans.join_policy`) and DEFAULTS TO
-- THE BEHAVIOUR THE GAME HAS TODAY (`'open'`), so that this is a pure security
-- fix and not a stealth design change. A clan that wants a door sets one.
--
-- ── WHAT AN ATTACKER LOSES ────────────────────────────────────────────────
--   · A clan can now shut its door (`join_policy = 'invite'`), and that door
--     is enforced by RLS as well as by the RPC — so it holds even while the
--     raw INSERT path is still open for open clans (see SEQUENCING).
--   · Leadership can remove an intruder (`clan_kick`) and keep them out
--     (`clan_bans`, default 7 days, clamped to 30).
--   · One account can be in exactly ONE clan — enforced by a UNIQUE INDEX, so
--     it binds the raw INSERT path too. Before this file, `clan_members` was
--     keyed (clan_id, user_id) only: a single alt could sit in every clan in
--     the game at once and inflate all of their hunts.
--   · `joined_at`, `cp_at` and `last_seen` can no longer be forged by the
--     client. THIS WAS A SECOND LIVE HOLE, found while reading the policy:
--     `clan_seat_read` and `clan_tier_up` gate the castle's tier-up on
--     `m.joined_at < now() - interval '72 hours'`, and the old WITH CHECK
--     pinned `contributed`, `cp`, `charge` and `role` but NOT `joined_at`.
--     A client could POST `joined_at: '2020-01-01'` and satisfy a 72-hour
--     grace instantly. A forged `cp_at` in the future would likewise make CP
--     immune to `hr_clan_decay_cp`. Both are now pinned to a ±10s window
--     around the SERVER clock.
--   · Every membership change is journalled to `clan_ledger`, including the
--     amount forfeited, so an eviction is auditable and manually reversible.
--   · Every new RPC is rate-limited through the established `hr_rpc_gate`.
--
-- ── LOCK ORDER (load-bearing; do not "tidy" this) ─────────────────────────
-- Every function here touches `clan_members` BEFORE `clans`, which is the
-- order `clan_board_claim` / `clan_work_complete` / `clan_tier_up` already
-- use. `clan_join` reads `clans` with a PLAIN SELECT (no row lock at all), so
-- it adds no ordering edge; the only serialisation on a join is the advisory
-- lock the member-cap trigger already takes on `hr_clan_join:<clan_id>`, and
-- taking a second lock here would be a new edge for no gain.
--
-- ── SEQUENCING: WHY THE `join as self` POLICY IS NARROWED, NOT DROPPED ────
-- The live client (`src/features/clans.js`) joins by POSTing to
-- `/rest/v1/clan_members`. Dropping the INSERT policy today takes clan joining
-- offline for every player running the deployed build — the same reasoning
-- that kept the market's SELECT-only lockdown from shipping ahead of its
-- client. So this file NARROWS the policy to what the deployed client actually
-- does, and the DROP ships as `2026-08-12-clan-members-rls-drop.sql`, which is
-- written and NOT applied. Its precondition is named in that file.
--
-- Narrowed to: role='member' AND the clan says it is OPEN, or the single
-- founder row. The `join_policy = 'open'` predicate is the ONLY piece of logic
-- duplicated between the policy and `clan_join`, and it is a flag rather than a
-- rule, which is the kind of duplication that does not drift. Everything else
-- the RPC enforces that the raw path cannot — bans, invite consumption, the
-- journal, the rate limit — is listed under KNOWN GAP below.
--
-- KNOWN GAP UNTIL THE DROP SHIPS: for a clan whose `join_policy` is `'open'`,
-- a raw INSERT still bypasses the ban list, the invite bookkeeping, the ledger
-- entry and the rate limit. It does NOT bypass the member cap (trigger), the
-- one-clan-per-account rule (unique index), the forged-timestamp pins (policy)
-- or the invite-only door (policy). Joining an open clan uninvited is the
-- game's current, intended behaviour, so what remains open is bookkeeping,
-- not authority.
--
-- SAFE TO RE-RUN. Additive and idempotent. No player row is deleted or
-- rewritten by this file.
-- ============================================================================

-- ── 1. THE DOOR ─────────────────────────────────────────────────────────────
alter table public.clans add column if not exists join_policy text not null default 'open';
do $$ begin
  alter table public.clans drop constraint if exists clans_join_policy_chk;
  alter table public.clans add constraint clans_join_policy_chk
    check (join_policy in ('open','invite'));
end $$;

-- ── 2. THE JOURNAL VOCABULARY ───────────────────────────────────────────────
-- 'member' covers join / create / leave / kick / policy. Membership churn is
-- rare — a handful of rows per player per lifetime — so this is a value-transfer
-- journal, not a per-tick one. (The 1.6M-row `game_events` lesson applies to
-- ticks; it does not argue against journalling an eviction.)
do $$ begin
  alter table public.clan_ledger drop constraint if exists clan_ledger_kind_check;
  alter table public.clan_ledger add constraint clan_ledger_kind_check
    check (kind in ('deposit','labour','tier','withdraw','upkeep','feast','board',
                    'rested','role','member'));
end $$;

-- ── 3. ONE ACCOUNT, ONE CLAN — as a constraint, not as a code path ──────────
-- Verified 0 duplicate user_ids on production before creating this.
create unique index if not exists clan_members_one_clan_uniq
  on public.clan_members (user_id);
drop index if exists public.clan_members_user_idx;   -- now redundant

-- ── 4. INVITES ──────────────────────────────────────────────────────────────
create table if not exists public.clan_invites (
  id          uuid primary key default gen_random_uuid(),
  clan_id     uuid not null references public.clans(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz
);
create unique index if not exists clan_invites_live_uniq
  on public.clan_invites (clan_id, user_id)
  where accepted_at is null and revoked_at is null;
create index if not exists clan_invites_user_idx
  on public.clan_invites (user_id) where accepted_at is null and revoked_at is null;
alter table public.clan_invites enable row level security;
-- NO client policies. The RPCs below are the only door. An invitee reads their
-- invites through clan_invites_list(); a client that could INSERT here could
-- invite itself.

-- ── 5. BANS — what makes a kick a remedy rather than a revolving door ───────
create table if not exists public.clan_bans (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  until   timestamptz not null,
  by_user uuid,
  at      timestamptz not null default now(),
  primary key (clan_id, user_id)
);
alter table public.clan_bans enable row level security;
-- Exactly one client policy, and it is READ-ONLY and self-scoped: a player may
-- learn that they are banned. There is no client write path, so the permission
-- this file consults is one the caller cannot author — the exact shape the live
-- clan-takeover finding turned on, where the logic was right and the attacker
-- simply wrote the row it read.
drop policy if exists "own bans readable" on public.clan_bans;
create policy "own bans readable" on public.clan_bans
  for select to authenticated using (auth.uid() = user_id);

-- ── 6. THE PERMISSION PREDICATE — one definition, revoked from the client ───
-- Returns 'leader' | 'officer' | null. Reads `clan_members.role`, which has NO
-- client UPDATE policy at all and whose INSERT policy admits `role='leader'`
-- only for the creator of an empty clan. §12 asserts both.
create or replace function public.hr_clan_may_admit(p_clan_id uuid, p_user uuid)
returns text language sql stable security definer
set search_path = public, pg_catalog as $$
  select m.role from public.clan_members m
   where m.clan_id = p_clan_id and m.user_id = p_user
     and m.role in ('leader','officer');
$$;
revoke execute on function public.hr_clan_may_admit(uuid, uuid) from public;
revoke execute on function public.hr_clan_may_admit(uuid, uuid) from anon, authenticated, service_role;

-- ── 7. THE RATE GATE learns the membership buckets ──────────────────────────
-- Re-created with the live body verbatim (read out of pg_proc on this project
-- immediately before writing this file) plus one new `when` arm. §12 asserts
-- that EVERY bucket the A9 retrofit relies on is still admitted, so a bucket
-- silently lost in this edit fails the migration rather than permanently
-- refusing an RPC.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
begin
  case p_bucket
    -- reads — cheap, and called on panel open / page load
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    -- ordinary player actions
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle'
      then v_limit := 60;
    -- rare, expensive, or one-per-period by design
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         -- membership (2026-08-11-clan-membership-authority.sql). Deliberately
         -- in the RAREST band: a join, a kick or a policy flip is a once-in-a-
         -- while act, and 12/min is already far above any human rate. It is the
         -- alt-army join storm of S-CAP-3 that this band is sized against.
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set'
      then v_limit := 12;
    -- companion file 2026-08-11-live-market-rls.sql
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  if v_uid is null then return true; end if;

  if public.hr_rate_ok(v_uid, 'rpc:' || p_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_uid, 'rpc:' || p_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_uid, 0, p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc'), v_weight);
  end if;
  return false;
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 8. THE MEMBERSHIP RPCs ──────────────────────────────────────────────────
-- House shape: jsonb {ok, error?, …}; every value derived server-side from
-- auth.uid(), now() and the catalogue; no client name, no client timestamp, no
-- client quantity. Replays are benign (see each function).

-- 8a. FOUND A HOLD. Replaces the client's two-step (POST /clans then POST
-- /clan_members), which could leave a clan with no leader if the second call
-- was lost — a clan nobody can ever administer, i.e. S-KICK by accident.
create or replace function public.clan_create(p_name text, p_join_policy text default 'open')
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_policy text := lower(btrim(coalesce(p_join_policy, 'open')));
  v_mine   uuid;
  v_id     uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_create') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if length(v_name) < 3 or length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  if v_policy not in ('open','invite') then
    return jsonb_build_object('ok', false, 'error', 'bad_policy');
  end if;

  select clan_id into v_mine from public.clan_members where user_id = v_uid;
  if v_mine is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_clan', 'clan_id', v_mine);
  end if;

  begin
    insert into public.clans (name, created_by, join_policy)
      values (v_name, v_uid, v_policy) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;

  insert into public.clan_members (clan_id, user_id, role) values (v_id, v_uid, 'leader');
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (v_id, v_uid, 'member', 'create');

  return jsonb_build_object('ok', true, 'clan_id', v_id, 'name', v_name,
    'role', 'leader', 'join_policy', v_policy, 'members', 1);
end $$;

-- 8b. JOIN. THE function S-CAP-1 says does not exist.
-- Refusal taxonomy: not_signed_in · rate_limited · no_clan · already_in_clan ·
--   banned · invite_only · clan_full.
-- REPLAY-SAFE: calling it again for a clan you are already in returns
--   {ok:true, already_member:true} rather than an error, so a retried request
--   after a dropped response does not surface as a failure. No idempotency key
--   is needed because the operation's own key IS (clan_id, user_id) and it is a
--   PRIMARY KEY.
create or replace function public.clan_join(p_clan_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_clan   public.clans%rowtype;
  v_mine   uuid;
  v_inv    public.clan_invites%rowtype;
  v_banned timestamptz;
  v_via    text := 'open';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_join') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_clan_id is null then return jsonb_build_object('ok', false, 'error', 'no_clan'); end if;

  select clan_id into v_mine from public.clan_members where user_id = v_uid;
  if v_mine = p_clan_id then
    return jsonb_build_object('ok', true, 'already_member', true, 'clan_id', p_clan_id);
  elsif v_mine is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_clan', 'clan_id', v_mine);
  end if;

  -- PLAIN SELECT, deliberately: no FOR UPDATE on clans (see LOCK ORDER).
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.id is null then return jsonb_build_object('ok', false, 'error', 'no_clan'); end if;

  select b.until into v_banned from public.clan_bans b
   where b.clan_id = p_clan_id and b.user_id = v_uid and b.until > now();
  if v_banned is not null then
    return jsonb_build_object('ok', false, 'error', 'banned', 'until', v_banned);
  end if;

  select * into v_inv from public.clan_invites i
   where i.clan_id = p_clan_id and i.user_id = v_uid
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc limit 1;

  if v_clan.join_policy = 'invite' then
    if v_inv.id is null then return jsonb_build_object('ok', false, 'error', 'invite_only'); end if;
    v_via := 'invite';
  elsif v_inv.id is not null then
    v_via := 'invite';
  end if;

  -- The member-cap trigger raises HR409 and takes the advisory lock that
  -- serialises concurrent joins to the same clan. Catching it here turns a
  -- 500 into a refusal the client can render.
  begin
    insert into public.clan_members (clan_id, user_id, role)
      values (p_clan_id, v_uid, 'member');
  exception
    when sqlstate 'HR409' then return jsonb_build_object('ok', false, 'error', 'clan_full');
    when unique_violation then return jsonb_build_object('ok', false, 'error', 'already_in_clan');
  end;

  if v_inv.id is not null then
    update public.clan_invites set accepted_at = now() where id = v_inv.id;
  end if;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (p_clan_id, v_uid, 'member',
            case when v_via = 'invite' then 'join_invite' else 'join' end);

  return jsonb_build_object('ok', true, 'clan_id', p_clan_id, 'clan_name', v_clan.name,
    'role', 'member', 'via', v_via, 'join_policy', v_clan.join_policy,
    'members', (select count(*)::int from public.clan_members where clan_id = p_clan_id));
end $$;

-- 8c. LEAVE — with SUCCESSION, because a hold whose leader walked out is a hold
-- that can never evict anybody, which is S-KICK arriving by the front door.
-- `clan_set_role` and `clan_claim_leadership` are service_role-only, so a player
-- cannot hand the crown over manually; the server therefore does it.
--   Succession order: officers before members, then longest-tenured
--   (joined_at asc), then user_id asc as a deterministic tiebreak.
--   Last member out DISBANDS the hold — an ownerless clan is an unjoinable,
--   unreclaimable husk squatting a unique name. Its ledger cascades away with
--   it; there is nobody left for that history to be a dispute between.
-- FORFEITURE: `contributed` and `cp` are FORFEIT and are recorded in the ledger
--   row before the member row is deleted. No refund — treasury gold and clan
--   standing were donations that have already been spent into the castle, and a
--   refund on leave would be a gold faucet a leader could cycle with an alt.
create or replace function public.clan_leave()
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := auth.uid();
  v_me   public.clan_members%rowtype;
  v_heir uuid;
  v_left int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_leave') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_me from public.clan_members where user_id = v_uid for update;
  if v_me.user_id is null then
    return jsonb_build_object('ok', true, 'already_out', true);   -- replay-safe
  end if;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty, cp)
    values (v_me.clan_id, v_uid, 'member', 'leave', v_me.contributed, v_me.cp);
  delete from public.clan_members where clan_id = v_me.clan_id and user_id = v_uid;

  if v_me.role = 'leader' then
    select m.user_id into v_heir from public.clan_members m
     where m.clan_id = v_me.clan_id
     order by (m.role = 'officer') desc, m.joined_at asc, m.user_id asc limit 1;
    if v_heir is not null then
      update public.clan_members set role = 'leader'
       where clan_id = v_me.clan_id and user_id = v_heir;
      insert into public.clan_ledger (clan_id, user_id, kind, item_id)
        values (v_me.clan_id, v_heir, 'role', 'leader');
    end if;
  end if;

  select count(*)::int into v_left from public.clan_members where clan_id = v_me.clan_id;
  if v_left = 0 then
    delete from public.clans where id = v_me.clan_id;
    return jsonb_build_object('ok', true, 'clan_id', v_me.clan_id, 'disbanded', true,
      'forfeited_contributed', v_me.contributed, 'forfeited_cp', v_me.cp);
  end if;

  return jsonb_build_object('ok', true, 'clan_id', v_me.clan_id, 'disbanded', false,
    'members', v_left, 'new_leader', v_heir,
    'forfeited_contributed', v_me.contributed, 'forfeited_cp', v_me.cp);
end $$;

-- 8d. KICK — the remedy S-KICK says does not exist.
-- Refusal taxonomy: not_signed_in · rate_limited · not_member · not_permitted ·
--   cannot_kick_self · cannot_kick_leader.
-- REPLAY-SAFE: kicking somebody who is already gone returns
--   {ok:true, already_removed:true}.
-- The BAN (default 7 days, clamped 0…720h) is what stops an alt walking
--   straight back into an open clan. `p_ban_hours` is a client value, so it is
--   CLAMPED rather than trusted, and it can only ever act on the caller's own
--   clan — it crosses to another player only as "how long you are excluded from
--   the hold whose leadership just evicted you", which is leadership's call.
-- Inviting a banned player lifts their ban (see 8e), so the remedy is
--   reversible without a service_role console.
create or replace function public.clan_kick(p_user_id uuid, p_ban_hours int default 168)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_clan   uuid;
  v_myrole text;
  v_them   public.clan_members%rowtype;
  v_ban    int;
  v_until  timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_kick') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_user_id is null then return jsonb_build_object('ok', false, 'error', 'no_target'); end if;
  if p_user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'cannot_kick_self');
  end if;

  select clan_id into v_clan from public.clan_members where user_id = v_uid;
  if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;

  v_myrole := public.hr_clan_may_admit(v_clan, v_uid);
  if v_myrole is null then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  select * into v_them from public.clan_members
   where clan_id = v_clan and user_id = p_user_id for update;
  if v_them.user_id is null then
    return jsonb_build_object('ok', true, 'already_removed', true, 'user_id', p_user_id);
  end if;
  if v_them.role = 'leader' then
    return jsonb_build_object('ok', false, 'error', 'cannot_kick_leader');
  end if;
  -- An officer may remove rank-and-file only. A peer purge is the leader's act.
  if v_myrole = 'officer' and (v_them.role <> 'member' or v_them.charge is not null) then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;

  v_ban := least(720, greatest(0, coalesce(p_ban_hours, 168)));

  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty, cp)
    values (v_clan, p_user_id, 'member', 'kick', v_them.contributed, v_them.cp);
  delete from public.clan_members where clan_id = v_clan and user_id = p_user_id;

  if v_ban > 0 then
    v_until := now() + make_interval(hours => v_ban);
    insert into public.clan_bans (clan_id, user_id, until, by_user)
      values (v_clan, p_user_id, v_until, v_uid)
      on conflict (clan_id, user_id) do update
        -- NOT `public.clan_bans.until` — ON CONFLICT DO UPDATE resolves the
        -- target by its unqualified name, and a schema-qualified reference here
        -- is a parse error. A longer standing ban is never shortened by a
        -- shorter one.
        set until = greatest(clan_bans.until, excluded.until),
            by_user = excluded.by_user, at = now()
      returning until into v_until;
  end if;

  update public.clan_invites set revoked_at = now()
   where clan_id = v_clan and user_id = p_user_id
     and accepted_at is null and revoked_at is null;

  return jsonb_build_object('ok', true, 'clan_id', v_clan, 'user_id', p_user_id,
    'banned_until', v_until,
    'forfeited_contributed', v_them.contributed, 'forfeited_cp', v_them.cp,
    'members', (select count(*)::int from public.clan_members where clan_id = v_clan));
end $$;

-- 8e. INVITE. Takes a DISPLAY NAME and resolves it against `profiles`
-- server-side, so no client-supplied name is ever stored or echoed as truth;
-- the uuid it returns is derived, not accepted.
-- Inviting a banned player LIFTS the ban — otherwise a reconciliation would
-- need a service_role console.
create or replace function public.clan_invite(p_display_name text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_clan   uuid;
  v_myrole text;
  v_target uuid;
  v_tname  text;
  v_theirs uuid;
  v_n      int;
  v_cap    int;
  v_tier   int;
  v_id     uuid;
  v_exp    timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_invite') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select clan_id into v_clan from public.clan_members where user_id = v_uid;
  if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  v_myrole := public.hr_clan_may_admit(v_clan, v_uid);
  if v_myrole is null then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  select p.id, p.display_name into v_target, v_tname from public.profiles p
   where lower(p.display_name) = lower(btrim(coalesce(p_display_name, '')))
   order by p.created_at asc limit 1;
  if v_target is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
  if v_target = v_uid then return jsonb_build_object('ok', false, 'error', 'cannot_invite_self'); end if;

  select m.clan_id into v_theirs from public.clan_members m where m.user_id = v_target;
  if v_theirs is not null then
    return jsonb_build_object('ok', false, 'error',
      case when v_theirs = v_clan then 'already_member' else 'target_in_clan' end);
  end if;

  select greatest(1, coalesce(c.castle_tier, 1)) into v_tier from public.clans c where c.id = v_clan;
  select t.member_cap into v_cap from public.hr_castle_tiers t where t.tier = v_tier;
  v_cap := coalesce(v_cap, (select min(member_cap) from public.hr_castle_tiers), 10);
  select count(*)::int into v_n from public.clan_members where clan_id = v_clan;
  if v_n >= v_cap then
    return jsonb_build_object('ok', false, 'error', 'clan_full', 'members', v_n, 'member_cap', v_cap);
  end if;

  delete from public.clan_bans where clan_id = v_clan and user_id = v_target;

  v_exp := now() + interval '7 days';
  insert into public.clan_invites (clan_id, user_id, invited_by, expires_at)
    values (v_clan, v_target, v_uid, v_exp)
    on conflict (clan_id, user_id) where accepted_at is null and revoked_at is null
    do update set invited_by = excluded.invited_by,
                  created_at = now(),
                  expires_at = excluded.expires_at
    returning id, expires_at into v_id, v_exp;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (v_clan, v_target, 'member', 'invite');

  return jsonb_build_object('ok', true, 'invite_id', v_id, 'user_id', v_target,
    'display_name', v_tname, 'expires_at', v_exp);
end $$;

create or replace function public.clan_invite_revoke(p_user_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_clan uuid; v_myrole text; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_invite_revoke') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select clan_id into v_clan from public.clan_members where user_id = v_uid;
  if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  v_myrole := public.hr_clan_may_admit(v_clan, v_uid);
  if v_myrole is null then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  update public.clan_invites set revoked_at = now()
   where clan_id = v_clan and user_id = p_user_id
     and accepted_at is null and revoked_at is null;
  get diagnostics v_n = row_count;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (v_clan, p_user_id, 'member', 'invite_revoke');
  return jsonb_build_object('ok', true, 'revoked', v_n);
end $$;

-- 8f. The invitee's view. `clan_invites` has no client SELECT policy, so this
-- is the only way to see an invite, and it can only ever return the caller's.
create or replace function public.clan_invites_list()
-- VOLATILE even though it only reads: it calls hr_rpc_gate, which WRITES a rate
-- counter. PL/pgSQL propagates read-only execution into nested calls, so a
-- STABLE wrapper around a volatile gate fails at runtime with "INSERT is not
-- allowed in a non-volatile function" — the first call, in production, for
-- every player.
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_invites_list') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'invite_id', i.id, 'clan_id', c.id, 'clan_name', c.name,
           'join_policy', c.join_policy, 'castle_tier', c.castle_tier,
           'expires_at', i.expires_at,
           'invited_by', (select p.display_name from public.profiles p where p.id = i.invited_by),
           'members', (select count(*)::int from public.clan_members m where m.clan_id = c.id))
         order by i.created_at desc), '[]'::jsonb)
    into v_out
    from public.clan_invites i join public.clans c on c.id = i.clan_id
   where i.user_id = v_uid and i.accepted_at is null and i.revoked_at is null
     and i.expires_at > now();
  return jsonb_build_object('ok', true, 'invites', v_out);
end $$;

-- 8g. THE DOOR SWITCH. Leadership only; the value is validated against the
-- same two-name vocabulary the CHECK constraint carries.
create or replace function public.clan_join_policy_set(p_policy text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_clan uuid; v_myrole text;
  v_p text := lower(btrim(coalesce(p_policy, '')));
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_join_policy_set') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_p not in ('open','invite') then
    return jsonb_build_object('ok', false, 'error', 'bad_policy');
  end if;
  select clan_id into v_clan from public.clan_members where user_id = v_uid;
  if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  v_myrole := public.hr_clan_may_admit(v_clan, v_uid);
  if v_myrole is null then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  update public.clans set join_policy = v_p where id = v_clan;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (v_clan, v_uid, 'member', 'policy_' || v_p);
  return jsonb_build_object('ok', true, 'clan_id', v_clan, 'join_policy', v_p);
end $$;

-- ── 9. GRANTS — revoke from PUBLIC first, every time ────────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and the platform ACL
-- adds anon/authenticated/service_role; revoking one of the four leaves the
-- privilege intact three other ways.
-- WRITTEN OUT LITERALLY, NOT AS A `format()` LOOP. A dynamic
-- `execute format('grant execute on function %s …')` is INVISIBLE to
-- tests/run-sql-tests.mjs, whose three static lints (revoked-from-PUBLIC,
-- not-granted-to-a-role-off-the-list, and A9 "a client-callable SECURITY
-- DEFINER function must reference a rate gate") all match on the literal
-- statement text. A loop here would have silently opted eight brand-new
-- client-callable RPCs out of the repo's only static defence. §12 asserts the
-- resulting grants behaviourally, which is what the loop's drift check bought.
revoke execute on function public.clan_create(text, text) from public, anon, authenticated, service_role;
grant  execute on function public.clan_create(text, text) to authenticated;

revoke execute on function public.clan_join(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.clan_join(uuid) to authenticated;

revoke execute on function public.clan_leave() from public, anon, authenticated, service_role;
grant  execute on function public.clan_leave() to authenticated;

revoke execute on function public.clan_kick(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.clan_kick(uuid, integer) to authenticated;

revoke execute on function public.clan_invite(text) from public, anon, authenticated, service_role;
grant  execute on function public.clan_invite(text) to authenticated;

revoke execute on function public.clan_invite_revoke(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.clan_invite_revoke(uuid) to authenticated;

revoke execute on function public.clan_invites_list() from public, anon, authenticated, service_role;
grant  execute on function public.clan_invites_list() to authenticated;

revoke execute on function public.clan_join_policy_set(text) from public, anon, authenticated, service_role;
grant  execute on function public.clan_join_policy_set(text) to authenticated;

-- ── 10. THE GRANT BASELINE learns the eight new RPCs ────────────────────────
-- Targeted, not a call to hr_grant_baseline_sync() — that would re-approve the
-- entire live surface and turn a differential check into a rubber stamp.
do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent (grant-hygiene not applied) — nothing to record';
    return;
  end if;
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'clan membership authority (S-CAP-1 / S-KICK), 2026-08-11'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('clan_create','clan_join','clan_leave','clan_kick',
                       'clan_invite','clan_invite_revoke','clan_invites_list',
                       'clan_join_policy_set')
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'grant baseline: % new membership RPC(s) approved', v_n;
end $$;

-- ── 11. NARROW `join as self` (see SEQUENCING at the top) ───────────────────
-- Two changes, both of which the DEPLOYED client already satisfies:
--   (a) an ordinary join requires the clan to say it is OPEN;
--   (b) joined_at / cp_at / last_seen can no longer be forged.
-- The founder branch is unchanged in meaning.
--
-- ⚠ THIS FILE IS THE SINGLE OWNER OF THIS POLICY. A parallel pass
--   (2026-08-11-raid-claim-authority.sql, finding R4) also defined it, one hour
--   earlier, to pin `joined_at` — which is an authorisation input for
--   raid_claim's joined_after_kill / joined_after_declare as well as for
--   clan-seat's 72h alt gate. Two files owning one definition is the hazard
--   2026-08-11-authenticated-surface-lockdown.sql §2b names out loud about
--   hr_rpc_gate's `case`: whichever applies SECOND silently deletes the other's
--   terms, and 'c' sorts before 'r', so a replay would have dropped the door.
--   That file now keeps its ASSERTION and has given up its DEFINITION;
--   tests/run-sql-tests.mjs fails the build if a second definition reappears.
--
--   THE TOLERANCE IS R4's TWO MINUTES, not the ten seconds this file first
--   used. Two minutes cannot beat a 72-hour grace or a week-long raid window,
--   and a window tighter than a slow PostgREST round trip is a false refusal
--   waiting for a bad network. The peer reasoned about that number explicitly.
drop policy if exists "join as self" on public.clan_members;
create policy "join as self" on public.clan_members
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and contributed = 0
    and cp = 0
    and charge is null
    and last_seen is null
    -- SERVER CLOCK, not the client's. A forged joined_at beat BOTH the 72-hour
    -- tier-up contributor grace and raid_claim's joined_after_kill /
    -- joined_after_declare gates (R4); a forged cp_at made CP immune to decay.
    and joined_at between now() - interval '2 minutes' and now() + interval '2 minutes'
    and cp_at     between now() - interval '2 minutes' and now() + interval '2 minutes'
    and (
      (role = 'member' and exists (
        select 1 from public.clans c
         where c.id = clan_members.clan_id and c.join_policy = 'open'))
      or
      (role = 'leader'
       and exists (select 1 from public.clans c
                    where c.id = clan_members.clan_id and c.created_by = auth.uid())
       and not exists (select 1 from public.clan_members m
                        where m.clan_id = clan_members.clan_id))
    )
  );

-- ============================================================================
-- 12 · SELF-CHECK — the commit gate. `apply_migration` is atomic on this
-- project, so any raise below aborts the entire file.
--
-- MUTATION-PROVEN. The load-bearing assertion — "an uninvited raw INSERT into a
-- clan is refused" — was executed against production BEFORE this file existed,
-- as ROLE `authenticated` under real RLS, and the insert was ACCEPTED
-- (transcript at the top of this file). It is therefore known to fail without
-- the change rather than merely believed to.
--
-- EVERY REFUSAL IS PAIRED WITH A CONTROL, so a guard that refuses everything
-- cannot pass: joining an OPEN clan must still work BOTH by RPC and by the raw
-- REST path the deployed client uses.
--
-- IT RUNS AS `authenticated`, NOT AS THE OWNER, AND IT MEASURES THAT —
-- migrations apply as `postgres`, which has rolbypassrls, so a refusal observed
-- as the owner would prove nothing about RLS. If the measurement disagrees, the
-- block aborts before any assertion is read.
--
-- The fixture rolls itself back through an HR999 sentinel. PL/pgSQL variables
-- are not transactional, so the results survive the subtransaction abort, which
-- is what lets the assertions run after the fixture is gone.
-- ============================================================================
do $$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  v_lead uuid; v_out uuid; v_bys uuid; v_two uuid; v_other uuid;
  v_sl uuid; v_sh uuid; v_founder uuid;
  v_open uuid; v_shut uuid; v_third uuid; v_succ uuid;
  v_probe uuid := gen_random_uuid();
  r record;

  -- MEASURED INSIDE the role switch
  m_user   text := '<never switched>';
  m_bypass text := '<never switched>';

  -- raw-REST-path results (booleans: was the write ACCEPTED?)
  a_raw_shut       boolean := true;    -- PROPERTY  · must end false
  a_raw_forged_at  boolean := true;    -- PROPERTY  · must end false
  a_raw_forged_cp  boolean := true;    -- PROPERTY  · must end false
  a_raw_invite     boolean := true;    -- PROPERTY  · must end false
  a_raw_open       boolean := false;   -- CONTROL   · must end true
  a_two_clans      boolean := true;    -- PROPERTY  · must end false

  -- RPC results
  a_created        jsonb;   -- CONTROL
  a_rpc_shut       jsonb;   -- PROPERTY
  a_rpc_open       jsonb;   -- CONTROL
  a_rpc_replay     jsonb;   -- idempotency
  a_rpc_second     jsonb;   -- PROPERTY
  a_rpc_invited    jsonb;   -- CONTROL
  a_policy_member  jsonb;   -- PROPERTY
  a_policy_lead    jsonb;   -- CONTROL
  a_kick_by_member jsonb;   -- PROPERTY
  a_kick_self      jsonb;   -- PROPERTY
  a_kick_by_lead   jsonb;   -- CONTROL
  a_join_banned    jsonb;   -- PROPERTY
  a_invite_ghost   jsonb;   -- PROPERTY
  a_invite_ok      jsonb;   -- CONTROL
  a_inv_list       jsonb;   -- CONTROL

  v_heir_role text;
  v_ledger    int := 0;
begin
  -- ── (a) catalogue shape ───────────────────────────────────────────────────
  if to_regprocedure('public.clan_join(uuid)') is null
  or to_regprocedure('public.clan_kick(uuid,integer)') is null
  or to_regprocedure('public.clan_create(text,text)') is null
  or to_regprocedure('public.clan_leave()') is null
  or to_regprocedure('public.clan_invite(text)') is null
  or to_regclass('public.clan_invites') is null
  or to_regclass('public.clan_bans') is null then
    raise exception 'SELF-CHECK: a membership object did not materialise';
  end if;

  -- ── (b) the permission source must not be client-writable ────────────────
  -- This is the shape of the live clan-takeover finding: the logic was right
  -- and the attacker simply wrote the row it consulted.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='clan_members' and cmd='UPDATE') then
    raise exception 'SELF-CHECK: clan_members has a client UPDATE policy — role/charge would be self-grantable';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='clan_invites') then
    raise exception 'SELF-CHECK: clan_invites has a client policy — it must be RPC-only';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='clan_bans' and cmd <> 'SELECT') then
    raise exception 'SELF-CHECK: clan_bans has a client WRITE policy — a ban must not be self-liftable';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='clans' and cmd='UPDATE') then
    raise exception 'SELF-CHECK: clans has a client UPDATE policy — join_policy would be forgeable by outsiders';
  end if;

  -- ── (c) grants ────────────────────────────────────────────────────────────
  if has_function_privilege('anon','public.hr_clan_may_admit(uuid,uuid)','execute')
  or has_function_privilege('authenticated','public.hr_clan_may_admit(uuid,uuid)','execute') then
    raise exception 'SELF-CHECK: hr_clan_may_admit is client-executable';
  end if;
  if has_function_privilege('anon','public.hr_rpc_gate(text)','execute')
  or has_function_privilege('authenticated','public.hr_rpc_gate(text)','execute') then
    raise exception 'SELF-CHECK: hr_rpc_gate became client-executable — a caller could pick its own bucket';
  end if;
  for r in select unnest(array[
      'public.clan_create(text, text)','public.clan_join(uuid)','public.clan_leave()',
      'public.clan_kick(uuid, integer)','public.clan_invite(text)',
      'public.clan_invite_revoke(uuid)','public.clan_invites_list()',
      'public.clan_join_policy_set(text)']) as s
  loop
    if not has_function_privilege('authenticated', r.s, 'execute') then
      raise exception 'SELF-CHECK: % is not executable by authenticated — the RPC is dead on arrival', r.s;
    end if;
    if has_function_privilege('anon', r.s, 'execute') then
      raise exception 'SELF-CHECK: % is executable by anon', r.s;
    end if;
  end loop;

  -- ── (d) §7 re-created hr_rpc_gate: no bucket may have been lost ──────────
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  for r in select replace(p.proname,'__ungated','') as nm
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname like '%\_\_ungated'
  loop
    delete from public.hr_rate_counters where user_id = v_probe;
    if not public.hr_rpc_gate(r.nm) then
      raise exception 'SELF-CHECK: hr_rpc_gate lost bucket "%" in this edit — that RPC is now permanently refused', r.nm;
    end if;
  end loop;
  for r in select unnest(array['clan_create','clan_join','clan_leave','clan_kick',
                               'clan_invite','clan_invite_revoke','clan_invites_list',
                               'clan_join_policy_set']) as nm
  loop
    delete from public.hr_rate_counters where user_id = v_probe;
    if not public.hr_rpc_gate(r.nm) then
      raise exception 'SELF-CHECK: new bucket "%" is not in hr_rpc_gate''s case — that RPC would be permanently refused', r.nm;
    end if;
  end loop;
  if public.hr_rpc_gate('__not_a_bucket__') then
    raise exception 'SELF-CHECK: hr_rpc_gate no longer fails closed on an unknown bucket';
  end if;
  delete from public.hr_rate_counters where user_id = v_probe;
  delete from public.hr_rejections    where user_id = v_probe;

  -- ── (e) THE BEHAVIOURAL FIXTURE ──────────────────────────────────────────
  begin
    v_lead    := gen_random_uuid();  v_out   := gen_random_uuid();
    v_bys     := gen_random_uuid();  v_two   := gen_random_uuid();
    v_other   := gen_random_uuid();  v_sl    := gen_random_uuid();
    v_sh      := gen_random_uuid();  v_founder := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email) values
      (v_lead,   c_inst,'authenticated','authenticated','cma-lead@probe.invalid'),
      (v_out,    c_inst,'authenticated','authenticated','cma-out@probe.invalid'),
      (v_bys,    c_inst,'authenticated','authenticated','cma-bys@probe.invalid'),
      (v_two,    c_inst,'authenticated','authenticated','cma-two@probe.invalid'),
      (v_other,  c_inst,'authenticated','authenticated','cma-other@probe.invalid'),
      (v_sl,     c_inst,'authenticated','authenticated','cma-sl@probe.invalid'),
      (v_sh,     c_inst,'authenticated','authenticated','cma-sh@probe.invalid'),
      (v_founder,c_inst,'authenticated','authenticated','cma-founder@probe.invalid');

    insert into public.clans (name, created_by, join_policy)
      values ('__cma_open__',  v_lead,  'open')   returning id into v_open;
    insert into public.clans (name, created_by, join_policy)
      values ('__cma_shut__',  v_lead,  'invite') returning id into v_shut;
    insert into public.clans (name, created_by, join_policy)
      values ('__cma_third__', v_other, 'open')   returning id into v_third;
    insert into public.clans (name, created_by, join_policy)
      values ('__cma_succ__',  v_sl,    'open')   returning id into v_succ;
    insert into public.clan_members (clan_id, user_id, role) values
      (v_shut,  v_lead,  'leader'),
      (v_third, v_other, 'leader'),
      (v_succ,  v_sl,    'leader'),
      (v_succ,  v_sh,    'member');
    -- Pre-authored so the invited-join CONTROL needs no role switch mid-fixture.
    -- `clan_invite`'s own happy path is exercised separately, further down.
    insert into public.clan_invites (clan_id, user_id, invited_by)
      values (v_shut, v_two, v_lead);
    -- A resolvable display name, so clan_invite's SERVER-SIDE name resolution
    -- is exercised on its happy path and not only on its refusal.
    insert into public.profiles (id, display_name) values (v_founder, '__cma_founder__')
      on conflict (id) do update set display_name = excluded.display_name;

    -- ═══ from here the probe IS a player: real role, real RLS ═══
    perform set_config('request.jwt.claim.sub', v_out::text, true);
    set local role authenticated;
    m_user := current_user;
    select rolbypassrls::text into m_bypass from pg_roles where rolname = current_user;

    -- PROPERTY · the raw path can no longer force an invite-only door
    begin
      insert into public.clan_members (clan_id, user_id) values (v_shut, v_out);
    exception when others then a_raw_shut := false; end;
    -- PROPERTY · a forged joined_at skipped the 72h tier-up contributor grace
    begin
      insert into public.clan_members (clan_id, user_id, joined_at)
        values (v_open, v_out, now() - interval '400 days');
    exception when others then a_raw_forged_at := false; end;
    -- PROPERTY · a forged cp_at would make CP immune to hr_clan_decay_cp
    begin
      insert into public.clan_members (clan_id, user_id, cp_at)
        values (v_open, v_out, now() + interval '400 days');
    exception when others then a_raw_forged_cp := false; end;
    -- PROPERTY · invites must not be self-issuable
    begin
      insert into public.clan_invites (clan_id, user_id, invited_by)
        values (v_shut, v_out, v_out);
    exception when others then a_raw_invite := false; end;
    -- CONTROL · the DEPLOYED client's raw join of an OPEN clan still works
    begin
      insert into public.clan_members (clan_id, user_id) values (v_open, v_out);
      a_raw_open := true;
    exception when others then a_raw_open := false; end;
    -- PROPERTY · one account, one clan — binds the raw path too
    begin
      insert into public.clan_members (clan_id, user_id) values (v_third, v_out);
    exception when others then a_two_clans := false; end;

    -- ── the RPC surface ───────────────────────────────────────────────────
    perform set_config('request.jwt.claim.sub', v_bys::text, true);
    a_rpc_shut       := public.clan_join(v_shut);             -- expect invite_only
    a_rpc_open       := public.clan_join(v_open);             -- CONTROL: ok
    a_rpc_replay     := public.clan_join(v_open);             -- benign replay
    a_rpc_second     := public.clan_join(v_third);            -- expect already_in_clan
    a_policy_member  := public.clan_join_policy_set('invite');-- expect not_permitted
    a_kick_by_member := public.clan_kick(v_out);              -- expect not_permitted

    perform set_config('request.jwt.claim.sub', v_two::text, true);
    a_rpc_invited    := public.clan_join(v_shut);             -- CONTROL: invited → ok

    perform set_config('request.jwt.claim.sub', v_lead::text, true);
    a_kick_self      := public.clan_kick(v_lead);             -- expect cannot_kick_self
    a_invite_ghost   := public.clan_invite('__no_such_player_at_all__');
    a_invite_ok      := public.clan_invite('__CMA_FOUNDER__');-- CONTROL, case-insensitive
    a_policy_lead    := public.clan_join_policy_set('open');  -- CONTROL: leadership may
    a_kick_by_lead   := public.clan_kick(v_two, 24);          -- CONTROL: leadership may kick

    perform set_config('request.jwt.claim.sub', v_two::text, true);
    a_join_banned    := public.clan_join(v_shut);             -- expect banned

    perform set_config('request.jwt.claim.sub', v_founder::text, true);
    a_inv_list       := public.clan_invites_list();           -- CONTROL: invitee sees it
    a_created        := public.clan_create('__cma_founded__');-- CONTROL: founding works

    -- SUCCESSION · a leader walking out must not leave an unadministrable hold
    perform set_config('request.jwt.claim.sub', v_sl::text, true);
    perform public.clan_leave();

    reset role;
    select m.role into v_heir_role from public.clan_members m
     where m.clan_id = v_succ and m.user_id = v_sh;
    select count(*) into v_ledger from public.clan_ledger where kind = 'member';

    raise exception using errcode = 'HR999', message = 'membership fixture rollback';
  exception when sqlstate 'HR999' then
    reset role;      -- belt and braces; a subtransaction abort restores it too
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- ── (f) ASSERTIONS ────────────────────────────────────────────────────────
  -- FIRST: was the probe actually under RLS? If not, nothing below means
  -- anything, and saying so is more useful than a green run.
  if m_user <> 'authenticated' or m_bypass <> 'false' then
    raise exception 'SELF-CHECK INVALID: the probe ran as % (bypassrls=%) — RLS was not in effect, so every refusal below is meaningless',
      m_user, m_bypass;
  end if;

  if a_raw_shut then
    raise exception 'SELF-CHECK FAILED: a raw INSERT joined an INVITE-ONLY clan uninvited — S-CAP-1 is still open on the door that matters';
  end if;
  if a_raw_forged_at then
    raise exception 'SELF-CHECK FAILED: a forged joined_at was accepted — the 72h tier-up contributor grace is still skippable';
  end if;
  if a_raw_forged_cp then
    raise exception 'SELF-CHECK FAILED: a forged cp_at was accepted — CP would be immune to decay';
  end if;
  if a_raw_invite then
    raise exception 'SELF-CHECK FAILED: a client INSERTed its own clan_invites row — invites are self-issuable';
  end if;
  if not a_raw_open then
    raise exception 'SELF-CHECK FAILED: the raw join of an OPEN clan was REFUSED — that would take the deployed client''s Join button offline. A guard that refuses everything is not a guard.';
  end if;
  if a_two_clans then
    raise exception 'SELF-CHECK FAILED: one account joined two clans — the one-clan unique index is not in effect';
  end if;

  if (a_rpc_shut->>'error') is distinct from 'invite_only' then
    raise exception 'SELF-CHECK FAILED: clan_join on an invite-only clan returned % (expected invite_only)', a_rpc_shut;
  end if;
  if (a_rpc_open->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: clan_join refused a LEGITIMATE join of an open clan: %', a_rpc_open;
  end if;
  if (a_rpc_replay->>'ok') is distinct from 'true'
  or (a_rpc_replay->>'already_member') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: a replayed clan_join was not benign: %', a_rpc_replay;
  end if;
  if (a_rpc_second->>'error') is distinct from 'already_in_clan' then
    raise exception 'SELF-CHECK FAILED: clan_join let one account hold two clans: %', a_rpc_second;
  end if;
  if (a_rpc_invited->>'ok') is distinct from 'true'
  or (a_rpc_invited->>'via') is distinct from 'invite' then
    raise exception 'SELF-CHECK FAILED: an INVITED player could not join the invite-only clan: %', a_rpc_invited;
  end if;

  if (a_policy_member->>'error') is distinct from 'not_permitted' then
    raise exception 'SELF-CHECK FAILED: a rank-and-file member flipped join_policy: %', a_policy_member;
  end if;
  if (a_policy_lead->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: the leader could not set join_policy: %', a_policy_lead;
  end if;
  if (a_kick_by_member->>'error') is distinct from 'not_permitted' then
    raise exception 'SELF-CHECK FAILED: a rank-and-file member could kick: %', a_kick_by_member;
  end if;
  if (a_kick_self->>'error') is distinct from 'cannot_kick_self' then
    raise exception 'SELF-CHECK FAILED: clan_kick allowed a self-kick: %', a_kick_self;
  end if;
  if (a_kick_by_lead->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: leadership could NOT kick — S-KICK is still open: %', a_kick_by_lead;
  end if;
  if (a_join_banned->>'error') is distinct from 'banned' then
    raise exception 'SELF-CHECK FAILED: a kicked member walked straight back in: %', a_join_banned;
  end if;

  if (a_invite_ghost->>'error') is distinct from 'no_such_player' then
    raise exception 'SELF-CHECK FAILED: clan_invite resolved a name that does not exist: %', a_invite_ghost;
  end if;
  if (a_invite_ok->>'ok') is distinct from 'true' then
    raise exception 'SELF-CHECK FAILED: clan_invite could not invite a real player: %', a_invite_ok;
  end if;
  if jsonb_array_length(coalesce(a_inv_list->'invites','[]'::jsonb)) <> 1 then
    raise exception 'SELF-CHECK FAILED: the invitee could not see their invite: %', a_inv_list;
  end if;
  if (a_created->>'ok') is distinct from 'true' or (a_created->>'role') is distinct from 'leader' then
    raise exception 'SELF-CHECK FAILED: clan_create did not found a hold with a leader: %', a_created;
  end if;

  if v_heir_role is distinct from 'leader' then
    raise exception 'SELF-CHECK FAILED: the leader left and nobody inherited (heir role = %) — the hold could never evict anyone', coalesce(v_heir_role,'<gone>');
  end if;
  if v_ledger < 4 then
    raise exception 'SELF-CHECK FAILED: only % membership ledger row(s) — membership changes are not journalled', v_ledger;
  end if;

  raise notice 'CLAN MEMBERSHIP AUTHORITY OK — invite-only doors hold against the raw REST path, open doors still work (control), kick+ban+succession live, % membership ledger rows written by the fixture', v_ledger;
end $$;

