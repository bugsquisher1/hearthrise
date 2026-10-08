-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-world-tick-catchup.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. Applies AFTER
-- 2026-10-11-world-tick-shards.sql (§0 pins its driver).
-- EDGE HALF: tick.js reads `catchup_windows` (S3) and `fold_windows` (S4)
-- off the body. Both dials ship at 1, which is today's behaviour on every
-- path: one window per visit, one settle per window, the old pack's intents
-- byte for byte. An older edge ignores both keys.
--
-- WORLD-TICK SCALE, STAGES S3/S4 — THE DIALS.
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "Scale" (S3, S4).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   S3: a visit settles ONE flush window. A character behind by more than the
--   revisit interval falls further behind every visit (5,000 owned: -160 s per
--   visit, the 12 h cap in ~19 h, then mass fenced_cap), and after any tick
--   downtime T the catch-up is N.T/90 s windows at one per visit. catchup
--   lets one visit settle up to K consecutive windows, each computed and
--   fenced exactly as the next K fires would compute and fence them.
--   S4: every settle is one hr_apply and one player_ledger row: at 90 s that is
--   960 rows per character per day. fold lets one settle carry up to F
--   consecutive windows (one row), and 2026-10-11-world-tick-ledger-fold.sql
--   holds an AWAY character back until F windows are due.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_config.catchup_windows int NOT NULL DEFAULT 1, CHECK 1..40
--    hr_tick_config.fold_windows    int NOT NULL DEFAULT 1, CHECK 1..8
--    CHECK fold_windows <= catchup_windows (a fold larger than the visit
--    budget would hold a character for F windows and then settle fewer).
--    fold <= 8 is load-bearing, not taste: hr_tick_stall_status' per-character
--    lag judge calls a character STUCK past 15 min of lag with no tick
--    payment in 15 min, and an away character waits F x 90 s + one cadence
--    between payments (8: 12 min 10 s). A larger fold needs the judge's c_lag
--    derived from the dial first (named follow-up).
-- §2 hr_tick_cron_run restated from 2026-10-11-world-tick-shards.sql (md5
--    02be9d7b) with ONE delta: every body carries `catchup_windows` and
--    `fold_windows` beside cadence_ms/flush_ms.
-- §3 grants unchanged (owner only), restated.
-- §4 self-check, executed.
--
-- ── MONEY BOUNDS: UNCHANGED, AND WHY ───────────────────────────────────────
--   Neither dial reaches the fence. Every settle a catch-up or a fold makes is
--   an ordinary hr_tick_settle call: lease, watermark CAS (p_window_from >= the
--   locked mark), version CAS, the 24 h fence (8b) and the offline-cap fence
--   (8c: locked accrued_to >= greatest(now(), window_to) - cap) are evaluated
--   under the player lock for EACH settle, unchanged. A folded settle's 8c
--   check is the check of its FIRST window, the strictest of the K. Catch-up is
--   armed-only at the edge; shadow windows keep one per visit (the parity
--   probes and their counts are untouched). tests/world-tick-scale.mjs C1/C2
--   prove the pay byte-identical to K single fires.
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   Two integers on the operator-only config row, posted inside the MAC'd
--   body. No grant, client surface or fence change. Raising either dial is a
--   Security-gated UPDATE (S3/S4 GO), not a migration.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Operational: `update hr_tick_config set fold_windows = 1, catchup_windows = 1`
--   (in that order: the CHECK). Full undo: re-apply the hr_tick_cron_run
--   statement of 2026-10-11-world-tick-shards.sql §4, then drop the columns.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ────────────────────────────────────────────────────────
do $$
declare
  v_cron text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_cron from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_cron_run()');
  if v_cron is null or v_cron not in ('02be9d7b7e9a6c8f45ef37cea7f03e80', 'aa35ea7090c298e145d8b55e90a39645') then
    raise exception 'PRECONDITION: hr_tick_cron_run prosrc md5 is %, expected 2026-10-11-world-tick-shards.sql''s '
                    '02be9d7b7e9a6c8f45ef37cea7f03e80 or this file''s aa35ea7090c298e145d8b55e90a39645. Apply the shards file first.', v_cron;
  end if;
  if to_regclass('public.hr_tick_shard_cursor') is null then
    raise exception 'PRECONDITION: hr_tick_shard_cursor is absent (2026-10-11-world-tick-shards.sql).';
  end if;
end $$;

-- ── §1 THE DIALS ────────────────────────────────────────────────────────────
alter table public.hr_tick_config add column if not exists catchup_windows int not null default 1;
alter table public.hr_tick_config add column if not exists fold_windows int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_catchup_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_catchup_ck
      check (catchup_windows between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_fold_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_fold_ck
      check (fold_windows between 1 and 8 and fold_windows <= catchup_windows);
  end if;
end $$;
comment on column public.hr_tick_config.catchup_windows is
  '2026-10-11 (world-tick scale S3). How many consecutive flush windows ONE visit may settle for an '
  'ARMED character that is behind (each fenced exactly as a separate fire would be). 1..40; 1 = one '
  'window per visit. Raising it is a Security-gated UPDATE.';
comment on column public.hr_tick_config.fold_windows is
  '2026-10-11 (world-tick scale S4). How many of those windows ONE settle (one hr_apply, one ledger row) '
  'may carry, armed gather only; with 2026-10-11-world-tick-ledger-fold.sql an AWAY character is visited '
  'once fold_windows flushes are due. 1..8 (the lag judge''s 15 min); <= catchup_windows. Security-gated.';

-- ── §2 hr_tick_cron_run (S3/S4 dials posted) ────────────────────────────────
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

  if v_n = 0 then
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
                       'cursor_wrapped', v_wrapped)
    || case when v_shards > 1
            then jsonb_build_object('shards', v_shards, 'rostered_by_shard', to_jsonb(v_counts),
                                    'holders', to_jsonb(v_holders))
            else '{}'::jsonb end
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff)
    || case when v_shards > 1 then jsonb_build_object('shards', v_shards, 'posts', v_posted)
            else '{}'::jsonb end;
end $$;

-- ── §3 GRANTS — restated (owner only) ───────────────────────────────────────
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
--   k0  the installed driver is this file's (md5); its body text names both
--       dials in the posted object
--   c1  both dials default to 1 (today's behaviour) on a fresh row
--   c2  the CHECKs refuse catchup 0 / 41, fold 0 / 9, fold > catchup; accept
--       catchup 40 + fold 8
--   kg  hr_tick_cron_run is reachable by no request or engine role; hygiene STRICT
--   kr  the config is restored and read back
do $$
declare
  v_cfg public.hr_tick_config%rowtype;
  v_ok  boolean;
  v_bad text := '';
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)
         <> 'aa35ea7090c298e145d8b55e90a39645' then
      raise exception 'k0: the installed hr_tick_cron_run body is not the one this file states';
    end if;
    if position('''catchup_windows'', v_cfg.catchup_windows' in
                (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0
       or position('''fold_windows'', v_cfg.fold_windows' in
                (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0 then
      raise exception 'k0b: the driver does not post both dials';
    end if;
    -- ── c1
    if (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'catchup_windows') <> '1'
       or (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'fold_windows') <> '1' then
      raise exception 'c1: a dial does not default to 1';
    end if;
    -- ── c2
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    begin update public.hr_tick_config set catchup_windows = 0 where id; v_bad := v_bad || ' catchup0';
    exception when check_violation then null; end;
    begin update public.hr_tick_config set catchup_windows = 41 where id; v_bad := v_bad || ' catchup41';
    exception when check_violation then null; end;
    begin update public.hr_tick_config set catchup_windows = 40, fold_windows = 9 where id; v_bad := v_bad || ' fold9';
    exception when check_violation then null; end;
    begin update public.hr_tick_config set catchup_windows = 1, fold_windows = 0 where id; v_bad := v_bad || ' fold0';
    exception when check_violation then null; end;
    begin update public.hr_tick_config set catchup_windows = 4, fold_windows = 8 where id; v_bad := v_bad || ' fold>catchup';
    exception when check_violation then null; end;
    if v_bad <> '' then raise exception 'c2: the CHECKs accepted:%', v_bad; end if;
    update public.hr_tick_config set catchup_windows = 40, fold_windows = 8 where id;
    -- ── kg
    if has_function_privilege('anon', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('service_role', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_tick_cron_run()', 'execute')
       or has_function_privilege('hr_tick', 'public.hr_tick_cron_run()', 'execute') then
      raise exception 'kg: a request or engine role holds EXECUTE on hr_tick_cron_run';
    end if;
    perform public.hr_assert_grant_hygiene(true);
    -- ── kr
    update public.hr_tick_config
       set fold_windows = 1, catchup_windows = v_cfg.catchup_windows where id;
    update public.hr_tick_config set fold_windows = v_cfg.fold_windows where id;
    select (catchup_windows, fold_windows) is not distinct from (v_cfg.catchup_windows, v_cfg.fold_windows)
      into v_ok from public.hr_tick_config where id;
    if not v_ok then raise exception 'kr: the dials were not restored'; end if;

    raise exception 'HR1011C_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1011C_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-catchup: EXECUTED — both dials default to 1 and are posted by the driver; the CHECKs '
               'hold catch-up to 1..40 and the fold to 1..8 and <= catch-up; owner-only; hygiene strict — all green';
end $$;
