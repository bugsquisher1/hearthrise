-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-04-setup-swap-mid-hunt.sql — A SETUP SWITCHES MID-HUNT: THE BAR ONLY, THE GEAR STAYS ON
--   (lane/c-setup-swap-mid-hunt, backend-architect, 2026-11-17; Tyler 2026-11-17 "Bar only, keep gear", answering "Allow switching
--   setups, gear included, mid-hunt?"; the Coordinator's call on top: only a setup that fights as the worn weapon type switches mid-hunt,
--   any other stays town-only with a "Town only: needs a <weapon>" label; New and Use equipped stay town-only).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §6. No money, item, XP or ranking moves (a setup is the caller's own configuration); part of the EA Security review.
-- ORDER: LAST, after 2027-05-03-tower-arm.sql. §0 pins the three bodies it restates to their live images (tests/live-hash-drift.baseline.json,
--   measured 2026-11-17, replay and live agreeing) or to this file's own.
-- EDGE: does not move. The engine already reads a member's bar and fight options through the session's set (hr_hunt_member_read:
--   player_action_sets where preset = hunt_sessions.preset) on every settle, the way it picks up a mid-hunt hr_action_set_options edit;
--   nothing in src/core or supabase/functions names a setup or a set number. CLIENT: src/shell/windows/hunt-prep/setups.js (Use on while
--   hunting for a setup of the worn discipline, off with its label for any other), the reader src/session/item-sections.js presetsOf.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_hunt_preset_apply(p_slot int, p_preset int, p_idem uuid) -> jsonb   RESTATED (the client verb, signature and grant unchanged).
--   IN TOWN: exactly as before (2026-12-05-hunt-setup-per-ground.sql): the setup in use switches, then the worn set becomes exactly the
--     setup's gear, all or nothing; the gear's owner is that setup again (player_hunt_active.gear_set := null).
--   WITH A HUNT OPEN (any hunt_sessions row of the hero still open: alone, a party seat, the Tower, a hall, a training yard), in this order:
--     hunt_leaving { session }          a Leave or a ground change is pending (hr_hunt_set_preset's rule)
--     unknown_action_set { action_set } the setup's bar is gone (as in town)
--     setup_needs_weapon { needs, wears, session }  NEW. The setup fights as another ability list than the worn set: `needs` is the role
--                                       key the setup fights as (hr_setup_fights_as), `wears` the worn set's (hr_hunt_weapon_of). Compared
--                                       by DISCIPLINE (hr_hunt_weapon_roles.discipline: the abilities a bar may hold), so hatchets and a
--                                       pair of axes, or a bow and a crossbow, swap freely.
--     settle_first { unsettled_ms }     the hunt is more than c_slack_ms (20 s, two world ticks: the bound every mid-hunt edit shares,
--                                       hr_action_set_options / hr_hunt_set_preset) behind the server's clock. The client's catch-up link
--                                       (src/session/catch-up.js) runs the hunter's settle once and asks again under a new key.
--     ok: { ok, bar_only: true, worn: {}, action_set, session }  the session plays the setup's set from its next settle
--       (hunt_sessions.preset := the set, its version bumped, as hr_hunt_set_preset does), the setup is the one in use
--       (player_hunt_active.action_set), the worn gear does not move and stays its owner's (gear_set, below). The restock targets are not
--       part of the bar: they ride the next town Use.
--   Refusals before the branch are unchanged: not_signed_in, bad_slot, bad_idem, bad_preset, a replayed key's receipt, rate_limited
--   (bucket `hunt`), no_character, unknown_preset. Every refusal is noted once (hr_note_rejection) and writes nothing.
--
-- THE SAVED GEAR, THE MODEL (why no setup's saved gear is ever overwritten by another's):
--   player_hunt_active.gear_set (NEW, smallint, null): the setup whose saved gear IS the worn set, when that is not the setup in use;
--   null = the setup in use (every row before this file, and the normal state). hr_hunt_gear_set(user, slot) = coalesce(gear_set,
--   action_set, 0). hr_setup_gear_follow (the equipment trigger, RESTATED) writes the worn set into THAT setup instead of the setup in
--   use. So after a mid-hunt switch A -> B: B is in use (bar), A owns the worn gear; an equip after the hunt updates A (it is A's gear
--   the hero has on), B's saved gear is never touched; a switch back to A clears the owner. A town Use clears it (the gear becomes the
--   used setup's). Every other writer of the setup in use (hr_hunt_preset_save: New, Use equipped) is covered WITHOUT restating it by
--   hr_setup_gear_owner (NEW BEFORE trigger on player_hunt_active): an owner is kept only while the worn gear is really another setup's,
--   i.e. it is cleared when it equals the setup in use, or when the setup in use's saved gear already equals the worn set (a Save has
--   just snapshotted it, or the two setups wear the same gear). Deleting the owner setup leaves gear_set on a number with no setup row:
--   nothing records the gear until the next town Use or Save (only hr_hunt_preset_save creates setup rows, and it clears the owner).
--
-- hr_hunt_presets_view (the envelope's `hunt_presets`) RESTATED: each row also carries
--   fights_as   the role key the setup fights as (hr_setup_fights_as), discipline   that key's ability list,
--   wearing     true on the setup whose saved gear is the worn set (hr_hunt_gear_set): false on the setup in use after a bar-only switch.
--   Still plpgsql (planned once a backend: 2027-02-10-settle-plan-cache.generated.sql's reason).
-- hr_setup_fights_as(p_user, p_slot, p_gear) (NEW, internal): hr_hunt_preset_project's rule (2027-04-13-hunt-preset-read.sql) over a gear
--   snapshot: its weapon and shield where the snapshot names them, the worn ones where it does not, the shield arm applied. The builder's
--   read, the envelope row and the verb therefore answer ONE rule; §6(k) asserts read = envelope for every probe setup.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- The key first (hr_intent_replay), then hr_hunt_lock: the hero's advisory key, its player_state row and the open session FOR UPDATE, the
-- lock the settle's commit (hr_hunt_settle_session / hr_hunt_apply_instance) takes too. A settle that read the old set and commits after
-- the switch prices only the window it read, which ended at its read's now(), before the switch's now(). The new set plays from the
-- session's settled point, at most c_slack_ms before the switch (the bound every mid-hunt bar edit already has). The engine reads the
-- set from the session row on each settle; nothing is cached across settles.
-- A second press on one key that waited on the lock repeats the same switch onto the same state (safe by state; tests/key-under-lock.mjs
-- SAFE_BY_STATE keeps its town check), and its receipt is the first's (player_intents on conflict do nothing).
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- No new client verb, no grant. The one verb now writes, mid-hunt, two rows of the caller's own configuration (the session's set number,
-- the setup in use) that were already writable mid-hunt (hr_hunt_set_preset since 2026-10-23, hr_action_set_options on the session's set).
-- No value moves; nothing crosses to another player. A forged p_preset names only the caller's own setup rows (unknown_preset otherwise).
-- The discipline rule is a design rule, not a safety line: the engine fires only abilities of the worn discipline whatever bar it plays.
-- NAMED FOR SECURITY: hr_hunt_set_preset (2026-10-23, authenticated, called by no client) still switches the session's set mid-hunt with
-- no discipline rule and without moving the setup in use; retire it in its own lane.
--
-- ── COST (100x players) ────────────────────────────────────────────────────
-- One nullable smallint on player_hunt_active (one row a hero). The envelope's hunt_presets: per setup (5 at most) four primary-key reads
-- (the snapshot's weapon or the worn one, its type, the shield, the role row), the owner once. The BEFORE trigger: one setup row and the
-- worn set (a handful of rows) per write of player_hunt_active, which only setup verbs write. No journal row: a switch moves no value.
--
-- REVERSIBLE: restate the three bodies from their pre-images (hr_hunt_preset_apply and hr_setup_gear_follow:
--   2026-12-05-hunt-setup-per-ground.sql; hr_hunt_presets_view: 2027-02-10-settle-plan-cache.generated.sql), drop the trigger
--   hr_setup_gear_owner and the functions hr_setup_gear_owner, hr_setup_fights_as, hr_hunt_gear_set, then the column.
-- IDEMPOTENT: a second apply finds the column and its CHECK, restates every body byte-identical, re-creates the trigger, and §6 rolls back.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.player_hunt_active') is null or to_regclass('public.player_hunt_presets') is null
     or to_regclass('public.player_action_sets') is null or to_regclass('public.player_equipment') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hr_hunt_weapons') is null
     or to_regclass('public.hr_hunt_weapon_roles') is null or to_regclass('public.hr_hunt_shields') is null then
    raise exception 'PRECONDITION: the setup tables and the weapon role catalogues are missing'; end if;
  if to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_gap_ms(public.hunt_sessions)') is null or to_regprocedure('public.hr_hunt_view(uuid)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_hunt_member_read(public.hunt_sessions)') is null
     or to_regprocedure('public.hr_hunt_preset_project(uuid,integer,integer)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (hr_hunt_preset_project: 2027-04-13-hunt-preset-read.sql)'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-17) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_hunt_preset_apply(integer,integer,uuid)', '028cad7e2a6809e84c2e4e23254b5040', '36e763fef9934b42e516d2d7f21f5dbc'),
    ('public.hr_setup_gear_follow()', '83b7c1303884e0ec789f92b995c1f91c', '707c91275bda32a6b69320ba20019083'),
    ('public.hr_hunt_presets_view(uuid,integer)', '3559cd09f0d4b233ab4d7d833a3d7dcf', '56b8e82f83eb61aeb1654488a7fa308b')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 WHOSE GEAR THE HERO WEARS ─────────────────────────────────────────────
alter table public.player_hunt_active add column if not exists gear_set smallint;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_hunt_active_gear_set_range') then
    alter table public.player_hunt_active add constraint player_hunt_active_gear_set_range check (gear_set is null or gear_set between 0 and 15);
  end if;
end $mig$;
comment on column public.player_hunt_active.gear_set is
  '2027-05-04-setup-swap-mid-hunt.sql: the setup whose saved gear is the worn set when it is not the setup in use (a mid-hunt Use '
  'switched only the bar); null = the setup in use. Written by hr_hunt_preset_apply; cleared by hr_setup_gear_owner. Read through hr_hunt_gear_set.';

create or replace function public.hr_hunt_gear_set(p_user uuid, p_slot integer)
returns integer language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): the setup whose saved gear the hero wears: the owner a mid-hunt Use left on, else the
  -- setup in use (hr_hunt_active_set's rule: no row is set 0).
  return coalesce((select coalesce(a.gear_set, a.action_set)::int from public.player_hunt_active a where a.user_id = p_user and a.slot = p_slot), 0);
end $fn$;
revoke execute on function public.hr_hunt_gear_set(uuid, integer) from public, anon, authenticated, service_role;

create or replace function public.hr_setup_gear_owner()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): THE WORN GEAR GOES BACK TO THE SETUP IN USE as soon as it is that setup's: the owner
  -- is the setup in use, or the setup in use's saved gear equals the worn set (a Save has just snapshotted it, or both setups wear the
  -- same). So every writer of the setup in use leaves an owner only while the worn gear really is another setup's.
  if new.gear_set is not null
     and (new.gear_set = new.action_set
          or (select p.gear from public.player_hunt_presets p where p.user_id = new.user_id and p.slot = new.slot and p.preset = new.action_set)
             = (select coalesce(jsonb_object_agg(e.equip_slot, e.item_id), '{}'::jsonb) from public.player_equipment e
                 where e.user_id = new.user_id and e.slot = new.slot)) then
    new.gear_set := null;
  end if;
  return new;
end $fn$;
revoke execute on function public.hr_setup_gear_owner() from public;
revoke execute on function public.hr_setup_gear_owner() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_setup_gear_owner on public.player_hunt_active;
create trigger hr_setup_gear_owner before insert or update on public.player_hunt_active
  for each row execute function public.hr_setup_gear_owner();

-- ── §2 GEAR FOLLOWS THE SETUP WHOSE GEAR IT IS ───────────────────────────────
create or replace function public.hr_setup_gear_follow()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_u uuid; v_s int; v_gear jsonb;
begin
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the setup in use wears what the hero wears.
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): the setup whose gear it is (hr_hunt_gear_set): the one in use, or the one whose gear
  -- stayed on when a mid-hunt Use switched only the bar. Another setup's saved gear is never written.
  if tg_op = 'DELETE' then v_u := old.user_id; v_s := old.slot; else v_u := new.user_id; v_s := new.slot; end if;
  select coalesce(jsonb_object_agg(e.equip_slot, e.item_id), '{}'::jsonb) into v_gear
    from public.player_equipment e where e.user_id = v_u and e.slot = v_s;
  update public.player_hunt_presets p set gear = v_gear, updated_at = now()
   where p.user_id = v_u and p.slot = v_s and p.preset = public.hr_hunt_gear_set(v_u, v_s)
     and p.gear is distinct from v_gear;
  return null;
end $$;
revoke execute on function public.hr_setup_gear_follow() from public;
revoke execute on function public.hr_setup_gear_follow() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 WHAT A SETUP FIGHTS AS ────────────────────────────────────────────────
create or replace function public.hr_setup_fights_as(p_user uuid, p_slot integer, p_gear jsonb)
returns text language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_wpn text; v_shd text; v_key text;
begin
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): the role key a setup's gear snapshot fights as, hr_hunt_preset_project's rule
  -- (2027-04-13-hunt-preset-read.sql): the snapshot's weapon and shield where it names them, the worn ones where it does not; the weapon's
  -- key (hr_hunt_weapons; none = neutral), turned into its shield arm when a shield is beside it (hr_hunt_weapon_of's rule).
  v_wpn := case when jsonb_typeof(p_gear->'weapon') = 'string' then p_gear->>'weapon'
                else (select pe.item_id from public.player_equipment pe where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon') end;
  v_shd := case when jsonb_typeof(p_gear->'shield') = 'string' then p_gear->>'shield'
                else (select pe.item_id from public.player_equipment pe where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'shield') end;
  v_key := coalesce((select w.weapon_type from public.hr_hunt_weapons w where w.item_id = v_wpn), 'neutral');
  return coalesce((select r.with_shield from public.hr_hunt_weapon_roles r
                    where r.weapon_type = v_key and r.with_shield is not null
                      and exists (select 1 from public.hr_hunt_shields sh where sh.item_id = v_shd)), v_key);
end $fn$;
revoke execute on function public.hr_setup_fights_as(uuid, integer, jsonb) from public, anon, authenticated, service_role;

-- ── §4 THE SECTION: EACH SETUP SAYS WHAT IT FIGHTS AS AND WHETHER ITS GEAR IS ON ──
create or replace function public.hr_hunt_presets_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path = public, pg_catalog
as $plc$
declare v_own int;
begin
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): 2027-02-10-settle-plan-cache.generated.sql's body (still plpgsql, planned once a
  -- backend), each setup with what it fights as (fights_as, hr_setup_fights_as; discipline, that key's ability list: Use mid-hunt only
  -- for the worn set's) and wearing (its saved gear is the worn set: hr_hunt_gear_set). NULL for no hero, [] for none saved.
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_own := public.hr_hunt_gear_set(p_user, p_slot);
  return coalesce((select jsonb_agg(jsonb_build_object('preset', p.preset, 'name', p.name, 'action_set', p.action_set,
                                                       'gear', p.gear, 'restock', p.restock,
                                                       'fights_as', f.k, 'discipline', r.discipline, 'wearing', p.preset = v_own) order by p.preset)
                     from public.player_hunt_presets p
                     cross join lateral (select public.hr_setup_fights_as(p_user, p_slot, p.gear) as k) f
                     left join public.hr_hunt_weapon_roles r on r.weapon_type = f.k
                    where p.user_id = p_user and p.slot = p_slot), '[]'::jsonb);
end
$plc$;
revoke execute on function public.hr_hunt_presets_view(uuid, integer) from public, anon, authenticated, service_role;

-- ── §5 USE: IN TOWN THE WHOLE SETUP, IN A HUNT THE BAR ONLY ──────────────────
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
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql; Tyler 2026-11-17 "Bar only, keep gear"): WITH A HUNT OPEN, Use switches the BAR
  -- only (the session's set: slots, conditions, fight options) and the setup in use, for a setup that fights as the worn set's
  -- discipline, on a hunt settled to within c_slack_ms; the worn gear stays on and stays its owner's (player_hunt_active.gear_set).
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_p public.player_hunt_presets%rowtype;
  v_s public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_delta jsonb := '{}'::jsonb; v_miss record; v_a jsonb; v_k text; v_row record;
  v_needs text; v_wears text;
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
    -- THE BAR ONLY, MID-HUNT. A pending Leave or ground change keeps its bar (hr_hunt_set_preset's rule).
    if v_s.leave_at is not null or v_s.change_at is not null then
      return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving', 'session', v_s.id)); end if;
    if v_p.action_set <> 0 and not exists (select 1 from public.player_action_sets a
                                            where a.user_id = v_uid and a.slot = p_slot and a.preset = v_p.action_set) then
      return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_action_set', 'action_set', v_p.action_set)); end if;
    -- ONLY A SETUP THAT FIGHTS AS THE WORN SET: the same ability list (discipline); any other changes in town, where its gear goes on.
    v_needs := public.hr_setup_fights_as(v_uid, p_slot, v_p.gear);
    v_wears := public.hr_hunt_weapon_of(v_uid, p_slot);
    if (select r.discipline from public.hr_hunt_weapon_roles r where r.weapon_type = v_needs)
       is distinct from (select r.discipline from public.hr_hunt_weapon_roles r where r.weapon_type = v_wears) then
      return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'setup_needs_weapon',
        'needs', v_needs, 'wears', v_wears, 'session', v_s.id)); end if;
    -- SETTLED FIRST: the new bar plays from the hunt's settled point, never over a long unsettled past.
    if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
      return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
        'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
    if v_s.preset is distinct from v_p.action_set then
      update public.hunt_sessions set preset = v_p.action_set, version = version + 1 where id = v_s.id;
    end if;
    -- THE SETUP IN USE, AND THE GEAR'S OWNER: whoever owned the worn gear keeps it (no row: set 0 did); switching back to it clears it.
    insert into public.player_hunt_active as a (user_id, slot, action_set, gear_set, updated_at)
      values (v_uid, p_slot, v_p.action_set, nullif(0, v_p.action_set), now())
      on conflict (user_id, slot) do update
        set gear_set = nullif(coalesce(a.gear_set, a.action_set), excluded.action_set), action_set = excluded.action_set, updated_at = now();
    v_r := jsonb_build_object('ok', true, 'bar_only', true, 'worn', '{}'::jsonb, 'action_set', v_p.action_set,
                              'session', public.hr_hunt_view(v_s.id));
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
    return v_r;
  end if;
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
  -- THE SWITCH, THEN THE GEAR, AS ONE: the equipment trigger writes the gear of the setup now in use (this one, its own gear's owner
  -- again: gear_set null), never the one being left; a refused equip rolls the switch back.
  begin
    insert into public.player_hunt_active as a (user_id, slot, action_set, gear_set, updated_at) values (v_uid, p_slot, v_p.action_set, null, now())
      on conflict (user_id, slot) do update set action_set = excluded.action_set, gear_set = null, updated_at = now();
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

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u    constant uuid := '000000c0-0000-4000-a000-00005e5a0001';
  k      constant text := '000000c0-0000-4000-a000-5e5a';
  v_st   text[];
  v_g    text; v_found boolean := false;
  v      jsonb; v2 jsonb; v_sid uuid; v_ver bigint; v_was jsonb; v_to timestamptz;
  v_n    int; v_sec jsonb;
  -- everything a refused or a bar-only Use must leave as it was, or move only as named
  c_snap constant text := $q$
    select jsonb_build_object(
      'session', (select jsonb_build_object('preset', h.preset, 'version', h.version, 'settled_to', h.settled_to) from public.hunt_sessions h
                   where h.user_id = $1 and h.slot = 0 and h.ended_at is null),
      'active', (select jsonb_build_object('set', a.action_set, 'owner', a.gear_set) from public.player_hunt_active a where a.user_id = $1 and a.slot = 0),
      'setups', (select jsonb_object_agg(p.preset, jsonb_build_array(p.gear, p.restock, p.updated_at)) from public.player_hunt_presets p where p.user_id = $1 and p.slot = 0),
      'worn', (select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e where e.user_id = $1 and e.slot = 0),
      'bag', (select jsonb_object_agg(i.item_id, i.qty) from public.player_inventory i where i.user_id = $1 and i.slot = 0),
      'rules', (select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r where r.user_id = $1 and r.slot = 0),
      'intents', (select count(*) from public.player_intents i where i.user_id = $1),
      'ledger', (select count(*) from public.player_ledger l where l.user_id = $1),
      'version', (select ps.version from public.player_state ps where ps.user_id = $1 and ps.slot = 0))
  $q$;
  v_snap jsonb;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Swap') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'setup-swap §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    select o.vals into v_st from public.hr_hunt_set_options o where o.opt = 'stance';
    if coalesce(array_length(v_st, 1), 0) < 2 then raise exception 'setup-swap §6(a): the stance option offers fewer than two values'; end if;

    -- (a) THREE SETUPS: 0 "Tank" (the kit's sword and shield), 1 "Bow" and 2 "Crossbow" (one ability list, two weapons), each with its own
    --     stance; a town Use of 1 wears the bow and the gear is its own (no owner apart).
    v := public.hr_hunt_preset_save(0, 0, 'Tank', (k || '00000101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): saving setup 0 answered %', v; end if;
    v := public.hr_hunt_preset_save(0, 1, 'Bow', (k || '00000102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): saving setup 1 answered %', v; end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '00000103')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_bow', 'shield', null), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): wearing the bow answered %', v; end if;
    v := public.hr_hunt_preset_save(0, 2, 'Crossbow', (k || '00000104')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): saving setup 2 answered %', v; end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '00000105')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_crossbow'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): wearing the crossbow answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_action_set_options(0, 1, jsonb_build_object('stance', v_st[1]), (k || '00000106')::uuid);
    v2 := public.hr_action_set_options(0, 2, jsonb_build_object('stance', v_st[2]), (k || '00000107')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v2->>'ok', '') <> 'true' then raise exception 'setup-swap §6(a): the stances answered % / %', v, v2; end if;
    v := public.hr_hunt_preset_apply(0, 1, (k || '00000108')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v ? 'bar_only'
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') is distinct from 'practice_bow'
       or public.hr_hunt_active_set(v_u, 0) <> 1 or public.hr_hunt_gear_set(v_u, 0) <> 1
       or (select gear_set from public.player_hunt_active where user_id = v_u and slot = 0) is not null
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{"weapon": "practice_bow"}'::jsonb
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) <> '{"weapon": "practice_crossbow"}'::jsonb then
      raise exception 'setup-swap §6(a): the town Use of setup 1 answered % (setups %)', v,
        (select jsonb_object_agg(preset, gear) from public.player_hunt_presets where user_id = v_u and slot = 0); end if;

    -- (b) THE HUNT: the first ground this hero may enter, on setup 1.
    for v_g in select g.hunt_id from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id loop
      if public.hr_hunt_enter_check(v_u, 0, v_g, '[]'::jsonb, 1, null) is null then v_found := true; exit; end if;
    end loop;
    if not v_found then raise exception 'setup-swap §6(b): no ground admits a fresh hero'; end if;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 1, null, (k || '00000201')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-swap §6(b): entering % on setup 1 answered %', v_g, v; end if;
    v_sid := (v->'session'->>'id')::uuid;
    if v_sid is null then raise exception 'setup-swap §6(b): the enter named no session: %', v; end if;
    -- the hunt began ten minutes ago and is settled to now (hunt_sessions_clock_ck: entered <= from <= settled); §6(d) moves it behind
    update public.hunt_sessions set entered_at = now() - interval '11 minutes', hunt_from = now() - interval '10 minutes', settled_to = now()
     where id = v_sid;
    delete from public.hr_rate_counters where user_id = v_u;

    -- (c) ANOTHER WEAPON TYPE STAYS IN TOWN: setup 0 (sword and shield) while the bow is worn is setup_needs_weapon, naming both keys,
    --     and writes nothing (a refusal journals only hr_note_rejection's own row, which this snapshot leaves out).
    execute c_snap into v_snap using v_u;
    v := public.hr_hunt_preset_apply(0, 0, (k || '00000301')::uuid);
    if v->>'error' is distinct from 'setup_needs_weapon' or v->>'needs' is distinct from 'shield' or v->>'wears' is distinct from 'ranged'
       or (v->>'session')::uuid is distinct from v_sid then
      raise exception 'setup-swap §6(c): Use of another weapon type mid-hunt answered %', v; end if;
    execute c_snap into v_was using v_u;
    if v_was <> v_snap then raise exception 'setup-swap §6(c): a refused Use moved % -> %', v_snap, v_was; end if;
    if not exists (select 1 from public.player_hunt_active where user_id = v_u and slot = 0 and action_set = 1 and gear_set is null) then
      raise exception 'setup-swap §6(c): the refusal moved the setup in use'; end if;

    -- (d) SETTLED FIRST: five minutes behind, a same-type Use is settle_first and writes nothing; caught up, it lands (e).
    update public.hunt_sessions set settled_to = now() - interval '5 minutes' where id = v_sid;
    execute c_snap into v_snap using v_u;
    v := public.hr_hunt_preset_apply(0, 2, (k || '00000401')::uuid);
    if v->>'error' is distinct from 'settle_first' or (v->>'unsettled_ms')::bigint < 290000 then
      raise exception 'setup-swap §6(d): Use on a hunt five minutes behind answered %', v; end if;
    execute c_snap into v_was using v_u;
    if v_was <> v_snap then raise exception 'setup-swap §6(d): a settle_first Use moved % -> %', v_snap, v_was; end if;
    update public.hunt_sessions set settled_to = now() where id = v_sid;

    -- (e) THE SAME WEAPON TYPE SWITCHES THE BAR ONLY: setup 2 (the crossbow's setup, the ranged list) while the bow is worn. The session
    --     plays set 2 from its next settle (the engine's own read says so), setup 2 is in use, the bow stays on and stays setup 1's, and
    --     both setups' saved gear is byte-equal.
    execute c_snap into v_snap using v_u;
    v := public.hr_hunt_preset_apply(0, 2, (k || '00000501')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'bar_only', '') <> 'true' or v->'worn' <> '{}'::jsonb
       or (v->>'action_set')::int <> 2 or (v->'session'->>'id')::uuid is distinct from v_sid then
      raise exception 'setup-swap §6(e): the mid-hunt Use of setup 2 answered %', v; end if;
    execute c_snap into v_was using v_u;
    if v_was->'session'->'preset' <> '2'::jsonb or (v_was->'session'->>'version')::bigint <> (v_snap->'session'->>'version')::bigint + 1
       or v_was->'session'->'settled_to' <> v_snap->'session'->'settled_to'
       or v_was->'active' <> '{"set": 2, "owner": 1}'::jsonb
       or v_was->'setups' <> v_snap->'setups' or v_was->'worn' <> v_snap->'worn' or v_was->'bag' <> v_snap->'bag'
       or v_was->'rules' is distinct from v_snap->'rules' or v_was->'ledger' <> v_snap->'ledger' or v_was->'version' <> v_snap->'version'
       or (v_was->>'intents')::int <> (v_snap->>'intents')::int + 1 then
      raise exception 'setup-swap §6(e): the bar-only switch moved % -> %', v_snap, v_was; end if;
    select public.hr_hunt_member_read(h) into v_sec from public.hunt_sessions h where h.id = v_sid;
    if v_sec->'options'->>'stance' is distinct from v_st[2]
       or v_sec->'bar' is distinct from (select a.slots from public.player_action_sets a where a.user_id = v_u and a.slot = 0 and a.preset = 2) then
      raise exception 'setup-swap §6(e): the engine''s next read plays % / % (want set 2''s stance %)', v_sec->'options', v_sec->'bar', v_st[2]; end if;
    v_sec := public.hr_state_of(v_u, 0);
    if (v_sec->'hunt_settings'->>'preset')::int <> 2
       or (select count(*) from jsonb_array_elements(v_sec->'hunt_presets') e
            where (e->>'preset' = '0' and e->>'fights_as' = 'shield' and e->>'discipline' = 'shield' and e->'wearing' = 'false'::jsonb)
               or (e->>'preset' = '1' and e->>'fights_as' = 'ranged' and e->>'discipline' = 'ranged' and e->'wearing' = 'true'::jsonb)
               or (e->>'preset' = '2' and e->>'fights_as' = 'ranged' and e->>'discipline' = 'ranged' and e->'wearing' = 'false'::jsonb)) <> 3 then
      raise exception 'setup-swap §6(e): the envelope reads setup % / %', v_sec->'hunt_settings'->'preset', v_sec->'hunt_presets'; end if;
    -- a replay of the key is the first answer and moves nothing
    execute c_snap into v_snap using v_u;
    v2 := public.hr_hunt_preset_apply(0, 2, (k || '00000501')::uuid);
    execute c_snap into v_was using v_u;
    if v2 - 'replayed' <> v or v_was <> v_snap then raise exception 'setup-swap §6(e): a replay answered % and moved % -> %', v2, v_snap, v_was; end if;

    -- (f) BACK AND FORTH: Use 1 mid-hunt makes the gear its own setup's again (no owner apart); Use 2 hands it to 1 once more.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_preset_apply(0, 1, (k || '00000601')::uuid);
    if coalesce(v->>'bar_only', '') <> 'true'
       or not exists (select 1 from public.player_hunt_active where user_id = v_u and slot = 0 and action_set = 1 and gear_set is null)
       or (select preset from public.hunt_sessions where id = v_sid) <> 1 then
      raise exception 'setup-swap §6(f): switching back to setup 1 answered % (active %)', v,
        (select to_jsonb(a) from public.player_hunt_active a where a.user_id = v_u and a.slot = 0); end if;
    v := public.hr_hunt_preset_apply(0, 2, (k || '00000602')::uuid);
    if coalesce(v->>'bar_only', '') <> 'true' or public.hr_hunt_gear_set(v_u, 0) <> 1 or public.hr_hunt_active_set(v_u, 0) <> 2 then
      raise exception 'setup-swap §6(f): switching to setup 2 again answered %', v; end if;

    -- (g) THE HUNT ENDS AND THE GEAR KEEPS ITS OWNER: in town, the bow off goes to setup 1 (the gear's), never to setup 2 (in use), and
    --     back on again.
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '00000701')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', null), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true'
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{}'::jsonb
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) <> '{"weapon": "practice_crossbow"}'::jsonb then
      raise exception 'setup-swap §6(g): an unequip after the hunt answered % and left setups %', v,
        (select jsonb_object_agg(preset, gear) from public.player_hunt_presets where user_id = v_u and slot = 0); end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '00000702')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_bow'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true'
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{"weapon": "practice_bow"}'::jsonb
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) <> '{"weapon": "practice_crossbow"}'::jsonb then
      raise exception 'setup-swap §6(g): the bow back on answered % and left setups %', v,
        (select jsonb_object_agg(preset, gear) from public.player_hunt_presets where user_id = v_u and slot = 0); end if;

    -- (h) TOWN USE UNCHANGED: Use 2 in town wears the crossbow (gear follows the setup), the gear is setup 2's own again, setup 1 keeps
    --     its bow; the next equip goes to setup 2.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_preset_apply(0, 2, (k || '00000801')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v ? 'bar_only' or v->'worn' <> '{"weapon": "practice_crossbow"}'::jsonb
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') is distinct from 'practice_crossbow'
       or not exists (select 1 from public.player_hunt_active where user_id = v_u and slot = 0 and action_set = 2 and gear_set is null)
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{"weapon": "practice_bow"}'::jsonb then
      raise exception 'setup-swap §6(h): the town Use of setup 2 answered % (active %)', v,
        (select to_jsonb(a) from public.player_hunt_active a where a.user_id = v_u and a.slot = 0); end if;

    -- (i) A SAVE TAKES THE GEAR: the bar-only state again (setup 1 in use, the crossbow worn and setup 2's), then Use equipped on setup 1
    --     snapshots the crossbow into it and the gear is setup 1's own (hr_setup_gear_owner); setup 2 keeps its crossbow; the next equip
    --     goes to setup 1.
    update public.player_hunt_active set action_set = 1, gear_set = 2 where user_id = v_u and slot = 0;
    if public.hr_hunt_gear_set(v_u, 0) <> 2 then raise exception 'setup-swap §6(i): the owner was cleared while setup 1''s gear is not worn'; end if;
    v := public.hr_hunt_preset_save(0, 1, 'Bow', (k || '00000901')::uuid);
    if coalesce(v->>'ok', '') <> 'true'
       or not exists (select 1 from public.player_hunt_active where user_id = v_u and slot = 0 and action_set = 1 and gear_set is null)
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{"weapon": "practice_crossbow"}'::jsonb
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) <> '{"weapon": "practice_crossbow"}'::jsonb then
      raise exception 'setup-swap §6(i): Use equipped answered % (active %)', v,
        (select to_jsonb(a) from public.player_hunt_active a where a.user_id = v_u and a.slot = 0); end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '00000902')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_bow'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true'
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) <> '{"weapon": "practice_bow"}'::jsonb
       or (select gear from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) <> '{"weapon": "practice_crossbow"}'::jsonb then
      raise exception 'setup-swap §6(i): the equip after the save went to %',
        (select jsonb_object_agg(preset, gear) from public.player_hunt_presets where user_id = v_u and slot = 0); end if;

    -- (k) ONE RULE: for every probe setup, the envelope's fights_as / discipline are the builder's read's (hr_hunt_preset_project).
    for v_n in select p.preset from public.player_hunt_presets p where p.user_id = v_u and p.slot = 0 loop
      v_sec := (select e from jsonb_array_elements(public.hr_hunt_presets_view(v_u, 0)) e where (e->>'preset')::int = v_n);
      v := public.hr_hunt_preset_project(v_u, 0, v_n);
      if v_sec->>'fights_as' is distinct from v->>'weapon_type' or v_sec->>'discipline' is distinct from v->>'discipline' then
        raise exception 'setup-swap §6(k): setup % fights as %/% in the envelope and %/% in the read', v_n,
          v_sec->>'fights_as', v_sec->>'discipline', v->>'weapon_type', v->>'discipline'; end if;
    end loop;
    if public.hr_hunt_presets_view('00000000-0000-0000-0000-000000000000'::uuid, 0) is not null then
      raise exception 'setup-swap §6(k): the section answers a hero that does not exist'; end if;

    -- (j) nothing new is client-executable; the verb still is.
    if has_function_privilege('authenticated', 'public.hr_setup_fights_as(uuid,integer,jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_gear_set(uuid,integer)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_setup_gear_owner()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_setup_gear_follow()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_presets_view(uuid,integer)', 'execute')
       or has_function_privilege('anon', 'public.hr_hunt_preset_apply(integer,integer,uuid)', 'execute')
       or not has_function_privilege('authenticated', 'public.hr_hunt_preset_apply(integer,integer,uuid)', 'execute')
       or has_table_privilege('authenticated', 'public.player_hunt_active', 'select,insert,update,delete') then
      raise exception 'setup-swap §6(j): a grant is wrong'; end if;
    raise exception using errcode = 'HRSW6', message = 'setup-swap §6 complete - rolling back';
  exception when sqlstate 'HRSW6' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'setup-swap §6: LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'setup-swap: mid-hunt Use switches the bar only, for the worn discipline, on a settled hunt; another weapon type stays in town; the gear keeps its owner; town Use and Save unchanged; all green';
end $$;
