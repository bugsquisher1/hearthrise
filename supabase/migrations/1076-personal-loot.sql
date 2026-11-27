-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1076-personal-loot.sql — PERSONAL LOOT'S SERVER HALF: each hunt instance's loot rule, frozen from the switch when its
--   hunt begins, handed to the engine by the instance read (lane/p1-personal-loot, backend-architect, 2026-11-27; 20-v030-the-roads.md
--   section 4 Band 2 P1, 21-flame-temper-imbue-loot.md section 4, 02-architecture.md package 4, 12-targets.md 8.6.1, 13-security-list.md S-31).
--
-- STATUS: supabase/migration-notes/1076-personal-loot.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1063-flame-temper.sql (the personal_loot switch), 1071-trait-pieces.sql
--   and 1074-inner-flame-luck.sql (the instance read this file restates whole), and 1069-gear-phase-b-hunt-sessions-catalogue.generated.sql
--   (regenerated in place by this lane: the engine's world shape gains the hero unit's `took`). Applied as ONE transaction by the apply tool;
--   never begin/commit here. Ends with its §5 self-check.
--
-- ── WHAT PERSONAL LOOT IS (the engine's half, src/core/hunt-rewards.js payPersonal, src/core/hunt/took-part.js) ──────────────
-- Every hero that TOOK PART in a kill (alive at it, and struck at a monster or healed or shielded a hero since its pull began) rolls the
-- kill's whole drop table itself: each row at 1 / (the heroes rolling) of its chance, on its own odds (its weakness and drop buff), on its
-- own server-only loot stream (seed domain l:<unit>, one a swing), and what it finds goes to its own bag. No round-robin, no rare roll.
-- The kill's expected drops are the row's in any party (drops.js effectiveDropChance `share`), so a party never drops more than its heroes
-- would apart. The Trait roll follows the same rollers. Coin, XP and the kill counters stay the living heroes' even split (unchanged).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- COLUMN hunt_instances.personal_loot boolean NOT NULL default false. NEW. The instance's loot rule, written ONLY by the trigger
--   hr_hunt_loot_freeze (BEFORE INSERT OR UPDATE OF hunt_id, personal_loot): the switch personal_loot as the instance is made, and again
--   when it moves to another ground (a party's restart there is a new hunt); an UPDATE that names the column alone keeps the frozen value.
--   Never a caller's value. WHY FROZEN: a settle reads the rule at its window's start, and a watched hunt cuts its windows at other
--   instants than a closed one. A rule read afresh each window would roll the window holding a switch flip by another rule on each door,
--   so the same hunt would store other loot viewed and closed (CLAUDE.md section 6). Frozen per instance, the one hunt rolls by one rule.
-- THE READ (hr_hunt_instance_read, RESTATED WHOLE: 1071-trait-pieces.sql's body with 1074-inner-flame-luck.sql's splice folded in, plus
--   the instance key `personal_loot`). The edge hands the engine personalLoot only when it is true (hunt-settle.js proposeHuntSettle).
-- THE COMMIT: unchanged. Each seat's loot is its own member's delta, credited to its own bag by its own hr_hunt_apply_member and journalled
--   on its own ledger row; the item bound is per seat (its own journalled kills x the most one kill of the ground drops of the item,
--   hr_hunt_kill_bounds), which personal loot never loosens: a roller rolls each row at most once a kill, as the party roll did. No item
--   crosses seats: the engine gives a roll's find to the roller alone, and no settle path moves an item between members.
-- REFUSALS: none new. A member delta over its seat's bound is refused value_over as before.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The freeze runs inside whatever statement makes or moves the instance (hr_hunt_enter, a party start or restart), under its locks; it
-- reads one flag row and writes the row being inserted. The read is STABLE and reads the frozen column. The settle is unchanged: its
-- instance lock, world CAS and per-member intents make a replay or a retry land nothing twice. Nothing here takes a new lock.
--
-- ── EXPLOIT SURFACE ──────────────────────────────────────────────────────────
-- No client verb, no client grant: hunt_instances has no client write (asserted), the trigger function and the read are not executable by
-- a client role (asserted), and the rule is the server's switch, never a request value. The dice are the edge's (the same trust every drop
-- rests on); what Postgres re-proves is unchanged and per seat. Delta for the pre-EA review (13-security-list.md S-31): personal loot turns
-- one party roll a kill into n rolls at 1 / n, so the per-seat ceiling holds but a party's ceiling per kill is n x the table's (it was n x
-- before too, each seat being bounded alone). A statistical bound on a seat's Rare and Trophy rows is the review's to ask for.
--
-- ── COST (100x: 2,000 accounts x 4 heroes x 10 h) ────────────────────────────
-- One boolean (1 byte) on each hunt_instances row and one hr_flag_on at each instance insert or ground change: about 4,000 instance rows a
-- day, no new row and no new statement a settle. The read adds one jsonb key. The engine's world gains one bool a hero unit (about 6
-- bytes a hero in the stored world). Lit, the settle writes what each seat found; the per-seat bag writes are measured by
-- tests/per-player-cost.mjs --lit (this lane's LANE DONE commit).
--
-- EDGE: hr-accrue of lane/p1-personal-loot (src/core/hunt-rewards.js payPersonal, src/core/hunt/took-part.js, hunt-settle.js personalLoot).
--   The world shape moves (the hero unit's `took`), so 1069-gear-phase-b-hunt-sessions-catalogue.generated.sql and the edge go out together,
--   catalogue first (an engine of another shape proposes nothing: world_shape_pending). This file in either order with the edge: an older edge
--   ignores personal_loot, an older read hands none, and the switch stays off until the pre-EA Security GO.
-- REVERSIBLE: re-apply 1071-trait-pieces.sql's §4 body and 1074-inner-flame-luck.sql's §6 read splice (the read's chain end), drop the
--   trigger hr_hunt_loot_freeze and its function, `alter table public.hunt_instances drop column personal_loot`. No row is lost.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS, AND THE IMAGE THIS FILE RESTATES ───────────────────────
do $mig$
declare v_md5 text;
begin
  if not exists (select 1 from public.hr_flags where key = 'personal_loot') then
    raise exception 'PRECONDITION: 1063-flame-temper.sql first (the personal_loot switch)'; end if;
  if to_regclass('public.hunt_instances') is null or to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_hunt_instance_read(uuid,integer)') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)') is null or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamptz,boolean)') is null then
    raise exception 'PRECONDITION: a table or helper this file reads is missing'; end if;
  -- THE PIN: the read is the chain end this file restates (1071's whole body with 1074's splice), or this file's own image (a retry)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if v_md5 is distinct from '251299cf2e9abba9e5071de2fe8308d9' and v_md5 is distinct from '3d6b400342a45792fd331fb61566c862' then
    raise exception 'PIN: hr_hunt_instance_read is neither the image this file restates (251299cf2e9abba9e5071de2fe8308d9) nor its own (3d6b400342a45792fd331fb61566c862): md5 % - another file moved it; re-derive', v_md5;
  end if;
  -- the chain end's text, for §5's proof that the restatement adds exactly this file's lines (empty on a retry: the read is already ours)
  perform set_config('hr.p1_read_pre', case when v_md5 = '251299cf2e9abba9e5071de2fe8308d9' then (select replace(prosrc, chr(13), '') from pg_proc
                                         where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) else '' end, true);
end $mig$;

-- ── §1 THE INSTANCE'S LOOT RULE ──────────────────────────────────────────────
alter table public.hunt_instances add column if not exists personal_loot boolean not null default false;
comment on column public.hunt_instances.personal_loot is
  '1076-personal-loot.sql: whether this instance''s kills roll PERSONAL LOOT (each hero that took part rolls its own drops, src/core/hunt-rewards.js payPersonal). Frozen from the hr_flags switch personal_loot when the instance is made or moves to another ground (trigger hr_hunt_loot_freeze); never a caller''s value. Read by hr_hunt_instance_read (the engine).';

-- ── §2 THE FREEZE ────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_loot_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- PERSONAL-LOOT (1076-personal-loot.sql): the switch's word as the hunt begins on a ground, frozen until it changes ground. An UPDATE that
  -- names the column alone keeps the frozen value, so no caller (and no later file's statement) ever sets it.
  if tg_op = 'INSERT' or new.hunt_id is distinct from old.hunt_id then
    new.personal_loot := public.hr_flag_on('personal_loot');
  else
    new.personal_loot := old.personal_loot;
  end if;
  return new;
end $fn$;
revoke all on function public.hr_hunt_loot_freeze() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_loot_freeze on public.hunt_instances;
create trigger hr_hunt_loot_freeze before insert or update of hunt_id, personal_loot on public.hunt_instances
  for each row execute function public.hr_hunt_loot_freeze();

-- ── §3 hr_hunt_instance_read, RESTATED WHOLE (1071's body, 1074's splice folded in; this file's lines: PERSONAL-LOOT) ──
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
  -- RETIRE-TIER-CHAIN (1072-retire-tier-chain.sql): no tier and no scale; off the Danger scale a member plays the ground's rows as written.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance carries the session mode the server froze at its start (session_mode),
  -- the engine's only source of it (hunt-settle.js; none, or one it has no row for, and it proposes nothing).
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the instance carries the Burning Tower's floor whose room stands or stands next (tower_floor:
  -- hr_tower_floor_of, the server's own record), the engine's only source of it; null on every other ground.
  -- LEVER-HORIZON (1005-lever-horizon.sql): RESTATED WHOLE. The First target is the member read's (the window's setup, held past a
  -- lever inside the seed horizon), still only a kind the ground fields; its key is dropped from the session, which is byte-identical.
  -- TRAIT-PIECES (1071-trait-pieces.sql): RESTATED WHOLE (1053-lever-gates.sql's body and 1056-danger-scale.sql's splice folded in). Each
  -- member carries the pieces it wears (worn_traits, worn_signature) and what its Trait roll reads (drops); the instance whether the roll
  -- is on (trait_drops). Each is null or false while its switch is off, so the engine plays and rolls exactly what it always did.
  -- PERSONAL-LOOT (1076-personal-loot.sql): RESTATED WHOLE (1071's body with 1074-inner-flame-luck.sql's splice folded in). The instance
  -- carries its own loot rule (personal_loot: hunt_instances.personal_loot, frozen from the switch when its hunt began on its ground by the
  -- trigger hr_hunt_loot_freeze), the engine's only source of it (hunt-settle.js); false while the switch is off: every kill rolls as before.
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
      'session_mode', v_i.session_mode,
      'tower_floor', public.hr_tower_floor_of(v_i.id),
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select public.hr_party_hold_played(p, v_i.settled_to) from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- TRAIT-PIECES (1071-trait-pieces.sql): whether this window's kills roll Traits (the switch trait_drops; hunt-settle.js traitDropsOf).
      'trait_drops', public.hr_flag_on('trait_drops'),
      -- INNER-FLAME (1074-inner-flame-luck.sql): the Remains items the company fires burn (hr_flame_fuel), null while the switch inner_flame
      -- is off (hunt-settle.js flameDropsOf): the edge names each one a hero picks up only then, and only these.
      'flame', case when public.hr_flag_on('inner_flame') then (select coalesce(jsonb_agg(f.item_id order by f.item_id), '[]'::jsonb) from public.hr_flame_fuel f) end,
      -- PERSONAL-LOOT (1076-personal-loot.sql): whether this instance's kills roll personal loot (its frozen rule; hunt-settle.js personalLoot).
      'personal_loot', v_i.personal_loot,
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
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density)
                                   -- DANGER-SCALE (1056-danger-scale.sql): the stance and start step the instance froze, null on a tier hunt (overlaid last)
                                   || jsonb_build_object('risk', v_i.risk, 'danger', v_i.danger)) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
                 -- TRAIT-PIECES (1071-trait-pieces.sql): the Traits of the pieces this hero wears ([{ id, rank }]) and the Signature of the first
                 -- one it put on, the server's own rows only; and what its Trait roll reads at this window's start (pity, luck). Null while dark.
                 'worn_traits', public.hr_worn_traits_of(h.user_id, h.slot),
                 'worn_signature', public.hr_worn_signature_of(h.user_id, h.slot),
                 'drops', public.hr_trait_drops_of(h.user_id, h.slot),
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
revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine;

-- ── §4 THE SWITCH STAYS OFF ──────────────────────────────────────────────────
-- (1063 seeded it off; nothing here lights it. Lit only after the pre-EA Security GO, with the edge of this lane deployed.)

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE RESTATEMENT: the read's body is the chain end plus exactly this file's lines (proved on the text), and still carries every key
--     1071 and 1074 assert (the worn pieces, the roll's read, the trait switch, the flame).
-- (b) DARK: with the switch as applied (off), a hunt entered by the real door freezes personal_loot false and the read hands false.
-- (c) LIT: entered with the switch on, the instance freezes true and the read hands true; an UPDATE naming the column keeps it; the switch
--     going off moves no running instance; a move to another ground re-reads the switch; a move to the same ground keeps it.
-- (d) THE GRANTS: no client role writes hunt_instances or reaches the freeze or the read; grant hygiene is quiet; the switch is off.
do $$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-0000000a1076';
  c_head constant text := $p1$  -- PERSONAL-LOOT (1076-personal-loot.sql): RESTATED WHOLE (1071's body with 1074-inner-flame-luck.sql's splice folded in). The instance
  -- carries its own loot rule (personal_loot: hunt_instances.personal_loot, frozen from the switch when its hunt began on its ground by the
  -- trigger hr_hunt_loot_freeze), the engine's only source of it (hunt-settle.js); false while the switch is off: every kill rolls as before.
$p1$;
  c_key constant text := $p1$      -- PERSONAL-LOOT (1076-personal-loot.sql): whether this instance's kills roll personal loot (its frozen rule; hunt-settle.js personalLoot).
      'personal_loot', v_i.personal_loot,
$p1$;
  v jsonb; v_read jsonb; v_ground text; v_other text; v_sid uuid; v_iid uuid; v_src text; v_pre text;
begin
  -- (a) the text
  v_src := (select replace(prosrc, chr(13), '') from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure);
  v_pre := coalesce(current_setting('hr.p1_read_pre', true), '');
  if v_pre <> '' and replace(replace(v_src, c_head, ''), c_key, '') is distinct from v_pre then
    raise exception 'VERIFY(a): the restated read is not the chain end plus this file''s lines'; end if;
  if md5(v_src) is distinct from '3d6b400342a45792fd331fb61566c862' then raise exception 'VERIFY(a): the read landed off its post pin: md5 %', md5(v_src); end if;
  if position(c_key in v_src) = 0 or position('hr_worn_traits_of' in v_src) = 0 or position('hr_trait_drops_of' in v_src) = 0
     or position('''trait_drops'', public.hr_flag_on(''trait_drops'')' in v_src) = 0
     or position('''flame'', case when public.hr_flag_on(''inner_flame'')' in v_src) = 0 then
    raise exception 'VERIFY(a): the read lost a key 1071, 1074 or this file hands the engine'; end if;
  perform set_config('hr.p1_read_pre', '', true);

  select g.hunt_id into v_ground from public.hr_danger_grounds g join public.hr_hunt_grounds h on h.hunt_id = g.hunt_id
   where h.ends_at_level is null order by g.hunt_id limit 1;
  select h.hunt_id into v_other from public.hr_hunt_grounds h where h.hunt_id <> v_ground order by h.hunt_id limit 1;
  if v_ground is null or v_other is null then raise exception 'VERIFY-harness: no ground on the Danger scale to enter, or no second ground'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Loot') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'personal-loot §5 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = c_u and slot = 0;

    -- (b) dark
    update public.hr_flags set enabled = false where key = 'personal_loot';
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_ground, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): entering % answered %', v_ground, v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if (select personal_loot from public.hunt_instances where id = v_iid) is distinct from false
       or v_read->'instance'->'personal_loot' is distinct from 'false'::jsonb then
      raise exception 'VERIFY(b): a dark hunt froze % and the read hands %', (select personal_loot from public.hunt_instances where id = v_iid), v_read->'instance'->'personal_loot'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;

    -- (c) lit
    update public.hr_flags set enabled = true where key = 'personal_loot';
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_ground, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): entering % lit answered %', v_ground, v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if (select personal_loot from public.hunt_instances where id = v_iid) is distinct from true
       or v_read->'instance'->'personal_loot' is distinct from 'true'::jsonb then
      raise exception 'VERIFY(c): a lit hunt froze % and the read hands %', (select personal_loot from public.hunt_instances where id = v_iid), v_read->'instance'->'personal_loot'; end if;
    update public.hunt_instances set personal_loot = false where id = v_iid;
    if (select personal_loot from public.hunt_instances where id = v_iid) is distinct from true then
      raise exception 'VERIFY(c): an UPDATE of the column moved the frozen rule'; end if;
    update public.hr_flags set enabled = false where key = 'personal_loot';
    if (public.hr_hunt_instance_read(c_u, 0)->'instance'->>'personal_loot') is distinct from 'true' then
      raise exception 'VERIFY(c): the switch going off moved a running instance''s rule'; end if;
    update public.hunt_instances set hunt_id = hunt_id where id = v_iid;
    if (select personal_loot from public.hunt_instances where id = v_iid) is distinct from true then
      raise exception 'VERIFY(c): a restart on the same ground re-read the switch'; end if;
    update public.hunt_instances set hunt_id = v_other where id = v_iid;
    if (select personal_loot from public.hunt_instances where id = v_iid) is distinct from false then
      raise exception 'VERIFY(c): a move to another ground kept the old rule (the switch is off now)'; end if;

    raise exception using errcode = 'HRP76', message = 'personal-loot §5 complete - rolling back';
  exception when sqlstate 'HRP76' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.hunt_sessions where user_id = c_u) then
    raise exception 'VERIFY(d): §5 LEAKED a probe row'; end if;
  -- (d) the grants and the switch
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r), unnest(array['public.hr_hunt_loot_freeze()',
                 'public.hr_hunt_instance_read(uuid,integer)']) s(sig) where has_function_privilege(g.r, s.sig, 'execute'))
     or not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
     or exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['insert', 'update', 'delete']) p(pr)
                 where has_table_privilege(g.r, 'public.hunt_instances', p.pr)) then
    raise exception 'VERIFY(d): a client role reaches the freeze or the read, writes hunt_instances, or the engine lost its read'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hunt_instances'::regclass and tgname = 'hr_hunt_loot_freeze' and tgenabled = 'O') then
    raise exception 'VERIFY(d): the freeze trigger is missing or disabled'; end if;
  if exists (select 1 from public.hr_flags where key = 'personal_loot' and enabled) then raise exception 'VERIFY(d): personal_loot is lit after the apply'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'personal-loot: dark; each instance freezes its loot rule from the switch as its hunt begins; the read hands it; all green';
end $$;
