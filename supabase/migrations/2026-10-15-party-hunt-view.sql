-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-15-party-hunt-view.sql — THE PARTY HUNT AS A MEMBER SEES IT: ONE
--   MEMBER-ONLY READ, ONE AGGREGATE, ITS OWN RATE BUCKET; hr_party_view LOSES
--   ITS THREE DEAD COLUMNS.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C (lane/b568-party-hunt-view):
-- Security GO, then the Coordinator applies (tools/apply-migration.mjs, one
-- file, never inside begin/commit, never 00:00–00:10 UTC). DB-ONLY: no edge
-- half. The client half (the Hunt card, docs/planning/SEC_GATHER_ARM_RUNBOOK
-- _2026-10-06.md "Party hunt as the player sees it" §1-§6) is a SEPARATE lane
-- after the GO and rides a cut after this file is APPLIED.
-- CHAIN POSITION: LAST, after 2026-10-14-world-tick-m4-party-horizon.sql (the
-- roster-log reasons, the horizon drop and the rejoin conditions this view
-- mirrors) and 2026-10-14-world-tick-presence-signal.sql. It restates NO body
-- either of them reads.
--
-- WHAT IT ANSWERS: the Game Designer's server asks A1-A4 (same runbook
-- section, "Server asks").
--   A1 hr_party_hunt_view(p_slot) — the member-only read of the hunt.
--   A2 share_bp / xp / gold RETIRED from hr_party_view (the designer's
--      preference: one read, no duplicated sum).
--   A3 polling, not a pushed party frame, for beta: a bucket sized for it.
--   A4 copy only — see "A4" below; no settle body is restated here.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 public.party_hunt_tally — NEW. One row per (hunt, member character): the
--    xp, gold and kills that member's PARTY ledger rows for that hunt carried,
--    the number of paid windows, and the xp split (meta.party.xp_bp) of their
--    LAST paid window. An AGGREGATE OF THE LEDGER, maintained by §2's trigger
--    in the same transaction as the ledger row, never per tick as a row of its
--    own (law 6: game_events reached 1.6M rows from 6 players by logging every
--    kill). RLS on AND forced, ZERO policies, every privilege revoked from
--    every client and engine role: the only reader is §4. It is display data:
--    nothing spends, ranks or trades on it, and the ledger stays the record.
--    + index party_hunt_party_recent (party_id, started_at desc): §4 reads the
--    party's most recent hunt when none is live.
-- §2 hr_party_hunt_tally_on_ledger() + trigger hr_party_hunt_tally AFTER
--    INSERT ON player_ledger FOR EACH ROW WHEN (new.meta ? 'party'). A row is
--    tallied only when meta.party.hunt names a party_hunt row OF THE PARTY
--    meta.party.id names (the settle validates meta.party.id against its own
--    p_party, but nothing validates .hunt: a hunt id of another party is
--    IGNORED here, never credited to that party's view). xp = xp_in, gold =
--    gold_in (hr_apply's own GROSS inflow columns, the daily budget's input),
--    kills = meta.kills. The body cannot fail a payment: every parse is
--    type-guarded and the whole body is one `exception when others` that
--    warns and skips, hr_apply's own renown-ratchet precedent — a display
--    aggregate never refuses a window that hr_apply accepted.
--    Backfilled AFTER the trigger is created, from player_ledger rows at or
--    after the earliest party_hunt.started_at (the PK leads with `at`), under
--    the trigger's own ShareRowExclusive lock: in-flight inserters finish
--    first and are read by the backfill, later ones are counted by the
--    trigger, so no row is counted twice or missed. `on conflict do nothing`
--    makes a re-apply a no-op.
-- §3 hr_rpc_gate learns ONE bucket, 'party_hunt_view' at 20/min, spliced at
--    the case terminator (the house idiom; 2026-09-23-m8-parties-s1-1 §5d).
--    A3, ARGUED BELOW. The 'party' bucket is NOT touched.
-- §4 hr_party_hunt_view(p_slot int) -> jsonb. SECURITY DEFINER, VOLATILE (it
--    writes the rate counter; party-view-volatile's lesson), pinned
--    search_path, `authenticated` only, recorded in hr_client_rpc_baseline.
--    The caller names ONE OF THEIR OWN SLOTS and nothing else: the party is
--    hr_party_of(auth.uid(), p_slot), so there is no party id, hunt id, user
--    or name a caller could put in to read someone else's party. Answers:
--      {ok:true, channel_open, hunt:null, members:[], events:[]}   no hunt yet
--      {ok:true, channel_open,
--       hunt:{active_id, stance, stop, started_at, accrued_to, ended_at,
--             stopped_by, kills, live},
--       members:[{name, me, state, camped_at, hp, hp_max, share_bp, xp, gold,
--                 kills}],             live members, tenure order
--       events:[{kind, reason, name, at}]}  <= 10 roster-log rows, newest first
--    The hunt is the party's LIVE hunt, else its most recent one (so a member
--    who returns after it ended reads why and what they earned).
--    state, judged on the server's rows and clock, in this order:
--      'ended'          the hunt shown has ended;
--      'hunting'        the member's latest roster-log row for it is not a drop;
--      'camping_today'  dropped, and dropped >= 3 times today by this party —
--                       the settle's (10)(b) clamp, same count, same day key;
--      'rejoining'      dropped, and the settle's own rejoin conditions on the
--                       member hold now: (e) their mark has moved past the drop
--                       mark, (h) they are combat-owned, (i) their horizon
--                       (return anchor + own cap) is still ahead of now();
--      'camping'        dropped otherwise.
--    share_bp is the member's xp split of their LAST paid window while they
--    are hunting a live hunt, else 0. xp/gold/kills are the hunt's tally, 0
--    when they have none — never NULL. hunt.kills sums every member's tally
--    for the hunt (members who left included: those kills happened).
--    NAMES, NEVER IDS (Security E2): name is profiles.display_name (the string
--    the party verbs resolve, 'Adventurer' when absent); `me` is a boolean;
--    stopped_by is cut at its first ':' because the settle writes
--    'member_unpayable:<user uuid>'. No user id, slot, party id or hunt id is
--    in any answer, and §7 asserts that over every answer it reads.
--    party_hunt_roster_log stays readable by NO client role and gains NO
--    policy: this function is its only client read path.
-- §5 hr_party_view RESTATED (A2): the body of 2026-09-23-m8-parties-s1-1
--    §6 minus the three keys share_bp / xp / gold, declared VOLATILE (the
--    2026-09-26 alter, carried into the restatement so it cannot regress).
--    Its member row is now FIVE keys: name, combat_level, hp, hp_max,
--    recovering_until. Its baseline note is rewritten to match.
--    WHY RETIRING THE KEYS IS THE CLEAN CHANGE TO A "FROZEN" CONTRACT: S-7
--    froze the set so that a column could never be ADDED without a review —
--    the freeze fences widening. This is a narrowing: three keys that have
--    answered NULL since S1, that no client renders (src/render/party-panel.js
--    says so in its header) and that no client reads (src/net/party.js stores
--    the rows verbatim). Filling them instead would put a second sum of the
--    same ledger rows behind a second door. The new set is still asserted as
--    an EQUALITY (§7 k5 and tests/party-membership.mjs P-VIEW), so it stays
--    frozen at five.
-- §6 grants restated (revoke first), baseline rows delete-then-insert.
-- §7 self-check, EXECUTED (CLAUDE.md §4), every fixture row rolled back.
--
-- ── A3: THE BUCKET, AND WHY IT IS NOT 'party' ───────────────────────────────
--   The client contract (designer §2/A3): poll this read every 10 s while the
--   Party panel is open and a hunt is live, every 60 s while it is open and
--   idle, never while it is closed. Steady state 6/min, idle 1/min.
--   'party_hunt_view' at 20/min = 3.3x the live cadence: room for the refresh
--   a client does after its own start / stop / leave answer, a panel closed and
--   reopened, a tab re-focus and a retry after a network error, inside one
--   minute. The bucket is per uid (hr_rate_ok keys on auth.uid()), and one
--   account has one active session (the tab-keyed session), so 20 is the whole
--   account's budget.
--   WHY A SEPARATE BUCKET RATHER THAN RAISING 'party' (12/min): 'party' is the
--   flood fence for the five membership verbs (the invite storm S-13 sized it
--   against) AND for hr_party_view, whose argument is a party UUID — the 12/min
--   is what makes a guessed uuid expensive (S-7/S-13; party-view-volatile).
--   Polling at 6/min out of that budget would leave 6/min for every verb and
--   roster read together, and a leader's Stop or a member's Leave would answer
--   rate_limited while the panel was open; raising 'party' to fit would loosen
--   both fences 2.5x for a read that needs neither. This read takes no party
--   id (the party is resolved from the caller's own slot), so it has no
--   existence oracle to fence: its bucket bounds COST only. The verbs keep 12.
--   AT SCALE (100x today's live cohort ≈ 600 players; every one of them in a
--   party, panel open, hunt live — the worst case): 600 x 6/min = 60 calls/s.
--   One call = one rate-counter upsert (hr_rate_counters, one row per user per
--   bucket, updated in place) + one party_member pk probe + one hunt index
--   probe + <= 4 x (player_state, profiles, tally, roster-log, anchor,
--   ownership) pk/index probes + one <= 10-row roster-log read: ~30 index
--   probes, no scan, O(1) in hunt length because of §1. ~1,800 probes/s at
--   the worst case; the ceiling a hostile fleet can reach is 20/min = 200
--   calls/s. 10k players would make the steady state ~1,000 calls/s, which is
--   the point at which the pushed party frame (designer: "the M5+ upgrade")
--   replaces the poll — not a beta concern, named so it is not forgotten.
--   Rows: +1 hr_rate_counters row per account that ever opens the panel; +1
--   party_hunt_tally row per (hunt, member) ≈ 4 per hunt (~100 bytes each),
--   updated in place per paid window — never a row per window.
--
-- ── A4 (copy only) ──────────────────────────────────────────────────────────
--   The designer's wording ("{name} made camp." / "{name} rejoined the hunt."
--   / the stopped_by table) SUPERSEDES the "sat out" PLAYER COPY comment in
--   2026-10-08-world-tick-party-drop.sql:74-81. That comment lives in an
--   applied file's header; the rule is that the NEXT file restating
--   hr_party_tick_settle replaces it with a pointer to the designer's spec.
--   THIS FILE DOES NOT RESTATE THE SETTLE, so A4 is carried forward to that
--   file, unchanged. The word "sat out" ships in no client string; this view
--   answers state codes ('camping', ...), never copy.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   §4 is a read plus the rate counter: no lock beyond the counter's row
--   upsert, and it waits on nothing the settle holds (plain MVCC reads). A
--   poll mid-settle sees the last committed window — the tally row and the
--   ledger row commit together, so the view can never show a tally the
--   ledger does not carry. §2's upsert runs inside hr_apply's transaction
--   under the settle's party_hunt FOR UPDATE, so two windows of one hunt can
--   never interleave their tally updates; one member's tally row is written
--   only by that member's own ledger rows.
--   Idempotency: §4 is a read (a replay is a re-read). §2 is per ledger row,
--   and a ledger row is written once per accepted apply (hr_apply's own
--   idempotency key), so a replayed intent that hr_apply refuses writes no
--   ledger row and no tally. Re-applying this file: §1 if-not-exists, §2
--   create-or-replace + drop-if-exists/create trigger + on-conflict-do-nothing
--   backfill, §3 skips when the bucket is present, §4/§5 restate identical
--   bodies, §6 delete-then-insert. A second apply is byte-identical
--   (tests/party-hunt-view.mjs P-IDEM).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +1 client RPC (authenticated): a read of the caller's OWN party, keyed on
--   (auth.uid(), own slot). NEW EXPOSURE, stated: a live member now reads
--   other live members' per-hunt xp / gold / kills and xp split (the designer
--   asked for exactly this; it was the S-7 shape's NULL promise) and the
--   party's drop/rejoin journal as names + reason codes. Never a balance,
--   never inventory, never a ledger row, never an id. A non-member, an
--   ex-member and a member of another party read `not_in_party` and nothing
--   else.
--   -3 keys on hr_party_view (always NULL). The trigger function is executable
--   by no role. The tally is readable by no role. 'party' bucket unchanged.
--   ⚠ FINDING FOR SECURITY, NOT FIXED HERE (out of this lane's scope): the
--   EXISTING `party_hunt` SELECT policy lets a live member read party_hunt
--   rows directly through PostgREST, and party_hunt.stopped_by carries
--   'member_unpayable:<user uuid>' — a co-member's auth.users id, which E2
--   says never reaches a client. This view sanitises it; the table policy
--   still exposes it. Recommend dropping that policy (the designer: "Reading
--   party_hunt directly stays unused") or the uuid in stopped_by, in its own
--   lane-C file.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   See A3 for the read. The trigger: a WHEN clause on every player_ledger
--   insert (a jsonb key test, no call for a non-party row); for a party row,
--   one party_hunt pk probe + one tally upsert inside a subtransaction. Party
--   rows are one per member per paid window (90 s): 960/member/day at the
--   very most. Tally bytes: ~4 rows x ~100 B per hunt, kept until the hunt
--   row is deleted (FK cascade) — same lifetime as party_hunt itself.
--
-- KNOWN LIMITATIONS
--   · 'rejoining' mirrors the rejoin's (b)(e)(h)(i); the rejoin may still be
--     deferred one fire by (a)(c)(g) (SKIP LOCKED rows) — the view keeps
--     answering 'rejoining' until the server's next fire rejoins them.
--   · events are the roster log only (drop / rejoin / stop). Start, leave,
--     kick and leader hand-off are not journalled there; the client derives
--     those from roster changes it reads (designer §6), or a later file
--     journals them.
--   · No per-member "events since my last receipt" (`mine`): the receipt
--     block (designer §5) filters `events` by the caller's own name and the
--     hunt's ended_at; a server-side receipt cursor is a later ask.
--   · Hunts that settled before this file have their tally backfilled from the
--     ledger, but only rows still inside the ledger's retention.
--
-- REVERSIBILITY:
--   drop trigger if exists hr_party_hunt_tally on public.player_ledger;
--   drop function public.hr_party_hunt_tally_on_ledger();
--   revoke execute on function public.hr_party_hunt_view(int) from authenticated;
--   delete from public.hr_client_rpc_baseline where proname = 'hr_party_hunt_view';
--   drop function public.hr_party_hunt_view(int);
--   drop table public.party_hunt_tally; drop index public.party_hunt_party_recent;
--   re-execute 2026-09-23-m8-parties-s1-1-tables.sql §6 + 2026-09-26-party-
--   view-volatile.sql for hr_party_view (and its baseline note from s1-3).
--   The 'party_hunt_view' case line in hr_rpc_gate is inert once nothing calls
--   it. Nothing here moves a value, so no reversal moves one either.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_rpc_gate, hr_party_view and the
--   two new functions (re-seed with --live --write; why: "party hunt view:
--   member-only read + tally; hr_party_view retires share_bp/xp/gold").
--   restore-census: party_hunt_tally classified (operational, derived).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.party_hunt') is null
     or to_regclass('public.party_member') is null
     or to_regclass('public.party_hunt_roster_log') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.hr_return_anchor') is null
     or to_regclass('public.hr_tick_ownership') is null
     or to_regclass('public.hr_tick_config') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: the party, roster-log, ledger, anchor, tick or baseline tables are absent — apply the M8 + world-tick chain through 2026-10-14-world-tick-m4-party-horizon.sql first';
  end if;
  if to_regprocedure('public.hr_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_party_level(uuid,integer)') is null
     or to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamp with time zone)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_party_of / hr_party_level / hr_offline_cap_ms / hr_utc_day_key / hr_rpc_gate / hr_assert_grant_hygiene absent';
  end if;
  -- The roster log must carry the M4 reasons the state logic reads.
  if position('past_horizon' in coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.party_hunt_roster_log'::regclass
         and c.conname = 'party_hunt_roster_log_shape'), '')) = 0 then
    raise exception 'PRECONDITION: party_hunt_roster_log lacks the M4 reasons — apply 2026-10-14-world-tick-m4-party-horizon.sql first';
  end if;
  -- §5 restates hr_party_view: the installed body must be S1's or this file's.
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_party_view(uuid)'::regprocedure;
  if v_md5 is null or v_md5 not in ('6627e1a3de0a9efe7ad65f94810e1931', '50cfb131f9192e2af2f6cf0e4a91260b') then
    raise exception 'PRECONDITION: hr_party_view prosrc md5 is %, expected S1''s 6627e1a3de0a9efe7ad65f94810e1931 or this file''s 50cfb131f9192e2af2f6cf0e4a91260b. Re-cut §5 against the installed body.', v_md5;
  end if;
end $mig$;

-- ── §1 public.party_hunt_tally — THE PER-(HUNT, MEMBER) AGGREGATE ───────────
create table if not exists public.party_hunt_tally (
  hunt_id    uuid        not null references public.party_hunt(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  slot       int         not null check (slot between 0 and 5),
  xp         bigint      not null default 0 check (xp >= 0),
  gold       bigint      not null default 0 check (gold >= 0),
  kills      bigint      not null default 0 check (kills >= 0),
  share_bp   int         not null default 0 check (share_bp between 0 and 10000),
  windows    int         not null default 0 check (windows >= 0),
  last_at    timestamptz,
  primary key (hunt_id, user_id, slot)
);
comment on table public.party_hunt_tally is
  '2026-10-15 (party-hunt-view, Game Designer A1). One row per (party hunt, member '
  'character): the xp_in / gold_in / meta.kills of that member''s player_ledger rows '
  'whose meta.party names this hunt, the paid-window count, and the xp split '
  '(meta.party.xp_bp) of the last one. An AGGREGATE OF THE LEDGER, written ONLY by the '
  'hr_party_hunt_tally trigger on player_ledger in the ledger row''s own transaction; '
  'never a row per window. Display data: read ONLY by hr_party_hunt_view; RLS forced, '
  'no policy, no privilege for any client or engine role. The ledger stays the record.';

alter table public.party_hunt_tally enable row level security;
alter table public.party_hunt_tally force row level security;
do $$
begin
  execute 'revoke all on public.party_hunt_tally from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

create index if not exists party_hunt_party_recent
  on public.party_hunt (party_id, started_at desc);

-- ── §2 THE TALLY TRIGGER, THEN THE BACKFILL ────────────────────────────────
create or replace function public.hr_party_hunt_tally_on_ledger()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  c_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_p     jsonb := new.meta->'party';
  v_hunt  uuid;
  v_party uuid;
  v_kills bigint := 0;
  v_bp    int := 0;
begin
  -- A display aggregate must never refuse a window hr_apply accepted: every
  -- parse below is type-guarded, and anything else warns and skips (hr_apply's
  -- renown-ratchet precedent). The ledger row is written either way.
  begin
    if jsonb_typeof(v_p) is distinct from 'object'
       or coalesce(v_p->>'hunt', '') !~ c_uuid
       or coalesce(v_p->>'id', '') !~ c_uuid then
      return null;
    end if;
    v_hunt  := (v_p->>'hunt')::uuid;
    v_party := (v_p->>'id')::uuid;
    -- THE HUNT MUST BELONG TO THE PARTY THE ROW NAMES. The settle checks
    -- meta.party.id against its own p_party; nothing checks .hunt, so a row
    -- naming another party's hunt is not credited to that party's view.
    if not exists (select 1 from public.party_hunt h
                    where h.id = v_hunt and h.party_id = v_party) then
      return null;
    end if;
    if jsonb_typeof(new.meta->'kills') = 'number' then
      v_kills := greatest(0, floor((new.meta->>'kills')::numeric))::bigint;
    end if;
    if jsonb_typeof(v_p->'xp_bp') = 'number' then
      v_bp := least(10000, greatest(0, floor((v_p->>'xp_bp')::numeric)))::int;
    end if;
    insert into public.party_hunt_tally as t
      (hunt_id, user_id, slot, xp, gold, kills, share_bp, windows, last_at)
    values (v_hunt, new.user_id, new.slot,
            greatest(0, coalesce(new.xp_in, 0)), greatest(0, coalesce(new.gold_in, 0)),
            v_kills, v_bp, 1, new.at)
    on conflict (hunt_id, user_id, slot) do update
       set xp       = t.xp + excluded.xp,
           gold     = t.gold + excluded.gold,
           kills    = t.kills + excluded.kills,
           share_bp = excluded.share_bp,
           windows  = t.windows + 1,
           last_at  = greatest(t.last_at, excluded.last_at);
  exception when others then
    raise warning 'party_hunt_tally skipped ledger row % (%/%): %', new.id, new.user_id, new.slot, sqlerrm;
  end;
  return null;
end $fn$;
comment on function public.hr_party_hunt_tally_on_ledger() is
  '2026-10-15 (party-hunt-view). AFTER INSERT trigger on player_ledger (WHEN meta ? party): '
  'folds one party ledger row into party_hunt_tally, only when meta.party.hunt is a hunt OF '
  'meta.party.id. Never raises (warns and skips). Executable by no role.';
revoke execute on function public.hr_party_hunt_tally_on_ledger() from public;
do $$
begin
  execute 'revoke execute on function public.hr_party_hunt_tally_on_ledger() from anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

drop trigger if exists hr_party_hunt_tally on public.player_ledger;
create trigger hr_party_hunt_tally
  after insert on public.player_ledger
  for each row when (new.meta ? 'party')
  execute function public.hr_party_hunt_tally_on_ledger();

-- THE BACKFILL, after the trigger: creating it took ShareRowExclusive on
-- player_ledger until commit, so every inserter in flight before it has
-- committed (and is read here) and every later one is counted by the trigger.
-- Same validity rule as the trigger; on conflict do nothing = re-apply no-op.
insert into public.party_hunt_tally (hunt_id, user_id, slot, xp, gold, kills, share_bp, windows, last_at)
select x.hunt_id, x.user_id, x.slot,
       sum(greatest(0, coalesce(x.xp_in, 0))), sum(greatest(0, coalesce(x.gold_in, 0))),
       sum(x.kills),
       (array_agg(x.bp order by x.at desc, x.id desc))[1],
       count(*), max(x.at)
  from (
    select l.id, l.at, l.user_id, l.slot, l.xp_in, l.gold_in,
           (l.meta->'party'->>'hunt')::uuid as hunt_id,
           case when jsonb_typeof(l.meta->'kills') = 'number'
                then greatest(0, floor((l.meta->>'kills')::numeric))::bigint else 0 end as kills,
           case when jsonb_typeof(l.meta->'party'->'xp_bp') = 'number'
                then least(10000, greatest(0, floor((l.meta->'party'->>'xp_bp')::numeric)))::int else 0 end as bp
      from public.player_ledger l
     where l.at >= coalesce((select min(h.started_at) from public.party_hunt h), 'infinity'::timestamptz)
       and l.meta ? 'party'
       and jsonb_typeof(l.meta->'party') = 'object'
       and coalesce(l.meta->'party'->>'hunt', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       and coalesce(l.meta->'party'->>'id', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       and exists (select 1 from public.party_hunt h
                    where h.id = (l.meta->'party'->>'hunt')::uuid
                      and h.party_id = (l.meta->'party'->>'id')::uuid)
  ) x
 group by x.hunt_id, x.user_id, x.slot
on conflict (hunt_id, user_id, slot) do nothing;

-- ── §3 THE 'party_hunt_view' RATE BUCKET — SPLICED AT THE CASE TERMINATOR ───
-- 20/min: A3, argued in the header. The 'party' bucket (12/min) is untouched.
do $$
declare v_src text; v_new text; c_anchor constant text := 'else return false;' || chr(10) || '  end case;';
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');
  if position('''party_hunt_view''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits the party_hunt_view bucket — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to patch blind.';
  end if;
  v_new := replace(v_src, c_anchor,
    'when ''party_hunt_view'' then v_limit := 20;' || chr(10) ||
    '    ' || c_anchor);
  execute v_new;
  raise notice 'hr_rpc_gate patched: the party_hunt_view bucket admitted at 20/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── §4 hr_party_hunt_view — THE MEMBER-ONLY READ OF THE HUNT (A1) ──────────
create or replace function public.hr_party_hunt_view(p_slot integer)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  -- The settle's (10)(b) clamp, mirrored: a member dropped this many times
  -- today by this party is not re-admitted until the server's UTC day rolls.
  c_max_drops_day constant int := 3;
  c_events        constant int := 10;
  v_uid     uuid := auth.uid();
  v_party   uuid;
  v_hunt    public.party_hunt%rowtype;
  v_open    boolean;
  v_day     text := public.hr_utc_day_key(now());
  v_kills   bigint;
  v_members jsonb;
  v_events  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not public.hr_rpc_gate('party_hunt_view') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_slot is null or p_slot not between 0 and 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- THE MEMBERSHIP FENCE: the JWT's own uid and the caller's own slot. There is
  -- no party, hunt, user or name parameter, so there is nothing to point at
  -- another party. One refusal for "no party" and "not yours" alike.
  v_party := public.hr_party_of(v_uid, p_slot);
  if v_party is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_party');
  end if;

  -- channel_open: what hr_party_hunt_start's two gates would answer now — the
  -- tick enabled with combat armed, and every live member combat-owned.
  select coalesce(c.enabled, false) and coalesce('combat' = any (c.armed_channels), false)
    into v_open from public.hr_tick_config c where c.id;
  v_open := coalesce(v_open, false)
    and not exists (select 1 from public.party_member m
                     where m.party_id = v_party and m.left_at is null
                       and not exists (select 1 from public.hr_tick_ownership o
                                        where o.user_id = m.user_id and o.slot = m.slot
                                          and o.channel = 'combat' and o.owned));

  -- THE HUNT: this party's live one, else its most recent.
  select * into v_hunt from public.party_hunt h
   where h.party_id = v_party and h.ended_at is null;
  if not found then
    select * into v_hunt from public.party_hunt h
     where h.party_id = v_party
     order by h.started_at desc, h.id desc
     limit 1;
  end if;
  if v_hunt.id is null then
    return jsonb_build_object('ok', true, 'channel_open', v_open, 'hunt', null,
                              'members', '[]'::jsonb, 'events', '[]'::jsonb);
  end if;

  select coalesce(sum(t.kills), 0) into v_kills
    from public.party_hunt_tally t where t.hunt_id = v_hunt.id;

  select coalesce(jsonb_agg(r.row order by r.joined_at, r.user_id), '[]'::jsonb)
    into v_members
    from (
      select m.joined_at, m.user_id,
             jsonb_build_object(
               'name',      coalesce(pr.display_name, 'Adventurer'),
               'me',        (m.user_id = v_uid and m.slot = p_slot),
               'state',     s.state,
               'camped_at', case when s.state in ('camping', 'camping_today', 'rejoining') then d.at end,
               'hp',        ps.hp,
               'hp_max',    ps.max_hp,
               'share_bp',  case when s.state = 'hunting' then coalesce(t.share_bp, 0) else 0 end,
               'xp',        coalesce(t.xp, 0),
               'gold',      coalesce(t.gold, 0),
               'kills',     coalesce(t.kills, 0)) as row
        from public.party_member m
        join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
        left join public.profiles pr on pr.id = m.user_id
        left join public.party_hunt_tally t
               on t.hunt_id = v_hunt.id and t.user_id = m.user_id and t.slot = m.slot
        -- The member's LATEST roster-log row for this hunt (hr_party_sat_out's
        -- reading, party_hunt_roster_log_state newest-first).
        left join lateral (
          select l.event, l.at, l.mark
            from public.party_hunt_roster_log l
           where l.hunt_id = v_hunt.id and l.user_id = m.user_id and l.slot = m.slot
           order by l.id desc
           limit 1) d on true
        cross join lateral (
          select case
            when v_hunt.ended_at is not null then 'ended'
            when d.event is distinct from 'drop' then 'hunting'
            -- (10)(b): the same count over the same index on the same day key.
            when (select count(*) from public.party_hunt_roster_log l2
                   where l2.party_id = v_party and l2.user_id = m.user_id and l2.slot = m.slot
                     and l2.event = 'drop' and l2.day_key = v_day) >= c_max_drops_day
              then 'camping_today'
            -- (e) their own mark moved past the drop mark; (h) still owned;
            -- (i) their horizon is still ahead of the server clock.
            when ps.accrued_to is not null
                 and ps.accrued_to > coalesce(d.mark, '-infinity'::timestamptz)
                 and exists (select 1 from public.hr_tick_ownership o
                              where o.user_id = m.user_id and o.slot = m.slot
                                and o.channel = 'combat' and o.owned)
                 and exists (select 1 from public.hr_return_anchor a
                              where a.user_id = m.user_id and a.slot = m.slot
                                and a.real_return_at
                                    + coalesce(public.hr_offline_cap_ms(m.user_id, m.slot), 0)
                                      * interval '1 millisecond' > now())
              then 'rejoining'
            else 'camping'
          end as state) s
       where m.party_id = v_party and m.left_at is null
    ) r;

  -- THE LAST TEN ROSTER-LOG EVENTS OF THIS HUNT, AS NAMES.
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind',   e.event,
           'reason', e.reason,
           'name',   coalesce(pr.display_name, 'Adventurer'),
           'at',     e.at) order by e.id desc), '[]'::jsonb)
    into v_events
    from (select l.id, l.event, l.reason, l.user_id, l.at
            from public.party_hunt_roster_log l
           where l.hunt_id = v_hunt.id
           order by l.id desc
           limit c_events) e
    left join public.profiles pr on pr.id = e.user_id;

  return jsonb_build_object('ok', true, 'channel_open', v_open,
    'hunt', jsonb_build_object(
      'active_id',  v_hunt.active_id,
      'stance',     v_hunt.stance,
      'stop',       v_hunt.stop,
      'started_at', v_hunt.started_at,
      'accrued_to', v_hunt.accrued_to,
      'ended_at',   v_hunt.ended_at,
      -- 'member_unpayable:<user uuid>' -> 'member_unpayable': names, never ids.
      'stopped_by', split_part(v_hunt.stopped_by, ':', 1),
      'kills',      v_kills,
      'live',       v_hunt.ended_at is null),
    'members', v_members,
    'events',  v_events);
end $fn$;
comment on function public.hr_party_hunt_view(integer) is
  '2026-10-15 (party-hunt-view, Game Designer A1). The member-only read of the party '
  'hunt: the caller''s OWN slot resolves the party (hr_party_of(auth.uid(), slot)); a '
  'non-member reads not_in_party. Hunt (live, else most recent), live members with '
  'state hunting|camping|rejoining|camping_today|ended, per-hunt xp/gold/kills from '
  'party_hunt_tally (0, never NULL), and the last 10 roster-log events as NAMES. No '
  'user id, slot, party id or hunt id in any answer. The ONLY client read path to '
  'party_hunt_roster_log. Rate bucket party_hunt_view (20/min).';

-- ── §5 hr_party_view — RESTATED WITHOUT share_bp / xp / gold (A2) ───────────
create or replace function public.hr_party_view(p_party uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean := false;
  v_out jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not public.hr_rpc_gate('party') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_party is null then
    return jsonb_build_object('ok', false, 'error', 'bad_party');
  end if;

  -- THE MEMBERSHIP FENCE. Only the caller's OWN characters are consulted.
  select exists (select 1 from public.player_state ps
                  where ps.user_id = v_uid
                    and public.hr_party_of(v_uid, ps.slot) = p_party)
    into v_ok;
  if not v_ok then
    -- One refusal for "no such party" and "not your party" alike: a
    -- distinguishable pair would answer "does party <uuid> exist".
    return jsonb_build_object('ok', false, 'error', 'not_in_party');
  end if;

  select jsonb_build_object('ok', true, 'party_id', p_party,
           'members', coalesce(jsonb_agg(r.row order by r.joined_at, r.user_id), '[]'::jsonb))
    into v_out
    from (
      select m.joined_at, m.user_id,
             -- FROZEN at five keys (2026-10-15: share_bp / xp / gold retired in
             -- favour of hr_party_hunt_view, which owns the hunt's numbers).
             jsonb_build_object(
               'name',             coalesce(pr.display_name, 'Adventurer'),
               'combat_level',     public.hr_party_level(m.user_id, m.slot),
               'hp',               ps.hp,
               'hp_max',           ps.max_hp,
               'recovering_until', ps.recovering_until) as row
        from public.party_member m
        join public.player_state ps on ps.user_id = m.user_id and ps.slot = m.slot
        left join public.profiles pr on pr.id = m.user_id
       where m.party_id = p_party and m.left_at is null
    ) r;

  return v_out;
end $fn$;
comment on function public.hr_party_view(uuid) is
  'M8 S1 (2026-09-23), Security S-7. THE roster read. Refuses any caller who is not a '
  'live member. FROZEN column set, an equality: name, combat_level, hp, hp_max, '
  'recovering_until (2026-10-15: share_bp/xp/gold retired; the hunt''s numbers are '
  'hr_party_hunt_view''s). Never inventory, never a gold BALANCE, never the ledger, '
  'never activity detail. A column added here is a code change with a review.';

-- ── §6 GRANTS (revoke first) AND THE BASELINE ROWS ─────────────────────────
revoke execute on function public.hr_party_hunt_view(integer) from public;
do $$
begin
  execute 'revoke execute on function public.hr_party_hunt_view(integer) from anon, authenticated, service_role, hr_engine, hr_tick';
  execute 'revoke execute on function public.hr_party_view(uuid) from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;
grant execute on function public.hr_party_hunt_view(integer) to authenticated;
grant execute on function public.hr_party_view(uuid) to authenticated;

delete from public.hr_client_rpc_baseline
 where proname in ('hr_party_hunt_view', 'hr_party_view') and grantee = 'authenticated';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_party_hunt_view',
   pg_get_function_identity_arguments('public.hr_party_hunt_view(integer)'::regprocedure),
   'authenticated',
   'added 2026-10-15 (party-hunt-view, Game Designer A1): the member-only read of the '
   'party hunt. Caller surface: ONE OF THEIR OWN SLOTS — the party is hr_party_of(auth.uid(), '
   'slot), so no party id, hunt id, user or name can be supplied and a non-member, '
   'ex-member or member of another party reads not_in_party and nothing else. Answers '
   'the live (else most recent) hunt, each live member''s state (hunting / camping / '
   'rejoining / camping_today / ended, judged on the server''s rows and clock), their '
   'per-hunt xp / gold / kills from party_hunt_tally (an aggregate of the ledger, 0 never '
   'NULL) and xp split, and the last 10 party_hunt_roster_log rows as display NAMES. No '
   'user id, slot, party id or hunt id in any answer (stopped_by is cut at '':'' because '
   'the settle writes member_unpayable:<uuid>). The ONLY client read path to '
   'party_hunt_roster_log, which keeps zero policies. Writes nothing but hr_rpc_gate''s '
   'own counter (VOLATILE, for that reason). Rate-gated on its OWN bucket '
   'party_hunt_view at 20/min (10 s live poll = 6/min, 3.3x headroom), so polling never '
   'spends the party verbs'' 12/min.'),
  ('hr_party_view',
   pg_get_function_identity_arguments('public.hr_party_view(uuid)'::regprocedure),
   'authenticated',
   'added 2026-09-23 (M8 S1, Security S-7): THE roster read. Refuses any caller who is '
   'not a live member of the party named, checked against the CALLER''S OWN characters '
   'only. Returns a FROZEN column set per live member: display name, combat level, hp, '
   'hp_max, recovering_until. 2026-10-15 (party-hunt-view, A2): share_bp / xp / gold '
   'RETIRED — they answered NULL since S1 and the hunt''s numbers are '
   'hr_party_hunt_view''s; the set is still asserted as an EQUALITY. NEVER inventory, '
   'never a gold BALANCE, never the ledger, never activity detail. A uuid the caller is '
   'not a member of answers not_in_party — the same string as one that never existed. '
   'VOLATILE since 2026-09-26 (the rate counter is a write). Rate-gated on the `party` '
   'bucket at 12/min, shared with the five membership verbs.');

-- ── §7 SELF-CHECK — ASSERTED BY EXECUTION; every fixture row rolled back ────
-- k1  hr_party_hunt_view: SECURITY DEFINER, VOLATILE, pinned search_path,
--     authenticated ONLY (anon / service_role / hr_engine / hr_tick refused),
--     baselined exactly once at its installed identity args
-- k2  party_hunt_roster_log: RLS forced, ZERO policies, no client privilege
-- k3  party_hunt_tally: RLS forced, ZERO policies, no client/engine privilege;
--     the trigger is attached, enabled, row-level AFTER INSERT with its WHEN,
--     and its function is executable by no role
-- k4  the gate: hr_rpc_gate admits party_hunt_view; 'party' is still 12; the
--     view calls the gate BEFORE it resolves the party
-- k6  no client-executable function is STABLE/IMMUTABLE; grant hygiene green
-- v-*  behaviour, on a fixture through the REAL settle (combat armed inside the
--     rolled-back block): two parties (Ash/Bram/Cora; Dain/Esme), an outsider
--     (Finn).
--   v-start     before any window: three hunters, xp/gold/kills 0 (never
--               NULL), no events, channel_open, the live hunt's fields
--   v-attended  Ash stays present (fresh anchor) while Bram is away: Ash's
--               own windows land in the view as they are paid, share = the
--               window's xp split, hunt.kills sums the tally
--   v-away      Bram past R + cap is dropped by the settle → 'camping' with
--               camped_at, share 0, earning nothing; his mark moving while
--               his horizon is spent is still 'camping'; after a real return
--               (own mark moved, anchor now) → 'rejoining'; the next paid
--               window rejoins → 'hunting'; events, newest first, as names
--   v-clamp     dropped 3 times today → 'camping_today'
--   v-failsafe  an overflowing party ledger row COMMITS, tally untouched
--   v-conserve  every member's tally equals Σ xp_in / gold_in / meta.kills of
--               their ledger rows for the hunt; a row naming another party's
--               hunt is not tallied anywhere
--   v-ended     an ended hunt: 'ended' for everyone, stopped_by cut at ':'
--   v-nonmember an outsider, an ex-member, an unowned slot and a bad slot read
--               a refusal and nothing else; unsigned reads not_signed_in
--   v-isolate   a member of one party sees no name of the other
--   v-ids       no answer read anywhere above contains a uuid
--   v-rate      the 21st read inside a minute answers rate_limited
--   k5          hr_party_view's member row is EXACTLY the five keys
do $chk$
declare
  v_a  constant uuid := '00000000-0000-4000-c000-0000f7a01501';
  v_b  constant uuid := '00000000-0000-4000-c000-0000f7a01502';
  v_c  constant uuid := '00000000-0000-4000-c000-0000f7a01503';
  v_d  constant uuid := '00000000-0000-4000-c000-0000f7a01504';
  v_e  constant uuid := '00000000-0000-4000-c000-0000f7a01505';
  v_f  constant uuid := '00000000-0000-4000-c000-0000f7a01506';
  c_h  constant text := 'hr1015-phv-selfcheck';
  c_cap constant interval := interval '12 hours';
  c_uuid constant text := '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  v_src  text; v_gate text; v_cfg text[]; v_n bigint; v_i int;
  v_cact text; v_party uuid; v_party2 uuid; v_hunt uuid; v_hunt2 uuid;
  v_mark timestamptz; v_to timestamptz;
  v_r jsonb; v_all text := ''; v_members jsonb; v_row jsonb;
  v_en boolean; v_ch text[]; v_ar text[]; v_fk text[];
  v_en2 boolean; v_ch2 text[]; v_ar2 text[]; v_fk2 text[];
  t text;
begin
  -- ── k1
  select p.prosrc, p.proconfig into v_src, v_cfg from pg_proc p
   where p.oid = 'public.hr_party_hunt_view(integer)'::regprocedure;
  v_src := replace(v_src, chr(13), '');
  if not (select p.prosecdef and p.provolatile = 'v' from pg_proc p
           where p.oid = 'public.hr_party_hunt_view(integer)'::regprocedure) then
    raise exception 'party-hunt-view §7 k1: hr_party_hunt_view is not SECURITY DEFINER + VOLATILE'; end if;
  if v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'party-hunt-view §7 k1: hr_party_hunt_view proconfig is %, not the pinned search_path', v_cfg; end if;
  foreach t in array array['anon', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = t)
       and has_function_privilege(t, 'public.hr_party_hunt_view(integer)', 'execute') then
      raise exception 'party-hunt-view §7 k1: % can EXECUTE hr_party_hunt_view — it is authenticated ONLY', t; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_party_hunt_view(integer)', 'execute') then
    raise exception 'party-hunt-view §7 k1: authenticated cannot EXECUTE hr_party_hunt_view'; end if;
  if (select count(*) from public.hr_client_rpc_baseline b
       where b.proname = 'hr_party_hunt_view' and b.grantee = 'authenticated'
         and b.identity_args = pg_get_function_identity_arguments('public.hr_party_hunt_view(integer)'::regprocedure)) <> 1
     or (select count(*) from public.hr_client_rpc_baseline b where b.proname = 'hr_party_hunt_view') <> 1 then
    raise exception 'party-hunt-view §7 k1: hr_client_rpc_baseline does not hold exactly one approved hr_party_hunt_view row'; end if;

  -- ── k2
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid = 'public.party_hunt_roster_log'::regclass)
     or exists (select 1 from pg_policy where polrelid = 'public.party_hunt_roster_log'::regclass) then
    raise exception 'party-hunt-view §7 k2: party_hunt_roster_log must stay RLS-forced with ZERO policies — the view is its only client read path'; end if;
  foreach t in array array['anon', 'authenticated'] loop
    if has_table_privilege(t, 'public.party_hunt_roster_log', 'select') then
      raise exception 'party-hunt-view §7 k2: % can SELECT party_hunt_roster_log', t; end if;
  end loop;

  -- ── k3
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid = 'public.party_hunt_tally'::regclass)
     or exists (select 1 from pg_policy where polrelid = 'public.party_hunt_tally'::regclass) then
    raise exception 'party-hunt-view §7 k3: party_hunt_tally must be RLS-forced with ZERO policies'; end if;
  foreach t in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = t) then
      if has_table_privilege(t, 'public.party_hunt_tally', 'select,insert,update,delete,truncate') then
        raise exception 'party-hunt-view §7 k3: % holds a privilege on party_hunt_tally', t; end if;
      if has_function_privilege(t, 'public.hr_party_hunt_tally_on_ledger()', 'execute') then
        raise exception 'party-hunt-view §7 k3: % can EXECUTE the tally trigger function', t; end if;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger g
                  where g.tgrelid = 'public.player_ledger'::regclass
                    and g.tgname = 'hr_party_hunt_tally' and not g.tgisinternal
                    and g.tgenabled = 'O'
                    and g.tgfoid = 'public.hr_party_hunt_tally_on_ledger()'::regprocedure
                    and pg_get_triggerdef(g.oid) like '%AFTER INSERT%FOR EACH ROW WHEN ((new.meta ? ''party''::text))%') then
    raise exception 'party-hunt-view §7 k3: the tally trigger is not attached as AFTER INSERT FOR EACH ROW WHEN (meta ? party): %',
      (select pg_get_triggerdef(g.oid) from pg_trigger g
        where g.tgrelid = 'public.player_ledger'::regclass and g.tgname = 'hr_party_hunt_tally'); end if;

  -- ── k4
  select replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '') into v_gate;
  if position('when ''party_hunt_view'' then v_limit := 20;' in v_gate) = 0
     or position('when ''party'' then v_limit := 12;' in v_gate) = 0 then
    raise exception 'party-hunt-view §7 k4: hr_rpc_gate must admit party_hunt_view at 20 and keep party at 12'; end if;
  if position('hr_rpc_gate(''party_hunt_view'')' in v_src) = 0
     or position('hr_rpc_gate(''party_hunt_view'')' in v_src) > position('hr_party_of(' in v_src) then
    raise exception 'party-hunt-view §7 k4: hr_party_hunt_view must call hr_rpc_gate(''party_hunt_view'') before it resolves the party'; end if;

  -- ── k6
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.provolatile <> 'v'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));
  if v_n <> 0 then
    raise exception 'party-hunt-view §7 k6: % client-executable function(s) are STABLE/IMMUTABLE (PostgREST runs them READ ONLY)', v_n; end if;
  perform public.hr_assert_grant_hygiene(true);

  select enabled, channels, armed_channels, frame_keys into v_en, v_ch, v_ar, v_fk
    from public.hr_tick_config where id;
  if not found then raise exception 'party-hunt-view §7: hr_tick_config has no row'; end if;

  begin
    -- ── THE FIXTURE (m4-party-horizon's, plus a second party and an outsider)
    perform set_config('hr.frame_origin', '', true);
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'],
           frame_keys = array['state','skills','buffs','place'] where id;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'party-hunt-view §7: hr_activities has no combat row'; end if;
    v_mark := date_trunc('second', now()) - interval '5 minutes';
    v_to   := v_mark + interval '90 seconds';
    insert into auth.users (id) values (v_a), (v_b), (v_c), (v_d), (v_e), (v_f) on conflict do nothing;
    insert into public.profiles (id, display_name)
    select u, nm from unnest(array[v_a, v_b, v_c, v_d, v_e, v_f],
                             array['Ash', 'Bram', 'Cora', 'Dain', 'Esme', 'Finn']) as x(u, nm)
    on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since, consec_falls)
    select u, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 0
      from unnest(array[v_a, v_b, v_c, v_d, v_e, v_f]) u;
    insert into public.hr_return_anchor (user_id, slot, real_return_at)
    select u, 0, now() - interval '1 hour' from unnest(array[v_a, v_b, v_c, v_d, v_e]) u
    on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    select u, 0, 'combat', true from unnest(array[v_a, v_b, v_c, v_d, v_e]) u
    on conflict (user_id, slot, channel) do update set owned = true;
    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_party, v_a, 0, 'leader', now() - interval '3 hours'),
           (v_party, v_b, 0, 'member', now() - interval '2 hours'),
           (v_party, v_c, 0, 'member', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_mark)
      returning id into v_hunt;
    insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
    values (v_party, true, c_h, now() + interval '5 minutes')
    on conflict (party_id) do update set owned = true, lease_holder = c_h, lease_until = now() + interval '5 minutes';
    insert into public.party (leader_user, leader_slot) values (v_d, 0) returning id into v_party2;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_party2, v_d, 0, 'leader', now() - interval '3 hours'),
           (v_party2, v_e, 0, 'member', now() - interval '2 hours');
    insert into public.party_hunt (party_id, active_id, accrued_to, started_at) values (v_party2, v_cact, v_mark, now())
      returning id into v_hunt2;

    -- ── v-start (as Ash)
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    if coalesce(v_r->>'ok', '') <> 'true' or coalesce(v_r->>'channel_open', '') <> 'true'
       or v_r#>>'{hunt,active_id}' is distinct from v_cact
       or coalesce(v_r#>>'{hunt,live}', '') <> 'true'
       or (v_r#>>'{hunt,kills}')::bigint is distinct from 0
       or jsonb_array_length(v_r->'members') <> 3
       or jsonb_array_length(v_r->'events') <> 0
       or exists (select 1 from jsonb_array_elements(v_r->'members') m
                   where m->>'state' <> 'hunting'
                      or jsonb_typeof(m->'xp') <> 'number' or jsonb_typeof(m->'gold') <> 'number'
                      or jsonb_typeof(m->'kills') <> 'number' or jsonb_typeof(m->'share_bp') <> 'number'
                      or (m->>'xp')::bigint <> 0 or (m->>'gold')::bigint <> 0)
       or (select array_agg(m->>'name' order by o) from jsonb_array_elements(v_r->'members') with ordinality x(m, o))
          is distinct from array['Ash', 'Bram', 'Cora']
       or (select count(*) from jsonb_array_elements(v_r->'members') m where (m->>'me')::boolean) <> 1
       or v_r#>>'{members,0,me}' <> 'true' then
      raise exception 'party-hunt-view §7 v-start: the live hunt before any window is not three hunters at zero (never NULL), no events, channel open: %', v_r; end if;

    -- ── v-away (1): Bram past R + cap is dropped by the REAL settle's probe.
    update public.hr_return_anchor set real_return_at = now() - c_cap - interval '1 hour'
     where user_id = v_b and slot = 0;
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark - interval '90 seconds', v_mark,
             gen_random_uuid(), jsonb_build_array(jsonb_build_object('user', v_a, 'slot', 0)));
    reset role;
    if v_r->>'error' is distinct from 'member_sat_out' or (v_r#>>'{dropped,0,user}')::uuid is distinct from v_b then
      raise exception 'party-hunt-view §7 fixture: the settle did not drop Bram past_horizon: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    select m into v_row from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram';
    if v_row->>'state' is distinct from 'camping' or v_row->>'camped_at' is null
       or (v_row->>'me')::boolean is not true or (v_row->>'share_bp')::int <> 0
       or (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Ash') <> 'hunting'
       or jsonb_array_length(v_r->'events') <> 1
       or v_r#>>'{events,0,kind}' is distinct from 'drop' or v_r#>>'{events,0,name}' is distinct from 'Bram'
       or v_r#>>'{events,0,reason}' is distinct from 'past_horizon' then
      raise exception 'party-hunt-view §7 v-away: a member the settle dropped past their horizon does not read camping (with camped_at, share 0, a named drop event): %', v_r; end if;

    -- ── v-attended: Ash and Cora are paid window 1 while Ash is present.
    v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', ps.version,
                     'delta', jsonb_build_object('gold', 3, 'xp', jsonb_build_object('attack', 10),
                       'accrued_to', v_to,
                       'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                         'meta', jsonb_build_object('src', 'tick', 'ticks', 1, 'kills', 2,
                           'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000,
                             'xp_bp', 5000, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                    from unnest(array[v_a, v_c]) u
                    join public.player_state ps on ps.user_id = u and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
    reset role;
    if coalesce(v_r->>'paid', 'false') <> 'true' then
      raise exception 'party-hunt-view §7 fixture: window 1 was not paid: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    select m into v_row from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Ash';
    if v_row->>'state' is distinct from 'hunting' or (v_row->>'me')::boolean is not true
       or (v_row->>'xp')::bigint <> 10 or (v_row->>'gold')::bigint <> 3 or (v_row->>'kills')::bigint <> 2
       or (v_row->>'share_bp')::int <> 5000
       or (v_r#>>'{hunt,kills}')::bigint <> 4
       or (select (m->>'xp')::bigint from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') <> 0
       or (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') <> 'camping' then
      raise exception 'party-hunt-view §7 v-attended: a present hunter''s paid window is not what the view reads (xp 10, gold 3, kills 2, share 5000, hunt kills 4; Bram camping at 0): %', v_r; end if;

    -- ── v-away (2): Bram RETURNS — own mark moved (their solo path priced
    --    them; written under the tick marker so the stamp trigger leaves R),
    --    then a real return stamps R.
    perform set_config('hr.frame_origin', 'tick', true);
    update public.player_state set accrued_to = v_mark + interval '30 seconds' where user_id = v_b and slot = 0;
    perform set_config('hr.frame_origin', '', true);
    -- The mark moved but R is still past its horizon: the settle would NOT
    -- rejoin ((10)(i)), so the view must not promise it.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    if (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') is distinct from 'camping' then
      raise exception 'party-hunt-view §7 v-away: a dropped member whose horizon is still spent reads % (the settle will not rejoin them): %',
        (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram'), v_r; end if;
    update public.hr_return_anchor set real_return_at = now() where user_id = v_b and slot = 0;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    if (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') is distinct from 'rejoining' then
      raise exception 'party-hunt-view §7 v-away: a dropped member back inside their horizon with their mark moved does not read rejoining: %', v_r; end if;
    -- Window 2 rejoins Bram.
    v_members := (select jsonb_agg(jsonb_set(jsonb_set(jsonb_set(m, '{version}', to_jsonb(ps.version)),
                     '{delta,accrued_to}', to_jsonb(v_to + interval '90 seconds')),
                     '{delta,journal,meta,party,xp_bp}', to_jsonb(5000)))
                    from jsonb_array_elements(v_members) m
                    join public.player_state ps on ps.user_id = (m->>'user')::uuid and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_to, v_to + interval '90 seconds', gen_random_uuid(), v_members);
    reset role;
    if coalesce(v_r->>'paid', 'false') <> 'true' or jsonb_array_length(coalesce(v_r->'rejoined', '[]'::jsonb)) <> 1 then
      raise exception 'party-hunt-view §7 fixture: window 2 did not rejoin Bram: %', v_r; end if;
    -- Window 3 pays all three, Bram included, at a three-way split.
    v_members := (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', ps.version,
                     'delta', jsonb_build_object('gold', 3, 'xp', jsonb_build_object('attack', 10),
                       'accrued_to', v_to + interval '180 seconds',
                       'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                         'meta', jsonb_build_object('src', 'tick', 'ticks', 1, 'kills', 1,
                           'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 3334,
                             'xp_bp', 3334, 'floor', 0, 'fellow_bp', 0, 'roll', 1))))) order by u)
                    from unnest(array[v_a, v_b, v_c]) u
                    join public.player_state ps on ps.user_id = u and ps.slot = 0);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_to + interval '90 seconds', v_to + interval '180 seconds',
             gen_random_uuid(), v_members);
    reset role;
    if coalesce(v_r->>'paid', 'false') <> 'true' then
      raise exception 'party-hunt-view §7 fixture: window 3 was not paid: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    select m into v_row from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram';
    if v_row->>'state' is distinct from 'hunting' or v_row->>'camped_at' is not null
       or (v_row->>'xp')::bigint <> 10 or (v_row->>'share_bp')::int <> 3334
       or (v_r#>>'{hunt,kills}')::bigint <> 2 + 2 + 2 + 2 + 3
       or jsonb_array_length(v_r->'events') <> 2
       or v_r#>>'{events,0,kind}' is distinct from 'rejoin' or v_r#>>'{events,0,name}' is distinct from 'Bram'
       or v_r#>>'{events,1,kind}' is distinct from 'drop' then
      raise exception 'party-hunt-view §7 v-away: after the rejoin and a paid window Bram does not read hunting with his own share (events rejoin, drop — newest first): %', v_r; end if;

    -- ── v-conserve: the tally IS the ledger, per member, for this hunt.
    if exists (
         select 1 from (values (v_a), (v_b), (v_c)) u(id)
          left join public.party_hunt_tally t on t.hunt_id = v_hunt and t.user_id = u.id and t.slot = 0
          cross join lateral (
            select coalesce(sum(l.xp_in), 0) as xp, coalesce(sum(l.gold_in), 0) as gold,
                   coalesce(sum((l.meta->>'kills')::bigint), 0) as kills, count(*) as n
              from public.player_ledger l
             where l.user_id = u.id and l.slot = 0 and l.meta->'party'->>'hunt' = v_hunt::text) s
          where (coalesce(t.xp, 0), coalesce(t.gold, 0), coalesce(t.kills, 0), coalesce(t.windows, 0))
                is distinct from (s.xp, s.gold, s.kills, s.n)) then
      raise exception 'party-hunt-view §7 v-conserve: party_hunt_tally disagrees with the ledger for this hunt'; end if;
    -- ── v-failsafe (Security GO-WITH-CHANGES #1): an engine-authored party row
    --    whose kills / xp_bp overflow every integer type must still COMMIT —
    --    the tally is display data and may never refuse a payout — and leave
    --    the tally untouched (the overflowing row is skipped, not half-folded).
    select to_jsonb(tt) into v_row from public.party_hunt_tally tt
     where tt.hunt_id = v_hunt and tt.user_id = v_a and tt.slot = 0;
    select count(*) into v_n from public.player_ledger where user_id = v_a;
    begin
      insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
      values (v_a, 0, 'combat', 'accrue', 5, 5, 5, 0,
              jsonb_build_object('src', 'tick', 'kills', 1e30::numeric,
                'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 0,
                  'xp_bp', 1e30::numeric, 'floor', 0, 'fellow_bp', 0, 'roll', 1)));
    exception when others then
      raise exception 'party-hunt-view §7 v-failsafe: a party ledger row with overflowing kills/xp_bp was REFUSED (%: %) — the tally trigger would fail the whole settle payout', sqlstate, sqlerrm;
    end;
    if (select count(*) from public.player_ledger where user_id = v_a) <> v_n + 1 then
      raise exception 'party-hunt-view §7 v-failsafe: the overflowing party ledger row did not commit'; end if;
    if (select to_jsonb(tt) from public.party_hunt_tally tt
         where tt.hunt_id = v_hunt and tt.user_id = v_a and tt.slot = 0) is distinct from v_row then
      raise exception 'party-hunt-view §7 v-failsafe: the overflowing row moved the tally (it must be skipped whole)'; end if;

    -- A ledger row naming ANOTHER party's hunt is tallied nowhere.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
    values (v_a, 0, 'combat', 'accrue', 7, 7, 7, 0,
            jsonb_build_object('src', 'tick', 'kills', 7,
              'party', jsonb_build_object('id', v_party, 'hunt', v_hunt2, 'dmg_bp', 0,
                'xp_bp', 0, 'floor', 0, 'fellow_bp', 0, 'roll', 1)));
    if exists (select 1 from public.party_hunt_tally where hunt_id = v_hunt2) then
      raise exception 'party-hunt-view §7 v-conserve: a ledger row naming another party''s hunt was TALLIED into it'; end if;

    -- ── v-clamp: Bram dropped three times today by this party (two synthetic
    --    drops on top of the real one, the latest a drop) → camping_today.
    insert into public.party_hunt_roster_log (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
    select public.hr_utc_day_key(now()), v_party, v_hunt, v_b, 0, 'drop', 'past_horizon',
           v_to + interval '180 seconds', 43200000, 2
      from generate_series(1, 2);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    if (select m->>'state' from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') is distinct from 'camping_today'
       or (select (m->>'share_bp')::int from jsonb_array_elements(v_r->'members') m where m->>'name' = 'Bram') <> 0 then
      raise exception 'party-hunt-view §7 v-clamp: a member held out by the 3/day clamp does not read camping_today: %', v_r; end if;

    -- ── v-ended + v-isolate (as Dain): the second party's hunt ended with the
    --    settle's member_unpayable:<uuid> stamp.
    update public.party_hunt set ended_at = now(), stopped_by = 'member_unpayable:' || v_e::text
     where id = v_hunt2;
    perform set_config('request.jwt.claim.sub', v_d::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    v_all := v_all || v_r::text;
    if coalesce(v_r->>'ok', '') <> 'true'
       or v_r#>>'{hunt,stopped_by}' is distinct from 'member_unpayable'
       or coalesce(v_r#>>'{hunt,live}', '') <> 'false' or v_r#>>'{hunt,ended_at}' is null
       or exists (select 1 from jsonb_array_elements(v_r->'members') m where m->>'state' <> 'ended')
       or jsonb_array_length(v_r->'members') <> 2 then
      raise exception 'party-hunt-view §7 v-ended: an ended hunt does not read ended for everyone with stopped_by cut at '':'': %', v_r; end if;
    if v_r::text ~ '(Ash|Bram|Cora)' or (v_r#>>'{hunt,kills}')::bigint <> 0 then
      raise exception 'party-hunt-view §7 v-isolate: a member of one party read the other party: %', v_r; end if;

    -- ── v-nonmember
    perform set_config('request.jwt.claim.sub', v_f::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'not_in_party') then
      raise exception 'party-hunt-view §7 v-nonmember: an outsider read %', v_r; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(1);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'not_in_party') then
      raise exception 'party-hunt-view §7 v-nonmember: a member''s OTHER slot read %', v_r; end if;
    set local role authenticated;
    v_r := public.hr_party_hunt_view(9);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'bad_slot') then
      raise exception 'party-hunt-view §7 v-nonmember: slot 9 answered %', v_r; end if;
    update public.party_member set left_at = now() where party_id = v_party and user_id = v_c;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'not_in_party') then
      raise exception 'party-hunt-view §7 v-nonmember: an ex-member read %', v_r; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    set local role authenticated;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'not_signed_in') then
      raise exception 'party-hunt-view §7 v-nonmember: an unsigned call answered %', v_r; end if;

    -- ── v-ids: no answer above carried any uuid.
    if v_all ~ c_uuid then
      raise exception 'party-hunt-view §7 v-ids: an answer carried a uuid: %', substring(v_all from c_uuid); end if;

    -- ── k5: hr_party_view's member row is EXACTLY five keys.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    v_r := public.hr_party_view(v_party);
    reset role;
    if coalesce(v_r->>'ok', '') <> 'true'
       or (select array_agg(k order by k) from jsonb_object_keys(v_r->'members'->0) k)
          is distinct from array['combat_level','hp','hp_max','name','recovering_until'] then
      raise exception 'party-hunt-view §7 k5: hr_party_view''s member row is not exactly the five frozen keys: %', v_r; end if;

    -- ── v-rate: 20 reads inside a minute pass, the 21st is rate_limited.
    delete from public.hr_rate_counters where user_id = v_a;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    for v_i in 1..20 loop
      v_r := public.hr_party_hunt_view(0);
      if coalesce(v_r->>'ok', '') <> 'true' then
        reset role;
        raise exception 'party-hunt-view §7 v-rate: read % of 20 was refused: %', v_i, v_r; end if;
    end loop;
    v_r := public.hr_party_hunt_view(0);
    reset role;
    if v_r is distinct from jsonb_build_object('ok', false, 'error', 'rate_limited') then
      raise exception 'party-hunt-view §7 v-rate: the 21st read inside a minute answered %', v_r; end if;

    raise exception using errcode = 'HR952', message = 'party-hunt-view §7 complete — rolling back';
  exception when sqlstate 'HR952' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  select enabled, channels, armed_channels, frame_keys into v_en2, v_ch2, v_ar2, v_fk2
    from public.hr_tick_config where id;
  if v_en2 is distinct from v_en or v_ch2 is distinct from v_ch or v_ar2 is distinct from v_ar
     or v_fk2 is distinct from v_fk then
    raise exception 'party-hunt-view §7: hr_tick_config was not restored'; end if;
  if exists (select 1 from auth.users where id in (v_a, v_b, v_c, v_d, v_e, v_f))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c, v_d, v_e, v_f))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b, v_c, v_d, v_e, v_f))
     or exists (select 1 from public.party_hunt_tally where user_id in (v_a, v_b, v_c, v_d, v_e, v_f))
     or exists (select 1 from public.party where leader_user in (v_a, v_d))
     or exists (select 1 from public.hr_rate_counters where user_id in (v_a, v_b, v_c, v_d, v_e, v_f))
     or exists (select 1 from public.hr_rejections where user_id in (v_a, v_b, v_c, v_d, v_e, v_f)) then
    raise exception 'party-hunt-view §7: the self-check LEAKED a fixture row'; end if;

  raise notice 'party-hunt-view self-check PASSED: k1 view grants/volatility/baseline; k2 roster log zero-policy; '
               'k3 tally sealed + trigger attached; k4 own 20/min bucket, party still 12, gate first; k5 hr_party_view '
               'five keys; k6 hygiene; v-start, v-attended, v-away (camping → rejoining → hunting), v-clamp, '
               'v-failsafe, v-conserve, v-ended, v-isolate, v-nonmember, v-ids, v-rate';
end $chk$;
