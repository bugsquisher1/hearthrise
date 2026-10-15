-- ==========================================================================
-- 2026-10-23-demolition-login-catalogue.sql — THE DAY-7 LOGIN BONUS LOSES THE BONE KEY
-- STAGED (lane/demo-shell integration, demolition 2026-10-14). Security GO
-- required: this moves a login-claim ITEM credit (a money surface). NOT APPLIED.
--
-- THE DEFECT IT CLOSES: 2026-10-23-demolition-catalogue.generated.sql deletes
-- bone_key from hr_items, but hr_login_catalogue() (2026-10-16-login-reward.sql)
-- still pays it on a straight day 7. hr_apply refuses an uncatalogued item, so
-- after that apply every honest straight day-7 login claim would be refused
-- `unknown_item` — the property 2026-10-16's own self-check (a) exists to hold.
--
-- Designer ruling 2026-10-14 §6, applied as it was to road_hunt: the bone key is
-- re-rewarded at the same value, {"bone_key":1} -> {"cooked_lobster":2}. It stays
-- in the `keys` bucket, so it is still FIXED (never scaled by the week) and still
-- pays only when the bonus is due (hr_login_bonus_ready reads the keys ids from
-- this catalogue; cooked_lobster is paid by no other cycle day, so that read
-- stays exact). Gold and gems do not move.
--
-- OWNERSHIP: the body of hr_login_catalogue() only. The pricer, the verify, the
-- streak and the bonus read it at call time; no other body moves.
-- ORDER: apply BEFORE 2026-10-23-demolition-catalogue.generated.sql.
-- REVERSIBILITY: restate the 2026-10-16 literal and revert src/data/rewards.js.
-- RE-RUNNABLE: §0 accepts the pre-state OR the post-state.
-- live-hash-drift: hr_login_catalogue's body hash moves (one function).
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_login_catalogue()') is null
     or to_regprocedure('public.hr_login_price(integer,boolean)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_login_catalogue / hr_login_price / hr_assert_grant_hygiene is absent';
  end if;
  if (public.hr_login_catalogue()->'cycle'->6->'keys') not in
       ('{"bone_key":1}'::jsonb, '{"cooked_lobster":2}'::jsonb) then
    raise exception 'PRECONDITION: day 7 keys are %, neither the reviewed old nor new value',
      public.hr_login_catalogue()->'cycle'->6->'keys';
  end if;
  if not exists (select 1 from public.hr_items where item_id = 'cooked_lobster') then
    raise exception 'PRECONDITION: cooked_lobster is not in hr_items';
  end if;
end $$;

-- ── 1. THE CATALOGUE, GENERATED FROM src/data/rewards.js ───────────────────
create or replace function public.hr_login_catalogue()
returns jsonb language sql immutable set search_path = pg_catalog as $fn$
  select
  -- BEGIN GENERATED login-catalogue (src/data/rewards.js; tests/login-reward.mjs)
  '{"cycle":[{"gold":60,"items":{"cooked_shrimp":10}},{"gold":80,"items":{"turnip_seed":10}},{"gold":100,"items":{"cooked_shrimp":15}},{"gold":130,"items":{"carrot_seed":10}},{"gold":160,"items":{"cooked_herring":10}},{"gold":200,"items":{"turnip_seed":15}},{"gold":270,"gems":2,"keys":{"cooked_lobster":2}}],"week_bonus":0.5,"max_mult":3,"streak_cap":35}'
  -- END GENERATED login-catalogue
  ::jsonb
$fn$;
revoke execute on function public.hr_login_catalogue() from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK - properties asserted by EXECUTING the pricer ────────────
do $$
declare
  v_q       jsonb;
  v_missing text;
  v_gh      jsonb;
begin
  -- (a) the cycle shape is unchanged and no retired id is paid.
  if jsonb_array_length(public.hr_login_catalogue()->'cycle') <> 7
     or (public.hr_login_catalogue()->>'max_mult')::numeric <> 3
     or (public.hr_login_catalogue()->>'streak_cap')::int <> 35 then
    raise exception 'VERIFY(a): the catalogue is not the 7-day, x3, cap-35 cycle: %', public.hr_login_catalogue();
  end if;
  select string_agg(distinct k, ',') into v_missing
    from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
   cross join lateral jsonb_object_keys(coalesce(d.r->'items', '{}') || coalesce(d.r->'keys', '{}')) k
   where not exists (select 1 from public.hr_items i where i.item_id = k) or k = 'bone_key';
  if v_missing is not null then
    raise exception 'VERIFY(a): the cycle pays uncatalogued or retired item(s): %', v_missing;
  end if;
  -- (b) the pricer, by value: a straight capped day 7 pays the lobster (unscaled),
  --     gold and gems unchanged; a step-back day 7 pays gold only; day 1 unmoved.
  v_q := public.hr_login_price(35, true);
  if (v_q->>'gold')::bigint <> 810 or v_q->'items' <> '{"cooked_lobster":2}'::jsonb or (v_q->>'gems')::int <> 2 then
    raise exception 'VERIFY(b): a straight day 35 (x3, day 7) prices %', v_q;
  end if;
  v_q := public.hr_login_price(7, false);
  if v_q->'items' <> '{}'::jsonb or (v_q->>'gems')::int <> 0 or (v_q->>'gold')::bigint <> 270 then
    raise exception 'VERIFY(b): a day 7 reached by a step back pays % (the bonus is straight-only)', v_q;
  end if;
  v_q := public.hr_login_price(1, false);
  if (v_q->>'gold')::bigint <> 60 or v_q->'items' <> '{"cooked_shrimp":10}'::jsonb or (v_q->>'gems')::int <> 0 then
    raise exception 'VERIFY(b): day 1 prices %', v_q;
  end if;
  -- (c) no client path, then grant hygiene.
  if has_function_privilege('anon', 'public.hr_login_catalogue()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_login_catalogue()', 'execute') then
    raise exception 'VERIFY(c): hr_login_catalogue is executable by a client role';
  end if;
  v_gh := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'VERIFY(c): grant-hygiene is not clean: %', v_gh;
  end if;
  raise notice 'demolition-login-catalogue: day 7 pays 2 cooked lobster (straight, unscaled), no bone_key; '
               'gold/gems unchanged; no client path; hygiene clean.';
end $$;
