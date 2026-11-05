-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-27-hunt-tiers.sql — THREE WAYS TO HUNT A GROUND, AND NO DIAL (Tyler 2026-11-05: "All of it sounds good"; lane/c-difficulty-tiers, game-designer). STAGED: tools/apply-migration.mjs,
-- one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §6; on the EA Security list (a new client verb, a client verb gone, a value bound's input moves).
-- Design and measurements: docs/planning/PRIORITY_BOARD.md "2026-11-05 Difficulty tiers". BEFORE its client half. The engine half reads options.tier and plays Normal without it, so either order is safe.
--
-- §1 hr_ground_tiers NEW, the server's catalogue of a ground's harder tiers (src/data/hunt-tiers.js, tests/hunt-core/hunt-tiers.mjs holds the two equal; the Cellar has no row: Normal only). No foreign key: the hunt-sessions catalogue deletes and rewrites
--    hr_hunt_grounds, and a cascade would silently take a ground's tiers with it. No row = that tier is not offered there. Normal is no row: the ground as it stands.
--    hunt_density.tier NEW: the hero's pick per ground ('normal' until pressed). hunt_density.density no longer means anything: hr_hunt_enter_for still writes its 0, the column goes with that body's next restatement.
--    hunt_instances.tier NEW: the tier the instance froze, beside hunt_instances.density, the pull it froze with it.
-- §2 hr_hunt_tier_view(user, slot) NEW, internal: { picks: { <hunt>: tier } (no key = Normal), playing: tier | null } of one character: the `hunt_tier` section and the party's leader picks.
--    hr_hunt_tier_set(p_slot, p_hunt, p_tier, p_idem) NEW client intent: the caller's own row only (auth.uid()), keyed, rate-gated ('hunt'); refuses an unknown ground (bad_hunt), a tier that ground
--    doesn't offer (bad_tier: refused, never clamped), a member of a party it doesn't lead (not_leader), no character.
-- §3 hr_hunt_density_set DROPPED: THE DIAL IS GONE (Tyler 2026-11-05: one choice per ground, the tier sets the pull; rulings of record). hr_hunt_density_view and
--    hr_hunt_density_pick dropped with it; the `hunt_density` section goes. hr_hunt_tier_pick(instance, user, slot) NEW: the leader's tier on the instance's ground (a solo hero's own), Normal when the catalogue
--    doesn't offer it. hr_hunt_density_freeze RESTATED: the instance's first session writes its tier and that tier's pull for the seats it opens with (a row's 0 is the ground as it stands); nothing writes them again. A party's restart nulls density (2027-02-10-party-instance-reset.sql), so its
--    next hunt freezes both afresh. hr_hunt_instance_read RESTATED: every member plays the frozen tier (options.tier) and pull (options.density).
-- §4 hr_hunt_party_view RESTATED: `leader_tiers` replaces `leader_densities`.
-- §5 the `hunt_tier` section and the client baseline.
--
-- EXPLOIT SURFACE. The intent writes only the caller's own (user, slot) row, one of a server catalogue's words, moving no value. The freeze reads it once, and every number the engine plays from it is the catalogue's or
-- the engine's own data, never a client value. A tier cannot come in through player_action_sets.options: hr_action_set_options refuses an unknown key (bad_option). The kill bound (hr_hunt_apply_member) grows only with the
-- frozen pull, exactly as it did with the frozen density. Level XP is bounded by kills x the ground's largest xp_max (a boss's, far over any common kill at +20%). Gold and drops per kill don't move. COST: the section adds one
-- PK-prefix scan and one open-session read per envelope; written plpgsql so its plan is cached (tests/settle-budget.mjs SB-3).
-- EDGE: the engine reads options.tier (src/core/hunt-spawn.js); the world's shape does not move (no world_shape_pending). RESIDUE: none. WIPE: hunt_density and hunt_instances are on the character wipe's list; no new player table; hr_ground_tiers is on its no-player list.
-- REVERSIBLE: re-apply 2026-11-17-hunt-density-home.sql's intent, view and pick, 2027-02-10-party-instance-reset.sql's freeze, 2027-02-02-settle-cost.sql's read and 2027-02-18-party-truth.sql's party view; drop the columns, the table, the section and baseline rows.
-- ORDER: after 2027-02-26-slots-lower-hero-slots.sql; no object in common with any file after it (tempering, gold sinks, setup slots, titles, sink prices, temper craft), so either side of them. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED A BODY THIS FILE RESTATES ─────
do $mig$
declare v_md5 text; r record;
begin
  for r in select * from (values
    ('public.hr_hunt_density_freeze()', 'ac085d75ed88706dd372928c197b0125', 'HUNT-TIERS'),
    ('public.hr_hunt_instance_read(uuid,integer)', '4a0126352e3ccb10314d41cc255213cd', 'HUNT-TIERS'),
    ('public.hr_hunt_party_view(uuid,integer)', '182f591a084e8947a45925e2f5451dda', 'HUNT-TIERS')
  ) p(sig, pre, marker) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is absent', r.sig; end if;
    if v_md5 <> r.pre and strpos((select prosrc from pg_proc where oid = to_regprocedure(r.sig)), r.marker) = 0 then
      raise exception 'PIN: % is neither its landed image (%) nor this file''s: md5 % - another file moved it', r.sig, r.pre, v_md5; end if;
  end loop;
  if to_regclass('public.hunt_density') is null or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_hunt_grounds') is null then
    raise exception 'PRECONDITION: hunt_density, hr_state_sections and hr_hunt_grounds first'; end if;
end $mig$;

-- ── §1 THE CATALOGUE AND THE COLUMNS ─────────────────────────────────────────
create table if not exists public.hr_ground_tiers (
  hunt_id  text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  tier     text not null check (tier in ('dangerous', 'deadly')),
  pull     int[] not null check (cardinality(pull) = 4 and 0 <= all (pull) and 16 >= all (pull)),
  power_pm int  not null check (power_pm between 1000 and 4000),
  xp_pm    int  not null check (xp_pm between 1000 and 2000),
  primary key (hunt_id, tier)
);
alter table public.hr_ground_tiers enable row level security;
revoke all on public.hr_ground_tiers from public, anon, authenticated, service_role;
comment on table public.hr_ground_tiers is
  '2027-02-27-hunt-tiers.sql: the harder tiers a ground offers (src/data/hunt-tiers.js; tests/hunt-core/hunt-tiers.mjs holds the two equal). Read by hr_hunt_tier_set and the freeze. No row = not offered. Normal is no row.';
delete from public.hr_ground_tiers;
insert into public.hr_ground_tiers (hunt_id, tier, pull, power_pm, xp_pm) values
  ('meadowbrook_thicket', 'dangerous', '{0,0,0,0}'::int[], 1500, 1050),
  ('meadowbrook_thicket', 'deadly', '{0,0,0,0}'::int[], 3000, 1100),
  ('wickstead', 'dangerous', '{3,4,4,5}'::int[], 1500, 1050),
  ('wickstead', 'deadly', '{5,8,8,8}'::int[], 2000, 1100),
  ('millrace_sewer', 'dangerous', '{0,5,5,6}'::int[], 1200, 1050),
  ('millrace_sewer', 'deadly', '{0,8,8,8}'::int[], 1750, 1100),
  ('mosslight_glade', 'dangerous', '{4,5,5,6}'::int[], 1200, 1100),
  ('mosslight_glade', 'deadly', '{8,8,8,8}'::int[], 1500, 1200),
  ('coppercap_warrens', 'dangerous', '{4,5,5,6}'::int[], 1200, 1100),
  ('coppercap_warrens', 'deadly', '{8,8,8,8}'::int[], 1500, 1200);

alter table public.hunt_density add column if not exists tier text not null default 'normal';
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_density'::regclass and conname = 'hunt_density_tier_ck') then
    alter table public.hunt_density add constraint hunt_density_tier_ck check (tier in ('normal', 'dangerous', 'deadly')); end if;
end $mig$;
comment on column public.hunt_density.tier is
  '2027-02-27-hunt-tiers.sql: the tier this hero picked on this ground; written only by hr_hunt_tier_set; frozen on an instance by hr_hunt_tier_pick. hunt_density.density no longer means anything.';
alter table public.hunt_instances add column if not exists tier text;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_instances'::regclass and conname = 'hunt_instances_tier_ck') then
    alter table public.hunt_instances add constraint hunt_instances_tier_ck check (tier is null or tier in ('normal', 'dangerous', 'deadly')); end if;
end $mig$;

-- ── §2 THE VIEW AND THE INTENT ───────────────────────────────────────────────
create or replace function public.hr_hunt_tier_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): one character's picks, and the tier its open hunt froze.
  return jsonb_build_object(
    'picks', coalesce((select jsonb_object_agg(d.hunt_id, d.tier order by d.hunt_id)
                         from public.hunt_density d where d.user_id = p_user and d.slot = p_slot and d.tier <> 'normal'), '{}'::jsonb),
    'playing', (select i.tier from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id
                 where h.user_id = p_user and h.slot = p_slot and h.ended_at is null limit 1));
end $$;
revoke execute on function public.hr_hunt_tier_view(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_tier_set(p_slot int, p_hunt text, p_tier text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_tier_set';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_pid  uuid;
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): the caller's pick on one ground, refused never clamped.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hunt')); end if;
  if p_tier is null or (p_tier <> 'normal' and not exists (select 1 from public.hr_ground_tiers t where t.hunt_id = p_hunt and t.tier = p_tier)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_tier')); end if;
  -- THE LEADER CHOOSES THE HUNT SETTINGS (Tyler 2026-10-20): in a party only the leader picks (the freeze reads its row).
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is not null and not exists (select 1 from public.hunt_parties p where p.id = v_pid
                                        and p.leader_user = v_uid and p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, tier, updated_at)
    values (v_uid, p_slot, p_hunt, 0, p_tier, now())
    on conflict (user_id, slot, hunt_id) do update set tier = excluded.tier, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt, 'tier', p_tier);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_tier_set(int, text, text, uuid) from public;
revoke execute on function public.hr_hunt_tier_set(int, text, text, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_tier_set(int, text, text, uuid) to authenticated;

-- ── §3 WHAT THE INSTANCE FREEZES ─────────────────────────────────────────────
create or replace function public.hr_hunt_tier_pick(p_instance uuid, p_user uuid, p_slot int)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): the party LEADER's pick (a party instance's id is its party's), or the opening hero's; Normal unless the catalogue offers it there.
  return coalesce((
    select t.tier
      from public.hunt_instances i
      left join public.hunt_parties p on p.id = i.id and p.closed_at is null
      join public.hunt_density d on d.user_id = coalesce(p.leader_user, p_user)
                                and d.slot = coalesce(p.leader_slot, p_slot) and d.hunt_id = i.hunt_id
      join public.hr_ground_tiers t on t.hunt_id = i.hunt_id and t.tier = d.tier
     where i.id = p_instance), 'normal');
end $$;
revoke execute on function public.hr_hunt_tier_pick(uuid, uuid, int) from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke execute on function public.hr_hunt_tier_pick(uuid, uuid, int) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then revoke execute on function public.hr_hunt_tier_pick(uuid, uuid, int) from hr_tick; end if;
end $mig$;

create or replace function public.hr_hunt_density_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_tier text; v_size int;
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): the instance's first session writes its tier and that tier's pull for the seats it opens with; nothing writes them again.
  -- Normal's pull is 0, the ground as it stands (hunt-grounds.js densityFor: as built alone, its partyPull in a party).
  if not exists (select 1 from public.hunt_instances where id = new.instance_id and density is null) then return null; end if;
  v_tier := public.hr_hunt_tier_pick(new.instance_id, new.user_id, new.slot);
  v_size := greatest(1, least(4, (select count(*) from public.hunt_party_members m where m.party_id = new.instance_id)::int));
  update public.hunt_instances i
     set tier = v_tier,
         density = coalesce((select t.pull[v_size] from public.hr_ground_tiers t where t.hunt_id = i.hunt_id and t.tier = v_tier), 0)
   where i.id = new.instance_id and i.density is null;
  return null;
end $$;
revoke execute on function public.hr_hunt_density_freeze() from public;
revoke execute on function public.hr_hunt_density_freeze() from anon, authenticated, service_role, hr_engine, hr_tick;

create or replace function public.hr_hunt_instance_read(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
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
      'tier', v_i.tier,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;


-- THE DIAL IS GONE.
delete from public.hr_client_rpc_baseline where proname = 'hr_hunt_density_set';
drop function if exists public.hr_hunt_density_set(int, text, int, uuid);
drop function if exists public.hr_hunt_density_pick(uuid, uuid, int);

-- ── §4 THE PARTY VIEW ────────────────────────────────────────────────────────
create or replace function public.hr_hunt_party_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): `leader_tiers`, the leader's tier picked per ground (hunt_density.tier)
  -- every seat's picker shows read-only; it replaces `leader_densities`, the dial is gone.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each member row of a party carries `ready` and `ready_why`, the
  -- predicate Start uses (hr_party_seat_ready) on the party's `hunt`; the CODE only, never another player's detail.
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): `weapon` is what the seat wears NOW (the key the engine reads);
  -- `stamina_low_ms`, a hunting seat's stamina at 15 min or under, else null.
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
  v_away  boolean;
  v_ltier jsonb;
  v_ready jsonb;
  v_mx    jsonb;   -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): a hunting member's own maxima while the pose has none
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, public.hr_hunt_weapon_of(m.user_id, m.slot) as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to, m.joined_at
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to, null::timestamptz
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_mx := case when v_r.sid is not null and (v_v->'hp_max' is null or v_v->'mana' is null or v_v->'mana_max' is null)
                 then public.hr_vitals_of(v_r.user_id, v_r.slot) end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    v_away := v_pid is not null and public.hr_party_away(v_r.user_id, v_r.slot, v_r.joined_at);
    v_ready := case when v_pid is not null
                    then public.hr_party_seat_ready(v_pid, v_r.user_id, v_r.slot, v_p.hunt_id, v_p.leader_user, v_r.joined_at) end;
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', v_mx->'max_hp') end,
        -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): before the member stands in the world it has its full mana
        -- (hunt-spawn.js heroUnit), as its HP has its stored value: never "–" before a hunt's first settle.
        'mana', case when v_r.sid is not null then coalesce(v_v->'mana', v_mx->'max_mana') end,
        'mana_max', case when v_r.sid is not null then coalesce(v_v->'mana_max', v_mx->'max_mana') end,
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false),
        'away', v_away,
        -- PARTY-TRUTH: a hunting seat's stamina, as its last settle wrote it, once it is low enough to warn of; the pool
        -- above that is its own business. A party hunt ends when any seat's does (LEAVE TOGETHER), so the seats may know.
        'stamina_low_ms', case when v_r.sid is not null and ps.stamina_at is not null and ps.stamina_ms <= 900000 then greatest(ps.stamina_ms, 0) end,
        -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no
        -- longer owned (a lapsed premium outfit): the same look hr_town_walkers shows of it in town.
        'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(v_r.user_id, v_r.slot))
                       then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end,
        -- SEAT READINESS (party only): would Start take this seat now, and if not, the code it would answer.
        'ready', case when v_ready is not null then coalesce(v_ready->>'ok', 'false') = 'true' end,
        'ready_why', case when v_ready is not null and coalesce(v_ready->>'ok', 'false') <> 'true' then v_ready->>'error' end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
      left join public.player_outfits po on po.user_id = v_r.user_id and po.slot = v_r.slot
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then
      v_lseat := v_r.seat;
      -- the leader's picks per ground, as hr_hunt_tier_pick freezes them on a party instance
      v_ltier := public.hr_hunt_tier_view(v_r.user_id, v_r.slot)->'picks';
    end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem,
    'listed', coalesce(v_p.listed, false), 'leader_tiers', coalesce(v_ltier, '{}'::jsonb),
    -- PARTY-HOLD (2026-12-08-party-hold.sql): who holds the pack, a seat (null = take turns; solo: null).
    'hold_seat', v_p.hold_seat,
    -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): THIS hero's own "Leave if anyone leaves the hunt or dies".
    'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));
end $$;


delete from public.hr_state_sections where key = 'hunt_density';
drop function if exists public.hr_hunt_density_view(uuid, int);

-- ── §5 THE `hunt_tier` SECTION AND THE CLIENT SURFACE ────────────────────────
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_tier', 'hr_hunt_tier_view', '2027-02-27-hunt-tiers.sql: this hero''s tier picked per ground and the tier its open hunt froze, { picks: { <hunt_id>: tier }, playing: tier | null } (no key = Normal)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_tier_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_tier_set', 'p_slot integer, p_hunt text, p_tier text, p_idem uuid', 'authenticated',
   'added 2027-02-27: the caller''s own tier on one hunt ground, a catalogue row or Normal, refused not clamped; the party leader''s only in a party; moves no value');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00007e000001';
  k     text := '000000c0-0000-4000-a000-0000';
  v      jsonb;
  v_iid  uuid;
  v_read jsonb;
  c_ground constant text := 'mosslight_glade';
  c_plain constant text := 'mill_cellar';
begin
  -- the catalogue is what hunt-tiers.js says, and every row's ground exists
  if (select count(*) from public.hr_ground_tiers) <> 10 then raise exception 'VERIFY(a): the catalogue holds % rows', (select count(*) from public.hr_ground_tiers); end if;
  if exists (select 1 from public.hr_ground_tiers t where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id)) then
    raise exception 'VERIFY(a): a tier row names a ground the catalogue doesn''t hold'; end if;
  -- the verb is client-executable, what it reads and freezes is not, and the dial is gone
  if not has_function_privilege('authenticated', 'public.hr_hunt_tier_set(integer,text,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_tier_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_tier_pick(uuid,uuid,integer)', 'execute')
     or has_table_privilege('authenticated', 'public.hr_ground_tiers', 'select')
     or to_regprocedure('public.hr_hunt_density_set(integer,text,integer,uuid)') is not null
     or exists (select 1 from public.hr_state_sections where key = 'hunt_density') then
    raise exception 'VERIFY(b): a grant is wrong, or the dial is still here'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Tiers') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hunt-tiers §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (c) refused, never clamped, and nothing written
    v := public.hr_hunt_tier_set(0, 'no_such_ground', 'deadly', (k || '7e000001')::uuid);
    if v->>'error' is distinct from 'bad_hunt' then raise exception 'VERIFY(c): an unknown ground answered %', v; end if;
    v := public.hr_hunt_tier_set(0, c_ground, 'hardcore', (k || '7e000002')::uuid);
    if v->>'error' is distinct from 'bad_tier' then raise exception 'VERIFY(c): an unknown tier answered %', v; end if;
    v := public.hr_hunt_tier_set(0, c_plain, 'deadly', (k || '7e000003')::uuid);
    if v->>'error' is distinct from 'bad_tier' then raise exception 'VERIFY(c): a tier the ground doesn''t offer answered %', v; end if;
    if exists (select 1 from public.hunt_density where user_id = v_u) then raise exception 'VERIFY(c): a refused pick wrote a row'; end if;
    -- (d) a pick is remembered per ground and read back
    v := public.hr_hunt_tier_set(0, c_ground, 'deadly', (k || '7e000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the pick answered %', v; end if;
    if public.hr_hunt_tier_view(v_u, 0)->'picks' <> jsonb_build_object(c_ground, 'deadly') then
      raise exception 'VERIFY(d): the view reads %', public.hr_hunt_tier_view(v_u, 0); end if;
    -- (e) THE FREEZE: the enter writes the pick's tier and its pull on the instance, the engine's read carries both on every member, and the section names it; a later pick moves neither.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || '7e000005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): entering answered %', v; end if;
    select h.instance_id into v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select tier from public.hunt_instances where id = v_iid) is distinct from 'deadly'
       or (select density from public.hunt_instances where id = v_iid) is distinct from (select t.pull[1] from public.hr_ground_tiers t where t.hunt_id = c_ground and t.tier = 'deadly') then
      raise exception 'VERIFY(e): the instance froze % at %', (select tier from public.hunt_instances where id = v_iid), (select density from public.hunt_instances where id = v_iid); end if;
    v_read := public.hr_hunt_instance_read(v_u, 0);
    if v_read->'members'->0->'session'->'options'->>'tier' is distinct from 'deadly'
       or (v_read->'members'->0->'session'->'options'->>'density')::int is distinct from (select t.pull[1] from public.hr_ground_tiers t where t.hunt_id = c_ground and t.tier = 'deadly') then
      raise exception 'VERIFY(e): the engine reads options %', v_read->'members'->0->'session'->'options'; end if;
    if public.hr_state_of(v_u, 0)->'hunt_tier'->>'playing' is distinct from 'deadly' then
      raise exception 'VERIFY(e): the section reads %', public.hr_state_of(v_u, 0)->'hunt_tier'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_tier_set(0, c_ground, 'dangerous', (k || '7e000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): a pick mid-hunt answered %', v; end if;
    if (select tier from public.hunt_instances where id = v_iid) is distinct from 'deadly' then raise exception 'VERIFY(e): a pick mid-hunt moved the frozen tier'; end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- (f) a plain ground stays as it stands: Normal, pull 0, the engine's as-built world
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_plain, '[]'::jsonb, 0, null, (k || '7e000007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): entering the plain ground answered %', v; end if;
    select h.instance_id into v_iid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select tier from public.hunt_instances where id = v_iid) is distinct from 'normal' or (select density from public.hunt_instances where id = v_iid) is distinct from 0 then
      raise exception 'VERIFY(f): the plain ground froze % at %', (select tier from public.hunt_instances where id = v_iid), (select density from public.hunt_instances where id = v_iid); end if;
    if (public.hr_hunt_tier_view(v_u, 0)->'picks') <> jsonb_build_object(c_ground, 'dangerous') then
      raise exception 'VERIFY(f): the picks moved: %', public.hr_hunt_tier_view(v_u, 0); end if;
    raise exception using errcode = 'HR897', message = 'hunt-tiers §6 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hunt_density where user_id = v_u) or exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §6 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-tiers: the catalogue holds, the pick is refused not clamped, remembered per ground and read back by the freeze, the dial is gone; all green';
end $$;
