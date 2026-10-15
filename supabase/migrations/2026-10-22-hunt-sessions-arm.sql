-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: OPEN THE KILL SWITCH (lane C2, ruling
-- HR-2026-10-14; Security GO-WITH-CHANGES on C1 e482cc54, item 1).
-- STAGED, NOT APPLIED. Apply ONLY AFTER (1) 2026-10-22-hunt-sessions-settle.sql
-- is applied and (2) the hr-accrue edge payload carrying hunt-settle.js is LIVE
-- (GET payload_sha256 == `node tools/pack-edge.mjs hr-accrue --hash`). Apply it
-- immediately after the deploy: until it runs, hr_hunt_enter answers
-- `hunts_paused` and nobody can open a hunt.
--
-- WHY IT IS ITS OWN FILE. C1 shipped the switch OFF (2026-10-21-hunt-sessions
-- .sql seeds hr_hunt_config.enabled = false) because, between C1 and the C2
-- deploy, the old accrue / world-tick path would still have paid a combat
-- pointer that hr_hunt_enter set — an open session paid once by that path and
-- again by C2's first settle. With C2 deployed that cannot happen twice over:
--   · the edge routes a hunter to the hunt settle and the engine answers
--     `hunt_open` to the old path (accrual.js SKIP.HUNT_OPEN), and
--   · the database refuses a bare combat accrue row for a hunter
--     (hr_hunt_accrue_fence, 2026-10-22-hunt-sessions-settle.sql §6).
-- §0 refuses unless that fence and the settle door are installed.
--
-- ONE STATEMENT, idempotent: a re-apply on an open switch changes nothing.
-- KILL: `update public.hr_hunt_config set enabled = false where id;` — every
-- open hunt then ends `server` at its next settle (END_ORDER's last reason,
-- re-proved by hr_hunt_settle_session) and no new one opens.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regprocedure('public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)') is null
     or not exists (select 1 from pg_trigger where tgname = 'hr_hunt_accrue_fence'
                     and tgrelid = 'public.player_ledger'::regclass) then
    raise exception 'PRECONDITION: the hunt settle (2026-10-22-hunt-sessions-settle.sql: hr_hunt_apply + the '
                    'hr_hunt_accrue_fence trigger) is not installed — opening hunts now would let the old path pay one';
  end if;
end $mig$;

update public.hr_hunt_config set enabled = true where id and enabled is distinct from true;

do $$
begin
  if coalesce((select enabled from public.hr_hunt_config where id), false) is not true then
    raise exception 'GATE: hr_hunt_config.enabled is not true after the flip';
  end if;
  raise notice 'hunt-sessions-arm: EXECUTED - hunts are open (hr_hunt_config.enabled = true)';
end $$;
