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
    ('public.hr_hunt_member_read(public.hunt_sessions)', 'f44d35ce952efc95e5bbbff709b43f7c', 'bb100bcd4ae548c859f24a217fae263c'),
    ('public.hr_hunt_instance_read(uuid,integer)', 'cfb26bd60ee7eb29965041ca9354cb25', '4011af399d22e72d34ebc98eaaa9075d'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '9fd093ec7113084292f61ded4c732417', '16edf7c9746fddbb689094fdc8de7ce3'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '7b6b3171349ee3896a1a380ce0cd0852', '08ca93181493d142237b8e5bf16c6071'),
    ('public.hr_blessing_buy(integer,integer,bigint,uuid)', '1c98a151bf685645e1b4669fcf1c6986', 'c1460865bdd6d4edb41908d0fe1efebd')) t(fn, pre, post) loop
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
returns jsonb language sql stable set search_path = public, pg_catalog as $fn$
  -- LEVER-HORIZON: the setup the settle reads from the live tables for a session playing set p_preset on p_hunt: its options and
  -- bar (player_action_sets), its First target there (hunt_density.target_kind) and its supply setting (hr_hunt_supply_of, the one
  -- formula). A missing set reads as the member read always did: no options, an empty bar.
  select jsonb_build_object(
           'preset', p_preset,
           'options', coalesce(a.options, '{}'::jsonb),
           'bar', coalesce(a.slots, '[]'::jsonb),
           'target_kind', (select d.target_kind from public.hunt_density d
                            where d.user_id = p_user and d.slot = p_slot and d.hunt_id = p_hunt))
         || public.hr_hunt_supply_of(p_user, p_slot, p_preset)
    from (select 1) one
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot and a.preset = p_preset
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
returns jsonb language sql stable set search_path = public, pg_catalog as $fn$
  -- LEVER-HORIZON: the setup the window starting at the session's settled_to plays: the earliest hold at or after that instant
  -- (the setup as it stood when the seeds reaching it were shown), else the live one.
  select coalesce(
           (select h.setup from public.hunt_setup_holds h
             where h.session_id = p_s.id and h.until >= p_s.settled_to order by h.until limit 1),
           public.hr_hunt_setup_live(p_s.user_id, p_s.slot, p_s.preset, p_s.hunt_id))
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

-- ── §4 THE SPLICES (each once; a second apply finds the post image) ──────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  -- (a) hr_hunt_apply_member: the store's re-check prices under the window's supply setting.
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'LEVER-HORIZON') = 0 then
    v_old := $a$  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);$a$;
    v_new := $a$  -- LEVER-HORIZON (1005-lever-horizon.sql): the WINDOW'S setup (hr_hunt_setup_of: held past a lever inside the seed horizon), the
  -- one the engine played; its supply keys are hr_hunt_supply_of's.
  v_supply := public.hr_hunt_setup_of(v_s);$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_member: LEVER-HORIZON anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;

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
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure) is distinct from 'bb100bcd4ae548c859f24a217fae263c'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) is distinct from '4011af399d22e72d34ebc98eaaa9075d'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) is distinct from '16edf7c9746fddbb689094fdc8de7ce3'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure) is distinct from '08ca93181493d142237b8e5bf16c6071'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_blessing_buy(integer,integer,bigint,uuid)'::regprocedure) is distinct from 'c1460865bdd6d4edb41908d0fe1efebd' then
    raise exception 'VERIFY(f): a body landed off its post pin: member_read %, instance_read %, apply_member %, settle_session %, blessing_buy %',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_member_read(public.hunt_sessions)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_blessing_buy(integer,integer,bigint,uuid)'::regprocedure); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'lever-horizon: a Blessing, the bar, its options, a setup switch and the First target each play from the first window past the seed horizon';
end $$;
