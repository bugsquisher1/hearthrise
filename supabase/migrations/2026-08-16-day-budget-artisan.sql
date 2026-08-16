-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DAILY BUDGET, RE-SIZED FOR ARTISAN ACCRUAL
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Raises TWO of the four day ceilings and NOTHING else:
--       c_day_qty_budget   1,000,000 -> 70,000,000
--       c_day_xp_budget   40,000,000 -> 120,000,000
--
--   Companion tests: tests/accrual-engine.mjs (dayBudgetGuard, which parses
--   these declarations), tests/artisan-accrual.mjs
--   Authority: Security ruling 2026-08-16, "artisan flip re-review".
--
-- ── WHY, IN ONE PARAGRAPH ───────────────────────────────────────────────
-- b356 taught the accrual engine to pay `artisan` — 290 of the 344
-- `hr_activities` rows, 84% of the catalogue, all of which paid NOTHING
-- before. The daily budget was sized in 2026-08-11-daily-budget.sql against
-- combat alone, and its own header says so in as many words: the ~5x headroom
-- on top of the measured maximum was set "for the gathering, artisan and farm
-- accrual slices that do not exist yet". One of those three now exists, and it
-- is not a marginal addition — an artisan bench produces on every tick, and the
-- ammunition lane produces 500 to 1,000 units per tick.
--
-- ⚠ THIS FILE IS THE ESCALATION RULE BEING FOLLOWED, NOT AN EXCEPTION TO IT.
--   2026-08-11-daily-budget.sql states the rule it is invoking:
--
--     "IF THEY EVER CONFLICT, THE PER-ABSENCE CAP WINS AND THIS FILE IS
--      RAISED. If a balance change ever makes honest play approach these
--      numbers, the correct response is to raise the budget, not to let it
--      clip a player."
--
--   The daily budget is an ABUSE CEILING — it REJECTS, it never reduces a
--   grant — so a ceiling honest play can reach is not a pacing control that is
--   slightly too tight, it is a fuse that fires on a player who did nothing
--   wrong and costs them a night. The per-absence offline cap (b307) is the
--   pacing control and it wins.
--
-- ── THE MEASUREMENT ─────────────────────────────────────────────────────
-- Executed, not estimated: the real engine
-- (supabase/functions/hr-accrue/accrual.js) over EVERY payable recipe in
-- src/data/recipes.js, maxed benches, every recipe scroll unlocked, supply
-- sufficient that the CLOCK is the only bound. Two windows per UTC day, which
-- is the same doubling 2026-08-11-daily-budget.sql applies (a capped absence
-- collected just after midnight, plus a full day).
--
--   at the REACHABLE cap (15h — see below), per character-day:
--     qty    24,544,000 -> was 2,454% of a 1,000,000 ceiling
--     xp     35,100,000 -> was    87.8% of a 40,000,000 ceiling
--
--   worst single recipe, by dimension:
--     qty    fletch_dawnpoint_arrows    outputQty 1,000 per 4.4s craft
--     xp     forge_slagheart_platebody  6,000 xp per 7.2s craft
--
-- The new values keep the ~2.8x fuse ratio the original four were set at
-- (70,000,000 / 24,544,000 = 2.85; 120,000,000 / 35,100,000 = 3.42), which is
-- the property that matters: a fuse is a blast radius, and its job is to be far
-- enough above honest play that firing means something is wrong.
--
-- ── WHAT THIS FILE DELIBERATELY DOES **NOT** RAISE ──────────────────────
-- Security's ruling holds BOTH per-call clamps at their current values, and
-- §3 below asserts they have not moved:
--
--   c_max_item_delta  HOLD at 1,000,000.
--       A per-call ceiling and a per-day ceiling answer different questions.
--       The day budget bounds a compromised engine over 24 hours; the per-call
--       clamp bounds ONE apply, and index.ts's degrade ladder makes a trip
--       recoverable (it halves the proposal and retries). The consequence is
--       stated rather than hidden: the ammunition lane trips it and is paid
--       through the ladder at 1/8 of a night. That is a YIELD problem
--       (outputQty 500-1,000 on eight recipes) and it belongs to the Game
--       Designer; raising the clamp to cover it would raise the blast radius of
--       every compromised apply in the game by 12x to accommodate eight rows.
--
--   c_max_xp_delta    HOLD at 12,000,000. IT CANNOT RISE.
--       xpForLevel(99) = 13,034,431, and the only property the per-call XP
--       clamp still buys is that ONE apply cannot carry a skill from 0 to the
--       cap. tests/accrual-engine.mjs asserts `c_max_xp_delta < 13034431`
--       directly. It is also PINNED BY LITERAL in
--       2026-08-15-gem-daily-budget.sql:175, whose §0 refuses to install
--       against an hr_apply that does not carry
--       `c_max_xp_delta constant bigint := 12000000` — so moving it silently
--       breaks the migration chain as well as the property.
--
-- ⚠ THE CAP THAT MAKES THIS ARITHMETIC TRUE, AND WHAT HAPPENS IF IT MOVES.
--   The measurement above is at the REACHABLE offline cap, not at the fuse
--   ceiling. `hr_offline_cap_ms` is 12h base, +1h at clan level 4, +2h more at
--   clan level 7 — a hard maximum of **15h** — against its own unreachable
--   `c_ceiling_ms` of 24h. At 24h the same sweep reaches 17,550,000 XP in ONE
--   apply on forge_slagheart_platebody, which is 146% of c_max_xp_delta.
--
--   SO: RAISING THE OFFLINE CAP ABOVE ~17 HOURS REQUIRES RE-MEASURING
--   forge_slagheart_platebody AGAINST c_max_xp_delta FIRST, AND THE RESOLUTION
--   MUST BE A YIELD CHANGE, BECAUSE THE CLAMP CANNOT MOVE (see above). This is
--   not a warning about a distant possibility: the cap is a number somebody
--   will raise, the clan ladder already moves it, and the failure mode is a
--   maxed smith losing half of every night to the degrade ladder with no error
--   anyone reads. tests/accrual-engine.mjs keeps the 24h figure on a
--   non-blocking FORECAST line for exactly this reason — so the day it becomes
--   reachable, the number is already on the screen.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────
-- `hr_day_budget_limits()` is restated WHOLE, because it is a single
-- `create or replace` of a function whose entire body is four constants and a
-- `jsonb_build_object`. There is nothing to patch surgically and no generator
-- owns it. The two untouched dimensions are restated verbatim, with their
-- original justifications, so a reader of THIS file sees all four ceilings
-- rather than two here and two somewhere else.
--
-- ⚠ THE `c_day_*_budget constant bigint := N` SPELLING IS LOAD-BEARING.
--   tests/accrual-engine.mjs' dayBudgetsFromMigration() parses these
--   declarations out of the migration chain so the headroom guard reads the
--   REAL number instead of a second copy of it. Reformatting the declaration
--   blinds the guard.
--
-- REVERSIBILITY
--   Re-apply 2026-08-15-gem-daily-budget.sql, whose §2 restates this function
--   with the previous values. Nothing else in this file writes anything: no
--   table, no row, no grant that did not already exist. A rollback costs
--   nothing and loses nothing — the ledger columns the budget sums over are
--   untouched, so yesterday's usage is still yesterday's usage.
--
-- APPLY ORDER: … → 2026-08-15-gem-daily-budget.sql → THIS FILE.
--   It FAILS CLOSED without it (§0).
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS + REFUSE-TO-INSTALL — FAIL CLOSED ───────────────────
-- This file replaces a body it did not author. The only honest way to do that
-- is to refuse unless the body about to be destroyed is the one it was derived
-- from — otherwise a re-apply out of order silently deletes whatever a later
-- migration added, and every self-check in both files still reads green.
do $$
declare
  v_src  text;
  v_len  int;
  v_lim  jsonb;
begin
  if to_regprocedure('public.hr_day_budget_limits()') is null then
    raise exception 'hr_day_budget_limits is missing — apply 2026-08-11-daily-budget.sql first';
  end if;
  if to_regprocedure('public.hr_day_budget_check(uuid,int,bigint,bigint,bigint,bigint)') is null then
    raise exception 'the 6-argument hr_day_budget_check is missing — apply '
                    '2026-08-15-gem-daily-budget.sql first. This file re-sizes ceilings that only '
                    'the gem-aware checker reads in full.';
  end if;

  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_day_budget_limits';

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT. A prosrc scan fails in BOTH directions:
  --   it can stop matching (every "present?" test then raises on a healthy
  --   database — loud but wrong), or it can match everything (every test then
  --   passes on a body with none of these properties — quiet and fatal).
  if v_src !~ 'c_day_gold_budget' then
    raise exception 'THE hr_day_budget_limits SOURCE SCAN IS BLIND (positive control): '
                    '"c_day_gold_budget" is absent from a % char body, so every check below would '
                    'raise on a database that is perfectly healthy. Do not "fix" this by deleting '
                    'the check.', coalesce(v_len, 0);
  end if;
  if v_src ~ 'hr356_negative_control_this_string_is_in_no_limits_body' then
    raise exception 'THE SOURCE SCAN CANNOT SEE FAILURE (negative control): a sentinel that appears '
                    'in no hr_day_budget_limits body MATCHED, so the scan is matching everything.';
  end if;

  -- The body this file was derived from is b351's — the four-dimension one.
  if v_src !~ 'c_day_gems_budget' then
    raise exception 'REFUSING TO REPLACE hr_day_budget_limits: the live body has no '
                    '"c_day_gems_budget", so it is the THREE-dimension body from '
                    '2026-08-11-daily-budget.sql. Replacing it from here would silently delete the '
                    'gem ceiling b351 added and hr_day_budget_check would then read NULL for it. '
                    'Apply 2026-08-15-gem-daily-budget.sql first.';
  end if;

  -- And the values it is derived from are the ones being raised. If they are
  -- already the new ones this is a re-apply and everything below is a no-op;
  -- if they are neither, somebody has edited them by hand and this file's
  -- measurement no longer describes what it is replacing.
  v_lim := public.hr_day_budget_limits();
  if (v_lim->>'qty')::bigint not in (1000000, 70000000)
     or (v_lim->>'xp')::bigint not in (40000000, 120000000) then
    raise exception 'REFUSING TO REPLACE hr_day_budget_limits: the live ceilings are qty=% xp=%, '
                    'which are neither the values this file was measured against (1000000 / '
                    '40000000) nor the values it installs (70000000 / 120000000). Somebody has '
                    'changed them out of band — reconcile before re-sizing.',
                    v_lim->>'qty', v_lim->>'xp';
  end if;

  -- THE HOLD, asserted BEFORE the change rather than only after it: this file
  -- must not be applied against an hr_apply whose per-call clamps have already
  -- drifted, because the whole argument for raising the DAY ceilings is that
  -- the PER-CALL ones are staying put.
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  if v_src !~ 'c_max_xp_delta\s+constant bigint\s*:=\s*12000000' then
    raise exception 'REFUSING TO INSTALL: hr_apply does not carry c_max_xp_delta = 12000000. That '
                    'clamp CANNOT rise — xpForLevel(99) is 13034431 and the only property it still '
                    'buys is that one apply cannot carry a skill from 0 to the cap — and '
                    '2026-08-15-gem-daily-budget.sql pins the literal. Raising the day ceiling '
                    'while the per-call clamp has moved is not the change this file was reviewed as.';
  end if;
  if v_src !~ 'c_max_item_delta\s+constant bigint\s*:=\s*1000000' then
    raise exception 'REFUSING TO INSTALL: hr_apply does not carry c_max_item_delta = 1000000. '
                    'Security ruling 2026-08-16 HOLDS this clamp; the ammunition lane trips it and '
                    'is paid through the degrade ladder on purpose, pending a YIELD ruling.';
  end if;

  raise notice 'b356 §0 PASSED: the limits body is b351''s four-dimension one, the live ceilings are '
               'the ones this file was measured against, and both per-call clamps are unmoved.';
end $$;

-- ── 1. THE LIMITS ────────────────────────────────────────────────────────
-- RESTATED WHOLE from 2026-08-15-gem-daily-budget.sql §2, with `qty` and `xp`
-- raised. The two untouched dimensions keep their original justifications
-- verbatim, so this file states all four ceilings rather than half of them.
create or replace function public.hr_day_budget_limits()
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  -- 23.8x the measured honest maximum for a character-day. UNCHANGED: no
  -- artisan bench pays gold, so the artisan slice moves this dimension by zero.
  c_day_gold_budget constant bigint := 25000000;
  -- b356: 40,000,000 -> 120,000,000. The measured honest maximum was 87.8% of
  -- the old ceiling the moment artisan became payable (35,100,000/day at the
  -- reachable 15h cap, forge_slagheart_platebody), i.e. a fuse one balance
  -- patch away from firing on a player who did nothing wrong. 3.42x the
  -- measurement, which restores the fuse ratio the other three were set at.
  c_day_xp_budget   constant bigint := 120000000;
  -- b356: 1,000,000 -> 70,000,000. Units, summed across item ids — the
  -- tradeable surface, so this is the one that bounds a market faucet. The
  -- original number was sized against combat drops and gathering yields, where
  -- a whole day is five figures; an artisan bench produces on EVERY tick and
  -- the ammunition lane produces 500-1,000 units per tick, which is 24,544,000
  -- units/day of entirely honest play. 2.85x the measurement.
  -- ⚠ AT 70M THIS IS A RUNAWAY DETECTOR RATHER THAN A TIGHT FUSE, and that is
  --   accepted rather than overlooked: bounding a market faucet by UNIT COUNT
  --   stopped being meaningful once one tick can mint a thousand units of a
  --   1-gold item. Re-denominating this dimension in CATALOGUE VALUE (units x
  --   ITEMS[id].v) is the queued follow-up; until it lands, the gold ceiling
  --   above and the market's own per-day transfer fuses are what bound value
  --   crossing between players, and this bounds volume.
  c_day_qty_budget  constant bigint := 70000000;
  -- b351. 6.4x the measured honest maximum (780/character-day, all of it through
  -- claim_reward). Tighter than the other three because the gem faucet is a
  -- bounded set of DISCRETE claims rather than a continuous function of elapsed
  -- time — doubling every gem reward in the game still lands at a third of this.
  -- UNCHANGED: no artisan bench pays gems.
  c_day_gems_budget constant bigint := 5000;
begin
  return jsonb_build_object(
    'gold', c_day_gold_budget, 'xp', c_day_xp_budget, 'qty', c_day_qty_budget,
    'gems', c_day_gems_budget);
end $$;

-- ── 2. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- `create or replace` PRESERVES an existing ACL, so a wrong one would survive a
-- re-apply; these are restated unconditionally for that reason.
--
-- NOBODY may call this, including hr_engine. 2026-08-11-daily-budget.sql §6
-- states why and it is unchanged here: if the ENGINE could read its own
-- ceiling it could pace itself right up to it. hr_apply is SECURITY DEFINER and
-- owned by postgres, so it needs no grant to call this.
revoke execute on function public.hr_day_budget_limits() from public;
revoke execute on function public.hr_day_budget_limits()
  from anon, authenticated, service_role, hr_engine;

-- ── 3. SELF-VERIFICATION — every claim EXECUTED ──────────────────────────
-- "The constant was edited" is a diff. "The function returns the new number,
-- the two untouched dimensions still return the old ones, the per-call clamps
-- did not move, and nobody can call it" are the claims the release depends on.
do $$
declare
  v_lim  jsonb;
  v_p    oid;
  v_bad  text;
  v_src  text;
begin
  v_lim := public.hr_day_budget_limits();

  -- (a) THE RAISES ARE LIVE.
  if (v_lim->>'qty')::bigint <> 70000000 then
    raise exception '§3(a): c_day_qty_budget reads % — expected 70000000. The artisan slice measured '
                    '24,544,000 units/character-day of honest play; at the old 1,000,000 the fuse '
                    'fires on the 25th minute of an ordinary fletching night.', v_lim->>'qty';
  end if;
  if (v_lim->>'xp')::bigint <> 120000000 then
    raise exception '§3(a): c_day_xp_budget reads % — expected 120000000.', v_lim->>'xp';
  end if;

  -- (b) …AND NOTHING ELSE MOVED. A restatement that silently changed a
  --     dimension it was not reviewed to touch is the exact failure §0's
  --     refuse-to-install exists to prevent, caught from the other side.
  if (v_lim->>'gold')::bigint <> 25000000 then
    raise exception '§3(b): c_day_gold_budget reads % — expected an UNCHANGED 25000000. No artisan '
                    'bench pays gold; this file had no reason to touch it.', v_lim->>'gold';
  end if;
  if (v_lim->>'gems')::bigint <> 5000 then
    raise exception '§3(b): c_day_gems_budget reads % — expected an UNCHANGED 5000. Dropping it '
                    'would make hr_day_budget_check read NULL for the gem dimension, which is a '
                    'ceiling that silently stops existing.', v_lim->>'gems';
  end if;
  if (select count(*) from jsonb_object_keys(v_lim)) <> 4 then
    raise exception '§3(b): the limits envelope has % keys, expected 4 (gold, xp, qty, gems). A '
                    'dimension that stops being returned is a fuse that stops firing.',
                    (select count(*) from jsonb_object_keys(v_lim));
  end if;

  -- (c) THE HOLD, RE-ASSERTED AFTER THE CHANGE. §0 refused to install against a
  --     moved clamp; this proves this file did not move one itself.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  if v_src !~ 'c_max_xp_delta\s+constant bigint\s*:=\s*12000000'
     or v_src !~ 'c_max_item_delta\s+constant bigint\s*:=\s*1000000' then
    raise exception '§3(c): a per-call clamp moved. Security ruling 2026-08-16 HOLDS both: '
                    'c_max_xp_delta cannot rise (xpForLevel(99) = 13034431) and c_max_item_delta '
                    'is held pending a yield ruling on the ammunition lane.';
  end if;

  -- (d) THE ORDERING PROPERTY. The per-call XP clamp must stay STRICTLY BELOW
  --     the day ceiling with room for at least two of them, or the day ceiling
  --     pre-empts the per-call clamp and c_max_xp_delta becomes a control that
  --     can never fire. tests/accrual-engine.mjs asserts the same relation from
  --     the source; this asserts it from the LIVE values, which is the pair
  --     that actually runs.
  if (v_lim->>'xp')::bigint < 2 * 12000000 then
    raise exception '§3(d): c_day_xp_budget (%) leaves room for fewer than two per-call XP clamps '
                    '(12000000). The day ceiling would fire first and the per-call clamp could '
                    'never fire at all.', v_lim->>'xp';
  end if;

  -- (e) STILL CALLABLE BY NOBODY. A readable ceiling is a pace-able ceiling.
  v_p := to_regprocedure('public.hr_day_budget_limits()');
  if v_p is null then raise exception '§3(e): hr_day_budget_limits vanished after §1'; end if;
  foreach v_bad in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception '§3(e): hr_day_budget_limits is EXECUTABLE BY % — the proposer of a delta '
                      'could then read its own ceiling and pace itself right up to it', v_bad;
    end if;
  end loop;
  if (select provolatile from pg_proc where oid = v_p) <> 'i' then
    raise exception '§3(e): hr_day_budget_limits stopped being IMMUTABLE';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception '§3(e): hr_day_budget_limits has no pinned search_path';
  end if;

  raise notice 'DAY BUDGET RE-SIZED FOR ARTISAN: qty 1,000,000 -> 70,000,000 and xp 40,000,000 -> '
               '120,000,000; gold and gems unchanged; both per-call clamps unmoved; still callable '
               'by nobody. The ammunition lane still trips c_max_item_delta and is paid through the '
               'degrade ladder — that is a YIELD ruling, not a clamp one.';
end $$;
