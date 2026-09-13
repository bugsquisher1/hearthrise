-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-presence-on.sql — THE COMMON OPENS.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Security diff review, then the Coordinator
--     applies it AFTER the b544 client is LIVE AND PLAYED, so the first snapshot
--     is built for a client that can render it.
--
-- ⚠ THE ONE FILE IN THIS LANE THAT IS NOT NET-ZERO, DELIBERATELY. It leaves two
--   things behind: (1) hr_flags.town_presence = true, the point of the file; and
--   (2) ONE town_snapshot row for 'the_common'. (2) is intentional — the cron job
--   refreshes every 25 s, so without it hr_town_of answers an empty plaza with
--   stale_s = null for up to 25 s after the apply. The PROBE CHARACTERS are still
--   discarded (HR812), so the surviving row describes real players only; §3(d)
--   asserts both halves.
--
-- Column is `enabled`, not `on` (the brief's wording): 2026-09-13-town-presence.sql
-- named it that so no reference ever needs quoting. Same row, same meaning.
--
-- Reversibility, one statement, no deploy:
--   update public.hr_flags set enabled = false, updated_at = now()
--    where key = 'town_presence';
-- hr_town_of then answers {off:true}, the cron stops writing, and the next tick
-- blanks the snapshot row (class `regenerated`: no player value).
--
-- SAFE TO RE-RUN: the update is an assignment, not a toggle, and the refresh is an
-- upsert on one key.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PREFLIGHT ────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_flags') is null or to_regclass('public.town_snapshot') is null
     or to_regprocedure('public.hr_town_refresh(text)') is null
     or to_regprocedure('public.hr_town_of(text)') is null then
    raise exception 'the town-presence objects are absent — apply 2026-09-13-town-presence.sql first';
  end if;
  if not exists (select 1 from public.hr_flags where key = 'town_presence') then
    raise exception 'the town_presence flag row does not exist — there is nothing to switch on';
  end if;
  -- No seam on the wrappers = a client surface whose refusals are invisible.
  -- Refuse to open that.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of')
         and position('hr_note_rejection' in p.prosrc) > 0) <> 3 then
    raise exception 'a town-presence wrapper carries no refusal seam — apply '
                    '2026-09-13-town-presence-journal.sql first';
  end if;
end $mig$;

-- ── 1. THE SWITCH ───────────────────────────────────────────────────────────
update public.hr_flags
   set enabled = true, updated_at = now()
 where key = 'town_presence' and enabled is distinct from true;

-- ── 2. THE FIRST SNAPSHOT (see the header: live at the flag, not at the tick)
select public.hr_town_refresh();

-- ── 3. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- The apply is atomic, so a raise here reverts §1 and §2 too. The probes are
-- HR812-discarded; the flag and the snapshot row are not, by design.
do $$
declare
  v_town jsonb;
  v_peer jsonb;
  v_keys text;
  v_n    int;
  v_quiet_live int;
  v_crier_n    int;
  v_uid   constant uuid := '000000ae-0000-0000-0000-0000000000a1';
  v_quiet constant uuid := '000000ae-0000-0000-0000-0000000000a2';
  c_peer  constant text := 'activity_id, activity_kind, activity_label, away, level_band, name, '
                           || 'seen_ago_s';
  c_crier constant text := 'found_ago_s, item_id, name, one_in, source_id, source_kind';
begin
  -- (a) THE FLAG IS ON.
  if (select enabled from public.hr_flags where key = 'town_presence') is not true then
    raise exception 'GATE(a): the town_presence flag did not switch on';
  end if;

  -- (b) ONE REAL SNAPSHOT ROW for the one zone (not the blanked `off` payload).
  if (select count(*) from public.town_snapshot) <> 1 then
    raise exception 'GATE(b): town_snapshot holds % rows, expected exactly 1',
      (select count(*) from public.town_snapshot);
  end if;
  if not exists (select 1 from public.town_snapshot
                  where zone_id = public.hr_town_zone()
                    and coalesce(payload->>'off', '') <> 'true'
                    and payload ? 'peers' and payload ? 'crier' and payload ? 'here') then
    raise exception 'GATE(b): the snapshot row is missing, is for another zone, or is still the '
                    'flag-off placeholder: %', (select payload from public.town_snapshot);
  end if;
  -- NO QUIET CHARACTER IS IN IT — against the REAL player base, not a fixture:
  -- this is the moment the opt-out goes from theory to live.
  --
  -- ⚠ position(), NOT `like '%' || display_name || '%'` (Security, 2026-09-13).
  --   display_name is player-chosen, 2..24 characters, and LIKE would read `%`
  --   and `_` in it as WILDCARDS: a player named `_` matches every payload (a
  --   false positive that blocks the apply) and one named `%` matches anything at
  --   all. position() is a plain substring search with no pattern language in it,
  --   so the predicate means what it reads. No escape clause to get wrong either.
  select count(*) into v_n from public.player_state ps
    join public.profiles pr on pr.id = ps.user_id
   where ps.presence_quiet
     and ps.last_seen_at > now() - interval '15 minutes'
     and position(pr.display_name in
           (select payload::text from public.town_snapshot
             where zone_id = public.hr_town_zone())) > 0;
  if v_n <> 0 then
    raise exception 'GATE(b): % QUIET character(s) appear in the first live snapshot', v_n;
  end if;
  -- WHAT THIS GATE DID NOT PROVE, counted rather than assumed, so the notice can
  -- say so instead of implying coverage it does not have.
  select count(*) into v_quiet_live from public.player_state
   where presence_quiet and last_seen_at > now() - interval '15 minutes';
  select jsonb_array_length(payload->'crier') into v_crier_n from public.town_snapshot
   where zone_id = public.hr_town_zone();

  -- (c) EXECUTED: a probe reads an OPEN plaza through the allowlist; a quiet one
  --     is absent. Discarded — the snapshot and the flag are not.
  begin
    insert into auth.users (id) values (v_uid), (v_quiet) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values
      (v_uid, 'OpenOne'), (v_quiet, 'OpenHush')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, 0, 0, 0, 1), (v_quiet, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set version = 1;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_heartbeat(0);
    perform set_config('request.jwt.claim.sub', v_quiet::text, true);
    perform public.hr_heartbeat(0);
    perform public.hr_set_presence_quiet(0, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    v_town := public.hr_town_of();      -- the client's call: p_zone DEFAULTED
    if coalesce(v_town->>'ok', '') <> 'true' then
      raise exception 'GATE(c): hr_town_of is not open with the flag on: %', v_town; end if;
    if v_town ? 'off' then
      raise exception 'GATE(c): the answer still carries `off`: %', v_town; end if;
    if jsonb_array_length(v_town->'peers') < 1 then
      raise exception 'GATE(c): the probe is not in its own plaza: %', v_town; end if;
    if v_town::text like '%OpenHush%' then
      raise exception 'GATE(c): the QUIET probe is in the live projection: %', v_town; end if;
    for v_peer in select jsonb_array_elements(v_town->'peers') loop
      select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(v_peer) k;
      if v_keys <> c_peer then
        raise exception 'GATE(c): a peer carries keys [%], the allowlist is [%]', v_keys, c_peer;
      end if;
    end loop;
    for v_peer in select jsonb_array_elements(v_town->'crier') loop
      select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(v_peer) k;
      if v_keys <> c_crier then
        raise exception 'GATE(c): a crier line carries keys [%], the allowlist is [%]', v_keys, c_crier;
      end if;
    end loop;
    raise exception using errcode = 'HR812', message = 'town-presence-on §3 complete — rolling back the probes';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  -- (d) PROBES LEFT NOTHING; FLAG AND ROW STAYED. Both halves — "net-zero except
  --     two named things" is a claim until it is measured.
  if exists (select 1 from public.player_state where user_id in (v_uid, v_quiet))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_quiet))
     or exists (select 1 from public.profiles where id in (v_uid, v_quiet))
     or exists (select 1 from public.hr_rejections where user_id in (v_uid, v_quiet))
     or exists (select 1 from auth.users where id in (v_uid, v_quiet)) then
    raise exception 'GATE(d): §3 LEAKED a probe row';
  end if;
  if (select enabled from public.hr_flags where key = 'town_presence') is not true then
    raise exception 'GATE(d): the rollback took the FLAG with it — the feature would apply dark';
  end if;
  select count(*) into v_n from public.town_snapshot;
  if v_n <> 1 then
    raise exception 'GATE(d): town_snapshot holds % rows after the rollback, expected the 1 this file '
                    'deliberately leaves behind', v_n;
  end if;
  if (select payload::text from public.town_snapshot) like '%OpenOne%' then
    raise exception 'GATE(d): the surviving snapshot names a PROBE character — the row that goes live '
                    'must describe real players only';
  end if;

  -- ⚠ WHAT THIS APPLY DID **NOT** ASSERT, stated with the counts behind it
  --   (Security, 2026-09-13). Two of §3(b)'s checks are VACUOUS when the live data
  --   is empty, and a notice that read "no quiet character is in it" without
  --   saying so would be claiming coverage it does not have:
  --     · the REAL-player quiet check walks 0 rows when no live character has
  --       opted out — it is then a tautology, not a measurement. The probe half of
  --       §3(c) is what actually exercises the opt-out, on a character this file
  --       creates and discards.
  --     · the crier allowlist loop runs 0 times when world_finds has no find in
  --       the last 24 h — the 6-key shape is then UNTESTED here. It is tested on
  --       real rows by tests/town-presence.mjs, which seeds world_finds.
  --   Both numbers are printed, so the operator reading the apply log can see
  --   which of the two happened rather than inferring it.
  raise notice 'town-presence-on: the flag is ON, exactly one real town_snapshot row exists for %, '
               'hr_town_of answers an open plaza with only the 7-key peer allowlist, the quiet PROBE '
               'is absent, and the probe characters left no trace — all green.', public.hr_town_zone();
  raise notice 'town-presence-on: NOT ASSERTED on this apply — live quiet characters in the window: % '
               '(0 = the real-player quiet check was vacuous); crier lines in the snapshot: % (0 = the '
               '6-key crier allowlist loop ran zero times and is untested here; '
               'tests/town-presence.mjs seeds world_finds and covers it).', v_quiet_live, v_crier_n;
end $$;
