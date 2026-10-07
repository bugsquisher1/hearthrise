-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-world-tick-party-fences.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half
-- (edge freeze). Applies AFTER 2026-10-07-world-tick-armed-cap.sql (APPLIED
-- 2026-10-06 23:29 UTC), whose two live bodies §0 measures.
--
-- TWO ITEMS LEFT BY THE SECURITY REVIEW OF armed-cap @651dccdb
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, appended verdict):
--
-- F2b (before the gather cohort widens). The ARMED stall sentinel false-alarms
--    while its player is ONLINE. 10-05 17:20-21:20 UTC, QA slot 2 gathered
--    online: 250 client accrue rows (kind 'gather', no meta.src) and 0 tick
--    windows, because the tick waits 90 s of build-up and an online client
--    settles first. Armed, `armed_stalled` would have read true for ~2 h, and
--    the operator's answer to that is a KILL nobody needed.
-- M4 blocker. hr_party_tick_settle (combat-only) carries neither of the solo
--    settle's armed fences: (8b) raw accrued_to within 24 h, (8c) accrued_to
--    within hr_offline_cap_ms of the window's end. Armed combat would pay a
--    party catch-up of up to 24 h where accrue pays at most the cap (F1 again,
--    at party grain).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_stall_status, restated from LIVE (prosrc md5 b633aca7, the
--    armed-cap body) with ONE delta, in the ARMED sentinel only: a character
--    with a NON-tick ledger row of the channel's ledger kind inside the judged
--    window [p_now - p_hours, p_now) is not a sentinel. Such a row is a client
--    accrue settle, i.e. the player was online and the tick rightly stood
--    aside. A real stall (rostered, no tick row and no client settle for the
--    whole window) keeps its sentinel and still reads STALLED. The bucket
--    counts, the unarmed (shadow) verdict and every key of the answer are
--    unchanged.
-- §2 hr_party_tick_settle, restated from LIVE (prosrc md5 7c5a0097: the
--    channel-arm body + the frame-emit marker splice) with ONE delta, steps
--    (8b)(8c), on the ARMED branch only (after the shadow branch has returned,
--    before the hr_apply fan-out), PER MEMBER on that member's own row (locked
--    FOR UPDATE at (4)(5b)) and that member's own server cap:
--      hr_tick_admit(false, accrued_to, null) <> 'admit'      → 'fenced_24h'
--      cap <= 0 (NULL fails closed) or
--      accrued_to < greatest(now(), p_window_to) - cap          → 'fenced_cap'
--    WHOLE-WINDOW REFUSAL, NEVER A SKIPPED MEMBER: the members' deltas are one
--    split computed from every contributor, so paying three while the fourth
--    is fenced is S-9's partial settle (a share minted from a contributor
--    nobody paid). It returns before ANY write, like every refusal above it;
--    the hunt is NOT ended (a fence is not a member fault).
--
-- ── ERROR TAXONOMY (hr_party_tick_settle, new) ─────────────────────────────
--   fenced_24h   a member's locked accrued_to is not inside 24 h
--                {ok:false, mode:'armed', paid:false, channel, party, member:{user,slot},
--                 accrued_to, admission}
--   fenced_cap   a member's locked accrued_to is more than that member's
--                hr_offline_cap_ms before the window's end, or the cap is 0
--                {ok:false, mode:'armed', paid:false, channel, party, member, accrued_to, cap_ms}
--   The edge already counts any ok:false as `refused` with its error as the
--   reason; no edge change (edge freeze holds).
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
-- NOTHING HERE MOVES VALUE OR ADDS A DOOR. §2 only ADDS a refusal ahead of
-- hr_apply, on locked rows and the server's cap (no argument can move either);
-- §1 is a read that can only WITHHOLD a verdict for a character with fresh
-- client settles (direction: fewer false KILLs; a real stall keeps its
-- sentinel). No table, column, policy or client surface; both grant sets are
-- restated exactly (§3) and `hr_assert_grant_hygiene(true)` runs strict (§4).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- §1: per armed-sentinel candidate, one NOT EXISTS on player_ledger_user_idx
--     (user_id, slot, at desc), a 2 h range of that character's rows (~80 at
--     the attended cadence). Operator/cron call, not per player.
-- §2: per ARMED party settle, <= 4 one-row re-reads of already-locked rows and
--     <= 4 hr_offline_cap_ms calls (a one-row clan lookup each).
--
-- KNOWN LIMITATIONS
--   · A party past the smallest member cap is refused every fire until a member
--     stops the hunt (hr_party_hunt_stop / leave), after which each member's
--     own accrue pays min(absence, cap); while the hunt is live a member's own
--     accrue answers party_settle_required. Same shape as the solo fence; loud
--     (`refused`/`fenced_cap`). Ending the hunt on a fence, or capping in
--     hr_party_roster, is a follow-up design call.
--   · F2b judges by ledger evidence: a player who settled online at any point in
--     the window is not a sentinel for that window, so a stall that begins while
--     they are online is judged once their rows age out (<= p_hours later), or
--     sooner through any other sentinel.
--
-- REVERSIBILITY: re-apply 2026-10-07-world-tick-armed-cap.sql §2 (stall) and
-- 2026-10-06-world-tick-channel-arm.sql §5 + the frame-emit §3b splice (party)
-- — all `create or replace`, same signatures and grants. Not while combat is
-- armed: reversing §2 then re-opens the party catch-up.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE BODIES BEING RESTATED ARE THE ONES MEASURED LIVE ──
-- Each must be the live one (first apply) or this file's own (second apply).
-- Anything else means another file moved it, and restating over it would
-- silently drop that change.
do $$
declare
  v_party text;
  v_stall text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_party
    from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)');
  select md5(replace(p.prosrc, chr(13), '')) into v_stall
    from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_stall_status(timestamp with time zone,integer,integer)');
  if v_party is null or v_party not in ('7c5a009735e7f0ed330bfbaf114172a2', '2aa22e7d25379ed4e5d75e0802488358') then
    raise exception 'PRECONDITION: hr_party_tick_settle prosrc md5 is %, expected the live 7c5a0097 '
                    '(channel-arm + frame-emit marker) or this file''s 2aa22e7d25379ed4e5d75e0802488358. Re-cut this file against the live body.', v_party;
  end if;
  if v_stall is null or v_stall not in ('b633aca7d32ceba2c05587848baa2abc', '5bad87a19c5b14b1a5f39e559d251435') then
    raise exception 'PRECONDITION: hr_tick_stall_status prosrc md5 is %, expected the live b633aca7 '
                    '(armed-cap) or this file''s 5bad87a19c5b14b1a5f39e559d251435. Re-cut this file against the live body.', v_stall;
  end if;
  if to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: hr_offline_cap_ms or hr_tick_admit is absent.';
  end if;
end $$;

-- ── §1 hr_tick_stall_status (F2b) ──────────────────────────────────────────
create or replace function public.hr_tick_stall_status(p_now timestamp with time zone DEFAULT now(), p_hours integer DEFAULT 2, p_min_rows_per_hour integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_cfg      public.hr_tick_config%rowtype;
  v_hours    int := least(greatest(coalesce(p_hours, 2), 1), 48);
  v_min      int := greatest(coalesce(p_min_rows_per_hour, 30), 1);
  v_buckets  jsonb;
  v_stalled  boolean;
  -- THE CHANNELS UNDER WATCH (2026-10-06, SEC_WORLD_TICK_CHANNEL_ARM_2026-10-05
  -- C2): every channel the tick owns that is NOT armed. Its windows land in
  -- hr_tick_shadow; an armed channel's land in player_ledger and are not
  -- counted here.
  v_armed    text[];
  v_unarmed  text[];
  v_sentinel boolean;
  v_judged   boolean;
  -- THE ARMED CHANNELS, JUDGED TOO (2026-10-07, SEC_GATHER_ARM_RUNBOOK F2).
  v_ch       text;
  v_kind     text;
  v_asent    boolean;
  v_ajudged  boolean;
  v_astall   boolean;
  v_abuckets jsonb;
  v_arm      jsonb   := '[]'::jsonb;
  v_any_aj   boolean := false;
  v_any_as   boolean := false;
begin
  select * into v_cfg from public.hr_tick_config where id;
  v_armed   := coalesce(v_cfg.armed_channels, '{}'::text[]);
  v_unarmed := coalesce(array(select ch from unnest(v_cfg.channels) ch
                               where not (ch = any (v_armed)) order by ch), '{}'::text[]);

  -- WHO SHOULD HAVE BEEN WRITING SHADOW ROWS. With NOTHING armed every
  -- rostered fire rostered a shadow channel, so `rostered_fires` is that
  -- evidence by itself (the rule exactly as 2026-09-28 stated it). Once a
  -- channel is armed, a rostered fire may have rostered ONLY armed
  -- characters, and the fire log does not say which: an empty combat channel
  -- would read as a combat stall while gather pays. The evidence is then a
  -- SENTINEL — a character the roster admits in shadow on an unarmed channel
  -- (owned, on that channel, not partied, shadow-admitted by hr_tick_admit),
  -- whose activity has been unchanged since before the judged window opened
  -- (`active_since`, stamped only on a restart). No sentinel = no verdict,
  -- never a stall. Read only while something is armed; the scan is the
  -- cron admission counter's own cohort, bounded by `owned`.
  v_sentinel := cardinality(v_armed) = 0 or exists (
    select 1
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
     where o.owned
       and o.channel = ps.active_kind
       and o.channel = any (v_unarmed)
       and ps.active_since <= p_now - make_interval(hours => v_hours)
       and not public.hr_partied(o.user_id, o.slot)
       and public.hr_tick_admit(false, ps.accrued_to,
             greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))) = 'admit');

  v_judged := coalesce(v_cfg.enabled, false) and cardinality(v_unarmed) > 0 and v_sentinel;

  with b as (
    select g as i,
           p_now - make_interval(hours => g + 1) as lo,
           p_now - make_interval(hours => g)     as hi
      from generate_series(0, v_hours - 1) g
  )
  select jsonb_agg(jsonb_build_object(
           'from', b.lo, 'to', b.hi,
           'rostered_fires', (select count(*) from public.hr_tick_cron_log l
                               where l.at >= b.lo and l.at < b.hi
                                 and l.outcome = 'posted' and l.rostered >= 1),
           -- UNARMED channels' rows only. With nothing armed that is every row,
           -- as before; with gather armed it is combat's (and any other
           -- unarmed channel's), so the combat shadow is still watched.
           'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                               where s.at >= b.lo and s.at < b.hi
                                 and not (s.channel = any (v_armed))),
           'edge', (select jsonb_build_object(
                             'refused', coalesce(sum((l.detail#>>'{edge,refused}')::int), 0),
                             'shadowed', coalesce(sum((l.detail#>>'{edge,shadowed}')::int), 0),
                             'top_reason', (select l2.detail#>>'{edge,top_reason}'
                                              from public.hr_tick_cron_log l2
                                             where l2.at >= b.lo and l2.at < b.hi
                                               and l2.detail#>>'{edge,top_reason}' is not null
                                             group by 1 order by count(*) desc, 1 limit 1))
                      from public.hr_tick_cron_log l
                     where l.at >= b.lo and l.at < b.hi and l.detail ? 'edge'))
           order by b.i)
    into v_buckets
    from b;

  -- JUDGED PER UNARMED CHANNEL SET (2026-10-06, C2). The 2026-10-06
  -- channel-arm file stopped judging the moment ANY channel armed, so the
  -- combat shadow M3/M4 measure would go unwatched while gather pays.
  v_stalled := v_judged
    and not exists (select 1 from jsonb_array_elements(v_buckets) e
                     where (e->>'rostered_fires')::int < 1
                        or (e->>'shadow_rows')::int >= v_min);

  -- ── THE ARMED CHANNELS (2026-10-07, SEC_GATHER_ARM_RUNBOOK_2026-10-06 F2).
  --    Everything above judges UNARMED channels only, so the moment gather
  --    arms, a gather stall is silent. The same two-hour invariant, per ARMED
  --    channel: STALLED when EVERY bucket had >= 1 rostered fire AND fewer
  --    than v_min windows of that channel, a window being EITHER an armed
  --    tick payment (player_ledger, meta.src = 'tick', the channel's ledger
  --    kind) OR a shadow row of that channel. Counting both keeps the arm
  --    boundary honest: the hours before an arm are shadow rows, the hours
  --    after are ledger rows, and a disarm reads the same way back; either
  --    table alone would call a healthy transition a stall.
  --    THE SENTINEL is the unarmed rule's, on the ARMED fence: owned, on this
  --    channel, unpartied, its activity unchanged since before the judged
  --    window opened, raw `accrued_to` inside 24 h. A stalled tick leaves
  --    `accrued_to` aging, so a 2 h stall keeps its sentinel. No sentinel =
  --    no verdict, never a stall. A character with a CLIENT settle of this
  --    kind in the window is not a sentinel (F2b, 2026-10-08: online).
  --    LEDGER KIND: an artisan window journals as 'craft'
  --    (player_ledger_kind_check); every other channel journals as itself.
  --    COST: player_ledger's primary key is (at, id), so each bucket is a
  --    one-hour index range; at 100x (200 armed gatherers at 40 windows/h)
  --    that is ~16k rows read per call.
  --    NOT FOLDED INTO `judged`: that key keeps meaning "the unarmed shadow
  --    is watched" (the arm file's S2 reads it). `stalled`/`ok` are the
  --    union of both verdicts; `shadow_stalled` is the old verdict, verbatim.
  foreach v_ch in array coalesce(array(select distinct a from unnest(v_armed) a
                                        where a = any (coalesce(v_cfg.channels, '{}'::text[]))
                                        order by a), '{}'::text[]) loop
    v_kind := case v_ch when 'artisan' then 'craft' else v_ch end;
    v_asent := exists (
      select 1
        from public.hr_tick_ownership o
        join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
       where o.owned
         and o.channel = v_ch
         and ps.active_kind = v_ch
         and ps.active_since <= p_now - make_interval(hours => v_hours)
         and not public.hr_partied(o.user_id, o.slot)
         and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit'
         -- ★ F2b (2026-10-08): NOT A SENTINEL WHILE ONLINE. A non-tick ledger
         --   row of this channel's kind inside the judged window is a client
         --   accrue settle: the player was online, and an online client
         --   settles before the tick's 90 s build-up, so zero tick windows is
         --   the tick working, not a stall (10-05: 250 such rows, 0 windows,
         --   ~2 h of false armed_stalled). A real stall leaves no client row
         --   either, so its sentinel stays. player_ledger_user_idx range.
         and not exists (
               select 1 from public.player_ledger pl
                where pl.user_id = o.user_id and pl.slot = o.slot
                  and pl.at >= p_now - make_interval(hours => v_hours)
                  and pl.at < p_now
                  and pl.kind = v_kind
                  and pl.meta->>'src' is distinct from 'tick'));
    v_ajudged := coalesce(v_cfg.enabled, false) and v_asent;
    with b as (
      select g as i,
             p_now - make_interval(hours => g + 1) as lo,
             p_now - make_interval(hours => g)     as hi
        from generate_series(0, v_hours - 1) g
    )
    select jsonb_agg(jsonb_build_object(
             'from', b.lo, 'to', b.hi,
             'rostered_fires', (select count(*) from public.hr_tick_cron_log l
                                 where l.at >= b.lo and l.at < b.hi
                                   and l.outcome = 'posted' and l.rostered >= 1),
             'tick_rows',      (select count(*) from public.player_ledger pl
                                 where pl.at >= b.lo and pl.at < b.hi
                                   and pl.kind = v_kind and pl.meta->>'src' = 'tick'),
             'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                                 where s.at >= b.lo and s.at < b.hi and s.channel = v_ch))
             order by b.i)
      into v_abuckets
      from b;
    v_astall := v_ajudged
      and not exists (select 1 from jsonb_array_elements(v_abuckets) e
                       where (e->>'rostered_fires')::int < 1
                          or (e->>'tick_rows')::int + (e->>'shadow_rows')::int >= v_min);
    v_arm := v_arm || jsonb_build_array(jsonb_build_object(
      'channel', v_ch, 'ledger_kind', v_kind, 'sentinel', v_asent,
      'judged', v_ajudged, 'stalled', v_astall, 'buckets', v_abuckets));
    v_any_aj := v_any_aj or v_ajudged;
    v_any_as := v_any_as or v_astall;
  end loop;

  return jsonb_build_object(
    'ok', not (v_stalled or v_any_as),
    'stalled', v_stalled or v_any_as,
    'judged', v_judged,
    'shadow_stalled', v_stalled,
    'armed_judged', v_any_aj,
    'armed_stalled', v_any_as,
    'armed', v_arm,
    'mode', case when not coalesce(v_cfg.enabled, false) then 'off'
                 when cardinality(v_armed) = 0 then 'shadow'
                 when cardinality(v_unarmed) = 0 then 'armed' else 'partial' end,
    'armed_channels', to_jsonb(v_armed),
    'watched_channels', to_jsonb(v_unarmed),
    'sentinel', v_sentinel,
    'hours', v_hours, 'min_rows_per_hour', v_min, 'at', p_now,
    'buckets', v_buckets);
end $$;

-- ── §2 hr_party_tick_settle (M4: the armed fences, per member) ─────────────
create or replace function public.hr_party_tick_settle(p_holder text, p_party uuid, p_window_from timestamp with time zone, p_window_to timestamp with time zone, p_intent_id uuid, p_members jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
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
    'consec_falls','deaths','progress','hearthfind','tool_carry','journal'];
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
  select count(*) into v_live from public.party_member
   where party_id = p_party and left_at is null;
  select count(distinct (pm.user_id, pm.slot)) into v_matched
    from jsonb_array_elements(p_members) e
    join public.party_member pm
      on pm.party_id = p_party and pm.left_at is null
     and pm.user_id = (e.value->>'user')::uuid
     and pm.slot    = (e.value->>'slot')::int;
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

  return jsonb_build_object('ok', true, 'mode', 'armed', 'paid', true,
    'party', p_party, 'window_to', p_window_to, 'members', v_n);
end $$;

-- ── §3 GRANTS — restated EXACTLY as the chain left them (revoke first) ──────
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to hr_engine;

-- ── §4 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Every settle runs as `hr_engine`, exactly as the edge issues it.
--   k0  the installed bodies are the ones this file states (md5); the party
--       settle keeps its tick marker, and fenced_24h < fenced_cap < hr_apply(
--       sit after the shadow branch
--   p1  ★ armed combat party, 2 members, marks 25 h old → fenced_24h; zero
--       ledger rows, versions/gold/marks unmoved, hunt NOT ended
--   p2  ★ marks 13 h old; member A's cap 15 h (clan level 7), member B's 12 h
--       → fenced_cap naming B with B's cap (each member's OWN cap), nothing moved
--   p3  a fresh party window pays both members, the party mark moves
--   p4  marks (12 h - 1 h) old pay (inside the smallest cap)
--   p5  SHADOW unchanged: combat unarmed, hunt mark 25 h old on a current
--       shadow chain → journals in shadow, zero ledger rows
--   s1  ★ F2b: gather armed, 2 h rostered, zero gather tick windows, the only
--       gather sentinel settled ONLINE in the window → no armed verdict, no stall
--   s2  ★ a second, offline gather character (10 tick rows: under the floor)
--       → judged, STALLED (a real stall is still caught, the online player's
--       accrue rows still are not tick windows)
--   s3  the online player's rows aged out of the window → it is a sentinel
--       again → STALLED; a non-tick row of ANOTHER kind does not unseat it
--   kg  grants exact; the detector passes STRICT
--   kr  the config switches this block flipped are restored and read back
-- Planted history sits at instants no real row occupies (2011-2013). All probe
-- rows are rolled back by the sentinel exception.
do $$
declare
  v_pa     uuid := '00000000-0000-4000-8000-0000000d1081';  -- sorts first: clan level 7, cap 15 h
  v_pb     uuid := '00000000-0000-4000-8000-0000000d1082';  -- no clan, cap 12 h
  v_ug     uuid := '00000000-0000-4000-8000-0000000d1083';  -- gather, online
  v_ug2    uuid := '00000000-0000-4000-8000-0000000d1084';  -- gather, offline
  c_h      constant text := 'hr1008-selfcheck';
  v_cact   text;
  v_gact   text;
  v_clan   uuid;
  v_party  uuid;
  v_hunt   uuid;
  v_capa   bigint;
  v_capb   bigint;
  v_mark   timestamptz;
  v_to     timestamptz;
  v_r      jsonb;
  v_mem    jsonb;
  v_l0     bigint;
  v_n      bigint;
  v_snap   text;
  v_at     timestamptz;
  v_cfg_en boolean;
  v_cfg_ch text[];
  v_cfg_ar text[];
  v_en     boolean;
  v_ch     text[];
  v_ar     text[];
  r        record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure)
         <> '2aa22e7d25379ed4e5d75e0802488358'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_stall_status(timestamptz,int,int)'::regprocedure)
         <> '5bad87a19c5b14b1a5f39e559d251435' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if (select count(*) from pg_proc p
         where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure
           and position($m$set_config('hr.frame_origin', 'tick', true)$m$ in p.prosrc) > 0
           and position('fenced_24h' in p.prosrc) > position('if v_shadow then' in p.prosrc)
           and position('fenced_cap' in p.prosrc) > position('fenced_24h' in p.prosrc)
           and position('v_out := public.hr_apply(' in p.prosrc) > position('fenced_cap' in p.prosrc)) <> 1 then
      raise exception 'k0b: hr_party_tick_settle lost its tick marker, or the fences are not between the shadow branch and hr_apply';
    end if;

    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'] where id;

    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    if v_cact is null or v_gact is null then
      raise exception 'k-fixture: hr_activities lacks a combat or gather row';
    end if;
    insert into auth.users (id) values (v_pa), (v_pb), (v_ug), (v_ug2) on conflict do nothing;
    insert into public.clans (name, created_by, level) values ('hr1008 selfcheck', v_pa, 7)
      returning id into v_clan;
    insert into public.clan_members (clan_id, user_id) values (v_clan, v_pa);
    v_capa := public.hr_offline_cap_ms(v_pa, 0);
    v_capb := public.hr_offline_cap_ms(v_pb, 0);
    if v_capb is distinct from 12 * 3600000::bigint or v_capa is distinct from 15 * 3600000::bigint then
      raise exception 'k-fixture: caps are A % / B % ms; the arms below need A 15 h, B 12 h', v_capa, v_capb;
    end if;

    v_mark := date_trunc('second', now()) - interval '25 hours';
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_pa, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00'),
           (v_pb, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00'),
           (v_ug, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '5 minutes',
            'gather', v_gact, '2000-01-01 00:00:00+00'),
           (v_ug2, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '5 minutes',
            'gather', v_gact, '2000-01-01 00:00:00+00');
    insert into public.party (leader_user, leader_slot) values (v_pa, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role)
    values (v_party, v_pa, 0, 'leader'), (v_party, v_pb, 0, 'member');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_mark)
      returning id into v_hunt;
    insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
    values (v_party, true, c_h, now() + interval '5 minutes')
    on conflict (party_id) do update set owned = true, lease_holder = c_h, lease_until = now() + interval '5 minutes';

    -- ── p1: marks 25 h old, armed → fenced_24h, nothing moved
    select count(*) into v_l0 from public.player_ledger where user_id in (v_pa, v_pb);
    select string_agg(user_id::text || gold || '/' || version || '/' || accrued_to, ',' order by user_id)
      into v_snap from public.player_state where user_id in (v_pa, v_pb);
    v_to := v_mark + interval '90 seconds';
    v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
         'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
           'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
             'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
               'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000, 'xp_bp', 5000,
                 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
         order by ps.user_id)
         from public.player_state ps where ps.user_id in (v_pa, v_pb) and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, '00000000-0000-4000-8000-0000000d1101', v_mem);
    reset role;
    if v_r->>'error' is distinct from 'fenced_24h' or v_r->>'mode' is distinct from 'armed'
       or (v_r#>>'{member,user}')::uuid is distinct from v_pa then
      raise exception 'p1: an armed party window from a 25 h mark was not refused fenced_24h: %', v_r;
    end if;
    select count(*) - v_l0 into v_n from public.player_ledger where user_id in (v_pa, v_pb);
    if v_n <> 0
       or (select string_agg(user_id::text || gold || '/' || version || '/' || accrued_to, ',' order by user_id)
             from public.player_state where user_id in (v_pa, v_pb)) is distinct from v_snap
       or (select ended_at is not null or accrued_to <> v_mark from public.party_hunt where id = v_hunt) then
      raise exception 'p1b: the fenced_24h refusal moved something (ledger +%)', v_n;
    end if;

    -- ── p2: marks 13 h old; A's cap 15 h admits, B's 12 h does not → whole window refused, naming B
    v_mark := date_trunc('second', now()) - interval '13 hours';
    update public.party_hunt set accrued_to = v_mark where id = v_hunt;
    update public.player_state set accrued_to = v_mark where user_id in (v_pa, v_pb);
    select string_agg(user_id::text || gold || '/' || version || '/' || accrued_to, ',' order by user_id)
      into v_snap from public.player_state where user_id in (v_pa, v_pb);
    v_to := v_mark + interval '90 seconds';
    v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
         'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
           'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
             'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
               'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000, 'xp_bp', 5000,
                 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
         order by ps.user_id)
         from public.player_state ps where ps.user_id in (v_pa, v_pb) and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, '00000000-0000-4000-8000-0000000d1102', v_mem);
    reset role;
    if v_r->>'error' is distinct from 'fenced_cap' or (v_r#>>'{member,user}')::uuid is distinct from v_pb
       or (v_r->>'cap_ms')::bigint is distinct from v_capb then
      raise exception 'p2: a 13 h party mark with a 12 h member was not refused fenced_cap naming that member: %', v_r;
    end if;
    select count(*) - v_l0 into v_n from public.player_ledger where user_id in (v_pa, v_pb);
    if v_n <> 0
       or (select string_agg(user_id::text || gold || '/' || version || '/' || accrued_to, ',' order by user_id)
             from public.player_state where user_id in (v_pa, v_pb)) is distinct from v_snap
       or (select ended_at is not null or accrued_to <> v_mark from public.party_hunt where id = v_hunt) then
      raise exception 'p2b: the fenced_cap refusal moved something (ledger +%)', v_n;
    end if;

    -- ── p3: a fresh window pays both members; p4: (12 h - 1 h) pays
    foreach v_mark in array array[date_trunc('second', now()) - interval '300 seconds',
                                  date_trunc('second', now()) - interval '11 hours'] loop
      update public.party_hunt set accrued_to = v_mark where id = v_hunt;
      update public.player_state set accrued_to = v_mark where user_id in (v_pa, v_pb);
      v_to := v_mark + interval '90 seconds';
      select count(*) into v_l0 from public.player_ledger where kind = 'combat' and intent = 'accrue' and user_id in (v_pa, v_pb);
      v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
           'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
             'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                 'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000, 'xp_bp', 5000,
                   'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
           order by ps.user_id)
           from public.player_state ps where ps.user_id in (v_pa, v_pb) and ps.slot = 0);
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_mem);
      reset role;
      select count(*) - v_l0 into v_n from public.player_ledger where kind = 'combat' and intent = 'accrue' and user_id in (v_pa, v_pb);
      if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed'
         or v_n <> 2
         or (select accrued_to from public.party_hunt where id = v_hunt) is distinct from v_to
         or exists (select 1 from public.player_state where user_id in (v_pa, v_pb) and accrued_to <> v_to) then
        raise exception 'p3/p4: a party window from a mark % old did not pay both members (ledger +%): %',
          now() - v_mark, v_n, v_r;
      end if;
    end loop;

    -- ── p5: SHADOW unchanged — combat unarmed, hunt mark 25 h on a current chain
    update public.hr_tick_config set armed_channels = '{}' where id;
    v_mark := date_trunc('second', now()) - interval '25 hours';
    update public.party_hunt set accrued_to = v_mark where id = v_hunt;
    update public.player_state set accrued_to = v_mark where user_id in (v_pa, v_pb);
    update public.party_tick_lease set shadow_accrued_to = date_trunc('second', now()) - interval '2 minutes'
     where party_id = v_party;
    v_mark := date_trunc('second', now()) - interval '2 minutes';
    v_to := v_mark + interval '30 seconds';
    select count(*) into v_l0 from public.player_ledger where user_id in (v_pa, v_pb);
    v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
         'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
           'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
             'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
               'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000, 'xp_bp', 5000,
                 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
         order by ps.user_id)
         from public.player_state ps where ps.user_id in (v_pa, v_pb) and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, '00000000-0000-4000-8000-0000000d1105', v_mem);
    reset role;
    select count(*) - v_l0 into v_n from public.player_ledger where user_id in (v_pa, v_pb);
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'shadow'
       or (v_r->>'journalled')::int <> 2 or v_n <> 0 then
      raise exception 'p5: a SHADOW party window on a current chain over a 25 h mark did not journal in shadow: % (ledger +%)', v_r, v_n;
    end if;

    -- ── s1-s3: F2b. Gather armed; v_ug and v_ug2 are owned gatherers since 2000,
    --           raw mark 5 min old, unpartied. v_ug2 starts NOT owned.
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_ug, 0, 'gather', true, c_h, now() + interval '5 minutes'),
           (v_ug2, 0, 'gather', false, c_h, now() + interval '5 minutes');
    v_at := '2011-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    -- v_ug ONLINE: 79 client accrue rows (kind gather, no meta.src) across the window.
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'gather', 'accrue', jsonb_build_object('qty', 1), v_at - make_interval(secs => g * 90)
      from generate_series(1, 79) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not false or (v_r->>'armed_stalled')::boolean is not false
       or (v_r#>>'{armed,0,sentinel}')::boolean is not false then
      raise exception 's1: the only gather sentinel was ONLINE (client accrue rows in the window), yet an armed verdict was given: %', v_r;
    end if;
    -- s2: an offline gatherer, 10 tick rows in 2 h (under the 30/h floor) → STALLED
    update public.hr_tick_ownership set owned = true where user_id = v_ug2;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug2, 0, 'gather', 'accrue', jsonb_build_object('src', 'tick', 'qty', 1), v_at - make_interval(secs => g * 700)
      from generate_series(1, 10) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not true or (v_r->>'armed_stalled')::boolean is not true
       or (v_r->>'stalled')::boolean is not true then
      raise exception 's2: an offline gatherer under the floor beside an online one was not judged STALLED: %', v_r;
    end if;
    update public.hr_tick_ownership set owned = false where user_id = v_ug2;
    -- s3 (2012): v_ug's client rows are all older than the window → sentinel → STALLED;
    --     (2013): a non-tick row of ANOTHER kind inside the window does not unseat it.
    v_at := '2012-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'gather', 'accrue', jsonb_build_object('qty', 1), v_at - interval '2 hours' - make_interval(secs => g * 90)
      from generate_series(1, 40) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not true or (v_r->>'armed_stalled')::boolean is not true then
      raise exception 's3a: client rows older than the window still unseated the sentinel: %', v_r;
    end if;
    v_at := '2013-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'craft', 'accrue', jsonb_build_object('qty', 1), v_at - make_interval(secs => g * 90)
      from generate_series(1, 79) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not true or (v_r->>'armed_stalled')::boolean is not true then
      raise exception 's3b: a non-tick row of another kind unseated the gather sentinel: %', v_r;
    end if;

    -- ── kg: grants exact
    for r in
      select f, role, want from (values
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_engine', true),
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_tick',   false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_engine', false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_tick',   false)) t(f, role, want)
      union all
      select f, c.role, false from (values
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'),
        ('public.hr_tick_stall_status(timestamptz,int,int)')) t(f)
      cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) c(role)
    loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, r.f, 'execute') is distinct from r.want then
          raise exception 'kg: % EXECUTE on % is %, expected %', r.role, r.f,
            has_function_privilege(r.role, r.f, 'execute'), r.want;
        end if;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr: the switches this block flipped, restored and read back
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    select armed_channels, enabled, channels into v_ar, v_en, v_ch from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_ch is distinct from v_cfg_ch then
      raise exception 'kr: hr_tick_config was not restored — armed %/% enabled %/% channels %/%',
        v_ar, v_cfg_ar, v_en, v_cfg_en, v_ch, v_cfg_ch;
    end if;

    raise exception 'HR1008P_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1008P_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-party-fences: EXECUTED — an armed party window is refused fenced_24h at 25 h and '
               'fenced_cap past a member''s OWN cap with nothing moved, fresh and in-cap windows pay both '
               'members, the shadow branch journals; an ONLINE gather sentinel gives no armed verdict, an '
               'offline one under the floor is STALLED, aged-out or other-kind rows do not unseat it; '
               'grants exact, hygiene strict — all green';
end $$;
