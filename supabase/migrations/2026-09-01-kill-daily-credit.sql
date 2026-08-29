-- 2026-09-01-kill-daily-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. NOT APPLIED TO PRODUCTION. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. Two distinct asks, stated up front so
--   neither is reviewed by accident:
--     (1) hr_credit_kills now ALSO stamps the DAILY goal counter
--         (kind='daily' key='ev:kill_any' period=hr_utc_day_key(now())). That
--         counter is what hr_claim_goal grades, so this file connects an existing
--         credit verb to an existing PAYOUT.
--     (2) hr_credit_kills now accepts a credit with NO ACTIVE BOUNTY. That is a
--         NEW client-reachable surface. Its blast radius is deliberately reduced
--         to ONE row — see "THE BOUNTY-FREE BRANCH WRITES ONE KEY" below.
--   The Coordinator applies it by hand via the curl-from-file path as part of a
--   coordinated client deploy. Read the change contract in the PR body first.
--
--   APPLY AFTER: 2026-08-30-bounty-kill-credit.sql (hr_credit_kills,
--   hr_bounty_kill_cap, hr_kill_credit_log), 2026-08-23-modal-goal-claims.sql
--   (hr_goal_rewards / hr_claim_goal / hr_goal_state) and
--   2026-08-29-rpc-gate-bucket-restore.sql (the FINAL hr_rpc_gate, which already
--   admits the hr_credit_kills bucket at 60/min). §0 fails closed on each.
--
--   ⚠ THIS FILE DOES NOT TOUCH hr_rpc_gate, hr_state_of OR hr_apply. The
--     hr_credit_kills bucket already exists in the live gate (verified on
--     nezapsylztqbbwuwembx 2026-08-29 via pg_get_functiondef). Restating the gate
--     from a template is precisely what caused the b484–b487 "everything refuses"
--     wave; this file is a member of no derivation chain and takes over no
--     last-toucher role.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FIXES (live report #41 residual — "30/30 · Confirming…")
-- ══════════════════════════════════════════════════════════════════════════
-- Daily and weekly KILL goals are graded on
--     player_progress(kind='daily', key='ev:kill_any', period_key=<utc day key>)
-- by hr_claim_goal__ungated and displayed by hr_goal_state__ungated. Verified on
-- production 2026-08-29: THREE catalogued goals read that one row —
--     kill_any   daily  target  10  → 200 gold + 50 combat XP
--     kill_more  daily  target  30  → 600 gold + 1 gem + 200 combat XP
--     wk_kills   weekly target 100  → 2500 gold + 3 gems + 1000 combat XP
--
-- That row has exactly ONE writer today: the away/span-sim in
-- supabase/functions/hr-accrue/accrual.js (via src/core/goals.js
-- goalProgressOps → hr_apply). The span-sim re-simulates the window as an
-- UNATTENDED character and realizes 60–99% FEWER kills than the attended player
-- actually made (src/core/kill-time.js header). hr_credit_kills — the verb that
-- exists precisely to top the server's kill count up to the attended number —
-- writes 'ev:kill_any' as kind='stat', period_key='' (the LIFETIME row) and has
-- never written the DAILY one (2026-08-30-bounty-kill-credit.sql:251-254).
--
-- Since the hr_rpc_gate hotfix restored hr_goal_state, the quest modal grades on
-- SERVER counts for the first time, so an attended player's kill-30 daily now
-- sits at "30/30 · Confirming…" with no Claim. The bar is the client's count; the
-- Claim is the server's, and nothing was connecting them.
--
-- ── FIX 1: STAMP THE DAILY ROW FROM THE SAME v_applied ──────────────────────
-- One additional upsert inside the EXISTING `if v_applied > 0` block, using the
-- EXACT delta the lifetime aggregate already uses. Same clamp (v_applied is the
-- shortfall against a cap that is already the physical maximum), same
-- idempotency (the hr_kill_credit_log once-guard returns before any write), same
-- journal. Column shapes verified against the real table on production
-- 2026-08-29: player_progress is (user_id, slot, kind, key, value, period_key,
-- state, updated_at) with PK (user_id, slot, kind, key, period_key), kind CHECK
-- admits 'daily', key CHECK is 1..64 ('ev:kill_any' = 11), period_key CHECK is
-- <=16 ('2026-8-29' = 9), state CHECK admits 'active'.
--
-- ── NO WEEKLY TWIN — AND THAT IS A FINDING, NOT AN OMISSION ─────────────────
-- There is NO kind='weekly'. Verified on production: player_progress' kind CHECK
-- is exactly {quest, daily, bounty, stat, collection, flag, unlock}, and BOTH
-- hr_goal_state__ungated and hr_claim_goal__ungated grade a WEEKLY goal by
-- SUMMING kind='daily' rows over public.hr_goal_week_days(now()) — the seven UTC
-- day keys of the current Monday-anchored week. So the single daily stamp below
-- feeds kill_any, kill_more AND wk_kills. Writing a kind='weekly' row (or a
-- second row under hr_utc_week_key) would create a key universe nothing reads —
-- the second-copy failure this repo has been burned by. §5(g) asserts the
-- catalogue property so the day someone adds a real weekly kind, this decision is
-- re-opened by name.
--
-- ── FIX 2: THE BOUNTY-FREE BRANCH (the NEW surface — review this hardest) ────
-- Today hr_credit_kills refuses with 'no_active_bounty' unless an active_bounty
-- row exists for that exact target, so a player killing 30 mobs with no bounty
-- gets no credit at all and the daily still never completes. The RPC now accepts
-- a credit without a bounty. The presence of the active_bounty row — a SERVER
-- fact, never a client flag — chooses the branch.
--
--   THE BOUNTY-FREE BRANCH WRITES ONE KEY: the DAILY counter. It does NOT write
--   'stat'/'ev:kill_any', it does NOT write 'stat'/'kills', and it does NOT write
--   the bestiary 'stat'/'ev:kill_monster:<target>'. That is not tidiness — it is
--   the containment. Measured on production 2026-08-29, the LIFETIME keys are
--   read by two PAYING surfaces:
--     · hr_claim_quest__ungated  reads stat/'ev:kill_any' ('first_blood', 150 g)
--     · hr_renown_of             scores stat/'ev:kill_any' at 0.05 renown/kill
--                                AND boss 'ev:kill_monster:<id>' at 5 renown/kill
--   Renown is a RANKABLE surface. At the gate's 60 calls/min a bounty-free writer
--   of those keys would be a renown faucet.
--
--   ⚠ THE DAILY COUNTER HAS THREE PAYING READERS, NOT TWO (Security C1, and I
--     had this WRONG in the first draft — the correction is recorded rather than
--     quietly patched, because HOW I missed it is the reusable lesson). I searched
--     for functions containing the LITERAL 'ev:kill_any'. Every catalogue-driven
--     reader builds the key by CONCATENATION — hr_claim_daily does
--     `key = 'ev:' || v_type`, hr_goal_state/hr_claim_goal do
--     `key = <catalogue>.counter_key` — so a literal scan returns NONE of them. A
--     reader set can only be pinned by scanning for kind='daily' itself, which is
--     what tests/kill-daily-credit.mjs K10 now does.
--
--     The complete reader set for (kind='daily', key='ev:kill_any'):
--       · hr_goal_state__ungated   display only
--       · hr_claim_goal__ungated   kill_any 10 -> 200 g; kill_more 30 -> 600 g + 1
--                                  gem; wk_kills 100 -> 2500 g + 3 gems
--       · hr_claim_daily__ungated  daily_kill     25 -> 500 g
--                                  daily_kill_big 60 -> 900 g
--                                  (both offered on ~54% / ~50% of days by the
--                                  day-seeded hr_daily_task_set)
--     Writers: hr_apply (hr_engine-only) and this function. hr_farm_plant /
--     hr_farm_harvest also write kind='daily', but 'ev:planted' / 'ev:harvest'.
--
--   THE CORRECTED FORGERY BOUND. The physics cap is NOT the binding control and
--   this file does not pretend it is: hr_bounty_kill_cap's floor is one 600 ms
--   swing, so its loosest possible answer is floor(1.3 * elapsed / 600) = 130
--   kills/minute — four orders of magnitude above a 30-kill daily. What bounds a
--   forger is STRUCTURAL: every one of those claims consumes a once-per-period
--   guard row, so however many kills are fabricated the reachable payout is
--       <= 2,200 gold + 1 gem per UTC day
--            (800 g + 1 gem via hr_claim_goal, up to 1,400 g via hr_claim_daily)
--        +  2,500 gold + 3 gems per ISO week (wk_kills)
--
--   AND GOLD HAS ONWARD REACH — say it plainly rather than calling this a
--   non-currency counter. Gold feeds the 'wealth' board of the leaderboard_ranked
--   MATERIALIZED VIEW (refreshed every 5 minutes by the hearthrise-leaderboards
--   cron job) and it is market purchasing power. So this is a ranked + tradeable
--   surface, not a cosmetic one.
--
--   WHY IT IS ACCEPTED ANYWAY (the reviewed rationale, recorded so a future
--   reader does not have to re-derive it):
--     · the same stipend is reachable HONESTLY in ~3 minutes of play — the
--       forgery buys time, not capability;
--     · the live accrual path pays a measured honest maximum of ~1.05M gold per
--       character-day, ~400x this ceiling, so it cannot move a wealth ranking
--       that six figures of legitimate income already dominates;
--     · every movement is journalled BY NAME and reversible —
--       'goal_claim:<period>:<goal>' / 'daily_claim:<day>:<task>' on the payout
--       side, 'kill_credit_throttled:<target>' (with claimed_raw) on the forgery
--       side.
--   The physics cap and the per-day credit ceiling below remain FUSES and forgery
--   signals. They are not the argument.
--
--   ALL EXISTING CLAMPS REMAIN, AND TWO ARE ADDED for the new branch only:
--     · the monster catalogue gate (unknown_monster) — unchanged, both branches,
--       so p_target can never be a phantom 1-HP monster;
--     · hr_bounty_kill_cap(hp, server-owned damage level, elapsed) — unchanged;
--     · idempotency (hr_kill_credit_log PK) — unchanged, both branches;
--     · the throttle journal — unchanged, both branches;
--     · NEW, bounty-free only: the elapsed window is anchored on
--       greatest(last bounty-free credit, player_state.accrued_to) and ceilinged
--       at c_free_window_ms;
--     · NEW, bounty-free only: a per-UTC-day credit ceiling summed from the
--       append-only hr_kill_credit_log (the clan_deposit budget pattern);
--     · NEW, bounty-free only: the SETTLE-DELTA SUBTRACTION (see below), which is
--       what keeps credit + settle from double-advancing the daily row.
--
-- ── ⚠ CREDIT + SETTLE MUST NOT DOUBLE-ADVANCE THE DAILY ROW ────────────────
-- The accrued_to floor is only HALF the split, and the first draft of this file
-- shipped only that half. It stops a credit paying for a window a settle has
-- already covered (settle-then-credit). It does NOT stop the NEXT settle covering
-- a window a credit already paid (credit-then-settle): hr_apply/accrual.js
-- re-simulates [accrued_to, now] in full and stamps its own sim-kills onto the
-- SAME daily row, and — unlike combat XP, which bought a `combat_xp_accrued_to`
-- watermark AND an edge change for exactly this — there is no kill watermark for
-- it to clamp against. Left purely additive the counter would read
-- settle_sim + observed for the same seconds, i.e. up to ~1.4x attended truth on
-- the repo's own measured 60-99% undercount. A paying counter that over-reads is
-- a mint, however small.
--
-- The BOUNTY branch never had the problem, because its v_applied is a SHORTFALL
-- against a counter the settle also feeds (the bestiary row), so the settle's
-- contribution cancels arithmetically. The bounty-free branch is given the SAME
-- cancellation against the settle's exact twin of the daily counter:
-- src/core/goals.js goalProgressOps writes daily 'ev:kill_any' and lifetime
-- stat 'ev:kill_any' from the SAME counts() in the SAME delta, so the growth of
-- the lifetime row since this character's previous bounty-free credit IS the
-- number the settle put on the daily row over that window. Hence, per call:
--
--     settle_delta = stat/ev:kill_any now  -  the same value at the last free credit
--     applied      = max(0, credit - settle_delta)
--     daily total  = settle_delta + (credit - settle_delta) = observed
--
-- The previous value rides on the log row that already exists for idempotency
-- (`kills_stat`, §2b) — no new table, no new player_state column, no edge change,
-- and AWAY-1 parity is untouched because accrual.js is not modified. §5(f5)
-- proves the composition by executing a real credit, a simulated settle on the
-- same window, and a second credit, and asserting the row never passes observed
-- truth. STATED LIMIT: a session that MIXES bounty and bounty-free credits
-- over-subtracts (the bounty branch writes the lifetime row too), bounded by one
-- call's credit and always in the UNDER direction — never a mint.
--   The BOUNTY branch is byte-for-byte the reviewed 2026-08-30 behaviour plus the
--   daily stamp; neither new clamp applies to it, so the money turn-in path is
--   not re-tuned by this file.
--
--   ⚠ WHY THAT ASYMMETRY IS HARMLESS — CORRECTED (Security C1c). The first draft
--     argued "the caps bound it". They do not, and saying so would repeat the
--     mistake this header exists to avoid. Two real reasons:
--       1. The bounty branch's v_applied is a DELTA against the bestiary counter
--          (target_val - current), so it goes to ZERO the moment the counter sits
--          at baseline + credit. It cannot pump the daily row by re-calling; it
--          can only track a counter that is itself capped per accept.
--       2. Neither ceiling is the control ANYWHERE, on either branch. The largest
--          target any reader of this row grades is 100 (wk_kills; the largest
--          per-day one is daily_kill_big at 60). c_kill_day_budget is 10,000 =
--          100x that, and the physics cap's 130 kills/minute is 187,200/day =
--          1,872x. A ceiling two to three orders of magnitude above the number
--          being defended is a fuse, not a control. THE CONTROL IS THE
--          ONCE-PER-PERIOD CLAIM GUARD in hr_claim_goal and hr_claim_daily — and
--          it applies identically to both branches, which is why the asymmetry
--          costs nothing.
--
-- ── WHY THE ANCHOR IS THE LOG AND NOT A NEW player_state COLUMN ─────────────
-- combat_xp_accrued_to is a column because hr_credit_combat_xp WRITES
-- player_state anyway (it moves XP and bumps version). This verb writes no
-- player_state row at all, so a fourth watermark column on the hottest row in the
-- system — the one every write locks and hr_state_of projects — would be pure
-- cost. hr_kill_credit_log is already append-only, already per-character, already
-- the idempotency record, and already the table the day ceiling must read. One
-- table, one lock, one read. Flooring the anchor at player_state.accrued_to gives
-- the same CONDITION-2 property the combat-XP file bought with its column: a
-- settle that just ran drives accrued_to to now(), so a credit racing behind it
-- prices a ~zero window and pays nothing for a window the settle already claimed.
-- That property needs no client cooperation and is asserted in §5(f).
--
-- ── WHY player_state IS READ WITHOUT `FOR UPDATE` ───────────────────────────
-- Deliberate. This verb never writes player_state, and taking a row lock it does
-- not need would put hr_credit_kills into the same lock graph as hr_apply,
-- hr_claim_goal and hr_claim_bounty for no benefit. A marginally stale accrued_to
-- can only widen the window, and the widening is bounded by c_free_window_ms.
--
-- ── LEDGER VOLUME (the game_events lesson) ──────────────────────────────────
-- A successful honest credit writes NO player_ledger row: it moves no value. Only
-- a THROTTLED claim journals, which an honest player never triggers. The receipt
-- is the hr_kill_credit_log row, whose retention this file widens to 2 days so the
-- day ceiling's window is always fully covered (§1). At the intended 60 s client
-- cadence, a 4-hour attended session is ~240 rows; 100x the current player count
-- at that rate is ~40 MB with the 2-day window, against the 229 MB / 1.6 M rows
-- game_events reached in four days from six players.
--
-- REVERSIBILITY: re-apply 2026-08-30-bounty-kill-credit.sql §3 (the previous
-- hr_credit_kills__ungated body) and §1 (the previous hr_kill_credit_prune). The
-- added hr_kill_credit_log.free / .kills_stat columns may be left in place
-- (unread) or dropped.
-- No table is created, no grant is widened, no other function is touched.
-- Additive and idempotent; safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_gate text;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_skills')   is null then raise exception 'player_skills missing'; end if;
  if to_regclass('public.active_bounty')   is null then
    raise exception 'active_bounty missing — apply 2026-08-23-bounty.sql first';
  end if;
  if to_regclass('public.hr_kill_credit_log') is null then
    raise exception 'hr_kill_credit_log missing — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception 'hr_bounty_monsters missing — apply 2026-08-23-bounty-monsters.generated.sql first';
  end if;
  if to_regclass('public.hr_goal_rewards') is null then
    raise exception 'hr_goal_rewards missing — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_credit_kills__ungated(int,text,bigint,text)') is null then
    raise exception 'hr_credit_kills__ungated not found — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  if to_regprocedure('public.hr_bounty_kill_cap(int,int,bigint)') is null then
    raise exception 'hr_bounty_kill_cap not found — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  if to_regprocedure('public.hr_bounty_kills(uuid,int,text)')   is null then raise exception 'hr_bounty_kills not found'; end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)')          is null then raise exception 'hr_level_from_xp not found'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)')       is null then raise exception 'hr_utc_day_key not found'; end if;
  if to_regprocedure('public.hr_utc_day_start(timestamptz)')     is null then
    raise exception 'hr_utc_day_start not found — apply 2026-08-11-daily-budget.sql first';
  end if;
  if to_regprocedure('public.hr_goal_week_days(timestamptz)')    is null then
    raise exception 'hr_goal_week_days not found — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_claim_goal__ungated(text,boolean,int,uuid)') is null then
    raise exception 'hr_claim_goal__ungated not found — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then raise exception 'hr_rpc_gate not found'; end if;

  -- The gate must ALREADY admit hr_credit_kills. This file must never restate the
  -- gate (that is what dropped every spliced bucket in the b484-b487 wave); if the
  -- bucket is missing, the correct fix is the gate file, not this one.
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_gate;
  if position('''hr_credit_kills''' in v_gate) = 0 then
    raise exception 'hr_rpc_gate does not admit hr_credit_kills — apply 2026-08-29-rpc-gate-bucket-restore.sql first (this file must NOT restate the gate)';
  end if;

  -- The goal this file exists to unblock must be catalogued and must grade on the
  -- daily row. If the catalogue ever moves to another counter, fail here rather
  -- than ship a stamp nothing reads.
  if not exists (select 1 from public.hr_goal_rewards
                  where counter_kind = 'daily' and counter_key = 'ev:kill_any') then
    raise exception 'hr_goal_rewards has no daily ev:kill_any goal — the stamp this file adds would be unread';
  end if;
end $$;

-- ── 1. RETENTION: the day ceiling reads this log, so keep >= 2 days ─────────
-- 2026-08-30 authored this prune with a 1-HOUR floor, which predates the day
-- ceiling §4 introduces. A prune run with a short interval would silently reset a
-- character's daily credit budget mid-day. Raising the floor to 2 days makes the
-- budget window structurally covered. Still revoked from every client role;
-- still unscheduled (an operator verb).
create or replace function public.hr_kill_credit_prune(p_older interval default interval '2 days')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.hr_kill_credit_log
   where created_at < now() - greatest(interval '2 days', coalesce(p_older, interval '2 days'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_kill_credit_prune(interval) from public, anon, authenticated, service_role;

-- ── 1b. SCHEDULE the prune. This is not housekeeping — it is a precondition. ─
-- Measured on nezapsylztqbbwuwembx 2026-08-29: cron.job carries eleven jobs and
-- NONE of them prunes hr_kill_credit_log, so the table has been growing unbounded
-- since 2026-08-30. Today that is slow (only a cull bounty at target writes rows);
-- §3 makes EVERY attended combat minute write one, which is exactly the shape
-- game_events had when it reached 1.6M rows / 229 MB from six players in four
-- days. A verb that appends on a cadence must ship with the job that trims it.
-- Same exception-wrapped idiom as 2026-08-11-telemetry-retention.sql §4, so a
-- project without pg_cron (the PGlite replay) still applies everything else.
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed — schedule this by hand:';
    raise notice '  select cron.schedule(''hr-kill-credit-prune'', ''40 4 * * *'', ''select public.hr_kill_credit_prune()'');';
    return;
  end if;
  begin perform cron.unschedule('hr-kill-credit-prune'); exception when others then null; end;
  perform cron.schedule('hr-kill-credit-prune', '40 4 * * *', 'select public.hr_kill_credit_prune()');
  raise notice 'scheduled: hr-kill-credit-prune (04:40 daily, 2-day window)';
exception when others then
  raise notice 'cron scheduling skipped (%) — schedule by hand (see notice above).', sqlerrm;
end $$;
-- ⚠ ITS TWIN IS STILL UNSCHEDULED AND IS NOT THIS FILE'S TO TOUCH.
--   public.hr_combat_xp_credit_prune (2026-08-31-combat-xp-credit.sql) has the
--   same shape and the same gap. Raised for the Coordinator rather than scheduled
--   here, because taking over another domain's last-toucher role is how the
--   hr_rpc_gate buckets got dropped. The one-liner is:
--     select cron.schedule('hr-combat-xp-credit-prune','42 4 * * *',
--                          'select public.hr_combat_xp_credit_prune()');

-- ── 2. The branch marker on the log ────────────────────────────────────────
-- `free` = this row was a BOUNTY-FREE credit. It makes the per-day ceiling exact
-- (a bounty turn-in must not eat a player's bounty-free budget) and gives an
-- auditor a one-predicate query for the new surface. Additive; existing rows
-- default to false, which is what they were.
alter table public.hr_kill_credit_log
  add column if not exists free boolean not null default false;
create index if not exists hr_kill_credit_log_free_day_idx
  on public.hr_kill_credit_log (user_id, slot, created_at) where free;

-- ── 2b. THE SETTLE WATERMARK ON THE LOG — the bounty-free branch's
--        anti-double-count. NULL on a bounty row; the lifetime stat/'ev:kill_any'
--        value at the moment of a bounty-free credit. See §3's `v_settle_delta`
--        block for why this is the ONE thing that makes the free branch's
--        additive stamp honest against a settle that follows it.
alter table public.hr_kill_credit_log
  add column if not exists kills_stat bigint;

-- ── 3. hr_credit_kills__ungated — the FULL new body ────────────────────────
-- ⚠ THIS BODY IS THE PRODUCTION BODY PULLED WITH pg_get_functiondef ON
--   nezapsylztqbbwuwembx (2026-08-29), NOT the repo template. Every line the
--   diff does not name is byte-identical to what is running now. What changed:
--     (a) the active_bounty lookup no longer refuses — it CHOOSES the branch;
--     (b) NEW bounty-free elapsed anchor + per-day ceiling;
--     (c) v_applied is the credit itself on the bounty-free branch (delta), and
--         the reviewed baseline top-up on the bounty branch (unchanged);
--     (d) the three LIFETIME upserts are now bounty-branch-only;
--     (e) NEW: the daily 'ev:kill_any' upsert, both branches;
--     (f) claimed is sanity-clamped before it is RECORDED (credit is unaffected —
--         the cap already binds far below);
--     (g) the receipt carries `bounty`, and progress/required only when there is
--         a bounty to have progress against.
create or replace function public.hr_credit_kills__ungated(
  p_slot int, p_target text, p_claimed bigint, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- The bounty-free elapsed window CEILING. The honest client cadence is 60 s;
  -- 10 minutes is generous slack for a backlogged flush and is the fuse against a
  -- pathological anchor (a pruned log AND a stale accrued_to). It is not balance.
  c_free_window_ms constant bigint := 600000;
  -- The per-character per-UTC-day BOUNTY-FREE credit ceiling, read from the
  -- append-only log (the clan_deposit budget pattern). 10,000 is 100x the largest
  -- target any reader of this row grades (wk_kills = 100; the largest per-day one
  -- is hr_claim_daily's daily_kill_big = 60), so it cannot throttle an honest
  -- player. It is a FUSE, not the control — the control is the once-per-period
  -- claim guard in hr_claim_goal / hr_claim_daily. See the header.
  c_kill_day_budget constant bigint := 10000;
  -- A recorded-claim sanity ceiling. Does NOT change credit (the physical cap
  -- binds far below); it keeps the log and the forgery journal from storing an
  -- attacker-chosen 9e18. The UNCLAMPED value is still journalled as
  -- `claimed_raw` (Security C6) — clamping the number a forger chose would erase
  -- the magnitude of the attempt, which is the one thing the signal is for.
  c_max_claim       constant bigint := 1000000;
  v_uid       uuid := auth.uid();
  v_slot      int  := coalesce(p_slot, 0);
  v_ab        public.active_bounty%rowtype;
  v_free      boolean;
  v_hp        int;
  v_dmg_lvl   int;
  v_elapsed   bigint;
  v_cap       bigint;
  v_claimed_raw bigint := greatest(0, coalesce(p_claimed, 0));
  v_claimed   bigint := least(greatest(0, coalesce(p_claimed, 0)), c_max_claim);
  v_credit    bigint;
  v_current   bigint;
  v_target_val bigint;
  v_applied   bigint;
  v_prior     public.hr_kill_credit_log%rowtype;
  v_progress  bigint;
  v_day       text := public.hr_utc_day_key(now());
  v_anchor    timestamptz;
  v_accrued   timestamptz;
  v_active_kind text;
  v_used_today bigint := 0;
  v_kills_now bigint;        -- lifetime stat/'ev:kill_any' NOW
  v_kills_prev bigint;       -- …and at this character's previous bounty-free credit
  v_settle_delta bigint := 0;
  v_out       jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null or length(p_idem) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_idem');
  end if;
  if p_target is null or p_target !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_target');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- Serialize concurrent credits for this character (idempotency read + write,
  -- and the anchor read + the log append that advances it).
  perform pg_advisory_xact_lock(hashtextextended('hr_credit_kills:' || v_uid::text, v_slot));

  -- IDEMPOTENCY: a replay of the same key returns the stored result, no re-apply.
  select * into v_prior from public.hr_kill_credit_log
    where user_id = v_uid and slot = v_slot and idem = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'target', v_prior.target,
      'credited', v_prior.applied, 'credit', v_prior.credit, 'cap', v_prior.cap,
      'claimed', v_prior.claimed, 'bounty', not v_prior.free, 'slot', v_slot);
  end if;

  -- THE BRANCH IS A SERVER FACT. An active bounty for THIS target supplies
  -- accepted_at (the cap window), the baseline (new-kills anchor) and required.
  -- Its ABSENCE is no longer a refusal: it selects the bounty-free branch, which
  -- credits the DAILY goal counter and nothing else.
  select * into v_ab from public.active_bounty
    where user_id = v_uid and slot = v_slot and target = p_target for update;
  v_free := (v_ab.user_id is null);

  -- THE MONSTER CATALOGUE GATE — both branches. p_target can never be a phantom.
  select hp into v_hp from public.hr_bounty_monsters where monster_id = p_target;
  if v_hp is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- Damage LEVEL = the greatest of the SERVER-owned strength/ranged/magic levels
  -- (whichever family the player would use is the most generous, safe direction).
  v_dmg_lvl := greatest(1,
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='magic'),0)));

  -- SERVER CLOCK ONLY.
  if v_free then
    -- The window is (last bounty-free credit .. now], floored at the settle
    -- watermark and ceilinged at c_free_window_ms. Flooring at accrued_to is the
    -- CONDITION-2 property: a settle that just ran (accrued_to = now) makes this
    -- window ~0, so a credit racing behind the settle cannot re-credit a window
    -- the span-sim already stamped onto the same daily row.
    -- NO `for update`: this verb never writes player_state (see the header).
    select accrued_to, active_kind into v_accrued, v_active_kind
      from public.player_state where user_id = v_uid and slot = v_slot;
    select max(created_at) into v_anchor from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free;
    v_anchor := greatest(coalesce(v_anchor, v_accrued), v_accrued);
    v_elapsed := least(c_free_window_ms,
                       greatest(0, floor(extract(epoch from (now() - v_anchor)) * 1000)::bigint));
  else
    v_elapsed := floor(extract(epoch from (now() - v_ab.accepted_at)) * 1000)::bigint;
  end if;

  v_cap := public.hr_bounty_kill_cap(v_hp, v_dmg_lvl, v_elapsed);
  v_credit := least(v_claimed, greatest(0, v_cap));

  if v_free then
    -- THE PER-UTC-DAY CEILING, summed from the append-only log (bounty-free rows
    -- only — a bounty turn-in must not eat this budget). A replay does not re-sum:
    -- it returned above.
    select coalesce(sum(applied), 0) into v_used_today from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free
        and created_at >= public.hr_utc_day_start(now());
    v_credit := least(v_credit, greatest(0, c_kill_day_budget - v_used_today));

    /* ── THE ANTI-DOUBLE-COUNT, and it is the load-bearing line of this branch ──
       The accrued_to floor above stops a credit paying for a window a settle has
       ALREADY covered. It does NOT stop the NEXT settle covering a window this
       credit already paid: hr_apply/accrual.js re-simulates [accrued_to, now] in
       full and stamps its own sim-kills onto the SAME daily row, and it has no
       kill watermark to clamp against (unlike combat XP, which got
       combat_xp_accrued_to and an edge change). Left additive, the daily counter
       would read settle_sim + observed for the same seconds — a paying counter
       reading up to ~1.4x attended truth. That is a mint, small but real, and the
       brief forbids it.

       The BOUNTY branch never had this problem because its v_applied is a
       SHORTFALL against a counter (the bestiary row) the settle also feeds, so the
       settle's contribution cancels. This gives the bounty-free branch the same
       cancellation, against the one row that is the settle's exact twin of the
       daily counter: src/core/goals.js goalProgressOps writes daily 'ev:kill_any'
       and lifetime stat 'ev:kill_any' from the SAME counts() in the same delta, so
       the growth of the lifetime row since our last bounty-free credit IS the
       number the settle put on the daily row in that window. Subtract it, and what
       lands is exactly the part of the player's observation the settle missed:

           daily += credit - settle_delta      (floored at 0)
           daily total = settle_delta + (credit - settle_delta) = observed

       The bounty branch does write the lifetime row, so a mixed session
       over-subtracts — bounded by one call's credit, and it under-credits, which
       is the safe direction. A first-ever bounty-free credit has no predecessor,
       so coalesce makes its delta 0 rather than its whole lifetime count.

       ⚠ CONCURRENCY, stated rather than assumed. hr_apply takes a DIFFERENT lock
       (player_state), so a settle may commit between this read and the next call.
       If it commits AFTER this read, this call under-reads the delta and
       over-credits by that settle's contribution ONCE — and the NEXT call reads the
       larger lifetime value and subtracts the same amount again, cancelling it. The
       error is bounded by one settle's kills and self-corrects rather than
       compounding, because the reference is an ABSOLUTE row value re-read every
       call, not a running total this function maintains. */
    select coalesce(max(value), 0) into v_kills_now from public.player_progress
      where user_id = v_uid and slot = v_slot
        and kind = 'stat' and key = 'ev:kill_any' and period_key = '';
    select kills_stat into v_kills_prev from public.hr_kill_credit_log
      where user_id = v_uid and slot = v_slot and free and kills_stat is not null
      order by created_at desc, idem desc limit 1;
    v_settle_delta := greatest(0, v_kills_now - coalesce(v_kills_prev, v_kills_now));
    v_applied := greatest(0, v_credit - v_settle_delta);
    v_target_val := null;
  else
    -- TOP UP the target counter to (baseline + credit); never lower it, never
    -- double-count what the settle already credited. UNCHANGED from 2026-08-30.
    v_current := public.hr_bounty_kills(v_uid, v_slot, p_target);
    v_target_val := v_ab.baseline + v_credit;
    v_applied := greatest(0, v_target_val - v_current);
  end if;

  if v_applied > 0 then
    if not v_free then
      -- ── BOUNTY BRANCH ONLY: the LIFETIME keys. These are read by
      --    hr_claim_quest (a paying quest) and hr_renown_of (a RANKED score), so
      --    they stay behind the active-bounty gate. See the header.
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || p_target, '', v_target_val, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = greatest(p.value, excluded.value), updated_at = now();
      -- The aggregate + Hero-screen counters, additive by the delta actually applied
      -- (the SAME keys the away path writes). Adding only the shortfall keeps these
      -- ~correct against a settle that already credited the away-undercount.
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'ev:kill_any', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'stat', 'kills', '', v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
    end if;

    -- ── BOTH BRANCHES: THE DAILY GOAL COUNTER (the fix). Same key contract as
    --    src/core/goals.js: kind='daily', key='ev:<type>', period = the day the
    --    player is LOOKING AT (server now()), additive, state 'active'. This one
    --    row feeds kill_any (10), kill_more (30) AND wk_kills (100) — the weekly
    --    is a SUM of daily rows over hr_goal_week_days, so there is no weekly twin
    --    to write.
    --    FAIL CLOSED on an empty day key: period_key='' is the PERMANENT
    --    population, which hr_progress_prune never sweeps. Under-credit rather
    --    than file an unsweepable row.
    if coalesce(v_day, '') <> '' then
      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
        values (v_uid, v_slot, 'daily', 'ev:kill_any', v_day, v_applied, 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = p.value + v_applied, updated_at = now();
    end if;
  end if;

  -- IDEMPOTENCY RECORD (once per key). Written on EVERY non-replay call, so it is
  -- also what advances the bounty-free anchor — a zero-credit call still closes
  -- its window, which is the safe direction.
  insert into public.hr_kill_credit_log (user_id, slot, idem, target, claimed, credit, cap, applied, free, kills_stat)
    values (v_uid, v_slot, p_idem, p_target, v_claimed, v_credit, v_cap, v_applied, v_free,
            case when v_free then v_kills_now else null end);

  -- FORGERY SIGNAL: a claim the cap (or the day ceiling) threw away. An honest
  -- player never reaches 1.3x the physical maximum. AGGREGATE, never per-kill.
  if v_credit < v_claimed then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'kill_credit_throttled:' || p_target,
        0, 0, 0, 0, 0,
        jsonb_build_object('claimed', v_claimed, 'claimed_raw', v_claimed_raw,
          'credit', v_credit, 'cap', v_cap,
          'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl, 'hp', v_hp, 'target', p_target,
          'free', v_free, 'day_used', v_used_today,
          -- Non-blocking audit signal: the server-known activity at credit time. A
          -- credit while active_kind is not 'combat' is plausible on a final
          -- post-fight flush; a RUN of them is a forgery tell.
          'active_kind', v_active_kind,
          'kind_mismatch', (v_free and v_active_kind is distinct from 'combat')));
  end if;

  v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', v_applied,
    'credit', v_credit, 'claimed', v_claimed, 'cap', v_cap,
    'throttled', v_credit < v_claimed, 'bounty', not v_free, 'day', v_day, 'slot', v_slot);
  if v_free then
    -- `settle_delta` is surfaced so a support question about "my daily moved less
    -- than I killed" is answerable from the receipt rather than from a theory.
    v_out := v_out || jsonb_build_object('day_used', v_used_today + v_applied,
                                         'day_budget', c_kill_day_budget,
                                         'settle_delta', v_settle_delta);
  else
    -- progress/required exist only when there IS a bounty to have progress
    -- against. The client keys its "server-confirmed" bar on the PRESENCE of a
    -- numeric `progress`, so the bounty-free branch must not supply one.
    v_progress := v_target_val - v_ab.baseline;
    v_out := v_out || jsonb_build_object('progress', greatest(0, v_progress),
                                         'required', v_ab.required);
  end if;
  return v_out;
end $$;

-- ── 4. Grants — revoke before grant (create-or-replace preserves an ACL, but
--      an explicit restatement is what the migration asserts in §5(a)). The
--      SIGNATURE IS UNCHANGED, so no client call form moves.
revoke execute on function public.hr_credit_kills__ungated(int,text,bigint,text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_credit_kills(int,text,bigint,text)           from public, anon, authenticated, service_role;
grant  execute on function public.hr_credit_kills(int,text,bigint,text) to authenticated;

-- ── 4b. Grant-hygiene baseline note (if present) ───────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_credit_kills' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_credit_kills', 'p_slot integer, p_target text, p_claimed bigint, p_idem text', 'authenticated',
     'added 2026-08-30, widened 2026-09-01: tops up the bounty kill counter (bounty branch) and '
     || 'stamps the DAILY ev:kill_any goal counter (both branches). A bounty-free credit writes the '
     || 'daily row ONLY — never the lifetime/renown-bearing keys. Clamped by the physical-max cap, '
     || 'a per-UTC-day ceiling from the append-only log, and idempotent per key (bounty)');
end $$;

-- ── 5. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c7-0000-0000-0000-0000000000c7';
  v_slot constant int  := 0;
  v_day  text := public.hr_utc_day_key(now());
  v_t1   text; v_hp1 int; v_t2 text;
  v_daily bigint; v_daily2 bigint; v_life bigint; v_kills bigint; v_best bigint;
  v_g0 bigint; v_g1 bigint; v_gem0 bigint; v_gem1 bigint;
  v_cur  bigint; v_n int; v_days text[];
begin
  -- (a) The client surface did not move: the wrapper stays authenticated-only,
  --     the inner verb and the cap stay revoked.
  if to_regprocedure('public.hr_credit_kills(int,text,bigint,text)') is null then
    raise exception 'GATE(a): hr_credit_kills wrapper is missing';
  end if;
  if has_function_privilege('authenticated','public.hr_credit_kills__ungated(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): hr_credit_kills__ungated is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_kills(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon','public.hr_credit_kills(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): the wrapper is anon-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_bounty_kill_cap(int,int,bigint)','execute') then
    raise exception 'GATE(a): hr_bounty_kill_cap is client-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_kill_credit_prune(interval)','execute')
     or has_function_privilege('anon','public.hr_kill_credit_prune(interval)','execute') then
    raise exception 'GATE(a): hr_kill_credit_prune is client-executable — a client could reset its own day ceiling';
  end if;

  -- (b) NO client write surface on the two tables this verb writes.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_kill_credit_log' and cmd <> 'SELECT') then
    raise exception 'GATE(b): hr_kill_credit_log grew a non-SELECT policy';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hr_kill_credit_log'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on hr_kill_credit_log';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_progress'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_progress — the daily kill count would be client-forgeable';
  end if;

  -- (c) THE CAP MATH IS UNTOUCHED (the same anchors 2026-08-30 asserted; the
  --     full matrix is bound to src/core/kill-time.js by tests/kill-time-drift.mjs).
  if public.hr_bounty_kill_cap(15, 10, 60000) <> 130 then
    raise exception 'GATE(c): cap(15,10,60000)=% expected 130', public.hr_bounty_kill_cap(15,10,60000);
  end if;
  if public.hr_bounty_kill_cap(520, 99, 60000) <> 65 then
    raise exception 'GATE(c): cap(520,99,60000)=% expected 65', public.hr_bounty_kill_cap(520,99,60000);
  end if;
  if public.hr_bounty_kill_cap(15, 99, 0) <> 0 then
    raise exception 'GATE(c): cap at elapsed 0 is not 0';
  end if;

  -- (g) THE CATALOGUE PROPERTY THAT MAKES "NO WEEKLY TWIN" CORRECT. If a real
  --     kind='weekly' ever appears, or a kill goal stops grading on the daily
  --     row, this decision must be re-opened BY NAME rather than by a bar that
  --     never moves.
  if exists (select 1 from pg_constraint
              where conrelid = 'public.player_progress'::regclass
                and conname = 'player_progress_kind_check'
                and pg_get_constraintdef(oid) like '%weekly%') then
    raise exception 'GATE(g): player_progress now admits a weekly kind — re-open the "no weekly twin" ruling';
  end if;
  if exists (select 1 from public.hr_goal_rewards
              where counter_key = 'ev:kill_any' and counter_kind <> 'daily') then
    raise exception 'GATE(g): a kill goal no longer grades on the daily counter — the stamp would be unread';
  end if;
  if not exists (select 1 from public.hr_goal_rewards
                  where counter_key = 'ev:kill_any' and weekly) then
    raise notice 'GATE(g): no WEEKLY kill goal is catalogued — the daily stamp still feeds the dailies';
  end if;

  -- (d..f) EXECUTED behaviour, discarded subtransaction (this writes
  --        player_ledger, whose retention guard refuses a fresh DELETE).
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, accrued_to)
      values (v_uid, v_slot, 0, 0, 1, now() - interval '30 minutes')
      on conflict (user_id, slot) do update set gold = 0, gems = 0,
        accrued_to = now() - interval '30 minutes';
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict do nothing;

    select monster_id, hp into v_t1, v_hp1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    select monster_id into v_t2 from public.hr_bounty_monsters where tier = 1 and monster_id <> v_t1 order by monster_id limit 1;
    if v_t2 is null then v_t2 := v_t1; end if;

    -- ── (d) THE BOUNTY BRANCH STILL WORKS, AND NOW ALSO MOVES THE DAILY ─────
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:'||v_t1, 500, '', 'active');
    v := public.hr_accept_bounty__ungated(v_slot, 'kd', v_t1, 'cull', 'normal', 100);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): accept failed: %', v; end if;
    update public.active_bounty set accepted_at = now() - interval '10 minutes'
      where user_id = v_uid and slot = v_slot;

    v := public.hr_credit_kills__ungated(v_slot, v_t1, 100, 'idem-b1');
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): bounty credit failed: %', v; end if;
    if coalesce((v->>'bounty')::boolean, false) is not true then
      raise exception 'GATE(d): a credit WITH an active bounty did not take the bounty branch: %', v;
    end if;
    if (v->>'progress')::bigint < (v->>'required')::bigint then
      raise exception 'GATE(d): bounty credit did not reach required: %', v;
    end if;
    -- the counter reached baseline+credit exactly (the reviewed top-up, unchanged)
    v_cur := public.hr_bounty_kills(v_uid, v_slot, v_t1);
    if v_cur <> 500 + least(100, public.hr_bounty_kill_cap(v_hp1, 99, 600000)) then
      raise exception 'GATE(d): bounty counter is % (the reviewed top-up changed)', v_cur;
    end if;
    -- THE FIX: the DAILY row advanced by exactly the applied delta.
    -- ⚠ `max()` and not a bare column: `select coalesce(max(value),0) into v` assigns
    --   NULL when NO ROW matches, and `NULL <> x` is NULL, so the IF below would
    --   NOT fire on the exact defect this gate exists to catch (proved by
    --   tests/kill-daily-credit.mjs --mutate=daily_never_stamped). An aggregate
    --   always returns a row. Every read in this gate follows the same rule.
    select coalesce(max(value),0) into v_daily from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any' and period_key=v_day;
    if v_daily <> (v->>'credited')::bigint then
      raise exception 'GATE(d): the DAILY ev:kill_any row is % but the credit applied % — the kill-daily gap is NOT closed',
        v_daily, v->>'credited';
    end if;
    if v_daily <= 0 then raise exception 'GATE(d): the daily row did not move at all'; end if;
    -- and the credit still grants ZERO gold (writer #1 pays nothing).
    select gold into v_g0 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g0 <> 0 then raise exception 'GATE(d): hr_credit_kills granted gold (%)', v_g0; end if;

    -- ── (e) A REPLAY DOES NOT DOUBLE-STAMP THE DAILY ────────────────────────
    v := public.hr_credit_kills__ungated(v_slot, v_t1, 100, 'idem-b1');
    if coalesce((v->>'replay')::boolean,false) is not true then
      raise exception 'GATE(e): replay not flagged: %', v;
    end if;
    select coalesce(max(value),0) into v_daily2 from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any' and period_key=v_day;
    if v_daily2 <> v_daily then
      raise exception 'GATE(e): a REPLAY re-stamped the daily row (% -> %)', v_daily, v_daily2;
    end if;

    -- ── (f) THE BOUNTY-FREE BRANCH ─────────────────────────────────────────
    -- v_t2 has NO active bounty. Before: 'no_active_bounty'. Now: a daily credit.
    select coalesce(max(value),0) into v_life from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='stat' and key='ev:kill_any' and period_key='';
    select coalesce(max(value),0) into v_kills from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='stat' and key='kills' and period_key='';
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 25, 'idem-f1');
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(f): a bounty-free credit was refused: %', v;
    end if;
    if coalesce((v->>'bounty')::boolean, true) is not false then
      raise exception 'GATE(f): a credit with NO active bounty did not take the bounty-free branch: %', v;
    end if;
    if (v->>'credited')::bigint <> 25 then
      raise exception 'GATE(f): a 25-kill bounty-free credit over a 30-minute window applied % (expected 25)', v->>'credited';
    end if;
    if v ? 'progress' or v ? 'required' then
      raise exception 'GATE(f): the bounty-free receipt carries progress/required — the client would bind a bar to a bounty that does not exist: %', v;
    end if;
    select coalesce(max(value),0) into v_daily2 from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any' and period_key=v_day;
    if v_daily2 <> v_daily + 25 then
      raise exception 'GATE(f): the bounty-free credit moved the daily row to % (expected %)', v_daily2, v_daily + 25;
    end if;
    -- CONTAINMENT: it minted NOTHING on the lifetime/renown-bearing keys.
    if (select coalesce(max(value),0) from public.player_progress
         where user_id=v_uid and slot=v_slot and kind='stat' and key='ev:kill_any' and period_key='') <> v_life then
      raise exception 'GATE(f): a bounty-free credit moved the LIFETIME ev:kill_any counter — hr_renown_of scores it and hr_claim_quest pays on it';
    end if;
    if (select coalesce(max(value),0) from public.player_progress
         where user_id=v_uid and slot=v_slot and kind='stat' and key='kills' and period_key='') <> v_kills then
      raise exception 'GATE(f): a bounty-free credit moved the lifetime kills stat';
    end if;
    if exists (select 1 from public.player_progress
                where user_id=v_uid and slot=v_slot and kind='stat' and key='ev:kill_monster:'||v_t2) then
      raise exception 'GATE(f): a bounty-free credit wrote the BESTIARY key — hr_renown_of scores boss kills at 5 renown each';
    end if;
    -- and it minted no currency.
    if (select gold from public.player_state where user_id=v_uid and slot=v_slot) <> 0
       or (select gems from public.player_state where user_id=v_uid and slot=v_slot) <> 0 then
      raise exception 'GATE(f): a bounty-free credit moved gold or gems';
    end if;

    -- ── (f2) THE ANCHOR CLOSES THE WINDOW: an immediate second call prices a
    --        ~zero window and credits ~nothing, so a forger cannot stack the same
    --        wall-clock second 60 times a minute.
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 25, 'idem-f2');
    if (v->>'credited')::bigint > 2 then
      raise exception 'GATE(f2): a second bounty-free credit in the same second applied % — the anchor does not advance', v->>'credited';
    end if;

    -- ── (f3) CONDITION 2: SETTLE-FIRST PAYS NOTHING. accrued_to = now() means
    --        the span-sim just stamped this window onto the same daily row.
    --        ⚠ The log anchor is backdated FIRST, on purpose: without it the
    --        anchor alone would already be ~now and this gate would pass whether
    --        or not the accrued_to floor exists (proved by
    --        tests/kill-daily-credit.mjs --mutate=anchor_ignores_settle). With a
    --        20-minute-old anchor, ONLY the accrued_to floor can produce a zero
    --        window.
    update public.hr_kill_credit_log set created_at = now() - interval '20 minutes'
      where user_id = v_uid and slot = v_slot;
    update public.player_state set accrued_to = now() where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 500, 'idem-f3');
    if coalesce((v->>'credited')::bigint, -1) <> 0 then
      raise exception 'GATE(f3): settle-first (accrued_to = now) still credited % kills — the daily row would be double-stamped', v->>'credited';
    end if;
    if coalesce((v->>'throttled')::boolean,false) is not true then
      raise exception 'GATE(f3): a 500-claim at ~0 elapsed was not throttled: %', v;
    end if;
    if (select count(*) from public.player_ledger
         where user_id=v_uid and intent like 'kill_credit_throttled:%') < 1 then
      raise exception 'GATE(f3): a throttled claim was not journalled';
    end if;

    -- ── (f4) THE PER-UTC-DAY CEILING BINDS, and it is the CEILING doing it —
    --        not the anchor. Every existing log row is backdated (so the anchor
    --        leaves a real window open and the cap is non-zero) and one filled row
    --        exhausts today's bounty-free budget. `cap > 0` is asserted first so a
    --        degenerate fixture fails loudly instead of passing for the wrong
    --        reason. The backdate is clamped to the UTC day start so the filled
    --        row always lands inside the day the ceiling sums.
    update public.hr_kill_credit_log
       set created_at = greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')
     where user_id = v_uid and slot = v_slot;
    insert into public.hr_kill_credit_log
      (user_id, slot, idem, target, claimed, credit, cap, applied, free, created_at)
      values (v_uid, v_slot, 'idem-fill', v_t2, 10000, 10000, 10000, 10000, true,
              greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes'));
    update public.player_state set accrued_to = now() - interval '30 minutes'
      where user_id = v_uid and slot = v_slot;
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 400, 'idem-f4');
    if coalesce((v->>'cap')::bigint, 0) <= 0 then
      raise exception 'GATE(f4): FIXTURE DEGENERATE — cap is 0, so the ceiling was not the binding control: %', v;
    end if;
    if coalesce((v->>'credited')::bigint, -1) <> 0 then
      raise exception 'GATE(f4): the per-day bounty-free ceiling did not bind (cap %, credited %)',
        v->>'cap', v->>'credited';
    end if;

    -- ── (f5) ⚠ CREDIT + SETTLE IN THE SAME WINDOW DO NOT DOUBLE-ADVANCE ─────
    --        The accrued_to floor only covers settle-THEN-credit. This is the
    --        other order, which is the common one live: the player kills 40, a
    --        credit lands, and then the ~90 s span-sim settles the SAME window and
    --        stamps its own (undercounted) kills onto the SAME daily row. Without
    --        the settle-delta subtraction the row would read 40 + sim; with it the
    --        row reads exactly the 40 the player was observed to make.
    --        A clean fixture: no ceiling pressure, no bounty, a fresh anchor.
    delete from public.hr_kill_credit_log where user_id = v_uid and slot = v_slot;
    delete from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any';
    delete from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='stat' and key='ev:kill_any';
    update public.player_state set accrued_to = now() - interval '10 minutes'
      where user_id = v_uid and slot = v_slot;
    -- credit 40 observed kills → the row is 40 and the delta baseline is recorded.
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 40, 'idem-f5a');
    if coalesce((v->>'credited')::bigint, -1) <> 40 then
      raise exception 'GATE(f5): the first bounty-free credit applied % (expected 40)', v->>'credited';
    end if;
    -- NOW THE SETTLE LANDS ON THE SAME WINDOW. hr_apply writes daily 'ev:kill_any'
    -- and lifetime stat 'ev:kill_any' from ONE counter, so both move by its
    -- (undercounted) 12 — this is exactly what goalProgressOps emits.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:kill_any', 12, v_day, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + 12;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_any', 12, '', 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + 12;
    update public.hr_kill_credit_log set created_at = now() - interval '5 minutes'
      where user_id = v_uid and slot = v_slot;
    -- the player kept fighting: 15 MORE observed kills, of which the settle
    -- already accounted for 12. Only 3 may land.
    v := public.hr_credit_kills__ungated(v_slot, v_t2, 15, 'idem-f5b');
    if coalesce((v->>'settle_delta')::bigint, -1) <> 12 then
      raise exception 'GATE(f5): the settle delta read % (expected 12) — the anti-double-count is blind', v->>'settle_delta';
    end if;
    if coalesce((v->>'credited')::bigint, -1) <> 3 then
      raise exception 'GATE(f5): the credit applied % on top of a settle that already covered 12 of the '
                      '15 observed — credit+settle DOUBLE-ADVANCE the daily row', v->>'credited';
    end if;
    select coalesce(max(value),0) into v_daily2 from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any' and period_key=v_day;
    if v_daily2 <> 55 then
      raise exception 'GATE(f5): the daily row is % after 55 observed kills and a 12-kill settle '
                      '(expected exactly 55 — never 67)', v_daily2;
    end if;

    -- ── (h) THE WHOLE POINT: the DAILY row the credit stamped makes the real
    --        hr_claim_goal claimable, and the WEEKLY goal reads the SAME daily
    --        rows (no weekly twin exists or is needed).
    delete from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:kill_any';
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:kill_any', 30, v_day, 'active');
    select gold, gems into v_g0, v_gem0 from public.player_state where user_id=v_uid and slot=v_slot;
    v := public.hr_claim_goal__ungated('kill_more', false, v_slot, null);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): kill_more is not claimable off the daily row this file stamps: %', v;
    end if;
    select gold, gems into v_g1, v_gem1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g1 <= v_g0 then raise exception 'GATE(h): the goal claim paid no gold'; end if;
    -- weekly: spread the week's daily rows; wk_kills must sum them.
    v_days := public.hr_goal_week_days(now());
    for v_n in 0..6 loop
      insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
        values (v_uid, v_slot, 'daily', 'ev:kill_any', 20, v_days[v_n+1], 'active')
        on conflict (user_id, slot, kind, key, period_key)
          do update set value = public.player_progress.value + 20;
    end loop;
    v := public.hr_claim_goal__ungated('wk_kills', true, v_slot, null);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): wk_kills is not claimable by SUMMING the daily rows — a weekly twin would be needed after all: %', v;
    end if;

    raise exception using errcode = 'HR821', message = 'kill-daily-credit §5 complete — rolling back';
  exception when sqlstate 'HR821' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_ledger      where user_id = v_uid)
     or exists (select 1 from public.player_progress    where user_id = v_uid)
     or exists (select 1 from public.player_skills      where user_id = v_uid)
     or exists (select 1 from public.active_bounty      where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from public.player_intents     where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'kill-daily-credit: hr_credit_kills stamps the DAILY ev:kill_any counter on both '
               'branches, the bounty-free branch writes that row and nothing else, the anchor + '
               'per-day ceiling bind, a replay does not double-stamp, and hr_claim_goal grades '
               'kill_more/wk_kills off it — all green';
end $$;
