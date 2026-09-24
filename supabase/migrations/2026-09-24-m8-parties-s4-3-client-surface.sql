-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-24-m8-parties-s4-3-client-surface.sql — M8 SLICE 4, FILE 3 OF 3:
--   RECORD THE TWO NEW CLIENT-CALLABLE VERBS. THE S-14 FILE.
--
-- §18-SEC.1 S-14: *"Every function §18 adds needs its allowlist entry with its
-- claim argued, in the SAME lane-C batch, AFTER the file that grants it … or it
-- gets remembered on the morning the detector is red — and a detector expected
-- to be red hides the next real regression, which is the whole cost."*
--
-- File 2 grants EXECUTE on two functions to `authenticated`:
--
--   hr_party_hunt_start(int,text,text,jsonb,uuid)
--   hr_party_hunt_stop(int,uuid)
--
-- public.hr_client_rpc_baseline is the APPROVED CLIENT RPC SURFACE
-- (2026-08-11-grant-hygiene.sql). Check D2 of hr_assert_grant_hygiene lists
-- every function `anon` or `authenticated` can execute that is NOT in that
-- table and RAISES in strict mode, so between applying file 2 and applying this
-- one the nightly `hr-grant-hygiene` cron is RED on two entries.
--
--   ⚠ THIS FILE MUST NOT TRAIL ITS GRANTS OVERNIGHT.
--
-- ── WHICH ALLOWLIST, AND WHY THE OTHER ONE IS NOT TOUCHED ─────────────────
-- There are two argued lists and they are not interchangeable:
--
--   c_engine_allow   inside hr_assert_grant_hygiene — what `hr_engine` may
--                    EXECUTE. A DERIVED chain maintained by
--                    tools/derive-grant-hygiene.mjs.
--   hr_client_rpc_baseline — what `anon`/`authenticated` may EXECUTE. A table.
--
-- **THIS BATCH GRANTS NOTHING TO `hr_engine` OR `hr_tick`, so c_engine_allow is
--   NOT TOUCHED, NO derive-grant-hygiene LINK IS CUT, AND
--   hr_assert_grant_hygiene IS NOT RESTATED.** §3(c) asserts that absence by
--   execution rather than leaving it to be inferred: an entry recorded for a
--   grant that does not exist is a pre-approval for a grant nobody has
--   reviewed, and the day someone "restored the allowlist" it would BE granted.
--
--   ⚠ AND THAT IS ALSO WHY THIS BATCH IS EXPECTED TO LEAVE
--     tests/live-hash-drift.baseline.json GREEN. The three tracked bodies this
--     batch could have disturbed are hr_assert_grant_hygiene (not restated —
--     no engine grant), hr_apply (not touched — no party verb reaches it,
--     file 2 §6(y) asserts that by reading the installed bodies) and
--     hr_party_hunt_live (READ by the new verbs, never rewritten).
--     `hr_party_kick` and `hr_party_leave` ARE rewritten — RESTATED IN FULL,
--     not patched by anchor: tests/patch-chain-guard.mjs refused three anchors
--     per body (PATCH-3). NEITHER is tracked in the baseline, so a silent
--     revert of either would have been seen by NOTHING in this repo — which is
--     why file 2 §5 hashes the INSTALLED body first and REFUSES THE APPLY if it
--     is not the text the restatement was derived from. The Coordinator reads a
--     pin failure as "a parallel lane touched these verbs", never as a broken
--     file.
--
-- S-14 also names the four functions file 1 adds — hr_party_boundaries_today,
-- hr_party_boundary_room, hr_party_mark and hr_party_settle_current. Their
-- correct "entry" is an asserted ABSENCE from BOTH lists, because they are
-- granted to NOBODY; §3(b) proves it per role and per list, so a later file
-- that quietly grants one is red HERE rather than at 04:50 on a nightly cron.
--
-- ── TARGETED INSERTS, NEVER hr_grant_baseline_sync() ───────────────────────
-- A sync call re-approves the ENTIRE live surface and turns a differential
-- check into a rubber stamp. Two rows, two arguments, each naming what the
-- caller may send and what it can therefore reach.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   delete from public.hr_client_rpc_baseline
--    where proname in ('hr_party_hunt_start','hr_party_hunt_stop');
-- Then files 2 and 1 in reverse. Deleting these rows WITHOUT dropping the
-- grants makes the nightly detector red, which is the correct direction to
-- fail: a recorded surface that is not granted is inert, a granted surface that
-- is not recorded is unreviewed.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — THE TWO GRANTS MUST EXIST BEFORE THEY ARE RECORDED ──
do $$
declare t text;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: hr_client_rpc_baseline is absent — apply 2026-08-11-grant-hygiene.sql first.';
  end if;
  foreach t in array array['public.hr_party_hunt_start(integer,text,text,jsonb,uuid)',
                           'public.hr_party_hunt_stop(integer,uuid)'] loop
    if to_regprocedure(t) is null then
      raise exception 'PRECONDITION: % is absent — apply 2026-09-24-m8-parties-s4-2-hunt-intents.sql FIRST. This is file 3 of 3.', t;
    end if;
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception 'PRECONDITION: `authenticated` does not hold % — there is nothing to record, and recording it anyway pre-approves a grant nobody granted.', t;
    end if;
  end loop;
end $$;

-- ── 2. THE TWO ENTRIES, EACH WITH ITS CLAIM ARGUED ─────────────────────────
-- The claim both rows make: the caller's whole supplied surface is named, and
-- nothing in it can reach another player's economy or ranking. Neither moves
-- gold, gems, Hearth Tokens, items, XP, a rank or a drop table — file 2 §6(y)
-- asserts that by READING the four installed bodies at apply time, so this note
-- is checkable rather than asserted.
--
-- `delete` before `insert` so a re-apply converges rather than skipping a row
-- whose note has since been rewritten.
do $$
begin
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_party_hunt_start','hr_party_hunt_stop')
     and grantee = 'authenticated';

  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values

  ('hr_party_hunt_start', 'p_slot integer, p_active_id text, p_stance text, p_stop jsonb, p_idem uuid',
   'authenticated',
   'added 2026-09-24 (M8 S4, Security B-A1 and B-A6): the LEADER starts the party hunt. Caller '
   'surface: one of their OWN slots (validated 0..5 and against player_state), a monster id, a '
   'stance, a stop object and an idempotency key — and NOT a party id, a member, a window, a '
   'watermark, a share, a weight or a timestamp. The monster is re-validated against '
   'public.hr_activities (kind=combat), the stance against public.hr_hunt_stances and the stop '
   'object against public.hr_hunt_stop_valid — M6''s own catalogues, reused and not forked, so '
   'the party''s vocabulary cannot drift from the solo hunt''s by an operator UPDATE. Per-member '
   'SKILL gates are deliberately not applied: §18.1 says a party buys access to spawns a solo '
   'character of that level cannot survive, which is the whole reason to have one. Under the '
   'party row lock it re-counts 2..4 live members (T-6), re-checks the ten-level combat spread '
   '(S-12), refuses party_member_recovering with until + remaining_ms so the panel renders a '
   'countdown, refuses party_hunt_running on a live hunt (the partial unique index is the '
   'authority for the race) and refuses party_settle_churn past §18.1''s eighth boundary of the '
   'UTC day (B-A1: a start closes four characters'' windows at an instant the leader chooses, so '
   'it IS a boundary). ★ IT WRITES THREE OTHER PLAYERS'' player_state, and that is the first '
   'cross-user write in the architecture (B-A6): active_kind, active_id, active_since and '
   'version, and NEVER accrued_to. Invariant 8''s equality is ESTABLISHED BY ASSERTION — every '
   'live member must already sit at one common accrued_to, so nothing is stamped forward and '
   'nothing is confiscated, and hr_party_tick_settle remains the only writer of either '
   'watermark. A member who is not there refuses the WHOLE start member_uncollectable with ZERO '
   'rows written anywhere. Moves no value: it reaches no hr_apply, no ledger, no inventory and '
   'names no currency.'),

  ('hr_party_hunt_stop', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-09-24 (M8 S4, Security B-A1): the LEADER stops the party hunt — narrower than '
   '§18.3''s cell, which also reads "or any member for themselves (= leave)", because that '
   'parenthesis IS hr_party_leave and a second spelling of one act is two answers to it. Caller '
   'surface: one of their own slots and an idempotency key; no party id, no hunt id, no '
   'timestamp and no target. Takes the party row lock and then the party_hunt row lock — the '
   'SAME row hr_party_tick_settle takes first — so a stop and a settle are serialised and the '
   'window cannot end underneath a fan-out. IT IS NEVER REFUSED for the boundary budget: a '
   'refusal here would hold four players in a hunt, which §18.1 forbids as unconditionally as it '
   'forbids holding one in a party, so past the eighth boundary the hunt still ends and the '
   'answer carries notice=party_settle_churn with the last window riding the tick''s own '
   'cadence. Writes party_hunt (ended_at, stopped_by, version), one boundary journal row when '
   'one was forced, and NOTHING on player_state: active_kind is an input the open window is '
   'priced from, so idling a member here would confiscate the residual this verb cannot collect '
   '(CLAUDE.md §3 rule 3). Moves no value.');
end $$;

-- ── 3. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
do $$
declare
  v_n   bigint;
  v_h   jsonb;
  t     text;
  r     text;
begin
  -- (a) THE TWO ROWS EXIST, AND THEIR identity_args MATCH THE INSTALLED
  --     SIGNATURES. A baseline row whose argument list has drifted from the
  --     function it names approves a signature nobody granted.
  select count(*) into v_n from public.hr_client_rpc_baseline
   where proname in ('hr_party_hunt_start','hr_party_hunt_stop') and grantee = 'authenticated';
  if v_n <> 2 then
    raise exception 'GATE(a): % of the two S4 client verbs are recorded in hr_client_rpc_baseline', v_n; end if;
  foreach t in array array['hr_party_hunt_start','hr_party_hunt_stop'] loop
    if not exists (
      select 1 from public.hr_client_rpc_baseline b
        join pg_proc p on p.proname = b.proname
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where b.proname = t and b.grantee = 'authenticated'
         and b.identity_args = pg_get_function_arguments(p.oid)) then
      raise exception 'GATE(a): the baseline row for % does not carry its INSTALLED argument list (%). A row whose signature has drifted approves a function nobody granted.', t,
        (select pg_get_function_arguments(p.oid) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = t);
    end if;
  end loop;

  -- (b) FILE 1's FOUR HELPERS ARE GRANTED TO NOBODY AND RECORDED IN NEITHER
  --     LIST. S-14's answer for a function that is granted to no one is an
  --     asserted ABSENCE, proved per role and per list.
  foreach t in array array['public.hr_party_boundaries_today(uuid)',
                           'public.hr_party_boundary_room(uuid)',
                           'public.hr_party_mark(uuid)',
                           'public.hr_party_settle_current(uuid)'] loop
    foreach r in array array['anon','authenticated','service_role','hr_engine','hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r)
         and has_function_privilege(r, t, 'execute') then
        raise exception 'GATE(b): % is executable by %. It is an internal predicate of the party verbs: a client-callable form is a membership and budget oracle, and an engine-callable one is a grant this batch never argued.', t, r;
      end if;
    end loop;
  end loop;
  select count(*) into v_n from public.hr_client_rpc_baseline
   where proname in ('hr_party_boundaries_today','hr_party_boundary_room',
                     'hr_party_mark','hr_party_settle_current');
  if v_n <> 0 then
    raise exception 'GATE(b): % internal S4 predicate(s) are recorded in hr_client_rpc_baseline. A recorded entry for a grant that does not exist is a pre-approval for a grant nobody has reviewed.', v_n; end if;

  -- (c) THIS BATCH GRANTED NOTHING TO hr_engine, SO c_engine_allow IS
  --     UNTOUCHED AND hr_assert_grant_hygiene IS NOT RESTATED. Asserted by
  --     reading the INSTALLED detector rather than by reading this file.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene'
                  and p.prosrc ~* 'hr_party_(mark|boundar|settle_current|hunt_start|hunt_stop)') then
      raise exception 'GATE(c): hr_assert_grant_hygiene names an S4 function in its engine allowlist. This batch grants NOTHING to hr_engine, so an entry there pre-approves a grant nobody reviewed — and restating the detector would also turn tests/live-hash-drift.baseline.json red for a change that was never needed.';
    end if;
  end if;

  -- (d) ★ THE DETECTOR IS GREEN. The whole reason these three files apply in
  --     one sitting: between file 2 and this one it RAISES on
  --     unapproved_client_rpcs, and a detector expected to be red hides the
  --     next real regression.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null then
      raise exception 'GATE(d): hr_assert_grant_hygiene(true) returned nothing'; end if;
    if jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(d): hr_assert_grant_hygiene is RED after this batch: %', v_h; end if;
  end if;

  -- (z) AND THE TICK IS STILL IN SHADOW after all three files.
  select count(*) into v_n from public.hr_tick_config where id and shadow;
  if v_n <> 1 then
    raise exception 'GATE(z): hr_tick_config.shadow is not TRUE after the S4 batch. S5 is a separate GO (§18-SEC-2.3) and its pre-arm bar is unmet by definition.'; end if;

  raise notice 'm8-parties-s4-3: the two S4 client verbs are recorded in hr_client_rpc_baseline with their INSTALLED argument lists; file 1''s four predicates are granted to no role and recorded in neither list; nothing was granted to hr_engine so c_engine_allow is untouched and hr_assert_grant_hygiene is neither restated nor red; the tick is still in SHADOW';
end $$;
