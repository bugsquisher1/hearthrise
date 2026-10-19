-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT ANALYZER FOR EVERYONE: BASIC FREE, MORE WITH PREMIUM
-- (Tyler 2026-10-19, replacing the 2026-10-17 "only premium sees it").
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it in the
-- reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- Every character reads the BASIC analyzer: session time, kills, XP and XP/h,
-- gold (coins + loot at vendor value) with the loot it came from and gold/h,
-- supplies own vs store (counts), balance. A PREMIUM character reads the whole
-- v2 read on top: next-level ETA, raw XP, waste (the store's gold), damage
-- taken by monster / element, dealt by ability / element, healed, the party
-- breakdown, the bag and the recent events.
--   hr_hunt_analyzer_basic(p_a)  NEW, owner-only, pure: the basic subset of one
--     hr_hunt_analyzer_of read, built field by field (an ALLOWLIST: a field the
--     v2 read grows later is premium until it is named here). `tier: 'basic'`.
--   hr_hunt_analyzer_view        RESTATED: premium -> the v2 read + tier
--     'premium'; free -> the basic subset; no hunt -> NULL (as before).
--   hr_hunt_analyzer (client)    RESTATED, same signature and grants: a free
--     character gets {ok, ...basic} instead of premium_required.
-- The recording is unchanged: the server still records every stat for every
-- character (2026-10-23-hunt-analyzer-v2.sql §1-§2, untouched).
-- §0 pins both restated bodies' pre-images (md5 of prosrc, the v2 file's) or
-- this file's own image; anything else moved meanwhile and is refused.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only: the caller's own newest session, display numbers from the ledger
-- fold. No value moves; nothing crosses to another player (the party block,
-- which aggregates the instance, stays premium as before).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply §2-§3 of 2026-10-23-hunt-analyzer-v2.sql (hr_hunt_analyzer,
-- hr_hunt_analyzer_view, the section row and the baseline note); drop
-- hr_hunt_analyzer_basic.
-- ORDER: after 2026-10-23-hunt-analyzer-v2.sql and the core rebuild (2026-10-27-core-wipe.sql); last in the
-- chain. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text; v_src text;
begin
  if to_regprocedure('public.hr_hunt_analyzer_of(uuid,integer,uuid)') is null
     or to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-hunt-analyzer-v2.sql first'; end if;
  select md5(prosrc), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_hunt_analyzer(integer,uuid)'::regprocedure;
  if v_md5 <> '48f7cb09e41d03689c026833511734f9' and strpos(v_src, 'hr_hunt_analyzer_basic(') = 0 then
    raise exception 'PIN: hr_hunt_analyzer is neither the v2 pre-image (48f7cb09...) nor this file''s (md5 %) - another file moved it', v_md5; end if;
  select md5(prosrc), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_hunt_analyzer_view(uuid,integer)'::regprocedure;
  if v_md5 <> 'b234ebbfb3620f09107be0e57a175a9c' and strpos(v_src, 'hr_hunt_analyzer_basic(') = 0 then
    raise exception 'PIN: hr_hunt_analyzer_view is neither the v2 pre-image (b234ebbf...) nor this file''s (md5 %) - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE BASIC SUBSET (an allowlist, field by field) ───────────────────────
create or replace function public.hr_hunt_analyzer_basic(p_a jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select case when p_a is null or jsonb_typeof(p_a) <> 'object' then null else jsonb_build_object(
    'tier', 'basic',
    'session', jsonb_build_object('id', p_a->'session'->'id', 'hunt', p_a->'session'->'hunt',
                 'entered_at', p_a->'session'->'entered_at', 'ended_at', p_a->'session'->'ended_at',
                 'end_reason', p_a->'session'->'end_reason', 'phase', p_a->'session'->'phase'),
    'wall_ms', p_a->'wall_ms', 'hunt_ms', p_a->'hunt_ms',
    'hero', jsonb_build_object(
      'kills', p_a->'hero'->'kills', 'xp', p_a->'hero'->'xp',
      'gold', p_a->'hero'->'gold', 'gold_basis', p_a->'hero'->'gold_basis', 'coins', p_a->'hero'->'coins',
      'loot_value', p_a->'hero'->'loot_value', 'loot', p_a->'hero'->'loot',
      'balance', p_a->'hero'->'balance',
      'supplies', jsonb_build_object('own', p_a->'hero'->'supplies'->'own', 'store', p_a->'hero'->'supplies'->'store'),
      'per_hour', case when jsonb_typeof(p_a->'hero'->'per_hour') = 'object' then jsonb_build_object(
                    'xp', p_a->'hero'->'per_hour'->'xp', 'gold', p_a->'hero'->'per_hour'->'gold',
                    'kills', p_a->'hero'->'per_hour'->'kills') end))
  end
$$;
revoke execute on function public.hr_hunt_analyzer_basic(jsonb) from public, anon, authenticated, service_role;

-- ── §2 THE CLIENT VERB (unchanged signature and grants): basic for all, the rest for premium ──
create or replace function public.hr_hunt_analyzer(p_slot int, p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid();
  v_a   jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_a := public.hr_hunt_analyzer_of(v_uid, p_slot, p_session);
  if v_a is null then return jsonb_build_object('ok', false, 'error', 'no_hunt'); end if;
  -- BASIC FOR EVERYONE, THE REST FOR PREMIUM (Tyler 2026-10-19); the server records it all regardless.
  if public.hr_premium_active(v_uid, p_slot, now()) then return jsonb_build_object('ok', true, 'tier', 'premium') || v_a; end if;
  return jsonb_build_object('ok', true) || public.hr_hunt_analyzer_basic(v_a);
end $$;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from public;
revoke execute on function public.hr_hunt_analyzer(int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_analyzer(int, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'restated 2026-10-26 (analyzer basic): every character reads the basic block (time, kills, XP, gold + loot, supplies own/store, balance); premium adds the rest; read-only'
 where proname = 'hr_hunt_analyzer' and grantee = 'authenticated';

-- ── §3 THE `hunt_analyzer` SECTION: basic for a free character, whole for premium, NULL with no hunt ──
create or replace function public.hr_hunt_analyzer_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select case when public.hr_premium_active(p_user, p_slot, now())
              then (select case when a is null then null else jsonb_build_object('tier', 'premium') || a end
                      from public.hr_hunt_analyzer_of(p_user, p_slot, null) a)
              else public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(p_user, p_slot, null)) end
$$;
revoke execute on function public.hr_hunt_analyzer_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_analyzer', 'hr_hunt_analyzer_view', '2026-10-26-hunt-analyzer-basic.sql: the newest session''s stats; the basic block for a free character, hero + party for premium; NULL with no hunt')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-00005e1a0026';
  -- What a free character must never read (the premium rows), at the top and in the hero block.
  c_premium_top  constant text[] := array['party', 'bag', 'recent', 'unseen'];
  c_premium_hero constant text[] := array['raw_xp', 'waste', 'dealt', 'taken', 'healed', 'skills'];
  c_premium_ph   constant text[] := array['raw_xp', 'waste', 'balance'];
  v      jsonb;
  v_sid  uuid;
  v_role text;
  v_k    text;
begin
  -- (a) the subset is an allowlist: an unknown field never passes, a null read stays null.
  if public.hr_hunt_analyzer_basic(null) is not null then raise exception 'VERIFY(a): basic(null) is not null'; end if;
  v := public.hr_hunt_analyzer_basic('{"hero": {"kills": 1, "future_premium": 9}, "future_top": 1}'::jsonb);
  if v ? 'future_top' or v->'hero' ? 'future_premium' or (v->'hero'->>'kills')::int <> 1 or v->>'tier' <> 'basic' then
    raise exception 'VERIFY(a): the basic subset passed an unnamed field: %', v; end if;
  -- (b) EXECUTED: a free character reads the basic block and none of the premium rows; premium reads them all.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-analyzer-basic §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    update public.hunt_session_tally set kills = 5, coins = 40, supply_gold = 12, supplies = '{"cooked_shrimp": 3}'::jsonb,
           bought = '{"basic_bread": 2}'::jsonb, dealt = '{"total": 90, "byAbility": {"basic": 90}}'::jsonb,
           taken = '{"total": 30, "byMonster": {"rat": 30}}'::jsonb
     where session_id = v_sid;
    -- the verb and the envelope section, free
    foreach v_k in array array['verb', 'section'] loop
      v := case when v_k = 'verb' then public.hr_hunt_analyzer(0, null) else public.hr_state_of(v_uid, 0)->'hunt_analyzer' end;
      if v_k = 'verb' and coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a free character''s verb refused: %', v; end if;
      if v->>'tier' is distinct from 'basic' or (v->'hero'->>'kills')::int is distinct from 5 or (v->'hero'->>'gold')::int is distinct from 40
         or (v->'hero'->>'balance')::int is distinct from 28 or v->'hero'->'supplies'->'own' <> '{"cooked_shrimp": 3}'::jsonb
         or v->'hero'->'supplies'->'store' <> '{"basic_bread": 2}'::jsonb or not (v ? 'hunt_ms') or not (v->'hero' ? 'per_hour') then
        raise exception 'VERIFY(b): a free character''s % lacks the basic block: %', v_k, v; end if;
      if exists (select 1 from unnest(c_premium_top) k where v ? k)
         or exists (select 1 from unnest(c_premium_hero) k where v->'hero' ? k)
         or (jsonb_typeof(v->'hero'->'per_hour') = 'object' and exists (select 1 from unnest(c_premium_ph) k where v->'hero'->'per_hour' ? k))
         or (v->'hero'->'supplies') ? 'store_gold' or (v->'session') ? 'tally' or (v->'session') ? 'bag' then
        raise exception 'VERIFY(b): a free character''s % carries a premium row: %', v_k, v; end if;
    end loop;
    -- premium: everything, as v2 read it
    perform public.hr_premium_grant(v_uid, 0, now() + interval '1 day', 'probe');
    foreach v_k in array array['verb', 'section'] loop
      v := case when v_k = 'verb' then public.hr_hunt_analyzer(0, null) else public.hr_state_of(v_uid, 0)->'hunt_analyzer' end;
      if v->>'tier' is distinct from 'premium' or (v->'hero'->>'waste')::int is distinct from 12 or (v->'hero'->'dealt'->>'total')::int is distinct from 90
         or (v->'hero'->'taken'->>'total')::int is distinct from 30 or (v->'party'->>'kills')::int is distinct from 5 or not (v->'hero' ? 'raw_xp')
         or not (v->'hero' ? 'skills') then
        raise exception 'VERIFY(b): a premium character''s % is not the whole read: %', v_k, v; end if;
    end loop;
    raise exception using errcode = 'HR860', message = 'hunt-analyzer-basic §4 complete - rolling back';
  exception when sqlstate 'HR860' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(c): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_analyzer_basic(jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_analyzer_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(c): % reaches an analyzer internal', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_hunt_analyzer(integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_analyzer(integer,uuid)', 'execute') then
    raise exception 'VERIFY(c): the client verb''s grants moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-analyzer-basic: the basic block for every character, the whole read for premium; all green';
end $$;
