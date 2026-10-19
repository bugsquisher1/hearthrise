-- ==========================================================================
-- 2026-10-26-hero-slots-start-two.sql — EVERY ACCOUNT STARTS WITH TWO HERO SLOTS
-- STAGED (lane/a-bury-bones, 2026-10-18). Game CLOSED: applies on its passing
-- §3 self-check; Security reviews it with the closed-mode surfaces at the
-- reopen gate. NOT APPLIED.
--
-- Tyler ruling 2026-10-17 (final): every account STARTS with 2 character
-- slots; more, up to 5, cost gold (escalating); up to 4 play at once, free.
-- Production gave every account ONE (slot 0): hr_hero_slots_of owned 0 plus
-- what was bought, and on 2026-10-15 hr_create_character(2) answered
-- slot_not_owned (owned [0]) 836 times. The character screen offered no way
-- to make a second hero.
--
-- OWNERSHIP:
--   §1 public.hr_hero_slots gains `starter boolean not null default false`:
--      a STARTER slot is owned by every account and never sold. Slot 1 is the
--      starter (cost_gold 0, so hr_buy_hero_slot refuses it slot_unpriced
--      before any lock; premium_waived false). Slots 2..4 stay priced
--      (75,000 / 250,000 / 750,000 gold, unchanged): five slots in all. Which
--      slots start owned is this column, data, not a literal in a body.
--   §2 public.hr_hero_slots_of restated WHOLE from 2026-09-08-hero-slot-buy.sql
--      (md5 pinned in §0) with ONE added union: the catalogue's starter rows.
--      The ladder in hr_buy_hero_slot__ungated (slot N requires N-1) reads this
--      predicate, so slot 2 is buyable without buying slot 1. Nothing else
--      moves: hr_create_character's gate, the purchase, the grants.
--   src/data/shops.js drops the character_slot.1 offer in the same lane
--   (tests/hero-slot-buy.mjs BIND: a starter slot is never offered).
--
-- RE-RUNNABLE: §0 accepts the 2026-09-08 body or this file's own.
-- REVERSIBILITY: set starter = false, cost_gold = 15000 on slot 1 and re-apply
-- the 2026-09-08 hr_hero_slots_of body. Characters already made in slot 1 stay
-- owned through clause (1) (an existing character IS ownership).
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED, NEVER CLOBBER ──────────────────────────
do $$
declare v_md5 text;
begin
  if to_regclass('public.hr_hero_slots') is null
     or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_hero_slots' and column_name = 'cost_gold') then
    raise exception 'PRECONDITION: hr_hero_slots with cost_gold (2026-10-23-demolition-hero-slots-gold.sql) is absent';
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc
             where oid = to_regprocedure('public.hr_hero_slots_of(uuid)'));
  -- the 2026-09-08 body, or this file's own (a re-apply)
  if v_md5 is null or v_md5 not in ('f7158a90fc872f35999869665ffbf06f', '30e26fc6de1aaf5868c6e0a3235b09e7') then
    raise exception 'PRECONDITION: hr_hero_slots_of is not the 2026-09-08 body this file restates (md5 %) - another lane moved it; restate from that body instead', v_md5;
  end if;
end $$;

-- ── 1. THE CATALOGUE: WHICH SLOTS EVERY ACCOUNT STARTS WITH ────────────────
alter table public.hr_hero_slots add column if not exists starter boolean not null default false;
update public.hr_hero_slots set starter = true, cost_gold = 0, premium_waived = false where slot_id = 1;
update public.hr_hero_slots set starter = false where slot_id <> 1;

-- ── 2. OWNERSHIP: THE ONE PREDICATE ────────────────────────────────────────
create or replace function public.hr_hero_slots_of(p_user uuid)
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select coalesce(jsonb_agg(q.s order by q.s), '[]'::jsonb) from (
    select 0 as s
    union
    -- CLAUSE (0) THE STARTER SLOTS — every account owns them (Tyler 2026-10-17: two to start).
    select c.slot_id
      from public.hr_hero_slots c
     where c.starter
    union
    -- CLAUSE (1) GRANDFATHER — an existing character IS ownership.
    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 0
    union
    -- CLAUSE (2) BOUGHT — the flag row hr_buy_hero_slot writes, read through the catalogue.
    select c.slot_id
      from public.hr_hero_slots c
      join public.player_progress pp
        on  pp.user_id = p_user and pp.slot = 0
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = 'character_slot:' || c.slot_id
        and pp.value > 0
    union
    -- CLAUSE (3) WAIVED — no slot is waived since 2026-10-23; kept so a waiver is data again.
    select c.slot_id
      from public.hr_hero_slots c
     where c.premium_waived
       and exists (select 1 from public.player_progress e
                    where e.user_id = p_user and e.slot = 0
                      and e.kind = 'flag' and e.period_key = ''
                      and e.key = 'entitlement:hearthHall' and e.value > 0)
  ) q
  where p_user is not null;
$fn$;
revoke execute on function public.hr_hero_slots_of(uuid) from public;
revoke execute on function public.hr_hero_slots_of(uuid) from anon, authenticated, service_role;

-- ── 3. SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-0000510e0002';
  v jsonb; v_role text;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_u) on conflict do nothing;
    if to_regclass('public.hr_access_allowlist') is not null then
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hero-slots-start-two §3 probe') on conflict (user_id) do nothing;
    end if;
    -- (a) a fresh account owns exactly the free slot and the starter: [0,1].
    if public.hr_hero_slots_of(v_u) is distinct from '[0,1]'::jsonb then
      raise exception 'VERIFY(a): a fresh account owns %, expected [0,1]', public.hr_hero_slots_of(v_u); end if;
    -- (b) one hero in slot 0, then a second in slot 1, both by the real create.
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): slot 0 create refused: %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'created', '') <> 'true' then
      raise exception 'VERIFY(b): the starter slot 1 create answered %', v; end if;
    if (select count(*) from public.player_state where user_id = v_u) <> 2 then
      raise exception 'VERIFY(b): the account does not hold two heroes after two creates'; end if;
    -- (c) slot 2 is NOT owned: the third hero is still bought.
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_create_character(2);
    if v->>'error' is distinct from 'slot_not_owned' then raise exception 'VERIFY(c): slot 2 create answered %', v; end if;
    -- (d) the starter is never sold; slot 2 passes the ladder (slot 1 owned) and is refused only for gold.
    update public.player_state set gold = 0 where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000c0-0000-4000-a000-0000510e0101');
    if v->>'error' is distinct from 'slot_unpriced' then raise exception 'VERIFY(d): buying the starter slot answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000510e0102');
    if v->>'error' is distinct from 'insufficient_gold'
       or (v->>'cost')::bigint <> (select cost_gold from public.hr_hero_slots where slot_id = 2) then
      raise exception 'VERIFY(d): slot 2 with no gold answered % (expected insufficient_gold at the catalogue price)', v; end if;
    -- (e) the priced slots are still priced and none of them is a starter.
    if exists (select 1 from public.hr_hero_slots where slot_id <> 1 and (starter or cost_gold <= 0)) then
      raise exception 'VERIFY(e): a paid slot is free or a starter'; end if;
    raise exception using errcode = 'HR876', message = 'hero-slots-start-two §3 complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hero_slots_of(uuid)', 'execute') then
      raise exception 'VERIFY(f): % reaches hr_hero_slots_of (it takes any uuid)', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-slots-start-two: every account owns slots 0 and 1; slot 2+ bought with gold up the ladder; all green';
end $$;
