-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-19-absence-claim-wallet.sql — THE ABSENCE CLAIM PAYS ITS GEM INTO
--   THE ACCOUNT WALLET (Security F1 on lane/c-account-wallet).
--
-- STATUS: STAGED, NOT APPLIED — Security review required (gems are a money
-- surface). Lane C, b570 bundle. The Coordinator applies (tools/apply-
-- migration.mjs, one file, never inside begin/commit, never 00:00–00:10 UTC).
-- No edge half. No client contract change: the receipt keeps `gold` and
-- `gems` (now what the wallet PAID) and gains `gems_paid`.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   Security F1: production's world_event_absence_claim__ungated told players
--   "750 gold + 1 gem" and credited neither. 2026-10-10-quest-xp-absence-pay.sql
--   makes the claim credit both on the pledge's CHARACTER (char_slot, never
--   world_event_pledges.slot, which is the rally WINDOW) — but it credits the
--   gem to player_state.gems, and 2026-10-19-account-wallet.sql DROPS that
--   column (§6). Left alone, every absence claim after the wallet would raise
--   at runtime (plpgsql resolves the column on first execution, not at apply).
--   This file restates that body with ONE money change: the gem goes through
--   the wallet's choke point, once per ACCOUNT per rally day.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §0 Preconditions + pin: the wallet is applied (account_wallet, the credit
--    helper, player_state.gems gone) and the absence body is EXACTLY the
--    quest-xp-absence-pay post-image (527a6a3c64fcdb2a3b85494d630cc924) or this file's own
--    (cd5db943aa1d3a1120a4991803b21c0c). Anything else: refuse, never clobber.
-- §1 world_event_absence_claim__ungated(text), restated from that post-image.
--    The ONLY deltas: (1) the player_state update no longer names gems;
--    (2) after it, hr_wallet_credit(uid, char_slot, v_gems_out,
--    'world_event_absence:' || day_key, now() + 3 days) and v_gems_out := the
--    wallet's `paid`; (3) the claim's ledger row carries gems_in 0 and
--    meta.gems_paid (the wallet's kind='wallet' row carries the inflow —
--    2026-10-19-account-wallet.sql's ledger convention); (4) the receipt adds
--    gems_paid. Gold, XP, items, the settle, the zero-play expiry, the
--    char_slot target and the pre-settle day-budget check are byte-identical.
--    Owner-only ACL restated (revoke from public, anon, authenticated,
--    service_role); the wrapper world_event_absence_claim is not restated.
-- §2 Self-check, EXECUTED, rolled back (HR872 sentinel): grants; body shape;
--    an ATTENDED claim through the real rate-gated wrapper on a closed prior
--    day — gold delta = receipt gold > 0 on char_slot, wallet delta = receipt
--    gems_paid = 1, the decoy character in slot 1 (the WINDOW number) and a
--    bystander account unmoved, ONE claim row (gems_in 0, meta.gems_paid) and
--    ONE kind='wallet' row (gems_in = gems_paid); replay refused and moves
--    nothing; a second character of the same account claiming the same day is
--    paid its gold and 0 gems. Zero leak, grant hygiene green.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Unchanged settle: the conditional flip of world_event_pledges.settled is
--   the once-guard (row_count 0 = a replay already took it). The wallet credit
--   runs AFTER it in the same transaction and takes the wallet row lock (the
--   house LEAF lock: nothing is locked after it, so no cycle with hr_apply on
--   the same account). The grant key is checked and inserted under that lock.
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   A replayed claim is refused by the settle flip before any credit; a
--   second credit on the same key pays 0 (account_gem_grants PK). Re-applying
--   this file: §0 accepts its own post-image; §1 is an identical
--   create-or-replace; §2 rolls back. Byte-identical second apply.
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +0 client RPCs, +0 grants. The gem can no longer be minted per character
--   (one key per account per day), and it now counts against the ACCOUNT gem
--   day cap inside hr_wallet_credit as well as the pre-settle check.
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   +1 player_ledger row (kind='wallet') and +1 account_gem_grants key per
--   paid absence claim — at most one per account per rally day; the key
--   expires after 3 days and is pruned by the account's next credit.
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Restate the quest-xp-absence-pay body (pinned above by md5) — but that
--   body names player_state.gems, so the way back from the wallet is the
--   wallet's own forward migration, never this file alone.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants world_event_absence_claim__ungated.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PIN — FAIL CLOSED ─────────────────────────────────
do $$
declare v_md5 text;
begin
  if to_regclass('public.account_wallet') is null or to_regclass('public.account_gem_grants') is null
     or to_regprocedure('public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the account wallet is absent — apply 2026-10-19-account-wallet.sql first';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'player_state' and column_name = 'gems') then
    raise exception 'PRECONDITION: player_state.gems still exists — the wallet''s §6 has not run';
  end if;
  if to_regprocedure('public.world_event_absence_claim(text)') is null then
    raise exception 'PRECONDITION: the world_event_absence_claim wrapper is absent';
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.world_event_absence_claim__ungated(text)'));
  if v_md5 is null or v_md5 not in ('527a6a3c64fcdb2a3b85494d630cc924', 'cd5db943aa1d3a1120a4991803b21c0c') then
    raise exception 'absence-claim-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.world_event_absence_claim__ungated(text)', v_md5;
  end if;
end $$;

-- ── §1 THE ABSENCE CLAIM, RESTATED (gem -> the account wallet) ──────────────
create or replace function public.world_event_absence_claim__ungated(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
  v_chest   jsonb;
  v_it      jsonb;
  v_iid     text;
  v_iqty    bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
  v_cs       int;     -- the pledge's CHARACTER slot (char_slot), never its window
  -- gold/gem credit locals (2026-10-10-quest-xp-absence-pay.sql)
  v_gold_out bigint;
  v_gems_out int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1 — while the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2 — the join primary key. They were there; the live chest was their
  -- reward and the pledge closes paying nothing.
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
  end if;
  if v_joined then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  -- THE CREDIT TARGET IS world_event_pledges.char_slot — the CHARACTER the
  -- server recorded at pledge time — NEVER world_event_pledges.slot, which is
  -- the rally WINDOW (1 or 13; Security block on b567 @4968b813: crediting
  -- `slot` refused every #13 pledge and paid whoever sat in character slot 1
  -- for every #1 pledge). A pledge without one, or whose character is gone,
  -- is refused BEFORE the settle, so it stays owed and nothing moves.
  v_cs := v_p.char_slot;
  if v_cs is null
     or not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_cs) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_cs);
  end if;

  -- ── THE ZERO-PLAY FAUCET IS CLOSED (Coordinator ruling, 2026-10-11, ahead of
  --    the Steam EA sign-ups). Half honours pay only a character the SERVER saw
  --    play on the rally's UTC day: a non-tick ledger row for (uid, char_slot)
  --    inside [day, day + 1) — an attended intent, a settled accrual window, a
  --    claim. World-tick rows (meta.src = 'tick') are the server paying an
  --    absent character, not the player showing up; 'admin' rows (character
  --    creation, operator writes) are not play; and an absence claim is never
  --    its own evidence. Pledging and never playing pays nothing: the
  --    pledge EXPIRES (settled, outcome 'expired', gold/gems 0) and is
  --    journalled with one zero-value rally row. Served by player_ledger_user_idx
  --    (user_id, slot, at desc).
  if not exists (select 1 from public.player_ledger l
                  where l.user_id = auth.uid() and l.slot = v_cs
                    and l.at >= (v_day::timestamp at time zone 'utc')
                    and l.at <  ((v_day + 1)::timestamp at time zone 'utc')
                    and l.kind <> 'admin'
                    and coalesce(l.meta->>'src', '') <> 'tick'
                    and not (l.kind = 'rally' and l.intent like 'world_event_absence%')) then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'expired', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object('ok', false, 'error', 'already_settled');
    end if;
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (auth.uid(), v_cs, 'rally', 'world_event_absence_expired:' || v_day_key, 0, 0, 0, 0, 0,
       jsonb_build_object('band', 'expired', 'reason', 'no_activity', 'day_key', v_day_key,
                          'event_key', v_p.event_key, 'window', v_p.slot));
    return jsonb_build_object('ok', false, 'error', 'no_activity', 'day_key', v_day_key, 'slot', v_cs);
  end if;

  -- ── THE THEMED CHEST, priced BEFORE the settle (pure), and its XP checked
  --    against the ONE day budget, so a refusal spends nothing.
  v_chest    := public.hr_rally_chest(v_p.event_key, c_gold, c_gems, 0);
  -- The gold and gems the chest leaves after its item/XP share, clamped to the
  -- absence band (the existing caps): a chest can never pay more than the band.
  v_gold_out := least(greatest(coalesce((v_chest->>'gold')::bigint, c_gold), 0), c_gold);
  v_gems_out := least(greatest(coalesce((v_chest->>'gems')::int,    c_gems), 0), c_gems);
  v_xc       := public.hr_rally_xp_credit(v_p.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  -- Security GO-WITH-CHANGES (1): gold, XP AND gems are checked against the ONE
  -- day budget on the pledge's CHARACTER, before the settle — a refusal spends
  -- nothing and the pledge stays owed.
  v_bud := public.hr_day_budget_check(auth.uid(), v_cs, v_gold_out, v_xp_total, 0, v_gems_out);
  if v_bud is not null then
    return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_cs);
  end if;

  -- ── THE SETTLE. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- ── THE XP (after the settle guard → exactly once). Own row only.
  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_cs, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  -- ── THE ITEMS (after the settle guard → exactly once). Written to
  --    player_inventory — the source of truth the accrual absolute envelope is
  --    built FROM. Same transaction as the settle; additive upsert, scoped to the
  --    caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_cs, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  -- ── THE GOLD (after the settle guard → exactly once), on the pledge's
  --    CHARACTER (v_cs), own row only, same transaction as the settle. The
  --    version moves, so a held envelope is stale and the next read carries
  --    the absolute gold/skills/inventory.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_cs;

  -- ── THE GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT PER RALLY DAY
  --    (2026-10-19-account-wallet.sql). The grant key is the account's, so the
  --    gem cannot be paid twice whichever character pledged; v_gems_out becomes
  --    what the wallet actually PAID, so the journal and the receipt below can
  --    never claim a gem that did not land. The wallet's own kind='wallet' row
  --    carries the inflow (gems_in); this claim row only echoes gems_paid.
  if v_gems_out > 0 then
    v_gems_out := (public.hr_wallet_credit(auth.uid(), v_cs, v_gems_out,
                     'world_event_absence:' || v_day_key, now() + interval '3 days') ->> 'paid')::int;
  end if;

  -- ── JOURNAL. `gold` and gold_in are the credited gold, xp_in the credited
  --    XP, meta.gems_paid the gems the WALLET paid (its kind='wallet' row holds
  --    gems_in — the ledger convention: only wallet rows carry meta.gems).
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_cs, 'rally', 'world_event_absence_claim:' || v_day_key,
     v_gold_out, v_gold_out, v_xp_total, 0, 0,
     jsonb_build_object('band', 'absent', 'day_key', v_day_key,
                        'event_key', v_p.event_key, 'window', v_p.slot, 'gems_paid', v_gems_out, 'absence_gold', c_gold,
                        'absence_gems', c_gems, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_cs, 'window', v_p.slot,
    'gold', v_gold_out, 'gems', v_gems_out, 'gems_paid', v_gems_out, 'band_gold', c_gold, 'band_gems', c_gems,
    'seals', 0, 'credited', true,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'chest', v_chest);
end $$;
revoke execute on function public.world_event_absence_claim__ungated(text) from public;
revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;

-- ── §2 SELF-CHECK — EXECUTED, ROLLED BACK ──────────────────────────────────
do $$
declare
  v_a     constant uuid := '00000000-0000-4000-8000-0000b5700a01';   -- the claimant
  v_b     constant uuid := '00000000-0000-4000-8000-0000b5700a02';   -- a bystander account
  v_pday  date := (now() at time zone 'utc')::date - 1;              -- a CLOSED prior day
  v_pdk   text;
  v_ek    text;
  v_d     date;
  v_h     int;
  v_k     text;
  v_r     jsonb;
  v_src   text;
  v_g0    bigint; v_g1 bigint; v_w0 bigint; v_w1 bigint;
  v_wb0   bigint; v_wb1 bigint; v_gd0 bigint; v_gd1 bigint;
  v_n0    bigint; v_n1 bigint; v_nw0 bigint; v_nw1 bigint;
  v_led   record;
begin
  -- (a) GRANTS: the inner is owner-only; the wrapper is the player's door.
  if has_function_privilege('authenticated', 'public.world_event_absence_claim__ungated(text)', 'execute')
     or has_function_privilege('anon', 'public.world_event_absence_claim__ungated(text)', 'execute')
     or has_function_privilege('service_role', 'public.world_event_absence_claim__ungated(text)', 'execute') then
    raise exception 'absence-claim-wallet §2(a): the inner is client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.world_event_absence_claim(text)', 'execute')
     or has_function_privilege('anon', 'public.world_event_absence_claim(text)', 'execute') then
    raise exception 'absence-claim-wallet §2(a): the wrapper is not authenticated-only';
  end if;

  -- (b) BODY SHAPE: no player_state gem write; the credit names the account
  --     key on the pledge's CHARACTER.
  select prosrc into v_src from pg_proc where oid = 'public.world_event_absence_claim__ungated(text)'::regprocedure;
  if v_src ~ 'gems\s*=\s*coalesce\(gems' then
    raise exception 'absence-claim-wallet §2(b): the body still writes player_state.gems';
  end if;
  if strpos(v_src, 'public.hr_wallet_credit(auth.uid(), v_cs, v_gems_out,') = 0
     or strpos(v_src, '''world_event_absence:'' || v_day_key') = 0 then
    raise exception 'absence-claim-wallet §2(b): the gem is not credited through the wallet on char_slot';
  end if;

  -- an event key for the probe (deterministic search, any theme)
  for v_d in select generate_series((now() at time zone 'utc')::date - 60, (now() at time zone 'utc')::date, interval '1 day')::date loop
    foreach v_h in array array[1, 13] loop
      v_k := public.hr_utc_day_key((v_d + interval '12 hours') at time zone 'utc') || '#' || v_h;
      if v_ek is null and public.hr_rally_event_for_key(v_k) is not null then v_ek := v_k; end if;
    end loop;
    exit when v_ek is not null;
  end loop;
  if v_ek is null then raise exception 'absence-claim-wallet §2 CANNOT RUN: no rally event key in 60 days'; end if;

  begin  -- ── SUBTRANSACTION, discarded by the HR872 sentinel ─────────────────
    insert into auth.users (id) values (v_a), (v_b);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'absence-claim-wallet §2: no bystander character: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'absence-claim-wallet §2: no probe character: %', v_r; end if;

    v_pdk := public.hr_utc_day_key(((public.hr_rally_day(to_char(v_pday, 'YYYY-MM-DD'))) + interval '12 hours') at time zone 'utc');
    if public.hr_rally_day_close(v_pdk) is null or now() < public.hr_rally_day_close(v_pdk) then
      raise exception 'absence-claim-wallet §2 CANNOT RUN: prior day % is not closed', v_pdk;
    end if;
    -- A DECOY character in slot 1 (the number a '#1' WINDOW names) and slot 2
    -- (the same account's second hero for the once-per-account arm).
    insert into public.player_state (user_id, slot, gold, version) values (v_a, 1, 0, 1), (v_a, 2, 0, 1);
    -- the evidence of play the zero-play rule asks for, on char_slot 0
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
      values (v_a, 0, 'accrue', 'absence-wallet-probe-play', 0, 0, 0, 0, 0, '{}'::jsonb,
              (v_pday::timestamp at time zone 'utc') + interval '7 hours');
    insert into public.world_event_pledges (day_key, user_id, event_key, slot, char_slot, settled)
      values (v_pdk, v_a, v_ek, split_part(v_ek, '#', 2)::int, 0, false);

    -- (c) THE ATTENDED CLAIM, through the real wrapper.
    select gold into v_g0 from public.player_state where user_id = v_a and slot = 0;
    select gold into v_gd0 from public.player_state where user_id = v_a and slot = 1;
    v_w0  := coalesce((select gems from public.account_wallet where user_id = v_a), 0);
    v_wb0 := coalesce((select gems from public.account_wallet where user_id = v_b), 0);
    select count(*) into v_n0 from public.player_ledger where user_id = v_a and kind = 'rally';
    select count(*) into v_nw0 from public.player_ledger where user_id = v_a and kind = 'wallet';
    v_r := public.world_event_absence_claim(to_char(v_pday, 'YYYY-MM-DD'));
    if coalesce(v_r->>'ok', '') <> 'true' or v_r->>'credited' <> 'true' then
      raise exception 'absence-claim-wallet §2(c): the attended claim did not pay: %', v_r;
    end if;
    if coalesce((v_r->>'gold')::bigint, 0) <= 0 or coalesce((v_r->>'gems_paid')::bigint, -1) <> 1
       or (v_r->>'gems')::bigint <> (v_r->>'gems_paid')::bigint then
      raise exception 'absence-claim-wallet §2(c) CONTROL: the receipt is not gold > 0 and exactly 1 gem paid: %', v_r;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_a and slot = 0;
    v_w1 := coalesce((select gems from public.account_wallet where user_id = v_a), 0);
    if v_g1 - v_g0 <> (v_r->>'gold')::bigint then
      raise exception 'absence-claim-wallet §2(c): gold moved +% on char_slot 0, the receipt says %', v_g1 - v_g0, v_r->>'gold';
    end if;
    if v_w1 - v_w0 <> (v_r->>'gems_paid')::bigint then
      raise exception 'absence-claim-wallet §2(c): the wallet moved +%, the receipt says gems_paid %', v_w1 - v_w0, v_r->>'gems_paid';
    end if;
    select gold into v_gd1 from public.player_state where user_id = v_a and slot = 1;
    v_wb1 := coalesce((select gems from public.account_wallet where user_id = v_b), 0);
    if v_gd1 <> v_gd0 or v_wb1 <> v_wb0 then
      raise exception 'absence-claim-wallet §2(c): the decoy slot 1 or the bystander account moved';
    end if;
    select gold, gold_in, gems_in, meta into v_led from public.player_ledger
     where user_id = v_a and kind = 'rally' and intent = 'world_event_absence_claim:' || v_pdk;
    select count(*) into v_n1 from public.player_ledger where user_id = v_a and kind = 'rally';
    select count(*) into v_nw1 from public.player_ledger where user_id = v_a and kind = 'wallet';
    if v_n1 <> v_n0 + 1 or v_led.gold_in <> (v_r->>'gold')::bigint or v_led.gems_in <> 0
       or (v_led.meta->>'gems_paid')::bigint <> 1 or v_led.meta ? 'gems' then
      raise exception 'absence-claim-wallet §2(c): the claim row is not one row with gold_in = gold, gems_in 0, meta.gems_paid 1 and no meta.gems (% rows, %)',
        v_n1 - v_n0, row_to_json(v_led);
    end if;
    if v_nw1 <> v_nw0 + 1 or (select gems_in from public.player_ledger
                               where user_id = v_a and kind = 'wallet' order by id desc limit 1) <> 1 then
      raise exception 'absence-claim-wallet §2(c): the wallet did not journal exactly one inflow of 1 gem';
    end if;

    -- (d) REPLAY: refused by the settle, nothing moves.
    v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
    if coalesce(v_r->>'error', '') <> 'already_settled'
       or (select gold from public.player_state where user_id = v_a and slot = 0) <> v_g1
       or coalesce((select gems from public.account_wallet where user_id = v_a), 0) <> v_w1 then
      raise exception 'absence-claim-wallet §2(d): the replay was not refused or moved value: %', v_r;
    end if;

    -- (e) ONCE PER ACCOUNT: the same day pledged again for the account's second
    --     character (slot 2) pays that character its gold and 0 gems.
    delete from public.world_event_pledges where user_id = v_a;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
      values (v_a, 2, 'accrue', 'absence-wallet-probe-play', 0, 0, 0, 0, 0, '{}'::jsonb,
              (v_pday::timestamp at time zone 'utc') + interval '7 hours');
    insert into public.world_event_pledges (day_key, user_id, event_key, slot, char_slot, settled)
      values (v_pdk, v_a, v_ek, split_part(v_ek, '#', 2)::int, 2, false);
    v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'gems_paid')::bigint <> 0 or (v_r->>'gems')::bigint <> 0
       or (select gold from public.player_state where user_id = v_a and slot = 2) <> (v_r->>'gold')::bigint
       or coalesce((select gems from public.account_wallet where user_id = v_a), 0) <> v_w1 then
      raise exception 'absence-claim-wallet §2(e): a second character of the account was paid a second gem: %', v_r;
    end if;

    raise exception using errcode = 'HR872', message = 'absence-claim-wallet §2 complete — rolling back';
  exception when sqlstate 'HR872' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF — the probe left nothing behind (CLAUDE.md §2).
  if exists (select 1 from public.player_state        where user_id in (v_a, v_b))
     or exists (select 1 from public.player_skills    where user_id in (v_a, v_b))
     or exists (select 1 from public.player_inventory where user_id in (v_a, v_b))
     or exists (select 1 from public.player_ledger    where user_id in (v_a, v_b))
     or exists (select 1 from public.account_wallet   where user_id in (v_a, v_b))
     or exists (select 1 from public.account_gem_grants where user_id in (v_a, v_b))
     or exists (select 1 from public.world_event_pledges where user_id in (v_a, v_b))
     or exists (select 1 from auth.users              where id in (v_a, v_b)) then
    raise exception 'absence-claim-wallet §2: LEAKED a probe row';
  end if;

  perform public.hr_assert_grant_hygiene(true);

  raise notice 'absence-claim-wallet: the absence claim pays gold on char_slot and 1 gem into the account wallet '
               '(delta = receipt, one claim row + one wallet row, replay refused, once per account) on %', v_ek;
end $$;
