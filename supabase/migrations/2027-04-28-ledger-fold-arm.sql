-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-28-ledger-fold-arm.sql — THE LEDGER'S FOLD TIER, ON: hr_ledger_config.detail_days = 3
--   (lane/c-ledger-fold, reliability-engineer, 2026-11-15). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit.
--   EXCLUDED from the rebuild, as the world-tick arms are: a rebuilt or restored database comes back with the tier as its
--   backup had it (a rebuild from the repo: OFF) and is armed by applying this file again.
--   ON THE EA SECURITY LIST (§3.7): the 3 below is Security's number.
--
-- ⚠ APPLY ONLY ON AN EXPLICIT GO, AFTER READING THE DRY RUN (node tools/ledger-fold.local.mjs). THIS IS THE STEP THAT IS NOT
--   REVERSIBLE. From the next hr-ledger-fold fire (ten minutes at most) accrue and hunt supply rows older than 3 days are
--   summed into player_ledger_windows and DELETED, 20,000 rows a run. Their sums, items, skill XP, kills by monster and purse
--   are kept to the unit; the per-settle rows themselves come back only from a backup taken before this file is applied.
--   The kill switch (2027-04-28-ledger-fold-disarm.sql) stops further folding. It does not bring a folded row back.
--
-- ── WHAT IT DOES ───────────────────────────────────────────────────────────
-- 1. Reads what the first runs would fold: hr_ledger_fold_plan at 3 days over the oldest 200,000 waiting rows (311,589
--    waited on 2026-11-15; the read is bounded so the apply's one statement is a known size; STABLE: it cannot write). 2027-04-27-ledger-fold.sql's model was written from the engine's code, not from production's rows, so this is
--    where the two meet: if under 900 in 1,000 of the folded-kind rows fit the model, the file REFUSES and prints the keys
--    that did not (a row that does not fit is safe, it stays as detail; but a model that misses production is fixed first).
-- 2. Records that answer in hr_ledger_fold_state.last (armed_at beside it): what was about to fold, kept.
-- 3. Sets detail_days = 3. Nothing else: the jobs, the locks and the functions are 2027-04-27-ledger-fold.sql's.
-- Already on (detail_days not NULL): a notice, nothing changed, whatever number an operator set stands.
--
-- EXPLOIT SURFACE DELTA: none of its own. It turns on the one delete path 2027-04-27-ledger-fold.sql describes.
-- COST: the dry run is one pass of at most 200,000 waiting rows through the (at, id) key, inside the apply. PGlite reads
--   2,400 of them a second; PostgreSQL 17 was not measured. If the apply times out, nothing has changed.
-- ORDER: after 2027-04-27-ledger-fold.sql is APPLIED and its dry run has been read. EDGE: NONE. CLIENT: NONE.
-- REVERSIBLE: forward only. 2027-04-28-ledger-fold-disarm.sql sets detail_days back to NULL.
-- IDEMPOTENT: a second apply finds the tier on and changes nothing.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare
  c_days         constant int := 3;      -- how long a settle's own row is kept (Security's to set; the dial's CHECK refuses under 3)
  c_fit_permille constant int := 900;    -- under this share of the waiting rows fitting the model, the model is wrong about production
  c_read         constant int := 200000; -- the oldest waiting rows the gate reads (node tools/ledger-fold.local.mjs --rows reads more)
  v_have int; v jsonb; v_seen bigint; v_fold bigint;
begin
  if to_regprocedure('public.hr_ledger_fold_plan(integer,uuid,integer)') is null
     or to_regprocedure('public.hr_ledger_fold(integer,boolean,uuid,integer)') is null
     or to_regclass('public.player_ledger_windows') is null or to_regclass('public.hr_ledger_fold_state') is null then
    raise exception 'PRECONDITION: 2027-04-27-ledger-fold.sql first'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and ((tgrelid = 'public.player_ledger_windows'::regclass
              and tgname in ('hr_ledger_window_proved', 'hr_ledger_windows_immutable', 'hr_ledger_windows_no_truncate'))
          or (tgrelid = 'public.player_ledger'::regclass and tgname in ('hr_ledger_immutable', 'hr_ledger_no_truncate')))) <> 5 then
    raise exception 'PRECONDITION: one of the five ledger locks is missing or disabled: the tier is not armed without them'; end if;

  select detail_days into v_have from public.hr_ledger_config where only_row;
  if v_have is not null then
    raise notice 'ledger-fold-arm: the tier is already on (detail_days %); nothing changed', v_have;
    return;
  end if;

  -- 1. THE READ, AND THE GATE
  v := public.hr_ledger_fold_plan(c_read, null, c_days);
  if coalesce(v->>'ok', '') <> 'true' or v ? 'off' then raise exception 'ARM: the dry run did not answer: %', v; end if;
  v_seen := (v->>'seen')::bigint;
  v_fold := (v->>'folded')::bigint;
  if v_seen > 0 and v_fold * 1000 < v_seen * c_fit_permille then
    raise exception 'ARM REFUSED: % of the % oldest folded-kind rows older than % days fit the model, under % in 1,000. The rows that do not: %',
      v_fold, v_seen, c_days, c_fit_permille, v->'left_by';
  end if;

  -- 2. THE RECORD   3. THE DIAL
  update public.hr_ledger_fold_state set last = v || jsonb_build_object('armed_at', now()), last_at = now() where only_row;
  update public.hr_ledger_config set detail_days = c_days where only_row;

  -- ── SELF-CHECK (CLAUDE.md §4) ────────────────────────────────────────────
  if (select detail_days from public.hr_ledger_config where only_row) is distinct from c_days then
    raise exception 'VERIFY: detail_days is not %', c_days; end if;
  if (public.hr_ledger_fold_range(20000, null, null)) ? 'off' then
    raise exception 'VERIFY: the fold still answers off'; end if;
  if (select s.last->>'armed_at' from public.hr_ledger_fold_state s where s.only_row) is null then
    raise exception 'VERIFY: the dry run was not recorded'; end if;
  if to_regclass('cron.job') is not null
     and not exists (select 1 from cron.job j where j.jobname = 'hr-ledger-fold' and j.command = 'select public.hr_ledger_fold(20000)') then
    raise exception 'VERIFY: the tier is on and no job runs it (hr-ledger-fold is not scheduled)'; end if;
  raise notice 'ledger-fold-arm: ON at % days. Read: the oldest % waiting rows (more wait: %), % fold into % windows, % stay as detail (%). First fire within 10 minutes.',
    c_days, v_seen, v->>'more', v_fold, v->>'windows', v->>'left', v->'left_by';
end $mig$;
