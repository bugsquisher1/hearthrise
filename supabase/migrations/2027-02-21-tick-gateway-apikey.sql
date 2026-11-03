-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-21-tick-gateway-apikey.sql — THE WORLD TICK STOPS CARRYING A LEGACY KEY
-- STAGED (lane/c-legacy-keys, backend-architect, 2026-11-01). Pre-EA: applies on
-- its passing §4 (one file, tools/apply-migration.mjs); on the EA Security list.
-- Applies BEFORE anyone deactivates the legacy keys. EDGE: no prerequisite; the
-- deployed hr-accrue never reads the gateway key.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--   The legacy JWT secret was exposed in a local session log, so it has to be
--   revoked, and the legacy anon JWT is signed by it. hr_tick_cron_run sends that
--   JWT (Vault hr_tick_gateway_key, measured: a jwt with role anon) as
--   `Authorization` on every fire, only to pass the gateway's verify_jwt. Revoke
--   the secret with the driver unchanged and the gateway refuses every fire: every
--   hunt on the server stops settling, in silence, because net.http_post answers
--   nothing. Measured 2026-11-01, verify_jwt = true on the live function: a GET or
--   POST with `apikey: <publishable>` and no Authorization passes the gateway, a
--   bogus sb_publishable_ is refused 401 "Invalid API key", a garbage bearer is
--   refused 401 "Invalid JWT". The tick's authorisation stays X-HR-Tick-Auth.
--
-- ── WHY THE PUBLISHABLE KEY AND NOT A SECRET KEY ────────────────────────────
--   The gateway only needs A project key, and the mac is what authorises the
--   tick. Every fire writes its headers into net.http_request_queue. A secret key
--   there is a BYPASSRLS credential in a table, for a job the public key does as
--   well, so hr_tick_gateway_headers refuses anything but the publishable shape.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_gateway_headers(p_apikey, p_legacy_jwt) -> jsonb. Pure, no role may
--    execute it. sb_publishable_* wins and sends `apikey` alone; any other
--    non-empty p_apikey is NULL, never a quiet fall back to the legacy key; no
--    apikey at all sends the legacy `Authorization`; nothing usable is NULL.
-- §2 hr_tick_cron_run RESTATED WHOLE from 2026-11-04-hunt-tick-shards.sql §3
--    (md5 6ccf40260328a46e755ef290e5c3d635, the live body, measured 2026-11-01).
--    Deltas only in (4) and the POST's headers. NULL headers is the existing
--    `no_secret` note: nothing is posted, and the fire says so.
-- §3 grants, revoke first; no role is granted anything.
-- §4 Vault hr_tick_gateway_apikey, created once when real Vault exists. The value
--    is the PUBLISHABLE key: public, and the same bytes the client ships. This
--    line is what switches the tick. No secret value is in this file.
-- §5 self-check.
--
-- ── ROLLBACK (while the legacy keys are still active) ───────────────────────
--   delete from vault.secrets where name = 'hr_tick_gateway_apikey';
--   The next fire is back on hr_tick_gateway_key, untouched by this file. Once the
--   legacy secret is revoked that row is dead and there is nothing to go back to:
--   move to another publishable key instead.
--
-- ── CONCURRENCY, COST ───────────────────────────────────────────────────────
--   The driver's advisory lock and rosters are unchanged; one more Vault read a
--   fire, and a queue row's headers shrink by about 170 bytes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE FLOOR: this file restates the body it pins, on top of nothing else.
do $mig$
begin
  if to_regprocedure('public.hr_tick_cron_run()') is null then
    raise exception 'HR_GATEWAY_APIKEY_ORDER: hr_tick_cron_run is not installed';
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)
       not in ('6ccf40260328a46e755ef290e5c3d635', 'be4b9fb23e1d44b4b833c79ab312d83a') then
    raise exception 'HR_GATEWAY_APIKEY_ORDER: hr_tick_cron_run moved since 2026-11-04-hunt-tick-shards.sql; restate from the newer body';
  end if;
end $mig$;

-- ── §1 THE HEADER CHOICE ─────────────────────────────────────────────────────
create or replace function public.hr_tick_gateway_headers(p_apikey text, p_legacy_jwt text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_apikey like 'sb\_publishable\_%' then jsonb_build_object('apikey', p_apikey)
    when coalesce(p_apikey, '') <> '' then null
    when coalesce(p_legacy_jwt, '') <> '' then jsonb_build_object('Authorization', 'Bearer ' || p_legacy_jwt)
    else null
  end
$$;

-- ── §2 THE DRIVER ────────────────────────────────────────────────────────────
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
  v_apikey   text;
  v_gate     jsonb;
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

  -- ── (4) THE GATEWAY KEY (2027-02-21-tick-gateway-apikey.sql). The project's
  --        PUBLISHABLE key, public by design (src/net/supabase-bootstrap.js), on
  --        the `apikey` header: the gateway checks it against the project's keys
  --        and `verify_jwt = true` stays on (tests/edge-jwt-gate.mjs --strict).
  --        Read from Vault only so a project move is a Vault write rather than a
  --        migration. `hr_tick_gateway_key`, the legacy anon JWT on
  --        `Authorization`, is read only while the publishable row is absent: it
  --        is the switch's way back. IT IS NOT THE TICK'S AUTHORISATION and must
  --        never be mistaken for it. hr_tick_gateway_headers owns the choice.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
    v_apikey  := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_apikey using 'hr_tick_gateway_apikey';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;
  v_gate := public.hr_tick_gateway_headers(v_apikey, v_gateway);

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

  if not v_have_tok or v_gate is null then
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
                        'have_gateway_key', v_gate is not null));
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
              -- the GATEWAY's gate...
              v_gate
                 -- ...and the tick's own, DERIVED PER BODY. The Vault secret is
                 -- not here and never was: this value is a mac over (bucket, body hash).
                 || jsonb_build_object('Content-Type', 'application/json',
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

-- ── §3 GRANTS ────────────────────────────────────────────────────────────────
revoke execute on function public.hr_tick_gateway_headers(text, text) from public;
revoke execute on function public.hr_tick_gateway_headers(text, text) from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §4 THE SWITCH ────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then
    raise notice 'tick-gateway-apikey: no Vault here (a replay); the driver reads whatever a test seeds';
    return;
  end if;
  if not exists (select 1 from vault.secrets where name = 'hr_tick_gateway_apikey') then
    perform vault.create_secret('sb_publishable_0nx0mXKTfnU01UM4ZESflQ_RjYBEUU9', 'hr_tick_gateway_apikey',
      'The project publishable key: public, the tick''s gateway pass. Not its authorisation.');
  end if;
end $mig$;

-- ── §5 SELF-CHECK — EXECUTED (CLAUDE.md §4) ──────────────────────────────────
--   g0  the installed bodies are this file's (md5)
--   g1  ★ a publishable key sends `apikey` alone: no Authorization, and it beats
--       a legacy JWT beside it
--   g2  ★ a secret key, a legacy JWT or junk in the apikey row is NULL with a
--       legacy JWT beside it: never a quiet fall back, and never on the wire
--   g3  no apikey row: the legacy JWT on Authorization, no apikey header
--   g4  nothing usable is NULL (the driver's `no_secret`)
--   g5  the driver's body holds no key literal and builds no Authorization itself
--   g6  on real Vault: the switch landed, publishable in shape, and exactly one row
--   g7  no role executes either function; grant hygiene STRICT
-- No message below can carry a value. The driver is not fired here: on production
-- it would POST. tests/legacy-keys.mjs fires it against the pg_net stub.
do $mig$
declare
  v_src text;
  v_h   jsonb;
begin
  select replace(p.prosrc, chr(13), '') into v_src from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure;
  if md5(v_src) <> 'be4b9fb23e1d44b4b833c79ab312d83a'
     or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
          where p.oid = 'public.hr_tick_gateway_headers(text,text)'::regprocedure) <> '8616bcc794303d75bee602901ca6ab8f' then
    raise exception 'g0: the installed bodies are not the ones this file states';
  end if;

  v_h := public.hr_tick_gateway_headers('sb_publishable_selfcheck', 'eyJ.self.check');
  if v_h is distinct from jsonb_build_object('apikey', 'sb_publishable_selfcheck') then
    raise exception 'g1: a publishable key did not send apikey alone';
  end if;

  if public.hr_tick_gateway_headers('sb_secret_selfcheck', 'eyJ.self.check') is not null
     or public.hr_tick_gateway_headers('sb_secret_selfcheck', null) is not null then
    raise exception 'g2: a secret key was accepted for the queue';
  end if;
  if public.hr_tick_gateway_headers('eyJ.self.check', 'eyJ.self.check') is not null
     or public.hr_tick_gateway_headers('junk', 'eyJ.self.check') is not null then
    raise exception 'g2: a non-publishable apikey fell back or was sent';
  end if;

  v_h := public.hr_tick_gateway_headers(null, 'eyJ.self.check');
  if v_h is distinct from jsonb_build_object('Authorization', 'Bearer eyJ.self.check') then
    raise exception 'g3: no apikey row did not send the legacy JWT alone';
  end if;
  if public.hr_tick_gateway_headers('', 'eyJ.self.check') is distinct from v_h then
    raise exception 'g3: an empty apikey row did not read as absent';
  end if;

  if public.hr_tick_gateway_headers(null, null) is not null
     or public.hr_tick_gateway_headers('', '') is not null then
    raise exception 'g4: nothing usable was not NULL';
  end if;

  if v_src ~ 'eyJ[A-Za-z0-9_-]{8}' or v_src ~ 'sb_secret_' or v_src ~ 'sb_publishable_' then
    raise exception 'g5: the driver''s body holds a key literal';
  end if;
  if position('''Authorization''' in v_src) > 0 then
    raise exception 'g5: the driver builds an Authorization header outside hr_tick_gateway_headers';
  end if;
  if position('hr_tick_gateway_apikey' in v_src) = 0 or position('hr_tick_gateway_headers(v_apikey, v_gateway)' in v_src) = 0 then
    raise exception 'g5: the driver does not read the publishable row or does not use the helper';
  end if;

  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null then
    if (select count(*) from vault.decrypted_secrets s
         where s.name = 'hr_tick_gateway_apikey' and s.decrypted_secret like 'sb\_publishable\_%') <> 1 then
      raise exception 'g6: Vault does not hold exactly one publishable hr_tick_gateway_apikey';
    end if;
  end if;

  if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
              where has_function_privilege(r.role, 'public.hr_tick_gateway_headers(text,text)', 'execute')
                 or has_function_privilege(r.role, 'public.hr_tick_cron_run()', 'execute')) then
    raise exception 'g7: a request or engine role holds EXECUTE on the driver or its header choice';
  end if;
  perform public.hr_assert_grant_hygiene(true);

  raise notice 'tick-gateway-apikey: EXECUTED — publishable on apikey alone, a secret key or junk refused, '
               'the legacy JWT only with no apikey row, no key literal in the driver, no role executes either — all green';
end $mig$;
