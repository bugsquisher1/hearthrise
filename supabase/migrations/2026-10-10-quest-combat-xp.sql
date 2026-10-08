-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-quest-combat-xp.sql — hundred_kills' 1,500 COMBAT XP IS PAID BY
--                                  THE SERVER'S QUEST CLAIM.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C:
--   it credits player_skills, a RANKED surface — total_level / combat_level).
--   The Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-quest-combat-xp.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC). NO EDGE CHANGE.
--   The client half (legacy.js completeQuest stops calling addXp for a
--   server-credited quest) ships at the next cut AFTER this applies; before it,
--   the new client would claim hundred_kills and be refused unknown_quest, and
--   the sweep retries it, so the XP lands the moment the server knows the arm.
--
-- ── THE DEFECT (whole-game review, 2026-10-08) ──────────────────────────────
-- legacy.js completeQuest paid hundred_kills' reward ({combatXp:1500}) with
-- addXp(...{authored:true}) in the browser. Under the skills arm that is a
-- prediction plus an entry in G._combatXpPending, which hrCreditCombatXpFlush
-- sends to hr_credit_combat_xp as "observed attended combat XP". So a quest
-- reward rode a CLIENT-REPORTED XP channel whose only bound is a physics cap
-- sized for fighting — the reward amount was the client's claim, and the cap
-- either let it through (a mint on a ranked skill) or clamped it (the player
-- lost a reward they earned). Every other first-day reward (gatherer,
-- first_cook, first_blood, farmhand, the road) is paid by hr_claim_quest from a
-- server counter. CLAUDE.md §1: the client never computes an authoritative XP.
--
-- ── THE RULING (Game Designer, final) ───────────────────────────────────────
-- "Pay it from the server's quest claim, like every other first-day reward."
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 hr_style_xp_routes   (family, style_key, skill_id, share) — ⟦DERIVED⟧
--      from src/core/styles.js COMBAT_STYLES[family][key].xp, the ONE routing
--      table the kill XP already uses (killXpRoute). RLS on, no policy, every
--      client privilege revoked. tests/combat-style.mjs binds it both ways.
--   §2 hr_weapon_families   (item_id, family) — ⟦DERIVED⟧ from src/data/items.js
--      `weaponType`, the field src/core/combat.js reads for the equipped weapon.
--      Same lock-down, same drift guard.
--   §3 hr_claim_quest__ungated — the 2026-09-28-journeymans-road.sql body
--      VERBATIM plus (a) ONE arm, hundred_kills, and (b) a combat-XP credit that
--      routes the arm's v_cxp exactly as the client's killXpRoute(style, xp, 1)
--      did: equipped weapon -> family (no/unknown weapon -> 'sword', as
--      resolveStyle does) -> the character's SERVER-HELD style for that family
--      (player_state.combat_style, set only by hr_set_style) or the family
--      default (hr_combat_styles.is_default) -> the share rows. A stored key with
--      no route falls back to the sword default, as FALLBACK_STYLE does.
--   §4 self-check — executed, net-zero.
--
-- ── WHAT CANNOT BE MINTED ───────────────────────────────────────────────────
--   · The client sends a QUEST ID and a SLOT. The XP amount is the CASE literal,
--     the routing is two server catalogues plus a server column; no client value
--     reaches the credit.
--   · Completion is the server's lifetime stat ev:kill_any >= 100 — the same row
--     first_blood and road_hunt grade (and the same accepted ROAD_HUNT FORGE
--     residual: hr_credit_kills' bounty branch can raise that row; it is a GATE
--     on a once-ever reward, journalled; see 2026-09-28-journeymans-road.sql).
--   · Once-guard: the unchanged (user, slot, 'quest', id) claim row, inserted
--     BEFORE any credit. A replay is already_claimed and pays nothing.
--   · The share rows sum to 1 per style (asserted), and each amount is floored,
--     so the credit is <= 1,500 XP total, once per character, ever.
--
-- ── JOURNAL ─────────────────────────────────────────────────────────────────
-- ONE quest row, as for every quest: meta.xp carries the per-skill credit and
-- meta.route the (family, style) it was routed by. xp_in stays 0 — a fixed,
-- once-ever, server-catalogued reward is outside the accrual daily budget (the
-- hr_claim_goal XP precedent, 2026-08-23-modal-goal-claims.sql).
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- Two small catalogue tables (19 + 49 rows, no growth with players). One extra
-- arm and at most three player_skills upserts on ONE claim per character ever.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply §2 of 2026-09-28-journeymans-road.sql (the 10-arm body) to remove the
-- arm; the two catalogue tables may stay (nothing else reads them) or be
-- dropped. XP already credited is ordinary player_skills state and stays.
-- ⚠ THIS FILE IS NOW THE CHAIN END for hr_claim_quest__ungated: tests/
--   goal-catalogue-drift.mjs reads the arms from here. Never re-apply
--   2026-09-28-journeymans-road.sql §2 on production after this except as that
--   deliberate rollback.
--
-- ── LIVE-HASH NOTE ──────────────────────────────────────────────────────────
-- hr_claim_quest__ungated is tracked in tests/live-hash-drift.baseline.json;
-- this file reads the repo AHEAD of production until applied (Coordinator
-- re-measures with --live --write).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS - FAIL CLOSED ───────────────────────────────────────────
do $$
declare
  v_src text;
  v_n   int;
begin
  if to_regprocedure('public.hr_claim_quest__ungated(text,integer)') is null
     or to_regprocedure('public.hr_claim_quest(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_quest(__ungated)(text,int) is absent';
  end if;
  if to_regclass('public.hr_combat_styles') is null then
    raise exception 'PRECONDITION: hr_combat_styles is absent - apply 2026-08-24-combat-style.sql first';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'player_state' and column_name = 'combat_style') then
    raise exception 'PRECONDITION: player_state.combat_style is absent - the route has no server-held style';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'public.hr_claim_quest__ungated(text,integer)'::regprocedure;
  if position('hr_style_xp_routes' in v_src) > 0 then
    raise notice 'hr_claim_quest__ungated already credits combat XP - §3 rewrites it to this file''s text';
  else
    -- The installed body must be the reviewed 10-arm journeymans-road body.
    select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
    if v_n <> 10 or position('road_harvest' in v_src) = 0
       or position('select items into v_cat from public.hr_quest_rewards where quest_id = p_quest_id;' in v_src) = 0 then
      raise exception 'PRECONDITION: the installed hr_claim_quest__ungated is not the 10-arm '
                      '2026-09-28-journeymans-road.sql body (% arms). Re-measure before restating it.', v_n;
    end if;
  end if;
end $$;

-- ── 1. hr_style_xp_routes — ⟦DERIVED⟧ src/core/styles.js COMBAT_STYLES[*][*].xp ─
create table if not exists public.hr_style_xp_routes (
  family    text    not null,
  style_key text    not null,
  skill_id  text    not null,
  share     numeric not null check (share > 0 and share <= 1),
  primary key (family, style_key, skill_id)
);
alter table public.hr_style_xp_routes enable row level security;
revoke all on public.hr_style_xp_routes from public, anon, authenticated, service_role;
delete from public.hr_style_xp_routes;
insert into public.hr_style_xp_routes (family, style_key, skill_id, share) values
  ('sword', 'accurate', 'attack', 1),
  ('sword', 'aggressive', 'strength', 1),
  ('sword', 'defensive', 'defense', 1),
  ('sword', 'controlled', 'attack', 0.33),
  ('sword', 'controlled', 'strength', 0.33),
  ('sword', 'controlled', 'defense', 0.34),
  ('hammer', 'smash', 'strength', 1),
  ('hammer', 'crush', 'attack', 0.5),
  ('hammer', 'crush', 'strength', 0.5),
  ('hammer', 'guard', 'defense', 0.5),
  ('hammer', 'guard', 'strength', 0.5),
  ('ranged', 'rapid', 'ranged', 1),
  ('ranged', 'precise', 'ranged', 1),
  ('ranged', 'longrange', 'ranged', 0.5),
  ('ranged', 'longrange', 'defense', 0.5),
  ('magic', 'cast', 'magic', 1),
  ('magic', 'focus', 'magic', 1),
  ('magic', 'warded', 'magic', 0.5),
  ('magic', 'warded', 'defense', 0.5);

-- ── 2. hr_weapon_families — ⟦DERIVED⟧ src/data/items.js ITEMS[*].weaponType ─────
create table if not exists public.hr_weapon_families (
  item_id text primary key,
  family  text not null
);
alter table public.hr_weapon_families enable row level security;
revoke all on public.hr_weapon_families from public, anon, authenticated, service_role;
delete from public.hr_weapon_families;
insert into public.hr_weapon_families (item_id, family) values
  ('alphaheart_longbow', 'ranged'), ('apprentice_staff', 'magic'), ('ashcrown_greatsword', 'sword'),
  ('bramble_blade', 'sword'), ('bronze_sword', 'sword'), ('captains_ribblade', 'sword'),
  ('chief_blade', 'sword'), ('dawn_sword', 'sword'), ('dawn_warhammer', 'hammer'),
  ('demoncaller_staff', 'magic'), ('dragonfang_pike', 'sword'), ('dragonrend_greatblade', 'sword'),
  ('dragonrib_bow', 'ranged'), ('duskwood_bow', 'ranged'), ('duskwood_staff', 'magic'),
  ('ember_sword', 'sword'), ('ember_warhammer', 'hammer'), ('emberfang_blade', 'sword'),
  ('fangdart_recurve', 'ranged'), ('heartgarnet_maul', 'hammer'), ('iron_sword', 'sword'),
  ('iron_warhammer', 'hammer'), ('lazlos_maul', 'hammer'), ('longbow', 'ranged'),
  ('maple_bow', 'ranged'), ('maple_staff', 'magic'), ('marrowbone_maul', 'hammer'),
  ('mithril_sword', 'sword'),
  ('mithril_warhammer', 'hammer'), ('oak_staff', 'magic'), ('rat_stick', 'hammer'),
  ('rune_sword', 'sword'), ('rune_warhammer', 'hammer'), ('runewood_bow', 'ranged'),
  ('runewood_staff', 'magic'), ('shortbow', 'ranged'), ('steel_sword', 'sword'),
  ('steel_warhammer', 'hammer'), ('stone_maul', 'hammer'), ('verdite_blade', 'sword'),
  ('void_censer', 'magic'), ('voidmaw_scepter', 'magic'), ('wartusk_cleaver', 'sword'),
  ('whispering_codex', 'magic'), ('widows_fang', 'sword'), ('willow_longbow', 'ranged'),
  ('willow_staff', 'magic'), ('yew_bow', 'ranged'), ('yew_staff', 'magic');

-- ── 3. hr_claim_quest__ungated — journeymans-road body + hundred_kills + XP ───
create or replace function public.hr_claim_quest__ungated(p_quest_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_key    text;   -- the ev:<type> counter to verify
  v_goal   bigint;
  v_gold   bigint;
  v_cxp    bigint := 0;                -- the arm's combat XP (2026-10-10), routed by style
  v_have   bigint;
  v_rows   int;
  v_cat    jsonb  := '{}'::jsonb;   -- the authored item map for this quest
  v_ok     jsonb  := '{}'::jsonb;   -- ids hr_items knows — these are credited
  v_skip   jsonb  := '{}'::jsonb;   -- ids it does not — reported, never minted
  v_xp     jsonb  := '{}'::jsonb;   -- skill -> XP credited by this claim
  v_route  jsonb  := null;          -- {family, style} the XP was routed by
  v_family text;
  v_style  text;
  v_k      text;
  v_v      text;
  v_n      bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/goal-catalogue.js).
  case p_quest_id
    when 'gatherer'    then v_key := 'ev:gather';   v_goal := 15; v_gold := 150;
    when 'first_cook'  then v_key := 'ev:cooked';   v_goal := 5;  v_gold := 200;
    when 'first_blood' then v_key := 'ev:kill_any'; v_goal := 5;  v_gold := 150;
    -- b497: goal 10 -> 6 (Designer, balance audit). Production was moved by
    -- 2026-09-04-goal-gold-retune.sql; this restatement carries the same 6, so
    -- re-applying that file after this one would be a REVERT, not a no-op.
    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;
    -- Journeyman's Road (2026-09-28-journeymans-road.sql): the day-2 chain.
    when 'road_forge' then v_key := 'ev:smithed'; v_goal := 60; v_gold := 700;
    when 'road_craft' then v_key := 'ev:crafted'; v_goal := 60; v_gold := 700;
    when 'road_cook' then v_key := 'ev:cooked'; v_goal := 60; v_gold := 600;
    when 'road_gather' then v_key := 'ev:gather'; v_goal := 500; v_gold := 1000;
    when 'road_hunt' then v_key := 'ev:kill_any'; v_goal := 500; v_gold := 1500;
    when 'road_harvest' then v_key := 'ev:harvest'; v_goal := 40; v_gold := 1500;
    -- 2026-10-10-quest-combat-xp.sql: the first-day combat quest, paid HERE (it
    -- was a client addXp riding the attended-combat credit). XP only.
    when 'hundred_kills' then v_key := 'ev:kill_any'; v_goal := 100; v_gold := 0; v_cxp := 1500;
    else return jsonb_build_object('ok', false, 'error', 'unknown_quest', 'quest', p_quest_id);
  end case;

  -- VERIFY completion from the server's OWN lifetime counter.
  select value into v_have from public.player_progress
   where user_id = auth.uid() and slot = v_slot
     and kind = 'stat' and key = v_key and period_key = '';
  if coalesce(v_have, 0) < v_goal then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'quest', p_quest_id, 'have', coalesce(v_have, 0), 'goal', v_goal);
  end if;

  -- ── PLAN THE ITEM MINT (pure reads, BEFORE the consume) ──────────────────
  select items into v_cat from public.hr_quest_rewards where quest_id = p_quest_id;
  v_cat := coalesce(v_cat, '{}'::jsonb);
  for v_k, v_v in select key, value from jsonb_each_text(v_cat) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_items where item_id = v_k) then
      v_ok := v_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_skip := v_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;

  -- ── PLAN THE COMBAT-XP ROUTE (pure reads, BEFORE the consume) ────────────
  -- src/core/styles.js killXpRoute(resolveStyle(weaponType, styleKeys), xp, 1),
  -- restated over SERVER rows only: the equipped weapon's family (none/unknown
  -- -> 'sword'), the character's hr_set_style choice for that family or the
  -- family default, then the share rows. A stored key with no route falls back
  -- to the sword default (FALLBACK_STYLE). Each share is floored.
  if v_cxp > 0 then
    select w.family into v_family
      from public.player_equipment e
      join public.hr_weapon_families w on w.item_id = e.item_id
     where e.user_id = auth.uid() and e.slot = v_slot and e.equip_slot = 'weapon';
    v_family := coalesce(v_family, 'sword');
    select nullif(st.combat_style ->> v_family, '') into v_style
      from public.player_state st where st.user_id = auth.uid() and st.slot = v_slot;
    if v_style is null or not exists (select 1 from public.hr_style_xp_routes
                                        where family = v_family and style_key = v_style) then
      select style_key into v_style from public.hr_combat_styles
       where family = v_family and is_default;
    end if;
    if v_style is null or not exists (select 1 from public.hr_style_xp_routes
                                        where family = v_family and style_key = v_style) then
      v_family := 'sword';
      select style_key into v_style from public.hr_combat_styles where family = 'sword' and is_default;
    end if;
    for v_k, v_n in
      select r.skill_id, floor(v_cxp * r.share)::bigint
        from public.hr_style_xp_routes r
       where r.family = v_family and r.style_key = v_style
         and exists (select 1 from public.hr_skills s where s.skill_id = r.skill_id)
       order by r.skill_id
    loop
      if v_n > 0 then v_xp := v_xp || jsonb_build_object(v_k, v_n); end if;
    end loop;
    v_route := jsonb_build_object('family', v_family, 'style', v_style);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'quest', p_quest_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'quest', p_quest_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold, version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  for v_k, v_v in select key, value from jsonb_each_text(v_ok) loop
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (auth.uid(), v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  end loop;

  -- THE XP CREDIT — additive upsert, same transaction (the hr_claim_goal shape).
  for v_k, v_v in select key, value from jsonb_each_text(v_xp) loop
    insert into public.player_skills as sk (user_id, slot, skill_id, xp)
      values (auth.uid(), v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;
  end loop;

  -- ONE journal row, never one per component.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'quest', 'quest_claim:' || p_quest_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('quest', p_quest_id, 'goal', v_goal, 'check_key', v_key,
                        'items', v_ok, 'skipped_items', v_skip,
                        'xp', v_xp, 'route', v_route));

  return jsonb_build_object('ok', true, 'quest', p_quest_id, 'gold', v_gold,
    'slot', v_slot, 'credited', true, 'items', v_ok, 'skipped_items', v_skip,
    'xp', v_xp);
end $$;

revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;
grant  execute on function public.hr_claim_quest(text, int) to authenticated;

-- ── 4. SELF-CHECK — executed, net-zero (sentinel HR8A4) ─────────────────────
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000c0-0000-0000-0000-00000000a104';
  v_n     int;
  v_src   text;
  v_g     text;
  v_sum   numeric;
  v_x0    bigint;
  v_x1    bigint;
begin
  -- (a) THE CATALOGUES: shares sum to 1 per style; every style is a real
  --     hr_combat_styles row and vice versa; every routed skill exists; locked.
  select count(*) into v_n from (
    select family, style_key, sum(share) s from public.hr_style_xp_routes
     group by family, style_key having abs(sum(share) - 1) > 0.0001) q;
  if v_n > 0 then raise exception 'VERIFY(a): % style(s) whose XP shares do not sum to 1', v_n; end if;
  select count(*) into v_n from (
    select family, style_key from public.hr_combat_styles
    except select distinct family, style_key from public.hr_style_xp_routes) q;
  if v_n > 0 then raise exception 'VERIFY(a): % catalogued style(s) have no XP route', v_n; end if;
  select count(*) into v_n from (
    select distinct family, style_key from public.hr_style_xp_routes
    except select family, style_key from public.hr_combat_styles) q;
  if v_n > 0 then raise exception 'VERIFY(a): % routed style(s) are not catalogued', v_n; end if;
  select count(*) into v_n from public.hr_style_xp_routes r
   where not exists (select 1 from public.hr_skills s where s.skill_id = r.skill_id) or r.skill_id = 'hitpoints';
  if v_n > 0 then raise exception 'VERIFY(a): % route row(s) name an unknown skill or hitpoints', v_n; end if;
  -- Families must be real; COVERAGE runs from the server's items to this table
  -- (every catalogued weapon has a family, or its kills fall to the default
  -- route). A row for a weapon a LATER catalogue delta adds is allowed: the
  -- content lane's generated deltas apply after this file (items.js parity is
  -- tests/combat-style.mjs section F).
  select count(*) into v_n from public.hr_weapon_families w
   where w.family not in (select distinct family from public.hr_combat_styles);
  if v_n > 0 then raise exception 'VERIFY(a): % weapon row(s) name an unknown family', v_n; end if;
  select count(*) into v_n from public.hr_items i
   where i.kind = 'weapon' and not exists (select 1 from public.hr_weapon_families w where w.item_id = i.item_id);
  if v_n > 0 then raise exception 'VERIFY(a): % catalogued weapon(s) have no family row', v_n; end if;
  select coalesce(string_agg(t || ':' || gg || ':' || pv, ', '), '') into v_g
    from unnest(array['hr_style_xp_routes','hr_weapon_families']) t
    cross join unnest(array['anon','authenticated','service_role','hr_engine']) gg
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pv
   where exists (select 1 from pg_roles rr where rr.rolname = gg)
     and has_table_privilege(gg, ('public.' || t)::regclass, pv);
  if v_g <> '' then raise exception 'VERIFY(a): client privilege(s) on the route catalogues: %', v_g; end if;

  -- (b) THE BODY: 11 arms, hundred_kills pays XP only, grants unchanged.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'public.hr_claim_quest__ungated(text,integer)'::regprocedure;
  select count(*) into v_n from regexp_matches(v_src, 'when ''[a-z0-9_]+''\s+then v_key', 'g');
  if v_n <> 11 then raise exception 'VERIFY(b): % quest arm(s), expected 11', v_n; end if;
  if position('ev:planted' in v_src) > 0 then raise exception 'VERIFY(b): the body names ev:planted'; end if;
  if has_function_privilege('authenticated', 'public.hr_claim_quest__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_quest__ungated(text,integer)', 'execute') then
    raise exception 'VERIFY(b): hr_claim_quest__ungated is client-executable';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, combat_style)
      values (v_uid, 0, 0, 0, 1, '{}'::jsonb), (v_uid, 1, 0, 0, 1, '{"ranged":"longrange"}'::jsonb),
             (v_uid, 2, 0, 0, 1, '{"sword":"nonsense"}'::jsonb);

    -- (c) goal-1 refused, nothing credited, guard not consumed.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:kill_any', 99, '', 'active');
    v := public.hr_claim_quest__ungated('hundred_kills', 0);
    if v->>'error' <> 'incomplete' then raise exception 'VERIFY(c): 99 kills not refused: %', v; end if;
    if exists (select 1 from public.player_skills where user_id = v_uid) then
      raise exception 'VERIFY(c): a refused claim credited XP'; end if;

    -- (d) slot 0, no weapon, no stored style -> sword default (controlled):
    --     attack 495 + strength 495 + defense 510 = 1,500, gold 0, once.
    update public.player_progress set value = 100
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'ev:kill_any';
    v := public.hr_claim_quest__ungated('hundred_kills', 0);
    if coalesce(v->>'ok','') <> 'true' or (v->>'gold')::bigint <> 0 then
      raise exception 'VERIFY(d): the claim did not credit: %', v; end if;
    if v->'xp' <> '{"attack": 495, "strength": 495, "defense": 510}'::jsonb then
      raise exception 'VERIFY(d): unexpected sword-default route %', v->'xp'; end if;
    select coalesce(sum(xp), 0) into v_x0 from public.player_skills where user_id = v_uid and slot = 0;
    if v_x0 <> 1500 then raise exception 'VERIFY(d): player_skills moved by %, expected 1500', v_x0; end if;
    v := public.hr_claim_quest__ungated('hundred_kills', 0);
    if v->>'error' <> 'already_claimed' then raise exception 'VERIFY(d): replay not refused: %', v; end if;
    select coalesce(sum(xp), 0) into v_x1 from public.player_skills where user_id = v_uid and slot = 0;
    if v_x1 <> v_x0 then raise exception 'VERIFY(d): the replay paid again (% -> %)', v_x0, v_x1; end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and intent = 'quest_claim:hundred_kills'
       and meta->'xp' = '{"attack": 495, "strength": 495, "defense": 510}'::jsonb;
    if v_n <> 1 then raise exception 'VERIFY(d): % journal row(s) carrying the XP, expected 1', v_n; end if;

    -- (e) slot 1: an equipped bow + the server-held Longrange choice routes
    --     ranged 750 + defense 750 — the style is the SERVER's column.
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_uid, 1, 'weapon', 'shortbow');
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 1, 'stat', 'ev:kill_any', 100, '', 'active');
    v := public.hr_claim_quest__ungated('hundred_kills', 1);
    if v->'xp' <> '{"ranged": 750, "defense": 750}'::jsonb then
      raise exception 'VERIFY(e): bow + longrange routed %', v->'xp'; end if;

    -- (f) slot 2: a corrupt stored key falls back to the family default.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 2, 'stat', 'ev:kill_any', 100, '', 'active');
    v := public.hr_claim_quest__ungated('hundred_kills', 2);
    select coalesce(sum((value)::numeric), 0) into v_sum from jsonb_each_text(v->'xp');
    if v_sum <> 1500 or not (v->'xp' ? 'attack') then
      raise exception 'VERIFY(f): a corrupt style key routed %', v->'xp'; end if;

    -- (g) every OTHER quest still pays no XP (the walk is journeymans-road's;
    --     one representative keeps this file's claim narrow).
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:gather', 15, '', 'active');
    v := public.hr_claim_quest__ungated('gatherer', 0);
    if coalesce(v->>'ok','') <> 'true' or v->'xp' <> '{}'::jsonb or (v->>'gold')::bigint <> 150 then
      raise exception 'VERIFY(g): gatherer changed: %', v; end if;

    raise exception using errcode = 'HR8A4', message = 'quest-combat-xp §4 complete - rolling back';
  exception when sqlstate 'HR8A4' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §4 LEAKED a probe row';
  end if;
  raise notice 'quest-combat-xp: routes sum to 1 and bind hr_combat_styles both ways, catalogues locked, '
               '11 arms, hundred_kills refused at 99, pays 1,500 XP once by the SERVER style '
               '(default, bow+longrange, corrupt key), replay pays nothing, one journal row — all green';
end $$;
