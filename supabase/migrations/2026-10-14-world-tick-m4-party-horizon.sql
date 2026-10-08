-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-14-world-tick-m4-party-horizon.sql — M4 PRE-ARM FENCES: THE PARTY
--   PATH GETS THE PRESENCE HORIZON AND THE COHORT; THE CAP READ LOSES ITS
--   PARTIED SHORT-CIRCUIT; A COMBAT-ARMED CONFIG CANNOT PUSH A STACK.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C: Security GO, then the
-- Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). DB-ONLY: no edge half, no client half.
-- CHAIN POSITION: LAST, after 2026-10-13-party-settle-frac-keys.sql (whose
-- body §0 measures) and 2026-10-10-world-tick-presence-horizon.sql (whose
-- hr_return_anchor / hr_accrue_cap_ms this file builds on). The combat ARM
-- file (2026-10-14-world-tick-arm-combat.sql, excluded from the chain)
-- refuses at ARM-P4 until this file's bodies are installed.
--
-- WHAT IT ANSWERS (the open combat items, SEC_GATHER_ARM_RUNBOOK_2026-10-06):
--   (1) "the party path is not horizon-fenced (combat is unarmed; M4's arm must
--       add (8d) to hr_party_tick_settle)" — presence-horizon LIMITATIONS.
--   (2) "hr_accrue_cap_ms has a partied short-circuit to drop" — a partied
--       character's cap read answered the RAW cap, outside the one budget the
--       horizon ruling gives every absence.
--   (3) THE COHORT, found while staging this: hr_party_hunt_start is gated only
--       on "combat armed", and hr_party_roster leases every live hunt. So the
--       instant combat arms for QA slot 1, ANY two signed-in players could start
--       a hunt (the RPC is granted to authenticated; only the UI is missing) and
--       be paid by the tick — the cohort would escape the M4 stage limit. The
--       solo path is cohort-bound by hr_tick_ownership; the party path was not.
--   (4) Security ruling 3 (SEC_WORLD_TICK_ARM_2026-10-05 §3.1): "frame_keys
--       contains no inventory/bank/consumable key while combat is armed,
--       enforced by a CHECK or self-check, not by convention".
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 party_hunt_roster_log CHECKs, additive restatement: reason gains
--    'past_horizon', 'no_return_anchor' (drop) and 'not_in_cohort' (stop).
-- §2 hr_party_tick_settle RESTATED in full (the patch-chain rule: frac-keys
--    already patched it by anchor) = the frac-keys body (md5 1d7153c1) plus
--    FIVE insertions, nothing else (tests/world-tick-m4-party-horizon.mjs
--    P-BASE: the base is an ordered line subsequence, the added lines in 6
--    runs — (3c)'s insertion is two, before the case and inside it):
--    (3a) THE COHORT — armed only, before the drop: a live hunter with no
--         owned hr_tick_ownership(user, slot, 'combat') row ENDS the hunt
--         (stopped_by 'not_in_cohort', one 'stop' journal row per hunter,
--         party + hunt versions). Pays nothing, writes no player_state. Every
--         member's own solo path then prices their time from their own mark,
--         on their own cap — exactly a leader's Stop.
--    (3c) THE DROP learns two reasons, judged on the same locked row and the
--         server clock as fenced_24h / fenced_cap (Security (c)(1)):
--           no anchor (hr_return_anchor)            → 'no_return_anchor'
--           now() > real_return_at + own cap        → 'past_horizon'
--         Same journal, same hand-off, same "< 2 hunters ends the hunt".
--    (8d) THE HORIZON BACKSTOP, per member after (8c): a window ending past
--         that member's real_return_at + own cap is refused whole,
--         'past_horizon' (or 'no_return_anchor'), before hr_apply. It covers
--         the <= 60 s a window may end past now() (step 2's skew), as 8b/8c do.
--    (10) THE REJOIN learns two conditions: still combat-owned, and the
--         rejoiner's horizon admits the NEXT window (p_window_to + flush <=
--         R + cap). So a drop/rejoin cannot step a member past their horizon,
--         and a horizon drop rejoins only after a REAL return moved R.
-- §3 hr_party_hunt_start = the installed start-gate body (md5 7b3a81ab) plus
--    ONE block after the party lock: every live member must hold an owned
--    combat hr_tick_ownership row, else `hunt_not_in_cohort` (journalled via
--    hr_record_rejection, nothing written, the key unclaimed).
-- §4 hr_accrue_cap_ms restated (presence-horizon body 21625137) with the
--    partied short-circuit REMOVED: a partied character reads the same
--    least(cap, R + cap - accrued_to) as anyone. What stays special about a
--    partied character is the WRITE: it is never forfeited (invariant 8: its
--    mark is the hunt's); below the floor it reads greatest(left, 1) — never
--    0, which is the engine's no_cap lockout.
-- §5 hr_tick_config_combat_frame_ck: while 'combat' is armed, frame_keys
--    holds none of inventory / bank / equipment (the stacks the combat tick can
--    lower: food, ammo). An operator UPDATE that would push one is a
--    check_violation, not a convention.
-- §6 grants restated exactly (revoke first). §7 self-check, executed.
--
-- ── ERROR TAXONOMY (new answers; all ok:false, paid:false) ─────────────────
--   hr_party_tick_settle:
--     party_hunt_ended {why:'not_in_cohort', not_owned:[{user,slot}]}   (3a)
--     member_sat_out / party_hunt_ended with dropped[].reason in
--       {past_horizon, no_return_anchor}                                 (3c)
--     past_horizon / no_return_anchor {member, anchor, horizon, cap_ms}  (8d)
--   hr_party_hunt_start: hunt_not_in_cohort (code only to the client).
--   The edge already counts every settle refusal by its `error` name.
--
-- ── WHY A PARTY DROPS, AND SOLO PARKS ───────────────────────────────────────
-- Solo (8d) refuses and PARKS: the character keeps its ownership and waits.
-- A party cannot park one member without freezing the others (G2's shape), and
-- Security's (c) ruling already decided the party form of a per-member fence:
-- drop only that member. Their own time is then the accrue path's, read through
-- hr_accrue_cap_ms on the SAME anchor and cap — one budget per absence, two
-- payers that can never both pay it (the party paid [R, mark], the return pays
-- least(cap, R + cap - mark)).
-- ⚠ PRESENCE INSIDE A HUNT (named, Game Designer): a partied member's own
--   accrue is refused party_settle_required, so their R does not move while
--   partied. Hunters therefore cross their horizon one cap after their last
--   solo settle (≈ hunt start) even while online. An online member who is
--   dropped is unpartied at once, their next client poll settles (R moves) and
--   they rejoin at the next paid fire; if every hunter crosses together the
--   hunt ends (too_few_hunters) and they restart it. Safe direction (pays
--   less); a presence signal for partied members is a design call, not this
--   file's.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   No new lock. (3a) runs under the hunt + lease locks the settle already
--   holds and takes the party row SKIP LOCKED (party_busy, nothing written),
--   exactly as the drop does. (3c)/(8d) read hr_return_anchor after the member
--   row is locked FOR UPDATE; the anchor moves only in a transaction holding
--   that row (the stamp trigger), so the horizon cannot move under the
--   judgement. The rejoin's anchor read is under its SKIP LOCKED row lock.
--   hr_party_hunt_start's block is after its party lock, before the key claim.
--   hr_accrue_cap_ms writes nothing for a partied character, so the read can
--   no longer race a hunt start into a mark move. Re-applying this file is a
--   no-op: §2/§4 restate identical bodies, §3 skips when the installed md5 is
--   already this file's.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   Strictly narrower. No new function, table, column, policy or grant. Every
--   new branch refuses, ends or drops; none pays. Nothing the caller sends is
--   read by any new branch: anchors, caps, ownership and the clock are server
--   rows/functions. A player can only refresh their own anchor by settling
--   (being present), and only stop their own hunt by being outside the cohort
--   (which is operator-written; no client can write hr_tick_ownership).
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   Per armed party probe: one EXISTS over <= 4 members with one ownership pk
--   probe each, + <= 4 anchor pk reads (3c). Per armed paid window: <= 4
--   anchor pk reads (8d). Per rejoin candidate: one anchor + one ownership pk
--   read. Journal rows: one per hunter on a cohort stop (operator-caused) and
--   one per horizon drop (<= one per member per cap) — never per tick.
--   hr_accrue_cap_ms: unchanged reads, and one fewer write path.
--
-- REVERSIBILITY: re-execute 2026-10-13-party-settle-frac-keys.sql §1 on the
-- party-drop body (or re-apply this file's base: the k0 derivation proves the
-- five insertions are the only change), 2026-10-09-party-hunt-start-gate.sql
-- §1, 2026-10-10-world-tick-presence-horizon.sql §4; drop
-- hr_tick_config_combat_frame_ck; restate the two roster_log CHECKs without
-- the three new reasons ONLY once no row carries them. Not while combat is
-- armed with a member dropped past_horizon (the reverted rejoin would put them
-- back without their horizon).
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_party_tick_settle,
--   hr_party_hunt_start and hr_accrue_cap_ms (re-seed with --live --write; why:
--   "M4 party horizon + cohort; partied cap short-circuit removed").
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_return_anchor') is null
     or to_regprocedure('public.hr_accrue_cap_ms(uuid,integer)') is null
     or to_regclass('public.party_hunt_roster_log') is null
     or to_regprocedure('public.hr_party_sat_out(uuid,uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_return_anchor / hr_accrue_cap_ms / party_hunt_roster_log / hr_party_sat_out absent — apply 2026-10-10-world-tick-presence-horizon.sql and the party-drop chain first';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure;
  if v_md5 not in ('1d7153c183b87144003003861f24dbd1', 'c9a30a9e70be9e98ab4b823a3b1f2084') then
    raise exception 'PRECONDITION: hr_party_tick_settle prosrc md5 is %, expected the frac-keys 1d7153c1 or this file''s c9a30a9e70be9e98ab4b823a3b1f2084. Re-cut this file against the installed body.', v_md5;
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)'::regprocedure;
  if v_md5 not in ('7b3a81ab264a7c440afa18064141904b', 'a80439260c833f6aa6b4d771d896075a') then
    raise exception 'PRECONDITION: hr_party_hunt_start prosrc md5 is %, expected the live 7b3a81ab or this file''s a80439260c833f6aa6b4d771d896075a. Re-cut this file against the installed body.', v_md5;
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_accrue_cap_ms(uuid,integer)'::regprocedure;
  if v_md5 not in ('21625137f8c739e86bef35fccda84059', '626637b7892eb85eccf34862ba82013a') then
    raise exception 'PRECONDITION: hr_accrue_cap_ms prosrc md5 is %, expected the presence-horizon 21625137 or this file''s 626637b7892eb85eccf34862ba82013a. Re-cut this file against the installed body.', v_md5;
  end if;
end $mig$;

-- ── §1 THE JOURNAL LEARNS THREE REASONS (additive CHECK restatement) ────────
alter table public.party_hunt_roster_log drop constraint if exists party_hunt_roster_log_reason_check;
alter table public.party_hunt_roster_log add constraint party_hunt_roster_log_reason_check
  check (reason in ('fenced_24h', 'fenced_cap', 'returned', 'stale_hunt',
                    'past_horizon', 'no_return_anchor', 'not_in_cohort'));
alter table public.party_hunt_roster_log drop constraint if exists party_hunt_roster_log_shape;
alter table public.party_hunt_roster_log add constraint party_hunt_roster_log_shape check (
    (event = 'drop'   and reason in ('fenced_24h', 'fenced_cap', 'past_horizon', 'no_return_anchor') and member_mark is null)
 or (event = 'rejoin' and reason = 'returned' and mark is not null and member_mark is not null)
 or (event = 'stop'   and reason in ('stale_hunt', 'not_in_cohort') and mark is not null and member_mark is null and hunters = 0));

-- ── §2 hr_party_tick_settle — RESTATED (patch-chain rule: the frac-keys file
--    already patched this body by anchor, so a second anchored patch would
--    make it a body that exists in no file). This is the frac-keys body
--    (1d7153c1) plus FIVE INSERTIONS and nothing else — the guard's P-BASE arm
--    proves the frac-keys body is an ordered line subsequence of this one, with
--    the added lines in exactly six runs ([3] is two: before the case, inside it):
--      [1] declarations v_anchor, v_noown            [2] (3a) THE M4 COHORT
--      [3] (3c) past_horizon / no_return_anchor     [4] (8d) the backstop
--      [5] (10) the rejoin: (h) owned, (i) horizon admits the next window
create or replace function public.hr_party_tick_settle(p_holder text, p_party uuid, p_window_from timestamp with time zone, p_window_to timestamp with time zone, p_intent_id uuid, p_members jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_skew        constant interval := interval '60 seconds';
  c_channel     constant text     := 'combat';
  c_max_members constant int      := 4;
  -- RE-VERIFY 5's ceiling, PER MEMBER, in OCTETS. Checked here so the refusal
  -- has a tick-shaped NAME the driver can count rather than a check_violation
  -- that aborts the batch's transaction (the CHECK on party_tick_lease is the
  -- backstop under it, at 4x for the whole object).
  c_state_max   constant int      := 16384;
  -- THE DELTA VOCABULARY A PARTY SETTLE ACCEPTS — a solo combat settle's, and
  -- nothing else. §5(g) PROVES this is a subset of hr_apply's own
  -- `c_delta_keys`, parsed out of its installed body, so a shadow run can
  -- never accumulate parity evidence for a payload hr_apply would refuse (S-1).
  c_delta_ok    constant text[] := array[
    'gold','xp','items','accrued_to','hp','fight','recovering_until',
    'consec_falls','deaths','progress','hearthfind','tool_carry','journal',
    -- THE CARRIED XP REMAINDERS, absolute maps the engine proposes on any window
    -- that moved one (2026-10-13-party-settle-frac-keys.sql). Validated by
    -- hr_apply alone, which this settle hands the delta to verbatim
    'xp_frac','companion_xp_frac'];
  -- THE STAMPING KEYS. `guardStampKeys()` stays exactly as it is and is the
  -- BACKSTOP, not the fence (§18.2.3 invariant 8): the day someone adds a
  -- stamping key to a party delta it is a LOUD refusal rather than the silent
  -- confiscation of four players' nights at once.
  c_stamp       constant text[] := array['activity','equip','enchant'];
  -- B-A5. An EQUALITY, in §18.2.1a's own order.
  c_party_keys  constant text[] := array['id','hunt','dmg_bp','xp_bp','floor',
                                         'fellow_bp','roll'];
  v_role     text;
  v_cfg      public.hr_tick_config%rowtype;
  v_hunt     public.party_hunt%rowtype;
  v_lease    public.party_tick_lease%rowtype;
  -- THE COMBAT CHANNEL'S MODE (2026-10-06, ruling 5): read at step (3b),
  -- under the party and lease locks.
  v_shadow   boolean;
  v_on       boolean;
  v_mark     timestamptz;
  v_n        int;
  v_live     int;
  v_matched  int;
  v_m        jsonb;
  v_mu       uuid;
  v_ms       int;
  v_delta    jsonb;
  v_party    jsonb;
  v_keys     text[];
  v_state    jsonb;
  v_carry    jsonb := '{}'::jsonb;
  v_any_state boolean := false;
  v_st       public.player_state%rowtype;
  v_ins      int;
  v_tot      int := 0;
  v_out      jsonb;
  v_bad_user uuid;
  v_bad      jsonb;
  k          text;
  -- THE ARMED FENCES, PER MEMBER (2026-10-08, steps 8b/8c).
  v_adm      text;
  v_cap_ms   bigint;
  -- THE DROP (3c) AND THE REJOIN (10) (2026-10-08-world-tick-party-drop.sql).
  -- (7)'s clamp: a member dropped this many times today by this party is not
  -- re-admitted until the server's UTC day rolls.
  c_max_drops_day constant int := 3;
  v_drop     jsonb := '[]'::jsonb;
  v_hunters  int   := 0;
  v_reason   text;
  v_lead     record;
  v_next     record;
  v_handoff  boolean := false;
  v_so       record;
  v_got      int;
  v_own_n    int;
  v_rejoin   jsonb := '[]'::jsonb;
  -- THE PRESENCE HORIZON AT PARTY GRAIN (2026-10-14-world-tick-m4-party-horizon.sql):
  -- a member's last REAL return (hr_return_anchor, stamped only by non-tick
  -- settles), read under that member's row lock at (3c), (8d) and (10).
  v_anchor   timestamptz;
  v_noown    jsonb;
begin
  -- ── (0) IDENTITY. The PRIMARY control is the GRANT in §4; this is the
  --        SECONDARY one, so an owner-context call cannot silently act as the
  --        engine without saying so. `hr_tick` is refused BY NAME: the selector
  --        must never be able to become the settler.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_party_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (0b) THIS TRANSACTION IS THE WORLD TICK. Transaction-local, read only
  --         by hr_frame_wanted, and it can only SUPPRESS a frame for a member
  --         with no live window (2026-10-07-frame-emit-online-only.sql).
  perform set_config('hr.frame_origin', 'tick', true);

  -- ── (1) THE KILL SWITCH, READ FIRST AND FAILING CLOSED.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;

  -- ── (2) ARGUMENTS ARE CLAMPED AND BOUND, NEVER TRUSTED.
  if p_party is null or p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_members');
  end if;
  v_n := jsonb_array_length(p_members);
  if v_n < 1 or v_n > c_max_members then
    return jsonb_build_object('ok', false, 'error', 'bad_members', 'members', v_n,
      'max', c_max_members);
  end if;
  if p_window_from is null or p_window_to is null or p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_window_to > now() + c_skew then
    return jsonb_build_object('ok', false, 'error', 'window_in_future',
      'skew_ms', floor(extract(epoch from (p_window_to - now())) * 1000));
  end if;
  if not (c_channel = any (v_cfg.channels)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_owned_by_tick');
  end if;

  -- ── (2b) THE CARRIER'S SHAPE, PER MEMBER (RE-VERIFY 5). Refused HERE —
  --         before the lock, before the lease, a very long way before
  --         hr_apply. The MODE half of this check (`shadow_state_while_armed`)
  --         moved to step (3b), 2026-10-06: the mode is per channel and is read
  --         under the lease lock, on the same read that decides whether this
  --         settle pays.
  for v_m in select value from jsonb_array_elements(p_members) loop
    v_state := v_m->'shadow_state';
    if v_state is null or jsonb_typeof(v_state) = 'null' then continue; end if;
    v_any_state := true;
    if jsonb_typeof(v_state) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_shadow_state',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    if octet_length(v_state::text) > c_state_max then
      return jsonb_build_object('ok', false, 'error', 'shadow_state_too_large',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'),
        'bytes', octet_length(v_state::text), 'max', c_state_max);
    end if;
  end loop;

  -- ── (3) ★ THE PARTY LOCK, TAKEN FIRST ★. This is what serialises a settle
  --        against a join, a leave and a kick (§18.2.5 step 3).
  select * into v_hunt from public.party_hunt
   where party_id = p_party and ended_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_party_hunt');
  end if;
  select * into v_lease from public.party_tick_lease
   where party_id = p_party for update;
  if not found or not v_lease.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_lease.lease_holder is distinct from p_holder
     or v_lease.lease_until is null or v_lease.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease',
      'holder', v_lease.lease_holder, 'until', v_lease.lease_until);
  end if;

  -- ── (3b) ★ THE COMBAT CHANNEL'S MODE, UNDER THE LEASE LOCK ★ (2026-10-06,
  --         ruling 5.3). A party hunt is COMBAT (§18.2.1a), so the party's mode
  --         is `'combat' = any (armed_channels)` — the same authority, the same
  --         channel, as a solo combat settle. Read after the party and lease
  --         locks, in a statement of its own and WITHOUT a row lock, for the
  --         reasons hr_tick_settle step (4b) gives (the config row is the
  --         driver's hot cursor row). Fails SAFE: not enabled, nothing armed.
  select c.enabled, not coalesce(c_channel = any (c.armed_channels), false)
    into v_on, v_shadow
    from public.hr_tick_config c where c.id;
  if not found or not coalesce(v_on, false) then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;
  v_shadow := coalesce(v_shadow, true);
  -- ★ AN ARMED WINDOW MAY NOT CARRY A SHADOW STATE, FOR ANY MEMBER. Refused,
  --   not ignored, and still before hr_apply: the honest answer to an
  --   operator who arms combat between the driver's probe and its settle is
  --   that ONE settle refused, loudly, and the next fire armed with no carrier.
  if v_any_state and not v_shadow then
    return jsonb_build_object('ok', false, 'error', 'shadow_state_while_armed',
      'channel', c_channel);
  end if;

  -- ══ (3c) ★ THE DROP ★ (2026-10-08-world-tick-party-drop.sql; Game Designer
  --    ruling, SEC_GATHER_ARM_RUNBOOK (c) 1-6). ARMED ONLY, and BEFORE the CAS,
  --    so the driver's own probe — the call that writes nothing else and that
  --    every fire makes before it prices anything — is where a fenced member
  --    leaves the hunt. The window that probe would have priced is therefore
  --    never priced with them in it: the probe answers `member_sat_out`, the
  --    driver skips, and the next fire's hr_party_roster hands it the
  --    REMAINING hunters, whose split is the only one that can pay (6).
  --    THE JUDGEMENT IS THE SERVER'S, ON ITS OWN ROWS AND CLOCK (c)(1): the
  --    hunter set is read here from party_member (never from p_members), each
  --    hunter's player_state row is locked FOR UPDATE in (user_id, slot) order
  --    (the order (4)(5b) takes, so nothing new can deadlock), and a hunter is
  --    dropped when, on that LOCKED mark and that member's OWN server cap,
  --      hr_tick_admit(false, accrued_to, null) <> 'admit'     → 'fenced_24h'
  --      cap <= 0 (NULL fails closed) or accrued_to < now() - cap → 'fenced_cap'
  --    — judged on now() alone, so no argument can move it. The (8b)(8c)
  --    window fences below stay, verbatim, as the backstop for the <= 60 s a
  --    window may end past now() (step 2's skew).
  --    A refusal ABOVE this point (lease, mode, carrier) drops nobody, and a
  --    member-caused refusal BELOW it (version, channel, invariant 8) never
  --    drops anyone else: those return before any write, as they always did.
  --    WHAT A DROP WRITES, AND NOTHING ELSE: one party_hunt_roster_log row per
  --    dropped member (5); the party and hunt versions; the leader hand-off
  --    when the leader is dropped (6); `ended_at` when fewer than two hunters
  --    remain (6). NO player_state field is written, so a drop cannot touch
  --    hp, recovery, deaths or vigour (4), and NO ledger row is written (3).
  --    The dropped member keeps their party_member row (they are still in the
  --    party, and Leave is still theirs); hr_partied goes false for them, so
  --    their own solo paths price their time from their own mark up to their
  --    own cap — the hr_party_kick boundary rule — while the party pays the
  --    rest from the same mark onward. One interval, one payer, each.
  if not v_shadow then
    -- ══ (3a) ★ THE M4 COHORT ★ (2026-10-14-world-tick-m4-party-horizon.sql).
    --    A party settle is the combat channel, and the combat channel pays only
    --    characters the tick OWNS (hr_tick_ownership, operator-written, no
    --    client grant) — the solo settle's step (4) `not_tick_owned`. Without
    --    this, arming combat for one owned character armed the party path for
    --    every account that can call hr_party_hunt_start. A live hunter who is
    --    not owned for combat ENDS THE HUNT, here, before the drop and the CAS:
    --    nothing is paid, no player_state is written, one append-only 'stop'
    --    row per hunter names the reason, and every member's own solo path then
    --    prices their time from their own mark on their own cap — a leader's
    --    Stop, decided by the server. The party row is taken SKIP LOCKED, as
    --    the drop takes it: a busy party is `party_busy` and judged next fire.
    select coalesce(jsonb_agg(jsonb_build_object('user', pm.user_id, 'slot', pm.slot)
                              order by pm.user_id, pm.slot), '[]'::jsonb)
      into v_noown
      from public.party_member pm
     where pm.party_id = p_party and pm.left_at is null
       and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
       and not exists (select 1 from public.hr_tick_ownership o
                        where o.user_id = pm.user_id and o.slot = pm.slot
                          and o.channel = c_channel and o.owned);
    if jsonb_array_length(v_noown) > 0 then
      perform 1 from public.party where id = p_party for update skip locked;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'party_busy', 'mode', 'armed',
          'paid', false, 'channel', c_channel, 'party', p_party);
      end if;
      insert into public.party_hunt_roster_log
        (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
      select public.hr_utc_day_key(now()), p_party, v_hunt.id, pm.user_id, pm.slot,
             'stop', 'not_in_cohort', v_hunt.accrued_to, null, 0
        from public.party_member pm
       where pm.party_id = p_party and pm.left_at is null
         and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
       order by pm.user_id, pm.slot;
      update public.party_hunt
         set ended_at = now(), stopped_by = 'not_in_cohort', version = version + 1
       where party_id = p_party and ended_at is null;
      update public.party set version = version + 1 where id = p_party;
      return jsonb_build_object('ok', false, 'error', 'party_hunt_ended',
        'why', 'not_in_cohort', 'mode', 'armed', 'paid', false,
        'channel', c_channel, 'party', p_party, 'not_owned', v_noown);
    end if;

    for v_m in
      select jsonb_build_object('user', pm.user_id, 'slot', pm.slot)
        from public.party_member pm
       where pm.party_id = p_party and pm.left_at is null
         and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
       order by pm.user_id, pm.slot
    loop
      v_mu := (v_m->>'user')::uuid;
      v_ms := (v_m->>'slot')::int;
      select * into v_st from public.player_state
       where user_id = v_mu and slot = v_ms for update;
      -- A hunter with no character is not judged here: (4)(5b) refuses it by
      -- name (no_character) before anything is paid.
      if not found then continue; end if;
      v_hunters := v_hunters + 1;
      v_adm    := public.hr_tick_admit(false, v_st.accrued_to, null);
      v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);
      -- (8d) AT PARTY GRAIN (2026-10-14): the member's last REAL return, read
      -- after their row was locked above, so it cannot move under this read.
      select a.real_return_at into v_anchor from public.hr_return_anchor a
       where a.user_id = v_mu and a.slot = v_ms;
      v_reason := case
                    when v_adm is distinct from 'admit' then 'fenced_24h'
                    when v_cap_ms <= 0
                      or v_st.accrued_to < now() - v_cap_ms * interval '1 millisecond' then 'fenced_cap'
                    -- FAILS CLOSED, as the solo (8d): no anchor, no pay.
                    when v_anchor is null then 'no_return_anchor'
                    -- PAST THE PRESENCE HORIZON on the server clock alone: the
                    -- party may pay this member nothing past R + own cap, the
                    -- SAME hr_offline_cap_ms the solo (8d) and accrue read.
                    when now() > v_anchor + v_cap_ms * interval '1 millisecond' then 'past_horizon'
                  end;
      if v_reason is not null then
        v_drop := v_drop || jsonb_build_array(jsonb_build_object(
          'user', v_mu, 'slot', v_ms, 'reason', v_reason,
          'accrued_to', v_st.accrued_to, 'cap_ms', v_cap_ms));
      end if;
    end loop;

    if jsonb_array_length(v_drop) > 0 then
      -- THE PARTY ROW, NEVER WAITED ON. The verbs take party -> party_hunt; this
      -- function holds party_hunt already, so waiting here could close a cycle
      -- with a leader's Stop. SKIP LOCKED answers `party_busy` with nothing
      -- written, and the next fire judges again.
      perform 1 from public.party where id = p_party for update skip locked;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'party_busy', 'mode', 'armed',
          'paid', false, 'channel', c_channel, 'party', p_party);
      end if;
      v_hunters := v_hunters - jsonb_array_length(v_drop);

      -- (5) ONE APPEND-ONLY ROW PER DROPPED MEMBER: party, hunt, member, the
      --     locked mark, the cap, the reason, the server's time and day key.
      insert into public.party_hunt_roster_log
        (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
      select public.hr_utc_day_key(now()), p_party, v_hunt.id,
             (d->>'user')::uuid, (d->>'slot')::int, 'drop', d->>'reason',
             (d->>'accrued_to')::timestamptz, (d->>'cap_ms')::bigint, v_hunters
        from jsonb_array_elements(v_drop) d;

      -- (6) FEWER THAN TWO HUNTERS: THE HUNT ENDS AND EVERYONE GOES SOLO.
      --     `ended_at` makes hr_partied false for every member, invariant 7
      --     stops excluding them, and each one's own path prices their time
      --     from their own mark — which invariant 8 kept equal to the hunt's.
      if v_hunters < 2 then
        update public.party_hunt
           set ended_at = now(), stopped_by = 'too_few_hunters', version = version + 1
         where party_id = p_party and ended_at is null;
        update public.party set version = version + 1 where id = p_party;
        return jsonb_build_object('ok', false, 'error', 'party_hunt_ended',
          'why', 'too_few_hunters', 'mode', 'armed', 'paid', false,
          'channel', c_channel, 'party', p_party, 'dropped', v_drop, 'hunters', v_hunters);
      end if;

      -- (6) A DROPPED LEADER HANDS THE ROLE ON, in this transaction, by
      --     hr_party_leave's own succession rule (tenure, then user id) over
      --     the REMAINING hunters — so the hunt that keeps running has a leader
      --     who can stop it. The dropped leader stays in the party as a member.
      select p.leader_user as user_id, p.leader_slot as slot into v_lead
        from public.party p where p.id = p_party;
      if exists (select 1 from jsonb_array_elements(v_drop) d
                  where (d->>'user')::uuid = v_lead.user_id
                    and (d->>'slot')::int  = v_lead.slot) then
        select pm.user_id, pm.slot into v_next
          from public.party_member pm
         where pm.party_id = p_party and pm.left_at is null
           and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
         order by pm.joined_at, pm.user_id
         limit 1;
        update public.party_member set role = 'member'
         where party_id = p_party and user_id = v_lead.user_id and slot = v_lead.slot
           and left_at is null;
        update public.party_member set role = 'leader'
         where party_id = p_party and user_id = v_next.user_id and slot = v_next.slot
           and left_at is null;
        update public.party
           set leader_user = v_next.user_id, leader_slot = v_next.slot, version = version + 1
         where id = p_party;
        v_handoff := true;
      else
        update public.party set version = version + 1 where id = p_party;
      end if;
      update public.party_hunt set version = version + 1
       where party_id = p_party and ended_at is null;
      return jsonb_build_object('ok', false, 'error', 'member_sat_out', 'mode', 'armed',
        'paid', false, 'channel', c_channel, 'party', p_party, 'dropped', v_drop,
        'hunters', v_hunters, 'leader_handoff', v_handoff);
    end if;
  end if;

  -- ── (5a) ★ THE CAS, AT PARTY GRAIN ★. v_mark is the PARTY's, computed once,
  --         byte-identically to hr_tick_settle's own rule. Armed: the party
  --         watermark, which the party's own payments move. Shadow: greatest of
  --         it and the party's shadow watermark, so windows cannot overlap
  --         while nothing is being paid.
  v_mark := case when v_shadow
                 then greatest(v_hunt.accrued_to,
                               coalesce(v_lease.shadow_accrued_to, v_hunt.accrued_to))
                 else v_hunt.accrued_to end;
  --
  --         ── THE CARRIER RIDES THE SAME REFUSAL AS THE MARK (RE-VERIFY 5,
  --            design 4, at party grain). `party_tick_lease` is readable by NO
  --            role — not anon, not authenticated, not service_role, not
  --            hr_engine, not hr_tick — and `hr_party_roster` is hr_tick's, so
  --            this refusal is the ONLY way the settling role can learn the
  --            party's true watermark, the MODE, or the continuation state its
  --            own last window left. Routing any of the three through the
  --            driver's POST body instead would make "the server picks whose
  --            world ticks, and from when" a claim about a request rather than
  --            about a row somebody else wrote, and a tick host that could edit
  --            its own payload could hand the engine any hp, any recovery clock
  --            and any bag it liked for four characters at once.
  --            It is read under the same `for update` on the same two rows, in
  --            this role's own transaction, on the same statement that reports
  --            the mark: one lock, one answer, no second read. And it is handed
  --            back ONLY while the fence is actually CHAINING — in shadow, with
  --            a shadow mark that has moved PAST the paid one. Armed it is never
  --            sent at all: the row has none (the armed branch clears it) and an
  --            armed window must not read one.
  if p_window_from < v_mark or p_window_to <= v_mark then
    return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
      'window_from', p_window_from, 'window_to', p_window_to,
      'accrued_to', v_mark, 'shadow', v_shadow, 'channel', c_channel)
      || case
           when v_shadow
            and v_lease.shadow_state is not null
            and v_lease.shadow_accrued_to is not null
            and v_lease.shadow_accrued_to > v_hunt.accrued_to
           then jsonb_build_object('shadow_state', v_lease.shadow_state)
           else '{}'::jsonb end;
  end if;

  -- ── (6) RE-COUNT THE LIVE MEMBERSHIP UNDER THE LOCK (T-6), AND RE-ASSERT
  --        THE MEMBER SET IS EXACTLY IT. A count read outside the lock is the
  --        shape the clan member-cap bug turned on, and a member set that is a
  --        SUBSET of the live roster is S-9's partial settle: three members
  --        paid a split computed from four contributors, which is a mint.
  --
  --        STATED AS ONE PREDICATE, THREE WAYS TO FAIL, so the property has a
  --        single line a mutation can take away: `v_live` is the live roster's
  --        size, `v_n` the declared set's, and `v_matched` the number of
  --        DISTINCT live members the declared set names. The three are equal if
  --        and only if the declared set IS the live set with no member named
  --        twice — the distinct count is what refuses `[A, A]` against a live
  --        `{A, B}`, which every count-only form accepts.
  --
  --        ★ 2026-10-08 (party-drop, (c)(2)): THE LIVE SET IS THE HUNTER SET —
  --        live members NOT sat out of this hunt. A declared set that still
  --        names a dropped member, or that leaves out a hunter, is refused here
  --        exactly as before, so the paid set can only ever be the remaining
  --        hunters and a dropped member can never be priced into a split.
  select count(*) into v_live from public.party_member pm
   where pm.party_id = p_party and pm.left_at is null
     and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot);
  select count(distinct (pm.user_id, pm.slot)) into v_matched
    from jsonb_array_elements(p_members) e
    join public.party_member pm
      on pm.party_id = p_party and pm.left_at is null
     and pm.user_id = (e.value->>'user')::uuid
     and pm.slot    = (e.value->>'slot')::int
   where not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot);
  if v_live <> v_n or v_matched <> v_n then
    return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
      'why', 'the declared member set is not the live member set',
      'declared', v_n, 'live', v_live, 'matched', v_matched);
  end if;

  -- ── (6b) THE DELTA IS KEY-FOR-KEY A SOLO COMBAT SETTLE'S (S-1), AND THE
  --         PARTY OBJECT'S KEY SET IS AN EQUALITY (B-A5).
  --
  --         ⚠ AFTER THE CAS, DELIBERATELY. The driver reads the party's true
  --           watermark, the MODE and the per-member carrier off the CAS's own
  --           refusal — `hr_party_roster` is hr_tick's and `party_tick_lease`
  --           is readable by nobody, so this refusal is the ONLY way the
  --           settling role can learn any of the three. That probe carries a
  --           deliberately stale window and a minimal delta, exactly as the
  --           solo `probeWatermark` does; shape-checking before the CAS would
  --           make it unanswerable and the driver would have to take the
  --           watermark from its own POST body instead, which is precisely the
  --           authority this fence exists to keep out of a request.
  --           Nothing is written either way: the CAS refuses first, and a
  --           malformed delta is refused here before any member row is locked.
  for v_m in select value from jsonb_array_elements(p_members) loop
    v_delta := v_m->'delta';
    if v_delta is null or jsonb_typeof(v_delta) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_delta',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    for k in select jsonb_object_keys(v_delta) loop
      if k = any (c_stamp) then
        -- §18.2.3 invariant 8's backstop, and it is LOUD on purpose.
        return jsonb_build_object('ok', false, 'error', 'delta_would_stamp', 'key', k,
          'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
      end if;
      if not (k = any (c_delta_ok)) then
        -- Including a TOP-LEVEL `party` key, which is S-1 exactly: attribution
        -- is JOURNAL, never DELTA, and in shadow this is the only thing between
        -- 48 h of parity evidence and a payload hr_apply cannot accept.
        return jsonb_build_object('ok', false, 'error', 'unknown_delta_key', 'key', k,
          'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
      end if;
    end loop;
    -- (2d) B-A5 — THE NESTED KEY SET, BOTH DIRECTIONS.
    v_party := v_delta #> '{journal,meta,party}';
    if v_party is null or jsonb_typeof(v_party) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'why', 'journal.meta.party is absent or is not an object',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    select array(select jsonb_object_keys(v_party) order by 1) into v_keys;
    if v_keys <> array(select unnest(c_party_keys) order by 1) then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'keys', to_jsonb(v_keys), 'expected', to_jsonb(c_party_keys),
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
    if (v_party->>'id') is distinct from p_party::text then
      return jsonb_build_object('ok', false, 'error', 'bad_party_meta',
        'why', 'journal.meta.party.id names a different party than the call does',
        'member', jsonb_build_object('user', v_m->>'user', 'slot', v_m->>'slot'));
    end if;
  end loop;

  -- ── (4)(5b) THE MEMBER ROW LOCKS, IN (user_id, slot) ORDER, AND THE
  --         PER-MEMBER HALF OF THE CAS. Deterministic order is the whole
  --         deadlock argument: a concurrent solo settle holds exactly one of
  --         these rows and can only ever be waited on, never circularly.
  --
  --         ⚠ ANY MEMBER FAILING MEANS THE WHOLE CALL RETURNS AND NOTHING IS
  --           WRITTEN. All-or-nothing is not tidiness: a partial settle pays
  --           three members a split computed from four contributors.
  for v_m in
    select e.value from jsonb_array_elements(p_members) e
     order by (e.value->>'user')::uuid, (e.value->>'slot')::int
  loop
    v_mu := (v_m->>'user')::uuid;
    v_ms := (v_m->>'slot')::int;
    select * into v_st from public.player_state
     where user_id = v_mu and slot = v_ms for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'no_character', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms));
    end if;
    -- INVARIANT 8, AS A PREDICATE. An inequality EITHER WAY is a broken
    -- invariant, not a window to clamp: the party watermark IS the member's
    -- watermark for the life of the hunt, and hr_party_tick_settle is the only
    -- writer of either. §18.2.4 deletes the old drag-forward rule rather than
    -- softening it, so there is nothing here to reconcile.
    if v_st.accrued_to is distinct from v_hunt.accrued_to then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'invariant_8', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'member_accrued_to', v_st.accrued_to, 'party_accrued_to', v_hunt.accrued_to);
    end if;
    if (v_m->>'version') is null or (v_m->>'version')::bigint <> v_st.version then
      return jsonb_build_object('ok', false, 'error', 'party_window_already_settled',
        'why', 'version_conflict', 'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'held', v_m->>'version', 'current', v_st.version);
    end if;
    -- THE DECLARED WINDOW IS BOUND TO THE PAID ONE, per member, so a caller
    -- cannot name ten seconds and hand over an hour.
    if nullif(v_m#>>'{delta,accrued_to}', '')::timestamptz is distinct from p_window_to then
      return jsonb_build_object('ok', false, 'error', 'window_delta_mismatch',
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'declared', v_m#>>'{delta,accrued_to}', 'window_to', p_window_to);
    end if;
    -- The character must still be on the channel the party is hunting on.
    if v_st.active_kind is distinct from c_channel then
      return jsonb_build_object('ok', false, 'error', 'channel_moved',
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'active_kind', v_st.active_kind);
    end if;
  end loop;

  -- ══ (7) SHADOW BRANCH — JOURNAL WHAT WOULD HAVE BEEN PAID; PAY NOTHING ═══
  -- There is no hr_apply call on this branch and there must never be one.
  if v_shadow then
    for v_m in
      select e.value from jsonb_array_elements(p_members) e
       order by (e.value->>'user')::uuid, (e.value->>'slot')::int
    loop
      v_mu    := (v_m->>'user')::uuid;
      v_ms    := (v_m->>'slot')::int;
      v_delta := v_m->'delta';
      v_party := v_delta #> '{journal,meta,party}';
      -- ★ THE LIFT. The attribution goes to the COLUMN and the delta is stored
      --   WITHOUT it — so `hr_tick_shadow.delta` is byte-for-byte the object a
      --   SOLO settle would have stored, and §18.2.6 (P-a) degenerate parity is
      --   a byte comparison rather than an argument.
      with ins as (
        insert into public.hr_tick_shadow
          (user_id, slot, channel, holder, window_from, window_to, version,
           intent_id, delta, would_gold, would_qty, would_ticks, party)
        values
          (v_mu, v_ms, c_channel, p_holder, p_window_from, p_window_to,
           (v_m->>'version')::bigint, p_intent_id,
           v_delta #- '{journal,meta,party}',
           coalesce((v_delta->>'gold')::bigint, 0),
           coalesce((v_delta#>>'{journal,meta,qty}')::bigint, 0),
           coalesce((v_delta#>>'{journal,meta,ticks}')::bigint, 0),
           v_party)
        on conflict (user_id, slot, intent_id) do nothing
        returning 1)
      select count(*) into v_ins from ins;
      v_tot := v_tot + v_ins;
      v_state := v_m->'shadow_state';
      if v_state is not null and jsonb_typeof(v_state) = 'object' then
        v_carry := v_carry || jsonb_build_object(v_mu::text || ':' || v_ms::text, v_state);
      end if;
    end loop;

    -- ── CHAIN, AND ONLY IF SOMETHING WAS JOURNALLED. The CAS above already
    --    refuses a replayed window on arithmetic, so a conflict here is
    --    unreachable by an honest caller — but if it were reached, moving the
    --    mark and overwriting the carrier for a window that produced NO journal
    --    row would advance the chain past a window nobody can ever read. The
    --    mark and the carrier move TOGETHER, in ONE statement, under the lease
    --    lock taken at (3).
    if v_tot > 0 then
      update public.party_tick_lease
         set shadow_accrued_to = p_window_to,
             shadow_state      = case when v_carry = '{}'::jsonb then null else v_carry end,
             updated_at        = now()
       where party_id = p_party;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'shadow', 'channel', c_channel, 'paid', false,
      'party', p_party, 'window_to', p_window_to, 'members', v_n,
      'journalled', v_tot, 'chained', v_tot > 0 and v_any_state);
  end if;

  -- ══ (8b)(8c) ★ THE ARMED FENCES, PER MEMBER ★ (2026-10-08, Security review
  --    of 2026-10-07-world-tick-armed-cap.sql: "hr_party_tick_settle has
  --    neither 8b nor 8c, so it blocks combat arming (M4)"). hr_tick_settle's
  --    two armed fences, applied to EVERY member, on that member's own row
  --    (locked FOR UPDATE at (4)(5b) above, so this re-read is the locked
  --    value) and that member's own server cap:
  --      (8b) raw accrued_to inside 24 h — hr_tick_admit's no-chain arm, the
  --           predicate hr_tick_settle (8b) uses             → 'fenced_24h'
  --      (8c) accrued_to >= greatest(now(), p_window_to) - hr_offline_cap_ms;
  --           a NULL or zero cap fails CLOSED               → 'fenced_cap'
  --    With (5a) holding p_window_from >= the party mark and (2) holding
  --    p_window_to <= now() + 60 s, an armed party pays at most min(absence,
  --    cap) of any absence, one span or a 90 s drip: never more than accrue.
  --    ★ THE WHOLE WINDOW IS REFUSED, NEVER ONE MEMBER SKIPPED. The deltas are
  --      one split computed from every contributor (journal.meta.party), so
  --      paying the rest while one is fenced is S-9's partial settle — a share
  --      minted from a contributor nobody paid. Returned before ANY write,
  --      like every refusal above; the hunt is NOT ended (a fence is not a
  --      member fault). Invariant 8 makes every member's mark the party's, so
  --      in practice the smallest member cap decides; it is still read per
  --      member so a future break of invariant 8 cannot widen it.
  --    The SHADOW branch above has already returned: it is untouched.
  for v_m in
    select e.value from jsonb_array_elements(p_members) e
     order by (e.value->>'user')::uuid, (e.value->>'slot')::int
  loop
    v_mu := (v_m->>'user')::uuid;
    v_ms := (v_m->>'slot')::int;
    select * into v_st from public.player_state where user_id = v_mu and slot = v_ms;
    v_adm := public.hr_tick_admit(false, v_st.accrued_to, null);
    if v_adm is distinct from 'admit' then
      return jsonb_build_object('ok', false, 'error', 'fenced_24h', 'mode', 'armed', 'paid', false,
        'channel', c_channel, 'party', p_party,
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'accrued_to', v_st.accrued_to, 'admission', v_adm);
    end if;
    v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);
    if v_cap_ms <= 0
       or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then
      return jsonb_build_object('ok', false, 'error', 'fenced_cap', 'mode', 'armed', 'paid', false,
        'channel', c_channel, 'party', p_party,
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'accrued_to', v_st.accrued_to, 'cap_ms', v_cap_ms);
    end if;
    -- (8d) ★ THE PRESENCE HORIZON, PER MEMBER ★ (2026-10-14). The (3c) drop
    --      judged now() against R + cap; this refuses the WHOLE window when
    --      it ENDS past any member's R + cap — the <= 60 s skew (2) allows,
    --      and a window that straddles the horizon (Security #4, H1b). The
    --      window is refused, never clipped and never paid to the others
    --      (S-9: one split, every contributor). Nothing is written; the next
    --      fire drops the member at (3c) once now() is past their horizon.
    select a.real_return_at into v_anchor from public.hr_return_anchor a
     where a.user_id = v_mu and a.slot = v_ms;
    if v_anchor is null
       or p_window_to > v_anchor + v_cap_ms * interval '1 millisecond' then
      return jsonb_build_object('ok', false,
        'error', case when v_anchor is null then 'no_return_anchor' else 'past_horizon' end,
        'mode', 'armed', 'paid', false, 'channel', c_channel, 'party', p_party,
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'accrued_to', v_st.accrued_to, 'anchor', v_anchor,
        'horizon', v_anchor + v_cap_ms * interval '1 millisecond', 'cap_ms', v_cap_ms);
    end if;
  end loop;

  -- ══ (8)(9) ARMED BRANCH — hr_apply ONCE PER MEMBER, IN ONE TRANSACTION ═══
  -- §18.2.5a, answering S-9. The fan-out runs inside ONE `begin … exception`
  -- sub-block: a member refusal raises HR826 inside it, the sub-block's
  -- implicit savepoint rolls back EVERY hr_apply write from the fan-out, and
  -- the handler's own statements then run in the OUTER transaction, which is
  -- still live. `party_hunt.accrued_to` is NOT advanced, so the window is
  -- intact; the hunt ENDS, `hr_partied` goes false for every member, invariant
  -- 7 stops excluding them, and the SAME window is priced once per member under
  -- the ordinary solo rules — the refusing member meets their own bag_full
  -- alone, where it is their own problem to solve, and the others are paid.
  --
  -- ⚠ B-A3: THE HANDLER NAMES ITS EXCEPTION. `when others` would also catch a
  --   deadlock, a lock timeout, a statement cancellation and a bug in the
  --   split, and turn each into "end the party hunt, blame a member" — two of
  --   which an adversary can provoke. Everything but HR826 propagates.
  begin
    for v_m in
      select e.value from jsonb_array_elements(p_members) e
       order by (e.value->>'user')::uuid, (e.value->>'slot')::int
    loop
      v_mu := (v_m->>'user')::uuid;
      v_ms := (v_m->>'slot')::int;
      -- THE DELTA GOES THROUGH UNTOUCHED, `journal.meta.party` and all:
      -- hr_apply merges `journal.meta` at the TOP of player_ledger.meta, so the
      -- party read is `meta->'party'` (§18.2.1a). hr_apply is the ONLY money
      -- writer and this function never moves a value except through it.
      v_out := public.hr_apply(v_mu, v_ms, (v_m->>'version')::bigint,
                               p_intent_id, v_m->'delta');
      if not coalesce((v_out->>'ok')::boolean, false) then
        v_bad_user := v_mu;
        v_bad := jsonb_build_object('user', v_mu, 'slot', v_ms,
                                    'error', v_out->>'error');
        raise exception 'HR_PARTY_MEMBER_UNPAYABLE' using errcode = 'HR826';
      end if;
    end loop;
    -- Every member paid. The party watermark moves, once, and the party's
    -- version with it.
    update public.party_hunt
       set accrued_to = p_window_to, version = version + 1
     where party_id = p_party and ended_at is null;
    -- ARMED PAYMENTS CLEAR THE SHADOW MARK — AND THE CARRIER WITH IT, in the
    -- same statement, for the same reason RE-VERIFY 5 clears the solo one:
    -- `accrued_to` is the authority again from here, and a stale carrier left
    -- lying around is a second source of truth nobody reads.
    update public.party_tick_lease
       set shadow_accrued_to = null, shadow_state = null, updated_at = now()
     where party_id = p_party;
  exception when sqlstate 'HR826' then
    -- The fan-out is rolled back. plpgsql variable assignments SURVIVE the
    -- sub-block rollback, which is why v_bad_user is readable here.
    update public.party_hunt
       set ended_at = now(), stopped_by = 'member_unpayable:' || v_bad_user::text
     where party_id = p_party and ended_at is null;
    return jsonb_build_object('ok', false, 'error', 'member_unpayable',
      'party', p_party, 'member', v_bad, 'mode', 'armed', 'paid', false);
  end;

  -- ══ (10) ★ THE REJOIN ★ (2026-10-08-world-tick-party-drop.sql; (c)(4)(5)(7)).
  --    Reached only when this ARMED window has paid every hunter and moved the
  --    hunt mark to p_window_to. A member sat out of THIS hunt rejoins at this
  --    fire, with their mark set to the hunt's new mark — the fire's own end,
  --    i.e. the server's `now` for this window, and the only instant invariant
  --    8 allows — when ALL of:
  --      (a) still a live member of this party (row locked, never waited on);
  --      (b) dropped fewer than c_max_drops_day times today by this party,
  --          from the journal on the server's day key — (7)'s clamp, so a
  --          drop/rejoin cycle cannot cut a refused window into every fire;
  --      (c) their own row is lockable now (SKIP LOCKED: never waited on, and
  --          a solo settle in flight on it simply defers the rejoin);
  --      (d) on the hunt's channel;
  --      (e) RETURNED: their own mark has moved past the mark they were
  --          dropped at, i.e. their own solo path has priced their away time
  --          (min(absence, own cap)) since the drop, AND that mark is not past
  --          p_window_to — so moving it to p_window_to is FORWARD only and the
  --          span [their mark, p_window_to] is forfeited (no back pay, ruling)
  --          and is never paid by both paths;
  --      (f) their cap admits (NULL/0 fails closed), so the rejoin cannot be
  --          dropped again on the very next fire;
  --      (g) every hr_tick_ownership row of theirs is lockable now, and any
  --          solo lease on it is EXPIRED here — a solo settle that leased them
  --          before this commit then answers `no_lease` instead of paying a
  --          solo window over time the party now pays.
  --    WHAT A REJOIN WRITES: player_state.accrued_to (forward) and version,
  --    the lease expiry, and one party_hunt_roster_log row (5). Nothing else
  --    on the member row moves — hp, recovering_until, deaths, consec_falls,
  --    fight/vigour and every counter carry over as they are (4).
  for v_so in
    select l.user_id, l.slot, l.mark as drop_mark
      from public.party_hunt_roster_log l
     where l.hunt_id = v_hunt.id
       and l.event = 'drop'
       and l.id = (select max(l2.id) from public.party_hunt_roster_log l2
                    where l2.hunt_id = l.hunt_id
                      and l2.user_id = l.user_id and l2.slot = l.slot)
     order by l.user_id, l.slot
  loop
    perform 1 from public.party_member pm
     where pm.party_id = p_party and pm.user_id = v_so.user_id and pm.slot = v_so.slot
       and pm.left_at is null
       for update skip locked;
    if not found then continue; end if;
    if (select count(*) from public.party_hunt_roster_log l
         where l.party_id = p_party and l.user_id = v_so.user_id and l.slot = v_so.slot
           and l.event = 'drop'
           and l.day_key = public.hr_utc_day_key(now())) >= c_max_drops_day then
      continue;
    end if;
    select * into v_st from public.player_state
     where user_id = v_so.user_id and slot = v_so.slot
       for update skip locked;
    if not found then continue; end if;
    if v_st.active_kind is distinct from c_channel then continue; end if;
    if v_st.accrued_to is null
       or v_st.accrued_to <= coalesce(v_so.drop_mark, '-infinity'::timestamptz)
       or v_st.accrued_to > p_window_to then
      continue;
    end if;
    v_cap_ms := coalesce(public.hr_offline_cap_ms(v_so.user_id, v_so.slot), 0);
    if v_cap_ms <= 0 then continue; end if;
    --  (h) STILL IN THE COHORT (2026-10-14): a rejoin may not put an un-owned
    --      character back on the combat channel's party path ((3a) would end
    --      the hunt at the next fire).
    if not exists (select 1 from public.hr_tick_ownership o
                    where o.user_id = v_so.user_id and o.slot = v_so.slot
                      and o.channel = c_channel and o.owned) then
      continue;
    end if;
    --  (i) THEIR HORIZON ADMITS THE NEXT WINDOW (2026-10-14): the rejoiner's
    --      own R + cap reaches past this window's end + one flush, so a
    --      horizon drop rejoins only after a REAL return moved R, and a rejoin
    --      can never step a member past their own horizon.
    select a.real_return_at into v_anchor from public.hr_return_anchor a
     where a.user_id = v_so.user_id and a.slot = v_so.slot;
    if v_anchor is null
       or p_window_to + make_interval(secs => coalesce(v_cfg.flush_seconds, 90))
          > v_anchor + v_cap_ms * interval '1 millisecond' then
      continue;
    end if;
    select count(*) into v_own_n from public.hr_tick_ownership o
     where o.user_id = v_so.user_id and o.slot = v_so.slot;
    select count(*) into v_got from (
      select 1 from public.hr_tick_ownership o
       where o.user_id = v_so.user_id and o.slot = v_so.slot
         for update skip locked) s;
    if v_got <> v_own_n then continue; end if;
    update public.hr_tick_ownership
       set lease_until = now() - interval '1 hour', updated_at = now()
     where user_id = v_so.user_id and slot = v_so.slot
       and lease_until is not null and lease_until > now() - interval '1 hour';
    update public.player_state
       set accrued_to = p_window_to, version = version + 1, updated_at = now()
     where user_id = v_so.user_id and slot = v_so.slot;
    insert into public.party_hunt_roster_log
      (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, member_mark, cap_ms, hunters)
    values (public.hr_utc_day_key(now()), p_party, v_hunt.id, v_so.user_id, v_so.slot,
            'rejoin', 'returned', p_window_to, v_st.accrued_to, v_cap_ms,
            v_n + jsonb_array_length(v_rejoin) + 1);
    v_rejoin := v_rejoin || jsonb_build_array(jsonb_build_object('user', v_so.user_id, 'slot', v_so.slot));
  end loop;

  return jsonb_build_object('ok', true, 'mode', 'armed', 'paid', true,
    'party', p_party, 'window_to', p_window_to, 'members', v_n, 'rejoined', v_rejoin);
end $function$;

-- ── §3 hr_party_hunt_start — THE COHORT AT THE DOOR ─────────────────────────
do $mig$
declare
  v_def text;
  v_md5 text;
  c_old constant text := $anc$  -- ══ S-11's PREDICATE, AT THE OTHER DOOR$anc$;
  c_new constant text := $anc$  -- ══ ★ THE M4 COHORT (2026-10-14-world-tick-m4-party-horizon.sql) ════════
  -- The tick pays the combat channel only for characters it OWNS
  -- (hr_tick_ownership, operator-written). A hunt with a member outside that
  -- cohort would be ended by hr_party_tick_settle (3a) at its first armed fire,
  -- so it is refused here by name instead, under the party lock (membership is
  -- stable), BEFORE the key is claimed, with nothing written. The member is
  -- named only in the server-side journal, never to the client (Security E2).
  select m.user_id, m.slot into v_m
    from public.party_member m
   where m.party_id = v_pid and m.left_at is null
     and not exists (select 1 from public.hr_tick_ownership o
                      where o.user_id = m.user_id and o.slot = m.slot
                        and o.channel = 'combat' and o.owned)
   order by m.user_id, m.slot limit 1;
  if v_m.user_id is not null then
    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_not_in_cohort',
      jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot));
    return jsonb_build_object('ok', false, 'error', 'hunt_not_in_cohort'); end if;

  -- ══ S-11's PREDICATE, AT THE OTHER DOOR$anc$;
  v_n int;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)'::regprocedure;
  if v_md5 = 'a80439260c833f6aa6b4d771d896075a' then
    raise notice 'hr_party_hunt_start already carries the cohort gate — patch skipped'; return; end if;
  v_def := replace(pg_get_functiondef(
    'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)'::regprocedure), chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then
    raise exception 'PRECONDITION: hr_party_hunt_start anchor appears % time(s), expected exactly 1', v_n;
  end if;
  execute replace(v_def, c_old, c_new);
  raise notice 'hr_party_hunt_start patched: hunt_not_in_cohort';
end $mig$;

-- ── §4 hr_accrue_cap_ms — ONE BUDGET FOR EVERY ABSENCE, PARTIED INCLUDED ────
create or replace function public.hr_accrue_cap_ms(p_user uuid, p_slot integer)
 returns bigint
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  -- The engine's ACCRUE_MIN_MS (hr-accrue/accrual.js): under it an 'accrue'
  -- poll answers below_min_span and moves nothing.
  c_min_ms constant bigint := 60000;
  v_role   text;
  v_cap    bigint;
  v_st     public.player_state%rowtype;
  v_anchor timestamptz;
  v_left   bigint;
  v_out    jsonb;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_accrue_cap_ms: not callable by %', v_role using errcode = '42501';
  end if;
  -- ONE CAP SOURCE: the function the tick's (8c)/(8d) read.
  v_cap := coalesce(public.hr_offline_cap_ms(p_user, p_slot), 0);
  if v_cap <= 0 then return 0; end if;
  select * into v_st from public.player_state where user_id = p_user and slot = p_slot;
  if not found then return v_cap; end if;
  -- (2026-10-14, M4) THE PARTIED SHORT-CIRCUIT IS GONE. A partied character
  -- reads the same budget as anyone: the party (8d) pays it up to R + cap, so
  -- any accrue-shaped pricing of the same character must see what is left of
  -- that one budget, never a fresh raw cap.
  select a.real_return_at into v_anchor from public.hr_return_anchor a
   where a.user_id = p_user and a.slot = p_slot;
  if v_anchor is null then return v_cap; end if;

  -- What is left of THIS absence's budget: R + cap - accrued_to, which is
  -- min(absence, cap) - tick-paid once the engine also bounds by elapsed.
  v_left := floor(extract(epoch from (v_anchor + v_cap * interval '1 millisecond' - v_st.accrued_to)) * 1000)::bigint;
  if v_left >= c_min_ms then
    return least(v_cap, v_left);
  end if;
  if now() <= v_anchor + v_cap * interval '1 millisecond'
     -- A PARTIED character is never forfeited (invariant 8: its mark is the
     -- hunt's, and hr_party_tick_settle is its only writer while partied); it
     -- reads the floor below until the hunt drops or releases it.
     or public.hr_partied(p_user, p_slot) then
    -- At the line and still inside it (or partied): a moment of
    -- below_min_span, never 0 (0 is the engine's no_cap lockout for every verb).
    return greatest(v_left, 1);
  end if;

  -- THE FORFEIT: the absence's budget is spent and the player is back.
  v_out := public.hr_apply(p_user, p_slot, v_st.version,
             md5('hr-horizon-forfeit:' || p_user::text || ':' || p_slot::text || ':' || v_anchor::text)::uuid,
             jsonb_build_object(
               'accrued_to', to_jsonb(now()),
               'journal', jsonb_build_object('kind', 'accrue', 'intent', 'horizon_forfeit',
                 'meta', jsonb_build_object(
                   'anchor', v_anchor,
                   'horizon', v_anchor + v_cap * interval '1 millisecond',
                   'from', v_st.accrued_to,
                   'cap_ms', v_cap,
                   'forfeit_ms', floor(extract(epoch from (now() - v_st.accrued_to)) * 1000)::bigint))));
  -- 1 ms EITHER WAY (Security #5, defence in depth): the request that
  -- forfeited computed on a stale read, so it must not be handed a full cap to
  -- price with. The NEXT read sees accrued_to = R = now() and the full cap.
  return 1;
end $$;
comment on function public.hr_accrue_cap_ms(uuid, integer) is
  '2026-10-10 (presence horizon), 2026-10-14 (M4: no partied short-circuit). The accrue '
  'span''s cap: least(hr_offline_cap_ms, last real return + cap - accrued_to), for every '
  'character, partied included. When that is spent and now() is past the horizon it '
  'forfeits the absence itself (one hr_apply, intent horizon_forfeit, key derived from the '
  'anchor) and answers 1 ms — never for a partied character, whose mark is its hunt''s. '
  'hr_engine only.';

-- ── §5 A COMBAT-ARMED CONFIG CANNOT PUSH A STACK (Security ruling 3.1) ──────
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_combat_frame_ck') then
    alter table public.hr_tick_config add constraint hr_tick_config_combat_frame_ck check (
      coalesce(not ('combat' = any (armed_channels))
               or not (frame_keys && array['inventory', 'bank', 'equipment']::text[]), false));
  end if;
end $mig$;
comment on constraint hr_tick_config_combat_frame_ck on public.hr_tick_config is
  '2026-10-14 (M4, SEC_WORLD_TICK_ARM_2026-10-05 ruling 3.1): while combat is armed, '
  'frame_keys holds no inventory / bank / equipment key — the combat tick lowers food and '
  'ammo, and a pushed stack into a Math.max fold keeps what the tick ate. Lifted only by '
  'the full ABSOLUTE flip + monotonic frame gate (M5 inventory), in its own migration.';

-- ── §6 GRANTS — restated exactly as the chain left them (revoke first) ──────
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to hr_engine;
revoke execute on function public.hr_party_hunt_start(integer, text, text, jsonb, uuid) from public;
revoke execute on function public.hr_party_hunt_start(integer, text, text, jsonb, uuid)
  from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_party_hunt_start(integer, text, text, jsonb, uuid) to authenticated;
revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from public;
revoke execute on function public.hr_accrue_cap_ms(uuid, integer)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_accrue_cap_ms(uuid, integer) to hr_engine;

-- ── §7 SELF-CHECK (CLAUDE.md §4) — BY EXECUTION ─────────────────────────────
--   k0  the three installed bodies are this file's (md5); the partied
--       short-circuit is gone; (3a) < (3c) < CAS and (8c) < (8d) < hr_apply.
--       (That removing the insertions gives back the base bodies is the
--       guard's P-BASE arm: tests/world-tick-m4-party-horizon.mjs.)
--   kg  grants: settle + cap hr_engine only; start authenticated only;
--       hr_assert_grant_hygiene(true)
--   m1  ★ (3c) AWAY: a hunter past R + cap is DROPPED 'past_horizon' on the
--       probe, before the CAS; nothing paid, their player_state untouched; the
--       remaining two hunters' next window PAYS
--   m2  ★ (10) a horizon-dropped member whose own mark moved but whose R did
--       not is NOT rejoined; nor while out of the cohort; once a real return
--       has moved R and they are owned, they rejoin
--   m3  (3c) no anchor → dropped 'no_return_anchor'
--   m4  ★ (8d) a window ending past one member's horizon (inside the 60 s
--       skew) is refused whole, nothing paid; the same window ending AT now()
--       (inside the horizon) pays — the backstop bites only past the line
--   m5  ★ (3a) an un-owned hunter ENDS the hunt 'not_in_cohort': 3 stop rows,
--       nothing paid, no player_state moved
--   m6  SHADOW is untouched: nothing drops, nothing journalled
--   m7  ★ hr_accrue_cap_ms on a PARTIED character reads the horizon remainder
--       (not the raw cap) and, spent, answers 1 with NO forfeit write
--   m8  hr_party_hunt_start refuses hunt_not_in_cohort with nothing written;
--       owned, the same call is not refused for the cohort
--   m9  the frame CHECK refuses an inventory frame while combat is armed and
--       admits it while combat is not
--   m10 ★ THE GAME DESIGNER RULING (a), AWAY → RETURN: a hunter past R + cap
--       is DROPPED (not zero-earned, not paused): the hunt continues for the
--       live hunters, a split naming the dropped member is refused, the live
--       two are paid, and the dropped member's own return reads exactly
--       max(0, min(absence, cap) - tick-paid). (m2 is the ATTENDED half: after
--       a real return the rejoin pays no back pay and carries hp / recovery /
--       falls over unchanged.)
--   m11 the 3/day drop clamp holds a returned member out of the rejoin
-- Every fixture row is discarded by a sentinel raise (HR950); a leak check
-- runs after it; the config row is read back.
do $mig$
declare
  v_a   constant uuid := '00000000-0000-4000-c000-0000f7a01401';
  v_b   constant uuid := '00000000-0000-4000-c000-0000f7a01402';
  v_c   constant uuid := '00000000-0000-4000-c000-0000f7a01403';
  c_h   constant text := 'hr1014-m4-selfcheck';
  c_cap constant interval := interval '12 hours';
  v_settle text; v_start text; v_cap text; v_base text;
  v_cact text; v_party uuid; v_hunt uuid; v_mark timestamptz; v_to timestamptz;
  v_r jsonb; v_members jsonb; v_l0 bigint; v_n bigint; v_v bigint; v_v2 bigint;
  v_en boolean; v_ch text[]; v_ar text[]; v_fk text[];
  v_en2 boolean; v_ch2 text[]; v_ar2 text[]; v_fk2 text[];
  v_caught boolean;
  r record;
begin
  -- ── k0
  select replace(p.prosrc, chr(13), '') into v_settle from pg_proc p
   where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure;
  select replace(p.prosrc, chr(13), '') into v_start from pg_proc p
   where p.oid = 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)'::regprocedure;
  select replace(p.prosrc, chr(13), '') into v_cap from pg_proc p
   where p.oid = 'public.hr_accrue_cap_ms(uuid,integer)'::regprocedure;
  if md5(v_settle) is distinct from 'c9a30a9e70be9e98ab4b823a3b1f2084' then
    raise exception 'm4-party-horizon self-check k0: installed hr_party_tick_settle md5 is %, expected c9a30a9e70be9e98ab4b823a3b1f2084', md5(v_settle); end if;
  if md5(v_start) is distinct from 'a80439260c833f6aa6b4d771d896075a' then
    raise exception 'm4-party-horizon self-check k0: installed hr_party_hunt_start md5 is %, expected a80439260c833f6aa6b4d771d896075a', md5(v_start); end if;
  if md5(v_cap) is distinct from '626637b7892eb85eccf34862ba82013a' then
    raise exception 'm4-party-horizon self-check k0: installed hr_accrue_cap_ms md5 is %, expected 626637b7892eb85eccf34862ba82013a', md5(v_cap); end if;
  if strpos(v_cap, 'if public.hr_partied(p_user, p_slot) then return v_cap; end if;') > 0 then
    raise exception 'm4-party-horizon self-check k0: hr_accrue_cap_ms still short-circuits a partied character to the raw cap'; end if;
  -- The (8d) backstop sits after (8c) and before the fan-out's hr_apply.
  if not (strpos(v_settle, $q$'error', 'fenced_cap', 'mode', 'armed', 'paid', false$q$)
          < strpos(v_settle, $q$then 'no_return_anchor' else 'past_horizon' end$q$)
      and strpos(v_settle, $q$then 'no_return_anchor' else 'past_horizon' end$q$)
          < strpos(v_settle, 'v_out := public.hr_apply(v_mu, v_ms')
      and strpos(v_settle, $q$'stop', 'not_in_cohort'$q$) > 0
      and strpos(v_settle, $q$'stop', 'not_in_cohort'$q$) < strpos(v_settle, $q$then 'past_horizon'$q$)
      and strpos(v_settle, $q$then 'past_horizon'$q$) < strpos(v_settle, '(5a) ★ THE CAS, AT PARTY GRAIN')) then
    raise exception 'm4-party-horizon self-check k0: the (3a)/(3c)/(8d) blocks are not in order (cohort, drop, CAS, 8c, 8d, hr_apply)'; end if;

  -- ── kg
  if has_function_privilege('anon', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('hr_tick', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute') then
    raise exception 'm4-party-horizon self-check kg: hr_party_tick_settle is not hr_engine-only'; end if;
  if has_function_privilege('anon', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute')
     or has_function_privilege('hr_tick', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute') then
    raise exception 'm4-party-horizon self-check kg: hr_accrue_cap_ms is not hr_engine-only'; end if;
  if has_function_privilege('anon', 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)', 'execute')
     or has_function_privilege('hr_tick', 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)', 'execute') then
    raise exception 'm4-party-horizon self-check kg: hr_party_hunt_start is not authenticated-only'; end if;
  perform public.hr_assert_grant_hygiene(true);

  select enabled, channels, armed_channels, frame_keys into v_en, v_ch, v_ar, v_fk
    from public.hr_tick_config where id;
  if not found then raise exception 'm4-party-horizon self-check: hr_tick_config has no row'; end if;

  begin
    -- ── THE FIXTURE: three owned combat hunters at one mark, combat armed.
    perform set_config('hr.frame_origin', '', true);
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'],
           frame_keys = array['state','skills','buffs','place'] where id;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'm4-party-horizon self-check: hr_activities has no combat row'; end if;
    v_mark := date_trunc('second', now()) - interval '5 minutes';
    v_to   := v_mark + interval '90 seconds';
    insert into auth.users (id) values (v_a), (v_b), (v_c) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since, consec_falls)
    select u, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 0
      from unnest(array[v_a, v_b, v_c]) u;
    insert into public.hr_return_anchor (user_id, slot, real_return_at)
    select u, 0, now() - interval '1 hour' from unnest(array[v_a, v_b, v_c]) u
    on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    select u, 0, 'combat', true from unnest(array[v_a, v_b, v_c]) u
    on conflict (user_id, slot, channel) do update set owned = true;
    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_party, v_a, 0, 'leader', now() - interval '3 hours'),
           (v_party, v_b, 0, 'member', now() - interval '2 hours'),
           (v_party, v_c, 0, 'member', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_mark)
      returning id into v_hunt;
    insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
    values (v_party, true, c_h, now() + interval '5 minutes')
    on conflict (party_id) do update set owned = true, lease_holder = c_h, lease_until = now() + interval '5 minutes';
    if (select count(*) from public.party_hunt_roster_log where hunt_id = v_hunt) <> 0 then
      raise exception 'm4-party-horizon self-check: fixture hunt already has journal rows'; end if;

    -- ── m1 (3c): B is past R + cap. The probe (a stale window) drops B first.
    begin
      update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 hour'
       where user_id = v_b and slot = 0;
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      if v_r->>'error' is distinct from 'member_sat_out'
         or jsonb_array_length(v_r->'dropped') <> 1
         or (v_r#>>'{dropped,0,user}')::uuid is distinct from v_b
         or v_r#>>'{dropped,0,reason}' is distinct from 'past_horizon'
         or (v_r->>'hunters')::int <> 2 then
        raise exception 'm4-party-horizon self-check m1: a hunter past R + cap was not dropped past_horizon on the probe: %', v_r; end if;
      if not exists (select 1 from public.party_hunt_roster_log
                      where hunt_id = v_hunt and user_id = v_b and event = 'drop' and reason = 'past_horizon')
         or (select version from public.player_state where user_id = v_b and slot = 0) <> 1
         or (select accrued_to from public.player_state where user_id = v_b and slot = 0) is distinct from v_mark then
        raise exception 'm4-party-horizon self-check m1: the horizon drop was not journalled, or it wrote B''s player_state'; end if;

      -- The two remaining hunters' next window PAYS.
      select count(*) into v_l0 from public.player_ledger where user_id in (v_a, v_b, v_c);
      v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', 1,
                       'delta', jsonb_build_object('gold', 3, 'accrued_to', v_to,
                         'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                           'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                             'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000,
                               'xp_bp', 5000, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                      from unnest(array[v_a, v_c]) u);
      -- ── m2 (10): B's own mark moved (their solo path priced them), R did not.
      --    Written under the tick's marker so the stamp trigger leaves R alone.
      perform set_config('hr.frame_origin', 'tick', true);
      update public.player_state set accrued_to = v_mark + interval '30 seconds'
       where user_id = v_b and slot = 0;
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
      reset role;
      if coalesce(v_r->>'ok', 'false') <> 'true' or coalesce(v_r->>'paid', 'false') <> 'true' then
        raise exception 'm4-party-horizon self-check m1: the two remaining hunters were not paid after the drop: %', v_r; end if;
      select count(*) into v_n from public.player_ledger where user_id in (v_a, v_b, v_c);
      if v_n <= v_l0
         or not exists (select 1 from public.player_ledger where user_id = v_a and meta->>'src' = 'tick')
         or not exists (select 1 from public.player_ledger where user_id = v_c and meta->>'src' = 'tick')
         or exists (select 1 from public.player_ledger where user_id = v_b)
         or (select gold from public.player_state where user_id = v_b and slot = 0) <> 500 then
        raise exception 'm4-party-horizon self-check m1: the paid window did not journal the two hunters (and only them)'; end if;
      if jsonb_array_length(coalesce(v_r->'rejoined', '[]'::jsonb)) <> 0 then
        raise exception 'm4-party-horizon self-check m2: a member past their horizon REJOINED without a real return: %', v_r; end if;
      -- A real return moves R — but B has left the cohort: still no rejoin.
      update public.hr_return_anchor set real_return_at = now() where user_id = v_b and slot = 0;
      update public.hr_tick_ownership set owned = false where user_id = v_b and slot = 0 and channel = 'combat';
      v_members := (select jsonb_agg(jsonb_set(jsonb_set(m, '{version}', to_jsonb(ps.version)),
                                               '{delta,accrued_to}', to_jsonb(v_to + interval '90 seconds')))
                      from jsonb_array_elements(v_members) m
                      join public.player_state ps on ps.user_id = (m->>'user')::uuid and ps.slot = 0);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_to, v_to + interval '90 seconds', gen_random_uuid(), v_members);
      reset role;
      if coalesce(v_r->>'paid', 'false') <> 'true'
         or jsonb_array_length(coalesce(v_r->'rejoined', '[]'::jsonb)) <> 0 then
        raise exception 'm4-party-horizon self-check m2: a member outside the cohort REJOINED: %', v_r; end if;
      -- Back in the cohort; the next paid window rejoins B — WITH NO BACK PAY
      -- and carrying over hp / recovery / falls (Game Designer ruling (a)).
      update public.hr_tick_ownership set owned = true where user_id = v_b and slot = 0 and channel = 'combat';
      update public.player_state set hp = 4, consec_falls = 2,
             recovering_until = date_trunc('second', now()) + interval '10 minutes'
       where user_id = v_b and slot = 0;
      select count(*) into v_l0 from public.player_ledger where user_id = v_b;
      v_members := (select jsonb_agg(jsonb_set(jsonb_set(m, '{version}', to_jsonb(ps.version)),
                                               '{delta,accrued_to}', to_jsonb(v_to + interval '180 seconds')))
                      from jsonb_array_elements(v_members) m
                      join public.player_state ps on ps.user_id = (m->>'user')::uuid and ps.slot = 0);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_to + interval '90 seconds', v_to + interval '180 seconds',
               gen_random_uuid(), v_members);
      reset role;
      if coalesce(v_r->>'paid', 'false') <> 'true'
         or jsonb_array_length(coalesce(v_r->'rejoined', '[]'::jsonb)) <> 1
         or (v_r#>>'{rejoined,0,user}')::uuid is distinct from v_b then
        raise exception 'm4-party-horizon self-check m2: after a real return B was not rejoined: %', v_r; end if;
      if (select jsonb_build_array(hp, consec_falls, recovering_until, gold, accrued_to)
            from public.player_state where user_id = v_b and slot = 0)
         is distinct from jsonb_build_array(4, 2, date_trunc('second', now()) + interval '10 minutes', 500,
                                            v_to + interval '180 seconds')
         or (select count(*) from public.player_ledger where user_id = v_b) <> v_l0 then
        raise exception 'm4-party-horizon self-check m2: the rejoin back-paid, healed, or reset recovery/falls (ruling (a): no back pay, carry-over)'; end if;
      raise exception using errcode = 'HR951', message = 'm1/m2 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m3 (3c): C has no anchor.
    begin
      delete from public.hr_return_anchor where user_id = v_c and slot = 0;
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      if v_r->>'error' is distinct from 'member_sat_out'
         or (v_r#>>'{dropped,0,user}')::uuid is distinct from v_c
         or v_r#>>'{dropped,0,reason}' is distinct from 'no_return_anchor' then
        raise exception 'm4-party-horizon self-check m3: a hunter with no anchor was not dropped no_return_anchor: %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm3 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m10 ★ THE RULING, AWAY THEN RETURN (Game Designer (a), per-member drop):
    --    B's horizon passed 1 min ago while the party mark is 5 min old. B is
    --    dropped, NOT zero-earned and NOT paused: the hunt goes on for A and C,
    --    a declared set still naming B is refused (no split ever covers a
    --    dropped member), and B's own return reads exactly
    --    max(0, min(absence, cap) - tick-paid) = R + cap - mark = 4 min.
    begin
      update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 minute'
       where user_id = v_b and slot = 0;
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      if v_r->>'error' is distinct from 'member_sat_out' or v_r#>>'{dropped,0,reason}' is distinct from 'past_horizon'
         or (select ended_at from public.party_hunt where id = v_hunt) is not null
         or public.hr_partied(v_b, 0) or not public.hr_partied(v_a, 0) then
        raise exception 'm4-party-horizon self-check m10: the horizon did not DROP B while the hunt continued: %', v_r; end if;
      v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', 1,
                       'delta', jsonb_build_object('gold', 3, 'accrued_to', v_to,
                         'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                           'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                             'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 3334,
                               'xp_bp', 3334, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                      from unnest(array[v_a, v_b, v_c]) u);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
      reset role;
      if v_r->>'why' is distinct from 'the declared member set is not the live member set' then
        raise exception 'm4-party-horizon self-check m10: a split naming the dropped member was not refused: %', v_r; end if;
      v_members := (select jsonb_agg(m) from jsonb_array_elements(v_members) m where (m->>'user')::uuid <> v_b);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
      v_n := public.hr_accrue_cap_ms(v_b, 0);
      reset role;
      if coalesce(v_r->>'paid', 'false') <> 'true' or (v_r->>'members')::int <> 2 then
        raise exception 'm4-party-horizon self-check m10: the live hunters were not paid after the drop (a pause): %', v_r; end if;
      if (select gold from public.player_state where user_id = v_b and slot = 0) <> 500
         or v_n <> floor(extract(epoch from ((now() - c_cap - interval '1 minute') + c_cap - v_mark)) * 1000)::bigint then
        raise exception 'm4-party-horizon self-check m10: the dropped member''s return reads % ms, not min(absence, cap) - tick-paid', v_n; end if;
      raise exception using errcode = 'HR951', message = 'm10 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m11 THE 3/DAY CLAMP: B dropped three times today does not rejoin,
    --    even returned, owned and inside their horizon.
    begin
      update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 hour'
       where user_id = v_b and slot = 0;
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      insert into public.party_hunt_roster_log (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
      select public.hr_utc_day_key(now()), v_party, v_hunt, v_b, 0, 'drop', 'past_horizon', v_mark, 43200000, 2
        from generate_series(1, 2);
      perform set_config('hr.frame_origin', 'tick', true);
      update public.player_state set accrued_to = v_mark + interval '30 seconds' where user_id = v_b and slot = 0;
      update public.hr_return_anchor set real_return_at = now() where user_id = v_b and slot = 0;
      v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', 1,
                       'delta', jsonb_build_object('gold', 3, 'accrued_to', v_to,
                         'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                           'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                             'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000,
                               'xp_bp', 5000, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                      from unnest(array[v_a, v_c]) u);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
      reset role;
      if coalesce(v_r->>'paid', 'false') <> 'true'
         or jsonb_array_length(coalesce(v_r->'rejoined', '[]'::jsonb)) <> 0 then
        raise exception 'm4-party-horizon self-check m11: a member dropped 3 times today REJOINED (the 3/day clamp): %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm11 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m4 (8d): A's horizon is 20 s from now. A window ending 40 s from now
    --    (inside the 60 s skew) is refused whole; one ending now() pays.
    begin
      update public.hr_return_anchor set real_return_at = now() - c_cap + interval '20 seconds'
       where user_id = v_a and slot = 0;
      select count(*) into v_l0 from public.player_ledger where user_id in (v_a, v_b, v_c);
      v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', 1,
                       'delta', jsonb_build_object('gold', 3, 'accrued_to', now() + interval '40 seconds',
                         'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                           'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                             'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 3334,
                               'xp_bp', 3334, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                      from unnest(array[v_a, v_b, v_c]) u);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, now() + interval '40 seconds',
               gen_random_uuid(), v_members);
      reset role;
      select count(*) into v_n from public.player_ledger where user_id in (v_a, v_b, v_c);
      if v_r->>'error' is distinct from 'past_horizon' or (v_r#>>'{member,user}')::uuid is distinct from v_a
         or v_n <> v_l0
         or (select accrued_to from public.party_hunt where id = v_hunt) is distinct from v_mark then
        raise exception 'm4-party-horizon self-check m4: a window ending past one member''s horizon was not refused whole: %', v_r; end if;
      v_members := (select jsonb_agg(jsonb_set(m, '{delta,accrued_to}', to_jsonb(now())))
                      from jsonb_array_elements(v_members) m);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, now(), gen_random_uuid(), v_members);
      reset role;
      if coalesce(v_r->>'paid', 'false') <> 'true' then
        raise exception 'm4-party-horizon self-check m4: the same window ending inside every horizon was refused (the backstop over-refuses): %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm4 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m5 (3a): C leaves the cohort. The probe ENDS the hunt.
    begin
      update public.hr_tick_ownership set owned = false
       where user_id = v_c and slot = 0 and channel = 'combat';
      select count(*) into v_l0 from public.player_ledger where user_id in (v_a, v_b, v_c);
      select coalesce(sum(version), 0) into v_v from public.player_state where user_id in (v_a, v_b, v_c);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      select count(*) into v_n from public.player_ledger where user_id in (v_a, v_b, v_c);
      select coalesce(sum(version), 0) into v_v2 from public.player_state where user_id in (v_a, v_b, v_c);
      if v_r->>'error' is distinct from 'party_hunt_ended' or v_r->>'why' is distinct from 'not_in_cohort'
         or (v_r#>>'{not_owned,0,user}')::uuid is distinct from v_c
         or (select stopped_by from public.party_hunt where id = v_hunt) is distinct from 'not_in_cohort'
         or (select count(*) from public.party_hunt_roster_log
              where hunt_id = v_hunt and event = 'stop' and reason = 'not_in_cohort' and hunters = 0) <> 3
         or v_n <> v_l0 or v_v2 <> v_v then
        raise exception 'm4-party-horizon self-check m5: an un-owned hunter did not end the hunt cleanly: %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm5 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m6: SHADOW — B past the horizon, nothing drops, nothing journalled.
    begin
      update public.hr_tick_config set armed_channels = '{}' where id;
      update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 hour'
       where user_id = v_b and slot = 0;
      update public.hr_tick_ownership set owned = false
       where user_id = v_c and slot = 0 and channel = 'combat';
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
               gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
      reset role;
      if v_r->>'error' is distinct from 'party_window_already_settled'
         or exists (select 1 from public.party_hunt_roster_log where hunt_id = v_hunt)
         or (select ended_at from public.party_hunt where id = v_hunt) is not null then
        raise exception 'm4-party-horizon self-check m6: SHADOW dropped, ended or journalled: %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm6 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m7: the cap read on a PARTIED character. R = now - 10 h, mark = now - 5 min.
    begin
      if not public.hr_partied(v_a, 0) then
        raise exception 'm4-party-horizon self-check m7: fixture A is not partied'; end if;
      update public.hr_return_anchor set real_return_at = now() - interval '10 hours'
       where user_id = v_a and slot = 0;
      set local role hr_engine;
      v_n := public.hr_accrue_cap_ms(v_a, 0);
      reset role;
      if v_n is null or v_n >= 43200000
         or v_n <> floor(extract(epoch from ((now() - interval '10 hours') + c_cap - v_mark)) * 1000)::bigint then
        raise exception 'm4-party-horizon self-check m7: a partied character read % ms, not its horizon remainder (the raw cap is the short-circuit)', v_n; end if;
      -- Spent: R + cap is an hour ago. 1 ms, and NO forfeit write.
      update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 hour'
       where user_id = v_a and slot = 0;
      select count(*) into v_l0 from public.player_ledger where user_id = v_a;
      set local role hr_engine;
      v_n := public.hr_accrue_cap_ms(v_a, 0);
      reset role;
      if v_n <> 1
         or (select version from public.player_state where user_id = v_a and slot = 0) <> 1
         or (select accrued_to from public.player_state where user_id = v_a and slot = 0) is distinct from v_mark
         or (select count(*) from public.player_ledger where user_id = v_a) <> v_l0 then
        raise exception 'm4-party-horizon self-check m7: a spent PARTIED character read % or was forfeited (invariant 8)', v_n; end if;
      raise exception using errcode = 'HR951', message = 'm7 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m8: the start gate. End the fixture hunt; C is un-owned.
    begin
      update public.party_hunt set ended_at = now(), stopped_by = 'gate' where id = v_hunt;
      update public.hr_tick_ownership set owned = false
       where user_id = v_c and slot = 0 and channel = 'combat';
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      delete from public.hr_rate_counters where user_id in (v_a, v_b, v_c);
      v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, gen_random_uuid());
      if v_r is distinct from jsonb_build_object('ok', false, 'error', 'hunt_not_in_cohort')
         or (select count(*) from public.party_hunt where party_id = v_party and ended_at is null) <> 0 then
        raise exception 'm8: a start with an un-owned member answered % (or wrote a hunt)', v_r; end if;
      if not exists (select 1 from public.hr_rejections where user_id = v_a and slot = 0
                       and code = 'hunt_not_in_cohort' and intent = 'party_hunt_start') then
        raise exception 'm8: the cohort refusal was not journalled'; end if;
      update public.hr_tick_ownership set owned = true
       where user_id = v_c and slot = 0 and channel = 'combat';
      v_r := public.hr_party_hunt_start(0, v_cact, 'steady', '{}'::jsonb, gen_random_uuid());
      if v_r->>'error' = 'hunt_not_in_cohort' then
        raise exception 'm8: an all-owned party was refused for the cohort: %', v_r; end if;
      raise exception using errcode = 'HR951', message = 'm8 done';
    exception when sqlstate 'HR951' then null;
    end;

    -- ── m9: the frame CHECK.
    begin
      v_caught := false;
      begin
        update public.hr_tick_config set frame_keys = array['state','inventory'] where id;
      exception when check_violation then v_caught := true;
      end;
      if not v_caught then
        raise exception 'm9: combat armed with an inventory frame key was ADMITTED'; end if;
      update public.hr_tick_config set armed_channels = array['gather'], frame_keys = array['state','inventory'] where id;
      v_caught := false;
      begin
        update public.hr_tick_config set armed_channels = array['gather','combat'] where id;
      exception when check_violation then v_caught := true;
      end;
      if not v_caught then
        raise exception 'm9: arming combat under an inventory frame key was ADMITTED'; end if;
      raise exception using errcode = 'HR951', message = 'm9 done';
    exception when sqlstate 'HR951' then null;
    end;

    raise exception using errcode = 'HR950', message = 'm4-party-horizon §7 complete — rolling back';
  exception when sqlstate 'HR950' then null;
  end;

  select enabled, channels, armed_channels, frame_keys into v_en2, v_ch2, v_ar2, v_fk2
    from public.hr_tick_config where id;
  if v_en2 is distinct from v_en or v_ch2 is distinct from v_ch or v_ar2 is distinct from v_ar
     or v_fk2 is distinct from v_fk then
    raise exception 'm4-party-horizon self-check: hr_tick_config was not restored'; end if;
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.hr_return_anchor where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.hr_tick_ownership where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.party where leader_user = v_a)
     or exists (select 1 from public.hr_rejections where user_id in (v_a, v_b, v_c))
     or exists (select 1 from auth.users where id in (v_a, v_b, v_c)) then
    raise exception 'm4-party-horizon self-check: §7 LEAKED a probe row'; end if;

  raise notice 'm4-party-horizon self-check PASSED: k0 bodies pinned, (8d) between (8c) and hr_apply; kg grants; '
               'm1 a hunter past R + cap is dropped past_horizon and the rest are paid; m2 no rejoin without a real '
               'return, rejoin after one; m3 no anchor drops; m4 a window ending past a horizon is refused whole and '
               'the same window inside it pays; m5 an un-owned hunter ends the hunt, nothing paid; m6 shadow '
               'untouched; m7 a partied cap read is the horizon remainder and never forfeits; m8 the start gate '
               'refuses an un-owned member; m9 combat armed cannot push an inventory frame';
end $mig$;
