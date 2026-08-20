-- 2026-08-20-muster-chest-items.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Applied by hand via the Supabase MCP (execute_sql, wrapped in begin/commit) as
-- part of a coordinated deploy with the src/features/muster.js client change in
-- the same PR. It is a LIVE-RPC BODY CHANGE on the money/item surface. Read the
-- change contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- CLOSES THE INVENTORY-FLIP DATA-LOSS LANDMINE FOR THE MUSTER CHEST.
--
-- b412 (2026-08-19-muster-raid-rpc-credit.sql) moved the rally chest GOLD/GEMS
-- credit INSIDE world_event_claim, atomically with the once-per-day consume. But
-- the chest ITEMS — the themed materials (wolf_pelt, iron_bar, iron_ore, trout,
-- …) — were still MINTED CLIENT-SIDE in muster.js payChest() via window.addItem,
-- with NO server-side player_inventory write. Those ids all classify OWNABLE
-- (src/data/item-authority.js), so the moment the inventory absolute-replace
-- envelope is armed they would be REPLACED-TO-ZERO — deleted — because the
-- server never wrote them and the envelope omits what it does not know. That is
-- the one irreversible mistake the whole server-authority program exists to
-- avoid.
--
-- This migration makes the chest ITEMS server-owned and server-written, exactly
-- like the gold already is:
--
--   · The item pool + the gold→materials conversion ALREADY LIVE SERVER-SIDE in
--     public.hr_rally_chest / hr_rally_theme / hr_rally_event_id (rally-v2.sql
--     §2-3). The client NEVER supplies item ids or quantities — it never did,
--     and after this it renders the server's returned list instead of computing
--     its own. So there is no client value crossing into inventory.
--   · world_event_claim now calls hr_rally_chest(event_key, band) AFTER the
--     once-per-day consume guard, and writes each returned item into
--     player_inventory (the source of truth the accrual envelope is built FROM,
--     so a credited item survives an absolute replace by construction).
--   · One player_ledger row per claim journals the items (in meta) alongside the
--     signed gold — a value transfer, journalled, replayable.
--
-- ── VALUE CHANGE, DELIBERATE AND FLAGGED FOR REVIEW ─────────────────────────
-- b412 credited the FULL band gold (v_gold). The themed chest is value-PRESERVING
-- by design: hr_rally_chest CONVERTS a 30% slice of the band gold into materials
-- and a 20% slice into XP, and returns the REDUCED remainder as gold (goldOut),
-- such that goldOut + material-value + xp/2 ≤ band gold (rally-v2 §3, asserted by
-- hr_rally_chest_value). This RPC now credits that goldOut, not the full band —
-- completing the conversion the client's themedChest() always intended. Net: the
-- player receives goldOut (server) + materials (server) + XP (client addXp) —
-- the same chest the pill has always PREVIEWED, now paid where it is previewed.
--   Before this migration the live behaviour double-counted: server credited FULL
--   gold AND the client addItem'd the FULL materials on top. This removes that
--   over-credit. The gold a claimant sees will DROP by the converted slice; the
--   materials now arrive as real inventory rows. Called out explicitly so the
--   Game Designer / Security reviewer signs off on the payout delta.
--
-- ── XP STAYS CLIENT-AUTHORED (out of scope) ─────────────────────────────────
-- The RPC RETURNS the xp array for parity/preview, but does NOT write
-- player_skills. XP must flow through the client's window.addXp so PACE, the fuse
-- and the day's blessing all apply (muster.js §1b invariant). Skills are not on
-- SERVER_OF_RECORD; moving them is a separate program.
--
-- ── SIGNATURE UNCHANGED ─────────────────────────────────────────────────────
-- world_event_claim(text,int) / __ungated(text,int) keep their b412 arity. Only
-- the inner BODY changes, so the A9 wrapper, the grants (revoked-before-granted),
-- and the hr_client_rpc_baseline row are all untouched and stay valid. `create or
-- replace` preserves the existing (revoked) ACL on the inner.
--
-- ── ONCE-SHOT (no double-credit on replay) ──────────────────────────────────
-- The item credit sits AFTER the same conditional consume guard the gold credit
-- does (`update … set claimed=true … where claimed=false` + row_count check). A
-- replay is refused (already_claimed) before reaching any credit. Consume + gold
-- credit + item credit + journal are ONE function/transaction: commit or roll
-- back together. §3 proves it by execution.
--
-- ── JOURNAL ─────────────────────────────────────────────────────────────────
-- The existing single 'rally' ledger row now also carries the items in meta.
-- gold_in / qty_in stay ZERO and explicit: this is a fixed, server-owned,
-- once-per-period reward, NOT client-driven mint, so — like the b412 gold credit
-- and the market seller credit — it is kept OUT of the accrual daily inflow
-- budget (hr_day_budget_used); the once-per-day guard is the real limiter.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')     is null then raise exception 'player_state missing';     end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing';    end if;
  if to_regprocedure('public.world_event_claim__ungated(text,integer)') is null then
    raise exception 'world_event_claim__ungated(text,integer) not found — expected the b412 2-arg surface';
  end if;
  if to_regprocedure('public.hr_rally_chest(text,bigint,integer,integer)') is null then
    raise exception 'hr_rally_chest(text,bigint,int,int) not found — expected rally-v2 §3';
  end if;
end $$;

-- ── 1b. Add 'rally' to player_ledger.kind — a LATENT b412 BUG this surfaces ──
-- b412 (2026-08-19) writes the muster credit ledger row with kind='rally', but it
-- never added 'rally' to player_ledger_kind_check and its §8 self-check only ever
-- exercised the RAID path — so the constraint gap was never hit. In production the
-- check still lacks 'rally' (verified 2026-08-20: 0 rally rows exist, i.e. the
-- b412 muster credit has NEVER successfully journalled — it would have raised
-- check_violation and rolled the whole claim back). This migration exercises the
-- muster credit for real (§3), so it MUST widen the check first. Additive and
-- idempotent, the same shape goal-reward-rpc used to add 'daily'. Rebuild-safe:
-- the constraint is dropped and recreated with the full set including 'rally'.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'player_ledger_kind_check'
             and pg_get_constraintdef(oid) not like '%''rally''%') then
    alter table public.player_ledger drop constraint player_ledger_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_ledger_kind_check') then
    alter table public.player_ledger add constraint player_ledger_kind_check
      check (kind = any (array['accrue','craft','gather','combat','farm','trade','shop',
                               'quest','equip','admin','iap','clan','raid','enchant',
                               'daily','collection','renown','bounty','rally']));
  end if;
end $$;

-- ── 2. Replace the inner body (same arity → grants/wrapper/baseline untouched) ─
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
  v_median   numeric;
  v_rows     int;
  v_slot     int := coalesce(p_slot, 0);
  v_gold     bigint := 0;
  v_gems     int    := 0;
  v_seal     int    := 0;
  v_band     text   := 'none';
  v_held     boolean := false;
  -- themed-chest locals
  v_chest    jsonb;
  v_gold_out bigint;
  v_gems_out int;
  v_it       jsonb;
  v_iid      text;
  v_iqty     bigint;
  v_qty_total bigint := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- The credit target must be one of the caller's OWN characters. Checked BEFORE
  -- any consume, so a bad/foreign slot never spends the claim. auth.uid() scopes
  -- it to the caller, so a forged slot can only miss the caller's own rows.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Ceiling per §5.2: 7,500 gold · 10 gems · 1 Muster Seal. No hearth_token.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2; v_seal := 1;
  end if;

  -- ── THE CONSUME. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- ── THE THEMED CHEST. Server owns the pool AND the conversion (rally-v2 §3).
  --    Converts a slice of the band gold into domain materials + XP and returns
  --    the reduced gold (goldOut). No client value crosses in — event_key is the
  --    server's own join row, hr_rally_chest re-derives the theme from it.
  v_chest    := public.hr_rally_chest(v_join.event_key, v_gold, v_gems, v_seal);
  v_gold_out := coalesce((v_chest->>'gold')::bigint, v_gold);
  v_gems_out := coalesce((v_chest->>'gems')::int,    v_gems);

  -- ── THE CREDIT (after the consume guard → exactly once). Same transaction as
  --    the consume, so a rollback undoes both; a replay never reaches here.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         gems = coalesce(gems, 0) + v_gems_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  -- ── THE ITEMS. Written to player_inventory — the source of truth the accrual
  --    absolute envelope is built FROM, so a credited item survives the flip by
  --    construction. Additive upsert (existing qty + granted), scoped to the
  --    caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold_out, 0, 0, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems', v_gems_out,
                        'seals', v_seal, 'day_key', p_day_key,
                        'event_key', v_join.event_key,
                        'band_gold', v_gold, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out, 'seals', v_seal,
    'items', v_chest->'items', 'xp', v_chest->'xp',
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true, 'chest', true);
end $$;

-- ── 3. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. The row-writing probe lives in a subtransaction
-- discarded by a sentinel raise (HR819) — player_ledger's 90-day retention guard
-- refuses to delete a fresh row, so subtxn rollback is the only clean teardown
-- and this block is net-zero on production.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000ad-0000-0000-0000-0000000000ad';
  v_slot constant int := 0;
  v_dk   text := public.hr_utc_day_key();
  v_ek   text := v_dk || '#1';
  v_eid  text;
  v_theme jsonb;
  v_first jsonb;
  v_g0 bigint; v_g1 bigint; v_g2 bigint;
  v_led int; v_invrows int; v_invrows2 int;
  v_it jsonb; v_want_qty bigint; v_have_qty bigint;
begin
  -- (a) the inner is NOT client-executable; the wrapper still is (unchanged b412).
  if has_function_privilege('authenticated', 'public.world_event_claim__ungated(text,integer)', 'execute') then
    raise exception 'GATE(a): the __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.world_event_claim(text,integer)', 'execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  -- (b) the themed chest for slot-1 today has a NON-EMPTY item list (so the
  --     credit path is actually exercised — a chest with no items proves nothing).
  v_eid := public.hr_rally_event_for_key(v_ek);
  v_theme := public.hr_rally_theme(v_eid);
  if v_theme is null then
    raise exception 'GATE(b): today''s slot-1 event % has no server theme — cannot verify item credit', v_eid;
  end if;

  -- (c)+(d) EXECUTED credit-once, item survival, replay-safety, in a discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 0, gems = 0;

    -- a joined, contributed, CLOSED rally for today's slot 1 (window_end in the past).
    insert into public.world_event_joins
      (day_key, user_id, event_key, slot, joined_at, window_end, points, claimed)
    values
      (v_dk, v_uid, v_ek, 1, now() - interval '2 hours', now() - interval '1 hour', 500, false)
    on conflict (day_key, user_id) do update
      set event_key = excluded.event_key, slot = excluded.slot,
          window_end = excluded.window_end, points = excluded.points, claimed = false;

    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;

    -- FIRST claim: credits, returns items, writes player_inventory. The band the
    -- server computes for a lone contributor is its own median (silver), so the
    -- test asserts against WHAT THE RPC RETURNED, not a re-derived band.
    v := public.world_event_claim__ungated(v_dk, v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): first muster claim did not credit: %', v;
    end if;
    if jsonb_array_length(v->'items') = 0 then
      raise exception 'GATE(c): claim returned NO items — the fix did nothing: %', v;
    end if;

    -- the RPC credited EXACTLY what it returned (goldOut), and goldOut is the
    -- REDUCED remainder — strictly less than the band gold (the conversion happened).
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> (v->>'gold')::bigint then
      raise exception 'GATE(c): gold credit % <> the goldOut the RPC returned %', v_g1 - v_g0, (v->>'gold');
    end if;
    if (v->>'gold')::bigint >= (v->>'band_gold')::bigint then
      raise exception 'GATE(c): goldOut % was NOT reduced below the band gold % — no conversion happened',
        (v->>'gold'), (v->>'band_gold');
    end if;

    -- EVERY returned item is present in player_inventory at exactly the returned
    -- qty — the inventory-absolute SURVIVAL property: the envelope is built from
    -- these rows, so an absolute replace preserves them.
    for v_it in select * from jsonb_array_elements(v->'items') loop
      v_want_qty := (v_it->>'qty')::bigint;
      select coalesce(qty,0) into v_have_qty from public.player_inventory
        where user_id = v_uid and slot = v_slot and item_id = v_it->>'id';
      if coalesce(v_have_qty,0) <> v_want_qty then
        raise exception 'GATE(c): item % expected qty % in player_inventory, found %',
          v_it->>'id', v_want_qty, coalesce(v_have_qty,0);
      end if;
    end loop;
    v_first := v;   -- keep the first response for the replay double-credit check
    select count(*) into v_invrows from public.player_inventory where user_id = v_uid and slot = v_slot;
    if v_invrows = 0 then
      raise exception 'GATE(c): no player_inventory rows written — items were not credited server-side';
    end if;

    -- exactly one 'rally' ledger row.
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'rally';
    if v_led <> 1 then
      raise exception 'GATE(c): expected exactly one rally ledger row, found %', v_led;
    end if;

    -- REPLAY: refused, gold does NOT move again, inventory does NOT grow, no 2nd ledger row.
    v := public.world_event_claim__ungated(v_dk, v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(d): replay was not refused: %', v;
    end if;
    select gold into v_g2 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g2 <> v_g1 then
      raise exception 'GATE(d): replay RE-CREDITED gold (% -> %)', v_g1, v_g2;
    end if;
    -- inventory qty for the first item must be unchanged (no double-credit).
    v_it := (v_first->'items')->0;
    select coalesce(qty,0) into v_have_qty from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = v_it->>'id';
    if v_have_qty <> (v_it->>'qty')::bigint then
      raise exception 'GATE(d): replay DOUBLE-CREDITED item % (now %, expected %)',
        v_it->>'id', v_have_qty, (v_it->>'qty')::bigint;
    end if;
    select count(*) into v_invrows2 from public.player_inventory where user_id = v_uid and slot = v_slot;
    if v_invrows2 <> v_invrows then
      raise exception 'GATE(d): replay changed the inventory row count (% -> %)', v_invrows, v_invrows2;
    end if;
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'rally';
    if v_led <> 1 then
      raise exception 'GATE(d): replay wrote a second rally ledger row (now %)', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'muster-chest-items §3 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- rollback asserted, not assumed.
  if exists (select 1 from public.player_state      where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.world_event_joins where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  -- (e) grant-hygiene stays clean (signature unchanged, but assert it anyway).
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v := public.hr_assert_grant_hygiene(false);
    if jsonb_array_length(v->'unapproved_client_rpcs') <> 0
       or jsonb_array_length(v->'ungated_client_rpcs') <> 0
       or jsonb_array_length(v->'baseline_rows_no_longer_live') <> 0 then
      raise exception 'GATE(e): grant-hygiene drift after body change: %', v;
    end if;
  end if;

  raise notice 'muster-chest-items: inner replaced, items credited to player_inventory, credit-once, replay-safe, inventory-survival, grant-hygiene all green';
end $$;
