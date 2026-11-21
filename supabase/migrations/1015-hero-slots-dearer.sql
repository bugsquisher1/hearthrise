-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1015-hero-slots-dearer.sql — HERO SLOTS COST MORE: 400,000 / 1,500,000 / 4,000,000
--   (lane/c-approved-rows, backend-architect, 2026-11-20; Tyler 2026-11-20, balance call 24-9: "i think hero slots should cost even
--   more"; the designer's ladder A, docs/design/balance-program/24-economy.md "Q9 after Tyler's ruling"; was 300,000 / 750,000 / 1,500,000).
--
-- STATUS: supabase/migration-notes/1015-hero-slots-dearer.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base. No sibling: the generated unlock
--   offers carry the character_slot rows with no price (hr_unlock_buy refuses them by namespace; the sale is hr_buy_hero_slot's).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. ON THE EA SECURITY LIST (MONEY
--   SURFACE: a catalogue row a purchase reads).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 reprices public.hr_hero_slots: the second hero (slot_id 1) 400,000, the third (2) 1,500,000, the fourth (3) 4,000,000
--    (src/data/shops.js character_slot.1-.3, bound by tests/hero-slot-buy.mjs BIND). No starter, cap 4, as before. Every body that sells,
--    offers or checks a slot reads this table, so NO function body, grant or policy moves:
--      hr_account_view        the offer is the lowest unowned priced row: slot 1 at 400,000 for a new account
--      hr_buy_hero_slot       ladder order, price, per-day clamp, key and journal unchanged
--      hr_hero_slots_of       unchanged: a slot holding a hero or bought is owned
-- THE FIRST SLOT'S LINE (the designer's guard, tests/slot-price-guard.mjs): the second hero stays within what one lone hero banks by the
--    Level the party grounds open; the later two climb freely. That is a data guard over src/data/shops.js; this file carries the price.
--
-- ── LIVE ACCOUNTS ──────────────────────────────────────────────────────────
-- No write to any player row. A slot already bought or holding a hero stays owned (hr_hero_slots_of, clause 1 and 2); nobody is charged
--   again and nothing is refunded (the EA wipe resets every purse). §1's own assertion proves, on the database it runs on, that every
--   account's heroes (player_state, byte for byte) and every slot it holds a hero in or bought are untouched.
--
-- ── CONCURRENCY ────────────────────────────────────────────────────────────
-- A purchase racing the apply either commits before the update (the old price for a slot that was for sale) or reads the catalogue after it
--   (the new price; a quote the client held is stale and the server charges the catalogue, never the quote). No lock is held across the two.
-- RE-RUNNABLE: §0 accepts the 2027-03-25 ladder or this file's own; the update is a no-op the second time and §2 asserts the same.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- Three higher prices. The purchase's locks, ladder order, key, per-day clamp, debit predicate and journal do not move. Nothing from the
--   client is read that was not read before.
-- COST AT 100x: three rows rewritten in a 3-row catalogue; no table, index or journal. §1's assertion reads every account once at apply.
-- REVERSIBILITY: update hr_hero_slots back to 300,000 / 750,000 / 1,500,000 and restore the shops.js rows. Slots bought stay bought.
-- EDGE: no engine behaviour moves; the hr-accrue payload hash does (src/data/shops.js is in the bundle): one redeploy, either order.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 A PINNED UPDATE: IT RUNS ONLY OVER THE LADDER IT REPRICES ───────────
do $mig$
declare v_now text;
begin
  if to_regclass('public.hr_hero_slots') is null
     or to_regprocedure('public.hr_account_view(uuid,integer)') is null
     or to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'PRECONDITION: hr_hero_slots, hr_account_view, hr_buy_hero_slot__ungated or hr_hero_slots_of is absent';
  end if;
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now from public.hr_hero_slots;
  if v_now is distinct from '1:300000:false,2:750000:false,3:1500000:false'
     and v_now is distinct from '1:400000:false,2:1500000:false,3:4000000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the 2027-03-25 ladder this file reprices (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 THE LADDER, AND WHAT IT LEAVES EVERY ACCOUNT ──────────────────────────
-- The snapshot, the update and the assertion share one block, so the assertion reads the same database the update changed.
do $mig$
declare v_before jsonb; v_bad jsonb;
begin
  select coalesce(jsonb_object_agg(a.user_id::text, jsonb_build_object(
           'heroes', (select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = a.user_id),
           'kept', (select coalesce(jsonb_agg(s.slot order by s.slot), '[]'::jsonb) from (
                      select ps.slot from public.player_state ps where ps.user_id = a.user_id
                      union
                      select c.slot_id from public.hr_hero_slots c
                        join public.player_progress pp on pp.user_id = a.user_id and pp.slot = 0 and pp.kind = 'flag' and pp.period_key = ''
                         and pp.key = 'character_slot:' || c.slot_id and pp.value > 0) s))), '{}'::jsonb)
    into v_before
    from (select distinct ps.user_id from public.player_state ps) a;

  update public.hr_hero_slots as h
     set cost_gold = l.cost
    from (values (1, 400000::bigint), (2, 1500000::bigint), (3, 4000000::bigint)) as l(slot_id, cost)
   where h.slot_id = l.slot_id and h.cost_gold is distinct from l.cost;

  select jsonb_object_agg(b.key, jsonb_build_object('before', b.value, 'owned', public.hr_hero_slots_of(b.key::uuid)))
    into v_bad
    from jsonb_each(v_before) b
   where (select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = b.key::uuid)
           is distinct from b.value->>'heroes'
      or not (public.hr_hero_slots_of(b.key::uuid) @> (b.value->'kept'));
  if v_bad is not null then
    raise exception 'hero-slots-dearer §1: the apply moved an account''s heroes or a slot it holds a hero in or bought: %', left(v_bad::text, 600);
  end if;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
-- Every probe is its own account and rolled back. Nothing here reads or counts a real player's row.
do $check$
declare
  c_new  uuid := gen_random_uuid();   -- a new account
  c_old  uuid := gen_random_uuid();   -- an account that bought slot 1 before the reprice
  v_now  text;
  v_c1   bigint; v_c2 bigint; v_c3 bigint;
  v      jsonb;
  v_role text;
begin
  -- (a) the catalogue: no starter, 400,000 / 1,500,000 / 4,000,000, each dearer than the one before; four heroes = the play cap.
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now from public.hr_hero_slots;
  if v_now is distinct from '1:400000:false,2:1500000:false,3:4000000:false' then
    raise exception 'VERIFY(a): hr_hero_slots reads %, not 400,000 / 1,500,000 / 4,000,000 with no starter', v_now; end if;
  if (select max(slot_id) + 1 from public.hr_hero_slots) is distinct from public.hr_hunt_limit('max_concurrent')::int then
    raise exception 'VERIFY(a): an account holds % heroes and % may play at once', (select max(slot_id) + 1 from public.hr_hero_slots),
      public.hr_hunt_limit('max_concurrent'); end if;
  select cost_gold into v_c1 from public.hr_hero_slots where slot_id = 1;
  select cost_gold into v_c2 from public.hr_hero_slots where slot_id = 2;
  select cost_gold into v_c3 from public.hr_hero_slots where slot_id = 3;

  begin
    insert into auth.users (id) values (c_new), (c_old) on conflict (id) do nothing;
    insert into public.profiles (id) values (c_new), (c_old) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (c_new, 'hero-slots-dearer §2 probe'), (c_old, 'hero-slots-dearer §2 probe') on conflict (user_id) do nothing;

    -- (b) a NEW account is offered the second hero at 400,000; one gold short is refused and nothing moves; then 1, 2, 3 in order at
    --     exactly their prices, and nothing more for sale.
    perform set_config('request.jwt.claim.sub', c_new::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character(0) refused: %', v; end if;
    if public.hr_account_view(c_new, 0)->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 1, 'cost_gold', 400000) then
      raise exception 'VERIFY(b): a new account is offered %', public.hr_account_view(c_new, 0)->'hero_slot_offer'; end if;
    insert into public.account_wallet as w (user_id, gold) values (c_new, v_c1 - 1)
      on conflict (user_id) do update set gold = excluded.gold;
    v := public.hr_buy_hero_slot__ungated(1, 0, gen_random_uuid());
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.account_wallet where user_id = c_new) <> v_c1 - 1 then
      raise exception 'VERIFY(b): slot 1 one gold short answered %', v; end if;
    update public.account_wallet set gold = v_c1 + v_c2 + v_c3 + 7 where user_id = c_new;
    v := public.hr_buy_hero_slot__ungated(1, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', 1500000) then
      raise exception 'VERIFY(b): slot 1 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(2, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 3, 'cost_gold', 4000000) then
      raise exception 'VERIFY(b): slot 2 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(3, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' <> 'null'::jsonb then
      raise exception 'VERIFY(b): the fourth hero''s slot answered % (expected ok and nothing more for sale)', v; end if;
    if public.hr_hero_slots_of(c_new) is distinct from '[0,1,2,3]'::jsonb
       or (select gold from public.account_wallet where user_id = c_new) <> 7
       or (select count(*) from public.player_ledger where user_id = c_new and kind = 'hero_slot') <> 3
       or (select sum(gold) from public.player_ledger where user_id = c_new and kind = 'hero_slot') <> -(v_c1 + v_c2 + v_c3) then
      raise exception 'VERIFY(b): the ladder did not cost exactly % gold in three rows (owned %, purse %)', v_c1 + v_c2 + v_c3,
        public.hr_hero_slots_of(c_new), (select gold from public.account_wallet where user_id = c_new); end if;

    -- (c) an account that BOUGHT slot 1 at the old price keeps it and is offered slot 2 at the new one: no claw-back, no second charge.
    perform set_config('request.jwt.claim.sub', c_old::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character(0) refused: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key)
      values (c_old, 0, 'flag', 'character_slot:1', 1, '');
    if public.hr_hero_slots_of(c_old) is distinct from '[0,1]'::jsonb
       or public.hr_account_view(c_old, 0)->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', 1500000) then
      raise exception 'VERIFY(c): an account that bought slot 1 owns % and is offered %', public.hr_hero_slots_of(c_old),
        public.hr_account_view(c_old, 0)->'hero_slot_offer'; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): a hero in the slot bought before answered %', v; end if;

    raise exception using errcode = 'HR946', message = 'hero-slots-dearer §2 complete - rolling back';
  exception when sqlstate 'HR946' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (d) ZERO LEAK; the catalogue and the bodies stay out of every client's reach.
  if exists (select 1 from public.player_state where user_id in (c_new, c_old))
     or exists (select 1 from public.player_ledger where user_id in (c_new, c_old))
     or exists (select 1 from public.account_wallet where user_id in (c_new, c_old))
     or exists (select 1 from auth.users where id in (c_new, c_old)) then
    raise exception 'VERIFY(d): §2 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_hero_slots', 'insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(d): % can write the hero-slot catalogue or reach the purchase body or the account view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-slots-dearer: 400,000 / 1,500,000 / 4,000,000 in order at exactly their prices; a slot bought before kept and the next offered '
               'at the new price; every live account''s heroes and held slots untouched; zero leak.';
end $check$;
