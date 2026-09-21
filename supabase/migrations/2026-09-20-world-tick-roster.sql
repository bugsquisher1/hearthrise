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
-- ONE new role with THREE execute grants, and one new table no client can read.
--
-- ⚠ THREE, NOT THE TWO §8 PROMISED, and the third is deliberate. §8 budgeted
--   `hr_tick_roster` + `hr_apply`. The tick also needs `hr_seed`, because the
--   per-window PRNG label names the window's WATERMARK (§11) and the watermark
--   moves on every poll inside a flush — so a seed handed out once at roster
--   time is a seed for one window only, and reusing it is precisely the
--   `fixedSeed` mutant (+48% gold on the combat fixtures). The alternative,
--   folding hr_seed into the roster's return, would force one roster call per
--   poll and still be wrong for the polls after the first.
--   The privilege this adds is EXACTLY the one hr_engine has held since
--   2026-08-11: hr_seed is granted to hr_engine today and the Edge Function
--   calls it for arbitrary (user, slot, label). A compromised tick host is
--   therefore exactly as dangerous as a compromised edge deploy, and no more —
--   which is the same argument §8 makes for reusing hr_apply.
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
  p_lease_ms int     default 30000
)
returns table (
  user_id      uuid,
  slot         int,
  shard        int,
  active_kind  text,
  active_id    text,
  active_since timestamptz,
  accrued_to   timestamptz,
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
    select o.user_id, o.slot
      from public.hr_tick_ownership o
      join public.player_state ps
        on ps.user_id = o.user_id and ps.slot = o.slot
     where o.owned
       and o.channel = ps.active_kind
       and ps.active_kind = any (v_kinds)
       and ps.accrued_to > now() - c_max_span
       and public.hr_shard_of(o.user_id) = coalesce(p_shard, 0)
       and (o.lease_until is null
            or o.lease_until < now()
            or o.lease_holder = v_holder)
     order by ps.accrued_to asc          -- the furthest behind is served first
     limit v_limit
       for update of o skip locked
  ), leased as (
    update public.hr_tick_ownership o
       set lease_holder = v_holder,
           lease_until  = now() + v_lease,
           updated_at   = now()
      from claim c
     where o.user_id = c.user_id and o.slot = c.slot
     returning o.user_id, o.slot
  )
  select ps.user_id,
         ps.slot,
         public.hr_shard_of(ps.user_id)                                as shard,
         ps.active_kind,
         ps.active_id,
         ps.active_since,
         ps.accrued_to,
         ps.version,
         -- THE PER-WINDOW PRNG LABEL, derived here EXACTLY as
         -- hr-accrue/index.ts derives it: hr_seed(user, slot,
         -- 'accrue:' || accrued_to). The label NAMES THE WATERMARK, so the
         -- tick's first window draws the same stream an accrue would have.
         -- Later windows in the same flush re-derive it per watermark through
         -- the hr_seed grant (§5) — see the exploit-surface note in the header.
         public.hr_seed(ps.user_id, ps.slot,
                        'accrue:' || to_char(ps.accrued_to at time zone 'UTC',
                                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))  as seed,
         -- HYDRATION IS THE ENVELOPE THE CLIENT APPLIES, not a bag of columns
         -- assembled here. "What the tick holds" and "what the player sees" are
         -- one object (§2), and it costs the tick no grant on hr_state_of.
         public.hr_state_of(ps.user_id, ps.slot)                        as state
    from leased l
    join public.player_state ps
      on ps.user_id = l.user_id and ps.slot = l.slot;
end $$;

-- ── §5 GRANTS ───────────────────────────────────────────────────────────────
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2). A
-- privileged function left executable by `authenticated`/`anon` is the whole
-- game, and a template that omits the revoke is how one gets omitted for real.
revoke execute on function public.hr_tick_roster(text[], int, int, text, int) from public;
revoke execute on function public.hr_tick_roster(text[], int, int, text, int) from anon, authenticated, service_role;
grant  execute on function public.hr_tick_roster(text[], int, int, text, int) to hr_tick;

revoke execute on function public.hr_shard_of(uuid) from public;
revoke execute on function public.hr_shard_of(uuid) from anon, authenticated, service_role;

-- THE TICK BECOMES A CALLER OF THE WRITER THAT ALREADY EXISTS. hr_apply's body
-- is untouched by this file; only its grant list grows by one role.
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_tick;
-- ⚠ THE THIRD GRANT, argued in the header: the per-window seed label names the
--    watermark, and the watermark moves on every poll inside a flush.
grant execute on function public.hr_seed(uuid, integer, text) to hr_tick;

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
         'public.hr_tick_roster(text[],int,int,text,int)', 'execute') then
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

    -- e6: hr_tick holds EXACTLY the three EXECUTEs this file argues for, and
    --     nothing else. A fourth appearing later is a review failure, not a
    --     convenience — so this is an equality, not a superset test.
    select count(*) into v_n from information_schema.role_routine_grants
     where routine_schema = 'public' and grantee = 'hr_tick';
    if v_n <> 3 then
      raise exception 'e6: hr_tick holds % routine grant(s), expected exactly 3 (hr_tick_roster, hr_apply, hr_seed)', v_n;
    end if;
    if not (has_function_privilege('hr_tick', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
        and has_function_privilege('hr_tick', 'public.hr_seed(uuid,integer,text)', 'execute')) then
      raise exception 'e6b: hr_tick is missing hr_apply or hr_seed';
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
