-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-17-scaled-best.sql — A SCALED RUN SETS NO PERSONAL BEST (lane/c-arm-switches, systems-engineer, 2026-11-18; found playing the
--   scaled hunts on the local world: a Level 9 hero's Mill Cellar best read 9,235 Level XP/h, then 18,521 after 15 minutes scaled to
--   Level 9, a number no unscaled Cellar run can ever beat; the Coordinator's brief the same day, "a scaled run must not set the ground's
--   unscaled personal best").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4. ON THE EA SECURITY LIST with 2027-03-21-scaled-hunts.sql (a settle body and a best a player reads).
-- ORDER: BEFORE 2027-05-18-arm-scaled-hunts.sql (the switch opens the scaled hunts to everyone only once a scaled run stays out of the
--   bests), after every file that moved hr_hunt_apply_instance (2027-04-24-boss-call-series.sql, the last) or hr_hunt_best_fold
--   (2027-03-22-live-events.sql, the last): §0 pins both as production runs them (tests/live-hash-drift.baseline.json, measured 2026-11-18).
-- EDGE: none (the engine sends nothing new; the server marks the window it already proved scaled). CLIENT: none (the Hunts row's "Best"
--   and the advice read hunt_bests, which a scaled run no longer writes).
--
-- ── WHY OUT, NOT A SEPARATE SCALED BEST ─────────────────────────────────────
-- hunt_bests is ONE number a ground and mode that every reader takes as "what this hero does here": the Hunts row's Best, the "where to
--   hunt" advice (src/shell/hunt-list.js reads its XP and its balance), the summary's new-best line. A scaled hour is a paid what-if at
--   another Level with its own rows, so its figures are not the ground's: kept in, a bought hour moves every one of those readers; kept as
--   a second best, each reader must learn a new key and choose between two numbers, and a paid number sits beside the free one. The live
--   events made the same call (a best leaves the event's part out, 2027-03-22-live-events.sql). So a session that played ANY scaled window
--   writes no best at all; its own analyzer and summary still show every figure it earned.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hunt_session_tally.scaled_ms (NEW, >= 0)   the world time this session's hunt played scaled (the leader's bank debit of each window the
--                                               commit proved scaled: the window's world swings x the swing). An aggregate, no new row.
--   hr_hunt_apply_instance   RESTATED WHOLE (its chain was 4 anchored edits deep since 2027-03-21-scaled-hunts.sql; tests/patch-chain-guard.mjs),
--                            one change marked SCALED-BEST: right after the leader's bank pays a scaled window, every member of that
--                            window's tally gains the window's scaled time (insert .. on conflict: a tally row is made if none yet).
--   hr_hunt_best_fold        ONE anchored splice (marker SCALED-BEST): a session with scaled time folds nothing.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- The tally write runs inside hr_hunt_apply_instance under every member's character lock and purse lock (taken first), after the bank row,
-- on rows of this instance's own sessions only: the lock order is unchanged and no new lock is taken. A replayed settle key answers
-- `replayed` before this point, so a window's time is added once. The fold is a deferred constraint trigger at COMMIT, after the mark.
-- A second apply restates hr_hunt_apply_instance byte for byte and finds hr_hunt_best_fold's marker; §0 refuses a body that is neither its
-- pinned image nor this file's.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client reaches the column or the bodies' new lines. The mark comes from the server's own proved scale (hr_scaled_hunt_of under the
-- instance lock), never an edge or client number. It can only take a best away from a scaled session, never give one.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- Per scaled settle, one upsert a member on its tally row (primary key); unscaled settles pay nothing. Per fold, one primary-key read.
--
-- REVERSIBILITY: re-apply the two pinned pre-images (79ea06c2 and fa7421f3, §0), then drop hunt_session_tally.scaled_ms. Bests stay as written.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hunt_session_tally') is null or to_regclass('public.player_scaled_hours') is null
     or to_regprocedure('public.hr_scaled_hunt_of(uuid)') is null then
    raise exception 'PRECONDITION: the scaled hunts (2027-03-21-scaled-hunts.sql) first'; end if;
  -- each body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-18) or this file's: the body restated whole
  -- by its own image (normalised md5), the spliced one by its marker, so a second apply after a later file moved one refuses, never undoes it
  for v_r in select * from (values
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '79ea06c28174d95f11d03965bdbd8be5', '10d5ba85de3cd36b7105f6c5f3d050ee'),
    ('public.hr_hunt_best_fold(uuid)', 'fa7421f3a9d55fff27ae53d254196540', null)) t(fn, pre, own) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and (case when v_r.own is null then strpos(v_def, 'SCALED-BEST (2027-05-17-scaled-best.sql)') = 0
                 else md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.own end) then
      raise exception 'PIN: % is neither its live image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre,
        md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.hunt_session_tally add column if not exists scaled_ms bigint not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_session_tally_scaled_ms_check') then
    alter table public.hunt_session_tally add constraint hunt_session_tally_scaled_ms_check check (scaled_ms >= 0); end if;
end $mig$;
comment on column public.hunt_session_tally.scaled_ms is
  '2027-05-17-scaled-best.sql: the world time this session played scaled (each window the commit proved scaled, its bank debit). Written only by hr_hunt_apply_instance; a session with any keeps out of hunt_bests (hr_hunt_best_fold).';

-- ── §2 THE MARK: hr_hunt_apply_instance RESTATED WHOLE ──────────────────────
-- Its live body (79ea06c2, the image 2027-04-24-boss-call-series.sql left after 2027-03-21-scaled-hunts.sql's last full restatement and
-- the anchored edits since: tests/patch-chain-guard.mjs counts that chain 4 deep, past the rule's 2) written out whole, with ONE change,
-- marked SCALED-BEST: right after the leader's bank pays a scaled window, every member of that window gains the window's scaled time on
-- its tally. A second apply restates the same text (byte-identical); §0 refuses a body that is neither the live image nor this one.
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
  v_scale int;            -- SCALED-HUNTS: the Level this window played (null: the ground's own), proved before any member lands
  v_sc    jsonb;          -- SCALED-HUNTS: the server's own scale of the instance (hr_scaled_hunt_of)
  v_sms   bigint := 0;    -- SCALED-HUNTS: the hours this window spends, in ms: its world swings x the swing
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
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): `scale` { level } is the Level the edge says the window played, a CLAIM (4) re-proves.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world', 'scale'))
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
    -- SCALED-HUNTS: THE SCALE THIS WINDOW PLAYED, re-proved against the server's own rule before any member lands (each member's kill
    --   bound reads it): a claim stands only if the instance's leader has the switch on, hours banked and a Level that scales the ground
    --   to exactly that Level (hr_scaled_hunt_of), and the window's world swings fit in those hours. No claim is the ground's own rows,
    --   which spend nothing. The Level the stored world is built on is written here.
    v_scale := null;
    if p_settle ? 'scale' and jsonb_typeof(p_settle->'scale') <> 'null' then
      if jsonb_typeof(p_settle->'scale') <> 'object' or exists (select 1 from jsonb_object_keys(p_settle->'scale') k where k <> 'level')
         or jsonb_typeof(p_settle->'scale'->'level') is distinct from 'number' or (p_settle->'scale'->>'level') !~ '^[0-9]{1,4}$' then
        perform public.hr_reject('bad_scale'); end if;
      v_sc := public.hr_scaled_hunt_of(p_instance);
      if v_sc is null or (v_sc->>'level')::int <> (p_settle->'scale'->>'level')::int then
        perform public.hr_reject('scale_moved', jsonb_build_object('claim', p_settle->'scale', 'level', v_sc->'level')); end if;
      v_scale := (v_sc->>'level')::int;
      v_sms := (v_wsw - v_i.world_swing) * v_tick;
      if v_sms > (v_sc->>'banked_ms')::bigint then
        perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms, 'banked_ms', (v_sc->>'banked_ms')::bigint)); end if;
    end if;
    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
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
    -- SCALED-HUNTS: THE HOURS SPENT, from the leader's bank, under every member's lock and purse taken above (a purchase takes its
    --   hero's lock, then the purse, then this row: the same order). They tick down only while the party is in the spawn: the window's
    --   world swings, never town or travel. Refused, never clamped, if the bank no longer holds them.
    if v_scale is not null and v_sms > 0 then
      update public.player_scaled_hours h
         set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms, updated_at = now()
       where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int and h.hunt_id = v_i.hunt_id and h.banked_ms >= v_sms;
      if not found then perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms)); end if;
      -- SCALED-BEST (2027-05-17-scaled-best.sql): every member of this scaled window keeps its scaled time on its tally, so the
      --   session's personal best is never folded (hr_hunt_best_fold): a scaled run is not the ground's own.
      insert into public.hunt_session_tally as t (session_id, user_id, slot, scaled_ms)
        select (e.value->>'session')::uuid, (e.value->>'user')::uuid, (e.value->>'slot')::int, v_sms from jsonb_array_elements(p_members) e
        on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;
    end if;
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

-- ── §3 THE FOLD: hr_hunt_best_fold (one anchored splice) ──────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := pg_get_functiondef('public.hr_hunt_best_fold(uuid)'::regprocedure);
  if strpos(v_def, 'SCALED-BEST (2027-05-17-scaled-best.sql)') > 0 then return; end if;
  v_old := $a$  if v_xp is null or v_bal is null then return; end if;$a$;
  v_new := $a$  -- SCALED-BEST (2027-05-17-scaled-best.sql): a run that played any scaled window is not the ground's own: no best from it.
  if coalesce((select t.scaled_ms from public.hunt_session_tally t where t.session_id = p_session), 0) > 0 then return; end if;
$a$ || v_old;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'hr_hunt_best_fold: the fold anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the column: bigint, not null, default 0, a negative refused; no client role writes the tally
-- (b) both bodies carry the marker, the mark's upsert and the fold's early return
-- (c) the fold, on two ended probe sessions of one hero on one ground: the unscaled one writes its best; the scaled one (scaled_ms > 0,
--     XP an hour three times higher) writes nothing and leaves the first best as it was
do $chk$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-0000a2e5b001';
  v_g text; v_s1 uuid; v_s2 uuid; v_b jsonb; v_role text;
begin
  -- (a)
  if (select format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull from pg_attribute a
       where a.attrelid = 'public.hunt_session_tally'::regclass and a.attname = 'scaled_ms' and not a.attisdropped) is distinct from 'bigint:true' then
    raise exception 'scaled-best §4(a): hunt_session_tally.scaled_ms is not a not-null bigint'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_role, 'public.hunt_session_tally', 'scaled_ms', 'insert,update') then
      raise exception 'scaled-best §4(a): % can write hunt_session_tally.scaled_ms', v_role; end if;
  end loop;
  -- (b)
  if strpos(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure),
            'on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;') = 0
     or strpos(pg_get_functiondef('public.hr_hunt_best_fold(uuid)'::regprocedure),
            'where t.session_id = p_session), 0) > 0 then return; end if;') = 0 then
    raise exception 'scaled-best §4(b): a body lacks its SCALED-BEST line'; end if;
  -- (c)
  select hunt_id into v_g from public.hr_scaled_grounds order by hunt_id limit 1;
  if v_g is null then raise exception 'scaled-best §4(c)-harness: no scalable ground'; end if;
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'scaled-best §4 probe (the game is closed)') on conflict (user_id) do nothing;
    perform public.hr_create_character(0);
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (c_u, 0, v_g, now() - interval '6 hours', now() - interval '6 hours', now() - interval '330 minutes',
              now() - interval '330 minutes', now() - interval '330 minutes', 'left') returning id into v_s1;
    insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins, supply_gold)
      values (v_s1, c_u, 0, '{"level": 1000}'::jsonb, 100, 50) on conflict (session_id) do update set xp = excluded.xp, coins = excluded.coins;
    perform public.hr_hunt_best_fold(v_s1);
    v_b := (select to_jsonb(b) from public.hunt_bests b where b.user_id = c_u and b.slot = 0 and b.hunt_id = v_g);
    if v_b is null or (v_b->>'xp_session')::uuid is distinct from v_s1 then
      raise exception 'scaled-best §4(c): the unscaled run wrote no best (%)', v_b; end if;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason)
      values (c_u, 0, v_g, now() - interval '5 hours', now() - interval '5 hours', now() - interval '270 minutes',
              now() - interval '270 minutes', now() - interval '270 minutes', 'left') returning id into v_s2;
    insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins, supply_gold, scaled_ms)
      values (v_s2, c_u, 0, '{"level": 3000}'::jsonb, 300, 50, 1800000) on conflict (session_id) do update set xp = excluded.xp, coins = excluded.coins, scaled_ms = excluded.scaled_ms;
    perform public.hr_hunt_best_fold(v_s2);
    if (select to_jsonb(b) from public.hunt_bests b where b.user_id = c_u and b.slot = 0 and b.hunt_id = v_g) is distinct from v_b then
      raise exception 'scaled-best §4(c): the scaled run moved the best to %', (select to_jsonb(b) from public.hunt_bests b where b.user_id = c_u and b.hunt_id = v_g); end if;
    begin
      update public.hunt_session_tally set scaled_ms = -1 where session_id = v_s2;
      raise exception 'scaled-best §4(a): a negative scaled_ms was accepted';
    exception when check_violation then null;
    end;
    raise exception using errcode = 'HRB17', message = 'scaled-best §4 complete - rolling back';
  exception when sqlstate 'HRB17' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.hunt_sessions where user_id = c_u) or exists (select 1 from public.hunt_bests where user_id = c_u)
     or exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception 'scaled-best §4: the probe leaked a row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'scaled-best §4 OK: a scaled run keeps out of hunt_bests, an unscaled one folds as before';
end $chk$;
