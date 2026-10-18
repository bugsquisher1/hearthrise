-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-25-social.sql — WHISPERS, BLOCKS, FRIENDS AND INSPECT: ONE TABLE PER
--   CONCERN, EVERY WRITE AN RPC, EVERY BLOCK ENFORCED BY THE SERVER.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/chat, phase 2 (Tyler 10-18). The game
-- is CLOSED: applies on its passing §7 (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00–00:10 UTC); Security reviews it with
-- every closed-mode surface at the reopen gate. ORDER: right after
-- 2026-10-25-chat-channels.sql (§0 refuses without its helpers). No edge.
--
-- ── THE TABLES (one concern each; RLS on every one) ────────────────────────
--   chat_whispers    a private line: sender facts + recipient, stamped by the
--                    server. The two participants may READ (RLS); nobody
--                    writes but hr_whisper_send. Realtime-published (the
--                    recipient's client binds INSERT with to_id=eq.<self>).
--                    Append-only (trigger); nightly trim after 30 days.
--   chat_blocks      (exists) who blocked whom. The owner may READ its own rows
--                    (the chat RLS hide policies read them as the reader); the
--                    direct client write is REVOKED: hr_block_set is the writer.
--   friend_requests  pending asks (from -> to). No client grant at all.
--   friend_links     an accepted friendship, one row per pair (lo < hi). No
--                    client grant at all.
--   social_presence  when an account last had the game open (server clock),
--                    stamped by hr_social_state's poll (floor 20 s). No grant.
--
-- ── THE RPCs (definer; hr_access_check first; hr_rate_ok budgets) ──────────
-- A target is p_target: a user id (from a chat line or the friends list) or a
-- claimed display name (resolved through display_names). Nothing else about the
-- other player crosses from the client.
--   hr_whisper_send(p_slot, p_target, p_body)  refused `unavailable` when EITHER
--        side blocks the other (no oracle for which one); body rules and item
--        links exactly as chat (hr_chat_body_fault); 5/10 s + 20/min.
--   hr_whispers_recent()                     the last 100 to or from the caller,
--        blocked senders removed.
--   hr_block_set(p_target, p_on)             block / unblock; blocking also ends
--        a friendship and every pending request between the two. ≤500 blocks.
--   hr_friend_request(p_target)              refused when either side blocks
--        (`unavailable`), to self, when already friends; a request back to
--        someone who asked first ACCEPTS it. ≤200 friends, ≤50 pending asks.
--   hr_friend_answer(p_target, p_accept)     answer a request made TO the caller.
--   hr_friend_remove(p_target)               end a friendship or withdraw /
--        refuse a pending request.
--   hr_social_state(p_slot)                  stamps presence; answers friends
--        (name, online, what they do: hunting where / in town), the requests both
--        ways and the block list (with Unblock targets).
--   hr_inspect(p_target, p_slot)             a read-only view of ONE character's
--        WORN items (player_equipment) plus name, level and weapon — never the
--        bag or the bank. Refused `unavailable` across a block.
--   hr_social_blocked(a, b) is internal and is the helper the party-invite and
--   trade verbs call when they land (CONFLICTS.md, 2026-10-18 social).
--
-- ── PRIVACY ─────────────────────────────────────────────────────────────────
-- Online state and "what they are doing" go only to ACCEPTED friends, and a
-- character's presence_quiet hides both. A whisper refusal never says who
-- blocked whom.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- +8 client functions (definer, rate-gated, closed-mode gated), +1 readable
-- table (chat_whispers, participants only). −1 client write path (chat_blocks).
-- No value moves: nothing here touches gold, items, XP or a ranking.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- hr_social_state is the poll (30 s while the game is open): one presence
-- upsert at most every 20 s, then point reads per friend (≤200, indexed).
-- Whispers are one insert; reads use the two (who, created_at) indexes.
--
-- REVERSIBILITY: drop the eight functions, the four new tables and
-- trim-chat-whispers; `grant select, insert, update, delete on
-- public.chat_blocks to authenticated` and re-create its "blocks own" policy.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_chat_body_fault(text)') is null or to_regprocedure('public.hr_chat_clean(text)') is null
     or to_regprocedure('public.hr_chat_role_pick(uuid,integer)') is null then
    raise exception 'social §0: apply 2026-10-25-chat-channels.sql first';
  end if;
  if to_regclass('public.display_names') is null or to_regclass('public.player_equipment') is null
     or to_regclass('public.chat_blocks') is null or to_regprocedure('public.hr_canon_display_name(text)') is null then
    raise exception 'social §0: display_names / player_equipment / chat_blocks / hr_canon_display_name absent';
  end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.chat_whispers (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references auth.users (id) on delete cascade,
  from_slot   smallint check (from_slot between 0 and 32),
  from_name   text not null check (length(from_name) between 1 and 24),
  from_level  int check (from_level between 0 and 10000),
  from_weapon text check (from_weapon ~ '^[a-z0-9_]{1,32}$'),
  from_role   text check (from_role ~ '^[a-z_]{1,32}$'),
  to_id       uuid not null references auth.users (id) on delete cascade,
  to_name     text not null check (length(to_name) between 1 and 24),
  body        text not null check (length(body) between 1 and 240),
  created_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists chat_whispers_to on public.chat_whispers (to_id, created_at desc);
create index if not exists chat_whispers_from on public.chat_whispers (from_id, created_at desc);

create table if not exists public.friend_requests (
  from_id    uuid not null references auth.users (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index if not exists friend_requests_to on public.friend_requests (to_id);

create table if not exists public.friend_links (
  user_lo    uuid not null references auth.users (id) on delete cascade,
  user_hi    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_lo, user_hi),
  check (user_lo < user_hi)
);
create index if not exists friend_links_hi on public.friend_links (user_hi);

create table if not exists public.social_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slot    smallint not null check (slot between 0 and 32),
  seen_at timestamptz not null
);

alter table public.chat_whispers enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_links enable row level security;
alter table public.social_presence enable row level security;
revoke all on public.chat_whispers, public.friend_requests, public.friend_links, public.social_presence
  from public, anon, authenticated, service_role;
grant select on public.chat_whispers to authenticated;

drop policy if exists "whispers readable by the two" on public.chat_whispers;
create policy "whispers readable by the two" on public.chat_whispers
  for select to authenticated using ((select auth.uid()) in (from_id, to_id));
drop policy if exists hr_chat_hide_blocked on public.chat_whispers;
create policy hr_chat_hide_blocked on public.chat_whispers as restrictive
  for select to authenticated using (not exists (
    select 1 from public.chat_blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = chat_whispers.from_id));
drop policy if exists hr_closed_admit on public.chat_whispers;
create policy hr_closed_admit on public.chat_whispers as restrictive for all to authenticated
  using ((select public.hr_admitted((select auth.uid())))) with check ((select public.hr_admitted((select auth.uid()))));

create or replace function public.hr_whisper_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'chat_whispers is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $$;
revoke execute on function public.hr_whisper_immutable() from public, anon, authenticated, service_role;
drop trigger if exists hr_whisper_immutable on public.chat_whispers;
create trigger hr_whisper_immutable before update on public.chat_whispers
  for each row execute function public.hr_whisper_immutable();

-- The whisper channel the old chat used inside chat_messages is retired: whispers have their own table.
drop policy if exists "whispers readable by participants" on public.chat_messages;

-- chat_blocks: the RPC is the writer; the owner keeps reading its own rows.
drop policy if exists "blocks own" on public.chat_blocks;
drop policy if exists "blocks own read" on public.chat_blocks;
create policy "blocks own read" on public.chat_blocks for select to authenticated using ((select auth.uid()) = blocker_id);
revoke insert, update, delete, truncate, references, trigger on public.chat_blocks from anon, authenticated;
revoke select on public.chat_blocks from anon;
grant select on public.chat_blocks to authenticated;

do $mig$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = 'chat_whispers') then
    alter publication supabase_realtime add table public.chat_whispers;
  end if;
end $mig$;

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable — trim-chat-whispers is not scheduled here';
    return;
  end if;
  perform cron.schedule('trim-chat-whispers', '25 3 * * *',
    'delete from public.chat_whispers where created_at < now() - interval ''30 days''');
end $mig$;

-- ── §2 THE HELPERS (internal) ────────────────────────────────────────────────
create or replace function public.hr_social_resolve(p_target text)
returns uuid language sql stable set search_path = public, pg_catalog as $$
  select case
    when p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select p.id from public.profiles p where p.id = p_target::uuid)
    when length(coalesce(p_target, '')) between 1 and 40
      then (select d.user_id from public.display_names d where d.canonical = public.hr_canon_display_name(p_target))
  end
$$;
create or replace function public.hr_social_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select exists (select 1 from public.chat_blocks b
                  where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a))
$$;
create or replace function public.hr_social_name(p_user uuid)
returns text language sql stable set search_path = public, pg_catalog as $$
  select left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = p_user)), ''), 'Adventurer'), 24)
$$;
create or replace function public.hr_social_friends(p_a uuid, p_b uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select exists (select 1 from public.friend_links f where f.user_lo = least(p_a, p_b) and f.user_hi = greatest(p_a, p_b))
$$;
-- What a friend is doing, as the server knows it: a running hunt on any character, else in town.
create or replace function public.hr_social_doing(p_user uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select jsonb_build_object('kind', 'hunting', 'hunt', h.hunt_id, 'slot', h.slot)
                     from public.hunt_sessions h where h.user_id = p_user and h.ended_at is null
                    order by h.entered_at desc limit 1),
                  jsonb_build_object('kind', 'town'))
$$;
create or replace function public.hr_social_person(p_user uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', p_user, 'name', public.hr_social_name(p_user))
$$;
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_social_resolve(text)', 'public.hr_social_blocked(uuid,uuid)',
                           'public.hr_social_name(uuid)', 'public.hr_social_friends(uuid,uuid)',
                           'public.hr_social_doing(uuid)', 'public.hr_social_person(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $mig$;

-- ── §3 WHISPERS ──────────────────────────────────────────────────────────────
create or replace function public.hr_whisper_row(w public.chat_whispers)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', w.id, 'from_id', w.from_id, 'from_name', w.from_name, 'from_slot', w.from_slot,
    'from_level', w.from_level, 'from_weapon', w.from_weapon, 'from_role', w.from_role,
    'to_id', w.to_id, 'to_name', w.to_name, 'body', w.body, 'created_at', w.created_at)
$$;
revoke execute on function public.hr_whisper_row(public.chat_whispers) from public, anon, authenticated, service_role;

create or replace function public.hr_whisper_send(p_slot int, p_target text, p_body text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_to uuid; v_body text; v_fault text; v_row public.chat_whispers%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:burst', 5, interval '10 seconds') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_to := public.hr_social_resolve(p_target);
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_to = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_to) or not public.hr_admitted(v_to) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
  values (v_uid, p_slot, public.hr_social_name(v_uid), public.hr_bounty_combat_level(v_uid, p_slot),
          public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot),
          v_to, public.hr_social_name(v_to), v_body)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_whisper_row(v_row));
end $$;

create or replace function public.hr_whispers_recent()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  return jsonb_build_object('ok', true, 'lines', coalesce((
    select jsonb_agg(public.hr_whisper_row(x) order by x.created_at, x.id) from (
      select * from public.chat_whispers w
       where (w.to_id = v_uid or w.from_id = v_uid)
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = w.from_id)
       order by w.created_at desc limit 100) x), '[]'::jsonb));
end $$;

-- ── §4 BLOCKS ────────────────────────────────────────────────────────────────
create or replace function public.hr_block_set(p_target text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_on is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if p_on then
    if (select count(*) from public.chat_blocks where blocker_id = v_uid) >= 500 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_uid, v_t) on conflict do nothing;
    delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
    delete from public.friend_requests where (from_id = v_uid and to_id = v_t) or (from_id = v_t and to_id = v_uid);
  else
    delete from public.chat_blocks where blocker_id = v_uid and blocked_id = v_t;
  end if;
  return jsonb_build_object('ok', true, 'blocked', p_on, 'person', public.hr_social_person(v_t));
end $$;

-- ── §5 FRIENDS ───────────────────────────────────────────────────────────────
create or replace function public.hr_friend_request(p_target text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if public.hr_social_friends(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'already_friends'); end if;
  if exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
    return jsonb_build_object('ok', true, 'state', 'friends', 'person', public.hr_social_person(v_t));
  end if;
  if (select count(*) from public.friend_requests where from_id = v_uid) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  insert into public.friend_requests (from_id, to_id) values (v_uid, v_t) on conflict do nothing;
  return jsonb_build_object('ok', true, 'state', 'requested', 'person', public.hr_social_person(v_t));
end $$;

create or replace function public.hr_friend_answer(p_target text, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_accept is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null or not exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  if p_accept then
    if public.hr_social_blocked(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'state', case when p_accept then 'friends' else 'declined' end,
                            'person', public.hr_social_person(v_t));
end $$;

create or replace function public.hr_friend_remove(p_target text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  return jsonb_build_object('ok', true, 'state', 'none', 'person', public.hr_social_person(v_t));
end $$;

-- ── §6 THE SOCIAL READ (and the presence stamp) ──────────────────────────────
create or replace function public.hr_social_state(p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_floor constant interval := interval '20 seconds';
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    insert into public.social_presence as sp (user_id, slot, seen_at) values (v_uid, p_slot, now())
    on conflict (user_id) do update set slot = excluded.slot, seen_at = excluded.seen_at
      where sp.seen_at < now() - c_floor or sp.slot <> excluded.slot;
  end if;
  return jsonb_build_object('ok', true, 'me', v_uid,
    'friends', coalesce((
      select jsonb_agg(public.hr_social_person(f.other)
               || case when q.quiet then jsonb_build_object('online', false, 'doing', null)
                       else jsonb_build_object('online', coalesce(sp.seen_at > now() - c_online, false),
                                               'doing', public.hr_social_doing(f.other)) end
             order by public.hr_social_name(f.other), f.other)
        from (select case when l.user_lo = v_uid then l.user_hi else l.user_lo end as other
                from public.friend_links l where l.user_lo = v_uid or l.user_hi = v_uid) f
        left join public.social_presence sp on sp.user_id = f.other
        cross join lateral (select coalesce((select ps.presence_quiet from public.player_state ps
                                              where ps.user_id = f.other and ps.slot = coalesce(sp.slot, 0)), false) as quiet) q), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(public.hr_social_person(r.from_id) order by r.created_at)
                            from public.friend_requests r where r.to_id = v_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.hr_social_person(r.to_id) order by r.created_at)
                            from public.friend_requests r where r.from_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(public.hr_social_person(b.blocked_id) order by b.created_at)
                          from public.chat_blocks b where b.blocker_id = v_uid), '[]'::jsonb));
end $$;

-- ── §6b INSPECT: WORN ITEMS ONLY ─────────────────────────────────────────────
create or replace function public.hr_inspect(p_target text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot),
                     (select sp.slot from public.social_presence sp join public.player_state ps
                         on ps.user_id = sp.user_id and ps.slot = sp.slot where sp.user_id = v_t),
                     (select min(ps.slot) from public.player_state ps where ps.user_id = v_t));
  if v_slot is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', public.hr_social_name(v_t), 'slot', v_slot,
    'level', public.hr_bounty_combat_level(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $$;

-- ── §6c GRANTS AND THE BASELINE ──────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_whisper_send(integer,text,text)', 'public.hr_whispers_recent()',
                           'public.hr_block_set(text,boolean)', 'public.hr_friend_request(text)',
                           'public.hr_friend_answer(text,boolean)', 'public.hr_friend_remove(text)',
                           'public.hr_social_state(integer)', 'public.hr_inspect(text,integer)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in
  ('hr_whisper_send', 'hr_whispers_recent', 'hr_block_set', 'hr_friend_request', 'hr_friend_answer',
   'hr_friend_remove', 'hr_social_state', 'hr_inspect');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_whisper_send', 'p_slot integer, p_target text, p_body text', 'authenticated',
   'added 2026-10-25 (social): a private line; refused across a block either way; chat body rules and links; 5/10 s, 20/min'),
  ('hr_whispers_recent', '', 'authenticated', 'added 2026-10-25 (social): the last 100 whispers to or from the caller, blocked senders removed'),
  ('hr_block_set', 'p_target text, p_on boolean', 'authenticated',
   'added 2026-10-25 (social): block / unblock; a block ends the friendship and pending requests; the only chat_blocks writer'),
  ('hr_friend_request', 'p_target text', 'authenticated', 'added 2026-10-25 (social): ask to be friends; refused across a block; a mutual ask accepts'),
  ('hr_friend_answer', 'p_target text, p_accept boolean', 'authenticated', 'added 2026-10-25 (social): accept or decline a request made to the caller'),
  ('hr_friend_remove', 'p_target text', 'authenticated', 'added 2026-10-25 (social): end a friendship or withdraw a request'),
  ('hr_social_state', 'p_slot integer', 'authenticated',
   'added 2026-10-25 (social): friends with online and what they do (friends only, presence_quiet respected), requests, blocks; stamps presence'),
  ('hr_inspect', 'p_target text, p_slot integer', 'authenticated',
   'added 2026-10-25 (social): one character''s WORN items, name, level and weapon; never the bag; refused across a block');

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00000c4a8001';
  v_b constant uuid := '000000c0-0000-0000-0000-00000c4a8002';
  v_c constant uuid := '000000c0-0000-0000-0000-00000c4a8003';
  v_x constant uuid := '000000c0-0000-0000-0000-00000c4a8004';   -- NOT allowlisted
  v jsonb; v_n int; v_err text; v_u uuid; v_i int; v_want jsonb;
  v_item text := (select item_id from public.hr_items order by item_id limit 1);
begin
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'social §7')
      on conflict (key) do update set enabled = true;
    foreach v_u in array array[v_a, v_b, v_c, v_x] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Social' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      if v_u <> v_x then
        insert into public.hr_access_allowlist (user_id, note) values (v_u, 'social §7 probe') on conflict (user_id) do nothing;
        v := public.hr_create_character(0);
        if coalesce(v->>'ok', '') <> 'true' then raise exception 'social §7(a): hr_create_character refused: %', v; end if;
      end if;
    end loop;

    -- (a) a whisper: the server stamps both names; only the two read it.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_whisper_send(0, v_b::text, 'psst');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'from_name' <> 'Social1' or v->'line'->>'to_name' <> 'Social2'
       or (v->'line'->>'from_level')::int is distinct from public.hr_bounty_combat_level(v_a, 0) then
      raise exception 'social §7(a): a whisper is %', v; end if;
    if public.hr_whisper_send(0, v_a::text, 'me')->>'error' is distinct from 'self'
       or public.hr_whisper_send(0, 'Nobody Here', 'hi')->>'error' is distinct from 'no_player'
       or public.hr_whisper_send(0, v_b::text, 'see [[item:no_such_item_zz]]')->>'error' is distinct from 'bad_link'
       or public.hr_whisper_send(0, v_x::text, 'hi')->>'error' is distinct from 'unavailable' then
      raise exception 'social §7(a): a bad whisper was not refused as itself'; end if;
    foreach v_u in array array[v_b, v_c] loop
      perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      set local role authenticated;
      select count(*) into v_n from public.chat_whispers;
      reset role;
      if v_n <> (case when v_u = v_b then 1 else 0 end) then raise exception 'social §7(a): % reads % whisper(s)', v_u, v_n; end if;
    end loop;

    -- (b) friends: ask, see it, accept; online and doing for friends; remove.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = v_a;
    if public.hr_friend_request(v_c::text)->>'state' is distinct from 'requested' then raise exception 'social §7(b): the ask'; end if;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_social_state(0);
    if jsonb_array_length(v->'incoming') <> 1 or (v->'incoming'->0->>'id')::uuid <> v_a or jsonb_array_length(v->'friends') <> 0 then
      raise exception 'social §7(b): the asked player''s state is %', v; end if;
    if public.hr_friend_answer(v_a::text, true)->>'state' is distinct from 'friends' then raise exception 'social §7(b): accept'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_social_state(0);
    if jsonb_array_length(v->'friends') <> 1 or v->'friends'->0->>'name' <> 'Social3'
       or (v->'friends'->0->>'online')::boolean is distinct from true or v->'friends'->0->'doing'->>'kind' <> 'town' then
      raise exception 'social §7(b): the friend list is %', v; end if;
    if public.hr_friend_request(v_c::text)->>'error' is distinct from 'already_friends' then raise exception 'social §7(b): re-ask'; end if;
    update public.player_state set presence_quiet = true where user_id = v_c and slot = 0;
    if (public.hr_social_state(0)->'friends'->0->>'online')::boolean then raise exception 'social §7(b): presence_quiet ignored'; end if;
    perform public.hr_friend_remove(v_c::text);
    if jsonb_array_length(public.hr_social_state(0)->'friends') <> 0 then raise exception 'social §7(b): remove'; end if;
    -- a mutual ask accepts
    perform public.hr_friend_request(v_b::text);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if public.hr_friend_request(v_a::text)->>'state' is distinct from 'friends' then raise exception 'social §7(b): a mutual ask'; end if;

    -- (c) a block: whispers and friend asks refused BOTH ways; the friendship ends; the old whisper is hidden.
    v := public.hr_block_set(v_a::text, true);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_social_friends(v_a, v_b) then raise exception 'social §7(c): block %', v; end if;
    if public.hr_whisper_send(0, v_a::text, 'hi')->>'error' is distinct from 'unavailable' then raise exception 'social §7(c): blocker whispers'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.chat_whispers where from_id = v_a;
    reset role;
    if v_n <> 0 then raise exception 'social §7(c): the blocked sender''s whisper is still readable'; end if;
    if jsonb_array_length(public.hr_whispers_recent()->'lines') <> 0 then raise exception 'social §7(c): history shows the blocked sender'; end if;
    if jsonb_array_length(public.hr_social_state(0)->'blocks') <> 1 then raise exception 'social §7(c): the block list'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_whisper_send(0, v_b::text, 'hi')->>'error' is distinct from 'unavailable'
       or public.hr_friend_request(v_b::text)->>'error' is distinct from 'unavailable'
       or public.hr_inspect(v_b::text, 0)->>'error' is distinct from 'unavailable' then
      raise exception 'social §7(c): the blocked player reached the blocker'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_block_set(v_a::text, false);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = v_a;
    if coalesce(public.hr_whisper_send(0, v_b::text, 'again')->>'ok', '') <> 'true' then raise exception 'social §7(c): unblock'; end if;

    -- (d) inspect shows exactly the worn items, never the bag.
    if v_item is not null then
      insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_c, 0, 'probe_slot', v_item)
        on conflict do nothing;
    end if;
    v := public.hr_inspect(v_c::text, 0);
    select coalesce(jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot), '[]'::jsonb)
      into v_want from public.player_equipment e where e.user_id = v_c and e.slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v->'gear' <> v_want or v->>'name' <> 'Social3'
       or (select array_agg(k order by k) from jsonb_object_keys(v) k) <> array['gear', 'id', 'level', 'name', 'ok', 'role', 'slot', 'weapon'] then
      raise exception 'social §7(d): inspect is % (want gear %)', v, v_want; end if;

    -- (e) the whisper rate limit.
    delete from public.hr_rate_counters where user_id = v_a;
    for v_i in 1 .. 5 loop
      if coalesce(public.hr_whisper_send(0, v_b::text, 'w' || v_i)->>'ok', '') <> 'true' then raise exception 'social §7(e): whisper % refused', v_i; end if;
    end loop;
    if public.hr_whisper_send(0, v_b::text, 'w6')->>'error' is distinct from 'rate_limited' then raise exception 'social §7(e): the sixth was not limited'; end if;

    -- (f) a client cannot write a block or a whisper itself.
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      set local role authenticated;
      insert into public.chat_blocks (blocker_id, blocked_id) values (v_a, v_c);
    exception when insufficient_privilege then v_err := 'refused';
    end;
    reset role;
    if v_err is null then raise exception 'social §7(f): a client wrote chat_blocks directly'; end if;
    v_err := null;
    begin
      set local role authenticated;
      insert into public.chat_whispers (from_id, from_name, to_id, to_name, body) values (v_a, 'Tyler', v_b, 'x', 'forged');
    exception when insufficient_privilege then v_err := 'refused';
    end;
    reset role;
    if v_err is null then raise exception 'social §7(f): a client wrote chat_whispers directly'; end if;

    -- (g) closed mode refuses a non-allowlisted caller.
    perform set_config('request.jwt.claim.sub', v_x::text, true);
    v_err := null;
    begin perform public.hr_social_state(0); exception when sqlstate 'PGRST' then v_err := sqlerrm; end;
    if v_err is null or position('hr_closed' in v_err) = 0 then raise exception 'social §7(g): hr_social_state admitted a closed caller'; end if;
    v_err := null;
    begin perform public.hr_whisper_send(0, v_a::text, 'hi'); exception when sqlstate 'PGRST' then v_err := sqlerrm; end;
    if v_err is null then raise exception 'social §7(g): hr_whisper_send admitted a closed caller'; end if;
    raise exception using errcode = 'HR871', message = 'social §7 complete - rolling back';
  exception when sqlstate 'HR871' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.chat_whispers where from_id in (v_a, v_b, v_c, v_x))
     or exists (select 1 from public.friend_links where user_lo in (v_a, v_b, v_c) or user_hi in (v_a, v_b, v_c))
     or exists (select 1 from public.social_presence where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c)) then
    raise exception 'social §7(h): a probe row leaked'; end if;
  if has_table_privilege('authenticated', 'public.friend_links', 'select') or has_table_privilege('authenticated', 'public.friend_requests', 'select')
     or has_table_privilege('authenticated', 'public.social_presence', 'select')
     or has_table_privilege('authenticated', 'public.chat_whispers', 'insert')
     or has_table_privilege('authenticated', 'public.chat_blocks', 'insert') or has_table_privilege('anon', 'public.chat_whispers', 'select')
     or has_function_privilege('authenticated', 'public.hr_social_blocked(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_inspect(text,integer)', 'execute') then
    raise exception 'social §7(h): the social grants are not exact'; end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_whispers') then
    raise exception 'social §7(h): chat_whispers is not published — a whisper would never arrive'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'social: whispers, blocks both ways, friends with accept, presence for friends only, inspect worn only; all green';
end $mig$;
