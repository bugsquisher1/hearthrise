-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-29-tower-switch-qa.sql — THE BURNING TOWER ON FOR THE QA ACCOUNT ONLY (lane/b-tower-window, systems-engineer, 2026-11-16).
--
-- STATUS: STAGED, NOT APPLIED. A COORDINATOR STEP: apply (tools/apply-migration.mjs, one file) only after the Tower's files have applied in
-- their order (2027-04-23-session-modes* .. 2027-04-27-tower-chest.sql, 2027-04-28-tower-section.sql) and the edge carrying the climb is
-- deployed, so the play gate can climb on live as the QA account while every other account sees nothing.
-- WHAT: the `burning_tower` switch (2027-04-24-tower-climb.sql, seeded off) to scope `accounts`, listing the QA account (0a47ba77, "QA
-- account (play gate)" on the access allowlist). Nothing else moves: no player row, no value. Every Tower verb and the `tower` section
-- read the switch through hr_feature_on, so this one row opens the door, the chest and the window for that account alone.
-- EXCLUDED FROM THE REPLAY (tests/schema-apply-order.json `excluded`): an operational switch for one production account; a rebuilt
-- database is correct without it (no such account exists there), as 2026-10-19-alpha-premium-grant.sql.
-- REVERSIBLE: update public.hr_feature_switches set scope = 'off', accounts = '{}', updated_at = now() where switch_id = 'burning_tower';
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql first (the burning_tower switch)'; end if;
  if to_regprocedure('public.hr_tower_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-04-28-tower-section.sql first (the window''s section)'; end if;
end $mig$;

update public.hr_feature_switches
   set scope = 'accounts', accounts = array['0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid], updated_at = now()
 where switch_id = 'burning_tower';

-- §1 SELF-CHECK (CLAUDE.md §4): on for the QA account, off for anyone else.
do $chk$
begin
  if not public.hr_feature_on('burning_tower', '0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid) then
    raise exception 'tower-switch-qa §1: the switch is not on for the QA account'; end if;
  if public.hr_feature_on('burning_tower', '00000000-0000-4000-8000-0000000000aa'::uuid) then
    raise exception 'tower-switch-qa §1: the switch is on for an account it does not list'; end if;
  raise notice 'tower-switch-qa §1 OK: the Burning Tower is on for the QA account alone';
end $chk$;
