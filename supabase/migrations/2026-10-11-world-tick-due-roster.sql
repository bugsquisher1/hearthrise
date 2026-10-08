-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-world-tick-due-roster.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half,
-- no client half (the edge already skips below the flush line and already
-- ignores the roster's `state`, so it needs no deploy for this file).
--
-- WORLD-TICK SCALE, STAGE S1 — THE ROSTER SERVES ONLY WHAT IS DUE.
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "Scale" (S1).
--
-- ── WHAT WAS MEASURED (production, read-only, 2026-10-08) ───────────────────
--   hr_tick_cron_log.ms = 28 + 17 r per fire, r = rostered (<= batch 200).
--   Two things make up the 17 ms slope and BOTH buy nothing:
--   (a) EVERY owned character is rostered on EVERY 10 s fire, but the edge
--       settles one only when its next window is a full flush (90 s) long:
--       8 of every 9 visits are a `below_flush` skip after a full edge
--       hydration (25-88 ms of edge time each);
--   (b) the roster hydrates every row with hr_state_of into its `state`
--       column, which the edge never reads (tick.js parseSelectors keeps
--       user_id and slot; step (1) re-reads hr_state_of itself).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_roster, restated from LIVE (prosrc md5 a7cf559e, the 2026-10-06
--    channel-arm body) with THREE deltas and nothing else:
--    (1) DUE ONLY: the claim adds `m.mark <= now() - flush_seconds`, on the
--        SAME effective mark the fence compares and the edge probes. Every
--        character it serves is due at the edge (whose now() is later).
--    (2) `state` is NULL. The column stays (no caller breaks).
--    (3) PARKED SKIP (2026-10-10-world-tick-presence-horizon.sql, (8d)): an
--        ARMED character whose next one-flush window would end past its
--        horizon (last real return + offline cap) AND whose crossing is
--        already journalled in hr_tick_horizon_log for its current anchor is
--        not offered: the fence would refuse it past_horizon on every fire
--        until the player returns. The first crossing is still served, so
--        the fence journals it exactly once.
--    Signature, grants, ordering, keyset cursor, lease, admission, invariant
--    7 and the seed column are unchanged in every term.
-- §2 grants restated exactly as the chain left them (hr_tick only).
-- §3 self-check, executed.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   Unchanged: the claim is `for update of o skip locked` on the ownership
--   row and stamps the lease in the same statement. A character that is not
--   due is not locked and not leased at all, so it cannot be held by a fire
--   that will not settle it. The watermark CAS, the version CAS and the
--   intent key in hr_tick_settle / hr_apply are untouched; nothing here can
--   make a window pay or pay twice. Re-applying this file is a no-op (§0
--   accepts its own body; §3 asserts the same properties again).
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   NOTHING HERE MOVES VALUE. The roster only decides who is OFFERED to the
--   edge; the fence (hr_tick_settle) decides every payment under its own
--   locks and re-derives every number. A character the due line holds back
--   keeps its time OWED on an unmoved mark (paid by the next fire or by its
--   own accrue). No grant, table, column, policy or client surface changes.
--   Less leaves the database: the posted body no longer carries the
--   rostered characters' full envelopes (it never needed them).
--
-- ── COST (measured live, projected; design note "Scale" has the table) ──────
--   Rows rostered per fire: r = min(due, batch) instead of min(owned, batch);
--   at steady state due ~= owned x cadence / flush = owned / 9.
--   Postgres per rostered row: hydration gone (~17 ms -> ~1 ms: claim, lease,
--   seed). The new per-fire floor is the claim's scan of the owned rows,
--   a plain column compare first.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-apply the hr_tick_roster statement of 2026-10-06-world-tick-channel-arm
--   .sql §3 (create or replace, same signature, same grants). Safe at any
--   time: the old roster serves a superset.
--
-- ── KNOWN LIMITATIONS ───────────────────────────────────────────────────────
--   * The due line is the global flush. Away characters are still visited
--     once per flush; folding several windows into one visit is S3/S4.
--   * The 'empty' fire outcome becomes the common one at low population
--     (nobody due this fire). It already existed and costs ~8 ms.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE BODY BEING RESTATED IS THE ONE MEASURED LIVE ──────
do $$
declare
  v_roster text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)');
  if v_roster is null or v_roster not in ('a7cf559ec53b6a840dcd8bbbb9f1095f', '28e005c072f0d23f854b3c3ce3cede23') then
    raise exception 'PRECONDITION: hr_tick_roster prosrc md5 is %, expected the live a7cf559e (2026-10-06 channel-arm) '
                    'or this file''s 28e005c072f0d23f854b3c3ce3cede23. Re-cut this file against the live body.', v_roster;
  end if;
  if to_regclass('public.hr_tick_config') is null
     or to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)') is null
     or to_regprocedure('public.hr_partied(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_return_anchor') is null
     or to_regclass('public.hr_tick_horizon_log') is null
     or to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_tick_config, hr_tick_admit, hr_partied, hr_assert_grant_hygiene, '
                    'hr_offline_cap_ms or the presence horizon (2026-10-10-world-tick-presence-horizon.sql) is absent.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'flush_seconds') then
    raise exception 'PRECONDITION: hr_tick_config.flush_seconds is absent.';
  end if;
end $$;

-- ── §1 hr_tick_roster (S1) ──────────────────────────────────────────────────
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
  select c.armed_channels, make_interval(secs => c.flush_seconds)
    into v_armed, v_flush
    from public.hr_tick_config c where c.id;
  v_armed := coalesce(v_armed, '{}'::text[]);
  v_flush := coalesce(v_flush, interval '0 seconds');

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
       and m.mark <= now() - v_flush
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
--   k0  the installed roster body is this file's (md5)
--   d1  ★ DUE: an armed gatherer 10 min behind is rostered, leased to the
--       caller's holder, and its `state` is NULL (no hydration)
--   d2  ★ NOT DUE: an armed gatherer 30 s behind is NOT rostered and its
--       lease is untouched (no lock, no lease, no body row)
--   d3  the boundary: a mark exactly one flush old is due (<=)
--   d4  ★ SHADOW uses the chained mark: a combat (unarmed) character whose raw
--       accrued_to is 2 h old but whose shadow chain is 20 s old is NOT due;
--       one whose chain is 5 min old IS, and is served at the chain mark
--   d5  the line follows the config: flush 600 s -> the 10 min gatherer is
--       still due (600 s <= 10 min) and a 5 min one is not
--   d7  ★ PARKED: an armed gatherer whose next window crosses its horizon is
--       served while the crossing is unjournalled, and not once
--       hr_tick_horizon_log holds its current anchor
--   d6  grants: hr_tick executes the roster; anon, authenticated,
--       service_role and hr_engine do not; hygiene STRICT
--   kr  the config switches this block flipped are restored and read back
-- Every probe row (and every lease the roster stamped on any row) is rolled
-- back by the sentinel exception.
do $$
declare
  v_due  uuid := '00000000-0000-4000-8000-0000000e7101';
  v_new  uuid := '00000000-0000-4000-8000-0000000e7102';
  v_edge uuid := '00000000-0000-4000-8000-0000000e7103';
  v_chf  uuid := '00000000-0000-4000-8000-0000000e7104';
  v_chd  uuid := '00000000-0000-4000-8000-0000000e7105';
  v_five uuid := '00000000-0000-4000-8000-0000000e7106';
  v_park uuid := '00000000-0000-4000-8000-0000000e7107';
  v_cap  bigint;
  v_all  uuid[];
  v_gact text;
  v_cact text;
  v_cfg  public.hr_tick_config%rowtype;
  v_r    record;
  v_n    int;
  v_flush int;
  v_ok   boolean;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)'::regprocedure)
       <> '28e005c072f0d23f854b3c3ce3cede23' then
      raise exception 'k0: the installed hr_tick_roster body is not the one this file states';
    end if;

    -- ── fixture
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'],
           armed_channels = array['gather'], flush_seconds = 90, cadence_seconds = 10
     where id;
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_gact is null or v_cact is null then raise exception 'k-fixture: hr_activities lacks a gather or combat row'; end if;
    v_all := array[v_due, v_new, v_edge, v_chf, v_chd, v_five];
    insert into auth.users (id) select unnest(v_all) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    select u, 0, 0, 0, 10, 10, 1, m, k, case k when 'combat' then v_cact else v_gact end,
           now() - interval '3 hours'
      from (values (v_due,  now() - interval '10 minutes', 'gather'),
                   (v_new,  now() - interval '30 seconds', 'gather'),
                   (v_edge, now() - interval '90 seconds', 'gather'),
                   (v_five, now() - interval '5 minutes',  'gather'),
                   (v_chf,  now() - interval '2 hours',    'combat'),
                   (v_chd,  now() - interval '2 hours',    'combat')) t(u, m, k);
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, shadow_accrued_to)
    values (v_due, 0, 'gather', true, null), (v_new, 0, 'gather', true, null),
           (v_edge, 0, 'gather', true, null), (v_five, 0, 'gather', true, null),
           (v_chf, 0, 'combat', true, now() - interval '20 seconds'),
           (v_chd, 0, 'combat', true, now() - interval '5 minutes');

    create temp table s1_roster on commit drop as
      select * from public.hr_tick_roster(array['gather','combat']::text[], 0, 500, 's1-proof', 30000,
                                          null::timestamptz, null::uuid, null::int)
       where user_id = any (v_all);

    -- ── d1
    select * into v_r from s1_roster where user_id = v_due;
    if not found or v_r.state is not null
       or (select lease_holder from public.hr_tick_ownership
            where user_id = v_due and slot = 0 and channel = 'gather') is distinct from 's1-proof' then
      raise exception 'd1: the due gatherer was not rostered and leased, or its state was hydrated';
    end if;
    if exists (select 1 from s1_roster where state is not null) then
      raise exception 'd1b: a rostered row carries a hydrated state';
    end if;
    -- ── d2
    if exists (select 1 from s1_roster where user_id = v_new)
       or (select lease_holder from public.hr_tick_ownership
            where user_id = v_new and slot = 0 and channel = 'gather') is not null then
      raise exception 'd2: a gatherer 30 s behind was rostered or leased';
    end if;
    -- ── d3
    if not exists (select 1 from s1_roster where user_id = v_edge) then
      raise exception 'd3: a mark exactly one flush old was not due';
    end if;
    -- ── d4
    if exists (select 1 from s1_roster where user_id = v_chf) then
      raise exception 'd4: a shadow character whose chain is 20 s old was rostered (the raw mark is 2 h old)';
    end if;
    select * into v_r from s1_roster where user_id = v_chd;
    if not found or v_r.accrued_to <> (select shadow_accrued_to from public.hr_tick_ownership
                                         where user_id = v_chd and slot = 0 and channel = 'combat') then
      raise exception 'd4b: a shadow character whose chain is 5 min old was not served at its chain mark';
    end if;
    drop table s1_roster;

    -- ── d5 the line follows the config
    update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = any (v_all);
    update public.hr_tick_config set flush_seconds = 600 where id;
    select count(*) filter (where user_id = v_due), count(*) filter (where user_id = v_five)
      into v_n, v_flush
      from public.hr_tick_roster(array['gather']::text[], 0, 500, 's1-proof-2', 30000,
                                 null::timestamptz, null::uuid, null::int)
     where user_id = any (v_all);
    if v_n <> 1 or v_flush <> 0 then
      raise exception 'd5: at flush 600 s the 10 min gatherer must be due (%) and the 5 min one not (%)', v_n, v_flush;
    end if;

    -- ── d7 parked at the horizon
    update public.hr_tick_config set flush_seconds = 90 where id;
    insert into auth.users (id) values (v_park) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_park, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather', v_gact, now() - interval '30 hours');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned) values (v_park, 0, 'gather', true);
    v_cap := public.hr_offline_cap_ms(v_park, 0);
    -- The tick has paid since R: R + cap is 9 min ago and the mark 10 min ago,
    -- so the next 90 s window ends 30 s past the horizon.
    insert into public.hr_return_anchor (user_id, slot, real_return_at)
    values (v_park, 0, now() - interval '9 minutes' - v_cap * interval '1 millisecond')
    on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at;
    if not exists (select 1 from public.hr_tick_roster(array['gather']::text[], 0, 500, 's1-park', 30000,
                                                        null::timestamptz, null::uuid, null::int) r
                    where r.user_id = v_park) then
      raise exception 'd7: the first horizon crossing was not served (the fence must journal it once)';
    end if;
    update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = v_park;
    insert into public.hr_tick_horizon_log (user_id, slot, anchor_at, channel, horizon_at, cap_ms, mark)
    select v_park, 0, a.real_return_at, 'gather', a.real_return_at + v_cap * interval '1 millisecond', v_cap,
           now() - interval '10 minutes'
      from public.hr_return_anchor a where a.user_id = v_park and a.slot = 0;
    if exists (select 1 from public.hr_tick_roster(array['gather']::text[], 0, 500, 's1-park-2', 30000,
                                                    null::timestamptz, null::uuid, null::int) r
                where r.user_id = v_park) then
      raise exception 'd7b: a PARKED character (journalled crossing for its anchor) was still served';
    end if;

    -- ── d6 grants
    if not has_function_privilege('hr_tick', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('anon', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('service_role', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute') then
      raise exception 'd6: hr_tick_roster EXECUTE is not exactly {hr_tick} among the request roles';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr
    update public.hr_tick_config
       set enabled = v_cfg.enabled, channels = v_cfg.channels, armed_channels = v_cfg.armed_channels,
           flush_seconds = v_cfg.flush_seconds, cadence_seconds = v_cfg.cadence_seconds
     where id;
    select (enabled, channels, armed_channels, flush_seconds, cadence_seconds)
           is not distinct from (v_cfg.enabled, v_cfg.channels, v_cfg.armed_channels,
                                 v_cfg.flush_seconds, v_cfg.cadence_seconds)
      into v_ok from public.hr_tick_config where id;
    if not v_ok then raise exception 'kr: the config was not restored'; end if;

    raise exception 'HR1011D_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1011D_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-due-roster: EXECUTED — a due gatherer is rostered and leased with no hydration; '
               'one 30 s behind is neither rostered nor leased; the one-flush boundary is due; shadow uses the '
               'chained mark; the line follows flush_seconds; EXECUTE is hr_tick only; hygiene strict — all green';
end $$;
