-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1044-friend-link.sql — THE FRIEND LINK AT SIGN-UP: A NEW PLAYER WHO ARRIVES BY A FRIEND'S LINK STARTS WITH THAT FRIEND
--   (lane/c-social, backend-architect, FB-12; GR-72, DECIDED by Fable 2026-11-21: "A friend link at sign-up, with no reward"; chapter 06
--   section 2.9; MM-47, friends for each account with one request, which 2026-10-25-social.sql already holds: friend_links is per account).
--
-- STATUS: supabase/migration-notes/1044-friend-link.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 2026-10-25-social.sql and 2027-01-17-social-pass.sql (the friend tables
--   and the person helper). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. ON THE EA SECURITY LIST: it makes a friendship without the second press (the link's owner consented by sharing it).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- friend_link_codes (NEW)    one row an account: its code (server-made, 10 hex characters; the shape accepts [a-z0-9]). RLS on, no client grant.
-- friend_link_redeemed (NEW) one row an account that arrived by a link: whose, and when. Once an account, ever. RLS on, no client grant.
-- hr_friend_link_rule        one row: new_hours, 1040-social-catalogue.generated.sql's (src/data/chat-channels.js FRIEND_LINK).
-- hr_friend_link() -> { ok, code }                CLIENT. The caller's code, made on first ask. 20 a minute.
-- hr_friend_link_redeem(p_code text) -> { ok, person, state }   CLIENT. The caller, an account made within new_hours, becomes friends with
--   the code's owner: one friend_links row (lo, hi), any pending ask between them gone. No gold, item, XP or anything else moves (no reward).
--   Refusals: not_signed_in, rate_limited, bad_code (absent, malformed or unknown: no oracle on which), own_link, not_new (the account is
--   older than new_hours), used (this account already arrived by a link), unavailable (a block either way, or the owner not admitted),
--   too_many (either side at the 200 friends a friendship already holds). Already friends answers ok, state friends, and records the use.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- A redeem takes the caller's account key (pg_advisory_xact_lock) and inserts friend_link_redeemed under a primary key, so two presses make
--   one friendship and the second answers `used`. The friendship insert is `on conflict do nothing`. A code is made under its unique index,
--   with a retry on a collision. A second apply is byte-identical: create if not exists, the rule row rewritten whole, the bodies restated.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- +2 client verbs. Moves no value. A code names an account only to the server (the answer names the friend by the server's person row, as
--   every friend list does). An old account can't use a leaked code to force a friendship (not_new), an account uses one link once (used),
--   and a block in either direction holds. Guessing: 16^10 codes against 20 tries a minute.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Two tables of at most one row an account; each verb is a handful of index reads.
-- REVERSIBLE: drop the two verbs, the rule and the two tables; friendships made stay (they are ordinary friend_links rows).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.friend_links') is null or to_regclass('public.friend_requests') is null
     or to_regprocedure('public.hr_social_person(uuid)') is null or to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null
     or to_regprocedure('public.hr_admitted(uuid)') is null or to_regclass('public.profiles') is null or to_regclass('public.hr_friend_link_rule') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-social.sql and 2027-01-17-social-pass.sql first'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.friend_link_codes (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  code       text        not null unique check (code ~ '^[a-z0-9]{10}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.friend_link_redeemed (
  user_id   uuid        primary key references auth.users (id) on delete cascade,
  from_user uuid        not null references auth.users (id) on delete cascade,
  at        timestamptz not null default now(),
  check (user_id <> from_user)
);
comment on table public.friend_link_codes is '1044-friend-link.sql: one account''s friend link code (GR-72), made by the server on first ask. No client grant.';
comment on table public.friend_link_redeemed is '1044-friend-link.sql: an account that arrived by a friend''s link, once ever. No client grant.';
alter table public.friend_link_codes enable row level security;
alter table public.friend_link_redeemed enable row level security;
revoke all on public.friend_link_codes from public, anon, authenticated, service_role;
revoke all on public.friend_link_redeemed from public, anon, authenticated, service_role;

-- ── §2 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_friend_link()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_code text; i int;
begin
  -- FRIEND-LINK (1044-friend-link.sql): the caller's code, made on first ask.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:link', 20, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select c.code into v_code from public.friend_link_codes c where c.user_id = v_uid;
  if v_code is not null then return jsonb_build_object('ok', true, 'code', v_code); end if;
  for i in 1 .. 5 loop
    v_code := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10);
    begin
      insert into public.friend_link_codes (user_id, code) values (v_uid, v_code) on conflict (user_id) do nothing;
      select c.code into v_code from public.friend_link_codes c where c.user_id = v_uid;
      return jsonb_build_object('ok', true, 'code', v_code);
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('ok', false, 'error', 'try_again');
end $fn$;

create or replace function public.hr_friend_link_redeem(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_owner uuid; v_hours int; v_born timestamptz; v_ins int;
begin
  -- FRIEND-LINK (1044-friend-link.sql): GR-72. A friendship, nothing else: no gold, item or XP moves.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:link', 20, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_code is null or lower(btrim(p_code)) !~ '^[a-z0-9]{10}$' then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  select c.user_id into v_owner from public.friend_link_codes c where c.code = lower(btrim(p_code));
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if v_owner = v_uid then return jsonb_build_object('ok', false, 'error', 'own_link'); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:friend_link:' || v_uid::text, 0));
  if exists (select 1 from public.friend_link_redeemed r where r.user_id = v_uid) then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  v_hours := coalesce((select r.new_hours from public.hr_friend_link_rule r where r.id), 24);
  select p.created_at into v_born from public.profiles p where p.id = v_uid;
  if v_born is null or v_born < now() - make_interval(hours => v_hours) then return jsonb_build_object('ok', false, 'error', 'not_new'); end if;
  if public.hr_social_blocked(v_uid, v_owner) or not public.hr_admitted(v_owner) then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if not exists (select 1 from public.friend_links l where l.user_lo = least(v_uid, v_owner) and l.user_hi = greatest(v_uid, v_owner)) then
    if (select count(*) from public.friend_links l where l.user_lo = v_uid or l.user_hi = v_uid) >= 200
       or (select count(*) from public.friend_links l where l.user_lo = v_owner or l.user_hi = v_owner) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  end if;
  insert into public.friend_link_redeemed (user_id, from_user) values (v_uid, v_owner) on conflict (user_id) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  delete from public.friend_requests where (from_id = v_owner and to_id = v_uid) or (from_id = v_uid and to_id = v_owner);
  insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_owner), greatest(v_uid, v_owner)) on conflict do nothing;
  return jsonb_build_object('ok', true, 'state', 'friends', 'person', public.hr_social_person(v_owner));
end $fn$;

do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_friend_link()', 'public.hr_friend_link_redeem(text)'] loop
    execute format('revoke all on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_friend_link', 'hr_friend_link_redeem');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_friend_link', '', 'authenticated', 'added 1044-friend-link (FB-12, GR-72): the caller''s friend link code, made by the server on first ask; moves no value'),
  ('hr_friend_link_redeem', 'p_code text', 'authenticated',
   'added 1044-friend-link (FB-12, GR-72): a new account (hr_friend_link_rule) arriving by a friend''s link becomes that account''s friend, once; refused across a block; moves no value, no reward');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────
-- (a) the grants: both verbs authenticated's alone; the tables no client's; the detector passes strict
-- (b) BOTH SIDES: A's code, B (new) arrives by it: A is in B's friends and B in A's (hr_social_state), one friend_links row, no ledger row
-- (c) the refusals: a second use (used), A's own code (own_link), an old account (not_new), a block (unavailable), a bad code (bad_code)
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-0000f71e0001';
  c_b constant uuid := '000000c0-0000-4000-a000-0000f71e0002';
  c_c constant uuid := '000000c0-0000-4000-a000-0000f71e0003';
  c_d constant uuid := '000000c0-0000-4000-a000-0000f71e0004';
  v jsonb; v_code text; v_role text; v_sig text; v_l0 bigint;
begin
  foreach v_sig in array array['public.hr_friend_link()', 'public.hr_friend_link_redeem(text)'] loop
    if not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') or has_function_privilege('anon', v_sig::regprocedure, 'execute') then
      raise exception 'friend-link §3(a): % is not authenticated''s alone', v_sig; end if;
  end loop;
  foreach v_sig in array array['friend_link_codes', 'friend_link_redeemed'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, ('public.' || v_sig)::regclass, 'select,insert,update,delete') then raise exception 'friend-link §3(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  begin
    insert into auth.users (id) values (c_a), (c_b), (c_c), (c_d) on conflict (id) do nothing;
    insert into public.profiles (id, display_name, created_at) values
      (c_a, 'Probe Linker', now() - interval '30 days'), (c_b, 'Probe Newcomer', now() - interval '1 hour'),
      (c_c, 'Probe Oldtimer', now() - interval '30 days'), (c_d, 'Probe Blocker', now() - interval '1 hour')
      on conflict (id) do update set display_name = excluded.display_name, created_at = excluded.created_at;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'friend-link §3'), (c_b, 'friend-link §3'), (c_c, 'friend-link §3'), (c_d, 'friend-link §3')
      on conflict (user_id) do nothing;
    foreach v_sig in array array[c_a::text, c_b::text] loop
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'friend-link §3: hr_create_character refused: %', v; end if;
    end loop;
    select count(*) into v_l0 from public.player_ledger where user_id in (c_a, c_b);
    -- (b)
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v_code := public.hr_friend_link()->>'code';
    if v_code is null or v_code !~ '^[a-z0-9]{10}$' or public.hr_friend_link()->>'code' is distinct from v_code then
      raise exception 'friend-link §3(b): the code is not one stable server code: %', v_code; end if;
    if public.hr_friend_link_redeem(v_code)->>'error' is distinct from 'own_link' then raise exception 'friend-link §3(c): A used its own code'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_friend_link_redeem(upper(v_code));
    if coalesce(v->>'ok', '') <> 'true' or v->'person'->>'id' <> c_a::text then raise exception 'friend-link §3(b): the newcomer''s redeem read %', v; end if;
    v := public.hr_social_state(0);
    if not exists (select 1 from jsonb_array_elements(v->'friends') f where f->>'id' = c_a::text) then raise exception 'friend-link §3(b): B does not see A: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_social_state(0);
    if not exists (select 1 from jsonb_array_elements(v->'friends') f where f->>'id' = c_b::text) then raise exception 'friend-link §3(b): A does not see B: %', v; end if;
    if (select count(*) from public.friend_links where user_lo = least(c_a, c_b) and user_hi = greatest(c_a, c_b)) <> 1
       or (select count(*) from public.player_ledger where user_id in (c_a, c_b)) <> v_l0 then
      raise exception 'friend-link §3(b): not one friendship and nothing else'; end if;
    -- (c)
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    if public.hr_friend_link_redeem(v_code)->>'error' is distinct from 'used' then raise exception 'friend-link §3(c): a second use was not refused'; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    if public.hr_friend_link_redeem(v_code)->>'error' is distinct from 'not_new' then raise exception 'friend-link §3(c): an old account used a link'; end if;
    if public.hr_friend_link_redeem('zzzzzzzzzz')->>'error' is distinct from 'bad_code' or public.hr_friend_link_redeem('x')->>'error' is distinct from 'bad_code' then
      raise exception 'friend-link §3(c): a bad code was not refused bad_code'; end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (c_a, c_d) on conflict do nothing;
    perform set_config('request.jwt.claim.sub', c_d::text, true);
    if public.hr_friend_link_redeem(v_code)->>'error' is distinct from 'unavailable' then raise exception 'friend-link §3(c): a block did not hold'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR926', message = 'friend-link §3 complete - rolling back';
  exception when sqlstate 'HR926' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.friend_link_codes where user_id in (c_a, c_b, c_c, c_d))
     or exists (select 1 from public.friend_links where user_lo in (c_a, c_b) or user_hi in (c_a, c_b)) then
    raise exception 'friend-link §3: LEAKED a probe row'; end if;
  raise notice 'friend-link: a new account arriving by a link starts with that friend, both ways, once, nothing else moving';
end $$;
