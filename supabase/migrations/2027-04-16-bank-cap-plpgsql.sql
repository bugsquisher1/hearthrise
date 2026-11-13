-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-16-bank-cap-plpgsql.sql — hr_bank_cap_for_rungs RESTATED AS plpgsql, SAME ANSWERS (settle-budget SB-3)
--   (lane/a-bag-expand-r2, systems-engineer, 2026-11-12).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. No table, no value, no grant change (CREATE OR REPLACE keeps owner and grants). EDGE: none.
-- ORDER: after 2027-04-15-bag-expand-view.sql.
--
-- WHY: hr_bag_expand_view (2027-04-15, live) calls hr_bank_cap_for_rungs twice a section read, 8 a 4-hero settle. A
-- LANGUAGE sql function with a SET clause is re-planned on every call on PostgreSQL 17 (tools/gen-plan-cache.mjs's
-- header). The restatement is that tool's shape: the SQL body verbatim inside plpgsql, first row of its one column.
-- Signature, return type, STABLE, SECURITY INVOKER and the SET clause are the pre-image's.
-- ════════════════════════════════════════════════════════════════════════

-- §0 the pre-image, kept as pg_temp for the self-check
create or replace function pg_temp.hr_bank_cap_for_rungs_sql(p_rungs int)
returns int language sql stable set search_path = public, pg_temp as $body$
  select least(
           100000,
           (select bank_cap from public.hr_start_kit where only_row)
           + least(
               greatest(coalesce(p_rungs, 0), 0),
               coalesce((select max_value from public.hr_unlocks where unlock_id = 'bank'), 0)
             )::int
             * 20
         )::int
$body$;

create or replace function public.hr_bank_cap_for_rungs(p_rungs int)
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $body$
#variable_conflict use_column
begin
  return (select hr_q.v from (
  select least(
           100000,
           (select bank_cap from public.hr_start_kit where only_row)
           + least(
               greatest(coalesce(p_rungs, 0), 0),
               coalesce((select max_value from public.hr_unlocks where unlock_id = 'bank'), 0)
             )::int
             /* BANK_STACKS_PER_RUNG — src/data/gold-ladders.js; tests/bank-cap-rungs.mjs measures it back. */
             * 20
         )::int
  ) as hr_q(v) limit 1);
end
$body$;

-- §4 SELF-CHECK: identical answers over rungs -1..31 and NULL; plpgsql now; no client role reaches it.
do $chk$
declare r int;
begin
  for r in -1..31 loop
    if public.hr_bank_cap_for_rungs(r) is distinct from pg_temp.hr_bank_cap_for_rungs_sql(r) then
      raise exception 'bank-cap-plpgsql §4: rung % answers % (was %)', r, public.hr_bank_cap_for_rungs(r), pg_temp.hr_bank_cap_for_rungs_sql(r); end if;
  end loop;
  if public.hr_bank_cap_for_rungs(null) is distinct from pg_temp.hr_bank_cap_for_rungs_sql(null) then
    raise exception 'bank-cap-plpgsql §4: NULL answers differently'; end if;
  if public.hr_bank_cap_for_rungs(0) <> 100 or public.hr_bank_cap_for_rungs(1) <> 120 then
    raise exception 'bank-cap-plpgsql §4: the ladder reads % / %', public.hr_bank_cap_for_rungs(0), public.hr_bank_cap_for_rungs(1); end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'public.hr_bank_cap_for_rungs(integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'bank-cap-plpgsql §4: still not plpgsql'; end if;
  if has_function_privilege('anon', 'public.hr_bank_cap_for_rungs(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_bank_cap_for_rungs(integer)', 'execute') then
    raise exception 'bank-cap-plpgsql §4: a client role can call it'; end if;
  raise notice 'bank-cap-plpgsql §4 OK: rungs -1..31 and NULL identical, plpgsql, grants unchanged';
end $chk$;
drop function pg_temp.hr_bank_cap_for_rungs_sql(int);
