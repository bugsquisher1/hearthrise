-- ============================================================================
-- 2026-08-09-clan-governance.sql   (b228, Wave 3c — WHO DECIDES, AND HOW)
--
-- Three product decisions, one additive migration. Every statement in this file
-- is idempotent: it may be run against a project that has had the clan-seat
-- migrations for a week, or against one that ran them ten seconds ago, and it
-- may be run twice.
--
-- 1 · VICE LEADER. Posting a Work Order is now the Leader's power and the Vice
--     Leaders' power, and nobody else's. The clan-seat model already carried
--     exactly the right shape for this — one nullable `charge` column beside
--     `role` — so 'vice' becomes a charge the Leader grants. `steward` was the
--     old name for the same authority and is kept ACCEPTED (never granted
--     again) so that a project which ran the earlier migration and handed out
--     a steward charge does not silently demote that member the day this file
--     runs. Nothing is ever taken away by a migration.
--
-- 2 · OPT-IN VOTING. Leadership MAY put the next Work Order to the hold: two to
--     four candidates, one vote per member enforced by a primary key, a live
--     tally every member can see, and at the deadline the winner posts itself.
--     It is leadership's choice per order, not mandatory governance — a hold
--     whose leader never opens a vote never sees the affordance.
--
--     THE VOTE SETTLES LAZILY. There is no cron in this project and inventing
--     one for this would be the wrong trade: `clan_vote_read` closes any vote
--     whose deadline has passed before it answers, exactly as
--     `clan_upkeep_settle` does for the Sunday boundary. The state is correct
--     at the moment somebody looks at it, which is the only moment it matters.
--
--     A TIE DOES NOT PICK A WINNER. It reports itself and leaves the decision
--     with leadership. Breaking a tie by row order would be a coin flip the
--     player cannot see, and a governance system whose outcome is unexplainable
--     is worse than no governance system.
--
-- 3 · The three functions that gated on 'steward' are re-created against one
--     shared predicate, so there is now exactly ONE definition of "may act for
--     the hold" instead of three copies that can drift apart.
--
-- FEATURE DETECTION. The client ships before this file is run: every RPC here
-- answers 404/PGRST202 to a client whose project has not had it, and the panel
-- maps that to 'unsupported' and simply does not offer a vote. Un-migrated is
-- not an error state, and the vote affordance is hidden rather than faked.
-- ============================================================================

-- ── 1. The charge vocabulary ────────────────────────────────
-- 'vice'    — deputy: may commission work, call the Feast, draw on the coffer,
--             and open a vote. Granted and revoked by the Leader alone.
-- 'marshal' — combat authority. Untouched by this file.
-- 'steward' — the previous name for 'vice'. Still honoured, never granted.
do $$ begin
  alter table public.clan_members drop constraint if exists clan_members_charge_chk;
  alter table public.clan_members add constraint clan_members_charge_chk
    check (charge is null or charge in ('steward','marshal','vice'));
end $$;

-- ONE definition of the posting right. Every gate below reads this and nothing
-- else, so widening authority later is a one-line change rather than a hunt.
create or replace function public.hr_clan_may_post(p_clan_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clan_members
     where clan_id = p_clan_id and user_id = p_user
       and (role = 'leader' or coalesce(charge,'') in ('vice','steward'))
  );
$$;
comment on function public.hr_clan_may_post(uuid, uuid) is
  'True when the member is the Leader or holds the vice charge. The single source of the posting right.';

-- Grant or revoke the vice charge. LEADER ONLY — an officer may not create a
-- peer. Revoking clears ONLY a vice/steward charge: a Marshal is a different
-- office and must never be demoted by a button labelled "Remove Vice Leader".
create or replace function public.clan_vice_set(p_clan_id uuid, p_user uuid, p_grant boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me text; v_them text; v_charge text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_me from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  select role, charge into v_them, v_charge from public.clan_members
   where clan_id = p_clan_id and user_id = p_user;
  if v_me is null or v_them is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_me <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_leader'); end if;
  if v_them = 'leader' then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;

  if p_grant then
    update public.clan_members set charge = 'vice'
     where clan_id = p_clan_id and user_id = p_user;
    v_charge := 'vice';
  else
    update public.clan_members set charge = null
     where clan_id = p_clan_id and user_id = p_user and coalesce(charge,'') in ('vice','steward');
    select charge into v_charge from public.clan_members
     where clan_id = p_clan_id and user_id = p_user;
  end if;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (p_clan_id, p_user, 'role', case when p_grant then 'vice' else 'vice_revoked' end);
  return jsonb_build_object('ok', true, 'user_id', p_user, 'charge', v_charge, 'granted', p_grant);
end $$;
grant execute on function public.clan_vice_set(uuid, uuid, boolean) to authenticated;

-- clan_set_role learns the new charge name. Re-created verbatim apart from the
-- widened charge list — a leader using the general role tool must be able to
-- name the same office the vice button names.
create or replace function public.clan_set_role(p_clan_id uuid, p_user uuid, p_role text, p_charge text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me text; v_them text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_me from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  select role into v_them from public.clan_members where clan_id = p_clan_id and user_id = p_user;
  if v_me is null or v_them is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if p_role is not null and p_role not in ('leader','officer','member') then
    return jsonb_build_object('ok', false, 'error', 'bad_role');
  end if;
  if p_charge is not null and p_charge not in ('steward','marshal','vice') then
    return jsonb_build_object('ok', false, 'error', 'bad_charge');
  end if;
  if v_me <> 'leader' then
    if v_me <> 'officer' or v_them <> 'member' or p_role = 'leader' or p_charge is not null then
      return jsonb_build_object('ok', false, 'error', 'not_permitted');
    end if;
  end if;
  if p_role = 'leader' then
    if v_me <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
    update public.clan_members set role = 'officer' where clan_id = p_clan_id and role = 'leader';
  end if;
  update public.clan_members
     set role = coalesce(p_role, role),
         charge = case when p_charge is null then charge else p_charge end
   where clan_id = p_clan_id and user_id = p_user;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (p_clan_id, p_user, 'role', coalesce(p_role, p_charge));
  return jsonb_build_object('ok', true, 'role', coalesce(p_role, v_them), 'charge', p_charge);
end $$;
grant execute on function public.clan_set_role(uuid, uuid, text, text) to authenticated;

-- ── 2. Posting a Work Order, factored ───────────────────────
-- The derivation of a Work Order — its bundle, its labour target, its slot and
-- level checks — is now a function, because TWO callers need it: a leader
-- pressing Commission, and a vote closing on a winner. A second copy of the
-- 1.58^(n-1) material scale is exactly the kind of drift this project has
-- already paid for once.
--
-- Returns the new order's jsonb, or an {ok:false,error} the caller can pass
-- straight back. It does NOT check authority — its two callers do that, and
-- they check it differently (a vote closing at its deadline is not a person).
create or replace function public.hr_clan_order_create(p_clan_id uuid, p_building text, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan  public.clans%rowtype;
  v_b     public.hr_castle_buildings%rowtype;
  v_open int; v_slots int; v_cur int; v_to int;
  v_scale numeric; v_mats jsonb; v_target int; v_id uuid;
begin
  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.id is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;

  select * into v_b from public.hr_castle_buildings where building = p_building;
  if v_b.building is null then return jsonb_build_object('ok', false, 'error', 'no_building'); end if;

  v_cur := coalesce(nullif(v_clan.upgrades->>p_building,'')::int, 0);
  v_to  := v_cur + 1;
  if v_to > 10 then return jsonb_build_object('ok', false, 'error', 'too_high', 'cap', 10); end if;
  if v_to > v_clan.castle_tier * 2 then
    return jsonb_build_object('ok', false, 'error', 'too_high', 'cap', v_clan.castle_tier * 2);
  end if;

  v_slots := 1 + floor(greatest(1, v_clan.castle_tier) / 3);
  select count(*) into v_open from public.clan_work_orders
   where clan_id = p_clan_id and phase in ('supply','labour');
  if v_open >= v_slots then return jsonb_build_object('ok', false, 'error', 'no_slot', 'slots', v_slots); end if;
  if exists (select 1 from public.clan_work_orders
              where clan_id = p_clan_id and building = p_building and phase in ('supply','labour')) then
    return jsonb_build_object('ok', false, 'error', 'already_open');
  end if;

  v_scale := power(1.58, v_to - 1);
  select coalesce(jsonb_object_agg(key, ceil((value::numeric) * v_scale)::bigint), '{}'::jsonb)
    into v_mats from jsonb_each_text(v_b.base_bundle);
  v_target := round(800 * power(1.42, v_to - 1))::int;

  insert into public.clan_work_orders
    (clan_id, building, to_level, materials, labour_target, posted_by)
    values (p_clan_id, p_building, v_to, v_mats, v_target, p_by)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'order_id', v_id, 'building', p_building,
    'to_level', v_to, 'materials', v_mats, 'labour_target', v_target,
    'gold', ceil(v_b.base_gold * v_scale)::bigint, 'slots', v_slots);
end $$;

-- Re-created against hr_clan_may_post. The refusal code is 'not_vice'; the old
-- 'not_steward' is still understood by the client, so a project that has not
-- run this file yet still shows a sentence rather than a code.
create or replace function public.clan_work_post(p_clan_id uuid, p_building text, p_to_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_cur int; v_clan public.clans%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not public.hr_clan_may_post(p_clan_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_vice');
  end if;
  -- The client still names the level it believes it is buying. Disagreeing with
  -- the server is a stale panel, not a permitted write.
  select * into v_clan from public.clans where id = p_clan_id;
  v_cur := coalesce(nullif(v_clan.upgrades->>p_building,'')::int, 0);
  if p_to_level is distinct from v_cur + 1 then
    return jsonb_build_object('ok', false, 'error', 'bad_level', 'current', v_cur);
  end if;
  return public.hr_clan_order_create(p_clan_id, p_building, auth.uid());
end $$;
grant execute on function public.clan_work_post(uuid, text, int) to authenticated;

-- The Feast and the coffer follow the same predicate. Re-created verbatim apart
-- from their gate — a Vice Leader who could commission a Work Order but could
-- not call the Feast would be an office nobody could explain.
create or replace function public.clan_feast_call(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype; v_role text;
  v_lv int; v_cap int; v_hours numeric; v_t public.clan_tavern%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not public.hr_clan_may_post(p_clan_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_vice');
  end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;
  v_lv := coalesce(nullif(v_clan.upgrades->>'tavern','')::int, 0);
  if v_lv < 1 then return jsonb_build_object('ok', false, 'error', 'no_tavern'); end if;
  v_cap := 600 + 120 * least(10, v_lv);

  insert into public.clan_tavern (clan_id) values (p_clan_id) on conflict (clan_id) do nothing;
  select * into v_t from public.clan_tavern where clan_id = p_clan_id;
  if v_t.feast_meter < v_cap then
    return jsonb_build_object('ok', false, 'error', 'meter_short', 'meter', v_t.feast_meter, 'cap', v_cap);
  end if;
  if v_t.feast_cd_until is not null and now() < v_t.feast_cd_until then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'ready_at', v_t.feast_cd_until);
  end if;

  v_hours := case when v_lv >= 10 then 4 when v_lv >= 7 then 3 when v_lv >= 4 then 2 else 1 end;
  update public.clan_tavern
     set feast_meter = 0,
         feast_until = now() + make_interval(secs => v_hours * 3600),
         feast_cd_until = now() + make_interval(secs =>
           20 * 3600 * case when v_clan.upkeep_state = 'strained' then 1.5 else 1 end)
   where clan_id = p_clan_id returning * into v_t;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'feast', v_hours);

  return jsonb_build_object('ok', true, 'tavern_level', v_lv, 'hours', v_hours,
    'feast_until', v_t.feast_until, 'feast_cd_until', v_t.feast_cd_until,
    'all_xp', case when v_lv >= 10 then 0.18 when v_lv >= 7 then 0.15
                   when v_lv >= 4 then 0.12 else 0.08 end,
    'last_call_ms', case when v_lv >= 7 then 1800000 else 0 end);
end $$;
grant execute on function public.clan_feast_call(uuid) to authenticated;

create or replace function public.clan_withdraw(p_clan_id uuid, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clan public.clans%rowtype; v_role text; v_id uuid; v_ready timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not public.hr_clan_may_post(p_clan_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_vice');
  end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;

  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.treasury < p_amount then
    return jsonb_build_object('ok', false, 'error', 'treasury_short', 'treasury', v_clan.treasury);
  end if;

  if p_amount::numeric > v_clan.treasury::numeric * 0.10 then
    v_ready := now() + interval '24 hours';
    insert into public.clan_withdrawals (clan_id, user_id, amount, ready_at)
      values (p_clan_id, auth.uid(), p_amount, v_ready) returning id into v_id;
    return jsonb_build_object('ok', true, 'pending', true, 'withdrawal_id', v_id,
      'ready_at', v_ready, 'amount', p_amount, 'treasury', v_clan.treasury);
  end if;

  update public.clans set treasury = treasury - p_amount where id = p_clan_id returning * into v_clan;
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'withdraw', p_amount);
  return jsonb_build_object('ok', true, 'pending', false, 'amount', p_amount,
    'treasury', v_clan.treasury);
end $$;
grant execute on function public.clan_withdraw(uuid, bigint) to authenticated;

-- ── 3. THE VOTE ─────────────────────────────────────────────
create table if not exists public.clan_order_votes (
  id              uuid primary key default gen_random_uuid(),
  clan_id         uuid not null references public.clans(id) on delete cascade,
  opened_by       uuid not null,
  opened_at       timestamptz not null default now(),
  deadline        timestamptz not null,
  -- [{"building":"tavern","to_level":3}, …]. `to_level` is what the candidate
  -- looked like when it was offered; the level actually built is re-derived at
  -- close, because the hold may have moved while the vote ran.
  candidates      jsonb not null,
  closed_at       timestamptz,
  closed_by       uuid,
  -- null while open · 'posted' · 'tie' · 'void' (no ballots, or the winner
  -- could no longer be commissioned)
  outcome         text check (outcome is null or outcome in ('posted','tie','void')),
  outcome_error   text,
  winner_building text,
  order_id        uuid
);
-- ONE open vote per hold. A second concurrent ballot would split the room and
-- make "the hold decided" untrue, so the database refuses rather than the UI.
create unique index if not exists clan_order_votes_open_uniq
  on public.clan_order_votes (clan_id) where closed_at is null;
create index if not exists clan_order_votes_clan_idx
  on public.clan_order_votes (clan_id, opened_at desc);

-- ONE VOTE PER MEMBER, enforced by the primary key rather than by a check in
-- application code. A member may CHANGE their vote while the ballot is open —
-- that is an update of their one row, not a second ballot.
create table if not exists public.clan_order_ballots (
  vote_id  uuid not null references public.clan_order_votes(id) on delete cascade,
  user_id  uuid not null,
  building text not null,
  cast_at  timestamptz not null default now(),
  primary key (vote_id, user_id)
);

alter table public.clan_order_votes   enable row level security;
alter table public.clan_order_ballots enable row level security;
-- No client policies at all: the RPCs below are security definer and are the
-- only door. A client that could write a ballot row directly could stuff it.

-- The tally, derived. Never stored — a stored count is a count that can be
-- wrong, and this one is cheap.
create or replace function public.hr_clan_vote_tally(p_vote uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(building, n), '{}'::jsonb)
    from (select building, count(*)::int as n from public.clan_order_ballots
           where vote_id = p_vote group by building) t;
$$;

-- CLOSING, in one place. Called by the leader's early close, by the lazy
-- settle inside clan_vote_read, and by clan_vote_close after the deadline.
-- p_by is null when the deadline closed it — nobody pressed anything.
create or replace function public.hr_clan_vote_settle_one(p_vote uuid, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_v public.clan_order_votes%rowtype;
  v_tally jsonb; v_top int; v_winners text[]; v_res jsonb;
  v_outcome text; v_err text; v_order uuid; v_win text;
begin
  select * into v_v from public.clan_order_votes where id = p_vote for update;
  if v_v.id is null then return jsonb_build_object('ok', false, 'error', 'no_vote'); end if;
  if v_v.closed_at is not null then
    return jsonb_build_object('ok', true, 'already_closed', true, 'outcome', v_v.outcome,
      'winner', v_v.winner_building, 'order_id', v_v.order_id,
      'tally', public.hr_clan_vote_tally(p_vote));
  end if;

  v_tally := public.hr_clan_vote_tally(p_vote);
  select max(value::int) into v_top from jsonb_each_text(v_tally);
  if v_top is null then
    v_outcome := 'void'; v_err := 'no_ballots';
  else
    select array_agg(key order by key) into v_winners
      from jsonb_each_text(v_tally) where value::int = v_top;
    if array_length(v_winners, 1) > 1 then
      -- A tie is REPORTED, never broken. Leadership picks; the hold can see why.
      v_outcome := 'tie';
    else
      v_win := v_winners[1];
      v_res := public.hr_clan_order_create(v_v.clan_id, v_win, coalesce(p_by, v_v.opened_by));
      if (v_res->>'ok')::boolean then
        v_outcome := 'posted';
        v_order := (v_res->>'order_id')::uuid;
      else
        -- The hold moved while the vote ran: the slot filled, the level cap
        -- bit, the hold went dormant. Say which, and do not pretend.
        v_outcome := 'void'; v_err := v_res->>'error';
      end if;
    end if;
  end if;

  update public.clan_order_votes
     set closed_at = now(), closed_by = p_by, outcome = v_outcome,
         outcome_error = v_err, winner_building = v_win, order_id = v_order
   where id = p_vote;

  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'winner', v_win,
    'order_id', v_order, 'reason', v_err, 'tally', v_tally,
    'tied', case when v_outcome = 'tie' then to_jsonb(v_winners) else null end);
end $$;

-- The lazy settle: close anything whose deadline has passed. This is what makes
-- "at the deadline the winner posts itself" true without a scheduler.
create or replace function public.hr_clan_vote_settle(p_clan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.clan_order_votes
   where clan_id = p_clan_id and closed_at is null and deadline <= now() limit 1;
  if v_id is not null then perform public.hr_clan_vote_settle_one(v_id, null); end if;
end $$;

-- OPEN. Two to four candidates, each a building the hold could actually
-- commission right now — offering a candidate the winner could never be built
-- from is how a vote becomes theatre.
create or replace function public.clan_vote_open(p_clan_id uuid, p_candidates jsonb, p_hours int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype; v_role text;
  v_n int; v_h int; v_id uuid; v_out jsonb; b text; v_cur int; v_cands jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not public.hr_clan_may_post(p_clan_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_vice');
  end if;

  perform public.hr_clan_vote_settle(p_clan_id);
  if exists (select 1 from public.clan_order_votes where clan_id = p_clan_id and closed_at is null) then
    return jsonb_build_object('ok', false, 'error', 'vote_open');
  end if;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;

  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_candidates');
  end if;
  select count(distinct value) into v_n from jsonb_array_elements_text(p_candidates);
  if v_n < 2 or v_n > 4 then return jsonb_build_object('ok', false, 'error', 'bad_candidates'); end if;

  for b in select distinct value from jsonb_array_elements_text(p_candidates) loop
    if not exists (select 1 from public.hr_castle_buildings where building = b) then
      return jsonb_build_object('ok', false, 'error', 'no_building', 'building', b);
    end if;
    v_cur := coalesce(nullif(v_clan.upgrades->>b,'')::int, 0);
    if v_cur + 1 > least(10, v_clan.castle_tier * 2) then
      return jsonb_build_object('ok', false, 'error', 'too_high', 'building', b,
        'cap', v_clan.castle_tier * 2);
    end if;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('building', b, 'to_level', v_cur + 1));
  end loop;

  v_h := greatest(1, least(168, coalesce(p_hours, 24)));
  insert into public.clan_order_votes (clan_id, opened_by, deadline, candidates)
    values (p_clan_id, auth.uid(), now() + make_interval(hours => v_h), v_cands)
    returning id into v_id;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (p_clan_id, auth.uid(), 'role', 'vote_open');

  return jsonb_build_object('ok', true, 'vote_id', v_id, 'candidates', v_cands,
    'deadline', (select deadline from public.clan_order_votes where id = v_id), 'hours', v_h);
end $$;
grant execute on function public.clan_vote_open(uuid, jsonb, int) to authenticated;

-- CAST. One row per member per vote, upserted, so changing your mind is free
-- and voting twice is impossible.
create or replace function public.clan_vote_cast(p_clan_id uuid, p_vote uuid, p_building text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_v public.clan_order_votes%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;

  select * into v_v from public.clan_order_votes where id = p_vote and clan_id = p_clan_id;
  if v_v.id is null then return jsonb_build_object('ok', false, 'error', 'no_vote'); end if;
  if v_v.closed_at is not null or v_v.deadline <= now() then
    -- Settle it on the way past, so the member who arrived a minute late sees
    -- the result rather than a dead ballot.
    perform public.hr_clan_vote_settle(p_clan_id);
    return jsonb_build_object('ok', false, 'error', 'vote_closed');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_v.candidates) c
                  where c->>'building' = p_building) then
    return jsonb_build_object('ok', false, 'error', 'not_candidate');
  end if;

  insert into public.clan_order_ballots (vote_id, user_id, building)
    values (p_vote, auth.uid(), p_building)
    on conflict (vote_id, user_id) do update set building = excluded.building, cast_at = now();

  return jsonb_build_object('ok', true, 'vote_id', p_vote, 'my_vote', p_building,
    'tally', public.hr_clan_vote_tally(p_vote),
    'voters', (select count(*)::int from public.clan_order_ballots where vote_id = p_vote));
end $$;
grant execute on function public.clan_vote_cast(uuid, uuid, text) to authenticated;

-- CLOSE. Leadership may close early; anyone may close one whose deadline has
-- passed, which is simply asking the lazy settle to run now.
create or replace function public.clan_vote_close(p_clan_id uuid, p_vote uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_v public.clan_order_votes%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into v_v from public.clan_order_votes where id = p_vote and clan_id = p_clan_id;
  if v_v.id is null then return jsonb_build_object('ok', false, 'error', 'no_vote'); end if;
  if v_v.closed_at is null and v_v.deadline > now()
     and not public.hr_clan_may_post(p_clan_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_vice');
  end if;
  return public.hr_clan_vote_settle_one(p_vote,
    case when v_v.deadline > now() then auth.uid() else null end);
end $$;
grant execute on function public.clan_vote_close(uuid, uuid) to authenticated;

-- READ. Settles first, then answers with the open vote (or the last closed one,
-- so a member who was asleep at the deadline still learns what the hold chose).
create or replace function public.clan_vote_read(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_v public.clan_order_votes%rowtype; v_mine text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;

  perform public.hr_clan_vote_settle(p_clan_id);

  select * into v_v from public.clan_order_votes
   where clan_id = p_clan_id order by (closed_at is null) desc, opened_at desc limit 1;
  if v_v.id is null then
    return jsonb_build_object('ok', true, 'vote', null, 'may_open', public.hr_clan_may_post(p_clan_id, auth.uid()));
  end if;
  select building into v_mine from public.clan_order_ballots
   where vote_id = v_v.id and user_id = auth.uid();

  return jsonb_build_object('ok', true,
    'may_open', public.hr_clan_may_post(p_clan_id, auth.uid()),
    'vote', jsonb_build_object(
      'id', v_v.id, 'candidates', v_v.candidates, 'deadline', v_v.deadline,
      'opened_at', v_v.opened_at, 'closed_at', v_v.closed_at, 'outcome', v_v.outcome,
      'outcome_error', v_v.outcome_error, 'winner_building', v_v.winner_building,
      'order_id', v_v.order_id, 'my_vote', v_mine,
      'tally', public.hr_clan_vote_tally(v_v.id),
      'voters', (select count(*)::int from public.clan_order_ballots where vote_id = v_v.id),
      'members', (select count(*)::int from public.clan_members where clan_id = p_clan_id)));
end $$;
grant execute on function public.clan_vote_read(uuid) to authenticated;

-- ── 4. clan_seat_read gains the live contributor count ──────
-- The panel's tier-gate sentence promises "needs contributions from 3 different
-- members (1 so far)". That parenthesis is the whole value of the sentence — it
-- is what tells a player whether to go and fetch a friend — and until now the
-- client could not know it: the gate counts distinct DEPOSITORS past the 72h
-- membership grace, which lives entirely server-side. So the read publishes it.
-- Re-created verbatim from clan-seat-2 plus one field; same signature.
create or replace function public.clan_seat_read(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clan public.clans%rowtype; v_next public.hr_castle_tiers%rowtype;
        v_cp bigint; v_stores jsonb; v_orders jsonb; v_t public.clan_tavern%rowtype;
        v_role text; v_charge text; v_lab int; v_members int; v_cap int; v_contrib int;
begin
  select role, charge into v_role, v_charge from public.clan_members
   where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  perform public.clan_upkeep_settle(p_clan_id);
  v_cp := public.hr_clan_decay_cp(p_clan_id, auth.uid());
  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid();

  select * into v_clan from public.clans where id = p_clan_id;
  select * into v_next from public.hr_castle_tiers where tier = v_clan.castle_tier + 1;
  select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) into v_stores
    from public.clan_stores where clan_id = p_clan_id and qty > 0;
  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_orders
    from public.clan_work_orders o where o.clan_id = p_clan_id and o.phase in ('supply','labour');
  select * into v_t from public.clan_tavern where clan_id = p_clan_id;
  select coalesce(ticks, 0) into v_lab from public.clan_work_labour
   where clan_id = p_clan_id and user_id = auth.uid() and day_key = public.hr_utc_day_key();
  select count(*) into v_members from public.clan_members where clan_id = p_clan_id;
  select member_cap into v_cap from public.hr_castle_tiers where tier = v_clan.castle_tier;
  -- Exactly the query clan_tier_up gates on. Two copies of a rule drift; this
  -- one is a copy on purpose and the smoke suite pins the sentence it feeds.
  select count(distinct l.user_id) into v_contrib
    from public.clan_ledger l
    join public.clan_members m on m.clan_id = l.clan_id and m.user_id = l.user_id
   where l.clan_id = p_clan_id and l.kind = 'deposit'
     and m.joined_at < now() - interval '72 hours';

  return jsonb_build_object('ok', true,
    'castle_tier', v_clan.castle_tier,
    'standing', v_clan.standing,
    'treasury', v_clan.treasury,
    'upgrades', coalesce(v_clan.upgrades, '{}'::jsonb),
    'upkeep_state', v_clan.upkeep_state,
    'next_tier', case when v_next.tier is null then null else to_jsonb(v_next) end,
    'my_cp', v_cp,
    'my_role', v_role,
    'my_charge', v_charge,
    'my_labour_today', coalesce(v_lab, 0),
    'members', v_members,
    'member_cap', coalesce(v_cap, 10),
    'tier_contributors', coalesce(v_contrib, 0),
    'stores', v_stores,
    'orders', v_orders,
    'build_slots', 1 + floor(greatest(1, v_clan.castle_tier) / 3),
    'building_cap', v_clan.castle_tier * 2,
    'feast_meter', coalesce(v_t.feast_meter, 0),
    'feast_until', v_t.feast_until,
    'feast_cd_until', v_t.feast_cd_until);
end $$;
grant execute on function public.clan_seat_read(uuid) to authenticated;

-- ── 5. Self-check ───────────────────────────────────────────
do $$
declare v_n int;
begin
  if to_regclass('public.clan_order_votes') is null then raise exception 'clan_order_votes missing'; end if;
  if to_regclass('public.clan_order_ballots') is null then raise exception 'clan_order_ballots missing'; end if;

  -- One vote per member is a PRIMARY KEY, not a hope.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.clan_order_ballots'::regclass and contype = 'p'
       and pg_get_constraintdef(oid) like '%(vote_id, user_id)%') then
    raise exception 'clan_order_ballots must be keyed (vote_id, user_id) — one vote per member';
  end if;

  -- One open ballot per hold.
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'clan_order_votes_open_uniq') then
    raise exception 'the one-open-vote-per-clan index did not take';
  end if;

  select count(*) into v_n from pg_proc where proname in
    ('hr_clan_may_post','hr_clan_order_create','hr_clan_vote_tally','hr_clan_vote_settle',
     'hr_clan_vote_settle_one','clan_vice_set','clan_vote_open','clan_vote_cast',
     'clan_vote_close','clan_vote_read');
  if v_n <> 10 then raise exception 'expected 10 governance functions, found %', v_n; end if;

  -- The vote tables are RPC-only. A client write policy here would let a
  -- member stuff the ballot box directly.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('clan_order_votes','clan_order_ballots');
  if v_n > 0 then raise exception '% client policies on the vote tables — they must be RPC-only', v_n; end if;

  -- The vice charge must be storable.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.clan_members'::regclass
         and conname = 'clan_members_charge_chk') not like '%vice%' then
    raise exception 'the charge CHECK does not admit ''vice''';
  end if;

  raise notice 'CLAN GOVERNANCE OK — vice charge, one-vote-per-member ballots, lazy vote settle.';
end $$;
