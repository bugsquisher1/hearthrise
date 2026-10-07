-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-08-world-tick-party-reaper.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half.
-- Applies AFTER 2026-10-08-world-tick-party-drop.sql (APPLIED 2026-10-07 02:05
-- UTC), whose four bodies §0 pins at their LIVE prosrc md5.
--
-- WHAT IT ANSWERS. Security PD1 on party-drop @fb5e424a
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, latest verdict):
--   a tick outage of >= 9 h pushes a party hunt's mark past 24 h.
--   hr_party_roster's 24 h admission (`h.accrued_to > now() - c_max_span`)
--   then never rosters it, so it is never probed or dropped; its members stay
--   partied (hr_partied true) and every accrue is refused
--   party_settle_required until someone Leaves or Stops. Disarming does not
--   clear it: the shadow admission reads the same raw mark.
--
-- THE CHOICE: A REAPER, NOT A WIDER ROSTER. Security offered two fixes; this
-- file takes the second, and the reasons are the contract:
--   1. It is MODE-FREE. The (3c) drop is ARMED ONLY (nothing drops in shadow),
--      so admitting a > 24 h hunt to the roster would end it only while combat
--      is armed. Disarmed, the hunt would be rostered and leased every fire,
--      shadow-journalled forever, and still never end — PD1 again, plus a
--      lease row churning per fire. The reaper ends it in every mode, and
--      while the tick is OFF (kill switch, driver down), which is exactly
--      when PD1 is born.
--   2. It is DRIVER-FREE. The edge is frozen and nothing proves how the driver
--      prices a roster row whose mark is past every member's cap. The reaper
--      is one SQL function on pg_cron; no window is ever proposed for it.
--   3. It reaches NO NEW STATE. A reaped hunt is byte-for-byte a leader's
--      hr_party_hunt_stop (ended_at, stopped_by, hunt + party version; nothing
--      on player_state, no ledger row) — a state every party can already reach
--      in one tap. From there each member's own solo path prices their time
--      from their own mark on their own cap, min(absence, cap): the
--      hr_party_kick boundary rule, unchanged. One interval, one payer.
--   4. It KEEPS the roster's partition exact. The roster admits
--      `accrued_to > now() - 24 h`; the reaper ends `accrued_to <= now() - 24
--      h`. Every live hunt is in exactly one of the two, so no hunt is ever
--      unreachable again (§0 asserts the roster's constant and predicate).
--   5. It NEVER PAYS FENCED TIME: it writes no player_state and no ledger row,
--      and an ended hunt cannot be party-settled (no_party_hunt). A mark past
--      24 h can never move again on the party path anyway: the roster does not
--      admit it and the settle's (8b) refuses it — so "stale" is ABSORBING and
--      the reaper cannot race a legitimate payment.
--   6. It KEEPS the drop/rejoin invariants: the stop rows are a new event
--      ('stop') that hr_party_sat_out reads as not-sat-out, the (7) drop clamp
--      counts only 'drop' rows, and a rejoin only ever happens on a LIVE hunt.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 party_hunt_roster_log gains event 'stop' / reason 'stale_hunt' (CHECKs
--    restated, additive: every existing row still satisfies them). One row per
--    HUNTER (live member not sat out) the stop returns to solo: party, hunt,
--    member, the hunt's stale mark, the member's own cap, hunters = 0, server
--    time + day key. Still written only by SECURITY DEFINER bodies, still never
--    updated or deleted.
-- §2 hr_party_reap_stale(p_limit int default 200) -> jsonb
--      {ok:true, reaped:int, skipped:int, hunts:[{party, hunt, mark, members}]}
--    Owner-only: EXECUTE held by no role; runs as the owner from pg_cron.
--    The caller names nothing but a batch size (clamped 1..1000).
-- §3 pg_cron job 'hr-party-reap', every 10 minutes.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   The verbs' lock order (party -> party_hunt), both SKIP LOCKED, so the
--   reaper never waits on anything and nothing waits in a cycle on it:
--     · a settle holds party_hunt FOR UPDATE: the reaper skips that hunt this
--       run (counted in `skipped`) and judges it again in ten minutes;
--     · the reaper holds both: a settle's `party_hunt ... ended_at is null for
--       update` waits, then re-evaluates its WHERE on the committed row, finds
--       the hunt ended and answers no_party_hunt; a verb waits on party and
--       then finds no live hunt (Stop: no_party_hunt; Leave: lands as a leave).
--   Staleness is RE-JUDGED under the lock on now(), never on the candidate
--   read. IDEMPOTENT: a reaped hunt has ended_at set and is never a candidate
--   again; a second run reaps nothing and writes nothing.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   No client or engine grant, policy or RPC changes. The new function is
--   executable by NO role (revoke-first, asserted in §5); its one argument is a
--   clamped batch size. It moves no value: it writes party_hunt (ended_at,
--   stopped_by, version), party.version and the append-only journal — the same
--   columns hr_party_hunt_stop writes, plus the audit row. Every number it
--   judges is a locked row against the server clock.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
--   Six scans an hour over live party_hunt rows (one per hunting party,
--   ~10^3-10^4 at 100x), filtered on accrued_to: well under a millisecond each.
--   Journal rows: <= 4 per reaped hunt; expected ~0 (tick outages > 24 h
--   only). No per-tick and no per-member-per-fire row.
--
-- KNOWN LIMITATIONS
--   · Between 24 h and the next run (<= 10 min) the hunt is still stuck; the
--     vitals line `party hunts > 24 h behind` reads it, and it must be 0.
--   · A hunt with no live hunter (everyone left or sat out) is ended with no
--     journal row (there is no member to name); party_hunt.stopped_by =
--     'stale_hunt' is its record. Nobody was partied by it.
--   · A member returned to solo after > 24 h is not admitted by the solo
--     tick roster either (its own 24 h admission); their own accrue on return
--     prices min(absence, own cap), exactly as for any solo player.
--
-- REVERSIBILITY: `select cron.unschedule('hr-party-reap');`, `drop function
-- public.hr_party_reap_stale(int)`; the CHECKs can stay (they only admit one
-- more event) or be restated without 'stop' once no 'stop' row exists. Hunts
-- the reaper ended stay ended — exactly as if their leader had pressed Stop.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE LIVE BODIES THIS FILE REASONS ABOUT ───────────────
-- No body below is restated; these are pinned because the reaper's correctness
-- is an argument about them: the roster's 24 h admission (the complement), the
-- sat-out reading (who is a hunter), and the settle's (8b) fence and ended-hunt
-- refusal (stale is absorbing; nothing pays after the stop).
do $$
declare
  v_settle  text;
  v_roster  text;
  v_partied text;
  v_satout  text;
  v_src     text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_settle from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)');
  select md5(replace(p.prosrc, chr(13), '')), replace(p.prosrc, chr(13), '') into v_roster, v_src from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_roster(text[],integer,text,integer,timestamp with time zone,uuid)');
  select md5(replace(p.prosrc, chr(13), '')) into v_partied from pg_proc p
   where p.oid = to_regprocedure('public.hr_partied(uuid,integer)');
  select md5(replace(p.prosrc, chr(13), '')) into v_satout from pg_proc p
   where p.oid = to_regprocedure('public.hr_party_sat_out(uuid,uuid,integer)');
  if v_settle is distinct from '61a739fc33d1c60651ab30d1f7b4e5f4'
     or v_roster  is distinct from '4241abd3a13b9f71089df6899d6dd04f'
     or v_partied is distinct from '3ae4b07cb060fcf0815eeaecca6dad98'
     or v_satout  is distinct from '4585bc378d00bb79838eb14d6e1d5933' then
    raise exception 'PRECONDITION: the party bodies are not the live party-drop ones (settle %, roster %, partied %, sat_out %). '
                    'Apply 2026-10-08-world-tick-party-drop.sql first, or re-cut this file against the live bodies.',
                    v_settle, v_roster, v_partied, v_satout;
  end if;
  -- THE COMPLEMENT: the reaper ends exactly what the roster refuses.
  if position($m$c_max_span    constant interval := interval '24 hours';$m$ in v_src) = 0
     or position('and h.accrued_to > now() - c_max_span' in v_src) = 0 then
    raise exception 'PRECONDITION: hr_party_roster no longer admits on `accrued_to > now() - 24 h`; the reaper''s threshold must be re-derived';
  end if;
  if to_regclass('public.party_hunt_roster_log') is null
     or to_regprocedure('public.hr_offline_cap_ms(uuid,integer)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamp with time zone)') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: party_hunt_roster_log, hr_offline_cap_ms, hr_utc_day_key or hr_cron_ensure is absent.';
  end if;
end $$;

-- ── §1 THE JOURNAL LEARNS 'stop' / 'stale_hunt' (additive CHECK restatement) ─
alter table public.party_hunt_roster_log drop constraint if exists party_hunt_roster_log_event_check;
alter table public.party_hunt_roster_log add constraint party_hunt_roster_log_event_check
  check (event in ('drop', 'rejoin', 'stop'));
alter table public.party_hunt_roster_log drop constraint if exists party_hunt_roster_log_reason_check;
alter table public.party_hunt_roster_log add constraint party_hunt_roster_log_reason_check
  check (reason in ('fenced_24h', 'fenced_cap', 'returned', 'stale_hunt'));
alter table public.party_hunt_roster_log drop constraint if exists party_hunt_roster_log_shape;
alter table public.party_hunt_roster_log add constraint party_hunt_roster_log_shape check (
    (event = 'drop'   and reason in ('fenced_24h', 'fenced_cap') and member_mark is null)
 or (event = 'rejoin' and reason = 'returned' and mark is not null and member_mark is not null)
 or (event = 'stop'   and reason = 'stale_hunt' and mark is not null and member_mark is null and hunters = 0));

comment on table public.party_hunt_roster_log is
  '2026-10-08 (world-tick party-drop; Game Designer ruling + SEC_GATHER_ARM_RUNBOOK '
  '(c)1-7). APPEND-ONLY journal of every member a party hunt DROPPED (own mark '
  'past 24 h or past their own offline cap, judged by hr_party_tick_settle on the '
  'locked row and the server clock), every REJOIN, and (2026-10-08 party-reaper, '
  'Security PD1) every hunter a STALE hunt (mark >= 24 h behind) returned to solo '
  'when hr_party_reap_stale ended it. It is also the state: a member is sat out of '
  'a hunt iff their latest row for it is a drop (hr_party_sat_out). Written ONLY '
  'by hr_party_tick_settle and hr_party_reap_stale; RLS forced, no policy, no '
  'privilege for any client or engine role; never updated or deleted.';

-- ── §2 hr_party_reap_stale — THE SERVER'S STOP FOR A HUNT NOBODY CAN TICK ──
create or replace function public.hr_party_reap_stale(p_limit int default 200)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  -- hr_party_roster's c_max_span, by name and value (§0 asserts it there):
  -- the roster admits `accrued_to > now() - c_max_span`, this ends
  -- `accrued_to <= now() - c_max_span`. One partition, no gap.
  c_max_span constant interval := interval '24 hours';
  v_role    text;
  v_limit   int;
  v_cand    record;
  v_h       public.party_hunt%rowtype;
  v_members int;
  v_reaped  int   := 0;
  v_skipped int   := 0;
  v_hunts   jsonb := '[]'::jsonb;
begin
  -- (0) IDENTITY. The PRIMARY control is that no role holds EXECUTE (§5); this
  --     is the secondary one, by name, for every role a request can arrive as.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_party_reap_stale: not callable by %', v_role using errcode = '42501';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 1000);

  for v_cand in
    select h.id, h.party_id
      from public.party_hunt h
     where h.ended_at is null
       and h.accrued_to <= now() - c_max_span
     order by h.accrued_to, h.party_id
     limit v_limit
  loop
    -- (1) THE VERBS' LOCK ORDER, party -> party_hunt, NEVER WAITED ON. A
    --     settle or a verb in flight wins; this hunt is judged again next run.
    perform 1 from public.party where id = v_cand.party_id for update skip locked;
    if not found then v_skipped := v_skipped + 1; continue; end if;
    select * into v_h from public.party_hunt
     where id = v_cand.id and ended_at is null
       for update skip locked;
    if not found then v_skipped := v_skipped + 1; continue; end if;
    -- (2) RE-JUDGED UNDER THE LOCK, on the server clock.
    if v_h.accrued_to > now() - c_max_span then continue; end if;

    -- (3) THE JOURNAL: one row per HUNTER this stop returns to solo. A member
    --     already sat out was served solo before this and is not named.
    insert into public.party_hunt_roster_log
      (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
    select public.hr_utc_day_key(now()), v_h.party_id, v_h.id, pm.user_id, pm.slot,
           'stop', 'stale_hunt', v_h.accrued_to,
           public.hr_offline_cap_ms(pm.user_id, pm.slot), 0
      from public.party_member pm
     where pm.party_id = v_h.party_id and pm.left_at is null
       and not public.hr_party_sat_out(v_h.id, pm.user_id, pm.slot)
     order by pm.user_id, pm.slot;
    get diagnostics v_members = row_count;

    -- (4) THE STOP — hr_party_hunt_stop's own writes, and nothing else: no
    --     player_state field, no ledger row, no boundary spent (the server, not
    --     a member, chose this instant). `ended_at` makes hr_partied false for
    --     every member; each one's own path prices their time from their own
    --     mark, on their own cap.
    update public.party_hunt
       set ended_at = now(), stopped_by = 'stale_hunt', version = version + 1
     where id = v_h.id and ended_at is null;
    update public.party set version = version + 1 where id = v_h.party_id;

    v_reaped := v_reaped + 1;
    v_hunts := v_hunts || jsonb_build_array(jsonb_build_object(
      'party', v_h.party_id, 'hunt', v_h.id, 'mark', v_h.accrued_to, 'members', v_members));
  end loop;

  return jsonb_build_object('ok', true, 'reaped', v_reaped, 'skipped', v_skipped, 'hunts', v_hunts);
end $$;

comment on function public.hr_party_reap_stale(int) is
  '2026-10-08 (world-tick party-reaper, Security PD1). Ends every live party hunt '
  'whose mark is >= 24 h behind — exactly the hunts hr_party_roster refuses to '
  'admit, so none can be probed, dropped or paid again — as a server-side Stop: '
  'ended_at, stopped_by = stale_hunt, hunt + party version, one append-only '
  'party_hunt_roster_log row (stop / stale_hunt) per hunter returned to solo. '
  'Writes no player_state and no ledger row. Party then party_hunt, both SKIP '
  'LOCKED; staleness re-judged under the lock. Executable by NO role; pg_cron '
  'runs it as the owner every 10 minutes (hr-party-reap).';

-- ── §3 THE SCHEDULE ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-party-reap'', ''*/10 * * * *'', '
                 '''select public.hr_party_reap_stale(200)'')';
  else
    perform public.hr_cron_ensure('hr-party-reap', '*/10 * * * *',
      'select public.hr_party_reap_stale(200)');
  end if;
end $$;

-- ── §4 GRANTS — revoke from PUBLIC first; NO role is granted it ─────────────
revoke execute on function public.hr_party_reap_stale(int) from public;
revoke execute on function public.hr_party_reap_stale(int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §5 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Combat ARMED unless stated. The reaper is called as the owner, exactly as
-- pg_cron calls it; the roster as hr_tick and the settle/apply as hr_engine.
--   k0  the installed reaper is this file's (md5); nothing in the schema
--       UPDATEs or DELETEs party_hunt_roster_log; the CHECKs carry 'stop'
--   s1  ★ PD1 REPRODUCED then ENDED: a party (RA, RB hunters; RS sat out) with
--       an ARMED hunt 30 h behind — not rostered, RA/RB partied. The reaper
--       ends it (stale_hunt), journals RA and RB (stop, stale_hunt, the stale
--       mark, own cap, hunters 0) and not RS; hr_partied false for both; NO
--       ledger row and NO player_state field moved for anyone; party version +1
--   s2  ★ the members accrue SOLO: RA's own hr_apply accrue lands as a non-party
--       row; the party path cannot pay the fenced span (no_party_hunt)
--   s3  ★ fresh hunts untouched: 1 h behind, and 24 h - 60 s behind (the
--       roster's side of the partition) — still live, no journal row
--   s4  ★ DISARMED: a 30 h-stale hunt in shadow is ended too (PD1's
--       "disarming does not clear it")
--   s5  idempotent: a second run reaps nothing and writes nothing
--   s6  identity: hr_engine and hr_tick are refused by name even inside the
--       owner's grant (42501)
--   kg  EXECUTE held by no role; SECURITY DEFINER; the journal still has no
--       privilege, RLS forced, no policy; hygiene STRICT
--   kc  the cron job is scheduled with its schedule and command (if pg_cron)
--   kr  the config switches this block flipped are restored and read back
-- Every probe row is rolled back by the sentinel exception.
do $$
declare
  v_ra     uuid := '00000000-0000-4000-8000-0000000e5001';
  v_rb     uuid := '00000000-0000-4000-8000-0000000e5002';
  v_rs     uuid := '00000000-0000-4000-8000-0000000e5003';
  v_fa     uuid := '00000000-0000-4000-8000-0000000e5004';
  v_fb     uuid := '00000000-0000-4000-8000-0000000e5005';
  v_ga     uuid := '00000000-0000-4000-8000-0000000e5006';
  v_gb     uuid := '00000000-0000-4000-8000-0000000e5007';
  v_da     uuid := '00000000-0000-4000-8000-0000000e5008';
  v_db     uuid := '00000000-0000-4000-8000-0000000e5009';
  c_h      constant text := 'hr1008r-selfcheck';
  v_cact   text;
  v_mark   timestamptz;
  v_p      uuid;  v_h  uuid;     -- the stale armed party
  v_fp     uuid;  v_fh uuid;     -- fresh, 1 h
  v_gp     uuid;  v_gh uuid;     -- 24 h - 60 s
  v_dp     uuid;  v_dh uuid;     -- stale, disarmed
  v_pver   bigint;
  v_r      jsonb;
  v_l0     bigint;
  v_j0     bigint;
  v_snap   jsonb;
  v_cfg_en boolean; v_cfg_ch text[]; v_cfg_ar text[];
  v_en     boolean; v_ch     text[]; v_ar     text[];
  v_caught boolean;
  r        record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_party_reap_stale(int)'::regprocedure)
         <> 'a85cd02f0da7b4eb01bf0047961744c1' then
      raise exception 'k0: the installed hr_party_reap_stale is not the one this file states';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and (p.prosrc ~* 'update\s+public\.party_hunt_roster_log'
                    or p.prosrc ~* 'delete\s+from\s+public\.party_hunt_roster_log')) then
      raise exception 'k0b: a function body UPDATEs or DELETEs party_hunt_roster_log — it is append-only';
    end if;

    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'] where id;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'k-fixture: hr_activities has no combat row'; end if;
    insert into auth.users (id) values (v_ra), (v_rb), (v_rs), (v_fa), (v_fb), (v_ga), (v_gb), (v_da), (v_db)
      on conflict do nothing;

    -- Four parties of hunters, each with every member's mark = the hunt's
    -- (invariant 8). RS's own mark moved on after a drop (served solo).
    v_mark := date_trunc('second', now()) - interval '30 hours';
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since,
                                     consec_falls, recovering_until)
    select u, 0, 500, 0, 7, 10, 1, m, 'combat', v_cact, '2000-01-01 00:00:00+00', 2, '2001-01-01 00:00:00+00'
      from (values (v_ra, v_mark), (v_rb, v_mark), (v_rs, now() - interval '1 hour'),
                   (v_fa, date_trunc('second', now()) - interval '1 hour'),
                   (v_fb, date_trunc('second', now()) - interval '1 hour'),
                   (v_ga, date_trunc('second', now()) - interval '24 hours' + interval '60 seconds'),
                   (v_gb, date_trunc('second', now()) - interval '24 hours' + interval '60 seconds'),
                   (v_da, v_mark), (v_db, v_mark)) t(u, m);
    insert into public.party (leader_user, leader_slot) values (v_ra, 0) returning id into v_p;
    insert into public.party (leader_user, leader_slot) values (v_fa, 0) returning id into v_fp;
    insert into public.party (leader_user, leader_slot) values (v_ga, 0) returning id into v_gp;
    insert into public.party (leader_user, leader_slot) values (v_da, 0) returning id into v_dp;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_p,  v_ra, 0, 'leader', now() - interval '40 hours'),
           (v_p,  v_rb, 0, 'member', now() - interval '39 hours'),
           (v_p,  v_rs, 0, 'member', now() - interval '38 hours'),
           (v_fp, v_fa, 0, 'leader', now() - interval '2 hours'),
           (v_fp, v_fb, 0, 'member', now() - interval '2 hours'),
           (v_gp, v_ga, 0, 'leader', now() - interval '25 hours'),
           (v_gp, v_gb, 0, 'member', now() - interval '25 hours'),
           (v_dp, v_da, 0, 'leader', now() - interval '40 hours'),
           (v_dp, v_db, 0, 'member', now() - interval '40 hours');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_p, v_cact, v_mark)
      returning id into v_h;
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_fp, v_cact, date_trunc('second', now()) - interval '1 hour') returning id into v_fh;
    insert into public.party_hunt (party_id, active_id, accrued_to)
      values (v_gp, v_cact, date_trunc('second', now()) - interval '24 hours' + interval '60 seconds') returning id into v_gh;
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_dp, v_cact, v_mark)
      returning id into v_dh;
    insert into public.party_hunt_roster_log
      (day_key, party_id, hunt_id, user_id, slot, event, reason, mark, cap_ms, hunters)
    values (public.hr_utc_day_key(now()), v_p, v_h, v_rs, 0, 'drop', 'fenced_cap', v_mark,
            public.hr_offline_cap_ms(v_rs, 0), 2);

    -- ── s1: PD1 reproduced — not rostered, members partied
    set local role hr_tick;
    select count(*) into v_l0
      from public.hr_party_roster(array['combat'], 200, c_h, 30000, null, null) x
     where x.party_id = v_p;
    reset role;
    if v_l0 <> 0 or not public.hr_partied(v_ra, 0) or not public.hr_partied(v_rb, 0)
       or public.hr_partied(v_rs, 0) then
      raise exception 's1a: the PD1 fixture is not PD1 (rostered %, RA/RB partied %/%, RS partied %)',
        v_l0, public.hr_partied(v_ra, 0), public.hr_partied(v_rb, 0), public.hr_partied(v_rs, 0);
    end if;
    -- the disarmed half is reaped below (s4); this run sees combat ARMED
    select count(*) into v_l0 from public.player_ledger
     where user_id in (v_ra, v_rb, v_rs, v_fa, v_fb, v_ga, v_gb, v_da, v_db);
    select jsonb_agg(to_jsonb(ps) order by ps.user_id) into v_snap from public.player_state ps
     where ps.user_id in (v_ra, v_rb, v_rs, v_fa, v_fb, v_ga, v_gb, v_da, v_db);
    select version into v_pver from public.party where id = v_p;
    -- The disarmed party sits this ARMED run out (parked as ended, reopened at
    -- s4), so s4 proves the disarmed case on its own.
    update public.party_hunt set ended_at = now(), stopped_by = 'gate' where id = v_dh;

    v_r := public.hr_party_reap_stale(200);

    -- (>= 1 and by id, not = 1: the reaper serves the whole table, and a real
    -- stale hunt at apply time is reaped too, then rolled back with the rest.)
    if coalesce((v_r->>'ok')::boolean, false) is not true or (v_r->>'reaped')::int < 1
       or not exists (select 1 from jsonb_array_elements(v_r->'hunts') e
                       where (e->>'hunt')::uuid = v_h and (e->>'members')::int = 2) then
      raise exception 's1b: the reaper did not end exactly the 30 h-stale hunt with its two hunters: %', v_r;
    end if;
    if (select ended_at is distinct from now() or stopped_by is distinct from 'stale_hunt'
               or accrued_to is distinct from v_mark
          from public.party_hunt where id = v_h)
       or (select version from public.party where id = v_p) <> v_pver + 1 then
      raise exception 's1c: the stale hunt was not stopped (ended_at now(), stale_hunt, mark kept, party version +1)';
    end if;
    if (select count(*) from public.party_hunt_roster_log where hunt_id = v_h and event = 'stop') <> 2
       or exists (select 1 from public.party_hunt_roster_log where hunt_id = v_h and event = 'stop' and user_id = v_rs)
       or exists (select 1 from public.party_hunt_roster_log
                   where hunt_id = v_h and event = 'stop'
                     and (reason <> 'stale_hunt' or mark <> v_mark or hunters <> 0 or at <> now()
                          or day_key <> public.hr_utc_day_key(now()) or member_mark is not null
                          or cap_ms is distinct from public.hr_offline_cap_ms(user_id, slot))) then
      raise exception 's1d: the stop was not journalled as one row per hunter (RA, RB; not RS) with the stale mark, own cap, hunters 0, server time';
    end if;
    if public.hr_partied(v_ra, 0) or public.hr_partied(v_rb, 0) or public.hr_partied(v_rs, 0) then
      raise exception 's1e: a member of the reaped hunt is still partied';
    end if;
    if (select count(*) from public.player_ledger
         where user_id in (v_ra, v_rb, v_rs, v_fa, v_fb, v_ga, v_gb, v_da, v_db)) <> v_l0
       or (select jsonb_agg(to_jsonb(ps) order by ps.user_id) from public.player_state ps
            where ps.user_id in (v_ra, v_rb, v_rs, v_fa, v_fb, v_ga, v_gb, v_da, v_db)) is distinct from v_snap then
      raise exception 's1f: the reaper wrote a ledger row or moved a player_state field — it pays nothing';
    end if;

    -- ── s2: SOLO accrue lands; the party path cannot pay the fenced span
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_p, v_mark, v_mark + interval '90 seconds',
             '00000000-0000-4000-8000-0000000e5101',
             (select jsonb_agg(jsonb_build_object('user', u, 'slot', 0, 'version', 1,
                       'delta', jsonb_build_object('accrued_to', v_mark + interval '90 seconds'))
                       order by u) from unnest(array[v_ra, v_rb]) u));
    reset role;
    if v_r->>'error' is distinct from 'no_party_hunt' then
      raise exception 's2a: the party path still answers for the reaped hunt: %', v_r;
    end if;
    set local role hr_engine;
    v_r := public.hr_apply(v_ra, 0, 1, '00000000-0000-4000-8000-0000000e5102',
             jsonb_build_object('gold', 11, 'accrued_to', to_jsonb(date_trunc('second', now())),
               'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                 'meta', jsonb_build_object('ticks', 1))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true
       or (select count(*) from public.player_ledger
            where user_id = v_ra and kind = 'combat' and intent = 'accrue' and not (meta ? 'party')) <> 1 then
      raise exception 's2b: RA''s own solo accrue did not land after the reap: %', v_r;
    end if;

    -- ── s3: fresh hunts (1 h, and the roster's edge 24 h - 60 s) untouched
    if exists (select 1 from public.party_hunt where id in (v_fh, v_gh) and ended_at is not null)
       or exists (select 1 from public.party_hunt_roster_log where hunt_id in (v_fh, v_gh))
       or not public.hr_partied(v_fa, 0) or not public.hr_partied(v_ga, 0) then
      raise exception 's3: the reaper touched a hunt inside 24 h';
    end if;

    -- ── s4: DISARMED — a 30 h-stale hunt in shadow is ended too
    update public.party_hunt set ended_at = null, stopped_by = null where id = v_dh;
    update public.hr_tick_config set armed_channels = '{}' where id;
    if not public.hr_partied(v_da, 0) then raise exception 's4-fixture: DA is not partied'; end if;
    v_r := public.hr_party_reap_stale(200);
    if not exists (select 1 from jsonb_array_elements(v_r->'hunts') e
                    where (e->>'hunt')::uuid = v_dh and (e->>'members')::int = 2)
       or (select stopped_by from public.party_hunt where id = v_dh) is distinct from 'stale_hunt'
       or public.hr_partied(v_da, 0) or public.hr_partied(v_db, 0)
       or (select count(*) from public.party_hunt_roster_log where hunt_id = v_dh and event = 'stop') <> 2 then
      raise exception 's4: a 30 h-stale hunt with combat DISARMED was not ended: %', v_r;
    end if;

    -- ── s5: idempotent
    select count(*) into v_j0 from public.party_hunt_roster_log;
    v_r := public.hr_party_reap_stale(200);
    if (v_r->>'reaped')::int <> 0 or (select count(*) from public.party_hunt_roster_log) <> v_j0 then
      raise exception 's5: a second run reaped or journalled again: %', v_r;
    end if;

    -- ── s6: identity, by name, for every role a request arrives as
    for r in select rolname from pg_roles where rolname in ('hr_engine', 'hr_tick') loop
      v_caught := false;
      begin
        execute format('set local role %I', r.rolname);
        perform public.hr_party_reap_stale(1);
      exception when insufficient_privilege then v_caught := true;
      end;
      reset role;
      if not v_caught then
        raise exception 's6: % could run hr_party_reap_stale', r.rolname;
      end if;
    end loop;

    -- ── kg: EXECUTE held by no role; the journal still locked down
    for r in select c.role from (values ('public'), ('anon'), ('authenticated'), ('service_role'),
                                        ('hr_engine'), ('hr_tick')) c(role) loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, 'public.hr_party_reap_stale(int)', 'execute') then
          raise exception 'kg: % holds EXECUTE on hr_party_reap_stale', r.role;
        end if;
      end if;
    end loop;
    if not (select prosecdef from pg_proc where oid = 'public.hr_party_reap_stale(int)'::regprocedure) then
      raise exception 'kg: hr_party_reap_stale is not SECURITY DEFINER';
    end if;
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

    -- ── kc: the schedule
    if to_regclass('cron.job') is not null
       and not exists (select 1 from cron.job where jobname = 'hr-party-reap'
                        and schedule = '*/10 * * * *'
                        and command = 'select public.hr_party_reap_stale(200)') then
      raise exception 'kc: cron job hr-party-reap is not scheduled every 10 minutes with its command';
    end if;

    -- ── kr
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    select armed_channels, enabled, channels into v_ar, v_en, v_ch from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_ch is distinct from v_cfg_ch then
      raise exception 'kr: hr_tick_config was not restored';
    end if;

    raise exception 'HR1008R_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1008R_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-party-reaper: EXECUTED — a 30 h-stale hunt (armed AND disarmed) is ended as a '
               'server Stop, journalled per hunter (stop/stale_hunt), its members un-partied and able to '
               'accrue solo; nothing paid, no player_state moved, the party path closed; hunts inside 24 h '
               'untouched; idempotent; executable by no role; hygiene strict — all green';
end $$;
