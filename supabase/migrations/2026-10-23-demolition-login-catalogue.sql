-- ==========================================================================
-- 2026-10-23-demolition-login-catalogue.sql — THE DAILY LOGIN REWARD IS OFF
-- STAGED (lane/p0-deletion-server; game CLOSED: applies on its passing §4,
-- Security reviews it in the reopen gate). NOT APPLIED.
--
-- Tyler, 2026-10-17: the daily login reward is PREMIUM-ONLY, and for now it is
-- just a training weapon. Premium does not exist on the server yet (lane S1
-- adds it and authors that reward), so until then the reward is OFF for
-- everyone: no gold, no items, no key, no gem, on any day of any streak.
-- (Supersedes this file's 2026-10-15 text, Security R2: day 7 paid 300 gold
-- because bone_key left hr_items.)
--
-- OWNERSHIP: two bodies, both from 2026-10-16-login-reward.sql:
--   hr_login_catalogue()   the GENERATED literal re-emitted from
--                          src/data/rewards.js DAILY_LOGIN_CYCLE (seven empty
--                          days), so hr_login_price prices 0 for every streak;
--   hr_login_claim_verify  refuses EVERY claim with hr_reject('login_reward_off')
--                          before it reads anything. hr_apply calls it under the
--                          character lock right after progress_claim flips
--                          today's daily:login row, so the refusal rolls the
--                          flip back with the rest of the apply, the intent
--                          stores the refusal (a replay answers the same), and
--                          hr_apply journals it in hr_rejections (aggregated per
--                          character / code / day, never per event).
-- hr_login_price / hr_login_streak / hr_login_bonus_ready / hr_claim_lookup are
-- untouched. Bound by tests/login-reward-off.mjs (rewards.js == the literal;
-- a real hr_apply claim is refused, journalled and pays nothing).
--
-- ORDER: apply BEFORE 2026-10-23-demolition-catalogue.generated.sql, whose §4
-- refuses a login cycle naming an item missing from hr_items.
-- RE-RUNNABLE: create or replace.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_login_catalogue()') is null
     or to_regprocedure('public.hr_login_price(integer,boolean)') is null
     or to_regprocedure('public.hr_login_claim_verify(uuid,integer,text,jsonb)') is null then
    raise exception 'PRECONDITION: hr_login_catalogue / hr_login_price / hr_login_claim_verify is absent - apply 2026-10-16-login-reward.sql first';
  end if;
  if jsonb_array_length(public.hr_login_catalogue()->'cycle') <> 7 then
    raise exception 'PRECONDITION: the login cycle is not the reviewed 7-day cycle: %', public.hr_login_catalogue();
  end if;
end $$;

-- ── 1. THE CATALOGUE ───────────────────────────────────────────────────────
create or replace function public.hr_login_catalogue()
returns jsonb language sql immutable set search_path = pg_catalog as $fn$
  select
  -- BEGIN GENERATED login-catalogue (src/data/rewards.js; tests/login-reward-off.mjs)
  '{"cycle":[{},{},{},{},{},{},{}],"week_bonus":0.5,"max_mult":3,"streak_cap":35}'
  -- END GENERATED login-catalogue
  ::jsonb
$fn$;
revoke execute on function public.hr_login_catalogue() from public, anon, authenticated, service_role;

-- ── 2. THE CLAIM REFUSES ───────────────────────────────────────────────────
-- Same signature, volatility and grants as the 2026-10-16 body; the price check
-- is gone because there is nothing to price. Premium (S1) restates this body.
create or replace function public.hr_login_claim_verify(p_uid uuid, p_slot int, p_period text, p_delta jsonb)
returns void language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  perform public.hr_reject('login_reward_off',
    jsonb_build_object('why', 'the daily login reward is premium-only and premium is not built yet'));
end $fn$;
revoke execute on function public.hr_login_claim_verify(uuid, int, text, jsonb) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK (executed, not asserted by markers) ──────────────────────
do $$
declare v_q jsonb; v_n int; v_s int; v_code text;
begin
  -- (a) seven days, and no day pays anything: no gold, item, key or gem.
  if jsonb_array_length(public.hr_login_catalogue()->'cycle') <> 7 then
    raise exception 'demolition-login-catalogue self-check (a): the cycle is not seven days'; end if;
  select count(*) into v_n from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
   where d.r <> '{}'::jsonb;
  if v_n > 0 then raise exception 'demolition-login-catalogue self-check (a): % cycle day(s) still pay', v_n; end if;
  -- (b) every streak, bonus due or not, prices 0 gold, 0 gems, no item.
  for v_s in 1..40 loop
    foreach v_q in array array[public.hr_login_price(v_s, true), public.hr_login_price(v_s, false)] loop
      if (v_q->>'gold')::bigint <> 0 or (v_q->>'gems')::bigint <> 0 or v_q->'items' <> '{}'::jsonb then
        raise exception 'demolition-login-catalogue self-check (b): streak % prices %', v_s, v_q; end if;
    end loop;
  end loop;
  -- (c) the claim refuses login_reward_off for any caller, any period, any
  --     delta (a zero delta included), as HR000 so hr_apply rolls back.
  foreach v_q in array array['{}'::jsonb, '{"gold":300}'::jsonb, '{"gold":0,"gems":0,"items":{}}'::jsonb] loop
    v_code := null;
    begin
      perform public.hr_login_claim_verify(gen_random_uuid(), 0, public.hr_utc_day_key(now()), v_q);
    exception when sqlstate 'HR000' then v_code := sqlerrm;
    end;
    if v_code is distinct from 'login_reward_off' then
      raise exception 'demolition-login-catalogue self-check (c): a claim of % was answered %', v_q, coalesce(v_code, 'ACCEPTED'); end if;
  end loop;
  -- (d) neither body is client-executable.
  if has_function_privilege('authenticated', 'public.hr_login_catalogue()', 'execute')
     or has_function_privilege('anon', 'public.hr_login_catalogue()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_login_claim_verify(uuid,integer,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_login_claim_verify(uuid,integer,text,jsonb)', 'execute') then
    raise exception 'demolition-login-catalogue self-check (d): a login body is client-executable'; end if;
  raise notice 'demolition-login-catalogue: the login reward is off - every day pays nothing, every claim refuses login_reward_off - all green';
end $$;
