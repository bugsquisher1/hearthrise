-- ═════════════════════════════════════════════════════════════
-- 2027-02-28-temper-craft.sql — A RUNG TAKES CRAFTED MATERIAL AS WELL AS GOLD (Tyler 2026-11-05: "Let's also require some
--   sort of crafting in order to temper gear"; designer's table, PRIORITY_BOARD 2026-11-05, lane/c-temper-craft).
--
-- WHAT IT DOES
--   §1 hr_unlock_buy, patched at ONE anchor: the `temper` namespace joins the house in reading hr_materials_take's second
--      source. So a rung's material comes from the hero's bag first, then the account's Storage (SKILLS FROM STORAGE, Tyler
--      2026-10-25: every consumer does), and one crafting hero can supply the others. Every other namespace is unchanged.
--   §2 hr_temper_view gains `items`, the next rung's material as the server charges it.
--   §4 THE SELF-CHECK, executed on a probe account, every probe rolled back: nothing spent when either half is short, bag
--      first, then Storage, the ledger names both, a hunt's packed bag is never touched, the second hero draws on Storage.
--
-- WHAT IT DOES NOT DO: the sale is the same statement. The materials are decided whole before any write, the purse moves last
--   and any refusal rolls the block back (hr_materials_take, 2027-01-10-house-from-storage.sql, the house's own path). No new
--   RPC, no table. The rungs' prices are 2027-02-28-temper-craft-catalogue.generated.sql's rows.
--
-- APPLY ORDER: after 2027-02-27-tempering.sql. items catalogue, bench inputs, bench tax rates, hunt-sessions catalogue, then the
--   temper catalogue, then this file, then the hr-accrue deploy (its bundle carries the items and recipes), then the client.
-- REVERSIBILITY: re-apply 2027-02-27-tempering-catalogue.generated.sql for gold-only rungs, take 'temper' back out of the anchor.
-- ═════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regprocedure('public.hr_temper_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-02-27-tempering.sql first'; end if;
  if not exists (select 1 from public.hr_unlock_offers where source = 'gen-temper' and items <> '{}'::jsonb) then
    raise exception 'PRECONDITION: apply 2027-02-28-temper-craft-catalogue.generated.sql first'; end if;
  if exists (select 1 from public.hr_unlock_offers o, jsonb_object_keys(o.items) k
              where o.source = 'gen-temper' and not exists (select 1 from public.hr_items i where i.item_id = k)) then
    raise exception 'PRECONDITION: a rung names a material hr_items does not hold: apply 2027-02-28-temper-craft-items-catalogue.generated.sql first'; end if;
  /* The pin: live-hash-drift's own hash of the live body; a second apply of this file finds its own patch. */
  if md5(regexp_replace(pg_get_functiondef(to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')), '[[:space:]]+', ' ', 'g')) <> 'ccb6f35bdd42c88051e4420791d58900'
     and position('''temper''' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'))) = 0 then
    raise exception 'PRECONDITION: hr_unlock_buy is not the body this file patches: another lane moved it, so re-pin'; end if;
end $mig$;

-- ── §1 THE RUNG'S MATERIAL: THE BAG, THEN THE ACCOUNT'S STORAGE ───────────
do $mig$
declare
  v_def text;
  c_from constant text := E'coalesce(v_off.items, ''{}''::jsonb),\n                                       v_cat.namespace in (''room'', ''property''));';
  c_to   constant text := E'coalesce(v_off.items, ''{}''::jsonb),\n                                       v_cat.namespace in (''room'', ''property'', ''temper''));';
begin
  v_def := replace(pg_get_functiondef('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'::regprocedure), chr(13), '');
  if position(c_to in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, c_from, ''))) / length(c_from) <> 1 then
      raise exception 'temper-craft §1: the hr_unlock_buy anchor did not match once'; end if;
    execute replace(v_def, c_from, c_to);
  end if;
end $mig$;

-- ── §2 THE WINDOW'S NUMBERS: the next rung's material, as the sale takes it ──
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_temper_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'track', split_part(u.unlock_id, ':', 2),
           'tier', split_part(u.unlock_id, ':', 3)::int,
           'rung', coalesce(pp.value, 0),
           'max', u.max_value,
           'offer', o.offer_id,
           'gold', o.gold,
           'items', o.items) order by u.unlock_id), '[]'::jsonb)
    into v
    from public.hr_unlocks u
    left join public.player_progress pp
      on pp.user_id = p_user and pp.slot = p_slot and pp.kind = u.progress_kind and pp.key = u.unlock_id and pp.period_key = ''
    left join public.hr_unlock_offers o
      on o.unlock_id = u.unlock_id and o.value = coalesce(pp.value, 0) + 1 and o.refusal is null
   where u.namespace = 'temper';
  return v;
end $$;
revoke all on function public.hr_temper_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_temper_view(uuid, int) from hr_engine;
  end if;
end $$;

-- ── §4 THE SELF-CHECK: THE SALE WITH ITS MATERIAL, PLAYED ON A PROBE ACCOUNT ──
do $mig$
declare
  v_u uuid := '00000000-0000-4000-c000-7e3b3e7c0001';
  k text := '00000000-0000-4000-c000-7e3b3e7c';
  v jsonb; ver bigint; v_r1 public.hr_unlock_offers%rowtype; v_r2 public.hr_unlock_offers%rowtype;
  v_item text; v_need bigint; v_need2 bigint; v_ledger jsonb; i int := 0;
begin
  select * into v_r1 from public.hr_unlock_offers where offer_id = 'temper.blows.2.1';
  select * into v_r2 from public.hr_unlock_offers where offer_id = 'temper.blows.2.2';
  select t.key, t.value::bigint into v_item, v_need from jsonb_each_text(v_r1.items) t limit 1;
  v_need2 := (v_r2.items->>v_item)::bigint;
  if v_item is null or v_need2 is null or not (v_need > 1) or not (v_need2 > v_need) then
    raise exception 'temper-craft §4: the first rungs carry no climbing material: %, %', v_r1.items, v_r2.items; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'temper-craft §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'temper-craft §4: hr_create_character refused: %', v; end if;

    -- (a) THE WINDOW STATES THE MATERIAL, as the sale charges it.
    if not exists (select 1 from jsonb_array_elements(public.hr_temper_view(v_u, 0)) e where e->>'offer' = v_r1.offer_id and e->'items' = v_r1.items) then
      raise exception 'temper-craft §4(a): the view reads %', public.hr_temper_view(v_u, 0); end if;

    -- (b) GOLD IN HAND, NO MATERIAL: refused with its counts, nothing spent, no rung, no journal.
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0001')::uuid, v_r1.offer_id);
    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_item or (v->>'need')::bigint <> v_need or (v->>'have')::bigint <> 0
       or (select gold from public.account_wallet where user_id = v_u) <> 1000000
       or exists (select 1 from public.player_progress where user_id = v_u and key = v_r1.unlock_id)
       or exists (select 1 from public.player_ledger where user_id = v_u and intent like 'unlock\_buy:temper%') then
      raise exception 'temper-craft §4(b): no material answered %', v; end if;

    -- (c) ONE SHORT ACROSS THE BAG AND STORAGE: refused, and the part it holds is still there.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 3)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_item, v_need - 4)
      on conflict (user_id, item_id) do update set qty = excluded.qty;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0002')::uuid, v_r1.offer_id);
    if v->>'error' is distinct from 'insufficient_item' or (v->>'have')::bigint <> v_need - 1 or (v->>'bag')::bigint <> 3 or (v->>'storage')::bigint <> v_need - 4
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) <> 3
       or (select qty from public.account_bank where user_id = v_u and item_id = v_item) <> v_need - 4
       or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'temper-craft §4(c): one short answered %', v; end if;

    -- (d) MATERIAL IN HAND, ONE COIN SHORT: refused, and the material is still there (the purse is last, and the block rolls back).
    update public.account_bank set qty = v_need where user_id = v_u and item_id = v_item;
    update public.account_wallet set gold = v_r1.gold - 1 where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0003')::uuid, v_r1.offer_id);
    if v->>'error' is distinct from 'insufficient_gold'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item) <> 3
       or (select qty from public.account_bank where user_id = v_u and item_id = v_item) <> v_need
       or (select gold from public.account_wallet where user_id = v_u) <> v_r1.gold - 1 then
      raise exception 'temper-craft §4(d): one coin short answered %', v; end if;

    -- (e) BOTH IN HAND: the bag goes first, then Storage; the purse pays; the rung lands; the journal names both sources.
    update public.account_wallet set gold = v_r1.gold + 7 where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0004')::uuid, v_r1.offer_id);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 7
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_item)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_item) <> 3
       or (public.hr_perks_of(v_u, 0)->'temper'->>v_r1.unlock_id)::int is distinct from 1 then
      raise exception 'temper-craft §4(e): the sale answered %', v; end if;
    select l.meta into v_ledger from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'shop' and l.intent = 'unlock_buy:temper.blows.2.1:1' and l.gold = -v_r1.gold;
    if v_ledger is null or v_ledger->'items' <> v_r1.items
       or (v_ledger->'from'->'bag'->>v_item)::bigint <> 3 or (v_ledger->'from'->'storage'->>v_item)::bigint <> v_need - 3 then
      raise exception 'temper-craft §4(e): the journal reads %', v_ledger; end if;

    -- (f) ANOTHER LADDER FROM STORAGE ALONE: no bag row at all, and it spends the stack to nothing.
    update public.account_bank set qty = v_need where user_id = v_u and item_id = v_item;
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0005')::uuid, 'temper.armor.2.1');
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.account_bank where user_id = v_u and item_id = v_item) then
      raise exception 'temper-craft §4(f): Storage alone answered %', v; end if;

    -- (g) EVERY OTHER NAMESPACE STILL READS THE BAG ALONE: the anchor moved one list, and the room and property arms are the same.
    if (select count(*) from regexp_matches((select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')), '''temper''', 'g')) <> 1 then
      raise exception 'temper-craft §4(g): hr_unlock_buy names temper more than once'; end if;
    raise exception using errcode = 'HR894', message = 'temper-craft §4 complete - rolling back';
  exception when sqlstate 'HR894' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_progress where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u) then
    raise exception 'temper-craft §4: a probe row leaked'; end if;
  -- (h) THE GRANTS: both doors are still the engine's and the owner's alone.
  if has_function_privilege('anon', 'public.hr_temper_view(uuid,integer)', 'execute') or has_function_privilege('authenticated', 'public.hr_temper_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute') or has_function_privilege('anon', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute') then
    raise exception 'temper-craft §4(h): a grant moved on a Tempering door'; end if;
  raise notice 'temper-craft §4 OK: nothing spent when short, the bag then Storage, the journal, the grants';
end $mig$;
