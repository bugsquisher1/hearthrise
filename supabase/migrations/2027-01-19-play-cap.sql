-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PLAY CAP: at most four heroes PLAYING at once per account,
-- and per network (lane c-play-cap, backend-architect, 2026-10-24).
-- STAGED. Game CLOSED: applies on its passing §7 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC. On the
-- reopen Security review list (it gates who may start accruing XP, loot and gold).
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-17 (rulings of record): "Up to 4 characters can play AT ONCE, free. A
-- 4-per-hashed-IP concurrent cap is mandatory." Until this file the limit lived only in
-- the client (src/session/account-session.js limit(): how many CharacterSessions a tab
-- opens). The server counted nothing: hr_hunt_enter_check refused only this hero's own
-- open hunt or a non-town activity, and a closed session leaves its hunt running (by
-- design, CLAUDE.md §1), so a forged or merely re-opened client could have every hero
-- of the account playing at once (5 today, more if slots are sold), and any number of
-- accounts could play from one network. CLAUDE.md §6: a server capability is never
-- gated on a client-held value.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- PLAYING (hr_playing, the one definition): the hero accrues on the server, i.e. it has
--   an open hunt OR a running town activity (player_state.active_kind other than idle).
-- THE CAP: hr_hunt_limit('max_concurrent'), the generated row of src/session/config.js
--   maxConcurrentCharacters (4), which the client already reads as account.max_concurrent.
--   ONE value for both counts: a network may play as many heroes as one account may
--   (Tyler's two 4s are one player's worth); a different per-network number would be a
--   new generated row, not a literal here.
-- A START is a hero going from not playing to playing. It is refused when, beside it,
--   (a) `max` other heroes of its ACCOUNT already play  -> too_many_playing {max, playing}
--   (b) `max` other heroes play from its NETWORK, any account -> too_many_playing_here {max}
--   (b's count is not echoed: it would tell a stranger behind the same address that
--   somebody plays). A hero that already plays never counts twice: a town activity that
--   yields to a hunt, a hunt that changes ground (hr_hunt_swap), the settle's resume after
--   a hunt ends (combat -> idle -> the last activity, in ONE transaction) are not starts.
-- THE DOORS, ALL OF THEM (measured live 2026-10-24: every body that opens a hunt or
--   moves active_kind off idle):
--   · hr_hunt_enter, hr_hunt_restart, hr_hunt_party_start: every one enters through
--     hr_hunt_enter_for, which takes the play locks after the character's and refuses a
--     clean {ok:false, error} BEFORE it writes. A party Start judges each seat with
--     hr_party_seat_ready, which counts the seats ahead of it that Start enters first, so
--     the party view's `ready` is what Start will do.
--   · set_activity (hr-accrue -> hr_apply's activity statement: gathering, a bench run):
--     the guard trigger below, inside hr_apply's protected block. It raises through
--     hr_reject (HR000), which hr_apply already returns as {ok:false, error, max, ...}
--     and the edge returns as a 409 refusal. No edge change.
--   · ANY other writer of player_state.active_kind (a future door, a hand-written
--     UPDATE): the same trigger. It is the backstop that makes "every path" true by
--     construction rather than by audit.
--   hr_hunt_party_join / _accept / _invite_own only SEAT a hero (it plays from Start).
-- THE NETWORK (the per-IP half). Never the raw address: a salted SHA-256 of the IPv4
--   address, or of the IPv6 /64 (a household's prefix; its devices rotate through the
--   rest), or an IPv4-mapped IPv6 address as the IPv4 one. The salt is a new server-only
--   secret, hr_server_secrets 'play_net' (32 random bytes, no client or engine grant).
--   SOURCE: hr_request_ip(), Cloudflare's cf-connecting-ip (Cloudflare overwrites it;
--   the project answers `server: cloudflare`, checked 2026-10-24), only on the account's
--   OWN PostgREST call. hr_load and every PostgREST start store it per account
--   (account_play_net, written only when it changes); a start that is NOT the account's
--   own call (the engine's town activity, a party leader's Start of another player's
--   hero) uses that stored value. STAMPED at the start on the hero (hero_play_net) and
--   counted only while the hero plays: it expires with the activity, by join, so no
--   sweep is needed and the table holds at most one row per hero.
--   UNKNOWN NETWORK (no stored value yet: an account that never made a PostgREST call
--   since this apply, or an address that does not parse): that start is NOT counted per
--   network; the account cap still holds. Refusing instead would lock out any database
--   path without request headers (the engine, every PGlite guard). The honest client
--   always calls hr_load first; only an engine-only client skips it (Known limits).
--
-- ── CONCURRENCY ──────────────────────────────────────────────────────────────
-- Two transaction-scoped advisory locks, hr_play_lock_key('account', uid) then
-- hr_play_lock_key('net', hex), taken AFTER the hero's character lock and BEFORE any
-- count is read; every count is a fresh READ COMMITTED statement after them, so of two
-- racing starts on one account or one network the second waits and then counts the
-- first. Global order: party row -> characters (seat order) -> the account's
-- account_play_net row (written only on a change) -> account locks (sorted) -> network
-- locks (sorted). hr_apply's trigger path is character -> account -> network, so a party
-- Start pre-locks every seat's character and then every account and network
-- (hr_play_lock_seats) before entering the first seat: no Start holds an account lock
-- while waiting for a character another start holds. A seat already hunting is not
-- pre-locked (the instance settle holds the instance, then those heroes).
-- IDEMPOTENCY: unchanged. hr_hunt_enter / restart / party_start keep their intent
-- replay; a refusal is recorded under the key like every other refusal, so a replay
-- returns it and a new press is a new key. hr_apply's key semantics are untouched.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 the 'play_net' secret; account_play_net and hero_play_net (RLS on, no policy, no
--    client or engine grant).
-- §2 the network: hr_play_net_hash, hr_play_net_of, hr_play_net_note.
-- §3 the count and the locks: hr_playing, hr_play_refusal, hr_play_lock_key,
--    hr_play_lock, hr_play_lock_for, hr_play_lock_seats, hr_play_claim.
-- §4 the guard trigger: hr_play_cap_guard, AFTER INSERT / UPDATE OF active_kind on
--    player_state.
-- §5 RESTATED WHOLE from the live images (md5 of prosrc, measured read-only 2026-10-24,
--    equal to the replay chain's): hr_hunt_enter_for, hr_party_seat_ready,
--    hr_hunt_party_start, hr_load. Each keeps its signature, volatility, definer,
--    search_path and grants; the only lines added are the PLAY-CAP ones.
-- §6 grants: every new function is owner-only.
-- §7 self-check, executed, every probe row rolled back.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Shrinks it: a start the client could make before is refused now. Nothing is granted
-- to a client; no price, clamp or ledger rule moves; no row of player data changes.
-- New stored data is two 32-byte hashes per account / hero, readable by no client.
-- Grandfathered: heroes already playing at apply (live 2026-10-24: 4 on QA, 4 on Andy,
-- 1 on bf18bd7f; no two of these accounts share a network) are never stopped (never
-- evict on uncertainty); they carry no network stamp until they start again.
--
-- ── KNOWN LIMITS (stated, not hidden) ────────────────────────────────────────
-- · An engine-only client (hr-accrue set_activity, never a PostgREST call) has no stored
--   network, so its town activities are capped per account only. Closing it needs the
--   edge to forward the client address it sees; that header's trust on Supabase's edge
--   gateway is unverified, so it is not half-enforced here.
-- · An address is not a person: a VPN defeats the network cap, and a carrier NAT or a
--   household behind one address shares four heroes (measured live 2026-10-24 over
--   auth.sessions: 53 addresses for 44 accounts, at most 2 accounts per address, no two
--   playing accounts on one).
-- · A hero keeps the network it STARTED from while it plays.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the two triggers, re-apply the four pre-images (hr_hunt_enter_for and
-- hr_party_seat_ready / hr_hunt_party_start / hr_load from 2026-12-05-hunt-setup-per-
-- ground.sql, 2026-12-07-party-finder.sql, 2026-11-02-hero-creation.sql), then drop the
-- §2/§3 functions, the two tables and the 'play_net' secret row. No player value is
-- touched either way.
-- ORDER: after 2027-01-18-dead-surfaces-cut.sql. No begin/commit.
-- COST: per hr_load one PK read of account_play_net (a write only when the address
-- changes); per start two advisory locks and two counts over at most a handful of rows
-- (an account's heroes; the heroes stamped with one network, by index). Rows at 100x
-- players: one per account + one per hero (~70 bytes each), never per tick.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text; v_name text; v_pin text[];
begin
  if to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)') is null
     or to_regprocedure('public.hr_party_seat_ready(uuid,uuid,integer,text,uuid,timestamp with time zone)') is null
     or to_regprocedure('public.hr_hunt_party_start(integer,text,uuid)') is null
     or to_regprocedure('public.hr_load(integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_request_ip()') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regclass('public.hr_server_secrets') is null or to_regclass('public.hunt_party_members') is null then
    raise exception 'PRECONDITION: the hunt-setup (2026-12-05), party-finder (2026-12-07) and hero-creation chain is absent'; end if;
  if public.hr_hunt_limit('max_concurrent') is null then
    raise exception 'PRECONDITION: no generated max_concurrent limit row (the hunt-sessions catalogue)'; end if;
  -- THE PINS: the live image this file restates (measured read-only 2026-10-24, equal to the replay chain's), or this
  -- file's own image (a re-apply). Any other body is a concurrent restatement: refuse, never silently revert it.
  foreach v_pin slice 1 in array array[
      array['hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'ed50d2df58c9ab67b4e184fb1ce442d2', '672f2c82323d65517061f800cd6a67e0'],
      array['hr_party_seat_ready(uuid,uuid,integer,text,uuid,timestamp with time zone)', '4b1ef18cb3ce9bf902f12221a231f191', 'd3590330c12044038f1a25fa470f638a'],
      array['hr_hunt_party_start(integer,text,uuid)', '5f7cb2a69be38d85740a4c742e8355cc', '587acbaecb08e2446a864bd24e182cce'],
      array['hr_load(integer)', 'de0e18c6ca0a4d9db749465f672c3b8e', 'c2d6868ac1d2ac2cd9a5eb3c728627de']] loop
    select md5(prosrc) into v_md5 from pg_proc where oid = ('public.' || v_pin[1])::regprocedure;
    if v_md5 is distinct from v_pin[2] and v_md5 is distinct from v_pin[3] then
      raise exception 'PIN: % moved (md5 %): re-derive this restatement from the new body', v_pin[1], v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE SECRET AND THE TWO TABLES ────────────────────────────────────────
-- A server-only salt of its own (not the PRNG's), so a network hash and a roll seed never share a secret.
insert into public.hr_server_secrets (name, secret)
  select 'play_net', sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'utf8'))
  on conflict (name) do nothing;

-- The network each ACCOUNT last showed on its own PostgREST call (hr_play_net_note): read for a start that is not its own call.
create table if not exists public.account_play_net (
  user_id uuid primary key references auth.users (id) on delete cascade,
  net     bytea not null check (octet_length(net) = 32),
  seen_at timestamptz not null default now()
);
-- The network each HERO started playing from (hr_play_claim). Counted only while the hero plays (hr_playing).
create table if not exists public.hero_play_net (
  user_id uuid not null,
  slot    integer not null,
  net     bytea not null check (octet_length(net) = 32),
  since   timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists hero_play_net_by_net on public.hero_play_net (net);
alter table public.account_play_net enable row level security;
alter table public.hero_play_net enable row level security;
revoke all on public.account_play_net from public, anon, authenticated, service_role;
revoke all on public.hero_play_net from public, anon, authenticated, service_role;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke all on public.account_play_net from hr_engine';
    execute 'revoke all on public.hero_play_net from hr_engine';
  end if;
end $grants$;

-- ── §2 THE NETWORK ──────────────────────────────────────────────────────────
create or replace function public.hr_play_net_hash(p_ip text)
returns bytea language plpgsql stable security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). The network an address belongs to, as the play cap counts it: an IPv4
-- address alone; an IPv6 address by its /64; an IPv4-mapped IPv6 address as the IPv4 one. Salted with the
-- server-only 'play_net' secret, so the stored value names no address and the 2^32 IPv4 addresses cannot be tried
-- against it without the secret. NULL for no address or one that does not parse.
declare v inet; v_salt bytea; v_net text;
begin
  if p_ip is null or btrim(p_ip) = '' then return null; end if;
  begin
    v := btrim(p_ip)::inet;
  exception when others then
    return null;
  end;
  if family(v) = 6 and host(v) ~ '^::ffff:[0-9]{1,3}(\.[0-9]{1,3}){3}$' then v := substr(host(v), 8)::inet; end if;
  v_net := case when family(v) = 4 then host(set_masklen(v, 32)) || '/32'
                else host(network(set_masklen(v, 64))) || '/64' end;
  select s.secret into v_salt from public.hr_server_secrets s where s.name = 'play_net';
  if v_salt is null then
    -- Loud, not fatal: hr_load reads through here, and a missing salt must not stop the game loading (§7 asserts it).
    raise warning 'hr_play_net_hash: hr_server_secrets has no play_net secret; no network is counted';
    return null;
  end if;
  return sha256(v_salt || convert_to('hr-play-net:' || v_net, 'utf8'));
end $function$;

create or replace function public.hr_play_net_of(p_uid uuid)
returns bytea language plpgsql stable security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). The network p_uid plays from NOW: this request's own address when the request
-- is p_uid's own PostgREST call (hr_request_ip: cf-connecting-ip, which Cloudflare overwrites), else the last one
-- p_uid's own calls showed (account_play_net), else NULL (never seen: that start is counted per account only).
declare v bytea;
begin
  if p_uid is null then return null; end if;
  if auth.uid() is not distinct from p_uid then
    v := public.hr_play_net_hash(public.hr_request_ip());
    if v is not null then return v; end if;
  end if;
  return (select n.net from public.account_play_net n where n.user_id = p_uid);
end $function$;

create or replace function public.hr_play_net_note(p_uid uuid)
returns bytea language plpgsql volatile security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). hr_play_net_of, and when it is this request's own address and differs from the
-- stored one, store it. One PK read per call; a write only on a change.
declare v bytea;
begin
  if p_uid is null or auth.uid() is distinct from p_uid then return public.hr_play_net_of(p_uid); end if;
  v := public.hr_play_net_hash(public.hr_request_ip());
  if v is null then return public.hr_play_net_of(p_uid); end if;
  if not exists (select 1 from public.account_play_net n where n.user_id = p_uid and n.net = v) then
    insert into public.account_play_net as n (user_id, net, seen_at) values (p_uid, v, now())
      on conflict (user_id) do update set net = excluded.net, seen_at = excluded.seen_at;
  end if;
  return v;
end $function$;

-- ── §3 THE COUNT AND THE LOCKS ──────────────────────────────────────────────
create or replace function public.hr_playing(p_uid uuid, p_slot integer)
returns boolean language sql stable
set search_path = public, pg_catalog as $function$
  -- PLAY-CAP (2027-01-19-play-cap.sql). THE ONE DEFINITION OF PLAYING: the hero accrues on the server, i.e. it has an
  -- open hunt or a running town activity (active_kind other than idle).
  select exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = p_slot and ps.active_kind <> 'idle')
      or exists (select 1 from public.hunt_sessions h where h.user_id = p_uid and h.slot = p_slot and h.ended_at is null)
$function$;

create or replace function public.hr_play_refusal(p_uid uuid, p_slot integer, p_net bytea, p_party uuid default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). NULL when the hero (p_uid, p_slot) may START playing: fewer than the cap OTHER
-- heroes of its account play, and fewer than the cap other heroes play from its network p_net (NULL: not counted per
-- network). The hero itself is never counted; a caller asks only for a hero that is not playing yet. p_party: a party
-- Start's view of one seat (hr_party_seat_ready): Start enters the seats in seat order, so the seats before this one
-- that do not play yet count as playing. A count read here is exact only under hr_play_lock (every start takes it).
declare
  v_cap  int := public.hr_hunt_limit('max_concurrent');
  v_seat int;
  v_n    int;
begin
  -- FAIL CLOSED: no cap row admits nobody (the generated catalogue always carries it; §0 refuses its absence).
  if v_cap is null then return jsonb_build_object('ok', false, 'error', 'too_many_playing', 'max', null); end if;
  if p_party is not null then
    select m.seat into v_seat from public.hunt_party_members m
     where m.party_id = p_party and m.user_id = p_uid and m.slot = p_slot;
  end if;
  -- THE ACCOUNT.
  select count(*) into v_n from public.player_state ps
   where ps.user_id = p_uid and ps.slot <> p_slot
     and (public.hr_playing(ps.user_id, ps.slot)
          or (v_seat is not null and exists (select 1 from public.hunt_party_members m
                                              where m.party_id = p_party and m.user_id = ps.user_id and m.slot = ps.slot
                                                and m.seat < v_seat)));
  if v_n >= v_cap then
    return jsonb_build_object('ok', false, 'error', 'too_many_playing', 'max', v_cap, 'playing', v_n); end if;
  -- THE NETWORK: every other hero playing from it, whichever account (this one's included).
  if p_net is not null then
    select count(*) into v_n from (
      select n.user_id, n.slot from public.hero_play_net n
       where n.net = p_net and not (n.user_id = p_uid and n.slot = p_slot) and public.hr_playing(n.user_id, n.slot)
      union
      select m.user_id, m.slot from public.hunt_party_members m
       where v_seat is not null and m.party_id = p_party and m.seat < v_seat
         and not public.hr_playing(m.user_id, m.slot) and public.hr_play_net_of(m.user_id) = p_net) x;
    if v_n >= v_cap then
      return jsonb_build_object('ok', false, 'error', 'too_many_playing_here', 'max', v_cap); end if;
  end if;
  return null;
end $function$;

create or replace function public.hr_play_lock_key(p_kind text, p_id text)
returns bigint language sql immutable
set search_path = public, pg_catalog as $function$
  -- PLAY-CAP (2027-01-19-play-cap.sql). The advisory key of one play lock ('account', uid) or ('net', hex). One
  -- derivation for every taker and for the self-check that reads pg_locks.
  select hashtextextended('hr_play:' || p_kind || ':' || p_id, 0)
$function$;

create or replace function public.hr_play_lock(p_uid uuid, p_net bytea)
returns void language plpgsql volatile
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). The play cap's two locks, transaction-scoped: the account's, then the network's.
-- Every start takes them after the hero's character lock and reads its counts only after holding them.
begin
  perform pg_advisory_xact_lock(public.hr_play_lock_key('account', p_uid::text));
  if p_net is not null then
    perform pg_advisory_xact_lock(public.hr_play_lock_key('net', encode(p_net, 'hex')));
  end if;
end $function$;

create or replace function public.hr_play_lock_for(p_uid uuid)
returns bytea language plpgsql volatile security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). One hero's start: note the account's network, then take its locks. The network.
declare v bytea;
begin
  v := public.hr_play_net_note(p_uid);
  perform public.hr_play_lock(p_uid, v);
  return v;
end $function$;

create or replace function public.hr_play_lock_seats(p_party uuid)
returns void language plpgsql volatile security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). A party Start's play locks, before its first seat is entered: every account a
-- seat not hunting yet belongs to, then every network those accounts play from, each in sorted order (the networks
-- are read first: a note may write the caller's own account_play_net row, which precedes the advisory locks).
declare v_us uuid[]; v_ns bytea[]; v_u uuid; v_n bytea;
begin
  select array_agg(distinct m.user_id order by m.user_id) into v_us
    from public.hunt_party_members m
   where m.party_id = p_party
     and not exists (select 1 from public.hunt_sessions h where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null);
  if v_us is null then return; end if;
  select array_agg(distinct x.n order by x.n) into v_ns
    from (select public.hr_play_net_note(u) as n from unnest(v_us) u) x where x.n is not null;
  foreach v_u in array v_us loop
    perform pg_advisory_xact_lock(public.hr_play_lock_key('account', v_u::text));
  end loop;
  foreach v_n in array coalesce(v_ns, '{}'::bytea[]) loop
    perform pg_advisory_xact_lock(public.hr_play_lock_key('net', encode(v_n, 'hex')));
  end loop;
end $function$;

create or replace function public.hr_play_claim(p_uid uuid, p_slot integer)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). A hero STARTS playing (hr_play_cap_guard): under the play locks, the refusal when
-- the cap is reached; else NULL, and the network it plays from is stamped on it for as long as it plays.
declare v_net bytea; v_r jsonb;
begin
  v_net := public.hr_play_lock_for(p_uid);
  v_r := public.hr_play_refusal(p_uid, p_slot, v_net);
  if v_r is not null then return v_r; end if;
  if v_net is null then
    delete from public.hero_play_net where user_id = p_uid and slot = p_slot;
  else
    insert into public.hero_play_net as h (user_id, slot, net, since) values (p_uid, p_slot, v_net, now())
      on conflict (user_id, slot) do update set net = excluded.net, since = excluded.since;
  end if;
  return null;
end $function$;

-- ── §4 THE GUARD TRIGGER ────────────────────────────────────────────────────
create or replace function public.hr_play_cap_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). EVERY door that moves a hero off idle passes here (hr_apply's activity statement,
-- hr_hunt_point, any future writer), so "every start path is capped" holds by construction. A refusal raises through
-- hr_reject (HR000): hr_apply answers it {ok:false, error, max, ...}; hr_hunt_enter_for has already refused it cleanly
-- under the same locks, so there it is unreachable. A hero that STOPS (anything -> idle) is remembered until the
-- transaction ends: the same hero leaving idle again in it (the settle's resume after a hunt ends) never stopped
-- playing as any committed state shows, and is not a start.
declare v_key text := new.user_id::text || ':' || new.slot::text; v_r jsonb;
begin
  if tg_op = 'UPDATE' and old.active_kind <> 'idle' and new.active_kind = 'idle' then
    perform set_config('hr.play_stopped', coalesce(current_setting('hr.play_stopped', true), '') || ' ' || v_key, true);
    return null;
  end if;
  if (tg_op = 'INSERT' or old.active_kind = 'idle') and new.active_kind <> 'idle' then
    if position(' ' || v_key || ' ' in coalesce(current_setting('hr.play_stopped', true), '') || ' ') > 0 then return null; end if;
    v_r := public.hr_play_claim(new.user_id, new.slot);
    if v_r is not null then perform public.hr_reject(v_r->>'error', v_r - 'ok' - 'error'); end if;
  end if;
  return null;
end $function$;

create or replace trigger hr_play_cap_guard_upd
  after update of active_kind on public.player_state
  for each row when (old.active_kind is distinct from new.active_kind)
  execute function public.hr_play_cap_guard();
create or replace trigger hr_play_cap_guard_ins
  after insert on public.player_state
  for each row when (new.active_kind <> 'idle')
  execute function public.hr_play_cap_guard();

-- ── §5 THE FOUR RESTATED DOORS ──────────────────────────────────────────────
create or replace function public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
returns jsonb language plpgsql
set search_path = public, pg_catalog as $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a town activity yields to the hunt instead of refusing it.
  -- SETUP-PER-GROUND (2026-12-05-hunt-setup-per-ground.sql): the locks first, then ONE predicate
  -- (hr_hunt_enter_check, the party view's seat readiness asks the same), and nothing is written before it answers;
  -- the set the session opened on is remembered for the ground (hunt_density.preset).
  -- PLAY-CAP (2027-01-19-play-cap.sql): the account's and the network's play locks before the predicate, then the cap
  -- (hr_play_refusal) on a hero not playing yet; the pointer's trigger (hr_play_cap_guard) stamps its network.
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_st   public.player_state%rowtype;
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean;
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
  v_net  bytea;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_bag is null then p_bag := '[]'::jsonb; end if;

  -- THE LOCKS (order: the party row, the character, the bag's stock rows), then the one predicate.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if jsonb_typeof(p_bag) = 'array' then
    perform 1 from public.player_inventory pi
     where pi.user_id = v_uid and pi.slot = p_slot
       and pi.item_id in (select l->>'item' from jsonb_array_elements(p_bag) l where jsonb_typeof(l) = 'object')
     order by pi.item_id for update;
  end if;
  -- THE PLAY CAP'S LOCKS (2027-01-19-play-cap.sql): the account's, then its network's (hr_play_lock_for), after the
  -- character's and before any count is read, so a second start on this account or this network waits here until
  -- this one commits, then counts it.
  v_net := public.hr_play_lock_for(v_uid);
  v_r := public.hr_hunt_enter_check(v_uid, p_slot, p_hunt, p_bag, p_preset, p_hours);
  if v_r is not null then return v_r; end if;
  -- THE PLAY CAP (Tyler 2026-10-17: "Up to 4 characters can play AT ONCE, free. A 4-per-hashed-IP concurrent cap is
  -- mandatory"): a hero not playing yet enters only beside fewer than the cap other playing heroes of its account and
  -- of its network. One already playing (a town activity, which yields below) adds nobody and is never refused here.
  if not public.hr_playing(v_uid, p_slot) then
    v_r := public.hr_play_refusal(v_uid, p_slot, v_net);
    if v_r is not null then return v_r; end if;
  end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;

  -- A TOWN ACTIVITY YIELDS TO THE HUNT (live v0.2.11): gathering, an artisan run or training stops here and the
  -- hunt pointer replaces it (hr_hunt_point below); it is journalled with the instant it was last settled to.
  if v_st.active_kind in ('gather', 'artisan', 'training') then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_uid, p_slot, 'hunt', 'activity_yield',
              jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id, 'settled_to', v_st.accrued_to, 'hunt', p_hunt));
  end if;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  -- NEVER BEFORE THE STAMINA STAMP (2026-10-28): the last session's settle may have
  -- run to the swing boundary just past its leave (stamina_at = that window's end),
  -- and with no walk (travel_s 0) a hunt entered within that swing would open BEHIND
  -- it: every settle of it would refuse stamina_ahead, forever.
  v_from := greatest(date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))),
                     v_st.stamina_at);
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, on the party's ground of this start, with
      -- no world (the swing counter keeps counting forward).
      update public.hunt_instances set hunt_id = p_hunt, world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
      -- The stock was proved under its row lock: a line that matches neither is a broken invariant, never a free load.
      if not found then raise exception 'hr_hunt_enter_for: the stock of % moved under its lock', v_item; end if;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;
  -- THE SETUP THIS GROUND WAS ENTERED ON (A #2): the set the session opened on, beside the ground's density pick.
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, preset, updated_at)
    values (v_uid, p_slot, p_hunt, 0, (select h.preset from public.hunt_sessions h where h.id = v_id), now())
    on conflict (user_id, slot, hunt_id) do update set preset = excluded.preset, updated_at = now();

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;

create or replace function public.hr_party_seat_ready(p_party uuid, p_user uuid, p_slot integer, p_hunt text, p_leader uuid, p_joined timestamp with time zone)
returns jsonb language plpgsql stable
set search_path = public, pg_catalog as $function$
declare v_hours int; v_r jsonb;
begin
  -- PARTY-FINDER (2026-12-07-party-finder.sql): what Start does with one seat. {ok:true,in:true} already in this
  -- party's hunt; {ok:true,in:false} Start enters it; else the refusal Start answers in `not_ready`.
  -- PLAY-CAP (2027-01-19-play-cap.sql): a seat that would play beyond the cap is not ready (too_many_playing[_here]).
  if exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot
               and h.ended_at is null and h.instance_id = p_party) then
    return jsonb_build_object('ok', true, 'in', true); end if;
  -- AWAY: a member whose account has not had the game open lately is not marched in unseen (the leader's own heroes never are).
  if p_user is distinct from p_leader and public.hr_party_away(p_user, p_slot, p_joined) then
    return jsonb_build_object('ok', false, 'error', 'away'); end if;
  select h.hours_limit into v_hours from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot
   order by h.entered_at desc, h.id limit 1;
  v_r := public.hr_hunt_enter_check(p_user, p_slot, p_hunt, public.hr_hunt_saved_bag(p_user, p_slot),
                                    public.hr_hunt_active_set(p_user, p_slot), v_hours, true);
  if v_r is not null then return v_r; end if;
  -- THE PLAY CAP AS START MEETS IT (2027-01-19-play-cap.sql): Start enters the seats in seat order, so a seat not
  -- playing yet counts, beside the heroes already playing, the seats before it that walk in first.
  if not public.hr_playing(p_user, p_slot) then
    v_r := public.hr_play_refusal(p_user, p_slot, public.hr_play_net_of(p_user), p_party);
    if v_r is not null then return v_r; end if;
  end if;
  return jsonb_build_object('ok', true, 'in', false);
end $function$;

create or replace function public.hr_hunt_party_start(p_slot integer, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog as $function$
declare
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a not-ready seat names the hunt it is in.
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each seat is judged by hr_party_seat_ready, the predicate the party
  -- view's `ready` shows, then entered by hr_hunt_enter_for (which asks it again under its locks).
  -- PLAY-CAP (2027-01-19-play-cap.sql): the seats' characters, then their accounts' and networks' play locks, before
  -- the first seat is entered.
  c_verb constant text := 'hunt_party_start';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_m record; v_last public.hunt_sessions%rowtype; v_not jsonb := '[]'::jsonb; v_n int := 0; v_why jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  -- A party already hunting keeps its ground until every member is out.
  if v_p.hunt_id is distinct from p_hunt
     and exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_p.hunt_id)); end if;
  -- THE PLAY CAP'S LOCK ORDER (2027-01-19-play-cap.sql): every seat this Start may enter, its character first, in seat
  -- order as the loop below takes them; then every account and network those seats count against, each sorted
  -- (hr_play_lock_seats). So no start of one of these heroes elsewhere holds a character this Start waits for while it
  -- waits for an account this Start holds, and two Starts that share accounts take them in one order.
  for v_m in select m.user_id, m.slot from public.hunt_party_members m
              where m.party_id = v_pid
                and not exists (select 1 from public.hunt_sessions h
                                 where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null)
              order by m.seat loop
    perform public.hr_hunt_lock(v_m.user_id, v_m.slot);
  end loop;
  perform public.hr_play_lock_seats(v_pid);
  -- EVERY MEMBER OR NONE: one subtransaction (the ground included), rolled back when any seat cannot enter.
  begin
    update public.hunt_parties set hunt_id = p_hunt where id = v_pid and hunt_id is distinct from p_hunt;
    for v_m in select m.user_id, m.slot, m.seat, m.joined_at from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      v_why := public.hr_party_seat_ready(v_pid, v_m.user_id, v_m.slot, p_hunt, v_uid, v_m.joined_at);
      continue when coalesce((v_why->>'in')::boolean, false);
      if coalesce(v_why->>'ok', 'false') = 'true' then
        select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
         order by h.entered_at desc, h.id limit 1;
        v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, p_hunt, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                        public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.hours_limit);
      else
        v_r := v_why;
      end if;
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('seat', v_m.seat,
                                                 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                 'error', v_r->>'error', 'hunt', v_r->'hunt')));
      end if;
    end loop;
    if jsonb_array_length(v_not) > 0 then raise exception using errcode = 'HR878', message = 'not_ready'; end if;
  exception when sqlstate 'HR878' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_ready', 'seats', v_not));
  end;
  if v_n = 0 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_hunting')); end if;
  v_r := jsonb_build_object('ok', true, 'entered', v_n, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

create or replace function public.hr_load(p_slot integer default 0)
returns jsonb language plpgsql security definer
set search_path = public as $function$
declare v_uid uuid := auth.uid();
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC
  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.
  -- PLAY-CAP (2027-01-19-play-cap.sql): it notes the network the account plays from (hr_play_net_note).
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'load', 180, interval '1 minute') then
    -- (C2) A read path; three loads a second sustained is a poller. (S6) Sampled.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'load', 'rate_limited',
        jsonb_build_object('limit', 180, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- THE NETWORK THIS ACCOUNT PLAYS FROM (2027-01-19-play-cap.sql): a salted hash of this request's address, stored
  -- when it changed (never the address), for the per-network play cap of a start that is not this account's own
  -- call (a town activity the engine starts, a party leader's Start).
  perform public.hr_play_net_note(v_uid);
  -- A CHARACTER ENTERS THE WORLD ONLY WITH A CLAIMED NAME (2026-11-02-hero-creation.sql):
  -- the answer still names the owned slots and the account limit, which the roster reads.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = coalesce(p_slot, 0))
     and not exists (select 1 from public.character_names where user_id = v_uid and slot = coalesce(p_slot, 0)) then
    return jsonb_build_object('ok', false, 'error', 'needs_name', 'slot', coalesce(p_slot, 0),
      'hero_slots', public.hr_hero_slots_of(v_uid), 'account', public.hr_account_view(v_uid, coalesce(p_slot, 0)));
  end if;
  return public.hr_state_of(v_uid, coalesce(p_slot, 0));
end $function$;

-- ── §6 GRANTS: every new function is the owner's alone ──────────────────────
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array[
      'hr_play_net_hash(text)', 'hr_play_net_of(uuid)', 'hr_play_net_note(uuid)', 'hr_playing(uuid,integer)',
      'hr_play_refusal(uuid,integer,bytea,uuid)', 'hr_play_lock_key(text,text)', 'hr_play_lock(uuid,bytea)',
      'hr_play_lock_for(uuid)', 'hr_play_lock_seats(uuid)', 'hr_play_claim(uuid,integer)', 'hr_play_cap_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      execute format('revoke all on function public.%s from hr_engine', v_sig);
    end if;
  end loop;
end $grants$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-images: (c) a 5th start passes there; (f) a 5th start across two accounts on one network passes
-- there; (b)/(a) the functions and the tables do not exist there.
do $$
declare
  c_new   constant text[] := array['hr_play_net_hash(text)', 'hr_play_net_of(uuid)', 'hr_play_net_note(uuid)',
    'hr_playing(uuid,integer)', 'hr_play_refusal(uuid,integer,bytea,uuid)', 'hr_play_lock_key(text,text)',
    'hr_play_lock(uuid,bytea)', 'hr_play_lock_for(uuid)', 'hr_play_lock_seats(uuid)', 'hr_play_claim(uuid,integer)',
    'hr_play_cap_guard()'];
  c_a     constant uuid := '000000d5-0000-0000-0000-0000c4a90001';
  c_b     constant uuid := '000000d5-0000-0000-0000-0000c4a90002';
  c_c     constant uuid := '000000d5-0000-0000-0000-0000c4a90003';
  c_ip_x  constant text := '{"cf-connecting-ip":"198.51.100.23"}';
  c_ip_y  constant text := '{"cf-connecting-ip":"203.0.113.77"}';
  v       jsonb;
  v_set   text;
  v_sig   text;
  v_hunt  text;
  v_node  text;
  v_cap   int;
  v_n     int;
  v_sid   uuid;
  v_ver   bigint;
  v_txt   text;
  v_x     bytea;
  v_u     uuid;
  v_s     int;
begin
  -- (a) THE SHAPE: the restated doors are this file's images and keep their grants; every new function is
  --     owner-only with a pinned search_path; the two tables are RLS-on with no policy and no grant; the secret is set.
  foreach v_sig in array array['hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)|672f2c82323d65517061f800cd6a67e0',
      'hr_party_seat_ready(uuid,uuid,integer,text,uuid,timestamp with time zone)|d3590330c12044038f1a25fa470f638a',
      'hr_hunt_party_start(integer,text,uuid)|587acbaecb08e2446a864bd24e182cce', 'hr_load(integer)|c2d6868ac1d2ac2cd9a5eb3c728627de'] loop
    if (select md5(prosrc) from pg_proc where oid = ('public.' || split_part(v_sig, '|', 1))::regprocedure) <> split_part(v_sig, '|', 2) then
      raise exception 'play-cap §7(a): % is not this file''s image', split_part(v_sig, '|', 1); end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_hunt_party_start(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_load(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute') then
    raise exception 'play-cap §7(a): a restated door''s grants moved'; end if;
  foreach v_sig in array c_new loop
    if has_function_privilege('anon', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('service_role', ('public.' || v_sig)::regprocedure, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = ('public.' || v_sig)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'hr_engine')
           and has_function_privilege('hr_engine', ('public.' || v_sig)::regprocedure, 'execute')) then
      raise exception 'play-cap §7(a): % is reachable by a non-owner', v_sig; end if;
    if not exists (select 1 from pg_proc p where p.oid = ('public.' || v_sig)::regprocedure
                    and p.proconfig @> array['search_path=public, pg_catalog']) then
      raise exception 'play-cap §7(a): % has no pinned search_path', v_sig; end if;
  end loop;
  select string_agg(t, ', ') into v_set from unnest(array['account_play_net', 'hero_play_net']) t
   where not coalesce((select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass), false)
      or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t)
      or exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = t
                  and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC', 'hr_engine'));
  if v_set is not null then raise exception 'play-cap §7(a): % is readable or writable by a client', v_set; end if;
  if (select octet_length(secret) from public.hr_server_secrets where name = 'play_net') is distinct from 32 then
    raise exception 'play-cap §7(a): the play_net secret is not 32 bytes'; end if;
  select string_agg(t, ', ') into v_set from unnest(array['hr_play_cap_guard_upd', 'hr_play_cap_guard_ins']) t
   where not exists (select 1 from pg_trigger g where g.tgrelid = 'public.player_state'::regclass and g.tgname = t and not g.tgisinternal);
  if v_set is not null then raise exception 'play-cap §7(a): trigger(s) missing: %', v_set; end if;
  v_cap := public.hr_hunt_limit('max_concurrent');
  if v_cap is distinct from 4 then raise exception 'play-cap §7(a): max_concurrent is %, the ruling is 4', v_cap; end if;

  -- (b) THE NETWORK IS A SALTED HASH, NEVER THE ADDRESS: 32 bytes, stable, one per IPv4 address, one per IPv6 /64,
  --     an IPv4-mapped address is the IPv4 one, a non-address is none.
  v_x := public.hr_play_net_hash('198.51.100.23');
  if octet_length(v_x) is distinct from 32 or v_x is distinct from public.hr_play_net_hash(' 198.51.100.23 ')
     or v_x = public.hr_play_net_hash('198.51.100.24')
     or v_x is distinct from public.hr_play_net_hash('::ffff:198.51.100.23')
     or position(convert_to('198.51.100', 'utf8') in v_x) > 0
     or v_x = sha256(convert_to('hr-play-net:198.51.100.23/32', 'utf8'))
     or public.hr_play_net_hash('2001:db8:1:2::a') is distinct from public.hr_play_net_hash('2001:db8:1:2:ffff:ffff:ffff:1')
     or public.hr_play_net_hash('2001:db8:1:2::a') = public.hr_play_net_hash('2001:db8:1:3::a')
     or public.hr_play_net_hash('not an address') is not null or public.hr_play_net_hash(null) is not null then
    raise exception 'play-cap §7(b): the network hash is wrong'; end if;

  begin
    -- THE PROBE WORLD: three admitted accounts; A owns five heroes, B two, C one; hunts on; the lowest ground.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select a.activity_id into v_node from public.hr_activities a
     where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1 order by a.activity_id limit 1;
    if v_hunt is null or v_node is null then raise exception 'play-cap §7-harness: no ground or no level-1 gathering node'; end if;
    foreach v_u in array array[c_a, c_b, c_c] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'play-cap §7 probe') on conflict (user_id) do nothing;
    end loop;
    perform set_config('request.headers', c_ip_x, true);
    foreach v_sig in array array[c_a || ':0', c_a || ':1', c_a || ':2', c_a || ':3', c_a || ':4', c_b || ':0', c_b || ':1', c_c || ':0'] loop
      perform set_config('request.jwt.claim.sub', split_part(v_sig, ':', 1), true);
      v := public.hr_create_character(split_part(v_sig, ':', 2)::int);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'play-cap §7-harness: hr_create_character(%) refused: %', v_sig, v; end if;
      -- A owns slots 2-4 as bought ones do (the flag rows hr_buy_hero_slot writes on its slot 0).
      if v_sig = c_a || ':0' then
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        select c_a, 0, 'flag', 'character_slot:' || s, '', 1 from generate_series(2, 4) s;
      end if;
    end loop;

    -- (c) THE ACCOUNT CAP, through the real door as a player calls it (authenticated, from network X): four heroes go
    --     hunting; the fifth is refused too_many_playing and opens nothing, by the hunt door, by the engine's town door
    --     (hr_apply's activity statement) and by any other writer (the trigger).
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    for v_s in 0..3 loop
      execute 'set local role authenticated';
      v := public.hr_hunt_enter(v_s, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
      execute 'reset role';
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'play-cap §7(c): hero %/4 was refused: %', v_s + 1, v; end if;
    end loop;
    -- THE RACE IS SERIALISED: this transaction holds the account's and network X's play locks after a start, so a
    -- concurrent start of any hero of the account, or from X, waits here and then counts these four.
    v_x := public.hr_play_net_hash('198.51.100.23');
    if not exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
                    and ((l.classid::bigint << 32) | l.objid::bigint) = public.hr_play_lock_key('account', c_a::text))
       or not exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
                    and ((l.classid::bigint << 32) | l.objid::bigint) = public.hr_play_lock_key('net', encode(v_x, 'hex'))) then
      raise exception 'play-cap §7(c): a start does not hold the account''s and the network''s play locks'; end if;
    if (select count(*) from public.hero_play_net n where n.user_id = c_a and n.net = v_x) <> 4
       or (select n.net from public.account_play_net n where n.user_id = c_a) is distinct from v_x then
      raise exception 'play-cap §7(c): the four were not stamped with network X'; end if;
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(4, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if v->>'error' is distinct from 'too_many_playing' or (v->>'max')::int <> 4 or (v->>'playing')::int <> 4 then
      raise exception 'play-cap §7(c): the fifth hunt start was not refused too_many_playing: %', v; end if;
    if public.hr_playing(c_a, 4) or exists (select 1 from public.hero_play_net where user_id = c_a and slot = 4) then
      raise exception 'play-cap §7(c): the refused fifth start left the hero playing or stamped'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.headers', '', true);
    select version into v_ver from public.player_state where user_id = c_a and slot = 4;
    -- as the engine calls it (hr-accrue: set local role hr_engine; no JWT, no request headers)
    execute 'set local role hr_engine';
    v := public.hr_apply(c_a, 4, v_ver, gen_random_uuid(), jsonb_build_object(
           'activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'set_activity:gather:' || v_node, 'meta', '{}'::jsonb)));
    execute 'reset role';
    if v->>'error' is distinct from 'too_many_playing' or (v->>'max')::int <> 4 then
      raise exception 'play-cap §7(c): the engine''s town door let a fifth hero gather: %', v; end if;
    v_n := 0;
    begin
      update public.player_state set active_kind = 'gather', active_id = v_node where user_id = c_a and slot = 4;
    exception when sqlstate 'HR000' then
      get stacked diagnostics v_txt = message_text;
      if v_txt = 'too_many_playing' then v_n := 1; end if;
    end;
    if v_n <> 1 then raise exception 'play-cap §7(c): another writer moved a fifth hero off idle'; end if;

    -- (d) NEVER COUNTED TWICE, with the cap lowered to 3 so a recount WOULD refuse: the settle's end-and-resume of a
    --     hunter (combat -> idle -> gather in one transaction) is not a start, and a hero already playing (gathering)
    --     that goes hunting (the town activity yields) is not one either. Then a hero that never stopped is refused.
    update public.hr_hunt_limits set value = 3 where key = 'max_concurrent';
    select h.id into v_sid from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.ended_at is null;
    perform public.hr_hunt_close(v_sid, 'stamina', now(), true);
    update public.player_state set active_kind = 'gather', active_id = v_node where user_id = c_a and slot = 0;
    if not public.hr_playing(c_a, 0) then raise exception 'play-cap §7(d): the resume did not land'; end if;
    perform set_config('request.headers', c_ip_x, true);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'play-cap §7(d): a gathering hero going hunting was counted as a new start: %', v; end if;
    update public.hr_hunt_limits set value = 4 where key = 'max_concurrent';

    -- (e) TWO STARTS, ONE SLOT LEFT: hero 3 stops (its hunt ends, bag home, no resume); of the two idle heroes the
    --     first start takes the slot and the second is refused.
    select h.id into v_sid from public.hunt_sessions h where h.user_id = c_a and h.slot = 3 and h.ended_at is null;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(4, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'play-cap §7(e): the first of two starts was refused: %', v; end if;
    -- hero 3's hunt ended in THIS transaction, so the trigger's resume rule is moot for the hunt door: the door counts.
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(3, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if v->>'error' is distinct from 'too_many_playing' then
      raise exception 'play-cap §7(e): the second of two starts for one slot was not refused: %', v; end if;

    -- (f) THE NETWORK CAP ACROSS ACCOUNTS: A plays four from X; B's first hero, from X, is refused too_many_playing_here
    --     (its own account plays none) by the hunt door, and by the engine's door with B's STORED network (B's hr_load
    --     from X stamped it); C, from Y, plays; B from Y plays.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v := public.hr_load(0);
    execute 'reset role';
    if (select n.net from public.account_play_net n where n.user_id = c_b) is distinct from v_x then
      raise exception 'play-cap §7(f): hr_load did not store B''s network'; end if;
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if v->>'error' is distinct from 'too_many_playing_here' or (v->>'max')::int <> 4 or v ? 'playing' then
      raise exception 'play-cap §7(f): a fifth hero on one network (second account) was not refused too_many_playing_here: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.headers', '', true);
    select version into v_ver from public.player_state where user_id = c_b and slot = 1;
    -- as the engine calls it (hr-accrue: set local role hr_engine; no JWT, no request headers)
    execute 'set local role hr_engine';
    v := public.hr_apply(c_b, 1, v_ver, gen_random_uuid(), jsonb_build_object(
           'activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'set_activity:gather:' || v_node, 'meta', '{}'::jsonb)));
    execute 'reset role';
    if v->>'error' is distinct from 'too_many_playing_here' then
      raise exception 'play-cap §7(f): the engine''s door ignored the account''s stored network: %', v; end if;
    perform set_config('request.headers', c_ip_y, true);
    foreach v_u in array array[c_c, c_b] loop
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
      execute 'reset role';
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'play-cap §7(f): a hero on another network was refused: %', v; end if;
    end loop;
    raise exception using errcode = 'HRP19', message = 'play-cap §7 complete - rolling back';
  exception when sqlstate 'HRP19' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) then raise exception 'play-cap §7: LEAKED a probe row'; end if;
  if public.hr_hunt_limit('max_concurrent') is distinct from 4 then raise exception 'play-cap §7: LEAKED the probe cap'; end if;

  -- (g) GRANT HYGIENE IS CLEAN: nothing unapproved, nothing ungated, no baseline row left without its grant.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'baseline_rows_no_longer_live', '[]'::jsonb)) <> 0 then
    raise exception 'play-cap §7(g): grant hygiene is red: %', v; end if;
  raise notice 'play-cap: four heroes play at once per account and per network, every start door counted under '
               'the account''s and the network''s locks, restarts and resumes not counted twice; all green';
end $$;
