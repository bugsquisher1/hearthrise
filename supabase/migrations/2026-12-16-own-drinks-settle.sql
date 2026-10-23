-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A HERO DRINKS ITS OWN DRINKS (lane c-own-drinks-settle,
-- backend-architect, 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §2. Touches the settle's own-supply debit (hunt supplies): in the
-- reopen Security review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The session half of every hunt settle, hr_hunt_settle_session
-- (2026-11-07-store-by-slot.sql:214-215, the live body), accepted the hero's OWN
-- carried uses only of kind `heal` and `ammo`. A crafted drink is kind `mana`
-- (src/data/supplies.js, hr_hunt_supplies), the Hunts window packs it
-- (src/shell/hunt-list.js packFor) and a bar slot drinks it (src/core/action-rules.js
-- resolveLine: a crafted drink comes from the hero's own stock only). So every
-- window that drank one was refused `kind_not_used`, with the browser closed and
-- with the hunt viewed alike (reproduced on the replayed chain:
-- tests/hunt-sessions-settle.mjs OWN-DRINK, item turnip_juice kind mana), and
-- the sixth refusal in a row forfeits the hunt. The rule was written in
-- 2026-10-23-hunt-supply-ledger.sql, before drinks were a hunt supply.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_hunt_settle_session RESTATED WHOLE from the chain end (§0 pins the live
-- image's md5, or this file's OWN-DRINKS marker), byte-for-byte but ONE rule:
-- an own use may be of kind `heal`, `mana` or `ammo`. Exactly the kinds the
-- member applier's per-window lane caps count (hr_hunt_apply_member,
-- 2026-11-16-hunt-density-bounds.sql: food AND drink share the consumable lane,
-- own + store together; §0 asserts that line is there), so a drink is capped,
-- debited and journalled exactly as food is: never past its bag line
-- (bag_short), ONE supply_own row a settle at gold 0, folded into the tally.
-- A `buff` line (a feast, PARKED: src/data/supplies.js) is still never spent
-- (kind_not_used): no lane caps it and no slot can name it.
-- ERROR TAXONOMY (unchanged codes): bad_uses, not_in_bag, bag_short,
-- kind_not_used (now: a buff, or a line with no catalogue kind), and the member
-- applier's too_many_uses before them.
--
-- ── THE CLASS SWEEP ─────────────────────────────────────────────────────────
-- Every chain-end body that filters on a supply kind was read: the lane and day
-- caps (hr_hunt_apply_member) already count `mana`; gold_out already prices the
-- dearest heal/mana store row; the tally fold, the bag debit and slot_dry are
-- kind-blind; heals_out / ammo_out are the only essential kinds (a drink is never
-- essential). `mana` was the one kind the engine spends that the settle refused.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged: the session half runs inside hr_hunt_apply_instance under its
-- instance lock and hr_hunt_lock (the hero row); the bag debit is a single
-- UPDATE under that lock; the settle's intent key and stale-swing check
-- (session_moved) are untouched, so a replayed window still moves nothing.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- A use only DESTROYS a unit the hero packed from its own inventory, and the
-- mana it restores is bounded by the member applier (the magic bound reads
-- drink_mana_per_min_max; the shared food-and-drink lane caps the count). No
-- value can be minted by naming a drink: the debit is capped by the bag line and
-- by the lane. No grant, signature, table or seeded row moves.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_settle_session from 2026-11-07-store-by-slot.sql (§2 there).
-- Ledger rows are append-only history either way.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- None new: a drink use joins the window's ONE supply_own row (meta.items gains
-- a key); no per-use row, no new table.
-- ORDER: after 2026-12-14-shared-farm.sql (last APPLIED; no object in common).
-- EDGE: none (the engine already proposes drink uses). Proof:
-- tests/hunt-sessions-settle.mjs OWN-DRINK (+ mutant). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if not exists (select 1 from public.hr_hunt_supplies where kind = 'mana')
     or not exists (select 1 from public.hr_hunt_lanes where lane = 'consumable' and active) then
    raise exception 'PRECONDITION: the hunt catalogue carries no drink (kind mana) or no consumable lane'; end if;
  -- THE CAP THIS FILE LEANS ON: own drinks share the food lane in the member applier.
  select replace(prosrc, chr(13), '') into v_src from pg_proc
   where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if strpos(v_src, '+ coalesce((v_ukind->>''mana'')::bigint, 0) > v_win / v_cons + 1') = 0 then
    raise exception 'PRECONDITION: hr_hunt_apply_member no longer caps own drinks on the consumable lane'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc
   where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if md5(v_src) <> 'd457034c7b81d082ee3c2ecc522d2764' and strpos(v_src, 'OWN-DRINKS') = 0 then
    raise exception 'PIN: hr_hunt_settle_session is neither the 2026-11-07 store-by-slot image (d457034c...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE SESSION HALF ──────────────────────────────────────────────────────
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
      -- OWN-DRINKS (2026-12-16-own-drinks-settle.sql): a drink (`mana`) is spent from the bag exactly as food is,
      -- the kinds the member applier's lane caps count; a feast (`buff`) never is.
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'mana' and v_kind is distinct from 'ammo' then
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

revoke execute on function public.hr_hunt_settle_session(uuid, integer, uuid, jsonb) from public;
revoke execute on function public.hr_hunt_settle_session(uuid, integer, uuid, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, ROLLED BACK ──────────────────────
-- A probe hero at Mill Cellar packs one drink, one food, one shot and one feast
-- (each the catalogue's first of its kind) and settles windows through
-- hr_hunt_apply_instance itself, the one door the world tick and the player's
-- settle share: (0) the landed body is this file's (md5: a second apply is
-- byte-identical); (a) an own drink lands: the bag debited by exactly the units,
-- ONE supply_own row at gold 0, the tally carries it, the store untouched; (b) own
-- drinks past the window's food-and-drink lane are refused too_many_uses; (c) one
-- past the bag line, inside the lane, is refused bag_short; (d) heal and ammo own
-- uses land as before; (e) a feast is still never spent (kind_not_used); every
-- refusal moves nothing; (f) the last drink empties its line (slot_dry) and the
-- tally sums every own unit; then the grants.
do $$
declare
  v_u     uuid := '000000c0-0000-4000-a000-00000d0d1216';
  v       jsonb;
  v_sid   uuid; v_inst uuid;
  v_at    timestamptz;
  v_gold  bigint;
  v_cap   bigint;   -- own + store food-and-drink uses a 10 s window admits
  v_q     bigint;   -- the drinks packed
  v_drink text; v_food text; v_shot text; v_feast text;
  v_rows  bigint;
  v_src   text;
  v_role  text;
begin
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure;
  if md5(v_src) <> '07d806dc20d0aec69469eab02984cc8e' or strpos(v_src, 'OWN-DRINKS') = 0 then
    raise exception 'VERIFY(0): hr_hunt_settle_session is not this file''s body (md5 %)', md5(v_src); end if;
  select min(s.item_id) filter (where s.kind = 'mana'), min(s.item_id) filter (where s.kind = 'heal'),
         min(s.item_id) filter (where s.kind = 'ammo' and s.essential), min(s.item_id) filter (where s.kind = 'buff')
    into v_drink, v_food, v_shot, v_feast
    from public.hr_hunt_supplies s join public.hr_items i on i.item_id = s.item_id;
  v_cap := 10000 / (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active) + 1;
  if v_drink is null or v_food is null or v_shot is null or v_feast is null or v_cap < 3 then
    raise exception 'VERIFY: harness: the catalogue gives drink %, food %, shot %, feast %, a 10 s lane of %', v_drink, v_food, v_shot, v_feast, v_cap; end if;
  v_q := v_cap + 3;
  begin
    execute $f$
      create function pg_temp.hr_odr_probe(p_user uuid, p_win_ms bigint, p_uses jsonb) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      declare v_s public.hunt_sessions%rowtype; v_i public.hunt_instances%rowtype; v_to timestamptz; v_n bigint; v_t bigint;
              v_s0 bigint; v_ver bigint; v_g text; v_w text;
      begin
        select * into v_s from public.hunt_sessions where user_id = p_user and slot = 0 and ended_at is null;
        if v_s.id is null then return jsonb_build_object('ok', false, 'error', 'probe_no_hunt'); end if;
        select * into v_i from public.hunt_instances where id = v_s.instance_id;
        select ground_id into v_g from public.hr_hunt_grounds where hunt_id = v_i.hunt_id;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_to := v_i.settled_to + make_interval(secs => p_win_ms / 1000.0);
        v_n := p_win_ms / v_t;
        -- a well-formed world of the catalogue's shape, this instance's ground and swing
        select jsonb_build_object('v', w.version, 's', w.shape, 'w', jsonb_build_array(v_g, v_i.world_swing + v_n),
                 'u', '[]'::jsonb, 'p', '[]'::jsonb)::text into v_w
          from public.hr_hunt_world_shape w where w.id;
        v_s0 := public.hr_stamina_of(p_user, 0, v_s.settled_to);
        select version into v_ver from public.player_state where user_id = p_user and slot = 0;
        return public.hr_hunt_apply_instance(v_i.id, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + v_n, 'world', v_w),
          jsonb_build_array(jsonb_build_object('user', p_user, 'slot', 0, 'session', v_s.id, 'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_to, 'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
              'meta', jsonb_build_object('ms', p_win_ms, 'ticks', v_n, 'kills', 1, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_to))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + v_n, 'to', v_to, 'next_swing_at', v_to,
              'uses', p_uses, 'paid_ms', v_n * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'death', '[]'::jsonb, 'rare_drop', '[]'::jsonb),
              'ended', null, 'buys', '{}'::jsonb, 'cover', '{}'::jsonb, 'stamina', greatest(0, v_s0 - v_n * v_t),
              'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null)), null, null);
      end $b$ $f$;
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'own-drinks-settle §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_u, 0, v_drink, v_q), (v_u, 0, v_food, 5), (v_u, 0, v_shot, 5), (v_u, 0, v_feast, 2)
    on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v := public.hr_hunt_enter(0, 'mill_cellar', jsonb_build_array(
           jsonb_build_object('item', v_drink, 'qty', v_q), jsonb_build_object('item', v_food, 'qty', 5),
           jsonb_build_object('item', v_shot, 'qty', 5), jsonb_build_object('item', v_feast, 'qty', 2)), 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_hunt_enter refused: %', v; end if;
    v_sid := (v->'session'->>'id')::uuid;
    select instance_id into v_inst from public.hunt_sessions where id = v_sid;
    v_at := date_trunc('second', now() - interval '10 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_sid;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_inst;
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    -- (a) two own drinks in a window: accepted, debited, journalled once at no gold.
    v := pg_temp.hr_odr_probe(v_u, 10000, jsonb_build_object(v_drink, 2));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): an own drink was refused: %', v; end if;
    if (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_drink) is distinct from v_q - 2 then
      raise exception 'VERIFY(a): the drink line holds %, want %', (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_drink), v_q - 2; end if;
    if (select count(*) from public.player_ledger where session_id = v_sid and kind = 'hunt' and intent = 'supply_own'
          and coalesce(gold, 0) = 0 and qty = -2 and meta->'items' = jsonb_build_object(v_drink, 2)) <> 1 then
      raise exception 'VERIFY(a): the drinks are not one supply_own row of 2 at no gold'; end if;
    if (select (supplies->>v_drink)::numeric from public.hunt_session_tally where session_id = v_sid) is distinct from 2 then
      raise exception 'VERIFY(a): the tally''s own supplies are %', (select supplies from public.hunt_session_tally where session_id = v_sid); end if;
    if exists (select 1 from public.player_ledger where session_id = v_sid and intent = 'supply_buy') then
      raise exception 'VERIFY(a): an own drink was bought from the store'; end if;
    select count(*) into v_rows from public.player_ledger where session_id = v_sid;
    -- (b) one past the window's food-and-drink lane, with the bag holding enough: too_many_uses.
    v := pg_temp.hr_odr_probe(v_u, 10000, jsonb_build_object(v_drink, v_cap + 1));
    if v->>'error' is distinct from 'too_many_uses' then raise exception 'VERIFY(b): drinks past the lane answered %', v; end if;
    -- (c) one past the bag line, inside a 30 s lane: bag_short.
    v := pg_temp.hr_odr_probe(v_u, 30000, jsonb_build_object(v_drink, v_q - 1));
    if v->>'error' is distinct from 'bag_short' then raise exception 'VERIFY(c): a drink past the bag answered %', v; end if;
    if (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_drink) is distinct from v_q - 2
       or (select count(*) from public.player_ledger where session_id = v_sid) <> v_rows
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold then
      raise exception 'VERIFY(b/c): a refused drink moved the bag, the ledger or the purse'; end if;
    -- (d) food and a shot: unchanged.
    v := pg_temp.hr_odr_probe(v_u, 10000, jsonb_build_object(v_food, 1, v_shot, 1));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): own food and a shot were refused: %', v; end if;
    if (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_food) <> 4
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_shot) <> 4
       or (select count(*) from public.player_ledger where session_id = v_sid and intent = 'supply_own' and qty = -2
             and meta->'items' = jsonb_build_object(v_food, 1, v_shot, 1)) <> 1 then
      raise exception 'VERIFY(d): own food and a shot were not debited and journalled as before'; end if;
    select count(*) into v_rows from public.player_ledger where session_id = v_sid;
    -- (e) a feast is never spent by a hunt.
    v := pg_temp.hr_odr_probe(v_u, 10000, jsonb_build_object(v_feast, 1));
    if v->>'error' is distinct from 'kind_not_used' then raise exception 'VERIFY(e): a spent feast answered %', v; end if;
    if (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_feast) <> 2
       or (select count(*) from public.player_ledger where session_id = v_sid) <> v_rows then
      raise exception 'VERIFY(e): a refused feast moved the bag or the ledger'; end if;
    -- (f) the rest of the drinks: the line empties, slot_dry, every own unit tallied.
    v := pg_temp.hr_odr_probe(v_u, 30000, jsonb_build_object(v_drink, v_q - 2));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the last drinks were refused: %', v; end if;
    if (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_drink) <> 0
       or not exists (select 1 from public.hunt_session_events where session_id = v_sid and type = 'slot_dry' and data->>'item' = v_drink) then
      raise exception 'VERIFY(f): the emptied drink line is not dry'; end if;
    if (select (supplies->>v_drink)::numeric from public.hunt_session_tally where session_id = v_sid) is distinct from v_q::numeric
       or (select -sum(qty) from public.player_ledger where session_id = v_sid and kind = 'hunt' and intent = 'supply_own') is distinct from (v_q + 2)::numeric
       or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold then
      raise exception 'VERIFY(f): the tally % or the supply_own rows do not sum the own units, or the purse moved',
        (select supplies from public.hunt_session_tally where session_id = v_sid); end if;
    raise exception using errcode = 'HRODR', message = 'own-drinks-settle §2 complete - rolling back';
  exception when sqlstate 'HRODR' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or to_regprocedure('pg_temp.hr_odr_probe(uuid,bigint,jsonb)') is not null then
    raise exception 'VERIFY: §2 LEAKED a probe row or function'; end if;
  -- the grants: the session half stays the owner's alone; the instance settle hr_engine's.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'execute') then
      raise exception 'VERIFY: % may run the session half of the settle', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
    raise exception 'VERIFY: hr_engine lost the instance settle'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'own-drinks-settle: an own drink is spent from the bag like food, capped by its line and the food-and-drink lane; a feast never is';
end $$;
