-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1036-four-starter-slots.sql — ALL FOUR HERO SLOTS ARE THE ACCOUNT'S FROM THE START, AND THE SLOT PURCHASE LEAVES
--   (lane/c-first-hour, FB-5, backend-architect, 2026-11-21; Tyler 2026-11-21, executive decision: "just allow all 4 characters from the
--   start"; docs/design/overhaul/13-build-plan.md FB-5; it REPLACES the staged, never-applied 1015-hero-slots-dearer.sql, withdrawn).
--
-- STATUS: supabase/migration-notes/1036-four-starter-slots.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. ON THE EA SECURITY LIST (MONEY
--   SURFACE: a purchase leaves and a catalogue every entitlement reads moves).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 public.hr_hero_slots: slots 1, 2 and 3 become STARTER rows at no cost (starter = true, cost_gold = 0). Slot 0 is never in the
--    catalogue and always owned. Every body that states ownership already reads the starter column, so no body moves for it:
--      hr_hero_slots_of       clause (0): every account owns its starters, so every account owns [0,1,2,3] from its first second
--      hr_account_view        hero_slots_max 4; hero_slot_offer is the lowest unowned PRICED row, so it is null for everyone
--      hr_create_character    slots 0..3 owned; 4 and 5 answer slot_not_owned, over 5 bad_slot (unchanged)
-- §2 THE PURCHASE LEAVES (no back-compat, CLAUDE.md §1): hr_buy_hero_slot and its body hr_buy_hero_slot__ungated are dropped and their
--    row leaves hr_client_rpc_baseline, so the drift detector (hr_assert_grant_hygiene) holds the smaller surface. Nothing is for sale,
--    and a verb that can only refuse is a money surface with no purpose. The client loses its call in the same lane
--    (src/session/account-session.js, src/app/slot-offer.js), and src/data/shops.js loses the three character_slot offers (the unlock
--    catalogues generated from it retire character_slot:1..3).
-- REFUSAL CODES: none new. A raw call of hr_buy_hero_slot answers 404 (no such function) from PostgREST.
--
-- ── LIVE ACCOUNTS (L-01) ───────────────────────────────────────────────────
-- 9 slots were bought for 385,000 gold by 4 accounts (COUNTED, production, 2026-11-21). No refund (Tyler 2026-11-07, 2026-11-09): no
--   player row is written. A bought slot stays owned (now as a starter, and its character_slot flag row stays, read by clause 2 as
--   before); a hero in any slot stays where it is. §1 proves, on the database it runs on, that every account's heroes (player_state,
--   byte for byte), purse and owned slots are untouched or larger. Release note: "All four hero slots are free. Gold paid for slots is
--   not returned."
--
-- ── CONCURRENCY ────────────────────────────────────────────────────────────
-- A purchase racing the apply either commits before it (a slot bought at the old price, kept, as above) or finds no function after it.
--   A creation racing it reads the catalogue once inside its own statement: before, slot 1..3 needs a bought flag; after, it is owned.
-- RE-RUNNABLE: §0 accepts the production ladder or this file's own; the update and the drops are no-ops the second time.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- SMALLER: one client-callable money verb fewer. More heroes per account are entitled at once, but the play cap (four at once) and the
--   slot catalogue's top (slot 3) do not move, and the kit a new hero brings is paid once a slot and once an account
--   (1038-start-kits.sql), so free slots mint nothing.
-- COST AT 100x: three catalogue rows rewritten; two functions and one baseline row removed. No table, index or journal.
-- REVERSIBILITY: set hr_hero_slots back to 300,000 / 750,000 / 1,500,000 with starter false, restore hr_buy_hero_slot from
--   2026-11-03-hero-slots-gold.sql with its baseline row, and the shops.js rows. Slots owned in between stay owned only for accounts
--   holding a hero there (clause 1).
-- EDGE: none. src/data/shops.js is in the hr-accrue bundle, so its payload hash moves with the release's one deploy.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 A PINNED UPDATE: IT RUNS ONLY OVER THE LADDER IT FREES ──────────────
do $mig$
declare v_now text;
begin
  if to_regclass('public.hr_hero_slots') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_account_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_create_character(integer)') is null then
    raise exception 'PRECONDITION: hr_hero_slots, hr_client_rpc_baseline, hr_account_view, hr_hero_slots_of or hr_create_character is absent';
  end if;
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now from public.hr_hero_slots;
  if v_now is distinct from '1:300000:false,2:750000:false,3:1500000:false'
     and v_now is distinct from '1:0:true,2:0:true,3:0:true' then
    raise exception 'PRECONDITION: hr_hero_slots is not the 2027-03-25 ladder this file frees (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 FOUR STARTER SLOTS, AND WHAT IT LEAVES EVERY ACCOUNT ──────────────────
-- The snapshot, the update and the assertion share one block, so the assertion reads the same database the update changed.
do $mig$
declare v_before jsonb; v_bad jsonb;
begin
  select coalesce(jsonb_object_agg(a.user_id::text, jsonb_build_object(
           'heroes', (select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = a.user_id),
           'purse', (select w.gold from public.account_wallet w where w.user_id = a.user_id),
           'owned', public.hr_hero_slots_of(a.user_id))), '{}'::jsonb)
    into v_before
    from (select distinct ps.user_id from public.player_state ps) a;

  update public.hr_hero_slots
     set starter = true, cost_gold = 0
   where slot_id in (1, 2, 3) and (not starter or cost_gold <> 0);

  select jsonb_object_agg(b.key, jsonb_build_object('before', b.value, 'owned', public.hr_hero_slots_of(b.key::uuid)))
    into v_bad
    from jsonb_each(v_before) b
   where (select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = b.key::uuid)
           is distinct from b.value->>'heroes'
      or (select w.gold from public.account_wallet w where w.user_id = b.key::uuid) is distinct from (b.value->>'purse')::bigint
      or not (public.hr_hero_slots_of(b.key::uuid) @> (b.value->'owned'))
      or public.hr_hero_slots_of(b.key::uuid) is distinct from '[0,1,2,3]'::jsonb;
  if v_bad is not null then
    raise exception 'four-starter-slots §1: an account''s heroes or purse moved, or it does not own the four slots: %', left(v_bad::text, 600);
  end if;
end $mig$;

-- ── §2 THE PURCHASE LEAVES ─────────────────────────────────────────────────
drop function if exists public.hr_buy_hero_slot(integer, integer, uuid);
drop function if exists public.hr_buy_hero_slot__ungated(integer, integer, uuid);
delete from public.hr_client_rpc_baseline where proname = 'hr_buy_hero_slot';

-- ── §3 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
-- Every probe is its own account and rolled back. Nothing here reads or counts a real player's row.
do $check$
declare
  c_new  uuid := gen_random_uuid();   -- a new account
  c_old  uuid := gen_random_uuid();   -- an account that bought slot 1 under the old ladder
  v_now  text;
  v      jsonb;
  v_role text;
  s      int;
begin
  -- (a) the catalogue: three starter rows at no cost; with slot 0 an account holds exactly as many heroes as may play at once.
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:0:true,3:0:true' then
    raise exception 'VERIFY(a): hr_hero_slots reads %, not three free starter slots', v_now; end if;
  if (select max(slot_id) + 1 from public.hr_hero_slots) is distinct from public.hr_hunt_limit('max_concurrent')::int then
    raise exception 'VERIFY(a): an account holds % heroes and % may play at once', (select max(slot_id) + 1 from public.hr_hero_slots),
      public.hr_hunt_limit('max_concurrent'); end if;

  begin
    insert into auth.users (id) values (c_new), (c_old) on conflict (id) do nothing;
    insert into public.profiles (id) values (c_new), (c_old) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (c_new, 'four-starter-slots §3 probe'), (c_old, 'four-starter-slots §3 probe') on conflict (user_id) do nothing;

    -- (b) a NEW account owns all four before it has a hero, is offered nothing, makes a hero in each, and a fifth is refused.
    if public.hr_hero_slots_of(c_new) is distinct from '[0,1,2,3]'::jsonb then
      raise exception 'VERIFY(b): a new account owns %', public.hr_hero_slots_of(c_new); end if;
    perform set_config('request.jwt.claim.sub', c_new::text, true);
    foreach s in array array[2, 0, 3, 1] loop
      v := public.hr_create_character(s);
      if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'true' then
        raise exception 'VERIFY(b): a hero in slot % answered %', s, v; end if;
    end loop;
    if public.hr_account_view(c_new, 0)->'hero_slot_offer' <> 'null'::jsonb
       or (public.hr_account_view(c_new, 0)->>'hero_slots_max')::int <> 4 then
      raise exception 'VERIFY(b): a new account is offered % of %', public.hr_account_view(c_new, 0)->'hero_slot_offer',
        public.hr_account_view(c_new, 0)->'hero_slots_max'; end if;
    v := public.hr_create_character(4);
    if v->>'error' is distinct from 'slot_not_owned' or exists (select 1 from public.player_state where user_id = c_new and slot = 4) then
      raise exception 'VERIFY(b): a fifth hero answered %', v; end if;
    if exists (select 1 from public.player_ledger where user_id = c_new and kind = 'hero_slot') then
      raise exception 'VERIFY(b): a free slot wrote a purchase row'; end if;

    -- (c) an account that BOUGHT slot 1 before keeps it and the rest come free: no claw-back, no charge, no refund.
    perform set_config('request.jwt.claim.sub', c_old::text, true);
    v := public.hr_create_character(0);
    insert into public.player_progress (user_id, slot, kind, key, value, period_key)
      values (c_old, 0, 'flag', 'character_slot:1', 1, '');
    if public.hr_hero_slots_of(c_old) is distinct from '[0,1,2,3]'::jsonb then
      raise exception 'VERIFY(c): an account that bought slot 1 owns %', public.hr_hero_slots_of(c_old); end if;

    raise exception using errcode = 'HR946', message = 'four-starter-slots §3 complete - rolling back';
  exception when sqlstate 'HR946' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (d) the purchase is gone, from the schema and from the client surface; ZERO LEAK.
  if to_regproc('public.hr_buy_hero_slot') is not null or to_regproc('public.hr_buy_hero_slot__ungated') is not null
     or exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_buy_hero_slot') then
    raise exception 'VERIFY(d): the hero slot purchase still stands'; end if;
  if exists (select 1 from public.player_state where user_id in (c_new, c_old))
     or exists (select 1 from public.player_ledger where user_id in (c_new, c_old))
     or exists (select 1 from public.account_wallet where user_id in (c_new, c_old))
     or exists (select 1 from auth.users where id in (c_new, c_old)) then
    raise exception 'VERIFY(d): §3 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_hero_slots', 'insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(d): % can write the hero-slot catalogue or reach the account view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'four-starter-slots: every account owns slots 0-3 from its first second, nothing is for sale, the purchase verb is gone; '
               'a slot bought before stays owned with no refund; every live account''s heroes and purse untouched; zero leak.';
end $check$;
