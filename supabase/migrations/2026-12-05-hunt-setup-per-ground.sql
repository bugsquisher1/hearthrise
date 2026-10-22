-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SETUP IS REMEMBERED PER GROUND, AND GEAR FOLLOWS THE SETUP
-- (lane c-hunt-screens-server, backend-architect, 2026-10-22; designer plan
-- "Hunts, Hunt prep and the Party finder", docs/planning/PRIORITY_BOARD.md,
-- items A #2 and A #4). STAGED, NOT APPLIED. Game CLOSED: applies on its
-- passing §6; part of the reopen Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hunt_density.preset (NEW column, nullable smallint >= 0): the setup (action
--    set number) this character last ENTERED this ground on. Same row as the
--    density pick (2026-11-17-hunt-density-home.sql); a row written only for the
--    setup carries density 0 (= no row, as built). Written ONLY by
--    hr_hunt_enter_for on an accepted enter (hr_hunt_enter, hr_hunt_restart and
--    every seat of hr_hunt_party_start go through it), with the set the session
--    actually opened on (hunt_sessions.preset). No new intent.
-- §2 hr_hunt_setup_view (NEW) + envelope section `hunt_setup`: { <hunt_id>: preset }
--    of this character, only sets that still exist (0 always does), so a deleted
--    setup is never pre-picked. A SIBLING of `hunt_density`, not a new value shape
--    inside it: the shipped client reads hunt_density (and the party's
--    leader_densities, the same view) as { hunt: whole number } and drops any
--    other value (session/hunt-sections.js densityMapOf), so folding the setup
--    into that map would blank every density pick until the client half ships.
-- §3 hr_hunt_enter_check (NEW, internal): EVERY refusal hr_hunt_enter_for can
--    answer, in its order, as one read-only predicate (null = may enter).
--    hr_hunt_enter_for RESTATED WHOLE (§0 pins the 2026-10-30 image): it takes its
--    locks (party row, character, the bag's stock rows), asks the predicate ONCE,
--    and only then writes. The party view's seat readiness
--    (2026-12-07-party-finder.sql) asks the SAME predicate, so "ready" on a seat
--    and Start's `not_ready` cannot disagree. FIXES on the way: the old body
--    journalled `activity_yield` BEFORE its preset/admit/stamina/stock checks, so
--    a refused enter left a yield row for an activity that kept running; a bag
--    line whose stock moved under the lock now raises instead of loading unpaid.
-- §4 GEAR FOLLOWS THE SETUP (A #4). hr_setup_gear_follow (NEW trigger on
--    player_equipment, every insert/update/delete): the setup in use
--    (player_hunt_active) has its player_hunt_presets.gear set to what is worn.
--    The only equipment writers are hr_apply's equip delta and the start kit
--    (hr_create_character), so every equip and unequip, from any door, follows;
--    "Save here" is no longer needed. hr_hunt_preset_apply RESTATED WHOLE (§0
--    pins the 2026-10-25 image): Use switches the setup in use FIRST, then makes
--    the worn set exactly the setup's gear (named slots worn, every other
--    catalogued slot taken off), as ONE unit: a refused equip leaves the hero on
--    the setup and gear it had. ONCE: each character's setup in use takes its
--    worn gear (the state the trigger would have produced).
--    NOTE (brief vs schema): a setup's gear lives in player_hunt_presets.gear
--    (setup N owns action set N, 2026-11-15-preset-names.sql); player_action_sets
--    has no gear column. A set with no setup row has no gear to follow.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- Enter: party row FOR UPDATE, then hr_hunt_lock (advisory + player_state + the
-- open session), then the bag's player_inventory rows FOR UPDATE in item order:
-- the same order as before; the predicate reads under all three. The setup write
-- is one upsert on hunt_density's PK inside the enter. The gear trigger runs in
-- the equipping transaction, which already holds the character's player_state
-- row (hr_apply) or creates it (start kit); it writes only that character's rows.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No new client RPC, no grant. hunt_density.preset and setup gear are the
-- caller's own configuration (owner sections only); nothing gates, spends or
-- ranks on them. Use still re-proves every equip in hr_apply (ownership debit,
-- slot, requirement, two hands).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- hunt_density: still at most one row per (character, ground). The trigger: one
-- PK update per equipment row written (an equip delta is a few rows).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop trigger hr_setup_gear_follow on public.player_equipment; drop the trigger
-- function, hr_hunt_setup_view and hr_hunt_enter_check; delete the `hunt_setup`
-- section row; re-apply hr_hunt_enter_for from 2026-10-30-town-activity-yields.sql
-- and hr_hunt_preset_apply from 2026-10-25-hunt-presets.sql; drop the column.
-- ORDER: after 2026-12-04-world-actions-cut.sql (the v0.2.32 set: 12-03
-- daily-claims-cut, 12-04 hero-rename, 12-04 world-actions-cut; no object in
-- common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS (md5 of the CR-stripped prosrc: the chain-end image, or this file's own) ──
do $mig$
declare v_src text;
begin
  if to_regclass('public.hunt_density') is null or to_regclass('public.player_hunt_presets') is null
     or to_regclass('public.player_hunt_active') is null or to_regclass('public.player_equipment') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_equip_slots') is null then
    raise exception 'PRECONDITION: hunt_density / player_hunt_presets / player_hunt_active / player_equipment / hr_state_sections / hr_equip_slots missing'; end if;
  if public.hr_hunt_limit('presets') <> 5 then
    raise exception 'PRECONDITION: hr_hunt_limit(presets) is %, player_action_sets holds 0..4', public.hr_hunt_limit('presets'); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure;
  if md5(v_src) <> 'afd3cac8734429107183eeabf7df61bc' and strpos(v_src, 'SETUP-PER-GROUND') = 0 then
    raise exception 'PIN: hr_hunt_enter_for is neither the 2026-10-30 town-yields image (afd3cac8...) nor this file''s (md5 %): restate from the new image', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_preset_apply(integer,integer,uuid)'::regprocedure;
  if md5(v_src) <> '7b6ba13ede6ff04a6fc53f314240790e' and strpos(v_src, 'SETUP-PER-GROUND') = 0 then
    raise exception 'PIN: hr_hunt_preset_apply is neither the 2026-10-25 image (7b6ba13e...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE SETUP A GROUND WAS LAST ENTERED ON ─────────────────────────────────
alter table public.hunt_density add column if not exists preset smallint;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_density_preset_range') then
    alter table public.hunt_density add constraint hunt_density_preset_range check (preset is null or preset >= 0);
  end if;
end $mig$;
comment on column public.hunt_density.preset is
  '2026-12-05-hunt-setup-per-ground.sql: the setup (action set) this character last entered this ground on; written only by '
  'hr_hunt_enter_for on an accepted enter (hunt_sessions.preset). NULL = never entered it. Projected as the hunt_setup section.';
comment on table public.hunt_density is
  '2026-11-17-hunt-density-home.sql + 2026-12-05-hunt-setup-per-ground.sql: per (character, hunt ground) what the hunt picker '
  'remembers. density: the monster-density pick (rulings H4: the party leader''s in a party; 0 = as built; no row = 0), written '
  'only by hr_hunt_density_set (bounded by hr_hunt_grounds.density_max), frozen on an instance by hr_hunt_density_pick. preset: '
  'the setup last entered on, written only by hr_hunt_enter_for. Read by hr_hunt_density_view (hunt_density section, the party''s '
  'leader_densities) and hr_hunt_setup_view (hunt_setup section). RLS on, no policy, no client grant.';

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_hunt_setup_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): { <hunt_id>: the setup last entered on }, a set that
  -- still exists only (set 0 always does), so the picker never pre-picks a deleted setup.
  select coalesce((select jsonb_object_agg(d.hunt_id, d.preset order by d.hunt_id)
                     from public.hunt_density d
                    where d.user_id = p_user and d.slot = p_slot and d.preset is not null
                      and (d.preset = 0 or exists (select 1 from public.player_action_sets a
                                                    where a.user_id = d.user_id and a.slot = d.slot and a.preset = d.preset))),
                  '{}'::jsonb)
$$;
revoke execute on function public.hr_hunt_setup_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_setup', 'hr_hunt_setup_view', '2026-12-05-hunt-setup-per-ground.sql: per hunt ground, the setup (action set) this hero last entered it on')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 ONE ENTER PREDICATE, AND THE ENTER THAT ASKS IT UNDER ITS LOCKS ─────────
create or replace function public.hr_hunt_enter_check(p_uid uuid, p_slot int, p_hunt text, p_bag jsonb, p_preset int, p_hours int,
                                                      p_any_ground boolean default false)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): every refusal hr_hunt_enter_for answers, in its order.
  -- null = this character may enter p_hunt now with this bag, set and hours. hr_hunt_enter_for asks it under its
  -- locks; the party view's seat readiness asks it without (p_any_ground: with no ground chosen yet, the ground's own
  -- checks, unknown_hunt / no_ground / party_hunt_mismatch / the admission gate, are left to Start).
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line  jsonb; v_item text; v_items text[] := '{}'; v_have bigint;
  v_ground boolean := not (coalesce(p_any_ground, false) and p_hunt is null);
  v_party uuid; v_ph text; v_sid uuid; v_shunt text;
  v_st    public.player_state%rowtype;
  v_r     jsonb;
begin
  if p_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return jsonb_build_object('ok', false, 'error', 'hunts_paused'); end if;
  if v_ground then
    if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
      return jsonb_build_object('ok', false, 'error', 'unknown_hunt'); end if;
    -- A HUNT IS FOUGHT ON A GROUND: no ground, no world, no hunt (spec §1.1).
    if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
      return jsonb_build_object('ok', false, 'error', 'no_ground'); end if;
  end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return jsonb_build_object('ok', false, 'error', 'bad_preset'); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  -- THE BAG, shape.
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64)); end if;
    if v_item = any (v_items) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item); end if;
  end loop;
  -- A PARTY MEMBER ENTERS ITS PARTY'S GROUND (a ground-less party matches no hunt).
  v_party := public.hr_hunt_party_of(p_uid, p_slot);
  if v_ground and v_party is not null then
    select p.hunt_id into v_ph from public.hunt_parties p where p.id = v_party;
    if v_ph is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'party_hunt_mismatch', 'hunt', v_ph); end if;
  end if;
  select * into v_st from public.player_state where user_id = p_uid and slot = p_slot;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  select h.id, h.hunt_id into v_sid, v_shunt from public.hunt_sessions h
   where h.user_id = p_uid and h.slot = p_slot and h.ended_at is null;
  if v_sid is not null then
    return jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_sid, 'hunt', v_shunt); end if;
  -- A TOWN ACTIVITY YIELDS TO THE HUNT (gathering, an artisan run, training); anything else running refuses.
  if v_st.active_kind not in ('gather', 'artisan', 'training') and v_st.active_kind <> 'idle' then
    return jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a where a.user_id = p_uid and a.slot = p_slot and a.preset = p_preset) then
    return jsonb_build_object('ok', false, 'error', 'unknown_preset'); end if;
  if v_ground then
    v_r := public.hr_hunt_admit(p_uid, p_slot, p_hunt);
    if v_r is not null then return v_r; end if;
  end if;
  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(p_uid, p_slot, now()), 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_stamina'); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = p_uid and slot = p_slot and item_id = v_line->>'item';
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint); end if;
  end loop;
  return null;
end $$;
revoke execute on function public.hr_hunt_enter_check(uuid, int, text, jsonb, int, int, boolean) from public;
revoke execute on function public.hr_hunt_enter_check(uuid, int, text, jsonb, int, int, boolean) from anon, authenticated, service_role, hr_engine, hr_tick;

CREATE OR REPLACE FUNCTION public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a town activity yields to the hunt instead of refusing it.
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the locks first, then ONE predicate
  -- (hr_hunt_enter_check, the party view's seat readiness asks the same), and nothing is written before it answers;
  -- the set the session opened on is remembered for the ground (hunt_density.preset).
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_st   public.player_state%rowtype;
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean;
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_bag is null then p_bag := '[]'::jsonb; end if;

  -- THE LOCKS (order: the party row, the character, the bag's stock rows), then the one predicate.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if jsonb_typeof(p_bag) = 'array' then
    perform 1 from public.player_inventory pi
     where pi.user_id = v_uid and pi.slot = p_slot
       and pi.item_id in (select l->>'item' from jsonb_array_elements(p_bag) l where jsonb_typeof(l) = 'object')
     order by pi.item_id for update;
  end if;
  v_r := public.hr_hunt_enter_check(v_uid, p_slot, p_hunt, p_bag, p_preset, p_hours);
  if v_r is not null then return v_r; end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;

  -- A TOWN ACTIVITY YIELDS TO THE HUNT (live v0.2.11): gathering, an artisan run or training stops here and the
  -- hunt pointer replaces it (hr_hunt_point below); it is journalled with the instant it was last settled to.
  if v_st.active_kind in ('gather', 'artisan', 'training') then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_uid, p_slot, 'hunt', 'activity_yield',
              jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id, 'settled_to', v_st.accrued_to, 'hunt', p_hunt));
  end if;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  -- NEVER BEFORE THE STAMINA STAMP (2026-10-28): the last session's settle may have
  -- run to the swing boundary just past its leave (stamina_at = that window's end),
  -- and with no walk (travel_s 0) a hunt entered within that swing would open BEHIND
  -- it: every settle of it would refuse stamina_ahead, forever.
  v_from := greatest(date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))),
                     v_st.stamina_at);
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, on the party's ground of this start, with
      -- no world (the swing counter keeps counting forward).
      update public.hunt_instances set hunt_id = p_hunt, world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
      -- The stock was proved under its row lock: a line that matches neither is a broken invariant, never a free load.
      if not found then raise exception 'hr_hunt_enter_for: the stock of % moved under its lock', v_item; end if;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;
  -- THE SETUP THIS GROUND WAS ENTERED ON (A #2): the set the session opened on, beside the ground's density pick.
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, preset, updated_at)
    values (v_uid, p_slot, p_hunt, 0, (select h.preset from public.hunt_sessions h where h.id = v_id), now())
    on conflict (user_id, slot, hunt_id) do update set preset = excluded.preset, updated_at = now();

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;
revoke execute on function public.hr_hunt_enter_for(uuid, int, text, jsonb, int, int) from public;
revoke execute on function public.hr_hunt_enter_for(uuid, int, text, jsonb, int, int) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 GEAR FOLLOWS THE SETUP ────────────────────────────────────────────────
create or replace function public.hr_setup_gear_follow()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_u uuid; v_s int; v_gear jsonb;
begin
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the setup in use wears what the hero wears.
  if tg_op = 'DELETE' then v_u := old.user_id; v_s := old.slot; else v_u := new.user_id; v_s := new.slot; end if;
  select coalesce(jsonb_object_agg(e.equip_slot, e.item_id), '{}'::jsonb) into v_gear
    from public.player_equipment e where e.user_id = v_u and e.slot = v_s;
  update public.player_hunt_presets p set gear = v_gear, updated_at = now()
   where p.user_id = v_u and p.slot = v_s and p.preset = public.hr_hunt_active_set(v_u, v_s)
     and p.gear is distinct from v_gear;
  return null;
end $$;
revoke execute on function public.hr_setup_gear_follow() from public;
revoke execute on function public.hr_setup_gear_follow() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_setup_gear_follow on public.player_equipment;
create trigger hr_setup_gear_follow after insert or update or delete on public.player_equipment
  for each row execute function public.hr_setup_gear_follow();

CREATE OR REPLACE FUNCTION public.hr_hunt_preset_apply(p_slot integer, p_preset integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): GEAR FOLLOWS THE SETUP. Use switches the setup in use
  -- FIRST, then makes the worn set exactly the setup's gear (every catalogued slot: the named item, or nothing), all
  -- or nothing; hr_setup_gear_follow then keeps the setup's gear equal to what is worn.
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_p public.player_hunt_presets%rowtype;
  v_s public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_delta jsonb := '{}'::jsonb; v_miss record; v_a jsonb; v_k text; v_row record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_verb := 'hunt_preset_apply:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_apply', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_p from public.player_hunt_presets where user_id = v_uid and slot = p_slot and preset = p_preset;
  if not found then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  if v_st.active_kind <> 'idle' then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind)); end if;
  if v_p.action_set <> 0 and not exists (select 1 from public.player_action_sets a
                                          where a.user_id = v_uid and a.slot = p_slot and a.preset = v_p.action_set) then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_action_set', 'action_set', v_p.action_set)); end if;
  -- THE GEAR: every catalogued equip slot whose worn item is not the setup's (JSON null = take it off).
  select coalesce(jsonb_object_agg(x.equip_slot, x.want), '{}'::jsonb) into v_delta
    from (select s.equip_slot,
                 case when jsonb_typeof(v_p.gear->s.equip_slot) = 'string' then v_p.gear->s.equip_slot else 'null'::jsonb end as want,
                 (select e.item_id from public.player_equipment e
                   where e.user_id = v_uid and e.slot = p_slot and e.equip_slot = s.equip_slot) as worn
            from public.hr_equip_slots s) x
   where (x.want #>> '{}') is distinct from x.worn;
  -- A missing item is refused BY NAME before anything moves (hr_apply re-proves it).
  select n.item, n.need, coalesce(pi.qty, 0) as have into v_miss
    from (select d.value #>> '{}' as item, count(*) as need from jsonb_each(v_delta) d
           where jsonb_typeof(d.value) = 'string' group by 1) n
    left join public.player_inventory pi on pi.user_id = v_uid and pi.slot = p_slot and pi.item_id = n.item
   where coalesce(pi.qty, 0) < n.need order by n.item limit 1;
  if v_miss.item is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'missing_item',
      'item', v_miss.item, 'have', v_miss.have, 'need', v_miss.need)); end if;
  -- THE SWITCH, THEN THE GEAR, AS ONE: the equipment trigger writes the gear of the setup now in use (this one),
  -- never the one being left; a refused equip rolls the switch back.
  begin
    insert into public.player_hunt_active as a (user_id, slot, action_set, updated_at) values (v_uid, p_slot, v_p.action_set, now())
      on conflict (user_id, slot) do update set action_set = excluded.action_set, updated_at = now();
    if v_delta <> '{}'::jsonb then
      v_a := public.hr_apply(v_uid, p_slot, v_st.version, p_idem,
               jsonb_build_object('equip', v_delta, 'journal', jsonb_build_object('kind', 'equip', 'intent', v_verb)));
      if coalesce(v_a->>'ok', 'false') <> 'true' then
        raise exception using errcode = 'HR895', message = 'setup_gear_refused'; end if;
    end if;
  exception when sqlstate 'HR895' then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, v_a || jsonb_build_object('ok', false));
  end;
  -- THE RESTOCK TARGETS (only items a supply offer still sells).
  for v_row in select r.item_id, r.locked, r.loot_rule from public.player_item_rules r
                where r.user_id = v_uid and r.slot = p_slot and r.restock > 0 and not (v_p.restock ? r.item_id) for update loop
    perform public.hr_item_rule_put(v_uid, p_slot, v_row.item_id, v_row.locked, v_row.loot_rule, 0);
  end loop;
  for v_k in select x.key from jsonb_each(v_p.restock) x
              where jsonb_typeof(x.value) = 'number' and (x.value #>> '{}')::numeric between 1 and 1000
                and exists (select 1 from public.hr_shop_supply_offers o where o.item_id = x.key and o.kind <> 'tool') order by x.key loop
    select r.locked, r.loot_rule into v_row from public.player_item_rules r where r.user_id = v_uid and r.slot = p_slot and r.item_id = v_k;
    perform public.hr_item_rule_put(v_uid, p_slot, v_k, v_row.locked, v_row.loot_rule, (v_p.restock->>v_k)::numeric::int);
  end loop;
  v_r := jsonb_build_object('ok', true, 'worn', v_delta, 'action_set', v_p.action_set,
                            'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  if v_delta = '{}'::jsonb then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $function$;
revoke execute on function public.hr_hunt_preset_apply(int, int, uuid) from public;
revoke execute on function public.hr_hunt_preset_apply(int, int, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_preset_apply(int, int, uuid) to authenticated;

-- ONCE: each character's setup in use wears what it wears now (what the trigger would have written). A re-apply
-- finds every such row already equal and moves nothing.
update public.player_hunt_presets p
   set gear = w.gear, updated_at = now()
  from (select ps.user_id, ps.slot,
               coalesce((select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e
                          where e.user_id = ps.user_id and e.slot = ps.slot), '{}'::jsonb) as gear
          from public.player_state ps) w
 where p.user_id = w.user_id and p.slot = w.slot and p.preset = public.hr_hunt_active_set(w.user_id, w.slot)
   and p.gear is distinct from w.gear;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00005e750001';
  k     text := '000000c0-0000-4000-a000-0000';
  v_g1  text; v_g2 text;
  v jsonb; v_c jsonb; v_sid uuid; v_n int; v_gear jsonb; v_hi text;
begin
  begin
    select g.hunt_id into v_g1 from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    select g.hunt_id into v_g2 from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id)
     where g.hunt_id <> v_g1 order by h.band_min, g.hunt_id limit 1;
    if v_g1 is null or v_g2 is null then raise exception 'VERIFY(0): fewer than two hunt grounds in the catalogue'; end if;
    select i.item_id into v_hi from public.hr_items i
     where i.req_lv > 1 and i.req_skill is not null
       and exists (select 1 from public.hr_item_slots s where s.item_id = i.item_id and s.equip_slot <> 'weapon')
     order by i.req_lv, i.item_id limit 1;
    if v_hi is null then raise exception 'VERIFY(0): no equippable item with a level requirement'; end if;
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Setup') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'setup-per-ground §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    if public.hr_state_of(v_u, 0)->'hunt_setup' <> '{}'::jsonb then
      raise exception 'VERIFY(a): a fresh hero''s hunt_setup is %', public.hr_state_of(v_u, 0)->'hunt_setup'; end if;

    -- (a) SETUPS: "Sword" = set 0 (the kit), "Bow" = set 1; the hero ends on set 1.
    v := public.hr_hunt_preset_save(0, 0, 'Sword', (k || '5e750101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): saving setup 0 answered %', v; end if;
    v := public.hr_hunt_preset_save(0, 1, 'Bow', (k || '5e750102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_active_set(v_u, 0) <> 1 then raise exception 'VERIFY(a): saving setup 1 answered %', v; end if;

    -- (b) GEAR FOLLOWS: on set 1, wear the bow (the shield off); set 1's gear is what is worn, set 0's is untouched.
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '5e750103')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_bow', 'shield', null),
                              'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): wearing the bow answered %', v; end if;
    select coalesce(jsonb_object_agg(e.equip_slot, e.item_id), '{}'::jsonb) into v_gear from public.player_equipment e where e.user_id = v_u and e.slot = 0;
    if (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) is distinct from v_gear
       or v_gear->>'weapon' is distinct from 'practice_bow' or v_gear ? 'shield' then
      raise exception 'VERIFY(b): set 1''s gear is % while the hero wears %', (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1), v_gear; end if;
    if (select gear->>'weapon' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 0) is distinct from 'practice_sword'
       or not ((select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 0) ? 'shield') then
      raise exception 'VERIFY(b): an equip on set 1 moved set 0''s gear to %', (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 0); end if;

    -- (c) USE IS EXACT, BOTH WAYS: set 0 puts the sword AND the shield back on; set 1 takes the shield off again.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_preset_apply(0, 0, (k || '5e750104')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_active_set(v_u, 0) <> 0
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 'practice_sword'
       or not exists (select 1 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'shield')
       or (select gear->>'weapon' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> 'practice_bow' then
      raise exception 'VERIFY(c): Use set 0 answered % (worn %)', v,
        (select jsonb_object_agg(equip_slot, item_id) from public.player_equipment where user_id = v_u and slot = 0); end if;
    v := public.hr_hunt_preset_apply(0, 1, (k || '5e750105')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_active_set(v_u, 0) <> 1
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 'practice_bow'
       or exists (select 1 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'shield') then
      raise exception 'VERIFY(c): Use set 1 answered % (worn %)', v,
        (select jsonb_object_agg(equip_slot, item_id) from public.player_equipment where user_id = v_u and slot = 0); end if;

    -- (d) ALL OR NOTHING: set 0 names an item the hero holds but may not wear yet; Use is refused by hr_apply and the
    --     hero stays on set 1 in the bow.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_hi, 1)
      on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + 1;
    update public.player_hunt_presets set gear = gear || jsonb_build_object((select s.equip_slot from public.hr_item_slots s
                                                                              where s.item_id = v_hi order by 1 limit 1), v_hi)
     where user_id = v_u and slot = 0 and preset = 0;
    v := public.hr_hunt_preset_apply(0, 0, (k || '5e750106')::uuid);
    if v->>'error' is distinct from 'requirement_not_met' or public.hr_hunt_active_set(v_u, 0) <> 1
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 'practice_bow' then
      raise exception 'VERIFY(d): a refused Use answered % and left the hero on set % in %', v, public.hr_hunt_active_set(v_u, 0),
        (select jsonb_object_agg(equip_slot, item_id) from public.player_equipment where user_id = v_u and slot = 0); end if;

    -- (e) ONE PREDICATE: a refusal answers the same from the check and the enter, and writes nothing (no yield row
    --     while a gathering run goes on, no setup remembered).
    update public.player_state set active_kind = 'gather', active_id = 'copper_rock' where user_id = v_u and slot = 0;
    v_c := public.hr_hunt_enter_check(v_u, 0, v_g1, '[]'::jsonb, 3, null);
    v := public.hr_hunt_enter(0, v_g1, '[]'::jsonb, 3, null, (k || '5e750107')::uuid);
    if v_c->>'error' is distinct from 'unknown_preset' or v->>'error' is distinct from 'unknown_preset' then
      raise exception 'VERIFY(e): an unknown set: check % / enter %', v_c, v; end if;
    v_c := public.hr_hunt_enter_check(v_u, 0, v_g1, '[{"item":"cooked_shrimp","qty":99999}]'::jsonb, 1, null);
    v := public.hr_hunt_enter(0, v_g1, '[{"item":"cooked_shrimp","qty":99999}]'::jsonb, 1, null, (k || '5e750108')::uuid);
    if v_c->>'error' is distinct from 'insufficient_item' or v->>'error' is distinct from 'insufficient_item' then
      raise exception 'VERIFY(e): too much stock: check % / enter %', v_c, v; end if;
    if exists (select 1 from public.player_ledger where user_id = v_u and intent = 'activity_yield')
       or exists (select 1 from public.hunt_density where user_id = v_u)
       or (select active_kind from public.player_state where user_id = v_u and slot = 0) <> 'gather' then
      raise exception 'VERIFY(e): a refused enter journalled a yield, remembered a setup or stopped the run'; end if;
    if public.hr_hunt_enter_check(v_u, 0, v_g1, '[]'::jsonb, 1, null) is not null then
      raise exception 'VERIFY(e): the check refuses a good enter: %', public.hr_hunt_enter_check(v_u, 0, v_g1, '[]'::jsonb, 1, null); end if;

    -- (f) THE SETUP PER GROUND: entering g1 on set 1 remembers 1 (the density pick untouched); g2 on set 0 remembers 0.
    v := public.hr_hunt_density_set(0, v_g1, 1, (k || '5e750109')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the density pick answered %', v; end if;
    v := public.hr_hunt_enter(0, v_g1, '[]'::jsonb, 1, null, (k || '5e750110')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): entering on set 1 answered %', v; end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'activity_yield') <> 1 then
      raise exception 'VERIFY(f): the accepted enter did not journal the run it stopped'; end if;
    if (select preset from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = v_g1) is distinct from 1::smallint
       or (select density from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = v_g1) <> 1
       or public.hr_state_of(v_u, 0)->'hunt_setup' <> jsonb_build_object(v_g1, 1)
       or public.hr_state_of(v_u, 0)->'hunt_density' <> jsonb_build_object(v_g1, 1) then
      raise exception 'VERIFY(f): after g1 on set 1: setup % density % (sections % / %)',
        public.hr_state_of(v_u, 0)->'hunt_setup', public.hr_state_of(v_u, 0)->'hunt_density',
        (select preset from public.hunt_density where user_id = v_u and hunt_id = v_g1), (select density from public.hunt_density where user_id = v_u and hunt_id = v_g1); end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, v_g2, '[]'::jsonb, 0, null, (k || '5e750111')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): entering g2 on set 0 answered %', v; end if;
    if public.hr_state_of(v_u, 0)->'hunt_setup' <> jsonb_build_object(v_g1, 1, v_g2, 0)
       or (select density from public.hunt_density where user_id = v_u and slot = 0 and hunt_id = v_g2) <> 0 then
      raise exception 'VERIFY(f): after g2 on set 0 the section is %', public.hr_state_of(v_u, 0)->'hunt_setup'; end if;
    -- a deleted setup is never pre-picked
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    delete from public.player_action_sets where user_id = v_u and slot = 0 and preset = 1;
    if public.hr_state_of(v_u, 0)->'hunt_setup' <> jsonb_build_object(v_g2, 0) then
      raise exception 'VERIFY(f): a deleted set is still projected: %', public.hr_state_of(v_u, 0)->'hunt_setup'; end if;

    -- (g) nothing new is client-executable.
    if has_function_privilege('authenticated', 'public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_setup_view(uuid,integer)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_setup_gear_follow()', 'execute')
       or has_function_privilege('anon', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute')
       or not has_function_privilege('authenticated', 'public.hr_hunt_preset_apply(integer,integer,uuid)', 'execute')
       or has_table_privilege('authenticated', 'public.hunt_density', 'select') then
      raise exception 'VERIFY(g): a grant is wrong'; end if;
    raise exception using errcode = 'HR896', message = 'setup-per-ground §6 complete - rolling back';
  exception when sqlstate 'HR896' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(h): §6 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'setup-per-ground: one enter predicate, a refusal writes nothing, the setup is remembered per ground, gear follows the setup, Use is exact and all-or-nothing; all green';
end $$;
