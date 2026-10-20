-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEATH POPUP'S FACTS (lane a-death-popup, systems-engineer,
-- 2026-10-20; Tyler 2026-10-19 build card: "where you died, what killed you
-- and the killing blow, the last seconds of damage/healing, XP lost and
-- Blessings saved"). STAGED. Game CLOSED: applies on its passing §4.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_death_why(jsonb) NEW, immutable, owner-only: sanitizes the engine's
--   account of a death (src/core/hunt/death-why.js, sent by hr-accrue as the
--   settle's hints.death_why) to { blow: {m, ab, n}, recent: [{k, n, ago, m, ab}] }:
--   ids ^[a-z0-9_]{1,64}$, numbers clamped 0..10 000 000 (ago 0..60 000),
--   at most 12 recent lines; anything else is dropped. DISPLAY ONLY: nothing
--   reads it to price, pay or gate.
-- hr_hunt_settle_session RESTATED from 2026-10-27-core-bodies.sql VERBATIM but
--   one line: the death event's data is `monster` || hr_death_why(hint).
--   An edge that sends no death_why (the deployed one) stores what it stored.
-- hr_death_log_view RESTATED: each row also carries `session`, `blow`,
--   `recent` and `saved` (the blessing_used ledger row of that session's
--   meta.saved: the XP a Blessing kept, by Level and skill).
-- Moves no value. No table, grant or column change.
--
-- REVERSIBILITY: re-apply both bodies from 2026-10-27-core-bodies.sql, then
-- drop function public.hr_death_why(jsonb).
-- ORDER: after 2026-10-29-character-names-everywhere.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: the live pre-images (md5 of prosrc, read 2026-10-20) or this file's ──
do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if md5(v_src) <> '8e1643e7d8f531ef3796c48c27f382af' and strpos(v_src, 'hr_death_why(') = 0 then
    raise exception 'PIN: hr_hunt_settle_session is not the core-bodies image or this file''s'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_death_log_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> '3bd5f2c3de25210c6cf4e80825129c94' and strpos(v_src, 'blessing_used') = 0 then
    raise exception 'PIN: hr_death_log_view is not the core-bodies image or this file''s'; end if;
end $mig$;

-- ── hr_death_why: the engine's account of one death, shape-checked ──
CREATE OR REPLACE FUNCTION public.hr_death_why(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with b as (
    select case when jsonb_typeof(p) = 'object' and jsonb_typeof(p->'blow') = 'object'
                 and jsonb_typeof(p->'blow'->'n') = 'number' and (p->'blow'->>'n') ~ '^[0-9]{1,8}$'
           then jsonb_strip_nulls(jsonb_build_object(
                  'm',  case when (p->'blow'->>'m') ~ '^[a-z0-9_]{1,64}$' then p->'blow'->>'m' end,
                  'ab', case when (p->'blow'->>'ab') ~ '^[a-z0-9_]{1,64}$' then p->'blow'->>'ab' end,
                  'n',  least((p->'blow'->>'n')::bigint, 10000000)))
           end as blow
  ), r as (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'k', e.value->>'k',
             'n', least((e.value->>'n')::bigint, 10000000),
             'ago', least((e.value->>'ago')::bigint, 60000),
             'm',  case when (e.value->>'m') ~ '^[a-z0-9_]{1,64}$' then e.value->>'m' end,
             'ab', case when (e.value->>'ab') ~ '^[a-z0-9_]{1,64}$' then e.value->>'ab' end))
           order by e.o), '[]'::jsonb) as recent
      from jsonb_array_elements(case when jsonb_typeof(p) = 'object' and jsonb_typeof(p->'recent') = 'array'
                                     then p->'recent' else '[]'::jsonb end) with ordinality e(value, o)
     where e.o <= 12 and jsonb_typeof(e.value) = 'object'
       and (e.value->>'k') in ('dmg', 'heal')
       and jsonb_typeof(e.value->'n') = 'number' and (e.value->>'n') ~ '^[0-9]{1,8}$'
       and jsonb_typeof(e.value->'ago') = 'number' and (e.value->>'ago') ~ '^[0-9]{1,8}$'
  )
  select case when p is null or jsonb_typeof(p) <> 'object' then '{}'::jsonb
              else jsonb_strip_nulls(jsonb_build_object('blow', b.blow, 'recent', r.recent)) end
    from b, r
$function$;
revoke execute on function public.hr_death_why(jsonb) from public, anon, authenticated, service_role;

-- ── hr_hunt_settle_session: core-bodies VERBATIM but the death event's data (DEATH-WHY) ──
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
  select t.tier into v_tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id;
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
      values (p_session, p_user, p_slot, 'death', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64))
                || public.hr_death_why(v_hint->'death_why'->v_i));
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

-- ── hr_death_log_view: the death rows, with what killed the hero and what a Blessing kept ──
CREATE OR REPLACE FUNCTION public.hr_death_log_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'session', d.session_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end,
           'blow', case when jsonb_typeof(d.data->'blow') = 'object' then d.data->'blow' end,
           'recent', case when jsonb_typeof(d.data->'recent') = 'array' then d.data->'recent' end,
           -- What a Blessing kept: the blessing_used row the same settle wrote (at most one window,
           -- 24 h, after the death). Known only while the ledger keeps it (retain_days): an older
           -- death answers null ("not known"), never {} ("none").
           'saved', case when d.at > now() - interval '80 days' then
                      coalesce((select l.meta->'saved' from public.player_ledger l
                                 where l.session_id = d.session_id and l.user_id = p_user and l.slot = p_slot
                                   and l.at >= d.at - interval '1 minute' and l.at < d.at + interval '25 hours'
                                   and l.kind = 'hunt' and l.intent = 'blessing_used' and jsonb_typeof(l.meta->'saved') = 'object'
                                 order by l.id desc limit 1), '{}'::jsonb) end)
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id, h.id as session_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'death'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
$function$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_u uuid := gen_random_uuid();   -- a fresh probe id per run, checked absent: never a real account
  v jsonb; v_s uuid; v_log jsonb; v_src text; v_role text;
begin
  if exists (select 1 from auth.users where id = v_u) then raise exception 'death-popup §4: probe id collides'; end if;
  -- (a) THE SANITIZER keeps a good account and drops everything else.
  v := public.hr_death_why('{"blow":{"m":"rat_king","ab":"tail_lash","n":34},"recent":[{"k":"dmg","n":34,"ago":0,"m":"rat_king","ab":"tail_lash"},{"k":"heal","n":20,"ago":1500}]}');
  if v <> '{"blow":{"m":"rat_king","ab":"tail_lash","n":34},"recent":[{"k":"dmg","n":34,"ago":0,"m":"rat_king","ab":"tail_lash"},{"k":"heal","n":20,"ago":1500}]}'::jsonb then
    raise exception 'death-popup §4(a): a good account did not survive: %', v; end if;
  v := public.hr_death_why('{"blow":{"m":"Rat King!","ab":"x y","n":99999999},"recent":[{"k":"gold","n":1,"ago":0},{"k":"dmg","n":-5,"ago":0},{"k":"dmg","n":"7","ago":0},{"k":"dmg","n":3,"ago":99999999,"x":1}],"evil":1}');
  if v <> '{"blow":{"n":10000000},"recent":[{"k":"dmg","n":3,"ago":60000}]}'::jsonb then
    raise exception 'death-popup §4(a): a bad account was not cut down: %', v; end if;
  if public.hr_death_why('[1]') <> '{}'::jsonb or public.hr_death_why(null) is distinct from '{}'::jsonb then
    raise exception 'death-popup §4(a): a non-object account was not dropped'; end if;
  if (select jsonb_array_length(public.hr_death_why(jsonb_build_object('recent',
        (select jsonb_agg(jsonb_build_object('k', 'dmg', 'n', i, 'ago', i)) from generate_series(1, 40) i)))->'recent')) <> 12 then
    raise exception 'death-popup §4(a): recent is not capped at 12'; end if;
  -- (b) THE SETTLE stores it: the death insert, and only it, calls the sanitizer on the death hint.
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if strpos(v_src, '|| public.hr_death_why(v_hint->''death_why''->v_i)') = 0
     or (length(v_src) - length(replace(v_src, 'hr_death_why(', ''))) / length('hr_death_why(') <> 1 then
    raise exception 'death-popup §4(b): the settle does not store the death account exactly once'; end if;
  -- (c) THE VIEW projects the session, the account and the Blessing's save, for a real character's real session.
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u);
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'death-popup §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'death-popup §4(c): hr_create_character refused: %', v; end if;
    v := public.hr_hunt_enter_for(v_u, 0, 'mill_cellar', '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'death-popup §4(c): hr_hunt_enter_for refused: %', v; end if;
    select id into v_s from public.hunt_sessions where user_id = v_u and slot = 0 order by entered_at desc limit 1;
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (v_s, v_u, 0, 'death', now(), jsonb_build_object('monster', 'rat_king', 'xp_lost', jsonb_build_object('level', 40), 'xp', 40)
                || public.hr_death_why('{"blow":{"m":"rat_king","ab":"tail_lash","n":34},"recent":[{"k":"dmg","n":34,"ago":0}]}'));
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (v_u, 0, 'hunt', 'blessing_used', jsonb_build_object('reason', 'blessing_used', 'saved', jsonb_build_object('level', 60)), v_s);
    v_log := public.hr_death_log_view(v_u, 0);
    if jsonb_array_length(v_log) <> 1 or v_log->0->>'session' <> v_s::text or v_log->0->'blow'->>'ab' <> 'tail_lash'
       or (v_log->0->'blow'->>'n')::int <> 34 or jsonb_array_length(v_log->0->'recent') <> 1
       or (v_log->0->'saved'->>'level')::int <> 60 or (v_log->0->'xp_lost'->>'level')::int <> 40 then
      raise exception 'death-popup §4(c): the view does not project the death: %', v_log; end if;
    -- and the state envelope carries it
    if (public.hr_state_of(v_u, 0)->'death_log'->0->>'session') is distinct from v_s::text then
      raise exception 'death-popup §4(c): hr_state_of does not carry the new death_log fields'; end if;
    raise exception using errcode = 'HR878', message = 'death-popup §4 complete - rolling back';
  exception when sqlstate 'HR878' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_u) then raise exception 'death-popup §4: LEAKED a probe row'; end if;
  -- (d) No client role reaches the sanitizer.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_death_why(jsonb)', 'execute') then
      raise exception 'death-popup §4(d): % reaches hr_death_why', v_role; end if;
  end loop;
end $mig$;
