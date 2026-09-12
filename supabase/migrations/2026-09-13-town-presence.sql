-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-presence.sql — WEEK 1 OF THE LIVE SYSTEM: THE SERVER LEARNS
--                                WHO IS IN TOWN, AND WHAT THEY ARE DOING.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-13-town-presence.sql`)
--     AFTER a Security GO. It creates the FIRST cross-player read surface in the
--     game that is not a leaderboard: a projection of what other living
--     characters are doing RIGHT NOW. That is a stalking surface by
--     construction, so it ships with an opt-out column, an allowlist, a cap, a
--     rate gate and a server flag that defaults to OFF.
--
--   Reads:   player_state (own new columns), profiles.display_name (the name
--            authority, 2026-08-11-chat-name-authority.sql), hr_activities
--            (the catalogue, for label VALIDATION), hr_total_level,
--            world_finds (2026-09-08-hearthfind.sql — the crier feed; REUSED,
--            never duplicated), hr_rpc_gate / hr_rate_ok, hr_cron_ensure.
--   Adds:    hr_flags, town_snapshot, player_state.last_seen_at,
--            player_state.presence_quiet, hr_flag_on, hr_town_zone,
--            hr_activity_label, hr_heartbeat(+__ungated),
--            hr_set_presence_quiet(+__ungated), hr_town_of(+__ungated),
--            hr_town_refresh, one pg_cron job, ledger kind 'presence'.
--   Patches: hr_rpc_gate (three buckets, additive), hr_state_of (ONE anchored
--            splice: an own-`place` block).
--   Client:  a later lane (the Home plaza panel + the Crier). NOTHING in this
--            file requires a client change to be safe: with the flag OFF the
--            whole feature answers {off:true} and the cron job writes nothing.
--   Test:    tests/town-presence.mjs (PGlite chain replay + mutation proof)
--
-- ── WHY THIS SHAPE (PRIORITY_BOARD §10, architect's half of the study) ──────
-- Tyler's pre-launch gate is "a live system like Huntera has", and the hook he
-- named is seeing other players on the screen. The study's Week-1 slice is S:
-- presence and a crier, zero Realtime, zero infra, zero art. Four decisions in
-- it are load-bearing and are the reason this file looks the way it does.
--
-- (1) LIVENESS IS STAMPED BY THE SERVER, NEVER ASSERTED BY A CLIENT.
--     Realtime Presence was REJECTED as a data source in the study: its state is
--     client-asserted, so "I am in town, level 99, fighting the Ancient Wyrm" is
--     whatever the browser says. hr_heartbeat takes NO user argument and NO
--     timestamp argument — it stamps `now()` on the row belonging to auth.uid().
--     There is therefore no forgery to defend against; there is nothing to forge.
--
-- (2) PEERS NEVER TRAVEL IN THE ENVELOPE. hr_state_of is version-gated: if peer
--     motion rode in it, every peer heartbeat would invalidate every other
--     player's version and the game would be a version_conflict storm. The
--     envelope gains ONLY an own-`place` block (zone + your own quiet flag).
--     Peers come from hr_town_of, which is unversioned, cached and rate-gated.
--
-- (3) READERS NEVER SCAN player_state. A 20-second poll from N players that each
--     scanned the live-character set is N² work on the hottest table in the
--     database. One pg_cron job builds ONE row per zone every 25 s; every reader
--     reads that row. At 1,000 concurrent players the scan cost is FIXED (2,400
--     scans/day, not 4,320,000 reads/day) and the read cost is one primary-key
--     probe per poll. town_snapshot is NOT client-readable: if it were, a client
--     could read it directly and skip the rate gate and the allowlist.
--
-- (4) THE PROJECTION IS AN ALLOWLIST, AND IT IS THE ONLY LEAK BOUNDARY.
--     The snapshot row holds absolute timestamps (it is private); hr_town_of
--     maps them to relative ones and emits EXACTLY seven keys per peer and six
--     per crier line. Nothing about gold, gems, inventory, equipment, exact HP,
--     bounty target, slot, user_id or email can appear, because the projection
--     is built key by key from a literal jsonb_build_object and §11 asserts the
--     key set by jsonb_object_keys — not by reading the code.
--
-- ── WHY A NAMED PEER LIST NEEDS AN OPT-OUT COLUMN ──────────────────────────
-- "Tyler is mining Iron Ore, last seen 4 s ago" is a presence oracle. For most
-- players that is the feature; for one player it is the reason they stop
-- playing. presence_quiet is a SERVER column (never residue — a client-held
-- privacy flag is a privacy flag that a reload loses), default false, set only
-- through hr_set_presence_quiet on the caller's own row, journalled once per
-- CHANGE in player_ledger kind='presence' so the decision is auditable, and
-- honoured in BOTH halves of the snapshot: a quiet character is absent from the
-- peer list AND their name is absent from the crier feed. world_finds itself is
-- unchanged and stays public-readable — it already was, anonymously; what quiet
-- suppresses is the NAME being joined onto it in a live feed.
--
-- ── WHY THE HEARTBEAT IS NOT JOURNALLED, AND CARRIES NO IDEMPOTENCY KEY ────
-- game_events reached 1.6M rows / 229 MB from SIX players in four days by
-- logging per-tick facts. A heartbeat is the most per-tick fact there is: at one
-- every 25 s, 1,000 concurrent players produce 3,456,000 calls/day. So:
--   · it journals NOTHING — not player_intents, not player_ledger, not
--     hr_rejections (a throttled heartbeat is normal, not a refusal);
--   · it needs no idempotency key, because the write is IDEMPOTENT BY
--     CONSTRUCTION: it assigns an absolute value (now()) rather than applying a
--     delta, so a replay of the same call is indistinguishable from the call.
--     An idempotency key here would ADD a player_intents row per 25 s — i.e. it
--     would create exactly the unbounded table the rule exists to prevent.
--   · it does NOT bump player_state.version. The envelope is version-gated; a
--     presence stamp that bumped the version would make every 25-second poll
--     collide with the player's own in-flight apply. §11(h) asserts this.
--
-- ── WHY THE 20-SECOND FLOOR IS THE COLUMN, NOT A COUNTER ───────────────────
-- The brief asks for a ≥20 s gate. hr_rate_gate is the ENGINE's gate (granted to
-- hr_engine only, bucket allowlist hardcoded to engine buckets); using it from a
-- browser-callable path would mean granting a privileged function to
-- `authenticated`, which is the one thing §3 of the house rules forbids. The
-- client path's gate is hr_rpc_gate, and this file adds three buckets to it.
-- On top of that, the 20-second FLOOR is enforced by the row we are about to
-- stamp: `now() - last_seen_at < 20 s` → return without writing. That costs no
-- extra storage, cannot drift from the thing it protects, and makes a 240/min
-- heartbeat storm cost ONE write per 20 s per character instead of 240.
--
-- ── ROWS AND BYTES AT 100× PLAYERS ─────────────────────────────────────────
--   player_state: +2 columns, ~9 bytes/row. At 100,000 characters: ~0.9 MB.
--   town_snapshot: ONE row per zone. Payload at the 60-peer cap ≈ 60 × ~160 B
--     + 40 crier lines × ~140 B ≈ 15 KB, rewritten every 25 s → HOT row, 3,456
--     updates/day, one vacuum-friendly table with one row. Explicitly NOT a
--     history table: the previous snapshot has no value and is not kept.
--   cron: 3,456 executions/day, each one indexed scan of the live window.
--   NEW LEDGER ROWS: only on a quiet TOGGLE. Zero per tick, by design.
--   hr_rate_counters: +3 buckets/user (fixed-window upsert, one row each).
--
-- RESTATEMENT-DEBT-ACK: hr_state_of is an anchored patch chain — depth 19 before
-- this file and 20 with it, measured by `node tests/patch-chain-guard.mjs`, which
-- names it as the slice-7 paydown target; 2026-09-12-dungeon-cooldown.sql and
-- 2026-09-12-worker-hired-at-projection.sql carry the same ack for the same
-- reason. The debt is taken knowingly, and the alternative is worse: a
-- restatement must equal the LIVE body plus one key, an agent cannot apply or
-- re-pin, and a restatement authored from the repo replay is the b484-b487 class
-- in which the restated body silently reverts whichever file patched last — on
-- the one function every screen reads. Two projections landed on it within the
-- last day (renown_high 17:22 UTC, dungeon_cooldowns 17:32 UTC), so the risk is
-- not theoretical. This file adds a SINGLE key at an anchor the chain has
-- appended after (never consumed) three times already, and §13(d) asserts the
-- splice landed exactly once AND that renown_high, dungeon_cooldowns, scrip,
-- marks and hired_at all still project. THE PAYDOWN is unchanged and
-- Coordinator-owned: restate hr_state_of once from pg_get_functiondef of the
-- LIVE body, and the chain resets for everyone.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
--   select public.hr_cron_drop('hr-town-refresh');
--   update public.hr_flags set enabled = false where key = 'town_presence';
--   drop function if exists public.hr_town_of(text);
--   drop function if exists public.hr_town_of__ungated(text);
--   drop function if exists public.hr_town_refresh(text);
--   drop function if exists public.hr_heartbeat(int);
--   drop function if exists public.hr_heartbeat__ungated(int);
--   drop function if exists public.hr_set_presence_quiet(int, boolean);
--   drop function if exists public.hr_set_presence_quiet__ungated(int, boolean);
--   drop function if exists public.hr_activity_label(text, text);
--   drop function if exists public.hr_flag_on(text);
--   drop function if exists public.hr_town_zone();
--   drop table if exists public.town_snapshot;
--   drop table if exists public.hr_flags;
--   delete from public.hr_client_rpc_baseline
--    where proname in ('hr_heartbeat','hr_set_presence_quiet','hr_town_of');
--   alter table public.player_state drop column if exists last_seen_at;
--   alter table public.player_state drop column if exists presence_quiet;
-- The hr_state_of splice and the hr_rpc_gate buckets are NOT auto-reverted: both
-- are anchored, additive, no-op-on-rerun patches, and removing a projection key
-- is a client-visible change. Re-apply the chain to restore either body.
-- The SAFE kill switch is the flag: `enabled = false` makes hr_town_of answer
-- {off:true} and the cron job write nothing, with no deploy.
--
-- SAFE TO RE-RUN. Every step is `if not exists` / `create or replace` /
-- idempotent-by-anchor, and §11 re-asserts every property on a second apply.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PREFLIGHT — refuse to install half a feature ─────────────────────────
do $mig$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is absent — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.profiles') is null then
    raise exception 'profiles is absent — the peer NAME has no authority to come from'; end if;
  if to_regclass('public.world_finds') is null then
    raise exception 'world_finds is absent — apply 2026-09-08-hearthfind.sql first; the crier feed '
                    'REUSES that table and this file must never duplicate it'; end if;
  if to_regclass('public.hr_activities') is null then
    raise exception 'hr_activities is absent — apply the catalogue first; without it the activity '
                    'label would be an unvalidated client string'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) is absent — apply the rate-gate chain first'; end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null then
    raise exception 'hr_rate_ok is absent — apply the rate chain first'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is absent — apply the apply-engine chain first'; end if;
  if to_regprocedure('public.hr_total_level(uuid,int)') is null then
    raise exception 'hr_total_level is absent — the level band has no server source'; end if;
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'hr_cron_ensure is absent — apply 2026-08-11-player-state.sql first; the snapshot '
                    'refresh must be scheduled BY the migration that creates it'; end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_ledger'::regclass
                    and conname = 'player_ledger_kind_check') then
    raise exception 'player_ledger_kind_check is absent — the quiet-toggle journal row would be '
                    'unconstrained'; end if;
end $mig$;

-- ── 1. hr_flags — THE SERVER FLAG TABLE (there was none) ────────────────────
-- The chain had NO flag table: every arm switch so far has been a `constant
-- boolean := true` inside a function body, i.e. a migration and an apply window
-- to change. A pre-launch live surface needs a kill switch that costs one UPDATE.
--
-- The column is `enabled`, not `on`: `on` is not reserved in Postgres but it is
-- in enough dialects and tools (and in `set on`/`on conflict` grammar) that every
-- reference would need quoting forever. One word of honesty beats a lifetime of
-- double quotes.
--
-- PUBLIC READ, RPC-WRITE-ONLY-BY-NOBODY: there is no write policy and no write
-- grant, so the ONLY writer is the owner (an operator, or a future admin RPC).
-- Read is granted because the client should be able to hide a dead panel rather
-- than poll a feature that answers {off:true} forever.
create table if not exists public.hr_flags (
  key        text primary key,
  enabled    boolean     not null default false,
  note       text,
  updated_at timestamptz not null default now()
);
alter table public.hr_flags enable row level security;
drop policy if exists hr_flags_read on public.hr_flags;
create policy hr_flags_read on public.hr_flags for select to anon, authenticated using (true);
do $$
begin
  -- ⚠ service_role IS IN THE REVOKE LIST, for the reason world_finds states: the
  --   default ACL hands a new public table to anon, authenticated AND
  --   service_role, and service_role bypasses RLS, so revoking three of four
  --   leaves the privilege intact on the fourth. A flag table a leaked key can
  --   flip is not a kill switch.
  revoke all on public.hr_flags from public, anon, authenticated, service_role;
  grant select on public.hr_flags to anon, authenticated;
end $$;

-- OFF by default, and the insert is `do nothing` so a re-apply NEVER switches a
-- live flag back off (that would be a silent outage every time the chain replays).
insert into public.hr_flags (key, enabled, note) values
  ('town_presence', false,
   'Week 1 of the live system (PRIORITY_BOARD §10): hr_heartbeat / hr_town_of / '
   'the town_snapshot cron. OFF at apply. Turning it on starts the cron writes '
   'and opens the peer projection; turning it off stops both with no deploy.')
on conflict (key) do nothing;

-- The reader. STABLE and owner-only: the flag is public-READABLE through the
-- table, but the DECISION belongs to server code, and a client-executable
-- predicate over an arbitrary key is a free enumeration endpoint.
-- FAILS CLOSED: an unknown key is OFF.
create or replace function public.hr_flag_on(p_key text)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce((select enabled from public.hr_flags where key = p_key), false)
$$;
revoke execute on function public.hr_flag_on(text) from public;
revoke execute on function public.hr_flag_on(text) from anon, authenticated, service_role;

-- ── 2. THE ZONE — ONE NAME, ONE PLACE ──────────────────────────────────────
-- Week 1 has exactly one zone. It is a function, not three string literals, so
-- Week 2 (zones.js + a player_state.zone_id column) changes ONE line here rather
-- than hunting the constant through the refresh, the reader and the envelope.
create or replace function public.hr_town_zone()
returns text language sql immutable parallel safe as $$ select 'the_common'::text $$;
-- ⚠ NOT GRANTED TO `authenticated`, and the reason is mechanical rather than
--   cautious: hr_assert_grant_hygiene's D2 check reports EVERY client-executable
--   public function that is not in hr_client_rpc_baseline, and it runs nightly
--   under pg_cron into maintenance_alerts. A harmless one-line constant granted to
--   a browser would be a standing nightly alert — and a monitor that is always
--   amber is a monitor nobody reads. The client does not need it: hr_town_of's
--   p_zone DEFAULTS to the zone, so the correct client call is `hr_town_of({})`.
revoke execute on function public.hr_town_zone() from public;
revoke execute on function public.hr_town_zone() from anon, authenticated, service_role;

-- ── 3. player_state — THE TWO ADDITIVE COLUMNS ─────────────────────────────
-- last_seen_at: NULLABLE on purpose. NULL means "has never heartbeat", which is
-- every character until the client half ships, and it is the correct answer —
-- not `now()`, which would put the entire player base in the plaza at apply
-- time, and not epoch, which would be a lie with a timestamp on it.
alter table public.player_state add column if not exists last_seen_at timestamptz;
-- presence_quiet: NOT NULL default false. A nullable privacy flag has three
-- states and code that forgets the third is how a privacy flag fails open.
alter table public.player_state add column if not exists presence_quiet boolean not null default false;

-- The snapshot's only scan. PARTIAL on `last_seen_at is not null` so it holds
-- one entry per character that has ever been present rather than one per
-- character, and it does NOT include presence_quiet: quiet is a handful of rows,
-- so filtering it in the heap beats a second index to maintain on the hottest
-- table in the database.
create index if not exists player_state_last_seen_idx
  on public.player_state (last_seen_at desc) where last_seen_at is not null;

-- ── 4. player_ledger.kind ADMITS 'presence' ────────────────────────────────
-- INSERTION, never a restatement (the 2026-09-10-dungeon-settle.sql idiom): it
-- removes nothing, so it cannot silently delete a kind a later file added if it
-- is re-applied out of order.
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent — the quiet-toggle journal row would be '
                    'unconstrained, and every other writer assumes the constraint exists';
  end if;
  if position('''presence''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''presence'' — widen skipped';
    return;
  end if;
  if position('''accrue''::text' in v_def) = 0 then
    raise exception 'player_ledger_kind_check has no ''accrue''::text anchor (%) — refusing to '
                    'rewrite a constraint whose shape this file cannot account for', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''presence''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''presence'' (insertion, nothing removed)';
end $$;

-- ── 5. hr_activity_label — A COARSE LABEL, DERIVED, NEVER DUPLICATED ───────
-- ⚠ THIS IS THE "NEVER DUPLICATE GAME DATA INTO SQL" RULE, APPLIED.
--   hr_activities carries (kind, activity_id) and no display name — the names
--   live in src/data/*.js, which is the single source of game content. So this
--   function does NOT store a name: it VALIDATES the id against the catalogue
--   and returns a title-cased rendering of the catalogue KEY. `iron_ore` →
--   "Iron Ore". There is no second copy of anything, so there is nothing to
--   drift, and a content batch that adds a node needs no migration to be
--   describable in the plaza.
--
--   The peer object ALSO carries the raw `activity_id`, so the client can render
--   the authored display name from its own catalogue when it has one; the
--   derived label is the fail-safe for a client whose catalogue is older than
--   the server's. Presentation is the client's; the FACT is the server's.
--
--   Returns NULL for idle, for a NULL id, and — load-bearing — for an id that is
--   not in the catalogue. An uncatalogued active_id cannot reach another player's
--   screen at all, so a tampered client cannot broadcast a chosen string.
create or replace function public.hr_activity_label(p_kind text, p_id text)
returns text language sql stable security definer set search_path = public, pg_catalog as $$
  select initcap(replace(a.activity_id, '_', ' '))
    from public.hr_activities a
   where a.kind = p_kind and a.activity_id = p_id
$$;
revoke execute on function public.hr_activity_label(text, text) from public;
revoke execute on function public.hr_activity_label(text, text) from anon, authenticated, service_role;

-- ── 6. hr_heartbeat — "I AM HERE", STAMPED BY THE SERVER CLOCK ─────────────
-- THE WHOLE SECURITY ARGUMENT IS IN THE SIGNATURE: there is no p_user and no
-- timestamp. The only identity is auth.uid(), the only clock is now(), and the
-- only row reachable is (auth.uid(), p_slot). A player cannot mark ANOTHER
-- player present, absent, or busy; the worst they can do with p_slot is stamp
-- one of their OWN characters, and a slot they do not own is refused
-- no_character with nothing written.
create or replace function public.hr_heartbeat__ungated(p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  -- The floor. 20 s is the brief's number; the poll the client half will use is
  -- 25 s, so an honest client never sees a throttle and a storming one costs one
  -- write per 20 s per character instead of one per call.
  c_floor  constant interval := interval '20 seconds';
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_last   timestamptz;
  v_quiet  boolean;
  v_now    timestamptz := now();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if v_slot < 0 or v_slot > 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  select last_seen_at, presence_quiet into v_last, v_quiet
    from public.player_state where user_id = v_uid and slot = v_slot;
  if not found then
    -- Not "create one". A presence ping is never a character factory.
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  -- THE FLOOR, ENFORCED BY THE COLUMN WE WERE ABOUT TO WRITE. Answered ok:true
  -- deliberately — a throttled heartbeat is the normal state of an eager client,
  -- not a refusal, so it must not be journalled (it would be a per-tick row) and
  -- must not look like an error to the client's retry logic.
  if v_last is not null and v_now - v_last < c_floor then
    return jsonb_build_object(
      'ok', true, 'stamped', false, 'throttled', true,
      'zone', public.hr_town_zone(), 'quiet', coalesce(v_quiet, false),
      'next_in_s', ceil(extract(epoch from (c_floor - (v_now - v_last))))::int);
  end if;

  -- ⚠ NO VERSION BUMP. The envelope is version-gated; a presence stamp that
  --   bumped player_state.version would make every 25-second poll collide with
  --   the player's own in-flight apply and hand them a version_conflict storm.
  --   §11(h) asserts that the version is untouched.
  update public.player_state
     set last_seen_at = v_now
   where user_id = v_uid and slot = v_slot;

  return jsonb_build_object(
    'ok', true, 'stamped', true, 'throttled', false,
    'zone', public.hr_town_zone(), 'quiet', coalesce(v_quiet, false));
end $$;

-- The gated wrapper. p_slot CARRIES A DEFAULT and that is load-bearing:
-- PostgREST resolves an RPC by the named arguments in the POST body, so a client
-- that posts {} against a one-argument function with no default gets PGRST202 —
-- a 404 indistinguishable from "the migration was never applied" (b332's class).
create or replace function public.hr_heartbeat(p_slot int default 0)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_heartbeat') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_heartbeat__ungated($1);
end $w$;

revoke execute on function public.hr_heartbeat__ungated(int) from public;
revoke execute on function public.hr_heartbeat__ungated(int)
  from anon, authenticated, service_role;
revoke execute on function public.hr_heartbeat(int) from public;
revoke execute on function public.hr_heartbeat(int) from anon, authenticated, service_role;
grant  execute on function public.hr_heartbeat(int) to authenticated;

-- ── 7. hr_set_presence_quiet — THE OPT-OUT ─────────────────────────────────
-- Own row only, and journalled ONCE PER CHANGE — not per call. A player who
-- clicks the toggle twenty times writes one ledger row per actual transition, so
-- the audit trail answers "when did they opt out" without becoming a click log.
create or replace function public.hr_set_presence_quiet__ungated(p_slot int, p_quiet boolean)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := auth.uid();
  v_slot int  := coalesce(p_slot, 0);
  v_want boolean := coalesce(p_quiet, false);
  v_was  boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if v_slot < 0 or v_slot > 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- FOR UPDATE: two tabs toggling at once must not both journal a transition.
  select presence_quiet into v_was
    from public.player_state where user_id = v_uid and slot = v_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  if coalesce(v_was, false) = v_want then
    -- Idempotent by construction: the intent names an absolute value, so a
    -- replay is a no-op with the same answer. No key needed, nothing journalled.
    return jsonb_build_object('ok', true, 'quiet', v_want, 'changed', false);
  end if;

  -- ⚠ NO VERSION BUMP, for hr_heartbeat's reason: the flag is projected into the
  --   envelope, and a bump would collide with an in-flight apply. The client
  --   re-reads `place.quiet` on its next envelope.
  update public.player_state set presence_quiet = v_want
   where user_id = v_uid and slot = v_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
  values (v_uid, v_slot, 'presence', 'presence_quiet:' || v_want::text,
          jsonb_build_object('op', 'quiet', 'from', coalesce(v_was, false), 'to', v_want));

  return jsonb_build_object('ok', true, 'quiet', v_want, 'changed', true);
end $$;

create or replace function public.hr_set_presence_quiet(
  p_slot int default 0, p_quiet boolean default true)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_set_presence_quiet') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_set_presence_quiet__ungated($1, $2);
end $w$;

revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean) from public;
revoke execute on function public.hr_set_presence_quiet__ungated(int, boolean)
  from anon, authenticated, service_role;
revoke execute on function public.hr_set_presence_quiet(int, boolean) from public;
revoke execute on function public.hr_set_presence_quiet(int, boolean)
  from anon, authenticated, service_role;
grant  execute on function public.hr_set_presence_quiet(int, boolean) to authenticated;

-- ── 8. town_snapshot — THE CACHE, AND IT IS PRIVATE ────────────────────────
-- ONE ROW PER ZONE, rewritten in place. Deliberately not a history table: the
-- previous snapshot has no value, and keeping it is how a 15 KB payload every
-- 25 s becomes 2 GB a year.
--
-- NO READ POLICY AND NO READ GRANT. This is the point: if a client could SELECT
-- this table it would bypass the rate gate AND the allowlist projection, and
-- read the internal shape (absolute timestamps, uncapped counts) instead of the
-- seven keys hr_town_of emits. The only reader is hr_town_of (SECURITY DEFINER,
-- owner); the only writer is hr_town_refresh (same).
create table if not exists public.town_snapshot (
  zone_id  text primary key,
  built_at timestamptz not null default now(),
  payload  jsonb       not null default '{}'::jsonb
);
alter table public.town_snapshot enable row level security;
do $$
begin
  revoke all on public.town_snapshot from public, anon, authenticated, service_role;
end $$;

-- ── 8b. hr_town_refresh — THE CRON BODY ────────────────────────────────────
-- The ONE place that scans player_state. Everything about its cost is bounded
-- before it reads a name: the live window is an index range, DISTINCT ON folds an
-- account's characters to one body (so four slots cannot flood the plaza), and
-- the cap is applied BEFORE the per-row hr_total_level call.
create or replace function public.hr_town_refresh(p_zone text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  -- The presence window. A character not seen for 15 minutes has left town.
  c_window constant interval := interval '15 minutes';
  -- The crowd cap. The study's designer half says ONE Commons until a place
  -- measurably exceeds ~60 concurrent; past that the answer is a second zone,
  -- not a longer list. `here` still reports the TRUE count, so the cap is
  -- visible rather than a silent truncation.
  c_cap    constant int := 60;
  -- The crier window and depth. world_finds is already pruned by
  -- hr_world_finds_prune; this is the read-side clamp.
  c_crier  constant interval := interval '24 hours';
  c_crier_n constant int := 40;

  v_zone  text := coalesce(p_zone, public.hr_town_zone());
  v_peers jsonb;
  v_here  int;
  v_crier jsonb;
begin
  if v_zone <> public.hr_town_zone() then
    raise exception 'hr_town_refresh: unknown zone % (Week 1 has exactly one)', v_zone;
  end if;

  -- THE FLAG IS CHECKED FIRST AND THE JOB NO-OPS WHILE OFF — and after the
  -- first pass it writes NOTHING at all, so "off" costs one indexed read every
  -- 25 s and zero row versions. The row is blanked once so a snapshot built
  -- before the flag was turned off can never be served if it is turned back on
  -- with the cron job stopped.
  if not public.hr_flag_on('town_presence') then
    update public.town_snapshot
       set payload = jsonb_build_object('zone', v_zone, 'off', true,
                                        'peers', '[]'::jsonb, 'crier', '[]'::jsonb, 'here', 0),
           built_at = now()
     where zone_id = v_zone and coalesce(payload->>'off', '') <> 'true';
    return jsonb_build_object('ok', true, 'off', true, 'zone', v_zone);
  end if;

  -- THE PEERS. Internal shape: `seen_at` is ABSOLUTE, because the reader turns it
  -- into seen_ago_s/away at READ time — a snapshot that pre-computed "4 s ago"
  -- would be up to 25 s wrong by the time anybody saw it, and "away" would flap.
  with live as (
    select distinct on (ps.user_id)
           ps.user_id, ps.slot, ps.last_seen_at, ps.active_kind, ps.active_id
      from public.player_state ps
     where ps.last_seen_at > now() - c_window
       and not coalesce(ps.presence_quiet, false)
     order by ps.user_id, ps.last_seen_at desc
  ), capped as (
    select * from live order by last_seen_at desc limit c_cap
  ), shaped as (
    select c.last_seen_at,
           jsonb_build_object(
             -- THE NAME AUTHORITY. profiles.display_name, which
             -- 2026-08-11-chat-name-authority.sql made non-PATCHable and
             -- claim_display_name() keeps unique. Never a client-sent string.
             'name', coalesce(pr.display_name, 'Adventurer'),
             'activity_kind', c.active_kind,
             -- VALIDATED against the catalogue: an active_id the catalogue does
             -- not know becomes NULL rather than reaching another player's screen.
             'activity_id', a.activity_id,
             'activity_label', public.hr_activity_label(c.active_kind, c.active_id),
             -- COARSE: the band, never the level, and never the XP.
             'level_band', ((coalesce(public.hr_total_level(c.user_id, c.slot), 0) / 10) * 10),
             'seen_at', c.last_seen_at) as peer
      from capped c
      left join public.profiles pr on pr.id = c.user_id
      left join public.hr_activities a
             on a.kind = c.active_kind and a.activity_id = c.active_id
  )
  select coalesce(jsonb_agg(peer order by last_seen_at desc), '[]'::jsonb),
         (select count(*)::int from live)
    into v_peers, v_here
    from shaped;

  -- THE CRIER. world_finds REUSED, never duplicated. The table stores no name;
  -- the name is joined here from profiles, and a QUIET character's find is
  -- suppressed from the named feed — the row itself stays on the public board,
  -- exactly as anonymous as it already was.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', coalesce(pr.display_name, 'Adventurer'),
           'item_id', w.item_id,
           'source_kind', w.source_kind,
           'source_id', w.source_id,
           'one_in', w.one_in,
           'found_at', w.found_at) order by w.found_at desc), '[]'::jsonb)
    into v_crier
    from (select f.user_id, f.slot, f.item_id, f.source_kind, f.source_id, f.one_in, f.found_at
            from public.world_finds f
           where f.found_at > now() - c_crier
           order by f.found_at desc
           limit c_crier_n) w
    left join public.profiles pr on pr.id = w.user_id
   where not exists (select 1 from public.player_state q
                      where q.user_id = w.user_id and q.slot = w.slot and q.presence_quiet);

  insert into public.town_snapshot (zone_id, built_at, payload)
  values (v_zone, now(),
          jsonb_build_object('zone', v_zone, 'peers', v_peers, 'here', v_here,
                             'crier', v_crier, 'cap', c_cap))
  on conflict (zone_id) do update
     set built_at = excluded.built_at, payload = excluded.payload;

  return jsonb_build_object('ok', true, 'zone', v_zone, 'here', v_here,
                            'shown', jsonb_array_length(v_peers),
                            'crier', jsonb_array_length(v_crier));
end $$;
revoke execute on function public.hr_town_refresh(text) from public;
revoke execute on function public.hr_town_refresh(text)
  from anon, authenticated, service_role, hr_engine;

-- ── 8c. THE SCHEDULE ───────────────────────────────────────────────────────
-- 25 s, matching the study's non-authoritative read channel. pg_cron gained
-- sub-minute schedules in 1.5; Supabase's Postgres 17 image carries 1.6. If the
-- server refuses the interval this falls back to one minute and SAYS SO — a
-- degraded cadence is a product decision, a failed apply over a cron string is
-- not. PGlite has no pg_cron at all, so the whole block is conditional (the
-- 2026-08-11-player-state.sql idiom) and the chain replay is unaffected.
do $$
declare v_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is absent — SCHEDULE BY HAND after apply:';
    raise notice '  select public.hr_cron_ensure(''hr-town-refresh'', ''25 seconds'', '
                 '''select public.hr_town_refresh()'');';
    return;
  end if;
  begin
    v_id := public.hr_cron_ensure('hr-town-refresh', '25 seconds',
                                  'select public.hr_town_refresh()');
    raise notice 'pg_cron scheduled: hr-town-refresh every 25 seconds (job %)', v_id;
  exception when others then
    v_id := public.hr_cron_ensure('hr-town-refresh', '* * * * *',
                                  'select public.hr_town_refresh()');
    raise notice 'pg_cron REFUSED a 25-second schedule (%) — hr-town-refresh runs every MINUTE '
                 'instead (job %). The plaza is a 60-second snapshot on this server; the reader '
                 'reports stale_s so the client can say so.', sqlerrm, v_id;
  end;
end $$;

-- ── 9. hr_town_of — THE ONLY WAY A PEER LIST LEAVES THE SERVER ─────────────
-- ⚠ WHY THE INNER IS STABLE AND THE WRAPPER IS NOT. The READ is stable — one
--   primary-key probe and a projection, no writes, safe to inline. The rate gate
--   is an UPSERT on hr_rate_counters, and Postgres refuses a write inside a
--   STABLE function. So the gate lives in the VOLATILE wrapper and the stable
--   read is the inner. "STABLE" is a property of the read, and this is the only
--   shape in which it can be both true and gated.
--
-- THE ALLOWLIST IS BUILT KEY BY KEY FROM LITERALS. There is no `payload - 'x'`
-- denylist and no `select *` anywhere on this path: a new internal field added
-- to the snapshot tomorrow cannot appear here by accident. §11(f) asserts the
-- emitted key set with jsonb_object_keys rather than trusting that sentence.
create or replace function public.hr_town_of__ungated(p_zone text)
returns jsonb language sql stable security definer
set search_path = public, pg_catalog as $$
  with snap as (
    select zone_id, built_at, payload from public.town_snapshot where zone_id = p_zone
  ), peers as (
    -- The window is re-applied at READ time: a snapshot the cron job stopped
    -- refreshing must never show a peer who has since left town.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name',           p->>'name',
             'activity_kind',  p->>'activity_kind',
             'activity_id',    p->>'activity_id',
             'activity_label', p->>'activity_label',
             'level_band',     (p->>'level_band')::int,
             'seen_ago_s',     greatest(0, floor(extract(epoch from
                                 (now() - (p->>'seen_at')::timestamptz))))::int,
             -- AWAY IS COMPUTED AT READ TIME. 90 s: the client half polls at 25 s,
             -- so three missed beats is "stepped away" and not "network hiccup".
             'away',           ((p->>'seen_at')::timestamptz < now() - interval '90 seconds')
           ) order by (p->>'seen_at')::timestamptz desc), '[]'::jsonb) as js
      from snap, jsonb_array_elements(coalesce(snap.payload->'peers', '[]'::jsonb)) as pe(p)
     where (p->>'seen_at')::timestamptz > now() - interval '15 minutes'
  ), crier as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name',        c->>'name',
             'item_id',     c->>'item_id',
             'source_kind', c->>'source_kind',
             'source_id',   c->>'source_id',
             'one_in',      (c->>'one_in')::bigint,
             'found_ago_s', greatest(0, floor(extract(epoch from
                              (now() - (c->>'found_at')::timestamptz))))::int
           ) order by (c->>'found_at')::timestamptz desc), '[]'::jsonb) as js
      from snap, jsonb_array_elements(coalesce(snap.payload->'crier', '[]'::jsonb)) as cr(c)
     where (c->>'found_at')::timestamptz > now() - interval '24 hours'
  )
  select jsonb_build_object(
    'ok', true,
    'zone', p_zone,
    -- The server clock, so the client renders "4s ago" ticking forward without
    -- ever consulting its own.
    'now', now(),
    -- How old the snapshot is. The client shows the plaza as live or as a
    -- photograph based on a server number, never on a guess.
    'stale_s', (select greatest(0, floor(extract(epoch from (now() - built_at))))::int from snap),
    'peers', (select js from peers),
    -- `here` is the UNCAPPED live count from the snapshot; `shown` is what this
    -- answer actually carries. Both, so a capped plaza reads "60 of 214 here"
    -- instead of silently claiming the town holds sixty people.
    'here', coalesce((select (payload->>'here')::int from snap), 0),
    'shown', (select jsonb_array_length(js) from peers),
    'cap', coalesce((select (payload->>'cap')::int from snap), 0),
    'crier', (select js from crier))
$$;

create or replace function public.hr_town_of(p_zone text default 'the_common')
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
declare v_zone text := coalesce(nullif(p_zone, ''), public.hr_town_zone());
begin
  if not public.hr_rpc_gate('hr_town_of') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- THE FLAG, AFTER THE GATE. Before it, "off" would be a free unlimited call.
  if not public.hr_flag_on('town_presence') then
    return jsonb_build_object('ok', true, 'off', true);
  end if;
  -- An unknown zone is refused rather than answered empty: an empty answer is
  -- indistinguishable from "nobody is here", and a client that could name any
  -- string would be enumerating the snapshot table one guess at a time.
  if v_zone <> public.hr_town_zone() then
    return jsonb_build_object('ok', false, 'error', 'bad_zone');
  end if;
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  return public.hr_town_of__ungated(v_zone);
end $w$;

revoke execute on function public.hr_town_of__ungated(text) from public;
revoke execute on function public.hr_town_of__ungated(text)
  from anon, authenticated, service_role;
revoke execute on function public.hr_town_of(text) from public;
revoke execute on function public.hr_town_of(text) from anon, authenticated, service_role;
grant  execute on function public.hr_town_of(text) to authenticated;

-- ── 10. hr_rpc_gate — THREE BUCKETS, PROGRAMMATIC AND ADDITIVE ─────────────
-- The 2026-09-08-hero-slot-buy.sql idiom: pg_get_functiondef + ONE guarded,
-- exactly-once replace at the case terminator, so this file never restates a
-- body it did not author and cannot delete another file's bucket. An UNKNOWN
-- bucket fails CLOSED (`else return false`), so without this patch all three
-- verbs would answer rate_limited forever and the feature would deploy green and
-- dead.
--
-- THE NUMBERS, per minute per user:
--   hr_heartbeat          6 — the 20 s floor already caps the WRITES at 3/min;
--                             6 leaves room for a tab regaining focus.
--   hr_town_of           30 — the panel polls at 25 s (2.4/min); 30 covers a
--                             player opening and closing the plaza repeatedly.
--   hr_set_presence_quiet 12 — a privacy toggle, clicked once.
do $$
declare
  v_src text; v_new text;
  c_anchor constant text := 'else return false;' || chr(10) || '  end case;';
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_heartbeat''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits the town buckets — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to '
                    'patch blind';
  end if;
  v_new := replace(v_src, c_anchor,
    'when ''hr_heartbeat'' then v_limit := 6;' || chr(10) ||
    '    when ''hr_town_of'' then v_limit := 30;' || chr(10) ||
    '    when ''hr_set_presence_quiet'' then v_limit := 12;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_heartbeat 6/min, hr_town_of 30/min, '
               'hr_set_presence_quiet 12/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 11. hr_state_of — THE OWN-`place` BLOCK (anchored splice, exactly once) ─
-- ⚠ OWN STATE ONLY. NEVER PEERS. hr_state_of is version-gated and is applied to
--   the client's authoritative state; peers change every few seconds and belong
--   to nobody, so putting them here would make every peer's heartbeat a version
--   conflict for every player. The envelope carries only what the PLAYER owns:
--   which zone they are in, and whether they have opted out.
--
-- Anchored on the top-level `'now', now(),` the envelope already carries — the
-- same anchor 2026-09-12-dungeon-cooldown.sql used, which survives insertion
-- because each splice appends AFTER the anchor text. NO-OP on re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$    'now', now(),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'place'$q$) > 0 then
    raise notice 'hr_state_of already projects place — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of `now` anchor did not match exactly once — its shape is not '
                    'the one this file was derived against. Do NOT patch a body you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, $new$    'now', now(),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects the own-place block';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 12. Grant-hygiene baseline — THREE NEW CLIENT VERBS, DECLARED ──────────
-- hr_assert_grant_hygiene's D2 check fails on a function that `authenticated`
-- can execute and the baseline does not list. Declaring them here is the
-- APPROVAL, in the same file as the grant, with the reason next to it.
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of')
     and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_heartbeat', 'p_slot integer', 'authenticated',
     'added 2026-09-13: "I am here". Stamps player_state.last_seen_at = now() on the CALLER''S OWN '
     'row (auth.uid(), p_slot) and nothing else. No p_user, no timestamp parameter — there is '
     'nothing to forge. Moves no value, bumps no version, journals nothing, and refuses to write a '
     'second time inside 20 s (the floor is the column itself).'),
    ('hr_set_presence_quiet', 'p_slot integer, p_quiet boolean', 'authenticated',
     'added 2026-09-13: the stalking opt-out. Sets player_state.presence_quiet on the caller''s own '
     'row; a quiet character is absent from the peer projection AND from the named crier feed. '
     'Journalled once per CHANGE in player_ledger kind=''presence''. Moves no value, bumps no '
     'version, idempotent by construction (it names an absolute value).'),
    ('hr_town_of', 'p_zone text', 'authenticated',
     'added 2026-09-13: the read side of Week 1. Returns the cached town_snapshot row projected '
     'through a literal ALLOWLIST — seven keys per peer (name from profiles, activity kind/id/label '
     'validated against hr_activities, level BAND, seen_ago_s, away) and six per crier line. Never '
     'gold, gems, inventory, equipment, HP, bounty, slot or user_id. Reads a cache, never '
     'player_state. {off:true} while the hr_flags.town_presence flag is off.');
end $$;

-- ── 13. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ──────────────────────────
-- Properties proven by EXECUTING SQL, not by markers. The apply is atomic, so a
-- raise here reverts §1-§12. The row-writing probes live in a subtransaction
-- discarded by a sentinel raise (HR812), so this block is net-zero on production.
do $$
declare
  v_def    text;
  v_bad    text;
  v_txt    text;
  v_n      int;
  v_res    jsonb;
  v_env    jsonb;
  v_town   jsonb;
  v_peer   jsonb;
  v_last   timestamptz;
  v_ver    bigint;
  v_uid    constant uuid := '000000ab-0000-0000-0000-0000000000a1';
  v_other  constant uuid := '000000ab-0000-0000-0000-0000000000a2';
  v_quiet  constant uuid := '000000ab-0000-0000-0000-0000000000a3';
  c_peer_keys constant text[] := array['activity_id','activity_kind','activity_label','away',
                                       'level_band','name','seen_ago_s'];
  c_crier_keys constant text[] := array['found_ago_s','item_id','name','one_in','source_id',
                                        'source_kind'];
begin
  -- (a) THE OBJECTS EXIST, and the flag defaults OFF.
  if to_regclass('public.hr_flags') is null or to_regclass('public.town_snapshot') is null then
    raise exception 'GATE(a): hr_flags / town_snapshot did not install'; end if;
  if not exists (select 1 from public.hr_flags where key = 'town_presence') then
    raise exception 'GATE(a): the town_presence flag row is missing — the kill switch does not exist';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state'
         and column_name = 'presence_quiet' and is_nullable = 'NO'
         and column_default like '%false%') <> 1 then
    raise exception 'GATE(a): player_state.presence_quiet is missing, nullable, or does not default '
                    'false — a three-state privacy flag fails open';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state'
         and column_name = 'last_seen_at') <> 1 then
    raise exception 'GATE(a): player_state.last_seen_at is missing'; end if;
  if (select count(*) from pg_indexes
       where schemaname = 'public' and indexname = 'player_state_last_seen_idx') <> 1 then
    raise exception 'GATE(a): the presence index is missing — the cron job would seq-scan the '
                    'hottest table in the database every 25 seconds';
  end if;

  -- (b) GRANTS ARE EXACTLY THE BASELINE. The three wrappers are
  --     authenticated-only; every inner and every helper is shut out of every
  --     role a browser can hold; nothing new is reachable by hr_engine.
  --     From pg_proc.proacl via aclexplode, NOT information_schema: that view
  --     only shows grants involving a currently ENABLED role, so a PUBLIC
  --     EXECUTE grant — the default on every new function — is invisible in it.
  select string_agg(p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', ') into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and p.proname in ('hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                       'hr_town_of__ungated', 'hr_town_refresh', 'hr_flag_on',
                       'hr_activity_label', 'hr_town_zone')
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine'));
  if v_bad is not null then
    raise exception 'GATE(b): a privileged inner/helper is reachable by a client or engine role (%) '
                    '— the rate gate and the allowlist would be decoration', v_bad;
  end if;
  for v_txt in select unnest(array['public.hr_heartbeat(integer)',
                                   'public.hr_set_presence_quiet(integer,boolean)',
                                   'public.hr_town_of(text)']) loop
    if to_regprocedure(v_txt) is null then
      raise exception 'GATE(b): % did not install', v_txt; end if;
    if not has_function_privilege('authenticated', v_txt, 'execute') then
      raise exception 'GATE(b): % is not callable by authenticated — the feature is dead', v_txt; end if;
    select string_agg(r, ',') into v_bad from unnest(array['anon', 'service_role']) r
     where has_function_privilege(r, v_txt, 'execute');
    if v_bad is not null then
      raise exception 'GATE(b): % is executable by %', v_txt, v_bad; end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure(v_txt)
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'GATE(b): PUBLIC holds EXECUTE on %', v_txt; end if;
  end loop;
  -- ...and the baseline DECLARES all three, so hr_assert_grant_hygiene's D2 does
  -- not fail nightly on a grant this file made without approving.
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    select string_agg(x, ', ') into v_bad
      from unnest(array['hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of']) x
     where not exists (select 1 from public.hr_client_rpc_baseline b
                        where b.proname = x and b.grantee = 'authenticated');
    if v_bad is not null then
      raise exception 'GATE(b): % is client-executable but NOT in hr_client_rpc_baseline — the grant '
                      'set is no longer exactly the approved set', v_bad;
    end if;
    -- ...and the baseline DESCRIBES what was installed. identity_args carries
    -- argument NAMES as well as types (it is pg_get_function_identity_arguments
    -- output), so it is compared against that function's own identity string —
    -- NOT fed to has_function_privilege, which takes types only and raises
    -- "invalid type name" on a named list.
    select string_agg(b.proname, ', ') into v_bad from public.hr_client_rpc_baseline b
     where b.proname in ('hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of')
       and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = b.proname
                          and pg_get_function_identity_arguments(p.oid) = b.identity_args);
    if v_bad is not null then
      raise exception 'GATE(b): the baseline declares % with an argument list nothing installed '
                      'carries — the approval does not describe the grant', v_bad;
    end if;
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    -- Report-only (p_strict=false): this gate must not fail on pre-existing
    -- platform residue it did not create. What it DOES assert is that none of the
    -- three new verbs appears in the unapproved or ungated findings.
    v_res := public.hr_assert_grant_hygiene(false);
    if v_res::text like '%hr_heartbeat%' or v_res::text like '%hr_town_of%'
       or v_res::text like '%hr_set_presence_quiet%' then
      raise exception 'GATE(b): hr_assert_grant_hygiene reports a finding against one of this '
                      'file''s verbs: %', v_res;
    end if;
  end if;

  -- (c) THE RATE GATE ADMITS ALL THREE BUCKETS, and the patch deleted none.
  v_def := pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure);
  select string_agg(x, ', ') into v_bad
    from unnest(array['hr_heartbeat', 'hr_town_of', 'hr_set_presence_quiet']) x
   where position('''' || x || '''' in v_def) = 0;
  if v_bad is not null then
    raise exception 'GATE(c): hr_rpc_gate does not admit % — an unknown bucket fails CLOSED, so the '
                    'verb would answer rate_limited forever and ship green and dead', v_bad;
  end if;
  select string_agg(x, ', ') into v_bad
    from unnest(array['hr_claim_daily', 'clan_deposit', 'farm_plant', 'hr_buy_hero_slot',
                      'hr_credit_kills']) x
   where position('''' || x || '''' in v_def) = 0;
  if v_bad is not null then
    raise exception 'GATE(c): the hr_rpc_gate patch DELETED the % bucket(s) — it is not additive',
      v_bad;
  end if;

  -- (d) THE ENVELOPE SPLICE LANDED EXACTLY ONCE and consumed nothing. This is
  --     2026-09-12-dungeon-cooldown.sql §7(c)'s discipline: the patch chain on
  --     hr_state_of is 18 deep, and a restatement authored against a stale body
  --     silently deletes a projection every screen reads.
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position('''place''' in v_def) = 0 then
    raise exception 'GATE(d): hr_state_of does not project place'; end if;
  v_n := (length(v_def) - length(replace(v_def, '''place'', jsonb_build_object', '')))
         / length('''place'', jsonb_build_object');
  if v_n <> 1 then
    raise exception 'GATE(d): the place block appears % times in hr_state_of (expected exactly 1) — '
                    'a double splice means a double apply corrupted the body', v_n;
  end if;
  if position('''now'', now()' in v_def) = 0 then
    raise exception 'GATE(d): the splice consumed the `now` anchor — the client would lose the '
                    'server clock it renders every countdown against';
  end if;
  -- FAIL-CLOSED on the two projections that joined the envelope immediately
  -- before this file. renown_high landed 2026-09-12 17:22 UTC and
  -- dungeon_cooldowns 17:32 UTC; this file SPLICES rather than restates, so it
  -- must compose with both instead of reverting them — and that is a claim, so
  -- it is asserted rather than believed.
  if position('''renown_high''' in v_def) = 0 then
    raise exception 'GATE(d): hr_state_of no longer projects renown_high — this file was applied on '
                    'top of a body that predates 2026-09-12-renown-high-projection.sql, or it '
                    'reverted it. Re-apply that projection, then this.';
  end if;
  if position('''dungeon_cooldowns''' in v_def) = 0 then
    raise exception 'GATE(d): hr_state_of no longer projects dungeon_cooldowns — this file reverted '
                    '2026-09-12-dungeon-cooldown.sql''s splice. Re-apply it, then this.';
  end if;
  if position('''dungeon_scrip''' in v_def) = 0 or position('''marks''' in v_def) = 0
     or position('''hired_at''' in v_def) = 0 then
    raise exception 'GATE(d): the splice DROPPED an earlier projection (scrip / marks / hired_at) — '
                    'the patch chain is broken';
  end if;

  -- (e) NO CLIENT WRITE on the new tables, and town_snapshot is not even
  --     client-READABLE: a readable cache is a rate gate and an allowlist
  --     bypassed in one SELECT.
  select string_agg(table_name || ':' || grantee || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('hr_flags', 'town_snapshot')
     and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
     and not (table_name = 'hr_flags' and privilege_type = 'SELECT'
              and grantee in ('anon', 'authenticated'));
  if v_bad is not null then
    raise exception 'GATE(e): an unapproved client grant exists on the new tables (%) — hr_flags is '
                    'SELECT-only to anon/authenticated and town_snapshot is reachable by nothing',
      v_bad;
  end if;
  for v_txt in select unnest(array['hr_flags', 'town_snapshot']) loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_txt and c.relrowsecurity) then
      raise exception 'GATE(e): RLS is OFF on %', v_txt; end if;
  end loop;
  select string_agg(polname || ':' || polcmd::text, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('hr_flags', 'town_snapshot') and p.polcmd <> 'r';
  if v_bad is not null then
    raise exception 'GATE(e): a NON-SELECT RLS policy exists on the new tables (%) — the flag would '
                    'be player-flippable', v_bad;
  end if;
  if exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'town_snapshot') then
    raise exception 'GATE(e): town_snapshot has an RLS policy — it must be reachable by NO client '
                    'role at all, so that the only read path is the allowlist projection';
  end if;

  -- (f) THE CRON JOB EXISTS AND FIRES AT LEAST ONCE A MINUTE (when pg_cron is
  --     here at all — PGlite has none, and the chain replay must still pass).
  if to_regclass('cron.job') is not null then
    select schedule into v_txt from cron.job where jobname = 'hr-town-refresh';
    if v_txt is null then
      raise exception 'GATE(f): the hr-town-refresh job is not scheduled — the snapshot would never '
                      'be built and the plaza would be permanently empty';
    end if;
    if v_txt not in ('25 seconds', '* * * * *') then
      raise exception 'GATE(f): hr-town-refresh runs on "%" — neither the 25-second cadence nor the '
                      'one-minute fallback this file installs', v_txt;
    end if;
    if (select count(*) from cron.job where jobname = 'hr-town-refresh') <> 1 then
      raise exception 'GATE(f): hr-town-refresh is scheduled more than once'; end if;
  else
    raise notice 'pg_cron absent (chain replay) — GATE(f) skipped, and §8c printed the manual '
                 'schedule command';
  end if;

  -- (g) EXECUTED, on synthetic characters, in a discarded subtransaction.
  begin
    insert into auth.users (id) values (v_uid), (v_other), (v_quiet) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values
      (v_uid, 'GateOne'), (v_other, 'GateTwo'), (v_quiet, 'GateHush')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, 0, 0, 0, 7), (v_other, 0, 0, 0, 7), (v_quiet, 0, 0, 0, 7)
      on conflict (user_id, slot) do update set version = 7;

    -- (g1) THE FLAG IS OFF AT APPLY, so the read surface is closed and the cron
    --      body writes nothing. This is the state production lands in.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_town := public.hr_town_of('the_common');
    if coalesce((v_town->>'off')::boolean, false) is not true then
      raise exception 'GATE(g1): hr_town_of answers % with the flag OFF — the feature is open before '
                      'anybody decided to open it', v_town;
    end if;
    if v_town ? 'peers' then
      raise exception 'GATE(g1): the OFF answer carries a peers key — it must carry no data at all';
    end if;
    perform public.hr_town_refresh();
    if exists (select 1 from public.town_snapshot where zone_id = 'the_common'
                and coalesce(payload->>'off', '') <> 'true') then
      raise exception 'GATE(g1): the cron body built a real snapshot while the flag was OFF';
    end if;

    -- (g2) A HEARTBEAT STAMPS THE SERVER CLOCK ON THE CALLER'S OWN ROW ONLY,
    --      and the 20-second floor refuses the second one.
    v_res := public.hr_heartbeat(0);
    if coalesce(v_res->>'stamped', '') <> 'true' then
      raise exception 'GATE(g2): the first heartbeat did not stamp: %', v_res; end if;
    select last_seen_at, version into v_last, v_ver
      from public.player_state where user_id = v_uid and slot = 0;
    if v_last is null then raise exception 'GATE(g2): last_seen_at was not written'; end if;
    if v_ver <> 7 then
      raise exception 'GATE(g2): the heartbeat BUMPED player_state.version (7 -> %) — every '
                      '25-second poll would collide with the player''s own apply', v_ver;
    end if;
    v_res := public.hr_heartbeat(0);
    if coalesce(v_res->>'throttled', '') <> 'true' or coalesce(v_res->>'stamped', '') <> 'false' then
      raise exception 'GATE(g2): a SECOND heartbeat inside 20 s was not throttled: %', v_res; end if;
    if (select last_seen_at from public.player_state where user_id = v_uid and slot = 0) <> v_last then
      raise exception 'GATE(g2): the throttled heartbeat WROTE anyway — the floor is decoration';
    end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid)
       or exists (select 1 from public.player_intents where user_id = v_uid) then
      raise exception 'GATE(g2): a heartbeat journalled a row — at one per 25 s that is the '
                      'game_events mistake (1.6M rows from six players) at ledger scale';
    end if;

    -- (g3) A FORGED HEARTBEAT FOR ANOTHER USER IS STRUCTURALLY IMPOSSIBLE, and
    --      one for a slot the caller does not own is refused with nothing written.
    select pg_get_function_identity_arguments(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_heartbeat';
    if position('uuid' in v_def) > 0 or position('timestamp' in v_def) > 0
       or position('date' in v_def) > 0 then
      raise exception 'GATE(g3): hr_heartbeat takes a uuid or time-typed argument (%) — a client '
                      'could name another player, or another clock', v_def;
    end if;
    v_res := public.hr_heartbeat(9);
    if coalesce(v_res->>'error', '') <> 'no_character' then
      raise exception 'GATE(g3): a heartbeat for an unowned slot was not refused no_character: %',
        v_res;
    end if;
    if exists (select 1 from public.player_state where user_id = v_uid and slot = 9) then
      raise exception 'GATE(g3): the heartbeat CREATED a character — a presence ping is not a '
                      'character factory';
    end if;
    if (select last_seen_at from public.player_state where user_id = v_other and slot = 0)
       is not null then
      raise exception 'GATE(g3): user A''s heartbeat moved user B''s last_seen_at';
    end if;

    -- (g4) THE FLAG ON: the snapshot builds, the projection shows the peer, and
    --      the ALLOWLIST is exactly the declared key set — asserted by
    --      jsonb_object_keys, not by reading the code.
    update public.hr_flags set enabled = true where key = 'town_presence';
    -- GateHush opts out; GateTwo is present and loud.
    perform set_config('request.jwt.claim.sub', v_other::text, true);
    perform public.hr_heartbeat(0);
    perform set_config('request.jwt.claim.sub', v_quiet::text, true);
    perform public.hr_heartbeat(0);
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce(v_res->>'changed', '') <> 'true' or coalesce(v_res->>'quiet', '') <> 'true' then
      raise exception 'GATE(g4): the quiet toggle did not take: %', v_res; end if;
    if (select count(*) from public.player_ledger
         where user_id = v_quiet and kind = 'presence') <> 1 then
      raise exception 'GATE(g4): the quiet CHANGE was not journalled exactly once'; end if;
    if (select version from public.player_state where user_id = v_quiet and slot = 0) <> 7 then
      raise exception 'GATE(g4): the quiet toggle bumped player_state.version'; end if;
    -- ...and a REPEAT of the same value journals nothing more.
    v_res := public.hr_set_presence_quiet(0, true);
    if coalesce(v_res->>'changed', '') <> 'false' then
      raise exception 'GATE(g4): a repeated quiet set reported a change: %', v_res; end if;
    if (select count(*) from public.player_ledger
         where user_id = v_quiet and kind = 'presence') <> 1 then
      raise exception 'GATE(g4): a repeated quiet set journalled a SECOND row — the audit trail is '
                      'a click log';
    end if;

    perform public.hr_town_refresh();
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_town := public.hr_town_of('the_common');
    if coalesce(v_town->>'ok', '') <> 'true' or v_town ? 'off' then
      raise exception 'GATE(g4): hr_town_of is closed with the flag ON: %', v_town; end if;
    if jsonb_array_length(v_town->'peers') <> 2 then
      raise exception 'GATE(g4): the plaza shows % peers, expected the 2 loud ones (the quiet '
                      'character must be absent): %', jsonb_array_length(v_town->'peers'), v_town;
    end if;
    if v_town::text like '%GateHush%' then
      raise exception 'GATE(g4): the QUIET character appears in the projection — the opt-out is '
                      'decoration: %', v_town;
    end if;
    if (v_town->>'here')::int <> 2 then
      raise exception 'GATE(g4): `here` counts % — the quiet character is being counted even though '
                      'they are not shown', v_town->>'here';
    end if;

    -- THE ALLOWLIST, BY KEYS.
    for v_peer in select jsonb_array_elements(v_town->'peers') loop
      select string_agg(k, ', ' order by k) into v_txt from jsonb_object_keys(v_peer) k;
      if v_txt <> array_to_string(c_peer_keys, ', ') then
        raise exception 'GATE(g4): a peer object carries keys [%] — the allowlist is [%]. Any key '
                        'outside it is a cross-player leak.', v_txt,
                        array_to_string(c_peer_keys, ', ');
      end if;
    end loop;
    for v_peer in select jsonb_array_elements(v_town->'crier') loop
      select string_agg(k, ', ' order by k) into v_txt from jsonb_object_keys(v_peer) k;
      if v_txt <> array_to_string(c_crier_keys, ', ') then
        raise exception 'GATE(g4): a crier line carries keys [%] — the allowlist is [%]', v_txt,
                        array_to_string(c_crier_keys, ', ');
      end if;
    end loop;
    -- ...and by the NAMES OF THINGS THAT MUST NEVER BE THERE, matched as JSON
    -- KEYS (`"gold":`) and not as bare substrings: an item called `gold_bar` in a
    -- crier line is content, not a leak, and a guard that reds on a content edit
    -- is a guard somebody deletes. The exact key-set check above is the primary
    -- assertion; this one survives a future rename of the projection.
    select string_agg(x, ', ') into v_bad
      from unnest(array['gold', 'gems', 'hearth_tokens', 'inventory', 'equipment', 'hp',
                        'max_hp', 'bounty', 'user_id', 'slot', 'email', 'version',
                        'dungeon_scrip', 'marks', 'renown', 'xp', 'skills']) x
     where position('"' || x || '":' in v_town::text) > 0
        or position('"' || x || '": ' in v_town::text) > 0;
    if v_bad is not null then
      raise exception 'GATE(g4): the town projection mentions % — the allowlist has been widened '
                      'into an economy leak', v_bad;
    end if;

    -- (g5) AWAY AND seen_ago_s ARE COMPUTED AT READ TIME, so a stale snapshot
    --      still tells the truth. Backdate the stamp past the 90 s away line.
    update public.player_state set last_seen_at = now() - interval '200 seconds'
     where user_id = v_other and slot = 0;
    perform public.hr_town_refresh();
    v_town := public.hr_town_of('the_common');
    select e.p into v_peer from jsonb_array_elements(v_town->'peers') as e(p)
     where e.p->>'name' = 'GateTwo';
    if v_peer is null then
      raise exception 'GATE(g5): the backdated peer vanished instead of going away: %', v_town; end if;
    if coalesce((v_peer->>'away')::boolean, false) is not true then
      raise exception 'GATE(g5): a peer last seen 200 s ago is not marked away: %', v_peer; end if;
    if (v_peer->>'seen_ago_s')::int < 190 then
      raise exception 'GATE(g5): seen_ago_s reads % for a 200-second-old stamp — it is not derived '
                      'from the server clock at read time', v_peer->>'seen_ago_s';
    end if;
    -- ...and A STALE SNAPSHOT SHOWS NOBODY. Simulated the only way it can be
    -- inside one transaction (now() is frozen): age the SNAPSHOT's own stamps by
    -- 20 minutes, which is exactly the state the row is in if the cron job stops.
    -- The read re-applies the 15-minute window, so a dead refresher leaves an
    -- empty plaza rather than a room full of ghosts.
    update public.town_snapshot
       set payload = jsonb_set(payload, '{peers}',
             (select coalesce(jsonb_agg(jsonb_set(e.p, '{seen_at}',
                       to_jsonb(now() - interval '20 minutes'))), '[]'::jsonb)
                from jsonb_array_elements(payload->'peers') as e(p)))
     where zone_id = 'the_common';
    v_town := public.hr_town_of('the_common');
    if jsonb_array_length(v_town->'peers') <> 0 or (v_town->>'shown')::int <> 0 then
      raise exception 'GATE(g5): a peer outside the 15-minute window is still projected from a stale '
                      'snapshot: %', v_town;
    end if;
    if (v_town->>'stale_s') is null then
      raise exception 'GATE(g5): the answer carries no stale_s — the client cannot tell a live plaza '
                      'from a photograph';
    end if;

    -- (g6) THE ACTIVITY LABEL IS VALIDATED AGAINST THE CATALOGUE. A tampered
    --      client cannot broadcast a chosen string: an uncatalogued active_id
    --      projects as NULL.
    select activity_id into v_txt from public.hr_activities where kind = 'gather'
     order by activity_id limit 1;
    if v_txt is null then
      raise exception 'GATE(g6): hr_activities has no gather row — the label check would be vacuous';
    end if;
    if public.hr_activity_label('gather', v_txt) is null then
      raise exception 'GATE(g6): a catalogued activity has no label'; end if;
    if public.hr_activity_label('gather', 'FORGED_NODE_' || v_txt) is not null then
      raise exception 'GATE(g6): an UNCATALOGUED activity_id produced a label — a tampered client '
                      'could put any string on every other player''s screen';
    end if;
    update public.player_state set active_kind = 'gather', active_id = v_txt,
                                   last_seen_at = now()
     where user_id = v_uid and slot = 0;
    perform public.hr_town_refresh();
    v_town := public.hr_town_of('the_common');
    select e.p into v_peer from jsonb_array_elements(v_town->'peers') as e(p)
     where e.p->>'name' = 'GateOne';
    if coalesce(v_peer->>'activity_kind', '') <> 'gather'
       or coalesce(v_peer->>'activity_id', '') <> v_txt
       or (v_peer->>'activity_label') is null then
      raise exception 'GATE(g6): the activity did not project: %', v_peer; end if;
    if (v_peer->>'level_band')::int % 10 <> 0 then
      raise exception 'GATE(g6): level_band % is not a band — the exact total level is leaking',
        v_peer->>'level_band';
    end if;

    -- (g7) THE RATE GATE REFUSES A STORM, and town_snapshot is unreadable as
    --      `authenticated` even with a valid JWT.
    -- bad_zone FIRST, while the bucket still has budget: after the storm below
    -- every answer is rate_limited and the assertion would be vacuous.
    v_res := public.hr_town_of('somewhere_else');
    if coalesce(v_res->>'error', '') <> 'bad_zone' then
      raise exception 'GATE(g7): an unknown zone was answered % instead of refused bad_zone — an '
                      'empty answer is indistinguishable from "nobody is here", and a free-text '
                      'zone is snapshot enumeration one guess at a time', v_res;
    end if;
    for v_n in 1..60 loop
      v_res := public.hr_town_of('the_common');
      exit when coalesce(v_res->>'error', '') = 'rate_limited';
    end loop;
    if coalesce(v_res->>'error', '') <> 'rate_limited' then
      raise exception 'GATE(g7): 60 consecutive hr_town_of calls were all admitted — the 30/min '
                      'bucket is not wired';
    end if;

    raise exception using errcode = 'HR812', message = 'town-presence §13 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_uid, v_other, v_quiet))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_other, v_quiet))
     or exists (select 1 from public.profiles where id in (v_uid, v_other, v_quiet))
     or exists (select 1 from auth.users where id in (v_uid, v_other, v_quiet)) then
    raise exception 'GATE: §13 LEAKED a probe row';
  end if;
  if (select enabled from public.hr_flags where key = 'town_presence') <> false then
    raise exception 'GATE: §13 left the town_presence flag ON — the probe''s flag flip escaped the '
                    'rollback and the feature would open at apply';
  end if;
  if exists (select 1 from public.town_snapshot) then
    raise exception 'GATE: §13 left a snapshot row behind'; end if;

  raise notice 'town-presence: flag OFF at apply and the read surface closed behind it; the '
               'heartbeat stamps now() on the caller''s own row only, bumps no version, journals '
               'nothing and refuses a second write inside 20 s; another user''s row is unreachable '
               'by construction (no uuid, no timestamp parameter); quiet characters are absent from '
               'peers and crier and their toggle is journalled once per change; the projection '
               'carries exactly the 7-key peer / 6-key crier allowlist with away and seen_ago_s '
               'computed at read time; an uncatalogued activity_id projects NULL; town_snapshot is '
               'reachable by no client role; the envelope gained an own-place block and still '
               'projects renown_high and dungeon_cooldowns — all green';
end $$;
