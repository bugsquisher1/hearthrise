-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-refresh-cooldown.sql — THE SNAPSHOT REBUILD COALESCES.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Security diff review (they asked for this
--     file and will diff it), then the Coordinator applies. It changes the BODY of
--     two APPLIED functions and nothing else.
--
-- ── THE FINDING (Security, 2026-09-13, on b32a3f5a) ─────────────────────────
-- hr_set_presence_quiet rebuilds the snapshot on every transition into quiet
-- (the P3 immediacy fix). The rebuild is a bounded indexed scan, but the VERB is
-- client-callable at 4/min, so at scale "everybody toggles" is a ~50× increase in
-- scans over the 2,400/day the cron job costs. One zone-level cooldown caps it.
--
-- ── THE TRADE — AND THE CORRECTION (Security, 2026-09-13) ──────────────────
-- ⚠ AN EARLIER REVISION OF THIS HEADER SAID the opt-out was "gone within 3
--   seconds, bounded, never waiting on cron". THAT WAS WRONG, and wrong in the
--   direction that matters: the cooldown SKIPS the rebuild, it does not DEFER it.
--   Nothing re-runs 3 seconds later. A player who opts out within 3 s of a real
--   build therefore stays visible until the NEXT CRON BUILD — 25 s, or 60 s on
--   the fallback schedule — which is precisely the P3 finding this lane closed.
--   "3-second bound" described a timer that does not exist.
--
--   Security REFUSED that trade, correctly. The fix is NOT to drop the cooldown
--   (the ~50x scan amplification is real) but to make the coalesced branch do the
--   cheap thing instead of nothing: 2026-09-13-town-quiet-prune.sql PRUNES the
--   caller out of the cached payload — an O(60) jsonb rewrite of one row, no
--   player_state scan at all — so the opt-out lands on the very next read on BOTH
--   branches. Read that file with this one; alone, this file leaves the gap above.
--
-- A GUC-based exemption for the quiet path was also rejected, for its own reason:
-- it would exempt precisely the caller whose volume the cooldown exists to bound,
-- leaving a cooldown that coalesces only cron against cron — which never overlaps
-- anyway at 25 s apart.
--
-- So the ANSWER STAYS HONEST: hr_set_presence_quiet's `snapshot_refreshed` now
-- reports whether the rebuild actually happened, instead of always true. A client
-- that wants to say "you are hidden" can read it.
--
-- ── WHY THE FLAG-OFF PLACEHOLDER IS EXEMPT ─────────────────────────────────
-- While the feature is off, hr_town_refresh blanks the row once and then writes
-- nothing, leaving a payload with `off:true`. If the cooldown coalesced on THAT
-- row, 2026-09-13-town-presence-on.sql's own §2 rebuild could be skipped and its
-- §3(b) would fail the apply (or worse, the plaza would serve the placeholder).
-- The predicate therefore requires a REAL payload, so "turn it on and build" is
-- deterministic regardless of when the last tick ran.
--
-- Patches: hr_town_refresh (one anchored exactly-once insert), and
--   hr_set_presence_quiet__ungated (one anchored exactly-once line). Both are
--   pg_get_functiondef edits, so this file restates no body it did not author and
--   cannot erase another file's change.
-- Reversibility: re-apply 2026-09-13-town-presence.sql (it authors both bodies in
--   full, without the cooldown).
-- Test: tests/town-presence.mjs (`cooldown_gone` + `quiet_not_immediate` arms).
-- SAFE TO RE-RUN: both patches no-op when their marker is already present.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. hr_town_refresh — THE ZONE COOLDOWN ──────────────────────────────────
do $$
declare
  v_src text;
  c_anchor constant text :=
    '  if v_zone <> public.hr_town_zone() then' || chr(10) ||
    '    raise exception ''hr_town_refresh: unknown zone % (Week 1 has exactly one)'', v_zone;' ||
    chr(10) || '  end if;';
begin
  v_src := replace(pg_get_functiondef('public.hr_town_refresh(text)'::regprocedure), chr(13), '');
  if position('coalesced' in v_src) > 0 then
    raise notice 'hr_town_refresh already coalesces — patch skipped'; return; end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the hr_town_refresh zone-check anchor did not match exactly once — refusing to '
                    'patch a body this file cannot account for';
  end if;
  execute replace(v_src, c_anchor, c_anchor || chr(10) || chr(10) ||
    '  -- ZONE COOLDOWN (Security 2026-09-13). A rebuild is a bounded indexed scan,' || chr(10) ||
    '  -- but hr_set_presence_quiet triggers one and is client-callable, so at scale' || chr(10) ||
    '  -- "everybody toggles" is a ~50x multiple of the cron job''s 2,400/day. A REAL' || chr(10) ||
    '  -- payload younger than 3 s is already the answer; the flag-off placeholder is' || chr(10) ||
    '  -- exempt so that "turn it on and build" is deterministic (see the file header).' || chr(10) ||
    '  if exists (select 1 from public.town_snapshot' || chr(10) ||
    '              where zone_id = v_zone' || chr(10) ||
    '                and built_at > now() - interval ''3 seconds''' || chr(10) ||
    '                and coalesce(payload->>''off'', '''') <> ''true'') then' || chr(10) ||
    '    return jsonb_build_object(''ok'', true, ''coalesced'', true, ''zone'', v_zone);' || chr(10) ||
    '  end if;');
  raise notice 'hr_town_refresh patched: a real snapshot younger than 3 s coalesces';
end $$;
revoke execute on function public.hr_town_refresh(text) from public;
revoke execute on function public.hr_town_refresh(text)
  from anon, authenticated, service_role, hr_engine;

-- ── 2. hr_set_presence_quiet__ungated — THE ANSWER STAYS HONEST ─────────────
do $$
declare
  v_src text;
  c_anchor constant text := '      perform public.hr_town_refresh();' || chr(10)
                            || '      v_refreshed := true;';
begin
  v_src := replace(pg_get_functiondef(
             'public.hr_set_presence_quiet__ungated(integer,boolean)'::regprocedure), chr(13), '');
  if position('''coalesced''' in v_src) > 0 then
    raise notice 'hr_set_presence_quiet__ungated already reads the coalesce — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the hr_set_presence_quiet__ungated refresh anchor did not match exactly once';
  end if;
  execute replace(v_src, c_anchor,
    '      -- `snapshot_refreshed` must not claim a rebuild the cooldown coalesced'
    || ' (2026-09-13-town-refresh-cooldown.sql).' || chr(10) ||
    '      v_refreshed := coalesce((public.hr_town_refresh() ->> ''coalesced'')::boolean, false)'
    || ' is not true;');
  raise notice 'hr_set_presence_quiet__ungated patched: snapshot_refreshed reports the real outcome';
end $$;
revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean) from public;
revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean)
  from anon, authenticated, service_role;

-- ── 3. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- now() is frozen inside a transaction, so "1 second apart" is simulated the only
-- way it can be: a second call at the SAME instant (a stronger case than 1 s) and
-- an aged `built_at` for the far side. Net-zero via HR812.
do $$
declare
  v_a jsonb; v_b jsonb; v_res jsonb;
  v_built timestamptz;
  v_uid constant uuid := '000000b0-0000-0000-0000-0000000000b1';
  v_flag_was boolean;
begin
  select enabled into v_flag_was from public.hr_flags where key = 'town_presence';
  begin
    update public.hr_flags set enabled = true where key = 'town_presence';
    delete from public.town_snapshot;
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_uid, 'CoolOne')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, 0, 0, 0, 1) on conflict (user_id, slot) do update set version = 1;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_heartbeat(0);

    -- (a) THE FIRST BUILD IS A BUILD; THE SECOND, INSIDE THE WINDOW, COALESCES.
    v_a := public.hr_town_refresh();
    if (v_a ? 'coalesced') then
      raise exception 'GATE(a): the FIRST rebuild coalesced (%) — a cold cache would never fill', v_a;
    end if;
    if coalesce((v_a->>'here')::int, 0) < 1 then
      raise exception 'GATE(a): the first rebuild saw nobody (%) — the arms below would be vacuous',
        v_a;
    end if;
    select built_at into v_built from public.town_snapshot where zone_id = public.hr_town_zone();
    v_b := public.hr_town_refresh();
    if coalesce((v_b->>'coalesced')::boolean, false) is not true then
      raise exception 'GATE(a): a second rebuild inside the 3-second window did NOT coalesce (%) — the '
                      'scan is unbounded against a client-callable caller', v_b;
    end if;
    if (select built_at from public.town_snapshot where zone_id = public.hr_town_zone()) <> v_built then
      raise exception 'GATE(a): the coalesced call WROTE anyway — it is a report, not a cooldown';
    end if;

    -- (b) AFTER THE WINDOW IT REBUILDS. 4 s of age, stamped on the row rather
    --     than waited for (now() does not move inside a transaction).
    update public.town_snapshot set built_at = now() - interval '4 seconds'
     where zone_id = public.hr_town_zone();
    v_b := public.hr_town_refresh();
    if (v_b ? 'coalesced') then
      raise exception 'GATE(b): a rebuild 4 s after the last one coalesced (%) — the cooldown is a '
                      'wall, not a cooldown', v_b;
    end if;
    if (select built_at from public.town_snapshot where zone_id = public.hr_town_zone()) <> now() then
      raise exception 'GATE(b): the rebuild did not re-stamp built_at from the server clock';
    end if;

    -- (c) THE FLAG-OFF PLACEHOLDER IS EXEMPT, so 2026-09-13-town-presence-on.sql's
    --     own build can never be skipped (see the header).
    update public.town_snapshot
       set payload = jsonb_build_object('zone', public.hr_town_zone(), 'off', true,
                                        'peers', '[]'::jsonb, 'crier', '[]'::jsonb, 'here', 0),
           built_at = now()
     where zone_id = public.hr_town_zone();
    v_b := public.hr_town_refresh();
    if (v_b ? 'coalesced') then
      raise exception 'GATE(c): the cooldown coalesced on the FLAG-OFF placeholder (%) — turning the '
                      'feature on could serve an empty plaza', v_b;
    end if;

    -- (d) THE QUIET TOGGLE TELLS THE TRUTH about which happened. The snapshot was
    --     just rebuilt by (c), so this toggle is INSIDE the window: it must report
    --     snapshot_refreshed=false rather than claiming a rebuild it did not get.
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce(v_res->>'changed', '') <> 'true' then
      raise exception 'GATE(d): the quiet toggle stopped working: %', v_res; end if;
    if coalesce((v_res->>'snapshot_refreshed')::boolean, true) is not false then
      raise exception 'GATE(d): the toggle claims snapshot_refreshed inside the cooldown window (%) — '
                      'the answer would promise an opt-out that has not landed', v_res;
    end if;
    -- ...and OUTSIDE the window it does rebuild, and the opt-out lands at once.
    update public.town_snapshot set built_at = now() - interval '4 seconds'
     where zone_id = public.hr_town_zone();
    perform public.hr_set_presence_quiet(0, false);
    update public.town_snapshot set built_at = now() - interval '4 seconds'
     where zone_id = public.hr_town_zone();
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce((v_res->>'snapshot_refreshed')::boolean, false) is not true then
      raise exception 'GATE(d): the toggle did NOT rebuild outside the window (%) — the P3 immediacy '
                      'fix is gone, not bounded', v_res;
    end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if public.hr_town_of()::text like '%CoolOne%' then
      raise exception 'GATE(d): the opt-out did not land on the rebuild it reported';
    end if;

    raise exception using errcode = 'HR812', message = 'town-refresh-cooldown §3 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.profiles where id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;
  if (select enabled from public.hr_flags where key = 'town_presence') is distinct from v_flag_was then
    raise exception 'GATE: §3 changed the town_presence flag';
  end if;

  raise notice 'town-refresh-cooldown: a real snapshot younger than 3 s coalesces and writes nothing, '
               'a cold cache and a 4-second-old one both rebuild, the flag-off placeholder is exempt '
               'so the ON file can never be skipped, and the quiet toggle reports '
               'snapshot_refreshed honestly on both sides of the window — all green';
end $$;
