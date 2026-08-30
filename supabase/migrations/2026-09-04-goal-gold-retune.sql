-- 2026-09-04-goal-gold-retune.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The Coordinator applies this by hand (Management API / execute_sql wrapped in
-- begin/commit). It moves MONEY-ADJACENT catalogue numbers and must pass
-- Security review before it goes to production.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES
-- ══════════════════════════════════════════════════════════════════════════
-- The Game Designer's balance audit measured a 13:1 spread in gold-per-effort-
-- minute across the daily/weekly goal pools, with FIGHTERS at the bottom of it:
-- "Kill 60 monsters" is the longest task in the game and paid 900 g, while
-- "Craft 8 items" — eight UNATTENDED bench pulls, ~8 seconds of the player's
-- actual attention — paid 450. Gathering goals were the same shape: "Gather 25
-- logs" is ~60 seconds of elapsed time and paid 250 g.
--
-- THE RULING (Game Designer, 2026-09-04 — final, not re-litigated here):
--
--   DAILY TASKS (hr_claim_daily__ungated's embedded CASE catalogue)
--     daily_kill       25 kills  ->  gold  500 -> 600
--     daily_kill_big   60 kills  ->  gold  900 -> 1400
--     daily_smith      goal 8 -> 40 items,  gold 450 -> 500
--     daily_craft      goal 8 -> 40 items,  gold 450 -> 500
--
--   ONBOARDING QUEST (hr_claim_quest__ungated's CASE catalogue)
--     farmhand         goal 10 -> 6 harvests   (gold 500 held)
--
--   MODAL GOAL BOARD (the public.hr_goal_rewards table)
--     gather_logs      target 25 -> 60,  gold 250 -> 300
--     mine_ore         target 25 -> 60,  gold 250 -> 300
--     fish             target 15 -> 50,  gold 250 -> 300
--     cook             target  5 -> 25,  gold 200 -> 250
--     plant            target  5 ->  3,  gold 200 -> 150
--
-- XP, GEMS AND ITEMS ARE UNTOUCHED on every row. `plant` and `farmhand` are the
-- two that go DOWN, and for the same reason b495 lowered the harvest daily's
-- floor: the starting Wanderer's Camp has TWO plots
-- (src/features/homestead.js TIERS[0].plots), so a five-plant / ten-harvest goal
-- could not be finished in one pass at the property every new player owns.
--
-- ── WHY THIS IS THREE SURFACES AND NOT ONE ────────────────────────────────
-- The three goal systems store their catalogues in three different PLACES, and
-- the difference decides the shape of the fix:
--   · the MODAL board  → rows in public.hr_goal_rewards        → UPDATE (§1)
--   · the DAILY tasks  → a CASE inside hr_claim_daily__ungated → body patch (§2)
--   · the QUESTS       → a CASE inside hr_claim_quest__ungated → body patch (§3)
-- A `create or replace` restating either body verbatim would be a transcription
-- of ~90 lines this file did not author, and the b484-b487 wave is the receipt
-- for what that costs (a restated body silently dropped another migration's
-- change). So §2/§3 use the PROGRAMMATIC PATCH idiom already established here
-- (2026-08-23-modal-goal-claims.sql §4, 2026-08-28-client-state.sql):
-- pg_get_functiondef + an anchored regexp_replace that REFUSES to patch blind.
--
-- ── WHY NOT JUST RE-APPLY THE AUTHORING FILES ─────────────────────────────
-- Same reason 2026-09-01-kill-goal-xp-hitpoints.sql exists.
-- 2026-08-23-modal-goal-claims.sql OWNS its table (`delete from
-- hr_goal_rewards` then a wholesale refill) and carries a KNOWN, OPEN repo⟷prod
-- divergence: its gold_500 row still names the phantom item `small_bones` while
-- PRODUCTION was hand-patched in b464 to the real `bones` id plus a gem.
-- **NEVER RE-APPLY THAT FILE TO PRODUCTION** — it would revert the live fix and
-- put "Earn 500 gold" back to reward_unavailable. (Declared by name in
-- tests/modal-goal-claim.mjs KNOWN_PAYOUT_DRIFT, with its owner and its closing
-- conditions.) This file touches five rows by id and leaves gold_500 alone.
--
-- ── FAIL CLOSED, AND IDEMPOTENT ───────────────────────────────────────────
-- Every section accepts EXACTLY TWO shapes — the known-live one and the ruled
-- one — and RAISES on anything else, so a row or an arm a third party has since
-- re-authored stops this file rather than being overwritten. Both shapes are
-- accepted because a REPO REBUILD applies the corrected authoring files first,
-- and a file that could only run once would break the replay chain
-- (tests/schema-apply-order.json → "order"). §4 reads everything back and
-- raises unless it is all exactly right, so a silent no-op is impossible.
--
-- ── SECURITY: THE REVIEWED FORGERY BOUND MOVES, AND BY HOW MUCH ───────────
-- 2026-09-01-kill-daily-credit.sql §C4 states the bound on what a FORGED kill
-- counter can reach. Every claim consumes a once-per-period guard row and every
-- AMOUNT is read from a catalogue no client role may write, so a forged counter
-- is a GATE and never a MULTIPLIER — ten thousand fabricated kills pay exactly
-- what thirty honest ones pay. This file re-prices two of the four terms:
--     per CHARACTER-UTC-day, kill-graded:  2,200 g -> 2,800 g
--         (kill_any 200 + kill_more 600 unchanged;
--          daily_kill 500->600 and daily_kill_big 900->1400)
--     per ISO week (wk_kills 2,500 g + 3 gems)   unchanged
--     the XP term (400 hitpoints/day, 1,000/week) unchanged — no XP moves here
--     x6 slots  ->  ACCOUNT-day ceiling 13,200 g -> 16,800 g
-- Against the 25,000,000 g/day server-wide gross-inflow budget
-- (hr_day_budget_check) and the measured honest ~1.05M g/character-day from the
-- live accrual path, +600 g/character-day is 0.06% of one character's honest
-- income. The control is unchanged (the once-guard + a server-owned amount);
-- only the amount moved. Guard K10(2) in tests/kill-daily-credit.mjs pins the
-- new numbers BY VALUE and fails by name on any further re-tune.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_goal_rewards') is null then
    raise exception 'hr_goal_rewards missing — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regprocedure('public.hr_claim_daily__ungated(text,integer)') is null then
    raise exception 'hr_claim_daily__ungated missing — apply 2026-08-20-goal-reward-rpc-credit.sql '
                    '(and 2026-08-29-daily-task-eligibility.sql) first';
  end if;
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null then
    raise exception 'hr_claim_quest__ungated missing — apply 2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
end $$;

-- ── 1. THE MODAL BOARD — five rows of hr_goal_rewards ──────────────────────
-- Written from ONE values list so the ruled numbers appear exactly once and
-- cannot drift between the assert, the write and the verify.
do $$
declare
  r record;
  v_have record;
  v_seen int := 0;
begin
  for r in
    select * from (values
      --  id             old_t  old_g  new_t  new_g
      ('gather_logs',       25,   250,    60,   300),
      ('mine_ore',          25,   250,    60,   300),
      ('fish',              15,   250,    50,   300),
      ('cook',               5,   200,    25,   250),
      ('plant',              5,   200,     3,   150)
    ) as t(goal_id, old_t, old_g, new_t, new_g)
  loop
    select target, gold, gems, xp, items into v_have
      from public.hr_goal_rewards g where g.goal_id = r.goal_id;
    if not found then
      raise exception 'row % is MISSING from hr_goal_rewards — the catalogue is not the one this '
                      'file was written against; stopping rather than inserting a payout', r.goal_id;
    end if;
    if not ((v_have.target = r.old_t and v_have.gold = r.old_g)
         or (v_have.target = r.new_t and v_have.gold = r.new_g)) then
      raise exception 'row % carries target=% gold=% — neither the known-live (%/%) nor the ruled '
                      '(%/%) pair. Production has DRIFTED from what this fix was authored against, '
                      'so overwriting it would destroy someone else''s change. Re-read the row and '
                      're-author this file.',
        r.goal_id, v_have.target, v_have.gold, r.old_t, r.old_g, r.new_t, r.new_g;
    end if;
    update public.hr_goal_rewards g
       set target = r.new_t, gold = r.new_g
     where g.goal_id = r.goal_id
       and (g.target, g.gold) is distinct from (r.new_t::bigint, r.new_g::bigint);
    v_seen := v_seen + 1;
  end loop;
  if v_seen <> 5 then
    raise exception 'the catalogue loop graded % rows, expected 5 — it is checking nothing', v_seen;
  end if;
end $$;

-- ── 2. THE DAILY TASKS — hr_claim_daily__ungated's CASE catalogue ──────────
-- PROGRAMMATIC, ANCHORED, IDEMPOTENT. The whitespace class is `[[:space:]]+`
-- and NOT `\s+` on purpose: measured on 2026-08-29, PGlite and production
-- disagree on backslash classes under standard_conforming_strings (the same
-- expression normalised whitespace on prod and ate every letter `s` under
-- PGlite), and a gate that fires differently in the harness than on production
-- is worse than none. The replacement collapses the CASE arm's cosmetic column
-- alignment; only the numbers are load-bearing.
do $$
declare
  v_src   text;
  v_new   text;
  r       record;
  v_hit   int := 0;
  v_done  int := 0;
begin
  select pg_get_functiondef('public.hr_claim_daily__ungated(text,integer)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');     -- CR-tolerant, like §4 of modal-goal-claims
  v_new := v_src;

  for r in
    select * from (values
      ('daily_kill',
       'when ''daily_kill''[[:space:]]+then v_type := ''kill_any''; v_goal := 25;[[:space:]]+v_gold := 500;',
       'when ''daily_kill'' then v_type := ''kill_any''; v_goal := 25; v_gold := 600;',
       'when ''daily_kill'' then v_type := ''kill_any''; v_goal := 25; v_gold := 600;'),
      ('daily_kill_big',
       'when ''daily_kill_big''[[:space:]]+then v_type := ''kill_any''; v_goal := 60;[[:space:]]+v_gold := 900;',
       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 1400;',
       'when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 1400;'),
      ('daily_smith',
       'when ''daily_smith''[[:space:]]+then v_type := ''smithed'';[[:space:]]+v_goal := 8;[[:space:]]+v_gold := 450;',
       'when ''daily_smith'' then v_type := ''smithed''; v_goal := 40; v_gold := 500;',
       'when ''daily_smith'' then v_type := ''smithed''; v_goal := 40; v_gold := 500;'),
      ('daily_craft',
       'when ''daily_craft''[[:space:]]+then v_type := ''crafted'';[[:space:]]+v_goal := 8;[[:space:]]+v_gold := 450;',
       'when ''daily_craft'' then v_type := ''crafted''; v_goal := 40; v_gold := 500;',
       'when ''daily_craft'' then v_type := ''crafted''; v_goal := 40; v_gold := 500;')
    ) as t(task, old_re, new_txt, ruled_probe)
  loop
    if position(r.ruled_probe in regexp_replace(v_new, '[[:space:]]+', ' ', 'g')) > 0 then
      v_done := v_done + 1;                 -- already ruled (a REBUILD) — nothing to do
    elsif v_new ~ r.old_re then
      v_new := regexp_replace(v_new, r.old_re, r.new_txt);
      v_hit := v_hit + 1;
    else
      raise exception 'hr_claim_daily__ungated arm for % matches NEITHER the known-live catalogue '
                      'nor the ruled one. The installed body is not what this file was authored '
                      'against — refusing to patch blind. Pull it with pg_get_functiondef and '
                      're-author this file.', r.task;
    end if;
  end loop;

  if v_hit + v_done <> 4 then
    raise exception 'the daily-task patch graded % arms, expected 4 — it is checking nothing',
      v_hit + v_done;
  end if;
  if v_hit > 0 then
    execute v_new;
    raise notice 'b497: hr_claim_daily__ungated re-priced (% arm(s) moved, % already ruled)',
      v_hit, v_done;
  else
    raise notice 'b497: hr_claim_daily__ungated already carries the ruled catalogue — patch skipped';
  end if;
end $$;

-- REVOKE BEFORE GRANT. `create or replace` PRESERVES an ACL, so the inner's
-- lockout is restated rather than assumed. The rate-gated wrapper
-- hr_claim_daily(text,int) is UNTOUCHED and keeps its authenticated grant.
revoke execute on function public.hr_claim_daily__ungated(text, int)
  from public, anon, authenticated, service_role;

-- ── 3. THE ONBOARDING QUEST — hr_claim_quest__ungated's farmhand arm ───────
do $$
declare
  v_src text;
  v_new text;
  c_old constant text :=
    'when ''farmhand''[[:space:]]+then v_key := ''ev:harvest'';[[:space:]]+v_goal := 10;[[:space:]]+v_gold := 500;';
  c_new constant text :=
    'when ''farmhand'' then v_key := ''ev:harvest''; v_goal := 6; v_gold := 500;';
begin
  select pg_get_functiondef('public.hr_claim_quest__ungated(text,integer)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');
  if position(c_new in regexp_replace(v_src, '[[:space:]]+', ' ', 'g')) > 0 then
    raise notice 'b497: hr_claim_quest__ungated already carries farmhand goal 6 — patch skipped';
  elsif v_src ~ c_old then
    v_new := regexp_replace(v_src, c_old, c_new);
    execute v_new;
    raise notice 'b497: hr_claim_quest__ungated farmhand goal 10 -> 6';
  else
    raise exception 'hr_claim_quest__ungated''s farmhand arm matches NEITHER the known-live goal '
                    '(10) nor the ruled one (6) — refusing to patch blind. Pull the body with '
                    'pg_get_functiondef and re-author this file.';
  end if;
end $$;

revoke execute on function public.hr_claim_quest__ungated(text, int)
  from public, anon, authenticated, service_role;

-- ── 4. READ BACK — the file cannot succeed quietly ─────────────────────────
do $$
declare
  v_bad  text;
  v_d    text;
  v_q    text;
  v_n    int;
begin
  -- (a) THE FIVE CATALOGUE ROWS ARE EXACTLY THE RULED PAIR.
  select string_agg(g.goal_id || '=' || g.target || '/' || g.gold, ', ' order by g.goal_id)
    into v_bad
    from public.hr_goal_rewards g
    join (values
      ('gather_logs', 60::bigint, 300::bigint),
      ('mine_ore',    60,         300),
      ('fish',        50,         300),
      ('cook',        25,         250),
      ('plant',        3,         150)
    ) as v(goal_id, vt, vg) on v.goal_id = g.goal_id
   where (g.target, g.gold) is distinct from (v.vt, v.vg);
  if v_bad is not null then
    raise exception 'VERIFY: the modal-goal retune did not land — %', v_bad;
  end if;

  -- (b) NOTHING ELSE ON THOSE ROWS MOVED. gems/xp/items are outside the ruling,
  --     and a retune that quietly rewrote a reward component would be the
  --     b492 phantom-XP class all over again.
  if not exists (select 1 from public.hr_goal_rewards where goal_id = 'gather_logs'
                  and gems = 0 and xp = '{"woodcutting":100}'::jsonb and items = '{}'::jsonb)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'mine_ore'
                  and gems = 0 and xp = '{"mining":100}'::jsonb and items = '{}'::jsonb)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'fish'
                  and gems = 0 and xp = '{"fishing":100}'::jsonb and items = '{}'::jsonb)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'cook'
                  and gems = 0 and xp = '{"cooking":80}'::jsonb and items = '{}'::jsonb)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'plant'
                  and gems = 0 and xp = '{"farming":80}'::jsonb and items = '{}'::jsonb) then
    raise exception 'VERIFY: a gems/xp/items component moved — this file may only touch target+gold';
  end if;

  -- (c) THE TABLE IS OTHERWISE UNDISTURBED. 19 rows, and the two goals this
  --     file must NOT have touched still read exactly as before — gold_500
  --     because re-applying its authoring file is the known trap, and
  --     kill_more because it is the third kill-graded payout in the reviewed
  --     forgery bound.
  select count(*) into v_n from public.hr_goal_rewards;
  if v_n <> 19 then
    raise exception 'VERIFY: hr_goal_rewards holds % rows, expected 19', v_n;
  end if;
  if not exists (select 1 from public.hr_goal_rewards
                  where goal_id = 'kill_more' and target = 30 and gold = 600 and gems = 1)
     or not exists (select 1 from public.hr_goal_rewards
                  where goal_id = 'kill_any' and target = 10 and gold = 200 and gems = 0) then
    raise exception 'VERIFY: a kill goal moved — this file re-prices the DAILY TASKS, not the '
                    'modal kill goals, and the forgery bound in the header is arithmetic over both';
  end if;

  -- (d) THE TWO FUNCTION BODIES CARRY THE RULED CATALOGUE AND NOT THE OLD ONE.
  --     Whitespace-normalised, so a re-indent cannot make this vacuous.
  v_d := regexp_replace(
           replace(pg_get_functiondef('public.hr_claim_daily__ungated(text,integer)'::regprocedure),
                   chr(13), ''), '[[:space:]]+', ' ', 'g');
  v_q := regexp_replace(
           replace(pg_get_functiondef('public.hr_claim_quest__ungated(text,integer)'::regprocedure),
                   chr(13), ''), '[[:space:]]+', ' ', 'g');

  if position('when ''daily_kill'' then v_type := ''kill_any''; v_goal := 25; v_gold := 600;' in v_d) = 0
     or position('when ''daily_kill_big'' then v_type := ''kill_any''; v_goal := 60; v_gold := 1400;' in v_d) = 0
     or position('when ''daily_smith'' then v_type := ''smithed''; v_goal := 40; v_gold := 500;' in v_d) = 0
     or position('when ''daily_craft'' then v_type := ''crafted''; v_goal := 40; v_gold := 500;' in v_d) = 0 then
    raise exception 'VERIFY: hr_claim_daily__ungated does not carry all four ruled arms';
  end if;
  if position('v_gold := 900;' in v_d) > 0 or position('v_gold := 450;' in v_d) > 0 then
    raise exception 'VERIFY: an OLD daily-task price survives in hr_claim_daily__ungated — the '
                    'patch replaced some arms and not others';
  end if;
  if position('when ''farmhand'' then v_key := ''ev:harvest''; v_goal := 6; v_gold := 500;' in v_q) = 0 then
    raise exception 'VERIFY: hr_claim_quest__ungated does not carry the ruled farmhand goal';
  end if;

  -- (e) THE PATCH DID NOT WIDEN THE DOOR. An __ungated inner must stay shut out
  --     of every client role, and the rate-gated wrappers must stay callable —
  --     `create or replace` preserves an ACL, but this is the assertion, not the
  --     assumption.
  if has_function_privilege('authenticated', 'public.hr_claim_daily__ungated(text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_claim_quest__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_daily__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_quest__ungated(text,integer)', 'execute') then
    raise exception 'VERIFY: an __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_daily(text,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_claim_quest(text,integer)', 'execute') then
    raise exception 'VERIFY: a claim wrapper is no longer callable by authenticated — the feature '
                    'is dead';
  end if;

  raise notice 'b497 goal-gold retune: daily_kill 600, daily_kill_big 1400, daily_smith/craft 40@500, '
               'farmhand goal 6, gather_logs/mine_ore 60@300, fish 50@300, cook 25@250, plant 3@150 '
               '(kill-graded character-day ceiling 2,200 -> 2,800 g, once-guarded)';
end $$;
