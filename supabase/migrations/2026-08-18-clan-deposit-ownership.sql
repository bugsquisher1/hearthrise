-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-18-clan-deposit-ownership.sql
--   THE CLAN STOREHOUSE STOPS MINTING MATERIALS.
--
-- ── THE DEFECT (Security review, b366 — P0) ─────────────────────────────
-- `clan_deposit` has been server-authoritative for identity, membership, the
-- item catalogue, the clock, the per-call and per-day gold-value clamps and the
-- CP/standing arithmetic since 2026-08-08. It has NEVER been authoritative for
-- POSSESSION, and its own header says so in as many words ("It cannot verify
-- the caller owned what they deposited, because game_saves.snapshot is
-- client-authored and there is no server inventory").
--
-- That sentence stopped being true on 2026-08-11, when player-state.sql landed
-- `public.player_inventory`. What was an honest limitation became a live hole:
--
--     select clan_deposit('<clan>', '{"keystone": 100000}'::jsonb);
--
-- from a browser console deposits goods the caller does not own — and unlike a
-- forged local save, EVERY consequence crosses to other players:
--   · clan_stores       — the hold's shared materials
--   · castle_tier       — the gate on every building and the member cap
--   · clan_members.cp   — contribution ranking inside the hold
--   · clans.standing    — the clan_power leaderboard
-- The clamps bound the RATE (1,000,000 gold value per call, 5,000,000 per
-- member per UTC day) but a bound on free money is not a refusal.
--
-- ── THE FIX, AND WHY IT IS THIS SHAPE ───────────────────────────────────
-- The ownership debit is PORTED VERBATIM in structure from `hr_market_list`
-- (2026-08-17-market-v2.sql §(d), "THE ESCROW. This IS the possession check."):
-- read the row `for update`, refuse `insufficient_item` when short, delete at
-- exactly-zero rather than storing a zero row (player_inventory has
-- `check (qty > 0)`).
--
-- Two things had to change around it, and both are the reason this is a new
-- body rather than five inserted lines:
--
--   1. THE LOOP COULD NOT REFUSE SAFELY. The 2026-08-08 body returns
--      `ok:false, not_castle_good` from INSIDE the item loop, AFTER earlier
--      iterations have already inserted into clan_stores and clan_ledger. A
--      plain `return` commits those writes — the S2 defect that
--      tests/run-sql-tests.mjs PART 1c lints hr_apply for. With an ownership
--      debit in the same loop that becomes materially worse: a mixed batch
--      could debit item A, refuse item B, and COMMIT the half-transfer. So the
--      whole write section now runs inside a PROTECTED BLOCK and every refusal
--      goes through `public.hr_reject()`, which raises `HR000` — rolling the
--      subtransaction back — and is caught once at the bottom and turned back
--      into the same `{ok:false, error:…}` envelope the client already handles.
--      No caller-visible contract change; a partial deposit is now unreachable.
--
--   2. A DEPOSIT NEEDS A CHARACTER SLOT and the signature cannot grow one.
--      `clan_deposit(uuid,jsonb)` is wrapped by the A9 retrofit and pinned in
--      tests/rpc-resolution.targets.json; a third parameter would be a NEW
--      OVERLOAD beside the old one and PostgREST resolution would go ambiguous.
--      So the slot is DERIVED server-side (prefer 0, else the lowest the user
--      owns) — which is the right answer anyway: a client-supplied slot is a
--      client-supplied choice of which inventory to drain.
--
-- ⚠ IT REPLACES `clan_deposit__ungated`, NOT `clan_deposit`. §4 of
--   2026-08-11-authenticated-surface-lockdown.sql renamed the body to
--   `clan_deposit__ungated(uuid,jsonb)` and installed a rate-gated wrapper at
--   the public name. A `create or replace function public.clan_deposit(...)`
--   here would replace the WRAPPER with an ungated body and silently delete the
--   A9 gate — that file's §6 names this exact footgun ("The one-way door").
--   §0(a) below REFUSES TO INSTALL if the retrofit is not live, and §3(e)
--   asserts the wrapper is still a wrapper afterwards.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
--   · No idempotency key. The signature cannot carry one (see 2 above), so a
--     retried deposit still deposits twice — as it always has. The change is
--     that it now also DEBITS twice, so the ceiling on a retry storm is the
--     player's own inventory rather than infinity. Named, not hidden.
--   · `clan_feast_deposit(uuid,int)` takes a raw `p_heals` integer with no item
--     at all, and `clan_contribute(uuid,bigint)` debits no gold. Both are the
--     same defect class and are OUT OF SCOPE here on purpose: one body, one
--     review. Filed for the next pass.
--   · Legacy client-side-only stock (a player whose bag exists only in
--     game_saves.snapshot) is REFUSED, not grandfathered. That is the Phase-2
--     transition gap; `settleBeforeIntent` at the clan UI (b366) settles first,
--     so an online player's server inventory is current before the call.
--
-- REVERSIBILITY: re-applying the `clan_deposit__ungated` body from
-- 2026-08-08-clan-seat.sql §7 (renamed) restores the old behaviour exactly. It
-- writes no table, adds no object, drops nothing and changes no grant.
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- §0  REFUSE TO INSTALL AGAINST A DATABASE THIS BODY WOULD BREAK
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
  v_hits int := 0;
  t text;
  -- Terms of the 2026-08-08 body this file's replacement CARRIES FORWARD. If
  -- the live body does not have them, it is not the body this was derived from
  -- and replacing it blind is the single most destructive statement in the repo.
  c_terms text[] := array[
    'hr_castle_items',       -- the server-side catalogue
    'c_day_clamp',           -- the per-member per-day gold-value ceiling
    'clan_ledger',           -- the append-only journal the day clamp is READ from
    '0.4',                   -- the at-cap demand multiplier (spec, verbatim)
    '0.35'                   -- the CP -> standing ratio (spec, verbatim)
  ];
begin
  -- (a) THE A9 RETROFIT MUST BE LIVE. Without it the body is still at the
  --     public name and this file would have to replace THAT — which is the
  --     one-way door. Refuse rather than guess.
  if to_regprocedure('public.clan_deposit__ungated(uuid,jsonb)') is null then
    raise exception 'REFUSING: public.clan_deposit__ungated(uuid,jsonb) does not exist. '
      'Apply 2026-08-11-authenticated-surface-lockdown.sql (the A9 retrofit) first — this file '
      'replaces the INNER body on purpose, and replacing public.clan_deposit(uuid,jsonb) instead '
      'would delete the rate gate.';
  end if;
  if to_regprocedure('public.clan_deposit(uuid,jsonb)') is null then
    raise exception 'REFUSING: the public.clan_deposit(uuid,jsonb) wrapper is missing — '
      'the A9 retrofit is half-applied and the RPC is unreachable.';
  end if;

  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'clan_deposit__ungated';

  -- (b) POSITIVE CONTROL: every carried term must be in the live body.
  foreach t in array c_terms loop
    if position(t in v_src) = 0 then
      raise exception 'REFUSING: the live clan_deposit__ungated body does not contain %, so it is '
        'not the 2026-08-08 body this replacement was derived from. Read it before replacing it.', t;
    end if;
    v_hits := v_hits + 1;
  end loop;
  if v_hits <> array_length(c_terms, 1) then
    raise exception 'REFUSING: term scan counted % of % — the scan itself is broken',
      v_hits, array_length(c_terms, 1);
  end if;

  -- (c) NEGATIVE CONTROL. A `position(... in prosrc)` scan that can never
  --     return 0 reports a clean bill on any body at all; this is the
  --     always-null-probe failure the whole SQL tier is organised around.
  if position('hr_this_token_is_not_in_any_body' in v_src) <> 0 then
    raise exception 'REFUSING: the negative control MATCHED — the body scan is not discriminating';
  end if;

  -- (d) …and it must NOT already be the fixed body, or this file is being
  --     applied on top of itself with the derivation unverifiable. That is a
  --     NOTICE, not a refusal: re-applying this file is safe and idempotent.
  if position('insufficient_item' in v_src) <> 0 then
    raise notice 'clan_deposit__ungated already carries the ownership debit — this is a re-apply';
  end if;

  -- (e) THE TABLE THE DEBIT READS, and the reject helper the protected block
  --     raises through. Both fail CLOSED: without player_inventory the new body
  --     would refuse every honest deposit; without hr_reject it would not
  --     compile a rollback path at all.
  if to_regclass('public.player_inventory') is null then
    raise exception 'REFUSING: public.player_inventory does not exist. Apply '
      '2026-08-11-player-state.sql first — the ownership debit has nothing to read and every '
      'deposit would answer insufficient_item.';
  end if;
  if to_regclass('public.player_state') is null then
    raise exception 'REFUSING: public.player_state does not exist (2026-08-11-player-state.sql)';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'REFUSING: public.hr_reject(text,jsonb) does not exist. Apply '
      '2026-08-11-apply-engine.sql first — it is how a refusal inside the protected block rolls '
      'the whole deposit back instead of committing half of it.';
  end if;
  -- ⚠ THE ARGUMENT LIST IS `(timestamptz)`, NOT `()`. It has a DEFAULT, so the
  --   call site reads `hr_utc_day_key()` — but to_regprocedure resolves the
  --   IDENTITY, and `public.hr_utc_day_key()` is NULL on every database in the
  --   world. Same shape as the to_regproc defect linted in
  --   tests/run-sql-tests.mjs PART 1c-ii; found by executing this file, not by
  --   reading it.
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'REFUSING: public.hr_utc_day_key() does not exist (2026-08-08-clan-seat.sql)';
  end if;

  raise notice 'clan-deposit-ownership §0: preconditions OK';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §1  THE BODY
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.clan_deposit__ungated(p_clan_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- ── CARRIED VERBATIM from 2026-08-08-clan-seat.sql §7. These are an abuse
  --    ceiling, not a gameplay limit, and they are NOT this file's to retune.
  c_call_clamp constant bigint := 1000000;    -- gold value per call
  c_day_clamp  constant bigint := 5000000;    -- gold value per member per UTC day
  c_max_kinds  constant int    := 40;
  c_qty_clamp  constant bigint := 100000;     -- per item id per call
  c_store_base constant bigint := 2500;       -- Storehouse cap per item, ×Treasury lvl
  v_clan     public.clans%rowtype;
  v_day      text := public.hr_utc_day_key();
  v_treasury_lv int;
  v_cap      bigint;
  v_spent_today bigint := 0;
  v_budget   bigint;
  v_demand   jsonb;
  k text; v_qty bigint;
  v_item     public.hr_castle_items%rowtype;
  v_have     bigint;
  v_mult     numeric;
  v_kind     text;
  v_unit_cp  bigint;
  v_cp_total bigint := 0;
  v_value    bigint := 0;
  v_stand    bigint;
  v_capped   boolean := false;
  v_ordered  boolean := false;
  v_stored   jsonb := '{}'::jsonb;
  v_new_cp   bigint;
  v_new_standing bigint;
  -- ── NEW (b366, Security P0) ──
  v_uid      uuid;
  v_slot     int;
  v_own      bigint;
  v_debited  jsonb := '{}'::jsonb;
  v_out      jsonb;
  v_detail   text;
begin
  v_uid := auth.uid();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if (select count(*) from jsonb_object_keys(p_items)) > c_max_kinds then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;

  -- THE SLOT IS DERIVED, NEVER SENT. Prefer 0 (the only slot the client ever
  -- creates today), else the lowest the caller owns. A caller with no character
  -- has no server inventory, and the honest answer is a refusal rather than an
  -- unchecked deposit — see the header on the Phase-2 transition gap.
  select slot into v_slot from public.player_state
   where user_id = v_uid order by (slot <> 0), slot limit 1;
  if v_slot is null then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  -- ════════════════════════════════════════════════════════════════════
  -- THE PROTECTED BLOCK. Everything below writes. Every refusal from here
  -- on raises HR000 through hr_reject() and is caught at the bottom, so a
  -- refused row rolls back the ENTIRE deposit — no half-transfer, ever.
  -- A bare `return jsonb_build_object('ok', false, …)` in here would COMMIT
  -- the writes that preceded it. Do not add one.
  -- ════════════════════════════════════════════════════════════════════
  begin
    -- Serialise this character against itself. Two deposits in flight would
    -- otherwise interleave their debits with their clan_stores inserts; the
    -- `for update` below bounds the inventory rows but not the version bump.
    -- Same key shape hr_market_list uses.
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

    perform public.clan_upkeep_settle(p_clan_id);          -- lazy settle, every touch
    select * into v_clan from public.clans where id = p_clan_id;
    if v_clan.upkeep_state = 'dormant' then
      -- A dormant hold freezes Work Orders, but it must still accept supplies —
      -- otherwise a clan that misses one Sunday cannot dig itself out.
      null;
    end if;

    v_treasury_lv := coalesce(nullif(v_clan.upgrades->>'treasury','')::int, 0);
    v_cap := c_store_base * greatest(1, v_treasury_lv);    -- a hold has stores before it has a Treasury

    -- Per-member per-day value budget, read from the ledger rather than stored:
    -- one fewer counter to reset, and it is auditable by construction.
    select coalesce(sum(qty * i.gold_value), 0) into v_spent_today
      from public.clan_ledger l
      join public.hr_castle_items i on i.item_id = l.item_id
     where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'deposit'
       and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');
    v_budget := least(c_call_clamp, greatest(0, c_day_clamp - v_spent_today));
    if v_budget <= 0 then
      perform public.hr_reject('daily_cap', jsonb_build_object('spent', v_spent_today, 'limit', c_day_clamp));
    end if;

    -- What the hold is asking for right now: the open Work Order's materials plus
    -- the next tier's bundle. Anything on that list carries the 1.5× multiplier —
    -- which is how the castle TELLS the clan what it needs, without a chat message.
    select coalesce(jsonb_object_agg(k2, true), '{}'::jsonb) into v_demand
      from (
        select jsonb_object_keys(materials) as k2
          from public.clan_work_orders
         where clan_id = p_clan_id and phase in ('supply','labour')
        union
        select jsonb_object_keys(materials) as k2
          from public.hr_castle_tiers where tier = v_clan.castle_tier + 1
      ) d;

    -- `order by key` so a batch is processed in one deterministic order: the
    -- budget is consumed item by item, so which row gets clamped to zero is an
    -- OUTCOME, and an outcome that depends on jsonb's internal ordering is a
    -- dispute nobody can resolve.
    for k, v_qty in select key, greatest(0, least(c_qty_clamp, coalesce(nullif(value,'')::bigint, 0)))
                      from jsonb_each_text(p_items) order by key loop
      if v_qty <= 0 then continue; end if;
      select * into v_item from public.hr_castle_items where item_id = k;
      -- THE RULE: the castle refuses raw gathered materials. Logs, ore, fish and
      -- crops are not in the catalogue, so a gatherer needs a crafter — permanently.
      if v_item.item_id is null then
        perform public.hr_reject('not_castle_good', jsonb_build_object('item_id', k));
      end if;
      -- Budget is spent in gold value, so one clamp bounds a beam and a Keystone
      -- alike without a per-item table of limits.
      if v_item.gold_value > 0 then
        v_qty := least(v_qty, v_budget / v_item.gold_value);
      end if;
      if v_qty <= 0 then continue; end if;

      -- ── THE OWNERSHIP DEBIT (b366, Security P0). ────────────────────────
      -- Ported from hr_market_list §(d): read `for update`, refuse when short,
      -- delete rather than store a zero row (player_inventory checks qty > 0).
      -- It runs BEFORE the clan_stores insert on purpose — not for correctness
      -- (the whole block rolls back either way) but so the lock is taken on the
      -- player's row before the shared row, which is one consistent lock order
      -- for every caller of this function.
      -- ⚠ THE DEBIT USES THE CLAMPED v_qty, i.e. exactly what is deposited.
      --   Debiting the REQUESTED quantity would charge a player for goods the
      --   budget clamp refused to store.
      select qty into v_own from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = k for update;
      v_own := coalesce(v_own, 0);
      if v_own < v_qty then
        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', k, 'have', v_own, 'need', v_qty));
      end if;
      if v_own = v_qty then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = k;
      else
        update public.player_inventory set qty = v_own - v_qty
         where user_id = v_uid and slot = v_slot and item_id = k;
      end if;
      v_debited := v_debited || jsonb_build_object(k, v_qty);

      select coalesce(qty, 0) into v_have from public.clan_stores
        where clan_id = p_clan_id and item_id = k;
      v_have := coalesce(v_have, 0);

      -- The demand multiplier. 0.4× at cap is kept VERBATIM from the source doc
      -- and it is load-bearing: it stops one player dumping 40,000 Normal Planks
      -- and owning the ladder while the hold is starved of Fittings.
      if v_have >= v_cap then
        v_mult := 0.4; v_kind := 'capped'; v_capped := true;
      elsif v_demand ? k then
        v_mult := 1.5; v_kind := 'ordered'; v_ordered := true;
      else
        v_mult := 1.0; v_kind := 'normal';
      end if;

      v_unit_cp := floor(ceil(v_item.gold_value / 10.0)
                         * (array[1.0,1.4,2.0,2.9,4.2,6.0,8.6])[v_item.tier]
                         * v_mult)::bigint;
      v_cp_total := v_cp_total + v_unit_cp * v_qty;
      v_value    := v_value + v_item.gold_value * v_qty;
      v_budget   := greatest(0, v_budget - v_item.gold_value * v_qty);

      insert into public.clan_stores as s (clan_id, item_id, qty) values (p_clan_id, k, v_qty)
        on conflict (clan_id, item_id) do update set qty = s.qty + excluded.qty;

      insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty, cp, standing)
        values (p_clan_id, v_uid, 'deposit', k, v_qty, v_unit_cp * v_qty,
                floor(v_unit_cp * v_qty * 0.35)::bigint);

      v_stored := v_stored || jsonb_build_object(k, v_have + v_qty);
    end loop;

    -- The inventory changed, so any delta a client is still computing against
    -- the old inventory must now be refused (the hr_market_list §(f) rule).
    -- ⚠ accrued_to is NOT touched: a deposit is not an activity change, so the
    --   unpaid accrual window survives it.
    if v_debited <> '{}'::jsonb then
      update public.player_state set version = version + 1, updated_at = now()
       where user_id = v_uid and slot = v_slot;
    end if;

    if v_cp_total <= 0 then
      v_out := jsonb_build_object('ok', true, 'cp', 0, 'standing', 0,
        'clan_standing', v_clan.standing, 'stored', v_stored, 'demand', 'normal',
        'capped', v_capped, 'debited', v_debited, 'slot', v_slot);
    else
      v_stand := floor(v_cp_total * 0.35)::bigint;      -- the source doc's ratio, kept

      perform public.hr_clan_decay_cp(p_clan_id, v_uid);   -- decay BEFORE crediting
      update public.clan_members set cp = cp + v_cp_total, cp_at = now(), last_seen = now()
        where clan_id = p_clan_id and user_id = v_uid
        returning cp into v_new_cp;
      update public.clans set standing = standing + v_stand where id = p_clan_id
        returning standing into v_new_standing;

      v_out := jsonb_build_object('ok', true, 'cp', v_cp_total, 'standing', v_stand,
        'member_cp', v_new_cp, 'clan_standing', v_new_standing, 'stored', v_stored,
        'value', v_value, 'store_cap', v_cap, 'debited', v_debited, 'slot', v_slot,
        'demand', case when v_capped then 'capped' when v_ordered then 'ordered' else 'normal' end,
        'capped', v_capped);
    end if;
  exception when sqlstate 'HR000' then
    -- THE ROLLBACK. Everything the block wrote — every debit, every clan_stores
    -- row, every ledger row — is gone by the time this handler runs, because a
    -- PL/pgSQL block with an exception handler is a subtransaction. The envelope
    -- is the same shape the 2026-08-08 body returned, so no client changes.
    get stacked diagnostics v_detail = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', sqlerrm,
      'detail', coalesce(nullif(v_detail, ''), '{}')::jsonb);
  end;

  return v_out;
end $$;

-- REVOKE BEFORE GRANT. `create or replace` PRESERVES the existing ACL, and the
-- A9 retrofit already revoked all four roles here — but a body that lands as a
-- BRAND NEW object (a rebuild where the rename has not run, which §0(a) refuses,
-- or a future reorder) picks up Supabase's default ACL, and the inner twin being
-- reachable is the gate becoming decoration. Stated, not assumed.
revoke execute on function public.clan_deposit__ungated(uuid, jsonb)
  from public, anon, authenticated, service_role;
-- Deliberately NO grant: only the wrapper is client-callable.

-- ════════════════════════════════════════════════════════════════════════
-- §2  THE END STATE, ASSERTED
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
  v_wrap text;
  v_bad text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'clan_deposit__ungated';
  select prosrc into v_wrap from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'clan_deposit';

  -- (a) THE DEBIT IS THERE, all three of its parts.
  if position('player_inventory' in v_src) = 0 then
    raise exception 'clan_deposit__ungated does not read player_inventory — the ownership debit is absent';
  end if;
  if position('for update' in v_src) = 0 then
    raise exception 'clan_deposit__ungated reads player_inventory without `for update` — two concurrent '
      'deposits could each see the same stock and both succeed';
  end if;
  if position('insufficient_item' in v_src) = 0 then
    raise exception 'clan_deposit__ungated never refuses insufficient_item — it reads the inventory and '
      'does not act on it, which is a check that reads as a check and is not one';
  end if;

  -- (b) THE ROLLBACK PATH. A refusal must RAISE, not return: a bare
  --     `return ok:false` after a write commits the write (the S2 defect).
  if position('hr_reject' in v_src) = 0 then
    raise exception 'clan_deposit__ungated refuses without hr_reject — a mid-loop return would COMMIT '
      'the rows already written and a mixed batch could half-transfer';
  end if;
  if position('HR000' in v_src) = 0 then
    raise exception 'clan_deposit__ungated has no HR000 handler — every refusal would escape as a 500';
  end if;

  -- (c) NEGATIVE CONTROL on the scan itself.
  if position('hr_this_token_is_not_in_any_body' in v_src) <> 0 then
    raise exception '§2 body scan is not discriminating';
  end if;

  -- (d) THE CLAMPS SURVIVED. This file is a possession fix, not a rebalance.
  if position('1000000' in v_src) = 0 or position('5000000' in v_src) = 0
     or position('100000' in v_src) = 0 or position('2500' in v_src) = 0 then
    raise exception 'clan_deposit__ungated lost one of its four clamps (call/day/qty/store) — the new '
      'body was supposed to ADD an ownership check, not relax a ceiling';
  end if;
  if position('0.4' in v_src) = 0 or position('1.5' in v_src) = 0 or position('0.35' in v_src) = 0 then
    raise exception 'clan_deposit__ungated lost a demand multiplier or the CP->standing ratio';
  end if;
  if position('clan_ledger' in v_src) = 0 then
    raise exception 'clan_deposit__ungated no longer journals to clan_ledger — the append-only ledger '
      'is what the per-day cap is READ from, so losing it also removes the cap';
  end if;

  -- (e) THE GATE IS STILL A GATE. This is the "one-way door" assertion: if this
  --     file had replaced the public name instead of the inner twin, the wrapper
  --     would no longer reference hr_rpc_gate and the RPC would be ungated.
  if v_wrap is null or position('hr_rpc_gate' in v_wrap) = 0 then
    raise exception 'public.clan_deposit(uuid,jsonb) no longer references hr_rpc_gate — the A9 wrapper '
      'has been replaced by an ungated body';
  end if;

  -- (f) THE INNER TWIN IS UNREACHABLE by any client role.
  select string_agg(g, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.clan_deposit__ungated(uuid,jsonb)', 'execute');
  if v_bad is not null then
    raise exception 'clan_deposit__ungated is executable by: % — the gate is decoration', v_bad;
  end if;

  -- (g) …and the WRAPPER is still callable by a signed-in player, or the fix is
  --     a feature outage. Both directions, always.
  if not has_function_privilege('authenticated', 'public.clan_deposit(uuid,jsonb)', 'execute') then
    raise exception 'authenticated can no longer execute public.clan_deposit(uuid,jsonb) — the '
      'Storehouse is offline';
  end if;

  raise notice 'clan-deposit-ownership §2: ownership debit live, clamps intact, gate intact';
end $$;

-- The file must END on a terminated statement, not on a comment banner — the
-- smoke suite's migration guard checks exactly that.
do $$ begin
  raise notice 'clan-deposit-ownership: end of file reached cleanly.';
end $$;
