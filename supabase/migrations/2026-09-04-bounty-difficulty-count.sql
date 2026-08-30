-- 2026-09-04-bounty-difficulty-count.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The Coordinator applies this by hand (Management API / execute_sql wrapped in
-- begin/commit). It moves NO row, NO grant and NO policy: it adds three
-- IMMUTABLE lookup functions that no client role may execute, and patches ONE
-- statement pair inside hr_accept_bounty__ungated.
--
-- ⚠ IT MUST SHIP IN THE SAME BUILD AS src/core/bounty.js. The two halves are
--   one contract: the client DRAWS the kill count and the server CLAMPS it.
--     · Client alone: the board offers an easy contract for 72 kills and the
--       server clamps it UP to its tier floor of 80. The player is shown one
--       contract and made to fill another.
--     · Server alone: the client keeps drawing the tier range, so an easy
--       contract still draws 80–120 and the server clamps it DOWN to 108 — the
--       board's own number is wrong in the other direction, and the ruling's
--       gold-per-kill ladder never appears.
--   Neither half is safe on its own.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (b489, found on live). `hr_bounty_kill_range(tier)` — and
-- `bountyCount(type, tier, …)` on the client — read the TIER and nothing else,
-- so the board's EASY slot and its NORMAL slot drew from the SAME range. But
-- `hr_bounty_reward` already scaled the PAY by difficulty (easy 0.85x). Same
-- work, less gold: Easy was strictly the best-paying contract on the board and
-- the difficulty label argued against ever taking a harder one.
--
-- THE DESIGNER RULING (final authority; do not re-litigate here):
--
--     BOUNTY_DIFFICULTY_COUNT = { easy 0.90, normal 1.00, hard 1.20, elite 1.50 }
--
-- applied to the KILL COUNT, so gold-per-kill RISES with commitment. At tier 1
-- (320 base gold, an 80–120 range, midpoint 100):
--
--     easy    270 g /  90 kills = 3.00        hard   420 g / 120 = 3.50
--     normal  320 g / 100       = 3.20        elite  560 g / 150 = 3.73
--
-- and the same ordering holds at every one of the six tiers. §5 RE-DERIVES that
-- from the live functions rather than restating it, so a future reward edit that
-- re-inverts the ladder fails this file instead of shipping.
--
-- THE REWARD MULTIPLIERS ARE UNTOUCHED. `hr_bounty_reward`'s 0.85 / 1.0 / 1.3 /
-- 1.75 still price gold, marks and XP. Two tables, because they are two
-- decisions: one prices the pay, one prices the work.
--
-- ── WHY A NEW OVERLOAD AND NOT AN EDIT OF hr_bounty_kill_range(int) ───────
-- Because the tier table and the difficulty scale are different facts with
-- different owners, and composing them keeps ONE copy of each:
--     hr_bounty_kill_range(tier)              the TIER table  (unchanged)
--     hr_bounty_count_mult(difficulty)        the RULING table (new)
--     hr_bounty_kill_range(tier, difficulty)  the composition  (new)
--     hr_bounty_first_contract_range(diff)    the same composition over the
--                                             b487 first-contract bracket
-- tests/bounty-drift.mjs binds all four to src/core/bounty.js BY VALUE — every
-- (tier × difficulty) pair and the first-contract bracket, not just the four
-- multipliers, because a multiplier that matches while the rounding does not is
-- exactly the drift a constant-only guard cannot see.
--
-- ── FAIL CLOSED, IN THE DIRECTION THAT MATTERS ───────────────────────────
-- `hr_bounty_count_mult` returns NULL for an unknown difficulty, and the two
-- range functions therefore return NO ROW. The patched accept body reads that as
-- a NULL bound and answers `bad_difficulty` — a REFUSAL. The client does the
-- opposite (unknown → `normal`), and the asymmetry is deliberate: a client that
-- guesses renders a wrong label for one frame, a server that guesses WRITES a
-- wrong contract into active_bounty and enforces it at the turn-in.
--
-- Before this file, an unknown tier or difficulty produced NULL bounds that fell
-- through `least(null, greatest(null, p_required))` into a NOT NULL violation —
-- a PostgREST 500 indistinguishable from the server being down. The guard added
-- in §4 turns that into a machine code.
--
-- ── 'elite' IS STILL REFUSED AT THE ACCEPT, AND THAT IS NOT A GAP ────────
-- Security ruling 2026-08-23 (see hr_accept_bounty__ungated's own comment):
-- elite is never board-generated and is gated only by the CLIENT-owned
-- Bounty-Hunter level, so every 'elite' reaching the server is forged. This file
-- does NOT touch that allowlist. The elite arm exists in the multiplier table so
-- that the two sides of the ruling are complete and the drift guard can bind all
-- four values — the day elite becomes server-owned, the count is already right.
-- §5 asserts the refusal is still there.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────
-- Mechanical. Re-apply supabase/migrations/2026-08-29-bounty-first-contract.sql
-- (the last author of hr_accept_bounty__ungated — it restores the one-arg
-- range call), then
--     drop function public.hr_bounty_kill_range(int, text);
--     drop function public.hr_bounty_first_contract_range(text);
--     drop function public.hr_bounty_count_mult(text);
-- and revert BOUNTY_DIFFICULTY_COUNT + the `difficulty` argument in
-- src/core/bounty.js in the SAME build. No table, no column, no row, no grant.
--
-- ── COST AT 100x PLAYERS ─────────────────────────────────────────────────
-- Zero rows and zero bytes. Three IMMUTABLE lookups over constant CASE/VALUES
-- lists, evaluated once per ACCEPT (a deliberate, rare gesture — one row per
-- character in active_bounty, upserted). No new index, no new write, no new
-- journal entry.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
-- Facts about the LIVE database, not about file order: this file patches
-- whatever is installed and must refuse rather than half-apply.
do $$
begin
  if to_regprocedure('public.hr_bounty_kill_range(int)') is null then
    raise exception 'hr_bounty_kill_range(int) is absent — apply 2026-08-23-bounty.sql first.';
  end if;
  if to_regprocedure('public.hr_bounty_first_contract_range()') is null then
    raise exception 'hr_bounty_first_contract_range() is absent — apply '
                    '2026-08-29-bounty-first-contract.sql first.';
  end if;
  if to_regprocedure('public.hr_bounty_reward(int,text,text)') is null then
    raise exception 'hr_bounty_reward is absent — §5 cannot prove the gold-per-kill ladder, '
                    'which is the whole property this ruling buys.';
  end if;
  if to_regprocedure('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)') is null then
    raise exception 'hr_accept_bounty__ungated is absent — there is nothing to patch, so this '
                    'file would install a scaled range NOTHING CALLS and read as shipped.';
  end if;
end $$;


-- ── §1. THE RULING TABLE — one copy, and it is this one ────────────────────
-- IMMUTABLE: a pure function of its argument, so the planner may fold it and
-- the two range functions below inherit that.
-- NULL FOR AN UNKNOWN DIFFICULTY. Not 1.0 — see the header. `null` propagates
-- through the multiplication into a null bound, which §4's guard converts into
-- an honest `bad_difficulty`.
create or replace function public.hr_bounty_count_mult(p_difficulty text)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $fn$
  select case p_difficulty
           when 'easy'   then 0.90
           when 'normal' then 1.00
           when 'hard'   then 1.20
           when 'elite'  then 1.50
         end::numeric;
$fn$;

revoke execute on function public.hr_bounty_count_mult(text) from public;
revoke execute on function public.hr_bounty_count_mult(text) from anon, authenticated, service_role;


-- ── §2. THE SCALED TIER RANGE ──────────────────────────────────────────────
-- Composed, never restated: the tier numbers stay in hr_bounty_kill_range(int)
-- and the difficulty scale stays in §1. Restating either here would be the
-- second copy this whole program exists to avoid.
--
-- ROUNDING. `round(numeric)` rounds half AWAY FROM ZERO; JavaScript's
-- `Math.round` rounds half UP. Every value here is positive, so the two agree
-- on every half-way case in the table — which is what lets src/core/bounty.js's
-- `scaleCount` be a transcription of this rather than an approximation of it.
-- tests/bounty-drift.mjs re-derives all 24 pairs rather than trusting that
-- paragraph.
--
-- `greatest(1, …)` is a floor, not a clamp: a zero-kill contract would be
-- COMPLETE ON ACCEPTANCE, and no multiplier a designer can author should be able
-- to produce one.
--
-- NO ROW for an unknown difficulty (the join finds nothing), which is the
-- fail-closed half. An unknown TIER still yields a row of NULLs, because
-- hr_bounty_kill_range(int)'s CASE has no ELSE — §4 catches both with one test.
create or replace function public.hr_bounty_kill_range(p_tier integer, p_difficulty text)
returns table(kmin bigint, kmax bigint)
language sql
immutable
set search_path = public, pg_catalog
as $fn$
  select greatest(1, round(r.kmin * m.dm))::bigint,
         greatest(1, round(r.kmax * m.dm))::bigint
    from public.hr_bounty_kill_range(p_tier) r
    cross join lateral (select public.hr_bounty_count_mult(p_difficulty) as dm) m
   where m.dm is not null;
$fn$;

revoke execute on function public.hr_bounty_kill_range(integer, text) from public;
revoke execute on function public.hr_bounty_kill_range(integer, text) from anon, authenticated, service_role;


-- ── §3. THE SCALED FIRST-CONTRACT BRACKET ──────────────────────────────────
-- The b487 ruling's 15–25 floor for a brand-new Bounty Hunter, scaled by the
-- SAME multiplier. It has to scale, and the reason is the clamp rather than the
-- balance: the board's first slot is always EASY, so the client draws from
-- round(15×0.9)=14 … round(25×0.9)=23. A server that kept the unscaled 15 floor
-- would silently RAISE a legitimate 14-kill first contract to 15 — the exact
-- client-shows-one-thing / server-enforces-another failure this ruling was
-- written to remove from the difficulty axis.
create or replace function public.hr_bounty_first_contract_range(p_difficulty text)
returns table(kmin bigint, kmax bigint)
language sql
immutable
set search_path = public, pg_catalog
as $fn$
  select greatest(1, round(r.kmin * m.dm))::bigint,
         greatest(1, round(r.kmax * m.dm))::bigint
    from public.hr_bounty_first_contract_range() r
    cross join lateral (select public.hr_bounty_count_mult(p_difficulty) as dm) m
   where m.dm is not null;
$fn$;

revoke execute on function public.hr_bounty_first_contract_range(text) from public;
revoke execute on function public.hr_bounty_first_contract_range(text) from anon, authenticated, service_role;


-- ── §4. THE CALL SITE ──────────────────────────────────────────────────────
-- PROGRAMMATIC, ANCHORED, FAIL-CLOSED, IDEMPOTENT. Never a template
-- restatement of a body this file did not author — that is the b484–b487
-- "everything refuses" class, and hr_accept_bounty__ungated has been authored by
-- FIVE different migrations (2026-08-23-bounty, -first-contract, -kill-credit,
-- -kill-daily-credit, -renown-kill-faucet touch this family), so a restatement
-- here would revert whichever of them ran last.
--
-- BOTH ANCHORS VERIFIED, 2026-09-04, in BOTH places they have to match:
--   · production `pg_get_functiondef` (CR-stripped) — 1 hit each
--   · supabase/migrations/2026-08-29-bounty-first-contract.sql (the last author,
--     and therefore what a repo REBUILD installs) — 1 hit each
-- A count other than exactly 1 raises rather than patching blind.
--
-- CR-TOLERANT. Production stores several of these bodies with CRLF (measured:
-- hr_create_character does, hr_accept_bounty__ungated does not) because they were
-- applied from a CRLF working copy. An LF-joined anchor would match nothing at
-- all — the trap 2026-08-23-modal-goal-claims.sql §5 documents. Stripping CR is
-- the only normalisation done here.
do $do$
declare
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
  c_sig constant text := 'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)';
  c_a1  constant text :=
    '  select kmin, kmax into v_kmin, v_kmax from public.hr_bounty_kill_range(v_tier);';
  c_a2  constant text :=
    '    select kmin into v_kmin from public.hr_bounty_first_contract_range();';
  c_r1  constant text :=
       '  -- b497 DESIGNER RULING: the DIFFICULTY scales the kill count, so the range' || chr(10)
    || '  -- the server clamps into is the one the client drew from. A tier-only range' || chr(10)
    || '  -- here would silently raise an honest 72-kill EASY contract to 80.' || chr(10)
    || '  select kmin, kmax into v_kmin, v_kmax' || chr(10)
    || '    from public.hr_bounty_kill_range(v_tier, p_difficulty);' || chr(10)
    || '  -- FAIL CLOSED. No row (unknown difficulty) or a null bound (unknown tier)' || chr(10)
    || '  -- used to fall through least/greatest into a NOT NULL violation — a 500 that' || chr(10)
    || '  -- reads as "the server is down". A machine code is the honest answer.' || chr(10)
    || '  if v_kmin is null or v_kmax is null then' || chr(10)
    || '    return jsonb_build_object(''ok'', false, ''error'', ''bad_difficulty'',' || chr(10)
    || '      ''difficulty'', p_difficulty, ''tier'', v_tier);' || chr(10)
    || '  end if;';
  c_r2  constant text :=
       '    -- SCALED TOO. The board''s first slot is always EASY, so an unscaled floor' || chr(10)
    || '    -- of 15 would raise the client''s honest round(15*0.9)=14 to 15.' || chr(10)
    || '    select kmin into v_kmin from public.hr_bounty_first_contract_range(p_difficulty);';
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('hr_bounty_kill_range(v_tier, p_difficulty)' in v_src) > 0 then
    raise notice 'hr_accept_bounty__ungated already carries the difficulty-scaled range — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (tier range): matched % times, expected exactly 1. Refusing to '
                    'patch blind. Re-apply 2026-08-29-bounty-first-contract.sql, then this file.', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (first-contract floor): matched % times, expected exactly 1. '
                    'Refusing to patch blind. Re-apply 2026-08-29-bounty-first-contract.sql, '
                    'then this file.', v_hits;
  end if;

  v_new := replace(replace(v_src, c_a1, c_r1), c_a2, c_r2);

  -- THE ACL IS THE POINT OF THE PROGRAM. `create or replace` preserves proacl;
  -- this ASSERTS that rather than trusting it, and it is cheaper and safer than
  -- restating the revoke/grant block (a restatement is itself a chance to widen).
  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute v_new;
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_accept_bounty__ungated (% -> %) — a body replace must never '
                    'change who may call it.', v_acl_before, v_acl_after;
  end if;

  raise notice 'patched hr_accept_bounty__ungated: the accept clamp is now difficulty-scaled';
end $do$;


-- ── §5. THE FILE CANNOT SUCCEED QUIETLY ────────────────────────────────────
do $$
declare
  v_lo bigint; v_hi bigint;
  v_g bigint; v_m int; v_x int;
  v_prev numeric; v_gpk numeric;
  v_src text;
  v_n int;
  d text;
  t int;
  c_diffs constant text[] := array['easy','normal','hard','elite'];
begin
  -- (a) THE RULING TABLE LANDED, BY VALUE.
  if public.hr_bounty_count_mult('easy')   <> 0.90 then raise exception 'VERIFY: easy multiplier'; end if;
  if public.hr_bounty_count_mult('normal') <> 1.00 then raise exception 'VERIFY: normal multiplier'; end if;
  if public.hr_bounty_count_mult('hard')   <> 1.20 then raise exception 'VERIFY: hard multiplier'; end if;
  if public.hr_bounty_count_mult('elite')  <> 1.50 then raise exception 'VERIFY: elite multiplier'; end if;
  if public.hr_bounty_count_mult('nonsense') is not null then
    raise exception 'VERIFY: an unknown difficulty must be NULL — a defaulted 1.0 would let a '
                    'forged difficulty through the accept with a NORMAL range.';
  end if;

  -- (b) FAIL CLOSED: an unknown difficulty yields NO ROW, not a normal range.
  select count(*) into v_n from public.hr_bounty_kill_range(1, 'nonsense');
  if v_n <> 0 then raise exception 'VERIFY: hr_bounty_kill_range(1,''nonsense'') returned % row(s)', v_n; end if;
  select count(*) into v_n from public.hr_bounty_first_contract_range('nonsense');
  if v_n <> 0 then raise exception 'VERIFY: hr_bounty_first_contract_range(''nonsense'') returned % row(s)', v_n; end if;

  -- (c) THE PUBLISHED TIER-1 NUMBERS, exactly as the ruling states them.
  select kmin, kmax into v_lo, v_hi from public.hr_bounty_kill_range(1, 'easy');
  if v_lo <> 72 or v_hi <> 108 then raise exception 'VERIFY: tier1 easy range is %-%, expected 72-108', v_lo, v_hi; end if;
  select kmin, kmax into v_lo, v_hi from public.hr_bounty_kill_range(1, 'normal');
  if v_lo <> 80 or v_hi <> 120 then raise exception 'VERIFY: tier1 normal range is %-%, expected 80-120', v_lo, v_hi; end if;
  select kmin, kmax into v_lo, v_hi from public.hr_bounty_kill_range(1, 'hard');
  if v_lo <> 96 or v_hi <> 144 then raise exception 'VERIFY: tier1 hard range is %-%, expected 96-144', v_lo, v_hi; end if;
  select kmin, kmax into v_lo, v_hi from public.hr_bounty_kill_range(1, 'elite');
  if v_lo <> 120 or v_hi <> 180 then raise exception 'VERIFY: tier1 elite range is %-%, expected 120-180', v_lo, v_hi; end if;
  select kmin, kmax into v_lo, v_hi from public.hr_bounty_first_contract_range('easy');
  if v_lo <> 14 or v_hi <> 23 then raise exception 'VERIFY: first-contract easy bracket is %-%, expected 14-23', v_lo, v_hi; end if;

  -- (d) THE PROPERTY THE RULING ACTUALLY BUYS — gold per kill RISES with
  --     commitment, at EVERY tier, re-derived from the two live functions
  --     rather than restated. A future reward-table edit that re-inverts the
  --     ladder fails here instead of shipping.
  for t in 1..6 loop
    v_prev := null;
    foreach d in array c_diffs loop
      select kmin, kmax into v_lo, v_hi from public.hr_bounty_kill_range(t, d);
      select gold, marks, xp into v_g, v_m, v_x from public.hr_bounty_reward(t, 'cull', d);
      v_gpk := v_g::numeric / ((v_lo + v_hi)::numeric / 2);
      if v_prev is not null and v_gpk <= v_prev then
        raise exception 'VERIFY: gold-per-kill is NOT monotonic at tier % (% pays %, the easier '
                        'difficulty paid %) — "Easy is the best contract on the board" is back.',
          t, d, round(v_gpk, 3), round(v_prev, 3);
      end if;
      v_prev := v_gpk;
      if v_lo > v_hi then raise exception 'VERIFY: tier % % range inverted (%-%)', t, d, v_lo, v_hi; end if;
      if v_lo < 1 then raise exception 'VERIFY: tier % % has a zero-kill floor — the contract would '
                                       'be complete on acceptance', t, d; end if;
    end loop;
  end loop;

  -- (e) THE CALL SITE ACTUALLY MOVED, and the security posture did not.
  v_src := replace(pg_get_functiondef(
    'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)'::regprocedure), chr(13), '');
  if position('hr_bounty_kill_range(v_tier, p_difficulty)' in v_src) = 0 then
    raise exception 'VERIFY: the accept still clamps on the TIER-ONLY range — the patch did not land';
  end if;
  if position('hr_bounty_first_contract_range(p_difficulty)' in v_src) = 0 then
    raise exception 'VERIFY: the first-contract floor is still unscaled';
  end if;
  if position('''bad_difficulty''' in v_src) = 0 then
    raise exception 'VERIFY: the null-bound refusal is missing — an unknown tier/difficulty would '
                    'still 500 on a NOT NULL violation';
  end if;
  -- The 2026-08-23 security ruling this file must NOT relax.
  if position('p_difficulty not in (''easy'',''normal'',''hard'')' in v_src) = 0 then
    raise exception 'VERIFY: the elite refusal is gone. elite is client-gated and 1.75x on gold; '
                    'this file is not allowed to open it.';
  end if;

  -- (f) NOBODY MAY CALL THE NEW FUNCTIONS. They are internals of a SECURITY
  --     DEFINER body, which reaches them WITHOUT a grant.
  foreach d in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(d, 'public.hr_bounty_count_mult(text)', 'execute')
       or has_function_privilege(d, 'public.hr_bounty_kill_range(integer,text)', 'execute')
       or has_function_privilege(d, 'public.hr_bounty_first_contract_range(text)', 'execute') then
      raise exception 'VERIFY: % can execute one of the new bounty range functions', d;
    end if;
  end loop;

  raise notice 'b497 bounty difficulty: counts scaled 0.90/1.00/1.20/1.50, gold-per-kill monotonic at all 6 tiers';
end $$;
