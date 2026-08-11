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

do $$
begin
  raise notice ' ';
  raise notice '============================================================';
  raise notice ' SERVER AUTHORITY SUITE: ALL ASSERTIONS PASSED';
  raise notice '============================================================';
end $$;
