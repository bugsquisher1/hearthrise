-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-quiet-prune.sql — A COALESCED OPT-OUT PRUNES, IT DOES NOT WAIT.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Security diffs it; the Coordinator applies it
--     BEFORE 2026-09-13-town-presence-on.sql. It changes the body of ONE applied
--     function and nothing else.
--
-- ── THE FINDING (Security F1, 2026-09-13, BLOCKING) ─────────────────────────
-- 2026-09-13-town-refresh-cooldown.sql caps the scan cost, but its coalesce
-- SKIPS the rebuild — it does not DEFER it. Nothing re-runs three seconds later.
-- So a player who opted out within 3 s of a real build stayed in the cached
-- payload until the NEXT CRON BUILD (25 s, or 60 s on the fallback), which is the
-- exact P3 finding this lane was opened to close. My own header called that "a
-- 3-second bound, never waiting on cron"; it was describing a timer that does not
-- exist, and Security refused it. Correctly.
--
-- ── THE FIX: DO THE CHEAP THING, NOT NOTHING ────────────────────────────────
-- On the coalesced branch the opt-out does not need a rebuild — it needs ONE
-- PLAYER REMOVED from a payload that is already correct about everybody else. So
-- the quiet path now PRUNES the caller out of the cached row: `peers` and `crier`
-- filtered on the caller's own name, `here` decremented, one UPDATE of one row.
-- Cost: an O(60) jsonb rewrite (the peer cap) with NO player_state scan at all —
-- cheaper than the rebuild the cooldown exists to avoid, so the amplification
-- Security measured stays capped AND the opt-out lands on the very next read on
-- BOTH branches. That is the property P3 asked for, now unconditional.
--
-- ⚠ WHY MATCHING ON THE NAME IS SAFE HERE, and it is the one thing to check in
--   review. The snapshot deliberately stores no user_id (that is the allowlist),
--   so the name is the only handle. It is not a client value: `peers[].name` is
--   written by hr_town_refresh from profiles.display_name, which
--   2026-08-11-chat-name-authority.sql made non-PATCHable by any client role and
--   claim_display_name() keeps UNIQUE via public.display_names. The caller's name
--   is read HERE from profiles by auth.uid(), never taken from a parameter. So the
--   worst case if that uniqueness were ever lost is that one player's opt-out also
--   hides a namesake from the plaza for <=25 s — a privacy failure in the SAFE
--   direction, which is why this is acceptable where "trust a name" normally is
--   not. Nothing about gold, inventory or ranking is keyed on it.
--
-- ⚠ THE ANSWER STAYS HONEST, which is the other half of the fix:
--     snapshot_refreshed  the cooldown let a real rebuild through
--     pruned              the coalesced branch removed the caller from the cache
--   Exactly one of them is true on a successful transition into quiet (and both
--   are false in the one case neither can happen: no snapshot row yet, or the row
--   is still the flag-off placeholder — nothing is serving the player either way).
--   §4 asserts both branches and that case.
--
-- Patches: hr_set_presence_quiet__ungated ONLY — three anchored, exactly-once
--   pg_get_functiondef edits (one declaration, the refresh block, the return).
--   hr_town_refresh is NOT touched: the cooldown is correct, it was the header's
--   claim about it that was not.
-- Reversibility: re-apply 2026-09-13-town-refresh-cooldown.sql (it authors this
--   body's refresh line without the prune), then 2026-09-13-town-presence.sql if
--   the cooldown itself is to go too.
-- Test: tests/town-presence.mjs — a new arm that opts out UNAGED, inside the
--   cooldown window, and requires the player gone from the very next hr_town_of.
--   That case was previously unmeasured: the guard aged built_at by 4 s first, so
--   it only ever exercised the rebuild branch.
-- SAFE TO RE-RUN: each patch no-ops when its marker is already present.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PREFLIGHT ────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_set_presence_quiet__ungated(integer,boolean)') is null
     or to_regclass('public.town_snapshot') is null
     or to_regprocedure('public.hr_town_zone()') is null then
    raise exception 'the town-presence objects are absent — apply 2026-09-13-town-presence.sql first';
  end if;
  if position('coalesced' in pg_get_functiondef(
       'public.hr_town_refresh(text)'::regprocedure)) = 0 then
    raise exception 'hr_town_refresh does not coalesce — apply 2026-09-13-town-refresh-cooldown.sql '
                    'first; without it there is no coalesced branch to prune on';
  end if;
end $mig$;

-- ── 0c. THE BODY ABOUT TO BE REPLACED MUST BE THE ONE THIS FILE DERIVED FROM ─
-- Structural markers, one per predecessor, rather than an md5: a comment edit must
-- not block an incident fix, but a body that lost a predecessor's change must.
do $mig$
declare v_src text;
begin
  v_src := pg_get_functiondef(
             'public.hr_set_presence_quiet__ungated(integer,boolean)'::regprocedure);
  if position('v_pruned' in v_src) > 0 then
    raise notice 'hr_set_presence_quiet__ungated already prunes — this file is being re-applied';
  end if;
  -- 2026-09-13-town-presence.sql: the opt-out column write, the once-per-CHANGE
  -- journal row and the row lock.
  if position('presence_quiet = v_want' in v_src) = 0
     or position('''presence''' in v_src) = 0
     or position('for update' in v_src) = 0 then
    raise exception 'the installed hr_set_presence_quiet__ungated is missing the column write, the '
                    'kind=''presence'' journal row or the row lock — it is NOT the body this '
                    'restatement was derived from. Re-apply 2026-09-13-town-presence.sql first.';
  end if;
  -- 2026-09-13-town-refresh-cooldown.sql: the honest snapshot_refreshed.
  if position('''coalesced''' in v_src) = 0 then
    raise exception 'the installed body does not read hr_town_refresh''s coalesce result — apply '
                    '2026-09-13-town-refresh-cooldown.sql first, or this restatement would REVERT it '
                    '(the b484-b487 class)';
  end if;
end $mig$;

-- ── 1. hr_set_presence_quiet__ungated — RESTATED IN FULL ────────────────────
-- ⚠ A RESTATEMENT, NOT AN ANCHORED PATCH, and that is the audit's rule rather
--   than a preference: `node tests/patch-chain-guard.mjs` measured this body's
--   anchored chain at depth 3 with the three edits an earlier draft of this file
--   used (PATCH-3), and the rule for a chain at or past 2 is RESTATE. It is also
--   the right call on the merits here — the body is 45 lines, authored in this
--   same lane today, and Security has to diff it: one readable function beats
--   three regexes against text the last patch happened to leave behind.
--
-- ⚠ THE RESTATEMENT IS DERIVED FROM THE LIVE BODY, not from the repo's idea of
--   it. That distinction is the b484-b487 class: a restatement authored against a
--   stale body silently reverts whichever file patched last. The text below is
--   2026-09-13-town-presence.sql's body PLUS 2026-09-13-town-refresh-cooldown.sql's
--   one-line edit — read out of pg_get_functiondef on the replayed chain — plus the
--   prune. §0c REFUSES to install if the body it is about to replace is not that
--   one, by checking the markers each predecessor left; and §2 then proves the
--   behaviour of all of it by execution.
create or replace function public.hr_set_presence_quiet__ungated(p_slot int, p_quiet boolean)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := auth.uid();
  v_slot int  := coalesce(p_slot, 0);
  v_want boolean := coalesce(p_quiet, false);
  v_was  boolean;
  v_refreshed boolean := false;
  v_pruned    boolean := false;
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if v_slot < 0 or v_slot > 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- FOR UPDATE: two tabs toggling at once must not both journal a transition.
  select presence_quiet into v_was
    from public.player_state where user_id = v_uid and slot = v_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  if coalesce(v_was, false) = v_want then
    -- Idempotent by construction: the intent names an absolute value, so a
    -- replay is a no-op with the same answer. No key needed, nothing journalled.
    return jsonb_build_object('ok', true, 'quiet', v_want, 'changed', false);
  end if;

  -- ⚠ NO VERSION BUMP, for hr_heartbeat's reason: the flag is projected into the
  --   envelope, and a bump would collide with an in-flight apply. The client
  --   re-reads `place.quiet` on its next envelope.
  update public.player_state set presence_quiet = v_want
   where user_id = v_uid and slot = v_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
  values (v_uid, v_slot, 'presence', 'presence_quiet:' || v_want::text,
          jsonb_build_object('op', 'quiet', 'from', coalesce(v_was, false), 'to', v_want));

  -- ⚠ THE OPT-OUT TAKES EFFECT ON THE VERY NEXT READ, ON BOTH BRANCHES.
  --   hr_town_of re-applies the 15-minute window at read time but CANNOT re-check
  --   quiet: the snapshot deliberately stores no user_id, so the reader has
  --   nothing to re-check against. The WRITER is therefore the only place this can
  --   be fixed, and it has two ways to do it:
  --
  --     REBUILD  (outside the cooldown) hr_town_refresh rebuilds the whole row.
  --     PRUNE    (inside it) the rebuild is COALESCED — it is SKIPPED, not
  --              deferred, and nothing re-runs 3 s later — so waiting would leave
  --              the player in the cache until the next CRON build (≤25 s, ≤60 s
  --              on the fallback), which is the P3 finding reopened (Security F1,
  --              2026-09-13). Instead the caller is REMOVED from the cached
  --              payload: an O(60) jsonb rewrite of one row, with NO player_state
  --              scan — cheaper than the rebuild the cooldown exists to avoid.
  --
  --   ONLY ON THE TRANSITION INTO QUIET. The other direction is a player asking to
  --   be SEEN, where one tick of delay costs nothing.
  --
  --   THE NAME IS THE HANDLE, and it is server-authored both ways: read here from
  --   profiles by auth.uid(), and written into the payload by hr_town_refresh from
  --   profiles.display_name — non-PATCHable by any client role
  --   (2026-08-11-chat-name-authority.sql) and kept unique by claim_display_name.
  --   If that uniqueness were ever lost the worst case is a namesake also hidden
  --   for ≤25 s: a privacy failure in the SAFE direction.
  if v_want then
    begin
      v_refreshed := coalesce((public.hr_town_refresh() ->> 'coalesced')::boolean, false) is not true;
      if not v_refreshed then
        select pr.display_name into v_name from public.profiles pr where pr.id = v_uid;
        update public.town_snapshot ts
           set payload = jsonb_set(jsonb_set(jsonb_set(ts.payload,
                 '{peers}', (select coalesce(jsonb_agg(e.p), '[]'::jsonb)
                               from jsonb_array_elements(ts.payload -> 'peers') as e(p)
                              where e.p ->> 'name' is distinct from v_name)),
                 '{crier}', (select coalesce(jsonb_agg(c.p), '[]'::jsonb)
                               from jsonb_array_elements(ts.payload -> 'crier') as c(p)
                              where c.p ->> 'name' is distinct from v_name)),
                 '{here}', to_jsonb(greatest(0, coalesce((ts.payload ->> 'here')::int, 1) - 1)))
         where ts.zone_id = public.hr_town_zone()
           and coalesce(ts.payload ->> 'off', '') <> 'true';
        v_pruned := found;
      end if;
    exception when others then
      -- FAIL SOFT, DELIBERATELY. The COLUMN is the authority and it is already
      -- written; the cache is derived. Letting a cache failure abort the
      -- transaction would roll the opt-out back AND tell the player the toggle
      -- failed, leaving them visible. This way the next cron tick finishes the
      -- job and the answer says which of the three happened.
      v_refreshed := false;
      v_pruned    := false;
    end;
  end if;

  -- EXACTLY ONE of these is true on a successful transition into quiet; both are
  -- false only when neither can fire (no snapshot row yet, or the flag-off
  -- placeholder — nothing is serving the player either way).
  return jsonb_build_object('ok', true, 'quiet', v_want, 'changed', true,
                            'snapshot_refreshed', v_refreshed, 'pruned', v_pruned);
end $$;
revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean) from public;
revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean)
  from anon, authenticated, service_role;

-- ── 2. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- BOTH BRANCHES, and the third case where neither can fire. Net-zero via HR812,
-- and the symmetry check includes the town_snapshot count — which belongs here
-- rather than in the cooldown file, because that one is already applied.
do $$
declare
  v_res jsonb; v_town jsonb; v_here_before int; v_snaps_before int;
  v_a constant uuid := '000000b1-0000-0000-0000-0000000000c1';
  v_b constant uuid := '000000b1-0000-0000-0000-0000000000c2';
  v_flag_was boolean;
begin
  select enabled into v_flag_was from public.hr_flags where key = 'town_presence';
  select count(*) into v_snaps_before from public.town_snapshot;
  begin
    update public.hr_flags set enabled = true where key = 'town_presence';
    delete from public.town_snapshot;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'PruneOne'), (v_b, 'PruneTwo')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_a, 0, 0, 0, 1), (v_b, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set version = 1, presence_quiet = false;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    perform public.hr_heartbeat(0);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_heartbeat(0);
    perform public.hr_town_refresh();

    -- (a) THE CONTROL: both are in the plaza, or the prune below proves nothing.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_town := public.hr_town_of();
    if v_town::text not like '%PruneOne%' or v_town::text not like '%PruneTwo%' then
      raise exception 'GATE(a): the control failed — both probes must be in the plaza first: %', v_town;
    end if;
    v_here_before := (v_town->>'here')::int;

    -- (b) THE COALESCED BRANCH. The snapshot was built in THIS transaction, so
    --     now() - built_at = 0 and the cooldown will certainly coalesce. The
    --     opt-out must still be gone from the VERY NEXT read.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce(v_res->>'changed', '') <> 'true' then
      raise exception 'GATE(b): the toggle stopped working: %', v_res; end if;
    if coalesce((v_res->>'snapshot_refreshed')::boolean, true) is not false then
      raise exception 'GATE(b): the rebuild was NOT coalesced (%) — this arm is not testing the '
                      'coalesced branch at all', v_res;
    end if;
    if coalesce((v_res->>'pruned')::boolean, false) is not true then
      raise exception 'GATE(b): the coalesced branch did not prune (%) — the opt-out would wait for '
                      'the next CRON build, which is the P3 finding reopened', v_res;
    end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_town := public.hr_town_of();
    if v_town::text like '%PruneOne%' then
      raise exception 'GATE(b): the opted-out player is STILL in the very next read: %', v_town;
    end if;
    if v_town::text not like '%PruneTwo%' then
      raise exception 'GATE(b): the prune removed the WRONG player (or everybody): %', v_town;
    end if;
    if (v_town->>'here')::int <> v_here_before - 1 then
      raise exception 'GATE(b): `here` reads % after the prune, expected % — the crowd count now '
                      'disagrees with the list beside it', v_town->>'here', v_here_before - 1;
    end if;
    if jsonb_array_length(v_town->'peers') <> 1 then
      raise exception 'GATE(b): the plaza holds % peers after one prune, expected 1',
        jsonb_array_length(v_town->'peers');
    end if;

    -- (c) THE REBUILD BRANCH still reports the other way round, so the two flags
    --     are exclusive rather than both-true-forever.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_set_presence_quiet(0, false);
    update public.town_snapshot set built_at = now() - interval '4 seconds';
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce((v_res->>'snapshot_refreshed')::boolean, false) is not true
       or coalesce((v_res->>'pruned')::boolean, true) is not false then
      raise exception 'GATE(c): outside the window the toggle should REBUILD and not prune, got %',
        v_res;
    end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_town_of()::text like '%PruneTwo%' then
      raise exception 'GATE(c): the rebuild branch did not drop the opted-out player';
    end if;

    -- (d) NO SNAPSHOT ROW AT ALL: neither flag may claim anything, and nothing
    --     raises. A fresh database between the flag flip and the first tick.
    -- ...driven as v_a, not v_b: hr_set_presence_quiet's bucket is 4/min and v_b has
    -- already spent two calls above. A gate that trips the rate limiter measures the
    -- limiter, not the property.
    delete from public.town_snapshot;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    perform public.hr_set_presence_quiet(0, false);
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce((v_res->>'pruned')::boolean, false) is not false then
      raise exception 'GATE(d): `pruned` is true with no snapshot row to prune: %', v_res; end if;
    if coalesce(v_res->>'ok', '') <> 'true' then
      raise exception 'GATE(d): the toggle failed with no snapshot row: %', v_res; end if;

    raise exception using errcode = 'HR812', message = 'town-quiet-prune §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b))
     or exists (select 1 from public.profiles where id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;
  if (select enabled from public.hr_flags where key = 'town_presence') is distinct from v_flag_was then
    raise exception 'GATE: §2 changed the town_presence flag';
  end if;
  if (select count(*) from public.town_snapshot) <> v_snaps_before then
    raise exception 'GATE: §2 changed the town_snapshot row count (% -> %) — the probe deleted and '
                    'rebuilt that row, so the rollback is the only thing keeping it', v_snaps_before,
                    (select count(*) from public.town_snapshot);
  end if;

  raise notice 'town-quiet-prune: a COALESCED opt-out prunes the caller out of the cached payload and '
               'is gone from the very next read with `here` decremented and the other player intact; '
               'outside the window it still REBUILDS instead; the two flags are exclusive; with no '
               'snapshot row neither is claimed and nothing raises; and the probe left the flag, the '
               'snapshot count and every player table as it found them — all green';
end $$;
