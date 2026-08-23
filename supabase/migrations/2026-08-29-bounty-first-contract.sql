-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE FIRST-CONTRACT BOUNTY BRACKET (Designer ruling, 2026-08-23)
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────────
-- `BOUNTY_KILL_COUNTS.cull[1] = [80,120]` is what a brand-new Bounty Hunter is
-- offered in the board's EASY slot. Eighty to a hundred and twenty kills is
-- roughly a hundred fights before the first Bounty Mark exists — and the death
-- sheet, the game's best teaching moment, points a day-one player straight at a
-- Marks-priced trait. The tutorial named a currency the first session could not
-- reach. The designer's ruling: 15–25 kills at Bounty-Hunter level 1, today's
-- tier table from level 2.
--
-- ── WHAT THIS FILE ACTUALLY CHANGES, AND WHY IT IS ONLY THE FLOOR ───────────
-- `hr_accept_bounty__ungated` does NOT generate a contract. The client's board
-- generator (src/core/bounty.js) proposes `p_required`, and the server CLAMPS it
-- into the tier's honest range:
--
--     v_req := least(v_kmax, greatest(v_kmin, coalesce(p_required, v_kmin)));
--
-- The clamp's LOWER bound is the security-relevant half: it is what stops a
-- forged `p_required = 1` from paying a full contract for one kill. The upper
-- bound only caps a forged HIGH value, which pays the same reward for more work
-- and is therefore not an exploit.
--
-- So this migration moves the FLOOR at tier 1 (80 → 15) and leaves `kmax` at
-- 120. Lowering `kmax` to 25 would silently REWRITE an honest 80-kill contract
-- proposed by a client whose Bounty-Hunter level has already passed 1, down to
-- 25 — a client and a server disagreeing about the same contract is exactly the
-- failure this program exists to prevent, and the direction that hurts is the
-- server narrowing, never the server widening.
--
-- ── WHY THE SERVER COUNTS TURN-INS INSTEAD OF READING A LEVEL ──────────────
-- The ruling is stated in Bounty-Hunter LEVELS, and the server cannot read one:
-- Bounty-Hunter XP lives in the client save blob (`G.bountyHunter.xp`), not in
-- `player_skills`, so a level is a client-authored number and may not gate a
-- gold-and-Marks payout.
--
-- The server owns something better: `player_ledger` rows of
-- kind='bounty', intent='bounty_turnin:…', written by hr_claim_bounty__ungated
-- in the same transaction as the credit, on a table whose immutability trigger
-- refuses UPDATE, TRUNCATE and in-window DELETE. That is the clan_deposit budget
-- pattern (2026-08-08-clan-seat.sql:579-589) — read the clamp from an
-- append-only journal rather than from a counter something can move.
--
-- The grace is 3 turn-ins, and it is DERIVED rather than chosen: the smallest XP
-- a tier-1 cull can pay is round(45 × 0.85) = 38 (easy difficulty), and level 2
-- is 83 XP, so a character holds Bounty-Hunter level 1 across at most turn-ins
-- #1, #2 and #3 (0 / 38 / 76 XP). tests/bounty-drift.mjs re-derives that from
-- src/core/xp.js XP_TABLE and from BOUNTY_BASE_REWARDS rather than trusting this
-- paragraph.
--
-- The server's grace is therefore a deliberate SUPERSET of "level 1":
--   • it counts only CULL turn-ins (proof/weapon/streak are client-only and the
--     server refuses them), so a client's level can be HIGHER than the ledger
--     implies → the client proposes 80, the widened range passes 80 through
--     unchanged, no effect;
--   • it can never be LOWER than the client's, which is the only direction that
--     would rewrite a legitimate contract.
--
-- ── BLAST RADIUS IF A CLIENT FORGES `p_required` DURING THE GRACE ──────────
-- Bounded by construction, and small: tier 1 only, the first 3 server-journalled
-- turn-ins of a character's life, easy-cull pay of 270 gold + 5 Marks. Kills are
-- still verified from the SERVER's own `ev:kill_monster:<target>` counter against
-- an accept-time baseline, so the contract cannot be completed without actually
-- killing the monsters. Worst case: ~810 gold and 15 Marks arriving sooner than
-- the honest schedule, once per character, ever.
--
-- ── KNOWN LIMITATION (stated, not hidden) ──────────────────────────────────
-- `hr_ledger_prune` rolls up and deletes ledger rows older than 400 days. A
-- character whose first three turn-ins age past that window re-enters the grace.
-- The consequence is one tier-1 contract with a lower floor for a 400-day-old
-- account; it is not worth a second counter to close.
--
-- REVERSIBILITY: drop the two helper functions and re-apply
-- 2026-08-23-bounty.sql §7 (which restores the unconditional
-- `hr_bounty_kill_range(v_tier)` floor). Nothing is dropped, no column is added,
-- no data is rewritten.
--
-- BOUND TO src/core/bounty.js BY tests/bounty-drift.mjs (the constants below and
-- the grace) — a divergence fails the build.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITION — this file patches 2026-08-23-bounty.sql, fail closed ──
do $$
begin
  if to_regprocedure('public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)') is null then
    raise exception 'hr_accept_bounty__ungated is absent — apply 2026-08-23-bounty.sql first';
  end if;
  if to_regprocedure('public.hr_bounty_kill_range(integer)') is null then
    raise exception 'hr_bounty_kill_range is absent — apply 2026-08-23-bounty.sql first';
  end if;
end $$;

-- ── 1. The probe index ──────────────────────────────────────────────────────
-- The grace check runs once per accept (rate-gated at 12/min) and asks "does
-- this character have three bounty turn-ins?". Without this, the answer for a
-- player who has NEVER done a bounty — i.e. exactly the population the grace is
-- for — is a scan of every ledger row they own. Partial, so it indexes only the
-- handful of kind='bounty' rows a character ever accumulates.
create index if not exists player_ledger_bounty_idx
  on public.player_ledger (user_id, slot)
  where kind = 'bounty';

-- ── 2. The first-contract range — the SQL side of BOUNTY_FIRST_CONTRACT_COUNT ─
-- Shaped exactly like hr_bounty_kill_range so tests/bounty-drift.mjs can bind
-- both with the same reader.
create or replace function public.hr_bounty_first_contract_range()
returns table(kmin bigint, kmax bigint)
language sql immutable set search_path = public, pg_catalog as $$
  select 15::bigint, 25::bigint;
$$;

revoke execute on function public.hr_bounty_first_contract_range()
  from public, anon, authenticated, service_role;

-- ── 3. The grace, read from the append-only journal ─────────────────────────
-- `limit 3` is load-bearing rather than decorative: the question is "fewer than
-- three?", so the scan stops at three and the cost never grows with a veteran's
-- bounty history.
create or replace function public.hr_bounty_first_contract(p_user uuid, p_slot int)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select (select count(*) from (
            select 1 from public.player_ledger
             where user_id = p_user and slot = p_slot
               and kind = 'bounty' and intent like 'bounty_turnin:%'
             limit 3) t) < 3;
$$;

revoke execute on function public.hr_bounty_first_contract(uuid, int)
  from public, anon, authenticated, service_role;

-- ── 4. hr_accept_bounty__ungated — RESTATED from 2026-08-23-bounty.sql §7 ───
-- Two lines change (the v_first read and the tier-1 floor swap); everything else
-- is verbatim, including the elite refusal, the tier gate and the upsert. The
-- self-check in §5 re-proves the properties that were not supposed to move.
create or replace function public.hr_accept_bounty__ungated(
  p_slot int, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot     int := coalesce(p_slot, 0);
  v_tier     int;
  v_cl       int;
  v_maxtier  int;
  v_kmin     bigint; v_kmax bigint;
  v_req      bigint;
  v_gold     bigint; v_marks int; v_xp int;
  v_baseline bigint;
  v_first    boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  -- ONLY 'cull' is server-verifiable (see header). proof/weapon/streak refused.
  if p_type is distinct from 'cull' then
    return jsonb_build_object('ok', false, 'error', 'type_not_server_verifiable', 'type', p_type);
  end if;
  -- ⚠ 'elite' is REFUSED at the server (Security ruling 2026-08-23): elite is never
  -- board-generated and is gated only by the client-owned Bounty-Hunter level, so every
  -- 'elite' reaching the server is forged — and it scales tradeable gold up to 1.75×.
  -- Durable fix (tracked): server-own the difficulty (server-derived board seed OR
  -- server-owned BH level with difficulty<=unlocked). The easy/normal/hard residual
  -- (<=1.53x) is a bounded, self-only, journalled residual accepted with that follow-up.
  if p_difficulty not in ('easy','normal','hard') then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty', 'difficulty', p_difficulty);
  end if;

  select tier into v_tier from public.hr_bounty_monsters where monster_id = p_target;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- COMBAT-LEVEL GATE: the target's tier must be unlocked by the SERVER combat level.
  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);
  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);
  if v_tier > v_maxtier then
    return jsonb_build_object('ok', false, 'error', 'tier_locked',
      'tier', v_tier, 'unlocked_tier', v_maxtier, 'combat_level', v_cl);
  end if;

  select kmin, kmax into v_kmin, v_kmax from public.hr_bounty_kill_range(v_tier);
  -- THE FIRST-CONTRACT FLOOR. Tier 1 only, floor only — see the header for why
  -- kmax must NOT move with it.
  v_first := (v_tier = 1) and public.hr_bounty_first_contract(auth.uid(), v_slot);
  if v_first then
    select kmin into v_kmin from public.hr_bounty_first_contract_range();
  end if;
  v_req := least(v_kmax, greatest(v_kmin, coalesce(p_required, v_kmin)));

  select gold, marks, xp into v_gold, v_marks, v_xp
    from public.hr_bounty_reward(v_tier, 'cull', p_difficulty);

  v_baseline := public.hr_bounty_kills(auth.uid(), v_slot, p_target);

  -- Upsert: accepting a new bounty REPLACES any prior active one (and resets the
  -- baseline). One row per character; the client enforces "finish/abandon first".
  insert into public.active_bounty
    (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
     gold_reward, marks_reward, xp_reward, accepted_at)
  values
    (auth.uid(), v_slot, coalesce(p_bounty_id,''), 'cull', p_difficulty, p_target, v_tier, v_req,
     v_baseline, v_gold, v_marks, v_xp, now())
  on conflict (user_id, slot) do update set
    bounty_id=excluded.bounty_id, b_type=excluded.b_type, difficulty=excluded.difficulty,
    target=excluded.target, tier=excluded.tier, required=excluded.required,
    baseline=excluded.baseline, gold_reward=excluded.gold_reward,
    marks_reward=excluded.marks_reward, xp_reward=excluded.xp_reward, accepted_at=now();

  return jsonb_build_object('ok', true, 'bounty_id', coalesce(p_bounty_id,''),
    'target', p_target, 'tier', v_tier, 'required', v_req, 'baseline', v_baseline,
    'gold', v_gold, 'marks', v_marks, 'xp', v_xp, 'slot', v_slot, 'first_contract', v_first);
end $$;

-- REVOKE BEFORE GRANT. __ungated is the inner body: it is reachable ONLY through
-- the rate-gated wrapper created by 2026-08-23-bounty.sql §9, which this file
-- does not touch. `create or replace` PRESERVES an ACL, so this restates the
-- revoke rather than trusting the previous one to still be there.
revoke execute on function public.hr_accept_bounty__ungated(int, text, text, text, text, bigint)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-CHECK — the properties this file is responsible for ─────────────
do $$
declare
  v_kmin bigint; v_kmax bigint;
  v_flo  bigint; v_fhi bigint;
  v_txt  text;
begin
  -- (a) the constants are the ones src/core/bounty.js authors. (Deliberately NOT
  --     read into v_kmin/v_kmax — tests/bounty-drift.mjs greps this file for a
  --     `into v_kmin, v_kmax from …first_contract_range` to prove the ACCEPT path
  --     takes the floor only, and a self-check that borrowed those names would
  --     make that guard unable to tell the two apart.)
  select kmin, kmax into v_flo, v_fhi from public.hr_bounty_first_contract_range();
  if v_flo <> 15 or v_fhi <> 25 then
    raise exception 'GATE(a): first-contract range is (%,%), expected (15,25)', v_flo, v_fhi;
  end if;

  -- (b) the tier table did NOT move. The ruling adds a bracket; it does not
  --     retune the ladder, and a silent retune here would repay every tier.
  select kmin, kmax into v_kmin, v_kmax from public.hr_bounty_kill_range(1);
  if v_kmin <> 80 or v_kmax <> 120 then
    raise exception 'GATE(b): hr_bounty_kill_range(1) is (%,%), expected (80,120) — the tier '
      'table must be untouched by the first-contract bracket', v_kmin, v_kmax;
  end if;

  -- (c) the probe index exists (the grace read is O(1)-ish, not a ledger scan).
  if not exists (select 1 from pg_indexes where schemaname='public'
                  and tablename='player_ledger' and indexname='player_ledger_bounty_idx') then
    raise exception 'GATE(c): player_ledger_bounty_idx is missing — the grace probe would scan '
      'every ledger row a character owns on every accept';
  end if;

  -- (d) NEITHER helper is client-reachable, and the inner accept body is still shut out.
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, 'public.hr_bounty_first_contract(uuid,integer)', 'execute')
      or has_function_privilege(r, 'public.hr_bounty_first_contract_range()', 'execute');
  if v_txt is not null then
    raise exception 'GATE(d): a first-contract helper is executable by % — it decides a gold clamp', v_txt;
  end if;
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r,
     'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(d): hr_accept_bounty__ungated is executable by % — the rate gate is the '
      'only door and create-or-replace preserved a stale ACL', v_txt;
  end if;

  -- (e) hr_engine must not reach the accept path. The accrual engine settles a
  --     night; it never signs a contract for anybody.
  if has_function_privilege('hr_engine',
       'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)', 'execute') then
    raise exception 'GATE(e): hr_engine can accept a bounty';
  end if;

  -- (f) the restatement kept the refusals that are NOT about kill counts.
  --     A create-or-replace that quietly dropped one of these would look exactly
  --     like a clean apply.
  if position('type_not_server_verifiable' in
        pg_get_functiondef(to_regprocedure(
          'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)'))) = 0 then
    raise exception 'GATE(f): the non-cull refusal is gone from the restated body';
  end if;
  if position('bad_difficulty' in
        pg_get_functiondef(to_regprocedure(
          'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)'))) = 0 then
    raise exception 'GATE(f): the elite/difficulty refusal is gone from the restated body';
  end if;
  if position('tier_locked' in
        pg_get_functiondef(to_regprocedure(
          'public.hr_accept_bounty__ungated(integer,text,text,text,text,bigint)'))) = 0 then
    raise exception 'GATE(f): the combat-level tier gate is gone from the restated body';
  end if;

  raise notice 'first-contract bounty bracket: floor 80->15 at tier 1 for the first 3 journalled turn-ins';
end $$;

-- ── 6. EXECUTED PROBES — the clamp, in a discarded subtransaction ──────────
-- §5 proves the SHAPE. This proves what a real accept actually stores, which is
-- the only thing the player experiences. HR819-discarded subtransaction because
-- the probe writes player_ledger, whose retention guard refuses a fresh DELETE.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000b0-0000-0000-0000-0000000000b0';
  v_slot constant int  := 0;
  v_mon  text;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1) on conflict (user_id, slot) do nothing;

    select monster_id into v_mon from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    if v_mon is null then
      raise exception 'GATE(g): hr_bounty_monsters has no tier-1 monster — the probe cannot run';
    end if;

    -- (a) THE RULING. A fresh character's first contract keeps the count the
    --     board actually drew (15..25) instead of having it raised to 80.
    v := public.hr_accept_bounty__ungated(v_slot, 'probe1', v_mon, 'cull', 'easy', 18);
    if coalesce(v->>'ok','') <> 'true' or (v->>'required')::bigint <> 18 then
      raise exception 'GATE(g): a first contract of 18 kills came back as %', v;
    end if;
    if coalesce((v->>'first_contract')::boolean, false) is not true then
      raise exception 'GATE(g): the envelope does not report first_contract: %', v;
    end if;

    -- (b) THE FLOOR IS STILL A FLOOR. A forged `required` of 1 is raised to 15,
    --     not accepted — the grace widens the range, it does not remove it.
    v := public.hr_accept_bounty__ungated(v_slot, 'probe2', v_mon, 'cull', 'easy', 1);
    if (v->>'required')::bigint <> 15 then
      raise exception 'GATE(g): a forged required=1 was stored as % during the grace', v->>'required';
    end if;

    -- (c) THE CEILING DID NOT MOVE. This is the property that keeps an honest
    --     80-kill contract from a level-2 client intact.
    v := public.hr_accept_bounty__ungated(v_slot, 'probe3', v_mon, 'cull', 'easy', 999);
    if (v->>'required')::bigint <> 120 then
      raise exception 'GATE(g): the tier-1 ceiling is now % — it must stay 120', v->>'required';
    end if;
    v := public.hr_accept_bounty__ungated(v_slot, 'probe4', v_mon, 'cull', 'easy', 80);
    if (v->>'required')::bigint <> 80 then
      raise exception 'GATE(g): an honest 80-kill contract was rewritten to %', v->>'required';
    end if;

    -- (d) THE GRACE EXPIRES. Three journalled turn-ins and the tier floor is
    --     back. THE CONTROL for (a): without this, (a) is satisfied by a server
    --     that simply stopped clamping.
    insert into public.player_ledger (user_id, slot, kind, intent, meta) values
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p1', '{}'::jsonb),
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p2', '{}'::jsonb),
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p3', '{}'::jsonb);
    if public.hr_bounty_first_contract(v_uid, v_slot) then
      raise exception 'GATE(g): the grace survived three journalled turn-ins';
    end if;
    v := public.hr_accept_bounty__ungated(v_slot, 'probe5', v_mon, 'cull', 'easy', 18);
    if (v->>'required')::bigint <> 80 then
      raise exception 'GATE(g): after the grace an 18-kill contract stored % — expected the tier '
        'floor of 80', v->>'required';
    end if;
    if coalesce((v->>'first_contract')::boolean, true) is not false then
      raise exception 'GATE(g): the envelope still reports first_contract after the grace: %', v;
    end if;
    -- …and a NON-bounty ledger row must not count toward the grace.
    if (select count(*) from public.player_ledger
         where user_id = v_uid and kind = 'bounty' and intent like 'bounty_turnin:%') <> 3 then
      raise exception 'GATE(g): the probe ledger rows are not shaped as the grace counts them';
    end if;

    raise exception using errcode = 'HR819', message = 'bounty-first-contract §6 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state  where user_id = '000000b0-0000-0000-0000-0000000000b0')
     or exists (select 1 from public.player_ledger where user_id = '000000b0-0000-0000-0000-0000000000b0')
     or exists (select 1 from public.active_bounty where user_id = '000000b0-0000-0000-0000-0000000000b0')
     or exists (select 1 from auth.users where id = '000000b0-0000-0000-0000-0000000000b0') then
    raise exception 'GATE(g): §6 LEAKED a probe row';
  end if;
end $$;
