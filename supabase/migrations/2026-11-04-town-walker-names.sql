-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EACH BODY IN TOWN WEARS ITS OWN CHARACTER'S NAME (lane
-- a-hero-switching, systems-engineer, 2026-10-21). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Andy, live v0.2.22, two heroes of one account in town: both bodies carried ONE
-- name. hr_town_walkers named every walker hr_social_name(user): the account's
-- most recently named character (2026-10-29-character-names-everywhere.sql), the
-- same for every body the account has, since 2026-10-31-town-bodies-per-character.sql
-- gave each character its own body.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_town_walkers RESTATED WHOLE from 2026-10-28-town-own-characters.sql (its live
-- body, §0 pins it), byte-for-byte but two lines: the WALKER-NAMES marker and the
-- walker's `name`, now hr_character_name(user, slot) (2026-10-25-account-items.sql:
-- the character's own name, else the account's display name numbered after slot
-- 0), cut to 24 as before. No grant, signature, table, filter or value change.
--
-- ── EXPOSURE ─────────────────────────────────────────────────────────────────
-- A character name is already public: chat stamps it, party members and the
-- player menu show it. Nothing new leaves the server: still name, level, role,
-- outfit and tiles; no skills, gear, gold or premium.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_town_walkers from 2026-10-28-town-own-characters.sql.
-- ORDER: after 2026-11-06-hunt-analyzer-min-window.sql (last in the chain; no object in
-- common with it or the 2026-11-04/05/06 catalogue files). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITION AND THE PIN ──────────────────────────────────────────────
-- The live body, measured 2026-10-21 (tests/live-hash-drift.baseline.json: the
-- whitespace-normalised pg_get_functiondef md5), or this file's own (a re-apply).
do $mig$
declare v_def text; v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_town_walkers(text)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_town_walkers(text)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '4de8976e65a9afe69fa6edafc614690e' and strpos(v_src, 'WALKER-NAMES') = 0 then
    raise exception 'PIN: hr_town_walkers is neither the town-own-characters image (4de8976e...) nor this file''s (md5 %)', v_def; end if;
end $mig$;

-- ── §1 THE BODY ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_town_walkers(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- Fresh: the client re-publishes a standing body every 10 s, so three missed
  -- keepalives is gone (a closed tab leaves within this without a goodbye).
  c_fresh   constant interval := interval '30 seconds';
  c_cap     constant int := 40;
  c_scan    constant int := 80;    -- the index rows one read may visit (2 × cap)
  c_per_min constant int := 45;
  v_uid uuid := auth.uid();
begin
  -- WALKER-NAMES (2026-11-04-town-walker-names.sql): each walker is named as its CHARACTER (user and slot).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_walk', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', left(public.hr_character_name(w.user_id, w.slot), 24),
             'level', public.hr_level_of(w.user_id, w.slot),
             'role', public.hr_chat_role_pick(w.user_id, w.slot),
             -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set),
             -- null when none or no longer owned (a lapsed premium outfit), as hr_outfit_view reads it.
             'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                            then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
             'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
             'age_ms', greatest(0, floor(extract(epoch from (now() - w.at)) * 1000))::int
           ) order by w.at desc)
      from (select c.*
              from (select tp.* from public.town_positions tp
                     where tp.map_id = p_map and tp.at > now() - c_fresh
                     order by tp.at desc limit c_scan) c
              join public.player_state ps on ps.user_id = c.user_id and ps.slot = c.slot
             where not coalesce(ps.presence_quiet, false)
               and not exists (select 1 from public.hunt_sessions h
                                where h.user_id = c.user_id and h.slot = c.slot and h.ended_at is null)
               and not public.hr_social_blocked(v_uid, c.user_id)
               and public.hr_admitted(c.user_id)
             order by c.at desc limit c_cap) w
      left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot), '[]'::jsonb));
end $function$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-00000a1e5a01';   -- one account, two named heroes
  v_b constant uuid := '000000c0-0000-4000-a000-00000a1e5a02';   -- another player, looking at them
  v_n0 text; v_n1 text;   -- probe names generated per run, checked absent: never a real character's name
  v_w jsonb; v_keys text;
begin
  loop
    v_n0 := 'Zq' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n0));
  end loop;
  loop
    v_n1 := 'Zr' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
    exit when v_n1 <> v_n0 and not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n1));
  end loop;
  if (select prosecdef from pg_proc where oid = 'public.hr_town_walkers(text)'::regprocedure) is not true
     or has_function_privilege('anon', 'public.hr_town_walkers(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_walkers(text)', 'execute') then
    raise exception 'walker-names §4: hr_town_walkers''s definer or grants moved'; end if;
  begin
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'walker-names §4')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Names A'), (v_b, 'Names B')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'walker-names §4 probe'), (v_b, 'walker-names §4 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'walker-names §4: the probe heroes were not made'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'walker-names §4: the observer was not made'; end if;
    -- slot 0 named first, slot 1 last: hr_social_name(v_a) is v_n1, the name both bodies wore before
    insert into public.character_names (user_id, slot, name, canonical, updated_at)
      values (v_a, 0, v_n0, public.hr_canon_display_name(v_n0), now() - interval '1 minute'),
             (v_a, 1, v_n1, public.hr_canon_display_name(v_n1), now());
    if public.hr_social_name(v_a) <> v_n1 then raise exception 'walker-names §4: CONTROL: the account name is %, not the newest hero', public.hr_social_name(v_a); end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_town_move(0, 'town_common', 5, 8, 5, 8, 's')->>'stamped' is distinct from 'true'
       or public.hr_town_move(1, 'town_common', 9, 8, 9, 8, 'e')->>'stamped' is distinct from 'true' then
      raise exception 'walker-names §4: the probe bodies did not stand in town'; end if;
    -- (a) ANOTHER PLAYER sees two heroes with two names, each its own.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_w := public.hr_town_walkers('town_common')->'walkers';
    if not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 0, 'name', v_n0))
       or not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 1, 'name', v_n1)) then
      raise exception 'walker-names §4(a): the observer sees %', v_w; end if;
    -- (b) EACH OF THE ACCOUNT'S HEROES sees the other by its own name.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_w := public.hr_town_walkers('town_common')->'walkers';
    if not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 0, 'name', v_n0))
       or not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 1, 'name', v_n1)) then
      raise exception 'walker-names §4(b): the account sees %', v_w; end if;
    -- (c) NOTHING ELSE LEAVES: every walker carries exactly the walker keys, no skill, gear, gold or premium.
    select string_agg(k, ',' order by k) into v_keys
      from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(v_w) e) x;
    if v_keys is distinct from 'age_ms,dir,gx,gy,id,level,name,outfit,role,slot,x,y' then
      raise exception 'walker-names §4(c): a walker carries %', v_keys; end if;
    raise exception using errcode = 'HR874', message = 'walker-names §4 complete - rolling back';
  exception when sqlstate 'HR874' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_positions where user_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.character_names where user_id in (v_a, v_b)) then
    raise exception 'walker-names §4: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'walker-names: every body in town wears its own character''s name; the walker keys are unchanged; all green';
end $chk$;
