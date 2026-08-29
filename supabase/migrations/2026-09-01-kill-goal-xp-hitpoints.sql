-- 2026-09-01-kill-goal-xp-hitpoints.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The Coordinator applies this by hand (Management API / execute_sql wrapped in
-- begin/commit). It is a THREE-ROW DATA FIX on a money-adjacent catalogue and
-- must pass Security review before it goes to production.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY IT IS A SEPARATE FILE
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (security review S7, pre-existing, LIVE). hr_goal_rewards priced
-- the XP of the three kill goals as skill id 'combat':
--
--     kill_any   '{"combat":50}'      kill_more '{"combat":200}'
--     wk_kills   '{"combat":1000}'
--
-- 'combat' is not an hr_skills row — hr_skills carries attack / strength /
-- defense / hitpoints / ranged / magic / prayer, and "combat level" is DERIVED
-- from them. hr_claim_goal plans its mint with
-- `exists (select 1 from public.hr_skills where skill_id = v_k)`, so all three
-- grants have gone into `skipped_xp` since the day the RPC shipped: **players
-- have never received the XP component of any kill goal**, while the quest
-- modal printed it as part of the price. The client's addXp('combat') mirrored
-- the mistake, inventing a phantom G.skills.combat that no settle confirmed.
--
-- THE RULING (Game Designer, 2026-08-31 — final, not re-litigated here). The XP
-- lands in HITPOINTS, RETUNED rather than translated:
--     kill_any    50 -> 100        (daily)
--     kill_more  200 -> 300        (daily)
--     wk_kills  1000 -> 1000       (weekly, held)
-- Gold, gems, targets, counters and the weekly flag are UNCHANGED. hitpoints is
-- a real hr_skills row AND a server-accrued skill
-- (src/data/skill-authority.js ALWAYS_COMBAT_XP_SKILLS), so the credit lands in
-- the same record the absolute envelope reconciles and cannot evaporate on the
-- next settle — which is the whole reason a period reward is credited
-- server-side in the first place.
--
-- CEILING, FOR THE RECORD. Both dailies can be claimed once per UTC day and the
-- weekly once per ISO week, all once-guarded by player_progress(kind='quest'):
--     100 + 300  =   400 hitpoints XP per day   (kill goals)
--   +            = 1,000 hitpoints XP per week  (wk_kills)
-- Structural, not budgeted — bounded by the catalogue and the once-guard, the
-- same basis as the gold/gem ceiling stated in 2026-08-23-modal-goal-claims.sql.
--
-- ⚠ ANTI-MINT — THERE IS NO CONVERSION, HERE OR ANYWHERE. The phantom
--   G.skills.combat number was never server-authored. Folding an existing one
--   into player_skills.hitpoints would mint RANKED XP (hitpoints feeds combat
--   level and the leaderboards) out of a client-side artefact, so this file
--   touches hr_goal_rewards ONLY: no player_skills backfill, no reconciliation,
--   no amnesty grant. 2026-08-17-cutover-import.sql already DROPS a `combat`
--   skill key by name, and tests/cutover-import.mjs C7/C8 assert both that it
--   never reaches player_skills and that the drop is REPORTED rather than
--   silent. Any surviving client-side read stays dead.
--
-- ── WHY NOT JUST RE-APPLY 2026-08-23-modal-goal-claims.sql ────────────────
-- Because that file OWNS the whole table (`delete from hr_goal_rewards` then a
-- wholesale refill) and it has a KNOWN, OPEN repo⟷prod divergence: its
-- gold_500 row still names the phantom item `small_bones`, while PRODUCTION was
-- hand-patched in b464 to the real `bones` id plus a gem. Re-applying it would
-- silently REVERT that live fix and put "Earn 500 gold" back to
-- reward_unavailable. (tests/modal-goal-claim.mjs declares that drift by name
-- in KNOWN_PAYOUT_DRIFT, with its owner and its closing conditions.) So the
-- production change is this narrow, self-verifying forward migration — the same
-- shape as the b464 gold_500 row fix — and the b492 repo edit to the authoring
-- file keeps a REBUILD correct without ever being replayed onto prod.
--
-- ── FAIL CLOSED, AND IDEMPOTENT ───────────────────────────────────────────
-- §1 refuses to touch a row whose xp is neither the known-phantom shape NOR the
-- ruled shape: if production has drifted to something a third party authored,
-- this stops rather than overwriting it. Both shapes are accepted for one
-- reason — a REPO REBUILD applies the corrected 2026-08-23 file first, so on a
-- rebuilt database these rows are already ruled, and a file that could only run
-- once would break the replay chain (tests/schema-apply-order.json → §order).
-- §3 reads the rows back and raises unless all three are exactly right, so a
-- silent no-op is impossible.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_goal_rewards') is null then
    raise exception 'hr_goal_rewards missing — apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  if to_regclass('public.hr_skills') is null then
    raise exception 'hr_skills missing — apply the catalogue first';
  end if;
  -- The destination must be a REAL skill. This is the entire point of the file;
  -- if hitpoints were not catalogued we would be re-authoring the same defect.
  if not exists (select 1 from public.hr_skills where skill_id = 'hitpoints') then
    raise exception 'hr_skills has no ''hitpoints'' row — the ruled destination is not a skill';
  end if;
end $$;

-- ── 1. ASSERT THE LIVE SHAPE BEFORE WRITING ────────────────────────────────
do $$
declare
  r record;
  v_expect_old jsonb;
  v_expect_new jsonb;
  v_seen int := 0;
begin
  for r in
    select * from (values
      ('kill_any',  '{"combat":50}'::jsonb,   '{"hitpoints":100}'::jsonb),
      ('kill_more', '{"combat":200}'::jsonb,  '{"hitpoints":300}'::jsonb),
      ('wk_kills',  '{"combat":1000}'::jsonb, '{"hitpoints":1000}'::jsonb)
    ) as t(goal_id, old_xp, new_xp)
  loop
    v_expect_old := r.old_xp; v_expect_new := r.new_xp;
    if not exists (select 1 from public.hr_goal_rewards g where g.goal_id = r.goal_id) then
      raise exception 'row % is MISSING from hr_goal_rewards — the catalogue is not the one this '
                      'file was written against; stopping rather than inserting a payout', r.goal_id;
    end if;
    perform 1 from public.hr_goal_rewards g
      where g.goal_id = r.goal_id and (g.xp = v_expect_old or g.xp = v_expect_new);
    if not found then
      raise exception 'row % carries xp % — neither the known phantom % nor the ruled % . Production '
                      'has DRIFTED from what this fix was authored against, so overwriting it would '
                      'destroy someone else''s change. Re-read the row and re-author this file.',
        r.goal_id,
        (select g.xp::text from public.hr_goal_rewards g where g.goal_id = r.goal_id),
        v_expect_old::text, v_expect_new::text;
    end if;
    v_seen := v_seen + 1;
  end loop;
  if v_seen <> 3 then
    raise exception 'the precondition loop graded % rows, expected 3 — it is checking nothing', v_seen;
  end if;
end $$;

-- ── 2. THE FIX — three rows, xp only ───────────────────────────────────────
-- Written from a VALUES list rather than three statements so the ruled numbers
-- appear exactly once and cannot drift between the write and the verify.
update public.hr_goal_rewards g
   set xp = v.new_xp
  from (values
    ('kill_any',  '{"hitpoints":100}'::jsonb),
    ('kill_more', '{"hitpoints":300}'::jsonb),
    ('wk_kills',  '{"hitpoints":1000}'::jsonb)
  ) as v(goal_id, new_xp)
 where g.goal_id = v.goal_id
   and g.xp is distinct from v.new_xp;

-- ── 3. READ BACK — the file cannot succeed quietly ─────────────────────────
do $$
declare
  v_bad text;
  v_n   int;
begin
  select string_agg(g.goal_id || '=' || g.xp::text, ', ' order by g.goal_id) into v_bad
    from public.hr_goal_rewards g
    join (values
      ('kill_any',  '{"hitpoints":100}'::jsonb),
      ('kill_more', '{"hitpoints":300}'::jsonb),
      ('wk_kills',  '{"hitpoints":1000}'::jsonb)
    ) as v(goal_id, new_xp) on v.goal_id = g.goal_id
   where g.xp is distinct from v.new_xp;
  if v_bad is not null then
    raise exception 'VERIFY: the kill-goal rewards did not land — %', v_bad;
  end if;

  -- The destination is payable: hr_claim_goal's own filter, re-run here. A row
  -- that passes the shape check but names a skill the server does not have
  -- would be the SAME defect wearing a different id.
  select count(*) into v_n
    from public.hr_goal_rewards g, lateral jsonb_each_text(g.xp) e
   where g.goal_id in ('kill_any', 'kill_more', 'wk_kills')
     and not exists (select 1 from public.hr_skills s where s.skill_id = e.key);
  if v_n > 0 then
    raise exception 'VERIFY: % kill-goal XP key(s) are still outside hr_skills — hr_claim_goal would '
                    'drop them into skipped_xp and the player would again be quoted a price the game '
                    'does not pay', v_n;
  end if;

  -- Gold and gems are NOT part of this ruling; prove they were not disturbed.
  if not exists (select 1 from public.hr_goal_rewards where goal_id = 'kill_any'  and gold = 200  and gems = 0)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'kill_more' and gold = 600  and gems = 1)
     or not exists (select 1 from public.hr_goal_rewards where goal_id = 'wk_kills'  and gold = 2500 and gems = 3) then
    raise exception 'VERIFY: a currency column moved — this file may only touch xp';
  end if;

  raise notice 'b492: kill-goal XP now pays hitpoints — kill_any 100, kill_more 300, wk_kills 1000 '
               '(ceiling 400/day + 1000/week, once-guarded)';
end $$;
