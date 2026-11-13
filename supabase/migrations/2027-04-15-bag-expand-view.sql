-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-15-bag-expand-view.sql — THE BAG'S NEXT RUNG, AT THE SERVER'S PRICE (the Storage window's "Expand (+20)")
--   (lane/a-bag-expand, systems-engineer, 2026-11-12; spec: docs/planning/PRIORITY_BOARD.md "2026-11-12 Bank rungs").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. READS ONLY: one new section function and its hr_state_sections row; no table, no
-- value, no seller change (hr_unlock_buy already sells bank.0..29). EDGE: none. ORDER: after
-- 2027-04-14-brook-bear-heavy-items-catalogue.generated.sql; restates nothing, so it is order-free against staged files.
-- On the EA Security list as a gold surface's READ (the sale itself is hr_unlock_buy's, already listed).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The Storage window offers the next bag rung with its price. The price is round(3000 * 1.32^owned) in
-- src/data/gold-ladders.js, but CLAUDE.md §6 says every number a player acts on is the server's: the client never
-- computes it. So the envelope carries the next sellable offer row, read from hr_unlock_offers, and the cap the
-- hr_apply fuse enforces (player_state.bank_cap).
--
-- `bag_expand` = { cap, rung, max, next: { offer, gold, adds } | null }   (null next at the top of the ladder)
-- ════════════════════════════════════════════════════════════════════════

-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_bag_expand_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v jsonb; v_cap int; v_rung int; v_max int;
begin
  select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if v_cap is null then return null; end if;
  select coalesce(max(pp.value), 0)::int into v_rung from public.player_progress pp
   where pp.user_id = p_user and pp.slot = p_slot and pp.kind = 'unlock' and pp.key = 'bank' and pp.period_key = '';
  select u.max_value into v_max from public.hr_unlocks u where u.unlock_id = 'bank';
  select jsonb_build_object('offer', o.offer_id, 'gold', o.gold,
           'adds', public.hr_bank_cap_for_rungs(v_rung + 1) - public.hr_bank_cap_for_rungs(v_rung))
    into v
    from public.hr_unlock_offers o
   where o.unlock_id = 'bank' and o.value = v_rung + 1 and o.refusal is null;
  return jsonb_build_object('cap', v_cap, 'rung', v_rung, 'max', coalesce(v_max, 0), 'next', v);
end $$;
revoke all on function public.hr_bag_expand_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_bag_expand_view(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('bag_expand', 'hr_bag_expand_view', '2027-04-15-bag-expand-view.sql: the bag''s stack cap, its rung and the next rung''s offer at the server''s price')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE SELF-CHECK: A NEW HERO, ONE RUNG BOUGHT, READ BACK ON BOTH CHANNELS ──────────
do $mig$
declare
  v_u uuid := '00000000-0000-4000-c000-ba9e0a9d0001';
  k text := '00000000-0000-4000-c000-ba9e0a9d';
  v jsonb; h jsonb; ver bigint; v_r0 public.hr_unlock_offers%rowtype; v_r1 public.hr_unlock_offers%rowtype;
begin
  select * into v_r0 from public.hr_unlock_offers where offer_id = 'bank.0';
  select * into v_r1 from public.hr_unlock_offers where offer_id = 'bank.1';
  if v_r0.offer_id is null or v_r1.offer_id is null then raise exception 'bag-expand §4: the catalogue has no bank rungs'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bag-expand §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'bag-expand §4: hr_create_character refused: %', v; end if;

    -- (a) A NEW HERO: cap 100, rung 0, bank.0 next at the catalogue's price, +20.
    h := public.hr_state_of(v_u, 0)->'bag_expand';
    if (h->>'cap')::int <> 100 or (h->>'rung')::int <> 0 or h->'next'->>'offer' <> 'bank.0'
       or (h->'next'->>'gold')::bigint <> v_r0.gold or (h->'next'->>'adds')::int <> 20 then
      raise exception 'bag-expand §4(a): a new hero reads %', h; end if;

    -- (b) ONE RUNG: the buyer's own envelope already reads cap 120 and bank.1 at its price.
    update public.account_wallet set gold = v_r0.gold where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0001')::uuid, 'bank.0');
    h := v->'bag_expand';
    if coalesce(v->>'ok', '') <> 'true' or (h->>'cap')::int <> 120 or (h->>'rung')::int <> 1
       or h->'next'->>'offer' <> 'bank.1' or (h->'next'->>'gold')::bigint <> v_r1.gold then
      raise exception 'bag-expand §4(b): the sale answered %', v; end if;

    -- (c) THE TOP: no next rung.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_u, 0, 'unlock', 'bank', '', (select max_value from public.hr_unlocks where unlock_id = 'bank'))
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
    h := public.hr_bag_expand_view(v_u, 0);
    if h->'next' <> 'null'::jsonb then raise exception 'bag-expand §4(c): a full ladder reads %', h; end if;

    -- (d) NO HERO: no section.
    if public.hr_bag_expand_view(v_u, 3) is not null then raise exception 'bag-expand §4(d): an empty slot reads a bag'; end if;

    raise exception using errcode = 'HR894', message = 'bag-expand §4 complete - rolling back';
  exception when sqlstate 'HR894' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_progress where user_id = v_u) then
    raise exception 'bag-expand §4: a probe row leaked'; end if;
  if has_function_privilege('anon', 'public.hr_bag_expand_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_bag_expand_view(uuid,integer)', 'execute') then
    raise exception 'bag-expand §4(e): a client role can read the section directly'; end if;
  raise notice 'bag-expand §4 OK: new hero, one rung, the top, an empty slot and the grants';
end $mig$;
