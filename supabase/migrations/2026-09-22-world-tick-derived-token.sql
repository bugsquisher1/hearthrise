-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-22-world-tick-derived-token.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE DERIVED PER-REQUEST TOKEN. Security ruling T-5.3,
-- docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md. Design: WORLD_TICK_DESIGN.md §17.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- M1 is arming in SHADOW. M2 — `update public.hr_tick_config set shadow = false`
-- — is BLOCKED until the static bearer `hr_tick_cron_run` posts is replaced by a
-- token derived per fire. T-5.3, in its own words: *"Not required before arm.
-- Required before `update public.hr_tick_config set shadow = false;`, and that
-- is a hard condition on the GO."*
--
-- The reason is reachability, not privilege. `net.http_request_queue` and
-- `net._http_response` carry SELECT to PUBLIC, granted by `supabase_admin`;
-- `postgres` cannot revoke another grantor's privilege, which is why
-- 2026-09-22-pg-net-queue-lockdown.sql was REFUSED BY ITS OWN SELF-CHECK and
-- why it is permanently unappliable by us (T-5.1). So the 64-hex bearer that
-- transits that queue is confidential only because of one PostgREST setting we
-- do not own plus the absence of a bridge we do own. In SHADOW that buys an
-- attacker nothing. Once `shadow = false` it buys a legal delta on every
-- character the roster leased. THIS FILE REMOVES THE CLASS: nothing long-lived
-- ever transits the queue again.
--
-- ── THE SHAPE — T-5.3's, EXACTLY ───────────────────────────────────────────
-- The lane brief sketched `v2.<ts>.<nonce>.<mac>` with a per-isolate nonce LRU.
-- T-5.3 prescribes a different shape and T-5.3 WINS (CLAUDE.md §0: a dated
-- ruling is not overridden by an undated one).
--
--     X-HR-Tick-Auth: v1 t=<bucket> b=<body_sha256_hex> m=<hmac_sha256_hex>
--
--       bucket      = floor(extract(epoch from now()) / 30)::bigint
--       body_sha256 = hex sha256 of the EXACT posted body bytes
--       m           = hex hmac_sha256(key = the Vault secret,
--                                     msg = bucket::text || '.' || body_sha256)
--
-- The edge recomputes `m` for bucket ∈ {n-1, n, n+1} — a ≤90 s window, the
-- flush cadence, far wider than any Postgres↔edge skew — compares CONSTANT
-- TIME, and separately requires sha256(the body it received) to equal `b`.
-- BOTH CHECKS ARE LOAD-BEARING: `m` covers only `t` and `b`, so without the
-- body-hash check a captured triple would authenticate any body. That check is
-- the body binding, and it is the reason there is no nonce.
--
-- ── WHY NO NONCE AND NO REPLAY CACHE (the brief asked; the answer is no) ────
-- At a 10 s cadence three fires land in each 30 s bucket, and when the roster
-- has not moved between them THE DRIVER'S BODY IS BYTE-IDENTICAL — same holder,
-- same geometry, same rows, same watermarks — so `t`, `b` and therefore `m` are
-- identical too. An LRU keyed on the token would refuse the driver's own second
-- and third legitimate fire of every bucket. A replay cache that cannot tell a
-- replay from a repeat is not a control; it is an outage with a security-shaped
-- name. Per-isolate memory would not be a control anyway: N isolates behind one
-- URL, recycled, so it catches an unknown fraction and forgets it on every cold
-- start. T-5.3 says the same thing more briefly: *"no nonce table, no new row
-- growth, nothing for M-6's budget."*
--
-- RESIDUAL R-T1, STATED HONESTLY BECAUSE T-5.3'S SENTENCE IS NEARLY RIGHT.
--   T-5.3 says a replay "is refused `window_already_settled` by the control that
--   already exists (S-3)". The entry does NOT take the window origin from the
--   body — tick.js re-derives it from the fence's watermark probe on every
--   request (the M-1 fix; edge-tick-gate T-B1g executes it). So a verbatim
--   replay inside the ≤90 s window is NOT refused as a stale window. It is
--   indistinguishable from an extra cron fire, and that is the correct residual:
--   the fence refuses any character the roster did not lease in the driver's own
--   holder name, the watermark CAS under the row lock refuses a second payment
--   for a settled window (S-3), and accrual is bounded to [watermark, now()].
--   IT CANNOT DOUBLE-PAY, CANNOT NAME AN UNLEASED CHARACTER, AND CANNOT MOVE A
--   WATERMARK BACKWARDS. It can make the tick run marginally early for one Edge
--   invocation. That is smaller than a long-lived bearer in a PUBLIC table.
--
--   ★ AND IT DEPENDS ON `flush_seconds`, WHICH IS A TUNABLE (Security T-2).
--     Two different numbers hide behind "≤90 s" and only one of them is the
--     replay number. ≤90 s is the WIDTH OF THE ACCEPTED SET ({n-1, n, n+1}),
--     which is the right figure for clock skew. A token minted in bucket n is
--     accepted until the end of bucket n+1, so its POST-MINT VALIDITY is ≤60 s.
--     `tick.js` settles only when a WHOLE flush period has elapsed since the
--     watermark, so: AT `flush_seconds > 60` A VERBATIM REPLAY SETTLES NOTHING,
--     BECAUSE THE FLUSH FLOOR REFUSES IT; BELOW THAT IT CAN SETTLE ONE WINDOW UP
--     TO 60 s EARLY, WHICH IS STILL NOT A DOUBLE PAY. The shipped default is 90
--     and is therefore on the zero side — but `hr_tick_config_flush_ck` permits
--     10, so this is a property of the CONFIGURATION and not an invariant, and
--     saying so is the whole of T-2. d11 gates the parts that are this file's to
--     keep true (the bucket width, the column default, the floor still being
--     below the window) and NOTICEs the live row, which is Reliability's lever.
--
-- ── HASHING THE BYTES pg_net ACTUALLY SENDS ────────────────────────────────
-- The mac binds `b` to the posted bytes, so the driver must hash exactly what
-- leaves. `net.http_post(url, body jsonb, …)` stores `convert_to(body::text,
-- 'UTF8')` and the worker sends those bytes verbatim. So the body is
-- materialised as TEXT FIRST (`v_body_txt := <the jsonb>::text`), hashed as
-- `convert_to(v_body_txt,'UTF8')`, and posted as `v_body_txt::jsonb`. Both sides
-- call the same `jsonb_out` on the same value; `jsonb::text` is normalised
-- (sorted keys, no insignificant whitespace), which is what makes that a
-- property rather than a coincidence. §5 (d7) EXECUTES the equality against the
-- real queue row wherever pg_net is installed, rather than asserting it in prose.
--
-- ── pgcrypto: RESOLVED, NEVER ASSUMED, AND IT FAILS CLOSED ─────────────────
-- `hr_tick_cron_run` carries `set search_path = public`, so `hmac` and `digest`
-- must be schema-qualified (T-5.3). No migration in this repo has ever EXECUTED
-- pgcrypto — both existing mentions are comments — so the schema is resolved
-- from `pg_proc` at call time and interpolated with `quote_ident`, rather than
-- guessed at `extensions`. If `hmac(text,text,text)` is absent the driver
-- returns the NEW outcome `no_hmac` and posts nothing. IT NEVER FALLS BACK TO
-- THE STATIC BEARER: a fallback is the entire class this file removes.
--   AND THE APPLY ITSELF REFUSES rather than landing a silent no-op: §0b raises
--   `HR_TICK_NO_PGCRYPTO` on any database that has Vault and cannot resolve
--   pgcrypto (Security T-1, 2026-09-23 — before it, this file applied GREEN and
--   the tick answered `no_hmac` for ever with a `raise notice` as the only
--   warning). d10 asserts the same predicate from the far end of §5, so the gate
--   cannot be deleted quietly.
--   @electric-sql/pglite ships without pgcrypto (measured 2026-09-22), so the
--   credential-free replay CANNOT execute the derivation. §5 says so out loud:
--   on the replay it asserts the fail-closed path and NOTICEs each skipped arm
--   by name; on production it executes the vector, the header shape and the
--   queue-row binding at apply time.
--
-- ── THE SECRET STOPS BEING A VARIABLE ──────────────────────────────────────
-- Today the driver reads the plaintext into `v_secret` and interpolates it into
-- the header. After this file the plaintext is never assigned to a plpgsql
-- variable at all: `hr_tick_auth_header` reads `vault.decrypted_secrets` and
-- computes the mac INSIDE ONE DYNAMIC EXECUTE, and only the mac comes back.
-- That helper is a mac oracle by construction — anyone who can call it can mint
-- a valid token for a body of their choosing — so it is `security definer` and
-- REVOKED FROM public, anon, authenticated, service_role, hr_engine, hr_tick,
-- the same posture as `hr_tick_cron_run`, asserted by d1.
--   `hr_tick_gateway_key` is unchanged and stays a variable: it is the project
--   anon key, public by design, and T-5.3 puts it explicitly out of scope.
--   HEADER INJECTION IS REFUSED AT THE HELPER: `p_body_sha` must match
--   ^[0-9a-f]{64}$ or the helper returns null, so a CR/LF can never reach a
--   header value. d2 executes that and runs everywhere, pgcrypto or not.
--
-- ── THE CUTOVER: ONE FORM AT A TIME, NO DUAL-ACCEPT ────────────────────────
-- The edge accepts `v1 t= b= m=` ONLY; the static bearer is refused from the
-- moment that build is live. The seam is the kill switch, not a dual-accept
-- window (WORLD_TICK_DESIGN.md §17.9 and §6 of this file):
--     1. update public.hr_tick_config set enabled = false;   -- fires stop in ≤10 s
--     2. apply THIS FILE (one file, tools/apply-migration.mjs)
--     3. pack + deploy hr-accrue; verify live payload_sha256 == pack-edge --hash
--     4. update public.hr_tick_config set enabled = true;    -- re-arm
-- Between (1) and (4) the tick posts nothing, so no build ever exists that
-- accepts both forms. Dual-accept was REJECTED: two deploys, the second one is
-- the one that actually satisfies T-5.3, and "remove this by <date>" on a money
-- gate is the line that gets forgotten. It would also leave a live build whose
-- payload hash is green and whose behaviour is the thing Security blocked.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §0  Preflight. Fails closed if the cron driver is not there.
--   §0a `hr_tick_crypto_schema()` — the ONE pgcrypto resolution in this file.
--   §0b THE APPLY REFUSES if this database must derive and cannot (T-1).
--   §1  `hr_tick_cron_log.outcome` admits `no_hmac`.
--   §2  `hr_tick_body_sha256()` / `hr_tick_auth_header()`.
--   §3  `hr_tick_cron_run()` RESTATED — same driver, derived header.
--   §4  Grants: nobody, on all four.
--   §5  Self-check d1-d11, EXECUTED, PROBE ROWS ONLY, rolled back regardless.
--   §6  The operator section: apply + deploy order, verification reads, kill switch.
--
-- MOVES A LIVE HASH: `hr_tick_cron_run` is a restated live body, so
-- `live-hash-drift --live --write` and a whys entry are owed after the apply.
-- NO PLAYER TABLE IS TOUCHED. NO VALUE MOVES. Re-applying is a no-op.
--
-- REVERSIBLE, IN ORDER OF BLUNTNESS:
--   `update public.hr_tick_config set enabled = false;`   — stops the tick
--   `select public.hr_cron_drop('hr-tick-run');`          — stops the driver
--   re-apply 2026-09-21-world-tick-cron.sql               — restores the static
--                                                           form (and re-blocks M2)
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ───────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_tick_cron_run()') is null then
    raise exception 'run 2026-09-21-world-tick-cron.sql first — hr_tick_cron_run is missing';
  end if;
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'run 2026-09-21-world-tick-settle-fence.sql first — hr_tick_config is missing';
  end if;
  if to_regclass('public.hr_tick_cron_log') is null then
    raise exception 'run 2026-09-21-world-tick-cron.sql first — hr_tick_cron_log is missing';
  end if;
end $$;

-- ── §0a WHERE pgcrypto LIVES ───────────────────────────────────────────────
-- Created HERE, ahead of everything else, because §0b gates the whole apply on
-- its answer and a gate cannot call a function that does not exist yet. It is
-- also the ONLY place in this file that spells the resolution, so there is no
-- second copy for §0b to drift away from — d10 asserts that equality from the
-- other end.
--
-- Read from the catalogue rather than guessed. Supabase
-- puts it in `extensions`; a self-hosted database may put it in `public`; PGlite
-- does not have it at all. Returning NULL is the honest third answer and is what
-- makes the driver's `no_hmac` reachable.
create or replace function public.hr_tick_crypto_schema()
returns text language sql stable security definer set search_path = public as $$
  select n.nspname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'hmac'
     and pg_get_function_identity_arguments(p.oid) = 'text, text, text'
     and exists (select 1 from pg_proc d
                  join pg_namespace dn on dn.oid = d.pronamespace
                 where d.proname = 'digest'
                   and dn.nspname = n.nspname
                   and pg_get_function_identity_arguments(d.oid) = 'bytea, text')
   order by (n.nspname = 'extensions') desc, n.nspname
   limit 1
$$;

-- ── §0b THE APPLY REFUSES IF THIS DATABASE MUST DERIVE AND CANNOT (T-1) ────
-- Security ruling T-1, SEC_WORLD_TICK_TOKEN_2026-09-23.md, P1: before this
-- block the file APPLIED GREEN with pgcrypto unreachable and the world tick then
-- answered `no_hmac` on every fire for ever — a migration that succeeds while
-- disabling the feature it configures. The only warning was a `raise notice` in
-- §5, and CLAUDE.md §4 is explicit that a claim is gated on an exit code and
-- never on someone reading a line of output.
--
-- `vault.decrypted_secrets` IS THE DISCRIMINATOR, and it is the right one on its
-- merits rather than by convenience: a database that has Supabase's Vault is a
-- database where the derivation is EXPECTED to work, so failing to resolve
-- pgcrypto there is a misconfiguration and not a state. The credential-free
-- replay (tests/sql/pglite-fixture.sql defines neither `vault` nor `net`, which
-- is why the driver's own `to_regclass` guards exist) has no Vault, so it keeps
-- applying and keeps asserting the fail-closed path — which is the half it is
-- uniquely able to prove. Both states are executed by
-- tests/world-tick-token-failclosed.mjs; the third is the one this block removes.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is not null
     and public.hr_tick_crypto_schema() is null then
    raise exception
      'HR_TICK_NO_PGCRYPTO: vault.decrypted_secrets exists, so this database is '
      'expected to derive the tick token — but hmac(text,text,text)/digest(bytea,text) '
      'is not resolvable, and the world tick would answer `no_hmac` on EVERY fire, '
      'for ever. Run `create extension if not exists pgcrypto with schema extensions;` '
      'and re-apply. Do NOT re-arm the tick instead. (§6 step 2.)'
      using errcode = 'feature_not_supported';
  end if;
end $$;

-- ── §1 THE FIRE LOG ADMITS ONE MORE OUTCOME ────────────────────────────────
-- `no_hmac` is the fail-closed state when pgcrypto is not reachable. It is a
-- distinct outcome rather than a flavour of `no_secret` because the operator
-- action is different: `no_secret` is a Vault write, `no_hmac` is
-- `create extension pgcrypto`. An outcome that conflates two fixes is an
-- outcome that gets the wrong one applied at 03:00 on a Sunday.
alter table public.hr_tick_cron_log drop constraint if exists hr_tick_cron_log_outcome_ck;
alter table public.hr_tick_cron_log add constraint hr_tick_cron_log_outcome_ck check (outcome in
  ('posted','disabled','locked','empty','pg_net_absent','no_secret','no_hmac','no_edge_url','error'));

-- ── §2 THE REST OF THE DERIVATION ──────────────────────────────────────────

-- THE BODY HASH, over the bytes pg_net will actually send. `convert_to(…,'UTF8')`
-- is explicit rather than implicit: the encoding is part of the contract the
-- edge recomputes against, and a database whose client_encoding differed would
-- otherwise hash different bytes than it posts.
create or replace function public.hr_tick_body_sha256(p_body text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_schema text; v_hex text;
begin
  if p_body is null then return null; end if;
  v_schema := public.hr_tick_crypto_schema();
  if v_schema is null then return null; end if;
  execute format('select encode(%I.digest(convert_to($1, %L), %L), %L)',
                 v_schema, 'UTF8', 'sha256', 'hex')
     into v_hex using p_body;
  return v_hex;
end $$;

-- THE HEADER. The ONLY place in the chain that reads `hr_tick_shared_secret`,
-- and it reads it inside ONE dynamic EXECUTE whose result is the mac — so the
-- plaintext is never bound to a variable that a RAISE, a journal or an exception
-- context could carry. Returns NULL for every failure (no pgcrypto, no Vault, no
-- secret, a secret too short to be the minted one, a malformed body hash) and
-- the caller turns NULL into a REFUSAL, never into a fallback.
--
-- ⚠ IT IS A MAC ORACLE. Anyone who can execute it can mint a valid token for a
--   body of their choosing. §4 revokes it from every role; d1 asserts that.
create or replace function public.hr_tick_auth_header(p_bucket bigint, p_body_sha text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_schema text; v_mac text;
begin
  -- HEADER INJECTION IS REFUSED HERE, AND IT RAISES RATHER THAN RETURNING NULL.
  -- `p_bucket` is a bigint and cannot carry a newline; `p_body_sha` is text and
  -- could, so it is pinned to the only shape a sha256 hex digest has. A CR/LF
  -- reaching a header value is how one request becomes two.
  --
  -- ⚠ THE RAISE IS THE POINT, and it is a correction to this file's first draft.
  --   NULL is this function's answer for an ENVIRONMENT that cannot derive (no
  --   pgcrypto, no Vault, no secret), and the caller turns that into a refusal.
  --   A malformed argument is not an environment state, it is a caller defect —
  --   and while it also returned NULL, d2 PASSED VACUOUSLY on the credential-free
  --   replay: with no pgcrypto the function returns NULL two lines later anyway,
  --   so the arm was green with the injection check DELETED. Measured, not
  --   supposed: mutation MD2 applied green before this change and is refused
  --   after it. A raise is distinguishable from an absence, so d2 now bites
  --   everywhere rather than only where the derivation can run.
  if p_bucket is null or p_body_sha is null or p_body_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'hr_tick_auth_header: the body hash must be 64 lower-case hex'
      using errcode = 'invalid_parameter_value';
  end if;
  v_schema := public.hr_tick_crypto_schema();
  if v_schema is null then return null; end if;
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;

  -- ONE STATEMENT: read the secret, key the hmac with it, hand back hex. The
  -- length floor mirrors the edge's MIN_SECRET_LEN (32) so a truncated or
  -- placeholder secret refuses on BOTH sides rather than on one.
  execute format(
    'select encode(%I.hmac($1, s.decrypted_secret, %L), %L)'
    '  from vault.decrypted_secrets s'
    ' where s.name = $2 and s.decrypted_secret is not null'
    '   and length(s.decrypted_secret) >= 32'
    ' limit 1', v_schema, 'sha256', 'hex')
    into v_mac
   using p_bucket::text || '.' || p_body_sha, 'hr_tick_shared_secret';

  if v_mac is null then return null; end if;
  return 'v1 t=' || p_bucket::text || ' b=' || p_body_sha || ' m=' || v_mac;
end $$;

-- ── §3 THE DRIVER, RESTATED ────────────────────────────────────────────────
-- Byte-for-byte the 2026-09-21 driver except for section (4)/(5): the shared
-- secret is no longer read into a variable and no longer posted, the body is
-- materialised as text so it can be hashed, and the header carries the
-- derivation. Every other property — advisory lock first, kill switch failing
-- closed, the keyset cursor, the lease holder, the batch cap, the effective
-- cadence, the quiet log — is unchanged and is still asserted by the 2026-09-21
-- self-check and by tests/world-tick-*.mjs.
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
  v_gateway  text;
  v_body_txt text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := false;
  v_eff      int;
  v_out      text;
  v_ms       int;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue.
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

  -- ── (3) THE BATCH. Unchanged. `r.accrued_to` is the EFFECTIVE watermark
  --        (`greatest(accrued_to, shadow_accrued_to)`, Security M-1) and
  --        `shadow_accrued_to` rides alongside it so the entry can SEE the
  --        displacement rather than infer it.
  v_holder := left('cron:' || coalesce(current_database(), 'db'), 64);
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

  if v_n < v_cfg.batch_limit then
    update public.hr_tick_config set cursor_at = null, cursor_user = null,
           cursor_slot = null, updated_at = now() where id;
  else
    update public.hr_tick_config set cursor_at = v_last_a, cursor_user = v_last_u,
           cursor_slot = v_last_s, updated_at = now() where id;
  end if;

  v_eff := v_cfg.cadence_seconds * greatest(1, ceil(v_n::numeric / greatest(1, v_cfg.batch_limit))::int);

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

  -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
  --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
  --         those bytes verbatim, so hashing this exact text and posting
  --         `v_body_txt::jsonb` hashes what leaves. Both sides are the same
  --         `jsonb_out` on the same value.
  v_body_txt := jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   'shadow', v_cfg.shadow,
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   'roster', v_batch)::text;

  -- ── (4b) THE DERIVATION. pgcrypto absent is `no_hmac` and NOTHING IS POSTED:
  --         there is no static fallback, by construction — this function no
  --         longer has a code path that can put a long-lived secret on the wire.
  v_body_sha := public.hr_tick_body_sha256(v_body_txt);
  if v_body_sha is null then
    perform public.hr_tick_cron_note('no_hmac',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
    return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;
  v_auth     := public.hr_tick_auth_header(v_bucket, v_body_sha);
  v_have_tok := v_auth is not null;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of this file carries both names for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POST. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  begin
    execute 'select net.http_post($1, $2, $3, $4, $5)'
      using v_cfg.edge_url,
            v_body_txt::jsonb,
            '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json',
                               -- the GATEWAY's gate...
                               'Authorization', 'Bearer ' || v_gateway,
                               -- ...and the tick's own, DERIVED PER FIRE. The
                               -- Vault secret is not here and never was: this
                               -- value is a mac over (bucket, body hash).
                               'X-HR-Tick-Auth', v_auth),
            greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
    v_out := 'posted';
  exception when others then
    -- Nothing derived from a secret reaches the log even in an error path.
    v_out := 'error';
    perform public.hr_tick_cron_note('error',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('sqlstate', sqlstate));
    return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
  end;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('shadow', v_cfg.shadow, 'holder', v_holder,
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_n < v_cfg.batch_limit));
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'shadow', v_cfg.shadow, 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff);
end $$;

-- ── §4 GRANTS ──────────────────────────────────────────────────────────────
-- Nobody, on all four. `hr_tick_auth_header` in particular is a mac oracle and
-- is the one function in this file whose grant would matter: holding it is
-- equivalent to holding the secret for any body of the caller's choosing.
revoke execute on function public.hr_tick_cron_run() from public;
revoke execute on function public.hr_tick_cron_run()
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_crypto_schema() from public;
revoke execute on function public.hr_tick_crypto_schema()
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_body_sha256(text) from public;
revoke execute on function public.hr_tick_body_sha256(text)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_auth_header(bigint, text) from public;
revoke execute on function public.hr_tick_auth_header(bigint, text)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §5 SELF-CHECK — EXECUTED (CLAUDE.md §4) ────────────────────────────────
-- PROBE ROWS ONLY. The one player row this block reads is one it inserted under
-- a uuid `gen_random_uuid()` cannot mint; every predicate binds a variable the
-- block declared. Rolled back regardless.
--
-- ⚠ TWO ARMS CANNOT RUN EVERYWHERE, AND THE BLOCK SAYS WHICH BY NAME RATHER
--   THAN PASSING QUIETLY. @electric-sql/pglite has no pgcrypto (measured
--   2026-09-22), so on the credential-free replay d4–d7 cannot execute and d3
--   asserts the FAIL-CLOSED path instead — which is the more valuable half
--   there, because "pgcrypto is missing" is exactly the state a fallback would
--   have hidden. On production all of d1–d9 run. Every skip is a NOTICE naming
--   the arm and the reason; a silent skip is how I-3 became a finding.
--
-- MUTATION RECORD (CLAUDE.md §4, "a guard that has never been red is not a
-- guard"). Five defects were planted in this file and replayed against the
-- credential-free chain; every one was refused by the arm named, and two of them
-- rewrote arms that had been passing vacuously:
--   MD1 a static fallback when pgcrypto is absent            -> d9
--   MD2 the header helper stops refusing CR/LF               -> d2   (was GREEN)
--   MD3 the driver posts instead of refusing `no_hmac`       -> d3
--   MD4 the derived header is journalled into the fire log   -> d8b  (was GREEN)
--   MD5 a grant on the mac oracle, after every revoke        -> d1
--   MD6 §0b downgraded to a `raise notice`                    -> d10  (T-1)
-- MD2 and MD4 are why d2 raises rather than returning NULL and why d8b exists
-- at all. Neither was caught by the first draft of this block. MD6 is Security
-- T-1 and is executed by tests/world-tick-token-failclosed.mjs --selftest,
-- which is the only place the (Vault, no pgcrypto) state can be BUILT.
--
-- THE PINNED VECTOR is shared with tests/edge-tick-gate.mjs (arm T-V1), which
-- reproduces it with node:crypto. That constant is what binds the SQL
-- derivation and the edge verifier together across two runtimes that cannot
-- both run in one process.
--   secret  = 'a' x 32 || 'b' x 32          (A TEST VALUE. Never production's.)
--   body    = '{"op": "tick"}'              (as `jsonb_out` renders it)
--   bucket  = 59666666
--   b       = 17282fb11f9af43c5f1eef8209d34638b3a13fb28ab449c2ad33ecdf1c0df883
--   m       = e64d6ce866a3f8a1333f774d5ae022f72a87a93ea3c4c4441571a5da1b5ccb91
do $$
declare
  v_u        uuid := '00000000-0000-4000-8000-00000000d70c';
  v_act      text;
  v_schema   text;
  v_n        int;
  v_r        jsonb;
  v_def      text;
  v_hex      text;
  v_hdr      text;
  v_qsha     text;
  v_ran      text[] := array[]::text[];
  v_skipped  text[] := array[]::text[];
  k_secret   text := repeat('a', 32) || repeat('b', 32);
  k_body     text := '{"op": "tick"}';
  k_bucket   bigint := 59666666;
  k_sha      text := '17282fb11f9af43c5f1eef8209d34638b3a13fb28ab449c2ad33ecdf1c0df883';
  k_mac      text := 'e64d6ce866a3f8a1333f774d5ae022f72a87a93ea3c4c4441571a5da1b5ccb91';
  -- d11's constants. `k_bucket_s` is the bucket width this file's driver
  -- derives with and `k_skew` is the edge's TICK_BUCKET_SKEW; the pair is what
  -- makes the replay window a NUMBER rather than a sentence, and d11a pins the
  -- first of them against the installed body so the two cannot drift.
  -- tests/world-tick-token-leak.mjs X-5d binds both to tick.js's own exports,
  -- which is the half SQL cannot reach.
  k_bucket_s int := 30;
  k_skew     int := 1;
  v_window_s int;
  v_floor_s  int;
  v_default  int;
  v_cdef     text;
begin
  begin
    -- ── d1: NOBODY MAY CALL ANY OF THE FOUR BY HAND. `hr_tick_auth_header` is
    --        the one that matters most: it mints a valid token for any body.
    for v_hex in
      select x from unnest(array['hr_tick_cron_run','hr_tick_crypto_schema',
                                 'hr_tick_body_sha256','hr_tick_auth_header']) x
    loop
      select count(*) into v_n from information_schema.role_routine_grants g
       where g.routine_schema = 'public' and g.routine_name = v_hex
         and g.grantee <> g.grantor;
      if v_n <> 0 then
        raise exception 'd1: % carries % non-owner grant(s) — it must carry none', v_hex, v_n;
      end if;
    end loop;
    if has_function_privilege('hr_engine', 'public.hr_tick_auth_header(bigint,text)', 'execute')
    or has_function_privilege('hr_tick',   'public.hr_tick_auth_header(bigint,text)', 'execute')
    or has_function_privilege('hr_engine', 'public.hr_tick_body_sha256(text)', 'execute')
    or has_function_privilege('hr_tick',   'public.hr_tick_body_sha256(text)', 'execute') then
      raise exception 'd1b: an engine role can mint a tick token by hand';
    end if;
    v_ran := v_ran || 'd1'::text;

    -- ── d2: HEADER INJECTION IS REFUSED, AND IT IS REFUSED BEFORE ANY SECRET
    --        IS READ — so this arm runs with or without pgcrypto and with or
    --        without Vault. A CR/LF in a header value is one request becoming
    --        two, and `p_body_sha` is the only text this function interpolates.
    --
    --        EACH CALL MUST RAISE `invalid_parameter_value`. Asserting "returns
    --        null" here was vacuous on a database without pgcrypto — the
    --        function returns null two lines further down for a reason that has
    --        nothing to do with the injection check — so the arm was green with
    --        that check deleted. Mutation MD2 is the proof; see the helper.
    for v_hex in
      select x from unnest(array[
        k_sha || chr(13) || chr(10) || 'X-Evil: 1',
        k_sha || ' m=' || k_mac,
        'not-hex',
        upper(k_sha),
        substr(k_sha, 1, 63),
        k_sha || '0',
        null
      ]) x
    loop
      begin
        perform public.hr_tick_auth_header(1, v_hex);
        raise exception 'd2: the header helper ACCEPTED a body hash that is not 64 '
                        'lower-case hex (%)', coalesce(left(v_hex, 20), '<null>');
      exception when invalid_parameter_value then
        null;                              -- the refusal this arm is looking for
      end;
    end loop;
    begin
      perform public.hr_tick_auth_header(null, k_sha);
      raise exception 'd2b: the header helper accepted a null bucket';
    exception when invalid_parameter_value then
      null;
    end;
    v_ran := v_ran || 'd2'::text;

    -- ── d9: THE DRIVER NO LONGER NAMES THE SHARED SECRET. Structural, on the
    --        installed body rather than on the file, so a later hand-edit on
    --        production is caught too. The plaintext is reachable from exactly
    --        one function in the chain, and it is the one §4 revokes hardest.
    v_def := pg_get_functiondef('public.hr_tick_cron_run()'::regprocedure);
    if position('hr_tick_shared_secret' in v_def) > 0 then
      raise exception 'd9: hr_tick_cron_run still reads hr_tick_shared_secret directly';
    end if;
    if position('hr_tick_auth_header' in v_def) = 0 then
      raise exception 'd9b: hr_tick_cron_run does not derive its header';
    end if;
    -- `prokind in ('f','p')` is not decoration: pg_get_functiondef RAISES on an
    -- aggregate ("array_agg is an aggregate function"), and an unfiltered scan
    -- of `public` therefore fails on whatever aggregate the chain happens to
    -- define rather than on the property under test.
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and position('hr_tick_shared_secret' in pg_get_functiondef(p.oid)) > 0;
    if v_n <> 1 then
      raise exception 'd9c: % routine(s) in public read hr_tick_shared_secret — exactly 1 (hr_tick_auth_header) is the contract', v_n;
    end if;
    v_ran := v_ran || 'd9'::text;

    v_schema := public.hr_tick_crypto_schema();

    if v_schema is null then
      -- ── d3 (NO pgcrypto): THE DRIVER FAILS CLOSED AND POSTS NOTHING. This is
      --      the arm that would have caught a static fallback, and it is the one
      --      the replay can actually run.
      update public.hr_tick_config
         set enabled = true,
             edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/'
                        || 'hr-accrue-selfcheck-probe-does-not-exist' where id;
      select activity_id into v_act from public.hr_activities where kind = 'gather' limit 1;
      if v_act is null then
        raise notice 'd3 SKIPPED: no gather activity to point a probe at';
        v_skipped := v_skipped || 'd3(no gather activity)'::text;
      else
        insert into auth.users (id) values (v_u) on conflict do nothing;
        insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                         accrued_to, active_kind, active_id, active_since)
        values (v_u, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather', v_act,
                now() - interval '1 hour');
        insert into public.hr_tick_ownership (user_id, slot, channel, owned)
        values (v_u, 0, 'gather', true);
        v_r := public.hr_tick_cron_run();
        if v_r->>'outcome' <> 'no_hmac' then
          raise exception 'd3: pgcrypto is absent and the driver answered % — it must refuse `no_hmac` and post nothing', v_r;
        end if;
        if coalesce((v_r->>'rostered')::int, 0) <> 1 then
          raise exception 'd3b: the roster returned % rows for one owned character', v_r->>'rostered';
        end if;
        v_ran := v_ran || 'd3'::text;
      end if;
      raise notice 'd4-d7 SKIPPED: pgcrypto is not reachable in this database '
                   '(PGlite has no pgcrypto; production does). The derivation was NOT executed here.';
      v_skipped := v_skipped || 'd4'::text || 'd5'::text || 'd6'::text || 'd7'::text;
    else
      -- ── d4: THE PINNED VECTOR. The derivation is the contract, and a contract
      --        asserted against itself is not asserted. This compares SQL's hmac
      --        against a constant node:crypto produced, which tests/edge-tick-
      --        gate.mjs T-V1 reproduces on the other side.
      execute format('select encode(%I.hmac($1, $2, %L), %L)', v_schema, 'sha256', 'hex')
         into v_hex using k_bucket::text || '.' || k_sha, k_secret;
      if v_hex is distinct from k_mac then
        raise exception 'd4: the SQL hmac does not match the pinned vector (got %, want %)', v_hex, k_mac;
      end if;
      v_ran := v_ran || 'd4'::text;

      -- ── d5: THE BODY HASH, over the bytes pg_net will send.
      v_hex := public.hr_tick_body_sha256(k_body);
      if v_hex is distinct from k_sha then
        raise exception 'd5: hr_tick_body_sha256 does not match the pinned vector (got %, want %)', v_hex, k_sha;
      end if;
      if public.hr_tick_body_sha256(null) is not null then
        raise exception 'd5b: a null body hashed to something';
      end if;
      v_ran := v_ran || 'd5'::text;

      -- ── d6: THE HEADER SHAPE, from the real helper and the real Vault secret.
      --        The mac is not compared to anything — it cannot be, without the
      --        secret — but the SHAPE, the version tag, the bucket and the body
      --        binding are all asserted, and so is the absence of a control
      --        character. The pinned vector (d4) is what proves the arithmetic.
      v_hdr := public.hr_tick_auth_header(k_bucket, k_sha);
      if v_hdr is null then
        raise notice 'd6 SKIPPED: vault.decrypted_secrets has no hr_tick_shared_secret >= 32 chars '
                     '(expected before the Vault contract is run; the driver answers `no_secret`)';
        v_skipped := v_skipped || 'd6'::text;
      else
        if v_hdr !~ '^v1 t=[0-9]+ b=[0-9a-f]{64} m=[0-9a-f]{64}$' then
          raise exception 'd6: the derived header is not the T-5.3 shape';
        end if;
        if v_hdr not like 'v1 t=' || k_bucket::text || ' b=' || k_sha || ' m=%' then
          raise exception 'd6b: the header does not carry the bucket and body hash it was asked for';
        end if;
        if position(chr(13) in v_hdr) > 0 or position(chr(10) in v_hdr) > 0 then
          raise exception 'd6c: the derived header carries a control character';
        end if;
        -- The SECRET must not be the thing on the wire. It is 64 hex and so is
        -- the mac, so this is a containment test rather than a shape test.
        if position(k_secret in v_hdr) > 0 then
          raise exception 'd6d: the header carries the key itself';
        end if;
        v_ran := v_ran || 'd6'::text;
      end if;

      -- ── d7: THE END-TO-END BINDING, where pg_net exists. The header the
      --        driver actually queued must bind the bytes it actually queued.
      --        This is the arm that proves `jsonb::text` and pg_net's own
      --        `convert_to(body::text,'UTF8')` are the same bytes, rather than
      --        asserting it in the header comment above.
      update public.hr_tick_config
         set enabled = true,
             edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/'
                        || 'hr-accrue-selfcheck-probe-does-not-exist' where id;
      select activity_id into v_act from public.hr_activities where kind = 'gather' limit 1;
      if v_act is null then
        raise notice 'd7 SKIPPED: no gather activity to point a probe at';
        v_skipped := v_skipped || 'd7(no gather activity)'::text;
      else
        insert into auth.users (id) values (v_u) on conflict do nothing;
        insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                         accrued_to, active_kind, active_id, active_since)
        values (v_u, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather', v_act,
                now() - interval '1 hour');
        insert into public.hr_tick_ownership (user_id, slot, channel, owned)
        values (v_u, 0, 'gather', true);
        v_r := public.hr_tick_cron_run();
        if v_r->>'outcome' <> 'posted' then
          raise notice 'd7 SKIPPED: the probe fire answered `%` rather than `posted` '
                       '(no Vault secret, or pg_net absent). The queue row could not be read.',
                       v_r->>'outcome';
          v_skipped := v_skipped || ('d7(' || (v_r->>'outcome') || ')')::text;
        else
          begin
            execute format(
              'select q.headers->>%L, encode(%I.digest(q.body, %L), %L)'
              '  from net.http_request_queue q order by q.id desc limit 1',
              'X-HR-Tick-Auth', v_schema, 'sha256', 'hex')
              into v_hdr, v_qsha;
          exception when others then
            v_hdr := null;
            raise notice 'd7 SKIPPED: net.http_request_queue could not be read in this pg_net build (%)', sqlerrm;
          end;
          if v_hdr is null then
            v_skipped := v_skipped || 'd7(queue unreadable)'::text;
          else
            if v_hdr !~ '^v1 t=[0-9]+ b=[0-9a-f]{64} m=[0-9a-f]{64}$' then
              raise exception 'd7: the queued header is not the T-5.3 shape: %', left(v_hdr, 12);
            end if;
            if substring(v_hdr from 'b=([0-9a-f]{64})') is distinct from v_qsha then
              raise exception 'd7b: the queued header binds a body that is not the queued body — '
                              'jsonb::text and pg_net''s own serialisation disagree';
            end if;
            v_ran := v_ran || 'd7'::text;
          end if;
        end if;
      end if;
    end if;

    -- ── d8: NO FIRE LOG ROW CARRIES A SECRET, A BEARER OR A MAC. The mac is not
    --        the secret, but it is a valid credential for one body for ≤90 s and
    --        the fire log is the operator's window — so the standard is "no
    --        64-hex run at all", which is stricter than the 2026-09-21 c8b and
    --        catches the mac as well as the bearer.
    if exists (select 1 from public.hr_tick_cron_log
                where detail::text ilike '%bearer %'
                   or detail::text ~ '[0-9a-f]{32,}') then
      raise exception 'd8: a cron log row carries something shaped like a bearer or a mac';
    end if;
    v_ran := v_ran || 'd8'::text;

    -- ── d8b: AND THE SAME PROPERTY STRUCTURALLY, BECAUSE d8 CANNOT SEE IT HERE.
    --        d8 reads rows, and on a database without pgcrypto the driver never
    --        reaches the posting branch, so no row that COULD carry a mac is
    --        ever written and d8 is green on a driver that journals one. (Proved:
    --        mutation MD4 — `'auth', v_auth` in the fire-log detail — passed d8
    --        on the replay.) This arm reads the installed body instead: every
    --        `hr_tick_cron_note(...)` argument list, taken together, must name
    --        neither the derived header nor a decrypted secret. It runs
    --        everywhere, and it is the half that bites on the replay.
    select coalesce(string_agg(m[1], ' '), '') into v_hex
      from regexp_matches(v_def, 'hr_tick_cron_note\(([^;]*?)\)\s*;', 'g') m;
    if v_hex = '' then
      raise exception 'd8b: no hr_tick_cron_note call found in the driver — the arm cannot see what it claims to';
    end if;
    if position('v_auth' in v_hex) > 0 or position('decrypted_secret' in v_hex) > 0 then
      raise exception 'd8b: the driver journals its derived header or a decrypted secret into hr_tick_cron_log';
    end if;
    v_ran := v_ran || 'd8b'::text;

    -- ── d10: THE FAIL-CLOSED GATE, FROM THE OTHER END (T-1). §0b refused the
    --         apply if this database is Supabase-shaped and cannot derive. This
    --         arm asserts the STATE THE APPLY LANDED IN is one of the two legal
    --         ones, which is the same predicate read backwards:
    --
    --           vault + crypto      -> the derivation runs; d4-d7 RAN
    --           no vault, no crypto -> the credential-free replay; d3 executed
    --                                  the `no_hmac` refusal
    --           vault, NO crypto    -> REFUSED AT §0b. Unreachable from here.
    --
    --         So it bites on exactly the defect T-1 names: delete §0b and the
    --         third state becomes reachable, and this raise is what finds it.
    --         It is also why §0a holds the ONLY copy of the resolution — the
    --         gate and this arm call the same function, so they cannot drift.
    if to_regclass('vault.decrypted_secrets') is not null and v_schema is null then
      raise exception 'd10: pgcrypto is unreachable on a database that has Vault, and the '
                      'apply still reached §5 — §0b''s fail-closed gate is gone (T-1)';
    end if;

    -- ── d10b: AND THE DRIVER'S HALF OF FAILING CLOSED, STRUCTURALLY — because
    --          d3 EXECUTES it only where pgcrypto is absent, which on production
    --          is nowhere. The refusal must exist, and it must be JOURNALLED the
    --          way `no_secret` is: an outcome that is returned but never written
    --          to `hr_tick_cron_log` is an outage with no operator surface.
    --          `v_hex` still holds every `hr_tick_cron_note(...)` argument list
    --          from d8b, which is the exact text that proves the journalling.
    if position('''no_hmac''' in v_def) = 0 then
      raise exception 'd10b: the driver carries no `no_hmac` refusal — the fire path does not fail closed';
    end if;
    if position('no_hmac' in v_hex) = 0 then
      raise exception 'd10c: the driver refuses `no_hmac` but never journals it into hr_tick_cron_log';
    end if;
    -- ...and the log will actually ACCEPT that outcome. §1 widens the CHECK; if
    -- it were ever narrowed back, the fail-closed path would itself raise on the
    -- insert and the driver would report `error` instead of the fixable outcome.
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = 'public.hr_tick_cron_log'::regclass
                      and c.conname = 'hr_tick_cron_log_outcome_ck'
                      and pg_get_constraintdef(c.oid) like '%no_hmac%') then
      raise exception 'd10d: hr_tick_cron_log_outcome_ck does not admit `no_hmac` — the fail-closed '
                      'path cannot journal its own outcome';
    end if;
    v_ran := v_ran || 'd10'::text;

    -- ── d11: THE REPLAY WINDOW, BOUND TO `flush_seconds` (T-2). R-T1's residual
    --         is ZERO rather than merely bounded only while the flush floor
    --         outlasts the token: *at `flush_seconds > 60` a verbatim replay
    --         settles nothing, because the flush floor refuses it; below that it
    --         can settle one window up to 60 s early, which is still not a double
    --         pay.* Security T-2 is that this sentence was true of the shipped
    --         row and written down NOWHERE, while the CHECK permits 10.
    --
    --         WHAT THIS ARM GATES AND WHAT IT DELIBERATELY DOES NOT. It gates the
    --         SCHEMA — the bucket width, the column DEFAULT, and the fact that the
    --         floor is still below the window — because those are this file's to
    --         keep true. It does NOT gate `hr_tick_config.flush_seconds` itself:
    --         that row is Reliability's row-volume lever, and a migration that
    --         refused to replay because an operator turned a dial would be a
    --         worse failure than the one T-2 names. The live value is NOTICED
    --         with its consequence spelled out instead, and it is the runbook's
    --         (P4) read that is meant to catch it before the apply.
    v_window_s := (k_skew + 1) * k_bucket_s;            -- 60 s of post-mint validity
    if position('/ ' || k_bucket_s::text || ')::bigint' in v_def) = 0 then
      raise exception 'd11a: the driver no longer derives its bucket on a %s width — the '
                      'replay window in R-T1 is arithmetic, not prose, and it just moved',
                      k_bucket_s;
    end if;
    select pg_get_expr(d.adbin, d.adrelid)::int into v_default
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.hr_tick_config'::regclass and a.attname = 'flush_seconds';
    if coalesce(v_default, 0) <= v_window_s then
      raise exception 'd11b: hr_tick_config.flush_seconds DEFAULTS to % s, which is not longer '
                      'than the token''s % s replay window — a fresh database would land on the '
                      'non-zero side of R-T1 by construction', v_default, v_window_s;
    end if;
    -- pg_get_constraintdef NORMALISES `between a and b` into `(x >= a) AND
    -- (x <= b)`, so the floor is read from the rendering and not from the
    -- source text. X-5c in tests/world-tick-token-leak.mjs parses the same
    -- shape from node, which is what keeps the two readings honest.
    select pg_get_constraintdef(c.oid) into v_cdef from pg_constraint c
     where c.conrelid = 'public.hr_tick_config'::regclass
       and c.conname = 'hr_tick_config_flush_ck';
    v_floor_s := (regexp_match(coalesce(v_cdef, ''), '>=\s*\(?([0-9]+)'))[1]::int;
    if v_floor_s is null then
      raise exception 'd11c: hr_tick_config_flush_ck could not be read (%) — the arm cannot '
                      'see what it claims to', coalesce(v_cdef, '<absent>');
    end if;
    if v_floor_s > v_window_s then
      raise exception 'd11c: hr_tick_config_flush_ck now floors flush_seconds at % s, above the '
                      '% s replay window — R-T1''s residual has become an INVARIANT rather than a '
                      'tunable, which is better news than this file says. Rewrite R-T1.',
                      v_floor_s, v_window_s;
    end if;
    if (select flush_seconds from public.hr_tick_config where id) <= v_window_s then
      raise notice 'd11 ★ R-T1 IS NON-ZERO ON THIS DATABASE: flush_seconds is at or below the '
                   '% s replay window, so a captured (header, body) pair CAN settle one window up '
                   'to % s early. It still cannot double-pay, name an unleased character or move a '
                   'watermark backwards. Raise flush_seconds above % to restore the zero residual.',
                   v_window_s, v_window_s, v_window_s;
    end if;
    v_ran := v_ran || 'd11'::text;

    raise notice 'world-tick-derived-token self-check: RAN [%]; SKIPPED [%]',
                 array_to_string(v_ran, ' '), coalesce(array_to_string(v_skipped, ' '), '');
    raise exception 'HR923_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR923_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-derived-token self-check PASSED; probe rows rolled back';
end $$;

-- ── §6 THE OPERATOR SECTION ────────────────────────────────────────────────
-- THE ORDER. Steps 1 and 4 are the seam: between them the tick posts nothing,
-- so there is never a build in existence that accepts both the static bearer and
-- the derived token. Do not skip step 1 to save ten seconds — skipping it is how
-- a rotation window becomes a debugging session.
--
--   1. STOP THE FIRES.  Takes effect on the next fire (≤10 s).
--        update public.hr_tick_config set enabled = false;
--        -- read it back, and read the log:
--        select enabled, shadow, edge_url from public.hr_tick_config;
--        select at, outcome, rostered, detail from public.hr_tick_cron_log
--          order by id desc limit 5;         -- EXPECT: `disabled` within 10 s
--
--   2. APPLY THIS FILE.  One file, never inside begin/commit, never 00:00–00:10
--      UTC, Coordinator only (CLAUDE.md §2):
--        node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-derived-token.sql
--      EXPECT the §5 notices to name d1 d2 d9 d4 d5 d6 d7 d8 d8b d10 d11 as RAN on
--      production. IF d4–d7 READ AS SKIPPED ON PRODUCTION, STOP: pgcrypto is not
--      reachable and the tick will answer `no_hmac` forever. The fix is
--      `create extension if not exists pgcrypto;` and a re-apply, not a re-arm.
--      ★ SINCE 2026-09-23 THAT STOP IS AN EXIT CODE, NOT A LINE TO READ
--        (Security T-1): §0b raises `HR_TICK_NO_PGCRYPTO` and apply-migration
--        fails, so a database that cannot derive CANNOT take this file at all.
--        The notice still names the skips, but you are no longer the gate.
--
--   3. DEPLOY THE EDGE HALF. Nothing works until both halves are the same
--      version — the driver sends `v1 t= b= m=` and only the new build reads it.
--        node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
--        cp supabase/config.toml <dir>/supabase/config.toml
--        npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
--          --project-ref nezapsylztqbbwuwembx
--        node tools/pack-edge.mjs hr-accrue --hash
--        curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue
--      The GET returns `payload_sha256`. IT MUST EQUAL `--hash`. The in-page
--      payload guard is red until they match, and a mismatch here means the
--      driver is posting a token the live build cannot read.
--
--   4. RE-ARM.
--        update public.hr_tick_config set enabled = true;
--
-- THE VERIFICATION READS, in order, and what each one means:
--
--   (a) THE FIRE LOG SAYS `posted` AND NAMES THE VERSION.
--         select at, outcome, rostered, effective_cadence_seconds,
--                detail->>'auth' as auth, detail->>'bucket' as bucket
--           from public.hr_tick_cron_log order by id desc limit 10;
--       EXPECT `posted` with auth = 'v1'. `no_hmac` means pgcrypto; `no_secret`
--       means the Vault secret is missing or under 32 chars; `error` means the
--       POST itself raised and `sqlstate` says why.
--
--   (b) ⚠ THE FIRE LOG CANNOT TELL YOU THE EDGE ACCEPTED IT. `net.http_post` is
--       ASYNCHRONOUS — it returns a request id, not a response — so a rejected
--       token still reads `posted`. THE ONLY HONEST READ IS THE RESPONSE TABLE:
--         select id, status_code, created
--           from net._http_response order by id desc limit 10;
--       EXPECT 200. A 401 means the two halves disagree: the driver is on the
--       derived token and the live build is not, or the Vault secret and
--       `HR_TICK_SHARED_SECRET` are different values. This is the trap the
--       rotation note in 2026-09-21-world-tick-cron.sql §3 documents, and it is
--       the single most expensive misread available during this cutover.
--
--   (c) THE SECRET IS NOT ON THE WIRE. The whole point, measured rather than
--       assumed. The bearer is 64 hex; so is the mac; so the test is whether the
--       QUEUED value is the VAULT value:
--         select count(*) as leaked
--           from net.http_request_queue q,
--                vault.decrypted_secrets s
--          where s.name = 'hr_tick_shared_secret'
--            and q.headers->>'X-HR-Tick-Auth' = s.decrypted_secret;
--       EXPECT 0. And the shape:
--         select left(q.headers->>'X-HR-Tick-Auth', 5) as tag
--           from net.http_request_queue q order by q.id desc limit 3;
--       EXPECT 'v1 t='. (Queue depth is normally 0 — the worker deletes the row
--       after the send — so an empty result is health, not a failure. Run it
--       inside the same second as a fire, or accept 0 rows.)
--
--   (d) THE SHADOW PARITY RUN IS STILL RUNNING. The cutover must not cost the
--       measurement M1 exists to take:
--         select count(*) as windows, max(at) as latest
--           from public.hr_tick_shadow where at > now() - interval '1 hour';
--       EXPECT a count that keeps climbing at roughly active/flush_seconds. A
--       count frozen at the cutover instant means step 3 or step 4 did not land.
--
-- THE KILL SWITCH — UNCHANGED BY THIS FILE, AND VERIFIED IN CODE (T-5.4):
--
--       update public.hr_tick_config set enabled = false;   -- USE THIS FIRST
--       select public.hr_cron_drop('hr-tick-run');          -- stops the driver
--
--   The first is a single-row UPDATE on a singleton (`id boolean primary key
--   check (id)`), takes effect on the next 10 s fire, and needs neither a
--   migration nor a deploy. Use it at any surprise and diagnose second.
--   `hr_cron_drop(text)` is `security definer set search_path = public`, returns
--   false rather than raising when the job is already gone, and is revoked from
--   public, anon, authenticated and service_role — NO CLIENT CAN STOP THE WORLD
--   TICK. After it the job is GONE, not paused; re-arm with
--     select public.hr_cron_ensure('hr-tick-run', '10 seconds',
--                                  'select public.hr_tick_cron_run()');
--   which is revoked the same way.
--
--   ROLLING BACK THIS FILE means re-applying 2026-09-21-world-tick-cron.sql
--   (which restates `hr_tick_cron_run` in its static form) and re-deploying the
--   previous hr-accrue payload. Both halves, in that order, behind the kill
--   switch — and it puts the T-5.3 block back, so M2 is blocked again.
