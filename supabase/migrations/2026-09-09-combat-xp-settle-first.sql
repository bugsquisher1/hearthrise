-- ============================================================================
-- 2026-09-09-combat-xp-settle-first.sql
-- A CREDIT MAY NOT TRIM A WINDOW IT DID NOT PAY FOR.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. The Coordinator applies after a
-- Security GO (this touches XP, a RANKED surface). It must be applied AFTER
-- 2026-09-06-cadence-recovery-floor.sql, and tests/schema-apply-order.json
-- places it there (index 160 vs 148).
--
-- RESTATEMENT-DEBT-ACK: hr_credit_combat_xp__ungated is a 4-deep chain; the only
-- safe form of a one-line precondition on a body whose live text (16,801 chars)
-- exists in NO file is an anchored patch of the installed text. The first draft
-- of this file was a literal restatement reconstructed from the 2026-08-31 file
-- and it SILENTLY DROPPED the 2026-09-06 recovery floor, the not-in-combat cap
-- and the kind_mismatch audit signal - caught pre-apply by live-hash-drift. A
-- restatement is slice 7's job with a replayed body in front of it, not this
-- P1's. See "THE REVERT THIS FILE AVOIDS" below.
--
-- -- THE REPORT ---------------------------------------------------------------
-- Paione, 2026-09-09 ~11:52 UTC, b529: "I did some offline combat. The items and
-- kills are given but the experience is not."
--
-- -- THE LIVE LEDGER (read-only, production, user bf18bd7f... slot 0) ---------
--   combat xp_credit  xp_in=12   @11:51:40.816
--   combat xp_credit  xp_in=64   @11:52:05.561
--   combat xp_credit  xp_in=146  @11:52:27.315
--   combat accrue     ms=14,552,349  kills=828  xp_in=0  @11:52:30.548
--                     delta = { g, i, k } - NO `x` KEY AT ALL.
--
-- Four hours and two minutes of away combat: 828 clay golems killed, 23,068 gold
-- and every item paid. Combat XP: zero. The player earned roughly 266,000 XP and
-- was given 222.
--
-- -- THE MECHANISM ------------------------------------------------------------
-- The client boots, resumes its fight, and its ~60 s attended combat-XP cadence
-- (plus requestAccrual's own credit-before-settle flush) calls
-- hr_credit_combat_xp THREE TIMES before the away settle reaches the server. Each
-- accepted call ends with, unconditionally:
--
--     update public.player_state set combat_xp_accrued_to = now() ...
--
-- The settle then computes (accrual.js, "THE COMBAT-XP WATERMARK SPLIT")
--
--     xpEligibleFromMs = max(credit.fromMs, combat_xp_accrued_to)
--
-- which is now() - the END of the window - so every XP grant in the simulation is
-- ineligible and `delta.x` is never emitted. Loot, gold and the kill counters are
-- NOT watermark-split, which is exactly why they paid and only XP did not: the
-- symptom the player described, precisely.
--
-- Condition 2 of the 2026-08-31 review already floors the credit's own window at
-- accrued_to - it stops the credit PAYING for unsettled time. It does not stop the
-- credit CLAIMING to have paid for it. That gap is this file.
--
-- -- THE SCALE (30-day census, read-only, production) -------------------------
--   918 `combat accrue` rows; only 141 carry an `x` key.
--   Away rows with kills>0 and ms>10min and no `x`: 17 rows, 2 players,
--   3,991 kills, 216,647,185 ms (60.2 hours) of combat that paid no XP.
--
-- -- THE RULE THIS FILE INSTALLS ----------------------------------------------
-- A credit may only speak for a window the settle has already closed. While
-- `now() - accrued_to > c_settle_first_ms` (180 s, mirrored from
-- src/core/combat-xp-cap.js COMBAT_XP_SETTLE_FIRST_MS and pinned by
-- tests/combat-xp-cap-drift.mjs) the RPC REFUSES:
--
--     { ok:false, error:'settle_first', unsettled_ms:..., threshold_ms:... }
--
-- and writes NOTHING - no player_skills row, no player_ledger row, no
-- hr_combat_xp_credit_log row and, decisively, NO WATERMARK MOVE. The refusal is
-- the same shape and intent as hr_rest / hr_set_combat_style's `collect_first`.
--
-- -- WHY REFUSAL AND NOT THE TWO ALTERNATIVES ---------------------------------
-- (b) "advance the watermark only to accrued_to." Leaves the credit's own elapsed
--     - which is ALSO the plausibility cap's basis - spanning hours of unsettled
--     time. Paione's third call was capped against 4h02m of physical-max XP when
--     it should have been capped against 25 s. (b) does not touch the forgery half.
-- (c) "the settle ignores a watermark advanced while the window was unpaid."
--     New state, re-derives a fact the server already has, cap still inflated.
-- (a) refusal removes both at once, adds no column, and is a pure precondition.
--
-- -- IT CANNOT BE GAMED BY ORDERING -------------------------------------------
-- Settle -> credit: accrued_to = now(), so the credit is ADMITTED and its window
--   (floored at accrued_to by Condition 2) is ~0 -> cap 0 -> it pays nothing.
-- Credit -> settle, window fresh (<180 s): admitted, pays the attended residue,
--   stamps the watermark - the honest live path, unchanged.
-- Credit -> settle, window stale (>180 s): REFUSED, nothing written, the settle
--   pays the whole away window's XP. The trim can no longer be armed.
-- A forger who withholds the settle to keep crediting: refused forever.
-- A forger who calls at 179 s to inflate the cap: bounded by 180 s of physical
--   max instead of an unbounded absence, and still by the 5M/day combat ceiling.
--
-- -- IT COSTS NOTHING WHEN IT REFUSES AN HONEST PLAYER ------------------------
-- A live player whose settle is late is refused and DEFERS, never loses: the
-- client keeps the pending XP, the settle lands, and the next flush's cap
-- (~497,640 XP per minute at damage level 99) drains the backlog many times over.
--
-- -- THE REVERT THIS FILE AVOIDS (why it is a PATCH, not a restatement) -------
-- The live body is not the 2026-08-31 text. 2026-09-06-cadence-recovery-floor.sql
-- section 2 patched it FOUR times, adding:
--   1. the declares v_recovering / v_active_since / v_combat_end;
--   2. reading recovering_until + active_since in the SAME row lock, and the
--      RECOVERY FLOOR  v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));
--      plus the NOT-IN-COMBAT window end  v_combat_end;
--   3. the window END-CAP  v_elapsed := greatest(0, ... (v_combat_end - v_wm) ...);
--   4. two short-circuits before any write: `recovering` (with the
--      xp_credit_while_recovering once-a-day ledger row) and `not_in_combat`
--      (xp_credit_not_in_combat).
-- A `create or replace` from the 2026-08-31 text would delete all four - the b484
-- revert class - and would also have dropped the `kind_mismatch` audit field and
-- the day_used/day_budget/dmg_level receipt fields the 08-31 body actually
-- returns. Sections 1a-1c below therefore SPLICE the precondition into the
-- installed text, and section 2 GATE(R*) / GATE(RX*) assert every one of those
-- four properties survived, by strpos AND by execution.
--
-- ADDITIVE + IDEMPOTENT: three anchored patches guarded by a marker check, so a
-- second apply is a no-op notice. No schema change, no data change, no drops.
-- REVERSIBLE: re-apply 2026-08-31-combat-xp-credit.sql followed by
-- 2026-09-06-cadence-recovery-floor.sql (both are idempotent) to restore the
-- pre-settle-first body exactly.
-- ============================================================================

-- -- 0. PRECONDITIONS - fail closed rather than install half a rule -----------
do $$
begin
  if to_regprocedure('public.hr_credit_combat_xp__ungated(int,jsonb,text)') is null then
    raise exception 'PRECONDITION: hr_credit_combat_xp__ungated is absent - apply 2026-08-31-combat-xp-credit.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='accrued_to') then
    raise exception 'PRECONDITION: player_state.accrued_to is absent - the settle watermark this rule reads does not exist';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='combat_xp_accrued_to') then
    raise exception 'PRECONDITION: player_state.combat_xp_accrued_to is absent';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='recovering_until') then
    raise exception 'PRECONDITION: player_state.recovering_until is absent - apply 2026-09-06-recovering-until.sql first';
  end if;
  -- CHAIN POSITION. This file anchors on text that 2026-09-06-cadence-recovery-floor.sql
  -- left behind. Applied out of order it would match nothing and no-op IN SILENCE,
  -- which is the failure mode tests/patch-chain-guard.mjs exists to shout about.
  if strpos(pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure),
            'SECURITY F1 - THE RECOVERY FLOOR') = 0 then
    raise exception 'PRECONDITION: the installed hr_credit_combat_xp__ungated does not carry the 2026-09-06 recovery floor - apply 2026-09-06-cadence-recovery-floor.sql FIRST, or this patch would anchor on a body that no longer exists';
  end if;
end $$;

-- -- 1. THE SETTLE-FIRST PRECONDITION, SPLICED INTO THE INSTALLED BODY --------
-- Read the live text, assert each anchor matches EXACTLY ONCE, splice, execute.
-- Nothing is restated; the recovery floor, the not-in-combat cap, Condition 2,
-- the advisory lock, the day budget and the journal are the bytes already
-- running on production.
do $mig$
declare
  v_def text;
  v_a1 constant text := '  v_out_credit jsonb := ''{}''::jsonb;';
  v_a2 constant text := '    where user_id = v_uid and slot = v_slot for update;
  v_wm := greatest(v_wm, v_accrued);';
  v_a3 constant text := '          ''skills'', v_applied, ''throttled'', v_throttled,';
begin
  v_def := pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure);
  -- NORMALISE, not patch: a body applied from a CRLF working copy is STORED with
  -- CRLF and an LF-joined anchor would then match nothing.
  v_def := replace(v_def, chr(13), '');

  if strpos(v_def, 'SETTLE-FIRST (2026-09-09)') > 0 then
    raise notice 'hr_credit_combat_xp__ungated already carries the settle-first precondition - skipping (idempotent no-op)';
  else
    -- Each anchor must appear EXACTLY ONCE. A silent no-op is the whole hazard.
    if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
      raise exception 'ANCHOR 1a (the declare tail) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
    end if;
    if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception 'ANCHOR 1b (the row lock + Condition 2) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
    end if;
    if (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3) <> 1 then
      raise exception 'ANCHOR 1c (the journal meta) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3);
    end if;

    -- 1a. THE DECLARES. c_settle_first_ms mirrors COMBAT_XP_SETTLE_FIRST_MS in
    --     src/core/combat-xp-cap.js and is pinned by tests/combat-xp-cap-drift.mjs.
    v_def := replace(v_def, v_a1,
      $anc$  -- SETTLE-FIRST (2026-09-09). Mirrors COMBAT_XP_SETTLE_FIRST_MS in
  -- src/core/combat-xp-cap.js; bound by tests/combat-xp-cap-drift.mjs.
  c_settle_first_ms constant bigint := 180000;
  v_unsettled bigint;
  v_out_credit jsonb := '{}'::jsonb;$anc$);

    -- 1b. THE REFUSAL. Sited immediately after the row lock that reads accrued_to
    --     and BEFORE Condition 2, the recovery floor, every short-circuit and
    --     every write - so a refusal touches nothing at all. Both timestamps are
    --     the server's; nothing here is client-supplied. It is AFTER the
    --     idempotency replay read (which is above the lock) deliberately: a key
    --     that was already applied describes a window already accounted for and
    --     must keep answering the same thing even if an absence has opened since.
    v_def := replace(v_def, v_a2,
      $anc$    where user_id = v_uid and slot = v_slot for update;

  -- SETTLE-FIRST (2026-09-09) - THE UNPAID AWAY WINDOW IS NOT THIS VERB'S TO
  -- STAMP OVER. Refuse BEFORE any write: no XP, no ledger, no idem row and -
  -- the load-bearing half - no watermark move, so the settle still sees the
  -- window as unpaid and credits every hour of it. The client keeps its pending
  -- XP and re-flushes after the settle, when its honest elapsed is small.
  --   This is a STALENESS bound and it does not replace anything below it:
  --   Condition 2 still bounds the WINDOW, the recovery floor still bounds its
  --   START at a knockout, and the not-in-combat cap still bounds its END.
  v_unsettled := floor(extract(epoch from (now() - v_accrued)) * 1000)::bigint;
  if v_accrued is not null and v_unsettled > c_settle_first_ms then
    return jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', v_unsettled, 'threshold_ms', c_settle_first_ms, 'slot', v_slot);
  end if;

  v_wm := greatest(v_wm, v_accrued);$anc$);

    -- 1c. THE JOURNAL. How stale the settle was when an ADMITTED credit was paid;
    --     the refusal path writes nothing, so this is the only place the number
    --     can be measured from. Value-free, on a row that already exists.
    v_def := replace(v_def, v_a3,
      $anc$          'skills', v_applied, 'throttled', v_throttled,
          'unsettled_ms', v_unsettled,$anc$);

    execute v_def;
    raise notice 'hr_credit_combat_xp__ungated: the settle-first precondition is installed';
  end if;
end $mig$;

-- -- 1d. GRANTS - revoke before grant, and NOTHING MOVES ----------------------
-- create-or-replace preserves an ACL; the explicit restatement is what GATE(a)
-- asserts. The signature is unchanged, so no client call form moves and
-- hr_client_rpc_baseline needs no new row.
revoke execute on function public.hr_credit_combat_xp__ungated(int,jsonb,text)
  from public, anon, authenticated, service_role;

-- -- 2. SECTION 4 SELF-CHECK - properties asserted by EXECUTING SQL -----------
-- Every gate below runs the real function. Nothing is asserted by a marker alone.
-- All fixture rows live in a subtransaction that is rolled back, and the final
-- leak check proves the rollback took.
do $$
declare
  v      jsonb;
  v_def  text;
  v_uid  constant uuid := '000000c9-0000-0000-0000-0000000000c9';
  v_slot constant int  := 0;
  v_atk0 bigint; v_atk1 bigint;
  v_wm0  timestamptz; v_wm1 timestamptz;
  v_ledger0 bigint; v_log0 bigint;
begin
  -- (a) THE PRIVILEGE LINE IS UNCHANGED BY THE PATCH.
  if has_function_privilege('authenticated','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is client-executable - the gate is decoration';
  end if;
  if has_function_privilege('anon','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is anon-executable';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_combat_xp(int,jsonb,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated - the feature is dead';
  end if;
  if has_function_privilege('authenticated','public.hr_combat_xp_cap(int,bigint)','execute') then
    raise exception 'GATE(a): hr_combat_xp_cap is client-executable';
  end if;
  if not (select prosecdef from pg_proc
           where oid = 'public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure) then
    raise exception 'GATE(a): __ungated lost SECURITY DEFINER';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on the XP tables this verb owns.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_skills'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_skills - XP is client-forgeable';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_combat_xp_credit_log' and cmd <> 'SELECT') then
    raise exception 'GATE(b): hr_combat_xp_credit_log grew a non-SELECT policy';
  end if;

  -- -- (R) NOTHING WAS REVERTED. The b484 class: this file patches a body that
  --        three earlier migrations built. Every property they installed is named
  --        here by the string they asserted on, so a future restatement of this
  --        file fails HERE rather than on production.
  v_def := replace(pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'SETTLE-FIRST (2026-09-09)') = 0 then
    raise exception 'GATE(R0): the settle-first splice is not in the installed body - section 1 no-oped';
  end if;
  if strpos(v_def, 'recovering_until') = 0
     or strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') = 0
     or strpos(v_def, 'v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));') = 0 then
    raise exception 'GATE(R1): the 2026-09-06 RECOVERY FLOOR is gone - this patch reverted it (b484 class)';
  end if;
  if strpos(v_def, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0
     or strpos(v_def, 'v_combat_end := case when v_active_kind is distinct from ''combat''') = 0
     or strpos(v_def, 'v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end - v_wm)) * 1000)::bigint);') = 0 then
    raise exception 'GATE(R2): the 2026-09-06 NOT-IN-COMBAT CAP (window end + end-cap) is gone';
  end if;
  if strpos(v_def, 'xp_credit_while_recovering') = 0
     or strpos(v_def, 'xp_credit_not_in_combat') = 0 then
    raise exception 'GATE(R3): a 2026-09-06 short-circuit ledger intent is gone - the forgery tells are unrecorded';
  end if;
  if strpos(v_def, 'v_wm := greatest(v_wm, v_accrued);') = 0 then
    raise exception 'GATE(R4): CONDITION 2 (the settle-watermark floor, Security 2026-08-31) is gone';
  end if;
  if strpos(v_def, 'pg_advisory_xact_lock') = 0 or strpos(v_def, 'for update') = 0 then
    raise exception 'GATE(R5): the per-character lock is gone - two credits can interleave';
  end if;
  if strpos(v_def, 'hr_day_budget_check') = 0 or strpos(v_def, 'c_combat_xp_day_budget') = 0 then
    raise exception 'GATE(R6): the day budget check / 5M daily combat ceiling is gone';
  end if;
  if strpos(v_def, 'insert into public.hr_combat_xp_credit_log') = 0 then
    raise exception 'GATE(R7): the idempotency journal write is gone - every key would replay as new';
  end if;
  if strpos(v_def, 'kind_mismatch') = 0 then
    raise exception 'GATE(R8): the kind_mismatch audit signal (Security 2026-08-31) is gone';
  end if;
  if strpos(v_def, 'c_settle_first_ms constant bigint := 180000;') = 0 then
    raise exception 'GATE(R9): the threshold constant is not 180000 - it must equal COMBAT_XP_SETTLE_FIRST_MS';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;

    -- -- (P) THE PAIONE SEQUENCE, EXECUTED ------------------------------------
    --     The exact live ordering: a character mid-fight whose last settle was
    --     4h02m ago, then THREE attended credits from the booting client, then the
    --     away settle. ON THE OLD BODY every credit succeeded and stamped
    --     combat_xp_accrued_to = now(); GATE(P3) is the assertion that failed live.
    --     active_kind/active_since are 'combat' throughout because the 2026-09-06
    --     not-in-combat cap would otherwise short-circuit every call and make each
    --     gate below vacuously true.
    --     active_id is NOT NULL because player_state_activity_chk requires
    --     (active_kind = 'idle') = (active_id is null).
    insert into public.player_state (user_id, slot, gold, gems, version,
        combat_xp_accrued_to, accrued_to, active_kind, active_id, active_since, recovering_until)
      values (v_uid, v_slot, 0, 0, 1,
        now() - interval '4 hours 2 minutes', now() - interval '4 hours 2 minutes',
        'combat', 'hr_probe_target', now() - interval '4 hours 2 minutes', null)
      on conflict (user_id, slot) do update set gold = 0,
        combat_xp_accrued_to = now() - interval '4 hours 2 minutes',
        accrued_to = now() - interval '4 hours 2 minutes',
        active_kind = 'combat', active_id = 'hr_probe_target',
        active_since = now() - interval '4 hours 2 minutes',
        recovering_until = null;
    -- AFTER player_state: player_skills is keyed to the character row.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 100000 from unnest(array['attack','strength','defense','hitpoints','ranged','magic','prayer']) s
      on conflict do nothing;

    select xp into v_atk0 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    select combat_xp_accrued_to into v_wm0 from public.player_state where user_id=v_uid and slot=v_slot;
    select count(*) into v_ledger0 from public.player_ledger where user_id=v_uid;
    select count(*) into v_log0 from public.hr_combat_xp_credit_log where user_id=v_uid;

    -- (P1) all three credits are REFUSED with settle_first.
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 12), 'paione-1');
    if coalesce(v->>'error','') <> 'settle_first' then
      raise exception 'GATE(P1): credit #1 over an unpaid 4h window was not refused: %', v;
    end if;
    if (v->>'unsettled_ms')::bigint < 14400000 then
      raise exception 'GATE(P1): the refusal did not report the real unsettled window: %', v;
    end if;
    if (v->>'threshold_ms')::bigint <> 180000 then
      raise exception 'GATE(P1): the refusal reports threshold_ms %, not 180000', v->>'threshold_ms';
    end if;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 40, 'strength', 24), 'paione-2');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P1): credit #2 was not refused: %', v; end if;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 90, 'hitpoints', 56), 'paione-3');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P1): credit #3 was not refused: %', v; end if;

    -- (P2) A REFUSAL IS A TOTAL NO-OP. No XP, no ledger row, no idempotency row -
    --      a burnt key would make the client's retry-after-settle a silent replay.
    if (select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack') <> v_atk0 then
      raise exception 'GATE(P2): a refused credit still moved XP';
    end if;
    if (select count(*) from public.player_ledger where user_id=v_uid) <> v_ledger0 then
      raise exception 'GATE(P2): a refused credit wrote a ledger row';
    end if;
    if (select count(*) from public.hr_combat_xp_credit_log where user_id=v_uid) <> v_log0 then
      raise exception 'GATE(P2): a refused credit burnt an idempotency key';
    end if;

    -- (P3) THE WATERMARK DID NOT MOVE - so the settle's
    --      xpEligibleFromMs = max(fromMs, combat_xp_accrued_to) stays at the START
    --      of the away window and every hour of its XP is eligible. This is the
    --      assertion that was false in production at 11:52:30 UTC.
    select combat_xp_accrued_to into v_wm1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_wm1 <> v_wm0 then
      raise exception 'GATE(P3): a refused credit ARMED THE TRIM - combat_xp_accrued_to moved % -> %', v_wm0, v_wm1;
    end if;
    if v_wm1 > (select accrued_to from public.player_state where user_id=v_uid and slot=v_slot) then
      raise exception 'GATE(P3): the XP watermark LEADS the settle watermark over an unpaid window - the settle will trim';
    end if;

    -- (P4) THE SETTLE RUNS (accrued_to := now()) AND THE CLIENT RE-FLUSHES: the
    --      credit is now ADMITTED and - Condition 2 - pays ~0 for the window the
    --      settle just claimed. The pending XP is credited by the NEXT flush (P5).
    update public.player_state set accrued_to = now() where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 142), 'paione-4');
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(P4): the post-settle credit was still refused: %', v;
    end if;
    if coalesce((v->>'credit')::bigint, -1) <> 0 then
      raise exception 'GATE(P4): the post-settle credit paid % for a window the settle just closed', v->>'credit';
    end if;

    -- (P5) THE HONEST LIVE PATH IS UNTOUCHED. A settle 60 s ago with a watermark
    --      60 s ago: admitted, credited in full, watermark advances.
    update public.player_state
       set accrued_to = now() - interval '60 seconds',
           combat_xp_accrued_to = now() - interval '60 seconds'
     where user_id = v_uid and slot = v_slot;
    select xp into v_atk0 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    select combat_xp_accrued_to into v_wm0 from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 5000), 'paione-live');
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(P5): an honest live credit was refused: %', v; end if;
    select xp into v_atk1 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    if v_atk1 <> v_atk0 + 5000 then
      raise exception 'GATE(P5): an honest live credit did not pay in full (% -> %)', v_atk0, v_atk1;
    end if;
    select combat_xp_accrued_to into v_wm1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_wm1 <= v_wm0 then raise exception 'GATE(P5): the watermark did not advance on an honest live credit'; end if;
    -- ...and the admitted receipt still carries the fields the 2026-08-31 body
    -- returns, which a restatement of this file would silently drop.
    if v->>'day_budget' is null or v->>'dmg_level' is null then
      raise exception 'GATE(P5): the receipt lost day_budget/dmg_level - the body was restated, not patched: %', v;
    end if;

    -- (P6) THE THRESHOLD IS THE ONE THE JS MIRRORS. 179 s admitted, 181 s refused.
    update public.player_state set accrued_to = now() - interval '179 seconds',
           combat_xp_accrued_to = now() - interval '179 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 10), 'edge-179');
    if v->>'error' = 'settle_first' then raise exception 'GATE(P6): 179 s was refused - the threshold drifted DOWN'; end if;
    update public.player_state set accrued_to = now() - interval '181 seconds',
           combat_xp_accrued_to = now() - interval '181 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 10), 'edge-181');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P6): 181 s was admitted - the threshold drifted UP: %', v; end if;

    -- (P7) A REPLAY OF AN ALREADY-APPLIED KEY still answers, even mid-absence.
    update public.player_state set accrued_to = now() - interval '5 hours'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 5000), 'paione-live');
    if coalesce((v->>'replay')::boolean, false) is not true then
      raise exception 'GATE(P7): a replay mid-absence was refused instead of answered: %', v;
    end if;

    -- (P8) THE OTHER REFUSALS SURVIVED (a non-combat skill is still refused whole).
    update public.player_state set accrued_to = now(), combat_xp_accrued_to = now() - interval '60 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('woodcutting', 100), 'edge-badskill');
    if coalesce(v->>'error','') <> 'bad_skill' then raise exception 'GATE(P8): a non-combat skill was not refused: %', v; end if;

    -- -- (RX) THE 2026-09-06 ARMS STILL FIRE, BY EXECUTION --------------------
    -- (RX1) KNOCKED OUT, settle fresh: settle-first ADMITS and the recovery floor
    --       refuses with reason 'recovering', paying zero and moving no watermark.
    update public.player_state
       set accrued_to = now(), combat_xp_accrued_to = now() - interval '60 seconds',
           active_kind = 'combat', active_id = 'hr_probe_target',
           active_since = now() - interval '10 minutes',
           recovering_until = now() + interval '5 minutes'
     where user_id = v_uid and slot = v_slot;
    select xp into v_atk0 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    select combat_xp_accrued_to into v_wm0 from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 4000), 'ko-1');
    if coalesce(v->>'reason','') <> 'recovering' then
      raise exception 'GATE(RX1): the 2026-09-06 recovery floor did not fire - this patch reverted it: %', v;
    end if;
    if (select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack') <> v_atk0 then
      raise exception 'GATE(RX1): XP was credited to a knocked-out character';
    end if;
    if (select combat_xp_accrued_to from public.player_state where user_id=v_uid and slot=v_slot) <> v_wm0 then
      raise exception 'GATE(RX1): the recovering arm stamped the watermark - the knockout window is retired unpaid';
    end if;

    -- (RX2) NOT IN COMBAT, settle fresh: the not-in-combat cap still fires.
    update public.player_state
       set accrued_to = now(), combat_xp_accrued_to = now() - interval '60 seconds',
           active_kind = 'idle', active_id = null,
           active_since = now() - interval '10 minutes',
           recovering_until = null
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 4000), 'nic-1');
    if coalesce(v->>'reason','') <> 'not_in_combat' then
      raise exception 'GATE(RX2): the 2026-09-06 not-in-combat cap did not fire - this patch reverted it: %', v;
    end if;

    -- (RX3) PRECEDENCE: knocked out AND the settle stale -> settle_first wins and
    --       writes NOTHING, not even the once-a-day recovering ledger row. The
    --       staleness bound is the outermost precondition, by construction.
    update public.player_state
       set accrued_to = now() - interval '4 hours', combat_xp_accrued_to = now() - interval '4 hours',
           active_kind = 'combat', active_id = 'hr_probe_target',
           active_since = now() - interval '4 hours',
           recovering_until = now() + interval '5 minutes'
     where user_id = v_uid and slot = v_slot;
    select count(*) into v_ledger0 from public.player_ledger where user_id=v_uid;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 4000), 'ko-stale');
    if coalesce(v->>'error','') <> 'settle_first' then
      raise exception 'GATE(RX3): a stale-settle credit on a knocked-out character was not refused first: %', v;
    end if;
    if (select count(*) from public.player_ledger where user_id=v_uid) <> v_ledger0 then
      raise exception 'GATE(RX3): the settle_first refusal still wrote a ledger row';
    end if;

    raise exception using errcode = 'HR821', message = 'combat-xp-settle-first section 2 complete - rolling back';
  exception when sqlstate 'HR821' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state           where user_id = v_uid)
     or exists (select 1 from public.player_ledger       where user_id = v_uid)
     or exists (select 1 from public.player_skills       where user_id = v_uid)
     or exists (select 1 from public.hr_combat_xp_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users                 where id = v_uid) then
    raise exception 'GATE: section 2 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(g): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(g): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'combat-xp-settle-first: hr_credit_combat_xp refuses (settle_first) over an unpaid away '
               'window, writes nothing and leaves combat_xp_accrued_to unmoved so the settle pays the '
               'whole absence; the recovery floor, the not-in-combat cap, Condition 2 and the honest '
               'live credit are all unchanged - all green';
end $$;
