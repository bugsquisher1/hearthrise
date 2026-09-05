-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_quartermaster_buy  (docs/design/dungeon-settlement.md §4)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies it after the
--     Security review, in apply order (AFTER 2026-09-10-dungeon-settle.sql).
--
-- THE SPEND SIDE OF DUNGEON SCRIP. hr_dungeon_settle (§2) is the server writer of
-- the EARN; this is the server writer of the SPEND. Before it, the Quartermaster
-- was a CLIENT trade (src/dungeons.js buyFromQuartermaster: `removeItem('dungeon_
-- scrip')` + `addItem(blueprint)`), neither leg known to the server, so the settle
-- envelope half-undid it by different rules — the b372 "buy every blueprint, get
-- the scrip back" bug. Once both legs are ONE server transaction the trade stands
-- or reverts whole and src/net/item-ledger.js's client mitigation drains itself.
--
-- SHAPE = hr_unlock_buy / hr_dungeon_settle, with the currency swapped to scrip
-- and the grant an item into player_inventory instead of a progress rung:
--   identity seam → offer catalogue (no lock) → rate → advisory lock →
--   idempotency (hr_intent_replay) → protected block (row lock, version, scrip
--   balance, bank cap, per-day fuse, debit scrip, credit item, journal) →
--   cache-success → grants → structural assertions → hr_assert_grant_hygiene
--   re-derive (link 9) → self-verifying gate.
--
-- ── ANTI-FORGERY ────────────────────────────────────────────────────────────
--   The whole client surface is ONE offer id — a primary key into the generated,
--   client-unwritable hr_qm_offers. The PRICE and the ITEM are server-owned
--   (looked up in the catalogue, never sent); the scrip balance is server-owned
--   (player_state.dungeon_scrip, read under the row lock); the granted item is
--   BoP or a tradeable-but-market-taxed blueprint (Tyler b268, Designer-verified
--   as a sink not a faucet). No price, no item, no quantity and no scrip amount
--   cross from the client. A forged offer id → unknown_offer; nothing else the
--   client sends can move a number.
--
-- ── THE JOURNAL ROW, AND WHY ITS SHAPE IS LOAD-BEARING ──────────────────────
--   ONE row, kind='dungeon', meta.op='qm_buy', meta.scrip = -scrip_cost (NEGATIVE).
--   The settle's per-day EARN cap sums positive scrip only and its settle-COUNT
--   cap counts meta.op='settle' only (Designer ruling 2026-09-05, Condition-3), so
--   a spend can NEVER reduce the earn ceiling (no spend→earn→spend laundering) and
--   never inflate the settle count. The signed scrip in meta makes the whole trade
--   reconstructible from the append-only ledger alone.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop function public.hr_quartermaster_buy(uuid,int,bigint,uuid,text);
--   -- re-apply 2026-09-10-dungeon-settle.sql (link 8, the base this body was
--   --   derived from) to restore hr_assert_grant_hygiene WITHOUT the
--   --   quartermaster_buy allowlist entry but WITH dungeon_settle + attended.
--   The scrip / item / ledger rows it wrote are ordinary player rows and survive.
--   hr_qm_offers is dropped by re-running the catalogue file's own revert.
--
-- SAFE TO RE-RUN. Every step is guarded and §6's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_def text;
begin
  if to_regclass('public.player_state')     is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_ledger')    is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_intents')   is null then raise exception 'player_intents missing'; end if;

  -- The scrip column this verb debits (§1's sibling). Without it the currency arm
  -- is unreachable.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='dungeon_scrip') <> 1 then
    raise exception 'player_state.dungeon_scrip is absent — apply 2026-09-10-dungeon-scrip.sql first';
  end if;

  -- The offer catalogue this verb prices from. Present-and-empty is as fatal as
  -- absent: it would answer unknown_offer to every purchase in the game.
  if to_regclass('public.hr_qm_offers') is null then
    raise exception 'hr_qm_offers is absent — apply 2026-09-10-dungeon-catalogue.generated.sql first';
  end if;
  if (select count(*) from public.hr_qm_offers) = 0 then
    raise exception 'hr_qm_offers is empty — regenerate (node tools/gen-dungeon-catalogue.mjs). '
                    'Installed against an empty catalogue this verb would answer unknown_offer to '
                    'every purchase.';
  end if;

  -- kind='dungeon' must be admitted (2026-09-10-dungeon-settle.sql §1 widened it).
  -- This verb reuses that kind for its qm_buy row; apply the settle first.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null or position('''dungeon''' in v_def) = 0 then
    raise exception 'player_ledger.kind does not admit ''dungeon'' — apply 2026-09-10-dungeon-settle.sql first';
  end if;

  -- The primitives this verb copies from hr_dungeon_settle statement for statement.
  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_reject / hr_record_rejection are missing — apply the apply-engine chain first';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key is missing — apply 2026-08-08-clan-seat.sql first';
  end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is absent — apply 2026-09-03-intent-mismatch-class.sql first. '
                    'This verb reads the shared player_intents namespace and must compare the stored '
                    'intent and slot, not merely the key.';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null then
    raise exception 'hr_rate_ok is missing — apply the rate chain first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the apply-engine chain first';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene is absent — this file re-derives it (link 9); its base '
                    '2026-09-10-dungeon-settle.sql must be applied first';
  end if;
end $$;

-- ── 1. hr_quartermaster_buy ────────────────────────────────────────────────
create or replace function public.hr_quartermaster_buy(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_offer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- Per-day PURCHASE count fuse (anti-replay insurance; NOT balance — the real
  -- limiter on spend is the scrip balance itself). 250 QM buys/UTC-day, mirroring
  -- the settle count cap. Counts meta.op='qm_buy' only.
  c_daily_buy_cap constant int := 250;

  v_uid    uuid;
  v_role   text;
  v_slot   int := coalesce(p_slot, 0);
  v_off    public.hr_qm_offers%rowtype;
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_intent text;
  v_out    jsonb;
  v_bought jsonb;
  v_msg text; v_det text; v_sqlstate text;
  v_have   bigint;
  v_stacks int;
  v_day    text;
  v_count_today int;
begin
  -- ── (0) IDENTITY SEAM. hr_dungeon_settle's, verbatim in effect: the engine may
  --        act for a user it has already verified; nobody else may name a user.
  --        current_user is the OWNER inside a definer function, so the ROLE GUC is
  --        what is read.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'quartermaster_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;

  -- ── (1) SHAPE + CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        request or the catalogue needs no character and no lock.
  if p_offer_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer');
  end if;
  select * into v_off from public.hr_qm_offers where offer_id = p_offer_id;
  if v_off.offer_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer',
      'detail', jsonb_build_object('offer', p_offer_id));
  end if;
  v_intent := 'qm_buy:' || v_off.offer_id;

  -- ── (2) RATE. The `apply` budget, NOT a new namespace (hr_unlock_buy's rule:
  --        a second writer with its own allowance doubles a compromised engine's
  --        reachable write rate). Outside the protected block, sampled.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'quartermaster_buy', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (3) SERIALISE THIS CHARACTER — the SAME advisory key hr_apply takes, so a
  --        purchase cannot race an accrual or a settle on one character.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (4) IDEMPOTENCY, per (KEY, INTENT, SLOT). player_intents is ONE namespace
  --        for every verb; a key claimed for another intent/slot is REFUSED. ONLY
  --        SUCCESSES ARE CACHED; a matching success replays with FRESH state + the
  --        original bought receipt + replayed:true (the hr_unlock_buy replay shape).
  select public.hr_intent_replay(v_uid, v_slot, p_intent_id, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object('replayed', true);
  end if;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════════
  -- All-or-nothing. Every rejection raises through hr_reject (HR000) and the
  -- handler undoes the whole block, so there is no state in which the scrip left
  -- and the item did not arrive (or vice versa) — the b372 half-undo, closed.
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if v_st.user_id is null then perform public.hr_reject('no_character'); end if;

    -- (a) OPTIMISTIC CONCURRENCY — MANDATORY. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (b) SCRIP BALANCE >= cost, read from player_state under the row lock. The
    --     price is the SERVER's (hr_qm_offers), never the client's.
    if v_st.dungeon_scrip < v_off.scrip_cost then
      perform public.hr_reject('insufficient_scrip',
        jsonb_build_object('have', v_st.dungeon_scrip, 'need', v_off.scrip_cost));
    end if;

    -- (c) PER-DAY PURCHASE FUSE (anti-replay insurance). Counts qm_buy rows for
    --     this character-day; over → daily_cap. Checked BEFORE the debit.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_count_today
      from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'dungeon'
       and meta->>'op' = 'qm_buy'
       and public.hr_utc_day_key(at) = v_day;
    if v_count_today >= c_daily_buy_cap then
      perform public.hr_reject('daily_cap',
        jsonb_build_object('dim', 'count', 'used', v_count_today,
                           'limit', c_daily_buy_cap, 'day', v_day));
    end if;

    -- (d) BANK CAP — a NEW stack costs space; a player at cap can still buy more of
    --     what they already hold (hr_apply's rule). Read the current holding under
    --     the lock; only a purchase that would create a new stack is bank-gated.
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = v_off.item_id for update;
    if v_have is null then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = v_slot
         limit v_st.bank_cap + 1) s;
      if v_stacks >= v_st.bank_cap then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;

    -- (e) DEBIT SCRIP + version bump. accrued_to UNTOUCHED (a purchase is not an
    --     activity change — stamping it would confiscate the elapsed accrual
    --     window, hr_unlock_buy's rule).
    update public.player_state
       set dungeon_scrip = dungeon_scrip - v_off.scrip_cost,
           version = version + 1,
           updated_at = now()
     where user_id = v_uid and slot = v_slot;

    -- (f) CREDIT THE ITEM — additive upsert (+1), the muster-chest idiom. One unit
    --     per purchase; the item is the SERVER's (v_off.item_id), never the client's.
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_off.item_id, 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;

    -- (g) THE JOURNAL. ONE row, kind='dungeon', meta.op='qm_buy'. qty_in/gold_in/
    --     xp_in = 0 explicit (a scrip-for-item trade, not a mint into the accrual
    --     inflow budget). meta.scrip is NEGATIVE (the spend), so the settle's
    --     positive-only earn sum excludes it (Condition-3: no laundering) and its
    --     op='qm_buy' keeps it out of the settle-count fuse.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, 'dungeon', v_intent, 0, 0, 0, 0, 0,
       jsonb_build_object('op', 'qm_buy', 'offer', v_off.offer_id, 'item', v_off.item_id,
                          'scrip', -v_off.scrip_cost, 'idem', p_intent_id));

    -- (h) THE RECEIPT + THE ENVELOPE, STATED BY THE SERVER. hr_state_of verbatim
    --     (the client renders it and computes nothing) plus what was bought.
    v_bought := jsonb_build_object('offer', v_off.offer_id, 'item', v_off.item_id,
                                   'scrip_spent', v_off.scrip_cost);
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('ok', true, 'bought', v_bought);

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_qm_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) CACHE THE DECISION — SUCCESS ONLY. A refusal (insufficient_scrip,
  --        bank_full, daily_cap) stays retryable; a version_conflict is not cached
  --        either, so a re-read retry can succeed. The cached value is the {ok,
  --        bought} receipt; the replay branch §(4) reunites it with FRESH state.
  if coalesce(v_out->>'ok', 'false') = 'true' then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_intent_id, v_slot, v_intent,
              jsonb_build_object('ok', true, 'bought', v_out->'bought'), now())
      on conflict (user_id, intent_id) do nothing;
  else
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;

  return v_out;
end $$;

-- ── 2. GRANTS — revoke from PUBLIC first, then grant to hr_engine ONLY ──────
-- ⚠ IF THE BROWSER COULD CALL THIS, THE BROWSER COULD BUY FOR ITSELF with p_user
--   its own id and grant an item without the Edge Function in the way. Engine-only,
--   exactly like hr_dungeon_settle: the client sends an INTENT to the Edge Function
--   (POST /hr-accrue), which is the only caller.
revoke execute on function public.hr_quartermaster_buy(uuid, int, bigint, uuid, text) from public;
revoke execute on function public.hr_quartermaster_buy(uuid, int, bigint, uuid, text)
  from anon, authenticated, service_role;
grant  execute on function public.hr_quartermaster_buy(uuid, int, bigint, uuid, text) to hr_engine;

-- ── 3. STRUCTURAL ASSERTIONS ───────────────────────────────────────────────
do $$
declare v_p oid; v_bad text;
begin
  v_p := to_regprocedure('public.hr_quartermaster_buy(uuid,int,bigint,uuid,text)');
  if v_p is null then raise exception 'hr_quartermaster_buy did not install'; end if;

  -- (a) THE ACL, enumerated (not summarised): no client role may execute it.
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_quartermaster_buy is EXECUTABLE BY % — a client that can call it can buy '
                      'for itself with no Edge Function in the way', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_quartermaster_buy is not executable by hr_engine — the only legitimate caller '
                    'cannot call it, so every purchase would 42883 and the verb is inert';
  end if;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'hr_quartermaster_buy is not SECURITY DEFINER — hr_engine holds no table grants';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception 'hr_quartermaster_buy has no pinned search_path — a definer function must pin it';
  end if;

  -- (b) THE ENGINE CAPABILITY PIN — hr_engine holds EXECUTE on this and NOTHING
  --     on the tables it writes. If it held a table grant, the whole "the engine
  --     can only propose to a re-validating function" property would be a lie.
  select string_agg(privilege_type, ',') into v_bad
    from information_schema.role_table_grants
   where grantee = 'hr_engine'
     and table_schema = 'public'
     and table_name in ('player_state','player_inventory','player_ledger','player_intents','hr_qm_offers');
  if v_bad is not null then
    raise exception 'hr_engine gained table privileges (%) — the capability pin is broken', v_bad;
  end if;

  raise notice 'quartermaster-buy §3 PASSED: engine-only ACL, SECURITY DEFINER + pinned search_path, '
               'engine capability pin (no table grants).';
end $$;

-- ── 4. hr_assert_grant_hygiene — admit the ONE new engine grant ─────────────
-- GENERATED by tools/derive-grant-hygiene.mjs (LINKS[8]) from
-- 2026-09-10-dungeon-settle.sql's committed body, INSERTIONS ONLY (one entry at
-- the head of c_engine_allow). Do NOT hand-edit; `--check` is a preflight in
-- tests/run-smoke.mjs and PART 1f-ii walks this as the chain's NINTH link. This
-- file is the CURRENT LAST TOUCHER of the detector. The body below therefore
-- carries the hr_quartermaster_buy, hr_dungeon_settle AND hr_attended_kills
-- allowlist entries — this file MUST APPLY AFTER 2026-09-10-dungeon-settle.sql.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
-- `create or replace` PRESERVES the existing ACL, so on a database that already
-- ran grant-hygiene this is belt-and-braces. Restated anyway (the lesson of every
-- restated body in this tree, and asserted by tests/run-sql-tests.mjs's grant
-- hygiene lint): a detector that arrives PUBLIC-executable for one migration is a
-- detector an attacker can read the allowlist out of. No `grant` line — this adds
-- no capability to anybody; it only records the reviewed engine-only grant
-- hr_quartermaster_buy already carries.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-VERIFYING GATE — a real purchase, in a ROLLED-BACK subtransaction ─
-- Proves the trade end to end on the installed engine, then raises to roll the
-- whole probe back to zero effect (no probe rows leak). Mirrors the settle §6.
do $$
declare
  v_uid uuid := '00000000-0000-0000-0000-00000000db01'::uuid;
  v_ver bigint;
  v_scrip0 bigint;
  v_res jsonb;
  v_res2 jsonb;
  v_qty bigint;
  v_led int;
  v_hyg jsonb;
  v_extra jsonb;
  v_offer text;
  v_item text;
  v_cost bigint;
begin
  begin
    -- A probe character with a known scrip balance and version. The gate runs as
    -- the MIGRATION OWNER throughout and drives the RPC through the AUTHENTICATED
    -- seam (set the JWT sub, leave the role alone), exactly like the settle §6 gate:
    -- with role <> hr_engine the RPC reads auth.uid() from the JWT claim and honours
    -- a matching p_user, so the whole probe's direct table reads keep the owner's
    -- access. hr_qm_offers is read by the SECURITY DEFINER RPC (which runs as owner),
    -- never by the engine role — the capability pin §3 asserts.
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
      values (v_uid, 0, 0, 0, 1000, 1)
      on conflict (user_id, slot) do update set dungeon_scrip = 1000, version = 1;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    -- Pick the cheapest offer so the probe does not depend on catalogue tuning.
    select offer_id, item_id, scrip_cost into v_offer, v_item, v_cost
      from public.hr_qm_offers order by scrip_cost asc, offer_id asc limit 1;
    if v_offer is null then raise exception 'GATE: hr_qm_offers empty at probe time'; end if;

    -- (a) A SERVER-PRICED PURCHASE debits exactly scrip_cost and grants one item.
    v_res := public.hr_quartermaster_buy(v_uid, 0, 1,
              '00000000-0000-0000-0000-0000000000a1'::uuid, v_offer);
    if coalesce(v_res->>'ok','false') <> 'true' then
      raise exception 'GATE: an affordable purchase was refused: %', v_res; end if;
    select dungeon_scrip, version into v_scrip0, v_ver from public.player_state
      where user_id = v_uid and slot = 0;
    if v_scrip0 <> 1000 - v_cost then
      raise exception 'GATE: scrip debit wrong — expected %, got %', 1000 - v_cost, v_scrip0; end if;
    select qty into v_qty from public.player_inventory
      where user_id = v_uid and slot = 0 and item_id = v_item;
    if coalesce(v_qty,0) <> 1 then raise exception 'GATE: item not granted (qty %)', v_qty; end if;

    -- (b) REPLAY-SAFE. The SAME intent id debits nothing more and grants nothing
    --     more; it returns replayed:true.
    v_res2 := public.hr_quartermaster_buy(v_uid, 0, v_ver,
               '00000000-0000-0000-0000-0000000000a1'::uuid, v_offer);
    if coalesce(v_res2->>'replayed','false') <> 'true' then
      raise exception 'GATE: a replay did not return replayed:true: %', v_res2; end if;
    select dungeon_scrip into v_scrip0 from public.player_state where user_id = v_uid and slot = 0;
    if v_scrip0 <> 1000 - v_cost then
      raise exception 'GATE: replay debited again (scrip now %)', v_scrip0; end if;
    select qty into v_qty from public.player_inventory
      where user_id = v_uid and slot = 0 and item_id = v_item;
    if coalesce(v_qty,0) <> 1 then raise exception 'GATE: replay granted again (qty %)', v_qty; end if;

    -- (c) THE SPEND ROW IS meta.op='qm_buy' WITH NEGATIVE scrip (Condition-3).
    select count(*) into v_led from public.player_ledger
      where user_id = v_uid and slot = 0 and kind = 'dungeon'
        and meta->>'op' = 'qm_buy' and (meta->>'scrip')::bigint = -v_cost;
    if v_led <> 1 then raise exception 'GATE: expected 1 qm_buy row with scrip=%, found %', -v_cost, v_led; end if;

    -- (d) INSUFFICIENT SCRIP is refused. A version bump happened on the buy, so
    --     read it; then try to buy the priciest offer against a near-empty wallet.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    update public.player_state set dungeon_scrip = 0 where user_id = v_uid and slot = 0;
    v_res := public.hr_quartermaster_buy(v_uid, 0, v_ver,
              '00000000-0000-0000-0000-0000000000a2'::uuid, v_offer);
    if v_res->>'error' <> 'insufficient_scrip' then
      raise exception 'GATE: a broke wallet was not refused insufficient_scrip: %', v_res; end if;

    -- (e) A FORGED OFFER id is refused unknown_offer.
    v_res := public.hr_quartermaster_buy(v_uid, 0, v_ver,
              '00000000-0000-0000-0000-0000000000a3'::uuid, 'not_a_real_offer');
    if v_res->>'error' <> 'unknown_offer' then
      raise exception 'GATE: a forged offer was not refused unknown_offer: %', v_res; end if;

    raise exception using errcode = 'HR820', message = 'quartermaster-buy §5 complete — rolling back';
  exception when sqlstate 'HR820' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id=v_uid)
     or exists (select 1 from public.player_ledger where user_id=v_uid)
     or exists (select 1 from public.player_intents where user_id=v_uid)
     or exists (select 1 from public.player_inventory where user_id=v_uid)
     or exists (select 1 from auth.users where id=v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row'; end if;

  -- (f) THE ENGINE ALLOWLIST ADMITS hr_quartermaster_buy (the detector no longer
  --     raises engine_execute_outside_allowlist on it).
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_hyg := public.hr_assert_grant_hygiene(false);
    v_extra := coalesce(v_hyg->'engine_execute_outside_allowlist', v_hyg->'engine_extra', '[]'::jsonb);
    if v_extra @> to_jsonb('hr_quartermaster_buy(uuid,integer,bigint,uuid,text)'::text) then
      raise exception 'GATE: hr_quartermaster_buy is an UNALLOWLISTED engine grant — §4 did not admit it';
    end if;
  end if;

  raise notice 'quartermaster-buy: server-priced debit, item granted, idempotent replay, '
               'insufficient_scrip + unknown_offer refused, qm_buy ledger row negative, '
               'engine allowlist admits the verb — all green';
end $$;
