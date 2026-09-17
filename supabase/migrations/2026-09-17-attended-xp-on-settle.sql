-- ============================================================================
-- 2026-09-17-attended-xp-on-settle.sql
-- A SETTLE MAY NOT SILENTLY REPRICE ATTENDED COMBAT AS AWAY COMBAT.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. The Coordinator applies after a
-- Security GO (this moves XP, a RANKED surface). It must be applied AFTER
-- 2026-09-09-combat-xp-settle-first.sql, 2026-09-06-cadence-recovery-floor.sql
-- and 2026-09-14-hr-apply-restatement.sql; Section 0 fails closed on each, and
-- tests/schema-apply-order.json places it last.
--
-- RESTATEMENT-DEBT-ACK: this file adds FOUR anchored patches to
-- hr_credit_combat_xp__ungated, whose chain is already 7 deep since
-- 2026-08-31-combat-xp-credit.sql, and ONE to hr_apply, restated three days ago.
-- tests/patch-chain-guard.mjs is right to ask for a restatement and this is not
-- the file to pay it in, for the reason 2026-09-09 gave and 2026-09-14 proved:
-- the LIVE body is not readable from an agent's seat, so a restatement authored
-- here would install the REPO's replay of the function over production's and
-- silently revert anything the two differ by - on the body that decides how much
-- XP a character may hold. That is the b484 class, and it already happened once
-- on this exact function: the first draft of 2026-09-09 was a literal
-- restatement and it DROPPED the 2026-09-06 recovery floor, the not-in-combat
-- cap and the kind_mismatch audit signal, caught only by live-hash-drift.
--   WHAT IS DONE INSTEAD, so the debt is bounded rather than merely deferred:
--   every anchor is asserted to match EXACTLY ONCE and the migration RAISES on
--   any other count (the "patch that no-ops in silence" failure mode the guard
--   names is closed by construction), and Section 4 re-reads the INSTALLED text
--   and names, by the string each earlier file asserted on, the settle-first
--   precondition, the recovery floor, the not-in-combat cap, CONDITION 2, the
--   lock, the day budget, the idempotency write, hr_apply's watermark clamp and
--   two of its SET-list members - so a silent revert fails HERE, on apply, not
--   on production.
--   THE PAYDOWN is a Coordinator-side restatement of hr_credit_combat_xp__ungated
--   authored FROM the live body (pg_get_functiondef during an apply window,
--   diffed against tests/schema-drift's replay, then the whole function in one
--   file). It is a lane of its own; it must not ride a P1 XP fix.
--
-- -- THE REPORT ---------------------------------------------------------------
-- systems-engineer, 2026-09-17 (set/b548, ad3bdd97). Vitals: `settle_first`
-- refusals x27 (09-16) and x14 (09-17) on ONE character.
--
-- -- THE MECHANISM (the hole b548's client half could not close) --------------
-- 1. A backgrounded tab stops the ~90 s settle cadence. `accrued_to` goes stale.
-- 2. The tab's ~60 s combat-XP flush arrives with accrued_to > 180 s stale, and
--    2026-09-09's SETTLE-FIRST precondition refuses it: `settle_first`.
--    That refusal is CORRECT - the credit must not stamp over an unpaid window.
-- 3. b548 (ad3bdd97) made the client DEFER the pending XP instead of dropping
--    it, settle, then re-submit. That fixed the DISCARD.
-- 4. But the settle drives accrued_to to now(), so on the retry CONDITION 2
--    (`v_wm := greatest(v_wm, v_accrued)`) floors the credit's window at the NEW
--    watermark: elapsed ~ 0 => hr_combat_xp_cap(dmg, ~0) = 0 => the retry credits
--    NOTHING. The window has already been priced, by the AWAY simulation, which
--    undercounts attended combat by 60-99% (src/legacy.js:3606-3610).
--
-- So the deferred claim is admitted and then capped to zero. The class is the
-- attended-settle gap: b501 closed client-minted keys, b504 closed attended LOOT
-- credit, and combat XP is the third face of the same thing.
--
-- -- WHAT THIS FILE DOES -----------------------------------------------------
-- It gives the credit verb a SECOND, disjoint window to price: the span the
-- settle just closed. Two anchored patches, no restatement.
--
--   (A) hr_apply STAMPS THE SPAN IT JUST PRICED. On an accrual delta that
--       actually moves the watermark, and only when the span is longer than the
--       settle-first threshold and no longer than an hour, it writes
--           player_state.combat_settle_span
--             = { from: <old accrued_to>, to: <new accrued_to>, sim_xp: <n> }
--       where sim_xp is the SUM of the COMBAT skills in the very delta it is
--       applying - i.e. exactly what the away simulation paid for that span.
--       Every other delta (an equip, a market intent, a short settle, a settle
--       that moved nothing) sets it to NULL. Three server values and a server
--       clock; nothing here is client-supplied and nothing is client-writable.
--
--   (B) hr_credit_combat_xp__ungated TOPS UP THAT SPAN, ONCE. When the stamped
--       span ENDS EXACTLY at the watermark this call read under its own row
--       lock, and it is fresh (<= 120 s), and the character has been in the SAME
--       combat bout since before the span began, and no knockout overlaps it,
--       the call's physical budget gains
--           topup = max(0, hr_combat_xp_cap(dmg_level, span_ms) - span.sim_xp)
--       and the span is CONSUMED (set to NULL) in the same locked UPDATE.
--
-- -- WHY THIS IS NOT A FAUCET -------------------------------------------------
--   * It is a CAP, not a grant. The client's claim is still `least(claim, pool)`
--     through the untouched distribution loop. A claim of 10^12 credits exactly
--     what the physical cap allows and nothing more.
--   * It is INSTEAD OF, never BOTH, and the subtraction is the proof: the total
--     combat XP a character can hold for the span is
--         sim_xp + max(0, cap(span) - sim_xp)  ==  max(sim_xp, cap(span))
--     which is <= cap(span) whenever the away sim is under the cap (it always
--     is; the cap is a deliberate over-estimate). If the sim already paid MORE
--     than the cap, the top-up is zero - XP is never clawed back.
--   * The two windows are DISJOINT. The ordinary window is [max(wm, accrued_to),
--     combat_end] and the span is [old accrued_to, accrued_to]; the span's end
--     IS the ordinary window's floor. No millisecond is inside both.
--   * IT CANNOT REACH PAST THE SPAN. `span.to = v_accrued` is an equality on two
--     server timestamps, so a claim cannot be aimed at an older, a newer or a
--     wider window; span_ms is additionally clamped to c_topup_max_span_ms.
--   * ONCE. The span is nulled in the same UPDATE, under the same per-character
--     advisory lock + `for update` the verb already takes, whether or not the
--     call credited anything. A replay of the same idem key returns above the
--     lock from hr_combat_xp_credit_log and re-applies nothing; a DIFFERENT key
--     aimed at the same span finds NULL.
--   * THE WIRE DID NOT MOVE. The accrue intent still carries exactly one integer
--     (`{slot}`) - the b337 invariant in
--     src/features/smoke/record-seam-and-hydration.js:2709 is untouched, and no
--     client-chosen window exists anywhere in this design. The span is authored
--     by the server, from the server's own settle, on the server's clock. The
--     client's only new obligation is to RE-SEND the claim it already sends.
--   * The day ceiling (5M combat / 40M shared) is UNCHANGED and still outside:
--     v_remaining = least(v_cap, day_remaining), and hr_day_budget_check runs on
--     the already-clamped total.
--
-- -- JOURNAL (rule 6) ---------------------------------------------------------
-- ZERO new rows. The stamp is a column on a row hr_apply is already updating;
-- the consumption is on a row the credit verb is already updating. The three
-- numbers (span_ms, span_sim_xp, topup_cap) ride the EXISTING player_ledger meta
-- of the crediting call, so a dispute is answerable from the database.
--
-- REVERSIBILITY: re-apply 2026-09-09-combat-xp-settle-first.sql (which rebuilds
-- the credit body from the live text) and 2026-09-14-hr-apply-restatement.sql to
-- restore both bodies; the column may be left (unread) or dropped. No player
-- data is destroyed by the revert and no XP already credited is affected.
--
-- EDGE: unchanged. accrual.js is not touched, AWAY-12 holds - there is still one
-- combat engine and this file adds no second simulation. No redeploy.
-- ============================================================================

-- -- 0. PRECONDITIONS - fail closed ------------------------------------------
do $$
declare v_def text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='accrued_to') then
    raise exception 'PRECONDITION: player_state.accrued_to is absent';
  end if;
  if to_regprocedure('public.hr_combat_xp_cap(int,bigint)') is null then
    raise exception 'PRECONDITION: hr_combat_xp_cap is absent - apply 2026-08-31-combat-xp-credit.sql FIRST';
  end if;
  if to_regprocedure('public.hr_credit_combat_xp__ungated(int,jsonb,text)') is null then
    raise exception 'PRECONDITION: hr_credit_combat_xp__ungated is absent';
  end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply(uuid,integer,bigint,uuid,jsonb) is absent - apply 2026-09-14-hr-apply-restatement.sql FIRST';
  end if;
  v_def := replace(pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'SETTLE-FIRST (2026-09-09)') = 0 then
    raise exception 'PRECONDITION: the installed hr_credit_combat_xp__ungated does not carry the 2026-09-09 settle-first precondition - apply 2026-09-09-combat-xp-settle-first.sql FIRST. Without it there is no refusal for this file to complete, and anchor B1 does not exist.';
  end if;
  if strpos(v_def, 'v_combat_end') = 0 or strpos(v_def, 'v_active_since') = 0 then
    raise exception 'PRECONDITION: the NOT-IN-COMBAT CAP is absent - apply 2026-09-06-cadence-recovery-floor.sql FIRST; the top-up gate reads v_active_kind / v_active_since / v_recovering from it';
  end if;
end $$;

-- -- 1. THE COLUMN -----------------------------------------------------------
-- Server-authored, server-read, never projected to the client and never
-- client-writable (player_state carries no client write grant; GATE(b) asserts).
alter table public.player_state
  add column if not exists combat_settle_span jsonb;

comment on column public.player_state.combat_settle_span is
  'THE SPAN THE LAST SETTLE PRICED (2026-09-17). {from,to,sim_xp} - two server timestamps and the combat XP the AWAY simulation paid for them. Written ONLY by hr_apply on an accrual delta whose watermark moved by (180s, 1h]; NULLed by every other delta and CONSUMED (NULLed) by hr_credit_combat_xp__ungated. Never client-supplied, never projected.';

-- -- 2. PATCH A - hr_apply STAMPS THE SPAN -----------------------------------
-- ONE anchor, in the UPDATE's SET list, so nothing above it moves and no declare
-- is added: every constant is a literal in the expression, and the two span
-- bounds are asserted as literals on the INSTALLED text by GATE(g).
do $miga$
declare
  v_def text;
  v_a   constant text := '           accrued_to   = v_accrued,';
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if strpos(v_def, 'ATTENDED-XP SPAN STAMP (2026-09-17)') > 0 then
    raise notice 'hr_apply already stamps combat_settle_span - skipping (idempotent no-op)';
  else
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
      raise exception 'ANCHOR A (accrued_to in the SET list) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    end if;
    v_def := replace(v_def, v_a,
      $anc$           -- ATTENDED-XP SPAN STAMP (2026-09-17). THE SETTLE STATES WHAT IT
           -- JUST PRICED, so hr_credit_combat_xp can top the same span up to the
           -- attended rate ONCE instead of leaving it at the away rate. Three
           -- SERVER values: the OLD watermark (v_st.accrued_to, read under this
           -- function's own `for update`), the NEW one (v_accrued, already
           -- clamped into [old, now()] above), and the COMBAT XP THIS VERY DELTA
           -- IS APPLYING - i.e. what the away simulation paid. Nothing here is
           -- client-supplied: p_delta->'xp' is the ENGINE's proposal, and it is
           -- read only to be SUBTRACTED later, so inflating it can only make the
           -- top-up SMALLER.
           --   Bounds: only a span LONGER than the 180 s settle-first threshold
           --   (a shorter one never produced the refusal this exists to
           --   complete) and NO LONGER THAN ONE HOUR (beyond that the player
           --   genuinely was away and the away price is the right one) is
           --   stamped. EVERY other delta - an equip, a market intent, a short
           --   settle, a settle that moved nothing - sets this to NULL, so a
           --   span cannot outlive the round trip that made it.
           combat_settle_span = case
             when p_delta ? 'accrued_to'
              and v_accrued > v_st.accrued_to
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint > 180000
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint <= 3600000
             then jsonb_build_object(
                    'from', v_st.accrued_to,
                    'to',   v_accrued,
                    'sim_xp', (select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
                                 from jsonb_each_text(case when jsonb_typeof(p_delta->'xp') = 'object'
                                                           then p_delta->'xp' else '{}'::jsonb end)
                                where key = any(array['attack','strength','defense',
                                                      'hitpoints','ranged','magic','prayer'])))
             else null end,
           accrued_to   = v_accrued,$anc$);
    execute v_def;
    raise notice 'hr_apply patched: the settle stamps combat_settle_span';
  end if;
end $miga$;

-- -- 2b. GRANTS - revoke before grant. create-or-replace PRESERVES an ACL and
-- the signature is unchanged, so no call form moves; the explicit restatement is
-- what GATE(a) asserts. hr_apply is ENGINE-ONLY (it takes p_user as an argument,
-- i.e. it writes ANY player's row) and must reach no client role at all.
revoke execute on function public.hr_apply(uuid,integer,bigint,uuid,jsonb)
  from public, anon, authenticated;

-- -- 3. PATCH B - hr_credit_combat_xp__ungated TOPS UP THE SPAN, ONCE --------
do $migb$
declare
  v_def text;
  v_b1 constant text := '  c_settle_first_ms constant bigint := 180000;';
  v_b2 constant text := '  v_cap := public.hr_combat_xp_cap(v_dmg_lvl, v_elapsed);';
  v_b3 constant text := '     set combat_xp_accrued_to = now(), version = version + 1, updated_at = now()';
  v_b4 constant text := '          ''unsettled_ms'', v_unsettled,';
begin
  v_def := replace(pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure), chr(13), '');

  if strpos(v_def, 'ATTENDED-XP TOP-UP (2026-09-17)') > 0 then
    raise notice 'hr_credit_combat_xp__ungated already carries the attended-xp top-up - skipping (idempotent no-op)';
  else
    if (length(v_def) - length(replace(v_def, v_b1, ''))) / length(v_b1) <> 1 then
      raise exception 'ANCHOR B1 (the settle-first declare) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_b1, ''))) / length(v_b1);
    end if;
    if (length(v_def) - length(replace(v_def, v_b2, ''))) / length(v_b2) <> 1 then
      raise exception 'ANCHOR B2 (the cap line) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_b2, ''))) / length(v_b2);
    end if;
    if (length(v_def) - length(replace(v_def, v_b3, ''))) / length(v_b3) <> 1 then
      raise exception 'ANCHOR B3 (the watermark UPDATE) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_b3, ''))) / length(v_b3);
    end if;
    if (length(v_def) - length(replace(v_def, v_b4, ''))) / length(v_b4) <> 1 then
      raise exception 'ANCHOR B4 (the journal meta) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_b4, ''))) / length(v_b4);
    end if;

    -- B1. THE DECLARES. c_topup_max_span_ms MUST equal the literal hr_apply
    --     stamps with (GATE(g) asserts both installed texts); the grace is how
    --     long a stamped span stays claimable after the settle that made it.
    v_def := replace(v_def, v_b1,
      $anc$  c_settle_first_ms constant bigint := 180000;
  -- ATTENDED-XP TOP-UP (2026-09-17). Mirrors the two literals in hr_apply's
  -- ATTENDED-XP SPAN STAMP; GATE(g) asserts the texts agree.
  c_topup_max_span_ms constant bigint := 3600000;
  c_topup_grace_ms    constant bigint := 120000;
  v_span      jsonb;
  v_span_from timestamptz;
  v_span_to   timestamptz;
  v_span_ms   bigint := 0;
  v_span_sim  bigint := 0;
  v_topup     bigint := 0;$anc$);

    -- B2. THE SECOND, DISJOINT WINDOW. Sited immediately after the ordinary cap
    --     and BEFORE v_remaining, so the day ceiling still bounds the sum and
    --     the distribution loop below is untouched: the top-up raises a CAP, it
    --     never grants. Every input is read from the row this call already holds
    --     under `for update`; v_active_kind / v_active_since / v_recovering are
    --     the 2026-09-06 reads, not new ones.
    v_def := replace(v_def, v_b2,
      $anc$  v_cap := public.hr_combat_xp_cap(v_dmg_lvl, v_elapsed);

  -- ATTENDED-XP TOP-UP (2026-09-17) - THE SPAN THE SETTLE JUST REPRICED AS AWAY.
  -- A backgrounded tab's flush is refused settle_first; the client settles and
  -- re-flushes; CONDITION 2 then floors this call's window at the new watermark
  -- so elapsed ~ 0 and the honest attended claim is capped to nothing, leaving
  -- the window priced at the away rate (60-99% low). This adds the span the
  -- settle stamped as a SECOND physical budget. It is INSTEAD OF the away price,
  -- not on top of it: what the simulation already paid is SUBTRACTED, so the
  -- total for the span is max(sim_xp, cap(span)) and never their sum.
  select combat_settle_span into v_span from public.player_state
    where user_id = v_uid and slot = v_slot;         -- already locked, above
  if v_span is not null and jsonb_typeof(v_span) = 'object' then
    v_span_from := (v_span->>'from')::timestamptz;
    v_span_to   := (v_span->>'to')::timestamptz;
    if  v_span_from is not null and v_span_to is not null
        -- (i) IT IS THE SPAN THIS CALL'S OWN WATERMARK ENDS AT. An EQUALITY on
        --     two server timestamps: a claim cannot be aimed at an older, a
        --     newer or a wider window, and a second settle REWRITES or CLEARS
        --     the stamp rather than leaving a reachable one.
    and v_span_to = v_accrued
        -- (ii) IT IS FRESH. The deferred re-flush follows its settle by one
        --      round trip; a span older than the grace is not claimable.
    and now() - v_span_to <= (c_topup_grace_ms || ' milliseconds')::interval
        -- (iii) THE CHARACTER WAS FIGHTING FOR ALL OF IT - the same bout, since
        --       before the span began. An idle/gather pointer, or a bout that
        --       started INSIDE the span, pays nothing. This is the not-in-combat
        --       cap applied to a past window.
    and v_active_kind is not distinct from 'combat'
    and v_active_since is not null and v_active_since <= v_span_from
        -- (iv) NO KNOCKOUT OVERLAPS IT (the 2026-09-06 recovery floor, applied
        --      to the same past window).
    and (v_recovering is null or v_recovering <= v_span_from)
    then
      v_span_ms  := least(greatest(0, floor(extract(epoch from (v_span_to - v_span_from)) * 1000)::bigint),
                          c_topup_max_span_ms);
      v_span_sim := greatest(0, coalesce((v_span->>'sim_xp')::bigint, 0));
      v_topup    := greatest(0, public.hr_combat_xp_cap(v_dmg_lvl, v_span_ms) - v_span_sim);
      v_cap      := v_cap + v_topup;
    end if;
  end if;$anc$);

    -- B3. CONSUMPTION, IN THE UPDATE THE VERB ALREADY MAKES. Unconditional: a
    --     call that reached here has SEEN the span, so it is spent whether or
    --     not it credited. The under-pay direction is the safe one and it makes
    --     "once" STRUCTURAL rather than conditional. Zero new rows.
    v_def := replace(v_def, v_b3,
      $anc$     set combat_xp_accrued_to = now(), combat_settle_span = null, version = version + 1, updated_at = now()$anc$);

    -- B4. THE JOURNAL. The three numbers behind a top-up, on a ledger row that
    --     already exists. Value-free; a dispute is answerable from the database.
    v_def := replace(v_def, v_b4,
      $anc$          'unsettled_ms', v_unsettled,
          'span_ms', v_span_ms, 'span_sim_xp', v_span_sim, 'topup_cap', v_topup,$anc$);

    execute v_def;
    raise notice 'hr_credit_combat_xp__ungated: the attended-xp top-up is installed';
  end if;
end $migb$;

-- -- 3b. GRANTS - revoke before grant; the signature is unchanged.
revoke execute on function public.hr_credit_combat_xp__ungated(int,jsonb,text)
  from public, anon, authenticated, service_role;

-- -- 4. SECTION 4 SELF-CHECK - properties asserted by EXECUTING SQL ----------
-- Every gate runs the real functions on real fixture rows inside a subtransaction
-- that is rolled back; the final leak check proves the rollback took.
do $$
declare
  v        jsonb;
  v_def    text;
  v_adef   text;
  v_uid    constant uuid := '000000ca-0000-0000-0000-0000000000ca';
  v_slot   constant int  := 0;
  v_lvl    int;
  v_xp0    bigint; v_xp1 bigint; v_xp2 bigint;
  v_span0  jsonb;  v_span1 jsonb;
  v_ver    bigint;
  v_slack  bigint;
  v_span_cap bigint; v_sim bigint;
  v_rows0  bigint; v_rows1 bigint;
begin
  v_def  := replace(pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure), chr(13), '');
  v_adef := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  -- (a) THE PRIVILEGE LINE DID NOT MOVE.
  if has_function_privilege('authenticated','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is client-executable - the gate is decoration';
  end if;
  if has_function_privilege('anon','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is anon-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_combat_xp_cap(int,bigint)','execute') then
    raise exception 'GATE(a): hr_combat_xp_cap is client-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_apply(uuid,integer,bigint,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.hr_apply(uuid,integer,bigint,uuid,jsonb)','execute') then
    raise exception 'GATE(a): hr_apply is client-executable - a client could stamp its own span';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_combat_xp(int,jsonb,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated - the feature is dead';
  end if;
  if not (select prosecdef from pg_proc
           where oid = 'public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure) then
    raise exception 'GATE(a): __ungated lost SECURITY DEFINER';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on the column this file adds, or on the XP the
  --     cap it raises can reach. combat_settle_span is server-authored or it is
  --     a forged budget.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','PUBLIC')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_state - combat_settle_span is client-forgeable';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_state'
                and cmd in ('UPDATE','INSERT','ALL')
                and ('authenticated' = any(coalesce(roles,'{}')) or 'public' = any(coalesce(roles,'{}')))) then
    raise exception 'GATE(b): player_state has a client UPDATE/INSERT policy';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_skills'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_skills - XP is client-forgeable';
  end if;

  -- (R) NOTHING WAS REVERTED. Both patched bodies are named by the strings the
  --     files before this one asserted on (the b484 class).
  if strpos(v_def, 'ATTENDED-XP TOP-UP (2026-09-17)') = 0 then
    raise exception 'GATE(R0): the top-up splice is not in the installed body - section 3 no-oped';
  end if;
  if strpos(v_adef, 'ATTENDED-XP SPAN STAMP (2026-09-17)') = 0 then
    raise exception 'GATE(R0b): the stamp splice is not in the installed hr_apply - section 2 no-oped';
  end if;
  if strpos(v_def, 'SETTLE-FIRST (2026-09-09)') = 0
     or strpos(v_def, 'c_settle_first_ms constant bigint := 180000;') = 0 then
    raise exception 'GATE(R1): the 2026-09-09 settle-first precondition is gone';
  end if;
  if strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') = 0
     or strpos(v_def, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then
    raise exception 'GATE(R2): a 2026-09-06 floor/cap is gone';
  end if;
  if strpos(v_def, 'v_wm := greatest(v_wm, v_accrued);') = 0 then
    raise exception 'GATE(R3): CONDITION 2 (the settle-watermark floor) is gone';
  end if;
  if strpos(v_def, 'pg_advisory_xact_lock') = 0 or strpos(v_def, 'for update') = 0 then
    raise exception 'GATE(R4): the per-character lock is gone - two credits can interleave on one span';
  end if;
  if strpos(v_def, 'hr_day_budget_check') = 0 or strpos(v_def, 'c_combat_xp_day_budget') = 0 then
    raise exception 'GATE(R5): the day budget / 5M combat ceiling is gone';
  end if;
  if strpos(v_def, 'insert into public.hr_combat_xp_credit_log') = 0 then
    raise exception 'GATE(R6): the idempotency journal write is gone';
  end if;
  if strpos(v_adef, 'v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));') = 0 then
    raise exception 'GATE(R7): hr_apply lost the watermark clamp - the stamp would take a client timestamp';
  end if;
  if strpos(v_adef, 'streak_day_key = case when p_delta ? ''accrued_to''') = 0
     or strpos(v_adef, 'workers_accrued_to = case') = 0 then
    raise exception 'GATE(R8): hr_apply lost a SET-list member - the stamp patch reverted the update';
  end if;

  -- (g) THE SPAN LITERALS AGREE ACROSS THE TWO BODIES, and the three
  --     load-bearing clauses are present in the INSTALLED text. A stamp wider
  --     than the top-up's clamp would be dead weight; a clamp wider than the
  --     stamp would be a window nothing bounds.
  if strpos(v_adef, '<= 3600000') = 0 or strpos(v_adef, '> 180000') = 0 then
    raise exception 'GATE(g): hr_apply does not carry the (180000, 3600000] span bounds';
  end if;
  if strpos(v_def, 'c_topup_max_span_ms constant bigint := 3600000;') = 0 then
    raise exception 'GATE(g): the top-up max span is not 3600000 - it must equal hr_apply''s stamp bound';
  end if;
  if strpos(v_def, 'v_span_to = v_accrued') = 0 then
    raise exception 'GATE(g): the span-end EQUALITY is gone - a claim could reach past the settle span';
  end if;
  if strpos(v_def, 'combat_settle_span = null') = 0 then
    raise exception 'GATE(g): the consumption is gone - one span could be topped up forever';
  end if;
  -- ⚠ THE "INSTEAD OF, NOT ON TOP OF" PROPERTY IS DELIBERATELY *NOT* ASSERTED
  --   HERE AS A STRING. A marker check on `- v_span_sim` would be the weaker
  --   half of GATE(c2) below, which EXECUTES the verb and measures that
  --   sim_xp + credited <= cap(span) - and it would also short-circuit the
  --   `topup-pays-on-top` mutant in tests/live-settlement.mjs before the
  --   behavioural gate could bite, leaving that gate unproven. §4 wants the
  --   property asserted by executing SQL, so GATE(c2) is the sole judge.

  -- == THE BEHAVIOURAL GATES. Real rows, real calls, rolled back. ===========
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version,
          combat_xp_accrued_to, accrued_to, active_kind, active_id, active_since,
          recovering_until, combat_settle_span)
      values (v_uid, v_slot, 0, 0, 0,
          now(), now(), 'combat', 'goblin', now() - interval '6 hours', null, null)
      on conflict (user_id, slot) do update
        set combat_xp_accrued_to = now(), accrued_to = now(),
            active_kind = 'combat', active_id = 'goblin',
            active_since = now() - interval '6 hours',
            recovering_until = null, combat_settle_span = null;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 100000
        from unnest(array['attack','strength','defense','hitpoints','ranged','magic','prayer']) s
      on conflict (user_id, slot, skill_id) do update set xp = 100000;

    v_lvl := public.hr_level_from_xp(100000);
    -- ⚠ ZERO SLACK, AND THAT IS EARNED, NOT ASSUMED. `now()` is TRANSACTION
    --   time and every gate below runs inside this one subtransaction, so a
    --   fixture whose watermark is now() has an ORDINARY window of EXACTLY
    --   0 ms - cap(dmg, 0) = 0 - however long the block takes in wall-clock.
    --   Any XP an assertion sees is therefore the TOP-UP and nothing else.
    --   The first draft allowed 5 s of slack and the `topup-pays-on-top`
    --   mutant SLIPPED through it (tests/live-settlement.mjs): 5 s of headroom
    --   at this level is ~25k XP, which swallowed the whole signal.
    v_slack := 0;
    -- THE SPAN AND WHAT THE AWAY SIM PAID FOR IT. sim_xp is set to within 1000
    -- of the cap deliberately: the honest top-up is then at most 1000, while a
    -- body that forgot to subtract it would credit the WHOLE cap. A token
    -- sim_xp (the first draft used 100) leaves the two answers indistinguishable
    -- because the day ceiling clamps both to the same number.
    v_span_cap := public.hr_combat_xp_cap(v_lvl, 600000);
    v_sim      := v_span_cap - 1000;

    -- (c) A CLAIM IS CAPPED BY hr_combat_xp_cap OVER THE SPAN. Stamp a
    --     10-minute span the away sim already paid v_sim for, then claim a
    --     trillion.
    update public.player_state
       set combat_settle_span = jsonb_build_object(
             'from', accrued_to - interval '10 minutes', 'to', accrued_to, 'sim_xp', v_sim)
     where user_id = v_uid and slot = v_slot;
    select coalesce(sum(xp),0) into v_xp0 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-c1');
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c): the top-up call was refused: %', v;
    end if;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if (v_xp1 - v_xp0) <= 0 then
      raise exception 'GATE(c): the deferred attended claim credited NOTHING - this file does not do its job';
    end if;
    if (v_xp1 - v_xp0) > v_span_cap - v_sim + v_slack then
      raise exception 'GATE(c): a claim of 10^12 credited %, which exceeds cap(span)-sim_xp (%) - the physical cap is not binding',
        v_xp1 - v_xp0, v_span_cap - v_sim;
    end if;

    -- (c2) CLAIM AND SIM ARE NEVER BOTH CREDITED FOR ONE SPAN. The total the
    --      character holds for the span is sim_xp + credited, and it must not
    --      exceed cap(span). This is the judge of the `topup-pays-on-top`
    --      mutant in tests/live-settlement.mjs (drop the `- v_span_sim`).
    if v_sim + (v_xp1 - v_xp0) > v_span_cap + v_slack then
      raise exception 'GATE(c2): sim_xp (%) + top-up (%) exceeds cap(span) (%) - the claim was credited ON TOP OF the simulation, not INSTEAD OF it',
        v_sim, v_xp1 - v_xp0, v_span_cap;
    end if;

    -- (d) THE SPAN IS CONSUMED. It is NULL after the call, and a SECOND call
    --     with a DIFFERENT idem key gets no top-up at all.
    select combat_settle_span into v_span1 from public.player_state
      where user_id = v_uid and slot = v_slot;
    if v_span1 is not null then
      raise exception 'GATE(d): the span survived the credit - it could be topped up forever';
    end if;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-c2');
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if (v_xp2 - v_xp1) > v_slack then
      raise exception 'GATE(d): a SECOND idem key credited % against an already-consumed span', v_xp2 - v_xp1;
    end if;

    -- (e) REPLAY OF THE SAME KEY CREDITS ZERO.
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-c1');
    if coalesce(v->>'replay','') <> 'true' then
      raise exception 'GATE(e): the replay of g17-c1 was not answered as a replay: %', v;
    end if;
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if v_xp2 <> v_xp1 then
      raise exception 'GATE(e): a replay of the same idem key moved XP by %', v_xp2 - v_xp1;
    end if;

    -- (f) A CLAIM CANNOT REACH PAST THE SETTLE SPAN. A stamp whose `to` is NOT
    --     this call's watermark is ignored WHOLE, even at ten hours wide.
    update public.player_state
       set accrued_to = now(), combat_xp_accrued_to = now(),
           combat_settle_span = jsonb_build_object(
             'from', now() - interval '10 hours',
             'to',   now() - interval '5 hours',      -- deliberately <> accrued_to
             'sim_xp', 0)
     where user_id = v_uid and slot = v_slot;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-f1');
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if (v_xp2 - v_xp1) > v_slack then
      raise exception 'GATE(f): a span that does NOT end at the watermark credited % - the claim reached past the settle span', v_xp2 - v_xp1;
    end if;

    -- (f2) A SPAN CLAIMED WHILE NOT IN COMBAT PAYS NOTHING.
    update public.player_state
       set accrued_to = now(), combat_xp_accrued_to = now(), active_kind = 'gather'
     where user_id = v_uid and slot = v_slot;
    update public.player_state
       set combat_settle_span = jsonb_build_object(
             'from', accrued_to - interval '10 minutes', 'to', accrued_to, 'sim_xp', 0)
     where user_id = v_uid and slot = v_slot;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-f2');
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if (v_xp2 - v_xp1) <> 0 then
      raise exception 'GATE(f2): a GATHER-ing character claimed % attended combat XP', v_xp2 - v_xp1;
    end if;

    -- (f3) A BOUT THAT STARTED INSIDE THE SPAN PAYS NOTHING (the same rule the
    --      not-in-combat cap enforces for the ordinary window).
    update public.player_state
       set accrued_to = now(), combat_xp_accrued_to = now(),
           active_kind = 'combat', active_since = now() - interval '1 minute'
     where user_id = v_uid and slot = v_slot;
    update public.player_state
       set combat_settle_span = jsonb_build_object(
             'from', accrued_to - interval '10 minutes', 'to', accrued_to, 'sim_xp', 0)
     where user_id = v_uid and slot = v_slot;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 999999999999}'::jsonb, 'g17-f3');
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if (v_xp2 - v_xp1) > v_slack then
      raise exception 'GATE(f3): a bout that began INSIDE the span credited % for the whole span', v_xp2 - v_xp1;
    end if;

    -- (h) ABSENT CLAIM => TODAY'S BEHAVIOUR, UNCHANGED. No stamp and a stale
    --     watermark: still settle_first, still no write, still no watermark move,
    --     still no idem row. This is the "byte-identical to today" gate.
    update public.player_state
       set combat_settle_span = null, active_kind = 'combat',
           active_since = now() - interval '6 hours',
           accrued_to = now() - interval '4 hours',
           combat_xp_accrued_to = now() - interval '4 hours'
     where user_id = v_uid and slot = v_slot;
    select count(*) into v_rows0 from public.hr_combat_xp_credit_log
      where user_id = v_uid and slot = v_slot;
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, '{"attack": 500}'::jsonb, 'g17-h1');
    if coalesce(v->>'error','') <> 'settle_first' then
      raise exception 'GATE(h): a stale watermark with no stamp was NOT refused settle_first: %', v;
    end if;
    select count(*) into v_rows1 from public.hr_combat_xp_credit_log
      where user_id = v_uid and slot = v_slot;
    if v_rows1 <> v_rows0 then
      raise exception 'GATE(h): the refusal wrote an idem row';
    end if;
    select coalesce(sum(xp),0) into v_xp2 from public.player_skills
      where user_id=v_uid and slot=v_slot;
    if v_xp2 <> v_xp1 then
      raise exception 'GATE(h): the refusal moved XP by %', v_xp2 - v_xp1;
    end if;
    select combat_settle_span into v_span1 from public.player_state
      where user_id = v_uid and slot = v_slot;
    if v_span1 is not null then
      raise exception 'GATE(h2): a REFUSED call wrote the span column';
    end if;

    -- (i) hr_apply STAMPS ONLY WHAT IT PRICED, and sim_xp is the COMBAT skills
    --     of the delta - not the whole xp map.
    update public.player_state
       set accrued_to = now() - interval '20 minutes', combat_settle_span = null
     where user_id = v_uid and slot = v_slot;
    select version into v_ver from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
           jsonb_build_object('accrued_to', 'now',
                              'xp', jsonb_build_object('attack', 40, 'woodcutting', 999)));
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(i): the fixture settle was refused: %', v;
    end if;
    select combat_settle_span into v_span0 from public.player_state
      where user_id = v_uid and slot = v_slot;
    if v_span0 is null then
      raise exception 'GATE(i): a 20-minute settle did not stamp the span';
    end if;
    if coalesce((v_span0->>'sim_xp')::bigint, -1) <> 40 then
      raise exception 'GATE(i): sim_xp is % - it must be the COMBAT skills of the delta only (40), not the whole xp map', v_span0->>'sim_xp';
    end if;
    if (v_span0->>'to')::timestamptz
       <> (select accrued_to from public.player_state where user_id=v_uid and slot=v_slot) then
      raise exception 'GATE(i2): the stamp does not end at the watermark it wrote - the top-up equality could never match';
    end if;

    -- (i3) A ~0 ms SETTLE CLEARS THE STAMP. A span shorter than the settle-first
    --      threshold is never claimable, and a second settle cannot leave a
    --      stale one behind.
    select version into v_ver from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
           jsonb_build_object('accrued_to', 'now'));
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(i3): the second fixture settle was refused: %', v;
    end if;
    select combat_settle_span into v_span0 from public.player_state
      where user_id = v_uid and slot = v_slot;
    if v_span0 is not null then
      raise exception 'GATE(i3): a ~0 ms settle left a stamp - a sub-threshold span is claimable';
    end if;

    raise exception 'HR_ROLLBACK_SENTINEL';
  exception when others then
    perform set_config('request.jwt.claim.sub', '', true);
    if sqlerrm <> 'HR_ROLLBACK_SENTINEL' then raise; end if;
  end;

  -- (z) THE LEAK CHECK - the fixture is gone, so every gate above ran inside the
  --     subtransaction that was rolled back.
  if exists (select 1 from public.player_state where user_id = v_uid) then
    raise exception 'GATE(z): the fixture character survived the rollback';
  end if;
  if exists (select 1 from public.hr_combat_xp_credit_log where user_id = v_uid) then
    raise exception 'GATE(z): fixture credit-log rows survived the rollback';
  end if;
  if exists (select 1 from public.player_skills where user_id = v_uid) then
    raise exception 'GATE(z): fixture skill rows survived the rollback';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): the fixture auth user survived the rollback';
  end if;

  raise notice 'attended-xp-on-settle: all gates passed';
end $$;
