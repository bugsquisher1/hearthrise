-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-w0e-ammo-runecraft.sql
--
-- ONE DATA CLOSURE, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT:
--
--   §1a ONE new `hr_items` row: rune_essence (Rune Essence, value 15, tradeable,
--       not equippable, not food).
--   §1b FIVE `hr_activities` moves (all kind 'artisan'):
--         + mine_rune_essence   runecrafting 1   (new, input-free, pays MINING)
--         ~ cut_rune_blanks     stonemason 1  -> runecrafting 1
--         ~ split_rune_blanks   stonemason 22 -> runecrafting 12
--         ~ bind_earth_runes    runecrafting 15 -> runecrafting 1
--         - bind_air_runes      deleted (air runes are now kit + shop only)
--   §1c THREE `hr_start_inventory` rows: bronze_arrows 50, air_rune 50,
--       coarse_whetstone 10 — the free tier-1 rung of every ammo ladder.
--   §1d THREE `hr_items.value` moves to 0 (bronze_arrows 1, air_rune 1,
--       coarse_whetstone 4): kit + shop stock books at nothing (Security #1:
--       the 1 g vendor floor made the shop buy-back cap unreachable).
--
-- W0 coherence audit (Game Designer, 2026-10-09; Tyler: "do it all"):
--   Top-10 #7 AMMO: an empty bow/staff slot now counts as "run dry" (x0.25 max
--     hit, src/core/ammo.js AMMO_EMPTY_SLOT_IS_DRY — an EDGE-PAYLOAD change,
--     not in this database). So no new player is punished, the free tier-1 rung
--     of each ladder is in the starter kit (§1c) and on the Local Shop counter
--     (edge catalogue, src/data/shops.js — not in this database).
--   RUNECRAFTING RULING: the skill starts on EARTH runes (spent 1/cast) at 1,
--     and cuts its own blanks from Rune Essence it mines on its own bench at 1,
--     so it no longer needs Stonemason to start. Air runes leave the bench.
--   Top-10 #8 PRAYER (ward by tier) is entirely EDGE-PAYLOAD (src/core/combat.js
--     monsterCombatRolls + src/data/skills.js PRAYER_WARDS); nothing here.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_items          hr_apply refuses an unknown item id; rune_essence must
--                     exist before an accrual can credit it.
--   hr_activities     hr_apply's activity arm refuses an id with no row
--                     (`unknown_activity`) and re-checks req_skill/req_lv
--                     against SERVER xp (`activity_locked`). These rows are the
--                     ONLY server-side level gate for the bench.
--   hr_start_inventory hr_create_character builds a new character's bag from it.
--
-- ⚠ `xp`, `ms`, YIELD, xpSkill AND THE RECIPE INPUT MAPS ARE NOT IN THIS
--   DATABASE and are not asserted here. They reach the server through the EDGE
--   PAYLOAD (hr-accrue imports src/data/stonecraft.js via recipes.js). Do NOT
--   hand-copy them into SQL: an XP copy here is a FAUCET.
--
-- ── THE ECONOMY HALF ───────────────────────────────────────────────────────
--   mine_rune_essence mints from nothing (the quarry pattern): 2 essence per
--   3.0 s book action, paced 1,500/h. Vendored at the RAW 20% bid (items.js
--   RAW_QUARRIED) = 3 g each, 4,500 g/h — level with the shipped level-1 Rubble
--   quarry (4,327 g/h at its floored 1 g bid x 5), so mining essence is not a
--   better level-1 gold faucet than one Security already accepted; its real
--   sink is Runecrafting. Per-call clamps unchanged (15 h x 1,500 = 22,500
--   units, far under c_max_item_delta 1,000,000). The blank cuts are 1.0x /
--   1.11x input BOOK value and 3.0x / 3.3x at the vendor (recipe-yield-guard
--   RATIO_CAP 5x), so the blank lane mints no gold. The three kit
--   ammo rows are ammoPerShot 0 (never deplete), value 1/1/4: 140 g of book
--   value per new character, vendored at full book (crafted) = 140 g once.
--
-- ⚠ ORDER: apply -> hr-accrue redeploy -> client push, in ONE cut sitting.
--   Client first: the bench offers mine_rune_essence and the realm answers
--   unknown_activity (fails closed). Edge behind the rows: an away window on
--   mine_rune_essence is refused unknown_recipe (fails closed); an attended
--   bind_air_runes in flight is refused at its next declaration (fails closed).
--
-- REVERSIBILITY:
--   insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
--     values ('artisan','bind_air_runes','runecrafting',1,null,false) on conflict do nothing;
--   update public.hr_activities set req_skill='stonemason', req_lv=1  where kind='artisan' and activity_id='cut_rune_blanks';
--   update public.hr_activities set req_skill='stonemason', req_lv=22 where kind='artisan' and activity_id='split_rune_blanks';
--   update public.hr_activities set req_lv=15 where kind='artisan' and activity_id='bind_earth_runes';
--   delete from public.hr_activities where kind='artisan' and activity_id='mine_rune_essence';
--   delete from public.hr_start_inventory where item_id in ('bronze_arrows','air_rune','coarse_whetstone');
--   (hr_items rune_essence is only honest to delete BEFORE anyone holds one.)
--   Pair with an edge + client redeploy from the reverted src/data.
-- ════════════════════════════════════════════════════════════════════════

-- ONE block, no begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends
-- the file as one batch). A raise anywhere reverts §1.
do $$
declare
  v_missing text;
  v_rows    int;
  v_bad     text;
  v_n       int;
  v_r       jsonb;
  v_ver     bigint;
  v_lo      bigint;
  v_hi      bigint;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000b5660e01';
  c_j       constant jsonb := '{"kind":"admin","intent":"w0e-ammo-runecraft-probe"}'::jsonb;
begin
  -- ── 0. PRECONDITIONS (fail closed) ───────────────────────────────────────
  if to_regclass('public.hr_activities') is null
     or to_regclass('public.hr_items') is null
     or to_regclass('public.hr_start_inventory') is null then
    raise exception '§0: a catalogue table is missing — apply 2026-08-11-catalogue.generated.sql first';
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['runecrafting','mining','stonemason','magic','ranged']) x
   where not exists (select 1 from public.hr_skills where skill_id = x);
  if v_missing is not null then
    raise exception '§0: hr_skills has no % row — apply 2026-08-11-catalogue.generated.sql first', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing
    from unnest(array['rune_blank','earth_rune','air_rune','bronze_arrows','coarse_whetstone']) x
   where not exists (select 1 from public.hr_items where item_id = x);
  if v_missing is not null then
    raise exception '§0: % is not a catalogue item — the kit or a rung would name nothing', v_missing;
  end if;

  -- ── 1a. ONE ITEM ─────────────────────────────────────────────────────────
  insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable)
    values ('rune_essence','Rune Essence',true,null,15,null,null,null,false)
    on conflict (item_id) do update
       set name = excluded.name, tradeable = excluded.tradeable, kind = excluded.kind,
           value = excluded.value, req_skill = excluded.req_skill, req_lv = excluded.req_lv,
           heals = excluded.heals, auto_eatable = excluded.auto_eatable
     where (public.hr_items.name, public.hr_items.tradeable, public.hr_items.kind,
            public.hr_items.value, public.hr_items.req_skill, public.hr_items.req_lv,
            public.hr_items.heals, public.hr_items.auto_eatable)
           is distinct from
           (excluded.name, excluded.tradeable, excluded.kind, excluded.value,
            excluded.req_skill, excluded.req_lv, excluded.heals, excluded.auto_eatable);
  get diagnostics v_rows = row_count;
  raise notice 'w0e §1a: % of 1 item rows moved (0 on a re-apply)', v_rows;

  -- ── 1b. THE RUNECRAFTING BENCH ───────────────────────────────────────────
  insert into public.hr_activities (kind, activity_id, req_skill, req_lv, max_hp, is_boss)
  values ('artisan','mine_rune_essence','runecrafting',1,null,false),
         ('artisan','cut_rune_blanks','runecrafting',1,null,false),
         ('artisan','split_rune_blanks','runecrafting',12,null,false),
         ('artisan','bind_earth_runes','runecrafting',1,null,false)
      on conflict (kind, activity_id) do update
         set req_skill = excluded.req_skill, req_lv = excluded.req_lv,
             max_hp = excluded.max_hp, is_boss = excluded.is_boss
       where public.hr_activities.req_skill is distinct from excluded.req_skill
          or public.hr_activities.req_lv    is distinct from excluded.req_lv
          or public.hr_activities.max_hp    is distinct from excluded.max_hp
          or public.hr_activities.is_boss   is distinct from excluded.is_boss;
  get diagnostics v_rows = row_count;
  raise notice 'w0e §1b: % of 4 activity rows moved (0 on a re-apply)', v_rows;
  delete from public.hr_activities where kind = 'artisan' and activity_id = 'bind_air_runes';
  get diagnostics v_rows = row_count;
  raise notice 'w0e §1b: % bind_air_runes row(s) retired (0 on a re-apply)', v_rows;

  -- ── 1c. THE STARTER KIT CARRIES EVERY FREE TIER-1 AMMO RUNG ──────────────
  insert into public.hr_start_inventory (item_id, qty)
  values ('bronze_arrows',50),('air_rune',50),('coarse_whetstone',10)
      on conflict (item_id) do update set qty = excluded.qty
       where public.hr_start_inventory.qty is distinct from excluded.qty;
  get diagnostics v_rows = row_count;
  raise notice 'w0e §1c: % of 3 kit rows moved (0 on a re-apply)', v_rows;

  -- ── 1d. THE FREE RUNGS BOOK AT 0 ─────────────────────────────────────────
  update public.hr_items set value = 0
   where item_id in ('bronze_arrows','air_rune','coarse_whetstone') and value is distinct from 0;
  get diagnostics v_rows = row_count;
  raise notice 'w0e §1d: % of 3 item values moved to 0 (0 on a re-apply)', v_rows;

  -- ── 2. SELF-VERIFYING COMMIT GATE (§4) ───────────────────────────────────
  -- Every claim is proved by EXECUTING it. The row-writing probe runs in a
  -- subtransaction discarded by the HR816 sentinel, so this file is net-zero
  -- on production ("player state is never fabricated").

  -- (a) THE ROWS, restated literally (not read from §1) so a hand-edit that
  --     dropped a row from §1 cannot also silence its check.
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
      ('mine_rune_essence','runecrafting',1),
      ('cut_rune_blanks','runecrafting',1),
      ('split_rune_blanks','runecrafting',12),
      ('bind_earth_runes','runecrafting',1)
    ) as x(activity_id, req_skill, req_lv)
    join public.hr_activities a on a.kind = 'artisan' and a.activity_id = x.activity_id;
  if v_n <> 4 then
    raise exception 'GATE(a) CONTROL: hr_activities holds % of the 4 ruled rungs', v_n;
  end if;
  if v_bad is not null then
    raise exception 'GATE(a): a W0 Runecrafting rung did not land as ruled: %', v_bad;
  end if;
  if exists (select 1 from public.hr_activities where activity_id = 'bind_air_runes') then
    raise exception 'GATE(a): bind_air_runes is still a server activity — the bench would '
                    'still make a rune nothing spends';
  end if;
  select string_agg(item_id, ', ') into v_bad from public.hr_items
   where item_id = 'rune_essence'
     and (tradeable is not true or kind is not null or value <> 15 or req_skill is not null
          or req_lv is not null or heals is not null or auto_eatable is not false);
  if v_bad is not null or not exists (select 1 from public.hr_items where item_id = 'rune_essence') then
    raise exception 'GATE(a): rune_essence did not land as ruled (tradeable, no kind, value 15, '
                    'no gate, not food)';
  end if;

  -- (a2) THE FREE RUNGS BOOK AT 0 (restated).
  select count(*) into v_n from public.hr_items
   where item_id in ('bronze_arrows','air_rune','coarse_whetstone') and value = 0;
  if v_n <> 3 then
    raise exception 'GATE(a2): % of the 3 free tier-1 ammo items book at 0 — a kit or shop '
                    'bundle would vendor for gold', v_n;
  end if;

  -- (b) THE KIT, restated, with a CONTROL that the table still holds the food
  --     bridge (a wholesale reseed would pass the three-row check alone).
  select count(*),
         string_agg(x.id || '=' || coalesce(k.qty::text,'MISSING') || ' (want ' || x.q || ')', ', ')
           filter (where k.qty is distinct from x.q)
    into v_n, v_bad
    from (values ('bronze_arrows',50),('air_rune',50),('coarse_whetstone',10),
                 ('cooked_shrimp',20)) as x(id, q)
    left join public.hr_start_inventory k on k.item_id = x.id;
  if v_n <> 4 or v_bad is not null then
    raise exception 'GATE(b): the starter kit does not carry the ruled ammo + food bridge: %', v_bad;
  end if;

  -- (c) EXECUTED: a NEW CHARACTER is created holding all three free rungs, and
  --     the bench gates as ruled through hr_apply.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_lo from public.hr_xp_table where level = 11;
  select xp into v_hi from public.hr_xp_table where level = 12;
  if v_lo is null or v_hi is null or v_hi <= v_lo or public.hr_level_from_xp(v_lo) <> 11 then
    raise exception 'GATE(c) CANNOT RUN: hr_xp_table has no usable 11/12 rungs (%/%)', v_lo, v_hi;
  end if;
  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(c): no probe character: %', v_r; end if;

    select count(*) into v_n from public.player_inventory
     where user_id = v_uid and slot = 0
       and ((item_id = 'bronze_arrows' and qty = 50) or (item_id = 'air_rune' and qty = 50)
            or (item_id = 'coarse_whetstone' and qty = 10));
    if v_n <> 3 then
      raise exception 'GATE(c): a new character holds % of the 3 free ammo stacks — '
                      'hr_create_character is not reading the kit', v_n;
    end if;

    -- The retired rung is REFUSED as unknown, not as locked.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','bind_air_runes','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'unknown_activity' then
      raise exception 'GATE(c): declaring bind_air_runes answered % — it must be unknown_activity', v_r;
    end if;

    -- A Runecrafting-1 character may mine essence and bind earth (the whole
    -- point: the skill starts with nothing else trained). POSITIVE CONTROL for
    -- the refusal above.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','mine_rune_essence','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c) CONTROL: a level-1 character was refused mine_rune_essence (%)', v_r;
    end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','bind_earth_runes','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c): a Runecrafting-1 character was refused bind_earth_runes (%) — '
                      'the first rung still sits above level 1', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'bind_earth_runes' then
      raise exception 'GATE(c): the accepted bind_earth_runes declaration did not become the pointer';
    end if;

    -- split_rune_blanks: refused at Runecrafting 11, accepted at 12. Proves the
    -- gate reads RUNECRAFTING (Stonemason stays 0 throughout).
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'runecrafting', v_lo)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','split_rune_blanks','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(c): Runecrafting 11 declaring split_rune_blanks answered % — it must '
                      'be activity_locked', v_r;
    end if;
    update public.player_skills set xp = v_hi
     where user_id = v_uid and slot = 0 and skill_id = 'runecrafting';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','split_rune_blanks','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(c) CONTROL: Runecrafting 12 (Stonemason 1) was refused '
                      'split_rune_blanks (%) — the rung still reads Stonemason', v_r;
    end if;

    raise exception using errcode = 'HR816',
      message = 'w0e §2 complete — rolling back';
  exception when sqlstate 'HR816' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF (CLAUDE.md §2).
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.hr_rejections    where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'w0e: rune_essence item, Runecrafting bench (essence/cut/earth at 1, split at 12, '
               'air retired), kit carries 3 free ammo rungs; hr_create_character grants them, '
               'hr_apply refuses bind_air_runes unknown and gates split_rune_blanks on '
               'Runecrafting 12 — all green';
end $$;
