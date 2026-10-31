-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-13-market-premium-bond.sql — THE PREMIUM BOND CANNOT BE LISTED.
--   The Security market review's change 1 (2026-10-25, finding 1): `hearth_token`
--   (src/data/items.js, premium:true, the IAP bond) is tradeable, worth 25,000 and bid
--   on by the shop, so hr_market_items reads it as listable, up to 2,500,000 gold each.
--
-- STATUS: STAGED, NOT APPLIED (lane/b-market-window, systems-engineer, 2026-10-31).
-- Before the switch. The Coordinator applies (tools/apply-migration.mjs, one file, never
-- inside begin/commit, never 00:00-00:10 UTC). EDGE: none. CLIENT: none needed.
--
-- WHY A TABLE AND NOT `bop:true`: a bound non-gear item must also be worth nothing (the
-- no-tradeable-value rule), and the bond keeps its book value for the Crowns exchange that
-- comes later (Tyler 2026-10-13/14/15: capped, weekly, after Steam and legal review). The
-- catalogue generator rewrites hr_items whole, so a column set by hand would be lost on its
-- next run. So: one small owner-only list, read by the ONE listable rule.
-- tests/market-v2.mjs M5 fails when it differs from src/data/items.js's `premium:true` rows.
--
-- WHAT MOVES: the view hr_market_items gains one clause and one `why`; the table is new.
-- No body changes: list, buy, the sweep and the reads all read the view.
-- REVERSE: re-apply 2027-01-12-market-account.sql §2's view; drop the table.
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write; flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regclass('public.hr_market_items') is null or to_regclass('public.hr_market_config') is null then
    raise exception 'PRECONDITION: apply 2027-01-12-market-account.sql first'; end if;
end $mig$;

create table if not exists public.hr_market_premium_items (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$')
);
comment on table public.hr_market_premium_items is
  '2027-02-13 (market-premium-bond): the items src/data/items.js marks premium:true. The market never lists one (hr_market_items). '
  'tests/market-v2.mjs M5 pins it to the data. No client role can read it.';
alter table public.hr_market_premium_items enable row level security;
revoke all on public.hr_market_premium_items from public, anon, authenticated, service_role, hr_engine;
insert into public.hr_market_premium_items (item_id) values ('hearth_token') on conflict (item_id) do nothing;

-- THE ONE LISTABLE RULE, restated from 2027-01-12-market-account.sql §2: `and not premium`.
-- Same columns in the same order; the premium reward's `why` is shared on purpose.
create or replace view public.hr_market_items with (security_invoker = true) as
  select i.item_id,
         (i.tradeable and i.value > 0 and v.item_id is not null
          and not exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
          and not exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id)
          and not exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)
          and not exists (select 1 from public.hr_market_premium_items b where b.item_id = i.item_id)) as listable,
         case when not i.tradeable then 'untradeable'
              when i.value <= 0 then 'no_value'
              when v.item_id is null then 'no_shop_price'
              when exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
                or exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id) then 'start_kit'
              when exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)
                or exists (select 1 from public.hr_market_premium_items b where b.item_id = i.item_id) then 'premium'
         end as why,
         v.unit as floor_each,
         least(1000000000::bigint, greatest(c.ceiling_min, i.value * c.ceiling_mult))::bigint as ceiling_each,
         i.value as book
    from public.hr_items i
    left join public.hr_hunt_vendor_value v on v.item_id = i.item_id
   cross join public.hr_market_config c;
revoke all on public.hr_market_items from public, anon, authenticated, service_role, hr_engine;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe rolled back by a sentinel ──
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000ac0e2131';
  v jsonb; v_role text; v_was boolean; r record;
begin
  -- (a) the bond reads as unlistable, for the right reason, and every other item is untouched by it
  select listable, why into r from public.hr_market_items where item_id = 'hearth_token';
  if r.listable is distinct from false or r.why is distinct from 'premium' then
    raise exception 'VERIFY(a): hearth_token reads listable=% why=%', r.listable, r.why; end if;
  if not exists (select 1 from public.hr_market_items where listable) then
    raise exception 'VERIFY(a): the listable rule refuses everything'; end if;
  if exists (select 1 from public.hr_market_premium_items b left join public.hr_items i using (item_id) where i.item_id is null) then
    raise exception 'VERIFY(a): the premium list names an item the catalogue does not have'; end if;
  -- (b) no client or engine role reads the list or the view; no policy can widen it
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_table_privilege(v_role, 'public.hr_market_premium_items', 'select,insert,update,delete') then
      raise exception 'VERIFY(b): % holds a privilege on hr_market_premium_items', v_role; end if;
    if has_table_privilege(v_role, 'public.hr_market_items', 'select') then
      raise exception 'VERIFY(b): % reads hr_market_items', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_market_premium_items') then
    raise exception 'VERIFY(b): hr_market_premium_items carries a policy'; end if;
  -- (c) THE PROBE: an account holding a bond, the switch on: the list is refused by name and moves nothing
  select enabled into v_was from public.hr_market_config;
  begin
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'market-premium-bond probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', left(v::text, 300); end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, 'hearth_token', 1);
    update public.hr_market_config set enabled = true where only_row;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           '000000c0-0000-4000-b000-000000002131'::uuid, 'bag', 'hearth_token', 1, 25000);
    if v->>'error' is distinct from 'not_tradeable' or v#>>'{detail,why}' is distinct from 'premium' then
      raise exception 'VERIFY(c): the bond was not refused not_tradeable/premium: %', left(v::text, 300); end if;
    if (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = 'hearth_token') is distinct from 1::bigint
       or exists (select 1 from public.market_listings where user_id = v_a) then
      raise exception 'VERIFY(c): the refused list moved something'; end if;
    raise exception using errcode = 'HR921', message = 'market-premium-bond self-check complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_a) then raise exception 'VERIFY(d): the probe leaked'; end if;
  if (select enabled from public.hr_market_config) is distinct from v_was then raise exception 'VERIFY(d): the probe moved the switch'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'market-premium-bond: the premium bond is refused by the one listable rule; all green';
end $$;
