-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A TYPED NAME FINDS THE CHARACTER (P1, live 2026-10-24: Friends
-- → "Cheeseburger Eddie" → "No player by that name." for a character that
-- exists).
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it in the
-- reopen gate.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- hr_social_resolve (2026-10-25-social.sql §2) turns a typed name into an
-- account through public.display_names ONLY — the account-name claim table
-- the current client never writes (0 rows live). 2026-10-29-character-names-
-- everywhere.sql moved every name SHOWN to the character's name and left the
-- LOOKUP behind, so every typed name answered no_player in hr_friend_request,
-- hr_friend_answer, hr_friend_remove, hr_block_set, hr_whisper_send and
-- hr_inspect. The uuid branch (a profiles id) was never wrong.
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_social_resolve  the name branch reads hr_character_by_name (2026-10-25-
--                      account-items.sql, the helper party invites already
--                      use): character_names.canonical, whitespace collapsed,
--                      at least 3 canonical characters, else an account's
--                      profile name → its slot-0 character. The uuid branch,
--                      the 1–40 length bound, the signature, `language sql
--                      stable`, the search_path and the grants (none: internal,
--                      revoked from every role) are unchanged.
-- §0 pins the pre-image (md5 of prosrc; the replay chain and live hold the same
-- 8d08541a…) or this file's own image.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Lookup only; no value moves. The resolved id is the server's (a character
-- name another player claimed through hr_character_name_set, or an account's
-- profile name); the typed text is only a key. Every caller keeps its own
-- block / admitted / self / rate checks after the resolve. Names are unique
-- (character_names_canonical; hr_character_name_set refuses another account's
-- profile name), so a name means one account. Enumeration is no wider than
-- before: the same callers, the same per-caller rate limits.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the hr_social_resolve body from 2026-10-25-social.sql §2 (and its
-- revoke). ORDER: after 2027-01-14-items-catalogue.generated.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_character_by_name(text)') is null or to_regclass('public.character_names') is null
     or to_regprocedure('public.hr_social_resolve(text)') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-social.sql and 2026-10-25-account-items.sql first'; end if;
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_social_resolve(text)'::regprocedure;
  -- 8d08541a… is the 2026-10-25-social.sql §2 body (replay chain and live, measured 2026-10-24);
  -- 988e9be2… is this file's image (a re-apply).
  if v_md5 not in ('8d08541abd656006eeb97fc89442e721', '988e9be2f800745eeb526597b8c76884') then
    raise exception 'PIN: hr_social_resolve moved (md5 %)', v_md5; end if;
end $mig$;

-- ── §1 THE RESOLVER ──────────────────────────────────────────────────────────
create or replace function public.hr_social_resolve(p_target text)
returns uuid language sql stable set search_path = public, pg_catalog as $$
  select case
    when p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select p.id from public.profiles p where p.id = p_target::uuid)
    when length(coalesce(p_target, '')) between 1 and 40
      then (select c.user_id from public.hr_character_by_name(p_target) c)
  end
$$;
revoke execute on function public.hr_social_resolve(text) from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-0000c5e50001';   -- the named player
  v_b constant uuid := '000000c0-0000-0000-0000-0000c5e50002';   -- the one typing the name
  v jsonb; v_t text;
  v_n1 text; v_n2 text; v_n3 text;   -- probe names generated per run, checked absent: never a real character's name
begin
  loop
    v_n1 := 'Zq' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop') || ' Ed';
    exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n1))
          and not exists (select 1 from public.profiles where public.hr_canon_display_name(display_name) = public.hr_canon_display_name(v_n1));
  end loop;
  loop
    v_n2 := 'Zr' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n2))
          and not exists (select 1 from public.profiles where public.hr_canon_display_name(display_name) = public.hr_canon_display_name(v_n2));
  end loop;
  loop
    v_n3 := 'Zs' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n3))
          and not exists (select 1 from public.profiles where public.hr_canon_display_name(display_name) = public.hr_canon_display_name(v_n3));
  end loop;
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'social-resolve §4')
      on conflict (key) do update set enabled = true;
    foreach v_t in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_t::uuid) on conflict (id) do nothing;
      -- No account display name and no display_names row: the live shape of every player today.
      insert into public.profiles (id, display_name) values (v_t::uuid, null) on conflict (id) do update set display_name = null;
      insert into public.hr_access_allowlist (user_id, note) values (v_t::uuid, 'social-resolve §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_t, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-resolve §4: hr_create_character(0) refused: %', v; end if;
    end loop;
    -- A owns hero slot 1 (the row hr_buy_hero_slot writes), then creates it through the real gate.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict (user_id, slot, kind, key, period_key) do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-resolve §4: hr_create_character(1) refused: %', v; end if;
    insert into public.character_names (user_id, slot, name, canonical, updated_at) values
      (v_a, 0, v_n1, public.hr_canon_display_name(v_n1), now() - interval '1 minute'),
      (v_a, 1, v_n2, public.hr_canon_display_name(v_n2), now());
    if exists (select 1 from public.display_names where user_id = v_a) then
      raise exception 'social-resolve §4: the probe holds a display_names row; the case under test is its absence'; end if;

    -- (a) a character name resolves to its account: as typed, any case, padded or with doubled spaces.
    if public.hr_social_resolve(v_n1) is distinct from v_a
       or public.hr_social_resolve(upper(v_n1)) is distinct from v_a
       or public.hr_social_resolve(lower(v_n1)) is distinct from v_a
       or public.hr_social_resolve('  ' || replace(v_n1, ' ', '   ') || ' ') is distinct from v_a then
      raise exception 'social-resolve §4(a): % resolves to % (want %)', v_n1, public.hr_social_resolve(v_n1), v_a; end if;
    -- (b) the account's second character's name resolves to the same account.
    if public.hr_social_resolve(v_n2) is distinct from v_a or public.hr_social_resolve(upper(v_n2)) is distinct from v_a then
      raise exception 'social-resolve §4(b): the second character''s name resolves to %', public.hr_social_resolve(v_n2); end if;
    -- (c) nobody is nobody: an absent name, too short a name, an empty or null target.
    if public.hr_social_resolve(v_n3) is not null or public.hr_social_resolve('Zq') is not null
       or public.hr_social_resolve('') is not null or public.hr_social_resolve(null) is not null then
      raise exception 'social-resolve §4(c): an absent or malformed name resolved'; end if;
    if not exists (select 1 from public.character_names where canonical = 'nobody here')
       and not exists (select 1 from public.profiles where public.hr_canon_display_name(display_name) = 'nobody here')
       and public.hr_social_resolve('Nobody Here') is not null then
      raise exception 'social-resolve §4(c): ''Nobody Here'' resolved to %', public.hr_social_resolve('Nobody Here'); end if;
    -- (d) the uuid branch is unchanged: a profiles id, any case; an unknown id is nobody.
    if public.hr_social_resolve(v_a::text) is distinct from v_a or public.hr_social_resolve(upper(v_a::text)) is distinct from v_a
       or public.hr_social_resolve('000000c0-0000-0000-0000-0000c5e5ffff') is not null then
      raise exception 'social-resolve §4(d): the uuid branch moved'; end if;

    -- (e) end to end, as B: a friend request and an inspect by the typed name no longer answer no_player.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_friend_request('  ' || lower(v_n1) || ' ');
    if coalesce(v->>'ok', '') <> 'true' or v->>'state' <> 'requested' or (v->'person'->>'id')::uuid is distinct from v_a
       or v->'person'->>'name' <> v_n2 then
      raise exception 'social-resolve §4(e): a friend request by name is %', v; end if;
    if not exists (select 1 from public.friend_requests where from_id = v_b and to_id = v_a) then
      raise exception 'social-resolve §4(e): the friend request was not written'; end if;
    v := public.hr_inspect(upper(v_n2), 1);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'id')::uuid is distinct from v_a or (v->>'slot')::int <> 1 then
      raise exception 'social-resolve §4(e): an inspect by name is %', v; end if;
    if public.hr_friend_request(v_n3)->>'error' is distinct from 'no_player' then
      raise exception 'social-resolve §4(e): an absent name was not refused as no_player'; end if;
    raise exception using errcode = 'HR862', message = 'social-resolve §4 complete - rolling back';
  exception when sqlstate 'HR862' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (v_a, v_b)) then raise exception 'social-resolve §4: LEAKED a probe row'; end if;

  -- (f) the function's shape and grants are what they were: internal, invoker, sql stable, pinned search_path.
  if exists (select 1 from pg_proc p where p.oid = 'public.hr_social_resolve(text)'::regprocedure
              and (p.prosecdef or p.provolatile <> 's' or p.prorettype <> 'uuid'::regtype
                   or p.prolang <> (select l.oid from pg_language l where l.lanname = 'sql')
                   or not (p.proconfig @> array['search_path=public, pg_catalog']))) then
    raise exception 'social-resolve §4(f): hr_social_resolve changed shape'; end if;
  if has_function_privilege('anon', 'public.hr_social_resolve(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_social_resolve(text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_social_resolve(text)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = 'public.hr_social_resolve(text)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'social-resolve §4(f): a client role reaches hr_social_resolve'; end if;
  raise notice 'social-resolve-character-names: friends, whispers, blocks and inspect find a player by character name; all green';
end $$;
