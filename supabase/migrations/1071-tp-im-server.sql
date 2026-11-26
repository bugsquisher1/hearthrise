-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1071-tp-im-server.sql — TEMPER AND IMBUEMENTS ON STEPS, THE SERVER HALF, PART 1: the old Tempering rungs leave the
--   server, a Temper rank takes the Tempering Salts of the worn piece's band from the bag and then Storage, and an imbuement is refused on a
--   hero more than wearAhead under its band (lane/tp-server-1, backend-architect, 2026-11-26; docs/design/redesign/21-flame-temper-imbue-loot.md
--   section 7, rulings D-14 and D-15; the spec is .claude/coordination/HANDOFFS.md "2026-11-26 · game-designer (lane/tp-im-steps)", items 1,
--   2 and 3a. The rules are 1069-gear-phase-b-flame-temper-catalogue.generated.sql's, written from src/data by tools/gen-flame-temper.mjs).
--
-- STATUS: supabase/migration-notes/1071-tp-im-server.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after every file on set/v0.2.144, and after 1063-flame-temper.sql (the verbs it
--   restates) and 1069-gear-phase-b-flame-temper-catalogue.generated.sql (hr_temper_kits, hr_temper_kit_at, hr_imbue_wearable). Applied as
--   ONE transaction by the apply tool; never begin/commit here. Ends with its §5 self-check.
--
-- ── NO BACK-COMPAT (CLAUDE.md §1) ───────────────────────────────────────────
-- A live hero's old Tempering rungs are DELETED, never converted to ranks and never refunded (no progress protection, 2026-11-07/09). The
-- release note must say it plainly: "Tempering rungs are gone. Temper on steps replaces them." The gold paid for them stays burned.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 THE OLD RUNGS LEAVE (D-15). Rows: hr_unlock_offers of source gen-temper (the 60 rungs tests/unlock-buy.mjs U1 read as its one
--    difference), hr_unlocks of namespace temper (12 ladders) and every player_progress row of those ladders (kind unlock). After it no
--    seller of a rung exists: hr_unlock_buy answers unknown_offer for any temper.* id (its own catalogue read, before any lock), as the edge
--    already does (lane/tp-im-steps). Bodies: hr_unlock_buy's bag-then-Storage list loses 'temper' (the exact inverse of
--    2027-02-28-temper-craft.sql's one anchor; the house namespaces keep theirs). The envelope's `temper` section leaves
--    (hr_state_sections row, hr_temper_view dropped). hr_perks_of is RESTATED WHOLE without the `temper` key, its read and its `sources` line
--    (no engine file reads them since lane/tp-im-steps); `temperSteps` stays as 1063 spliced it.
-- §2 THE TEMPER KIT A BAND (D-14). hr_temper_rank(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid), signature unchanged:
--    the kit is hr_temper_kit_at(the worn piece's item Level), never another band's; the count is hr_temper_rank_quote's (the twin of
--    src/core/temper-steps.js rankQuote). The kits come from the hero's bag first, then the account's Storage (hr_materials_take, all or
--    nothing), then ONE hr_apply { gold: -fee } journalled kind shop, intent temper:<equip_slot>:<fee>, meta { reason temper, equip_slot,
--    rank_before, rank_after, item_level, band, level, kit, kits, took { bag, storage } }. A refusal after the take rolls the take back.
--    Answers, in the order they are decided:
--      not_signed_in · not_open (switch temper_steps off) · bad_slot · bad_equip_slot · bad_idem · bad_quote (p_price null, < 0 or past 1e12)
--      · intent_mismatch (the key names another verb) · rate_limited · no_character · no_piece (nothing worn in the slot)
--      · not_seated {temper_steps} (the worn tier passes the seat: re-seat first) · rank_max (5 held) · rank_locked {next_at}
--      · kits_owed {band} (no row for the band, or its kit is no hr_items row yet: Bronze, Dawnsteel until the job slice, past Dawnsteel)
--      · quote_changed {temper_steps} (p_price is not the fee) · insufficient_item {item_id, have, need, bag, storage} (bag + Storage short)
--      · insufficient_gold (hr_apply's) · ok { version, gold, rank, kit, kits, envelope }
--    A second press of a decided key answers the first (hr_intent_replay before and under hr_hunt_lock) and moves nothing.
--    hr_temper_steps_view (the section `temper_steps`): each slot's quote for the next rank is { fee, kits, rank, kit, kits_owed }, kit the
--    band's item (null for a band with none) and kits_owed true where the server would refuse kits_owed; the seat quote is unchanged.
--    hr_temper_rules.kit_item has no reader and no writer after this file (see the catalogue's header for why the column itself stays).
-- §3 IMBUEMENTS (item 3a). hr_imbue_apply(p_slot, p_equip_slot, p_imbue, p_price, p_idem), signature unchanged: band_locked {band, level}
--    when hr_imbue_wearable(the imbuement's band, the server's Level) is false (the band stands more than GEAR_STEPS.wearAhead over the hero;
--    the twin of src/core/imbue.js imbueStepsAt, which counts it 0), decided after no_piece and before quote_changed. The one imbuement item
--    comes from the bag first, then Storage (hr_materials_take), then ONE hr_apply { gold: -fee } journalled kind shop, intent
--    imbue_apply:<imbue>:<fee>, meta { ..., took { bag, storage } }. hr_imbues_view (the section `imbues`) gains `wearable` { imbue: bool }
--    at the hero's Level, so the client never decides the lock. NOT HERE (lane/t1-traits-drop holds hr_hunt_instance_read): the settle's
--    `wornImbues` projection; its field contract is in HANDOFFS 2026-11-26 lane/tp-server-1.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Both verbs: the key is read before and under hr_hunt_lock (the hero's advisory key, then its player_state row); the rank, the worn piece,
-- the Level and the price are read under it, so two presses with two keys are serial and the second is quote_changed or the next rank. The
-- lock order is the house's: the hero -> the account depot (hr_materials_take) -> the bag rows -> the Storage rows -> the purse (hr_apply),
-- last; hero_temper / hero_worn_imbue are written after, and only ever under the hero's lock, so no cycle exists. Kits and imbuement items
-- move inside one sub-block with the purse: any refusal after the take raises and rolls the take back.
--
-- ── EXPLOIT SURFACE (delta) ─────────────────────────────────────────────────
-- Removed: 60 sellable rows and their per-hero rungs (a gold sink for +Blows / +Armor that no engine reads any more). Changed: a rank takes
-- the worn band's kit only (a cheap band's kit never pays for a dear band's rank: hr_temper_kits.item_id is unique), and the kit and the
-- imbuement may come from the account's own Storage (never another account's). Added: band_locked. No verb mints gold, an item or XP; every
-- price, count, band and kit is the server's; nothing crosses to another player. ON THE PRE-EA SECURITY LIST (13-security-list.md S-22,
-- N-6, N-8).
--
-- ── COST (100x: 2,000 accounts x 4 heroes) ───────────────────────────────────
-- Cheaper on every settle and projection: hr_perks_of loses a player_progress x hr_unlocks join a member a settle, and hr_state_of loses the
-- `temper` section's scan of hr_unlocks x player_progress x hr_unlock_offers. Dark (both switches off at apply) the verbs and the two sections
-- cost one hr_flags read. Lit: one hr_temper_kits PK read a slot a projection; a press writes one ledger row, as before.
--
-- EDGE: none (no engine file reads `temper`; the engine reads temperSteps, unchanged, and wornImbues waits for the projection).
-- REVERSIBLE: the rows and the rungs are not (no back-compat: a re-apply of the 2027 temper catalogues restores the ladders, not a hero's
--   rungs). The bodies are: re-apply 1063-flame-temper.sql §4 and §6 for the two verbs and the two sections, 2027-02-28-temper-craft.sql §1
--   for hr_unlock_buy's anchor, 2027-02-27-tempering.sql §2 for hr_temper_view and its section row, and 1063 §5 on the
--   2027-03-31-watched-settle-cost.sql body for hr_perks_of.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_temper_kits') is null or to_regprocedure('public.hr_temper_kit_at(integer)') is null
     or to_regprocedure('public.hr_imbue_wearable(integer,integer)') is null then
    raise exception 'PRECONDITION: the kit a band and the band lock first (1069-gear-phase-b-flame-temper-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_temper_rank(integer,text,bigint,uuid)') is null or to_regprocedure('public.hr_imbue_apply(integer,text,text,bigint,uuid)') is null
     or to_regprocedure('public.hr_temper_steps_view(uuid,integer)') is null or to_regprocedure('public.hr_imbues_view(uuid,integer)') is null
     or to_regprocedure('public.hr_temper_steps_of(uuid,integer)') is null or to_regclass('public.hero_temper') is null then
    raise exception 'PRECONDITION: the verbs this file restates first (1063-flame-temper.sql)'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)') is null
     or to_regprocedure('public.hr_perks_of(uuid,integer)') is null or to_regprocedure('public.hr_unlock_levels(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: a seam this file calls is missing (hr_materials_take, hr_unlock_buy, hr_perks_of, hr_unlock_levels, grant hygiene)'; end if;
  if position('hr_temper_steps_of' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_perks_of carries no temperSteps: 1063-flame-temper.sql §5 has not run, so this restatement would drop it'; end if;
end $mig$;

-- ── §1 THE OLD RUNGS LEAVE (D-15) ────────────────────────────────────────────
-- The rows. The offers go first (nothing may sell a ladder that is gone), then each hero's rungs, then the ladders.
delete from public.hr_unlock_offers where source = 'gen-temper';
delete from public.player_progress p
 where p.kind = 'unlock' and p.period_key = ''
   and p.key in (select u.unlock_id from public.hr_unlocks u where u.namespace = 'temper');
delete from public.hr_unlocks where namespace = 'temper';

-- The envelope's `temper` section: the registry row first (hr_state_sections_of calls every row's function), then its function.
delete from public.hr_state_sections where key = 'temper';
drop function if exists public.hr_temper_view(uuid, integer);

-- hr_unlock_buy: the 'temper' namespace leaves the bag-then-Storage list. The exact inverse of 2027-02-28-temper-craft.sql §1's one anchor;
-- a second apply finds the line already restored and moves nothing.
do $mig$
declare
  v_def text;
  c_from constant text := E'coalesce(v_off.items, ''{}''::jsonb),\n                                       v_cat.namespace in (''room'', ''property'', ''temper''));';
  c_to   constant text := E'coalesce(v_off.items, ''{}''::jsonb),\n                                       v_cat.namespace in (''room'', ''property''));';
begin
  v_def := replace(pg_get_functiondef('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'::regprocedure), chr(13), '');
  if position(c_from in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, c_to, ''))) / length(c_to) <> 1 then
      raise exception 'tp-im-server §1: hr_unlock_buy carries neither the temper-craft line nor its inverse once: the body moved, re-derive this edit'; end if;
    raise notice 'tp-im-server §1: hr_unlock_buy already reads Storage for the house only - edit skipped';
  else
    if (length(v_def) - length(replace(v_def, c_from, ''))) / length(c_from) <> 1 then
      raise exception 'tp-im-server §1: the hr_unlock_buy anchor did not match once'; end if;
    execute replace(v_def, c_from, c_to);
  end if;
end $mig$;

-- hr_perks_of, RESTATED WHOLE (2027-03-22-dead-plot-deed.sql's body as 2027-03-31-watched-settle-cost.sql and 1063-flame-temper.sql §5 left
-- it): the Tempering rungs' read, its `temper` key and its `sources` line leave; nothing else moves.
create or replace function public.hr_perks_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
-- restated WHOLE by 1071-tp-im-server.sql (lane/tp-server-1, 2026-11-26): the old Tempering rungs' read and the `temper` key (with its
-- `sources` line) leave the answer; the rungs themselves are gone (D-15) and no engine file reads the key since lane/tp-im-steps. Before
-- that: restated WHOLE by 2027-03-22-dead-plot-deed.sql from the 2027-02-27-tempering.sql image (the `plots` key left), renown retired by
-- 2027-03-31-watched-settle-cost.sql, `temperSteps` spliced in by 1063-flame-temper.sql. Every other key is unchanged.
declare
  v_rooms jsonb;
  v_tier  int;
  v_recipes jsonb;
  v_comp_id text;
  v_comp_xp bigint;
begin
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  -- A character that does not exist gets a refusal, not an empty stack. The
  -- two are different facts and the engine treats them differently: `ok:false`
  -- means "do not price a perk stack for this row at all", while an empty
  -- stack means "priced, and this player has bought nothing".
  if not exists (
    select 1 from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  select
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'room:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_tier
    from public.hr_unlock_levels(p_user, p_slot) u;

  -- ── THE ARTISAN GATE ──────────────────────────────────────────────────
  -- Recipe scrolls are kind='flag' rows (see hr_unlocks) rather than levels,
  -- because the ACCRUAL ENGINE has to be able to grant one it rolled itself and
  -- 'flag' is in hr_apply's progress allowlist while 'unlock' is deliberately
  -- not. The JOIN to the catalogue is what makes a mis-filed row invisible as
  -- well as refused: hr_unlock_guard rejects a recipe row stored under the wrong
  -- kind, and this read would not see it either.
  --
  -- The wire shape is the CLIENT'S OWN — { "<scroll_id>": true } — so
  -- src/core/artisan.js gateOk consumes the server's answer and G.unlockedRecipes
  -- with the same expression. An absent row is an absent key is a LOCKED recipe:
  -- the fail-closed default is the shape's default, not a branch somebody wrote.
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    into v_recipes
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'recipe'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;

  -- THE RENOWN CHANNEL IS RETIRED (WATCHED-SETTLE-COST, 2027-03-31-watched-settle-cost.sql). This read scored the hero's
  -- renown on every settle (the kill counters, the collection, every skill, the purse) to price renownAllXp, which the
  -- engine has not read since 2026-10-14 (src/core/perks.js normalisePerkState). The key stays below as a named zero.

  -- ── THE EQUIPPED COMPANION (layer-1 passive bonus) ────────────────────
  -- The id is SERVER-OWNED (player_state.companion_equipped, written only by
  -- hr_companion_equip after an ownership check). The xp is a server aggregate
  -- row keyed 'companion_xp:<id>' under kind='stat' — the SAME channel the
  -- bestiary/collection aggregates use, and already in hr_apply's progress
  -- allowlist, so the XP-accrual follow-up writes it with NO schema change (the
  -- 'companion_xp:' prefix is disjoint from 'ev:%', no collision). Read
  -- self-configuringly: no writer yet → 0 → level 1 → base magnitude, the same
  -- self-configuring switch as hr_unlock_levels. src/core/companion-perk.js
  -- prices {id,xp} from the COMPANIONS catalogue, so no pet data is in SQL.
  select ps.companion_equipped into v_comp_id
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  select coalesce(sum(pp.value), 0) into v_comp_xp
    from public.player_progress pp
   where pp.user_id = p_user and pp.slot = p_slot
     and pp.kind = 'stat' and pp.period_key = ''
     and v_comp_id is not null and pp.key = 'companion_xp:' || v_comp_id;

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    -- The property TIER, not the property id: 'property:castle' grants 5 and
    -- the capstone fires at >= CASTLE_TIER. `max` because a player who bought
    -- the Manor and then the Castle holds both rows.
    'propertyTier', coalesce(v_tier, 0),
    -- ⚠ THE JS FIELD NAME, camelCase, deliberately: this envelope is consumed
    --   by the accrual engine untranslated, and a mapping layer is where a field
    --   gets silently dropped and reads as "the player has unlocked nothing".
    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),
    -- Named zeroes, not omissions. An absent key and a key that is honestly
    -- zero are indistinguishable to the reader, and one of them is a bug.
    'renownAllXp', 0,
    -- TEMPER ON STEPS (1063-flame-temper.sql): the seated ranks by slot, {} while its switch is off (src/core/temper-steps.js).
    'temperSteps', public.hr_temper_steps_of(p_user, p_slot),
    'clanPerks', '{}'::jsonb,
    'castle', null,
    -- ⚠ THE COMPANION CHANNEL — bookkeeping only ({id, xp}); the magnitudes are
    --   src/core/companion-perk.js's, off the COMPANIONS catalogue. null when
    --   nothing is equipped, so "no companion" and "an equipped one paying its
    --   base" are distinct wire shapes.
    'companion', case when v_comp_id is null then null
                      else jsonb_build_object('id', v_comp_id, 'xp', coalesce(v_comp_xp, 0)) end,
    -- ⚠ THE HONESTY FIELD. Which channels this answer actually covers. The
    --   Edge Function forwards it into the away card (`away.perkChannel`), so
    --   "the night was priced at zero perks because nothing is unlocked" can
    --   be told apart from "because the channel is not wired" — from the
    --   outside, without reading the source. Every historical away bug in this
    --   codebase was a reward that silently vanished.
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'recipes',    'player_progress:flag:recipe:*',
      'renown',     'retired:the_engine_reads_no_renown',
      'temperSteps', 'hero_temper:seated (switch temper_steps)',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'derived:player_state.companion_equipped')
  );
end $$;
revoke all on function public.hr_perks_of(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, integer) to hr_engine;

-- ── §2 THE TEMPER KIT A BAND (D-14) ──────────────────────────────────────────
-- THE SECTION `temper_steps`, restated: the next rank's quote names its band's kit, and says when the server would refuse it kits_owed.
create or replace function public.hr_temper_steps_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_temper_rules%rowtype; v jsonb := '{}'::jsonb; s record; t public.hero_temper%rowtype; v_il int; v_tier int; v_cap int; v_q jsonb;
  v_kit text;
begin
  -- THE SECTION `temper_steps` (1063-flame-temper.sql; restated by 1071-tp-im-server.sql; 21 section 2.6): every slot's rank, seat and next
  -- price as the server prices it, the kit the band's (hr_temper_kits). null while the switch is off.
  if not public.hr_flag_on('temper_steps') then return null; end if;
  select * into r from public.hr_temper_rules where id = 1;
  v_cap := public.hr_temper_rank_cap(public.hr_level_of(p_user, p_slot));
  for s in select equip_slot from public.hr_temper_slots order by equip_slot loop
    select * into t from public.hero_temper where user_id = p_user and slot = p_slot and equip_slot = s.equip_slot;
    v_il := public.hr_worn_level(p_user, p_slot, s.equip_slot);
    v_tier := case when v_il is null then null else v_il / r.tier_steps end;
    v_q := null;
    if v_il is not null and coalesce(t.rank, 0) > 0 and v_tier > t.seated_tier then
      v_q := jsonb_build_object('seat', public.hr_temper_seat_price(s.equip_slot, t.rank, v_il), 'tier', v_tier);
    elsif v_il is not null and coalesce(t.rank, 0) < v_cap then
      v_kit := public.hr_temper_kit_at(v_il);
      v_q := public.hr_temper_rank_quote(s.equip_slot, coalesce(t.rank, 0) + 1, v_il)
             || jsonb_build_object('rank', coalesce(t.rank, 0) + 1, 'kit', v_kit,
                                   'kits_owed', v_kit is null or not exists (select 1 from public.hr_items i where i.item_id = v_kit));
    end if;
    v := v || jsonb_build_object(s.equip_slot, jsonb_build_object('rank', coalesce(t.rank, 0), 'seated_tier', t.seated_tier, 'item_level', v_il,
           'seated', coalesce(t.rank, 0) > 0 and v_tier is not null and v_tier <= t.seated_tier, 'cap', v_cap,
           'next_at', case when coalesce(t.rank, 0) < r.ranks then (coalesce(t.rank, 0) + 1) * r.rank_every end, 'quote', v_q));
  end loop;
  return v;
end $fn$;

create or replace function public.hr_temper_rank(p_slot int, p_equip_slot text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'temper_rank';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; r public.hr_temper_rules%rowtype; t public.hero_temper%rowtype;
  v_il int; v_tier int; v_next int; v_q jsonb; v_fee bigint; v_kits bigint; v_kit text; v_take jsonb; v_a jsonb; v_lv int;
begin
  -- TEMPER, THE NEXT RANK ON A SLOT (1063-flame-temper.sql; restated by 1071-tp-im-server.sql for the kit a band, D-14). The contract and
  -- the error taxonomy are this file's header, §2.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('temper_steps') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if not exists (select 1 from public.hr_temper_slots where equip_slot = p_equip_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_equip_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'temper:' || p_equip_slot || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on the lock answers the first one's decision (2027-04-19-key-under-lock.sql).
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into r from public.hr_temper_rules where id = 1;
  select * into t from public.hero_temper where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_tier := v_il / r.tier_steps;
  if coalesce(t.rank, 0) > 0 and v_tier > t.seated_tier then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_seated', 'temper_steps', public.hr_temper_steps_view(v_uid, p_slot))); end if;
  if coalesce(t.rank, 0) >= r.ranks then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rank_max', 'rank', t.rank)); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  v_next := coalesce(t.rank, 0) + 1;
  if v_next > public.hr_temper_rank_cap(v_lv) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rank_locked', 'next_at', v_next * r.rank_every)); end if;
  -- THE KIT IS THE WORN BAND'S (D-14): no row, or no item yet, is kits_owed. Never a rank for gold alone, never another band's kit.
  v_kit := public.hr_temper_kit_at(v_il);
  if v_kit is null or not exists (select 1 from public.hr_items where item_id = v_kit) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'kits_owed', 'band', v_tier)); end if;
  v_q := public.hr_temper_rank_quote(p_equip_slot, v_next, v_il);
  v_fee := (v_q->>'fee')::bigint; v_kits := (v_q->>'kits')::bigint;
  if v_fee <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'temper_steps', public.hr_temper_steps_view(v_uid, p_slot))); end if;
  /* THE CHARGE, all or nothing: the kits (the bag, then the account's Storage), then the purse. A refusal after the take raises, and the
     block's rollback puts the kits back. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_kit, v_kits), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRT71', message = 'temper: kits short'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_fee,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'temper', 'equip_slot', p_equip_slot, 'rank_before', coalesce(t.rank, 0),
                                                                      'rank_after', v_next, 'item_level', v_il, 'band', v_tier, 'level', v_lv,
                                                                      'kit', v_kit, 'kits', v_kits, 'took', v_take->'from'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRT72', message = 'temper: hr_apply refused'; end if;
    -- A KEY THIS CALL DID NOT DECIDE moves nothing (never reached while the read above holds under the lock): the take goes back too.
    if coalesce(v_a->>'replayed', 'false') = 'true' then raise exception using errcode = 'HRT73', message = 'temper: replayed'; end if;
  exception
    when sqlstate 'HRT71' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRT72' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
    when sqlstate 'HRT73' then return jsonb_build_object('ok', true, 'replayed', true);
  end;
  insert into public.hero_temper as h (user_id, slot, equip_slot, rank, seated_tier) values (v_uid, p_slot, p_equip_slot, v_next, v_tier)
    on conflict (user_id, slot, equip_slot) do update
      set rank = excluded.rank, seated_tier = case when h.rank = 0 then excluded.seated_tier else h.seated_tier end, updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'rank', v_next, 'kit', v_kit, 'kits', v_kits,
                            'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §3 IMBUEMENTS: THE BAND LOCK, THE BAG THEN STORAGE (item 3a) ──────────────
-- THE SECTION `imbues`, restated: + `wearable`, each imbuement's band lock at the hero's Level (the server's, never the client's).
create or replace function public.hr_imbues_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_lv int;
begin
  -- THE SECTION `imbues` (1063-flame-temper.sql; restated by 1071-tp-im-server.sql; 21 section 3.6): what each slot wears and how long it
  -- has, every imbuement's fee on the piece its slot wears now (null where nothing is worn), and whether this hero's Level may wear it.
  if not public.hr_flag_on('imbuements') then return null; end if;
  v_lv := public.hr_level_of(p_user, p_slot);
  return jsonb_build_object(
    'worn', (select coalesce(jsonb_object_agg(w.equip_slot, jsonb_build_object('imbue', w.imbue_id, 'band', w.band, 'quality', w.quality, 'ms_left', w.ms_left)), '{}'::jsonb)
               from public.hero_worn_imbue w where w.user_id = p_user and w.slot = p_slot),
    'fees', (select coalesce(jsonb_object_agg(i.imbue_id, public.hr_imbue_fee(public.hr_worn_level(p_user, p_slot, i.equip_slot), v_lv)), '{}'::jsonb)
               from public.hr_imbue_rules i where public.hr_worn_level(p_user, p_slot, i.equip_slot) is not null),
    'wearable', (select coalesce(jsonb_object_agg(i.imbue_id, public.hr_imbue_wearable(i.band, v_lv)), '{}'::jsonb) from public.hr_imbue_rules i));
end $fn$;

create or replace function public.hr_imbue_apply(p_slot int, p_equip_slot text, p_imbue text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'imbue_apply';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; i public.hr_imbue_rules%rowtype; w public.hero_worn_imbue%rowtype;
  v_il int; v_lv int; v_fee bigint; v_life bigint; v_take jsonb; v_a jsonb;
begin
  -- AN IMBUEMENT ONTO THE WORN PIECE (1063-flame-temper.sql; restated by 1071-tp-im-server.sql for the band lock and the bag then Storage).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('imbuements') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  select * into i from public.hr_imbue_rules where imbue_id = p_imbue;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_imbue')); end if;
  if p_equip_slot is distinct from i.equip_slot then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'wrong_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if not exists (select 1 from public.hr_items where item_id = i.item_id) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'imbue_owed')); end if;
  v_verb := 'imbue_apply:' || p_imbue || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  -- THE BAND LOCK (item 3a): the imbuement's band, the catalogue's, more than wearAhead over the server's Level cannot be worn.
  if not public.hr_imbue_wearable(i.band, v_lv) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'band_locked', 'band', i.band, 'level', v_lv)); end if;
  v_fee := public.hr_imbue_fee(v_il, v_lv);
  if v_fee <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'imbues', public.hr_imbues_view(v_uid, p_slot))); end if;
  -- QUALITY is the bench's roll (09 section 6) and rides on the stack once the bench makes one; until then every imbuement is plain.
  v_life := public.hr_imbue_life_ms('plain');
  select * into w from public.hero_worn_imbue where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  /* THE CHARGE, all or nothing: the imbuement (the bag, then the account's Storage), then the purse. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(i.item_id, 1), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRI71', message = 'imbue: none held'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_fee,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'imbue_apply', 'imbue', p_imbue, 'item', i.item_id, 'equip_slot', p_equip_slot,
                                                                      'band', i.band, 'item_level', v_il, 'level', v_lv, 'life_ms', v_life, 'took', v_take->'from',
                                                                      'replaced', case when w.imbue_id is null then null
                                                                                       else jsonb_build_object('imbue', w.imbue_id, 'ms_lost', w.ms_left) end))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRI72', message = 'imbue: hr_apply refused'; end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then raise exception using errcode = 'HRI73', message = 'imbue: replayed'; end if;
  exception
    when sqlstate 'HRI71' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRI72' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
    when sqlstate 'HRI73' then return jsonb_build_object('ok', true, 'replayed', true);
  end;
  insert into public.hero_worn_imbue as h (user_id, slot, equip_slot, imbue_id, band, quality, ms_left)
    values (v_uid, p_slot, p_equip_slot, p_imbue, i.band, 'plain', v_life)
    on conflict (user_id, slot, equip_slot) do update
      set imbue_id = excluded.imbue_id, band = excluded.band, quality = excluded.quality, ms_left = excluded.ms_left, updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §4 THE GRANTS (restated: create or replace keeps an ACL, a re-assert costs nothing) ──
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_temper_steps_view(uuid,integer)', 'public.hr_imbues_view(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_temper_rank(integer,text,bigint,uuid)', 'public.hr_imbue_apply(integer,text,text,bigint,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
update public.hr_client_rpc_baseline
   set note = 'added 1063-flame-temper.sql (lane/flame-temper-build), restated 1071-tp-im-server.sql (lane/tp-server-1): MONEY (a gold and kit sink) - the next Temper rank on a slot, the worn band''s Tempering Salts from the bag then Storage, priced by the server; refuses kits_owed, quote_changed; dark (temper_steps)'
 where grantee = 'authenticated' and proname = 'hr_temper_rank';
update public.hr_client_rpc_baseline
   set note = 'added 1063-flame-temper.sql (lane/flame-temper-build), restated 1071-tp-im-server.sql (lane/tp-server-1): MONEY (a gold and item sink) - an imbuement from the bag then Storage onto the worn piece, 20 hunted hours; refuses band_locked, quote_changed; dark (imbuements)'
 where grantee = 'authenticated' and proname = 'hr_imbue_apply';

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) RETIRED: no gen-temper offer, no temper ladder, no hero rung, no `temper` section or hr_temper_view, hr_unlock_buy reads Storage for
--     the house only and answers unknown_offer for a rung, and hr_perks_of answers exactly its keys without `temper`.
-- (b) DARK: with the switches as applied (off), both verbs answer not_open and both sections are null.
-- (c) TEMPER, lit: a Level 39 hero is rank_locked; at Level 40 a wrong price is quote_changed and moves nothing; the right one takes the
--     band's kit from the bag, then Storage, burns the fee, writes ONE shop row naming the kit and the split, seats rank 1, reaches
--     hr_perks_of and the envelope; the key pressed again moves nothing; a held rank 5 is rank_max; another band's kits do not pay (an Iron
--     piece with only Fine salts held is insufficient_item, nothing moves); Bronze and Dawnsteel are kits_owed; the section names the kit.
-- (d) IMBUEMENTS, lit: imbue_owed while the item is not one; with a stand-in item, a hero one Level under the lock is band_locked and
--     moves nothing, and at the lock's Level it applies from Storage alone; the section's `wearable` agrees; the key pressed again moves nothing.
-- (e) The grants: the two verbs are the signed-in client's and in the baseline; no client reaches a section or a twin; hygiene is quiet.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000f11071';
  v jsonb; v_r public.hr_temper_rules%rowtype; v_kit text; v_kits bigint; v_il int; v_item text; v_fee bigint; v_gold bigint; v_p bigint;
  v_n bigint; v_slot text; v_band int; v_stand text; v_lock int; v_k uuid;
begin
  -- (a) retired, before any probe
  if exists (select 1 from public.hr_unlock_offers where source = 'gen-temper' or offer_id like 'temper.%')
     or exists (select 1 from public.hr_unlocks where namespace = 'temper' or unlock_id like 'temper:%')
     or exists (select 1 from public.player_progress where kind = 'unlock' and key like 'temper:%') then
    raise exception 'VERIFY(a): an old Tempering offer, ladder or hero rung is still in the database'; end if;
  if exists (select 1 from public.hr_state_sections where key = 'temper') or to_regprocedure('public.hr_temper_view(uuid,integer)') is not null then
    raise exception 'VERIFY(a): the envelope''s old `temper` section is still registered or its function still exists'; end if;
  if position('''temper''' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'))) > 0
     or position('v_cat.namespace in (''room'', ''property''));' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'))) = 0 then
    raise exception 'VERIFY(a): hr_unlock_buy still names the temper namespace, or lost the house''s Storage read'; end if;
  if position('v_temper' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)'))) > 0
     or position('hr_temper_steps_of' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)'))) = 0 then
    raise exception 'VERIFY(a): hr_perks_of still reads the rungs, or lost temperSteps'; end if;
  select * into v_r from public.hr_temper_rules where id = 1;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tp-im-server §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v := public.hr_perks_of(v_u, 0);
    if coalesce(v->>'ok', '') <> 'true'
       or (select array_agg(k order by k collate "C") from jsonb_object_keys(v) k) is distinct from
            array['castle', 'clanPerks', 'companion', 'ok', 'propertyTier', 'renownAllXp', 'rooms', 'sources', 'temperSteps', 'unlockedRecipes']
       or (select array_agg(k order by k collate "C") from jsonb_object_keys(v->'sources') k) is distinct from
            array['castle', 'clan', 'companions', 'property', 'recipes', 'renown', 'rooms', 'temperSteps'] then
      raise exception 'VERIFY(a): the perk read''s keys are %', v; end if;
    v := public.hr_unlock_buy(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0),
                              '000000c0-0000-4000-a000-0000000f7100', 'temper.blows.2.1');
    if v->>'error' is distinct from 'unknown_offer' then raise exception 'VERIFY(a): a retired rung answered %', v; end if;
    if public.hr_state_of(v_u, 0) ? 'temper' then raise exception 'VERIFY(a): the envelope still carries `temper`'; end if;

    -- (b) dark
    update public.hr_flags set enabled = false where key in ('temper_steps', 'imbuements');
    if public.hr_temper_rank(0, 'weapon', 1, '000000c0-0000-4000-a000-0000000f7101')->>'error' is distinct from 'not_open'
       or public.hr_imbue_apply(0, 'weapon', 'brute_edge', 1, '000000c0-0000-4000-a000-0000000f7102')->>'error' is distinct from 'not_open'
       or public.hr_temper_steps_view(v_u, 0) is not null or public.hr_imbues_view(v_u, 0) is not null then
      raise exception 'VERIFY(b): a dark verb or section answered something'; end if;

    -- (c) Temper, lit, on a band-2 weapon (Steel's band: rank 1 opens at Level 40, where Steel is worn)
    update public.hr_flags set enabled = true where key in ('temper_steps', 'imbuements');
    select l.item_id, l.item_level into v_item, v_il from public.hr_item_levels l join public.hr_item_slots s on s.item_id = l.item_id and s.equip_slot = 'weapon'
     where l.item_level / v_r.tier_steps = 2 order by l.item_level, l.item_id limit 1;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'weapon', v_item)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    v_kit := (select item_id from public.hr_temper_kits where band = 2);
    if v_kit is null or public.hr_temper_kit_at(v_il) is distinct from v_kit or not exists (select 1 from public.hr_items where item_id = v_kit) then
      raise exception 'VERIFY(c)-harness: band 2 has no kit that is an item (%)', v_kit; end if;
    v_fee := (public.hr_temper_rank_quote('weapon', 1, v_il)->>'fee')::bigint;
    v_kits := (public.hr_temper_rank_quote('weapon', 1, v_il)->>'kits')::bigint;
    if v_kits < 2 then raise exception 'VERIFY(c)-harness: a weapon rank 1 takes % kits; the bag-then-Storage split needs two', v_kits; end if;
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id like '%temper_salts';
    delete from public.account_bank where user_id = v_u and item_id like '%temper_salts';
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_kit, 1);
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_kit, 10);
    insert into public.account_wallet as w (user_id, gold) values (v_u, 100000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    update public.player_state set level_xp = public.hr_char_xp_for_level(39) where user_id = v_u and slot = 0;
    if public.hr_level_of(v_u, 0) <> 39 then raise exception 'VERIFY(c)-harness: the probe hero is Level %, not 39', public.hr_level_of(v_u, 0); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_temper_rank(0, 'weapon', v_fee, '000000c0-0000-4000-a000-0000000f7110');
    if v->>'error' is distinct from 'rank_locked' or (v->>'next_at')::int <> v_r.rank_every then raise exception 'VERIFY(c): a Level 39 hero answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = v_u and slot = 0;
    if (public.hr_temper_steps_view(v_u, 0)->'weapon'->'quote'->>'kit') is distinct from v_kit
       or (public.hr_temper_steps_view(v_u, 0)->'weapon'->'quote'->>'kits_owed')::boolean is distinct from false
       or (public.hr_temper_steps_view(v_u, 0)->'weapon'->'quote'->>'fee')::bigint is distinct from v_fee then
      raise exception 'VERIFY(c): the section quotes %', public.hr_temper_steps_view(v_u, 0)->'weapon'; end if;
    v := public.hr_temper_rank(0, 'weapon', v_fee + 1, '000000c0-0000-4000-a000-0000000f7111');
    if v->>'error' is distinct from 'quote_changed' or (select gold from public.account_wallet where user_id = v_u) <> 100000000
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit) <> 1
       or (select qty from public.account_bank where user_id = v_u and item_id = v_kit) <> 10 then
      raise exception 'VERIFY(c): a wrong Temper price answered % or moved something', v; end if;
    v := public.hr_temper_rank(0, 'weapon', v_fee, '000000c0-0000-4000-a000-0000000f7112');
    if coalesce(v->>'ok', '') <> 'true' or v->>'kit' is distinct from v_kit or (v->>'kits')::bigint <> v_kits
       or (select gold from public.account_wallet where user_id = v_u) <> 100000000 - v_fee
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_kit) <> 10 - (v_kits - 1)
       or (select rank from public.hero_temper where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 1
       or (select seated_tier from public.hero_temper where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> 2
       or (public.hr_perks_of(v_u, 0)->'temperSteps'->>'weapon')::int is distinct from 1 then
      raise exception 'VERIFY(c): rank 1 answered % (gold %, perks %)', v - 'envelope', (select gold from public.account_wallet where user_id = v_u),
        public.hr_perks_of(v_u, 0)->'temperSteps'; end if;
    if (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent = 'temper:weapon:' || v_fee) <> 1
       or (select meta->>'kit' from public.player_ledger where user_id = v_u and intent = 'temper:weapon:' || v_fee) is distinct from v_kit
       or (select (meta->'took'->'bag'->>v_kit)::bigint from public.player_ledger where user_id = v_u and intent = 'temper:weapon:' || v_fee) is distinct from 1::bigint
       or (select (meta->'took'->'storage'->>v_kit)::bigint from public.player_ledger where user_id = v_u and intent = 'temper:weapon:' || v_fee) is distinct from v_kits - 1 then
      raise exception 'VERIFY(c): rank 1''s journal is %', (select jsonb_agg(meta) from public.player_ledger where user_id = v_u and intent like 'temper:%'); end if;
    if (v->'envelope'->'temper_steps'->'weapon'->>'rank')::int is distinct from 1 then
      raise exception 'VERIFY(c): rank 1''s envelope reads %, not the rank it wrote (rule 11)', v->'envelope'->'temper_steps'->'weapon'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_temper_rank(0, 'weapon', v_fee, '000000c0-0000-4000-a000-0000000f7112');
    if (select count(*) from public.player_ledger where user_id = v_u and intent like 'temper:%') <> 1
       or (select gold from public.account_wallet where user_id = v_u) <> 100000000 - v_fee
       or (select qty from public.account_bank where user_id = v_u and item_id = v_kit) <> 10 - (v_kits - 1) then
      raise exception 'VERIFY(c): the key pressed again moved something: %', v; end if;
    -- a held rank 5 is the top: rank_max, before the Level's lock
    update public.hero_temper set rank = 5 where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    v := public.hr_temper_rank(0, 'weapon', v_fee, '000000c0-0000-4000-a000-0000000f7113');
    if v->>'error' is distinct from 'rank_max' then raise exception 'VERIFY(c): a sixth rank answered %', v; end if;
    -- another band's kit never pays: an Iron (band 1) body piece, only the Fine salts held
    select l.item_id, l.item_level into v_item, v_il from public.hr_item_levels l join public.hr_item_slots s on s.item_id = l.item_id and s.equip_slot = 'body'
     where l.item_level / v_r.tier_steps = 1 order by l.item_level, l.item_id limit 1;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'body', v_item)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    if public.hr_temper_kit_at(v_il) is not distinct from v_kit or public.hr_temper_kit_at(v_il) is null then
      raise exception 'VERIFY(c)-harness: the band-1 piece % takes kit %', v_item, public.hr_temper_kit_at(v_il); end if;
    v_fee := (public.hr_temper_rank_quote('body', 1, v_il)->>'fee')::bigint;
    v_gold := (select gold from public.account_wallet where user_id = v_u);
    v_n := (select count(*) from public.player_ledger where user_id = v_u);
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_temper_rank(0, 'body', v_fee, '000000c0-0000-4000-a000-0000000f7114');
    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from public.hr_temper_kit_at(v_il)
       or (select gold from public.account_wallet where user_id = v_u) <> v_gold
       or (select qty from public.account_bank where user_id = v_u and item_id = v_kit) <> 10 - (v_kits - 1)
       or (select count(*) from public.player_ledger where user_id = v_u) <> v_n
       or exists (select 1 from public.hero_temper where user_id = v_u and slot = 0 and equip_slot = 'body') then
      raise exception 'VERIFY(c): an Iron rank with only Fine salts held answered % or moved something', v; end if;
    -- Bronze (band 0, no row) and Dawnsteel (band 6, its kit no item yet) are kits_owed, whatever is held
    foreach v_band in array array[0, 6] loop
      select s.equip_slot, l.item_id, l.item_level into v_slot, v_item, v_il
        from public.hr_item_levels l join public.hr_item_slots s on s.item_id = l.item_id join public.hr_temper_slots ts on ts.equip_slot = s.equip_slot
       where l.item_level / v_r.tier_steps = v_band and s.equip_slot not in ('weapon', 'body') order by s.equip_slot, l.item_level, l.item_id limit 1;
      if v_slot is null then raise exception 'VERIFY(c)-harness: no band-% piece to wear', v_band; end if;
      if v_band = 6 and exists (select 1 from public.hr_items i join public.hr_temper_kits k on k.item_id = i.item_id where k.band = 6) then
        continue;  -- Dawnsteel's salts became an item (the job slice): its band is sold, and band 0 still proves kits_owed
      end if;
      insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, v_slot, v_item)
        on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      delete from public.hr_rate_counters where user_id = v_u;
      v := public.hr_temper_rank(0, v_slot, (public.hr_temper_rank_quote(v_slot, 1, v_il)->>'fee')::bigint, gen_random_uuid());
      if v->>'error' is distinct from 'kits_owed' or (v->>'band')::int <> v_band then
        raise exception 'VERIFY(c): a band-% rank answered %', v_band, v; end if;
      if (public.hr_temper_steps_view(v_u, 0)->v_slot->'quote'->>'kits_owed')::boolean is distinct from true then
        raise exception 'VERIFY(c): the section does not say band % is kits_owed: %', v_band, public.hr_temper_steps_view(v_u, 0)->v_slot; end if;
    end loop;
    if (select gold from public.account_wallet where user_id = v_u) <> v_gold or (select count(*) from public.player_ledger where user_id = v_u) <> v_n then
      raise exception 'VERIFY(c): a kits_owed rank moved something'; end if;

    -- (d) imbuements, lit
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_imbue_apply(0, 'weapon', 'brute_edge', 1, '000000c0-0000-4000-a000-0000000f7120');
    if not exists (select 1 from public.hr_items i join public.hr_imbue_rules r on r.item_id = i.item_id where r.imbue_id = 'brute_edge')
       and v->>'error' is distinct from 'imbue_owed' then
      raise exception 'VERIFY(d): with no imbuement item the apply answered %', v; end if;
    -- the bench's item stands in as a real one (rolled back): a Remains good, held in Storage only
    v_stand := (select item_id from public.hr_flame_fuel order by item_id limit 1);
    update public.hr_imbue_rules set item_id = v_stand where imbue_id = 'brute_edge';
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_stand;
    insert into public.account_bank as b (user_id, item_id, qty) values (v_u, v_stand, 3)
      on conflict (user_id, item_id) do update set qty = excluded.qty;
    v_band := (select band from public.hr_imbue_rules where imbue_id = 'brute_edge');
    v_lock := (select min(l) from generate_series(1, 1000) l where public.hr_imbue_wearable(v_band, l));
    if v_lock is null or v_lock < 2 then raise exception 'VERIFY(d)-harness: band % is wearable from Level %', v_band, v_lock; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_lock - 1) where user_id = v_u and slot = 0;
    v_il := public.hr_worn_level(v_u, 0, 'weapon');
    v_fee := public.hr_imbue_fee(v_il, v_lock - 1);
    v_gold := (select gold from public.account_wallet where user_id = v_u);
    v_n := (select count(*) from public.player_ledger where user_id = v_u);
    if (public.hr_imbues_view(v_u, 0)->'wearable'->>'brute_edge')::boolean is distinct from false then
      raise exception 'VERIFY(d): the section calls band % wearable at Level %', v_band, v_lock - 1; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_imbue_apply(0, 'weapon', 'brute_edge', v_fee, '000000c0-0000-4000-a000-0000000f7121');
    if v->>'error' is distinct from 'band_locked' or (v->>'band')::int <> v_band
       or (select gold from public.account_wallet where user_id = v_u) <> v_gold or (select count(*) from public.player_ledger where user_id = v_u) <> v_n
       or (select qty from public.account_bank where user_id = v_u and item_id = v_stand) <> 3
       or exists (select 1 from public.hero_worn_imbue where user_id = v_u and slot = 0) then
      raise exception 'VERIFY(d): a band % imbuement on a Level % hero answered % or moved something', v_band, v_lock - 1, v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(v_lock) where user_id = v_u and slot = 0;
    v_fee := public.hr_imbue_fee(v_il, v_lock);
    if (public.hr_imbues_view(v_u, 0)->'wearable'->>'brute_edge')::boolean is distinct from true then
      raise exception 'VERIFY(d): the section calls band % locked at Level %', v_band, v_lock; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_imbue_apply(0, 'weapon', 'brute_edge', v_fee, '000000c0-0000-4000-a000-0000000f7122');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> v_gold - v_fee
       or (select qty from public.account_bank where user_id = v_u and item_id = v_stand) <> 2
       or (select ms_left from public.hero_worn_imbue where user_id = v_u and slot = 0 and equip_slot = 'weapon') <> public.hr_imbue_life_ms('plain')
       or (select (meta->'took'->'storage'->>v_stand)::int from public.player_ledger where user_id = v_u and intent = 'imbue_apply:brute_edge:' || v_fee) is distinct from 1 then
      raise exception 'VERIFY(d): the apply from Storage answered %', v - 'envelope'; end if;
    if v->'envelope'->'imbues'->'worn'->'weapon'->>'imbue' is distinct from 'brute_edge' then
      raise exception 'VERIFY(d): the apply''s envelope reads %, not the imbuement it wrote (rule 11)', v->'envelope'->'imbues'->'worn'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_imbue_apply(0, 'weapon', 'brute_edge', v_fee, '000000c0-0000-4000-a000-0000000f7122');
    if (select count(*) from public.player_ledger where user_id = v_u and intent like 'imbue\_apply:%') <> 1
       or (select qty from public.account_bank where user_id = v_u and item_id = v_stand) <> 2 then
      raise exception 'VERIFY(d): the key pressed again moved something: %', v; end if;

    raise exception using errcode = 'HRF71', message = 'tp-im-server §5 complete - rolling back';
  exception when sqlstate 'HRF71' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u)
     or exists (select 1 from public.hr_imbue_rules where item_id <> 'imbue_' || imbue_id) then
    raise exception 'VERIFY(e): §5 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key in ('temper_steps', 'imbuements') and enabled) then
    raise exception 'VERIFY(e): a switch is lit after the apply'; end if;
  -- (e) the grants
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_function_privilege(g.r, 'public.hr_temper_steps_view(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_imbues_view(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_perks_of(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_temper_kit_at(integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_imbue_wearable(integer,integer)', 'execute')) then
    raise exception 'VERIFY(e): a client role reaches a section, the perk read or a twin'; end if;
  if has_function_privilege('anon', 'public.hr_temper_rank(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_imbue_apply(integer,text,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_temper_rank(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_imbue_apply(integer,text,text,bigint,uuid)', 'execute')
     or (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_temper_rank', 'hr_imbue_apply')) <> 2 then
    raise exception 'VERIFY(e): the two verbs are not exactly the signed-in client''s'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'tp-im-server: the old rungs are gone; a rank takes its band''s kit from the bag then Storage, or is kits_owed; an imbuement past its band lock is refused; all green';
end $$;
