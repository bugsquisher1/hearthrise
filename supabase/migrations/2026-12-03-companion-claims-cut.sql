-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SECOND OLD-CLIENT CUT: COMPANION PETS, THE DAILY COUNTERS,
-- THE RAID / WORLD-EVENT / CLAN-BOARD CLAIMS (lane c-cuts-1022b,
-- backend-architect, 2026-10-22). STAGED. Game CLOSED: applies on its passing
-- §5 (CLAUDE.md §2), one file via tools/apply-migration.mjs, never inside
-- begin/commit, never 00:00–00:10 UTC. It SHRINKS the surface Security reviews
-- at the reopen gate (three gold/gem faucets and two pet doors leave).
--
-- THE RULING (Tyler, 2026-10-22: "we were supposed to delete all that"): every
-- old-client system the rebuilt client cannot use comes out. Grep of src/** and
-- supabase/functions/** at this file: nothing names any function dropped here.
--
-- §1 DROPPED
--    COMPANIONS    hr_companion_equip, hr_companion_grant (both authenticated)
--                  and their allowlist table hr_companion_grants (17 rows).
--    CLAIMS        raid_claim, world_event_claim, clan_board_claim (authenticated,
--                  gated) + their __ungated twins, and raid_claims (written and
--                  read only by raid_claim__ungated). They paid gold, gems, XP
--                  and items from screens the rebuilt client does not have.
--                  Their siblings (raid_strike, world_event_join/contribute/
--                  pledge, clan_board_roll/progress, ...) are NOT in this file.
-- §2 THE CLIENT SURFACE: the five baseline rows leave hr_client_rpc_baseline.
-- §3 THE PET CATALOGUE: the 4 shop offers (hr_unlock_offers table 'companion')
--    and the 21 companion:* rows of hr_unlocks. (The farm-yield companion rows
--    left with 2026-12-03-farm-catalogues.generated.sql, regenerated from the
--    data, which runs first.) player_state.companion_equipped is nulled and
--    CHECKED null: hr_apply (not restated here; 150 kB) still carries the
--    companion_xp branch, and with no pet ever equipped that branch can only
--    refuse (companion_not_equipped), never credit. The column and that branch
--    leave with the next whole hr_apply restatement. Old companion:* /
--    companion_xp:* progress rows stay as inert history (no reader is left).
-- §4 RESTATED WHOLE from the replayed pre-image (md5 pinned in §0):
--    hr_perks_of     no `companion` channel (the engine's companion layer, src/
--                    core/companion-perk.js, left in the same lane);
--    hr_farm_harvest no companion farm-yield term, no kind='daily' row;
--    hr_farm_plant   no kind='daily' row;
--    hr_state_of     no `companions` projection.
--    THE DAILY COUNTERS: the engine stopped writing kind='daily' ev:* rows in
--    the same lane (src/core/goals.js, hr-accrue goal-period.js deleted); the
--    two farm writers above were the server's. The existing ev:* daily rows are
--    deleted (pure counters: no value, no reader since 2026-12-02). The ONE
--    kind='daily' row family left is the premium login claim's clamp ('login'),
--    which hr_login_claim / hr_login_view own; hr_progress_prune still sweeps it.
--
-- KEPT, on purpose: hr_login_claim / hr_login_view (Tyler decides); hr_apply's
-- 'daily' kind in its progress allowlist (engine-only; nothing sends one now).
--
-- REVERSIBILITY: re-apply the files that created each body (tests/live-hash-
-- drift.baseline.json `touched_by`); the dropped tables are catalogue/claim
-- journals (raid_claims, hr_companion_grants) restorable from their files.
-- ORDER: after 2026-12-03-farm-catalogues.generated.sql. EDGE: hr-accrue must be
-- redeployed with this lane (the engine stops the daily ops and the companion
-- layer; an old engine against this database still works: its companion read is
-- null and its daily ops are accepted and inert).
-- COST: nothing per call is added; every settle carries up to ~6 fewer progress
-- ops (the daily twins), so player_progress loses its fastest-growing row family.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ──────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_claim_quest(text,integer)') is not null then
    raise exception 'PRECONDITION: apply 2026-12-02-old-rewards-cut.sql first'; end if;
  if exists (select 1 from public.hr_farm_yield_perk where perk_key like 'companion:%') then
    raise exception 'PRECONDITION: apply 2026-12-03-farm-catalogues.generated.sql first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)');
  if v_md5 is distinct from '331090675db21d345c8bde8d880c1655' and v_md5 is distinct from '797f44203c58361e06726954c4f51525' then
    raise exception 'PIN: hr_perks_of is neither the 2026-08-20 image nor this file''s - md5 %: restate from the new image', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)');
  if v_md5 is distinct from '59d2d5cb5d7ed6a2e96abc555d942a7c' and v_md5 is distinct from '7bd496ab804633d56995e545d72bca00' then
    raise exception 'PIN: hr_farm_harvest is neither the pre-image nor this file''s - md5 %: restate from the new image', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_plant(integer,integer,text,uuid)');
  if v_md5 is distinct from '066ef52420b729471b12d070bdec1e2f' and v_md5 is distinct from '7ea43dd6feda66c5c3dca9c6d2b12ba6' then
    raise exception 'PIN: hr_farm_plant is neither the pre-image nor this file''s - md5 %: restate from the new image', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_state_of(uuid,integer)');
  if v_md5 is distinct from '9c717e178a19b222c8295fae65d96683' and v_md5 is distinct from 'a1abfcafbc109dc296779677bd051f14' then
    raise exception 'PIN: hr_state_of is neither the 2026-11-27 image nor this file''s - md5 %: restate from the new image', v_md5; end if;
end $mig$;

-- ── §1 THE DROPS ───────────────────────────────────────────────────────────
drop function if exists public.hr_companion_equip(integer, text, boolean);
drop function if exists public.hr_companion_grant(integer, text, text, uuid);
drop table    if exists public.hr_companion_grants;

drop function if exists public.raid_claim(text, uuid, text, integer);
drop function if exists public.raid_claim__ungated(text, uuid, text, integer);
drop table    if exists public.raid_claims;
drop function if exists public.world_event_claim(text, integer);
drop function if exists public.world_event_claim__ungated(text, integer);
drop function if exists public.clan_board_claim(uuid, text);
drop function if exists public.clan_board_claim__ungated(uuid, text);

-- ── §2 THE CLIENT SURFACE ──────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline
 where proname in ('hr_companion_equip', 'hr_companion_grant', 'raid_claim', 'world_event_claim', 'clan_board_claim');

-- ── §3 THE PET CATALOGUE AND THE EQUIPPED COLUMN ───────────────────────────
delete from public.hr_unlock_offers where table_name = 'companion';
delete from public.hr_unlocks where namespace = 'companion';
update public.player_state set companion_equipped = null where companion_equipped is not null;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_companion_cut_ck'
                   and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_companion_cut_ck check (companion_equipped is null);
  end if;
end $mig$;
comment on column public.player_state.companion_equipped is
  'CUT 2026-10-22 (2026-12-03-companion-claims-cut.sql): always null (player_state_companion_cut_ck). '
  'Leaves with the next whole hr_apply restatement, whose dormant companion_xp branch is its last reader.';

-- The kind='daily' ev:* counters: no reader since 2026-12-02, no writer after this lane.
delete from public.player_progress where kind = 'daily' and key like 'ev:%';

-- ── §4 THE RESTATED READERS ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_perks_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rooms jsonb;
  v_plots jsonb;
  v_tier  int;
  v_recipes jsonb;
  v_renown bigint;
  v_renown_allxp float8;
  -- (2026-12-03-companion-claims-cut.sql: the equipped-companion channel left
  --  with the old pet system, Tyler 2026-10-22; the stack carries no `companion`.)
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
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'plot:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_plots, v_tier
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

  -- THE RENOWN CHANNEL — server-derived, never from the client.
  v_renown := public.hr_renown_of(p_user, p_slot);
  v_renown_allxp :=
      case when v_renown >= 900    then 0.01::float8 else 0::float8 end   -- squire
    + case when v_renown >= 4500   then 0.01::float8 else 0::float8 end   -- baron
    + case when v_renown >= 32000  then 0.01::float8 else 0::float8 end   -- duke
    + case when v_renown >= 120000 then 0.01::float8 else 0::float8 end;  -- highking

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    'plots', coalesce(v_plots, '{}'::jsonb),
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
    'renownAllXp', v_renown_allxp,
    'clanPerks', '{}'::jsonb,
    'castle', null,
    -- ⚠ THE HONESTY FIELD. Which channels this answer actually covers. The
    --   Edge Function forwards it into the away card (`away.perkChannel`), so
    --   "the night was priced at zero perks because nothing is unlocked" can
    --   be told apart from "because the channel is not wired" — from the
    --   outside, without reading the source. Every historical away bug in this
    --   codebase was a reward that silently vanished.
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'plots',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'recipes',    'player_progress:flag:recipe:*',
      'renown',     'derived:hr_renown_of',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side')
  );
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_harvest(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_plot   public.player_farm%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_grown_h numeric;
  v_seed   bigint;
  v_span   int;
  v_base   bigint;
  v_bonus  bigint;
  v_qty    bigint;
  v_xp     bigint;
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_new_count int;
  v_garden_lv int;
  v_scarecrow int;
  v_cached jsonb;
  v_budget jsonb;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('farm_harvest', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_harvest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_harvest', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;

  select * into v_plot from public.player_farm
    where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600)));
  end if;

  -- SEEDED base yield roll, tied to this plant cycle (plant instant): a regrow /
  -- re-plant is a fresh roll, a harvest replay is identical. NOT Math.random.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, p_slot,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_base := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;

  -- FLAT farmYield PERK from the SERVER-owned stack: Garden rung + Scarecrow
  -- count (player_progress via hr_unlock_levels), priced from hr_farm_yield_perk
  -- (the companion term left with the old pets, 2026-12-03-companion-claims-cut.sql). All whole crops → integer,
  -- no fraction to roll. Under-pay only (food buffs / doubleYield PROC deferred).
  select coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int,
         coalesce(max(level) filter (where unlock_id = 'plot:scarecrow'), 0)::int
    into v_garden_lv, v_scarecrow from public.hr_unlock_levels(v_uid, p_slot);
  v_bonus :=
      coalesce((select farm_yield from public.hr_farm_yield_perk
                 where perk_key = 'garden:' || greatest(0, v_garden_lv)::text), 0)
    + greatest(0, v_scarecrow)
        * coalesce((select farm_yield from public.hr_farm_yield_perk where perk_key = 'scarecrow'), 0);

  v_qty := v_base + greatest(0, v_bonus);
  v_xp  := v_crop.xp::bigint * v_qty;

  -- Daily economy ceiling (NULL = within budget). Perk is inside the clamp.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_xp, v_qty, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- FINITE-PERENNIAL WITHER. regrow_limit = regrows one seed buys;
  -- regrow_limit+1 total harvests. 0 = non-regrow / legacy infinite
  -- (unreachable on a regrowing crop — the catalogue self-check forbids it).
  if v_crop.regrows then
    v_new_count := v_plot.regrow_count + 1;
    if v_crop.regrow_limit > 0 and v_new_count > v_crop.regrow_limit then
      delete from public.player_farm
        where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
      v_withered := true;
    else
      update public.player_farm
        set planted_at = now(), watered_at = null, waterings = '{}', regrow_count = v_new_count
        where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
      v_regrew := true;
    end if;
  else
    delete from public.player_farm
      where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  end if;

  -- THE LIFETIME HARVEST COUNT (the Bestiary/collection shape). The daily-kind
  -- twin left with the daily goals (2026-12-03-companion-claims-cut.sql).
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:harvest', v_qty, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, 'farming', v_xp,
            v_qty, v_xp, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx,
                                            'base', v_base, 'perk', v_bonus,
                                            'regrew', v_regrew, 'withered', v_withered,
                                            'regrow_count', v_plot.regrow_count));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'base', v_base, 'perk', v_bonus, 'xp', v_xp,
    'regrew', v_regrew, 'withered', v_withered,
    'regrows_left', case when v_crop.regrows and v_crop.regrow_limit > 0
                         then greatest(0, v_crop.regrow_limit - (v_plot.regrow_count + 1))
                         else null end);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_plant(p_slot integer, p_plot_idx integer, p_crop text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_max_plots constant int := 64;   -- absolute array fuse; property cap is finer
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
begin
  if v_uid is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
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

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;

  -- PLOT CAP (GARDEN-BEDS, 2026-11-23): the property ladder (tier+1)*2 plus the
  -- account Garden's farm beds, one reader (hr_farm_plot_cap). A fresh
  -- character has no property and no Garden -> cap 2.
  v_plot_cap := public.hr_farm_plot_cap(v_uid, p_slot);
  if p_plot_idx >= v_plot_cap then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap));
  end if;

  -- Farming LEVEL gate, re-derived from server XP.
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv));
  end if;

  -- CROP PLOT-TIER gate. crop.plot_tier must be <= the character's plot_level.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'crop_untiered'));
  end if;
  if v_crop_tier > v_state.plot_level then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_state.plot_level));
  end if;

  if exists (select 1 from public.player_farm
              where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx and crop_id is not null) then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_occupied'));
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  -- Debit exactly one seed; delete-if-last (player_inventory enforces qty > 0).
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  if coalesce(v_have, 0) < 1 then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item));
  end if;
  update public.player_inventory set qty = qty - 1
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item and qty > 1;
  if not found then
    delete from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  end if;

  -- Fresh plant: DRY (waterings empty), NOT a regrow (regrow_count 0).
  insert into public.player_farm as f
      (user_id, slot, plot_idx, crop_id, planted_at, watered_at, waterings, regrow_count)
    values (v_uid, p_slot, p_plot_idx, p_crop, now(), null, '{}', 0)
    on conflict (user_id, slot, plot_idx)
      do update set crop_id = excluded.crop_id, planted_at = excluded.planted_at,
                    watered_at = null, waterings = '{}', regrow_count = 0;

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', c_plant_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- (The daily-kind plant row left with the daily goals, 2026-12-03-companion-claims-cut.sql.)
  -- 2026-09-07: the LIFETIME twin. Mirrors hr_farm_harvest's stat/ev:harvest
  -- row exactly: kind 'stat', period_key '', additive, state 'active'. The
  -- client projects the stat rows into G.stats.planted and DAILY_GOAL_POOL's
  -- "plant" goal grades stats.planted minus a day-start baseline, so without
  -- this row the goal can never move however much the player plants.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:planted', 1, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1, 'farming', c_plant_xp, c_plant_xp,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item, 'plant_xp', c_plant_xp);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_state_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- restated WHOLE by 2026-12-03-companion-claims-cut.sql: the `companions` projection left with
-- the old pet system (Tyler 2026-10-22); every other key is the 2026-11-27 image, unchanged.
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- restated again WHOLE by 2026-11-27-account-depot.sql: `bank` reads the ACCOUNT depot
-- (public.account_bank), identical on every slot. Nothing else moved.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
        v_w  public.account_wallet%rowtype;
        v_vit jsonb;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE ACCOUNT WALLET. One PK probe; a missing row reads 0 (never NULL), so an
  -- account the wallet has not met yet renders an honest zero, not "unknown".
  select * into v_w from public.account_wallet where user_id = p_user;
  -- THE CORE MODEL'S VITALS (2026-10-27): Level, max HP / mana and the regen rate, derived.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);

  -- ── THE SECTION REGISTRY (architecture contracts X7; 2026-10-23-character-premium.sql):
  --    every hr_state_sections row, folded UNDER the hand-written keys below.
  return public.hr_state_sections_of(p_user, v_st.slot) || jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    -- ── buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms ──
    --    introduced by 2026-09-13-consumable-buffs.sql
    --    `scale` was added by 2026-09-13-buff-cellar-scale.sql
    -- ── level / vitals — THE CORE MODEL (2026-10-27-core-bodies.sql; CORE_MODEL.md §2-3) ──
    --    Level from kills only (player_state.level_xp), endless; max HP and max mana from
    --    Level and armour weight, the regen rate from Prayer: all DERIVED, never stored.
    'level', public.hr_level_block(v_st.level_xp),
    'vitals', v_vit,
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    -- ── place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE ──
    --    introduced by 2026-09-13-town-presence.sql
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON
    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },
    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a
    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon
    -- with no active mode is omitted, a fresh character gets {}; an absent key on
    -- the client means READY, which is safe because the SERVER refuses — the worst
    -- case is one refused intent. The client reads map[dungeon_id][mode].
    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──
    --    introduced by 2026-09-12-dungeon-cooldown.sql
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at streak_day_key) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', coalesce(v_w.gems, 0),
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      -- ── state.marks — the Bounty-Marks currency ──
      --    introduced by 2026-08-26-marks-record.sql
      'marks', v_st.marks,
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──
      --    introduced by 2026-09-10-dungeon-scrip.sql
      'dungeon_scrip', v_st.dungeon_scrip,
      -- ── state — tokens, hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int), 'max_hp', (v_vit->>'max_hp')::int, 'level_xp', v_st.level_xp,
      'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      -- ── state.workers_accrued_to — the hired crew's own watermark ──
      --    introduced by 2026-08-25-workers.sql
      'workers_accrued_to', v_st.workers_accrued_to,
      -- ── state.combat_xp_accrued_to — the combat-XP cadence watermark ──
      --    introduced by 2026-08-31-combat-xp-credit.sql
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──
      --    introduced by 2026-08-22-rested-record.sql
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      -- ── state.tool_carry — the gathering carry the SERVER owns ──
      --    introduced by 2026-08-15-tool-carry.sql
      'tool_carry', v_st.tool_carry,
      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
      -- ── state.hearthfind_* — the switch, the day’s find, the titles, the plinth ──
      --    introduced by 2026-09-08-hearthfind.sql
      'hearthfind_ready', true,
      -- THE DAY'S LATEST FIND, so a RETRIED SETTLE DOES NOT LOSE THE REVEAL.
      -- hr_apply's replay path returns `hr_state_of(...) || {replayed:true}` --
      -- a FRESH envelope, deliberately, because storing the receipt would put a
      -- full snapshot in player_intents (revision 2 did, at ~690 MB per player
      -- per day). The consequence is that the `hearthfind` field of the
      -- ORIGINAL receipt exists only on the first response: a settle whose
      -- reply is lost to a dropped connection is retried, comes back ok, and
      -- the player is never told about the rarest thing that has ever happened
      -- to them. The trophy and the ledger row were never at risk; only the
      -- MOMENT was, and the moment is the entire feature.
      --
      -- Projected from the append-only journal (the only durable record) rather
      -- than from world_finds, because the public row is suppressed by the
      -- 60-second broadcast clamp while the ledger row never is. Scoped to the
      -- UTC day so it is self-expiring: there is no state to clear, no flag to
      -- reset, and a client that has already revealed it simply sees the same
      -- object again (it carries `at`, so the client can tell). One index probe
      -- on player_ledger_hearthfind_idx; null on the ~100% of reads with no
      -- find today.
      'hearthfind_last', (
        select jsonb_build_object('item', l.item_id, 'at', l.at) || coalesce(l.meta, '{}'::jsonb)
          from public.player_ledger l
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hearthfind'
           and l.at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         order by l.at desc limit 1),
      -- THE COSMETICS THE CHARACTER OWNS. Projected from the server table, not
      -- carried in the residue: a title is earned state, and CLAUDE.md §6 is
      -- explicit that anything a player would miss after a reload lives in a
      -- server row and is projected. Two arrays and one boolean, all derived:
      --   hearthfind_titles  every title unlocked, newest last
      --   hearthfind_plinth  whether the homestead plinth is unlocked
      -- The EQUIPPED title is deliberately absent until an equip intent exists;
      -- a client that picked one would be authoring it, and there is no RPC yet
      -- that would let the server own that choice. Stated as a known limitation
      -- rather than shipped as a residue field.
      'hearthfind_titles', coalesce((
        select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'at', c.granted_at)
                         order by c.granted_at)
          from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'title'), '[]'::jsonb),
      'hearthfind_plinth', exists (
        select 1 from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'plinth'),
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      -- ── state.fight — the IN-FLIGHT fight the server owns ──
      --    introduced by 2026-08-17-fight-carry.sql
      'fight', v_st.fight,
      -- THE TWO DEATH COUNTERS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died. A survival counter must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the two death counters, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      -- ── state.streak_days — the daily settle streak ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_days', v_st.streak_days,
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()'s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier's price. The client NEVER computes this.
      -- ── state.plot_level — the SERVER-owned farm plot tier ──
      --    introduced by 2026-09-06-state-of-farm-projection.sql
      'plot_level', v_st.plot_level,
      -- ── state.streak_day_key — the streak’s UTC day key ──
      --    introduced by 2026-08-21-streak-state.sql
      -- ── state.streak_day_key — CLOSES `state` (the combat style left with the core rebuild) ──
      'streak_day_key', v_st.streak_day_key),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_skill_level(skill_id, xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ── bank — THE ACCOUNT DEPOT (Tyler 2026-10-15 / 2026-10-22: the depot is shared
    --    by every character of the account). public.account_bank, written only by
    --    hr_bank_move, projected as a flat {item_id:qty} map beside `inventory`:
    --    the SAME map on every slot of the account. Absent row = real zero
    --    (qty>0 invariant + delete-on-zero in hr_bank_move).
    --    introduced by 2026-08-27-bank-store.sql; account-scoped by 2026-11-27-account-depot.sql
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.account_bank where user_id = p_user), '{}'::jsonb),
    -- ── equipment — the worn set ──
    --    introduced by 2026-08-11-apply-engine.sql
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    -- ── enchant — ELEMENTS v1, the server-owned weapon enchant ──
    --    introduced by 2026-08-18-enchant.sql
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──
    --    introduced by 2026-08-25-workers.sql
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── farm — the plots, with the FULL waterings array (Q-5) ──
    --    introduced by 2026-08-11-apply-engine.sql
    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── progress / progress_truncated — capped at 1000 rows, and it SAYS when it capped ──
    --    introduced by 2026-08-11-apply-engine.sql
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md
                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside
                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies
                 -- + the collection log breach this 1000-row cap, and the failure is
                 -- SILENT: kind='collection' sorts ahead of daily/flag/quest/stat,
                 -- so what falls off the end is a player's quest state.
                 and key not like 'trophy:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
           -- 2026-09-22: the TROPHY population. The SAME predicate as the one
           -- inside `progress` above, and it must stay the same: a flag that
           -- counted rows the array excludes would report truncation that did
           -- not happen, which is the read filter / prune divergence RL3 names.
           and key not like 'trophy:%'
         limit 1001) t),
    -- ── client_state — the denylisted client-preference bag ──
    --    introduced by 2026-08-28-client-state.sql
    'client_state', coalesce(v_st.client_state, '{}'::jsonb),
    -- ── total_level — derived server-side ──
    --    introduced by 2026-08-11-apply-engine.sql
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    -- ── unlocked_recipes — the gated recipes THIS character has learned ──
    --    introduced by 2026-09-14-recipe-learn.sql
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),
    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,
    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock
    -- (there is no client write policy and no client write grant on
    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops
    -- living in the residue a cloud restore can rewind — the half of the b371
    -- gem dupe that made a free theme STICK. Always contains the FREE rows
    -- (theme:default), so the starting theme stays equippable the moment the
    -- client reads this set server-first. Never truncated: an entitlement must
    -- not be able to read as "you own nothing".
    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──
    --    introduced by 2026-09-14-gem-unlock-buy.sql
    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),
    -- THE SERVER'S COUNTED RENOWN (2026-09-12). The high-water hr_claim_rank
    -- decides every rank against, cached on player_state by the ratchet §1 added
    -- to hr_apply. Read straight off the row this function already selected, so
    -- the projection is free; the recompute lives on the apply path where it is
    -- floored at one call per intent instead of one per envelope.
    -- DISPLAY + the rank-up card only — the client authors none of it, there is
    -- no client write policy or grant on player_state, and hr_renown_of stays
    -- revoked from every browser role. This is the caller's OWN character (the
    -- whole body is keyed on p_user/v_st.slot); no other player's score is
    -- reachable through it. 0 on a fresh character, never null.
    -- ── renown_high — the SERVER’s counted renown, display only ──
    --    introduced by 2026-09-12-renown-high-projection.sql
    'renown_high', coalesce(v_st.renown_high, 0),
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    -- ── bounty — the active contract and the SERVER’s own progress arithmetic ──
    --    introduced by 2026-09-09-bounty-progress-projection.sql
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),
    -- hero-slot-buy: the ACCOUNT's owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    -- ── hero_slots — ACCOUNT-scoped entitlement. NEVER truncated ──
    --    introduced by 2026-09-08-hero-slot-buy.sql
    'hero_slots', public.hr_hero_slots_of(p_user),
    -- trait-buy: the character's OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    -- ── traits — owned permanent traits, read UNFILTERED ──
    --    introduced by 2026-08-23-trait-buy.sql
    'traits', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    -- ── inventory_complete — the STAMPED completeness signal, fail-closed ──
    --    introduced by 2026-08-24-inventory-complete.sql
    --    the third (worker) arm was added by 2026-08-25-workers.sql
    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $function$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ────────
do $mig$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-00000c0c1023';
  v      jsonb;
  v_n    int;
  v_set  text;
  v_gone text;
begin
  -- (a) EVERY DROPPED OBJECT IS GONE, under any signature.
  foreach v_gone in array array['hr_companion_equip', 'hr_companion_grant', 'raid_claim', 'raid_claim__ungated',
                                'world_event_claim', 'world_event_claim__ungated', 'clan_board_claim', 'clan_board_claim__ungated'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = v_gone) then
      raise exception 'companion-claims-cut §5(a): % still exists', v_gone; end if;
  end loop;
  if to_regclass('public.hr_companion_grants') is not null or to_regclass('public.raid_claims') is not null then
    raise exception 'companion-claims-cut §5(a): a cut table remains'; end if;

  -- (b) THE CLIENT SURFACE NAMES NO MISSING FUNCTION, AND NONE OF THE CUT ONES.
  select count(*) into v_n from public.hr_client_rpc_baseline b
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = b.proname);
  if v_n <> 0 then raise exception 'companion-claims-cut §5(b): % baseline row(s) name a function that does not exist', v_n; end if;

  -- (c) NO PET IS CATALOGUED, NONE IS EQUIPPED, AND NONE CAN BE.
  if exists (select 1 from public.hr_unlocks where namespace = 'companion')
     or exists (select 1 from public.hr_unlock_offers where table_name = 'companion' or unlock_id like 'companion:%')
     or exists (select 1 from public.hr_farm_yield_perk where perk_key like 'companion:%')
     or exists (select 1 from public.player_state where companion_equipped is not null) then
    raise exception 'companion-claims-cut §5(c): a companion row is still catalogued or equipped'; end if;

  -- (d) THE READERS ARE GONE: only hr_apply's dormant branch names the column, and
  --     only the premium login (and hr_apply's allowlist) still names kind 'daily'.
  select string_agg(p.proname, ',' order by p.proname) into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ 'companion_equipped';
  if v_set is distinct from 'hr_apply' then
    raise exception 'companion-claims-cut §5(d): companion_equipped is read by % (want hr_apply only)', v_set; end if;
  select string_agg(p.proname, ',' order by p.proname) into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ $re$'daily'$re$;
  if v_set is distinct from 'hr_apply,hr_login_claim,hr_login_view' then
    raise exception 'companion-claims-cut §5(d): kind ''daily'' is named by % (want hr_apply,hr_login_claim,hr_login_view)', v_set; end if;
  if exists (select 1 from public.player_progress where kind = 'daily' and key like 'ev:%') then
    raise exception 'companion-claims-cut §5(d): an ev:* daily counter row remains'; end if;

  -- (e) THE KEPT DOORS ARE STILL THERE (a cut that took a live system is worse than none).
  if to_regprocedure('public.hr_login_claim(integer,uuid)') is null
     or to_regprocedure('public.hr_login_view(uuid,integer)') is null
     or to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)') is null
     or to_regprocedure('public.hr_farm_harvest_replant(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'companion-claims-cut §5(e): a kept door is missing'; end if;

  -- (f) EXECUTED on a probe character: the perk stack and the envelope carry no pet,
  --     and the column refuses one. Rolled back.
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, version) values (v_uid, 0, 0, 1)
      on conflict (user_id, slot) do nothing;
    v := public.hr_perks_of(v_uid, 0);
    if (v->>'ok')::boolean is not true then raise exception 'companion-claims-cut §5(f): hr_perks_of refused the probe: %', v; end if;
    if v ? 'companion' or (v->'sources') ? 'companions' then
      raise exception 'companion-claims-cut §5(f): hr_perks_of still carries a companion channel: %', v; end if;
    if not (v ? 'rooms' and v ? 'renownAllXp' and v ? 'unlockedRecipes') then
      raise exception 'companion-claims-cut §5(f) CONTROL: hr_perks_of lost a kept channel: %', v; end if;
    v := public.hr_state_of(v_uid, 0);
    if v is null or v ? 'companions' then
      raise exception 'companion-claims-cut §5(f): hr_state_of still projects companions (or returned null)'; end if;
    begin
      update public.player_state set companion_equipped = 'fox' where user_id = v_uid and slot = 0;
      raise exception 'companion-claims-cut §5(f): a companion could still be equipped';
    exception when check_violation then null;
    end;
    raise exception using errcode = 'HR893', message = 'companion-claims-cut §5 complete — rolling back';
  exception when sqlstate 'HR893' then null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'companion-claims-cut §5: LEAKED a probe row'; end if;

  -- (g) GRANT HYGIENE IS CLEAN.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'companion-claims-cut §5(g): grant hygiene is red: %', v; end if;

  raise notice 'companion-claims-cut: pets, the daily counters and the raid/world-event/clan-board claims cut; '
               'the premium login and every live door kept; zero leak';
end $mig$;
