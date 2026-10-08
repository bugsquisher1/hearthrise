-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-world-tick-ledger-fold.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. Applies AFTER
-- 2026-10-11-world-tick-catchup.sql (it reads fold_windows).
-- EDGE HALF: tick.js settleFolded (S4). Inert at fold_windows = 1 (the line is
-- one flush for everyone, exactly 2026-10-11-world-tick-due-roster.sql).
--
-- WORLD-TICK SCALE, STAGE S4 — LEDGER COMPACTION FOR AWAY CHARACTERS.
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "Scale" (S4).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   One settle = one hr_apply = one player_ledger row, every 90 s: 960 rows
--   per tick-owned character per day (192k/day at 200, 960k at 1,000, past the
--   480k/day prune ceiling at ~500). An away character's 90 s granularity buys
--   nobody anything — nobody is watching — so the edge folds F consecutive
--   windows into ONE settle (each window computed exactly as its own fire
--   would; tests/world-tick-scale.mjs F1 proves the pay identical), and THIS
--   file makes the roster wait until F windows are due before it visits an
--   away character. 120 rows/char/day at F = 8.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_roster restated from 2026-10-11-world-tick-due-roster.sql (md5
--    c4f6acbc) with ONE delta: the due line is `flush x F` for an ARMED GATHER
--    character with no live heartbeat (player_state.last_seen_at outside
--    hr_frame_wanted's 75 s), `flush` for everyone else. F = fold_windows,
--    clamped 1..8 again here (the CHECK is the primary bound).
-- §2 grants restated (hr_tick only).
-- §3 self-check, executed.
--
-- ── WHAT THE JOURNAL STILL SAYS ─────────────────────────────────────────────
--   Every value movement is journalled (CLAUDE.md §6): a folded row carries
--   the SUM of its windows' gold/xp/items in its own columns and meta.delta,
--   and meta {ms, ticks, qty, from, to, node, skill, capped, w?, src:'tick'}
--   over the contiguous span the watermark moved — the shape of an ordinary
--   accrue row, which already covers up to a 12 h absence in one row. V2
--   (no overlap; Σ meta.ms <= wall clock) reads it unchanged.
--
-- ── MONEY BOUNDS ────────────────────────────────────────────────────────────
--   Unchanged and per settle: the folded span passes the same fence (lease,
--   watermark CAS, version CAS, 8b, and 8c on its FIRST window — the strictest
--   of the F). This file only changes WHEN an away character is offered.
--   A player who comes back while held settles their own time through accrue
--   (capped, same engine); the tick then finds a fresh mark. No window is ever
--   paid twice: the watermark CAS refuses any overlap, whoever settles first.
--
-- ── LAG JUDGE ───────────────────────────────────────────────────────────────
--   An away character now waits up to F x 90 s + one cadence between tick
--   payments (8: 12 min 10 s). hr_tick_stall_status' per-character judge is
--   15 min, which is why the fold CHECK stops at 8. Raising it needs c_lag
--   derived from the dial first.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Operational: `update hr_tick_config set fold_windows = 1`. Full undo:
--   re-apply the hr_tick_roster statement of 2026-10-11-world-tick-due-roster.sql.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare
  v_roster text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)');
  if v_roster is null or v_roster not in ('28e005c072f0d23f854b3c3ce3cede23', '01b51f60baf96b8397d5458ba322d261') then
    raise exception 'PRECONDITION: hr_tick_roster prosrc md5 is %, expected 2026-10-11-world-tick-due-roster.sql''s '
                    '28e005c072f0d23f854b3c3ce3cede23 or this file''s 01b51f60baf96b8397d5458ba322d261.', v_roster;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'fold_windows')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state' and column_name = 'last_seen_at') then
    raise exception 'PRECONDITION: hr_tick_config.fold_windows (2026-10-11-world-tick-catchup.sql) or player_state.last_seen_at is absent.';
  end if;
  -- The online test below restates hr_frame_wanted's: 75 s, not in the future.
  if position('interval ''75 seconds''' in (select p.prosrc from pg_proc p
                where p.oid = to_regprocedure('public.hr_frame_wanted(uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_frame_wanted no longer uses a 75 s heartbeat; re-derive the roster''s online test.';
  end if;
end $$;

-- ── §1 hr_tick_roster (S4) ──────────────────────────────────────────────────
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
  -- THE DUE LINE (2026-10-11, world-tick scale S1). A character is rostered
  -- only when its next window is at least one flush long: mark <= now() -
  -- flush. Below that line the edge answers `below_flush` and settles
  -- nothing (tick.js step (4)), so rostering it bought a lease, a seed, a
  -- body row and a full edge hydration for a guaranteed skip: 8 of every 9
  -- visits at the 10 s cadence and 90 s flush. Read from the config
  -- singleton with the mode, in the same statement. A missing row reads as
  -- 0 s, i.e. "everyone is due": the pre-S1 roster, which can only cost
  -- load, never money (the fence decides every payment).
  v_flush    interval;
  -- THE FOLD (2026-10-11, world-tick scale S4). An AWAY character is held
  -- back until fold_windows flushes are due, so the edge can settle them as
  -- ONE fold (one hr_apply, one ledger row). An ONLINE character (a live
  -- heartbeat) keeps the one-flush line. 1 when the dial is absent or 1.
  v_fold     int;
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
  select c.armed_channels, make_interval(secs => c.flush_seconds), c.fold_windows
    into v_armed, v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_armed := coalesce(v_armed, '{}'::text[]);
  v_flush := coalesce(v_flush, interval '0 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);

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
       -- ★ DUE ONLY (2026-10-11, S1). The edge's own flush line, restated on
       -- the SAME mark it will probe: it skips when now - mark < flush, and
       -- its now() is read after this statement commits, so every character
       -- served here is due at the edge too. A character that is not due is
       -- not leased, not posted and not hydrated; its time stays owed on its
       -- unmoved mark and it is served on the first fire after it crosses
       -- the line. A plain column compare, so the planner applies it before
       -- the hr_partied / hr_tick_admit calls (cost 100) for anyone.
       and m.mark <= now() - v_flush * (
             -- ★ AWAY WAITS FOR A FOLD (2026-10-11, S4). ARMED gather only —
             -- the one channel the edge folds; shadow and combat keep the
             -- one-flush line (their windows are never folded). ONLINE is
             -- hr_frame_wanted's own test, restated: a heartbeat
             -- (player_state.last_seen_at, written only as now() by
             -- hr_heartbeat) within 75 s and not in the future. A player who
             -- is watching is visited every flush; one who is away is visited
             -- every fold_windows flushes and settled as ONE row. Owed time is
             -- never lost: the mark stays where the last settle put it.
             case when a.armed and o.channel = 'gather'
                       and not coalesce(ps.last_seen_at >  now() - interval '75 seconds'
                                    and ps.last_seen_at <= now() + interval '60 seconds', false)
                  then v_fold else 1 end)
       -- ★ PARKED AT THE PRESENCE HORIZON (2026-10-10-world-tick-presence-
       -- horizon.sql, (8d)). An ARMED window may end no later than the last
       -- real return R + the offline cap; past it the fence refuses
       -- `past_horizon` on EVERY fire until the player returns. The first
       -- refusal per absence journals hr_tick_horizon_log (user, slot, R), so
       -- that row IS "this character is parked": once it exists and the next
       -- one-flush window would end past the horizon, the character is not
       -- offered at all. Until it exists the character is served, so the
       -- fence still refuses and journals the crossing exactly once. A
       -- character with no anchor is served (the fence's loud
       -- `no_return_anchor`). Shadow channels have no horizon.
       and not (a.armed and exists (
             select 1
               from public.hr_return_anchor ra
               join public.hr_tick_horizon_log hl
                 on hl.user_id = ra.user_id and hl.slot = ra.slot
                and hl.anchor_at = ra.real_return_at
              where ra.user_id = o.user_id and ra.slot = o.slot
                -- The logged horizon, exactly as the lag judge and vitals read
                -- "parked" (2026-10-10-world-tick-gather-widen.sql, Security
                -- scale review): the fence's own horizon at the crossing.
                and m.mark + v_flush > hl.horizon_at))
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
         -- NO HYDRATION HERE (2026-10-11, S1). This column carried
         -- hr_state_of(user, slot) for every rostered row and NOTHING READ
         -- IT: the edge re-reads hr_state_of in its own transaction (tick.js
         -- step (1): every field "is re-derived from the database") and
         -- parseSelectors keeps user_id and slot only. Measured on production
         -- 2026-10-08 it was the whole per-row slope of a fire, ~17 ms per
         -- rostered character (hr_tick_cron_log.ms = 28 + 17 r). The column
         -- stays in the signature so no caller breaks; it is NULL.
         null::jsonb                                                     as state
    from leased l
    join public.player_state ps
      on ps.user_id = l.user_id and ps.slot = l.slot
   -- The same order the claim walked, on the same value, so the driver's
   -- keyset cursor (max(accrued_to) + the last row's user/slot) names a
   -- boundary this function will compare against identically on the next pass.
   order by l.mark asc, ps.user_id asc, ps.slot asc;
end $$;

-- ── §2 GRANTS — restated EXACTLY as the chain left them (revoke first) ──────
revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;
revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int)
  from anon, authenticated, service_role, hr_engine;
grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;

-- ── §3 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
--   k0  the installed roster is this file's (md5)
--   f1  ★ fold 8: an AWAY armed gatherer 3 flushes behind is NOT due; 8
--       flushes behind IS
--   f2  ★ fold 8: an ONLINE armed gatherer (heartbeat 10 s ago) 1 flush
--       behind IS due (the watching player keeps the one-flush line)
--   f3  fold 8: a SHADOW combat character keeps the one-flush line
--   f4  fold 1: the away gatherer 3 flushes behind IS due (S1's line, exactly)
--   f5  grants: hr_tick only; hygiene STRICT
--   kr  the config is restored
do $$
declare
  v_away  uuid := '00000000-0000-4000-8000-0000000e7401';
  v_far   uuid := '00000000-0000-4000-8000-0000000e7402';
  v_live  uuid := '00000000-0000-4000-8000-0000000e7403';
  v_comb  uuid := '00000000-0000-4000-8000-0000000e7404';
  v_all   uuid[];
  v_gact  text;
  v_cact  text;
  v_cfg   public.hr_tick_config%rowtype;
  v_got   uuid[];
  v_ok    boolean;
begin
  begin
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)'::regprocedure)
       <> '01b51f60baf96b8397d5458ba322d261' then
      raise exception 'k0: the installed hr_tick_roster body is not the one this file states';
    end if;
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'],
           flush_seconds = 90, catchup_windows = 8, fold_windows = 8
     where id;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_gact is null or v_cact is null then raise exception 'k-fixture: hr_activities lacks a gather or combat row'; end if;
    v_all := array[v_away, v_far, v_live, v_comb];
    insert into auth.users (id) select unnest(v_all) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since, last_seen_at)
    values (v_away, 0, 0, 0, 10, 10, 1, now() - interval '270 seconds', 'gather', v_gact, now() - interval '3 hours', now() - interval '1 hour'),
           (v_far,  0, 0, 0, 10, 10, 1, now() - interval '720 seconds', 'gather', v_gact, now() - interval '3 hours', null),
           (v_live, 0, 0, 0, 10, 10, 1, now() - interval '90 seconds',  'gather', v_gact, now() - interval '3 hours', now() - interval '10 seconds'),
           (v_comb, 0, 0, 0, 10, 10, 1, now() - interval '2 hours',     'combat', v_cact, now() - interval '3 hours', null);
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, shadow_accrued_to)
    values (v_away, 0, 'gather', true, null), (v_far, 0, 'gather', true, null),
           (v_live, 0, 'gather', true, null), (v_comb, 0, 'combat', true, now() - interval '100 seconds');

    select array_agg(r.user_id) into v_got
      from public.hr_tick_roster(array['gather','combat']::text[], 0, 500, 'fold-proof', 30000,
                                 null::timestamptz, null::uuid, null::int) r
     where r.user_id = any (v_all);
    v_got := coalesce(v_got, '{}');
    if v_away = any (v_got) or not (v_far = any (v_got)) then
      raise exception 'f1: at fold 8 an away gatherer 3 flushes behind was served (%) or one 8 behind was not (%)',
        v_away = any (v_got), v_far = any (v_got);
    end if;
    if not (v_live = any (v_got)) then
      raise exception 'f2: an ONLINE gatherer one flush behind was not served at fold 8';
    end if;
    if not (v_comb = any (v_got)) then
      raise exception 'f3: a shadow combat character one flush behind was not served at fold 8';
    end if;

    update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = any (v_all);
    update public.hr_tick_config set fold_windows = 1 where id;
    if not exists (select 1 from public.hr_tick_roster(array['gather']::text[], 0, 500, 'fold-proof-2', 30000,
                                                        null::timestamptz, null::uuid, null::int) r
                    where r.user_id = v_away) then
      raise exception 'f4: at fold 1 the away gatherer 3 flushes behind was not served';
    end if;

    if not has_function_privilege('hr_tick', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('anon', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('service_role', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute') then
      raise exception 'f5: hr_tick_roster EXECUTE is not exactly {hr_tick} among the request roles';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    update public.hr_tick_config
       set enabled = v_cfg.enabled, channels = v_cfg.channels, armed_channels = v_cfg.armed_channels,
           flush_seconds = v_cfg.flush_seconds, fold_windows = 1, catchup_windows = v_cfg.catchup_windows
     where id;
    update public.hr_tick_config set fold_windows = v_cfg.fold_windows where id;
    select (enabled, channels, armed_channels, flush_seconds, catchup_windows, fold_windows)
           is not distinct from (v_cfg.enabled, v_cfg.channels, v_cfg.armed_channels, v_cfg.flush_seconds,
                                 v_cfg.catchup_windows, v_cfg.fold_windows)
      into v_ok from public.hr_tick_config where id;
    if not v_ok then raise exception 'kr: the config was not restored'; end if;

    raise exception 'HR1011F_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1011F_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-ledger-fold: EXECUTED — at fold 8 an away armed gatherer waits for 8 flushes, an online '
               'one keeps the one-flush line, shadow combat keeps it too; fold 1 is S1''s roster; hr_tick only; '
               'hygiene strict — all green';
end $$;
