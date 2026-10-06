-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-06-world-tick-channel-arm.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- PER-CHANNEL ARMING, AND SHADOW-CHAIN ADMISSION.
-- docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md rulings 5 and 1 (admission half).
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- Ruling 5: `hr_tick_config.shadow` was ONE global flag, so `shadow = false` —
-- the only way to arm gather — would also arm combat, which is blocked on M3,
-- the §16.6 attended fence and §7a. `array_remove(channels, 'combat')` is
-- refused too: it stops the combat shadow M3/M4 are measuring.
-- Ruling 1: the solo roster dropped a character 24 h after its last REAL
-- settle, even while its shadow chain was current — so a shadow measurement
-- of a character who never returns ends at 24 h, silently (S-14).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 `hr_tick_config.armed_channels text[] NOT NULL DEFAULT '{}'` REPLACES the
--    global `shadow` column, which is DROPPED (one authority — two flags that
--    can disagree is the browser-vs-server class pointed at the operator).
--    A channel in `armed_channels` PAYS; every other channel in `channels` is
--    SHADOW. On first apply the column is born '{}' — nothing armed, whatever
--    `shadow` said — so applying this file changes no behaviour on production
--    (shadow everywhere today). CHECK `hr_tick_config_armed_ck`:
--    `armed_channels <@ channels` (which refuses a NULL element), one
--    dimension, and the whole predicate coalesced to false so a NULL can
--    never pass (S-5).
-- §2 `hr_tick_admit(armed, accrued_to, mark) -> text`, the ONE admission
--    predicate: 'admit' | 'fenced_24h' | 'shadow_expired'.
--      armed   raw `accrued_to > now() - 24 h`, UNCHANGED (S-14's arm kept)
--      shadow  `accrued_to > now() - 7 d` AND the shadow chain
--              (`greatest(accrued_to, shadow_accrued_to)`) within 24 h
--    NULL `armed` reads as ARMED (the narrower fence).
-- §3 hr_tick_roster: mode per ownership channel; admission via §2. Cohort is
--    unchanged and already bounded: `o.owned`, on-channel, not partied.
-- §4 hr_tick_settle: the mode is read at step (4b), AFTER the player and
--    lease locks, per channel; `shadow_state_while_armed` moved there. Every
--    answer that reports a mode also reports `channel`.
-- §5 hr_party_mark / hr_party_roster / hr_party_tick_settle: a party hunt is
--    COMBAT, so its mode is `'combat' = any (armed_channels)`. Party admission
--    is UNCHANGED (raw 24 h) — the ruling scopes admission to the solo roster.
-- §6 hr_tick_cron_run: the posted body and the fire log carry `armed` (the
--    edge ignores it); ADMISSION ENDS LOUDLY — `detail.admission` counts, by
--    reason, every owned on-channel character the roster dropped.
-- §7 hr_tick_stall_status: judged only while NOTHING is armed (as before:
--    armed windows land in player_ledger, not hr_tick_shadow).
--
-- ── OPERATOR SWITCHES (one statement each) ──────────────────────────────────
--   arm gather only     update public.hr_tick_config set armed_channels = array['gather'] where id;
--   MASTER KILL (de-arm every channel, keep the shadow measuring):
--                       update public.hr_tick_config set armed_channels = '{}' where id;
--   stop the tick       update public.hr_tick_config set enabled = false where id;
--   A settle that read "armed" before the kill committed may finish that one
--   window (the same semantics `enabled` has always had); none after it can.
--
-- ── ERROR TAXONOMY (new or changed) ─────────────────────────────────────────
--   shadow_state_while_armed   now carries `channel`; decided under the lease lock
--   tick_disabled              also returned when `enabled` flips between
--                              step (1) and the locked mode read
--   23514 check_violation      arming a channel not in `channels`, a NULL element
--   23502 not_null_violation   armed_channels = NULL
--
-- NOTHING HERE MOVES VALUE. No client surface: every function keeps its
-- exact grant set (§8), the new helper is executable by no client or engine
-- role, and `hr_assert_grant_hygiene(true)` runs strict in the self-check.
-- REVERSIBILITY: forward-only by design (the column it drops is the one it
-- replaces). To undo the behaviour, `armed_channels = '{}'` is today's state.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_tick_config') is null
     or to_regclass('public.hr_tick_ownership') is null
     or to_regprocedure('public.hr_partied(uuid,integer)') is null
     or to_regclass('public.party_tick_lease') is null then
    raise exception 'PRECONDITION: the world tick (2026-09-20..2026-09-24 files) is not installed.';
  end if;
end $$;

-- ── §1 ONE ARMING AUTHORITY ─────────────────────────────────────────────────
do $$
declare
  v_armed text[];
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'armed_channels') then
    -- Born EMPTY, whatever `shadow` says: first apply arms nothing.
    alter table public.hr_tick_config
      add column armed_channels text[] not null default '{}'::text[];
    select armed_channels into v_armed from public.hr_tick_config where id;
    if v_armed is not null and cardinality(v_armed) <> 0 then
      raise exception '§1: armed_channels was born %, expected empty', v_armed;
    end if;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hr_tick_config'
                and column_name = 'shadow') then
    alter table public.hr_tick_config drop column shadow;
  end if;
end $$;

-- THE CHECK, every clause measured (S-5: "a NULL element passes a naive CHECK"):
--   `<@ channels`   refuses a NULL ELEMENT by itself — array containment never
--                   matches NULL (measured: {gather,NULL} <@ {gather,combat}
--                   is false) — and any channel the tick does not own.
--   `array_ndims`   is load-bearing: `<@` FLATTENS, so {{gather}} <@ {gather}
--                   is TRUE, and a 2-D value would pass containment.
--   `coalesce`      a NULL array makes `<@` NULL, and a NULL CHECK PASSES.
--                   NOT NULL on the column is the primary refusal; this is
--                   the second, so dropping one never re-opens the hole.
alter table public.hr_tick_config drop constraint if exists hr_tick_config_armed_ck;
alter table public.hr_tick_config add constraint hr_tick_config_armed_ck check (
  coalesce(
        coalesce(array_ndims(armed_channels), 1) = 1
    and armed_channels <@ channels,
  false));

comment on column public.hr_tick_config.armed_channels is
  'THE arming authority (2026-10-06): a channel listed here PAYS through hr_apply; every other channel in `channels` runs SHADOW. Must be a subset of `channels`. Master kill: set armed_channels = ''{}''.';

-- ── §2 THE ADMISSION PREDICATE, DEFINED ONCE ────────────────────────────────
-- Read by hr_tick_roster (who is rostered) and hr_tick_cron_run (who was
-- dropped, and why), so the roster and the loud counter cannot disagree.
-- `p_mark` is the EFFECTIVE watermark the roster computed. Stable, inlinable.
create or replace function public.hr_tick_admit(p_armed boolean, p_accrued_to timestamptz,
                                                p_mark timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    -- ARMED (or unknown): the raw fence, unchanged. A real settle is the only
    -- thing that moves `accrued_to`, so past 24 h the accrue path owns the
    -- character and the tick does not simulate it.
    when p_armed is not false then
      case when p_accrued_to > now() - interval '24 hours' then 'admit' else 'fenced_24h' end
    -- SHADOW: bounded at 7 days past the last real settle, LOUDLY.
    when p_accrued_to is null or p_accrued_to <= now() - interval '7 days' then 'shadow_expired'
    -- SHADOW: the chain itself must be current. A chain that broke for more
    -- than 24 h is not revived as a 24 h-plus window.
    when greatest(p_accrued_to, coalesce(p_mark, p_accrued_to)) > now() - interval '24 hours' then 'admit'
    else 'fenced_24h'
  end;
$$;

-- ── §3 hr_tick_roster ───────────────────────────────────────────────────────
create or replace function public.hr_tick_roster(p_kinds text[], p_shard integer DEFAULT 0, p_limit integer DEFAULT 200, p_holder text DEFAULT NULL::text, p_lease_ms integer DEFAULT 30000, p_after_accrued timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_user uuid DEFAULT NULL::uuid, p_after_slot integer DEFAULT NULL::integer)
 RETURNS TABLE(user_id uuid, slot integer, shard integer, active_kind text, active_id text, active_since timestamp with time zone, accrued_to timestamp with time zone, shadow_accrued_to timestamp with time zone, version bigint, seed bigint, state jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  -- THE PAYABLE KINDS, server-side. This literal is the SQL half of
  -- accrual.js's `PAYABLE_KINDS`; the two are compared credential-free by
  -- tests/world-tick-parity.mjs P-G7, which reads this file's text and the
  -- engine's export. Retyping a catalogue in SQL is the mistake this repo has
  -- been burned by (src/main.js unifyObject); the drift guard is the price of
  -- the literal.
  c_payable  constant text[] := array['combat','gather','artisan'];
  -- Blast radius, not balance. A roster call is a read, but an unbounded one
  -- against player_state is a denial-of-service primitive.
  c_max_rows constant int := 500;
  -- THE ABSENCE CAP IS NO LONGER A LITERAL HERE (2026-10-06). Admission is
  -- `public.hr_tick_admit(armed, accrued_to, mark)`, the ONE definition this
  -- roster and hr_tick_cron_run's loud counter both read: armed, the raw
  -- `accrued_to > now() - 24 h` fence, unchanged (Security S-14, kept); in
  -- shadow, the shadow chain within 24 h, owned cohort only, ending at raw
  -- `accrued_to` + 7 days (SEC_WORLD_TICK_ARM_2026-10-05 ruling 1).
  v_role     text;
  v_kinds    text[];
  v_limit    int;
  v_lease    interval;
  v_holder   text;
  -- THE MODE, PER CHANNEL, READ FROM THE CONFIG SINGLETON RATHER THAN ASSUMED
  -- (M-1, Security 2026-09-21; per channel since 2026-10-06, ruling 5). The
  -- roster's `accrued_to` is WHERE THE NEXT WINDOW STARTS, and the fence
  -- decides that with `case when <this channel is shadow> then
  -- greatest(accrued_to, shadow_accrued_to) else accrued_to end`. If the
  -- roster used a different rule the two would disagree about the boundary and
  -- every proposal would be refused `window_already_settled` — which is
  -- precisely the stall M-1 measured. Same expression, same source of truth:
  -- `hr_tick_config.armed_channels`, the ONLY arming authority.
  v_armed    text[];
  k          text;
begin
  -- ── (0) THE IDENTITY SEAM. Same reasoning as hr_apply's: the PRIMARY control
  --        is the GRANT in §5 (hr_tick and nothing a request can arrive as).
  --        This GUC test is the SECONDARY one, so that an owner-context call —
  --        a psql session, a future admin script — cannot silently act as the
  --        tick without saying so. Inside SECURITY DEFINER `current_user` is the
  --        OWNER, so the GUC is what carries the request's role across.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_tick_roster: not callable by %', v_role
      using errcode = '42501';
  end if;

  -- ── (1) ARGUMENTS ARE CLAMPED, NEVER TRUSTED. There is no client on this
  --        path today, and that is exactly why the clamps go in now rather than
  --        the day one appears.
  if p_kinds is null or array_length(p_kinds, 1) is null then
    raise exception 'hr_tick_roster: p_kinds is required' using errcode = '22023';
  end if;
  foreach k in array p_kinds loop
    if not (k = any (c_payable)) then
      -- REFUSED, not filtered. A typo must not silently produce an empty
      -- roster that reads as "nobody is active".
      raise exception 'hr_tick_roster: "%" is not a payable kind', k using errcode = '22023';
    end if;
  end loop;
  v_kinds  := p_kinds;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), c_max_rows);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);

  -- ── (1b) THE MODE, PER CHANNEL. A static read: hr_tick_config exists before
  --        this restatement can be applied (2026-10-06 §0 refuses otherwise).
  --        FAILS SAFE TO SHADOW: a missing row or a NULL reads as "nothing
  --        armed", and chaining on the shadow mark can only ever propose a
  --        window at or AFTER the paid one, so a wrong guess here skips time
  --        at worst and can never re-propose settled time. The roster never
  --        decides whether anything PAYS — the fence re-reads the mode under
  --        its own lock (hr_tick_settle step (4b)).
  select c.armed_channels into v_armed from public.hr_tick_config c where c.id;
  v_armed := coalesce(v_armed, '{}'::text[]);

  -- ── (2) THE ACTIVE SET, AND THE LEASE, IN ONE STATEMENT.
  --        `for update skip locked` on the OWNERSHIP row (never on
  --        player_state — the tick must not hold a lock on the table hr_apply
  --        needs) makes two tick processes during a rolling deploy pick
  --        DISJOINT sets instead of both claiming the same character. The
  --        durable half is `lease_until`: a process that dies without releasing
  --        is reclaimed when its lease expires, and `now()` is Postgres's clock,
  --        never the host's (§9 — the authority clock wins).
  return query
  with claim as (
    -- S-2 (Security, 2026-09-19): `channel` is projected and joined on. The
    -- primary key is (user_id, slot, channel), so a claim keyed on (user_id,
    -- slot) alone stamped a lease on a channel row it never locked and
    -- returned the character once per ownership row. Executed proof:
    -- tests/world-tick-writer-authz.mjs S-4a/S-4b.
    --
    -- M-1 (Security, 2026-09-21): `mark` is THE EFFECTIVE WATERMARK — where
    -- this character's next window starts — and it is computed ONCE, in a
    -- LATERAL, so the keyset below, the ORDER BY, and the `accrued_to` this
    -- function RETURNS are the same value and cannot drift apart. It is the
    -- byte-identical expression hr_tick_settle step (6) compares against, so
    -- the roster and the door can never disagree about a window boundary.
    select o.user_id, o.slot, o.channel, m.mark
      from public.hr_tick_ownership o
      join public.player_state ps
        on ps.user_id = o.user_id and ps.slot = o.slot
      cross join lateral (
        select coalesce(o.channel = any (v_armed), false) as armed) a
      cross join lateral (
        select case when not a.armed
                    then greatest(ps.accrued_to,
                                  coalesce(o.shadow_accrued_to, ps.accrued_to))
                    else ps.accrued_to end as mark) m
     where o.owned
       and o.channel = ps.active_kind
       and ps.active_kind = any (v_kinds)
       -- ADMISSION (2026-10-06, ruling 1). One predicate, defined once: an
       -- ARMED channel keeps the raw 24 h fence on `accrued_to`; a SHADOW
       -- channel admits on its shadow chain (`m.mark`) for at most 7 days past
       -- the last real settle. `o.owned` above is the cohort bound. A
       -- character this drops is COUNTED by hr_tick_cron_run (detail.admission)
       -- — never a silent drop (S-14).
       and public.hr_tick_admit(a.armed, ps.accrued_to, m.mark) = 'admit'
       -- INVARIANT 7 (M8 S2, Security S-8). POSITIVE AND DERIVED: a
       -- character in a party with a LIVE hunt is served by
       -- hr_party_roster and by NOTHING ELSE. Never a denormalised
       -- column: stale, a character is servable by both rosters and the
       -- solo settle pays the whole party stream to one member; absent,
       -- the exclusion never fires at all.
       and not public.hr_partied(o.user_id, o.slot)
       and public.hr_shard_of(o.user_id) = coalesce(p_shard, 0)
       and (o.lease_until is null
            or o.lease_until < now()
            or o.lease_holder = v_holder)
       -- The keyset. Written out rather than as a row comparison so the NULL
       -- (start-of-pass) case is explicit and cannot be read as "match nothing".
       and (p_after_accrued is null
            or (m.mark, o.user_id, o.slot)
                 > (p_after_accrued,
                    coalesce(p_after_user, '00000000-0000-0000-0000-000000000000'::uuid),
                    -- FAIL-SAFE SENTINEL. A caller that names an instant and a
                    -- user but no SLOT gets the boundary EXCLUSIVE of every slot
                    -- that user holds at that instant. The other direction (-1,
                    -- the first spelling) makes the cursor row itself compare
                    -- greater than its own key, so every pass re-serves its last
                    -- row and the walk never advances — measured in
                    -- tests/world-tick-double-pay.mjs D5, which saw 8 rows over 5
                    -- characters. Skipping a character costs one pass; re-serving
                    -- it costs a second lease on a character already in flight.
                    coalesce(p_after_slot, 2147483647)))
     -- FURTHEST BEHIND FIRST, measured in the units the tick actually pays in.
     -- Ordering on the frozen ps.accrued_to while returning the effective mark
     -- would make the driver's keyset cursor (which hands back max(accrued_to))
     -- compare against a different column than the one it walked, and rows
     -- between the two values would be SKIPPED for a whole pass.
     order by m.mark asc, o.user_id asc, o.slot asc
     limit v_limit
       for update of o skip locked
  ), leased as (
    update public.hr_tick_ownership o
       set lease_holder = v_holder,
           lease_until  = now() + v_lease,
           updated_at   = now()
      from claim c
     where o.user_id = c.user_id and o.slot = c.slot and o.channel = c.channel
     returning o.user_id, o.slot, c.mark
  )
  select ps.user_id,
         ps.slot,
         public.hr_shard_of(ps.user_id)                                as shard,
         ps.active_kind,
         ps.active_id,
         ps.active_since,
         -- ── ★ WHERE THE NEXT WINDOW STARTS ★ (M-1, Security 2026-09-21) ──
         -- THIS COLUMN IS THE WATERMARK, NOT THE PAID MARK. It used to be the
         -- raw `ps.accrued_to`, which in SHADOW never moves — the tick pays
         -- nothing, so `hr_apply` never advances it. Every consumer that
         -- chained on it therefore re-proposed [T0, T0+flush] on every fire and
         -- the fence refused all of them, correctly, as `window_already_settled`.
         -- Over 48 h at a 90 s flush that is 1 shadow row where 1,920 are
         -- expected: the parity measurement the whole milestone exists to take
         -- cannot be taken, and the obvious "fix" is to loosen the CAS, which
         -- is the double pay S-3 exists to prevent.
         --
         -- `l.mark` is the effective watermark computed under the claim's own
         -- lock: `greatest(accrued_to, shadow_accrued_to)` while shadowed,
         -- `accrued_to` while armed — the byte-identical rule the fence uses.
         -- So a caller that simply chains on `accrued_to` is now CORRECT in
         -- both modes, and the payload stops being a trap.
         l.mark                                                         as accrued_to,
         -- THE SHADOW MARK, AND ONLY WHEN IT SAYS SOMETHING THE COLUMN ABOVE
         -- DOES NOT. NULL means "no shadow displacement — use accrued_to",
         -- which is the contract this signature has claimed since it was
         -- written (`NULL for an armed channel`) and did not honour: it
         -- coalesced, so it was never NULL and never distinguishable.
         -- `nullif` against the PAID mark makes the contract true. It is never
         -- BEHIND `accrued_to`, because `l.mark` took the `greatest` first — a
         -- client accrue landing mid-shadow drags this forward rather than
         -- being replayed over.
         nullif(l.mark, ps.accrued_to)                                  as shadow_accrued_to,
         ps.version,
         -- THE PER-WINDOW PRNG LABEL, derived here EXACTLY as
         -- hr-accrue/index.ts derives it: hr_seed(user, slot,
         -- 'accrue:' || accrued_to). The label NAMES THE WATERMARK, so the
         -- tick's first window draws the same stream an accrue would have.
         -- Later windows in the same flush re-derive it per watermark through
         -- the hr_seed grant (§5) — see the exploit-surface note in the header.
         -- Seeded from the EFFECTIVE watermark, not from accrued_to: in shadow
         -- the two differ, and seeding every shadow window from one constant
         -- instant is the `fixedSeed` mutant that measured +48% gold and three
         -- rare drops at rate zero (§11). A shadow run drawing one stream
         -- prefix over and over would report a parity number that says more
         -- about the PRNG than about the tick.
         --
         -- ⚠ `to_jsonb(l.mark) #>> '{}'` AND NOT `to_char(...)` (OP:TICK review
         --   T-2, P0). index.ts:785 labels from `st.accrued_to`, and `st` is
         --   the hr_state_of JSONB envelope — so the accrue path's spelling is
         --   whatever Postgres renders a timestamptz as INSIDE JSON:
         --   `2026-09-21T17:55:55.739123+00:00`. The `'…MS"Z"'` template this
         --   line used to carry spells the same instant `…739Z`: microseconds
         --   truncated, `+00:00` written `Z`. hr_seed hashes the LABEL, so that
         --   was a DIFFERENT STREAM for the same window, and the 48 h parity
         --   number would have measured the PRNG rather than the tick — which
         --   is the exact failure the paragraph above warns about, committed by
         --   the line below it. The accrue path has 200 days of live seeds
         --   behind it and does not move; this file was unapplied, so the fix
         --   is one expression. `to_jsonb` is the rendering, not a restatement
         --   of it, so it cannot drift from hr_state_of again.
         public.hr_seed(ps.user_id, ps.slot,
                        'accrue:' || (to_jsonb(l.mark) #>> '{}'))      as seed,
         -- HYDRATION IS THE ENVELOPE THE CLIENT APPLIES, not a bag of columns
         -- assembled here. "What the tick holds" and "what the player sees" are
         -- one object (§2), and it costs the tick no grant on hr_state_of.
         public.hr_state_of(ps.user_id, ps.slot)                        as state
    from leased l
    join public.player_state ps
      on ps.user_id = l.user_id and ps.slot = l.slot
   -- The same order the claim walked, on the same value, so the driver's
   -- keyset cursor (max(accrued_to) + the last row's user/slot) names a
   -- boundary this function will compare against identically on the next pass.
   order by l.mark asc, ps.user_id asc, ps.slot asc;
end $$;

-- ── §4 hr_tick_settle ───────────────────────────────────────────────────────
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

-- ── §5 THE PARTY TRIO — a party hunt is COMBAT ──────────────────────────────
create or replace function public.hr_party_mark(p_party uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
as $$
  -- The combat channel's mode (2026-10-06, ruling 5): a party hunt is combat.
  select case when not coalesce('combat' = any (cfg.armed_channels), false)
              then greatest(h.accrued_to, coalesce(l.shadow_accrued_to, h.accrued_to))
              else h.accrued_to end
    from public.party_hunt h
    join public.party_tick_lease l on l.party_id = h.party_id
   cross join public.hr_tick_config cfg
   where h.party_id = p_party and h.ended_at is null;
$$;

create or replace function public.hr_party_roster(p_channels text[], p_limit integer DEFAULT 200, p_holder text DEFAULT NULL::text, p_lease_ms integer DEFAULT 30000, p_after_accrued timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_party uuid DEFAULT NULL::uuid)
 RETURNS TABLE(party_id uuid, hunt_id uuid, active_id text, stance text, stop jsonb, accrued_to timestamp with time zone, shadow_accrued_to timestamp with time zone, shadow_state jsonb, members jsonb, member_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
-- ⚠ THE OUT PARAMETERS OF A `returns table` ARE PLPGSQL VARIABLES, and seven of
--   them (party_id, active_id, stance, stop, accrued_to, shadow_accrued_to,
--   shadow_state) are also COLUMN NAMES on the tables this function reads. The
--   default conflict rule is an ERROR, which is how this function first failed
--   to install. `use_column` resolves every ambiguous name to the COLUMN, which
--   is what every reference below means; the locals are all `v_`-prefixed and
--   cannot collide.
#variable_conflict use_column
declare
  -- The party's channel vocabulary. A party hunt is COMBAT (§18.2.1a: `party`
  -- is not a new tick channel), and the argument exists so the driver cannot
  -- ask for a party under a channel the tick does not own.
  c_payable     constant text[] := array['combat'];
  c_max_parties constant int    := 200;
  c_max_span    constant interval := interval '24 hours';
  v_role    text;
  v_limit   int;
  v_lease   interval;
  v_holder  text;
  v_shadow  boolean;
  k         text;
begin
  -- ── (0) THE IDENTITY SEAM. The PRIMARY control is the GRANT in §4 (hr_tick
  --        and nothing a request can arrive as). Inside SECURITY DEFINER
  --        `current_user` is the OWNER, so the GUC is what carries the
  --        request's role across.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_party_roster: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (1) ARGUMENTS ARE CLAMPED, NEVER TRUSTED.
  if p_channels is null or array_length(p_channels, 1) is null then
    raise exception 'hr_party_roster: p_channels is required' using errcode = '22023';
  end if;
  foreach k in array p_channels loop
    if not (k = any (c_payable)) then
      -- REFUSED, not filtered: a typo must not silently produce an empty
      -- roster that reads as "nobody is hunting".
      raise exception 'hr_party_roster: "%" is not a party channel', k using errcode = '22023';
    end if;
  end loop;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);

  -- ── (1b) THE MODE, FROM THE CONFIG SINGLETON, FOR THE COMBAT CHANNEL
  --         (2026-10-06, ruling 5: `armed_channels` is the one arming
  --         authority, and a party hunt is combat). Fails SAFE to shadow:
  --         chaining on the shadow mark can only ever propose a window at or
  --         AFTER the paid one, so a wrong guess skips time at worst and can
  --         never re-propose settled time.
  select not coalesce('combat' = any (cfg.armed_channels), false)
    into v_shadow from public.hr_tick_config cfg where cfg.id;
  v_shadow := coalesce(v_shadow, true);

  -- ── (1c) EVERY LIVE HUNT HAS A LEASE ROW. Not a claim — a row to claim.
  insert into public.party_tick_lease (party_id)
  select h.party_id from public.party_hunt h
   where h.ended_at is null
  on conflict (party_id) do nothing;

  -- ── (2) THE COHORT, THE ADMISSION IN CHARACTERS, AND THE LEASE.
  return query
  with cand as (
    select h.party_id  as p_id,
           h.id        as h_id,
           h.active_id as a_id,
           h.stance    as st,
           h.stop      as sp,
           h.accrued_to as hunt_mark,
           m.mark      as mark,
           mc.n        as n
      from public.party_hunt h
      join public.party_tick_lease l on l.party_id = h.party_id
      cross join lateral (
        select case when v_shadow
                    then greatest(h.accrued_to, coalesce(l.shadow_accrued_to, h.accrued_to))
                    else h.accrued_to end as mark) m
      cross join lateral (
        select count(*)::int as n from public.party_member pm
         where pm.party_id = h.party_id and pm.left_at is null) mc
     where h.ended_at is null
       -- The absence cap the accrual path already enforces. A party further
       -- behind than this is DROPPED rather than simulated to zero, exactly as
       -- hr_tick_roster drops a character.
       and h.accrued_to > now() - c_max_span
       -- A party of ONE is admitted: §18.2.6 (P-a) degenerate parity is the
       -- single most valuable guard in the milestone and needs a real
       -- one-member party. A party of ZERO live members has nothing to settle.
       and mc.n between 1 and 4
       and (l.lease_until is null
            or l.lease_until < now()
            or l.lease_holder = v_holder)
       and (p_after_accrued is null
            or (m.mark, h.party_id)
                 > (p_after_accrued,
                    coalesce(p_after_party, '00000000-0000-0000-0000-000000000000'::uuid)))
     order by m.mark asc, h.party_id asc
     limit c_max_parties
       for update of l skip locked
  ), admitted as (
    -- THE RUNNING SUM, IN CHARACTERS (I-3). A party whose members would take
    -- the batch past the limit is left for the next fire ENTIRELY — the cursor
    -- below resumes at it, so nothing is starved.
    select c.*,
           sum(c.n) over (order by c.mark, c.p_id
                          rows between unbounded preceding and current row) as running
      from cand c
  ), taken as (
    select a.* from admitted a where a.running <= v_limit
  ), leased as (
    update public.party_tick_lease l
       set owned        = true,
           lease_holder = v_holder,
           lease_until  = now() + v_lease,
           updated_at   = now()
      from taken t
     where l.party_id = t.p_id
    returning l.party_id as lp, l.shadow_state as lstate
  )
  select t.p_id, t.h_id, t.a_id, t.st, t.sp,
         t.mark,
         nullif(t.mark, t.hunt_mark),
         x.lstate,
         (select jsonb_agg(jsonb_build_object(
                   'user_id',    pm.user_id,
                   'slot',       pm.slot,
                   'version',    ps.version,
                   'accrued_to', ps.accrued_to,
                   -- The per-window PRNG label, derived EXACTLY as
                   -- hr-accrue/index.ts derives it and seeded from the
                   -- EFFECTIVE watermark. `to_jsonb(...) #>> '{}'` and not
                   -- to_char: the accrue path labels from the hr_state_of
                   -- JSONB envelope, so the spelling is whatever Postgres
                   -- renders a timestamptz as INSIDE JSON (T-2).
                   'seed',       public.hr_seed(pm.user_id, pm.slot,
                                   'accrue:' || (to_jsonb(t.mark) #>> '{}')),
                   -- §2's RULE: THE TICK NEVER ASSEMBLES A CHARACTER OUT OF
                   -- PARTS. The whole envelope, the same projection the
                   -- player's own client applies.
                   'state',      public.hr_state_of(pm.user_id, pm.slot))
                   order by pm.user_id, pm.slot)
            from public.party_member pm
            join public.player_state ps
              on ps.user_id = pm.user_id and ps.slot = pm.slot
           where pm.party_id = t.p_id and pm.left_at is null),
         t.n
    from taken t
    join leased x on x.lp = t.p_id
   order by t.mark asc, t.p_id asc;
end $$;

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
begin
  -- ── (0) IDENTITY. The PRIMARY control is the GRANT in §4; this is the
  --        SECONDARY one, so an owner-context call cannot silently act as the
  --        engine without saying so. `hr_tick` is refused BY NAME: the selector
  --        must never be able to become the settler.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_party_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

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

-- ── §6 hr_tick_cron_run ─────────────────────────────────────────────────────
create or replace function public.hr_tick_cron_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  v_holder   text;
  v_batch    jsonb;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_gateway  text;
  v_body_txt text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := false;
  v_eff      int;
  -- THE ADMISSION COUNTER (2026-10-06, ruling 1: shadow-chain admission ends
  -- LOUDLY). Owned, on-channel, unpartied characters the roster's admission
  -- predicate dropped, by reason. NULL when nobody was dropped, so a healthy
  -- fire's log row does not grow.
  v_adm      jsonb;
  v_out      text;
  v_ms       int;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    perform public.hr_tick_cron_note('disabled', 0);
    return jsonb_build_object('ok', true, 'outcome', 'disabled');
  end if;
  if v_cfg.edge_url is null or v_cfg.edge_url = '' then
    perform public.hr_tick_cron_note('no_edge_url', 0);
    return jsonb_build_object('ok', false, 'outcome', 'no_edge_url');
  end if;

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). The roster's own
  --         predicate, `hr_tick_admit`, over the roster's own cohort (owned,
  --         on its channel, not in a party), so the two cannot disagree about
  --         who was dropped. `shadow_expired` is the 7-day end of shadow-chain
  --         admission; `fenced_24h` is the raw (armed) or shadow-chain 24 h
  --         fence. Logged on the `empty` and `posted` notes; a fire that
  --         drops nobody logs nothing extra.
  select case when count(*) = 0 then null
              else jsonb_object_agg(x.why, x.n) end
    into v_adm
    from (select ad.why, count(*)::int as n
            from public.hr_tick_ownership o
            join public.player_state ps
              on ps.user_id = o.user_id and ps.slot = o.slot
           cross join lateral (
             select coalesce(o.channel = any (v_cfg.armed_channels), false) as armed) a
           cross join lateral (
             select public.hr_tick_admit(a.armed, ps.accrued_to,
                      case when not a.armed
                           then greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))
                           else ps.accrued_to end) as why) ad
           where o.owned
             and o.channel = ps.active_kind
             and ps.active_kind = any (v_cfg.channels)
             and not public.hr_partied(o.user_id, o.slot)
             and ad.why <> 'admit'
           group by ad.why) x;

  -- ── (3) THE BATCH. Unchanged. `r.accrued_to` is the EFFECTIVE watermark
  --        (`greatest(accrued_to, shadow_accrued_to)`, Security M-1) and
  --        `shadow_accrued_to` rides alongside it so the entry can SEE the
  --        displacement rather than infer it.
  v_holder := left('cron:' || coalesce(current_database(), 'db'), 64);
  select jsonb_agg(jsonb_build_object(
           'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
           'active_kind', r.active_kind, 'active_id', r.active_id,
           'active_since', r.active_since, 'accrued_to', r.accrued_to,
           'shadow_accrued_to', r.shadow_accrued_to,
           'version', r.version, 'seed', r.seed, 'state', r.state)
           order by r.accrued_to, r.user_id, r.slot),
         count(*),
         max(r.accrued_to)
    into v_batch, v_n, v_last_a
    from public.hr_tick_roster(v_cfg.channels, 0, v_cfg.batch_limit, v_holder,
                               v_cfg.lease_ms, v_cfg.cursor_at, v_cfg.cursor_user,
                               v_cfg.cursor_slot) r;

  if coalesce(v_n, 0) = 0 then
    update public.hr_tick_config set cursor_at = null, cursor_user = null,
           cursor_slot = null, updated_at = now() where id;
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0, null,
     case when v_adm is null then null else jsonb_build_object('admission', v_adm) end);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  select (e->>'user_id')::uuid, (e->>'slot')::int
    into v_last_u, v_last_s
    from jsonb_array_elements(v_batch) e
   order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
   limit 1;

  if v_n < v_cfg.batch_limit then
    update public.hr_tick_config set cursor_at = null, cursor_user = null,
           cursor_slot = null, updated_at = now() where id;
  else
    update public.hr_tick_config set cursor_at = v_last_a, cursor_user = v_last_u,
           cursor_slot = v_last_s, updated_at = now() where id;
  end if;

  v_eff := v_cfg.cadence_seconds * greatest(1, ceil(v_n::numeric / greatest(1, v_cfg.batch_limit))::int);

  -- ── (4) THE GATEWAY KEY. STILL A VARIABLE, AND THAT IS CORRECT: it is the
  --        project ANON key, public by design (src/net/supabase-bootstrap.js),
  --        read from Vault only so a project move is a Vault write rather than
  --        a migration. `supabase/config.toml` pins `verify_jwt = true` on
  --        hr-accrue and it STAYS ON (tests/edge-jwt-gate.mjs --strict), so the
  --        Supabase gateway refuses the request before the function runs unless
  --        `Authorization` carries a JWT it accepts. IT IS NOT THE TICK'S
  --        AUTHORISATION and must never be mistaken for it.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;

  -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
  --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
  --         those bytes verbatim, so hashing this exact text and posting
  --         `v_body_txt::jsonb` hashes what leaves. Both sides are the same
  --         `jsonb_out` on the same value.
  v_body_txt := jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   -- per channel since 2026-10-06; the
                                   -- edge IGNORES this key (tick.js reads
                                   -- the mode off the fence), it is here
                                   -- for the operator reading the queue.
                                   'armed', to_jsonb(v_cfg.armed_channels),
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   'roster', v_batch)::text;

  -- ── (4b) THE DERIVATION. pgcrypto absent is `no_hmac` and NOTHING IS POSTED:
  --         there is no static fallback, by construction — this function no
  --         longer has a code path that can put a long-lived secret on the wire.
  v_body_sha := public.hr_tick_body_sha256(v_body_txt);
  if v_body_sha is null then
    perform public.hr_tick_cron_note('no_hmac',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
    return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;
  v_auth     := public.hr_tick_auth_header(v_bucket, v_body_sha);
  v_have_tok := v_auth is not null;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of this file carries both names for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POST. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  begin
    execute 'select net.http_post($1, $2, $3, $4, $5)'
      using v_cfg.edge_url,
            v_body_txt::jsonb,
            '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json',
                               -- the GATEWAY's gate...
                               'Authorization', 'Bearer ' || v_gateway,
                               -- ...and the tick's own, DERIVED PER FIRE. The
                               -- Vault secret is not here and never was: this
                               -- value is a mac over (bucket, body hash).
                               'X-HR-Tick-Auth', v_auth),
            greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
    v_out := 'posted';
  exception when others then
    -- Nothing derived from a secret reaches the log even in an error path.
    v_out := 'error';
    perform public.hr_tick_cron_note('error',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('sqlstate', sqlstate));
    return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
  end;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('armed', to_jsonb(v_cfg.armed_channels), 'holder', v_holder,
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_n < v_cfg.batch_limit)
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff);
end $$;

-- ── §7 hr_tick_stall_status ─────────────────────────────────────────────────
create or replace function public.hr_tick_stall_status(p_now timestamp with time zone DEFAULT now(), p_hours integer DEFAULT 2, p_min_rows_per_hour integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_cfg     public.hr_tick_config%rowtype;
  v_hours   int := least(greatest(coalesce(p_hours, 2), 1), 48);
  v_min     int := greatest(coalesce(p_min_rows_per_hour, 30), 1);
  v_buckets jsonb;
  v_stalled boolean;
begin
  select * into v_cfg from public.hr_tick_config where id;

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
           'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                               where s.at >= b.lo and s.at < b.hi),
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

  -- JUDGED ONLY WHILE NOTHING IS ARMED (2026-10-06). The invariant counts
  -- hr_tick_shadow rows across every channel; once any channel is armed its
  -- windows land in player_ledger instead and the rule would read a healthy
  -- armed channel as a stall. Same rule as the global flag had, per channel.
  v_stalled := coalesce(v_cfg.enabled, false) and coalesce(cardinality(v_cfg.armed_channels), 0) = 0
    and not exists (select 1 from jsonb_array_elements(v_buckets) e
                     where (e->>'rostered_fires')::int < 1
                        or (e->>'shadow_rows')::int >= v_min);

  return jsonb_build_object(
    'ok', not v_stalled,
    'stalled', v_stalled,
    'judged', coalesce(v_cfg.enabled, false) and coalesce(cardinality(v_cfg.armed_channels), 0) = 0,
    'mode', case when not coalesce(v_cfg.enabled, false) then 'off'
                 when coalesce(cardinality(v_cfg.armed_channels), 0) = 0 then 'shadow' else 'armed' end,
    'armed_channels', to_jsonb(coalesce(v_cfg.armed_channels, '{}'::text[])),
    'hours', v_hours, 'min_rows_per_hour', v_min, 'at', p_now,
    'buckets', v_buckets);
end $$;

-- ── §8 GRANTS — restated EXACTLY as the chain left them (revoke first) ──────
-- `create or replace` keeps an ACL, so these are belt-and-braces; the
-- self-check (c7) asserts the resulting set, not these lines.
revoke execute on function public.hr_tick_admit(boolean, timestamptz, timestamptz) from public;
revoke execute on function public.hr_tick_admit(boolean, timestamptz, timestamptz)
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;
revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int)
  from anon, authenticated, service_role, hr_engine;
grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;

revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb, jsonb) to hr_engine;

revoke execute on function public.hr_party_mark(uuid) from public;
revoke execute on function public.hr_party_mark(uuid)
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid) from public;
revoke execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid)
  from anon, authenticated, service_role, hr_engine;
grant  execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid) to hr_tick;

revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to hr_engine;

revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run()
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §9 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
--   c1  `shadow` is gone; `armed_channels` is text[] NOT NULL DEFAULT '{}'
--   c2  the CHECK refuses: a channel not in `channels`, a NULL element, a NULL
--       array, a 2-D array — and accepts {}, {gather}, {combat}, both
--   c3  no routine in public/hr_ops still reads a `shadow` config field
--   c4  ★ EACH CHANNEL ARMS INDEPENDENTLY: armed {gather} → a gather window
--       takes the ARMED branch (reaches hr_apply, journals no shadow row) and a
--       combat window takes the SHADOW branch (one hr_tick_shadow row, zero
--       player_ledger rows, gold/version/accrued_to unmoved); then armed
--       {combat} → the mirror image. Every mode answer names its channel.
--       (The armed branch's hr_apply refuses the APPLYING role by design —
--       S-1's literal hr_engine seam — so "gather writes exactly one ledger
--       row" is executed by tests/world-tick-channel-arm.mjs A3, which
--       presents hr_engine as the edge does.)
--   c5  a carrier on an armed channel is refused shadow_state_while_armed
--       (naming the channel) and on a shadow channel it is accepted
--   c6  ★ THE ONE-STATEMENT KILL DE-ARMS EVERYTHING: armed {combat,gather},
--       one UPDATE, then both channels settle in SHADOW and the party mark
--       reads the shadow chain
--   c7  ★ ADMISSION: shadow channel — raw accrued_to 25 h old with a current
--       shadow chain IS rostered; 7 d + 1 min old is NOT ('shadow_expired');
--       7 d − 1 min IS. Armed channel — raw 25 h old with shadow mark = now()
--       gets ZERO roster rows (S-14's arm, kept)
--   c8  grants: every function keeps its exact role set; hr_tick_admit is
--       executable by no client/engine role; the detector passes STRICT
-- Probe rows are written inside the block and rolled back by the sentinel;
-- the three switches it flips are restored explicitly and read back first.
do $$
declare
  v_ug    uuid := '00000000-0000-4000-8000-0000000a1006';
  v_uc    uuid := '00000000-0000-4000-8000-0000000a2006';
  v_ua    uuid := '00000000-0000-4000-8000-0000000a3006';
  v_gact  text;
  v_cact  text;
  v_n     int;
  v_r     jsonb;
  v_t0    timestamptz := date_trunc('second', now()) - interval '10 minutes';
  v_t1    timestamptz := date_trunc('second', now()) - interval '8 minutes';
  v_t2    timestamptz := date_trunc('second', now()) - interval '6 minutes';
  v_g     bigint;
  v_v     bigint;
  v_w     timestamptz;
  v_bad   text;
  v_armed_before   text[];
  v_enabled_before boolean;
  v_chan_before    text[];
  v_armed   text[];
  v_enabled boolean;
  v_chan    text[];
  r record;
begin
  begin
    -- ── c1
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'hr_tick_config'
                  and column_name = 'shadow') then
      raise exception 'c1: hr_tick_config.shadow still exists — two arming authorities';
    end if;
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'hr_tick_config'
       and column_name = 'armed_channels' and is_nullable = 'NO'
       and data_type = 'ARRAY' and udt_name = '_text'
       and column_default like '''{}''::text[]%';
    if v_n <> 1 then
      raise exception 'c1b: armed_channels is not text[] NOT NULL DEFAULT ''{}''';
    end if;

    select armed_channels, enabled, channels
      into v_armed_before, v_enabled_before, v_chan_before
      from public.hr_tick_config where id;

    -- ── c2
    update public.hr_tick_config set channels = array['gather'] where id;
    begin
      update public.hr_tick_config set armed_channels = array['combat'] where id;
      raise exception 'c2: the CHECK let combat arm while channels = {gather}';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set armed_channels = array['gather', null] where id;
      raise exception 'c2b: the CHECK accepted a NULL element';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set armed_channels = null where id;
      raise exception 'c2c: armed_channels accepted NULL';
    exception when not_null_violation then null;
    end;
    begin
      update public.hr_tick_config set armed_channels = array[array['gather']] where id;
      raise exception 'c2d: the CHECK accepted a two-dimensional array';
    exception when check_violation then null;
    end;
    update public.hr_tick_config set channels = array['combat','gather','artisan'], enabled = true where id;
    update public.hr_tick_config set armed_channels = '{}' where id;
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    update public.hr_tick_config set armed_channels = array['combat'] where id;
    update public.hr_tick_config set armed_channels = array['combat','gather'] where id;
    begin
      update public.hr_tick_config set channels = array['gather'] where id;
      raise exception 'c2e: a channel was removed from `channels` while it was ARMED';
    exception when check_violation then null;
    end;
    update public.hr_tick_config set armed_channels = '{}' where id;

    -- ── c3
    select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'hr_ops')
       and p.prosrc ilike '%hr_tick_config%'
       and (p.prosrc ~* '\m(v_cfg|cfg|c)\.shadow\M'
            or p.prosrc ~* 'select\s+(coalesce\(\s*)?(cfg\.)?shadow\M'
            or p.prosrc ~* 'set\s+(enabled\s*=\s*\w+\s*,\s*)?shadow\s*=');
    if v_bad is not null then
      raise exception 'c3: these routines still read hr_tick_config.shadow: %', v_bad;
    end if;

    -- ── fixtures: one gather character, one combat character.
    select activity_id into v_gact from public.hr_activities where kind = 'gather' limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' limit 1;
    if v_gact is null or v_cact is null then
      raise notice 'self-check SKIPPED past c3: no gather/combat activity to point a probe at';
      raise exception 'HR1006_ROLLBACK_OK';
    end if;
    insert into auth.users (id) values (v_ug), (v_uc), (v_ua) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_ug, 0, 500, 0, 10, 10, 1, v_t0, 'gather', v_gact, v_t0 - interval '1 hour'),
           (v_uc, 0, 500, 0, 10, 10, 1, v_t0, 'combat', v_cact, v_t0 - interval '1 hour');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_ug, 0, 'gather', true, 'selfcheck', now() + interval '5 minutes'),
           (v_uc, 0, 'combat', true, 'selfcheck', now() + interval '5 minutes');

    -- ── c4: armed {gather}
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_t0, v_t1,
             '00000000-0000-4000-8000-0000000b1006',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_t1),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))));
    if v_r->>'mode' is distinct from 'armed' or v_r->>'channel' is distinct from 'gather' then
      raise exception 'c4: with gather armed, a gather window did not take the ARMED branch: %', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_ug;
    if v_n <> 0 then
      raise exception 'c4b: an ARMED gather window journalled % shadow row(s)', v_n;
    end if;
    v_r := public.hr_tick_settle('selfcheck', v_uc, 0, 'combat', 1, v_t0, v_t1,
             '00000000-0000-4000-8000-0000000b2006',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_t1),
               'journal', jsonb_build_object('kind','combat','intent','accrue',
                 'meta', jsonb_build_object('src','tick','ticks',1))));
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'shadow'
       or (v_r->>'paid')::boolean is not false or v_r->>'channel' is distinct from 'combat' then
      raise exception 'c4c: with ONLY gather armed, a combat window did not take the SHADOW branch: %', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_uc;
    if v_n <> 1 then raise exception 'c4d: the shadow combat window journalled % rows, expected 1', v_n; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_uc;
    if v_n <> 0 then
      raise exception 'c4e: COMBAT PAID while only gather was armed — % player_ledger row(s)', v_n;
    end if;
    select gold, version, accrued_to into v_g, v_v, v_w from public.player_state
     where user_id = v_uc and slot = 0;
    if v_g <> 500 or v_v <> 1 or v_w is distinct from v_t0 then
      raise exception 'c4f: the combat character moved (gold %, version %, accrued_to %)', v_g, v_v, v_w;
    end if;
    -- The probe refusal reports THIS channel's mode, and names it.
    v_r := public.hr_tick_settle('selfcheck', v_uc, 0, 'combat', null,
             '1970-01-01T00:00:00Z'::timestamptz, now(),
             '00000000-0000-0000-0000-000000000000',
             jsonb_build_object('accrued_to', to_jsonb(now())));
    if v_r->>'error' is distinct from 'window_already_settled'
       or (v_r->>'shadow')::boolean is not true or v_r->>'channel' is distinct from 'combat'
       or (v_r->>'accrued_to')::timestamptz is distinct from v_t1 then
      raise exception 'c4g: the combat probe did not answer shadow/combat at the shadow mark: %', v_r;
    end if;
    v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', null,
             '1970-01-01T00:00:00Z'::timestamptz, now(),
             '00000000-0000-0000-0000-000000000000',
             jsonb_build_object('accrued_to', to_jsonb(now())));
    if (v_r->>'shadow')::boolean is not false or v_r->>'channel' is distinct from 'gather'
       or (v_r->>'accrued_to')::timestamptz is distinct from v_t0 then
      raise exception 'c4h: the gather probe did not answer armed/gather at the PAID mark: %', v_r;
    end if;

    -- ── c4 mirror: armed {combat}
    update public.hr_tick_config set armed_channels = array['combat'] where id;
    v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_t0, v_t1,
             '00000000-0000-4000-8000-0000000b3006',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_t1),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))));
    if v_r->>'mode' is distinct from 'shadow' or v_r->>'channel' is distinct from 'gather' then
      raise exception 'c4i: with ONLY combat armed, a gather window did not take the SHADOW branch: %', v_r;
    end if;
    v_r := public.hr_tick_settle('selfcheck', v_uc, 0, 'combat', 1, v_t0, v_t2,
             '00000000-0000-4000-8000-0000000b4006',
             jsonb_build_object('gold', 9, 'accrued_to', to_jsonb(v_t2),
               'journal', jsonb_build_object('kind','combat','intent','accrue',
                 'meta', jsonb_build_object('src','tick','ticks',1))));
    if v_r->>'mode' is distinct from 'armed' or v_r->>'channel' is distinct from 'combat' then
      raise exception 'c4j: with combat armed, a combat window did not take the ARMED branch: %', v_r;
    end if;
    select count(*) into v_n from public.player_ledger where user_id = v_ug;
    if v_n <> 0 then
      raise exception 'c4k: GATHER PAID while only combat was armed — % player_ledger row(s)', v_n;
    end if;

    -- ── c5
    v_r := public.hr_tick_settle('selfcheck', v_uc, 0, 'combat', 1, v_t1, v_t2,
             '00000000-0000-4000-8000-0000000b5006',
             jsonb_build_object('accrued_to', to_jsonb(v_t2)),
             jsonb_build_object('v', 1, 'hp', 3));
    if v_r->>'error' is distinct from 'shadow_state_while_armed' or v_r->>'channel' is distinct from 'combat' then
      raise exception 'c5: an ARMED combat settle accepted a carrier: %', v_r;
    end if;
    v_r := public.hr_tick_settle('selfcheck', v_ug, 0, 'gather', 1, v_t1, v_t2,
             '00000000-0000-4000-8000-0000000b6006',
             jsonb_build_object('gold', 1, 'accrued_to', to_jsonb(v_t2),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',1,'ticks',1))),
             jsonb_build_object('v', 1, 'hp', 3));
    if coalesce((v_r->>'ok')::boolean, false) is not true or (v_r->>'chained')::boolean is not true then
      raise exception 'c5b: a SHADOW gather settle refused its carrier while combat was armed: %', v_r;
    end if;

    -- ── c6: THE KILL. Arm both, then ONE statement.
    update public.hr_tick_config set armed_channels = array['combat','gather'] where id;
    update public.hr_tick_config set armed_channels = '{}' where id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'c6: the kill statement touched % row(s), expected 1', v_n; end if;
    for r in select * from (values ('gather', v_ug), ('combat', v_uc)) t(ch, u) loop
      v_r := public.hr_tick_settle('selfcheck', r.u, 0, r.ch, null,
               '1970-01-01T00:00:00Z'::timestamptz, now(),
               '00000000-0000-0000-0000-000000000000',
               jsonb_build_object('accrued_to', to_jsonb(now())));
      if (v_r->>'shadow')::boolean is not true or v_r->>'channel' is distinct from r.ch then
        raise exception 'c6b: after the kill, % still answers armed: %', r.ch, v_r;
      end if;
    end loop;
    if position('armed_channels' in pg_get_functiondef('public.hr_party_mark(uuid)'::regprocedure)) = 0 then
      raise exception 'c6c: hr_party_mark does not read armed_channels';
    end if;

    -- ── c7: ADMISSION. The gather character's shadow chain is current (c5b
    --        moved it to v_t2); age its REAL settle and read the roster.
    delete from public.hr_tick_ownership where user_id = v_uc;   -- one character in play
    update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = v_ug;
    update public.hr_tick_ownership set shadow_accrued_to = now() - interval '1 minute' where user_id = v_ug;
    update public.player_state set accrued_to = now() - interval '25 hours' where user_id = v_ug;
    select count(*) into v_n from public.hr_tick_roster(array['gather'], 0, 500, 'selfcheck-c7', 30000)
     where user_id = v_ug;
    if v_n <> 1 then
      raise exception 'c7: SHADOW gather, raw 25 h old, chain 1 min old: rostered % time(s), expected 1', v_n;
    end if;
    update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = v_ug;
    update public.player_state set accrued_to = now() - interval '7 days' - interval '1 minute' where user_id = v_ug;
    select count(*) into v_n from public.hr_tick_roster(array['gather'], 0, 500, 'selfcheck-c7', 30000)
     where user_id = v_ug;
    if v_n <> 0 then
      raise exception 'c7b: shadow admission did not END at 7 days — rostered % time(s)', v_n;
    end if;
    if public.hr_tick_admit(false, now() - interval '7 days' - interval '1 minute', now())
       is distinct from 'shadow_expired' then
      raise exception 'c7c: the 7-day end is not reported as shadow_expired (it must be LOUD)';
    end if;
    update public.player_state set accrued_to = now() - interval '7 days' + interval '1 minute' where user_id = v_ug;
    select count(*) into v_n from public.hr_tick_roster(array['gather'], 0, 500, 'selfcheck-c7', 30000)
     where user_id = v_ug;
    if v_n <> 1 then
      raise exception 'c7d: 7 d - 1 min with a current chain was not rostered (% rows)', v_n;
    end if;
    -- ARMED: the raw fence, unchanged. Shadow mark = now() buys nothing.
    update public.hr_tick_config set armed_channels = array['gather'] where id;
    update public.hr_tick_ownership set lease_holder = null, lease_until = null, shadow_accrued_to = now()
     where user_id = v_ug;
    update public.player_state set accrued_to = now() - interval '25 hours' where user_id = v_ug;
    select count(*) into v_n from public.hr_tick_roster(array['gather'], 0, 500, 'selfcheck-c7', 30000)
     where user_id = v_ug;
    if v_n <> 0 then
      raise exception 'c7e: ARMED gather, raw 25 h old, shadow mark now(): rostered % time(s) — S-14 broken', v_n;
    end if;
    if public.hr_tick_admit(null, now() - interval '25 hours', now()) is distinct from 'fenced_24h' then
      raise exception 'c7f: an UNKNOWN mode did not take the narrower (armed) fence';
    end if;
    update public.hr_tick_config set armed_channels = '{}' where id;

    -- ── c8
    for r in
      select f, role, want from (values
        ('public.hr_tick_admit(boolean,timestamptz,timestamptz)', 'hr_tick',   false),
        ('public.hr_tick_admit(boolean,timestamptz,timestamptz)', 'hr_engine', false),
        ('public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'hr_tick',   true),
        ('public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'hr_engine', false),
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'hr_engine', true),
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'hr_tick',   false),
        ('public.hr_party_mark(uuid)', 'hr_engine', false),
        ('public.hr_party_mark(uuid)', 'hr_tick',   false),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)', 'hr_tick',   true),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)', 'hr_engine', false),
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_engine', true),
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_tick',   false),
        ('public.hr_tick_cron_run()', 'hr_engine', false),
        ('public.hr_tick_cron_run()', 'hr_tick',   false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_engine', false),
        ('public.hr_tick_stall_status(timestamptz,int,int)', 'hr_tick',   false)) t(f, role, want)
      union all
      select f, c.role, false from (values
        ('public.hr_tick_admit(boolean,timestamptz,timestamptz)'),
        ('public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)'),
        ('public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb,jsonb)'),
        ('public.hr_party_mark(uuid)'),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)'),
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'),
        ('public.hr_tick_cron_run()'),
        ('public.hr_tick_stall_status(timestamptz,int,int)')) t(f)
      cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) c(role)
    loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, r.f, 'execute') is distinct from r.want then
          raise exception 'c8: % EXECUTE on % is %, expected %', r.role, r.f,
            has_function_privilege(r.role, r.f, 'execute'), r.want;
        end if;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── THE SWITCHES THIS BLOCK FLIPPED, RESTORED AND READ BACK (S-5).
    update public.hr_tick_config
       set armed_channels = v_armed_before, enabled = v_enabled_before, channels = v_chan_before
     where id;
    select armed_channels, enabled, channels into v_armed, v_enabled, v_chan
      from public.hr_tick_config where id;
    if v_armed is distinct from v_armed_before or v_enabled is distinct from v_enabled_before
       or v_chan is distinct from v_chan_before then
      raise exception 'c9: hr_tick_config was not restored — armed %/% enabled %/% channels %/%',
        v_armed, v_armed_before, v_enabled, v_enabled_before, v_chan, v_chan_before;
    end if;

    raise exception 'HR1006_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1006_ROLLBACK_OK' then raise; end if;
  end;
end $$;
