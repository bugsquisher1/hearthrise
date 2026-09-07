-- 2026-09-07-goal-counter-kind-check.sql
--
-- STAGED - REVIEW ONLY, NOT AUTO-APPLIED.
-- The Coordinator applies this by hand (tools/apply-migration.mjs, one file,
-- one txn) AFTER a Security GO. It touches no function body and moves no
-- player row; it constrains the CATALOGUE that hr_claim_goal grades gold, gems
-- and XP against, which makes it a money surface by what it can permit.
--
-- ==========================================================================
-- WHY (Security P2 follow-up on 2026-09-07-farm-plant-lifetime-counter.sql)
-- ==========================================================================
-- That file backfilled a LIFETIME stat/'ev:planted' counter for 27 (user, slot)
-- pairs from the plant ledger - a truthful count of work already done, and
-- deliberately a key no server catalogue grades today. The residual risk is
-- RETROACTIVE PAYMENT: the day someone adds a goal row whose counter reads a
-- lifetime stat, every one of those 27 players is instantly complete for work
-- done before the goal existed, and hr_claim_goal pays it without ever seeing
-- a claim it could refuse.
--
-- Only two counter kinds have a paying READER today:
--   'daily'        hr_goal_state__ungated / hr_claim_goal__ungated read
--                  player_progress rows with kind='daily' (a weekly goal sums
--                  the ISO week's seven day keys). period_key scopes them, so
--                  the backfilled lifetime row is invisible to both.
--   'ledger_gold'  derived from player_ledger since the period start.
-- A third value in that column is not a feature that exists; it is an authoring
-- slip that would silently be read by nothing (dead goal) or - if a future
-- reader is taught kind='stat' - would pay the backfill. The column should say
-- so in the schema rather than in a comment.
--
-- THE EXPOSURE, STATED HONESTLY AND NOT OVERSOLD. Both readers branch
-- `if counter_kind = 'ledger_gold' ... else <read player_progress kind=daily>`,
-- and that else is a FALLTHROUGH: an unknown kind is graded as daily TODAY, so
-- a rogue catalogue row on its own would read the daily counter and pay nothing
-- retroactively. The real risk is the TWO-STEP - a row lands and looks
-- intentional, then a later change teaches a reader about lifetime kinds. This
-- constraint makes step one impossible rather than merely unhelpful, and it
-- makes that else-fallthrough honest instead of load-bearing. The second half
-- of the two-step is guarded in tests/goal-counter-kinds.mjs, which drives a
-- character holding a large lifetime ev:planted through the real goal board and
-- requires have=0 and a refused claim.
--
-- ==========================================================================
-- WHAT IS ALREADY TRUE, MEASURED, NOT ASSUMED
-- ==========================================================================
-- The column is NOT unconstrained free text in the repo chain:
-- 2026-08-23-modal-goal-claims.sql:256 creates it with an INLINE, UNNAMED
--   counter_kind text not null check (counter_kind in ('daily','ledger_gold'))
-- and tests/schema-drift.baseline.json carries the system-generated name
-- `hr_goal_rewards_counter_kind_check` in the replayed fingerprint. So on a
-- clean rebuild the allowlist is already enforced. TWO gaps remain, and this
-- file exists for them:
--   (1) that CREATE is `create table if not exists`. On any database where the
--       table predated it the inline check never ran, and nothing in the repo
--       would notice. Production cannot be read from an agent lane, so this
--       file ASSERTS the property at apply time instead of assuming it (§2
--       adds the constraint only when the column is not already covered by an
--       equivalent check, and §4 PROVES a refusal by executing one).
--   (2) an unnamed constraint is not a contract anything can cite. A NAMED
--       constraint is what tests/goal-counter-kinds.mjs and the next reader
--       can point at.
-- If the inline check is present the ADD is skipped with a notice: a second,
-- byte-equivalent check on the same column is redundant surface, and a
-- migration that adds redundancy "just to be sure" teaches the next author
-- that duplicates are fine.
--
-- WHAT THIS DOES NOT COVER, PLAINLY. hr_claim_quest__ungated does NOT read
-- this catalogue - its four quests are a hardcoded CASE over stat keys
-- (ev:gather / ev:cooked / ev:kill_any / ev:harvest). A constraint on
-- hr_goal_rewards cannot stop a fifth branch reading 'ev:planted' from being
-- written into that body. That half is guarded in the repo, where the body
-- lives, by tests/goal-counter-kinds.mjs, and §4(d) below re-asserts it against
-- the INSTALLED function so the check is not merely a source-tree opinion.
--
-- ORDER: AFTER 2026-08-23-modal-goal-claims.sql (creates the table) and after
-- every file that seeds or retunes rows (2026-09-01-kill-goal-xp-hitpoints.sql,
-- 2026-09-04-goal-gold-retune.sql), so §1 validates the FINAL 19 rows.
-- NO EDGE CHANGE. NO CLIENT CHANGE. IDEMPOTENT: re-applying is a no-op.
-- REVERSIBILITY:
--   alter table public.hr_goal_rewards drop constraint if exists hr_goal_rewards_counter_kind_ck;
-- No player row is read or written by this file.

-- -- 1. PRECONDITIONS ------------------------------------------------------
do $$
declare v_bad text; v_n int;
begin
  if to_regclass('public.hr_goal_rewards') is null then
    raise exception 'hr_goal_rewards does not exist - apply 2026-08-23-modal-goal-claims.sql first';
  end if;
  select count(*) into v_n from public.hr_goal_rewards;
  if v_n <> 19 then
    raise exception 'hr_goal_rewards holds % rows, expected the seeded 19 - this is not the catalogue '
                    'this file was reviewed against', v_n;
  end if;
  -- The constraint must not be able to invalidate a row that already exists.
  select string_agg(distinct counter_kind, ', ') into v_bad
    from public.hr_goal_rewards
   where counter_kind not in ('daily', 'ledger_gold');
  if v_bad is not null then
    raise exception 'hr_goal_rewards already holds counter_kind value(s) [%] outside the allowlist - '
                    'a paying reader may exist for them. STOP and re-review; do not widen this '
                    'constraint to fit the data', v_bad;
  end if;
end $$;

-- -- 2. THE CONSTRAINT -----------------------------------------------------
-- NOT VALID then VALIDATE, in two statements, even though the table is 19 rows
-- and one statement would do: it is the shape every future catalogue gets, it
-- takes only a SHARE UPDATE EXCLUSIVE lock for the scan instead of holding
-- ACCESS EXCLUSIVE across it, and VALIDATE failing is a readable, separate
-- error rather than an ADD that "did not work".
do $$
declare v_have text;
begin
  -- Any existing check on this column whose text already pins the allowlist -
  -- including the unnamed inline one from the CREATE TABLE - counts as covered.
  select c.conname into v_have
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'hr_goal_rewards' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%counter_kind%'
     and pg_get_constraintdef(c.oid) like '%''daily''%'
     and pg_get_constraintdef(c.oid) like '%''ledger_gold''%'
   order by (c.conname = 'hr_goal_rewards_counter_kind_ck') desc, c.conname
   limit 1;

  if v_have is not null then
    raise notice 'goal-counter-kind-check: counter_kind is ALREADY covered by check constraint % - '
                 'nothing added (a second equivalent check would be redundant surface)', v_have;
  else
    raise notice 'goal-counter-kind-check: counter_kind was UNCONSTRAINED on this database (the '
                 'create-table-if-not-exists inline check never ran here) - adding '
                 'hr_goal_rewards_counter_kind_ck';
    alter table public.hr_goal_rewards
      add constraint hr_goal_rewards_counter_kind_ck
      check (counter_kind in ('daily', 'ledger_gold')) not valid;
    alter table public.hr_goal_rewards
      validate constraint hr_goal_rewards_counter_kind_ck;
  end if;
end $$;

-- -- 3. NOTHING TO BACKFILL ------------------------------------------------
-- Deliberately empty. §1 proved every row already satisfies the predicate; a
-- constraint that had to rewrite rows to be true would be a different file with
-- a different review.

-- -- 4. SELF-CHECK - EXECUTED, NOT ASSERTED BY MARKER ----------------------
do $$
declare
  v_conname text; v_def text; v_validated boolean; v_n int; v_src text;
begin
  -- (a) A validated check constraint pins the column, whatever its name.
  select c.conname, pg_get_constraintdef(c.oid), c.convalidated
    into v_conname, v_def, v_validated
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'hr_goal_rewards' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%counter_kind%'
   order by (c.conname = 'hr_goal_rewards_counter_kind_ck') desc, c.conname
   limit 1;
  if v_conname is null then
    raise exception 'GATE(a): no check constraint on hr_goal_rewards.counter_kind - the column is free text';
  end if;
  if not v_validated then
    raise exception 'GATE(a): constraint % is NOT VALID - it does not vouch for the existing rows', v_conname;
  end if;
  if v_def not like '%''daily''%' or v_def not like '%''ledger_gold''%' then
    raise exception 'GATE(a): constraint % does not pin the allowlist: %', v_conname, v_def;
  end if;

  -- (b) THE ROWS ARE INTACT. A constraint file that lost a catalogue row would
  --     silently delete a goal from every player's board.
  select count(*) into v_n from public.hr_goal_rewards;
  if v_n <> 19 then
    raise exception 'GATE(b): hr_goal_rewards holds % rows after this file (expected 19)', v_n; end if;
  select count(*) into v_n from public.hr_goal_rewards where counter_kind = 'daily';
  if v_n < 1 then raise exception 'GATE(b): no daily goal survives'; end if;
  select count(*) into v_n from public.hr_goal_rewards where counter_kind = 'ledger_gold';
  if v_n < 1 then raise exception 'GATE(b): no ledger_gold goal survives'; end if;

  -- (c) EXECUTED REFUSAL. The named risk, run: a catalogue row that would grade
  --     the backfilled LIFETIME ev:planted counter must be REFUSED by the
  --     database, not by a code review. Discarded subtransaction, and a
  --     POSITIVE CONTROL first so a refusal caused by something else (RLS, a
  --     missing grant, a NOT NULL) cannot read as success.
  begin
    insert into public.hr_goal_rewards
      (goal_id, weekly, counter_kind, counter_key, target, gold, gems, xp, items)
    values ('__ck_probe_ok', false, 'daily', 'ev:planted', 3, 0, 0, '{}', '{}');
    -- control passed: an allowed kind inserts.
    begin
      insert into public.hr_goal_rewards
        (goal_id, weekly, counter_kind, counter_key, target, gold, gems, xp, items)
      values ('__ck_probe_bad', false, 'stat', 'ev:planted', 3, 500, 0, '{}', '{}');
      raise exception using errcode = 'HR830',
        message = 'GATE(c): a counter_kind=''stat'' catalogue row was ACCEPTED - the day anyone adds '
               || 'it, all 27 backfilled lifetime ev:planted rows pay out retroactively';
    exception
      when check_violation then null;   -- the constraint bit. This is the pass.
      when sqlstate 'HR830' then raise;
    end;
    raise exception using errcode = 'HR831', message = 'goal-counter-kind-check S4 complete - rolling back';
  exception when sqlstate 'HR831' then null;
  end;

  -- (c2) THE PROBES LEFT NOTHING BEHIND.
  if exists (select 1 from public.hr_goal_rewards where goal_id like '\_\_ck\_probe%') then
    raise exception 'GATE(c2): the self-check LEAKED a probe catalogue row'; end if;
  select count(*) into v_n from public.hr_goal_rewards;
  if v_n <> 19 then
    raise exception 'GATE(c2): hr_goal_rewards holds % rows after the probes (expected 19)', v_n; end if;

  -- (d) THE OTHER PAYING READER, ASSERTED AGAINST THE INSTALLED BODY.
  --     hr_claim_quest__ungated grades LIFETIME stat keys from a hardcoded
  --     CASE, which no constraint on this table can reach. If a branch for
  --     'ev:planted' is ever added there, the backfill pays retroactively by a
  --     path this file does not cover - so this file refuses to land next to it.
  -- prosrc, not the functiondef helper: this is a READ of the installed body, not a patch,
  -- and tests/live-hash-drift.mjs treats every caller of that helper as a function patcher
  -- that must yield a signature (fail-closed). The body text is identical for position().
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_claim_quest__ungated' limit 1;
  if v_src is null then
    raise exception 'GATE(d): hr_claim_quest__ungated is not installed - the quest half cannot be checked';
  end if;
  if position('ev:planted' in v_src) > 0 then
    raise exception 'GATE(d): hr_claim_quest__ungated now reads ev:planted - the lifetime plant backfill '
                    'would pay 27 players retroactively through the QUEST path, which this constraint '
                    'does not guard. Re-review before applying';
  end if;
  if position('ev:harvest' in v_src) = 0 or position('ev:kill_any' in v_src) = 0 then
    raise exception 'GATE(d): the installed hr_claim_quest__ungated is not the reviewed body (its known '
                    'stat keys are missing) - the ev:planted check above proves nothing';
  end if;

  -- (e) ACL UNCHANGED. This catalogue is read by SECURITY DEFINER functions
  --     only; a client that can read it is a leak, one that can write it is
  --     free gold.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hr_goal_rewards'
                and grantee in ('anon','authenticated','PUBLIC')) then
    raise exception 'GATE(e): a client grant exists on hr_goal_rewards - the reward catalogue is '
                    'reachable from the client';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='hr_goal_rewards' and c.relrowsecurity) then
    raise exception 'GATE(e): RLS is off on hr_goal_rewards'; end if;

  raise notice 'goal-counter-kind-check: counter_kind is pinned by validated constraint % (%), all 19 '
               'catalogue rows intact, a stat/ev:planted row is REFUSED by the database, the quest '
               'body still names no ev:planted, ACL and RLS unchanged - all green', v_conname, v_def;
end $$;
