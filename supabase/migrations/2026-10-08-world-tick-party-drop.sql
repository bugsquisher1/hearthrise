-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-world-tick-party-drop.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half
-- (edge freeze; every new answer is an `ok:false` the driver already counts by
-- name). Applies AFTER 2026-10-08-world-tick-party-fences.sql (APPLIED
-- 2026-10-07 00:38 UTC), whose hr_party_tick_settle §0 measures.
--
-- WHAT IT ANSWERS. The Security review of party-fences @36cd57a5
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, latest verdict: "combat
-- ARM is NO-GO until (c) lands") and the Game Designer's ruling (final):
--   when a party member is fenced (own mark > 24 h old, or past their own
--   offline cap), DROP ONLY THAT MEMBER from the hunt and keep paying the rest.
--   Server-side, inside the settle transaction, before pricing, on the server
--   clock. They stay in the party but leave the hunt roster; the window is
--   priced for the remaining hunters; their own solo roster prices their time
--   up to their own cap (the hr_party_kick boundary rule, SEC_PARTIES_M8); they
--   rejoin at the next fire with accrued_to = now(), no back pay; under 2
--   hunters ends the hunt and everyone goes solo.
-- Until this file the fence REFUSED THE WHOLE WINDOW every fire (party-fences
-- §2), so one member's absence froze three other players' hunt (G2 made it
-- sticky). This replaces the freeze with the drop.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 public.party_hunt_roster_log — NEW, APPEND-ONLY. One row per drop and per
--    rejoin: party, hunt, member, event, reason, the member's mark, the cap,
--    hunters left, server time + server day key. It is ALSO the state: a member
--    is SAT OUT of a hunt iff their latest row for that hunt is a 'drop'. One
--    source, so the state and its audit cannot disagree. RLS on AND forced,
--    zero policies, every privilege revoked from every client and engine role;
--    written only by hr_party_tick_settle (SECURITY DEFINER), and nothing in
--    the schema UPDATEs or DELETEs it (§7 k0 asserts that over every body).
-- §2 hr_party_sat_out(hunt, user, slot) -> boolean — the one reading of that
--    state. Owner-only (no role is granted it); read by §3, §4 and §5.
-- §3 hr_partied, restated from LIVE (prosrc md5 b8defeca) with one predicate:
--    a member sat out of the live hunt is NOT partied. Every solo door
--    (accrue, the solo tick roster, settle-first) therefore serves them, from
--    their own mark, on their own cap — exactly what a kick or a leave does.
-- §4 hr_party_roster, restated from LIVE (915ba98d) with one predicate in two
--    places: the member list and the character count are the HUNTERS (live and
--    not sat out). The driver prices only what this hands it (c)(2).
-- §5 hr_party_tick_settle, restated from LIVE (2aa22e7d, the party-fences
--    body) with three deltas:
--    (3c) THE DROP — armed only, after the lease and mode reads, BEFORE the
--         CAS, so the driver's write-nothing probe is where it happens and no
--         window is ever priced with the dropped member in it. Judged per
--         hunter on that hunter's LOCKED player_state row and own
--         hr_offline_cap_ms against now() alone (c)(1). Writes the journal
--         (c)(5), hands the leader role on (c)(6), ends the hunt below two
--         hunters (c)(6). Writes no player_state and no ledger row (c)(3)(4).
--    (6)  the declared set must EQUAL the hunter set (c)(2); a dropped member
--         named in it is refused as any non-member always was.
--    (10) THE REJOIN — only after a paid armed window; forward-only to the
--         hunt's new mark, only once the member's own solo path has priced
--         them past the drop, never over a mark past the window, solo leases
--         expired, clamped per day (c)(4)(5)(7).
--    The (8b)(8c) whole-window fences stay VERBATIM as the backstop for the
--    <= 60 s a window may end past now() (step 2's skew).
--
-- ── ERROR TAXONOMY (hr_party_tick_settle, new; all paid:false, mode:'armed') ─
--   member_sat_out    one or more hunters dropped; >= 2 remain. Nothing paid
--                     this call; the next fire prices the remaining hunters.
--                     {dropped:[{user,slot,reason,accrued_to,cap_ms}], hunters,
--                      leader_handoff}
--   party_hunt_ended  dropping left < 2 hunters; the hunt ended
--                     (stopped_by 'too_few_hunters'). {why, dropped, hunters}
--   party_busy        a drop was due but the party row was locked by a verb;
--                     NOTHING written, judged again next fire.
--   success adds      rejoined:[{user,slot}]
-- The edge (unchanged, edge freeze) answers any probe refusal other than
-- party_window_already_settled as `skipped` with that reason, and any settle
-- refusal as `refused` with that reason: all three are counted by name.
--
-- ── PLAYER COPY (Game Designer, final) — for the party surface ─────────────
--   member_sat_out (to the party): "<name> has been away too long and sat out
--     of the hunt. The rest of you are still earning."
--   to the returner: "You were away past your offline limit, so the party kept
--     hunting without you. You'll rejoin at the next fire."
--   party_hunt_ended: "The hunt ended: too few hunters left. You're back to solo."
--   No client surface shows party HUNT status yet (src/render/party-panel.js:
--   "Hunting together arrives in a later build"), so no client string ships
--   here; the journal row is what that surface will read.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Lock order is unchanged: party_hunt FOR UPDATE, party_tick_lease FOR
--   UPDATE, then hunters' player_state in (user_id, slot) order — (3c) takes
--   them in that order, (4)(5b) re-takes the same rows. Everything the drop and
--   the rejoin add beyond those is SKIP LOCKED and never waited on: the party
--   row (verbs take party -> party_hunt, the reverse of this function), the
--   rejoiner's party_member, player_state and hr_tick_ownership rows. A busy
--   row defers to the next fire; nothing can deadlock and nothing half-writes
--   (every refusal returns before any write, every write path returns whole).
--   IDEMPOTENCY: a drop is a state transition — the second probe of the same
--   fire sees the member sat out and judges only the hunters left; a rejoin
--   moves the member's mark past their drop mark only once per drop.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   No client grant, policy or RPC changes; the new table and helper are
--   readable by no role but the owner. Every number the drop judges is a
--   locked row or a server function of the server clock; the caller (hr_engine,
--   the edge) can name a party and a window and nothing else, and a forged
--   member list cannot drop anyone (the hunter set is read from party_member).
--   The only value-adjacent write is the rejoin's forward move of accrued_to,
--   bounded above by p_window_to (<= now() + 60 s, step 2) and below by a mark
--   the member's own solo path already priced; it pays nothing and forfeits.
--   All four bodies' grants are restated exactly (§6); strict hygiene runs (§7).
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   Journal rows: one per drop and one per rejoin. A drop needs a mark >= 12 h
--   stale and the clamp allows 3 per member per party per day, so the bound is
--   ~6 rows/member/day and the expected rate is ~0 (tick outages and griefs
--   only). Per fire: (3c) adds <= 4 locked one-row re-reads and <= 4 cap
--   lookups to an ARMED probe; hr_partied/roster add one index probe per
--   member (party_hunt_roster_log_state, newest-first).
--
-- KNOWN LIMITATIONS
--   · An armed hunt whose mark is > 24 h old is not rostered (hr_party_roster's
--     unchanged 24 h admission), so it is never probed and never dropped; only a
--     tick outage > 24 h reaches it, and the runbook's F1 rule disarms first.
--   · In SHADOW nothing drops or rejoins (nothing is paid there); a member sat
--     out when combat is disarmed stays out until it re-arms or the hunt ends,
--     served solo meanwhile.
--   · The window in which the drop is discovered is skipped, not lost: the mark
--     does not move and the next fire prices it for the remaining hunters.
--
-- REVERSIBILITY: re-apply 2026-10-08-world-tick-party-fences.sql §2 for the
-- settle, and the live bodies of hr_partied / hr_party_roster (restated
-- verbatim from 2026-09-23-m8-parties-s2-1/-s2-2 at their measured md5), then
-- `drop function public.hr_party_sat_out(uuid,uuid,int)` and `drop table
-- public.party_hunt_roster_log`. All `create or replace`, same signatures and
-- grants. Not while combat is armed with a member sat out: reversing §3 makes
-- them partied again with a mark != the hunt's, which the settle refuses
-- (invariant 8) until the hunt is stopped.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE BODIES BEING RESTATED ARE THE ONES MEASURED LIVE ──
-- Each must be the live one (first apply) or this file's own (second apply).
do $$
declare
  v_settle text;
  v_roster text;
  v_partied text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_settle from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)');
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_roster(text[],integer,text,integer,timestamp with time zone,uuid)');
  select md5(replace(p.prosrc, chr(13), '')) into v_partied from pg_proc p
   where p.oid = to_regprocedure('public.hr_partied(uuid,integer)');
  if v_settle is null or v_settle not in ('2aa22e7d25379ed4e5d75e0802488358', '61a739fc33d1c60651ab30d1f7b4e5f4') then
    raise exception 'PRECONDITION: hr_party_tick_settle prosrc md5 is %, expected the live 2aa22e7d '
                    '(party-fences) or this file''s 61a739fc33d1c60651ab30d1f7b4e5f4. Re-cut this file against the live body.', v_settle;
  end if;
  if v_roster is null or v_roster not in ('915ba98d82b486930a70343285791ed1', '4241abd3a13b9f71089df6899d6dd04f') then
    raise exception 'PRECONDITION: hr_party_roster prosrc md5 is %, expected the live 915ba98d '
                    'or this file''s 4241abd3a13b9f71089df6899d6dd04f. Re-cut this file against the live body.', v_roster;
  end if;
  if v_partied is null or v_partied not in ('b8defeca3399f90288bda8b1bab329c2', '3ae4b07cb060fcf0815eeaecca6dad98') then
    raise exception 'PRECONDITION: hr_partied prosrc md5 is %, expected the live b8defeca '
                    'or this file''s 3ae4b07cb060fcf0815eeaecca6dad98. Re-cut this file against the live body.', v_partied;
  end if;
  if to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamp with time zone)') is null
     or to_regprocedure('public.hr_party_leave(integer,uuid)') is null then
    raise exception 'PRECONDITION: hr_offline_cap_ms, hr_tick_admit, hr_utc_day_key or hr_party_leave is absent.';
  end if;
end $$;

-- ── §1 public.party_hunt_roster_log — THE DROP/REJOIN JOURNAL, AND THE STATE ─
create table if not exists public.party_hunt_roster_log (
  id          bigint generated always as identity primary key,
  -- SERVER time and SERVER day key; nothing here is ever client-supplied.
  at          timestamptz not null default now(),
  day_key     text        not null,
  party_id    uuid        not null references public.party(id) on delete cascade,
  hunt_id     uuid        not null references public.party_hunt(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  slot        int         not null check (slot between 0 and 5),
  event       text        not null check (event in ('drop', 'rejoin')),
  reason      text        not null check (reason in ('fenced_24h', 'fenced_cap', 'returned')),
  -- drop: the member's LOCKED mark when judged (= the hunt mark, invariant 8).
  -- rejoin: the mark they were moved to (= the hunt's new mark).
  mark        timestamptz,
  -- rejoin only: their own mark before the move; [member_mark, mark] is the
  -- span forfeited (no back pay).
  member_mark timestamptz,
  cap_ms      bigint,
  -- hunters left after this event.
  hunters     int         not null,
  constraint party_hunt_roster_log_shape check (
    (event = 'drop'   and reason in ('fenced_24h', 'fenced_cap') and member_mark is null)
 or (event = 'rejoin' and reason = 'returned' and mark is not null and member_mark is not null))
);
comment on table public.party_hunt_roster_log is
  '2026-10-08 (world-tick party-drop; Game Designer ruling + SEC_GATHER_ARM_RUNBOOK '
  '(c)1-7). APPEND-ONLY journal of every member a party hunt DROPPED (own mark '
  'past 24 h or past their own offline cap, judged by hr_party_tick_settle on the '
  'locked row and the server clock) and every REJOIN. It is also the state: a '
  'member is sat out of a hunt iff their latest row for it is a drop '
  '(hr_party_sat_out). Written ONLY by hr_party_tick_settle; RLS forced, no '
  'policy, no privilege for any client or engine role; never updated or deleted.';

create index if not exists party_hunt_roster_log_state
  on public.party_hunt_roster_log (hunt_id, user_id, slot, id desc);
create index if not exists party_hunt_roster_log_day
  on public.party_hunt_roster_log (party_id, user_id, slot, day_key);

alter table public.party_hunt_roster_log enable row level security;
alter table public.party_hunt_roster_log force row level security;
-- TABLE PRIVILEGE AND RLS, the house rule (party_settle_boundary): with the
-- privilege left in place a refused write returns zero rows rather than an
-- error, and service_role is BYPASSRLS, so for it the revoke is the only fence.
do $$
begin
  execute 'revoke all on public.party_hunt_roster_log from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

-- ── §2 hr_party_sat_out — THE ONE READING OF THE STATE ─────────────────────
create or replace function public.hr_party_sat_out(p_hunt uuid, p_user uuid, p_slot int)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_catalog'
as $$
  -- The member's LATEST row for this hunt decides: a drop means sat out, a
  -- rejoin (or no row) means hunting. party_hunt_roster_log_state, newest first.
  select coalesce((
    select l.event = 'drop'
      from public.party_hunt_roster_log l
     where l.hunt_id = p_hunt and l.user_id = p_user and l.slot = p_slot
     order by l.id desc
     limit 1), false);
$$;

-- ── §3 hr_partied (a member sat out of the live hunt is not partied) ───────
create or replace function public.hr_partied(p_user uuid, p_slot integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
as $$
  select exists (
    select 1
      from public.party_member m
      join public.party_hunt   h on h.party_id = m.party_id
     where m.user_id = p_user and m.slot = p_slot
       and m.left_at is null and h.ended_at is null
       -- 2026-10-08 party-drop: SAT OUT of this hunt = served solo, from their
       -- own mark, on their own cap (the hr_party_kick boundary rule).
       and not public.hr_party_sat_out(h.id, m.user_id, m.slot));
$$;

-- ── §4 hr_party_roster (the member list and count are the HUNTERS) ─────────
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
  --        ★ 2026-10-08 party-drop: every member count and member list below
  --        is the HUNTERS — live members not sat out of this hunt
  --        (hr_party_sat_out). A dropped member is the party's but not the
  --        hunt's, so the driver can neither price nor lease them here; their
  --        own solo roster serves them (hr_partied is false for them).
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
         where pm.party_id = h.party_id and pm.left_at is null
           and not public.hr_party_sat_out(h.id, pm.user_id, pm.slot)) mc
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
           where pm.party_id = t.p_id and pm.left_at is null
             and not public.hr_party_sat_out(t.h_id, pm.user_id, pm.slot)),
         t.n
    from taken t
    join leased x on x.lp = t.p_id
   order by t.mark asc, t.p_id asc;
end $$;

-- ── §5 hr_party_tick_settle (the drop, the hunter set, the rejoin) ─────────
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
  -- THE ARMED FENCES, PER MEMBER (2026-10-08, steps 8b/8c).
  v_adm      text;
  v_cap_ms   bigint;
  -- THE DROP (3c) AND THE REJOIN (10) (2026-10-08-world-tick-party-drop.sql).
  -- (7)'s clamp: a member dropped this many times today by this party is not
  -- re-admitted until the server's UTC day rolls.
  c_max_drops_day constant int := 3;
  v_drop     jsonb := '[]'::jsonb;
  v_hunters  int   := 0;
  v_reason   text;
  v_lead     record;
  v_next     record;
  v_handoff  boolean := false;
  v_so       record;
  v_got      int;
  v_own_n    int;
  v_rejoin   jsonb := '[]'::jsonb;
begin
  -- ── (0) IDENTITY. The PRIMARY control is the GRANT in §4; this is the
  --        SECONDARY one, so an owner-context call cannot silently act as the
  --        engine without saying so. `hr_tick` is refused BY NAME: the selector
  --        must never be able to become the settler.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_party_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (0b) THIS TRANSACTION IS THE WORLD TICK. Transaction-local, read only
  --         by hr_frame_wanted, and it can only SUPPRESS a frame for a member
  --         with no live window (2026-10-07-frame-emit-online-only.sql).
  perform set_config('hr.frame_origin', 'tick', true);

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

  -- ══ (3c) ★ THE DROP ★ (2026-10-08-world-tick-party-drop.sql; Game Designer
  --    ruling, SEC_GATHER_ARM_RUNBOOK (c) 1-6). ARMED ONLY, and BEFORE the CAS,
  --    so the driver's own probe — the call that writes nothing else and that
  --    every fire makes before it prices anything — is where a fenced member
  --    leaves the hunt. The window that probe would have priced is therefore
  --    never priced with them in it: the probe answers `member_sat_out`, the
  --    driver skips, and the next fire's hr_party_roster hands it the
  --    REMAINING hunters, whose split is the only one that can pay (6).
  --    THE JUDGEMENT IS THE SERVER'S, ON ITS OWN ROWS AND CLOCK (c)(1): the
  --    hunter set is read here from party_member (never from p_members), each
  --    hunter's player_state row is locked FOR UPDATE in (user_id, slot) order
  --    (the order (4)(5b) takes, so nothing new can deadlock), and a hunter is
  --    dropped when, on that LOCKED mark and that member's OWN server cap,
  --      hr_tick_admit(false, accrued_to, null) <> 'admit'     → 'fenced_24h'
  --      cap <= 0 (NULL fails closed) or accrued_to < now() - cap → 'fenced_cap'
  --    — judged on now() alone, so no argument can move it. The (8b)(8c)
  --    window fences below stay, verbatim, as the backstop for the <= 60 s a
  --    window may end past now() (step 2's skew).
  --    A refusal ABOVE this point (lease, mode, carrier) drops nobody, and a
  --    member-caused refusal BELOW it (version, channel, invariant 8) never
  --    drops anyone else: those return before any write, as they always did.
  --    WHAT A DROP WRITES, AND NOTHING ELSE: one party_hunt_roster_log row per
  --    dropped member (5); the party and hunt versions; the leader hand-off
  --    when the leader is dropped (6); `ended_at` when fewer than two hunters
  --    remain (6). NO player_state field is written, so a drop cannot touch
  --    hp, recovery, deaths or vigour (4), and NO ledger row is written (3).
  --    The dropped member keeps their party_member row (they are still in the
  --    party, and Leave is still theirs); hr_partied goes false for them, so
  --    their own solo paths price their time from their own mark up to their
  --    own cap — the hr_party_kick boundary rule — while the party pays the
  --    rest from the same mark onward. One interval, one payer, each.
  if not v_shadow then
    for v_m in
      select jsonb_build_object('user', pm.user_id, 'slot', pm.slot)
        from public.party_member pm
       where pm.party_id = p_party and pm.left_at is null
         and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
       order by pm.user_id, pm.slot
    loop
      v_mu := (v_m->>'user')::uuid;
      v_ms := (v_m->>'slot')::int;
      select * into v_st from public.player_state
       where user_id = v_mu and slot = v_ms for update;
      -- A hunter with no character is not judged here: (4)(5b) refuses it by
      -- name (no_character) before anything is paid.
      if not found then continue; end if;
      v_hunters := v_hunters + 1;
      v_adm    := public.hr_tick_admit(false, v_st.accrued_to, null);
      v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);
      v_reason := case
                    when v_adm is distinct from 'admit' then 'fenced_24h'
                    when v_cap_ms <= 0
                      or v_st.accrued_to < now() - v_cap_ms * interval '1 millisecond' then 'fenced_cap'
                  end;
      if v_reason is not null then
        v_drop := v_drop || jsonb_build_array(jsonb_build_object(
          'user', v_mu, 'slot', v_ms, 'reason', v_reason,
          'accrued_to', v_st.accrued_to, 'cap_ms', v_cap_ms));
      end if;
    end loop;

    if jsonb_array_length(v_drop) > 0 then
      -- THE PARTY ROW, NEVER WAITED ON. The verbs take party -> party_hunt; this
      -- function holds party_hunt already, so waiting here could close a cycle
      -- with a leader's Stop. SKIP LOCKED answers `party_busy` with nothing
      -- written, and the next fire judges again.
      perform 1 from public.party where id = p_party for update skip locked;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'party_busy', 'mode', 'armed',
          'paid', false, 'channel', c_channel, 'party', p_party);
      end if;
      v_hunters := v_hunters - jsonb_array_length(v_drop);

      -- (5) ONE APPEND-ONLY ROW PER DROPPED MEMBER: party, hunt, member, the
      --     locked mark, the cap, the reason, the server's time and day key.
      insert into public.party_hunt_roster_log
        (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
      select public.hr_utc_day_key(now()), p_party, v_hunt.id,
             (d->>'user')::uuid, (d->>'slot')::int, 'drop', d->>'reason',
             (d->>'accrued_to')::timestamptz, (d->>'cap_ms')::bigint, v_hunters
        from jsonb_array_elements(v_drop) d;

      -- (6) FEWER THAN TWO HUNTERS: THE HUNT ENDS AND EVERYONE GOES SOLO.
      --     `ended_at` makes hr_partied false for every member, invariant 7
      --     stops excluding them, and each one's own path prices their time
      --     from their own mark — which invariant 8 kept equal to the hunt's.
      if v_hunters < 2 then
        update public.party_hunt
           set ended_at = now(), stopped_by = 'too_few_hunters', version = version + 1
         where party_id = p_party and ended_at is null;
        update public.party set version = version + 1 where id = p_party;
        return jsonb_build_object('ok', false, 'error', 'party_hunt_ended',
          'why', 'too_few_hunters', 'mode', 'armed', 'paid', false,
          'channel', c_channel, 'party', p_party, 'dropped', v_drop, 'hunters', v_hunters);
      end if;

      -- (6) A DROPPED LEADER HANDS THE ROLE ON, in this transaction, by
      --     hr_party_leave's own succession rule (tenure, then user id) over
      --     the REMAINING hunters — so the hunt that keeps running has a leader
      --     who can stop it. The dropped leader stays in the party as a member.
      select p.leader_user as user_id, p.leader_slot as slot into v_lead
        from public.party p where p.id = p_party;
      if exists (select 1 from jsonb_array_elements(v_drop) d
                  where (d->>'user')::uuid = v_lead.user_id
                    and (d->>'slot')::int  = v_lead.slot) then
        select pm.user_id, pm.slot into v_next
          from public.party_member pm
         where pm.party_id = p_party and pm.left_at is null
           and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot)
         order by pm.joined_at, pm.user_id
         limit 1;
        update public.party_member set role = 'member'
         where party_id = p_party and user_id = v_lead.user_id and slot = v_lead.slot
           and left_at is null;
        update public.party_member set role = 'leader'
         where party_id = p_party and user_id = v_next.user_id and slot = v_next.slot
           and left_at is null;
        update public.party
           set leader_user = v_next.user_id, leader_slot = v_next.slot, version = version + 1
         where id = p_party;
        v_handoff := true;
      else
        update public.party set version = version + 1 where id = p_party;
      end if;
      update public.party_hunt set version = version + 1
       where party_id = p_party and ended_at is null;
      return jsonb_build_object('ok', false, 'error', 'member_sat_out', 'mode', 'armed',
        'paid', false, 'channel', c_channel, 'party', p_party, 'dropped', v_drop,
        'hunters', v_hunters, 'leader_handoff', v_handoff);
    end if;
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
  --
  --        ★ 2026-10-08 (party-drop, (c)(2)): THE LIVE SET IS THE HUNTER SET —
  --        live members NOT sat out of this hunt. A declared set that still
  --        names a dropped member, or that leaves out a hunter, is refused here
  --        exactly as before, so the paid set can only ever be the remaining
  --        hunters and a dropped member can never be priced into a split.
  select count(*) into v_live from public.party_member pm
   where pm.party_id = p_party and pm.left_at is null
     and not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot);
  select count(distinct (pm.user_id, pm.slot)) into v_matched
    from jsonb_array_elements(p_members) e
    join public.party_member pm
      on pm.party_id = p_party and pm.left_at is null
     and pm.user_id = (e.value->>'user')::uuid
     and pm.slot    = (e.value->>'slot')::int
   where not public.hr_party_sat_out(v_hunt.id, pm.user_id, pm.slot);
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

  -- ══ (8b)(8c) ★ THE ARMED FENCES, PER MEMBER ★ (2026-10-08, Security review
  --    of 2026-10-07-world-tick-armed-cap.sql: "hr_party_tick_settle has
  --    neither 8b nor 8c, so it blocks combat arming (M4)"). hr_tick_settle's
  --    two armed fences, applied to EVERY member, on that member's own row
  --    (locked FOR UPDATE at (4)(5b) above, so this re-read is the locked
  --    value) and that member's own server cap:
  --      (8b) raw accrued_to inside 24 h — hr_tick_admit's no-chain arm, the
  --           predicate hr_tick_settle (8b) uses             → 'fenced_24h'
  --      (8c) accrued_to >= greatest(now(), p_window_to) - hr_offline_cap_ms;
  --           a NULL or zero cap fails CLOSED               → 'fenced_cap'
  --    With (5a) holding p_window_from >= the party mark and (2) holding
  --    p_window_to <= now() + 60 s, an armed party pays at most min(absence,
  --    cap) of any absence, one span or a 90 s drip: never more than accrue.
  --    ★ THE WHOLE WINDOW IS REFUSED, NEVER ONE MEMBER SKIPPED. The deltas are
  --      one split computed from every contributor (journal.meta.party), so
  --      paying the rest while one is fenced is S-9's partial settle — a share
  --      minted from a contributor nobody paid. Returned before ANY write,
  --      like every refusal above; the hunt is NOT ended (a fence is not a
  --      member fault). Invariant 8 makes every member's mark the party's, so
  --      in practice the smallest member cap decides; it is still read per
  --      member so a future break of invariant 8 cannot widen it.
  --    The SHADOW branch above has already returned: it is untouched.
  for v_m in
    select e.value from jsonb_array_elements(p_members) e
     order by (e.value->>'user')::uuid, (e.value->>'slot')::int
  loop
    v_mu := (v_m->>'user')::uuid;
    v_ms := (v_m->>'slot')::int;
    select * into v_st from public.player_state where user_id = v_mu and slot = v_ms;
    v_adm := public.hr_tick_admit(false, v_st.accrued_to, null);
    if v_adm is distinct from 'admit' then
      return jsonb_build_object('ok', false, 'error', 'fenced_24h', 'mode', 'armed', 'paid', false,
        'channel', c_channel, 'party', p_party,
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'accrued_to', v_st.accrued_to, 'admission', v_adm);
    end if;
    v_cap_ms := coalesce(public.hr_offline_cap_ms(v_mu, v_ms), 0);
    if v_cap_ms <= 0
       or v_st.accrued_to < greatest(now(), p_window_to) - v_cap_ms * interval '1 millisecond' then
      return jsonb_build_object('ok', false, 'error', 'fenced_cap', 'mode', 'armed', 'paid', false,
        'channel', c_channel, 'party', p_party,
        'member', jsonb_build_object('user', v_mu, 'slot', v_ms),
        'accrued_to', v_st.accrued_to, 'cap_ms', v_cap_ms);
    end if;
  end loop;

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

  -- ══ (10) ★ THE REJOIN ★ (2026-10-08-world-tick-party-drop.sql; (c)(4)(5)(7)).
  --    Reached only when this ARMED window has paid every hunter and moved the
  --    hunt mark to p_window_to. A member sat out of THIS hunt rejoins at this
  --    fire, with their mark set to the hunt's new mark — the fire's own end,
  --    i.e. the server's `now` for this window, and the only instant invariant
  --    8 allows — when ALL of:
  --      (a) still a live member of this party (row locked, never waited on);
  --      (b) dropped fewer than c_max_drops_day times today by this party,
  --          from the journal on the server's day key — (7)'s clamp, so a
  --          drop/rejoin cycle cannot cut a refused window into every fire;
  --      (c) their own row is lockable now (SKIP LOCKED: never waited on, and
  --          a solo settle in flight on it simply defers the rejoin);
  --      (d) on the hunt's channel;
  --      (e) RETURNED: their own mark has moved past the mark they were
  --          dropped at, i.e. their own solo path has priced their away time
  --          (min(absence, own cap)) since the drop, AND that mark is not past
  --          p_window_to — so moving it to p_window_to is FORWARD only and the
  --          span [their mark, p_window_to] is forfeited (no back pay, ruling)
  --          and is never paid by both paths;
  --      (f) their cap admits (NULL/0 fails closed), so the rejoin cannot be
  --          dropped again on the very next fire;
  --      (g) every hr_tick_ownership row of theirs is lockable now, and any
  --          solo lease on it is EXPIRED here — a solo settle that leased them
  --          before this commit then answers `no_lease` instead of paying a
  --          solo window over time the party now pays.
  --    WHAT A REJOIN WRITES: player_state.accrued_to (forward) and version,
  --    the lease expiry, and one party_hunt_roster_log row (5). Nothing else
  --    on the member row moves — hp, recovering_until, deaths, consec_falls,
  --    fight/vigour and every counter carry over as they are (4).
  for v_so in
    select l.user_id, l.slot, l.mark as drop_mark
      from public.party_hunt_roster_log l
     where l.hunt_id = v_hunt.id
       and l.event = 'drop'
       and l.id = (select max(l2.id) from public.party_hunt_roster_log l2
                    where l2.hunt_id = l.hunt_id
                      and l2.user_id = l.user_id and l2.slot = l.slot)
     order by l.user_id, l.slot
  loop
    perform 1 from public.party_member pm
     where pm.party_id = p_party and pm.user_id = v_so.user_id and pm.slot = v_so.slot
       and pm.left_at is null
       for update skip locked;
    if not found then continue; end if;
    if (select count(*) from public.party_hunt_roster_log l
         where l.party_id = p_party and l.user_id = v_so.user_id and l.slot = v_so.slot
           and l.event = 'drop'
           and l.day_key = public.hr_utc_day_key(now())) >= c_max_drops_day then
      continue;
    end if;
    select * into v_st from public.player_state
     where user_id = v_so.user_id and slot = v_so.slot
       for update skip locked;
    if not found then continue; end if;
    if v_st.active_kind is distinct from c_channel then continue; end if;
    if v_st.accrued_to is null
       or v_st.accrued_to <= coalesce(v_so.drop_mark, '-infinity'::timestamptz)
       or v_st.accrued_to > p_window_to then
      continue;
    end if;
    v_cap_ms := coalesce(public.hr_offline_cap_ms(v_so.user_id, v_so.slot), 0);
    if v_cap_ms <= 0 then continue; end if;
    select count(*) into v_own_n from public.hr_tick_ownership o
     where o.user_id = v_so.user_id and o.slot = v_so.slot;
    select count(*) into v_got from (
      select 1 from public.hr_tick_ownership o
       where o.user_id = v_so.user_id and o.slot = v_so.slot
         for update skip locked) s;
    if v_got <> v_own_n then continue; end if;
    update public.hr_tick_ownership
       set lease_until = now() - interval '1 hour', updated_at = now()
     where user_id = v_so.user_id and slot = v_so.slot
       and lease_until is not null and lease_until > now() - interval '1 hour';
    update public.player_state
       set accrued_to = p_window_to, version = version + 1, updated_at = now()
     where user_id = v_so.user_id and slot = v_so.slot;
    insert into public.party_hunt_roster_log
      (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, member_mark, cap_ms, hunters)
    values (public.hr_utc_day_key(now()), p_party, v_hunt.id, v_so.user_id, v_so.slot,
            'rejoin', 'returned', p_window_to, v_st.accrued_to, v_cap_ms,
            v_n + jsonb_array_length(v_rejoin) + 1);
    v_rejoin := v_rejoin || jsonb_build_array(jsonb_build_object('user', v_so.user_id, 'slot', v_so.slot));
  end loop;

  return jsonb_build_object('ok', true, 'mode', 'armed', 'paid', true,
    'party', p_party, 'window_to', p_window_to, 'members', v_n, 'rejoined', v_rejoin);
end $$;

-- ── §6 GRANTS — restated EXACTLY as the chain left them (revoke first) ──────
revoke execute on function public.hr_party_sat_out(uuid, uuid, int) from public;
revoke execute on function public.hr_party_sat_out(uuid, uuid, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_partied(uuid, int) from public;
revoke execute on function public.hr_partied(uuid, int)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_partied(uuid, int) to hr_engine;

revoke execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid) from public;
revoke execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid)
  from anon, authenticated, service_role, hr_engine;
grant  execute on function public.hr_party_roster(text[], int, text, int, timestamptz, uuid) to hr_tick;

revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to hr_engine;

-- ── §7 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Every settle runs as `hr_engine` and the roster as `hr_tick`, exactly as the
-- edge and the cron issue them. Combat ARMED throughout except where stated.
-- A party of three: PB (no clan, cap 12 h) is the LEADER and joined first; PA
-- and PC (clan level 7, cap 15 h) joined after, PA before PC.
--   k0  installed bodies are this file's (md5); the drop sits after the mode
--       read and before the CAS, the rejoin after the fan-out; nothing in the
--       schema UPDATEs or DELETEs party_hunt_roster_log
--   d1  ★ (1)(3)(4)(5)(6) marks 13 h old: the PROBE drops PB alone
--       (fenced_cap, PB's own 12 h cap) — member_sat_out, hunters 2; no ledger
--       row, no player_state field moved for anyone, hunt live at its mark; ONE
--       journal row (party, hunt, PB, mark, cap, reason, server time); the
--       leader role handed to PA (tenure); hr_partied(PB) false, (PA) true; a
--       second probe drops nobody and answers the CAS as before
--   d2  ★ (2) the roster hands the driver PA and PC only (count 2)
--   d3  ★ (2) a settle still naming PB is refused (declared != hunters); the
--       same window for PA+PC pays exactly those two
--   d4  ★ (3) AWAY: two more paid windows; PB: zero ledger rows, row untouched,
--       never rejoined (their own mark has not moved since the drop)
--   d5  ★ (3)(4)(5) ATTENDED: PB's own accrue pays them solo (hr_apply, one
--       row); a window ending BEFORE PB's mark does not rejoin them (no
--       backward move); the next one does — mark = the hunt's new mark, version
--       +1, every other player_state column identical (hp, recovery, falls,
--       fight/vigour), the solo lease expired, a journal row; then PB is paid
--       by the party from that mark only. PB's ledger over the whole run: one
--       solo row + one party row, and no party row before the rejoin
--   d6  ★ (7)(6) PB at the day's 3rd drop is NOT rejoined though returned; a
--       sat-out ex-leader's Leave lands
--   d7  ★ (6) both remaining hunters past 24 h: the probe drops both, the hunt
--       ENDS (too_few_hunters), nothing paid, nobody partied
--   kg  grants exact (table: no privilege, RLS forced, no policy); hygiene STRICT
--   kr  the config switches this block flipped are restored and read back
-- All probe rows are rolled back by the sentinel exception.
do $$
declare
  v_pa     uuid := '00000000-0000-4000-8000-0000000d2081';
  v_pb     uuid := '00000000-0000-4000-8000-0000000d2082';
  v_pc     uuid := '00000000-0000-4000-8000-0000000d2083';
  c_h      constant text := 'hr1008d-selfcheck';
  c_h12    constant bigint := 12 * 3600000::bigint;
  v_cact   text;
  v_clan   uuid;
  v_party  uuid;
  v_hunt   uuid;
  v_mark   timestamptz;
  v_to     timestamptz;
  v_r      jsonb;
  v_l0     bigint;
  v_n      bigint;
  v_snap   jsonb;
  v_mem    jsonb;
  v_snap2  jsonb;
  v_pbrow  jsonb;
  v_x      timestamptz;
  v_cfg_en boolean;
  v_cfg_ch text[];
  v_cfg_ar text[];
  v_en     boolean;
  v_ch     text[];
  v_ar     text[];
  r        record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure)
         <> '61a739fc33d1c60651ab30d1f7b4e5f4'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_party_roster(text[],int,text,int,timestamptz,uuid)'::regprocedure)
         <> '4241abd3a13b9f71089df6899d6dd04f'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_partied(uuid,int)'::regprocedure)
         <> '3ae4b07cb060fcf0815eeaecca6dad98' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if (select count(*) from pg_proc p
         where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure
           and position($m$set_config('hr.frame_origin', 'tick', true)$m$ in p.prosrc) > 0
           and position('''member_sat_out''' in p.prosrc) > position('''shadow_state_while_armed''' in p.prosrc)
           and position('''party_window_already_settled''' in p.prosrc) > position('''member_sat_out''' in p.prosrc)
           and position($m$'error', 'fenced_cap', 'mode'$m$ in p.prosrc) > position('if v_shadow then' in p.prosrc)
           and position('''rejoin''' in p.prosrc) > position('v_out := public.hr_apply(' in p.prosrc)) <> 1 then
      raise exception 'k0b: hr_party_tick_settle lost its tick marker, or the drop is not between the mode read and the CAS, or the rejoin is not after the fan-out';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and (p.prosrc ~* 'update\s+public\.party_hunt_roster_log'
                    or p.prosrc ~* 'delete\s+from\s+public\.party_hunt_roster_log')) then
      raise exception 'k0c: a function body UPDATEs or DELETEs party_hunt_roster_log — it is append-only';
    end if;

    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'] where id;

    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'k-fixture: hr_activities has no combat row'; end if;
    insert into auth.users (id) values (v_pa), (v_pb), (v_pc) on conflict do nothing;
    insert into public.clans (name, created_by, level) values ('hr1008d selfcheck', v_pa, 7)
      returning id into v_clan;
    insert into public.clan_members (clan_id, user_id) values (v_clan, v_pa), (v_clan, v_pc);
    if public.hr_offline_cap_ms(v_pb, 0) is distinct from c_h12
       or public.hr_offline_cap_ms(v_pa, 0) is distinct from 15 * 3600000::bigint
       or public.hr_offline_cap_ms(v_pc, 0) is distinct from 15 * 3600000::bigint then
      raise exception 'k-fixture: caps are not PB 12 h / PA,PC 15 h';
    end if;

    v_mark := date_trunc('second', now()) - interval '13 hours';
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since,
                                     consec_falls, recovering_until)
    values (v_pa, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 0, null),
           (v_pb, 0, 500, 0,  7, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 2,
            '2001-01-01 00:00:00+00'),
           (v_pc, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 0, null);
    insert into public.party (leader_user, leader_slot) values (v_pb, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_party, v_pb, 0, 'leader', now() - interval '3 hours'),
           (v_party, v_pa, 0, 'member', now() - interval '2 hours'),
           (v_party, v_pc, 0, 'member', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_mark)
      returning id into v_hunt;
    insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
    values (v_party, true, c_h, now() + interval '5 minutes')
    on conflict (party_id) do update set owned = true, lease_holder = c_h, lease_until = now() + interval '5 minutes';

    -- ── d1: the PROBE drops PB
    select count(*) into v_l0 from public.player_ledger where user_id in (v_pa, v_pb, v_pc);
    select jsonb_agg(to_jsonb(ps) order by ps.user_id) into v_snap
      from public.player_state ps where ps.user_id in (v_pa, v_pb, v_pc);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, '1970-01-01 00:00:00+00', now(),
             '00000000-0000-0000-0000-000000000000',
             (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0,
                       'delta', jsonb_build_object('accrued_to', now())) order by u)
                from unnest(array[v_pa, v_pb, v_pc]) u));
    reset role;
    if v_r->>'error' is distinct from 'member_sat_out' or (v_r->>'hunters')::int <> 2
       or jsonb_array_length(v_r->'dropped') <> 1
       or (v_r#>>'{dropped,0,user}')::uuid is distinct from v_pb
       or v_r#>>'{dropped,0,reason}' is distinct from 'fenced_cap'
       or (v_r#>>'{dropped,0,cap_ms}')::bigint is distinct from c_h12
       or (v_r->>'leader_handoff')::boolean is not true then
      raise exception 'd1: marks 13 h old did not drop PB alone (fenced_cap, own 12 h cap) with the leader handed on: %', v_r;
    end if;
    select count(*) - v_l0 into v_n from public.player_ledger where user_id in (v_pa, v_pb, v_pc);
    if v_n <> 0
       or (select jsonb_agg(to_jsonb(ps) order by ps.user_id) from public.player_state ps
            where ps.user_id in (v_pa, v_pb, v_pc)) is distinct from v_snap
       or (select ended_at is not null or accrued_to <> v_mark from public.party_hunt where id = v_hunt) then
      raise exception 'd1b: the drop moved a ledger row (+%), a player_state field, or the hunt', v_n;
    end if;
    if (select count(*) from public.party_hunt_roster_log where party_id = v_party) <> 1
       or not exists (select 1 from public.party_hunt_roster_log
                       where party_id = v_party and hunt_id = v_hunt and user_id = v_pb and slot = 0
                         and event = 'drop' and reason = 'fenced_cap' and mark = v_mark
                         and cap_ms = c_h12 and hunters = 2 and at = now()
                         and day_key = public.hr_utc_day_key(now())) then
      raise exception 'd1c: the drop was not journalled as exactly one row (party, hunt, PB, mark, cap, reason, server time)';
    end if;
    if (select leader_user from public.party where id = v_party) is distinct from v_pa
       or (select role from public.party_member where party_id = v_party and user_id = v_pa) <> 'leader'
       or (select role from public.party_member where party_id = v_party and user_id = v_pb) <> 'member'
       or (select left_at from public.party_member where party_id = v_party and user_id = v_pb) is not null then
      raise exception 'd1d: the dropped leader did not hand the role to PA (tenure) and stay a member';
    end if;
    if public.hr_partied(v_pb, 0) or not public.hr_partied(v_pa, 0) then
      raise exception 'd1e: hr_partied(PB) must be false (served solo) and hr_partied(PA) true';
    end if;
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, '1970-01-01 00:00:00+00', now(),
             '00000000-0000-0000-0000-000000000000',
             (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0,
                       'delta', jsonb_build_object('accrued_to', now())) order by u)
                from unnest(array[v_pa, v_pc]) u));
    reset role;
    if v_r->>'error' is distinct from 'party_window_already_settled'
       or (v_r->>'accrued_to')::timestamptz is distinct from v_mark
       or (select count(*) from public.party_hunt_roster_log where party_id = v_party) <> 1 then
      raise exception 'd1f: a second probe was not the plain CAS answer, or dropped again: %', v_r;
    end if;

    -- ── d2: the roster hands the driver the hunters only
    set local role hr_tick;
    select to_jsonb(x) into v_r
      from public.hr_party_roster(array['combat'], 200, c_h, 30000, null, null) x
     where x.party_id = v_party;
    reset role;
    if v_r is null or (v_r->>'member_count')::int <> 2
       or (select array_agg((e->>'user_id')::uuid order by (e->>'user_id')::uuid)
             from jsonb_array_elements(v_r->'members') e) is distinct from
          (select array_agg(u order by u) from unnest(array[v_pa, v_pc]) u) then
      raise exception 'd2: hr_party_roster did not hand the driver exactly PA and PC: %', v_r;
    end if;

    -- ── d3: PB named → refused; PA+PC → paid, those two only
    v_to := v_mark + interval '90 seconds';
    v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
                 'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
                   'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                     'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                       'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 3333,
                         'xp_bp', 3333, 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
                 order by ps.user_id)
                from public.player_state ps where ps.user_id in (v_pa, v_pb, v_pc));
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, '00000000-0000-4000-8000-0000000d2101', v_mem);
    reset role;
    if v_r->>'error' is distinct from 'party_window_already_settled'
       or v_r->>'why' is distinct from 'the declared member set is not the live member set' then
      raise exception 'd3: a settle still naming the dropped PB was not refused as a non-hunter set: %', v_r;
    end if;
    for v_x in select g from unnest(array[v_mark, v_mark + interval '90 seconds',
                                          v_mark + interval '180 seconds']) g loop
      v_to := v_x + interval '90 seconds';
      select count(*) into v_l0 from public.player_ledger where user_id in (v_pa, v_pc) and kind = 'combat' and intent = 'accrue';
      v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
                   'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
                     'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                       'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                         'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000,
                           'xp_bp', 5000, 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
                   order by ps.user_id)
                  from public.player_state ps where ps.user_id in (v_pa, v_pc));
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_x, v_to, gen_random_uuid(), v_mem);
      reset role;
      select count(*) - v_l0 into v_n from public.player_ledger where user_id in (v_pa, v_pc) and kind = 'combat' and intent = 'accrue';
      -- ── d3 / d4 (AWAY): the two hunters paid; PB untouched and not rejoined
      if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' is distinct from 'armed'
         or v_n <> 2 or jsonb_array_length(v_r->'rejoined') <> 0
         or (select accrued_to from public.party_hunt where id = v_hunt) is distinct from v_to
         or exists (select 1 from public.player_ledger where user_id = v_pb)
         or (select to_jsonb(ps) from public.player_state ps where ps.user_id = v_pb)
              is distinct from (select e from jsonb_array_elements(v_snap) e
                                 where (e->>'user_id')::uuid = v_pb) then
        raise exception 'd3/d4: window to % did not pay exactly PA and PC with PB (AWAY) untouched: % (ledger +%)',
          v_to, v_r, v_n;
      end if;
    end loop;

    -- ── d5 (ATTENDED): PB returns; their own accrue pays them SOLO
    v_x := date_trunc('second', now()) - interval '200 seconds';
    set local role hr_engine;
    v_r := public.hr_apply(v_pb, 0, 1, '00000000-0000-4000-8000-0000000d2105',
             jsonb_build_object('gold', 11, 'accrued_to', to_jsonb(v_x),
               'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                 'meta', jsonb_build_object('ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true
       or (select accrued_to from public.player_state where user_id = v_pb) is distinct from v_x
       or (select count(*) from public.player_ledger where user_id = v_pb and kind = 'combat' and intent = 'accrue') <> 1 then
      raise exception 'd5: PB''s own (solo) accrue did not pay them while sat out: %', v_r;
    end if;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_pb, 0, 'combat', true, 'hr1008d-solo', now() + interval '5 minutes')
    on conflict (user_id, slot, channel) do update
      set owned = true, lease_holder = 'hr1008d-solo', lease_until = now() + interval '5 minutes';
    -- the party, moved near now (fixture), so its windows reach PB's mark
    v_mark := date_trunc('second', now()) - interval '300 seconds';
    update public.party_hunt set accrued_to = v_mark where id = v_hunt;
    update public.player_state set accrued_to = v_mark where user_id in (v_pa, v_pc);
    foreach v_x in array array[v_mark, v_mark + interval '90 seconds', v_mark + interval '180 seconds'] loop
      v_to := v_x + interval '90 seconds';
      select to_jsonb(ps) - 'accrued_to' - 'version' - 'updated_at' into v_pbrow
        from public.player_state ps where ps.user_id = v_pb;
      v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
                   'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
                     'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                       'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                         'party', jsonb_build_object('id', v_party, 'hunt', v_hunt,
                           'dmg_bp', case when public.hr_partied(v_pb, 0) then 3333 else 5000 end,
                           'xp_bp', 5000, 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
                   order by ps.user_id)
                  from public.player_state ps
                 where ps.user_id in (v_pa, v_pc)
                    or (ps.user_id = v_pb and public.hr_partied(v_pb, 0)));
      set local role hr_engine;
      v_r := public.hr_party_tick_settle(c_h, v_party, v_x, v_to, gen_random_uuid(), v_mem);
      reset role;
      if coalesce((v_r->>'ok')::boolean, false) is not true then
        raise exception 'd5: the party window to % was not paid: %', v_to, v_r;
      end if;
      if v_x = v_mark then
        -- PB's mark (now - 200 s) is PAST this window's end (now - 210 s):
        -- moving it back to the window would pay [now-210, now-200] twice.
        if jsonb_array_length(v_r->'rejoined') <> 0
           or (select accrued_to from public.player_state where user_id = v_pb)
                is distinct from date_trunc('second', now()) - interval '200 seconds'
           or exists (select 1 from public.party_hunt_roster_log where user_id = v_pb and event = 'rejoin') then
          raise exception 'd5b: PB rejoined over a window ending before their own mark (a backward move): %', v_r;
        end if;
      elsif v_x = v_mark + interval '90 seconds' then
        if jsonb_array_length(v_r->'rejoined') <> 1
           or (v_r#>>'{rejoined,0,user}')::uuid is distinct from v_pb
           or (select accrued_to from public.player_state where user_id = v_pb) is distinct from v_to
           or (select version from public.player_state where user_id = v_pb) <> 3
           or (select to_jsonb(ps) - 'accrued_to' - 'version' - 'updated_at'
                 from public.player_state ps where ps.user_id = v_pb) is distinct from v_pbrow
           or not exists (select 1 from public.party_hunt_roster_log
                           where party_id = v_party and hunt_id = v_hunt and user_id = v_pb
                             and event = 'rejoin' and reason = 'returned' and mark = v_to
                             and member_mark = date_trunc('second', now()) - interval '200 seconds'
                             and hunters = 3 and at = now())
           or (select lease_until from public.hr_tick_ownership
                where user_id = v_pb and slot = 0 and channel = 'combat') > now()
           or not public.hr_partied(v_pb, 0) then
          raise exception 'd5c: PB did not rejoin at the window''s end with only accrued_to/version moved, a journal row and the solo lease expired: %', v_r;
        end if;
      else
        if (v_r->>'members')::int <> 3
           or (select count(*) from public.player_ledger where user_id = v_pb and kind = 'combat' and intent = 'accrue' and meta ? 'party') <> 1 then
          raise exception 'd5d: the window after the rejoin did not pay PB with the party: %', v_r;
        end if;
      end if;
    end loop;
    -- PB's whole ledger across the drop: one solo row (their own accrue) and
    -- one party row (the window after the rejoin; d3/d4 held it at zero while
    -- sat out, d5b/d5c at zero through the rejoin window). Gold sums to exactly
    -- those two payments.
    if (select count(*) from public.player_ledger where user_id = v_pb and kind = 'combat' and intent = 'accrue') <> 2
       or (select count(*) from public.player_ledger where user_id = v_pb and kind = 'combat' and intent = 'accrue' and not (meta ? 'party')) <> 1
       or (select count(*) from public.player_ledger where user_id = v_pb and kind = 'combat' and intent = 'accrue' and meta ? 'party') <> 1
       or (select gold from public.player_state where user_id = v_pb) <> 500 + 11 + 7 then
      raise exception 'd5e: PB''s ledger across the drop is not exactly one solo row + one party row (gold %)',
        (select gold from public.player_state where user_id = v_pb);
    end if;

    -- ── d6 (7): the day's 3rd drop is not rejoined; a sat-out ex-leader's Leave lands
    v_x := (select accrued_to from public.party_hunt where id = v_hunt);
    insert into public.party_hunt_roster_log
      (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
    values (public.hr_utc_day_key(now()), v_party, v_hunt, v_pb, 0, 'drop', 'fenced_cap', v_x - interval '1 second', c_h12, 2),
           (public.hr_utc_day_key(now()), v_party, v_hunt, v_pb, 0, 'drop', 'fenced_cap', v_x - interval '1 second', c_h12, 2);
    v_to := v_x + interval '30 seconds';
    v_mem := (select jsonb_agg(jsonb_build_object('user', ps.user_id, 'slot', 0, 'version', ps.version,
                 'delta', jsonb_build_object('gold', 7, 'accrued_to', to_jsonb(v_to),
                   'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                     'meta', jsonb_build_object('src', 'tick', 'ticks', 1,
                       'party', jsonb_build_object('id', v_party, 'hunt', v_hunt, 'dmg_bp', 5000,
                         'xp_bp', 5000, 'floor', 0, 'fellow_bp', 1500, 'roll', 4242)))))
                 order by ps.user_id)
                from public.player_state ps where ps.user_id in (v_pa, v_pc));
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_x, v_to, gen_random_uuid(), v_mem);
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or jsonb_array_length(v_r->'rejoined') <> 0
       or public.hr_partied(v_pb, 0) then
      raise exception 'd6: PB was rejoined past the per-day drop clamp: %', v_r;
    end if;
    perform set_config('request.jwt.claim.sub', v_pb::text, true);
    v_r := public.hr_party_leave(0, '00000000-0000-4000-8000-0000000d2106');
    perform set_config('request.jwt.claim.sub', '', true);
    if coalesce((v_r->>'ok')::boolean, false) is not true or (v_r->>'left')::boolean is not true then
      raise exception 'd6b: Leave did not land for the sat-out ex-leader: %', v_r;
    end if;

    -- ── d7 (6): both remaining hunters past 24 h → both dropped, the hunt ENDS
    v_mark := date_trunc('second', now()) - interval '25 hours';
    update public.party_hunt set accrued_to = v_mark where id = v_hunt;
    update public.player_state set accrued_to = v_mark where user_id in (v_pa, v_pc);
    select count(*) into v_l0 from public.player_ledger where user_id in (v_pa, v_pc);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, '1970-01-01 00:00:00+00', now(),
             '00000000-0000-0000-0000-000000000000',
             (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0,
                       'delta', jsonb_build_object('accrued_to', now())) order by u)
                from unnest(array[v_pa, v_pc]) u));
    reset role;
    if v_r->>'error' is distinct from 'party_hunt_ended' or v_r->>'why' is distinct from 'too_few_hunters'
       or jsonb_array_length(v_r->'dropped') <> 2
       or exists (select 1 from jsonb_array_elements(v_r->'dropped') d where d->>'reason' <> 'fenced_24h')
       or (select stopped_by from public.party_hunt where id = v_hunt) is distinct from 'too_few_hunters'
       or (select ended_at from public.party_hunt where id = v_hunt) is distinct from now()
       or (select count(*) from public.player_ledger where user_id in (v_pa, v_pc)) <> v_l0
       or public.hr_partied(v_pa, 0) or public.hr_partied(v_pc, 0) then
      raise exception 'd7: two hunters past 24 h did not end the hunt with both dropped and nothing paid: %', v_r;
    end if;

    -- ── kg: grants exact; the journal readable/writable by no role
    for r in
      select f, role, want from (values
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_engine', true),
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'hr_tick',   false),
        ('public.hr_partied(uuid,int)',                                               'hr_engine', true),
        ('public.hr_partied(uuid,int)',                                               'hr_tick',   false),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)',              'hr_tick',   true),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)',              'hr_engine', false),
        ('public.hr_party_sat_out(uuid,uuid,int)',                                    'hr_engine', false),
        ('public.hr_party_sat_out(uuid,uuid,int)',                                    'hr_tick',   false)) t(f, role, want)
      union all
      select f, c.role, false from (values
        ('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'),
        ('public.hr_partied(uuid,int)'),
        ('public.hr_party_roster(text[],int,text,int,timestamptz,uuid)'),
        ('public.hr_party_sat_out(uuid,uuid,int)')) t(f)
      cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) c(role)
    loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, r.f, 'execute') is distinct from r.want then
          raise exception 'kg: % EXECUTE on % is %, expected %', r.role, r.f,
            has_function_privilege(r.role, r.f, 'execute'), r.want;
        end if;
      end if;
    end loop;
    for r in select rolname from pg_roles
              where rolname in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') loop
      if has_table_privilege(r.rolname, 'public.party_hunt_roster_log', 'select,insert,update,delete,truncate') then
        raise exception 'kg: % holds a privilege on party_hunt_roster_log', r.rolname;
      end if;
    end loop;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
             where c.oid = 'public.party_hunt_roster_log'::regclass)
       or exists (select 1 from pg_policy where polrelid = 'public.party_hunt_roster_log'::regclass) then
      raise exception 'kg: party_hunt_roster_log must have RLS enabled AND forced, and no policy';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr: the switches this block flipped, restored and read back
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    select armed_channels, enabled, channels into v_ar, v_en, v_ch from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_ch is distinct from v_cfg_ch then
      raise exception 'kr: hr_tick_config was not restored';
    end if;

    raise exception 'HR1008D_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1008D_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-party-drop: EXECUTED — the probe drops a fenced hunter alone on their own locked '
               'mark and cap, journals it, hands the leader role on and pays/moves nothing; the roster and the '
               'settle''s live set are the hunters; AWAY the dropped member gets no party pay, ATTENDED their '
               'own accrue pays them solo and they rejoin forward-only at the next window with only '
               'accrued_to/version moved and the solo lease expired; the per-day clamp holds; Leave lands; '
               'under two hunters ends the hunt; grants exact, hygiene strict — all green';
end $$;
