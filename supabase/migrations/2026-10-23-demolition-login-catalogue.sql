-- ==========================================================================
-- 2026-10-23-demolition-login-catalogue.sql — THE DAILY LOGIN CYCLE, MINUS THE KEY
-- STAGED (lane/demo-data, demolition 2026-10-14). Security GO required: this
-- moves a claim's ITEM credit (a money surface). NOT APPLIED.
--
-- Security R2 (2026-10-15): the live hr_login_catalogue() day 7 pays bone_key,
-- and 2026-10-23-demolition-catalogue.generated.sql deletes bone_key from
-- hr_items, so every straight day-7 claim would fail with unknown_item. Day 7
-- keeps its 270 gold and 2 gems and pays no key: the Bone Key was worth 0 and
-- bound on pickup, so nothing of value replaces it.
--
-- OWNERSHIP: the body of hr_login_catalogue() only, restated from
-- 2026-10-16-login-reward.sql with the GENERATED literal re-emitted from
-- src/data/rewards.js DAILY_LOGIN_CYCLE (bound by tests/login-reward.mjs L1).
-- hr_login_price / hr_login_bonus_ready / hr_login_claim_verify read it and are
-- untouched: with no `keys` in the cycle, the bonus is the gems alone and the
-- ledger rule reads the gems arm.
--
-- ORDER: apply BEFORE 2026-10-23-demolition-catalogue.generated.sql, whose §4
-- refuses a login cycle naming an item missing from hr_items.
-- RE-RUNNABLE: create or replace; §0 accepts the 2026-10-16 body or this one.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_login_catalogue()') is null
     or to_regprocedure('public.hr_login_price(integer,boolean)') is null then
    raise exception 'PRECONDITION: hr_login_catalogue / hr_login_price is absent - apply 2026-10-16-login-reward.sql first';
  end if;
  if jsonb_array_length(public.hr_login_catalogue()->'cycle') <> 7 then
    raise exception 'PRECONDITION: the login cycle is not the reviewed 7-day cycle: %', public.hr_login_catalogue();
  end if;
end $$;

-- ── 1. THE CATALOGUE ───────────────────────────────────────────────────────
create or replace function public.hr_login_catalogue()
returns jsonb language sql immutable set search_path = pg_catalog as $fn$
  select
  -- BEGIN GENERATED login-catalogue (src/data/rewards.js; tests/login-reward.mjs)
  '{"cycle":[{"gold":60,"items":{"cooked_shrimp":10}},{"gold":80,"items":{"turnip_seed":10}},{"gold":100,"items":{"cooked_shrimp":15}},{"gold":130,"items":{"carrot_seed":10}},{"gold":160,"items":{"cooked_herring":10}},{"gold":200,"items":{"turnip_seed":15}},{"gold":270,"gems":2}],"week_bonus":0.5,"max_mult":3,"streak_cap":35}'
  -- END GENERATED login-catalogue
  ::jsonb
$fn$;
revoke execute on function public.hr_login_catalogue() from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK (executed, not asserted by markers) ──────────────────────
do $$
declare v_q jsonb; v_n int;
begin
  -- (a) every id the cycle pays is an hr_items row, and no day pays a key.
  select count(*) into v_n
    from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
   cross join lateral jsonb_object_keys(coalesce(d.r->'items', '{}') || coalesce(d.r->'keys', '{}')) k
   where not exists (select 1 from public.hr_items i where i.item_id = k);
  if v_n > 0 then raise exception 'demolition-login-catalogue self-check (a): % cycle item(s) are not in hr_items', v_n; end if;
  if exists (select 1 from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
              where d.r ? 'keys') then
    raise exception 'demolition-login-catalogue self-check (a): a cycle day still pays a key'; end if;
  -- (b) the priced day 7, straight and capped: 810 gold, 2 gems, no item.
  v_q := public.hr_login_price(35, true);
  if (v_q->>'gold')::bigint <> 810 or (v_q->>'gems')::int <> 2 or v_q->'items' <> '{}'::jsonb then
    raise exception 'demolition-login-catalogue self-check (b): a capped straight day 7 prices %', v_q; end if;
  -- (c) a step-back day 7 pays gold only.
  v_q := public.hr_login_price(7, false);
  if (v_q->>'gold')::bigint <> 270 or (v_q->>'gems')::int <> 0 or v_q->'items' <> '{}'::jsonb then
    raise exception 'demolition-login-catalogue self-check (c): a step-back day 7 prices %', v_q; end if;
  -- (d) no client may execute the catalogue.
  if has_function_privilege('authenticated', 'public.hr_login_catalogue()', 'execute')
     or has_function_privilege('anon', 'public.hr_login_catalogue()', 'execute') then
    raise exception 'demolition-login-catalogue self-check (d): hr_login_catalogue is client-executable'; end if;
  raise notice 'demolition-login-catalogue: day 7 pays 270 gold and 2 gems, every cycle id is an hr_items row, no key - all green';
end $$;
