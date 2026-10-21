-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A BAR SLOT NAMES ONE ITEM (lane b-supplies-bury, systems-engineer,
-- 2026-10-21). STAGED, NOT APPLIED. Game CLOSED: applies on its passing §2; part
-- of the reopen review.
--
-- Tyler 2026-10-21 (designer-confirmed): the GAME never decides which supply is
-- best. A slot names ONE item: a crafted food or drink comes from the hero's own
-- stock only (struck "none left" when empty), a store item is bought per use. The
-- player builds the fallback by slot ORDER. No "Any food" / "Any drink", no hunt-
-- tier store food. A new hero's bar is the start kit's. Live 10-21 (Andy): "Flame
-- Strike isn't usable. Not using runes from store."
--
-- ── WHAT (STORE-BY-SLOT) ─────────────────────────────────────────────────────
--   hr_hunt_action_ids      consume ids are every crafted food and drink AND every
--                           store food and drink (src/data/consumables.js); `food`
--                           and `drink` are gone (⟦action-ids⟧, pinned by
--                           tests/hunt-core/conditions.mjs).
--   hr_hunt_slot_check      `food` / `drink` refused `choose_item` (plain words on
--                           the client); a rune spell may name its rune's store row
--                           (action.store), anything else carrying one is
--                           `bad_store`; an unknown action key `bad_action`.
--   hr_hunt_settings_view   no default food or drink: a hero whose stored bar holds
--                           nothing gets the start kit's bar (⟦starter-bar⟧); every
--                           food / drink slot carries the SERVER's struck state
--                           (`usable`, `why` none_left | store_off, `count` from the
--                           open hunt's bag else the inventory); a rune slot naming
--                           its store rune is usable; the section gains `store`
--                           (every store row at the server's price).
--   hr_hunt_member_read     loses `shop` (the hunt tier's food and drink ids).
--   hr_hunt_settle_session  heals_out / gold_out no longer read the hunt tier.
-- RESTATED WHOLE from the replayed pre-images: hr_hunt_slot_check
-- (2026-10-25-action-conditions.sql), hr_hunt_settings_view
-- (2026-10-28-consume-defaults.sql), hr_hunt_member_read and hr_hunt_settle_session
-- (2026-10-27-core-bodies.sql), each byte-for-byte but its STORE-BY-SLOT lines.
-- §0 pins each pre-image by its own text (or this file's, by the marker).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Money: a store use is still re-priced from hr_hunt_basic_supplies by the settle
-- (hr_hunt_apply_member, unchanged); a slot only NAMES an item, never a price or
-- an amount. The gold_out end proof is wider (the dearest heal/drink row): an end
-- can only stop value. A stored "Any food" slot reads as an empty tablet (no
-- back-compat: the wipe is at EA). No table or grant change; hr_hunt_action_ids'
-- seeded rows move (restore-census re-pinned).
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2026-11-03-alpha-catalogue.generated.sql, BEFORE
-- 2026-11-07-hunt-sessions-catalogue.generated.sql (which drops the tier columns
-- this file stops reading; it refuses to apply until this one has). The hr-accrue
-- edge of this lane deploys BEFORE this file (it reads no `shop`, names the items).
-- REVERSIBILITY: re-apply the four bodies from their source files and the
-- 2026-10-25 action-ids rows (the tier columns must exist again first). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_slot_check(jsonb)'::regprocedure;
  if strpos(v_src, 'STORE-BY-SLOT') = 0 and strpos(v_src, 'THE STABLE RULE ID is the server''s') = 0 then
    raise exception 'PIN: hr_hunt_slot_check is neither the action-conditions image nor this file''s'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settings_view(uuid,integer)'::regprocedure;
  if strpos(v_src, 'STORE-BY-SLOT') = 0 and strpos(v_src, 'EAT-AT BEFORE DRINK-AT (2026-10-28)') = 0 then
    raise exception 'PIN: hr_hunt_settings_view is neither the consume-defaults image nor this file''s'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure;
  if strpos(v_src, 'STORE-BY-SLOT') = 0 and strpos(v_src, '''shop'', (select jsonb_build_object(') = 0 then
    raise exception 'PIN: hr_hunt_member_read is neither the core-bodies image nor this file''s'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if strpos(v_src, 'STORE-BY-SLOT') = 0 and strpos(v_src, 'v_tier = any (q.tiers)') = 0 then
    raise exception 'PIN: hr_hunt_settle_session is neither the core-bodies image nor this file''s'; end if;
end $mig$;

-- ── §1 THE ACTION IDS: one item a slot, crafted or from the store ────────────
delete from public.hr_hunt_action_ids;
insert into public.hr_hunt_action_ids (type, id) values
-- ⟦action-ids⟧
  ('attack_with_item', 'air_rune'),
  ('attack_with_item', 'barbed_arrows'),
  ('attack_with_item', 'blood_rune'),
  ('attack_with_item', 'bronze_arrows'),
  ('attack_with_item', 'chaos_rune'),
  ('attack_with_item', 'coarse_whetstone'),
  ('attack_with_item', 'copper_whetstone'),
  ('attack_with_item', 'dawn_whetstone'),
  ('attack_with_item', 'dawnpoint_arrows'),
  ('attack_with_item', 'death_rune'),
  ('attack_with_item', 'earth_rune'),
  ('attack_with_item', 'emberhead_arrows'),
  ('attack_with_item', 'fire_rune'),
  ('attack_with_item', 'iron_arrows'),
  ('attack_with_item', 'iron_bolts'),
  ('attack_with_item', 'iron_whetstone'),
  ('attack_with_item', 'loaded'),
  ('attack_with_item', 'mithril_arrows'),
  ('attack_with_item', 'mithril_whetstone'),
  ('attack_with_item', 'rune_arrows'),
  ('attack_with_item', 'rune_whetstone'),
  ('attack_with_item', 'steel_arrows'),
  ('attack_with_item', 'steel_whetstone'),
  ('attack_with_item', 'water_rune'),
  ('consume', 'baked_potato'),
  ('consume', 'carrot_juice'),
  ('consume', 'cooked_bear_meat'),
  ('consume', 'cooked_copper_crab'),
  ('consume', 'cooked_frostfin'),
  ('consume', 'cooked_goldgill'),
  ('consume', 'cooked_herring'),
  ('consume', 'cooked_lobster'),
  ('consume', 'cooked_moonfish'),
  ('consume', 'cooked_panther_meat'),
  ('consume', 'cooked_pikeperch'),
  ('consume', 'cooked_shark'),
  ('consume', 'cooked_shrimp'),
  ('consume', 'cooked_silverfin'),
  ('consume', 'cooked_swordfish'),
  ('consume', 'cooked_trout'),
  ('consume', 'cooked_wolf_meat'),
  ('consume', 'emberfruit_cordial'),
  ('consume', 'goldenroot_tea'),
  ('consume', 'pumpkin_cider'),
  ('consume', 'river_chowder'),
  ('consume', 'salted_lobster'),
  ('consume', 'salted_shark'),
  ('consume', 'salted_shrimp'),
  ('consume', 'salted_swordfish'),
  ('consume', 'salted_trout'),
  ('consume', 'thin_carrot_juice'),
  ('consume', 'thin_emberfruit_cordial'),
  ('consume', 'thin_goldenroot_tea'),
  ('consume', 'thin_pumpkin_cider'),
  ('consume', 'thin_tomato_juice'),
  ('consume', 'thin_turnip_juice'),
  ('consume', 'tomato_juice'),
  ('consume', 'turnip_juice'),
  ('consume', 'turnip_mash'),
  ('consume', 'wheat_bread')
-- ⟦/action-ids⟧
;

-- ── §2 THE FOUR BODIES ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_settle_session(p_user uuid, p_slot integer, p_session uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_lx bigint;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz; v_i int;
  v_next_id uuid;
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  v_supply jsonb;
  v_store  boolean;
  -- THE FOLD'S TIME BOUND: every row this folds was stamped in the transaction
  -- of a settle, and a window is at most c_max_window.
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- OWN USES: packed bag lines only, of a kind a hunt spends, never more than is left.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'ammo' then
        perform public.hr_reject('kind_not_used', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
      v_left := null; v_kind := null;
    end loop;
  end if;

  -- THE DEATH: the death rows hr_apply stamped with this session since the last fold (at most one).
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  if v_deaths > 1 then perform public.hr_reject('bad_counts', jsonb_build_object('deaths', v_deaths)); end if;
  if (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_store := v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch';
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      -- DIED (Tyler 2026-10-19): this settle journalled the hero's death.
      when 'died' then v_deaths >= 1
      -- PARTY_MEMBER_DIED: another member of this instance died, which ends the whole party's hunt;
      -- provable only as "the instance holds another member": the end can only stop value, never mint it.
      when 'party_member_died' then exists (select 1 from public.hunt_sessions o
                                             where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        -- STORE-BY-SLOT (2026-11-04): any store food a slot may name (the player picks it).
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q where q.kind = 'heal'))
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
                       and not (v_store and exists (select 1 from public.hunt_bag b join public.hr_hunt_basic_supplies q
                                                     on q.kind = 'ammo' and q.partner = b.item_id
                                                    where b.session_id = p_session and b.essential))
      -- GOLD_OUT: the store was open to the hero, and the gold left over its floor
      -- (after this window's coins, cover and buys, written before this call) is
      -- below the dearest store row it could need.
      when 'gold_out' then v_store
                       and coalesce((select ps.gold from public.player_state ps
                                      where ps.user_id = p_user and ps.slot = p_slot), 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where q.kind in ('heal', 'mana')
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0)
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: a death journalled, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_deaths >= 1
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) OWN USES: the bag, and ONE `supply_own` row per settle carrying every
  --     unit used in meta.items (qty = the units destroyed, negative, gold 0).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,
                jsonb_build_object('side', 'bag', 'source', 'own', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  -- THE LEVEL XP the fold credited (hr_apply's ledger meta `lx`), tallied under `level`.
  select coalesce(sum((l.meta->'delta'->>'lx')::numeric), 0)::bigint into v_lx
    from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     and jsonb_typeof(l.meta->'delta'->'lx') = 'number';
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'supply_own'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp || case when v_lx > 0 then jsonb_build_object('level', v_lx) else '{}'::jsonb end),
         loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. The death from its row; Level- and level-ups from the XP the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'death'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'death', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  if v_lx > 0 then
    select public.hr_char_level(ps.level_xp), public.hr_char_level(greatest(0, ps.level_xp - v_lx))
      into v_n, v_left from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    if v_n > v_left then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', 'level', 'level', v_n));
      v_ev := v_ev + 1;
    end if;
  end if;
  for v_r in select x.key as skill, public.hr_skill_level(x.key, ps.xp) as lv_now,
                    public.hr_skill_level(x.key, greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session));
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_member_read(p_s hunt_sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'id', p_s.id, 'hunt', p_s.hunt_id, 'preset', p_s.preset, 'version', p_s.version,
    'hunt_from_ms', ceil(extract(epoch from p_s.hunt_from) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from p_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from p_s.next_swing_at) * 1000)::bigint,
    'swing_index', p_s.swing_index,
    'hours_limit', p_s.hours_limit,
    'leave_at_ms', case when p_s.leave_at is null then null else ceil(extract(epoch from p_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when p_s.change_at is null then null else ceil(extract(epoch from p_s.change_at) * 1000)::bigint end,
    'change_to', p_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = p_s.id), '{}'::jsonb),
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    -- THE STAMINA POOL AT THE WINDOW START and the cap it rests to (premium).
    'stamina_ms', public.hr_stamina_of(p_s.user_id, p_s.slot, p_s.settled_to),
    'stamina_max_ms', public.hr_stamina_cap(p_s.user_id, p_s.slot, p_s.settled_to),
    -- THE STORE (catalogue). STORE-BY-SLOT (2026-11-04): a bar slot names the ONE item a
    -- use spends (Tyler 2026-10-21); no hunt tier picks one.
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind, 'price', b.price,
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    -- THE HERO'S SETTINGS (options) and BAR, its supply setting and floor.
    'options', coalesce((select a.options from public.player_action_sets a
                          where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '{}'::jsonb),
    'bar', coalesce((select a.slots from public.player_action_sets a
                      where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '[]'::jsonb),
    'gold_floor', (public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'gold_floor')::bigint,
    'supply_source', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'supply_source',
    'on_empty', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'on_empty',
    -- WHAT SELL-TO-COVER MAY SELL: this session's own loot of the cover items, still in the bag.
    'cover', coalesce((select jsonb_object_agg(c.item_id, jsonb_build_object('unit', c.unit,
                 'avail', greatest(0, least(
                   coalesce((select pi.qty from public.player_inventory pi
                              where pi.user_id = p_s.user_id and pi.slot = p_s.slot and pi.item_id = c.item_id), 0),
                   coalesce((t.loot->>c.item_id)::numeric, 0)::bigint - coalesce((t.covered->>c.item_id)::bigint, 0)))))
                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id
                -- NEVER A LOCKED ITEM (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), '{}'::jsonb))
$function$;

create or replace function public.hr_hunt_slot_check(p_s jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  -- STORE-BY-SLOT (2026-11-04): a slot names ONE item; a rune spell may name its store rune (action.store).
  v_type text; v_id text; v_r jsonb; v_store text;
begin
  if p_s is null or jsonb_typeof(p_s) = 'null' then return jsonb_build_object('ok', true, 'slot', 'null'::jsonb); end if;
  if jsonb_typeof(p_s) = 'string' then
    if not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = p_s #>> '{}') then
      return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
    v_r := jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'), 'conditions', '[]'::jsonb, 'join', 'and');
    return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8)));
  end if;
  if jsonb_typeof(p_s) <> 'object' or jsonb_typeof(p_s->'action') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s) k where k not in ('id', 'action', 'conditions', 'join')) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_type := p_s->'action'->>'type'; v_id := p_s->'action'->>'id';
  -- THE RETIRED "ANY FOOD" / "ANY DRINK" (Tyler 2026-10-21: the game never picks a supply): refused in words.
  if v_type = 'consume' and v_id in ('food', 'drink') then
    return jsonb_build_object('ok', false, 'error', 'choose_item'); end if;
  if jsonb_typeof(p_s->'action'->'id') is distinct from 'string' or v_type is null
     or not coalesce(case v_type
          when 'ability' then exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_id)
          when 'consume' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'consume' and x.id = v_id)
          when 'attack_with_item' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'attack_with_item' and x.id = v_id)
          else false end, false) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s->'action') k where k not in ('type', 'id', 'store')) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  -- THE STORE RUNE (designer 2026-10-21): only a spell that spends a rune may name a store row, and
  -- only that rune's (its partner). A food or drink slot names its one item and nothing else.
  if p_s->'action' ? 'store' then
    v_store := case when jsonb_typeof(p_s->'action'->'store') = 'string' then p_s->'action'->>'store' end;
    if v_store is null or v_type <> 'ability' or not exists (
         select 1 from public.hr_hunt_basic_supplies q join public.hr_hunt_abilities a on a.rune = q.partner
          where q.basic_id = v_store and a.ability_id = v_id) then
      return jsonb_build_object('ok', false, 'error', 'bad_store'); end if;
  end if;
  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);
  if v_r is not null then return jsonb_build_object('ok', false) || v_r; end if;
  -- THE STABLE RULE ID is the server's, from the slot's CONTENT (never the client's value,
  -- never its position): a reorder or a copy keeps it, an edit changes it.
  v_r := jsonb_build_object('action', jsonb_build_object('type', v_type, 'id', v_id)
                                     || case when v_store is null then '{}'::jsonb else jsonb_build_object('store', v_store) end,
    'conditions', coalesce(p_s->'conditions', '[]'::jsonb), 'join', coalesce(p_s->>'join', 'and'));
  return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8)));
end $$;

create or replace function public.hr_hunt_settings_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  s       public.hunt_sessions%rowtype;
  a       public.player_action_sets%rowtype;
  i       public.hunt_instances%rowtype;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_preset int;
  v_opt   jsonb;
  v_wj    jsonb;
  v_uf    jsonb;
  v_me    jsonb;
  v_unit  jsonb := '{}'::jsonb;
  v_role  text;
  v_disc  text;
  v_list  jsonb := '[]'::jsonb;
  v_def   jsonb;
  v_d     jsonb;
  v_pos   int;
  v_slots jsonb := '[]'::jsonb;
  v_e     jsonb;
  v_presets jsonb;
  v_eff   jsonb := '{}'::jsonb;
  v_o     record;
  v_val   jsonb;
  v_ab    public.hr_hunt_abilities%rowtype;
  v_n     bigint;
  v_own   boolean;
  v_on    boolean;
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  v_preset := coalesce(s.preset, 0);
  select * into a from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = v_preset;
  v_opt := coalesce(a.options, '{}'::jsonb);
  -- The hunting hero's unit: its role and the settings the engine runs it on.
  if s.id is not null and s.unit_id is not null then
    select * into i from public.hunt_instances where id = s.instance_id;
    select * into v_shape from public.hr_hunt_world_shape where id;
    begin
      v_wj := i.world::jsonb;
    exception when others then
      v_wj := null;
    end;
    if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id and jsonb_typeof(v_wj->'u') = 'array'
       and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
      v_uf := v_shape.fields->'unit';
      select e into v_me from jsonb_array_elements(v_wj->'u') e
       where e->>((v_uf->>'side')::int) = 'hero' and (e->>((v_uf->>'id')::int))::int = s.unit_id limit 1;
      if v_me is not null then
        v_role := v_me->>((v_uf->>'role')::int);
        v_unit := jsonb_build_object('distance', v_me->((v_uf->>'dist')::int), 'chase', v_me->((v_uf->>'chase')::int),
                                     'target_mode', v_me->((v_uf->>'tmode')::int), 'stance', v_me->((v_uf->>'stance')::int));
      end if;
    end if;
  end if;
  -- Not hunting: the role the worn weapon gives (a staff's pick kept when it allows it).
  if v_role is null or v_role = '' then
    select case when v_opt->>'role' = any (w.roles) then v_opt->>'role' else w.roles[1] end into v_role
      from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot);
  end if;
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(v_opt->v_o.opt, v_unit->v_o.opt, v_o.dflt);
    v_eff := v_eff || jsonb_build_object(v_o.opt, v_val);
  end loop;
  select r.discipline into v_disc from public.hr_hunt_roles r where r.role = v_role;
  -- THE BAR: the stored slots (an invalid row reads as an empty tablet), then the defaults.
  for v_e in select value from jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) loop
    v_d := public.hr_hunt_slot_check(v_e);
    v_list := v_list || jsonb_build_array(case when (v_d->>'ok')::boolean then v_d->'slot' else 'null'::jsonb end);
  end loop;
  v_def := '[]'::jsonb;
  if not exists (select 1 from jsonb_array_elements(v_list) e join public.hr_hunt_abilities ab on ab.ability_id = e->'action'->>'id'
                  where e->'action'->>'type' = 'ability' and v_disc = any (ab.disciplines)) then
    select coalesce(jsonb_agg(r.slot order by r.ord), '[]'::jsonb) into v_def from public.hr_hunt_role_rules r where r.role = v_role;
  end if;
  -- STORE-BY-SLOT (2026-11-04): NO default food or drink (Tyler 2026-10-21: the game never picks a
  -- supply). A NEW hero, whose stored bar holds nothing at all, gets the start kit's bar
  -- (src/data/start-kit.js START_BAR, pinned by tests/hunt-core/conditions.mjs): its own Cooked
  -- Shrimp, then the store's Salted Shrimp, then Thin Turnip Juice.
  if not exists (select 1 from jsonb_array_elements(v_list) e where jsonb_typeof(e) = 'object') then
    -- ⟦starter-bar⟧
    v_def := v_def || '[{"id": "d_food", "action": {"type": "consume", "id": "cooked_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_food_store", "action": {"type": "consume", "id": "salted_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_drink", "action": {"type": "consume", "id": "thin_turnip_juice"}, "conditions": [{"metric": "self_mana_pct", "op": "lt", "value": 30}], "join": "and"}]'::jsonb;
    -- ⟦/starter-bar⟧
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- The display fields, THE SERVER'S STRUCK STATE (the browser never counts its own): an ability's
  -- mana and whether it can fire (active, of the discipline, its rune held, or STORE-BY-SLOT: its slot
  -- names the rune's store row and the hero's setting lets the store supply); a food or drink's
  -- count (the open hunt's bag, else the inventory) and why it cannot fire (`why`): a crafted item
  -- with none left is `none_left`, a store item under the hero's "end the hunt" is `store_off`.
  v_on := v_eff->>'supply_source' = 'store' or v_eff->>'on_empty' = 'switch';
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana,
        'usable', coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_ab.rune is null or exists (
          select 1 from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_ab.rune and pi.qty > 0)
          or (v_on and exists (
          select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_e->'action'->>'store' and q.partner = v_ab.rune)))));
    elsif v_e->'action'->>'type' = 'consume'
          and exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_e->'action'->>'id') then
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', v_on, 'count', null,
        'why', case when v_on then null else 'store_off' end));
    else
      v_n := case when s.id is not null
                  then (select coalesce(sum(b.qty_left), 0) from public.hunt_bag b where b.session_id = s.id and b.item_id = v_e->'action'->>'id')
                  else (select coalesce(sum(pi.qty), 0) from public.player_inventory pi
                         where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_e->'action'->>'id') end;
      v_own := v_e->'action'->>'type' = 'consume';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', not v_own or v_n > 0, 'count', v_n,
        'why', case when v_own and v_n = 0 then 'none_left' end));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('preset', x.preset, 'name', x.name, 'grounds', coalesce(x.options->'grounds', '[]'::jsonb))
           order by x.preset), '[]'::jsonb) into v_presets
    from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot;
  if not exists (select 1 from jsonb_array_elements(v_presets) e where (e->>'preset')::int = v_preset) then
    v_presets := v_presets || jsonb_build_array(jsonb_build_object('preset', v_preset, 'name', 'Preset ' || (v_preset + 1), 'grounds', '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'preset', v_preset, 'presets', v_presets, 'role', v_role,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'food_pct', v_eff->'food_below_pct', 'drink_pct', v_eff->'drink_below_pct',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gold_floor', v_eff->'gold_floor',
    'density', v_eff->'density', 'gather_share', v_eff->'gather_share', 'gather_inert', true,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    -- THE STORE at the server's price (the Configure action table's numbers: never a client copy).
    'store', coalesce((select jsonb_agg(jsonb_build_object('id', q.basic_id, 'kind', q.kind, 'partner', q.partner,
                                                             'heals', q.heals, 'mana', q.mana, 'price', q.price) order by q.kind, q.price, q.basic_id)
                         from public.hr_hunt_basic_supplies q), '[]'::jsonb),
    'bar', coalesce(a.slots, '[]'::jsonb), 'options', v_opt);
end $$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, ROLLED BACK ──────────────────────
do $$
declare
  v_u   uuid := '000000c0-0000-4000-a000-00000057b001';
  v     jsonb;
  v_f   text;
  v_rune text := (select a.rune from public.hr_hunt_abilities a where a.ability_id = 'flame_strike');
  v_has_tiers boolean := exists (select 1 from information_schema.columns where table_schema = 'public'
                                   and table_name = 'hr_hunt_basic_supplies' and column_name = 'tiers');
  v_sl  jsonb;
begin
  -- (a) the slot check: one item, crafted or from the store; "Any food" refused in words; every misfit refused.
  foreach v_f in array array['cooked_shrimp', 'salted_trout', 'thin_turnip_juice'] loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', v_f), 'conditions', '[]'::jsonb));
    if coalesce(v->>'ok', '') <> 'true' or v->'slot'->'action'->>'id' is distinct from v_f then
      raise exception 'VERIFY(a): a slot naming % answered %', v_f, v; end if;
  end loop;
  foreach v_f in array array['food', 'drink'] loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', v_f)));
    if v->>'error' is distinct from 'choose_item' then raise exception 'VERIFY(a): the retired % slot answered %', v_f, v; end if;
  end loop;
  foreach v_f in array array[
      '{"action": {"type": "consume", "id": "cooked_shrimp", "store": "salted_shrimp"}}',
      '{"action": {"type": "consume", "id": "salted_trout", "store": "salted_trout"}}',
      '{"action": {"type": "ability", "id": "flame_strike", "store": "salted_shrimp"}}',
      '{"action": {"type": "ability", "id": "power_strike", "store": "salted_shrimp"}}',
      '{"action": {"type": "ability", "id": "flame_strike", "store": 7}}'] loop
    v := public.hr_hunt_slot_check(v_f::jsonb);
    if v->>'error' is distinct from 'bad_store' then raise exception 'VERIFY(a): % answered %', v_f, v; end if;
  end loop;
  v := public.hr_hunt_slot_check('{"action": {"type": "consume", "id": "salted_trout", "price": 1}}'::jsonb);
  if v->>'error' is distinct from 'bad_action' then raise exception 'VERIFY(a): an unknown action key answered %', v; end if;
  if exists (select 1 from public.hr_hunt_action_ids where type = 'consume' and id in ('food', 'drink'))
     or not exists (select 1 from public.hr_hunt_action_ids where type = 'consume' and id = 'salted_shrimp') then
    raise exception 'VERIFY(a): the consume ids still hold a kind, or no store food'; end if;
  -- (b) no restated body reads a hunt tier.
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure,
                                                      'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure,
                                                      'public.hr_hunt_settings_view(uuid,integer)'::regprocedure,
                                                      'public.hr_hunt_slot_check(jsonb)'::regprocedure)
              and (p.prosrc like '%tiers%' or p.prosrc like '%v\_tier%' or p.prosrc like '%t.tier%' or p.prosrc like '%''shop''%')) then
    raise exception 'VERIFY(b): a restated body still reads the hunt tier or projects `shop`'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'store-by-slot §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', v; end if;
    -- (c) a NEW hero (nothing stored) reads the start kit's bar: own Cooked Shrimp, store Salted Shrimp, Thin Turnip Juice.
    v := public.hr_hunt_settings_view(v_u, 0);
    if (select string_agg(e->'action'->>'id', ',' order by n) from jsonb_array_elements(v->'slots') with ordinality x(e, n)
         where e->'action'->>'type' = 'consume') is distinct from 'cooked_shrimp,salted_shrimp,thin_turnip_juice' then
      raise exception 'VERIFY(c): a new hero''s food and drink slots are %', v->'slots'; end if;
    if jsonb_array_length(v->'store') <> (select count(*) from public.hr_hunt_basic_supplies)
       or exists (select 1 from jsonb_array_elements(v->'store') e join public.hr_hunt_basic_supplies q on q.basic_id = e->>'id'
                   where (e->>'price')::bigint <> q.price or (e->>'heals')::int <> q.heals or (e->>'mana')::int <> q.mana) then
      raise exception 'VERIFY(c): the store rows are not the catalogue''s: %', v->'store'; end if;
    -- (d) the server's struck state: own shrimp gone is `none_left`; the store food still fires; under "end" it is `store_off`.
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id in ('cooked_shrimp', v_rune);
    v := public.hr_hunt_settings_view(v_u, 0);
    select e into v_sl from jsonb_array_elements(v->'slots') e where e->'action'->>'id' = 'cooked_shrimp';
    if (v_sl->>'usable')::boolean or v_sl->>'why' is distinct from 'none_left' or (v_sl->>'count')::int <> 0 then
      raise exception 'VERIFY(d): own shrimp, none left, reads %', v_sl; end if;
    select e into v_sl from jsonb_array_elements(v->'slots') e where e->'action'->>'id' = 'salted_shrimp';
    if not (v_sl->>'usable')::boolean or v_sl->>'why' is not null then raise exception 'VERIFY(d): the store shrimp reads %', v_sl; end if;
    -- (e) a Flame Strike slot naming the store rune is usable with no rune held (the store row is planted
    --     if 2026-11-07-hunt-sessions-catalogue.generated.sql, which ships it, has not run yet: rolled back).
    if v_rune is null then raise exception 'VERIFY(e): Flame Strike spends no rune'; end if;
    if not exists (select 1 from public.hr_hunt_basic_supplies where partner = v_rune) then
      if v_has_tiers then
        execute 'insert into public.hr_hunt_basic_supplies (basic_id, kind, partner, heals, mana, price, tiers) values ($1, ''ammo'', $2, 0, 0, 8, ''{}''::int[])' using 'plain_' || v_rune, v_rune;
      else
        execute 'insert into public.hr_hunt_basic_supplies (basic_id, kind, partner, heals, mana, price) values ($1, ''ammo'', $2, 0, 0, 8)' using 'plain_' || v_rune, v_rune;
      end if;
    end if;
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options)
      values (v_u, 0, 0, 'Preset 1', jsonb_build_array(
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'flame_strike',
                                                        'store', (select basic_id from public.hr_hunt_basic_supplies where partner = v_rune limit 1)),
                           'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'flame_strike'), 'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'salted_shrimp'), 'conditions', '[]'::jsonb, 'join', 'and')),
        '{"role": "tank", "on_empty": "end"}'::jsonb)
      on conflict (user_id, slot, preset) do update set slots = excluded.slots, options = excluded.options;
    v := public.hr_hunt_settings_view(v_u, 0);
    if exists (select 1 from jsonb_array_elements(v->'slots') e where e->>'id' in ('d_food', 'd_food_store', 'd_drink')) then
      raise exception 'VERIFY(e): a hero with a stored bar still gets the starter food: %', v->'slots'; end if;
    v_sl := v->'slots'->2;
    if (v_sl->>'usable')::boolean or v_sl->>'why' is distinct from 'store_off' then
      raise exception 'VERIFY(e): a store food under "end the hunt" reads %', v_sl; end if;
    update public.player_action_sets set options = '{"role": "tank"}'::jsonb where user_id = v_u and slot = 0 and preset = 0;
    v := public.hr_hunt_settings_view(v_u, 0);
    v_sl := v->'slots'->0;
    if v_sl->'action'->>'store' is null then raise exception 'VERIFY(e): the stored store rune did not reach the bar: %', v->'slots'; end if;
    if v->>'role' = 'tank' then
      if not coalesce((v_sl->>'usable')::boolean, false) then raise exception 'VERIFY(e): a Flame Strike slot naming the store rune reads unusable: %', v_sl; end if;
      if coalesce((v->'slots'->1->>'usable')::boolean, false) then raise exception 'VERIFY(e): a Flame Strike slot with no rune and no store rune reads usable'; end if;
    end if;
    raise exception using errcode = 'HR891', message = 'store-by-slot §3 complete - rolling back';
  exception when sqlstate 'HR891' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_settings_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_settings_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_member_read(public.hunt_sessions)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_slot_check(jsonb)', 'execute') then
    raise exception 'VERIFY(f): a client role reaches a server-only body'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'store-by-slot: a slot names one item; a new hero gets the start kit''s bar; the struck state is the server''s';
end $$;
