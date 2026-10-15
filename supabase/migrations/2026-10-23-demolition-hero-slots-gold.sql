-- ==========================================================================
-- 2026-10-23-demolition-hero-slots-gold.sql — A HERO SLOT IS BOUGHT WITH GOLD
-- STAGED (lane/demo-data, demolition 2026-10-14). Security GO required: this
-- moves the price and the currency of a purchase (a money surface). NOT APPLIED.
--
-- Designer ruling 2026-10-14: character_slot is priced in GOLD at
-- 15,000 / 75,000 / 250,000 / 750,000 (src/multi-character.js SLOT_COSTS_GOLD,
-- generated into src/data/shops.js). Security R3 (2026-10-15): production still
-- charged GEMS (200/500/900/1500) from the account wallet and nothing restated
-- it. This file is that restatement.
--
-- OWNERSHIP:
--   §1 public.hr_hero_slots: adds cost_gold (bigint, >= 0, default 0) and sets
--      it per slot; premium_waived is set false on every slot because the client
--      no longer waives any (the Hearth Hall waiver left src/multi-character.js
--      with the demolition), and a server waiver the client does not show is a
--      slot one side gives away. cost_gems stays as a column (the 2026-09-08
--      file's re-apply inserts it) and has no reader after this file.
--   §2 public.hr_buy_hero_slot__ungated: restated WHOLE from the
--      2026-10-19-account-wallet.sql body (md5 pinned in §0). The only changes:
--      the price is v_cat.cost_gold, debited from the CALLING hero's
--      player_state.gold under that row's lock (gold is per hero; gems were per
--      account); an unpriced row (cost_gold <= 0) is refused slot_unpriced,
--      never sold free; the refusal is insufficient_gold; the ledger row
--      carries gold = -cost (gold_in 0: a purchase mints nothing) and
--      meta.currency 'gold'; the envelope reports the hero's gold. The wallet is
--      not touched. Locks, idempotency, ownership, ladder, daily clamp, the
--      account-row grant and success-only caching are byte-identical.
--   The wrapper hr_buy_hero_slot, hr_hero_slots_of and hr_create_character are
--   not touched; the signature does not move, so the client RPC baseline holds.
--
-- RE-RUNNABLE: §0 accepts the 2026-10-19 body or this file's own.
-- REVERSIBILITY: re-apply 2026-10-19-account-wallet.sql's body for the function;
-- cost_gold is inert without it.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED, NEVER CLOBBER ──────────────────────────
do $$
declare v_md5 text;
begin
  if to_regclass('public.hr_hero_slots') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_wallet_debit(uuid,integer,bigint,text,jsonb)') is null then
    raise exception 'PRECONDITION: hr_hero_slots / hr_hero_slots_of / the account wallet is absent';
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc
             where oid = to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)'));
  if v_md5 is null or v_md5 not in ('8b8b313c56b88dd5030cd884ede7307a', '7d0d179372ac2991c173d19f123ec67e') then
    raise exception 'PRECONDITION: hr_buy_hero_slot__ungated is not the 2026-10-19 body this file restates (md5 %) - another lane moved it; restate from that body instead', v_md5;
  end if;
end $$;

-- ── 1. THE CATALOGUE ───────────────────────────────────────────────────────
alter table public.hr_hero_slots add column if not exists cost_gold bigint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_hero_slots'::regclass
                  and conname = 'hr_hero_slots_cost_gold_ck') then
    alter table public.hr_hero_slots add constraint hr_hero_slots_cost_gold_ck check (cost_gold >= 0);
  end if;
end $$;
update public.hr_hero_slots as h
   set cost_gold = v.gold, premium_waived = false
  from (values (1, 15000), (2, 75000), (3, 250000), (4, 750000)) as v(slot_id, gold)
 where h.slot_id = v.slot_id;

-- ── 2. THE PURCHASE ────────────────────────────────────────────────────────
create or replace function public.hr_buy_hero_slot__ungated(p_slot_id integer, p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  -- BLAST RADIUS, not balance: four slots, each once per account forever.
  c_max_slots_per_day constant int := 5;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_hero_slots%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_gold   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- SHAPE FIRST, for both integers: p_slot is the paying hero, p_slot_id the slot bought.
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_slot_id is null or p_slot_id < 0 or p_slot_id > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot_id', p_slot_id);
  end if;

  -- (1) THE CATALOGUE, BEFORE ANY LOCK.
  select * into v_cat from public.hr_hero_slots where slot_id = p_slot_id;
  if v_cat.slot_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'unknown_slot',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_slot', 'slot_id', p_slot_id);
  end if;
  -- FAIL CLOSED ON AN UNPRICED ROW: cost_gold defaults to 0, and a slot that
  -- costs nothing is a mistake, never an offer.
  if coalesce(v_cat.cost_gold, 0) <= 0 then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'slot_unpriced',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_unpriced', 'slot_id', p_slot_id);
  end if;
  v_intent := 'hero_slot_buy:' || v_cat.slot_id;

  -- (2) SERIALISE: the ACCOUNT (slot 0) first, then the paying hero.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- (3) IDEMPOTENCY per (key, intent, slot), read inside the lock; successes only are cached.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- (4) THE PAYING HERO'S ROW, LOCKED. Gold is per hero and lives on this row.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- (5) THE ACCOUNT'S CANONICAL ROW MUST EXIST (the slot-0 flag row's FK).
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  -- (6) OWNERSHIP, FROM THE ONE PREDICATE.
  v_owned := public.hr_hero_slots_of(v_uid);
  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;

  -- (7) THE LADDER: slot N requires N-1, against the server's owned set.
  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then
    return jsonb_build_object('ok', false, 'error', 'requires_previous_slot',
      'slot_id', v_cat.slot_id, 'requires', v_cat.slot_id - 1, 'hero_slots', v_owned);
  end if;

  -- (8) THE PER-DAY CLAMP, from the append-only ledger, account-wide.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'hero_slot'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_slots_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'hero_slot_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_slots_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'hero_slot_daily_cap',
      'used', v_today, 'limit', c_max_slots_per_day);
  end if;

  -- (9) THE DEBIT, FROM THE PAYING HERO'S GOLD. The price is the server's own
  --     catalogue; the row is locked by (4), and the update is predicated on the
  --     balance, so gold cannot go negative.
  if v_st.gold < v_cat.cost_gold then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'insufficient_gold',
      jsonb_build_object('slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold,
      'short_by', v_cat.cost_gold - v_st.gold);
  end if;
  update public.player_state
     set gold = gold - v_cat.cost_gold, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot and gold >= v_cat.cost_gold
   returning gold into v_gold;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold);
  end if;
  -- accrued_to is NOT touched: a purchase is not an activity change.

  -- (10) THE GRANT, ON THE ACCOUNT'S ROW (slot 0), downstream of the debit.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- (11) THE JOURNAL. One row: the signed gold movement, no inflow.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'hero_slot', v_intent,
     -v_cat.cost_gold, 0, 0, 0, 0,
     jsonb_build_object('slot_id', v_cat.slot_id, 'name', v_cat.name,
                        'currency', 'gold', 'cost', v_cat.cost_gold,
                        'charged_slot', v_slot, 'idem', p_idem));

  -- (12) THE ENVELOPE: the paying hero's gold, and the account's whole owned set.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'slot_id', v_cat.slot_id, 'name', v_cat.name,
    'currency', 'gold', 'cost', v_cat.cost_gold,
    'gold', v_gold, 'version', v_st.version, 'slot', v_slot,
    'hero_slots', public.hr_hero_slots_of(v_uid));

  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, v_intent, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;
revoke execute on function public.hr_buy_hero_slot__ungated(integer, integer, uuid)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK - properties asserted by EXECUTING the purchase ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000d3a0510a';
  v      jsonb;
  v_n    int;
  v_g0   bigint;
  v_g1   bigint;
  v_gems0 bigint;
  v_gems1 bigint;
begin
  -- (a) the catalogue: four rows, priced in gold as authored, none waived.
  select count(*) into v_n from public.hr_hero_slots h
    join (values (1, 15000), (2, 75000), (3, 250000), (4, 750000)) k(id, gold)
      on k.id = h.slot_id and h.cost_gold = k.gold and not h.premium_waived;
  if v_n <> 4 or (select count(*) from public.hr_hero_slots) <> 4 then
    raise exception 'VERIFY(a): hr_hero_slots is not the 4-row gold ladder 15k/75k/250k/750k with no waiver';
  end if;

  -- (b) EXECUTED, inside a subtransaction that is always rolled back.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    insert into public.account_wallet (user_id, gems) values (v_uid, 5000)
      on conflict (user_id) do update set gems = 5000;
    select gems into v_gems0 from public.account_wallet where user_id = v_uid;

    -- short of gold by one: refused by name, nothing moves.
    update public.player_state set gold = 14999 where user_id = v_uid and slot = 0;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000d3a05101');
    if v->>'error' is distinct from 'insufficient_gold' or (v->>'short_by')::bigint <> 1 then
      raise exception 'VERIFY(b): 14,999 gold bought slot 1 or was refused wrongly: %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> 14999
       or exists (select 1 from public.player_progress where user_id = v_uid and key = 'character_slot:1') then
      raise exception 'VERIFY(b): a refused purchase moved gold or granted the slot'; end if;

    -- the honest purchase: exactly 15,000 gold, the flag on slot 0, one ledger row, no gem moved.
    update public.player_state set gold = 20000 where user_id = v_uid and slot = 0;
    v_g0 := 20000;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000d3a05102');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'cost')::bigint <> 15000 or v->>'currency' <> 'gold' then
      raise exception 'VERIFY(b): the slot-1 purchase answered %', v; end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if v_g0 - v_g1 <> 15000 then raise exception 'VERIFY(b): slot 1 cost % gold, expected 15000', v_g0 - v_g1; end if;
    select gems into v_gems1 from public.account_wallet where user_id = v_uid;
    if v_gems1 <> v_gems0 then raise exception 'VERIFY(b): the gold purchase moved % gems', v_gems0 - v_gems1; end if;
    if not exists (select 1 from public.player_progress where user_id = v_uid and slot = 0
                    and kind = 'flag' and key = 'character_slot:1' and value = 1) then
      raise exception 'VERIFY(b): the slot-1 flag is not on the account row'; end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'hero_slot' and gold = -15000 and gold_in = 0 and gems_in = 0
       and meta->>'currency' = 'gold';
    if v_n <> 1 then raise exception 'VERIFY(b): % hero_slot ledger row(s) with gold -15000, expected 1', v_n; end if;

    -- a replay on the same key debits nothing; a re-buy is refused.
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000d3a05102');
    if coalesce(v->>'replayed', '') <> 'true' then raise exception 'VERIFY(b): the retry did not replay: %', v; end if;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000d3a05103');
    if v->>'error' is distinct from 'already_owned' then raise exception 'VERIFY(b): a re-buy answered %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_g1 then
      raise exception 'VERIFY(b): a replay or re-buy moved gold'; end if;

    -- an unpriced row is refused, never sold free.
    update public.hr_hero_slots set cost_gold = 0 where slot_id = 2;
    update public.player_state set gold = 1000000 where user_id = v_uid and slot = 0;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000d3a05104');
    if v->>'error' is distinct from 'slot_unpriced' then raise exception 'VERIFY(b): an unpriced slot answered %', v; end if;

    raise exception using errcode = 'HR855', message = 'demolition-hero-slots-gold §4 complete - rolling back';
  exception when sqlstate 'HR855' then
    null;   -- subtransaction discarded; every probe row and the cost_gold = 0 edit are gone
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (c) ZERO LEAK, the edit rolled back, the inner still client-proof.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.account_wallet where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(c): §4 LEAKED a probe row';
  end if;
  if (select cost_gold from public.hr_hero_slots where slot_id = 2) <> 75000 then
    raise exception 'VERIFY(c): the unpriced-row probe was not rolled back'; end if;
  if has_function_privilege('authenticated', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute') then
    raise exception 'VERIFY(c): the __ungated inner is client-executable'; end if;
  raise notice 'demolition-hero-slots-gold: slots priced 15k/75k/250k/750k gold; short-by-one refused, '
               'exact debit from the hero, flag on the account row, one ledger row, no gem moved, replay and re-buy '
               'refused, unpriced refused; zero leak.';
end $$;
