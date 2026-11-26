-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1071-retire-tier-chain.sql — THE TIER CHAIN AND THE SCALED HUNTS LEAVE THE SERVER: every ground plays the
--   Danger scale's step, the stance picker is the one choice of how hard a hunt is (lane/retire-tier-chain, systems-engineer,
--   2026-11-26; docs/design/redesign/12-targets.md 8.4 item 4, Tyler 2026-11-24: "scaled hunts leave for the scale, the tier picker
--   for the stance picker"; 27-formula-overhaul M-5).
--
-- STATUS: supabase/migration-notes/1071-retire-tier-chain.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: the hr-accrue of lane/retire-tier-chain (it sends no `scale` claim and reads no options.tier or `scale`). Either order is safe:
--   an older engine finds no `tier` and no `scale` in the instance read and plays the ground's rows (its "a database before that file"
--   path), and the newer engine never sends a scale claim, which this file stops accepting.
-- CLIENT: the build without the tier picker and the scale pane (this lane). An older page that presses a tier or buys scaled hours gets
--   PostgREST's "no such function", said in words (refusal-words.js), and nothing else moves.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- DROPPED, CLIENT VERBS (off hr_client_rpc_baseline and the Game Master's door list hr_gm_wall_allow):
--   hr_hunt_tier_set(int,text,text,uuid)               the tier picked per ground (2027-02-27-hunt-tiers.sql)
--   hr_scaled_hunt_switch(int,text,boolean,uuid)       a scaled hunt's switch (2027-03-21-scaled-hunts.sql)
--   hr_scaled_hunt_buy(int,text,int,bigint,uuid)       scaled hours bought with gold (2027-04-19-key-under-lock.sql): A GOLD PURCHASE
-- DROPPED, SECTIONS: `hunt_tier` (hr_hunt_tier_view) and `scaled_hunts` (hr_scaled_hunts_view).
-- DROPPED, INTERNAL: hr_hunt_tier_pick, hr_hunt_tier_open and hr_hunt_tier_stamp (and their two triggers on hunt_sessions),
--   hr_scaled_hunt_of, hr_scaled_level, hr_scaled_hours_today, hr_hunt_scaled_at_door, hr_scaled_hours_hold (and its two triggers).
-- DROPPED, TABLES: hr_ground_tiers, hr_scaled_grounds, hr_scaled_kill_bounds, hr_scaled_hunt_rule, player_scaled_hours
--   (hunt_scale_holds and hr_scaled_hours_hold, 1053-lever-gates.sql's scale half, are no longer made: dropped `if exists`). COLUMNS: hunt_density.tier, hunt_instances.tier, hunt_instances.scale_level,
--   hunt_sessions.tier, hunt_session_tally.scaled_ms. THE SWITCH ROW: hr_feature_switches 'scaled_hunts'.
-- RESTATED WHOLE (§1b: each patch chain was past its depth, tests/patch-chain-guard.mjs PATCH-1 and PATCH-3; the text the chain held,
--   less what the tier chain and the scaled hunts wrote into it):
--   hr_hunt_party_view       no `leader_tiers`
--   hr_hunt_apply_instance   no `scale` claim key, no scale re-proof, no scale_level write, no hours debit
--   hr_hunt_best_fold        no scaled run to skip
-- RESTATED BY ANCHORED SPLICES (§1: one site each, the rest of each body byte for byte as the chain left it):
--   hr_hunt_density_freeze   the instance's first session freezes pull 0 (the ground as built; on the scale the step sets the pull,
--                            hr_danger_freeze)
--   hr_hunt_admit            an outgrown ground refuses with no scaled door
--   hr_hunt_apply_member     the value, defense and item bounds lose their scaled widening; no scaled_ms on the tally
--
-- FOLDED INTO THE STAGED FILES THAT WRITE THEM (a staged body is edited in place, never moved by a later file: the staged tail's
--   second apply, tests/schema-drift.mjs): 1024-carry-on.sql and 1051-company-start.sql (the plan's hero `tier`), 1053-hunt-report.sql
--   and 1057-danger-falls.sql (an ended session's `tier`; 1053's VERIFY(d) reads either image of the member commit),
--   1053-lever-gates.sql (its scale half, and the instance read's `tier`, `scale` and `scale_level`, with 1056-danger-scale.sql's
--   overlay), 1059-no-party-finder.sql (`leader_tiers`), 1062-store-step.sql (the member commit's scaled
--   bounds and tally span); and the retry allowances of 1025, 1046, 1053-lever-gates and 1056 name this file's images.
--
-- ── PLAYER STATE THIS FILE DROPS, BY DESIGN (CLAUDE.md section 1: no progress protection; say it in the release note) ─────────
--   player_scaled_hours: hours bought with gold and not yet hunted (production, read only 2026-11-26: one account, 0.96 h of the 1 h it
--   bought). hunt_density.tier: every hero's saved tier pick (19 harder picks). hunt_sessions.tier: the tier an ended hunt ran at (the
--   summary no longer names it). No refund is built: a grant is a player-state edit, Tyler's call (CLAUDE.md section 2).
--
-- ── WHAT CROSSES TO ANOTHER PLAYER (CLAUDE.md §1) ─────────────────────────────
--   Less than before: a party member's view no longer carries its leader's tier picks.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
--   -3 client verbs, one of them a gold purchase. The settle's kill, item and defense bounds only narrow (no scaled roster can widen
--   them), and a settle carrying a `scale` key is refused bad_arguments (why: keys) like any other unknown key. No new grant, no new verb.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   DDL in one transaction: the column drops take ACCESS EXCLUSIVE on hunt_density, hunt_instances, hunt_sessions and
--   hunt_session_tally for the length of the apply (a settle in flight waits, as for any migration touching them).
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Every settle read loses hr_scaled_hunt_of (a ground probe and a leader read); every member commit loses two scaled-bound joins and
--   the scaled tally insert; every hunt start loses the tier pick's four-table join; the envelope loses two sections.
--
-- REVERSIBLE: restore the pre-apply daily backup (the bought hours and the picks are gone with their tables and columns), or re-apply
--   2027-02-27-hunt-tiers.sql, 2027-05-24-session-tier-open.sql, the scaled-hunts chain (2027-03-21 to 2027-05-28, 1053) and the
--   splices' pre images (pinned in §0).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: the image this file was written against (the replayed chain on set/v0.2.144), or its own.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hunt_instances') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: the hunt chain, the RPC baseline, the envelope sections or the Danger scale are missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_density_freeze()', '022927b62a7d6264ddb6bf783f6324b2', '66313edc576982bb584a10f296cf488e'),
    ('public.hr_hunt_admit(uuid,integer,text)', 'bc37e6068b6078f26f7e4e586efc4d48', 'd6e40529d2d466c90fc7c38fb239c189'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '3a6748518733987584b75e42e1d204d5', '8f9b22a5e77bc4d4d727d0731edccad9'),
    ('public.hr_hunt_best_fold(uuid)', 'b8a8da109b268ed62848d52073d6dbd9', 'eb6f87fd1cbd443551db6691d60cfae8')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin',
        v_r.fn, v_r.pre, v_r.post, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE READERS, ONE ANCHORED SPLICE A SITE ───────────────────────────────
-- Each anchor and its replacement are dollar-quoted, so the text a body holds after the splice is written here verbatim. A second apply
-- finds every replacement already in place (its post pin, §0) and the anchor gone, and moves nothing.
do $mig$
declare v_r record; v_def text; v_n int; v_fn text; v_moved boolean := false;
begin
  for v_r in select * from (values
    -- THE FREEZE: pull 0, no tier
    ('public.hr_hunt_density_freeze()',
     $a$declare v_tier text; v_size int;
begin
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): the instance's first session writes its tier and that tier's pull for the seats it opens with; nothing writes them again.
  -- Normal's pull is 0, the ground as it stands (hunt-grounds.js densityFor: as built alone, its partyPull in a party).
$a$,
     $b$begin
  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): the instance's first session freezes the pull it opens with, 0: the ground as built (no
  -- tier picks one; on the Danger scale the step sets the pull, hr_danger_freeze). Nothing writes it again.
$b$),
    ('public.hr_hunt_density_freeze()',
     $a$  v_tier := public.hr_hunt_tier_pick(new.instance_id, new.user_id, new.slot);
  v_size := greatest(1, least(4, (select count(*) from public.hunt_party_members m where m.party_id = new.instance_id)::int));
  update public.hunt_instances i
     set tier = v_tier,
         density = coalesce((select t.pull[v_size] from public.hr_ground_tiers t where t.hunt_id = i.hunt_id and t.tier = v_tier), 0)
   where i.id = new.instance_id and i.density is null;$a$,
     $b$  update public.hunt_instances i set density = 0 where i.id = new.instance_id and i.density is null;$b$),
    -- THE OUTGROWN DOOR: no scaled way in
    ('public.hr_hunt_admit(uuid,integer,text)',
     $a$    -- (hr_hunt_grounds.ends_at_level, hunt-grounds.js endsAtLevel: the Mill Cellar's 5) is refused to a hero already at it or over, unless
    -- the hunt would play scaled (hr_hunt_scaled_at_door: its leader's banked hours, at the leader's Level). The engine ends a hunt the
    -- moment its hero reaches the Level (END_ORDER's outgrown), so a hunt let in here would end at its first swing.
    if exists (select 1 from public.hr_hunt_grounds g
                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level)
       and public.hr_hunt_scaled_at_door(p_user, p_slot, p_hunt) is null then$a$,
     $b$    -- (hr_hunt_grounds.ends_at_level, hunt-grounds.js endsAtLevel: the Mill Cellar's 5) is refused to a hero already at it or over
    -- (RETIRE-TIER-CHAIN, 1071: no scaled hunt lets one in). The engine ends a hunt the moment its hero reaches the Level (END_ORDER's
    -- outgrown), so a hunt let in here would end at its first swing.
    if exists (select 1 from public.hr_hunt_grounds g
                where g.hunt_id = p_hunt and g.ends_at_level is not null and public.hr_level_of(p_user, p_slot) >= g.ends_at_level) then$b$)) t(fn, find, repl) loop
    -- every site of one body is spliced into its text before the body is created once (a body is checked whole as it is created)
    if v_fn is distinct from v_r.fn then
      if v_fn is not null and v_moved then execute v_def; end if;
      v_fn := v_r.fn; v_moved := false;
      v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    end if;
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the anchor is gone (and the replacement, when it says something, is in place)
    if v_n = 0 and (v_r.repl = '' or strpos(v_def, v_r.repl) > 0) then continue; end if;
    if v_n <> 1 then raise exception 'SPLICE: % holds its anchor % times, want 1: %', v_r.fn, v_n, left(v_r.find, 80); end if;
    v_def := replace(v_def, v_r.find, v_r.repl);
    v_moved := true;
  end loop;
  if v_fn is not null and v_moved then execute v_def; end if;
end $mig$;

-- ── §1b THE BODIES RESTATED WHOLE ──────────────────────────────────────────────────
-- Each patch chain was past its depth (tests/patch-chain-guard.mjs PATCH-1 and PATCH-3), so the body is authored whole here: the text the
-- chain held, less what the tier chain and the scaled hunts wrote into it. A second apply restates the same text (its §0 post pin).

-- public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer): no `scale` claim key (refused bad_arguments `keys`), no re-proof, no scale_level write, no hours debit
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb, p_members jsonb, p_project_user uuid DEFAULT NULL::uuid, p_project_slot integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew constant interval := interval '60 seconds';
  -- A fuse on the deploy gap, not a balance figure: the catalogue and the edge land seconds to minutes apart.
  c_shape_grace constant interval := interval '30 minutes';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_move  public.hunt_world_shape_move%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
  v_pend  jsonb := '[]'::jsonb;   -- ACCOUNT GOLD: every member's store bill, paid after every member
  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  -- TALLY (2026-12-23-tally-tasks.sql): step (4c) counts every member's kills onto its held kill tasks and pays a member
  -- whose hunt this settle ended (back in town).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  -- RETIRE-TIER-CHAIN (1071-retire-tier-chain.sql): no `scale` claim; a window carrying one is refused like any unknown key.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      -- THE SERVER'S OWN DEPLOY GAP: a well-formed world of THIS instance written under exactly the field list the
      -- catalogue replaced less than c_shape_grace ago (hunt_world_shape_move, written only by the catalogue's own
      -- trigger) is held: nothing moves, nothing is counted. Every other shape still counts toward the forfeit.
      select * into v_move from public.hunt_world_shape_move where id;
      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace
         and v_move.version = v_shape.version and v_move.shape = v_shape.shape
         and jsonb_typeof(v_wj) = 'object'
         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)
         and jsonb_typeof(v_wj->'w') = 'array' and jsonb_typeof(v_wj->'u') = 'array' and jsonb_typeof(v_wj->'p') = 'array'
         and v_wj->'w'->>0 is not distinct from v_ground and v_wj->'w'->1 = to_jsonb(v_wsw) then
        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',
          'detail', jsonb_build_object('from', jsonb_build_object('v', v_move.prev_version, 's', v_move.prev_shape),
                                       'to', jsonb_build_object('v', v_shape.version, 's', v_shape.shape), 'moved_at', v_move.moved_at)));
      end if;
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): every member's ACCOUNT PURSE, locked in user order right
  -- after the character locks and before any other shared row (a hearthfind ordinal, a tally), so two
  -- settles that share an account queue on its purse and can never hold each other's next lock.
  for v_u in select distinct (e.value->>'user')::uuid from jsonb_array_elements(p_members) e order by 1 loop
    perform public.hr_purse_lock(v_u);
  end loop;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): hr_apply's own frame call is DEFERRED while the members land
  -- (hr_frame_send reads hr.frame_defer); the frames go out below, once, from the committed state.
  perform set_config('hr.frame_defer', 'instance', true);
  begin
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S NEXT STEP, decided once for the whole room before any member lands
    --   (hr_boss_call_plan, under the locks above): every hero is charged the next fight, or the series ends for everyone on this win. The
    --   plan lives for this settle only (hr.boss_plan): hr_hunt_settle_session holds a won fight's end for it and hr_boss_call_step follows it.
    perform set_config('hr.boss_plan', coalesce(public.hr_boss_call_plan(p_instance, p_members, v_to)::text, ''), true);
    -- DANGER-SCALE (1056-danger-scale.sql): THE WINDOW'S WORLD ON THE SCALE, proved once before any member lands, against THIS window's
    --   climb (hr_danger_prove: the world this settle carries and stores, never the one stored before it; a refusal is the instance's);
    --   each member's value bound reads what it proved (hr_danger_bound). Null off the scale. This settle's only: cleared below, and a
    --   refusal's rollback restores what stood before.
    perform set_config('hr.danger_window', coalesce(public.hr_danger_prove(p_instance, v_world, v_win)::text, ''), true);
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      if v_h ? '_purse' then
        v_pend := v_pend || jsonb_build_array((v_h->'_purse')
                  || jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session'));
        v_h := v_h - '_purse';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    -- (4b) THE STORE BILLS, PAID FROM THE ACCOUNT PURSES (2026-12-15-account-gold.sql), after EVERY member's
    --      coins, cover and sales have landed: the engine spends one purse per account in time order, so
    --      with every credit in first no bill can take a purse below 0 (the window's whole bill is what
    --      that order kept payable). A bill the purse cannot pay means another hero of the account spent
    --      it since this window was read: gold_short, nothing lands, and the edge re-reads at once.
    for v_p in select e.value from jsonb_array_elements(v_pend) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_p->'user', 'slot', v_p->'slot', 'session', v_p->'session');
      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
      if v_g is null then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'purse', 'gold', public.hr_purse_of((v_p->>'user')::uuid),
          'cost', (v_p->>'cost')::bigint, 'floor', (v_p->>'floor')::bigint));
      end if;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values ((v_p->>'user')::uuid, (v_p->>'slot')::int, 'hunt', 'supply_buy', -(v_p->>'cost')::bigint, -(v_p->>'units')::bigint,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_p->'items', 'gold', (v_p->>'cost')::bigint),
                (v_p->>'session')::uuid, v_g);
    end loop;
    -- THE FLOOR, per account: after the window, the purse may not sit below the lowest "Keep at least" of
    -- its heroes that bought (one hero: its own floor, the pre-account-gold rule exactly).
    for v_u, v_f in select (e.value->>'user')::uuid, min((e.value->>'floor')::bigint)
                      from jsonb_array_elements(v_pend) e group by 1 order by 1 loop
      if public.hr_purse_of(v_u) < v_f then
        select jsonb_build_object('user', e.value->'user', 'slot', e.value->'slot', 'session', e.value->'session') into v_cur
          from jsonb_array_elements(v_pend) e where (e.value->>'user')::uuid = v_u
         order by (e.value->>'floor')::bigint, (e.value->>'slot')::int limit 1;
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));
      end if;
    end loop;
    v_cur := null;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- (4c) TAMSIN'S TALLY (2026-12-23-tally-tasks.sql), EVERY member, in (user_id, slot) order, under the character
    --      locks and purses taken above: its own kills by monster (the combat journal hr_apply just wrote, held by the
    --      kill bound) onto its held tasks on this ground; then, for a member whose hunt this settle ended, the
    --      payment of what is done (hr_tally_claim: the per-day cap, the bag, the purse, one session-stamped row).
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      perform public.hr_tally_count((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid, v_m->'delta'->'journal'->'meta');
      if exists (select 1 from public.hunt_sessions h where h.id = (v_m->>'session')::uuid and h.ended_at is not null) then
        perform public.hr_tally_claim((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid);
      end if;
    end loop;
    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
    --      own count starts over too (the fuse counts consecutive refusals only).
    v_cur := null;
    update public.hunt_sessions set refusals = 0
     where id in (select (e.value->>'session')::uuid from jsonb_array_elements(p_members) e) and refusals > 0;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    -- CALL-SERIES: the next fight starts in a fresh room (no stored world) with no record of the last one (hunt_session_tally.fight is ONE
    -- fight's: the losing line reads it; each member's own tally write landed after its step, so it is cleared here), and the plan ends with this settle.
    if coalesce((nullif(current_setting('hr.boss_plan', true), '')::jsonb->>'next')::boolean, false) then
      v_world := null;
      update public.hunt_session_tally t set fight = null
        from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null and t.session_id = h.id and t.fight is not null;
    end if;
    perform set_config('hr.boss_plan', '', true);
    perform set_config('hr.danger_window', '', true);  -- DANGER-SCALE (1056-danger-scale.sql): the proof was this settle's members' only
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing
    perform set_config('hr.boss_plan', '', true);     -- CALL-SERIES: a refused settle plans nothing
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end)
      -- PARTY-ISOLATION: the member whose own half raised it; hr_hunt_settle_refused counts it on that seat alone.
      || case when v_cur is not null then jsonb_build_object('member', v_cur) else '{}'::jsonb end);
  end;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): THE COMMIT POINT. Every member's rows, the purse bills and the
  -- instance row have landed: ONE frame per member, in lock order, of the state the database now holds (hr_frame_send:
  -- only to a character open in a client, never the requester's own echo, a fresh projection only for a watched one).
  -- A push failure never fails the settle: hr_frame_send swallows its own errors, and this handler stands behind it.
  perform set_config('hr.frame_defer', '', true);
  v_proj := case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      -- WATCHED-SETTLE-COST (2027-03-31-watched-settle-cost.sql): the frame to a hero of the asker's own account that is not
      -- on its screen waits for the next mark of hr_tick_config.frame_own_s (0 = never held); its news never waits.
      continue when public.hr_frame_own_held(v_m, p_project_user, p_project_slot, v_i.settled_to, v_to);
      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,
        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);
    end loop;
  exception when others then
    raise warning 'hr_hunt_apply_instance: frames for % not sent (%) — the settle is committed anyway', p_instance, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', v_proj);
end $function$;

-- public.hr_hunt_best_fold(uuid): no scaled run to skip
CREATE OR REPLACE FUNCTION public.hr_hunt_best_fold(p_session uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- BESTS-SUPPLY (2026-12-06-hunt-bests-supply.sql): the run that holds xp_h also gives supply_h (its store gold an hour).
  v_s      public.hunt_sessions%rowtype;
  v_wall_h numeric;
  v_mode   text;
  v_ph     jsonb;
  v_xp     bigint;
  v_bal    bigint;
  v_sup    bigint;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  if not found or v_s.ended_at is null or v_s.ended_at - v_s.entered_at < public.hr_hunt_best_min() then return; end if;
  -- THE ANALYZER'S CLOCK: wall hours, entered -> ended (hr_hunt_analyzer_of's v_wall_h).
  v_wall_h := extract(epoch from (v_s.ended_at - v_s.entered_at)) / 3600.0;
  -- THE ANALYZER'S PARTY: another character's session in this instance whose hunt overlapped this one.
  v_mode := case when exists (
      select 1 from public.hunt_sessions h
       where h.instance_id = v_s.instance_id and h.id <> v_s.id
         and (h.user_id, h.slot) <> (v_s.user_id, v_s.slot)
         and h.entered_at <= v_s.ended_at and coalesce(h.ended_at, now()) >= v_s.entered_at)
    then 'party' else 'solo' end;
  -- THE HERO'S OWN figures, exactly as its analyzer showed them (never the party's sum).
  v_ph := public.hr_hunt_stats_of(array[v_s.id], v_wall_h, null, null)->'per_hour';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): a best is XP an hour without a live event's part, so a weekend never sets a best a normal day can't beat.
  v_xp := round((v_ph->>'xp')::numeric - coalesce((select t.xp_event from public.hunt_session_tally t where t.session_id = p_session), 0) / v_wall_h)::bigint;
  v_bal := (v_ph->>'balance')::numeric::bigint;
  v_sup := (v_ph->>'waste')::numeric::bigint;
  if v_xp is null or v_bal is null then return; end if;
  insert into public.hunt_bests as b (user_id, slot, hunt_id, mode, xp_h, xp_session, balance_h, balance_session, supply_h)
    values (v_s.user_id, v_s.slot, v_s.hunt_id, v_mode, v_xp, v_s.id, v_bal, v_s.id, v_sup)
  on conflict (user_id, slot, hunt_id, mode) do update
    set xp_h            = greatest(b.xp_h, excluded.xp_h),
        xp_session      = case when excluded.xp_h > b.xp_h then excluded.xp_session else b.xp_session end,
        supply_h        = case when excluded.xp_h > b.xp_h then excluded.supply_h else b.supply_h end,
        balance_h       = greatest(b.balance_h, excluded.balance_h),
        balance_session = case when excluded.balance_h > b.balance_h then excluded.balance_session else b.balance_session end,
        updated_at      = case when excluded.xp_h > b.xp_h or excluded.balance_h > b.balance_h then now() else b.updated_at end;
end $function$;

-- ── §2 THE VERBS, THE SECTIONS AND THE INTERNALS GO ──────────────────────────
delete from public.hr_client_rpc_baseline where proname in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    delete from public.hr_gm_wall_allow where rpc in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy');
  end if;
end $mig$;
delete from public.hr_state_sections where key in ('hunt_tier', 'scaled_hunts');
delete from public.hr_feature_switches where switch_id = 'scaled_hunts';
drop trigger if exists hr_hunt_tier_open on public.hunt_sessions;
drop trigger if exists hr_hunt_tier_stamp on public.hunt_sessions;
drop trigger if exists hr_scaled_hours_hold_ins on public.player_scaled_hours;
drop trigger if exists hr_scaled_hours_hold_upd on public.player_scaled_hours;
drop function if exists public.hr_hunt_tier_set(integer, text, text, uuid);
drop function if exists public.hr_scaled_hunt_switch(integer, text, boolean, uuid);
drop function if exists public.hr_scaled_hunt_buy(integer, text, integer, bigint, uuid);
drop function if exists public.hr_hunt_tier_view(uuid, integer);
drop function if exists public.hr_scaled_hunts_view(uuid, integer);
drop function if exists public.hr_hunt_tier_pick(uuid, uuid, integer);
drop function if exists public.hr_hunt_tier_open();
drop function if exists public.hr_hunt_tier_stamp();
drop function if exists public.hr_hunt_scaled_at_door(uuid, integer, text);
drop function if exists public.hr_scaled_hours_hold();
drop function if exists public.hr_scaled_hunt_of(uuid);
drop function if exists public.hr_scaled_hours_today(uuid, integer);
drop function if exists public.hr_scaled_level(text, integer);

-- ── §3 THE TABLES AND COLUMNS GO ─────────────────────────────────────────────
drop table if exists public.hunt_scale_holds;
drop table if exists public.player_scaled_hours;
drop table if exists public.hr_scaled_kill_bounds;
drop table if exists public.hr_scaled_grounds;
drop table if exists public.hr_scaled_hunt_rule;
drop table if exists public.hr_ground_tiers;
alter table public.hunt_density drop column if exists tier;
alter table public.hunt_instances drop column if exists tier;
alter table public.hunt_instances drop column if exists scale_level;
alter table public.hunt_sessions drop column if exists tier;
alter table public.hunt_session_tally drop column if exists scaled_ms;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- (a) THE SHAPE: every dropped name is gone (functions, triggers, tables, columns, baseline rows, door list, sections, the switch);
--     no public body names a dropped thing; the RPC surface agrees with the baseline.
-- (b) THE PATH THAT STAYS: a Level 60 hero enters a ground on the Danger scale. The instance freezes pull 0 and the default stance; the
--     engine's read carries no tier and no scale, a member's options no tier; the envelope carries no hunt_tier or scaled_hunts section;
--     the party view no leader_tiers; the hunt view no session tier; the carry-on plan no hero tier.
-- (c) THE OUTGROWN DOOR STILL REFUSES: the same hero at the Mill Cellar (its hunt ends at Level 5) is refused `outgrown`.
-- (d) A SETTLE CARRYING A SCALE CLAIM IS REFUSED: hr_hunt_apply_instance answers bad_arguments (keys) for a `scale` key, before it reads anything.
do $chk$
declare
  c_u    constant uuid := '00000107-1000-4000-a000-000000000001';
  k      constant text := '00000107-1000-4000-a000-0000';
  v jsonb; v_iid uuid; v_sid uuid; v_sig text; v_bad text; v_ground text; v_read jsonb;
begin
  -- (a)
  foreach v_sig in array array['public.hr_hunt_tier_set(integer,text,text,uuid)', 'public.hr_scaled_hunt_switch(integer,text,boolean,uuid)',
      'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'public.hr_hunt_tier_view(uuid,integer)', 'public.hr_scaled_hunts_view(uuid,integer)',
      'public.hr_hunt_tier_pick(uuid,uuid,integer)', 'public.hr_hunt_tier_open()', 'public.hr_hunt_tier_stamp()',
      'public.hr_hunt_scaled_at_door(uuid,integer,text)', 'public.hr_scaled_hours_hold()', 'public.hr_scaled_hunt_of(uuid)',
      'public.hr_scaled_hours_today(uuid,integer)', 'public.hr_scaled_level(text,integer)'] loop
    if to_regprocedure(v_sig) is not null then raise exception 'retire-tier-chain §4(a): % still exists', v_sig; end if;
  end loop;
  foreach v_sig in array array['public.hunt_scale_holds', 'public.player_scaled_hours', 'public.hr_scaled_kill_bounds', 'public.hr_scaled_grounds',
      'public.hr_scaled_hunt_rule', 'public.hr_ground_tiers'] loop
    if to_regclass(v_sig) is not null then raise exception 'retire-tier-chain §4(a): % still exists', v_sig; end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and ((table_name in ('hunt_density', 'hunt_instances', 'hunt_sessions') and column_name = 'tier')
                 or (table_name = 'hunt_instances' and column_name = 'scale_level') or (table_name = 'hunt_session_tally' and column_name = 'scaled_ms'))) then
    raise exception 'retire-tier-chain §4(a): a tier or scale column is still there'; end if;
  if exists (select 1 from pg_trigger where not tgisinternal
               and tgname in ('hr_hunt_tier_open', 'hr_hunt_tier_stamp', 'hr_scaled_hours_hold_ins', 'hr_scaled_hours_hold_upd')) then
    raise exception 'retire-tier-chain §4(a): a tier or scale trigger is still armed'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy')) then
    raise exception 'retire-tier-chain §4(a): a dropped verb is still on hr_client_rpc_baseline'; end if;
  if to_regclass('public.hr_gm_wall_allow') is not null and exists (select 1 from public.hr_gm_wall_allow
       where rpc in ('hr_hunt_tier_set', 'hr_scaled_hunt_switch', 'hr_scaled_hunt_buy')) then
    raise exception 'retire-tier-chain §4(a): a dropped verb is still on the Game Master''s door list'; end if;
  if exists (select 1 from public.hr_state_sections where key in ('hunt_tier', 'scaled_hunts') or fn ~ '^hr_(hunt_tier|scaled)_') then
    raise exception 'retire-tier-chain §4(a): a tier or scale section is still in the envelope'; end if;
  if exists (select 1 from public.hr_feature_switches where switch_id = 'scaled_hunts') then
    raise exception 'retire-tier-chain §4(a): the scaled_hunts switch is still a row'; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosrc ~ 'hr_scaled_|player_scaled_hours|hunt_scale_holds|hr_ground_tiers|hr_hunt_tier_|scale_level|scaled_ms|leader_tiers|hr_hunt_scaled_at_door';
  if v_bad is not null then raise exception 'retire-tier-chain §4(a): a body still names the tier chain or the scaled hunts: %', v_bad; end if;
  perform public.hr_assert_grant_hygiene(true);

  select g.hunt_id into v_ground from public.hr_danger_grounds g join public.hr_hunt_grounds h on h.hunt_id = g.hunt_id
   where h.ends_at_level is null order by g.hunt_id limit 1;
  if v_ground is null then raise exception 'retire-tier-chain §4-harness: no ground on the Danger scale without an exit Level'; end if;
  begin
    -- (b)
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Tierless') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'retire-tier-chain §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'retire-tier-chain §4-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(60) where user_id = c_u and slot = 0;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_ground, '[]'::jsonb, 0, null, (k || '00000b01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'retire-tier-chain §4(b): entering % answered %', v_ground, v; end if;
    select h.id, h.instance_id into v_sid, v_iid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    if (select density from public.hunt_instances where id = v_iid) is distinct from 0 then
      raise exception 'retire-tier-chain §4(b): the instance froze pull %, not the ground as built', (select density from public.hunt_instances where id = v_iid); end if;
    if (select risk from public.hunt_instances where id = v_iid) is null then
      raise exception 'retire-tier-chain §4(b): a ground on the scale froze no stance'; end if;
    v_read := public.hr_hunt_instance_read(c_u, 0);
    if v_read->'instance' ?| array['tier', 'scale', 'scale_level'] or v_read->'members'->0->'session'->'options' ? 'tier'
       or coalesce(v_read->'members'->0->'session'->'options'->>'risk', '') = '' then
      raise exception 'retire-tier-chain §4(b): the engine reads instance % and options %', v_read->'instance' - 'secret', v_read->'members'->0->'session'->'options'; end if;
    v := public.hr_state_of(c_u, 0);
    if v ?| array['hunt_tier', 'scaled_hunts'] then raise exception 'retire-tier-chain §4(b): the envelope still carries a tier or scale section'; end if;
    if public.hr_hunt_party_view(c_u, 0) ? 'leader_tiers' then raise exception 'retire-tier-chain §4(b): the party view still says leader_tiers'; end if;
    if public.hr_hunt_view(c_u) ? 'tier' or coalesce(public.hr_hunt_view(c_u)->'session', '{}'::jsonb) ? 'tier' then
      raise exception 'retire-tier-chain §4(b): the hunt view still names a tier'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(public.hr_carry_on_plan_of(c_u, array[0])->'heroes', '[]'::jsonb)) e where e.value ? 'tier') then
      raise exception 'retire-tier-chain §4(b): the carry-on plan still names a tier'; end if;
    -- (d) a scale claim is an unknown key, refused before anything is read or written; the same window without it is not refused for
    --     its keys (the control: it is the `scale` key the refusal names)
    v := public.hr_hunt_apply_instance(v_iid, 0, jsonb_build_object('to', now(), 'world_swing', 0, 'world', null, 'scale', jsonb_build_object('level', 20)),
      jsonb_build_array(jsonb_build_object('user', c_u, 'slot', 0)), c_u, 0);
    if v->>'error' is distinct from 'bad_arguments' or v->>'why' is distinct from 'keys' then
      raise exception 'retire-tier-chain §4(d): a scale claim answered %', v; end if;
    begin
      v := public.hr_hunt_apply_instance(v_iid, 0, jsonb_build_object('to', now(), 'world_swing', 0, 'world', null),
        jsonb_build_array(jsonb_build_object('user', c_u, 'slot', 0)), c_u, 0);
    exception when others then v := jsonb_build_object('raised', sqlerrm);
    end;
    if v->>'why' is not distinct from 'keys' then raise exception 'retire-tier-chain §4(d) CONTROL: the window with no scale was refused for its keys: %', v; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    -- (c)
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, (k || '00000c01')::uuid);
    if v->>'error' is distinct from 'outgrown' then raise exception 'retire-tier-chain §4(c): a Level 60 hero at the Cellar answered %', v; end if;
    raise exception using errcode = 'HR897', message = 'retire-tier-chain §4 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) then raise exception 'retire-tier-chain §4: LEAKED a probe row'; end if;
  raise notice 'retire-tier-chain: the tier chain and the scaled hunts are gone from the server; a hunt freezes pull 0 and its stance; all green';
end $chk$;
