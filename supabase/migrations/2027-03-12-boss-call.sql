-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-12-boss-call.sql — CALL OUT: A PARTY PAYS TO FIGHT A STRONGER COPY OF A GROUND'S BOSS, FOR NOTHING BUT THE FIGHT
--   (lane/c-boss-call, systems-engineer, 2026-11-05; Tyler approved it 2026-11-04; designer's verdict: PRIORITY_BOARD "The boss call").
--
-- STATUS: STAGED. Pre-EA: applies on its passing §6 (CLAUDE.md §2), one file via the Coordinator's apply tool, never inside begin/commit.
-- MONEY (a gold sink): ON THE EA SECURITY LIST (§3.7). ORDER: right after 2027-03-12-boss-call-hunts-catalogue.generated.sql, 2027-03-12-boss-call-hunt-sessions-catalogue.generated.sql
-- and 2027-03-12-boss-call-titles-catalogue.generated.sql (hr_hunts' rooms, hr_boss_calls, END_ORDER's two ends, the two titles; §0 refuses the first two).
-- EDGE: the hr-accrue that plays the room (src/core/combat-sim.js, hunt-rewards.js). Either order is safe: no world shape moves, and the old engine never sees a room until the
-- client half presses the verb. CLIENT: src/session/boss-intents.js, src/shell/windows/boss-call-pane.js, after this applies.
--
-- ── THE MONEY LINE ───────────────────────────────────────────────────────────
-- Tyler ruled out buying rare drops, so this fight CANNOT pay XP, coin or any drop. A called row has xp 0, gp [0, 0], drops [] (gen-hunt-sessions refuses anything else, and its bounds are
-- 0); the engine has one door for a called swing and it pays nothing (hunt-rewards.js calledSwing); and here the settle refuses a window on a called room whose delta holds anything but the
-- allowlist below, before hr_apply writes a thing (`called_pays`, hr_boss_call_pays). A new payout route fails closed: it is not on the list. tests/boss-call.mjs holds all three.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_boss_call_quote(user, slot, call): the call as the server prices it, on the server clock, or why not (call_party, call_leader, call_limit). Per ACCOUNT per UTC day: it counts
--   the shop rows by user_id across slots, whichever hero led.
-- hr_boss_call_view(slot, call): that quote for the ground's page, read while the page is open (never in the envelope: an idle hero costs no read).
-- hr_boss_call(slot, call, price, key): MONEY. The party row, then hr:boss:<uid> (a second press on this account waits and counts this one), re-quote, `quote_changed` if the price the
--   player saw moved; hr_hunt_party_start under the room's GUC, every member or none; THEN ONE hr_apply {gold: -price} journalled kind `shop`, intent boss_call:<call>:<price>, on the
--   leader's key (a replay charges once). A refused start charges nothing; a purse that can't pay raises and rolls every seat back out.
-- hr_hunt_admit: a called room has ONE door. Every other way in (hr_hunt_enter, hr_hunt_party_start, hr_hunt_restart, hr_hunt_change, a member's join, the ready line) asks this and answers
--   `call_only`. The GUC hr.boss_call is set only by hr_boss_call, for its own transaction; no client role can set a GUC.
-- hr_hunt_settle_session: proves the room's two ends and owes the limit. The kill can't be seen from here (a called kill journals nothing); like `rule`, it can only stop value. FOR THE EA REVIEW:
--   a compromised engine could end a fight `boss_felled` and write the title's counter. What that buys is a title at price 0, with no value attached.
-- hunt_session_tally.fight (hr_hunt_apply_member, hr_hunt_view): THE RECORD OF A FIGHT, display only (Tyler 2026-11-05: a losing line naming the phase). Where the boss stood as the last window closed and
--   what this hero's bar fired (accrual.js fightOf). Only a called room's window may carry one (hr_boss_fight_ok); it stays null on every other hunt, so no other section grows by a byte.
-- hr_bestiary_of: leaves a called row out, so the Bestiary, the charms and the trophies never count him. His counter, ev:kill_monster:<called row>, is the title's alone (hr_title_kills).
-- hr_boss_call_felled (trigger): the prize's System line, once a fight, in the Hearth's shape: the name is stamped, the body the server's.
-- hr_boss_call_closed (trigger): when the room empties, the party stands on the ground it pressed from. Never waits for the party row (FOR UPDATE SKIP LOCKED): a settle holds the characters,
--   and every party verb takes the party row first. A row it skips is rewritten by the next Start.
--
-- COST: one primary-key probe of a two-row catalogue per enter and per settle; one nullable jsonb column, read with the tally row hr_hunt_view already reads; a trigger whose WHEN reads only the row. No new player table (ledger rows are the count: the 3 a day never
-- outlives retain_days). REVERSIBLE: restate the four touched bodies from their pre-images; drop the verb, view, quote, triggers. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_boss_calls') is null or not exists (select 1 from public.hr_boss_calls)
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'boss_felled')
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'boss_time') then
    raise exception 'PRECONDITION: apply 2027-03-12-boss-call-hunt-sessions-catalogue.generated.sql first (hr_boss_calls, END_ORDER''s two ends)'; end if;
  if exists (select 1 from public.hr_boss_calls c where not exists (select 1 from public.hr_hunts h where h.hunt_id = c.hunt_id)) then
    raise exception 'PRECONDITION: apply 2027-03-12-boss-call-hunts-catalogue.generated.sql first (a room is not in hr_hunts)'; end if;
end $mig$;

-- ── §1 THE ONE DOOR (hr_hunt_admit, one splice; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_admit(uuid,integer,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-OUT') = 0 then
    v_old := $a$  select training into v_training from public.hr_hunt_travel where hunt_id = p_hunt;$a$;
    v_new := $a$  -- CALL-OUT (2027-03-12-boss-call.sql): a called room has one door, hr_boss_call, which names the room for its own transaction.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt)
     and current_setting('hr.boss_call', true) is distinct from p_hunt then
    return jsonb_build_object('ok', false, 'error', 'call_only', 'hunt', p_hunt); end if;
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_admit: CALL-OUT anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §2 THE ROOM'S ENDS (hr_hunt_settle_session, RESTATED: its last whole author is 2026-12-16-own-drinks-settle.sql, with 2026-12-18's and 2027-02-11's splices in it; the room's three arms are marked CALL-OUT, every other line verbatim) ─
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
      -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): another member's end (its death:
      -- party_member_died; any other: party_member_left) sends THIS hero home only through its own box
      -- (player_state.party_leave_together, written only by its own hr_party_leave_together_set) and only in an
      -- instance that holds another member: the end can only stop value, never mint it.
      when 'party_member_died' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      when 'party_member_left' then coalesce((select ps.party_leave_together from public.player_state ps
                                               where ps.user_id = p_user and ps.slot = p_slot), false)
                                    and exists (select 1 from public.hunt_sessions o
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
      -- (after this window's coins and cover, written before this call, and its own
      -- store bill, hr.purse_pending, which hr_hunt_apply_instance pays after every
      -- member) is below the dearest store row it could need. ACCOUNT GOLD
      -- (2026-12-15-account-gold.sql): the purse is the ACCOUNT's. A hero sharing this
      -- instance with another hero of its own account spent the one purse in time order
      -- with it, which no per-member read can re-prove: then, like party_member_died,
      -- the end is provable only as "the store was open" — it can only stop value.
      when 'gold_out' then v_store
                       and (exists (select 1 from public.hunt_sessions o
                                     where o.instance_id = v_s.instance_id and o.id <> v_s.id
                                       and o.user_id = p_user and o.hunt_from < v_to
                                       and (o.ended_at is null or o.ended_at > v_s.settled_to))
                            or public.hr_purse_of(p_user)
                           - coalesce(nullif(current_setting('hr.purse_pending', true), '')::bigint, 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where q.kind in ('heal', 'mana')
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0))
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- NO-FIGHT (2027-02-11-no-fight-settle.sql): nobody in the instance landed a blow for the limit's minutes
      -- (the engine's reading of its world). Provable as: hunting that long, and no kill in this window. It can only stop value.
      when 'no_fight' then v_end_at >= v_s.hunt_from + make_interval(mins => public.hr_hunt_limit('no_fight_min'))
                           and not exists (select 1 from public.player_ledger l
                                            where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from
                                              and jsonb_typeof(l.meta->'kills') = 'number' and (l.meta->>'kills')::numeric > 0)
      -- CALL-OUT (2027-03-12-boss-call.sql): the room's ends, on a room only. The kill journals nothing to read (a called kill counts no kills), so, like `rule`, it can only stop value.
      when 'boss_felled' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id)
      when 'boss_time' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id
                                      and v_end_at >= v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) - c_skew)
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
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew)
       -- CALL-OUT: the limit is owed too: no window runs a called room past it.
       or exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then
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

-- ── §3 THE MONEY LINE (hr_boss_call_pays + hr_hunt_apply_member, one splice) ──
-- What a window on a called room may say, and nothing else: the clock, the hero's HP, its journal row with no kill, a death, the stats a death writes, and one kill of the room's own called row
-- (the counter his title reads). An allowlist, so a new payout route is refused until someone decides it belongs here. Answers the first thing it found, or null.
create or replace function public.hr_boss_call_pays(p_delta jsonb, p_monster text)
returns text language plpgsql immutable set search_path = public, pg_catalog as $$
declare v_k text; v_op jsonb;
begin
  select k into v_k from jsonb_object_keys(p_delta) k where k not in ('accrued_to', 'hp', 'journal', 'progress', 'deaths') limit 1;
  if v_k is not null then return v_k; end if;
  if coalesce((p_delta->'journal'->'meta'->>'kills')::numeric, 0) <> 0 or (p_delta->'journal'->'meta') ? 'km' then return 'kills'; end if;
  for v_op in select value from jsonb_array_elements(case when jsonb_typeof(p_delta->'progress') = 'array' then p_delta->'progress' else '[]'::jsonb end) loop
    continue when v_op->>'kind' = 'stat' and v_op->>'key' = 'deaths';
    continue when v_op->>'kind' = 'stat' and v_op->>'key' = 'ev:kill_monster:' || p_monster and v_op->>'period' = '' and v_op->>'add' = '1';
    return 'progress:' || coalesce(left(v_op->>'key', 48), '?');
  end loop;
  return null;
end $$;
revoke execute on function public.hr_boss_call_pays(jsonb, text) from public, anon, authenticated, service_role;

-- THE RECORD OF A FIGHT: display only. Null on every other hunt.
alter table public.hunt_session_tally add column if not exists fight jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_fight_ck' and conrelid = 'public.hunt_session_tally'::regclass) then
    alter table public.hunt_session_tally add constraint hunt_session_tally_fight_ck
      check (fight is null or (jsonb_typeof(fight) = 'object' and octet_length(fight::text) <= 2048));
  end if;
end $mig$;

-- Is `p` what accrual.js fightOf says, on a room that has fights? { boss_pm: 0..1000, fired: { ability|eat|drink: n } }, and nothing else.
create or replace function public.hr_boss_fight_ok(p jsonb, p_hunt text)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $$
begin
  if not exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt) then return false; end if;
  if jsonb_typeof(p) <> 'object' or exists (select 1 from jsonb_object_keys(p) k where k not in ('boss_pm', 'fired')) then return false; end if;
  if jsonb_typeof(p->'boss_pm') is distinct from 'number' or (p->>'boss_pm') !~ '^[0-9]{1,4}$' or (p->>'boss_pm')::int > 1000 then return false; end if;
  return public.hr_hunt_tally_ok(jsonb_build_object('fired', coalesce(p->'fired', '{}'::jsonb)), array['fired']);
end $$;
revoke execute on function public.hr_boss_fight_ok(jsonb, text) from public, anon, authenticated, service_role;

do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-OUT') = 0 then
    -- THE RECORD: only a called room's window may carry one, and it folds with the tally (the last window's boss, the sum of what fired).
    v_old := $a$k not in ('dealt', 'taken', 'healed'))$a$;
    v_new := $a$k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the record''s check anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb))$a$;
    v_new := v_old || $a$,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: the record''s write anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.$a$;
    v_new := $a$  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;

$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: CALL-OUT anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- THE RECORD READS WITH THE TALLY (hr_hunt_view, one splice): a key only on a session that has one, so every other hunt's section stays as it was.
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_view(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-OUT') = 0 then
    v_old := $a$'bought', t.bought, 'supply_gold', t.supply_gold)$a$;
    v_new := v_old || $a$ || case when t.fight is null then '{}'::jsonb else jsonb_build_object('fight', t.fight) end -- CALL-OUT (2027-03-12-boss-call.sql)$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_view: CALL-OUT anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- THE BESTIARY NEVER COUNTS HIM (hr_bestiary_of, one splice): its sweep feeds the Bestiary, the charms and the trophies. His counter is the title's alone (hr_title_kills reads the key by name),
-- and hr_renown_of already joins hr_activities, which holds no called row.
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_bestiary_of(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CALL-OUT') = 0 then
    v_old := $a$     and pp.key like 'ev:kill_monster:%'$a$;
    v_new := v_old || $a$
     and pp.key not like '%\_called' -- CALL-OUT (2027-03-12-boss-call.sql): a called boss is no Bestiary entry$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_bestiary_of: CALL-OUT anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §4 THE QUOTE, THE PAGE'S READ AND THE VERB ───────────────────────────────
create or replace function public.hr_boss_call_quote(p_user uuid, p_slot int, p_call text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r public.hr_boss_calls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype; v_seats int := 0; v_used int; v_why text;
begin
  select * into r from public.hr_boss_calls where call_id = p_call;
  if not found then return null; end if;
  v_used := (select count(*) from public.player_ledger l
              where l.user_id = p_user and l.kind = 'shop' and l.intent like 'boss\_call:%' and l.at >= public.hr_utc_day_start(now()))::int;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party;
    v_seats := (select count(*) from public.hunt_party_members m where m.party_id = v_party)::int;
  end if;
  v_why := case when v_party is null or v_p.closed_at is not null or v_seats < r.party_min then 'call_party'
                when not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader'
                when v_used >= r.per_day then 'call_limit' end;
  return jsonb_build_object('call', r.call_id, 'available', v_why is null, 'why', v_why, 'price', r.fee,
                            'used', v_used, 'per_day', r.per_day, 'left', greatest(0, r.per_day - v_used), 'seats', v_seats, 'party_min', r.party_min);
end $$;
revoke execute on function public.hr_boss_call_quote(uuid, int, text) from public, anon, authenticated, service_role;

create or replace function public.hr_boss_call_view(p_slot int, p_call text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_q jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot) then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_q := public.hr_boss_call_quote(v_uid, p_slot, p_call);
  if v_q is null then return jsonb_build_object('ok', false, 'error', 'call_unknown'); end if;
  return jsonb_build_object('ok', true, 'quote', v_q);
end $$;
revoke execute on function public.hr_boss_call_view(int, text) from public;
revoke execute on function public.hr_boss_call_view(int, text) from anon, service_role;
grant  execute on function public.hr_boss_call_view(int, text) to authenticated;

create or replace function public.hr_boss_call(p_slot int, p_call text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'boss_call';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_c public.hr_boss_calls%rowtype; v_party uuid; v_ver bigint; v_a jsonb; v_no jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_c from public.hr_boss_calls where call_id = p_call;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'call_unknown')); end if;
  v_verb := 'boss_call:' || p_call || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCKS: the party row (every party verb's first), then this account's key, so a second press on any of its heroes waits and counts this one. No other path takes this key.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then perform 1 from public.hunt_parties p where p.id = v_party for update; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:boss:' || v_uid::text, 0));
  v_q := public.hr_boss_call_quote(v_uid, p_slot, p_call);
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'boss_call', v_q)); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'boss_call', v_q)); end if;
  -- EVERY MEMBER OR NONE, AND THE CHARGE WITH THEM: a start that can't pay rolls every seat back out.
  begin
    perform set_config('hr.boss_call', v_c.hunt_id, true);
    -- Its own key: this one is the charge's, and a replay of it must answer the charge (hr_hunt_party_start journals what it was asked under).
    v_r := public.hr_hunt_party_start(p_slot, v_c.hunt_id, md5('boss_call:start:' || p_idem::text)::uuid);
    perform set_config('hr.boss_call', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      v_no := v_r; raise exception using errcode = 'HR879', message = 'call_refused'; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_call', 'call', p_call, 'n', (v_q->>'used')::int + 1, 'party', v_party, 'hunt', v_c.hunt_id))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'call_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.boss_call', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'entered', v_r->'entered', 'party', v_r->'party',
                            'boss_call', public.hr_boss_call_quote(v_uid, p_slot, p_call));
end $$;
revoke execute on function public.hr_boss_call(int, text, bigint, uuid) from public;
revoke execute on function public.hr_boss_call(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_boss_call(int, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_boss_call', 'hr_boss_call_view');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_boss_call', 'p_slot integer, p_call text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-03-12 (lane/c-boss-call): MONEY (a gold sink) - the party leader pays the server''s fee and the party enters the called room; refuses quote_changed; 3 a UTC day an account'),
  ('hr_boss_call_view', 'p_slot integer, p_call text', 'authenticated',
   'added 2027-03-12 (lane/c-boss-call): read - the call as the server prices it, for the ground''s page while it is open');

-- ── §5 THE PARTY'S GROUND AFTER THE ROOM ─────────────────────────────────────
create or replace function public.hr_boss_call_closed()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_from text;
begin
  select c.from_hunt into v_from from public.hr_boss_calls c where c.hunt_id = new.hunt_id;
  if v_from is null or exists (select 1 from public.hunt_sessions h where h.instance_id = new.instance_id and h.ended_at is null) then return null; end if;
  -- NEVER WAITS: this runs inside a settle holding the characters, and every party verb takes the party row first.
  update public.hunt_parties p set hunt_id = v_from
   where p.id = (select q.id from public.hunt_parties q where q.id = new.instance_id and q.hunt_id = new.hunt_id for update skip locked);
  return null;
end $$;

-- THE SYSTEM LINE: once a fight, on the first hero its close finds still standing and named (never a quiet hero), in the Hearth's shape: from_name is stamped by hr_chat_name_authority, the body is the server's.
create or replace function public.hr_boss_call_felled()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_call public.hr_boss_calls%rowtype;
begin
  select * into v_call from public.hr_boss_calls c where c.hunt_id = new.hunt_id;
  if not found or coalesce((select ps.presence_quiet from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot), false)
     or exists (select 1 from public.hunt_sessions h where h.instance_id = new.instance_id and h.id <> new.id and h.end_reason = 'boss_felled' and h.ended_at = new.ended_at) then return null; end if;
  insert into public.chat_messages (channel, from_id, from_name, from_slot, body)
    values ('system', new.user_id, 'Adventurer', new.slot,
            'and party called out ' || case v_call.call_id when 'rat_king' then 'the Rat King' when 'chief_coppercap' then 'Chief Coppercap' else 'a boss' end || ' and brought him down.');
  return null;
end $$;
revoke execute on function public.hr_boss_call_felled() from public, anon, authenticated, service_role;
drop trigger if exists hr_boss_call_felled on public.hunt_sessions;
create trigger hr_boss_call_felled after update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.end_reason = 'boss_felled' and right(new.hunt_id, 7) = '_called')
  execute function public.hr_boss_call_felled();
revoke execute on function public.hr_boss_call_closed() from public, anon, authenticated, service_role;
drop trigger if exists hr_boss_call_closed on public.hunt_sessions;
create trigger hr_boss_call_closed after update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.ended_at is not null and right(new.hunt_id, 7) = '_called')
  execute function public.hr_boss_call_closed();

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_a constant uuid := '000000d6-0000-4000-a000-00007f0c0a01';   -- the leader
  c_b constant uuid := '000000d6-0000-4000-a000-00007f0c0a02';   -- a seated member
  k   constant text := '000000d6-0000-4000-b000-0000';
  v jsonb; v_pid uuid; v_s text; v_fee bigint; v_hunt text; v_from text;
begin
  -- (a) the shape: a signed-in client asks, nobody else; hygiene STRICT is green; every splice is in.
  foreach v_s in array array['public.hr_boss_call(integer,text,bigint,uuid)', 'public.hr_boss_call_view(integer,text)'] loop
    if has_function_privilege('anon', v_s, 'execute') or has_function_privilege('service_role', v_s, 'execute') or not has_function_privilege('authenticated', v_s, 'execute') then
      raise exception 'boss-call §6(a): the grants on % are wrong', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_call_pays(jsonb,text)', 'public.hr_boss_call_closed()', 'public.hr_boss_call_felled()'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then raise exception 'boss-call §6(a): a client can execute %', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_hunt_admit(uuid,integer,text)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_bestiary_of(uuid,integer)'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'CALL-OUT') = 0 then raise exception 'boss-call §6(a): % has no splice', v_s; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  -- (a2) THE RECORD: a room's own shape, nothing else, and on no other hunt.
  if not public.hr_boss_fight_ok('{"boss_pm":230,"fired":{"fireball":0,"eat":3}}'::jsonb, 'millrace_sewer_called') then raise exception 'boss-call §6(a2): a clean record was refused'; end if;
  foreach v_s in array array['{"boss_pm":1001,"fired":{}}', '{"boss_pm":-1,"fired":{}}', '{"boss_pm":"x"}', '{"boss_pm":5,"gold":9}', '{"boss_pm":5,"fired":{"eat":-1}}', '[]'] loop
    if public.hr_boss_fight_ok(v_s::jsonb, 'millrace_sewer_called') then raise exception 'boss-call §6(a2): % passed', v_s; end if;
  end loop;
  if public.hr_boss_fight_ok('{"boss_pm":230,"fired":{}}'::jsonb, 'millrace_sewer') then raise exception 'boss-call §6(a2): a normal hunt may carry a record'; end if;
  if has_function_privilege('authenticated', 'public.hr_boss_fight_ok(jsonb,text)', 'execute') then raise exception 'boss-call §6(a2): a client can execute the check'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_view(uuid)'::regprocedure), 'CALL-OUT') = 0 then raise exception 'boss-call §6(a2): hr_hunt_view has no splice'; end if;
  -- (b) the money line's reader: the clock and a death pass; every payout is named.
  if public.hr_boss_call_pays('{"accrued_to":"x","hp":1,"journal":{"meta":{"kills":0}},"deaths":[{}],"progress":[{"kind":"stat","key":"deaths"},{"kind":"stat","key":"ev:kill_monster:rat_king_called","period":"","add":1}]}'::jsonb, 'rat_king_called') is not null then
    raise exception 'boss-call §6(b): a clean window reads as paying'; end if;
  foreach v_s in array array['{"gold":1}', '{"items":{"bones":1}}', '{"xp":{"melee":1}}', '{"level_xp":1}', '{"hearthfind":{}}', '{"journal":{"meta":{"kills":1}}}',
                             '{"progress":[{"kind":"stat","key":"kills"}]}', '{"xp_frac":{"melee":0.5}}',
                             '{"progress":[{"kind":"stat","key":"ev:kill_monster:rat_king","period":"","add":1}]}', '{"progress":[{"kind":"stat","key":"ev:kill_monster:rat_king_called","period":"","add":2}]}'] loop
    if public.hr_boss_call_pays(v_s::jsonb, 'rat_king_called') is null then raise exception 'boss-call §6(b): % passed the money line', v_s; end if;
  end loop;

  begin
    update public.hr_hunt_config set enabled = true where id;
    select c.fee, c.hunt_id, c.from_hunt into v_fee, v_hunt, v_from from public.hr_boss_calls c where c.call_id = 'rat_king';
    foreach v_s in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'boss-call §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'boss-call §6-harness: hr_create_character refused: %', v; end if;
    end loop;
    -- (c) a party of one is refused, by name, and nothing moves.
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id = c_a;
    v_pid := public.hr_party_open(c_a, 0);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b01')::uuid);
    if v->>'error' is distinct from 'call_party' then raise exception 'boss-call §6(c): a party of one answered %', v; end if;
    -- (d) a member is refused, by name; a wrong price is quote_changed; neither charges or opens anything.
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_party_seat_into(v_pid, c_b, 0);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b02')::uuid);
    if v->>'error' is distinct from 'call_leader' then raise exception 'boss-call §6(d): a member answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee + 1, (k || '00000b03')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'boss-call §6(d): a stale price answered %', v; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 or exists (select 1 from public.hunt_sessions where instance_id = v_pid) then
      raise exception 'boss-call §6(d): a refusal moved something'; end if;
    -- (e) ★ NO OTHER DOOR: the leader's own Start, and an enter, answer the room's refusal; a normal ground is untouched.
    v := public.hr_hunt_party_start(0, v_hunt, (k || '00000b04')::uuid);
    if v->>'error' is distinct from 'not_ready' or v->'seats'->0->>'error' is distinct from 'call_only' then raise exception 'boss-call §6(e): Start answered %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '00000b05')::uuid);
    if v->>'error' is not distinct from null or coalesce(v->>'ok', '') = 'true' then raise exception 'boss-call §6(e): an enter answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where instance_id = v_pid) then raise exception 'boss-call §6(e): a refused door opened a session'; end if;
    -- (f) ★ THE CALL: the fee from the purse, one shop row, every member in the room, and a replay charges nothing.
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b06')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'boss-call §6(f): the call answered %', v; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee then raise exception 'boss-call §6(f): the purse reads %', (select gold from public.account_wallet where user_id = c_a); end if;
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and hunt_id = v_hunt and ended_at is null) <> 2 then raise exception 'boss-call §6(f): the room does not hold two heroes'; end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_call:rat_king:' || v_fee) <> 1 then raise exception 'boss-call §6(f): not one ledger row'; end if;
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b06')::uuid);
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent like 'boss\_call:%') <> 1 then
      raise exception 'boss-call §6(f): a replay charged again'; end if;
    -- (g) THE ROOM EMPTIES: the party stands on the ground it pressed from, and no restart reaches the room.
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;
    if (select p.hunt_id from public.hunt_parties p where p.id = v_pid) is distinct from v_from then raise exception 'boss-call §6(g): the party stands on %', (select p.hunt_id from public.hunt_parties p where p.id = v_pid); end if;
    -- (g2) ONE SYSTEM LINE for the fight, however many heroes it sent home.
    if (select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id in (c_a, c_b) and m.body like '%called out the Rat King%') <> 1 then
      raise exception 'boss-call §6(g2): the fight posted % System lines', (select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id in (c_a, c_b) and m.body like '%called out the Rat King%'); end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_start(0, v_hunt, (k || '00000b07')::uuid);
    if v->>'error' is distinct from 'not_ready' then raise exception 'boss-call §6(g): a free second Start answered %', v; end if;
    -- (h) A PURSE THAT CAN'T PAY: refused, charged nothing, every seat rolled back out, the door shut behind it.
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = v_fee - 1 where user_id = c_a;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b09')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' then raise exception 'boss-call §6(h): a short purse answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where instance_id = v_pid and ended_at is null) or current_setting('hr.boss_call', true) <> '' then
      raise exception 'boss-call §6(h): a short purse left a hero in the room, or the door open'; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> v_fee - 1 then raise exception 'boss-call §6(h): a refused call charged'; end if;
    -- (i) THE LIMIT, 3 a UTC day: yesterday's rows don't count, today's do, on any of this account's heroes.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      select c_a, 0, 'shop', 'boss_call:rat_king:' || v_fee, 0, '{"reason":"§6 probe"}'::jsonb, public.hr_utc_day_start(now()) - interval '1 second' from generate_series(1, 5);
    if (public.hr_boss_call_quote(c_a, 0, 'rat_king')->>'used')::int <> 1 then raise exception 'boss-call §6(i): yesterday counted'; end if;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      select c_a, 1, 'shop', 'boss_call:rat_king:' || v_fee, 0, '{"reason":"§6 probe"}'::jsonb from generate_series(1, 2);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000b0a')::uuid);
    if v->>'error' is distinct from 'call_limit' then raise exception 'boss-call §6(i): the fourth call answered %', v; end if;
    raise exception using errcode = 'HRL21', message = 'boss-call §6 complete - rolling back';
  exception when sqlstate 'HRL21' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) then raise exception 'boss-call §6: LEAKED a probe row'; end if;
  raise notice 'boss-call: one door, one charge, a room that pays nothing; all green';
end $$;
