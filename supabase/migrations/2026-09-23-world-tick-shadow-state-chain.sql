-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-23-world-tick-shadow-state-chain.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE SHADOW TICK RE-SIMULATES EVERY WINDOW FROM THE SAME PLAYER ROW, SO THE
-- M3 PARITY READ CANNOT PASS. This file gives the chain a carrier.
--
-- ── THE MEASUREMENT ─────────────────────────────────────────────────────────
-- Production, 2026-09-23 16:40 UTC. The M3 combat cohort was armed in SHADOW at
-- 15:36 UTC on the QA account, slot 1: hp 4/10, no food in the bag, auto-eat
-- off, pointed at a slime. `hr_tick_shadow` over the 62 minutes since:
--
--     windows                    42
--     would_deaths = 1 in        41 of them
--     would_kills (total)        52
--     would_gold  (total)        103
--     would_hp                   4, in EVERY window
--     would_recovering_until     ~31 minutes past the END of every window
--
-- That is impossible for a chained simulation. A character who is knocked out
-- in window 1 spends the next twenty windows inside its own recovery clock and
-- files ZERO kills and ZERO deaths. Forty-one deaths in an hour, and the same
-- hp in all forty-two windows, is not a simulation result — it is the absence
-- of one. `src/core/away.js` Recovery Rule rev.2 settles the same span on the
-- player's return as ONE pass with state carried, and reports ~2 deaths/hour.
-- The M3 parity read 8c compares deaths, kills, hp and consec_falls EXACTLY,
-- so it was a guaranteed FAIL — and the natural reading of that failure is
-- "the tick's combat is wrong", which it is not.
--
-- ── THE ROOT CAUSE, WHICH IS ARCHITECTURAL AND NOT A SIM DEFECT ─────────────
-- Armed, the carrier between two fires is the database: hr_apply writes `hp`,
-- `fight`, `recovering_until`, the counters and the bag, and the next fire's
-- `hr_state_of` reads them back. SHADOW PAYS NOTHING — deliberately, and the
-- fence's own e15 asserts it — so `player_state` never moves.
--
-- 2026-09-21-world-tick-settle-fence.sql §8 journals the proposed delta into
-- `hr_tick_shadow` verbatim and chains exactly ONE thing:
-- `hr_tick_ownership.shadow_accrued_to`, the watermark. Nothing carries the
-- CHARACTER. `supabase/functions/hr-accrue/tick.js` step (5) then assembles
-- every session from `hr_state_of` — the real, frozen row — with only the
-- fence's watermark displaced. So each 90 s flush window re-simulates from
-- hp 4 with `recovering_until` already in the past.
--
-- The parity harness has known the carrier was missing since the day it was
-- written. `supabase/functions/hr-accrue/tick-shadow.js` `advance()` says so in
-- its own header: it exists "only so the shadow loop can carry a character
-- forward across windows WITHOUT A DATABASE". In production the database is the
-- carrier, and in shadow there is none.
--
-- ── THE CLASS, NOT THE FIELD (CLAUDE.md §3.2) ──────────────────────────────
-- `hp` is the one the measurement shows. It is not the only one. The full list
-- is every stateful continuation field the engine OUTPUTS and hr_apply WOULD
-- HAVE WRITTEN, enumerated from tick-contract.js's own ABSOLUTE/ADDITIVE lists
-- and accrual.js's delta contract, with the direction each one errs in:
--
--   hp                the measured defect: every window re-fights from the row
--   recovering_until  the knockout never sticks               PAYING
--   consec_falls      `retreatAtFall` never fires; the pointer never ends
--   fight             every window restarts the foe at full HP: kills inflate
--   ammo_carry        the sub-action remainder is forfeit every window
--   tool_carry        the same, on GATHER, and it is forfeit TODAY
--   activity          a pointer the engine idled keeps being settled
--   gold / xp / items the bag is the one input the engine SPENDS. Without it
--                     auto-eat eats the SAME food every window — an infinite
--                     larder                                  PAYING
--   deaths_today,     `recoveryFor()` prices a fall from these, so a character
--   deaths_lifetime   six falls into the day is handed the first-death novice
--                     grace on every window                    PAYING
--   vigour spent_min  the daily budget refills itself every window, so
--                     `vigourMult` never decays                PAYING
--   bestiary kills    the charm index's counter                under-paying
--
-- Four of those run in the PAYING direction, which is why this is not "the
-- shadow reads low". `advance()` was itself missing the death counters and the
-- vigour charge; this lane adds them, read off the engine's OWN `progress` ops.
--
-- ── DESIGN CONSTRAINTS, ARGUED ─────────────────────────────────────────────
-- (1) NO SECOND COPY OF hr_apply. Nothing in this file computes a delta,
--     applies one, or clamps one. §2's shadow branch does exactly two things
--     with the new argument: it CHECKS its shape and it STORES IT VERBATIM.
--     The carried state is the ENGINE'S OWN OUTPUT STATE for the window — the
--     continuation object `advance()` already holds, which is the same object
--     the attended loop and tests/world-tick-combat-parity.mjs carry between
--     windows — serialised by `shadowStateOf` in tick-contract.js and passed
--     as ONE jsonb argument. If the arithmetic ever moves into SQL, the fence
--     has become the second writer of player value that the whole fence exists
--     to prevent.
--
-- (2) IT LIVES NEXT TO THE WATERMARK IT CHAINS, ON hr_tick_ownership, and it is
--     written ONLY on the shadow branch, under the SAME row lock as
--     `shadow_accrued_to`, in the same statement. One lock, one write, no
--     window in which the mark has moved and the state has not. It is CLEARED
--     together with `shadow_accrued_to` when an armed settle succeeds, for the
--     reason the fence's §9 already gives about the mark: a stale carrier left
--     lying around is a second source of truth nobody reads, which is how a
--     state that is WRONG survives long enough to be believed the next time
--     somebody re-enters shadow.
--     AND AN ARMED WINDOW MAY NOT CARRY ONE. A non-null `p_shadow_state` on
--     the armed branch is REFUSED (`shadow_state_while_armed`) before hr_apply
--     is reached — never ignored. A carrier that is silently dropped on the
--     branch that PAYS is exactly how a proposal built in the other mode gets
--     believed by the writer.
--
-- (3) THE OVERLAY IS A DISPLAY OF THE SHADOW'S OWN PROPOSALS, NEVER AUTHORITY.
--     The driver seeds every session from `hr_state_of`, field by field, as it
--     does today, and lays the carrier over it ONLY when the fence reports it
--     is chaining — `shadow_accrued_to > accrued_to`. Nothing tradeable is
--     written by any of it: the whole output of a shadow window is a row in
--     `hr_tick_shadow`, which tests/restore-census.baseline.json classifies
--     `operational` + `player_value_exempt` on the basis that losing every row
--     of it costs a measurement and not a progression. The edge additionally
--     drops the overlay when `player_state.version` has moved since the
--     carrier was built, so ANY real write to the character (a purchase, a
--     claim, a client accrue) ends the chain rather than being papered over.
--
-- (4) THE CARRIER RIDES THE `window_already_settled` REFUSAL, NOT THE ROSTER.
--     This is the choice the brief asks to be argued, and the roster loses.
--     `hr_tick_roster` is executable by `hr_tick` and by NOTHING ELSE, and
--     `hr_tick` is not a role the edge can become — so a roster row does not
--     reach the settling role directly. It arrives in the driver's REQUEST
--     BODY, projected by `hr_tick_cron_run`. Putting the continuation state
--     there would make "the server picks whose world ticks, and from when" a
--     claim about a POST rather than about a row somebody else wrote, and a
--     tick host that could edit its own payload could hand the engine any hp,
--     any recovery clock and any bag it liked. It journals nothing tradeable
--     today — but this measurement is what GATES ARMING, and a measurement the
--     caller can author is not a measurement.
--     The refusal path has none of that: the driver's `probeWatermark` already
--     learns the mark from this exact refusal, read under the fence's own
--     `for update` on the ownership row, inside the settling role's own
--     transaction. One lock, one answer, one statement, and no new read.
--
-- (5) `hr_tick_shadow` IS UNTOUCHED. It keeps storing the proposed delta
--     verbatim and gains no column. Parity is still measured against the
--     object hr_apply would have received, which is the whole reason §2 of the
--     fence stores it that way.
--
-- (6) THE CARRIER IS BOUNDED, AND A BREACH IS NOT A CLAMP. `inventory` can be
--     hundreds of stacks and this column rides every ticked character's
--     ownership row. So the maps hold only the keys a window actually MOVED,
--     and they are CUMULATIVE — bounded by the drop table plus the auto-eat
--     foods reachable from ONE pointer, measured at 6 keys and ~700 bytes over
--     a ten-minute goblin grind. The ceiling is 16 KiB, declared twice and
--     agreeing: `MAX_SHADOW_STATE_BYTES` in tick-contract.js (where the edge
--     returns null rather than send an oversized state) and the CHECK
--     constraint in §1 (where the database refuses to store one). Breaching it
--     restarts the chain from `hr_state_of`, which UNDER-reports; silently
--     dropping half a bag would make the measurement lie.
--
-- ── WHAT MOVES, AND WHAT DOES NOT ──────────────────────────────────────────
-- MOVES: `hr_tick_settle` (a tenth parameter; the nine-argument signature is
--        DROPPED — see §2), `hr_assert_grant_hygiene` (§4, link 13, the first
--        REPLACING link in that chain), and `hr_tick_ownership` gains one
--        nullable column.
-- DOES NOT: hr_apply, hr_state_of, hr_tick_roster, hr_tick_config,
--        hr_tick_shadow, hr_tick_cron_run, every RLS policy, every client
--        grant. No client role gains or loses anything; no client can reach
--        any of this.
--
-- ⚠ APPLYING THIS FILE CHANGES THE BEHAVIOUR OF NOTHING ON ITS OWN. The tenth
--   parameter is `default null`, so the CURRENTLY DEPLOYED edge payload — which
--   calls with nine arguments — keeps working unchanged across the apply, and a
--   null carrier is exactly today's behaviour. The chain begins when the edge
--   half ships. That is deliberate: migration BEFORE edge, because the new
--   payload sends an argument the old function does not have.
--
-- ── AFTER APPLYING, tests/live-hash-drift.mjs IS RED WITH THREE PROBLEMS, NOT
--    ONE (Security S-6, 2026-09-23; measured credential-free on this branch,
--    exit 1). All three are this file and all three are deliberate:
--      (1) RED replay hr_assert_grant_hygiene(p_strict boolean) — §4 restates
--          the detector as link 13 of HR_GRANT_HYGIENE_CHAIN.
--      (2) RED replay-missing hr_tick_settle(text,uuid,integer,text,bigint,
--          timestamptz,timestamptz,uuid,jsonb) — §2 DROPS the nine-argument
--          door and production still has it until this file lands.
--      (3) RED replay-extra hr_tick_settle(…,jsonb,jsonb) — §2 creates the
--          ten-argument door and production does not have it yet.
--    The Coordinator re-seeds tests/live-hash-drift.baseline.json with
--    `--live --write` and writes THREE whys from `--codediff` (CLAUDE.md §2 —
--    agents never touch that file); `touched_by` for BOTH hr_tick_settle and
--    hr_assert_grant_hygiene gains this filename. A note that named ONE entry
--    against a guard that wants three is how a re-seed ends up with two
--    unexplained rows — the failure 2026-09-23-frame-emit-from-apply.sql was
--    made to write down. NO NEW TABLE (shadow_state is a column on an existing
--    one), so `restore-census` re-pins as a no-op.
--
-- REVERSIBLE: `update public.hr_tick_ownership set shadow_state = null;` stops
-- the chain with nothing else touched. Re-applying the fence file restores the
-- nine-argument door, and the allowlist entry with it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT — FAIL CLOSED ON WHAT THIS BUILDS ON ───────────────────────
do $$
begin
  if to_regclass('public.hr_tick_ownership') is null then
    raise exception 'hr_tick_ownership is absent — apply 2026-09-20-world-tick-roster.sql first';
  end if;
  if to_regprocedure('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb)') is null
     and to_regprocedure('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)') is null then
    raise exception 'hr_tick_settle is absent in BOTH signatures — apply '
                    '2026-09-21-world-tick-settle-fence.sql first';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene is absent — §4 would install a detector with no predecessor';
  end if;
  -- §4 is DERIVED from 2026-09-22-engine-allowlist-hunt-reads.sql's committed
  -- body. If the INSTALLED detector does not already carry that link's two
  -- entries, this file's body would silently REVERT them — the exact drift
  -- tools/derive-grant-hygiene.mjs and PART 1f-ii exist to catch, failing
  -- closed here because a `create or replace` cannot be un-run.
  if strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
            'hr_hunt_analyzer') = 0
  or strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
            'hr_vigour_of') = 0 then
    raise exception 'the INSTALLED hr_assert_grant_hygiene does not carry link 12 '
                    '(hr_hunt_analyzer / hr_vigour_of) — §4 would revert it. Apply '
                    '2026-09-22-engine-allowlist-hunt-reads.sql first, or re-derive this file '
                    'onto whatever production actually has';
  end if;
end $$;

-- ── §1 THE CARRIER COLUMN ───────────────────────────────────────────────────
-- Next to the watermark it chains, on the operator table, nullable, with no
-- default. NULL is "this chain has nothing to carry yet" and is the state every
-- row is in the instant this file applies — which is why applying it changes
-- nothing.
alter table public.hr_tick_ownership
  add column if not exists shadow_state jsonb;

comment on column public.hr_tick_ownership.shadow_state is
  'SHADOW ONLY. The engine''s own output state at `shadow_accrued_to`, stored '
  'verbatim by hr_tick_settle''s shadow branch so the next shadow window is '
  'seeded from where the last one left the character instead of from the frozen '
  'player_state row. NOT player value and never authority: nothing reads it to '
  'decide a number a player can spend, and it is cleared the moment an armed '
  'settle pays. Written only under the same row lock as shadow_accrued_to.';

-- THE BOUND, ENFORCED WHERE IT CANNOT BE ARGUED WITH. 16 KiB against a measured
-- ~700 bytes. `tick-contract.js` MAX_SHADOW_STATE_BYTES is the same number on
-- the edge side, so an oversized carrier is dropped before it is sent AND
-- refused if it is; the two agree by declaration, not by luck. An object, not a
-- scalar or an array — `applyShadowState` reads named keys.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'hr_tick_ownership_shadow_state_ck'
                    and conrelid = 'public.hr_tick_ownership'::regclass) then
    alter table public.hr_tick_ownership
      add constraint hr_tick_ownership_shadow_state_ck
      check (shadow_state is null
             or (jsonb_typeof(shadow_state) = 'object'
                 and octet_length(shadow_state::text) <= 16384));
  end if;
end $$;

-- ── §2 hr_tick_settle — THE DOOR, WITH A CARRIER ───────────────────────────
-- ⚠ THE NINE-ARGUMENT SIGNATURE IS DROPPED, AND IT HAS TO BE.
--   `create or replace function` can only replace a function whose argument
--   list is unchanged, so adding `p_shadow_state` CREATES A SECOND FUNCTION.
--   Left in place that is two doors to hr_apply where the fence's entire claim
--   is that there is exactly one — and the older door chains nothing, so a
--   caller that found it would reproduce the defect this file closes. It is
--   also not merely untidy: a nine-argument call would then match both
--   candidates and Postgres answers 42725 `function is not unique`, so the
--   driver's probe fails closed on every fire. e3 below asserts the old
--   signature is GONE and the new one is the only one.
--   The drop takes the grants with it, so §3 re-issues revoke-then-grant, and
--   §4 replaces the allowlist entry (keyed on `regprocedure`, so a changed
--   signature is a different string).
drop function if exists public.hr_tick_settle(
  text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb);

create or replace function public.hr_tick_settle(
  p_holder       text,
  p_user         uuid,
  p_slot         int,
  p_channel      text,
  p_version      bigint,
  p_window_from  timestamptz,
  p_window_to    timestamptz,
  p_intent_id    uuid,
  p_delta        jsonb,
  -- ── THE TENTH. `default null` so the CURRENTLY DEPLOYED nine-argument edge
  --    payload keeps working across the apply: migration before edge, and no
  --    window in which the driver calls a function that does not exist.
  --    A null carrier IS today's behaviour, exactly.
  p_shadow_state jsonb default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  -- ── ★ AN ARMED WINDOW MAY NOT CARRY A SHADOW STATE ★ (design constraint 2).
  --    REFUSED, not ignored, and refused HERE — before the lock, before the
  --    lease, and a very long way before hr_apply. Ignoring it would mean the
  --    branch that PAYS silently accepted an argument built for the branch that
  --    does not, which is precisely how a stale proposal gets believed by the
  --    writer. It is also the honest answer to an operator who arms the tick
  --    between the driver's watermark probe and its settle: that one settle is
  --    refused, loudly and countably, and the next fire runs armed with no
  --    carrier. The tick pays nothing rather than paying against a proposal
  --    that was built in the other mode.
  if p_shadow_state is not null and not v_cfg.shadow then
    return jsonb_build_object('ok', false, 'error', 'shadow_state_while_armed');
  end if;
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

  -- ── (5) THE POINTER MUST STILL BE WHERE THE ROSTER SAW IT. Unchanged.
  if v_st.active_kind is distinct from p_channel then
    return jsonb_build_object('ok', false, 'error', 'channel_moved',
      'active_kind', v_st.active_kind);
  end if;

  -- ── (6) ★ THE WATERMARK COMPARE-AND-SET ★ — unchanged in every term.
  v_mark := case when v_cfg.shadow
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
    when v_cfg.shadow
     and v_own.shadow_state is not null
     and v_own.shadow_accrued_to is not null
     and v_own.shadow_accrued_to > v_st.accrued_to
    then jsonb_build_object('shadow_state', v_own.shadow_state)
    else '{}'::jsonb end;

  if p_window_from < v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_from', p_window_from, 'accrued_to', v_mark, 'shadow', v_cfg.shadow)
      || v_chain;
  end if;
  if p_window_to <= v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_to', p_window_to, 'accrued_to', v_mark, 'shadow', v_cfg.shadow)
      || v_chain;
  end if;

  -- ── (7) THE VERSION. Unchanged.
  if p_version is null or p_version <> v_st.version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict',
      'held', p_version, 'current', v_st.version);
  end if;

  -- ── (8) SHADOW MODE. Journal what WOULD have been paid; pay nothing. There
  --        is still no hr_apply call on this branch and there must never be one.
  if v_cfg.shadow then
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
    return jsonb_build_object('ok', true, 'mode', 'shadow', 'paid', false,
      'window_to', p_window_to, 'journalled', v_ins > 0,
      'chained', v_ins > 0 and p_shadow_state is not null);
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
  return v_out || jsonb_build_object('mode', 'armed', 'paid',
    coalesce((v_out->>'ok')::boolean, false));
end $$;

-- ── §3 GRANTS — RE-ISSUED, BECAUSE §2's DROP TOOK THE OLD ONES ─────────────
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2). A
-- dropped function's ACL goes with it, so this is not belt-and-braces: without
-- these lines the new door is unreachable by the one role that must reach it,
-- and — far worse — PUBLIC would hold the default EXECUTE that `revoke` exists
-- to take away. e4 below asserts both halves by execution.
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from hr_tick';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'grant execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) to hr_engine';
  else
    raise exception 'hr_engine does not exist — the fence would be unreachable by the only role allowed to open it';
  end if;
end $$;

-- ── §4 hr_assert_grant_hygiene — LINK 13, A REPLACEMENT ────────────────────
-- GENERATED by tools/derive-grant-hygiene.mjs (LINKS[12]) from
-- 2026-09-22-engine-allowlist-hunt-reads.sql's committed body. Do NOT
-- hand-edit; `--check` is a preflight in tests/run-smoke.mjs and PART 1f-ii
-- walks this as the chain's THIRTEENTH link. This file is the CURRENT LAST
-- TOUCHER of the detector.
--
-- ⚠ THE FIRST REPLACING LINK IN THIS CHAIN, so its declared-removals list in
--   tests/run-sql-tests.mjs PART 1f-ii is NON-EMPTY and holds exactly the old
--   nine-argument signature line. The entry is keyed on
--   `p.oid::regprocedure::text` — deliberately, because keying on `proname`
--   accepts any overload and that is defect 2 in check (7)'s own header. So a
--   changed signature is a DIFFERENT STRING: leaving the old line records a
--   door that no longer exists (reported under `lost`) while the REAL door
--   raises `engine_execute_outside_allowlist` on the nightly cron every night;
--   adding the new line without removing the old records a door that is gone
--   as though it were still open. A replacement is the only honest edit.
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

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
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
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- create-or-replace preserves an ACL; be explicit anyway, exactly as every
-- other link of this chain is. The detector is nobody's to call: there is no
-- grant line here, and PUBLIC holds nothing.
revoke execute on function public.hr_assert_grant_hygiene(boolean) from public;
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from anon, authenticated, service_role;

-- ── §5 SELF-CHECK — EXECUTED (CLAUDE.md §4) ────────────────────────────────
-- PROBE ROWS ONLY. Every row this block touches is one it inserted itself,
-- under a uuid `gen_random_uuid()` cannot mint, and every predicate binds `v_u`
-- — a variable this block declared (tests/selfcheck-no-global-dml.mjs). The
-- whole block is rolled back regardless of outcome. Properties are asserted BY
-- EXECUTING SQL, never by markers.
do $$
declare
  v_u     uuid := '00000000-0000-4000-8000-00000000f2ce';
  v_act   text;
  v_r     jsonb;
  v_n     int;
  v_g     bigint;
  v_v     bigint;
  v_hp    int;
  v_w     timestamptz;
  v_state jsonb;
  v_from  timestamptz := date_trunc('second', now()) - interval '10 minutes';
  v_t1    timestamptz := date_trunc('second', now()) - interval '8 minutes';
  v_t2    timestamptz := date_trunc('second', now()) - interval '6 minutes';
  v_d     jsonb;
  v_s1    jsonb := jsonb_build_object('v', 1, 'base_version', 1,
                     'hp', 4, 'consec_falls', 2, 'gold', 17,
                     'items', jsonb_build_object('cooked_trout', -3));
  v_s2    jsonb := jsonb_build_object('v', 1, 'base_version', 1, 'hp', 9);
  v_shadow_before  boolean;
  v_enabled_before boolean;
  v_shadow         boolean;
  v_enabled        boolean;
begin
  begin
    -- ── e1: THE COLUMN EXISTS, IS NULLABLE, AND EVERY EXISTING ROW IS NULL.
    --        "Applying this file changes the behaviour of nothing" is a claim
    --        about exactly this: a null carrier IS today's behaviour.
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'hr_tick_ownership'
       and column_name = 'shadow_state' and is_nullable = 'YES'
       and data_type = 'jsonb' and column_default is null;
    if v_n <> 1 then
      raise exception 'e1: hr_tick_ownership.shadow_state is not a nullable jsonb with no default';
    end if;
    select count(*) into v_n from public.hr_tick_ownership where shadow_state is not null;
    if v_n <> 0 then
      raise exception 'e1b: % ownership row(s) already carry a shadow_state at apply time', v_n;
    end if;

    -- ── e2: THE BOUND BITES, AND IT BITES IN THE DATABASE. An object over
    --        16 KiB and a non-object are both refused by the CHECK, so the
    --        edge's MAX_SHADOW_STATE_BYTES is a courtesy and not the defence.
    insert into auth.users (id) values (v_u) on conflict do nothing;
    select activity_id into v_act from public.hr_activities where kind = 'gather' limit 1;
    if v_act is null then
      raise notice 'self-check SKIPPED past e1: no gather activity to point a probe at';
      raise exception 'HR923_ROLLBACK_OK';
    end if;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 500, 0, 10, 10, 1, v_from, 'gather', v_act, v_from - interval '1 hour');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_u, 0, 'gather', true, 'selfcheck', now() + interval '5 minutes');

    begin
      update public.hr_tick_ownership
         set shadow_state = jsonb_build_object('pad', repeat('x', 20000))
       where user_id = v_u and slot = 0 and channel = 'gather';
      raise exception 'e2: the CHECK accepted a shadow_state over 16 KiB';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_ownership set shadow_state = '[1,2,3]'::jsonb
       where user_id = v_u and slot = 0 and channel = 'gather';
      raise exception 'e2b: the CHECK accepted a shadow_state that is not an object';
    exception when check_violation then null;
    end;

    -- ── e3: EXACTLY ONE hr_tick_settle EXISTS, AND IT IS THE TEN-ARGUMENT ONE.
    --        The nine-argument door chains nothing; left alongside, a
    --        nine-argument call matches both candidates and Postgres answers
    --        42725, so the driver's probe fails closed on every fire.
    if to_regprocedure('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb)') is not null then
      raise exception 'e3: the NINE-argument hr_tick_settle survived — two doors, and an ambiguous call';
    end if;
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_tick_settle';
    if v_n <> 1 then
      raise exception 'e3b: % hr_tick_settle overload(s) exist, expected exactly 1', v_n;
    end if;

    -- ── e4: THE DROP TOOK THE GRANTS AND §3 PUT THEM BACK. PUBLIC must not
    --        hold the default EXECUTE a dropped-and-recreated function is born
    --        with, and `hr_engine` must hold the one grant.
    if has_function_privilege('public',
         'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'EXECUTE') then
      raise exception 'e4: PUBLIC holds EXECUTE on the re-created hr_tick_settle';
    end if;
    foreach v_act in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_act,
           'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'EXECUTE') then
        raise exception 'e4b: % holds EXECUTE on hr_tick_settle — a client can reach the fence', v_act;
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'hr_engine')
       and not has_function_privilege('hr_engine',
         'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'EXECUTE') then
      raise exception 'e4c: hr_engine lost EXECUTE on hr_tick_settle — the fence is unreachable';
    end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick')
       and has_function_privilege('hr_tick',
         'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'EXECUTE') then
      raise exception 'e4d: hr_tick holds EXECUTE on hr_tick_settle — a door that cannot open, '
                      'and a forgery alert every fire';
    end if;

    select shadow, enabled into v_shadow_before, v_enabled_before from public.hr_tick_config where id;
    update public.hr_tick_config set enabled = true, shadow = true where id;
    -- The probe's channel must be one the config owns, or (2) refuses first.
    update public.hr_tick_config set channels = array['combat','gather','artisan'] where id;

    v_d := jsonb_build_object(
      'gold', 17,
      'accrued_to', to_jsonb(v_t1),
      'journal', jsonb_build_object('kind','gather','intent','accrue',
        'meta', jsonb_build_object('src','tick','qty',7,'ticks',3)));

    -- ── e5: ★ A SHADOW SETTLE STORES THE STATE AND MOVES THE MARK, UNDER ONE
    --        LOCK, IN ONE STATEMENT. The defect this file exists to close.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_t1,
             '00000000-0000-4000-8000-0000000000a1', v_d, v_s1);
    if coalesce(v_r->>'error','') <> '' or coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e5: the shadow settle was refused (%)', v_r;
    end if;
    if v_r->>'mode' <> 'shadow' or (v_r->>'paid')::boolean is not false then
      raise exception 'e5b: a shadow settle reported mode/paid as (%)', v_r;
    end if;
    select shadow_accrued_to, shadow_state into v_w, v_state
      from public.hr_tick_ownership where user_id = v_u and slot = 0 and channel = 'gather';
    if v_w is distinct from v_t1 then
      raise exception 'e5c: shadow_accrued_to is %, expected %', v_w, v_t1;
    end if;
    if v_state is distinct from v_s1 then
      raise exception 'e5d: shadow_state was not stored VERBATIM — stored %, sent %', v_state, v_s1;
    end if;

    -- ── e6: ★ e15 STILL HOLDS. A shadow settle moves NO player value. The
    --        whole claim of shadow mode, re-asserted on the branch this file
    --        changed, because a carrier written on the paying branch by mistake
    --        would be invisible to every other check here.
    select gold, version, accrued_to, hp into v_g, v_v, v_w, v_hp from public.player_state
     where user_id = v_u and slot = 0;
    if v_g <> 500 or v_v <> 1 or v_w is distinct from v_from then
      raise exception 'e6: a shadow settle MOVED player value — gold %, version %, accrued_to % '
                      '(expected 500 / 1 / %)', v_g, v_v, v_w, v_from;
    end if;
    /* ── hp AND inventory, EXPLICITLY (Security S-3, 2026-09-23) ───────────
       gold/version/accrued_to were the fence's original e15 triple, written
       before anything carried a character. THIS file's whole subject is `hp`
       and the bag: `v_s1` above says hp 4 and cooked_trout -3 against a probe
       row at hp 10 with an empty inventory, so a carrier that leaked onto the
       PAYING side would land exactly here — and the triple above would not
       notice. Asserting the two fields the carrier actually carries is what
       makes e6 a check of THIS change rather than an inherited one. */
    if v_hp <> 10 then
      raise exception 'e6c: a shadow settle MOVED hp — % (expected 10); the carrier reached player_state', v_hp;
    end if;
    select count(*) into v_n from public.player_inventory where user_id = v_u and slot = 0;
    if v_n <> 0 then
      raise exception 'e6d: a shadow settle wrote % player_inventory row(s) — the carrier''s bag was paid', v_n;
    end if;
    select count(*) into v_n from public.player_ledger where user_id = v_u;
    if v_n <> 0 then raise exception 'e6b: a shadow settle wrote % ledger row(s)', v_n; end if;

    -- ── e7: THE CARRIER COMES BACK ON THE `window_already_settled` REFUSAL —
    --        the channel the driver's probeWatermark already reads the mark
    --        from (design constraint 4). This IS the read path; if it does not
    --        answer here, the chain is write-only and the defect is unfixed.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1,
             '1970-01-01T00:00:00Z'::timestamptz, now(),
             '00000000-0000-4000-8000-000000000000',
             jsonb_build_object('accrued_to', to_jsonb(now())));
    if coalesce(v_r->>'error','') <> 'window_already_settled' then
      raise exception 'e7: the probe was answered % rather than window_already_settled', v_r;
    end if;
    if (v_r->'shadow_state') is distinct from v_s1 then
      raise exception 'e7b: the probe did not carry the stored state back — got %', v_r->'shadow_state';
    end if;
    if (v_r->>'shadow')::boolean is not true then
      raise exception 'e7c: the probe did not report the mode the fence is in';
    end if;

    -- ── e8: A SECOND SHADOW SETTLE WITH THE SAME INTENT ID IS A NO-OP FOR
    --        BOTH. The watermark CAS refuses the replay on arithmetic before
    --        §8 is reached, so neither the journal nor the carrier moves — and
    --        crucially the carrier is NOT overwritten by the replay's argument.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_t1,
             '00000000-0000-4000-8000-0000000000a1', v_d, v_s2);
    if coalesce(v_r->>'error','') <> 'window_already_settled' then
      raise exception 'e8: a replayed shadow window was not refused (%)', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_u and slot = 0;
    if v_n <> 1 then raise exception 'e8b: the replay journalled a second row (% rows)', v_n; end if;
    select shadow_accrued_to, shadow_state into v_w, v_state
      from public.hr_tick_ownership where user_id = v_u and slot = 0 and channel = 'gather';
    if v_w is distinct from v_t1 or v_state is distinct from v_s1 then
      raise exception 'e8c: the replay moved the mark or overwrote the carrier (% / %)', v_w, v_state;
    end if;

    -- ── e9: THE CHAIN TILES. The NEXT window starts where the last one ended,
    --        is accepted, and REPLACES the carrier rather than merging into it.
    v_d := jsonb_build_object(
      'gold', 5, 'accrued_to', to_jsonb(v_t2),
      'journal', jsonb_build_object('kind','gather','intent','accrue',
        'meta', jsonb_build_object('src','tick','qty',2,'ticks',1)));
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_t1, v_t2,
             '00000000-0000-4000-8000-0000000000a2', v_d, v_s2);
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e9: the chained window was refused (%)', v_r;
    end if;
    select shadow_accrued_to, shadow_state into v_w, v_state
      from public.hr_tick_ownership where user_id = v_u and slot = 0 and channel = 'gather';
    if v_w is distinct from v_t2 or v_state is distinct from v_s2 then
      raise exception 'e9b: the chain did not advance to (% / %) — got (% / %)', v_t2, v_s2, v_w, v_state;
    end if;

    -- ── e10: ★ AN ARMED SETTLE REFUSES A CARRIER, AND IT REFUSES IT BEFORE
    --         hr_apply. Design constraint 2. `shadow = false` in the SAME
    --         transaction; the whole block rolls back regardless.
    update public.hr_tick_config set shadow = false where id;
    select gold, version into v_g, v_v from public.player_state where user_id = v_u and slot = 0;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', v_v, v_t2,
             date_trunc('second', now()) - interval '4 minutes',
             '00000000-0000-4000-8000-0000000000a3',
             jsonb_build_object('gold', 9,
               'accrued_to', to_jsonb(date_trunc('second', now()) - interval '4 minutes'),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))),
             v_s2);
    if coalesce(v_r->>'error','') <> 'shadow_state_while_armed' then
      raise exception 'e10: an ARMED settle accepted a shadow_state (%)', v_r;
    end if;
    select gold into v_g from public.player_state where user_id = v_u and slot = 0;
    if v_g <> 500 then
      raise exception 'e10b: the refused armed settle still paid — gold is %', v_g;
    end if;
    -- ...and the carrier it refused did not touch the stored one.
    select shadow_state into v_state from public.hr_tick_ownership
     where user_id = v_u and slot = 0 and channel = 'gather';
    if v_state is distinct from v_s2 then
      raise exception 'e10c: a refused armed settle overwrote the carrier';
    end if;

    -- ── e11: AN ARMED SETTLE THAT PAYS CLEARS BOTH, TOGETHER. A stale carrier
    --         left behind is a second source of truth nobody reads — which is
    --         how a state that is WRONG survives to be believed the next time
    --         somebody re-enters shadow.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', v_v, v_t2,
             date_trunc('second', now()) - interval '4 minutes',
             '00000000-0000-4000-8000-0000000000a4',
             jsonb_build_object('gold', 9,
               'accrued_to', to_jsonb(date_trunc('second', now()) - interval '4 minutes'),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))));
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      /* ⚠ NOT A SILENT PASS, AND NOT THE ONLY COVERAGE. hr_apply's impersonation
         seam tests `current_setting('role') = 'hr_engine'` LITERALLY (S-1), so
         a self-check running as the APPLYING role is refused
         `forbidden_impersonation` and no payment lands — which would leave the
         clearing half of §9 asserted by nothing. This block does NOT assume the
         role to force it: `set local role` inside an apply is a risk to the
         apply itself for a property that does not need to be proved here.
         tests/world-tick-shadow-chain.mjs SC-10 presents `hr_engine` exactly as
         the edge does, on a database rebuilt from supabase/migrations, and
         asserts the payment LANDS and clears both — measured, and it runs on
         every CI build. This notice names which of the two ran. */
      raise notice 'e11 asserted by tests/world-tick-shadow-chain.mjs SC-10 instead: the armed '
                   'settle was refused here (%) because the applying role is not hr_engine', v_r;
    else
      select shadow_accrued_to, shadow_state into v_w, v_state
        from public.hr_tick_ownership where user_id = v_u and slot = 0 and channel = 'gather';
      if v_w is not null or v_state is not null then
        raise exception 'e11: an armed payment left the shadow chain behind (% / %)', v_w, v_state;
      end if;
    end if;

    -- ── e12: THE ALLOWLIST NAMES THE DOOR THAT EXISTS. §4's detector must
    --         carry the TEN-argument signature and must NOT carry the nine —
    --         the first is `engine_execute_outside_allowlist` every night, the
    --         second is a door recorded as open that is gone.
    if strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
              'timestamp with time zone,uuid,jsonb,jsonb)') = 0 then
      raise exception 'e12: the detector does not allowlist the ten-argument hr_tick_settle';
    end if;
    if strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
              'timestamp with time zone,uuid,jsonb)''') > 0 then
      raise exception 'e12b: the detector still allowlists the DROPPED nine-argument signature';
    end if;
    -- ...and link 12's entries survived the restatement (the revert class).
    if strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
              'hr_hunt_analyzer') = 0
    or strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
              'hr_vigour_of') = 0 then
      raise exception 'e12c: §4 REVERTED link 12 — hr_hunt_analyzer / hr_vigour_of are gone';
    end if;

    -- ── e13: ★ THE DETECTOR IS GREEN ON THE DOOR AS IT NOW EXISTS ★
    --         e12 proves the allowlist SAYS the right thing. Only this proves
    --         it WORKS: `check (7)` compares `regprocedure` strings against the
    --         live catalog, so a replacement that got one character wrong would
    --         satisfy e12 and still raise `engine_execute_outside_allowlist` on
    --         the nightly hr-grant-hygiene cron, every night, on the one door
    --         the world tick has to player value. Non-strict first, so the whole
    --         report comes back rather than the first raise.
    v_r := public.hr_assert_grant_hygiene(false);
    if (v_r->'engine_execute_outside_allowlist') is not null
       and jsonb_array_length(v_r->'engine_execute_outside_allowlist') > 0 then
      raise exception 'e13: hr_engine holds EXECUTE outside its allowlist after this file: %',
        v_r->'engine_execute_outside_allowlist';
    end if;
    -- ...and the whole detector, STRICT — what the cron actually runs. A file
    -- that restated the allowlist without running it would be proving its own
    -- edit rather than its effect.
    v_r := public.hr_assert_grant_hygiene(true);
    raise notice 'e13: GRANT HYGIENE STRICT PASSES with the ten-argument hr_tick_settle recorded.';
    -- ── e14: AND IT IS STILL A DETECTOR. A body that recorded the entry and
    --         stopped checking would satisfy e12 and e13 and be worthless.
    if strpos(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure),
              'c_engine_allow') = 0 then
      raise exception 'e14: the detector no longer consults c_engine_allow at all';
    end if;

    /* ── THE TWO SWITCHES THIS BLOCK FLIPPED, RESTORED AND READ BACK
       (Security S-5, 2026-09-23). `v_shadow_before` / `v_enabled_before` were
       captured above and then never used, which reads like a restore that is
       not one. The rollback below IS the real mechanism — but `enabled` and
       `shadow` are the two booleans that decide whether the world tick PAYS,
       and the M5 frame-emit review already ruled (f11d) that no boolean,
       least of all one that arms a payer, is left to a rollback that might
       not take. Restored explicitly, then re-read, so a rollback that did not
       take is harmless rather than an armed tick. */
    update public.hr_tick_config set enabled = v_enabled_before, shadow = v_shadow_before where id;
    select shadow, enabled into v_shadow, v_enabled from public.hr_tick_config where id;
    if v_shadow is distinct from v_shadow_before or v_enabled is distinct from v_enabled_before then
      raise exception 'e14b: hr_tick_config was not restored — shadow %/% enabled %/%',
        v_shadow, v_shadow_before, v_enabled, v_enabled_before;
    end if;

    raise exception 'HR923_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR923_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-shadow-state-chain self-check PASSED (e1-e14); probe rows rolled back';
end $$;
