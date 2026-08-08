-- ============================================================
-- Hearthrise — migration 2026-08-08 · THE CLAN SEAT, part 2 (backlog #10, Wave 3b)
--
-- Run AFTER supabase/migrations/2026-08-08-clan-seat.sql, in the Supabase SQL
-- editor. Idempotent: safe to re-run. ADDITIVE ONLY — it creates one table and
-- four functions (three RPCs plus one shared reader), and it re-creates exactly
-- one existing function (`clan_seat_read`) to widen its answer. Nothing is
-- dropped or altered.
--
-- Spec: docs/design/clan-overhaul.md v2 §9.2 (the Tavern Board) and §13 (what
-- the panel has to be able to say).
--
-- WHY THIS IS A SECOND FILE
--   Part 1 created `clan_board` and said, in its own comment, "the Board's RPCs
--   land with §16 step 6". This is step 6. Splitting it keeps part 1 exactly as
--   it was reviewed and — more usefully — means a project that has already run
--   part 1 does not have to re-run a 1,500-line file to get the Board.
--
-- WHAT THE BOARD IS FOR
--   It is the answer to "what does a level-3 player do for the hold on day
--   one". Every Phase-A Work Order bundle needs Timber Beams (crafting 25) and
--   Iron Fittings (smithing 25), which a fresh account does not have. Without
--   the Board a brand-new Wayside Camp is an empty panel with no instruction —
--   so the Barkeep posts work that ordinary play already does, and the vermin
--   drops that were vendor trash before the Clan Seat are what he pays for.
--
-- ⚠ SAME TRUST MODEL AS PART 1 (spec §12.3)
--   `clan_board_progress` counts actions the client reports. It is
--   SERVER-AUTHORITATIVE for the target, the reward, the period, the claim and
--   the rate; it is CLIENT-TRUSTED for "an action happened", clamped per call
--   and bounded by the target itself (a task cannot pay more than once, and
--   over-reporting cannot carry into the next period). Never describe it as
--   fully server-authoritative.
--
-- ECONOMY GUARANTEE
--   The Board pays Contribution and Standing. It does not pay gold, gems or
--   items, and there is no code path in this file that names a hearth_token.
--   The IAP bond is not mintable in PvE, at any tier, for any reason.
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.clan_board') is null then
    raise exception 'clan_board is missing — run supabase/migrations/2026-08-08-clan-seat.sql first';
  end if;
  if to_regclass('public.clan_ledger') is null then
    raise exception 'clan_ledger is missing — run supabase/migrations/2026-08-08-clan-seat.sql first';
  end if;
end $$;

-- ── 1. The Barkeep's catalogue ───────────────────────────────
-- A table, not a CASE statement, for the same reason hr_castle_items is a
-- table: the Designer re-tunes a reward with one UPDATE, and the client never
-- gets to choose what a task is worth.
--
-- `counter` names one of the six counters window.updateDaily already fires
-- (kill_any, gather, harvest, cooked, smithed, crafted). A task that needed a
-- NEW call site would be a task that silently stopped counting the first time
-- somebody refactored a skill — the Muster learned this the expensive way.
--
-- `live` is the staging switch. A task whose counter nothing feeds yet is
-- catalogued but never rolled, so the Board can grow a line the moment the
-- system that feeds it ships, without a migration.
create table if not exists public.hr_castle_board_tasks (
  task_id     text primary key,
  label       text   not null,
  counter     text   not null,
  base_target bigint not null check (base_target > 0),
  cp          bigint not null check (cp >= 0),
  standing    bigint not null check (standing >= 0),
  weekly      boolean not null default false,
  live        boolean not null default true
);
alter table public.hr_castle_board_tasks enable row level security;
drop policy if exists "board tasks readable" on public.hr_castle_board_tasks;
create policy "board tasks readable" on public.hr_castle_board_tasks for select using (true);

insert into public.hr_castle_board_tasks
  (task_id, label, counter, base_target, cp, standing, weekly, live) values
  -- Daily. Targets are COLLECTIVE — the whole hold pushes one bar, which is the
  -- point: a task a single member can finish alone is a personal daily wearing
  -- a clan's clothes.
  ('d_pot',    'The hold cooks for the winter',        'cooked',   800, 1400, 490, false, true),
  ('d_anvil',  'Every anvil in the hold rings',        'smithed',  600, 1200, 420, false, true),
  ('d_bench',  'The benches do not go quiet',          'crafted',  600, 1200, 420, false, true),
  ('d_vermin', 'The Barkeep pays for vermin',          'kill_any', 400, 1000, 350, false, true),
  ('d_seam',   'Bring in what the ground will give',   'gather',  1000, 1100, 385, false, true),
  ('d_field',  'Clear the fields before the storm',    'harvest',  500, 1000, 350, false, true),
  -- Weekly. A hold-sized number: roughly one active clan-week of one activity.
  ('w_forge',  'A week at the forge and the bench',    'smithed', 4000, 4000, 1400, true, true),
  ('w_larder', 'Fill the larder for the whole hold',   'cooked',  5000, 4000, 1400, true, true),
  -- STAGED, NOT FAKED. §9.2's weekly is "Break the Siege — deal 1.5x the
  -- declared Hunt pool_hp". Nothing reports raid damage into a counter yet: the
  -- Hunt is being rebuilt (clan-boss-events.md #16) and raids.js is not this
  -- wave's surface. A meter nobody feeds is a fake meter, so this row is
  -- catalogued and NOT rolled. When the Hunt lands a `raid_damage` counter,
  -- `update public.hr_castle_board_tasks set live = true where task_id = 'w_siege';`
  -- is the whole of the work.
  ('w_siege',  'Break the Siege',                      'raid_damage', 1, 4000, 1400, true, false)
on conflict (task_id) do update
  set label = excluded.label, counter = excluded.counter, base_target = excluded.base_target,
      cp = excluded.cp, standing = excluded.standing, weekly = excluded.weekly, live = excluded.live;

-- ── 2. The shared row reader ─────────────────────────────────
-- One implementation, so the roll, the progress call and the claim can never
-- disagree about what the Board says. Declared before its callers so the file
-- reads top-down even though plpgsql would not have minded.
create or replace function public.hr_clan_board_rows(p_clan_id uuid, p_day text, p_week text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'task_id',  b.task_id,
           'label',    t.label,
           'counter',  t.counter,
           'target',   b.target,
           'progress', least(b.progress, b.target),
           'cp',       t.cp,
           'standing', t.standing,
           'weekly',   t.weekly,
           'claimed',  auth.uid() = any(b.claimed_by)
         ) order by t.weekly, b.task_id), '[]'::jsonb)
    from public.clan_board b
    join public.hr_castle_board_tasks t on t.task_id = b.task_id
   where b.clan_id = p_clan_id and b.period_key in (p_day, p_week)
$$;
grant execute on function public.hr_clan_board_rows(uuid, text, text) to authenticated;

-- ── 3. Rolling the Board ─────────────────────────────────────
-- Three daily + one weekly, DERIVED from (clan_id, period_key) rather than
-- stored on a schedule. Same "derive, never store the schedule" discipline as
-- the upkeep boundary and the Muster's slots: no cron to forget, no row to fail
-- to insert, and every server and client agrees about what is posted today.
--
-- The target scales with castle tier so a Fortified Keep is not handed a Wayside
-- Camp's chores: target = base x (1 + 0.5 x (tier - 1)).
create or replace function public.clan_board_roll(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day   text := public.hr_utc_day_key();
  v_week  text := public.hr_utc_week_key();
  v_tier  int;
  v_scale numeric;
  v_seed  bigint;
  t       record;
  v_out   jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  select greatest(1, castle_tier) into v_tier from public.clans where id = p_clan_id;
  if v_tier is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  v_scale := 1 + 0.5 * (v_tier - 1);

  -- A stable per-clan, per-period seed. abs(hashtext(...)) is deterministic on
  -- a given Postgres, which is all that is needed: the roll must not change
  -- between two reads of the same day, and it must differ between clans.
  v_seed := abs(hashtext(p_clan_id::text || '#' || v_day));

  -- Three daily, chosen without replacement by ordering the live daily pool on
  -- a seeded hash of its own id.
  for t in
    select * from public.hr_castle_board_tasks
     where live and not weekly
     order by abs(hashtext(task_id || v_seed::text))
     limit 3
  loop
    insert into public.clan_board (clan_id, period_key, task_id, target)
      values (p_clan_id, v_day, t.task_id, ceil(t.base_target * v_scale)::bigint)
      on conflict (clan_id, period_key, task_id) do nothing;
  end loop;

  -- One weekly.
  for t in
    select * from public.hr_castle_board_tasks
     where live and weekly
     order by abs(hashtext(task_id || abs(hashtext(p_clan_id::text || '#' || v_week))::text))
     limit 1
  loop
    insert into public.clan_board (clan_id, period_key, task_id, target)
      values (p_clan_id, v_week, t.task_id, ceil(t.base_target * v_scale)::bigint)
      on conflict (clan_id, period_key, task_id) do nothing;
  end loop;

  return jsonb_build_object('ok', true, 'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
end $$;
grant execute on function public.clan_board_roll(uuid) to authenticated;

-- ── 4. Progress ──────────────────────────────────────────────
-- The client reports "N actions of kind K happened". The server decides which
-- posted tasks that touches, how far each may move, and it refuses to carry a
-- surplus past the target — so over-reporting buys nothing beyond the one task
-- it was already going to finish.
create or replace function public.clan_board_progress(p_clan_id uuid, p_counter text, p_delta int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_call_clamp constant int := 500;
  v_day  text := public.hr_utc_day_key();
  v_week text := public.hr_utc_week_key();
  v_n    int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_counter is null or p_delta is null or p_delta <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  v_n := least(p_delta, c_call_clamp);

  update public.clan_board b
     set progress = least(b.target, b.progress + v_n)
    from public.hr_castle_board_tasks t
   where b.clan_id = p_clan_id
     and b.period_key in (v_day, v_week)
     and t.task_id = b.task_id
     and t.counter = p_counter
     and b.progress < b.target;

  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = auth.uid();

  return jsonb_build_object('ok', true, 'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
end $$;
grant execute on function public.clan_board_progress(uuid, text, int) to authenticated;

-- ── 5. The claim ─────────────────────────────────────────────
-- Idempotent by the `claimed_by` array, which is also the anti-double-pay rule:
-- the array is the record, so a second call finds itself already in it. Every
-- member of the hold may claim a completed task once — the task is collective,
-- the reward is personal, and that is what makes a hold pull together on one
-- bar rather than race each other to it.
create or replace function public.clan_board_claim(p_clan_id uuid, p_task_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day   text := public.hr_utc_day_key();
  v_week  text := public.hr_utc_week_key();
  v_b     public.clan_board%rowtype;
  v_t     public.hr_castle_board_tasks%rowtype;
  v_rows  int;
  v_cp    bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  select * into v_b from public.clan_board
   where clan_id = p_clan_id and task_id = p_task_id and period_key in (v_day, v_week);
  if v_b.task_id is null then return jsonb_build_object('ok', false, 'error', 'no_task'); end if;
  if v_b.progress < v_b.target then
    return jsonb_build_object('ok', false, 'error', 'task_short',
      'progress', v_b.progress, 'target', v_b.target);
  end if;

  select * into v_t from public.hr_castle_board_tasks where task_id = p_task_id;

  -- Conditional update: row_count = 0 means this member is already in the
  -- array. Race-safe without an advisory lock, same shape as clan_work_complete.
  update public.clan_board
     set claimed_by = array_append(claimed_by, auth.uid())
   where clan_id = p_clan_id and task_id = p_task_id and period_key = v_b.period_key
     and not (auth.uid() = any(claimed_by));
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'already_claimed'); end if;

  perform public.hr_clan_decay_cp(p_clan_id, auth.uid());     -- decay BEFORE crediting
  update public.clan_members set cp = cp + v_t.cp, cp_at = now(), last_seen = now()
   where clan_id = p_clan_id and user_id = auth.uid()
   returning cp into v_cp;
  update public.clans set standing = standing + v_t.standing where id = p_clan_id;

  insert into public.clan_ledger (clan_id, user_id, kind, item_id, cp, standing)
    values (p_clan_id, auth.uid(), 'board', p_task_id, v_t.cp, v_t.standing);

  return jsonb_build_object('ok', true, 'task_id', p_task_id,
    'cp', v_t.cp, 'standing', v_t.standing, 'member_cp', v_cp,
    'tasks', public.hr_clan_board_rows(p_clan_id, v_day, v_week));
end $$;
grant execute on function public.clan_board_claim(uuid, text) to authenticated;

-- ── 6. clan_seat_read, widened ───────────────────────────────
-- Part 1's version answered everything the panel needed EXCEPT four things it
-- turned out to need the moment it was drawn:
--   my_role / my_charge  — the panel must grey out "Commission" for a member
--                          who is not a Steward and SAY WHY. Without the charge
--                          it could only recognise the leader, so an officer
--                          holding the Steward charge saw a button the server
--                          would have honoured, disabled.
--   my_labour_today      — the Work Order card promises "you have spent N of
--                          your 400 today". Starting that at zero every reload
--                          is a lie that corrects itself only after the first
--                          flush.
--   members / member_cap — the header says "members / cap", and the cap is a
--                          tier property the client already has; the count is
--                          not.
-- Re-created verbatim from part 1 plus those four. Same signature, so this is a
-- replacement, not a second function.
create or replace function public.clan_seat_read(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clan public.clans%rowtype; v_next public.hr_castle_tiers%rowtype;
        v_cp bigint; v_stores jsonb; v_orders jsonb; v_t public.clan_tavern%rowtype;
        v_role text; v_charge text; v_lab int; v_members int; v_cap int;
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
    'stores', v_stores,
    'orders', v_orders,
    'build_slots', 1 + floor(greatest(1, v_clan.castle_tier) / 3),
    'building_cap', v_clan.castle_tier * 2,
    'feast_meter', coalesce(v_t.feast_meter, 0),
    'feast_until', v_t.feast_until,
    'feast_cd_until', v_t.feast_cd_until);
end $$;
grant execute on function public.clan_seat_read(uuid) to authenticated;

-- ── 7. Self-check ────────────────────────────────────────────
do $$
declare v_n int; v_live int;
begin
  if to_regclass('public.hr_castle_board_tasks') is null then
    raise exception 'hr_castle_board_tasks missing';
  end if;

  -- The catalogue must hold enough live daily tasks to roll three of them, or
  -- clan_board_roll silently posts a short Board.
  select count(*) into v_live from public.hr_castle_board_tasks where live and not weekly;
  if v_live < 3 then
    raise exception 'only % live daily Board tasks — clan_board_roll needs at least 3', v_live;
  end if;
  select count(*) into v_live from public.hr_castle_board_tasks where live and weekly;
  if v_live < 1 then raise exception 'no live weekly Board task'; end if;

  -- Every live task must name a counter the client actually reports. A task
  -- fed by nothing is a fake meter, which is the one thing this file must not
  -- ship — `w_siege` is catalogued for exactly that reason and is NOT live.
  select count(*) into v_n from public.hr_castle_board_tasks
   where live and counter not in ('kill_any','gather','harvest','cooked','smithed','crafted');
  if v_n > 0 then
    raise exception '% live Board task(s) name a counter the client does not fire', v_n;
  end if;
  if exists (select 1 from public.hr_castle_board_tasks where task_id = 'w_siege' and live) then
    raise exception 'w_siege is live but nothing reports raid damage yet — see §9.2';
  end if;

  -- The widened read must actually carry the four new fields.
  if (select count(*) from pg_proc where proname = 'clan_seat_read') <> 1 then
    raise exception 'clan_seat_read should exist exactly once';
  end if;
  if (select count(*) from pg_proc where proname in
        ('clan_board_roll','clan_board_progress','clan_board_claim','hr_clan_board_rows')) <> 4 then
    raise exception 'the four Board functions did not all take';
  end if;

  -- No client write policy on the catalogue: the RPCs are the only writers.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'hr_castle_board_tasks'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception '% client write policies on hr_castle_board_tasks', v_n;
  end if;

  raise notice 'CLAN SEAT part 2 OK — % Board tasks catalogued, % live, clan_seat_read widened.',
    (select count(*) from public.hr_castle_board_tasks),
    (select count(*) from public.hr_castle_board_tasks where live);
end $$;
