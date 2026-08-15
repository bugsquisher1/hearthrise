-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GRANT INTENT, SERVER HALF  (b349)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies.
--
-- Companion code: supabase/functions/hr-accrue/{claim-reward,envelope,intents,
-- request}.js and src/data/rewards.js. Companion test: tests/claim-intent.mjs.
-- Governing rule: CLAUDE.md §"Server authority (locked 2026-08-10)".
--
-- ── WHAT THIS FILE IS ───────────────────────────────────────────────────
-- The second player intent, and the FIRST one that moves money: "I claim
-- today's login reward." Like the activity intent before it, almost none of it
-- is SQL — and that is the architecture working rather than a gap.
--
-- ⚠ IT DOES NOT TOUCH hr_apply, AND THAT IS A HARD CONSTRAINT, NOT A
--   COINCIDENCE. `2026-08-15-intent-key-hygiene.sql` (Security's C1 + C3) and
--   `2026-08-15-tool-carry.sql` must remain the last two files that define that
--   body. A third `create or replace` here would SILENTLY DELETE both — the
--   exact defect that nearly shipped in the clan work, where three files each
--   defined one policy, filename order would have installed the wrong one, and
--   every self-check would still have passed because each asserted only its own
--   terms. §0 below therefore asserts the terms of BOTH of those files against
--   the live body, with a control, and refuses to install if either is missing.
--
-- Everything the DATABASE already owns for a claim, and none of it is new:
--   · `player_progress` — the claimable ledger, keyed (user, slot, kind, key,
--     period_key), with `state` CHECKed to ('active','done','claimed');
--   · hr_apply's `progress` block — CANNOT write 'claimed', and PRESERVES an
--     existing 'claimed' through `on conflict` (review S13);
--   · hr_apply's `progress_claim` block — the ONLY route to 'claimed', requires
--     the row to already be 'done', and asserts `row_count = 1`, so a claim that
--     changes nothing answers `not_claimable`;
--   · the whole of it under `pg_advisory_xact_lock` + `select … for update`
--     inside the protected block, so a losing claim rolls back in full;
--   · `player_intents` + `intent_mismatch` + the C3 slot scope — idempotency.
--
-- So this file adds exactly two things:
--   1. a rate budget for the new verb (`claim`, 20/min);
--   2. `hr_claim_lookup` — a bounded, engine-only READ that answers "what is
--      the server's day key, and has this claimable already been claimed for it".
--
-- ── WHY hr_claim_lookup EXISTS AT ALL ───────────────────────────────────
-- `hr_state_of` already returns a `progress` array, so the intent could have
-- scanned that. It must not, for two independent reasons:
--
--   (a) THAT ARRAY IS BOUNDED FOR A DIFFERENT PURPOSE. It is `limit 1000` with
--       a 31-day filter on periodic rows (reliability RL4). A character whose
--       permanent progress rows reach that limit would silently stop seeing
--       yesterday's login row — and the symptom is not an error, it is a streak
--       that resets to day 1 and a smaller reward. Under-paying silently is the
--       failure class this program exists to remove.
--   (b) THE DAY KEY MUST BE THE SERVER'S, AND THERE MUST BE ONLY ONE OF THEM.
--       `public.hr_utc_day_key(timestamptz)` has existed since 2026-08-08 and
--       returns `FMYYYY-FMMM-FMDD`, i.e. **2026-8-5**. A JavaScript day-key
--       helper returning '20260805' would not be a duplicate that might drift —
--       it would be a duplicate that is ALREADY different, and the only symptom
--       is a `player_progress` row filed under a period nothing will ever look
--       up again. So the day is computed HERE, once, by the function that
--       already existed, and the Edge Function uses the string it is given.
--       (The JS helpers were written and then deleted before they had a caller;
--       src/data/rewards.js records why in place of them.)
--
-- ── COST ────────────────────────────────────────────────────────────────
-- One index-lookup per claim on the `player_progress` primary key, at most
-- three rows, folded into the SAME statement as the rate gate and the state
-- read (`case when g.allowed`), so a rate-limited caller pays for a boolean.
-- No new table, no new row, no new cron entry, no new index. At 100x players
-- the table grows by ONE ROW PER CHARACTER PER CLAIMED DAY — 600 players x 365
-- = 219,000 rows/year, which `hr_progress_prune` already caps at 31 days for
-- periodic rows (~18,600 live). Contrast the receipt this repo carries:
-- game_events reached 1.6M rows / 229 MB from SIX players in four days.
--
-- SAFE TO RE-RUN. Additive and idempotent: two `create or replace function`,
-- revoke/grant pairs, and self-checks that clean up after themselves.
-- REVERSIBLE: re-apply 2026-08-15-activity-intent.sql to restore hr_rate_gate's
-- previous body verbatim (same signature, `create or replace`), and
-- `drop function if exists public.hr_claim_lookup(uuid,int,text,text)` to
-- remove the read. Nothing else in this file creates a table, a column, a row,
-- an index or a cron entry, and nothing in it can be rolled back into a state
-- that pays anybody anything.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ───────────────────────────────────────
do $$
declare v_src text; v_ctl boolean;
begin
  if to_regprocedure('public.hr_rate_gate(uuid,int,text)') is null then
    raise exception 'hr_rate_gate missing — apply 2026-08-11-accrue-gate.sql then '
                    '2026-08-15-activity-intent.sql first';
  end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key missing — apply 2026-08-08-clan-seat.sql first. '
                    'This file deliberately does NOT define a second day-key function.';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- The `state` CHECK is the double-claim lock's other half: without 'claimed'
  -- being a constrained value, hr_apply's progress_claim has nothing to enforce.
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.player_progress'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ 'claimed')
  then
    raise exception 'player_progress has no CHECK naming ''claimed'' — the claim state is '
                    'unconstrained and progress_claim would be enforcing nothing';
  end if;

  -- ── THE hr_apply PROPERTIES THIS INTENT RESTS ON ───────────────────────
  -- ⚠ A prosrc scan is a text search, and a text search that has silently
  --   stopped matching passes forever. So it carries a CONTROL: a term that
  --   MUST be in any hr_apply worth the name. If the control is absent the scan
  --   is blind, and this file refuses rather than reporting a clean bill of
  --   health on a database it cannot read. (2026-08-15-activity-intent.sql §0
  --   is the precedent; the lesson is instance #13's.)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  v_ctl := v_src ~ 'version_conflict';
  if not v_ctl then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND — the control term (version_conflict) is '
                    'absent from a % char body, so every check below would pass on any '
                    'database. Fix the scan, do not loosen it.', coalesce(length(v_src), 0);
  end if;

  if v_src !~ 'progress_claim' then
    raise exception 'hr_apply has NO progress_claim BLOCK. That block IS the double-claim lock: '
                    'without it every reward in this file could be claimed once per intent key, '
                    'forever. Apply 2026-08-11-apply-engine.sql first.';
  end if;
  if v_src !~ 'not_claimable' then
    raise exception 'hr_apply never answers not_claimable — the claim block cannot be asserting '
                    'row_count = 1, so a claim of something unearned would silently succeed.';
  end if;
  if v_src !~ 'intent_mismatch' then
    raise exception 'hr_apply has NO intent_mismatch BRANCH. This file adds a SECOND '
                    'client-chosen intent-id producer to a namespace shared with the '
                    'server-derived accrual keys; without that branch a key collision hands '
                    'back another intent''s decision (review S6).';
  end if;

  -- ⚠ THE TWO FILES THAT MUST STILL BE THE LAST WORD ON hr_apply.
  --   `v_prev_slot` is Security's C3 (one key means one thing on one slot) from
  --   2026-08-15-intent-key-hygiene.sql; `tool_carry` is 2026-08-15-tool-carry.
  --   If either term is missing, the live body PREDATES them — which means some
  --   later file replaced hr_apply and deleted them, and installing a second
  --   client-key producer onto that body would reopen a measured, silent
  --   cross-slot no-op. This is the check that would have caught the clan
  --   three-policies-one-name defect, generalised: assert the terms of the
  --   files you DEPEND ON, not only your own.
  if v_src !~ 'v_prev_slot' then
    raise exception 'hr_apply does NOT slot-scope the idempotency key (C3). The live body '
                    'predates 2026-08-15-intent-key-hygiene.sql, so something replaced it and '
                    'deleted that condition. Re-apply intent-key-hygiene, then tool-carry, '
                    'then this file. Do NOT install a second client-key producer without it.';
  end if;
  if v_src !~ 'tool_carry' then
    raise exception 'hr_apply does not know the tool_carry delta key. The live body predates '
                    '2026-08-15-tool-carry.sql, so something replaced it. Re-apply that file '
                    '(it must stay LAST of anything defining hr_apply) before this one.';
  end if;
end $$;

-- ── 1. hr_claim_lookup — the bounded, engine-only claim read ─────────────
-- Answers exactly one question and returns exactly what is needed to act on it:
--
--   { "today": "2026-8-16", "prev": "2026-8-15",
--     "rows": { "2026-8-15": {"value": 4, "state": "claimed"} } }
--
-- `rows` is restricted to three period keys — '' (the permanent row a
-- non-periodic claimable uses), today, and yesterday. That bound is structural
-- rather than a LIMIT: there is no argument through which a caller could widen
-- it, so no call can ever scan a character's history.
--
-- STABLE, and asserted so in §3. It performs no write and calls nothing that
-- writes (hr_utc_day_key is `stable sql`). ⚠ A VOLATILITY DECLARATION IS A CLAIM
-- ABOUT THE WHOLE CALL TREE, NOT THE BODY IN FRONT OF YOU — this project took a
-- sign-up outage on exactly that (`beta_invite_check` was STABLE and true only
-- while a function two levels down did not write). If anything here ever gains
-- a write, this declaration must change in the same commit.
create or replace function public.hr_claim_lookup(
  p_user uuid, p_slot int, p_kind text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today text;
  v_prev  text;
begin
  if p_user is null or p_kind is null or p_key is null then
    return jsonb_build_object('today', null, 'prev', null, 'rows', '{}'::jsonb);
  end if;
  -- THE SERVER'S CLOCK, THE SERVER'S DAY FUNCTION. Never an argument: a caller
  -- that can name the day can claim every day since launch in a loop.
  v_today := public.hr_utc_day_key(now());
  v_prev  := public.hr_utc_day_key(now() - interval '1 day');

  return jsonb_build_object(
    'today', v_today,
    'prev',  v_prev,
    'rows',  coalesce((
      select jsonb_object_agg(period_key,
               jsonb_build_object('value', value, 'state', state))
        from public.player_progress
       where user_id = p_user
         and slot    = coalesce(p_slot, 0)
         and kind    = p_kind
         and key     = p_key
         and period_key in ('', v_today, v_prev)), '{}'::jsonb));
end $$;

-- ── 2. hr_rate_gate — one bucket added ───────────────────────────────────
-- Unchanged from 2026-08-15-activity-intent.sql except for the `claim` arm. The
-- whole body is restated because `create or replace` is the only way to change
-- it and a diff-shaped migration does not exist in SQL. §3(C) is a REGRESSION
-- CONTROL on the two pre-existing buckets for exactly that reason: a rewrite is
-- how a bucket silently disappears.
--
-- ── THE LIMIT, AND WHY THIS NUMBER ───────────────────────────────────────
-- 20/min, TIGHTER than accrue's and activity's 30. A claim is a once-per-UTC-day
-- gesture; the budget exists only to bound a retry storm, and 20 leaves ample
-- room for the client's single automatic retry on `version_conflict` plus a
-- player hammering a button. Choosing the same 30 "for consistency" would have
-- been a number nobody decided.
--
-- Note the buckets are INDEPENDENT counters, so a client can spend all three:
-- 80 engine calls/minute/user total. Stated rather than discovered. The
-- expensive halves are bounded elsewhere — ACCRUE_MIN_MS is 60,000, and a claim
-- can succeed at most once per day per claimable whatever the call rate,
-- because `progress_claim` refuses the second one.
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
begin
  if p_user is null then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, both of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue'   then v_limit := 30; v_window := interval '1 minute';
    -- b345. Matches `accrue` deliberately: set_activity runs a COLLECT apply
    -- and a SWITCH apply, so it is strictly more expensive per call and must
    -- not be the looser budget of the two.
    when 'activity' then v_limit := 30; v_window := interval '1 minute';
    -- b349. See the block above for why this one is 20 rather than 30.
    when 'claim'    then v_limit := 20; v_window := interval '1 minute';
    else return false;
  end case;

  if public.hr_rate_ok(p_user, p_bucket, v_limit, v_window) then
    return true;
  end if;

  -- Sampled record. Same policy as hr_load and hr_apply: detection does not need
  -- every event, it needs to know the event is happening and roughly how much.
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, p_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', true), v_weight);
  end if;
  return false;
end $$;

-- ── 3. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- `create or replace` PRESERVES the existing ACL, so for hr_rate_gate these are
-- belt-and-braces. For hr_claim_lookup they are load-bearing: Supabase's default
-- ACL grants EXECUTE to PUBLIC on every NEW function, and only a GLOBAL `alter
-- default privileges` suppresses it. A brand-new function with no revoke is
-- anon-callable the moment it is created.
revoke execute on function public.hr_claim_lookup(uuid, int, text, text) from public;
revoke execute on function public.hr_claim_lookup(uuid, int, text, text)
  from anon, authenticated, service_role;
grant execute on function public.hr_claim_lookup(uuid, int, text, text) to hr_engine;

revoke execute on function public.hr_rate_gate(uuid, int, text) from public;
revoke execute on function public.hr_rate_gate(uuid, int, text)
  from anon, authenticated, service_role;
grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;

-- ── 4. SELF-VERIFICATION — BEHAVIOURAL, EXECUTED, WITH CONTROLS ──────────
-- Every refusal probe below is paired with a control that fails if the probe is
-- blind. A migration whose self-check can only ever pass has checked nothing.
do $$
declare
  v_p    oid;
  v_q    oid;
  v_bad  text;
  v_u    uuid := gen_random_uuid();
  v_n    int  := 0;
  v_j    jsonb;
  i      int;
begin
  v_p := to_regprocedure('public.hr_rate_gate(uuid,int,text)');
  v_q := to_regprocedure('public.hr_claim_lookup(uuid,int,text,text)');
  if v_q is null then raise exception 'hr_claim_lookup did not install'; end if;

  -- (A) CAPABILITY. Both are engine-only.
  --     hr_claim_lookup reads ANOTHER PLAYER'S progress if you can name them —
  --     it takes p_user as an argument and is SECURITY DEFINER, so it bypasses
  --     RLS by construction. That is correct for the engine (which has already
  --     verified the JWT) and catastrophic for anyone else, which is why the
  --     revoke is not optional and why this probe names every client role.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, v_q, 'execute');
  if v_bad is not null then
    raise exception 'hr_claim_lookup is executable by: % — it takes p_user as an ARGUMENT and '
                    'is SECURITY DEFINER, so any of those roles could read any player''s '
                    'claim history. Revoke before grant.', v_bad;
  end if;
  if not has_function_privilege('hr_engine', v_q, 'execute') then
    raise exception 'hr_engine cannot execute hr_claim_lookup — every claim would refuse';
  end if;

  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, v_p, 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_gate is executable by: % — revoke before grant', v_bad;
  end if;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_engine cannot execute hr_rate_gate — the intent path would be ungated';
  end if;

  -- (B) hr_rate_ok STAYS unreachable by everyone, hr_engine included. If the
  --     engine could call it, the engine would name its own limit and all three
  --     buckets above become decoration.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_function_privilege(r, 'public.hr_rate_ok(uuid,text,int,interval)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_ok is executable by: % — the limit would become a caller argument', v_bad;
  end if;

  -- (C) THE NEW BUCKET WORKS, AND BOTH OLD ONES STILL DO.
  --     A random uuid has no counter row, so this is a self-contained fixture.
  if public.hr_rate_gate(v_u, 0, 'not_a_bucket') then
    raise exception 'hr_rate_gate admitted an unknown bucket — it must fail closed';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'claim') then
    raise exception 'hr_rate_gate refused the first claim call';
  end if;
  -- REGRESSION CONTROLS: this file rewrites the whole body, so the pre-existing
  -- buckets are exactly what a careless edit drops.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'hr_rate_gate refused an accrue call — this rewrite dropped the accrual budget';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'activity') then
    raise exception 'hr_rate_gate refused an activity call — this rewrite dropped b345''s bucket';
  end if;

  -- (D) THE LIMIT IS APPLIED, it is 20 rather than 30, and it is per-bucket.
  for i in 1..30 loop
    if public.hr_rate_gate(v_u, 0, 'claim') then v_n := v_n + 1; end if;
  end loop;
  if v_n >= 30 then
    raise exception 'hr_rate_gate allowed % of 30 further claim calls — the limit is not applied', v_n;
  end if;
  -- The claim budget is TIGHTER than accrue's, which is the decision recorded
  -- in §2. If this ever fires, the two numbers have been equalised by someone
  -- who did not read that block.
  if v_n > 20 then
    raise exception 'the claim bucket allowed % calls past the first — the limit is not 20/min', v_n;
  end if;
  -- ...and exhausting `claim` must not have exhausted the others.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'exhausting the claim bucket also exhausted accrue — the counters are shared';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'activity') then
    raise exception 'exhausting the claim bucket also exhausted activity — the counters are shared';
  end if;
  if public.hr_rate_gate(null, 0, 'claim') then
    raise exception 'hr_rate_gate admitted a null user on the claim bucket';
  end if;

  -- (E) hr_claim_lookup ANSWERS, and its day keys are the SERVER's.
  v_j := public.hr_claim_lookup(v_u, 0, 'daily', 'login');
  if v_j->>'today' is distinct from public.hr_utc_day_key(now()) then
    raise exception 'hr_claim_lookup.today = % but hr_utc_day_key(now()) = % — two day-key '
                    'implementations, which is the one thing this function exists to prevent',
                    v_j->>'today', public.hr_utc_day_key(now());
  end if;
  if v_j->>'prev' is distinct from public.hr_utc_day_key(now() - interval '1 day') then
    raise exception 'hr_claim_lookup.prev disagrees with hr_utc_day_key(now() - 1 day)';
  end if;
  if v_j->>'today' = v_j->>'prev' then
    raise exception 'hr_claim_lookup returned the same key for today and yesterday (%) — the '
                    'streak rule would then read TODAY''s row as yesterday''s', v_j->>'today';
  end if;
  if v_j->'rows' <> '{}'::jsonb then
    raise exception 'hr_claim_lookup returned rows for a user that does not exist: %', v_j->'rows';
  end if;
  -- CONTROL for (E): a nonsense argument must not error, it must answer empty —
  -- the intent refuses by NAME on an empty answer, and an exception here would
  -- surface as a 500 instead.
  v_j := public.hr_claim_lookup(v_u, 0, 'daily', 'no_such_reward_at_all');
  if v_j->'rows' <> '{}'::jsonb then
    raise exception 'hr_claim_lookup invented rows for an unknown key';
  end if;
  if public.hr_claim_lookup(null, 0, 'daily', 'login')->>'today' is not null then
    raise exception 'hr_claim_lookup answered a null user with a day key';
  end if;

  -- (F) VOLATILITY, asserted structurally. STABLE is a claim about the whole
  --     call tree; if this function ever gains a write it must stop being
  --     STABLE in the same commit, and this is what makes that forced.
  if (select provolatile from pg_proc where oid = v_q) <> 's' then
    raise exception 'hr_claim_lookup is not STABLE — either it gained a write (in which case '
                    'make it VOLATILE and say so) or somebody changed the declaration';
  end if;

  delete from public.hr_rate_counters where user_id = v_u;
  delete from public.hr_rejections where user_id = v_u;

  raise notice 'hr_rate_gate: claim = 20/min added; accrue + activity intact; unknown buckets '
               'fail closed. hr_claim_lookup: engine-only, STABLE, server day keys, bounded '
               'to 3 period rows.';
end $$;

-- ── 5. THE LOCK THIS INTENT RESTS ON, PROVEN BY EXECUTION ────────────────
-- The assertion is NOT that hr_apply is correct in general — it is the one
-- specific fact the grant intent is built on, and which nothing else in this
-- repo exercises end to end:
--
--   A CLAIM CAN BE MADE EXACTLY ONCE. The second attempt is refused
--   (`not_claimable`), it is refused UNDER THE CHARACTER LOCK, and the refusal
--   rolls back the `progress` write that came with it — so the losing call
--   cannot leave a corrupted `value` behind for tomorrow's streak to read.
--
-- Written here, as an executable claim, so that the day someone changes
-- hr_apply's progress_claim block THIS FILE STOPS APPLYING, instead of the Edge
-- Function quietly paying a reward twice.
--
-- Skipped LOUDLY if its fixtures are unavailable — never silently, because a
-- self-check that switches itself off is worse than no self-check.
-- (apply-engine §6(g) is the precedent: its guard predicate was MEASURED before
-- the apply so "the gate passed" could be told apart from "the gate was off".)
do $$
declare
  v_uid   uuid := gen_random_uuid();
  v_slot  int  := 0;
  v_r     jsonb;
  v_ver   bigint;
  v_gold  bigint;
  v_gold2 bigint;
  v_kit   int;
  v_day   text;
  v_val   bigint;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception '§5 CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  -- MEASURED, not assumed: without a start kit the bootstrap refuses and the
  -- whole block below would "pass" by never running.
  select count(*) into v_kit from public.hr_start_kit;
  if v_kit <> 1 then
    raise exception '§5 CANNOT RUN: hr_start_kit holds % rows — re-apply the catalogue', v_kit;
  end if;

  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception '§5 HARNESS: auth.uid() did not pick up the probe identity';
    end if;

    v_r := public.hr_create_character(v_slot);
    if v_r->>'created' <> 'true' then
      raise exception '§5: could not create the probe character: %', v_r;
    end if;
    select version, gold into v_ver, v_gold
      from public.player_state where user_id = v_uid and slot = v_slot;
    v_day := public.hr_utc_day_key(now());

    -- (i) THE FIRST CLAIM LANDS. Called as the OWNER with p_user = auth.uid(),
    --     which is the branch hr_apply allows for a non-engine caller (`set role
    --     hr_engine` is correctly refused on production — postgres -> hr_engine
    --     is granted WITH SET FALSE).
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object(
               'gold', 500,
               'progress', jsonb_build_array(jsonb_build_object(
                 'kind','daily','key','login','period', v_day, 'add', 1, 'state','done')),
               'progress_claim', jsonb_build_array(jsonb_build_object(
                 'kind','daily','key','login','period', v_day)),
               'journal', jsonb_build_object('kind','quest',
                 'intent','claim_reward:daily:login:' || v_day)));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§5 CONTROL: the FIRST claim was refused (%) — every probe below would '
                      'then pass for the wrong reason', v_r;
    end if;
    select version, gold into v_ver, v_gold2
      from public.player_state where user_id = v_uid and slot = v_slot;
    if v_gold2 <> v_gold + 500 then
      raise exception '§5 CONTROL: the first claim paid % gold, expected 500', v_gold2 - v_gold;
    end if;
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = v_slot and kind = 'daily'
                      and key = 'login' and period_key = v_day and state = 'claimed') then
      raise exception '§5 CONTROL: the first claim left no ''claimed'' row — progress_claim did '
                      'not run and the probe below proves nothing';
    end if;

    -- (ii) THE SECOND CLAIM IS REFUSED. Fresh version, fresh intent key — i.e.
    --      an honest second gesture, not a replay. This is the exact request a
    --      player makes by clicking Claim twice.
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object(
               'gold', 500,
               'progress', jsonb_build_array(jsonb_build_object(
                 'kind','daily','key','login','period', v_day, 'add', 1, 'state','done')),
               'progress_claim', jsonb_build_array(jsonb_build_object(
                 'kind','daily','key','login','period', v_day)),
               'journal', jsonb_build_object('kind','quest',
                 'intent','claim_reward:daily:login:' || v_day)));
    if coalesce(v_r->>'ok','true') <> 'false' or v_r->>'error' <> 'not_claimable' then
      raise exception '§5: A CLAIM CAN BE MADE TWICE. The second attempt answered % — '
                      'hr_apply''s progress_claim block is no longer asserting row_count = 1, '
                      'and every reward in the grant intent is repeatable. This is the lock '
                      'the whole verb rests on.', v_r;
    end if;

    -- (iii) AND THE REFUSAL ROLLED THE `progress` WRITE BACK WITH IT. This is
    --       the half nobody would think to check: the losing call also proposed
    --       `add: 1`, and hr_apply's generic block ADDS to `value`. If the
    --       rejection did not roll that back, the row would read 2 and
    --       TOMORROW'S STREAK would inherit the corruption — a silent
    --       over-payment with no error anywhere.
    select gold into v_gold from public.player_state where user_id = v_uid and slot = v_slot;
    if v_gold <> v_gold2 then
      raise exception '§5: the REFUSED claim still moved gold (% -> %)', v_gold2, v_gold;
    end if;
    select value into v_val from public.player_progress
      where user_id = v_uid and slot = v_slot and kind = 'daily'
        and key = 'login' and period_key = v_day;
    if v_val <> 1 then
      raise exception '§5: the refused claim left player_progress.value = % (expected 1) — the '
                      'rejection did not roll back the progress write, so tomorrow''s streak '
                      'would be computed from a corrupted number', v_val;
    end if;

    -- (iv) hr_claim_lookup SEES IT, which is what the Edge Function acts on.
    v_r := public.hr_claim_lookup(v_uid, v_slot, 'daily', 'login');
    if v_r#>>'{rows}' is null or (v_r->'rows'->v_day->>'state') <> 'claimed' then
      raise exception '§5: hr_claim_lookup does not report today''s claim (%) — the intent''s '
                      'early "already claimed today" answer would never fire', v_r;
    end if;
    if (v_r->'rows'->v_day->>'value')::bigint <> 1 then
      raise exception '§5: hr_claim_lookup reports value % for today, expected 1 — the streak '
                      'derivation reads this number', v_r->'rows'->v_day->>'value';
    end if;

    raise exception using errcode = 'HR349', message = 'b349 §5 complete — rolling back';
  exception when sqlstate 'HR349' then
    null;
  end;

  -- ROLLBACK PROOF. If the subtransaction had committed, this migration would
  -- have written a character AND a paid reward into production as a side effect
  -- of verifying itself.
  if exists (select 1 from public.player_state where user_id = v_uid) then
    raise exception '§5 LEAKED a player_state row';
  end if;
  if exists (select 1 from public.player_progress where user_id = v_uid) then
    raise exception '§5 LEAKED a player_progress row';
  end if;
  if exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception '§5 LEAKED a ledger row';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception '§5 LEAKED the probe auth.users row';
  end if;

  raise notice 'b349 §5 PASSED: a claim lands once, the second is refused as not_claimable '
               'under the character lock, and the refusal rolls back the progress write that '
               'came with it.';
end $$;
