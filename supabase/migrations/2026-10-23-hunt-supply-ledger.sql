-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE OWN / STORE SUPPLY LEDGER (lane S1; HUNT_SCREEN_SPEC §3.8:
-- "every consumable, rune and ammo use is a ledger line: supply_own (moves a
-- unit, no gold) or supply_buy (gold at the catalogue store price). Both carry
-- session_id. The analyzer reads only these."). STAGED. Game CLOSED: applies on
-- its passing §4; Security reviews it in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_hunt_settle_session — ONE character's session half of a hunt settle — is
-- RESTATED WHOLE (C1's body was three anchored C2 edits deep; the chain rule
-- says restate). Its job is unchanged: re-prove one window of one session from
-- server state and apply it. What moved:
--   · OWN USES are one `supply_own` row per settle (kind 'hunt', qty = −units
--     destroyed, gold 0, meta.items {item: units}, session_id) — the row C1
--     called `hunt_consume`. STORE USES are the `supply_buy` row the member
--     applier journals (2026-10-23-hunt-world-state.sql, kind 'hunt', gold =
--     −cost at hr_hunt_basic_supplies.price, meta.items {id: {qty, price}}).
--     The tally folds BOTH from those rows only (supplies = own units; bought +
--     supply_gold = store), so the analyzer's own/store split IS the ledger.
--   · A use must be a bag line the session packed, of a kind a hunt spends
--     (food `heal`, a rune or a shot `ammo`); a buff line is never used by the
--     idle engine and a use of one is refused (`kind_not_used`). The per-lane
--     caps on uses are the member applier's (it sees own + store together).
--   · NO PRESSES, NO COOLDOWNS on the session row (hunts are idle; ability and
--     food lanes live on the hero's unit in the instance world).
--   · gold_out is re-proved from the hero's OWN setting: the store was open to
--     it (supply_source 'store' or on_empty 'switch') and the gold over its
--     floor is below the dearest store row it could need (the tier's food and
--     drink, the equipped shot's).
--   · heals_out / ammo_out stay re-provable, reachable only under the hero's
--     explicit on_empty 'end' (the default is 'switch': a hunt never stops for
--     lack of stock, Tyler 2026-10-16).
-- Every refusal RAISES (hr_reject, SQLSTATE HR000): by the time this runs,
-- hr_apply has moved value in the same transaction.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_settle_session from 2026-10-21-hunt-sessions.sql and its
-- three 2026-10-22-hunt-sessions-settle.sql §4c edits (they need the retired
-- columns 2026-10-23-hunt-world-state.sql drops). Ledger rows are append-only
-- history either way.
-- ORDER: after 2026-10-23-hunt-settings-options.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null
     or to_regprocedure('public.hr_hunt_swap(uuid,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the C1 session applier, hr_hunt_close or hr_hunt_swap is absent';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'player_action_sets' and column_name = 'options') then
    raise exception 'PRECONDITION: apply 2026-10-23-hunt-settings-options.sql first (player_action_sets.options)';
  end if;
end $mig$;

-- The hero's effective supply setting and floor, from its options (defaults
-- from the generated option rows' data: hunt-sessions.js SUPPLY_SOURCE /
-- ON_EMPTY / GOLD_FLOOR).
create or replace function public.hr_hunt_supply_of(p_user uuid, p_slot int, p_preset int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'supply_source', coalesce(a.options->>'supply_source', 'mine'),
    'on_empty', coalesce(a.options->>'on_empty', 'switch'),
    'gold_floor', coalesce((a.options->>'gold_floor')::bigint, public.hr_hunt_limit('gold_floor_default')::bigint, 0))
    from (select 1) one
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p_preset
$$;
revoke execute on function public.hr_hunt_supply_of(uuid, int, int) from public, anon, authenticated, service_role;

-- ── §1 hr_hunt_settle_session, RESTATED WHOLE ────────────────────────────────
create or replace function public.hr_hunt_settle_session(p_user uuid, p_slot int, p_session uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'falls', 'down',
                                  'down_ms', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_falls int;
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
  v_tier   int;
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

  -- FALLS equal the death rows hr_apply stamped with this session since the last fold.
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  v_falls := v_s.falls + v_deaths;
  if (p_delta ? 'falls') and (jsonb_typeof(p_delta->'falls') <> 'number' or (p_delta->>'falls')::numeric <> v_falls) then
    perform public.hr_reject('falls_mismatch', jsonb_build_object('journalled', v_falls)); end if;
  if (p_delta ? 'down' and jsonb_typeof(p_delta->'down') <> 'boolean')
     or (p_delta ? 'down_ms' and (jsonb_typeof(p_delta->'down_ms') <> 'number' or (p_delta->>'down_ms')::numeric < 0
                                  or (p_delta->>'down_ms')::numeric > v_win))
     or (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
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
  select t.tier into v_tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id;
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      when 'falls' then v_falls >= v_s.falls_limit
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q
                                                      where q.kind = 'heal' and v_tier = any (q.tiers)))
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
                                      where ((q.kind in ('heal', 'mana')) and v_tier = any (q.tiers))
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
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: the falls limit reached, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_falls >= v_s.falls_limit
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
         xp = public.hr_jsonb_add(t.xp, v_xp), loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         down_ms = t.down_ms + coalesce((p_delta->>'down_ms')::numeric, 0)::bigint,
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. Falls from the death rows; level-ups from the xp the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'fall'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'fall', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  for v_r in select x.key as skill, public.hr_level_from_xp(ps.xp) as lv_now,
                    public.hr_level_from_xp(greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
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
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next,
         falls = v_falls, down = coalesce((p_delta->>'down')::boolean, down), version = version + 1
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
end $$;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from public;
revoke execute on function public.hr_hunt_settle_session(uuid, int, uuid, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §2 SELF-CHECK (CLAUDE.md §4) ─────────────────────────────────────────────
-- The body's load-bearing properties, by its own text (the behaviour is
-- executed end to end by 2026-10-23-hunt-world-state.sql's §4 through the
-- member applier, which is the only caller): one supply_own row a settle, no
-- press or cooldown left, owner-only.
do $$
declare v_src text; v_role text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if strpos(v_src, '''supply_own''') = 0 or strpos(v_src, 'hunt_consume') > 0 then
    raise exception 'SELF-CHECK: own uses are not journalled as supply_own'; end if;
  if v_src ~ 'presses|cooldowns|hr_hunt_preset_slots|hr_vigour_of' then
    raise exception 'SELF-CHECK: the session applier still reads a retired C2 input'; end if;
  if strpos(v_src, 'kind_not_used') = 0 or strpos(v_src, 'hr_hunt_supply_of') = 0 then
    raise exception 'SELF-CHECK: the use kinds or the hero''s supply setting are not checked'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and (has_function_privilege(v_role, 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'execute')
            or has_function_privilege(v_role, 'public.hr_hunt_supply_of(uuid,integer,integer)', 'execute')) then
      raise exception 'SELF-CHECK: % can execute the session applier or its supply read', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-supply-ledger: one supply_own row per settle, store buys journalled supply_buy by the member applier; the C2 bar inputs are gone; all green';
end $$;
