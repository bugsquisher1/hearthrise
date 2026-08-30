-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — DAILY-TASK ELIGIBILITY (P0, Designer ruling 2026-08-23)
--
-- ── THE INCIDENT ────────────────────────────────────────────────────────────
-- The daily-task selection is a pure date-seeded 3-of-8 shuffle with no notion
-- of what the player can do. On 2026-08-23 the seed dealt a FRESH account
-- "Craft 8 items" + "Smith 8 items" — 900 of the day's 1,300 gold — and at level
-- 1 there is not one craftable or smithable recipe in the game: crafting is
-- bench-gated behind the Workshop and smithing behind the Forge
-- (src/features/homestead.js WORKBENCH → `hasWorkbench`), and both rooms need
-- the tier-3 property, two upgrades away. Home's "Next up" panel pointed a
-- first-session player at a wall of padlocks.
--
-- The shuffle is MIRRORED here (hr_daily_task_set, 2026-08-20-goal-reward-rpc-
-- credit.sql §4) because the server verifies and pays the claim, so a fix on one
-- side only would refuse the very tasks the fix hands out.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--   hr_daily_task_eligible(task, workshop, forge, crafting_xp, smithing_xp) → boolean
--   hr_daily_task_set_caps(day_key, workshop, forge, crafting_xp, smithing_xp) → text[]
--       IMMUTABLE and PURE — the port of src/data/goal-catalogue.js
--       `dailyTaskSetIndexes`. Split out from the reader below precisely so this
--       migration's own self-check can prove BOTH halves of the contract (the
--       fresh-account set AND the fully-unlocked identity) over a 400-day sweep
--       without touching a single table.
--   hr_daily_task_set_for(day_key, user, slot) → text[]
--       Reads the caps from the server's OWN stores (player_progress kind='unlock'
--       key='room:<id>', player_skills.xp) and delegates.
--   hr_claim_daily__ungated — the offer gate widens; see below.
--
-- ── THE OFFER GATE IS A UNION, AND THAT IS THE LOAD-BEARING DECISION ───────
-- Before: a claim was refused unless the task was in `hr_daily_task_set(day)`.
-- After:  it is accepted if it is in the ELIGIBLE set OR in that raw base 3.
--
-- Why a union rather than "replace the gate with the eligible set":
--
--   The two sides read DIFFERENT STORES for the same fact. The client reads room
--   ownership from `HearthriseHomestead.roomLevel` (the save blob today — the
--   rooms record is shipped DORMANT); the server reads player_progress. Measured
--   on production 2026-08-23: 2 characters, **0 rows** of kind='unlock'
--   key like 'room:%'. So for every live player the server currently believes NO
--   room is owned. If the gate were the eligible set alone, a player who really
--   has a Workshop would be OFFERED "Craft 8 items" by their client, complete it,
--   and be told `not_offered` at the till.
--
--   A union can only ever be wrong in the harmless direction:
--     • base3 \ eligible3 are the tasks the SERVER believes are impossible for
--       this character. If it is right, the ev counter can never reach the goal
--       and accepting them costs nothing. If it is wrong, accepting them is
--       exactly correct.
--     • eligible3 \ base3 are the back-filled tasks the client actually offers,
--       so they MUST be claimable or the fix breaks the thing it is fixing.
--
--   What it widens, stated plainly rather than waved past: on a day where the
--   two sets differ, a player who genuinely completed BOTH the base and the
--   back-filled task can claim up to 3 extra dailies. Every one of them is still
--   verified against the server's own `ev:<type>` counter for today's UTC day and
--   still once-guarded per (day, task) — so the "extra" is bought with real play,
--   not forged, and its ceiling is ~2,700 gold on a character-day against a
--   25,000,000 gold/character-day budget (2026-08-11-daily-budget.sql). It closes
--   by itself: once the rooms record is armed the server's caps match the
--   client's, base3 \ eligible3 becomes genuinely unreachable, and the union
--   collapses to the eligible set with no further migration.
--
--   The alternative — a narrower gate — trades that bounded, play-backed
--   widening for REFUSING LEGITIMATE CLAIMS TODAY, on the surface a player reads
--   as "the game stole my daily". That is the worse failure, and it is not
--   self-closing.
--
-- ── SINGLE SOURCE ───────────────────────────────────────────────────────────
-- The requirement table and the selection algorithm are authored ONCE, in
-- src/data/goal-catalogue.js (DAILY_TASK_REQUIREMENTS / dailyTaskSetIndexes).
-- Everything here is a port, and tests/goal-catalogue-drift.mjs binds the two —
-- including an EXECUTABLE bind of legacy.js's own shuffle against the module's,
-- which is stronger than the textual constant check the pool order had before.
--
-- REVERSIBILITY: re-apply 2026-08-20-goal-reward-rpc-credit.sql §6 to restore
-- the narrow gate, then drop the three functions. Nothing is dropped, no column
-- is added, no row is rewritten.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — fail closed rather than install half a gate ──────────
do $$
begin
  if to_regprocedure('public.hr_daily_task_set(text)') is null
     or to_regprocedure('public.hr_goal_daily_seed(text)') is null then
    raise exception 'hr_daily_task_set / hr_goal_daily_seed absent — apply '
      '2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
  if to_regprocedure('public.hr_claim_daily__ungated(text,integer)') is null then
    raise exception 'hr_claim_daily__ungated absent — apply '
      '2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
  if to_regclass('public.player_skills') is null then
    raise exception 'player_skills absent — apply 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── 1. THE PREDICATE — the port of DAILY_TASK_REQUIREMENTS ─────────────────
-- Disjunctive on purpose: "the room is built OR the skill already has XP". You
-- cannot earn crafting XP at a bench you never had, so the second arm only ever
-- ADDS eligibility — and it is what makes the two sides agree for a player who
-- has actually used the bench, which is exactly the population a room-only
-- predicate would falsely lock out server-side while the rooms record is dormant.
create or replace function public.hr_daily_task_eligible(
  p_task_id text, p_workshop bigint, p_forge bigint, p_crafting_xp bigint, p_smithing_xp bigint)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select case p_task_id
    when 'daily_smith' then (coalesce(p_forge, 0) > 0 or coalesce(p_smithing_xp, 0) > 0)
    when 'daily_craft' then (coalesce(p_workshop, 0) > 0 or coalesce(p_crafting_xp, 0) > 0)
    else true
  end;
$$;

revoke execute on function public.hr_daily_task_eligible(text, bigint, bigint, bigint, bigint)
  from public, anon, authenticated, service_role;

-- ── 2. THE SELECTION — the port of dailyTaskSetIndexes, PURE ───────────────
-- The shuffle is byte-for-byte hr_daily_task_set's (same FNV-1a seed, same LCG
-- Fisher-Yates over the same index space); only the take changes: walk the
-- shuffled order and SKIP an ineligible task rather than stopping at three.
create or replace function public.hr_daily_task_set_caps(
  p_day_key text, p_workshop bigint, p_forge bigint, p_crafting_xp bigint, p_smithing_xp bigint)
returns text[] language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  -- MUST equal src/data/goal-catalogue.js DAILY_TASK_POOL_ORDER and the authored
  -- order of legacy.js DAILY_TASK_POOL (the drift test binds all three).
  c_pool constant text[] := array['daily_kill','daily_kill_big','daily_gather',
    'daily_gather_big','daily_harvest','daily_cook','daily_smith','daily_craft'];
  c_mask constant bigint := 4294967295;
  c_want constant int    := 3;                    -- DAILY_TASK_BASE_COUNT
  v_seed bigint := public.hr_goal_daily_seed(p_day_key);
  v_idx  int[]  := array[0,1,2,3,4,5,6,7];
  v_i    int; v_j int; v_tmp int;
  v_out  text[] := '{}';
  v_id   text;
  k      int;
begin
  for v_i in reverse 7..1 loop                       -- JS: for i = len-1; i>0; i--
    v_seed := ((v_seed * 1664525) + 1013904223) & c_mask;
    v_j := (v_seed % (v_i + 1))::int;
    v_tmp := v_idx[v_i + 1];
    v_idx[v_i + 1] := v_idx[v_j + 1];
    v_idx[v_j + 1] := v_tmp;
  end loop;

  -- PASS 1 — eligible rows, in shuffle order.
  for k in 1..8 loop
    exit when coalesce(array_length(v_out, 1), 0) >= c_want;
    v_id := c_pool[v_idx[k] + 1];
    if public.hr_daily_task_eligible(v_id, p_workshop, p_forge, p_crafting_xp, p_smithing_xp) then
      v_out := v_out || v_id;
    end if;
  end loop;

  -- PASS 2 — the BACK-FILL. Unreachable today (six of eight pool rows are
  -- ungated, so a 3-slot draw always fills) and deliberately kept: the day
  -- someone authors a ninth gated row, the alternative is a player handed two
  -- daily tasks and a silent hole where the third should be. Shuffle order is
  -- preserved, so the answer stays a pure function of (day key, caps).
  if coalesce(array_length(v_out, 1), 0) < c_want then
    for k in 1..8 loop
      exit when coalesce(array_length(v_out, 1), 0) >= c_want;
      v_id := c_pool[v_idx[k] + 1];
      if not (v_id = any (v_out)) then v_out := v_out || v_id; end if;
    end loop;
  end if;

  return v_out;
end $$;

revoke execute on function public.hr_daily_task_set_caps(text, bigint, bigint, bigint, bigint)
  from public, anon, authenticated, service_role;

-- ── 3. THE READER — caps from the server's own stores ──────────────────────
create or replace function public.hr_daily_task_set_for(p_day_key text, p_user uuid, p_slot int)
returns text[] language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  v_workshop bigint; v_forge bigint; v_craft bigint; v_smith bigint;
begin
  select coalesce(max(case when key = 'room:workshop' then value end), 0),
         coalesce(max(case when key = 'room:forge'    then value end), 0)
    into v_workshop, v_forge
    from public.player_progress
   where user_id = p_user and slot = coalesce(p_slot, 0) and kind = 'unlock'
     and key in ('room:workshop', 'room:forge');

  select coalesce(max(case when skill_id = 'crafting' then xp end), 0),
         coalesce(max(case when skill_id = 'smithing' then xp end), 0)
    into v_craft, v_smith
    from public.player_skills
   where user_id = p_user and slot = coalesce(p_slot, 0)
     and skill_id in ('crafting', 'smithing');

  return public.hr_daily_task_set_caps(p_day_key,
    coalesce(v_workshop, 0), coalesce(v_forge, 0), coalesce(v_craft, 0), coalesce(v_smith, 0));
end $$;

-- Not client-reachable. It takes p_user as an ARGUMENT and is SECURITY DEFINER,
-- which is the shape a client call would turn into "read anyone's room ladder".
revoke execute on function public.hr_daily_task_set_for(text, uuid, int)
  from public, anon, authenticated, service_role;

-- ── 4. hr_claim_daily__ungated — RESTATED from goal-reward-rpc-credit §6 ───
-- Exactly one block changes (the offer gate). Everything else — the catalogue
-- CASE, the ev-counter verification, the once-guard, the credit and the ledger
-- row — is verbatim, and §5 re-proves each of them rather than trusting the
-- transcription.
create or replace function public.hr_claim_daily__ungated(p_task_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_day    text := public.hr_utc_day_key(now());
  v_set    text[];
  v_elig   text[];
  v_type   text;
  v_goal   bigint;
  v_gold   bigint;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-DERIVED offered set for TODAY. `v_elig` is what an up-to-date client
  -- offers (the eligibility filter); `v_set` is the raw base 3 the pre-b45x
  -- client offered and which a client whose room ownership the server cannot yet
  -- see will still offer. The gate is the UNION — see this file's header for why
  -- narrowing it would refuse legitimate claims today. A task in NEITHER is still
  -- refused, so cherry-picking a richer unoffered task remains blocked, and the
  -- King's Renown 4th slot still lands here as not_offered (no server Renown
  -- model — src/data/goal-catalogue.js BLOCKED_DAILY).
  v_set  := public.hr_daily_task_set(v_day);
  v_elig := public.hr_daily_task_set_for(v_day, auth.uid(), v_slot);
  if not (p_task_id = any (v_set)) and not (p_task_id = any (v_elig)) then
    return jsonb_build_object('ok', false, 'error', 'not_offered',
      'task', p_task_id, 'day_key', v_day,
      'offered', to_jsonb(v_elig), 'base', to_jsonb(v_set));
  end if;

  -- SERVER-OWNED CATALOGUE (FIXED tasks only; daily_harvest is dynamic → blocked).
  case p_task_id
    -- b497 RETUNE (Designer, balance audit). Kept in lockstep with
    -- 2026-08-20-goal-reward-rpc-credit.sql §6, which this file restates, and
    -- with src/data/goal-catalogue.js DAILY_TASK_REWARDS. This file runs LATER
    -- in the apply order, so on a REBUILD these are the numbers that install;
    -- on PRODUCTION the installed body is moved by
    -- 2026-09-04-goal-gold-retune.sql instead.
    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 600;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 1400;
    when 'daily_gather'     then v_type := 'gather';   v_goal := 50;  v_gold := 400;
    when 'daily_gather_big' then v_type := 'gather';   v_goal := 120; v_gold := 800;
    when 'daily_cook'       then v_type := 'cooked';   v_goal := 12;  v_gold := 400;
    when 'daily_smith'      then v_type := 'smithed';  v_goal := 40;  v_gold := 500;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 40;  v_gold := 500;
    when 'daily_harvest'    then
      return jsonb_build_object('ok', false, 'error', 'not_creditable',
        'task', p_task_id, 'reason', 'dynamic goal (farm plot cap) — no server model yet');
    else return jsonb_build_object('ok', false, 'error', 'unknown_task', 'task', p_task_id);
  end case;

  -- VERIFY from today's daily counter.
  select value into v_have from public.player_progress
   where user_id = auth.uid() and slot = v_slot
     and kind = 'daily' and key = 'ev:' || v_type and period_key = v_day;
  if coalesce(v_have, 0) < v_goal then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'task', p_task_id, 'have', coalesce(v_have, 0), 'goal', v_goal, 'day_key', v_day);
  end if;

  -- CONSUME (once per day per task). key=<task_id>, distinct from 'ev:<type>'.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'daily', p_task_id, 1, v_day, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed',
      'task', p_task_id, 'day_key', v_day);
  end if;

  -- CREDIT.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold, version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'daily', 'daily_claim:' || v_day || ':' || p_task_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('task', p_task_id, 'type', v_type, 'goal', v_goal, 'day_key', v_day));

  return jsonb_build_object('ok', true, 'task', p_task_id, 'gold', v_gold,
    'day_key', v_day, 'slot', v_slot, 'credited', true);
end $$;

-- REVOKE BEFORE GRANT. `create or replace` PRESERVES an ACL, so the inner body's
-- revoke is restated rather than assumed; the rate-gated wrapper
-- (goal-reward-rpc-credit §7) is untouched and keeps its authenticated grant.
revoke execute on function public.hr_claim_daily__ungated(text, int)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- No row is written: the selection was deliberately split into a PURE function
-- so its whole contract is provable by executing it.
do $$
declare
  v_fresh text[];
  v_full  text[];
  v_raw   text[];
  v_d     date;
  v_k     text;
  v_txt   text;
  v_n     int := 0;
begin
  -- (a) THE JS REFERENCE PIN. src/data/goal-catalogue.js dailyTaskSet for the
  --     incident day with NOTHING unlocked, executed in Node 2026-08-23:
  --       raw base 3     = {daily_gather, daily_craft, daily_smith}   ← the bug
  --       fresh-account  = {daily_gather, daily_harvest, daily_kill_big}
  if public.hr_daily_task_set('2026-8-23')
     is distinct from array['daily_gather','daily_craft','daily_smith'] then
    raise exception 'GATE(a): the RAW selection drifted — this file assumes '
      'hr_daily_task_set is unchanged: %', public.hr_daily_task_set('2026-8-23');
  end if;
  v_fresh := public.hr_daily_task_set_caps('2026-8-23', 0, 0, 0, 0);
  if v_fresh is distinct from array['daily_gather','daily_harvest','daily_kill_big'] then
    raise exception 'GATE(a): the SQL port disagrees with the JS reference for 2026-8-23: %', v_fresh;
  end if;

  -- (b) IDENTITY FOR A FULLY-UNLOCKED ACCOUNT, over 400 consecutive day keys.
  --     An eligibility filter that changes what an established player is offered
  --     is a balance change wearing a bug fix's clothes. Swept, not argued.
  v_d := date '2026-01-01';
  while v_d < date '2027-02-05' loop
    -- NOON UTC, explicitly: `v_d::timestamptz` would be midnight in the SESSION
    -- time zone, which lands on the previous UTC day for any negative offset and
    -- would make this sweep prove a property about the wrong day keys.
    v_k := public.hr_utc_day_key((v_d::text || ' 12:00:00+00')::timestamptz);
    v_full := public.hr_daily_task_set_caps(v_k, 1, 1, 0, 0);
    v_raw  := public.hr_daily_task_set(v_k);
    if v_full is distinct from v_raw then
      raise exception 'GATE(b): a fully-unlocked account is offered % on % but the raw shuffle '
        'says % — the filter is not the identity for an established player', v_full, v_k, v_raw;
    end if;
    -- (c) …and a FRESH account is never offered a bench task, and never a short slate.
    v_fresh := public.hr_daily_task_set_caps(v_k, 0, 0, 0, 0);
    if coalesce(array_length(v_fresh, 1), 0) <> 3 then
      raise exception 'GATE(c): fresh slate on % has % task(s), expected 3 — the back-fill failed',
        v_k, coalesce(array_length(v_fresh, 1), 0);
    end if;
    if 'daily_craft' = any (v_fresh) or 'daily_smith' = any (v_fresh) then
      raise exception 'GATE(c): a fresh account is offered a bench task on %: %', v_k, v_fresh;
    end if;
    v_n := v_n + 1;
    v_d := v_d + 1;
  end loop;
  if v_n < 400 then raise exception 'GATE(b/c): only % day(s) swept', v_n; end if;

  -- (d) THE DISJUNCTION IS REAL — XP alone unlocks the row, so a player who has
  --     used the bench is not locked out by a room ladder the server cannot see.
  if not public.hr_daily_task_eligible('daily_craft', 0, 0, 1, 0)
     or not public.hr_daily_task_eligible('daily_smith', 0, 0, 0, 1) then
    raise exception 'GATE(d): the skill-XP arm of the predicate does not fire';
  end if;
  if public.hr_daily_task_eligible('daily_craft', 0, 0, 0, 0)
     or public.hr_daily_task_eligible('daily_smith', 0, 0, 0, 0) then
    raise exception 'GATE(d): a bench task is eligible with nothing unlocked — the filter is inert';
  end if;
  -- CONTROL: the ungated rows really are ungated (a filter that excluded
  -- everything would pass (c) by accident via the back-fill).
  if not (public.hr_daily_task_eligible('daily_kill', 0, 0, 0, 0)
      and public.hr_daily_task_eligible('daily_gather', 0, 0, 0, 0)
      and public.hr_daily_task_eligible('daily_cook', 0, 0, 0, 0)
      and public.hr_daily_task_eligible('daily_harvest', 0, 0, 0, 0)) then
    raise exception 'GATE(d): an ungated pool row is being filtered out';
  end if;

  -- (e) THE CLAIM GATE is the union, and the catalogue survived the restatement.
  v_txt := pg_get_functiondef(to_regprocedure('public.hr_claim_daily__ungated(text,integer)'));
  if position('hr_daily_task_set_for' in v_txt) = 0 then
    raise exception 'GATE(e): the restated claim body does not consult the eligible set';
  end if;
  if position('hr_daily_task_set(v_day)' in v_txt) = 0 then
    raise exception 'GATE(e): the restated claim body dropped the raw base set — a client the '
      'server under-knows would have its legitimate claim refused';
  end if;
  if position('not_offered' in v_txt) = 0 then
    raise exception 'GATE(e): the offer gate is gone entirely — any task could be claimed';
  end if;
  if position('not_creditable' in v_txt) = 0 or position('already_claimed' in v_txt) = 0
     or position('incomplete' in v_txt) = 0 then
    raise exception 'GATE(e): the restatement lost the harvest block, the once-guard or the '
      'ev-counter verification';
  end if;

  -- (f) NOTHING new is client-reachable, and the wrapper still is.
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, 'public.hr_daily_task_set_for(text,uuid,integer)', 'execute')
      or has_function_privilege(r, 'public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint)', 'execute')
      or has_function_privilege(r, 'public.hr_daily_task_eligible(text,bigint,bigint,bigint,bigint)', 'execute')
      or has_function_privilege(r, 'public.hr_claim_daily__ungated(text,integer)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(f): a daily-eligibility function is executable by % — the rate-gated '
      'wrapper is the only door', v_txt;
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_daily(text,integer)', 'execute') then
    raise exception 'GATE(f): hr_claim_daily is no longer callable by a player';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_claim_daily__ungated(text,integer)', 'execute') then
    raise exception 'GATE(f): hr_engine can claim a daily — the engine settles a night, it does '
      'not collect rewards for anybody';
  end if;

  raise notice 'daily-task eligibility: % day keys swept; fresh accounts get a doable slate', v_n;
end $$;

-- ── 6. EXECUTED PROBES — the claim path, in a discarded subtransaction ─────
-- §5 proves the SELECTION. This proves the CLAIM: that the union gate accepts
-- both arms and still refuses a task in neither, and that the restated body did
-- not lose the once-guard or the credit. Row-writing probes live in an
-- HR819-discarded subtransaction because player_ledger's retention guard refuses
-- to DELETE a fresh row — same shape as goal-reward-rpc-credit §8.
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000de-0000-0000-0000-0000000000de';
  v_slot  constant int  := 0;
  v_day   text := public.hr_utc_day_key(now());
  v_base  text[];
  v_elig  text[];
  v_pool  constant text[] := array['daily_kill','daily_kill_big','daily_gather',
    'daily_gather_big','daily_harvest','daily_cook','daily_smith','daily_craft'];
  v_id    text;
  v_extra text := null;    -- creditable, in the ELIGIBLE set but not the base set
  v_only  text := null;    -- creditable, in the BASE set but not the eligible set
  v_none  text := null;    -- in neither
  v_g0 bigint; v_g1 bigint;
  v_arms  text := '';
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000;

    -- Every ev counter seeded past every fixed goal, so "incomplete" can never
    -- be the reason a claim below is refused.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state) values
      (v_uid, v_slot, 'daily', 'ev:kill_any', 1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:gather',   1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:cooked',   1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:smithed',  1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:crafted',  1000, v_day, 'active');

    v_base := public.hr_daily_task_set(v_day);
    v_elig := public.hr_daily_task_set_for(v_day, v_uid, v_slot);

    -- The probe owns no rooms and no artisan XP, so the reader must agree with
    -- the pure function called with zero caps. If these ever disagree, the
    -- server is filtering on something other than what it says it filters on.
    if v_elig is distinct from public.hr_daily_task_set_caps(v_day, 0, 0, 0, 0) then
      raise exception 'GATE(g): hr_daily_task_set_for(%) = % but the pure function with zero caps '
        'says % — the reader is not reading what it claims', v_day, v_elig,
        public.hr_daily_task_set_caps(v_day, 0, 0, 0, 0);
    end if;

    -- Classify today's ids. `daily_harvest` is excluded from the two positive
    -- probes because it is deliberately not creditable (dynamic goal).
    foreach v_id in array v_elig loop
      if v_id <> 'daily_harvest' and not (v_id = any (v_base)) then v_extra := v_id; end if;
    end loop;
    foreach v_id in array v_base loop
      if v_id <> 'daily_harvest' and not (v_id = any (v_elig)) then v_only := v_id; end if;
    end loop;
    foreach v_id in array v_pool loop
      if v_id <> 'daily_harvest' and not (v_id = any (v_base)) and not (v_id = any (v_elig))
      then v_none := v_id; end if;
    end loop;

    -- ARM 1 — a BACK-FILLED task (offered by the client, absent from the raw
    -- base 3) must be claimable. This is the arm the fix depends on: without it
    -- every task the eligibility filter hands out is refused at the till.
    if v_extra is not null then
      select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
      v := public.hr_claim_daily__ungated(v_extra, v_slot);
      if coalesce(v->>'ok','') <> 'true' then
        raise exception 'GATE(g): a BACK-FILLED task (%) was refused: %', v_extra, v;
      end if;
      select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
      if v_g1 <= v_g0 then
        raise exception 'GATE(g): the back-filled claim credited nothing (% -> %)', v_g0, v_g1;
      end if;
      -- …and the once-guard survived the restatement.
      v := public.hr_claim_daily__ungated(v_extra, v_slot);
      if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
        raise exception 'GATE(g): a replayed daily claim was not refused: %', v;
      end if;
      if (select gold from public.player_state where user_id = v_uid and slot = v_slot) <> v_g1 then
        raise exception 'GATE(g): the replay RE-CREDITED';
      end if;
      v_arms := v_arms || 'back-filled ';
    end if;

    -- ARM 2 — a task the SERVER thinks this character cannot do, but which the
    -- raw base 3 offered, is still claimable. This is what keeps a client whose
    -- room ownership the server cannot see from being refused.
    if v_only is not null then
      v := public.hr_claim_daily__ungated(v_only, v_slot);
      if coalesce(v->>'ok','') <> 'true' then
        raise exception 'GATE(g): a BASE-SET task (%) the eligibility filter excluded was refused: '
          '% — the union gate is not a union', v_only, v;
      end if;
      v_arms := v_arms || 'base-only ';
    end if;

    -- THE NEGATIVE, always available (8 pool ids, at most 6 in the union): a
    -- task in NEITHER set is still refused, so cherry-picking a richer unoffered
    -- task remains blocked.
    if v_none is null then
      raise exception 'GATE(g): today''s union covers the whole pool — the negative control cannot '
        'run, which means the refusal above is unproven';
    end if;
    v := public.hr_claim_daily__ungated(v_none, v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_offered' then
      raise exception 'GATE(g): an unoffered task (%) was NOT refused: %', v_none, v;
    end if;
    v := public.hr_claim_daily__ungated('definitely_not_a_task', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_offered' then
      raise exception 'GATE(g): a nonsense task id was not refused: %', v;
    end if;

    -- NO REGRESSION FOR AN ESTABLISHED PLAYER, executed rather than swept: give
    -- the character the two rooms and the eligible set must become the raw base
    -- set exactly.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state) values
      (v_uid, v_slot, 'unlock', 'room:workshop', 1, '', null),
      (v_uid, v_slot, 'unlock', 'room:forge',    1, '', null);
    if public.hr_daily_task_set_for(v_day, v_uid, v_slot) is distinct from v_base then
      raise exception 'GATE(g): with both benches built the offered set is % but the raw shuffle '
        'says % — the filter is not the identity for an established player',
        public.hr_daily_task_set_for(v_day, v_uid, v_slot), v_base;
    end if;

    raise notice 'daily-eligibility §6: day %, base %, eligible %, arms exercised: %',
      v_day, v_base, v_elig, coalesce(nullif(v_arms, ''), 'negative-only (the two sets coincide today)');
    raise exception using errcode = 'HR819', message = 'daily-task-eligibility §6 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = '000000de-0000-0000-0000-0000000000de')
     or exists (select 1 from public.player_ledger   where user_id = '000000de-0000-0000-0000-0000000000de')
     or exists (select 1 from public.player_progress where user_id = '000000de-0000-0000-0000-0000000000de')
     or exists (select 1 from auth.users where id = '000000de-0000-0000-0000-0000000000de') then
    raise exception 'GATE(g): §6 LEAKED a probe row';
  end if;
end $$;
