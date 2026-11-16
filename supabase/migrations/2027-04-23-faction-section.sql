-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-23-faction-section.sql — THE FACTIONS REACH THE PAGE, BEHIND A SWITCH (lane/b-faction-ui, systems-engineer, 2026-11-14;
--   Tyler 2026-11-14, the First Flame and the Last Ember; the board's "2026-11-14 The Morrow Hills" §6; the server half is
--   2027-04-22-faction-standing.sql, which left "the read a page will use ... registered as a section by the client lane").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §4. ON THE EA SECURITY LIST with the faction verbs. ORDER: right after 2027-04-22-faction-standing.sql (§0 refuses
-- without it). EDGE: none. CLIENT: src/session/faction-sections.js reads the section, src/session/faction-intents.js sends the verbs.
--
-- ── WHAT IT DOES ─────────────────────────────────────────────────────────────
-- (1) THE SWITCH `factions`, seeded OFF (`on conflict do nothing`, so a re-apply never reverts the Coordinator's flip). Turning it on:
--       update public.hr_feature_switches set scope = 'testers', accounts = '{}', updated_at = now() where switch_id = 'factions';
-- (2) THE SECTION `factions` = hr_faction_section(user, slot): NULL while the switch is off for the account (the page then draws no
--     Faction tab and opens no join prompt), else hr_faction_view plus the two rule numbers a player acts on and the view leaves out:
--     swap_need_ms (the hunting time a swap takes) and cooldown_ms (the wait after a change of side). Every number is the server's.
-- (3) THE DOOR: hr_faction_locked, the shared half every faction verb runs under the hero's lock, RESTATED WHOLE with one refusal more,
--     feature_off, after the key's replay (a receipt answered before the switch went off still answers). A switch gates the door, never
--     a number: every verb's own checks still run when it is on (2027-03-21-feature-switches.sql's rule). The settle's credit is not
--     gated: standing moves only for a member, and nobody can become one while the switch is off.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- The settle reads every section: off, ONE primary-key read of hr_feature_switches per settle. On, hr_faction_view (a rule read, a
-- member read, the Krell count, two small aggregates over at most 2 standing rows, a day row and 6 pieces) and one rule read.
--
-- REVERSIBILITY: delete the section row, drop hr_faction_section, re-apply hr_faction_locked's pre-image (2027-04-22-faction-standing.sql
-- §4, this file's restatement less its FEATURE-SWITCH lines), delete the switch row. No player value moves with any of it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- hr_faction_locked is exactly 2027-04-22-faction-standing.sql's image, or this file's own (a second apply): md5 of pg_get_functiondef,
-- whitespace runs as one.
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_faction_view(uuid,integer)') is null or to_regprocedure('public.hr_faction_locked(text,uuid,integer,uuid,text)') is null
     or to_regclass('public.hr_faction_rule') is null then
    raise exception 'PRECONDITION: apply 2027-04-22-faction-standing.sql first'; end if;
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) and the section registry first'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_faction_locked(text,uuid,integer,uuid,text)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '5660ef047300cfe5005f81f2d7d24c73' and v_md5 is distinct from '221fcaeeb6a6a827ce5026a92cc69eb9' then
    raise exception 'PIN: hr_faction_locked is neither 2027-04-22-faction-standing.sql''s image nor this file''s: md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE SWITCH, OFF ───────────────────────────────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('factions', 'off', '2027-04-23-faction-section.sql: the First Flame and the Last Ember on the page (the `factions` section) and at the verbs (feature_off). Off until the Coordinator turns it on')
  on conflict (switch_id) do nothing;

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_faction_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v jsonb; r public.hr_faction_rule%rowtype;
begin
  if not public.hr_feature_on('factions', p_user) then return null; end if;
  v := public.hr_faction_view(p_user, p_slot);
  if v is null then return null; end if;
  select * into r from public.hr_faction_rule where id;
  return v || jsonb_build_object('swap_need_ms', r.swap_ms, 'cooldown_ms', r.cooldown_ms);
end $fn$;
revoke all on function public.hr_faction_section(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_faction_section(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('factions', 'hr_faction_section', '2027-04-23-faction-section.sql: this hero''s side, its swap, its standing per side and the pieces standing buys, while the `factions` switch is on for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE DOOR: hr_faction_locked RESTATED WHOLE, feature_off after the key ─
create or replace function public.hr_faction_locked(p_verb text, p_uid uuid, p_slot int, p_idem uuid, p_intent text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_r jsonb;
begin
  perform public.hr_hunt_lock(p_uid, p_slot);
  -- THE KEY UNDER THE LOCK: a second press of one key that waited here answers the first's receipt.
  v_r := public.hr_intent_replay(p_uid, p_slot, p_idem, p_intent);
  if v_r is not null then return public.hr_note_rejection(p_verb, p_slot, v_r); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = p_slot) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- FEATURE-SWITCH: the factions are closed to an account the `factions` switch is off for (2027-04-23-faction-section.sql).
  if not public.hr_feature_on('factions', p_uid) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  if not exists (select 1 from public.hr_faction_rule where id) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  return null;
end $fn$;
revoke execute on function public.hr_faction_locked(text, uuid, int, uuid, text) from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000fac70101';
  r public.hr_faction_rule%rowtype; v_a text; v jsonb; s jsonb; v_scope text;
begin
  select * into r from public.hr_faction_rule where id;
  select faction_id into v_a from public.hr_factions order by ord limit 1;
  if r.id is null or v_a is null then raise exception 'faction-section §4: the catalogue is not there to probe with'; end if;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'factions';
  if v_scope is null then raise exception 'faction-section §4: no `factions` switch row'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'faction-section §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-section §4: hr_create_character refused: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());

    -- (a) OFF: no section on either channel, and the door refuses feature_off, moving nothing.
    update public.hr_feature_switches set scope = 'off' where switch_id = 'factions';
    if public.hr_faction_section(v_u, 0) is not null then raise exception 'faction-section §4(a): the switch is off and the section reads %', public.hr_faction_section(v_u, 0); end if;
    if (public.hr_state_of(v_u, 0) ? 'factions') and public.hr_state_of(v_u, 0)->'factions' <> 'null'::jsonb then
      raise exception 'faction-section §4(a): the switch is off and the envelope carries %', public.hr_state_of(v_u, 0)->'factions'; end if;
    v := public.hr_faction_join(0, v_a, gen_random_uuid());
    if v->>'error' is distinct from 'feature_off' then raise exception 'faction-section §4(a): a join with the switch off answered %', v; end if;
    if exists (select 1 from public.hr_faction_members where user_id = v_u) or exists (select 1 from public.hr_faction_ledger where user_id = v_u) then
      raise exception 'faction-section §4(a): a refused join wrote a row'; end if;

    -- (b) ON: the envelope carries the view and the two rule numbers; a hero past Krell may join; the join moves the section.
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions';
    s := public.hr_state_of(v_u, 0)->'factions';
    if s is null or s->'faction' <> 'null'::jsonb or (s->>'can_join')::boolean is not true or (s->>'swap_need_ms')::bigint <> r.swap_ms
       or (s->>'cooldown_ms')::bigint <> r.cooldown_ms or jsonb_array_length(s->'pieces') <> (select count(*) from public.hr_faction_outfits) then
      raise exception 'faction-section §4(b): the section reads %', s; end if;
    v := public.hr_faction_join(0, v_a, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-section §4(b): a join with the switch on answered %', v; end if;
    s := public.hr_faction_section(v_u, 0);
    if s->>'faction' is distinct from v_a or (s->>'can_join')::boolean is not false or s->>'swap_ready_at' is null then
      raise exception 'faction-section §4(b): after the join the section reads %', s; end if;

    raise exception using errcode = 'HR895', message = 'faction-section §4 complete - rolling back';
  exception when sqlstate 'HR895' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'factions') is distinct from v_scope then
    raise exception 'faction-section §4: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hr_faction_members where user_id = v_u)
     or exists (select 1 from public.hr_faction_ledger where user_id = v_u) then
    raise exception 'faction-section §4: a probe row leaked'; end if;
  -- (c) THE GRANTS: no client role reads the section or the door directly.
  if has_function_privilege('anon', 'public.hr_faction_section(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_faction_section(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_faction_locked(text,uuid,integer,uuid,text)', 'execute') then
    raise exception 'faction-section §4(c): a client role reaches the section or the door'; end if;
  raise notice 'faction-section §4 OK: off hides the section and shuts the door, on serves it and opens the join, the grants';
end $chk$;
