-- ==========================================================================
-- 2027-03-22-four-slots.sql — FOUR HEROES AN ACCOUNT: THE FIFTH SLOT IS NOT SOLD
--   (lane/c-four-slots, backend-architect, 2026-11-07; Tyler the same day: "lets
--   get rid of the 5th character slot, i can't think of any benefit for it.")
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit). Pre-EA: applies on its passing §2; on the EA
-- Security list (MONEY SURFACE: a catalogue row a purchase reads).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 deletes public.hr_hero_slots slot_id 4 ("Character slot 5", 250,000 gold).
--    The catalogue then holds 1 (starter) / 2 (25,000) / 3 (75,000), and every
--    body that states the cap already reads it from this table, never a literal,
--    so NO function body, grant or policy moves:
--      hr_account_view        hero_slots_max = max(slot_id) + 1 = 4; the offer is
--                             the lowest unowned priced row, so it never names 4
--      hr_buy_hero_slot       p_slot_id 4 is past the catalogue's top slot:
--                             `slot_cap` {max: 4}, journalled, before any lock
--      hr_hero_slots_of       the bought clause joins through this table, so a
--                             character_slot:4 flag grants nothing any more
--      hr_create_character    slot 4 is not owned: `slot_not_owned`
--    The cap now equals the play cap (hr_hunt_limit('max_concurrent'), 4): an
--    account holds as many heroes as can play at once. §2 asserts both.
--    Siblings in this lane: src/data/shops.js drops character_slot.4 (the BIND in
--    tests/hero-slot-buy.mjs), and the two catalogues generated from it move
--    (one pair shared with lane/c-dead-plot-deed since 2026-11-08):
--    2027-03-22-catalogue-cuts-unlocks.generated.sql retires the unlock id
--    character_slot:4; 2027-03-22-catalogue-cuts-unlock-offers.generated.sql drops
--    the (already refused) character_slot.4 offer row.
--
-- ── A HERO ALREADY IN SLOT 4 (one account on production, abandoned) ───────
-- NOT TOUCHED (CLAUDE.md §2: no admin change to a real character; the EA wipe
-- takes it). hr_hero_slots_of's grandfather clause (an existing character IS
-- ownership) keeps naming slot 4 for that account, so the roster lists the hero
-- and it loads and plays as before; the offer is null (nothing left to sell) and
-- a buy of slot 4 is `slot_cap`. No refund and no new path: §1 of CLAUDE.md, no
-- back-compat. §2 (e) proves that shape on a probe account.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- Smaller: one priced row fewer. The purchase's locks, ladder order, key,
-- per-day clamp, debit predicate and journal do not move. Nothing from the
-- client is read that was not read before.
--
-- COST AT 100x: one row fewer in a 4-row catalogue; no table, index or journal.
-- CONCURRENCY: a purchase of slot 4 racing the apply either commits before the
--   delete (it bought a slot that was for sale; the wipe takes it) or reads the
--   catalogue after it and is refused slot_cap. No lock is held across the two.
-- REVERSIBILITY: insert (4, 'Character slot 5', 250000 gold, starter false,
--   premium_waived false, cost_gems as before) and restore the shops.js row; the
--   generators then put character_slot:4 back.
-- RE-RUNNABLE: §0 accepts the 2027-02-26 ladder or this file's own; the delete
--   is a no-op the second time and §2 asserts the same answers.
-- ORDER: after 2027-02-26-slots-lower-hero-slots.sql; first of the combined
--   2027-03-22 sequence, its generated siblings after it. EDGE: no engine behaviour moves, but the hr-accrue
--   payload hash does (src/data/shops.js is in the bundle): one redeploy.
-- ==========================================================================

-- ── §0 A PINNED DELETE: IT RUNS ONLY OVER THE LADDER IT SHORTENS ───────────
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
  if v_now is distinct from '1:0:true,2:25000:false,3:75000:false,4:250000:false'
     and v_now is distinct from '1:0:true,2:25000:false,3:75000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the 2027-02-26 ladder this file shortens (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 THE FIFTH SLOT LEAVES THE CATALOGUE ─────────────────────────────────
delete from public.hr_hero_slots where slot_id = 4 and not starter;

-- ── §2 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
do $check$
declare
  v_uid  constant uuid := '000000c0-0000-4000-8000-0000f0a45101';   -- a new account
  v_old  constant uuid := '000000c0-0000-4000-8000-0000f0a45102';   -- an account holding a slot-4 hero
  v_now  text;
  v_max  int;
  v_c2   bigint;
  v_c3   bigint;
  v      jsonb;
  v_acc  jsonb;
  v_role text;
begin
  -- (a) the catalogue: the starter and two priced rows; four heroes, the play cap.
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id), max(slot_id) + 1
    into v_now, v_max from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:25000:false,3:75000:false' then
    raise exception 'VERIFY(a): hr_hero_slots reads %, not 1 starter / 25,000 / 75,000', v_now;
  end if;
  if v_max is distinct from 4 or v_max is distinct from public.hr_hunt_limit('max_concurrent')::int then
    raise exception 'VERIFY(a): an account holds % heroes and % may play at once; Tyler 2026-11-07: four, the same number',
      v_max, public.hr_hunt_limit('max_concurrent');
  end if;
  v_c2 := (select cost_gold from public.hr_hero_slots where slot_id = 2);
  v_c3 := (select cost_gold from public.hr_hero_slots where slot_id = 3);

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid), (v_old) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_uid), (v_old) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (v_uid, 'four-slots §2 probe'), (v_old, 'four-slots §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;

    -- (b) a new account is offered the third hero, and told four in all.
    v_acc := public.hr_account_view(v_uid, 0);
    if v_acc->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', v_c2)
       or (v_acc->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(b): a new account reads %', v_acc; end if;

    -- (c) slot 4 is not for sale, first or last: slot_cap {max 4}, nothing moves.
    insert into public.account_wallet as w (user_id, gold) values (v_uid, v_c2 + v_c3 + 7)
      on conflict (user_id) do update set gold = excluded.gold;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000f0a45140');
    if v->>'error' is distinct from 'slot_cap' or (v->>'max')::int is distinct from 4 then
      raise exception 'VERIFY(c): slot 4 before the ladder answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000f0a45142');
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 3, 'cost_gold', v_c3)
       or (v->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(c): slot 2 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(3, 0, '000000c0-0000-4000-a000-0000f0a45143');
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' <> 'null'::jsonb or (v->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(c): the fourth hero''s slot answered % (expected ok, no further offer, four in all)', v; end if;
    if public.hr_hero_slots_of(v_uid) is distinct from '[0,1,2,3]'::jsonb
       or public.hr_account_view(v_uid, 0)->'hero_slot_offer' <> 'null'::jsonb then
      raise exception 'VERIFY(c): four slots are not owned, or a fifth is still offered'; end if;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000f0a45144');
    if v->>'error' is distinct from 'slot_cap' or (v->>'max')::int is distinct from 4 then
      raise exception 'VERIFY(c): slot 4 at the top of the ladder answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_uid) <> 7
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hero_slot') <> 2
       or exists (select 1 from public.player_progress where user_id = v_uid and key = 'character_slot:4') then
      raise exception 'VERIFY(c): the ladder did not cost exactly % gold in two rows, or slot 4 was granted', v_c2 + v_c3; end if;

    -- (d) no hero can be made in slot 4 by an account that holds none there.
    v := public.hr_create_character(4);
    if v->>'error' is distinct from 'slot_not_owned' then
      raise exception 'VERIFY(d): a hero in slot 4 answered %', v; end if;

    -- (e) THE OLD SHAPE: an account whose slot-4 hero exists (bought before this file).
    --     It keeps the hero, is offered nothing, and is refused slot 4 by name.
    perform set_config('request.jwt.claim.sub', v_old::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): hr_create_character refused: %', v; end if;
    insert into public.player_state
      select (jsonb_populate_record(null::public.player_state, to_jsonb(ps) || jsonb_build_object('slot', s))).*
        from public.player_state ps, generate_series(1, 4) s
       where ps.user_id = v_old and ps.slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      select v_old, 0, 'flag', 'character_slot:' || s, 1, '', null, now() from generate_series(2, 4) s;
    if public.hr_hero_slots_of(v_old) is distinct from '[0,1,2,3,4]'::jsonb then
      raise exception 'VERIFY(e): the old account owns %, expected its five heroes'' slots', public.hr_hero_slots_of(v_old); end if;
    v_acc := public.hr_account_view(v_old, 4);
    if v_acc->'hero_slot_offer' <> 'null'::jsonb or (v_acc->>'hero_slots_max')::int is distinct from 4 then
      raise exception 'VERIFY(e): the old account reads %', v_acc; end if;
    v := public.hr_create_character(4);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'false' then
      raise exception 'VERIFY(e): the old account''s slot-4 hero answered % (it must stay its own)', v; end if;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000f0a45145');
    if v->>'error' is distinct from 'slot_cap' then
      raise exception 'VERIFY(e): the old account buying slot 4 answered %', v; end if;

    raise exception using errcode = 'HR904', message = 'four-slots §2 complete - rolling back';
  exception when sqlstate 'HR904' then
    null;   -- every probe row is discarded with the subtransaction
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (f) ZERO LEAK; the catalogue and the bodies stay out of every client's reach.
  if exists (select 1 from public.player_state where user_id in (v_uid, v_old))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_old))
     or exists (select 1 from public.player_progress where user_id in (v_uid, v_old))
     or exists (select 1 from public.account_wallet where user_id in (v_uid, v_old))
     or exists (select 1 from auth.users where id in (v_uid, v_old)) then
    raise exception 'VERIFY(f): §2 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_hero_slots', 'insert')
       or has_table_privilege(v_role, 'public.hr_hero_slots', 'update')
       or has_table_privilege(v_role, 'public.hr_hero_slots', 'delete')
       or has_function_privilege(v_role, 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): % can write the hero-slot catalogue or reach the purchase body or the account view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'four-slots: hr_hero_slots 1 starter / 25,000 / 75,000, four heroes = the play cap; slot 4 slot_cap first and last, '
               'never offered, not creatable; an existing slot-4 hero kept, offered nothing; zero leak.';
end $check$;
