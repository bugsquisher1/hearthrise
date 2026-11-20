-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1007-home-view-held-rooms.sql — A ROOM HELD WHOLE STAYS IN ITS OWNER'S HOUSE, WITH NOTHING ON SALE
--   (lane/a-trophy-room-held, systems-engineer, 2026-11-20; the balance program's home dive, 26-home.md §4: the Trophy Room sold
--   "a trophy wall" from 2,000 to 600,000 gold a rung and hangs nothing).
--
-- STATUS: supabase/migration-notes/1007-home-view-held-rooms.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base, and BEFORE
--   1008-trophy-room-held.generated.sql, which refuses every Trophy Room rung (`held:its_room_is_not_built_yet`). Either order is
--   safe; this one first means an owner never reads a House without the room between the two applies.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE HOLE ────────────────────────────────────────────────────────────────
-- hr_home_view lists only SELLABLE offers (refusal is null). Once the Trophy Room's rungs are refused, an account that already
--   bought rungs (two did, to rung 4) would see the room vanish from its House: progress it paid for, gone from the one screen
--   that shows it. A held room is the content's state, not the account's.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_home_view(user, slot) -> jsonb   RESTATED WHOLE (its plan-cache shape, 2027-02-10-settle-plan-cache.generated.sql: plpgsql,
--   the SQL body verbatim inside). Unchanged for every sellable room and every property tier. ADDED after them: each room HELD
--   WHOLE (every one of its rows in hr_unlock_offers refused `held:...`, none sellable) that the account owns a rung of:
--     { room, name, level, rungs, opens, rung_name, next: null, held: true }
--   `opens` is the account's own tier (an owned room is open), `rungs` the room's authored rungs. A held room nobody in the
--   account owns is not listed. The client (src/session/home-sections.js) reads `held` as "nothing to build" and offers nothing.
-- Signature, volatility, SECURITY DEFINER, the SET clause and the grants (owner-only, 2026-11-29-house-home.sql) unchanged.
-- REFUSAL CODES: none. No write path moves.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- A STABLE read. A second apply finds the body at its post pin (§0) and restates the same text: byte-identical
--   (tests/schema-drift.mjs). The §4 probe is rolled back whole by a sentinel exception.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- None: a read of the caller's own account, owner-only as before; the extra rows are the account's own progress and the
--   catalogue's names.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restate hr_home_view from 2027-02-10-settle-plan-cache.generated.sql (§0's pre pin). No row was written by this file.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- The body is the image this file was written against (the replayed chain on set/v0.2.143) or this file's own (a second
-- apply): md5 of prosrc with carriage returns removed.
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_unlock_offers') is null or to_regclass('public.hr_unlocks') is null
     or to_regprocedure('public.hr_unlock_levels(uuid,integer)') is null
     or to_regprocedure('public.hr_account_property_tier(uuid)') is null then
    raise exception 'PRECONDITION: a table or helper hr_home_view reads is missing'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_home_view(uuid,integer)');
  if v_md5 is null then raise exception 'PIN: hr_home_view is missing'; end if;
  if v_md5 is distinct from '02a0ebb7b7b4f3dd4de45cc84276aac1' and v_md5 is distinct from 'a72e612960f706c0426467c149340007' then
    raise exception 'PIN: hr_home_view is neither the image this file was written against (02a0ebb7b7b4f3dd4de45cc84276aac1) nor its own (a72e612960f706c0426467c149340007): md5 % - another file moved it; re-pin', v_md5;
  end if;
end $mig$;

-- ── §1 hr_home_view — RESTATED WHOLE: A HELD ROOM'S OWNED RUNGS STAY, NOTHING ON SALE ──
create or replace function public.hr_home_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
-- HELD-ROOMS (1007-home-view-held-rooms.sql): a room held whole keeps the rungs the account owns in view, nothing on sale.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  /* 2026-11-29-house-home.sql: the account's home as the server prices it. Only
     SELLABLE offers (refusal is null) appear, so the window can never show a
     price the server would not charge. Names are the catalogue's
     ('Kitchen — Hearthstone': the room before the dash, the rung after it). */
  with lv as (
    select l.unlock_id, l.level from public.hr_unlock_levels(p_user, p_slot) l),
  t as (select public.hr_account_property_tier(p_user) as tier),
  o as (
    select x.*, u.namespace from public.hr_unlock_offers x
      join public.hr_unlocks u on u.unlock_id = x.unlock_id
     where x.refusal is null and u.namespace in ('room', 'property')),
  r as (
    select o.unlock_id, coalesce(max(lv.level), 0)::int as level, count(*)::int as rungs
      from o left join lv on lv.unlock_id = o.unlock_id
     where o.namespace = 'room' group by o.unlock_id),
  /* 1007-home-view-held-rooms.sql: a room HELD WHOLE (every rung refused held:, none sellable) the account owns a rung of. */
  h as (
    select x.unlock_id, x.value, x.name from public.hr_unlock_offers x
      join public.hr_unlocks u on u.unlock_id = x.unlock_id
     where u.namespace = 'room' and x.refusal like 'held:%'
       and not exists (select 1 from o where o.unlock_id = x.unlock_id)),
  rh as (
    select h.unlock_id, max(lv.level)::int as level, count(*)::int as rungs
      from h join lv on lv.unlock_id = h.unlock_id
     where lv.level > 0 group by h.unlock_id)
  select jsonb_build_object(
    'tier', (select tier from t),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'name', o.name, 'tier', o.value,
        'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'owned', o.value <= (select tier from t))
        order by o.value) from o where o.namespace = 'property'), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object(
        'room', substring(r.unlock_id from 6),
        'name', (select split_part(o.name, ' — ', 1) from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'level', r.level, 'rungs', r.rungs,
        'opens', (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1),
        'rung_name', (select split_part(o.name, ' — ', 2) from o where o.unlock_id = r.unlock_id and o.value = r.level),
        'next', (select jsonb_build_object('offer', o.offer_id, 'name', split_part(o.name, ' — ', 2), 'rung', o.value,
                   'gold', o.gold, 'items', o.items, 'need', o.req_property_tier, 'item', o.req_item)
                   from o where o.unlock_id = r.unlock_id and o.value > r.level order by o.value limit 1))
        order by (select o.req_property_tier from o where o.unlock_id = r.unlock_id order by o.value limit 1), r.unlock_id)
        from r), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object(
        'room', substring(rh.unlock_id from 6),
        'name', (select split_part(h.name, ' — ', 1) from h where h.unlock_id = rh.unlock_id order by h.value limit 1),
        'level', rh.level, 'rungs', rh.rungs,
        'opens', (select tier from t),
        'rung_name', (select split_part(h.name, ' — ', 2) from h where h.unlock_id = rh.unlock_id and h.value = rh.level),
        'next', null, 'held', true)
        order by rh.unlock_id) from rh), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

-- ── §4 SELF-CHECK ────────────────────────────────────────────────────────────
-- A probe account (rolled back whole by a sentinel exception) with a home and a sellable room, and the Trophy Room held
-- inside the probe's own subtransaction whether or not 1008 has landed: (a) a held room nobody owns is not listed;
-- (b) owning rung 3 of it lists it, level 3, its rungs, held, nothing next, its rung named; (c) a sellable room is
-- unchanged: listed, not held, its next rung priced; (d) owner-only, and the body at its post pin.
do $chk$
declare
  c_u    uuid := gen_random_uuid();
  v      jsonb;
  v_home jsonb;
  v_room jsonb;
  v_kind text;
  v_n    int;
begin
  begin
    insert into auth.users (id) values (c_u);
    insert into public.hr_access_allowlist (user_id, note) values (c_u, '1007 home-view probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception '1007 §4: hr_create_character refused: %', v; end if;
    update public.hr_unlock_offers
       set refusal = 'held:its_room_is_not_built_yet', gold = null, items = null, req_property_tier = null, req_item = null
     where unlock_id = 'room:trophy' and refusal is null;
    select count(*)::int into v_n from public.hr_unlock_offers where unlock_id = 'room:trophy';
    if v_n < 1 then raise exception '1007 §4: the catalogue has no Trophy Room rows to hold'; end if;
    -- (a) held, unowned: not listed
    v_home := public.hr_home_view(c_u, 0);
    if exists (select 1 from jsonb_array_elements(v_home->'rooms') e where e->>'room' = 'trophy') then
      raise exception '1007 §4(a): a held room nobody owns is listed: %', v_home->'rooms'; end if;
    -- (b) held, owned to rung 3: listed, held, nothing next
    select progress_kind into v_kind from public.hr_unlocks where unlock_id = 'room:trophy';
    insert into public.player_progress (user_id, slot, kind, key, value, period_key) values (c_u, 0, v_kind, 'room:trophy', 3, '');
    v_home := public.hr_home_view(c_u, 0);
    select e into v_room from jsonb_array_elements(v_home->'rooms') e where e->>'room' = 'trophy';
    if v_room is null or (v_room->>'level')::int <> 3 or (v_room->>'rungs')::int <> v_n or v_room->'held' <> 'true'::jsonb
       or jsonb_typeof(v_room->'next') <> 'null' or coalesce(v_room->>'rung_name', '') = '' or coalesce(v_room->>'name', '') <> 'Trophy Room'
       or (v_room->>'opens')::int <> (v_home->>'tier')::int then
      raise exception '1007 §4(b): an owned held room reads %', v_room; end if;
    -- (c) a sellable room is unchanged
    select e into v_room from jsonb_array_elements(v_home->'rooms') e where e->>'room' = 'kitchen';
    if v_room is null or v_room ? 'held' or jsonb_typeof(v_room->'next') <> 'object' or (v_room->'next'->>'gold')::bigint is null then
      raise exception '1007 §4(c): the Kitchen reads %', v_room; end if;
    raise exception using errcode = 'HRV07', message = '1007 §4: probe rolled back';
  exception when sqlstate 'HRV07' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception '1007 §4: LEAKED a probe row'; end if;
  -- (d) owner-only, and at the post pin
  if has_function_privilege('anon', 'public.hr_home_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_home_view(uuid,integer)', 'execute') then
    raise exception '1007 §4(d): a client role may call hr_home_view'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_home_view(uuid,integer)'::regprocedure) is distinct from 'a72e612960f706c0426467c149340007' then
    raise exception '1007 §4(d): hr_home_view is not at its post pin'; end if;
end $chk$;
