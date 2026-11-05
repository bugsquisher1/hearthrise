-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-28-setup-slots.sql — A HERO'S SETUPS: SOME FREE, THEN BOUGHT, UP TO THE SAME LIMIT
--   (lane/c-hero-sinks, systems-engineer, 2026-11-04; Tyler the same day: "extra action-bar setups beyond a free couple"; the designer's
--   board section "2026-11-04 Gold sinks", "Setup slots"; prices and the free count are one row, src/data/gold-sinks.js `setup_slot`).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §6; ON THE EA SECURITY LIST (a money surface: a gold sink). EDGE: no deploy, nothing here enters the bundle.
-- CLIENT: this file first. An old client still saves a new number under the count; past it, it reads the refusal's own words.
-- APPLY ORDER: after 2027-02-27-gold-sinks-seams.sql (hr_sink_price, hr_sink_rules). Before or after the titles files: they don't touch.
--
-- ── WHAT IT SHIPS ────────────────────────────────────────────────────────────
--   hr_setups_of(user, slot)        how many setup numbers this hero may open: free + the rungs it bought, never past hr_hunt_limit('presets').
--   hr_setup_locked(user, slot, n)  null when this hero may write setup number n; otherwise the refusal. A number is NEW when neither a
--                                   setup nor a bar stands on it. ONLY A NEW NUMBER AT OR PAST THE COUNT IS REFUSED: a setup the hero
--                                   already saved stays saved and usable, whatever the count (Tyler's wipe aside, nothing is taken back).
--   hr_setup_slots_view             the section `setup_slots`: { count, free, bought, max, price } (price: the next rung, null past the top).
--   hr_setup_slot_buy(slot, price, key)  the purchase: the stamina-refill shape. Rung in player_progress, raise-only, per hero.
--   hr_hunt_preset_save, hr_action_set_put, hr_action_set_options, hr_action_set_rename  RESTATED: each refuses a new number at or past
--                                   the count, after the lock. §0 pins each to its live image. hr_hunt_preset_rename, _delete, _apply and
--                                   hr_hunt_set_preset touch only rows that exist, so they stay as they are.
--   hr_action_set_copy              RESTATED: copying bars to another hero brings only the numbers that hero may hold (or a bar copied
--                                   past the count would make that number "not new", a free slot), and no longer takes the bar out from
--                                   under a setup the hero saved. The answer says how many didn't fit (`locked`).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink only: gold never comes back, and a slot is no power (a hero has had 5 for free until today). No client number prices it: a
-- stale or forged p_price is quote_changed, nothing charged. A second press re-quotes the next rung and is refused rather than charged
-- twice. The key is hr_apply's: a replay answers the stored receipt. The purse is the account's, the rung the hero's, so one purchase
-- opens one hero. A hunting hero may buy (the bar of a running hunt isn't touched; Save and Use stay town-only): this is the refill's rule,
-- and the design's pattern names no hunting refusal for a hero sink.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- The section: one PK read per envelope. hr_setup_locked: one PK read on every bar edit, two more only past the count.
--
-- REVERSIBILITY: re-apply the pre-images (2026-11-15-preset-names.sql's save and rename; 2026-11-17-hunt-density-home.sql's options;
-- 2026-10-25-action-conditions.sql's copy; the put as hr_hunt_set_options last left it); drop the section row, the verb, the helpers.
-- A bought rung is a player_progress row and goes with the character wipe.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_sink_price(text,integer,integer)') is null or to_regclass('public.hr_sink_rules') is null
     or not exists (select 1 from public.hr_sink_rules where sink_id = 'setup_slot') then
    raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-catalogue.generated.sql and 2027-02-27-gold-sinks-seams.sql first'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-05) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_hunt_preset_save(integer,integer,text,uuid)', 'e43e8613e0aaa3c0a352bab198e278a8', '355b2fc5d944fd41bb22f6a9bc57253e'),
    ('public.hr_action_set_put(integer,integer,text,jsonb,uuid)', 'c738b19ee67986f79cbbccbc68e835e4', '1c2aae0b02a820540f7b30445230c538'),
    ('public.hr_action_set_options(integer,integer,jsonb,uuid)', '29d33ecb4c29c7a354a5a00fd3a9c73b', '3b0fac2ad05fa9708b50d5240daa9de4'),
    ('public.hr_action_set_rename(integer,integer,text,uuid)', '7a3771a03b7a39e82a95d87c1759dfb7', '64f9dd795659b90496376fa2bb154e7b'),
    ('public.hr_action_set_copy(integer,integer,uuid)', 'f1f349d0e3eebcd4441019d8056dc57c', '328c317077f7bd6f0b5718f701dd9ba4')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 HOW MANY, AND WHETHER THIS NUMBER IS OPEN ─────────────────────────────
-- The rung: player_progress (stat, 'setup_slots_bought'), this hero's. Read through here only.
create or replace function public.hr_setups_bought(p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return greatest(coalesce((select p.value from public.player_progress p
                             where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat'
                               and p.key = 'setup_slots_bought' and p.period_key = ''), 0), 0)::int;
end $fn$;

-- No rule row: nothing is for sale, so nothing is taken away (the limit stands, as it did before this file).
create or replace function public.hr_setups_of(p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_lim int := public.hr_hunt_limit('presets'); v_free int;
begin
  select r.free into v_free from public.hr_sink_rules r where r.sink_id = 'setup_slot';
  if v_free is null then return v_lim; end if;
  return least(v_free + public.hr_setups_bought(p_user, p_slot), v_lim);
end $fn$;

create or replace function public.hr_setup_slots_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_lim int := public.hr_hunt_limit('presets'); v_free int; v_bought int; v_count int;
begin
  select r.free into v_free from public.hr_sink_rules r where r.sink_id = 'setup_slot';
  v_bought := public.hr_setups_bought(p_user, p_slot);
  v_count := public.hr_setups_of(p_user, p_slot);
  return jsonb_build_object('count', v_count, 'free', coalesce(v_free, v_lim), 'bought', v_bought, 'max', v_lim,
                            'price', case when v_count < v_lim then public.hr_sink_price('setup_slot', v_bought) end);
end $fn$;

-- The one check every verb that can open a number asks, after the hero's lock. Null: go on.
create or replace function public.hr_setup_locked(p_user uuid, p_slot int, p_preset int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_count int := public.hr_setups_of(p_user, p_slot);
begin
  if p_preset < v_count
     or exists (select 1 from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot and p.preset = p_preset)
     or exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot and a.preset = p_preset) then
    return null;
  end if;
  return jsonb_build_object('ok', false, 'error', 'setup_locked', 'slots', v_count,
                            'price', public.hr_sink_price('setup_slot', public.hr_setups_bought(p_user, p_slot)));
end $fn$;

revoke execute on function public.hr_setups_bought(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setups_of(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setup_slots_view(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setup_locked(uuid, int, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('setup_slots', 'hr_setup_slots_view', '2027-02-28-setup-slots.sql: how many setup numbers this hero may open, the free ones, the rungs it bought, the limit and the next rung''s price (null past the top)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 THE PURCHASE ──────────────────────────────────────────────────────────
create or replace function public.hr_setup_slot_buy(p_slot int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'setup_slot_buy';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_bought int; v_lim int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  -- The rungs climb (tools/gen-gold-sinks.mjs refuses a ladder that doesn't), so the price names the rung, and a key can't buy two.
  v_verb := c_verb || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE QUOTE, under the lock, from the server's row: never the client's number.
  v_bought := public.hr_setups_bought(v_uid, p_slot);
  v_lim := public.hr_hunt_limit('presets');
  v_price := case when public.hr_setups_of(v_uid, p_slot) < v_lim then public.hr_sink_price('setup_slot', v_bought) end;
  if v_price is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'setup_slots_max', 'max', v_lim)); end if;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'setup_slots', public.hr_setup_slots_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'rung', v_bought + 1))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- THE RUNG, raise-only: nothing can take a bought slot back.
  insert into public.player_progress as pp (user_id, slot, kind, key, period_key, value, updated_at)
    values (v_uid, p_slot, 'stat', 'setup_slots_bought', '', v_bought + 1, now())
    on conflict (user_id, slot, kind, key, period_key) do update set value = greatest(pp.value, excluded.value), updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'setup_slots', public.hr_setup_slots_view(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_setup_slot_buy(int, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_setup_slot_buy(int, bigint, uuid) to authenticated;

-- ── §3 EVERY VERB THAT CAN OPEN A NUMBER ASKS, AFTER THE LOCK ────────────────
-- SAVE: 2026-11-15-preset-names.sql's body, plus the one check. A hunting hero hears hunt_open first, as it always did.
create or replace function public.hr_hunt_preset_save(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text; v_from int;
  v_s public.hunt_sessions%rowtype; v_set public.player_action_sets%rowtype;
begin
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
  insert into public.player_hunt_presets as p (user_id, slot, preset, name, action_set, gear, restock, updated_at)
  values (v_uid, p_slot, p_preset, v_name, p_preset,
          coalesce((select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e
                     where e.user_id = v_uid and e.slot = p_slot), '{}'::jsonb),
          coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                     where r.user_id = v_uid and r.slot = p_slot and r.restock > 0), '{}'::jsonb),
          now())
  on conflict (user_id, slot, preset) do update
    set name = excluded.name, action_set = excluded.action_set, gear = excluded.gear, restock = excluded.restock, updated_at = now();
  insert into public.player_hunt_active as h (user_id, slot, action_set, updated_at) values (v_uid, p_slot, p_preset, now())
    on conflict (user_id, slot) do update set action_set = excluded.action_set, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_action_set_put(p_slot integer, p_preset integer, p_name text, p_slots jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $function$
declare
  c_verb constant text := 'action_set_put';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[^[:print:]]', '', 'g'));
  if v_name = '' then v_name := 'Preset ' || (p_preset + 1); end if;
  if char_length(v_name) > 32 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  v_r := public.hr_hunt_bar_check(p_slots);
  if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- SETUP-SLOTS (2027-02-28-setup-slots.sql): a bar on a new number past the count would make that number free to save.
  if public.hr_setup_locked(v_uid, p_slot, p_preset) is not null then
    return public.hr_note_rejection(c_verb, p_slot, public.hr_setup_locked(v_uid, p_slot, p_preset)); end if;
  -- An edit to the bar a hunt is running lands from the next swing boundary.
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, updated_at)
    values (v_uid, p_slot, p_preset, v_name, v_r->'slots', now())
    on conflict (user_id, slot, preset) do update set name = excluded.name, slots = excluded.slots, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'name', v_name, 'slots', v_r->'slots');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

create or replace function public.hr_action_set_options(p_slot integer, p_preset integer, p_opts jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $function$
declare
  c_verb constant text := 'action_set_options';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_k    text;
  v_v    jsonb;
  v_o    public.hr_hunt_set_options%rowtype;
  v_set  jsonb := '{}'::jsonb;
  v_del  text[] := '{}';
  v_bar  jsonb := null;
begin
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): density is no option (hunt_density, hr_hunt_density_set);
  -- a `density` key is refused as bad_option by the catalogue like any unknown key.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    v_v := p_opts->v_k;
    -- THE THREE KEYS THAT ARE NOT OPTION ROWS, each through its own check.
    if v_k = 'slots' then
      v_r := public.hr_hunt_bar_check(case when jsonb_typeof(v_v) = 'null' then '[]'::jsonb else v_v end);
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_bar := v_r->'slots';
      continue;
    elsif v_k = 'stop_rules' or v_k = 'grounds' then
      if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
      v_r := case v_k when 'stop_rules' then public.hr_hunt_stop_rules_check(v_v) else public.hr_hunt_grounds_check(v_v) end;
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_set := v_set || jsonb_build_object(v_k, case v_k when 'stop_rules' then v_r->'rules' else v_r->'grounds' end);
      continue;
    end if;
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
    if v_o.kind = 'target' then
      if jsonb_typeof(v_v) <> 'string' or not exists (select 1 from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_target_mode')); end if;
    elsif v_o.kind = 'limit' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <> trunc((v_v #>> '{}')::numeric)
         or (v_v #>> '{}')::numeric < public.hr_hunt_limit(v_o.limit_key || '_min')
         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'min', public.hr_hunt_limit(v_o.limit_key || '_min'), 'max', public.hr_hunt_limit(v_o.limit_key || '_max'))); end if;
      v_v := to_jsonb((v_v #>> '{}')::numeric::bigint);
    elsif v_o.kind = 'bool' then
      if jsonb_typeof(v_v) <> 'boolean' then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k)); end if;
    else
      if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (v_o.vals)) then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'allowed', to_jsonb(v_o.vals))); end if;
    end if;
    v_set := v_set || jsonb_build_object(v_k, v_v);
  end loop;
  if octet_length(v_set::text) > 2048 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options', 'why', 'too_large')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- SETUP-SLOTS (2027-02-28-setup-slots.sql): a bar on a new number past the count would make that number free to save.
  if public.hr_setup_locked(v_uid, p_slot, p_preset) is not null then
    return public.hr_note_rejection(c_verb, p_slot, public.hr_setup_locked(v_uid, p_slot, p_preset)); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, 'Preset ' || (p_preset + 1), coalesce(v_bar, '[]'::jsonb), (v_set - v_del), now())
    on conflict (user_id, slot, preset) do update
      set options = (a.options - v_del) || v_set, slots = coalesce(v_bar, a.slots), updated_at = now();
  select jsonb_build_object('ok', true, 'preset', p_preset, 'options', a.options, 'slots', a.slots) into v_r
    from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

create or replace function public.hr_action_set_rename(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'action_set_rename:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('action_set_rename', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- SETUP-SLOTS (2027-02-28-setup-slots.sql): a name on a new number past the count would make that number free to save.
  v_r := public.hr_setup_locked(v_uid, p_slot, p_preset);
  if v_r is not null then return public.hr_note_rejection('action_set_rename', p_slot, v_r); end if;
  -- A name only: the bar, its options and a running hunt's presses are untouched.
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, v_name, '[]'::jsonb, '{}'::jsonb, now())
    on conflict (user_id, slot, preset) do update set name = excluded.name, updated_at = now();
  -- One name: the setup that owns this bar carries it too.
  update public.player_hunt_presets set name = v_name, updated_at = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'name', v_name);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- COPY BARS TO ANOTHER HERO: only the numbers that hero may hold arrive, and a setup that hero saved keeps its bar when the source has none on that number.
create or replace function public.hr_action_set_copy(p_from integer, p_to integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $function$
declare
  c_verb constant text := 'action_set_copy';
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
  v_n   int;
  v_open int[];
  v_locked int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_to is null or p_to < 0 or p_to > 5 then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_from is null or p_from < 0 or p_from > 5 or p_from = p_to then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_from')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_to, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_to, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_to);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_to)
     or not exists (select 1 from public.player_state where user_id = v_uid and slot = p_from) then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_to, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  -- SETUP-SLOTS (2027-02-28-setup-slots.sql): asked BEFORE the delete, while the target's rows still say what it holds.
  v_open := array(select n from generate_series(0, public.hr_hunt_limit('presets') - 1) n where public.hr_setup_locked(v_uid, p_to, n) is null);
  delete from public.player_action_sets t where t.user_id = v_uid and t.slot = p_to
     and (exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_from and a.preset = t.preset)
          or not exists (select 1 from public.player_hunt_presets p where p.user_id = v_uid and p.slot = p_to and p.preset = t.preset));
  insert into public.player_action_sets (user_id, slot, preset, name, slots, options, updated_at)
    select v_uid, p_to, a.preset, a.name, a.slots, a.options, now()
      from public.player_action_sets a where a.user_id = v_uid and a.slot = p_from and a.preset = any (v_open);
  get diagnostics v_n = row_count;
  select count(*)::int into v_locked from public.player_action_sets a
   where a.user_id = v_uid and a.slot = p_from and not (a.preset = any (v_open));
  v_r := jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'presets', v_n, 'locked', v_locked);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_to, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

-- ── §4 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_setup_slot_buy';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_setup_slot_buy', 'p_slot integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-02-28 (lane/c-hero-sinks): MONEY (a gold sink) - this hero''s next setup slot at the rung the server prices; refuses quote_changed and setup_slots_max; one key charges once');

-- ── §5 THE WORDS ARE THE CLIENT'S: this file answers codes and numbers (src/data/refusal-words.js, src/shell/setup-words.js). ─

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Every number comes from the row: Tyler may move free or the prices with one row, and this must still pass.
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000901d5e11';
  v_free int; v_prices bigint[]; v_lim int; v jsonb; v_gold bigint; v_rows int; i int; f text; v_role text; v_new int;
  k1 constant uuid := '000000c0-0000-4000-a000-0000901d5e21';
begin
  select r.free, r.prices into v_free, v_prices from public.hr_sink_rules r where r.sink_id = 'setup_slot';
  v_lim := public.hr_hunt_limit('presets');
  if v_free is null or v_free + cardinality(v_prices) <> v_lim then
    raise exception 'setup-slots §6: the row and the limit disagree'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'setup-slots §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6: hr_create_character refused: %', v; end if;
    insert into public.account_wallet (user_id, gold) values (v_u, 100000000) on conflict (user_id) do update set gold = excluded.gold;
    -- (a) a fresh hero: the free count; the tutorial's one save lands on number 0.
    v := public.hr_state_of(v_u, 0)->'setup_slots';
    if (v->>'count')::int <> v_free or (v->>'bought')::int <> 0 or (v->>'max')::int <> v_lim or (v->>'price')::bigint <> v_prices[1] then
      raise exception 'setup-slots §6(a): the section reads %', v; end if;
    v := public.hr_hunt_preset_save(0, 0, 'First', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(a): the first save answered %', v; end if;
    -- (b) THE FIRST NEW NUMBER PAST THE COUNT, BY EVERY VERB THAT CAN OPEN ONE: refused, with the numbers the words need, and no row.
    v_new := v_free;
    v := public.hr_hunt_preset_save(0, v_new, 'Past', gen_random_uuid());
    if v->>'error' is distinct from 'setup_locked' or (v->>'slots')::int <> v_free or (v->>'price')::bigint <> v_prices[1] then
      raise exception 'setup-slots §6(b): save answered %', v; end if;
    v := public.hr_action_set_put(0, v_new, 'Past', '[]'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'setup_locked' then raise exception 'setup-slots §6(b): put answered %', v; end if;
    v := public.hr_action_set_options(0, v_new, '{"slots": []}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'setup_locked' then raise exception 'setup-slots §6(b): options answered %', v; end if;
    v := public.hr_action_set_rename(0, v_new, 'Past', gen_random_uuid());
    if v->>'error' is distinct from 'setup_locked' then raise exception 'setup-slots §6(b): rename answered %', v; end if;
    if exists (select 1 from public.player_action_sets a where a.user_id = v_u and a.slot = 0 and a.preset = v_new)
       or exists (select 1 from public.player_hunt_presets p where p.user_id = v_u and p.slot = 0 and p.preset = v_new) then
      raise exception 'setup-slots §6(b): a refused verb left a row'; end if;
    -- (c) A STALE OR FORGED PRICE: quote_changed, nothing charged, nothing opened. A price of nothing doesn't reach the quote.
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    v := public.hr_setup_slot_buy(0, v_prices[1] + 1, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' then raise exception 'setup-slots §6(c): a forged price answered %', v; end if;
    v := public.hr_setup_slot_buy(0, 0, gen_random_uuid());
    if v->>'error' is distinct from 'bad_quote' then raise exception 'setup-slots §6(c): a zero price answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold or public.hr_setups_of(v_u, 0) <> v_free then
      raise exception 'setup-slots §6(c): a refused purchase moved something'; end if;
    -- (d) THE PURCHASE AND ITS REPLAY: one charge, one journal row of kind shop, one rung.
    v := public.hr_setup_slot_buy(0, v_prices[1], k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(d): the purchase answered %', v; end if;
    v := public.hr_setup_slot_buy(0, v_prices[1], k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(d): the replay answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold - v_prices[1] then
      raise exception 'setup-slots §6(d): the charge is not exactly the price, once'; end if;
    select count(*)::int into v_rows from public.player_ledger l
     where l.user_id = v_u and l.slot = 0 and l.kind = 'shop' and l.intent = 'setup_slot_buy:' || v_prices[1] and l.gold = -v_prices[1];
    if v_rows <> 1 then raise exception 'setup-slots §6(d): % journal rows for one purchase', v_rows; end if;
    if public.hr_setups_of(v_u, 0) <> v_free + 1 then raise exception 'setup-slots §6(d): the rung did not move once'; end if;
    v := public.hr_hunt_preset_save(0, v_new, 'Bought', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(d): the bought number answered %', v; end if;
    -- (e) TO THE TOP: the rest of the ladder, then nothing to buy, and nothing charged.
    for i in 2 .. cardinality(v_prices) loop
      v := public.hr_setup_slot_buy(0, v_prices[i], gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(e): rung % answered %', i, v; end if;
    end loop;
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    v := public.hr_setup_slot_buy(0, v_prices[cardinality(v_prices)], gen_random_uuid());
    if v->>'error' is distinct from 'setup_slots_max' or (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold
       or public.hr_setups_of(v_u, 0) <> v_lim or (public.hr_setup_slots_view(v_u, 0))->'price' is distinct from 'null'::jsonb then
      raise exception 'setup-slots §6(e): past the top answered %', v; end if;
    -- (f) PER HERO: the purse is the account's, the slots are not. A saved setup past the count is never blocked; deleted, its number is new again.
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(f): the second hero refused: %', v; end if;
    if public.hr_setups_of(v_u, 1) <> v_free then raise exception 'setup-slots §6(f): another hero''s count moved'; end if;
    insert into public.player_hunt_presets (user_id, slot, preset, name, action_set, gear, restock)
      values (v_u, 1, v_lim - 1, 'Saved before', v_lim - 1, '{}'::jsonb, '{}'::jsonb);
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values (v_u, 1, v_lim - 1, 'Saved before', '[]'::jsonb, '{}'::jsonb);
    v := public.hr_hunt_preset_save(1, v_lim - 1, 'Saved over', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(f): saving over a kept setup answered %', v; end if;
    v := public.hr_action_set_options(1, v_lim - 1, '{"slots": []}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(f): a kept setup''s bar answered %', v; end if;
    -- (g) A COPY brings only what the target may hold, says how many it left, and keeps the bar of a setup the target saved.
    v := public.hr_action_set_copy(0, 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (v->>'locked')::int <> (select count(*)::int from public.player_action_sets a
         where a.user_id = v_u and a.slot = 0 and a.preset >= v_free and a.preset <> v_lim - 1) then
      raise exception 'setup-slots §6(g): the copy answered %', v; end if;
    if exists (select 1 from public.player_action_sets a where a.user_id = v_u and a.slot = 1 and a.preset >= v_free and a.preset <> v_lim - 1) then
      raise exception 'setup-slots §6(g): a copy opened a number past the count'; end if;
    if not exists (select 1 from public.player_action_sets a where a.user_id = v_u and a.slot = 1 and a.preset = v_lim - 1) then
      raise exception 'setup-slots §6(g): a copy took the bar from a saved setup'; end if;
    -- (h) moving the row is one row, and every number follows it.
    update public.player_hunt_active set action_set = 0 where user_id = v_u and slot = 1;
    v := public.hr_hunt_preset_delete(1, v_lim - 1, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'setup-slots §6(h): the delete answered %', v; end if;
    v := public.hr_hunt_preset_save(1, v_lim - 1, 'Again', gen_random_uuid());
    if v->>'error' is distinct from 'setup_locked' and v_free < v_lim then raise exception 'setup-slots §6(h): a deleted number past the count answered %', v; end if;
    raise exception using errcode = 'HR933', message = 'setup-slots §6 complete - rolling back';
  exception when sqlstate 'HR933' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'setup-slots §6: LEAKED a probe row'; end if;
  -- (i) GRANTS: the verb is the client's; nothing else here is.
  foreach f in array array['public.hr_setups_bought(uuid,integer)', 'public.hr_setups_of(uuid,integer)', 'public.hr_setup_slots_view(uuid,integer)',
                           'public.hr_setup_locked(uuid,integer,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'setup-slots §6(i): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  if has_function_privilege('anon', 'public.hr_setup_slot_buy(integer,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_setup_slot_buy(integer,bigint,uuid)', 'execute') then
    raise exception 'setup-slots §6(i): the verb''s grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'setup-slots: free then bought up to the limit, a new number past the count refused by every verb, a saved setup never blocked, one key charges once; all green';
end $chk$;
