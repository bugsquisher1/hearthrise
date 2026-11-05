-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-03-market-bench-gate.sql — A HERO WHO NEVER HUNTS CAN TRADE (`market_locked`).
--   Levels come from combat, so a pure crafter was locked out of the Weighhouse for good, and
--   crafters selling to fighters is where the game is going. The designer's ruling, on the
--   priority board ("`market_locked`: ships alone, now").
--
-- STATUS: STAGED, NOT APPLIED (lane/c-market-lock, backend-architect, 2026-11-04). The Coordinator
-- applies (tools/apply-migration.mjs, one file, never inside begin/commit). EDGE: none; the engine
-- passes the refusal and the rules through. CLIENT: the window and the refusal say both numbers,
-- so this applies before that client ships.
--
-- THE RULE: any hero of the account at Level >= hr_market_config.min_level, OR any hero of the
-- account with a bench skill at >= hr_market_config.min_skill_level (default 30; PROVISIONAL, one
-- config row). The bench skills are the catalogue's own `artisan` rows, not a second copy here:
-- Smithing, Crafting, Cooking, Runecrafting. Gathering and combat skills don't count. The level is
-- hr_skill_level over player_skills.xp, the server's column; no client value reaches this.
-- Cancel, the sweep and every read stay open, as they did.
--
-- ON THE EA SECURITY LIST (Threat #9, the alt funnel; 2027-02-13-market-eligibility.sql). The gate
-- stays hours of real work on either route: Crafting 30 is about 6.5 h of work, Level 10 about
-- 10 h. Only Crafting's hours were measured, by the designer; the other three benches are not.
-- A new `artisan` row in src/data/skills.js widens this gate: tests/market-v2.mjs M5c names the four.
--
-- LOCKS: none new. Bench XP only rises, so this reads player_skills without a lock, inside whatever
-- the body already holds, as the Level check reads player_state.
-- COST: one more PK-ranged read, at most four bench rows a hero, per list, buy or hr_market_mine,
-- and only when no hero is at the Level. No new row anywhere.
-- RESTATED: hr_market_eligible (+ the bench route), hr_market_listing_gate and hr_market_sale_gate
-- (+ min_skill_level on the refusal), hr_market_rules (+ min_skill_level), each pinned in §0.
-- REVERSE: min_skill_level = 100000 closes the route with no body moving; or re-apply the four
-- bodies from 2027-02-13-market-eligibility.sql and drop the column. Re-runnable: §0 accepts its
-- own post-images.
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write; flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.player_skills') is null or to_regclass('public.hr_skills') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_skill_xp_for_level(text,integer)') is null then
    raise exception 'PRECONDITION: player_skills / hr_skills / hr_skill_level are missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'hr_market_config' and column_name = 'min_level') then
    raise exception 'PRECONDITION: apply 2027-02-13-market-eligibility.sql first'; end if;
  for r in select * from (values
    ('public.hr_market_eligible(uuid)', '4c073ca9f096e4a61b7a60a6fdaee7f5', 'ec91fcd8549546e21e89bf8c4c273982'),
    ('public.hr_market_listing_gate()', '87f4d5334d1b0a38c0d5637afd6f741c', '31e05d5ad256a48d42d09ff09a464764'),
    ('public.hr_market_sale_gate()', 'e5cfe4f0cd113e9dd7b07155d66368ad', '83f7bbd84277b4bccdb86694a6c87160'),
    ('public.hr_market_rules()', '7cea19fb02e4ea9a19505bd9358f390f', '1406031420e4650c6d92f4d9d2b85327')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither 2027-02-13''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE NUMBER ───────────────────────────────────────────────────────────
alter table public.hr_market_config
  add column if not exists min_skill_level int not null default 30 check (min_skill_level between 1 and 100000);

-- ── §2 THE TEST ─────────────────────────────────────────────────────────────
-- hr_market_eligible RESTATED WHOLE from 2027-02-13-market-eligibility.sql §2: + the bench route.
create or replace function public.hr_market_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from public.player_state ps cross join public.hr_market_config c
                  where ps.user_id = p_user and public.hr_char_level(ps.level_xp) >= c.min_level)
      or exists (select 1 from public.player_skills k
                   join public.hr_skills s on s.skill_id = k.skill_id and s.cat = 'artisan'
                  cross join public.hr_market_config c
                  where k.user_id = p_user and public.hr_skill_level(k.skill_id, k.xp) >= c.min_skill_level)
$$;
revoke execute on function public.hr_market_eligible(uuid) from public, anon, authenticated, service_role, hr_engine;

-- ── §3 THE TWO GATES SAY BOTH NUMBERS ───────────────────────────────────────
-- Each RESTATED WHOLE from 2027-02-13-market-eligibility.sql §3: + min_skill_level. The triggers stay attached.
create or replace function public.hr_market_listing_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.hr_market_eligible(new.user_id) then
    perform public.hr_reject('market_locked', (select jsonb_build_object('min_level', c.min_level, 'min_skill_level', c.min_skill_level) from public.hr_market_config c));
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_gate() from public, anon, authenticated, service_role, hr_engine;

create or replace function public.hr_market_sale_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.hr_market_eligible(new.buyer_user_id) then
    perform public.hr_reject('market_locked', (select jsonb_build_object('min_level', c.min_level, 'min_skill_level', c.min_skill_level) from public.hr_market_config c));
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_sale_gate() from public, anon, authenticated, service_role, hr_engine;

-- ── §3b WHAT THE WINDOW READS ───────────────────────────────────────────────
-- hr_market_rules RESTATED WHOLE from 2027-02-13-market-eligibility.sql §4: + min_skill_level.
create or replace function public.hr_market_rules()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('enabled', c.enabled, 'fee_bp', c.list_fee_bp, 'fee_min', c.list_fee_min,
           'cut_bp', c.house_tax_bp, 'ttl_h', c.listing_ttl_h, 'max_listings', c.max_listings,
           'max_lists_per_day', c.max_lists_per_day, 'max_spend_per_day', c.max_spend_per_day,
           'max_proceeds_per_day', c.max_proceeds_per_day, 'ceiling_mult', c.ceiling_mult, 'ceiling_min', c.ceiling_min,
           'min_level', c.min_level, 'min_skill_level', c.min_skill_level)
    from public.hr_market_config c
$$;
revoke execute on function public.hr_market_rules() from public, anon, authenticated, service_role, hr_engine;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000ac0e3031';   -- a crafter who sells
  v_b  constant uuid := '000000c0-0000-4000-a000-0000ac0e3032';   -- a crafter who buys
  v_c  constant uuid := '000000c0-0000-4000-a000-0000ac0e3033';   -- the sweep over every skill
  k    constant text := '000000c0-0000-4000-b000-0000';
  v jsonb; v_txt text; v_role text; v_item text; v_floor bigint; v_lid uuid; v_was boolean; v_min int; v_skill int;
begin
  -- (a) the default, the catalogue's four, the surface
  if (select column_default from information_schema.columns where table_schema = 'public'
        and table_name = 'hr_market_config' and column_name = 'min_skill_level') is distinct from '30' then
    raise exception 'VERIFY(a): min_skill_level does not default to 30'; end if;
  if (select array_agg(skill_id order by skill_id) from public.hr_skills where cat = 'artisan')
       is distinct from array['cooking', 'crafting', 'runecrafting', 'smithing'] then
    raise exception 'VERIFY(a): the bench skills are not the four this rule was reviewed for'; end if;
  foreach v_txt in array array['public.hr_market_eligible(uuid)', 'public.hr_market_listing_gate()', 'public.hr_market_sale_gate()', 'public.hr_market_rules()'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
      if has_function_privilege(v_role, v_txt, 'execute') then raise exception 'VERIFY(a): % can execute %', v_role, v_txt; end if;
    end loop;
  end loop;

  select enabled, min_level, min_skill_level into v_was, v_min, v_skill from public.hr_market_config;
  select m.item_id, m.floor_each into v_item, v_floor from public.hr_market_items m
   where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
     and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  if v_item is null then raise exception 'VERIFY(b): no listable stackable good to probe with'; end if;
  begin
    insert into auth.users (id) values (v_a), (v_b), (v_c) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (v_a, 'market-bench probe'), (v_b, 'market-bench probe'), (v_c, 'market-bench probe') on conflict (user_id) do nothing;
    foreach v_txt in array array[v_a::text, v_b::text, v_c::text] loop
      perform set_config('request.jwt.claim.sub', v_txt, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', left(v::text, 300); end if;
      update public.account_wallet set gold = 1000000 where user_id = v_txt::uuid;
    end loop;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    update public.hr_market_config set enabled = true, min_level = 10, min_skill_level = 30 where only_row;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_a, 0, 'crafting', public.hr_skill_xp_for_level('crafting', 30) - 1), (v_b, 0, 'crafting', public.hr_skill_xp_for_level('crafting', 30) - 1)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;

    -- (b) one XP short of Crafting 30: refused by name, naming both numbers; nothing moved; the window can read it first
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_mine(v_a, 0);
    if (v->'locked') is distinct from 'true'::jsonb or (v#>>'{rules,min_level}')::int <> 10 or (v#>>'{rules,min_skill_level}')::int <> 30 then
      raise exception 'VERIFY(b): mine does not say Crafting 29 is locked, with both numbers: %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00003031')::uuid, 'bag', v_item, 3, v_floor);
    if v->>'error' is distinct from 'market_locked' or (v->>'min_level')::int <> 10 or (v->>'min_skill_level')::int <> 30 then
      raise exception 'VERIFY(b): Crafting 29 listed, or the refusal does not name both numbers: %', left(v::text, 300); end if;
    if (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) <> 5
       or exists (select 1 from public.market_listings where user_id = v_a) then
      raise exception 'VERIFY(b): the refused list moved something'; end if;

    -- (c) Crafting 30 at Level 1: the same account lists, and the window says so
    update public.player_skills set xp = public.hr_skill_xp_for_level('crafting', 30) where user_id = v_a and slot = 0 and skill_id = 'crafting';
    if public.hr_level_of(v_a, 0) >= 10 then raise exception 'VERIFY(c): the probe hero is not below the Level'; end if;
    v := public.hr_market_mine(v_a, 0);
    if (v->'locked') is distinct from 'false'::jsonb then raise exception 'VERIFY(c): mine still says locked at Crafting 30: %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00003032')::uuid, 'bag', v_item, 3, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): a Crafting 30 hero could not list: %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid;

    -- (d) a buyer one XP short is refused with the sale unmade; at Crafting 30 the same buyer buys
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_buy(v_b, 0, null, (k || '00003033')::uuid, v_lid, 1, v_floor, 'storage');
    if v->>'error' is distinct from 'market_locked' or (v->>'min_skill_level')::int <> 30 then
      raise exception 'VERIFY(d): Crafting 29 bought, or the refusal does not name both numbers: %', left(v::text, 300); end if;
    if public.hr_purse_of(v_b) <> 1000000 or exists (select 1 from public.market_sales where listing_id = v_lid) then
      raise exception 'VERIFY(d): the refused buy moved something'; end if;
    update public.player_skills set xp = public.hr_skill_xp_for_level('crafting', 30) where user_id = v_b and slot = 0 and skill_id = 'crafting';
    v := public.hr_market_buy(v_b, 0, null, (k || '00003034')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' or not exists (select 1 from public.market_sales where listing_id = v_lid and buyer_user_id = v_b) then
      raise exception 'VERIFY(d): a Crafting 30 hero could not buy: %', left(v::text, 300); end if;

    -- (e) only the bench counts: every other skill at 99 opens nothing, and each bench skill opens at exactly 30
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_c, 0, s.skill_id, public.hr_skill_xp_for_level(s.skill_id, 99) from public.hr_skills s where s.cat <> 'artisan'
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if not found or public.hr_market_eligible(v_c) then raise exception 'VERIFY(e): a gathering or combat skill opened the market'; end if;
    foreach v_txt in array array['smithing', 'crafting', 'cooking', 'runecrafting'] loop
      insert into public.player_skills (user_id, slot, skill_id, xp) values (v_c, 0, v_txt, public.hr_skill_xp_for_level(v_txt, 30) - 1)
        on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
      if public.hr_market_eligible(v_c) then raise exception 'VERIFY(e): % at 29 opened the market', v_txt; end if;
      update public.player_skills set xp = xp + 1 where user_id = v_c and slot = 0 and skill_id = v_txt;
      if not public.hr_market_eligible(v_c) then raise exception 'VERIFY(e): % at 30 did not open the market', v_txt; end if;
      update public.player_skills set xp = 0 where user_id = v_c and slot = 0 and skill_id = v_txt;
    end loop;

    -- (f) the Level still opens it alone, with the bench route shut
    update public.hr_market_config set min_skill_level = 100000 where only_row;
    if public.hr_market_eligible(v_a) then raise exception 'VERIFY(f): min_skill_level does not close the bench route'; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(10) where user_id = v_c and slot = 0;
    if not public.hr_market_eligible(v_c) then raise exception 'VERIFY(f): a Level 10 hero lost the market'; end if;
    raise exception using errcode = 'HR921', message = 'market-bench self-check complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c)) then raise exception 'VERIFY(g): the probe leaked'; end if;
  if (select enabled from public.hr_market_config) is distinct from v_was
     or (select min_level from public.hr_market_config) is distinct from v_min
     or (select min_skill_level from public.hr_market_config) is distinct from v_skill then
    raise exception 'VERIFY(g): the probe moved the config'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'market-bench: list and buy need a hero at the Level or a bench skill at its level; all green';
end $$;
