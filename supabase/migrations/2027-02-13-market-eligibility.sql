-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-13-market-eligibility.sql — A FRESH ACCOUNT CANNOT TRADE (`market_locked`).
--   Threat model #9 / Security market review change 6: each new account mints 500 gold per
--   hero, and the market would let an alt pay that to a main for junk at the ceiling. Script
--   the sign-ups and the funnel has no bound but the daily caps. Eligibility comes from a
--   server column on list AND buy.
--
-- STATUS: STAGED, NOT APPLIED (lane/b-market-window, systems-engineer, 2026-10-31). Before
-- the switch and before accounts join. The Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00-00:10 UTC). EDGE: none. CLIENT: the
-- market window reads `rules.min_level` and `locked`, and says why.
--
-- THE RULE: any hero of the account at Level >= hr_market_config.min_level (default 10, the
-- threat model's example; PROVISIONAL, one config row, re-tuned with the economy sims).
-- Cancel, the sweep and every read stay open: nobody is locked out of their own goods.
--
-- WHY TRIGGERS, NOT TWO RESTATED BODIES: hr_market_list and hr_market_buy are the reviewed
-- bodies (md5s on the board) and each writes one table at one known step. A BEFORE INSERT
-- raising hr_reject lands inside their protected block, so the refusal is the normal shape,
-- the whole write rolls back, and any later writer of those tables is covered. The same
-- pattern as 2027-01-21-market-same-network.sql. A listing's seller and a sale's buyer are
-- the two parties who act; a seller was checked when they listed.
--
-- LOCKS: none new. hr_market_eligible reads player_state without a lock (level_xp only
-- rises), inside whatever the body already holds.
-- COST: one PK-ranged read of at most six rows per list or buy.
-- RESTATED: hr_market_rules (+ min_level), hr_market_mine (+ locked), each pinned in §0.
-- REVERSE: drop the two triggers and their functions, re-apply 2027-01-12's two bodies (or
-- leave them: min_level = 1 opens the gate with no migration body moving).
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write; flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.market_sales') is null or to_regclass('public.market_listings') is null
     or to_regclass('public.hr_market_config') is null then
    raise exception 'PRECONDITION: apply 2027-01-12-market-account.sql first'; end if;
  if to_regprocedure('public.hr_char_level(bigint)') is null or to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'PRECONDITION: hr_char_level / hr_reject are missing'; end if;
  for r in select * from (values
    ('public.hr_market_rules()', '8661f5eccc8b06e5bf75aab534f94a54', '7cea19fb02e4ea9a19505bd9358f390f'),
    ('public.hr_market_mine(uuid,integer)', '8061f66df11fed6176377a73711863b1', 'de3c54ec7e847c19198f5ddc56267dce')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither 2027-01-12''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE NUMBER ───────────────────────────────────────────────────────────
alter table public.hr_market_config
  add column if not exists min_level int not null default 10 check (min_level between 1 and 100000);

-- ── §2 THE TEST ─────────────────────────────────────────────────────────────
create or replace function public.hr_market_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from public.player_state ps cross join public.hr_market_config c
                  where ps.user_id = p_user and public.hr_char_level(ps.level_xp) >= c.min_level)
$$;
revoke execute on function public.hr_market_eligible(uuid) from public, anon, authenticated, service_role, hr_engine;

-- ── §3 THE TWO GATES ────────────────────────────────────────────────────────
create or replace function public.hr_market_listing_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.hr_market_eligible(new.user_id) then
    perform public.hr_reject('market_locked', jsonb_build_object('min_level', (select min_level from public.hr_market_config)));
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_gate() from public, anon, authenticated, service_role, hr_engine;
drop trigger if exists trg_market_listing_gate on public.market_listings;
create trigger trg_market_listing_gate
  before insert on public.market_listings
  for each row execute function public.hr_market_listing_gate();

create or replace function public.hr_market_sale_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.hr_market_eligible(new.buyer_user_id) then
    perform public.hr_reject('market_locked', jsonb_build_object('min_level', (select min_level from public.hr_market_config)));
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_sale_gate() from public, anon, authenticated, service_role, hr_engine;
drop trigger if exists trg_market_sale_gate on public.market_sales;
create trigger trg_market_sale_gate
  before insert on public.market_sales
  for each row execute function public.hr_market_sale_gate();

-- ── §4 WHAT THE WINDOW READS ────────────────────────────────────────────────
-- hr_market_rules RESTATED WHOLE from 2027-01-12-market-account.sql §2: + min_level.
create or replace function public.hr_market_rules()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('enabled', c.enabled, 'fee_bp', c.list_fee_bp, 'fee_min', c.list_fee_min,
           'cut_bp', c.house_tax_bp, 'ttl_h', c.listing_ttl_h, 'max_listings', c.max_listings,
           'max_lists_per_day', c.max_lists_per_day, 'max_spend_per_day', c.max_spend_per_day,
           'max_proceeds_per_day', c.max_proceeds_per_day, 'ceiling_mult', c.ceiling_mult, 'ceiling_min', c.ceiling_min,
           'min_level', c.min_level)
    from public.hr_market_config c
$$;
revoke execute on function public.hr_market_rules() from public, anon, authenticated, service_role, hr_engine;

-- hr_market_mine RESTATED WHOLE from 2027-01-12-market-account.sql §5: + locked (this account
-- is below the rule), so the window says it before a press. The server still refuses.
create or replace function public.hr_market_mine(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_g jsonb; v_uid uuid; v_list jsonb; v_hist jsonb; v_day0 timestamptz := public.hr_utc_day_start(now()); v_today jsonb;
begin
  v_g := public.hr_market_read_gate(p_user, p_slot, 'market_mine');
  if v_g is not null then return v_g; end if;
  v_uid := case when coalesce(nullif(current_setting('role', true), 'none'), session_user) = 'hr_engine'
                then coalesce(p_user, auth.uid()) else auth.uid() end;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'item_id', l.item_id, 'qty', l.qty, 'qty_listed', l.qty_listed,
                  'ask_each', l.ask_each, 'fee', l.fee, 'source', l.source, 'listed_by', l.slot,
                  'posted_at', l.posted_at, 'expires_at', l.expires_at,
                  'received', coalesce((select sum(x.gold_net) from public.market_sales x where x.listing_id = l.id), 0))
                  order by l.posted_at desc), '[]'::jsonb)
    into v_list
    from (select * from public.market_listings where user_id = v_uid order by posted_at desc limit 100) l;
  select coalesce(jsonb_agg(jsonb_build_object('at', h.at, 'hero', h.slot,
                  'what', case split_part(h.intent, ':', 1) when 'market_list' then 'listed' when 'market_buy' then 'bought'
                                when 'market_sold' then 'sold' when 'market_cancel' then 'cancelled' when 'market_expire' then 'returned' end,
                  'item_id', h.item_id, 'qty', coalesce(h.qty, (h.meta->>'qty')::bigint), 'gold', coalesce(h.gold, 0),
                  'each', coalesce(h.meta->'each', h.meta->'ask_each'), 'fee', h.meta->'fee', 'cut', h.meta->'cut',
                  'deliver', h.meta->'deliver', 'source', h.meta->'source', 'reason', h.meta->'reason') order by h.at desc), '[]'::jsonb)
    into v_hist
    from (select at, slot, intent, item_id, qty, gold, meta from public.player_ledger
           where user_id = v_uid and kind = 'trade' and at >= now() - interval '30 days' and intent like 'market\_%'
           order by at desc limit 200) h;
  select jsonb_build_object(
           'open', (select count(*) from public.market_listings where user_id = v_uid),
           'listed', (select count(*) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_list:%'),
           'spent', (select coalesce(sum(-gold), 0) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_buy:%'),
           'received', (select coalesce(sum(gold), 0) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_sold:%'))
    into v_today;
  return jsonb_build_object('ok', true, 'listings', v_list, 'history', v_hist, 'today', v_today, 'rules', public.hr_market_rules(),
                            'locked', not public.hr_market_eligible(v_uid));
end $$;
revoke execute on function public.hr_market_mine(uuid, int) from public, anon, authenticated, service_role;
grant execute on function public.hr_market_mine(uuid, int) to hr_engine;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000ac0e2141';   -- seller, fresh, then grown
  v_b  constant uuid := '000000c0-0000-4000-a000-0000ac0e2142';   -- buyer, fresh
  k    constant text := '000000c0-0000-4000-b000-0000';
  v jsonb; v_txt text; v_role text; v_item text; v_floor bigint; v_lid uuid; v_was boolean; v_min int; v_g bigint;
begin
  -- (a) the default, the triggers, the surface
  if (select column_default from information_schema.columns where table_schema = 'public'
        and table_name = 'hr_market_config' and column_name = 'min_level') is distinct from '10' then
    raise exception 'VERIFY(a): min_level does not default to 10'; end if;
  foreach v_txt in array array['public.market_listings:trg_market_listing_gate', 'public.market_sales:trg_market_sale_gate'] loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = split_part(v_txt, ':', 1)::regclass and not t.tgisinternal
                    and t.tgname = split_part(v_txt, ':', 2) and t.tgenabled = 'O'
                    and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 1) = 1) then
      raise exception 'VERIFY(a): % is not an enabled BEFORE INSERT FOR EACH ROW trigger', v_txt; end if;
  end loop;
  foreach v_txt in array array['public.hr_market_eligible(uuid)', 'public.hr_market_listing_gate()', 'public.hr_market_sale_gate()', 'public.hr_market_rules()'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
      if has_function_privilege(v_role, v_txt, 'execute') then raise exception 'VERIFY(a): % can execute %', v_role, v_txt; end if;
    end loop;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_market_mine(uuid,integer)', 'execute') then
    raise exception 'VERIFY(a): the engine lost hr_market_mine'; end if;

  select enabled, min_level into v_was, v_min from public.hr_market_config;
  select m.item_id, m.floor_each into v_item, v_floor from public.hr_market_items m
   where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
     and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  if v_item is null then raise exception 'VERIFY(b): no listable stackable good to probe with'; end if;
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'market-eligibility probe'), (v_b, 'market-eligibility probe') on conflict (user_id) do nothing;
    foreach v_txt in array array[v_a::text, v_b::text] loop
      perform set_config('request.jwt.claim.sub', v_txt, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', left(v::text, 300); end if;
      update public.account_wallet set gold = 1000000 where user_id = v_txt::uuid;
    end loop;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    update public.hr_market_config set enabled = true, min_level = 10 where only_row;

    -- (b) a FRESH account's list is refused, by name, naming the Level; nothing moved; the window can read it first
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_mine(v_a, 0);
    if (v->'locked') is distinct from 'true'::jsonb or (v#>>'{rules,min_level}')::int <> 10 then
      raise exception 'VERIFY(b): mine does not say a fresh account is locked: %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00002141')::uuid, 'bag', v_item, 3, v_floor);
    if v->>'error' is distinct from 'market_locked' or (v->>'min_level')::int <> 10 then
      raise exception 'VERIFY(b): a fresh account listed: %', left(v::text, 300); end if;
    if (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) <> 5
       or exists (select 1 from public.market_listings where user_id = v_a) then
      raise exception 'VERIFY(b): the refused list moved something'; end if;

    -- (c) grown past the rule on ANY hero: the same account lists
    update public.player_state set level_xp = public.hr_char_xp_for_level(10) where user_id = v_a and slot = 0;
    v := public.hr_market_mine(v_a, 0);
    if (v->'locked') is distinct from 'false'::jsonb then raise exception 'VERIFY(c): mine still says locked at the Level: %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00002142')::uuid, 'bag', v_item, 3, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): an eligible account was refused: %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid;

    -- (d) a FRESH buyer is refused with every side unmoved
    v_g := public.hr_purse_of(v_a);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_buy(v_b, 0, null, (k || '00002143')::uuid, v_lid, 1, v_floor, 'storage');
    if v->>'error' is distinct from 'market_locked' then raise exception 'VERIFY(d): a fresh account bought: %', left(v::text, 300); end if;
    if public.hr_purse_of(v_b) <> 1000000 or public.hr_purse_of(v_a) <> v_g
       or (select qty from public.market_listings where id = v_lid) <> 3
       or exists (select 1 from public.market_sales where listing_id = v_lid)
       or exists (select 1 from public.account_bank where user_id = v_b and item_id = v_item) then
      raise exception 'VERIFY(d): the refused buy moved something'; end if;

    -- (e) the owner's own goods are never held: a seller who somehow fell under the rule still cancels
    update public.hr_market_config set min_level = 100000 where only_row;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_cancel(v_a, 0, (k || '00002144')::uuid, v_lid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the rule held a cancel: %', left(v::text, 300); end if;
    raise exception using errcode = 'HR921', message = 'market-eligibility self-check complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) then raise exception 'VERIFY(f): the probe leaked'; end if;
  if (select enabled from public.hr_market_config) is distinct from v_was
     or (select min_level from public.hr_market_config) is distinct from v_min then
    raise exception 'VERIFY(f): the probe moved the config'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'market-eligibility: list and buy need a hero at the configured Level; cancel and reads stay open; all green';
end $$;
