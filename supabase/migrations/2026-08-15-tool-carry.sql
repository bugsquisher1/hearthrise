-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GATHERING TOOL CARRY GETS A SERVER HOME  (b348)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies.
--
-- Companion code: src/core/tools.js `advanceToolCarry`, src/core/skill-sim.js
-- `resolveGatherTick`, supabase/functions/hr-accrue/accrual.js `accrueGather`
-- (and its `toolCarry` contract note). Companion tests:
-- tests/accrual-engine.mjs "GATHER PARITY" and "CARRY CONTINUITY".
--
-- ── WHAT THIS IS FOR, IN ONE PARAGRAPH ──────────────────────────────────
-- A gathering tool's extra-yield chance is NOT an RNG roll. `advanceToolCarry`
-- banks `qty x toolDouble` into a per-skill FRACTION and pays out whole units
-- as they accrue, so a 10% tool pays exactly one bonus every ten actions. That
-- determinism is the whole reason an away replay is byte-identical run to run
-- — and it only survives across sessions if the remainder is STORED.
-- legacy.js:3841 renamed it out of `G._toolCarry` (which `snapshot()` skipped,
-- so it never reached the cloud) with the note "so the server has a column to
-- own when accrual moves off the client". This is that column.
--
-- ── THE COST OF NOT HAVING IT, MEASURED ─────────────────────────────────
-- `node tests/accrual-engine.mjs`, maple_tree with the best axe, 6h spans,
-- sweeping the carry across [0.1 … 0.9]: losing the carry costs 0-1 units on
-- the following span; 1 of the 9 values loses one. Small — and it is a
-- CONTINUOUS small, once per accrual per skill forever, and it is the one
-- thing standing between the server and byte-exact parity with the client.
--
-- ── THE SELF-CONFIGURING SWITCH (read this before reordering anything) ───
-- The Edge Function passes `toolCarry: st.tool_carry ?? null`. NULL means "this
-- database has no such column", and the engine then starts each span from an
-- empty carry and OMITS `tool_carry` from the delta — because hr_apply answers
-- an unknown delta key with a 409 that costs the player the whole night. So the
-- PRESENCE OF THIS COLUMN IS THE SWITCH; there is no flag anyone can forget to
-- flip, and applying this file before or after the Edge deploy is safe in
-- either order. tests/accrual-engine.mjs asserts both halves.
--
-- ── HOW THIS FILE WAS BUILT, AND WHY THAT MATTERS ───────────────────────
-- `create or replace function` is the only way to change a function body in
-- SQL, so the whole of hr_apply is restated below. It was NOT retyped: it is
-- the exact text of 2026-08-15-intent-key-hygiene.sql's hr_apply — the LATEST
-- revision, which itself was derived from 2026-08-11-apply-engine.sql —
-- extracted programmatically and patched at FOUR anchors, each of which had to
-- match exactly once:
--   (1) declare  c_delta_keys gains 'tool_carry'; c_max_carry_skills
--   (2) declare  v_carry
--   (3) step (4a-ii) validates the carry INSIDE the protected block
--   (4) the player_state UPDATE writes it
-- Everything else is verbatim, b346's C1/C3 fixes included. §0 refuses to
-- install against an hr_apply that does not carry them, which is the closest a
-- migration can get to "do not replace a body you cannot account for".
--
-- ⚠ AND THE SOURCE IS PROVEN TO BE WHAT PRODUCTION IS RUNNING, not assumed.
--   Measured 2026-08-15 against nezapsylztqbbwuwembx:
--     select md5(prosrc), length(prosrc) from pg_proc … proname='hr_apply'
--       -> 09148396a3ec92597d53eafd421e5a67, 51,916 chars
--   and the body extracted from 2026-08-15-intent-key-hygiene.sql between its
--   dollar-quote delimiters is byte-identical: same md5, same length. (The same
--   method reproduces 2026-08-11-apply-engine.sql's documented
--   917967d4bb03ca1c098b3e896a3e8317, which is the control that the extraction
--   boundary is right.) So this file cannot silently regress a fix that landed
--   after intent-key-hygiene was written. IF THAT COMPARISON EVER FAILS, DO NOT
--   APPLY: re-derive from whatever production is actually running.
--
-- ⚠ THIS FILE MUST BE THE LAST ONE THAT REPLACES hr_apply. A later file that
--   also replaces it would silently delete this change; an earlier one would be
--   silently deleted by this. That ordering lives in
--   tests/schema-apply-order.json and is enforced by the replay.
--
-- SAFE TO RE-RUN. Additive and idempotent: one `add column if not exists`, two
-- `create or replace function`, one revoke/grant set, and self-checks that roll
-- themselves back.
-- REVERSIBLE: re-apply 2026-08-15-intent-key-hygiene.sql (a `create or replace`
-- on the same signature, restoring the previous body verbatim) and, if the
-- column is genuinely unwanted, `alter table public.player_state drop column
-- tool_carry`. Dropping it is lossy — it discards at most a fraction of one
-- item per skill per character — and is NOT required to roll the code back,
-- because a body without the key simply refuses it.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────
--   · It does NOT make the carry a delta. It is the one ABSOLUTE key in the
--     contract, because the engine computes a resulting remainder from a
--     starting one and adding two remainders is arithmetic nobody defined.
--   · It does NOT clamp an out-of-range carry — it REFUSES one. A carry of 900
--     would be a 900-item mint on the first action of the next span, and
--     silently repairing an impossible value is how a compromised engine's bug
--     becomes the server's opinion.
--   · It grants no new capability. hr_apply's grants are restated unchanged:
--     hr_engine only.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ───────────────────────────────────────
do $$
declare v_src text; v_col int;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of missing — §2 replaces it';
  end if;
  if to_regclass('public.hr_skills') is null then
    raise exception 'hr_skills missing — apply 2026-08-11-catalogue.generated.sql first; the '
                    'carry validation below checks skill ids against it';
  end if;
  -- The auto-eat columns, because §2 restates hr_state_of INCLUDING them and a
  -- replace against a database without them would be a function that throws on
  -- every call.
  select count(*) into v_col from information_schema.columns
   where table_schema='public' and table_name='player_state'
     and column_name in ('auto_eat_enabled','auto_eat_food','auto_eat_pct');
  if v_col <> 3 then
    raise exception 'player_state has % of the 3 auto-eat columns — apply 2026-08-15-auto-eat.sql '
                    'first; §2 restates an hr_state_of that reads them', v_col;
  end if;

  -- ⚠ A prosrc scan is a text search, and a text search that has silently
  --   stopped matching passes forever — so it carries a CONTROL: a term that
  --   must be in any hr_apply worth the name. If the control is absent the scan
  --   is blind and this file refuses rather than reporting a clean bill.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  if v_src !~ 'version_conflict' then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND — the control term (version_conflict) is '
                    'absent from a % char body, so the checks below would pass on any database.',
                    coalesce(length(v_src), 0);
  end if;
  -- REPLACING A BODY YOU HAVE NOT READ IS THE HAZARD THIS FILE CARRIES. The
  -- text below was derived from the b346 revision. If the live body predates
  -- it, `create or replace` would silently DELETE C1 and C3.
  if v_src !~ 'v_prev_slot' then
    raise exception 'hr_apply does not carry the b346 slot comparison, so the live body is OLDER '
                    'than the one this file was derived from. Applying would delete C1/C3. Apply '
                    '2026-08-15-intent-key-hygiene.sql first.';
  end if;
  if v_src ~ 'tool_carry' then
    raise notice 'hr_apply already carries the b348 tool_carry key — this apply is a no-op re-run.';
  end if;
end $$;

-- ── 1. THE COLUMN ────────────────────────────────────────────────────────
-- jsonb rather than a table, deliberately: the carry is at most one small
-- number per gathering skill (three today), it is read on EVERY accrual as part
-- of the row hr_apply already locks, and it is written by exactly one statement.
-- A child table would add a join to the hottest read in the system to store
-- three floats. Contrast player_inventory, which IS a table because its cap is
-- `count(*)` and its constraint is per row.
--
-- NOT NULL DEFAULT '{}' so `st.tool_carry ?? null` in the Edge Function can
-- never see a null on a database that HAS the column — the null is reserved to
-- mean "no column", and a nullable column would make the switch ambiguous.
alter table public.player_state
  add column if not exists tool_carry jsonb not null default '{}'::jsonb;

-- The shape, enforced by the database and not only by the engine. `hr_apply`
-- validates the range per skill; this makes the CONTAINER a fact, so no future
-- writer can put an array or a scalar here.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_tool_carry_object') then
    alter table public.player_state
      add constraint player_state_tool_carry_object
      check (jsonb_typeof(tool_carry) = 'object');
  end if;
end $$;

-- ── 2. hr_state_of — the envelope grows by ONE key ───────────────────────
-- REPLACED VERBATIM from 2026-08-15-auto-eat.sql §3 with `tool_carry` added to
-- `state`. Everything else — including the VOLATILE marker, which apply-engine
-- §6(f) asserts and which a `create or replace` would silently drop if it were
-- omitted — is unchanged. §5 re-asserts the full key list, so a bad
-- transcription fails this migration instead of shortening the client's world.
create or replace function public.hr_state_of(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_st public.player_state%rowtype;
begin
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      'tool_carry', v_st.tool_carry),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
         limit 1001) t),
    'total_level', public.hr_total_level(p_user, v_st.slot)
  );
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. hr_apply — the whole body, restated with four patched anchors ─────
-- Patches, in order of appearance:
--   (1) declare  c_delta_keys gains 'tool_carry'; c_max_carry_skills
--   (2) declare  v_carry
--   (3) step (4a-ii) validates the carry, inside the protected block
--   (4) the player_state UPDATE writes it
-- Everything else is verbatim.

create or replace function public.hr_apply(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- BLAST-RADIUS CLAMPS. NOT balance, NOT player-facing. They are the blast
  -- radius if an Edge Function is ever wrong or compromised, exactly as the
  -- clamps in clan_deposit (2026-08-08-clan-seat.sql:530) are. Set far above
  -- honest play.
  --
  -- ── WHAT THESE CLAMPS ACTUALLY BUY, STATED HONESTLY (Security, 2026-08-11) ──
  -- The flattering version of this control is "one compromised call cannot max
  -- a skill from zero". That is TRUE at 5,000,000 and at 12,000,000 and it is
  -- nearly WORTHLESS, because nothing limits a compromised engine to one call:
  -- hr_rate_gate allows 30 accrues/minute, so the reachable rate is 150M XP/min
  -- at 5M and 360M XP/min at 12M. Against an attacker with the engine, the
  -- per-call clamp is a speed bump measured in seconds either way.
  --
  -- What it DOES buy, and the reason it is worth having:
  --   1. It stops a single bad delta from an HONEST-BUT-BUGGY engine. The
  --      `interval_ms` class is the live example: one request field taken from
  --      the client turns a 12h absence into ~43.2M ticks instead of ~18,000 —
  --      a ~2400x mint that proposes roughly 6.8 BILLION XP. That is refused
  --      identically at 5M and at 12M. Almost every real defect looks like
  --      this: not "slightly too much", but three orders of magnitude too much.
  --   2. It keeps ledger rows small-grained, so anomaly detection has something
  --      to detect. A clamp is also a bucket size.
  --
  -- ⚠ A clamp rejection is therefore NOT automatically an incident. Before the
  --   degrade ladder in hr-accrue/index.ts it was closer to one — a rejection
  --   rolled back the watermark with the payment and bricked accrual. It is now
  --   recoverable, and honest play at maximum gear over a 24h cap can approach
  --   these numbers on its own. Read a rejection as EITHER an incident OR a
  --   balance change that outgrew its blast radius, and check
  --   tests/accrual-engine.mjs' clamp-headroom report before assuming which.
  --
  -- c_max_xp_delta: 5,000,000 -> 12,000,000 on 2026-08-11 (Security ruling).
  --   At 5M the worst honest case measured by clampGuard was inside the 60%
  --   HEADROOM line but close enough that a single balance change would fire
  --   it; at 12M the same worst case is ~23.6%. HEADROOM stays at 0.60 in
  --   tests/accrual-engine.mjs — moving BOTH the clamp and the line is how you
  --   arrive at a guard that structurally cannot fire. Only this one clamp
  --   moved; gold, items, kinds and progress all have real margin already.
  --   The surviving property is asserted, not documented: clampGuard requires
  --   c_max_xp_delta < 13,034,431 = xpForLevel(99), i.e. one call can still
  --   never carry a skill from 0 to the level cap.
  c_max_gold_delta   constant bigint := 50000000;   -- per call
  c_max_gem_delta    constant bigint := 100000;     -- per call  (review S5)
  c_max_item_delta   constant bigint := 1000000;    -- per item per call
  c_max_xp_delta     constant bigint := 12000000;   -- per skill per call (see above)
  c_max_item_kinds   constant int    := 200;
  c_max_equip_kinds  constant int    := 32;
  c_max_farm_ops     constant int    := 64;
  c_max_progress_ops constant int    := 64;
  c_max_progress_add constant bigint := 1000000;
  c_delta_keys constant text[] := array[
    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    'farm','progress','progress_claim','journal',
    -- b348: the deterministic gathering tool carry. See the block at (4a-ii).
    'tool_carry'];
  -- The carry is a FRACTION of one item per skill, so its whole legal range is
  -- [0,1). A ceiling on the number of skills is a ceiling on the row size.
  c_max_carry_skills constant int := 32;
  c_ledger_kinds constant text[] := array[
    'accrue','craft','gather','combat','farm','trade','shop',
    'quest','equip','admin','iap','clan','raid'];

  v_uid   uuid;
  v_role  text;
  v_prev_intent text;
  v_this_intent text;
  -- b346. The slot a key was CLAIMED on, and whether THIS call is the one that
  -- claimed it. The first lets step (3) refuse a cross-slot reuse; the second
  -- lets step (5) release a key it claimed itself. Both are explained at their
  -- use sites — this is only where they live.
  v_prev_slot   int;
  v_claimed     boolean := false;
  v_slot  int  := coalesce(p_slot, 0);
  v_st    public.player_state%rowtype;
  v_j     jsonb;
  v_out   jsonb;
  v_prev  jsonb;
  v_kind  text;
  v_msg   text; v_det text; v_sqlstate text;
  k text; v_n bigint; v_have bigint; v_stacks int;
  v_eq    jsonb; v_item text; v_cur text;
  v_plot  jsonb; v_prog jsonb;
  v_new_gold bigint; v_new_gems bigint;
  v_act   jsonb; v_accrued timestamptz; v_rows int;
  v_meta  jsonb;
  v_carry jsonb;
  -- THE DAILY BUDGET (C5/X3). Gross inflow proposed by THIS delta, per
  -- dimension. Computed here from the delta, never accepted from the caller —
  -- there is no delta key for them and the ledger has no client write grant, so
  -- a compromised engine cannot understate its own consumption.
  -- See supabase/migrations/2026-08-11-daily-budget.sql for the whole design.
  v_gold_in bigint := 0; v_xp_in bigint := 0; v_qty_in bigint := 0;
  v_bud   jsonb;
begin
  -- ── (0) THE IDENTITY SEAM (review S1) ──────────────────────────────────
  -- hr_apply is granted to exactly one role. `hr_engine` may act for a user it
  -- names, because it has already verified that user's JWT and it holds no
  -- table privilege of its own. Nobody else may name a user at all.
  --
  -- ⚠ current_user IS NOT THE CALLER HERE. Inside a SECURITY DEFINER function
  --   current_user is the function's OWNER (postgres), so a `current_user =
  --   'hr_engine'` test can never be true — verified on the database, not
  --   assumed. The GUC set by PostgREST's `SET LOCAL ROLE <jwt.role>` does
  --   survive the definer boundary, and that is what is read below.
  --
  --   The GUC is a SECONDARY check. The PRIMARY control is the GRANT: hr_apply
  --   is executable by hr_engine and by nothing else a request can arrive as,
  --   so reaching this line at all already means the caller is the engine (or
  --   the owner, running a migration or a test). The GUC test exists so that
  --   an owner-context call — a psql session, a future admin script — cannot
  --   silently act as an arbitrary user without saying so.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      -- Recorded even though it never reaches the protected block: this is the
      -- single most interesting thing anyone can do to this function. (R4.)
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;
  -- Unknown top-level keys are an error, not a shrug. A delta key that this
  -- function does not implement must never look like it worked.
  if exists (select 1 from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (c_delta_keys)) then
    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key',
      'keys', (select jsonb_agg(dk) from jsonb_object_keys(p_delta) as t(dk)
                where dk <> all (c_delta_keys)));
    -- An unknown key means the Edge Function and this contract have diverged,
    -- or someone is probing for one that is not implemented. Both are worth
    -- knowing about tomorrow, not just for the next 24 hours. (R4.)
    perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'unknown_delta_key',
      jsonb_build_object('keys', v_out->'keys'));
    return v_out;
  end if;

  -- ── (1) Rate limit. OUTSIDE the protected block on purpose: a rejected call
  --        must still consume budget, otherwise "spam invalid deltas" is a free
  --        denial of service against the engine.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    -- (C2) Recorded BEFORE the return, and before the intent claim, because
    -- otherwise a rate-limited caller leaves no durable trace anywhere: the
    -- early return happens ahead of player_intents, and player_intents is
    -- pruned after 24h regardless. Sustained rate limiting is the loudest
    -- automation signal this server produces and it was being discarded.
    -- hr_record_rejection aggregates per (character, code, day) and promotes
    -- the row to severity 'incident' past its daily threshold, so this costs
    -- one row per player per day, not one row per rejected call.
    --
    -- (S6) …but still one WRITE per rejected call, which under the retry storm
    -- this exists to detect is a row lock plus a WAL record per request, all
    -- serialised on one tuple. So it is SAMPLED: the 1st, 10th and 50th
    -- rejection in the window, then every 1000th, each carrying the gap it
    -- stands for so `n` and the 'incident' escalation are unchanged.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (2) Serialise this character. hashtextextended over user+slot; the lock
  --        is transaction-scoped so it always releases, exception included.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY (review S8). Under the lock, so the check and the claim
  --        cannot interleave. A replay returns the FIRST answer — success or
  --        rejection — because "same key, same answer" is the contract that
  --        makes a client retry safe.
  --
  --        WHAT IS STORED IS THE DECISION, NOT THE ENVELOPE (review R5).
  --        Revision 2 stored the ENTIRE hr_state_of envelope — inventory,
  --        fifteen skills, farm plots, progress — in player_intents.result, per
  --        intent, at up to 240 applies/min/player. That is a full state
  --        snapshot roughly every quarter second per player, retained 24 hours:
  --        ~2 KB × 240 × 60 × 24 = 690 MB PER PLAYER PER DAY at the rate limit,
  --        and this repo already has the receipt for what an unbounded journal
  --        does here (game_events: 1.6M rows / 229 MB, six players, 3.45 days).
  --        Now only `{ok}` (plus the error and its detail on a rejection) is
  --        stored — tens of bytes — and a REPLAY OF A SUCCESS RE-DERIVES the
  --        current state. That is strictly better for the caller too: a retry
  --        gets fresh state and a fresh version instead of a stale snapshot it
  --        would then have to discard. The contract is unchanged and is the one
  --        that matters: the same key applies the effect exactly once.
  --
  --        ── ONE NAMESPACE, TWO KINDS OF KEY (review S6) ──────────────────
  --        `player_intents` is keyed on (user_id, intent_id) and NOTHING else,
  --        so a client-supplied uuid (market_list / market_cancel / market_buy
  --        all take p_intent_id straight from the browser) shares a namespace
  --        with keys the SERVER derives — the accrual engine's key is
  --        sha256(user, slot, watermark, …), and `accrued_to` is a value
  --        hr_load hands the client so it can render a countdown.
  --
  --        Left alone, that is a self-denial-of-service with a nasty shape: a
  --        player computes their own next accrual key, burns it with a market
  --        call, and every accrual from then on returns `replayed: true`,
  --        applies nothing, and never advances the watermark — silently, with
  --        ok:true, until hr_intents_prune deletes the row 24 hours later.
  --
  --        The fix is to notice that a replay must be a replay OF THE SAME
  --        THING. `player_intents.intent` already records what the key was
  --        claimed for; if the incoming call names a different one, this is not
  --        a retry, it is a collision — deliberate or accidental — and the
  --        honest answer is to refuse rather than to hand back someone else's
  --        decision. One comparison, and it hardens every intent in the system,
  --        not just accrual. (The accrual key is ALSO salted with hr_seed's
  --        server secret now, so it cannot be computed in the first place; these
  --        are two independent locks and the cheap one lives here.)
  v_this_intent := p_delta #>> '{journal,intent}';
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    --        ── AND A REPLAY MUST BE A REPLAY ON THE SAME CHARACTER (b346) ──
    --        The intent NAME cannot carry the slot: it is also
    --        player_ledger.intent, which the rollup groups on, so a slot number
    --        in it would make one declaration read as two different things.
    --        Which leaves 'set_activity:combat:goblin' meaning the same thing on
    --        slot 0 and slot 1 — and 'set_activity:idle', which EVERY stop a
    --        player makes shares, meaning the same thing everywhere.
    --
    --        Measured on this database 2026-08-15 and rolled back: one key
    --        applied on slot 0 and then presented on slot 1 answered
    --        ok:true, replayed:true and APPLIED NOTHING (slot 1 gold 500 -> 500)
    --        while a control with a fresh key applied (500 -> 507). Silent, with
    --        ok:true, on the character the player is looking at.
    --
    --        The column was already on the table and simply never read. One
    --        comparison, here, covers all nine intents; the alternative is nine
    --        Edge Functions each remembering to disambiguate a key they did not
    --        choose.
    if v_prev_intent is distinct from v_this_intent
       or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, coalesce(v_this_intent, 'apply'),
        'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_this_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  -- (N3) The advisory lock above is keyed on user:SLOT, but the intent PK is
  -- (user_id, intent_id) — no slot. Two slots replaying the same intent_id
  -- concurrently therefore both miss the select and both insert, and the loser
  -- gets an unhandled unique_violation (a 500) instead of an answer. Exotic
  -- today (one character is active at a time) but it is a race, and a race
  -- closed by `on conflict do nothing` costs nothing. The key stays
  -- user-global rather than slot-scoped on purpose: a client-generated uuid
  -- that means two different things on two slots is a worse contract than one
  -- that is simply already taken.
  -- b346: "already taken" is now SAID OUT LOUD. The branch above answers
  -- intent_mismatch on a cross-slot reuse instead of handing back the other
  -- character's decision, which is what "a worse contract" was always going to
  -- feel like in practice.
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_this_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  -- THIS call owns the row. Nothing else may release it (see step (5)): a
  -- rejection returned from the branch above belongs to whoever claimed the key
  -- first, and deleting it there would free a key that is recording a SUCCESS.
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  -- Everything from here to the handler is all-or-nothing. Every rejection is
  -- hr_reject(), which raises; the handler below undoes the block. (Review S2.)
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    -- (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 skipped
    -- the check when p_version was null, which meant the caller chose whether
    -- concurrency control applied. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
    v_new_gold := v_st.gold;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      v_new_gold := v_st.gold + v_n;
      if v_new_gold < 0 then
        perform public.hr_reject('insufficient_gold',
                                 jsonb_build_object('have', v_st.gold, 'need', -v_n));
      end if;
    end if;

    -- ── GEMS (review S5) ─────────────────────────────────────────────────
    -- Revision 1 wrote `greatest(0, gems + delta)` with no clamp and no error:
    -- spending 10 gems while holding 3 succeeded and silently cost 3. Gems are
    -- a premium currency; a silent partial spend is a support ticket at best.
    v_new_gems := v_st.gems;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      v_new_gems := v_st.gems + v_n;
      if v_new_gems < 0 then
        perform public.hr_reject('insufficient_gems',
                                 jsonb_build_object('have', v_st.gems, 'need', -v_n));
      end if;
    end if;

    -- ── ITEMS ─ the delta is signed; a spend and a gain are the same code ─
    if p_delta ? 'items' then
      if jsonb_typeof(p_delta->'items') <> 'object' then
        perform public.hr_reject('bad_items');
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'items')) > c_max_item_kinds then
        perform public.hr_reject('too_many_item_kinds');
      end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'items') loop
        if v_n = 0 then continue; end if;
        if abs(v_n) > c_max_item_delta then
          perform public.hr_reject('item_clamp', jsonb_build_object('item_id', k));
        end if;
        -- Unknown ids are refused unconditionally now. hr_items is GENERATED
        -- from src/data/items.js; if it is missing this function errors, which
        -- is the correct direction to fail. (Review S3.)
        if not exists (select 1 from public.hr_items where item_id = k) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
        select qty into v_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = k for update;
        v_have := coalesce(v_have, 0);
        if v_have + v_n < 0 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        if v_have + v_n = 0 then
          delete from public.player_inventory
            where user_id = v_uid and slot = v_slot and item_id = k;
        else
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, k, v_have + v_n)
            on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
        end if;
      end loop;
    end if;

    -- ── XP ─ monotonic. A negative XP delta is a caller bug, and accepting one
    --        would make a rollback indistinguishable from an exploit.
    if p_delta ? 'xp' then
      if jsonb_typeof(p_delta->'xp') <> 'object' then perform public.hr_reject('bad_xp'); end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'xp') loop
        if v_n <= 0 then continue; end if;
        if v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', k));
        end if;
        update public.player_skills set xp = xp + v_n
          where user_id = v_uid and slot = v_slot and skill_id = k;
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
      end loop;
    end if;

    -- ── EQUIPMENT (review S4) ────────────────────────────────────────────
    -- Equipping is a TRANSFER, not a flag. One unit leaves player_inventory
    -- and one unit comes back on unequip or swap, so the total the player owns
    -- is conserved and the equip/unequip duplication is arithmetically
    -- impossible rather than merely unimplemented.
    --
    -- Four gates, all against the SERVER's data:
    --   • the equip slot exists                 (hr_equip_slots)
    --   • the item exists                       (hr_items)
    --   • the item fits that slot               (hr_item_slots — 'ring' is
    --     expanded to ring1/ring2 by the generator, in JS, next to the data)
    --   • the player meets reqSkill/reqLv       (player_skills, derived level)
    if p_delta ? 'equip' then
      if jsonb_typeof(p_delta->'equip') <> 'object' then perform public.hr_reject('bad_equip'); end if;
      if (select count(*) from jsonb_object_keys(p_delta->'equip')) > c_max_equip_kinds then
        perform public.hr_reject('too_many_equip_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'equip') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;

        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        if jsonb_typeof(v_eq) = 'null' then
          -- UNEQUIP: return the unit to the bank.
          if v_cur is not null then
            delete from public.player_equipment
             where user_id = v_uid and slot = v_slot and equip_slot = k;
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;
          continue;
        end if;

        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';
        if v_cur is not null and v_cur = v_item then continue; end if;   -- no-op

        if not exists (select 1 from public.hr_items where item_id = v_item) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        if not exists (select 1 from public.hr_item_slots
                        where item_id = v_item and equip_slot = k) then
          perform public.hr_reject('wrong_slot',
            jsonb_build_object('item_id', v_item, 'equip_slot', k));
        end if;
        -- The requirement is re-checked here even though the Edge Function
        -- already checked it. "The caller checked" is not a control.
        if exists (
          select 1 from public.hr_items i
           where i.item_id = v_item and i.req_skill is not null and i.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = i.req_skill), 1) < i.req_lv)
        then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item));
        end if;

        -- DEBIT one from the bank. This is the ownership check; there is
        -- nothing else to check.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;

        -- CREDIT back whatever was in the slot.
        if v_cur is not null then
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, v_cur, 1)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
        end if;

        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
          values (v_uid, v_slot, k, v_item)
          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      end loop;
    end if;

    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can
    --   create a stack. Revision 1 checked it mid-way through the item loop and
    --   then returned, committing the items it had already written.
    --   A NEW stack is what costs space, so a player at cap can still gain more
    --   of what they already hold.
    --   BOUNDED COUNT (reliability RL4): the question is "> cap?", not "how
    --   many?", so the scan stops at cap+1 rows instead of walking a 100,000-
    --   stack bank on every item-touching apply.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = v_slot
         limit v_st.bank_cap + 1) s;
      if v_stacks > v_st.bank_cap then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;

    -- ── FARM ─ planting stamps the SERVER clock. `planted_at` can never be
    --   supplied by anyone: that single line is the whole farming exploit
    --   closed. The crop id is checked against the generated catalogue.
    if p_delta ? 'farm' then
      if jsonb_typeof(p_delta->'farm') <> 'array' then perform public.hr_reject('bad_farm'); end if;
      if jsonb_array_length(p_delta->'farm') > c_max_farm_ops then
        perform public.hr_reject('too_many_farm_ops');
      end if;
      for v_plot in select value from jsonb_array_elements(p_delta->'farm') loop
        if coalesce((v_plot->>'clear')::boolean, false) then
          update public.player_farm
             set crop_id = null, planted_at = null, watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int;
        elsif coalesce((v_plot->>'plant')::boolean, false) then
          if not exists (select 1 from public.hr_crops where crop_id = v_plot->>'crop') then
            perform public.hr_reject('unknown_crop', jsonb_build_object('crop', v_plot->>'crop'));
          end if;
          update public.player_farm
             set crop_id = v_plot->>'crop', planted_at = now(), watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is null;                   -- never replant an occupied plot
          get diagnostics v_rows = row_count;
          if v_rows <> 1 then
            perform public.hr_reject('plot_unavailable', jsonb_build_object('i', v_plot->>'i'));
          end if;
        elsif coalesce((v_plot->>'water')::boolean, false) then
          update public.player_farm set watered_at = now()
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is not null and watered_at is null;
        end if;
      end loop;
    end if;

    -- ── PROGRESS (review S13) ────────────────────────────────────────────
    -- Revision 1 inserted whatever `kind` and `state` the delta named, with an
    -- unbounded `add`. `kind` typos became a parallel universe of rows; `state`
    -- accepted 'claimed', which is the one value that gates a payout.
    -- Here: `kind` is checked, `add` is clamped and non-negative, and 'claimed'
    -- is unreachable — the separate claim block below is the only route.
    if p_delta ? 'progress' then
      if jsonb_typeof(p_delta->'progress') <> 'array' then perform public.hr_reject('bad_progress'); end if;
      if jsonb_array_length(p_delta->'progress') > c_max_progress_ops then
        perform public.hr_reject('too_many_progress_ops');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress') loop
        if coalesce(v_prog->>'kind','') not in
             ('quest','daily','bounty','stat','collection','flag') then
          perform public.hr_reject('bad_progress_kind', jsonb_build_object('kind', v_prog->>'kind'));
        end if;
        if length(coalesce(v_prog->>'key','')) not between 1 and 64
           or length(coalesce(v_prog->>'period','')) > 16 then
          perform public.hr_reject('bad_progress_key');
        end if;
        if coalesce(v_prog->>'state','active') not in ('active','done') then
          perform public.hr_reject('bad_progress_state',
            jsonb_build_object('state', v_prog->>'state'));
        end if;
        v_n := coalesce((v_prog->>'add')::bigint, 0);
        if v_n < 0 or v_n > c_max_progress_add then
          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
        values (v_uid, v_slot, v_prog->>'kind', v_prog->>'key',
                coalesce(v_prog->>'period',''), v_n, v_prog->>'state', now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set value = pp.value + v_n,
              -- A row already 'claimed' is terminal until its period rolls.
              state = case when pp.state = 'claimed' then pp.state
                           else coalesce(v_prog->>'state', pp.state) end,
              updated_at = now();
      end loop;
    end if;

    -- ── PROGRESS CLAIM ─ the only path to 'claimed', and it requires the row
    --   to already be 'done'. `row_count` is the check: a claim that changes
    --   nothing is a claim of something that was not earned, or a double claim.
    if p_delta ? 'progress_claim' then
      if jsonb_typeof(p_delta->'progress_claim') <> 'array' then
        perform public.hr_reject('bad_progress_claim');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress_claim') loop
        update public.player_progress
           set state = 'claimed', updated_at = now()
         where user_id = v_uid and slot = v_slot
           and kind = v_prog->>'kind' and key = v_prog->>'key'
           and period_key = coalesce(v_prog->>'period','')
           and state = 'done';
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;
      end loop;
    end if;

    -- ── ACTIVITY ─────────────────────────────────────────────────────────
    -- (Review R11.) Revision 2 gated the whole block on `v_act ? 'kind'`, so
    -- `{"activity":{"restart":true}}` skipped EVERY check and still reached the
    -- UPDATE, where `restart` resets active_since to now(). A caller could
    -- therefore restamp the activity clock — the input to accrual — without
    -- naming an activity, without a catalogue lookup and without the skill
    -- gate. `{"activity":{}}` was likewise accepted and did nothing, which is
    -- the "silently dropped effect" this contract explicitly refuses elsewhere.
    -- Now: an `activity` key means a complete, validated activity statement.
    v_act := p_delta->'activity';
    if p_delta ? 'activity' then
      if jsonb_typeof(v_act) <> 'object' then perform public.hr_reject('bad_activity'); end if;
      if not (v_act ? 'kind') then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'activity requires kind; restart alone is not an activity'));
      end if;
      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)
                  where ak <> all (array['kind','id','restart'])) then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'unknown activity key'));
      end if;
      if (v_act ? 'restart') and jsonb_typeof(v_act->'restart') <> 'boolean' then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'restart must be boolean'));
      end if;
      -- The (kind ⇔ id) invariant is a table CHECK, and hitting a CHECK yields
      -- an opaque 23514. Answer it here so a caller bug reads as a caller bug.
      if (v_act->>'kind' = 'idle') <> (nullif(v_act->>'id','') is null) then
        perform public.hr_reject('bad_activity');
      end if;
      if v_act->>'kind' <> 'idle' then
        if not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then
          perform public.hr_reject('unknown_activity',
            jsonb_build_object('kind', v_act->>'kind', 'id', v_act->>'id'));
        end if;
        -- Re-check the skill gate against SERVER xp. A forged local level buys
        -- nothing, including the right to start a level-90 node.
        if exists (
          select 1 from public.hr_activities a
           where a.kind = v_act->>'kind' and a.activity_id = v_act->>'id'
             and a.req_skill is not null and a.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = a.req_skill), 1) < a.req_lv)
        then
          perform public.hr_reject('activity_locked', jsonb_build_object('id', v_act->>'id'));
        end if;
      end if;
    end if;

    -- ── (4a-ii) THE GATHERING TOOL CARRY (b348) ──────────────────────────
    -- src/core/tools.js `advanceToolCarry` banks `qty x toolDouble` into a
    -- per-skill FRACTION and pays out whole units as they accrue, so a 10%
    -- tool pays exactly one bonus every ten actions instead of rolling for it.
    -- That determinism is the whole reason an away replay is byte-identical
    -- run to run, and it only survives across sessions if the remainder is
    -- stored. legacy.js:3841 renamed it out of `G._toolCarry` for exactly this
    -- column.
    --
    -- ⚠ IT IS AN ABSOLUTE, NOT A DELTA, and it is the only key here that is.
    --   Every other value in this contract is signed and added; a carry cannot
    --   be, because the engine computes the RESULTING remainder from a starting
    --   one it was handed, and adding two remainders would be arithmetic
    --   nobody defined. Stated here rather than inferred from the code.
    --
    -- ⚠ THE RANGE IS THE WHOLE CONTROL. A carry of 0.9 is legal; a carry of 900
    --   would be a 900-item mint on the first action of the next span, because
    --   `advanceToolCarry` floors it straight into a payout. So each value must
    --   be a number in [0,1) — refused, never clamped: there is no honest way
    --   for a carry to be out of range, and silently repairing an impossible
    --   value is how a compromised engine's bug becomes the server's opinion.
    if p_delta ? 'tool_carry' then
      v_carry := p_delta->'tool_carry';
      if jsonb_typeof(v_carry) <> 'object' then
        perform public.hr_reject('bad_tool_carry', jsonb_build_object('type', jsonb_typeof(v_carry)));
      end if;
      if (select count(*) from jsonb_object_keys(v_carry)) > c_max_carry_skills then
        perform public.hr_reject('too_many_carry_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(v_carry))));
      end if;
      for k in select key from jsonb_each(v_carry) loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(v_carry->k) <> 'number'
           or (v_carry->>k)::numeric < 0 or (v_carry->>k)::numeric >= 1 then
          perform public.hr_reject('bad_tool_carry',
            jsonb_build_object('skill', k, 'value', v_carry->k));
        end if;
      end loop;
    end if;

    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────
    -- The per-call clamps below are a blast radius for ONE call. Nothing
    -- restricts a compromised engine to one call — hr_rate_gate allows 30
    -- accrues/minute — so without a per-DAY ceiling the reachable rate is
    -- 518 BILLION XP/day, i.e. every skill in the game to 99 every two seconds.
    -- This is the ceiling. Design, numbers and the composition argument against
    -- the b307 per-absence cap: supabase/migrations/2026-08-11-daily-budget.sql.
    --
    -- WHERE IT SITS, AND WHY EXACTLY HERE:
    --   • AFTER the advisory lock and the `for update` above, so the sum and
    --     the row it will insert are inside one serialised critical section for
    --     this character. Two concurrent applies cannot both read a
    --     pre-insert world (hr_day_budget_used is VOLATILE — see its header).
    --   • AFTER the version check, so a stale caller pays `version_conflict`
    --     without a ledger scan.
    --   • AFTER the per-call clamps, and that ordering was decided by a test
    --     rather than by taste. With the budget checked first, the conservation
    --     fuzz's `gold_clamp` op — a deliberate 6.8e9-class delta — came back
    --     `daily_budget`, because the day's gold ceiling (25,000,000) is BELOW
    --     the per-call gold clamp (50,000,000). c_max_gold_delta would have
    --     become unreachable: a control that reads as a control in review and
    --     can never fire. Clamps answer "this ONE delta is insane"; the budget
    --     answers "you have had enough today". The specific diagnosis wins.
    --   • STILL INSIDE the protected block, before the state UPDATE and before
    --     the ledger row, so a breach rolls back everything the earlier blocks
    --     wrote through the same hr_reject/HR000 path as any other rejection.
    --     `daily_budget` never half-applies; the fuzz asserts that by
    --     reconciling after it.
    --   • GROSS inflow only. Netting a spend against a mint would give the
    --     budget a free reset button (mint 25M, buy something, mint again).
    --   • UNCONDITIONAL on journal.kind. `kind` is chosen by the caller; a
    --     budget that only counted kind='accrue' would be evaded by writing
    --     kind='trade'. Real transfers do not pass through hr_apply — market_buy
    --     credits gold itself and leaves gold_in NULL — so honest trading is
    --     not charged for this either.
    v_gold_in := greatest(0, coalesce((p_delta->>'gold')::bigint, 0));
    -- The typeof guards keep a malformed delta reaching its OWN error below
    -- (bad_xp / bad_items) instead of erroring out of jsonb_each_text here with
    -- an sqlstate the handler does not cover.
    if jsonb_typeof(p_delta->'xp') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_xp_in from jsonb_each_text(p_delta->'xp');
    end if;
    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;
    v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in);
    if v_bud is not null then
      -- The detail carries used / add / limit / dim / day, so a fired fuse is
      -- diagnosable from the response alone. `daily_budget` is on the degrade
      -- ladder's DEGRADABLE list in hr-accrue/index.ts for the same reason
      -- bank_full is: halving the span reduces the proposed inflow, so an
      -- honest accrual that lands on the ceiling costs part of an absence
      -- rather than bricking the watermark.
      perform public.hr_reject('daily_budget', v_bud);
    end if;

    -- ── ACCRUAL WATERMARK (review S19) ───────────────────────────────────
    -- Revision 1 set accrued_to = now() AT APPLY TIME while the ticks had been
    -- computed from the READ time, so every round trip silently confiscated the
    -- elapsed milliseconds between the two — a few hundred per collect, forever.
    -- The caller now states the watermark it actually paid up to, and the server
    -- CLAMPS it into [old, now()]: it can never move backwards (which would pay
    -- the same seconds twice) and never into the future (which would pay for
    -- time that has not happened). "now" remains accepted as shorthand.
    v_accrued := v_st.accrued_to;
    if p_delta ? 'accrued_to' then
      if p_delta->>'accrued_to' = 'now' then
        v_accrued := now();
      else
        v_accrued := (p_delta->>'accrued_to')::timestamptz;
      end if;
      v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));
    end if;

    -- ── S5 (HALF) — AN EQUIPMENT OR ACTIVITY CHANGE CLOSES THE WINDOW ────
    -- docs/design/server-authority.md §3 "⚠ Under-payment is the only direction
    -- we are wrong in — THAT IS NOT TRUE": the accrual engine prices an absence
    -- with the equipment read at COLLECT time, so logging off naked and putting
    -- on best-in-slot before collecting is paid for the whole night at
    -- best-in-slot rates. Measured on an identical seed and window: 12.8x gold
    -- and 20x XP.
    --
    -- The close is structural rather than a rule the engine has to remember: any
    -- apply that changes equipment or the activity pointer ALSO stamps
    -- accrued_to = now(), so after an equip there is no unpaid window left for
    -- the new gear to be applied to. The exploit is not "detected", it is
    -- arithmetically empty.
    --
    -- ⚠ THE OTHER HALF IS NOT HERE, AND IT IS NOT MINE. This closes the
    --   OVER-payment. It creates a matching UNDER-payment if the engine changes
    --   equipment without collecting first — the elapsed time since the last
    --   watermark is forfeited. The intent surface must therefore COLLECT
    --   BEFORE IT EQUIPS, exactly as start_activity already collects the
    --   previous activity first (design §2, "Where each one runs"). That is a
    --   change in supabase/functions/hr-accrue, not in this file. It is safe to
    --   ship this half alone today ONLY because no client-reachable path can
    --   equip or start an activity yet; it must not stay alone past the first
    --   one that can.
    --
    --   Also still open: the fail-closed `active_since` rule (an activity with a
    --   NULL active_since must not be priced), which lives in accrual.js's
    --   preconditions and is likewise not this file's to make.
    if p_delta ? 'equip' or p_delta ? 'activity' then
      v_accrued := now();
    end if;

    update public.player_state
       set gold = v_new_gold,
           gems = v_new_gems,
           hp   = case when p_delta ? 'hp'
                       then greatest(0, least(max_hp, coalesce((p_delta->>'hp')::int, hp)))
                       else hp end,
           active_kind  = coalesce(v_act->>'kind', active_kind),
           active_id    = case when v_act ? 'kind'
                               then nullif(v_act->>'id','') else active_id end,
           active_since = case when coalesce((v_act->>'restart')::boolean, false)
                               then now() else active_since end,
           accrued_to   = v_accrued,
           -- b348: an ABSOLUTE, validated at (4a-ii). Absent key = untouched.
           tool_carry   = case when p_delta ? 'tool_carry'
                               then v_carry else tool_carry end,
           version      = version + 1,
           updated_at   = now()
     where user_id = v_uid and slot = v_slot;

    -- ── JOURNAL ─ ONE row per apply. Per-item rows would multiply the write
    --   volume of an idle game for detail `meta` already carries — and this
    --   repo has the receipt: game_events, 1.6M rows / 229 MB, six players,
    --   four days. A very large delta is summarised rather than stored whole,
    --   so one pathological call cannot write a megabyte.
    --
    --   AND ONE ROW IS NOT ENOUGH IF THE ROW IS HUGE (reliability RL2(b)).
    --   Revision 2 stored `p_delta - 'journal'` — the WHOLE proposed delta, up
    --   to 200 item keys plus farm ops plus progress ops — as meta. Measured
    --   projection: ~2.5× a game_events row, ×2 indexes, 600 MB/day at 600
    --   players. Rebuilding game_events under a new name is exactly the mistake
    --   this comment block was written to prevent.
    --
    --   What is kept is what a ledger is FOR: the value that moved. Gold, gems,
    --   items, xp and equipment transfers are recorded (they are the audit
    --   trail, and they are small — a real accrual apply touches 1-5 item
    --   kinds). Everything else is recorded as a KEY NAME only, because the
    --   authoritative record of it is the row it wrote: farm state is in
    --   player_farm, progress is in player_progress, the activity pointer and
    --   accrued_to are in player_state, and all of them are reachable from this
    --   row's timestamp. `k` is the list of those keys, so the ledger still
    --   says what kind of thing happened.
    v_j    := coalesce(p_delta->'journal', '{}'::jsonb);
    v_kind := coalesce(v_j->>'kind', 'admin');
    if v_kind <> all (c_ledger_kinds) then v_kind := 'admin'; end if;
    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'g',  nullif(coalesce((p_delta->>'gold')::bigint, 0), 0),
      'm',  nullif(coalesce((p_delta->>'gems')::bigint, 0), 0),
      'i',  case when p_delta ? 'items'
                 and (select count(*) from jsonb_object_keys(p_delta->'items')) <= 24
                 then p_delta->'items' end,
      'x',  case when p_delta ? 'xp' then p_delta->'xp' end,
      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,
      'k',  (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (array['gold','gems','items','xp','equip','journal']))
    ));
    -- If items were too numerous to itemise, say so with an aggregate rather
    -- than dropping the fact that a large transfer happened.
    if p_delta ? 'items' and not (v_meta ? 'i') then
      v_meta := v_meta || jsonb_build_object('i_n',
        (select count(*) from jsonb_object_keys(p_delta->'items')),
        'i_sum', (select sum(coalesce(nullif(value,'')::bigint, 0))
                    from jsonb_each_text(p_delta->'items')));
    end if;
    -- Backstop. Nothing above should be able to reach this, which is why it is
    -- 2 KB and not 8 KB: if it ever fires, the shape has regressed.
    if pg_column_size(v_meta) > 2000 then
      v_meta := jsonb_build_object('summary', true, 'bytes', pg_column_size(p_delta),
        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;
    --
    --   THE THREE STAMP COLUMNS ARE THE DAILY BUDGET'S ONLY INPUT. They are
    --   written UNCONDITIONALLY, on every row hr_apply writes, from the same
    --   three variables the check at (4b) was made against — so what was
    --   checked and what is charged cannot disagree. NULL in these columns
    --   means "not written by hr_apply", which is exactly the set of rows
    --   (market_buy's seller credit, market_list's escrow) that must not
    --   consume progression budget.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       v_gold_in, v_xp_in, v_qty_in,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));

    v_out := public.hr_state_of(v_uid, v_slot);

  exception
    -- Our own rejections. The block is rolled back; the envelope is built from
    -- the machine code and its detail payload.
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- A malformed delta that reaches a cast or a constraint. Rolled back and
    -- reported rather than surfacing as a 500 — but NEVER silently: the
    -- sqlstate is returned so a caller bug is diagnosable from the response.
    when invalid_text_representation or invalid_datetime_format
      or numeric_value_out_of_range or division_by_zero
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_delta',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) Record the DECISION under the idempotency key. This statement is
  --        OUTSIDE the protected block, so it survives a rejection: a replay of
  --        a rejected intent returns the same rejection instead of re-running
  --        it. Only the decision is stored, never the state envelope (R5, and
  --        the reasoning is at step (3)) — on a success that is literally
  --        `{"ok": true}`.
  --
  --        ── ONE EXCEPTION: A VERSION CONFLICT RELEASES THE KEY (b346) ──────
  --        "Same key, same answer" is the right contract for a decision about
  --        the DELTA — a clamp, an insufficiency, an unknown id. The caller must
  --        change something, and changing the key is how it says "this is a new
  --        attempt". `version_conflict` is not that. It is a statement about the
  --        caller's READ: nothing was applied, the protected block rolled back
  --        in full, and the DEFINED recovery is "re-read and try again".
  --
  --        Storing it turns an ordinary concurrency outcome into a lockout for
  --        any caller whose key cannot change. Measured on this database
  --        2026-08-15, rolled back:
  --            (1) apply, stale version      -> {ok:false, version_conflict}
  --            (2) retry SAME key, CORRECT   -> {ok:false, version_conflict,
  --                                              replayed:true}
  --            (3) control, NEW key, CORRECT -> {ok:true}
  --        Same delta, same correct version; only the key differed. The accrual
  --        engine's key is DERIVED from (user, slot, watermark, version, salt)
  --        and a rejection does not move the watermark, so before this it could
  --        re-derive a byte-identical, permanently-refused key — for up to 25
  --        hours (hr_intents_prune, 17 * * * *, 24h window). The Edge side
  --        additionally puts `version` in that derivation; this is the half that
  --        also covers the CLIENT-chosen keys, which cannot re-derive anything.
  --
  --        NARROW ON PURPOSE. `v_claimed` means this call inserted the row, so a
  --        rejection returned from step (3) — including an intent_mismatch
  --        against a row recording somebody's SUCCESS — never reaches here and
  --        can never free that row. And only `version_conflict` is released:
  --        every other code is a decision about the delta and deserves the same
  --        answer on the same key.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents
     where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true)
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  -- ── (6) THE REJECTION RECORD (review R4). Also outside the protected block,
  --        and that is the entire point: the ledger insert that revision 2
  --        relied on for an audit trail sits INSIDE the block, so a rejection
  --        rolled it back and the only trace of a fired clamp was
  --        player_intents.result — which hr_intents_prune deletes after 24
  --        hours. The design says "treat any rejection as an incident"; an
  --        incident nobody can see the next morning is not one.
  --
  --        hr_record_rejection aggregates per (character, code, day) and
  --        classifies incident vs normal itself, so this is a bounded write —
  --        one UPSERT, not a row per rejection. See player-state.sql §6b-ii for
  --        why that shape and not a log.
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(
      v_uid, v_slot, coalesce(p_delta #>> '{journal,intent}', 'apply'),
      v_out->>'error', v_out - 'ok' - 'error');
  end if;

  return v_out;
end $$;

-- ── 4. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- `create or replace` preserves the existing ACL, so these are belt-and-braces.
-- They are restated because Postgres grants EXECUTE to PUBLIC on every new
-- function and Supabase's default ACL additionally grants it to anon,
-- authenticated and service_role — and "it was already correct" is how a gap
-- survives three reviews. If the browser could call hr_apply, the browser could
-- author its own delta and the clamps would become the game's rules instead of
-- its blast radius.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 5. SELF-VERIFICATION — the commit gate ───────────────────────────────
-- Every claim this file makes, EXECUTED. A migration that asserts nothing is a
-- migration that has not been tested.

-- (a) The column, the constraint, and the two functions' capability surface.
do $$
declare v_txt text; v_bad text; v_p oid;
begin
  select data_type into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='tool_carry';
  if v_txt is distinct from 'jsonb' then
    raise exception 'player_state.tool_carry is % — expected jsonb', coalesce(v_txt, 'MISSING');
  end if;
  select is_nullable into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='tool_carry';
  if v_txt <> 'NO' then
    raise exception 'tool_carry is nullable. NULL is RESERVED to mean "this database has no such '
                    'column" — the Edge Function reads `st.tool_carry ?? null` and the null branch '
                    'omits the delta key. A nullable column makes that switch ambiguous.';
  end if;
  select column_default into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='tool_carry';
  if coalesce(v_txt, '') !~ '^''\{\}''' then
    raise exception 'tool_carry defaults to % — it must default to an empty object', coalesce(v_txt, 'NULL');
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='public.player_state'::regclass
                    and conname='player_state_tool_carry_object') then
    raise exception 'the tool_carry object CHECK is missing — the container shape would rest on the '
                    'engine alone, and the engine is the component with the largest attack surface';
  end if;

  -- ⚠ "THE CONSTRAINT EXISTS" IS NOT "THE CONSTRAINT REJECTS", and the tempting
  --   proof — a temp table carrying a RETYPED copy of the expression — tests the
  --   copy, not the constraint. So the rejection is proven in §5(b), against the
  --   real column on a real row, where a character exists to own it.

  -- NO CLIENT WRITE POLICY on the table this column lives in. The whole posture
  -- is one SELECT policy per player table; a write policy here would let the
  -- browser PATCH its own carry, which is a slow but unbounded item mint.
  select string_agg(policyname || ':' || cmd, ', ') into v_bad from pg_policies
   where schemaname='public' and tablename='player_state' and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'player_state grew a non-SELECT policy (%) — the client could author its own '
                    'tool_carry', v_bad;
  end if;

  -- THE PRIVILEGED FUNCTIONS ARE NOT CLIENT-EXECUTABLE. Asserted, not assumed:
  -- a `create or replace` preserves an ACL, so a wrong one would survive.
  for v_txt, v_p in
    select 'hr_apply', to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)')
    union all
    select 'hr_state_of', to_regprocedure('public.hr_state_of(uuid,int)')
  loop
    if v_p is null then raise exception '% vanished', v_txt; end if;
    foreach v_bad in array array['public','anon','authenticated','service_role'] loop
      if has_function_privilege(v_bad, v_p, 'execute') then
        raise exception '% is EXECUTABLE BY % — the browser could author its own delta', v_txt, v_bad;
      end if;
    end loop;
    if not has_function_privilege('hr_engine', v_p, 'execute') then
      raise exception '% is not executable by hr_engine — the engine cannot work', v_txt;
    end if;
  end loop;

  -- hr_state_of must stay VOLATILE: a STABLE marker would let it serve a
  -- snapshot taken before the write hr_apply just made.
  if (select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='hr_state_of') <> 'v' then
    raise exception 'hr_state_of is no longer VOLATILE — the replace dropped the marker';
  end if;

  raise notice 'b348 §5(a) PASSED: the column, its CHECK, the RLS posture and both grants.';
end $$;

-- (b) THE BEHAVIOUR, on a real character, in a subtransaction that is rolled
--     back to zero effect. "The key is accepted" and "an impossible value is
--     refused" are the two claims this file exists to make, and neither is
--     provable by reading the source.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000b3480001';
  v_r    jsonb;
  v_ver  bigint;
  v_ver2 bigint;
  v_got  jsonb;
  v_kit  int;
  v_keys text[];
  -- THE WHOLE `state` CONTRACT, restated so a bad transcription of hr_state_of
  -- fails THIS migration rather than silently shortening the client's world.
  -- §2 restates a 200-line function; the one thing that cannot be checked by
  -- reading it is what it actually returns.
  c_state_keys constant text[] := array[
    'slot','gold','gems','hearth_tokens','hp','max_hp','bank_cap',
    'active_kind','active_id','active_since','accrued_to',
    'auto_eat_enabled','auto_eat_food','auto_eat_pct','tool_carry'];
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception '§5(b) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select count(*) into v_kit from public.hr_start_kit;
  if v_kit <> 1 then
    raise exception '§5(b) CANNOT RUN: hr_start_kit holds % rows — re-apply the catalogue', v_kit;
  end if;

  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception '§5(b) HARNESS: auth.uid() did not pick up the probe identity';
    end if;
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception '§5(b): no probe character: %', v_r; end if;

    -- THE ENVELOPE'S KEY LIST, exactly — extra keys as well as missing ones,
    -- because §2 is a hand-restated body and a dropped key is a feature that
    -- silently stops existing for every client at once.
    select array(select jsonb_object_keys(public.hr_state_of(v_uid, 0)->'state') order by 1)
      into v_keys;
    if v_keys is distinct from array(select unnest(c_state_keys) order by 1) then
      raise exception '§5(b): hr_state_of.state returns %, expected % — §2 restated the body '
                      'incorrectly', v_keys, array(select unnest(c_state_keys) order by 1);
    end if;

    -- A fresh character starts with an EMPTY carry, not a null.
    v_got := public.hr_state_of(v_uid, 0) #> '{state,tool_carry}';
    if v_got is distinct from '{}'::jsonb then
      raise exception '§5(b): a fresh character''s tool_carry reads % — expected {}', v_got;
    end if;

    -- (i) THE KEY IS ACCEPTED, and it round-trips through hr_state_of.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"tool_carry":{"woodcutting":0.4,"mining":0},'
             '"journal":{"kind":"gather","intent":"b348:probe"}}'::jsonb);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§5(b): a valid tool_carry delta was REFUSED (%). Before this file that is '
                      'unknown_delta_key — a 409 that costs a player their whole night.', v_r;
    end if;
    -- ⚠ `is distinct from`, NEVER `<>`. An absent key reads NULL, and
    --   `NULL <> 0.4` is NULL, which `if` treats as FALSE — so the whole
    --   round-trip assertion passes when nothing was written at all. Measured:
    --   with the write anchor removed from the UPDATE, the `<>` form let this
    --   migration apply clean. That is the exact "assertion that asserts
    --   nothing" shape this project has been bitten by fifteen times.
    v_got := public.hr_state_of(v_uid, 0) #> '{state,tool_carry}';
    if (v_got->>'woodcutting')::numeric is distinct from 0.4
       or (v_got->>'mining')::numeric is distinct from 0 then
      raise exception '§5(b): the carry did not round-trip — hr_state_of reads %', v_got;
    end if;

    -- (ii) AN IMPOSSIBLE CARRY IS REFUSED, and refused is not clamped.
    --      900 would be a 900-item mint on the first action of the next span,
    --      because advanceToolCarry floors the remainder straight into a payout.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"tool_carry":{"woodcutting":900},"journal":{"kind":"gather","intent":"b348:probe:hostile"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_tool_carry' then
      raise exception '§5(b): a carry of 900 returned % — expected bad_tool_carry. An out-of-range '
                      'carry is a per-action item mint.', v_r;
    end if;
    v_got := public.hr_state_of(v_uid, 0) #> '{state,tool_carry}';
    if (v_got->>'woodcutting')::numeric is distinct from 0.4 then
      raise exception '§5(b): the REFUSED carry still moved the stored value to % — the rejection '
                      'did not roll back', v_got;
    end if;
    select version into v_ver2 from public.player_state where user_id=v_uid and slot=0;
    if v_ver2 <> v_ver then
      raise exception '§5(b): a refused apply bumped version % -> % — the caller''s retry would '
                      'then mint the gain a second time (review S2)', v_ver, v_ver2;
    end if;

    -- (iii) 1.0 IS OUT OF RANGE, and that boundary is the point: a carry of
    --       exactly 1 is a whole item that was never paid out.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"tool_carry":{"woodcutting":1},"journal":{"kind":"gather","intent":"b348:probe:one"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_tool_carry' then
      raise exception '§5(b): a carry of exactly 1.0 returned % — the range is half-open [0,1)', v_r;
    end if;

    -- (iv) AN UNKNOWN SKILL IS REFUSED. A carry keyed on an id the catalogue
    --      does not have is either a typo or a probe; both are worth a name.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"tool_carry":{"not_a_skill":0.5},"journal":{"kind":"gather","intent":"b348:probe:skill"}}'::jsonb);
    if v_r->>'error' is distinct from 'unknown_skill' then
      raise exception '§5(b): a carry on an unknown skill returned % — expected unknown_skill', v_r;
    end if;

    -- (v) THE CONTAINER MUST BE AN OBJECT.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"tool_carry":[0.5],"journal":{"kind":"gather","intent":"b348:probe:arr"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_tool_carry' then
      raise exception '§5(b): an ARRAY carry returned % — expected bad_tool_carry', v_r;
    end if;

    -- (vi) CONTROL: the character is not simply broken, and an ABSENT key
    --      leaves the carry alone rather than resetting it. Without this, every
    --      assertion above is satisfied by an hr_apply that refuses everything.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"gold":7,"journal":{"kind":"admin","intent":"b348:probe:control"}}'::jsonb);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§5(b) CONTROL: an ordinary delta was refused (%) — the probes above prove '
                      'nothing', v_r;
    end if;
    v_got := public.hr_state_of(v_uid, 0) #> '{state,tool_carry}';
    if (v_got->>'woodcutting')::numeric is distinct from 0.4 then
      raise exception '§5(b): a delta with NO tool_carry key reset the carry to % — an absent key '
                      'must leave the column untouched', v_got;
    end if;

    -- (vii) THE COLUMN'S OWN CHECK REJECTS — on the REAL table, not on a
    --       retyped copy of the expression. hr_apply is the only writer today;
    --       this is what stands between the column and the NEXT writer.
    begin
      update public.player_state set tool_carry = '[]'::jsonb
       where user_id = v_uid and slot = 0;
      raise exception '§5(b): the tool_carry CHECK accepted an ARRAY on the real column';
    exception when check_violation then null;
    end;
    begin
      update public.player_state set tool_carry = '3'::jsonb
       where user_id = v_uid and slot = 0;
      raise exception '§5(b): the tool_carry CHECK accepted a SCALAR on the real column';
    exception when check_violation then null;
    end;
    -- CONTROL: an object passes, so (vii) is measuring the SHAPE and not a
    -- column that refuses every write.
    update public.player_state set tool_carry = '{"mining":0.25}'::jsonb
     where user_id = v_uid and slot = 0;
    if (public.hr_state_of(v_uid, 0) #>> '{state,tool_carry,mining}')::numeric
       is distinct from 0.25 then
      raise exception '§5(b) CONTROL: a legal object write did not land — (vii) proves nothing';
    end if;

    raise exception using errcode = 'HR348', message = 'b348 §5(b) complete — rolling back';
  exception when sqlstate 'HR348' then
    null;
  end;

  -- ROLLBACK PROOF. If the subtransaction had committed, this migration would
  -- have written a character into production as a side effect of verifying
  -- itself.
  if exists (select 1 from public.player_state   where user_id = v_uid) then
    raise exception '§5(b) LEAKED a player_state row';
  end if;
  if exists (select 1 from public.player_intents where user_id = v_uid) then
    raise exception '§5(b) LEAKED a player_intents row';
  end if;
  if exists (select 1 from public.player_ledger  where user_id = v_uid) then
    raise exception '§5(b) LEAKED a ledger row';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception '§5(b) LEAKED the probe auth.users row';
  end if;

  raise notice 'b348 §5(b) PASSED: the tool_carry key is accepted and round-trips; 900, 1.0, an '
               'unknown skill and an array are each refused without moving the stored value or the '
               'version; an absent key leaves it alone.';
end $$;
