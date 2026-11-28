-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1077-worn-imbues.sql — THE IMBUEMENTS A HERO WEARS REACH THE FIGHT: the settle's read hands each member the server's
--   own worn-imbue rows, and an imbuement is applied in town only (lane/worn-imbues, backend-architect, 2026-11-27; the field contract is
--   .claude/coordination/HANDOFFS.md "2026-11-26 · backend-architect (lane/tp-server-1)" item 3b; 21-flame-temper-imbue-loot.md sections 3
--   and 10; 13-security-list.md N-8, S-32).
--
-- STATUS: supabase/migration-notes/1077-worn-imbues.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1063-flame-temper.sql (hero_worn_imbue, the switch imbuements),
--   1071-tp-im-server.sql (the hr_imbue_apply this file restates), 1074-inner-flame-luck.sql (the timer trigger, unchanged) and
--   1076-personal-loot.sql (the hr_hunt_instance_read this file restates whole). Applied as ONE transaction by the apply tool; never
--   begin/commit here. Ends with its §5 self-check.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_worn_imbues_of(p_user uuid, p_slot int) -> jsonb   NEW, the server's own (no client role, no engine role: the definer read calls it).
--   null while hr_flag_on('imbuements') is off. Else the hero's hero_worn_imbue rows [{ id, band, msLeft }] in equip-slot order, each only
--   when a piece is worn in its equip slot (player_equipment: nothing plays on an empty slot), it sits in its own kind's slot (the
--   catalogue's hr_imbue_rules.equip_slot: a row in another slot plays nothing) and it has time left (ms_left > 0); null when none.
-- hr_hunt_instance_read (RESTATED WHOLE: 1076-personal-loot.sql's image plus this file's lines, WORN-IMBUES): each member carries
--   `worn_imbues`, hr_worn_imbues_of(its user, its slot). The edge hands it to heroSetup with the member's session settled_to (hunt-settle.js
--   memberInput `_wornImbues`, `_readAtMs`), and the engine plays each one on the consumable slice (src/core/hunt/amount.js heroRows: an
--   Edge on its target's role, a Ward on the blow's element, a Leech taking its room) until the server instant settled_to + msLeft.
-- WHY THAT INSTANT IS THE SAME ON BOTH DOORS. The timer (hr_flame_temper_settle, 1074, unchanged) takes every settled millisecond off ms_left
--   as the session's settled_to moves forward, and deletes the row in the window that spends it. So settled_to + ms_left is one instant for
--   the whole hunt session, however its windows are cut. The engine drops an imbuement at its first boundary at or after that instant
--   (src/core/imbue.js imbuesAt, combat-sim.js syncUnit): a watched hunt (short windows) and a closed one (the 90 s flush) play it to the
--   same boundary, and the next window's read no longer hands it (CLAUDE.md section 6). A read that handed only msLeft would have played a
--   run-out imbuement to each window's end: a different fight viewed and closed.
-- hr_imbue_apply (RESTATED WHOLE: 1071-tp-im-server.sql's image plus one refusal, WORN-IMBUES): `hunt_open { session }` while the hero has an
--   open hunt, decided after no_character and before no_piece. WHY: the settle plays what the read handed from the window's START, and the
--   timer takes the whole window off it, so an imbuement applied mid-hunt would fight before it was bought and run out by a different
--   clock viewed and closed (the settle-before-mutate rule, Security F1, 2026-09-28; a direct client RPC has no settle-first path). Setups
--   change in town (hr_piece_wear's hunt_open is the same rule). The plan's "Keep imbued" (21 section 3.5) is a server reconcile at hunt
--   start, not this verb. Every other answer and its order is 1071's.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The read is STABLE and takes no lock; it runs inside the settle's read statement, under nothing new. The timer and the apply write
--   hero_worn_imbue only under the hero's lock (the settle's member lock, hr_hunt_lock); the apply now reads the open session that same
--   lock returns, so a hunt that opens after the check waits on the lock and the apply sees it. Keys as 1071 (before and under the lock).
--
-- ── EXPLOIT SURFACE ──────────────────────────────────────────────────────────
-- No new client verb or grant. The engine's worn set comes from hero_worn_imbue only (N-8: never a client list): one row an equip slot (its
--   primary key), the kind's slot (the catalogue join), on a worn piece, with time left; the engine keeps one a kind, drops an unknown id
--   and counts a band past wearAhead 0. The band is the row's, written by hr_imbue_apply from the catalogue. Removed: a mid-hunt apply
--   that would have played retroactively from the window's start. ON THE PRE-EA SECURITY LIST (13-security-list.md S-32, N-8).
-- KNOWN, NOT CLOSED HERE: the switch imbuements is read afresh each window (as trait_drops is); flipping it mid-hunt moves the window that
--   holds the flip by its start on each door. It is an operator switch, off until the pre-EA Security GO. (A party hero whose hunt ends
--   mid-window is exact too: its session settles to its own end + 1 ms, held there by hr_hunt_apply_member 5a's clock proof, so the 1074
--   timer charges its hunted time on every door; MEASURED, tests/worn-imbues-db.mjs WI-5, CONFLICTS 2026-11-27 worn imbuements (5) closed.)
--
-- ── COST (100x: 2,000 accounts x 4 heroes x 10 h) ────────────────────────────
-- Dark: one hr_flag_on (an hr_flags primary-key read) a member a settle read; no row, no statement the edge sends, no byte on the wire
--   but the key (`"worn_imbues": null`, 20 bytes a member). Lit: one indexed read of at most three hero_worn_imbue rows joined on two
--   primary keys a member a read (~60 bytes an imbuement); the timer's writes are 1074's. The apply reads the open session hr_hunt_lock
--   already returns: no new statement.
--
-- EDGE: hr-accrue of lane/worn-imbues (hunt-settle.js memberInput `_wornImbues` / `_readAtMs`; src/core/imbue.js wornImbuesOf / imbuesAt,
--   hunt-spawn.js heroSetup readAtMs, combat-sim.js syncUnit). No world shape moves (an imbuement is never persisted on a unit). Either
--   order is safe: an older edge ignores worn_imbues, an older read hands none, and the switch stays off until the pre-EA Security GO.
-- REVERSIBLE: re-apply 1076-personal-loot.sql's §3 (the read) and 1071-tp-im-server.sql's §3 hr_imbue_apply, then
--   `drop function public.hr_worn_imbues_of(uuid, integer)`. No row is written or lost.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS, AND THE IMAGES THIS FILE RESTATES ──────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hero_worn_imbue') is null or to_regclass('public.hr_imbue_rules') is null or to_regclass('public.player_equipment') is null
     or not exists (select 1 from public.hr_flags where key = 'imbuements') then
    raise exception 'PRECONDITION: 1063-flame-temper.sql first (hero_worn_imbue, hr_imbue_rules, the switch imbuements)'; end if;
  if to_regprocedure('public.hr_flame_temper_settle()') is null or position('INNER-FLAME (1074-inner-flame-luck.sql)' in
       (select prosrc from pg_proc where oid = 'public.hr_flame_temper_settle()'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: 1074-inner-flame-luck.sql first (the imbuement timer this file''s run-out instant rests on)'; end if;
  if to_regprocedure('public.hr_flag_on(text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)') is null or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamptz,boolean)') is null then
    raise exception 'PRECONDITION: a table or helper this file reads is missing'; end if;
  -- THE PINS: each body is the chain end this file restates, or this file's own image (a retry)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if v_md5 is distinct from '3d6b400342a45792fd331fb61566c862' and v_md5 is distinct from 'f90bff161e33d7db33ac8ff585156ede' then
    raise exception 'PIN: hr_hunt_instance_read is neither the image this file restates (3d6b400342a45792fd331fb61566c862, 1076-personal-loot.sql) nor its own (f90bff161e33d7db33ac8ff585156ede): md5 % - another file moved it; re-derive', v_md5;
  end if;
  -- the chain end's text, for §5's proof that the restatement adds exactly this file's lines (empty on a retry: the read is already ours)
  perform set_config('hr.wi_read_pre', case when v_md5 = '3d6b400342a45792fd331fb61566c862' then (select replace(prosrc, chr(13), '') from pg_proc
                                         where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) else '' end, true);
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_imbue_apply(integer,text,text,bigint,uuid)'::regprocedure;
  if v_md5 is distinct from 'a38873c80a0757c63a1feafa6c7eeb68' and v_md5 is distinct from '2a4b94f697436855c83e6fe377e44207' then
    raise exception 'PIN: hr_imbue_apply is neither the image this file restates (a38873c80a0757c63a1feafa6c7eeb68, 1071-tp-im-server.sql) nor its own (2a4b94f697436855c83e6fe377e44207): md5 % - another file moved it; re-derive', v_md5;
  end if;
  perform set_config('hr.wi_apply_pre', case when v_md5 = 'a38873c80a0757c63a1feafa6c7eeb68' then (select replace(prosrc, chr(13), '') from pg_proc
                                          where oid = 'public.hr_imbue_apply(integer,text,text,bigint,uuid)'::regprocedure) else '' end, true);
end $mig$;

-- ── §1 THE PROJECTION ────────────────────────────────────────────────────────
create or replace function public.hr_worn_imbues_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- WORN-IMBUES (1077-worn-imbues.sql): the imbuements hero (p_user, p_slot) wears, [{ id, band, msLeft }] in equip-slot order, msLeft at its
  -- session's settled_to (the timer, hr_flame_temper_settle, takes each settled ms off it): a row plays only on a piece worn in its slot,
  -- in its own kind's slot (the catalogue's), with time left. null while the switch imbuements is off, or none. The engine's only source.
  if not public.hr_flag_on('imbuements') then return null; end if;
  return (select jsonb_agg(jsonb_build_object('id', w.imbue_id, 'band', w.band, 'msLeft', w.ms_left) order by w.equip_slot)
            from public.hero_worn_imbue w
            join public.hr_imbue_rules r on r.imbue_id = w.imbue_id and r.equip_slot = w.equip_slot
            join public.player_equipment e on e.user_id = w.user_id and e.slot = w.slot and e.equip_slot = w.equip_slot
           where w.user_id = p_user and w.slot = p_slot and w.ms_left > 0);
end $fn$;
revoke all on function public.hr_worn_imbues_of(uuid, integer) from public, anon, authenticated, service_role;
do $mig$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function public.hr_worn_imbues_of(uuid, integer) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §2 hr_hunt_instance_read, RESTATED WHOLE (1076's image; this file's lines: WORN-IMBUES) ──
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
  -- WORN-IMBUES (1077-worn-imbues.sql): RESTATED WHOLE (1076's body). Each member carries the imbuements it wears (worn_imbues:
  -- hr_worn_imbues_of, the server's own hero_worn_imbue rows on a worn piece, msLeft at its session's settled_to); the engine plays each
  -- to settled_to + msLeft, one instant on both doors. Null while the switch imbuements is off: the engine plays none, as before.
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
                 -- WORN-IMBUES (1077-worn-imbues.sql): the imbuements this hero wears ([{ id, band, msLeft }], hr_worn_imbues_of). Null while dark.
                 'worn_imbues', public.hr_worn_imbues_of(h.user_id, h.slot),
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

-- ── §3 hr_imbue_apply, RESTATED WHOLE (1071's image; this file's lines: WORN-IMBUES, an open hunt refuses) ──
create or replace function public.hr_imbue_apply(p_slot int, p_equip_slot text, p_imbue text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'imbue_apply';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; i public.hr_imbue_rules%rowtype; w public.hero_worn_imbue%rowtype;
  v_il int; v_lv int; v_fee bigint; v_life bigint; v_take jsonb; v_a jsonb;
  -- WORN-IMBUES (1077-worn-imbues.sql): the hero's open hunt session, as its lock returns it
  v_s public.hunt_sessions%rowtype;
begin
  -- AN IMBUEMENT ONTO THE WORN PIECE (1063-flame-temper.sql; restated by 1071-tp-im-server.sql for the band lock and the bag then Storage).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('imbuements') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  select * into i from public.hr_imbue_rules where imbue_id = p_imbue;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_imbue')); end if;
  if p_equip_slot is distinct from i.equip_slot then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'wrong_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if not exists (select 1 from public.hr_items where item_id = i.item_id) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'imbue_owed')); end if;
  v_verb := 'imbue_apply:' || p_imbue || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- WORN-IMBUES (1077-worn-imbues.sql): IN TOWN. The settle plays a worn imbuement from its window's start and the timer takes the whole
  -- window off it, so one applied mid-hunt would fight before it was bought, and run out by another clock viewed than closed.
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  v_il := public.hr_worn_level(v_uid, p_slot, p_equip_slot);
  if v_il is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_piece')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  -- THE BAND LOCK (item 3a): the imbuement's band, the catalogue's, more than wearAhead over the server's Level cannot be worn.
  if not public.hr_imbue_wearable(i.band, v_lv) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'band_locked', 'band', i.band, 'level', v_lv)); end if;
  v_fee := public.hr_imbue_fee(v_il, v_lv);
  if v_fee <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'imbues', public.hr_imbues_view(v_uid, p_slot))); end if;
  -- QUALITY is the bench's roll (09 section 6) and rides on the stack once the bench makes one; until then every imbuement is plain.
  v_life := public.hr_imbue_life_ms('plain');
  select * into w from public.hero_worn_imbue where user_id = v_uid and slot = p_slot and equip_slot = p_equip_slot;
  /* THE CHARGE, all or nothing: the imbuement (the bag, then the account's Storage), then the purse. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(i.item_id, 1), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRI71', message = 'imbue: none held'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_fee,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'imbue_apply', 'imbue', p_imbue, 'item', i.item_id, 'equip_slot', p_equip_slot,
                                                                      'band', i.band, 'item_level', v_il, 'level', v_lv, 'life_ms', v_life, 'took', v_take->'from',
                                                                      'replaced', case when w.imbue_id is null then null
                                                                                       else jsonb_build_object('imbue', w.imbue_id, 'ms_lost', w.ms_left) end))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRI72', message = 'imbue: hr_apply refused'; end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then raise exception using errcode = 'HRI73', message = 'imbue: replayed'; end if;
  exception
    when sqlstate 'HRI71' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRI72' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
    when sqlstate 'HRI73' then return jsonb_build_object('ok', true, 'replayed', true);
  end;
  insert into public.hero_worn_imbue as h (user_id, slot, equip_slot, imbue_id, band, quality, ms_left)
    values (v_uid, p_slot, p_equip_slot, p_imbue, i.band, 'plain', v_life)
    on conflict (user_id, slot, equip_slot) do update
      set imbue_id = excluded.imbue_id, band = excluded.band, quality = excluded.quality, ms_left = excluded.ms_left, updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;
-- (create or replace keeps an ACL; restated anyway, as 1071's §4 holds it: the player's verb, and no other role's)
revoke execute on function public.hr_imbue_apply(integer, text, text, bigint, uuid) from public, anon, service_role;
grant execute on function public.hr_imbue_apply(integer, text, text, bigint, uuid) to authenticated;
do $mig$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function public.hr_imbue_apply(integer, text, text, bigint, uuid) from %I', v_role); end if;
  end loop;
end $mig$;
update public.hr_client_rpc_baseline
   set note = 'added 1063-flame-temper.sql (lane/flame-temper-build), restated 1071-tp-im-server.sql (lane/tp-server-1) and 1077-worn-imbues.sql (lane/worn-imbues): MONEY (a gold and item sink) - an imbuement from the bag then Storage onto the worn piece, 20 hunted hours, in town only; refuses hunt_open, band_locked, quote_changed; dark (imbuements)'
 where grantee = 'authenticated' and proname = 'hr_imbue_apply';

-- ── §4 THE SWITCH STAYS OFF ──────────────────────────────────────────────────
-- (1063 seeded imbuements off; nothing here lights it. Lit only after the pre-EA Security GO, with the edge of this lane deployed.)

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE RESTATEMENTS: the read is the chain end plus exactly this file's lines (proved on the text) and still carries every key 1071,
--     1074 and 1076 hand the engine; hr_imbue_apply is 1071's body plus exactly this file's lines; both land on their post pins.
-- (b) DARK: with the switch as applied (off), a hero wearing three imbuements on worn pieces projects nothing and the read hands null.
-- (c) LIT: the projection hands only a row on a worn piece, in its own kind's slot, with time left, in equip-slot order, and only to its
--     own hero; the read hands it as the member's worn_imbues.
-- (d) THE RUN-OUT INSTANT the engine reads: a settled window takes its milliseconds off msLeft, so settled_to + msLeft does not move (one
--     window or two); the window that spends a row deletes it and the projection drops it.
-- (e) IN TOWN: an apply while the hero hunts answers hunt_open and moves nothing (no ledger row, the bag, worn rows); after the hunt it answers
--     something else.
-- (f) THE GRANTS: no client role or engine role reaches the projection; the read is the engine's alone; the apply is the player's;
--     hero_worn_imbue has no client write; grant hygiene is quiet; the switch is off.
do $$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-0000000a1077';
  c_head constant text := $p1$  -- WORN-IMBUES (1077-worn-imbues.sql): RESTATED WHOLE (1076's body). Each member carries the imbuements it wears (worn_imbues:
  -- hr_worn_imbues_of, the server's own hero_worn_imbue rows on a worn piece, msLeft at its session's settled_to); the engine plays each
  -- to settled_to + msLeft, one instant on both doors. Null while the switch imbuements is off: the engine plays none, as before.
$p1$;
  c_key constant text := $p1$                 -- WORN-IMBUES (1077-worn-imbues.sql): the imbuements this hero wears ([{ id, band, msLeft }], hr_worn_imbues_of). Null while dark.
                 'worn_imbues', public.hr_worn_imbues_of(h.user_id, h.slot),
$p1$;
  c_a1 constant text := $p1$  -- WORN-IMBUES (1077-worn-imbues.sql): the hero's open hunt session, as its lock returns it
  v_s public.hunt_sessions%rowtype;
$p1$;
  c_a2 constant text := $p1$  -- WORN-IMBUES (1077-worn-imbues.sql): IN TOWN. The settle plays a worn imbuement from its window's start and the timer takes the whole
  -- window off it, so one applied mid-hunt would fight before it was bought, and run out by another clock viewed than closed.
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
$p1$;
  v jsonb; v_read jsonb; v_ground text; v_sid uuid; v_src text; v_pre text; v_ms bigint; v_to bigint; v_to2 bigint;
  v_rows numeric; v_bag text; v_worn text; v_fee bigint;
begin
  -- (a) the text
  v_src := (select replace(prosrc, chr(13), '') from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure);
  v_pre := coalesce(current_setting('hr.wi_read_pre', true), '');
  if v_pre <> '' and replace(replace(v_src, c_head, ''), c_key, '') is distinct from v_pre then
    raise exception 'VERIFY(a): the restated read is not the chain end plus this file''s lines'; end if;
  if md5(v_src) is distinct from 'f90bff161e33d7db33ac8ff585156ede' then raise exception 'VERIFY(a): the read landed off its post pin: md5 %', md5(v_src); end if;
  if position(c_key in v_src) = 0 or position('hr_worn_traits_of' in v_src) = 0 or position('hr_trait_drops_of' in v_src) = 0
     or position('''trait_drops'', public.hr_flag_on(''trait_drops'')' in v_src) = 0
     or position('''flame'', case when public.hr_flag_on(''inner_flame'')' in v_src) = 0
     or position('''personal_loot'', v_i.personal_loot,' in v_src) = 0 then
    raise exception 'VERIFY(a): the read lost a key 1071, 1074, 1076 or this file hands the engine'; end if;
  perform set_config('hr.wi_read_pre', '', true);
  v_src := (select replace(prosrc, chr(13), '') from pg_proc where oid = 'public.hr_imbue_apply(integer,text,text,bigint,uuid)'::regprocedure);
  v_pre := coalesce(current_setting('hr.wi_apply_pre', true), '');
  if v_pre <> '' and replace(replace(replace(v_src, c_a1, ''), c_a2, ''), '  v_s := public.hr_hunt_lock(v_uid, p_slot);', '  perform public.hr_hunt_lock(v_uid, p_slot);') is distinct from v_pre then
    raise exception 'VERIFY(a): the restated apply is not 1071''s body plus this file''s lines'; end if;
  if md5(v_src) is distinct from '2a4b94f697436855c83e6fe377e44207' then raise exception 'VERIFY(a): the apply landed off its post pin: md5 %', md5(v_src); end if;
  perform set_config('hr.wi_apply_pre', '', true);

  select g.hunt_id into v_ground from public.hr_danger_grounds g join public.hr_hunt_grounds h on h.hunt_id = g.hunt_id
   where h.ends_at_level is null order by g.hunt_id limit 1;
  if v_ground is null then raise exception 'VERIFY-harness: no ground on the Danger scale to enter'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Imbue') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'worn-imbues §5 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = c_u and slot = 0;
    -- the hero wears a weapon and a body piece, nothing on its head: three imbuements in their own slots, and a fourth in another kind's
    delete from public.player_equipment where user_id = c_u and slot = 0 and equip_slot in ('helmet', 'pants');
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_u, 0, 'weapon', 'steel_sword'), (c_u, 0, 'body', 'steel_platebody'),
      (c_u, 0, 'pants', 'steel_platelegs')
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    insert into public.hero_worn_imbue (user_id, slot, equip_slot, imbue_id, band, quality, ms_left) values
      (c_u, 0, 'weapon', 'brute_edge', 70, 'plain', 3600000), (c_u, 0, 'body', 'fire_ward', 45, 'plain', 90000),
      (c_u, 0, 'helmet', 'life_leech', 50, 'plain', 3600000), (c_u, 0, 'pants', 'mana_leech', 55, 'plain', 3600000);

    -- (b) dark
    update public.hr_flags set enabled = false where key = 'imbuements';
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_ground, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): entering % answered %', v_ground, v; end if;
    select h.id into v_sid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if public.hr_worn_imbues_of(c_u, 0) is not null or jsonb_array_length(v_read->'members') <> 1
       or not ((v_read->'members'->0) ? 'worn_imbues') or (v_read->'members'->0->'worn_imbues') is distinct from 'null'::jsonb then
      raise exception 'VERIFY(b): a dark hero projects % and the read hands %', public.hr_worn_imbues_of(c_u, 0), v_read->'members'->0->'worn_imbues'; end if;

    -- (c) lit: the body's Ward and the weapon's Edge, in equip-slot order; not the bare head's Leech, not the Leech in the pants
    update public.hr_flags set enabled = true where key = 'imbuements';
    if public.hr_worn_imbues_of(c_u, 0) is distinct from '[{"id": "fire_ward", "band": 45, "msLeft": 90000}, {"id": "brute_edge", "band": 70, "msLeft": 3600000}]'::jsonb then
      raise exception 'VERIFY(c): the hero projects %', public.hr_worn_imbues_of(c_u, 0); end if;
    if public.hr_worn_imbues_of(c_u, 1) is not null then raise exception 'VERIFY(c): another hero slot reads %', public.hr_worn_imbues_of(c_u, 1); end if;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if (v_read->'members'->0->'worn_imbues') is distinct from public.hr_worn_imbues_of(c_u, 0) then
      raise exception 'VERIFY(c): the read hands %', v_read->'members'->0->'worn_imbues'; end if;

    -- (d) the run-out instant: settled_to + msLeft stands still as the windows settle (one of 60 s, then one of 20 s)
    v_to := (select ceil(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = v_sid) + 3600000;
    update public.hunt_sessions set settled_to = settled_to + interval '60 seconds' where id = v_sid;
    v_ms := (select (x->>'msLeft')::bigint from jsonb_array_elements(public.hr_worn_imbues_of(c_u, 0)) x where x->>'id' = 'brute_edge');
    v_to2 := (select ceil(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = v_sid) + v_ms;
    if v_ms is distinct from 3540000 or v_to2 is distinct from v_to then
      raise exception 'VERIFY(d): after a 60 s window the Edge has % ms and runs out at % (it stood at %)', v_ms, v_to2, v_to; end if;
    update public.hunt_sessions set settled_to = settled_to + interval '20 seconds' where id = v_sid;
    v_ms := (select (x->>'msLeft')::bigint from jsonb_array_elements(public.hr_worn_imbues_of(c_u, 0)) x where x->>'id' = 'brute_edge');
    v_to2 := (select ceil(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = v_sid) + v_ms;
    if v_to2 is distinct from v_to then raise exception 'VERIFY(d): a second window moved the run-out to % (it stood at %)', v_to2, v_to; end if;
    -- 80 s of the Ward's 90 s are gone: a 10 s window spends it whole, deletes its row, and the projection hands the Edge alone
    update public.hunt_sessions set settled_to = settled_to + interval '10 seconds' where id = v_sid;
    if exists (select 1 from public.hero_worn_imbue where user_id = c_u and slot = 0 and equip_slot = 'body')
       or public.hr_worn_imbues_of(c_u, 0) is distinct from '[{"id": "brute_edge", "band": 70, "msLeft": 3510000}]'::jsonb then
      raise exception 'VERIFY(d): a spent Ward still stands, or the projection is %', public.hr_worn_imbues_of(c_u, 0); end if;

    -- (e) in town: the hero hunts, so an apply is refused hunt_open and moves nothing
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, 'imbue_fire_ward', 1)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v_fee := public.hr_imbue_fee(public.hr_worn_level(c_u, 0, 'body'), public.hr_level_of(c_u, 0));
    v_rows := (select count(*) from public.player_ledger where user_id = c_u);
    v_bag := (select string_agg(item_id || ':' || qty, ',' order by item_id) from public.player_inventory where user_id = c_u and slot = 0);
    v_worn := (select string_agg(equip_slot || ':' || imbue_id || ':' || ms_left, ',' order by equip_slot) from public.hero_worn_imbue where user_id = c_u and slot = 0);
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_imbue_apply(0, 'body', 'fire_ward', v_fee, gen_random_uuid());
    if coalesce(v->>'error', '') <> 'hunt_open' or (v->>'session') is distinct from v_sid::text then
      raise exception 'VERIFY(e): an apply while hunting answered %', v; end if;
    if (select count(*) from public.player_ledger where user_id = c_u) is distinct from v_rows
       or (select string_agg(item_id || ':' || qty, ',' order by item_id) from public.player_inventory where user_id = c_u and slot = 0) is distinct from v_bag
       or (select string_agg(equip_slot || ':' || imbue_id || ':' || ms_left, ',' order by equip_slot) from public.hero_worn_imbue where user_id = c_u and slot = 0) is distinct from v_worn then
      raise exception 'VERIFY(e): a refused apply journalled a row, moved the bag or a worn row'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_imbue_apply(0, 'body', 'fire_ward', v_fee, gen_random_uuid());
    if coalesce(v->>'error', '') = 'hunt_open' then raise exception 'VERIFY(e): an apply in town answered %', v; end if;

    raise exception using errcode = 'HRP77', message = 'worn-imbues §5 complete - rolling back';
  exception when sqlstate 'HRP77' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.hero_worn_imbue where user_id = c_u) then
    raise exception 'VERIFY(f): §5 LEAKED a probe row'; end if;
  -- (f) the grants and the switch
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick']) g(r)
              where exists (select 1 from pg_roles where rolname = g.r) and has_function_privilege(g.r, 'public.hr_worn_imbues_of(uuid,integer)', 'execute'))
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r) where has_function_privilege(g.r, 'public.hr_hunt_instance_read(uuid,integer)', 'execute'))
     or not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_imbue_apply(integer,text,text,bigint,uuid)', 'execute')
     or exists (select 1 from unnest(array['anon', 'service_role']) g(r) where has_function_privilege(g.r, 'public.hr_imbue_apply(integer,text,text,bigint,uuid)', 'execute'))
     or exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['insert', 'update', 'delete']) p(pr)
                 where has_table_privilege(g.r, 'public.hero_worn_imbue', p.pr)) then
    raise exception 'VERIFY(f): a role reaches the projection, a client reaches the read, the engine lost its read, the apply left the player, or a client writes hero_worn_imbue'; end if;
  if exists (select 1 from public.hr_flags where key = 'imbuements' and enabled) then raise exception 'VERIFY(f): imbuements is lit after the apply'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'worn-imbues: dark; the read hands each member its worn imbuements, run out at one instant on both doors; applied in town only; all green';
end $$;
