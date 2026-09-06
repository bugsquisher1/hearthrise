-- ============================================================================
-- 2026-09-06-recovering-until.sql — THE RECOVERY RULE (First-Night Idle Rescue).
--
-- Design ruling (Principal Game Designer, 2026-09-05; rev. 2 2026-09-06): A DEATH
-- INTERRUPTS A RUN, IT DOES NOT TERMINATE IT. On death the character is Knocked
-- Out for `recoveryFor(...)` — a LADDER, not a flat cost: the day's first fall is
-- free, the second costs 120,000 ms and every fall after that DOUBLES, capped at
-- 3,840,000 ms (64 minutes), clamped to one rung while lifetime deaths <= 5 — and
-- then gets up at 40% of max HP and RESUMES THE SAME ACTIVITY.
--
-- THE NORMATIVE BANDS (Designer adjudication 2026-09-06). Over a fed 12h night a
-- FOODLESS character surviving S seconds between falls keeps this share of a fed
-- character's output:  S=30s 1.18% (food 84.7x) | S=300s 11.11% (food 9.0x) |
-- S=1800s 46.94% (food 2.1x). These are the arithmetic of the ladder above and
-- are the figures of record; the earlier illustration (0.49 / 4.6 / 24.2%) was
-- WITHDRAWN — the adjudication went to the FORMULA. tests/accrual-engine.mjs
-- RECOVER-8 asserts the bands.
--
-- WHAT IT FIXES, measured: a fresh, foodless character's away fight ended at the
-- FIRST death — `simulateSpan` broke out of the loop and `accrual.js` idled the
-- activity pointer — so the remaining eleven-and-a-half hours of a twelve-hour
-- night paid ~0.1%. That is the largest single retention loss on the beta.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
-- Engine halves that ship with this file (EDGE REDEPLOY REQUIRED):
--   src/core/away.js                       RECOVERY_MS / recoveryFor  (a TABLE)
--   src/core/combat-sim.js                 simulateSpan's recovery ticks
--   supabase/functions/hr-accrue/accrual.js  seeds the clock, proposes the key
--   supabase/functions/hr-accrue/index.ts    reads recovering_until off the row
--   supabase/functions/hr-accrue/set-activity.js  the `recovering` refusal
--
-- ── WHAT IS ADDED ────────────────────────────────────────────────────────────
--   §1  player_state.recovering_until timestamptz NULL (no default)
--   §2  hr_state_of — projects recovering_until (programmatic, additive)
--   §3  hr_apply    — allowlists 'recovering_until', VALIDATES it against the
--                     server clock, and WRITES it ABSOLUTE (programmatic)
--   §4  self-check  — every load-bearing property, proven on apply
--
-- ⚠ PROGRAMMATIC, NOT A create-or-replace. §2/§3 edit `pg_get_functiondef`
--   output at guarded exactly-once anchors — the 2026-08-22-rested-record.sql /
--   2026-08-24-combat-style.sql idiom — so this file:
--     · is a member of NO derivation chain and takes over NO last-toucher role
--       (tests/run-sql-tests.mjs HR_APPLY_CHAIN / HR_STATE_OF_CHAIN are for the
--       static create-or-replace links only), and, far more importantly,
--     · CANNOT DELETE THE PROGRAMMATIC PATCHES THAT LANDED AFTER THE LAST STATIC
--       LINK. hr_state_of currently also carries rested_xp/rested_at, bank,
--       client_state, combat_style, combat_xp_accrued_to and dungeon_scrip, and
--       hr_apply carries the rested allowlist + write — every one of them
--       applied programmatically on top of the last chain body. A restated
--       `create or replace` derived from 2026-08-25-workers.sql /
--       2026-08-26-marks-record.sql would compile, self-check green, and
--       silently erase all of them. That is the single most destructive
--       statement in this repo and this file deliberately does not make it.
--   Both patches NO-OP on re-apply (they test for their own marker first), so
--   the file is idempotent.
--
-- ── WHY AN ABSOLUTE COLUMN AND NOT A COUNTDOWN (exploit R1) ─────────────────
-- The live settle cadence is ~90 seconds. A "ms remaining" counter would be
-- re-derived and re-zeroed by every settle, so a player who reloads would pay
-- nothing for a death and Recovery would be free. An absolute server instant is
-- the SAME instant however many times the window is sliced — which is also what
-- makes the away path and the live path one rule with no second code path, and
-- therefore what preserves the AWAY-1 byte-parity property by construction.
--
-- ── WHY IT IS NOT VOIDED BY AN ACTIVITY SWITCH (exploit R2) ─────────────────
-- `fight` is voided unconditionally by an `activity` key, because a banked
-- nearly-dead boss is VALUE and switching away must discard it. Recovery is the
-- opposite sign: it is a COST, and clearing it on a switch would make "switch to
-- fishing, switch back" a free cure. So the recovering_until arm is a plain
-- absolute with no activity void, and §4(c) asserts that ABSENCE.
--
-- ── COST, AT 100x PLAYERS ────────────────────────────────────────────────────
-- One nullable timestamptz on player_state: 8 bytes per character, null for the
-- overwhelming majority of rows at any instant. NO new table, NO new index, NO
-- per-tick row. The recovery fact reaches the ledger only through the apply row
-- that already exists (hr_apply's `meta.k` names the delta key), never as its
-- own event — game_events reached 1.6M rows / 229 MB from six players in four
-- days by journalling per tick, and this deliberately does not repeat it.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive, and reversible WITHOUT restating either function: the two patches
-- are anchored inserts, so reverting is `pg_get_functiondef` minus the inserted
-- blocks, or simply leaving them in place — an engine that never proposes
-- `recovering_until` leaves the column null forever and the game behaves exactly
-- as it does today. The column may be left or dropped. The EDGE REDEPLOY must
-- revert in the same breath ONLY in the forward direction (an engine that
-- proposes the key against an hr_apply that does not know it gets
-- `unknown_delta_key`, a 409 that costs a player their night) — and even that is
-- covered, because the engine's switch is THE KEY'S PRESENCE in hr_state_of's
-- envelope, not a deploy flag. The two halves are therefore safe in either
-- order, which is the property every column in this schema is built to have.
--
-- ⚠ KNOWN LIMITATION, TRACKED, NOT FIXED HERE (Security F1). The cadence RPCs
--   `hr_credit_kills__ungated` and `hr_credit_combat_xp__ungated`
--   (2026-08-30-bounty-kill-credit.sql) do NOT floor their credit window at
--   `recovering_until`, so a MODIFIED client can keep reporting attended kills
--   and XP straight through a knockout and be paid at the physical cap. It is
--   bounded by those RPCs' own clamps and day budgets, and it is not reachable
--   from the stock client, which is why it does not block this file. TODO next
--   build: `v_wm := greatest(v_wm, least(coalesce(recovering_until, v_wm),
--   now()))` in BOTH functions, plus a mutation in tests/recovery-rest.mjs that
--   proves an un-floored window turns the guard red.
--
-- ⚠ ROLLBACK RUNBOOK — THE ONE ASYMMETRY. If the EDGE is rolled back AFTER this
--   migration while a character still carries a non-null recovering_until, the
--   line stops being enforced (the old engine neither reads nor proposes it), so
--   the character simply fights on — harmless, and the correct failure direction.
--   But `hr_rest` is in the DATABASE, not the edge: it survives the rollback and
--   will still SPEND FOOD to clear a line nothing is enforcing. Either revert §5
--   (drop hr_rest) in the same breath, or accept that a handful of players may
--   pay for a cure they did not need; do not leave the pair half-reverted
--   silently.
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $mig$
declare v_apply text; v_state text;
begin
  select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) into v_apply;
  select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) into v_state;
  if v_apply is null or v_state is null then
    raise exception 'hr_apply/hr_state_of missing - apply the player-state chain first';
  end if;
  -- Every anchor this file edits, asserted BEFORE anything is written. A
  -- `replace()` whose anchor is absent is a silent no-op that leaves a function
  -- half-patched and a migration reporting success.
  if strpos(v_apply, $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$) = 0 then
    raise exception 'hr_apply: the c_delta_keys anchor is missing';
  end if;
  if strpos(v_apply, $anc$    'version_conflict',$anc$) = 0 then
    raise exception 'hr_apply: the c_release_codes anchor is missing';
  end if;
  if strpos(v_apply, $anc$  v_fight jsonb;$anc$) = 0 then
    raise exception 'hr_apply: the declare anchor is missing';
  end if;
  if strpos(v_apply, $anc$    if p_delta ? 'workers' then$anc$) = 0 then
    raise exception 'hr_apply: the validation-block anchor is missing (apply 2026-08-25-workers.sql first)';
  end if;
  if strpos(v_apply, $anc$           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$) = 0 then
    raise exception 'hr_apply: the SET-clause anchor is missing (apply 2026-08-17-fight-carry.sql first)';
  end if;
  if strpos(v_state, $anc$      'fight', v_st.fight,$anc$) = 0 then
    raise exception 'hr_state_of: the projection anchor is missing';
  end if;
  -- The DEATH-LEDGER fan-out's anchor (rev. 2, N3). It must appear EXACTLY once
  -- or an insert would land in the wrong arm of the function.
  if (length(v_apply) - length(replace(v_apply, $anc$    v_out := public.hr_state_of(v_uid, v_slot);$anc$, ''))
      ) / length($anc$    v_out := public.hr_state_of(v_uid, v_slot);$anc$) <> 1 then
    raise exception 'hr_apply: the post-journal anchor is missing or ambiguous';
  end if;
  -- hr_set_auto_eat's write clause (rev. 2, §3f): the auto-eat switch-on stamp.
  if to_regprocedure('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)') is null then
    raise exception 'hr_set_auto_eat is absent - apply 2026-08-15-auto-eat.sql / 2026-08-29-auto-eat-tiers.sql first';
  end if;
  if strpos(pg_get_functiondef('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)'::regprocedure),
            $anc$     set auto_eat_enabled = v_en,$anc$) = 0 then
    raise exception 'hr_set_auto_eat: the UPDATE anchor is missing';
  end if;
  -- hr_rest's dependencies (rev. 2, §5).
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items missing - apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_intent_replay / hr_rate_ok / hr_record_rejection missing - apply the apply-engine + rate chains first';
  end if;
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing - run schema.sql + player-state migrations first';
  end if;
end $mig$;

-- ── 1. THE RECOVERY LINE ─────────────────────────────────────────────────────
-- NULLABLE, NO DEFAULT, and both are deliberate. Null is the ORDINARY value —
-- "this character is on their feet" — so a `not null default now()` backfill
-- would knock every existing character out at the instant of the migration, and
-- a default of any kind would make the column's meaning depend on when the row
-- was created. Written ONLY by hr_apply, from a delta the engine proposes and
-- §3b re-validates against now(). §4(f) asserts no client write policy.
alter table public.player_state add column if not exists recovering_until timestamptz;

-- ── 1b. THE AUTO-EAT TOUCH STAMP ────────────────────────────────────────────
-- Measured on production 2026-09-06: 34 of 36 characters OWN Auto-Eat and have
-- it switched OFF, because it was never on by default and the purchase never
-- flipped it. Those characters fight to the floor every night, which is exactly
-- the population the Recovery ladder is about to start charging.
--
-- ⚠ THE FIX IS NOT A BULK UPDATE OF `auto_eat_enabled`, AND THAT IS DELIBERATE.
--   hr_set_auto_eat is the SOLE WRITER of that column (2026-08-15-auto-eat.sql
--   §4 asserts it, and the entitlement gate and the tier ceiling both live
--   there); a migration that wrote it directly would be a second writer, and
--   the invariant "every row that can pay an absence satisfies pct <= ceiling"
--   is only true because there is one door. It would also silently overrule
--   every player who switched it off ON PURPOSE.
--   So the SERVER only records WHETHER THE SWITCH HAS EVER BEEN TOUCHED, and
--   the CLIENT calls hr_set_auto_eat(true) exactly once for a character that
--   owns the trait, has it off, and has never touched it — through the same
--   door, past the same gate, journalled like any other call, with a dismissible
--   "Keep it off" that switches it back and stamps the column so the offer is
--   never made again.
alter table public.player_state add column if not exists auto_eat_set_at timestamptz;

-- THE ONE-TIME BACKFILL, and note what it does NOT do. Only rows that are
-- ALREADY enabled are stamped: those players have plainly made the decision, so
-- there is nothing to offer them. Everybody else keeps NULL — "never touched" —
-- which is what makes them eligible for the one-time offer exactly once.
-- No version bump: this column prices nothing, so an in-flight accrual holding
-- the old version is not wrong about anything.
do $mig$
declare v_n int;
begin
  update public.player_state
     set auto_eat_set_at = now()
   where auto_eat_enabled and auto_eat_set_at is null;
  get diagnostics v_n = row_count;
  raise notice 'auto-eat touch backfill: % row(s) already enabled, stamped as decided', v_n;
end $mig$;

-- ── 2. hr_state_of — PROJECT recovering_until (programmatic, additive) ───────
-- Its presence in the envelope is what tells the accrual engine the server owns
-- the clock. ⚠ Unlike tool_carry/fight the ENGINE's switch cannot be `?? null`:
-- null is the ordinary value here, so a `??` reader would classify every healthy
-- character as a database without the column and never propose the key at all.
-- The engine therefore tests KEY PRESENCE (`'recovering_until' in st`), which is
-- exactly what this projection provides and what its absence withholds.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'recovering_until') > 0 then
    raise notice 'hr_state_of already projects recovering_until - skipping';
  else
    v_def := replace(v_def,
      $anc$      'fight', v_st.fight,$anc$,
      $anc$      'fight', v_st.fight,
      -- First-Night Idle Rescue: THE RECOVERY LINE. An absolute server instant
      -- before which the character is Knocked Out - no swing, no gather, no XP,
      -- no loot, no food. Flat, like every other watermark, so a nested bag
      -- cannot hide a missing column behind a default. NULL here means "up";
      -- an ABSENT KEY means "this database predates Recovery", and the engine
      -- distinguishes those two by presence, never by coalescing.
      'recovering_until', v_st.recovering_until,
      -- Recovery rev. 2: THE LADDER'S TWO ANCHORS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died and get a free fall on every settle. A survival
      -- mechanic must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- HAS THE AUTO-EAT SWITCH EVER BEEN TOUCHED? A boolean, never the
      -- timestamp: the client only needs to know whether to make the one-time
      -- switch-on offer, and projecting the instant would invite a renderer to
      -- do arithmetic on it.
      'auto_eat_touched', (v_st.auto_eat_set_at is not null),$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_apply — ALLOWLIST + VALIDATE + WRITE (programmatic, additive) ──────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'recovering_until') > 0 then
    raise notice 'hr_apply already handles recovering_until - skipping';
  else
    -- 3a. THE ALLOWLIST. One ABSOLUTE engine-output key, like tool_carry/fight.
    --     Inserted at the HEAD of the array rather than appended to its
    --     terminator, deliberately: the terminator is whatever the most recent
    --     programmatic patcher left there (rested-record appends two keys of its
    --     own), and an anchor that moves with every future slice is an anchor
    --     that eventually matches nothing and no-ops in silence.
    v_def := replace(v_def,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- First-Night Idle Rescue: THE RECOVERY LINE. An ABSOLUTE timestamptz, or an
    -- explicit null VOID meaning "back on your feet". Engine output, never
    -- client input; validated at (4a-v) below and written in the SET clause.
    'recovering_until',
    -- Recovery rev. 2 (N3): THE DEATH LEDGER. An ARRAY of server-derived death
    -- records, fanned out to one player_ledger row each at (4z). Engine output.
    -- It moves NO VALUE - it is audit only - which is why it is not part of any
    -- conservation sum and why its rows carry no gold_in/xp_in/qty_in stamp.
    'deaths',$anc$);

    -- 3b. THE RELEASE CODE. `bad_recovering` is a SHAPE refusal whose answer
    --     depends on nothing but the delta itself, so it takes the bad_fight
    --     posture: releasing the idempotency key is harmless (the block rolled
    --     back) and withholding it would brick a key for up to 25 hours on a
    --     client-side engine bug that a redeploy fixes.
    v_def := replace(v_def,
      $anc$    'version_conflict',$anc$,
      $anc$    'version_conflict', 'bad_recovering', 'bad_deaths',$anc$);

    -- 3c. THE DECLARE + THE BLAST RADIUS.
    --     rev. 2 RAISES THIS CEILING, and the reason is the whole of the amended
    --     ruling: recovery is no longer flat. It DOUBLES with every fall on the
    --     same UTC day - 0, 2m, 4m, 8m, 16m, 32m, and a 64-MINUTE CAP
    --     (RECOVERY_CAP_MS = 3,840,000 in src/core/away.js). A 15-minute blast
    --     radius would have refused every honest stamp from the fifth fall
    --     onward with `bad_recovering`, i.e. it would have DELETED the top of
    --     the ladder in production while every test passed against the table.
    --     70 minutes = the cap + 6 minutes of slack for a stamp made at the end
    --     of a window that hr_apply commits a moment later. It is still a blast
    --     radius, not a balance number: it is what stops a compromised engine
    --     parking a character face-down for a week. REFUSED, never clamped - the
    --     bad_tool_carry / bad_fight posture, because silently repairing an
    --     impossible value is how a compromised engine's bug becomes the
    --     server's opinion.
    v_def := replace(v_def,
      $anc$  v_fight jsonb;$anc$,
      $anc$  -- First-Night Idle Rescue: the validated recovery line. NULL here means
  -- either "the key was absent" or "the key was an explicit void"; the SET
  -- clause distinguishes those with `p_delta ? 'recovering_until'`, never with
  -- this variable. c_max_recover_ms is the blast radius on how far ahead a line
  -- may be stamped: the ladder's own cap is 3,840,000 ms (64 minutes) and this
  -- is 70 minutes - the cap plus commit slack, and nothing like a week.
  v_recover timestamptz;
  c_max_recover_ms constant int := 4200000;
  -- Recovery rev. 2 (N3): the death-ledger fan-out's loop variable and its
  -- ceiling. 24 is above the ~20 deaths the ladder's own 64-minute cap permits
  -- in a twelve-hour night, so an honest span is never truncated and a
  -- pathological one is bounded rather than able to write a row per tick.
  v_death jsonb;
  c_max_death_rows constant int := 24;
  v_fight jsonb;$anc$);

    -- 3d. THE VALIDATION BLOCK (4a-v), inserted before the worker block.
    --     Server authority §1: the Edge Function decides WHAT should happen,
    --     Postgres decides WHETHER IT MAY. Everything here is re-derived from
    --     the server clock; nothing is taken on the engine's word.
    v_def := replace(v_def,
      $anc$    if p_delta ? 'workers' then$anc$,
      $anc$    -- (4a-v) THE RECOVERY LINE (First-Night Idle Rescue). A death interrupts
    -- a run; it does not terminate it. The character is Knocked Out until this
    -- ABSOLUTE instant, and both callers - the away span (src/core/combat-sim.js
    -- simulateSpan) and the live combat-start intent (set-activity.js) - simply
    -- refuse to swing while it runs. One column, one rule, no second code path.
    --
    -- `null` is a legal and MEANINGFUL value: the explicit VOID that says "this
    -- character is up". The engine sends it on every window that ended with
    -- nobody face-down, exactly as it sends `fight = {}` for "no fight in
    -- flight" - the honest statement, not merely the absence of one. Without it
    -- a stale line would survive forever and a character could stay knocked out.
    if p_delta ? 'recovering_until' then
      if jsonb_typeof(p_delta->'recovering_until') = 'null' then
        v_recover := null;
      elsif jsonb_typeof(p_delta->'recovering_until') <> 'string' then
        perform public.hr_reject('bad_recovering',
          jsonb_build_object('type', jsonb_typeof(p_delta->'recovering_until')));
      else
        begin
          v_recover := (p_delta->>'recovering_until')::timestamptz;
        exception when others then
          perform public.hr_reject('bad_recovering', jsonb_build_object('why', 'unparseable'));
        end;
        -- THE CEILING, against the SERVER CLOCK. now(), never a delta value.
        if v_recover > now() + make_interval(secs => c_max_recover_ms / 1000.0) then
          perform public.hr_reject('bad_recovering',
            jsonb_build_object('why', 'too far ahead', 'until', p_delta->'recovering_until'));
        end if;
      end if;
    end if;

    -- (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused rather than
    -- truncated: an over-long array means the engine proposed something the
    -- ladder cannot produce, and quietly writing the first 24 of it would turn
    -- an engine bug into a plausible-looking audit trail. Every FIELD is
    -- re-derived server-side at (4z) from this array's own values, and the
    -- rows move no value, so there is nothing here to clamp - only to refuse.
    if p_delta ? 'deaths' then
      if jsonb_typeof(p_delta->'deaths') <> 'array' then
        perform public.hr_reject('bad_deaths', jsonb_build_object('type', jsonb_typeof(p_delta->'deaths')));
      end if;
      if jsonb_array_length(p_delta->'deaths') > c_max_death_rows then
        perform public.hr_reject('bad_deaths',
          jsonb_build_object('why', 'too many', 'n', jsonb_array_length(p_delta->'deaths'),
                             'limit', c_max_death_rows));
      end if;
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        if jsonb_typeof(v_death) <> 'object' then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'not an object'));
        end if;
        if length(coalesce(v_death->>'monster', '')) > 64 then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'monster id too long'));
        end if;
        -- The recovery a row CLAIMS may not exceed the same blast radius the
        -- line itself is held to. One ceiling, two readers.
        if coalesce((v_death->>'recovery_ms')::bigint, 0) < 0
           or coalesce((v_death->>'recovery_ms')::bigint, 0) > c_max_recover_ms then
          perform public.hr_reject('bad_deaths',
            jsonb_build_object('why', 'recovery_ms out of range', 'ms', v_death->'recovery_ms'));
        end if;
      end loop;
    end if;

    if p_delta ? 'workers' then$anc$);

    -- 3e. THE WRITE. ABSOLUTE: absent key = untouched, present = set, INCLUDING
    --     to null. Inserted BEFORE the `fight` arm so the two sit together and
    --     the contrast between them is visible at the point of maintenance.
    --     ⚠ AND IT IS DELIBERATELY *NOT* VOIDED BY AN `activity` KEY, unlike
    --       `fight` directly below it. See the header, exploit R2. §4(c) asserts
    --       that absence, because an absence is not otherwise reviewable.
    v_def := replace(v_def,
      $anc$           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$,
      $anc$           -- First-Night Idle Rescue: an ABSOLUTE, validated at (4a-v). Absent
           -- key = untouched; present = set, INCLUDING to null (the explicit
           -- void that means "back on your feet").
           -- NOT voided by an `activity` key, unlike `fight` immediately below:
           -- being knocked out is a property of the CHARACTER, so a player who
           -- switches to fishing while face-down is still face-down. Clearing it
           -- on a switch would make "switch away, switch back" a free cure.
           recovering_until = case when p_delta ? 'recovering_until'
                                   then v_recover else recovering_until end,
           fight        = case when p_delta ? 'activity' then '{}'::jsonb$anc$);

    -- 3f. THE DEATH-LEDGER FAN-OUT (4z). AFTER the single journal row hr_apply
    --     always writes, and deliberately in ADDITION to it rather than instead
    --     of it: the apply row is the value transfer, these are the events.
    --     ⚠ ONE ROW PER DEATH IS AFFORDABLE ONLY BECAUSE THE LADDER BOUNDS
    --       ITSELF. Recovery doubles to a 64-minute cap, so a twelve-hour night
    --       holds at most ~20 deaths and a typical one holds nought to three.
    --       That is the opposite end of the scale from game_events (1.6M rows /
    --       229 MB from six players in four days, by logging every kill), and
    --       the reason journal rule 6 permits it: rare, aggregate-free and
    --       audit-relevant, the same class as hr_set_auto_eat's row per call.
    --     gold/gold_in/xp_in/qty_in are ZERO and STAY zero - a death moves no
    --     value, so these rows must not enter the daily progression budget or
    --     any conservation sum.
    v_def := replace(v_def,
      $anc$    v_out := public.hr_state_of(v_uid, v_slot);$anc$,
      $anc$    if p_delta ? 'deaths' then
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        insert into public.player_ledger
          (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'combat', 'death', 0, 0, 0, 0,
           jsonb_build_object(
             'monster',          left(coalesce(v_death->>'monster', ''), 64),
             'recovery_ms',      coalesce((v_death->>'recovery_ms')::bigint, 0),
             'deaths_today',     coalesce((v_death->>'deaths_today')::bigint, 0),
             'deaths_lifetime',  coalesce((v_death->>'deaths_lifetime')::bigint, 0),
             'resume_hp',        coalesce((v_death->>'resume_hp')::bigint, 0),
             'auto_eat_enabled', coalesce((v_death->>'auto_eat_enabled')::boolean, false),
             'food_in_bag',      coalesce((v_death->>'food_in_bag')::boolean, false)));
      end loop;
    end if;

    v_out := public.hr_state_of(v_uid, v_slot);$anc$);

    execute v_def;
  end if;
end $mig$;

-- ── 3g. hr_set_auto_eat — STAMP THE TOUCH (programmatic, additive) ──────────
-- The sole writer of auto_eat_enabled becomes the sole writer of
-- auto_eat_set_at, which is what keeps §1b's invariant a one-door invariant.
-- Stamped on EVERY call, not only on the way on: "Keep it off" is a decision
-- and must silence the offer exactly as switching it on does.
-- ⚠ PROGRAMMATIC for the same reason §2/§3 are: hr_set_auto_eat's live body is
--   2026-08-29-auto-eat-tiers.sql's restatement, and a create-or-replace here
--   would freeze a copy of it in this file that the next tier change silently
--   reverts. One anchored insert into the UPDATE clause; no-ops on re-apply.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)'::regprocedure);
  if strpos(v_def, 'auto_eat_set_at') > 0 then
    raise notice 'hr_set_auto_eat already stamps auto_eat_set_at - skipping';
  else
    v_def := replace(v_def,
      $anc$     set auto_eat_enabled = v_en,$anc$,
      $anc$     set auto_eat_enabled = v_en,
         -- Recovery rev. 2: THE TOUCH STAMP. now(), the server clock, on every
         -- call. It records only that a human has made this decision, which is
         -- what stops the one-time switch-on offer being made twice - including
         -- to somebody who answered it with "Keep it off".
         auto_eat_set_at  = now(),$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 5. hr_rest — "REST AT THE HEARTH" (rev. 2, N1) ──────────────────────────
-- THE RELIEF VALVE, and the only one. The ladder tops out at 64 minutes, which
-- is a long time to look at a timer; the answer is not to sell a skip (see the
-- R10 standing rule and tests/recovery-relief-guard.mjs, which asserts that no
-- trait, unlock, gold ladder, quartermaster offer or clan bond keys an effect on
-- recovery). The answer is FOOD: eat your way back to full and you are up. It
-- costs provisions, which is the same currency the whole rule is trying to
-- teach, and a player with a stocked bag is never held down.
--
-- EVERY NUMBER IN IT IS THE SERVER'S:
--   · WHICH provisions are eligible  — hr_items.auto_eatable, the SAME catalogue
--     predicate auto-eat uses, so a Feast (foodClass 'buff') is excluded here
--     exactly as it is there. Generated from src/data/*.js; never restated.
--   · HOW MUCH each one heals        — hr_items.heals.
--   · HOW MANY the player has        — player_inventory, under the row lock.
--   · HOW MUCH is missing            — player_state.max_hp - player_state.hp.
--   · WHEN                           — now().
-- The caller supplies a slot and an idempotency key and NOTHING ELSE. There is
-- no quantity, no item id and no heal value in the signature, so there is no
-- client value to distrust.
--
-- WHY IT REFUSES MID-WINDOW (`collect_first`). If an unsettled accrual window is
-- open, clearing `recovering_until` before it is priced would make the engine
-- re-simulate the knocked-out stretch as fighting time — the player would be
-- PAID for their recovery. So: the same refusal hr_set_auto_eat uses for the
-- same class of reason, with the same 60-second grace mirroring ACCRUE_MIN_MS.
--
-- WHY IT REFUSES AT FULL HEALTH (`not_hurt`). A rest that heals nothing is a
-- free cure, and a free cure is the whole rule undone. Being knocked out at full
-- health is not otherwise reachable (nothing heals a character who cannot act),
-- so this is a fuse, not a workflow.
create or replace function public.hr_rest(
  p_slot      int  default 0,
  p_intent_id uuid default null)
returns jsonb language plpgsql volatile security definer
  -- pg_temp last, never first (A4 convention): a SECURITY DEFINER body must not
  -- be resolvable against a caller-created temp object.
  set search_path = public, pg_temp as $fn$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_need   bigint;
  v_left   bigint;
  v_take   bigint;
  v_units  bigint := 0;
  v_healed bigint := 0;
  v_spent  jsonb  := '{}'::jsonb;
  v_row    record;
  v_out    jsonb;
  v_msg text; v_det text; v_sqlstate text;
  -- Mirrors ACCRUE_MIN_MS (60000 ms) in the accrual engine, the same constant
  -- hr_set_auto_eat names for the same refusal.
  c_collect_grace constant interval := interval '60 seconds';
  -- A backstop on the loop, not a balance number: a bag of 1-HP mushrooms must
  -- not turn one call into a thousand-row scan.
  c_max_units constant bigint := 500;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if v_slot < 0 or v_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;

  -- RATE. A rejected call still consumes budget, or "spam it" is a free denial
  -- of service (apply-engine.sql:420). 30/hour is far above the ladder's own
  -- reachable rate and cheap for a button.
  if not public.hr_rate_ok(v_uid, 'rest', 30, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'rest') - 30) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'rest', 'rate_limited',
        jsonb_build_object('limit', 30, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'rest') - 30));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- SERIALISE THIS CHARACTER. BYTE-FOR-BYTE hr_apply's advisory key, so a rest
  -- cannot race a settle on the same character — which is the race that would
  -- otherwise let a knockout be both cleared and paid.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY, per (KEY, INTENT, SLOT). SUCCESSES ONLY: a refusal
  -- (not_recovering, insufficient_food, collect_first) stays retryable, and a
  -- replayed success returns FRESH state with the original receipt, which is
  -- what makes a double-tap on a flaky connection eat one meal and not two.
  select public.hr_intent_replay(v_uid, v_slot, p_intent_id, 'rest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object('replayed', true);
  end if;

  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if v_st.user_id is null then perform public.hr_reject('no_character'); end if;

    -- (a) IS THERE ANYTHING TO REST OFF? The SERVER's clock, the SERVER's column.
    if v_st.recovering_until is null or v_st.recovering_until <= now() then
      perform public.hr_reject('not_recovering');
    end if;

    -- (b) THE UNSETTLED-WINDOW REFUSAL. See the header.
    if v_st.active_kind <> 'idle' and now() - v_st.accrued_to >= c_collect_grace then
      perform public.hr_reject('collect_first',
        jsonb_build_object('accrued_to', v_st.accrued_to,
                           'unpaid_ms', floor(extract(epoch from (now() - v_st.accrued_to)) * 1000)));
    end if;

    -- (c) HOW MUCH IS MISSING. Derived, never supplied.
    v_need := greatest(0, coalesce(v_st.max_hp, 0) - coalesce(v_st.hp, 0));
    if v_need <= 0 then perform public.hr_reject('not_hurt'); end if;

    -- (d) EAT. Weakest eligible provision first — the order a player would
    --     choose, and the one that wastes the least of a good stack. Ordered by
    --     (heals, item_id) so the choice is DETERMINISTIC and a dispute is
    --     replayable. `for update of pi` because this is a debit.
    v_left := v_need;
    for v_row in
      select pi.item_id as item_id, pi.qty as qty, it.heals as heals
        from public.player_inventory pi
        join public.hr_items it on it.item_id = pi.item_id
       where pi.user_id = v_uid and pi.slot = v_slot
         and it.auto_eatable and coalesce(it.heals, 0) > 0
       order by it.heals asc, pi.item_id asc
         for update of pi
    loop
      exit when v_left <= 0 or v_units >= c_max_units;
      v_take := least(v_row.qty,
                      ceil(v_left::numeric / v_row.heals)::bigint,
                      c_max_units - v_units);
      if v_take <= 0 then continue; end if;
      v_units  := v_units + v_take;
      v_healed := v_healed + v_take * v_row.heals;
      v_left   := v_left - v_take * v_row.heals;
      v_spent  := v_spent || jsonb_build_object(v_row.item_id, v_take);
      /* ⚠ DELETE, NEVER "UPDATE TO ZERO". `player_inventory.qty` carries
         `check (qty > 0)` — "a zero row is deleted, never stored" — so an
         update that lands on 0 RAISES, the whole rest is rolled back as
         bad_rest_write, and a player who ate their last stack is told their
         food is broken. Caught by tests/recovery-rest.mjs on the first run. */
      if v_take >= v_row.qty then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_row.item_id;
      else
        update public.player_inventory
           set qty = qty - v_take
         where user_id = v_uid and slot = v_slot and item_id = v_row.item_id;
      end if;
    end loop;

    -- (e) ENOUGH, OR NOTHING. All-or-nothing: a partial rest that ate the bag and
    --     left the timer running would be the worst outcome available, so the
    --     shortfall is a REJECTION and hr_reject rolls the whole block back.
    if v_left > 0 then
      perform public.hr_reject('insufficient_food',
        jsonb_build_object('need_hp', v_need, 'covered_hp', v_healed));
    end if;

    -- (f) UP. Full health, no timer. `version + 1` because both columns price
    --     what happens next and an in-flight accrual holding the old version
    --     must re-read rather than simulate a knocked-out character who is up.
    --     `accrued_to` is deliberately NOT stamped — (b) has already proved
    --     there is no material window open, and stamping it would confiscate
    --     the seconds since the last settle.
    update public.player_state
       set hp               = max_hp,
           recovering_until = null,
           version          = version + 1,
           updated_at       = now()
     where user_id = v_uid and slot = v_slot;

    -- (g) JOURNALLED. One row per call, rate-limited to 30/hour: provisions left
    --     the bag, so "where did my Cooked Sharks go" has to be answerable.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
    values
      (v_uid, v_slot, 'combat', 'rest', 0, 0, 0, 0,
       jsonb_build_object('missing_hp', v_need, 'healed_hp', v_healed,
                          'units', v_units, 'spent', v_spent,
                          'was_until', v_st.recovering_until, 'idem', p_intent_id));

    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('ok', true, 'rested',
                  jsonb_build_object('missing_hp', v_need, 'healed_hp', v_healed,
                                     'units', v_units, 'spent', v_spent));
  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_rest_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- CACHE THE DECISION — SUCCESS ONLY, outside the protected block.
  if coalesce(v_out->>'ok', 'false') = 'true' then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_intent_id, v_slot, 'rest',
              jsonb_build_object('ok', true, 'rested', v_out->'rested'), now())
      on conflict (user_id, intent_id) do nothing;
  else
    perform public.hr_record_rejection(v_uid, v_slot, 'rest', v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;

  return v_out;
end $fn$;

-- GRANTS — revoke from PUBLIC first, then grant to the ONE role that may call
-- it. `authenticated` and nobody else: this is a player-initiated action on the
-- caller's OWN character (auth.uid() is the only identity it reads — there is no
-- p_user parameter and therefore no impersonation seam), which is exactly the
-- posture hr_set_auto_eat has. NOT hr_engine: the accrual engine must never be
-- able to stand a character up and spend their provisions for them.
revoke execute on function public.hr_rest(int, uuid) from public;
revoke execute on function public.hr_rest(int, uuid) from anon, service_role, hr_engine;
grant  execute on function public.hr_rest(int, uuid) to authenticated;

-- ── 4. SELF-CHECK — the load-bearing properties, proven on apply ─────────────
-- A migration that cannot prove its own claims is a claim.
do $mig$
declare v_apply text; v_state text; v_rest text; v_cnt int; v_t timestamptz;
        v_p oid; v_bad text;
begin
  -- (a) THE COLUMN EXISTS, IS NULLABLE, AND HAS NO DEFAULT. All three: a
  --     not-null default would have knocked every existing character out.
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'recovering_until' and is_nullable = 'YES' and column_default is null;
  if v_cnt <> 1 then
    raise exception 'recovery self-check (a): recovering_until missing, not-null, or defaulted (%)', v_cnt;
  end if;

  v_apply := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  v_state := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);

  -- (b) ACCEPTED, VALIDATED AND WRITTEN — three separate facts. A body that
  --     accepts the key without validating it is worse than one that rejects it,
  --     because it looks like it works.
  if strpos(v_apply, $q$    'recovering_until',$q$) = 0 then
    raise exception 'recovery self-check (b): c_delta_keys does not carry recovering_until - every settle would 409 unknown_delta_key';
  end if;
  if strpos(v_apply, $q$if p_delta ? 'recovering_until' then$q$) = 0
     or strpos(v_apply, 'bad_recovering') = 0 then
    raise exception 'recovery self-check (b): the (4a-v) validation block is missing';
  end if;
  if strpos(v_apply, $q$recovering_until = case when p_delta ? 'recovering_until'$q$) = 0 then
    raise exception 'recovery self-check (b): the SET clause does not write recovering_until';
  end if;
  if strpos(v_apply, $q$'version_conflict', 'bad_recovering', 'bad_deaths',$q$) = 0 then
    raise exception 'recovery self-check (b): bad_recovering is not a release code - a shape bug would brick a key for 25h';
  end if;

  -- (c) EXPLOIT R2, ASSERTED AS AN ABSENCE. The recovery line must NOT be voided
  --     by an activity switch, or "switch away, switch back" cures a knockout.
  if v_apply ~ $q$recovering_until = case when p_delta \? 'activity'$q$ then
    raise exception 'recovery self-check (c): recovering_until is voided by an activity switch - a knockout would be curable by switching';
  end if;

  -- (d) THE ENVELOPE PROJECTS IT. Without this the engine can never learn the
  --     column exists and will never propose the key - the feature is inert.
  if strpos(v_state, $q$'recovering_until', v_st.recovering_until$q$) = 0 then
    raise exception 'recovery self-check (d): hr_state_of does not project recovering_until';
  end if;

  -- (e) NOTHING WAS ERASED. The programmatic patches that landed after the last
  --     static chain link must all still be there - this is the whole reason
  --     this file is an anchored insert and not a create-or-replace.
  if strpos(v_state, 'rested_xp') = 0 or strpos(v_state, 'workers_accrued_to') = 0
     or strpos(v_state, 'inventory_complete') = 0 or strpos(v_state, $q$'fight', v_st.fight$q$) = 0 then
    raise exception 'recovery self-check (e): hr_state_of lost a projection - the patch was not additive';
  end if;
  if strpos(v_apply, $q$p_delta ? 'workers'$q$) = 0 or strpos(v_apply, $q$p_delta ? 'fight'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'tool_carry'$q$) = 0 then
    raise exception 'recovery self-check (e): hr_apply lost a block - the patch was not additive';
  end if;

  -- (f) NO CLIENT WRITE POLICY on player_state (own-read only; the RPCs write).
  --     A privileged column left client-writable is the whole game.
  select count(*) into v_cnt from pg_policy
   where polrelid = 'public.player_state'::regclass and polcmd <> 'r';
  if v_cnt <> 0 then
    raise exception 'recovery self-check (f): player_state has a non-read policy - recovering_until would be client-authored';
  end if;

  -- (g) THE PRIVILEGED RPCs ARE NOT CLIENT-EXECUTABLE. Asserted here rather than
  --     assumed, because a grant that drifts is invisible until it is exploited.
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'recovery self-check (g): hr_apply / hr_state_of are executable by a client role';
  end if;

  -- (h) WITHDRAWN (Security F5). It evaluated a hardcoded 900,000 ms / "15
  --     minutes" — rev. 1's ceiling, which rev. 2 raised to 4,200,000 ms. A
  --     self-check that asserts a number the file no longer ships is worse than
  --     no check: it passes for the wrong reason and reads as coverage. (i)
  --     below evaluates the SHIPPED ceiling against the SHIPPED cap.


  -- ══ REV. 2 PROPERTIES ══════════════════════════════════════════════════════

  -- (i) THE CEILING ADMITS THE LADDER'S CAP. This is the check that would have
  --     caught the rev-1-to-rev-2 defect: a 15-minute blast radius silently
  --     refuses every honest stamp from the fifth fall of a day onward, which
  --     deletes the top of the ladder in production while every JS test passes.
  if 4200000 <= 3840000 then
    raise exception 'recovery self-check (i): c_max_recover_ms is below RECOVERY_CAP_MS - the ladder''s own cap would be refused as a forgery';
  end if;
  if strpos(v_apply, 'c_max_recover_ms constant int := 4200000;') = 0 then
    raise exception 'recovery self-check (i): hr_apply does not carry the raised ceiling';
  end if;
  v_t := now() + make_interval(secs => 4200000 / 1000.0);
  if (now() + interval '3840 seconds') > v_t then
    raise exception 'recovery self-check (i): the ceiling refuses an honest 64-minute stamp';
  end if;
  if v_t >= now() + interval '2 hours' then
    raise exception 'recovery self-check (i): the ceiling is no longer a blast radius';
  end if;

  -- (j) THE DEATH LEDGER: allowlisted, shape-validated, bounded, fanned out, and
  --     released on a shape refusal. Four separate facts; a key accepted without
  --     a bound is a per-tick ledger waiting to happen.
  if strpos(v_apply, $q$    'deaths',$q$) = 0 then
    raise exception 'recovery self-check (j): c_delta_keys does not carry deaths - every death settle would 409 unknown_delta_key';
  end if;
  if strpos(v_apply, $q$if p_delta ? 'deaths' then$q$) = 0 or strpos(v_apply, 'bad_deaths') = 0 then
    raise exception 'recovery self-check (j): the (4a-d) validation block is missing';
  end if;
  if strpos(v_apply, 'c_max_death_rows constant int := 24;') = 0
     or strpos(v_apply, 'jsonb_array_length(p_delta->''deaths'') > c_max_death_rows') = 0 then
    raise exception 'recovery self-check (j): the death-row array is unbounded - one span could write a row per tick';
  end if;
  if strpos(v_apply, $q$(v_uid, v_slot, 'combat', 'death', 0, 0, 0, 0,$q$) = 0 then
    raise exception 'recovery self-check (j): the death rows are not fanned out to player_ledger, or they carry a value stamp';
  end if;
  if strpos(v_apply, $q$'bad_recovering', 'bad_deaths',$q$) = 0 then
    raise exception 'recovery self-check (j): bad_deaths is not a release code';
  end if;

  -- (k) THE LADDER'S TWO ANCHORS ARE PROJECTED AS SCALARS, not left in the
  --     truncatable `progress` array. Asserted by EVALUATION as well as by text:
  --     a projection that compiles but reads the wrong period key gives every
  --     character a free fall on every settle, forever, silently.
  if strpos(v_state, $q$'deaths_today'$q$) = 0 or strpos(v_state, $q$'deaths_lifetime'$q$) = 0 then
    raise exception 'recovery self-check (k): hr_state_of does not project the two death counters - the ladder would read 0 and every fall would be free';
  end if;
  if strpos(v_state, 'public.hr_utc_day_key(now())') = 0 then
    raise exception 'recovery self-check (k): the daily death counter is not read under hr_utc_day_key - the engine writes a row nothing reads';
  end if;
  -- The two spellings must AGREE. hr_utc_day_key is FMYYYY-FMMM-FMDD and
  -- src/core/goals.js utcDayKey is `${y}-${m+1}-${d}` — the same string, and if
  -- they ever diverge the free fall is anchored to a day nothing else agrees on.
  if public.hr_utc_day_key('2026-01-02T00:00:00Z'::timestamptz) <> '2026-1-2' then
    raise exception 'recovery self-check (k): hr_utc_day_key no longer matches src/core/goals.js utcDayKey (got %)',
      public.hr_utc_day_key('2026-01-02T00:00:00Z'::timestamptz);
  end if;

  -- (l) THE AUTO-EAT TOUCH STAMP. The column exists, hr_set_auto_eat is still
  --     its SOLE WRITER, and this migration did NOT bulk-write auto_eat_enabled.
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'auto_eat_set_at' and is_nullable = 'YES' and column_default is null;
  if v_cnt <> 1 then
    raise exception 'recovery self-check (l): auto_eat_set_at missing, not-null, or defaulted (%)', v_cnt;
  end if;
  if strpos(pg_get_functiondef('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)'::regprocedure),
            'auto_eat_set_at  = now()') = 0 then
    raise exception 'recovery self-check (l): hr_set_auto_eat does not stamp auto_eat_set_at - the one-time offer would be made forever';
  end if;
  -- The stamp is only ever set for rows ALREADY enabled. A row with the stamp
  -- and the switch off can only be a player who said "Keep it off"; a row with
  -- the switch ON and no stamp would mean something other than hr_set_auto_eat
  -- wrote the switch, which is the invariant §1b exists to keep.
  select count(*) into v_cnt from public.player_state
   where auto_eat_enabled and auto_eat_set_at is null;
  if v_cnt <> 0 then
    raise exception 'recovery self-check (l): % enabled row(s) carry no touch stamp - a second writer of auto_eat_enabled exists', v_cnt;
  end if;
  if strpos(v_state, $q$'auto_eat_touched'$q$) = 0 then
    raise exception 'recovery self-check (l): hr_state_of does not project auto_eat_touched - the client cannot tell a decision from a default';
  end if;

  -- (m) hr_rest: installed, SECURITY DEFINER, search_path pinned, and callable by
  --     NOBODY but `authenticated`. In particular NOT by hr_engine — a
  --     compromised accrual engine must not be able to stand a character up.
  v_p := to_regprocedure('public.hr_rest(int,uuid)');
  if v_p is null then raise exception 'recovery self-check (m): hr_rest did not install'; end if;
  foreach v_bad in array array['public','anon','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'recovery self-check (m): hr_rest is EXECUTABLE BY % - a role that is not the player can clear a knockout', v_bad;
    end if;
  end loop;
  if not has_function_privilege('authenticated', v_p, 'execute') then
    raise exception 'recovery self-check (m): hr_rest is not executable by authenticated - the relief valve is inert and the ladder has no way out';
  end if;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'recovery self-check (m): hr_rest is not SECURITY DEFINER';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception 'recovery self-check (m): hr_rest has no pinned search_path';
  end if;
  -- (m-ii) IT TAKES NO CLIENT VALUE. Two parameters, a slot and an idempotency
  --        key. A quantity, an item id or a heal value in this signature would
  --        be a client number crossing into an economy.
  if (select pronargs from pg_proc where oid = v_p) <> 2 then
    raise exception 'recovery self-check (m): hr_rest takes % arguments - it must take exactly (slot, intent_id) and no client value',
      (select pronargs from pg_proc where oid = v_p);
  end if;
  -- (m-iii) IT LOCKS, IT REFUSES A FREE CURE, AND IT REFUSES MID-WINDOW.
  v_rest := pg_get_functiondef(v_p);
  if strpos(v_rest, 'pg_advisory_xact_lock(hashtextextended(v_uid::text') = 0 then
    raise exception 'recovery self-check (m): hr_rest does not take hr_apply''s advisory key - a rest could race a settle';
  end if;
  if strpos(v_rest, $q$hr_reject('not_hurt')$q$) = 0 then
    raise exception 'recovery self-check (m): hr_rest does not refuse at full health - a rest that heals nothing is a free cure';
  end if;
  if strpos(v_rest, $q$hr_reject('collect_first'$q$) = 0 then
    raise exception 'recovery self-check (m): hr_rest does not refuse an open window - the knockout would be cleared and then PAID';
  end if;
  if strpos(v_rest, 'hr_intent_replay') = 0 then
    raise exception 'recovery self-check (m): hr_rest is not idempotent - a double tap eats two meals';
  end if;
  if strpos(v_rest, 'it.auto_eatable') = 0 then
    raise exception 'recovery self-check (m): hr_rest does not read the SERVER food catalogue';
  end if;

  raise notice 'recovery self-check PASSED (rev. 2): nullable no-default column, projected, allowlisted, validated against the server clock, written absolute, NOT voided by an activity switch, released on a shape refusal, no client write policy, no client execute, no predecessor patch erased; the ceiling admits the 64-minute ladder cap; the death ledger is bounded, validated and fanned out; both death counters are projected as untruncatable scalars under a day key that matches src/core/goals.js; hr_set_auto_eat is still the sole writer of the switch and now stamps the touch; and hr_rest is definer, search-path pinned, locked, idempotent, takes no client value and is callable by authenticated ALONE.';
end $mig$;
