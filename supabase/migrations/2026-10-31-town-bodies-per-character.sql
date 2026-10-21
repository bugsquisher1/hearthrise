-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY PLAYING CHARACTER IS ITS OWN BODY IN TOWN (lane
-- a-town-other-chars-2, systems-engineer, 2026-10-20). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler, live v0.2.20: "I still can't see both players in town." Two characters
-- of one account playing at once; only one stood in The Common. 2026-10-28-
-- town-own-characters.sql made the READ list a viewer's other characters, but
-- the WRITE side still kept ONE row per ACCOUNT (2026-10-25-town-walk.sql:
-- town_positions primary key (user_id), hr_town_move `on conflict (user_id)`):
-- each character's publish or keepalive overwrote the other's row, the 250 ms
-- floor read the account's row (so the second character's publish was answered
-- `stamped:false`), and one character starting a hunt deleted every body the
-- account had. The client already publishes per character (p_slot) and keys
-- walkers by user AND slot (src/session/town-presence.js).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 town_positions' primary key becomes (user_id, slot). Same constraint
--      name; idempotent (re-keys only when the key is not already that).
--   §2 hr_town_move RESTATED WHOLE from 2026-10-25-town-walk.sql (§0 pins its
--      image), byte-for-byte but for four lines, each now scoped to the
--      character (user AND slot): the hunting delete, the floor read, and the
--      upsert's conflict target (whose update no longer rewrites slot).
-- Grants, signature, rate budget, bounds and every other rule are unchanged.
-- hr_town_walkers is untouched (2026-10-28-town-own-characters.sql).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None new. A body is display presence (no value, no rank). An account can now
-- hold one body per character it owns (player_state row required, ≤ its hero
-- slots), all inside the same 90/min town_move budget per account.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_town_move from 2026-10-25-town-walk.sql and re-key to (user_id)
-- after deleting all but the newest row per user (the table is unlogged,
-- ephemeral presence; every client re-publishes within 10 s).
-- ORDER: after 2026-10-31-live-horizon.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.town_positions') is null then
    raise exception 'PIN: public.town_positions is missing (2026-10-25-town-walk.sql first)'; end if;
  select prosrc into v_src from pg_proc
   where oid = 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure;
  -- the 2026-10-25-town-walk.sql image, or this file's own (a re-apply)
  if md5(v_src) not in ('b049c0091c716cf1d58ec43e57bec8be', 'fab60ef393f45af62ff46d177f989aba') then
    raise exception 'PIN: hr_town_move moved (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 ONE ROW PER CHARACTER ─────────────────────────────────────────────────
do $mig$
declare v_key text;
begin
  select string_agg(a.attname, ',' order by k.ord) into v_key
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.town_positions'::regclass and c.contype = 'p';
  if v_key is distinct from 'user_id,slot' then
    alter table public.town_positions drop constraint if exists town_positions_pkey;
    alter table public.town_positions add constraint town_positions_pkey primary key (user_id, slot);
  end if;
end $mig$;
comment on table public.town_positions is
  '2026-10-25-town-walk.sql: where each playing character''s body stands in town (one per character since '
  '2026-10-31-town-bodies-per-character.sql), server-stamped. '
  'Written only by hr_town_move, read only by hr_town_walkers. Unlogged: ephemeral display presence.';

-- ── §2 hr_town_move — PUBLISH YOUR OWN CHARACTER'S POSITION ─────────────────
create or replace function public.hr_town_move(p_slot int, p_map text, p_x int, p_y int, p_gx int, p_gy int, p_dir text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  -- The floor: a write inside this of the last is answered and not made. The
  -- client publishes at most once a second (src/data/town-presence.js).
  c_floor   constant interval := interval '250 milliseconds';
  c_per_min constant int := 90;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_last timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_move', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- LEAVING: this character's body goes (another character of the account keeps its own).
  if p_map is null then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    return jsonb_build_object('ok', true, 'left', true);
  end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if p_x is null or p_y is null or p_gx is null or p_gy is null
     or p_x < 0 or p_x >= v_map.w or p_y < 0 or p_y >= v_map.h
     or p_gx < 0 or p_gx >= v_map.w or p_gy < 0 or p_gy >= v_map.h
     or p_dir is null or p_dir not in ('n', 's', 'e', 'w') then
    return jsonb_build_object('ok', false, 'error', 'bad_position'); end if;
  -- A HUNTER IS NOT IN TOWN: an open hunt session refuses, and takes the body out.
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  select at into v_last from public.town_positions where user_id = v_uid and slot = v_slot;
  if v_last is not null and now() - v_last < c_floor then
    return jsonb_build_object('ok', true, 'stamped', false); end if;
  insert into public.town_positions as tp (user_id, slot, map_id, x, y, gx, gy, dir, at)
    values (v_uid, v_slot, p_map, p_x, p_y, p_gx, p_gy, p_dir, now())
  on conflict (user_id, slot) do update
    set map_id = excluded.map_id, x = excluded.x, y = excluded.y,
        gx = excluded.gx, gy = excluded.gy, dir = excluded.dir, at = excluded.at;
  return jsonb_build_object('ok', true, 'stamped', true);
end $$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00000c4a9b01';   -- one account, two characters
  v_b constant uuid := '000000c0-0000-0000-0000-00000c4a9b02';   -- another player
  v jsonb; v_w jsonb; v_key text;
begin
  select string_agg(a.attname, ',' order by k.ord) into v_key
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.town_positions'::regclass and c.contype = 'p';
  if v_key is distinct from 'user_id,slot' then
    raise exception 'town-bodies §4: town_positions is keyed by %, not (user_id, slot)', v_key; end if;
  if (select prosecdef from pg_proc where oid = 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure) is not true
     or has_function_privilege('anon', 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'execute') then
    raise exception 'town-bodies §4: hr_town_move''s definer or grants moved'; end if;
  begin
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'town-bodies §4')
      on conflict (key) do update set enabled = true;
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'town-bodies §4')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Bodies A'), (v_b, 'Bodies B')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'town-bodies §4 probe'), (v_b, 'town-bodies §4 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'town-bodies §4: the probe characters were not made'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'town-bodies §4: the observer was not made'; end if;

    -- (a) BOTH OF A's CHARACTERS STAND: slot 0 then slot 1 in the same instant, each stamped.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_town_move(0, 'town_common', 5, 8, 5, 8, 's');
    if v->>'stamped' is distinct from 'true' then raise exception 'town-bodies §4(a): slot 0''s publish is %', v; end if;
    v := public.hr_town_move(1, 'town_common', 9, 8, 9, 8, 'e');
    if v->>'stamped' is distinct from 'true' then raise exception 'town-bodies §4(a): slot 1''s publish is % (the floor is the account''s)', v; end if;
    if (select count(*) from public.town_positions where user_id = v_a) <> 2
       or (select x from public.town_positions where user_id = v_a and slot = 0) <> 5
       or (select x from public.town_positions where user_id = v_a and slot = 1) <> 9 then
      raise exception 'town-bodies §4(a): A''s bodies are %', (select jsonb_agg(to_jsonb(t)) from public.town_positions t where user_id = v_a); end if;
    -- (b) another player sees BOTH; each character sees the other, never itself.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_w := public.hr_town_walkers('town_common')->'walkers';
    if not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 0, 'x', 5))
       or not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 1, 'x', 9)) then
      raise exception 'town-bodies §4(b): B sees %', v_w; end if;
    -- (c) the floor is the character's: slot 0 again at once is not stamped, slot 1 untouched.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_town_move(0, 'town_common', 6, 8, 6, 8, 's');
    if v->>'stamped' is distinct from 'false' or (select x from public.town_positions where user_id = v_a and slot = 0) <> 5 then
      raise exception 'town-bodies §4(c): the floor let % through', v; end if;
    -- (c2) past the floor, slot 1 moving updates ITS row only; slot 0 stays where it stood.
    update public.town_positions set at = now() - interval '1 second' where user_id = v_a;
    v := public.hr_town_move(1, 'town_common', 11, 8, 11, 8, 'e');
    if v->>'stamped' is distinct from 'true' or (select count(*) from public.town_positions where user_id = v_a) <> 2
       or (select x from public.town_positions where user_id = v_a and slot = 0) <> 5
       or (select x from public.town_positions where user_id = v_a and slot = 1) <> 11 then
      raise exception 'town-bodies §4(c2): slot 1''s move answered % and left %', v,
        (select jsonb_agg(to_jsonb(t)) from public.town_positions t where user_id = v_a); end if;
    -- (d) one character hunting takes out ITS body only, and cannot publish; the other stands.
    insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at)
      values (v_a, 1, 'townbodiesprobe', now(), now(), now());
    v := public.hr_town_move(1, 'town_common', 9, 9, 9, 9, 's');
    if v->>'error' is distinct from 'hunting' or exists (select 1 from public.town_positions where user_id = v_a and slot = 1)
       or not exists (select 1 from public.town_positions where user_id = v_a and slot = 0) then
      raise exception 'town-bodies §4(d): hunting slot 1 answered % and left %', v,
        (select jsonb_agg(to_jsonb(t)) from public.town_positions t where user_id = v_a); end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_w := public.hr_town_walkers('town_common')->'walkers';
    if v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 1))
       or not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 0)) then
      raise exception 'town-bodies §4(d): with slot 1 hunting B sees %', v_w; end if;
    -- (e) the hunt ends: slot 1 stands again; (f) one character leaving leaves the other.
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = v_a and slot = 1 and ended_at is null;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_town_move(1, 'town_common', 10, 8, 10, 8, 'w');
    if v->>'stamped' is distinct from 'true' or (select count(*) from public.town_positions where user_id = v_a) <> 2 then
      raise exception 'town-bodies §4(e): back from the hunt, slot 1''s publish is %', v; end if;
    v := public.hr_town_move(0, null, null, null, null, null, null);
    if v->>'left' is distinct from 'true' or exists (select 1 from public.town_positions where user_id = v_a and slot = 0)
       or not exists (select 1 from public.town_positions where user_id = v_a and slot = 1) then
      raise exception 'town-bodies §4(f): slot 0 leaving answered % and left %', v,
        (select jsonb_agg(to_jsonb(t)) from public.town_positions t where user_id = v_a); end if;
    raise exception using errcode = 'HR873', message = 'town-bodies §4 complete - rolling back';
  exception when sqlstate 'HR873' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_positions where user_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b)) then
    raise exception 'town-bodies §4: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-bodies: one body per character (user, slot); floor, hunting and leaving are each the character''s; all green';
end $mig$;
