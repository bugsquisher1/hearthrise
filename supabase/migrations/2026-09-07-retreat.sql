-- ============================================================================
-- 2026-09-07-retreat.sql — THE RETREAT (Recovery Rule rev. 3).
--
-- RESTATEMENT-DEBT-ACK: hr_apply and hr_state_of are 10 anchored patches deep
-- each; a `create or replace` restatement derived from the last static chain
-- link would silently ERASE every programmatic patch applied since it (rested
-- XP, bank, client_state, combat_style, combat_xp_accrued_to, dungeon_scrip,
-- recovering_until, the death ledger) — the single most destructive statement
-- available in this repository, and one that would self-check GREEN. The
-- restatement is cleanup slice 7's work, with a replayed body to diff against;
-- this file adds one column and takes the same anchored-insert idiom every
-- predecessor used, with an exactly-once assertion on every anchor before a
-- byte is written.
--
-- Design ruling (Principal Game Designer, 2026-09-07): THE REALM DOES NOT KEEP
-- SWINGING A FIGHT IT HAS PROVEN THE HERO CANNOT WIN. On the 3rd CONSECUTIVE
-- fall with an empty bag AT THE FALL — or the 6th consecutive fall whatever the
-- bag held — the hero pulls back to camp: the activity pointer goes idle and the
-- rest of the window accrues as nothing. ANY kill resets the counter to zero,
-- which is the whole design: a hero who can win at all never retreats.
--
-- WHAT IT FIXES, measured on the QA account 2026-09-07: max_hp 13, dark wizard,
-- empty bag — 28 falls in one day, 42 lifetime, every fall charging the ladder's
-- 64-minute cap, resuming at 6 HP and face-down again inside a minute. About one
-- kill an hour, for ever, with nothing on any surface saying why. Rev. 2 removed
-- the beta's death CLIFF and left a silent busy-wait in its place.
--
-- MEASURED ON THIS ENGINE (tools A/B, counter absent vs present, 12h, 8 seeds):
--   · the QA night (dark wizard, 13 HP, empty bag): 3 falls then out, 2.6 min in,
--     the remaining 11h 57m credited as idle — was ~22 falls and ~0 progress.
--   · a foodless 10 HP hero on a slime: 62 kills -> 26 kills across 8 seeds. It
--     is a real reduction of an already-negligible night (about 7 kills per 12h
--     under rev. 2's ladder) bought in exchange for a run that ENDS and a
--     sentence that names the fix.
--   · a FED hero on the same slime: 1,997 kills, 13 falls, NEVER retreats —
--     the ruling's premise, measured rather than assumed.
--
-- Governing rule: CLAUDE.md §1 "server-authoritative, nothing authored by the
-- client". Engine halves that ship with this file (EDGE REDEPLOY REQUIRED):
--   src/core/away.js                         retreatAtFall + the two rungs (a TABLE)
--   src/core/combat-sim.js                   STOP_REASON.RETREAT, the counter,
--                                            the foodless-at-the-fall read, forecastFight
--   supabase/functions/hr-accrue/accrual.js  seeds the counter, idles the pointer,
--                                            proposes consec_falls
--   supabase/functions/hr-accrue/index.ts    reads consec_falls off the row
--   supabase/functions/hr-accrue/set-activity.js  the same read on the COLLECT path
--
-- ── WHAT IS ADDED ────────────────────────────────────────────────────────────
--   §1  player_state.consec_falls int NOT NULL DEFAULT 0
--   §2  hr_state_of — projects consec_falls (programmatic, additive)
--   §3  hr_apply    — allowlists 'consec_falls', VALIDATES it against a blast
--                     radius, and WRITES it ABSOLUTE (programmatic)
--   §4  self-check  — every load-bearing property, proven on apply by EXECUTING
--                     SQL, not by grepping for markers
--
-- ⚠ PROGRAMMATIC, NOT A create-or-replace — see the ACK at the head of this
--   file. Both patches NO-OP on re-apply (they test for their own marker
--   first), so the file is idempotent and the second apply is byte-identical.
--
-- ── WHY `not null default 0` AND NOT A NULLABLE COLUMN ──────────────────────
-- The opposite call from `recovering_until` two files ago, and deliberately.
-- There, NULL is a MEANINGFUL value ("this character is on their feet") and a
-- default of any kind would have knocked every existing character out at the
-- instant of the migration. Here the column is a COUNT, zero is the honest
-- reading for every existing character (nobody has fallen since a kill that this
-- database has any record of), and a nullable count would force every reader to
-- coalesce — which is the shape that eventually reads NULL as "unknown, assume
-- the worst" somewhere. `0` backfills every existing row to "has not fallen",
-- which is the UNDER-charging direction: the ruling's §10 says consec_falls
-- starts at 0 for everyone and there is NO retroactive repair of the QA
-- character (CLAUDE.md §2 — player state is never fabricated).
--
-- ── THE RAISE/CLAMP RULE, STATED ────────────────────────────────────────────
-- consec_falls is **ABSOLUTE and FREELY SETTABLE within [0, c_max_consec_falls]**
-- — NOT raise-only, and that is the third distinct posture in this schema, so it
-- is written down rather than inferred:
--   · `recovering_until` is RAISE-FORWARD-ONLY while it is running
--     (2026-09-06-cadence-recovery-floor.sql): a delta that shortens or cancels
--     a live knockout is REFUSED, because recovery is a COST and a client-side
--     engine bug must not be able to hand out amnesty.
--   · `consec_falls` may legitimately go DOWN, to exactly one value and for
--     exactly one reason: a KILL resets it to 0 (src/core/combat-sim.js
--     `resolveKill`). That reset is the rule's core — "reset by ANY kill" is
--     what makes the trigger CONSECUTIVE falls rather than a daily cap — and a
--     raise-only column could not express it.
--   · SECURITY POSTURE OF THAT ASYMMETRY, for the reviewer: a compromised engine
--     that pinned this to 0 for ever would buy NOTHING. Retreating is not a
--     reward and not a currency; suppressing it only leaves the character
--     grinding a fight that pays nothing, which is precisely the state that
--     existed before this file. The column moves no value, enters no
--     conservation sum, and gates no capability a player would want. It is
--     therefore validated for SHAPE and BLAST RADIUS only.
--   · REFUSED, NEVER SILENTLY CLAMPED — the bad_tool_carry / bad_fight /
--     bad_recovering posture. Repairing an impossible value is how a compromised
--     engine's bug becomes the server's opinion.
--
-- ── THE BLAST RADIUS IS NOT A BALANCE NUMBER ────────────────────────────────
-- `c_max_consec_falls` is 64. The shipped rungs are 3 (foodless) and 6 (any), so
-- the engine can never honestly propose more than 6 — and the ceiling is
-- deliberately an order of magnitude above that, because THE REV-1-TO-REV-2
-- CEILING DEFECT MUST NOT BE REPEATED (see 2026-09-06-recovering-until.sql
-- self-check (i): a 15-minute blast radius silently refused every honest stamp
-- from the fifth fall of a day onward, deleting the top of the ladder in
-- production while every JS test passed against the table). A designer raising
-- RETREAT_ANY_FALLS to 8 or 12 must not need an SQL migration to do it. 64 is
-- still a blast radius: it stops a compromised engine parking an absurd number
-- in a column the client can read.
--
-- ── WHY IT IS NOT VOIDED BY AN ACTIVITY SWITCH ──────────────────────────────
-- The same call `recovering_until` made, for the same reason (exploit R2), and
-- it matters MORE here because a retreat IDLES THE POINTER — so the very next
-- thing that happens after a retreat is an activity change. If an `activity` key
-- voided this column, every retreat would clear its own counter on the way out
-- and the next three falls would start from zero: the rule would still fire, but
-- "switch to fishing and back" would be a free reset of a cost. §4(c) asserts
-- that absence, because an absence is not otherwise reviewable.
--
-- ── COST, AT 100x PLAYERS ────────────────────────────────────────────────────
-- One `int not null default 0` on player_state: 4 bytes per character, no new
-- table, no new index, no per-tick row, no per-fall row (the death ledger
-- 2026-09-06-recovering-until.sql §3f already writes those and this file adds
-- none). The retreat reaches the ledger through the apply row that already
-- exists — `meta.k` names the delta keys, so a retreat's apply row carries both
-- `activity` and `consec_falls` and is identifiable without a second event.
--
-- ⚠ KNOWN LIMITATION, TRACKED, NOT FIXED HERE. The death-ledger row for the
--   RETREATING fall is not marked as such — it looks like any other fall. The
--   pair (`activity` + `consec_falls` in one apply's `meta.k`, with a death row
--   at the same instant) identifies it, and marking the row would mean a further
--   anchored patch to a fan-out that a previous migration inserted, deepening a
--   chain this file is already acknowledging debt on. Slice 7's restatement is
--   the place to add it.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive, and reversible WITHOUT restating either function: the patches are
-- anchored inserts, so reverting is `pg_get_functiondef` minus the inserted
-- blocks, or simply leaving them in place — an engine that never proposes
-- `consec_falls` leaves the column at 0 for ever and the game behaves exactly as
-- it does today.
-- THE TWO HALVES ARE SAFE IN EITHER ORDER, which is the property every column in
-- this schema is built to have, and here it is enforced in the ENGINE rather
-- than asserted in prose: `resolveDeath` gates the ENTIRE rule on the counter
-- field being a number, and accrual.js seeds `null` (not 0) when hr_state_of
-- does not project the key. So an Edge deployed AHEAD of this migration never
-- retreats anybody, and this migration applied ahead of the Edge simply leaves a
-- column of zeroes that nothing reads.
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
-- Every anchor this file edits, asserted EXACTLY ONCE before anything is
-- written. A `replace()` whose anchor is absent is a silent no-op that leaves a
-- function half-patched and a migration reporting success; an anchor that
-- matches TWICE lands the insert in whichever arm came first, which is worse.
do $mig$
declare
  v_apply text; v_state text; v_n int;
  -- The anchors, named so the failure message can say which one moved.
  c_a_keys   constant text := $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$;
  c_a_codes  constant text := $anc$    'version_conflict',$anc$;
  c_a_decl   constant text := $anc$  v_fight jsonb;$anc$;
  c_a_valid  constant text := $anc$    if p_delta ? 'workers' then$anc$;
  c_a_set    constant text := $anc$           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$;
  c_a_proj   constant text := $anc$      'recovering_until', v_st.recovering_until,$anc$;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing - run schema.sql + the player-state migrations first';
  end if;
  select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) into v_apply;
  select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) into v_state;
  if v_apply is null or v_state is null then
    raise exception 'hr_apply/hr_state_of missing - apply the player-state chain first';
  end if;

  -- EXACTLY ONCE, each. (length - length(replace(...))) / length(anchor) counts
  -- occurrences without a regex, so an anchor containing regex metacharacters
  -- (and several of these do) cannot be mis-counted.
  v_n := (length(v_apply) - length(replace(v_apply, c_a_keys, ''))) / length(c_a_keys);
  if v_n <> 1 then raise exception 'hr_apply: the c_delta_keys anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_codes, ''))) / length(c_a_codes);
  if v_n <> 1 then raise exception 'hr_apply: the c_release_codes anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_decl, ''))) / length(c_a_decl);
  if v_n <> 1 then raise exception 'hr_apply: the declare anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_valid, ''))) / length(c_a_valid);
  if v_n <> 1 then raise exception 'hr_apply: the validation-block anchor appears % time(s), expected exactly 1 (apply 2026-08-25-workers.sql first)', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_set, ''))) / length(c_a_set);
  if v_n <> 1 then raise exception 'hr_apply: the SET-clause anchor appears % time(s), expected exactly 1 (apply 2026-08-17-fight-carry.sql first)', v_n; end if;
  v_n := (length(v_state) - length(replace(v_state, c_a_proj, ''))) / length(c_a_proj);
  if v_n <> 1 then raise exception 'hr_state_of: the recovering_until projection anchor appears % time(s), expected exactly 1 (apply 2026-09-06-recovering-until.sql first)', v_n; end if;

  -- The Recovery chain this file EXTENDS. Retreating is a rung under the
  -- ladder, not a replacement for it: without recovering_until there is nothing
  -- for the retreating fall to charge and the rule is half a rule.
  if strpos(v_apply, 'bad_recovering') = 0 then
    raise exception 'hr_apply does not know recovering_until - apply 2026-09-06-recovering-until.sql first';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_reject missing - apply the apply-engine chain first';
  end if;
end $mig$;

-- ── 1. THE RETREAT COUNTER ───────────────────────────────────────────────────
-- CONSECUTIVE falls with no kill between them. `not null default 0` — see the
-- header for why this is the opposite call from recovering_until's nullable
-- column. Written ONLY by hr_apply, from a delta the engine proposes and §3b
-- re-validates; §4(f) asserts there is no client write policy on the table.
alter table public.player_state add column if not exists consec_falls int not null default 0;

-- The CHECK is the schema's own half of the blast radius, so the invariant
-- survives even a future writer that skips hr_apply. Deliberately WIDE (see the
-- header: a ceiling that tracks a balance number is the rev-1-to-rev-2 defect).
-- NOT VALID is not used: the column was created with a default of 0 one
-- statement ago, so every existing row already satisfies it and a full validate
-- is a scan of a table with tens of rows.
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_consec_falls_sane') then
    alter table public.player_state
      add constraint player_state_consec_falls_sane
      check (consec_falls >= 0 and consec_falls <= 64);
  end if;
end $mig$;

-- ── 2. hr_state_of — PROJECT consec_falls (programmatic, additive) ───────────
-- Its presence in the envelope is what tells the accrual engine the server owns
-- the counter, and its ABSENCE is what makes an Edge deployed ahead of this
-- migration behave exactly as it did before (accrual.js seeds `null`, and
-- src/core/combat-sim.js `resolveDeath` gates the whole rule on the field being
-- a number). The client reads the same key to render "You pulled back" without
-- inventing a count of its own.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'consec_falls') > 0 then
    raise notice 'hr_state_of already projects consec_falls - skipping';
  else
    v_def := replace(v_def,
      $anc$      'recovering_until', v_st.recovering_until,$anc$,
      $anc$      'recovering_until', v_st.recovering_until,
      -- THE RETREAT (Recovery rev. 3): CONSECUTIVE falls with no kill between
      -- them. Flat, beside the recovery line, because they are two halves of one
      -- survival rule and a nested bag would let a missing column hide behind a
      -- default. It is `not null default 0`, so unlike recovering_until there is
      -- no "present but null" state to distinguish - the KEY'S PRESENCE alone is
      -- the engine's switch, and its absence is the pre-Retreat behaviour.
      'consec_falls', v_st.consec_falls,$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_apply — ALLOWLIST + VALIDATE + WRITE (programmatic, additive) ──────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'consec_falls') > 0 then
    raise notice 'hr_apply already handles consec_falls - skipping';
  else
    -- 3a. THE ALLOWLIST. One ABSOLUTE engine-output key, like tool_carry / fight
    --     / ammo_carry / recovering_until.
    --     Inserted at the HEAD of the array rather than appended to its
    --     terminator, deliberately and for the reason
    --     2026-09-06-recovering-until.sql states: the terminator is whatever the
    --     most recent programmatic patcher left there, and an anchor that moves
    --     with every future slice is an anchor that eventually matches nothing
    --     and no-ops IN SILENCE.
    v_def := replace(v_def,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- THE RETREAT (Recovery rev. 3): consecutive falls with no kill between
    -- them. An ABSOLUTE non-negative integer. Engine output, never client input;
    -- validated at (4a-c) below and written in the SET clause. It moves NO VALUE
    -- - it gates nothing a player wants and enters no conservation sum - so it
    -- is checked for SHAPE and BLAST RADIUS only. See the file header's
    -- "raise/clamp rule" for why it is not raise-only.
    'consec_falls',$anc$);

    -- 3b. THE RELEASE CODE. `bad_consec_falls` is a SHAPE refusal whose answer
    --     depends on nothing but the delta itself, so it takes the
    --     bad_fight / bad_recovering posture: releasing the idempotency key is
    --     harmless (the block rolled back) and withholding it would brick a key
    --     for up to 25 hours on a client-side engine bug a redeploy fixes.
    v_def := replace(v_def,
      $anc$    'version_conflict',$anc$,
      $anc$    'version_conflict', 'bad_consec_falls',$anc$);

    -- 3c. THE DECLARE + THE BLAST RADIUS. 64 is an order of magnitude above the
    --     shipped rungs (3 foodless / 6 any, src/core/away.js) ON PURPOSE: a
    --     ceiling that tracks a balance number is the rev-1-to-rev-2 defect this
    --     schema has already paid for once. REFUSED, never clamped.
    v_def := replace(v_def,
      $anc$  v_fight jsonb;$anc$,
      $anc$  -- Recovery rev. 3: the validated retreat counter. c_max_consec_falls is a
  -- BLAST RADIUS, not a balance number - the rungs live in src/core/away.js
  -- (RETREAT_FOODLESS_FALLS 3, RETREAT_ANY_FALLS 6) and a designer must be able
  -- to move them without an SQL migration. This only stops a compromised engine
  -- parking an absurd number in a column the client reads.
  v_consec numeric;
  c_max_consec_falls constant int := 64;
  v_fight jsonb;$anc$);

    -- 3d. THE VALIDATION BLOCK (4a-c), inserted before the worker block.
    --     Server authority §1: the Edge Function decides WHAT should happen,
    --     Postgres decides WHETHER IT MAY.
    v_def := replace(v_def,
      $anc$    if p_delta ? 'workers' then$anc$,
      $anc$    -- (4a-c) THE RETREAT COUNTER (Recovery rev. 3). Consecutive falls with no
    -- kill between them; ANY kill resets it to 0, which is what makes the rule
    -- "consecutive" rather than "N a day". Both callers - the away span
    -- (src/core/combat-sim.js simulateSpan) and the live tick through the same
    -- resolveDeath - move it through ONE engine, so there is no second code path
    -- and no second opinion about what the count is.
    --
    -- It may go DOWN as well as up, unlike recovering_until (which is
    -- raise-forward-only while running, 2026-09-06-cadence-recovery-floor.sql):
    -- a kill legitimately resets it to zero and a raise-only column could not
    -- express the rule. That is safe because the column moves no value - see the
    -- file header's "raise/clamp rule" for the full security argument.
    --
    -- FRACTIONS ARE REFUSED, not truncated. `::int` would silently accept 2.9 as
    -- 2 and the engine would be one fall out with nothing to show for it; a
    -- fractional count is an engine bug and must surface as one.
    if p_delta ? 'consec_falls' then
      if jsonb_typeof(p_delta->'consec_falls') <> 'number' then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('type', jsonb_typeof(p_delta->'consec_falls')));
      end if;
      v_consec := (p_delta->>'consec_falls')::numeric;
      if v_consec <> trunc(v_consec) then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('why', 'not an integer', 'n', p_delta->'consec_falls'));
      end if;
      if v_consec < 0 or v_consec > c_max_consec_falls then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('why', 'out of range', 'n', p_delta->'consec_falls',
                             'limit', c_max_consec_falls));
      end if;
    end if;

    if p_delta ? 'workers' then$anc$);

    -- 3e. THE WRITE. ABSOLUTE: absent key = untouched, present = set.
    --     ⚠ AND IT IS DELIBERATELY *NOT* VOIDED BY AN `activity` KEY, unlike
    --       `fight` directly below it - and the point bites harder here than it
    --       did for recovering_until, because a RETREAT IDLES THE POINTER, so an
    --       `activity` key is present in the very delta that sets this counter
    --       to its trigger value. Voiding on `activity` would make every retreat
    --       clear its own counter on the way out. §4(c) asserts that absence.
    v_def := replace(v_def,
      $anc$           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$,
      $anc$           -- Recovery rev. 3: an ABSOLUTE count, validated at (4a-c). Absent key =
           -- untouched; present = set. NOT voided by an `activity` key (see 3e).
           consec_falls = case when p_delta ? 'consec_falls'
                               then v_consec::int else consec_falls end,
           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$);

    execute v_def;
  end if;
end $mig$;

-- ── 4. SELF-CHECK — the load-bearing properties, proven on apply ─────────────
-- A migration that cannot prove its own claims is a claim. Everything below is
-- EXECUTED: the column is written and read, the constraint is fired, the
-- functions are inspected for the blocks that must exist and for the ones that
-- must NOT.
do $mig$
declare v_apply text; v_state text; v_cnt int; v_ok boolean;
begin
  -- (a) THE COLUMN EXISTS, IS NOT NULL, AND DEFAULTS TO 0. All three: a nullable
  --     count forces every reader to coalesce, and a non-zero default would
  --     start every existing character part-way up a ladder they never climbed.
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'consec_falls' and is_nullable = 'NO'
     and data_type = 'integer' and column_default like '0%';
  if v_cnt <> 1 then
    raise exception 'retreat self-check (a): consec_falls is missing, nullable, not an integer, or not defaulted to 0 (%)', v_cnt;
  end if;

  -- (a-ii) NOBODY WAS RETROACTIVELY PUNISHED (ruling §10, CLAUDE.md §2 "player
  --        state is never fabricated"). Every existing row must read 0 after
  --        this migration - the QA character included. If any row is non-zero,
  --        something in this file wrote player state, which it must never do.
  select count(*) into v_cnt from public.player_state where consec_falls <> 0;
  if v_cnt <> 0 then
    raise exception 'retreat self-check (a): % row(s) start with a non-zero consec_falls - this migration fabricated player state', v_cnt;
  end if;

  -- (a-iii) THE CHECK CONSTRAINT ACTUALLY BITES — proven by EVALUATING THE
  --         INSTALLED EXPRESSION, three times, at -1 / 65 / 3.
  --
  --   ⚠ WHY NOT "insert a bad row and catch the error". Two reasons, and the
  --     first is the rule: player_state is PLAYER STATE, and CLAUDE.md §2 says
  --     no migration writes a row to test something. The second is that it would
  --     be a FALSE GREEN — player_state.user_id carries a foreign key, so a
  --     throwaway row is refused by the FK before the CHECK is ever consulted,
  --     and a `when others then it_bit := true` would report a constraint that
  --     had been quietly widened to `>= -1000` as working perfectly.
  --   ⚠ WHY NOT "read pg_constraint and look for the text". A constraint that
  --     exists and is NOT VALID, or whose expression was widened, reads
  --     identically in the catalogue and stops nothing. `convalidated` is
  --     asserted below as well, but the expression is EXECUTED here.
  --
  --   `pg_get_expr` returns the installed predicate; substituting the column
  --   name for a literal evaluates that exact predicate at a chosen point.
  declare v_expr text;
  begin
    select pg_get_expr(conbin, conrelid) into v_expr from pg_constraint
     where conrelid = 'public.player_state'::regclass
       and conname = 'player_state_consec_falls_sane';
    if v_expr is null then
      raise exception 'retreat self-check (a): player_state_consec_falls_sane is missing';
    end if;
    execute format('select (%s)', replace(v_expr, 'consec_falls', '(-1)')) into v_ok;
    if v_ok is not false then
      raise exception 'retreat self-check (a): the CHECK admits a NEGATIVE consec_falls (%)', v_expr;
    end if;
    execute format('select (%s)', replace(v_expr, 'consec_falls', '(65)')) into v_ok;
    if v_ok is not false then
      raise exception 'retreat self-check (a): the CHECK admits a consec_falls above the blast radius (%)', v_expr;
    end if;
    -- AND IT ADMITS AN HONEST COUNT. A constraint that refuses everything would
    -- pass both assertions above and break every settle in production.
    execute format('select (%s)', replace(v_expr, 'consec_falls', '(6)')) into v_ok;
    if v_ok is not true then
      raise exception 'retreat self-check (a): the CHECK refuses the shipped rung of 6 (%)', v_expr;
    end if;
  end;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_consec_falls_sane' and convalidated) then
    raise exception 'retreat self-check (a): player_state_consec_falls_sane is missing or NOT VALID';
  end if;

  v_apply := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  v_state := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);

  -- (b) ACCEPTED, VALIDATED AND WRITTEN — three separate facts. A body that
  --     accepts the key without validating it is worse than one that rejects it,
  --     because it looks like it works.
  if strpos(v_apply, $q$    'consec_falls',$q$) = 0 then
    raise exception 'retreat self-check (b): c_delta_keys does not carry consec_falls - every settle would 409 unknown_delta_key';
  end if;
  if strpos(v_apply, $q$if p_delta ? 'consec_falls' then$q$) = 0
     or strpos(v_apply, 'bad_consec_falls') = 0 then
    raise exception 'retreat self-check (b): the (4a-c) validation block is missing';
  end if;
  if strpos(v_apply, $q$consec_falls = case when p_delta ? 'consec_falls'$q$) = 0 then
    raise exception 'retreat self-check (b): the SET clause does not write consec_falls';
  end if;
  if strpos(v_apply, $q$'version_conflict', 'bad_consec_falls',$q$) = 0 then
    raise exception 'retreat self-check (b): bad_consec_falls is not a release code - a shape bug would brick a key for 25h';
  end if;
  -- The fraction refusal specifically. `::int` truncation is the silent failure
  -- this exists to prevent, and it would leave every other check above green.
  if strpos(v_apply, 'v_consec <> trunc(v_consec)') = 0 then
    raise exception 'retreat self-check (b): a fractional consec_falls would be truncated rather than refused';
  end if;

  -- (c) THE ABSENCE THAT MATTERS MOST. consec_falls must NOT be voided by an
  --     activity key — and a RETREAT IDLES THE POINTER, so the delta that sets
  --     this counter to its trigger value ALWAYS carries `activity`. If this
  --     ever became a void, every retreat would clear its own counter on the way
  --     out and "switch away, switch back" would be a free reset.
  if v_apply ~ $q$consec_falls = case when p_delta \? 'activity'$q$ then
    raise exception 'retreat self-check (c): consec_falls is voided by an activity switch - every retreat would erase its own counter';
  end if;

  -- (d) THE ENVELOPE PROJECTS IT. Without this the engine can never learn the
  --     column exists, will never propose the key, and the feature is inert.
  if strpos(v_state, $q$'consec_falls', v_st.consec_falls$q$) = 0 then
    raise exception 'retreat self-check (d): hr_state_of does not project consec_falls';
  end if;

  -- (e) NOTHING WAS ERASED. The programmatic patches that landed after the last
  --     static chain link must all still be there — this is the whole reason
  --     this file is an anchored insert and not a create-or-replace, and the
  --     reason its RESTATEMENT-DEBT-ACK is at the head of the file.
  if strpos(v_state, 'rested_xp') = 0 or strpos(v_state, 'workers_accrued_to') = 0
     or strpos(v_state, 'inventory_complete') = 0 or strpos(v_state, $q$'fight', v_st.fight$q$) = 0
     or strpos(v_state, 'recovering_until') = 0 or strpos(v_state, 'deaths_lifetime') = 0
     or strpos(v_state, 'auto_eat_touched') = 0 then
    raise exception 'retreat self-check (e): hr_state_of lost a projection - the patch was not additive';
  end if;
  if strpos(v_apply, $q$p_delta ? 'workers'$q$) = 0 or strpos(v_apply, $q$p_delta ? 'fight'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'tool_carry'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'recovering_until'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'deaths'$q$) = 0 then
    raise exception 'retreat self-check (e): hr_apply lost a block - the patch was not additive';
  end if;
  -- AND THE RECOVERY LADDER'S OWN GUARD SURVIVED. cadence-recovery-floor made
  -- recovering_until raise-forward-only while running; this file writes a column
  -- in the same SET clause and must not have disturbed it.
  if strpos(v_apply, $q$recovering_until = case when p_delta ? 'recovering_until'$q$) = 0 then
    raise exception 'retreat self-check (e): the recovering_until write is gone - the SET-clause patch landed wrong';
  end if;

  -- (f) NO CLIENT WRITE POLICY on player_state (own-read only; the RPCs write).
  --     A privileged column left client-writable is the whole game.
  select count(*) into v_cnt from pg_policy
   where polrelid = 'public.player_state'::regclass and polcmd <> 'r';
  if v_cnt <> 0 then
    raise exception 'retreat self-check (f): player_state has a non-read policy - consec_falls would be client-authored';
  end if;

  -- (g) THE PRIVILEGED RPCs ARE NOT CLIENT-EXECUTABLE. Asserted rather than
  --     assumed, because a grant that drifts is invisible until it is exploited.
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'retreat self-check (g): hr_apply / hr_state_of are executable by a client role';
  end if;

  -- (h) THE BLAST RADIUS ADMITS THE SHIPPED RUNGS, WITH ROOM. This is the check
  --     that would have caught the rev-1-to-rev-2 ceiling defect in its own
  --     family: a ceiling at or near the rung silently refuses every honest
  --     proposal the moment a designer moves the table. The rungs are 3 and 6 in
  --     src/core/away.js; the ceiling is 64.
  if strpos(v_apply, 'c_max_consec_falls constant int := 64;') = 0 then
    raise exception 'retreat self-check (h): hr_apply does not carry the stated ceiling';
  end if;
  if 64 <= 6 then
    raise exception 'retreat self-check (h): c_max_consec_falls is at or below RETREAT_ANY_FALLS - the engine''s own honest proposal would be refused as a forgery';
  end if;
  if 64 < 6 * 4 then
    raise exception 'retreat self-check (h): c_max_consec_falls leaves less than 4x headroom over the shipped rung - a designer could not retune the table without an SQL migration';
  end if;
  if 64 > 1000 then
    raise exception 'retreat self-check (h): c_max_consec_falls is no longer a blast radius';
  end if;
  -- The schema-level ceiling and the function-level ceiling must AGREE. Two
  -- numbers for one bound is two numbers that can drift.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_consec_falls_sane'
                    and pg_get_constraintdef(oid) like '%64%') then
    raise exception 'retreat self-check (h): the CHECK constraint and c_max_consec_falls disagree about the ceiling';
  end if;

  raise notice 'retreat self-check PASSED (rev. 3): consec_falls is a not-null integer defaulting to 0 with a VALIDATED check that was fired and bit, every existing row reads 0 (no player state fabricated), the column is projected, allowlisted, shape-validated with fractions REFUSED rather than truncated, written absolute, NOT voided by an activity switch (which every retreat carries), released on a shape refusal, has no client write policy and no client execute, no predecessor patch was erased, the recovering_until raise-forward guard is intact, and the blast radius admits the shipped rungs with 10x headroom while staying a blast radius.';
end $mig$;
