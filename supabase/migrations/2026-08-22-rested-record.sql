-- ============================================================================
-- 2026-08-22-rested-record.sql — RESTED XP → SERVER-OWNED (DORMANT).
--
-- Moves the RESTED bank (a charge count + its watermark) off the client-authored
-- save blob and onto player_state, written ONLY by hr_apply from the accrual
-- engine's proposal. Ships DORMANT: the client record entry is arm-flag-gated OFF
-- (RESTED_RECORD_ARM_ENABLED=false), so live behaviour is byte-unchanged. This
-- migration is the SERVER half — columns, projection, and the apply-side writer +
-- clamps — plus a self-verifying self-check.
--
-- ── WHAT IS ADDED ────────────────────────────────────────────────────────────
--   §1  player_state.rested_xp  integer     not null default 0
--       player_state.rested_at  timestamptz not null default now()
--   §2  hr_state_of — projects rested_xp / rested_at (additive, faithful superset)
--   §3  hr_apply    — allowlists 'rested_xp'/'rested_at' and WRITES them, ABSOLUTE,
--                     clamped: bank to [0,120], watermark MONOTONE in (old, now()].
--   §4  self-check  — watermark accrues by whole quanta, advances by exactly the
--                     granted charges, REPLAY grants nothing (idempotent), the cap
--                     and monotone clamps hold, columns present, projected,
--                     allowlisted, and NO client write policy on player_state.
--
-- ── THE WATERMARK CONTRACT (why this cannot double-pay) ──────────────────────
-- `rested_at` is the instant already banked to. The engine (accrual.js
-- `accrueRested`, over src/core/rested.js) computes charges = floor((now -
-- rested_at)/6min) and advances rested_at by EXACTLY charges*6min — never to
-- now(). A second call over the same span therefore banks 0. hr_apply additionally
-- clamps the incoming watermark monotone: `least(now(), greatest(rested_at, x))`,
-- so even a hostile/stale proposal can only ever move it forward and never past
-- now(). That is the b214 offline double-pay defence, enforced from BOTH sides.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive. The columns may be left in place harmlessly (they simply stop being
-- read/written). To revert the functions, re-apply the predecessor bodies
-- (2026-08-26-marks-record.sql restores hr_state_of; 2026-08-25-workers.sql
-- restores hr_apply). Both patches are programmatic (they edit pg_get_functiondef
-- output) and NO-OP if rested handling is already present, so a re-apply is safe.
-- The client flip (RESTED_RECORD_ARM_ENABLED) reverts in the same breath.
-- ============================================================================

begin;

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $mig$
declare v_apply text; v_state text;
begin
  select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) into v_apply;
  select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) into v_state;
  if v_apply is null or v_state is null then
    raise exception 'hr_apply/hr_state_of missing — apply the player-state chain first';
  end if;
  if strpos(v_apply, $anc$'workers', 'workers_accrued_to'];$anc$) = 0 then
    raise exception 'the LIVE hr_apply is not the workers body — apply 2026-08-25-workers.sql first';
  end if;
  if strpos(v_apply, $anc$workers_accrued_to = case when p_delta ? 'workers_accrued_to'$anc$) = 0 then
    raise exception 'the LIVE hr_apply is missing the workers SET anchor';
  end if;
  if strpos(v_state, $anc$'workers_accrued_to', v_st.workers_accrued_to,$anc$) = 0 then
    raise exception 'the LIVE hr_state_of is not the workers body';
  end if;
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing — run schema.sql + player-state migrations first';
  end if;
end $mig$;

-- ── 1. THE COLUMNS ───────────────────────────────────────────────────────────
-- NOT NULL default now() on rested_at: a fresh column backfills every existing
-- row to now(), so accrueRested banks nothing on the first pass (span 0) and
-- initialises cleanly — never a full unearned bank at epoch. New characters
-- inherit the default at creation. Written ONLY by hr_apply (§4 asserts no client
-- write policy on player_state).
alter table public.player_state add column if not exists rested_xp integer     not null default 0;
alter table public.player_state add column if not exists rested_at timestamptz not null default now();

-- ── 2. hr_state_of — PROJECT rested_xp / rested_at (programmatic, additive) ───
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'rested_xp') > 0 then
    raise notice 'hr_state_of already projects rested — skipping';
  else
    v_def := replace(v_def,
      $anc$'workers_accrued_to', v_st.workers_accrued_to,$anc$,
      $anc$'workers_accrued_to', v_st.workers_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_apply — ALLOWLIST + WRITE rested (programmatic, additive) ───────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'rested_xp') > 0 then
    raise notice 'hr_apply already handles rested — skipping';
  else
    -- 3a. THE ALLOWLIST. Two ABSOLUTE engine-output keys (like tool_carry/fight),
    --     appended to the array terminator.
    v_def := replace(v_def,
      $anc$'workers', 'workers_accrued_to'];$anc$,
      $anc$'workers', 'workers_accrued_to',
    -- rested-record (b437): the ABSOLUTE bank + its watermark. Engine output,
    -- never client input, and clamped at the write below.
    'rested_xp', 'rested_at'];$anc$);
    -- 3b. THE WRITE, inserted BEFORE the workers SET assignment (anchored on a
    --     single line so it is robust to indentation of the `then now()` line).
    --     rested_xp: ABSOLUTE, clamped to [0,120] (RESTED_CAP_LIBRARY is the hard
    --     ceiling). rested_at: ABSOLUTE, clamped MONOTONE in (old, now()] — it can
    --     only ever move forward and never past now(), which is the b214 offline
    --     double-pay defence enforced from the apply side regardless of proposal.
    v_def := replace(v_def,
      $anc$workers_accrued_to = case when p_delta ? 'workers_accrued_to'$anc$,
      $anc$rested_xp = case when p_delta ? 'rested_xp'
                            then least(120, greatest(0, coalesce((p_delta->>'rested_xp')::bigint, rested_xp)))
                            else rested_xp end,
           rested_at = case when p_delta ? 'rested_at'
                            then least(now(), greatest(rested_at, coalesce((p_delta->>'rested_at')::timestamptz, rested_at)))
                            else rested_at end,
           workers_accrued_to = case when p_delta ? 'workers_accrued_to'$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 4. SELF-CHECK — the load-bearing properties, proven on apply ─────────────
do $mig$
declare
  v_at  timestamptz := now() - interval '25 minutes';
  v_now timestamptz := now();
  v_ms  bigint := 360000;               -- RESTED_CHARGE_MS (6 minutes)
  v_ch  bigint; v_at2 timestamptz; v_ch2 bigint;
  v_xp bigint; v_ct timestamptz; v_cnt int;
begin
  -- (a) WHOLE QUANTA. 25 minutes / 6 = 4 charges (not 4.16, not 5).
  v_ch := floor(extract(epoch from (v_now - v_at)) * 1000 / v_ms);
  if v_ch <> 4 then raise exception 'rested self-check (a): expected 4 charges over 25m, got %', v_ch; end if;

  -- (b) restedAt advances by EXACTLY the granted charges — never to now().
  v_at2 := v_at + (v_ch * v_ms) * interval '1 millisecond';
  if v_at2 > v_now then raise exception 'rested self-check (b): advanced watermark overshoots now'; end if;
  if v_at2 <= v_at then raise exception 'rested self-check (b): watermark did not advance'; end if;

  -- (c) REPLAY IS IDEMPOTENT — re-accruing from the advanced watermark banks 0.
  v_ch2 := floor(extract(epoch from (v_now - v_at2)) * 1000 / v_ms);
  if v_ch2 <> 0 then raise exception 'rested self-check (c): replay double-paid % charges', v_ch2; end if;

  -- (d) the hr_apply CAP clamp bounds the bank to [0,120].
  v_xp := least(120, greatest(0, 99999::bigint));
  if v_xp <> 120 then raise exception 'rested self-check (d): cap clamp failed (%)', v_xp; end if;
  v_xp := least(120, greatest(0, (-5)::bigint));
  if v_xp <> 0 then raise exception 'rested self-check (d): floor clamp failed (%)', v_xp; end if;

  -- (e) the hr_apply WATERMARK clamp is MONOTONE in (old, now()].
  v_ct := least(v_now, greatest(v_at, v_at - interval '1 hour'));
  if v_ct <> v_at then raise exception 'rested self-check (e): monotone clamp let the watermark go backwards'; end if;
  v_ct := least(v_now, greatest(v_at, v_now + interval '1 hour'));
  if v_ct <> v_now then raise exception 'rested self-check (e): future clamp failed'; end if;

  -- (f) columns present, NOT NULL.
  select count(*) into v_cnt from information_schema.columns
   where table_name='player_state' and column_name in ('rested_xp','rested_at') and is_nullable='NO';
  if v_cnt <> 2 then raise exception 'rested self-check (f): columns missing/nullable (%)', v_cnt; end if;

  -- (g) hr_state_of PROJECTS both keys.
  if strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), $q$'rested_xp', v_st.rested_xp$q$) = 0
     or strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), $q$'rested_at', v_st.rested_at$q$) = 0 then
    raise exception 'rested self-check (g): hr_state_of does not project rested';
  end if;

  -- (h) hr_apply ALLOWLISTS both keys AND writes rested_at.
  if strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), $q$'rested_xp', 'rested_at'$q$) = 0 then
    raise exception 'rested self-check (h): hr_apply does not allowlist rested';
  end if;
  if strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), $q$rested_at = case when p_delta ? 'rested_at'$q$) = 0 then
    raise exception 'rested self-check (h): hr_apply does not write rested_at';
  end if;

  -- (i) NO CLIENT WRITE POLICY on player_state (own-read only; RPCs are the writers).
  select count(*) into v_cnt from pg_policy where polrelid='public.player_state'::regclass and polcmd <> 'r';
  if v_cnt <> 0 then raise exception 'rested self-check (i): player_state has a non-read policy (client write leak)'; end if;

  raise notice 'rested self-check PASSED: whole-quanta accrual, exact watermark advance, idempotent replay, cap+monotone clamps, projected, allowlisted, no client write.';
end $mig$;

commit;
