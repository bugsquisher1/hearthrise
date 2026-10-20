-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY NAME IS THE CHARACTER'S CURRENT NAME (Tyler, live
-- 2026-10-19: "every hero still shows as Adventurer, even after renaming").
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it in the
-- reopen gate.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A character's name lives in public.character_names (hr_character_name_set,
-- 2026-10-25-account-items.sql), but three readers never looked there:
--   hr_chat_name_authority (2026-08-11) stamped chat lines with the ACCOUNT's
--     profiles.display_name, else 'Adventurer';
--   hr_chat_row (2026-10-25) sent that stamp back for every old line, so a
--     rename never reached history;
--   hr_social_name (2026-10-25) named town walkers, whispers, friends, inspect
--     and party seats by profiles.display_name, else 'Adventurer'.
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_chat_name_authority  stamps hr_character_name(sender, from_slot).
--   hr_chat_row             renders a player's line by the sender's CURRENT
--                           character name (hr_character_name), so history
--                           follows a rename at the next read; a system line
--                           (no sender) keeps its stamp.
--   hr_social_name          the account's character name: its most recently
--                           named character (character_names), else the
--                           profile name, else 'Adventurer'.
-- §0 pins each pre-image (md5 of prosrc) or this file's own image.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only display names, server-sourced; no client value is stamped (the
-- sender and slot are the session's and hr_chat_send's). No value moves.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the three bodies from 2026-08-11-chat-name-authority.sql,
-- 2026-10-25-chat-channels.sql §4a and 2026-10-25-social.sql §1.
-- ORDER: last in the chain. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text; v_src text;
begin
  if to_regprocedure('public.hr_character_name(uuid,integer)') is null or to_regclass('public.character_names') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-account-items.sql first'; end if;
  select md5(prosrc), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_chat_name_authority()'::regprocedure;
  -- 70d618d4… is the 2026-08-11 file's body (the replay chain); f03cc173… is the same body as live holds it,
  -- comments stripped (read from prod 2026-10-20 03:05 UTC).
  if v_md5 not in ('70d618d4b00b374071c73a84a2fce349', 'f03cc173cf884515bac99546affe4334')
     and strpos(v_src, 'hr_character_name(new.from_id') = 0 then
    raise exception 'PIN: hr_chat_name_authority moved (md5 %)', v_md5; end if;
  select md5(prosrc), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_chat_row(public.chat_messages)'::regprocedure;
  if v_md5 <> '2d01e547d17bfb1aa2398b60337e8dc2' and strpos(v_src, 'hr_character_name(m.from_id') = 0 then
    raise exception 'PIN: hr_chat_row moved (md5 %)', v_md5; end if;
  select md5(prosrc), prosrc into v_md5, v_src from pg_proc where oid = 'public.hr_social_name(uuid)'::regprocedure;
  if v_md5 <> 'b17f6803f9d0dec7c979912715d067ae' and strpos(v_src, 'character_names') = 0 then
    raise exception 'PIN: hr_social_name moved (md5 %)', v_md5; end if;
end $mig$;

-- ── §1 THE THREE READERS ─────────────────────────────────────────────────────
create or replace function public.hr_chat_name_authority()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The sender is who the session says they are (a service-role insert keeps its own from_id).
  if auth.uid() is not null then
    new.from_id := auth.uid();
  end if;
  -- Its name is the character's current name (character_names, else the profile, else 'Adventurer'),
  -- never the client's string.
  new.from_name := left(case when new.from_id is null then coalesce(nullif(btrim(new.from_name), ''), 'Adventurer')
                             else public.hr_character_name(new.from_id, coalesce(new.from_slot, 0)) end, 24);
  return new;
end $$;
revoke execute on function public.hr_chat_name_authority() from public, anon, authenticated, service_role;

create or replace function public.hr_chat_row(m public.chat_messages)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', m.id, 'channel', m.channel, 'from_id', m.from_id,
    'from_name', case when m.from_id is not null then left(public.hr_character_name(m.from_id, coalesce(m.from_slot, 0)), 24) else m.from_name end,
    'from_slot', m.from_slot, 'from_level', m.from_level, 'from_weapon', m.from_weapon, 'from_role', m.from_role,
    'body', m.body, 'created_at', m.created_at)
$$;
revoke execute on function public.hr_chat_row(public.chat_messages) from public, anon, authenticated, service_role;

create or replace function public.hr_social_name(p_user uuid)
returns text language sql stable set search_path = public, pg_catalog as $$
  select left(coalesce(
    (select n.name from public.character_names n where n.user_id = p_user order by n.updated_at desc, n.slot limit 1),
    nullif(btrim((select p.display_name from public.profiles p where p.id = p_user)), ''),
    'Adventurer'), 24)
$$;
revoke execute on function public.hr_social_name(uuid) from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-0000a4e50001';
  v jsonb; v_id uuid;
begin
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'names §4')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Accountname') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'names §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'names §4: hr_create_character refused: %', v; end if;
    insert into public.character_names (user_id, slot, name, canonical)
      values (v_a, 0, 'Fremulon', public.hr_canon_display_name('Fremulon'))
      on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical, updated_at = now();
    -- (a) a new line carries the character's name, not the account's or 'Adventurer'.
    v := public.hr_chat_send(0, 'global', 'hello');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'from_name' <> 'Fremulon' then
      raise exception 'names §4(a): a new line is named %', v->'line'->>'from_name'; end if;
    v_id := (v->'line'->>'id')::uuid;
    if (select from_name from public.chat_messages where id = v_id) <> 'Fremulon' then raise exception 'names §4(a): the stamp is not the character name'; end if;
    -- (b) a rename reaches the old line at the next read, and the social name.
    update public.character_names set name = 'Cheeseburger Eddie', canonical = public.hr_canon_display_name('Cheeseburger Eddie'), updated_at = now()
     where user_id = v_a and slot = 0;
    if (select public.hr_chat_row(m)->>'from_name' from public.chat_messages m where m.id = v_id) <> 'Cheeseburger Eddie' then
      raise exception 'names §4(b): history did not follow the rename'; end if;
    if public.hr_social_name(v_a) <> 'Cheeseburger Eddie' then raise exception 'names §4(b): hr_social_name is %', public.hr_social_name(v_a); end if;
    raise exception using errcode = 'HR861', message = 'names §4 complete - rolling back';
  exception when sqlstate 'HR861' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_a) then raise exception 'names §4: LEAKED a probe row'; end if;
  if has_function_privilege('authenticated', 'public.hr_social_name(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_chat_row(public.chat_messages)', 'execute') then
    raise exception 'names §4: a client role reaches a name reader'; end if;
  raise notice 'character-names-everywhere: chat stamps and history, walkers, whispers, friends and party seats read the character name; all green';
end $$;
