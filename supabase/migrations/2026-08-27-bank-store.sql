-- ============================================================================
-- 2026-08-27-bank-store.sql — THE BANK ITEM STORE → SERVER-OWNED (DORMANT).
--
-- Server-authority tail-fields program: the BANK (G.bank's item store — a second
-- item container the player deposits into, separate from the bag G.inventory)
-- moves off the client-authored save blob into a real server-owned table, with
-- deposit/withdraw becoming a SERVER INTENT (hr_bank_move). Ships DORMANT: no
-- client flip lands with this SQL. The RPC is installed and hr_state_of projects
-- the bank, but the client keeps authoring G.bank locally until the SAME arm as
-- the inventory flip flips (INVENTORY_ARM_ENABLED, POST-WIPE). This migration
-- changes NO live behaviour.
--
-- ── ARCHITECTURE NOTE — WHY A SEPARATE TABLE, NOT A `container` COLUMN ────────
-- The tail-fields audit recommended a `container` dimension ON player_inventory.
-- That is unimplementable ADDITIVELY: a player holds the same item_id in BOTH
-- bag and bank as distinct rows, so `container` MUST join the primary key
-- (user_id, slot, item_id) → (…, container). The live 86KB SECURITY DEFINER
-- hr_apply — the authority engine every combat/gather/craft/gold/equip flow runs
-- through — touches player_inventory in ~7 places by (user_id, slot, item_id)
-- with `... for update`, `delete`, and `insert … on conflict (user_id, slot,
-- item_id)`. Under a 4-column PK every one of those selects returns two rows
-- (bag + bank) and every on-conflict target no longer resolves. Delivering the
-- container column therefore REQUIRES rewriting hr_apply — a non-additive change
-- to the live authority engine, exactly the class of change the mandate forbids
-- ("additive only; a wrong overwrite deletes real item value; correct over
-- fast"). A separate player_bank table delivers the IDENTICAL client contract
-- (hr_state_of projects `res.bank`; deposit/withdraw is hr_bank_move(...)) and
-- the identical security model, while touching NOTHING on the live hr_apply path.
-- The client folds `res.bank` through the SAME serverOwnedItem carve-out and the
-- SAME arm as the bag, so the "same authority machinery" goal is met. This
-- deviation is deliberate and flagged for the Security review.
--
-- ── WHAT IS ADDED ────────────────────────────────────────────────────────────
--   §1  player_bank (user_id, slot, item_id, qty>0) — PK (user_id, slot, item_id),
--       RLS own-read only, NO client write policy. Mirrors player_inventory.
--   §2  hr_state_of — projects a top-level `bank` map beside `inventory`
--       (programmatic pg_get_functiondef patch, additive, NO-OP if present, so
--       NOT a HR_STATE_OF_CHAIN member — same technique as 2026-08-22-rested-record).
--   §3  hr_bank_move(p_slot,p_item,p_qty,p_dir,p_idem) — the deposit/withdraw
--       intent: per-character lock (player_state FOR UPDATE), version bump,
--       idempotent (player_intents), rate-gated, journalled (player_ledger
--       kind='bank'), clamped to what the player holds. Value-NEUTRAL move.
--   §4  hr_rpc_gate — adds the 'bank_move' bucket (60/min). Restated whole,
--       carrying every existing bucket (hr_rpc_gate is on no derivation chain).
--   §5  hr_client_rpc_baseline row + hygiene gate.
--   §6  SELF-CHECK (HR819-rolled-back): deposit/withdraw move atomically, clamp,
--       no-dupe, no-negative, idempotent replay, bank projection, no client write
--       policy, RPC not public/anon/engine-executable.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive. player_bank may be left in place (nothing reads it while dormant).
-- hr_state_of/hr_rpc_gate are restorable by re-applying their predecessor bodies;
-- both patches are NO-OP if already present, so re-apply is safe. Dropping
-- hr_bank_move is a plain DROP FUNCTION. The client flip reverts with the
-- inventory arm.
-- ============================================================================
-- The apply harness owns the transaction (no top-level begin/commit here, per
-- the repo S5 convention — see 2026-08-26-marks-record.sql / 2026-08-25-workers.sql).
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
-- (`do $$` — the lint's self-verifying-block marker; see PART 1d.)
do $$
begin
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_intents') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.hr_items') is null then
    raise exception 'core player/catalogue tables missing — run schema + player-state chain first';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate absent';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of absent';
  end if;
end $$;

-- ── 1. THE TABLE ─────────────────────────────────────────────────────────────
-- Mirrors player_inventory exactly (user_id, slot, item_id, qty) so the client
-- can fold `res.bank` through the SAME machinery as `res.inventory`. qty > 0 is
-- an invariant: a stack that reaches zero is DELETEd, so an absent row is a real
-- zero (the equivalence the absolute-replace flip relies on). Written ONLY by
-- hr_bank_move (SECURITY DEFINER); §6 asserts no client write policy.
create table if not exists public.player_bank (
  user_id uuid    not null,
  slot    integer not null,
  item_id text    not null,
  qty     bigint  not null,
  primary key (user_id, slot, item_id)
);
do $mig$ begin
  alter table public.player_bank add constraint player_bank_qty_pos check (qty > 0);
exception when duplicate_object then null; end $mig$;

alter table public.player_bank enable row level security;
drop policy if exists "player_bank own read" on public.player_bank;
create policy "player_bank own read" on public.player_bank for select
  using ((select auth.uid()) = user_id);

-- ── 1b. player_ledger.kind — allow the 'bank' kind (additive superset) ───────
-- The journal's kind CHECK is an allowlist; add 'bank' for the deposit/withdraw
-- receipt. Drop-and-re-add carrying EVERY existing kind (2026-08-25-workers.sql
-- added 'worker' last), so a rebuild in any order lands the same superset.
do $mig$ begin
  alter table public.player_ledger drop constraint if exists player_ledger_kind_check;
  alter table public.player_ledger add constraint player_ledger_kind_check
    check (kind = any (array[
      'accrue','craft','gather','combat','farm','trade','shop','quest','equip',
      'admin','iap','clan','raid','enchant','daily','collection','renown',
      'bounty','rally','worker','bank']));
end $mig$;

-- ── 2. hr_state_of — PROJECT the bank map (programmatic, additive) ───────────
-- A top-level `bank` key beside `inventory`, built by aggregating player_bank
-- exactly as `inventory` aggregates player_inventory. Inserted BEFORE the
-- `equipment` projection (a unique anchor). NO-OP if already present → re-apply
-- safe, and (because the migration text carries no literal hr_state_of
-- create-or-replace statement, only a dynamic EXECUTE of patched
-- pg_get_functiondef output) this is NOT a HR_STATE_OF_CHAIN toucher.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, $q$'bank', coalesce($q$) > 0 then
    raise notice 'hr_state_of already projects bank — skipping';
  else
    v_def := replace(v_def,
      $anc$    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)$anc$,
      $anc$    -- bank-store (b438): the BANK item container, server-owned
    -- (player_bank, no client write policy), projected as a flat {item_id:qty}
    -- map beside `inventory`. The client folds it through the SAME
    -- serverOwnedItem carve-out and the SAME inventory arm as the bag. Absent
    -- row = real zero (qty>0 invariant + delete-on-zero in hr_bank_move).
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_bank where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)$anc$);
    if v_def = pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) then
      raise exception 'bank-store: hr_state_of equipment anchor not found — the live body drifted';
    end if;
    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_bank_move — the deposit/withdraw INTENT ────────────────────────────
-- Pattern: 2026-08-08-clan-seat.sql / 2026-08-22-server-farming-complete.sql —
-- server catalogue (hr_items), server clock, idempotency (player_intents), per-
-- call lock (player_state FOR UPDATE), append-only journal (player_ledger
-- kind='bank'), rate gate ('bank_move'), NO client write policy on
-- player_bank / player_inventory / player_state.
--
-- SECURITY MODEL: this is a VALUE-NEUTRAL move between two of the SAME player's
-- own containers — no mint is possible (you can only move what you hold), and
-- nothing crosses to another player. Every quantity is re-derived under the row
-- lock and clamped to holdings; the client's p_qty is only a request. The stack
-- fuses (bank_full / bag_full) are blast-radius bounds, not balance.
create or replace function public.hr_bank_move(
  p_slot int, p_item text, p_qty bigint, p_dir text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  c_max_move        constant bigint := 1000000;  -- per-call blast radius (matches hr_apply c_max_item_delta)
  c_max_bank_stacks constant int    := 1000;     -- absolute fuse on bank rows (not the purchasable cap)
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_have   bigint;
  v_stacks int;
  v_cached jsonb;
  v_new_version bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- IDEMPOTENCY: a replayed idem returns the first call's exact result, no re-move.
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('bank_move') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- INPUT VALIDATION — the client value is only a request; re-checked below.
  if p_dir is null or p_dir not in ('deposit', 'withdraw') then
    return jsonb_build_object('ok', false, 'error', 'bad_direction');
  end if;
  if p_qty is null or p_qty < 1 then
    return jsonb_build_object('ok', false, 'error', 'bad_qty');
  end if;
  if p_qty > c_max_move then
    return jsonb_build_object('ok', false, 'error', 'qty_clamp', 'limit', c_max_move);
  end if;
  -- Unknown ids refused against the SERVER catalogue (hr_items), exactly as
  -- hr_apply's item op does. A bank can hold any authored item (crops, cooked
  -- food, seeds) — all are in hr_items — so this excludes only forged ids.
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', p_item);
  end if;

  -- PER-CHARACTER LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  if p_dir = 'deposit' then
    -- ── BAG → BANK ──────────────────────────────────────────────────────────
    -- DEBIT the bag (this select-for-update IS the ownership check).
    select qty into v_have from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- BANK STACK FUSE: only when this deposit opens a NEW bank stack.
    if not exists (select 1 from public.player_bank
                    where user_id = v_uid and slot = p_slot and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.player_bank
         where user_id = v_uid and slot = p_slot limit c_max_bank_stacks + 1) s;
      if v_stacks >= c_max_bank_stacks then
        return jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', c_max_bank_stacks);
      end if;
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    else
      update public.player_inventory set qty = qty - p_qty
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    end if;
    insert into public.player_bank as b (user_id, slot, item_id, qty)
      values (v_uid, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = b.qty + excluded.qty;
  else
    -- ── BANK → BAG ──────────────────────────────────────────────────────────
    -- DEBIT the bank (ownership check).
    select qty into v_have from public.player_bank
      where user_id = v_uid and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_bank',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- BAG STACK FUSE: mirror hr_apply's bank_cap ceiling on player_inventory
    -- stacks, only when this withdraw opens a NEW bag stack.
    if not exists (select 1 from public.player_inventory
                    where user_id = v_uid and slot = p_slot and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = p_slot limit v_state.bank_cap + 1) s;
      if v_stacks >= v_state.bank_cap then
        return jsonb_build_object('ok', false, 'error', 'bag_full', 'cap', v_state.bank_cap);
      end if;
    end if;
    if v_have = p_qty then
      delete from public.player_bank
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    else
      update public.player_bank set qty = qty - p_qty
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;

  -- VERSION BUMP (optimistic-concurrency clock the client reconciles on).
  v_new_version := v_state.version + 1;
  update public.player_state set version = v_new_version, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  -- JOURNAL: one aggregate row per move (rule 6 — never per-tick). qty carries
  -- the BAG-side signed delta (deposit removes from bag = negative).
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'bank', 'bank_' || p_dir, p_item,
            case when p_dir = 'deposit' then -p_qty else p_qty end,
            jsonb_build_object('dir', p_dir, 'qty', p_qty));

  v_cached := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty,
    'direction', p_dir, 'version', v_new_version);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'bank_' || p_dir, v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $fn$;

revoke execute on function public.hr_bank_move(int, text, bigint, text, uuid) from public;
revoke execute on function public.hr_bank_move(int, text, bigint, text, uuid) from anon;
grant  execute on function public.hr_bank_move(int, text, bigint, text, uuid) to authenticated;

-- ── 4. hr_rpc_gate — add the 'bank_move' bucket (60/min) ─────────────────────
-- Restated whole (hr_rpc_gate is on no derivation chain). Carries EVERY bucket
-- present on the current last toucher (2026-08-26-marks-record.sql); the only
-- addition is 'bank_move' in the 60/min player-write arm. An unknown bucket
-- fails CLOSED (returns false → 429 forever), so the bucket MUST be added here.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         -- bank-store (b438): deposit/withdraw between the player's own bag and
         -- bank. An ordinary player write; unknown-bucket fails closed so it
         -- lives here beside the other 60/min player writes.
         'bank_move'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;
-- Re-state the lockdown on every restatement (repo convention; create-or-replace
-- preserves the existing revoke at runtime, but the lint enforces re-stating it).
-- hr_rpc_gate is called ONLY by SECURITY DEFINER RPCs — no role needs execute.
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 5. CLIENT-RPC BASELINE + HYGIENE GATE ────────────────────────────────────
do $mig$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'bank-store: player moves items between their own bag and bank. '
         'Value-neutral, version-bumping, idempotent, rate-gated, journalled. '
         'Deliberately NOT granted to hr_engine. 2026-08-27'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_bank_move'
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % row(s) recorded for hr_bank_move', v_n;
end $mig$;

do $mig$
declare v_report jsonb;
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise notice 'hr_assert_grant_hygiene absent — skipping strict gate';
    return;
  end if;
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene reports unapproved client RPCs: %', v_report->'unapproved_client_rpcs';
  end if;
  if jsonb_array_length(coalesce(v_report->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene reports ungated client RPCs: %', v_report->'ungated_client_rpcs';
  end if;
  raise notice 'BANK-STORE BASELINE OK — hygiene clean.';
end $mig$;

-- ── 6. SELF-CHECK — the model is PROVEN, not asserted (HR819-rolled-back) ─────
do $mig$
declare
  v       jsonb;
  v_uid   constant uuid := '000000ba-0000-0000-0000-0000000000ba';
  v_slot  constant int  := 0;
  v_idem  uuid;
  v_bag   bigint;
  v_bank  bigint;
  v_ver0  bigint;
  v_ver1  bigint;
  v_cnt   int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, bank_cap)
      values (v_uid, v_slot, 100, 0, 1, 200)
      on conflict (user_id, slot) do update set version = 1, bank_cap = 200;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'coal', 100)
      on conflict (user_id, slot, item_id) do update set qty = 100;
    delete from public.player_bank where user_id = v_uid;

    select version into v_ver0 from public.player_state where user_id = v_uid and slot = v_slot;

    -- (a) UNKNOWN ITEM refused.
    v := public.hr_bank_move(v_slot, 'not_a_real_item', 5, 'deposit', gen_random_uuid());
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_item' then
      raise exception 'self-check (a): forged item not refused: %', v;
    end if;

    -- (b) BAD DIRECTION / BAD QTY refused.
    v := public.hr_bank_move(v_slot, 'coal', 5, 'sideways', gen_random_uuid());
    if v->>'error' <> 'bad_direction' then raise exception 'self-check (b1): bad dir not refused: %', v; end if;
    v := public.hr_bank_move(v_slot, 'coal', 0, 'deposit', gen_random_uuid());
    if v->>'error' <> 'bad_qty' then raise exception 'self-check (b2): zero qty not refused: %', v; end if;
    v := public.hr_bank_move(v_slot, 'coal', -5, 'deposit', gen_random_uuid());
    if v->>'error' <> 'bad_qty' then raise exception 'self-check (b3): negative qty not refused: %', v; end if;

    -- (c) OVER-DEPOSIT refused (clamped to holdings — cannot move what you lack).
    v := public.hr_bank_move(v_slot, 'coal', 101, 'deposit', gen_random_uuid());
    if v->>'error' <> 'insufficient_item' then raise exception 'self-check (c): over-deposit not refused: %', v; end if;

    -- (d) HAPPY DEPOSIT: 30 coal bag→bank, atomic, version bumped.
    v := public.hr_bank_move(v_slot, 'coal', 30, 'deposit', gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'self-check (d): deposit failed: %', v; end if;
    select coalesce(qty,0) into v_bag  from public.player_inventory where user_id=v_uid and slot=v_slot and item_id='coal';
    select coalesce(qty,0) into v_bank from public.player_bank      where user_id=v_uid and slot=v_slot and item_id='coal';
    if v_bag <> 70 or v_bank <> 30 then raise exception 'self-check (d): not conserved — bag % bank % (want 70/30)', v_bag, v_bank; end if;
    select version into v_ver1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_ver1 <= v_ver0 then raise exception 'self-check (d): version not bumped (% -> %)', v_ver0, v_ver1; end if;

    -- (e) IDEMPOTENT REPLAY: same idem → same result, NO double move.
    v_idem := gen_random_uuid();
    v := public.hr_bank_move(v_slot, 'coal', 10, 'deposit', v_idem);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'self-check (e): deposit#2 failed: %', v; end if;
    v := public.hr_bank_move(v_slot, 'coal', 10, 'deposit', v_idem);   -- replay
    if coalesce(v->>'ok','') <> 'true' then raise exception 'self-check (e): replay not ok: %', v; end if;
    select coalesce(qty,0) into v_bag  from public.player_inventory where user_id=v_uid and slot=v_slot and item_id='coal';
    select coalesce(qty,0) into v_bank from public.player_bank      where user_id=v_uid and slot=v_slot and item_id='coal';
    if v_bag <> 60 or v_bank <> 40 then raise exception 'self-check (e): replay double-moved — bag % bank % (want 60/40)', v_bag, v_bank; end if;

    -- (f) OVER-WITHDRAW refused, then HAPPY WITHDRAW conserves.
    v := public.hr_bank_move(v_slot, 'coal', 999, 'withdraw', gen_random_uuid());
    if v->>'error' <> 'insufficient_bank' then raise exception 'self-check (f1): over-withdraw not refused: %', v; end if;
    v := public.hr_bank_move(v_slot, 'coal', 40, 'withdraw', gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'self-check (f2): withdraw failed: %', v; end if;
    select coalesce(qty,0) into v_bag  from public.player_inventory where user_id=v_uid and slot=v_slot and item_id='coal';
    select count(*) into v_cnt from public.player_bank where user_id=v_uid and slot=v_slot and item_id='coal';
    if v_bag <> 100 or v_cnt <> 0 then raise exception 'self-check (f2): not conserved after full withdraw — bag % bankRows % (want 100/0)', v_bag, v_cnt; end if;

    -- (g) hr_state_of PROJECTS the bank map.
    insert into public.player_bank (user_id, slot, item_id, qty) values (v_uid, v_slot, 'iron_ore', 7)
      on conflict (user_id, slot, item_id) do update set qty = 7;
    v := public.hr_state_of(v_uid, v_slot);
    if v->'bank' is null or jsonb_typeof(v->'bank') <> 'object' then
      raise exception 'self-check (g): hr_state_of does not project bank: %', v->'bank';
    end if;
    if (v->'bank'->>'iron_ore')::bigint <> 7 then
      raise exception 'self-check (g): bank projection wrong: %', v->'bank';
    end if;

    raise exception using errcode = 'HR819', message = 'bank-store §6 done — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- No probe row leaked.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_bank      where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row';
  end if;

  -- STATIC ASSERTIONS — load-bearing properties.
  -- (i) NO client write policy on player_bank.
  select count(*) into v_cnt from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relname = 'player_bank' and pol.polcmd <> 'r';
  if v_cnt <> 0 then raise exception 'GATE: player_bank has % non-read (client write) policy(ies)', v_cnt; end if;

  -- (ii) hr_bank_move NOT executable by public / anon.
  if has_function_privilege('public', 'public.hr_bank_move(int,text,bigint,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_bank_move(int,text,bigint,text,uuid)', 'execute') then
    raise exception 'GATE: hr_bank_move executable by public/anon — revoke failed';
  end if;

  -- (iii) The engine must never bank for a player (if the role exists).
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', 'public.hr_bank_move(int,text,bigint,text,uuid)', 'execute') then
    raise exception 'GATE: hr_engine can execute hr_bank_move — the engine must never bank';
  end if;

  raise notice 'bank-store SELF-CHECK PASSED: atomic deposit/withdraw, clamp, no-dupe, no-negative, idempotent replay, bank projected, no client write, RPC locked down.';
end $mig$;
