-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-26-deep-waters.sql
--
-- ONE DATA CLOSURE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT:
--
--   §1a SIX new `hr_activities` rows — `gather` stands:
--       fishing lobster_reef_s 47, swordfish_deeps_s 61, frostfin_reach_s 71,
--               shark_shelf_s 83
--       mining  deep_mithril_vein 67, deep_ember_vein 82
--       Each yields an EXISTING raw item (lobster/swordfish/frostfin/shark,
--       mithril_ore/emberstone_ore), so no hr_items row, slot pair or recipe
--       moves.
--   §1b FOUR `hr_items.heals` values — the cooked-fish heal climb:
--       cooked_swordfish 22 -> 32, cooked_frostfin 28 -> 38,
--       cooked_shark 42 -> 44, cooked_moonfish 38 -> 50.
--       Heals ONLY: value, tradeable and auto_eatable (true) are untouched.
--   §1c the SAME four heals in `hr_feast_foods` (the Tavern meter's value).
--
-- "Deep Waters" — game-designer ruling, content pack 8.
--
-- ── THE HOLES THIS CLOSES ──────────────────────────────────────────────────
--   Fishing had no new spot from 41 to 54; mining none from 61 to 74 or 76 to
--   89. Every req gap from 40 to 90 is now 5-8. And a higher fish is finally
--   better food: a cooked Swordfish (Fishing 55) healed 22, less than a Lobster
--   (Fishing 40) at 25. The climb is now 25 < 32 < 38 < 44 < 50.
--   RULED HONESTLY (items.js design block): Cooked Moonfish 50 is ABOVE the
--   gated Dragon Stew 45 and EQUAL to Lich Soul Soup 50, and it becomes the
--   auto-eat fallback (biggest healer) in place of Cooked Shark.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_activities   hr_apply's activity arm refuses an id with no row
--                   (`unknown_activity`) and re-checks req_skill/req_lv against
--                   SERVER xp (`activity_locked`); hr_worker_assign gates crews
--                   on the same req_lv. These six rows are the ONLY server-side
--                   level gate for the stands.
--   hr_items.heals  hr_rest and the cadence/recovery arm read it (auto-eat
--                   pool: auto_eatable and heals > 0).
--   hr_feast_foods  clan_feast_deposit advances the Tavern meter by THIS value,
--                   never the client's.
--
-- ⚠ `xp`, `ms` AND YIELD (qty) ARE NOT IN THIS DATABASE, AND ARE NOT ASSERTED
--   HERE. They reach the server through the EDGE PAYLOAD, which imports
--   src/data/gathering.js (supabase/functions/hr-accrue/catalogue.js ->
--   GATHER_NODES). Do NOT hand-copy them into SQL: an XP copy here is a FAUCET.
--   The edge also vendors src/data/items.js (eat.js, combat-sim auto-eat), so
--   the heal numbers live in THREE runtimes: client, edge, and this database.
--   PACED guard series, floor(xp x 0.39) / (floor(ms x 1.6) / 1000):
--     FISH lobster 2.5000 -> REEF 2.6389 -> swordfish 2.8125 -> DEEPS 3.0071
--          -> frostfin 3.1522 -> REACH 3.2787 -> shark 3.3654 -> SHELF 3.4926
--          -> moonfish 3.6161
--     ORE  mithril 2.9688 -> DEEP MITHRIL 3.0914 -> emberstone 3.2143
--          -> DEEP EMBER 3.4040 -> dawnstone 3.5938
--
-- ── THE ECONOMY HALF ───────────────────────────────────────────────────────
--   Every new node's items/h, xp/h and raw g/h is BELOW the current table
--   maximums (750 items/h, 13,327 xp/h, 52,500 g/h), so hr_apply's per-call
--   clamps and hr_day_budget headroom are unchanged. Fish stands are [1,1]
--   (fewer fish/h than the named spot below each); the veins are [1,2]
--   (363 / 301 ore/h vs 281 / 214), and the one-ore bars (smelt_mithril 1 ore
--   + 3 coal, smelt_ember 1 ore + 4 coal) stay coal-bound.
--   Tavern fuel: cheapest g/HP is still cooked_shrimp (2.25) vs swordfish 17.5,
--   so no cheaper path fills a clan meter. clan_feast_deposit's per-call clamp
--   (600 heal-points) and the cap are unchanged.
--
-- ── WHY A PATCH FILE AND NOT JUST THE REGENERATED CATALOGUE ────────────────
-- 2026-08-11-catalogue.generated.sql (same branch, regenerated: 514 activities
-- was 508, 538 items unchanged, four heals moved) carries these values durably
-- but DELETEs and re-INSERTs whole tables and does not touch hr_feast_foods.
-- This file moves exactly 6 + 4 + 4 rows, is idempotent, and is the ONE file to
-- apply; the regenerated catalogue is a chain record, not re-applied. §2
-- asserts the ruled values from RESTATED literals.
--
-- ⚠ §1c IS AN INSERT ... ON CONFLICT, NOT AN UPDATE, ON PURPOSE:
--   tests/clan-feast-catalogue-drift.mjs folds only `insert into
--   public.hr_feast_foods (item_id, heals) values ...` blocks in apply order.
--   An UPDATE is invisible to it and the guard would stay red.
--
-- ⚠ NO EXACT BENCH TOTAL IS ASSERTED. A bare `count(*) = N` over a bench in a
--   patch file raises on every later pack's replay (the regenerated catalogue
--   runs earlier in the chain and carries every later row) — the Reed & Tide
--   and Deep Seam gates did exactly that and carry a POST-APPLY AMENDMENT in
--   this same lane. The chain-end total is catalogue-literal-drift's job.
--
-- ⚠ ORDER: apply -> hr-accrue redeploy -> client push, in ONE cut sitting.
--   The six gather rows fail CLOSED in any order (client first = the realm
--   answers `unknown_activity`; edge behind the rows = an away window on a new
--   stand is refused `unknown_node`). The HEALS do not fail closed: between the
--   apply and the edge deploy, hr_rest/the Tavern heal 32/38/44/50 while the
--   edge's attended eat and away combat still heal 22/28/42/38 — the browser
--   would say one thing and the server another (CLAUDE.md §6). Hence one sitting.
--
-- REVERSIBILITY (no value to claw back — every fish/ore gathered already
-- existed as an item; a heal is consumed, not stored):
--   1. delete from public.hr_activities where kind = 'gather' and activity_id in
--        ('lobster_reef_s','swordfish_deeps_s','frostfin_reach_s','shark_shelf_s',
--         'deep_mithril_vein','deep_ember_vein');
--   2. an insert-on-conflict file restoring 22/28/42/38 in BOTH tables:
--        update public.hr_items set heals = x.h from (values ('cooked_swordfish',22),
--          ('cooked_frostfin',28),('cooked_shark',42),('cooked_moonfish',38)) x(id,h)
--          where item_id = x.id;
--        insert into public.hr_feast_foods (item_id, heals) values
--          ('cooked_swordfish',22),('cooked_frostfin',28),('cooked_shark',42),
--          ('cooked_moonfish',38) on conflict (item_id) do update set heals = excluded.heals;
--      (and the edge + client redeployed from the reverted src/data in the same sitting).
-- A character left pointing at a deleted stand is not stranded: hr_apply
-- refuses the next declaration and accrual refuses to pay rather than throwing.
-- ════════════════════════════════════════════════════════════════════════

-- ONE block, no begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends
-- the file as one batch). One block so the hr_items count captured in §0 is the
-- same variable §2 compares at the end; a raise anywhere reverts §1.
do $$
declare
  v_missing text;
  v_rows    int;
  v_items0  bigint;
  v_items1  bigint;
  v_bad     text;
  v_r       jsonb;
  v_ver     bigint;
  v_n       int;
  v_lo      bigint;
  v_hi      bigint;
  v_max     int;
  v_clan    uuid;
  v_skill   text;
  v_lv      int;
  v_new     text;
  v_old     text;
  v_m0      int;
  v_m1      int;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000b5560008';
  c_j       constant jsonb := '{"kind":"admin","intent":"deep-waters-probe"}'::jsonb;
  -- kind · activity_id · req_skill · req_lv. NO xp/ms/qty (see header).
  v_acts constant jsonb := '[
    ["gather", "lobster_reef_s",    "fishing", 47],
    ["gather", "swordfish_deeps_s", "fishing", 61],
    ["gather", "frostfin_reach_s",  "fishing", 71],
    ["gather", "shark_shelf_s",     "fishing", 83],
    ["gather", "deep_mithril_vein", "mining",  67],
    ["gather", "deep_ember_vein",   "mining",  82]
  ]'::jsonb;
begin
  -- ── 0. PRECONDITIONS (fail closed) ───────────────────────────────────────
  if to_regclass('public.hr_activities') is null then
    raise exception '§0: public.hr_activities is missing — apply '
                    '2026-08-11-catalogue.generated.sql first';
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['fishing','mining']) x
   where not exists (select 1 from public.hr_skills where skill_id = x);
  if v_missing is not null then
    raise exception '§0: hr_skills has no % row — apply 2026-08-11-catalogue.generated.sql first',
      v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['lobster','swordfish','frostfin','shark','mithril_ore','emberstone_ore',
                      'cooked_swordfish','cooked_frostfin','cooked_shark','cooked_moonfish']) x
   where not exists (select 1 from public.hr_items where item_id = x);
  if v_missing is not null then
    raise exception '§0: % is not a catalogue item — a stand would pay, or a heal would move, '
                    'an item that names nothing', v_missing;
  end if;
  if to_regclass('public.hr_feast_foods') is null then
    raise exception '§0: public.hr_feast_foods is missing — apply '
                    '2026-08-27-clan-economy-sinks.sql first';
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['cooked_swordfish','cooked_frostfin','cooked_shark','cooked_moonfish']) x
   where not exists (select 1 from public.hr_feast_foods where item_id = x);
  if v_missing is not null then
    raise exception '§0: hr_feast_foods has no % row — §1c would ADD Tavern food rather than '
                    're-price it', v_missing;
  end if;
  select count(*) into v_items0 from public.hr_items;

  -- ── 1a. SIX ACTIVITY ROWS ────────────────────────────────────────────────
  -- max_hp/is_boss are RESTATED (not defaulted) because the catalogue's own
  -- self-check asserts a non-combat row carries neither.
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
  raise notice 'deep-waters §1a: % of 6 activity rows moved (0 on a re-apply)', v_rows;

  -- ── 1b. FOUR ITEM HEALS (heals only) ─────────────────────────────────────
  update public.hr_items set heals = x.h
    from (values ('cooked_swordfish',32),('cooked_frostfin',38),
                 ('cooked_shark',44),('cooked_moonfish',50)) x(id, h)
   where item_id = x.id and heals is distinct from x.h;
  get diagnostics v_rows = row_count;
  raise notice 'deep-waters §1b: % of 4 item heals moved (0 on a re-apply)', v_rows;

  -- ── 1c. THE SAME FOUR HEALS ON THE TAVERN'S TABLE ────────────────────────
  -- The `where` keeps a re-apply tuple-free; the drift guard's parser still
  -- reads the block (it folds the ('id', n) pairs up to the `;`).
  insert into public.hr_feast_foods (item_id, heals) values ('cooked_swordfish',32),('cooked_frostfin',38),('cooked_shark',44),('cooked_moonfish',50) on conflict (item_id) do update set heals = excluded.heals
    where public.hr_feast_foods.heals is distinct from excluded.heals;
  get diagnostics v_rows = row_count;
  raise notice 'deep-waters §1c: % of 4 feast heals moved (0 on a re-apply)', v_rows;

  -- ── 2. SELF-VERIFYING COMMIT GATE (§4) ───────────────────────────────────
  -- Every claim is proved by EXECUTING it. The row-writing probes run in a
  -- subtransaction discarded by the HR813 sentinel, so this is net-zero on
  -- production ("player state is never fabricated"): no probe row survives.

  -- (a) THE SIX ROWS, restated literally (not read from v_acts) so a
  --     hand-edit that dropped a row from §1a cannot also silence its check.
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
      ('gather','lobster_reef_s','fishing',47),
      ('gather','swordfish_deeps_s','fishing',61),
      ('gather','frostfin_reach_s','fishing',71),
      ('gather','shark_shelf_s','fishing',83),
      ('gather','deep_mithril_vein','mining',67),
      ('gather','deep_ember_vein','mining',82)
    ) as x(kind, activity_id, req_skill, req_lv)
    join public.hr_activities a on a.kind = x.kind and a.activity_id = x.activity_id;
  if v_n <> 6 then
    raise exception 'GATE(a) CONTROL: hr_activities holds % of the 6 new stands — every missing '
                    'one is a tile the client offers and the realm answers unknown_activity for',
                    v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a Deep Waters stand did not land as ruled: %', v_bad;
  end if;

  -- (b) THE FISHING AND MINING BENCHES: none ungated, one node per level.
  --     Asserted over the WHOLE bench because this file inserts into the
  --     middle of both. NO exact total (see header): the named set is (a).
  select string_agg(activity_id, ', ' order by activity_id) into v_bad
    from public.hr_activities
   where kind = 'gather' and req_skill in ('fishing','mining') and req_lv is null;
  if v_bad is not null then
    raise exception 'GATE(b): a fishing/mining node has a NULL req_lv (%) — hr_apply '
                    'short-circuits its gate on NULL, so that node is ungated', v_bad;
  end if;
  select string_agg(req_skill || ' ' || req_lv, ', ' order by req_skill, req_lv) into v_bad
    from (select req_skill, req_lv from public.hr_activities
           where kind = 'gather' and req_skill in ('fishing','mining')
           group by req_skill, req_lv having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'GATE(b): more than one node on % — the ladder is no longer one rung per '
                    'level', v_bad;
  end if;

  -- (c) NO ITEM ADDED, AND THE FOUR HEALS AGREE IN BOTH TABLES. The count is
  --     compared against §0's capture, not a literal, so a pack that lands
  --     items first does not make this raise.
  select count(*) into v_items1 from public.hr_items;
  if v_items1 <> v_items0 then
    raise exception 'GATE(c): hr_items went from % to % rows — this file must add no item',
      v_items0, v_items1;
  end if;
  select count(*),
         string_agg(x.id || ': item ' || coalesce(i.heals::text,'NULL') || ' / feast '
                      || coalesce(f.heals::text,'NULL') || ' / auto_eatable '
                      || coalesce(i.auto_eatable::text,'NULL') || ' (want ' || x.h || ')',
                    ', ' order by x.id)
           filter (where i.heals is distinct from x.h or f.heals is distinct from x.h
                      or i.auto_eatable is not true)
    into v_n, v_bad
    from (values ('cooked_swordfish',32),('cooked_frostfin',38),
                 ('cooked_shark',44),('cooked_moonfish',50)) x(id, h)
    left join public.hr_items i on i.item_id = x.id
    left join public.hr_feast_foods f on f.item_id = x.id;
  if v_n <> 4 or v_bad is not null then
    raise exception 'GATE(c): the heal climb did not land as ruled in hr_items AND '
                    'hr_feast_foods (both must read the same number; all four auto-eatable): %',
                    v_bad;
  end if;

  -- (d) EXECUTED: hr_apply REFUSES Fishing 46 `lobster_reef_s` (req 47) and
  --     Mining 66 `deep_mithril_vein` (req 67), ACCEPTS the old rung below each
  --     at the same level (positive control), and ACCEPTS the new stand one
  --     level up with the pointer landing. Before §1a the refusal would read
  --     `unknown_activity` (the WRONG reason); a mis-typed req_lv reads `ok`.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(d): no probe character: %', v_r; end if;

    for v_skill, v_lv, v_new, v_old in
      select * from (values ('fishing', 47, 'lobster_reef_s',    'lobster_s'),
                            ('mining',  67, 'deep_mithril_vein', 'mithril_rock')) t(s, lv, n, o)
    loop
      select xp into v_lo from public.hr_xp_table where level = v_lv - 1;
      select xp into v_hi from public.hr_xp_table where level = v_lv;
      if v_lo is null or v_hi is null or v_hi <= v_lo
         or public.hr_level_from_xp(v_lo) <> v_lv - 1 then
        raise exception 'GATE(d) CANNOT RUN: hr_xp_table has no usable %/% rungs (%/%)',
          v_lv - 1, v_lv, v_lo, v_hi;
      end if;
      insert into public.player_skills (user_id, slot, skill_id, xp)
        values (v_uid, 0, v_skill, v_lo)
        on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;

      -- One level short: REFUSED as activity_locked, pointer unmoved.
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('activity',
                 jsonb_build_object('kind','gather','id',v_new,'restart',true),
                 'journal', c_j));
      if v_r->>'error' is distinct from 'activity_locked' then
        raise exception 'GATE(d): % % declaring % answered % — it must be activity_locked. '
                        '`unknown_activity` means §1a did not land; `ok` means the stand is off '
                        'its ruled level and the rung is free',
          initcap(v_skill), v_lv - 1, v_new, v_r;
      end if;
      if (select active_id from public.player_state where user_id = v_uid and slot = 0)
           is not distinct from v_new then
        raise exception 'GATE(d): the refused declaration still moved player_state.active_id';
      end if;

      -- POSITIVE CONTROL #1 — same level, the OLD rung below it. Without this a
      -- build that broke gather declarations outright would "pass" the refusal.
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('activity',
                 jsonb_build_object('kind','gather','id',v_old,'restart',true),
                 'journal', c_j));
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(d) CONTROL: % % was refused % — % — so gather declarations are '
                        'broken and the refusal measured nothing',
          initcap(v_skill), v_lv - 1, v_old, v_r;
      end if;

      -- POSITIVE CONTROL #2 — ONE level is the whole difference.
      update public.player_skills set xp = v_hi
       where user_id = v_uid and slot = 0 and skill_id = v_skill;
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('activity',
                 jsonb_build_object('kind','gather','id',v_new,'restart',true),
                 'journal', c_j));
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'GATE(d) CONTROL: % % was still refused % (%) — the stand is gated ABOVE '
                        'its ruled level and the rung is unreachable',
          initcap(v_skill), v_lv, v_new, v_r;
      end if;
      if (select active_id from public.player_state where user_id = v_uid and slot = 0)
           is distinct from v_new then
        raise exception 'GATE(d) CONTROL: the accepted % declaration did not become the live '
                        'pointer', v_new;
      end if;
    end loop;

    -- (e) EXECUTED: hr_rest HEALS 32 OFF EXACTLY ONE COOKED SWORDFISH. hr_rest
    --     and the cadence/recovery arm share the auto-eat pool query, so one
    --     Swordfish Steak and EXACTLY 32 hp missing proves the server reads the
    --     NEW heal (the old 22 would leave 10 missing, or eat nothing) and
    --     debits it. The bag is EMPTIED first: the start kit holds food and the
    --     loop eats the weakest provision first. A new character has max_hp 10,
    --     so the probe body is raised to 40 inside the discarded subtransaction.
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'cooked_swordfish', 1);
    v_max := 40;
    -- Back to idle with a FRESH watermark: GATE(d) left the character gathering,
    -- and hr_rest refuses `collect_first` once an unsettled window is open.
    update public.player_state
       set max_hp = v_max, hp = v_max - 32, recovering_until = now() + interval '1 hour',
           active_kind = 'idle', active_id = null, accrued_to = now()
     where user_id = v_uid and slot = 0;
    v_r := public.hr_rest(0, gen_random_uuid());
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e): hr_rest with one Swordfish Steak and 32 hp missing answered % — '
                      '`insufficient_food` means the server does not value it at 32', v_r;
    end if;
    if (v_r->'rested'->>'healed_hp')::int <> 32
       or (v_r->'rested'->>'units')::int <> 1
       or v_r->'rested'->'spent' is distinct from '{"cooked_swordfish": 1}'::jsonb then
      raise exception 'GATE(e): the rest healed % hp using % unit(s) of % — the ruled heal is 32 '
                      'from exactly one Swordfish Steak',
        v_r->'rested'->>'healed_hp', v_r->'rested'->>'units', v_r->'rested'->'spent';
    end if;
    if exists (select 1 from public.player_inventory
                where user_id = v_uid and slot = 0 and item_id = 'cooked_swordfish') then
      raise exception 'GATE(e): the rest healed but did not DEBIT the fish — a free heal';
    end if;

    -- (f) EXECUTED: A TAVERN CLAN TAKES ONE COOKED MOONFISH AT EXACTLY 50.
    --     The meter moves on hr_feast_foods, never on a client number.
    insert into public.clans (name, created_by, upgrades)
      values ('__deep_waters_probe__', v_uid, '{"tavern":"1"}'::jsonb) returning id into v_clan;
    insert into public.clan_members (clan_id, user_id, role) values (v_clan, v_uid, 'leader');
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'cooked_moonfish', 1);
    select coalesce(max(feast_meter), 0) into v_m0 from public.clan_tavern where clan_id = v_clan;
    v_r := public.clan_feast_deposit(v_clan, 'cooked_moonfish', 1);
    select coalesce(max(feast_meter), 0) into v_m1 from public.clan_tavern where clan_id = v_clan;
    if coalesce(v_r->>'ok','false') <> 'true' or (v_r->>'added')::int <> 50 or v_m1 - v_m0 <> 50 then
      raise exception 'GATE(f): a Tavern-1 clan took one Moonfish Fillet as % (meter % -> %) — '
                      'the ruled feast heal is exactly 50', v_r, v_m0, v_m1;
    end if;
    if exists (select 1 from public.player_inventory
                where user_id = v_uid and slot = 0 and item_id = 'cooked_moonfish') then
      raise exception 'GATE(f): the Tavern took the Moonfish but did not DEBIT it';
    end if;

    raise exception using errcode = 'HR813',
      message = 'deep-waters §2 complete — rolling back';
  exception when sqlstate 'HR813' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character and a clan into
  -- production as a side effect of verifying itself (CLAUDE.md §2).
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.hr_rejections    where user_id = v_uid)
     or exists (select 1 from public.clans            where created_by = v_uid
                                                          or name = '__deep_waters_probe__')
     or exists (select 1 from public.clan_members     where user_id = v_uid)
     or exists (select 1 from public.clan_tavern      where clan_id = v_clan)
     or exists (select 1 from public.clan_ledger      where clan_id = v_clan)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'deep-waters: 6 stands (fishing/mining one per level, none ungated), hr_items '
               'unchanged at %, heals 32/38/44/50 agree in hr_items and hr_feast_foods, '
               'hr_apply refuses Fishing 46 / Mining 66 and accepts at 47 / 67, hr_rest heals '
               '32 off one Swordfish Steak, a Tavern takes one Moonfish at 50 — all green',
               v_items1;
end $$;
