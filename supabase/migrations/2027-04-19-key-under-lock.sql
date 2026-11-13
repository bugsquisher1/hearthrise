-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-19-key-under-lock.sql — A SECOND PRESS OF ONE KEY ANSWERS THE FIRST, READ UNDER THE HERO'S LOCK; hr_companion_grant LEAVES THE
--   CLIENT SURFACE (lane/c-audit-db-fixes, backend-architect, 2026-11-13; two server findings of the whole-game adversarial audit, each
--   confirmed by three skeptics).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §3. ON THE EA SECURITY LIST: three gold / item verbs restated, one grant revoked.
-- ORDER: after 2027-04-16-combat-training.sql (any later position holds: §0 pins the three bodies it restates and refuses a moved one).
-- EDGE: none. CLIENT: none. Every answer a client can see is unchanged; src/ names hr_companion_grant nowhere (tests/client-intent-surface.mjs).
--
-- ── FINDING 1 (P1, money): A KEY READ ONLY BEFORE THE LOCK ──────────────────────────────────────────────────────────────────
-- hr_scaled_hunt_buy read its key (hr_intent_replay) and THEN took the hero's lock (hr_hunt_lock). Two presses of one key: the second's
-- read runs while the first holds the lock and sees no row, it waits on the lock, and once the first commits it re-quotes under the lock
-- and calls hr_apply with the decided key. hr_apply answers a decided key { ok: true, replayed: true } and charges nothing (its own
-- idempotency, 2026-10-27-core-bodies.sql), and the verb went on to bank the hours: 12 h banked with no gold, no ledger row and no use of
-- the day's clamp (the day is counted from the ledger). Reproduced on the replayed chain (tests/key-under-lock.mjs KL-SCALED).
-- THE FIX, hr_crier_send's (2027-02-27-town-crier.sql, whose body already reads the key twice): the key is read AGAIN right after the lock, and a
-- replayed hr_apply ends the call before anything else is written (the settle's own move, hr_hunt_apply_member: `replayed` returns early).
--
-- THE SWEEP, 2026-11-13: every function on the replayed chain whose body reads a key (hr_intent_replay or public.player_intents), classed
-- by where that read sits against its first lock and whether hr_apply on the caller's key carries the cost. The hole needs all three:
-- the read only before the lock, the cost in hr_apply on that key (deduplicated: the second press pays nothing), and an effect written
-- outside hr_apply after it (not deduplicated: the second press gets it again).
--   FIXED HERE (restated whole, §1, the read under the lock + the replayed line, every other line verbatim):
--     hr_scaled_hunt_buy  EXPLOITABLE: hours banked free. Behind the server switch `scaled_hunts`, seeded OFF (2027-03-21-scaled-hunts.sql)
--                         and flipped by no later file: refused feature_off before the lock in every seeded scope today.
--     hr_hearth_burn      EXPLOITABLE: the second press (the hero holding a second fuel) writes a hearth_flames row, a colour for the whole
--                         town that pushes other players' bought shows (hr_town_show_push), and its system chat line, with no fuel spent,
--                         no Inner Flame XP and no journal row: a shared-surface write with no cost and no ledger (CLAUDE.md §1).
--     hr_stamina_refill   LATENT, one catalogue row away, and the house pattern every new money verb copies: today the second press is
--                         quote_changed only because the price climbs (step_num 2 / step_den 15). hr_stamina_refill_rule allows
--                         step_num 0; on that row the second press restores another four hours free, outside the day's count.
--   SAFE BY STATE (the same read-only-before-the-lock shape, but the first press's own committed row refuses the second under the lock,
--   before hr_apply): hr_blessing_buy (already_blessed), hr_title_buy (title_owned), hr_house_dummy_unlock (already_owned), hr_hero_rename
--   (same_name), hr_hero_colors_set (colors_same), hr_training_start (its own hunt is open: busy / hunt_open), hr_boss_call (solo: the hunt
--   is open; party: hr_hunt_party_start replays its own derived key), hr_setup_slot_buy (the price is in the key and the ladder must climb:
--   2027-02-28 gold-sinks catalogue §4), hr_hunt_preset_apply (equips the hero's own items; no value). Pinned by tests/key-under-lock.mjs
--   KL-CLASS: a new verb of this shape is red there until it reads under the lock or names the row that refuses its second press.
--   ALREADY RIGHT: read again under the lock (hr_crier_send, hr_town_show, hr_town_works_give, hr_hallmark, hr_storage_chest_build,
--   hr_loot_dispatch, hr_market_buy / _list / _cancel) or read only under it (hr_quartermaster_buy, hr_unlock_buy, hr_trophy_claim,
--   hr_hunt_restock, hr_buy_hero_slot__ungated, hr_buy_gem_unlock__ungated, hr_recipe_learn__ungated, hr_trait_buy__ungated,
--   hr_put_client_state__ungated, hr_dungeon_settle, the settle's two commits).
--   NO hr_apply ON THE KEY (the verb writes its cost and its effect itself, so a second press is a second honest action, paid in full, never
--   a free one): the farm verbs, hr_bank_move / _many, hr_login_claim (already_claimed), hr_create_hero, hr_character_name_set, the party,
--   preset, action-set, tally, loot-rule, title-wear, item-lock, outfit and hunt door verbs, hr_scaled_hunt_switch. The farm's replant can buy
--   a second seed on a double press at the shop's price (a fair trade, not a mint): noted, not changed here.
--
-- ── FINDING 2 (P2): hr_companion_grant IS A CLIENT VERB NOTHING CALLS ───────────────────────────────────────────────────────
-- 2026-10-22-closed-mode-ungated-rpcs.sql §2 granted it to authenticated, and its source is the caller's word: any signed-in player names a
-- drop / quest / hatch source and owns any of the earned companions in hr_companion_grants. Nothing under src/ calls it (the old client's
-- companions retired with it). EXECUTE is revoked from every request role and its hr_client_rpc_baseline row deleted, together (§2), so
-- hr_assert_grant_hygiene stays quiet in both directions. The body stays (no definer function calls it; the owner keeps EXECUTE).
--
-- ── THE CONTRACT (unchanged signatures, grants and answers) ──────────────────────────────────────────────────────────────────
--   hr_scaled_hunt_buy(p_slot int, p_hunt text, p_hours int, p_price bigint, p_idem uuid) -> jsonb    authenticated
--   hr_hearth_burn(p_slot int, p_item text, p_idem uuid) -> jsonb                                     authenticated
--   hr_stamina_refill(p_slot int, p_price bigint, p_idem uuid) -> jsonb                               authenticated
--   A press of a key already decided answers that decision (hr_intent_replay's stored receipt, ok) and moves nothing, whether it arrives
--   after the first committed or while the first still held the lock. New answer, reachable by no request while the read under the lock
--   holds: { ok: true, replayed: true } when hr_apply says the key was decided after that read. Every refusal is the same as before.
--   hr_companion_grant(int, text, text, uuid): EXECUTE for the owner only. A request gets 42501.
--
-- ── CONCURRENCY AND IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────────────────────
-- hr_hunt_lock is a transaction-level advisory lock on the hero: the second press acquires it only once the first has committed (or rolled
-- back), and its next statement takes a new READ COMMITTED snapshot, so the read under the lock sees the first press's player_intents row.
-- The key is per user, the lock per hero: the same key pressed on another slot of the account is hr_apply's intent_mismatch (the stored
-- row's slot), never a replay. No lock is added or reordered (hero, then hr_apply's purse, then the town's key in hr_hearth_burn).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Closes: free scaled hours, a free town flame (and its chat line and the push of other players' shows), a free stamina refill on a flat
-- table. Removes one client verb (hr_companion_grant). Opens nothing: no new grant, no new table, no new argument.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- One primary-key read of player_intents per purchase, under a lock the verb already holds. No row, no byte, no ledger volume.
--
-- REVERSIBILITY: re-apply the three pre-images (§0 pins their md5s: 2027-03-21-scaled-hunts.sql §4, 2027-02-27-town-shows.sql §7,
-- 2026-10-25-stamina-refill.sql §2); grant execute on hr_companion_grant(int, text, text, uuid) to authenticated and re-insert its
-- hr_client_rpc_baseline row (2026-08-22-companion-grant.sql §4). No table, no data. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (production's, tests/live-hash-drift.baseline.json measured
-- 2026-11-13, equal to the replay's), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (hr_intent_replay, hr_hunt_lock, hr_apply, hr_note_rejection, hr_assert_grant_hygiene)'; end if;
  if to_regprocedure('public.hr_companion_grant(integer,text,text,uuid)') is null then
    raise exception 'PRECONDITION: hr_companion_grant(int, text, text, uuid) is missing: there is nothing to revoke'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> 'hr_companion_grant'
               and p.prosrc ~ 'public[.]hr_companion_grant[[:space:]]*[(]') then
    raise exception 'PRECONDITION: a function calls hr_companion_grant: revoking the request grant would not end its reach'; end if;
  for v_r in select * from (values
    ('public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', '202e79367372f78950c07a0591e38e16', '723241d5d15bdaaf0da98cccbb16c5d2'),
    ('public.hr_hearth_burn(integer,text,uuid)', '9e9070575ccacf50749d1c1819cdec6d', '2cccdf3f522a09c52f596ae70f1c16e8'),
    ('public.hr_stamina_refill(integer,bigint,uuid)', 'a81628429a0d8b978b4583e7b143ef94', '9277c1437c5a739cebce6c8a6a625230')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE THREE VERBS, RESTATED WHOLE: the key read again under the lock, and a replayed hr_apply ends the call ──────────────
-- (a) hr_scaled_hunt_buy: 2027-03-21-scaled-hunts.sql §4, verbatim but for the two marked insertions.
create or replace function public.hr_scaled_hunt_buy(p_slot int, p_hunt text, p_hours int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'scaled_hunt_buy';
  c_hour constant bigint := 3600000;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_a jsonb;
  r public.hr_scaled_hunt_rule%rowtype; v_top int; v_lv int; v_to int; v_price bigint; v_bank bigint; v_today int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  if p_hours is null or p_hours < 1 or p_hours > 1000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours')); end if;
  -- The key names the whole purchase (ground, hours, price): a replay answers its own receipt, another purchase under it is intent_mismatch.
  v_verb := c_verb || ':' || p_hunt || ':' || p_hours || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('scaled_hunts', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE QUOTE, under the lock, from the server's own rows: never the client's number.
  select * into r from public.hr_scaled_hunt_rule where id;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  select g.top into v_top from public.hr_scaled_grounds g where g.hunt_id = p_hunt;
  if v_top is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  v_to := public.hr_scaled_level(p_hunt, v_lv);
  if v_to is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scale_level', 'level', v_lv, 'need', v_top + 1)); end if;
  if p_hours < r.min_hours or p_hours > r.max_hours then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours', 'min', r.min_hours, 'max', r.max_hours)); end if;
  v_price := r.price_per_level::bigint * v_to * p_hours;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'scaled_hunts', public.hr_scaled_hunts_view(v_uid, p_slot))); end if;
  -- THE BANK: never past the cap (a price change never leaves a big stock bought at the old price).
  v_bank := coalesce((select h.banked_ms from public.player_scaled_hours h where h.user_id = v_uid and h.slot = p_slot and h.hunt_id = p_hunt), 0);
  if v_bank + p_hours * c_hour > r.bank_max_hours::bigint * c_hour then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scaled_bank_full',
      'banked_ms', v_bank, 'max_ms', r.bank_max_hours::bigint * c_hour)); end if;
  -- THE DAY: every ground together, counted from the append-only ledger.
  v_today := public.hr_scaled_hours_today(v_uid, p_slot);
  if v_today + p_hours > r.day_max_hours then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scaled_day_limit', 'today', v_today, 'max', r.day_max_hours)); end if;
  -- THE GOLD, then the bank (the lock order the settle keeps: hero, purse, bank row).
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'hunt', p_hunt, 'hours', p_hours, 'level', v_to,
                                                                    'hero_level', v_lv, 'price_per_hour', r.price_per_level::bigint * v_to,
                                                                    'banked_ms', v_bank))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  insert into public.player_scaled_hours as h (user_id, slot, hunt_id, banked_ms, use_on, bought_ms, spent_ms, bought_at, updated_at)
    values (v_uid, p_slot, p_hunt, p_hours * c_hour, true, p_hours * c_hour, 0, now(), now())
    on conflict (user_id, slot, hunt_id) do update
      set banked_ms = h.banked_ms + excluded.banked_ms, bought_ms = h.bought_ms + excluded.bought_ms, use_on = true,
          bought_at = now(), updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_price, 'hours', p_hours,
                            'scaled_hunts', public.hr_scaled_hunts_view(v_uid, p_slot));
end $fn$;

-- (b) hr_hearth_burn: 2027-02-27-town-shows.sql §7, verbatim but for the two marked insertions.
create or replace function public.hr_hearth_burn(p_slot int, p_item text, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  c_per_min constant int := 10;
  v_uid   uuid := auth.uid();
  v_verb  text;
  v_r     jsonb;
  v_ver   bigint;
  v_hunt  text;
  v_fuel  public.hr_hearth_named%rowtype;
  v_rule  public.hr_hearth_rule%rowtype;
  v_have  bigint; v_lv int; v_n int;
  v_map   text;
  v_start timestamptz; v_end timestamptz;
  v_a     jsonb; v_quiet boolean; v_msg uuid; v_place jsonb; v_me jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  v_verb := 'hearth_burn:' || p_item;
  -- A RETRY of a decided key answers that decision (a burn already made answers ok and burns nothing again)
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hearth_burn', p_slot, v_r); end if;
  if not public.hr_rate_ok(v_uid, 'hearth_burn', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row, its open hunt (the Hearth is in town)
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hearth_burn', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
  if v_hunt is not null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_hunt)); end if;
  -- THE CATALOGUE: a named fuel, and the rule
  select * into v_fuel from public.hr_hearth_named where item_id = p_item;
  if not found then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  select * into v_rule from public.hr_hearth_rule where id;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if not found or v_rule.id is null or v_map is null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- THE HERO HOLDS ONE, IN ITS BAG (the item menu is the bag's)
  select qty into v_have from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;
  if coalesce(v_have, 0) < 1 then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_item')); end if;
  -- ITS INNER FLAME, as the server holds it
  v_lv := public.hr_skill_level('inner_flame', coalesce((select s.xp from public.player_skills s
                                                          where s.user_id = v_uid and s.slot = p_slot and s.skill_id = 'inner_flame'), 0));
  if v_lv < v_fuel.req_lv then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'flame_too_low', 'need', v_fuel.req_lv, 'have', v_lv)); end if;
  -- THE HERO'S DAY (the server's UTC day)
  select count(*) into v_n from public.hearth_flames f
   where f.user_id = v_uid and f.slot = p_slot and f.created_at >= public.hr_utc_day_start(now());
  if v_n >= v_rule.per_day then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_limit', 'per_day', v_rule.per_day)); end if;
  -- THE TOWN'S HEARTH, READ BEFORE THE BURN so the usual refusal moves nothing: one burn at a time per town; a colour queues behind the last one, up to queue_s ahead
  v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));
  if v_start > now() + make_interval(secs => v_rule.queue_s) then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_busy',
      'wait_s', ceil(extract(epoch from (v_start - now())) - v_rule.queue_s)::int)); end if;
  begin
    -- THE BURN: the item and the XP, journalled, exactly once on this key
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'items', jsonb_build_object(p_item, -1),
             'xp', jsonb_build_object('inner_flame', v_fuel.xp),
             'journal', jsonb_build_object('kind', 'craft', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'hearth_named', 'flame', v_fuel.flame, 'secs', v_fuel.secs,
                                                                      'from', v_start, 'map', v_map))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('hearth_burn', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
    if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
    -- THE HEARTH'S KEY, LAST, as hr_town_show takes it: held over hr_apply it deadlocked a burn against the same account's powder (tests/town-shows-race.mjs R4).
    -- A queue that filled while this waited raises and rolls the burn back whole: the item and the XP stay where they were.
    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));
    v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));
    if v_start > now() + make_interval(secs => v_rule.queue_s) then raise exception using errcode = 'HR942', message = 'hearth_busy'; end if;
    v_end := v_start + make_interval(secs => v_fuel.secs);
    -- THE SQUARE: a system line naming the burner (never a quiet hero), then the colour
    select coalesce(ps.presence_quiet, false) into v_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;
    if not v_quiet then
      v_msg := gen_random_uuid();
      -- from_name is stamped by hr_chat_name_authority (the character's name); the placeholder never shows
      insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
      values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'fed the Great Hearth a [[item:' || p_item || ']].');
    end if;
    insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at, message_id)
    values (v_map, p_item, v_fuel.flame, v_uid, p_slot, v_start, v_end, v_msg);
    -- A NAMED FUEL NEVER WAITS: bought flames move out of its way, each still burning for every second paid for
    perform public.hr_town_show_push(v_map, v_start, v_end);
  exception when sqlstate 'HR942' then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_busy',
      'wait_s', greatest(1, ceil(extract(epoch from (v_start - now())) - v_rule.queue_s))::int));
  end;
  -- THE HERO WALKS TO THE FIRE: a free fuel stand (display presence; no output waits on it)
  if public.hr_flag_on('town_presence') then
    insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, p_slot, now())
      on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
    v_place := public.hr_town_place(v_uid, p_slot, v_map, 'hearth', 'visit');
    if v_place->>'ok' = 'true' then v_me := v_place->'me'; end if;
  end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'item', p_item, 'xp', v_fuel.xp,
    'flame', jsonb_build_object('flame', v_fuel.flame, 'from_ms', floor(extract(epoch from v_start) * 1000)::bigint,
                                'until_ms', floor(extract(epoch from v_end) * 1000)::bigint),
    'me', v_me);
end $fn$;

-- (c) hr_stamina_refill: 2026-10-25-stamina-refill.sql §2, verbatim but for the two marked insertions (the house pattern: copy THIS image).
create or replace function public.hr_stamina_refill(p_slot int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_sat timestamptz; v_at timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'stamina_refill:' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('stamina_refill', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('stamina_refill', p_slot, v_r); end if;
  select version, stamina_at into v_ver, v_sat from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_stamina_refill_quote(v_uid, p_slot);
  if v_q is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'stamina_refill', v_q)); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'stamina_refill', v_q)); end if;
  v_at := (v_q->>'at')::timestamptz;
  if v_sat is not null and v_sat > v_at then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'stamina_ahead')); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'stamina_refill', 'n', (v_q->>'n')::int,
                                                                    'restore_ms', (v_q->>'restore_ms')::bigint, 'from_ms', (v_q->>'ms')::bigint,
                                                                    'level', (v_q->>'level')::int, 'at', v_at))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('stamina_refill', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  update public.player_state
     set stamina_ms = least((v_q->>'max_ms')::bigint, (v_q->>'ms')::bigint + (v_q->>'restore_ms')::bigint), stamina_at = v_at
   where user_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price,
                            'restored_ms', (v_q->>'restore_ms')::bigint, 'stamina', public.hr_stamina_view(v_uid, p_slot));
end $fn$;

-- (d) THE GRANTS, EXACT (create or replace keeps an ACL; stated anyway, so this file alone says who may call them)
revoke execute on function public.hr_scaled_hunt_buy(int, text, int, bigint, uuid) from public, anon, service_role;
revoke execute on function public.hr_hearth_burn(int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_stamina_refill(int, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_scaled_hunt_buy(int, text, int, bigint, uuid) to authenticated;
grant  execute on function public.hr_hearth_burn(int, text, uuid) to authenticated;
grant  execute on function public.hr_stamina_refill(int, bigint, uuid) to authenticated;

-- ── §2 hr_companion_grant OFF THE CLIENT SURFACE: THE REVOKE AND THE BASELINE, TOGETHER ─────────────────────────────────────
revoke execute on function public.hr_companion_grant(integer, text, text, uuid) from public;
revoke execute on function public.hr_companion_grant(integer, text, text, uuid) from anon, authenticated, service_role;
delete from public.hr_client_rpc_baseline where proname = 'hr_companion_grant';

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────────────────────────────────────────────────────
-- (a) THE SHAPE: each verb reads its key before the lock AND again between the lock and hr_apply, a replayed hr_apply ends it, and its
--     grants are exactly the signed-in client's.
-- (b) ★ THE RACE, PLAYED (PGlite and a migration are one backend, so the second press is played as what it runs AFTER the lock it waited
--     on): for each verb, press A on a key moves its value; press B is this body with the read before the lock cut out (built from
--     pg_get_functiondef as a throwaway function inside this rolled-back block) on the same key: it answers A's decision and moves nothing.
--     CONTROL, the same continuation with the read under the lock and the replayed line cut too (the image before this file): it DOES move
--     the value (hours banked free, a flame lit free, stamina restored free), so (b) is able to see the hole it closes.
-- (c) hr_companion_grant: no request role may execute it, the baseline holds no row for it, and as `authenticated` a call is 42501.
-- (d) hr_assert_grant_hygiene(true) is quiet.
do $$
declare
  c_u    constant uuid := '000000c4-0000-4000-a000-0000c1a50419';
  c_k    constant text := '000000c4-0000-4000-a000-0000c1a5';
  c_read constant text := 'v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);';
  c_lock constant text := 'perform public.hr_hunt_lock(v_uid, p_slot);';
  c_done constant text := 'if coalesce(v_a->>''replayed'', ''false'') = ''true'' then return jsonb_build_object(''ok'', true, ''replayed'', true); end if;';
  v jsonb; v_src text; v_def text; v_cut text; v_sig text; v_fn text; v_as text; v_role text; v_at int; v_n int; v_refused boolean := false;
  v_g text; v_h int; v_p bigint; v_cap bigint; v_g0 bigint; v_b0 bigint; v_l0 int; v_i0 bigint; v_f0 int; v_s0 bigint;
begin
  -- (a)
  foreach v_sig in array array['public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'public.hr_hearth_burn(integer,text,uuid)',
                               'public.hr_stamina_refill(integer,bigint,uuid)'] loop
    select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = v_sig::regprocedure;
    v_at := strpos(v_src, c_lock);
    v_n := (length(v_src) - length(replace(v_src, c_read, ''))) / length(c_read);
    if v_at = 0 or v_n <> 2 or strpos(v_src, c_read) > v_at
       or strpos(substr(v_src, v_at), c_read) = 0 or strpos(substr(v_src, v_at), c_read) > strpos(substr(v_src, v_at), 'public.hr_apply(') then
      raise exception 'key-under-lock §3(a): % does not read its key both before its lock and between the lock and hr_apply', v_sig; end if;
    if (length(v_src) - length(replace(v_src, c_done, ''))) / length(c_done) <> 1
       or strpos(v_src, c_done) < strpos(v_src, 'public.hr_apply(') then
      raise exception 'key-under-lock §3(a): % does not end on a replayed hr_apply', v_sig; end if;
    if not has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute')
       or has_function_privilege('service_role', v_sig, 'execute') or not (select prosecdef from pg_proc where oid = v_sig::regprocedure) then
      raise exception 'key-under-lock §3(a): % is not exactly the signed-in client''s security definer verb', v_sig; end if;
  end loop;
  -- (c) the shape half
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_companion_grant(integer,text,text,uuid)', 'execute') then
      raise exception 'key-under-lock §3(c): % can execute hr_companion_grant', v_role; end if;
  end loop;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_companion_grant') then
    raise exception 'key-under-lock §3(c): the hr_companion_grant baseline row survived'; end if;
  -- (d)
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- THE CONTINUATIONS: B (the read before the lock cut out) and its CONTROL (both reads and the replayed line cut: the old image)
    for v_sig, v_fn, v_as in select * from (values
        ('public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'hr_scaled_hunt_buy', 'hr__klu_scaled'),
        ('public.hr_hearth_burn(integer,text,uuid)', 'hr_hearth_burn', 'hr__klu_hearth'),
        ('public.hr_stamina_refill(integer,bigint,uuid)', 'hr_stamina_refill', 'hr__klu_stamina')) t loop
      v_def := replace(pg_get_functiondef(v_sig::regprocedure), chr(13), '');
      v_at := strpos(v_def, 'FUNCTION public.' || v_fn || '(');
      if v_at = 0 then raise exception 'key-under-lock §3-harness: % has no header to rename', v_sig; end if;
      v_def := overlay(v_def placing 'FUNCTION public.' || v_as || '(' from v_at for length('FUNCTION public.' || v_fn || '('));
      v_at := strpos(v_def, c_read);
      v_cut := overlay(v_def placing '' from v_at for strpos(substr(v_def, v_at), 'end if;') + length('end if;') - 1);
      execute v_cut;
      v_at := strpos(v_cut, c_read);
      if v_at = 0 then raise exception 'key-under-lock §3-harness: % has no read left under the lock', v_sig; end if;
      v_cut := replace(overlay(v_cut placing '' from v_at for strpos(substr(v_cut, v_at), 'end if;') + length('end if;') - 1), c_done, '');
      execute replace(v_cut, 'FUNCTION public.' || v_as || '(', 'FUNCTION public.' || v_as || '_old(');
    end loop;

    -- THE PROBE HERO: Level 20, a purse, the scaled_hunts switch on for it alone, no hunt open
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'key-under-lock §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'key-under-lock §3-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, presence_quiet = true, level_xp = public.hr_char_xp_for_level(20)
     where user_id = c_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (c_u, 1000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_u] where switch_id = 'scaled_hunts';

    -- (b1) hr_scaled_hunt_buy: the first ground a Level 20 hero scales, the slider's least hours
    select g.key, (g.value->>'price')::bigint into v_g, v_p from jsonb_each(public.hr_scaled_hunts_view(c_u, 0)->'grounds') g
     where g.value->>'price' is not null order by g.key limit 1;
    if v_g is null then raise exception 'key-under-lock §3-harness: no ground scales for a Level 20 hero: %', public.hr_scaled_hunts_view(c_u, 0); end if;
    select r.min_hours into v_h from public.hr_scaled_hunt_rule r where r.id;
    v_p := v_p * v_h;
    v := public.hr_scaled_hunt_buy(0, v_g, v_h, v_p, (c_k || '0001')::uuid);
    v_g0 := public.hr_purse_of(c_u);
    v_b0 := (select h.banked_ms from public.player_scaled_hours h where h.user_id = c_u and h.slot = 0 and h.hunt_id = v_g);
    v_l0 := (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'scaled\_hunt\_buy:%');
    if coalesce(v->>'ok', '') <> 'true' or v_g0 <> 1000000 - v_p or v_b0 <> v_h * 3600000::bigint or v_l0 <> 1 then
      raise exception 'key-under-lock §3(b1)-harness: press A answered % (purse %, bank %, rows %)', v, v_g0, v_b0, v_l0; end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_scaled($1, $2, $3, $4, $5)' into v using 0, v_g, v_h, v_p, (c_k || '0001')::uuid;
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(c_u) <> v_g0
       or (select h.banked_ms from public.player_scaled_hours h where h.user_id = c_u and h.slot = 0 and h.hunt_id = v_g) <> v_b0
       or (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'scaled\_hunt\_buy:%') <> v_l0 then
      raise exception 'key-under-lock §3(b1): the second press of one key, after the lock, answered % and moved the purse or the bank', v; end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_scaled_old($1, $2, $3, $4, $5)' into v using 0, v_g, v_h, v_p, (c_k || '0001')::uuid;
    if (select h.banked_ms from public.player_scaled_hours h where h.user_id = c_u and h.slot = 0 and h.hunt_id = v_g) <> v_b0 + v_h * 3600000::bigint
       or public.hr_purse_of(c_u) <> v_g0 then
      raise exception 'key-under-lock §3(b1) CONTROL: the image before this file banked nothing free (%): the probe cannot see the hole', v; end if;

    -- (b2) hr_hearth_burn: the lowest named fuel, the hero at its Inner Flame, two in the bag, a long queue so live flames never refuse it
    select f.item_id, f.req_lv into v_g, v_n from public.hr_hearth_named f order by f.req_lv, f.item_id limit 1;
    if v_g is null then raise exception 'key-under-lock §3-harness: hr_hearth_named is empty'; end if;
    update public.player_skills set xp = coalesce((select min(c.xp) from public.hr_skill_curve c where c.level = v_n), 0)
     where user_id = c_u and slot = 0 and skill_id = 'inner_flame';
    if not found then raise exception 'key-under-lock §3-harness: a new hero has no Inner Flame row'; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, v_g, 2)
      on conflict (user_id, slot, item_id) do update set qty = 2;
    update public.hr_hearth_rule set queue_s = 3600 where id;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hearth_burn(0, v_g, (c_k || '0002')::uuid);
    v_i0 := (select qty from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_g);
    v_f0 := (select count(*) from public.hearth_flames f where f.user_id = c_u);
    v_s0 := (select xp from public.player_skills where user_id = c_u and slot = 0 and skill_id = 'inner_flame');
    if coalesce(v->>'ok', '') <> 'true' or v_i0 <> 1 or v_f0 <> 1 then
      raise exception 'key-under-lock §3(b2)-harness: press A answered % (fuel %, flames %)', v, v_i0, v_f0; end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_hearth($1, $2, $3)' into v using 0, v_g, (c_k || '0002')::uuid;
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.hearth_flames f where f.user_id = c_u) <> v_f0
       or (select qty from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_g) <> v_i0
       or (select xp from public.player_skills where user_id = c_u and slot = 0 and skill_id = 'inner_flame') <> v_s0 then
      raise exception 'key-under-lock §3(b2): the second press of one key, after the lock, answered % and lit a flame or moved the bag', v; end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_hearth_old($1, $2, $3)' into v using 0, v_g, (c_k || '0002')::uuid;
    if (select count(*) from public.hearth_flames f where f.user_id = c_u) <> v_f0 + 1
       or (select qty from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_g) <> v_i0 then
      raise exception 'key-under-lock §3(b2) CONTROL: the image before this file lit no free flame (%): the probe cannot see the hole', v; end if;

    -- (b3) hr_stamina_refill on a FLAT table (step_num 0, a row hr_stamina_refill_rule accepts), room for two whole purchases
    v_cap := public.hr_stamina_cap(c_u, 0, now());
    if v_cap is null or v_cap < 120000 then raise exception 'key-under-lock §3-harness: the stamina cap is %', v_cap; end if;
    update public.hr_stamina_refill_rule set step_num = 0, max_min = least(max_min, (v_cap / 60000 / 2)::int) where id;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = c_u and slot = 0;
    v := public.hr_stamina_refill_quote(c_u, 0);
    if not coalesce((v->>'available')::boolean, false) then raise exception 'key-under-lock §3-harness: no refill on an empty pool: %', v; end if;
    v_p := (v->>'price')::bigint;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_stamina_refill(0, v_p, (c_k || '0003')::uuid);
    v_g0 := public.hr_purse_of(c_u);
    v_s0 := (select stamina_ms from public.player_state where user_id = c_u and slot = 0);
    v_l0 := (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'stamina\_refill:%');
    if coalesce(v->>'ok', '') <> 'true' or v_s0 <= 0 or v_l0 <> 1 or (public.hr_stamina_refill_quote(c_u, 0)->>'price')::bigint is distinct from v_p then
      raise exception 'key-under-lock §3(b3)-harness: press A answered % (stamina %, rows %, next quote %)', v, v_s0, v_l0, public.hr_stamina_refill_quote(c_u, 0); end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_stamina($1, $2, $3)' into v using 0, v_p, (c_k || '0003')::uuid;
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(c_u) <> v_g0
       or (select stamina_ms from public.player_state where user_id = c_u and slot = 0) <> v_s0
       or (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'stamina\_refill:%') <> v_l0 then
      raise exception 'key-under-lock §3(b3): the second press of one key, after the lock, answered % and moved the purse or the pool', v; end if;
    delete from public.hr_rate_counters where user_id = c_u;
    execute 'select public.hr__klu_stamina_old($1, $2, $3)' into v using 0, v_p, (c_k || '0003')::uuid;
    if (select stamina_ms from public.player_state where user_id = c_u and slot = 0) <= v_s0 or public.hr_purse_of(c_u) <> v_g0 then
      raise exception 'key-under-lock §3(b3) CONTROL: the image before this file restored nothing free (%): the probe cannot see the hole', v; end if;

    -- (c) the request half: as `authenticated`, the grant is refused before the body runs
    set local role authenticated;
    begin
      perform public.hr_companion_grant(0, 'fox', 'shop', gen_random_uuid());
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    if not v_refused then raise exception 'key-under-lock §3(c): authenticated still reaches hr_companion_grant'; end if;

    raise exception using errcode = 'HRKL9', message = 'key-under-lock §3 complete - rolling back';
  exception when sqlstate 'HRKL9' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u)
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'hr\_\_klu\_%') then
    raise exception 'key-under-lock §3: LEAKED a probe row or a throwaway function'; end if;
  raise notice 'key-under-lock: a second press of one key answers the first under the lock (scaled hours, the Hearth, stamina), the old image moves value free on the same press, hr_companion_grant is off the client surface; all green';
end $$;
