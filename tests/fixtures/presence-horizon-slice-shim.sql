-- tests/fixtures/presence-horizon-slice-shim.sql — NOT A MIGRATION.
--
-- The 2026-08 SLICE chains (tests/pglite-chain.mjs bootChain + an EXTRA list:
-- activity-intent, claim-intent, gold-intents) run the real hr-accrue modules
-- against a database that predates the world tick. Since the presence horizon
-- (2026-10-10-world-tick-presence-horizon.sql) those modules read the accrue
-- span cap from hr_accrue_cap_ms. On a chain with NO world tick every
-- character's last real return IS its accrued_to (nothing else moves it), so
-- hr_accrue_cap_ms = least(cap, R + cap - accrued_to) = hr_offline_cap_ms
-- exactly — the identity tests/world-tick-presence-horizon.mjs H4 proves on the
-- full chain. This shim states that identity for the slice and nothing more.
-- The real body is exercised by the full-chain guards.
create or replace function public.hr_accrue_cap_ms(p_user uuid, p_slot integer)
 returns bigint
 language sql
 stable security definer
 set search_path to 'public'
as $$ select public.hr_offline_cap_ms(p_user, p_slot) $$;
revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from public;
revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from anon, authenticated;
grant  execute on function public.hr_accrue_cap_ms(uuid, integer) to hr_engine;
