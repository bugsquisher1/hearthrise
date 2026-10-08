-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-world-tick-presence-horizon.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. It has an EDGE HALF
-- (hr-accrue reads hr_accrue_cap_ms at its four accrue-cap sites) that rides a
-- later edge bundle. The SQL half is safe on its own (see ORDER below).
-- Chain position: BEFORE 2026-10-10-world-tick-gather-widen.sql, whose §0
-- refuses to apply until this file's hr_tick_settle is installed — stage 1
-- cannot open without the horizon.
--
-- THE RULING (Game Designer on B1, 2026-10-08): THE PRESENCE HORIZON.
--   N = the character's own offline cap — hr_offline_cap_ms, the function
--   accrue uses (clan level: 12 h base, up to 15 h) — measured from the LAST
--   REAL RETURN (the last non-tick settle). The armed tick pays nothing past
--   (last real return + cap). On return, accrue pays
--   max(0, min(absence, cap) - tick-paid time inside that absence). One rule for
--   every armed character, the QA cohort included, and the one rule at 100 %.
--
-- HOW, IN ONE SENTENCE: the last real return is a server-stamped anchor R per
-- character; every settle, tick or accrue, may pay only up to R + cap; and
-- because a tick settle never moves R while a real settle always does, the two
-- paths share one budget per absence by construction.
--
--   R  — hr_return_anchor.real_return_at. Stamped by an AFTER trigger on
--        player_state whenever accrued_to moves and the transaction is NOT the
--        world tick (hr.frame_origin <> 'tick', the transaction-local marker
--        hr_tick_settle and hr_party_tick_settle set at their step (0b) before
--        any write). So R = the accrued_to of the last non-tick settle, which
--        is the server-clamped instant of the player's last real presence. A
--        character nobody ticks has R = accrued_to always, so its horizon is
--        exactly today's cap: nothing changes for it.
--   TICK — hr_tick_settle (8d), armed branch, after 8b/8c, under the player
--        lock: a window ending past R + cap is REFUSED `past_horizon`, never
--        clipped (the delta is the engine's). The first refusal per absence
--        writes ONE hr_tick_horizon_log row (on conflict do nothing on
--        (user, slot, anchor_at)); every later one writes nothing. No anchor
--        = refused `no_return_anchor` (fails closed). The character stays
--        OWNED and rostered; it is PARKED.
--   ACCRUE — hr_accrue_cap_ms(user, slot), which the edge reads where it read
--        hr_offline_cap_ms for an accrue span: the cap still bounds the span,
--        and so does the horizon: least(cap, R + cap - accrued_to). The
--        engine pays [accrued_to, accrued_to + that] and forfeits the tail,
--        exactly like an over-cap tail today; the settle moves accrued_to,
--        the trigger moves R to the return, and the next absence starts fresh.
--        Tick-paid time inside the absence is accrued_to - R, so this IS
--        max(0, min(absence, cap) - tick-paid).
--        THE ONE WRITE: if the absence's horizon is already spent (under the
--        engine's 60 s floor left) and now() is past it, nothing is payable
--        and the engine would answer below_min_span for ever without moving
--        accrued_to, so R would never move either. The function then settles
--        the forfeit itself: ONE hr_apply (as hr_engine, the edge's own
--        role) moving accrued_to to now() and journalling
--        kind 'accrue' / intent 'horizon_forfeit' (idempotency key derived from
--        (user, slot, R), so a replay is a no-op). Version-bumped, so a stale
--        computation in the same request is refused by the CAS, never paid.
--        A partied character is never forfeited here (invariant 8: its mark
--        is the hunt's); the party path is M4's (see LIMITATIONS).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_return_anchor (user_id, slot) pk, real_return_at, updated_at.
--    hr_tick_horizon_log (user_id, slot, anchor_at) pk, channel, horizon_at,
--      cap_ms, mark, at — APPEND-ONLY, one row per absence that reached its
--      horizon under the tick. Both RLS enabled + forced, no policy, no grant.
-- §2 hr_return_anchor_stamp() trigger function (SECURITY DEFINER, no grant);
--    triggers hr_return_anchor_ins (AFTER INSERT) and hr_return_anchor_upd
--    (AFTER UPDATE OF accrued_to WHEN distinct) on player_state.
-- §3 BACKFILL, once, on conflict do nothing: a character with no OWNED tick
--    row gets R = accrued_to (exact: nothing but its own settles moved it);
--    an owned character gets R = its last non-tick ledger row of intent
--    'accrue' in a payable kind (the QA cohort: 2026-10-07 16:33:54 UTC on
--    prod). An owned character with no such row gets NO anchor, so the tick
--    refuses it until its next real settle stamps one.
-- §4 hr_accrue_cap_ms(p_user uuid, p_slot int) -> bigint  hr_engine only.
-- §5 hr_tick_settle restated: live e00dbf9f + (8d).
-- §6 hr_assert_grant_hygiene, link 17 (tools/derive-grant-hygiene.mjs):
--    'hr_accrue_cap_ms(uuid,integer)' INSERTED at the head of c_engine_allow.
-- §7 grants (revoke first). §8 self-check, executed.
--
-- ORDER, AND WHAT EACH HALF DOES ALONE
--   SQL applied, edge not yet: the tick is horizon-fenced (8d) and the edge's
--   accrue still reads hr_offline_cap_ms — today's cap. A ticked character
--   whose tick paid k hours of an absence is paid up to cap again on return
--   for that ONE absence, until the bundle lands: at most k extra, bounded by
--   cap, only for owned characters (stage 0: QA slot 2). Ship the edge bundle
--   before widening past the operator cohort, which widen's §0 does not
--   check — the apply-order note and the runbook say so.
--   Edge deployed, SQL not yet: the read fails (42883) and accrue 500s. Never
--   deploy the edge half first.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   The anchor moves only inside a transaction that moved accrued_to, i.e.
--   that holds player_state's row lock (hr_apply's `select ... for update`).
--   (8d) reads it after the settle locked the same row, so the horizon it
--   judges cannot move under it. hr_accrue_cap_ms reads without a lock; its
--   one write goes through hr_apply, whose version CAS refuses it if anything
--   moved, and the next poll recomputes. No read-modify-write crosses a hop.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   One new engine grant (hr_accrue_cap_ms, recorded in the detector in the
--   same file). Nothing new for any client role. Nothing the caller sends is
--   read: the cap is hr_offline_cap_ms, the clock is now(), the anchor is a
--   trigger's. A player can refresh their own anchor only by settling, i.e.
--   by being present; suppressing it (the tick marker) is not reachable from
--   a client transaction, and suppressing it would only pay them less.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Trigger: one GUC read + one upsert per non-tick settle that moves the
--   mark (client polls), skipped entirely (WHEN clause) when it does not.
--   (8d): one pk read per armed window. hr_accrue_cap_ms: two pk reads +
--   hr_partied per accrue read. Horizon log: <= one row per absence that
--   outlasts its horizon; never per tick. A parked character is still
--   rostered and refused each fire (no row); lane b566-tick-scale's due-only
--   roster should not roster a character whose next window ends past its
--   horizon.
--
-- KNOWN LIMITATIONS
--   · The party path (hr_party_tick_settle) is not horizon-fenced. Combat is
--     not armed; M4's arm must add (8d) there before parties pay.
--   · Up to 60 s of an absence's own budget is forfeited when a parked
--     character returns with less than the engine's 60 s floor left.
--   · Owned characters with no qualifying ledger row get no backfilled anchor
--     (refused until their next real settle).
--
-- REVERSIBILITY: re-apply 2026-10-07-world-tick-armed-cap.sql §1 (the settle
-- without 8d) and restore the derived detector to link 16; drop the two
-- triggers, hr_return_anchor_stamp, hr_accrue_cap_ms (after the edge half is
-- rolled back), and both tables. Re-applying this file is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare
  v_settle text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_settle from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)');
  if v_settle is null or v_settle not in ('e00dbf9fcdea8a7ccba33a20ae8ed64f', '512cdc6596865e87cceed8416a283d05') then
    raise exception 'PRECONDITION: hr_tick_settle prosrc md5 is %, expected the live e00dbf9f (armed-cap) '
                    'or this file''s 512cdc6596865e87cceed8416a283d05. Re-cut this file against the live body.', v_settle;
  end if;
  if to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_partied(uuid,integer)') is null
     or to_regclass('public.hr_tick_ownership') is null
     or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: hr_offline_cap_ms, hr_apply, hr_partied, hr_tick_ownership or player_ledger is absent.';
  end if;
end $$;

-- ── §1 THE ANCHOR AND THE PARKING JOURNAL ───────────────────────────────────
create table if not exists public.hr_return_anchor (
  user_id        uuid        not null,
  slot           int         not null,
  real_return_at timestamptz not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.hr_return_anchor enable row level security;
alter table public.hr_return_anchor force row level security;
comment on table public.hr_return_anchor is
  '2026-10-10 (presence horizon, Game Designer ruling on B1). The LAST REAL RETURN '
  'per character: the accrued_to of its last NON-tick settle, stamped by the '
  'hr_return_anchor_ins/_upd triggers on player_state (skipped when the '
  'transaction is the world tick). Every settle may pay only up to '
  'real_return_at + hr_offline_cap_ms. RLS forced, no policy, no grant.';

create table if not exists public.hr_tick_horizon_log (
  user_id    uuid        not null,
  slot       int         not null,
  anchor_at  timestamptz not null,
  channel    text        not null,
  horizon_at timestamptz not null,
  cap_ms     bigint      not null,
  mark       timestamptz not null,
  at         timestamptz not null default now(),
  primary key (user_id, slot, anchor_at),
  constraint hr_tick_horizon_log_channel_ck check (channel in ('combat', 'gather', 'artisan')),
  constraint hr_tick_horizon_log_shape_ck check (horizon_at > anchor_at and cap_ms > 0)
);
alter table public.hr_tick_horizon_log enable row level security;
alter table public.hr_tick_horizon_log force row level security;
comment on table public.hr_tick_horizon_log is
  '2026-10-10 (presence horizon). APPEND-ONLY: one row per absence whose armed '
  'tick reached real_return_at + cap and was refused past_horizon (the first '
  'refusal; on conflict do nothing). A character with a row for its CURRENT '
  'anchor is PARKED: owned, paid in full for the absence, waiting for its return. '
  'Written only by hr_tick_settle; RLS forced, no policy, no grant; never updated '
  'or deleted.';

-- ── §2 THE STAMP ────────────────────────────────────────────────────────────
create or replace function public.hr_return_anchor_stamp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $$
begin
  -- THE WORLD TICK IS NOT A RETURN. hr_tick_settle / hr_party_tick_settle set
  -- this transaction-local marker at their step (0b), before any write; no
  -- client transaction can set it (PostgREST runs one statement per request
  -- and exposes no set_config), and if one could, it would only stop its own
  -- horizon moving forward — the paying-less direction.
  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then
    return null;
  end if;
  insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
  values (new.user_id, new.slot, new.accrued_to, now())
  on conflict (user_id, slot) do update
    set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at),
        updated_at     = now();
  return null;
end $$;
comment on function public.hr_return_anchor_stamp() is
  '2026-10-10 (presence horizon). AFTER trigger on player_state: a non-tick '
  'transaction that moved accrued_to stamps hr_return_anchor.real_return_at = the '
  'new accrued_to (raise-only). Executable by no role.';

drop trigger if exists hr_return_anchor_ins on public.player_state;
create trigger hr_return_anchor_ins
  after insert on public.player_state
  for each row execute function public.hr_return_anchor_stamp();
drop trigger if exists hr_return_anchor_upd on public.player_state;
create trigger hr_return_anchor_upd
  after update of accrued_to on public.player_state
  for each row when (old.accrued_to is distinct from new.accrued_to)
  execute function public.hr_return_anchor_stamp();

-- ── §3 BACKFILL (once; on conflict do nothing) ──────────────────────────────
insert into public.hr_return_anchor (user_id, slot, real_return_at)
select ps.user_id, ps.slot, ps.accrued_to
  from public.player_state ps
 where ps.accrued_to is not null
   and not exists (select 1 from public.hr_tick_ownership o
                    where o.user_id = ps.user_id and o.slot = ps.slot and o.owned)
on conflict (user_id, slot) do nothing;

insert into public.hr_return_anchor (user_id, slot, real_return_at)
select x.user_id, x.slot, x.r
  from (select ps.user_id, ps.slot,
               (select max(pl.at) from public.player_ledger pl
                 where pl.user_id = ps.user_id and pl.slot = ps.slot
                   and pl.intent = 'accrue'
                   and pl.kind in ('combat', 'gather', 'craft')
                   and pl.meta->>'src' is distinct from 'tick') as r
          from public.player_state ps
         where exists (select 1 from public.hr_tick_ownership o
                        where o.user_id = ps.user_id and o.slot = ps.slot and o.owned)) x
 where x.r is not null
on conflict (user_id, slot) do nothing;

-- ── §4 hr_accrue_cap_ms — THE ACCRUE SPAN'S CAP, HORIZON INCLUDED ───────────
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
  -- A partied character's mark is its hunt's (invariant 8); never touched here.
  if public.hr_partied(p_user, p_slot) then return v_cap; end if;
  select a.real_return_at into v_anchor from public.hr_return_anchor a
   where a.user_id = p_user and a.slot = p_slot;
  if v_anchor is null then return v_cap; end if;

  -- What is left of THIS absence's budget: R + cap - accrued_to, which is
  -- min(absence, cap) - tick-paid once the engine also bounds by elapsed.
  v_left := floor(extract(epoch from (v_anchor + v_cap * interval '1 millisecond' - v_st.accrued_to)) * 1000)::bigint;
  if v_left >= c_min_ms then
    return least(v_cap, v_left);
  end if;
  if now() <= v_anchor + v_cap * interval '1 millisecond' then
    -- At the line and still inside it: a moment of below_min_span, never 0
    -- (0 is the engine's no_cap lockout for every verb).
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
  if coalesce((v_out->>'ok')::boolean, false) then
    return v_cap;
  end if;
  return greatest(v_left, 1);
end $$;
comment on function public.hr_accrue_cap_ms(uuid, integer) is
  '2026-10-10 (presence horizon). The accrue span''s cap: least(hr_offline_cap_ms, '
  'last real return + cap - accrued_to). When that is spent and now() is past the '
  'horizon it forfeits the absence itself (one hr_apply, intent horizon_forfeit, '
  'key derived from the anchor) and returns the full cap for the next. hr_engine only.';

-- ── §5 hr_tick_settle — live (armed-cap e00dbf9f) + (8d) the horizon ────────
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
  -- The last real return and the horizon, read at step (8d) (2026-10-10).
  v_anchor    timestamptz;
  v_horizon   timestamptz;
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

  -- ── (8d) ★ THE PRESENCE HORIZON ★ (2026-10-10, Game Designer ruling on B1).
  --         An armed window may pay only up to the character's LAST REAL
  --         RETURN + its offline cap — the SAME hr_offline_cap_ms (8c) just
  --         read, never a second source. The anchor is hr_return_anchor,
  --         stamped by player_state's trigger on every NON-tick settle, so
  --         nothing this tick writes can move it: the horizon is fixed for
  --         the whole absence. Read after the player row is locked, so the
  --         anchor cannot move under the judgement (only a transaction holding
  --         that lock can stamp it).
  --         REFUSED, NOT CLIPPED (as 8c). The first refusal of an absence
  --         journals ONE hr_tick_horizon_log row (the character is PARKED);
  --         every later one writes nothing. The time between the last paid
  --         window and the horizon (< one flush) is paid by the return's
  --         accrue (hr_accrue_cap_ms). FAILS CLOSED: no anchor, no pay.
  select a.real_return_at into v_anchor from public.hr_return_anchor a
   where a.user_id = p_user and a.slot = p_slot;
  if v_anchor is null then
    return jsonb_build_object('ok', false, 'error', 'no_return_anchor', 'mode', 'armed',
      'channel', p_channel, 'accrued_to', v_st.accrued_to);
  end if;
  v_horizon := v_anchor + v_cap_ms * interval '1 millisecond';
  if p_window_to > v_horizon then
    insert into public.hr_tick_horizon_log (user_id, slot, anchor_at, channel, horizon_at, cap_ms, mark)
    values (p_user, p_slot, v_anchor, p_channel, v_horizon, v_cap_ms, v_st.accrued_to)
    on conflict (user_id, slot, anchor_at) do nothing;
    return jsonb_build_object('ok', false, 'error', 'past_horizon', 'mode', 'armed',
      'channel', p_channel, 'accrued_to', v_st.accrued_to, 'anchor', v_anchor,
      'horizon', v_horizon, 'cap_ms', v_cap_ms);
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

-- ── §6 hr_assert_grant_hygiene — LINK 17: hr_accrue_cap_ms joins c_engine_allow
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- ── §7 GRANTS — revoke from PUBLIC first ────────────────────────────────────
revoke all on table public.hr_return_anchor from public;
revoke all on table public.hr_return_anchor from anon, authenticated, service_role, hr_engine, hr_tick;
revoke all on table public.hr_tick_horizon_log from public;
revoke all on table public.hr_tick_horizon_log from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_return_anchor_stamp() from public;
revoke execute on function public.hr_return_anchor_stamp()
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_accrue_cap_ms(uuid, integer) from public;
revoke execute on function public.hr_accrue_cap_ms(uuid, integer)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_accrue_cap_ms(uuid, integer) to hr_engine;

-- Restated EXACTLY as the chain left them.
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) to hr_engine;

-- ── §8 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Gather ARMED. Settles and the cap read run as hr_engine (the edge's role);
-- the "tick already paid this" prefix is an hr_apply inside a transaction
-- marked as the tick, exactly as hr_tick_settle marks it. After every tick
-- step the marker is cleared, because this whole block is ONE transaction.
--   k0  installed bodies are this file's; (8d) sits after (8c) and before
--       hr_apply; nothing UPDATEs or DELETEs hr_tick_horizon_log
--   h1  ★ AWAY, 20 h, cap 12 h (G): the tick moves accrued_to, NEVER the
--       anchor; the window ending AT R + cap pays; the next is refused
--       past_horizon and journalled ONCE (a second refusal adds nothing,
--       moves nothing)
--   h2  ★ RETURN (G): hr_accrue_cap_ms forfeits the spent absence (accrued_to
--       -> now, intent horizon_forfeit, forfeit 8 h) and answers the full cap
--       for the next absence; anchor -> now. Paid for the 20 h absence:
--       tick 12 h + accrue 0 = 12 h
--   h3  ★ PARTIAL (P): tick paid 5 h of a 20 h absence; the return's cap is
--       exactly the 7 h remainder and nothing is forfeited
--   h4  ★ NEVER TICKED (N): a 20 h absence still reads the full 12 h — the
--       same total as G; one rule for both
--   h5  ★ ATTENDED (O): a non-tick settle moves the anchor with it; the next
--       read is the full cap and an armed window right after still pays
--   h6  no anchor -> refused no_return_anchor; a PARTIED spent character is
--       never forfeited
--   kg  hr_accrue_cap_ms: hr_engine only, refused for hr_tick by name; the
--       stamp: no role; both tables: no privilege, RLS forced, no policy;
--       hygiene STRICT (the detector carries link 17)
do $$
declare
  c_h    constant text := 'hr1010h-selfcheck';
  v_g    uuid := '00000000-0000-4000-8000-0000000e7001';
  v_p    uuid := '00000000-0000-4000-8000-0000000e7002';
  v_n    uuid := '00000000-0000-4000-8000-0000000e7003';
  v_o    uuid := '00000000-0000-4000-8000-0000000e7004';
  v_x    uuid := '00000000-0000-4000-8000-0000000e7005';
  v_q    uuid := '00000000-0000-4000-8000-0000000e7006';
  v_gact text;  v_cact text;  v_party uuid;
  v_cap  bigint;
  v_r0   timestamptz;
  v_t    timestamptz;
  v_v    bigint;
  v_r    jsonb;
  v_c    bigint;
  v_l0   bigint;
  v_cfg_en boolean; v_cfg_ch text[]; v_cfg_ar text[];
  v_caught boolean;
  r      record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)'::regprocedure)
         <> '512cdc6596865e87cceed8416a283d05'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_accrue_cap_ms(uuid,integer)'::regprocedure)
         <> '6bcea506a192abd1e0bc5d86f0c8a7c6' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if (select count(*) from pg_proc p
         where p.oid = 'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)'::regprocedure
           and position('past_horizon' in p.prosrc) > position('fenced_cap' in p.prosrc)
           and position('public.hr_apply(' in p.prosrc) > position('past_horizon' in p.prosrc)
           and position('public.hr_offline_cap_ms(p_user, p_slot)' in p.prosrc) > 0) <> 1 then
      raise exception 'k0b: (8d) is not between (8c) and hr_apply, or the cap is not hr_offline_cap_ms';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and (p.prosrc ~* 'update\s+public\.hr_tick_horizon_log'
                    or p.prosrc ~* 'delete\s+from\s+public\.hr_tick_horizon_log')) then
      raise exception 'k0c: a body UPDATEs or DELETEs hr_tick_horizon_log — it is append-only';
    end if;

    -- ── fixture
    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'] where id;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    insert into auth.users (id) values (v_g), (v_p), (v_n), (v_o), (v_x), (v_q) on conflict do nothing;
    v_cap := public.hr_offline_cap_ms(v_g, 0);
    if coalesce(v_cap, 0) < 6 * 3600000 or v_cap > 19 * 3600000 then
      raise exception 'k-fixture: cap % ms; the arms need 6 h <= cap < 19 h', v_cap;
    end if;
    v_r0 := date_trunc('second', now()) - interval '20 hours';
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    select u, 0, 0, 0, 10, 10, 1, v_r0, 'gather', v_gact, '2000-01-01 00:00:00+00'
      from unnest(array[v_g, v_p, v_n, v_o, v_x, v_q]) u;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    select u, 0, 'gather', true, c_h, now() + interval '5 minutes'
      from unnest(array[v_g, v_p, v_o, v_x, v_q]) u;
    if (select count(*) from public.hr_return_anchor
         where user_id in (v_g, v_p, v_n, v_o, v_x, v_q) and real_return_at = v_r0) <> 6 then
      raise exception 'k-fixture: the insert trigger did not stamp every new character''s anchor at its accrued_to';
    end if;

    -- ── h1 AWAY: the tick pays up to R + cap - 90 s (one tick-marked apply) ...
    perform set_config('hr.frame_origin', 'tick', true);
    set local role hr_engine;
    v_r := public.hr_apply(v_g, 0, 1, '00000000-0000-4000-8000-0000000e7101',
             jsonb_build_object('accrued_to', to_jsonb(v_r0 + (v_cap - 90000) * interval '1 millisecond'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if coalesce((v_r->>'ok')::boolean, false) is not true
       or (select real_return_at from public.hr_return_anchor where user_id = v_g and slot = 0) <> v_r0 then
      raise exception 'h1a: a TICK write moved the anchor (it must stay at the last real return): %', v_r;
    end if;
    -- ... then the real fence: the window ending AT the horizon pays,
    select version into v_v from public.player_state where user_id = v_g and slot = 0;
    v_t := v_r0 + v_cap * interval '1 millisecond';
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_g, 0, 'gather', v_v, v_t - interval '90 seconds', v_t,
             '00000000-0000-4000-8000-0000000e7102',
             jsonb_build_object('accrued_to', to_jsonb(v_t),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'h1b: the armed window ending AT the horizon was not paid: %', v_r;
    end if;
    -- ... and the next one is refused past_horizon, journalled once.
    select version, count(*) over () into v_v, v_c from public.player_state where user_id = v_g and slot = 0;
    select count(*) into v_l0 from public.player_ledger where user_id = v_g;
    for i in 1..2 loop
      set local role hr_engine;
      v_r := public.hr_tick_settle(c_h, v_g, 0, 'gather', v_v, v_t, v_t + interval '90 seconds',
               ('00000000-0000-4000-8000-0000000e710' || (2 + i)::text)::uuid,
               jsonb_build_object('accrued_to', to_jsonb(v_t + interval '90 seconds'),
                 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                   'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
      reset role;
      perform set_config('hr.frame_origin', '', true);
      if v_r->>'error' is distinct from 'past_horizon' or (v_r->>'cap_ms')::bigint <> v_cap
         or (v_r->>'anchor')::timestamptz <> v_r0 then
        raise exception 'h1c: a window past R + cap was not refused past_horizon (try %): %', i, v_r;
      end if;
    end loop;
    if (select count(*) from public.hr_tick_horizon_log where user_id = v_g) <> 1
       or not exists (select 1 from public.hr_tick_horizon_log
                       where user_id = v_g and anchor_at = v_r0 and horizon_at = v_t and cap_ms = v_cap
                         and mark = v_t and channel = 'gather' and at = now())
       or (select count(*) from public.player_ledger where user_id = v_g) <> v_l0
       or (select accrued_to from public.player_state where user_id = v_g and slot = 0) <> v_t then
      raise exception 'h1d: the parking was not journalled exactly once, or a refusal moved something';
    end if;

    -- ── h2 RETURN: the spent absence is forfeited, the next one starts fresh
    select count(*) into v_l0 from public.player_ledger where user_id = v_g;
    set local role hr_engine;
    v_c := public.hr_accrue_cap_ms(v_g, 0);
    reset role;
    if v_c <> v_cap
       or (select accrued_to from public.player_state where user_id = v_g and slot = 0) <> now()
       or (select real_return_at from public.hr_return_anchor where user_id = v_g and slot = 0) <> now()
       or (select count(*) from public.player_ledger
            where user_id = v_g and kind = 'accrue' and intent = 'horizon_forfeit'
              and (meta->>'forfeit_ms')::bigint = floor(extract(epoch from (now() - v_t)) * 1000)::bigint
              and (meta->>'anchor')::timestamptz = v_r0) <> 1
       or (select count(*) from public.player_ledger where user_id = v_g) <> v_l0 + 1 then
      raise exception 'h2: the return did not forfeit the spent 20 h absence exactly once (cap read %)', v_c;
    end if;
    -- Paid for that absence: tick v_t - v_r0 = cap; accrue 0.
    if extract(epoch from (v_t - v_r0)) * 1000 <> v_cap then
      raise exception 'h2b: the tick paid % ms of the absence, not the cap %', extract(epoch from (v_t - v_r0)) * 1000, v_cap;
    end if;

    -- ── h3 PARTIAL: 5 h ticked, the return reads the 7 h (cap - 5 h) remainder
    perform set_config('hr.frame_origin', 'tick', true);
    set local role hr_engine;
    v_r := public.hr_apply(v_p, 0, 1, '00000000-0000-4000-8000-0000000e7201',
             jsonb_build_object('accrued_to', to_jsonb(v_r0 + interval '5 hours'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    set local role hr_engine;
    v_c := public.hr_accrue_cap_ms(v_p, 0);
    reset role;
    if v_c <> v_cap - 5 * 3600000
       or (select version from public.player_state where user_id = v_p and slot = 0) <> 2 then
      raise exception 'h3: a 5 h-ticked 20 h absence did not read the % ms remainder (got %), or something was forfeited',
        v_cap - 5 * 3600000, v_c;
    end if;

    -- ── h4 NEVER TICKED: the same 20 h absence reads the full cap
    set local role hr_engine;
    v_c := public.hr_accrue_cap_ms(v_n, 0);
    reset role;
    if v_c <> v_cap or (select version from public.player_state where user_id = v_n and slot = 0) <> 1 then
      raise exception 'h4: an untouched 20 h absence read % (want the cap %), or was written', v_c, v_cap;
    end if;

    -- ── h5 ATTENDED: a non-tick settle carries the anchor; the tick then pays
    set local role hr_engine;
    v_r := public.hr_apply(v_o, 0, 1, '00000000-0000-4000-8000-0000000e7301',
             jsonb_build_object('accrued_to', to_jsonb(now() - interval '90 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('ticks', 1))));
    v_c := public.hr_accrue_cap_ms(v_o, 0);
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_c <> v_cap
       or (select real_return_at from public.hr_return_anchor where user_id = v_o and slot = 0)
          <> now() - interval '90 seconds' then
      raise exception 'h5a: an attended settle did not move the anchor with it (cap read %): %', v_c, v_r;
    end if;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_o, 0, 'gather', 2, now() - interval '90 seconds', now(),
             '00000000-0000-4000-8000-0000000e7302',
             jsonb_build_object('accrued_to', to_jsonb(now()),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'h5b: an armed window right after an attended settle was not paid: %', v_r;
    end if;

    -- ── h6 no anchor -> refused; a partied spent character is never forfeited
    delete from public.hr_return_anchor where user_id = v_x;
    update public.player_state set accrued_to = now() - interval '2 hours' where user_id = v_x;
    delete from public.hr_return_anchor where user_id = v_x;
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_h, v_x, 0, 'gather', 1, now() - interval '2 hours',
             now() - interval '2 hours' + interval '90 seconds', '00000000-0000-4000-8000-0000000e7401',
             jsonb_build_object('accrued_to', to_jsonb(now() - interval '2 hours' + interval '90 seconds'),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'ticks', 1))));
    reset role;
    perform set_config('hr.frame_origin', '', true);
    if v_r->>'error' is distinct from 'no_return_anchor' then
      raise exception 'h6a: a character with no anchor was not refused no_return_anchor: %', v_r;
    end if;
    insert into public.party (leader_user, leader_slot) values (v_q, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
      values (v_party, v_q, 0, 'leader', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, now());
    update public.hr_return_anchor set real_return_at = v_r0 - interval '10 hours' where user_id = v_q;
    set local role hr_engine;
    v_c := public.hr_accrue_cap_ms(v_q, 0);
    reset role;
    if v_c <> v_cap or (select version from public.player_state where user_id = v_q and slot = 0) <> 1 then
      raise exception 'h6b: a PARTIED character was forfeited or capped by the solo horizon (read %)', v_c;
    end if;

    -- ── kg
    if has_function_privilege('hr_engine', 'public.hr_accrue_cap_ms(uuid,integer)', 'execute') is not true then
      raise exception 'kg: hr_engine cannot execute hr_accrue_cap_ms';
    end if;
    for r in select c.role, f.fn
               from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('hr_tick')) c(role)
              cross join (values ('public.hr_accrue_cap_ms(uuid,integer)'), ('public.hr_return_anchor_stamp()')) f(fn) loop
      if (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, r.fn, 'execute') then
        raise exception 'kg: % holds EXECUTE on %', r.role, r.fn;
      end if;
    end loop;
    if has_function_privilege('hr_engine', 'public.hr_return_anchor_stamp()', 'execute') then
      raise exception 'kg: hr_engine holds EXECUTE on the stamp';
    end if;
    v_caught := false;
    begin
      set local role hr_tick;
      perform public.hr_accrue_cap_ms(v_n, 0);
    exception when insufficient_privilege then v_caught := true;
    end;
    reset role;
    if not v_caught then raise exception 'kg: hr_tick could read hr_accrue_cap_ms'; end if;
    for r in select t.rel, x.rolname
               from (values ('public.hr_return_anchor'), ('public.hr_tick_horizon_log')) t(rel)
              cross join (select rolname from pg_roles
                           where rolname in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick')) x loop
      if has_table_privilege(r.rolname, r.rel, 'select,insert,update,delete,truncate') then
        raise exception 'kg: % holds a privilege on %', r.rolname, r.rel;
      end if;
    end loop;
    if exists (select 1 from pg_class c
                where c.oid in ('public.hr_return_anchor'::regclass, 'public.hr_tick_horizon_log'::regclass)
                  and not (c.relrowsecurity and c.relforcerowsecurity))
       or exists (select 1 from pg_policy
                   where polrelid in ('public.hr_return_anchor'::regclass, 'public.hr_tick_horizon_log'::regclass)) then
      raise exception 'kg: hr_return_anchor / hr_tick_horizon_log must have RLS enabled AND forced, and no policy';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    update public.hr_tick_config set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    raise exception 'HR1010H_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1010H_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-presence-horizon: EXECUTED — a 20 h ticked absence is paid exactly the cap (tick to the '
               'horizon, refused past it and journalled once, forfeited on return); a partial one reads the exact '
               'remainder; an untouched one reads the full cap; an attended settle carries the anchor; no anchor '
               'pays nothing; a partied character is untouched; hr_engine only; hygiene strict — all green';
end $$;
