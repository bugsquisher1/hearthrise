-- ============================================================================
-- 2026-09-06-cadence-recovery-floor.sql — SECURITY F1: THE ATTENDED CADENCE
-- RPCs MUST OBEY THE RECOVERY RULE.
--
-- ── THE GAP, AS ITS OWN AUTHOR WROTE IT DOWN ────────────────────────────────
-- 2026-09-06-recovering-until.sql shipped the Recovery Rule and named this hole
-- in its own header, verbatim:
--
--   "⚠ KNOWN LIMITATION, TRACKED, NOT FIXED HERE (Security F1). The cadence RPCs
--    `hr_credit_kills__ungated` and `hr_credit_combat_xp__ungated` do NOT floor
--    their credit window at `recovering_until`, so a MODIFIED client can keep
--    reporting attended kills and XP straight through a knockout and be paid at
--    the physical cap. … TODO next build: `v_wm := greatest(v_wm,
--    least(coalesce(recovering_until, v_wm), now()))` in BOTH functions."
--
-- This is that build, and it ships the formula that TODO names.
--
-- WHY IT IS NOT MERELY COSMETIC. The AWAY path is already correct: hr-accrue
-- (accrual.js + src/core/combat-sim.js) pays nothing inside the window, and
-- set-activity.js refuses to start a fight. The ATTENDED path is a different
-- door into the SAME counters, and it is the door the ranked surfaces read:
--   · hr_credit_combat_xp writes player_skills directly — combat XP has been the
--     SERVER-SOURCED leaderboard number since 2026-08-18.
--   · hr_credit_kills writes stat 'ev:kill_monster:<id>' and 'kills', which
--     hr_renown_of grades into a RANKED renown score, and the daily
--     'ev:kill_any' row that hr_claim_daily / hr_claim_goal PAY against.
-- So an unfloored knockout is not a private inefficiency; it crosses into other
-- players' rankings, which is the one property CLAUDE.md's server-authority
-- section names as non-negotiable. That the exploit needs a modified client is
-- not a mitigation — every client is modifiable and none is trusted.
--
-- ── WHAT IS ADDED (two functions, four inserted blocks, no new object) ──────
--   §1  hr_credit_kills__ungated
--         1a  declare  v_recovering / v_ko_used_today
--         1b  READ recovering_until off the SERVER row + the KO SHORT-CIRCUIT
--         1c  FLOOR the bounty-free window anchor
--         1d  FLOOR the bounty window (accepted_at)
--   §2  hr_credit_combat_xp__ungated
--         2a  declare  v_recovering
--         2b  READ recovering_until in the row lock it ALREADY takes, and floor
--             the watermark with the F1 formula
--         2c  the KO SHORT-CIRCUIT, sited after the read-only clamp arithmetic
--             so its receipt carries the REAL cap / day_used / dmg_level
--   §3  grants restated (revoke before grant). SIGNATURES ARE UNCHANGED, so no
--       client call form moves and hr_client_rpc_baseline needs no new row.
--   §4  self-check — every load-bearing property, proven on apply
--
-- ⚠ PROGRAMMATIC, NOT A create-or-replace, AND THIS IS THE LOAD-BEARING CHOICE.
--   `hr_credit_kills__ungated`'s live body is 2026-09-01-kill-daily-credit.sql
--   §3 WITH 2026-09-02-renown-kill-faucet.sql's anchored patch (the credited
--   counters) applied on top of it. A restated body derived from either file
--   alone would compile, self-check green and SILENTLY DELETE the other — the
--   single most destructive statement available in this tree, and the exact
--   failure 2026-09-06-recovering-until.sql's header spends fifteen lines
--   warning about. This file therefore edits `pg_get_functiondef` output at
--   guarded, exactly-once anchors (the 2026-08-22-rested-record.sql /
--   2026-08-24-combat-style.sql / 2026-09-02-renown-kill-faucet.sql idiom), is a
--   member of NO derivation chain, takes over NO last-toucher role, and NO-OPs
--   on re-apply (both patches test for their own marker first).
--   §0 asserts EVERY anchor of an UNPATCHED body exists exactly once BEFORE a
--   byte is written: a `replace()` whose anchor is absent is a silent no-op that
--   leaves a function half-patched and a migration reporting success. (It skips
--   a body that already carries the marker, because two of the four inserts
--   REWRITE their anchor line — asserting them on a re-apply would raise on a
--   database that is already correct.)
--
-- ── THE FORMULA, AND WHY `least(…, now())` IS IN IT ─────────────────────────
--       window_start := greatest(<existing floor>, least(coalesce(recovering_until,
--                                                        <existing floor>), now()))
--   · `coalesce(…, <existing floor>)` — a NULL recovery line (the ordinary value,
--     "this character is on their feet") must change NOTHING. The clamp collapses
--     to `greatest(x, least(x, now()))` = x for any x <= now().
--   · `greatest(…)` — the floor may only ever move the window start FORWARD. It
--     can never hand a player a longer window than they already had, so it cannot
--     become a faucet if recovering_until is ever stale or garbage.
--   · `least(…, now())` — a FUTURE line must not push the start past now() and
--     make `now() - start` NEGATIVE. Both caps clamp elapsed at zero themselves
--     (`greatest(0, coalesce(p_elapsed_ms,0))`), so this is belt-and-braces
--     rather than the only defence, but the bounty branch computes its elapsed
--     with no `greatest(0, …)` of its own and a negative value has no business
--     travelling that far.
--   RAISED, NEVER REFUSED, and deliberately: unlike hr_apply's `bad_recovering`
--   (a shape claim the engine makes, where silent repair would turn a compromised
--   engine's bug into the server's opinion), this is a WINDOW the server derives
--   entirely from its own two columns. There is no client claim here to refuse.
--
-- ── WHY BOTH A FLOOR *AND* A SHORT-CIRCUIT ──────────────────────────────────
-- The floor alone is already sufficient for the money: with the window start
-- clamped to now(), elapsed is 0, and hr_bounty_kill_cap / hr_combat_xp_cap are
-- both exactly 0 at elapsed 0 (§4(i) EVALUATES that rather than asserting it).
-- The short-circuit exists for the other two reasons:
--   1. IT NAMES THE REFUSAL. A caller gets `reason:'recovering'` and the instant
--      they are up, instead of a silent zero indistinguishable from a throttle.
--   2. IT WRITES NOTHING. Without it the call would still append its idempotency
--      row and — in the XP function — stamp `combat_xp_accrued_to = now()`. That
--      stamp is a WATERMARK ADVANCE PAST A WINDOW NOBODY PAID: the player would
--      come out of a 64-minute knockout with the whole window silently retired,
--      and the first honest credit afterwards would be capped at the seconds
--      since the last KO poll. THE FLOOR WOULD HAVE COST THE PLAYER THE VERY
--      TIME IT REFUSED TO PAY FOR. §4(f) asserts, in both bodies, that the
--      short-circuit's `return` precedes every write the body makes.
--   The kills function's bounty-free ANCHOR is the same hazard in the other
--   shape: it is `max(created_at)` over hr_kill_credit_log, so an appended row
--   moves it. Returning before the append leaves the anchor where it was, and
--   the §1c floor is then what stops the untouched anchor paying for the
--   knockout after the fact. The two halves are one mechanism.
--
-- ── IDEMPOTENCY AND CONCURRENCY (unchanged, and that is the point) ──────────
-- Both functions already take a per-character advisory lock and consult their
-- own idempotency log BEFORE any of this. A replay of a key that was credited
-- before the knockout still returns its stored receipt from the log (the replay
-- branch is upstream of every insert here) — a refusal must never rewrite
-- history. A replay of a key that was REFUSED with `recovering` was never
-- recorded, so it is retryable, which is the correct posture for a refusal whose
-- answer changes with the clock: the same key retried after the window simply
-- succeeds. Nothing here reads or writes across a network hop, and nothing here
-- is read-modify-write: `recovering_until` is read INSIDE the lock the function
-- already holds (the XP function reads it in the `for update` it already issues;
-- the kills function adds one indexed point read on the primary key).
--
-- ── COST, AT 100x PLAYERS ───────────────────────────────────────────────────
-- One extra primary-key lookup on player_state per hr_credit_kills call (the XP
-- function adds ZERO queries — the column joins a select that already runs).
-- NO new table, NO new index, NO new column, NO per-call row. The audit signal
-- in §1b/§2c is RATE-BOUNDED TO ONE LEDGER ROW PER CHARACTER PER UTC DAY, the
-- same idiom as `daily_kill_settle_absorbed`: a 64-minute knockout at the 60 s
-- client cadence would otherwise be ~64 rows per player per fall, which is
-- precisely the game_events mistake (1.6M rows / 229 MB from six players in four
-- days) reproduced at ledger scale. Journal rule 6 is why it is one row.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive anchored inserts, reversible WITHOUT restating either body: revert is
-- `pg_get_functiondef` minus the inserted blocks. No signature moves, no ACL
-- moves, no column is added or dropped, no client call form changes, and NO EDGE
-- REDEPLOY IS REQUIRED — the accrual engine does not call these verbs. Simply
-- leaving the patch in place on a database whose `recovering_until` is always
-- null is a byte-for-byte no-op by construction (see the coalesce above), so the
-- forward and backward directions are both safe in either order with the edge.
--
-- ⚠ IT MOVES TWO TRACKED BODIES. hr_credit_kills__ungated and
--   hr_credit_combat_xp__ungated are both pinned in
--   tests/live-hash-drift.baseline.json, and this file becomes the LAST TOUCHER
--   of each. The baseline must be re-measured by the Coordinator after apply;
--   this file deliberately does not edit it (that record is a MEASUREMENT of
--   production, and a measurement written by the thing being measured is not
--   evidence).
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
-- Every anchor asserted EXACTLY ONCE before a single byte is written.
do $mig$
declare v_k text; v_x text; v_n int;
begin
  if to_regprocedure('public.hr_credit_kills__ungated(int,text,bigint,text)') is null then
    raise exception 'hr_credit_kills__ungated missing — apply 2026-08-30-bounty-kill-credit.sql / 2026-09-01-kill-daily-credit.sql first';
  end if;
  if to_regprocedure('public.hr_credit_combat_xp__ungated(int,jsonb,text)') is null then
    raise exception 'hr_credit_combat_xp__ungated missing — apply 2026-08-31-combat-xp-credit.sql first';
  end if;
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing — run schema.sql + the player-state chain first';
  end if;
  -- THE DEPENDENCY THAT MAKES THIS FILE MEAN ANYTHING. Without the column the
  -- floor reads NULL forever and the patch is decoration.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state'
                    and column_name='recovering_until') then
    raise exception 'player_state.recovering_until is absent — apply 2026-09-06-recovering-until.sql first; without it this floor is decoration';
  end if;
  if to_regprocedure('public.hr_utc_day_start(timestamptz)') is null then
    raise exception 'hr_utc_day_start missing — the audit signal cannot be rate-bounded to one row per day';
  end if;

  v_k := pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure);
  v_x := pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure);

  -- ⚠ THE ANCHOR ASSERTIONS ARE SKIPPED FOR A BODY THAT IS ALREADY PATCHED, and
  --   that is not laziness — it is what makes the file IDEMPOTENT. Two of the
  --   four inserts REWRITE their anchor line (the bounty elapsed expression and
  --   the combat-XP row-lock select), so after a successful apply those anchors
  --   no longer exist. Asserting them unconditionally would make a re-apply
  --   raise on a database that is already correct, which is the worst possible
  --   failure mode for a migration an operator may have to run twice.
  if strpos(v_k, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then
    raise notice 'hr_credit_kills__ungated is already patched — its anchors are not re-asserted';
  else
    -- §1a
    v_n := (length(v_k) - length(replace(v_k, $anc$  v_out       jsonb;$anc$, ''))) / length($anc$  v_out       jsonb;$anc$);
    if v_n <> 1 then raise exception 'kills: the declare anchor is missing or ambiguous (%)', v_n; end if;
    -- §1b
    v_n := (length(v_k) - length(replace(v_k, $anc$  -- SERVER CLOCK ONLY.
  if v_free then$anc$, ''))) / length($anc$  -- SERVER CLOCK ONLY.
  if v_free then$anc$);
    if v_n <> 1 then raise exception 'kills: the branch anchor is missing or ambiguous (%)', v_n; end if;
    -- §1c
    v_n := (length(v_k) - length(replace(v_k, $anc$    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);$anc$, '')))
           / length($anc$    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);$anc$);
    if v_n <> 1 then raise exception 'kills: the bounty-free anchor line is missing or ambiguous (%) — apply 2026-09-01-kill-daily-credit.sql first', v_n; end if;
    -- §1d
    v_n := (length(v_k) - length(replace(v_k, $anc$    v_elapsed := floor(extract(epoch from (now() - v_ab.accepted_at)) * 1000)::bigint;$anc$, '')))
           / length($anc$    v_elapsed := floor(extract(epoch from (now() - v_ab.accepted_at)) * 1000)::bigint;$anc$);
    if v_n <> 1 then raise exception 'kills: the bounty elapsed line is missing or ambiguous (%)', v_n; end if;
    -- THE PREDECESSOR PATCH MUST BE THERE. If renown-kill-faucet has not run,
    -- this file would pin a body that is missing the credited counters.
    if strpos(v_k, 'kill_credited') = 0 then
      raise exception 'kills: the live body does not carry the renown credited counters — apply 2026-09-02-renown-kill-faucet.sql first';
    end if;
  end if;

  if strpos(v_x, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then
    raise notice 'hr_credit_combat_xp__ungated is already patched — its anchors are not re-asserted';
  else
    -- §2a
    v_n := (length(v_x) - length(replace(v_x, $anc$  v_out_credit jsonb := '{}'::jsonb;$anc$, ''))) / length($anc$  v_out_credit jsonb := '{}'::jsonb;$anc$);
    if v_n <> 1 then raise exception 'combat-xp: the declare anchor is missing or ambiguous (%)', v_n; end if;
    -- §2b
    v_n := (length(v_x) - length(replace(v_x, $anc$  select combat_xp_accrued_to, accrued_to, active_kind into v_wm, v_accrued, v_active_kind
    from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  v_wm := greatest(v_wm, v_accrued);$anc$, ''))) / length($anc$  select combat_xp_accrued_to, accrued_to, active_kind into v_wm, v_accrued, v_active_kind
    from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  v_wm := greatest(v_wm, v_accrued);$anc$);
    if v_n <> 1 then raise exception 'combat-xp: the watermark anchor is missing or ambiguous (%)', v_n; end if;
    -- §2c
    v_n := (length(v_x) - length(replace(v_x, $anc$  v_remaining := least(v_cap, greatest(0, c_combat_xp_day_budget - v_used_today));$anc$, '')))
           / length($anc$  v_remaining := least(v_cap, greatest(0, c_combat_xp_day_budget - v_used_today));$anc$);
    if v_n <> 1 then raise exception 'combat-xp: the pool anchor is missing or ambiguous (%)', v_n; end if;
  end if;
end $mig$;

-- ── 1. hr_credit_kills__ungated — THE RECOVERY FLOOR ─────────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure);
  if strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then
    raise notice 'hr_credit_kills__ungated already carries the recovery floor — skipping';
  else
    -- 1a. THE DECLARES.
    v_def := replace(v_def,
      $anc$  v_out       jsonb;$anc$,
      $anc$  -- SECURITY F1 - THE RECOVERY FLOOR. The character's absolute knockout
  -- instant, read from the SERVER row under this function's own advisory lock.
  -- NULL is the ordinary value ("on their feet") and must change nothing.
  v_recovering timestamptz;
  v_ko_used_today bigint := 0;
  v_out       jsonb;$anc$);

    -- 1b. THE READ + THE KO SHORT-CIRCUIT. Sited AFTER the idempotency replay
    --     (a key credited before the fall still returns its receipt), AFTER the
    --     bad_idem / bad_target / no_character / unknown_monster shape refusals
    --     (a malformed call is still malformed while knocked out), and BEFORE
    --     every write this body makes.
    v_def := replace(v_def,
      $anc$  -- SERVER CLOCK ONLY.
  if v_free then$anc$,
      $anc$  -- SECURITY F1 - THE RECOVERY FLOOR (the attended half of the Recovery Rule).
  -- A death INTERRUPTS a run; while `recovering_until` runs, the away path
  -- (accrual.js + combat-sim.js simulateSpan) pays nothing and set-activity.js
  -- refuses to start a fight. This verb is the OTHER door into the same
  -- counters - and the one the RANKED surfaces read (stat ev:kill_monster:* and
  -- 'kills' are graded by hr_renown_of; daily ev:kill_any is PAID by
  -- hr_claim_daily) - so it must obey the same line or a modified client simply
  -- keeps reporting kills through the knockout and is paid at the physical cap.
  -- No `for update`: this verb never writes player_state, and the per-character
  -- advisory lock above already serialises it against its own concurrent calls.
  select recovering_until into v_recovering
    from public.player_state where user_id = v_uid and slot = v_slot;

  if v_recovering is not null and now() < v_recovering then
    -- CREDIT ZERO, WRITE NOTHING, ADVANCE NOTHING. Returning here leaves the
    -- bounty-free anchor (max(created_at) over hr_kill_credit_log) exactly where
    -- it was, which is what the 1c floor then relies on: the anchor is stale by
    -- the whole knockout, and only the floor stops it paying for it afterwards.
    -- The idempotency key is NOT recorded, so the same key retried after the
    -- window succeeds - the correct posture for a refusal whose answer is a
    -- function of the clock.
    if v_free then
      select coalesce(sum(applied), 0) into v_ko_used_today from public.hr_kill_credit_log
        where user_id = v_uid and slot = v_slot and free
          and created_at >= public.hr_utc_day_start(now());
    end if;

    -- THE AUDIT SIGNAL, RATE-BOUNDED TO ONE ROW PER CHARACTER PER UTC DAY (the
    -- daily_kill_settle_absorbed idiom). The stock client never calls this verb
    -- while knocked out, so a row here is a tell worth being able to grep by
    -- intent - but a 64-minute knockout at the 60 s cadence would file ~64 rows
    -- per fall, and journal rule 6 exists because game_events reached 1.6M rows
    -- from six players by writing per tick. One named row says "go look".
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and slot = v_slot
                      and intent = 'kill_credit_while_recovering'
                      and at >= public.hr_utc_day_start(now())) then
      insert into public.player_ledger
        (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values
        (v_uid, v_slot, 'bounty', 'kill_credit_while_recovering', 0, 0, 0, 0, 0,
         jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
           'target', p_target, 'free', v_free, 'day', v_day,
           'recovering_until', v_recovering,
           'remaining_ms', floor(extract(epoch from (v_recovering - now())) * 1000)::bigint));
    end if;

    -- The NORMAL receipt shape with every credited quantity ZERO, plus the named
    -- reason. The bounty branch keeps `progress`/`required` because the client
    -- keys its server-confirmed bar on the PRESENCE of a numeric progress; the
    -- bounty-free branch keeps its day fields for the same reason.
    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,
      'credit', 0, 'claimed', v_claimed, 'cap', 0, 'throttled', false,
      'bounty', not v_free, 'day', v_day, 'slot', v_slot,
      'reason', 'recovering', 'recovering_until', v_recovering);
    if v_free then
      v_out := v_out || jsonb_build_object('day_used', v_ko_used_today,
                                           'day_budget', c_kill_day_budget,
                                           'settle_delta', 0, 'consumed', 0, 'owed', 0);
    else
      v_out := v_out || jsonb_build_object(
        'progress', greatest(0, public.hr_bounty_kills(v_uid, v_slot, p_target) - v_ab.baseline),
        'required', v_ab.required);
    end if;
    return v_out;
  end if;

  -- SERVER CLOCK ONLY.
  if v_free then$anc$);

    -- 1c. THE BOUNTY-FREE WINDOW FLOOR. `v_anchor` is already the later of the
    --     last bounty-free credit and the settle watermark; the recovery line
    --     joins it as a third floor. Raise-only, and a NULL line is a no-op.
    v_def := replace(v_def,
      $anc$    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);$anc$,
      $anc$    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);
    -- SECURITY F1 - THE RECOVERY FLOOR. The window may not start before the
    -- character was back on their feet. A knockout that ended thirty seconds ago
    -- leaves the log anchor an hour stale (the KO short-circuit above wrote no
    -- row), and without this line that whole hour would be creditable the
    -- instant they stand up. greatest() so it can only ever SHORTEN the window;
    -- least(.., now()) so a future line cannot make the window negative.
    v_anchor := greatest(v_anchor, least(coalesce(v_recovering, v_anchor), now()));$anc$);

    -- 1d. THE BOUNTY WINDOW FLOOR. Same formula against accepted_at. Note this
    --     branch computes elapsed with no greatest(0, ..) of its own - the cap
    --     clamps it, but a negative interval has no business travelling.
    v_def := replace(v_def,
      $anc$    v_elapsed := floor(extract(epoch from (now() - v_ab.accepted_at)) * 1000)::bigint;$anc$,
      $anc$    -- SECURITY F1 - THE RECOVERY FLOOR. A bounty's cap window runs from
    -- accepted_at; a knockout inside it is time the character could not have
    -- fought, so the window starts again when they got up.
    v_elapsed := floor(extract(epoch from (now() -
      greatest(v_ab.accepted_at, least(coalesce(v_recovering, v_ab.accepted_at), now())))) * 1000)::bigint;$anc$);

    execute v_def;
    raise notice 'hr_credit_kills__ungated: the recovery floor is installed (both branches)';
  end if;
end $mig$;

-- ── 2. hr_credit_combat_xp__ungated — THE RECOVERY FLOOR ─────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure);
  if strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then
    raise notice 'hr_credit_combat_xp__ungated already carries the recovery floor — skipping';
  else
    -- 2a. THE DECLARE.
    v_def := replace(v_def,
      $anc$  v_out_credit jsonb := '{}'::jsonb;$anc$,
      $anc$  -- SECURITY F1 - THE RECOVERY FLOOR. Read in the row lock this function
  -- ALREADY takes, so the floor costs zero extra queries.
  v_recovering timestamptz;
  v_out_credit jsonb := '{}'::jsonb;$anc$);

    -- 2b. THE READ + THE WATERMARK FLOOR. This is the TODO
    --     2026-09-06-recovering-until.sql wrote down, spelled exactly as it
    --     specified it.
    v_def := replace(v_def,
      $anc$  select combat_xp_accrued_to, accrued_to, active_kind into v_wm, v_accrued, v_active_kind
    from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  v_wm := greatest(v_wm, v_accrued);$anc$,
      $anc$  select combat_xp_accrued_to, accrued_to, active_kind, recovering_until
    into v_wm, v_accrued, v_active_kind, v_recovering
    from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  v_wm := greatest(v_wm, v_accrued);
  -- SECURITY F1 - THE RECOVERY FLOOR (CONDITION 2's sibling). Condition 2 floors
  -- the window at the settle watermark so a settle-first race cannot be paid
  -- twice; this floors it at the KNOCKOUT so a modified client cannot be paid at
  -- all for time the character spent face-down. Combat XP is the SERVER-SOURCED
  -- leaderboard number (2026-08-18), so this is a ranked surface and the tighter
  -- of the two reasons. Raise-only, NULL is a no-op, least(.., now()) keeps a
  -- future line from making elapsed negative.
  v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));$anc$);

    -- 2c. THE KO SHORT-CIRCUIT. Sited AFTER the (entirely read-only) cap and
    --     day-budget arithmetic so the refusal's receipt carries the REAL cap,
    --     day_used and dmg_level rather than placeholder zeros - and still
    --     BEFORE the distribution loop, the player_skills update, the watermark
    --     stamp and both inserts.
    v_def := replace(v_def,
      $anc$  v_remaining := least(v_cap, greatest(0, c_combat_xp_day_budget - v_used_today));$anc$,
      $anc$  v_remaining := least(v_cap, greatest(0, c_combat_xp_day_budget - v_used_today));

  -- SECURITY F1 - THE RECOVERY FLOOR: CREDIT ZERO, WRITE NOTHING, ADVANCE
  -- NOTHING. The 2b floor has already driven v_cap to 0 (hr_combat_xp_cap is
  -- exactly 0 at elapsed 0), so the money is closed either way. What this block
  -- adds is (i) a NAMED refusal instead of a silent zero, and (ii) the guarantee
  -- that `combat_xp_accrued_to = now()` further down is NOT reached. That stamp
  -- would retire the whole knockout window unpaid: the player would stand up and
  -- find their first honest credit capped at the seconds since the last poll -
  -- the floor charging them for the time it refused to pay.
  if v_recovering is not null and now() < v_recovering then
    -- ONE LEDGER ROW PER CHARACTER PER UTC DAY (journal rule 6). The stock
    -- client never credits XP while knocked out; a row here is the tell.
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and slot = v_slot
                      and intent = 'xp_credit_while_recovering'
                      and at >= public.hr_utc_day_start(now())) then
      insert into public.player_ledger
        (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
      values
        (v_uid, v_slot, 'combat', 'xp_credit_while_recovering', 0, 0, 0, 0,
         jsonb_build_object('recovering_until', v_recovering,
           'remaining_ms', floor(extract(epoch from (v_recovering - now())) * 1000)::bigint,
           'cap', v_cap, 'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl,
           'day_used', v_used_today, 'active_kind', v_active_kind));
    end if;
    return jsonb_build_object('ok', true, 'credited', '{}'::jsonb, 'credit', 0,
      'claimed', 0, 'cap', v_cap, 'throttled', false,
      'day_used', v_used_today, 'day_budget', c_combat_xp_day_budget,
      'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl, 'slot', v_slot,
      'reason', 'recovering', 'recovering_until', v_recovering);
  end if;$anc$);

    execute v_def;
    raise notice 'hr_credit_combat_xp__ungated: the recovery floor is installed';
  end if;
end $mig$;

-- ── 3. GRANTS — revoke before grant, and NOTHING MOVES ──────────────────────
-- create-or-replace preserves an ACL, but an explicit restatement is what §4(g)
-- asserts. Both signatures are UNCHANGED, so no client call form moves and
-- hr_client_rpc_baseline needs no new row (hr_credit_kills / hr_credit_combat_xp
-- are already recorded there by 2026-09-01 / 2026-08-31 with these exact
-- identity_args). The __ungated bodies stay callable by NO client role at all —
-- the rate-gated wrappers are the only door.
revoke execute on function public.hr_credit_kills__ungated(int,text,bigint,text)
  from public, anon, authenticated, service_role;
revoke execute on function public.hr_credit_combat_xp__ungated(int,jsonb,text)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK — the load-bearing properties, proven on apply ─────────────
-- A migration that cannot prove its own claims is a claim.
do $mig$
declare
  v_k text; v_x text; v_role text;
  v_ret int; v_write int; v_t0 timestamptz; v_res timestamptz;
begin
  v_k := pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure);
  v_x := pg_get_functiondef('public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure);

  -- (a) THE PATCH LANDED IN BOTH BODIES. Asserted separately per body: a file
  --     that patched one of the two and no-oped on the other would leave the
  --     exploit fully open through the other door and report success.
  if strpos(v_k, 'SECURITY F1 - THE RECOVERY FLOOR') = 0 then
    raise exception 'F1 self-check (a): hr_credit_kills__ungated does not carry the recovery floor';
  end if;
  if strpos(v_x, 'SECURITY F1 - THE RECOVERY FLOOR') = 0 then
    raise exception 'F1 self-check (a): hr_credit_combat_xp__ungated does not carry the recovery floor';
  end if;

  -- (b) THE WINDOW START IS FLOORED — the F1 formula, in all THREE windows the
  --     two verbs own (bounty-free anchor, bounty accepted_at, XP watermark).
  --     Text, because there is no way to reach these expressions by evaluation
  --     without a signed-in character, and a floor that is merely "present
  --     somewhere in the file" is not a floor.
  if strpos(v_k, 'v_anchor := greatest(v_anchor, least(coalesce(v_recovering, v_anchor), now()));') = 0 then
    raise exception 'F1 self-check (b): the bounty-FREE window is not floored at recovering_until';
  end if;
  if strpos(v_k, 'greatest(v_ab.accepted_at, least(coalesce(v_recovering, v_ab.accepted_at), now()))') = 0 then
    raise exception 'F1 self-check (b): the BOUNTY window is not floored at recovering_until';
  end if;
  if strpos(v_x, 'v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));') = 0 then
    raise exception 'F1 self-check (b): the combat-XP watermark is not floored at recovering_until';
  end if;

  -- (c) THE FLOOR READS THE SERVER COLUMN, not a parameter. A floor fed from
  --     p_* would be a client value deciding its own punishment.
  if strpos(v_k, 'select recovering_until into v_recovering') = 0 then
    raise exception 'F1 self-check (c): the kills floor does not read player_state.recovering_until';
  end if;
  if strpos(v_x, 'select combat_xp_accrued_to, accrued_to, active_kind, recovering_until') = 0 then
    raise exception 'F1 self-check (c): the combat-XP floor does not read player_state.recovering_until in its row lock';
  end if;
  if v_k ~ 'v_recovering\s*:?=\s*\(?p_' or v_x ~ 'v_recovering\s*:?=\s*\(?p_' then
    raise exception 'F1 self-check (c): the recovery line is assigned from a PARAMETER — the client would choose its own knockout';
  end if;

  -- (d) ZERO IS CREDITED WHILE THE LINE RUNS, and the refusal is NAMED.
  if strpos(v_k, 'if v_recovering is not null and now() < v_recovering then') = 0
     or strpos(v_k, $q$'reason', 'recovering'$q$) = 0 then
    raise exception 'F1 self-check (d): hr_credit_kills__ungated has no knocked-out short-circuit';
  end if;
  if strpos(v_x, 'if v_recovering is not null and now() < v_recovering then') = 0
     or strpos(v_x, $q$'reason', 'recovering'$q$) = 0 then
    raise exception 'F1 self-check (d): hr_credit_combat_xp__ungated has no knocked-out short-circuit';
  end if;
  -- EVERY credited quantity is zero in that arm, stated as literals.
  if strpos(v_k, $q$'credited', 0,$q$) = 0 or strpos(v_k, $q$'credit', 0, 'claimed', v_claimed, 'cap', 0$q$) = 0 then
    raise exception 'F1 self-check (d): the kills recovering receipt does not zero credited/credit/cap';
  end if;
  if strpos(v_x, $q$'credited', '{}'::jsonb, 'credit', 0,$q$) = 0 then
    raise exception 'F1 self-check (d): the combat-XP recovering receipt does not zero credited/credit';
  end if;

  -- (e) THE CLOCK IS THE SERVER'S. now(), never a delta, never a parameter.
  if strpos(v_k, 'now() < v_recovering') = 0 or strpos(v_x, 'now() < v_recovering') = 0 then
    raise exception 'F1 self-check (e): the knockout test does not use the server clock';
  end if;

  -- (f) ⚠ THE WATERMARK PROPERTY, AND IT IS THE SUBTLE ONE. The short-circuit's
  --     `return` must precede EVERY write the body makes, or the refusal would
  --     retire a window nobody paid for and the floor would cost the player the
  --     very time it refused to credit. Asserted by POSITION, which is the only
  --     way to assert an ordering in a text body.
  v_ret   := strpos(v_x, $q$'reason', 'recovering', 'recovering_until', v_recovering);$q$);
  v_write := strpos(v_x, 'set combat_xp_accrued_to = now()');
  if v_ret = 0 or v_write = 0 or v_ret >= v_write then
    raise exception 'F1 self-check (f): the combat-XP short-circuit does not return BEFORE the watermark stamp (ret %, stamp %) — a refused window would be retired unpaid', v_ret, v_write;
  end if;
  v_write := strpos(v_x, 'update public.player_skills set xp = xp + v_credit');
  if v_write = 0 or v_ret >= v_write then
    raise exception 'F1 self-check (f): the combat-XP short-circuit does not return BEFORE the skill credit';
  end if;
  v_write := strpos(v_x, 'insert into public.hr_combat_xp_credit_log');
  if v_write = 0 or v_ret >= v_write then
    raise exception 'F1 self-check (f): the combat-XP short-circuit does not return BEFORE the idempotency append — a refused key would be burned';
  end if;
  v_ret   := strpos(v_k, $q$'reason', 'recovering', 'recovering_until', v_recovering);$q$);
  v_write := strpos(v_k, 'insert into public.hr_kill_credit_log');
  if v_ret = 0 or v_write = 0 or v_ret >= v_write then
    raise exception 'F1 self-check (f): the kills short-circuit does not return BEFORE the credit-log append (ret %, append %) — the bounty-free anchor would advance across an unpaid knockout', v_ret, v_write;
  end if;
  v_write := strpos(v_k, 'insert into public.player_progress as p');
  if v_write = 0 or v_ret >= v_write then
    raise exception 'F1 self-check (f): the kills short-circuit does not return BEFORE the progress writes';
  end if;

  -- (g) NO PREDECESSOR PATCH WAS ERASED. This file is an anchored insert
  --     precisely so it cannot delete another file's work; the assertion is what
  --     makes that a fact rather than an intention.
  if strpos(v_k, 'kill_credited') = 0 then
    raise exception 'F1 self-check (g): the renown credited counters (2026-09-02) are GONE from hr_credit_kills__ungated';
  end if;
  if strpos(v_k, 'kills_stat') = 0 or strpos(v_k, 'daily_kill_settle_absorbed') = 0
     or strpos(v_k, 'c_kill_day_budget constant bigint := 10000;') = 0
     or strpos(v_k, 'public.hr_bounty_kill_cap') = 0 then
    raise exception 'F1 self-check (g): hr_credit_kills__ungated lost a kill-daily-credit control — the patch was not additive';
  end if;
  if strpos(v_x, 'c_combat_xp_day_budget constant bigint := 5000000;') = 0
     or strpos(v_x, 'public.hr_day_budget_check') = 0
     or strpos(v_x, 'set combat_xp_accrued_to = now()') = 0
     or strpos(v_x, 'c_combat_skills constant text[]') = 0 then
    raise exception 'F1 self-check (g): hr_credit_combat_xp__ungated lost a control — the patch was not additive';
  end if;
  -- The advisory locks and idempotency logs both survive.
  if strpos(v_k, 'pg_advisory_xact_lock') = 0 or strpos(v_x, 'pg_advisory_xact_lock') = 0 then
    raise exception 'F1 self-check (g): a per-character advisory lock was lost';
  end if;

  -- (h) THE PRIVILEGED BODIES ARE STILL CALLABLE BY NO CLIENT ROLE, and both are
  --     still SECURITY DEFINER with a pinned search_path. A grant that drifts is
  --     invisible until it is exploited.
  foreach v_role in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_role, 'public.hr_credit_kills__ungated(int,text,bigint,text)', 'execute') then
      raise exception 'F1 self-check (h): hr_credit_kills__ungated is executable by % — the rate gate and this floor are both decoration', v_role;
    end if;
    if has_function_privilege(v_role, 'public.hr_credit_combat_xp__ungated(int,jsonb,text)', 'execute') then
      raise exception 'F1 self-check (h): hr_credit_combat_xp__ungated is executable by %', v_role;
    end if;
  end loop;
  if not (select prosecdef from pg_proc where oid = 'public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure) then
    raise exception 'F1 self-check (h): a cadence body is no longer SECURITY DEFINER';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc
                    where oid = 'public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure), array[]::text[])) c
                  where c like 'search_path=%')
     or not exists (select 1 from unnest(coalesce((select proconfig from pg_proc
                    where oid = 'public.hr_credit_combat_xp__ungated(int,jsonb,text)'::regprocedure), array[]::text[])) c
                  where c like 'search_path=%') then
    raise exception 'F1 self-check (h): a cadence body lost its pinned search_path';
  end if;
  -- The CLIENT surface is unchanged: the gated wrappers, and only those.
  if not has_function_privilege('authenticated', 'public.hr_credit_kills(int,text,bigint,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_credit_combat_xp(int,jsonb,text)', 'execute') then
    raise exception 'F1 self-check (h): a gated wrapper stopped being callable — the attended cadence is inert';
  end if;

  -- (i) EVALUATED, NOT ASSERTED: a floored window credits ZERO. Both caps are
  --     pure functions, so the claim "elapsed 0 pays nothing" is checkable here
  --     rather than left as a comment. This is what makes the floor sufficient
  --     even if the short-circuit were ever removed.
  if public.hr_bounty_kill_cap(1, 99, 0) <> 0 or public.hr_bounty_kill_cap(500, 99, 0) <> 0 then
    raise exception 'F1 self-check (i): hr_bounty_kill_cap pays % at elapsed 0 — flooring the window would not close the exploit',
      public.hr_bounty_kill_cap(500, 99, 0);
  end if;
  if public.hr_combat_xp_cap(99, 0) <> 0 then
    raise exception 'F1 self-check (i): hr_combat_xp_cap pays % at elapsed 0', public.hr_combat_xp_cap(99, 0);
  end if;

  -- (j) EVALUATED: the FORMULA'S three properties, on the real clock.
  --     null => no-op · a future line => now() (never beyond) · a past line =>
  --     raise-only. Arithmetic, not text.
  v_t0 := now() - interval '1 hour';
  v_res := greatest(v_t0, least(coalesce(null::timestamptz, v_t0), now()));
  if v_res <> v_t0 then
    raise exception 'F1 self-check (j): a NULL recovery line is not a no-op — every healthy character would be clamped';
  end if;
  v_res := greatest(v_t0, least(coalesce(now() + interval '30 minutes', v_t0), now()));
  if v_res > now() or v_res < now() - interval '2 seconds' then
    raise exception 'F1 self-check (j): a FUTURE recovery line does not clamp the window start to now() — elapsed could go negative';
  end if;
  v_res := greatest(v_t0, least(coalesce(v_t0 - interval '1 hour', v_t0), now()));
  if v_res <> v_t0 then
    raise exception 'F1 self-check (j): the floor LOWERED the window start — it must be raise-only or it is a faucet';
  end if;

  -- (k) THE AUDIT SIGNAL IS RATE-BOUNDED. A row per call at the 60 s cadence
  --     through a 64-minute knockout is the game_events mistake at ledger scale.
  if strpos(v_k, $q$intent = 'kill_credit_while_recovering'$q$) = 0
     or strpos(v_k, 'hr_utc_day_start(now())') = 0 then
    raise exception 'F1 self-check (k): the kills recovering signal is not bounded to one row per UTC day';
  end if;
  if strpos(v_x, $q$intent = 'xp_credit_while_recovering'$q$) = 0
     or strpos(v_x, 'hr_utc_day_start(now())') = 0 then
    raise exception 'F1 self-check (k): the combat-XP recovering signal is not bounded to one row per UTC day';
  end if;
  -- …and it moves NO VALUE. A signal row that stamped xp_in/gold_in would enter
  -- the daily progression budget and a conservation sum.
  if strpos(v_k, $q$'bounty', 'kill_credit_while_recovering', 0, 0, 0, 0, 0,$q$) = 0 then
    raise exception 'F1 self-check (k): the kills recovering signal carries a value stamp';
  end if;
  if strpos(v_x, $q$'combat', 'xp_credit_while_recovering', 0, 0, 0, 0,$q$) = 0 then
    raise exception 'F1 self-check (k): the combat-XP recovering signal carries a value stamp';
  end if;

  raise notice 'F1 self-check PASSED — both attended cadence bodies floor their credit window at player_state.recovering_until (bounty-free anchor, bounty accepted_at, combat-XP watermark), credit ZERO with a named reason while the line runs, return BEFORE every write so no watermark is advanced across an unpaid window, keep every predecessor control and advisory lock, remain SECURITY DEFINER / search-path pinned / callable by no client role, and file at most one value-free audit row per character per UTC day.';
end $mig$;
