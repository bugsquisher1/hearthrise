-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — PER-HERO HUNT SETTINGS IN ONE OPTIONS JSONB (lane S1;
-- HUNT_SCREEN_SPEC §3.7, §1.3 "Settings storage"; architecture contracts S4
-- finished). STAGED. Game CLOSED: applies on its passing §4; Security reviews
-- it in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- An action set is keyed (user_id, slot, preset), so "per hero" is per
-- character. It is now:
--   slots    the BAR: up to hr_hunt_limit('slots') ability ids, in fire order
--            (hunts are idle, Tyler 2026-10-16: the bar is configuration — the
--            C2 conditional supply slots and manual presses are retired). Each
--            id must be a hr_hunt_abilities row (abilities.js); the settle uses
--            the ones the hero's discipline can cast and, when none, the
--            discipline's own order (src/core/hunt-spawn.js heroSetup).
--   options  ONE jsonb object of the hero's settings, every key a generated
--            hr_hunt_set_options row (hunt-sessions.js ACTION_SET_OPTIONS):
--            action_set, target_mode, stance, distance (1-8), chase, role (a
--            staff's Mage / Healer), food_below_pct, drink_below_pct,
--            supply_source, on_empty, gold_floor. A key is validated by its
--            row's kind — target (hr_hunt_target_modes), limit (inside its
--            `<limit>_min`/`_max` pair, whole), enum (one of `vals`), bool —
--            REFUSED, never clamped. A key sent as null is REMOVED (back to its
--            default: the role's for target_mode / stance / distance / chase,
--            the data default for the rest). A new option is a ROW, never a
--            body edit, a new column or a new client-baseline row.
-- The five C2 option COLUMNS (target_mode, pull_count, gold_floor,
-- supply_source, on_empty) are read by the C2 settle until
-- 2026-10-23-hunt-world-state.sql replaces it and drops them (no back-compat,
-- CLAUDE.md §1: the wipe deletes every action set).
--
-- RESTATED WHOLE (the C1/C2 bodies, minus the retired bar): hr_action_set_put
-- (the bar check), hr_action_set_options (writes `options`), hr_hunt_set_preset
-- (no presses to drop). NEW: hr_hunt_bar_check, hr_hunt_settings_view + the
-- `hunt_settings` envelope section. DROPPED with their baseline rows:
-- hr_hunt_use (the manual press) and hr_hunt_slots_check (the slot language).
-- Signatures, grants and client baseline rows of the three restated verbs are
-- unchanged.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Narrows: two client-callable verbs leave; every stored value is a catalogue
-- row or inside a generated range; nothing here moves gold, items or XP. An
-- option changes how a hero fights, and the settle reads it from this row only.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the three bodies from 2026-10-21-hunt-sessions.sql /
-- 2026-10-22-hunt-sessions-settle.sql §4d and hr_hunt_use / hr_hunt_slots_check
-- with their baseline rows; drop the options column, hr_hunt_bar_check and the
-- section row. Requires the retired catalogue tables, dropped later by
-- 2026-10-23-hunt-world-state.sql.
-- ORDER: after 2026-10-23-premium-login-reward.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_abilities') is null or not exists (select 1 from public.hr_hunt_abilities) then
    raise exception 'PRECONDITION: no hr_hunt_abilities — apply 2026-10-23-hunt-sessions-catalogue.generated.sql first';
  end if;
  if not exists (select 1 from public.hr_hunt_set_options where opt = 'distance' and kind = 'limit')
     or not exists (select 1 from public.hr_hunt_set_options where opt = 'chase' and kind = 'bool') then
    raise exception 'PRECONDITION: the S1 option rows are absent — apply the S1 catalogue first';
  end if;
  if to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-character-premium.sql first (the section registry)';
  end if;
end $mig$;

-- ── §1 THE OPTIONS COLUMN ────────────────────────────────────────────────────
alter table public.player_action_sets add column if not exists options jsonb not null default '{}'::jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_action_sets_options_ck'
                   and conrelid = 'public.player_action_sets'::regclass) then
    alter table public.player_action_sets add constraint player_action_sets_options_ck
      check (jsonb_typeof(options) = 'object' and octet_length(options::text) <= 2048);
  end if;
end $mig$;
comment on column public.player_action_sets.options is
  '2026-10-23 (lane S1). The hero''s hunt settings, one object; every key a hr_hunt_set_options row, '
  'written only by hr_action_set_options (refused, never clamped).';

-- ── §2 THE BAR CHECK ─────────────────────────────────────────────────────────
-- {ok:true, slots} with the bar in canonical form (distinct ability ids, in
-- order), or {ok:false, error:'bad_slots', why, at}.
create or replace function public.hr_hunt_bar_check(p_slots jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_max int := public.hr_hunt_limit('slots');
  v_out jsonb := '[]'::jsonb; v_e jsonb; v_i int := 0;
  bad constant text := 'bad_slots';
begin
  if v_max is null then return jsonb_build_object('ok', false, 'error', bad, 'why', 'catalogue_missing'); end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', bad, 'why', 'not_an_array'); end if;
  if jsonb_array_length(p_slots) > v_max then
    return jsonb_build_object('ok', false, 'error', bad, 'why', 'too_many_slots', 'max', v_max); end if;
  for v_e in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_e) <> 'string' or not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_e #>> '{}') then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'unknown_ability', 'at', v_i); end if;
    if v_out @> jsonb_build_array(v_e) then
      return jsonb_build_object('ok', false, 'error', bad, 'why', 'duplicate_ability', 'at', v_i); end if;
    v_out := v_out || jsonb_build_array(v_e);
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('ok', true, 'slots', v_out);
end $$;
revoke execute on function public.hr_hunt_bar_check(jsonb) from public, anon, authenticated, service_role;

-- ── §3 THE THREE VERBS, RESTATED WHOLE ───────────────────────────────────────
-- C1's verb shape: identity -> slot -> idempotency replay -> rate gate -> input
-- -> lock -> state -> write -> stored result. A refusal is noted
-- (hr_note_rejection) and never consumes the key.
create or replace function public.hr_action_set_put(p_slot int, p_preset int, p_name text, p_slots jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
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
end $$;

create or replace function public.hr_action_set_options(p_slot int, p_preset int, p_opts jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
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
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    v_v := p_opts->v_k;
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

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, 'Preset ' || (p_preset + 1), '[]'::jsonb, (v_set - v_del), now())
    on conflict (user_id, slot, preset) do update set options = (a.options - v_del) || v_set, updated_at = now();
  select jsonb_build_object('ok', true, 'preset', p_preset, 'options', a.options) into v_r
    from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_set_preset(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_set_preset';
  c_slack_ms constant bigint := 20000;
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
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
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  -- Preset 0 always exists (the defaults); any other must have been saved.
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a
                                    where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  update public.hunt_sessions set preset = p_preset, version = version + 1 where id = v_s.id;
  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_action_set_put(int, int, text, jsonb, uuid) from public;
revoke execute on function public.hr_action_set_put(int, int, text, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_action_set_put(int, int, text, jsonb, uuid) to authenticated;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from public;
revoke execute on function public.hr_action_set_options(int, int, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_action_set_options(int, int, jsonb, uuid) to authenticated;
revoke execute on function public.hr_hunt_set_preset(int, int, uuid) from public;
revoke execute on function public.hr_hunt_set_preset(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_set_preset(int, int, uuid) to authenticated;

-- ── §4 THE RETIRED C2 BAR VERBS ──────────────────────────────────────────────
-- Hunts are idle (Tyler 2026-10-16): no manual press, no slot language.
drop function if exists public.hr_hunt_use(int, int, uuid);
drop function if exists public.hr_hunt_slots_check(jsonb);
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_use';
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-23 (lane S1): the bar is up to `slots` ability ids (hr_hunt_abilities), in fire order; was C1''s conditional supply slots'
 where proname = 'hr_action_set_put' and grantee = 'authenticated';
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-23 (lane S1): the hero''s settings as ONE options jsonb, every key a hr_hunt_set_options row (target / limit / enum / bool), refused not clamped; null removes a key'
 where proname = 'hr_action_set_options' and grantee = 'authenticated';

-- ── §5 THE `hunt_settings` SECTION ───────────────────────────────────────────
-- The settings of the preset the character hunts with (the open session's, or
-- preset 0): its bar and its stored options. Absent keys read their defaults
-- at the settle; the view shows only what the player set.
create or replace function public.hr_hunt_settings_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  with p as (select coalesce((select h.preset from public.hunt_sessions h
                               where h.user_id = p_user and h.slot = p_slot and h.ended_at is null), 0) as preset)
  select jsonb_build_object('preset', p.preset,
           'bar', coalesce(a.slots, '[]'::jsonb), 'options', coalesce(a.options, '{}'::jsonb))
    from p left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p.preset
$$;
revoke execute on function public.hr_hunt_settings_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_settings', 'hr_hunt_settings_view', '2026-10-23-hunt-settings-options.sql: the running preset''s bar and options')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-0000-0000-00005e1a0003';
  v     jsonb;
  v_n   int := 0;
  v_role text;
  v_case record;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-settings-options §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) every option row's kind, accepted and stored.
    v := public.hr_action_set_options(0, 0, jsonb_build_object('action_set', 'boss', 'target_mode', 'highest_pct',
           'stance', 'defensive', 'distance', 8, 'chase', false, 'role', 'healer', 'food_below_pct', 40,
           'drink_below_pct', 25, 'supply_source', 'store', 'on_empty', 'end', 'gold_floor', 0),
           '000000c0-0000-4000-a000-00005e1a0301');
    if coalesce(v->>'ok', '') <> 'true' or v->'options'->>'distance' <> '8' or v->'options'->'chase' <> 'false'::jsonb
       or v->'options'->>'target_mode' <> 'highest_pct' then
      raise exception 'VERIFY(a): a full option set answered %', v; end if;
    -- (b) refused, never clamped, by name: out of range, unknown key, wrong type, unknown enum.
    for v_case in select * from (values
        ('{"distance": 9}'::jsonb, 'bad_distance'), ('{"distance": 0}'::jsonb, 'bad_distance'),
        ('{"distance": 2.5}'::jsonb, 'bad_distance'), ('{"pull_count": 3}'::jsonb, 'bad_option'),
        ('{"chase": "yes"}'::jsonb, 'bad_chase'), ('{"stance": "berserk"}'::jsonb, 'bad_stance'),
        ('{"target_mode": "loudest"}'::jsonb, 'bad_target_mode'), ('{"food_below_pct": 100}'::jsonb, 'bad_food_below_pct'),
        ('{"on_empty": "pray"}'::jsonb, 'bad_on_empty')) c(opts, err) loop
      v_n := v_n + 1;
      v := public.hr_action_set_options(0, 0, v_case.opts, ('000000c0-0000-4000-a000-00005e1a04' || lpad(v_n::text, 2, '0'))::uuid);
      if v->>'error' is distinct from v_case.err then
        raise exception 'VERIFY(b): % answered % (expected %)', v_case.opts, v, v_case.err; end if;
    end loop;
    if (select options->>'distance' from public.player_action_sets where user_id = v_uid and slot = 0 and preset = 0) <> '8' then
      raise exception 'VERIFY(b): a refused option moved the stored value'; end if;
    -- (c) null removes a key (back to its default); the rest stay.
    v := public.hr_action_set_options(0, 0, '{"distance": null}'::jsonb, '000000c0-0000-4000-a000-00005e1a0390');
    if v->'options' ? 'distance' or not (v->'options' ? 'stance') then
      raise exception 'VERIFY(c): a null did not remove the key alone: %', v; end if;
    -- (d) a NEW option is a row, not a body edit: a probe row is accepted by the unchanged body.
    insert into public.hr_hunt_set_options (opt, kind, limit_key, vals) values ('probe_flag', 'bool', null, null);
    v := public.hr_action_set_options(0, 0, '{"probe_flag": true}'::jsonb, '000000c0-0000-4000-a000-00005e1a0391');
    if coalesce(v->>'ok', '') <> 'true' or v->'options'->'probe_flag' <> 'true'::jsonb then
      raise exception 'VERIFY(d): a new option row was not accepted by the body: %', v; end if;
    -- (e) the bar: ability ids only, no duplicates, at most `slots`.
    v := public.hr_action_set_put(0, 0, 'Hunt', '["power_strike", "cleave"]'::jsonb, '000000c0-0000-4000-a000-00005e1a0392');
    if coalesce(v->>'ok', '') <> 'true' or v->'slots' <> '["power_strike", "cleave"]'::jsonb then
      raise exception 'VERIFY(e): a valid bar answered %', v; end if;
    v := public.hr_action_set_put(0, 0, 'Hunt', '["power_strike", "power_strike"]'::jsonb, '000000c0-0000-4000-a000-00005e1a0393');
    if v->>'why' is distinct from 'duplicate_ability' then raise exception 'VERIFY(e): a duplicate answered %', v; end if;
    v := public.hr_action_set_put(0, 0, 'Hunt', '[{"item": "*heal", "on": true, "conditions": []}]'::jsonb, '000000c0-0000-4000-a000-00005e1a0394');
    if v->>'why' is distinct from 'unknown_ability' then raise exception 'VERIFY(e): a C2 supply slot answered %', v; end if;
    -- (f) the section.
    v := public.hr_state_of(v_uid, 0);
    if v->'hunt_settings'->'bar' <> '["power_strike", "cleave"]'::jsonb or v->'hunt_settings'->'options'->>'stance' <> 'defensive' then
      raise exception 'VERIFY(f): the hunt_settings section is %', v->'hunt_settings'; end if;
    raise exception using errcode = 'HR858', message = 'hunt-settings-options §6 complete - rolling back';
  exception when sqlstate 'HR858' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from public.hr_hunt_set_options where opt = 'probe_flag') then
    raise exception 'VERIFY(g): §6 LEAKED a probe row'; end if;
  -- (h) the press and the slot language are gone; no client write path on the table.
  if to_regprocedure('public.hr_hunt_use(integer,integer,uuid)') is not null
     or to_regprocedure('public.hr_hunt_slots_check(jsonb)') is not null
     or exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_hunt_use') then
    raise exception 'VERIFY(h): a retired bar verb survives'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_action_sets', 'insert,update,delete') then
      raise exception 'VERIFY(h): % can write player_action_sets', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_hunt_bar_check(jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_settings_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % can execute a settings internal', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-settings-options: one options jsonb validated by catalogue rows (refused, never clamped, null resets), the bar is ability ids, the press is gone; all green';
end $$;
