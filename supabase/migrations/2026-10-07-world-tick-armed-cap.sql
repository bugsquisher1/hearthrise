-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-07-world-tick-armed-cap.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half.
-- MUST BE APPLIED BEFORE 2026-10-07-world-tick-arm-gather.sql (the arm
-- runbook can then require `fenced_cap` in hr_tick_settle at its P4).
--
-- TWO SECURITY FINDINGS FROM docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md
--
-- F1 (economy, tradeable ore). An ARMED catch-up ignores the offline cap.
--    hr_tick_settle's armed fence (step 8b, 2026-10-06-world-tick-arm-guards
--    .sql) admits any raw `accrued_to` under 24 h, and nothing downstream
--    caps the span: hr_apply pays whatever delta the engine computed for
--    [p_window_from, p_window_to]. Measured on the live probe snapshot, a
--    20.8 h watermark paid 6,755 ore where accrue pays a capped 3,900.
--    WHERE THE WINDOW START IS CHOSEN: the roster returns `accrued_to` as the
--    next window's start (hr_tick_roster, M-1) and the edge (tick.js) settles
--    from it; the fence then requires p_window_from >= that mark. The ONE
--    place that can bound what is paid, whoever chose the start, is the
--    fence: it holds the player lock and reads the server's own cap. So the
--    fix is DB-only.
-- F2. hr_tick_stall_status stops judging a channel once it is armed, so a
--    gather stall after the arm would be silent (runbook V5 by hand only).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_settle, restated from LIVE (prosrc md5 8c5c5e8a: the
--    2026-10-06 arm-guards body + the 2026-10-07 frame-emit marker splice)
--    with ONE delta, step (8c), on the ARMED branch only, after (8b) and
--    before hr_apply:
--      v_cap_ms := coalesce(hr_offline_cap_ms(p_user, p_slot), 0)
--      v_cap_ms <= 0 or locked accrued_to < greatest(now(), p_window_to) - cap
--        → {ok:false, error:'fenced_cap', mode:'armed', channel, accrued_to, cap_ms}
--    Refused, never clipped: Postgres does not rescale an engine delta. Past
--    the cap the character is the accrue path's (as past 24 h today), and its
--    next real return pays min(absence, cap). PROPERTY: for any absence, the
--    armed tick pays at most min(absence, cap) of it, i.e. never more than
--    accrue would, whether as one span or as a chain dripping from an old
--    mark. The shadow branch is untouched.
-- §2 hr_tick_stall_status, restated from LIVE (md5 ef198d66) with ONE delta:
--    every ARMED channel is judged on the same two-hour invariant, counting
--    that channel's tick ledger rows (meta.src='tick', the channel's ledger
--    kind) plus its shadow rows against rostered fires, gated on an
--    armed-fence sentinel. The answer gains `shadow_stalled` (the old
--    verdict, verbatim), `armed_judged`, `armed_stalled`, `armed` (per
--    channel). `stalled`/`ok` become the union; `judged`, `watched_channels`,
--    `sentinel`, `mode` and `buckets` are unchanged in every term.
--
-- ── ERROR TAXONOMY (new) ────────────────────────────────────────────────────
--   fenced_cap   hr_tick_settle, armed branch: the locked raw accrued_to is
--                more than hr_offline_cap_ms before the window's end (or the
--                cap is 0). The edge counts it as a refusal by name, like
--                fenced_24h (tick.js settle(): any ok:false is `refused` with
--                its error as the reason); no edge change is needed.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
-- NOTHING HERE MOVES VALUE. §1 only ADDS a refusal ahead of hr_apply, reading
-- the locked row and the server's cap function (no argument can move either);
-- §2 is a read. No table, no column, no client surface, no new grant: both
-- functions keep their exact grant sets (§3), and `hr_assert_grant_hygiene(true)`
-- runs strict in §4.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- §1: one hr_offline_cap_ms call per ARMED settle (a one-row clan lookup).
-- §2: per armed channel, two one-hour ranges on player_ledger's (at, id)
-- primary key; ~16k rows at 200 armed gatherers. Called by an operator/cron,
-- not per player.
-- KNOWN LIMITATION: the roster still admits an armed character whose raw
-- mark is between its cap and 24 h old, so after a tick outage longer than the
-- cap the edge re-simulates and is refused for that character every fire
-- until it returns (or crosses 24 h). Bounded; counted as refused/fenced_cap.
-- Moving the cap into hr_tick_admit/hr_tick_roster is a follow-up.
--
-- REVERSIBILITY: re-apply 2026-10-06-world-tick-arm-guards.sql §1/§2 then the
-- frame-emit §3a splice (both `create or replace`, same signatures, same
-- grants). Not before a disarm: reversing §1 while gather is armed re-opens F1.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE BODIES BEING RESTATED ARE THE ONES MEASURED LIVE ──
-- Each body must be either the measured live one (first apply) or this
-- file's own (second apply). Anything else means another file moved it since
-- 2026-10-06, and restating over it would silently drop that change.
do $$
declare
  v_settle text;
  v_stall  text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_settle
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid = to_regprocedure('public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)');
  select md5(replace(p.prosrc, chr(13), '')) into v_stall
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid = to_regprocedure('public.hr_tick_stall_status(timestamp with time zone,integer,integer)');
  if v_settle is null or v_settle not in ('8c5c5e8a06f48ea439fbc9423f29f12d', 'e00dbf9fcdea8a7ccba33a20ae8ed64f') then
    raise exception 'PRECONDITION: hr_tick_settle prosrc md5 is %, expected the live 8c5c5e8a (arm-guards + '
                    'frame-emit marker) or this file''s e00dbf9fcdea8a7ccba33a20ae8ed64f. Re-cut this file against the live body.', v_settle;
  end if;
  if v_stall is null or v_stall not in ('ef198d66574570b9becaeda1fb8aacf4', 'b633aca7d32ceba2c05587848baa2abc') then
    raise exception 'PRECONDITION: hr_tick_stall_status prosrc md5 is %, expected the live ef198d66 or this '
                    'file''s b633aca7d32ceba2c05587848baa2abc. Re-cut this file against the live body.', v_stall;
  end if;
  if to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: hr_offline_cap_ms or hr_tick_admit is absent.';
  end if;
end $$;

-- ── §1 hr_tick_settle (F1) ──────────────────────────────────────────────────
create or replace function public.hr_tick_settle(p_holder text, p_user uuid, p_slot integer, p_channel text, p_version bigint, p_window_from timestamp with time zone, p_window_to timestamp with time zone, p_intent_id uuid, p_delta jsonb, p_shadow_state jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  c_skew      constant interval := interval '60 seconds';
  c_payable   constant text[]   := array['combat','gather','artisan'];
  -- The same ceiling §1's CHECK enforces and tick-contract.js declares. Checked
  -- HERE as well so the refusal has a tick-shaped NAME the driver can count,
  -- rather than a check_violation that aborts the batch's transaction.
  c_state_max constant int      := 16384;
  v_role      text;
  v_cfg       public.hr_tick_config%rowtype;
  v_st        public.player_state%rowtype;
  v_own       public.hr_tick_ownership%rowtype;
  -- THIS CHANNEL'S MODE (2026-10-06, ruling 5). Read at step (4b), UNDER the
  -- player and lease locks — never from v_cfg, which is read at step (1)
  -- for the kill switch and the channel list only.
  v_shadow    boolean;
  v_on        boolean;
  v_declared  timestamptz;
  v_mark      timestamptz;
  v_chain     jsonb;
  v_ins       int;
  v_out       jsonb;
  -- The character's offline cap, read at step (8c) (2026-10-07, F1).
  v_cap_ms    bigint;
begin
  -- ── (0) IDENTITY. Unchanged: the PRIMARY control is the GRANT in §3.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (0b) THIS TRANSACTION IS THE WORLD TICK. Transaction-local, read only
  --         by hr_frame_wanted, and it can only SUPPRESS a frame for a
  --         character with no live window (2026-10-07-frame-emit-online-only.sql).
  perform set_config('hr.frame_origin', 'tick', true);

  -- ── (1) THE KILL SWITCH, READ FIRST AND FAILING CLOSED. Unchanged.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;

  -- ── (2) ARGUMENTS ARE CLAMPED AND BOUND, NEVER TRUSTED. Unchanged, plus the
  --        three checks the tenth argument brings.
  if p_user is null or p_slot is null or p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_channel is null or not (p_channel = any (c_payable)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_payable');
  end if;
  if not (p_channel = any (v_cfg.channels)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_owned_by_tick');
  end if;
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  -- (The `shadow_state_while_armed` refusal moved to step (4b), 2026-10-06:
  --  the mode is per channel now and is read under the lease lock, so the
  --  refusal is decided on the same read that decides whether this pays.)
  if p_shadow_state is not null and jsonb_typeof(p_shadow_state) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_shadow_state');
  end if;
  if p_shadow_state is not null and octet_length(p_shadow_state::text) > c_state_max then
    return jsonb_build_object('ok', false, 'error', 'shadow_state_too_large',
      'bytes', octet_length(p_shadow_state::text), 'max', c_state_max);
  end if;
  if p_window_from is null or p_window_to is null or p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_window_to > now() + c_skew then
    return jsonb_build_object('ok', false, 'error', 'window_in_future',
      'skew_ms', floor(extract(epoch from (p_window_to - now())) * 1000));
  end if;
  v_declared := nullif(p_delta->>'accrued_to', '')::timestamptz;
  if v_declared is null or v_declared <> p_window_to then
    return jsonb_build_object('ok', false, 'error', 'window_delta_mismatch',
      'declared', v_declared, 'window_to', p_window_to);
  end if;

  -- ── (3) THE LOCK, TAKEN BEFORE ANY COMPARISON. Unchanged.
  select * into v_st from public.player_state
   where user_id = p_user and slot = p_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  -- ── (4) THE LEASE. Unchanged.
  select * into v_own from public.hr_tick_ownership
   where user_id = p_user and slot = p_slot and channel = p_channel for update;
  if not found or not v_own.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_own.lease_holder is distinct from p_holder
     or v_own.lease_until is null or v_own.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease',
      'holder', v_own.lease_holder, 'until', v_own.lease_until);
  end if;

  -- ── (4b) ★ THIS CHANNEL'S MODE, UNDER THE LEASE LOCK ★ (2026-10-06,
  --         SEC_WORLD_TICK_ARM_2026-10-05 ruling 5.3). `armed_channels` is the
  --         ONE arming authority; a channel absent from it is SHADOW. Read
  --         AFTER the player and lease locks, in a statement of its own, so
  --         the snapshot it reads is newer than both locks: every arm or kill
  --         committed before this character's lease was held is seen here.
  --         ⚠ DELIBERATELY NOT `for share`. The config row is also the
  --           driver's CURSOR row — hr_tick_cron_run updates it every fire —
  --           and share-lockers that keep overlapping starve a waiting
  --           UPDATE indefinitely in Postgres. At 100x the cohort that is the
  --           cron fire hanging on its own cursor. What the plain read gives
  --           up is bounded and stated: a settle that read "armed" before a
  --           kill commits may finish that ONE window (version-CAS'd,
  --           idempotent, computed by the engine — never an extra window).
  --           That is exactly the `enabled` switch's semantics at step (1).
  --         The kill switch is re-read on the same row: a stop that lands
  --         between step (1) and here refuses this settle.
  --         A missing row or a NULL fails SAFE: not enabled, nothing armed.
  select c.enabled, not coalesce(p_channel = any (c.armed_channels), false)
    into v_on, v_shadow
    from public.hr_tick_config c where c.id;
  if not found or not coalesce(v_on, false) then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;
  v_shadow := coalesce(v_shadow, true);
  -- ── ★ AN ARMED WINDOW MAY NOT CARRY A SHADOW STATE ★ (design constraint 2).
  --    REFUSED, not ignored, and still before hr_apply. Ignoring it would
  --    mean the branch that PAYS silently accepted an argument built for the
  --    branch that does not, which is precisely how a stale proposal gets
  --    believed by the writer. It is also the honest answer to an operator
  --    who arms THIS channel between the driver's watermark probe and its
  --    settle: that one settle is refused, loudly and countably, and the next
  --    fire runs armed with no carrier.
  if p_shadow_state is not null and not v_shadow then
    return jsonb_build_object('ok', false, 'error', 'shadow_state_while_armed',
      'channel', p_channel);
  end if;

  -- ── (5) THE POINTER MUST STILL BE WHERE THE ROSTER SAW IT. Unchanged.
  if v_st.active_kind is distinct from p_channel then
    return jsonb_build_object('ok', false, 'error', 'channel_moved',
      'active_kind', v_st.active_kind);
  end if;

  -- ── (6) ★ THE WATERMARK COMPARE-AND-SET ★ — unchanged in every term.
  v_mark := case when v_shadow
                 then greatest(v_st.accrued_to, coalesce(v_own.shadow_accrued_to, v_st.accrued_to))
                 else v_st.accrued_to end;

  -- ── THE CARRIER, ON THE REFUSAL THAT ALREADY CARRIES THE MARK (design 4).
  --    Computed HERE, under the same `for update` on the same two rows, from
  --    the locked `v_own` — so the state the driver reads is the state as of
  --    the mark it is told about, and there is no second read to race with.
  --    Handed back ONLY when the fence is actually CHAINING: in shadow, with a
  --    shadow mark that has moved PAST `accrued_to`. If a client accrue landed
  --    in the middle, `accrued_to` has caught up, `greatest` has picked it, and
  --    the carrier is stale by construction — so it is withheld and the driver
  --    re-seeds from `hr_state_of`, which is truth. Armed, it is never sent at
  --    all: the row has none (§9 clears it) and an armed window must not read
  --    one.
  v_chain := case
    when v_shadow
     and v_own.shadow_state is not null
     and v_own.shadow_accrued_to is not null
     and v_own.shadow_accrued_to > v_st.accrued_to
    then jsonb_build_object('shadow_state', v_own.shadow_state)
    else '{}'::jsonb end;

  if p_window_from < v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_from', p_window_from, 'accrued_to', v_mark, 'shadow', v_shadow, 'channel', p_channel)
      || v_chain;
  end if;
  if p_window_to <= v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_to', p_window_to, 'accrued_to', v_mark, 'shadow', v_shadow, 'channel', p_channel)
      || v_chain;
  end if;

  -- ── (7) THE VERSION. Unchanged.
  if p_version is null or p_version <> v_st.version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict',
      'held', p_version, 'current', v_st.version);
  end if;

  -- ── (8) SHADOW MODE. Journal what WOULD have been paid; pay nothing. There
  --        is still no hr_apply call on this branch and there must never be one.
  if v_shadow then
    -- The journal row is UNCHANGED and gains no column (design constraint 5):
    -- the delta, verbatim, so parity is measured against the object hr_apply
    -- would have received.
    with ins as (
      insert into public.hr_tick_shadow
        (user_id, slot, channel, holder, window_from, window_to, version,
         intent_id, delta, would_gold, would_qty, would_ticks)
      values
        (p_user, p_slot, p_channel, p_holder, p_window_from, p_window_to, p_version,
         p_intent_id, p_delta,
         coalesce((p_delta->>'gold')::bigint, 0),
         coalesce((p_delta#>>'{journal,meta,qty}')::bigint, 0),
         coalesce((p_delta#>>'{journal,meta,ticks}')::bigint, 0))
      on conflict (user_id, slot, intent_id) do nothing
      returning 1)
    select count(*) into v_ins from ins;

    -- ── CHAIN, AND ONLY IF SOMETHING WAS JOURNALLED. The watermark CAS above
    --    already refuses a replayed window on arithmetic, so a conflict here is
    --    unreachable by an honest caller — but if it were reached, moving the
    --    mark and overwriting the carrier for a window that produced NO journal
    --    row would advance the chain past a window nobody can ever read. The
    --    mark and the state move TOGETHER, in ONE statement, under the lock
    --    taken at (4): there is no instant in which one has moved and the other
    --    has not, and no second transaction can interleave between them.
    if v_ins > 0 then
      update public.hr_tick_ownership
         set shadow_accrued_to = p_window_to,
             shadow_state      = p_shadow_state,
             updated_at        = now()
       where user_id = p_user and slot = p_slot and channel = p_channel;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'shadow', 'channel', p_channel, 'paid', false,
      'window_to', p_window_to, 'journalled', v_ins > 0,
      'chained', v_ins > 0 and p_shadow_state is not null);
  end if;

  -- ── (8b) ★ AN ARMED WINDOW PAYS ONLY A CHARACTER THE RAW FENCE ADMITS ★
  --         (2026-10-06, SEC_WORLD_TICK_CHANNEL_ARM_2026-10-05 C1). The
  --         roster admits a SHADOW character on its shadow chain while its
  --         raw `accrued_to` is up to 7 d old. If an operator arms this
  --         channel between that roster read and this settle, the probe
  --         hands the edge the RAW mark and the window starts there — a
  --         window the armed roster (raw 24 h) would never have issued. It
  --         is refused HERE, under the player lock, on the locked
  --         `accrued_to`, before hr_apply: the accrue path owns a character
  --         past 24 h. The predicate is hr_tick_admit's shadow arm with no
  --         chain (`p_mark` NULL), i.e. raw `accrued_to` within 24 h; a 7 d
  --         expiry reads `shadow_expired` there and is refused the same way.
  if public.hr_tick_admit(false, v_st.accrued_to, null) <> 'admit' then
    return jsonb_build_object('ok', false, 'error', 'fenced_24h', 'mode', 'armed',
      'channel', p_channel, 'accrued_to', v_st.accrued_to,
      'admission', public.hr_tick_admit(false, v_st.accrued_to, null));
  end if;

  -- ── (8c) ★ AN ARMED WINDOW NEVER PAYS TIME THE OFFLINE CAP FORFEITS ★
  --         (2026-10-07, SEC_GATHER_ARM_RUNBOOK_2026-10-06 F1). The 24 h
  --         fence above admits a raw `accrued_to` up to 24 h old, but the
  --         accrue path pays the same absence at most hr_offline_cap_ms
  --         (12-15 h) and forfeits the rest. Measured on the live probe
  --         snapshot: a 20.8 h watermark paid 6,755 ore armed against
  --         accrue's capped 3,900. THE RULE: the LOCKED `accrued_to` lies
  --         within one cap of the window's end. Step (6) already holds
  --         p_window_from >= accrued_to, and step (2) p_window_to <= now() +
  --         60 s, so every armed window, whether one long span or a chain of
  --         short ones dripping forward from an old mark, pays at most `cap`
  --         of the absence: never more than accrue pays for it.
  --         REFUSED, NOT CLIPPED. The delta is the engine's, computed for
  --         [p_window_from, p_window_to]; Postgres never rescales it. Past
  --         the cap the character belongs to the accrue path (its next real
  --         return pays the capped grant and restamps `accrued_to`), exactly
  --         as past the 24 h fence. Nothing is written on this path.
  --         FAILS CLOSED: a NULL or zero cap pays nothing, which is accrue's
  --         own `no_cap` answer. The cap is the server's, read under the
  --         player lock; no argument of this call can move it.
  v_cap_ms := coalesce(public.hr_offline_cap_ms(p_user, p_slot), 0);
  if v_cap_ms <= 0
     or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then
    return jsonb_build_object('ok', false, 'error', 'fenced_cap', 'mode', 'armed',
      'channel', p_channel, 'accrued_to', v_st.accrued_to, 'cap_ms', v_cap_ms);
  end if;

  -- ── (9) ARMED. hr_apply, verbatim, as `hr_engine`. Unchanged.
  v_out := public.hr_apply(p_user, p_slot, p_version, p_intent_id, p_delta);
  if coalesce((v_out->>'ok')::boolean, false) then
    -- ARMED PAYMENTS CLEAR THE SHADOW MARK — AND NOW THE CARRIER WITH IT, in
    -- the same statement, for the same reason the mark is cleared: `accrued_to`
    -- is the authority again from here, and a stale carrier left lying around
    -- is a second source of truth nobody reads. That is how a state that is
    -- WRONG survives long enough to be believed the next time somebody
    -- re-enters shadow. Clearing one and not the other would be worse than
    -- clearing neither.
    update public.hr_tick_ownership
       set shadow_accrued_to = null, shadow_state = null, updated_at = now()
     where user_id = p_user and slot = p_slot and channel = p_channel;
  end if;
  return v_out || jsonb_build_object('mode', 'armed', 'channel', p_channel, 'paid',
    coalesce((v_out->>'ok')::boolean, false));
end $$;

-- ── §2 hr_tick_stall_status (F2) ───────────────────────────────────────────
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
  --    no verdict, never a stall.
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
         and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit');
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

-- ── §3 GRANTS — restated EXACTLY as the chain left them (revoke first) ──────
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) to hr_engine;

revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Every settle below runs as `hr_engine`, exactly as the edge issues it, so
-- the paying branch really pays and the refusals are measured on the rows.
--   k0  the bodies installed are the ones this file states (md5), and the
--       tick-origin marker and the fenced_24h refusal are still in the settle
--   k1  ★ F1: armed gather, raw accrued_to 20 h old (cap 12 h): the single
--       span [mark, now] is refused fenced_cap with cap_ms = the server's cap;
--       zero ledger rows, gold/version/accrued_to unmoved
--   k2  ★ F1, the drip: a 90 s window chained from the same 20 h mark is
--       refused fenced_cap too
--   k3  ★ F1: raw accrued_to (cap - 1 h) old: the span pays, and the paid
--       span (accrued_to's move) is <= cap: what accrue would pay for it
--   k4  the boundary: cap + 1 s old is refused fenced_cap
--   k5  a FRESH 90 s window pays, unchanged; 25 h still answers fenced_24h
--       first (8b precedes 8c)
--   k6  the SHADOW branch is untouched: unarmed combat, raw 20 h, current
--       chain → journals in shadow
--   k7  ★ F2 (planted at instants no real row occupies, 2001-2003): gather
--       armed with a sentinel, 2 h of rostered fires, zero gather windows →
--       armed STALLED and `stalled` true, while the combat shadow judge
--       (watching combat, not gather) reads not stalled; no gather sentinel →
--       no armed verdict; healthy tick ledger rows → ok; an arm boundary
--       (shadow rows then ledger rows) → ok; combat silent with gather paying
--       → shadow_stalled, armed ok; nothing armed → the 2026-10-06 shadow
--       verdict exactly, armed = []
--   k8  grants exact; the detector passes STRICT
--   k9  the config switches this block flipped are restored and read back
-- All probe rows are rolled back by the sentinel exception.
do $$
declare
  v_ug     uuid := '00000000-0000-4000-8000-0000000ca107';
  v_uc     uuid := '00000000-0000-4000-8000-0000000cb107';
  c_h      constant text := 'hr1007c-selfcheck';
  v_gact   text;
  v_cact   text;
  v_cap    bigint;
  v_r      jsonb;
  v_n      int;
  v_l0     int;
  v_mark   timestamptz;
  v_to     timestamptz;
  v_g      bigint;
  v_v      bigint;
  v_w      timestamptz;
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
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'hr_tick_settle') <> 'e00dbf9fcdea8a7ccba33a20ae8ed64f'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'hr_tick_stall_status') <> 'b633aca7d32ceba2c05587848baa2abc' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'hr_tick_settle'
           and position($m$set_config('hr.frame_origin', 'tick', true)$m$ in p.prosrc) > 0
           and position('fenced_24h' in p.prosrc) > 0
           and position('fenced_cap' in p.prosrc) > position('fenced_24h' in p.prosrc)
           and position('public.hr_apply(' in p.prosrc) > position('fenced_cap' in p.prosrc)) <> 1 then
      raise exception 'k0b: hr_tick_settle lost the tick marker or fenced_24h, or fenced_cap is not between 8b and hr_apply';
    end if;

    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}' where id;

    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_gact is null or v_cact is null then
      raise exception 'k-fixture: hr_activities lacks a gather or combat row';
    end if;
    insert into auth.users (id) values (v_ug), (v_uc) on conflict do nothing;
    v_cap := public.hr_offline_cap_ms(v_ug, 0);
    if coalesce(v_cap, 0) < 2 * 3600000 or v_cap > 20 * 3600000 then
      raise exception 'k-fixture: the fixture''s cap is % ms; the arms below need 2 h < cap <= 20 h', v_cap;
    end if;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_ug, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '20 hours',
            'gather', v_gact, '2000-01-01 00:00:00+00'),
           (v_uc, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '20 hours',
            'combat', v_cact, '2000-01-01 00:00:00+00');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until,
                                          shadow_accrued_to)
    values (v_ug, 0, 'gather', true, c_h, now() + interval '5 minutes', null),
           (v_uc, 0, 'combat', true, c_h, now() + interval '5 minutes',
            date_trunc('second', now()) - interval '2 minutes');
    update public.hr_tick_config set armed_channels = array['gather'] where id;

    -- ── k1: 20 h, one span to now
    select accrued_to, gold, version into v_mark, v_g, v_v from public.player_state where user_id = v_ug and slot = 0;
    select count(*) into v_l0 from public.player_ledger where user_id = v_ug;
    v_to := date_trunc('second', now());
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_to,
             '00000000-0000-4000-8000-0000000cc101',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_to),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 6755, 'ticks', 1))));
    reset role;
    if v_r->>'error' is distinct from 'fenced_cap' or v_r->>'mode' is distinct from 'armed'
       or v_r->>'channel' is distinct from 'gather' or (v_r->>'cap_ms')::bigint is distinct from v_cap then
      raise exception 'k1: an ARMED 20 h span was not refused fenced_cap with the server cap %: %', v_cap, v_r;
    end if;
    select count(*) - v_l0 into v_n from public.player_ledger where user_id = v_ug;
    select gold, version, accrued_to into v_g, v_v, v_w from public.player_state where user_id = v_ug and slot = 0;
    if v_n <> 0 or v_g <> 500 or v_v <> 1 or v_w is distinct from v_mark then
      raise exception 'k1b: the fenced_cap refusal moved the character (ledger +%, gold %, version %, accrued_to %)',
        v_n, v_g, v_v, v_w;
    end if;

    -- ── k2: the drip, 90 s from the same mark
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_mark + interval '90 seconds',
             '00000000-0000-4000-8000-0000000cc102',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '90 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if v_r->>'error' is distinct from 'fenced_cap' then
      raise exception 'k2: a 90 s window chained from a 20 h mark was not refused fenced_cap (the drip pays the whole gap): %', v_r;
    end if;

    -- ── k3: (cap - 1 h) old, one span to now: pays, and pays <= cap
    update public.player_state
       set accrued_to = date_trunc('second', now()) - (v_cap - 3600000) * interval '1 millisecond'
     where user_id = v_ug and slot = 0;
    select accrued_to, gold, version into v_mark, v_g, v_v from public.player_state where user_id = v_ug and slot = 0;
    v_to := date_trunc('second', now());
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_to,
             '00000000-0000-4000-8000-0000000cc103',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_to),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed' then
      raise exception 'k3: an armed span inside the cap did not pay: %', v_r;
    end if;
    select gold, version, accrued_to into v_n, v_v, v_w from public.player_state where user_id = v_ug and slot = 0;
    if v_n <> v_g + 9 or v_w is distinct from v_to
       or extract(epoch from (v_w - v_mark)) * 1000 > v_cap then
      raise exception 'k3b: paid gold +%, accrued_to moved % ms (cap % ms)',
        v_n - v_g, extract(epoch from (v_w - v_mark)) * 1000, v_cap;
    end if;

    -- ── k4: cap + 1 s
    update public.player_state
       set accrued_to = date_trunc('second', now()) - (v_cap + 1000) * interval '1 millisecond'
     where user_id = v_ug and slot = 0;
    select accrued_to into v_mark from public.player_state where user_id = v_ug and slot = 0;
    v_to := date_trunc('second', now());
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_to,
             '00000000-0000-4000-8000-0000000cc104',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_to),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if v_r->>'error' is distinct from 'fenced_cap' then
      raise exception 'k4: a mark one second past the cap was not refused fenced_cap: %', v_r;
    end if;

    -- ── k5: fresh 90 s pays; 25 h still answers fenced_24h first
    update public.player_state set accrued_to = date_trunc('second', now()) - interval '90 seconds'
     where user_id = v_ug and slot = 0;
    select accrued_to, gold into v_mark, v_g from public.player_state where user_id = v_ug and slot = 0;
    v_to := v_mark + interval '90 seconds';
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_to,
             '00000000-0000-4000-8000-0000000cc105',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_to),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed'
       or (select gold from public.player_state where user_id = v_ug and slot = 0) <> v_g + 9 then
      raise exception 'k5: a FRESH armed 90 s window no longer pays: %', v_r;
    end if;
    select version into v_v from public.player_state where user_id = v_ug and slot = 0;
    update public.player_state set accrued_to = date_trunc('second', now()) - interval '25 hours'
     where user_id = v_ug and slot = 0;
    select accrued_to into v_mark from public.player_state where user_id = v_ug and slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_ug, 0, 'gather', v_v, v_mark, v_mark + interval '90 seconds',
             '00000000-0000-4000-8000-0000000cc106',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '90 seconds')));
    reset role;
    if v_r->>'error' is distinct from 'fenced_24h' then
      raise exception 'k5b: a 25 h mark no longer answers fenced_24h (8b must precede 8c): %', v_r;
    end if;

    -- ── k6: the shadow branch is untouched (combat unarmed, raw 20 h, chain current)
    select greatest(ps.accrued_to, o.shadow_accrued_to), ps.version into v_mark, v_v
      from public.player_state ps join public.hr_tick_ownership o
        on o.user_id = ps.user_id and o.slot = ps.slot and o.channel = 'combat'
     where ps.user_id = v_uc and ps.slot = 0;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_uc, 0, 'combat', v_v, v_mark, v_mark + interval '30 seconds',
             '00000000-0000-4000-8000-0000000cc107',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '30 seconds'),
               'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'shadow' then
      raise exception 'k6: a SHADOW combat window for a raw-20 h character on a current chain was refused: %', v_r;
    end if;

    -- ── k7: F2. Both fixtures become sentinels: on their channel since 2000,
    --        raw accrued_to 5 min old, owned, unpartied.
    update public.player_state set accrued_to = date_trunc('second', now()) - interval '5 minutes'
     where user_id in (v_ug, v_uc) and slot = 0;
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    -- k7a (2001): rostered fires, 79 combat shadow rows, ZERO gather windows.
    v_at := '2001-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    select v_at - make_interval(secs => g * 90), v_uc, 0, 'combat', c_h,
           v_at - make_interval(secs => g * 90 + 90), v_at - make_interval(secs => g * 90),
           1, gen_random_uuid(), '{}'::jsonb
      from generate_series(1, 79) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not true or (v_r->>'armed_stalled')::boolean is not true
       or (v_r->>'stalled')::boolean is not true or (v_r->>'ok')::boolean is not false
       or (v_r->>'shadow_stalled')::boolean is not false or (v_r->>'judged')::boolean is not true
       or not (v_r->'watched_channels') ? 'combat' or (v_r->'watched_channels') ? 'gather'
       or v_r#>>'{armed,0,channel}' is distinct from 'gather'
       or (v_r#>>'{armed,0,stalled}')::boolean is not true
       or jsonb_array_length(v_r->'armed') <> 1 then
      raise exception 'k7a: gather armed, 2 h rostered, zero gather windows, with a sentinel — not judged an ARMED STALL: %', v_r;
    end if;
    -- k7b: no gather sentinel → no armed verdict, never a stall
    update public.hr_tick_ownership set owned = false where user_id = v_ug;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not false or (v_r->>'armed_stalled')::boolean is not false
       or (v_r->>'stalled')::boolean is not false then
      raise exception 'k7b: no armed sentinel, yet an armed verdict was given: %', v_r;
    end if;
    update public.hr_tick_ownership set owned = true where user_id = v_ug;
    -- k7c: nothing armed → the 2026-10-06 shadow rule exactly (combat 40/h → ok), armed = []
    update public.hr_tick_config set armed_channels = '{}' where id;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'judged')::boolean is not true or (v_r->>'stalled')::boolean is not false
       or (v_r->>'shadow_stalled')::boolean is not false or v_r->>'mode' is distinct from 'shadow'
       or v_r->'armed' <> '[]'::jsonb or (v_r->>'armed_judged')::boolean is not false then
      raise exception 'k7c: nothing armed — the shadow verdict changed or an armed verdict appeared: %', v_r;
    end if;
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    -- k7d (2002): healthy gather TICK LEDGER rows, combat silent →
    --   armed ok, shadow_stalled (the C2 combat stall still bites), stalled.
    v_at := '2002-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'gather', 'accrue', jsonb_build_object('src', 'tick', 'qty', 1), v_at - make_interval(secs => g * 90)
      from generate_series(1, 79) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_judged')::boolean is not true or (v_r->>'armed_stalled')::boolean is not false
       or (v_r->>'shadow_stalled')::boolean is not true or (v_r->>'stalled')::boolean is not true then
      raise exception 'k7d: gather paying 40 tick rows/h, combat silent — expected armed ok + shadow stall: %', v_r;
    end if;
    -- k7e (2003): the ARM BOUNDARY, ~30 min ago. Older hour: ~39 gather SHADOW
    --   rows; newer hour: ~19 shadow then 20 TICK LEDGER rows, so each hour
    --   needs both tables to clear the floor; combat healthy → nothing stalled.
    --   Non-tick gather ledger rows (an accrue) do not count.
    v_at := '2003-07-01 12:00:00+00';
    insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
    select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null from generate_series(1, 719) g;
    insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    select v_at - make_interval(secs => g * 90), u.u, 0, u.ch, c_h,
           v_at - make_interval(secs => g * 90 + 90), v_at - make_interval(secs => g * 90),
           1, gen_random_uuid(), '{}'::jsonb
      from generate_series(1, 79) g
      cross join (values (v_uc, 'combat'), (v_ug, 'gather')) u(u, ch)
     where u.ch = 'combat' or g > 20;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'gather', 'accrue', jsonb_build_object('src', 'tick', 'qty', 1), v_at - make_interval(secs => g * 90)
      from generate_series(1, 20) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'stalled')::boolean is not false or (v_r->>'armed_judged')::boolean is not true then
      raise exception 'k7e: an arm boundary (shadow rows, then tick rows) read as a stall: %', v_r;
    end if;
    -- …and a non-tick accrue row is not a tick window: at 2001 (k7a's zero
    -- gather windows) 79 accrue rows WITHOUT src=tick leave it STALLED.
    v_at := '2001-07-01 12:00:00+00';
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
    select v_ug, 0, 'gather', 'accrue', jsonb_build_object('qty', 1), v_at - make_interval(secs => g * 90)
      from generate_series(1, 79) g;
    v_r := public.hr_tick_stall_status(v_at, 2, 30);
    if (v_r->>'armed_stalled')::boolean is not true then
      raise exception 'k7f: non-tick gather rows hid an armed tick stall: %', v_r;
    end if;
    update public.hr_tick_config set armed_channels = '{}' where id;

    -- ── k8: grants exact
    for r in
      select f, role, want from (values
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'hr_engine', true),
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'hr_tick',   false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_engine', false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_tick',   false)) t(f, role, want)
      union all
      select f, c.role, false from (values
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)'),
        ('public.hr_tick_stall_status(timestamptz,int,int)')) t(f)
      cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) c(role)
    loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, r.f, 'execute') is distinct from r.want then
          raise exception 'k8: % EXECUTE on % is %, expected %', r.role, r.f,
            has_function_privilege(r.role, r.f, 'execute'), r.want;
        end if;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── k9: the switches this block flipped, restored and read back
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    select armed_channels, enabled, channels into v_ar, v_en, v_ch from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_ch is distinct from v_cfg_ch then
      raise exception 'k9: hr_tick_config was not restored — armed %/% enabled %/% channels %/%',
        v_ar, v_cfg_ar, v_en, v_cfg_en, v_ch, v_cfg_ch;
    end if;

    raise exception 'HR1007C_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1007C_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-armed-cap: EXECUTED — an armed 20 h span and its 90 s drip are refused fenced_cap '
               'with no row moved, a span inside the cap pays <= cap, cap + 1 s is refused, a fresh window '
               'pays, 25 h still answers fenced_24h, the shadow branch journals; an armed gather stall is '
               'judged STALLED, no sentinel gives no verdict, tick rows / an arm boundary read ok, non-tick '
               'rows do not count, the combat shadow verdict is unchanged; grants exact, hygiene strict — all green';
end $$;
