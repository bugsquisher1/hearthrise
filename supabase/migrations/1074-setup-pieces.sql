-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1074-setup-pieces.sql — A SETUP REMEMBERS THE TRAIT PIECE IT WORE, NOT A PLAIN COPY OF ITS BASE (lane/piece-gear-fixes,
--   systems-engineer, 2026-11-27; the t1b finding in .claude/coordination/CONFLICTS.md 2026-11-26 "Setups remember bases, not pieces";
--   12-targets.md 8.6, 1072-piece-verbs.sql).
--
-- STATUS: supabase/migration-notes/1074-setup-pieces.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (1072-piece-verbs.sql's equip op first).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- A setup's saved gear is item names (hr_setup_gear_follow, hr_hunt_preset_save). Switching to a setup of other gear frees a worn piece
--   (1072: no copy), and switching back named only its BASE: hr_hunt_preset_apply put on a PLAIN copy from the bag (the Traits gone from the
--   setup), or refused missing_item. The piece waited on the slot line.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- player_hunt_presets.pieces jsonb NEW, { equip slot: piece id }: the Trait pieces the setup wears, beside `gear` (which still names each
--   slot's item, the piece's base included, so every reader of `gear` reads what it always did). Written only by the server:
--   · hr_setup_gear_write(user, slot) NEW (internal): the setup in use (hr_hunt_gear_set) takes the worn set's gear AND its pieces (a piece
--     counts only while its slot holds its base: hr_worn_traits_of's join). Called by two triggers: hr_setup_gear_follow on player_equipment
--     (RESTATED to call it) and hr_setup_piece_follow NEW on trait_pieces (AFTER UPDATE OF worn_slot, worn_equip_slot: hr_apply marks a piece
--     worn after the equipment row moves, so the equipment trigger alone would miss it).
--   · hr_hunt_preset_save (RESTATED, 2027-02-28-setup-slots.sql's body) saves the worn pieces with the gear.
-- hr_hunt_preset_apply (RESTATED, 2027-05-04-setup-swap-mid-hunt.sql's body), in town:
--   · a slot the setup saved a piece for asks for THAT piece (hr_apply's op {"piece": id}: the row is the unit, nothing debited from the bag,
--     never a plain copy); the piece already worn there is no op. Every other slot as before (the item named, or nothing).
--   · a saved piece that is no longer the account's (sold to the store: 1072 deletes the row) refuses the switch BY SLOT before anything
--     moves: piece_gone { equip_slot, item (the base) }. A piece another hero wears or a market holds is refused by hr_apply's op (piece_worn,
--     piece_escrowed) and rolls the switch back, as a missing item does.
--   · mid-hunt (bar only) is unchanged: the worn set stays on.
-- hr_hunt_presets_view (RESTATED, 2027-05-04's body): a setup with pieces also carries `pieces` and `gone` (its slots whose piece is no longer
--   the account's), so the Setups line says so before a press. A setup with none carries neither (no byte while trait_pieces is dark).
--
-- ── DARK ─────────────────────────────────────────────────────────────────────
-- Nothing here is behind a switch, and nothing needs one: a piece is worn only through 1072's op, which answers pieces_dark while
--   trait_pieces is off, so every setup's `pieces` stays {} and every body plays exactly as before. A setup that saved a piece while lit
--   asks for it with the op, which refuses pieces_dark if the switch is ever turned off again (nothing is worn in its place).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Unchanged: every verb takes the hero's lock (hr_hunt_lock) first; hr_apply locks the piece rows inside (1072's order). The triggers write
--   only the caller's own hero's setup row inside the caller's transaction. A press replays by its key as before (hr_intent_replay).
-- A second apply restates the same bodies (each pin accepts this file's own): byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No new client verb, no new argument. The setup's piece ids are written only by the server from the account's own worn rows; the apply
--   hands them to hr_apply's piece op, which re-proves owner, escrow, worn elsewhere, slot and Level under the piece's row lock. The change
--   REMOVES a path to a plain copy beside a piece (b362's class).
--
-- ── COST (100x: 2,000 accounts x 4 heroes) ───────────────────────────────────
-- Off the settle path: the equipment trigger's one read joins trait_pieces on its worn index (trait_pieces_worn_once); the piece trigger
--   fires only when a piece is worn or freed (a setup change in town). The envelope's setups section adds two keys only to a setup that
--   holds a piece (one primary-key read a piece).
--
-- EDGE: none (the edge's equip verb reaches hr_apply; the company's Start calls hr_hunt_preset_apply, so its setup switch wears pieces too).
-- REVERSIBLE: restate the four bodies from their images (md5 pins in §0), drop hr_setup_piece_follow's trigger and function and
--   hr_setup_gear_write, drop the column. A setup saved while lit falls back to naming its base.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text; v_fn text; v_want text;
begin
  if to_regclass('public.trait_pieces') is null or to_regclass('public.player_hunt_presets') is null or to_regclass('public.hr_equip_slots') is null then
    raise exception 'PRECONDITION: 1071-trait-pieces.sql and the setups (player_hunt_presets) first'; end if;
  if position('PIECE-VERBS (1072-piece-verbs.sql)' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)')), '')) = 0 then
    raise exception 'PRECONDITION: 1072-piece-verbs.sql first (hr_apply''s piece op)'; end if;
  if to_regprocedure('public.hr_hunt_gear_set(uuid,integer)') is null or to_regprocedure('public.hr_setup_fights_as(uuid,integer,jsonb)') is null
     or to_regprocedure('public.hr_setup_locked(uuid,integer,integer)') is null or to_regprocedure('public.hr_setup_name(text)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null or to_regprocedure('public.hr_bag_rules_view(uuid,integer)') is null
     or to_regprocedure('public.hr_item_rule_put(uuid,integer,text,boolean,text,integer)') is null then
    raise exception 'PRECONDITION: a helper the setup bodies call is missing'; end if;
  -- THE PINS: each body this file moves is the image it was derived from, or this file's own (a second apply)
  foreach v_fn in array array['hr_setup_gear_follow()=3602b619051f31886fa89d6e6648fe6d',
                              'hr_hunt_preset_save(integer,integer,text,uuid)=26bc20d0eec5d2e03248215d9662789c',
                              'hr_hunt_preset_apply(integer,integer,uuid)=1e6ef34d2f8171a686729181458e0a4e',
                              'hr_hunt_presets_view(uuid,integer)=a598e0cb84d1385eeb4f4b24321165ac'] loop
    v_want := split_part(v_fn, '=', 2);
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.' || split_part(v_fn, '=', 1));
    if v_md5 is null then raise exception 'PRECONDITION: public.% is missing', split_part(v_fn, '=', 1); end if;
    if v_md5 is distinct from v_want
       and position('SETUP-PIECES (1074-setup-pieces.sql)' in (select prosrc from pg_proc where oid = to_regprocedure('public.' || split_part(v_fn, '=', 1)))) = 0 then
      raise exception 'PIN: public.% is neither its image (md5 %) nor this file''s own (md5 %): another file moved it; re-derive this restatement',
        split_part(v_fn, '=', 1), v_want, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.player_hunt_presets add column if not exists pieces jsonb not null default '{}'::jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_hunt_presets_pieces_shape' and conrelid = 'public.player_hunt_presets'::regclass) then
    alter table public.player_hunt_presets add constraint player_hunt_presets_pieces_shape check (jsonb_typeof(pieces) = 'object');
  end if;
end $mig$;
comment on column public.player_hunt_presets.pieces is
  'SETUP-PIECES (1074-setup-pieces.sql): { equip slot: trait_pieces.id } the setup wears; written only by hr_setup_gear_write and hr_hunt_preset_save from the account''s own worn rows. gear still names each slot''s item (a piece''s base).';

-- ── §2 THE SETUP IN USE FOLLOWS THE WORN SET, ITS PIECES TOO ─────────────────
create or replace function public.hr_setup_gear_write(p_user uuid, p_slot int)
returns void language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_gear jsonb; v_pcs jsonb;
begin
  -- SETUP-PIECES (1074-setup-pieces.sql): the setup whose gear it is (hr_hunt_gear_set: the one in use, or the one whose gear stayed on when a
  -- mid-hunt Use switched only the bar) takes the worn set: each slot's item, and the Trait piece worn there while the slot holds its base.
  -- Another setup's saved gear is never written.
  select coalesce(jsonb_object_agg(e.equip_slot, e.item_id), '{}'::jsonb),
         coalesce(jsonb_object_agg(e.equip_slot, tp.id::text) filter (where tp.id is not null), '{}'::jsonb)
    into v_gear, v_pcs
    from public.player_equipment e
    left join public.trait_pieces tp on tp.user_id = e.user_id and tp.worn_slot = e.slot and tp.worn_equip_slot = e.equip_slot and tp.base = e.item_id
   where e.user_id = p_user and e.slot = p_slot;
  update public.player_hunt_presets p set gear = v_gear, pieces = v_pcs, updated_at = now()
   where p.user_id = p_user and p.slot = p_slot and p.preset = public.hr_hunt_gear_set(p_user, p_slot)
     and (p.gear is distinct from v_gear or p.pieces is distinct from v_pcs);
end $fn$;

create or replace function public.hr_setup_gear_follow()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the setup in use wears what the hero wears.
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql): the setup whose gear it is (hr_hunt_gear_set).
  -- SETUP-PIECES (1074-setup-pieces.sql): its pieces too, one writer (hr_setup_gear_write).
  if tg_op = 'DELETE' then perform public.hr_setup_gear_write(old.user_id, old.slot);
  else perform public.hr_setup_gear_write(new.user_id, new.slot); end if;
  return null;
end $fn$;

create or replace function public.hr_setup_piece_follow()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- SETUP-PIECES (1074-setup-pieces.sql): a piece put on or taken off (hr_apply's equip op marks it after the equipment row moves) re-writes
  -- the setup in use of the hero that wore it and of the hero that wears it now.
  if old.worn_slot is not null then perform public.hr_setup_gear_write(old.user_id, old.worn_slot); end if;
  if new.worn_slot is not null and new.worn_slot is distinct from old.worn_slot then perform public.hr_setup_gear_write(new.user_id, new.worn_slot); end if;
  return null;
end $fn$;
drop trigger if exists hr_setup_piece_follow on public.trait_pieces;
create trigger hr_setup_piece_follow after update of worn_slot, worn_equip_slot on public.trait_pieces
  for each row when (old.worn_slot is distinct from new.worn_slot or old.worn_equip_slot is distinct from new.worn_equip_slot)
  execute function public.hr_setup_piece_follow();

-- ── §3 SAVE: THE WORN PIECES WITH THE GEAR ───────────────────────────────────
create or replace function public.hr_hunt_preset_save(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text; v_from int;
  v_s public.hunt_sessions%rowtype; v_set public.player_action_sets%rowtype;
begin
  -- SETUP-PIECES (1074-setup-pieces.sql): 2027-02-28-setup-slots.sql's body; the saved setup keeps the Trait pieces worn (`pieces`) beside
  -- the gear's names, so Use puts the piece back on, never a plain copy of its base.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- A setup owns the set of its number, so setups and sets share one range.
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'hunt_preset_save:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_save', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- Setups change in town (as Use does): a hunt runs on the set it entered with.
  if v_s.id is not null then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  -- SETUP-SLOTS (2027-02-28-setup-slots.sql): a new number at or past this hero's count. A setup already saved is never refused.
  v_r := public.hr_setup_locked(v_uid, p_slot, p_preset);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_save', p_slot, v_r); end if;
  -- THE BAR: set N becomes the current bar (a copy when the hero is on another set; its grounds claim stays behind).
  v_from := public.hr_hunt_active_set(v_uid, p_slot);
  if v_from <> p_preset then
    select * into v_set from public.player_action_sets x where x.user_id = v_uid and x.slot = p_slot and x.preset = v_from;
    insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
      values (v_uid, p_slot, p_preset, v_name, coalesce(v_set.slots, '[]'::jsonb), coalesce(v_set.options, '{}'::jsonb) - 'grounds', now())
      on conflict (user_id, slot, preset) do update set name = excluded.name, slots = excluded.slots, options = excluded.options, updated_at = now();
  else
    insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
      values (v_uid, p_slot, p_preset, v_name, '[]'::jsonb, '{}'::jsonb, now())
      on conflict (user_id, slot, preset) do update set name = excluded.name, updated_at = now();
  end if;
  insert into public.player_hunt_presets as p (user_id, slot, preset, name, action_set, gear, pieces, restock, updated_at)
  values (v_uid, p_slot, p_preset, v_name, p_preset,
          coalesce((select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e
                     where e.user_id = v_uid and e.slot = p_slot), '{}'::jsonb),
          coalesce((select jsonb_object_agg(e.equip_slot, tp.id::text) from public.player_equipment e
                      join public.trait_pieces tp on tp.user_id = e.user_id and tp.worn_slot = e.slot and tp.worn_equip_slot = e.equip_slot and tp.base = e.item_id
                     where e.user_id = v_uid and e.slot = p_slot), '{}'::jsonb),
          coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                     where r.user_id = v_uid and r.slot = p_slot and r.restock > 0), '{}'::jsonb),
          now())
  on conflict (user_id, slot, preset) do update
    set name = excluded.name, action_set = excluded.action_set, gear = excluded.gear, pieces = excluded.pieces, restock = excluded.restock, updated_at = now();
  insert into public.player_hunt_active as h (user_id, slot, action_set, updated_at) values (v_uid, p_slot, p_preset, now())
    on conflict (user_id, slot) do update set action_set = excluded.action_set, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $fn$;

-- ── §4 USE: A SAVED PIECE GOES BACK ON AS ITSELF ─────────────────────────────
create or replace function public.hr_hunt_preset_apply(p_slot integer, p_preset integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): GEAR FOLLOWS THE SETUP. Use switches the setup in use
  -- FIRST, then makes the worn set exactly the setup's gear (every catalogued slot: the named item, or nothing), all
  -- or nothing; hr_setup_gear_follow then keeps the setup's gear equal to what is worn.
  -- SETUP-SWAP (2027-05-04-setup-swap-mid-hunt.sql; Tyler 2026-11-17 "Bar only, keep gear"): WITH A HUNT OPEN, Use switches the BAR
  -- only (the session's set: slots, conditions, fight options) and the setup in use, for a setup that fights as the worn set's
  -- discipline, on a hunt settled to within c_slack_ms; the worn gear stays on and stays its owner's (player_hunt_active.gear_set).
  -- SETUP-PIECES (1074-setup-pieces.sql): in town a slot the setup saved a Trait piece for asks for THAT piece (hr_apply's op {piece}),
  -- never a plain copy of its base; a saved piece no longer the account's refuses the switch by slot (piece_gone) before anything moves.
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_p public.player_hunt_presets%rowtype;
  v_s public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_delta jsonb := '{}'::jsonb; v_miss record; v_a jsonb; v_k text; v_row record;
  v_needs text; v_wears text; v_gone record;
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
  -- A SAVED PIECE THAT IS GONE (sold to the store: the row is deleted) is refused BY SLOT before anything moves: the setup never wears a
  -- plain copy of its base in its place.
  select s.equip_slot, v_p.gear->>s.equip_slot as item into v_gone
    from public.hr_equip_slots s
   where jsonb_typeof(v_p.pieces->s.equip_slot) = 'string'
     and not exists (select 1 from public.trait_pieces tp where tp.id = (v_p.pieces->>s.equip_slot)::uuid and tp.user_id = v_uid)
   order by s.equip_slot limit 1;
  if v_gone.equip_slot is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'piece_gone',
      'equip_slot', v_gone.equip_slot, 'item', v_gone.item)); end if;
  -- THE GEAR: every catalogued equip slot whose worn unit is not the setup's: its saved piece ({piece}, no op while that piece is worn there
  -- on its base), else its item (JSON null = take it off).
  select coalesce(jsonb_object_agg(x.equip_slot, x.want), '{}'::jsonb) into v_delta
    from (select s.equip_slot,
                 case when jsonb_typeof(v_p.pieces->s.equip_slot) = 'string' then jsonb_build_object('piece', v_p.pieces->>s.equip_slot)
                      when jsonb_typeof(v_p.gear->s.equip_slot) = 'string' then v_p.gear->s.equip_slot else 'null'::jsonb end as want,
                 e.item_id as worn,
                 (select tp.id::text from public.trait_pieces tp
                   where tp.user_id = v_uid and tp.worn_slot = p_slot and tp.worn_equip_slot = s.equip_slot and tp.base = e.item_id) as worn_piece
            from public.hr_equip_slots s
            left join public.player_equipment e on e.user_id = v_uid and e.slot = p_slot and e.equip_slot = s.equip_slot) x
   where case when jsonb_typeof(x.want) = 'object' then x.worn_piece is distinct from (x.want->>'piece')
              else (x.want #>> '{}') is distinct from x.worn end;
  -- A missing item is refused BY NAME before anything moves (hr_apply re-proves it). A piece needs no bag stack.
  select n.item, n.need, coalesce(pi.qty, 0) as have into v_miss
    from (select d.value #>> '{}' as item, count(*) as need from jsonb_each(v_delta) d
           where jsonb_typeof(d.value) = 'string' group by 1) n
    left join public.player_inventory pi on pi.user_id = v_uid and pi.slot = p_slot and pi.item_id = n.item
   where coalesce(pi.qty, 0) < n.need order by n.item limit 1;
  if v_miss.item is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'missing_item',
      'item', v_miss.item, 'have', v_miss.have, 'need', v_miss.need)); end if;
  -- THE SWITCH, THEN THE GEAR, AS ONE: the equipment trigger writes the gear of the setup now in use (this one, its own gear's owner
  -- again: gear_set null), never the one being left; a refused equip (a piece worn by another hero, listed, or the switch dark) rolls the
  -- switch back.
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
end $fn$;

-- ── §5 THE SECTION: A SETUP SAYS WHICH OF ITS PIECES ARE GONE ────────────────
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
  -- SETUP-PIECES (1074-setup-pieces.sql): a setup that saved Trait pieces also carries `pieces` ({ equip slot: piece id }) and `gone` (its
  -- slots whose piece is no longer the account's, so Use would refuse piece_gone); a setup with none carries neither.
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_own := public.hr_hunt_gear_set(p_user, p_slot);
  return coalesce((select jsonb_agg(jsonb_build_object('preset', p.preset, 'name', p.name, 'action_set', p.action_set,
                                                       'gear', p.gear, 'restock', p.restock,
                                                       'fights_as', f.k, 'discipline', r.discipline, 'wearing', p.preset = v_own)
                                    || case when p.pieces = '{}'::jsonb then '{}'::jsonb
                                            else jsonb_build_object('pieces', p.pieces, 'gone',
                                                   (select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb) from jsonb_each_text(p.pieces) e
                                                     where not exists (select 1 from public.trait_pieces tp where tp.id = e.value::uuid and tp.user_id = p_user))) end
                                    order by p.preset)
                     from public.player_hunt_presets p
                     cross join lateral (select public.hr_setup_fights_as(p_user, p_slot, p.gear) as k) f
                     left join public.hr_hunt_weapon_roles r on r.weapon_type = f.k
                    where p.user_id = p_user and p.slot = p_slot), '[]'::jsonb);
end
$plc$;

-- ── §6 THE GRANTS (no client reaches a helper or a trigger function; the verbs keep theirs) ──
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_setup_gear_write(uuid,integer)', 'public.hr_setup_gear_follow()', 'public.hr_setup_piece_follow()',
                               'public.hr_hunt_presets_view(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  execute 'revoke execute on function public.hr_hunt_preset_save(int, int, text, uuid) from public, anon, service_role';
  execute 'grant execute on function public.hr_hunt_preset_save(int, int, text, uuid) to authenticated';
  execute 'revoke execute on function public.hr_hunt_preset_apply(int, int, uuid) from public, anon, service_role';
  execute 'grant execute on function public.hr_hunt_preset_apply(int, int, uuid) to authenticated';
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_preset_apply(int, int, uuid) from %I', v_role);
      execute format('revoke all on function public.hr_hunt_preset_save(int, int, text, uuid) from %I', v_role);
    end if;
  end loop;
end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) DARK: with no piece worn a setup saves pieces {} and the section carries neither new key (the envelope moves no byte).
-- (b) THE SETUP WEARS THE PIECE, lit: a piece put on (hr_piece_wear) is the setup in use's piece; a setup saved wearing it keeps it; a
--     switch to a setup of a plain body frees it (no copy) and a switch back puts THE PIECE on, not the plain copy of its base the bag holds
--     (the bag's stack is the same after, and no slot wears a copy); a second press is no op.
-- (c) GONE: the piece sold, the setup's line says gone ['<slot>'] and Use refuses piece_gone by slot, moving nothing.
-- (d) THE BODIES AND THE GRANTS: no client reaches a helper; grant hygiene is quiet; no probe row leaked; every switch off.
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000074a1174';
  v jsonb; v_b text; v_alt text; v_w0 text; v_p uuid; v_n bigint; v_ver bigint; v_bid bigint;
  v_hunt text := 'muster_barrows';
  bag constant text := 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)';
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'setup-pieces §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- two body pieces a fresh hero can wear: the piece's base (a plain copy of it waits in the bag) and another (the second setup's)
    select min(s.item_id) into v_b from public.hr_item_slots s
     where s.equip_slot = 'body' and public.hr_item_requirement_unmet(v_u, 0, s.item_id) is null
       and (select count(*) from public.hr_item_slots s2 where s2.item_id = s.item_id) = 1;
    select min(s.item_id) into v_alt from public.hr_item_slots s
     where s.equip_slot = 'body' and public.hr_item_requirement_unmet(v_u, 0, s.item_id) is null and s.item_id <> v_b;
    if v_b is null or v_alt is null then raise exception 'VERIFY(a): no two body pieces a fresh hero can wear'; end if;
    select item_id into v_w0 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'body';
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_alt, 1), (v_u, 0, v_b, 1)
      on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + 1;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms)
      values (v_u, 0, v_b, 'body', 60, 'rare', '[{"id": "first_rank", "rank": 1}]', v_hunt, 0, 1, gen_random_uuid(), 1, 1) returning id into v_p;

    -- (a) dark: the plain body on, a setup saved with no piece worn ('Plain', setup 0)
    update public.hr_flags set enabled = false where key = 'trait_pieces';
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('body', v_alt),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:body')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the plain body would not go on: %', v; end if;
    v := public.hr_hunt_preset_save(0, 0, 'Plain', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the save refused %', v; end if;
    if (select pieces from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 0) <> '{}'::jsonb
       or exists (select 1 from jsonb_array_elements(public.hr_hunt_presets_view(v_u, 0)) e where e ? 'pieces' or e ? 'gone') then
      raise exception 'VERIFY(a): a setup with no piece reads %', public.hr_hunt_presets_view(v_u, 0); end if;

    -- (b) lit: a second setup ('Rare', setup 1) in use, the piece put on: the setup in use follows it, the one left does not
    update public.hr_flags set enabled = true where key = 'trait_pieces';
    v := public.hr_hunt_preset_save(0, 1, 'Rare', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the second save refused %', v; end if;
    v := public.hr_piece_wear(0, v_p, 'body', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the wear refused %', v; end if;
    if (select pieces->>'body' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) is distinct from v_p::text
       or (select gear->>'body' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) is distinct from v_b then
      raise exception 'VERIFY(b): the setup in use did not follow the piece: %', (select pieces from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1); end if;
    if (select pieces from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 0) <> '{}'::jsonb then
      raise exception 'VERIFY(b): a setup not in use followed the piece'; end if;
    -- to Plain: the piece is freed (no copy), the plain body back on
    execute bag into v_n using v_u, v_b;
    v := public.hr_hunt_preset_apply(0, 0, gen_random_uuid());
    execute bag into v_bid using v_u, v_b;
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is not null or v_bid <> v_n
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'body') is distinct from v_alt then
      raise exception 'VERIFY(b): the switch off the piece answered % (base in bag % -> %)', v, v_n, v_bid; end if;
    if (select pieces->>'body' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 1) is distinct from v_p::text then
      raise exception 'VERIFY(b): leaving a setup rewrote its saved piece'; end if;
    -- back to Rare: THE PIECE goes on, the plain copy of its base stays in the bag
    v := public.hr_hunt_preset_apply(0, 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): Use refused %', v; end if;
    if (select worn_slot::text || worn_equip_slot from public.trait_pieces where id = v_p) is distinct from '0body'
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'body') is distinct from v_b then
      raise exception 'VERIFY(b): Use wore % (piece worn %), not the piece', (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'body'),
        (select worn_slot from public.trait_pieces where id = v_p); end if;
    execute bag into v_bid using v_u, v_b;
    if v_bid <> v_n then raise exception 'VERIFY(b): Use took the plain copy of the base from the bag (% -> %)', v_n, v_bid; end if;
    v := public.hr_hunt_preset_apply(0, 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'worn' <> '{}'::jsonb then raise exception 'VERIFY(b): a second Use moved %', v; end if;
    -- a save over a setup not in use while the piece is on keeps the piece (Use equipped)
    v := public.hr_hunt_preset_save(0, 2, 'Copy', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (select pieces->>'body' from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2) is distinct from v_p::text then
      raise exception 'VERIFY(b): a setup saved wearing the piece reads %', (select pieces from public.player_hunt_presets where user_id = v_u and slot = 0 and preset = 2); end if;
    v := public.hr_hunt_preset_apply(0, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is not null then
      raise exception 'VERIFY(b): Plain again answered %', v; end if;

    -- (c) the piece sold: the line says gone, Use refuses by slot and moves nothing
    delete from public.trait_pieces where id = v_p;
    if (select e->'gone' from jsonb_array_elements(public.hr_hunt_presets_view(v_u, 0)) e where (e->>'preset')::int = 1) is distinct from '["body"]'::jsonb then
      raise exception 'VERIFY(c): the setup line reads %', public.hr_hunt_presets_view(v_u, 0); end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_hunt_preset_apply(0, 1, gen_random_uuid());
    if v->>'error' is distinct from 'piece_gone' or v->>'equip_slot' is distinct from 'body' or v->>'item' is distinct from v_b
       or (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'body') is distinct from v_alt then
      raise exception 'VERIFY(c): Use of a setup whose piece is gone answered %', v; end if;
    raise exception using errcode = 'HRT74', message = 'setup-pieces §7 complete - rolling back';
  exception when sqlstate 'HRT74' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (d) the bodies, the grants, nothing leaked, every switch off
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r)
              where has_function_privilege(g.r, 'public.hr_setup_gear_write(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_hunt_presets_view(uuid,integer)', 'execute'))
     or not has_function_privilege('authenticated', 'public.hr_hunt_preset_apply(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_preset_save(integer,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(d): a helper or a verb is reachable by the wrong role'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_setup_piece_follow' and tgrelid = 'public.trait_pieces'::regclass) then
    raise exception 'VERIFY(d): the piece trigger is missing'; end if;
  perform public.hr_assert_grant_hygiene(true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.trait_pieces where user_id = v_u)
     or exists (select 1 from public.player_hunt_presets where user_id = v_u) or exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'VERIFY(d): §7 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key in ('trait_pieces', 'signatures', 'trait_drops') and enabled) then
    raise exception 'VERIFY(d): a switch is lit after the apply'; end if;
  raise notice 'setup-pieces: a setup remembers its Trait pieces and puts each back on as itself, a gone piece refuses by slot, never a plain copy; all green';
end $$;
