-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-27-ledger-of-firsts.sql
-- LEDGER OF FIRSTS: THE COLLECTION LOG GROWS FROM 4 RUNGS TO 11.
--
-- ⚠ STAGED, NOT APPLIED. MONEY SURFACE (credits server-owned gold). Security GO
--   REQUIRED before apply; the Coordinator applies it with
--   `node tools/apply-migration.mjs` BEFORE the hr-accrue edge deploy and the
--   client push (otherwise the client offers a rung the server answers with
--   unknown_milestone — the browser-vs-server P1 class).
--
-- WHAT IT DOES. Restates hr_claim_milestone__ungated(text,int) ONLY. The body
-- is 2026-08-22-collection-claim.sql §4 VERBATIM (production carries exactly
-- that body, measured 2026-09-26); the ONLY change is the CASE catalogue,
-- 4 arms → 11, in the same one-line shape. The DISTINCT re-derivation from
-- hr_bestiary_of / hr_collection_of, the once-guard (player_progress
-- kind='collection' insert … on conflict do nothing), the credit, the ledger
-- row and gold_in/gems_in = 0 are unchanged.
--
--   monsters: hunter10 10/2000 · hunter25 25/4000 · hunter40 40/8000 ·
--             hunter60 60/15000 · hunter85 85/25000 · hunterAll 108/50000+25gm
--   items:    collect25 25/1000 · collect50 50/5000 · collect75 75/10000 ·
--             collect100 100/15000+15gm · collect125 125/30000
--   New rungs: +93,000 gold per character slot, once each; 0 new gems.
--   Single source: src/data/collection-milestones.js; bound three ways by
--   tests/collection-renown-claim-drift.mjs (which reads THIS file as the chain
--   end — the last file in tests/schema-apply-order.json `order` that restates
--   the function).
--
-- WHAT IT DOES NOT TOUCH, deliberately:
--   · the wrapper hr_claim_milestone — its LIVE body routes the result through
--     hr_note_rejection (the 2026-09-12 rejections journal); restating it from
--     2026-08-22 §5 would silently delete the refusal journal. §4(d) proves by
--     EXECUTION that the wrapper still journals.
--   · hr_rpc_gate, player_ledger_kind_check, hr_client_rpc_baseline, grants on
--     the wrapper.
--   · No body is read back (no pg_get_functiondef / prosrc): live-hash-drift's
--     pin rule stays off this function, so no re-measure is owed.
--
-- RESIDUAL (accepted, out of scope, its own lane C): the bounty-branch
-- distinct-monster mint (hr_accept_bounty__ungated + hr_credit_kills__ungated
-- have no active_id check). Journalled; detection query: count(distinct
-- target) > 6 per character per day from hr_kill_credit_log where not free.
--
-- REVERSIBILITY: re-apply 2026-08-22-collection-claim.sql §4 (the 4-arm body)
-- and the same revoke. Already-paid claims stay paid (ledgered). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_claim_milestone(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_milestone(text,int) missing — apply 2026-08-22-collection-claim.sql first'; end if;
  if to_regprocedure('public.hr_claim_milestone__ungated(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_milestone__ungated(text,int) missing — apply 2026-08-22-collection-claim.sql first'; end if;
  if to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_bestiary_of(uuid,int) missing — apply 2026-08-20-bestiary.sql first'; end if;
  if to_regprocedure('public.hr_collection_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_collection_of(uuid,int) missing — apply 2026-08-21-collection.sql first'; end if;
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'PRECONDITION: hr_note_rejection(text,int,jsonb) missing — apply 2026-09-12-hr-rejections-journal.sql first'; end if;
end $$;

-- ── 1. hr_claim_milestone__ungated — 2026-08-22 §4 verbatim, 11 CASE arms ──
create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_domain text;
  v_thresh bigint;
  v_gold   bigint;
  v_gems   int;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/collection-milestones.js).
  -- hunterAll's threshold is the monster-catalogue size (drift-guarded).
  case p_milestone_id
    when 'hunter10'   then v_domain := 'monsters'; v_thresh := 10;  v_gold := 2000;  v_gems := 0;
    when 'hunter25'   then v_domain := 'monsters'; v_thresh := 25;  v_gold := 4000;  v_gems := 0;
    when 'hunter40'   then v_domain := 'monsters'; v_thresh := 40;  v_gold := 8000;  v_gems := 0;
    when 'hunter60'   then v_domain := 'monsters'; v_thresh := 60;  v_gold := 15000; v_gems := 0;
    when 'hunter85'   then v_domain := 'monsters'; v_thresh := 85;  v_gold := 25000; v_gems := 0;
    when 'hunterAll'  then v_domain := 'monsters'; v_thresh := 108; v_gold := 50000; v_gems := 25;
    when 'collect25'  then v_domain := 'items';    v_thresh := 25;  v_gold := 1000;  v_gems := 0;
    when 'collect50'  then v_domain := 'items';    v_thresh := 50;  v_gold := 5000;  v_gems := 0;
    when 'collect75'  then v_domain := 'items';    v_thresh := 75;  v_gold := 10000; v_gems := 0;
    when 'collect100' then v_domain := 'items';    v_thresh := 100; v_gold := 15000; v_gems := 15;
    when 'collect125' then v_domain := 'items';    v_thresh := 125; v_gold := 30000; v_gems := 0;
    else return jsonb_build_object('ok', false, 'error', 'unknown_milestone', 'milestone', p_milestone_id);
  end case;

  -- VERIFY completion from the server's OWN per-entry projection (DISTINCT count).
  if v_domain = 'monsters' then
    select count(*) into v_have from public.hr_bestiary_of(auth.uid(), v_slot);
  else
    select count(*) into v_have from public.hr_collection_of(auth.uid(), v_slot);
  end if;
  if coalesce(v_have, 0) < v_thresh then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'milestone', p_milestone_id, 'have', coalesce(v_have, 0), 'goal', v_thresh, 'domain', v_domain);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'collection', p_milestone_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'milestone', p_milestone_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'gems', v_gems));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'gems', v_gems, 'slot', v_slot, 'credited', true);
end $$;

revoke execute on function public.hr_claim_milestone__ungated(text, int) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK — every property proven by EXECUTION ─────────────────────
-- One discarded subtransaction (HR847) with a synthetic uid; then a zero-leak
-- check. player_ledger's retention guard refuses DELETE of a fresh row, so the
-- subtransaction rollback is the only clean teardown (2026-08-22 §6 gate(c)).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000000027c1';
  v_slot constant int  := 0;
  v_alt  constant int  := 1;
  r      record;
  v_g0 bigint; v_g1 bigint; v_gm0 bigint; v_gm1 bigint;
  v_ok   int := 0;
  v_led  int;
  v_n    int;
begin
  -- (a) GRANTS. The inner is callable by no client role; the wrapper by
  --     authenticated only.
  if has_function_privilege('authenticated', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_claim_milestone__ungated(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): hr_claim_milestone__ungated is client-executable — the rate gate and the refusal journal are bypassable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): the claim wrapper is anon-executable';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1), (v_uid, v_alt, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- (c) DISTINCT, not summed qty: two ids with qty 40 and 12 are 2 distinct.
    --     On the ALT slot so it cannot perturb the catalogue walk below.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state) values
      (v_uid, v_alt, 'stat', 'ev:loot:oak_log', 40, '', 'active'),
      (v_uid, v_alt, 'stat', 'ev:loot:coal',    12, '', 'active');
    v := public.hr_claim_milestone__ungated('collect25', v_alt);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'have')::int <> 2 then
      raise exception 'SELF-CHECK(c): collect25 read % (expected incomplete, have 2) — the count is not DISTINCT: %', v->>'have', v;
    end if;

    -- (b) THE WHOLE CATALOGUE, walked per domain in ascending thresholds.
    for r in
      select * from (values
        ('hunter10',   'monsters', 10,  2000::bigint,  0),
        ('hunter25',   'monsters', 25,  4000::bigint,  0),
        ('hunter40',   'monsters', 40,  8000::bigint,  0),
        ('hunter60',   'monsters', 60,  15000::bigint, 0),
        ('hunter85',   'monsters', 85,  25000::bigint, 0),
        ('hunterAll',  'monsters', 108, 50000::bigint, 25),
        ('collect25',  'items',    25,  1000::bigint,  0),
        ('collect50',  'items',    50,  5000::bigint,  0),
        ('collect75',  'items',    75,  10000::bigint, 0),
        ('collect100', 'items',    100, 15000::bigint, 15),
        ('collect125', 'items',    125, 30000::bigint, 0)
      ) as t(id, domain, thresh, gold, gems)
      order by domain, thresh
    loop
      -- seed DISTINCT rows 1..thresh-1 (idempotent: rows already seeded stay)
      insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
        select v_uid, v_slot, 'stat',
               case when r.domain = 'monsters' then 'ev:kill_monster:m' else 'ev:loot:i' end || g::text,
               1, '', 'active'
          from generate_series(1, r.thresh - 1) g
        on conflict (user_id, slot, kind, key, period_key) do nothing;
      v := public.hr_claim_milestone__ungated(r.id, v_slot);
      if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'goal')::int <> r.thresh
         or (v->>'have')::int <> r.thresh - 1 then
        raise exception 'SELF-CHECK(b): % at % distinct was not refused incomplete with goal %: %', r.id, r.thresh - 1, r.thresh, v;
      end if;

      -- the threshold-th distinct row → the claim pays EXACTLY the catalogue
      insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
        values (v_uid, v_slot, 'stat',
                case when r.domain = 'monsters' then 'ev:kill_monster:m' else 'ev:loot:i' end || r.thresh::text,
                1, '', 'active')
        on conflict (user_id, slot, kind, key, period_key) do nothing;
      select gold, gems into v_g0, v_gm0 from public.player_state where user_id = v_uid and slot = v_slot;
      v := public.hr_claim_milestone__ungated(r.id, v_slot);
      if coalesce(v->>'ok', '') <> 'true' then
        raise exception 'SELF-CHECK(b): % at % distinct did not credit: %', r.id, r.thresh, v;
      end if;
      v_ok := v_ok + 1;
      select gold, gems into v_g1, v_gm1 from public.player_state where user_id = v_uid and slot = v_slot;
      if v_g1 - v_g0 <> r.gold or v_gm1 - v_gm0 <> r.gems then
        raise exception 'SELF-CHECK(b): % credited % gold / % gems, catalogue says % / %',
          r.id, v_g1 - v_g0, v_gm1 - v_gm0, r.gold, r.gems;
      end if;

      -- replay → already_claimed, balance unchanged
      v := public.hr_claim_milestone__ungated(r.id, v_slot);
      if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
        raise exception 'SELF-CHECK(b): % replay was not refused already_claimed: %', r.id, v;
      end if;
      select gold, gems into v_g0, v_gm0 from public.player_state where user_id = v_uid and slot = v_slot;
      if v_g0 <> v_g1 or v_gm0 <> v_gm1 then
        raise exception 'SELF-CHECK(b): % replay RE-CREDITED (% -> % gold)', r.id, v_g1, v_g0;
      end if;
    end loop;
    if v_ok <> 11 then
      raise exception 'SELF-CHECK(b): walked % ok claims, expected 11', v_ok;
    end if;

    -- (d) THE WRAPPER still journals refusals (hr_note_rejection is live on it).
    v := public.hr_claim_milestone('no_such_milestone', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_milestone' then
      raise exception 'SELF-CHECK(d): the wrapper did not refuse an unknown milestone: %', v;
    end if;
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    if v_n < 1 then
      raise exception 'SELF-CHECK(d): an unknown-milestone refusal through the wrapper wrote NO hr_rejections row — the refusal journal is gone';
    end if;

    -- (e) exactly one collection ledger row per ok claim.
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'collection';
    if v_led <> v_ok then
      raise exception 'SELF-CHECK(e): % collection ledger rows for % ok claims', v_led, v_ok;
    end if;

    raise exception using errcode = 'HR847', message = 'ledger-of-firsts §4 complete — rolling back';
  exception when sqlstate 'HR847' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ZERO LEAK.
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.hr_rejections   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'SELF-CHECK: §4 LEAKED a probe row';
  end if;

  -- (f) grant hygiene: nothing unapproved, nothing ungated.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'SELF-CHECK(f): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'SELF-CHECK(f): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  else
    raise exception 'SELF-CHECK(f): hr_assert_grant_hygiene(boolean) is absent — cannot prove grant hygiene';
  end if;

  raise notice 'ledger-of-firsts: 11 arms walked (incomplete→ok→already_claimed, exact gold/gems), DISTINCT count, '
               'wrapper journals refusals, 11 ledger rows, grants + hygiene green, zero leak';
end $$;
