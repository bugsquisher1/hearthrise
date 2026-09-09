-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-09-worker-hire-price.sql — AN UNPAID CREW CAP IS ZERO, NOT SIX
--
-- FOUND LIVE, by playing (QA 0a47ba77-3a6d-495d-8a95-07480a9d90cf, slot 2,
-- 2026-09-09 03:00:33 UTC, b527): the House panel offered "Hire worker — 500g",
-- the click hired a worker, and player_state.gold did not move (10,181 before,
-- 10,181 after). player_ledger got exactly one row —
--   kind='worker', intent='worker_hire', gold=NULL, meta.paid_cap = 6
-- — for a character that has NEVER bought a worker_hire rung: there is no
-- player_progress row (kind='unlock', key='worker_hire') for (that user, slot 2)
-- at all. The hire was FREE, and it would have stayed free for five more
-- workers.
--
-- ── ROOT CAUSE: LEAST()/GREATEST() IGNORE NULLS ─────────────────────────────
-- 2026-08-24-worker-hire-cap-read.sql:77 reads the paid cap as
--
--   select coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0)
--     into v_cap from public.player_progress pp where … key = 'worker_hire' …
--
-- Over ZERO matching rows, max(pp.value) is NULL — and Postgres LEAST/GREATEST
-- are NOT strict: they DROP null arguments and return the least/greatest of
-- what remains. So least(NULL, 6) = 6, greatest(0, 6) = 6, and the outer
-- coalesce never sees a NULL to fix. Measured on production, read-only:
--
--   select coalesce(greatest(0, least(max(v), 6))::int, 0),          -- => 6
--          least(greatest(0, coalesce(max(v), 0)), 6)::int           -- => 0
--     from (select null::bigint as v where false) t;
--
-- The guard `if v_n >= least(v_cap, c_max_crew)` then reads 0 >= 6 = false and
-- the hire proceeds. The defect is precisely the OPPOSITE of the bug that file
-- was written to fix (a cap wrongly zeroed): it converted "no rung" from
-- refuse-everything into grant-everything. Fail-open, on a gold surface.
--
-- ── WHERE THE PRICE ACTUALLY LIVES (it is not missing, and it is not client) ─
-- The 500g is NOT a client number and this file does NOT add a price to the
-- hire. Crew size is sold as an unlock ladder: src/data/gold-ladders.js
-- WORKER_HIRE_COSTS [500, 3000, 15000, 75000, 250000, 750000] is GENERATED into
-- public.hr_unlock_offers (2026-08-16-unlock-offers.generated.sql) and charged
-- by public.hr_unlock_buy, which debits gold under its own lock and journals
-- kind='shop', intent='unlock_buy:worker_hire.N:N', gold=-500. Four ledger
-- pairs on production show that working correctly. hr_worker_hire is the
-- MATERIALISER: it creates a crew row up to the cap the player has already paid
-- for, and by design moves no gold (which is why its ledger row has gold=NULL).
-- Adding a second price here would duplicate game data into SQL — the failure
-- 2026-08-25-workers.sql §3 exists to refuse. The correct fix is that the cap
-- reads ZERO when nothing is paid, so hr_worker_hire answers crew_cap_reached
-- with paid_cap 0 and the client's HIRE-FIRST flow (src/features/workers.js
-- hireServer) falls through to buying worker_hire.1 — 500g, server-priced,
-- server-debited, server-journalled — before it can hire.
--
-- ── HOW THIS PATCHES: ANCHORED, NEVER RESTATED ──────────────────────────────
-- hr_worker_hire's body has been textually patched since it was authored
-- (2026-09-03-intent-mismatch-class.sql swapped its cache read for
-- hr_intent_replay, and applies at order index 122 — AFTER this body's last
-- full author at 112). A `create or replace` restatement here would silently
-- revert that fix. So this file replaces ONE LINE by exact anchor, asserts the
-- anchor matched exactly once, and asserts the ACL did not move — the same
-- discipline as 2026-09-03 §2.
--
-- REVERSIBILITY: the inverse anchor swap restores the previous expression
-- (re-applying 2026-08-24-worker-hire-cap-read.sql also restores it, but that
-- file would ALSO revert the intent-mismatch patch — prefer the inverse swap).
-- SAFE TO RE-RUN: the patch is skipped when the fixed expression is present.
-- NO DATA IS TOUCHED. This file does not delete the three free workers already
-- materialised on production, does not adjust anyone's gold, and does not
-- fabricate a paid rung. That remediation is a separate, Tyler/Security call.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0. ANCHORS ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_worker_hire(int, uuid)') is null then
    raise exception 'hr_worker_hire is absent — apply 2026-08-25-workers.sql and 2026-08-24-worker-hire-cap-read.sql first';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is absent';
  end if;
  if to_regclass('public.hr_unlock_offers') is null then
    raise exception 'hr_unlock_offers is absent — the hire price lives there, not here';
  end if;
end $$;


-- ── §1. THE ONE-LINE, ANCHORED CAP FIX ──────────────────────────────────────
do $do$
declare
  c_sig      constant text := 'public.hr_worker_hire(int,uuid)';
  c_anchor   constant text :=
    '  select coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0) into v_cap';
  c_repl     constant text :=
       '  -- NULL-SAFE: LEAST/GREATEST DROP nulls, so least(max(pp.value), 6) over a'  || chr(10)
    || '  -- player with NO worker_hire row returned 6 — a free crew of six (live'      || chr(10)
    || '  -- 2026-09-09). The coalesce must be INSIDE, on the aggregate, not outside'   || chr(10)
    || '  -- the clamp where it can never fire. Unpaid cap is 0 and the hire refuses.'  || chr(10)
    || '  select least(greatest(0, coalesce(max(pp.value), 0)), c_max_crew)::int into v_cap';
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
begin
  -- CR-tolerant: a body applied from a CRLF working copy is STORED with CRLF.
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('least(greatest(0, coalesce(max(pp.value), 0)), c_max_crew)' in v_src) > 0 then
    raise notice 'hr_worker_hire already carries the null-safe cap read — patch skipped';
  else
    v_hits := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
    if v_hits <> 1 then
      raise exception 'ANCHOR DRIFT on %: the fail-open cap read matched % times, expected exactly 1. '
                      'Refusing to patch blind. Re-apply 2026-08-24-worker-hire-cap-read.sql then '
                      '2026-09-03-intent-mismatch-class.sql, then this file.', c_sig, v_hits;
    end if;
    v_new := replace(v_src, c_anchor, c_repl);

    -- The ACL is the whole point of a privileged surface; prove the replace did
    -- not move it rather than trusting that `create or replace` preserves it.
    select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
    execute v_new;
    select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
    if v_acl_after is distinct from v_acl_before then
      raise exception 'ACL MOVED on % (% -> %) — a body replace must never change who may call it.',
        c_sig, v_acl_before, v_acl_after;
    end if;
    raise notice 'patched %: an unpaid worker_hire cap is now 0, not 6', c_sig;
  end if;
end $do$;


-- ── §2. SELF-CHECK — properties asserted by EXECUTING SQL, not by markers ───
do $do$
declare
  v_src   text;
  v_buggy int;
  v_fixed int;
  v_bad   text[] := '{}';
  r       record;
begin
  v_src := replace(pg_get_functiondef('public.hr_worker_hire(int,uuid)'::regprocedure), chr(13), '');

  -- (a) THE SEMANTIC CLAIM, EXECUTED. Not "the text changed" — the two
  --     expressions are evaluated over an EMPTY row set, the exact live
  --     condition (a player with no worker_hire progress row), and the old one
  --     must still return 6 while the new one returns 0. If a future Postgres
  --     made LEAST strict, this block tells us by going red on the first half.
  select coalesce(greatest(0, least(max(v), 6))::int, 0),
         least(greatest(0, coalesce(max(v), 0)), 6)::int
    into v_buggy, v_fixed
    from (select null::bigint as v where false) t;
  if v_buggy <> 6 then
    raise exception 'the null-swallow premise no longer holds (old form gave %, expected 6) — re-read this file before trusting it', v_buggy;
  end if;
  if v_fixed <> 0 then
    raise exception 'the null-safe form gave % for an unpaid player, expected 0', v_fixed;
  end if;

  -- (b) THE BODY CARRIES THE FIXED READ AND NOT THE FAIL-OPEN ONE.
  if position('least(greatest(0, coalesce(max(pp.value), 0)), c_max_crew)' in v_src) = 0 then
    raise exception 'hr_worker_hire does not carry the null-safe cap read';
  end if;
  if position('coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0)' in v_src) > 0 then
    raise exception 'hr_worker_hire still carries the fail-open cap read — the free-crew bug is back';
  end if;

  -- (c) THE 2026-09-03 IDEMPOTENCY PATCH SURVIVED THIS EDIT. A restatement that
  --     dropped it would re-open the intent-mismatch class silently.
  if position('hr_intent_replay(' in v_src) = 0 then
    raise exception 'hr_worker_hire lost its hr_intent_replay guard — this file restated a body it did not author';
  end if;

  -- (d) NO PRICE AND NO GOLD CROSSED INTO THIS RPC. The hire must remain the
  --     materialiser; the 500g ladder stays in hr_unlock_offers / hr_unlock_buy.
  if v_src ~ 'player_state[^;]*set[^;]*gold' or position('gold_ladder' in v_src) > 0 then
    raise exception 'hr_worker_hire now touches gold — the hire price belongs to hr_unlock_buy, never a second catalogue here';
  end if;
  if to_regclass('public.hr_worker_hire_costs') is not null then
    raise exception 'hr_worker_hire_costs exists — the hire price must come from the generated gold-ladder, not a second SQL table';
  end if;

  -- (e) THE PRICE IS SERVER-OWNED AND MATCHES THE LADDER'S FIRST RUNG. Read
  --     from the generated offers table, so a client that shows 500g is
  --     echoing the server rather than authoring it.
  if (select gold from public.hr_unlock_offers where offer_id = 'worker_hire.1') is distinct from 500 then
    raise exception 'worker_hire.1 is not priced 500g server-side (got %) — regenerate the offers catalogue',
      (select gold from public.hr_unlock_offers where offer_id = 'worker_hire.1');
  end if;

  -- (f) STILL NOT CALLABLE BY anon; still callable by authenticated (it is a
  --     client intent). Both directions, because a widened grant here is the
  --     game and a revoked one is an outage.
  if has_function_privilege('anon', 'public.hr_worker_hire(int,uuid)', 'execute') then
    raise exception 'anon can execute hr_worker_hire';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_worker_hire(int,uuid)', 'execute') then
    raise exception 'authenticated can no longer execute hr_worker_hire — every hire would fail';
  end if;

  -- (g) KILL THE CLASS, NOT THE BUG. Sweep every public function body for the
  --     same fail-open fingerprint — a clamp whose coalesce sits OUTSIDE a
  --     LEAST/GREATEST over an aggregate. Fingerprint-exact so it cannot cry
  --     wolf, and it bites the moment someone copies this line again.
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ 'coalesce\s*\(\s*greatest\s*\(\s*0\s*,\s*least\s*\(\s*max\s*\('
  loop
    v_bad := v_bad || r.sig;
  end loop;
  if array_length(v_bad, 1) > 0 then
    raise exception 'fail-open clamp (coalesce OUTSIDE least(max(…))) still present in: %', array_to_string(v_bad, ', ');
  end if;

  raise notice 'self-check OK: unpaid cap 0, price stays in hr_unlock_offers, replay guard intact, class swept';
end $do$;
