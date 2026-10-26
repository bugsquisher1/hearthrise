-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-23-havora-town-size.sql — THE TOWN GROWS: town_common IS HAVORA,
--   192 x 116 TILES (Town Blueprint v0.5 x2 + the Westwood).
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/b-town-map (L1 of the real-town plan,
-- docs/planning/PRIORITY_BOARD.md "Real town plan (2026-10-25)"; Tyler approved
-- the layout 2026-10-25). The game is CLOSED: applies on its passing §2
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). ORDER: after 2026-10-25-town-walk.sql (the catalogue);
-- BEFORE the client that ships the new map (src/data/world/maps/town_common.js):
-- until it lands hr_town_move answers bad_position for every tile past 24 x 14,
-- so a hero arriving at the gatehouse (x ~100) would publish nothing.
-- No edge. No value moves. No RPC restated.
--
-- WHAT CHANGES: the ONE catalogue row of the town map (hr_town_maps), whose w/h
-- bound every hr_town_move tile. tests/town-walk.mjs TW-7 holds the row and the
-- client map row to the same size. town_positions keeps its 0..255 checks.
--
-- WHAT A FORGED CLIENT CAN DO: put its own body on any tile of a 192 x 116 map
-- instead of a 24 x 14 one (display presence; the server holds no mask, the
-- client draws a walker on the nearest open tile, src/world/town-scene.js).
--
-- REVERSIBILITY: set the row back to 24 x 14 (positions past it go stale in 30 s).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_town_maps') is null or to_regprocedure('public.hr_town_move(integer,text,integer,integer,integer,integer,text)') is null then
    raise exception 'havora-town-size §0: apply 2026-10-25-town-walk.sql first (hr_town_maps, hr_town_move)';
  end if;
  if not exists (select 1 from public.hr_town_maps where map_id = 'town_common') then
    raise exception 'havora-town-size §0: the town_common catalogue row is absent';
  end if;
end $mig$;

-- ── §1 THE CATALOGUE ROW ─────────────────────────────────────────────────────
insert into public.hr_town_maps (map_id, zone_id, w, h) values ('town_common', 'the_common', 192, 116)
  on conflict (map_id) do update set zone_id = excluded.zone_id, w = excluded.w, h = excluded.h;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $chk$
declare
  v public.hr_town_maps%rowtype;
begin
  select * into v from public.hr_town_maps where map_id = 'town_common';
  if v.w is distinct from 192 or v.h is distinct from 116 then
    raise exception 'havora-town-size §2: town_common is % x %, not 192 x 116', v.w, v.h;
  end if;
  -- hr_town_move bounds a tile by the catalogue row (never a constant), so the new size is the bound
  if position('p_x >= v_map.w' in pg_get_functiondef('public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure)) = 0 then
    raise exception 'havora-town-size §2: hr_town_move no longer bounds a tile by hr_town_maps';
  end if;
  -- the position columns hold every tile of the map
  if exists (select 1 from information_schema.check_constraints c
             where c.constraint_schema = 'public' and c.constraint_name like 'town_positions_%'
               and c.check_clause ~ 'x <= 1[0-9]{2}\b|x < 1[0-9]{2}\b') then
    raise exception 'havora-town-size §2: a town_positions check is narrower than the map';
  end if;
end $chk$;
