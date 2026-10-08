-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-prayer-ladder-and-item-gates.sql
--
-- TWO DATA CLOSURES, ONE FILE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT,
-- NO VALUE MOVED:
--
--   §1(a) TEN new `hr_activities` rows — the Prayer ladder from 40 to 99.
--   §1(b) SEVEN `hr_items.req_skill`/`req_lv` rows — the last equippables the
--         realm did not gate.
--
-- ── (a) THE PRAYER VOID ─────────────────────────────────────────────────────
-- `ARTISAN_RECIPES.prayer` (src/data/recipes.js) shipped with THREE rows — req
-- 1, 15, 35 — and nothing from 36 to 99. Prayer is the one bench in the game
-- whose entire output is XP, so past level 35 the skill had no action at all:
-- not a slow top end, an ABSENT one. The ruling (game-designer, 2026-09-12,
-- final) adds ten rungs at 40/46/52/58/65/72/79/86/92/99, each a PURE SINK
-- (`output: null`) fed by a monster drop the player is already fighting for at
-- that level — which also gives ten drops with a vendor price and no other sink
-- somewhere to go.
--
-- WHAT THE SERVER NEEDS FOR THEM, AND WHAT IT DOES NOT. hr_apply's activity arm
-- (2026-08-11-apply-engine.sql §(4a)) does exactly two things with an artisan
-- declaration: it refuses an id with no `hr_activities` row (`unknown_activity`)
-- and it re-checks `req_skill`/`req_lv` against SERVER xp (`activity_locked`).
-- So a new recipe is reachable the moment its catalogue row exists, and these
-- ten rows ARE the server half of the feature.
--
-- ⚠ `xp` AND `ms` ARE NOT IN THIS TABLE, AND CANNOT BE ASSERTED HERE.
--   `hr_activities` holds (kind, activity_id, req_skill, req_lv, max_hp,
--   is_boss) — no yield columns; an artisan row's XP and action time reach the
--   server through the EDGE PAYLOAD, which imports src/data/recipes.js directly
--   (supabase/functions/hr-accrue/catalogue.js:35). §2(a) therefore asserts the
--   three columns the DATABASE owns, exactly, and the xp/ms half is pinned by
--   PRAYER-LADDER-1's LITERAL TRIPLE TABLE in src/features/smoke-test.js — all
--   thirteen rungs as `id req xp ms`, plus a measured 840 XP/s ceiling (just
--   above the catalogue's own non-prayer maximum, forge_slagheart_platebody at
--   833.3). Security's condition on the client cut, and it is the only thing in
--   the repo that measures what a Prayer rung PAYS: `gen-catalogues --check`
--   stays GREEN through an xp typo, because xp is not a generated column. Do not
--   "improve" this file by hand-copying the XP numbers into SQL: that is the
--   data double-copy this repo has been burned by twice, and here the copy would
--   be a FAUCET.
--
--   CONSEQUENCE FOR THE CUT: hr-accrue MUST be redeployed with the client push
--   that carries these rows, or an away window on a new recipe resolves against
--   a payload that has never heard of it (`unknown_recipe`, REFUSED — it fails
--   closed, which is why this is a deploy-order note and not a P0).
--
-- ZERO ENGINE CODE WAS WRITTEN FOR A NULL-OUTPUT RECIPE, and that is the test
-- that these are data. src/core/artisan.js `recipeInputs` already reads the
-- singular `input` field (→ `{[input]: 1}`) and `produced` is null whenever
-- `output` is falsy, which is how `bury_dragon` has accrued away since b356.
--
-- ── (b) THE SEVEN UNGATED EQUIPPABLES ───────────────────────────────────────
-- 2026-09-12-equippable-req-lv.sql closed 34 rows: every equippable that
-- carried a `tier` the CLIENT gated from `_TIER_WIELD_LV` while the SERVER read
-- a NULL `req_lv` and refused nobody. These seven carry NO tier, so they were
-- the residue of that sweep — ungated on BOTH sides, exactly the shape the
-- tier-8 uniques had. `alpha_cloak` (defB 5 + atkB 2), `gold_ring`,
-- `gold_amulet` and `fox_companion` are TRADEABLE market goods, so the hole was
-- reachable with gold rather than with levels.
--
-- THE RULE (same ruling, read off the STAT because these rows never sat on the
-- tier ladder and inventing a `tier` for them would also move the rarity border
-- and the ladder guards):
--     alpha_cloak · gold_ring · gold_amulet   defense 30   (steel's rung — the
--         strongest non-tier cape and jewelry shipped)
--     fox_companion                            defense 15   (strB 2 + 2% XP)
--     copper_ring · hunter_necklace · traveler_cape  defense 1
-- `req_lv` 1 restricts nobody (the gate is `level < req_lv`). It is the data
-- form of "belongs to Defence", and it is what keeps the column NON-NULL across
-- the whole slot so hr_apply reads ONE shape instead of two.
--
-- `fox_companion` also needed a CLIENT line: legacy.js `gearWieldReq` returned
-- null for every type other than weapon/armor/jewelry, so the server would have
-- refused a wield the UI painted no requirement for. `'companion'` is now in
-- that list, and `fox_companion` is the only `type:'companion'` row in
-- src/data (grep-verified).
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ─────────────────
-- 2026-08-11-catalogue.generated.sql (same branch, regenerated: digest
-- 483e871e…, 483 activities, was 473) carries BOTH halves and is the DURABLE
-- source — it DELETEs and re-INSERTs hr_activities and hr_items wholesale. But
-- it is re-applied on its own cadence and moves 519 item rows, 275 slot pairs,
-- 483 activities and the start kit with it. This file moves exactly 10 rows and
-- 14 columns, is idempotent, and can be applied on its own at the cut. Apply
-- either and the table lands in the same state; §2(a)/(b) assert the ruled
-- values, so the two records cannot drift apart in silence.
--
-- ⚠ ORDER: apply this BEFORE the client push that offers the tiles. Applied
--   first it is invisible — nothing declares an activity id the client does not
--   render, and the seven items already read as ungated in the UI, so no player
--   is refused something they could do yesterday. Pushed first, a player who
--   clicks a new Prayer tile is refused `unknown_activity` by the realm: no
--   corruption, but a visible dead button.
--
-- REVERSIBILITY (net-zero, no value to claw back):
--   delete from public.hr_activities where kind = 'artisan' and activity_id in
--     ('bury_bone_chips','consecrate_grave_dust','offer_razor_claw',
--      'scatter_vamp_dust','banish_demon_shard','unbind_wraith_veil',
--      'consecrate_dragon_scale','release_lich_soul','offer_ancient_claw',
--      'purge_void_chitin');
--   update public.hr_items set req_skill = null, req_lv = null where item_id in
--     ('alpha_cloak','gold_ring','gold_amulet','fox_companion','copper_ring',
--      'hunter_necklace','traveler_cape');
-- A character left pointing at a deleted activity is NOT stranded: hr_apply
-- refuses the next declaration, and accrual's `unknown_recipe` arm refuses to
-- pay rather than throwing (see accrual.js REFUSING). Re-applying the catalogue
-- from a commit before this branch has the same effect.
--
-- IT DOES NOT STRIP A WORN SLOT. hr_apply checks a wield requirement on the
-- EQUIP and never re-checks the worn set, so a character already wearing one of
-- the seven keeps it — deliberate, as in the 2026-09-12 file.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED ROWS ──────────────────────────────────────────────────────
-- Two statements, both idempotent, both preceded by an EXISTENCE check: an
-- UPDATE that matches nothing is silent, and this file's whole job is columns
-- and rows that stop being absent. No begin/commit (CLAUDE.md §2 —
-- tools/apply-migration.mjs sends the file as one batch).
do $$
declare
  v_missing text;
  v_rows    int;
  -- (a) activity_id · req_lv. The bench is `prayer` for all ten, so it is not
  --     repeated per row; §2(a) asserts it from a restated literal anyway.
  v_pray constant jsonb := '[
    ["bury_bone_chips",40],        ["consecrate_grave_dust",46],
    ["offer_razor_claw",52],       ["scatter_vamp_dust",58],
    ["banish_demon_shard",65],     ["unbind_wraith_veil",72],
    ["consecrate_dragon_scale",79],["release_lich_soul",86],
    ["offer_ancient_claw",92],     ["purge_void_chitin",99]
  ]'::jsonb;
  -- The drop each rung consumes. NOT a server rule — the engine reads the input
  -- from the edge payload — but every one must be a catalogue item or the
  -- inventory debit has no row to name, so §2(c) asserts they exist.
  v_inputs constant text[] := array[
    'bone_chips','grave_dust','razor_claw','vamp_dust','demon_shard',
    'wraith_veil','dragon_scale','lich_soul','ancient_claw','void_chitin'];
  -- (b) item_id · req_skill · req_lv.
  v_gear constant jsonb := '[
    ["alpha_cloak","defense",30],  ["gold_ring","defense",30],
    ["gold_amulet","defense",30],  ["fox_companion","defense",15],
    ["copper_ring","defense",1],   ["hunter_necklace","defense",1],
    ["traveler_cape","defense",1]
  ]'::jsonb;
begin
  if jsonb_array_length(v_pray) <> 10 or jsonb_array_length(v_gear) <> 7 then
    raise exception '§1: the rule holds %/% rows, the ruling names 10 prayer rungs and 7 items',
      jsonb_array_length(v_pray), jsonb_array_length(v_gear);
  end if;

  -- PRECONDITIONS. `prayer` must be a real skill or every new rung is an
  -- activity nobody can ever start (hr_apply compares against a player_skills
  -- row that can never exist); the seven item ids must EXIST.
  if not exists (select 1 from public.hr_skills where skill_id = 'prayer') then
    raise exception '§1: hr_skills has no `prayer` row — apply '
                    '2026-08-11-catalogue.generated.sql first';
  end if;
  select string_agg(r.item_id, ', ' order by r.item_id) into v_missing
    from jsonb_array_elements(v_gear) e
    cross join lateral (select e->>0 as item_id) r
   where not exists (select 1 from public.hr_items i where i.item_id = r.item_id);
  if v_missing is not null then
    raise exception '§1: hr_items has no row for % — the catalogue is older than this file. '
                    'Re-apply 2026-08-11-catalogue.generated.sql first.', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(v_inputs) x
   where not exists (select 1 from public.hr_items i where i.item_id = x);
  if v_missing is not null then
    raise exception '§1: a Prayer rung consumes %, which is not a catalogue item — the sink '
                    'would have nothing to debit', v_missing;
  end if;

  -- (a) TEN ARTISAN ROWS. `on conflict do update` rather than plain insert so a
  --     re-apply after a retune lands the new req_lv instead of failing on the
  --     primary key. max_hp/is_boss are restated (not defaulted) because a
  --     non-combat row carrying either is asserted against in the catalogue's
  --     own self-check.
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  select 'artisan', r.activity_id, 'prayer', r.req_lv, null, false
    from jsonb_array_elements(v_pray) e
    cross join lateral (select e->>0 as activity_id, (e->>1)::int as req_lv) r
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'prayer-ladder §1(a): % of 10 activity rows moved (0 on a re-apply)', v_rows;

  -- (b) SEVEN ITEM GATES.
  update public.hr_items i
     set req_skill = r.req_skill, req_lv = r.req_lv
    from jsonb_array_elements(v_gear) e
    cross join lateral (select e->>0 as item_id, e->>1 as req_skill, (e->>2)::int as req_lv) r
   where i.item_id = r.item_id
     and (i.req_skill is distinct from r.req_skill or i.req_lv is distinct from r.req_lv);
  get diagnostics v_rows = row_count;
  raise notice 'prayer-ladder §1(b): % of 7 item gates moved (0 on a re-apply)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim is proved by EXECUTING it, never by a marker or a string match on
-- a body. The apply is atomic, so a raise here reverts §1. The row-writing probe
-- runs in a subtransaction discarded by the HR812 sentinel, so this block is
-- net-zero on production and §2 of CLAUDE.md ("player state is never
-- fabricated") holds: no probe row survives.
do $$
declare
  v_bad   text;
  v_r     jsonb;
  v_ver   bigint;
  v_n     int;
  v_xp39  bigint;
  v_xp40  bigint;
  v_uid   constant uuid := '00000000-0000-4000-8000-0000b5440001';
  c_j     constant jsonb := '{"kind":"admin","intent":"b544:prayer-probe"}'::jsonb;
begin
  -- (a) THE TEN RUNGS EXIST WITH THE RULED BENCH AND LEVEL. The literal is
  --     RESTATED here (not read from §1) so a hand-edit that dropped a row from
  --     §1 cannot also silence its own check. The count is the CONTROL: the join
  --     below is INNER, so a MISSING row would pass the value check in silence.
  select count(*),
         string_agg(a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL')
                      || ' (want prayer/' || x.req_lv || ')', ', ' order by a.activity_id)
           filter (where a.req_skill is distinct from 'prayer'
                      or a.req_lv is distinct from x.req_lv
                      or a.max_hp is not null or a.is_boss)
    into v_n, v_bad
    from (values
      ('bury_bone_chips',40),('consecrate_grave_dust',46),('offer_razor_claw',52),
      ('scatter_vamp_dust',58),('banish_demon_shard',65),('unbind_wraith_veil',72),
      ('consecrate_dragon_scale',79),('release_lich_soul',86),('offer_ancient_claw',92),
      ('purge_void_chitin',99)
    ) as x(activity_id, req_lv)
    join public.hr_activities a
      on a.kind = 'artisan' and a.activity_id = x.activity_id;
  if v_n <> 10 then
    raise exception 'GATE(a) CONTROL: hr_activities holds % of the 10 Prayer rungs — every '
                    'missing one is a tile the client offers and the realm answers '
                    'unknown_activity for', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a Prayer rung did not land as ruled: %', v_bad;
  end if;

  -- The ladder must be STRICTLY INCREASING across the whole bench, old rows
  -- included. A rung out of order is the b348 defect class: a harder offering
  -- reachable before an easier one, which the client renders as a locked tile
  -- above an unlocked one and no guard would otherwise catch.
  select string_agg(activity_id || '@' || req_lv, ' → ' order by req_lv, activity_id)
    into v_bad
    from public.hr_activities
   where kind = 'artisan' and req_skill = 'prayer'
     and req_lv is null;
  if v_bad is not null then
    raise exception 'GATE(a2): a prayer rung has a NULL req_lv (%) — hr_apply short-circuits its '
                    'whole gate on NULL, so that rung is ungated', v_bad;
  end if;
  select count(*) into v_n from (
    select req_lv, count(*) as c from public.hr_activities
     where kind = 'artisan' and req_skill = 'prayer'
     group by req_lv having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'GATE(a2): % prayer level(s) carry more than one rung — the bench ladder is '
                    'no longer one rung per level', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'artisan' and req_skill = 'prayer';
  if v_n <> 13 then
    raise exception 'GATE(a3): the prayer bench holds % rungs, the ruling leaves 13 (3 shipped + '
                    '10 new). A 14th means a row was added without the ladder being re-read', v_n;
  end if;

  -- (b) THE SEVEN ITEM GATES, restated literally for the same reason.
  select count(*),
         string_agg(i.item_id || '=' || coalesce(i.req_skill,'NULL') || '/'
                      || coalesce(i.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', ' order by i.item_id)
           filter (where i.req_skill is distinct from x.req_skill
                      or i.req_lv is distinct from x.req_lv)
    into v_n, v_bad
    from (values
      ('alpha_cloak','defense',30),('gold_ring','defense',30),('gold_amulet','defense',30),
      ('fox_companion','defense',15),('copper_ring','defense',1),
      ('hunter_necklace','defense',1),('traveler_cape','defense',1)
    ) as x(item_id, req_skill, req_lv)
    join public.hr_items i on i.item_id = x.item_id;
  if v_n <> 7 then
    raise exception 'GATE(b) CONTROL: hr_items holds % of the 7 ruled ids', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(b): the ruled item gates did not land: %', v_bad;
  end if;

  -- The 34 rows the PREVIOUS file gated must still be gated. This file
  -- regenerates the same catalogue, so a bad merge could take them back out and
  -- nothing else here would notice.
  select count(*) into v_n from public.hr_items
   where item_id in ('slagheart_platebody','regent_helm','abyssal_greaves','warden_girdle',
                     'choirbone_gauntlets','wyrmgilt_mantle')
     and req_skill = 'defense' and req_lv = 88;
  if v_n <> 6 then
    raise exception 'GATE(b2): only % of the 6 tier-8 uniques still carry defense/88 — '
                    '2026-09-12-equippable-req-lv.sql has been undone, and those six are '
                    'TRADEABLE (a level-1 buyer wears 120 defence)', v_n;
  end if;

  -- No row in hr_items may ask for a level the XP table cannot reach — derived
  -- from the table, so the day the cap moves this assertion moves with it.
  select string_agg(item_id || '=' || req_lv, ', ') into v_bad
    from public.hr_items
   where req_lv is not null
     and (req_lv < 1 or req_lv > coalesce((select max(level) from public.hr_xp_table), 0));
  if v_bad is not null then
    raise exception 'GATE(b3): req_lv is below 1 or above the highest level hr_xp_table reaches '
                    '(%) — the item is permanently unwearable: %',
                    (select max(level) from public.hr_xp_table), v_bad;
  end if;

  -- (c) EVERY RUNG'S INPUT IS A CATALOGUE ITEM. A sink whose input has no
  --     hr_items row has nothing to debit, and the drop could never be priced.
  select string_agg(x, ', ' order by x) into v_bad
    from unnest(array['bone_chips','grave_dust','razor_claw','vamp_dust','demon_shard',
                      'wraith_veil','dragon_scale','lich_soul','ancient_claw','void_chitin']) x
   where not exists (select 1 from public.hr_items i where i.item_id = x);
  if v_bad is not null then
    raise exception 'GATE(c): a Prayer rung consumes a non-catalogue item: %', v_bad;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES A PRAYER-39 CHARACTER `bury_bone_chips`
  --     (req 40) AND ACCEPTS IT AT 40. This is the property the ten rows exist
  --     for and the one the catalogue alone cannot prove — before §1 the same
  --     call answers `unknown_activity`, which is a refusal for the WRONG
  --     reason, and after a mis-typed req_lv it would answer `ok` at 39.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_xp39 from public.hr_xp_table where level = 39;
  select xp into v_xp40 from public.hr_xp_table where level = 40;
  if v_xp39 is null or v_xp40 is null or v_xp40 <= v_xp39 then
    raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable 39/40 rungs (%/%)',
      v_xp39, v_xp40;
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    -- Prayer 39: one level short of the first new rung.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'prayer', v_xp39)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_from_xp(v_xp39) <> 39 then
      raise exception 'GATE(d) CANNOT RUN: % xp is level %, not 39',
        v_xp39, public.hr_level_from_xp(v_xp39);
    end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','bury_bone_chips','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d): Prayer 39 declaring bury_bone_chips answered % — it must be '
                      'activity_locked. `unknown_activity` means §1(a) did not land; `ok` means '
                      'the rung is off its ruled level and the top of the bench is free', v_r;
    end if;
    if (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle' then
      raise exception 'GATE(d): the refused declaration still moved player_state.active_kind';
    end if;

    -- POSITIVE CONTROL #1 — the SAME character, the SAME verb, the OLD rung it
    -- HAS the level for (`bury_dragon`, req 35). Without this a build that broke
    -- artisan declarations outright would "pass" the refusal above and prove
    -- nothing about the level.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','bury_dragon','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Prayer 39 was refused bury_dragon (req 35) — % — so '
                      'artisan declarations are broken and the refusal above measured nothing', v_r;
    end if;

    -- POSITIVE CONTROL #2 — ONE level of Prayer is the whole difference. Same
    -- character, same id, xp raised to the level-40 rung.
    update public.player_skills set xp = v_xp40
     where user_id = v_uid and slot = 0 and skill_id = 'prayer';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','bury_bone_chips','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Prayer 40 was still refused bury_bone_chips (%) — the '
                      'rung is gated ABOVE its ruled level and the ladder is unreachable', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'bury_bone_chips' then
      raise exception 'GATE(d) CONTROL: the accepted declaration did not become the live pointer';
    end if;

    -- (e) EXECUTED: the SEVEN ITEM GATES bite on the one that is not level 1.
    --     `fox_companion` is Defence 15 and the probe has Defence 1; it is also
    --     the row whose TYPE the client had to learn, so the server half is
    --     asserted here rather than assumed from the column.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'fox_companion', 1), (v_uid, 0, 'traveler_cape', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('companion','fox_companion'),
                                'journal', c_j));
    if v_r->>'error' is distinct from 'requirement_not_met'
       or v_r->>'item_id' is distinct from 'fox_companion' then
      raise exception 'GATE(e): a Defence-1 character equipping fox_companion answered % — it '
                      'must be requirement_not_met/fox_companion. The fox is TRADEABLE and sold '
                      'off the storefront at 1200g, so without the gate gold buys the stat', v_r;
    end if;
    if exists (select 1 from public.player_equipment
                where user_id = v_uid and slot = 0 and equip_slot = 'companion') then
      raise exception 'GATE(e): the refused equip still wrote player_equipment';
    end if;

    -- POSITIVE CONTROL — the SAME character wearing a `req_lv 1` row from the
    -- same seven. This is what proves req_lv 1 restricts NOBODY (the ruling's
    -- claim) rather than quietly locking three storefront items behind a level
    -- a new account does not have.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('cape','traveler_cape'),
                                'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e) CONTROL: a Defence-1 character was refused traveler_cape (req_lv 1) '
                      '— % — so req_lv 1 is NOT the no-op the ruling says it is', v_r;
    end if;

    raise exception using errcode = 'HR812',
      message = 'prayer-ladder-and-item-gates §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character into production as a
  -- side effect of verifying itself, which CLAUDE.md §2 forbids outright.
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'prayer-ladder-and-item-gates: 13 prayer rungs 1..99 one per level, 7 item gates '
               'landed, the 6 tier-8 uniques still defense/88, hr_apply refuses Prayer 39 the '
               'level-40 rung and accepts it at 40, and refuses a Defence-1 fox_companion while '
               'still accepting a req_lv-1 cape — all green';
end $$;
