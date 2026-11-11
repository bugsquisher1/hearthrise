-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-08-progress-hot.sql — EVERY PROGRESS UPSERT A HUNT COMMIT MAKES BECOMES A HOT UPDATE (lane/r-commit-cost,
--   reliability-engineer, 2026-11-11). Evidence: .claude/coordination/commit-cost-2026-11-11.md (tools/commit-cost.mjs).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (the apply tool, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §2. NOT a money surface (no value, no body, no grant moves). EDGE: none. CLIENT: none.
-- ORDER: anywhere after 2026-08-11-player-state.sql (the index's home); independent of every staged file.
--
-- THE FINDING. player_progress_period_idx (2026-08-11-player-state.sql RL3/RL4) indexes `updated_at`, and every progress
--   write sets `updated_at = now()`. PostgreSQL may keep an update HOT (same page, no index entry) only when no indexed column
--   moves, and a partial index's key column counts for EVERY row, not just the rows its predicate covers. So every progress
--   update in the game is a non-HOT update: a new heap tuple plus a new player_progress_pkey entry, on every kill counter of
--   every member of every settle. Measured on the replayed chain, a party of four of one account on Coppercap Warrens at
--   Level 40, the commit (hr_hunt_apply_instance) as the shipped edge sends it from the world tick, steady state:
--     player_progress  33.3 updates a commit, 0 HOT; 40.5 upserts write 12,881 of the commit's 39,550 WAL bytes (33%),
--                      the largest writer in the commit, ahead of the ledger (7,934 bytes, which stays).
--   The index serves ONE reader: hr_progress_prune (cron hr-progress-prune, 04:25 UTC daily), which deletes periodic rows
--   older than 31 days. No other function, view or tool filters player_progress on updated_at (repo grep, 2026-11-11).
--
-- THE CHANGE. The index is dropped. The daily prune reads the table once instead (a sequential scan, once a day, off the
--   player path). Nothing else changes: no column, no row, no body, no value. The same 33 updates become HOT: no index entry,
--   and a same-page update logs only the bytes that moved.
--
-- CAPACITY (the prune without its index). Live player_progress: 2,477 rows (2026-11-10). The periodic population the index
--   was built for (RL3: 600 players x 6 dailies x 31 days) is at most 112,000 rows at 600 players, 280,000 at 1,500; a
--   once-a-day sequential scan of 280,000 rows of about 100 bytes is 28 MB, well under a second. The saving runs the other
--   way, on every commit. If a periodic system ever writes millions of rows, the right index is a BRIN on updated_at
--   (PostgreSQL 16+: a summarizing index does not block HOT), not this btree.
--
-- LOCK. DROP INDEX takes ACCESS EXCLUSIVE on player_progress until the file commits: every settle that writes progress waits
--   for it. The file is one statement and a probe of a few milliseconds, under the apply tool's 5 s lock_timeout.
-- EXPLOIT SURFACE: none. IDEMPOTENT: `if exists`; a second apply drops nothing and §2 passes again.
-- REVERSIBILITY: `create index player_progress_period_idx on public.player_progress (updated_at) where period_key <> ''`
--   (the 2026-08-11 definition, verbatim); nothing is lost either way. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE INDEX ─────────────────────────────────────────────────────────────
drop index if exists public.player_progress_period_idx;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image: (a) by catalogue, (b) the probe update is not HOT while the index stands.
--   (a) no index of player_progress names updated_at; the primary key is untouched
--   (b) an upsert of an existing progress row, the shape hr_apply writes, is a HOT update
--   (c) the prune's body is the 2026-08-11 one (its predicate reads updated_at; nothing else did) and the value landed
-- The prune itself is NOT run here: it deletes every player's expired periodic rows, which a self-check may not reach
-- (tests/selfcheck-no-global-dml.mjs). Its cost without the index is in the evidence file.
do $$
declare
  c_u  constant uuid := '000000d7-0000-4000-a000-00000000b408';
  v    jsonb;
  v_h0 bigint; v_u0 bigint; v_p0 float8;
begin
  -- (a)
  if exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
              where i.indrelid = 'public.player_progress'::regclass and a.attname = 'updated_at')
     or exists (select 1 from pg_index i where i.indrelid = 'public.player_progress'::regclass
                   and pg_get_expr(i.indpred, i.indrelid) like '%updated_at%') then
    raise exception 'progress-hot §2(a): an index of player_progress still reads updated_at'; end if;
  if not exists (select 1 from pg_index i where i.indrelid = 'public.player_progress'::regclass and i.indisprimary) then
    raise exception 'progress-hot §2(a): player_progress lost its primary key'; end if;

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'progress-hot §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'progress-hot §2-harness: hr_create_character refused: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state, updated_at)
    values (c_u, 0, 'stat', 'ev:kill_any', '', 1, 'active', now() - interval '1 minute');
    -- (b) the upsert hr_apply's progress block makes (2026-10-27-core-bodies.sql), on the row just written. A version that
    --     stays on its page and is still not HOT can only have been blocked by an index; one that had to move pages (a full
    --     page) is never HOT, so that case proves nothing either way and (a) stands alone.
    v_h0 := pg_stat_get_xact_tuples_hot_updated('public.player_progress'::regclass);
    v_u0 := pg_stat_get_xact_tuples_updated('public.player_progress'::regclass);
    v_p0 := (select (ctid::text::point)[0] from public.player_progress where user_id = c_u and key = 'ev:kill_any');
    insert into public.player_progress as pp (user_id, slot, kind, key, period_key, value, state, updated_at)
    values (c_u, 0, 'stat', 'ev:kill_any', '', 5, 'active', now())
    on conflict (user_id, slot, kind, key, period_key) do update set value = pp.value + excluded.value, updated_at = now();
    if pg_stat_get_xact_tuples_updated('public.player_progress'::regclass) - v_u0 <> 1 then
      raise exception 'progress-hot §2-harness: the probe upsert updated % rows', pg_stat_get_xact_tuples_updated('public.player_progress'::regclass) - v_u0; end if;
    if pg_stat_get_xact_tuples_hot_updated('public.player_progress'::regclass) - v_h0 <> 1
       and (select (ctid::text::point)[0] from public.player_progress where user_id = c_u and key = 'ev:kill_any') = v_p0 then
      raise exception 'progress-hot §2(b): a progress upsert that stayed on its page is still not a HOT update'; end if;
    -- (c)
    if (select value from public.player_progress where user_id = c_u and key = 'ev:kill_any') <> 6 then
      raise exception 'progress-hot §2(c): the upsert did not add up'; end if;
    if position('updated_at < now() - greatest(interval ''7 days'', coalesce(p_older, interval ''31 days''))'
                in replace(pg_get_functiondef('public.hr_progress_prune(interval)'::regprocedure), chr(13), '')) = 0 then
      raise exception 'progress-hot §2(c): hr_progress_prune is not the body this file measured'; end if;
    raise exception 'progress-hot §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'progress-hot §2: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.player_progress where user_id = c_u) then
    raise exception 'progress-hot §2: LEAKED a probe row'; end if;
  raise notice 'progress-hot: no index of player_progress reads updated_at, a progress upsert is HOT, the prune is the one measured; all green';
end $$;
