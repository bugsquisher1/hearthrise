-- tests/fixtures/job-counts-slice-shim.sql — NOT A MIGRATION.
--
-- The 2026-08 SLICE chain (tests/pglite-chain.mjs bootChain + activity-intent's EXTRA list) runs the real hr-accrue
-- modules against an hr_apply that predates "make N" (2026-12-01-bench-count.sql). Since 1026-job-counts.sql every
-- gathering job carries a count (set-activity.js refuses one without), and a job may carry its THEN as `next`, so the
-- slice's activity allowlist is widened to READ the two keys and nothing more: the slice keeps no count (it has no
-- column) and a job there runs as it did. The count and the THEN themselves are the full chain's, proved there by
-- tests/job-counts.mjs and the migration's own §8. The anchor must match exactly once, or the shim refuses.
do $shim$
declare v_def text; v_old constant text := 'where ak <> all (array[''kind'',''id'',''restart''])) then'; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'job-counts-slice-shim: the slice hr_apply allowlist matched % times (need 1)', v_n; end if;
  execute replace(v_def, v_old, 'where ak <> all (array[''kind'',''id'',''restart'',''count'',''next''])) then');
end $shim$;
