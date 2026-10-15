-- tests/fixtures/hunt-sessions-slice-shim.sql — NOT A MIGRATION.
--
-- The 2026-08 SLICE chains (tests/pglite-chain.mjs bootChain + an EXTRA list:
-- activity-intent, claim-intent, gold-intents) run the real hr-accrue modules
-- against a database that predates hunt sessions. Since lane C2 the accrue and
-- collect paths ask hr_hunt_open_of first, so the old combat pricing never runs
-- for a hunter. On a chain with NO hunt_sessions table no character can hold an
-- open session, so the honest answer is NULL for everyone — exactly what the
-- real body (2026-10-22-hunt-sessions-settle.sql §2) answers for a character
-- with no open row. The edge reads a missing function (42883) the same way, but
-- over pglite-socket a SQL error closes the connection instead of returning one
-- (tests/delta-transport.mjs T9), so the slice states the identity here and
-- nothing more. The real body is exercised by the full-chain guards
-- (tests/hunt-sessions-settle.mjs).
create or replace function public.hr_hunt_open_of(p_user uuid, p_slot int)
returns uuid language sql stable security definer set search_path = public, pg_catalog
as $$ select null::uuid $$;
revoke execute on function public.hr_hunt_open_of(uuid, int) from public;
revoke execute on function public.hr_hunt_open_of(uuid, int) from anon, authenticated;
grant  execute on function public.hr_hunt_open_of(uuid, int) to hr_engine;
