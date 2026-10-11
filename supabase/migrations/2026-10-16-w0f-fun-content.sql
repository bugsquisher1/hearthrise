-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-w0f-fun-content.sql
--
-- A DATA CLOSURE (§1/§2) PLUS ONE RAISE-ONLY FUNCTION RESTATEMENT (§3/§4).
-- NO NEW GRANT, NO NEW OBJECT:
--
--   §3    hr_claim_milestone__ungated restated VERBATIM from
--         2026-09-27-ledger-of-firsts.sql with ONE number changed: hunterAll
--         ("Bestiary Master", slay every monster) 108 -> 113, because five
--         monsters join the roster. Same reward, harder to reach. §4 walks it.
--
--   §1(a) EIGHT new `hr_items` rows —
--         three BOSS-FORGED body pieces, bind-on-pickup (tradeable = false):
--           elderscale_platebody (Defence 95), riftmaw_carapace (90),
--           voidheart_robe (90);
--         five FIELD-CHAMPION relics, tradeable like every field drop:
--           tusker_charm (8), packlord_band (22), mirewort_drops (38),
--           barrowking_mantle (52), jarls_rimetorc (66).
--   §1(b) NINE `hr_item_slots` pairs (packlord_band is a ring: ring1 + ring2).
--   §1(c) EIGHT `hr_activities` rows — three `artisan` recipes
--         (forge_elderscale_platebody smithing 97, craft_riftmaw_carapace and
--         weave_voidheart_robe crafting 95) and five `combat` rows, the field
--         champions (max_hp = the monster's hp, is_boss = false).
--   §1(d) FIVE `hr_bounty_monsters` rows — the champions' tier and hp, which
--         hr_credit_kills reads for its plausibility cap. WITHOUT these a
--         champion kill is refused credit (`unknown monster`).
--   §1(e) NINE `hr_crops.xp` values — every crop ×3 (Farming 99 within an EA
--         season: ~220–280 days of tending → ~75–95, src/data/gathering.js).
--
-- "W0 fun list" — game-designer ruling, coherence audit 2026-10-09 (docs/
-- planning/PRIORITY_BOARD.md), lane w0f. Data rows: src/data/boss-forge.js,
-- src/data/champions.js, src/data/monsters.js (5 appended rows),
-- src/data/gathering.js (CROPS). Guard: tests/w0f-fun-content.mjs (rules +
-- literal drift against THIS file + --selftest).
--
-- ── THE HOLES THIS CLOSES ──────────────────────────────────────────────────
--   1. Void Essence, Riftmaw Husk and Elderscale Heart crafted NOTHING. Each
--      now forges the best body piece of one armour line (plate / leather /
--      cloth), so every dungeon clear feeds a visible chase in every style.
--   2. Field bosses existed only at tier 6, so a fight-only player met nothing
--      new between combat 1 and 30. One named champion per tier 1–5, each with
--      one relic at ~2.5 expected hours of hunting it.
--   3. Farming 99 was ~300 days of tending; ×3 crop XP.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_items          the vendor, the market and the equip gate all join it;
--                     req_skill/req_lv is the WIELD gate hr_apply re-checks;
--                     tradeable = false is what keeps boss gear off the market.
--   hr_item_slots     hr_apply refuses an equip into an undeclared slot.
--   hr_activities     hr_apply refuses an unknown activity id; the artisan rows
--                     carry the bench level it re-checks against SERVER xp; the
--                     combat rows carry hr_apply's per-fight hp ceiling.
--   hr_bounty_monsters hr_credit_kills' hp plausibility cap (and the bounty
--                     tier). Champions are kept OFF the client's bounty board
--                     (src/core/bounty.js); a forged contract on one pays the
--                     tier's normal reward for a slower kill — no gain.
--   hr_crops.xp       hr_farm_harvest grants xp × qty and hr_farm_water
--                     ceil(xp / 4) from THIS column; nothing else reads it.
--
-- ⚠ RECIPE INPUT MAPS, RECIPE XP/ms, MONSTER STATS AND DROP TABLES ARE NOT IN
--   THIS DATABASE. They reach the realm through the EDGE PAYLOAD, which imports
--   src/data/{recipes,monsters,items}.js (supabase/functions/hr-accrue/
--   catalogue.js). Do NOT copy them into SQL: a drop table here is a FAUCET.
--   The relic drop odds and their faucet share are measured by
--   tests/w0f-fun-content.mjs on the one combat engine:
--     T1 old_tusker      tusker_charm       1 in 286  ~110 kills/h  ~2.6 h
--     T2 gnoll_packlord  packlord_band      1 in 357  ~145 kills/h  ~2.5 h
--     T3 mire_witch      mirewort_drops     1 in 263  ~107 kills/h  ~2.5 h
--     T4 barrow_king     barrowking_mantle  1 in 233   ~93 kills/h  ~2.5 h
--     T5 frost_jarl      jarls_rimetorc     1 in 208   ~84 kills/h  ~2.5 h
--   and each relic adds <= 5% of its champion's gp midpoint per kill in
--   vendor value (the lucky-find faucet rule).
--
-- ── THE ECONOMY HALF ───────────────────────────────────────────────────────
--   • Boss gear is valued at its Dawnsteel twin × 1.1 (118,800 vs 108,000 for
--     the platebody; 83,160 vs 75,600 for the leather/cloth bodies). A
--     non-raw item vendors at `value`, so the forge's margin over its inputs
--     matches the twin's own — no new vendor route. The boss MATERIAL is what
--     gates it (≈4 / 7 / 8 clears to one piece), and the gear is untradeable.
--   • Champion relics are tradeable trinkets valued 140 / 420 / 800 / 1,700 /
--     3,300 — below the crafted/looted pieces either side of their wield level.
--   • Champion gold: each champion's gp band sits inside [its tier's floor,
--     the next tier's ceiling]; measured gold/hour at its tier loadout is BELOW
--     the best ordinary monster of the same tier at T3–T5 and within 1% at
--     T1–T2 (it takes 2–3× the food). hr_apply's per-fight clamp is the
--     combat row's max_hp, restated here.
--   • Crop XP: 12 plots of Moonbloom harvest ≈ 12 × 7,140 × 2 ≈ 171k XP a
--     cycle, inside hr_day_budget's 40M XP/day by two orders of magnitude.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUES ───────────────
-- 2026-08-11-catalogue.generated.sql (regenerated on this branch: 546 items
-- was 538, 289 item-slot pairs was 280, 522 activities was 514, 113 combat
-- rows was 108, crops ×3) and 2026-08-23-bounty-monsters.generated.sql (113
-- was 108) carry the same rows durably, but each DELETEs/TRUNCATEs and
-- re-INSERTs its whole table. This file moves exactly 8 + 9 + 8 + 5 + 9 rows,
-- is idempotent, and is the ONE file to apply; §2 asserts the ruled values
-- from RESTATED literals.
--
-- POST-APPLY AMENDMENTS IN THIS LANE (self-check ONLY, no body, no data): the
-- regenerated catalogue replays BEFORE the farm files, so two farm self-checks
-- that pinned turnip's OLD xp (112 harvest, 28 water) now read hr_crops.xp
-- instead of the literal: 2026-08-20-server-farming.sql GATE(c) and
-- 2026-08-22-server-farming-complete.sql's water probe. Same pattern as the
-- Deep Waters amendment to Reed & Tide / Deep Seam.
--
-- ⚠ ORDER: apply -> hr-accrue redeploy -> client push, in ONE cut sitting.
--   Everything fails CLOSED in any order except the crop XP, which the edge
--   does not read (harvest/water are SQL verbs) — the client's CROPS display
--   would show ×3 numbers until the apply lands, and the next envelope pays
--   the server's number. Apply first and that window is zero.
--   Client first: a champion tile is refused `unknown_activity`, a boss recipe
--   `unknown_activity`. Edge behind the rows: an away window on a champion or a
--   boss recipe resolves `unknown_node`/`unknown_recipe` and refuses to pay.
--
-- REVERSIBILITY:
--   update public.hr_crops set xp = x.xp from (values ('turnip',112),
--     ('carrot',168),('wheat',252),('potato',350),('tomato',490),('pumpkin',840),
--     ('goldenroot',1190),('emberfruit',1680),('moonbloom',2380)) x(id, xp)
--     where crop_id = x.id;
--   delete from public.hr_activities where (kind, activity_id) in
--     (('artisan','forge_elderscale_platebody'),('artisan','craft_riftmaw_carapace'),
--      ('artisan','weave_voidheart_robe'),('combat','old_tusker'),('combat','gnoll_packlord'),
--      ('combat','mire_witch'),('combat','barrow_king'),('combat','frost_jarl'));
--   (and the edge + client redeployed from the reverted src/data in the same
--   sitting). XP already granted is not clawed back — it was earned at the
--   published rate. The hr_items / hr_item_slots / hr_bounty_monsters rows stay
--   after any play: a held relic or a worn boss piece must remain a catalogue
--   item (the Deep Seam rollback caveat, verbatim). A character pointing at a
--   deleted activity is not stranded: hr_apply refuses the next declaration and
--   accrual refuses to pay rather than throwing.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED ROWS ──────────────────────────────────────────────────────
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends the file as
-- one batch).
do $$
declare
  v_missing text;
  v_rows    int;
  -- (a) item_id · name · kind · value · req_skill · req_lv · tradeable.
  --     heals NULL and auto_eatable FALSE on all eight: nothing here is food.
  v_items constant jsonb := '[
    ["elderscale_platebody", "Elderscale Platebody", "armor",  118800, "defense", 95, false],
    ["riftmaw_carapace",     "Riftmaw Carapace",     "armor",   83160, "defense", 90, false],
    ["voidheart_robe",       "Voidheart Robe",       "armor",   83160, "defense", 90, false],
    ["tusker_charm",         "Tusker''s Charm",      "jewelry",   140, "defense",  8, true],
    ["packlord_band",        "Packlord''s Band",     "jewelry",   420, "defense", 22, true],
    ["mirewort_drops",       "Mirewort Drops",       "jewelry",   800, "defense", 38, true],
    ["barrowking_mantle",    "Barrow-King''s Mantle", "armor",   1700, "defense", 52, true],
    ["jarls_rimetorc",       "Jarl''s Rimetorc",     "jewelry",  3300, "defense", 66, true]
  ]'::jsonb;
  -- (b) item_id · equip_slot.
  v_slots constant jsonb := '[
    ["elderscale_platebody", "body"],
    ["riftmaw_carapace",     "body"],
    ["voidheart_robe",       "body"],
    ["tusker_charm",         "necklace"],
    ["packlord_band",        "ring1"],
    ["packlord_band",        "ring2"],
    ["mirewort_drops",       "earrings"],
    ["barrowking_mantle",    "cape"],
    ["jarls_rimetorc",       "necklace"]
  ]'::jsonb;
  -- (c1) artisan: kind · activity_id · req_skill · req_lv.
  v_arts constant jsonb := '[
    ["artisan", "forge_elderscale_platebody", "smithing", 97],
    ["artisan", "craft_riftmaw_carapace",     "crafting", 95],
    ["artisan", "weave_voidheart_robe",       "crafting", 95]
  ]'::jsonb;
  -- (c2) combat: kind · activity_id · max_hp. req NULL (no combat row has one),
  --      is_boss FALSE (a champion is never a boss — renown's boss term).
  v_combat constant jsonb := '[
    ["combat", "old_tusker",     30],
    ["combat", "gnoll_packlord", 62],
    ["combat", "mire_witch",     115],
    ["combat", "barrow_king",    205],
    ["combat", "frost_jarl",     360]
  ]'::jsonb;
  -- (d) monster_id · tier · hp.
  v_bounty constant jsonb := '[
    ["old_tusker",     1, 30],
    ["gnoll_packlord", 2, 62],
    ["mire_witch",     3, 115],
    ["barrow_king",    4, 205],
    ["frost_jarl",     5, 360]
  ]'::jsonb;
  -- What the three recipes consume beyond this file's own rows. NOT a server
  -- rule (the engine reads the input map from the edge payload) but every id
  -- must be a catalogue item or the inventory debit has nothing to name.
  v_inputs constant text[] := array['elderscale_heart','riftmaw_husk','void_essence',
    'dawn_bar','duskwood_plank','shadow_thread','magic_essence'];
begin
  if jsonb_array_length(v_items) <> 8 or jsonb_array_length(v_slots) <> 9
     or jsonb_array_length(v_arts) <> 3 or jsonb_array_length(v_combat) <> 5
     or jsonb_array_length(v_bounty) <> 5 then
    raise exception '§1: the rule holds %/%/%/%/% rows, the ruling names 8 items, 9 slot pairs, '
                    '3 artisan rows, 5 combat rows and 5 bounty monsters',
      jsonb_array_length(v_items), jsonb_array_length(v_slots), jsonb_array_length(v_arts),
      jsonb_array_length(v_combat), jsonb_array_length(v_bounty);
  end if;

  -- PRECONDITIONS.
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['smithing','crafting','defense','farming']) x
   where not exists (select 1 from public.hr_skills where skill_id = x);
  if v_missing is not null then
    raise exception '§1: hr_skills has no `%` row — apply 2026-08-11-catalogue.generated.sql first', v_missing;
  end if;
  if to_regclass('public.hr_item_slots') is null or to_regclass('public.hr_bounty_monsters') is null
     or to_regclass('public.hr_crops') is null then
    raise exception '§1: hr_item_slots / hr_bounty_monsters / hr_crops missing — apply the generated catalogues first';
  end if;
  select string_agg(distinct e->>1, ', ') into v_missing
    from jsonb_array_elements(v_slots) e
   where not exists (select 1 from public.hr_equip_slots s where s.equip_slot = e->>1);
  if v_missing is not null then
    raise exception '§1: equip slot(s) % are not in hr_equip_slots — the pair could never match', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(v_inputs) x
   where not exists (select 1 from public.hr_items i where i.item_id = x);
  if v_missing is not null then
    raise exception '§1: a W0 recipe consumes %, which is not a catalogue item', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['turnip','carrot','wheat','potato','tomato','pumpkin','goldenroot',
                      'emberfruit','moonbloom']) x
   where not exists (select 1 from public.hr_crops c where c.crop_id = x);
  if v_missing is not null then
    raise exception '§1: hr_crops has no row for % — the catalogue is older than this file', v_missing;
  end if;

  -- (a) ITEMS.
  insert into public.hr_items
      (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable)
  select r.item_id, r.name, r.tradeable, r.kind, r.value, r.req_skill, r.req_lv, null, false
    from jsonb_array_elements(v_items) e
    cross join lateral (select e->>0 as item_id, e->>1 as name, e->>2 as kind,
                               (e->>3)::bigint as value, e->>4 as req_skill,
                               (e->>5)::int as req_lv, (e->>6)::boolean as tradeable) r
      on conflict (item_id) do update
         set name = excluded.name, tradeable = excluded.tradeable, kind = excluded.kind,
             value = excluded.value, req_skill = excluded.req_skill,
             req_lv = excluded.req_lv, heals = excluded.heals,
             auto_eatable = excluded.auto_eatable
       where public.hr_items.name         is distinct from excluded.name
          or public.hr_items.kind         is distinct from excluded.kind
          or public.hr_items.value        is distinct from excluded.value
          or public.hr_items.req_skill    is distinct from excluded.req_skill
          or public.hr_items.req_lv       is distinct from excluded.req_lv
          or public.hr_items.heals        is distinct from excluded.heals
          or public.hr_items.tradeable    is distinct from excluded.tradeable
          or public.hr_items.auto_eatable is distinct from excluded.auto_eatable;
  get diagnostics v_rows = row_count;
  raise notice 'w0f §1(a): % of 8 item rows moved (0 on a re-apply)', v_rows;

  -- (b) SLOT PAIRS.
  insert into public.hr_item_slots (item_id, equip_slot)
  select e->>0, e->>1 from jsonb_array_elements(v_slots) e
      on conflict (item_id, equip_slot) do nothing;
  get diagnostics v_rows = row_count;
  raise notice 'w0f §1(b): % of 9 slot pairs moved (0 on a re-apply)', v_rows;

  -- (c) ACTIVITIES — artisan then combat. max_hp/is_boss RESTATED, never
  --     defaulted: the catalogue's own self-check asserts a non-combat row
  --     carries neither and counts the combat rows that do.
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  select e->>0, e->>1, e->>2, (e->>3)::int, null, false
    from jsonb_array_elements(v_arts) e
  union all
  select e->>0, e->>1, null, null, (e->>2)::int, false
    from jsonb_array_elements(v_combat) e
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'w0f §1(c): % of 8 activity rows moved (0 on a re-apply)', v_rows;

  -- (d) BOUNTY MONSTERS (tier + hp for hr_credit_kills' plausibility cap).
  insert into public.hr_bounty_monsters (monster_id, tier, hp)
  select e->>0, (e->>1)::int, (e->>2)::int from jsonb_array_elements(v_bounty) e
      on conflict (monster_id) do update set tier = excluded.tier, hp = excluded.hp
       where public.hr_bounty_monsters.tier is distinct from excluded.tier
          or public.hr_bounty_monsters.hp   is distinct from excluded.hp;
  get diagnostics v_rows = row_count;
  raise notice 'w0f §1(d): % of 5 bounty-monster rows moved (0 on a re-apply)', v_rows;

  -- (e) CROP XP ×3.
  update public.hr_crops c set xp = x.xp
    from (values ('turnip', 336), ('carrot', 504), ('wheat', 756), ('potato', 1050),
                 ('tomato', 1470), ('pumpkin', 2520), ('goldenroot', 3570),
                 ('emberfruit', 5040), ('moonbloom', 7140)) as x(crop_id, xp)
   where c.crop_id = x.crop_id and c.xp is distinct from x.xp;
  get diagnostics v_rows = row_count;
  raise notice 'w0f §1(e): % of 9 crop xp values moved (0 on a re-apply)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim proved by EXECUTING it. The apply is atomic, so a raise here
-- reverts §1. Row-writing probes run in a subtransaction discarded by the HR812
-- sentinel, so this block is net-zero on production (CLAUDE.md §2).
do $$
declare
  v_bad   text;
  v_n     int;
  v_r     jsonb;
  v_ver   bigint;
  v_xp94  bigint;
  v_xp95  bigint;
  v_uid   constant uuid := '00000000-0000-4000-8000-0000b5660f0f';
  c_j     constant jsonb := '{"kind":"admin","intent":"w0f-fun-content-probe"}'::jsonb;
begin
  -- (a) THE EIGHT ITEMS, RESTATED. INNER join + count = the control.
  select count(*),
         string_agg(i.item_id || '=' || i.name || '/' || coalesce(i.kind,'NULL') || '/' || i.value
                      || '/' || coalesce(i.req_skill,'NULL') || ' ' || coalesce(i.req_lv::text,'NULL')
                      || '/tradeable ' || i.tradeable, ', ' order by i.item_id)
           filter (where i.name is distinct from x.name or i.kind is distinct from x.kind
                      or i.value is distinct from x.value or i.req_skill is distinct from x.req_skill
                      or i.req_lv is distinct from x.req_lv or i.tradeable is distinct from x.tradeable
                      or i.heals is not null or i.auto_eatable)
    into v_n, v_bad
    from (values
      ('elderscale_platebody','Elderscale Platebody', 'armor',   118800::bigint, 'defense', 95, false),
      ('riftmaw_carapace',    'Riftmaw Carapace',     'armor',    83160,         'defense', 90, false),
      ('voidheart_robe',      'Voidheart Robe',       'armor',    83160,         'defense', 90, false),
      ('tusker_charm',        'Tusker''s Charm',      'jewelry',    140,         'defense',  8, true),
      ('packlord_band',       'Packlord''s Band',     'jewelry',    420,         'defense', 22, true),
      ('mirewort_drops',      'Mirewort Drops',       'jewelry',    800,         'defense', 38, true),
      ('barrowking_mantle',   'Barrow-King''s Mantle', 'armor',    1700,         'defense', 52, true),
      ('jarls_rimetorc',      'Jarl''s Rimetorc',     'jewelry',   3300,         'defense', 66, true)
    ) as x(item_id, name, kind, value, req_skill, req_lv, tradeable)
    join public.hr_items i on i.item_id = x.item_id;
  if v_n <> 8 then
    raise exception 'GATE(a) CONTROL: hr_items holds % of the 8 W0 ids', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a W0 item did not land as ruled (or is in the auto-eat pool): %', v_bad;
  end if;

  -- (a2) BOSS GEAR IS OFF THE MARKET; RELICS ARE ON IT. Asserted separately
  --      because it is the one column whose mistake is an economy leak.
  select string_agg(item_id, ', ' order by item_id) into v_bad from public.hr_items
   where item_id in ('elderscale_platebody','riftmaw_carapace','voidheart_robe') and tradeable;
  if v_bad is not null then
    raise exception 'GATE(a2): boss-forged gear is tradeable (%): the best gear in the game would be '
                    'a market flip, against the 2026-08-09 bind-on-pickup rule', v_bad;
  end if;

  -- (b) THE SLOT PAIRS, EXACTLY.
  select count(*), string_agg(item_id || '→' || equip_slot, ', ' order by item_id, equip_slot)
    into v_n, v_bad
    from public.hr_item_slots
   where item_id in ('elderscale_platebody','riftmaw_carapace','voidheart_robe','tusker_charm',
                     'packlord_band','mirewort_drops','barrowking_mantle','jarls_rimetorc');
  if v_n <> 9 then
    raise exception 'GATE(b): the eight items hold % slot pairs, the ruling names exactly 9 (got: %)', v_n, v_bad;
  end if;
  select string_agg(x.item_id || '→' || x.equip_slot, ', ') into v_bad
    from (values ('elderscale_platebody','body'),('riftmaw_carapace','body'),('voidheart_robe','body'),
                 ('tusker_charm','necklace'),('packlord_band','ring1'),('packlord_band','ring2'),
                 ('mirewort_drops','earrings'),('barrowking_mantle','cape'),('jarls_rimetorc','necklace')
         ) as x(item_id, equip_slot)
   where not exists (select 1 from public.hr_item_slots s
                      where s.item_id = x.item_id and s.equip_slot = x.equip_slot);
  if v_bad is not null then
    raise exception 'GATE(b): pair(s) missing: %', v_bad;
  end if;

  -- (c) THE EIGHT ACTIVITIES, RESTATED.
  select count(*),
         string_agg(a.kind || '/' || a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL') || '/hp ' || coalesce(a.max_hp::text,'NULL')
                      || '/boss ' || a.is_boss, ', ' order by a.activity_id)
           filter (where a.req_skill is distinct from x.req_skill or a.req_lv is distinct from x.req_lv
                      or a.max_hp is distinct from x.max_hp or a.is_boss)
    into v_n, v_bad
    from (values
      ('artisan','forge_elderscale_platebody','smithing'::text, 97, null::int),
      ('artisan','craft_riftmaw_carapace',    'crafting',       95, null),
      ('artisan','weave_voidheart_robe',      'crafting',       95, null),
      ('combat', 'old_tusker',                null,           null,  30),
      ('combat', 'gnoll_packlord',            null,           null,  62),
      ('combat', 'mire_witch',                null,           null, 115),
      ('combat', 'barrow_king',               null,           null, 205),
      ('combat', 'frost_jarl',                null,           null, 360)
    ) as x(kind, activity_id, req_skill, req_lv, max_hp)
    join public.hr_activities a on a.kind = x.kind and a.activity_id = x.activity_id;
  if v_n <> 8 then
    raise exception 'GATE(c) CONTROL: hr_activities holds % of the 8 W0 rows — every missing one is a '
                    'tile the client offers and the realm answers unknown_activity for', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(c): a W0 activity did not land as ruled: %', v_bad;
  end if;

  -- (d) THE FIVE BOUNTY-MONSTER ROWS, RESTATED.
  select count(*), string_agg(b.monster_id || '=' || b.tier || '/' || b.hp, ', ' order by b.monster_id)
           filter (where b.tier is distinct from x.tier or b.hp is distinct from x.hp)
    into v_n, v_bad
    from (values ('old_tusker',1,30),('gnoll_packlord',2,62),('mire_witch',3,115),
                 ('barrow_king',4,205),('frost_jarl',5,360)) as x(monster_id, tier, hp)
    join public.hr_bounty_monsters b on b.monster_id = x.monster_id;
  if v_n <> 5 or v_bad is not null then
    raise exception 'GATE(d): hr_bounty_monsters holds % of 5 champions, mismatched: % — a champion with '
                    'no row is refused kill credit', v_n, v_bad;
  end if;
  -- (d2) THE TWO HP COPIES AGREE. hr_apply's fight clamp reads hr_activities,
  --      hr_credit_kills reads hr_bounty_monsters; a disagreement is a kill one
  --      verb pays and the other refuses.
  select string_agg(a.activity_id, ', ') into v_bad
    from public.hr_activities a join public.hr_bounty_monsters b on b.monster_id = a.activity_id
   where a.kind = 'combat' and a.max_hp is distinct from b.hp
     and a.activity_id in ('old_tusker','gnoll_packlord','mire_witch','barrow_king','frost_jarl');
  if v_bad is not null then
    raise exception 'GATE(d2): hr_activities.max_hp and hr_bounty_monsters.hp disagree for %', v_bad;
  end if;

  -- (e) CROP XP ×3, RESTATED, and the old values are gone.
  select count(*), string_agg(c.crop_id || '=' || c.xp || ' (want ' || x.xp || ')', ', ' order by c.crop_id)
           filter (where c.xp is distinct from x.xp)
    into v_n, v_bad
    from (values ('turnip',336),('carrot',504),('wheat',756),('potato',1050),('tomato',1470),
                 ('pumpkin',2520),('goldenroot',3570),('emberfruit',5040),('moonbloom',7140)
         ) as x(crop_id, xp)
    join public.hr_crops c on c.crop_id = x.crop_id;
  if v_n <> 9 or v_bad is not null then
    raise exception 'GATE(e): hr_crops holds % of 9 crops, off-ruling: %', v_n, v_bad;
  end if;

  -- (f) EXECUTED: THE WIELD GATE BITES AT DEFENCE 94 AND OPENS AT 95 for the
  --     Elderscale Platebody; a positive control proves equipping works at all;
  --     and a champion is a DECLARABLE combat activity (unknown_activity before
  --     §1(c)).
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(f) CANNOT RUN: hr_create_character missing';
  end if;
  select xp into v_xp94 from public.hr_xp_table where level = 94;
  select xp into v_xp95 from public.hr_xp_table where level = 95;
  if v_xp94 is null or v_xp95 is null or v_xp95 <= v_xp94 then
    raise exception 'GATE(f) CANNOT RUN: hr_xp_table has no usable 94/95 rungs (%/%)', v_xp94, v_xp95;
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(f): no probe character: %', v_r; end if;

    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'elderscale_platebody', 1), (v_uid, 0, 'dawn_platebody', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'defense', v_xp94)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','elderscale_platebody'), 'journal', c_j));
    if v_r->>'error' is distinct from 'requirement_not_met'
       or v_r->>'item_id' is distinct from 'elderscale_platebody' then
      raise exception 'GATE(f): Defence 94 equipping elderscale_platebody answered % — it must be '
                      'requirement_not_met/elderscale_platebody', v_r;
    end if;
    -- POSITIVE CONTROL: the Dawnsteel twin (Defence 88) equips at 94.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','dawn_platebody'), 'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(f) CONTROL: Defence 94 was refused dawn_platebody (req 88) — % — equipping '
                      'is broken and the refusal above measured nothing', v_r;
    end if;
    -- ONE level is the whole difference.
    update public.player_skills set xp = v_xp95 where user_id = v_uid and slot = 0 and skill_id = 'defense';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('equip', jsonb_build_object('body','elderscale_platebody'), 'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(f) CONTROL: Defence 95 was still refused elderscale_platebody (%)', v_r;
    end if;
    if not exists (select 1 from public.player_equipment
                    where user_id = v_uid and slot = 0 and equip_slot = 'body'
                      and item_id = 'elderscale_platebody') then
      raise exception 'GATE(f) CONTROL: the accepted equip did not land in player_equipment';
    end if;

    -- A CHAMPION IS DECLARABLE.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','combat','id','old_tusker','restart',true), 'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(f): declaring the champion old_tusker answered % — §1(c) did not land', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'old_tusker' then
      raise exception 'GATE(f): the accepted declaration did not become the live pointer';
    end if;

    raise exception using errcode = 'HR812', message = 'w0f §2 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF (CLAUDE.md §2: no probe row survives).
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'w0f: 8 items (3 boss pieces untradeable, 5 relics tradeable, none food), 9 slot '
               'pairs, 3 recipes + 5 champions in hr_activities (max_hp = bounty hp), crops ×3; '
               'hr_apply refuses Defence 94 the Elderscale Platebody and equips it at 95, and '
               'declares a champion — all green';
end $$;

-- ── 3. "BESTIARY MASTER" COUNTS THE CHAMPIONS — hunterAll 108 -> 113 ────────
-- hunterAll ("slay every monster") is the monster-catalogue SIZE, bound three
-- ways by tests/collection-renown-claim-drift.mjs (src/data/collection-
-- milestones.js MONSTER_TOTAL, src/features/collection-log.js, and the CHAIN-END
-- restatement of this function — which is now THIS file). Five monsters joined
-- the roster, so the threshold rises with them.
-- The body is 2026-09-27-ledger-of-firsts.sql §1 VERBATIM; the ONLY change is
-- the hunterAll arm's v_thresh, 108 -> 113. RAISE-ONLY: the reward (50,000 gold
-- + 25 gems, once per character) is unchanged and is now HARDER to reach, so no
-- faucet moves; a character who already claimed it keeps it (the once-guard row
-- is untouched). The wrapper hr_claim_milestone, its grants and the refusal
-- journal are not restated (see the ledger-of-firsts header for why).
-- live-hash-drift: this function carries no body pin (ledger-of-firsts §0 note);
-- the Coordinator re-measures after the apply as for any restatement.
-- REVERSIBILITY: re-apply 2026-09-27-ledger-of-firsts.sql §1 (the 108 body).

do $$
begin
  if to_regprocedure('public.hr_claim_milestone(text,integer)') is null
     or to_regprocedure('public.hr_claim_milestone__ungated(text,integer)') is null then
    raise exception 'PRECONDITION: hr_claim_milestone(+__ungated) missing — apply 2026-09-27-ledger-of-firsts.sql first'; end if;
  if to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_bestiary_of(uuid,int) missing'; end if;
end $$;

create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_domain text;
  v_thresh bigint;
  v_gold   bigint;
  v_gems   int;
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

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/collection-milestones.js).
  -- hunterAll's threshold is the monster-catalogue size (drift-guarded).
  case p_milestone_id
    when 'hunter10'   then v_domain := 'monsters'; v_thresh := 10;  v_gold := 2000;  v_gems := 0;
    when 'hunter25'   then v_domain := 'monsters'; v_thresh := 25;  v_gold := 4000;  v_gems := 0;
    when 'hunter40'   then v_domain := 'monsters'; v_thresh := 40;  v_gold := 8000;  v_gems := 0;
    when 'hunter60'   then v_domain := 'monsters'; v_thresh := 60;  v_gold := 15000; v_gems := 0;
    when 'hunter85'   then v_domain := 'monsters'; v_thresh := 85;  v_gold := 25000; v_gems := 0;
    when 'hunterAll'  then v_domain := 'monsters'; v_thresh := 113; v_gold := 50000; v_gems := 25;
    when 'collect25'  then v_domain := 'items';    v_thresh := 25;  v_gold := 1000;  v_gems := 0;
    when 'collect50'  then v_domain := 'items';    v_thresh := 50;  v_gold := 5000;  v_gems := 0;
    when 'collect75'  then v_domain := 'items';    v_thresh := 75;  v_gold := 10000; v_gems := 0;
    when 'collect100' then v_domain := 'items';    v_thresh := 100; v_gold := 15000; v_gems := 15;
    when 'collect125' then v_domain := 'items';    v_thresh := 125; v_gold := 30000; v_gems := 0;
    else return jsonb_build_object('ok', false, 'error', 'unknown_milestone', 'milestone', p_milestone_id);
  end case;

  -- VERIFY completion from the server's OWN per-entry projection (DISTINCT count).
  if v_domain = 'monsters' then
    select count(*) into v_have from public.hr_bestiary_of(auth.uid(), v_slot);
  else
    select count(*) into v_have from public.hr_collection_of(auth.uid(), v_slot);
  end if;
  if coalesce(v_have, 0) < v_thresh then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'milestone', p_milestone_id, 'have', coalesce(v_have, 0), 'goal', v_thresh, 'domain', v_domain);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'collection', p_milestone_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'milestone', p_milestone_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'gems', v_gems));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'gems', v_gems, 'slot', v_slot, 'credited', true);
end $$;

revoke execute on function public.hr_claim_milestone__ungated(text, int) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK for §3 — proven by EXECUTION ─────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5660f13';
  v_slot constant int  := 0;
  v_g0 bigint; v_g1 bigint; v_gm0 bigint; v_gm1 bigint;
begin
  -- (a) GRANTS unchanged: the inner is callable by no client role.
  if has_function_privilege('authenticated', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_milestone__ungated(text,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_claim_milestone__ungated(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): hr_claim_milestone__ungated is client-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'SELF-CHECK(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;
    -- 112 distinct kills: the OLD threshold would have paid at 108; the new one refuses.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:m' || g::text, 1, '', 'active'
        from generate_series(1, 112) g;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'goal')::int <> 113
       or (v->>'have')::int <> 112 then
      raise exception 'SELF-CHECK(b): hunterAll at 112 distinct was not refused incomplete with goal 113: %', v;
    end if;
    -- CONTROL: an unchanged arm still pays at its own threshold.
    v := public.hr_claim_milestone__ungated('hunter85', v_slot);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gold')::bigint <> 25000 then
      raise exception 'SELF-CHECK(b) CONTROL: hunter85 at 112 distinct did not pay 25000: %', v;
    end if;
    -- the 113th distinct kill: exactly 50,000 gold + 25 gems, once.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:m113', 1, '', 'active');
    select gold, gems into v_g0, v_gm0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'SELF-CHECK(c): hunterAll at 113 distinct did not credit: %', v;
    end if;
    select gold, gems into v_g1, v_gm1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 50000 or v_gm1 - v_gm0 <> 25 then
      raise exception 'SELF-CHECK(c): hunterAll credited % gold / % gems, the catalogue says 50000 / 25',
        v_g1 - v_g0, v_gm1 - v_gm0;
    end if;
    v := public.hr_claim_milestone__ungated('hunterAll', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'SELF-CHECK(c): hunterAll replay was not refused already_claimed: %', v;
    end if;
    -- the wrapper still journals a refusal.
    v := public.hr_claim_milestone('no_such_milestone', v_slot);
    if v->>'ok' <> 'false' or not exists (select 1 from public.hr_rejections where user_id = v_uid) then
      raise exception 'SELF-CHECK(d): the wrapper no longer journals refusals: %', v;
    end if;

    raise exception using errcode = 'HR812', message = 'w0f §4 complete — rolling back';
  exception when sqlstate 'HR812' then null;
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
        raise exception 'SELF-CHECK(e): grant hygiene is red: %', v_gh;
      end if;
    end;
  else
    raise exception 'SELF-CHECK(e): hr_assert_grant_hygiene(boolean) is absent';
  end if;

  raise notice 'w0f §3: hunterAll refuses 112 and pays exactly 50000 + 25 gems at 113, once; '
               'hunter85 unchanged; wrapper journals; grants + hygiene green; zero leak';
end $$;
