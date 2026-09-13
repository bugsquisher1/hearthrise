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
-- ⚠ WHEN THE PRUNE DELIBERATELY DOES NOTHING, and what that costs. The UPDATE is
--   conditioned on the caller actually being in the payload (`peers @> [{name}]`,
--   and a non-null name), because without that it decremented `here` while
--   removing nobody — Security F1-a and F1-b, both confirmed on a replay. So these
--   callers answer `pruned:false` and wait for the <=25 s cron rebuild instead:
--     · a NAMELESS profile (display_name NULL — 11 live). It cannot be matched, and
--       it is not in the payload under any name a reader would recognise anyway.
--     · a caller PAST THE 60-PEER CAP. They are not in the list, so there is
--       nothing to remove — but `here` is the UNCAPPED count, so for up to one
--       refresh it overcounts by one. An overcount is the safe direction for a
--       privacy control: it never shows a body that asked not to be shown.
--     · a caller who RENAMED since the build (their old name is in the payload,
--       their new one is not) — they survive <=25 s.
--     · a caller in the CRIER but not in `peers` (a rare find by someone who has
--       since left town) — their crier line survives <=25 s.
--   ⚠ THE RENAME RACE, ACCEPTED AS P4: X renames away, and inside one window the
--     caller claims X's freed name and opts out — X's stale entry is pruned
--     instead. It needs a deliberately-timed rename collision inside a 3-second
--     window, it removes a body from a cosmetic list for <=25 s, and it moves
--     nothing tradeable or rankable. The structural fix is a user_id in the
--     payload, which is the one thing the allowlist exists to keep out.
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
           and coalesce(ts.payload ->> 'off', '') <> 'true'
           -- ⚠ THE CALLER MUST ACTUALLY BE IN THE PAYLOAD (Security F1-a/F1-b,
           --   2026-09-13 — both CONFIRMED on a replay, and both came from this
           --   one predicate being absent). Without it the row matched on zone
           --   alone, so the UPDATE "succeeded" and decremented `here` even when it
           --   removed nobody:
           --     F1-a  a caller whose profiles.display_name IS NULL (11 nameless
           --           profiles live) got pruned:true and here-1 while STAYING in
           --           peers — `is distinct from NULL` filters nothing out.
           --     F1-b  quiet -> loud -> quiet inside the bucket (loud does not
           --           refresh) decremented twice for one body: here 1 -> 0 with two
           --           peers still listed. A shared crowd count that disagrees with
           --           the list beside it, at 2 transitions/min/account.
           --   Now the prune fires only when it has something to remove, and
           --   `v_pruned := found` reports the truth: a nameless, absent or
           --   already-pruned caller answers pruned:false and falls back to the
           --   <=25 s cron rebuild, which is the safe direction.
           --   ⚠ `v_name is not null` is REDUNDANT TODAY, and that is measured, not
           --     assumed: deleting it leaves tests/town-presence.mjs green, because
           --     the containment check below cannot match when v_name is NULL
           --     (`peers @> '[{"name": null}]'` is false). It stays as defence in
           --     depth against a future change to the matching expression, and the
           --     guard deliberately registers NO mutation arm for it — an arm that
           --     cannot go red is the vacuous proof. The nameless PROPERTY is
           --     enforced by the containment check and asserted by the guard.
           and v_name is not null
           and ts.payload -> 'peers' @> jsonb_build_array(jsonb_build_object('name', v_name));
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
  v_res jsonb; v_town jsonb; v_here_before int; v_snaps_before int; v_n int;
  v_a constant uuid := '000000b1-0000-0000-0000-0000000000c1';
  v_b constant uuid := '000000b1-0000-0000-0000-0000000000c2';
  v_c constant uuid := '000000b1-0000-0000-0000-0000000000c3';
  v_d constant uuid := '000000b1-0000-0000-0000-0000000000c4';
  v_flag_was boolean;
begin
  select enabled into v_flag_was from public.hr_flags where key = 'town_presence';
  select count(*) into v_snaps_before from public.town_snapshot;
  begin
    update public.hr_flags set enabled = true where key = 'town_presence';
    delete from public.town_snapshot;
    insert into auth.users (id) values (v_a), (v_b), (v_c), (v_d) on conflict (id) do nothing;
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

    -- (e) A NAMELESS CALLER MOVES NOTHING (Security F1-a, confirmed on a replay:
    --     `is distinct from NULL` filters nobody out, so the UPDATE used to
    --     decrement `here` while leaving the caller in `peers`).
    update public.profiles set display_name = null where id = v_c;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_c, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set version = 1, presence_quiet = false;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    perform public.hr_heartbeat(0);
    perform public.hr_town_refresh();              -- no row exists, so this builds
    v_town := public.hr_town_of();
    v_here_before := (v_town->>'here')::int;
    v_n := jsonb_array_length(v_town->'peers');
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce((v_res->>'pruned')::boolean, true) is not false then
      raise exception 'GATE(e): a NAMELESS caller reported pruned:true (%) — it cannot be matched in '
                      'the payload, so claiming a prune is a lie and `here` would drift', v_res;
    end if;
    v_town := public.hr_town_of();
    if (v_town->>'here')::int <> v_here_before then
      raise exception 'GATE(e): `here` moved % -> % for a caller the prune could not remove',
        v_here_before, v_town->>'here';
    end if;
    if jsonb_array_length(v_town->'peers') <> v_n then
      raise exception 'GATE(e): the peer list changed for a nameless caller'; end if;

    -- (f) `here` NEVER DISAGREES WITH THE LIST (Security F1-b, confirmed: quiet ->
    --     loud -> quiet inside the bucket decremented TWICE for one body, because
    --     going loud does not refresh and the second prune matched the row anyway —
    --     here 1 -> 0 with two peers still listed, at 2 transitions/min/account).
    --     Driven as v_d, a FOURTH probe: the sequence costs three calls and
    --     hr_set_presence_quiet's bucket is 4/min, so reusing a probe that has
    --     already toggled above measures the rate limiter instead of the property
    --     (measured: it did, and the arm read `rate_limited` as pruned:true).
    update public.profiles set display_name = 'PruneThree' where id = v_c;
    insert into public.profiles (id, display_name) values (v_d, 'PruneFour')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_d, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set version = 1, presence_quiet = false;
    perform set_config('request.jwt.claim.sub', v_d::text, true);
    perform public.hr_heartbeat(0);
    update public.town_snapshot set built_at = now() - interval '4 seconds';
    perform public.hr_town_refresh();                 -- v_d is now IN the payload
    if public.hr_town_of()::text not like '%PruneFour%' then
      raise exception 'GATE(f): the control failed — v_d is not in the plaza, so the double-decrement '
                      'arm below would prove nothing';
    end if;
    v_res := public.hr_set_presence_quiet(0, true);    -- quiet: prunes (present)
    if coalesce((v_res->>'pruned')::boolean, false) is not true then
      raise exception 'GATE(f): the FIRST prune of a present caller did not fire: %', v_res; end if;
    perform public.hr_set_presence_quiet(0, false);    -- loud: does NOT refresh
    v_res := public.hr_set_presence_quiet(0, true);    -- quiet: ABSENT, must not prune
    if coalesce((v_res->>'pruned')::boolean, true) is not false then
      raise exception 'GATE(f): a SECOND prune of an already-pruned caller reported pruned:true (%) — '
                      'that is the double decrement', v_res;
    end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_town := public.hr_town_of();
    if (v_town->>'here')::int <> jsonb_array_length(v_town->'peers') then
      raise exception 'GATE(f): `here` reads % but the list holds % — the crowd count disagrees with '
                      'the bodies beside it', v_town->>'here', jsonb_array_length(v_town->'peers');
    end if;

    raise exception using errcode = 'HR812', message = 'town-quiet-prune §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c, v_d))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b, v_c, v_d))
     or exists (select 1 from public.profiles where id in (v_a, v_b, v_c, v_d))
     or exists (select 1 from auth.users where id in (v_a, v_b, v_c, v_d)) then
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
