-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-24-skills-from-storage.sql — TOWN SKILLS DRAW ON THE BAG, THEN THE ACCOUNT'S STORAGE
-- (Tyler 2026-10-25, a universal truth: "let me do gathering/crafting skills from account
-- storage — this should also be a universal truth").
-- STAGED (lane/c-skills-from-storage, backend-architect, 2026-10-25). Game CLOSED: applies on its
-- passing §7 (CLAUDE.md §2). ITEM SURFACE (a consumer of the ACCOUNT's Storage): on the Steam EA
-- Security review list beside 2027-01-10-house-from-storage.sql.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 150k chars) takes FIVE anchored
-- edits in §2, as gear-by-level and account-gold did; restating the whole body for one draw order
-- is the larger risk. (Header form added by lane/a-v0248-ci: the §2 note's inline ack was not read.)
--
-- ── THE RULE, AS BUILT ───────────────────────────────────────────────────────
--   Every town skill that SPENDS an item takes it from the acting hero's bag first and the rest
--   from the account's Storage (account_bank), with nothing moved by the player, all or nothing,
--   through ONE function: hr_materials_take (2027-01-10-house-from-storage.sql, unchanged here).
--   Outputs land in the bag as today. The consumers, found by grepping every body that debits
--   player_inventory (the house and the chests already draw on Storage since 2027-01-10):
--     · EVERY BENCH (cooking, smithing, fletching, runecrafting, crafting, juice, Prayer rites:
--       every artisan recipe). The engine (hr-accrue) prices the run against bag + Storage; hr_apply
--       takes each spent line the bench's catalogue row consumes (hr_bench_inputs(), generated from
--       src/data/recipes.js) bag first, then Storage.
--     · THE BENCH THAT RESUMES AFTER A HUNT (hr_resume_has_inputs): one action's inputs held in
--       bag + Storage.
--     · PLANTING (hr_farm_plant) and HARVEST-AND-REPLANT (hr_farm_harvest_replant): the seed from
--       the bag, then Storage; replant buys a seed only when neither holds one.
--   NOT consumers (read, not spent): gathering spends nothing (no bait, no charges: accrual.js
--   "gathering never debits"); a TOOL is optional and only speeds the work (src/core/tools.js
--   bestTool: the bag and the worn set), so a tool in Storage still does not count — one tool
--   would otherwise serve four heroes at once (a designer call, named in the lane report).
--   Out of scope, bag only as before: the plot upgrade's farm deeds (a payment, not a skill input),
--   a recipe scroll learnt (a per-hero unlock), hunt supplies (the hunt bag), eating in town.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 NEW envelope section `skill_inputs` (the hr_state_sections registry, architecture contracts
--    X7: a row, never a body edit): {from: ["bag", "storage"]}, the order a town skill draws in.
--    It is the SELF-CONFIGURING SWITCH for the engine and the client: hr-accrue counts Storage into
--    a bench's supply, and the client counts it into "Makes up to N", only where the server says so,
--    so the edge, the client and this file are safe in any deploy order (a database without it
--    answers bag only, as today).
-- §2 hr_apply — FIVE ANCHORED EDITS (RESTATEMENT-DEBT-ACK: the economy's single write path, 150k
--    chars; gear-by-level and account-gold took anchored edits the same way): (A) two locals;
--    (B) BEFORE the purse, an artisan settle's bench inputs taken by hr_materials_take (Storage on);
--    (C) the item loop skips the lines (B) took; (D) the journal row says what Storage paid
--    (`delta.st` = {item: n}); (E) step (5) RELEASES the key of a Storage-counted shortfall
--    (insufficient_item carrying `storage`), as it releases version_conflict: the engine derives its
--    key from (watermark, version), a sibling's Storage move bumps neither, and a stored refusal would
--    replay on every settle for a day (intents.js: "widen the release set in hr_apply" is the answer
--    that file names for a player-reachable insufficient_item). Every other delta, every other spent
--    line and every other code is as before.
-- §3 hr_resume_has_inputs RESTATED WHOLE (live e6dfd509, 2027-01-20-tutorial-facts.sql): bag + Storage.
-- §4 hr_farm_plant RESTATED WHOLE (live 0c51cf0d, 2026-12-14-shared-farm.sql): the hero's ADVISORY
--    lock first (hr_materials_take takes it; taking it after the row lock would invert hr_apply's
--    order), then the row, the farm lock, and the seed through hr_materials_take (Storage on).
--    insufficient_seed now carries {seed, have, need, bag, storage}; the ledger row and the answer
--    carry `from`.
-- §5 hr_farm_harvest_replant RESTATED WHOLE (live a16b9df1, 2026-12-14-shared-farm.sql): the hero's
--    advisory lock first; after the harvest the account DEPOT lock BEFORE the purse; a seed is bought
--    only when bag + Storage hold none.
--
-- ── ERROR TAXONOMY (what a caller can be told; codes unchanged, details widened) ──────
--   hr_apply (an artisan settle): insufficient_item {item_id, have, need, bag, storage}
--     (have = bag + Storage) for a bench input; {item_id, have, need} for any other line, as before.
--   hr_farm_plant: insufficient_seed {seed, have, need, bag, storage}; every other code unchanged.
--   hr_farm_harvest_replant: unchanged (cannot_afford / no_seed_for_sale only when bag + Storage hold
--     no seed).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   ONE LOCK ORDER for every write an account shares (house-from-storage, market-account headers):
--   the HERO (advisory uid:slot, then its player_state row) -> [the HOME key] -> [the FARM key
--   'hr:farm:'||uid] -> the account DEPOT key 'hr:depot:'||uid -> the bag rows -> the Storage rows ->
--   the account PURSE, LAST. hr_apply takes the depot key inside hr_materials_take BEFORE its GOLD
--   block; the farm verbs take farm -> depot and nothing takes the farm key after the depot key (no
--   body does: measured over the chain). §7(a) reads the order out of the installed bodies.
--   TWO HEROES, ONE STORAGE: every writer of account_bank holds the depot key, so a bench settle, a
--   plant, a Storage move and a market listing of one account queue on it; the second sees the first's
--   debits. A settle whose engine read Storage before another hero spent it is refused
--   insufficient_item (nothing moves, the watermark stays) and the next settle re-prices the window
--   against the Storage that is left: a retry, never a dupe and never a loss.
--   MARKET ESCROW: an item in an open listing has already LEFT account_bank (hr_market_list moves it
--   to the listing), so nothing here can spend or count it twice.
--   TRUE CONCURRENCY is unverified (PGlite is one backend; no branch database): the order is proven by
--   source and by single-backend execution, not by a race.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   Unchanged per verb: hr_apply's own key (the engine's server-derived accrual key); hr_farm_plant
--   and hr_farm_harvest_replant per (key, intent, slot) through hr_intent_replay. The take runs inside
--   the decision each key records, so a replay moves nothing.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +0 client RPCs, +0 engine RPCs; +1 owner-only section view (hr_skill_inputs_view, a constant).
--   NEW: a bench settle and a plant spend items any hero of the account deposited — the ruling (the
--   Storage is the account's, and its window already lets any hero withdraw them). Bounded: only an
--   artisan settle ('craft' journal, accrued_to) on a hero whose SERVER pointer is a bench, only the
--   lines THAT bench's generated catalogue row consumes, only as a debit (a sink: nothing is minted,
--   priced or returned), only the verified user's own rows. A forged engine delta could already spend
--   its own bag; it can now also spend that account's Storage of the active bench's inputs, never
--   another account's and never another item.
--
-- ── COST (100x players, ~4,400 accounts) ───────────────────────────────────
--   NO new table, column or index; NO new ledger rows: the settle's existing row gains `delta.st`
--   (≤ 2 items, ~30 bytes) only when Storage paid; a plant's row gains meta.from (~40 bytes). Per
--   artisan settle: one depot advisory lock and one Storage PK probe per input (≤ 3) under locks the
--   hero already holds; the envelope gains one constant 30-byte section.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-apply hr_resume_has_inputs from 2027-01-20-tutorial-facts.sql and hr_farm_plant /
--   hr_farm_harvest_replant from 2026-12-14-shared-farm.sql byte for byte (the §0 pins name them);
--   remove this file's five marked hr_apply edits (each is a SKILLS-FROM-STORAGE block); delete the
--   `skill_inputs` registry row and drop hr_skill_inputs_view. No data to undo: what Storage paid is
--   in each ledger row (delta.st / meta.from).
-- ORDER: after 2027-01-23-loot-dispatch.sql (restates none of this file's objects). The EDGE half
--   (hr-accrue reads `skill_inputs`) and the client half are safe either side of this apply.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each restated body must be EXACTLY its live image or this file's own post-image (a second apply).
do $mig$
declare v_md5 text; v_src text;
begin
  if to_regclass('public.account_bank') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.account_farm_plots') is null or to_regclass('public.hr_crops') is null then
    raise exception 'PRECONDITION: account_bank / hr_state_sections / account_farm_plots / hr_crops absent'; end if;
  if to_regprocedure('public.hr_bench_inputs()') is null or to_regprocedure('public.hr_farm_lock(uuid)') is null
     or to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_farm_purse_pay(uuid,integer,bigint)') is null then
    raise exception 'PRECONDITION: hr_bench_inputs (2027-01-20), the farm lock, harvest or purse helpers are absent'; end if;
  -- hr_materials_take is CALLED, not restated: it must be the house-from-storage body.
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)');
  if v_md5 is distinct from '230f848fb81c87c270fa560987e3d618' then
    raise exception 'PIN: hr_materials_take is not 2027-01-10-house-from-storage.sql''s (230f848f...) - md5 %', v_md5; end if;
  select prosrc, md5(replace(prosrc, chr(13), '')) into v_src, v_md5 from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_md5 is distinct from '98d8c0383dfaa16b9e9f41448e5834db' and strpos(v_src, 'SKILLS-FROM-STORAGE') = 0 then
    raise exception 'PIN: hr_apply is neither its live image (98d8c038..., gear-by-level''s splice) nor this file''s - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_resume_has_inputs(uuid,integer,text,text)');
  if v_md5 is distinct from 'e6dfd5098ff45a89db1da40a6b96e1fe' and v_md5 is distinct from 'aa41bbd819d4ec3ad68adf855466444e' then
    raise exception 'PIN: hr_resume_has_inputs is neither its live image (2027-01-20-tutorial-facts.sql, e6dfd509...) nor this file''s - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_plant(integer,integer,text,uuid)');
  if v_md5 is distinct from '0c51cf0d5039cc47a2eef882ae7c6ea6' and v_md5 is distinct from '3afdde2f463aee5da658a819389a22ac' then
    raise exception 'PIN: hr_farm_plant is neither its live image (2026-12-14-shared-farm.sql, 0c51cf0d...) nor this file''s - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_harvest_replant(integer,integer,uuid)');
  if v_md5 is distinct from 'a16b9df14814685e68de49bbd7cdda29' and v_md5 is distinct from '0c3d75876b7128bda2b70a258204586c' then
    raise exception 'PIN: hr_farm_harvest_replant is neither its live image (2026-12-14-shared-farm.sql, a16b9df1...) nor this file''s - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_skill_inputs_view(uuid,integer)');
  if v_md5 is not null and v_md5 is distinct from 'e998192ef514ae6faae8661008d828af' then
    raise exception 'PIN: hr_skill_inputs_view exists and is not this file''s - md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE SECTION: WHERE A TOWN SKILL'S INPUTS COME FROM, IN ORDER ─────────
create or replace function public.hr_skill_inputs_view(p_user uuid, p_slot int)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql, Tyler 2026-10-25): a town skill's inputs come from
  -- the hero's bag first, then the account's Storage (hr_materials_take). The engine and the client count Storage
  -- into a bench's supply only where this section says so: the switch that makes every deploy order safe.
  select jsonb_build_object('from', jsonb_build_array('bag', 'storage'))
$$;
revoke all on function public.hr_skill_inputs_view(uuid, integer) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('skill_inputs', 'hr_skill_inputs_view', '2027-01-24-skills-from-storage.sql: where a town skill''s inputs come from, in order (the bag, then the account''s Storage)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 hr_apply — FIVE ANCHORED EDITS (RESTATEMENT-DEBT-ACK in the header) ─────
-- Every anchor must match EXACTLY once or the block raises. A body that already carries the
-- SKILLS-FROM-STORAGE marker is this file's post-image: skipped.
do $mig$
declare
  v_def text; v_n int; i int;
  a text[] := array[
$a$  v_cxp_clamp jsonb;
$a$,
$a$    -- ── GOLD ─────────────────────────────────────────────────────────────
$a$,
$a$          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
$a$,
$a$      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);
    end if;
$a$,
$a$     and v_out->>'error' = any (c_release_codes) then
$a$];
  r text[] := array[
$a$  v_cxp_clamp jsonb;
  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the bench inputs an artisan settle takes (bag, then
  -- the account's Storage) before the item loop, and what hr_materials_take answered for them.
  v_skill_cost jsonb;
  v_skill_take jsonb;
$a$,
$a$    -- ── SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql; Tyler 2026-10-25, a universal truth) ──
    -- A BENCH'S INPUTS COME FROM THE HERO'S BAG FIRST, THEN THE ACCOUNT'S STORAGE. On an artisan settle (journal
    -- kind 'craft', a window: accrued_to) of a hero whose SERVER pointer is a bench, every spent line that bench's
    -- catalogue row consumes (hr_bench_inputs(), generated from src/data/recipes.js) is taken HERE, whole, by
    -- hr_materials_take (the ONE material take, all or nothing) and skipped by the item loop below; the journal
    -- row says what Storage paid (`st`). It runs BEFORE the purse, so the one lock order holds: the hero -> the
    -- account DEPOT -> the bag rows -> the Storage rows -> the purse, last. Every other spent line, and every
    -- other delta, keeps the bag only.
    v_skill_cost := null;
    v_skill_take := null;
    if p_delta ? 'accrued_to' and p_delta #>> '{journal,kind}' = 'craft'
       and jsonb_typeof(p_delta->'items') = 'object'
       and v_st.active_kind = 'artisan' and v_st.active_id is not null then
      select jsonb_object_agg(t.k, -(t.v::bigint)) into v_skill_cost
        from (select e.key as k, case when e.value ~ '^\s*-[0-9]{1,18}\s*$' then e.value end as v
                from jsonb_each_text(p_delta->'items') as e) t
       where t.v is not null and t.v::bigint < 0
         and coalesce(public.hr_bench_inputs() -> v_st.active_id, '{}'::jsonb) ? t.k;
      if v_skill_cost is not null then
        v_skill_take := public.hr_materials_take(v_uid, v_slot, v_skill_cost, true);
        if coalesce(v_skill_take->>'ok', 'false') <> 'true' then
          perform public.hr_reject(coalesce(v_skill_take->>'error', 'insufficient_item'), v_skill_take - 'ok' - 'error');
        end if;
      end if;
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
$a$,
$a$          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
        -- SKILLS-FROM-STORAGE: a bench input the block above already took (the bag first, then Storage).
        if v_skill_cost ? k then continue; end if;
$a$,
$a$      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);
    end if;
    -- SKILLS-FROM-STORAGE: what the account's Storage paid of this settle's bench inputs (the rest left the bag).
    if coalesce(v_skill_take #> '{from,storage}', '{}'::jsonb) <> '{}'::jsonb then
      v_meta := v_meta || jsonb_build_object('st', v_skill_take #> '{from,storage}');
    end if;
$a$,
$a$     and (v_out->>'error' = any (c_release_codes)
          -- SKILLS-FROM-STORAGE: a bench-input shortfall counted across the account's SHARED Storage (`storage` in
          -- the detail: only the take above says it) is a statement about the engine's READ, like version_conflict:
          -- another hero moved Storage after it, and this hero's version did not move. Stored, the re-derived key
          -- would replay it for a day; released, the next settle re-reads and pays what is left.
          or (v_out->>'error' = 'insufficient_item' and v_out ? 'storage')) then
$a$];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('SKILLS-FROM-STORAGE' in v_def) > 0 then
    raise notice 'skills-from-storage §2: hr_apply already takes bench inputs from Storage - patch skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'skills-from-storage §2: hr_apply anchor % matched % times', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
end $mig$;

-- ── §3 hr_resume_has_inputs — RESTATED WHOLE: ONE ACTION'S INPUTS IN BAG + STORAGE ──
create or replace function public.hr_resume_has_inputs(p_user uuid, p_slot integer, p_kind text, p_id text)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): the engine's missingInput (src/core/artisan.js) on what the bench
  -- draws on. SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the hero's bag PLUS the account's Storage.
  -- True for every kind but a bench, and for a bench that consumes nothing; false while any input of ONE action is
  -- short across both.
  select p_kind is distinct from 'artisan'
      or not exists (select 1 from jsonb_each(coalesce(public.hr_bench_inputs() -> p_id, '{}'::jsonb)) i
                      where coalesce((select v.qty from public.player_inventory v
                                       where v.user_id = p_user and v.slot = p_slot and v.item_id = i.key), 0)
                            + coalesce((select b.qty from public.account_bank b
                                         where b.user_id = p_user and b.item_id = i.key), 0)
                            < (i.value #>> '{}')::bigint)
$$;
revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from hr_engine; end if;
end $$;

-- ── §4 hr_farm_plant — RESTATED WHOLE: THE SEED FROM THE BAG, THEN STORAGE ──
CREATE OR REPLACE FUNCTION public.hr_farm_plant(p_slot integer, p_plot_idx integer, p_crop text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_plant restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's (account_farm_plots,
-- under the account farm lock); the seed, the XP and the day budget are the acting hero's.
-- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the seed comes from the hero's
-- bag first, then the account's Storage (hr_materials_take), and the hero's advisory lock
-- is taken first (hr_materials_take's order; after the row lock it would invert hr_apply's).
declare
  c_max_plots constant int := 128;  -- the table's index fuse; the account's cap is finer
  c_plant_xp  constant int := 28;   -- b226 client plant grant
  v_uid   uuid := auth.uid();
  v_crop  public.hr_crops%rowtype;
  v_state public.player_state%rowtype;
  v_farm_lv int;
  v_have  bigint;
  v_budget jsonb;
  v_cached jsonb;
  v_crop_tier int;
  v_plot_cap  int;
  v_plot_level int;
  v_by    int;
  v_take  jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_plant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_plant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_plot'));
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- THE LOCK ORDER (one order for every write an account shares): the acting HERO (its
  -- advisory key, then its row) -> the account FARM key -> (hr_materials_take) the account
  -- DEPOT key -> the bag row -> the Storage row. No purse here.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- THE ACCOUNT'S FIELD SIZE: the property ladder plus the Garden's beds.
  v_plot_cap := public.hr_farm_plot_cap(v_uid);
  if p_plot_idx >= v_plot_cap then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap));
  end if;

  -- Farming LEVEL gate, the acting hero's, re-derived from server XP.
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv));
  end if;

  -- CROP PLOT-TIER gate: crop.plot_tier must be <= the ACCOUNT's plot tier.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'crop_untiered'));
  end if;
  v_plot_level := public.hr_farm_plot_level(v_uid);
  if v_crop_tier > v_plot_level then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_plot_level));
  end if;

  select planted_by into v_by from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  if found then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_occupied', 'by', v_by));
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  -- ONE SEED: the ACTING hero's bag first, then the account's Storage (hr_materials_take: decided
  -- whole before it writes; a stack that reaches 0 is deleted). Refused having written nothing.
  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_crop.seed_item, 1), true);
  if coalesce(v_take ->> 'ok', '') <> 'true' then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item)
      || jsonb_build_object('have', coalesce((v_take ->> 'have')::bigint, 0), 'need', 1,
                            'bag', coalesce((v_take ->> 'bag')::bigint, 0), 'storage', coalesce((v_take ->> 'storage')::bigint, 0)));
  end if;

  -- Fresh plant on the account's field: DRY, not a regrow. A plain insert behind the
  -- occupied check under the farm lock: a lock defect fails loud, never overwrites a crop.
  insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
    values (v_uid, p_plot_idx, p_crop, now(), '{}', 0, p_slot);

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', c_plant_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- The LIFETIME plant count (kind 'stat', period ''), the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:planted', 1, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1, 'farming', c_plant_xp, c_plant_xp,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx, 'field', 'account', 'from', v_take -> 'from'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item, 'plant_xp', c_plant_xp, 'from', v_take -> 'from');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

-- ── §5 hr_farm_harvest_replant — RESTATED WHOLE: A SEED FROM THE BAG OR STORAGE BEFORE ONE IS BOUGHT ──
CREATE OR REPLACE FUNCTION public.hr_farm_harvest_replant(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- hr_farm_harvest_replant restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM)
-- from the 2026-11-26-farm-window.sql image: the plot is the ACCOUNT's; the remembered
-- crop goes back in from the ACTING hero's seed, else one bought through the farm's
-- one purse (hr_farm_purse_pay); an extra plot is not planted again.
-- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): "the hero's seed" is the bag,
-- then the account's Storage; a seed is bought only when neither holds one. The hero's
-- advisory lock is taken first and the account DEPOT lock BEFORE the purse (one lock order).
declare
  c_max_plots constant int := 128;   -- the table's index fuse
  v_uid    uuid := auth.uid();
  v_cached jsonb;
  v_crop   text;
  v_seed   text;
  v_have   bigint;
  v_price  bigint;
  v_offer  text;
  v_purse  jsonb;
  v_bought bigint := 0;
  v_h      jsonb;
  v_rep    jsonb;
  v_out    jsonb;
begin
  if v_uid is null then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_idem is null or p_slot is null or p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_replant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_replant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;
  -- the harvest's own bucket (closed-mode check first); the inner harvest spends one more
  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- THE LOCK ORDER: the acting HERO's advisory key FIRST (the harvest then takes its row and
  -- the account farm key, the plant re-takes all three), the account DEPOT key after the
  -- harvest, the purse (a bought seed) LAST.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));

  -- THE PLOT REMEMBERS ITS CROP: read before the harvest clears the row. Unlocked on
  -- purpose: the harvest below re-reads the plot under the hero + farm locks, and a
  -- crop another hero replaced in between cannot be ready (it was just planted).
  select crop_id into v_crop from public.account_farm_plots
   where user_id = v_uid and plot_idx = p_plot_idx;

  -- The harvest, unchanged: its own gates, roll, perks, budget and journal. It takes
  -- the hero lock and the account farm lock; this transaction keeps both.
  v_h := public.hr_farm_harvest(p_slot, p_plot_idx, md5(p_idem::text || ':farm_replant:harvest')::uuid);
  if coalesce(v_h ->> 'ok', '') <> 'true' then return v_h; end if;   -- refused (and noted) by the harvest: nothing moved

  if coalesce(v_h ->> 'regrew', '') = 'true' or v_crop is null then
    v_rep := jsonb_build_object('ok', true, 'kept', true);           -- a regrowing crop is still in the ground
  elsif coalesce(v_h ->> 'extra', '') = 'true' then
    v_rep := jsonb_build_object('ok', false, 'error', 'extra_plot');  -- an extra plot is gone after its harvest
  else
    select seed_item into v_seed from public.hr_crops where crop_id = v_crop;
    -- The account's Storage counts as the hero's own seed: its key BEFORE any purse.
    perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
    select coalesce((select qty from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_seed), 0)
         + coalesce((select qty from public.account_bank where user_id = v_uid and item_id = v_seed), 0)
      into v_have;
    if coalesce(v_have, 0) < 1 then
      -- ONE SEED AT THE SHOP'S OWN PRICE: the listed `seed` row shop_buy sells,
      -- paid through the farm's one purse.
      select o.price, o.offer_id into v_price, v_offer from public.hr_shop_supply_offers o
       where o.kind = 'seed' and o.item_id = v_seed order by o.price limit 1;
      if v_price is null or v_price <= 0 then
        v_rep := jsonb_build_object('ok', false, 'error', 'no_seed_for_sale', 'seed', v_seed);
      else
        v_purse := public.hr_farm_purse_pay(v_uid, p_slot, v_price);
        if coalesce(v_purse ->> 'ok', '') <> 'true' then
          v_rep := jsonb_build_object('ok', false, 'error', 'cannot_afford', 'seed', v_seed, 'price', v_price,
            'have', (v_purse ->> 'gold')::bigint);
        else
          insert into public.player_inventory as inv (user_id, slot, item_id, qty)
            values (v_uid, p_slot, v_seed, 1)
            on conflict (user_id, slot, item_id) do update set qty = inv.qty + 1;
          insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
            values (v_uid, p_slot, 'shop', 'farm_replant_seed', v_seed, 1, -v_price, 0, 0, 0,
                    jsonb_build_object('offer', v_offer, 'qty', 1, 'unit_gold', v_price, 'plot', p_plot_idx, 'crop', v_crop,
                                       'purse', v_purse ->> 'purse'));
          v_bought := v_price;
        end if;
      end if;
    end if;
    if v_rep is null then
      v_rep := public.hr_farm_plant(p_slot, p_plot_idx, v_crop, md5(p_idem::text || ':farm_replant:plant')::uuid)
               || jsonb_build_object('bought', v_bought);
    end if;
  end if;

  v_out := v_h || jsonb_build_object('replant', v_rep);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_replant', v_out, now())
    on conflict (user_id, intent_id) do nothing;
  return v_out;
end $function$;

-- ── §6 GRANTS: revoke first, then the one grant each verb had (unchanged) ─────
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;
revoke execute on function public.hr_farm_harvest_replant(int, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_harvest_replant(int, int, uuid) to authenticated;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Two session-local helpers (pg_temp, dropped at the end; the house-from-storage idiom).
create or replace function pg_temp.sfs_held(p_user uuid, p_item text) returns bigint language sql as $f$
  -- every unit of p_item the account holds in a bag or in Storage
  select coalesce((select sum(qty) from public.player_inventory where user_id = p_user and item_id = p_item), 0)::bigint
       + coalesce((select qty from public.account_bank where user_id = p_user and item_id = p_item), 0)::bigint
$f$;
create or replace function pg_temp.sfs_put(p_user uuid, p_slot int, p_item text, p_bag bigint, p_sto bigint) returns void language plpgsql as $f$
begin
  -- set one item's bag stack (slot p_slot) and Storage stack exactly (0 = no row)
  delete from public.player_inventory where user_id = p_user and item_id = p_item;
  delete from public.account_bank where user_id = p_user and item_id = p_item;
  if p_bag > 0 then insert into public.player_inventory (user_id, slot, item_id, qty) values (p_user, p_slot, p_item, p_bag); end if;
  if p_sto > 0 then insert into public.account_bank (user_id, item_id, qty) values (p_user, p_item, p_sto); end if;
end $f$;

do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000115f501';
  k   constant text := '000000c0-0000-4000-b000-00000115';
  v jsonb; v_role text; v_src text; v_rest text; v_fn text;
  v_bench text; v_in text; v_need bigint; v_other text; v_ver bigint; v_led public.player_ledger%rowtype;
  v_seed text; v_crop text; v_gold bigint;
  i_hero int; i_row int; i_farm int; i_depot int; i_take int; i_harv int; i_purse int; i_plant int; i_gold int;
begin
  -- (a) THE LOCK ORDER, READ OUT OF THE BODIES THIS FILE INSTALLED (comments stripped).
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  i_hero := strpos(v_src, 'hashtextextended(v_uid::text || '':'' || v_slot::text, 0)');
  i_row  := strpos(v_src, 'where user_id = v_uid and slot = v_slot for update');
  i_take := strpos(v_src, 'public.hr_materials_take(v_uid, v_slot, v_skill_cost, true)');
  i_gold := strpos(v_src, 'public.hr_purse_move(');
  if not (i_hero > 0 and i_row > i_hero and i_take > i_row and i_gold > i_take) then
    raise exception 'VERIFY(a): hr_apply order hero % -> row % -> materials (depot) % -> purse %', i_hero, i_row, i_take, i_gold; end if;
  if strpos(v_src, 'if v_skill_cost ? k then continue; end if;') < i_gold then
    raise exception 'VERIFY(a): hr_apply''s item loop does not skip the lines the take paid'; end if;
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_farm_plant(integer,integer,text,uuid)'::regprocedure;
  i_hero := strpos(v_src, 'hashtextextended(v_uid::text || '':'' || p_slot::text, 0)');
  i_row  := strpos(v_src, 'where user_id = v_uid and slot = p_slot for update');
  i_farm := strpos(v_src, 'public.hr_farm_lock(v_uid)');
  i_take := strpos(v_src, 'public.hr_materials_take(v_uid, p_slot,');
  if not (i_hero > 0 and i_row > i_hero and i_farm > i_row and i_take > i_farm)
     or strpos(v_src, 'purse') > 0 or strpos(v_src, 'update public.player_inventory') > 0 or strpos(v_src, 'delete from public.player_inventory') > 0 then
    raise exception 'VERIFY(a): hr_farm_plant order hero % -> row % -> farm % -> materials %, or it writes the bag itself / pays a purse', i_hero, i_row, i_farm, i_take; end if;
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_farm_harvest_replant(integer,integer,uuid)'::regprocedure;
  i_hero  := strpos(v_src, 'hashtextextended(v_uid::text || '':'' || p_slot::text, 0)');
  i_harv  := strpos(v_src, 'public.hr_farm_harvest(');
  i_depot := strpos(v_src, 'hashtextextended(''hr:depot:'' || v_uid::text, 0)');
  i_purse := strpos(v_src, 'public.hr_farm_purse_pay(');
  i_plant := strpos(v_src, 'public.hr_farm_plant(');
  if not (i_hero > 0 and i_harv > i_hero and i_depot > i_harv and i_purse > i_depot and i_plant > i_purse) then
    raise exception 'VERIFY(a): hr_farm_harvest_replant order hero % -> harvest % -> depot % -> purse % -> plant %', i_hero, i_harv, i_depot, i_purse, i_plant; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_resume_has_inputs(uuid,integer,text,text)'::regprocedure), 'public.account_bank') = 0 then
    raise exception 'VERIFY(a): hr_resume_has_inputs does not count the account''s Storage'; end if;
  -- Nothing takes the FARM key after the DEPOT key (the order farm -> depot cannot cycle).
  select string_agg(p.proname, ', ') into v_rest from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosrc ~ 'hr:depot:' and p.prosrc ~ 'hr_farm_lock\(' and p.proname <> 'hr_farm_harvest_replant';
  if v_rest is not null then raise exception 'VERIFY(a): % take both the depot and the farm key', v_rest; end if;

  -- THE PROBE'S CATALOGUE ROWS, chosen by property (never by name): a bench with ONE input line, that input;
  -- an item that is NOT one of its inputs; the first crop a fresh hero can plant (no regrow).
  select b.key, (select min(i.key) from jsonb_each(b.value) i) into v_bench, v_in
    from jsonb_each(public.hr_bench_inputs()) b
   where exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key)
     and (select count(*) from jsonb_object_keys(b.value)) = 1
   order by b.key limit 1;
  v_need := ((public.hr_bench_inputs() -> v_bench) ->> v_in)::bigint;
  select i.item_id into v_other from public.hr_items i
   where not (coalesce(public.hr_bench_inputs() -> v_bench, '{}'::jsonb) ? i.item_id) order by i.item_id limit 1;
  select c.crop_id, c.seed_item into v_crop, v_seed from public.hr_crops c join public.hr_crop_plot_tier t using (crop_id)
   where c.req_lv <= 1 and not c.regrows and t.plot_tier <= 1 order by c.crop_id limit 1;
  if v_bench is null or v_in is null or v_need is null or v_other is null or v_crop is null then
    raise exception 'VERIFY: the catalogue has no bench with an input, no other item or no first crop to probe'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'skills-from-storage §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(1) refused: %', v; end if;
    delete from public.account_bank where user_id = v_u;
    update public.player_state set active_kind = 'artisan', active_id = v_bench, active_since = now() - interval '1 hour',
                                   accrued_to = now() - interval '1 hour'
     where user_id = v_u and slot = 0;

    -- (b) THE SECTION: every slot's envelope says where a town skill's inputs come from.
    if public.hr_state_of(v_u, 0) -> 'skill_inputs' is distinct from '{"from": ["bag", "storage"]}'::jsonb
       or public.hr_state_of(v_u, 1) -> 'skill_inputs' is distinct from '{"from": ["bag", "storage"]}'::jsonb then
      raise exception 'VERIFY(b): the skill_inputs section reads %', public.hr_state_of(v_u, 0) -> 'skill_inputs'; end if;

    -- (c) A BENCH SETTLE FROM STORAGE ONLY: the bag holds none of the input, Storage holds 3 actions' worth + 2.
    perform pg_temp.sfs_put(v_u, 0, v_in, 0, 3 * v_need + 2);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0001')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_in, -3 * v_need), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): a settle from Storage answered %', v; end if;
    if pg_temp.sfs_held(v_u, v_in) <> 2 or (select qty from public.account_bank where user_id = v_u and item_id = v_in) <> 2
       or exists (select 1 from public.player_inventory where user_id = v_u and item_id = v_in) then
      raise exception 'VERIFY(c): Storage did not pay the settle: held %', pg_temp.sfs_held(v_u, v_in); end if;
    select * into v_led from public.player_ledger where user_id = v_u and slot = 0 and kind = 'craft' order by at desc, id desc limit 1;
    if (v_led.meta #>> array['delta', 'st', v_in])::bigint is distinct from 3 * v_need then
      raise exception 'VERIFY(c): the journal row does not say Storage paid %: %', 3 * v_need, v_led.meta; end if;

    -- (d) MIXED, BAG FIRST: the bag holds 1 action's worth + 1, Storage 2 actions' worth; spend 3 actions' worth.
    perform pg_temp.sfs_put(v_u, 0, v_in, v_need + 1, 2 * v_need);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0002')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_in, -3 * v_need), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.player_inventory where user_id = v_u and item_id = v_in)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_in) is distinct from 1 then
      raise exception 'VERIFY(d): bag %, Storage % after a mixed settle (%)', (select qty from public.player_inventory where user_id = v_u and item_id = v_in),
        (select qty from public.account_bank where user_id = v_u and item_id = v_in), v; end if;

    -- (e) SHORT ACROSS BOTH: refused with the server's counts and NOTHING moves (not the watermark, not the version).
    perform pg_temp.sfs_put(v_u, 0, v_in, 1, v_need);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0003')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_in, -(v_need + 2)), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_in
       or (v->>'have')::bigint <> v_need + 1 or (v->>'need')::bigint <> v_need + 2 or (v->>'bag')::bigint <> 1 or (v->>'storage')::bigint <> v_need then
      raise exception 'VERIFY(e): a settle one short answered %', v; end if;
    if pg_temp.sfs_held(v_u, v_in) <> v_need + 1 or (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver then
      raise exception 'VERIFY(e): a refused settle moved something'; end if;
    -- ...and its key is RELEASED (the engine re-derives it: stored, it would replay the shortfall for a day).
    if exists (select 1 from public.player_intents where user_id = v_u and intent_id = (k || '0003')::uuid) then
      raise exception 'VERIFY(e): a Storage shortfall kept its intent key (the re-derived key would replay it)'; end if;
    perform pg_temp.sfs_put(v_u, 0, v_in, 1, v_need + 1);
    v := public.hr_apply(v_u, 0, v_ver, (k || '0003')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_in, -(v_need + 2)), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if coalesce(v->>'ok', '') <> 'true' or v ? 'replayed' or pg_temp.sfs_held(v_u, v_in) <> 0 then
      raise exception 'VERIFY(e): the same key after Storage was topped up answered % (held %)', v, pg_temp.sfs_held(v_u, v_in); end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;

    -- (f) NOT A BENCH INPUT, OR NOT A BENCH: the bag only, as before (Storage untouched, refused bag-only).
    perform pg_temp.sfs_put(v_u, 0, v_other, 0, 5);
    v := public.hr_apply(v_u, 0, v_ver, (k || '0004')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_other, -1), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if v->>'error' is distinct from 'insufficient_item' or v ? 'storage' or (select qty from public.account_bank where user_id = v_u and item_id = v_other) <> 5 then
      raise exception 'VERIFY(f): a line the bench does not consume answered % (Storage %)', v, (select qty from public.account_bank where user_id = v_u and item_id = v_other); end if;
    -- A bag-only shortfall is a decision about the DELTA: its key keeps the answer (unchanged).
    if not exists (select 1 from public.player_intents where user_id = v_u and intent_id = (k || '0004')::uuid and result->>'error' = 'insufficient_item') then
      raise exception 'VERIFY(f): a bag-only shortfall released its intent key'; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    perform pg_temp.sfs_put(v_u, 0, v_in, 0, 3 * v_need);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0005')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_in, -v_need), 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if v->>'error' is distinct from 'insufficient_item' or v ? 'storage' or pg_temp.sfs_held(v_u, v_in) <> 3 * v_need then
      raise exception 'VERIFY(f): a craft delta on an idle hero answered % (held %)', v, pg_temp.sfs_held(v_u, v_in); end if;

    -- (g) THE RESUME: one action's inputs held in Storage only resume the bench; one unit short across both does not.
    if not public.hr_resume_has_inputs(v_u, 1, 'artisan', v_bench) then
      raise exception 'VERIFY(g): hr_resume_has_inputs does not see % in Storage', v_in; end if;
    perform pg_temp.sfs_put(v_u, 1, v_in, 0, v_need - 1);
    if public.hr_resume_has_inputs(v_u, 1, 'artisan', v_bench) then
      raise exception 'VERIFY(g): hr_resume_has_inputs resumes a bench one % short', v_in; end if;
    if v_need > 1 then
      perform pg_temp.sfs_put(v_u, 1, v_in, 1, v_need - 1);
      if not public.hr_resume_has_inputs(v_u, 1, 'artisan', v_bench) then
        raise exception 'VERIFY(g): hr_resume_has_inputs does not add the bag and Storage'; end if;
    end if;

    -- (h) PLANTING FROM A STORAGE SEED: the bag holds none; Storage pays the one seed; the journal says so.
    perform pg_temp.sfs_put(v_u, 0, v_seed, 0, 2);
    v := public.hr_farm_plant(0, 0, v_crop, (k || '0006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v #>> array['from', 'storage', v_seed])::bigint is distinct from 1 then
      raise exception 'VERIFY(h): planting from a Storage seed answered %', v; end if;
    if pg_temp.sfs_held(v_u, v_seed) <> 1 or (select qty from public.account_bank where user_id = v_u and item_id = v_seed) <> 1
       or (select (meta #>> array['from', 'storage', v_seed])::bigint from public.player_ledger
            where user_id = v_u and intent = 'farm_plant' order by at desc, id desc limit 1) is distinct from 1 then
      raise exception 'VERIFY(h): the plant did not take one Storage seed and journal it'; end if;

    -- (i) NO SEED ANYWHERE: insufficient_seed with the server's counts; nothing planted.
    perform pg_temp.sfs_put(v_u, 0, v_seed, 0, 0);
    v := public.hr_farm_plant(0, 1, v_crop, (k || '0007')::uuid);
    if v->>'error' is distinct from 'insufficient_seed' or v->>'seed' is distinct from v_seed or (v->>'have')::bigint <> 0
       or (v->>'need')::bigint <> 1 or (v->>'bag')::bigint <> 0 or (v->>'storage')::bigint <> 0
       or exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 1) then
      raise exception 'VERIFY(i): planting with no seed answered %', v; end if;

    -- (j) HARVEST AND REPLANT FROM A STORAGE SEED: ready plot 0, the bag holds no seed, Storage holds one: the
    --     crop goes back in from Storage and NO seed is bought (the purse does not move).
    update public.account_farm_plots set planted_at = now() - interval '2000 hours' where user_id = v_u and plot_idx = 0;
    perform pg_temp.sfs_put(v_u, 0, v_seed, 0, 1);
    insert into public.account_wallet (user_id) values (v_u) on conflict (user_id) do nothing;
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    v := public.hr_farm_harvest_replant(0, 0, (k || '0008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v #>> '{replant,ok}', '') <> 'true'
       or (v #>> '{replant,bought}')::bigint is distinct from 0 or (v #>> array['replant', 'from', 'storage', v_seed])::bigint is distinct from 1 then
      raise exception 'VERIFY(j): harvest and replant with a Storage seed answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000 or pg_temp.sfs_held(v_u, v_seed) <> 0
       or not exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 0 and crop_id = v_crop) then
      raise exception 'VERIFY(j): the replant bought a seed or did not plant: purse %, seeds %', (select gold from public.account_wallet where user_id = v_u), pg_temp.sfs_held(v_u, v_seed); end if;

    raise exception using errcode = 'HR8A5', message = 'skills-from-storage §7 complete - rolling back';
  exception when sqlstate 'HR8A5' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u)
     or exists (select 1 from public.account_farm_plots where user_id = v_u) or exists (select 1 from public.account_wallet where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) or exists (select 1 from public.player_intents where user_id = v_u) then
    raise exception 'VERIFY(k): §7 LEAKED a probe row'; end if;

  -- (l) THE GRANTS: the view and the resume are owner-only; hr_apply is the engine's alone; the farm verbs authenticated-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_role, 'public.hr_skill_inputs_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_resume_has_inputs(uuid,integer,text,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_materials_take(uuid,integer,jsonb,boolean)', 'execute') then
      raise exception 'VERIFY(l): % reaches an owner-only helper', v_role; end if;
  end loop;
  foreach v_fn in array array['public.hr_skill_inputs_view(uuid,integer)', 'public.hr_resume_has_inputs(uuid,integer,text,text)',
                              'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'public.hr_farm_plant(integer,integer,text,uuid)',
                              'public.hr_farm_harvest_replant(integer,integer,uuid)'] loop
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'VERIFY(l): PUBLIC can execute %', v_fn; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'VERIFY(l): hr_apply is not the engine''s alone'; end if;
  foreach v_fn in array array['public.hr_farm_plant(integer,integer,text,uuid)', 'public.hr_farm_harvest_replant(integer,integer,uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('service_role', v_fn, 'execute')
       or not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'VERIFY(l): % is not authenticated-only', v_fn; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'skills-from-storage: benches, the resume and planting take the hero''s bag first, then the account''s Storage, all or nothing, journalled by source; all green';
end $$;

drop function if exists pg_temp.sfs_held(uuid, text);
drop function if exists pg_temp.sfs_put(uuid, integer, text, bigint, bigint);
