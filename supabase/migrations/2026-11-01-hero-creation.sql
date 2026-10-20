-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CREATING A HERO (Tyler 2026-10-20: "Creating a hero opens a
-- short step: type a name, pick colours for Head, Body, Legs and Feet, see the
-- hero update as you pick. The hero enters town only after you confirm. No
-- more 'Tester (2)'."). STAGED (lane/b-hero-creation). Game CLOSED: applies on
-- its passing §4; Security reviews it in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 player_outfits.base_colors: the standard hero's four recolour regions
--    (head / body / legs / feet -> a dye index of hr_outfit_dyes). Cosmetic.
-- §2 hr_outfit_view RESTATED WHOLE from 2026-10-25-character-sheet.sql with one
--    key added: 'base' (the base colours). The `outfit` section carries it.
-- §3 hr_create_hero(p_slot, p_name, p_colors, p_idem): ONE intent that creates
--    the character (hr_create_character: the slot entitlement, the rate
--    budgets, the start kit), claims its name (the hr_character_name_set
--    rules: hr_validate_display_name, unique by canonical, never another
--    account's display name) and stores its colours, all or nothing. An
--    existing UNNAMED character (made before this file) is named by it; a
--    named one refuses (`already_created`: a rename is hr_character_name_set).
-- §4 hr_load RESTATED WHOLE from 2026-08-11-apply-engine.sql (+ the closed-mode
--    splice): a character with no claimed name does not enter the world. It
--    answers { ok:false, error:'needs_name', hero_slots, account } (the roster
--    still learns the owned slots and the concurrency limit), and the client
--    sends the player to the creation step.
-- §5 the client RPC baseline gains hr_create_hero.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No value moves that hr_create_character did not already move (the start kit,
-- once per character, under its own lock and 6/hour budget). The name is the
-- same server-validated, collision-safe claim as hr_character_name_set; the
-- colours are dye indices checked against hr_outfit_dyes and exactly the four
-- regions. A name collision rolls the whole creation back (subtransaction), so
-- a refused name never leaves a kit-holding unnamed character behind.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_create_hero and its baseline row; re-apply hr_load from
-- 2026-08-11-apply-engine.sql then 2026-10-22-closed-mode-ungated-rpcs.sql §1,
-- and hr_outfit_view from 2026-10-25-character-sheet.sql; the column is inert.
-- ORDER: after 2026-11-01-hero-kit-catalogue.generated.sql and
-- 2026-11-01-hunt-sessions-catalogue.generated.sql; last. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_validate_display_name(text)') is null
     or to_regprocedure('public.hr_canon_display_name(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_account_view(uuid,integer)') is null
     or to_regprocedure('public.hr_access_check()') is null
     or to_regclass('public.character_names') is null or to_regclass('public.player_outfits') is null
     or to_regclass('public.hr_outfit_dyes') is null or not exists (select 1 from public.hr_outfit_dyes) then
    raise exception 'PRECONDITION: the character, the names, the outfits and their dyes, or the account view are absent'; end if;
  -- The practice kit is in the start kit (2026-11-01-hero-kit-catalogue.generated.sql).
  if not exists (select 1 from public.hr_start_equipment where item_id = 'practice_sword') then
    raise exception 'PRECONDITION: apply 2026-11-01-hero-kit-catalogue.generated.sql first'; end if;
  -- hr_load: the closed-mode wrapper over hr_state_of, or this file's own image.
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_load(integer)'::regprocedure;
  if strpos(v_src, 'needs_name') = 0
     and (strpos(v_src, 'perform public.hr_access_check();') = 0
          or strpos(v_src, 'return public.hr_state_of(v_uid, coalesce(p_slot, 0));') = 0
          or length(v_src) > 2200) then
    raise exception 'PIN: hr_load is not the closed-mode wrapper this file restates'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_outfit_view(uuid,integer)'::regprocedure;
  if strpos(v_src, 'base_colors') = 0 and strpos(v_src, '''owned'', to_jsonb(v_owned))') = 0 then
    raise exception 'PIN: hr_outfit_view is not the 2026-10-25-character-sheet.sql body'; end if;
end $mig$;

-- ── §1 THE BASE COLOURS ──────────────────────────────────────────────────────
alter table public.player_outfits add column if not exists base_colors jsonb not null default '{}'::jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_outfits'::regclass and conname = 'player_outfits_base_colors_ck') then
    alter table public.player_outfits add constraint player_outfits_base_colors_ck
      check (jsonb_typeof(base_colors) = 'object' and octet_length(base_colors::text) <= 128);
  end if;
end $mig$;
comment on column public.player_outfits.base_colors is
  '2026-11-01 hero creation: the standard hero''s recolour regions (head/body/legs/feet -> hr_outfit_dyes.idx). Cosmetic. Written by hr_create_hero.';

-- The four regions of the standard hero, in picker order (src/data/outfits.js BASE_REGIONS;
-- tests/hero-creation.mjs holds the two equal).
create or replace function public.hr_base_regions()
returns text[] language sql immutable set search_path = public, pg_catalog as $$
  select array['head', 'body', 'legs', 'feet']::text[]
$$;
revoke execute on function public.hr_base_regions() from public, anon, authenticated, service_role;

-- Valid base colours: exactly the four regions, each a dye index. Null = valid.
create or replace function public.hr_base_colors_problem(p_colors jsonb)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
declare v_k text; v_v jsonb;
begin
  if p_colors is null or jsonb_typeof(p_colors) <> 'object' then return 'bad_colors'; end if;
  if (select count(*) from jsonb_object_keys(p_colors)) <> cardinality(public.hr_base_regions()) then return 'bad_colors'; end if;
  for v_k, v_v in select key, value from jsonb_each(p_colors) loop
    if not (v_k = any (public.hr_base_regions())) then return 'bad_region'; end if;
    if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,3}$'
       or not exists (select 1 from public.hr_outfit_dyes d where d.idx = (v_v #>> '{}')::int) then
      return 'bad_dye'; end if;
  end loop;
  return null;
end $$;
revoke execute on function public.hr_base_colors_problem(jsonb) from public, anon, authenticated, service_role;

-- ── §2 THE `outfit` SECTION, + 'base' ────────────────────────────────────────
create or replace function public.hr_outfit_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_owned text[] := public.hr_outfit_owned(p_user, p_slot); v_po public.player_outfits%rowtype;
begin
  select * into v_po from public.player_outfits where user_id = p_user and slot = p_slot;
  if v_po.outfit_id is not null and not (v_po.outfit_id = any (v_owned)) then v_po.outfit_id := null; end if;
  return jsonb_build_object(
    'worn', v_po.outfit_id,
    'colors', case when v_po.outfit_id is null then '{}'::jsonb else coalesce(v_po.colors, '{}'::jsonb) end,
    'owned', to_jsonb(v_owned),
    -- the standard hero's colours (2026-11-01-hero-creation.sql), {} until chosen
    'base', coalesce(v_po.base_colors, '{}'::jsonb));
end $$;

-- ── §3 THE ONE CREATION INTENT ───────────────────────────────────────────────
create or replace function public.hr_create_hero(p_slot int, p_name text, p_colors jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'create_hero';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_ok   jsonb;
  v_name text;
  v_canon text;
  v_bad  text;
  v_created boolean;
begin
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_ok := public.hr_validate_display_name(p_name);
  if coalesce(v_ok->>'ok', '') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name', 'reason', v_ok->>'reason')); end if;
  v_name := v_ok->>'name'; v_canon := v_ok->>'canonical';
  v_bad := public.hr_base_colors_problem(p_colors);
  if v_bad is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_bad)); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- The cosmetic bucket (20/min); the kit's own 6/hour creation budget is hr_create_character's.
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  -- One creation per (account, slot) at a time; hr_create_character takes its own lock inside.
  perform pg_advisory_xact_lock(hashtextextended('hr_create_hero:' || v_uid::text || ':' || p_slot::text, 0));
  if exists (select 1 from public.character_names where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_created')); end if;
  -- The hr_character_name_set rule: unique among characters, and never ANOTHER account's display name.
  if exists (select 1 from public.character_names n where n.canonical = v_canon)
     or exists (select 1 from public.profiles pr where pr.id <> v_uid and pr.display_name is not null
                  and public.hr_canon_display_name(pr.display_name) = v_canon) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;

  -- ALL OR NOTHING: the block is a subtransaction, so a name lost to a concurrent claim unwinds the
  -- character and its kit with it.
  begin
    v_r := public.hr_create_character(p_slot);
    if coalesce(v_r->>'ok', '') <> 'true' then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', coalesce(v_r->>'error', 'refused')));
    end if;
    v_created := coalesce((v_r->>'created')::boolean, false);
    insert into public.character_names (user_id, slot, name, canonical, updated_at)
      values (v_uid, p_slot, v_name, v_canon, now());
    insert into public.player_outfits (user_id, slot, outfit_id, colors, base_colors, updated_at)
      values (v_uid, p_slot, null, '{}'::jsonb, p_colors, now())
    on conflict (user_id, slot) do update set base_colors = excluded.base_colors, updated_at = now();
  exception when unique_violation then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;

  v_r := jsonb_build_object('ok', true, 'slot', p_slot, 'name', v_name, 'created', v_created);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_create_hero(int, text, jsonb, uuid) from public;
revoke execute on function public.hr_create_hero(int, text, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_create_hero(int, text, jsonb, uuid) to authenticated;

-- ── §4 hr_load: NO NAME, NO WORLD ────────────────────────────────────────────
create or replace function public.hr_load(p_slot int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC
  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'load', 180, interval '1 minute') then
    -- (C2) A read path; three loads a second sustained is a poller. (S6) Sampled.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'load', 'rate_limited',
        jsonb_build_object('limit', 180, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- A CHARACTER ENTERS THE WORLD ONLY WITH A CLAIMED NAME (2026-11-01-hero-creation.sql):
  -- the answer still names the owned slots and the account limit, which the roster reads.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = coalesce(p_slot, 0))
     and not exists (select 1 from public.character_names where user_id = v_uid and slot = coalesce(p_slot, 0)) then
    return jsonb_build_object('ok', false, 'error', 'needs_name', 'slot', coalesce(p_slot, 0),
      'hero_slots', public.hr_hero_slots_of(v_uid), 'account', public.hr_account_view(v_uid, coalesce(p_slot, 0)));
  end if;
  return public.hr_state_of(v_uid, coalesce(p_slot, 0));
end $$;
revoke execute on function public.hr_load(int) from public, anon, service_role;
grant execute on function public.hr_load(int) to authenticated;

-- ── §5 THE CLIENT RPC BASELINE ───────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_create_hero';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_create_hero', 'p_slot integer, p_name text, p_colors jsonb, p_idem uuid', 'authenticated',
   'added 2026-11-01: create a hero with its name and base colours, all or nothing; the kit is hr_create_character''s');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-0000c4ea0001';
  v_b constant uuid := '000000c0-0000-0000-0000-0000c4ea0002';
  k   constant text := '000000c0-0000-4000-a000-0000c4ea';
  c_ok constant jsonb := '{"head": 1, "body": 2, "legs": 3, "feet": 4}';
  v jsonb; v_n1 text; v_n2 text; v_missing text;
begin
  loop
    v_n1 := 'Zh' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n1));
  end loop;
  loop
    v_n2 := 'Zk' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when v_n2 <> v_n1 and not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n2));
  end loop;
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'hero-creation §6')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'hero-creation §6 probe'), (v_b, 'hero-creation §6 probe')
      on conflict (user_id) do nothing;

    -- (a) the happy path: one intent, a named hero with its colours and the whole practice kit.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_hero(0, v_n1, c_ok, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'name' <> v_n1 or coalesce(v->>'created', '') <> 'true' then
      raise exception 'VERIFY(a): hr_create_hero answered %', v; end if;
    if public.hr_character_name(v_a, 0) <> v_n1 then raise exception 'VERIFY(a): the name was not claimed'; end if;
    if public.hr_outfit_view(v_a, 0)->'base' <> c_ok then raise exception 'VERIFY(a): the colours read %', public.hr_outfit_view(v_a, 0); end if;
    select string_agg(x, ',') into v_missing from unnest(array['practice_sword', 'practice_shield', 'practice_hatchets',
        'practice_club', 'practice_wand', 'practice_spellbook', 'practice_bow', 'practice_crossbow', 'practice_staff']) x
     where not exists (select 1 from public.player_inventory i where i.user_id = v_a and i.slot = 0 and i.item_id = x and i.qty > 0)
       and not exists (select 1 from public.player_equipment e where e.user_id = v_a and e.slot = 0 and e.item_id = x);
    if v_missing is not null then raise exception 'VERIFY(a): the kit lacks %', v_missing; end if;
    if exists (select 1 from public.hr_items where item_id like 'practice\_%' and (value <> 0 or tradeable)) then
      raise exception 'VERIFY(a): a practice item sells or trades'; end if;
    v := public.hr_load(0);
    if coalesce(v->>'ok', '') <> 'true' or v->>'name' is distinct from v_n1 then raise exception 'VERIFY(a): hr_load of a named hero answered %', left(v::text, 200); end if;
    -- the same intent replays its answer; a second creation refuses.
    v := public.hr_create_hero(0, v_n1, c_ok, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the replay answered %', v; end if;
    v := public.hr_create_hero(0, v_n2, c_ok, (k || '0002')::uuid);
    if v->>'error' is distinct from 'already_created' then raise exception 'VERIFY(a): a second creation answered %', v; end if;

    -- (b) refusals create nothing: a taken name, bad colours, a bad name.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_hero(0, v_n1, c_ok, (k || '0003')::uuid);
    if v->>'error' is distinct from 'name_taken' then raise exception 'VERIFY(b): a taken name answered %', v; end if;
    v := public.hr_create_hero(0, v_n2, '{"head": 1, "body": 2, "legs": 3}', (k || '0004')::uuid);
    if v->>'error' is distinct from 'bad_colors' then raise exception 'VERIFY(b): three regions answered %', v; end if;
    v := public.hr_create_hero(0, v_n2, '{"head": 1, "body": 2, "legs": 3, "hat": 4}', (k || '0005')::uuid);
    if v->>'error' is distinct from 'bad_region' then raise exception 'VERIFY(b): an unknown region answered %', v; end if;
    v := public.hr_create_hero(0, v_n2, '{"head": 1, "body": 2, "legs": 3, "feet": 999}', (k || '0006')::uuid);
    if v->>'error' is distinct from 'bad_dye' then raise exception 'VERIFY(b): an unknown dye answered %', v; end if;
    v := public.hr_create_hero(0, '', c_ok, (k || '0007')::uuid);
    if v->>'error' is distinct from 'bad_name' then raise exception 'VERIFY(b): an empty name answered %', v; end if;
    if exists (select 1 from public.player_state where user_id = v_b) then raise exception 'VERIFY(b): a refusal made a character'; end if;

    -- (c) an UNNAMED character (the old door) does not enter the world until it is named.
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', v; end if;
    v := public.hr_load(0);
    if v->>'error' is distinct from 'needs_name' or jsonb_typeof(v->'hero_slots') <> 'array' then
      raise exception 'VERIFY(c): hr_load of an unnamed hero answered %', left(v::text, 200); end if;
    v := public.hr_create_hero(0, v_n2, c_ok, (k || '0008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'false' then raise exception 'VERIFY(c): naming it answered %', v; end if;
    v := public.hr_load(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_load after naming answered %', left(v::text, 200); end if;

    raise exception using errcode = 'HR885', message = 'hero-creation §6 complete - rolling back';
  exception when sqlstate 'HR885' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) then raise exception 'VERIFY(d): §6 LEAKED a probe row'; end if;
  if not has_function_privilege('authenticated', 'public.hr_create_hero(integer,text,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_create_hero(integer,text,jsonb,uuid)', 'execute') then
    raise exception 'VERIFY(d): hr_create_hero''s grant is not authenticated-only'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-creation: one intent names, colours and kits a hero; refusals create nothing; no name, no world; all green';
end $$;
