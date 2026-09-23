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
-- ── WHICH ROWS A "TROPHIES CLAIMED" RANKING COUNTS (Security F2, 2026-09-22) ─
-- BINDING, and written here because the design promises the board
-- (BESTIARY_LADDER.md §4.3, which now carries the same rule):
--
--     ANY "trophies claimed" ranking counts `player_ledger` rows with
--     intent = 'trophy_claim'. NEVER `player_progress` rows.
--
-- hr_trophy_claim below writes BOTH, in one transaction, and is the only writer
-- this design intends. The database does not enforce that, and saying so is the
-- point of this paragraph: hr_apply admits kind='collection' with any 1..64-char
-- key and `progress_claim` flips a `done` row to `claimed`, so a
-- {kind:'collection', key:'trophy:<id>:<stage>', state:'done'} delta plus a
-- progress_claim produces a row hr_trophy_of returns WITH NO LEDGER ROW BESIDE
-- IT. Not reachable from a browser — parseIntent / INTENT_KEYS carry no progress
-- or delta field and hr_put_client_state writes only player_state.client_state —
-- so it needs a compromised Edge, and it mints nothing and crosses to nobody
-- either way. It is still the difference between a ranked count that only
-- hr_trophy_claim can author and one that a second writer can: player_ledger is
-- append-only and trigger-protected, player_progress is a projection table.
-- RANK THE JOURNAL.
--
-- ⚠ THE REAL RESERVATION IS NOT IN THIS FILE, DELIBERATELY. Making hr_apply
--   refuse `key like 'trophy:%'` is another restatement of the repo's
--   highest-traffic writer, which does not belong in the lane that created the
--   namespace — it is filed as a lane-C follow-up on docs/planning/PRIORITY_BOARD.md.
--   Until it lands, the rule above is what keeps the ranking honest.
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
do $$
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
end $$;

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
     -- stage that is a SMALL positive integer. Both casts that can abort the
     -- caller's transaction are bounded away here, and it took two passes to
     -- see the second:
     --   22P02  a non-numeric tail. The digit class closes it.
     --   22003  a NUMERIC tail that does not fit in `int`. `^[1-9][0-9]*$`
     --          admits `trophy:goblin:99999999999`, and the `::int` in the
     --          target list above then overflows (Security F1, 2026-09-22,
     --          proof S-1). ⚠ WHY THAT IS NOT MERELY UNTIDY: this read runs on
     --          EVERY accrual (hr-accrue/index.ts), and the savepoint around it
     --          degrades on 42883 ONLY — so a 22003 rethrows and kills the
     --          whole accrual read for that character, permanently, with no
     --          way for the player out of it.
     -- `{0,2}` is the ladder's own shape with room to grow: TROPHY_STAGES has
     -- four rungs, 999 is three orders above it, and every value the class
     -- admits fits in `int` by construction rather than by luck.
     and split_part(pp.key, ':', 2) <> ''
     and split_part(pp.key, ':', 3) ~ '^[1-9][0-9]{0,2}$'
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

-- ── 4b. hr_assert_grant_hygiene — admit the TWO new engine grants ──────────
-- GENERATED by tools/derive-grant-hygiene.mjs (LINKS[9]) from
-- 2026-09-11-quartermaster-buy.sql's committed body, INSERTIONS ONLY (two
-- entries at the head of c_engine_allow). Do NOT hand-edit; `--check` is a
-- preflight in tests/run-smoke.mjs and PART 1f-ii walks this as the chain's
-- TENTH link. This file becomes the CURRENT LAST TOUCHER of the detector, so the
-- body below carries every entry every earlier link recorded — and it MUST APPLY
-- AFTER 2026-09-11-quartermaster-buy.sql.
--
-- ⚠ WHY THIS SECTION EXISTS AT ALL, since §3 grants nothing to a CLIENT role:
--   check (7) is the hr_engine CAPABILITY PIN. Every function the engine may
--   execute is an allowlist entry carrying a written justification, and a grant
--   that is correct but unrecorded is still a finding — the detector is doing
--   its job. The in-page suite caught exactly that on this branch before this
--   section was written: `engine_execute_outside_allowlist: ["hr_trophy_claim
--   (uuid,integer,text,integer,text)", "hr_trophy_of(uuid,integer)"]`.
--   The fix is to record the reviewed intent, never to widen the check.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
-- `create or replace` PRESERVES the existing ACL, so on a database that already
-- ran grant-hygiene this is belt-and-braces. Restated anyway (the lesson of every
-- restated body in this tree): a detector that arrives PUBLIC-executable for one
-- migration is a detector an attacker can read the allowlist out of. No `grant`
-- line — this adds no capability to anybody; it only records the reviewed
-- engine-only grants §3 already made.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 5. SELF-CHECK (§4) — BY EXECUTION, ON PROBE ROWS ONLY ──────────────────
-- Every load-bearing property proven by CALLING the function and reading the
-- answer, not by finding words in the source. Every row touched is one this
-- block created, under two uuids nothing else holds; the whole probe lives in a
-- subtransaction discarded by a sentinel raise (HR846) — which is also the only
-- clean teardown available, because player_ledger's retention trigger refuses to
-- DELETE a fresh row. A leak check runs after it.
-- tests/selfcheck-no-global-dml.mjs is the standing guard on that rule.
do $$
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

    -- (f2) AN OUT-OF-RANGE STAGE IS DROPPED, NOT CAST (Security F1, proof S-1).
    --      PROBE ROWS ONLY: one row, under v_uid, inside the rolled-back
    --      subtransaction, exactly like the decoy above. The property is proven
    --      by CALLING the projection and requiring it to ANSWER — a marker
    --      search would say nothing about what Postgres does with the row.
    --      11 digits is past int4 and inside int8, so the old `^[1-9][0-9]*$`
    --      passed it to the `::int` in the target list and raised 22003 on the
    --      accrual read path, which degrades on 42883 only.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
    values (v_uid, 0, 'collection', 'trophy:' || v_mon || ':99999999999', '', 1, 'claimed')
    on conflict (user_id, slot, kind, key, period_key) do nothing;
    begin
      select count(*) into v_n from public.hr_trophy_of(v_uid, 0);
    exception when sqlstate '22003' then
      raise exception 'trophy-claim (f2): an out-of-range stage overflowed hr_trophy_of''s ::int '
                      '(SQLSTATE 22003). This read runs on every accrual and its savepoint degrades '
                      'on 42883 ONLY, so this character''s progression reads are dead for good';
    end;
    if v_n <> 1 then
      raise exception 'trophy-claim (f2): hr_trophy_of returned % rows beside the one real trophy — '
                      'an out-of-range stage was RENDERED rather than dropped', v_n;
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
               'no item no xp and no accrued_to movement, an out-of-range stage dropped rather than '
               'cast, and the projection scoped to its owner';
end $$;
