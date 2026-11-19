-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-26-faction-switch-qa.sql — THE FACTIONS ON FOR THE QA ACCOUNT ONLY (lane/b-factions-open, systems-engineer, 2026-11-19).
--
-- STATUS: STAGED, NOT APPLIED. A COORDINATOR STEP: apply (tools/apply-migration.mjs, one file) once v0.2.141 is live, that is after the
-- factions' files (2027-04-22-faction-catalogue.generated.sql, 2027-04-22-faction-standing.sql, 2027-04-23-faction-section.sql) and the
-- outfit path (2027-05-19-faction-outfit-path.sql, 2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql) have applied, so the
-- play gate can join a side, earn standing and wear a look on live as the QA account while every other account sees nothing.
-- WHAT: the `factions` switch (2027-04-23-faction-section.sql, seeded off) to scope `accounts`, listing the QA account (0a47ba77, "QA
-- account (play gate)" on the access allowlist). Nothing else moves: no player row, no value. Every faction verb (join, swap start and
-- finish, the outfit claim) reads the switch through hr_faction_locked and the `factions` section through hr_faction_section, so this
-- one row opens the Faction tab, the join prompt and the faction looks' locked cards for that account alone.
-- EXCLUDED FROM THE REPLAY (tests/schema-apply-order.json `excluded`): an operational switch for one production account; a rebuilt
-- database is correct without it (no such account exists there), as 2027-04-29-tower-switch-qa.sql.
-- SUPERSEDED BY 2027-05-27-arm-factions.sql (the switch to everyone, with the 0.2.142 release).
-- REVERSIBLE: update public.hr_feature_switches set scope = 'off', accounts = '{}', updated_at = now() where switch_id = 'factions';
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'factions') then
    raise exception 'PRECONDITION: apply 2027-04-23-faction-section.sql first (the factions switch)'; end if;
  if to_regprocedure('public.hr_faction_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-04-23-faction-section.sql first (the Faction tab''s section)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_outfits' and column_name = 'pieces') then
    raise exception 'PRECONDITION: apply 2027-05-19-faction-outfit-path.sql first (a faction look worn through the one outfit path)'; end if;
end $mig$;

update public.hr_feature_switches
   set scope = 'accounts', accounts = array['0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid], updated_at = now()
 where switch_id = 'factions';

-- §1 SELF-CHECK (CLAUDE.md §4): on for the QA account, off for anyone else.
do $chk$
begin
  if not public.hr_feature_on('factions', '0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid) then
    raise exception 'faction-switch-qa §1: the switch is not on for the QA account'; end if;
  if public.hr_feature_on('factions', '00000000-0000-4000-8000-0000000000aa'::uuid) then
    raise exception 'faction-switch-qa §1: the switch is on for an account it does not list'; end if;
  raise notice 'faction-switch-qa §1 OK: the factions are on for the QA account alone';
end $chk$;
