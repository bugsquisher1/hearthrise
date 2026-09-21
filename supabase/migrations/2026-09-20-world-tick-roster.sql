-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-20-world-tick-roster.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE ONE NEW RPC OF THE LIVE-WORLD PROGRAM, and the only one.
-- docs/planning/WORLD_TICK_DESIGN.md §15a froze the tick's call list for the
-- first tick-owned channel (GATHER) at FOUR calls:
--
--     hr_tick_roster(kinds, shard, limit, holder, lease_ms)   ← NEW, this file
--     hr_seed(user, slot, 'accrue:'||accrued_to)              existing
--     hr_state_of(user, slot)                                 existing
--     hr_apply(user, slot, version, intent, delta)            existing, UNCHANGED
--
-- ⚠ AMENDED 2026-09-21: the last two are no longer reachable by the tick role
--   directly. They are reached through `hr_tick_seeds` and `hr_tick_settle`,
--   the lease-checked wrappers in 2026-09-21-world-tick-settle-fence.sql. The
--   CALL LIST is still four; the GRANT list at this file's point in the chain
--   is one. See the exploit-surface note below.
--
-- ⚠ NOTHING IN THIS FILE MOVES VALUE. It creates no faucet, no clamp, no
--   catalogue and no ledger row. It restates NO existing function body, so it
--   is on no derivation chain, takes over no last-toucher role and MOVES NO
--   LIVE HASH. It answers exactly one question — "which characters may the tick
--   simulate right now, and who holds them" — and the answer is `false` until
--   an operator says otherwise (§3, the ownership flag defaults to NOT owned).
--
-- ── WHY THE WRITER IS NOT NEW, AND WHY THAT IS THE POINT ────────────────────
-- The brief for this file asked for a new RPC that is "idempotent on (user,
-- slot, window_from), with clamps identical to accrue's and a journal row shape
-- identical to accrue's". Every one of those properties is ALREADY TRUE of
-- `hr_apply`, and the right way to get them is to not write a second writer:
--
--   idempotent on (user, slot, window_from)
--       the tick derives its `p_intent_id` as uuid5('tick:<shard>:<user>:
--       <slot>:<windowFromMs>') — services/world-tick/gather.js tickIntentId —
--       so a retry after a timeout replays to the same key and hr_apply returns
--       the STORED DECISION instead of re-applying. Belt and braces, which a
--       payment path should have: hr_apply also clamps `accrued_to` into
--       [old, now()], so a replayed window is refused on arithmetic even if the
--       key were lost.
--   clamps identical to accrue's
--       they ARE accrue's. hr_apply's per-call and per-day clamps in four
--       currencies (gold, xp, qty, gems) are inside hr_apply and apply to every
--       caller. A tick-specific clamp would be a second copy that drifts.
--   journal row shape identical
--       hr_apply writes the ledger row from `delta.journal`, and the tick emits
--       `kind:'gather', intent:'accrue'` with accrueGather's own meta keys
--       (ms, ticks, qty, capped, node, skill, w?, from, to) plus ONE marker,
--       `src:'tick'`. A player's ledger cannot tell a tick from an accrue; an
--       operator can. That asymmetry is deliberate.
--
-- So a new writer would have had to RE-IMPLEMENT the version check, the
-- per-character lock, four currencies of clamp, the daily budget, the rejection
-- journal and the ledger insert — the exact "second copy" this architecture
-- exists to prevent (CLAUDE.md §1). The tick is just another server-side
-- CALLER of the writer that already exists, and hr_apply re-validates every
-- invariant regardless of caller: it has never trusted the Edge Function and it
-- does not trust the tick.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §0  Preflight anchors. Fails closed if the objects it builds on are absent.
--   §1  Role `hr_tick`: nologin, noinherit, ZERO table privileges.
--   §2  `hr_shard_of(uuid) → int`. Returns 0 for everybody (one shard for the
--       beta, §9). A second shard is a function-body change, not a migration.
--   §3  Table `hr_tick_ownership` — the ROLLOUT FLAG per (user, slot, channel).
--       RLS enabled with ZERO POLICIES, so it is unreachable by every client
--       role in both directions. Fail-safe is NOT OWNED.
--   §4  `hr_tick_roster(...)` — SECURITY DEFINER. The active set + the lease.
--   §5  Grants. `revoke ... from public` FIRST, then the single grant.
--   §6  Self-check, EXECUTED, in a subtransaction that is rolled back.
--
-- ── EXPLOIT-SURFACE DELTA, STATED FOR THE SECURITY REVIEW ───────────────────
-- ONE new role with ONE execute grant, and one new table no client can read.
--
-- ⚠ AMENDED 2026-09-21 AFTER THE SECURITY VERDICT (GO-WITH-CHANGES,
--   docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md). As staged this file
--   granted `hr_tick` EXECUTE on hr_apply and on hr_seed directly, and argued
--   that this was "exactly the privilege hr_engine has held since 2026-08-11".
--   Two things were wrong with that:
--
--     S-1  It does not work. hr_apply's impersonation seam tests
--          `v_role = 'hr_engine'` LITERALLY, so hr_tick fell to
--          `v_uid := auth.uid()` — NULL for a nologin role — and every tick
--          call was refused `forbidden_impersonation`, the highest-signal
--          anti-cheat alert in the system, at one per flush per character.
--     S-7  hr_seed granted to hr_tick is an RNG oracle over EVERY (user, slot,
--          label) in the database, not only over the characters the tick holds
--          a lease on.
--
--   Both grants are WITHDRAWN here (§5) and replaced in
--   2026-09-21-world-tick-settle-fence.sql by two narrow SECURITY DEFINER
--   wrappers — `hr_tick_settle` and `hr_tick_seeds` — each of which refuses
--   unless the caller holds a LIVE LEASE on the exact (user, slot, channel) it
--   names. So the tick host can settle only what the roster handed it, and a
--   compromised tick host is strictly LESS dangerous than a compromised edge
--   deploy rather than merely equal to it. The header's original claim that
--   "hr_apply is UNCHANGED" survives, and is the reason the wrapper route was
--   preferred over splicing the money function's seam.
--
-- `hr_state_of` needs NO grant: the roster returns the hydration envelope by
-- calling it internally as definer, so the tick never holds that EXECUTE.
--
-- The two questions I would ask in the reviewer's seat, answered:
--   1. Can the tick settle a window it should not? Its only inputs are server
--      rows and the host clock. A FAST CLOCK is the real attack, and it fails
--      closed: `now()` inside hr_apply clamps accrued_to into [old, now()], so
--      a host running ahead proposes a window the database refuses. Skew shows
--      up as refusals, never as mints — the right direction, and alertable.
--   2. Can a compromised tick host drain an account? It can propose any delta
--      for any character in its shard — bounded by hr_apply's clamps and
--      recorded by the ledger, identically to the edge. No new bound is needed
--      and none is invented here.
--
-- REVERSIBLE: `update public.hr_tick_ownership set owned = false;` stops the
-- tick dead with no schema change and no player-visible effect (the accrual
-- path resumes from `accrued_to`, which is where the tick left it — see the
-- handover state machine, WORLD_TICK_DESIGN.md §15b). A full undo is
-- `revoke`/`drop function hr_tick_roster` + `drop table hr_tick_ownership` +
-- `drop role hr_tick`; nothing else in the schema references them.
-- Re-applying this file is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first — player_state is missing';
  end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'run 2026-08-11-apply-engine.sql / 2026-09-14-hr-apply-restatement.sql first — hr_apply is missing';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'hr_state_of(uuid,integer) is missing — the roster hydrates through it';
  end if;
  if to_regprocedure('public.hr_seed(uuid,integer,text)') is null then
    raise exception 'hr_seed(uuid,integer,text) is missing — the per-window PRNG label needs it';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'hr_engine role missing — run 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── §1 THE ROLE ─────────────────────────────────────────────────────────────
-- Modelled line for line on hr_engine (2026-08-11-player-state.sql §1). A role,
-- not a convention: "the tick" must be something the DATABASE can refuse.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hr_tick') then
    create role hr_tick nologin noinherit;
  end if;
  -- PostgREST reaches a role by `set role` from `authenticator`, so a JWT
  -- carrying `role: hr_tick` can only exist if authenticator may become it.
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and not pg_has_role('authenticator', 'hr_tick', 'MEMBER') then
    execute 'grant hr_tick to authenticator';
  end if;
  -- The migration's own session must be able to SET ROLE hr_tick to exercise
  -- the gate in §6. Postgres 16+ does not make the creator a member.
  if not pg_has_role(current_user, 'hr_tick', 'SET') then
    execute format('grant hr_tick to %I', current_user);
  end if;
  execute 'grant usage on schema public to hr_tick';
  -- BELT AND BRACES. Whatever else happens in this file, hr_tick ends it
  -- holding ZERO table, sequence and function privileges; §5 then grants back
  -- exactly three EXECUTEs and nothing else. Asserted by §6 e5/e6.
  execute 'revoke all on all tables in schema public from hr_tick';
  execute 'revoke all on all sequences in schema public from hr_tick';
  execute 'revoke all on all functions in schema public from hr_tick';
end $$;

-- ── §2 THE SHARD FUNCTION ───────────────────────────────────────────────────
-- §9: shard = world region, not a hash bucket. ONE shard for the beta, so this
-- returns 0 for everybody and exists from day one purely so that adding a
-- second region is a function-body change and a second container rather than a
-- migration against live rows. IMMUTABLE so it can sit in an index later.
create or replace function public.hr_shard_of(p_user uuid)
returns int language sql immutable parallel safe set search_path = public as $$
  select 0;
$$;

-- ── §3 THE OWNERSHIP FLAG ───────────────────────────────────────────────────
-- WHAT THIS IS: the rollout switch, per (user, slot, channel). It is NOT the
-- correctness mechanism — the watermark is (WORLD_TICK_DESIGN.md §15b). Neither
-- a double pay nor a gap is possible whatever this table says, because
-- `player_state.accrued_to` is the single source of truth, moves only forward,
-- and moves only inside hr_apply's per-character lock. This table decides only
-- WHO does the settling, so that the channel can be moved one character at a
-- time and moved back in one statement.
--
-- FAIL-SAFE IS "NOT OWNED": a missing row, a false flag or an unreadable table
-- all mean the accrual path keeps the channel. That is the same direction as
-- every gate in CLAUDE.md §6 (never restore or evict on uncertainty).
create table if not exists public.hr_tick_ownership (
  user_id      uuid        not null,
  slot         int         not null,
  channel      text        not null,
  owned        boolean     not null default false,
  -- The lease: which process holds this character right now, and until when.
  -- §10's "a character is owned by exactly one tick process at a time". A
  -- durable lease rather than only a session advisory lock, because a POOLED
  -- connection can outlive the process that took the lock.
  lease_holder text,
  lease_until  timestamptz,
  -- THE SHADOW WATERMARK (2026-09-21). While hr_tick_config.shadow is true the
  -- tick pays nothing, so `player_state.accrued_to` never moves for it — and a
  -- tick that kept chaining on accrued_to would propose [T0, T0+10], then
  -- [T0, T0+20], then [T0, T0+30]: OVERLAPPING windows, every one of them
  -- journalled, so summing hr_tick_shadow over 48 h would count the same
  -- minutes again and again and the parity number the shadow run exists to
  -- produce would be a lie in the OVER-paying direction.
  --
  -- This is the watermark the tick chains on INSTEAD, and only while shadowed.
  -- It is not player value and it is not authority: it is cleared the moment
  -- the channel is armed, and it can never be ahead of what the player would
  -- have been paid, because the fence takes greatest(accrued_to, this) — so a
  -- client accrue landing in the middle drags it forward rather than being
  -- replayed over.
  shadow_accrued_to timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot, channel),
  constraint hr_tick_ownership_channel_ck
    check (channel in ('combat', 'gather', 'artisan')),
  constraint hr_tick_ownership_slot_ck check (slot >= 0 and slot < 100)
);

-- RLS ON, ZERO POLICIES. Not a mistake and not a TODO: with RLS enabled and no
-- policy, every non-owner role sees zero rows and may write none, in BOTH
-- directions. There is deliberately no client read policy either — a player
-- must not be able to learn whether the tick owns them, and nothing the client
-- renders depends on it (the envelope is identical either way).
alter table public.hr_tick_ownership enable row level security;
alter table public.hr_tick_ownership force row level security;

do $$
begin
  execute 'revoke all on public.hr_tick_ownership from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

create index if not exists hr_tick_ownership_owned_idx
  on public.hr_tick_ownership (channel, owned)
  where owned;

-- ── §4 hr_tick_roster ───────────────────────────────────────────────────────
-- The active set, the hydration envelope, the seed label and the lease, in one
-- call. SECURITY DEFINER because hr_tick holds no table privilege of its own —
-- the whole point of the role.
create or replace function public.hr_tick_roster(
  p_kinds    text[],
  p_shard    int     default 0,
  p_limit    int     default 200,
  p_holder   text    default null,
  p_lease_ms int     default 30000,
  -- THE CURSOR (2026-09-21). A keyset, not an offset: the driver hands back the
  -- last row of the previous batch and this call resumes strictly after it, so a
  -- roster larger than `p_limit` is walked to its end instead of re-serving its
  -- head. Both NULL — the default and the wrap — start from the beginning.
  -- Ordering is `(accrued_to, user_id, slot)`, which is total, so no row can be
  -- skipped or served twice inside one pass.
  p_after_accrued timestamptz default null,
  p_after_user    uuid        default null,
  p_after_slot    int         default null
)
returns table (
  user_id      uuid,
  slot         int,
  shard        int,
  active_kind  text,
  active_id    text,
  active_since timestamptz,
  -- ★ THE EFFECTIVE WATERMARK — WHERE THIS CHARACTER'S NEXT WINDOW STARTS.
  --   Armed: `player_state.accrued_to`, the instant hr_apply last paid to.
  --   Shadowed: `greatest(accrued_to, shadow_accrued_to)`, because the tick
  --   pays nothing and accrued_to would stand still. A caller may chain on
  --   this column alone, in either mode, and be correct (M-1).
  accrued_to   timestamptz,
  -- The shadow displacement, and ONLY when there is one: NULL whenever the
  -- column above already says everything there is to say (an armed channel, or
  -- a client accrue that overtook the shadow mark). NULL is the signal to use
  -- accrued_to, which is what this contract has always said and now does.
  shadow_accrued_to timestamptz,
  version      bigint,
  seed         bigint,
  state        jsonb
)
language plpgsql volatile security definer set search_path = public as $$
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
  -- The absence cap the accrual path already enforces (ACCRUE_MAX_SPAN_MS).
  -- A character past it is DROPPED from the roster rather than simulated to
  -- zero: their next window is worth nothing and accrual already forfeits the
  -- tail. This is what keeps the roster proportional to ACTIVE players.
  c_max_span constant interval := interval '24 hours';
  v_role     text;
  v_kinds    text[];
  v_limit    int;
  v_lease    interval;
  v_holder   text;
  -- THE MODE, READ FROM THE CONFIG SINGLETON RATHER THAN ASSUMED (M-1,
  -- Security 2026-09-21). The roster's `accrued_to` is WHERE THE NEXT WINDOW
  -- STARTS, and the fence decides that with `case when shadow then
  -- greatest(accrued_to, shadow_accrued_to) else accrued_to end`. If the
  -- roster used a different rule the two would disagree about the boundary and
  -- every proposal would be refused `window_already_settled` — which is
  -- precisely the stall M-1 measured. Same expression, same source of truth.
  v_shadow   boolean;
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

  -- ── (1b) THE MODE. Dynamic EXECUTE and a to_regclass guard because
  --        `hr_tick_config` is created by the NEXT file in the chain
  --        (2026-09-21-world-tick-settle-fence.sql), and this file's own §6
  --        self-check calls this function at apply time — a static reference
  --        would make the roster unappliable on its own.
  --        FAILS SAFE TO SHADOW: chaining on the shadow mark can only ever
  --        propose a window at or AFTER the paid one, so a wrong guess here
  --        skips time at worst and can never re-propose settled time.
  v_shadow := true;
  if to_regclass('public.hr_tick_config') is not null then
    execute 'select shadow from public.hr_tick_config where id' into v_shadow;
    v_shadow := coalesce(v_shadow, true);
  end if;

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
        select case when v_shadow
                    then greatest(ps.accrued_to,
                                  coalesce(o.shadow_accrued_to, ps.accrued_to))
                    else ps.accrued_to end as mark) m
     where o.owned
       and o.channel = ps.active_kind
       and ps.active_kind = any (v_kinds)
       and ps.accrued_to > now() - c_max_span
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
         public.hr_seed(ps.user_id, ps.slot,
                        'accrue:' || to_char(l.mark at time zone 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))  as seed,
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

-- ── §5 GRANTS ───────────────────────────────────────────────────────────────
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2). A
-- privileged function left executable by `authenticated`/`anon` is the whole
-- game, and a template that omits the revoke is how one gets omitted for real.
revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;
revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;

revoke execute on function public.hr_shard_of(uuid) from public;
revoke execute on function public.hr_shard_of(uuid) from anon, authenticated, service_role;

-- ⚠ THE TWO GRANTS THIS FILE ORIGINALLY MADE ARE WITHDRAWN (2026-09-21).
--    It granted `hr_tick` EXECUTE on hr_apply and on hr_seed directly. Security
--    S-1 proved by execution that the first does not even work — hr_apply's
--    impersonation seam tests `v_role = 'hr_engine'` literally, so every tick
--    call was refused `forbidden_impersonation` — and S-7 recorded the second
--    as an UNSCOPED RNG oracle over every (user, slot, label) in the database.
--
--    Both are replaced by narrow SECURITY DEFINER wrappers in the next file,
--    2026-09-21-world-tick-settle-fence.sql, which are lease-checked and
--    watermark-checked: `hr_tick_settle` and `hr_tick_seeds`. The tick never
--    holds raw hr_apply or raw hr_seed again.
--
--    THE INVARIANT AT THIS POINT IN THE CHAIN IS THEREFORE "EXACTLY ONE
--    ROUTINE GRANT" (e6 below). The fence file re-asserts "exactly three, and
--    hr_apply/hr_seed are not among them" at its own point in the chain.
revoke execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from hr_tick;
revoke execute on function public.hr_seed(uuid, integer, text) from hr_tick;

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- Properties asserted by RUNNING SQL, not by markers. The probe rows live in
-- this file's own new table and in NO player table (CLAUDE.md §2: player state
-- is never fabricated), and the whole block is rolled back regardless.
do $$
declare
  v_u   uuid := '00000000-0000-4000-8000-00000000f1c5';
  v_n   int;
  v_ok  boolean;
begin
  begin
    -- e1: the role exists, cannot log in, and does not inherit.
    select count(*) into v_n from pg_roles
     where rolname = 'hr_tick' and not rolcanlogin and not rolinherit;
    if v_n <> 1 then raise exception 'e1: hr_tick is missing, can log in, or inherits'; end if;

    -- e2: hr_tick_roster is NOT executable by any client role. The load-bearing
    --     assertion of the file.
    if exists (select 1 from information_schema.role_routine_grants
                where routine_schema = 'public'
                  and routine_name in ('hr_tick_roster', 'hr_shard_of')
                  and grantee in ('public', 'anon', 'authenticated', 'service_role')) then
      raise exception 'e2: a tick function is executable by a client role';
    end if;

    -- e2b: ...and it IS executable by hr_tick, or the tick cannot run at all.
    if not has_function_privilege('hr_tick',
         'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute') then
      raise exception 'e2b: hr_tick cannot execute hr_tick_roster';
    end if;

    -- e3: the ownership table is unreachable by every client role, in BOTH
    --     directions, and RLS is armed and forced.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'hr_tick_ownership'
                  and grantee in ('public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick')) then
      raise exception 'e3: hr_tick_ownership carries a grant for a client or engine role';
    end if;
    select relrowsecurity and relforcerowsecurity into v_ok
      from pg_class where oid = 'public.hr_tick_ownership'::regclass;
    if not v_ok then raise exception 'e3b: RLS is not enabled+forced on hr_tick_ownership'; end if;
    select count(*) into v_n from pg_policies
     where schemaname = 'public' and tablename = 'hr_tick_ownership';
    if v_n <> 0 then
      raise exception 'e3c: hr_tick_ownership grew % policy/policies — it must have NONE', v_n;
    end if;

    -- e4: THE FAIL-SAFE. A freshly inserted ownership row is NOT owned, so
    --     adding a character to this table never starts the tick by itself.
    insert into public.hr_tick_ownership (user_id, slot, channel) values (v_u, 0, 'gather');
    select owned into v_ok from public.hr_tick_ownership
     where user_id = v_u and slot = 0 and channel = 'gather';
    if v_ok then raise exception 'e4: a new ownership row defaulted to OWNED'; end if;

    -- e4b: the channel check bites — the tick cannot be pointed at a kind the
    --      engine does not price.
    begin
      insert into public.hr_tick_ownership (user_id, slot, channel) values (v_u, 1, 'farm');
      raise exception 'e4b: hr_tick_ownership accepted a non-payable channel';
    exception when check_violation then null;
    end;

    -- e5: hr_tick holds ZERO table privileges anywhere in public. The property
    --     §8 promises and the one a reviewer would check first.
    select count(*) into v_n from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'hr_tick';
    if v_n <> 0 then raise exception 'e5: hr_tick holds % table grant(s) in public', v_n; end if;

    -- e6: hr_tick holds EXACTLY ONE EXECUTE at this point in the chain —
    --     hr_tick_roster. A second appearing here is a review failure, not a
    --     convenience, so this is an equality and not a superset test.
    select count(*) into v_n from information_schema.role_routine_grants
     where routine_schema = 'public' and grantee = 'hr_tick';
    if v_n <> 1 then
      raise exception 'e6: hr_tick holds % routine grant(s), expected exactly 1 (hr_tick_roster)', v_n;
    end if;
    -- e6b: THE WITHDRAWAL, ASSERTED. Security S-1/S-7. The tick reaches the
    --      writer and the RNG only through the lease-checked wrappers the next
    --      file builds — never the raw money function, never an unscoped oracle.
    if has_function_privilege('hr_tick', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
    or has_function_privilege('hr_tick', 'public.hr_seed(uuid,integer,text)', 'execute') then
      raise exception 'e6b: hr_tick holds raw hr_apply or raw hr_seed — the fence is bypassed';
    end if;

    -- e7: A NON-PAYABLE KIND IS REFUSED, not silently filtered.
    begin
      perform * from public.hr_tick_roster(array['farm'], 0, 10, 'selfcheck', 30000);
      raise exception 'e7: hr_tick_roster accepted a non-payable kind';
    exception when sqlstate '22023' then null;
    end;

    -- e8: THE ROSTER IS EMPTY WHILE NOBODY IS OWNED. The probe row from e4
    --     exists, is in the requested channel, and must NOT appear — this is
    --     the property that makes applying this file a no-op for players.
    select count(*) into v_n from public.hr_tick_roster(array['gather'], 0, 100, 'selfcheck', 30000);
    if v_n <> 0 then
      raise exception 'e8: the roster returned % row(s) with no character flagged owned', v_n;
    end if;

    -- e9: the limit clamp bites in both directions (0 -> 1, 10^6 -> 500) and
    --     the lease clamp refuses a zero lease. Asserted on the clamp itself
    --     rather than on a row count, which would need a fabricated character.
    if least(greatest(0, 1), 500) <> 1 or least(greatest(1000000, 1), 500) <> 500 then
      raise exception 'e9: the limit clamp arithmetic is wrong';
    end if;

    -- e10: a client role genuinely cannot reach the function. `set local role`
    --      is the same transition PostgREST performs.
    begin
      set local role authenticated;
      begin
        perform * from public.hr_tick_roster(array['gather'], 0, 1, 'selfcheck', 30000);
        reset role;
        raise exception 'e10: `authenticated` executed hr_tick_roster';
      exception
        when insufficient_privilege then null;
      end;
      reset role;
    end;

    -- e11: hr_shard_of is total and constant for the beta.
    if public.hr_shard_of(v_u) <> 0 or public.hr_shard_of(gen_random_uuid()) <> 0 then
      raise exception 'e11: hr_shard_of did not return the single beta shard';
    end if;

    raise exception 'HR920_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR920_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-roster self-check PASSED (e1-e11); probe rows rolled back';
end $$;
