-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — RENAME AND DELETE A SAVED SETUP; NAME THE ACTION SET (lane
-- b-presets-c4, systems-engineer, 2026-10-22; ruling C4, Tyler 2026-10-18:
-- "action sets (presets) need real save/name/rename/delete/switch UI").
-- STAGED, NOT APPLIED. Game CLOSED: applies on its passing §4; part of the
-- reopen Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- Saved setups (player_hunt_presets, 2026-10-25-hunt-presets.sql) could be
-- saved and used but never renamed or removed, and the action set on the bar
-- read "Preset 1" for ever (nothing could name it). Three verbs, each naming
-- only the caller's own slot, a small preset number and a name:
--   hr_hunt_preset_rename(slot, preset, name, idem)  an existing setup's name
--   hr_hunt_preset_delete(slot, preset, idem)        removes one setup; none left
--     is a valid state (the window says "No saved setups yet"). A setup is a
--     snapshot nothing runs on, so there is no active one to fall back from.
--   hr_action_set_rename(slot, preset, name, idem)   the action set's name (the
--     bar's plaque); a set with no row yet gets one with an empty bar and no
--     options, which reads exactly as no row (hr_action_set_options' precedent)
-- THE NAME RULE is the server's, in ONE place (hr_setup_name): whitespace runs
-- collapse, 1 to 24 characters, no control characters, nothing hr_name_blocked
-- refuses (the hero-name moderation list). Refused: `bad_preset_name`.
-- A setup or set name is only ever read by its owner (hr_hunt_presets_view and
-- hr_hunt_settings_view are owner sections; no party or social view reads it).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Moves no value: no gold, item, XP or count changes. Rate bucket `hunt`
-- (hr_rpc_gate), idempotency key per verb and preset (player_intents), the
-- character lock (hr_hunt_lock). RLS unchanged (owner read, no client write).
--
-- REVERSIBILITY: drop the four functions and the three baseline rows.
-- ORDER: after 2026-11-10-hunt-xp-split.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads; it restates no body) ───────────
do $mig$
begin
  if to_regclass('public.player_hunt_presets') is null or to_regclass('public.player_action_sets') is null then
    raise exception 'PIN: player_hunt_presets / player_action_sets are missing'; end if;
  if to_regprocedure('public.hr_name_blocked(text)') is null or to_regprocedure('public.hr_hunt_presets_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null then
    raise exception 'PIN: hr_name_blocked / hr_hunt_presets_view / hr_hunt_lock / hr_hunt_limit / hr_intent_replay are missing'; end if;
end $mig$;

-- ── §1 THE NAME RULE (internal) ──────────────────────────────────────────────
create or replace function public.hr_setup_name(p_name text)
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  -- PRESET-NAMES (2026-11-15-preset-names.sql): null = refused.
  if char_length(v) not between 1 and 24 or v ~ '[[:cntrl:]]' or public.hr_name_blocked(v) then return null; end if;
  return v;
end $$;
revoke execute on function public.hr_setup_name(text) from public, anon, authenticated, service_role;

-- ── §2 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_preset_rename(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'hunt_preset_rename:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_rename', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  update public.player_hunt_presets set name = v_name, updated_at = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  if not found then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  v_r := jsonb_build_object('ok', true, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_preset_delete(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_verb := 'hunt_preset_delete:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_delete', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  delete from public.player_hunt_presets where user_id = v_uid and slot = p_slot and preset = p_preset;
  if not found then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  v_r := jsonb_build_object('ok', true, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

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
  -- A name only: the bar, its options and a running hunt's presses are untouched.
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, v_name, '[]'::jsonb, '{}'::jsonb, now())
    on conflict (user_id, slot, preset) do update set name = excluded.name, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'name', v_name);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

revoke execute on function public.hr_hunt_preset_rename(int, int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_hunt_preset_delete(int, int, uuid) from public, anon, service_role;
revoke execute on function public.hr_action_set_rename(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_hunt_preset_rename(int, int, text, uuid) to authenticated;
grant  execute on function public.hr_hunt_preset_delete(int, int, uuid) to authenticated;
grant  execute on function public.hr_action_set_rename(int, int, text, uuid) to authenticated;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_hunt_preset_rename', 'hr_hunt_preset_delete', 'hr_action_set_rename');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_preset_rename', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-11-15: renames one of the caller''s own saved setups; the name rule is the server''s (hr_setup_name); moves no value'),
  ('hr_hunt_preset_delete', 'p_slot integer, p_preset integer, p_idem uuid', 'authenticated',
   'added 2026-11-15: removes one of the caller''s own saved setups; moves no value'),
  ('hr_action_set_rename', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-11-15: names one of the caller''s own action sets (the bar''s plaque); the bar and options untouched; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00000c4a0001', '000000c0-0000-0000-0000-00000c4a0002']::uuid[];
  v jsonb; v_i int; v_bar jsonb; v_t text;
begin
  begin
    for v_i in 1 .. 2 loop
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'preset-names §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): probe character % was not made', v_i; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_preset_save(0, 2, 'Cellar', '000000c0-0000-4000-a000-00000c4a0101');
    v := public.hr_hunt_preset_save(0, 5, 'Mill', '000000c0-0000-4000-a000-00000c4a0102');
    if jsonb_array_length(v->'hunt_presets') <> 2 then raise exception 'VERIFY(a): two saves answered %', v; end if;
    -- (a) RENAME PERSISTS: the answer and a fresh read of the envelope both carry the new name.
    v := public.hr_hunt_preset_rename(0, 2, '  Rat   cellar ', '000000c0-0000-4000-a000-00000c4a0103');
    if coalesce(v->>'ok', '') <> 'true' or v->'hunt_presets'->0->>'name' is distinct from 'Rat cellar' then
      raise exception 'VERIFY(a): rename answered %', v; end if;
    if public.hr_state_of(v_u[1], 0)->'hunt_presets'->0->>'name' is distinct from 'Rat cellar' then
      raise exception 'VERIFY(a): the re-read envelope does not carry the rename'; end if;
    -- (b) THE NAME RULE: empty, too long, a control character and a blocked word are refused; nothing changes.
    foreach v_t in array array['', repeat('a', 25), 'Rat' || chr(7), 'Sh1thead']::text[] loop
      v := public.hr_hunt_preset_rename(0, 2, v_t, gen_random_uuid());
      if v->>'error' is distinct from 'bad_preset_name' then raise exception 'VERIFY(b): name % answered %', quote_literal(v_t), v; end if;
    end loop;
    if (select name from public.player_hunt_presets where user_id = v_u[1] and slot = 0 and preset = 2) <> 'Rat cellar' then
      raise exception 'VERIFY(b): a refused name changed the row'; end if;
    -- (c) a setup that does not exist is refused, for rename and delete.
    if public.hr_hunt_preset_rename(0, 6, 'Ghost', gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 6, gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 8, gen_random_uuid())->>'error' is distinct from 'bad_preset' then
      raise exception 'VERIFY(c): an unknown / out-of-range setup was taken'; end if;
    -- (d) A FOREIGN USER: the second account names the same slot and preset; the first account's rows never move.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    if public.hr_hunt_preset_rename(0, 2, 'Mine now', gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 5, gen_random_uuid())->>'error' is distinct from 'unknown_preset' then
      raise exception 'VERIFY(d): another account reached a setup it does not own'; end if;
    if (select count(*) from public.player_hunt_presets where user_id = v_u[1]) <> 2 then
      raise exception 'VERIFY(d): another account''s call changed the first account''s setups'; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    -- (e) DELETE: the row goes, the answer and the envelope agree; the same key replays the same answer.
    v := public.hr_hunt_preset_delete(0, 5, '000000c0-0000-4000-a000-00000c4a0104');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'hunt_presets') <> 1
       or jsonb_array_length(public.hr_state_of(v_u[1], 0)->'hunt_presets') <> 1 then
      raise exception 'VERIFY(e): delete answered %', v; end if;
    if public.hr_hunt_preset_delete(0, 5, '000000c0-0000-4000-a000-00000c4a0104') is distinct from v then
      raise exception 'VERIFY(e): the same key did not replay the answer'; end if;
    -- (f) THE LAST SETUP may go too: none left is the window's "No saved setups yet".
    v := public.hr_hunt_preset_delete(0, 2, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'hunt_presets' <> '[]'::jsonb then raise exception 'VERIFY(f): the last delete answered %', v; end if;
    -- (g) THE ACTION SET'S NAME: a set with no row gets one that reads as the same bar; the bar shows the name.
    v_bar := public.hr_state_of(v_u[1], 0)->'hunt_settings'->'slots';
    v := public.hr_action_set_rename(0, 0, 'Tank  bar', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->>'name' is distinct from 'Tank bar' then raise exception 'VERIFY(g): set rename answered %', v; end if;
    v := public.hr_state_of(v_u[1], 0)->'hunt_settings';
    if v->'presets'->0->>'name' is distinct from 'Tank bar' or v->'slots' is distinct from v_bar then
      raise exception 'VERIFY(g): the set reads % / % after a rename', v->'presets', v->'slots'; end if;
    if public.hr_action_set_rename(0, public.hr_hunt_limit('presets'), 'X', gen_random_uuid())->>'error' is distinct from 'bad_preset'
       or public.hr_action_set_rename(0, 0, '', gen_random_uuid())->>'error' is distinct from 'bad_preset_name' then
      raise exception 'VERIFY(g): an out-of-range set or empty name was taken'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_hunt_preset_rename(0, 2, 'X', gen_random_uuid())->>'error' is distinct from 'not_signed_in' then
      raise exception 'VERIFY(g): a signed-out rename was answered'; end if;
    raise exception using errcode = 'HR915', message = 'preset-names §4 complete - rolling back';
  exception when sqlstate 'HR915' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) then raise exception 'VERIFY(h): §4 LEAKED a probe row'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_preset_rename(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_preset_delete(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_action_set_rename(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_setup_name(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_preset_rename(integer,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(h): the grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'preset-names: rename persists, the name rule is the server''s, unknown and foreign refused, delete to none, the set''s name on the bar; all green';
end $$;
