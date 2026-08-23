-- 2026-08-22-absence-chest-items.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Applied by hand via the Supabase MCP (execute_sql / apply_migration) alongside
-- the src/features/muster.js client change in the same PR. LIVE-RPC BODY CHANGE
-- on the item surface. Read the change contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- CLOSES THE INVENTORY-FLIP DATA-LOSS LANDMINE FOR THE MUSTER *ABSENCE* CHEST.
--
-- b422 (2026-08-20-muster-chest-items.sql) made the ONLINE muster claim
-- (world_event_claim) write its themed chest materials into player_inventory.
-- But the ABSENCE / half-honors path — world_event_absence_claim, taken when a
-- pledged player never showed up for the rally window — still only COMPUTED the
-- chest (public.hr_rally_chest) and RETURNED gold/gems, minting NO items server
-- side. The client's muster.js grantAbsent() then addItem'd the themed materials
-- CLIENT-SIDE with no server write. Those ids classify OWNABLE
-- (src/data/item-authority.js — bars/logs/ores), so the moment the inventory
-- absolute-replace envelope is armed they would be REPLACED-TO-ZERO (deleted),
-- because the server never wrote them and the envelope omits what it does not
-- know. Same landmine b422 closed for the online path; this closes the twin.
--
-- The fix mirrors b422 EXACTLY:
--   · hr_rally_chest already lives server-side and already computed v_chest in
--     this RPC — the client never supplied any item id or qty and still does not.
--   · After the once-per-day settle guard (the conditional `settled=true where
--     settled=false` flip + row_count check that already gates this RPC), the
--     returned items are written into player_inventory (the source of truth the
--     accrual absolute envelope is built FROM, so a credited item survives the
--     flip by construction), additive-upsert, scoped to the caller's own
--     (user_id, slot).
--   · One player_ledger row (kind='rally') journals the items.
--   · The RPC now RETURNS a top-level `items` array so the client renders the
--     server's list and gates its local addItem on the inventory record seam.
--
-- ── GOLD/GEMS STAY AS THEY WERE (out of scope — the gold arm owns them) ──────
-- Unlike the online path, world_event_absence_claim does NOT credit gold/gems to
-- player_state — it returns them and the client credits them (gated on the gold
-- record seam in muster.js payChest). This migration DELIBERATELY does not change
-- that: moving absence gold server-side is a GOLD-arm concern, not the inventory
-- program. The ledger row here therefore journals gold=0 (no server gold moved)
-- with the absence gold recorded in meta for audit. Flagged for the gold reviewer.
--
-- ── ONCE-SHOT (no double-credit on replay) ──────────────────────────────────
-- The item credit sits AFTER the same conditional settle guard the RPC already
-- uses (`update … set settled=true … where settled=false` + row_count check). A
-- replay is refused (already_settled) before reaching any credit. Settle + item
-- credit + journal are ONE function/transaction: commit or roll back together.
--
-- ── SIGNATURE UNCHANGED ─────────────────────────────────────────────────────
-- world_event_absence_claim(text) / __ungated(text) keep their arity. Only the
-- inner BODY changes, so the A9 wrapper, the grants (revoked-before-granted) and
-- the hr_client_rpc_baseline row are untouched. `create or replace` preserves the
-- existing (revoked) ACL on the inner.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing';    end if;
  if to_regclass('public.world_event_pledges') is null then raise exception 'world_event_pledges missing'; end if;
  if to_regprocedure('public.world_event_absence_claim__ungated(text)') is null then
    raise exception 'world_event_absence_claim__ungated(text) not found — expected the rally-preselect surface';
  end if;
  if to_regprocedure('public.hr_rally_chest(text,bigint,integer,integer)') is null then
    raise exception 'hr_rally_chest(text,bigint,int,int) not found — expected rally-v2 §3';
  end if;
  -- 'rally' must already be a legal ledger kind (added by b422 §1b).
  if exists (select 1 from pg_constraint where conname = 'player_ledger_kind_check'
             and pg_get_constraintdef(oid) not like '%''rally''%') then
    raise exception 'player_ledger_kind_check lacks ''rally'' — apply 2026-08-20-muster-chest-items.sql first';
  end if;
end $$;

-- ── 2. Replace the inner body (same arity → grants/wrapper/baseline untouched) ─
create or replace function public.world_event_absence_claim__ungated(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
  v_chest   jsonb;
  v_it      jsonb;
  v_iid     text;
  v_iqty    bigint;
  v_qty_total bigint := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1 — while the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2 — the join primary key. They were there; the live chest was their
  -- reward and the pledge closes paying nothing.
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
  end if;
  if v_joined then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  -- ── THE SETTLE. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- ── THE THEMED CHEST. Server owns the pool AND the conversion (rally-v2 §3).
  v_chest := public.hr_rally_chest(v_p.event_key, c_gold, c_gems, 0);

  -- ── THE ITEMS (after the settle guard → exactly once). Written to
  --    player_inventory — the source of truth the accrual absolute envelope is
  --    built FROM, so a credited item survives the flip by construction. Same
  --    transaction as the settle, so a rollback undoes both; a replay never
  --    reaches here. Additive upsert, scoped to the caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_p.slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  -- ── JOURNAL. gold=0: absence gold is NOT server-credited here (the gold arm
  --    owns that); the item value transfer is what this row records. qty_in=0 by
  --    the b422 convention (a fixed once-per-period reward is not client-driven
  --    mint, so it stays out of the accrual daily inflow budget).
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_p.slot, 'rally', 'world_event_absence_claim:' || v_day_key,
     0, 0, 0, 0, 0,
     jsonb_build_object('band', 'absent', 'day_key', v_day_key,
                        'event_key', v_p.event_key, 'absence_gold', c_gold,
                        'absence_gems', c_gems, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_p.slot,
    'gold', c_gold, 'gems', c_gems, 'seals', 0,
    'items', v_chest->'items', 'xp', v_chest->'xp', 'chest', v_chest);
end $$;

-- ── 3. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. The row-writing probe lives in a subtransaction
-- discarded by a sentinel raise (HR820); player_ledger's retention guard refuses
-- to delete a fresh row, so subtxn rollback is the only clean teardown and this
-- block is net-zero on production.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000ab-0000-0000-0000-0000000000ab';
  v_slot constant int := 0;
  v_dk   text := public.hr_utc_day_key();
  v_pday date := (now() at time zone 'utc')::date - 1;   -- a CLOSED prior day
  v_pdaykey text := to_char(v_pday, 'YYYY-MM-DD');
  v_ek   text;
  v_close timestamptz;
  v_led int; v_invrows int; v_invrows2 int;
  v_it jsonb; v_want_qty bigint; v_have_qty bigint;
begin
  -- (a) the inner is NOT client-executable; the wrapper still is.
  if has_function_privilege('authenticated', 'public.world_event_absence_claim__ungated(text)', 'execute') then
    raise exception 'GATE(a): the __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.world_event_absence_claim(text)', 'execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 0, gems = 0;

    -- resolve the prior day's UTC day-key + event key the way the RPC does.
    v_dk  := public.hr_utc_day_key(((public.hr_rally_day(v_pdaykey)) + interval '12 hours') at time zone 'utc');
    v_ek  := v_dk || '#1';
    v_close := public.hr_rally_day_close(v_dk);
    if v_close is null or now() < v_close then
      raise exception 'GATE(setup): prior day % is not closed yet (close=%) — cannot verify absence credit', v_dk, v_close;
    end if;

    -- an UNSETTLED pledge for that CLOSED day, no join row → the absent branch.
    delete from public.world_event_joins where day_key = v_dk and user_id = v_uid;
    insert into public.world_event_pledges (day_key, user_id, event_key, slot, settled)
      values (v_dk, v_uid, v_ek, v_slot, false)
      on conflict (day_key, user_id) do update
        set event_key = excluded.event_key, slot = excluded.slot, settled = false,
            outcome = null, settled_at = null;

    -- FIRST settle: credits items, writes player_inventory, returns items.
    v := public.world_event_absence_claim__ungated(v_pdaykey);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c): first absence settle did not succeed: %', v;
    end if;
    if jsonb_array_length(coalesce(v->'items','[]'::jsonb)) = 0 then
      -- an absence chest at 750 gold may legitimately convert to a non-empty
      -- item list; if the theme yields none the survival check is vacuous but the
      -- credit path still ran. Only fail if items were RETURNED but not written.
      raise notice 'GATE(c): absence chest returned no items for %; item-survival check vacuous', v_ek;
    end if;

    for v_it in select * from jsonb_array_elements(coalesce(v->'items','[]'::jsonb)) loop
      v_want_qty := (v_it->>'qty')::bigint;
      select coalesce(qty,0) into v_have_qty from public.player_inventory
        where user_id = v_uid and slot = v_slot and item_id = v_it->>'id';
      if coalesce(v_have_qty,0) <> v_want_qty then
        raise exception 'GATE(c): item % expected qty % in player_inventory, found %',
          v_it->>'id', v_want_qty, coalesce(v_have_qty,0);
      end if;
    end loop;
    select count(*) into v_invrows from public.player_inventory where user_id = v_uid and slot = v_slot;

    -- exactly one 'rally' ledger row.
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'rally';
    if v_led <> 1 then
      raise exception 'GATE(c): expected exactly one rally ledger row, found %', v_led;
    end if;

    -- REPLAY: refused, inventory does NOT grow, no 2nd ledger row.
    v := public.world_event_absence_claim__ungated(v_pdaykey);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_settled' then
      raise exception 'GATE(d): replay was not refused: %', v;
    end if;
    select count(*) into v_invrows2 from public.player_inventory where user_id = v_uid and slot = v_slot;
    if v_invrows2 <> v_invrows then
      raise exception 'GATE(d): replay changed the inventory row count (% -> %)', v_invrows, v_invrows2;
    end if;
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'rally';
    if v_led <> 1 then
      raise exception 'GATE(d): replay wrote a second rally ledger row (now %)', v_led;
    end if;

    raise exception using errcode = 'HR820', message = 'absence-chest-items §3 complete — rolling back';
  exception when sqlstate 'HR820' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.world_event_pledges where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v := public.hr_assert_grant_hygiene(false);
    if jsonb_array_length(v->'unapproved_client_rpcs') <> 0
       or jsonb_array_length(v->'ungated_client_rpcs') <> 0
       or jsonb_array_length(v->'baseline_rows_no_longer_live') <> 0 then
      raise exception 'GATE(e): grant-hygiene drift after body change: %', v;
    end if;
  end if;

  raise notice 'absence-chest-items: inner replaced, items credited to player_inventory, credit-once, replay-safe, inventory-survival, grant-hygiene all green';
end $$;
