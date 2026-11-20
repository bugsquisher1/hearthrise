-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1004-tick-pack-heroes.sql — THE WORLD TICK PACKS ITS HUNT BODIES BY HEROES, AND A DEFERRED SELECTOR GIVES
--   ITS LEASE BACK (lane/c-server-cost, backend-architect, 2026-11-19; the 11-19 server audit, row 6).
--
-- STATUS: supabase/migration-notes/1004-tick-pack-heroes.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §5 self-check.
--
-- ── THE BOTTLENECK (measured, tools/qa/audit-2026-11-19-server/scale-probe.result.json) ──────────────────────────────
-- A fire leased at most hunt_body_max (4) INSTANCES a body and hunt_bodies_max (32) bodies: 128 instances a fire, whatever
--   their size. 1,400 due lone hunts took 11 fires (110 s), over the 100 s window, while a body of 4 lone hunts used 33-65 ms of
--   its 800 ms engine budget. The engine's cost is the HEROES a body settles (a four-hero party ~4x a lone hunt), so the body is
--   now cut by heroes: lone hunts ride 16 a body, a body of four-hero parties still carries 4.
-- And a body whose engine budget ran out DEFERS its tail (tick.js cpu_budget: nothing ran, nothing landed), but those sessions
--   stayed leased to it until the lease ended (30 s, three fires).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_tick_config.hunt_body_heroes int NOT NULL DEFAULT 16, CHECK 1..64   NEW dial: the HEROES (due sessions) one hunt body carries.
-- hr_tick_config.hunt_body_max: 4 -> 16 (its CHECK, 1..50, unchanged): the INSTANCES one body carries, now the second cap.
-- hr_hunt_roster_sharded(p_prefix, p_body_max, p_lease_ms)   RESTATED WHOLE, signature and grants unchanged:
--   (pick) the instances a fire takes, most behind first, while their count <= p_body_max x hunt_bodies_max AND their heroes
--          <= hunt_body_heroes x hunt_bodies_max;
--   (pack) in md5(instance) order a body closes at p_body_max instances or hunt_body_heroes heroes, whichever comes first (the
--          later of the two running body numbers); an instance is never split (a party at the edge of a body rides whole, so a
--          body may carry up to party size - 1 heroes past the dial; the edge's engine budget defers any tail);
--   every other line (the due predicate, the lease and its reclaim, the in-body order most behind first) is byte for byte.
-- hr_hunt_lease_free(p_body int, p_sessions uuid[]) -> int   NEW, hr_engine only (link 24 of HR_GRANT_HYGIENE_CHAIN): ends
--   (lease_until a millisecond before now()) the still-live leases of the sessions named (at most 500) held by hunt body p_body's holder, derived
--   here exactly as hr_tick_cron_run names it. tick.js calls it once a body with the selectors it DEFERRED; the next fire
--   offers them again. Answers how many it freed.
-- REFUSAL CODES: none (42501 for a client or request role).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The roster's locks and lease writes are as before (for update skip locked; one upsert a session). A lease freed while another
--   body could still be settling it is impossible from the honest edge (only selectors whose settle never STARTED are named);
--   from anyone else it costs a race hr_hunt_apply_instance's world-swing and version CAS refuses (session_moved), never a
--   second credit. A second apply restates the same body and function, the column and CHECK are `if not exists`, the dials are
--   set to the same values: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- One engine function that only shortens leases (above). No client surface; no value moves.
--
-- ── COST (at 100x players) ───────────────────────────────────────────────────
-- The roster: one more window over the due instances (group by, two running sums). A fire posts up to 16 x 32 = 512 lone hunts
--   (was 128): the fan-out's ceiling is 512 due heroes a fire, 4x for lone hunts, unchanged for parties of four. Each body
--   carries up to 16 instances: 16 reads and 16 commits a body (was 4), inside pg_net's 9 s.
--
-- EDGE: tick.js (parseTickBody reads `hunt_body`, runTick frees its deferred leases). Either order is safe: an edge before this
--   file calls a function that is not there (42883 reads as none: the lease waits out as before); this file before the edge only
--   packs differently.
-- GUARDS: tests/hunt-tick-shards.mjs (PACK-HEROES, FANOUT, RECLAIM: a deferred hunt is re-offered at the next fire), this §5.
-- REVERSIBLE: re-apply hr_hunt_roster_sharded from 2027-02-04-tick-span.sql (§0 pins its image), `update hr_tick_config set
--   hunt_body_max = 4`, drop hr_hunt_lease_free and the column; re-apply link 23's detector (2027-03-13-gm-tools.sql).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hunt_tick_lease') is null or to_regclass('public.hr_tick_config') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'hunt_bodies_max') then
    raise exception 'PRECONDITION: the tick config, its fan-out dial or the hunt lease is missing'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_roster_sharded(text,integer,integer)');
  if v_md5 is distinct from 'ec0cd7aa30f0b00e678504775894c3bc' and v_md5 is distinct from 'b8b1612f063bc6db4cb0a9f8afdc1e3f' then
    raise exception 'PIN: hr_hunt_roster_sharded is neither the image this file was written against nor its own: md5 % - re-pin', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_assert_grant_hygiene(boolean)');
  if v_md5 is distinct from '4ffb3c26bfd949e3278bde811c6cb656' and v_md5 is distinct from 'e941ed280b7c9e6fbd4fd20f87b4ee11' then
    raise exception 'PIN: hr_assert_grant_hygiene is neither link 23''s body nor this file''s own: md5 % - re-derive (tools/derive-grant-hygiene.mjs)', v_md5; end if;
end $mig$;

-- ── §1 THE DIALS ─────────────────────────────────────────────────────────────
alter table public.hr_tick_config add column if not exists hunt_body_heroes int not null default 16;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_hunt_body_heroes_ck') then
    alter table public.hr_tick_config add constraint hr_tick_config_hunt_body_heroes_ck check (hunt_body_heroes between 1 and 64); end if;
end $mig$;
comment on column public.hr_tick_config.hunt_body_heroes is
  'added 1004-tick-pack-heroes.sql: the HEROES (due sessions) one world-tick hunt body carries; a body closes at this or hunt_body_max instances, whichever comes first (hr_hunt_roster_sharded).';
update public.hr_tick_config set hunt_body_max = 16, hunt_body_heroes = 16 where id;

-- ── §2 THE PACKER (RESTATED WHOLE) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_roster_sharded(p_prefix text, p_body_max integer, p_lease_ms integer DEFAULT 30000)
 RETURNS TABLE(user_id uuid, slot integer, session_id uuid, body integer, ord integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  -- THE FAN-OUT CEILING: hunt bodies a fire — hr_tick_config.hunt_bodies_max (2027-02-03-tick-capacity.sql; was the
  -- literal 16), clamped 1..64 (pg_net batch 200; the 58 + ':h' + two digits holder name).
  c_bodies  int;
  -- TICK-PACK (1004-tick-pack-heroes.sql): the HEROES one body carries, hr_tick_config.hunt_body_heroes, clamped 1..64.
  c_heroes  int;
  v_role    text;
  v_per     int;
  v_lease   interval;
  v_prefix  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_hunt_roster_sharded: not callable by %', v_role using errcode = '42501';
  end if;
  v_per    := least(greatest(coalesce(p_body_max, 12), 1), 50);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  -- 58 + ':h' + two digits <= 62: a body's holder always fits, never truncates into another's.
  v_prefix := left(coalesce(nullif(p_prefix, ''), 'unnamed'), 58);
  select make_interval(secs => c.flush_seconds), c.fold_windows, c.hunt_bodies_max, c.hunt_body_heroes
    into v_flush, v_fold, c_bodies, c_heroes
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  c_bodies := least(greatest(coalesce(c_bodies, 16), 1), 64);
  c_heroes := least(greatest(coalesce(c_heroes, 16), 1), 64);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due0 as (
    -- hr_hunt_roster's due predicate, byte for byte, except the lease: a live
    -- lease is never re-claimed (§0 of the header, concurrency (b)) — unless it is SPENT
    -- (2027-02-04-tick-span.sql): the session's clock moved past the one it was leased at, so the
    -- settle it was leased for has LANDED and the next slice of a behind hunt is this fire's.
    select h.id, h.instance_id as inst, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now()
            or (l.settled_to is not null and h.settled_to > l.settled_to))
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 -- SERVER-PERF (2027-01-01-server-perf.sql): WATCHED = OPEN IN A CLIENT, the stamp the rebuilt
                 -- client writes (character_presence; hr_frame_wanted's 75 s window, never the future).
                 case when exists (select 1 from public.character_presence cp
                                    where cp.user_id = h.user_id and cp.slot = h.slot
                                      and cp.seen_at >  now() - interval '75 seconds'
                                      and cp.seen_at <= now() + interval '60 seconds')
                      then 1 else v_fold end))
  ), inst as (
    -- TICK-PACK: each due instance, its due heroes, numbered most behind first with the heroes up to and including it.
    select d.inst, count(*)::int as n,
           (row_number() over (order by min(d.settled_to), d.inst))::int as k,
           (sum(count(*)) over (order by min(d.settled_to), d.inst))::int as cum
      from due0 d
     group by d.inst
  ), pick as (
    -- THE INSTANCES THIS FIRE TAKES: the most behind first, as many as the fan-out's bodies hold (TICK-PACK: in instances
    -- AND in heroes; an instance is taken whole or waits for the next fire).
    select i.inst
      from inst i
     where i.k <= v_per * c_bodies
       and i.cum <= c_heroes * c_bodies
  ), due as (
    -- Locked; re-checked open and not ahead under the lock (READ COMMITTED
    -- re-evaluates these on a row another transaction moved).
    select h.id, h.instance_id as inst, h.user_id as uid, h.slot as sl, h.settled_to as st
      from public.hunt_sessions h
     where h.id in (select d.id from due0 d join pick p on p.inst = d.inst)
       and h.ended_at is null
       and h.settled_to <= now()
     for update skip locked
  ), sized as (
    -- TICK-PACK: the packing order (md5 of the instance, a pure function of the due set), each instance's heroes and the
    -- heroes before it.
    select d.inst, count(*)::int as n,
           (dense_rank() over (order by md5(d.inst::text), d.inst))::int as r,
           (sum(count(*)) over (order by md5(d.inst::text), d.inst))::int - count(*)::int as before
      from due d
     group by d.inst
  ), packed as (
    -- THE PACKING: a pure function of the due set. Every member of an instance
    -- shares the instance's body: TICK-PACK, the later of its body by instances (v_per a body) and by heroes (c_heroes a
    -- body), so a body closes at whichever comes first. `inst_from`: the instance's clock, the
    -- body's order (most behind first: the edge's engine budget defers the tail, never
    -- the same instance every fire).
    select d.id, d.inst, d.uid, d.sl, d.st,
           min(d.st) over (partition by d.inst) as inst_from,
           greatest((z.r - 1) / v_per, z.before / c_heroes) as b
      from due d join sized z on z.inst = d.inst
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until, settled_to)
    select p.id, v_prefix || ':h' || p.b, now() + v_lease, p.st from packed p
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until,
                                           settled_to = excluded.settled_to
    returning t.session_id
  )
  select p.uid, p.sl, p.id, p.b,
         (row_number() over (order by p.b, p.inst_from, md5(p.inst::text), p.inst, p.id))::int
    from packed p join leased x on x.session_id = p.id
   order by 5;
end $function$;

-- ── §3 THE DEFERRED LEASE GOES BACK ──────────────────────────────────────────
create or replace function public.hr_hunt_lease_free(p_body int, p_sessions uuid[])
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- TICK-PACK (1004-tick-pack-heroes.sql): hunt body p_body's DEFERRED selectors (tick.js: its engine budget or its time budget
-- was spent before their settle STARTED, so nothing ran and nothing landed) end their leases now, so the next fire offers them
-- again instead of when the lease runs out. Only the leases of the sessions named (at most 500) that are still live and held by
-- p_body's holder, named here exactly as hr_tick_cron_run names it (its prefix, ':h', the body). Moves no value.
declare v_role text; v_n int;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_hunt_lease_free: not callable by %', v_role using errcode = '42501';
  end if;
  if p_body is null or p_body < 0 or p_body > 63 or p_sessions is null or cardinality(p_sessions) = 0 or cardinality(p_sessions) > 500 then
    return 0; end if;
  update public.hunt_tick_lease l set lease_until = now() - interval '1 millisecond'   -- ended: the roster's `lease_until < now()`, at once
   where l.holder = left('cron:' || coalesce(current_database(), 'db'), 58) || ':h' || p_body
     and l.session_id = any (p_sessions)
     and l.lease_until > now();
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke execute on function public.hr_hunt_lease_free(int, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_lease_free(int, uuid[]) to hr_engine;

-- ── §4 THE DETECTOR: link 24 of HR_GRANT_HYGIENE_CHAIN, DERIVED ──────────────
-- tools/derive-grant-hygiene.mjs extracts 2027-03-13-gm-tools.sql's detector (link 23) and makes TWO INSERTIONS (declared-removals
-- list EMPTY): hr_hunt_lease_free at the head of c_engine_allow (without it the nightly detector reads it as
-- engine_execute_outside_allowlist), and check (4) ARM 3, the live client write set (1003-dead-client-writes.sql closed the last
-- three dead client-writable tables; arm 3 makes a regrant fatal whatever its policies say: §5 r1). ONE staged file restates the
-- detector, so the staged tail re-applies in order (tests/schema-drift.mjs's second apply).
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

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
    -- ── ADDED 2026-11-19 — THE DEFERRED LEASE (lane/c-server-cost) ────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- SELF-VALIDATING, and it moves no value: it only ENDS leases (lease_until just
    -- before now()) of the hunt body whose holder it derives server-side from p_body, of
    -- the sessions named (at most 500), still live. A lease only keeps a second body
    -- off an instance while one may be settling it; hr_hunt_apply_instance's swing
    -- and version CAS decide whether any settle lands, so a lease freed too early
    -- (even by a compromised engine) costs a refused race, never a double credit.
    'hr_hunt_lease_free(integer,uuid[])',
    -- ── ADDED 2027-03-05 — THE GAME MASTER'S STOP (lane/c-gm-tools) ───────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- SELF-VALIDATING: p_gm is the engine's VERIFIED subject, and both refuse unless
    -- it holds a row of hr_gm_accounts, which only a migration writes. The gate ends a
    -- hunt by the statement hr_hunt_leave runs and journals; it moves no value. The
    -- result journals one row. A town job's stop is then the player's own
    -- runSetActivity on that hero: collect, then switch.
    'hr_gm_stop_gate(uuid,uuid,integer,text,uuid)',
    'hr_gm_stop_result(uuid,uuid,integer,text)',
    -- ── ADDED 2027-02-10 — THE ACCRUE READ (lane/c-settle-cost-2) ─────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- READ-ONLY: index.ts's accrue read for the VERIFIED subject's own hero (the
    -- slot is a row the caller owns). With no open hunt it is hr_state_of, the
    -- envelope the engine already reads; with one, seven of that envelope's own
    -- scalars (the pointer, the version, the clock, the rested bank). It writes
    -- nothing, takes no value, names no other player.
    'hr_accrue_read(uuid,integer)',
    -- ── ADDED 2027-01-12 — THE ACCOUNT MARKET (lane c-market-account) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. The v2 entries below keep their
    -- stale TEXT (their functions are dropped). Each claim re-derived:
    --
    -- SELF-VALIDATING, the v2 claim on the account: the caller names a slot, a
    -- key, a version, a source (bag|storage), an item, a count and an ASK about
    -- its OWN goods. Listable comes from the generated catalogues (hr_market_items),
    -- the floor is the shop's bid, the ceiling the config's; the fee, the TTL and
    -- every cap are server config; the per-account caps are read under the
    -- account's Storage lock. Moves the account's own goods into escrow and burns
    -- a fee through hr_purse_move. Target (p_user, p_slot), the hr_apply pair.
    'hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)',
    -- SELF-VALIDATING: a listing id of the caller's OWN account (refused
    -- not_yours otherwise); the delete is the arbiter and the units return to the
    -- account's Storage. No price, no count, no target beyond (p_user, p_slot).
    'hr_market_cancel(uuid,integer,uuid,uuid)',
    -- SELF-VALIDATING, the one cross-account transfer: a listing id, a count, a
    -- MAX price and a destination. The price comes off the LOCKED row; the same
    -- account (any hero) is refused; both purses lock in user order, LAST; the
    -- buyer's spend and the seller's proceeds are capped per ACCOUNT per day under
    -- those locks; conserved (buyer -gross, seller +net, cut burned), journalled
    -- with no counterparty in any client-readable row (market_sales holds both).
    -- A compromised engine names both sides only inside those caps.
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)',
    -- read-only in value (it spends a rate counter): per-item summaries of open
    -- asks and sales, no account id or name; <= 50 items a call; switch-gated.
    'hr_market_browse(uuid,integer,text[],text,integer)',
    -- read-only in value: one item's cheapest 50 asks (listing ids only; "mine"
    -- marks the caller's own account), its daily line and its last 10 sales.
    'hr_market_item(uuid,integer,text)',
    -- read-only in value: the caller's OWN account's listings, 30-day market
    -- history from its own ledger rows and today's cap usage.
    'hr_market_mine(uuid,integer)',
    -- ── ADDED 2026-10-25 — THE CHARACTER SHEET (lane character-window) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the md5 of the character's skill levels, worn set,
    -- combat style, active buffs and hr_perks_of — values hr_state_of and
    -- hr_perks_of already answer the engine. Target (p_user, p_slot), the
    -- hr_state_of pair.
    'hr_character_sheet_inputs(uuid,integer)',
    -- SELF-VALIDATING: writes ONE display row (hr_character_sheets) for the
    -- (p_user, p_slot) the engine already reads, only when the fingerprint it
    -- is handed equals the current one, stamped with the calling engine's
    -- payload hash, bounded (an object, <= 2 KB). No fight,
    -- price, gate or other player reads the row; it moves no value. Answers
    -- hr_state_of, which the engine already holds.
    'hr_character_sheet_put(uuid,integer,text,text,jsonb)',
    -- ── ADDED 2026-10-23 — THE INSTANCE SETTLE (lane S1, HUNT_SCREEN_SPEC §1.3) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the instance the caller's OPEN session hunts in — its
    -- clock, world, the keyed-seed secret hr_seed(null, 0, 'hunt:' || instance)
    -- — and every OPEN member's session and hr_state_of. Its target argument is
    -- (p_user, p_slot), the hr_state_of pair; the members it adds are characters
    -- the engine already reads and settles (it holds hr_state_of / hr_apply).
    'hr_hunt_instance_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: under the instance lock and its
    -- world_swing CAS, with the member set held to the instance's open sessions,
    -- it CALLS hr_apply (every invariant of each member's value half, under that
    -- member's character lock) and the session applier (swing CAS, window, bag,
    -- per-lane use caps, falls journalled, every end re-proved), plus the kill
    -- bound, the value bound, the store's catalogue prices, the stamina bound
    -- and the world's shape and byte bound — in ONE subtransaction; a refusal
    -- anywhere rolls every member back. It pays nothing hr_apply would refuse.
    'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
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
    -- ARM 3 (1003-dead-client-writes.sql, 2026-11-19) — THE LIVE CLIENT WRITE SET. Any
    --       INSERT/UPDATE/DELETE an anon or authenticated client holds on a table, WHATEVER ITS
    --       POLICIES SAY, unless it is one of the live pairs below or recorded in
    --       hr_client_write_baseline. Arm 2 exempts a table with any write policy, and the
    --       closed-mode RESTRICTIVE "for all" policy counted as one, so a regrant on game_events,
    --       session_claims or clan_members (or a re-applied old file carrying its permissive
    --       policy) was invisible to it. The live set is a CLAIM: a client writes the table
    --       directly, under a policy written for that, and no RPC could do it instead.
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and has_table_privilege(gg, c.oid, pv)
       and (c.relname || ':' || gg || ':' || pv) <> all (array[
             -- the bug report form: one row a press, its own policy ("bugs anyone submits")
             'bug_reports:authenticated:INSERT'])
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
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── §5 SELF-CHECK — EXECUTED AND ROLLED BACK (CLAUDE.md §4) ─────────────────
--   k0  the dial defaults to 16, its CHECK refuses 0 and 65; the chain's dials are 16 instances, 16 heroes, 32 bodies
--   p1  ★ BY HEROES: 20 due lone hunts and two due four-hero parties at 16 / 16: every due session exactly once, a party's
--       members in ONE body, no body over 16 instances or 16 + 3 heroes, each session in the body the formula gives and leased to
--       its holder; at 4 heroes a body 7 bodies, none over 4 + 3 heroes, each party whole
--   p2  ★ THE FAN-OUT IN HEROES: one body a fire of 6 heroes takes the most behind instances whose heroes fit, whole, and leases
--       no other
--   p3  ★ THE DEFERRED LEASE: freeing body k's sessions re-offers exactly them at the next call; a free naming another body's
--       sessions, or a body that holds none of them, frees nothing
--   kg  no request or engine role packs; hr_engine (only) frees; hygiene STRICT
--   r1  ★ ARM 3 (1003-dead-client-writes.sql's tables): each regrant shape is NAMED and fatal (rolled back): a bare INSERT on
--       game_events (arm 2's blind spot: the restrictive closed-mode policy), the old session_claims file re-applied (grant +
--       permissive policy), a DELETE on clan_members, an anon UPDATE on a fresh probe table; the live pair (bug_reports INSERT)
--       is not named
--   kr  the config is restored
do $mig$
declare
  v_t      text;
  v_named  text;
  v_cfg    public.hr_tick_config%rowtype;
  v_hcfg   boolean;
  v_pfx    text := left('cron:' || coalesce(current_database(), 'db'), 58);
  v_users  uuid[] := '{}';
  v_party  uuid[] := array['00000000-0000-4000-8000-0000001e4a01'::uuid, '00000000-0000-4000-8000-0000001e4a02'::uuid];
  v_n      int;
  v_bad    int;
  v_a      jsonb;
  v_b      jsonb;
  v_ids    uuid[];
  i        int;
begin
  begin
    -- ── k0
    if (select column_default from information_schema.columns where table_schema = 'public'
          and table_name = 'hr_tick_config' and column_name = 'hunt_body_heroes') is distinct from '16' then
      raise exception 'k0: hunt_body_heroes does not default to 16'; end if;
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    if v_cfg.hunt_body_max <> 16 or v_cfg.hunt_body_heroes <> 16 or v_cfg.hunt_bodies_max <> 32 then
      raise exception 'k0: the dials are % instances, % heroes, % bodies (want 16 / 16 / 32)', v_cfg.hunt_body_max, v_cfg.hunt_body_heroes, v_cfg.hunt_bodies_max; end if;
    begin
      update public.hr_tick_config set hunt_body_heroes = 0 where id;
      raise exception 'k0: hunt_body_heroes = 0 was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set hunt_body_heroes = 65 where id;
      raise exception 'k0: hunt_body_heroes = 65 was accepted';
    exception when check_violation then null;
    end;

    -- ── fixture: 28 characters, nobody watching; 20 lone hunts and two four-hero party instances, all settled 20 minutes ago
    --    (the lone hunts one second apart, the parties the most behind): every one is due.
    select c.enabled into v_hcfg from public.hr_hunt_config c where c.id;
    update public.hr_hunt_config set enabled = true where id;
    update public.hr_tick_config set flush_seconds = 90, fold_windows = 1 where id;
    -- No other open session may be due during the check (a live database has hunters): lease every one of them to a name the
    -- check never uses, inside this rolled-back block.
    insert into public.hunt_tick_lease (session_id, holder, lease_until)
    select h.id, 'selfcheck:other', now() + interval '1 hour' from public.hunt_sessions h where h.ended_at is null
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until;
    for i in 1 .. 28 loop
      v_users := v_users || ('00000000-0000-4000-8000-0000001e4b' || lpad(to_hex(i), 2, '0'))::uuid;
    end loop;
    insert into auth.users (id) select unnest(v_users) on conflict do nothing;
    insert into public.player_state (user_id, slot) select u, 0 from unnest(v_users) u on conflict do nothing;
    delete from public.character_presence where user_id = any (v_users);
    insert into public.hunt_instances (id, hunt_id, kind) values (v_party[1], 'mill_cellar', 'party'), (v_party[2], 'mill_cellar', 'party');
    for i in 1 .. 28 loop
      insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (v_users[i], 0, 'mill_cellar', now() - interval '30 minutes', now() - interval '25 minutes',
              now() - interval '20 minutes' + make_interval(secs => case when i > 20 then 0 else i end), now() - interval '20 minutes',
              case when i > 24 then v_party[2] when i > 20 then v_party[1] end);
    end loop;

    -- ── p1, rolled back to the fixture (variables survive a sub-block, rows do not)
    begin
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'b', r.body, 'o', r.ord) order by r.ord)
        into v_a from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r where r.user_id = any (v_users);
      if jsonb_array_length(coalesce(v_a, '[]')) <> 28 or (select count(distinct e->>'s') from jsonb_array_elements(v_a) e) <> 28 then
        raise exception 'p1: % rows for the 28 due sessions (each once)', jsonb_array_length(coalesce(v_a, '[]')); end if;
      if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                  where h.instance_id = any (v_party) group by h.instance_id having count(distinct (e->>'b')::int) <> 1) then
        raise exception 'p1: a party''s members rode different bodies'; end if;
      if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                  group by (e->>'b')::int having count(distinct h.instance_id) > 16 or count(*) > 16 + 3) then
        raise exception 'p1: a body carries over 16 instances or 16 + 3 heroes'; end if;
      select count(*) into v_bad
        from jsonb_array_elements(v_a) e
        join public.hunt_sessions h on h.id = (e->>'s')::uuid
        join (select z.inst, greatest((z.r - 1) / 16, z.before / 16) as b
                from (select h2.instance_id as inst,
                             dense_rank() over (order by md5(h2.instance_id::text), h2.instance_id) as r,
                             (sum(count(*)) over (order by md5(h2.instance_id::text), h2.instance_id) - count(*))::int as before
                        from public.hunt_sessions h2 where h2.user_id = any (v_users) and h2.ended_at is null
                       group by h2.instance_id) z) f on f.inst = h.instance_id
       where f.b <> (e->>'b')::int;
      if v_bad <> 0 then raise exception 'p1: % session(s) not in the body the heroes formula gives', v_bad; end if;
      select count(*) into v_bad from jsonb_array_elements(v_a) e join public.hunt_tick_lease l on l.session_id = (e->>'s')::uuid
       where l.holder <> v_pfx || ':h' || (e->>'b') or l.lease_until <= now();
      if v_bad <> 0 then raise exception 'p1: % session(s) not leased to their body''s holder', v_bad; end if;
      raise exception 'TPH_SUB_OK';
    exception when others then
      if sqlerrm <> 'TPH_SUB_OK' then raise; end if;
    end;
    begin
      update public.hr_tick_config set hunt_body_heroes = 4 where id;
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'b', r.body)) into v_a
        from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r where r.user_id = any (v_users);
      -- (a party whose first hero falls in a body rides there whole: a body may carry party size - 1 past the dial)
      if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                  group by (e->>'b')::int having count(*) > 4 + 3)
         or (select count(distinct (e->>'b')::int) from jsonb_array_elements(v_a) e) <> 7
         or exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                     where h.instance_id = any (v_party) group by h.instance_id having count(distinct (e->>'b')::int) <> 1) then
        raise exception 'p1: at 4 heroes a body the 28 heroes rode %',
          (select jsonb_object_agg(b, n) from (select (e->>'b') b, count(*) n from jsonb_array_elements(v_a) e group by 1) x); end if;
      raise exception 'TPH_SUB_OK';
    exception when others then
      if sqlerrm <> 'TPH_SUB_OK' then raise; end if;
    end;

    -- ── p2: one body a fire of 6 heroes: the most behind first (the two parties, whole, then lone hunts) while they fit
    begin
      update public.hr_tick_config set hunt_bodies_max = 1, hunt_body_heroes = 6 where id;
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'b', r.body)) into v_a
        from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r where r.user_id = any (v_users);
      -- most behind: the two parties (settled 20 min ago), then lone 1, 2...; heroes 4 (party 1) <= 6, 8 (party 2) > 6: stop
      if (select count(*) from jsonb_array_elements(coalesce(v_a, '[]')) e) <> 4
         or exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                     where h.instance_id is distinct from v_party[1]) then
        raise exception 'p2: one 6-hero body a fire took %', (select jsonb_agg(h.user_id) from jsonb_array_elements(coalesce(v_a, '[]')) e
          join public.hunt_sessions h on h.id = (e->>'s')::uuid); end if;
      if exists (select 1 from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
                  where h.user_id = any (v_users) and h.instance_id is distinct from v_party[1]) then
        raise exception 'p2: an instance past the heroes ceiling was leased'; end if;
      raise exception 'TPH_SUB_OK';
    exception when others then
      if sqlerrm <> 'TPH_SUB_OK' then raise; end if;
    end;

    -- ── p3: the deferred lease goes back, its own body's only
    begin
      update public.hr_tick_config set hunt_body_heroes = 4 where id;
      perform 1 from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r;
      select array_agg(l.session_id) into v_ids from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
       where h.user_id = any (v_users) and l.holder = v_pfx || ':h1';
      if cardinality(v_ids) <> 4 then raise exception 'p3 CANNOT RUN: body 1 holds % sessions', cardinality(v_ids); end if;
      select count(*) into v_n from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r where r.user_id = any (v_users);
      if v_n <> 0 then raise exception 'p3: % live lease(s) were re-offered before any was freed', v_n; end if;
      if public.hr_hunt_lease_free(2, v_ids) <> 0 then raise exception 'p3: another body freed body 1''s leases'; end if;
      if public.hr_hunt_lease_free(1, v_ids) <> 4 then raise exception 'p3: body 1 did not free its four deferred leases'; end if;
      if public.hr_hunt_lease_free(1, v_ids) <> 0 then raise exception 'p3: a freed lease was freed again'; end if;
      select coalesce(jsonb_agg(r.session_id order by r.session_id), '[]'::jsonb) into v_b
        from public.hr_hunt_roster_sharded(v_pfx, 16, 30000) r where r.user_id = any (v_users);
      if v_b is distinct from (select jsonb_agg(x order by x) from unnest(v_ids) x) then
        raise exception 'p3: after body 1 freed its four the next call re-offered %, not exactly them', v_b; end if;
      raise exception 'TPH_SUB_OK';
    exception when others then
      if sqlerrm <> 'TPH_SUB_OK' then raise; end if;
    end;

    -- ── kg
    if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                where exists (select 1 from pg_roles where rolname = r.role)
                  and has_function_privilege(r.role, 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')) then
      raise exception 'kg: a request or engine role holds EXECUTE on the hunt packer'; end if;
    if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) r(role)
                where has_function_privilege(r.role, 'public.hr_hunt_lease_free(integer,uuid[])', 'execute'))
       or (exists (select 1 from pg_roles where rolname = 'hr_engine')
           and not has_function_privilege('hr_engine', 'public.hr_hunt_lease_free(integer,uuid[])', 'execute')) then
      raise exception 'kg: hr_hunt_lease_free is reachable by a request role, or not by the engine'; end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── r1: each regrant, planted and rolled back
    if not has_table_privilege('authenticated', 'public.bug_reports', 'insert') then
      raise exception 'r1 CANNOT RUN: bug_reports lost its live INSERT; the live pair is no longer a control'; end if;
    for v_t, v_named in select * from (values
        ('grant insert on public.game_events to authenticated', 'game_events:authenticated:INSERT'),
        ('grant select, insert, update, delete on public.session_claims to authenticated; '
         || 'create policy session_claims_insert_own on public.session_claims for insert with check (auth.uid() = user_id)',
         'session_claims:authenticated:INSERT'),
        ('grant delete on public.clan_members to authenticated', 'clan_members:authenticated:DELETE'),
        ('create table public.hr__dead_write_probe (id int primary key); alter table public.hr__dead_write_probe enable row level security; '
         || 'create policy hr__p on public.hr__dead_write_probe for update to anon using (true); grant update on public.hr__dead_write_probe to anon',
         'hr__dead_write_probe:anon:UPDATE')) t(plant, named) loop
      begin
        execute v_t;
        v_a := public.hr_assert_grant_hygiene(false);
        if not (v_a->'client_truncate_grants') ? v_named then
          raise exception 'r1: the detector did not name % after: % (it reads %)', v_named, v_t, v_a->'client_truncate_grants'; end if;
        if (v_a->'client_truncate_grants') ? 'bug_reports:authenticated:INSERT' then
          raise exception 'r1: the detector names the live pair bug_reports:authenticated:INSERT'; end if;
        begin
          perform public.hr_assert_grant_hygiene(true);
          raise exception 'r1: strict mode passed with % planted', v_named;
        exception when others then
          if sqlerrm like 'r1:%' then raise; end if;
        end;
        raise exception 'TPH_SUB_OK';
      exception when others then
        if sqlerrm <> 'TPH_SUB_OK' then raise; end if;
      end;
    end loop;
    if to_regclass('public.hr__dead_write_probe') is not null or has_table_privilege('authenticated', 'public.game_events', 'insert') then
      raise exception 'r1: a plant leaked'; end if;

    -- ── kr
    update public.hr_tick_config set flush_seconds = v_cfg.flush_seconds, fold_windows = v_cfg.fold_windows,
           hunt_body_max = v_cfg.hunt_body_max, hunt_body_heroes = v_cfg.hunt_body_heroes, hunt_bodies_max = v_cfg.hunt_bodies_max where id;
    update public.hr_hunt_config set enabled = v_hcfg where id;

    raise exception 'HR1004TPH_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1004TPH_ROLLBACK_OK' then raise; end if;
  end;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure) is distinct from 'b8b1612f063bc6db4cb0a9f8afdc1e3f'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure) is distinct from 'e941ed280b7c9e6fbd4fd20f87b4ee11' then
    raise exception 'k0: a body landed off its post pin: roster %, detector %',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure); end if;
  raise notice 'tick-pack-heroes: EXECUTED - bodies cut by heroes (16) and instances (16), parties whole, the fan-out in heroes, a deferred lease freed by its own body only - all green';
end $mig$;
