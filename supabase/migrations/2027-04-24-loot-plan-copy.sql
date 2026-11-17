-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-loot-plan-copy.sql — ONE HERO'S LOOT PLAN, COPIED TO ANOTHER HERO OF THE SAME ACCOUNT (audit 2026-11-15 F11)
--   (lane/a-audit-ui-1, systems-engineer, 2026-11-15). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit.
--   Pre-EA (CLAUDE.md §2): applies on its passing §3. On the EA Security list: a new client verb.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The loot plan is a row per hero and item (player_item_rules.loot_rule, 2027-01-23-loot-dispatch.sql). Corwen set 15 items to
-- Sell; Ilsa, on the same account, started with every item on Keep and no window offered his plan, so each new hero redid the
-- dropdowns one item at a time. Tyler's first principle (2026-10-18): a decision made once is never asked again.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_loot_plan_copy(p_slot int, p_from int, p_idem uuid) -> jsonb   (authenticated; SECURITY DEFINER; VOLATILE)
--   The caller's own heroes only: both slots are read under auth.uid(), and no uuid is in the signature, so no other account's
--   plan can be named, read or written. After it, hero p_slot's plan EQUALS hero p_from's: every item p_from plans (deposit,
--   sell, ignore) is planned the same on p_slot, and an item p_slot planned that p_from keeps goes back to keep. Only the plan
--   moves: p_slot's own locks and restock targets stay as they are (hr_item_rule_put, the one writer of the row).
--   Every plan written is asked of hr_loot_plan_refusal first, the answer the setter and Dispatch ask, and a plan it would
--   refuse today is skipped and counted (`skipped`), never written.
--   Refused, nothing written: not_signed_in · bad_slot (either slot null, < 0, > 5) · bad_idem · bad_intent (p_from = p_slot) ·
--     rate_limited (hr_rpc_gate 'hunt', the setter's) · no_character (no hero in p_slot) · no_source (no hero of THIS account in p_from)
--   OK: {ok: true, from, changed, skipped, bag_rules} (bag_rules: p_slot's section as hr_bag_rules_view says it now; `changed`
--   0 when the two plans already agreed). Journalled in player_intents under (user, p_idem), as the setter is: a replay answers
--   the stored result and writes nothing. In a hunt or out of one, as the setter (nothing moves until Dispatch loot, in town).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- hr_hunt_lock on the DESTINATION hero, the lock the setter and Dispatch take, so a copy never interleaves with either on that
-- hero. The source is read once, unlocked: a setter racing on the source lands before or after the read, and the copy is that
-- plan at that instant. A second copy with the same answer changes nothing (`changed` 0).
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- A signed-in account can make one of its heroes' plans equal another of its heroes' plans: nothing it could not already do
-- with one hr_loot_rule_set per item. It moves no gold, item, XP or ranking (a plan acts only when the player presses Dispatch
-- loot, or at pickup for `ignore`, both re-checked there). Nothing crosses accounts. Rate-gated, journalled, refusals noted.
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- No new table or column. One primary-key-prefix scan of each hero's rules (≤ ~60 rows a hero) and at most that many upserts,
-- once per press; one player_intents row per press.
--
-- EDGE: NONE. CLIENT: the bag's "Copy loot plan from <hero>" press (src/shell/windows/inventory) calls it and paints the answer's
--   bag_rules; until that ships nothing calls it. ORDER: after 2027-04-23-open-march-scaled-hunts-catalogue.generated.sql (the
--   chain's tip); it creates one function and restates none.
-- REVERSIBLE: drop the function, its baseline row and its GM wall row. No value moved to undo.
-- IDEMPOTENT: a second apply restates the body byte-identical, re-upserts the same rows, and §3 rolls back its probes.
-- WIPE: no new player table (player_item_rules and player_intents are on the character wipe's list already).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_item_rules') is null or to_regclass('public.player_intents') is null
     or to_regclass('public.player_state') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: player_item_rules, player_intents, player_state and hr_client_rpc_baseline first'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_item_rule_put(uuid,integer,text,boolean,text,integer)') is null
     or to_regprocedure('public.hr_loot_plan_refusal(text,text)') is null
     or to_regprocedure('public.hr_bag_rules_view(uuid,integer)') is null
     or to_regprocedure('public.hr_loot_rule_set(integer,text,text,uuid)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (2026-10-25-bag-rules.sql, 2027-01-23-loot-dispatch.sql first)'; end if;
end $mig$;

-- ── §1 THE INTENT ────────────────────────────────────────────────────────────
create or replace function public.hr_loot_plan_copy(p_slot int, p_from int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'loot_plan_copy';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_row  record;
  v_changed int := 0;
  v_skipped int := 0;
begin
  -- LOOT-PLAN-COPY (2027-04-24-loot-plan-copy.sql): hero p_slot's loot plan becomes hero p_from's, both the caller's own.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 or p_from is null or p_from < 0 or p_from > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_from = p_slot then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb || ':' || p_from);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE SOURCE IS THIS ACCOUNT'S OR NOBODY'S: read under auth.uid() only, so another account's hero in that slot is no source.
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_from) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_source')); end if;
  for v_row in
    select item_id, coalesce(s.loot_rule, 'keep') as want, coalesce(d.loot_rule, 'keep') as have, d.locked, d.restock
      from (select r.item_id, r.loot_rule from public.player_item_rules r
             where r.user_id = v_uid and r.slot = p_from and r.loot_rule <> 'keep') s
      full join (select r.item_id, r.loot_rule, r.locked, r.restock from public.player_item_rules r
                  where r.user_id = v_uid and r.slot = p_slot) d using (item_id)
     order by item_id
  loop
    if v_row.want = v_row.have then continue; end if;
    if public.hr_loot_plan_refusal(v_row.item_id, v_row.want) is not null then v_skipped := v_skipped + 1; continue; end if;
    perform public.hr_item_rule_put(v_uid, p_slot, v_row.item_id, v_row.locked, v_row.want, v_row.restock);
    v_changed := v_changed + 1;
  end loop;
  v_r := jsonb_build_object('ok', true, 'from', p_from, 'changed', v_changed, 'skipped', v_skipped,
    'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb || ':' || p_from, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_loot_plan_copy(int, int, uuid) from public;
revoke execute on function public.hr_loot_plan_copy(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_loot_plan_copy(int, int, uuid) to authenticated;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke execute on function public.hr_loot_plan_copy(int, int, uuid) from hr_engine; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then revoke execute on function public.hr_loot_plan_copy(int, int, uuid) from hr_tick; end if;
end $mig$;

-- ── §2 THE CLIENT SURFACE AND THE WALL ───────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_loot_plan_copy';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_loot_plan_copy', 'p_slot integer, p_from integer, p_idem uuid', 'authenticated',
   'added 2027-04-24: one of the caller''s heroes takes the loot plan of another of the caller''s own heroes (keep / deposit / sell / ignore per item; locks and restock untouched); no other account can be named; moves no value');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_loot_plan_copy', 'its own heroes')
      on conflict (rpc) do update set why = excluded.why; end if;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a   constant uuid := '000000c0-0000-4000-a000-0000f11c0001';   -- the caller
  v_b   constant uuid := '000000c0-0000-4000-a000-0000f11c0002';   -- another account
  k     text := '000000c0-0000-4000-a000-0000';
  v     jsonb;
  v2    jsonb;
  c_dep text;
  c_ign text;
  c_own text;
begin
  -- (a) the surface: the verb is client-executable by a signed-in account only, and registered
  if not has_function_privilege('authenticated', 'public.hr_loot_plan_copy(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_loot_plan_copy(integer,integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_loot_plan_copy(integer,integer,uuid)', 'execute') then
    raise exception 'VERIFY(a): a grant is wrong'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_loot_plan_copy' and grantee = 'authenticated') then
    raise exception 'VERIFY(a): the baseline row is missing'; end if;
  select item_id into c_dep from public.hr_items order by item_id limit 1;
  select item_id into c_ign from public.hr_items order by item_id offset 1 limit 1;
  select item_id into c_own from public.hr_items order by item_id offset 2 limit 1;
  if c_dep is null or c_ign is null or c_own is null then raise exception 'VERIFY(a): the item catalogue is too small for the probe'; end if;
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe Copier'), (v_b, 'Probe Other') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'loot-plan-copy §3 probe'), (v_b, 'loot-plan-copy §3 probe') on conflict (user_id) do nothing;
    -- the other account: heroes in slots 0 and 1, a plan on slot 1
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character(0) refused the other account: %', v; end if;
    -- each probe account owns slot 1 by the flag row hr_buy_hero_slot writes (hr_hero_slots_of clause 2; it needs the slot-0 hero), rolled back with the rest
    insert into public.player_progress as pp (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_b, 0, 'flag', 'character_slot:1', 1, '', null, now())
      on conflict (user_id, slot, kind, key, period_key) do update set value = greatest(pp.value, excluded.value);
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character(1) refused the other account: %', v; end if;
    v := public.hr_loot_rule_set(1, c_dep, 'deposit', (k || 'f11c0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the other account''s plan answered %', v; end if;
    -- the caller: one hero, slot 0
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character(0) refused: %', v; end if;
    insert into public.player_progress as pp (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_a, 0, 'flag', 'character_slot:1', 1, '', null, now())
      on conflict (user_id, slot, kind, key, period_key) do update set value = greatest(pp.value, excluded.value);
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    -- (b) refused, and nothing written
    v := public.hr_loot_plan_copy(0, 0, (k || 'f11c0002')::uuid);
    if v->>'error' is distinct from 'bad_intent' then raise exception 'VERIFY(b): a hero copying itself answered %', v; end if;
    v := public.hr_loot_plan_copy(0, 6, (k || 'f11c0003')::uuid);
    if v->>'error' is distinct from 'bad_slot' then raise exception 'VERIFY(b): source slot 6 answered %', v; end if;
    v := public.hr_loot_plan_copy(0, 1, null);
    if v->>'error' is distinct from 'bad_idem' then raise exception 'VERIFY(b): no key answered %', v; end if;
    -- A FOREIGN SOURCE: slot 1 holds ANOTHER account's hero and its plan; the caller has no hero there
    v := public.hr_loot_plan_copy(0, 1, (k || 'f11c0004')::uuid);
    if v->>'error' is distinct from 'no_source' then raise exception 'VERIFY(b): another account''s hero as the source answered %', v; end if;
    v := public.hr_loot_plan_copy(1, 0, (k || 'f11c0005')::uuid);
    if v->>'error' is distinct from 'no_character' then raise exception 'VERIFY(b): a copy onto no hero answered %', v; end if;
    if exists (select 1 from public.player_item_rules where user_id = v_a) then raise exception 'VERIFY(b): a refused copy wrote a row'; end if;
    -- (c) a copy lands: the source's plans, the destination's own plan the source keeps goes back, its lock stays
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character(1) refused: %', v; end if;
    perform public.hr_loot_rule_set(0, c_dep, 'deposit', (k || 'f11c0006')::uuid);
    perform public.hr_loot_rule_set(0, c_ign, 'ignore', (k || 'f11c0007')::uuid);
    perform public.hr_loot_rule_set(1, c_own, 'deposit', (k || 'f11c0008')::uuid);
    update public.player_item_rules set locked = true where user_id = v_a and slot = 1 and item_id = c_own;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_loot_plan_copy(1, 0, (k || 'f11c0009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'changed')::int <> 3 or (v->>'skipped')::int <> 0 or (v->>'from')::int <> 0 then
      raise exception 'VERIFY(c): the copy answered %', v; end if;
    if (select coalesce(jsonb_object_agg(item_id, loot_rule order by item_id), '{}'::jsonb) from public.player_item_rules where user_id = v_a and slot = 1 and loot_rule <> 'keep')
       is distinct from (select coalesce(jsonb_object_agg(item_id, loot_rule order by item_id), '{}'::jsonb) from public.player_item_rules where user_id = v_a and slot = 0 and loot_rule <> 'keep') then
      raise exception 'VERIFY(c): the two plans differ after the copy'; end if;
    if not coalesce((select locked and loot_rule = 'keep' from public.player_item_rules where user_id = v_a and slot = 1 and item_id = c_own), false) then
      raise exception 'VERIFY(c): the destination''s lock went with its plan'; end if;
    if v->'bag_rules' is distinct from public.hr_bag_rules_view(v_a, 1) then raise exception 'VERIFY(c): the answer is not the destination''s section'; end if;
    -- (d) the same key again: the same answer, nothing written, though the source has moved since
    perform public.hr_loot_rule_set(0, c_own, 'ignore', (k || 'f11c000a')::uuid);
    delete from public.hr_rate_counters where user_id = v_a;
    v2 := public.hr_loot_plan_copy(1, 0, (k || 'f11c0009')::uuid);
    if v2 is distinct from v or (select loot_rule from public.player_item_rules where user_id = v_a and slot = 1 and item_id = c_own) is distinct from 'keep' then
      raise exception 'VERIFY(d): a replayed key wrote or answered something new: %', v2; end if;
    -- (e) the other account's rows never moved
    if (select count(*) from public.player_item_rules where user_id = v_b) <> 1 then raise exception 'VERIFY(e): another account''s plan moved'; end if;
    raise exception using errcode = 'HR897', message = 'loot-plan-copy §3 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_item_rules where user_id in (v_a, v_b)) or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.player_intents where user_id in (v_a, v_b))
     or exists (select 1 from public.player_progress where user_id in (v_a, v_b)) then raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'loot-plan-copy: the caller''s own heroes only, a foreign source refused, the plan lands with locks kept, a replay writes nothing; all green';
end $$;
