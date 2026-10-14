-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-23-first-hour-boots.sql
--
-- ONE DATA ROW, NO FUNCTION BODY, NO GRANT, NO NEW OBJECT:
--
--   §1 `hr_activities` ('artisan','tailor_leather_boots') req_lv 8 -> 3.
--
-- ⚠ LANE C. A light Security look BEFORE apply (it moves a recipe gate the
--   server enforces). The Coordinator applies with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-23-first-hour-boots.sql`.
--
-- ── WHY (Game Designer, loop check 2026-10-14, finding #3) ─────────────────
--   Spine step 7 is "Craft and wear Leather Boots", the first gear a new hero
--   makes. At Crafting 8 the only silk-free way up was the Normal Plank
--   (10 book XP x PACE.xp 0.39, floored = 3 XP a plank): ~267 planks, about
--   35-40 minutes of chopping and sawing about 12 minutes into the game. At
--   Crafting 3 (174 XP) it is ~58 planks, about 8 minutes. The pointer bar
--   reads the level from the recipe row (src/data/spine-pointer.js
--   craftParts), so the bar and this gate cannot disagree.
--
--   The other half, Leather Boots OFF the Local Shop (a 250-gold copy turned
--   "craft and wear" into "buy and wear"), is EDGE-ONLY: the shop's gold
--   offers are derived from src/data/shops.js inside hr-accrue (no SQL table
--   sells item-for-gold; see 2026-10-10-w0a-catalogue-cuts.sql "THE SHOP").
--   The vendor bid does not move: the boots vendor at book (90, crafted)
--   either way, because the b565 buy-back cap (half of 250 = 125) was never
--   the binding price. The craft's margin is unchanged too (2 raw Wolf Pelts
--   vendor at 7 each); only the level it opens at moves.
--
-- ── WHAT THE SERVER NEEDS, AND WHAT IT DOES NOT ────────────────────────────
--   hr_activities is the ONLY server-side level gate for a bench rung:
--   hr_apply's activity arm re-checks req_skill/req_lv against SERVER xp
--   (`activity_locked`). xp, ms and the input map reach the server through the
--   EDGE PAYLOAD (hr-accrue imports src/data/recipes.js); none is copied here.
--   src/data/recipes.js is the author; 2026-08-11-catalogue.generated.sql is
--   regenerated in the same commit (tools/gen-catalogues.mjs --check), so a
--   REBUILD already lands req_lv 3 and this file is then a no-op that still
--   runs its proof.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
--   apply THIS -> hr-accrue redeploy -> client push. Each half fails safe
--   alone: rows first, a Crafting 3-7 hero may declare the boots and the edge
--   pays them (it already holds the recipe; only its req moved); client first,
--   a Crafting 3-7 tap is refused `activity_locked` and nothing is lost.
--
-- ── WHAT AN EXISTING CHARACTER SEES ────────────────────────────────────────
--   A hero at Crafting 3-7 can now tailor the boots. Nothing is granted or
--   taken back. Boots already bought from the shop stay theirs.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   update public.hr_activities set req_lv = 8
--    where kind = 'artisan' and activity_id = 'tailor_leather_boots';
--   and revert src/data/recipes.js + src/legacy.js EQUIP_SHOP in lockstep
--   (regenerate shops.js and the catalogue), then edge + client.
--
-- RE-RUNNABLE: §0 accepts the pre-state (8) or the post-state (3).
-- ════════════════════════════════════════════════════════════════════════

-- ONE block, no begin/commit (CLAUDE.md §2: tools/apply-migration.mjs sends
-- the file as one batch). A raise anywhere reverts §1.
do $$
declare
  v_lv   int;
  v_rows int;
  v_r    jsonb;
  v_ver  bigint;
  v_lo   bigint;
  v_hi   bigint;
  v_uid  constant uuid := '00000000-0000-4000-8000-00000b0075e1';
  c_j    constant jsonb := '{"kind":"admin","intent":"first-hour-boots-probe"}'::jsonb;
begin
  -- ── 0. PRECONDITIONS (fail closed) ───────────────────────────────────────
  if to_regclass('public.hr_activities') is null or to_regclass('public.hr_skills') is null then
    raise exception '§0: a catalogue table is missing - apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if not exists (select 1 from public.hr_skills where skill_id = 'crafting') then
    raise exception '§0: hr_skills has no crafting row';
  end if;
  if not exists (select 1 from public.hr_items where item_id = 'leather_boots') then
    raise exception '§0: leather_boots is not a catalogue item';
  end if;
  select req_lv into v_lv from public.hr_activities
   where kind = 'artisan' and activity_id = 'tailor_leather_boots' and req_skill = 'crafting';
  if v_lv is null then
    raise exception '§0: hr_activities has no crafting row for tailor_leather_boots';
  end if;
  if v_lv not in (8, 3) then
    raise exception '§0: tailor_leather_boots is gated at Crafting % - expected 8 (before) or 3 (after); '
                    'something else moved it, so the Coordinator decides', v_lv;
  end if;

  -- ── 1. THE GATE ──────────────────────────────────────────────────────────
  update public.hr_activities set req_lv = 3
   where kind = 'artisan' and activity_id = 'tailor_leather_boots' and req_lv is distinct from 3;
  get diagnostics v_rows = row_count;
  raise notice 'first-hour-boots §1: % of 1 activity row moved (0 on a re-apply)', v_rows;

  -- ── 2. SELF-VERIFYING COMMIT GATE (§4) ───────────────────────────────────
  -- (a) DECLARED: the row is exactly as ruled, and only one row names it.
  if (select count(*) from public.hr_activities where activity_id = 'tailor_leather_boots') <> 1
     or not exists (select 1 from public.hr_activities
                     where kind = 'artisan' and activity_id = 'tailor_leather_boots'
                       and req_skill = 'crafting' and req_lv = 3) then
    raise exception 'GATE(a): tailor_leather_boots is not one artisan row at Crafting 3';
  end if;

  -- (b) EXECUTED: through hr_apply, a Crafting 2 hero is refused the boots and
  --     a Crafting 3 hero is not. The refusal is the property; the acceptance
  --     is its control (a gate that refuses everyone also "refuses at 2").
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(b) CANNOT RUN: hr_create_character missing - apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  select xp into v_lo from public.hr_xp_table where level = 2;
  select xp into v_hi from public.hr_xp_table where level = 3;
  if v_lo is null or v_hi is null or v_hi <= v_lo
     or public.hr_level_from_xp(v_lo) <> 2 or public.hr_level_from_xp(v_hi) <> 3 then
    raise exception 'GATE(b) CANNOT RUN: hr_xp_table has no usable 2/3 rungs (%/%)', v_lo, v_hi;
  end if;
  begin  -- ── SUBTRANSACTION: every probe row is rolled back below ─────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then
      raise exception 'GATE(b): no probe character: %', v_r; end if;

    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'crafting', v_lo)
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','tailor_leather_boots','restart',true),
               'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(b): Crafting 2 declaring tailor_leather_boots answered % - it must be '
                      'activity_locked', v_r;
    end if;

    update public.player_skills set xp = v_hi
     where user_id = v_uid and slot = 0 and skill_id = 'crafting';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('activity',
               jsonb_build_object('kind','artisan','id','tailor_leather_boots','restart',true),
               'journal', c_j));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(b) CONTROL: Crafting 3 was refused tailor_leather_boots (%) - the '
                      'gate still sits above 3', v_r;
    end if;
    if (select active_id from public.player_state where user_id = v_uid and slot = 0)
         is distinct from 'tailor_leather_boots' then
      raise exception 'GATE(b): the accepted declaration did not become the pointer';
    end if;

    raise exception using errcode = 'HR873',
      message = 'first-hour-boots §2 complete - rolling back';
  exception when sqlstate 'HR873' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF (CLAUDE.md §2: no admin SQL leaves a character behind).
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

  raise notice 'first-hour-boots: tailor_leather_boots gated at Crafting 3; hr_apply refuses it '
               'at 2 and accepts it at 3 - all green';
end $$;
