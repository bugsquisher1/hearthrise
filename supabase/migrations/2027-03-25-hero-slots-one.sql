-- ==========================================================================
-- 2027-03-25-hero-slots-one.sql — ONE HERO SLOT TO START; THE SECOND COSTS ABOUT A WEEK
--   (lane/c-death-and-slots, backend-architect, 2026-11-09; Tyler the same day: "like a week to afford the first alt"; the
--   designer's ladder, docs/planning/PRIORITY_BOARD.md "2026-11-09 Death share and alt price", table E and Lane C rows 1-3,
--   slots half).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). No wipe is planned
-- (Tyler 2026-11-09): it prices the slots live accounts do not own yet. ON THE EA SECURITY LIST (MONEY SURFACE: a catalogue row a
-- purchase reads).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 rewrites public.hr_hero_slots: slot 1 stops being a starter and is sold for 300,000 gold, slot 2 costs 750,000 and slot 3
--    1,500,000 (src/data/shops.js character_slot.1-.3, bound by tests/hero-slot-buy.mjs). Cap 4 as before (= max_concurrent).
--    Every body that sells, offers or checks a slot already reads this table, so NO function body, grant or policy moves:
--      hr_hero_slots_of       clause (0) names no starter now: a new account owns slot 0 only
--      hr_account_view        the offer is the lowest unowned priced row: slot 1 at 300,000 for a new account
--      hr_buy_hero_slot       ladder order, price, per-day clamp, key and journal unchanged; slot 2 needs slot 1
--      hr_create_character    slot 1 is `slot_not_owned` until bought
--    Siblings in this lane: 2027-03-25-hero-slots-one-unlocks.generated.sql (character_slot:1 is an unlock id again) and
--    2027-03-25-hero-slots-one-unlock-offers.generated.sql (the character_slot.1 offer row, refused by hr_unlock_buy's namespace like
--    the others: the sale is hr_buy_hero_slot's).
--
-- ── LIVE ACCOUNTS (Tyler 2026-11-09: "if it messes with peoples characters who cares, just tell them in the changelog") ──
-- No special handling and no write to any player row. What an account keeps follows from the rules already in hr_hero_slots_of:
-- a slot holding a hero is owned (clause 1, an existing character IS ownership) and a slot bought is owned (clause 2, its flag row).
-- The one thing that changes: an account whose FREE slot 1 is EMPTY no longer owns it (clause 0 named it); it is sold at 300,000
-- like any other. The Discord note says so. §1's own assertion proves, on the database it runs on, that every account's heroes and
-- every slot holding a hero or bought are untouched.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- One priced row more (slot 1) and two higher prices. The purchase's locks, ladder order, key, per-day clamp, debit predicate and
-- journal do not move. Nothing from the client is read that was not read before. A purse that held 25,000 for the old third slot now
-- buys nothing until 750,000: no gold moves at the apply.
--
-- COST AT 100x: three rows rewritten in a 3-row catalogue; no table, index or journal. §1's assertion reads every account once
-- (two small reads an account), at apply time only.
-- CONCURRENCY: a purchase racing the apply either commits before the update (it paid the old price for a slot that was for sale)
--   or reads the catalogue after it (the new price; a quote the client held is stale, and the server charges the catalogue, never
--   the quote). No lock is held across the two.
-- REVERSIBILITY: update hr_hero_slots back to 1 starter 0 / 2 25,000 / 3 75,000 and restore the shops.js rows; the generators then
--   drop character_slot:1 again. Slots bought at the new prices stay bought (a flag row).
-- RE-RUNNABLE: §0 accepts the 2027-03-22 ladder or this file's own; the update is a no-op the second time and §2 asserts the same.
-- ORDER: after 2027-03-22-four-slots.sql (and the 2027-03-22 sequence), then its two generated siblings. EDGE: no engine behaviour
--   moves, but the hr-accrue payload hash does (src/data/shops.js is in the bundle): one redeploy, either order.
-- ==========================================================================

-- ── §0 A PINNED UPDATE: IT RUNS ONLY OVER THE LADDER IT REPRICES ───────────
do $mig$
declare v_now text;
begin
  if to_regclass('public.hr_hero_slots') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_hero_slots' and column_name = 'starter')
     or to_regprocedure('public.hr_account_view(uuid,integer)') is null
     or to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'PRECONDITION: hr_hero_slots (with starter), hr_account_view, hr_buy_hero_slot__ungated or hr_hero_slots_of is absent';
  end if;
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:25000:false,3:75000:false'
     and v_now is distinct from '1:300000:false,2:750000:false,3:1500000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the 2027-03-22 ladder this file reprices (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 THE LADDER, AND WHAT IT LEAVES EVERY ACCOUNT ──────────────────────────
-- The snapshot, the update and the assertion share one block, so the assertion reads the same database the update changed:
-- for every account with a hero, its heroes (every player_state row, byte for byte) and every slot that holds a hero or was bought
-- are owned after exactly as before. Nothing is written to any player row.
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
     set starter = false, cost_gold = l.cost
    from (values (1, 300000::bigint), (2, 750000::bigint), (3, 1500000::bigint)) as l(slot_id, cost)
   where h.slot_id = l.slot_id and (h.starter or h.cost_gold is distinct from l.cost);

  select jsonb_object_agg(b.key, jsonb_build_object('before', b.value, 'owned', public.hr_hero_slots_of(b.key::uuid)))
    into v_bad
    from jsonb_each(v_before) b
   where (select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = b.key::uuid)
           is distinct from b.value->>'heroes'
      or not (public.hr_hero_slots_of(b.key::uuid) @> (b.value->'kept'));
  if v_bad is not null then
    raise exception 'hero-slots-one §1: the apply moved an account''s heroes or a slot it holds a hero in or bought: %', left(v_bad::text, 600);
  end if;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
-- Every probe is its own account, scoped by its id, and rolled back. Nothing here reads or counts a real player's row.
do $check$
declare
  v_new  constant uuid := '000000c0-0000-4000-8000-0000f0a51101';   -- a new account
  v_two  constant uuid := '000000c0-0000-4000-8000-0000f0a51102';   -- an account already holding a hero in slot 1
  v_now  text;
  v_max  int;
  v_c1   bigint; v_c2 bigint; v_c3 bigint;
  v      jsonb;
  v_acc  jsonb;
  v_role text;
begin
  -- (a) the catalogue: no starter, 300,000 / 750,000 / 1,500,000; four heroes, the play cap.
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id), max(slot_id) + 1
    into v_now, v_max from public.hr_hero_slots;
  if v_now is distinct from '1:300000:false,2:750000:false,3:1500000:false' then
    raise exception 'VERIFY(a): hr_hero_slots reads %, not 300,000 / 750,000 / 1,500,000 with no starter', v_now; end if;
  if v_max is distinct from 4 or v_max is distinct from public.hr_hunt_limit('max_concurrent')::int then
    raise exception 'VERIFY(a): an account holds % heroes and % may play at once (Tyler 2026-11-07: four, the same number)',
      v_max, public.hr_hunt_limit('max_concurrent'); end if;
  select cost_gold into v_c1 from public.hr_hero_slots where slot_id = 1;
  select cost_gold into v_c2 from public.hr_hero_slots where slot_id = 2;
  select cost_gold into v_c3 from public.hr_hero_slots where slot_id = 3;

  begin
    perform set_config('request.jwt.claim.sub', v_new::text, true);
    insert into auth.users (id) values (v_new), (v_two) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_new), (v_two) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (v_new, 'hero-slots-one §2 probe'), (v_two, 'hero-slots-one §2 probe') on conflict (user_id) do nothing;

    -- (b) a NEW account owns slot 0 alone, is offered the second hero at 300,000, and cannot make a hero in slot 1 unpaid.
    if public.hr_hero_slots_of(v_new) is distinct from '[0]'::jsonb then
      raise exception 'VERIFY(b): a new account owns %, expected [0]', public.hr_hero_slots_of(v_new); end if;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character(0) refused: %', v; end if;
    v_acc := public.hr_account_view(v_new, 0);
    if v_acc->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 1, 'cost_gold', v_c1)
       or (v_acc->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(b): a new account reads %', v_acc; end if;
    v := public.hr_create_character(1);
    if v->>'error' is distinct from 'slot_not_owned' then raise exception 'VERIFY(b): a hero in an unbought slot 1 answered %', v; end if;

    -- (c) the ladder: slot 2 needs slot 1; one gold short is refused and moves nothing; then 1, 2, 3 at exactly their prices.
    insert into public.account_wallet as w (user_id, gold) values (v_new, v_c1 - 1)
      on conflict (user_id) do update set gold = excluded.gold;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000f0a51120');
    if v->>'error' is distinct from 'requires_previous_slot' then raise exception 'VERIFY(c): slot 2 before slot 1 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000f0a51121');
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.account_wallet where user_id = v_new) <> v_c1 - 1 then
      raise exception 'VERIFY(c): slot 1 one gold short answered %', v; end if;
    update public.account_wallet set gold = v_c1 + v_c2 + v_c3 + 7 where user_id = v_new;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000f0a51122');
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', v_c2) then
      raise exception 'VERIFY(c): slot 1 answered %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'true' then
      raise exception 'VERIFY(c): a hero in the bought slot 1 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000f0a51123');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): slot 2 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(3, 0, '000000c0-0000-4000-a000-0000f0a51124');
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' <> 'null'::jsonb or (v->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(c): the fourth hero''s slot answered % (expected ok, nothing more for sale, four in all)', v; end if;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000f0a51125');
    if v->>'error' is distinct from 'slot_cap' then raise exception 'VERIFY(c): a fifth slot answered %', v; end if;
    if public.hr_hero_slots_of(v_new) is distinct from '[0,1,2,3]'::jsonb
       -- 7 left over, plus the starting kit's gold the slot-1 hero brought into the one purse
       or (select gold from public.account_wallet where user_id = v_new) <> 7 + coalesce((select k.gold from public.hr_start_kit k limit 1), 0)
       or (select count(*) from public.player_ledger where user_id = v_new and kind = 'hero_slot') <> 3
       or (select sum(gold) from public.player_ledger where user_id = v_new and kind = 'hero_slot') <> -(v_c1 + v_c2 + v_c3) then
      raise exception 'VERIFY(c): the ladder did not cost exactly % gold in three rows (owned %, purse %, rows %)', v_c1 + v_c2 + v_c3,
        public.hr_hero_slots_of(v_new), (select gold from public.account_wallet where user_id = v_new),
        (select jsonb_agg(gold) from public.player_ledger where user_id = v_new and kind = 'hero_slot'); end if;

    -- (d) an account whose hero already stands in slot 1 keeps it (an existing character IS ownership), is offered slot 2, and its
    --     hero loads as its own.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): hr_create_character(0) refused: %', v; end if;
    insert into public.player_state
      select (jsonb_populate_record(null::public.player_state, to_jsonb(ps) || jsonb_build_object('slot', 1))).*
        from public.player_state ps where ps.user_id = v_two and ps.slot = 0;
    if public.hr_hero_slots_of(v_two) is distinct from '[0,1]'::jsonb
       or public.hr_account_view(v_two, 0)->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', v_c2) then
      raise exception 'VERIFY(d): an account with a slot-1 hero owns % and is offered %', public.hr_hero_slots_of(v_two),
        public.hr_account_view(v_two, 0)->'hero_slot_offer'; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'false' then
      raise exception 'VERIFY(d): the slot-1 hero answered % (it must stay its own)', v; end if;

    raise exception using errcode = 'HR926', message = 'hero-slots-one §2 complete - rolling back';
  exception when sqlstate 'HR926' then
    null;   -- every probe row is discarded with the subtransaction
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (e) ZERO LEAK; the catalogue and the bodies stay out of every client's reach.
  if exists (select 1 from public.player_state where user_id in (v_new, v_two))
     or exists (select 1 from public.player_ledger where user_id in (v_new, v_two))
     or exists (select 1 from public.player_progress where user_id in (v_new, v_two))
     or exists (select 1 from public.account_wallet where user_id in (v_new, v_two))
     or exists (select 1 from auth.users where id in (v_new, v_two)) then
    raise exception 'VERIFY(e): §2 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_hero_slots', 'insert')
       or has_table_privilege(v_role, 'public.hr_hero_slots', 'update')
       or has_table_privilege(v_role, 'public.hr_hero_slots', 'delete')
       or has_function_privilege(v_role, 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % can write the hero-slot catalogue or reach the purchase body or the account view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-slots-one: one slot to start, 300,000 / 750,000 / 1,500,000, four heroes = the play cap; the ladder in order at '
               'exactly its prices; a slot-1 hero kept; every live account''s heroes and held slots untouched; zero leak.';
end $check$;
