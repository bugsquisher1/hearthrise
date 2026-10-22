-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE BESTIARY COUNTS WHAT A PLAYER CAN MEET (lane c-monster-ladders,
-- game-designer, 2026-10-22; cut down by lane c-cuts-1022, systems-engineer, the
-- same day). STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2).
--
-- THE BUG: the Bestiary's total was written against a 129-monster catalogue, but only
-- the monsters on the OPEN hunt grounds can be met (19 today), so the sheet read
-- "x / 134". The reachable roster hr_hunt_roster is GENERATED from the open grounds
-- by tools/gen-hunt-sessions.mjs (2026-11-23-hunt-sessions-catalogue.generated.sql,
-- applied FIRST); the sheet now counts slain over that roster, so a monster nobody
-- can meet never counts and a new open ground raises the total by itself.
--
-- THIS FILE WAS 2026-11-24-monster-ladders.sql. Its other half re-laddered the
-- collection milestones (hr_claim_milestone__ungated) over the rosters; Tyler cut the
-- milestones with every old-client reward table (2026-10-22, "we were supposed to
-- delete all that"), so that half and the loot roster are gone and
-- 2026-12-02-old-rewards-cut.sql drops the claim. Only the Bestiary half remains.
--
--   §0  pins the sheet's pre-image by md5 (core-bodies' hr_character_sheet_view)
--   §1  hr_character_sheet_view: bestiary { slain, total } over hr_hunt_roster
--   §4  SELF-CHECK by execution, rolled back: the total is the roster; kills of
--       monsters off the roster do not count; grants unchanged; zero leak.
-- REVERSIBILITY: restate the 2026-10-27-core-bodies.sql hr_character_sheet_view body.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ──────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_hunt_roster') is null then
    raise exception 'PRECONDITION: hr_hunt_roster missing — apply 2026-11-23-hunt-sessions-catalogue.generated.sql first'; end if;
  if (select count(*) from public.hr_hunt_roster) < 1 then
    raise exception 'PRECONDITION: the reachable roster is empty'; end if;
  if to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_bestiary_of missing'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.hr_character_sheet_view(uuid,integer)'))
     not in ('9c8f40b7bfc143883aa2535fe46729e3', 'a343047a25c8027326b19ad4ae021b68') then
    raise exception 'bestiary-roster §0: hr_character_sheet_view is not the core-bodies post-image (or this file''s) — another lane moved it'; end if;
end $$;

-- ── 1. THE SHEET: the Bestiary counts the reachable roster ────────────────
CREATE OR REPLACE FUNCTION public.hr_character_sheet_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_cs public.hr_character_sheets%rowtype; v_fresh boolean := false; v_engine text;
begin
  select * into v_cs from public.hr_character_sheets where user_id = p_user and slot = p_slot;
  if found then
    select e.version into v_engine from public.hr_character_sheet_engine e where e.id;
    v_fresh := v_cs.engine_version = v_engine
      and v_cs.inputs_md5 = public.hr_character_sheet_stamp(public.hr_character_sheet_inputs(p_user, p_slot), v_engine);
  end if;
  return jsonb_build_object(
    'level', public.hr_level_of(p_user, p_slot),
    'max_hp', (public.hr_vitals_of(p_user, p_slot)->>'max_hp')::int,
    'bestiary', jsonb_build_object(
      'slain', (select count(*) from public.hr_bestiary_of(p_user, p_slot) b
                 where exists (select 1 from public.hr_hunt_roster r where r.monster_id = b.monster_id)),
      'total', (select count(*) from public.hr_hunt_roster)),
    'fresh', v_fresh,
    'combat', case when v_fresh then v_cs.sheet end,
    'computed_at', case when v_fresh then v_cs.computed_at end);
end $function$;

-- ── 4. SELF-CHECK — proven by EXECUTION, rolled back ───────────────────────
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '00000000-0000-4000-8000-0000c1add321';
  v_slot  constant int  := 0;
  v_r     bigint;
  v_mons  text[];
begin
  select count(*), array_agg(monster_id order by monster_id) into v_r, v_mons from public.hr_hunt_roster;

  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, version)
      values (v_uid, v_slot, 0, 1)
      on conflict (user_id, slot) do update set gold = 0;

    -- (a) 200 kills of monsters OFF the roster count for nothing; the total is the roster.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:offroster_' || g::text, 1, '', 'active' from generate_series(1, 200) g;
    v := public.hr_character_sheet_view(v_uid, v_slot);
    if (v->'bestiary'->>'total')::bigint <> v_r or (v->'bestiary'->>'slain')::bigint <> 0 then
      raise exception 'SELF-CHECK(a): the sheet''s bestiary is not 0 / % with only off-roster kills: %', v_r, v->'bestiary';
    end if;

    -- (b) every roster monster slain: slain = total = the roster.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:' || m, 1, '', 'active' from unnest(v_mons) m;
    v := public.hr_character_sheet_view(v_uid, v_slot);
    if (v->'bestiary'->>'total')::bigint <> v_r or (v->'bestiary'->>'slain')::bigint <> v_r then
      raise exception 'SELF-CHECK(b): the sheet''s bestiary is not % / %: %', v_r, v_r, v->'bestiary';
    end if;

    raise exception using errcode = 'HR892', message = 'bestiary-roster §4 complete — rolling back';
  exception when sqlstate 'HR892' then null;
  end;

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'SELF-CHECK: §4 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
         or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
        raise exception 'SELF-CHECK: grant hygiene is red: %', v_gh;
      end if;
    end;
  else
    raise exception 'SELF-CHECK: hr_assert_grant_hygiene(boolean) is absent';
  end if;

  raise notice 'bestiary-roster: % monsters reachable; off-roster kills ignored; the sheet reads % / %; zero leak', v_r, v_r, v_r;
end $$;
