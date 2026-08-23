-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-23-game-events-bounds.sql — THE TELEMETRY TABLE GETS A SERVER-SIDE
-- CEILING (open-beta hardening)
--
-- Security Engineer, 2026-08-23. Written against the open-beta threat model:
-- signup is about to be open to the public internet, so "a signed-in account"
-- stops meaning "somebody Tyler invited".
--
-- ── THE FINDING ────────────────────────────────────────────────────────────
-- `public.game_events` is the ONLY table in this database that a client may
-- INSERT into freely. Its policy is the whole of its protection:
--
--     INSERT with check (auth.uid() = user_id)
--
-- and that is a check on WHOSE row it is, not on WHAT is in it or HOW MANY.
-- There is no CHECK constraint on the table, no bound on `payload`, no bound on
-- `event_type`, no rate limit, and `occurred_at` is whatever the client's clock
-- said.
--
-- The containment that exists today is ALL CLIENT-SIDE — `src/net/sync.js`
-- §b319's EVENT_ALLOWLIST (6 types), EVENT_MAX_PER_FLUSH 20, EVENT_MAX_PER_MINUTE
-- 30, EVENT_MAX_PER_HOUR 200. Those are excellent controls and they are the
-- reason this table is small today. They are also, every one of them, code
-- running on the attacker's machine. `curl -H "Authorization: Bearer <my own
-- token>" -d '[{...}]' .../rest/v1/game_events` does not execute any of them.
--
-- BLAST RADIUS — and this is why it is not a self-harm bug. Postgres will take
-- a jsonb value up to 1 GB. The measured b319 incident put 229 MB / 1,601,032
-- rows into this table from SIX HONEST PLAYERS in 3.45 days, i.e. 94% of the
-- entire database, WITHOUT anybody trying. One account trying, on the free
-- tier's 500 MB, fills the disk deliberately in minutes. A full disk is not a
-- degraded telemetry table: it is every player's progression writes failing at
-- once, on the only database that holds them. Self-inflicted cost, everybody's
-- outage. That is a shared surface, and by the standing rule a shared surface
-- does not get to be defended by client code.
--
-- ── THE SHAPE OF THE FIX, AND WHY IT DROPS INSTEAD OF RAISING ──────────────
-- A BEFORE INSERT trigger that returns NULL SKIPS THE ROW and lets the
-- statement succeed. That is deliberate and it is the load-bearing design
-- choice here, so it is written down rather than left to be rediscovered:
--
--   · RAISING would 400 the whole POST. `flush()` in src/net/sync.js only
--     advances its buffer on `res.ok`, so a single refused row would make an
--     honest client re-POST the same batch forever — a client-side hot loop
--     that costs more than the rows it refused. Telemetry must never be able to
--     do that to the save path it shares a connection with.
--   · DROPPING gives the abuser a 200 and no storage, which is the ideal
--     answer: nothing to retry against, nothing written, and the drop is
--     counted where only the operator can see it.
--   · This is TELEMETRY. Nothing in the game reads it, no payout depends on it,
--     and a lost diagnostic row is not a lost player. If this table ever gains
--     a consumer that MATTERS, that consumer needs its own RPC, not a policy.
--
-- ── THE FOUR BOUNDS ────────────────────────────────────────────────────────
-- Every one is sized as a FUSE against the measured honest maximum, not as
-- balance, and every one is at least 2x the client's own ceiling so that an
-- honest client can never trip it:
--
--   | bound            | here          | client's own limit | honest observed |
--   |------------------|---------------|--------------------|-----------------|
--   | payload bytes    | 4,096         | (none)             | ~35 B           |
--   | event_type chars | 64            | 6 allowlisted names| <= 17           |
--   | rows / minute    | 60            | 30                 | peak ~3         |
--   | rows / hour      | 400           | 200                | ~5              |
--
-- ── AND TWO THINGS THE CLIENT NO LONGER AUTHORS ───────────────────────────
--   · `user_id` is pinned to auth.uid(). The policy already required them to
--     match, so this is belt-and-braces — but it is the same braces
--     hr_chat_name_authority put on chat, and for the same reason: the policy
--     is one careless `create policy` away from not being there.
--   · `occurred_at` is CLAMPED to the server's clock. It was a raw client
--     timestamp (`new Date(ev.ts)`, i.e. the device clock), so a forged or
--     merely-wrong clock could file diagnostics in 1970 or in 2099 — which is
--     an attack on the ONE record Tyler reads when a player says "my stats
--     reset". It is CLAMPED and not OVERWRITTEN because the client legitimately
--     buffers events across sessions in localStorage: a genuinely old timestamp
--     inside the window is real information and is kept.
--
-- IDEMPOTENT + ADDITIVE. Safe to re-apply. No data is read, moved or deleted.
--
-- REVERSIBILITY:
--     drop trigger if exists hr_game_events_guard on public.game_events;
--     drop function if exists public.hr_game_events_guard();
--     alter table public.game_events drop constraint if exists game_events_event_type_chk;
--     -- (the revokes are not reverted: nothing needs them back)
--
-- NO `begin;`/`commit;` (repo rule S5 — the applier owns the transaction).
-- §5's behavioural self-check runs inside a subtransaction that ALWAYS aborts.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §0 · PREFLIGHT — fail closed ───────────────────────────────────────────
do $$
begin
  if to_regclass('public.game_events') is null then
    raise exception 'game-events-bounds: public.game_events does not exist';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null then
    raise exception 'game-events-bounds: public.hr_rate_ok is absent — apply 2026-08-11-player-state.sql first. '
                    'Do NOT substitute a hand-rolled counter: hr_rate_ok owns the unlogged single-row-per-key '
                    'window that keeps the brake from growing with traffic.';
  end if;
  -- The journal side. §2 wraps these in an exception handler so a missing one
  -- cannot turn a contained drop into an outage — which is exactly why they are
  -- asserted HERE instead: a silently-swallowed journal is an abuse channel with
  -- no record, and "silence is where exploits live" is the rule this file was
  -- written under.
  if to_regprocedure('public.hr_rate_over(uuid,text)') is null
  or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
  or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'game-events-bounds: the sampled-rejection journal helpers are absent — '
                    'apply 2026-08-11-player-state.sql first';
  end if;
end $$;


-- ── §1 · THE CHEAP BOUND, AS A CONSTRAINT ──────────────────────────────────
-- `event_type` only. `length(text)` is IMMUTABLE, so it is legal in a CHECK;
-- the payload size bound is NOT (it needs a cast through jsonb_out) and
-- therefore lives in the trigger, where it can also be a DROP rather than an
-- error. Two mechanisms, because the constraint system will only take one of
-- them — not because two felt safer.
--
-- NOT VALID: enforced on every future INSERT (which is the entire point) but
-- never rescans the existing rows, so this cannot fail on legacy telemetry from
-- before the allowlist landed. There is nothing to gain from validating history
-- in a table that is about to be wiped.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.game_events'::regclass
                    and conname = 'game_events_event_type_chk') then
    alter table public.game_events
      add constraint game_events_event_type_chk
      check (event_type is not null and length(event_type) between 1 and 64)
      not valid;
  end if;
end $$;


-- ── §2 · THE GUARD ─────────────────────────────────────────────────────────
create or replace function public.hr_game_events_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  c_max_payload  constant int := 4096;    -- bytes of jsonb text; honest rows are ~35
  c_per_minute   constant int := 60;      -- 2x the client's own EVENT_MAX_PER_MINUTE
  c_per_hour     constant int := 400;     -- 2x the client's own EVENT_MAX_PER_HOUR
  c_backfill     constant interval := interval '7 days';
  v_uid    uuid := auth.uid();
  v_reason text;
  v_weight bigint;
begin
  -- No JWT means service role / the management API / a migration: operator
  -- work, not a client. Operators are trusted with this table by definition —
  -- they can already write it directly — and metering them would break the
  -- import path. Same rule bug_reports_insert_guard uses.
  if v_uid is null then
    return new;
  end if;

  -- (a) IDENTITY IS THE SERVER'S. The policy already demands the match; this
  --     makes the row correct even if the policy is ever loosened.
  new.user_id := v_uid;

  -- (b) TIME IS THE SERVER'S — clamped, not overwritten. See the header.
  if new.occurred_at is null
     or new.occurred_at > now()
     or new.occurred_at < now() - c_backfill then
    new.occurred_at := now();
  end if;

  -- (c) SIZE. Checked on the jsonb TEXT, which is what actually gets stored and
  --     what an attacker actually controls. `octet_length` and not `length`:
  --     a multi-byte payload is bigger on disk than it is in characters, and
  --     disk is the resource being defended.
  if new.payload is not null
     and octet_length(new.payload::text) > c_max_payload then
    v_reason := 'payload_too_large';
  end if;

  -- (d) RATE. Minute first, then hour: the minute bucket is the one a burst
  --     trips, so spending the hour token on a call the minute already refused
  --     would let a burst eat the hourly budget it never got to use.
  if v_reason is null
     and not public.hr_rate_ok(v_uid, 'game_events:min', c_per_minute, interval '1 minute') then
    v_reason := 'rate_minute';
  end if;
  if v_reason is null
     and not public.hr_rate_ok(v_uid, 'game_events:hour', c_per_hour, interval '1 hour') then
    v_reason := 'rate_hour';
  end if;

  if v_reason is null then
    return new;
  end if;

  -- SAMPLED, never unconditional. An unconditional journal write on the
  -- refused path is the server doing more durable work the harder it is
  -- hammered, serialised on one tuple — the exact anti-pattern player-state.sql
  -- §6c-ii exists to prevent, and doubly wrong here where the whole finding is
  -- "somebody can make this database write too much".
  begin
    v_weight := public.hr_rate_sample_weight(
                  public.hr_rate_over(v_uid, 'game_events:min'));
    if v_weight > 0 then
      perform public.hr_record_rejection(v_uid, 0, 'game_events', v_reason,
        jsonb_build_object('gate', 'game_events', 'bytes',
                           case when new.payload is null then 0
                                else octet_length(new.payload::text) end,
                           'type', left(coalesce(new.event_type, ''), 64)),
        v_weight);
    end if;
  exception when others then
    null;   -- bookkeeping never turns a contained drop into an outage
  end;

  -- THE DROP. Returning NULL from a BEFORE INSERT row trigger skips this row
  -- and leaves the statement successful. See the header for why this is not a
  -- raise.
  return null;
end $$;

revoke execute on function public.hr_game_events_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists hr_game_events_guard on public.game_events;
create trigger hr_game_events_guard
  before insert on public.game_events
  for each row execute function public.hr_game_events_guard();


-- ── §3 · THE DUPLICATE POLICY ──────────────────────────────────────────────
-- Two identical permissive INSERT policies ('events owner write' and 'own
-- events insert') were live, with the same `auth.uid() = user_id` check.
-- Permissive policies OR together so the behaviour is identical — but two
-- copies of one rule is how a later reviewer "tightens" one and believes the
-- surface is closed while the other still permits it. One rule, one policy.
drop policy if exists "events owner write" on public.game_events;


-- ── §4 · GRANT NARROWING ───────────────────────────────────────────────────
-- INSERT for `authenticated` is the entire legitimate client need. Everything
-- else is a table privilege with no policy behind it, i.e. a grant that does
-- nothing today and becomes live the moment somebody writes `for all`.
revoke select, update, delete, truncate, references, trigger
  on table public.game_events from anon, authenticated;
revoke insert on table public.game_events from anon;
grant  insert on table public.game_events to authenticated;


-- ── §5 · SELF-CHECK — behavioural, executed here, then rolled back ─────────
-- Forges a JWT claim so auth.uid() is non-null: without it every probe takes
-- the operator path at §2(a) and the guard would not be under test at all —
-- the always-null-probe shape this repo has shipped six of.
--
-- BOTH GUC SPELLINGS ARE SET, deliberately. Production's auth.uid() reads
-- `request.jwt.claims` (a JSON object) and the PGlite replay fixture's shim
-- (tests/sql/pglite-fixture.sql) reads `request.jwt.claim.sub` (a bare string).
-- Setting one made this file pass on production and fail the repo's own
-- disaster-recovery replay — a self-check that only runs on one of the two
-- databases is worse than none, because it is where the confidence comes from.
--
-- The identity is a REAL auth.users row: game_events.user_id is an FK to
-- auth.users, so a made-up uuid would fail the FK and the probe would grade the
-- constraint instead of the guard.
do $$
declare
  c_uid  uuid;
  v_n0 bigint; v_n1 bigint;
  v_row public.game_events%rowtype;
  v_kept int;
  i int;
begin
  select count(*) into v_n0 from public.game_events;

  begin
    select u.id into c_uid from auth.users u order by u.id limit 1;
    if c_uid is null then
      -- Empty auth.users (a fresh replay). Stand one up; the subtransaction
      -- always aborts, so it never exists outside this block.
      c_uid := '00000000-0000-4000-8000-0000feed0001';
      insert into auth.users (id) values (c_uid);
    end if;
    perform set_config('request.jwt.claim.sub', c_uid::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from c_uid then
      raise exception 'SELF-CHECK 0 FAILED: could not forge auth.uid() (%) — every probe below would '
                      'take the operator path and prove nothing', auth.uid();
    end if;
    -- The probes count rows for c_uid, so any pre-existing telemetry from that
    -- identity would be counted as landed. Clear it inside the doomed
    -- subtransaction; §6 proves the whole block was net-zero anyway.
    delete from public.game_events where user_id = c_uid;

    -- (1) AN HONEST ROW IS KEPT, AND ITS user_id IS PINNED.
    --     The user_id sent is deliberately NOT c_uid: the trigger must overwrite
    --     it. (BEFORE-row triggers run before the FK check, so the FK sees the
    --     pinned value, which is itself part of the property.)
    insert into public.game_events (user_id, event_type, payload, occurred_at)
      values ('00000000-0000-4000-8000-00000000dead', 'boot_probe',
              '{"build":461,"hydrated":true}'::jsonb, now())
      returning * into v_row;
    if v_row.id is null then
      raise exception 'SELF-CHECK 1 FAILED: an honest telemetry row was DROPPED — the guard is refusing real traffic';
    end if;
    if v_row.user_id is distinct from c_uid then
      raise exception 'SELF-CHECK 1 FAILED: user_id is % — it must be pinned to auth.uid() (%)', v_row.user_id, c_uid;
    end if;

    -- (2) A CLIENT CLOCK OUTSIDE THE WINDOW IS CLAMPED, INSIDE IT IS KEPT.
    insert into public.game_events (user_id, event_type, payload, occurred_at)
      values (c_uid, 'boot_probe', '{}'::jsonb, timestamptz '2099-01-01')
      returning * into v_row;
    if v_row.occurred_at > now() then
      raise exception 'SELF-CHECK 2 FAILED: a future client timestamp survived as %', v_row.occurred_at;
    end if;
    insert into public.game_events (user_id, event_type, payload, occurred_at)
      values (c_uid, 'boot_probe', '{}'::jsonb, timestamptz '1970-01-01')
      returning * into v_row;
    if v_row.occurred_at < now() - interval '7 days' then
      raise exception 'SELF-CHECK 2 FAILED: a 1970 client timestamp survived as %', v_row.occurred_at;
    end if;
    -- …and the CONTROL, without which check 2 passes on a guard that simply
    -- overwrites every timestamp and throws away real buffered-event history.
    insert into public.game_events (user_id, event_type, payload, occurred_at)
      values (c_uid, 'boot_probe', '{}'::jsonb, now() - interval '2 days')
      returning * into v_row;
    if v_row.occurred_at > now() - interval '1 day' then
      raise exception 'SELF-CHECK 2 FAILED (CONTROL): a LEGITIMATE 2-day-old buffered event was clamped to % — '
                      'the clamp is an overwrite and cross-session telemetry loses its real time', v_row.occurred_at;
    end if;

    -- (3) THE SIZE BOMB IS DROPPED, AND THE STATEMENT STILL SUCCEEDS.
    select count(*) into v_kept from public.game_events where user_id = c_uid;
    insert into public.game_events (user_id, event_type, payload)
      values (c_uid, 'boot_probe',
              jsonb_build_object('x', repeat('A', 20000)));
    if (select count(*) from public.game_events where user_id = c_uid) <> v_kept then
      raise exception 'SELF-CHECK 3 FAILED: a 20 KB payload was STORED — the disk-fill vector is open';
    end if;

    -- (4) THE OVER-LENGTH event_type IS REFUSED BY THE CONSTRAINT.
    begin
      insert into public.game_events (user_id, event_type, payload)
        values (c_uid, repeat('t', 65), '{}'::jsonb);
      raise exception 'SELF-CHECK 4 FAILED: a 65-character event_type was accepted';
    exception
      when check_violation then null;    -- correct
    end;

    -- (5) THE RATE BRAKE. Drive past the minute ceiling and require that the
    --     surplus stops landing — and that the statements still SUCCEED,
    --     because a raise here is the client-retry hot loop the header names.
    for i in 1..90 loop
      insert into public.game_events (user_id, event_type, payload)
        values (c_uid, 'boot_probe', '{}'::jsonb);
    end loop;
    select count(*) into v_kept from public.game_events where user_id = c_uid;
    if v_kept > 70 then
      raise exception 'SELF-CHECK 5 FAILED: % rows landed from ~94 inserts against a 60/min ceiling — '
                      'the brake is not braking', v_kept;
    end if;
    if v_kept < 40 then
      raise exception 'SELF-CHECK 5 FAILED (CONTROL): only % rows landed — the guard is dropping honest '
                      'traffic, which is a silent telemetry outage rather than a limit', v_kept;
    end if;

    raise exception using errcode = 'HRG99', message = 'self-check probe rollback';
  exception
    when sqlstate 'HRG99' then
      raise notice 'game-events-bounds self-check 1-5 OK — honest row kept + user pinned, clock clamped '
                   '(with an in-window control), size bomb dropped, long type refused, rate brake holds '
                   'without raising';
  end;

  select count(*) into v_n1 from public.game_events;
  if v_n1 <> v_n0 then
    raise exception 'SELF-CHECK 6 FAILED: probe residue survived — game_events %->%', v_n0, v_n1;
  end if;
  raise notice 'game-events-bounds self-check 6 OK — game_events % rows: exactly as found', v_n1;
end $$;


-- ── §6 · STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_bad text;
begin
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'game_events' and t.tgname = 'hr_game_events_guard'
                    and not t.tgisinternal) then
    raise exception 'game-events-bounds: the guard trigger is not attached';
  end if;

  -- INSERT for authenticated, and nothing else, for anybody.
  select string_agg(g || ':' || p, ', ') into v_bad
    from unnest(array['anon','authenticated','public']) g
    cross join unnest(array['select','insert','update','delete','truncate']) p
   where has_table_privilege(g, 'public.game_events', p)
     and not (g = 'authenticated' and p = 'insert');
  if v_bad is not null then
    raise exception 'game-events-bounds: game_events carries a client grant with no policy behind it: % — '
                    'revoke before grant', v_bad;
  end if;
  if not has_table_privilege('authenticated', 'public.game_events', 'insert') then
    raise exception 'game-events-bounds: authenticated lost INSERT — telemetry is dead';
  end if;

  -- Exactly one INSERT policy, and no write policy of any other kind.
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'game_events' and cmd = 'INSERT') <> 1 then
    raise exception 'game-events-bounds: game_events does not have exactly ONE INSERT policy';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'game_events'
                and cmd in ('ALL','UPDATE','DELETE')) then
    raise exception 'game-events-bounds: game_events grew an ALL/UPDATE/DELETE policy — telemetry is '
                    'append-only by construction and post-hoc mutation of your own rows is a finding, not a feature';
  end if;

  raise notice 'game-events-bounds: APPLIED. payload <= 4096 B, event_type <= 64, 60/min + 400/h per user, '
               'server-clamped clock, over-bound rows DROPPED (statement still succeeds).';
end $$;
