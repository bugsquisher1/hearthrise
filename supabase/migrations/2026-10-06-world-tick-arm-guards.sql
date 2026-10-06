-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-06-world-tick-arm-guards.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
-- Applies AFTER 2026-10-06-world-tick-channel-arm.sql (reviewed and GO'd as
-- its own file at 4f587c45; this file does not edit it).
--
-- THE TWO CONDITIONS ON ARMING ANY CHANNEL.
-- docs/planning/SEC_WORLD_TICK_CHANNEL_ARM_2026-10-05.md: "ARM (any channel):
-- GO-WITH-CHANGES (C1, C2 land first)".
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- C1 (finding 4). The roster admits a SHADOW character on its shadow chain
--    while its raw `accrued_to` is up to 7 d old. An operator who arms that
--    channel between the roster read and the settle has the probe return the
--    RAW mark, and the edge settles [mark, mark + flush] ARMED — one window
--    per character per arm transition that the armed (raw 24 h) roster would
--    never have issued, and the accrue path still pays its full cap after it.
-- C2 (finding 7). hr_tick_stall_status stopped judging the moment ANY channel
--    armed, so the combat shadow M3/M4 are measuring would go unwatched while
--    gather pays.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_settle, restated from the chain end with ONE delta: step (8b),
--    on the ARMED branch only, after the version CAS and before hr_apply:
--      hr_tick_admit(false, <locked accrued_to>, null) <> 'admit'
--        → {ok:false, error:'fenced_24h', mode:'armed', channel, accrued_to,
--           admission:<'fenced_24h'|'shadow_expired'>}
--    Nothing is written on that path. The shadow branch is untouched.
-- §2 hr_tick_stall_status, restated with ONE delta: the rule judges the set
--    of UNARMED channels (`channels` minus `armed_channels`) and counts only
--    their hr_tick_shadow rows. With nothing armed this is the 2026-09-28 rule
--    exactly. With a channel armed, a rostered fire no longer proves an
--    unarmed channel was rostered, so the rule also requires a SENTINEL — an
--    owned, on-channel, unpartied, shadow-admitted character on an unarmed
--    channel whose activity predates the judged window — or it gives no
--    verdict (never a false stall on an empty channel). The answer gains
--    `watched_channels`, `sentinel`, and mode 'partial'.
--
-- ── ERROR TAXONOMY (new) ────────────────────────────────────────────────────
--   fenced_24h   hr_tick_settle, armed branch: the locked raw accrued_to is
--                outside the 24 h fence (`admission` says which end). The
--                edge counts it as a refusal by name (tick.js settle()).
--
-- NOTHING HERE MOVES VALUE: §1 only ADDS a refusal ahead of hr_apply; §2 is a
-- read. No table, no column, no client surface; both functions keep their
-- exact grant sets (§3) and `hr_assert_grant_hygiene(true)` runs strict.
-- REVERSIBILITY: re-apply 2026-10-06-world-tick-channel-arm.sql's §4 and §7
-- bodies (both are `create or replace`, same signatures, same grants).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'armed_channels')
     or to_regprocedure('public.hr_tick_admit(boolean,timestamptz,timestamptz)') is null then
    raise exception 'PRECONDITION: 2026-10-06-world-tick-channel-arm.sql is not applied.';
  end if;
end $$;

-- ── §1 hr_tick_settle (C1) ──────────────────────────────────────────────────
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
begin
  -- ── (0) IDENTITY. Unchanged: the PRIMARY control is the GRANT in §3.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

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

-- ── §2 hr_tick_stall_status (C2) ───────────────────────────────────────────
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

  return jsonb_build_object(
    'ok', not v_stalled,
    'stalled', v_stalled,
    'judged', v_judged,
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
--   g1  ★ C1: armed {gather}; a gather character whose raw accrued_to is
--       25 h old (shadow chain current) is refused `fenced_24h` on the armed
--       branch — zero player_ledger rows, version/accrued_to/gold unmoved;
--       7 d + 1 min reads admission `shadow_expired`; 23 h old passes (8b)
--       and reaches the armed branch; a SHADOW combat character 25 h old with
--       a current chain still journals (C1 does not touch the shadow branch)
--   g2  ★ C2, planted at an instant no real row occupies (2001): armed
--       {gather}, two hours of rostered fires, plenty of GATHER shadow rows,
--       zero combat rows, a combat sentinel → judged, STALLED, mode
--       'partial', combat watched and gather not; no sentinel → no verdict;
--       nothing armed → the 2026-09-28 rule (gather rows count, ok); every
--       channel armed → not judged; combat rows ≥ min → ok
--   g3  grants: hr_tick_settle → hr_engine only; hr_tick_stall_status → no
--       client/engine role; the detector passes STRICT
-- Probe rows are rolled back by the sentinel; the switches the block flips
-- are restored explicitly and read back first.
do $$
declare
  v_ug    uuid := '00000000-0000-4000-8000-0000000a1106';
  v_uc    uuid := '00000000-0000-4000-8000-0000000a2106';
  v_gact  text;
  v_cact  text;
  v_n     int;
  v_r     jsonb;
  v_at    timestamptz := '2001-06-01 12:00:00+00';
  v_mark  timestamptz;
  v_g     bigint;
  v_v     bigint;
  v_w     timestamptz;
  v_armed_before   text[];
  v_enabled_before boolean;
  v_chan_before    text[];
  v_armed   text[];
  v_enabled boolean;
  v_chan    text[];
  r record;
begin
  begin
    select armed_channels, enabled, channels
      into v_armed_before, v_enabled_before, v_chan_before
      from public.hr_tick_config where id;
    if not found then
      raise notice 'self-check SKIPPED: no hr_tick_config row';
      raise exception 'HR1106_ROLLBACK_OK';
    end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}' where id;

    select activity_id into v_gact from public.hr_activities where kind = 'gather' limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' limit 1;
    if v_gact is null or v_cact is null then
      raise notice 'self-check SKIPPED g1/g2: no gather/combat activity to point a probe at';
    else
      insert into auth.users (id) values (v_ug), (v_uc) on conflict do nothing;
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                       accrued_to, active_kind, active_id, active_since)
      values (v_ug, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '25 hours',
              'gather', v_gact, '2000-01-01 00:00:00+00'),
             (v_uc, 0, 500, 0, 10, 10, 1, date_trunc('second', now()) - interval '25 hours',
              'combat', v_cact, '2000-01-01 00:00:00+00');
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until,
                                            shadow_accrued_to)
      values (v_ug, 0, 'gather', true, 'selfcheck', now() + interval '5 minutes',
              date_trunc('second', now()) - interval '2 minutes'),
             (v_uc, 0, 'combat', true, 'selfcheck', now() + interval '5 minutes',
              date_trunc('second', now()) - interval '2 minutes');

      -- ── g1: C1
      update public.hr_tick_config set armed_channels = array['gather'] where id;
      select accrued_to into v_mark from public.player_state where user_id = v_ug and slot = 0;
      v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_mark, v_mark + interval '90 seconds',
               '00000000-0000-4000-8000-0000000b1106',
               jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '90 seconds'),
                 'journal', jsonb_build_object('kind','gather','intent','accrue',
                   'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))));
      if v_r->>'error' is distinct from 'fenced_24h' or v_r->>'admission' is distinct from 'fenced_24h'
         or v_r->>'channel' is distinct from 'gather' or v_r->>'mode' is distinct from 'armed' then
        raise exception 'g1: an ARMED gather window for a raw-25 h character was not refused fenced_24h: %', v_r;
      end if;
      select count(*) into v_n from public.player_ledger where user_id = v_ug;
      select gold, version, accrued_to into v_g, v_v, v_w from public.player_state
       where user_id = v_ug and slot = 0;
      if v_n <> 0 or v_g <> 500 or v_v <> 1 or v_w is distinct from v_mark then
        raise exception 'g1b: the fenced_24h refusal moved the character (ledger %, gold %, version %, accrued_to %)',
          v_n, v_g, v_v, v_w;
      end if;
      update public.player_state set accrued_to = date_trunc('second', now()) - interval '7 days' - interval '1 minute'
       where user_id = v_ug and slot = 0;
      select accrued_to into v_mark from public.player_state where user_id = v_ug and slot = 0;
      v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_mark, v_mark + interval '90 seconds',
               '00000000-0000-4000-8000-0000000b2106',
               jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '90 seconds')));
      if v_r->>'error' is distinct from 'fenced_24h' or v_r->>'admission' is distinct from 'shadow_expired' then
        raise exception 'g1c: a 7 d + 1 min character was not refused fenced_24h/shadow_expired: %', v_r;
      end if;
      update public.player_state set accrued_to = date_trunc('second', now()) - interval '23 hours'
       where user_id = v_ug and slot = 0;
      select accrued_to into v_mark from public.player_state where user_id = v_ug and slot = 0;
      v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_mark, v_mark + interval '90 seconds',
               '00000000-0000-4000-8000-0000000b3106',
               jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '90 seconds'),
                 'journal', jsonb_build_object('kind','gather','intent','accrue',
                   'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))));
      if v_r->>'error' is not distinct from 'fenced_24h' or v_r->>'mode' is distinct from 'armed' then
        raise exception 'g1d: a raw-23 h character did not reach the armed branch: %', v_r;
      end if;
      -- The SHADOW branch is untouched: combat (unarmed), raw 25 h, chain current.
      select greatest(ps.accrued_to, o.shadow_accrued_to) into v_mark
        from public.player_state ps join public.hr_tick_ownership o
          on o.user_id = ps.user_id and o.slot = ps.slot and o.channel = 'combat'
       where ps.user_id = v_uc and ps.slot = 0;
      v_r := public.hr_tick_settle('selfcheck', v_uc, 0, 'combat', 1, v_mark, v_mark + interval '30 seconds',
               '00000000-0000-4000-8000-0000000b4106',
               jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_mark + interval '30 seconds'),
                 'journal', jsonb_build_object('kind','combat','intent','accrue',
                   'meta', jsonb_build_object('src','tick','ticks',1))));
      if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'shadow' then
        raise exception 'g1e: a SHADOW combat window for a raw-25 h character on a current chain was refused: %', v_r;
      end if;

      -- ── g2: C2, at v_at (2001). v_uc is the combat sentinel: on combat since
      --        2000, raw accrued_to recent, owned, shadow-admitted.
      update public.player_state set accrued_to = date_trunc('second', now()) - interval '5 minutes'
       where user_id = v_uc and slot = 0;
      update public.hr_tick_ownership set owned = false where user_id = v_ug;
      insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
      select v_at - make_interval(secs => g * 10), 'posted', 5, 2, 10, null
        from generate_series(1, 719) g;
      insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                         version, intent_id, delta)
      select v_at - make_interval(secs => g * 90), v_ug, 0, 'gather', 'selfcheck',
             v_at - make_interval(secs => g * 90 + 90), v_at - make_interval(secs => g * 90),
             1, gen_random_uuid(), '{}'::jsonb
        from generate_series(1, 79) g;
      update public.hr_tick_config set armed_channels = array['gather'] where id;
      v_r := public.hr_tick_stall_status(v_at, 2, 30);
      if (v_r->>'judged')::boolean is not true or (v_r->>'stalled')::boolean is not true
         or v_r->>'mode' is distinct from 'partial'
         or not (v_r->'watched_channels') ? 'combat' or (v_r->'watched_channels') ? 'gather' then
        raise exception 'g2: gather armed, combat silent for 2 h with a sentinel — not judged a STALL: %', v_r;
      end if;
      update public.hr_tick_ownership set owned = false where user_id = v_uc;
      v_r := public.hr_tick_stall_status(v_at, 2, 30);
      if (v_r->>'judged')::boolean is not false or (v_r->>'stalled')::boolean is not false then
        raise exception 'g2b: no unarmed-channel sentinel, yet a verdict was given: %', v_r;
      end if;
      update public.hr_tick_ownership set owned = true where user_id = v_uc;
      update public.hr_tick_config set armed_channels = '{}' where id;
      v_r := public.hr_tick_stall_status(v_at, 2, 30);
      if (v_r->>'judged')::boolean is not true or (v_r->>'stalled')::boolean is not false
         or v_r->>'mode' is distinct from 'shadow' then
        raise exception 'g2c: nothing armed, 40 shadow rows/h — the 2026-09-28 rule did not read ok: %', v_r;
      end if;
      update public.hr_tick_config set armed_channels = array['combat','gather','artisan'] where id;
      v_r := public.hr_tick_stall_status(v_at, 2, 30);
      if (v_r->>'judged')::boolean is not false or v_r->>'mode' is distinct from 'armed' then
        raise exception 'g2d: every channel armed, yet the shadow rule judged: %', v_r;
      end if;
      update public.hr_tick_config set armed_channels = array['gather'] where id;
      insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                         version, intent_id, delta)
      select v_at - make_interval(secs => g * 90), v_uc, 0, 'combat', 'selfcheck',
             v_at - make_interval(secs => g * 90 + 90), v_at - make_interval(secs => g * 90),
             1, gen_random_uuid(), '{}'::jsonb
        from generate_series(1, 79) g;
      v_r := public.hr_tick_stall_status(v_at, 2, 30);
      if (v_r->>'judged')::boolean is not true or (v_r->>'stalled')::boolean is not false then
        raise exception 'g2e: gather armed, combat at 40 rows/h — read as a stall: %', v_r;
      end if;
      update public.hr_tick_config set armed_channels = '{}' where id;
    end if;

    -- ── g3
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
          raise exception 'g3: % EXECUTE on % is %, expected %', r.role, r.f,
            has_function_privilege(r.role, r.f, 'execute'), r.want;
        end if;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── THE SWITCHES THIS BLOCK FLIPPED, RESTORED AND READ BACK.
    update public.hr_tick_config
       set armed_channels = v_armed_before, enabled = v_enabled_before, channels = v_chan_before
     where id;
    select armed_channels, enabled, channels into v_armed, v_enabled, v_chan
      from public.hr_tick_config where id;
    if v_armed is distinct from v_armed_before or v_enabled is distinct from v_enabled_before
       or v_chan is distinct from v_chan_before then
      raise exception 'g4: hr_tick_config was not restored — armed %/% enabled %/% channels %/%',
        v_armed, v_armed_before, v_enabled, v_enabled_before, v_chan, v_chan_before;
    end if;

    raise exception 'HR1106_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1106_ROLLBACK_OK' then raise; end if;
  end;
end $$;
