-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-12-equippable-req-lv.sql
--
-- CLOSE THE WIELD GATE ON THE REALM. 34 rows of public.hr_items carry
-- req_skill = NULL and req_lv = NULL for gear the CLIENT has been gating all
-- along. Data only: no function body changes, no grant changes, no new object,
-- no value moved. hr_apply §EQUIPMENT already re-checks the requirement
-- (2026-08-11-apply-engine.sql:769) — it has simply had nothing to check.
--
-- ── THE BUG, AND WHY IT IS A REAL ONE ───────────────────────────────────────
-- src/data/items.js authors gear; tools/gen-catalogues.mjs mirrors `reqSkill`
-- and `reqLv` into hr_items.req_skill/req_lv VERBATIM. 31 of 237 equippables
-- (plus 3 riders, below) carried a `tier` and no `reqLv`, and the two readers
-- then disagreed about what that meant:
--
--   CLIENT  legacy.js `gearWieldReq` falls back to `_TIER_WIELD_LV[tier]` — a
--           SECOND copy of the ladder — so the browser refused the equip.
--   SERVER  hr_apply reads only `req_lv`, which was NULL, and
--           `i.req_lv is not null` short-circuits the whole check. The realm
--           refused nobody.
--
-- A client-only gate is not a gate (CLAUDE.md §1: nothing is authored by the
-- client). Anything that reaches hr_apply without going through this repo's
-- own UI — a replayed intent, a hand-built request, a future platform client —
-- wore the gear.
--
-- ⚠ THE SIX TIER-8 ROWS ARE WORSE, AND ARE THE REASON THIS IS NOT A TIDY-UP.
--   `_TIER_WIELD_LV` is an array of eight slots indexed 1..7 (index 0 is a
--   pad), so `_TIER_WIELD_LV[8]` is `undefined`, `|| 0` makes it 0, and
--   `gearWieldReq` returns null. regent_helm, slagheart_platebody,
--   abyssal_greaves, warden_girdle, choirbone_gauntlets and wyrmgilt_mantle
--   were therefore ungated on BOTH sides — and all six are TRADEABLE. A
--   level-1 character with gold could buy a 120-defence platebody off the
--   market and wear it. That is the shape the market exists to make expensive,
--   not impossible, and the gate is the only thing that priced it.
--
-- ── THE RULE (game-designer ruling, 2026-09-12, final) ──────────────────────
--   req_lv    = the SHIPPED tier ladder, tier 1..8 → 1/15/30/45/60/75/88/88.
--               Tier 8 SHARES 88; it does not open a rung above it. Two live
--               tier-8 rows already sit at 82 and 88, so a new rung would nerf
--               gear somebody is already wearing.
--   req_skill = the skill the item's POWER serves: armour and jewelry
--               `defense`; a weapon its own style (attack/ranged/magic per
--               weaponType); an item whose only effect feeds ONE non-combat
--               skill takes THAT skill (bone_earrings → prayer, a Prayer XP
--               faucet); an item with no combat stat and no faucet takes
--               req_lv 1 (tally_ring, pathfinder_studs — they sell
--               INFORMATION, and gating the thing that teaches a new player
--               the bestiary exists behind Defence 15 is backwards).
--   req_lv 1  restricts nobody (the gate is `level < req_lv`). It is the data
--               form of "belongs to this skill", and it is what keeps the
--               column NON-NULL across a whole lane so the server has one
--               shape to read instead of two.
--
-- The three riders are items with no tier at all, whose gate the ruling read
-- off their stats: iron_arrows (the one arrow with no lane) → ranged 1;
-- chief_blade (atkB 13, iron's rung) → attack 15; captains_ribblade (atkB 19,
-- between steel and mithril) → attack 30.
--
-- bestiary_cloak and hearthstone_signet are COSMETICS and stay NULL on both
-- sides, asserted in §2(c). A cosmetic is earned, not out-levelled: gating one
-- would mean a player who won a cloak cannot wear it.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ─────────────────
-- 2026-08-11-catalogue.generated.sql (same branch) now carries these 34 rows
-- with the ruled values, and it is the DURABLE source — it DELETEs and
-- re-INSERTs hr_items wholesale. But that file is re-applied on its own
-- cadence and moves 519 item rows, 275 slot pairs, 473 activities and the
-- start kit with it. This file moves EXACTLY 34 columns on 34 rows, is
-- idempotent, and can be applied on its own the moment the client half ships.
-- Apply either and the table lands in the same state; §2(a) asserts that, so
-- the two records cannot drift apart silently.
--
-- ⚠ ORDER: apply this BEFORE (or with) the client push that carries the data
--   half. Applied first it is invisible to the running client — the browser
--   already gated these items from `tier`, so the realm merely stops
--   disagreeing. Pushed first, nothing breaks either; the hole simply stays
--   open for the length of the gap. There is no window in which a player is
--   refused something they could do yesterday, because every row here already
--   read as gated in the UI.
--
-- REVERSIBILITY: `update public.hr_items set req_skill = null, req_lv = null
-- where item_id in (…the 34 ids…)`, or re-apply the catalogue from a commit
-- before this branch. No other object is touched.
--
-- IT DOES NOT STRIP A WORN SLOT. hr_apply checks the requirement on the EQUIP
-- and never re-checks the worn set (src/net/equip.js §THE GATE, note 3), so a
-- character already wearing one of these keeps it. That is deliberate: the
-- alternative is un-equipping live players' kit on apply.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED ROWS ──────────────────────────────────────────────────────
-- One UPDATE, idempotent by the `is distinct from` predicate: a second apply
-- moves zero rows. The rule is an inline VALUES list rather than a temp table
-- so the file carries no transaction-scope assumption (tools/apply-migration.mjs
-- sends it as one batch and CLAUDE.md §2 forbids a begin/commit here).
-- The ids are asserted to EXIST first: an UPDATE that matches nothing is
-- silent, and this file's entire job is a column that stops being NULL.
do $$
declare
  v_missing text;
  v_rows    int;
  -- id · req_skill · req_lv. Held as jsonb so the 34 rows are written ONCE and
  -- read three times below, without creating a database object for a one-off.
  v_rule constant jsonb := '[
    ["bronze_sword","attack",1],          ["shortbow","ranged",1],
    ["apprentice_staff","magic",1],       ["stone_maul","attack",1],
    ["bronze_belt","defense",1],          ["leather_boots","defense",1],
    ["leather_gloves","defense",1],       ["copper_studs","defense",1],
    ["iron_sword","attack",15],           ["iron_warhammer","attack",15],
    ["longbow","ranged",15],              ["oak_staff","magic",15],
    ["iron_helm","defense",15],           ["iron_platebody","defense",15],
    ["tally_ring","defense",1],           ["steel_sword","attack",30],
    ["steel_helm","defense",30],          ["steel_platebody","defense",30],
    ["hunters_torc","defense",30],        ["pathfinder_studs","defense",1],
    ["frost_locket","defense",45],        ["bone_earrings","prayer",45],
    ["rune_sword","attack",60],           ["heartwood_cape","defense",75],
    ["unlit_earrings","defense",75],      ["regent_helm","defense",88],
    ["slagheart_platebody","defense",88], ["abyssal_greaves","defense",88],
    ["warden_girdle","defense",88],       ["choirbone_gauntlets","defense",88],
    ["wyrmgilt_mantle","defense",88],
    ["iron_arrows","ranged",1],           ["chief_blade","attack",15],
    ["captains_ribblade","attack",30]
  ]'::jsonb;
begin
  if jsonb_array_length(v_rule) <> 34 then
    raise exception '§1: the rule holds % rows, the ruling names 34', jsonb_array_length(v_rule);
  end if;

  select string_agg(r.item_id, ', ' order by r.item_id) into v_missing
    from jsonb_array_elements(v_rule) e
    cross join lateral (select e->>0 as item_id, e->>1 as req_skill, (e->>2)::int as req_lv) r
   where not exists (select 1 from public.hr_items i where i.item_id = r.item_id);
  if v_missing is not null then
    raise exception '§1: hr_items has no row for % — the catalogue is older than this file, or an '
                    'id was renamed. Re-apply 2026-08-11-catalogue.generated.sql first.', v_missing;
  end if;

  -- Every named skill must be a real skill, or the gate compares against a
  -- player_skills row that can never exist and the item becomes UNWEARABLE.
  select string_agg(distinct r.req_skill, ', ') into v_missing
    from jsonb_array_elements(v_rule) e
    cross join lateral (select e->>1 as req_skill) r
   where not exists (select 1 from public.hr_skills s where s.skill_id = r.req_skill);
  if v_missing is not null then
    raise exception '§1: req_skill % is not in hr_skills — hr_apply would find no level row and '
                    'refuse the equip forever', v_missing;
  end if;

  update public.hr_items i
     set req_skill = r.req_skill, req_lv = r.req_lv
    from jsonb_array_elements(v_rule) e
    cross join lateral (select e->>0 as item_id, e->>1 as req_skill, (e->>2)::int as req_lv) r
   where i.item_id = r.item_id
     and (i.req_skill is distinct from r.req_skill or i.req_lv is distinct from r.req_lv);
  get diagnostics v_rows = row_count;
  raise notice 'equippable-req-lv §1: % of 34 rows moved (0 on a re-apply — idempotent)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim below is proved by EXECUTING it, never by a marker or a string
-- match on a body. The apply is atomic, so a raise here reverts §1. The
-- row-writing probe runs in a subtransaction discarded by a sentinel raise
-- (HR812), so this block is net-zero on production.
do $$
declare
  v_bad   text;
  v_r     jsonb;
  v_ver   bigint;
  v_n     int;
  v_uid   constant uuid := '00000000-0000-4000-8000-0000b5420001';
  c_j     constant jsonb := '{"kind":"admin","intent":"b542:reqlv-probe"}'::jsonb;
begin
  -- (a) THE 34 ROWS CARRY THE RULED VALUES. Asserted against the same literal
  --     table §1 wrote from, restated here so a hand-edit to §1 that dropped a
  --     row cannot also silence its own check.
  select string_agg(x.item_id || '=' || coalesce(i.req_skill,'NULL') || '/'
                      || coalesce(i.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', ' order by x.item_id)
    into v_bad
    from (values
      ('bronze_sword','attack',1),('shortbow','ranged',1),('apprentice_staff','magic',1),
      ('stone_maul','attack',1),('bronze_belt','defense',1),('leather_boots','defense',1),
      ('leather_gloves','defense',1),('copper_studs','defense',1),('iron_sword','attack',15),
      ('iron_warhammer','attack',15),('longbow','ranged',15),('oak_staff','magic',15),
      ('iron_helm','defense',15),('iron_platebody','defense',15),('tally_ring','defense',1),
      ('steel_sword','attack',30),('steel_helm','defense',30),('steel_platebody','defense',30),
      ('hunters_torc','defense',30),('pathfinder_studs','defense',1),('frost_locket','defense',45),
      ('bone_earrings','prayer',45),('rune_sword','attack',60),('heartwood_cape','defense',75),
      ('unlit_earrings','defense',75),('regent_helm','defense',88),('slagheart_platebody','defense',88),
      ('abyssal_greaves','defense',88),('warden_girdle','defense',88),('choirbone_gauntlets','defense',88),
      ('wyrmgilt_mantle','defense',88),('iron_arrows','ranged',1),('chief_blade','attack',15),
      ('captains_ribblade','attack',30)
    ) as x(item_id, req_skill, req_lv)
    join public.hr_items i on i.item_id = x.item_id
   where i.req_skill is distinct from x.req_skill or i.req_lv is distinct from x.req_lv;
  if v_bad is not null then
    raise exception 'GATE(a): the ruled rows did not land: %', v_bad;
  end if;

  -- (b) THE 34 ROWS SIT ON A LADDER RUNG, and NO row in hr_items asks for a
  --     level the XP table cannot reach.
  --
  --     Two different claims, deliberately. The ruling's rungs bind the rows
  --     THIS file authored; they do not bind the whole catalogue, and a gate
  --     that pretended otherwise would be a lie — `dragonfang_pike` is
  --     hand-authored at 95, above the ladder, on purpose (a dungeon boss drop
  --     with no tier at all). The first draft of this gate asserted 1..88
  --     globally and went red on exactly that row during the repo replay; the
  --     row is right and the gate was wrong, so the gate got narrower rather
  --     than the data getting flattened.
  --
  --     The GLOBAL claim is the one that holds for every row: hr_apply compares
  --     req_lv against hr_level_from_xp, which is capped by max(level) in
  --     hr_xp_table. A req_lv above that cap is not a gate, it is an item
  --     nobody can ever wear — derived from the table rather than typed as 99,
  --     because the day the cap moves this assertion must move with it.
  -- One query, two answers: the count is the CONTROL for gate (a), whose join
  -- is INNER and would therefore pass in silence on a row that is MISSING from
  -- hr_items rather than merely wrong. coalesce, not `|| req_lv`: a NULL req_lv
  -- makes the concatenation NULL and string_agg would drop the worst row.
  with ruled as (
    select i.item_id, i.req_lv from public.hr_items i
     where i.item_id in ('bronze_sword','shortbow','apprentice_staff','stone_maul',
       'bronze_belt','leather_boots','leather_gloves','copper_studs','iron_sword',
       'iron_warhammer','longbow','oak_staff','iron_helm','iron_platebody','tally_ring',
       'steel_sword','steel_helm','steel_platebody','hunters_torc','pathfinder_studs',
       'frost_locket','bone_earrings','rune_sword','heartwood_cape','unlit_earrings',
       'regent_helm','slagheart_platebody','abyssal_greaves','warden_girdle',
       'choirbone_gauntlets','wyrmgilt_mantle','iron_arrows','chief_blade','captains_ribblade')
  )
  select count(*),
         string_agg(item_id || '=' || coalesce(req_lv::text, 'NULL'), ', ')
           filter (where req_lv is null or req_lv not in (1,15,30,45,60,75,88))
    into v_n, v_bad
    from ruled;
  if v_n <> 34 then
    raise exception 'GATE(b1) CONTROL: hr_items holds % of the 34 ruled ids — gate (a) joins INNER, '
                    'so a missing row would have passed it in silence', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(b1): a ruled row is off the 1/15/30/45/60/75/88 ladder: %', v_bad;
  end if;

  select string_agg(item_id || '=' || req_lv, ', ') into v_bad
    from public.hr_items
   where req_lv is not null
     and (req_lv < 1
          or req_lv > coalesce((select max(level) from public.hr_xp_table), 0));
  if v_bad is not null then
    raise exception 'GATE(b2): req_lv is below 1 or above the highest level hr_xp_table can reach '
                    '(%) — the item would be permanently unwearable: %',
                    (select max(level) from public.hr_xp_table), v_bad;
  end if;

  -- (c) THE COSMETICS STAY UNGATED, on the server as on the client. This is the
  --     assertion that stops a future "fill in the NULL columns" pass from
  --     quietly gating a reward somebody earned.
  select string_agg(item_id || '=' || coalesce(req_skill,'') || '/' || coalesce(req_lv::text,''), ', ')
    into v_bad
    from public.hr_items
   where item_id in ('bestiary_cloak','hearthstone_signet')
     and (req_skill is not null or req_lv is not null);
  if v_bad is not null then
    raise exception 'GATE(c): a COSMETIC was gated (%) — a reward you earned must never be '
                    'out-levelled', v_bad;
  end if;
  select count(*) into v_n from public.hr_items
   where item_id in ('bestiary_cloak','hearthstone_signet');
  if v_n <> 2 then
    raise exception 'GATE(c) CONTROL: the two cosmetics are not in hr_items (found %) — the NULL '
                    'check above was passing on an empty set', v_n;
  end if;

  -- (d) EXECUTED: hr_apply §EQUIPMENT REFUSES A LEVEL-1 CHARACTER THE TIER-8
  --     PLATEBODY. This is the property the whole file exists for, and it is
  --     the one that cannot be asserted from the catalogue: before §1 this same
  --     call SUCCEEDS, because `i.req_lv is not null` short-circuits the check.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    -- The character OWNS both pieces, so a refusal can only be the requirement
    -- and never `insufficient_item`. (hr_apply checks the requirement BEFORE
    -- ownership, so this is belt and braces — and it is what makes the positive
    -- control in the second half meaningful.)
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'slagheart_platebody', 1), (v_uid, 0, 'bestiary_cloak', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body', 'slagheart_platebody'),
                                'journal', c_j));
    if v_r->>'error' is distinct from 'requirement_not_met'
       or v_r->>'item_id' is distinct from 'slagheart_platebody' then
      raise exception 'GATE(d): a level-1 character equipping slagheart_platebody answered % — it '
                      'must be requirement_not_met/slagheart_platebody. The tier-8 uniques are '
                      'TRADEABLE: without this the market sells 120 defence to a new account.', v_r;
    end if;
    if exists (select 1 from public.player_equipment
                where user_id = v_uid and slot = 0 and equip_slot = 'body') then
      raise exception 'GATE(d): the refused equip still wrote player_equipment';
    end if;
    if coalesce((select qty from public.player_inventory
                  where user_id = v_uid and slot = 0 and item_id = 'slagheart_platebody'), 0) <> 1 then
      raise exception 'GATE(d): the refused equip consumed the item from the bank';
    end if;

    -- POSITIVE CONTROL, and the cosmetic promise in one call: the SAME level-1
    -- character, the SAME verb, an UNGATED item — accepted. Without this, a
    -- migration that broke equipping outright would "pass" (d) and prove
    -- nothing about the requirement.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('cape', 'bestiary_cloak'),
                                'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: the same character was refused an UNGATED cosmetic (%) — '
                      'equipping is broken, so the refusal above measured nothing', v_r;
    end if;
    if not exists (select 1 from public.player_equipment
                    where user_id = v_uid and slot = 0 and equip_slot = 'cape'
                      and item_id = 'bestiary_cloak') then
      raise exception 'GATE(d) CONTROL: the accepted equip did not land in player_equipment';
    end if;

    raise exception using errcode = 'HR812', message = 'equippable-req-lv §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file would seed a character into
  -- production as a side effect of verifying itself, which §2 of CLAUDE.md
  -- forbids outright.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'equippable-req-lv: 34 rows carry the ruled gate, the two cosmetics stay NULL, '
               'req_lv is inside 1..88, and hr_apply refuses a level-1 slagheart_platebody while '
               'still accepting an ungated cosmetic — all green';
end $$;
