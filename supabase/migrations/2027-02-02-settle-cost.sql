-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SETTLE READS WHAT THE ENGINE NEEDS, AND BUILDS NO ENVELOPE NOBODY READS
-- (lane/c-settle-cost, backend-architect, 2026-10-28; the 2026-10-28 optimization review,
-- lane/r-opt-review 100c5e116).
-- STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 154k chars) takes ONE anchored edit in §3, its final envelope skipped inside an instance settle; restating the whole body for one line would also re-anchor every hr_apply mutant in four harnesses (as inner-flame, skills-from-storage and account-gold did).
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- Live, 2026-10-28 (pg_stat_statements, one unwatched 4-hero party): one instance settle
-- cost 1.48 s of DB — the read 440 ms, hr_hunt_apply_instance 457 ms — and the Micro DB
-- saturates near 98 concurrent heroes. Replayed on the chain WITH the 2027-02-01 level curve
-- (tools/settle-cost.mjs, PGlite, the edge's own three settle pieces, track_functions = all),
-- one 90 s window of a 4-hero party on millrace_sewer:
--     read  208 ms   = hr_hunt_instance_read 165 ms (4 x hr_state_of) + the read's own hr_state_of
--     apply 302 ms   = 4 x hr_apply 242 ms, of which 4 x hr_state_of
--     hr_state_of: 9 calls, 378 ms of the 520 ms DB a settle costs (hr_state_sections_of 308 ms of it).
-- NINE full envelopes per settle, and on the world tick (the browser closed: the common case)
-- NOT ONE of them is read:
--   · the read's members: the engine reads 11 fields of each (src/core: skills, Level XP, HP,
--     the purse, gear, bag, buffs, two death counters, the Hearthfind switch, the version) —
--     hr_state_of builds ~40 keys and every hr_state_sections row (the analyzer, the shop, the
--     home, the farm, the party, the depot ... ~45 KB a hero) to hand it them;
--   · the read's own hr_state_of (the caller's envelope): spread into an EARLY answer only
--     (not due, below the floor); a settle that lands answers the commit's projection instead,
--     and the tick discards every body (tick.js counts outcomes). The edge now reads it only on
--     a player door's early answer (supabase/functions/hr-accrue/hunt-settle.js);
--   · each member's hr_apply ends `v_out := hr_state_of(...)`; inside an instance settle
--     hr_hunt_apply_member reads ok / error / replayed of it and hr_frame_send is deferred
--     (hr.frame_defer = 'instance': the instance sends every member's frame itself, from the
--     committed state, 2026-12-25-frame-push-revive.sql) — the envelope is built and dropped.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_hunt_member_state(p_user uuid, p_slot int) -> jsonb   NEW, owner-only (no role
--    executes it; hr_hunt_instance_read, SECURITY DEFINER, is its one caller). EXACTLY the
--    keys of hr_state_of the hunt engine reads (supabase/functions/hr-accrue/envelope.js
--    engineInputsFromEnvelope as hunt-settle.js memberInput uses it), in hr_state_of's own
--    shape and by hr_state_of's own expressions:
--      { ok, version, buffs, inventory, equipment,
--        skills: { <id>: { xp, frac } },
--        state:  { gold, hp, level_xp, deaths_lifetime, deaths_today, hearthfind_ready } }
--    and { ok:false, error:'no_character' } for a missing hero, as hr_state_of answers.
--    A key the engine does not read is not here (skills' `level` included: the engine derives
--    it). PARITY IS ASSERTED, not assumed: §4(b) here, tests/hunt-sessions-settle.mjs
--    MEMBER-STATE on the replayed chain (the engine input built from each, compared).
-- §2 hr_hunt_instance_read RESTATED WHOLE from its live image (7f2929c8, the
--    2026-11-16-hunt-density-bounds.sql body): each member's `state` is hr_hunt_member_state.
--    Every other line is byte-identical (the settle guard's DB mutants anchor on them).
-- §3 hr_apply, ONE ANCHORED EDIT of the live text (b7052e5b, 2027-01-31-inner-flame.sql's
--    post-image): when hr.frame_defer = 'instance' (set ONLY by hr_hunt_apply_instance around
--    its member loop) a landed apply answers { ok:true, version } — the row's version after
--    the write — instead of hr_state_of. Every write, clamp, journal row and the stored
--    decision ({ok:true}) are unchanged; the frame it would hand hr_frame_send is not sent
--    under the defer either way. Outside an instance settle nothing moves.
-- §4 grants; §5 the executed self-check.
--
-- ── WHAT THE EDGE DOES WITH IT (the same lane, hr-accrue) ───────────────────
--   hunt-settle.js HUNT_READ_SQL drops its hr_state_of term; readHuntSettle reads the
--   caller's envelope (one statement) only when a PLAYER door returns an early answer.
--   tick.js skips a selector whose instance this fire already settled up to the server's
--   now (the read would find less than one swing to settle). DEPLOY ORDER: either order is
--   safe. The old edge on this database reads the same 11 fields from the lean member state
--   (same shape) and its own outer hr_state_of still exists; the new edge on the old database
--   reads full member envelopes and fetches the caller's envelope when an early answer needs it.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   Unchanged. The read is one statement (one snapshot: the instance, its members and their
--   engine inputs); the commit is hr_hunt_apply_instance's instance lock, world CAS, member
--   locks in (user, slot) order and derived intent keys. hr_hunt_member_state reads the same
--   rows hr_state_of read, in the same statement. The lean answer is built AFTER every write
--   of the apply, under the character lock it holds, so `version` is the committed one.
--   A second apply of this file: §1/§2 are create-or-replace of the same text; §3 detects its
--   own post-image and does nothing.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   NOTHING HERE MOVES VALUE OR WIDENS A ROLE. §1 is reachable by no role. §2 hands the engine
--   a STRICT SUBSET of what it read before (the hero's own skills, bag, gear, buffs, purse,
--   HP, Level XP, death counters) — no other player's data reaches it that did not before.
--   §3 changes only the RETURN VALUE of hr_apply, and only under a GUC that hr_apply's own
--   frame push already honours; a client cannot reach hr_apply, and a caller that set the GUC
--   itself would only lose its own envelope. Listed for the pre-EA review.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none added (no table, no ledger row). Per 4-hero tick settle (replayed, the
--   before/after table is in the lane report): 9 hr_state_of -> 0; DB ~520 ms -> see report.
--   A WATCHED hero still costs its own projection (the commit's v_proj) and one frame
--   projection per other watched member — those are read by a client.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Restate hr_hunt_instance_read from 2026-11-16-hunt-density-bounds.sql (member `state`
--   = hr_state_of again), undo §3's edit (the c_new text back to c_old), drop
--   hr_hunt_member_state. No data to restore. The edge is compatible with either image.
--
-- ORDER: after 2027-02-01-hunt-sessions-catalogue.generated.sql (the level curve set);
--   before 2027-02-03-tick-capacity.sql. EDGE: hr-accrue moves in the same lane (deploy
--   after this file; either order is safe, above). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_vitals_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_member_read(public.hunt_sessions)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamp with time zone)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)') is null then
    raise exception 'PRECONDITION: the settle''s functions are absent (2026-11-16-hunt-density-bounds.sql, 2027-01-31-inner-flame.sql)'; end if;
  if to_regclass('public.hr_level_curve') is null then
    raise exception 'PRECONDITION: apply the 2027-02-01 level curve set first (2027-02-01-level-curve.generated.sql)'; end if;
  -- the restated read is EXACTLY its live image or this file's own (a second apply)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if v_md5 is distinct from '7f2929c8a9767871ab130ca6fe71ca98' and v_md5 is distinct from '4a0126352e3ccb10314d41cc255213cd' then
    raise exception 'PIN: hr_hunt_instance_read is neither its live image (7f2929c8) nor this file''s: md5 % - another file moved it', v_md5; end if;
  -- the instance settle still sets the defer §3 keys on, exactly around its member loop
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure),
            'perform set_config(''hr.frame_defer'', ''instance'', true);') = 0 then
    raise exception 'PRECONDITION: hr_hunt_apply_instance no longer sets hr.frame_defer = instance (2026-12-25-frame-push-revive.sql)'; end if;
end $mig$;

-- ── §1 THE ENGINE'S INPUTS, AND NOTHING ELSE ─────────────────────────────────
create or replace function public.hr_hunt_member_state(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- 2027-02-02-settle-cost.sql: one hunt member's ENGINE INPUTS, in hr_state_of's shape and by its expressions (each
-- key below is the hr_state_of key of the same name, copied, not re-derived): what hunt-settle.js memberInput reads
-- through envelope.js engineInputsFromEnvelope, and nothing else. A key added to that reader is added HERE, and
-- tests/hunt-sessions-settle.mjs MEMBER-STATE (the engine input built from this and from hr_state_of, compared)
-- goes red until it is.
declare v_st  public.player_state%rowtype;
        v_vit jsonb;
begin
  select * into v_st from public.player_state where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- hr_state_of's `state.hp` is the stored HP held under the DERIVED max (Level and armour): the same call.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);
  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               'from', e.v->>'from',
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    'state', jsonb_build_object(
      -- ACCOUNT GOLD (2026-12-15-account-gold.sql): ONE purse per account, every slot reads it.
      'gold', coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int),
      'level_xp', v_st.level_xp,
      'hearthfind_ready', true,
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0)),
    -- the raw XP and the carried remainder (envelope.js reads .xp and .frac); the Level is the engine's own derivation
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object('xp', xp, 'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb));
end $fn$;

-- ── §2 THE INSTANCE READ: every member's engine inputs, not its envelope ──────
create or replace function public.hr_hunt_instance_read(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $function$
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
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density)) end,
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

-- ── §3 hr_apply: NO ENVELOPE INSIDE AN INSTANCE SETTLE (one anchored edit) ──
do $mig$
declare
  c_old constant text := E'    v_out := public.hr_state_of(v_uid, v_slot);\n';
  c_new constant text := E'    -- SETTLE-COST (2027-02-02-settle-cost.sql): inside an instance settle (hr.frame_defer = ''instance'', set only by\n'
                      || E'    -- hr_hunt_apply_instance around its member loop) the caller reads ok / error / replayed of this answer and sends\n'
                      || E'    -- every member''s frame itself from the committed state, so the envelope is not built: { ok, version } instead.\n'
                      || E'    v_out := case when current_setting(''hr.frame_defer'', true) = ''instance''\n'
                      || E'                  then jsonb_build_object(''ok'', true, ''version'', (select ps.version from public.player_state ps\n'
                      || E'                                                                     where ps.user_id = v_uid and ps.slot = v_slot))\n'
                      || E'                  else public.hr_state_of(v_uid, v_slot) end;\n';
  v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, c_new) > 0 and strpos(v_def, c_old) = 0 then raise notice 'hr_apply: the instance settle already skips the envelope'; return; end if;
  if array_length(string_to_array(v_def, c_old), 1) <> 2 then
    raise exception 'hr_apply: the final envelope line is not exactly once in the live body - refusing to patch blind'; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;

-- ── §4 GRANTS: revoke-then-grant; nothing new reaches a client or the engine ──
do $grants$
declare v_role text;
begin
  revoke all on function public.hr_hunt_member_state(uuid, integer) from public, anon, authenticated, service_role;
  revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_member_state(uuid, integer) from %I', v_role); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_hunt_instance_read(uuid, integer) from hr_tick; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine; end if;
end $grants$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-images: (a) there is no hr_hunt_member_state and the read hands members hr_state_of; (c) hr_apply
-- answers a full envelope under the defer. The end-to-end proof (the engine input built from both reads identical,
-- the settle's rows identical with the browser closed and the hunt viewed) is tests/hunt-sessions-settle.mjs.
do $$
declare
  c_a    constant uuid := '000000d6-0000-4000-a000-00005e771e01';   -- a hero with something in every engine field
  c_b    constant uuid := '000000d6-0000-4000-a000-00005e771e02';   -- a fresh hero (empty maps, no buffs)
  c_none constant uuid := '000000d6-0000-4000-a000-00005e771e03';   -- no character at all
  v      jsonb;
  v_full jsonb; v_lean jsonb; v_want jsonb;
  v_sig  text;
  v_src  text;
  v_ver  bigint;
begin
  -- (a) THE SHAPE: the read's members carry the engine inputs; hr_apply carries the lean branch once; grants closed.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure) <> '4a0126352e3ccb10314d41cc255213cd' then
    raise exception 'settle-cost §5(a): hr_hunt_instance_read is not this file''s image'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if strpos(v_src, 'hr_state_of(') > 0 or strpos(v_src, '''state'', public.hr_hunt_member_state(h.user_id, h.slot))') = 0 then
    raise exception 'settle-cost §5(a): the instance read still hands a member its whole envelope'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'v_out := case when current_setting(''hr.frame_defer'', true) = ''instance''', '')))
       / length('v_out := case when current_setting(''hr.frame_defer'', true) = ''instance''') <> 1
     or strpos(v_src, E'    v_out := public.hr_state_of(v_uid, v_slot);\n') > 0 then
    raise exception 'settle-cost §5(a): hr_apply does not carry the instance-settle answer exactly once'; end if;
  foreach v_sig in array array['public.hr_hunt_member_state(uuid,integer)', 'public.hr_hunt_instance_read(uuid,integer)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or has_function_privilege('authenticated', v_sig::regprocedure, 'execute')
       or has_function_privilege('service_role', v_sig::regprocedure, 'execute')
       or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', v_sig::regprocedure, 'execute'))
       or (v_sig like '%member_state%' and exists (select 1 from pg_roles where rolname = 'hr_engine')
           and has_function_privilege('hr_engine', v_sig::regprocedure, 'execute'))
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'settle-cost §5(a): % is reachable by a client or a role that must not run it', v_sig; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
    raise exception 'settle-cost §5(a): hr_engine lost the instance read'; end if;

  begin
    foreach v_sig in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'settle-cost §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'settle-cost §5-harness: hr_create_character refused: %', v; end if;
    end loop;
    -- c_a: XP with a carried remainder, a bag, a worn piece (the starter kit's), a live and an expired buff, a death
    -- today and one before, HP stored ABOVE the derived max (the clamp), a purse.
    update public.player_skills set xp = xp + 4321, xp_frac = 0.375 where user_id = c_a and slot = 0 and skill_id = 'melee';
    update public.player_state set hp = 100000, level_xp = 77777,
           buffs = jsonb_build_array(
             jsonb_build_object('type', 'regen', 'magnitude', 3, 'until', now() + interval '20 minutes', 'from', now() - interval '1 minute', 'scale', 1.25),
             jsonb_build_object('type', 'atk', 'magnitude', 2, 'until', now() - interval '5 minutes'))
     where user_id = c_a and slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value) values
      (c_a, 0, 'stat', 'deaths', '', 3), (c_a, 0, 'stat', 'deaths', public.hr_utc_day_key(now()), 1)
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
    insert into public.account_wallet (user_id, gold) values (c_a, 4242) on conflict (user_id) do update set gold = excluded.gold;
    delete from public.player_inventory where user_id = c_b and slot = 0;
    delete from public.player_equipment where user_id = c_b and slot = 0;
    delete from public.player_skills where user_id = c_b and slot = 0;

    -- (b) PARITY: the lean state IS hr_state_of's engine keys, key for key, value for value (same statement, same now()).
    foreach v_sig in array array[c_a::text, c_b::text, c_none::text] loop
      v_full := public.hr_state_of(v_sig::uuid, 0);
      v_lean := public.hr_hunt_member_state(v_sig::uuid, 0);
      v_want := case when coalesce((v_full->>'ok')::boolean, false) is not true then v_full
                     else jsonb_build_object('ok', v_full->'ok', 'version', v_full->'version', 'buffs', v_full->'buffs',
                            'inventory', v_full->'inventory', 'equipment', v_full->'equipment',
                            'skills', coalesce((select jsonb_object_agg(e.key, jsonb_build_object('xp', e.value->'xp', 'frac', e.value->'frac'))
                                                  from jsonb_each(v_full->'skills') e), '{}'::jsonb),
                            'state', jsonb_build_object('gold', v_full->'state'->'gold', 'hp', v_full->'state'->'hp',
                                       'level_xp', v_full->'state'->'level_xp', 'hearthfind_ready', v_full->'state'->'hearthfind_ready',
                                       'deaths_lifetime', v_full->'state'->'deaths_lifetime', 'deaths_today', v_full->'state'->'deaths_today')) end;
      if v_lean is distinct from v_want then
        raise exception 'settle-cost §5(b): the engine inputs of % differ from hr_state_of: % vs %', v_sig, v_lean, v_want; end if;
    end loop;
    v_lean := public.hr_hunt_member_state(c_a, 0);
    if (v_lean->'state'->>'hp')::int >= 100000 or (v_lean->'state'->>'gold')::bigint <> 4242 or (v_lean->'state'->>'deaths_today')::int <> 1
       or (v_lean->'state'->>'deaths_lifetime')::int <> 3 or jsonb_array_length(v_lean->'buffs') <> 2
       or (v_lean->'skills'->'melee'->>'frac')::numeric <> 0.375 or v_lean->'inventory' = '{}'::jsonb then
      raise exception 'settle-cost §5(b)-harness: the probe hero does not exercise every field: %', v_lean; end if;

    -- (c) hr_apply INSIDE AN INSTANCE SETTLE answers { ok, version } (the committed version) and writes the same rows;
    --     outside it answers the envelope, as before; the defer is the caller's, and is left as found.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    select version into v_ver from public.player_state where user_id = c_b and slot = 0;
    perform set_config('hr.frame_defer', 'instance', true);
    v := public.hr_apply(c_b, 0, v_ver, gen_random_uuid(),
           jsonb_build_object('xp', jsonb_build_object('melee', 7), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'settle_cost_probe')));
    perform set_config('hr.frame_defer', '', true);
    if v is distinct from jsonb_build_object('ok', true, 'version', v_ver + 1)
       or (select version from public.player_state where user_id = c_b and slot = 0) <> v_ver + 1
       or (select xp from public.player_skills where user_id = c_b and slot = 0 and skill_id = 'melee') <> 7 then
      raise exception 'settle-cost §5(c): hr_apply under the instance defer answered % (version %, melee xp %)', v,
        (select version from public.player_state where user_id = c_b and slot = 0),
        (select xp from public.player_skills where user_id = c_b and slot = 0 and skill_id = 'melee'); end if;
    v := public.hr_apply(c_b, 0, v_ver + 1, gen_random_uuid(),
           jsonb_build_object('xp', jsonb_build_object('melee', 5), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'settle_cost_probe')));
    if coalesce(v->>'ok', '') <> 'true' or not (v ? 'state') or not (v ? 'skills') or (v->>'version')::bigint <> v_ver + 2
       or (v->'skills'->'melee'->>'xp')::bigint <> 12 then
      raise exception 'settle-cost §5(c): hr_apply outside an instance settle no longer answers the envelope: %', left(v::text, 300); end if;
    if (select count(*) from public.player_ledger where user_id = c_b and slot = 0 and intent = 'settle_cost_probe') <> 2 then
      raise exception 'settle-cost §5(c): the two probe applies are not journalled once each'; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    raise exception 'settle-cost §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'settle-cost §5: ok' then raise; end if;
  end;
end $$;
