-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SETTLE BOUNDS KNOW THE DENSITY, AND A REFUSED WINDOW NEVER
-- TRAPS A HERO (lane c-density-kill-bound, backend-architect, 2026-10-22; P0
-- bug report #57, v0.2.26: "swapped it to x8 on a noob char lvl 2.. wrecked
-- mobs, then they never spawned after 1st clear, can't leave either").
-- STAGED. Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- hr_hunt_apply_member held a window's kills to the ground's AS-BUILT spawns x
-- (window / respawn + 2). Density (Tyler 2026-10-20: the pull size, 1..16,
-- clamped to the ground) makes every pocket spawn up to 16, so the engine's
-- own honest kills outran the bound: measured on the replayed chain, a Level-2
-- club hero at Mill Cellar density 8 kills 22-24 in a 50 s window against a
-- bound of 15. The refused window never lands, so the next fire offers a
-- LONGER one (kills grow ~0.45/s, the bound ~0.17/s): every settle after is
-- refused (kills_over x165 on the live instance 32c99ffe), the world never
-- advances past swing 0 (nothing respawns on screen) and a Leave waits forever
-- on a settle that never lands.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 THE INSTANCE'S DENSITY, FROZEN AT HUNT START. NEW hunt_instances.density:
--    written ONCE by the server when the instance's first session opens
--    (AFTER INSERT trigger hr_hunt_density_freeze on hunt_sessions, through
--    hr_hunt_density_pick): the pick the engine would play at that moment, the
--    party LEADER's (hunt_parties.leader_*, its open session's preset, else 0)
--    for a party instance, the hero's own (its session's preset) for a solo one,
--    clamped to 0..density_max (the catalogue's ceiling, src/data/hunt-grounds.js
--    DENSITY_PICK.max; the engine further clamps to the ground's densityMax for
--    the party's size). Never moved after: a setup changed mid-hunt, or a stale
--    action-set row, cannot widen or narrow the bound for windows already played.
--    NULL only on instances opened before this file (the live 32c99ffe among
--    them): their bound reads the ceiling, so they recover through their own settle.
--    hr_hunt_instance_read RESTATED WHOLE (2026-11-01-party-leader-density.sql
--    image, md5-pinned) overlays the frozen value on every member's
--    options.density, so the engine (hunt-settle.js memberInput -> heroSetup ->
--    partyPick -> densityFor) plays exactly what the bound counts. No edge change.
--    NEW hunt_instances.refusals: the instance's CONSECUTIVE refused commits (0
--    after every commit that lands). Both columns server-only, like the row.
-- §2 hr_hunt_apply_member RESTATED WHOLE (2026-10-27-core-bodies.sql image,
--    md5-pinned): every bound that counts what the ground can present uses
--    v_pass = spawns + pockets x the instance's frozen density (as built when 0;
--    the catalogue ceiling when NULL): the kill bound, the Defense bound's
--    foes-at-once and the XP bound's carry-over. Never a client or edge number.
--    Gold, Level XP and item bounds stay per JOURNALLED kill (unchanged).
-- §3 THE REFUSED-WINDOW RULE (hr_hunt_apply_instance restated whole, the
--    2026-10-23-hunt-world-state.sql image, md5-pinned): every refusal after the
--    instance lock is counted (hr_hunt_settle_refused) and recorded with its own
--    detail (kills vs max). The SIXTH consecutive refusal FORFEITS the pending
--    window (hr_hunt_forfeit): nothing of it is credited (its rows were already
--    rolled back), every open session of the instance ends at the LAST ACCEPTED
--    boundary (settled_to) — `left` when its hero asked to leave or change,
--    `server` otherwise — its bag goes home (hr_hunt_close), and one zero-value
--    `hunt` / `window_forfeit` ledger row per session journals the code, detail
--    and window. A commit that lands resets the count. No other restore or
--    eviction: a transient refusal (a lost race) never reaches six in a row.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- Unchanged lock order: the instance row (for update), then each member's
-- character lock in (user_id, slot) order. The count is bumped under the
-- instance lock, outside the members' subtransaction, so a refused attempt
-- still counts; the forfeit runs under the same locks (a non-member open
-- session's character lock is taken after, in the same order).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- The kill bound grows only with the density the SERVER froze for the hunt
-- (Mill Cellar at 8: 5 -> 21 a pass; at 0 unchanged), read from the instance
-- row, never from the request; the freeze reads only server rows (validated
-- 0..16 by hr_action_set_options) and clamps again. A forfeit credits NOTHING and cannot be
-- triggered by a client: every settle input is server-held; it ends the hunt
-- at a boundary the server already accepted. No grant changes: the two new
-- helpers are owner-only, hr_hunt_apply_instance stays hr_engine-only.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_apply_member from 2026-10-27-core-bodies.sql,
-- hr_hunt_apply_instance from 2026-10-23-hunt-world-state.sql and
-- hr_hunt_instance_read from 2026-11-01-party-leader-density.sql (their pins
-- accept those images), drop the trigger and the four helpers; the two
-- columns may stay (inert).
-- ORDER: after 2026-11-07-players-online.sql (last APPLIED); depends on no
-- STAGED file. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if public.hr_hunt_limit('density_max') is null or to_regclass('public.hunt_instances') is null then
    raise exception 'PRECONDITION: the hunt-sessions catalogue (density_max) and hunt_instances first'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if md5(v_src) <> '7249217eb72112312e96f822c5f6a4b5' and strpos(v_src, 'DENSITY-BOUNDS (2026-11-16') = 0 then
    raise exception 'PIN: hr_hunt_apply_member moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure;
  if md5(v_src) <> 'c55424ccbda12a4867b89e604c5b071a' and strpos(v_src, 'DENSITY-BOUNDS (2026-11-16') = 0 then
    raise exception 'PIN: hr_hunt_apply_instance moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if md5(v_src) <> '5ba7a6b49fea7af3cae590a601478464' and strpos(v_src, 'DENSITY-BOUNDS (2026-11-16') = 0 then
    raise exception 'PIN: hr_hunt_instance_read moved (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE FROZEN DENSITY AND THE CONSECUTIVE-REFUSAL COUNT ──────────────────
alter table public.hunt_instances add column if not exists density int;
alter table public.hunt_instances add column if not exists refusals int not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_instances'::regclass and conname = 'hunt_instances_density_ck') then
    alter table public.hunt_instances add constraint hunt_instances_density_ck check (density is null or density >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_instances'::regclass and conname = 'hunt_instances_refusals_ck') then
    alter table public.hunt_instances add constraint hunt_instances_refusals_ck check (refusals >= 0);
  end if;
end $mig$;

-- THE PICK THE ENGINE WOULD PLAY when the instance opens (owner only): a party instance's
-- leader's (hunt-grounds.js partyPick), else the opening hero's own; clamped to the ceiling.
create or replace function public.hr_hunt_density_pick(p_instance uuid, p_user uuid, p_slot int, p_preset int)
returns int language sql stable set search_path = public, pg_catalog as $$
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql).
  select greatest(0, least(coalesce(public.hr_hunt_limit('density_max'), 0)::int, coalesce((
    select case when jsonb_typeof(a.options->'density') = 'number' and (a.options->>'density') ~ '^[0-9]{1,4}$'
                then (a.options->>'density')::int end
      from public.player_action_sets a
      left join public.hunt_parties p on p.id = p_instance and p.closed_at is null
     where a.user_id = coalesce(p.leader_user, p_user) and a.slot = coalesce(p.leader_slot, p_slot)
       and a.preset = case
             when p.id is null or (p.leader_user = p_user and p.leader_slot = p_slot) then coalesce(p_preset, 0)
             else coalesce((select h.preset from public.hunt_sessions h
                             where h.user_id = p.leader_user and h.slot = p.leader_slot and h.ended_at is null
                               and h.instance_id = p_instance limit 1), 0) end), 0)))
$$;
revoke execute on function public.hr_hunt_density_pick(uuid, uuid, int, int) from public;
revoke execute on function public.hr_hunt_density_pick(uuid, uuid, int, int) from anon, authenticated, service_role, hr_engine, hr_tick;

-- THE FREEZE: the instance's first session writes its density; nothing writes it again.
create or replace function public.hr_hunt_density_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql).
  update public.hunt_instances
     set density = public.hr_hunt_density_pick(new.instance_id, new.user_id, new.slot, new.preset)
   where id = new.instance_id and density is null;
  return null;
end $$;
revoke execute on function public.hr_hunt_density_freeze() from public;
revoke execute on function public.hr_hunt_density_freeze() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_hunt_density_freeze on public.hunt_sessions;
create trigger hr_hunt_density_freeze after insert on public.hunt_sessions
  for each row execute function public.hr_hunt_density_freeze();

-- THE ENGINE'S READ: every member plays the frozen density (options.density overlaid).
CREATE OR REPLACE FUNCTION public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density)) end,
                 'state', public.hr_state_of(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;
revoke execute on function public.hr_hunt_instance_read(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 THE MEMBER SETTLE: THE DENSITY-AWARE BOUNDS ──────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS); the Level is priced as `level`.
  c_xp_skills constant text[] := array['defense', 'magic', 'melee', 'prayer', 'ranged'];
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed'))
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Prayer rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0)
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      update public.player_state set gold = gold + v_cgold where user_id = p_user and slot = p_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE FLOOR: after the window's coins and cover, the buys may not take gold below it.
    select gold into v_gold_now from public.player_state where user_id = p_user and slot = p_slot;
    if coalesce(v_gold_now, 0) - v_cost < v_floor then
      perform public.hr_reject('gold_short', jsonb_build_object('gold', v_gold_now, 'cost', v_cost, 'floor', v_floor)); end if;
    if v_cost > 0 then
      update public.player_state set gold = gold - v_cost where user_id = p_user and slot = p_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_buy', -v_cost, -v_units,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_items, 'gold', v_cost), p_session);
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then
    update public.hunt_session_tally t
       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb))
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end;
end $function$;

revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 THE REFUSED-WINDOW RULE ──────────────────────────────────────────────
-- FORFEIT (owner only): end every open session of the instance at its last accepted
-- boundary, nothing of the pending window credited, one journal row per session.
create or replace function public.hr_hunt_forfeit(p_instance uuid, p_code text, p_detail jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_i public.hunt_instances%rowtype;
  v_s record;
  v_end text;
  v_n int := 0;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql). The caller holds the instance lock.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return null; end if;
  for v_s in select h.id, h.user_id, h.slot, h.leave_at, h.change_at from public.hunt_sessions h
              where h.instance_id = p_instance and h.ended_at is null order by h.user_id, h.slot loop
    perform public.hr_hunt_lock(v_s.user_id, v_s.slot);
    v_end := case when v_s.leave_at is not null or v_s.change_at is not null then 'left' else 'server' end;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
      values (v_s.user_id, v_s.slot, 'hunt', 'window_forfeit', 0, 0,
              jsonb_build_object('reason', 'window_forfeit', 'code', left(coalesce(p_code, ''), 64), 'detail', p_detail,
                                 'from', v_i.settled_to, 'world_swing', v_i.world_swing, 'refusals', v_i.refusals, 'end', v_end),
              v_s.id);
    perform public.hr_hunt_close(v_s.id, v_end, v_i.settled_to, true);
    v_n := v_n + 1;
  end loop;
  update public.hunt_instances set world = null, refusals = 0, version = version + 1 where id = p_instance;
  return jsonb_build_object('sessions', v_n, 'at', v_i.settled_to);
end $$;
revoke execute on function public.hr_hunt_forfeit(uuid, text, jsonb) from public;
revoke execute on function public.hr_hunt_forfeit(uuid, text, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ONE REFUSED COMMIT (owner only): counted, recorded with its own detail, and the
-- sixth in a row forfeits the window. Answers the refusal, annotated.
create or replace function public.hr_hunt_settle_refused(p_instance uuid, p_world_from bigint, p_first jsonb, p_answer jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  -- A fuse, not a balance figure: a lost race never repeats six times; a window
  -- the bounds refuse does, every fire (the engine is deterministic).
  c_forfeit_after constant int := 6;
  v_n int;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql).
  update public.hunt_instances set refusals = refusals + 1 where id = p_instance returning refusals into v_n;
  if v_n is null then return p_answer; end if;
  if coalesce(p_first->>'user', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(p_first->>'slot', '') ~ '^[0-9]{1,2}$' then
    perform public.hr_record_rejection((p_first->>'user')::uuid, (p_first->>'slot')::int, 'hunt_settle',
      coalesce(p_answer->>'error', 'apply_failed'),
      jsonb_build_object('instance', p_instance, 'world_swing', p_world_from, 'refusals', v_n, 'detail', p_answer->'detail'), 1);
  end if;
  if v_n >= c_forfeit_after then
    return p_answer || jsonb_build_object('refusals', v_n,
      'forfeit', public.hr_hunt_forfeit(p_instance, p_answer->>'error', p_answer->'detail'));
  end if;
  return p_answer || jsonb_build_object('refusals', v_n);
end $$;
revoke execute on function public.hr_hunt_settle_refused(uuid, bigint, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_settle_refused(uuid, bigint, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- THE ONE SETTLE OF AN INSTANCE (hr_engine), the 2026-10-23 body with every
-- refusal after the lock routed through hr_hunt_settle_refused and the count
-- reset by a commit that lands.
create or replace function public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb,
  p_members jsonb, p_project_user uuid default null, p_project_slot int default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_skew constant interval := interval '60 seconds';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end));
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
end $$;
revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from public;
revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) to hr_engine;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, ROLLED BACK ──────────────────────
-- A probe hero at Mill Cellar density 8 (the report's ground and pick), its windows
-- committed through hr_hunt_apply_instance itself: (0) the instance froze 8 at hunt start and a
-- later setup change moves neither it nor the engine's read; (a) a window with more kills than
-- the as-built bound allowed lands; (b) a window over the density-scaled bound is
-- refused and moves nothing; (c) a landed commit resets the count; (d) after Leave,
-- five refused windows keep the hunt open and the sixth forfeits it: ended `left`
-- at the last accepted boundary, one zero-value window_forfeit row, purse unmoved.
do $$
declare
  v_u     uuid := '000000c0-0000-4000-a000-00000d3e0001';
  v_hunt  text := 'mill_cellar';
  v_g     public.hr_hunt_grounds%rowtype;
  v_old   bigint; v_new bigint; v_tick bigint;
  v       jsonb;
  v_sid   uuid; v_inst uuid;
  v_gold  bigint; v_at timestamptz;
  v_i     int;
  v_role  text;
begin
  select * into v_g from public.hr_hunt_grounds where hunt_id = v_hunt;
  if not found then raise exception 'VERIFY: the % ground is not in the catalogue', v_hunt; end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  -- The bounds over one 50 s window: the as-built one (the old body) and this file's at the frozen 8.
  v_old := v_g.spawns::bigint * (50000 / v_g.respawn_ms + 2);
  v_new := (v_g.spawns::bigint + v_g.pockets::bigint * 8) * (50000 / v_g.respawn_ms + 2);
  if not (v_new > v_old + 1) then raise exception 'VERIFY: the density bound (%) does not exceed the as-built one (%)', v_new, v_old; end if;
  begin
    execute $f$
      create function pg_temp.hr_dens_probe(p_user uuid, p_kills bigint, p_win_ms bigint) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      declare v_s public.hunt_sessions%rowtype; v_i public.hunt_instances%rowtype; v_to timestamptz; v_n bigint; v_t bigint; v_s0 bigint; v_ver bigint;
      begin
        select * into v_s from public.hunt_sessions where user_id = p_user and slot = 0 and ended_at is null;
        if v_s.id is null then return jsonb_build_object('ok', false, 'error', 'probe_no_hunt'); end if;
        select * into v_i from public.hunt_instances where id = v_s.instance_id;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_to := v_i.settled_to + make_interval(secs => p_win_ms / 1000.0);
        v_n := p_win_ms / v_t;
        v_s0 := public.hr_stamina_of(p_user, 0, v_s.settled_to);
        select version into v_ver from public.player_state where user_id = p_user and slot = 0;
        return public.hr_hunt_apply_instance(v_i.id, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + v_n),
          jsonb_build_array(jsonb_build_object('user', p_user, 'slot', 0, 'session', v_s.id, 'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_to, 'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
              'meta', jsonb_build_object('ms', p_win_ms, 'ticks', v_n, 'kills', p_kills, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_to))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + v_n, 'to', v_to, 'next_swing_at', v_to,
              'uses', '{}'::jsonb, 'paid_ms', v_n * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'death', '[]'::jsonb, 'rare_drop', '[]'::jsonb),
              'ended', null, 'buys', '{}'::jsonb, 'cover', '{}'::jsonb, 'stamina', greatest(0, v_s0 - v_n * v_t),
              'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null)), null, null);
      end $b$ $f$;
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'density-bounds §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    v := public.hr_action_set_options(0, 0, '{"density": 8}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: the density pick was refused: %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_hunt_enter refused: %', v; end if;
    v_sid := (v->'session'->>'id')::uuid;
    select instance_id into v_inst from public.hunt_sessions where id = v_sid;
    v_at := date_trunc('second', now() - interval '10 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_sid;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_inst;
    -- (0) the server froze the pick on the instance at hunt start; a later setup change does not move it,
    --     and the engine's read plays the frozen value.
    if (select density from public.hunt_instances where id = v_inst) is distinct from 8 then
      raise exception 'VERIFY(0): the instance froze density % (want 8)', (select density from public.hunt_instances where id = v_inst); end if;
    update public.player_action_sets set options = options || '{"density": 1}'::jsonb where user_id = v_u and slot = 0;
    if (select density from public.hunt_instances where id = v_inst) is distinct from 8
       or (public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'->>'density') is distinct from '8' then
      raise exception 'VERIFY(0): a setup change moved the frozen density or the engine read (%)',
        public.hr_hunt_instance_read(v_u, 0)->'members'->0->'session'->'options'; end if;
    -- (a) a density-8 window with one kill more than the as-built bound allowed: it lands.
    v := pg_temp.hr_dens_probe(v_u, v_old + 1, 50000);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): a density-8 window of % kills (as-built bound %) answered %', v_old + 1, v_old, v; end if;
    if (select refusals from public.hunt_instances where id = v_inst) <> 0 then raise exception 'VERIFY(a): a landed commit left a count'; end if;
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    v_at := (select settled_to from public.hunt_instances where id = v_inst);
    -- (b) one kill past the density-scaled bound: refused kills_over, nothing moves, the count is 1.
    v := pg_temp.hr_dens_probe(v_u, v_new + 1, 50000);
    if v->>'error' is distinct from 'kills_over' or (v->>'refusals')::int is distinct from 1 then
      raise exception 'VERIFY(b): a window of % kills (density bound %) answered %', v_new + 1, v_new, v; end if;
    if (select settled_to from public.hunt_instances where id = v_inst) <> v_at
       or exists (select 1 from public.player_ledger where session_id = v_sid and intent = 'window_forfeit') then
      raise exception 'VERIFY(b): a refused window moved the instance or forfeited at once'; end if;
    -- (c) a landed commit resets the count.
    v := pg_temp.hr_dens_probe(v_u, 1, 10000);
    if coalesce(v->>'ok', '') <> 'true' or (select refusals from public.hunt_instances where id = v_inst) <> 0 then
      raise exception 'VERIFY(c): an honest window after a refusal answered % (count %)', v, (select refusals from public.hunt_instances where id = v_inst); end if;
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    v_at := (select settled_to from public.hunt_instances where id = v_inst);
    -- (d) Leave, then refused windows: five keep the hunt open, the sixth forfeits it.
    v := public.hr_hunt_leave(0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the leave was refused: %', v; end if;
    for v_i in 1 .. 6 loop
      v := pg_temp.hr_dens_probe(v_u, v_new + 1, 50000);
      if v->>'error' is distinct from 'kills_over' then raise exception 'VERIFY(d): refusal % answered %', v_i, v; end if;
      if v_i < 6 and (v ? 'forfeit' or (select ended_at from public.hunt_sessions where id = v_sid) is not null) then
        raise exception 'VERIFY(d): refusal % already ended the hunt: %', v_i, v; end if;
    end loop;
    if not (v ? 'forfeit') then raise exception 'VERIFY(d): the sixth refusal did not forfeit: %', v; end if;
    if (select end_reason from public.hunt_sessions where id = v_sid) is distinct from 'left'
       or (select ended_at from public.hunt_sessions where id = v_sid) is distinct from v_at then
      raise exception 'VERIFY(d): the forfeited hunt ended % at % (want left at %)',
        (select end_reason from public.hunt_sessions where id = v_sid), (select ended_at from public.hunt_sessions where id = v_sid), v_at; end if;
    if (select count(*) from public.player_ledger where session_id = v_sid and intent = 'window_forfeit'
          and kind = 'hunt' and coalesce(gold, 0) = 0 and meta->>'code' = 'kills_over') <> 1 then
      raise exception 'VERIFY(d): the forfeit is not journalled exactly once'; end if;
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold then
      raise exception 'VERIFY(d): the forfeit moved the purse'; end if;
    if exists (select 1 from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null)
       or (select world from public.hunt_instances where id = v_inst) is not null
       or (select refusals from public.hunt_instances where id = v_inst) <> 0 then
      raise exception 'VERIFY(d): the forfeit left an open hunt, a world or a count'; end if;
    raise exception using errcode = 'HRD16', message = 'density-bounds §4 complete - rolling back';
  exception when sqlstate 'HRD16' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or to_regprocedure('pg_temp.hr_dens_probe(uuid,bigint,bigint)') is not null then
    raise exception 'VERIFY: §4 LEAKED a probe row or function'; end if;
  -- (e) the grants: the instance settle is hr_engine's alone; the member settle and the two helpers are the owner's.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % may run the instance settle', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
    raise exception 'VERIFY(e): hr_engine lost the instance settle'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches the engine read', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
    raise exception 'VERIFY(e): hr_engine lost the engine read'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_density_pick(uuid,uuid,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_density_freeze()', 'execute') then
      raise exception 'VERIFY(e): % reaches the density freeze', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_forfeit(uuid,text,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)', 'execute') then
      raise exception 'VERIFY(e): % reaches a settle internal', v_role; end if;
  end loop;
  -- (f) the instance row stays server-only: RLS on, no client policy.
  if not (select relrowsecurity from pg_class where oid = 'public.hunt_instances'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_instances') then
    raise exception 'VERIFY(f): hunt_instances gained a client policy or lost RLS'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'density-bounds: a density-8 window past the as-built bound lands; past the density bound it is refused; six refusals in a row forfeit the window and send the hero home';
end $$;
