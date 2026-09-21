-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-21-world-tick-cron.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE TICK DRIVER, ON WHAT THE PROJECT ALREADY PAYS FOR. ZERO NEW SPEND.
--
-- The budget freeze of 2026-08-17 stands and no spend has been approved, so
-- milestone 1 does NOT get the always-on container LIVE_WORLD_BRIEF.md approved
-- in principle. This file is the cheapest thing that ticks:
--
--     pg_cron (in-database, free)  →  pg_net (in-database, free)
--                                  →  the hr-accrue Edge Function, op:'tick'
--                                  →  hr_tick_settle  →  hr_apply
--
-- No new host, no new process, no new bill. What it costs is stated in numbers
-- below rather than asserted.
--
-- ── WHY NOT PURE SQL ────────────────────────────────────────────────────────
-- The brief asks whether the gather channel could be settled entirely in SQL and
-- skip the edge. It could not, and the reason is a rule rather than an effort
-- estimate: a gather window's yield comes out of `accrueGather` in
-- supabase/functions/hr-accrue/accrual.js, which runs `src/core/skill-sim.js`.
-- Re-implementing that arithmetic in plpgsql would be A SECOND ENGINE — the
-- exact "second copy that drifts" CLAUDE.md §1 and AWAY-12 forbid, and the one
-- the whole world-tick design exists to avoid ("the tick is not a new engine and
-- not a new authority — it is a new CALLER of the engine the Edge Function
-- already runs", WORLD_TICK_DESIGN.md §0). So the tick calls the engine where
-- the engine lives, and pg_net is the only free way for the database to reach it.
--
-- ── EVIDENCE ON THE TWO EXTENSIONS ──────────────────────────────────────────
-- pg_cron: ALREADY IN USE. `create extension if not exists pg_cron` lives in
--   2026-08-08-leaderboards.sql, and `hr_cron_ensure` / `hr_cron_drop`
--   (2026-08-11-player-state.sql §9b) are the house helpers; six jobs are
--   scheduled today (ledger prune, intents prune, leaderboards, chat trim,
--   grant hygiene, xp prune). SUB-MINUTE SCHEDULES need pg_cron >= 1.5, which
--   accepts `'10 seconds'` in place of a five-field cron expression. §4 PROBES
--   for it and falls back to `'* * * * *'` (60 s) with a NOTICE rather than
--   failing the apply — a 60 s tick is still a tick, and the gather flush is
--   90 s anyway, so the fallback degrades fluidity and nothing else.
-- pg_net: NOT INSTALLED AS OF THIS WRITING. tools/race-test.mjs records it
--   ("`dblink` / `postgres_fdw` / `pg_net` are not installed"), and no migration
--   in this repo references `net.http_post`. It is a FREE Supabase extension
--   enabled from the dashboard or by `create extension pg_net` — no plan change
--   and no spend — but it is not this file's to enable: §2's §0 note tells the
--   Coordinator to do it, and `hr_tick_cron_run` RETURNS `pg_net_absent`
--   instead of raising, so the job is harmless until it is there.
--   IF THE PROJECT WILL NOT TAKE pg_net, the next cheapest option, in order:
--     1. A GitHub Actions schedule (free minutes on this repo) posting the same
--        `op:'tick'` request every minute. Cheapest, coarsest: GitHub's cron
--        floor is 60 s and it drifts by minutes under load.
--     2. Supabase's own Scheduled Edge Functions, if they are on this plan —
--        same cost profile as pg_cron, one fewer moving part, no pg_net.
--     3. The always-on container of LIVE_WORLD_BRIEF.md (~5–15 USD/month). It
--        is the end state regardless; this file exists so M1 does not wait for
--        a purchase approval.
--
-- ── COST MATH (the numbers this design is accountable to) ───────────────────
-- Cadence 10 s, one POST per fire, one Edge invocation per POST:
--
--   fires/day        = 86,400 / 10          =     8,640
--   invocations/mo   = 8,640 x 30.44        =   263,000   (ceiling, see below)
--   Supabase Free    = 500,000 invocations/mo →  53% used
--   Supabase Pro     = 2,000,000/mo          →   13% used
--
--   ⚠ THAT IS A CEILING, NOT A BILL. `hr_tick_cron_run` returns BEFORE the
--     POST when the kill switch is off, when the roster is empty, or when
--     another tick still holds the advisory lock. A beta with nobody online
--     costs ZERO invocations. The 263,000 figure is what a permanently busy
--     world would cost.
--   ⚠ 5 s CADENCE CROSSES THE FREE TIER: 525,000 invocations/month. Halving
--     the cadence is therefore a BILLING decision, not a config change, and
--     `hr_tick_config.cadence_seconds` is checked >= 5 so that the smallest
--     legal value is the one that needs the conversation.
--
-- Rows/day — CORRECTED 2026-09-21 (Security M-6; the 10x figure below used to
-- read "at the ceiling", which is the wrong preposition and hid the finding).
--
-- ⚠ THE CEILING IS SHARED AND IT IS A TOTAL, NOT A PER-WRITER ALLOWANCE.
--   `cron.job` runs `[7 * * * *] select public.hr_ledger_prune(20000)`:
--   20,000/hour x 24 = 480,000 rows/day for EVERY ledger writer in the game
--   combined — combat, buys, claims, market, dungeons and the tick. Anything
--   above that line makes `player_ledger` grow without bound, and that table
--   is the money journal every dispute is read from.
--
--   ONE ROW PER SETTLED FLUSH WINDOW PER CHARACTER, never one per fire: the
--   edge computes at most one flush window per character per fire and skips
--   below the flush line, so the rate is active/flush_seconds.
--
--     ARMED, 90 s flush:
--        50 active  ->  50 x   960 =    48,000 rows/day —  10% of the budget
--       500 active  -> 500 x   960 =   480,000 rows/day — 100% OF IT. OVER.
--                      leaves ZERO for every other writer in the game.
--     5,000 active  ->              = 4,800,000 rows/day —  10x over
--     ARMED, 10 s flush (the shape the CHECK and the clamps make unreachable):
--        50 active  ->  50 x 8,640 =   432,000 rows/day —  90% ⚠
--   `hr_tick_config.flush_seconds` ships at 90 for exactly this reason, and
--   `flush_seconds >= cadence_seconds` is a CHECK, not a convention.
--
-- ⚠ SHADOW — WHICH IS ALL OF MILESTONE 1 — COSTS THE LEDGER NOTHING.
--   hr_tick_settle step (8) returns BEFORE hr_apply: it writes one
--   `hr_tick_shadow` row and one watermark and touches no player table at all
--   (Security enumerated all 111 public base tables around one shadow settle).
--   player_ledger rows/day while shadowed, at every size: ZERO. The shadow
--   journal runs at the same rate into its OWN table, with its OWN 14-day
--   retention and its OWN hourly prune (`hr-tick-shadow-prune` ->
--   hr_tick_shadow_prune(20000)) — it never draws on the ledger budget. At
--   100x its prune batch needs raising; that is a config line, not a design.
--   `hr_tick_cron_log` is one row per FIRE, never per character: 8,640/day at
--   a 10 s cadence whatever the player count, 7-day retention, own prune.
--
-- ⚠ THEREFORE ARMING AT 10x OR ABOVE NEEDS RELIABILITY'S SIGN-OFF WITH THIS
--   ARITHMETIC ATTACHED, and so does any change to `flush_seconds` or
--   `batch_limit` at arming time. The pre-arm read is measured, not assumed:
--     select count(*) filter (where at > now() - interval '1 day')
--              as ledger_rows_yesterday,
--            480000 - count(*) filter (where at > now() - interval '1 day')
--              as headroom_for_the_tick
--       from public.player_ledger;
--   EXPECT headroom comfortably above 48,000 before `shadow = false`.
--
-- Database time per fire, from Reliability's measured unit costs
-- (`hr_apply` 9.35 ms, `hr_state_of` 3.23 ms, 14,240 real calls):
--
--   200 characters x (3.23 + 9.35) ms ≈ 2.5 s of DB time per fire
--   at 6 fires/min                    ≈ 25% of one core, continuous ⚠
--   Every row written is paid for twice — `wal_level = logical` with two
--   replication slots walks every WAL record (7.16 h of CPU across 4.5M
--   records today). Budget ~2 kB WAL per tick write.
--
-- AT 10x PLAYERS (500 active characters):
--   Invocations DO NOT MOVE — one POST per fire, batch_limit 200 per POST. What
--   degrades instead is the EFFECTIVE PER-CHARACTER CADENCE:
--        effective = cadence x ceil(active / batch_limit)
--        500 active → ceil(500/200) = 3 → a character ticks every 30 s.
--   That is the honest failure mode and it is a good one: the world slows
--   uniformly instead of the bill rising. Raising `batch_limit` trades it for DB
--   time per fire (500 x 12.58 ms ≈ 6.3 s/fire ≈ 63% of a core) — which is the
--   point at which the always-on container stops being optional.
--
-- AT 100x PLAYERS (5,000 active characters):
--   effective cadence = 10 s x 25 = 250 s. The design is OVER at this size and
--   says so. 5,000 x 12.58 ms = 63 s of DB time per 10 s fire — 6.3 cores of
--   Postgres, before any player intent. THIS FILE IS A BETA BRIDGE. The shard
--   containers of WORLD_TICK_DESIGN.md §9 are what carries 10k DAU, and the
--   number that says "buy the host now" is `effective_cadence_seconds` in
--   `hr_tick_cron_run`'s return value crossing 30.
--
-- ── THE SECRET: VAULT, NEVER THE REPO ───────────────────────────────────────
-- pg_net must authenticate to the Edge Function, and CLAUDE.md §2 is absolute:
-- the anon key is the only key in the repo and no secret is ever in argv. The
-- bearer is read at call time from `vault.decrypted_secrets` and is never
-- returned, never raised, never journalled. §3 states the one-time setup the
-- Coordinator performs; `hr_tick_cron_run` returns `no_secret` until it is done.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §0  Preflight. Fails closed if the fence is not there.
--   §1  `hr_tick_cron_log` — one row per fire, the operator's only window into
--       a job nobody watches. Pruned to 7 days.
--   §2  `hr_tick_cron_run()` — THE DRIVER. Advisory lock (skip if held) →
--       kill switch → roster batch (cap + keyset cursor) → one pg_net POST.
--   §3  The Vault contract, as executable documentation.
--   §4  The schedule itself, PAUSED. `hr_tick_config.enabled` is the switch;
--       the cron row exists so that arming needs no migration.
--   §5  Grants.
--   §6  Self-check, EXECUTED, PROBE ROWS ONLY, rolled back regardless.
--
-- REVERSIBLE, IN ORDER OF BLUNTNESS:
--   `update public.hr_tick_config set enabled = false;`   — stops settling
--   `select public.hr_cron_drop('hr-tick-run');`          — stops the driver
--   `drop function public.hr_tick_cron_run();`            — removes it
-- Re-applying this file is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'run 2026-09-21-world-tick-settle-fence.sql first — hr_tick_config is missing';
  end if;
  if to_regprocedure('public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)') is null then
    raise exception 'run 2026-09-20-world-tick-roster.sql first — hr_tick_roster is missing';
  end if;
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'hr_cron_ensure is missing — run 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── §1 THE FIRE LOG ─────────────────────────────────────────────────────────
-- A scheduled job with no log is a job nobody can tell is broken — the
-- `hr_ledger_prune` lesson (the cron row existed and the retention still did
-- not work, for weeks). ONE ROW PER FIRE, never one per character: at a 10 s
-- cadence this is 8,640 rows/day, which is why it is pruned to 7 days (~60k
-- rows) rather than kept.
--
-- IT CARRIES NO SECRET AND NO PLAYER VALUE — a count, an outcome and a
-- duration. `tests/restore-census.baseline.json` classifies it `operational`.
create table if not exists public.hr_tick_cron_log (
  id          bigserial   primary key,
  at          timestamptz not null default now(),
  outcome     text        not null,
  rostered    int         not null default 0,
  ms          int         not null default 0,
  -- The effective per-character cadence this fire implies. THE NUMBER THAT
  -- SAYS "BUY THE HOST": see the 10x/100x tables in the header.
  effective_cadence_seconds int,
  detail      jsonb,
  constraint hr_tick_cron_log_outcome_ck check (outcome in
    ('posted','disabled','locked','empty','pg_net_absent','no_secret','no_edge_url','error'))
);
create index if not exists hr_tick_cron_log_at_idx on public.hr_tick_cron_log (at);
alter table public.hr_tick_cron_log enable row level security;
alter table public.hr_tick_cron_log force row level security;
do $$
begin
  execute 'revoke all on public.hr_tick_cron_log from public, anon, authenticated, service_role, hr_engine, hr_tick';
  execute 'revoke all on sequence public.hr_tick_cron_log_id_seq from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

create or replace function public.hr_tick_cron_log_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  with doomed as (
    select id from public.hr_tick_cron_log
     where at < now() - interval '7 days'
     order by id limit greatest(1, least(coalesce(p_limit, 20000), 200000))
  )
  delete from public.hr_tick_cron_log l using doomed d where l.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_tick_cron_log_prune(int)
  from public, anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §2 hr_tick_cron_run — THE DRIVER ────────────────────────────────────────
-- Runs as the OWNER, from the pg_cron background worker. It is executable by
-- nobody else (§5) — not by a client, not by the edge, not by the tick role.
--
-- It never settles anything itself. It does exactly three things: decide
-- whether this fire should happen, lease a batch, and hand that batch to the
-- engine over HTTP. Every value decision is behind `hr_tick_settle`.
-- THE LOG IS QUIET WHEN NOTHING IS HAPPENING. At a 10 s cadence a job that
-- logged every fire would write 8,640 rows/day while the tick is DISABLED —
-- the state it ships in and the state it spends most of its life in — which is
-- noise that makes the one interesting row impossible to find and costs disk
-- for a world that is not ticking. `disabled` and `locked` are therefore
-- COALESCED: the first one is written, and a repeat is suppressed for five
-- minutes. Every other outcome is always written, because every other outcome
-- means the tick tried to do something.
create or replace function public.hr_tick_cron_note(
  p_outcome text, p_ms int, p_rostered int default 0,
  p_eff int default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome in ('disabled', 'locked')
     and exists (select 1 from public.hr_tick_cron_log
                  where outcome = p_outcome and at > now() - interval '5 minutes') then
    return;
  end if;
  insert into public.hr_tick_cron_log (outcome, ms, rostered, effective_cadence_seconds, detail)
  values (p_outcome, coalesce(p_ms, 0), coalesce(p_rostered, 0), p_eff, p_detail);
end $$;
revoke execute on function public.hr_tick_cron_note(text, int, int, int, jsonb)
  from public, anon, authenticated, service_role, hr_engine, hr_tick;

create or replace function public.hr_tick_cron_run()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  v_holder   text;
  v_batch    jsonb;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_secret   text;
  v_gateway  text;
  v_eff      int;
  v_out      text;
  v_ms       int;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. A SLOW TICK MUST NEVER OVERLAP THE
  --        NEXT ONE: two fires leasing overlapping batches is how the same
  --        window gets proposed twice. `_xact_` and not the session form —
  --        pg_cron runs each fire in its own transaction, so it is released at
  --        commit even if this function raises, and a pooled connection cannot
  --        strand it. `pg_try_` and not `pg_` — a held lock means SKIP THIS
  --        FIRE, never queue behind it.
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

  -- ── (3) THE BATCH. `p_limit` is the per-fire cap (blast radius AND the DB
  --        time budget in the header); the keyset cursor resumes where the last
  --        fire stopped so a roster larger than the cap is walked to its end
  --        rather than re-serving its head. The holder names THIS project and
  --        THIS job, because `hr_tick_settle` refuses a settle whose holder
  --        does not match the lease stamped here.
  v_holder := left('cron:' || coalesce(current_database(), 'db'), 64);
  -- ⚠ `r.accrued_to` IS THE EFFECTIVE WATERMARK, NOT `player_state.accrued_to`
  --   (M-1, Security 2026-09-21). The roster returns where the next window
  --   STARTS — `greatest(accrued_to, shadow_accrued_to)` while shadowed — so a
  --   consumer that chains on this key tiles windows correctly in both modes.
  --   Before that fix the projection shipped the frozen paid mark and the
  --   shadow run journalled ONE window per character and then refused itself
  --   forever, which is the measurement the whole milestone exists to take.
  --   `shadow_accrued_to` rides alongside it and is NULL unless the shadow mark
  --   says something `accrued_to` does not; it is sent so the receiving entry
  --   can SEE the displacement rather than infer it, and so a future consumer
  --   cannot pick the frozen column by accident — there no longer is one.
  select jsonb_agg(jsonb_build_object(
           'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
           'active_kind', r.active_kind, 'active_id', r.active_id,
           'active_since', r.active_since, 'accrued_to', r.accrued_to,
           'shadow_accrued_to', r.shadow_accrued_to,
           'version', r.version, 'seed', r.seed, 'state', r.state)
           order by r.accrued_to, r.user_id, r.slot),
         count(*),
         max(r.accrued_to)
    into v_batch, v_n, v_last_a
    from public.hr_tick_roster(v_cfg.channels, 0, v_cfg.batch_limit, v_holder,
                               v_cfg.lease_ms, v_cfg.cursor_at, v_cfg.cursor_user,
                               v_cfg.cursor_slot) r;

  if coalesce(v_n, 0) = 0 then
    -- THE CURSOR WRAPS. An empty batch means this pass reached the end of the
    -- roster (or the roster is empty); the next fire starts from the beginning.
    update public.hr_tick_config set cursor_at = null, cursor_user = null,
           cursor_slot = null, updated_at = now() where id;
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  select (e->>'user_id')::uuid, (e->>'slot')::int
    into v_last_u, v_last_s
    from jsonb_array_elements(v_batch) e
   order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
   limit 1;

  -- A SHORT BATCH IS THE END OF THE PASS. Wrapping here rather than on the next
  -- empty fire saves one whole cadence of doing nothing.
  if v_n < v_cfg.batch_limit then
    update public.hr_tick_config set cursor_at = null, cursor_user = null,
           cursor_slot = null, updated_at = now() where id;
  else
    update public.hr_tick_config set cursor_at = v_last_a, cursor_user = v_last_u,
           cursor_slot = v_last_s, updated_at = now() where id;
  end if;

  -- THE NUMBER THAT SAYS "BUY THE HOST". See the 10x/100x tables in the header.
  v_eff := v_cfg.cadence_seconds * greatest(1, ceil(v_n::numeric / greatest(1, v_cfg.batch_limit))::int);

  -- ── (4) TWO SECRETS, FROM VAULT, BECAUSE THERE ARE TWO GATES.
  --        `supabase/config.toml` pins `verify_jwt = true` on hr-accrue and it
  --        STAYS ON (tests/edge-jwt-gate.mjs --strict defends exactly that), so
  --        Supabase's gateway rejects the request before the function runs
  --        unless `Authorization` carries a JWT it accepts. That is the
  --        GATEWAY key. It is not the tick's authorisation and must not be
  --        mistaken for it: the project's anon key satisfies the gateway and is
  --        public, so anyone could present it.
  --
  --        The tick's own bearer therefore rides its own header,
  --        `X-HR-Tick-Auth`, and the op:'tick' entry compares it in constant
  --        time. Both are read at call time, used once, and never returned,
  --        raised or journalled. §3 is the one-time setup for both.
  if to_regclass('vault.decrypted_secrets') is null then
    v_secret := null; v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_secret using 'hr_tick_shared_secret';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;
  if v_secret is null or v_secret = '' or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'vault needs BOTH hr_tick_shared_secret and hr_tick_gateway_key',
                        'have_tick_bearer', v_secret is not null and v_secret <> '',
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POST. Dynamic EXECUTE so this file APPLIES on a database where
  --        pg_net is not installed yet — the job then reports `pg_net_absent`
  --        every fire, which is a visible, harmless, fixable state rather than
  --        a migration that will not replay.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  begin
    execute 'select net.http_post($1, $2, $3, $4, $5)'
      using v_cfg.edge_url,
            jsonb_build_object('op', 'tick', 'holder', v_holder,
                               'shadow', v_cfg.shadow,
                               'cadence_ms', v_cfg.cadence_seconds * 1000,
                               'flush_ms', v_cfg.flush_seconds * 1000,
                               'roster', v_batch),
            '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json',
                               -- the GATEWAY's gate...
                               'Authorization', 'Bearer ' || v_gateway,
                               -- ...and the tick's own, which the entry checks.
                               'X-HR-Tick-Auth', v_secret),
            greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
    v_out := 'posted';
  exception when others then
    -- The secret must not reach the log even in an error path.
    v_out := 'error';
    perform public.hr_tick_cron_note('error',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('sqlstate', sqlstate));
    return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
  end;

  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('shadow', v_cfg.shadow, 'holder', v_holder,
                       'cursor_wrapped', v_n < v_cfg.batch_limit));
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'shadow', v_cfg.shadow, 'ms', v_ms,
                            'effective_cadence_seconds', v_eff);
end $$;

-- ── §3 THE VAULT CONTRACT — the Coordinator's one-time setup ────────────────
-- Stated here because a secret that lives only in somebody's memory is a secret
-- that stops the tick at 03:00 on a Sunday. NONE OF IT RUNS HERE: this file
-- creates no secret, reads no secret at apply time and contains no secret.
--
--   1. Mint the TICK BEARER (64 hex chars from a CSPRNG, not a password):
--        select vault.create_secret(
--          encode(gen_random_bytes(32), 'hex'),
--          'hr_tick_shared_secret',
--          'X-HR-Tick-Auth: pg_net -> hr-accrue op:tick. Rotate by create_secret again.');
--   1b. Store the GATEWAY KEY — the project ANON key, which is public and is
--       already in the repo, but is read from Vault so that a project move is a
--       Vault write rather than a migration, and so the driver never guesses:
--        select vault.create_secret(
--          '<the project anon key>', 'hr_tick_gateway_key',
--          'Authorization: Bearer — satisfies verify_jwt at the Supabase gateway. NOT the tick''s authorisation.');
--   2. Give the Edge Function the TICK BEARER, out of band, never through git:
--        npx supabase secrets set HR_TICK_SHARED_SECRET=<the value> \
--          --project-ref nezapsylztqbbwuwembx
--      (read it back once with `select decrypted_secret from
--       vault.decrypted_secrets where name='hr_tick_shared_secret'` — in a psql
--       session, never in argv, never pasted into a file the repo can see.)
--   3. Point the driver at the function:
--        update public.hr_tick_config
--           set edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';
--   4. Enable pg_net if it is not there yet:  create extension if not exists pg_net;
--   5. ARM IN SHADOW (this is the 48 h parity window, and it pays nothing):
--        update public.hr_tick_config set enabled = true, shadow = true;
--   6. Read the parity numbers (§the report in docs/planning/WORLD_TICK_DESIGN.md).
--   7. ONLY THEN, after a Security GO on the parity result:
--        update public.hr_tick_config set shadow = false;
--
-- ── ROTATION, AND WHAT THE DISAGREEMENT WINDOW ACTUALLY LOOKS LIKE ─────────
-- (Security §7 item 9, 2026-09-21. The previous sentence here said a fire in
--  the window "reports `error`". IT DOES NOT, and a runbook that tells the
--  operator to watch for the wrong symptom is worse than one that says
--  nothing — they rotate, see `posted`, and conclude it worked.)
--
--   ORDER: `vault.create_secret` first, then `supabase secrets set`. Vault is
--   what the DRIVER reads at call time; the env var is what the EDGE compares
--   against. Between the two they disagree.
--
--   WHAT HAPPENS IN THAT WINDOW: the driver posts the NEW bearer, the edge
--   still holds the OLD one, `tickGate` finds no match and answers
--   `401 not_signed_in` — the same body the player path returns for a bad
--   token, so the branch is not an oracle. REFUSALS, NEVER A BYPASS: an unset
--   or short `HR_TICK_SHARED_SECRET` fails CLOSED (`MIN_SECRET_LEN`, 32), so
--   the gap cannot be walked through by presenting nothing, and the comparison
--   is over two fixed-length digests, so it is not a length oracle either.
--
--   ⚠ THE DRIVER WILL NOT TELL YOU. `net.http_post` is ASYNCHRONOUS — it
--     returns a request id, not a response — so `hr_tick_cron_log` records
--     `posted` for every fire in the window and the 401 never reaches it.
--     VERIFY A ROTATION by reading `net._http_response` (status 401) or the
--     Edge Function logs, NOT the fire log. A green fire log during a rotation
--     means the POST left, not that the tick ran.
--
--   COST: no value, and no time. The watermark does not move for a window
--   nobody settled, so the next accepted fire resumes from the same mark and
--   the owed time is paid then — one or two windows of fluidity, nothing else.
--   Rotating in the other order (env first, Vault second) has the same shape
--   and the same cost; pick one and keep to it so the symptom is familiar.

-- ── §4 THE SCHEDULE ─────────────────────────────────────────────────────────
-- The cron row exists so that ARMING NEEDS NO MIGRATION — the switch is
-- `hr_tick_config.enabled`, and while it is false every fire returns `disabled`
-- in well under a millisecond. Scheduling a job that does nothing is the point:
-- it means the Coordinator can arm and disarm the live world with one UPDATE.
do $$
declare v_sub boolean := false;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-tick-run'', ''10 seconds'', ''select public.hr_tick_cron_run()'')';
  else
    -- SUB-MINUTE PROBE. pg_cron >= 1.5 accepts an interval string; older
    -- versions raise on it. Probed, not assumed, and the fallback is loud.
    begin
      perform public.hr_cron_ensure('hr-tick-run', '10 seconds', 'select public.hr_tick_cron_run()');
      v_sub := true;
    exception when others then
      perform public.hr_cron_ensure('hr-tick-run', '* * * * *', 'select public.hr_tick_cron_run()');
      raise notice 'pg_cron does not accept a sub-minute schedule (%) — hr-tick-run is scheduled at '
                   '60 s instead. A 60 s tick is still a tick; the gather flush is 90 s. Upgrade '
                   'pg_cron to >= 1.5 for the 10 s cadence.', sqlerrm;
    end;
    if v_sub then
      raise notice 'hr-tick-run scheduled at 10 s (pg_cron sub-minute accepted). '
                   'It returns `disabled` every fire until hr_tick_config.enabled is set.';
    end if;
    perform public.hr_cron_ensure('hr-tick-cron-log-prune', '37 * * * *',
      'select public.hr_tick_cron_log_prune(20000)');
  end if;
end $$;

-- ── §5 GRANTS ───────────────────────────────────────────────────────────────
-- Nobody. The driver runs as the owner from the pg_cron worker, and there is no
-- role in this database that should be able to make the world tick by hand.
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY. The one player row this block reads is one it inserted under
-- a uuid `gen_random_uuid()` cannot mint; every predicate binds a variable the
-- block declared. Rolled back regardless.
do $$
declare
  v_u   uuid := '00000000-0000-4000-8000-00000000f1c7';
  v_act text;
  v_r   jsonb;
  v_n   int;
  v_c   int;
begin
  begin
    -- ── c1: nobody may fire the driver by hand.
    select count(*) into v_n from information_schema.role_routine_grants g
     where g.routine_schema = 'public' and g.routine_name = 'hr_tick_cron_run'
       and g.grantee <> g.grantor;
    if v_n <> 0 then
      raise exception 'c1: hr_tick_cron_run carries % non-owner grant(s) — it must carry none', v_n;
    end if;
    if has_function_privilege('hr_engine', 'public.hr_tick_cron_run()', 'execute')
    or has_function_privilege('hr_tick', 'public.hr_tick_cron_run()', 'execute') then
      raise exception 'c1b: an engine role can fire the tick driver by hand';
    end if;

    -- ── c2: the log table is unreachable by every client and engine role.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'hr_tick_cron_log'
                  and grantee in ('public','anon','authenticated','service_role','hr_engine','hr_tick')) then
      raise exception 'c2: hr_tick_cron_log carries a grant for a client or engine role';
    end if;

    -- ── c3: THE KILL SWITCH IS THE FIRST GATE. With the shipped config the
    --        driver returns `disabled` and leases NOTHING.
    v_r := public.hr_tick_cron_run();
    if v_r->>'outcome' <> 'disabled' then
      raise exception 'c3: the driver ran while hr_tick_config.enabled is false (%)', v_r;
    end if;

    -- ── c4: enabled but with no edge_url is `no_edge_url`, and STILL leases
    --        nothing — the driver must not stamp leases it cannot use.
    update public.hr_tick_config set enabled = true where id;
    v_r := public.hr_tick_cron_run();
    if v_r->>'outcome' <> 'no_edge_url' then
      raise exception 'c4: a driver with no edge_url did not refuse (%)', v_r;
    end if;
    select count(*) into v_n from public.hr_tick_ownership where lease_until is not null;
    if v_n <> 0 then
      raise exception 'c4b: the driver stamped % lease(s) before it had anywhere to post', v_n;
    end if;

    -- ── c5: AN EMPTY ROSTER IS `empty`, NOT `posted`. This is the property
    --        that makes an idle beta cost zero Edge invocations.
    -- ⚠ THE URL MUST NOW SATISFY hr_tick_config_edge_url_ck (Security M-5).
    --   `https://example.invalid/...` was this block's own demonstration that
    --   the column took anything; with the constraint in place it is a
    --   check_violation and the self-check would fail at c5 rather than
    --   measure c5. A CONFORMING url that is nonetheless unreachable is what
    --   is wanted: the origin is pinned and real, the FUNCTION NAME is not one
    --   that exists, and nothing in this block gets far enough to post anyway
    --   (c5 short-circuits on the empty roster, c6 stops at `no_secret`).
    update public.hr_tick_config
       set edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/'
                      || 'hr-accrue-selfcheck-probe-does-not-exist' where id;
    v_r := public.hr_tick_cron_run();
    if v_r->>'outcome' <> 'empty' then
      raise exception 'c5: an empty roster did not short-circuit (%)', v_r;
    end if;

    -- ── THE PROBE CHARACTER, owned and payable, so the roster is non-empty.
    select activity_id into v_act from public.hr_activities where kind = 'gather' limit 1;
    if v_act is null then
      raise notice 'cron self-check SKIPPED past c5: no gather activity to point a probe at';
      raise exception 'HR922_ROLLBACK_OK';
    end if;
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather', v_act,
            now() - interval '1 hour');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    values (v_u, 0, 'gather', true);

    -- ── c6: WITH A ROSTERED CHARACTER THE DRIVER STOPS AT THE SECRET, NOT AT
    --        THE POST. `no_secret` is the honest pre-Vault state, and it proves
    --        the bearer is required rather than optional.
    v_r := public.hr_tick_cron_run();
    if v_r->>'outcome' not in ('no_secret', 'pg_net_absent') then
      raise exception 'c6: the driver posted without its Vault secrets (%)', v_r;
    end if;
    if coalesce((v_r->>'rostered')::int, 0) <> 1 then
      raise exception 'c6b: the roster returned % rows for one owned character', v_r->>'rostered';
    end if;
    -- ...and the lease WAS stamped, in the driver's own holder name.
    select count(*) into v_n from public.hr_tick_ownership
     where user_id = v_u and slot = 0 and channel = 'gather'
       and lease_holder like 'cron:%' and lease_until > now();
    if v_n <> 1 then
      raise exception 'c6c: the driver did not stamp its own lease';
    end if;

    -- ── c7: THE ADVISORY LOCK SKIPS, IT DOES NOT QUEUE. The lock is already
    --        held by THIS transaction (the call above took it and it is
    --        transaction-scoped), so a second call inside the same transaction
    --        re-enters rather than blocking — the property under test is that
    --        the lock is TRY and TRANSACTION-scoped, which is asserted on the
    --        lock itself. A cross-session proof lives in
    --        tests/world-tick-double-pay.mjs, where two real sessions contend.
    if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
      raise exception 'c7: the driver''s advisory lock is not re-entrant within a transaction';
    end if;
    select count(*) into v_n from pg_locks
     where locktype = 'advisory' and objid = (hashtext('hr_tick_cron_run')::bigint & 4294967295);
    if v_n = 0 then
      raise notice 'c7b: advisory lock not visible in pg_locks on this build; the TRY semantics are still asserted above';
    end if;

    -- ── c8: EVERY FIRE IS LOGGED, ONE ROW EACH, AND NO ROW CARRIES A SECRET.
    select count(*) into v_c from public.hr_tick_cron_log;
    if v_c < 4 then
      raise exception 'c8: % fires logged, expected at least 4 (disabled, no_edge_url, empty, no_secret)', v_c;
    end if;
    -- c8c: THE COALESCING BITES. A second `disabled` fire inside five minutes
    --      must not write a second row, or a disabled tick writes 8,640 rows a
    --      day saying nothing.
    update public.hr_tick_config set enabled = false where id;
    perform public.hr_tick_cron_run();
    perform public.hr_tick_cron_run();
    select count(*) into v_n from public.hr_tick_cron_log where outcome = 'disabled';
    if v_n <> 1 then
      raise exception 'c8c: % `disabled` rows after three disabled fires — the log is not coalescing', v_n;
    end if;
    -- The shapes a leaked bearer would actually take: the header prefix, or the
    -- 64 hex characters §3 mints. A `_` in LIKE is a wildcard, so the pattern
    -- is a regex — the first spelling of this check matched its own
    -- `create_secret(` hint and would have been a guard that only ever fired
    -- on itself.
    if exists (select 1 from public.hr_tick_cron_log
                where detail::text ilike '%bearer %'
                   or detail::text ~ '[0-9a-f]{32,}') then
      raise exception 'c8b: a cron log row carries something shaped like a bearer';
    end if;

    -- ── c9: the cron job exists and points at the driver, so that arming is an
    --        UPDATE and never a migration.
    if to_regprocedure('cron.schedule(text,text,text)') is not null then
      select count(*) into v_n from cron.job
       where jobname = 'hr-tick-run' and command like '%hr_tick_cron_run%';
      if v_n <> 1 then
        raise exception 'c9: hr-tick-run is not scheduled against hr_tick_cron_run';
      end if;
    end if;

    raise exception 'HR922_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR922_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-cron self-check PASSED (c1-c9); probe rows rolled back';
end $$;
