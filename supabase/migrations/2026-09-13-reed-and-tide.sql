-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-reed-and-tide.sql
--
-- ONE DATA CLOSURE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT, NO VALUE MOVED:
--
--   §1(a) TEN new `hr_items` rows — four raw fish, four cooked fish and two
--         multi-input dishes ("Reed & Tide", game-designer ruling 2026-09-13).
--   §1(b) TEN new `hr_activities` rows — four `gather`/fishing nodes at req
--         24/28/32/36 and six `artisan`/cooking rows at req 18/21/24/27/52/56.
--   §1(c) SIX new `hr_feast_foods` rows — the Tavern/feast heal projection for
--         the six cooked outputs (the four raws are NOT feast food, same rule
--         as every other raw fish: they carry `heals` but no `foodClass`).
--
-- ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
-- `FISH_SPOTS` ran Trout(20) → Lobster(40): one rung per TWENTY levels,
-- straight through the band where a player is learning fish → cook → eat →
-- fight. Four rungs at 24/28/32/36 make it a rung every four levels, and six
-- cooking rows turn each catch into a provision instead of vendor fodder.
-- Measured on the two standing ladder guards before a row was written: the
-- xp/sec steps are +8.0% / +11.1% / +12.1% / +11.8% / +10.8%, strictly
-- climbing, and every req gap is 4 — so none of them is a "full tier" unlock
-- owing b390's ≥6% margin, while the 20→40 jump that WAS one is now five short
-- steps with the same product.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
-- Three different server surfaces read three different halves of a new food,
-- and a row missing from ANY of them is a silent player-visible bug:
--
--   hr_activities   hr_apply's activity arm (2026-08-11-apply-engine.sql §4a)
--                   refuses an id with no row (`unknown_activity`) and
--                   re-checks req_skill/req_lv against SERVER xp
--                   (`activity_locked`). These ten rows ARE the server half of
--                   "the tile can be started".
--   hr_items        `heals` + `auto_eatable` are the AUTO-EAT POOL. hr_rest and
--                   the cadence/recovery arm (2026-09-06-recovering-until.sql
--                   §(d), 2026-09-06-cadence-recovery-floor.sql) select
--                   `join hr_items on auto_eatable and heals > 0 order by heals
--                   asc`. A food that exists only client-side HEALS NOTHING
--                   AWAY — it is in the bag and the engine cannot see it.
--   hr_feast_foods  the Tavern's server-authoritative heal value
--                   (2026-08-27-clan-economy-sinks.sql). Never the client's
--                   number. tests/clan-feast-catalogue-drift.mjs fails if this
--                   seed and src/data/items.js disagree in either direction.
--
-- ⚠ `xp`, `ms` AND THE RECIPE INPUTS ARE NOT IN THIS DATABASE, AND ARE NOT
--   ASSERTED HERE. `hr_activities` holds (kind, activity_id, req_skill, req_lv,
--   max_hp, is_boss) — no yield columns, no input list; a node's XP/action time
--   and a recipe's input map reach the server through the EDGE PAYLOAD, which
--   imports src/data/{gathering,recipes}.js directly
--   (supabase/functions/hr-accrue/catalogue.js). §2 therefore asserts the
--   columns the DATABASE owns, exactly, and the xp/ms/input half is pinned by
--   the in-page tests (the b226/b390 ladder guards and the new "player actions"
--   happy path in src/features/smoke-test.js). Do NOT "improve" this file by
--   hand-copying the XP numbers into SQL: that is the data double-copy this
--   repo has been burned by twice, and here the copy would be a FAUCET.
--
--   CONSEQUENCE FOR THE CUT: hr-accrue MUST be redeployed with the client push
--   that carries these rows, or an away window on a new node/recipe resolves
--   against a payload that has never heard of it (`unknown_node` /
--   `unknown_recipe`, REFUSED — it fails closed, which is why this is a
--   deploy-order note and not a P0).
--
-- ZERO ENGINE CODE WAS WRITTEN, and that is the test that these are data. The
-- four single-fish recipes use the SINGULAR `input` field like every fish
-- sibling; the two dishes use `inputs:{}` like cook_veg_stew / cook_bear_pie.
-- Both shapes are read by the ONE helper src/core/artisan.js `recipeInputs`,
-- which the edge imports, so the combos debit three inventory rows away with no
-- second code path.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ────────────────
-- 2026-08-11-catalogue.generated.sql (same branch, regenerated: digest
-- 66e829e6…, 529 items was 519, 493 activities was 483) carries §1(a) and
-- §1(b) durably — it DELETEs and re-INSERTs hr_items and hr_activities
-- wholesale. But it is re-applied on its own cadence and moves 529 item rows,
-- 275 slot pairs, 493 activities and the start kit with it, and it does NOT
-- touch hr_feast_foods at all. This file moves exactly 26 rows, is idempotent,
-- and can be applied on its own at the cut. Apply either and hr_items /
-- hr_activities land in the same state; §2 asserts the ruled values from
-- RESTATED literals, so the two records cannot drift apart in silence.
--
-- ⚠ ORDER: apply this BEFORE the client push that offers the tiles. Applied
--   first it is invisible — nothing declares an activity id the client does not
--   render, and an unsold item nobody owns is inert. Pushed first, a player who
--   clicks Reed Pike Pool is refused `unknown_activity` by the realm: no
--   corruption, but a visible dead button.
--
-- REVERSIBILITY (net-zero, no value to claw back):
--   delete from public.hr_feast_foods where item_id in
--     ('cooked_pikeperch','cooked_copper_crab','cooked_silverfin',
--      'cooked_goldgill','river_chowder','fishers_pie');
--   delete from public.hr_activities where (kind, activity_id) in
--     (('gather','pikeperch_s'),('gather','copper_crab_s'),
--      ('gather','silverfin_s'),('gather','goldgill_s'),
--      ('artisan','cook_pikeperch'),('artisan','cook_copper_crab'),
--      ('artisan','cook_silverfin'),('artisan','cook_goldgill'),
--      ('artisan','cook_river_chowder'),('artisan','cook_fishers_pie'));
--   delete from public.hr_items where item_id in
--     ('pikeperch','cooked_pikeperch','copper_crab','cooked_copper_crab',
--      'silverfin','cooked_silverfin','goldgill','cooked_goldgill',
--      'river_chowder','fishers_pie');
-- The hr_items delete is the one with a caveat and it is deliberate: once a
-- player HAS caught a pikeperch, `player_inventory` holds a row the catalogue
-- no longer names, and the vendor/market/auto-eat readers all join hr_items —
-- they would stop seeing it rather than mis-price it. So the honest rollback
-- after any play is the first two deletes only (the tiles disappear, the stack
-- sits inert), exactly as re-applying the catalogue from a commit before this
-- branch would leave it. A character left pointing at a deleted activity is NOT
-- stranded: hr_apply refuses the next declaration and accrual refuses to pay
-- rather than throwing.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED ROWS ──────────────────────────────────────────────────────
-- Three statements, all idempotent, all preceded by EXISTENCE checks. No
-- begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends the file as one
-- batch).
do $$
declare
  v_missing text;
  v_rows    int;
  -- (a) item_id · name · value · heals · auto_eatable. `tradeable` is true for
  --     all ten (the ruling: all tradeable, no bop) and req_skill/req_lv are
  --     NULL — none of these is equippable. `auto_eatable` is NOT "heals > 0":
  --     fishers_pie is a FEAST (foodClass 'buff') and auto-eat must never spend
  --     it, which is the one row in this batch that proves the column is not a
  --     derivation of `heals` (2026-08-15-auto-eat.sql §(d) asserts exactly
  --     that property globally).
  --
  --     ⚠ THE FOUR RAWS ARE auto_eatable = TRUE, and that is not a typo. The
  --       generated catalogue says the same, from the same rule: foodClassOf()
  --       in src/data/items.js returns 'healing' for any item carrying `heals`
  --       and no explicit foodClass, so EVERY raw fish in the game (shrimp,
  --       trout, lobster, shark, herring, swordfish…) is in the auto-eat pool,
  --       and these four are consistent with their siblings. The ONE row that
  --       differs is fishers_pie, and it is what proves the column is not a
  --       derivation of `heals`. Both records state the same ten answers, so
  --       §2(a2) can assert all ten and patch-then-catalogue and
  --       catalogue-then-patch land in the same place.
  v_items constant jsonb := '[
    ["pikeperch",          "Raw Pikeperch",         27,  8, true ],
    ["cooked_pikeperch",   "Grilled Pikeperch",     75, 16, true ],
    ["copper_crab",        "Copper Crab",           37,  9, true ],
    ["cooked_copper_crab", "Steamed Copper Crab",  100, 18, true ],
    ["silverfin",          "Raw Silverfin",         51, 10, true ],
    ["cooked_silverfin",   "Silverfin Fillet",     135, 21, true ],
    ["goldgill",           "Raw Goldgill",          71, 11, true ],
    ["cooked_goldgill",    "Goldgill Steak",       180, 23, true ],
    ["river_chowder",      "River Chowder",        380, 30, true ],
    ["fishers_pie",        "Fisher''s Pie",        520, 34, false]
  ]'::jsonb;
  -- (b) kind · activity_id · req_skill · req_lv.
  v_acts constant jsonb := '[
    ["gather", "pikeperch_s",       "fishing", 24],
    ["gather", "copper_crab_s",     "fishing", 28],
    ["gather", "silverfin_s",       "fishing", 32],
    ["gather", "goldgill_s",        "fishing", 36],
    ["artisan","cook_pikeperch",    "cooking", 18],
    ["artisan","cook_copper_crab",  "cooking", 21],
    ["artisan","cook_silverfin",    "cooking", 24],
    ["artisan","cook_goldgill",     "cooking", 27],
    ["artisan","cook_river_chowder","cooking", 52],
    ["artisan","cook_fishers_pie",  "cooking", 56]
  ]'::jsonb;
  -- What the two multi-input dishes consume. NOT a server rule — the engine
  -- reads the input map from the edge payload — but every id must be a
  -- catalogue item or the inventory debit has no row to name.
  v_inputs constant text[] := array['silverfin','goldgill','potato','carrot','wheat'];
begin
  if jsonb_array_length(v_items) <> 10 or jsonb_array_length(v_acts) <> 10 then
    raise exception '§1: the rule holds %/% rows, the ruling names 10 items and 10 activities',
      jsonb_array_length(v_items), jsonb_array_length(v_acts);
  end if;

  -- PRECONDITIONS. `fishing` and `cooking` must be real skills or every new row
  -- is an activity nobody can ever start (hr_apply compares against a
  -- player_skills row that can never exist).
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['fishing','cooking']) x
   where not exists (select 1 from public.hr_skills where skill_id = x);
  if v_missing is not null then
    raise exception '§1: hr_skills has no `%` row — apply '
                    '2026-08-11-catalogue.generated.sql first', v_missing;
  end if;
  -- hr_feast_foods must exist, or §1(c) is the silent half of this file.
  if to_regclass('public.hr_feast_foods') is null then
    raise exception '§1: public.hr_feast_foods is missing — apply '
                    '2026-08-27-clan-economy-sinks.sql first';
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(v_inputs) x
   where not exists (select 1 from public.hr_items i where i.item_id = x)
     and not exists (select 1 from jsonb_array_elements(v_items) e where e->>0 = x);
  if v_missing is not null then
    raise exception '§1: a Reed & Tide dish consumes %, which is not a catalogue item and is '
                    'not created by this file — the debit would have nothing to name', v_missing;
  end if;

  -- (a) TEN ITEM ROWS. `on conflict do update` rather than a plain insert so a
  --     re-apply after a re-value lands the new number instead of failing on
  --     the primary key.
  insert into public.hr_items
      (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable)
  select r.item_id, r.name, true, null, r.value, null, null, r.heals, r.auto_eatable
    from jsonb_array_elements(v_items) e
    cross join lateral (select e->>0 as item_id, e->>1 as name, (e->>2)::bigint as value,
                               (e->>3)::int as heals, (e->>4)::boolean as auto_eatable) r
      on conflict (item_id) do update
         set name = excluded.name, tradeable = excluded.tradeable,
             value = excluded.value, heals = excluded.heals,
             auto_eatable = excluded.auto_eatable
       where public.hr_items.name  is distinct from excluded.name
          or public.hr_items.value is distinct from excluded.value
          or public.hr_items.heals is distinct from excluded.heals
          or public.hr_items.tradeable is distinct from excluded.tradeable
          or public.hr_items.auto_eatable is distinct from excluded.auto_eatable;
  get diagnostics v_rows = row_count;
  raise notice 'reed-and-tide §1(a): % of 10 item rows moved (0 on a re-apply)', v_rows;

  -- (b) TEN ACTIVITY ROWS. max_hp/is_boss are RESTATED (not defaulted) because
  --     the catalogue's own self-check asserts a non-combat row carries neither.
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  select r.kind, r.activity_id, r.req_skill, r.req_lv, null, false
    from jsonb_array_elements(v_acts) e
    cross join lateral (select e->>0 as kind, e->>1 as activity_id,
                               e->>2 as req_skill, (e->>3)::int as req_lv) r
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'reed-and-tide §1(b): % of 10 activity rows moved (0 on a re-apply)', v_rows;

  -- (c) SIX FEAST ROWS. Written as a LITERAL `values` list, not as a fold over
  --     a jsonb variable like (a)/(b): tests/clan-feast-catalogue-drift.mjs
  --     PARSES this statement out of the file text and compares it to
  --     src/data/items.js, and a guard that cannot read the seed is not a
  --     guard. Same shape as the original seed in
  --     2026-08-27-clan-economy-sinks.sql, which that guard also reads.
  insert into public.hr_feast_foods (item_id, heals) values
    ('cooked_pikeperch', 16),   ('cooked_copper_crab', 18), ('cooked_silverfin', 21),
    ('cooked_goldgill', 23),    ('river_chowder', 30),      ('fishers_pie', 34)
      on conflict (item_id) do update set heals = excluded.heals
       where public.hr_feast_foods.heals is distinct from excluded.heals;
  get diagnostics v_rows = row_count;
  raise notice 'reed-and-tide §1(c): % of 6 feast rows moved (0 on a re-apply)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim is proved by EXECUTING it, never by a marker or a string match on
-- a body. The apply is atomic, so a raise here reverts §1. The row-writing
-- probes run in a subtransaction discarded by the HR812 sentinel, so this block
-- is net-zero on production and §2 of CLAUDE.md ("player state is never
-- fabricated") holds: no probe row survives.
do $$
declare
  v_bad     text;
  v_r       jsonb;
  v_ver     bigint;
  v_n       int;
  v_xp23    bigint;
  v_xp24    bigint;
  v_max     int;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000b5440002';
  c_j       constant jsonb := '{"kind":"admin","intent":"b544:reed-tide-probe"}'::jsonb;
begin
  -- (a) THE TEN ITEMS EXIST WITH THE RULED NAME, VALUE AND HEAL. The literal is
  --     RESTATED here (not read from §1) so a hand-edit that dropped a row from
  --     §1 cannot also silence its own check. The count is the CONTROL: the join
  --     is INNER, so a MISSING row would pass the value filter in silence.
  select count(*),
         string_agg(i.item_id || '=' || i.name || '/' || i.value || '/'
                      || coalesce(i.heals::text,'NULL')
                      || ' (want ' || x.name || '/' || x.value || '/' || x.heals || ')',
                    ', ' order by i.item_id)
           filter (where i.name  is distinct from x.name
                      or i.value is distinct from x.value
                      or i.heals is distinct from x.heals
                      or not i.tradeable
                      or i.req_skill is not null or i.req_lv is not null)
    into v_n, v_bad
    from (values
      ('pikeperch','Raw Pikeperch',27::bigint,8),
      ('cooked_pikeperch','Grilled Pikeperch',75::bigint,16),
      ('copper_crab','Copper Crab',37::bigint,9),
      ('cooked_copper_crab','Steamed Copper Crab',100::bigint,18),
      ('silverfin','Raw Silverfin',51::bigint,10),
      ('cooked_silverfin','Silverfin Fillet',135::bigint,21),
      ('goldgill','Raw Goldgill',71::bigint,11),
      ('cooked_goldgill','Goldgill Steak',180::bigint,23),
      ('river_chowder','River Chowder',380::bigint,30),
      ('fishers_pie','Fisher''s Pie',520::bigint,34)
    ) as x(item_id, name, value, heals)
    join public.hr_items i on i.item_id = x.item_id;
  if v_n <> 10 then
    raise exception 'GATE(a) CONTROL: hr_items holds % of the 10 Reed & Tide ids — every missing '
                    'one is an item the client can put in a bag that the vendor, the market and '
                    'auto-eat all join hr_items to read, and therefore cannot see', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a Reed & Tide item did not land as ruled: %', v_bad;
  end if;

  -- (a2) THE AUTO-EAT FLAG, all ten rows. Nine are TRUE (they are the auto-eat
  --      pool; a FALSE on any of them is food that heals nothing away) and
  --      `fishers_pie` is FALSE — a Feast auto-eat may never spend, the b220
  --      design law, and the one row that proves this column is not a
  --      derivation of `heals`.
  select string_agg(i.item_id || '=' || i.auto_eatable || ' (want ' || x.want || ')',
                    ', ' order by i.item_id)
    into v_bad
    from (values
      ('pikeperch',true),('cooked_pikeperch',true),('copper_crab',true),
      ('cooked_copper_crab',true),('silverfin',true),('cooked_silverfin',true),
      ('goldgill',true),('cooked_goldgill',true),('river_chowder',true),
      ('fishers_pie',false)
    ) as x(item_id, want)
    join public.hr_items i on i.item_id = x.item_id
   where i.auto_eatable is distinct from x.want;
  if v_bad is not null then
    raise exception 'GATE(a2): the auto-eat flag is wrong on %. A false on a provision is food '
                    'the away engine cannot see; a true on fishers_pie means auto-eat can spend '
                    'a 600s damage Feast to top off 34 hp', v_bad;
  end if;

  -- (b) THE TEN ACTIVITY ROWS, restated literally for the same reason.
  select count(*),
         string_agg(a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', '
                    order by a.activity_id)
           filter (where a.req_skill is distinct from x.req_skill
                      or a.req_lv is distinct from x.req_lv
                      or a.max_hp is not null or a.is_boss)
    into v_n, v_bad
    from (values
      ('gather','pikeperch_s','fishing',24),('gather','copper_crab_s','fishing',28),
      ('gather','silverfin_s','fishing',32),('gather','goldgill_s','fishing',36),
      ('artisan','cook_pikeperch','cooking',18),('artisan','cook_copper_crab','cooking',21),
      ('artisan','cook_silverfin','cooking',24),('artisan','cook_goldgill','cooking',27),
      ('artisan','cook_river_chowder','cooking',52),('artisan','cook_fishers_pie','cooking',56)
    ) as x(kind, activity_id, req_skill, req_lv)
    join public.hr_activities a on a.kind = x.kind and a.activity_id = x.activity_id;
  if v_n <> 10 then
    raise exception 'GATE(b) CONTROL: hr_activities holds % of the 10 new rows — every missing '
                    'one is a tile the client offers and the realm answers unknown_activity for',
                    v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(b): a Reed & Tide activity did not land as ruled: %', v_bad;
  end if;

  -- (b2) THE FISHING BENCH IS STILL ONE RUNG PER LEVEL AND NONE OF THEM IS
  --      UNGATED. A NULL req_lv short-circuits hr_apply's whole gate, and two
  --      rungs on the same level is the b348 defect class (the client renders a
  --      locked tile above an unlocked one). Asserted over the WHOLE bench, old
  --      rows included, because this file inserts into the middle of it.
  select string_agg(activity_id, ', ' order by activity_id) into v_bad
    from public.hr_activities
   where kind = 'gather' and req_skill = 'fishing' and req_lv is null;
  if v_bad is not null then
    raise exception 'GATE(b2): a fishing node has a NULL req_lv (%) — hr_apply short-circuits '
                    'its gate on NULL, so that node is ungated', v_bad;
  end if;
  select count(*) into v_n from (
    select req_lv from public.hr_activities
     where kind = 'gather' and req_skill = 'fishing'
     group by req_lv having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'GATE(b2): % fishing level(s) carry more than one node — the bench ladder is '
                    'no longer one rung per level', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'gather' and req_skill = 'fishing';
  if v_n <> 12 then
    raise exception 'GATE(b3): the fishing bench holds % nodes, the ruling leaves 12 (8 shipped + '
                    '4 new). A 13th means a node was added without the ladder being re-read', v_n;
  end if;
  select count(*) into v_n from public.hr_activities
   where kind = 'artisan' and req_skill = 'cooking';
  if v_n <> 35 then
    raise exception 'GATE(b3): the cooking bench holds % rows, the ruling leaves 35 (29 shipped '
                    '+ 6 new — counted off the regenerated catalogue, which includes the castle '
                    'and review-book cooking rows, not only BASE_RECIPES.cooking)', v_n;
  end if;

  -- (c) THE FEAST PROJECTION AGREES WITH hr_items, ROW FOR ROW. Two heal
  --     numbers in two tables that can disagree eventually will, and the
  --     Tavern's meter moves on THIS one.
  select count(*),
         string_agg(f.item_id || ': feast ' || f.heals || ' vs item '
                      || coalesce(i.heals::text,'NULL'), ', ' order by f.item_id)
           filter (where f.heals is distinct from i.heals)
    into v_n, v_bad
    from public.hr_feast_foods f
    join public.hr_items i on i.item_id = f.item_id
   where f.item_id in ('cooked_pikeperch','cooked_copper_crab','cooked_silverfin',
                       'cooked_goldgill','river_chowder','fishers_pie');
  if v_n <> 6 then
    raise exception 'GATE(c) CONTROL: hr_feast_foods holds % of the 6 new cooked foods — a '
                    'missing row is a dish the Tavern refuses to accept', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(c): the feast heal disagrees with the item heal: %', v_bad;
  end if;
  -- And the FOUR RAWS must NOT be feast food. The Tavern takes cooked food only
  -- (2026-08-27 design note); a raw fish in this table is a 4-second gather
  -- feeding a clan meter directly.
  select string_agg(item_id, ', ' order by item_id) into v_bad
    from public.hr_feast_foods
   where item_id in ('pikeperch','copper_crab','silverfin','goldgill');
  if v_bad is not null then
    raise exception 'GATE(c2): a RAW fish is feast-eligible (%) — the Tavern takes cooked food '
                    'only, or gathering feeds the clan meter with no cooking in between', v_bad;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES A FISHING-23 CHARACTER `pikeperch_s` (req
  --     24) AND ACCEPTS IT AT 24. This is the property the four gather rows
  --     exist for and the one the catalogue alone cannot prove — before §1 the
  --     same call answers `unknown_activity`, which is a refusal for the WRONG
  --     reason, and after a mis-typed req_lv it would answer `ok` at 23.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_xp23 from public.hr_xp_table where level = 23;
  select xp into v_xp24 from public.hr_xp_table where level = 24;
  if v_xp23 is null or v_xp24 is null or v_xp24 <= v_xp23 then
    raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable 23/24 rungs (%/%)',
      v_xp23, v_xp24;
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    -- Fishing 23: one level short of the first new rung.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'fishing', v_xp23)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_from_xp(v_xp23) <> 23 then
      raise exception 'GATE(d) CANNOT RUN: % xp is level %, not 23',
        v_xp23, public.hr_level_from_xp(v_xp23);
    end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','pikeperch_s','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d): Fishing 23 declaring pikeperch_s answered % — it must be '
                      'activity_locked. `unknown_activity` means §1(b) did not land; `ok` means '
                      'the node is off its ruled level and the rung is free', v_r;
    end if;
    if (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle' then
      raise exception 'GATE(d): the refused declaration still moved player_state.active_kind';
    end if;

    -- POSITIVE CONTROL #1 — the SAME character, the SAME verb, the OLD rung it
    -- HAS the level for (`trout_s`, req 20). Without this a build that broke
    -- gather declarations outright would "pass" the refusal above and prove
    -- nothing about the level.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','trout_s','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Fishing 23 was refused trout_s (req 20) — % — so gather '
                      'declarations are broken and the refusal above measured nothing', v_r;
    end if;

    -- POSITIVE CONTROL #2 — ONE level of Fishing is the whole difference. Same
    -- character, same id, xp raised to the level-24 rung.
    update public.player_skills set xp = v_xp24
     where user_id = v_uid and slot = 0 and skill_id = 'fishing';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','gather','id','pikeperch_s','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Fishing 24 was still refused pikeperch_s (%) — the node '
                      'is gated ABOVE its ruled level and the rung is unreachable', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'pikeperch_s' then
      raise exception 'GATE(d) CONTROL: the accepted declaration did not become the live pointer';
    end if;

    -- (e) EXECUTED: THE HEAL IS READABLE WHERE AUTO-EAT READS IT. `hr_rest` and
    --     the cadence/recovery arm share one query — `player_inventory join
    --     hr_items on auto_eatable and heals > 0 order by heals asc` — so
    --     driving hr_rest with EXACTLY ONE Grilled Pikeperch in the bag and
    --     EXACTLY 16 hp missing proves (1) the server can see the new food at
    --     all and (2) it is worth 16, not 0 and not the client's number. This
    --     is the assertion that a client-only food would fail: the item exists
    --     in items.js, the bag holds it, and the away engine heals nothing.
    --
    --     The bag is EMPTIED first: hr_create_character seeds the start kit,
    --     which contains food, and the loop eats the WEAKEST provision first —
    --     leave the kit in and this measures cooked_shrimp.
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'cooked_pikeperch', 1);
    -- A NEW CHARACTER HAS max_hp 10, which is LESS than one Grilled Pikeperch
    -- heals, so the deficit has to be made real first: the probe is raised to a
    -- 40-hp body sitting 16 short. (Measured, not assumed — the first replay of
    -- this file failed on exactly that, with max_hp 10.) This is a synthetic
    -- account inside the subtransaction the HR812 sentinel discards, so nothing
    -- about a real character's max HP is touched.
    v_max := 40;
    -- Back to idle with a FRESH watermark: GATE(d) left the character gathering,
    -- and hr_rest refuses `collect_first` once an unsettled window is open — a
    -- correct refusal that would measure nothing about the food.
    update public.player_state
       set max_hp = v_max, hp = v_max - 16, recovering_until = now() + interval '1 hour',
           active_kind = 'idle', active_id = null, accrued_to = now()
     where user_id = v_uid and slot = 0;
    v_r := public.hr_rest(0, gen_random_uuid());
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e): hr_rest with one Grilled Pikeperch and 16 hp missing answered % '
                      '— `insufficient_food` means the server cannot SEE the new food (hr_items '
                      'row missing or auto_eatable false), which is the "heals nothing away" bug',
                      v_r;
    end if;
    if (v_r->'rested'->>'healed_hp')::int <> 16
       or (v_r->'rested'->>'units')::int <> 1
       or v_r->'rested'->'spent' is distinct from '{"cooked_pikeperch": 1}'::jsonb then
      raise exception 'GATE(e): the rest healed % hp using % unit(s) of % — the ruled heal is 16 '
                      'from exactly one Grilled Pikeperch, so the auto-eat pool is reading a '
                      'different number than the catalogue holds',
        v_r->'rested'->>'healed_hp', v_r->'rested'->>'units', v_r->'rested'->'spent';
    end if;
    if exists (select 1 from public.player_inventory
                where user_id = v_uid and slot = 0 and item_id = 'cooked_pikeperch') then
      raise exception 'GATE(e): the rest healed but did not DEBIT the fish — a free heal';
    end if;

    -- POSITIVE CONTROL — the FEAST is NOT in that pool. Same character, same
    -- verb, one Fisher's Pie (heals 34, foodClass 'buff') and 16 hp missing:
    -- auto-eat must refuse rather than spend a 10-minute damage buff as a
    -- bandage (the b220 law). Without this control GATE(e) would pass just as
    -- happily on a build where auto_eatable had degenerated into `heals > 0`.
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'fishers_pie', 1);
    update public.player_state
       set max_hp = v_max, hp = v_max - 16, recovering_until = now() + interval '1 hour',
           active_kind = 'idle', active_id = null, accrued_to = now()
     where user_id = v_uid and slot = 0;
    v_r := public.hr_rest(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_food' then
      raise exception 'GATE(e) CONTROL: hr_rest with only a Fisher''s Pie answered % — it must '
                      'be insufficient_food. An ok here means auto-eat will spend Feasts', v_r;
    end if;
    if not exists (select 1 from public.player_inventory
                    where user_id = v_uid and slot = 0 and item_id = 'fishers_pie') then
      raise exception 'GATE(e) CONTROL: the refused rest still ate the Feast';
    end if;

    raise exception using errcode = 'HR812',
      message = 'reed-and-tide §2 complete — rolling back';
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

  raise notice 'reed-and-tide: 10 items, 10 activities (fishing 12 rungs one per level, cooking '
               '35 rows), 6 feast foods agreeing with hr_items, no raw fish feast-eligible, '
               'hr_apply refuses Fishing 23 the level-24 node and accepts it at 24, and hr_rest '
               'heals exactly 16 off one Grilled Pikeperch while refusing to spend a Fisher''s '
               'Pie — all green';
end $$;
