-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — ONE HOME PER ACCOUNT, AND THE HOUSE WINDOW'S READ (Tyler
-- 2026-10-15: "home, benches, depot, trophies are shared by all characters on
-- an account; one home per account").
-- STAGED (lane/b-house-window, systems-engineer, 2026-10-22). Game CLOSED:
-- applies on its passing §5; MONEY SURFACE (it changes what hr_unlock_buy
-- charges for and refuses), Security reviews it with the reopen gate.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The property tiers and the room rungs are still FILED per character
-- (player_progress, kind 'unlock', namespaces property / room), so before this
-- file a home bought on one hero was invisible to the others: the second hero
-- could buy the same Homestead again, could not buy the Farmstead after it
-- (prereq_property_tier against its own empty row), and its cooking had none of
-- the Kitchen's bonus. The rebuilt client's House window is account-wide, so
-- without this file it would offer purchases the server refuses (CLAUDE.md §6).
-- The rows stay where they are (no data moves): every READ of the home takes
-- the account's highest rung over its characters instead of one character's.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_unlock_levels RESTATED WHOLE (md5 pinned): the seam every engine reader
--    goes through (hr_perks_of, the farming and worker caps, hr_apply's gates).
--    room and property = max over the ACCOUNT's characters; plot unchanged (one
--    character's own). Signature, return shape and grants unchanged.
-- §2 hr_unlock_buy PATCHED AT THREE ANCHORS (each must occur exactly once; a
--    marker makes a re-apply a no-op), for the home namespaces only:
--      (a) after the character lock, the ACCOUNT HOME lock hr:home:<user>
--          (order: character -> home; nothing takes a character lock after it)
--      (b) v_cur, the rung already held = the account's highest
--      (c) the property-tier gate = hr_account_property_tier (the one definition
--          2026-11-28-storage-chests.sql made; the chests gate on it too)
--    The grant still lands on the PAYING hero's own row (GREATEST), so the
--    ledger, the per-day clamp and the debit are unchanged.
-- §3 hr_home_view(user, slot): the `home` envelope section (registry X7):
--      { tier, tiers: [{offer, name, tier, gold, items, need, owned}],
--        rooms: [{room, name, level, rungs, opens, rung_name,
--                 next: {offer, name, rung, gold, items, need, item} | null}] }
--    from hr_unlock_offers (sellable rows only) and the account's levels.
-- §4 nothing else: no table, no grant, no client RPC, no edge change (the House
--    window sends the existing `unlock_buy` engine intent and
--    hr_storage_chest_build).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   Nothing crosses an account. The account-wide read can only REFUSE more
--   (already_owned on a rung another hero bought) or open a rung the account's
--   home already earned; the price, the ladder and the debit are untouched.
--   Two heroes of one account buying one rung serialise on hr:home:<user>: one
--   pays, the other answers already_owned.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-create hr_unlock_levels from 2026-08-16-artisan-progress-model.sql §4;
-- re-apply 2026-08-19-companion-unlocks.sql §2 then the hr_unlock_buy arm of
-- 2026-09-28-settle-before-mutate.sql §2; delete the `home` section row and
-- drop hr_home_view. No row was written by this file.
-- ORDER: after 2026-11-28-storage-chests.sql (hr_account_property_tier). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_account_property_tier(uuid)') is null then
    raise exception 'PRECONDITION: apply 2026-11-28-storage-chests.sql first (hr_account_property_tier)'; end if;
  if to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_unlock_offers') is null then
    raise exception 'PRECONDITION: the section registry or the unlock offer catalogue is absent'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_unlock_levels(uuid,integer)');
  if v_md5 is distinct from '67bcb81ce43f336aca23e78e40d0eebb' and v_md5 is distinct from 'f5f677495032913f66bafe9720ab5107' then
    raise exception 'PIN: hr_unlock_levels is neither 2026-08-16-artisan-progress-model.sql''s image (67bcb81c...) nor this file''s (f5f67749...) - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)');
  if v_md5 is distinct from '5e00a6d9dc239ea03ad10d2369844190' and strpos((select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')), 'HOUSE-HOME') = 0 then
    raise exception 'PIN: hr_unlock_buy is neither the settle-before-mutate image (5e00a6d9...) nor this file''s patch - md5 %', v_md5; end if;
end $mig$;

-- ── §1 hr_unlock_levels — THE HOME IS THE ACCOUNT'S ──────────────────────────
create or replace function public.hr_unlock_levels(p_user uuid, p_slot int)
returns table(unlock_id text, level int)
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  /* 2026-11-29-house-home.sql: ONE HOME PER ACCOUNT (Tyler 2026-10-15). A room
     rung or a property tier is the account's highest over its characters (the
     rows stay filed on the hero who paid); a plot stays the character's own.
     Clamped rather than cast (bigint -> int): an overflow here would throw
     inside an accrual. src/core/perks.js clamps the level to the rungs that exist. */
  select pp.key,
         greatest(0, least(max(pp.value), 2147483647))::int
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id     = pp.key
     and u.progress_kind = pp.kind
   where pp.user_id    = p_user
     and (pp.slot = p_slot or u.namespace in ('room', 'property'))
     and pp.period_key = ''
     and pp.value      > 0
     /* The perk channel's three namespaces; `recipe` rides its own key in hr_perks_of. */
     and u.namespace in ('room', 'plot', 'property')
   group by pp.key
$body$;

revoke execute on function public.hr_unlock_levels(uuid, int) from public;
revoke execute on function public.hr_unlock_levels(uuid, int)
  from anon, authenticated, service_role, hr_engine;

-- ── §2 hr_unlock_buy — THE HOME NAMESPACES BUY AGAINST THE ACCOUNT'S HOME ────
do $mig$
declare
  v_def text; v_n int;
  c_lock constant text := $anc$  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
$anc$;
  c_cur constant text := $anc$    select value into v_cur from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = v_cat.progress_kind and key = v_off.unlock_id and period_key = '';
$anc$;
  c_tier constant text := $anc$      select coalesce(max(pp.value), 0) into v_tier
        from public.player_progress pp
        join public.hr_unlocks u
          on u.unlock_id = pp.key and u.progress_kind = pp.kind
       where pp.user_id = v_uid and pp.slot = v_slot and pp.period_key = ''
         and u.namespace = 'property';
$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_unlock_buy(uuid,int,bigint,uuid,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'HOUSE-HOME') > 0 then raise notice 'hr_unlock_buy already buys against the account home - patch skipped'; return; end if;
  foreach v_n in array array[1, 2, 3] loop
    declare a text := case v_n when 1 then c_lock when 2 then c_cur else c_tier end; n int;
    begin
      n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
      if n <> 1 then raise exception 'hr_unlock_buy: anchor % appears % time(s), expected 1', v_n, n; end if;
    end;
  end loop;
  v_def := replace(v_def, c_lock, c_lock || $new$
  -- HOUSE-HOME (2026-11-29-house-home.sql): the home (property tiers and rooms) is
  -- the ACCOUNT's, one per account (Tyler 2026-10-15). A home purchase also takes
  -- the account home lock AFTER the character lock (order: character -> home), so
  -- two heroes of one account buying one rung serialise: one pays, one is told
  -- already_owned.
  if v_cat.namespace in ('room', 'property') then
    perform pg_advisory_xact_lock(hashtextextended('hr:home:' || v_uid::text, 0));
  end if;
$new$);
  v_def := replace(v_def, c_cur, $new$    -- HOUSE-HOME: a home rung already held is the account's highest (any hero's row).
    select max(value) into v_cur from public.player_progress
     where user_id = v_uid and (slot = v_slot or v_cat.namespace in ('room', 'property'))
       and kind = v_cat.progress_kind and key = v_off.unlock_id and period_key = '';
$new$);
  v_def := replace(v_def, c_tier, $new$      -- HOUSE-HOME: the property tier is the ACCOUNT's home (the chests' gate too).
      v_tier := public.hr_account_property_tier(v_uid);
$new$);
  execute v_def;
end $mig$;

-- ── §3 THE `home` SECTION — WHAT THE HOUSE WINDOW RENDERS ────────────────────
create or replace function public.hr_home_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
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
     where o.namespace = 'room' group by o.unlock_id)
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
        from r), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_home_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('home', 'hr_home_view', '2026-11-29-house-home.sql: the ACCOUNT''s home (one per account): its property tier, the property ladder and every room''s rung with the next one, priced by hr_unlock_offers')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000de9a0e01';
  k   constant text := '000000c0-0000-4000-b000-0000de9a';
  v jsonb; h jsonb; v_role text; v_src text; v_gold bigint;
  v_p1 public.hr_unlock_offers%rowtype; v_r1 public.hr_unlock_offers%rowtype; v_r2 public.hr_unlock_offers%rowtype;
  ver bigint;
begin
  select * into v_p1 from public.hr_unlock_offers where unlock_id like 'property:%' and refusal is null order by value limit 1;
  select * into v_r1 from public.hr_unlock_offers where unlock_id like 'room:%' and refusal is null and value = 1
    and req_property_tier <= v_p1.value and req_item is null order by offer_id limit 1;
  select * into v_r2 from public.hr_unlock_offers where unlock_id = v_r1.unlock_id and value = 2;
  if v_p1.offer_id is null or v_r1.offer_id is null or v_r2.offer_id is null or v_r2.req_property_tier > v_p1.value then
    raise exception 'VERIFY(0): the catalogue has no first property / room rung pair to probe with'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'house-home §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
    -- (a) A NEW ACCOUNT: tier 0, the first property next, every sellable room listed at level 0.
    h := public.hr_state_of(v_u, 0)->'home';
    if (h->>'tier')::int <> 0 or jsonb_array_length(h->'tiers') < 1 or (h->'tiers'->0->>'owned')::boolean
       or h->'tiers'->0->>'offer' is distinct from v_p1.offer_id or (h->'tiers'->0->>'gold')::bigint <> v_p1.gold
       or jsonb_array_length(h->'rooms') <> (select count(distinct unlock_id) from public.hr_unlock_offers where unlock_id like 'room:%' and refusal is null)
       or exists (select 1 from jsonb_array_elements(h->'rooms') e where (e->>'level')::int <> 0 or e->'next'->>'rung' is distinct from '1') then
      raise exception 'VERIFY(a): a new account''s home reads %', h; end if;
    -- (b) SLOT 1 BUYS THE FIRST PROPERTY; SLOT 0 READS IT (one home).
    update public.player_state set gold = v_p1.gold + 5 where user_id = v_u and slot = 1;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_u, 1, t.k, t.v::bigint from jsonb_each_text(v_p1.items) as t(k, v)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    select version into ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_unlock_buy(v_u, 1, ver, (k || '0001')::uuid, v_p1.offer_id);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.player_state where user_id = v_u and slot = 1) <> 5 then
      raise exception 'VERIFY(b): slot 1 buying % answered %', v_p1.offer_id, v; end if;
    h := public.hr_state_of(v_u, 0)->'home';
    if (h->>'tier')::int <> v_p1.value or not (h->'tiers'->0->>'owned')::boolean then
      raise exception 'VERIFY(b): slot 0 reads the home as %', h; end if;
    -- (c) SLOT 0 BUYING THE SAME PROPERTY IS already_owned AND CHARGES NOTHING.
    update public.player_state set gold = 10000000 where user_id = v_u and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_u, 0, t.k, 100000 from jsonb_each_text(v_p1.items || v_r1.items || v_r2.items) as t(k, v)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0002')::uuid, v_p1.offer_id);
    if v->>'error' is distinct from 'already_owned' or (select gold from public.player_state where user_id = v_u and slot = 0) <> 10000000 then
      raise exception 'VERIFY(c): slot 0 re-buying the home answered %', v; end if;
    -- (d) SLOT 0 BUILDS THE ROOM ON THE ACCOUNT'S TIER (its own row holds no property).
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0003')::uuid, v_r1.offer_id);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.player_state where user_id = v_u and slot = 0) <> 10000000 - v_r1.gold then
      raise exception 'VERIFY(d): slot 0 building % on the account''s home answered %', v_r1.offer_id, v; end if;
    -- (e) THE ROOM IS EVERY HERO'S: the engine seam, the perk channel and the section on slot 1.
    if (select level from public.hr_unlock_levels(v_u, 1) where unlock_id = v_r1.unlock_id) is distinct from 1
       or (public.hr_perks_of(v_u, 1)->'rooms'->>substring(v_r1.unlock_id from 6))::int is distinct from 1 then
      raise exception 'VERIFY(e): slot 1 does not hold the room slot 0 built: %', public.hr_perks_of(v_u, 1); end if;
    h := public.hr_state_of(v_u, 1)->'home';
    if not exists (select 1 from jsonb_array_elements(h->'rooms') e
                    where e->>'room' = substring(v_r1.unlock_id from 6) and (e->>'level')::int = 1 and e->'next'->>'offer' = v_r2.offer_id) then
      raise exception 'VERIFY(e): slot 1''s home section reads %', h->'rooms'; end if;
    -- (f) SLOT 1 GOES ON TO RUNG 2 (no rung_skipped) AND RUNG 1 AGAIN IS already_owned.
    update public.player_state set gold = 10000000 where user_id = v_u and slot = 1;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_u, 1, t.k, 100000 from jsonb_each_text(v_r1.items || v_r2.items) as t(k, v)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    select version into ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_unlock_buy(v_u, 1, ver, (k || '0004')::uuid, v_r1.offer_id);
    if v->>'error' is distinct from 'already_owned' then raise exception 'VERIFY(f): slot 1 re-buying rung 1 answered %', v; end if;
    select version into ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_unlock_buy(v_u, 1, ver, (k || '0005')::uuid, v_r2.offer_id);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): slot 1 building rung 2 answered %', v; end if;
    if (select level from public.hr_unlock_levels(v_u, 0) where unlock_id = v_r1.unlock_id) is distinct from 2 then
      raise exception 'VERIFY(f): slot 0 does not see rung 2'; end if;
    raise exception using errcode = 'HR894', message = 'house-home §5 complete - rolling back';
  exception when sqlstate 'HR894' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_progress where user_id = v_u) then
    raise exception 'VERIFY(g): §5 LEAKED a probe row'; end if;
  -- (g) THE LOCK ORDER: the character key, then the home key, before the rung is read.
  v_src := regexp_replace((select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')), '--[^\n]*', '', 'g');
  if not (strpos(v_src, 'hashtextextended(v_uid::text || '':'' || v_slot::text, 0)') > 0
          and strpos(v_src, 'hashtextextended(v_uid::text || '':'' || v_slot::text, 0)') < strpos(v_src, '''hr:home:''')
          and strpos(v_src, '''hr:home:''') < strpos(v_src, 'select max(value) into v_cur')) then
    raise exception 'VERIFY(g): hr_unlock_buy lock order is not character -> home -> rung read'; end if;
  -- (h) THE GRANTS: the section is server-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_home_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_unlock_levels(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % reaches a home reader', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'house-home: one home per account - the levels, the purchase gates and the home section read the account''s highest rung; all green';
end $$;
