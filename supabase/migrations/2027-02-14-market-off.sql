-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-14-market-off.sql — KILL SWITCH: THE WEIGHHOUSE STOPS TRADING.
--
-- STATUS: STAGED, apply ONLY to reverse 2027-02-14-market-on.sql. tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00-00:10 UTC. It is in
-- tests/schema-apply-order.json `excluded`. List, buy, browse and the item page answer
-- market_closed; cancel, the sweep and My listings keep working, so nobody's goods are held.
-- AFTER APPLYING (Coordinator): restore-census --live-sql; flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════
update public.hr_market_config set enabled = false where only_row and enabled;

do $$
begin
  if (select enabled from public.hr_market_config) is distinct from false then
    raise exception 'VERIFY: the switch did not turn off'; end if;
  if (public.hr_market_rules()->>'enabled') is distinct from 'false' then
    raise exception 'VERIFY: the rules the window reads do not say off'; end if;
  if not exists (select 1 from cron.job where jobname = 'hr-market-expire' and active) then
    raise exception 'VERIFY: unsold goods would not come back: the hr-market-expire sweep is not scheduled'; end if;
  raise notice 'market-off: list and buy answer market_closed; cancel and the sweep keep working; all green';
end $$;
