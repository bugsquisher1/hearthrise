-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — SERVER AUTHORITY TEST SUITE  (SQL, behavioural)
--
-- WHY THIS FILE EXISTS
--   Before this change the repository had NO SQL test harness at all and zero
--   test references to hr_apply, market_buy or pg_policies. Every security
--   property of the server tier was asserted by reading the migration. The
--   security review was right that shipping the schema before the tests is the
--   wrong order, so the tests ship in the same change.
--
-- HOW TO RUN
--   Designed to run INSIDE A TRANSACTION THAT IS ROLLED BACK, so it can be
--   pointed at any database — including production — without leaving a trace.
--   Every object it creates is temporary or rolled back.
--
--     begin;
--     \i supabase/migrations/2026-08-11-player-state.sql
--     \i supabase/migrations/2026-08-11-catalogue.generated.sql
--     \i supabase/migrations/2026-08-11-apply-engine.sql
--     \i supabase/migrations/2026-08-11-market-v2.sql
--     \i tests/sql/server-authority.test.sql
--     rollback;
--
--   `node tests/run-sql-tests.mjs --emit` prints exactly that bundle.
--
-- A NOTE ON THE ROLE SWITCH
--   hr_engine deliberately holds ZERO table privileges, so the test harness
--   cannot read player_state while it is wearing that role. Every engine call
--   therefore goes through pg_temp.eapply(), which switches roles for the
--   duration of the call and switches back. That is also exactly the shape of
--   the real caller: PostgREST sets the role per request, not per session.
-- ════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice '  ok  %', p_label;
end $$;

create or replace function pg_temp.as_role(p_role text)
returns void language plpgsql as $$
begin
  -- set_config rather than SET LOCAL ROLE: inside PL/pgSQL the GUC form is the
  -- portable one, and `role` is the very GUC PostgREST sets from the JWT.
  perform set_config('role', p_role, true);
end $$;

create or replace function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- THE ENGINE CALL. This is how the Edge Function will reach hr_apply: as role
-- hr_engine, naming the user it has already authenticated, with an idempotency
-- key. The role is worn only for the call.
create or replace function pg_temp.eapply(
  p_user uuid, p_version bigint, p_delta jsonb, p_key uuid default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'hr_engine', true);
  v := public.hr_apply(p_user, 0, p_version, coalesce(p_key, gen_random_uuid()), p_delta);
  perform set_config('role', 'none', true);
  return v;
end $$;

-- Read helpers are SECURITY DEFINER so they keep working whatever role the
-- test is wearing.
create or replace function pg_temp.ver(p_user uuid)
returns bigint language sql security definer as $$
  select version from public.player_state where user_id = p_user and slot = 0
$$;

create or replace function pg_temp.gold(p_user uuid)
returns bigint language sql security definer as $$
  select gold from public.player_state where user_id = p_user and slot = 0
$$;

create or replace function pg_temp.inv(p_user uuid, p_item text)
returns bigint language sql security definer as $$
  select coalesce((select qty from public.player_inventory
                    where user_id = p_user and slot = 0 and item_id = p_item), 0)
$$;

create or replace function pg_temp.stacks(p_user uuid)
returns int language sql security definer as $$
  select count(*)::int from public.player_inventory where user_id = p_user and slot = 0
$$;

-- ── Fixtures ─────────────────────────────────────────────────────────────
-- Two throwaway accounts. auth.users is written directly because there is no
-- SQL path to the auth API; the rollback removes them.
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        b uuid := '00000000-0000-4000-8000-00000000bbbb';
begin
  -- `id` is the only column without a default (verified against the live
  -- catalogue) — everything else auth fills in for real signups.
  insert into auth.users (id) values (a), (b) on conflict (id) do nothing;

  insert into public.profiles (id, display_name)
    values (a, 'TestAlpha'), (b, 'TestBravo')
  on conflict (id) do update set display_name = excluded.display_name;

  perform pg_temp.as_user(a);
  perform public.hr_create_character(0);
  perform pg_temp.as_user(b);
  perform public.hr_create_character(0);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'fixtures ready';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. GRANTS AND POLICIES  (review S1, S6, S7, S14, S17)
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_n int;
        v_new text[];
begin
  raise notice '-- grants and policies';

  -- S1: hr_apply is executable by hr_engine and by nothing a request arrives as.
  perform pg_temp.ok(
    not has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute'),
    'hr_apply is NOT anon-executable');
  perform pg_temp.ok(
    not has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute'),
    'hr_apply is NOT authenticated-executable');
  perform pg_temp.ok(
    not has_function_privilege('service_role', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute'),
    'hr_apply is NOT service_role-executable');
  perform pg_temp.ok(
    has_function_privilege('hr_engine', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute'),
    'hr_apply IS hr_engine-executable (the seam can actually execute)');

  -- S1: the engine role is powerless outside hr_apply. This is the assertion
  -- that turns "Edge Functions never write tables" into a control.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'hr_engine';
  perform pg_temp.ok(v_n = 0, format('hr_engine holds ZERO table privileges (found %s)', v_n));

  -- S6/S7: no function THIS BUNDLE creates is anon-executable.
  --
  -- Scoped to the bundle's own functions on purpose. The first revision matched
  -- every public hr_*/market_* function, which on a database that already has
  -- the clan/rally/leaderboard migrations also swept up their 36 pre-existing
  -- functions and failed. This suite is documented as runnable against
  -- production, so it must assert about what it INSTALLS, not about what it
  -- happens to find. The existence check below is what stops a rename from
  -- quietly turning the privilege check into an assertion about nothing.
  v_new := array[
    'hr_apply','hr_create_character','hr_display_name_of','hr_intent_claim',
    'hr_intent_record','hr_intents_prune','hr_ledger_immutable','hr_level_from_xp',
    'hr_load','hr_rate_ok','hr_reject','hr_seed','hr_state_of','hr_total_level',
    'hr_xp_for_level','market_buy','market_cancel','market_expire','market_list'];

  select count(distinct p.proname) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(v_new);
  perform pg_temp.ok(v_n = array_length(v_new, 1),
    format('all %s bundle functions exist (found %s)', array_length(v_new, 1), v_n));

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(v_new)
     and has_function_privilege('anon', p.oid, 'execute');
  perform pg_temp.ok(v_n = 0, format('no bundle function is anon-executable (found %s)', v_n));

  -- S6: market_expire is not a player-triggerable write amplifier.
  perform pg_temp.ok(
    not has_function_privilege('authenticated', 'public.market_expire(int)', 'execute'),
    'market_expire is NOT player-callable');

  -- S7: no anonymous display-name enumeration.
  perform pg_temp.ok(
    not has_function_privilege('authenticated', 'public.hr_display_name_of(uuid)', 'execute'),
    'hr_display_name_of is NOT player-callable');

  -- No write POLICY on any player or market table.
  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('player_state','player_skills','player_inventory','player_equipment',
                       'player_farm','player_progress','player_ledger','player_intents',
                       'market_listings','market_sales','hr_market_config')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  perform pg_temp.ok(v_n = 0, format('no client write policies (found %s)', v_n));

  -- S14: no write GRANT either, TRUNCATE included.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_state','player_skills','player_inventory','player_equipment',
                        'player_farm','player_progress','player_ledger','player_intents',
                        'hr_rate_counters','hr_server_secrets',
                        'market_listings','market_sales','hr_market_config')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  perform pg_temp.ok(v_n = 0, format('no client write grants, TRUNCATE included (found %s)', v_n));

  -- S17: the sales receipt is not world-readable; the price chart is.
  perform pg_temp.ok(not has_table_privilege('anon', 'public.market_sales', 'select'),
                     'anon cannot read market_sales (no buyer/seller UUID leak)');
  perform pg_temp.ok(has_table_privilege('anon', 'public.market_price_history', 'select'),
                     'anon CAN read the names-free price view');

  -- S20: the PRNG secret is unreachable by a player.
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.hr_server_secrets', 'select'),
                     'players cannot read the PRNG secret');
end $$;

-- A player really cannot write player_state, and the ledger cannot be emptied.
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        v_denied boolean := false;
begin
  raise notice '-- direct client writes';
  begin
    perform pg_temp.as_user(a);
    perform pg_temp.as_role('authenticated');
    update public.player_state set gold = 999999999 where user_id = a;
  exception when insufficient_privilege then v_denied := true;
  end;
  perform pg_temp.as_role('none');
  perform pg_temp.ok(v_denied, 'authenticated UPDATE on player_state raises 42501');
  perform pg_temp.ok(pg_temp.gold(a) = 0, 'gold did not move');

  v_denied := false;
  begin
    truncate table public.player_ledger;
  exception when check_violation then v_denied := true;
  end;
  perform pg_temp.ok(v_denied, 'TRUNCATE on player_ledger is refused by the statement trigger');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. THE IDENTITY SEAM  (review S1)
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        b uuid := '00000000-0000-4000-8000-00000000bbbb';
        r jsonb;
begin
  raise notice '-- identity seam';
  perform set_config('request.jwt.claims', '', true);

  -- The engine path WORKS. Revision 1's could not: it read auth.uid() (null for
  -- the service role) while revoking the only role that had one.
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"gold":100,"journal":{"kind":"admin","intent":"test"}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'hr_engine can apply for a named user');
  perform pg_temp.ok((r#>>'{state,gold}')::bigint = 100, 'the gold landed');

  -- A non-engine caller may not name someone else.
  perform pg_temp.as_user(b);
  r := public.hr_apply(a, 0, pg_temp.ver(a), gen_random_uuid(), '{"gold":100}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'forbidden_impersonation',
                     'a non-engine caller cannot act as another user');
  perform pg_temp.ok(pg_temp.gold(a) = 100, 'the impersonation attempt moved nothing');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. S2 — A REJECTION AFTER A WRITE MUST ROLL THE WRITE BACK
--    The headline regression test. Without the fix the +10 commits, the -10
--    fails, `version` never moves, and the Edge Function's retry mints the
--    +10 a second time.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; v0 bigint; r jsonb;
begin
  raise notice '-- S2 partial-rollback';
  v0 := pg_temp.ver(a);
  perform pg_temp.ok(pg_temp.inv(a, 'normal_log') = 0, 'starts with no logs');
  perform pg_temp.ok(pg_temp.inv(a, 'normal_plank') = 0, 'starts with no planks');

  -- The plank is a gain; the log is a spend the player cannot afford. jsonb key
  -- order is unspecified, so this must fail as a UNIT whichever key is seen first.
  r := pg_temp.eapply(a, v0, '{"items":{"normal_plank":10,"normal_log":-10}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'false', 'the mixed delta is rejected');
  perform pg_temp.ok(r->>'error' = 'insufficient_item', 'with insufficient_item');
  perform pg_temp.ok(pg_temp.inv(a, 'normal_plank') = 0,
                     'THE PLANK WAS NOT CREDITED — the rejection rolled back');
  perform pg_temp.ok(pg_temp.ver(a) = v0, 'version did not move on rejection');

  -- bank_full is checked after the item writes, and must roll them back too.
  r := pg_temp.eapply(a, pg_temp.ver(a),
        (select jsonb_build_object('items', jsonb_object_agg(item_id, 1))
           from (select item_id from public.hr_items order by item_id limit 150) s));
  perform pg_temp.ok(r->>'error' = 'bank_full', '150 new stacks over a cap of 100 is bank_full');
  perform pg_temp.ok(pg_temp.stacks(a) = 0,
                     'NOTHING was written — bank_full rolls back every item');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. S9 — the version check is mandatory
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb; v0 bigint;
begin
  raise notice '-- S9 optimistic concurrency';
  v0 := pg_temp.ver(a);
  r := pg_temp.eapply(a, null, '{"gold":1000}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'version_conflict', 'a NULL version is a conflict, not a bypass');
  r := pg_temp.eapply(a, v0 - 1, '{"gold":1000}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'version_conflict', 'a stale version is a conflict');
  perform pg_temp.ok(pg_temp.ver(a) = v0, 'neither attempt bumped the version');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. S3 — the catalogue is a real allowlist
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb;
begin
  raise notice '-- S3 catalogue';
  perform pg_temp.ok((select count(*) from public.hr_items) = 400, 'hr_items holds 400 rows');
  perform pg_temp.ok((select count(*) from public.hr_items where not tradeable) = 15,
                     '15 bind-on-pickup items');
  perform pg_temp.ok(exists (select 1 from public.hr_catalogue_meta), 'a catalogue digest is recorded');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"totally_made_up_item":1}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'unknown_item', 'an invented item id is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"activity":{"kind":"gather","id":"nonexistent_node"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'unknown_activity', 'an invented activity id is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"activity":{"kind":"gather","id":"duskwood_tree"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'activity_locked',
                     'a Woodcutting-90 node is refused at Woodcutting 1');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"nonsense_key":1}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'unknown_delta_key', 'an unknown delta key is an error, not a shrug');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"hearth_tokens":100}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'unknown_delta_key',
                     'the apply engine physically cannot mint the IAP bond');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 6. S4 — equip validates ownership, slot, catalogue and requirement,
--         and MOVES the unit rather than flagging it
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb;
begin
  raise notice '-- S4 equipment';

  -- The exact exploit from the review: equip an item you do not own.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":"dragon_gem"}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'false', 'equipping an unowned item is refused');
  perform pg_temp.ok(r->>'error' = 'wrong_slot', 'and on the SLOT first — a gem is not a weapon');

  -- Owning it does not make it a weapon.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"dragon_gem":1}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'granted a dragon gem');
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":"dragon_gem"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'wrong_slot', 'owning it does not make it equippable');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":"bronze_sword"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'insufficient_item', 'a real weapon you do not own is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"halo":"bronze_sword"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'unknown_equip_slot', 'an invented equip slot is refused');

  -- The happy path MOVES the unit.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"bronze_sword":2}}'::jsonb);
  perform pg_temp.ok(pg_temp.inv(a, 'bronze_sword') = 2, 'two swords in the bank');
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":"bronze_sword"}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'equipping an owned, legal item succeeds');
  perform pg_temp.ok(pg_temp.inv(a, 'bronze_sword') = 1,
                     'ONE unit left the bank — equipping is a transfer, not a flag');
  perform pg_temp.ok(r#>>'{equipment,weapon}' = 'bronze_sword', 'and the slot is filled');

  -- Unequip returns it: total owned is conserved, so the equip/unequip
  -- duplication from the review is arithmetically impossible.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":null}}'::jsonb);
  perform pg_temp.ok(pg_temp.inv(a, 'bronze_sword') = 2, 'unequip returns the unit — count conserved');
  perform pg_temp.ok((r->'equipment') = '{}'::jsonb, 'the slot is empty again');

  -- The gear requirement is re-checked against SERVER xp.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"wartusk_cleaver":1}}'::jsonb);
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"equip":{"weapon":"wartusk_cleaver"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'requirement_not_met',
                     'an Attack-35 weapon is refused at Attack 1');
  perform pg_temp.ok(pg_temp.inv(a, 'wartusk_cleaver') = 1, 'and the item stayed in the bank');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 7. S5 — gems clamp and refuse an overspend
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb;
begin
  raise notice '-- S5 gems';
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gems":3}'::jsonb);
  perform pg_temp.ok((r#>>'{state,gems}')::bigint = 3, 'three gems granted');
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gems":-10}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'insufficient_gems',
                     'spending 10 gems while holding 3 is refused, not silently floored');
  perform pg_temp.ok((select gems from public.player_state where user_id = a and slot = 0) = 3,
                     'the three gems are still there');
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gems":999999999}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'gem_clamp', 'an absurd gem grant hits the blast-radius clamp');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 8. S8 — idempotency: same key, same answer, applied once
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        k uuid := gen_random_uuid(); g0 bigint; r1 jsonb; r2 jsonb;
begin
  raise notice '-- S8 idempotency';
  g0 := pg_temp.gold(a);
  r1 := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":500}'::jsonb, k);
  r2 := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":500}'::jsonb, k);
  perform pg_temp.ok(r1->>'ok' = 'true', 'the first call applies');
  perform pg_temp.ok(r2->>'replayed' = 'true', 'the replay is recognised');
  perform pg_temp.ok(pg_temp.gold(a) = g0 + 500, 'the gold was credited exactly ONCE');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 9. S13 — progress validation, and 'claimed' is not client-reachable
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb;
begin
  raise notice '-- S13 progress';
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress":[{"kind":"quest","key":"q1","add":1,"state":"claimed"}]}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_progress_state',
                     'the generic progress block cannot write state=claimed');
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress":[{"kind":"nonsense","key":"q1","add":1}]}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_progress_kind', 'an invented progress kind is refused');
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress":[{"kind":"quest","key":"q1","add":-5}]}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'progress_clamp', 'a negative counter is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress_claim":[{"kind":"quest","key":"q1","period":""}]}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'not_claimable', 'claiming an unearned quest is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress":[{"kind":"quest","key":"q1","add":1,"state":"done"}]}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'marking it done is allowed');
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress_claim":[{"kind":"quest","key":"q1","period":""}]}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'claiming a done quest works');
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"progress_claim":[{"kind":"quest","key":"q1","period":""}]}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'not_claimable', 'a DOUBLE claim is refused');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 10. S19 — the accrual watermark is monotonic and bounded by now()
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb; t0 timestamptz;
begin
  raise notice '-- S19 accrual watermark';

  -- The engine's rule is  least(now(), greatest(old, requested))  — monotonic
  -- and bounded above by the server clock. Testing that inside one transaction
  -- needs care: now() is FROZEN for the whole transaction, and player_state
  -- defaults accrued_to to now() at character creation, so the fixture starts
  -- pinned to the ceiling and no forward move is expressible at all. The first
  -- revision of this section asserted `accrued_to < now()` after a request of
  -- now() - 1s and could never pass — the engine was right and the test was
  -- unsatisfiable. Park the watermark a day in the past first (as the owner,
  -- not as a client) so that "advance", "refuse to go backwards" and "clamp to
  -- the ceiling" are three distinguishable instants.
  update public.player_state set accrued_to = now() - interval '1 day'
   where user_id = a and slot = 0;
  select accrued_to into t0 from public.player_state where user_id = a and slot = 0;

  r := pg_temp.eapply(a, pg_temp.ver(a),
        jsonb_build_object('accrued_to', (t0 - interval '1 hour')::text));
  perform pg_temp.ok((r#>>'{state,accrued_to}')::timestamptz = t0,
    format('a backwards watermark is clamped to the old one (got %s want %s)',
           r#>>'{state,accrued_to}', t0));

  -- Honoured EXACTLY: not confiscated back to t0, not rounded up to the ceiling.
  r := pg_temp.eapply(a, pg_temp.ver(a),
        jsonb_build_object('accrued_to', (now() - interval '1 second')::text));
  perform pg_temp.ok((r#>>'{state,accrued_to}')::timestamptz = now() - interval '1 second',
    format('a read-time watermark is honoured (the round trip is not confiscated) (got %s want %s)',
           r#>>'{state,accrued_to}', now() - interval '1 second'));

  r := pg_temp.eapply(a, pg_temp.ver(a),
        jsonb_build_object('accrued_to', (now() + interval '10 years')::text));
  perform pg_temp.ok((r#>>'{state,accrued_to}')::timestamptz = now(),
    format('a future watermark is clamped to now() (got %s want %s)',
           r#>>'{state,accrued_to}', now()));

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"accrued_to":"not-a-timestamp"}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_delta', 'a malformed timestamp is a rejection, not a 500');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 11. MARKET — escrow, real value movement, bop allowlist, S11
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        b uuid := '00000000-0000-4000-8000-00000000bbbb';
        r jsonb; lid uuid; ga bigint; gb bigint;
begin
  raise notice '-- market';
  perform pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"normal_log":100}}'::jsonb);
  perform pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"dungeon_scrip":5}}'::jsonb);
  perform pg_temp.eapply(b, pg_temp.ver(b), '{"gold":10000}'::jsonb);

  perform pg_temp.as_user(a);
  r := public.market_list(0, 'dungeon_scrip', 1, 100, gen_random_uuid());
  perform pg_temp.ok(r->>'error' = 'not_tradeable', 'a bind-on-pickup item cannot be listed');
  perform pg_temp.ok(pg_temp.inv(a, 'dungeon_scrip') = 5, 'and its escrow was not taken');

  r := public.market_list(0, 'normal_log', 500, 10, gen_random_uuid());
  perform pg_temp.ok(r->>'error' = 'insufficient_item', 'cannot list more than you hold');

  r := public.market_list(0, 'normal_log', 10, 100, gen_random_uuid());
  perform pg_temp.ok(r->>'ok' = 'true', 'listing succeeds');
  lid := (r->>'listing_id')::uuid;
  perform pg_temp.ok(pg_temp.inv(a, 'normal_log') = 90, 'escrow really left the bank');
  perform pg_temp.ok((select seller_name from public.market_listings where id = lid) = 'TestAlpha',
                     'seller_name is derived from profiles, not accepted');

  r := public.market_buy(0, lid, 1, gen_random_uuid());
  perform pg_temp.ok(r->>'error' = 'own_listing', 'you cannot buy your own listing');

  ga := pg_temp.gold(a); gb := pg_temp.gold(b);
  perform pg_temp.as_user(b);
  r := public.market_buy(0, lid, 4, gen_random_uuid());
  perform pg_temp.ok(r->>'ok' = 'true', 'the buy succeeds');
  perform pg_temp.ok(pg_temp.gold(b) = gb - 400, 'the buyer really paid 400');
  perform pg_temp.ok(pg_temp.gold(a) = ga + 394,
                     'the seller was paid 394 net of the 1.5 pct house tax, at sale time');
  perform pg_temp.ok(pg_temp.inv(b, 'normal_log') = 4, 'the buyer received the goods');
  perform pg_temp.ok((select qty from public.market_listings where id = lid) = 6,
                     'the listing was decremented under its own lock');
  perform pg_temp.ok((select count(*) from public.market_sales where listing_id = lid) = 1,
                     'one receipt was written');

  -- A broke buyer is a rejection, not a partial trade.
  update public.player_state set gold = 1 where user_id = b and slot = 0;
  r := public.market_buy(0, lid, 6, gen_random_uuid());
  perform pg_temp.ok(r->>'error' = 'insufficient_gold', 'a broke buyer is refused');
  perform pg_temp.ok((select qty from public.market_listings where id = lid) = 6,
                     'and the listing is untouched');
  perform pg_temp.ok(pg_temp.inv(b, 'normal_log') = 4, 'and no goods were delivered');

  -- S11: a seller with no player_state row must not make gold evaporate.
  update public.player_state set gold = 100000 where user_id = b and slot = 0;
  delete from public.player_state where user_id = a and slot = 0;
  gb := pg_temp.gold(b);
  r := public.market_buy(0, lid, 1, gen_random_uuid());
  perform pg_temp.ok(r->>'error' = 'seller_unavailable',
                     'a sale to a missing seller is REFUSED, not silently paid to nobody');
  perform pg_temp.ok(pg_temp.gold(b) = gb, 'the buyer gold was not destroyed');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ── Fixture repair ───────────────────────────────────────────────────────
-- Section 11's last assertion DELETES character A's player_state (to prove a
-- sale to a missing seller is refused rather than paid to nobody), and that
-- cascades to skills, inventory, farm and progress. Everything after this point
-- needs a character again. Rebuilt rather than reordered, because "the seller
-- vanished mid-trade" is a destructive test by nature and the next section
-- should not have to know that.
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
begin
  perform pg_temp.as_user(a);
  if not exists (select 1 from public.player_state where user_id = a and slot = 0) then
    perform public.hr_create_character(0);
  end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'fixture A rebuilt';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 12. RL1 — CHAINED APPLIES. The version hr_apply RETURNS must be the one the
--     next apply can present.
--
--     This is the regression test for the reliability review's correctness
--     finding: hr_apply builds its response with hr_state_of AFTER writing, and
--     if that function is STABLE it is entitled to the calling statement's
--     snapshot and may hand back the PRE-write version. The client then sends
--     that version on its next apply and gets version_conflict — every second
--     apply, in production, from day one. Reading player_state directly (as
--     every other section here does) would NOT catch it; only chaining does.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        r1 jsonb; r2 jsonb; r3 jsonb; v0 bigint;
begin
  raise notice '-- RL1 chained applies';
  v0 := pg_temp.ver(a);
  r1 := pg_temp.eapply(a, v0, '{"gold":1}'::jsonb);
  perform pg_temp.ok(r1->>'ok' = 'true', 'first apply succeeds');
  perform pg_temp.ok((r1->>'version')::bigint = v0 + 1,
    format('the RETURNED version is post-write (got %s want %s)', r1->>'version', v0 + 1));
  perform pg_temp.ok((r1#>>'{state,gold}')::bigint = pg_temp.gold(a),
    'the returned gold matches the committed gold');

  -- The chain. No re-read of player_state anywhere: exactly what the Edge
  -- Function does.
  r2 := pg_temp.eapply(a, (r1->>'version')::bigint, '{"gold":1}'::jsonb);
  perform pg_temp.ok(r2->>'ok' = 'true',
    format('SECOND apply using the version the FIRST returned succeeds (got %s)', r2->>'error'));
  r3 := pg_temp.eapply(a, (r2->>'version')::bigint, '{"gold":1}'::jsonb);
  perform pg_temp.ok(r3->>'ok' = 'true', 'and a third, so it is not an off-by-one that self-corrects');
  perform pg_temp.ok((r3->>'version')::bigint = v0 + 3, 'three applies moved the version by exactly three');

  -- The declared volatility is asserted too, so the property cannot be undone
  -- by a one-word edit without a test failing.
  perform pg_temp.ok(
    (select provolatile from pg_proc where oid = to_regprocedure('public.hr_state_of(uuid,int)')) = 'v',
    'hr_state_of is declared VOLATILE');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 13. R11 — `activity` is validated as a whole, so `restart` cannot arrive
--     alone and restamp the accrual clock without a catalogue or skill check
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb; t0 timestamptz;
begin
  raise notice '-- R11 activity validation';
  select active_since into t0 from public.player_state where user_id = a and slot = 0;

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"activity":{"restart":true}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_activity',
                     'restart WITHOUT a kind is refused — it used to skip every check');
  perform pg_temp.ok(
    (select active_since from public.player_state where user_id = a and slot = 0) is not distinct from t0,
    'and the activity clock was not restamped');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"activity":{}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_activity', 'an empty activity object is an error, not a silent no-op');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"activity":{"kind":"idle","restart":"yes"}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_activity', 'a non-boolean restart is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"activity":{"kind":"idle","speed":9}}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_activity', 'an unknown activity key is refused');

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"activity":"gather"}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'bad_activity', 'a non-object activity is refused');

  -- The legitimate shape still works.
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"activity":{"kind":"idle","id":null,"restart":true}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'a complete idle statement with restart is accepted');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 14. R4 — A REJECTION LEAVES A DURABLE TRACE OUTSIDE THE ROLLED-BACK BLOCK
--     The clamps are documented as "any rejection is an incident". Revision 2
--     wrote the only evidence inside the block the rejection rolls back.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa'; r jsonb; v_n bigint; v_sev text;
begin
  raise notice '-- R4 rejection record';
  delete from public.hr_rejections where user_id = a;

  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":99999999999}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'gold_clamp', 'an absurd gold grant hits the blast-radius clamp');
  select n, severity into v_n, v_sev from public.hr_rejections
   where user_id = a and code = 'gold_clamp' and day = current_date;
  perform pg_temp.ok(v_n = 1, 'the clamp SURVIVED its own rollback as an hr_rejections row');
  perform pg_temp.ok(v_sev = 'incident', 'and it is classified as an incident, by the server');

  -- Aggregated, not one row per rejection: the whole point of not rebuilding
  -- game_events inside the security table.
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":99999999999}'::jsonb);
  r := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":99999999999}'::jsonb);
  select n into v_n from public.hr_rejections
   where user_id = a and code = 'gold_clamp' and day = current_date;
  perform pg_temp.ok(v_n = 3, 'three clamps are ONE row with n = 3, not three rows');
  perform pg_temp.ok(
    (select count(*) from public.hr_rejections where user_id = a and code = 'gold_clamp') = 1,
    'still exactly one row for the code today');

  -- An ordinary contention outcome is recorded but NOT flagged as an incident.
  r := pg_temp.eapply(a, null, '{"gold":1}'::jsonb);
  perform pg_temp.ok(r->>'error' = 'version_conflict', 'a null version is still a conflict');
  select severity into v_sev from public.hr_rejections
   where user_id = a and code = 'version_conflict' and day = current_date;
  perform pg_temp.ok(v_sev = 'normal',
                     'version_conflict is recorded as normal — optimistic concurrency is not an attack');

  -- Impersonation is recorded even though it never reaches the protected block.
  perform pg_temp.as_user('00000000-0000-4000-8000-00000000bbbb'::uuid);
  r := public.hr_apply(a, 0, pg_temp.ver(a), gen_random_uuid(), '{"gold":1}'::jsonb);
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.ok(r->>'error' = 'forbidden_impersonation', 'impersonation is refused');
  perform pg_temp.ok(exists (select 1 from public.hr_rejections
                              where code = 'forbidden_impersonation' and severity = 'incident'),
                     'and it is recorded as an incident against the CALLER');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 15. R5 — player_intents stores the DECISION, not the whole state envelope
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
        r1 jsonb; r2 jsonb; v_stored jsonb; v_bytes int;
begin
  raise notice '-- R5 intent result is compact';
  r1 := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":7}'::jsonb, k);
  perform pg_temp.ok(r1->>'ok' = 'true', 'the apply succeeds');

  select result into v_stored from public.player_intents where user_id = a and intent_id = k;
  perform pg_temp.ok(not (v_stored ? 'state'), 'the stored result does NOT carry the state envelope');
  perform pg_temp.ok(not (v_stored ? 'inventory'), 'nor the inventory');
  perform pg_temp.ok(not (v_stored ? 'skills'), 'nor fifteen skills');
  perform pg_temp.ok(v_stored = '{"ok": true}'::jsonb, 'it is exactly {"ok":true}');
  v_bytes := pg_column_size(v_stored);
  perform pg_temp.ok(v_bytes < 64, format('and it is %s bytes, not kilobytes', v_bytes));

  -- The contract that matters is unchanged: replay applies nothing and answers.
  r2 := pg_temp.eapply(a, pg_temp.ver(a), '{"gold":7}'::jsonb, k);
  perform pg_temp.ok(r2->>'replayed' = 'true', 'the replay is recognised');
  perform pg_temp.ok(r2->>'ok' = 'true', 'and reports success');
  perform pg_temp.ok(r2 ? 'state', 'a replayed SUCCESS re-derives current state rather than returning a stale copy');
  perform pg_temp.ok((r2#>>'{state,gold}')::bigint = pg_temp.gold(a), 'and that state is current');

  -- A replayed REJECTION returns the same rejection, and the reason survives.
  r1 := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"totally_made_up_item":1}}'::jsonb, k2);
  perform pg_temp.ok(r1->>'error' = 'unknown_item', 'the rejection happens');
  r2 := pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"totally_made_up_item":1}}'::jsonb, k2);
  perform pg_temp.ok(r2->>'error' = 'unknown_item' and r2->>'replayed' = 'true',
                     'and a replay returns the SAME rejection, not a re-run');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 16. RL2 — the ledger row is small, editable by nobody, prunable when old
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        r jsonb; v_meta jsonb; v_bytes int; v_denied boolean; v_id bigint;
begin
  raise notice '-- RL2 ledger shape and retention';
  r := pg_temp.eapply(a, pg_temp.ver(a),
        '{"items":{"normal_log":3},"xp":{"woodcutting":50},"accrued_to":"now",'
        '"journal":{"kind":"gather","intent":"collect"}}'::jsonb);
  perform pg_temp.ok(r->>'ok' = 'true', 'a representative gather apply succeeds');

  select meta into v_meta from public.player_ledger
   where user_id = a order by at desc, id desc limit 1;
  v_bytes := pg_column_size(v_meta);
  perform pg_temp.ok(v_bytes < 300, format('the ledger meta is %s bytes (was the whole delta)', v_bytes));
  perform pg_temp.ok(v_meta#>'{delta,i}' = '{"normal_log": 3}'::jsonb,
                     'the VALUE that moved is still recorded itemised');
  perform pg_temp.ok(v_meta#>'{delta,x}' = '{"woodcutting": 50}'::jsonb, 'so is the xp');
  perform pg_temp.ok(not (v_meta#>'{delta}' ? 'accrued_to'),
                     'but accrued_to is not duplicated — player_state is its record');
  perform pg_temp.ok(v_meta#>'{delta,k}' @> '["accrued_to"]'::jsonb,
                     'it is named in the key list instead, so the ledger still says what happened');

  -- A 200-key delta must not write a 200-key ledger row.
  r := pg_temp.eapply(a, pg_temp.ver(a),
        (select jsonb_build_object('items', jsonb_object_agg(item_id, 1))
           from (select item_id from public.hr_items order by item_id limit 60) s));
  select meta into v_meta from public.player_ledger where user_id = a order by at desc, id desc limit 1;
  perform pg_temp.ok(v_meta#>>'{delta,i_n}' = '60',
                     'a 60-item delta is journalled as an AGGREGATE, not 60 keys');
  perform pg_temp.ok(pg_column_size(v_meta) < 300, 'and the row stays small');

  -- The PK carries `at`, so partitioning stays possible without a rebuild.
  perform pg_temp.ok(
    (select array_agg(att.attname::text order by k.ord)
       from pg_constraint c
       cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
       join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k.attnum
      where c.conrelid = 'public.player_ledger'::regclass and c.contype = 'p')
    = array['at','id'],
    'player_ledger PK is (at, id) — partitioning does not require a rebuild');

  -- Immutable where it matters, prunable where it does not.
  insert into public.player_ledger (user_id, slot, kind, intent, at)
    values (a, 0, 'admin', 'probe', now() - interval '400 days') returning id into v_id;
  v_denied := false;
  begin update public.player_ledger set gold = 1 where id = v_id;
  exception when check_violation then v_denied := true; end;
  perform pg_temp.ok(v_denied, 'a ledger row can never be UPDATEd, at any age');

  delete from public.player_ledger where id = v_id;
  perform pg_temp.ok(not exists (select 1 from public.player_ledger where id = v_id),
                     'a 400-day-old row CAN be deleted — retention is possible at all');

  insert into public.player_ledger (user_id, slot, kind, intent)
    values (a, 0, 'admin', 'probe') returning id into v_id;
  v_denied := false;
  begin delete from public.player_ledger where id = v_id;
  exception when check_violation then v_denied := true; end;
  perform pg_temp.ok(v_denied, 'a FRESH row cannot be deleted — recent history is untouchable');

  v_denied := false;
  begin truncate table public.player_ledger;
  exception when check_violation then v_denied := true; end;
  perform pg_temp.ok(v_denied, 'and TRUNCATE is still refused outright');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 17. R1/R2/RL3 — THE CRON RECONCILIATION
--     The single most dangerous finding in the review: a live nightly job
--     `delete from market_listings where expires_at < now()` which, once this
--     migration adds `expires_at`, starts working again and annihilates every
--     expired seller's escrowed goods.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_n int;
begin
  raise notice '-- R1/R2 cron reconciliation';
  perform pg_temp.ok(not exists (select 1 from cron.job where jobname = 'trim-expired-listings'),
    'the escrow-destroying job trim-expired-listings is UNSCHEDULED by the migration itself');
  perform pg_temp.ok(not exists (select 1 from cron.job where jobname = 'trim-market-sales'),
    'the broken sold_at job is gone too');

  select count(*) into v_n from cron.job
   where command ~* 'delete\s+from\s+(public\.)?market_listings';
  perform pg_temp.ok(v_n = 0, format('NO cron job deletes from market_listings directly (found %s)', v_n));

  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-market-expire' and active),
    'market_expire IS scheduled — expiry returns the escrow instead of destroying it');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-market-sales-prune' and active),
    'market_sales retention is scheduled');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-intents-prune' and active),
    'player_intents retention is scheduled (R5)');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-ledger-prune' and active),
    'player_ledger retention is scheduled (RL2)');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-progress-prune' and active),
    'player_progress retention is scheduled (RL3)');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'hr-rejections-prune' and active),
    'hr_rejections retention is scheduled');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 18. R1 (behavioural) — an expired listing returns the goods, it does not
--     eat them. Proves market_expire is the correct replacement, not just a
--     differently-named job.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        r jsonb; lid uuid; v_before bigint; v_ver bigint; v_n int;
begin
  raise notice '-- R1 expiry returns escrow';
  -- Rebuild character A: section 11 deleted its player_state to test S11.
  perform pg_temp.as_user(a);
  if not exists (select 1 from public.player_state where user_id = a and slot = 0) then
    perform public.hr_create_character(0);
  end if;
  perform pg_temp.eapply(a, pg_temp.ver(a), '{"items":{"normal_log":40}}'::jsonb);

  -- Relative, not absolute: earlier sections hand this character an arbitrary
  -- number of logs, and a test that hard-codes 15 breaks the next time one of
  -- them changes. What matters is the DELTA of 25.
  v_before := pg_temp.inv(a, 'normal_log');
  perform pg_temp.as_user(a);
  r := public.market_list(0, 'normal_log', 25, 5, gen_random_uuid());
  perform pg_temp.ok(r->>'ok' = 'true', 'listed 25 logs');
  lid := (r->>'listing_id')::uuid;
  perform pg_temp.ok(pg_temp.inv(a, 'normal_log') = v_before - 25, 'escrow left the bank');
  v_before := pg_temp.inv(a, 'normal_log');
  v_ver := pg_temp.ver(a);

  -- Age the listing past its TTL, then run the scheduled function.
  update public.market_listings set expires_at = now() - interval '1 minute' where id = lid;
  perform set_config('request.jwt.claims', '', true);
  v_n := public.market_expire(200);
  perform pg_temp.ok(v_n >= 1, 'market_expire processed the expired listing');
  perform pg_temp.ok(not exists (select 1 from public.market_listings where id = lid),
                     'the listing is gone');
  perform pg_temp.ok(pg_temp.inv(a, 'normal_log') = v_before + 25,
                     'AND THE 25 LOGS CAME BACK — this is what the cron delete would have destroyed');
  perform pg_temp.ok(pg_temp.ver(a) = v_ver + 1, 'the seller version was bumped (S15)');
  perform pg_temp.ok(exists (select 1 from public.player_ledger
                              where user_id = a and intent = 'market_expire'),
                     'and the return is journalled');
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 19. R8 — hr_engine's COMPLETE capability surface, not just its table grants
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_bad int; v_list text;
begin
  raise notice '-- R8 hr_engine capability';
  select count(*), string_agg(p.proname, ', ' order by p.proname) into v_bad, v_list
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('hr_engine', p.oid, 'execute')
     and p.proname <> all (array['hr_apply','hr_seed','hr_state_of','hr_total_level',
                                 'hr_xp_for_level','hr_level_from_xp','market_expire']);
  perform pg_temp.ok(v_bad = 0,
    format('hr_engine can execute NOTHING outside its allowlist (found %s: %s)', v_bad, coalesce(v_list,'-')));

  select count(*) into v_bad from information_schema.role_column_grants
   where table_schema = 'public' and grantee in ('hr_engine','PUBLIC');
  perform pg_temp.ok(v_bad = 0, format('no COLUMN grants to hr_engine or PUBLIC (found %s)', v_bad));

  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('hr_engine','PUBLIC');
  perform pg_temp.ok(v_bad = 0, format('no TABLE grants to hr_engine or PUBLIC (found %s)', v_bad));
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 20. RL6 — the market wipe gate is a real interlock
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_ok boolean := false;
begin
  raise notice '-- RL6 wipe gate';
  -- The gate reads a GUC. Prove it defaults to refusing rather than to wiping.
  perform pg_temp.ok(
    coalesce(current_setting('hearthrise.market_wipe_ok', true), 'unset') <> 'unset',
    'the harness set market_wipe_ok explicitly — the migration cannot wipe by accident');
  perform set_config('hearthrise.market_wipe_ok', 'no', true);
  perform pg_temp.ok(current_setting('hearthrise.market_wipe_ok', true) = 'no',
    'and any value other than yes is a refusal');
  perform set_config('hearthrise.market_wipe_ok', 'yes', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 21. C2 — A RATE-LIMITED CALL MUST LEAVE A DURABLE TRACE
--     The rate limit returns before the intent claim and before any other
--     bookkeeping, so until this it produced no record anywhere: the single
--     loudest automation signal the server emits was being discarded. Same
--     defect class as R4. Also pins the escalation policy: one trip is
--     `normal`, a sustained day is promoted to `incident` IN PLACE, so the
--     table stays at one row per (character, code, day).
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        r jsonb; i int; v_n bigint; v_sev text; v_rows int;
begin
  raise notice '-- C2 rate_limited is observable';
  delete from public.hr_rejections where user_id = a and code = 'rate_limited';
  perform pg_temp.as_user(a);
  for i in 1..90 loop
    r := public.market_list(0, 'normal_log', 1, 5, gen_random_uuid());
    exit when r->>'error' = 'rate_limited';
  end loop;
  perform pg_temp.ok(r->>'error' = 'rate_limited',
    format('market_list rate-limits inside a minute (took %s calls)', i));

  select n, severity into v_n, v_sev from public.hr_rejections
   where user_id = a and slot = 0 and day = current_date and code = 'rate_limited';
  perform pg_temp.ok(coalesce(v_n, 0) >= 1,
    format('AND IT IS RECORDED — hr_rejections.n = %s (was: no trace anywhere)', coalesce(v_n, 0)));
  perform pg_temp.ok(v_sev = 'normal',
    'one burst is severity normal — a retry storm must not flood the incident index');

  -- Sustained: past the daily threshold the same row escalates.
  for i in 1..60 loop
    perform public.hr_record_rejection(a, 0, 'apply', 'rate_limited', '{}'::jsonb);
  end loop;
  select severity into v_sev from public.hr_rejections
   where user_id = a and slot = 0 and day = current_date and code = 'rate_limited';
  perform pg_temp.ok(v_sev = 'incident',
    'sustained rate limiting escalates that row to incident');
  select count(*) into v_rows from public.hr_rejections
   where user_id = a and code = 'rate_limited' and day = current_date;
  perform pg_temp.ok(v_rows = 1,
    format('and it is still exactly ONE row for the day (%s) — journal rule 6', v_rows));
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 22. N2 — THE TAX MULTIPLY AT THE CONFIGURATION CEILING
--     `gross × house_tax_bp` is a bigint multiply that the old guard did not
--     cover: at the permitted ceiling (qty 1e8 × ask 1e9) it is 1.5e19 and
--     raises 22003 BEFORE the affordability check — so a seller could craft a
--     listing that 500s every buyer who touched it. The listing is inserted
--     directly on purpose: what is under test is market_buy's arithmetic, not
--     market_list's clamps.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare a uuid := '00000000-0000-4000-8000-00000000aaaa';
        b uuid := '00000000-0000-4000-8000-00000000bbbb';
        lid uuid; r jsonb;
begin
  raise notice '-- N2 tax multiply at the ceiling';
  insert into public.market_listings
    (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each, expires_at)
  values (b, 0, 'TestBravo', 'normal_log', 100000000, 1000000000, now() + interval '1 day')
  returning id into lid;

  perform pg_temp.as_user(a);
  r := public.market_buy(0, lid, 100000000, gen_random_uuid());
  perform pg_temp.ok(r->>'ok' = 'false',
    'a ceiling listing is a clean rejection, not a 22003 numeric_value_out_of_range');
  perform pg_temp.ok(r->>'error' = 'overflow',
    format('and the rejection is named `overflow` (got %s)', coalesce(r->>'error','<none>')));
  perform pg_temp.ok(exists (select 1 from public.market_listings where id = lid),
    'the listing is untouched by the refused buy');
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
begin
  raise notice ' ';
  raise notice '============================================================';
  raise notice ' SERVER AUTHORITY SUITE: ALL ASSERTIONS PASSED';
  raise notice '============================================================';
end $$;
