-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-w0a-catalogue-cuts.sql
--
-- W0 (coherence audit 2026-10-09, Tyler: "do it all"). THE SERVER HALF OF THE
-- CUT LIST, in one file:
--
--   §1a FORTY-ONE hr_items rows (and their hr_item_slots pairs) are DELETED:
--       the 40 items no player could ever obtain (catalogued ahead of effect
--       engines that never landed: 21 with no source and no use, 19 equippables
--       nobody could get) and muster_seal (the Rally Seal, a currency nothing
--       spent). One hr_unlocks row goes with them: recipe:dragon_marrow_recipe.
--   §1b hr_catalogue_meta.digest moves to the regenerated catalogue's digest
--       (be3ddebbf24f…, 497 items) so the
--       database states which generation it carries.
--   §1c world_event_claim__ungated is RESTATED from its chain end
--       (2026-08-20-muster-chest-items.sql) with the Rally Seal removed: it no
--       longer computes, journals or returns `seals`. Nothing else in the body
--       moves — same band arithmetic, same consume-before-credit, same themed
--       chest (hr_rally_chest is now always called with p_seals = 0), same
--       ledger row minus the one meta key. The wrapper world_event_claim (and its
--       SETTLE-BEFORE-MUTATE prefix) is untouched: same arity, grants kept.
--
-- ── WHAT THIS FILE DOES NOT TOUCH, AND WHY THAT IS SAFE ────────────────────
--   PLAYER STATE. No player row is written. §0 REFUSES TO APPLY if any table in
--   public with an item_id column (player_inventory, the bank, equipment,
--   market listings and buy offers, world_finds, …) holds one of the 41 ids, or
--   any unlock_id table holds the cut recipe — those items had no source, so the
--   expected count is zero, and if it is not, the Coordinator decides rather
--   than this file deleting what a player holds (CLAUDE.md §2).
--   THE SHOP. The Local Shop's starter-only change (eight Iron/Steel/Longbow/
--   Oak Staff offers gone) is EDGE-ONLY: GOLD_OFFERS is derived from
--   src/data/shops.js inside hr-accrue (no SQL shop table exists for
--   item-for-gold). It ships with the edge deploy, and the eight items' vendor
--   bid follows (the b565 buy-back cap applies only to items the shop sells).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
--   apply THIS -> hr-accrue redeploy -> client push, in one cut sitting. Each
--   half fails closed alone: a client that still names a cut id gets
--   unknown_item from hr_apply; an edge still selling Iron gear sells an item
--   that still exists until the deploy.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-applying 2026-08-11-catalogue.generated.sql from the PREVIOUS generation
--   (git show <pre-W0>:supabase/migrations/2026-08-11-catalogue.generated.sql)
--   restores the 41 rows, their slots and the digest; the pre-W0
--   2026-08-16-unlocks.generated.sql restores the unlock row; the claim body is
--   restored by re-applying 2026-08-20-muster-chest-items.sql §2.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1c. THE CLAIM BODY WITHOUT THE SEAL (top level: a function definition) ──
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
  v_median   numeric;
  v_rows     int;
  v_slot     int := coalesce(p_slot, 0);
  v_gold     bigint := 0;
  v_gems     int    := 0;
  v_band     text   := 'none';
  v_held     boolean := false;
  -- themed-chest locals
  v_chest    jsonb;
  v_gold_out bigint;
  v_gems_out int;
  v_it       jsonb;
  v_iid      text;
  v_iqty     bigint;
  v_qty_total bigint := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- The credit target must be one of the caller's OWN characters. Checked BEFORE
  -- any consume, so a bad/foreign slot never spends the claim. auth.uid() scopes
  -- it to the caller, so a forged slot can only miss the caller's own rows.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Ceiling per §5.2: 7,500 gold · 10 gems. No hearth_token. (W0: the Rally
  -- Seal is cut — this body no longer computes, journals or returns one.)
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2;
  end if;

  -- ── THE CONSUME. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- ── THE THEMED CHEST. Server owns the pool AND the conversion (rally-v2 §3).
  --    Converts a slice of the band gold into domain materials + XP and returns
  --    the reduced gold (goldOut). No client value crosses in — event_key is the
  --    server's own join row, hr_rally_chest re-derives the theme from it.
  v_chest    := public.hr_rally_chest(v_join.event_key, v_gold, v_gems, 0);
  v_gold_out := coalesce((v_chest->>'gold')::bigint, v_gold);
  v_gems_out := coalesce((v_chest->>'gems')::int,    v_gems);

  -- ── THE CREDIT (after the consume guard → exactly once). Same transaction as
  --    the consume, so a rollback undoes both; a replay never reaches here.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         gems = coalesce(gems, 0) + v_gems_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  -- ── THE ITEMS. Written to player_inventory — the source of truth the accrual
  --    absolute envelope is built FROM, so a credited item survives the flip by
  --    construction. Additive upsert (existing qty + granted), scoped to the
  --    caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold_out, 0, 0, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems', v_gems_out,
                        'day_key', p_day_key,
                        'event_key', v_join.event_key,
                        'band_gold', v_gold, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out,
    'items', v_chest->'items', 'xp', v_chest->'xp',
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true, 'chest', true);
end $$;

-- ONE block, no begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends
-- the file as one batch). A raise anywhere reverts the whole file, the body
-- above included.
do $$
declare
  v_cut constant text[] := array['hunters_torc',
    'frost_locket',
    'tally_ring',
    'bone_earrings',
    'pathfinder_studs',
    'unlit_earrings',
    'hearthbread',
    'travellers_stew',
    'winterdraught',
    'ratters_bait',
    'grave_salt',
    'kettle_tea',
    'field_ledger',
    'tithe_box',
    'carters_strap',
    'surveyors_chain',
    'colossus_plate',
    'heartwood_cape',
    'draconias_jaw',
    'cutpurse_gloves',
    'pitlord_irons',
    'bestiary_cloak',
    'hearthstone_signet',
    'chronicle_ribbon',
    'colossus_seal',
    'weathervane',
    'vaultstone',
    'arrows_of_ember',
    'arrows_of_frost',
    'arrows_of_poison',
    'whetstone_of_ember',
    'whetstone_of_frost',
    'whetstone_of_poison',
    'bone_fletching_knife',
    'steel_fletching_knife',
    'dawn_fletching_knife',
    'bronze_masons_rule',
    'steel_masons_rule',
    'dawn_masons_rule',
    'dragon_marrow_recipe',
    'muster_seal'];
  v_t        record;
  v_n        bigint;
  v_bad      text := '';
  v_items0   bigint;
  v_items1   bigint;
  v_present  bigint;
  v_rows     int;
  v_r        jsonb;
  v_ver      bigint;
  v_day      text;
  v_key      text;
  v_gold0    bigint;
  v_gold1    bigint;
  v_uid      constant uuid := '00000000-0000-4000-8000-0000b5660a01';
  c_j        constant jsonb := '{"kind":"admin","intent":"w0a-cuts-probe"}'::jsonb;
begin
  -- ── 0. PRECONDITIONS (fail closed) ───────────────────────────────────────
  if to_regclass('public.hr_items') is null or to_regclass('public.hr_item_slots') is null
     or to_regclass('public.hr_unlocks') is null or to_regclass('public.hr_catalogue_meta') is null then
    raise exception '§0: a catalogue table is missing — apply 2026-08-11-catalogue.generated.sql '
                    'and 2026-08-16-unlocks.generated.sql first';
  end if;
  if to_regprocedure('public.world_event_claim(text,int)') is null
     or to_regprocedure('public.hr_rally_chest(text,bigint,integer,integer)') is null then
    raise exception '§0: the muster claim chain is missing — apply 2026-08-20-muster-chest-items.sql first';
  end if;
  if array_length(v_cut, 1) <> 41 then
    raise exception '§0: the cut list holds % ids, expected 41', array_length(v_cut, 1);
  end if;

  -- §0b NO PLAYER (OR OTHER CATALOGUE) ROW NAMES A CUT ID. Every base table in
  -- public with an item_id column is scanned, so a table added after this file
  -- was written is covered too.
  for v_t in
    select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'item_id' and t.table_type = 'BASE TABLE'
       and c.table_name not in ('hr_items', 'hr_item_slots')
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where item_id = any($1)', v_t.table_name) into v_n using v_cut;
    if v_n > 0 then v_bad := v_bad || format(' %s=%s', v_t.table_name, v_n); end if;
  end loop;
  for v_t in
    select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'unlock_id' and t.table_type = 'BASE TABLE'
       and c.table_name <> 'hr_unlocks'
  loop
    execute format('select count(*) from public.%I where unlock_id = %L', v_t.table_name, 'recipe:dragon_marrow_recipe') into v_n;
    if v_n > 0 then v_bad := v_bad || format(' %s=%s', v_t.table_name, v_n); end if;
  end loop;
  if v_bad <> '' then
    raise exception '§0b REFUSED: rows still name a cut id (%) — these items had no source, so '
                    'this is a finding for the Coordinator, not something this file deletes', v_bad;
  end if;

  select count(*) into v_items0 from public.hr_items;
  select count(*) into v_present from public.hr_items where item_id = any(v_cut);

  -- ── 1a. THE ROWS ─────────────────────────────────────────────────────────
  delete from public.hr_item_slots where item_id = any(v_cut);
  get diagnostics v_rows = row_count;
  raise notice 'w0a §1a: % hr_item_slots pair(s) removed', v_rows;
  delete from public.hr_items where item_id = any(v_cut);
  get diagnostics v_rows = row_count;
  raise notice 'w0a §1a: % of 41 hr_items rows removed (0 on a re-apply)', v_rows;
  delete from public.hr_unlocks where unlock_id = 'recipe:dragon_marrow_recipe';

  -- ── 1b. THE DIGEST ───────────────────────────────────────────────────────
  update public.hr_catalogue_meta set digest = 'be3ddebbf24f3914a4369fb6b282cf5226a90352dd08c68c265ae928ee1f5200', generated_at = now()
   where only_row and digest is distinct from 'be3ddebbf24f3914a4369fb6b282cf5226a90352dd08c68c265ae928ee1f5200';

  -- ── 2. SELF-VERIFYING COMMIT GATE (§4) ───────────────────────────────────
  -- (a) the catalogue lost exactly the cut rows that were present, and nothing else.
  select count(*) into v_items1 from public.hr_items;
  if v_items1 <> v_items0 - v_present then
    raise exception 'GATE(a): hr_items went % -> %, expected exactly % fewer', v_items0, v_items1, v_present;
  end if;
  if exists (select 1 from public.hr_items where item_id = any(v_cut))
     or exists (select 1 from public.hr_item_slots where item_id = any(v_cut))
     or exists (select 1 from public.hr_unlocks where unlock_id = 'recipe:dragon_marrow_recipe') then
    raise exception 'GATE(a): a cut row survived';
  end if;
  if not exists (select 1 from public.hr_items where item_id = 'bones')
     or not exists (select 1 from public.hr_items where item_id = 'iron_platebody') then
    raise exception 'GATE(a) CONTROL: a live item (bones / iron_platebody) is gone — the delete was too wide';
  end if;
  if (select digest from public.hr_catalogue_meta where only_row) is distinct from 'be3ddebbf24f3914a4369fb6b282cf5226a90352dd08c68c265ae928ee1f5200' then
    raise exception 'GATE(a): hr_catalogue_meta does not carry the regenerated digest';
  end if;

  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(b) CANNOT RUN: hr_create_character missing';
  end if;
  begin  -- ── SUBTRANSACTION, discarded by the HR866 sentinel ───────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;

    -- (b) EXECUTED: the realm REFUSES to grant a cut item, by name, and still
    --     grants a live one (positive control first, so a broken items arm
    --     cannot pass the refusal).
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('items', jsonb_build_object('bones', 1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(b) CONTROL: granting one Bones was refused (%) — the items arm is broken and '
                      'the refusals below would measure nothing', v_r;
    end if;
    foreach v_key in array array['muster_seal', 'colossus_plate', 'hearthbread', 'dragon_marrow_recipe'] loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('items', jsonb_build_object(v_key, 1), 'journal', c_j));
      if coalesce(v_r->>'error', '') <> 'unknown_item' then
        raise exception 'GATE(b): granting one % answered % — a cut item must be unknown_item', v_key, v_r;
      end if;
    end loop;
    if exists (select 1 from public.player_inventory where user_id = v_uid and item_id = any(v_cut)) then
      raise exception 'GATE(b): a refused grant still wrote a cut item';
    end if;

    -- (c) EXECUTED: a HELD muster claim pays its band and says nothing about a
    --     Seal — not in the response, not in the ledger row. The realm held
    --     (met_at set) because that is the only branch that ever paid one.
    v_day := public.hr_utc_day_key();
    v_key := v_day || '#0';
    insert into public.world_event_totals (event_key, participants, goal, progress, met_at)
      values (v_key, 1, 6000, 6000, now())
      on conflict (event_key) do update set met_at = now();
    insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, points)
      values (v_day, v_uid, v_key, 0, now() - interval '1 minute', 500);
    select gold into v_gold0 from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.world_event_claim(v_day, 0);
    if coalesce(v_r->>'ok', 'false') <> 'true' or coalesce(v_r->>'held', 'false') <> 'true' then
      raise exception 'GATE(c) CONTROL: the held claim did not pay (%) — the Seal checks below would be vacuous', v_r;
    end if;
    select gold into v_gold1 from public.player_state where user_id = v_uid and slot = 0;
    if v_gold1 <= v_gold0 then
      raise exception 'GATE(c) CONTROL: the held claim credited no gold (% -> %)', v_gold0, v_gold1;
    end if;
    if v_r ? 'seals' then
      raise exception 'GATE(c): world_event_claim still returns a Rally Seal count: %', v_r;
    end if;
    if exists (select 1 from public.player_ledger
                where user_id = v_uid and kind = 'rally' and meta ? 'seals') then
      raise exception 'GATE(c): the rally ledger row still journals a Seal';
    end if;
    if exists (select 1 from public.player_inventory where user_id = v_uid and item_id = 'muster_seal') then
      raise exception 'GATE(c): the claim minted a muster_seal';
    end if;

    raise exception using errcode = 'HR866', message = 'w0a §2 complete — rolling back';
  exception when sqlstate 'HR866' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF — the probe left nothing behind (CLAUDE.md §2).
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.world_event_joins where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  raise notice 'w0a: % cut item rows gone (hr_items % -> %), the Rally Seal is out of the claim body, '
               'no player row named a cut id, digest %', v_present, v_items0, v_items1, left('be3ddebbf24f3914a4369fb6b282cf5226a90352dd08c68c265ae928ee1f5200', 12);
end $$;
