-- ════════════════════════════════════════════════════════════════════════
-- 2026-11-04-hunt-tick-shards.sql — THE WORLD TICK'S HUNT SETTLES, PACKED BY LOAD
-- STAGED (lane/c-tick-shards, backend-architect, 2026-10-21). Game CLOSED:
-- applies on its passing §5 self-check (tools/apply-migration.mjs, one file);
-- Security reviews it at the reopen gate. NOT APPLIED. Applies AFTER
-- 2026-10-22-hunt-sessions-settle.sql (§0 pins its hr_tick_cron_run and
-- hr_hunt_roster bodies). No edge prerequisite: the bodies it posts are the
-- shape the deployed edge already settles (`roster: []`, `hunts: [...]`).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   Reliability, 2026-10-21 (lane/a-settle-lag 753965f5f): every due open hunt
--   was settled inside ONE edge request — hr_tick_cron_run leased them all to
--   shard 0's holder and posted them as one `hunts` body, and tick.js settles
--   a body's selectors serially. Measured ~0.6 s fixed + ~0.3 s an instance:
--   ~28 instances fit pg_net's 9 s timeout, and past that the body's tail runs
--   toward the 30 s lease, after which the next fire can claim the same
--   sessions again. The gather fan-out (2026-10-11-world-tick-shards.sql) did
--   not help: it partitions CHARACTERS by a fixed dial, and the hunts body was
--   bolted on after it under shard 0.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_config.hunt_body_max int NOT NULL DEFAULT 12, CHECK 1..50: the
--    most hunt INSTANCES one body (one edge invocation) carries. 12 = half the
--    timeout at the measured cost (0.6 + 12 x 0.3 = 4.2 s <= 4.5 s): the 2x
--    margin. A dial, so a slower engine is answered by an UPDATE.
-- §2 hr_hunt_roster_sharded(p_prefix, p_body_max, p_lease_ms) -> (user_id,
--    slot, session_id, body, ord). The due predicate is hr_hunt_roster's, byte
--    for byte (pending leave/change or kill switch: next fire; online: every
--    flush; away: every flush x fold). Then:
--      · INSTANCES, not sessions, are the unit: the most-behind
--        (min settled_to) hunt_body_max x 16 instances with a due session;
--      · the sessions of those instances are locked FOR UPDATE SKIP LOCKED
--        (re-checked open and not ahead under the lock);
--      · PACKED: instances ordered by (md5(instance_id), instance_id), body
--        = rank / hunt_body_max — every body <= hunt_body_max instances, every
--        member of one instance in ONE body, a pure function of the due set;
--      · each session leased to its body's holder `<prefix>:h<body>`
--        (prefix cut to 58 so the name fits hunt_tick_lease's 64);
--      · a session is claimable only when UNLEASED OR ITS LEASE HAS ENDED.
--        hr_hunt_roster also let its own holder re-claim a live lease; with
--        per-body holders that would hand a slow body's sessions to the next
--        fire while it may still be settling them, so it is gone.
--    Owner-only: no role is granted EXECUTE (the cron driver is its one caller).
-- §3 hr_tick_cron_run RESTATED WHOLE from 2026-10-22-hunt-sessions-settle.sql
--    §8 (md5 d05cbc3948b4ad0a2c90a3e72ae62da8), deltas only in (3c) and the log:
--      · (3c) one body per hunt body, each its own holder, MAC and POST (the
--        loop below it already derives one MAC and one POST per body);
--      · body keys unchanged but `holder` (the body's) and one new
--        `hunt_body` (operator only; the edge ignores it); `shard` stays 0;
--      · the fire log and the answer gain `hunt_bodies`.
-- §4 grants (revoke first). hr_hunt_roster keeps its body and its hr_tick
--    grant (no caller here any more; dropping it is not this file's business).
-- §5 self-check, executed and rolled back.
--
-- ── CONCURRENCY: NO HUNT SETTLED TWICE IN ONE FIRE, NONE STOLEN FROM A BODY ──
--   (a) One roster statement per fire (the cron's advisory lock serialises
--       fires) returns each session ONCE, in ONE body: the packing is a
--       partition of the locked set.
--   (b) Across fires: a session leased to any body is skipped until its lease
--       ends (30 s, three fires), so a slow body is never raced by the next
--       fire for the sessions it still holds. The edge stops STARTING settles
--       20 s into a body (tick.js HUNT_BODY_BUDGET_MS) and reports the rest
--       `deferred`, so no settle begins after its lease could have ended.
--   (c) A slow body blocks nobody: every body is its own pg_net request and its
--       own edge invocation; the others' sessions are leased to other holders.
--   (d) Underneath, unchanged: hr_hunt_apply_instance's instance lock, its
--       world_swing CAS and the derived intent keys refuse a second payment
--       whatever the lease does. The lease spares duplicate ENGINE work only.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   NOTHING HERE MOVES VALUE. Which sessions ride which POST, under which lease
--   name. Selectors stay selectors: the edge re-reads every instance, member
--   and character, and Postgres decides. The new function is reachable by no
--   role; no client surface moves.
--
-- ── COST (100 hunts; 100x players ≈ 600 hunters) ────────────────────────────
--   Postgres per fire: one roster statement (an unlocked scan of open sessions
--   + a locked re-read of the picked ones) and one sha256 + HMAC + queue row
--   per body. Rows: hunt_tick_lease stays one row per open session. Bytes per
--   body: ~100 B a selector. At 600 hunters all due in one fire: 50 bodies
--   needed, 16 a fire (192 instances), the rest the next fires — most-behind
--   first. At the steady online flush (90 s = 9 fires) ~67 due a fire: 6 bodies.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Operational: `update hr_tick_config set hunt_body_max = 50` packs bodies as
--   large as the CHECK allows. Full undo: re-apply the hr_tick_cron_run
--   statement of 2026-10-22-hunt-sessions-settle.sql §8; drop function
--   hr_hunt_roster_sharded; drop column hunt_body_max. Leases held by
--   `:h<k>` holders lapse in 30 s and hr_hunt_roster serves them after that.
--
-- ── KNOWN LIMITATIONS ───────────────────────────────────────────────────────
--   * 16 hunt bodies a fire is the ceiling (tick.js MAX_SHARDS, pg_net's batch
--     is 200): past 16 x hunt_body_max due instances a fire takes the most
--     behind and the rest wait one fire (owed, never lost).
--   * A member whose session is leased while another member's is not rides a
--     different fire; the instance settle covers both, the CAS sorts the race.
--   * Measured cost is per INSTANCE; a four-hero party costs more than a solo.
--     hunt_body_max is the dial if party share grows.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $mig$
declare
  v_cron   text;
  v_roster text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_cron from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_cron_run()');
  if v_cron is null or v_cron not in ('d05cbc3948b4ad0a2c90a3e72ae62da8', '6ccf40260328a46e755ef290e5c3d635') then
    raise exception 'PRECONDITION: hr_tick_cron_run prosrc md5 is %, expected 2026-10-22-hunt-sessions-settle.sql''s '
                    'd05cbc3948b4ad0a2c90a3e72ae62da8 or this file''s 6ccf40260328a46e755ef290e5c3d635 — restate from the installed body', v_cron;
  end if;
  -- The due predicate below is hr_hunt_roster's; a roster that moved means re-derive it.
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_hunt_roster(text,integer,integer)');
  if v_roster is distinct from '75f90c7b6263672120724417b53421f2' then
    raise exception 'PRECONDITION: hr_hunt_roster prosrc md5 is %, expected 2026-10-22''s 75f90c7b — re-derive the due predicate', v_roster;
  end if;
  if to_regclass('public.hunt_tick_lease') is null or to_regclass('public.hunt_sessions') is null
     or to_regclass('public.hr_hunt_config') is null or to_regclass('public.hr_tick_config') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hunt_tick_lease, hunt_sessions, hr_hunt_config, hr_tick_config or hr_assert_grant_hygiene is absent';
  end if;
  if (select character_maximum_length from information_schema.columns
       where table_schema = 'public' and table_name = 'hunt_tick_lease' and column_name = 'holder') is not null
     or position('64' in (select pg_get_constraintdef(c.oid) from pg_constraint c
                            where c.conrelid = 'public.hunt_tick_lease'::regclass and c.contype = 'c'
                              and pg_get_constraintdef(c.oid) like '%holder%' limit 1)) = 0 then
    raise exception 'PRECONDITION: hunt_tick_lease.holder is no longer text CHECK <= 64 chars';
  end if;
end $mig$;

-- ── §1 THE DIAL ─────────────────────────────────────────────────────────────
alter table public.hr_tick_config add column if not exists hunt_body_max int not null default 12;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_hunt_body_max_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_hunt_body_max_ck check (hunt_body_max between 1 and 50);
  end if;
end $mig$;
comment on column public.hr_tick_config.hunt_body_max is
  '2026-11-04 (hunt tick shards). The most hunt INSTANCES one world-tick body (one edge invocation) '
  'carries. 12 = half pg_net''s 9 s timeout at ~0.6 s + ~0.3 s an instance (measured 2026-10-21). 1..50.';

-- ── §2 hr_hunt_roster_sharded — the due open sessions, PACKED into bodies ───
create or replace function public.hr_hunt_roster_sharded(p_prefix text, p_body_max int, p_lease_ms int default 30000)
returns table (user_id uuid, slot int, session_id uuid, body int, ord int)
language plpgsql security definer set search_path = public, pg_catalog as $$
#variable_conflict use_column
declare
  -- THE FAN-OUT CEILING: hunt bodies a fire (tick.js MAX_SHARDS; pg_net batch 200).
  c_bodies  constant int := 16;
  v_role    text;
  v_per     int;
  v_lease   interval;
  v_prefix  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_hunt_roster_sharded: not callable by %', v_role using errcode = '42501';
  end if;
  v_per    := least(greatest(coalesce(p_body_max, 12), 1), 50);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  -- 58 + ':h' + two digits <= 62: a body's holder always fits, never truncates into another's.
  v_prefix := left(coalesce(nullif(p_prefix, ''), 'unnamed'), 58);
  select make_interval(secs => c.flush_seconds), c.fold_windows into v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due0 as (
    -- hr_hunt_roster's due predicate, byte for byte, except the lease: a live
    -- lease is never re-claimed (§0 of the header, concurrency (b)).
    select h.id, h.instance_id as inst, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now())
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 case when coalesce(ps.last_seen_at >  now() - interval '75 seconds'
                                and ps.last_seen_at <= now() + interval '60 seconds', false)
                      then 1 else v_fold end))
  ), pick as (
    -- THE INSTANCES THIS FIRE TAKES: the most behind first, as many as 16 bodies hold.
    select d.inst
      from due0 d
     group by d.inst
     order by min(d.settled_to), d.inst
     limit v_per * c_bodies
  ), due as (
    -- Locked; re-checked open and not ahead under the lock (READ COMMITTED
    -- re-evaluates these on a row another transaction moved).
    select h.id, h.instance_id as inst, h.user_id as uid, h.slot as sl
      from public.hunt_sessions h
     where h.id in (select d.id from due0 d join pick p on p.inst = d.inst)
       and h.ended_at is null
       and h.settled_to <= now()
     for update skip locked
  ), packed as (
    -- THE PACKING: a pure function of the due set. Every member of an instance
    -- shares the instance's rank, so its body.
    select d.id, d.inst, d.uid, d.sl,
           ((dense_rank() over (order by md5(d.inst::text), d.inst)) - 1)::int / v_per as b
      from due d
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until)
    select p.id, v_prefix || ':h' || p.b, now() + v_lease from packed p
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
    returning t.session_id
  )
  select p.uid, p.sl, p.id, p.b,
         (row_number() over (order by p.b, md5(p.inst::text), p.inst, p.id))::int
    from packed p join leased x on x.session_id = p.id
   order by 5;
end $$;

-- ── §3 hr_tick_cron_run — RESTATED WHOLE (see the header) ───────────────────
create or replace function public.hr_tick_cron_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  -- THE FAN-OUT (2026-10-11, world-tick scale S2). One POST per SHARD per
  -- fire, each to its own edge invocation, each under its own lease holder.
  -- Shard 0's holder is byte-identical to the single-POST driver's, so at
  -- shards = 1 every byte this function stamps, posts and logs is unchanged
  -- except the roster rows' dead `state` key (S1 made it NULL) and the
  -- cursor's home (hr_tick_shard_cursor).
  v_shards   int;
  k          int;
  v_holders  text[]  := '{}';
  v_bodies   text[]  := '{}';
  v_counts   int[]   := '{}';
  v_auths    text[]  := '{}';
  v_holder   text;
  v_batch    jsonb;
  v_nk       int;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_cur      public.hr_tick_shard_cursor%rowtype;
  v_wrapped  boolean := true;
  v_gateway  text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := true;
  v_eff      int := 0;
  -- THE ADMISSION COUNTER (2026-10-06, ruling 1: shadow-chain admission ends
  -- LOUDLY). Owned, on-channel, unpartied characters the roster's admission
  -- predicate dropped, by reason. NULL when nobody was dropped, so a healthy
  -- fire's log row does not grow.
  v_adm      jsonb;
  v_out      text;
  v_ms       int;
  v_posted   int := 0;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql), PACKED BY LOAD
  -- (2026-11-04-hunt-tick-shards.sql): the due OPEN sessions, at most
  -- hr_tick_config.hunt_body_max INSTANCES per body, each body leased under its
  -- own holder and posted as its own edge invocation.
  v_hb       record;
  v_hprefix  text;
  v_nh       int := 0;
  v_nhb      int := 0;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue. ONE
  --        lock for every shard: the shards are one fire.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    perform public.hr_tick_cron_note('disabled', 0);
    return jsonb_build_object('ok', true, 'outcome', 'disabled');
  end if;
  if v_cfg.edge_url is null or v_cfg.edge_url = '' then
    perform public.hr_tick_cron_note('no_edge_url', 0);
    return jsonb_build_object('ok', false, 'outcome', 'no_edge_url');
  end if;
  -- The CHECK holds shards to 1..16; a NULL (impossible: NOT NULL) reads as 1.
  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
  --         fire, over the whole owned cohort (every shard).
  select case when count(*) = 0 then null
              else jsonb_object_agg(x.why, x.n) end
    into v_adm
    from (select ad.why, count(*)::int as n
            from public.hr_tick_ownership o
            join public.player_state ps
              on ps.user_id = o.user_id and ps.slot = o.slot
           cross join lateral (
             select coalesce(o.channel = any (v_cfg.armed_channels), false) as armed) a
           cross join lateral (
             select public.hr_tick_admit(a.armed, ps.accrued_to,
                      case when not a.armed
                           then greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))
                           else ps.accrued_to end) as why) ad
           where o.owned
             and o.channel = ps.active_kind
             and ps.active_kind = any (v_cfg.channels)
             and not public.hr_partied(o.user_id, o.slot)
             and ad.why <> 'admit'
           group by ad.why) x;

  -- ── (3) THE BATCHES, ONE PER SHARD. `hr_shard_of` (a stable hash of user_id
  --        mod shards) partitions the owned cohort, so the shards' rosters are
  --        DISJOINT by construction; the per-shard holder makes a character
  --        leased by one shard unclaimable by another until that lease ends
  --        (the roster's lease predicate), which is what keeps a change of
  --        `shards` from ever handing one character to two invocations.
  --        `r.accrued_to` is the EFFECTIVE watermark (Security M-1).
  for k in 0 .. v_shards - 1 loop
    -- THE HOLDER. Shard 0: the single-POST driver's expression, unchanged.
    -- Shard k > 0: the same prefix cut to 58 so ':s<k>' always fits in 64 and
    -- can never be truncated into shard 0's name. tick.js TICK_HOLDER_SQL is
    -- the same expression; tests/world-tick-scale.mjs H1 drives both.
    v_holder := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
    select * into v_cur from public.hr_tick_shard_cursor where shard = k;
    if not found then
      v_cur.cursor_at := null; v_cur.cursor_user := null; v_cur.cursor_slot := null;
    end if;
    select jsonb_agg(jsonb_build_object(
             'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
             'active_kind', r.active_kind, 'active_id', r.active_id,
             'active_since', r.active_since, 'accrued_to', r.accrued_to,
             'shadow_accrued_to', r.shadow_accrued_to,
             'version', r.version, 'seed', r.seed)
             order by r.accrued_to, r.user_id, r.slot),
           count(*),
           max(r.accrued_to)
      into v_batch, v_nk, v_last_a
      from public.hr_tick_roster(v_cfg.channels, k, v_cfg.batch_limit, v_holder,
                                 v_cfg.lease_ms, v_cur.cursor_at, v_cur.cursor_user,
                                 v_cur.cursor_slot) r;
    v_nk := coalesce(v_nk, 0);

    if v_nk < v_cfg.batch_limit then
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, null, null, null, now())
      on conflict (shard) do update set cursor_at = null, cursor_user = null,
             cursor_slot = null, updated_at = now();
    else
      v_wrapped := false;
      select (e->>'user_id')::uuid, (e->>'slot')::int
        into v_last_u, v_last_s
        from jsonb_array_elements(v_batch) e
       order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
       limit 1;
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, v_last_a, v_last_u, v_last_s, now())
      on conflict (shard) do update set cursor_at = excluded.cursor_at, cursor_user = excluded.cursor_user,
             cursor_slot = excluded.cursor_slot, updated_at = now();
    end if;

    if v_nk > 0 then
      v_n := v_n + v_nk;
      v_eff := greatest(v_eff,
        v_cfg.cadence_seconds * greatest(1, ceil(v_nk::numeric / greatest(1, v_cfg.batch_limit))::int));
      v_holders := v_holders || v_holder;
      v_counts  := v_counts || v_nk;
      -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
      --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
      --         those bytes verbatim, so hashing this exact text and posting
      --         `v_body_txt::jsonb` hashes what leaves. `shard` is the one new
      --         key: the edge derives its holder from it (a SELECTOR, bound by
      --         the MAC like every byte here; the fence still refuses any
      --         character whose lease is not that holder's).
      v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   'shard', k,
                                   -- per channel since 2026-10-06; the
                                   -- edge IGNORES this key (tick.js reads
                                   -- the mode off the fence), it is here
                                   -- for the operator reading the queue.
                                   'armed', to_jsonb(v_cfg.armed_channels),
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   -- CATCH-UP AND FOLD (2026-10-11, S3/S4):
                                   -- how many flush windows one visit may
                                   -- settle, and how many of them one settle
                                   -- (one ledger row) may carry. GEOMETRY
                                   -- like cadence/flush: clamped again by the
                                   -- edge; the fence decides every payment.
                                   'catchup_windows', v_cfg.catchup_windows,
                                   'fold_windows', v_cfg.fold_windows,
                                   'roster', v_batch)::text);
    end if;
  end loop;

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now() where id;

  -- ── (3c) THE HUNTS, PACKED BY LOAD (2026-11-04-hunt-tick-shards.sql; was ONE
  --         body under shard 0's holder, 2026-10-22 lane C2). The due open hunt
  --         sessions (hr_hunt_roster_sharded: a pending leave/change or the kill
  --         switch at the next fire, an online character every flush, an away
  --         one every flush x fold) come back PACKED: at most hunt_body_max
  --         INSTANCES a body, every member of an instance in the same body, the
  --         instances ordered by md5(instance id) — a deterministic function of
  --         the fire's due set — and each body's sessions leased to its own
  --         holder `<prefix>:h<k>`. Each body rides its OWN POST (an empty
  --         roster and a `hunts` array), so every gather body above is
  --         byte-identical and N hunt bodies are N concurrent edge invocations:
  --         a fire's wall time is its slowest body's, not the sum. SELECTORS
  --         only: the edge re-reads every session and the character itself, and
  --         hr_hunt_apply_instance decides whether anything may land. `shard`
  --         stays 0 (the edge derives only its gather holder from it, and a hunt
  --         body has no gather roster); `hunt_body` is for the operator.
  v_hprefix := left('cron:' || coalesce(current_database(), 'db'), 58);
  for v_hb in
    select r.body,
           jsonb_agg(jsonb_build_object('user_id', r.user_id, 'slot', r.slot, 'session_id', r.session_id)
                     order by r.ord) as sel,
           count(*)::int as n
      from public.hr_hunt_roster_sharded(v_hprefix, v_cfg.hunt_body_max, v_cfg.lease_ms) r
     group by r.body
     order by r.body
  loop
    v_nh  := v_nh + v_hb.n;
    v_nhb := v_nhb + 1;
    v_holders := v_holders || (v_hprefix || ':h' || v_hb.body);
    v_counts  := v_counts || v_hb.n;
    v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_hprefix || ':h' || v_hb.body,
                                 'shard', 0,
                                 'hunt_body', v_hb.body,
                                 'armed', to_jsonb(v_cfg.armed_channels),
                                 'cadence_ms', v_cfg.cadence_seconds * 1000,
                                 'flush_ms', v_cfg.flush_seconds * 1000,
                                 'catchup_windows', 1,
                                 'fold_windows', 1,
                                 'roster', '[]'::jsonb,
                                 'hunts', v_hb.sel)::text);
  end loop;

  if v_n = 0 and v_nh = 0 then
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0, null,
     case when v_adm is null then null else jsonb_build_object('admission', v_adm) end);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  -- ── (4) THE GATEWAY KEY. STILL A VARIABLE, AND THAT IS CORRECT: it is the
  --        project ANON key, public by design (src/net/supabase-bootstrap.js),
  --        read from Vault only so a project move is a Vault write rather than
  --        a migration. `supabase/config.toml` pins `verify_jwt = true` on
  --        hr-accrue and it STAYS ON (tests/edge-jwt-gate.mjs --strict), so the
  --        Supabase gateway refuses the request before the function runs unless
  --        `Authorization` carries a JWT it accepts. IT IS NOT THE TICK'S
  --        AUTHORISATION and must never be mistaken for it.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew. One bucket per fire.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;

  -- ── (4b) THE DERIVATION, PER BODY. pgcrypto absent is `no_hmac` and NOTHING
  --         IS POSTED for any shard: there is no static fallback, by
  --         construction — this function has no code path that can put a
  --         long-lived secret on the wire. Every MAC is derived before any POST,
  --         so a fire either posts every shard's body or none.
  for k in 1 .. cardinality(v_bodies) loop
    v_body_sha := public.hr_tick_body_sha256(v_bodies[k]);
    if v_body_sha is null then
      perform public.hr_tick_cron_note('no_hmac',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
      return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
    end if;
    v_auth := public.hr_tick_auth_header(v_bucket, v_body_sha);
    v_have_tok := v_have_tok and v_auth is not null;
    v_auths := v_auths || v_auth;
  end loop;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of 2026-09-22-world-tick-derived-token.sql carries both names
     --   for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POSTS. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay. pg_net sends the queued requests CONCURRENTLY after this
  --        transaction commits: N shards are N parallel edge invocations.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  v_out := 'posted';
  for k in 1 .. cardinality(v_bodies) loop
    begin
      execute 'select net.http_post($1, $2, $3, $4, $5)'
        using v_cfg.edge_url,
              v_bodies[k]::jsonb,
              '{}'::jsonb,
              jsonb_build_object('Content-Type', 'application/json',
                                 -- the GATEWAY's gate...
                                 'Authorization', 'Bearer ' || v_gateway,
                                 -- ...and the tick's own, DERIVED PER BODY. The
                                 -- Vault secret is not here and never was: this
                                 -- value is a mac over (bucket, body hash).
                                 'X-HR-Tick-Auth', v_auths[k]),
              greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
      v_posted := v_posted + 1;
    exception when others then
      -- Nothing derived from a secret reaches the log even in an error path.
      -- The shards already queued stay queued (their sub-transactions
      -- committed); the fire is logged `error` with how many went out.
      perform public.hr_tick_cron_note('error',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('sqlstate', sqlstate, 'posted_shards', v_posted));
      return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
    end;
  end loop;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  --   `shards` / `rostered_by_shard` appear only when the fire fanned out, so a
  --   one-shard fire's log row is the single-POST driver's, key for key.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('armed', to_jsonb(v_cfg.armed_channels), 'holder', v_holders[1],
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_wrapped, 'hunts', v_nh, 'hunt_bodies', v_nhb)
    || case when v_shards > 1
            then jsonb_build_object('shards', v_shards, 'rostered_by_shard', to_jsonb(v_counts),
                                    'holders', to_jsonb(v_holders))
            else '{}'::jsonb end
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff, 'hunts', v_nh, 'hunt_bodies', v_nhb)
    || case when v_shards > 1 then jsonb_build_object('shards', v_shards, 'posts', v_posted)
            else '{}'::jsonb end;
end $$;

-- ── §4 GRANTS — revoke from PUBLIC first; NO role is granted anything new ────
revoke execute on function public.hr_hunt_roster_sharded(text, int, int) from public;
revoke execute on function public.hr_hunt_roster_sharded(text, int, int) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §5 SELF-CHECK — EXECUTED AND ROLLED BACK (CLAUDE.md §4) ─────────────────
--   k0  the installed bodies are this file's (md5); the dial exists, defaults
--       to 12 and its CHECK refuses 0 and 51
--   p1  ★ THE PACKING at hunt_body_max = 4 over 29 due solo instances and one
--       due two-hero party: 8 bodies; no body over 4 instances; every due
--       session exactly once; both party members in ONE body; every session
--       leased to its body's holder; the body is the instance's md5 rank / 4
--   p2  ★ NO SECOND CLAIM: the same call again (any prefix) returns none of
--       them while their leases live; once one lease ends, that one returns
--   p3  ★ DETERMINISTIC: the same due set packs identically (the first call's
--       assignment, re-derived after the sub-block rolled back)
--   p4  the ceiling: at hunt_body_max = 1, 16 bodies of the 16 most-behind
--       instances; the rest stay unleased (owed)
--   p5  not due: an online character settled 30 s ago, an ended session and a
--       session ahead of now are not rostered
--   kg  no role executes hr_hunt_roster_sharded / hr_tick_cron_run; hygiene STRICT
--   kr  the config is restored
-- The cron driver itself is NOT fired here: on production it would POST.
-- tests/hunt-tick-shards.mjs fires it against the pg_net stub and drives every
-- body through the shipped edge (and measures the load).
do $mig$
declare
  v_cfg    public.hr_tick_config%rowtype;
  v_hcfg   boolean;
  v_pfx    text := 'selfcheck:hts';
  v_users  uuid[] := '{}';
  v_u      uuid;
  v_party  uuid := '00000000-0000-4000-8000-00000011a7f0';
  v_n      int;
  v_bad    int;
  v_a      jsonb;
  v_b      jsonb;
  i        int;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)
         <> '6ccf40260328a46e755ef290e5c3d635'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
            where p.oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure) <> 'd2b0187e856e25e21d51acf677964382' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if (select column_default from information_schema.columns where table_schema = 'public'
          and table_name = 'hr_tick_config' and column_name = 'hunt_body_max') is distinct from '12' then
      raise exception 'k0: hunt_body_max does not default to 12';
    end if;
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    begin
      update public.hr_tick_config set hunt_body_max = 0 where id;
      raise exception 'k0: hunt_body_max = 0 was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set hunt_body_max = 51 where id;
      raise exception 'k0: hunt_body_max = 51 was accepted';
    exception when check_violation then null;
    end;

    -- ── fixture: 31 characters away (last seen long ago); 29 solo hunts and one
    --    two-hero party instance, all settled 20 minutes ago: every one is due.
    select c.enabled into v_hcfg from public.hr_hunt_config c where c.id;
    update public.hr_hunt_config set enabled = true where id;
    update public.hr_tick_config set flush_seconds = 90, fold_windows = 1, hunt_body_max = 4 where id;
    -- No other open session may be due during the check (a live database has hunters):
    -- lease every one of them to a name the check never uses, inside this rolled-back block.
    insert into public.hunt_tick_lease (session_id, holder, lease_until)
    select h.id, 'selfcheck:other', now() + interval '1 hour' from public.hunt_sessions h where h.ended_at is null
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until;
    for i in 1 .. 31 loop
      v_users := v_users || ('00000000-0000-4000-8000-00000011a7' || lpad(to_hex(i), 2, '0'))::uuid;
    end loop;
    insert into auth.users (id) select unnest(v_users) on conflict do nothing;
    insert into public.player_state (user_id, slot) select u, 0 from unnest(v_users) u on conflict do nothing;
    update public.player_state set last_seen_at = now() - interval '1 day' where user_id = any (v_users) and slot = 0;
    insert into public.hunt_instances (id, hunt_id, kind) values (v_party, 'mill_cellar', 'party');
    for i in 1 .. 31 loop
      insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (v_users[i], 0, 'mill_cellar', now() - interval '30 minutes', now() - interval '25 minutes',
              now() - interval '20 minutes' + make_interval(secs => i), now() - interval '20 minutes',
              case when i >= 30 then v_party end);
    end loop;

    -- ── p1 + p2, rolled back to the fixture (variables survive a sub-block, rows do not)
    begin
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'u', r.user_id, 'b', r.body, 'o', r.ord) order by r.ord)
        into v_a from public.hr_hunt_roster_sharded(v_pfx, 4, 30000) r;
      if jsonb_array_length(coalesce(v_a, '[]')) <> 31 then
        raise exception 'p1: % sessions rostered, expected the 31 due', jsonb_array_length(coalesce(v_a, '[]'));
      end if;
      if (select count(distinct e->>'s') from jsonb_array_elements(v_a) e) <> 31 then
        raise exception 'p1: a session was rostered twice in one call';
      end if;
      if (select count(distinct (e->>'b')::int) from jsonb_array_elements(v_a) e) <> 8
         or exists (select 1 from jsonb_array_elements(v_a) e
                     join public.hunt_sessions h on h.id = (e->>'s')::uuid
                    group by (e->>'b')::int having count(distinct h.instance_id) > 4) then
        raise exception 'p1: 30 instances at 4 a body did not pack into 8 bodies of <= 4';
      end if;
      if (select count(distinct (e->>'b')::int) from jsonb_array_elements(v_a) e
            join public.hunt_sessions h on h.id = (e->>'s')::uuid where h.instance_id = v_party) <> 1 then
        raise exception 'p1: the party''s two members rode different bodies';
      end if;
      select count(*) into v_bad
        from jsonb_array_elements(v_a) e
        join public.hunt_tick_lease l on l.session_id = (e->>'s')::uuid
       where l.holder <> v_pfx || ':h' || (e->>'b')
          or l.lease_until <= now();
      if v_bad <> 0 then raise exception 'p1: % session(s) not leased to their body''s holder', v_bad; end if;
      select count(*) into v_bad
        from jsonb_array_elements(v_a) e
        join public.hunt_sessions h on h.id = (e->>'s')::uuid
        join (select x.inst, ((dense_rank() over (order by md5(x.inst::text), x.inst)) - 1) / 4 as b
                from (select distinct h2.instance_id as inst from public.hunt_sessions h2
                       where h2.user_id = any (v_users) and h2.ended_at is null) x) r on r.inst = h.instance_id
       where r.b <> (e->>'b')::int;
      if v_bad <> 0 then raise exception 'p1: % session(s) not in their instance''s md5-rank body', v_bad; end if;

      -- ── p2
      select count(*) into v_n from public.hr_hunt_roster_sharded(v_pfx, 4, 30000) r where r.user_id = any (v_users);
      if v_n <> 0 then raise exception 'p2: % leased session(s) were rostered again', v_n; end if;
      select count(*) into v_n from public.hr_hunt_roster_sharded('selfcheck:other-fire', 4, 30000) r where r.user_id = any (v_users);
      if v_n <> 0 then raise exception 'p2: % leased session(s) were handed to another prefix', v_n; end if;
      update public.hunt_tick_lease set lease_until = now() - interval '1 second'
       where session_id = (select h.id from public.hunt_sessions h where h.user_id = v_users[1] and h.ended_at is null);
      select count(*) into v_n from public.hr_hunt_roster_sharded(v_pfx, 4, 30000) r where r.user_id = any (v_users);
      if v_n <> 1 then raise exception 'p2: an ended lease was not re-offered once (%)', v_n; end if;

      raise exception 'HTS_SUB_OK';
    exception when others then
      if sqlerrm <> 'HTS_SUB_OK' then raise; end if;
    end;

    -- ── p3
    begin
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'u', r.user_id, 'b', r.body, 'o', r.ord) order by r.ord)
        into v_b from public.hr_hunt_roster_sharded('selfcheck:hts2', 4, 30000) r;
      if v_a is distinct from v_b then raise exception 'p3: the same due set packed differently'; end if;

      raise exception 'HTS_SUB_OK';
    exception when others then
      if sqlerrm <> 'HTS_SUB_OK' then raise; end if;
    end;

    -- ── p4
    begin
      select jsonb_agg(jsonb_build_object('s', r.session_id, 'b', r.body)) into v_a
        from public.hr_hunt_roster_sharded(v_pfx, 1, 30000) r;
      if (select count(distinct (e->>'b')::int) from jsonb_array_elements(coalesce(v_a, '[]')) e) <> 16
         or (select max((e->>'b')::int) from jsonb_array_elements(coalesce(v_a, '[]')) e) <> 15 then
        raise exception 'p4: one instance a body did not stop at the 16-body ceiling';
      end if;
      if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                  where h.user_id = any (v_users[17:31])) then
        raise exception 'p4: the ceiling took a less-behind instance before a more-behind one';
      end if;
      if exists (select 1 from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
                  where h.user_id = any (v_users[17:31])) then
        raise exception 'p4: an instance past the ceiling was leased';
      end if;

      raise exception 'HTS_SUB_OK';
    exception when others then
      if sqlerrm <> 'HTS_SUB_OK' then raise; end if;
    end;

    -- ── p5
    begin
      update public.player_state set last_seen_at = now() where user_id = v_users[1] and slot = 0;
      update public.hunt_sessions set settled_to = now() - interval '30 seconds', next_swing_at = now() - interval '30 seconds'
       where user_id = v_users[1] and ended_at is null;
      update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = v_users[2] and ended_at is null;
      update public.hunt_sessions set settled_to = now() + interval '5 seconds', next_swing_at = now() + interval '5 seconds'
       where user_id = v_users[3] and ended_at is null;
      select count(*) into v_n from public.hr_hunt_roster_sharded(v_pfx, 4, 30000) r where r.user_id = any (v_users[1:3]);
      if v_n <> 0 then raise exception 'p5: % not-due session(s) were rostered', v_n; end if;
      raise exception 'HTS_SUB_OK';
    exception when others then
      if sqlerrm <> 'HTS_SUB_OK' then raise; end if;
    end;

    -- ── kg
    if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                where has_function_privilege(r.role, 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
                   or has_function_privilege(r.role, 'public.hr_tick_cron_run()', 'execute')) then
      raise exception 'kg: a request or engine role holds EXECUTE on the hunt packer or the driver';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kr
    update public.hr_tick_config set flush_seconds = v_cfg.flush_seconds, fold_windows = v_cfg.fold_windows,
           hunt_body_max = v_cfg.hunt_body_max where id;
    update public.hr_hunt_config set enabled = v_hcfg where id;

    raise exception 'HR1104HTS_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1104HTS_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'hunt-tick-shards: EXECUTED — 30 due instances pack into 8 bodies of <= 4, a party in one body, '
               'each leased to its own holder; nothing is rostered twice while leased; the packing is deterministic; '
               'the 16-body ceiling takes the most behind; not-due sessions stay out; reachable by no role — all green';
end $mig$;
