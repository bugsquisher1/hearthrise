-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-17-scaled-best.sql — A SCALED RUN SETS NO PERSONAL BEST (lane/c-arm-switches, systems-engineer, 2026-11-18; found playing the
--   scaled hunts on the local world: a Level 9 hero's Mill Cellar best read 9,235 Level XP/h, then 18,521 after 15 minutes scaled to
--   Level 9, a number no unscaled Cellar run can ever beat; the Coordinator's brief the same day, "a scaled run must not set the ground's
--   unscaled personal best").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4. ON THE EA SECURITY LIST with 2027-03-21-scaled-hunts.sql (a settle body and a best a player reads).
-- ORDER: BEFORE 2027-05-18-arm-scaled-hunts.sql (the switch opens the scaled hunts to everyone only once a scaled run stays out of the
--   bests) and BEFORE 2027-05-17-scaled-loot.sql (which splices the same member body after this file, and pins this file's image), after
--   every file that moved hr_hunt_apply_member (2027-04-25-boss-daily.sql, the last) or hr_hunt_best_fold (2027-03-22-live-events.sql, the
--   last): §0 pins both as production runs them (tests/live-hash-drift.baseline.json, measured 2026-11-18).
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
--   hunt_session_tally.scaled_ms (NEW, >= 0)   the time this session's hunt played scaled (each window the commit proved scaled, its own
--                                               span). An aggregate, no new row.
--   hr_hunt_apply_member     ONE anchored splice (marker SCALED-BEST), the member's OWN write: on a window the commit proved scaled
--                            (hunt_instances.scale_level, which hr_hunt_apply_instance writes before any member lands) this session's tally
--                            gains the window's span (insert .. values .. on conflict: a tally row is made if none yet). Its chain is 0 deep
--                            since 2027-04-24-tower-climb.sql restated it. hr_hunt_apply_instance is NOT touched (its chain is 4 deep:
--                            tests/patch-chain-guard.mjs; restating it whole would read to tests/selfcheck-no-global-dml.mjs as a new global
--                            writer behind every self-check that settles a probe).
--   hr_hunt_best_fold        ONE anchored splice (marker SCALED-BEST): a session with scaled time folds nothing.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- The mark is the member's own row (session_id = p_session), written inside hr_hunt_apply_member, which hr_hunt_apply_instance calls under
-- every member's character lock and purse lock: no new lock, no other row. A replayed settle key answers `replayed` before any member lands,
-- so a window's span is added once. The fold is a deferred constraint trigger at COMMIT, after the mark. A second apply finds both markers
-- and changes nothing; §0 refuses a body that is neither its pinned image nor this file's.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client reaches the column or the bodies' new lines. The mark comes from the server's own proved scale (hr_scaled_hunt_of under the
-- instance lock), never an edge or client number. It can only take a best away from a scaled session, never give one.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- Per settle, one primary-key read of the instance's scale_level a member; per scaled window, one upsert a member on its own tally row.
-- Per fold, one primary-key read.
--
-- REVERSIBILITY: re-apply the two pinned pre-images (bd933997 and fa7421f3, §0), then drop hunt_session_tally.scaled_ms. Bests stay as written.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hunt_session_tally') is null or to_regclass('public.player_scaled_hours') is null
     or to_regprocedure('public.hr_scaled_hunt_of(uuid)') is null then
    raise exception 'PRECONDITION: the scaled hunts (2027-03-21-scaled-hunts.sql) first'; end if;
  -- each body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-18) or already carries this file's marker
  for v_r in select * from (values
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'bd93399758d4c0de8cbfc9a5e6d03550'),
    ('public.hr_hunt_best_fold(uuid)', 'fa7421f3a9d55fff27ae53d254196540')) t(fn, pre) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and strpos(v_def, 'SCALED-BEST (2027-05-17-scaled-best.sql)') = 0 then
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
  '2027-05-17-scaled-best.sql: the time this session played scaled (each window the commit proved scaled, its span). Written only by hr_hunt_apply_member, on the member''s own row; a session with any keeps out of hunt_bests (hr_hunt_best_fold).';

-- ── §2 THE MARK: hr_hunt_apply_member (one anchored splice, the member's own row) ───────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  if strpos(v_def, 'SCALED-BEST (2027-05-17-scaled-best.sql)') > 0 then return; end if;
  v_old := $a$  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).$a$;
  v_new := $a$  -- SCALED-BEST (2027-05-17-scaled-best.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  --   hr_hunt_apply_instance before any member lands) keeps its span on THIS session's tally, so its personal best is never folded
  --   (hr_hunt_best_fold): a scaled run is not the ground's own.
  if exists (select 1 from public.hunt_instances i where i.id = p_instance and i.scale_level is not null) then
    insert into public.hunt_session_tally as t (session_id, user_id, slot, scaled_ms) values (p_session, p_user, p_slot, greatest(v_win, 1))
      on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;
  end if;
$a$ || v_old;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'hr_hunt_apply_member: the unit write anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $mig$;

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
  if strpos(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure),
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
