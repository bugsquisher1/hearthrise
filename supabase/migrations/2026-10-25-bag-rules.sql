-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE BAG'S RULES: LOCKS, THE LOOT FILTER, RESTOCK TARGETS
-- (lane S2; CONFLICTS.md 2026-10-18 "ALPHA WINDOWS" items 1, 2, 7; Tyler
-- 2026-10-18 "the bag must have amazing QoL", first principle: a choice made
-- once is remembered). STAGED. Game CLOSED: applies on its passing §6;
-- Security reviews it with every S2 surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- player_item_rules (user, slot, item): what the player decided about one item.
--   locked     no NPC sale may take it (vendor_sell / vendor_sell_many refuse
--              `item_locked`, in hr_apply, under the character lock);
--   loot_rule  what a hunt does when it picks one up: keep (bag it, the default),
--              sell (the vendor's bid is credited instead), ignore (left behind);
--   restock    the count the one-tap refill buys up to (0..1000, only items a
--              supply offer sells; 2026-10-25-shop-supplies.sql reads it).
-- A row that says nothing (unlocked, keep, 0) is deleted, never stored.
-- THE VERBS (authenticated, each through hr_rpc_gate so closed mode and the
-- `hunt` rate bucket apply; idempotent on p_idem; the intent NAMES its target):
--   hr_item_lock(p_slot, p_item, p_locked, p_idem)
--   hr_loot_rule_set(p_slot, p_item, p_rule, p_idem)
--   hr_restock_set(p_slot, p_targets {item: 0..1000}, p_idem)   (0 forgets one)
-- THE SECTION `bag_rules` {locked: [item], loot: {item: sell|ignore}, restock: {item: n}}
-- (src/session/item-sections.js rulesOf).
--
-- ── THE LOOT FILTER RUNS IN THE SETTLE, ONLINE OR NOT ──────────────────────
-- hr_hunt_apply_member (2026-10-23-hunt-world-state.sql) gains ONE marked call,
-- after the value bounds and the sell-to-cover step and before the store:
-- hr_hunt_loot_rules(user, slot, session, the window's loot, at). For each item
-- the window picked up whose rule is sell/ignore and that is NOT locked, at most
-- min(picked up, held) units leave the bag: `sell` credits units x the vendor's
-- bid (hr_hunt_vendor_value, the same vendorPriceOf vendor_sell prices with) as
-- ONE ledger row (kind hunt, intent loot_sell, gold_in stamped, so it counts in
-- the SAME daily gold budget as vendor_sell); `ignore` journals the units left
-- behind (intent loot_ignore). If the day's gold budget cannot take the sale,
-- the window KEEPS the items (a sale is never forced, and a settle is never
-- refused for it: a refused settle would stop the hunt). The tally's loot (what
-- the hunt picked up, `hunt.loot`) is unchanged: it is what the hunt found.
-- Runs after the cover step so a loot rule can never leave cover_over behind.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client value prices anything: the bid is the server catalogue's, the qty
-- is bounded by the window's own (already value-bounded) loot and by the bag.
-- A lock only ever REMOVES a capability (selling). A loot rule moves an item
-- the hunt already paid into gold at the vendor's own bid (<= book value), so
-- it mints nothing vendor_sell could not; the daily budget is shared.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the three verbs (+ baseline rows), the section row + view, the helper,
-- the table; re-apply hr_apply from 2026-10-22-hunt-sessions-delete-away.sql and
-- hr_hunt_apply_member from 2026-10-23-hunt-world-state.sql (each loses one
-- marked block). ORDER: after 2026-10-25-alpha-catalogue.generated.sql.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply / hr_hunt_apply_member are absent (apply the S1 hunt files first)'; end if;
  if to_regclass('public.hr_shop_supply_offers') is null or to_regclass('public.hr_hunt_vendor_value') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: hr_shop_supply_offers / hr_hunt_vendor_value / hr_state_sections are absent'; end if;
end $mig$;

-- ── §1 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.player_item_rules (
  user_id    uuid not null,
  slot       int  not null,
  item_id    text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  locked     boolean not null default false,
  loot_rule  text not null default 'keep' check (loot_rule in ('keep', 'sell', 'ignore')),
  restock    int  not null default 0 check (restock between 0 and 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, item_id),
  constraint player_item_rules_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  -- A row that says nothing is deleted, never stored.
  constraint player_item_rules_says_ck check (locked or loot_rule <> 'keep' or restock > 0)
);
alter table public.player_item_rules enable row level security;
revoke all on public.player_item_rules from public, anon, authenticated, service_role;
comment on table public.player_item_rules is
  '2026-10-25 (lane S2). Per character, per item: locked (no NPC sale), the loot rule (keep|sell|ignore on pickup), '
  'the restock target. Written only by hr_item_lock / hr_loot_rule_set / hr_restock_set / hr_hunt_preset_apply; read through the bag_rules section.';

-- One writer for a row: the new values, or the row deleted when it says nothing.
create or replace function public.hr_item_rule_put(p_user uuid, p_slot int, p_item text,
  p_locked boolean, p_rule text, p_restock int)
returns void language plpgsql set search_path = public, pg_catalog as $$
begin
  if not coalesce(p_locked, false) and coalesce(p_rule, 'keep') = 'keep' and coalesce(p_restock, 0) = 0 then
    delete from public.player_item_rules where user_id = p_user and slot = p_slot and item_id = p_item;
  else
    insert into public.player_item_rules as r (user_id, slot, item_id, locked, loot_rule, restock, updated_at)
      values (p_user, p_slot, p_item, coalesce(p_locked, false), coalesce(p_rule, 'keep'), coalesce(p_restock, 0), now())
      on conflict (user_id, slot, item_id) do update
        set locked = excluded.locked, loot_rule = excluded.loot_rule, restock = excluded.restock, updated_at = now();
  end if;
end $$;
revoke execute on function public.hr_item_rule_put(uuid, int, text, boolean, text, int) from public, anon, authenticated, service_role;

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_bag_rules_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'locked', coalesce((select jsonb_agg(r.item_id order by r.item_id) from public.player_item_rules r
                         where r.user_id = p_user and r.slot = p_slot and r.locked), '[]'::jsonb),
    'loot', coalesce((select jsonb_object_agg(r.item_id, r.loot_rule) from public.player_item_rules r
                       where r.user_id = p_user and r.slot = p_slot and r.loot_rule <> 'keep'), '{}'::jsonb),
    'restock', coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                          where r.user_id = p_user and r.slot = p_slot and r.restock > 0), '{}'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_bag_rules_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('bag_rules', 'hr_bag_rules_view', '2026-10-25-bag-rules.sql: locked items, the loot filter (sell|ignore; keep is the default) and the restock targets')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
-- C1's verb shape: identity -> slot -> idempotency replay -> rate gate -> input
-- -> lock -> state -> write -> stored result. A refusal never consumes the key.
create or replace function public.hr_item_lock(p_slot int, p_item text, p_locked boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_row public.player_item_rules%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('item_lock', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('item_lock', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' or p_locked is null then
    return public.hr_note_rejection('item_lock', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'item_lock:' || p_item || ':' || case when p_locked then 'on' else 'off' end;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('item_lock', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('item_lock', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item', p_item)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('item_lock', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  perform public.hr_item_rule_put(v_uid, p_slot, p_item, p_locked, v_row.loot_rule, v_row.restock);
  v_r := jsonb_build_object('ok', true, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_loot_rule_set(p_slot int, p_item text, p_rule text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_row public.player_item_rules%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' or p_rule is null or p_rule not in ('keep', 'sell', 'ignore') then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'loot_rule_set:' || p_item || ':' || p_rule;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('loot_rule_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item', p_item)); end if;
  -- `sell` only for an item the vendor buys (the same catalogue vendor_sell prices with).
  if p_rule = 'sell' and not exists (select 1 from public.hr_hunt_vendor_value v where v.item_id = p_item) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'item_not_sellable', 'item', p_item)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  perform public.hr_item_rule_put(v_uid, p_slot, p_item, v_row.locked, p_rule, v_row.restock);
  v_r := jsonb_build_object('ok', true, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The restock targets: {item: 0..1000}, 1..32 keys per call, only items a
-- supply offer sells; 0 forgets one. At most 32 targets are held at once.
create or replace function public.hr_restock_set(p_slot int, p_targets jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_max_targets constant int := 32;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_k text; v_v jsonb; v_row public.player_item_rules%rowtype; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_targets is null or jsonb_typeof(p_targets) <> 'object'
     or (select count(*) from jsonb_object_keys(p_targets)) not between 1 and c_max_targets
     or exists (select 1 from jsonb_each(p_targets) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,4}$'
                    or (x.value #>> '{}')::int > 1000) then
    return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_targets')); end if;
  -- The intent names its target: the canonical (jsonb-sorted) target set.
  v_verb := 'restock_set:' || left(md5(p_targets::text), 16);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('restock_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select x.key into v_k from jsonb_each(p_targets) x
   where (x.value #>> '{}')::int > 0 and not exists (select 1 from public.hr_shop_supply_offers o where o.item_id = x.key)
   order by x.key limit 1;
  if v_k is not null then
    return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'not_for_sale', 'item', v_k)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  for v_k, v_v in select key, value from jsonb_each(p_targets) order by key loop
    select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = v_k for update;
    perform public.hr_item_rule_put(v_uid, p_slot, v_k, v_row.locked, v_row.loot_rule, (v_v #>> '{}')::int);
  end loop;
  select count(*) into v_n from public.player_item_rules where user_id = v_uid and slot = p_slot and restock > 0;
  if v_n > c_max_targets then
    -- Nothing above is kept: the whole call is refused (the subtransaction below).
    raise exception using errcode = 'HR871', message = 'too_many_targets';
  end if;
  v_r := jsonb_build_object('ok', true, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
exception when sqlstate 'HR871' then
  return public.hr_note_rejection('restock_set', p_slot, jsonb_build_object('ok', false, 'error', 'too_many_targets', 'max', c_max_targets));
end $$;

revoke execute on function public.hr_item_lock(int, text, boolean, uuid) from public;
revoke execute on function public.hr_item_lock(int, text, boolean, uuid) from anon, service_role;
grant  execute on function public.hr_item_lock(int, text, boolean, uuid) to authenticated;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from public;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from anon, service_role;
grant  execute on function public.hr_loot_rule_set(int, text, text, uuid) to authenticated;
revoke execute on function public.hr_restock_set(int, jsonb, uuid) from public;
revoke execute on function public.hr_restock_set(int, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_restock_set(int, jsonb, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_item_lock', 'hr_loot_rule_set', 'hr_restock_set');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_item_lock', 'p_slot integer, p_item text, p_locked boolean, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): lock / unlock an item so no NPC sale (vendor_sell, vendor_sell_many, the loot filter) takes it; moves no value'),
  ('hr_loot_rule_set', 'p_slot integer, p_item text, p_rule text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): keep / sell / ignore an item on hunt pickup; the settle applies it at the vendor''s own bid'),
  ('hr_restock_set', 'p_slot integer, p_targets jsonb, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): the one-tap refill''s targets {item: 0..1000}, supply-offer items only; counts, never a price');

-- ── §4 LOCKS HOLD AT THE NPC COUNTER (hr_apply, one marked block) ───────────
-- A vendor sale (journal.intent vendor_sell / vendor_sell_many) that debits a
-- locked item is refused `item_locked`, under the character lock, by the one
-- function every sale goes through. Anchored exactly once on the item debit's
-- ownership check; a body that already carries the block is left alone.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        if v_have + v_n = 0 then$a$;
  c_new constant text := $a$            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        -- 2026-10-25-bag-rules.sql: A LOCKED ITEM IS NEVER SOLD TO THE NPC.
        if v_n < 0 and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)'
           and exists (select 1 from public.player_item_rules r
                        where r.user_id = v_uid and r.slot = v_slot and r.item_id = k and r.locked) then
          perform public.hr_reject('item_locked', jsonb_build_object('item_id', k));
        end if;
        if v_have + v_n = 0 then$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, '''item_locked''') > 0 then raise notice 'hr_apply already refuses a locked sale - edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_apply: the item-debit anchor matched % times (need 1) - the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── §5 THE LOOT FILTER IN THE SETTLE ─────────────────────────────────────────
-- Owner-only; called by hr_hunt_apply_member under the character lock, after
-- hr_apply credited the window's loot. Never raises for a player's rule: a sale
-- the day budget cannot take is simply not made (the items stay).
create or replace function public.hr_hunt_loot_rules(p_user uuid, p_slot int, p_session uuid, p_items jsonb, p_at timestamptz)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare
  v_r record; v_have bigint; v_q bigint;
  v_sold jsonb := '{}'::jsonb; v_gold bigint := 0; v_sunits bigint := 0;
  v_left jsonb := '{}'::jsonb; v_lunits bigint := 0;
  v_k text; v_v jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'object' then return; end if;
  for v_r in
    select e.key as item, (e.value #>> '{}')::numeric::bigint as n, r.loot_rule as rule, vv.unit
      from jsonb_each(p_items) e
      join public.player_item_rules r on r.user_id = p_user and r.slot = p_slot and r.item_id = e.key
      left join public.hr_hunt_vendor_value vv on vv.item_id = e.key
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric >= 1
       and r.loot_rule in ('sell', 'ignore') and not r.locked
     order by e.key
  loop
    continue when v_r.rule = 'sell' and v_r.unit is null;
    select qty into v_have from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_r.item for update;
    v_q := least(v_r.n, coalesce(v_have, 0));
    continue when v_q <= 0;
    if v_r.rule = 'sell' then
      v_sold := v_sold || jsonb_build_object(v_r.item, jsonb_build_object('qty', v_q, 'unit', v_r.unit));
      v_gold := v_gold + v_q * v_r.unit; v_sunits := v_sunits + v_q;
    else
      v_left := v_left || jsonb_build_object(v_r.item, v_q);
      v_lunits := v_lunits + v_q;
    end if;
  end loop;
  -- THE SAME DAILY GOLD BUDGET AS vendor_sell: over it, nothing is sold this window.
  if v_gold > 0 and public.hr_day_budget_check(p_user, p_slot, v_gold, 0, 0, 0) is not null then
    v_sold := '{}'::jsonb; v_gold := 0; v_sunits := 0;
  end if;
  for v_k, v_v in select key, value from jsonb_each(v_sold) loop
    delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = (v_v->>'qty')::bigint;
    update public.player_inventory set qty = qty - (v_v->>'qty')::bigint where user_id = p_user and slot = p_slot and item_id = v_k;
  end loop;
  for v_k, v_v in select key, value from jsonb_each(v_left) loop
    delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = (v_v #>> '{}')::bigint;
    update public.player_inventory set qty = qty - (v_v #>> '{}')::bigint where user_id = p_user and slot = p_slot and item_id = v_k;
  end loop;
  if v_gold > 0 then
    update public.player_state set gold = gold + v_gold where user_id = p_user and slot = p_slot;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, qty, meta, session_id)
      values (p_user, p_slot, 'hunt', 'loot_sell', v_gold, v_gold, -v_sunits,
              jsonb_build_object('reason', 'loot_sell', 'items', v_sold, 'gold', v_gold, 'at', p_at), p_session);
  end if;
  if v_lunits > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, qty, meta, session_id)
      values (p_user, p_slot, 'hunt', 'loot_ignore', -v_lunits,
              jsonb_build_object('reason', 'loot_ignore', 'items', v_left, 'at', p_at), p_session);
  end if;
end $$;
revoke execute on function public.hr_hunt_loot_rules(uuid, int, uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;

-- ONE marked call in the member settle, after sell-to-cover and before the store.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);$a$;
  c_new constant text := $a$  -- 2026-10-25-bag-rules.sql: THE LOOT FILTER (sell / ignore on pickup), online or not.
  perform public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_delta->'items', v_to);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_hunt_loot_rules(') > 0 then raise notice 'hr_hunt_apply_member already runs the loot filter - edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_apply_member: the store anchor matched % times (need 1) - the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e2a0001';
  v jsonb; v_item text; v_offer text; v_role text; v_gold bigint; v_sid uuid := gen_random_uuid();
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bag-rules §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v_item := (select v.item_id from public.hr_hunt_vendor_value v order by v.unit desc, v.item_id limit 1);
    v_offer := (select o.item_id from public.hr_shop_supply_offers o order by o.item_id limit 1);
    -- (a) the empty section is an object of three empty parts.
    v := public.hr_state_of(v_u, 0)->'bag_rules';
    if v is distinct from '{"locked": [], "loot": {}, "restock": {}}'::jsonb then raise exception 'VERIFY(a): bag_rules is %', v; end if;
    -- (b) lock, rule, restock; a replay answers the first decision; a reused key for another target is refused.
    v := public.hr_item_lock(0, v_item, true, '000000c0-0000-4000-a000-00005e2a0101');
    if coalesce(v->>'ok', '') <> 'true' or not (v->'bag_rules'->'locked') ? v_item then raise exception 'VERIFY(b): lock answered %', v; end if;
    v := public.hr_item_lock(0, v_item, true, '000000c0-0000-4000-a000-00005e2a0101');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a replayed lock answered %', v; end if;
    v := public.hr_item_lock(0, v_item, false, '000000c0-0000-4000-a000-00005e2a0101');
    if v->>'error' is distinct from 'intent_mismatch' then raise exception 'VERIFY(b): a reused key answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_item, 'sell', '000000c0-0000-4000-a000-00005e2a0102');
    if (v->'bag_rules'->'loot'->>v_item) is distinct from 'sell' then raise exception 'VERIFY(b): the loot rule answered %', v; end if;
    v := public.hr_restock_set(0, jsonb_build_object(v_offer, 20), '000000c0-0000-4000-a000-00005e2a0103');
    if (v->'bag_rules'->'restock'->>v_offer)::int is distinct from 20 then raise exception 'VERIFY(b): restock answered %', v; end if;
    -- (c) refusals by name: an item no offer sells, a sell rule the vendor cannot price, a bad shape.
    v := public.hr_restock_set(0, jsonb_build_object(v_item, 5), '000000c0-0000-4000-a000-00005e2a0104');
    if v_item <> all (array(select item_id from public.hr_shop_supply_offers)) and v->>'error' is distinct from 'not_for_sale' then
      raise exception 'VERIFY(c): restocking an item no offer sells answered %', v; end if;
    v := public.hr_loot_rule_set(0, (select i.item_id from public.hr_items i where not exists (select 1 from public.hr_hunt_vendor_value v where v.item_id = i.item_id) order by 1 limit 1),
                                 'sell', '000000c0-0000-4000-a000-00005e2a0105');
    if v->>'error' is distinct from 'item_not_sellable' then raise exception 'VERIFY(c): selling an unpriced item answered %', v; end if;
    v := public.hr_restock_set(0, '{"x": 1001}'::jsonb, '000000c0-0000-4000-a000-00005e2a0106');
    if v->>'error' is distinct from 'bad_targets' then raise exception 'VERIFY(c): a target over 1000 answered %', v; end if;
    -- (d) THE LOCK HOLDS AT THE COUNTER: hr_apply refuses a vendor sale of the locked item, and sells it once unlocked.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), gen_random_uuid(),
           jsonb_build_object('gold', 1, 'items', jsonb_build_object(v_item, -1),
                              'journal', jsonb_build_object('kind', 'shop', 'intent', 'vendor_sell_many:probe')));
    if v->>'error' is distinct from 'item_locked' then raise exception 'VERIFY(d): selling a locked item answered %', v; end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), gen_random_uuid(),
           jsonb_build_object('items', jsonb_build_object(v_item, -1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe_spend')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): a non-sale debit of a locked item answered %', v; end if;
    -- (e) THE LOOT FILTER: a sell rule sells min(picked, held) at the bid, journalled with gold_in; ignore leaves it; keep keeps.
    v := public.hr_item_lock(0, v_item, false, '000000c0-0000-4000-a000-00005e2a0107');
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    perform public.hr_hunt_loot_rules(v_u, 0, null, jsonb_build_object(v_item, 9), now());
    if exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item)
       or (select gold from public.player_state where user_id = v_u and slot = 0)
          <> v_gold + 4 * (select unit from public.hr_hunt_vendor_value where item_id = v_item)
       or not exists (select 1 from public.player_ledger l where l.user_id = v_u and l.intent = 'loot_sell'
                       and l.gold_in = 4 * (select unit from public.hr_hunt_vendor_value where item_id = v_item)) then
      raise exception 'VERIFY(e): the sell rule did not sell 4 held units at the bid'; end if;
    v := public.hr_loot_rule_set(0, v_item, 'ignore', '000000c0-0000-4000-a000-00005e2a0108');
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 3);
    perform public.hr_hunt_loot_rules(v_u, 0, null, jsonb_build_object(v_item, 2), now());
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) is distinct from 1::bigint then
      raise exception 'VERIFY(e): the ignore rule did not leave the 2 picked units behind'; end if;
    -- a locked item is kept whatever its rule.
    v := public.hr_item_lock(0, v_item, true, '000000c0-0000-4000-a000-00005e2a0109');
    perform public.hr_hunt_loot_rules(v_u, 0, null, jsonb_build_object(v_item, 1), now());
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) is distinct from 1::bigint then
      raise exception 'VERIFY(e): a locked item was taken by its loot rule'; end if;
    -- (f) forgetting everything deletes the row (no row says nothing).
    v := public.hr_item_lock(0, v_item, false, '000000c0-0000-4000-a000-00005e2a0110');
    v := public.hr_loot_rule_set(0, v_item, 'keep', '000000c0-0000-4000-a000-00005e2a0111');
    if exists (select 1 from public.player_item_rules where user_id = v_u and item_id = v_item) then
      raise exception 'VERIFY(f): a rule row that says nothing was kept'; end if;
    raise exception using errcode = 'HR870', message = 'bag-rules §6 complete - rolling back';
  exception when sqlstate 'HR870' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_item_rules where user_id = v_u) then
    raise exception 'VERIFY(g): §6 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_item_rules', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_bag_rules_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_item_rule_put(uuid,integer,text,boolean,text,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_loot_rules(uuid,integer,uuid,jsonb,timestamp with time zone)', 'execute')
       or has_function_privilege(v_role, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'VERIFY(g): % reaches a bag-rules table or internal', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_item_lock(integer,text,boolean,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_item_lock(integer,text,boolean,uuid)', 'execute') then
    raise exception 'VERIFY(g): hr_item_lock grants are wrong'; end if;
  if strpos(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), 'hr_hunt_loot_rules(') = 0 then
    raise exception 'VERIFY(g): the member settle does not run the loot filter'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'bag-rules: locks hold at the counter, the loot filter sells at the bid inside the day budget, rules remembered; all green';
end $$;
