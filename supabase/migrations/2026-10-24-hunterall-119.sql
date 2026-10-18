-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — "BESTIARY MASTER" COUNTS THE SEWER — hunterAll 113 -> 119
-- (lane S1 with the sewer content merge, 2026-10-18). STAGED. Game CLOSED:
-- applies on its passing §4 (CLAUDE.md §2); Security reviews it at the reopen gate.
--
-- hunterAll ("slay every monster") is the monster-catalogue SIZE, bound by
-- tests/collection-renown-claim-drift.mjs (src/data/collection-milestones.js
-- MONSTER_TOTAL and the CHAIN-END restatement of this function — now THIS
-- file). Six Sewer monsters joined the roster (2026-10-24-sewer-catalogue.
-- generated.sql), so the threshold rises with them. The body is the
-- 2026-10-16-w0f-fun-content.sql restatement VERBATIM (§0 pins it); the ONLY
-- change is the hunterAll arm's v_thresh, 113 -> 119. RAISE-ONLY: the reward is
-- unchanged and harder to reach; a character who already claimed it keeps it.
-- live-hash-drift: re-measured by the Coordinator after the apply.
-- REVERSIBILITY: restate the 2026-10-16-w0f-fun-content.sql §3 body (the 113 body).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.hr_claim_milestone(text,integer)') is null
     or to_regprocedure('public.hr_claim_milestone__ungated(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_milestone(+__ungated) missing — apply 2026-09-27-ledger-of-firsts.sql first'; end if;
  if to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_bestiary_of(uuid,int) missing'; end if;
  -- b570 bundle: restated from the ACCOUNT-WALLET post-image (gems credit the
  -- wallet once per account, 'milestone:<id>'), never from ledger-of-firsts,
  -- whose body writes player_state.gems — a column the wallet drops.
  if to_regprocedure('public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: hr_wallet_credit missing — apply 2026-10-19-account-wallet.sql first'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.hr_claim_milestone__ungated(text,integer)'))
     not in ('1e71e9e68d6efe753c17279a214088c3', '46f633c19006e941a80ecf8ca349a0c0') then
    raise exception 'hunterall-119 §0: hr_claim_milestone__ungated is not the w0f post-image (or this file''s) — another lane moved it; restate from that body instead'; end if;
end $$;

create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
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
    when 'hunterAll'  then v_domain := 'monsters'; v_thresh := 119; v_gold := 50000; v_gems := 25;
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
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT (2026-10-19-account-wallet.sql).
  --   The grant key 'milestone:<id>' is the account's, not this character's: a second
  --   character claiming the same reward is paid its gold and NO gems (paid 0).
  --   v_gems becomes what the wallet actually paid, so the journal and the
  --   receipt below can never claim gems that did not land.
  if v_gems > 0 then
    v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'milestone:' || p_milestone_id, null) ->> 'paid')::int;
  end if;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'gems_paid', v_gems));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'gems', v_gems, 'slot', v_slot, 'credited', true);
end $$;
revoke execute on function public.hr_claim_milestone__ungated(text, integer)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK for §3 — proven by EXECUTION ─────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5660f19';
  v_slot constant int  := 0;
  v_g0 bigint; v_g1 bigint; v_gm0 bigint; v_gm1 bigint; v_msg text;
begin
  -- (a) GRANTS unchanged: the inner is callable by no client role.
  if has_function_privilege('authenticated', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_claim_milestone__ungated(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): hr_claim_milestone__ungated is client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunterall-119 §4 probe') on conflict (user_id) do nothing;
    insert into public.player_state (user_id, slot, gold, version)
      values (v_uid, v_slot, 1000, 1)
      on conflict (user_id, slot) do update set gold = 1000;
    -- 118 distinct kills: the OLD threshold would have paid at 113; the new one refuses.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:m' || g::text, 1, '', 'active'
        from generate_series(1, 118) g;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'goal')::int <> 119
       or (v->>'have')::int <> 118 then
      raise exception 'SELF-CHECK(b): hunterAll at 118 distinct was not refused incomplete with goal 119: %', v;
    end if;
    -- CONTROL: an unchanged arm still pays at its own threshold.
    v := public.hr_claim_milestone__ungated('hunter85', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gold')::bigint <> 25000 then
      raise exception 'SELF-CHECK(b) CONTROL: hunter85 at 118 distinct did not pay 25000: %', v;
    end if;
    -- the 119th distinct kill passes the threshold and reaches the gem credit,
    -- which REFUSES while gems are retired (2026-10-23-demolition-bounty-gems-close.sql
    -- K37): the whole claim rolls back — no gold, no once-guard row — exactly as
    -- every gem-paying claim does in the beta.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:m119', 1, '', 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;

    begin
      v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    exception when sqlstate 'HR000' then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg is distinct from 'gems_retired' then
      raise exception 'SELF-CHECK(c): hunterAll at 119 distinct did not reach the (retired) gem credit: % / %', v_msg, v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 <> v_g0 or exists (select 1 from public.player_progress where user_id = v_uid and kind = 'collection' and key = 'hunterAll') then
      raise exception 'SELF-CHECK(c): a refused hunterAll claim left gold (% -> %) or its once-guard row', v_g0, v_g1;
    end if;
    -- the wrapper still journals a refusal.
    v := public.hr_claim_milestone('no_such_milestone', v_slot);
    if v->>'ok' <> 'false' or not exists (select 1 from public.hr_rejections where user_id = v_uid) then
      raise exception 'SELF-CHECK(d): the wrapper no longer journals refusals: %', v;
    end if;

    raise exception using errcode = 'HR861', message = 'hunterall-119 §4 complete — rolling back';
  exception when sqlstate 'HR861' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.hr_rejections   where user_id = v_uid)
     or exists (select 1 from public.account_wallet  where user_id = v_uid)
     or exists (select 1 from public.account_gem_grants where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'SELF-CHECK: §4 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
         or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'SELF-CHECK(e): grant hygiene is red: %', v_gh;
      end if;
    end;
  else
    raise exception 'SELF-CHECK(e): hr_assert_grant_hygiene(boolean) is absent';
  end if;

  raise notice 'hunterall-119: hunterAll refuses 118 incomplete and at 119 reaches the retired gem credit, rolled back whole; '
               'hunter85 unchanged; wrapper journals; grants + hygiene green; zero leak';
end $$;
