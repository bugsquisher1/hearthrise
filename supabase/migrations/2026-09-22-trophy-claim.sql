-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-22-trophy-claim.sql — THE BESTIARY TROPHY: hr_trophy_claim +
-- hr_trophy_of.
--
-- ⚠ STAGED, NOT APPLIED. Security review REQUIRED — it writes a `collection`
--   row and journals to player_ledger, and the ladder it gates feeds a DROP
--   multiplier (the economy). The Coordinator applies, one file per call, via
--   tools/apply-migration.mjs.
--
-- ⚠⚠ APPLY 2026-09-22-state-of-trophy-prefix.sql FIRST. §0 below refuses to
--    install without it, and the reason is in that file's header: 108 kill rows
--    + up to 432 trophy rows + the collection log breach hr_state_of's
--    `limit 1000`, and the failure is SILENT truncation of whatever sorts last
--    — which, under that ORDER BY, is a player's quest state. Installing the
--    writer before the envelope stops carrying what it writes is the one
--    ordering that produces damage.
--
-- Design: docs/design/BESTIARY_LADDER.md §4 (the Game Designer's ruling; every
-- decision in it is final). Engine: src/core/trophies.js. Data + ladder:
-- src/data/bestiary.js. Guard: tests/bestiary-trophy.mjs.
--
-- ── THE SPLIT THAT MAKES THIS CHEAP AND SAFE ────────────────────────────────
-- THE POWER IS DERIVED; THE TROPHY IS CLAIMED.
--   · The drop multiplier is derived from the kill counters on EVERY read
--     (src/core/trophies.js `trophyIndex`). It is never stored. There is no
--     `trophy_stage` column, no residue field, nothing to back-fill for an
--     existing character, and nothing a client can hold ahead of the server. A
--     player who never opens the Bestiary is never behind.
--   · The trophy ROW is claimed by an explicit act, and that row — written only
--     by the function below — is what the collection, the profile and any future
--     ranking read.
-- A stored stage would be a second copy of a derivable fact: a thing that can
-- disagree with the counters, which is the residue-ahead class CLAUDE.md §6
-- names and this codebase has already paid for.
--
-- ── A CLAIM MINTS NOTHING ───────────────────────────────────────────────────
-- No gold, no gems, no items, no XP, no multiplier. That is deliberate and it is
-- what makes the claim RANKED-SAFE BY CONSTRUCTION rather than by a clamp:
-- CLAUDE.md §1's target property is "a forged client value cannot cross into
-- another player's economy or ranking", and a claim that moves no value cannot
-- cross into one however it is forged, replayed or reordered. §5(e) below
-- asserts it by MEASURING gold/gems/xp/inventory across a real claim, not by
-- observing that this file contains no credit.
--
-- ── NO CLIENT VALUE REACHES A DECISION ──────────────────────────────────────
-- The signature has no kill-count parameter, so a forged count is not refused —
-- it is UNREPRESENTABLE. The function reads the total out of `player_progress`
-- itself, inside its own transaction, under the advisory lock the spend RPCs
-- take. `p_monster` is validated against the SERVER's own combat catalogue
-- (`hr_activities`, kind='combat' — 108 rows, generated from src/data/monsters.js
-- by tools/gen-catalogues.mjs) and `p_stage` against the server's own ladder;
-- an unknown id is a refusal, never an insert, because inventing a monster from
-- a client string is how a capability becomes forgeable from a stale save.
--
-- ── SECURITY POSTURE — hr_engine ONLY, MIRRORING hr_bestiary_of ─────────────
-- Both functions are SECURITY DEFINER, `search_path = public, pg_temp`, and
-- executable by `hr_engine` ONLY — revoked from public / anon / authenticated /
-- service_role. This is BESTIARY_LADDER.md §4.2(1), and it is a ruling, not an
-- oversight: every read and write in this architecture is Edge-mediated (the
-- Edge verifies the JWT and passes the verified subject as p_user), so a grant
-- to `authenticated` would only open a second, unfiltered write path over every
-- character's trophies.
--
-- ⚠ CONSEQUENTLY THESE RPCs ARE *NOT* REGISTERED IN hr_client_rpc_baseline, AND
--   THAT ABSENCE IS ASSERTED (§5(b)). That table is the approved CLIENT RPC
--   surface (2026-08-11-grant-hygiene.sql); registering an engine-only function
--   there would declare a client grant nobody granted, and the day someone
--   "restored the baseline" it would BE granted. The client reaches this verb
--   the way it reaches every other one — as an INTENT, `{verb:'trophy_claim',
--   trophy:{monster,stage}}`, through supabase/functions/hr-accrue.
--
-- ── IDEMPOTENCY: TWO DIFFERENT FACTS, KEPT APART ────────────────────────────
--   · A REPLAY of the same `p_idem` returns the stored answer with
--     `replayed:true`. A double-click is not an error.
--   · A NEW key naming a trophy already held is `already_owned`.
-- Both are enforced before any write: the intent claim on
-- `player_intents(user_id, intent_id)` and then the `on conflict do nothing` row
-- count on `player_progress`'s primary key. So the ledger gets EXACTLY ONE row
-- per trophy, ever — asserted in §5(d) by counting them across a replay.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- `drop function public.hr_trophy_claim(uuid,int,text,int,text);` and
-- `drop function public.hr_trophy_of(uuid,int);`. Additive: it creates no table,
-- alters no column, and touches no existing function body. Rows already claimed
-- are inert `collection` rows — they grant nothing, because the power was never
-- theirs to grant.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $mig$
declare v_n int;
begin
  if to_regclass('public.player_state')    is null
     or to_regclass('public.player_progress') is null
     or to_regclass('public.player_ledger')   is null
     or to_regclass('public.player_intents')  is null then
    raise exception 'the player-state foundation is missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- THE SERVER'S OWN MONSTER CATALOGUE. Present AND non-empty: a catalogue that
  -- is present and empty makes every monster unknown, which would read as "the
  -- ladder is closed" rather than as a broken apply — the quiet direction.
  if to_regclass('public.hr_activities') is null then
    raise exception 'hr_activities is absent — apply 2026-08-11-catalogue.generated.sql first. This '
                    'function validates p_monster against it and against nothing else.';
  end if;
  select count(*) into v_n from public.hr_activities where kind = 'combat';
  if v_n = 0 then
    raise exception 'hr_activities holds no combat rows — the monster catalogue is empty, so every '
                    'claim would be refused as unknown_monster';
  end if;

  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'the apply-engine helpers are missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'hr_state_of is missing — apply 2026-08-11-apply-engine.sql first';
  end if;

  -- ⚠⚠ THE HARD PREREQUISITE (BESTIARY_LADDER.md §6). Refusing here is the whole
  --    point of naming it a prerequisite rather than a follow-up: with the
  --    writer installed and the envelope still carrying `trophy:%`, a long-term
  --    character's quest rows start falling off a 1000-row cap silently, and
  --    nothing in the repo would go red.
  if strpos(replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), ''),
            'trophy:%') = 0 then
    raise exception 'hr_state_of does NOT exclude trophy:%% from its generic envelope — apply '
                    '2026-09-22-state-of-trophy-prefix.sql FIRST. Installing this writer without it '
                    'silently truncates a long-term character''s quest state (design section 6).';
  end if;

  -- `player_ledger.kind` needs no widening: the journal below uses 'quest',
  -- which has been in that CHECK since 2026-08-11. Asserted rather than assumed,
  -- because a claim that cannot journal is a claim that raises inside its own
  -- protected block and rolls back — i.e. the feature would be dead, loudly, in
  -- production and nowhere else.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''quest''%') then
    raise exception 'player_ledger''s kind CHECK does not admit ''quest'' — the trophy journal cannot '
                    'be written';
  end if;
end $mig$;

-- ── 1. THE PROJECTION: hr_trophy_of(user, slot) ────────────────────────────
-- Returns table(monster_id text, stage int) — one row per CLAIMED trophy.
--
-- Its own door, beside hr_bestiary_of and hr_collection_of, for the reason
-- 2026-08-20-bestiary.sql gave and 2026-09-22-state-of-trophy-prefix.sql acted
-- on: a projection that depends on an incidental ORDER BY for correctness is a
-- projection that silently loses a trophy to a player with many dailies. It is
-- also the ONLY reason the exclusion above costs nothing.
--
-- THE KEY IS PARSED, NOT TRUSTED. `trophy:<monster>:<stage>` — the monster id is
-- everything between the two separators and the stage is the tail. A row whose
-- tail is not a positive integer, or whose monster segment is empty, is DROPPED
-- rather than returned as a junk trophy: this is a read over a table whose rows
-- only this file's claim function writes, but a projection that would render
-- whatever it found is a projection that renders whatever a future writer leaves.
create or replace function public.hr_trophy_of(p_user uuid, p_slot int)
returns table(monster_id text, stage int)
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  select split_part(pp.key, ':', 2)        as monster_id,
         split_part(pp.key, ':', 3)::int   as stage
    from public.player_progress pp
   where pp.user_id    = p_user
     and pp.slot       = coalesce(p_slot, 0)
     and pp.kind       = 'collection'
     and pp.period_key = ''
     and pp.state      = 'claimed'
     and pp.value      > 0
     and pp.key like 'trophy:%'
     -- Exactly three colon-separated segments, a non-empty monster id, and a
     -- stage that is all digits. `::int` on a non-numeric tail would be a 22P02
     -- that aborts the caller's transaction — on the READ path, which runs on
     -- every accrual.
     and split_part(pp.key, ':', 2) <> ''
     and split_part(pp.key, ':', 3) ~ '^[1-9][0-9]*$'
     and split_part(pp.key, ':', 4) = ''
$body$;

revoke execute on function public.hr_trophy_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_trophy_of(uuid, int) to hr_engine;

-- ── 2. THE CLAIM: hr_trophy_claim(user, slot, monster, stage, idem) ────────
create or replace function public.hr_trophy_claim(
  p_user uuid, p_slot int, p_monster text, p_stage int, p_idem text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_idem   uuid;
  v_need   bigint;
  v_kills  bigint;
  v_key    text;
  v_rows   int;
  v_intent text;
  v_prev        jsonb;
  v_prev_intent text;
  v_prev_slot   int;
  v_res    jsonb;
  v_claimed boolean := false;
  /* ── THE LADDER, SERVER-SIDE ───────────────────────────────────────────────
     Kept in lockstep with `TROPHY_STAGES` in src/data/bestiary.js by
     tests/bestiary-trophy.mjs, which reads BOTH and compares them rather than
     restating either. It is a CATALOGUE and not a parameter: the threshold a
     claim is judged against may never travel on the wire.
     ⚠ THE MULTIPLIERS ARE DELIBERATELY ABSENT. The server stores no drop or
       damage number for a trophy, because the server GRANTS no drop or damage
       number for a trophy — the power is derived by src/core/trophies.js from
       the same counters this function reads. A magnitude in this table would be
       a second, storable copy of a derived fact. */
  c_at constant bigint[] := array[2500, 5000, 10000, 20000];
begin
  -- ── (0) THE SUBJECT. `p_user` is the Edge's VERIFIED JWT subject; this
  --        function is hr_engine-only and there is no auth.uid() on that
  --        connection, so a null subject is a caller error, not a session.
  if p_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- ── (1) SHAPE. A canonical, lowercase, dashed uuid and nothing else — the
  --        same strictness request.js applies at the wire, restated here
  --        because this function must be correct when called by anything.
  --        Postgres would accept `{…}` and the undashed form too and normalise
  --        them on cast, and two spellings of one key are two chances for a
  --        caller to believe it holds two keys.
  if p_idem is null
     or p_idem !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;
  v_idem := p_idem::uuid;

  if p_stage is null or p_stage < 1 or p_stage > array_length(c_at, 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_trophy',
             'detail', jsonb_build_object('stage', p_stage, 'max_stage', array_length(c_at, 1)));
  end if;

  -- ── (2) THE CHARACTER. Before any catalogue work, and before the rate spend:
  --        a slot the caller does not own is not a claim this function can be
  --        asked about at all.
  if not exists (select 1 from public.player_state where user_id = p_user and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (3) THE MONSTER, FROM THE SERVER'S OWN CATALOGUE. An unknown id is a
  --        REFUSAL, never an insert. This is the only place p_monster is
  --        believed, and it is believed only because a row in hr_activities says
  --        so — a table no client role may write.
  if not exists (select 1 from public.hr_activities
                  where kind = 'combat' and activity_id = p_monster) then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'monster', p_monster);
  end if;

  -- ── (4) RATE. The `apply` budget, deliberately NOT a new namespace: a second
  --        writer with its own allowance would enlarge a compromised engine's
  --        total reachable write rate, which is the argument hr_unlock_buy made
  --        and this file reuses verbatim. OUTSIDE the protected block, like
  --        hr_apply's, so spamming refusals is not free — and RECORDED before
  --        the return (and before the intent claim), SAMPLED, because under the
  --        retry storm this exists to detect, one write per rejected call is a
  --        row lock plus a WAL record per request all serialised on one tuple.
  if not public.hr_rate_ok(p_user, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(p_user, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(p_user, v_slot, 'trophy_claim', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(p_user, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (5) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply takes.
  --        Two different keys would let a claim and an accrual run concurrently
  --        on one character, i.e. let the claim read a kill total an in-flight
  --        settle is halfway through writing.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || v_slot::text, 0));

  -- ── (6) IDEMPOTENCY, hr_apply's rules on hr_apply's table. The name carries
  --        the monster AND the stage, because `intent_mismatch` compares exactly
  --        this string and the stage is what changes what the write DOES.
  v_intent := 'trophy_claim:' || p_monster || ':' || p_stage;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = p_user and intent_id = v_idem;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(p_user, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(p_user, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (p_user, v_idem, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════════
  -- All-or-nothing. Every refusal raises through hr_reject (SQLSTATE HR000) and
  -- the handler undoes the whole block, the intent claim included, so a refused
  -- claim leaves NOTHING behind and is retried with a new key.
  begin
    -- ── (7) THE KILL TOTAL, READ HERE AND FROM NOWHERE ELSE. The counter is
    --        `ev:kill_monster:<id>` at kind='stat', period_key='' — written
    --        ONLY by hr_apply out of a SETTLED combat delta (no client write
    --        policy and no client write grant on player_progress; re-asserted in
    --        §5(c)). A hunt that is never settled contributes zero kills to any
    --        ladder. THERE IS NO COUNT PARAMETER ON THIS FUNCTION, so there is
    --        nothing here to disbelieve.
    v_need := c_at[p_stage];
    select coalesce(pp.value, 0) into v_kills
      from public.player_progress pp
     where pp.user_id = p_user and pp.slot = v_slot
       and pp.kind = 'stat' and pp.period_key = ''
       and pp.key = 'ev:kill_monster:' || p_monster;
    v_kills := coalesce(v_kills, 0);
    if v_kills < v_need then
      perform public.hr_reject('not_yet',
        jsonb_build_object('monster', p_monster, 'stage', p_stage,
                           'have', v_kills, 'need', v_need));
    end if;

    -- ── (8) THE ONCE-GUARD *IS* THE WRITE. An insert on the primary key with
    --        `do nothing`; a replay's row_count = 0 is refused BEFORE the
    --        journal, so the ledger holds exactly one row per trophy, ever.
    --        No `value` arithmetic: the row is a FLAG at 1, and a MAX-merge and
    --        a do-nothing converge identically on a column that is only ever
    --        written as 1.
    v_key := 'trophy:' || p_monster || ':' || p_stage;
    insert into public.player_progress
      (user_id, slot, kind, key, period_key, value, state, updated_at)
    values
      (p_user, v_slot, 'collection', v_key, '', 1, 'claimed', now())
    on conflict (user_id, slot, kind, key, period_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      perform public.hr_reject('already_owned',
        jsonb_build_object('monster', p_monster, 'stage', p_stage));
    end if;

    -- ── (9) THE JOURNAL. Append-only, CLAUDE.md §1. Every value column is
    --        ZERO AND EXPLICIT, because this claim moves no value and a journal
    --        row with nulls where the amounts go is a row a future rollup has to
    --        guess about. `kills_at_claim` is the count read under THIS lock, in
    --        the transaction that wrote the row — which is what makes a dispute
    --        resolvable from the ledger alone.
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, skill_id, xp, meta)
    values
      (p_user, v_slot, 'quest', 'trophy_claim', null, 0, 0, null, 0,
       jsonb_build_object('monster', p_monster, 'stage', p_stage,
                          'kills_at_claim', v_kills, 'threshold', v_need));

    -- ── (10) THE ANSWER. `hr_state_of` verbatim — the client renders it and
    --         computes nothing — plus a receipt built from what was READ, never
    --         from what was sent.
    --         ⚠ `version` IS NOT BUMPED. A trophy row is not in the envelope
    --           (2026-09-22-state-of-trophy-prefix.sql took it out) and no
    --           column moved, so there is no optimistic-concurrency reader to
    --           inform; bumping it would force every other tab to reconcile a
    --           state that did not change. hr_trophy_of is the door that moved.
    v_res := public.hr_state_of(p_user, v_slot) || jsonb_build_object(
      'ok', true,
      'claimed', jsonb_build_object('monster', p_monster, 'stage', p_stage,
                                    'kills_at_claim', v_kills));
    update public.player_intents set result = v_res
     where user_id = p_user and intent_id = v_idem;
    return v_res;

  exception when sqlstate 'HR000' then
    -- The refusal code travels verbatim to the Edge, to the client and to
    -- hr_rejections. The intent claim is released so the same key may be
    -- retried once the reason is gone (a 2,500th kill, for instance).
    declare v_code text; v_detail text; begin
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      if v_claimed then
        delete from public.player_intents where user_id = p_user and intent_id = v_idem;
      end if;
      perform public.hr_record_rejection(p_user, v_slot, v_intent, v_code,
        coalesce(nullif(v_detail, '')::jsonb, '{}'::jsonb));
      return jsonb_build_object('ok', false, 'error', v_code)
             || jsonb_build_object('detail', coalesce(nullif(v_detail, '')::jsonb, '{}'::jsonb));
    end;
  end;
end $fn$;

-- ── 3. GRANTS — hr_engine ONLY (revoke before grant) ───────────────────────
-- BESTIARY_LADDER.md §4.2(1). There is no direct-client RPC in this
-- architecture; a grant to `authenticated` would open a second, unfiltered write
-- path over every character's trophies. The client reaches this as an INTENT.
revoke execute on function public.hr_trophy_claim(uuid, int, text, int, text)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_trophy_claim(uuid, int, text, int, text) to hr_engine;

-- ── 4. THE CLIENT RPC BASELINE IS *NOT* TOUCHED ────────────────────────────
-- Deliberately empty. hr_client_rpc_baseline is the approved CLIENT surface
-- (2026-08-11-grant-hygiene.sql); an engine-only function registered there would
-- declare a client grant nobody granted, and the next "restore the baseline"
-- would grant it. §5(b) asserts the ABSENCE, so this comment cannot rot into a
-- file that quietly started registering one.

-- ── 5. SELF-CHECK (§4) — BY EXECUTION, ON PROBE ROWS ONLY ──────────────────
-- Every load-bearing property proven by CALLING the function and reading the
-- answer, not by finding words in the source. Every row touched is one this
-- block created, under two uuids nothing else holds; the whole probe lives in a
-- subtransaction discarded by a sentinel raise (HR846) — which is also the only
-- clean teardown available, because player_ledger's retention trigger refuses to
-- DELETE a fresh row. A leak check runs after it.
-- tests/selfcheck-no-global-dml.mjs is the standing guard on that rule.
do $mig$
declare
  v_r      jsonb;
  v_n      int;
  v_gold0  bigint; v_gold1 bigint; v_gems0 bigint; v_gems1 bigint;
  v_acc0   timestamptz; v_acc1 timestamptz;
  v_ver0   bigint;
  /* SNAPSHOT SUMS, not "is it empty". hr_create_character grants a starting kit
     and starting skill xp, so a probe character owns items and xp before this
     block does anything — an assertion that the bag is EMPTY would be red for a
     reason that has nothing to do with the claim. The honest property is that
     the claim moved NOTHING, so both sides are measured and compared. */
  v_inv0   bigint; v_inv1 bigint; v_xp0 bigint; v_xp1 bigint;
  v_mon    text;
  v_uid    constant uuid := '00000000-0000-4000-c000-770f180a1111';
  v_other  constant uuid := '00000000-0000-4000-c000-770f180a2222';
begin
  -- (a) BOTH FUNCTIONS INSTALLED, AND NEITHER IS CLIENT-EXECUTABLE.
  if to_regprocedure('public.hr_trophy_claim(uuid,integer,text,integer,text)') is null then
    raise exception 'trophy-claim (a): hr_trophy_claim did not install'; end if;
  if to_regprocedure('public.hr_trophy_of(uuid,integer)') is null then
    raise exception 'trophy-claim (a): hr_trophy_of did not install'; end if;
  if has_function_privilege('authenticated', 'public.hr_trophy_claim(uuid,integer,text,integer,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_trophy_claim(uuid,integer,text,integer,text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_trophy_claim(uuid,integer,text,integer,text)', 'execute') then
    raise exception 'trophy-claim (a): hr_trophy_claim is client-executable — a second, unfiltered '
                    'write path over every character''s trophies';
  end if;
  if has_function_privilege('authenticated', 'public.hr_trophy_of(uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_trophy_of(uuid,integer)', 'execute') then
    raise exception 'trophy-claim (a): hr_trophy_of is client-executable'; end if;
  if not has_function_privilege('hr_engine', 'public.hr_trophy_claim(uuid,integer,text,integer,text)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_trophy_of(uuid,integer)', 'execute') then
    raise exception 'trophy-claim (a): hr_engine cannot execute the pair — the feature is dead';
  end if;

  -- (b) AND NEITHER IS IN THE CLIENT RPC BASELINE. See §4: a row here would
  --     declare a client grant nobody granted.
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    select count(*) into v_n from public.hr_client_rpc_baseline
     where proname in ('hr_trophy_claim', 'hr_trophy_of');
    if v_n > 0 then
      raise exception 'trophy-claim (b): % trophy RPC(s) are registered in hr_client_rpc_baseline — '
                      'these are hr_engine-only and must not appear on the client surface', v_n;
    end if;
  end if;

  -- (c) NO CLIENT WRITE SURFACE ON THE COUNTER OR THE TROPHY ROW. Both live in
  --     player_progress. Inherited from player-state; re-asserted because this
  --     file adds a writer over the same table.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_progress'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_n > 0 then
    raise exception 'trophy-claim (c): % client write grant(s) on player_progress — every kill count '
                    'and every trophy would be forgeable', v_n;
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'player_progress' and cmd <> 'SELECT') then
    raise exception 'trophy-claim (c): player_progress grew a non-SELECT policy';
  end if;

  -- ── THE BEHAVIOURAL HALF, ON PROBE ROWS ONLY ────────────────────────────
  begin
    -- A monster the SERVER's catalogue actually names, chosen from the catalogue
    -- rather than hardcoded: a roster rename must not turn this block red for
    -- the wrong reason.
    select activity_id into v_mon from public.hr_activities
     where kind = 'combat' order by activity_id limit 1;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(0);

    select gold, gems, accrued_to, version into v_gold0, v_gems0, v_acc0, v_ver0
      from public.player_state where user_id = v_uid and slot = 0;
    select coalesce(sum(qty), 0) into v_inv0
      from public.player_inventory where user_id = v_uid and slot = 0;
    select coalesce(sum(xp), 0) into v_xp0
      from public.player_skills where user_id = v_uid and slot = 0;

    -- (d1) AN UNKNOWN MONSTER IS REFUSED, AND NOTHING IS WRITTEN. First, because
    --      an id invented from a client string is the forgery this whole
    --      validation exists to stop.
    v_r := public.hr_trophy_claim(v_uid, 0, 'not_a_monster', 1, gen_random_uuid()::text);
    if coalesce(v_r->>'ok','true') <> 'false' or v_r->>'error' <> 'unknown_monster' then
      raise exception 'trophy-claim (d1): an unknown monster was not refused as unknown_monster — got %', v_r;
    end if;

    -- (d2) BELOW THE THRESHOLD IS `not_yet`, AND THE ANSWER STATES THE SERVER'S
    --      OWN COUNT. 2,499 kills is one short of `quarry`.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
    values (v_uid, 0, 'stat', 'ev:kill_monster:' || v_mon, '', 2499, 'active')
    on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;

    v_r := public.hr_trophy_claim(v_uid, 0, v_mon, 1, gen_random_uuid()::text);
    if coalesce(v_r->>'ok','true') <> 'false' or v_r->>'error' <> 'not_yet' then
      raise exception 'trophy-claim (d2): a claim at 2499 kills was not refused as not_yet — got %', v_r;
    end if;
    if (v_r->'detail'->>'have')::bigint <> 2499 or (v_r->'detail'->>'need')::bigint <> 2500 then
      raise exception 'trophy-claim (d2): the not_yet refusal did not state the SERVER''s count — %', v_r;
    end if;
    if exists (select 1 from public.player_progress
                where user_id = v_uid and kind = 'collection' and key like 'trophy:%') then
      raise exception 'trophy-claim (d2): a refused claim still wrote a trophy row';
    end if;

    -- (d3) A FORGED COUNT CANNOT TRAVEL. There is no count parameter, so the
    --      strongest executable statement of it is that the SAME call refused
    --      above now SUCCEEDS the moment the SERVER's own counter crosses — and
    --      nothing the caller can say changes that. One row up.
    update public.player_progress set value = 2500
     where user_id = v_uid and slot = 0 and kind = 'stat'
       and key = 'ev:kill_monster:' || v_mon and period_key = '';

    v_r := public.hr_trophy_claim(v_uid, 0, v_mon, 1, '11111111-1111-4111-8111-111111111111');
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'trophy-claim (d3): the claim at the threshold was refused — %', v_r;
    end if;
    if v_r->'claimed'->>'monster' is distinct from v_mon
       or (v_r->'claimed'->>'stage')::int <> 1
       or (v_r->'claimed'->>'kills_at_claim')::bigint <> 2500 then
      raise exception 'trophy-claim (d3): the receipt does not describe the write — %', v_r->'claimed';
    end if;

    -- EXACTLY ONE progress row and EXACTLY ONE ledger row.
    select count(*) into v_n from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'collection' and key like 'trophy:%';
    if v_n <> 1 then raise exception 'trophy-claim (d3): % trophy rows, expected 1', v_n; end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and intent = 'trophy_claim';
    if v_n <> 1 then raise exception 'trophy-claim (d3): % ledger rows, expected 1', v_n; end if;

    -- (d4) A SECOND CLAIM WITH A *NEW* KEY IS `already_owned`, AND JOURNALS
    --      NOTHING. This is the once-guard; the row count is read before the
    --      journal, so a second ledger row here would mean the guard runs after
    --      the write it guards.
    v_r := public.hr_trophy_claim(v_uid, 0, v_mon, 1, gen_random_uuid()::text);
    if coalesce(v_r->>'ok','true') <> 'false' or v_r->>'error' <> 'already_owned' then
      raise exception 'trophy-claim (d4): a second claim was not refused as already_owned — got %', v_r;
    end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and intent = 'trophy_claim';
    if v_n <> 1 then
      raise exception 'trophy-claim (d4): the refused second claim journalled — % ledger rows', v_n;
    end if;

    -- (d5) A REPLAY OF THE *SAME* KEY IS NOT AN ERROR. A double-click must read
    --      as `replayed`, not as `already_owned`; and it still journals nothing.
    v_r := public.hr_trophy_claim(v_uid, 0, v_mon, 1, '11111111-1111-4111-8111-111111111111');
    if coalesce(v_r->>'ok','false') <> 'true' or coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'trophy-claim (d5): a replay of the same key was not answered replayed — %', v_r;
    end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and intent = 'trophy_claim';
    if v_n <> 1 then raise exception 'trophy-claim (d5): a replay journalled — % ledger rows', v_n; end if;

    -- (e) THE CLAIM MINTED NOTHING, MEASURED. Gold, gems, xp, inventory — and
    --     `accrued_to`, because a verb that stamped the watermark would
    --     confiscate the player's unpaid accrual window (the b372 rule), which
    --     no guard elsewhere can grade for a FUNCTION.
    select gold, gems, accrued_to into v_gold1, v_gems1, v_acc1
      from public.player_state where user_id = v_uid and slot = 0;
    if v_gold1 is distinct from v_gold0 or v_gems1 is distinct from v_gems0 then
      raise exception 'trophy-claim (e): a claim moved currency — gold %→%, gems %→%',
                      v_gold0, v_gold1, v_gems0, v_gems1;
    end if;
    if v_acc1 is distinct from v_acc0 then
      raise exception 'trophy-claim (e): a claim moved accrued_to (%→%) — it would confiscate the '
                      'unpaid accrual window', v_acc0, v_acc1;
    end if;
    select coalesce(sum(qty), 0) into v_inv1
      from public.player_inventory where user_id = v_uid and slot = 0;
    select coalesce(sum(xp), 0) into v_xp1
      from public.player_skills where user_id = v_uid and slot = 0;
    if v_inv1 is distinct from v_inv0 then
      raise exception 'trophy-claim (e): a claim moved the bag — total qty %→%', v_inv0, v_inv1;
    end if;
    if v_xp1 is distinct from v_xp0 then
      raise exception 'trophy-claim (e): a claim granted xp — total %→%', v_xp0, v_xp1;
    end if;

    -- (f) THE PROJECTION READS THE ROW BACK, PARSED, AND IS SCOPED TO ITS OWNER.
    select count(*) into v_n from public.hr_trophy_of(v_uid, 0);
    if v_n <> 1 then raise exception 'trophy-claim (f): hr_trophy_of returned % rows, expected 1', v_n; end if;
    if not exists (select 1 from public.hr_trophy_of(v_uid, 0)
                    where monster_id = v_mon and stage = 1) then
      raise exception 'trophy-claim (f): hr_trophy_of did not parse the key back to (%, 1)', v_mon;
    end if;
    -- A DECOY collection row that is NOT a trophy must not leak into it.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
    values (v_uid, 0, 'collection', 'hunter10', '', 1, 'claimed')
    on conflict (user_id, slot, kind, key, period_key) do nothing;
    select count(*) into v_n from public.hr_trophy_of(v_uid, 0);
    if v_n <> 1 then
      raise exception 'trophy-claim (f): a non-trophy collection row leaked into hr_trophy_of';
    end if;
    -- …and a SECOND character sees none of it. The projection is per (user,slot)
    -- and a trophy is not a public fact about somebody else.
    perform set_config('request.jwt.claim.sub', v_other::text, true);
    insert into auth.users (id) values (v_other) on conflict (id) do nothing;
    perform public.hr_create_character(0);
    select count(*) into v_n from public.hr_trophy_of(v_other, 0);
    if v_n <> 0 then
      raise exception 'trophy-claim (f): another character read % trophies that are not theirs', v_n;
    end if;
    -- …and cannot claim the first character's trophy either: their own counter
    -- is zero, so the answer is `not_yet` and NOT `already_owned`.
    v_r := public.hr_trophy_claim(v_other, 0, v_mon, 1, gen_random_uuid()::text);
    if coalesce(v_r->>'ok','true') <> 'false' or v_r->>'error' <> 'not_yet' then
      raise exception 'trophy-claim (f): a second character''s claim read the FIRST character''s '
                      'counter — got %', v_r;
    end if;

    raise exception using errcode = 'HR846', message = 'trophy-claim section 5 complete — rolling back';
  exception when sqlstate 'HR846' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_progress where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_ledger  where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_intents where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_state   where user_id in (v_uid, v_other))
     or exists (select 1 from auth.users            where id      in (v_uid, v_other)) then
    raise exception 'trophy-claim: section 5 LEAKED a probe row';
  end if;

  raise notice 'trophy-claim PASSED: hr_engine-only and absent from the client baseline, an unknown '
               'monster and a below-threshold claim refused with the server''s own count, one progress '
               'row and one ledger row per trophy, already_owned and replayed kept apart, no currency '
               'no item no xp and no accrued_to movement, and the projection scoped to its owner';
end $mig$;
