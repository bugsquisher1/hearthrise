-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-28-ledger-fold-disarm.sql — THE LEDGER'S FOLD TIER, OFF: hr_ledger_config.detail_days = NULL  (THE KILL SWITCH)
--   (lane/c-ledger-fold, reliability-engineer, 2026-11-15). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit.
--   EXCLUDED from the rebuild: a rebuilt database already has the tier off. Apply ONLY to stop the fold.
--
-- ── WHEN ───────────────────────────────────────────────────────────────────
-- hr-ledger-fold fails (cron.job_run_details, hr_cron_health), hr_ledger_fold_state.last shows rows_left climbing (a writer
-- journals a key the model lacks), or a reader turns out to need detail older than 3 days.
--
-- ── WHAT IT DOES ───────────────────────────────────────────────────────────
-- Sets detail_days = NULL. From the next fire hr_ledger_fold answers "off" and reads nothing, no window can be written
-- (hr_ledger_window_proved refuses), and hr_ledger_immutable refuses every delete inside retain_days again, a row some window
-- lists included. Windows already written stay: they are the only record of the detail they replaced, they keep their
-- retain_days, and hr-ledger-windows-prune still rolls them up. A row already folded is NOT brought back.
-- The cursor (hr_ledger_fold_state.folded_to) stays, so arming again resumes where the fold stopped.
--
-- REVERSIBLE: apply 2027-04-28-ledger-fold-arm.sql again. IDEMPOTENT: a second apply finds it off.
-- EDGE: NONE. CLIENT: NONE. No value moves.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare v_have int;
begin
  if to_regclass('public.hr_ledger_config') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_ledger_config'
                     and column_name = 'detail_days') then
    raise exception 'PRECONDITION: 2027-04-27-ledger-fold.sql first'; end if;
  select detail_days into v_have from public.hr_ledger_config where only_row;
  update public.hr_ledger_config set detail_days = null where only_row and detail_days is not null;

  -- ── SELF-CHECK (CLAUDE.md §4) ────────────────────────────────────────────
  if (select detail_days from public.hr_ledger_config where only_row) is not null then
    raise exception 'VERIFY: detail_days is still set'; end if;
  if public.hr_ledger_fold_range(20000, null, null) is distinct from jsonb_build_object('off', true) then
    raise exception 'VERIFY: the fold does not answer off'; end if;
  raise notice 'ledger-fold-disarm: OFF (was %). % windows stand; no folded row is brought back.',
    coalesce(v_have::text, 'already off'), (select count(*) from public.player_ledger_windows);
end $mig$;
