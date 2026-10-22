-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ACCOUNT DEPOT (Tyler 2026-10-15, confirmed 2026-10-22:
-- "Depot/storage should be account shared"). STAGED (lane/c-account-shared,
-- backend-architect, 2026-10-22). Game CLOSED: applies on its passing §6;
-- INVENTORY SURFACE (items move between a character and the account), Security
-- reviews it with the reopen gate. Design: docs/design/ACCOUNT_DEPOT.md.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 public.account_bank (user_id, item_id) -> qty: ONE depot per ACCOUNT. Every
--    character of the account deposits into and withdraws from the same rows.
--    RLS on, own-read policy, no client write privilege (as player_bank had).
-- §2 THE FOLD of the per-character player_bank into it, ONCE, then player_bank
--    is DROPPED (no second copy, no back-compat: CLAUDE.md §1). THE FOLD RULE:
--      account qty(user, item) = SUM over every slot's player_bank qty(user, item).
--      Nothing is capped or dropped: the depot's only limit is the 1,000-stack
--      fuse in hr_bank_move, checked when a deposit OPENS a new stack; folding
--      can only MERGE stacks (a fold never has more stacks than the largest
--      union of item ids, <= the catalogue, 500 today), so no account comes out
--      over the fuse. Should one ever (a larger catalogue), it keeps every item
--      and can still deposit into existing stacks; it opens no new stack until
--      under the fuse. A sum past bigint aborts the whole apply (loud, never
--      lossy). Rows of a user no longer in auth.users have no account to fold
--      into and are reported, not kept (account_bank cascades on auth.users).
--      Every folded source row is journalled: player_ledger kind 'bank', intent
--      'depot_fold', qty 0 (the bag does not move), meta {from_slot, qty}.
-- §3 hr_bank_move RESTATED WHOLE from the replayed pre-image (md5 pinned in §0):
--    the depot side reads and writes account_bank; the ACCOUNT DEPOT LOCK is
--    taken after the character lock; the journal row says depot 'account'.
--    Signature, grants, refusals, idempotency (per key, intent, slot): unchanged.
-- §4 hr_state_of RESTATED WHOLE (md5 pinned): `bank` = the account's depot, the
--    same map on every slot. Nothing else moves.
-- §5 hr_account_items RESTATED WHOLE (md5 pinned): the depot is listed ONCE, as
--    the account's ({slot: null, name: null, where: 'bank'}), not once per slot.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Two characters of one account no longer share a character lock, so the
--   depot needs its own: LOCK ORDER character row (player_state FOR UPDATE)
--   -> ACCOUNT DEPOT advisory xact lock (hashtextextended('hr:depot:'||uid, 0))
--   -> account_bank rows. Nothing takes a character lock after the depot lock,
--   and hr_bank_move locks only its own character, so two characters' moves
--   serialise on the depot lock and cannot deadlock. Under it the stack fuse
--   count is exact and the withdraw's read-check-write is atomic; the deposit is
--   additionally an upsert with arithmetic (qty = qty + excluded.qty), never a
--   client number. The acting character's version is bumped; the siblings' are
--   NOT (that would take their locks after ours); the client re-reads the open
--   siblings after a move (src/session/account-session.js).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Unchanged in kind: an item moves bag <-> depot, value-neutral, qty conserved,
-- the client names only (slot, item, qty, dir, idem). NEW: an item can now pass
-- from one character of an account to another (deposit on A, withdraw on B).
-- That is the ruling. It crosses no account boundary: account_bank is keyed by
-- auth.uid() and nothing reads another user's rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-create player_bank (2026-08-27-bank-store.sql §1), copy account_bank into
-- slot 0, re-apply the pinned pre-images of hr_bank_move (2026-09-28-settle-
-- before-mutate.sql), hr_state_of (2026-10-27-core-bodies.sql) and
-- hr_account_items (2026-10-25-account-items.sql), drop account_bank. Which slot
-- held what before the fold is in the ledger's depot_fold rows.
-- ORDER: after 2026-11-09-armour-class-catalogue.generated.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.player_bank') is null and to_regclass('public.account_bank') is null then
    raise exception 'PRECONDITION: neither player_bank (2026-08-27-bank-store.sql) nor account_bank exists'; end if;
  if to_regclass('public.account_wallet') is null or to_regprocedure('public.hr_vitals_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-19-account-wallet.sql and 2026-10-27-core-bodies.sql first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_state_of(uuid,integer)');
  if v_md5 is distinct from 'acfce7c8ea82935fa64b8764161b9389' and v_md5 is distinct from '3b3cb26036747839f85fa006ffde9040' then
    raise exception 'PIN: hr_state_of is neither the 2026-10-27 image (acfce7c8...) nor this file''s (3b3cb260...) - md5 %: another file moved it; restate from the new image', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_bank_move(integer,text,bigint,text,uuid)');
  if v_md5 is distinct from '88bd5e89fa15b1b54400a2522f8c62d5' and v_md5 is distinct from '6aef04d74eb5d1abf6724c3693d128a9' then
    raise exception 'PIN: hr_bank_move is neither the 2026-09-28 image (88bd5e89...) nor this file''s (6aef04d7...) - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_account_items(text)');
  if v_md5 is distinct from '31359d72f9d926f7009918da71788a25' and v_md5 is distinct from 'dadfb52f55b5141d71340a1e3d949c0f' then
    raise exception 'PIN: hr_account_items is neither the 2026-10-25 image (31359d72...) nor this file''s (dadfb52f...) - md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE ACCOUNT DEPOT ─────────────────────────────────────────────────────
create table if not exists public.account_bank (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  item_id    text        not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  qty        bigint      not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
comment on table public.account_bank is
  '2026-11-10 (Tyler 2026-10-15/2026-10-22): the ACCOUNT depot, shared by every character of the account. '
  'Written ONLY by hr_bank_move (SECURITY DEFINER) under the account depot lock; qty > 0, a zero is a deleted row.';
alter table public.account_bank enable row level security;
revoke all on public.account_bank from public, anon, authenticated, service_role;
grant select on public.account_bank to authenticated;
drop policy if exists "account_bank own read" on public.account_bank;
create policy "account_bank own read" on public.account_bank for select
  using ((select auth.uid()) = user_id);

-- ── §2 THE FOLD (once), PROVEN ON A PROBE FIRST, THEN player_bank IS DROPPED ──
-- The one fold statement, as a session-temporary function so the probe and the
-- real fold run the SAME text. p_user scopes it (the probe); null = everyone.
create or replace function pg_temp.hr_depot_fold(p_user uuid)
returns int language plpgsql as $f$
declare v_n int;
begin
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select pb.user_id, pb.slot, 'bank', 'depot_fold', pb.item_id, 0,
         jsonb_build_object('from_slot', pb.slot, 'qty', pb.qty, 'to', 'account')
    from public.player_bank pb
   where (p_user is null or pb.user_id = p_user)
     and exists (select 1 from auth.users u where u.id = pb.user_id);
  insert into public.account_bank as a (user_id, item_id, qty, updated_at)
  select pb.user_id, pb.item_id, sum(pb.qty)::bigint, now()      -- numeric sum: past bigint RAISES, never wraps
    from public.player_bank pb
   where (p_user is null or pb.user_id = p_user)
     and exists (select 1 from auth.users u where u.id = pb.user_id)
   group by pb.user_id, pb.item_id
  on conflict (user_id, item_id) do update set qty = a.qty + excluded.qty, updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $f$;

do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000de9070f1';
  v_i1 text; v_i2 text; v_n int; v_orph bigint;
begin
  if to_regclass('public.player_bank') is null then
    raise notice 'account-depot §2: player_bank is gone already (a re-apply) - nothing to fold';
    return;
  end if;
  -- NO MOVE MAY LAND BETWEEN THE FOLD'S READ AND THE DROP: the file applies as one
  -- transaction (tools/apply-migration.mjs, one query), so this lock is held to commit
  -- and a concurrent old-body hr_bank_move waits, then fails on the dropped table
  -- (a refused click, never a lost item).
  lock table public.player_bank in access exclusive mode;
  -- (§2a) THE FOLD RULE, EXECUTED ON A PROBE: slot 0 holds 5 + 2, slot 1 holds 7 of the first item.
  select min(item_id), max(item_id) into v_i1, v_i2 from public.hr_items;
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.player_bank (user_id, slot, item_id, qty) values
      (v_u, 0, v_i1, 5), (v_u, 0, v_i2, 2), (v_u, 1, v_i1, 7);
    v_n := pg_temp.hr_depot_fold(v_u);
    if v_n <> 2
       or (select qty from public.account_bank where user_id = v_u and item_id = v_i1) <> 12
       or (select qty from public.account_bank where user_id = v_u and item_id = v_i2) <> 2 then
      raise exception 'VERIFY(fold): slot 0 {%:5, %:2} + slot 1 {%:7} folded to %', v_i1, v_i2, v_i1,
        (select jsonb_object_agg(item_id, qty) from public.account_bank where user_id = v_u); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'depot_fold' and kind = 'bank' and qty = 0) <> 3 then
      raise exception 'VERIFY(fold): % journal rows for 3 folded stacks',
        (select count(*) from public.player_ledger where user_id = v_u and intent = 'depot_fold'); end if;
    raise exception using errcode = 'HR891', message = 'account-depot fold probe complete - rolling back';
  exception when sqlstate 'HR891' then null;
  end;
  if exists (select 1 from public.account_bank where user_id = v_u) or exists (select 1 from public.player_bank where user_id = v_u) then
    raise exception 'VERIFY(fold): the probe LEAKED a row'; end if;

  -- (§2b) THE REAL FOLD: every account, once.
  select count(*) into v_orph from public.player_bank pb where not exists (select 1 from auth.users u where u.id = pb.user_id);
  v_n := pg_temp.hr_depot_fold(null);
  raise notice 'account-depot §2: % account stacks folded from % character stacks (% orphan rows of deleted users not kept)',
    v_n, (select count(*) from public.player_bank), v_orph;
  -- (§2c) CONSERVATION: every surviving user's per-item total is exactly the account row.
  if exists (
    select 1 from (select pb.user_id, pb.item_id, sum(pb.qty) as q from public.player_bank pb
                    where exists (select 1 from auth.users u where u.id = pb.user_id) group by 1, 2) s
     full join public.account_bank a on a.user_id = s.user_id and a.item_id = s.item_id
    where s.q is distinct from a.qty) then
    raise exception 'VERIFY(fold): the account depot does not equal the summed character banks'; end if;
end $mig$;
drop function if exists pg_temp.hr_depot_fold(uuid);
drop table if exists public.player_bank;

-- ── §3 hr_bank_move — RESTATED WHOLE: THE DEPOT SIDE IS THE ACCOUNT'S ─────────
create or replace function public.hr_bank_move(p_slot integer, p_item text, p_qty bigint, p_dir text, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- hr_bank_move restated WHOLE by 2026-11-10-account-depot.sql (chain depth 0) from the
-- 2026-09-28-settle-before-mutate.sql image: the depot is public.account_bank, ONE per
-- account, under the ACCOUNT DEPOT LOCK taken after the character lock. The bag side,
-- the refusals, the idempotency and the journal are unchanged.
declare
  c_max_move        constant bigint := 1000000;  -- per-call blast radius (matches hr_apply c_max_item_delta)
  c_max_bank_stacks constant int    := 1000;     -- absolute fuse on the ACCOUNT depot's stacks
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_have   bigint;
  v_stacks int;
  v_cached jsonb;
  v_new_version bigint;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('bank_move', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;

  -- IDEMPOTENCY: a replayed idem returns the first call's exact result, no re-move.
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'bank_' || p_dir) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('bank_move', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- INPUT VALIDATION — the client value is only a request; re-checked below.
  if p_dir is null or p_dir not in ('deposit', 'withdraw') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_direction'));
  end if;
  if p_qty is null or p_qty < 1 then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty'));
  end if;
  if p_qty > c_max_move then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'qty_clamp', 'limit', c_max_move));
  end if;
  -- Unknown ids refused against the SERVER catalogue (hr_items).
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', p_item));
  end if;

  -- THE CHARACTER LOCK (its bag and version) ...
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- ... THEN THE ACCOUNT DEPOT LOCK. Every character of the account moves through
  -- this one key, so the stack count and the withdraw's check-then-write below are
  -- exact under concurrency. Order: character -> depot -> account_bank rows; nothing
  -- takes a character lock after it (2026-11-10-account-depot.sql header).
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  if p_dir = 'deposit' then
    -- ── BAG → DEPOT ─────────────────────────────────────────────────────────
    -- DEBIT the bag (this select-for-update IS the ownership check).
    select qty into v_have from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty));
    end if;
    -- DEPOT STACK FUSE: only when this deposit opens a NEW stack in the account's depot.
    if not exists (select 1 from public.account_bank
                    where user_id = v_uid and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.account_bank
         where user_id = v_uid limit c_max_bank_stacks + 1) s;
      if v_stacks >= c_max_bank_stacks then
        return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', c_max_bank_stacks));
      end if;
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    else
      update public.player_inventory set qty = qty - p_qty
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    end if;
    insert into public.account_bank as b (user_id, item_id, qty, updated_at)
      values (v_uid, p_item, p_qty, now())
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
  else
    -- ── DEPOT → BAG ─────────────────────────────────────────────────────────
    -- DEBIT the depot (ownership check: the account's own row, locked).
    select qty into v_have from public.account_bank
      where user_id = v_uid and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_bank',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty));
    end if;
    -- BAG STACK FUSE: mirror hr_apply's bank_cap ceiling on player_inventory
    -- stacks (bank_cap is the BAG's stack cap, per character), only when this
    -- withdraw opens a NEW bag stack.
    if not exists (select 1 from public.player_inventory
                    where user_id = v_uid and slot = p_slot and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = p_slot limit v_state.bank_cap + 1) s;
      if v_stacks >= v_state.bank_cap then
        return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bag_full', 'cap', v_state.bank_cap));
      end if;
    end if;
    if v_have = p_qty then
      delete from public.account_bank
        where user_id = v_uid and item_id = p_item;
    else
      update public.account_bank set qty = qty - p_qty, updated_at = now()
        where user_id = v_uid and item_id = p_item;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;

  -- VERSION BUMP of the ACTING character (the clock its client reconciles on). The
  -- account's other characters are not bumped: their clients re-read after a move.
  v_new_version := v_state.version + 1;
  update public.player_state set version = v_new_version, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  -- JOURNAL: one aggregate row per move (rule 6 — never per-tick). qty carries
  -- the BAG-side signed delta (deposit removes from bag = negative); the slot is
  -- the acting character's, meta.depot says the other side is the account's.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'bank', 'bank_' || p_dir, p_item,
            case when p_dir = 'deposit' then -p_qty else p_qty end,
            jsonb_build_object('dir', p_dir, 'qty', p_qty, 'depot', 'account'));

  v_cached := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty,
    'direction', p_dir, 'version', v_new_version);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'bank_' || p_dir, v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end
$function$;

-- ── §4 hr_state_of — RESTATED WHOLE: `bank` IS THE ACCOUNT DEPOT ───────────────
create or replace function public.hr_state_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- restated again WHOLE by 2026-11-10-account-depot.sql: `bank` reads the ACCOUNT depot
-- (public.account_bank), identical on every slot. Nothing else moved.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
        v_w  public.account_wallet%rowtype;
        v_vit jsonb;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE ACCOUNT WALLET. One PK probe; a missing row reads 0 (never NULL), so an
  -- account the wallet has not met yet renders an honest zero, not "unknown".
  select * into v_w from public.account_wallet where user_id = p_user;
  -- THE CORE MODEL'S VITALS (2026-10-27): Level, max HP / mana and the regen rate, derived.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);

  -- ── THE SECTION REGISTRY (architecture contracts X7; 2026-10-23-character-premium.sql):
  --    every hr_state_sections row, folded UNDER the hand-written keys below.
  return public.hr_state_sections_of(p_user, v_st.slot) || jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    -- ── buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms ──
    --    introduced by 2026-09-13-consumable-buffs.sql
    --    `scale` was added by 2026-09-13-buff-cellar-scale.sql
    -- ── level / vitals — THE CORE MODEL (2026-10-27-core-bodies.sql; CORE_MODEL.md §2-3) ──
    --    Level from kills only (player_state.level_xp), endless; max HP and max mana from
    --    Level and armour weight, the regen rate from Prayer: all DERIVED, never stored.
    'level', public.hr_level_block(v_st.level_xp),
    'vitals', v_vit,
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    -- ── place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE ──
    --    introduced by 2026-09-13-town-presence.sql
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON
    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },
    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a
    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon
    -- with no active mode is omitted, a fresh character gets {}; an absent key on
    -- the client means READY, which is safe because the SERVER refuses — the worst
    -- case is one refused intent. The client reads map[dungeon_id][mode].
    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──
    --    introduced by 2026-09-12-dungeon-cooldown.sql
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at streak_day_key) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', coalesce(v_w.gems, 0),
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      -- ── state.marks — the Bounty-Marks currency ──
      --    introduced by 2026-08-26-marks-record.sql
      'marks', v_st.marks,
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──
      --    introduced by 2026-09-10-dungeon-scrip.sql
      'dungeon_scrip', v_st.dungeon_scrip,
      -- ── state — tokens, hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int), 'max_hp', (v_vit->>'max_hp')::int, 'level_xp', v_st.level_xp,
      'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      -- ── state.workers_accrued_to — the hired crew's own watermark ──
      --    introduced by 2026-08-25-workers.sql
      'workers_accrued_to', v_st.workers_accrued_to,
      -- ── state.combat_xp_accrued_to — the combat-XP cadence watermark ──
      --    introduced by 2026-08-31-combat-xp-credit.sql
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──
      --    introduced by 2026-08-22-rested-record.sql
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      -- ── state.tool_carry — the gathering carry the SERVER owns ──
      --    introduced by 2026-08-15-tool-carry.sql
      'tool_carry', v_st.tool_carry,
      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
      -- ── state.hearthfind_* — the switch, the day’s find, the titles, the plinth ──
      --    introduced by 2026-09-08-hearthfind.sql
      'hearthfind_ready', true,
      -- THE DAY'S LATEST FIND, so a RETRIED SETTLE DOES NOT LOSE THE REVEAL.
      -- hr_apply's replay path returns `hr_state_of(...) || {replayed:true}` --
      -- a FRESH envelope, deliberately, because storing the receipt would put a
      -- full snapshot in player_intents (revision 2 did, at ~690 MB per player
      -- per day). The consequence is that the `hearthfind` field of the
      -- ORIGINAL receipt exists only on the first response: a settle whose
      -- reply is lost to a dropped connection is retried, comes back ok, and
      -- the player is never told about the rarest thing that has ever happened
      -- to them. The trophy and the ledger row were never at risk; only the
      -- MOMENT was, and the moment is the entire feature.
      --
      -- Projected from the append-only journal (the only durable record) rather
      -- than from world_finds, because the public row is suppressed by the
      -- 60-second broadcast clamp while the ledger row never is. Scoped to the
      -- UTC day so it is self-expiring: there is no state to clear, no flag to
      -- reset, and a client that has already revealed it simply sees the same
      -- object again (it carries `at`, so the client can tell). One index probe
      -- on player_ledger_hearthfind_idx; null on the ~100% of reads with no
      -- find today.
      'hearthfind_last', (
        select jsonb_build_object('item', l.item_id, 'at', l.at) || coalesce(l.meta, '{}'::jsonb)
          from public.player_ledger l
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hearthfind'
           and l.at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         order by l.at desc limit 1),
      -- THE COSMETICS THE CHARACTER OWNS. Projected from the server table, not
      -- carried in the residue: a title is earned state, and CLAUDE.md §6 is
      -- explicit that anything a player would miss after a reload lives in a
      -- server row and is projected. Two arrays and one boolean, all derived:
      --   hearthfind_titles  every title unlocked, newest last
      --   hearthfind_plinth  whether the homestead plinth is unlocked
      -- The EQUIPPED title is deliberately absent until an equip intent exists;
      -- a client that picked one would be authoring it, and there is no RPC yet
      -- that would let the server own that choice. Stated as a known limitation
      -- rather than shipped as a residue field.
      'hearthfind_titles', coalesce((
        select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'at', c.granted_at)
                         order by c.granted_at)
          from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'title'), '[]'::jsonb),
      'hearthfind_plinth', exists (
        select 1 from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'plinth'),
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      -- ── state.fight — the IN-FLIGHT fight the server owns ──
      --    introduced by 2026-08-17-fight-carry.sql
      'fight', v_st.fight,
      -- THE TWO DEATH COUNTERS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died. A survival counter must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the two death counters, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      -- ── state.streak_days — the daily settle streak ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_days', v_st.streak_days,
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()'s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier's price. The client NEVER computes this.
      -- ── state.plot_level — the SERVER-owned farm plot tier ──
      --    introduced by 2026-09-06-state-of-farm-projection.sql
      'plot_level', v_st.plot_level,
      -- ── state.streak_day_key — the streak’s UTC day key ──
      --    introduced by 2026-08-21-streak-state.sql
      -- ── state.streak_day_key — CLOSES `state` (the combat style left with the core rebuild) ──
      'streak_day_key', v_st.streak_day_key),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_skill_level(skill_id, xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ── bank — THE ACCOUNT DEPOT (Tyler 2026-10-15 / 2026-10-22: the depot is shared
    --    by every character of the account). public.account_bank, written only by
    --    hr_bank_move, projected as a flat {item_id:qty} map beside `inventory`:
    --    the SAME map on every slot of the account. Absent row = real zero
    --    (qty>0 invariant + delete-on-zero in hr_bank_move).
    --    introduced by 2026-08-27-bank-store.sql; account-scoped by 2026-11-10-account-depot.sql
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.account_bank where user_id = p_user), '{}'::jsonb),
    -- ── equipment — the worn set ──
    --    introduced by 2026-08-11-apply-engine.sql
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    -- ── enchant — ELEMENTS v1, the server-owned weapon enchant ──
    --    introduced by 2026-08-18-enchant.sql
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──
    --    introduced by 2026-08-25-workers.sql
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── farm — the plots, with the FULL waterings array (Q-5) ──
    --    introduced by 2026-08-11-apply-engine.sql
    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── progress / progress_truncated — capped at 1000 rows, and it SAYS when it capped ──
    --    introduced by 2026-08-11-apply-engine.sql
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md
                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside
                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies
                 -- + the collection log breach this 1000-row cap, and the failure is
                 -- SILENT: kind='collection' sorts ahead of daily/flag/quest/stat,
                 -- so what falls off the end is a player's quest state.
                 and key not like 'trophy:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
           -- 2026-09-22: the TROPHY population. The SAME predicate as the one
           -- inside `progress` above, and it must stay the same: a flag that
           -- counted rows the array excludes would report truncation that did
           -- not happen, which is the read filter / prune divergence RL3 names.
           and key not like 'trophy:%'
         limit 1001) t),
    -- ── client_state — the denylisted client-preference bag ──
    --    introduced by 2026-08-28-client-state.sql
    'client_state', coalesce(v_st.client_state, '{}'::jsonb),
    -- ── total_level — derived server-side ──
    --    introduced by 2026-08-11-apply-engine.sql
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    -- ── unlocked_recipes — the gated recipes THIS character has learned ──
    --    introduced by 2026-09-14-recipe-learn.sql
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),
    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,
    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock
    -- (there is no client write policy and no client write grant on
    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops
    -- living in the residue a cloud restore can rewind — the half of the b371
    -- gem dupe that made a free theme STICK. Always contains the FREE rows
    -- (theme:default), so the starting theme stays equippable the moment the
    -- client reads this set server-first. Never truncated: an entitlement must
    -- not be able to read as "you own nothing".
    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──
    --    introduced by 2026-09-14-gem-unlock-buy.sql
    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),
    -- THE SERVER'S COUNTED RENOWN (2026-09-12). The high-water hr_claim_rank
    -- decides every rank against, cached on player_state by the ratchet §1 added
    -- to hr_apply. Read straight off the row this function already selected, so
    -- the projection is free; the recompute lives on the apply path where it is
    -- floored at one call per intent instead of one per envelope.
    -- DISPLAY + the rank-up card only — the client authors none of it, there is
    -- no client write policy or grant on player_state, and hr_renown_of stays
    -- revoked from every browser role. This is the caller's OWN character (the
    -- whole body is keyed on p_user/v_st.slot); no other player's score is
    -- reachable through it. 0 on a fresh character, never null.
    -- ── renown_high — the SERVER’s counted renown, display only ──
    --    introduced by 2026-09-12-renown-high-projection.sql
    'renown_high', coalesce(v_st.renown_high, 0),
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    -- ── bounty — the active contract and the SERVER’s own progress arithmetic ──
    --    introduced by 2026-09-09-bounty-progress-projection.sql
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),
    -- hero-slot-buy: the ACCOUNT's owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    -- ── hero_slots — ACCOUNT-scoped entitlement. NEVER truncated ──
    --    introduced by 2026-09-08-hero-slot-buy.sql
    'hero_slots', public.hr_hero_slots_of(p_user),
    -- trait-buy: the character's OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    -- ── traits — owned permanent traits, read UNFILTERED ──
    --    introduced by 2026-08-23-trait-buy.sql
    'traits', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb),
    -- companion-record (blob-retire capstone): the FULL roster the client rebuilds
    -- G.companions from under arm — equipped id + owned set + per-id XP. hr_perks_of
    -- carries only the EQUIPPED companion's {id,xp} for pricing; this carries the
    -- whole set so the reconstruction cannot silently reset a player's roster/XP.
    -- The starter 'fox' is owned by grammar (no unlock row) and is unioned in by
    -- the client, so it is deliberately absent from `owned`.
    -- ── companions — the FULL roster (equipped + owned + per-id XP) ──
    --    introduced by 2026-08-22-companion-record.sql
    'companions', jsonb_build_object(
      'equipped', v_st.companion_equipped,
      'owned', coalesce((
        select jsonb_agg(substring(pp.key from 11) order by pp.key)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'unlock' and pp.period_key = ''
           and pp.key like 'companion:%' and pp.value > 0), '[]'::jsonb),
      'xp', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.value)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:'), '{}'::jsonb),
      -- ^ an EXACT prefix since 2026-10-12 (was `like`, whose `_` matched any
      -- character): a row is projected as a pet's XP only under the key
      -- hr_apply equipped-checks and caps.
      -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql). The
      -- engine's input (envelope.js companionXpFrac); non-zero only, absent = 0.
      'frac', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.xp_frac)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:' and pp.xp_frac > 0), '{}'::jsonb)),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    -- ── inventory_complete — the STAMPED completeness signal, fail-closed ──
    --    introduced by 2026-08-24-inventory-complete.sql
    --    the third (worker) arm was added by 2026-08-25-workers.sql
    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $function$;

-- ── §5 hr_account_items — RESTATED WHOLE: THE DEPOT IS LISTED ONCE, AS THE ACCOUNT'S ──
create or replace function public.hr_account_items(p_query text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
-- restated WHOLE by 2026-11-10-account-depot.sql from the 2026-10-25-account-items.sql
-- image: the depot is ONE per account, so its rows carry slot null / name null /
-- where 'bank' and are listed once (first), not once per character.
declare
  v_uid uuid := auth.uid(); v_q text; v_pat text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_q := lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
  if length(v_q) not between 2 and 40 then return jsonb_build_object('ok', false, 'error', 'bad_query'); end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('slot', r.slot,
                                        'name', case when r.slot is null then null else public.hr_character_name(v_uid, r.slot) end,
                                        'item', r.item_id, 'qty', r.qty, 'where', r.loc)
                     order by r.slot nulls first, r.ord, i.name, r.item_id)
      from (select x.* from (
              select null::integer as slot, ab.item_id, ab.qty, 'bank'::text as loc, 1 as ord from public.account_bank ab
               where ab.user_id = v_uid and ab.qty > 0
              union all
              select pi.slot, pi.item_id, pi.qty, 'bag', 0 from public.player_inventory pi
               where pi.user_id = v_uid and pi.qty > 0
              union all
              select pe.slot, pe.item_id, count(*)::bigint, 'worn', 2 from public.player_equipment pe
               where pe.user_id = v_uid group by pe.slot, pe.item_id) x
             join public.hr_items it on it.item_id = x.item_id
            where lower(it.name) like v_pat escape '\' or it.item_id like v_pat escape '\'
            order by x.slot nulls first, x.ord, x.item_id
            limit 200) r
      join public.hr_items i on i.item_id = r.item_id), '[]'::jsonb));
end
$function$;
update public.hr_client_rpc_baseline
   set note = 'added 2026-10-25 (lane S2): read-only - where matching items are across the CALLER''s own characters (bag, worn) and the account depot (bank, slot null), <= 200 rows; depot account-scoped 2026-11-10'
 where proname = 'hr_account_items' and grantee = 'authenticated';

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000de9070f2';
  k   constant text := '000000c0-0000-4000-b000-0000de90';
  v jsonb; v_item text; v_role text; v_tot bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'account-depot §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
    select min(item_id) into v_item from public.hr_items where item_id not in
      (select item_id from public.player_inventory where user_id = v_u);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 10);

    -- (a) A DEPOSIT ON SLOT 0 LANDS IN THE ACCOUNT DEPOT.
    v := public.hr_bank_move(0, v_item, 7, 'deposit', (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true'
       or (select qty from public.account_bank where user_id = v_u and item_id = v_item) <> 7
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) <> 3 then
      raise exception 'VERIFY(a): deposit 7 of 10 on slot 0 answered %', v; end if;
    -- (b) BOTH SLOTS' ENVELOPES CARRY THE SAME DEPOT.
    if (public.hr_state_of(v_u, 1)->'bank'->>v_item)::bigint is distinct from 7
       or public.hr_state_of(v_u, 0)->'bank' is distinct from public.hr_state_of(v_u, 1)->'bank' then
      raise exception 'VERIFY(b): slot 0 reads % and slot 1 reads %', public.hr_state_of(v_u, 0)->'bank', public.hr_state_of(v_u, 1)->'bank'; end if;
    -- (c) SLOT 1 WITHDRAWS WHAT SLOT 0 DEPOSITED; the stack empties to no row.
    v := public.hr_bank_move(1, v_item, 7, 'withdraw', (k || '0002')::uuid);
    if coalesce(v->>'ok', '') <> 'true'
       or exists (select 1 from public.account_bank where user_id = v_u and item_id = v_item)
       or (select qty from public.player_inventory where user_id = v_u and slot = 1 and item_id = v_item) <> 7 then
      raise exception 'VERIFY(c): withdraw 7 on slot 1 answered %', v; end if;
    -- (d) NOTHING LEFT: a second withdraw is refused with the server's count.
    v := public.hr_bank_move(0, v_item, 1, 'withdraw', (k || '0003')::uuid);
    if v->>'error' is distinct from 'insufficient_bank' or (v->>'have')::bigint <> 0 then
      raise exception 'VERIFY(d): an empty depot answered %', v; end if;
    -- (e) A REPLAYED DEPOSIT MOVES NOTHING (the first answer, again).
    v := public.hr_bank_move(0, v_item, 7, 'deposit', (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.account_bank where user_id = v_u and item_id = v_item)
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) <> 3 then
      raise exception 'VERIFY(e): a replay moved items: %', v; end if;
    -- (f) INTERLEAVED WRITERS: both characters deposit into one stack; nothing is lost.
    v := public.hr_bank_move(0, v_item, 3, 'deposit', (k || '0004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): slot 0 deposit answered %', v; end if;
    v := public.hr_bank_move(1, v_item, 4, 'deposit', (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): slot 1 deposit answered %', v; end if;
    select coalesce((select qty from public.account_bank where user_id = v_u and item_id = v_item), 0)
         + coalesce((select sum(qty) from public.player_inventory where user_id = v_u and item_id = v_item), 0) into v_tot;
    if v_tot <> 10 or (select qty from public.account_bank where user_id = v_u and item_id = v_item) <> 7 then
      raise exception 'VERIFY(f): 10 items became % (depot %)', v_tot,
        (select qty from public.account_bank where user_id = v_u and item_id = v_item); end if;
    -- (g) EVERY MOVE JOURNALLED, by the acting slot, the depot side the account's.
    if (select count(*) from public.player_ledger where user_id = v_u and kind = 'bank' and meta->>'depot' = 'account') <> 4
       or (select count(distinct slot) from public.player_ledger where user_id = v_u and kind = 'bank') <> 2 then
      raise exception 'VERIFY(g): % journal rows for 4 moves', (select count(*) from public.player_ledger where user_id = v_u and kind = 'bank'); end if;
    -- (h) THE ACCOUNT SEARCH LISTS THE DEPOT ONCE, AS THE ACCOUNT'S.
    v := public.hr_account_items(v_item);
    if coalesce(v->>'ok', '') <> 'true'
       or (select count(*) from jsonb_array_elements(v->'rows') e where e->>'where' = 'bank') <> 1
       or (select count(*) from jsonb_array_elements(v->'rows') e where e->>'where' = 'bank' and e->'slot' = 'null'::jsonb and (e->>'qty')::bigint = 7) <> 1 then
      raise exception 'VERIFY(h): hr_account_items answered %', v; end if;
    raise exception using errcode = 'HR892', message = 'account-depot §6 complete - rolling back';
  exception when sqlstate 'HR892' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u) then
    raise exception 'VERIFY(i): §6 LEAKED a probe row'; end if;
  -- (i) THE GRANTS: no client writes the depot; the per-character table is gone; the move is authenticated-only.
  if to_regclass('public.player_bank') is not null then raise exception 'VERIFY(i): player_bank still exists - a second copy of the depot'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.account_bank', 'insert,update,delete,truncate') then
      raise exception 'VERIFY(i): % can write account_bank', v_role; end if;
  end loop;
  if has_table_privilege('anon', 'public.account_bank', 'select') then raise exception 'VERIFY(i): anon reads account_bank'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'account_bank') <> 1
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_bank' and cmd <> 'SELECT') then
    raise exception 'VERIFY(i): account_bank policies are not exactly the own-read one'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.account_bank'::regclass) then
    raise exception 'VERIFY(i): account_bank has RLS off'; end if;
  if has_function_privilege('anon', 'public.hr_bank_move(integer,text,bigint,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_bank_move(integer,text,bigint,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_account_items(text)', 'execute') then
    raise exception 'VERIFY(i): hr_bank_move / hr_account_items grants moved'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc like '%player\_bank%' escape '\') then
    raise exception 'VERIFY(i): a function still reads player_bank: %', (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc like '%player\_bank%' escape '\'); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'account-depot: one depot per account, every character deposits and withdraws the same stacks, journalled; all green';
end $$;
