-- 2026-08-23-modal-goal-claims.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The coordinator applies this by hand (execute_sql wrapped in begin/commit, or
-- a branch apply) as part of a coordinated deploy. It ADDS a money-surface RPC
-- and must pass Security review before authority moves. Read the change
-- contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- Hearthrise has THREE goal systems, not two. b414 gave the first two a server
-- credit path (hr_claim_quest for QUEST_DEFS, hr_claim_daily for
-- DAILY_TASK_POOL). The THIRD — the quest MODAL's Daily/Weekly tabs, driven by
-- legacy.js DAILY_GOAL_POOL + DAILY_REWARDS + WEEKLY_GOAL_POOL — never got one.
-- Its `claimQuestReward` is a client-authored gold/gem/xp/item grant, and under
-- the live gold arm its very first line DEFERS the whole claim:
--
--     if (reward && ((reward.gold && !clientMayWriteRecordField('gold')) || …)) return;
--
-- So every Claim button in that modal is SILENTLY DEAD in production today.
-- This migration is the fix: one SECURITY DEFINER RPC that VERIFIES completion
-- from the server's OWN counters and CREDITS the WHOLE reward — gold, gems, XP
-- and items — once-guarded, journalled, inside one transaction.
--
-- ── THE WHOLE REWARD IS SERVER-CREDITED, NOT JUST THE CURRENCY ─────────────
-- b414 left a quest's XP/item half client-applied because the skills and
-- inventory records were not yet server-of-record. They are now
-- (SKILLS_RECORD_ARM / INVENTORY_ARM both live), and that changes the answer: a
-- client-side addXp/addItem is a DISPLAY PREDICTION that the next settle
-- retires against a server which never heard about it. Paying the gold half
-- server-side and the XP half client-side would therefore evaporate the XP —
-- exactly the failure class this whole program exists to remove. So xp lands in
-- player_skills and items land in player_inventory, in the SAME transaction as
-- the gold, the gem, the once-guard and the journal row. The RPC still RETURNS
-- the full breakdown so the client can toast it; it never authors it.
--
-- ── COMPLETION IS READ, NEVER TRUSTED ──────────────────────────────────────
--   period counter   player_progress(kind='daily', key=<counter_key>,
--                                    period_key=<utc day key>)
--   DAILY  goal      := that row's value on TODAY
--   WEEKLY goal      := the SUM of those rows over the current ISO WEEK's seven
--                       day keys (hr_goal_week_days)
--   gold-earned goal := sum(player_ledger.gold) over the period, gold > 0
-- No client number reaches any of it. The goal id and the slot are the only
-- things that cross the wire, and the id is looked up in a SERVER catalogue.
--
-- ── WHY WEEKLY IS DERIVED AND NOT STORED ───────────────────────────────────
-- The obvious build is a mirrored kind='weekly' row per counter. Rejected:
--   1. It needs 'weekly' added to hr_apply's progress allowlist — a restatement
--      of a ~1,200-line SECURITY DEFINER body and a new HR_APPLY_CHAIN link,
--      which is the single riskiest edit available in this repo, for a counter.
--   2. It DOUBLES the progress ops on every settle. hr_apply refuses >64
--      (`too_many_progress_ops`) and `progress_clamp` is on index.ts's
--      DEGRADABLE list — an over-budget combat night does not fail loudly, it
--      HALVES THE SPAN and pays half the gold to protect a counter.
--   3. Two counters for one fact can drift. One cannot.
-- hr_progress_prune keeps period rows for 31 days, so a week is always fully
-- readable, and the sum is seven probes on the PK's trailing column.
--
-- ── THE WEEK BOUNDARY IS MONDAY UTC, AND THAT IS NOT hr_utc_week_key ───────
-- public.hr_utc_week_key ('w<n>', floor(days-since-epoch / 7)) rolls over on a
-- THURSDAY — 1970-01-01 was a Thursday. The clan Muster/Hunt use it and are
-- welcome to; the quest modal is not, because the panel tells the player
-- "Weekly quests refresh every Monday", its countdown targets Monday, and
-- legacy.js `thisWeekKey()` was fixed in b291 to bucket on Monday for exactly
-- that reason. A Thursday-keyed claim row would make a goal re-offered on
-- Monday answer `already_claimed` until Thursday. So this file adds
-- hr_iso_week_key — ISO week, Monday-aligned, '2026-W35' — whose BOUNDARIES are
-- identical to the client's bucket. tests/modal-goal-claim.mjs asserts that
-- equivalence over a two-year sweep.
--
-- ── ONCE-GUARD ─────────────────────────────────────────────────────────────
-- An INSERT of player_progress(kind='quest', key='goal:<id>',
-- period_key=<day|week key>, state='claimed') ON CONFLICT DO NOTHING. A
-- replay's row_count=0 is refused BEFORE any credit. Consume + credit + journal
-- are one function/transaction: they commit or roll back together, so there is
-- no window in which the claim is spent but the reward unpaid, and no path that
-- pays twice. kind='quest' is the claim LIFECYCLE namespace src/core/goals.js
-- reserves and the engine deliberately never writes; the `goal:` prefix keeps
-- it clear of hr_claim_quest's own key space (a bare quest id).
--
-- ── AND AN IDEMPOTENCY KEY ON TOP ──────────────────────────────────────────
-- The once-guard alone answers a retry with `already_claimed`, which is correct
-- but leaves an interrupted caller unable to tell "someone else claimed it"
-- from "my own request landed and the response was lost". p_idem caches the
-- ORIGINAL envelope in player_intents (the hr_farm_plant pattern), so a retry
-- replays the exact success. ≤20 claims per player per week; the row is cheap.
--
-- ── WHAT THIS FILE DOES *NOT* PUT IN THE DAILY BUDGET, AND WHY ─────────────
-- gold_in / xp_in / qty_in / gems_in are journalled as 0 — the muster/raid
-- chest and b414 rule for a FIXED, once-per-period, server-catalogued reward.
-- The ceiling is structural rather than budgeted, and it is small enough to
-- state: every daily goal claimed = 2,450 gold + 2 gems/day; every weekly goal
-- claimed = 24,900 gold + 14 gems/week. Both are bounded by the catalogue and
-- by the once-guard, not by a clamp that could be argued with.
--
-- ── GOALS THIS BUILD CANNOT CREDIT, NAMED RATHER THAN FAKED ────────────────
--   wk_bury ("Bury 150 bones") is ABSENT from the catalogue and answers
--   `unknown_goal`. legacy.js buryBones() is a pure client function
--   (removeItem + addXp + G.stats.buried) with NO server path at all: no
--   intent, no RPC, no settle. The `bury_bones` ARTISAN recipe is a different
--   action on the prayer bench, and BENCH_COUNTERS has no `prayer` row, so it
--   stamps nothing either. There is therefore no server number to verify it
--   against, and a goal that pays 1,800 gold + 500 XP on an unverifiable client
--   counter is a mint. It refuses honestly until burying is server-settled.
--
--   ⚠ TWO CATALOGUED REWARDS ARE PHANTOM IN THE AUTHORED DATA and are carried
--     verbatim rather than silently corrected (game data is the Designer's):
--       · xp {"combat": …} on kill_any / kill_more / wk_kills — 'combat' is not
--         a skill_id (hr_skills has attack/strength/…; combat is a DERIVED
--         level). The client's addXp('combat') has been inventing a phantom
--         G.skills.combat all along.
--       · items {"small_bones": 5} on gold_500 — no such item id exists
--         anywhere in src/data/items.js (the real ids are bones / big_bones /
--         dragon_bones). gold_500 also pays 0 gold, so its ENTIRE reward is
--         unmintable and the RPC answers `reward_unavailable` rather than
--         burning the player's once-per-day claim on nothing.
--     Unmintable components are skipped, REPORTED in the response
--     (`skipped_xp` / `skipped_items`) and journalled in meta. §8 raises a
--     NOTICE naming every one of them at apply time, and
--     tests/modal-goal-claim.mjs fails the build if a NEW one appears.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_skills')   is null then raise exception 'player_skills missing'; end if;
  if to_regclass('public.player_inventory') is null then raise exception 'player_inventory missing'; end if;
  if to_regclass('public.player_intents')  is null then raise exception 'player_intents missing'; end if;
  if to_regclass('public.hr_items')  is null then raise exception 'hr_items missing — apply the catalogue first'; end if;
  if to_regclass('public.hr_skills') is null then raise exception 'hr_skills missing — apply the catalogue first'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key(timestamptz) not found';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply the rate-gate chain first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection not found — refusals would be unobservable';
  end if;
end $$;

-- ── 1. player_ledger.kind must admit 'daily' (additive, idempotent) ────────
-- 2026-08-20-goal-reward-rpc-credit.sql added it; restated here so this file
-- can be applied against a database that has not run that one.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''daily''%'
  ) then
    alter table public.player_ledger drop constraint if exists player_ledger_kind_check;
    alter table public.player_ledger add constraint player_ledger_kind_check
      check (kind = any (array['accrue','craft','gather','combat','farm','trade','shop',
                               'quest','equip','admin','iap','clan','raid','enchant','daily',
                               'bounty','worker','bank']));
    raise notice 'player_ledger.kind widened to admit ''daily''';
  end if;
end $$;

-- ── 2. THE WEEK, DERIVED ───────────────────────────────────────────────────
-- Monday-aligned, zero-padded, sortable, 8 chars (hr_apply's period ceiling is
-- 16). IMMUTABLE on a date input, STABLE through now(). `"W"` is a to_char
-- literal-text escape, not a pattern.
create or replace function public.hr_iso_week_key(p_at timestamptz default now())
returns text language sql stable set search_path = pg_catalog as $$
  select to_char((p_at at time zone 'utc')::date, 'IYYY-"W"IW')
$$;
comment on function public.hr_iso_week_key(timestamptz) is
  'ISO (Monday-aligned) week key, e.g. 2026-W35. NOT hr_utc_week_key, which rolls over on a Thursday.';

-- The seven hr_utc_day_key values of p_at''s ISO week, Monday first. This is the
-- ONLY place the day/week relationship is expressed, so a weekly total can
-- never be summed over a different seven days than the counters were filed on.
create or replace function public.hr_goal_week_days(p_at timestamptz default now())
returns text[] language sql stable set search_path = public, pg_catalog as $$
  select array(
    select public.hr_utc_day_key(
             ((date_trunc('week', (p_at at time zone 'utc'))::date + i)::timestamp at time zone 'utc'))
      from generate_series(0, 6) as i)
$$;

-- The instant a period began, for the ledger-derived gold counter.
create or replace function public.hr_goal_period_start(p_weekly boolean, p_at timestamptz default now())
returns timestamptz language sql stable set search_path = pg_catalog as $$
  select case when coalesce(p_weekly, false)
              then (date_trunc('week', (p_at at time zone 'utc')) at time zone 'utc')
              else (date_trunc('day',  (p_at at time zone 'utc')) at time zone 'utc') end
$$;

revoke execute on function public.hr_iso_week_key(timestamptz)              from public, anon, authenticated, service_role;
revoke execute on function public.hr_goal_week_days(timestamptz)            from public, anon, authenticated, service_role;
revoke execute on function public.hr_goal_period_start(boolean, timestamptz) from public, anon, authenticated, service_role;

-- ── 3. THE CATALOGUE — hr_goal_rewards ─────────────────────────────────────
-- The goal, its target, the counter it is verified against, and what it pays.
-- Seeded from legacy.js DAILY_GOAL_POOL + DAILY_REWARDS + WEEKLY_GOAL_POOL and
-- BOUND to them by tests/modal-goal-claim.mjs, which fails the build on any
-- disagreement in either direction. No game magnitude is invented here.
--
-- counter_kind:
--   'daily'       a period counter in player_progress(kind='daily'). A daily
--                 goal reads TODAY's row; a weekly goal reads the SUM over the
--                 ISO week's seven day keys.
--   'ledger_gold' DERIVED from player_ledger: sum(gold) where gold > 0 since
--                 the period start. Deliberately not a stamped counter — gold
--                 arrives from the accrual engine, vendor sales, market sales,
--                 farm harvests, chests and claims, and a stamp on one of those
--                 paths would tell a player who earned 50,000 gold on the
--                 market that they had earned none. The ledger is the one place
--                 every gold movement is already recorded, so it is the honest
--                 source. A gold credit that fails to journal a positive `gold`
--                 UNDER-credits the goal; it can never over-credit it.
create table if not exists public.hr_goal_rewards (
  goal_id      text primary key,
  weekly       boolean not null,
  counter_kind text    not null check (counter_kind in ('daily', 'ledger_gold')),
  counter_key  text    not null check (length(counter_key) between 1 and 64),
  target       bigint  not null check (target > 0),
  gold         bigint  not null default 0 check (gold >= 0),
  gems         bigint  not null default 0 check (gems >= 0),
  xp           jsonb   not null default '{}'::jsonb check (jsonb_typeof(xp) = 'object'),
  items        jsonb   not null default '{}'::jsonb check (jsonb_typeof(items) = 'object')
);

-- RLS on, NO policy, and every client grant revoked: this catalogue is read by
-- SECURITY DEFINER functions only. The client gets the same numbers through
-- hr_goal_state, which returns them alongside the player's own progress — one
-- read instead of a table the client has to join against itself.
-- "revoke all", NOT "revoke insert, update, delete" (Security C1): Supabase's
-- default ACL on public also grants TRUNCATE, REFERENCES and TRIGGER, and
-- TRUNCATE bypasses row-level security entirely.
alter table public.hr_goal_rewards enable row level security;
revoke all on public.hr_goal_rewards from public, anon, authenticated, service_role;

-- Refilled wholesale: this file OWNS the whole table.
delete from public.hr_goal_rewards;
insert into public.hr_goal_rewards
  (goal_id, weekly, counter_kind, counter_key, target, gold, gems, xp, items)
values
  -- ── DAILY (legacy.js DAILY_GOAL_POOL × DAILY_REWARDS) ────────────────────
  ('kill_any',    false, 'daily',       'ev:kill_any',  10,   200, 0, '{"combat":50}',      '{}'),
  ('kill_more',   false, 'daily',       'ev:kill_any',  30,   600, 1, '{"combat":200}',     '{}'),
  ('gather_logs', false, 'daily',       'ev:chopped',   25,   250, 0, '{"woodcutting":100}','{}'),
  ('mine_ore',    false, 'daily',       'ev:mined',     25,   250, 0, '{"mining":100}',     '{}'),
  ('cook',        false, 'daily',       'ev:cooked',     5,   200, 0, '{"cooking":80}',     '{}'),
  ('fish',        false, 'daily',       'ev:fished',    15,   250, 0, '{"fishing":100}',    '{}'),
  ('gold_500',    false, 'ledger_gold', 'gold',        500,     0, 0, '{}',                 '{"small_bones":5}'),
  ('plant',       false, 'daily',       'ev:planted',      5,   200, 0, '{"farming":80}',     '{}'),
  ('level_up',    false, 'daily',       'ev:levelups',    1,   500, 1, '{}',                 '{}'),
  -- ── WEEKLY (legacy.js WEEKLY_GOAL_POOL; wk_bury excluded — see the header) ─
  ('wk_kills',    true,  'daily',       'ev:kill_any',   100,  2500, 3, '{"combat":1000}',    '{}'),
  ('wk_smith',    true,  'daily',       'ev:smithed',     60,  2200, 0, '{"smithing":600}',   '{}'),
  ('wk_craft',    true,  'daily',       'ev:crafted',     60,  2200, 0, '{"crafting":600}',   '{}'),
  ('wk_harvest',  true,  'daily',       'ev:harvest',    120,  2000, 0, '{"farming":600}',    '{}'),
  ('wk_rare',     true,  'daily',       'ev:rare_drops',    5,  3000, 4, '{}',                 '{}'),
  ('wk_gold',     true,  'ledger_gold', 'gold',        50000,  2500, 2, '{}',                 '{}'),
  ('wk_gather',   true,  'daily',       'ev:mined',      250,  2000, 0, '{"mining":500}',     '{}'),
  ('wk_logs',     true,  'daily',       'ev:chopped',    250,  2000, 0, '{"woodcutting":500}','{}'),
  ('wk_cook',     true,  'daily',       'ev:cooked',      50,  1500, 0, '{"cooking":400}',    '{}'),
  ('wk_levels',   true,  'daily',       'ev:levelups',      5,  5000, 5, '{}',                 '{}');

-- ── 4. hr_rpc_gate — PROGRAMMATIC additive patch (two buckets) ─────────────
-- The 2026-08-28-client-state.sql idiom: pg_get_functiondef + a guarded string
-- replace, so this file never restates a body it did not author and can never
-- silently delete another file's bucket. Idempotent; refuses to patch blind.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant; see §5's note
  if position('''hr_claim_goal''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_claim_goal — patch skipped'; return;
  end if;
  if position('else return false;' || chr(10) || '  end case;' in v_src) = 0 then
    raise exception 'hr_rpc_gate case terminator anchor not found — refusing to patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    -- 12/min: a claim is a handful per day. 120/min for the read, which the
    -- modal re-renders on open and after each claim.
    'when ''hr_claim_goal'' then v_limit := 12;' || chr(10) ||
    '    when ''hr_goal_state'' then v_limit := 120;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 5. hr_farm_plant — PROGRAMMATIC additive patch (the ev:planted counter) ──
-- "Plant 5 crops" is the one modal goal whose action is settled entirely in
-- SQL, so its counter has to be stamped where the plant happens. Same
-- programmatic idiom as §4: never restate a body this file did not author.
-- FAILS CLOSED — a missing anchor aborts the migration rather than shipping a
-- goal that can never complete.
-- The anchor is the WHOLE skills-upsert statement, not one of its lines, so the
-- insertion point is unambiguous and no half-statement can be left dangling.
do $$
declare
  v_src text; v_new text;
  c_anchor constant text :=
    'insert into public.player_skills as sk (user_id, slot, skill_id, xp)' || chr(10) ||
    '    values (v_uid, p_slot, ''farming'', c_plant_xp)' || chr(10) ||
    '    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;';
begin
  if to_regprocedure('public.hr_farm_plant(int,int,text,uuid)') is null then
    raise exception 'hr_farm_plant(int,int,text,uuid) is absent — apply '
                    '2026-08-22-server-farming-complete.sql first. The ''plant'' daily is verified '
                    'against a counter only that RPC can stamp, so shipping without it would ship a '
                    'goal that can never complete.';
  end if;
  select pg_get_functiondef('public.hr_farm_plant(int,int,text,uuid)'::regprocedure) into v_src;
  -- CR-tolerant: a body applied from a CRLF working copy stores CRLF, and an
  -- LF-joined anchor would then miss every line. Stripping CR is also a
  -- normalisation — hr_farm_plant is on no derivation chain, so no guard
  -- compares its bytes against a predecessor.
  v_src := replace(v_src, chr(13), '');
  if position('''ev:planted''' in v_src) > 0 then
    raise notice 'hr_farm_plant already stamps ev:planted — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_farm_plant patch anchor did not match exactly once — refusing to patch blind. '
                    'Re-apply 2026-08-22-server-farming-complete.sql, then this file.';
  end if;
  v_new := replace(v_src, c_anchor, c_anchor || chr(10) || chr(10) ||
    '  -- b461: the PLANT goal counter (src/core/goals.js daily shape). One plant' || chr(10) ||
    '  -- per call, additive, state ''active'', period = the UTC day planted. The' || chr(10) ||
    '  -- quest modal''s "Plant 5 crops" daily is verified against this row and' || chr(10) ||
    '  -- nothing else; there is no lifetime twin because no quest reads one.' || chr(10) ||
    '  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)' || chr(10) ||
    '    values (v_uid, p_slot, ''daily'', ''ev:planted'', 1, public.hr_utc_day_key(now()), ''active'')' || chr(10) ||
    '    on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '      do update set value = public.player_progress.value + excluded.value,' || chr(10) ||
    '                    state = ''active'', updated_at = now();');
  execute v_new;
  raise notice 'hr_farm_plant patched: stamps daily ev:planted';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree).
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;

-- ── 6. hr_claim_goal__ungated — verify, consume, credit, journal ───────────
create or replace function public.hr_claim_goal__ungated(
  p_goal_id text, p_weekly boolean, p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_goal_rewards%rowtype;
  v_state  public.player_state%rowtype;
  v_cached jsonb;
  v_period text;
  v_have   bigint := 0;
  v_rows   int;
  v_days   text[];
  v_xp_ok    jsonb := '{}'::jsonb;
  v_xp_skip  jsonb := '{}'::jsonb;
  v_it_ok    jsonb := '{}'::jsonb;
  v_it_skip  jsonb := '{}'::jsonb;
  v_k text; v_v text; v_n bigint;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'not_signed_in');
  end if;

  -- IDEMPOTENCY: a retry replays the original envelope verbatim. Read first,
  -- before anything that could change state or consume rate budget.
  if p_idem is not null then
    select result into v_cached from public.player_intents
      where user_id = v_uid and intent_id = p_idem;
    if v_cached is not null then return v_cached; end if;
  end if;

  -- THE SERVER CATALOGUE. An id it does not carry is refused, never paid.
  select * into v_cat from public.hr_goal_rewards where goal_id = p_goal_id;
  if v_cat.goal_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'unknown_goal',
      jsonb_build_object('goal', p_goal_id), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'unknown_goal',
      'goal', p_goal_id);
  end if;
  -- The CATALOGUE decides which pool a goal is in. p_weekly is a cross-check:
  -- a disagreement means the client and the server hold different ideas of what
  -- this goal is, which is worth surfacing rather than quietly resolving.
  if p_weekly is not null and p_weekly is distinct from v_cat.weekly then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'wrong_period',
      'goal', p_goal_id, 'weekly', v_cat.weekly);
  end if;

  -- The character must be one of the caller's own, and locking it here
  -- serialises every concurrent claim for this character behind one row.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_state.user_id is null then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'no_character',
      'slot', v_slot);
  end if;

  v_period := case when v_cat.weekly then public.hr_iso_week_key(now())
                   else public.hr_utc_day_key(now()) end;
  if coalesce(v_period, '') = '' then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'no_period_key');
  end if;

  -- ── VERIFY COMPLETION FROM THE SERVER'S OWN NUMBERS ────────────────────
  if v_cat.counter_kind = 'ledger_gold' then
    select coalesce(sum(gold), 0) into v_have
      from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and gold > 0
       and at >= public.hr_goal_period_start(v_cat.weekly, now());
  elsif v_cat.weekly then
    v_days := public.hr_goal_week_days(now());
    select coalesce(sum(value), 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = any (v_days);
  else
    select coalesce(value, 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = v_period;
  end if;
  v_have := coalesce(v_have, 0);
  if v_have < v_cat.target then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'not_complete',
      jsonb_build_object('goal', p_goal_id, 'have', v_have, 'target', v_cat.target), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'not_complete',
      'goal', p_goal_id, 'have', v_have, 'target', v_cat.target, 'period', v_period);
  end if;

  -- ── PLAN THE MINT (pure reads, BEFORE the consume) ─────────────────────
  -- An id the server catalogue does not know is skipped and REPORTED, never
  -- minted and never fatal: a cosmetic id must not cost a player their claim.
  for v_k, v_v in select key, value from jsonb_each_text(v_cat.xp) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_skills where skill_id = v_k) then
      v_xp_ok := v_xp_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_xp_skip := v_xp_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;
  for v_k, v_v in select key, value from jsonb_each_text(v_cat.items) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_items where item_id = v_k) then
      v_it_ok := v_it_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_it_skip := v_it_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;

  -- NOTHING TO PAY → refuse BEFORE the consume, so the claim stays claimable
  -- once the authored id is fixed. Burning a once-per-period claim on an empty
  -- reward is the same defect as the dead button this file exists to remove.
  if v_cat.gold = 0 and v_cat.gems = 0 and v_xp_ok = '{}'::jsonb and v_it_ok = '{}'::jsonb then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'reward_unavailable',
      jsonb_build_object('goal', p_goal_id, 'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'reward_unavailable',
      'goal', p_goal_id, 'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip);
  end if;

  -- ── CONSUME (once-guard). A replay is refused BEFORE any credit. ───────
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'quest', 'goal:' || v_cat.goal_id, 1, v_period, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'outcome', 'already_claimed', 'error', 'already_claimed',
      'goal', p_goal_id, 'period', v_period);
  end if;

  -- ── CREDIT — every half of the reward, one transaction ─────────────────
  update public.player_state
     set gold = coalesce(gold, 0) + v_cat.gold,
         gems = coalesce(gems, 0) + v_cat.gems,
         version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;

  for v_k, v_v in select key, value from jsonb_each_text(v_xp_ok) loop
    insert into public.player_skills as sk (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;
  end loop;

  for v_k, v_v in select key, value from jsonb_each_text(v_it_ok) loop
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  end loop;

  -- ONE journal row, never one per component. gold_in/xp_in/qty_in/gems_in are
  -- 0: a fixed, once-per-period, server-catalogued reward is kept OUT of the
  -- accrual inflow budget (the muster/raid-chest and b414 rule). The header
  -- states the structural ceiling that replaces it.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'daily', 'goal_claim:' || v_period || ':' || v_cat.goal_id,
     v_cat.gold, 0, 0, 0, 0,
     jsonb_build_object('goal', v_cat.goal_id, 'weekly', v_cat.weekly, 'period', v_period,
       'counter_kind', v_cat.counter_kind, 'counter_key', v_cat.counter_key,
       'target', v_cat.target, 'have', v_have,
       'gems', v_cat.gems, 'xp', v_xp_ok, 'items', v_it_ok,
       'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip));

  v_result := jsonb_build_object('ok', true, 'outcome', 'applied', 'credited', true,
    'goal', v_cat.goal_id, 'weekly', v_cat.weekly, 'period', v_period, 'slot', v_slot,
    'have', v_have, 'target', v_cat.target,
    'gold', v_cat.gold, 'gems', v_cat.gems, 'xp', v_xp_ok, 'items', v_it_ok,
    'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip);

  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, 'goal_claim', v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;
  return v_result;
end $$;

-- ── 7. hr_goal_state__ungated — the client's ONLY progress source ──────────
-- Without this the modal would still decide "Claim" from its own local stats,
-- and a client that thinks a goal is done while the server does not is the SAME
-- dead button, wearing a different hat. One read returns, per catalogued goal:
-- the target, the server's own progress, whether it is already claimed, and
-- what it pays. No player number is authored anywhere in it.
create or replace function public.hr_goal_state__ungated(p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_day   text := public.hr_utc_day_key(now());
  v_week  text := public.hr_iso_week_key(now());
  v_days  text[] := public.hr_goal_week_days(now());
  v_gold_day  bigint;
  v_gold_week bigint;
  v_out   jsonb := '[]'::jsonb;
  r       record;
  v_have  bigint;
  v_period text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- Two ledger sums, once, rather than one per gold-goal.
  select coalesce(sum(gold), 0) into v_gold_day from public.player_ledger
   where user_id = v_uid and slot = v_slot and gold > 0
     and at >= public.hr_goal_period_start(false, now());
  select coalesce(sum(gold), 0) into v_gold_week from public.player_ledger
   where user_id = v_uid and slot = v_slot and gold > 0
     and at >= public.hr_goal_period_start(true, now());

  for r in select * from public.hr_goal_rewards order by weekly, goal_id loop
    v_period := case when r.weekly then v_week else v_day end;
    if r.counter_kind = 'ledger_gold' then
      v_have := case when r.weekly then v_gold_week else v_gold_day end;
    elsif r.weekly then
      select coalesce(sum(value), 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'daily'
         and key = r.counter_key and period_key = any (v_days);
    else
      select coalesce(value, 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'daily'
         and key = r.counter_key and period_key = v_day;
    end if;
    v_out := v_out || jsonb_build_object(
      'goal_id', r.goal_id, 'weekly', r.weekly, 'period', v_period,
      'target', r.target, 'have', coalesce(v_have, 0),
      'complete', coalesce(v_have, 0) >= r.target,
      'claimed', exists (select 1 from public.player_progress
                          where user_id = v_uid and slot = v_slot and kind = 'quest'
                            and key = 'goal:' || r.goal_id and period_key = v_period),
      'gold', r.gold, 'gems', r.gems, 'xp', r.xp, 'items', r.items);
  end loop;

  return jsonb_build_object('ok', true, 'slot', v_slot, 'day_key', v_day,
    'week_key', v_week, 'goals', v_out);
end $$;

-- ── 8. Gated wrappers + grants (revoke before grant) ───────────────────────
-- ⚠ p_idem CARRIES A DEFAULT, AND THAT IS LOAD-BEARING, NOT TIDINESS.
--   PostgREST resolves an RPC by the NAMED ARGUMENTS in the POST body: a client
--   that posts {p_goal_id, p_weekly, p_slot} against a four-argument function
--   with no default gets PGRST202 "could not find the function" — a 404 that
--   looks exactly like "the migration was never applied". src/net/goal-claim.js
--   `claimGoal` posts the three-argument form today, so without the DEFAULT this
--   whole feature would deploy green and do nothing. §9(c) asserts the default
--   is present rather than trusting this comment.
create or replace function public.hr_claim_goal(
  p_goal_id text, p_weekly boolean, p_slot int, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_goal') then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_goal__ungated($1, $2, $3, $4);
end $w$;

create or replace function public.hr_goal_state(p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_goal_state') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_goal_state__ungated($1);
end $w$;

revoke execute on function public.hr_claim_goal__ungated(text, boolean, int, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_goal_state__ungated(int)                       from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_goal(text, boolean, int, uuid)           from public, anon, authenticated, service_role;
revoke execute on function public.hr_goal_state(int)                                from public, anon, authenticated, service_role;
grant execute on function public.hr_claim_goal(text, boolean, int, uuid) to authenticated;
grant execute on function public.hr_goal_state(int)                      to authenticated;

-- ── 8b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_claim_goal', 'hr_goal_state') and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_claim_goal', 'p_goal_id text, p_weekly boolean, p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-08-23 (b461): server-verified quest-MODAL goal reward — gold+gems+xp+items'),
    ('hr_goal_state', 'p_slot integer', 'authenticated',
     'added 2026-08-23 (b461): read-only server progress for the quest modal (own character only)');
end $$;

-- ── 9. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. The apply is atomic, so
-- a raise here reverts everything above it. Row-writing probes live in an
-- HR819-discarded subtransaction (player_ledger's retention guard refuses to
-- DELETE a fresh row, so the subtxn rollback is the only clean teardown).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000e1-0000-0000-0000-0000000000e1';
  v_slot constant int  := 0;
  v_day  text := public.hr_utc_day_key(now());
  v_week text := public.hr_iso_week_key(now());
  v_days text[] := public.hr_goal_week_days(now());
  v_g0 bigint; v_g1 bigint; v_gem bigint; v_xp bigint; v_qty bigint; v_led int;
  v_txt text;
begin
  -- (a) THE WEEK IS MONDAY-ALIGNED and its day set is the week's seven days.
  if public.hr_iso_week_key(timestamptz '2026-08-24 00:00:00+00') <> '2026-W35'
     or public.hr_iso_week_key(timestamptz '2026-08-23 23:59:59+00') <> '2026-W34' then
    raise exception 'GATE(a): hr_iso_week_key does not roll over at Monday 00:00 UTC (% / %)',
      public.hr_iso_week_key(timestamptz '2026-08-24 00:00:00+00'),
      public.hr_iso_week_key(timestamptz '2026-08-23 23:59:59+00');
  end if;
  if array_length(v_days, 1) <> 7 then
    raise exception 'GATE(a): hr_goal_week_days returned % keys, expected 7', array_length(v_days, 1);
  end if;
  if not (v_day = any (v_days)) then
    raise exception 'GATE(a): today (%) is not in its own week day set % — a daily counter '
                    'would never be summed into its weekly total', v_day, v_days;
  end if;
  if public.hr_goal_week_days(timestamptz '2026-08-26 12:00:00+00')
     is distinct from array['2026-8-24','2026-8-25','2026-8-26','2026-8-27','2026-8-28','2026-8-29','2026-8-30'] then
    raise exception 'GATE(a): the week day set is not Monday..Sunday: %',
      public.hr_goal_week_days(timestamptz '2026-08-26 12:00:00+00');
  end if;

  -- (b) THE CATALOGUE IS COHERENT.
  if (select count(*) from public.hr_goal_rewards) <> 19 then
    raise exception 'GATE(b): expected 19 catalogued goals, found %',
      (select count(*) from public.hr_goal_rewards);
  end if;
  if exists (select 1 from public.hr_goal_rewards
              where counter_kind = 'daily' and counter_key not like 'ev:%') then
    raise exception 'GATE(b): a period counter key is outside the ev: namespace: %',
      (select string_agg(counter_key, ', ') from public.hr_goal_rewards
        where counter_kind = 'daily' and counter_key not like 'ev:%');
  end if;
  if exists (select 1 from public.hr_goal_rewards
              where counter_kind = 'ledger_gold' and counter_key <> 'gold') then
    raise exception 'GATE(b): a ledger_gold goal names a counter_key other than ''gold''';
  end if;
  if exists (select 1 from public.hr_goal_rewards where goal_id = 'wk_bury') then
    raise exception 'GATE(b): wk_bury is catalogued, but burying has NO server path — it would pay '
                    'against a client-only counter. Remove it, or make buryBones a server intent.';
  end if;
  -- Phantom reward components: NAMED, not hidden. A notice, not a failure —
  -- the data is the Designer's and the RPC skips them safely.
  select string_agg(t.k, ', ') into v_txt from (
    select distinct e.key as k from public.hr_goal_rewards g,
           lateral jsonb_each_text(g.xp) e
     where not exists (select 1 from public.hr_skills s where s.skill_id = e.key)) t;
  if v_txt is not null then
    raise notice 'b461: reward XP names % — not a skill_id; those grants are SKIPPED and reported', v_txt;
  end if;
  select string_agg(t.k, ', ') into v_txt from (
    select distinct e.key as k from public.hr_goal_rewards g,
           lateral jsonb_each_text(g.items) e
     where not exists (select 1 from public.hr_items i where i.item_id = e.key)) t;
  if v_txt is not null then
    raise notice 'b461: reward ITEMS name % — not an item_id; those mints are SKIPPED and reported', v_txt;
  end if;

  -- (c) GRANTS: wrappers authenticated-only, inners shut out of every client role.
  if to_regprocedure('public.hr_claim_goal(text,boolean,integer,uuid)') is null
     or to_regprocedure('public.hr_goal_state(integer)') is null then
    raise exception 'GATE(c): a wrapper did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_claim_goal__ungated(text,boolean,integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_goal_state__ungated(integer)', 'execute') then
    raise exception 'GATE(c): an __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_goal(text,boolean,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_goal_state(integer)', 'execute') then
    raise exception 'GATE(c): a wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_goal(text,boolean,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_goal_state(integer)', 'execute') then
    raise exception 'GATE(c): a wrapper is anon-executable';
  end if;
  -- …and the THREE-ARGUMENT call form resolves. src/net/goal-claim.js posts
  -- {p_goal_id, p_weekly, p_slot}; PostgREST resolves by named arguments, so a
  -- p_idem with no DEFAULT answers PGRST202 and the feature ships dead.
  if coalesce((select pronargdefaults from pg_proc
                where oid = 'public.hr_claim_goal(text,boolean,integer,uuid)'::regprocedure), 0) < 1 then
    raise exception 'GATE(c): hr_claim_goal has no defaulted argument — a client posting the '
                    'three-argument form would get PGRST202 and every Claim button stays dead';
  end if;
  -- The catalogue is not client-writable, and neither is the counter it reads.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('hr_goal_rewards', 'player_progress')
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on hr_goal_rewards or player_progress — '
                    'the target or the counter would be forgeable';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'hr_goal_rewards' and cmd <> 'SELECT') then
    raise exception 'GATE(c): hr_goal_rewards grew a non-SELECT policy';
  end if;

  -- (d) THE PLANT STAMP IS REALLY IN hr_farm_plant.
  if position('''ev:planted''' in
       pg_get_functiondef('public.hr_farm_plant(int,int,text,uuid)'::regprocedure)) = 0 then
    raise exception 'GATE(d): hr_farm_plant does not stamp ev:planted — the ''plant'' daily can never complete';
  end if;

  -- (e) EXECUTED behaviour, discarded subtransaction → zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- unknown goal refused.
    v := public.hr_claim_goal__ungated('no_such_goal', false, v_slot, null);
    if v->>'error' <> 'unknown_goal' then
      raise exception 'GATE(e): an unknown goal was not refused: %', v;
    end if;
    -- a weekly flag that disagrees with the catalogue is refused.
    v := public.hr_claim_goal__ungated('kill_any', true, v_slot, null);
    if v->>'error' <> 'wrong_period' then
      raise exception 'GATE(e): a mismatched weekly flag was not refused: %', v;
    end if;
    -- incomplete refused (no counter row exists yet).
    v := public.hr_claim_goal__ungated('kill_any', false, v_slot, null);
    if v->>'error' <> 'not_complete' or (v->>'have')::bigint <> 0 then
      raise exception 'GATE(e): an incomplete goal was not refused: %', v;
    end if;

    -- meet the DAILY goal, then claim once. gather_logs pays 250 gold + 100
    -- woodcutting XP — a component of each kind that the server really owns.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:chopped', 25, v_day, 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_goal__ungated('gather_logs', false, v_slot, null);
    if coalesce(v->>'ok','') <> 'true' or v->>'outcome' <> 'applied' then
      raise exception 'GATE(e): a complete daily did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 250 then
      raise exception 'GATE(e): gather_logs credited % gold, expected 250', v_g1 - v_g0;
    end if;
    select xp into v_xp from public.player_skills
      where user_id = v_uid and slot = v_slot and skill_id = 'woodcutting';
    if coalesce(v_xp, 0) <> 100 then
      raise exception 'GATE(e): gather_logs credited % woodcutting XP, expected 100 — the XP half '
                      'of the reward is NOT server-applied', coalesce(v_xp, 0);
    end if;
    -- replay refused, nothing re-credited.
    v := public.hr_claim_goal__ungated('gather_logs', false, v_slot, null);
    if v->>'error' <> 'already_claimed' then
      raise exception 'GATE(e): a replay was not refused: %', v;
    end if;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g0 <> v_g1 then
      raise exception 'GATE(e): the replay RE-CREDITED (% -> %)', v_g1, v_g0;
    end if;

    -- IDEMPOTENCY: the same p_idem replays the ORIGINAL envelope, not a refusal.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:levelups', 1, v_day, 'active');
    select gold, gems into v_g0, v_gem from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_goal__ungated('level_up', false, v_slot,
           '00000000-0000-0000-0000-0000000000e1'::uuid);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(e): level_up did not credit: %', v;
    end if;
    v := public.hr_claim_goal__ungated('level_up', false, v_slot,
           '00000000-0000-0000-0000-0000000000e1'::uuid);
    if coalesce(v->>'ok','') <> 'true' or v->>'outcome' <> 'applied' then
      raise exception 'GATE(e): an idempotent retry did not replay the original envelope: %', v;
    end if;
    select gold, gems into v_g1, v_qty from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 500 or v_qty - v_gem <> 1 then
      raise exception 'GATE(e): the idempotent retry moved the balance (gold +%, gems +%) — '
                      'expected +500/+1 exactly once', v_g1 - v_g0, v_qty - v_gem;
    end if;

    -- WEEKLY sums the week's days, and is a SEPARATE claim from the daily that
    -- shares the counter. Spread 250 chopped across three days of this week.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:chopped', 120, v_days[1], 'active'),
             (v_uid, v_slot, 'daily', 'ev:chopped', 105, v_days[2], 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + excluded.value;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_goal__ungated('wk_logs', true, v_slot, null);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(e): the weekly total did not sum the week''s days: %', v;
    end if;
    if (v->>'period') <> v_week then
      raise exception 'GATE(e): the weekly claim was filed under period % (expected %)',
        v->>'period', v_week;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 2000 then
      raise exception 'GATE(e): wk_logs credited % gold, expected 2000', v_g1 - v_g0;
    end if;

    -- PERIOD ISOLATION: a counter filed in a DIFFERENT week does not count. Seed
    -- ev:mined only outside this week and require the weekly to refuse.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'daily', 'ev:mined', 999,
              public.hr_utc_day_key(now() - interval '14 days'), 'active');
    v := public.hr_claim_goal__ungated('wk_gather', true, v_slot, null);
    if v->>'error' <> 'not_complete' or (v->>'have')::bigint <> 0 then
      raise exception 'GATE(e): a counter from ANOTHER week leaked into this week''s total: %', v;
    end if;

    -- An entirely unmintable reward refuses BEFORE the consume, and stays claimable.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, v_slot, 'trade', 'gate_probe_gold', 900, '{}'::jsonb);
    v := public.hr_claim_goal__ungated('gold_500', false, v_slot, null);
    if v->>'error' <> 'reward_unavailable' then
      raise exception 'GATE(e): gold_500 (0 gold, phantom item) did not answer reward_unavailable: %', v;
    end if;
    if exists (select 1 from public.player_progress
                where user_id = v_uid and slot = v_slot and kind = 'quest' and key = 'goal:gold_500') then
      raise exception 'GATE(e): reward_unavailable BURNED the claim — it must stay claimable';
    end if;

    -- The read projection answers with server truth and no client number.
    v := public.hr_goal_state__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' or jsonb_array_length(v->'goals') <> 19 then
      raise exception 'GATE(e): hr_goal_state did not project all 19 goals: %', v;
    end if;
    if not exists (select 1 from jsonb_array_elements(v->'goals') g
                    where g->>'goal_id' = 'gather_logs' and (g->>'claimed')::boolean) then
      raise exception 'GATE(e): hr_goal_state does not report a claimed daily as claimed';
    end if;

    -- One ledger row per credited claim, and no more.
    select count(*) into v_led from public.player_ledger
     where user_id = v_uid and kind = 'daily' and intent like 'goal_claim:%';
    if v_led <> 3 then
      raise exception 'GATE(e): expected 3 goal-claim ledger rows, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'modal-goal-claims §9 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §9 LEAKED a probe row';
  end if;

  -- (f) grant-hygiene clean after the additions.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(f): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(f): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(f): grant-hygiene reports baseline drift: %', v_gh->'baseline_rows_no_longer_live';
      end if;
    end;
  end if;

  raise notice 'modal-goal-claims: week helpers, catalogue, grants, plant stamp, credit-once, '
               'idempotent replay, weekly summing, period isolation, empty-reward refusal all green';
end $$;
