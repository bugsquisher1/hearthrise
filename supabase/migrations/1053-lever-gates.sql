-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1053-lever-gates.sql — THE HOLD SEAT AND SCALED HOURS PLAY FROM THE SEED HORIZON, LIKE EVERY OTHER LEVER
--   (lane/c-settle-flush follow-up, reliability-engineer, 2026-11-22; the class 1052-settle-flush.sql named open, closed now:
--   CLAUDE.md §3.2 "kill the class").
--
-- STATUS: supabase/migration-notes/1053-lever-gates.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1052-settle-flush.sql, whose clock-bounded seed horizon
--   (hr_hunt_seed_horizon) both deferrals count from. Applied as ONE transaction by the apply tool; never begin/commit here.
--
-- ── THE HOLE ────────────────────────────────────────────────────────────────
-- Two levers still took hold at the SAVED clock, so under the flush (1052) each acted on up to ~90 s of swings the browser's
--   prediction had already played, plus the 34 s of seeds it held ahead:
--   · the leader's hold seat (hr_party_hold_set; the clear when a seat empties): hunt_parties.hold_seat, read live by
--     hr_hunt_instance_read for the window starting at the saved clock;
--   · a scaled hunt's switch and hour buy (hr_scaled_hunt_switch / _buy, and any other write that turns the switch or raises the
--     bank): player_scaled_hours, read live by hr_scaled_hunt_of, which restarts the world at the saved clock when the scale moves.
--   A slack gate (settle_first past 20 s) would only have bounded the past part; the 34 s of seeds ahead stay foreseen. So each is
--   DEFERRED exactly as 1005 defers a bar or setup change: the setting lands at once (the party and scaled views show it), and the
--   engine plays it from the first window starting past the seed horizon.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- THE HOLD SEAT. hunt_parties gains hold_seat_was (int) and hold_seat_from (timestamptz): the seat the engine plays for a window
--   starting before hold_seat_from, while hold_seat is the leader's latest pick (what the party view shows).
--   hr_party_hold_played(party row, window start) -> int   NEW, owner-only: hold_seat_was before hold_seat_from, else hold_seat.
--   hr_party_hold_put(party, seat)                       NEW, owner-only: the one writer. Not hunting: at once. Hunting: was = the
--     seat played at the instance's saved clock, hold_seat = the pick, from = the latest seed horizon of its open sessions.
--   hr_party_hold_set      ONE SPLICE (marker hr_party_hold_put): its update becomes the writer.
--   hr_party_hold_clear    RESTATED (trigger, a seat emptied): through the writer.
--   hr_hunt_instance_read  ONE SPLICE: `hold_seat` is hr_party_hold_played(p, v_i.settled_to), the window's own.
-- THE SCALE. public.hunt_scale_holds (instance_id, until, scale, at)   NEW TABLE, RLS on, no policy, no client or engine privilege:
--   the instance's scale as it stood (hr_scaled_hunt_of's answer with its owner's spent_ms, or JSON null) for every window
--   starting at or before `until`.
--   hr_scaled_hours_hold() NEW trigger fn, BEFORE INSERT / BEFORE UPDATE (use_on moved, or banked_ms rose) on player_scaled_hours:
--     for each open instance the hero hunts that ground in, records the scale as it stands before the write, until its seed
--     horizon; a hold still in force is only pushed later (it already keeps the scale the seeds were shown with). The settle's
--     own debit lowers banked_ms and records nothing.
--   hr_scaled_hunt_of      RESTATED: a hold in force answers its scale, its bank less what was spent since (and never more than
--     the live bank); else the live rule, unchanged. Both the edge's read and the commit's re-proof read it, so they agree.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The hold seat writer runs under the party row the RPC already locks; the scale hold writes its own table (never the instance
--   row, which the settle locks before its members: no new lock order). A second apply finds every body at its post pin (§0),
--   adds no column twice, restates the same text and re-creates the triggers: byte-identical (tests/schema-drift.mjs).
-- EXPLOIT SURFACE: CLOSES the hold seat and the scaled switch / buy acting on foreseen or already-played swings (tests/hunt-
--   sessions-settle.mjs FLUSH-HORIZON, both paths). No new client verb, grant or refusal; the new objects are owner-only.
-- COST: one party-row read a settle read (the same row, a function call); one primary-key probe of hunt_scale_holds per
--   hr_scaled_hunt_of on a scalable ground. One hold row per scaled lever mid-hunt (pruned at the next); two int/timestamptz
--   columns a party. At 100x players: a few hundred hold rows at most.
-- EDGE: none (the engine reads the same keys). CLIENT: none.
-- REVERSIBLE: restate hr_scaled_hunt_of from 2027-03-21-scaled-hunts.sql and hr_party_hold_clear from 2026-12-08-party-hold.sql,
--   take the two splices back (§0 pins the pre images), drop the triggers, the helpers, the table and the two columns.
-- WIPE: hunt_scale_holds holds only live horizons (2027-02-25-character-wipe.sql lists it); the columns go with hunt_parties.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_seed_horizon(uuid)') is null or to_regclass('public.player_scaled_hours') is null
     or to_regclass('public.hunt_parties') is null or to_regprocedure('public.hr_hunt_limit(text)') is null then
    raise exception 'PRECONDITION: the seed horizon (1052), the scaled hours or the party table is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '43c031340d414ede76522755f7060233', '01b65ee3b44238d75fefb3aaedca260d'),
    ('public.hr_party_hold_set(integer,integer,uuid)', 'ca4ce803cceb577ea8adb1e54766709c', '09b2d6618bc975ea70dd8fdcad169121'),
    ('public.hr_party_hold_clear()', 'b7a225a8149f30dc32b573f02b2030d5', '4bc8c642106dba6846780e5808142b4f'),
    ('public.hr_scaled_hunt_of(uuid)', '5d0b88f0d38698b777d5607af9ca9ad5', 'e409f4934708ce768b038a1086ce48db')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    -- A RETRY AFTER 1056-danger-scale.sql (staged after this file) finds the instance read at 1056's image: this file's hold seat read
    -- already in it, plus the frozen stance in the overlay. The splice below then finds its post text and moves nothing.
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post
       and not (v_r.fn = 'public.hr_hunt_instance_read(uuid,integer)' and v_md5 in ('3097347b88e3a5187f2f12cf0d7fbcae', 'e0b569fcc3d856126934683a2129363e')) then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE HOLD SEAT ─────────────────────────────────────────────────────────
alter table public.hunt_parties add column if not exists hold_seat_was integer;
alter table public.hunt_parties add column if not exists hold_seat_from timestamptz;
comment on column public.hunt_parties.hold_seat_from is
  'added 1053-lever-gates.sql: the seed horizon the leader''s latest hold pick (hold_seat) plays from; a window starting before it plays hold_seat_was. NULL: hold_seat plays.';

create or replace function public.hr_party_hold_played(p public.hunt_parties, p_at timestamptz)
returns integer language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- LEVER-GATES (1053-lever-gates.sql): the seat whose tank holds for a window starting at p_at: the pick played before its horizon.
  -- plpgsql, not sql: PostgreSQL 17 plans a SET-clause SQL body again on every call, and every settle's instance read calls this one
  -- (tests/settle-budget.mjs SB-3).
  return case when p.hold_seat_from is not null and p_at < p.hold_seat_from then p.hold_seat_was else p.hold_seat end;
end $fn$;
revoke execute on function public.hr_party_hold_played(public.hunt_parties, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.hr_party_hold_put(p_party uuid, p_seat integer)
returns void language plpgsql set search_path = public, pg_catalog as $fn$
-- LEVER-GATES (1053-lever-gates.sql): THE ONE WRITER of a party's hold seat. Not hunting: at once. Hunting: the pick is the leader's
-- at once (the party view shows it), and the engine plays the seat it played at the saved clock until the latest seed horizon of
-- the party's open sessions (1052's: past every swing an answer can have shown).
declare
  v_p     public.hunt_parties%rowtype;
  v_until timestamptz;
  v_at    timestamptz;
begin
  select * into v_p from public.hunt_parties where id = p_party;
  if not found or v_p.hold_seat is not distinct from p_seat then return; end if;
  select max(public.hr_hunt_seed_horizon(s.id)) into v_until
    from public.hunt_sessions s where s.instance_id = p_party and s.ended_at is null;
  if v_until is null then
    update public.hunt_parties set hold_seat = p_seat, hold_seat_was = null, hold_seat_from = null where id = p_party;
    return;
  end if;
  select i.settled_to into v_at from public.hunt_instances i where i.id = p_party;
  update public.hunt_parties
     set hold_seat_was  = public.hr_party_hold_played(v_p, coalesce(v_at, now())),
         hold_seat      = p_seat,
         hold_seat_from = greatest(v_until, coalesce(v_p.hold_seat_from, v_until))
   where id = p_party;
end $fn$;
revoke execute on function public.hr_party_hold_put(uuid, integer) from public, anon, authenticated, service_role;

create or replace function public.hr_party_hold_clear()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- PARTY-HOLD (2026-12-08-party-hold.sql): an emptied seat holds nothing; the next hero in it never inherits the hold.
  -- LEVER-GATES (1053-lever-gates.sql): through the one writer, so a party still hunting plays the change from its seed horizon.
  if exists (select 1 from public.hunt_parties p where p.id = old.party_id and p.hold_seat = old.seat) then
    perform public.hr_party_hold_put(old.party_id, null);
  end if;
  return null;
end $$;
revoke execute on function public.hr_party_hold_clear() from public, anon, authenticated, service_role;

-- (a) THE INSTANCE READ, RESTATED WHOLE (tests/patch-chain-guard.mjs PATCH-1: its chain stood two splices deep since
--     2027-04-22-target-kind.sql, 1046-settle-plans.sql's two offset-0 fences). The body is the chain's with ONE change: `hold_seat`
--     is hr_party_hold_played(p, v_i.settled_to), the window's own (it read the live p.hold_seat). §0 pins both images; §4 the post.
--     CREATE OR REPLACE keeps its owner and grants (hr_engine executes it, §4).
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
      'hold_seat', (select public.hr_party_hold_played(p, v_i.settled_to) from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
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
                 'leave_together', public.hr_party_leave_together_of(h.user_id, h.slot, v_i.id),
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
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0 offset 0) m0
               -- TARGET-KIND: the member's OWN First target on this ground (LEVER-HORIZON: the window's, from the member read), only a kind
               -- the catalogue holds there; none, no key. Any options.target_kind is dropped first (hr_action_set_options refuses the key;
               -- this read does not lean on that alone), and so is the member read's own target_kind key.
               cross join lateral (select jsonb_set(m0.r0 - 'target_kind', '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', g.monster_id) from public.hr_hunt_ground_spawns g
                     where g.hunt_id = v_i.hunt_id and g.monster_id = m0.r0->>'target_kind'), '{}'::jsonb)) as r offset 0) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  -- (b) the leader's pick goes through the one writer
  v_def := replace(pg_get_functiondef('public.hr_party_hold_set(integer,integer,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_party_hold_put') = 0 then
    v_old := $a$  update public.hunt_parties set hold_seat = p_seat where id = v_pid and hold_seat is distinct from p_seat;$a$;
    v_new := $a$  -- LEVER-GATES (1053-lever-gates.sql): hunting, the engine plays the pick from the seed horizon (hr_party_hold_put).
  perform public.hr_party_hold_put(v_pid, p_seat);$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_party_hold_set: LEVER-GATES anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §2 THE SCALE ─────────────────────────────────────────────────────────────
create table if not exists public.hunt_scale_holds (
  instance_id uuid        primary key,
  until       timestamptz not null,
  scale       jsonb       not null check (jsonb_typeof(scale) in ('object', 'null') and octet_length(scale::text) <= 4096),
  at          timestamptz not null default now()
);
comment on table public.hunt_scale_holds is
  'added 1053-lever-gates.sql: an open hunt instance''s scale as it stood (hr_scaled_hunt_of, with its owner''s spent_ms; JSON null = unscaled) for every window starting at or before `until` (the seed horizon when a scaled switch or hour buy landed mid-hunt). Owner-only.';
alter table public.hunt_scale_holds enable row level security;
revoke all on public.hunt_scale_holds from public, anon, authenticated, service_role;

create or replace function public.hr_scaled_hunt_of(p_instance uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_i  public.hunt_instances%rowtype;
  v_lu uuid; v_ls int; v_n int;
  v_h  public.player_scaled_hours%rowtype;
  v_to int;
  v_held jsonb; v_left bigint;
begin
  select * into v_i from public.hunt_instances where id = p_instance;
  if not found or not exists (select 1 from public.hr_scaled_grounds g where g.hunt_id = v_i.hunt_id) then return null; end if;
  -- LEVER-GATES (1053-lever-gates.sql): a switch or an hour buy that landed mid-hunt plays from its seed horizon. The window starting
  -- at the saved clock reads the scale as it stood (a hold in force), its bank less what was spent since and never above the live one.
  select h.scale into v_held from public.hunt_scale_holds h where h.instance_id = p_instance and h.until >= v_i.settled_to;
  if found then
    if jsonb_typeof(v_held) <> 'object' then return null; end if;
    select * into v_h from public.player_scaled_hours h
     where h.user_id = (v_held->>'user')::uuid and h.slot = (v_held->>'slot')::int and h.hunt_id = v_i.hunt_id;
    v_left := least(coalesce(v_h.banked_ms, 0),
                    (v_held->>'banked_ms')::bigint - greatest(0, coalesce(v_h.spent_ms, 0) - coalesce((v_held->>'spent_ms')::bigint, 0)));
    if v_left < coalesce(public.hr_hunt_limit('swing_interval_ms'), 2000) then return null; end if;
    return jsonb_build_object('level', (v_held->>'level')::int, 'banked_ms', v_left, 'user', v_held->'user', 'slot', v_held->'slot');
  end if;
  if exists (select 1 from public.hunt_parties p where p.id = p_instance) then
    select p.leader_user, p.leader_slot into v_lu, v_ls from public.hunt_parties p where p.id = p_instance and p.closed_at is null;
    if v_lu is null or not exists (select 1 from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null
                                                                        and h.user_id = v_lu and h.slot = v_ls) then
      return null; end if;
  else
    select count(*)::int, min(h.user_id::text)::uuid, min(h.slot) into v_n, v_lu, v_ls
      from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    if v_n <> 1 then return null; end if;
  end if;
  -- THE SWITCH (2027-03-21-feature-switches.sql): off for the leader's account, its banked hours are not read.
  if not public.hr_feature_on('scaled_hunts', v_lu) then return null; end if;
  select * into v_h from public.player_scaled_hours h where h.user_id = v_lu and h.slot = v_ls and h.hunt_id = v_i.hunt_id;
  if not found or not v_h.use_on or v_h.banked_ms < coalesce(public.hr_hunt_limit('swing_interval_ms'), 2000) then return null; end if;
  v_to := public.hr_scaled_level(v_i.hunt_id, public.hr_level_of(v_lu, v_ls));
  if v_to is null then return null; end if;
  return jsonb_build_object('level', v_to, 'banked_ms', v_h.banked_ms, 'user', v_lu, 'slot', v_ls);
end $fn$;

create or replace function public.hr_scaled_hours_hold()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- LEVER-GATES (1053-lever-gates.sql): BEFORE a write that turns a hero's scaled switch or raises its bank lands, every open instance
-- the hero hunts that ground in keeps the scale as it stands now (hr_scaled_hunt_of, read before this write) until the seed horizon
-- of its open sessions. A hold still in force is only pushed later: it already keeps the scale the shown seeds were played with.
declare v_r record; v_sc jsonb; v_spent bigint;
begin
  for v_r in
    select s.instance_id as inst, max(public.hr_hunt_seed_horizon(s.id)) as until
      from public.hunt_sessions s
     where s.ended_at is null
       and s.instance_id in (select x.instance_id from public.hunt_sessions x
                              where x.user_id = new.user_id and x.slot = new.slot and x.hunt_id = new.hunt_id and x.ended_at is null)
     group by s.instance_id
  loop
    -- Gone: every hold no window can still start under (its instance closed, or settled past it).
    delete from public.hunt_scale_holds h
     where not exists (select 1 from public.hunt_instances i where i.id = h.instance_id and h.until >= i.settled_to
                         and exists (select 1 from public.hunt_sessions x where x.instance_id = i.id and x.ended_at is null));
    if exists (select 1 from public.hunt_scale_holds h join public.hunt_instances i on i.id = h.instance_id
                where h.instance_id = v_r.inst and h.until >= i.settled_to) then
      update public.hunt_scale_holds set until = greatest(until, v_r.until) where instance_id = v_r.inst;
    else
      v_sc := public.hr_scaled_hunt_of(v_r.inst);
      if v_sc is not null then
        select h.spent_ms into v_spent from public.player_scaled_hours h
         where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int
           and h.hunt_id = (select i.hunt_id from public.hunt_instances i where i.id = v_r.inst);
        v_sc := v_sc || jsonb_build_object('spent_ms', coalesce(v_spent, 0));
      end if;
      insert into public.hunt_scale_holds (instance_id, until, scale) values (v_r.inst, v_r.until, coalesce(v_sc, 'null'::jsonb))
        on conflict (instance_id) do update set until = excluded.until, scale = excluded.scale, at = now();
    end if;
  end loop;
  return new;
end $fn$;
revoke execute on function public.hr_scaled_hours_hold() from public, anon, authenticated, service_role;

drop trigger if exists hr_scaled_hours_hold_ins on public.player_scaled_hours;
create trigger hr_scaled_hours_hold_ins before insert on public.player_scaled_hours
  for each row execute function public.hr_scaled_hours_hold();
drop trigger if exists hr_scaled_hours_hold_upd on public.player_scaled_hours;
create trigger hr_scaled_hours_hold_upd before update on public.player_scaled_hours
  for each row when (old.use_on is distinct from new.use_on or new.banked_ms > old.banked_ms)
  execute function public.hr_scaled_hours_hold();

-- ── §4 THE SELF-CHECK, BY EXECUTING IT ───────────────────────────────────────
-- (a) the hold seat a window plays, at, before and with no horizon; (b) owner-only: no client or engine role executes a new
-- function or holds a privilege on the table; RLS on; the two triggers present, the update one firing only on a switch or a rise;
-- (c) each body at its post pin, and the engine still executes the instance read.
do $$
declare v_p public.hunt_parties; v_from timestamptz := now() + interval '34 seconds'; v_role text;
begin
  v_p := jsonb_populate_record(null::public.hunt_parties,
           jsonb_build_object('hold_seat', 2, 'hold_seat_was', 1, 'hold_seat_from', v_from));
  if public.hr_party_hold_played(v_p, v_from - interval '1 millisecond') is distinct from 1
     or public.hr_party_hold_played(v_p, v_from) is distinct from 2 then
    raise exception 'VERIFY(a): a window before the horizon plays seat %, at it seat % (want 1, 2)',
      public.hr_party_hold_played(v_p, v_from - interval '1 millisecond'), public.hr_party_hold_played(v_p, v_from); end if;
  v_p := jsonb_populate_record(null::public.hunt_parties, jsonb_build_object('hold_seat', 3, 'hold_seat_was', 1));
  if public.hr_party_hold_played(v_p, now()) is distinct from 3 then
    raise exception 'VERIFY(a): with no horizon the pick plays seat %, not 3', public.hr_party_hold_played(v_p, now()); end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      if has_function_privilege(v_role, 'public.hr_party_hold_played(public.hunt_parties,timestamp with time zone)', 'execute')
         or has_function_privilege(v_role, 'public.hr_party_hold_put(uuid,integer)', 'execute')
         or has_function_privilege(v_role, 'public.hr_scaled_hours_hold()', 'execute')
         or has_table_privilege(v_role, 'public.hunt_scale_holds', 'select,insert,update,delete,truncate,references,trigger') then
        raise exception 'VERIFY(b): % reaches a lever-gates function or the scale holds', v_role; end if;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.hunt_scale_holds'::regclass) then
    raise exception 'VERIFY(b): hunt_scale_holds has RLS off'; end if;
  if (select count(*) from pg_trigger where tgname like 'hr_scaled_hours_hold%' and not tgisinternal) <> 2
     or strpos(pg_get_triggerdef((select oid from pg_trigger where tgname = 'hr_scaled_hours_hold_upd')), 'new.banked_ms > old.banked_ms') = 0 then
    raise exception 'VERIFY(b): the scaled hours triggers are not the two this file makes'; end if;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
    raise exception 'VERIFY(c): the spliced instance read lost hr_engine''s EXECUTE'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) not in ('01b65ee3b44238d75fefb3aaedca260d', '3097347b88e3a5187f2f12cf0d7fbcae', 'e0b569fcc3d856126934683a2129363e')
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_party_hold_set(integer,integer,uuid)'::regprocedure) is distinct from '09b2d6618bc975ea70dd8fdcad169121'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_party_hold_clear()'::regprocedure) is distinct from '4bc8c642106dba6846780e5808142b4f'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_scaled_hunt_of(uuid)'::regprocedure) is distinct from 'e409f4934708ce768b038a1086ce48db' then
    raise exception 'VERIFY(c): a body landed off its post pin: instance_read %, hold_set %, hold_clear %, scaled_hunt_of %',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_party_hold_set(integer,integer,uuid)'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_party_hold_clear()'::regprocedure),
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_scaled_hunt_of(uuid)'::regprocedure); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'lever-gates: the hold seat and scaled hours play from the seed horizon, like every other lever';
end $$;
