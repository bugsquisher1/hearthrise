-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-presence-off.sql — THE KILL SWITCH FOR THE COMMON.
--
-- ⚠ STAGED AND EXCLUDED FROM THE REPLAY CHAIN, ON PURPOSE. Apply ONLY on an
--   incident (a presence leak, a stalking report, snapshot cost, a client that
--   renders peers wrongly). It is listed under `excluded` in
--   tests/schema-apply-order.json rather than at the end of `order`, because a
--   rebuilt database must come back in the SHIPPING state — The Common ON
--   (2026-09-13-town-presence-on.sql) — and a chain that ran this file last would
--   rebuild the feature dark while every record said it was live. `excluded` is a
--   claim that a rebuild is CORRECT without the file, and here that claim is the
--   whole point.
--
-- AFTER APPLYING: re-measure `node tests/restore-census.mjs --live-sql` +
-- --live-compare and move hr_flags.live_value to enabled=false, per lane C. A
-- record that says ON while production is OFF is how a dark feature gets
-- debugged for a day.
--
-- WHAT IT DOES AND DOES NOT DO. hr_town_of answers {ok:true, off:true} carrying
-- no data, and hr_town_refresh no-ops (it blanks the snapshot row once and then
-- writes nothing).
--
-- ⚠ F3 (Security, 2026-09-13), and it changes NOTHING about the safety of this
--   switch, which is why it is a note and not a fix: since
--   2026-09-13-town-refresh-cooldown.sql, a refresh that lands within 3 s of the
--   last REAL build returns {coalesced:true} and skips its work — including the
--   blanking of the snapshot row. So immediately after this file is applied the
--   row may still hold the last real payload until the next cron tick blanks it
--   (25 s, or 60 s on the fallback). That is harmless by construction: the row is
--   readable by NO client role, and hr_town_of answers `off` from THE FLAG, not
--   from the row — it never looks at the payload once the flag is down. The
--   assertion below reads the ANSWER for exactly this reason, so it stays true on
--   the coalesced branch. It does NOT stop hr_heartbeat: last_seen_at keeps being
-- stamped on the caller's own row, which is harmless (nothing reads it while the
-- flag is down) and means turning the flag back on repopulates the plaza on the
-- next 25-second tick with no backfill. presence_quiet is untouched, so a
-- player's opt-out survives the incident and the recovery.
--
-- Reversibility: re-apply 2026-09-13-town-presence-on.sql.
-- SAFE TO RE-RUN: the update is an assignment, not a toggle.
-- ════════════════════════════════════════════════════════════════════════

update public.hr_flags
   set enabled = false, updated_at = now()
 where key = 'town_presence' and enabled is distinct from false;

-- ── SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ──────────────────────────────
do $$
begin
  if (select enabled from public.hr_flags where key = 'town_presence') is not false then
    raise exception 'GATE: the town_presence flag did not switch off';
  end if;
  -- The property that matters is not the row, it is the ANSWER. Read as a real
  -- signed-in caller, because hr_town_of refuses an unauthenticated one and a
  -- refusal would satisfy a weaker assertion for the wrong reason.
  perform set_config('request.jwt.claim.sub', '000000af-0000-0000-0000-0000000000a1', true);
  if coalesce((public.hr_town_of()->>'off')::boolean, false) is not true then
    raise exception 'GATE: hr_town_of still answers % with the flag off — the kill switch did not '
                    'close the read surface', public.hr_town_of();
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'town-presence-off: the flag is OFF and hr_town_of answers {off:true} — The Common is '
               'closed. Re-measure restore-census and move hr_flags.live_value to enabled=false.';
end $$;
