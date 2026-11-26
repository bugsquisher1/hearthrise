-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1025-own-heroes-apart.sql — AN ACCOUNT'S OWN HEROES END TOGETHER ONLY IF THE PLAYER SAYS SO
--   (lane/c-carry-on, systems-engineer, 2026-11-20; build plan L07, docs/design/balance-program/30-plan.md §D: "Own heroes end together
--   only if you say so"; 27-retention.md "For other dives", 21 combat: REAL, 99 of 249 hunts ended because another hero of the same
--   account left; "Leave if anyone leaves" is on by default and one hero's stamina ends four hunts).
--
-- STATUS: supabase/migration-notes/1025-own-heroes-apart.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after 1024-carry-on.sql; neither
-- needs the other). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
-- The box "Leave if anyone leaves the hunt or dies" (2026-12-18-party-leave-together.sql, Tyler 2026-10-22) keeps its one meaning and its
--   one writer (hr_party_leave_together_set). What changes is a hero whose player has NOT said: it now reads
--     on   in a party that holds another account's hero (the 10-22 default for friends, unchanged), and
--     off  in a party of the account's own heroes alone (the player's own four hunt on when one of them stops).
--   A box the player ticked or unticked is that answer everywhere, as before.
-- player_state.party_leave_together: NOT NULL DEFAULT true -> NULLABLE, no default; null = "not said". FIRST APPLY ONLY: every true (the
--   default nobody chose apart from a rare tick) becomes null, so today's heroes read the new default at once; an untick (false) stays.
--   A player who had ticked it on loses that tick (say so in the release note: CLAUDE.md §1 no back-compat; Tyler 11-07 be transparent).
-- hr_party_leave_together_of(p_user, p_slot, p_party) -> boolean   NEW, owner-only, the ONE reading of the box: its value when said,
--   else whether p_party seats a hero of another account. Read by the three places that read the box, two by ONE ANCHORED SPLICE
--   (each anchor must match exactly once, or the file raises; nothing else in any body moves; pins in §0) and one RESTATED WHOLE (§2b):
--     hr_hunt_instance_read   each member's `leave_together`, the engine's input (combat-sim.js cascadeFrom; the engine is untouched)
--     hr_hunt_settle_session  the cascade end's proof, party_member_died and party_member_left (2 sites): the same reading the engine had;
--                             restated whole (§2b), its chain being 5 splices deep (tests/patch-chain-guard.mjs PATCH-1)
--     hr_hunt_party_view      the viewer's own box, the party panel's checkbox
--   The engine and its proof read the same function in the same settle, so they agree; a party that changes between the read and the
--   commit is refused end_not_proven and the next settle reads it again (the 2026-12-18 concurrency rule, unchanged).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The column change and its update run once (only while the column is NOT NULL). A second apply finds every body at its post pin and
--   splices nothing, restates the same helper: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- None new: no verb, grant or write path. A cascade end can still only STOP value (the proof), never mint it; nobody can end another
--   hero's hunt. Reading the party's seats is the server's own row.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- On the settle path: one plpgsql function (planned once a backend) a member per instance read and per cascade proof, one indexed probe of the party's seats
--   (hunt_party_members by party) when the box is not said. No new statement, row or journal row.
--
-- EDGE: none (the engine reads the same key, a boolean). CLIENT: none (the party panel shows the server's box).
-- GUARDS: tests/carry-on.mjs CO-APART (the engine, browser closed: own heroes hunt on; ticked, they go home together; friends, as before);
--   tests/hunt-sessions-settle.mjs PARTY-LEAVE (re-anchored: two accounts, the 10-22 default on).
-- REVERSIBLE: re-apply the three pre-image bodies (§0 pins them), drop the helper, set the column back NOT NULL DEFAULT true after
--   update ... set party_leave_together = true where party_leave_together is null.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together')
     or to_regclass('public.hunt_party_members') is null then
    raise exception 'PRECONDITION: apply 2026-12-18-party-leave-together.sql first'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '6d18331b1ac584cc55763515039565f4', '0b3c4e82711f295c68f040eb5b684bcf'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '6e3a7682baf3d6d14c32fac1e65df663', '0960aa8565d01e4e28b8357f15634f90'),
    ('public.hr_hunt_party_view(uuid,integer)', '5f757059dc037b465c1c65a3da94ad5c', '3457eceb61842396d1ad70b287578cae')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- A RETRY AFTER 1046-settle-plans.sql (staged after this file) finds the instance read at 1046's image: this file's splice
    -- already in it, plus 1046's two offset-0 fences. The splice below then finds its post text and moves nothing. After
    -- 1053-lever-gates.sql, at 1053's: the same, plus its hold seat read (hr_party_hold_played). After 1056-danger-scale.sql, at
    -- 1056's: the same, plus the frozen stance in the overlay. After 1059-no-party-finder.sql, the party view at 1059's image:
    -- this file's splice in it, its `listed` key gone. After 1062-store-step.sql, hr_hunt_settle_session at 1062's image: this
    -- file's body with its gold_out proof priced at the store step; this file restates its own, and 1062's retry splices it back.
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_instance_read(uuid,integer)'
                and v_md5 in ('43c031340d414ede76522755f7060233', '01b65ee3b44238d75fefb3aaedca260d', '3097347b88e3a5187f2f12cf0d7fbcae', 'e0b569fcc3d856126934683a2129363e'))
       and not (v_r.fn = 'public.hr_hunt_party_view(uuid,integer)' and v_md5 = '51c2dbe73785787db539af70fd58c885')
       and not (v_r.fn = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)' and v_md5 = 'a2991dfe16b083693b702f7a910ede1e') then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE BOX MAY BE UNSAID ─────────────────────────────────────────────────
do $mig$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together') = 'NO' then
    alter table public.player_state alter column party_leave_together drop not null;
    alter table public.player_state alter column party_leave_together drop default;
    update public.player_state set party_leave_together = null where party_leave_together;
  end if;
end $mig$;

-- ── §2 THE ONE READING ───────────────────────────────────────────────────────
-- In the plan-cache shape (tools/gen-plan-cache.mjs): a settle calls it once a member a read, and a LANGUAGE sql body with a SET clause is
-- planned again on every call on PostgreSQL 17 (tests/settle-budget.mjs SB-3); plpgsql plans it once per backend.
create or replace function public.hr_party_leave_together_of(p_user uuid, p_slot int, p_party uuid)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
-- OWN-HEROES-APART (1025-own-heroes-apart.sql): the hero's box when its player said, else on only beside another account's hero.
#variable_conflict use_column
begin
  return (select hr_q.v from (
  select coalesce((select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
                  exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_user))
  ) as hr_q(v) limit 1);
end
$fn$;
revoke execute on function public.hr_party_leave_together_of(uuid, int, uuid) from public, anon, authenticated, service_role;

-- ── §2b hr_hunt_settle_session, RESTATED WHOLE (tests/patch-chain-guard.mjs PATCH-1) ─────────────────────
-- Its chain was 5 anchored patches deep since its last full restatement (2027-04-24-tower-climb.sql), so this file writes the
-- whole body instead of a sixth splice: the body the chain holds before this file (§0's pre pin, md5 6e3a7682…), with exactly
-- the two cascade-proof arms changed (party_member_died and party_member_left read hr_party_leave_together_of, as the engine's
-- input does), extracted from the replayed chain and spliced by script (lane/c-next-reds), never retyped. §0's own pin is its
-- md5 (0960aa85…): a second apply restates the same text.
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
  v_held text;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight's end, held for hr_boss_call_step
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
  -- LEVER-HORIZON (1005-lever-horizon.sql): the WINDOW'S setup (hr_hunt_setup_of), the one the engine played: its supply keys
  -- here, its bar (runes_out) and its stop rules (rule) in the end proof below.
  v_supply := public.hr_hunt_setup_of(v_s);
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
      when 'party_member_died' then public.hr_party_leave_together_of(p_user, p_slot, v_s.instance_id)
                                    and exists (select 1 from public.hunt_sessions o
                                                 where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      when 'party_member_left' then public.hr_party_leave_together_of(p_user, p_slot, v_s.instance_id)
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
                              -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall ends the same way.
                              or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id)
      when 'boss_time' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id
                                      and v_end_at >= coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) - c_skew) -- CALL-SERIES: from the FIGHT's start
                            or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id
                                      and v_end_at >= v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) - c_skew)
      -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the Burning Tower's floor ran out of time (src/core/hunt/tower.js). The room's instant is the
      -- engine's world, so it is provable as: a climb, at least one floor's time into it. Like `rule`, it can only stop value.
      when 'floor_time' then exists (select 1 from public.hr_tower_rules r where r.hunt_id = v_s.hunt_id
                                       and v_end_at >= v_s.hunt_from + make_interval(secs => r.floor_limit_ms / 1000.0) - c_skew)
      -- RUNE-SUPPLY (2027-03-24-rune-supply.sql, Tyler 2026-11-08): a spell's slot set to "Leave the hunt" came to cast with none of
      -- the runes it ticks left (src/core/hunt/abilities.js runeFor). Provable as: the session's bar holds that spell (`ended.ability`,
      -- the engine's) switched on and leaving on empty, and no rune it ticks is left in the hunt bag after this window's uses. It can
      -- only stop value, never mint it.
      when 'runes_out' then exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_supply->'bar') = 'array' then v_supply->'bar' else '[]'::jsonb end) e
                                     cross join lateral (select public.hr_hunt_rune_supply(e->'action') as rs) x
                                    where jsonb_typeof(e) = 'object' and e->'action'->>'id' = p_delta->'ended'->>'ability'
                                      and e->'enabled' is distinct from 'false'::jsonb and x.rs->>'onEmpty' = 'leave'
                                      and not exists (select 1 from public.hunt_bag b
                                                       where b.session_id = p_session and x.rs->'own' @> jsonb_build_array(b.item_id)
                                                         and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0))
      -- OUTGROWN (2027-05-28-cellar-outgrown.sql): the hero's Level stands at its ground's ends_at_level or over (the engine reads it off
      -- the hero's Level XP at every boundary). hr_hunt_apply_member applied this window's Level XP before this call, so it is the Level the
      -- end was read at. It can only stop value, never mint it.
      when 'outgrown' then exists (select 1 from public.hr_hunt_grounds g
                                    where g.hunt_id = v_s.hunt_id and g.ends_at_level is not null
                                      and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then case when jsonb_typeof(v_supply->'options'->'stop_rules') = 'array'
                            then jsonb_array_length(v_supply->'options'->'stop_rules') > 0 else false end
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
       or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) + c_skew)
       or exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and v_to > coalesce(v_s.fight_from, v_s.hunt_from) + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then
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

  -- FACTION-STANDING (2027-04-22-faction-standing.sql): this window's hunting time, as this settle proved it, to the hero's standing
  -- or its open swap when the ground pays a side. The server's window and catalogue; no number the engine sent.
  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end = 'boss_felled' and nullif(current_setting('hr.boss_plan', true), '') is not null
        and exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id) then
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): a won fight in a room with a plan is HELD, not closed. hr_boss_call_step
    -- (hr_hunt_apply_member, right after this half) charges the next fight or ends the series, as hr_hunt_apply_instance planned for the room.
    v_held := v_end; v_end := null;
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session))
         || case when v_held is not null then jsonb_build_object('held', v_held) else '{}'::jsonb end;
end $function$;

-- ── §3 THE THREE READERS, ONE ANCHORED SPLICE A SITE ─────────────────────────
-- Each anchor and its replacement are dollar-quoted, so the line a body holds after the splice is written here verbatim (a mutant
-- anchored on it is read against this file: tests/mutant-anchors.mjs).
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)',
     $a$'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),$a$,
     $b$'leave_together', public.hr_party_leave_together_of(h.user_id, h.slot, v_i.id),$b$),
    ('public.hr_hunt_party_view(uuid,integer)',
     $a$    'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot));$a$,
     $b$    'leave_together', public.hr_party_leave_together_of(p_user, p_slot, v_pid));$b$)) t(fn, find, repl) loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the body already reads the helper (its post pin, §0) and the old text is gone
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;
    if v_n <> 1 then raise exception 'SPLICE: % holds its anchor % times, want 1', v_r.fn, v_n; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the column is nullable with no default, and a new hero has said nothing
-- (b) the reading: unsaid beside the account's own hero alone off; unsaid beside another account's hero on; said on / off is that
--     everywhere; no party, off
-- (c) every reader reads the helper and none reads the column itself; the helper is owner-only
-- (d) the party view shows the reading: unsaid in an own party false, ticked true
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000a9a70001';
  v_b constant uuid := '000000c0-0000-4000-a000-0000a9a70002';
  k   constant text := '000000c0-0000-4000-a000-0000a9a7d';
  v jsonb; v_party uuid; v_fn text;
begin
  if (select is_nullable || ':' || coalesce(column_default, '-') from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together') is distinct from 'YES:-' then
    raise exception 'own-apart §4(a): the column is not nullable with no default'; end if;
  foreach v_fn in array array['public.hr_hunt_instance_read(uuid,integer)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
                              'public.hr_hunt_party_view(uuid,integer)'] loop
    if strpos(pg_get_functiondef(v_fn::regprocedure), 'hr_party_leave_together_of(') = 0
       or strpos(pg_get_functiondef(v_fn::regprocedure), 'select ps.party_leave_together') > 0 then
      raise exception 'own-apart §4(c): % does not read the box through the helper', v_fn; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.hr_party_leave_together_of(uuid,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_party_leave_together_of(uuid,integer,uuid)', 'execute') then
    raise exception 'own-apart §4(c): the helper is reachable by a client role'; end if;
  begin
    foreach v_fn in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_fn::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_fn::uuid, 'Probe Apart') on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_fn::uuid, 'own-apart §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_fn, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4: hr_create_character refused: %', v; end if;
    end loop;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4: the second hero refused: %', v; end if;
    -- (a) a new hero has said nothing
    if exists (select 1 from public.player_state where user_id in (v_a, v_b) and party_leave_together is not null) then
      raise exception 'own-apart §4(a): a new hero''s box is said'; end if;
    -- (b) no party: off
    if public.hr_party_leave_together_of(v_a, 0, null) then raise exception 'own-apart §4(b): a hero in no party reads on'; end if;
    -- an own party of two
    v := public.hr_hunt_party_invite_own(0, 1, (k || '001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-apart §4(b): the own invite answered %', v; end if;
    v_party := public.hr_hunt_party_of(v_a, 0);
    if public.hr_party_leave_together_of(v_a, 0, v_party) or public.hr_party_leave_together_of(v_a, 1, v_party) then
      raise exception 'own-apart §4(b): an own party reads on unsaid'; end if;
    -- (d) the party panel shows it
    if (public.hr_hunt_party_view(v_a, 0)->>'leave_together') is distinct from 'false' then
      raise exception 'own-apart §4(d): the own party''s panel reads %', public.hr_hunt_party_view(v_a, 0)->'leave_together'; end if;
    -- another account's hero in the seats: on, unsaid
    insert into public.hunt_party_members (party_id, user_id, slot, seat) values (v_party, v_b, 0, 3);
    if not public.hr_party_leave_together_of(v_a, 0, v_party) or not public.hr_party_leave_together_of(v_b, 0, v_party) then
      raise exception 'own-apart §4(b): a party with a friend reads off unsaid'; end if;
    -- said: that everywhere
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_party_leave_together_set(0, false, (k || '002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_party_leave_together_of(v_a, 0, v_party) then
      raise exception 'own-apart §4(b): an untick beside a friend reads on (%)', v; end if;
    delete from public.hunt_party_members where party_id = v_party and user_id = v_b;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_party_leave_together_set(1, true, (k || '003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or not public.hr_party_leave_together_of(v_a, 1, v_party) then
      raise exception 'own-apart §4(b): a tick in an own party reads off (%)', v; end if;
    if (public.hr_hunt_party_view(v_a, 1)->>'leave_together') is distinct from 'true' then
      raise exception 'own-apart §4(d): the ticked hero''s panel reads %', public.hr_hunt_party_view(v_a, 1)->'leave_together'; end if;
    raise exception using errcode = 'HRA11', message = 'own-apart §4 complete - rolling back';
  exception when sqlstate 'HRA11' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from auth.users where id in (v_a, v_b)) then
    raise exception 'own-apart §4: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'own-apart §4 OK: the box may be unsaid, own heroes read off and friends on unsaid, a said box is itself everywhere, the three readers read it once';
end $chk$;
