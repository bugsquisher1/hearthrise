-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-self-supply-ladder.sql
--
-- FOURTEEN `hr_activities.req_lv` VALUES MOVED. NO FUNCTION BODY, NO GRANT, NO
-- NEW OBJECT, NO NEW ROW, NO VALUE MOVED, NOT ONE PLAYER COLUMN TOUCHED.
--
-- ── THE DEFECT, MEASURED ────────────────────────────────────────────────────
-- `DEEPSEAM-5` (src/features/smoke-test.js) measured 57 shipped artisan rungs —
-- 34 of them smithing — that require a material THEIR OWN LEVEL CANNOT MAKE, and
-- froze the count as a ratchet because re-cutting the curve was a balance program:
--     Steel Gauntlets  Smithing 31  ate a Steel Bar   smelted at 35
--     twelve mithril rungs   46-54  ate a Mithril Bar smelted at 55
--     the whole rune band    61-70  ate a Rune Bar    smelted at 75
--     …and the same at Emberforged, Dawnsteel, the arrow lanes and jewellery.
-- None of it was unobtainable (bars drop and trade), so no player was stuck. What
-- was broken is SELF-SUPPLY — the one thing the smithing screen teaches. A player
-- who levels Smithing to forge armour reached the armour and not the metal.
--
-- ── THE RULING (game-designer, 2026-09-13, final; DEEPSEAM-5 now asserts 0) ──
--   **A material is made where its tier opens, and no rung may ask for a tier the
--     player cannot yet open.** Formally: for every recipe R and every input i,
--     `req(R) >= the cheapest level at which i can be MADE`.
--   Applied in this precedence, so the fix never costs the player content:
--     1. A SUPPLY rung (bar / plank / blank) sits at its own tier's gate
--        (`MATERIAL_TIERS.smith` / `.craft` in src/data/gear-tiers.js) and never
--        above the first rung that consumes it. Nine rungs moved DOWN.
--     2. If a rung still names a material from a tier above its own band, the
--        MATERIAL moves down to its band — the level was the authored pacing
--        decision, the material name was the slip. Three rungs (Longbow → oak,
--        Apprentice Staff → normal, Ruby Signet → mithril): CLIENT-SIDE ONLY,
--        because recipe INPUTS are not columns in this database (they reach the
--        server through the edge payload, which imports src/data/recipes.js).
--     3. Only when the item's identity IS the higher tier does the LEVEL rise to
--        that tier's gate. Five rungs moved UP (four dawn-metal, one runewood).
--   TIE-BREAK, and it is load-bearing: **the player's ladder outranks the
--   material's flavour.** The first draft raised the Ruby Signet 52 → 60 to meet
--   its rune band and the b343 guard caught a 25-LEVEL HOLE in ring availability
--   (35 → 60) in a slot the player wears two of; the band became mithril instead.
--   NO WIELD LEVEL MOVES ANYWHERE (`hr_items.req_skill/req_lv` is untouched by
--   this file): a requirement a player already meets is never raised to tidy a
--   recipe, so nobody loses a piece they are wearing.
--
-- ── WHAT THE SERVER NEEDS FROM IT ───────────────────────────────────────────
-- hr_apply's activity arm (2026-08-11-apply-engine.sql §(4a)) does exactly two
-- things with an artisan declaration: it refuses an unknown id
-- (`unknown_activity`) and it re-checks `req_skill`/`req_lv` against SERVER xp
-- (`activity_locked`). So `req_lv` in this table IS the gate, and these fourteen
-- values are the server half of the ruling. Nine of them OPEN a rung earlier than
-- production does today; five CLOSE one that the client will also stop offering in
-- the same build. `xp`, `ms` and `inputs` are not columns here and cannot be
-- asserted here (see the 2026-09-13-prayer-ladder file's warning) — they are
-- pinned client-side by DEEPSEAM-5's zero and the b343/b348 ladder guards.
--
-- ⚠ ORDER (both halves, and they differ):
--   • THE NINE THAT OPEN EARLIER are safe to apply FIRST and alone: the client
--     simply has not offered them yet, and a player who declares nothing new is
--     unaffected. Applied AFTER the client push, a Smithing-30 player clicking the
--     new Steel Bar tile is refused `activity_locked` by the realm — a visible
--     dead tile, no corruption.
--   • THE FIVE THAT CLOSE (crown 85→88, three dawn jewels 86/87→88, demoncaller
--     68→75) are the reverse: applied BEFORE the client push, a player at 85-87
--     who was already pointing at one of them is refused on the NEXT declaration
--     (the current span is unaffected — hr_apply never re-checks a running
--     activity), which is `activity_locked` and a stopped bench, not a loss. All
--     five are drop-gated uniques (a War Crown, a Dragon Gem, a Hell Ember), so
--     the population that can be mid-action on one is essentially nobody.
--   Either way this file is CATALOGUE-ONLY and reversible; apply it with, or just
--   before, the build that carries the client half.
--   AND THE EDGE MUST BE REDEPLOYED with that same build: away accrual resolves
--   recipes against the packed payload, so the payload's `req` and the new
--   INPUTS (rule 2 above) travel with it, not with this file.
--
-- REVERSIBILITY (net-zero, no value to claw back — restore the fourteen old
-- levels; re-applying the catalogue from a commit before this branch is equivalent):
--   update public.hr_activities a set req_lv = x.req_lv from (values
--     ('smelt_steel',35),('smelt_gold',40),('smelt_mithril',55),('smelt_rune',75),
--     ('smelt_ember',82),('smelt_dawn',92),('smelt_deathsteel_ingot',62),
--     ('saw_duskwood',90),('cut_rune_blanks',4),('forge_crown_of_the_fallen_king',85),
--     ('jewel_dawnbound_amulet',86),('jewel_dawnforged_signet',87),
--     ('jewel_dragon_gem_earrings',86),('craft_demoncaller_staff',68)
--   ) as x(activity_id, req_lv)
--    where a.kind = 'artisan' and a.activity_id = x.activity_id;
--
-- DURABLE SOURCE: 2026-08-11-catalogue.generated.sql (regenerated on this branch,
-- digest 9917d7c7…, 503 activities) carries the same fourteen values and is the
-- authoring path. This file exists so the fourteen can be applied ALONE at the
-- cut instead of re-inserting 538 items, 280 slot pairs and the start kit. Apply
-- either; §2 asserts the ruled values, so the two records cannot drift in silence.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. THE RULED LEVELS ────────────────────────────────────────────────────
-- One idempotent UPDATE, preceded by an EXISTENCE check: an UPDATE that matches
-- nothing is silent, and every row this file names must already exist (they are
-- all shipped rungs). No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs
-- sends the file as one batch).
do $$
declare
  v_missing text;
  v_rows    int;
  -- activity_id · the ruled req_lv. `kind` is 'artisan' for all fourteen.
  v_move constant jsonb := '[
    ["smelt_gold",25],                    ["smelt_steel",30],
    ["smelt_mithril",45],                 ["smelt_rune",60],
    ["smelt_deathsteel_ingot",60],        ["smelt_ember",75],
    ["smelt_dawn",88],                    ["saw_duskwood",88],
    ["cut_rune_blanks",1],                ["craft_demoncaller_staff",75],
    ["forge_crown_of_the_fallen_king",88],["jewel_dawnbound_amulet",88],
    ["jewel_dawnforged_signet",88],       ["jewel_dragon_gem_earrings",88]
  ]'::jsonb;
begin
  if jsonb_array_length(v_move) <> 14 then
    raise exception '§1: the rule holds % rows, the ruling names 14',
      jsonb_array_length(v_move);
  end if;

  select string_agg(r.activity_id, ', ' order by r.activity_id) into v_missing
    from jsonb_array_elements(v_move) e
    cross join lateral (select e->>0 as activity_id) r
   where not exists (select 1 from public.hr_activities a
                      where a.kind = 'artisan' and a.activity_id = r.activity_id);
  if v_missing is not null then
    raise exception '§1: hr_activities has no artisan row for % — every id here is a SHIPPED '
                    'rung, so the catalogue is older than this file. Apply '
                    '2026-08-11-catalogue.generated.sql first.', v_missing;
  end if;

  update public.hr_activities a
     set req_lv = r.req_lv
    from jsonb_array_elements(v_move) e
    cross join lateral (select e->>0 as activity_id, (e->>1)::int as req_lv) r
   where a.kind = 'artisan' and a.activity_id = r.activity_id
     and a.req_lv is distinct from r.req_lv;
  get diagnostics v_rows = row_count;
  raise notice 'self-supply-ladder §1: % of 14 rungs moved (0 on a re-apply)', v_rows;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every claim is proved by EXECUTING it, never by a marker or a string match. The
-- apply is atomic, so a raise here reverts §1. The row-writing probe runs in a
-- subtransaction discarded by the HR812 sentinel, so this file is net-zero on
-- production and CLAUDE.md §2 ("player state is never fabricated") holds.
do $$
declare
  v_bad  text;
  v_n    int;
  v_r    jsonb;
  v_ver  bigint;
  v_xp29 bigint;
  v_xp30 bigint;
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5450001';
  c_j    constant jsonb := '{"kind":"admin","intent":"b545:self-supply-probe"}'::jsonb;
begin
  -- (a) THE FOURTEEN LANDED, with the ruled bench and level. The literal is
  --     RESTATED here (not read from §1) so a hand-edit that dropped a row from
  --     §1 cannot also silence its own check. The count is the CONTROL: the join
  --     is INNER, so a MISSING row would pass the value filter in silence.
  select count(*),
         string_agg(a.activity_id || '=' || coalesce(a.req_skill,'NULL') || '/'
                      || coalesce(a.req_lv::text,'NULL')
                      || ' (want ' || x.req_skill || '/' || x.req_lv || ')', ', ' order by a.activity_id)
           filter (where a.req_skill is distinct from x.req_skill
                      or a.req_lv is distinct from x.req_lv
                      or a.max_hp is not null or a.is_boss)
    into v_n, v_bad
    from (values
      ('smelt_gold','smithing',25),            ('smelt_steel','smithing',30),
      ('smelt_mithril','smithing',45),         ('smelt_rune','smithing',60),
      ('smelt_deathsteel_ingot','smithing',60),('smelt_ember','smithing',75),
      ('smelt_dawn','smithing',88),            ('saw_duskwood','crafting',88),
      ('cut_rune_blanks','stonemason',1),      ('craft_demoncaller_staff','crafting',75),
      ('forge_crown_of_the_fallen_king','smithing',88),
      ('jewel_dawnbound_amulet','crafting',88),('jewel_dawnforged_signet','crafting',88),
      ('jewel_dragon_gem_earrings','crafting',88)
    ) as x(activity_id, req_skill, req_lv)
    join public.hr_activities a
      on a.kind = 'artisan' and a.activity_id = x.activity_id;
  if v_n <> 14 then
    raise exception 'GATE(a) CONTROL: hr_activities holds % of the 14 ruled rungs', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a ruled rung did not land: %', v_bad;
  end if;

  -- (b) THE PROPERTY ITSELF, ZERO VIOLATIONS, on the pairs this database can see.
  --     Recipe INPUTS are not columns here, so the pair list is the RULING's own
  --     statement — every supply rung against the FIRST rung that consumes it —
  --     not a copy of the recipe graph (14 pairs, and the client half is asserted
  --     totally, across all 503 rungs, by DEEPSEAM-5's zero + its mutation arm).
  --     `>=` is the property: a supply rung may sit BELOW its first consumer, never
  --     above it. This is the check that stays true for future content: add a
  --     cheaper consumer and the pair list is what tells you the bar must move.
  select count(*),
         string_agg(p.consumer || '@' || c.req_lv || ' needs ' || p.supply || '@' || s.req_lv,
                    ', ' order by p.consumer)
           filter (where c.req_lv < s.req_lv)
    into v_n, v_bad
    from (values
      -- supply rung                     first rung that consumes what it makes
      ('smelt_steel',            'forge_steel_gauntlets'),
      ('smelt_gold',             'craft_gold_ring'),
      ('smelt_mithril',          'forge_mithril_gauntlets'),
      ('smelt_rune',             'forge_rune_gauntlets'),
      ('smelt_ember',            'forge_ember_gauntlets'),
      ('smelt_dawn',             'forge_dawn_gauntlets'),
      ('smelt_deathsteel_ingot', 'forge_watchknight_gloves'),
      ('saw_duskwood',           'craft_voidhide_gloves'),
      ('cut_rune_blanks',        'bind_air_runes'),
      ('saw_oak',                'carve_longbow'),
      ('saw_normal',             'carve_apprentice_staff'),
      ('saw_runewood',           'craft_demoncaller_staff'),
      ('smelt_mithril',          'jewel_ruby_signet'),
      ('smelt_dawn',             'forge_crown_of_the_fallen_king')
    ) as p(supply, consumer)
    join public.hr_activities s on s.kind = 'artisan' and s.activity_id = p.supply
    join public.hr_activities c on c.kind = 'artisan' and c.activity_id = p.consumer;
  if v_n <> 14 then
    raise exception 'GATE(b) CONTROL: only % of the 14 supply/consumer pairs resolved to real '
                    'rungs — the property below was graded on a partial table', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(b): the self-supply property is VIOLATED — a rung is gated below the '
                    'rung that makes what it eats: %', v_bad;
  end if;

  -- (b2) NEGATIVE CONTROL for (b): the same comparison, deliberately inverted, must
  --      FIND something. Without it, a `where` clause that can never match would
  --      report "zero violations" forever.
  select count(*) into v_n
    from (values ('smelt_steel','forge_steel_gauntlets'),('smelt_dawn','forge_dawn_gauntlets'))
           as p(supply, consumer)
    join public.hr_activities s on s.kind = 'artisan' and s.activity_id = p.supply
    join public.hr_activities c on c.kind = 'artisan' and c.activity_id = p.consumer
   where c.req_lv >= s.req_lv;
  if v_n <> 2 then
    raise exception 'GATE(b2) NEGATIVE CONTROL: the inverted comparison matched % of 2 pairs — '
                    'GATE(b) is not comparing what it says it compares', v_n;
  end if;

  -- (c) NO LEVEL IS OUTSIDE THE XP TABLE. Derived from the table, so the day the
  --     cap moves this assertion moves with it. A rung at 0 is ungated; a rung
  --     above the cap is unreachable content.
  select string_agg(activity_id || '=' || req_lv, ', ') into v_bad
    from public.hr_activities
   where kind = 'artisan' and req_lv is not null
     and (req_lv < 1 or req_lv > coalesce((select max(level) from public.hr_xp_table), 0));
  if v_bad is not null then
    raise exception 'GATE(c): an artisan rung is gated below 1 or above the highest level '
                    'hr_xp_table reaches (%): %',
                    (select max(level) from public.hr_xp_table), v_bad;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES a Smithing-29 character `smelt_steel` and
  --     ACCEPTS it at 30. This is the property the nine downward moves exist for
  --     and the one the catalogue alone cannot prove — before §1 the same call at
  --     30 answers `activity_locked`, which is the defect, and after a mis-typed
  --     req_lv it would answer `ok` at 29.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_xp29 from public.hr_xp_table where level = 29;
  select xp into v_xp30 from public.hr_xp_table where level = 30;
  if v_xp29 is null or v_xp30 is null or v_xp30 <= v_xp29 then
    raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable 29/30 rungs (%/%)',
      v_xp29, v_xp30;
  end if;
  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'smithing', v_xp29)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_from_xp(v_xp29) <> 29 then
      raise exception 'GATE(d) CANNOT RUN: % xp is level %, not 29',
        v_xp29, public.hr_level_from_xp(v_xp29);
    end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','smelt_steel','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d): Smithing 29 declaring smelt_steel answered % — it must be '
                      'activity_locked. `ok` means the Steel Bar moved BELOW its ruled 30 and '
                      'the tier opens a level early', v_r;
    end if;
    if (select active_kind from public.player_state where user_id = v_uid and slot = 0) <> 'idle' then
      raise exception 'GATE(d): the refused declaration still moved player_state.active_kind';
    end if;

    -- POSITIVE CONTROL — ONE level of Smithing is the whole difference, and 30 is
    -- the number the ruling names (production refuses this today at 30, 31, 32,
    -- 33 and 34: that is the defect this file fixes).
    update public.player_skills set xp = v_xp30
     where user_id = v_uid and slot = 0 and skill_id = 'smithing';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','smelt_steel','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(d) CONTROL: Smithing 30 was still refused smelt_steel (%) — the Steel '
                      'Bar is gated above the rung that opens the steel tier, which is the whole '
                      'defect', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'smelt_steel' then
      raise exception 'GATE(d) CONTROL: the accepted declaration did not become the live pointer';
    end if;

    -- POSITIVE CONTROL #2 — the SAME character is still refused the rung this file
    -- moved UP (forge_crown_of_the_fallen_king, 88). Without it, a build that
    -- broke the gate open entirely would pass everything above.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','forge_crown_of_the_fallen_king',
                                  'restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d) CONTROL: Smithing 30 was NOT refused the level-88 crown (%) — the '
                      'activity gate is not biting at all', v_r;
    end if;

    raise exception using errcode = 'HR812',
      message = 'self-supply-ladder §2 complete — rolling back';
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

  raise notice 'self-supply-ladder: 14 rungs at their ruled levels, all 14 supply/consumer pairs '
               'self-supplying (with an inverted control that still bites), every artisan req_lv '
               'inside the XP table, and hr_apply refuses Smithing 29 the Steel Bar while '
               'accepting it at 30 and still refusing the level-88 crown — all green';
end $$;
