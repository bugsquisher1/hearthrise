-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-23-session-modes.sql — A HUNT SESSION PLAYS IN A MODE, FROZEN BY THE SERVER AT ITS START; A MODE'S DEATH COSTS ITS OWN
--   SHARE AND A MODE THAT COSTS NOTHING SPENDS NO BLESSING (lane/c-tower-mode, backend-architect, 2026-11-14; Tyler 2026-11-14,
--   the board's "2026-11-14 The Burning Tower" §3: "dying has no penalty", "fitting in the system to ensure people are not losing
--   exp while doing these game modes"). Phase 1 of the Burning Tower: the general switch. No ground names a mode yet, so nothing a
--   player can see moves: every instance freezes `hunt` and every death costs what it costs today.
--   STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §6.
--   ON THE EA SECURITY LIST: what a death takes from Level XP feeds a ranked board, and the settle's bounds are restated.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The Tower (and the capture-the-flag mode after it) needs deaths that cost nothing, and only if nothing else about the session
-- can be farmed for it. That is one switch on the SESSION, not a Tower rule: src/data/session-modes.js holds one row per mode (the
-- full-price `hunt` every ground plays, and `tower`: no death loss, Blessings untouched, no coin, no drops), and refuses to load a
-- mode whose death costs less than a hunt's and that still pays coin, drops or Bestiary. The rows reach the server as
-- hr_session_modes / hr_ground_session_modes (2027-04-23-session-modes-catalogue.generated.sql, tools/gen-session-modes.mjs).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hunt_instances.session_mode  text NOT NULL, FK hr_session_modes(mode_id). NEW. The mode the instance plays, written ONLY by the
--   trigger hr_hunt_mode_freeze (BEFORE INSERT OR UPDATE OF hunt_id, session_mode): the server's own catalogue for the instance's
--   ground (hr_session_mode_of: its hr_ground_session_modes row, else the one default row), never a caller's value. So it is
--   frozen when an instance opens (a solo session's own, hr_hunt_instance_solo; a party's first), and again when a party's
--   instance restarts on a ground (hr_hunt_enter_for writes hunt_id): per hunt, like density and tier
--   (2027-02-10-party-instance-reset.sql's class). A catalogue changed mid-hunt never moves a running instance. Any write of the
--   column itself is re-derived from the catalogue, so even an owner's stray UPDATE cannot set a mode a ground does not name.
--   No intent, verb, RPC argument or edge request carries a mode (tests/mode-death.mjs MD-INTENT).
-- hr_hunt_instance_read  RESTATED WHOLE (2027-04-22-target-kind.sql's image, §0 pins it). One change: the instance carries
--   `session_mode`. hr-accrue reads it there and nowhere else (hunt-settle.js); a read with none or one the engine has no row for
--   proposes nothing (`mode_pending`, the deploy-gap rule world_shape_pending set: no refusal, no count, no forfeit).
-- hr_hunt_apply_member  RESTATED WHOLE (2027-04-16-combat-training.sql's image, §0 pins it). SESSION-MODES marks three changes:
--   (1) it loads the instance's mode row (none: catalogue_missing, refused whole);
--   (2) a death in a mode whose `blessings` is false never calls hr_blessing_take: the Blessings stay held, nothing is journalled;
--   (3) every death bound is hr_death_xp_mode_max(skill, xp, the mode's death_loss_pm): the one rule at the mode's share, exact in
--       numeric (floor(xp x death_xp_permille x mode_pm / 1e6)); at 1000 it is hr_death_xp_max to the unit, at 0 it is 0, so in a
--       mode that costs nothing ANY death XP is refused `death_xp_over`. The engine prices the death at the same share
--       (src/core/action-rules.js modeDeathShare, combat-sim.js die), so its proposal is empty: TWO LOCKS.
-- hr_death_xp_mode_max(p_skill text, p_xp bigint, p_mode_pm int) -> bigint  NEW, owner-only. hr_death_xp_max RESTATED to call it at
--   1000 (one formula; its answer is unchanged for every input, §6(b)).
-- hr_session_mode_of(p_hunt text) -> text, hr_hunt_mode_freeze() trigger  NEW, owner-only.
-- ERRORS (hr_reject, inside the settle; the edge's refusal path): death_xp_over (the existing code, now at the mode's share) ·
--   catalogue_missing {what: session_mode}. None is a client RPC's answer.
-- NOT HERE (phase 2, with the Tower's ground, engine and settle together): what a mode PAYS. Its coin, drops, Bestiary and xpPm
--   columns are the data's ruled rows, held to the anti-farm rule by the catalogue's CHECK, and read by nothing yet: no ground names a
--   mode, and tools/gen-session-modes.mjs refuses a ground naming one that pays less than a hunt, so every instance pays as a hunt
--   (the CATALOGUE's mapping is the door: §6 and tests/mode-death.mjs map a ground to the Tower by hand). That build makes the engine pay a mode's row (src/core/hunt-rewards.js) AND refuses a window
--   that pays what its mode does not here (the called room's rule, called_pays, for a mode), in one change, with the measured XP guard
--   (the board's §7). Also phase 2: the death line in the popup and the wiki, the live view's prediction (hunt-settle.js huntLive).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- The freeze is a row trigger inside the statement that writes the instance, under the lock that statement already holds (the
-- party row's `for update` in hr_hunt_enter_for; a solo instance is born with its session). The settle reads the mode under the
-- instance lock hr_hunt_apply_instance takes before any member applies (unchanged order: instance, then each member's character
-- lock in (user_id, slot) order). Nothing new is written per settle: no journal row, no counter. A replayed intent replays as before.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- No new client verb, argument or grant. The only way to a mode is a ground the SERVER's catalogue maps to it, frozen at start.
-- A forged or buggy proposal in a no-loss mode can take no XP (bound 0) and use no Blessing (never called). In a hunt every bound
-- is exactly today's. Nothing crosses to another player. Risk named for Security: hr_ground_session_modes is the whole door, so the
-- generator's rule and its §4 are the review surface (a free-death mode that pays is refused by the data, the generator and the
-- table's CHECK). Until phase 2 wires what a mode pays, the generator maps no ground to a mode that pays less than a hunt (NOT HERE).
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- One short text per instance row (the default's 4 bytes). Per settle: one primary-key join of hunt_instances and hr_session_modes
-- (2 rows) in each member's apply, and the instance read's extra key. Per instance start: two primary-key probes. No new journal
-- row, ever; a mode costs nothing at 100x.
--
-- EDGE: MOVES (pack-edge --hash): src/data/session-modes.js, src/core/action-rules.js modeDeathShare, combat-sim.js die, accrual.js,
--   hunt-settle.js (reads session_mode; mode_pending) and set-activity.js (a pending mode owes its window, OWED_WINDOW_REASONS).
--   Apply THIS FILE (and its catalogue) FIRST, then deploy: an older engine ignores session_mode and plays `hunt`, which every
--   instance is; a newer engine on an older database waits (mode_pending) and forfeits nothing.
-- CLIENT: none. ORDER: 2027-04-23-session-modes-catalogue.generated.sql, then this file, after 2027-04-22-target-kind.sql. It restates
--   hr_hunt_apply_member and hr_hunt_instance_read; no staged file on main touches either. hr_hunt_settle_session is NOT touched
--   (lane/c-faction-standing restates it whole; no overlap).
-- REVERSIBLE: re-apply the §0 images of hr_hunt_apply_member (2027-04-16-combat-training.sql), hr_hunt_instance_read
--   (2027-04-22-target-kind.sql) and hr_death_xp_max (2027-03-25-death-share.sql); drop the trigger, hr_hunt_mode_freeze,
--   hr_session_mode_of, hr_death_xp_mode_max; `alter table public.hunt_instances drop column session_mode`;
--   then the catalogue's two tables. No value moved to undo.
-- IDEMPOTENT: a second apply finds the column, its constraints and no NULL, restates every body byte-identical, re-creates the
--   trigger, and §6 rolls back its probes.
-- WIPE: hunt_instances is on the character wipe's list already; the two catalogue tables are on its no-player list.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (the replayed chain's, which live-hash-drift measured equal
-- to production's), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_session_modes') is null or to_regclass('public.hr_ground_session_modes') is null
     or (select count(*) from public.hr_session_modes where is_default) <> 1 then
    raise exception 'PRECONDITION: apply 2027-04-23-session-modes-catalogue.generated.sql first (hr_session_modes with one default, hr_ground_session_modes)'; end if;
  if to_regclass('public.hunt_instances') is null or to_regclass('public.hr_hunt_grounds') is null then
    raise exception 'PRECONDITION: hunt_instances and the hunt-sessions catalogue first'; end if;
  if to_regprocedure('public.hr_hunt_limit(text)') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_skill_xp_for_level(text,integer)') is null or to_regprocedure('public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '5786ead704f7d4230d49aff8921ed288', 'add877806bb908e8e79416f2baafe912'),
    ('public.hr_hunt_instance_read(uuid,integer)', 'd0cb8c8ec3e038ff865ce81b05242d49', '158da9ba7d6a68295ba69ef346d77e27'),
    ('public.hr_death_xp_max(text,bigint)', 'ef0f624182b0f6131490672deab42f51', 'ed4e6349ca365c97b245cb0ec23b4458')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file restates (%) nor its own (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE INSTANCE'S MODE, FROZEN FROM THE SERVER'S CATALOGUE ───────────────
-- The mode a hunt on `p_hunt` plays: the ground's row, else the one default (never NULL while the catalogue holds a default).
create or replace function public.hr_session_mode_of(p_hunt text)
returns text language sql stable set search_path = public, pg_catalog as $$
  -- SESSION-MODES (2027-04-23-session-modes.sql).
  select coalesce((select g.mode_id from public.hr_ground_session_modes g where g.hunt_id = p_hunt),
                  (select m.mode_id from public.hr_session_modes m where m.is_default))
$$;

-- THE FREEZE: whatever writes an instance's ground (its start, a party's restart) or its mode, the mode is the catalogue's for that ground.
create or replace function public.hr_hunt_mode_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- SESSION-MODES (2027-04-23-session-modes.sql): never a caller's value, never NULL.
  new.session_mode := public.hr_session_mode_of(new.hunt_id);
  if new.session_mode is null then
    raise exception 'hr_hunt_mode_freeze: no session mode for % (the catalogue holds no default)', new.hunt_id using errcode = '23502'; end if;
  return new;
end $$;

alter table public.hunt_instances add column if not exists session_mode text;
-- Every instance already open plays the mode its ground names today (every ground: the default), before the column is required.
update public.hunt_instances set session_mode = public.hr_session_mode_of(hunt_id) where session_mode is null;
alter table public.hunt_instances alter column session_mode set not null;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_instances'::regclass and conname = 'hunt_instances_session_mode_fk') then
    alter table public.hunt_instances add constraint hunt_instances_session_mode_fk
      foreign key (session_mode) references public.hr_session_modes (mode_id); end if;
end $mig$;
comment on column public.hunt_instances.session_mode is
  '2027-04-23-session-modes.sql: the session mode this instance plays (hr_session_modes), frozen from the server''s ground catalogue when it starts and when a party''s instance restarts on a ground (trigger hr_hunt_mode_freeze); never a caller''s value. Read by hr_hunt_instance_read (the engine) and hr_hunt_apply_member (the bounds).';
drop trigger if exists hr_hunt_mode_freeze on public.hunt_instances;
create trigger hr_hunt_mode_freeze before insert or update of hunt_id, session_mode on public.hunt_instances
  for each row execute function public.hr_hunt_mode_freeze();

-- ── §2 THE BOUND ──────────────────────────────────────────────────────────────
-- The most one death in a mode at `p_mode_pm` may take from p_xp of p_skill: hr_death_xp_max's rule (2027-03-25-death-share.sql) at
-- that share, in exact numeric. src/core/action-rules.js modeDeathShare is the engine's twin.
create or replace function public.hr_death_xp_mode_max(p_skill text, p_xp bigint, p_mode_pm int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_rate int := public.hr_hunt_limit('death_xp_permille'); v_x bigint := greatest(coalesce(p_xp, 0), 0);
begin
  -- SESSION-MODES (2027-04-23-session-modes.sql).
  if v_rate is null or v_rate < 0 or v_rate > 1000 or p_skill is null or p_mode_pm is null or p_mode_pm < 0 or p_mode_pm > 1000 then return null; end if;
  if p_skill = 'level' then return floor(v_x::numeric * v_rate * p_mode_pm / 1000000)::bigint; end if;
  return floor((v_x - public.hr_skill_xp_for_level(p_skill, public.hr_skill_level(p_skill, v_x)))::numeric * v_rate * p_mode_pm / 1000000)::bigint;
end $fn$;

-- The full price, one formula: the mode rule at 1000.
create or replace function public.hr_death_xp_max(p_skill text, p_xp bigint)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- SESSION-MODES (2027-04-23-session-modes.sql): the full price is hr_death_xp_mode_max at 1000 (one formula; the answer is unchanged).
  return public.hr_death_xp_mode_max(p_skill, p_xp, 1000);
end $fn$;
comment on function public.hr_death_xp_max(text, bigint) is
  '2027-03-25-death-share.sql: the most one death may take from p_xp of p_skill (Tyler 2026-11-09: a share of the TOTAL Level XP, it can take a Level, never below Level 1; a skill''s share of its progress, never a level). 2027-04-23-session-modes.sql: hr_death_xp_mode_max at 1000, the settle''s bound in a full-price mode; src/core/action-rules.js levelDeathLoss / skillDeathLoss are the engine''s twin.';

-- ── §3 THE ENGINE'S READ (restated whole: the §0 image plus the instance's `session_mode`) ─
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
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0) m0
               -- TARGET-KIND: the member's OWN hunt_density row on this ground, only a kind the catalogue holds there; no row, no key. Any
               -- options.target_kind is dropped first (hr_action_set_options refuses the key; this read does not lean on that alone).
               cross join lateral (select jsonb_set(m0.r0, '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', d.target_kind) from public.hunt_density d
                      join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind
                     where d.user_id = h.user_id and d.slot = h.slot and d.hunt_id = v_i.hunt_id), '{}'::jsonb)) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

-- ── §4 THE SETTLE (restated whole: the §0 image with the three SESSION-MODES changes) ─
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
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
  v_mode  public.hr_session_modes%rowtype;  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance's mode, frozen at its start
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
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';
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
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
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
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
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
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

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
  if not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
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

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
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
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §5 GRANTS: every new body is the owner's; the restated ones keep theirs (create or replace keeps an ACL) ─
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_session_mode_of(text)', 'public.hr_hunt_mode_freeze()', 'public.hr_death_xp_mode_max(text,bigint,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-00005e550001';
  k        constant text := '000000c0-0000-4000-b000-5e55';
  c_ground constant text := 'mill_cellar';
  v        jsonb;
  v_sig    text;
  v_role   text;
  v_def    text;
  v_x      bigint;
  v_rate   int := public.hr_hunt_limit('death_xp_permille');
  v_sid    uuid;
begin
  -- (a) THE SURFACE: no client and no engine role runs a new body; the restated two keep their own; the column is required, keyed and
  --     frozen by its trigger; the catalogue holds no policy; hygiene STRICT is green.
  foreach v_sig in array array['public.hr_session_mode_of(text)', 'public.hr_hunt_mode_freeze()', 'public.hr_death_xp_mode_max(text,bigint,integer)',
                               'public.hr_death_xp_max(text,bigint)',
                               'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_instance_read(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then raise exception 'session-modes §6(a): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  if (select attnotnull from pg_attribute where attrelid = 'public.hunt_instances'::regclass and attname = 'session_mode') is distinct from true
     or not exists (select 1 from pg_constraint where conrelid = 'public.hunt_instances'::regclass and conname = 'hunt_instances_session_mode_fk')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.hunt_instances'::regclass and tgname = 'hr_hunt_mode_freeze' and not tgisinternal) then
    raise exception 'session-modes §6(a): hunt_instances.session_mode is not required, keyed and frozen by its trigger'; end if;
  foreach v_sig in array array['public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_instance_read(uuid,integer)'] loop
    if strpos((select prosrc from pg_proc where oid = v_sig::regprocedure), 'SESSION-MODES (2027-04-23') = 0 then
      raise exception 'session-modes §6(a): % has no SESSION-MODES arm', v_sig; end if;
  end loop;
  v_def := (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  if strpos(v_def, 'public.hr_death_xp_max(') > 0 or strpos(v_def, 'if v_nd > 0 and v_mode.blessings then') = 0 then
    raise exception 'session-modes §6(a): a death bound is not the mode''s, or the Blessing is not the mode''s'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (b) THE BOUND: at 1000 it is hr_death_xp_max to the unit, at 0 it is nothing, at 500 it is the exact product (Level and a skill).
  if v_rate is null then raise exception 'session-modes §6(b): no death_xp_permille'; end if;
  foreach v_x in array array[0, 1, 999, 1000, 16667, 123457, 98765432101]::bigint[] loop
    if public.hr_death_xp_mode_max('level', v_x, 1000) is distinct from floor(v_x::numeric * v_rate / 1000)::bigint
       or public.hr_death_xp_max('level', v_x) is distinct from public.hr_death_xp_mode_max('level', v_x, 1000)
       or public.hr_death_xp_max('melee', v_x) is distinct from public.hr_death_xp_mode_max('melee', v_x, 1000)
       or public.hr_death_xp_mode_max('level', v_x, 0) <> 0 or public.hr_death_xp_mode_max('melee', v_x, 0) <> 0
       or public.hr_death_xp_mode_max('level', v_x, 500) is distinct from floor(v_x::numeric * v_rate * 500 / 1000000)::bigint then
      raise exception 'session-modes §6(b): the bound at % XP is not the mode''s share of the one rule', v_x; end if;
  end loop;
  -- (c) THE FREEZE, on a real hunt: an instance opens on the default; the catalogue moving mid-hunt leaves it; the engine's read
  --     carries it; a stray write of the column is re-derived; the next hunt freezes the catalogue's new mode.
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Modes') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'session-modes §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-modes §6(c): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    if exists (select 1 from public.hr_ground_session_modes where hunt_id = c_ground) then
      raise exception 'session-modes §6(c): % names a mode in the catalogue (re-aim the probe)', c_ground; end if;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || '00000001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-modes §6(c): entering answered %', v; end if;
    select h.id into v_sid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    if (select i.session_mode from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid)
         is distinct from (select mode_id from public.hr_session_modes where is_default) then
      raise exception 'session-modes §6(c): a hunt on a ground that names no mode did not freeze the default'; end if;
    insert into public.hr_ground_session_modes (hunt_id, mode_id) values (c_ground, 'tower');
    if public.hr_hunt_instance_read(v_u, 0)->'instance'->>'session_mode' is distinct from (select mode_id from public.hr_session_modes where is_default) then
      raise exception 'session-modes §6(c): the catalogue moved a running instance (the engine reads %)', public.hr_hunt_instance_read(v_u, 0)->'instance'->>'session_mode'; end if;
    update public.hunt_instances i set session_mode = 'hunt' from public.hunt_sessions h where h.id = v_sid and i.id = h.instance_id;
    if (select i.session_mode from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.id = v_sid) is distinct from 'tower' then
      raise exception 'session-modes §6(c): a write of the column kept a value its ground does not name'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, c_ground, '[]'::jsonb, 0, null, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'session-modes §6(c): entering again answered %', v; end if;
    if public.hr_hunt_instance_read(v_u, 0)->'instance'->>'session_mode' is distinct from 'tower' then
      raise exception 'session-modes §6(c): the next hunt did not freeze the catalogue''s mode (the engine reads %)', public.hr_hunt_instance_read(v_u, 0)->'instance'->>'session_mode'; end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    raise exception using errcode = 'HRM01', message = 'session-modes §6 complete - rolling back';
  exception when sqlstate 'HRM01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hr_ground_session_modes where hunt_id = c_ground)
     or exists (select 1 from public.player_intents where user_id = v_u) then raise exception 'session-modes §6(d): §6 LEAKED a probe row'; end if;
  raise notice 'session-modes: the mode is frozen from the server''s catalogue and read by the engine, the bound is the mode''s share of the one rule; all green';
end $$;
