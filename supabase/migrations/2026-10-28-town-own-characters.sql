-- ============================================================================
-- 2026-10-28-town-own-characters.sql — THE VIEWER'S OWN OTHER CHARACTERS ARE PEOPLE IN TOWN TOO.
--
-- Tyler 2026-10-19: his second character, playing at the same time from the same account,
-- was invisible in town. hr_town_walkers excluded every character of the caller's ACCOUNT
-- (`c.user_id <> v_uid`), not the character it is viewing. Every other filter stands (fresh,
-- not quiet, not hunting, not blocked, admitted, capped). The walker rows already carry
-- (id, slot); the client (src/session/town-presence.js) drops only its own character (its
-- user AND its slot) and keys each walker by user and slot.
--
-- Restated whole from 2026-10-27-core-bodies.sql (its last body), one line removed. No grant,
-- table or value path changes. Reversible: re-apply that body.
-- ============================================================================

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
             'name', public.hr_social_name(w.user_id),
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

-- §4 SELF-CHECK
do $chk$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_town_walkers(text)'::regprocedure), chr(13), '');
  if position('c.user_id <> v_uid' in v_def) > 0 then
    raise exception 'town-own-characters §4: hr_town_walkers still excludes the caller''s whole account'; end if;
  if position('hr_social_blocked(v_uid, c.user_id)' in v_def) = 0 or position('hr_admitted(c.user_id)' in v_def) = 0
     or position('presence_quiet' in v_def) = 0 or position('h.ended_at is null' in v_def) = 0 then
    raise exception 'town-own-characters §4: a walker filter other than the account exclusion went missing'; end if;
  if (select prosecdef from pg_proc where oid = 'public.hr_town_walkers(text)'::regprocedure) is not true then
    raise exception 'town-own-characters §4: hr_town_walkers is not SECURITY DEFINER'; end if;
  if has_function_privilege('anon', 'public.hr_town_walkers(text)', 'execute') then
    raise exception 'town-own-characters §4: anon can execute hr_town_walkers'; end if;
  raise notice 'town-own-characters OK: a viewer''s other characters are walkers; every other filter stands';
end $chk$;
