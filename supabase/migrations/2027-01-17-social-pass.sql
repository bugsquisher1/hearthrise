-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY SOCIAL NAME IS ONE CHARACTER, AND THE ONE IT NAMES IS THE
-- ONE YOU REACH (played 2026-10-24 with two accounts, one holding two heroes,
-- one renamed, after the 2027-01-15 typed-name fix).
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it in the
-- reopen gate.
--
-- ── WHY (each seen in the play) ──────────────────────────────────────────────
-- hr_social_name(user) named an ACCOUNT by its most recently NAMED character,
-- whatever the player had on screen, and every social surface read it:
--   Friends   B played Bree Hollow; A's list said "Wren Ashby" (B's other hero,
--             named later). Asks for you / Your asks / Blocked: the same.
--   Whispers  B replied from Bree; the line said "Wren Ashby" [level of Bree].
--             The name was stamped at send and never followed a rename.
--   Inspect   A typed "wren ashby": the window showed Bree's gear (A's own
--             p_slot 0) under the account name. From the friends list it
--             showed the on-screen hero's gear (presence) under the other name.
--   Party     the party_people seats (the World's right-click targets) carried
--             the account name, not the seat's hero.
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_social_slot(user)     NEW, internal: the account's CURRENT character —
--                            the one on screen (social_presence, stamped by
--                            hr_social_state for the viewed hero), else its most
--                            recently named, else its first. ONE reader.
--   hr_social_target(text)   NEW, internal: a typed name or an id -> (user,
--                            slot). The user is hr_social_resolve's (unchanged,
--                            2027-01-15); a name means THAT character, an id the
--                            account's current one.
--   hr_social_name(user)     the current character's name (hr_character_name).
--   hr_social_person(user)   { id, name, slot }: the slot is the character the
--                            name is, so a friend row's Inspect / Invite reach
--                            the hero it shows.
--   hr_social_doing(user)    what THAT character is doing (its open hunt, else
--                            town), so a row never says "Bree · Hunting" while
--                            Wren hunts.
--   hr_social_state(slot)    presence_quiet is read on the same character.
--   hr_social_party_view     each seat by its own hero's name.
--   hr_whisper_send          from_name = the sending hero (p_slot); to_name =
--                            the hero typed, else the account's current one.
--   hr_whisper_row           renders the sender hero's CURRENT name (from_slot)
--                            and the recipient account's current name, so the
--                            history, the push and the send answer follow a
--                            rename (as hr_chat_row does since 2026-10-29).
--   hr_inspect               a typed name opens THAT character; an id opens the
--                            slot asked (a chat line's, a seat's), else the
--                            current one; the name is that character's.
-- Signatures, `security definer` / `sql stable`, search_path, grants and every
-- refusal (no_player, self, unavailable, rate limits, closed mode) unchanged.
-- §0 pins each pre-image (md5 of prosrc, measured on the replay chain
-- 2026-10-24) or this file's own image.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Display names and lookups only; no value moves. Every name and slot is the
-- server's (character_names, social_presence, player_state); the typed text is
-- only a key and p_slot only picks among the target's own existing characters.
-- Blocks, admission, self and rate checks run as before, before any read. The
-- slot a person carries is the character whose name is already shown; a quiet
-- character still hides online and doing. No new client function (the two new
-- helpers are revoked from every role).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_social_name / hr_social_person / hr_social_doing / hr_social_state
-- / hr_social_party_view / hr_whisper_row from 2026-10-25-social.sql (hr_social_
-- name from 2026-10-29-character-names-everywhere.sql) and hr_whisper_send /
-- hr_inspect from 2026-10-27-core-bodies.sql; drop hr_social_target and
-- hr_social_slot. ORDER: after 2027-01-15-social-resolve-character-names.sql.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text; r record;
begin
  if to_regprocedure('public.hr_character_by_name(text)') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regclass('public.social_presence') is null or to_regclass('public.character_names') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-social.sql and 2026-10-25-account-items.sql first'; end if;
  -- hr_social_resolve is READ here, never restated: the 2027-01-15 body (988e9be2).
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_social_resolve(text)'::regprocedure;
  if v_md5 is distinct from '988e9be2f800745eeb526597b8c76884' then
    raise exception 'PIN: hr_social_resolve is not the 2027-01-15 body (md5 %): apply 2027-01-15-social-resolve-character-names.sql first', v_md5; end if;
  for r in select * from (values
      ('public.hr_social_name(uuid)',               'f6b1c0b47be2b6b4fe4db92726187816'),
      ('public.hr_social_person(uuid)',             'f196159a29a0b8912a60e455f1e37be5'),
      ('public.hr_social_doing(uuid)',              '36359a21b1546e6511b65f99ce2affda'),
      ('public.hr_social_state(integer)',           '4d92a4468c1113b2b31567c393814bb4'),
      ('public.hr_social_party_view(uuid,integer)', '644b4d17fa3712189c28cd6d4c604e0c'),
      ('public.hr_whisper_row(public.chat_whispers)', '4853290c182e52f6c03af2fb732b2787'),
      ('public.hr_whisper_send(integer,text,text)', '23e3a8e3670f3f9d0f3c616cba78dafa'),
      ('public.hr_inspect(text,integer)',           '59d9315c59970c2a7ef3c51fd02ac2bc')) as t(fn, pre) loop
    select md5(prosrc) into v_md5 from pg_proc where oid = r.fn::regprocedure;
    -- The pre-image, or this file's own image (each restated body carries the marker SOCIAL-PASS).
    if v_md5 is distinct from r.pre
       and position('SOCIAL-PASS' in (select prosrc from pg_proc where oid = r.fn::regprocedure)) = 0 then
      raise exception 'PIN: % moved (md5 %)', r.fn, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ACCOUNT'S CURRENT CHARACTER, AND A TARGET AS (user, slot) ─────────
create or replace function public.hr_social_slot(p_user uuid)
returns int language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: the hero on screen (hr_social_state stamps the viewed slot), else the newest named, else the first.
  select coalesce(
    (select sp.slot from public.social_presence sp
       join public.player_state ps on ps.user_id = sp.user_id and ps.slot = sp.slot
      where sp.user_id = p_user),
    (select n.slot from public.character_names n where n.user_id = p_user order by n.updated_at desc, n.slot limit 1),
    (select min(ps.slot) from public.player_state ps where ps.user_id = p_user))
$$;
revoke execute on function public.hr_social_slot(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_social_target(p_target text, out target_user uuid, out target_slot int)
language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- SOCIAL-PASS: who is hr_social_resolve's (one resolver); a typed name means that character, an id the current one.
  target_user := public.hr_social_resolve(p_target);
  if target_user is null then return; end if;
  if p_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_slot := (select c.slot from public.hr_character_by_name(p_target) c where c.user_id = target_user);
  end if;
  target_slot := coalesce(target_slot, public.hr_social_slot(target_user));
end $$;
revoke execute on function public.hr_social_target(text) from public, anon, authenticated, service_role;

-- ── §2 THE NAME, THE PERSON AND WHAT THEY DO: ONE CHARACTER ──────────────────
create or replace function public.hr_social_name(p_user uuid)
returns text language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: the account's current character's name (hr_character_name: its own name, else the profile's).
  select left(coalesce(nullif(btrim(public.hr_character_name(p_user, coalesce(public.hr_social_slot(p_user), 0))), ''), 'Adventurer'), 24)
$$;
revoke execute on function public.hr_social_name(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_social_person(p_user uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: the slot is the character the name is.
  select jsonb_build_object('id', p_user, 'name', public.hr_social_name(p_user), 'slot', public.hr_social_slot(p_user))
$$;
revoke execute on function public.hr_social_person(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_social_doing(p_user uuid)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: what the named character is doing: its running hunt, else in town.
  select coalesce((select jsonb_build_object('kind', 'hunting', 'hunt', h.hunt_id, 'slot', h.slot)
                     from public.hunt_sessions h
                    where h.user_id = p_user and h.slot = public.hr_social_slot(p_user) and h.ended_at is null
                    order by h.entered_at desc limit 1),
                  jsonb_build_object('kind', 'town'))
$$;
revoke execute on function public.hr_social_doing(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_social_party_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: each seat by its own hero's name.
  select coalesce((select jsonb_agg(jsonb_build_object('seat', m.seat, 'user', m.user_id, 'slot', m.slot,
                                                       'name', left(public.hr_character_name(m.user_id, m.slot), 24)) order by m.seat)
                     from public.hunt_party_members m
                    where m.party_id = public.hr_hunt_party_of(p_user, p_slot)), '[]'::jsonb)
$$;
revoke execute on function public.hr_social_party_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 THE SOCIAL READ: presence_quiet on the character the row names ────────
create or replace function public.hr_social_state(p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_floor constant interval := interval '20 seconds';
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid();
begin
  -- SOCIAL-PASS: the 2026-10-25 body; a friend's quiet flag is read on hr_social_slot, the character its row names.
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
                                              where ps.user_id = f.other and ps.slot = public.hr_social_slot(f.other)), false) as quiet) q), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(public.hr_social_person(r.from_id) order by r.created_at)
                            from public.friend_requests r where r.to_id = v_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.hr_social_person(r.to_id) order by r.created_at)
                            from public.friend_requests r where r.from_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(public.hr_social_person(b.blocked_id) order by b.created_at)
                          from public.chat_blocks b where b.blocker_id = v_uid), '[]'::jsonb));
end $$;
revoke execute on function public.hr_social_state(integer) from public, anon, service_role;
grant execute on function public.hr_social_state(integer) to authenticated;

-- ── §4a WHISPERS: the sending hero, the hero reached, names that follow a rename ──
create or replace function public.hr_whisper_row(w public.chat_whispers)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- SOCIAL-PASS: the sender hero's CURRENT name (from_slot) and the recipient account's current name.
  select jsonb_build_object('id', w.id, 'from_id', w.from_id,
    'from_name', case when w.from_slot is not null then left(public.hr_character_name(w.from_id, w.from_slot), 24) else w.from_name end,
    'from_slot', w.from_slot, 'from_level', w.from_level, 'from_weapon', w.from_weapon, 'from_role', w.from_role,
    'to_id', w.to_id, 'to_name', public.hr_social_name(w.to_id), 'body', w.body, 'created_at', w.created_at)
$$;
revoke execute on function public.hr_whisper_row(public.chat_whispers) from public, anon, authenticated, service_role;

create or replace function public.hr_whisper_send(p_slot integer, p_target text, p_body text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_to uuid; v_to_slot int; v_body text; v_fault text; v_row public.chat_whispers%rowtype;
begin
  -- SOCIAL-PASS: the 2026-10-27 body; the line is stamped with the sending hero and the hero the target names.
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
  select t.target_user, t.target_slot into v_to, v_to_slot from public.hr_social_target(p_target) t;
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_to = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_to) or not public.hr_admitted(v_to) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
  values (v_uid, p_slot, left(public.hr_character_name(v_uid, p_slot), 24), public.hr_level_of(v_uid, p_slot),
          public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot),
          v_to, left(public.hr_character_name(v_to, coalesce(v_to_slot, 0)), 24), v_body)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_whisper_row(v_row));
end $$;
revoke execute on function public.hr_whisper_send(integer, text, text) from public, anon, service_role;
grant execute on function public.hr_whisper_send(integer, text, text) to authenticated;

-- ── §4b INSPECT: the character the target names ──────────────────────────────
create or replace function public.hr_inspect(p_target text, p_slot integer)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  -- SOCIAL-PASS: the 2026-10-27 body; a typed name opens THAT character, an id the slot asked else the current one.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select t.target_user, t.target_slot into v_t, v_slot from public.hr_social_target(p_target) t;
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot), v_slot);
  end if;
  if v_slot is null or not exists (select 1 from public.player_state ps where ps.user_id = v_t and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', left(public.hr_character_name(v_t, v_slot), 24), 'slot', v_slot,
    'level', public.hr_level_of(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $$;
revoke execute on function public.hr_inspect(text, integer) from public, anon, service_role;
grant execute on function public.hr_inspect(text, integer) to authenticated;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-0000c5a50001';   -- two heroes; the one asking
  v_b constant uuid := '000000c0-0000-0000-0000-0000c5a50002';   -- two heroes; the one asked about
  v jsonb; v_t text; v_n int; v_hunt text := (select hunt_id from public.hr_hunts order by hunt_id limit 1);
  v_inst uuid; v_w uuid;
  a0 text; a1 text; a0b text; b0 text; b1 text; v_absent text;   -- probe names generated per run, checked absent
begin
  -- Six fresh names nobody holds (a character or an account name).
  for v_n in 1 .. 6 loop
    loop
      v_t := (array['Za', 'Zb', 'Zc', 'Zd', 'Ze', 'Zf'])[v_n] || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_t))
            and not exists (select 1 from public.profiles where public.hr_canon_display_name(display_name) = public.hr_canon_display_name(v_t));
    end loop;
    case v_n when 1 then a0 := v_t; when 2 then a1 := v_t; when 3 then a0b := v_t; when 4 then b0 := v_t; when 5 then b1 := v_t; else v_absent := v_t; end case;
  end loop;
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'social-pass §4')
      on conflict (key) do update set enabled = true;
    foreach v_t in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_t::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_t::uuid, null) on conflict (id) do update set display_name = null;
      insert into public.hr_access_allowlist (user_id, note) values (v_t::uuid, 'social-pass §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_t, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-pass §4: hr_create_character(0) refused: %', v; end if;
      insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
        values (v_t::uuid, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict (user_id, slot, kind, key, period_key) do nothing;
      v := public.hr_create_character(1);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-pass §4: hr_create_character(1) refused: %', v; end if;
    end loop;
    -- Slot 0 named first, slot 1 last: the old hr_social_name answered the slot-1 name whatever was on screen.
    insert into public.character_names (user_id, slot, name, canonical, updated_at) values
      (v_a, 0, a0, public.hr_canon_display_name(a0), now() - interval '2 minutes'),
      (v_a, 1, a1, public.hr_canon_display_name(a1), now() - interval '1 minute'),
      (v_b, 0, b0, public.hr_canon_display_name(b0), now() - interval '2 minutes'),
      (v_b, 1, b1, public.hr_canon_display_name(b1), now() - interval '1 minute');
    -- B plays hero 0 (the viewed slot's poll stamps presence); A plays hero 0.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_social_state(0)->>'ok', '') <> 'true' then raise exception 'social-pass §4: B''s social read refused'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if coalesce(public.hr_social_state(0)->>'ok', '') <> 'true' then raise exception 'social-pass §4: A''s social read refused'; end if;

    -- (a) the account's name is the hero on screen, and its person carries that hero's slot.
    if public.hr_social_slot(v_b) is distinct from 0 or public.hr_social_name(v_b) is distinct from b0
       or public.hr_social_person(v_b) <> jsonb_build_object('id', v_b, 'name', b0, 'slot', 0) then
      raise exception 'social-pass §4(a): B on hero 0 reads as % / %', public.hr_social_name(v_b), public.hr_social_person(v_b); end if;
    -- (b) a target: a typed name is THAT hero (any case, any spacing); an id is the current one; nobody is nobody.
    if (select row(t.target_user, t.target_slot)::text from public.hr_social_target('  ' || upper(b1) || ' ') t) is distinct from row(v_b, 1)::text
       or (select row(t.target_user, t.target_slot)::text from public.hr_social_target(lower(b0)) t) is distinct from row(v_b, 0)::text
       or (select row(t.target_user, t.target_slot)::text from public.hr_social_target(v_b::text) t) is distinct from row(v_b, 0)::text
       or (select t.target_user from public.hr_social_target(v_absent) t) is not null
       or (select t.target_user from public.hr_social_target('') t) is not null then
      raise exception 'social-pass §4(b): hr_social_target is wrong'; end if;

    -- (c) friends: A asks B by B's hero-1 name; B accepts; A's list names B's hero on screen (0), with its slot.
    v := public.hr_friend_request(b1);
    if v->>'state' is distinct from 'requested' or v->'person'->>'name' is distinct from b0 then
      raise exception 'social-pass §4(c): the ask answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_social_state(0);
    if v->'incoming'->0->>'name' is distinct from a0 or (v->'incoming'->0->>'slot')::int is distinct from 0 then
      raise exception 'social-pass §4(c): B''s ask from A reads %', v->'incoming'; end if;
    if public.hr_friend_answer(v_a::text, true)->>'state' is distinct from 'friends' then raise exception 'social-pass §4(c): accept'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_social_state(0)->'friends'->0;
    if v->>'name' is distinct from b0 or (v->>'slot')::int is distinct from 0 or v->'doing'->>'kind' is distinct from 'town' then
      raise exception 'social-pass §4(c): A''s friend row is % (want % on slot 0, in town)', v, b0; end if;
    -- B's hero 1 hunts while hero 0 is on screen: the row speaks for hero 0 only.
    v_inst := gen_random_uuid();
    insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values (v_inst, v_hunt, now(), now());
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (gen_random_uuid(), v_b, 1, v_hunt, now(), now(), now(), now(), v_inst);
    v := public.hr_social_state(0)->'friends'->0;
    if v->'doing'->>'kind' is distinct from 'town' then raise exception 'social-pass §4(c): hero 0''s row says %', v->'doing'; end if;
    -- B switches to hero 1: the row is hero 1, hunting; then quiet hides it.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_social_state(1);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_social_state(0)->'friends'->0;
    if v->>'name' is distinct from b1 or (v->>'slot')::int is distinct from 1 or v->'doing'->>'kind' is distinct from 'hunting'
       or v->'doing'->>'hunt' is distinct from v_hunt then
      raise exception 'social-pass §4(c): after the switch the row is %', v; end if;
    update public.player_state set presence_quiet = true where user_id = v_b and slot = 1;
    v := public.hr_social_state(0)->'friends'->0;
    if (v->>'online')::boolean or v->'doing' <> 'null'::jsonb then raise exception 'social-pass §4(c): a quiet hero shows %', v; end if;
    update public.player_state set presence_quiet = false where user_id = v_b and slot = 1;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform public.hr_social_state(0);
    perform set_config('request.jwt.claim.sub', v_a::text, true);

    -- (d) inspect: a typed name opens THAT hero whatever p_slot the caller sends; an id opens the slot asked, else the current one.
    delete from public.player_equipment where user_id = v_b;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_b, 1, 'probe_slot',
      (select item_id from public.hr_items order by item_id limit 1));
    v := public.hr_inspect('  ' || lower(b1) || '  ', 0);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'slot')::int is distinct from 1 or v->>'name' is distinct from b1
       or jsonb_array_length(v->'gear') <> 1 then
      raise exception 'social-pass §4(d): inspect by % answered %', b1, v; end if;
    v := public.hr_inspect(b0, 1);
    if (v->>'slot')::int is distinct from 0 or v->>'name' is distinct from b0 or jsonb_array_length(v->'gear') <> 0 then
      raise exception 'social-pass §4(d): inspect by % answered %', b0, v; end if;
    v := public.hr_inspect(v_b::text, null);
    if (v->>'slot')::int is distinct from 0 or v->>'name' is distinct from b0 then raise exception 'social-pass §4(d): by id, no slot: %', v; end if;
    v := public.hr_inspect(v_b::text, 1);
    if (v->>'slot')::int is distinct from 1 or v->>'name' is distinct from b1 then raise exception 'social-pass §4(d): by id, slot 1: %', v; end if;
    v := public.hr_inspect(v_b::text, 4);
    if (v->>'slot')::int is distinct from 0 then raise exception 'social-pass §4(d): by id, an empty slot: %', v; end if;
    v := public.hr_inspect(a1, 0);
    if (v->>'slot')::int is distinct from 1 or (v->>'id')::uuid is distinct from v_a then raise exception 'social-pass §4(d): own hero by name: %', v; end if;
    if public.hr_inspect(v_absent, 0)->>'error' is distinct from 'no_player' then raise exception 'social-pass §4(d): an absent name'; end if;

    -- (e) whispers: STAMPED with the sending hero and the hero typed (B's hero 1, while hero 0 is on screen);
    --     RENDERED with the sender hero's current name and the recipient account's current name; refusals unchanged.
    v := public.hr_whisper_send(0, upper(b1), 'hello');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'from_name' is distinct from a0 or v->'line'->>'to_name' is distinct from b0 then
      raise exception 'social-pass §4(e): a whisper from hero 0 to % is %', b1, v; end if;
    v_w := (v->'line'->>'id')::uuid;
    if (select row(w.from_name, w.to_name)::text from public.chat_whispers w where w.id = v_w) is distinct from row(a0, b1)::text then
      raise exception 'social-pass §4(e): the stamp is %', (select row(w.from_name, w.to_name)::text from public.chat_whispers w where w.id = v_w); end if;
    v := public.hr_whisper_send(1, v_b::text, 'from my other hero');
    if v->'line'->>'from_name' is distinct from a1 or (v->'line'->>'from_slot')::int is distinct from 1
       or (select row(w.from_name, w.to_name)::text from public.chat_whispers w where w.id = (v->'line'->>'id')::uuid) is distinct from row(a1, b0)::text then
      raise exception 'social-pass §4(e): a whisper from hero 1 is % (stamp %)', v,
        (select row(w.from_name, w.to_name)::text from public.chat_whispers w where w.id = (v->'line'->>'id')::uuid); end if;
    if public.hr_whisper_send(0, a1, 'me')->>'error' is distinct from 'self'
       or public.hr_whisper_send(0, v_absent, 'hi')->>'error' is distinct from 'no_player' then
      raise exception 'social-pass §4(e): a whisper to self / nobody was not refused as itself'; end if;
    -- A renames hero 0: the history and B's read follow it.
    update public.character_names set name = a0b, canonical = public.hr_canon_display_name(a0b), updated_at = now() - interval '3 minutes'
     where user_id = v_a and slot = 0;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_whispers_recent();
    if (select l->>'from_name' from jsonb_array_elements(v->'lines') l where (l->>'id')::uuid = v_w) is distinct from a0b then
      raise exception 'social-pass §4(e): after a rename B reads %', v; end if;

    -- (f) the party seats: each by its own hero.
    insert into public.hunt_parties (id, hunt_id, leader_user, leader_slot, max_size)
      values ('000000c0-0000-4000-a000-0000c5a50101', 'socialprobe', v_a, 0, 4);
    insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type) values
      ('000000c0-0000-4000-a000-0000c5a50101', v_a, 0, 0, 'neutral'), ('000000c0-0000-4000-a000-0000c5a50101', v_b, 1, 1, 'neutral');
    v := public.hr_social_party_view(v_a, 0);
    if v->0->>'name' is distinct from a0b or v->1->>'name' is distinct from b1 then
      raise exception 'social-pass §4(f): the seats read %', v; end if;
    raise exception using errcode = 'HR863', message = 'social-pass §4 complete - rolling back';
  exception when sqlstate 'HR863' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (v_a, v_b)) or exists (select 1 from public.chat_whispers where from_id in (v_a, v_b)) then
    raise exception 'social-pass §4: LEAKED a probe row'; end if;

  -- (g) shapes and grants: the helpers internal; the three client verbs definer, authenticated only.
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_social_slot(uuid)'::regprocedure, 'public.hr_social_target(text)'::regprocedure,
                                                      'public.hr_social_name(uuid)'::regprocedure, 'public.hr_social_person(uuid)'::regprocedure,
                                                      'public.hr_social_doing(uuid)'::regprocedure, 'public.hr_whisper_row(public.chat_whispers)'::regprocedure,
                                                      'public.hr_social_party_view(uuid,integer)'::regprocedure)
              and (p.prosecdef or p.provolatile <> 's' or not (p.proconfig @> array['search_path=public, pg_catalog'])
                   or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'social-pass §4(g): an internal helper changed shape or reached a client role'; end if;
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_social_state(integer)'::regprocedure, 'public.hr_whisper_send(integer,text,text)'::regprocedure,
                                                      'public.hr_inspect(text,integer)'::regprocedure)
              and (not p.prosecdef or not (p.proconfig @> array['search_path=public, pg_catalog'])
                   or not has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) then
    raise exception 'social-pass §4(g): a client verb changed shape or grant'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'social-pass: every social name is the hero on screen or the hero named; inspect and whispers reach that hero; all green';
end $$;
