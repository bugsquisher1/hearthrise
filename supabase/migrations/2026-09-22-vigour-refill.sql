-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-22-vigour-refill.sql — THE GOLD SINK. MONEY MOVES IN THIS FILE.
--
-- docs/design/HUNTS_AND_ANALYZER.md §4.4. +120 paid minutes per refill, bought
-- with GOLD AND ONLY GOLD, at a price that TRIPLES within the UTC day, at most
-- five a day, and never past the 22-hour daily ceiling.
--
-- ⚠ CLAUDE.md §2: THIS FILE MOVES GOLD. It does not apply without a Security GO
--   from the security-engineer role, and the four figures below are the ONE
--   item docs/design/HUNTS_AND_ANALYZER.md §4.6 flags for TYLER:
--     · the 2,000-gold opening price      · the x3 escalation
--     · the 5-refill daily cap            · VIGOUR_DRY_MULT (0.25 or 0.00)
--   They ship here as the DESIGNER'S PLACEHOLDERS IN A SERVER CATALOGUE ROW
--   (hr_vigour_prices), never as literals inside the verb, so Tyler's answer is
--   an UPDATE of five rows under review and not a code change. §5(a) asserts
--   that property by refusing any 3+ digit literal in the verb's own body — the
--   same gate 2026-09-14-gem-unlock-buy.sql uses for the same reason.
--
-- ⚠ GEMS AND HEARTH TOKENS MAY NEVER BUY HUNTING TIME (design §4.4, settled).
--   An away-accrual boost sold for cash is pay-to-win on a ranked economy; that
--   is the ruling that removed Offline+ and the Hearth Hall bonus, and selling
--   the same hours under a new noun would be the same product. The verb reads
--   player_state.gold and nothing else, and §5(b) asserts that it never names
--   gems or hearth_tokens at all.
--
-- ⚠ THE CEILING IS WHAT STOPS THIS BEING A FAUCET FOR THE RICH. Two hours a day
--   that gold CANNOT buy is what keeps "richest player hunts most" from becoming
--   "richest player hunts always" (design §4.4). A refill that would buy nothing
--   because the ceiling is already reached is REFUSED, not sold — taking gold
--   for zero minutes is the defect the gem-unlock `already_owned` refusal exists
--   to prevent, in a new currency.
--
-- ── SLICE 1 DOES NOT SHIP THE BUTTON ────────────────────────────────────────
-- design §4.6: "Slice 1 ships Vigour read-only: the meter displays, the charge
-- accrues, and the refill button does not exist." This verb is STAGED so the
-- Security review and Tyler's numbers can happen against real code rather than
-- a plan; the client half of this lane renders NO refill control.
--
-- LANE C. STAGED, NOT APPLIED. SECURITY GO REQUIRED. TYLER'S PRICES REQUIRED.
--
-- REVERSIBILITY
--   drop function public.hr_vigour_refill(int, uuid);
--   drop function public.hr_vigour_refill__ungated(int, uuid);
--   drop table public.hr_vigour_prices;
--   delete from public.hr_client_rpc_baseline where proname = 'hr_vigour_refill';
--   -- re-apply the file that owns hr_rpc_gate to drop the bucket.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_vigour_of(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_vigour_of is absent - apply 2026-09-22-vigour-daily.sql FIRST'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'PRECONDITION: hr_rpc_gate is absent'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'PRECONDITION: hr_intent_replay is absent - apply 2026-08-15-intent-key-hygiene.sql FIRST'; end if;
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null then
    raise exception 'PRECONDITION: hr_note_rejection is absent - apply 2026-09-12-hr-rejections-journal.sql FIRST'; end if;
  if to_regclass('public.player_ledger') is null then
    raise exception 'player_ledger is missing - a purchase with no journal is not a purchase'; end if;
end $$;

-- ── 1. player_ledger.kind must admit 'vigour' — PROGRAMMATIC, ADDITIVE ─────
-- The 2026-09-14-gem-unlock-buy.sql idiom: read the live CHECK, insert one
-- literal at a known anchor, never restate the list. A restatement here would
-- silently drop whatever kinds another file added after this one was written.
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent - this verb''s journal row would be unconstrained';
  end if;
  if position('''vigour''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''vigour'' - widen skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, '''accrue''::text', ''))) <> length('''accrue''::text') then
    raise exception 'player_ledger_kind_check has no single ''accrue''::text anchor (%) - refusing to widen blind', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''accrue''::text, ''vigour''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''vigour'' (insertion, nothing removed)';
end $$;

-- ── 2. THE PRICE CATALOGUE — the only place a gold number lives ────────────
-- ⚠ THE TABLE SHIPS EMPTY, AND THAT IS THE ANSWER TO I-3 (Tyler, design §4.6;
--   Security R4.1/R5 condition 2, 2026-09-23). The Game Designer's proposed
--   ladder is 2,000 / 6,000 / 18,000 / 54,000 / 162,000 gold for 120 minutes
--   each — x3 and not the bank ladder's x1.32, because the bank rung is a
--   permanent capability bought once while Vigour is bought AGAIN EVERY DAY and
--   a shallow curve becomes a fixed daily tax the wealthy stop noticing by week
--   two; the sink is the point, at 242,000 gold a day at full refill leaving
--   the economy through a faucet nobody can resell.
--
--   ⚠ THOSE FIVE NUMBERS ARE PLACEHOLDERS AND ARE TYLER'S TO RULE ON. Nothing
--     in the repo records a ruling as of 2026-09-23, and a placeholder price
--     SEEDED is a real player paying a made-up number the first night this
--     applies — so no row is seeded and NO GOLD CAN MOVE. The verb ships live
--     and refuses every call by name (`refill_unpriced`, §3), which is the
--     same fail-closed shape every other unconfigured surface in this schema
--     has. Tyler's answer lands as a reviewed INSERT under this same review;
--     it is DATA, so it is never a code change, and §7(f) asserts the table is
--     still empty at the end of this apply.
--
--   Slice 1 ships no refill control, so nothing playable waits on the ruling.
create table if not exists public.hr_vigour_prices (
  nth        int    primary key check (nth >= 1),
  cost_gold  bigint not null check (cost_gold > 0),
  minutes    int    not null check (minutes > 0)
);

comment on table public.hr_vigour_prices is
  'THE VIGOUR REFILL LADDER (2026-09-22). The ONLY place a refill price exists - hr_vigour_refill__ungated contains no gold literal and the migration''s gate refuses one. SEEDED EMPTY 2026-09-23 (I-3): Tyler has not ruled on the four design 4.6 figures, and a placeholder price is a real player paying a made-up number - so the verb refuses every call with refill_unpriced until a priced row exists. The ruling lands as a reviewed INSERT, never a code change. The number of rows IS the per-day cap: an nth with no row is refused.';

alter table public.hr_vigour_prices enable row level security;
revoke all on public.hr_vigour_prices from public, anon, authenticated, service_role;
-- READ-ONLY to signed-in clients so the panel can print tonight's price without
-- computing it. A price the client derives is a price that can disagree with the
-- one charged (CLAUDE.md §6).
grant select on public.hr_vigour_prices to authenticated;
drop policy if exists hr_vigour_prices_read on public.hr_vigour_prices;
create policy hr_vigour_prices_read on public.hr_vigour_prices for select to authenticated using (true);

-- ── 3. hr_vigour_refill__ungated — verify, debit, count, journal ───────────
create or replace function public.hr_vigour_refill__ungated(p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid     uuid := auth.uid();
  v_slot    int  := coalesce(p_slot, 0);
  v_st      public.player_state%rowtype;
  v_day     text;
  v_cached  jsonb;
  v_vig     jsonb;
  v_nth     int;
  v_cost    bigint;
  v_min     int;
  -- How many of `v_min` this purchase would ACTUALLY add to the budget once
  -- hr_vigour_of's ceiling clamp has had its say (finding S-3). Computed before
  -- the debit; a refill that would deliver fewer than it charges for is refused.
  v_delivers int;
  v_cap     int;
  v_intent  text;
  v_result  jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;

  -- ── (0) THE IDEMPOTENCY KEY IS REQUIRED ON A MONEY VERB (finding S-4).
  --        The DEFAULT stays in the signature and the reason is PostgREST: it
  --        resolves an RPC by the named arguments in the POST body, so a
  --        two-argument function with no defaults answers PGRST202 — a 404
  --        indistinguishable from "the migration was never applied". But a
  --        default is not permission to run without one. A null key skips
  --        idempotency at BOTH ends — hr_intent_replay returns null immediately
  --        (§3) and nothing is cached (§9) — so `{"p_slot":0}` is a verb that
  --        DEBITS ON EVERY CALL, and a double-tap or a retry on a flaky
  --        connection costs a real player real gold. The per-day cap bounds the
  --        loss at five rungs, so this is not a faucet; it is a player paying
  --        twice for one gesture, and the fix is one branch.
  --
  -- ⚠ BEFORE THE ADVISORY LOCK, deliberately: a call that cannot be made safe
  --   must not first serialise every other call on this character behind it.
  --   Refused by NAME so the panel and hr_rejections can both say which rule
  --   fired, and journalled like every other refusal in this verb.
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'missing_idem', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'missing_idem', 'slot', v_slot);
  end if;

  -- ── (0b) THE CATALOGUE IS UNPRICED — REFUSED BY ITS OWN NAME (I-3) ───────
  --        The table ships EMPTY (§2) because Tyler has not ruled on the design
  --        §4.6 figures, and the whole point of shipping empty is that NO GOLD
  --        CAN MOVE on a placeholder. Without this branch an empty catalogue is
  --        still refused — hr_vigour_of reports refills_max 0 and §(5) fires —
  --        but it is refused as `vigour_daily_cap`, which tells a player they
  --        have used up a limit they have never been able to reach, and tells
  --        the vitals a real cap is biting. One rule, one name: a surface that
  --        is not configured says so.
  --
  -- ⚠ BEFORE THE ADVISORY LOCK, for the same reason `missing_idem` is: a call
  --   that CANNOT succeed on any character must not first serialise every other
  --   call on this one. Journalled like every other refusal in this verb, so
  --   `vitals --refusals` shows how many players found the control before the
  --   ruling landed.
  if not exists (select 1 from public.hr_vigour_prices) then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'refill_unpriced', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'refill_unpriced', 'slot', v_slot);
  end if;

  -- ── (1) SERIALISE ON THE CHARACTER. The key is byte-identical to the one
  --        hr_apply takes, so this also serialises against an accrual settling
  --        the same character - which matters here because that accrual is what
  --        SPENDS the minutes this purchase adds. Transaction-scoped, so it is
  --        safe under the transaction pooler and re-entrant.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (2) THE SERVER'S DAY. Read AFTER the lock and used for every counter
  --        below, so a purchase cannot straddle the rollover and be counted in
  --        one day while being priced in another.
  v_day := public.hr_utc_day_key(now());
  v_intent := 'vigour_refill:' || v_day;

  -- ── (3) IDEMPOTENCY IS PER (KEY, INTENT, SLOT). Read INSIDE the lock so two
  --        simultaneous retries of one tap cannot both miss the cache. ONLY
  --        SUCCESSES ARE CACHED (see (9)), so "you are short 400 gold" stays
  --        retryable.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then return v_cached || jsonb_build_object('replayed', true); end if;

  select * into v_st from public.player_state
   where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) WHERE THIS CHARACTER STANDS, from the ONE meter. Not a private count
  --        here: a second reading of "how many today" is a second answer.
  v_vig := public.hr_vigour_of(v_uid, v_slot);
  v_nth := coalesce((v_vig->>'refills')::int, 0) + 1;
  v_cap := coalesce((v_vig->>'refills_max')::int, 0);

  -- ── (5) THE PER-DAY CLAMP. The CATALOGUE'S ROW COUNT is the cap, so raising
  --        it is adding a priced row and can never be done by accident. Refused
  --        BY NAME, before any debit.
  if v_nth > v_cap then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_daily_cap',
      jsonb_build_object('used', v_nth - 1, 'limit', v_cap), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_daily_cap',
      'used', v_nth - 1, 'limit', v_cap, 'vigour', v_vig);
  end if;

  select cost_gold, minutes into v_cost, v_min from public.hr_vigour_prices where nth = v_nth;
  if v_cost is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_daily_cap',
      jsonb_build_object('nth', v_nth), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_daily_cap', 'nth', v_nth, 'vigour', v_vig);
  end if;

  -- ── (6) THE CEILING. A refill that would buy NOTHING is refused rather than
  --        sold. Taking gold for zero minutes is the `already_owned` defect in a
  --        new currency, and it is the likeliest way this verb becomes a
  --        complaint: a player at a 22-hour grant would pay 2,000 gold for air.
  --
  -- ⚠ AND NOT A MINUTE OF PARTIAL AIR EITHER (finding S-3). This test used to
  --   read `budget_min >= ceiling_min`, which refuses only the case that
  --   delivers ZERO. hr_vigour_of clamps with least(ceiling, grant + bought),
  --   so a refill that CROSSES the ceiling delivers less than the 120 minutes
  --   it charges for and still reports `minutes: 120` - the receipt and the
  --   meter on the same envelope disagreeing by up to 119 minutes, which is
  --   exactly the class Tyler ruled on 2026-09-14 arriving inside a gold verb.
  --   Reachable with whole-hour grants: a 15-hour character (900 min) is at
  --   1,260 after three refills, and the fourth would be sold for 54,000 gold
  --   and deliver 60 minutes.
  --
  -- ⚠ WE REFUSE RATHER THAN PRICE THE PARTIAL, and that is the choice this file
  --   makes of the two the review offered. It matches the `already_owned`
  --   reasoning three lines up, it keeps the catalogue a flat ladder (a
  --   pro-rated price is a second pricing rule, in code, under a Security GO
  --   that reviewed a table), and a player refused at 1,260 still spends their
  --   remaining 60 minutes - they simply cannot buy a fourth block they would
  --   only half receive. The DELIVERED minutes are computed BEFORE the debit,
  --   which is the property: no branch below can take gold for time the ceiling
  --   will clamp away.
  v_delivers := least(coalesce((v_vig->>'ceiling_min')::int, 0)
                        - coalesce((v_vig->>'budget_min')::int, 0), v_min);
  if v_delivers < v_min then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_ceiling',
      jsonb_build_object('budget_min', v_vig->>'budget_min', 'ceiling_min', v_vig->>'ceiling_min',
                         'would_deliver', greatest(0, v_delivers), 'minutes', v_min), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_ceiling',
      'budget_min', (v_vig->>'budget_min')::int, 'ceiling_min', (v_vig->>'ceiling_min')::int,
      -- NAMED, so the panel can say "this would only buy you 60 of the 120
      -- minutes" instead of a bare refusal the player cannot act on.
      'would_deliver', greatest(0, v_delivers), 'minutes', v_min,
      'vigour', v_vig);
  end if;

  -- ── (7) THE DEBIT. Every number here came from the server's own catalogue or
  --        the server's own row; nothing on the wire priced anything. The
  --        balance cannot go negative - the check and the update are one
  --        statement apart inside a transaction holding the row lock.
  if coalesce(v_st.gold, 0) < v_cost then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'insufficient_gold',
      jsonb_build_object('cost', v_cost, 'have', coalesce(v_st.gold, 0)), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'cost', v_cost, 'have', coalesce(v_st.gold, 0),
      'short_by', v_cost - coalesce(v_st.gold, 0), 'vigour', v_vig);
  end if;
  update public.player_state
     set gold = gold - v_cost, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate the
  --   elapsed time of exactly the player who just paid to hunt longer.

  -- ── (8) THE COUNTER. The SAME daily row hr_vigour_of reads, so what was
  --        charged and what is granted cannot disagree - there is one number
  --        (design §5). The minutes themselves are NOT stored: the budget is
  --        derived from this count, so there is nothing to drift.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'daily', 'ev:vigour_refills', 1, v_day, 'active', now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = pp.value + 1, updated_at = now();

  -- ── (9) THE JOURNAL. ONE row per refill, carrying the SIGNED gold movement
  --        so a support request about a missing 18,000 gold is answerable from
  --        the append-only record. gold_in/xp_in/qty_in/gems_in are ZERO and
  --        written explicitly: this transaction MINTED nothing.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'vigour', v_intent, -v_cost, 0, 0, 0, 0,
     jsonb_build_object('nth', v_nth, 'cost', v_cost, 'minutes', v_min,
                        'currency', 'gold', 'day', v_day, 'idem', p_idem));

  -- ── (10) THE ENVELOPE. The balance and the meter are RE-READ from the rows
  --         rather than computed from a pre-update snapshot, so what the client
  --         renders is what the database holds.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'nth', v_nth, 'cost', v_cost, 'minutes', v_min, 'currency', 'gold',
    'gold', v_st.gold, 'version', v_st.version, 'slot', v_slot,
    'vigour', public.hr_vigour_of(v_uid, v_slot));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough gold" permanent
  --   for that key; the client generates a fresh key per gesture, so a genuine
  --   retry of the SAME gesture replays this envelope and debits nothing.
  -- UNCONDITIONAL since finding S-4: §0 refuses a null key, so every call that
  -- reaches here HAS one and the old `if p_idem is not null` branch could only
  -- ever have been the path that made this verb non-idempotent.
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_result, now())
    on conflict (user_id, intent_id) do nothing;

  return v_result;
end $$;

-- ── 4. The gated wrapper ───────────────────────────────────────────────────
-- ⚠ BOTH ARGUMENTS CARRY DEFAULTS. PostgREST resolves an RPC by the NAMED
--   arguments in the POST body; a client posting {} against a two-argument
--   function with no defaults gets PGRST202, a 404 indistinguishable from "the
--   migration was never applied".
-- ⚠ THE hr_note_rejection SEAM IS WRITTEN HERE, NOT INHERITED: the 2026-09-12
--   sweep decorated the pairs that existed when it ran, so a wrapper created
--   afterwards carries its own. Exactly one call, in the sweep's shape.
create or replace function public.hr_vigour_refill(p_slot int default 0, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_vigour_refill') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_note_rejection('hr_vigour_refill', p_slot,
           public.hr_vigour_refill__ungated($1, $2));
end $w$;

revoke execute on function public.hr_vigour_refill__ungated(int, uuid) from public;
revoke execute on function public.hr_vigour_refill__ungated(int, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_vigour_refill(int, uuid) from public;
revoke execute on function public.hr_vigour_refill(int, uuid) from anon, service_role;
grant  execute on function public.hr_vigour_refill(int, uuid) to authenticated;

-- ── 5. hr_rpc_gate — PROGRAMMATIC additive patch (one bucket) ──────────────
-- An UNKNOWN bucket fails CLOSED (`else return false`), so without this the verb
-- would answer rate_limited forever and deploy green and dead.
-- 6/min: the whole ladder is five rows a day and each is a deliberate decision.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');
  if position('''hr_vigour_refill''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_vigour_refill - patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, 'else return false;' || chr(10) || '  end case;', '')))
     <> length('else return false;' || chr(10) || '  end case;') then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once - refusing to patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''hr_vigour_refill'' then v_limit := 6;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_vigour_refill admitted at 6/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 6. Grant-hygiene baseline ──────────────────────────────────────────────
-- Targeted, never a call to hr_grant_baseline_sync(): that would re-approve the
-- entire live surface and turn a differential check into a rubber stamp.
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent - grant-hygiene not applied; nothing to record'; return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_vigour_refill' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_vigour_refill', 'p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-09-22: buys +120 paid hunting minutes for GOLD on the calling character. The price '
     'comes from public.hr_vigour_prices (nth = today''s refill count + 1); the caller sends one of '
     'its own slots and an idempotency key and nothing else - no amount, no price, no currency. '
     'Gems and Hearth Tokens may never buy hunting time (HUNTS_AND_ANALYZER.md 4.4). Capped at the '
     'catalogue''s row count per UTC day and refused at the 22h daily ceiling rather than sold for '
     'zero minutes. MONEY SURFACE: applied only on a Security GO (CLAUDE.md 2).');
end $$;

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5510004';
  v_src  text;
  v_r    jsonb;
  v_vig  jsonb;
  v_gold bigint;
  v_p1   bigint;
  v_p2   bigint;
  -- The PERKED probe of (e7) and its clan. The ceiling branch is unreachable at
  -- the floor grant (720 + 5x120 = 1,320 = exactly 22 h), so an arm that only
  -- ever ran on v_uid would be proving nothing about it.
  v_uid2 constant uuid := '00000000-0000-4000-8000-0000b5510005';
  v_clan uuid;
  v_i    int;
  v_gold2 bigint;
  v_day  text := public.hr_utc_day_key(now());
begin
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_vigour_refill__ungated';
  if v_src is null then raise exception 'GATE(a): hr_vigour_refill__ungated is missing'; end if;

  -- (a) THE CATALOGUE IS THE ONLY PRICE. No 3+ digit literal may appear in the
  --     verb's executable body. This is what makes Tyler's four numbers DATA.
  if v_src ~ '[^0-9a-zA-Z_]\d{3,}' then
    raise exception 'GATE(a): the verb contains a 3+ digit literal outside a comment - a price typed into the verb is a second copy of a money number that Tyler cannot tune';
  end if;
  if position('hr_vigour_prices' in v_src) = 0 then
    raise exception 'GATE(a): the verb does not read hr_vigour_prices at all';
  end if;

  -- (b) GOLD ONLY. The settled ruling (design §4.4): selling away-accrual hours
  --     for cash is pay-to-win on a ranked economy.
  -- ⚠ `gems_in` IS BLANKED FIRST, AND IT IS NOT A SOFTENING. It is one of
  --   hr_apply's four daily-budget STAMP COLUMNS, written here as an explicit
  --   ZERO because "this transaction minted nothing" is a different fact from
  --   "unstamped" - every value verb in this chain writes it. What the rule
  --   forbids is the verb READING or MOVING a premium currency, and that cannot
  --   be spelled without the bare word.
  if regexp_replace(v_src, 'gems_in', '', 'g') ~* '(gems|hearth_tokens|dungeon_scrip|marks)' then
    raise exception 'GATE(b): the verb names a currency that is not gold - gems and Hearth Tokens may NEVER buy hunting time';
  end if;
  -- AND IT REALLY DOES SPEND GOLD. The half of the rule the pattern above
  -- cannot state: a verb that named no currency at all would also pass it.
  if v_src !~ 'gold[[:space:]]*=[[:space:]]*gold[[:space:]]*-' then
    raise exception 'GATE(b): the verb does not debit player_state.gold - a refill that charges nothing is a faucet';
  end if;

  -- (c) THE WRAPPER IS GATED, SEAMED AND DEFAULTED.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_vigour_refill';
  if position('hr_rpc_gate' in v_src) = 0 then raise exception 'GATE(c): the wrapper is not rate-gated'; end if;
  if (length(v_src) - length(replace(v_src, 'hr_note_rejection', ''))) / length('hr_note_rejection') <> 1 then
    raise exception 'GATE(c): the wrapper does not carry exactly one hr_note_rejection seam';
  end if;
  if (select pronargdefaults from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='hr_vigour_refill') <> 2 then
    raise exception 'GATE(c): hr_vigour_refill does not default both arguments - PostgREST would answer PGRST202';
  end if;
  -- (c2) THE UNGATED BODY IS CALLABLE BY NOBODY.
  if has_function_privilege('authenticated', 'public.hr_vigour_refill__ungated(int, uuid)', 'execute') then
    raise exception 'GATE(c2): authenticated can call the UNGATED verb - the rate gate is bypassable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_vigour_refill(int, uuid)', 'execute') then
    raise exception 'GATE(c2): authenticated cannot call the gated wrapper - the verb ships dead';
  end if;

  -- (d0) THE CATALOGUE SHIPS EMPTY (I-3). The control for every arm below: if a
  --      row were seeded, (e0) would be proving nothing and a player could pay
  --      a placeholder price the first night this applies.
  if exists (select 1 from public.hr_vigour_prices) then
    raise exception 'GATE(d0): hr_vigour_prices is SEEDED - Tyler has not ruled on the design 4.6 figures (I-3), so a priced row here is a real player paying a made-up number. The ruling lands as a reviewed INSERT, not as a seed in this file.';
  end if;

  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e): no probe character: %', v_r; end if;

    -- (e0) ★ THE SHIPPED STATE: AN UNPRICED CATALOGUE REFUSES BY ITS OWN NAME
    --      (I-3, Security R4.1 condition 2) ★ — and it refuses AHEAD of both
    --      the gold test and the day cap, which is what proves §(0b) is reached
    --      rather than shadowed. `vigour_daily_cap` here would tell a player
    --      they had used up a limit they have never been able to reach.
    v_gold := (select coalesce(gold, 0) from public.player_state where user_id = v_uid and slot = 0);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'refill_unpriced' then
      raise exception 'GATE(e0): an UNPRICED catalogue answered % - it must be refill_unpriced, by name, before any other rule', v_r; end if;
    if (select coalesce(gold, 0) from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e0): the unpriced refill MOVED GOLD'; end if;
    if exists (select 1 from public.player_progress where user_id = v_uid
                and kind='daily' and key='ev:vigour_refills') then
      raise exception 'GATE(e0): the unpriced refill counted anyway'; end if;

    -- ── THE GATE'S OWN LADDER, AND IT LIVES ONLY IN THIS SUBTRANSACTION ─────
    -- Every arm below prices a purchase, and the shipped table is empty, so the
    -- fixture is the Game Designer's proposed curve (design §4.6) inserted HERE
    -- and rolled back with the probes at HR922. It is a test fixture, not a
    -- seed: (d0) above and (f) below both assert the real table is untouched.
    insert into public.hr_vigour_prices (nth, cost_gold, minutes) values
      (1,   2000, 120),
      (2,   6000, 120),
      (3,  18000, 120),
      (4,  54000, 120),
      (5, 162000, 120);

    -- (d) THE LADDER RISES. Asserted from the rows, so a mis-seeded catalogue
    --     (every rung 2,000) fails the apply instead of shipping a flat tax.
    select cost_gold into v_p1 from public.hr_vigour_prices where nth = 1;
    select cost_gold into v_p2 from public.hr_vigour_prices where nth = 2;
    if v_p2 <= v_p1 then
      raise exception 'GATE(d): refill 2 (%) is not dearer than refill 1 (%) - a flat curve becomes a fixed daily tax the wealthy stop noticing', v_p2, v_p1;
    end if;
    if exists (select 1 from public.hr_vigour_prices a join public.hr_vigour_prices b
                on b.nth = a.nth + 1 where b.cost_gold <= a.cost_gold) then
      raise exception 'GATE(d): the price ladder is not strictly increasing';
    end if;

    -- (e1) NO GOLD, NO REFILL. Run BEFORE any gold is placed, so the refusal is
    --      the shipped default rather than something this probe arranged.
    select coalesce(gold, 0) into v_gold from public.player_state where user_id = v_uid and slot = 0;
    if v_gold >= v_p1 then
      raise exception 'GATE(e1) CANNOT RUN: a new character starts with % gold, enough for the first refill (%) - this probe proves nothing', v_gold, v_p1;
    end if;
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_gold' then
      raise exception 'GATE(e1): a broke character was answered % - it must be insufficient_gold', v_r; end if;
    if exists (select 1 from public.player_progress where user_id = v_uid
                and kind='daily' and key='ev:vigour_refills') then
      raise exception 'GATE(e1): the REFUSED refill counted anyway';
    end if;

    -- (e1b) A NULL IDEMPOTENCY KEY IS REFUSED BY NAME (finding S-4), AND IT IS
    --       REFUSED WITH THE GOLD ALREADY THERE - otherwise `insufficient_gold`
    --       would be doing the refusing and this arm would prove nothing. A null
    --       key skips idempotency at both ends, so the verb would debit on every
    --       call and a double-tap or a retry on a flaky connection would cost a
    --       real player real gold.
    update public.player_state set gold = v_p1 + v_p2 + 1 where user_id = v_uid and slot = 0;
    v_gold := (select gold from public.player_state where user_id = v_uid and slot = 0);
    v_r := public.hr_vigour_refill__ungated(0, null);
    if coalesce(v_r->>'error','') <> 'missing_idem' then
      raise exception 'GATE(e1b): a null p_idem was answered % - a money verb without an idempotency key debits on every call', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e1b): the key-less refill MOVED GOLD'; end if;
    if exists (select 1 from public.player_progress where user_id = v_uid
                and kind='daily' and key='ev:vigour_refills' and period_key = v_day) then
      raise exception 'GATE(e1b): the key-less refill counted anyway'; end if;

    -- (e2) THE HAPPY PATH. Gold placed on the row directly (a synthetic probe,
    --      not a player - no faucet is exercised). It must debit EXACTLY the
    --      catalogue price, count exactly one, and journal the signed movement.
    v_r := public.hr_vigour_refill__ungated(0, '00000000-0000-4000-8000-0000b5510aa1');
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(e2): a funded refill was refused: %', v_r; end if;
    if (v_r->>'cost')::bigint <> v_p1 then
      raise exception 'GATE(e2): charged % for refill 1, catalogue says %', v_r->>'cost', v_p1; end if;
    if (v_r->>'gold')::bigint <> v_p2 + 1 then
      raise exception 'GATE(e2): the debit left % gold, expected %', v_r->>'gold', v_p2 + 1; end if;
    if (v_r->'vigour'->>'refills')::int <> 1 then
      raise exception 'GATE(e2): the meter did not count the refill: %', v_r->'vigour'; end if;
    if (v_r->'vigour'->>'budget_min')::int
         <> least((v_r->'vigour'->>'ceiling_min')::int,
                  (v_r->'vigour'->>'grant_min')::int + 120) then
      raise exception 'GATE(e2): the budget did not grow by the purchased minutes: %', v_r->'vigour'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'vigour') <> 1 then
      raise exception 'GATE(e2): the refill did not journal exactly one row'; end if;
    if (select gold from public.player_ledger where user_id = v_uid and kind='vigour' limit 1) <> -v_p1 then
      raise exception 'GATE(e2): the journal does not record the SIGNED gold movement'; end if;

    -- (e3) THE REPLAY. The SAME key answers the SAME envelope and debits
    --      nothing - the property a retrying client depends on and the one a
    --      double-tap would otherwise break.
    v_r := public.hr_vigour_refill__ungated(0, '00000000-0000-4000-8000-0000b5510aa1');
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'GATE(e3): the replayed key was not answered from the cache: %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_p2 + 1 then
      raise exception 'GATE(e3): the replay MOVED GOLD - a retry charges twice'; end if;
    if (public.hr_vigour_of(v_uid, 0)->>'refills')::int <> 1 then
      raise exception 'GATE(e3): the replay counted a second refill'; end if;

    -- (e4) THE PRICE RISES. A FRESH key must be charged the SECOND rung.
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(e4): the second refill was refused: %', v_r; end if;
    if (v_r->>'cost')::bigint <> v_p2 then
      raise exception 'GATE(e4): refill 2 cost % - the ladder is not rising within the day', v_r->>'cost'; end if;

    -- (e5) THE DAY CAP BITES, AND IT IS THE CATALOGUE'S ROW COUNT. Gold is
    --      placed far above every rung so the refusal can only be the cap.
    update public.player_state set gold = 100000000 where user_id = v_uid and slot = 0;
    for i in 3..(select max(nth) from public.hr_vigour_prices) loop
      v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(e5): refill % was refused with gold to spare: %', i, v_r; end if;
    end loop;
    select gold into v_gold from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'vigour_daily_cap' then
      raise exception 'GATE(e5): the (max+1)th refill answered % - it must be vigour_daily_cap', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e5): the REFUSED refill still took gold'; end if;
    -- AND THE CEILING HELD THROUGHOUT.
    v_vig := public.hr_vigour_of(v_uid, 0);
    if (v_vig->>'budget_min')::int > (v_vig->>'ceiling_min')::int then
      raise exception 'GATE(e5): five refills pushed the budget to % min, past the ceiling % - gold bought the whole day', v_vig->>'budget_min', v_vig->>'ceiling_min'; end if;

    -- (e6) THE REFILLS ARE TODAY'S ONLY. Every counter row is on today's period
    --      key, so tomorrow starts at rung 1 with no reset job anywhere.
    if exists (select 1 from public.player_progress where user_id = v_uid
                and kind='daily' and key='ev:vigour_refills' and period_key <> v_day) then
      raise exception 'GATE(e6): a refill counted against a day that is not today';
    end if;

    -- (e7) THE CEILING-CLAMPED REFILL IS REFUSED, NOT SOLD (finding S-3), AND
    --      BOTH BRANCHES ARE DRIVEN.
    --
    -- ⚠ ON A PERKED CHARACTER, BECAUSE THE BRANCH IS UNREACHABLE WITHOUT ONE.
    --   At the floor grant the numbers saturate EXACTLY - 720 + 5 x 120 = 1,320
    --   = 22 h - so the day cap always refuses first and every arm above would
    --   pass against a verb with no ceiling test at all. The only perk source
    --   today is clan level (hr_offline_cap_ms), and level 7 is cumulative:
    --   12 + 1 + 2 = 15 h = a 900-minute grant. Three refills take the budget to
    --   1,260; the fourth would deliver 60 of the 120 it charges 54,000 gold
    --   for, which is the receipt and the meter disagreeing by an hour on the
    --   same envelope. The clan rows are probe rows in the same rolled-back
    --   subtransaction and §7's leak check counts them.
    insert into auth.users (id) values (v_uid2);
    insert into public.clans (name, created_by) values ('__vigour_ceiling_probe__', v_uid2)
      returning id into v_clan;
    update public.clans set level = 7 where id = v_clan;
    insert into public.clan_members (clan_id, user_id) values (v_clan, v_uid2);
    perform set_config('request.jwt.claim.sub', v_uid2::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e7): no perked probe character: %', v_r; end if;
    update public.player_state set gold = 100000000 where user_id = v_uid2 and slot = 0;

    v_vig := public.hr_vigour_of(v_uid2, 0);
    if (v_vig->>'grant_min')::int <= 720 then
      raise exception 'GATE(e7) CANNOT RUN: the perked probe derived a %-minute grant, no better than the floor, so the ceiling branch is still unreachable and this arm proves nothing. Re-derive the clan rung.', v_vig->>'grant_min'; end if;

    -- BRANCH 1: every refill that DELIVERS ITS WHOLE BLOCK is sold, and the
    -- budget grows by exactly the minutes the receipt reports. A receipt that
    -- overstates what was bought is the defect whatever the policy.
    v_i := 0;
    loop
      v_vig := public.hr_vigour_of(v_uid2, 0);
      exit when (v_vig->>'budget_min')::int + 120 > (v_vig->>'ceiling_min')::int;
      v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(e7): a refill with room for its whole block was refused: %', v_r; end if;
      if (v_r->'vigour'->>'budget_min')::int - (v_vig->>'budget_min')::int <> (v_r->>'minutes')::int then
        raise exception 'GATE(e7): the receipt reported % minutes and the budget moved by % - the browser and the server are saying different things about a number the player just paid for', v_r->>'minutes', (v_r->'vigour'->>'budget_min')::int - (v_vig->>'budget_min')::int; end if;
      v_i := v_i + 1;
      exit when v_i > 5;   -- the ladder cannot outlive its row count
    end loop;
    if v_i = 0 then
      raise exception 'GATE(e7) CANNOT RUN: not one refill was delivered in full, so branch 1 measured nothing'; end if;

    -- BRANCH 2: the NEXT one would cross the ceiling and deliver less than it
    -- charges for. It must be refused BY NAME, take no gold, count nothing, and
    -- say how much it would have delivered.
    v_gold2 := (select gold from public.player_state where user_id = v_uid2 and slot = 0);
    v_vig := public.hr_vigour_of(v_uid2, 0);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'vigour_ceiling' then
      raise exception 'GATE(e7): a refill that would deliver only % of its % minutes was answered % - the server takes 54,000 gold, reports 120 minutes and the meter on the same envelope says 60', (v_vig->>'ceiling_min')::int - (v_vig->>'budget_min')::int, 120, v_r; end if;
    if (v_r->>'would_deliver')::int >= (v_r->>'minutes')::int then
      raise exception 'GATE(e7): the refusal claims it would have delivered the whole block (% of %) - then it should have been SOLD', v_r->>'would_deliver', v_r->>'minutes'; end if;
    if (select gold from public.player_state where user_id = v_uid2 and slot = 0) <> v_gold2 then
      raise exception 'GATE(e7): the REFUSED partial refill still took gold. A refusal that charges is worse than a sale.'; end if;
    if public.hr_vigour_of(v_uid2, 0) is distinct from v_vig then
      raise exception 'GATE(e7): the refused refill moved the meter'; end if;

    -- (e0b) AND THE REFUSAL HOLDS WITH GOLD ON THE TABLE. (e0) ran on a probe
    --       that had nothing to spend, so on its own it cannot tell
    --       "refused because unpriced" from "refused because broke". Withdraw
    --       the fixture ladder from under a character holding 100,000,000 gold
    --       and the answer must still be refill_unpriced, and the gold must
    --       still be there. This is the arm that says NO GOLD CAN MOVE on a
    --       placeholder, which is the whole of what I-3 buys.
    delete from public.hr_vigour_prices;
    v_gold2 := (select gold from public.player_state where user_id = v_uid2 and slot = 0);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'error','') <> 'refill_unpriced' then
      raise exception 'GATE(e0b): a FUNDED character on an unpriced catalogue was answered % - it must be refill_unpriced', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid2 and slot = 0) <> v_gold2 then
      raise exception 'GATE(e0b): the unpriced refill took gold from a funded character'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    raise exception using errcode = 'HR922', message = 'vigour-refill §7 complete - rolling back';
  exception when sqlstate 'HR922' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- BOTH probes, and the clan rows (e7) had to create to reach the ceiling
  -- branch at all. A leak check that named only the first probe would have gone
  -- green over the second one from the day (e7) was written.
  if exists (select 1 from public.player_state     where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_skills    where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_inventory where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_equipment where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_progress  where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_ledger    where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.player_intents   where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.clan_members     where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.clans            where name = '__vigour_ceiling_probe__')
     or exists (select 1 from auth.users             where id in (v_uid, v_uid2)) then
    raise exception 'GATE: §7 LEAKED a probe row';
  end if;

  -- (f) AND THE CATALOGUE IS STILL EMPTY (I-3). The fixture ladder (d)/(e1)-(e7)
  --     priced against was inserted inside the rolled-back subtransaction; if it
  --     survived to here, this apply would ship five placeholder prices and the
  --     first refill on production would charge a number nobody ruled on.
  if exists (select 1 from public.hr_vigour_prices) then
    raise exception 'GATE(f): §7 LEAKED its fixture price ladder - the catalogue must ship EMPTY until Tyler rules (design 4.6)';
  end if;

  raise notice 'vigour-refill: no price literal lives in the verb, no currency but gold is named, the wrapper is gated + seamed + defaulted and the ungated body is callable by nobody, the ladder strictly rises, and EXECUTED - a broke character is refused and counts nothing, a funded one pays exactly rung 1 and journals the signed debit, the replay charges nothing, rung 2 costs more, the day cap is the catalogue row count and refuses without taking gold, five refills never pass the 22h ceiling, a NULL idempotency key is refused by name and moves no gold, and on a CLAN-PERKED probe a refill that would be clamped by the ceiling is REFUSED while every refill delivered in full moves the budget by exactly the minutes its receipt reports; the catalogue SHIPS EMPTY (I-3) and an unpriced refill is refused by name ahead of every other rule, broke and funded alike, taking no gold and counting nothing - all green, net zero';
end $$;
