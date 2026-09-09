-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-09-combat-xp-settle-first.sql
-- A CREDIT MAY NOT TRIM A WINDOW IT DID NOT PAY FOR.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a
-- Security GO (this touches XP, a RANKED surface).
--
-- ── THE REPORT ──────────────────────────────────────────────────────────────
-- Paione, 2026-09-09 ~11:52 UTC, b529: "I did some offline combat. The items and
-- kills are given but the experience is not."
--
-- ── THE LIVE LEDGER (read-only, production, user bf18bd7f… slot 0) ──────────
--   combat xp_credit  xp_in=12   @11:51:40.816
--   combat xp_credit  xp_in=64   @11:52:05.561
--   combat xp_credit  xp_in=146  @11:52:27.315
--   combat accrue     ms=14,552,349  kills=828  xp_in=0  @11:52:30.548
--                     delta = { g, i, k } — NO `x` KEY AT ALL.
--
-- Four hours and two minutes of away combat: 828 clay golems killed, 23,068 gold,
-- 1,209 coal, 359 iron ore, 228 iron fittings and 248 cooked trout eaten — all
-- paid. Combat XP: zero. The player earned roughly 266,000 XP and was given 222.
--
-- ── THE MECHANISM ───────────────────────────────────────────────────────────
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
-- which is now() — the END of the window — so every XP grant in the simulation is
-- ineligible and `delta.x` is never emitted. Loot, gold and the kill counters are
-- NOT watermark-split, which is exactly why they paid and only XP did not: the
-- symptom the player described, precisely.
--
-- The watermark advance was written for the ATTENDED case, where it is right: the
-- credit paid that window, so the settle must not pay it twice. It is wrong the
-- moment the window it stamps over was never the credit's to speak for. Condition 2
-- of the 2026-08-31 review already floors the credit's own window at accrued_to —
-- it stops the credit PAYING for unsettled time. It does not stop the credit
-- CLAIMING to have paid for it. That gap is this file.
--
-- ── THE SCALE (30-day census, read-only, production) ────────────────────────
--   918 `combat accrue` rows; only 141 carry an `x` key.
--   Away rows with kills>0 and ms>10min and no `x`: 17 rows, 2 players,
--   3,991 kills, 216,647,185 ms (60.2 hours) of combat that paid no XP.
-- This has been eating away combat XP for every player who returns to a running
-- fight since the split shipped (2026-08-31).
--
-- ── THE RULE THIS FILE INSTALLS ─────────────────────────────────────────────
-- A credit may only speak for a window the settle has already closed. While
-- `now() - accrued_to > c_settle_first_ms` (180 s, mirrored from
-- src/core/combat-xp-cap.js COMBAT_XP_SETTLE_FIRST_MS and pinned by
-- tests/combat-xp-cap-drift.mjs) the RPC REFUSES:
--
--     { ok:false, error:'settle_first', unsettled_ms:…, threshold_ms:… }
--
-- and writes NOTHING — no player_skills row, no player_ledger row, no
-- hr_combat_xp_credit_log row and, decisively, NO WATERMARK MOVE. The refusal is
-- the same shape and the same intent as hr_rest / hr_set_combat_style's
-- `collect_first`: the server refuses to act inside a window it has not yet paid
-- out, rather than confiscating it.
--
-- ── WHY REFUSAL AND NOT THE TWO ALTERNATIVES ────────────────────────────────
-- (b) "advance the watermark only to accrued_to." Leaves the credit's own elapsed
--     — which is ALSO the plausibility cap's basis — spanning hours of unsettled
--     time. Paione's third call was capped against 4h02m of physical-max XP
--     (~120M XP of headroom) when it should have been capped against 25 s. The
--     forgery surface is the bigger half of this bug and (b) does not touch it.
-- (c) "the settle ignores a watermark advanced while the window was unpaid."
--     Requires new state recording WHEN the watermark moved and relative to what,
--     re-derives the same fact the server already has, and still leaves the cap
--     inflated. More state, more to get wrong, half a fix.
-- (a) refusal removes both at once, adds no column, and is a pure precondition —
--     the cheapest thing that can be verified.
--
-- ── IT CANNOT BE GAMED BY ORDERING ──────────────────────────────────────────
-- Settle → credit: the settle sets accrued_to = now(), so the credit is ADMITTED
--   and its window (floored at accrued_to by Condition 2) is ~0 → cap 0 → it pays
--   nothing for the settled window. Already proven by GATE(h) of the 2026-08-31
--   file, unchanged here.
-- Credit → settle, window fresh (<180 s): admitted, pays the attended residue,
--   stamps the watermark — the honest live path, unchanged.
-- Credit → settle, window stale (>180 s): REFUSED, nothing written, the settle
--   pays the whole away window's XP. The trim can no longer be armed.
-- A forger who withholds the settle to keep crediting: refused forever. The only
--   way to reach the XP writer is to let the server close the window first.
-- A forger who calls at 179 s to inflate the cap: bounded by 180 s of physical
--   max instead of an unbounded absence, and still by the 5M/day combat ceiling.
--
-- ── IT COSTS NOTHING WHEN IT REFUSES AN HONEST PLAYER ───────────────────────
-- A live player whose settle is late (a backgrounded tab, a throttled timer, an
-- accrual rate-gate) is refused and DEFERS, never loses: the client keeps the
-- pending XP (it subtracts only what the server applied), the settle lands, and
-- the next flush's cap — ~497,640 XP per minute at damage level 99, a deliberate
-- over-estimate — drains the backlog many times over. No honest XP is destroyed
-- by a refusal; that is the property that makes a TIGHT threshold safe.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- It does not pay back the 17 measured rows. A make-good is a RULING (Tyler's),
-- not a migration, and player state is never fabricated by an agent. The numbers
-- are reported so the ruling can be made.
--
-- ADDITIVE + IDEMPOTENT: one `create or replace` of an existing function body
-- plus a §4 self-check. No schema change, no data change, no drops.
-- REVERSIBLE: re-applying 2026-08-31-combat-xp-credit.sql restores the previous
-- body exactly (both files are `create or replace` of the same signature).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — fail closed rather than install half a rule ──────────
do $$
begin
  if to_regprocedure('public.hr_credit_combat_xp__ungated(int,jsonb,text)') is null then
    raise exception 'PRECONDITION: hr_credit_combat_xp__ungated is absent — apply 2026-08-31-combat-xp-credit.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='accrued_to') then
    raise exception 'PRECONDITION: player_state.accrued_to is absent — the settle watermark this rule reads does not exist';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='combat_xp_accrued_to') then
    raise exception 'PRECONDITION: player_state.combat_xp_accrued_to is absent';
  end if;
end $$;

-- ── 1. THE RPC BODY, with the settle-first precondition ─────────────────────
-- Byte-for-byte the 2026-08-31 body except for the block marked
-- "★ SETTLE-FIRST (2026-09-09)". Everything else — the advisory lock, the
-- idempotency read, Condition 2's accrued_to floor, the shared physical cap, the
-- daily combat ceiling, the day budget, the journal — is unchanged and is
-- re-asserted by this file's §4 gates.
create or replace function public.hr_credit_combat_xp__ungated(
  p_slot int, p_xp jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_combat_skills constant text[] :=
    array['attack','strength','defense','hitpoints','ranged','magic','prayer'];
  c_max_skill_xp  constant bigint := 2000000000;
  c_combat_xp_day_budget constant bigint := 5000000;
  -- ★ SETTLE-FIRST (2026-09-09). Mirrors COMBAT_XP_SETTLE_FIRST_MS in
  --   src/core/combat-xp-cap.js; bound by tests/combat-xp-cap-drift.mjs.
  c_settle_first_ms constant bigint := 180000;
  v_uid        uuid := auth.uid();
  v_slot       int  := coalesce(p_slot, 0);
  v_dmg_lvl    int;
  v_elapsed    bigint;
  v_unsettled  bigint;
  v_cap        bigint;
  v_prior      public.hr_combat_xp_credit_log%rowtype;
  v_wm         timestamptz;
  v_accrued    timestamptz;
  v_active_kind text;
  v_used_today bigint := 0;
  v_remaining  bigint;
  v_claimed_total bigint := 0;
  v_credit_total  bigint := 0;
  v_throttled  boolean := false;
  k            text;
  v_raw        bigint;
  v_claim      bigint;
  v_credit     bigint;
  v_rows       int;
  v_bud        jsonb;
  v_applied    jsonb := '{}'::jsonb;
  v_out_credit jsonb := '{}'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null or length(p_idem) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_idem');
  end if;
  if p_xp is null or jsonb_typeof(p_xp) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_xp');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hr_credit_combat_xp:' || v_uid::text, v_slot));

  -- IDEMPOTENCY: a replay of the same key returns the stored result, no re-apply.
  -- BEFORE the settle-first check, deliberately: a key that was already applied
  -- describes a window that has already been accounted, and must keep answering
  -- the same thing even if an absence has opened since.
  select * into v_prior from public.hr_combat_xp_credit_log
    where user_id = v_uid and slot = v_slot and idem = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'credited', v_prior.applied,
      'credit', v_prior.credit, 'claimed', v_prior.claimed, 'throttled', v_prior.throttled, 'slot', v_slot);
  end if;

  select combat_xp_accrued_to, accrued_to, active_kind into v_wm, v_accrued, v_active_kind
    from public.player_state
    where user_id = v_uid and slot = v_slot for update;

  -- ★ SETTLE-FIRST (2026-09-09) — THE UNPAID AWAY WINDOW IS NOT THIS VERB'S TO
  --   STAMP OVER. Refuse BEFORE any write: no XP, no ledger, no idem row and —
  --   the load-bearing half — no watermark move, so the settle still sees the
  --   window as unpaid and credits every hour of it. The client keeps its pending
  --   XP and re-flushes after the settle, when its honest elapsed is small.
  --   Both timestamps are the server's; nothing here is client-supplied.
  v_unsettled := floor(extract(epoch from (now() - v_accrued)) * 1000)::bigint;
  if v_accrued is not null and v_unsettled > c_settle_first_ms then
    return jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', v_unsettled, 'threshold_ms', c_settle_first_ms, 'slot', v_slot);
  end if;

  -- CONDITION 2 (Security 2026-08-31) — the credit's window is floored at
  -- accrued_to, so a settle that lands first leaves nothing for it to pay.
  -- Retained: settle-first bounds the STALENESS, this bounds the WINDOW.
  v_wm := greatest(v_wm, v_accrued);
  v_elapsed := floor(extract(epoch from (now() - v_wm)) * 1000)::bigint;

  v_dmg_lvl := greatest(1,
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='magic'),0)));

  select coalesce(sum(applied), 0) into v_used_today from public.hr_combat_xp_credit_log
    where user_id = v_uid and slot = v_slot and created_at >= public.hr_utc_day_start(now());
  v_cap := public.hr_combat_xp_cap(v_dmg_lvl, v_elapsed);
  v_remaining := least(v_cap, greatest(0, c_combat_xp_day_budget - v_used_today));

  for k, v_raw in select key, coalesce(nullif(value,'')::bigint, 0) from jsonb_each_text(p_xp) loop
    if not (k = any(c_combat_skills)) then
      return jsonb_build_object('ok', false, 'error', 'bad_skill', 'skill_id', k);
    end if;
    v_claim  := least(greatest(0, v_raw), c_max_skill_xp);
    if v_claim <= 0 then continue; end if;
    v_credit := least(v_claim, greatest(0, v_remaining));
    if v_credit < v_claim then v_throttled := true; end if;
    v_remaining := v_remaining - v_credit;
    v_claimed_total := v_claimed_total + v_claim;
    v_credit_total  := v_credit_total  + v_credit;
    if v_credit > 0 then
      v_out_credit := v_out_credit || jsonb_build_object(k, v_credit);
    end if;
  end loop;

  if v_credit_total > 0 then
    v_bud := public.hr_day_budget_check(v_uid, v_slot, 0, v_credit_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);
    end if;
  end if;

  for k, v_credit in select key, value::bigint from jsonb_each_text(v_out_credit) loop
    update public.player_skills set xp = xp + v_credit
      where user_id = v_uid and slot = v_slot and skill_id = k;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      insert into public.player_skills (user_id, slot, skill_id, xp)
        values (v_uid, v_slot, k, v_credit)
        on conflict (user_id, slot, skill_id) do update set xp = public.player_skills.xp + v_credit;
    end if;
    v_applied := v_applied || jsonb_build_object(k, v_credit);
  end loop;

  -- ADVANCE THE WATERMARK to now(). Reached only when the settle has closed the
  -- window within the last c_settle_first_ms, so the span this stamps over is at
  -- most that — a window the live client genuinely observed and this call has just
  -- been paid for, not an absence.
  update public.player_state
     set combat_xp_accrued_to = now(), version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;

  insert into public.hr_combat_xp_credit_log (user_id, slot, idem, claimed, credit, applied, throttled)
    values (v_uid, v_slot, p_idem, v_claimed_total, v_credit_total, v_credit_total, v_throttled);

  if v_credit_total > 0 or v_throttled then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
      values (v_uid, v_slot, 'combat',
        case when v_throttled then 'xp_credit_throttled' else 'xp_credit' end,
        0, 0, v_credit_total, 0,
        jsonb_build_object('claimed', v_claimed_total, 'credit', v_credit_total,
          'cap', v_cap, 'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl,
          'skills', v_applied, 'throttled', v_throttled,
          'unsettled_ms', v_unsettled,
          'active_kind', coalesce(v_active_kind, 'idle')));
  end if;

  return jsonb_build_object('ok', true, 'credited', v_applied, 'credit', v_credit_total,
    'claimed', v_claimed_total, 'cap', v_cap, 'elapsed_ms', v_elapsed,
    'throttled', v_throttled, 'slot', v_slot);
end $$;
revoke execute on function public.hr_credit_combat_xp__ungated(int,jsonb,text) from public, anon, authenticated, service_role;

-- ── 2. §4 SELF-CHECK — properties asserted by EXECUTING SQL ─────────────────
-- Every gate below runs the real function. Nothing is asserted by a marker or a
-- comment. All fixture rows live in a subtransaction that is rolled back, and the
-- final leak check proves the rollback took.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c9-0000-0000-0000-0000000000c9';
  v_slot constant int  := 0;
  v_atk0 bigint; v_atk1 bigint;
  v_wm0  timestamptz; v_wm1 timestamptz;
  v_ledger0 bigint; v_log0 bigint;
begin
  -- (a) THE PRIVILEGE LINE IS UNCHANGED BY THE REPLACE. A `create or replace`
  --     preserves grants, so this is a re-assert, and re-asserts are how a
  --     regression gets caught by the file that could have caused it.
  if has_function_privilege('authenticated','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is client-executable — the gate is decoration';
  end if;
  if has_function_privilege('anon','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is anon-executable';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_combat_xp(int,jsonb,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('authenticated','public.hr_combat_xp_cap(int,bigint)','execute') then
    raise exception 'GATE(a): hr_combat_xp_cap is client-executable';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on the XP tables this verb owns.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_skills'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_skills — XP is client-forgeable';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_combat_xp_credit_log' and cmd <> 'SELECT') then
    raise exception 'GATE(b): hr_combat_xp_credit_log grew a non-SELECT policy';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;

    -- ── (P) THE PAIONE SEQUENCE, EXECUTED ────────────────────────────────────
    --     The exact live ordering: a character whose last settle was 4h02m ago
    --     (accrued_to and combat_xp_accrued_to both stale, which is what a player
    --     who closed the tab mid-fight looks like), then THREE attended credits
    --     from the booting client, then the away settle.
    --     ON THE OLD BODY every one of these credits succeeded and stamped
    --     combat_xp_accrued_to = now(); GATE(P3) below is the assertion that
    --     failed live and is the regression this file exists to hold.
    insert into public.player_state (user_id, slot, gold, gems, version, combat_xp_accrued_to, accrued_to)
      values (v_uid, v_slot, 0, 0, 1, now() - interval '4 hours 2 minutes', now() - interval '4 hours 2 minutes')
      on conflict (user_id, slot) do update set gold = 0,
        combat_xp_accrued_to = now() - interval '4 hours 2 minutes',
        accrued_to = now() - interval '4 hours 2 minutes';
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
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 40, 'strength', 24), 'paione-2');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P1): credit #2 was not refused: %', v; end if;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 90, 'hitpoints', 56), 'paione-3');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P1): credit #3 was not refused: %', v; end if;

    -- (P2) A REFUSAL IS A TOTAL NO-OP. No XP, no ledger row, no idempotency row —
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

    -- (P3) ★ THE WATERMARK DID NOT MOVE — so the settle's
    --      xpEligibleFromMs = max(fromMs, combat_xp_accrued_to) stays at the START
    --      of the away window and every hour of its XP is eligible. This is the
    --      assertion that was false in production at 11:52:30 UTC.
    select combat_xp_accrued_to into v_wm1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_wm1 <> v_wm0 then
      raise exception 'GATE(P3): a refused credit ARMED THE TRIM — combat_xp_accrued_to moved % -> %', v_wm0, v_wm1;
    end if;
    if v_wm1 > (select accrued_to from public.player_state where user_id=v_uid and slot=v_slot) then
      raise exception 'GATE(P3): the XP watermark LEADS the settle watermark over an unpaid window — the settle will trim';
    end if;

    -- (P4) THE SETTLE RUNS (accrued_to := now(), the engine's job) AND THE CLIENT
    --      RE-FLUSHES: now the credit is ADMITTED, and — Condition 2 — pays ~0 for
    --      the window the settle just claimed. The pending XP is not lost; it is
    --      credited by the NEXT flush, whose elapsed is honest (P5).
    update public.player_state set accrued_to = now() where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 142), 'paione-4');
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(P4): the post-settle credit was still refused: %', v;
    end if;
    if coalesce((v->>'credit')::bigint, -1) <> 0 then
      raise exception 'GATE(P4): the post-settle credit paid % for a window the settle just closed', v->>'credit';
    end if;

    -- (P5) THE HONEST LIVE PATH IS UNTOUCHED. A settle 60 s ago (inside the
    --      threshold) with a watermark 60 s ago: admitted, credited in full, and
    --      the watermark advances — the attended case the split was built for.
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

    -- (P6) THE THRESHOLD IS THE ONE THE JS MIRRORS. 179 s admitted, 181 s refused
    --      — the boundary asserted by execution, so a drift in either direction is
    --      caught here as well as by tests/combat-xp-cap-drift.mjs.
    update public.player_state set accrued_to = now() - interval '179 seconds',
           combat_xp_accrued_to = now() - interval '179 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 10), 'edge-179');
    if v->>'error' = 'settle_first' then raise exception 'GATE(P6): 179 s was refused — the threshold drifted DOWN'; end if;
    update public.player_state set accrued_to = now() - interval '181 seconds',
           combat_xp_accrued_to = now() - interval '181 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 10), 'edge-181');
    if coalesce(v->>'error','') <> 'settle_first' then raise exception 'GATE(P6): 181 s was admitted — the threshold drifted UP: %', v; end if;

    -- (P7) A REPLAY OF AN ALREADY-APPLIED KEY still answers, even mid-absence:
    --      that key described a window that was already accounted, and a client
    --      retrying a burnt key must never be told to settle instead.
    update public.player_state set accrued_to = now() - interval '5 hours'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 5000), 'paione-live');
    if coalesce((v->>'replay')::boolean, false) is not true then
      raise exception 'GATE(P7): a replay mid-absence was refused instead of answered: %', v;
    end if;

    -- (P8) THE OTHER REFUSALS SURVIVED THE REWRITE (a non-combat skill is still
    --      refused whole) — the body was replaced, so its other contracts are
    --      re-proven here rather than assumed.
    update public.player_state set accrued_to = now(), combat_xp_accrued_to = now() - interval '60 seconds'
     where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('woodcutting', 100), 'edge-badskill');
    if coalesce(v->>'error','') <> 'bad_skill' then raise exception 'GATE(P8): a non-combat skill was not refused: %', v; end if;

    raise exception using errcode = 'HR821', message = 'combat-xp-settle-first §2 complete — rolling back';
  exception when sqlstate 'HR821' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state           where user_id = v_uid)
     or exists (select 1 from public.player_ledger       where user_id = v_uid)
     or exists (select 1 from public.player_skills       where user_id = v_uid)
     or exists (select 1 from public.hr_combat_xp_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users                 where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
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
               'whole absence; the honest live credit is unchanged — all green';
end $$;
