-- ══════════════════════════════════════════════════════════════════════════════
-- Hearthrise — A HERO MUST NOT SIT IN A HUNT IT CAN'T FIGHT IN: THE SETTLE PROVES `no_fight`
-- (lane/a-no-fight, systems-engineer, 2026-10-31; game designer's ruling 10-31: players' archers "hunted" for hours
-- with 0 kills while the store spent 4,500-8,746 gp).
-- STAGED. Game CLOSED: applies on its passing §2 (CLAUDE.md §2), one file via the Coordinator's apply tool, never
-- inside begin/commit, never 00:00-00:10 UTC. ORDER: right after 2027-02-11-no-fight-hunt-sessions-catalogue.generated.sql
-- (END_ORDER's no_fight, hr_hunt_limits.no_fight_min; §0 refuses otherwise), with the hr-accrue edge that proposes the end.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- The ENGINE decides (src/core/action-rules.js `no_fight`, the world's `fightAt`: one path, viewed or closed, the same
-- boundary however the windows are cut). The DATABASE cannot see the world's fights, so hr_hunt_settle_session proves
-- what it can: the hero has been hunting at least the limit's minutes (its hunt_from to the end's instant) and this
-- window journalled no kill for it. Everything else is the `rule` end's argument: the end can only stop value, never mint it.
--
-- ── ONE SPLICE ───────────────────────────────────────────────────────────────
-- hr_hunt_settle_session's last author is 2026-12-18-party-leave-together.sql. One new `when` arm in its end proof,
-- every other line verbatim; a second apply finds the post image and moves nothing.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
-- No new door and no new grant. A forged no_fight end from a compromised engine ends that hero's own hunt early, after
-- at least the limit's minutes, with no value attached.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if not exists (select 1 from public.hr_hunt_end_reasons where reason = 'no_fight')
     or public.hr_hunt_limit('no_fight_min') is null then
    raise exception 'PRECONDITION: apply 2027-02-11-no-fight-hunt-sessions-catalogue.generated.sql first (END_ORDER''s no_fight, its limit)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)');
  if v_md5 is null then raise exception 'PIN: hr_hunt_settle_session is missing'; end if;
  if v_md5 is distinct from '5341d7365d12b781871382e7befd0be4' and v_md5 is distinct from 'fa12a0583b3fa3105efd3c319b5d8c59' then
    raise exception 'PIN: hr_hunt_settle_session is neither 2026-12-18-party-leave-together.sql''s image nor this file''s - md5 %: another file moved it; re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE PROOF ─────────────────────────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'NO-FIGHT') = 0 then
    v_old := $a$      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);$a$;
    v_new := $a$      -- NO-FIGHT (2027-02-11-no-fight-settle.sql): nobody in the instance landed a blow for the limit's minutes
      -- (the engine's reading of its world). Provable as: hunting that long, and no kill in this window. It can only stop value.
      when 'no_fight' then v_end_at >= v_s.hunt_from + make_interval(mins => public.hr_hunt_limit('no_fight_min'))
                           and not exists (select 1 from public.player_ledger l
                                            where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from
                                              and jsonb_typeof(l.meta->'kills') = 'number' and (l.meta->>'kills')::numeric > 0)
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: NO-FIGHT anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §2 THE SELF-CHECK, BY EXECUTING IT (rolled back) ─────────────────────────
-- Through hr_hunt_apply_instance itself as the engine proposes it, one solo probe hero: (a) a no_fight end before the
-- limit's minutes is refused end_not_proven and moves nothing; (b) past them with a kill in the window, refused too;
-- (c) past them with no kill, the session ends no_fight, an automatic end; (d) the splice once, the body §0's post pin.
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-00005eb70001';
  k   text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_g text; v_s uuid; v_at timestamptz; v_t bigint; v_min int;
begin
  begin
    execute $f$
      create function pg_temp.hr_nf_settle(p_inst uuid, p_swings bigint, p_kills int, p_reason text) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      -- One instance window of p_swings swings, as the engine proposes it: its one member's p_kills, ending p_reason.
      declare v_i public.hunt_instances%rowtype; v_s public.hunt_sessions%rowtype; v_t bigint; v_to timestamptz;
              v_eat timestamptz; v_mto timestamptz; v_ver bigint; v_s0 bigint; v_e jsonb;
      begin
        perform set_config('request.jwt.claim.sub', '', true);
        select * into v_i from public.hunt_instances where id = p_inst;
        select * into v_s from public.hunt_sessions where instance_id = p_inst and ended_at is null;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_eat := v_s.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        v_mto := v_eat + interval '1 millisecond';
        v_to := v_i.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        v_s0 := public.hr_stamina_of(v_s.user_id, v_s.slot, v_s.settled_to);
        select version into v_ver from public.player_state where user_id = v_s.user_id and slot = v_s.slot;
        execute 'set local role hr_engine';
        v_e := public.hr_hunt_apply_instance(p_inst, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + p_swings, 'world', null),
          jsonb_build_array(jsonb_build_object('user', v_s.user_id, 'slot', v_s.slot, 'session', v_s.id,
            'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_mto, 'level_xp', p_kills,
              'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                'meta', jsonb_build_object('ms', p_swings * v_t, 'ticks', p_swings, 'kills', p_kills, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + p_swings, 'to', v_mto,
              'next_swing_at', v_mto, 'uses', '{}'::jsonb, 'paid_ms', p_swings * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
              'ended', jsonb_build_object('reason', p_reason, 'at', v_eat), 'buys', '{}'::jsonb, 'cover', '{}'::jsonb,
              'stamina', greatest(0, v_s0 - p_swings * v_t), 'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null)), null, null);
        execute 'reset role';
        return v_e;
      end $b$ $f$;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    update public.hr_hunt_config set enabled = true where id;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    v_min := public.hr_hunt_limit('no_fight_min');
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into auth.users (id) values (v_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe No Fight') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'no-fight-settle §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 0;
    insert into public.social_presence (user_id, slot, seen_at) values (v_a, 0, now()) on conflict (user_id) do update set seen_at = now();
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, (k || '5eb70100')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: the enter answered %', v; end if;
    select id into v_s from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    v_at := date_trunc('second', now() - make_interval(mins => v_min * 2));
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_s;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at
     where id = (select instance_id from public.hunt_sessions where id = v_s);

    -- (a) BEFORE THE LIMIT'S MINUTES.
    v := pg_temp.hr_nf_settle((select instance_id from public.hunt_sessions where id = v_s), (v_min * 60000 / v_t) - 1, 0, 'no_fight');
    if v->>'error' is distinct from 'end_not_proven' or (select ended_at from public.hunt_sessions where id = v_s) is not null
       or (select settled_to from public.hunt_sessions where id = v_s) <> v_at then
      raise exception 'VERIFY(a): a no_fight end before % minutes answered %', v_min, v; end if;
    -- (b) A KILL IN THE WINDOW.
    v := pg_temp.hr_nf_settle((select instance_id from public.hunt_sessions where id = v_s), v_min * 60000 / v_t, 1, 'no_fight');
    if v->>'error' is distinct from 'end_not_proven' or (select ended_at from public.hunt_sessions where id = v_s) is not null then
      raise exception 'VERIFY(b): a no_fight end with a kill in its window answered %', v; end if;
    -- (c) THE HONEST END.
    v := pg_temp.hr_nf_settle((select instance_id from public.hunt_sessions where id = v_s), v_min * 60000 / v_t, 0, 'no_fight');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the honest no_fight end answered %', v; end if;
    if (select end_reason from public.hunt_sessions where id = v_s) is distinct from 'no_fight'
       or (select ended_at from public.hunt_sessions where id = v_s) is distinct from v_at + make_interval(mins => v_min) then
      raise exception 'VERIFY(c): the session ended % at %', (select end_reason from public.hunt_sessions where id = v_s),
        (select ended_at from public.hunt_sessions where id = v_s); end if;
    if not coalesce((select resumes from public.hr_hunt_end_reasons where reason = 'no_fight'), false) then
      raise exception 'VERIFY(c): no_fight is not an automatic end'; end if;
    raise exception using errcode = 'HRNFS', message = 'no-fight-settle §2 complete - rolling back';
  exception when sqlstate 'HRNFS' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_a) or to_regprocedure('pg_temp.hr_nf_settle(uuid,bigint,integer,text)') is not null then
    raise exception 'VERIFY: §2 LEAKED a probe row or function'; end if;
  -- (d) THE SPLICE ONCE, THE BODY §0's POST PIN (so a second apply passes §0 and moves no body).
  if (select (length(prosrc) - length(replace(prosrc, 'NO-FIGHT', ''))) / length('NO-FIGHT')
        from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure) <> 1 then
    raise exception 'VERIFY(d): hr_hunt_settle_session carries the NO-FIGHT splice other than once'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure)
     is distinct from 'fa12a0583b3fa3105efd3c319b5d8c59' then
    raise exception 'VERIFY(d): hr_hunt_settle_session landed as md5 %, not §0''s post pin',
      (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure); end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'no-fight-settle: a no_fight end is proven by hunted minutes and a window with no kill; refused otherwise';
end $$;
