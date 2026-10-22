-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EACH HERO'S PERSONAL BEST ON EVERY GROUND, SOLO AND PARTY, AND
-- BALANCE PER HOUR FOR EVERYONE. STAGED, NOT APPLIED (lane/b-picker-best,
-- backend-architect, 2026-10-21). Game CLOSED: applies on its passing §7;
-- Security reviews it in the reopen gate.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Designer ruling 2026-10-21 (Andy's notes "Hunt selection: show best hunt
-- values"; Tyler 2026-10-14 "hunt cards show personal-best XP/h and gp/h, Solo
-- and Party separately"): each ground on the hunt picker shows THIS hero's best
-- XP per hour and best balance per hour (net of supplies), Solo and Party apart,
-- from the server's finished sessions of at least 10 minutes. And the hunt
-- summary shows balance per hour to every character (raw XP per hour stays
-- premium, the 10-19 analyzer ruling).
-- A read over hunt_sessions cannot answer "best ever": hr_hunt_open_session
-- keeps only the last `sessions_kept` (20) sessions per character, and the
-- envelope is re-read on every hunt poll, so an O(sessions) fold per read is
-- the wrong cost anyway. The best is an AGGREGATE, folded ONCE when a session
-- ends (CLAUDE.md law 6: journal aggregates, never per tick).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 hunt_bests                  NEW. One row per (character, ground, mode);
--      mode 'solo' | 'party'. xp_h / balance_h are INDEPENDENT maxima, each with
--      the session it came from. Server-only: RLS on, no policy, no client grant;
--      FK to player_state, on delete cascade (a deleted character takes its bests).
--   §2 hr_hunt_best_min()          NEW. The qualifying wall time, 10 minutes:
--      the ONE copy (the fold reads it, the section projects it as `min_ms`, the
--      client's empty state reads the projection).
--      hr_hunt_best_fold(session)   NEW, internal. A finished session of at least
--      hr_hunt_best_min() of WALL time (entered_at -> ended_at, the analyzer's own
--      per-hour basis) folds into its character's row: XP per hour and balance
--      per hour are the ANALYZER'S figures for that session
--      (hr_hunt_stats_of(array[id], wall_h, null, null)->'per_hour', i.e. the
--      hero's OWN tally, never the party's), so the picker's best equals the
--      summary that hunt showed. Mode: 'party' when another character's session
--      shared the instance and overlapped it in time (the analyzer's party rule),
--      else 'solo'. Upsert with greatest(): commutative and idempotent, so a
--      re-fold or the backfill never moves a best that is already higher.
--   §3 hr_hunt_best_on_end          NEW constraint trigger on hunt_sessions,
--      AFTER UPDATE OF ended_at, WHEN old.ended_at is null and new.ended_at is
--      not null, DEFERRABLE INITIALLY DEFERRED: it folds at COMMIT, so it reads
--      the tally exactly as the settle that ended the hunt left it, whatever the
--      order of the writes inside that settle. Every end path (settle, leave,
--      death, party death, stamina, gold, server) is covered by one hook; online
--      and offline are the same path (the browser plays no part).
--   §4 BACKFILL: every already-finished session of 10 minutes or more folds once
--      (idempotent: a re-apply moves nothing).
--   §5 hr_hunt_bests_view + the `hunt_bests` envelope section:
--      { min_ms, grounds: { <hunt_id>: { solo?: {xp_h, balance_h}, party?: {...} } } }
--      the caller's own character only (hr_state_of's (user, slot)).
--   §6 hr_hunt_analyzer_basic RESTATED (§0 pins the 2026-10-26 image): the free
--      `per_hour` block gains `balance` (it already carried the session's
--      balance). raw_xp / waste per hour stay premium.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- The fold is one INSERT .. ON CONFLICT DO UPDATE on the row's primary key:
-- two ends folding into one row serialise on that row, and greatest() makes the
-- result order-independent. No read-modify-write crosses a call.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new on the client surface: no RPC is added or granted; the section is the
-- caller's own rows. The numbers are display only (nothing gates, spends or
-- ranks on them) and are derived only from server tallies. A party member's
-- figures never enter another member's row (the fold reads the ending session's
-- own tally, keyed by that session's own user and slot).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- Rows: at most (grounds x 2) per character: 6 grounds -> 12 rows, ~150 B each.
-- At 100x today's players (a few thousand characters) that is well under 10 MB.
-- Write: one upsert per finished session. Read: one PK-prefix scan per envelope.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop trigger hr_hunt_best_on_end on public.hunt_sessions; delete from
-- public.hr_state_sections where key = 'hunt_bests'; drop the four functions and
-- the table; re-apply hr_hunt_analyzer_basic from 2026-10-26-hunt-analyzer-basic.sql.
-- ORDER: after 2026-11-04-party-outfits.sql (last in the chain). The fold reads
-- hr_hunt_stats_of as 2026-11-06-hunt-analyzer-min-window.sql left it (rates null
-- under 10 min of wall time; a fold needs 10 min, so it always reads numbers).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_session_tally') is null
     or to_regclass('public.hunt_instances') is null or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-11-03-hunt-analyzer-level-eta.sql and the hunt-session chain first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_analyzer_basic(jsonb)');
  if v_md5 is null then raise exception 'PRECONDITION: hr_hunt_analyzer_basic is absent (apply 2026-10-26-hunt-analyzer-basic.sql)'; end if;
  -- the 2026-10-26 image, or this file's own (a second apply is a no-op restate)
  if v_md5 <> 'cda9400704b02b8a51bd0e5b394fd027' and v_md5 <> '632a2a2c6a40d1f6f76be07ca63b8bbd' then
    raise exception 'PIN: hr_hunt_analyzer_basic is neither the 2026-10-26 image (cda94007...) nor this file''s (632a2a2c...) - md5 %: another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE BESTS ─────────────────────────────────────────────────────────────
create table if not exists public.hunt_bests (
  user_id         uuid not null,
  slot            int  not null,
  hunt_id         text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  mode            text not null check (mode in ('solo', 'party')),
  xp_h            bigint not null,
  xp_session      uuid not null,
  balance_h       bigint not null,
  balance_session uuid not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, slot, hunt_id, mode),
  constraint hunt_bests_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade
);
alter table public.hunt_bests enable row level security;
revoke all on public.hunt_bests from public, anon, authenticated, service_role;
comment on table public.hunt_bests is
  '2026-11-04-hunt-bests.sql: each character''s best XP per hour and best balance per hour per hunt ground, '
  'solo and party apart, from its finished sessions of at least hr_hunt_best_min() of wall time. Written only by '
  'hr_hunt_best_fold (the hr_hunt_best_on_end trigger at session end); read only by hr_hunt_bests_view. '
  'RLS on, no policy, no client grant.';

-- ── §2 THE THRESHOLD AND THE FOLD ────────────────────────────────────────────
create or replace function public.hr_hunt_best_min()
returns interval language sql immutable set search_path = public, pg_catalog as $$
  select interval '10 minutes'
$$;
revoke execute on function public.hr_hunt_best_min() from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_best_fold(p_session uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_s      public.hunt_sessions%rowtype;
  v_wall_h numeric;
  v_mode   text;
  v_ph     jsonb;
  v_xp     bigint;
  v_bal    bigint;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  if not found or v_s.ended_at is null or v_s.ended_at - v_s.entered_at < public.hr_hunt_best_min() then return; end if;
  -- THE ANALYZER'S CLOCK: wall hours, entered -> ended (hr_hunt_analyzer_of's v_wall_h).
  v_wall_h := extract(epoch from (v_s.ended_at - v_s.entered_at)) / 3600.0;
  -- THE ANALYZER'S PARTY: another character's session in this instance whose hunt overlapped this one.
  v_mode := case when exists (
      select 1 from public.hunt_sessions h
       where h.instance_id = v_s.instance_id and h.id <> v_s.id
         and (h.user_id, h.slot) <> (v_s.user_id, v_s.slot)
         and h.entered_at <= v_s.ended_at and coalesce(h.ended_at, now()) >= v_s.entered_at)
    then 'party' else 'solo' end;
  -- THE HERO'S OWN figures, exactly as its analyzer showed them (never the party's sum).
  v_ph := public.hr_hunt_stats_of(array[v_s.id], v_wall_h, null, null)->'per_hour';
  v_xp := (v_ph->>'xp')::numeric::bigint;
  v_bal := (v_ph->>'balance')::numeric::bigint;
  if v_xp is null or v_bal is null then return; end if;
  insert into public.hunt_bests as b (user_id, slot, hunt_id, mode, xp_h, xp_session, balance_h, balance_session)
    values (v_s.user_id, v_s.slot, v_s.hunt_id, v_mode, v_xp, v_s.id, v_bal, v_s.id)
  on conflict (user_id, slot, hunt_id, mode) do update
    set xp_h            = greatest(b.xp_h, excluded.xp_h),
        xp_session      = case when excluded.xp_h > b.xp_h then excluded.xp_session else b.xp_session end,
        balance_h       = greatest(b.balance_h, excluded.balance_h),
        balance_session = case when excluded.balance_h > b.balance_h then excluded.balance_session else b.balance_session end,
        updated_at      = case when excluded.xp_h > b.xp_h or excluded.balance_h > b.balance_h then now() else b.updated_at end;
end $$;
revoke execute on function public.hr_hunt_best_fold(uuid) from public, anon, authenticated, service_role;

-- ── §3 THE HOOK: every session end folds once, at commit ─────────────────────
create or replace function public.hr_hunt_best_on_end()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  perform public.hr_hunt_best_fold(new.id);
  return null;
end $$;
revoke execute on function public.hr_hunt_best_on_end() from public, anon, authenticated, service_role;
do $mig$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hunt_sessions'::regclass
                  and tgname = 'hr_hunt_best_on_end' and not tgisinternal) then
    create constraint trigger hr_hunt_best_on_end
      after update of ended_at on public.hunt_sessions
      deferrable initially deferred
      for each row when (old.ended_at is null and new.ended_at is not null)
      execute function public.hr_hunt_best_on_end();
  end if;
end $mig$;

-- ── §4 BACKFILL: the sessions already finished (idempotent) ──────────────────
do $mig$
declare v_id uuid;
begin
  for v_id in select h.id from public.hunt_sessions h
               where h.ended_at is not null and h.ended_at - h.entered_at >= public.hr_hunt_best_min()
               order by h.ended_at, h.id loop
    perform public.hr_hunt_best_fold(v_id);
  end loop;
end $mig$;

-- ── §5 THE `hunt_bests` SECTION ──────────────────────────────────────────────
create or replace function public.hr_hunt_bests_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'min_ms', (extract(epoch from public.hr_hunt_best_min()) * 1000)::bigint,
    'grounds', coalesce((select jsonb_object_agg(g.hunt_id, g.modes)
                           from (select b.hunt_id, jsonb_object_agg(b.mode, jsonb_build_object('xp_h', b.xp_h, 'balance_h', b.balance_h)) as modes
                                   from public.hunt_bests b
                                  where b.user_id = p_user and b.slot = p_slot
                                  group by b.hunt_id) g), '{}'::jsonb))
$$;
revoke execute on function public.hr_hunt_bests_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_bests', 'hr_hunt_bests_view', '2026-11-04-hunt-bests.sql: this hero''s best XP per hour and balance per hour per ground, solo and party apart, from finished sessions of at least min_ms')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §6 THE BASIC ANALYZER CARRIES BALANCE PER HOUR (designer 2026-10-21) ─────
create or replace function public.hr_hunt_analyzer_basic(p_a jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select case when p_a is null or jsonb_typeof(p_a) <> 'object' then null else jsonb_build_object(
    'tier', 'basic',
    'session', jsonb_build_object('id', p_a->'session'->'id', 'hunt', p_a->'session'->'hunt',
                 'entered_at', p_a->'session'->'entered_at', 'ended_at', p_a->'session'->'ended_at',
                 'end_reason', p_a->'session'->'end_reason', 'phase', p_a->'session'->'phase'),
    'wall_ms', p_a->'wall_ms', 'hunt_ms', p_a->'hunt_ms',
    'hero', jsonb_build_object(
      'kills', p_a->'hero'->'kills', 'xp', p_a->'hero'->'xp',
      'gold', p_a->'hero'->'gold', 'gold_basis', p_a->'hero'->'gold_basis', 'coins', p_a->'hero'->'coins',
      'loot_value', p_a->'hero'->'loot_value', 'loot', p_a->'hero'->'loot',
      'balance', p_a->'hero'->'balance',
      'supplies', jsonb_build_object('own', p_a->'hero'->'supplies'->'own', 'store', p_a->'hero'->'supplies'->'store'),
      'per_hour', case when jsonb_typeof(p_a->'hero'->'per_hour') = 'object' then jsonb_build_object(
                    'xp', p_a->'hero'->'per_hour'->'xp', 'gold', p_a->'hero'->'per_hour'->'gold',
                    'balance', p_a->'hero'->'per_hour'->'balance',
                    'kills', p_a->'hero'->'per_hour'->'kills') end))
  end
$$;
revoke execute on function public.hr_hunt_analyzer_basic(jsonb) from public, anon, authenticated, service_role;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a    constant uuid := '000000c0-0000-0000-0000-00000be57a01';   -- the hero
  v_b    constant uuid := '000000c0-0000-0000-0000-00000be57a02';   -- another player, A's party mate
  v_p    constant uuid := '000000c0-0000-0000-0000-00000be57a0f';   -- the party instance
  v      jsonb;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_pa uuid; v_pb uuid; v_sb uuid;
  v_role text;
  v_fn   text;
  -- Every probe session ends at now() (fixed in this transaction), its length set by entered_at;
  -- the solo ones are each their own instance, so ending at one instant makes none of them a party.
begin
  begin
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'hunt-bests §7 probe'), (v_b, 'hunt-bests §7 probe')
      on conflict (user_id) do nothing;
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(A) refused'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(B) refused'; end if;
    -- The real end path: the deferred trigger, fired here at once instead of at the probe's (never reached) commit.
    set constraints public.hr_hunt_best_on_end immediate;

    -- (a) A 9-MINUTE SESSION DOES NOT COUNT, however rich.
    v_s1 := public.hr_hunt_new_session(v_a, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '9 minutes 59 seconds' where id = v_s1;
    update public.hunt_session_tally set kills = 900, xp = '{"level": 90000}'::jsonb, coins = 90000 where session_id = v_s1;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_s1;
    if exists (select 1 from public.hunt_bests where user_id = v_a) then
      raise exception 'VERIFY(a): a session under 10 minutes folded: %', (select jsonb_agg(to_jsonb(b)) from public.hunt_bests b where user_id = v_a); end if;

    -- (b) BEST OF SEVERAL PICKS THE MAX, each figure on its own: S2 (1 h) has the XP, S3 (30 min) the balance.
    v_s2 := public.hr_hunt_new_session(v_a, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '1 hour' where id = v_s2;
    update public.hunt_session_tally set kills = 50, xp = '{"level": 6000, "melee": 4000}'::jsonb, coins = 300, supply_gold = 200 where session_id = v_s2;
    update public.hunt_sessions set ended_at = now(), end_reason = 'stamina' where id = v_s2;
    v_s3 := public.hr_hunt_new_session(v_a, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '30 minutes' where id = v_s3;
    update public.hunt_session_tally set kills = 20, xp = '{"level": 2000}'::jsonb, coins = 1000, supply_gold = 0 where session_id = v_s3;
    update public.hunt_sessions set ended_at = now(), end_reason = 'died' where id = v_s3;
    if (select count(*) from public.hunt_bests where user_id = v_a) <> 1
       or not exists (select 1 from public.hunt_bests where user_id = v_a and slot = 0 and hunt_id = 'mill_cellar' and mode = 'solo'
                         and xp_h = 10000 and xp_session = v_s2 and balance_h = 2000 and balance_session = v_s3) then
      raise exception 'VERIFY(b): best of several is not XP 10000/h (S2) and balance 2000/h (S3): %',
        (select jsonb_agg(to_jsonb(b)) from public.hunt_bests b where user_id = v_a); end if;
    -- the figures are the analyzer's for that session (the summary and the picker agree)
    if (public.hr_hunt_stats_of(array[v_s2], 1.0, null, null)->'per_hour'->>'xp')::bigint <> 10000 then
      raise exception 'VERIFY(b): the fold is not the analyzer''s per-hour XP'; end if;
    -- a re-fold and a worse session move nothing (idempotent, greatest)
    perform public.hr_hunt_best_fold(v_s2);
    perform public.hr_hunt_best_fold(v_s1);
    if not exists (select 1 from public.hunt_bests where user_id = v_a and xp_h = 10000 and xp_session = v_s2 and balance_h = 2000 and balance_session = v_s3) then
      raise exception 'VERIFY(b): a re-fold moved the best'; end if;

    -- (c) SOLO AND PARTY APART: A and B share a party instance on the same ground for 20 minutes.
    insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at) values (v_p, 'mill_cellar', 'party', now(), now());
    v_pa := public.hr_hunt_open_session(v_a, 0, 'mill_cellar', null, 0, null, v_p, now(), 0);
    v_pb := public.hr_hunt_open_session(v_b, 0, 'mill_cellar', null, 0, null, v_p, now(), 1);
    update public.hunt_sessions set entered_at = now() - interval '20 minutes' where id in (v_pa, v_pb);
    update public.hunt_session_tally set xp = '{"level": 1000}'::jsonb, coins = 100 where session_id = v_pa;   -- A: 3000 XP/h, 300/h
    update public.hunt_session_tally set xp = '{"level": 9000}'::jsonb, coins = 3000 where session_id = v_pb;  -- B: 27000 XP/h, 9000/h
    update public.hunt_sessions set ended_at = now(), end_reason = 'party_member_died' where id in (v_pa, v_pb);
    if not exists (select 1 from public.hunt_bests where user_id = v_a and hunt_id = 'mill_cellar' and mode = 'party' and xp_h = 3000 and balance_h = 300)
       or not exists (select 1 from public.hunt_bests where user_id = v_a and hunt_id = 'mill_cellar' and mode = 'solo' and xp_h = 10000 and balance_h = 2000) then
      raise exception 'VERIFY(c): solo/party split wrong: %', (select jsonb_agg(to_jsonb(b)) from public.hunt_bests b where user_id = v_a); end if;

    -- (d) ANOTHER PLAYER'S SESSIONS NEVER LEAK: B's richer party hunt and a B solo hunt on another ground
    -- are B's alone; A's section names only A's rows, B's only B's.
    v_sb := public.hr_hunt_new_session(v_b, 0, 'meadowbrook_thicket', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '15 minutes' where id = v_sb;
    update public.hunt_session_tally set xp = '{"level": 5000}'::jsonb, coins = 500 where session_id = v_sb;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_sb;
    v := public.hr_state_of(v_a, 0)->'hunt_bests';
    if v is null or (v->>'min_ms')::bigint <> 600000
       or v->'grounds' <> '{"mill_cellar": {"solo": {"xp_h": 10000, "balance_h": 2000}, "party": {"xp_h": 3000, "balance_h": 300}}}'::jsonb then
      raise exception 'VERIFY(d): A''s section is %', v; end if;
    v := public.hr_hunt_bests_view(v_b, 0);
    if v->'grounds' <> '{"mill_cellar": {"party": {"xp_h": 27000, "balance_h": 9000}}, "meadowbrook_thicket": {"solo": {"xp_h": 20000, "balance_h": 2000}}}'::jsonb then
      raise exception 'VERIFY(d): B''s section is %', v; end if;
    if exists (select 1 from public.hunt_bests where user_id = v_a and (xp_session in (v_pb, v_sb) or balance_session in (v_pb, v_sb))) then
      raise exception 'VERIFY(d): B''s session reached A''s bests'; end if;

    -- (e) THE BASIC ANALYZER: a free character reads balance per hour, still not raw XP / waste per hour.
    v := public.hr_hunt_analyzer_basic(public.hr_hunt_analyzer_of(v_a, 0, v_s3));
    if (v->'hero'->'per_hour'->>'balance')::bigint is distinct from 2000
       or v->'hero'->'per_hour' ? 'raw_xp' or v->'hero'->'per_hour' ? 'waste' or v->'hero' ? 'raw_xp' then
      raise exception 'VERIFY(e): the basic per-hour block is %', v->'hero'->'per_hour'; end if;

    raise exception using errcode = 'HR874', message = 'hunt-bests §7 complete - rolling back';
  exception when sqlstate 'HR874' then
    null;
  end;
  set constraints public.hr_hunt_best_on_end deferred;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hunt_bests where user_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.hunt_instances where id = v_p) then
    raise exception 'VERIFY(f): §7 LEAKED a probe row'; end if;
  -- (f) SERVER-ONLY: no client policy, RLS on, no client grant on the table or any new function.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_bests')
     or not (select relrowsecurity from pg_class where oid = 'public.hunt_bests'::regclass) then
    raise exception 'VERIFY(f): hunt_bests carries a policy or has RLS off'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hunt_bests', 'select') or has_table_privilege(v_role, 'public.hunt_bests', 'insert')
       or has_table_privilege(v_role, 'public.hunt_bests', 'update') or has_table_privilege(v_role, 'public.hunt_bests', 'delete') then
      raise exception 'VERIFY(f): % holds a privilege on hunt_bests', v_role; end if;
    foreach v_fn in array array['public.hr_hunt_best_fold(uuid)', 'public.hr_hunt_best_on_end()', 'public.hr_hunt_best_min()',
                                'public.hr_hunt_bests_view(uuid,integer)', 'public.hr_hunt_analyzer_basic(jsonb)'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then raise exception 'VERIFY(f): % reaches %', v_role, v_fn; end if;
    end loop;
  end loop;
  -- (g) the hook is the deferred constraint trigger, once.
  if (select count(*) from pg_trigger where tgrelid = 'public.hunt_sessions'::regclass and tgname = 'hr_hunt_best_on_end'
         and tgdeferrable and tginitdeferred and not tgisinternal) <> 1 then
    raise exception 'VERIFY(g): hr_hunt_best_on_end is not one deferrable, initially deferred trigger'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-bests: under 10 min never counts; each best is its own max; solo and party apart; another player''s never leaks; basic balance per hour; all green';
end $$;
