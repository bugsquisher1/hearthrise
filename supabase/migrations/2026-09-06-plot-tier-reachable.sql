-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-06-plot-tier-reachable.sql — THE PLOT TIER IS A PRICE AGAIN,
--                                      NOT A LOTTERY.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-06-plot-tier-reachable.sql`,
--     ONE transaction) after the SECURITY review. It moves a SERVER PRICE and
--     adds a GOLD DEBIT to an existing client-callable RPC, which is an
--     economy surface: read §5 before signing it off.
--
-- ⚠ AFTER APPLYING: hr_farm_upgrade_plot is a live-hash-tracked body
--   (tests/live-hash-drift.baseline.json, entry
--   `hr_farm_upgrade_plot(p_slot integer, p_idem uuid)`, tracked_by `pin`).
--   This file RESTATES that body, so both its `replay` and its `live` md5 move.
--   The author of this file is NOT permitted to hand-edit that baseline, so it
--   is deliberately left divergent: re-seed with
--     node tests/live-hash-drift.mjs --write --no-live     (staged, pre-apply)
--     node tests/live-hash-drift.mjs --live --write        (after applying)
--   and FILL the `why` REVIEW placeholder the writer leaves behind — a
--   placeholder in place is itself a --selftest failure. Until that ritual is
--   run, `node tests/live-hash-drift.mjs` is EXPECTED to report this one body.
--
--   Companion data:   src/core/farm.js  PLOT_TIER_PRICES (the client mirror)
--   Companion guard:  tests/plot-tier-parity.mjs (--selftest/--mutate), wired
--                     into .github/workflows/smoke.yml — the client and this
--                     file can never disagree on the price.
--   Companion client: src/features/farm-progression.js (pre-flight + copy),
--                     src/net/farm-sync.js (reconciles gold from the response),
--                     src/legacy.js House -> Plot card,
--                     src/features/smoke-test.js FARM-TIER-1/2/3.
--
-- ── THE BUG, AS MEASURED ────────────────────────────────────────────────────
-- Production 2026-09-06: farm plants per day across the WHOLE player base went
-- 46 (Aug 24) -> 26 -> 6 -> ZERO every day from Aug 27 to Sep 5. Not a decline:
-- a stop. The chain is short and every link is in this repository.
--
--   1. Since the wipe every character's player_state.plot_level is 1.
--   2. Turnip is the only crop with hr_crop_plot_tier.plot_tier = 1.
--   3. hr_farm_plant refuses anything above the tier with plot_tier_locked
--      (2026-08-22-server-farming-complete.sql:198).
--   4. The ONLY writer of plot_level is hr_farm_upgrade_plot, and it charges
--      hr_plot_tier.deed_cost — Farmer's Deeds, which drop at 0.1% per Tier-2+
--      kill and 0.5% per bounty turn-in (src/core/farm.js KILL_DEED_CHANCE /
--      BOUNTY_DEED_CHANCE). ~1,000 tier-2+ kills or ~200 bounties per deed.
--
-- So a farming-level-12 player holding carrot seeds cannot plant carrots and
-- has no realistic path to tier 2. Everything above turnip is dead content for
-- every player, and the farm's whole XP/produce curve is unreachable behind a
-- 0.1% item. This is not a balance nudge; the content is OFF.
--
-- ── THE RULING (game design, final authority) ───────────────────────────────
-- THE PLOT TIER IS NEVER THE GATE. It is bought slightly BEFORE the crop it
-- unlocks becomes plantable, and the CROP's own farming level does the pacing
-- (carrot 10, wheat 20, potato 30, tomato 40, pumpkin 50, goldenroot 62,
-- emberfruit 75, moonbloom 88 — all UNCHANGED by this file). The tier is
-- priced in GOLD, the currency a farmer actually meets, and the deed count is
-- kept as an ALTERNATIVE payment for a player who is short of gold. Deeds
-- therefore become an ACCELERATOR and a market good (8 deeds skip 100,000g at
-- tier 5) instead of the gate. DROP RATES ARE UNCHANGED — nothing here widens
-- a faucet, and no new item, XP or gold is minted anywhere in this file.
--
--   tier  farming lv   gold      deeds (alternative)   first crop it unlocks
--     2        5           500        1                carrot (farming 10)
--     3       25         5,000        3                potato (farming 30)
--     4       45        25,000        5                pumpkin (farming 50)
--     5       70       100,000        8                emberfruit (farming 75)
--
-- TARGET CURVE, player who farms nightly on the starting two-plot camp:
--   tier 2  first evening   (~4 turnip harvests = 512 farming XP; 500g against
--                            a 1,000g start kit and ~55g profit per plot-cycle)
--   tier 3  days 3–5        (farming 25 = 8,740 XP on carrot/wheat)
--   tier 4  week 2–3        (farming 45 = 61,512 XP)
--   tier 5  the long tail   (farming 70 = 737,627 XP)
-- Deeds skip the gold at any rung, and a deed hoarder is exactly as well off as
-- before this file: 1/3/5/8 is the price they already knew.
--
-- ── WHY GOLD-FIRST, DEEDS ONLY WHEN GOLD IS SHORT ───────────────────────────
-- A deed replaces 500g at tier 2 and 12,500g at tier 5, and it is TRADEABLE.
-- Spending the rarer currency while the player holds the cheaper one is the
-- server making a bad trade on their behalf, silently. So the debit order is
-- gold, then deeds — stated once, in ONE place (§2), and asserted in §4.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--   • It does not touch deed DROP RATES or add a deed faucet.
--   • It does not touch hr_crops.req_lv — no crop got easier.
--   • It does not touch hr_plot_tier.deed_cost (1/3/5/8, generated from
--     src/core/farm.js PLOT_TIERS by tools/gen-farm-catalogues.mjs). It only
--     ADDS the two columns the deed-only design never had.
--   • It grants nothing new: the ACL on hr_farm_upgrade_plot is asserted
--     UNCHANGED in §4 (authenticated only; not anon, not public, not
--     hr_engine), and the catalogue stays select-only to every client role.
-- ════════════════════════════════════════════════════════════════════════


-- ── §0. PREFLIGHT — refuse against a database missing any of this ──────────
do $$
begin
  if to_regclass('public.hr_plot_tier') is null then
    raise exception 'hr_plot_tier is absent — apply 2026-08-22-farm-catalogues.generated.sql first.';
  end if;
  if to_regprocedure('public.hr_farm_upgrade_plot(int,uuid)') is null then
    raise exception 'hr_farm_upgrade_plot is absent — apply 2026-08-22-server-farming-complete.sql first.';
  end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is absent — apply 2026-09-03-intent-mismatch-class.sql first. '
                    'This file RESTATES a body that migration patched; restating it against a database '
                    'without the helper would silently revert the intent-mismatch hardening.';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is absent — the farming-level gate cannot be derived server-side.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='gold') then
    raise exception 'player_state.gold is absent — there is nothing to charge.';
  end if;
end $$;


-- ── §1. THE CATALOGUE — the price lives in a TABLE, not in the body ────────
-- Same shape as deed_cost: read-only to every client role, written by no client
-- policy, re-read by the RPC under the character's row lock on every call. A
-- future re-price is then a one-row UPDATE plus the parity guard, not a body.
alter table public.hr_plot_tier add column if not exists gold_cost     bigint not null default 0;
alter table public.hr_plot_tier add column if not exists req_farm_level int   not null default 1;

do $$
begin
  if not exists (select 1 from information_schema.table_constraints
                  where table_schema='public' and table_name='hr_plot_tier'
                    and constraint_name='hr_plot_tier_gold_cost_ck') then
    alter table public.hr_plot_tier add constraint hr_plot_tier_gold_cost_ck check (gold_cost >= 0);
  end if;
  if not exists (select 1 from information_schema.table_constraints
                  where table_schema='public' and table_name='hr_plot_tier'
                    and constraint_name='hr_plot_tier_req_farm_level_ck') then
    alter table public.hr_plot_tier add constraint hr_plot_tier_req_farm_level_ck
      check (req_farm_level between 1 and 99);
  end if;
end $$;

-- THE PRICES. Idempotent by key; re-applying restates the same four rows.
-- Level 1 is the starting state and must stay free in both currencies.
update public.hr_plot_tier set gold_cost = v.gold, req_farm_level = v.lv
  from (values (1, 0::bigint, 1), (2, 500::bigint, 5), (3, 5000::bigint, 25),
               (4, 25000::bigint, 45), (5, 100000::bigint, 70))
       as v(plot_level, gold, lv)
 where public.hr_plot_tier.plot_level = v.plot_level;


-- ── §2. THE RPC — gold OR deeds, behind a farming-level gate ───────────────
-- RESTATED whole rather than patched, because the change is structural (a new
-- gate, a second currency, a payment decision). The restatement carries FORWARD
-- every property the two migrations that authored this body established:
--   • the hr_intent_replay idempotency guard (2026-09-03-intent-mismatch-class
--     §2) — exactly ONE call, and NO direct `from public.player_intents` read,
--     which is what that file's §3 asserts across all twelve bodies;
--   • the farm_plant rate bucket, the row lock, the version bump, the ledger
--     row, the player_intents cache write (2026-08-22-server-farming-complete).
-- §4 asserts both of those textually, so a future template restatement that
-- drops one fails here rather than in production.
--
-- NOTHING IS MINTED AND NO CALLER VALUE IS TRUSTED: the price, the level and
-- the balances are all read server-side under the lock; the only inputs are a
-- slot and an idempotency key.
create or replace function public.hr_farm_upgrade_plot(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_deed constant text := 'farm_deed';
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_next  int;
  v_cost  int;
  v_gold  bigint;
  v_reqlv int;
  v_farmlv int;
  v_xp    bigint;
  v_have  bigint;
  v_pay   text;
  v_cached jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_upgrade_plot') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  v_next := v_state.plot_level + 1;
  select deed_cost, gold_cost, req_farm_level into v_cost, v_gold, v_reqlv
    from public.hr_plot_tier where plot_level = v_next;
  if v_cost is null then
    return jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_state.plot_level);
  end if;

  -- THE PACING GATE. Farming level re-derived from the server's own XP, the
  -- same reader hr_farm_plant uses for the crop's req_lv.
  select coalesce(xp, 0) into v_xp from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farmlv := public.hr_level_from_xp(coalesce(v_xp, 0));
  if v_farmlv < coalesce(v_reqlv, 1) then
    return jsonb_build_object('ok', false, 'error', 'farm_level_too_low',
      'need', v_reqlv, 'have', v_farmlv, 'plot_level', v_next);
  end if;

  -- THE PAYMENT DECISION. Gold first — a deed is worth far more than the gold
  -- it replaces at every rung and it is tradeable, so spending the rarer
  -- currency while the player holds the cheaper one is a bad trade made on
  -- their behalf. Deeds are the fallback, never the default.
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = c_deed;
  v_have := coalesce(v_have, 0);
  if v_state.gold >= coalesce(v_gold, 0) then
    v_pay := 'gold';
  elsif v_have >= v_cost then
    v_pay := 'deeds';
  else
    return jsonb_build_object('ok', false, 'error', 'cannot_afford',
      'need_gold', coalesce(v_gold, 0), 'have_gold', v_state.gold,
      'need_deeds', v_cost, 'have_deeds', v_have, 'plot_level', v_next);
  end if;

  if v_pay = 'deeds' and v_cost > 0 then
    update public.player_inventory set qty = qty - v_cost
      where user_id = v_uid and slot = p_slot and item_id = c_deed and qty > v_cost;
    if not found then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = c_deed;
    end if;
  end if;

  update public.player_state
     set plot_level = v_next,
         gold = gold - (case when v_pay = 'gold' then coalesce(v_gold, 0) else 0 end),
         version = version + 1,
         updated_at = now()
   where user_id = v_uid and slot = p_slot
   returning gold into v_gold;

  -- THE JOURNAL. One row, unchanged kind ('farm'), the direction in the signed
  -- numbers: gold spent is negative gold, deeds spent is negative qty on the
  -- deed item. gold_in/xp_in/qty_in are ZERO and written explicitly — this call
  -- consumed no inflow budget because it minted nothing.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot', c_deed,
            case when v_pay = 'deeds' then -v_cost else 0 end,
            case when v_pay = 'gold'  then -(select gold_cost from public.hr_plot_tier where plot_level = v_next) else 0 end,
            jsonb_build_object('plot_level', v_next, 'paid_with', v_pay,
                               'farm_level', v_farmlv));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next,
    'paid_with', v_pay,
    'deeds_spent', case when v_pay = 'deeds' then v_cost else 0 end,
    'gold_spent',  case when v_pay = 'gold'
                        then (select gold_cost from public.hr_plot_tier where plot_level = v_next)
                        else 0 end,
    'gold', v_gold);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;


-- ── §3. THE ACL — restated IDENTICALLY, never widened ──────────────────────
-- `create or replace` preserves proacl, so these three lines change nothing on
-- a database that already carries them; they exist so a FRESH replay of the
-- chain lands the same ACL the production function has, and §4 proves it.
revoke execute on function public.hr_farm_upgrade_plot(int, uuid) from public;
revoke execute on function public.hr_farm_upgrade_plot(int, uuid) from anon;
grant  execute on function public.hr_farm_upgrade_plot(int, uuid) to authenticated;


-- ── §4. SELF-VERIFICATION — the prices, the rules, and the grants ──────────
-- A migration that does not check its own claims is a comment.
do $$
declare
  v_src   text;
  v_uid   uuid := '00000000-0000-4a00-8000-0000000f0001';
  v_slot  int  := 0;
  v_r     jsonb;
  v_n     int;
  v_gold  bigint;
  v_lv    int;
begin
  -- (a) THE PRICE TABLE is exactly the four rungs the ruling names, level 1 is
  --     free in BOTH currencies, and deed_cost is UNTOUCHED (1/3/5/8 — this
  --     file must not move the generated column).
  if (select count(*) from public.hr_plot_tier) <> 5 then
    raise exception 'GATE(a): hr_plot_tier does not have 5 rows'; end if;
  for v_lv, v_gold, v_n in
    select * from (values (1, 0::bigint, 1), (2, 500::bigint, 5), (3, 5000::bigint, 25),
                          (4, 25000::bigint, 45), (5, 100000::bigint, 70)) as t(lv, g, r)
  loop
    if (select gold_cost from public.hr_plot_tier where plot_level = v_lv) <> v_gold then
      raise exception 'GATE(a): plot level % gold_cost is % (expected %)',
        v_lv, (select gold_cost from public.hr_plot_tier where plot_level = v_lv), v_gold; end if;
    if (select req_farm_level from public.hr_plot_tier where plot_level = v_lv) <> v_n then
      raise exception 'GATE(a): plot level % req_farm_level is % (expected %)',
        v_lv, (select req_farm_level from public.hr_plot_tier where plot_level = v_lv), v_n; end if;
  end loop;
  if (select gold_cost from public.hr_plot_tier where plot_level = 1) <> 0
     or (select deed_cost from public.hr_plot_tier where plot_level = 1) <> 0 then
    raise exception 'GATE(a): plot level 1 is not free'; end if;
  if (select array_agg(deed_cost order by plot_level) from public.hr_plot_tier)
     <> array[0,1,3,5,8] then
    raise exception 'GATE(a): deed_cost moved — this file must not touch the generated column, got %',
      (select array_agg(deed_cost order by plot_level) from public.hr_plot_tier); end if;

  -- (b) THE CATALOGUE IS STILL READ-ONLY to every client role. A price the
  --     client can UPDATE is a free upgrade.
  if exists (select 1 from pg_policies where schemaname='public' and tablename='hr_plot_tier'
              and cmd in ('INSERT','UPDATE','DELETE','ALL')) then
    raise exception 'GATE(b): a write policy exists on hr_plot_tier'; end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hr_plot_tier'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a non-SELECT grant exists on hr_plot_tier'; end if;

  -- (c) THE GRANTS ON THE RPC ARE UNCHANGED — authenticated only. Not anon,
  --     not PUBLIC, not hr_engine (deliberately, per 2026-08-22 §9).
  if not has_function_privilege('authenticated', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute') then
    raise exception 'GATE(c): authenticated LOST execute on hr_farm_upgrade_plot'; end if;
  if has_function_privilege('anon', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute') then
    raise exception 'GATE(c): anon may execute hr_farm_upgrade_plot'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute') then
    raise exception 'GATE(c): hr_engine may execute hr_farm_upgrade_plot'; end if;
  if (select proacl from pg_proc where oid = 'public.hr_farm_upgrade_plot(int,uuid)'::regprocedure) is null then
    raise exception 'GATE(c): hr_farm_upgrade_plot carries the DEFAULT acl — PUBLIC may execute it'; end if;

  -- (d) THE BODY KEPT WHAT IT INHERITED. Exactly one hr_intent_replay call and
  --     no direct read of player_intents.result (2026-09-03 §3's property), the
  --     rate bucket, the row lock, the ledger row.
  v_src := replace(pg_get_functiondef('public.hr_farm_upgrade_plot(int,uuid)'::regprocedure), chr(13), '');
  if (length(v_src) - length(replace(v_src, 'hr_intent_replay(', ''))) / length('hr_intent_replay(') <> 1 then
    raise exception 'GATE(d): the restatement lost (or doubled) the intent-mismatch guard'; end if;
  if position('from public.player_intents' in v_src) > 0 then
    raise exception 'GATE(d): the restatement reads player_intents.result directly again'; end if;
  if position('hr_rpc_gate(''farm_plant'')' in v_src) = 0 then
    raise exception 'GATE(d): the rate gate is gone'; end if;
  if position('for update' in v_src) = 0 then
    raise exception 'GATE(d): the player_state row lock is gone'; end if;
  if position('player_ledger' in v_src) = 0 then
    raise exception 'GATE(d): the journal row is gone'; end if;

  -- (e) EXECUTED, on a real character, in a discarded subtransaction.
  --     Net-zero on production: every probe row is rolled back and §4 proves it.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, plot_level)
      values (v_uid, v_slot, 400, 0, 1, 1)
      on conflict (user_id, slot) do update set gold = 400, plot_level = 1, version = 1;
    delete from public.player_skills    where user_id = v_uid and slot = v_slot;
    delete from public.player_inventory where user_id = v_uid and slot = v_slot;

    -- (e1) THE LEVEL GATE BITES FIRST — farming 1, and the money is irrelevant.
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());
    if v_r ->> 'error' <> 'farm_level_too_low' or (v_r->>'need')::int <> 5 then
      raise exception 'GATE(e1): farming-1 upgrade was not refused for level: %', v_r; end if;

    -- (e2) AT THE LEVEL BUT BROKE — refused, and the refusal QUOTES BOTH
    --      currencies so the client can tell the player what is missing.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', 600)
      on conflict (user_id, slot, skill_id) do update set xp = 600;
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());
    if v_r ->> 'error' <> 'cannot_afford' or (v_r->>'need_gold')::bigint <> 500
       or (v_r->>'need_deeds')::int <> 1 then
      raise exception 'GATE(e2): a broke, eligible farmer got %', v_r; end if;
    if (select plot_level from public.player_state where user_id=v_uid and slot=v_slot) <> 1 then
      raise exception 'GATE(e2): a REFUSED upgrade moved plot_level'; end if;

    -- (e3) THE DEED FALLBACK — still 400 gold (short of 500), one deed pays.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'farm_deed', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' or (v_r->>'plot_level')::int <> 2
       or v_r->>'paid_with' <> 'deeds' or (v_r->>'deeds_spent')::int <> 1
       or (v_r->>'gold_spent')::bigint <> 0 then
      raise exception 'GATE(e3): the deed fallback did not pay: %', v_r; end if;
    if (select gold from public.player_state where user_id=v_uid and slot=v_slot) <> 400 then
      raise exception 'GATE(e3): the deed payment ALSO charged gold'; end if;
    if exists (select 1 from public.player_inventory
                where user_id=v_uid and slot=v_slot and item_id='farm_deed') then
      raise exception 'GATE(e3): the last deed was not spent'; end if;

    -- (e4) GOLD FIRST when both are affordable. Tier 3 needs farming 25 and
    --      5,000g; give 3 deeds AND 6,000g and prove the deeds survive.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', 9000)
      on conflict (user_id, slot, skill_id) do update set xp = 9000;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'farm_deed', 3)
      on conflict (user_id, slot, item_id) do update set qty = 3;
    update public.player_state set gold = 6000 where user_id=v_uid and slot=v_slot;
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' or (v_r->>'plot_level')::int <> 3
       or v_r->>'paid_with' <> 'gold' or (v_r->>'gold_spent')::bigint <> 5000
       or (v_r->>'deeds_spent')::int <> 0 then
      raise exception 'GATE(e4): tier 3 did not charge gold first: %', v_r; end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=v_slot;
    if v_gold <> 1000 then
      raise exception 'GATE(e4): gold is % after a 5,000g charge on 6,000 (expected 1000)', v_gold; end if;
    if (v_r->>'gold')::bigint <> 1000 then
      raise exception 'GATE(e4): the response quoted gold % but the row says 1000', v_r->>'gold'; end if;
    if (select qty from public.player_inventory
         where user_id=v_uid and slot=v_slot and item_id='farm_deed') <> 3 then
      raise exception 'GATE(e4): gold payment ALSO ate the deeds — the rarer currency was spent'; end if;

    -- (e5) REPLAY-SAFE. Tier 4 wants farming 45 and 25,000g; the SAME key
    --      returns the SAME envelope and charges nothing twice.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', 70000)
      on conflict (user_id, slot, skill_id) do update set xp = 70000;
    update public.player_state set gold = 30000 where user_id=v_uid and slot=v_slot;
    v_r := public.hr_farm_upgrade_plot(v_slot, '00000000-0000-4a00-8000-0000000f0005'::uuid);
    if coalesce(v_r->>'ok','') <> 'true' or (v_r->>'plot_level')::int <> 4 then
      raise exception 'GATE(e5): the tier-4 upgrade did not land: %', v_r; end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=v_slot;
    v_r := public.hr_farm_upgrade_plot(v_slot, '00000000-0000-4a00-8000-0000000f0005'::uuid);
    if (v_r->>'plot_level')::int <> 4 then
      raise exception 'GATE(e5): the replay returned a different envelope: %', v_r; end if;
    if (select plot_level from public.player_state where user_id=v_uid and slot=v_slot) <> 4
       or (select gold from public.player_state where user_id=v_uid and slot=v_slot) <> v_gold then
      raise exception 'GATE(e5): the replay charged twice / advanced twice'; end if;

    -- (e6) THE JOURNAL CARRIES THE SPEND. One row per upgrade, gold negative.
    select count(*) into v_n from public.player_ledger
      where user_id = v_uid and slot = v_slot and intent = 'farm_upgrade_plot';
    if v_n <> 3 then
      raise exception 'GATE(e6): % ledger rows for 3 upgrades', v_n; end if;
    if (select sum(gold) from public.player_ledger
         where user_id = v_uid and slot = v_slot and intent = 'farm_upgrade_plot') >= 0 then
      raise exception 'GATE(e6): the gold spend is not journalled as negative gold'; end if;

    -- (e7) NOTHING WAS MINTED. Farming XP is exactly what §4 inserted, no
    --      inventory appeared, and plot_level cannot exceed 5.
    if (select coalesce(xp,0) from public.player_skills
         where user_id=v_uid and slot=v_slot and skill_id='farming') <> 70000 then
      raise exception 'GATE(e7): the upgrade credited XP — it must mint nothing'; end if;
    update public.player_state set gold = 1000000 where user_id=v_uid and slot=v_slot;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', 1500000)
      on conflict (user_id, slot, skill_id) do update set xp = 1500000;
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());   -- 4 -> 5
    if (v_r->>'plot_level')::int <> 5 then
      raise exception 'GATE(e7): tier 5 did not land: %', v_r; end if;
    v_r := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());   -- 5 -> refused
    if v_r ->> 'error' <> 'max_plot_level' then
      raise exception 'GATE(e7): a 6th tier was sold: %', v_r; end if;

    raise exception using errcode = 'HR821', message = 'plot-tier-reachable §4 complete — rolling back';
  exception when sqlstate 'HR821' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users           where id      = v_uid) then
    raise exception 'GATE: §4 LEAKED a probe row'; end if;

  raise notice 'plot-tier-reachable: gold 500/5k/25k/100k at farming 5/25/45/70, deeds 1/3/5/8 unchanged '
               'as the fallback, gold charged first, level gate server-derived, replay-safe, journalled, '
               'grants unchanged, nothing minted — all green';
end $$;


-- ── §5. FOR THE SECURITY REVIEW ────────────────────────────────────────────
-- WHAT CHANGED ON THE ECONOMY SURFACE:
--   • hr_farm_upgrade_plot now DEBITS GOLD. It is the first gold debit on the
--     farm surface. The amount is read from hr_plot_tier under the character's
--     row lock; no caller value reaches it; the debit and the grant happen in
--     ONE update statement, so a failure cannot advance the tier unpaid.
--   • It can no longer be paid twice for one key (unchanged: hr_intent_replay
--     + the player_intents cache write) and it still cannot be called by anon.
--   • It MINTS NOTHING: no XP, no item, no gold, no gems. Every path either
--     spends or refuses, so it consumes no daily inflow budget and is
--     deliberately NOT wired to hr_day_budget_check (that gate exists to clamp
--     INFLOW; a spend has none). If the review prefers a per-day cap on the
--     number of upgrades, note the ceiling is already absolute: four in a
--     character's life, gated by farming level.
--   • Gold can go NEGATIVE only if player_state.gold could be below the price
--     at the moment of the update — it cannot: the comparison and the update
--     are inside the same lock, and the `elsif` deed branch charges no gold.
--   • THE ONE OPEN QUESTION: the client mirror (src/core/farm.js
--     PLOT_TIER_PRICES) is display-only and is proven equal to this file by
--     tests/plot-tier-parity.mjs in CI. A client that lies about the price
--     changes nothing — the RPC re-reads the catalogue — but it would show a
--     wrong number, so the guard is the contract.


-- ── §6. THE LAST WORD — the file ends on a statement, not a comment ────────
-- (The migration guard in src/features/smoke-test.js requires a terminator; it
-- is also a cheap final read-back of the four rungs this file exists to set.)
do $$
declare v_rungs text;
begin
  select string_agg(plot_level || ':' || gold_cost || 'g/' || deed_cost || 'd@lv' || req_farm_level,
                    '  ' order by plot_level)
    into v_rungs from public.hr_plot_tier;
  raise notice 'plot-tier-reachable: hr_plot_tier is now %', v_rungs;
end $$;
