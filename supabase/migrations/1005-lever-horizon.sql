-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1005-lever-horizon.sql — EVERY MID-HUNT LEVER THAT MOVES A FIGHT WAITS OUT THE SEEDS THE BROWSER HOLDS
--   (lane/c-server-cost, backend-architect, 2026-11-19; the 11-19 server audit, row 3).
--
-- STATUS: supabase/migration-notes/1005-lever-horizon.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE HOLE ────────────────────────────────────────────────────────────────
-- A settle answer hands the viewer's browser the next 16 combat swings' seeds (src/data/hunt-tuning.js liveSeeds x the 2 s swing =
--   32 s), so the browser can play out the next half minute exactly. 2026-10-31-live-horizon.sql made a leave, a hunt change and a kick
--   wait out that look-ahead. Three other levers still took hold at once, so each could be pulled only when a death showed in the seeds
--   (measured, tests/hunt-sessions-settle.mjs NO-DODGE-LEVERS, before this file: red on all three):
--   · hr_blessing_buy: a Blessing bought then counted for the first window starting after the purchase, which could hold the death
--     (hr_blessing_take counts a Blessing with bought_at <= the window's start): the hunt viewed, its 10 s windows, a 25% cheaper death.
--   · hr_action_set_options (the stance, the bar, any fight option) and hr_hunt_preset_apply (Use of another setup mid-hunt): the
--     next settle read the new bar for its whole window, the swings the browser had already been shown included: the death moved,
--     the hunt viewed AND with the browser closed.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- THE SEED HORIZON. hr_hunt_seed_horizon(session) -> timestamptz   NEW, owner-only: the instance's (or the session's) later of its
--   settled point and its next swing, plus the look-ahead (32 s). Every swing any answer can have shown lies strictly before it: the
--   16th seed is the swing at next_swing_at + 30 s, and its blows land inside that 2 s swing.
-- A BLESSING counts from greatest(now(), the horizon) when a hunt is open (hr_hunt_lever_at), else from now(). ONE SPLICE in
--   hr_blessing_buy (marker LEVER-HORIZON): the row's bought_at is that instant. hr_blessing_take is untouched: it counts a Blessing
--   with bought_at <= the window's start, and every foreseen death d stands at d >= the window's start and d < the horizon, so no
--   foreseen death is ever cut. The Blessing is held at once (the view lists it); it cuts the next death past the horizon.
-- THE SETUP A WINDOW PLAYS. hr_hunt_setup_live(user, slot, preset, hunt) -> jsonb   NEW, owner-only: what the settle read from the
--   live tables: { preset, options, bar, target_kind } || hr_hunt_supply_of (gold_floor, supply_source, on_empty).
--   hr_hunt_setup_of(hunt_sessions) -> jsonb   NEW, owner-only: the setup the window starting at the session's settled_to plays: the
--   hold with the earliest `until` at or after that instant (hunt_setup_holds), else the live one.
-- THE HOLD. public.hunt_setup_holds (session_id, until, setup, at)   NEW TABLE, RLS on, no policy, no client or engine privilege.
--   hr_hunt_setup_hold() -> trigger   NEW, owner-only, SECURITY DEFINER: BEFORE any write that can change what an OPEN session's
--   settle reads, it records the setup as it stood (hr_hunt_setup_live, read before the write lands) with until = the session's seed
--   horizon (raised to its last hold's, so holds only stack forward), once per horizon (a second lever inside one horizon adds none:
--   the first hold already keeps the setup the seeds were shown with). The writes:
--     player_action_sets  insert / delete / an update of options or slots, on the row the open session plays (its preset):
--                         hr_action_set_options, _put, _copy, _delete, hr_hunt_preset_save and _delete and any later writer
--     hunt_sessions       an update of preset on an open session: hr_hunt_preset_apply (Use mid-hunt), hr_hunt_set_preset
--     hunt_density        target_kind on the open session's ground: hr_hunt_target_kind_set (First target)
--   It prunes, each time, every hold no window can still start under (its session ended, gone, or settled past it).
-- THE READERS (each reads the window's setup through hr_hunt_setup_of, so the engine and every re-proof agree):
--   hr_hunt_member_read   RESTATED WHOLE: preset, options, bar, gold_floor, supply_source, on_empty and a target_kind key, all the
--                         window's setup (one hr_hunt_supply_of a member instead of three).
--   hr_hunt_instance_read RESTATED WHOLE: the First target overlay reads the member read's target_kind (still only a kind the ground
--                         fields) and drops the key, so the engine's input is byte-identical when nothing is held.
--   hr_hunt_apply_member  ONE SPLICE: the store's re-check prices under the window's supply setting.
--   hr_hunt_settle_session THREE SPLICES: the end proof's supply setting, `runes_out` (the window's bar) and `rule` (its stop rules).
-- REFUSAL CODES: none new. No verb answers differently: the lever lands, and plays from the first window past its horizon.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Every lever already takes the character lock (hr_hunt_lock) before it writes, and the settle takes it before it reads the window's
--   setup in the apply, so a hold is written and read under one lock. The hold's insert is `on conflict do nothing` on
--   (session_id, until): a replayed lever (its idempotency key answers first) or a second lever inside one horizon adds nothing.
-- A second apply of this file finds every body at its post pin (§0), restates the same text, and re-creates the triggers (drop if
--   exists + create): byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- CLOSES the death dodge by Blessing, by the bar or its options, by a setup switch and by the First target. No new client verb, grant
--   or write path; the new table and functions are owner-only. LEFT OPEN (named for the EA review): a carry-in mid-hunt
--   (hr_hunt_restock adds food to the bag at once) and the party leader's hold seat (hunt_parties.hold_seat) still take hold at the
--   next settle; each needs its own deferral (a pending bag line, an instance-level hold).
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- One hold row (~0.5-1 KB) per lever pulled mid-hunt, pruned at the next lever of anyone; the table holds only live horizons (at
--   100x players, a few hundred rows). Each settle read: one primary-key probe of the holds a member; the read now calls
--   hr_hunt_supply_of once a member instead of three times. Each lever: one open-session probe, the live setup read once, an insert.
--
-- BROWSER: the live view's start point carries the held setup (huntLive reads the same member read), so a prediction after a lever
--   plays the setup the server plays to the horizon, and the next settle past it carries the new one: a display mismatch of at most
--   one window, reconciled by hunt_check (display only, CLAUDE.md §6).
-- EDGE: none (the engine reads the same keys). CLIENT: none needed.
-- GUARDS: tests/hunt-sessions-settle.mjs NO-DODGE-LEVERS (both paths, red before this file on all three levers).
-- REVERSIBLE: re-apply hr_hunt_member_read from 2027-04-23-training-gear.sql, hr_hunt_instance_read from 2027-04-24-tower-climb.sql,
--   remove the LEVER-HORIZON splices (§0 pins the pre images); drop the three triggers, hr_hunt_setup_hold, the helpers and the table.
-- WIPE: hunt_setup_holds holds only live horizons; nothing to keep.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is the image this file was written against (the replayed chain on set/v0.2.143) or this file's own (a second apply):
-- md5 of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hunt_density') is null or to_regclass('public.player_action_sets') is null or to_regclass('public.player_blessings') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_density' and column_name = 'target_kind')
     or to_regprocedure('public.hr_hunt_supply_of(uuid,integer,integer)') is null then
    raise exception 'PRECONDITION: a table, column or helper this file reads is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_member_read(public.hunt_sessions)', 'f44d35ce952efc95e5bbbff709b43f7c', '5cb3d1b94655838354f94555fa81544d'),
    ('public.hr_hunt_instance_read(uuid,integer)', 'cfb26bd60ee7eb29965041ca9354cb25', '6d18331b1ac584cc55763515039565f4'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '9fd093ec7113084292f61ded4c732417', '0e0e304013e75ea2535dbb483c04d570'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '7b6b3171349ee3896a1a380ce0cd0852', '6e3a7682baf3d6d14c32fac1e65df663'),
    ('public.hr_blessing_buy(integer,integer,bigint,uuid)', '1c98a151bf685645e1b4669fcf1c6986', 'd4db88287ce20e6351f1804da90e9ebc')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE HORIZON, THE LEVER'S INSTANT, THE SETUP ───────────────────────────
create or replace function public.hr_hunt_seed_horizon(p_session uuid)
returns timestamptz language sql stable set search_path = public, pg_catalog as $fn$
  -- LEVER-HORIZON (1005-lever-horizon.sql): the instant past every combat swing an answer can have shown for this session's hunt:
  -- the later of the instance's (and the session's) settled point and next swing, plus the look-ahead, liveSeeds (16) x the 2 s
  -- swing (src/data/hunt-tuning.js; the 32 s of 2026-10-31-live-horizon.sql). The 16th seed is the swing at next_swing_at + 30 s.
  select greatest(s.settled_to, s.next_swing_at, i.settled_to, i.next_swing_at) + make_interval(secs => 32000 / 1000.0)
    from public.hunt_sessions s left join public.hunt_instances i on i.id = s.instance_id
   where s.id = p_session
$fn$;
revoke execute on function public.hr_hunt_seed_horizon(uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_lever_at(p_user uuid, p_slot int)
returns timestamptz language sql stable set search_path = public, pg_catalog as $fn$
  -- LEVER-HORIZON: the instant a lever pulled now counts from: now(), or, with a hunt open, no earlier than its seed horizon.
  select greatest(now(), (select public.hr_hunt_seed_horizon(s.id) from public.hunt_sessions s
                           where s.user_id = p_user and s.slot = p_slot and s.ended_at is null))
$fn$;
revoke execute on function public.hr_hunt_lever_at(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_setup_live(p_user uuid, p_slot int, p_preset int, p_hunt text)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
-- LEVER-HORIZON: the setup the settle reads from the live tables for a session playing set p_preset on p_hunt: its options and
-- bar (player_action_sets), its First target there (hunt_density.target_kind) and its supply setting (hr_hunt_supply_of, the one
-- formula). A missing set reads as the member read always did: no options, an empty bar. PLAN-CACHE (tools/gen-plan-cache.mjs's
-- shape, tests/settle-budget.mjs SB-3): the SQL body below, planned once per backend (a SQL function with a SET clause is
-- re-planned on every call on PostgreSQL 17).
#variable_conflict use_column
begin
  return (select hr_q.v from (
  select jsonb_build_object(
           'preset', p_preset,
           'options', coalesce(a.options, '{}'::jsonb),
           'bar', coalesce(a.slots, '[]'::jsonb),
           'target_kind', (select d.target_kind from public.hunt_density d
                            where d.user_id = p_user and d.slot = p_slot and d.hunt_id = p_hunt))
         || public.hr_hunt_supply_of(p_user, p_slot, p_preset)
    from (select 1) one
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p_preset
  ) as hr_q(v) limit 1);
end
$fn$;
revoke execute on function public.hr_hunt_setup_live(uuid, int, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE HOLDS ─────────────────────────────────────────────────────────────
create table if not exists public.hunt_setup_holds (
  session_id uuid        not null,
  until      timestamptz not null,
  setup      jsonb       not null check (jsonb_typeof(setup) = 'object' and octet_length(setup::text) <= 65536),
  at         timestamptz not null default now(),
  primary key (session_id, until)
);
comment on table public.hunt_setup_holds is
  'added 1005-lever-horizon.sql: the setup an open hunt session plays for every window starting at or before `until` (its seed horizon when a lever was pulled), recorded by hr_hunt_setup_hold before the lever''s write; read by hr_hunt_setup_of. Owner-only.';
alter table public.hunt_setup_holds enable row level security;
revoke all on public.hunt_setup_holds from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_setup_of(p_s public.hunt_sessions)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
-- LEVER-HORIZON: the setup the window starting at the session's settled_to plays: the earliest hold at or after that instant
-- (the setup as it stood when the seeds reaching it were shown), else the live one. PLAN-CACHE shape, as hr_hunt_setup_live.
#variable_conflict use_column
begin
  return (select hr_q.v from (
  select coalesce(
           (select h.setup from public.hunt_setup_holds h
             where h.session_id = p_s.id and h.until >= p_s.settled_to order by h.until limit 1),
           public.hr_hunt_setup_live(p_s.user_id, p_s.slot, p_s.preset, p_s.hunt_id))
  ) as hr_q(v) limit 1);
end
$fn$;
revoke execute on function public.hr_hunt_setup_of(public.hunt_sessions) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_setup_hold()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- LEVER-HORIZON (1005-lever-horizon.sql): BEFORE a write that can change what an OPEN session's settle reads lands, record the setup
-- as it stands now, held for every window starting at or before the session's seed horizon. Reads only the server's own rows.
declare
  v_s     public.hunt_sessions%rowtype;
  v_user  uuid; v_slot int; v_preset int; v_hunt text;
  v_set   jsonb;
  v_until timestamptz;
begin
  if tg_table_name = 'hunt_sessions' then
    -- (the WHEN clause admits only an open session's preset switch; OLD is the row before it)
    v_s := old;
  else
    if tg_op = 'DELETE' then
      v_user := old.user_id; v_slot := old.slot;
      if tg_table_name = 'player_action_sets' then v_preset := old.preset; else v_hunt := old.hunt_id; end if;
    else
      v_user := new.user_id; v_slot := new.slot;
      if tg_table_name = 'player_action_sets' then v_preset := new.preset; else v_hunt := new.hunt_id; end if;
    end if;
    select * into v_s from public.hunt_sessions h where h.user_id = v_user and h.slot = v_slot and h.ended_at is null;
    -- no open session, or a write to a set it does not play or a ground it does not hunt: nothing the settle reads moves
    if v_s.id is null or (tg_table_name = 'player_action_sets' and v_s.preset is distinct from v_preset)
       or (tg_table_name = 'hunt_density' and v_s.hunt_id is distinct from v_hunt) then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;
  -- the setup as it stands, read before this write lands
  v_set := public.hr_hunt_setup_live(v_s.user_id, v_s.slot, v_s.preset, v_s.hunt_id);
  -- Gone: every hold no window can still start under (its session ended or gone, or settled past it).
  delete from public.hunt_setup_holds h
   where not exists (select 1 from public.hunt_sessions x where x.id = h.session_id and x.ended_at is null and h.until >= x.settled_to);
  -- Holds only stack forward: never under the session's last one (which already keeps the setup up to it).
  v_until := greatest(public.hr_hunt_seed_horizon(v_s.id),
                      (select max(h.until) from public.hunt_setup_holds h where h.session_id = v_s.id));
  insert into public.hunt_setup_holds (session_id, until, setup) values (v_s.id, v_until, v_set)
    on conflict (session_id, until) do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;
revoke execute on function public.hr_hunt_setup_hold() from public, anon, authenticated, service_role;

drop trigger if exists hr_hunt_setup_hold_ins on public.player_action_sets;
create trigger hr_hunt_setup_hold_ins before insert on public.player_action_sets
  for each row execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_upd on public.player_action_sets;
create trigger hr_hunt_setup_hold_upd before update on public.player_action_sets
  for each row when (old.options is distinct from new.options or old.slots is distinct from new.slots)
  execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_del on public.player_action_sets;
create trigger hr_hunt_setup_hold_del before delete on public.player_action_sets
  for each row execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_preset on public.hunt_sessions;
create trigger hr_hunt_setup_hold_preset before update of preset on public.hunt_sessions
  for each row when (old.preset is distinct from new.preset and old.ended_at is null)
  execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_ins on public.hunt_density;
create trigger hr_hunt_setup_hold_ins before insert on public.hunt_density
  for each row when (new.target_kind is not null) execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_upd on public.hunt_density;
create trigger hr_hunt_setup_hold_upd before update of target_kind on public.hunt_density
  for each row when (old.target_kind is distinct from new.target_kind) execute function public.hr_hunt_setup_hold();
drop trigger if exists hr_hunt_setup_hold_del on public.hunt_density;
create trigger hr_hunt_setup_hold_del before delete on public.hunt_density
  for each row when (old.target_kind is not null) execute function public.hr_hunt_setup_hold();

-- ── §3 THE MEMBER READ AND THE INSTANCE READ (RESTATED WHOLE) ────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_member_read(p_s hunt_sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- LEVER-HORIZON (1005-lever-horizon.sql): the preset, options, bar, supply setting and First target are the WINDOW'S setup
  -- (hr_hunt_setup_of: a lever pulled inside the seed horizon plays from the first window past it); target_kind is the instance
  -- read's to overlay and drop.
  select jsonb_build_object(
    'id', p_s.id, 'hunt', p_s.hunt_id, 'preset', (st.v->>'preset')::int, 'version', p_s.version,
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): in a called room the engine's hunt starts with the FIGHT in progress (its limit and
    -- its quiet clock are a fight's); the series is the server's and the engine never counts one.
    'hunt_from_ms', ceil(extract(epoch from coalesce(p_s.fight_from, p_s.hunt_from)) * 1000)::bigint,
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
    -- TRAINING-GEAR (2027-04-23-training-gear.sql): on a training ground, the item time this window may play (hr_training_gear_budget of
    -- its trained skill); null on any other ground.
    'train_boost_ms', (select public.hr_training_gear_budget(p_s.user_id, p_s.slot, t.skill) from public.hr_training_grounds t where t.hunt_id = p_s.hunt_id),
    -- THE STORE (catalogue). STORE-BY-SLOT (2026-11-04): a bar slot names the ONE item a
    -- use spends (Tyler 2026-10-21); no hunt tier picks one.
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind, 'price', b.price,
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    -- THE HERO'S SETTINGS (options) and BAR, its supply setting and floor: the window's (LEVER-HORIZON).
    'options', st.v->'options',
    'bar', st.v->'bar',
    'gold_floor', (st.v->>'gold_floor')::bigint,
    'supply_source', st.v->>'supply_source',
    'on_empty', st.v->>'on_empty',
    'target_kind', st.v->'target_kind',
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
    from (select public.hr_hunt_setup_of(p_s) as v) st
$function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance carries the session mode the server froze at its start (session_mode),
  -- the engine's only source of it (hunt-settle.js; none, or one it has no row for, and it proposes nothing).
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the instance carries the Burning Tower's floor whose room stands or stands next (tower_floor:
  -- hr_tower_floor_of, the server's own record), the engine's only source of it; null on every other ground.
  -- LEVER-HORIZON (1005-lever-horizon.sql): RESTATED WHOLE. The First target is the member read's (the window's setup, held past a
  -- lever inside the seed horizon), still only a kind the ground fields; its key is dropped from the session, which is byte-identical.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'tier', v_i.tier,
      'session_mode', v_i.session_mode,
      'tower_floor', public.hr_tower_floor_of(v_i.id),
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', (select ps.party_leave_together from public.player_state ps where ps.user_id = h.user_id and ps.slot = h.slot),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0) m0
               -- TARGET-KIND: the member's OWN First target on this ground (LEVER-HORIZON: the window's, from the member read), only a kind
               -- the catalogue holds there; none, no key. Any options.target_kind is dropped first (hr_action_set_options refuses the key;
               -- this read does not lean on that alone), and so is the member read's own target_kind key.
               cross join lateral (select jsonb_set(m0.r0 - 'target_kind', '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', g.monster_id) from public.hr_hunt_ground_spawns g
                     where g.hunt_id = v_i.hunt_id and g.monster_id = m0.r0->>'target_kind'), '{}'::jsonb)) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

-- ── §3b hr_hunt_apply_member, RESTATED WHOLE ─────────────────────────────────
-- tests/patch-chain-guard.mjs PATCH-1: its body was 2 anchored patches deep since its last full restatement (2027-04-16-combat-
-- training.sql by that guard's count; the 2027-05-17 scaled files' splices on top). Restated here byte for byte as the chain holds it,
-- with this file's one line (marker LEVER-HORIZON): the store's re-check prices under the window's supply setting (hr_hunt_setup_of,
-- the setup the engine played). §0 pins the pre-image; §5(f) the post.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_lfrom int; v_lto int;  -- DEATH-SHARE (2027-03-25-death-share.sql): the hero's Level before and after the death's debit
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): step (7)'s five locals went with it to hr_hunt_resume.
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
  v_call  boolean;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): this session fights in a called room (hr_boss_calls)
  v_mode  public.hr_session_modes%rowtype;  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance's mode, frozen at its start
  v_tw    jsonb;  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): this window's climb (hr_tower_check), or null off the Tower
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  -- TOWER-CLIMB: `tower` is this member's own (its cleared floors, re-proved below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event' - 'tower';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    -- DEATH-SHARE: one formula, a share of the TOTAL Level XP (no alternative base row).
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  -- TRAINING (2027-04-16-combat-training.sql): a training session spends no stamina and proposes none (a JSON null, src/core/combat-sim.js);
  -- the pool is never written here, so it rests while the hero trains (hr_stamina_of from its last stamp).
  v_train := exists (select 1 from public.hr_training_grounds t where t.hunt_id = v_s.hunt_id);
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a called room's TIME spends no stamina (each fight is charged as it starts: hr_boss_call,
  -- hr_boss_call_step), so its window's pool is the server's alone: whatever the engine proposes (null; a number from an engine that
  -- predates this file) is ignored. Unlike training the pool does NOT rest in the room: it is stamped unchanged below.
  v_call := exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_call then
    if v_stam is not null and jsonb_typeof(v_stam) not in ('null', 'number') then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'call')); end if;
  elsif v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- SESSION-MODES (2027-04-23-session-modes.sql): THE INSTANCE'S MODE, frozen by the server when it started (hunt_instances.session_mode,
  -- hr_hunt_mode_freeze, from its own ground catalogue), never an intent's or the edge's. Its row bounds the death (6) and its Blessings.
  select m.* into v_mode from public.hunt_instances i join public.hr_session_modes m on m.mode_id = i.session_mode where i.id = p_instance;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'session_mode')); end if;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): WHAT THE MODE PAYS (its coin, drops and Bestiary; the engine's one door is src/core/hunt-rewards.js):
  -- a window that pays what its mode does not is refused whole, before hr_apply writes a thing (hr_mode_pays names the first thing it pays).
  v_k := public.hr_mode_pays(v_mode.mode_id, p_delta);
  if v_k is not null then perform public.hr_reject('mode_pays', jsonb_build_object('mode', v_mode.mode_id, 'what', v_k)); end if;
  v_k := null;
  -- TOWER-CLIMB: THE CLIMB'S FLOORS, re-proved against the run's own record before anything is written (hr_tower_check: the floors one after
  -- another from the run's next floor, no faster than the stair; the most one kill of the floors it stood on). Null off the Tower.
  v_tw := public.hr_tower_check(p_session, p_hunt, v_s.settled_to, v_to);
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): A TRAINING WINDOW PAYS ITS SKILL AND NOTHING ELSE, refused whole before hr_apply writes a thing
  -- (hr_training_window: an allowlist, the trained skill's key only, no Level XP, no coin, no item, no kill, no death, a time bound).
  if v_train then perform public.hr_training_window(p_user, p_slot, v_s.hunt_id, v_s.settled_to, v_to, p_delta); end if;

  -- BOSS-DAILY (2027-04-25-boss-daily.sql): A KEYED HALL'S BOSS PAYS HIS DROPS ONCE A DAY PER HERO. The window's claim (its journal's
  -- `prize`, said only when the engine made this hero's roll) stamps today's row or finds it taken (hr_boss_prize_take): a prize row passes
  -- only on a fresh stamp, one piece at most, beside the boss's journalled kill; otherwise it is taken off the delta here, before hr_apply
  -- writes a thing. Any other hunt costs this one comparison (a hall's room is its ground's id and _hall) and one key test of its journal.
  if right(v_s.hunt_id, 5) = '_hall' or coalesce(p_delta #> '{journal,meta}', '{}'::jsonb) ? 'prize' then
    p_delta := public.hr_boss_prize_take(p_user, p_slot, p_session, p_intent, v_s.hunt_id, p_delta);
  end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): a climb's kills are bounded by the floors it stood on (hr_tower_floors, through hr_tower_check),
  -- and EVERY mode's XP by its share of a kill (hr_session_modes.xp_pm; a hunt's 1000 moves nothing).
  if v_tw is not null then v_vb_xp := greatest(v_vb_xp, (v_tw->>'xp_max')::bigint); end if;
  if v_mode.xp_pm <> 1000 then v_vb_xp := ceil(v_vb_xp * v_mode.xp_pm / 1000.0)::bigint; end if;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0),
                           -- TOWER-CLIMB: a climb's monsters stand at the floor's Level
                           coalesce((v_tw->>'level')::bigint, 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  -- CALL-SERIES: a called room journals no kill, so its items are held by its own bound instead (hr_boss_call_pays above: only the window
  -- his kill fell in, only his table, at most its count), never by kills x the ground's spawns.
  if jsonb_typeof(p_delta->'items') = 'object' and not v_call then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
           -- SCALED-LOOT (2027-05-17-scaled-loot.sql): a window the commit proved scaled rolls each row ceil(loot_pm / 1000) times
           * coalesce((select ceil(b.loot_pm / 1000.0) from public.hunt_instances i join public.hr_scaled_kill_bounds b
                        on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 1)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): THE CLIMB, WRITTEN (hr_tower_write: each floor a room of the run's kills, then the run's top (the
  -- chest's key mint) and the hero's best), after every bound above held and before the session half can end the session.
  if v_tw is not null then perform public.hr_tower_write(p_user, p_slot, p_session, v_tw, v_kills, v_to); end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): a training window drains nothing and stamps nothing (the clock above is still re-proved).
  -- CALL-SERIES: a called room's window drains nothing and RESTS nothing: the pool as it stood at the window's start, stamped at its end.
  if v_call then
    v_e := v_s0;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  elsif not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  -- LEVER-HORIZON (1005-lever-horizon.sql): the WINDOW'S setup (hr_hunt_setup_of: held past a lever inside the seed horizon), the
  -- one the engine played; its supply keys are hr_hunt_supply_of's.
  v_supply := public.hr_hunt_setup_of(v_s);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- TRAINING (2027-04-16-combat-training.sql): THE YARD'S NEXT HOUR, at its first instant (the edge cuts a yard window there, src/core/hunt/training.js
  -- trainingStopMs): paid from the account purse out of what this window's own store bill and the hero's floor leave, or the session ends gold_out
  -- right there (hr_training_hour). Its end, if any, rides the answer, so the resume below and the edge read it as any end.
  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S WIN AND ITS NEXT FIGHT (hr_boss_call_step): the win is proved from this window's
  -- own kill and counted; a held end is charged its next fight or closed, as the room's plan says. Its end, if any, rides the answer.
  if v_call then v_h := public.hr_boss_call_step(p_user, p_slot, p_session, p_delta, v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if not v_train and v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  -- SESSION-MODES: a mode whose death uses no Blessing (one that costs nothing: the Burning Tower) never calls the hook; they stay held.
  if v_nd > 0 and v_mode.blessings then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  --     SESSION-MODES: each bound is that rule at the instance mode's share (hr_death_xp_mode_max): the rule itself in a hunt, and 0 in
  --     a mode whose death costs nothing, so there any death XP at all is refused (the engine proposes none: two locks).
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_mode_max('level', v_cur, v_mode.death_loss_pm) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_mode_max(v_k, v_cur, v_mode.death_loss_pm) then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', public.hr_skill_level(v_k, v_cur))); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  -- DEATH-SHARE: the death names the Level it took the hero from and to (equal when it took none), off the debited Level XP.
  if v_nd > 0 then
    select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot;
    v_lto := public.hr_char_level(v_cur);
    v_lfrom := public.hr_char_level(v_cur + coalesce((v_lost->>'level')::bigint, 0));
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x),
                                             'level_from', v_lfrom, 'level_to', v_lto)
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home), by the job's kind.
  --     BENCH-RESUME (2027-04-24-bench-resume.sql): the step is hr_hunt_resume, whole, so a new kind of job never restates this body.
  perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>'ended', v_ev0);
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  -- SCALED-BEST (2027-05-17-scaled-best.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  --   hr_hunt_apply_instance before any member lands) keeps its span on THIS session's tally, so its personal best is never folded
  --   (hr_hunt_best_fold): a scaled run is not the ground's own.
  if exists (select 1 from public.hunt_instances i where i.id = p_instance and i.scale_level is not null) then
    insert into public.hunt_session_tally as t (session_id, user_id, slot, scaled_ms) values (p_session, p_user, p_slot, greatest(v_win, 1))
      on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;
  end if;
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §4 THE SPLICES (each once; a second apply finds the post image) ──────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  -- (b) hr_hunt_settle_session: the end proof reads the window's setup (supply, bar, stop rules).
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEVER-HORIZON') = 0 then
    v_old := $a$  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);$a$;
    v_new := $a$  -- LEVER-HORIZON (1005-lever-horizon.sql): the WINDOW'S setup (hr_hunt_setup_of), the one the engine played: its supply keys
  -- here, its bar (runes_out) and its stop rules (rule) in the end proof below.
  v_supply := public.hr_hunt_setup_of(v_s);$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: LEVER-HORIZON supply anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$      when 'runes_out' then exists (select 1 from public.player_action_sets a
                                     cross join lateral jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) e
                                     cross join lateral (select public.hr_hunt_rune_supply(e->'action') as rs) x
                                    where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset
                                      and jsonb_typeof(e) = 'object'$a$;
    v_new := $a$      when 'runes_out' then exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_supply->'bar') = 'array' then v_supply->'bar' else '[]'::jsonb end) e
                                     cross join lateral (select public.hr_hunt_rune_supply(e->'action') as rs) x
                                    where jsonb_typeof(e) = 'object'$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: LEVER-HORIZON runes_out anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $a$      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)$a$;
    v_new := $a$      when 'rule' then case when jsonb_typeof(v_supply->'options'->'stop_rules') = 'array'
                            then jsonb_array_length(v_supply->'options'->'stop_rules') > 0 else false end$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: LEVER-HORIZON rule anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;

  -- (c) hr_blessing_buy: a Blessing bought with a hunt open counts from its seed horizon.
  v_def := replace(pg_get_functiondef('public.hr_blessing_buy(integer,integer,bigint,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEVER-HORIZON') = 0 then
    v_old := $a$  insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_uid, p_slot, p_tier, v_price, now());$a$;
    v_new := $a$  -- LEVER-HORIZON (1005-lever-horizon.sql): with a hunt open the Blessing counts from its seed horizon (hr_hunt_lever_at), so no death
  -- the browser's seeds already showed is cut (hr_blessing_take counts bought_at <= the window's start); in town, from now.
  insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_uid, p_slot, p_tier, v_price, public.hr_hunt_lever_at(v_uid, p_slot));$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_blessing_buy: LEVER-HORIZON anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §5 THE SELF-CHECK, BY EXECUTING IT (rolled back) ─────────────────────────
-- One probe hero through the real verbs, its hunt settled 40 minutes ago at a whole second:
-- (a) in town, a stance written makes no hold; a Blessing bought counts from now;
-- (b) hunting, the stance changed through hr_action_set_options: ONE hold, until = the seed horizon, the setup as it stood (no stance),
--     and the window starting now still reads it (hr_hunt_setup_of and the member read), while the live tables hold the new stance;
-- (c) a second lever inside the same horizon adds no hold; a setup switch (hunt_sessions.preset) after the clock moves adds one, later;
-- (d) the session's clock past the first hold: the member read plays the stance; past both, the switched set;
-- (e) a Blessing bought mid-hunt counts from greatest(now(), the horizon), past now; a hold of an ended session is pruned by the next lever;
-- (f) owner-only: no client or engine role executes a new function or holds a privilege on the table; RLS on; each splice once, at its post pin.
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-00001e7e0001';
  k   text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_g text := 'mill_cellar'; v_s uuid; v_i uuid; v_at timestamptz; v_h timestamptz; v_h2 timestamptz; v_role text; v_n int;
  v_row public.hunt_sessions%rowtype;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe Lever') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'lever-horizon §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = 0 where user_id = v_a and slot = 0;
    insert into public.social_presence (user_id, slot, seen_at) values (v_a, 0, now()) on conflict (user_id) do update set seen_at = now();

    -- (a) IN TOWN: no hold; a Blessing counts from now.
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_action_set_options(0, 0, '{"on_empty": "end"}'::jsonb, (k || '1e7e0100')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the town options answered %', v; end if;
    if exists (select 1 from public.hunt_setup_holds h join public.hunt_sessions s on s.id = h.session_id where s.user_id = v_a) then
      raise exception 'VERIFY(a): a town edit wrote a hold'; end if;

    -- THE HUNT, 40 minutes behind at a whole second (so the horizon is the clock's, never now()).
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, (k || '1e7e0200')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: the enter answered %', v; end if;
    select id, instance_id into v_s, v_i from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    v_at := date_trunc('second', now() - interval '40 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_s;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_i;
    if public.hr_hunt_seed_horizon(v_s) <> v_at + interval '32 seconds' then
      raise exception 'VERIFY: the seed horizon of a hunt settled at % reads %', v_at, public.hr_hunt_seed_horizon(v_s); end if;
    -- (the rate gate and the mid-hunt slack read now(); the probe's clock is its own: the settle_first slack is lifted by a near clock)
    update public.hunt_sessions set settled_to = now() - interval '5 seconds', next_swing_at = now() - interval '5 seconds' where id = v_s;
    update public.hunt_instances set settled_to = now() - interval '5 seconds', next_swing_at = now() - interval '5 seconds' where id = v_i;
    select * into v_row from public.hunt_sessions where id = v_s;
    v_h := public.hr_hunt_seed_horizon(v_s);

    -- (b) THE STANCE MID-HUNT: one hold at the horizon, the old setup; the live table has the new.
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_action_set_options(0, 0, '{"stance": "defensive"}'::jsonb, (k || '1e7e0300')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the mid-hunt stance answered %', v; end if;
    select count(*) into v_n from public.hunt_setup_holds where session_id = v_s;
    if v_n <> 1 or (select until from public.hunt_setup_holds where session_id = v_s) <> v_h
       or (select setup->'options' from public.hunt_setup_holds where session_id = v_s) ? 'stance' then
      raise exception 'VERIFY(b): the holds after the stance: % (want one at %, with no stance)',
        (select jsonb_agg(jsonb_build_object('until', until, 'options', setup->'options')) from public.hunt_setup_holds where session_id = v_s), v_h; end if;
    select * into v_row from public.hunt_sessions where id = v_s;
    if public.hr_hunt_setup_of(v_row)->'options' ? 'stance' or public.hr_hunt_member_read(v_row)->'options' ? 'stance' then
      raise exception 'VERIFY(b): the window starting now plays the new stance inside the horizon'; end if;
    if (select options->>'stance' from public.player_action_sets where user_id = v_a and slot = 0 and preset = 0) is distinct from 'defensive' then
      raise exception 'VERIFY(b): the live set lost the new stance'; end if;

    -- (c) A SECOND LEVER IN THE SAME HORIZON ADDS NONE; A SWITCH AFTER THE CLOCK MOVES ADDS ONE, LATER.
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_action_set_options(0, 0, '{"distance": 2}'::jsonb, (k || '1e7e0400')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the second lever answered %', v; end if;
    if (select count(*) from public.hunt_setup_holds where session_id = v_s) <> 1 then
      raise exception 'VERIFY(c): a second lever inside one horizon added a hold'; end if;
    update public.hunt_sessions set settled_to = settled_to + interval '10 seconds', next_swing_at = next_swing_at + interval '10 seconds' where id = v_s;
    update public.hunt_instances set settled_to = settled_to + interval '10 seconds', next_swing_at = next_swing_at + interval '10 seconds' where id = v_i;
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options, updated_at)
      values (v_a, 0, 1, 'Probe set', '[]'::jsonb, '{"stance": "offensive"}'::jsonb, now())
      on conflict (user_id, slot, preset) do update set options = excluded.options;
    if (select count(*) from public.hunt_setup_holds where session_id = v_s) <> 1 then
      raise exception 'VERIFY(c): a write to a set the session does not play added a hold'; end if;
    update public.hunt_sessions set preset = 1 where id = v_s;
    v_h2 := public.hr_hunt_seed_horizon(v_s);
    if (select count(*) from public.hunt_setup_holds where session_id = v_s) <> 2
       or not exists (select 1 from public.hunt_setup_holds where session_id = v_s and until = v_h2 and (setup->>'preset')::int = 0
                        and setup->'options'->>'stance' = 'defensive') then
      raise exception 'VERIFY(c): the setup switch holds %', (select jsonb_agg(jsonb_build_object('until', until, 'setup', setup)) from public.hunt_setup_holds where session_id = v_s); end if;

    -- (d) THE CLOCK PAST EACH HOLD: first the stance, then the switched set.
    update public.hunt_sessions set settled_to = v_h + interval '1 millisecond' where id = v_s;
    select * into v_row from public.hunt_sessions where id = v_s;
    if public.hr_hunt_member_read(v_row)->'options'->>'stance' is distinct from 'defensive' or (public.hr_hunt_member_read(v_row)->>'preset')::int <> 0 then
      raise exception 'VERIFY(d): past the first hold the window plays %', public.hr_hunt_member_read(v_row)->'options'; end if;
    update public.hunt_sessions set settled_to = v_h2 + interval '1 millisecond' where id = v_s;
    select * into v_row from public.hunt_sessions where id = v_s;
    if public.hr_hunt_member_read(v_row)->'options'->>'stance' is distinct from 'offensive' or (public.hr_hunt_member_read(v_row)->>'preset')::int <> 1 then
      raise exception 'VERIFY(d): past both holds the window plays %', public.hr_hunt_member_read(v_row)->'options'; end if;

    -- (e) A BLESSING MID-HUNT counts from its horizon; a lever prunes every spent hold. The clock stands past the first hold (spent).
    update public.hunt_sessions set settled_to = v_h + interval '1 second', next_swing_at = v_h + interval '1 second' where id = v_s;
    update public.hunt_instances set settled_to = v_h + interval '1 second', next_swing_at = v_h + interval '1 second' where id = v_i;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_blessing_buy(0, 1, public.hr_blessing_price(1, greatest(1, coalesce(public.hr_level_of(v_a, 0), 1))), (k || '1e7e0500')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the Blessing answered %', v; end if;
    if (select bought_at from public.player_blessings where user_id = v_a and slot = 0 and tier = 1)
       is distinct from greatest(now(), public.hr_hunt_seed_horizon(v_s)) or not (public.hr_hunt_seed_horizon(v_s) > now()) then
      raise exception 'VERIFY(e): a Blessing bought mid-hunt counts from %, not the horizon %',
        (select bought_at from public.player_blessings where user_id = v_a and slot = 0 and tier = 1), public.hr_hunt_seed_horizon(v_s); end if;
    if not exists (select 1 from public.hunt_setup_holds where session_id = v_s and until = v_h) then
      raise exception 'VERIFY(e) CANNOT RUN: the first hold is already gone'; end if;
    update public.hunt_sessions set preset = 0 where id = v_s;
    if exists (select 1 from public.hunt_setup_holds where session_id = v_s and until = v_h) then
      raise exception 'VERIFY(e): a spent hold survived the next lever'; end if;
    raise exception using errcode = 'HRLVH', message = 'lever-horizon §5 complete - rolling back';
  exception when sqlstate 'HRLVH' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_a) or exists (select 1 from public.hunt_setup_holds h
               join public.hunt_sessions s on s.id = h.session_id where s.user_id = v_a) then
    raise exception 'VERIFY: §5 LEAKED a probe row'; end if;
  -- (f) OWNER-ONLY, AND EACH BODY AT ITS POST PIN (so a second apply passes §0 and moves no body).
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      if has_function_privilege(v_role, 'public.hr_hunt_seed_horizon(uuid)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_lever_at(uuid,integer)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_setup_live(uuid,integer,integer,text)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_setup_of(public.hunt_sessions)', 'execute')
         or has_function_privilege(v_role, 'public.hr_hunt_setup_hold()', 'execute')
         or has_table_privilege(v_role, 'public.hunt_setup_holds', 'select,insert,update,delete,truncate,references,trigger') then
        raise exception 'VERIFY(f): % reaches a lever-horizon function or the holds table', v_role; end if;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.hunt_setup_holds'::regclass) then
    raise exception 'VERIFY(f): hunt_setup_holds has RLS off'; end if;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
    raise exception 'VERIFY(f): the restated instance read lost hr_engine''s EXECUTE'; end if;
  if (select count(*) from pg_trigger where tgname like 'hr_hunt_setup_hold%' and not tgisinternal) <> 7 then
    raise exception 'VERIFY(f): % lever-horizon triggers, not 7', (select count(*) from pg_trigger where tgname like 'hr_hunt_setup_hold%' and not tgisinternal); end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure) is distinct from '5cb3d1b94655838354f94555fa81544d'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) is distinct from '6d18331b1ac584cc55763515039565f4'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) is distinct from '0e0e304013e75ea2535dbb483c04d570'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure) is distinct from '6e3a7682baf3d6d14c32fac1e65df663'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_blessing_buy(integer,integer,bigint,uuid)'::regprocedure) is distinct from 'd4db88287ce20e6351f1804da90e9ebc' then
    raise exception 'VERIFY(f): a body landed off its post pin: member_read %, instance_read %, apply_member %, settle_session %, blessing_buy %',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_blessing_buy(integer,integer,bigint,uuid)'::regprocedure); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'lever-horizon: a Blessing, the bar, its options, a setup switch and the First target each play from the first window past the seed horizon';
end $$;
