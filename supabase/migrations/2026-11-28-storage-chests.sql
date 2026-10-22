-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEPOT'S SPACE: STORAGE CHESTS (Tyler 2026-10-22: "space can
-- be increased by building different storage chests for the house, with gold").
-- STAGED (lane/c-account-shared, backend-architect, 2026-10-22). Game CLOSED:
-- applies on its passing §6; MONEY SURFACE (a gold + material sink), Security
-- reviews it with the reopen gate. Contract: docs/design/ARCHITECTURE_CONTRACTS.md
-- (Depot). Numbers: src/data/homestead-tiers.js STORAGE_CHESTS (PROPOSED, the game
-- designer rules them) via 2026-11-28-storage-chests-catalogue.generated.sql.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 public.account_storage_chests (user_id, chest_id): the chests an ACCOUNT has
--    built, once each. RLS own-read, no client write; written only by §4.
-- §2 READERS (server-only):
--      hr_account_property_tier(user)  the account's home tier: the highest
--        property any of its characters holds (one home per account, Tyler
--        2026-10-15; today's property rows are still filed per character).
--      hr_depot_cap(user)  base_stacks + the stacks of every chest built.
--      hr_depot_view(user, slot)  the `depot` envelope section (registry X7):
--        {used, cap, base, tier, chests[{chest, name, stacks, tier, gold, items,
--        built}], next {chest, name, stacks, tier, gold, items, can_build, why} | null}.
-- §3 hr_bank_move RESTATED WHOLE (md5 pinned): a deposit that opens a new stack
--    is refused bank_full at the ACCOUNT's capacity (hr_depot_cap, never above
--    the 1,000-stack fuse) instead of at the fuse. Everything else unchanged.
-- §4 THE VERB hr_storage_chest_build(p_slot, p_chest, p_price, p_idem) — MONEY.
--    The stamina-refill shape: shape -> idempotency replay (key, intent, slot) ->
--    rate gate -> catalogue -> the paying hero's lock (hr_hunt_lock + its row) ->
--    the ACCOUNT DEPOT lock (hr_bank_move's key) -> refusals: unknown_chest,
--    already_built, needs_previous_chest {need}, needs_property_tier {have, need},
--    quote_changed (p_price is not the catalogue's gold; carries the section) ->
--    ONE hr_apply {gold: -gold, items: {material: -qty}} journalled kind 'shop',
--    intent 'storage_chest:<id>' (hr_apply refuses insufficient_gold /
--    insufficient_item and moves nothing) -> the chest row. Server clock (now()).
--    Clamps: a chest is built at most once per account, so the whole ladder is
--    at most four purchases per account EVER (the per-day clamp of the house
--    pattern is subsumed by "once").
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   LOCK ORDER (the same as hr_bank_move): character (hr_hunt_lock advisory, then
--   its player_state row) -> account depot advisory -> account rows. Two heroes
--   of one account building the same chest serialise on the depot key: one pays,
--   the other answers already_built. A build racing a deposit on another hero
--   serialises on the same key, so the deposit sees the old cap or the new one,
--   never a half.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   A gold + material sink: nothing comes back, nothing crosses an account. The
--   client names (slot, chest, price, key); the price must EQUAL the server's.
--   Capacity is derived on every read from built rows + the catalogue, never
--   stored, so a stale number cannot exist.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-11-27-account-depot.sql's hr_bank_move (its §0 accepts its own
-- image); drop hr_storage_chest_build (+ baseline row), the `depot` section row,
-- hr_depot_view / hr_depot_cap / hr_account_property_tier, account_storage_chests.
-- Gold spent is in the ledger (intent storage_chest:<id>).
-- ORDER: after 2026-11-28-storage-chests-catalogue.generated.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.account_bank') is null then
    raise exception 'PRECONDITION: apply 2026-11-27-account-depot.sql first'; end if;
  if to_regclass('public.hr_storage_chests') is null or to_regclass('public.hr_depot_config') is null then
    raise exception 'PRECONDITION: apply 2026-11-28-storage-chests-catalogue.generated.sql first'; end if;
  if to_regclass('public.hr_state_sections') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: the section registry, hr_hunt_lock or hr_apply is absent'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_bank_move(integer,text,bigint,text,uuid)');
  if v_md5 is distinct from '5708a43d44cc6a45df70b4d7cc974a85' and v_md5 is distinct from 'c2bc3008188b2cd0a83493b53f25edb7' then
    raise exception 'PIN: hr_bank_move is neither 2026-11-27-account-depot.sql''s image (5708a43d...) nor this file''s (c2bc3008...) - md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE ACCOUNT'S CHESTS ─────────────────────────────────────────────────
create table if not exists public.account_storage_chests (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  chest_id   text        not null references public.hr_storage_chests (chest_id),
  built_slot integer     not null check (built_slot between 0 and 5),
  built_at   timestamptz not null default now(),
  primary key (user_id, chest_id)
);
comment on table public.account_storage_chests is
  '2026-11-10 (Tyler 2026-10-22): the storage chests an ACCOUNT has built, once each. Written ONLY by '
  'hr_storage_chest_build under the account depot lock; the depot''s capacity is derived from these rows.';
alter table public.account_storage_chests enable row level security;
revoke all on public.account_storage_chests from public, anon, authenticated, service_role;
grant select on public.account_storage_chests to authenticated;
drop policy if exists "account_storage_chests own read" on public.account_storage_chests;
create policy "account_storage_chests own read" on public.account_storage_chests for select
  using ((select auth.uid()) = user_id);

-- ── §2 THE READERS ───────────────────────────────────────────────────────────
-- THE ACCOUNT'S HOME TIER: max over the `property` namespace, every slot of the
-- account (hr_unlock_buy derives a character's tier the same way, one slot).
create or replace function public.hr_account_property_tier(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(max(pp.value), 0)::int
    from public.player_progress pp
    join public.hr_unlocks u on u.unlock_id = pp.key and u.progress_kind = pp.kind
   where pp.user_id = p_user and pp.period_key = '' and u.namespace = 'property'
$$;
revoke execute on function public.hr_account_property_tier(uuid) from public, anon, authenticated, service_role;

-- THE DEPOT'S CAPACITY in distinct stacks: the base + every chest built. Derived, never stored.
create or replace function public.hr_depot_cap(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  select (select base_stacks from public.hr_depot_config where only_row)
       + coalesce((select sum(c.stacks) from public.account_storage_chests a
                     join public.hr_storage_chests c on c.chest_id = a.chest_id
                    where a.user_id = p_user), 0)::int
$$;
revoke execute on function public.hr_depot_cap(uuid) from public, anon, authenticated, service_role;

-- THE `depot` SECTION: what the Storage window renders (used / cap, the ladder, the next chest).
create or replace function public.hr_depot_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with ch as (
    select c.*, (a.chest_id is not null) as built
      from public.hr_storage_chests c
      left join public.account_storage_chests a on a.user_id = p_user and a.chest_id = c.chest_id),
  nx as (select * from ch where not built order by ord limit 1),
  t as (select public.hr_account_property_tier(p_user) as tier)
  select jsonb_build_object(
    'used', (select count(*) from public.account_bank where user_id = p_user),
    'cap', public.hr_depot_cap(p_user),
    'base', (select base_stacks from public.hr_depot_config where only_row),
    'tier', (select tier from t),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('chest', chest_id, 'name', name, 'stacks', stacks,
        'tier', req_property_tier, 'gold', gold, 'items', items, 'built', built) order by ord) from ch), '[]'::jsonb),
    'next', (select jsonb_build_object('chest', nx.chest_id, 'name', nx.name, 'stacks', nx.stacks, 'tier', nx.req_property_tier,
        'gold', nx.gold, 'items', nx.items,
        'can_build', nx.req_property_tier <= (select tier from t),
        'why', case when nx.req_property_tier > (select tier from t) then 'needs_property_tier' end)
      from nx))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_depot_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('depot', 'hr_depot_view', '2026-11-28-storage-chests.sql: the ACCOUNT depot''s used / capacity, the storage chests built and the next one to build')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 hr_bank_move — RESTATED WHOLE: A NEW STACK FITS THE ACCOUNT'S CAPACITY ──
create or replace function public.hr_bank_move(p_slot integer, p_item text, p_qty bigint, p_dir text, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- hr_bank_move restated WHOLE by 2026-11-27-account-depot.sql (chain depth 0) from the
-- 2026-09-28-settle-before-mutate.sql image: the depot is public.account_bank, ONE per
-- account, under the ACCOUNT DEPOT LOCK taken after the character lock. Restated again
-- by 2026-11-28-storage-chests.sql: a deposit that opens a new stack fits the account's
-- capacity (hr_depot_cap: the base + its storage chests), never above the fuse.
declare
  c_max_move        constant bigint := 1000000;  -- per-call blast radius (matches hr_apply c_max_item_delta)
  c_max_bank_stacks constant int    := 1000;     -- absolute fuse on the ACCOUNT depot's stacks
  v_cap    int;
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
  -- takes a character lock after it (2026-11-27-account-depot.sql header).
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
    -- THE DEPOT'S CAPACITY: only when this deposit opens a NEW stack in the account's
    -- depot. The account's own capacity (base + storage chests), never above the fuse.
    if not exists (select 1 from public.account_bank
                    where user_id = v_uid and item_id = p_item) then
      v_cap := least(public.hr_depot_cap(v_uid), c_max_bank_stacks);
      select count(*) into v_stacks from (
        select 1 from public.account_bank
         where user_id = v_uid limit v_cap + 1) s;
      if v_stacks >= v_cap then
        return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', v_cap));
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


-- ── §4 THE VERB: BUILD THE NEXT STORAGE CHEST ────────────────────────────────
create or replace function public.hr_storage_chest_build(p_slot int, p_chest text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_a jsonb; v_c public.hr_storage_chests%rowtype;
  v_need text; v_tier int; v_items jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_chest is null or p_chest !~ '^[a-z0-9_]{1,40}$' or p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'storage_chest:' || p_chest;
  -- IDEMPOTENCY per (key, intent, slot): a replay answers the first call's result and moves nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('storage_chest_build', p_slot, v_r); end if;
  if not public.hr_rpc_gate('bank_move') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_c from public.hr_storage_chests where chest_id = p_chest;
  if v_c.chest_id is null then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_chest')); end if;
  -- THE PAYING HERO'S LOCK, then THE ACCOUNT DEPOT LOCK (hr_bank_move's key), then the account's rows.
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot for update;
  if v_ver is null then return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  if exists (select 1 from public.account_storage_chests where user_id = v_uid and chest_id = p_chest) then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'already_built')); end if;
  select c.chest_id into v_need from public.hr_storage_chests c
   where c.ord < v_c.ord
     and not exists (select 1 from public.account_storage_chests a where a.user_id = v_uid and a.chest_id = c.chest_id)
   order by c.ord limit 1;
  if v_need is not null then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'needs_previous_chest', 'need', v_need)); end if;
  v_tier := public.hr_account_property_tier(v_uid);
  if v_tier < v_c.req_property_tier then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'needs_property_tier',
      'have', v_tier, 'need', v_c.req_property_tier)); end if;
  if p_price <> v_c.gold then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'depot', public.hr_depot_view(v_uid, p_slot))); end if;
  -- THE PAYMENT: one hr_apply (gold and every material, all or nothing), journalled.
  select coalesce(jsonb_object_agg(k, -(v::bigint)), '{}'::jsonb) into v_items from jsonb_each_text(v_c.items) as t(k, v);
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_c.gold, 'items', v_items,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'storage_chest', 'chest', v_c.chest_id,
                                                                    'stacks', v_c.stacks, 'gold', v_c.gold, 'items', v_c.items))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('storage_chest_build', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  insert into public.account_storage_chests (user_id, chest_id, built_slot, built_at) values (v_uid, v_c.chest_id, p_slot, now());
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'chest', v_c.chest_id, 'gold', -v_c.gold,
                            'depot', public.hr_depot_view(v_uid, p_slot));
end $$;
revoke execute on function public.hr_storage_chest_build(int, text, bigint, uuid) from public;
revoke execute on function public.hr_storage_chest_build(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_storage_chest_build(int, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_storage_chest_build';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_storage_chest_build', 'p_slot integer, p_chest text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2026-11-10 (Tyler 2026-10-22): MONEY (a gold + material sink) - build the account''s next storage chest at the server''s price, once each, in order, at its property tier; refuses quote_changed');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000de9070f3';
  k   constant text := '000000c0-0000-4000-b000-0000de91';
  v jsonb; d jsonb; v_role text; v_c1 public.hr_storage_chests%rowtype; v_c2 public.hr_storage_chests%rowtype;
  v_base int; v_item text; v_gold bigint;
begin
  select * into v_c1 from public.hr_storage_chests order by ord limit 1;
  select * into v_c2 from public.hr_storage_chests order by ord offset 1 limit 1;
  select base_stacks into v_base from public.hr_depot_config where only_row;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'storage-chests §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
    -- (a) A NEW ACCOUNT: the base, nothing built, the first chest next; both slots read the same section.
    d := public.hr_state_of(v_u, 1)->'depot';
    if (d->>'cap')::int <> v_base or (d->>'used')::int <> 0 or d->'next'->>'chest' is distinct from v_c1.chest_id
       or public.hr_state_of(v_u, 0)->'depot' is distinct from d then
      raise exception 'VERIFY(a): a new account''s depot reads %', d; end if;
    -- (b) A FULL DEPOT REFUSES A NEW STACK AT THE ACCOUNT'S CAP (and still takes more of a stack it holds).
    insert into public.account_bank (user_id, item_id, qty)
      select v_u, item_id, 1 from public.hr_items order by item_id limit v_base;
    select min(item_id) into v_item from public.hr_items where item_id not in (select item_id from public.account_bank where user_id = v_u);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    v := public.hr_bank_move(0, v_item, 1, 'deposit', (k || '0001')::uuid);
    if v->>'error' is distinct from 'bank_full' or (v->>'cap')::int <> v_base then
      raise exception 'VERIFY(b): a %-stack depot answered a new stack with %', v_base, v; end if;
    -- (c) THE REFUSALS move nothing: a skipped chest, a wrong price, an empty purse, a home too small.
    update public.player_state set gold = v_c1.gold - 1 where user_id = v_u and slot = 1;
    v := public.hr_storage_chest_build(1, v_c2.chest_id, v_c2.gold, (k || '0002')::uuid);
    if v->>'error' is distinct from 'needs_previous_chest' or v->>'need' is distinct from v_c1.chest_id then
      raise exception 'VERIFY(c): the second chest first answered %', v; end if;
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold + 1, (k || '0003')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(c): a wrong price answered %', v; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_u, 1, t.k, t.v::bigint from jsonb_each_text(v_c1.items) as t(k, v)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold, (k || '0004')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.player_state where user_id = v_u and slot = 1) <> v_c1.gold - 1
       or exists (select 1 from public.account_storage_chests where user_id = v_u) then
      raise exception 'VERIFY(c): a short purse answered %', v; end if;
    -- (d) THE BUILD: the gold and the materials once, journalled; the capacity is the ACCOUNT's on every slot.
    update public.player_state set gold = v_c1.gold + 7 where user_id = v_u and slot = 1;
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold, (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.player_state where user_id = v_u and slot = 1) <> 7
       or exists (select 1 from jsonb_each_text(v_c1.items) as t(k, q)
                   where exists (select 1 from public.player_inventory where user_id = v_u and slot = 1 and item_id = t.k))
       or (select count(*) from public.player_ledger where user_id = v_u and slot = 1 and kind = 'shop'
             and intent = 'storage_chest:' || v_c1.chest_id and gold = -v_c1.gold) <> 1 then
      raise exception 'VERIFY(d): the build answered %', v; end if;
    if (public.hr_state_of(v_u, 0)->'depot'->>'cap')::int <> v_base + v_c1.stacks then
      raise exception 'VERIFY(d): slot 0 reads a cap of %', public.hr_state_of(v_u, 0)->'depot'->>'cap'; end if;
    v := public.hr_bank_move(0, v_item, 1, 'deposit', (k || '0006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the new stack is still refused: %', v; end if;
    -- (e) A REPLAY CHARGES NOTHING; A SECOND BUILD IS already_built; THE NEXT ONE WAITS FOR ITS HOME TIER.
    v_gold := (select gold from public.player_state where user_id = v_u and slot = 1);
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold, (k || '0005')::uuid);
    if (select gold from public.player_state where user_id = v_u and slot = 1) <> v_gold
       or (select count(*) from public.account_storage_chests where user_id = v_u) <> 1 then
      raise exception 'VERIFY(e): a replay built again: %', v; end if;
    update public.player_state set gold = 10000000 where user_id = v_u and slot = 0;
    v := public.hr_storage_chest_build(0, v_c1.chest_id, v_c1.gold, (k || '0007')::uuid);
    if v->>'error' is distinct from 'already_built' or (select gold from public.player_state where user_id = v_u and slot = 0) <> 10000000 then
      raise exception 'VERIFY(e): the other hero building it again answered %', v; end if;
    if v_c2.req_property_tier > 0 then
      v := public.hr_storage_chest_build(0, v_c2.chest_id, v_c2.gold, (k || '0008')::uuid);
      if v->>'error' is distinct from 'needs_property_tier' or (v->>'need')::int <> v_c2.req_property_tier then
        raise exception 'VERIFY(e): the second chest without its home tier answered %', v; end if;
    end if;
    raise exception using errcode = 'HR893', message = 'storage-chests §6 complete - rolling back';
  exception when sqlstate 'HR893' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_storage_chests where user_id = v_u)
     or exists (select 1 from public.account_bank where user_id = v_u) then
    raise exception 'VERIFY(f): §6 LEAKED a probe row'; end if;
  -- (f) THE GRANTS: no client writes the chests; the readers are server-only; the verb is authenticated-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.account_storage_chests', 'insert,update,delete,truncate') then
      raise exception 'VERIFY(f): % can write account_storage_chests', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_depot_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_depot_cap(uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_property_tier(uuid)', 'execute') then
      raise exception 'VERIFY(f): % reaches a depot reader', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_storage_chest_build(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_storage_chest_build(integer,text,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(f): hr_storage_chest_build is not authenticated-only'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'storage-chests: the depot''s capacity is the account''s base + its chests; a chest is built once, in order, at its home tier, for the server''s price; all green';
end $$;
