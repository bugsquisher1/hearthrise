-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE LADDERS COUNT WHAT A PLAYER CAN MEET (lane c-monster-ladders,
-- game-designer, 2026-10-22). STAGED. Game CLOSED: applies on its passing §4
-- (CLAUDE.md §2); Security reviews it at the reopen gate (it pays gold).
--
-- THE BUG: the Bestiary's total and the collection milestones were written against
-- a 129-monster catalogue, but only the monsters on the OPEN hunt grounds can be met
-- (19 today) and only their drops looted (49 ids). hunter25/40/60/85/All and
-- collect50..125 could never be earned, and the Bestiary read "x / 134".
--
-- THE RULING (designer; src/data/collection-milestones.js): a rung is a SHARE of the
-- reachable roster, goal = ceil(reach x part / of): the monster rungs are sixths of
-- hr_hunt_roster, the item rungs fifths of hr_hunt_loot_roster (both GENERATED from the
-- open grounds by tools/gen-hunt-sessions.mjs, 2026-11-21-hunt-sessions-catalogue.
-- generated.sql, applied FIRST). The distinct count is read only over the roster, so a
-- monster nobody can meet never counts. A new open ground raises every goal by itself.
-- A roster smaller than a ladder's step count refuses ('roster_too_small') rather than
-- pay a zero or a repeated goal.
--
-- NO PREMIUM CURRENCY (Tyler L12): no rung pays gems (hunterAll was 25, collect100
-- 15; the wallet refused them anyway, which rolled both claims back whole).
-- THE GOLD IS SIZED TO THE TIME A RUNG TAKES (designer, measured on the real settle;
-- table in src/data/collection-milestones.js): the old 2,000-50,000 / 1,000-30,000
-- were sized for a 129-monster chase; re-laddered they would land in the first day.
-- Now the eleven rungs pay 20,900 in all (were 165,000): about a quarter of a new
-- hero's income by the end of the monster ladder (~24 h), an eighth by the item chase.
--
--   §0  pins both pre-images by md5 (the hunterall-129 body; core-bodies' sheet view)
--   §1  hr_claim_milestone__ungated: share rungs over the rosters, gold only
--   §2  hr_character_sheet_view: bestiary { slain, total } over hr_hunt_roster
--   §4  SELF-CHECK by execution, rolled back: every goal <= its reach; a claim below
--       its goal is refused; at it, it pays the gold and nothing else (no wallet row,
--       gems_in 0); a replay pays nothing; hunterAll at the whole roster pays; kills of
--       monsters off the roster do not count; the sheet's total is the roster; grants
--       unchanged; zero leak.
-- REVERSIBILITY: restate the 2026-10-25-hunterall-129.sql body and the 2026-10-27-
-- core-bodies.sql hr_character_sheet_view body. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ──────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_hunt_roster') is null or to_regclass('public.hr_hunt_loot_roster') is null then
    raise exception 'PRECONDITION: hr_hunt_roster / hr_hunt_loot_roster missing — apply 2026-11-21-hunt-sessions-catalogue.generated.sql first'; end if;
  if (select count(*) from public.hr_hunt_roster) < 6 or (select count(*) from public.hr_hunt_loot_roster) < 5 then
    raise exception 'PRECONDITION: the rosters are smaller than the ladders (6 monster rungs, 5 item rungs)'; end if;
  if to_regprocedure('public.hr_claim_milestone(text,integer)') is null
     or to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null
     or to_regprocedure('public.hr_collection_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_milestone / hr_bestiary_of / hr_collection_of missing'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.hr_claim_milestone__ungated(text,integer)'))
     not in ('ff9bb521817f6fdde9e09a784471acb9', '1149a0bfaf404eb374868cf84442c5d4') then
    raise exception 'monster-ladders §0: hr_claim_milestone__ungated is not the hunterall-129 post-image (or this file''s) — another lane moved it'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.hr_character_sheet_view(uuid,integer)'))
     not in ('9c8f40b7bfc143883aa2535fe46729e3', 'a343047a25c8027326b19ad4ae021b68') then
    raise exception 'monster-ladders §0: hr_character_sheet_view is not the core-bodies post-image (or this file''s) — another lane moved it'; end if;
end $$;

-- ── 1. THE CLAIM: share rungs over the reachable rosters, gold only ───────
create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_domain text;
  v_part   int;
  v_of     int;
  v_gold   bigint;
  v_reach  bigint;
  v_thresh bigint;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/collection-milestones.js):
  -- each rung is v_part of v_of of the reachable roster; no rung pays premium currency.
  case p_milestone_id
    when 'hunter10'   then v_domain := 'monsters'; v_part := 1; v_of := 6; v_gold := 200;
    when 'hunter25'   then v_domain := 'monsters'; v_part := 2; v_of := 6; v_gold := 400;
    when 'hunter40'   then v_domain := 'monsters'; v_part := 3; v_of := 6; v_gold := 800;
    when 'hunter60'   then v_domain := 'monsters'; v_part := 4; v_of := 6; v_gold := 1200;
    when 'hunter85'   then v_domain := 'monsters'; v_part := 5; v_of := 6; v_gold := 2500;
    when 'hunterAll'  then v_domain := 'monsters'; v_part := 6; v_of := 6; v_gold := 4000;
    when 'collect25'  then v_domain := 'items';    v_part := 1; v_of := 5; v_gold := 200;
    when 'collect50'  then v_domain := 'items';    v_part := 2; v_of := 5; v_gold := 600;
    when 'collect75'  then v_domain := 'items';    v_part := 3; v_of := 5; v_gold := 1000;
    when 'collect100' then v_domain := 'items';    v_part := 4; v_of := 5; v_gold := 2000;
    when 'collect125' then v_domain := 'items';    v_part := 5; v_of := 5; v_gold := 8000;
    else return jsonb_build_object('ok', false, 'error', 'unknown_milestone', 'milestone', p_milestone_id);
  end case;

  -- VERIFY from the server's OWN projection, counted only over what a player can meet.
  if v_domain = 'monsters' then
    select count(*) into v_reach from public.hr_hunt_roster;
    select count(*) into v_have from public.hr_bestiary_of(auth.uid(), v_slot) b
     where exists (select 1 from public.hr_hunt_roster r where r.monster_id = b.monster_id);
  else
    select count(*) into v_reach from public.hr_hunt_loot_roster;
    select count(*) into v_have from public.hr_collection_of(auth.uid(), v_slot) c
     where exists (select 1 from public.hr_hunt_loot_roster r where r.item_id = c.item_id);
  end if;
  if coalesce(v_reach, 0) < v_of then
    return jsonb_build_object('ok', false, 'error', 'roster_too_small', 'milestone', p_milestone_id, 'reach', coalesce(v_reach, 0));
  end if;
  v_thresh := (v_reach * v_part + v_of - 1) / v_of;   -- ceil(reach x part / of)
  if coalesce(v_have, 0) < v_thresh then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'milestone', p_milestone_id, 'have', coalesce(v_have, 0), 'goal', v_thresh, 'reach', v_reach, 'domain', v_domain);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'collection', p_milestone_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'milestone', p_milestone_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume). Gold only.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'reach', v_reach));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'goal', v_thresh, 'slot', v_slot, 'credited', true);
end $$;
revoke execute on function public.hr_claim_milestone__ungated(text, integer)
  from public, anon, authenticated, service_role;

-- ── 2. THE SHEET: the Bestiary counts the reachable roster ────────────────
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
  v_r     bigint; v_i bigint; v_goal bigint; v_g0 bigint; v_g1 bigint;
  v_mons  text[]; v_loot text[];
begin
  -- (a) GRANTS unchanged: the inner is callable by no client role; the wrapper by authenticated.
  if has_function_privilege('authenticated', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_claim_milestone__ungated(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): hr_claim_milestone__ungated is client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  select count(*), array_agg(monster_id order by monster_id) into v_r, v_mons from public.hr_hunt_roster;
  select count(*), array_agg(item_id order by item_id) into v_i, v_loot from public.hr_hunt_loot_roster;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'monster-ladders §4 probe') on conflict (user_id) do nothing;
    insert into public.player_state (user_id, slot, gold, version)
      values (v_uid, v_slot, 1000, 1)
      on conflict (user_id, slot) do update set gold = 1000;

    -- (b) EVERY GOAL <= ITS REACH, and an empty Bestiary is refused with that goal.
    for v in select public.hr_claim_milestone__ungated(m, v_slot)
               from unnest(array['hunter10','hunter25','hunter40','hunter60','hunter85','hunterAll',
                                 'collect25','collect50','collect75','collect100','collect125']) m loop
      if v->>'error' <> 'incomplete' or (v->>'goal')::bigint > (v->>'reach')::bigint or (v->>'goal')::bigint < 1 then
        raise exception 'SELF-CHECK(b): a rung is not refused incomplete with 1 <= goal <= reach: %', v;
      end if;
    end loop;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if (v->>'goal')::bigint <> v_r then raise exception 'SELF-CHECK(b): hunterAll goal % is not the roster %', v->>'goal', v_r; end if;

    -- (c) 200 kills of monsters OFF the roster count for nothing.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:offroster_' || g::text, 1, '', 'active' from generate_series(1, 200) g;
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    if v->>'error' <> 'incomplete' or (v->>'have')::int <> 0 then
      raise exception 'SELF-CHECK(c): kills off the roster counted: %', v;
    end if;

    -- (d) at hunter10's goal (first ceil(R/6) roster monsters) it pays its 200 gold and nothing else.
    v_goal := (v_r + 5) / 6;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:' || m, 1, '', 'active' from unnest(v_mons[1:v_goal - 1]) m;
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    if v->>'error' <> 'incomplete' or (v->>'have')::bigint <> v_goal - 1 then
      raise exception 'SELF-CHECK(d): one short of the goal was not refused: %', v;
    end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || v_mons[v_goal], 1, '', 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gold')::bigint <> 200 or v_g1 - v_g0 <> 200 or v ? 'gems' then
      raise exception 'SELF-CHECK(d): hunter10 at its goal did not pay exactly 200 gold: % (% -> %)', v, v_g0, v_g1;
    end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid and gems_in <> 0)
       or exists (select 1 from public.account_wallet where user_id = v_uid)
       or exists (select 1 from public.account_gem_grants where user_id = v_uid) then
      raise exception 'SELF-CHECK(d): a milestone claim touched premium currency';
    end if;

    -- (e) a replay pays nothing.
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    if v->>'error' <> 'already_claimed' or v_g0 <> v_g1 then
      raise exception 'SELF-CHECK(e): a replayed claim was not refused or moved gold: % (% -> %)', v, v_g1, v_g0;
    end if;

    -- (f) the whole roster: hunterAll pays its 4000 gold (and no gems).
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:' || m, 1, '', 'active' from unnest(v_mons[v_goal + 1:v_r]) m;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gold')::bigint <> 4000 or (v->>'goal')::bigint <> v_r then
      raise exception 'SELF-CHECK(f): hunterAll at the whole roster did not pay 4000: %', v;
    end if;

    -- (g) items: collect100 (was a gem rung) pays its gold at ceil(I x 4 / 5) roster loot ids.
    v_goal := (v_i * 4 + 4) / 5;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:loot:' || i, 1, '', 'active' from unnest(v_loot[1:v_goal]) i;
    v := public.hr_claim_milestone__ungated('collect100', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gold')::bigint <> 2000 or (v->>'goal')::bigint <> v_goal then
      raise exception 'SELF-CHECK(g): collect100 at its goal did not pay 2000 gold: %', v;
    end if;
    v := public.hr_claim_milestone__ungated('collect125', v_slot);
    if v->>'error' <> 'incomplete' or (v->>'goal')::bigint <> v_i then
      raise exception 'SELF-CHECK(g): collect125 is not refused short of the whole loot roster: %', v;
    end if;

    -- (h) the Bestiary on the sheet: total = the roster, slain = the roster (the off-roster kills ignored).
    v := public.hr_character_sheet_view(v_uid, v_slot);
    if (v->'bestiary'->>'total')::bigint <> v_r or (v->'bestiary'->>'slain')::bigint <> v_r then
      raise exception 'SELF-CHECK(h): the sheet''s bestiary is not % / %: %', v_r, v_r, v->'bestiary';
    end if;

    -- (i) the wrapper still journals a refusal.
    v := public.hr_claim_milestone('no_such_milestone', v_slot);
    if v->>'ok' <> 'false' or not exists (select 1 from public.hr_rejections where user_id = v_uid) then
      raise exception 'SELF-CHECK(i): the wrapper no longer journals refusals: %', v;
    end if;

    raise exception using errcode = 'HR892', message = 'monster-ladders §4 complete — rolling back';
  exception when sqlstate 'HR892' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.hr_rejections   where user_id = v_uid)
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

  raise notice 'monster-ladders: % monsters / % loot ids reachable; every goal <= its reach; off-roster kills ignored; '
               'claims pay gold only, once; hunterAll and collect100 pay without gems; the sheet reads % / %; zero leak',
               v_r, v_i, v_r, v_r;
end $$;
