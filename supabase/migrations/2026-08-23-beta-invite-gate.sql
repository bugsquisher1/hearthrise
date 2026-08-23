-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-23-beta-invite-gate.sql — THE BETA INVITE GATE IS NOW ENFORCED
--
-- P0 access control. Security Engineer, 2026-08-23.
--
-- ── THE GAP THIS CLOSES (measured on production, not inferred) ──────────────
--
--   select count(*) from auth.users;                       -- 8
--   select count(*) from beta_invites where used_by is not null;  -- 3
--
-- Five of the eight live accounts — two of them real, non-Tyler players — were
-- created without consuming an invite. The closed beta was not closed.
--
-- The cause is that NOTHING on the server ever looked at an invite code during
-- account creation. What existed was:
--
--   · `beta_invite_check(text)`  — an ADVISORY, anon-callable read. It answers
--     "is this code valid" and changes nothing. src/settings-page.js called it
--     before signing up; skipping the call, or POSTing straight to
--     /auth/v1/signup, skipped the entire beta gate.
--   · `claim_beta_invite(text)`  — called AFTER sign-in, from the client, at
--     the client's discretion, from a localStorage stash. Nothing reads
--     `beta_invites.used_by` to grant or deny anything, so the "claim" was
--     decorative: an account that never claimed worked identically to one that
--     did.
--   · `src/net/account-gate.js`  — THE ACTUAL FRONT DOOR since the 2026-08-08
--     "accounts are required" ruling. It has no invite field at all and calls
--     `auth.signUp(email, password)` directly. Every account created through
--     the wall since b224 bypassed the gate without anyone doing anything
--     clever. That is the 5-of-8.
--
-- This is the recurring class named in CLAUDE.md: the server took the client's
-- word for whether the client was allowed in.
--
-- ── THE MECHANISM, AND WHY IT IS TWO LAYERS ────────────────────────────────
--
-- LAYER 1 — `public.hr_beta_gate_on_auth_user()`, an AFTER INSERT trigger on
--   `auth.users`. THIS IS THE AUTHORITY. It runs inside the same transaction as
--   the user row, so consuming the invite and creating the account commit or
--   roll back TOGETHER — a rejection here aborts the INSERT that fired it, and
--   the account does not exist. Consumption is a single statement —
--       update beta_invites set used_by = <new.id> where code = ? and used_by is null
--   — whose own `row_count` is the verdict, so "exactly one account per code"
--   is a property of the UPDATE rather than of a read-then-write the next
--   concurrent signup can interleave with. There is no path into `auth.users`
--   that skips a row trigger.
--
--   ⚠ AFTER, not BEFORE, and this was found by EXECUTING it rather than by
--   reading it. `beta_invites.used_by` carries
--   `FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL`, so a
--   BEFORE INSERT trigger that writes `used_by = new.id` violates that key
--   immediately — the user row does not exist yet. The first draft of this file
--   was BEFORE INSERT and failed its own self-check with a 23503. AFTER INSERT
--   is equally atomic (the exception aborts the statement that fired it) and is
--   the same hook point `on_auth_user_created` already uses. Do not "simplify"
--   it back to BEFORE.
--   A useful side effect of that same FK: deleting an account automatically
--   frees its invite code.
--
-- LAYER 2 — `public.hr_signup_gate(jsonb)`, registered as the Supabase
--   **before-user-created auth hook**. THIS IS THE PLAYER-FACING ERROR, and the
--   journal for refusals. It runs before any row is written and returns
--   `{error:{http_code, message}}`, which GoTrue propagates verbatim to the
--   browser — whereas a trigger exception surfaces only as a generic HTTP 500
--   "Database error saving new user". It deliberately **does not consume**:
--   the hook is not in the insert's transaction (the docs are explicit that the
--   user does not exist in Postgres when it runs), and GoTrue also invokes the
--   signup path for an email that already exists without inserting anything, so
--   a consuming hook would burn codes for accounts that were never created.
--
--   Neither layer is redundant. The hook alone is a config flag that can be
--   switched off in a dashboard and cannot consume atomically. The trigger
--   alone is airtight but mute. Registration of the hook is an OPS STEP, not a
--   migration — see §7.
--
-- ── WHAT IS DELIBERATELY *NOT* GATED ───────────────────────────────────────
-- Only `INSERT` on auth.users is gated, i.e. only NEW account creation.
-- Password reset, magic link, re-authentication, email change and token refresh
-- are all UPDATEs (or no DML at all) and are untouched. The 8 existing accounts
-- are untouched — an INSERT trigger never sees a row that already exists.
--
-- ── THE TWO BYPASSES, both unreachable from a browser ──────────────────────
--   (a) `session_user = 'postgres'` — the operator role. A migration, a psql
--       session, the SQL editor and the schema-replay harness all insert users
--       as `postgres`; gating them would break the rebuild chain and would
--       protect nothing, because anyone holding that role already owns the
--       database. Suppressible with
--       `set local hearthrise.invite_gate_force = 'yes'`, which is what this
--       file's own self-check uses to prove the refusal path for real.
--       NOTE the direction, twice over. (i) The bypass is a one-entry ALLOWLIST,
--       not "enforce only when session_user = 'supabase_auth_admin'": if
--       Supabase ever renames GoTrue's database role, this gate keeps
--       enforcing, where the other spelling would silently stop. (ii) It is
--       JOURNALLED, with the role name. GoTrue on this platform connects as
--       `supabase_auth_admin`, so a `bypass_operator` row carrying any other
--       role, at a time a player was signing up, is the alarm for the one
--       fail-open this design has — rather than an invisible one.
--       `supabase_admin` is deliberately NOT on the list even though it is an
--       operator role: it is the role realtime, pg_cron and pg_net connect as,
--       and a bypass list is a thing that must be as short as it can be.
--   (b) `raw_app_meta_data->>'hr_invite_bypass' = 'true'` — for the admin
--       createUser API. `app_metadata` is settable ONLY with the service role;
--       `supabase.auth.signUp({options:{data}})` writes `user_metadata` and can
--       never reach `app_metadata`. Both bypasses are journalled.
--
-- ── WHAT REMAINS OPEN (stated, not hidden) ─────────────────────────────────
-- The invite codes are LOW ENTROPY: `WORD-NNN`, and ten of the twenty are
-- `FRIEND-0NN`. That is enumerable, and `beta_invite_check` is an anon-callable
-- oracle for it. This file adds a per-IP failure brake and journals every
-- refusal so enumeration is DETECTABLE, but it cannot make a guessable secret
-- unguessable. The real fix is rotation to high-entropy codes; the statement is
-- in §8's operator notes. Left to Tyler because the twenty codes are about to
-- be sent and this migration must not invalidate them.
--
-- ── FREEING A CODE (operator) ──────────────────────────────────────────────
-- A player who signs up and never confirms their email has burned their code.
-- To release it:
--     update public.beta_invites set used_by = null, used_at = null
--      where code = 'THE-CODE';
--     insert into public.beta_signup_log (outcome, code, user_id)
--       values ('released', 'THE-CODE', null);
--
-- IDEMPOTENT + ADDITIVE. Safe to re-apply. Creates nothing a client can call.
--
-- NO `begin;`/`commit;` in this file (repo rule S5 — a migration does not control
-- its own transaction; the applier does). §7 therefore ends by asserting that
-- auth.users and the consumed-invite count are EXACTLY as it found them, so a
-- half-run apply is loud rather than residual. Apply it inside a transaction.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §0 · PREFLIGHT — fail closed ───────────────────────────────────────────
do $$
begin
  if to_regclass('public.beta_invites') is null then
    raise exception 'beta-invite-gate: public.beta_invites does not exist — apply 2026-08-10-dr-beta-invites-base.sql first';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'beta-invite-gate: auth.users does not exist';
  end if;
  -- The three columns the gate reads/writes. A rename would otherwise surface
  -- as a runtime signup outage rather than as a failed migration.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='beta_invites' and column_name='code')
  or not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='beta_invites' and column_name='used_by')
  or not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='beta_invites' and column_name='used_at') then
    raise exception 'beta-invite-gate: beta_invites is missing code/used_by/used_at';
  end if;
end $$;

-- One account per code has to be a CONSTRAINT, not a convention. Without this a
-- future hand-edit (or a second gate written by someone who did not read this
-- file) can point two users at one code and nothing complains.
create unique index if not exists beta_invites_used_by_uniq
  on public.beta_invites (used_by) where used_by is not null;

-- Code lookup is on every signup and on every enumeration attempt; make the
-- normalised match indexed rather than a seq scan over the code list.
create unique index if not exists beta_invites_code_norm_uniq
  on public.beta_invites (upper(btrim(code)));


-- ── §1 · NORMALISATION — one spelling of "the same code" ───────────────────
-- Players retype codes out of Discord with a trailing space and in whatever
-- case their keyboard felt like. The client uppercases; the server must not
-- TRUST that it did, and must agree with itself between the hook and the
-- trigger. One function, called from both.
-- BOUNDED at 64 characters, deliberately. `invite_code` is client-supplied text
-- of unlimited length, and the refusal path WRITES it to beta_signup_log — so
-- without a bound a 10 MB "code" is a 10 MB journal row, repeatable at whatever
-- rate GoTrue's own signup limiter allows. The longest real code is 11
-- characters, and no truncation of a longer string can collide with one, so the
-- bound costs nothing and closes an unbounded write.
create or replace function public.hr_beta_code_norm(p_code text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select nullif(left(upper(btrim(coalesce(p_code, ''))), 64), '')
$$;
revoke execute on function public.hr_beta_code_norm(text) from public, anon, authenticated;


-- ── §2 · THE JOURNAL — abuse must be detectable AND reversible ─────────────
-- Standing rule: every shared-surface write is journalled. Access to the beta
-- IS a shared surface — a burned code is a seat somebody else does not get.
--
-- ⚠ THE HONEST LIMIT, because silence about it is how the last audit passed:
--   a refusal raised by the TRIGGER aborts its transaction, which discards any
--   journal row written in it. Refusals are therefore journalled by the HOOK,
--   which runs in its own call. If the hook is ever un-registered, enforcement
--   survives (the trigger) but refusal VISIBILITY does not. That is exactly why
--   §7 makes hook registration a checked ops gate rather than a nice-to-have.
create table if not exists public.beta_signup_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  outcome      text        not null,   -- granted|refused_missing|refused_unknown|refused_used|refused_throttled|bypass_operator|bypass_admin|released
  code         text,                   -- normalised, as presented (may be a guess)
  user_id      uuid,                   -- set only where an account actually resulted
  ip           text,
  email_domain text,                   -- domain only; the address itself is already in auth.users
  detail       jsonb
);
create index if not exists beta_signup_log_at_idx      on public.beta_signup_log (at desc);
create index if not exists beta_signup_log_outcome_idx on public.beta_signup_log (outcome, at desc);
create index if not exists beta_signup_log_ip_idx      on public.beta_signup_log (ip, at desc) where ip is not null;

alter table public.beta_signup_log enable row level security;
-- No policy, deliberately. RLS-on + zero policies = PostgREST serves nothing to
-- anon/authenticated no matter what it is asked, and the grants below mean the
-- request never reaches a policy anyway. Two independent locks.
revoke all on table public.beta_signup_log from anon, authenticated;
revoke all on table public.beta_signup_log from public;

-- Append-only, enforced rather than promised. Same shape as player_ledger:
-- UPDATE and TRUNCATE are always refused; DELETE only for rows old enough to be
-- beyond any dispute, so retention is possible and history is not editable.
create or replace function public.hr_beta_signup_log_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'beta_signup_log is append-only (UPDATE refused)';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'beta_signup_log is append-only (TRUNCATE refused)';
  elsif tg_op = 'DELETE' then
    if old.at > now() - interval '180 days' then
      raise exception 'beta_signup_log is append-only (DELETE refused for rows newer than 180 days)';
    end if;
    return old;
  end if;
  return null;
end $$;
revoke execute on function public.hr_beta_signup_log_immutable() from public, anon, authenticated;

drop trigger if exists beta_signup_log_no_update on public.beta_signup_log;
create trigger beta_signup_log_no_update
  before update or delete on public.beta_signup_log
  for each row execute function public.hr_beta_signup_log_immutable();

drop trigger if exists beta_signup_log_no_truncate on public.beta_signup_log;
create trigger beta_signup_log_no_truncate
  before truncate on public.beta_signup_log
  for each statement execute function public.hr_beta_signup_log_immutable();


-- ── §3 · THE RULE, in one place ────────────────────────────────────────────
-- Returns NULL when the code may be used, else a machine reason. The hook and
-- the trigger both read this, so they cannot disagree about what "valid" means.
create or replace function public.hr_beta_gate_reason(p_code text)
returns text language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_norm text; v_used uuid; v_found boolean;
begin
  v_norm := public.hr_beta_code_norm(p_code);
  if v_norm is null then return 'invite_required'; end if;
  select b.used_by, true into v_used, v_found
    from public.beta_invites b
   where upper(btrim(b.code)) = v_norm;
  -- ⚠ `coalesce`, and it is load-bearing. `select … into` sets EVERY target to
  --   NULL when no row matches — including the literal `true` — so `v_found` is
  --   NULL, not false, and `if not v_found` is `not NULL` = NULL, which does not
  --   take the branch. The first version of this function initialised
  --   `v_found boolean := false` and believed that was enough; the INTO
  --   overwrites the initialiser. The result was that an UNKNOWN code fell
  --   through to `return null` — i.e. the hook said "valid" for FRIEND-999.
  --   Caught by firing a real signup at the live endpoint, not by reading this;
  --   the trigger refused it anyway (its UPDATE matched 0 rows), which is what
  --   two independent layers are for. Asserted now in §7's checks 6-9.
  if not coalesce(v_found, false) then return 'invite_unknown'; end if;
  if v_used is not null then return 'invite_used'; end if;
  return null;
end $$;
revoke execute on function public.hr_beta_gate_reason(text) from public, anon, authenticated;

-- The copy lives next to the rule, because a player-facing message that drifts
-- from the reason it describes is its own bug. Prose here and NOT machine codes
-- is a deliberate exception to the error-taxonomy rule: GoTrue hands this string
-- straight to the browser, and the browser cannot localise a code it never
-- receives structured.
create or replace function public.hr_beta_gate_message(p_reason text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case p_reason
    when 'invite_required'  then 'Hearthrise is in closed beta. Enter the invite code you were sent to create an account.'
    when 'invite_unknown'   then 'That invite code was not recognised. Check it for typos — codes look like FRIEND-001 — or ask in the Discord.'
    when 'invite_used'      then 'That invite code has already been used. Each code creates one account. If this was you, sign in instead.'
    when 'refused_throttled' then 'Too many invite attempts from this connection. Wait an hour and try again.'
    else 'That invite code cannot be used right now.'
  end
$$;
revoke execute on function public.hr_beta_gate_message(text) from public, anon, authenticated;


-- ── §4 · LAYER 2 — the before-user-created auth hook ───────────────────────
-- Read-only with respect to beta_invites. Its jobs are (a) refuse early with a
-- message a player can act on, and (b) journal, since the trigger structurally
-- cannot journal its own refusals.
--
-- The per-IP brake exists because the code space is guessable (see the header).
-- It counts FAILURES only — a valid code is never refused by it — because the
-- alternative locks a fat-fingering player, or a whole CGNAT range, out of a
-- 20-seat beta to slow an attacker who can rent another IP for a cent. 30
-- failures/hour/IP is far outside human error and squarely inside enumeration.
create or replace function public.hr_signup_gate(event jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  c_fail_limit  constant int := 30;
  v_code   text;
  v_ip     text;
  v_email  text;
  v_domain text;
  v_reason text;
begin
  v_code  := public.hr_beta_code_norm(event #>> '{user,user_metadata,invite_code}');
  v_ip    := nullif(btrim(coalesce(event #>> '{metadata,ip_address}', '')), '');
  v_email := lower(nullif(btrim(coalesce(event #>> '{user,email}', '')), ''));
  v_domain := nullif(split_part(coalesce(v_email, ''), '@', 2), '');

  -- The admin bypass, read from app_metadata, which no client can write.
  if coalesce(event #>> '{user,app_metadata,hr_invite_bypass}', '') = 'true' then
    insert into public.beta_signup_log (outcome, code, ip, email_domain, detail)
      values ('bypass_admin', v_code, left(coalesce(v_ip,''), 64), v_domain,
              jsonb_build_object('layer', 'hook'));
    return '{}'::jsonb;
  end if;

  v_reason := public.hr_beta_gate_reason(v_code);

  if v_reason is null then
    -- Allowed. Not journalled here: the account does not exist yet and may still
    -- fail for an unrelated reason. The TRIGGER writes the 'granted' row, in the
    -- transaction that actually creates the account, with the real user id.
    return '{}'::jsonb;
  end if;

  -- A failure. Spend a token from this IP's hourly failure budget; once it is
  -- gone every further FAILED attempt is answered generically, so the oracle
  -- stops distinguishing "unknown" from "already used" for a caller who is
  -- clearly guessing.
  if v_ip is not null
     and not public.hr_rate_ok(md5('beta-signup-ip:' || v_ip)::uuid,
                               'signup:invite_fail', c_fail_limit, interval '1 hour') then
    v_reason := 'refused_throttled';
  end if;

  insert into public.beta_signup_log (outcome, code, ip, email_domain, detail)
    values ('refused_' || replace(v_reason, 'invite_', ''), v_code,
            left(coalesce(v_ip,''), 64), v_domain,
            jsonb_build_object('layer', 'hook', 'reason', v_reason));

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message',   public.hr_beta_gate_message(v_reason)));
exception when others then
  -- FAIL CLOSED. A hook that throws is a hook GoTrue cannot interpret, and the
  -- one thing that must never happen is "the gate broke, so everybody is in".
  -- The trigger would still refuse, but a 500 with no explanation is worse for
  -- the player than a 403 with one.
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message',   'Account creation is temporarily unavailable. Please try again shortly.'));
end $$;
revoke execute on function public.hr_signup_gate(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hr_signup_gate(jsonb) to supabase_auth_admin';
  else
    raise notice 'beta-invite-gate: no supabase_auth_admin role (replay harness) — hook grant skipped';
  end if;
end $$;


-- ── §5 · LAYER 1 — the authority ───────────────────────────────────────────
-- AFTER INSERT on auth.users (see the header for why AFTER and not BEFORE).
-- Consumption and account creation are one transaction; there is no window in
-- which one happened and the other did not.
--
-- Metadata is read through `to_jsonb(new)` rather than `new.raw_user_meta_data`
-- so the function is column-shape agnostic: the schema-replay fixture's
-- auth.users is (id, email) only, and a body that named a missing column would
-- fail the rebuild chain at runtime instead of at parse time.
create or replace function public.hr_beta_gate_on_auth_user()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_row    jsonb := to_jsonb(new);
  v_code   text;
  v_reason text;
  v_hit    int;
  v_forced boolean := coalesce(current_setting('hearthrise.invite_gate_force', true), '') = 'yes';
begin
  -- (a) operator bypass — see the header. A one-entry allowlist, and JOURNALLED
  --     so that a fail-open (GoTrue arriving as an unexpected role) is a row
  --     somebody can query rather than a silence.
  if session_user = 'postgres' and not v_forced then
    insert into public.beta_signup_log (outcome, user_id, detail)
      values ('bypass_operator', new.id,
              jsonb_build_object('layer', 'trigger', 'session_user', session_user));
    return new;
  end if;

  -- (b) admin-API bypass — app_metadata is service-role-only.
  if coalesce(v_row #>> '{raw_app_meta_data,hr_invite_bypass}', '') = 'true' then
    insert into public.beta_signup_log (outcome, user_id, detail)
      values ('bypass_admin', new.id, jsonb_build_object('layer', 'trigger'));
    return new;
  end if;

  v_code := public.hr_beta_code_norm(v_row #>> '{raw_user_meta_data,invite_code}');

  -- THE CONSUME. One statement. `used_by is null` in the WHERE clause is what
  -- makes "one account per code" true under concurrency — two simultaneous
  -- signups on one code cannot both match, because the second blocks on the
  -- first's row lock and then re-evaluates the predicate against the committed
  -- row. A select-then-update would let both through.
  if v_code is not null then
    update public.beta_invites b
       set used_by = new.id, used_at = now()
     where upper(btrim(b.code)) = v_code
       and b.used_by is null;
    get diagnostics v_hit = row_count;
    if v_hit = 1 then
      insert into public.beta_signup_log (outcome, code, user_id, detail)
        values ('granted', v_code, new.id, jsonb_build_object('layer', 'trigger'));
      return new;
    end if;
  end if;

  v_reason := coalesce(public.hr_beta_gate_reason(v_code), 'invite_used');
  raise exception '%', public.hr_beta_gate_message(v_reason)
    using errcode = 'P0001', hint = v_reason;
end $$;
revoke execute on function public.hr_beta_gate_on_auth_user() from public, anon, authenticated;

drop trigger if exists hr_beta_invite_gate on auth.users;
create trigger hr_beta_invite_gate
  after insert on auth.users
  for each row execute function public.hr_beta_gate_on_auth_user();


-- ── §6 · NEUTER THE POST-HOC CLAIM RPC ─────────────────────────────────────
-- `claim_beta_invite(text)` was executable by `authenticated` and burned an
-- unused code for whoever called it, at 12/minute, granting the caller nothing.
-- Any one of the eight existing accounts could have destroyed all seventeen
-- unsent invitations in about ninety seconds. It is superseded outright — the
-- code is now consumed by the trigger at account creation — so the grant goes.
-- The function is kept (dropping it would break 2026-08-10-dr-beta-invites-base's
-- own preflight and the A9 wrapper chain) but is left reachable by nobody.
revoke execute on function public.claim_beta_invite(text) from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.claim_beta_invite__ungated(text)') is not null then
    execute 'revoke execute on function public.claim_beta_invite__ungated(text) from public, anon, authenticated';
  end if;
end $$;

-- The client-RPC baseline must agree, or the nightly detector reports a
-- "baseline row no longer live" for a grant we deliberately removed.
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    delete from public.hr_client_rpc_baseline
     where proname in ('claim_beta_invite', 'claim_beta_invite__ungated');
  end if;
end $$;


-- ── §7 · SELF-CHECK — behavioural, executed here, then undone ─────────────
-- Every claim this file makes is exercised against the real functions and the
-- real trigger, in this transaction, and rolled back to nothing.
--
-- IT BRINGS ITS OWN INVITE CODE. An earlier draft probed with "the first unused
-- row in beta_invites", which (a) briefly consumed one of Tyler's real codes and
-- (b) made the migration UNAPPLIABLE on a rebuilt database, where beta_invites
-- is empty — caught by tests/schema-replay.mjs, not by reading it. A self-check
-- that depends on ambient data is a self-check that fails for reasons that have
-- nothing to do with what it is testing.
--
-- IT FORCES ENFORCEMENT. This session is `postgres`, which §5(a) waves through.
-- Without `hearthrise.invite_gate_force` every assertion below would pass
-- against a gate that does nothing — the always-null-probe shape. Verified by
-- mutation: set it to 'no' and check 8 fails.
do $$
declare
  c_u1    constant uuid := '00000000-dead-4bee-8000-000000000001';
  c_u2    constant uuid := '00000000-dead-4bee-8000-000000000002';
  c_u3    constant uuid := '00000000-dead-4bee-8000-000000000003';
  c_probe constant text := 'ZZSELFCHECK-000';
  c_ip    constant text := '203.0.113.7';
  v_has_meta boolean;
  v_users0 bigint; v_inv0 bigint; v_used0 bigint; v_log0 bigint;
  v_users1 bigint; v_inv1 bigint; v_used1 bigint; v_log1 bigint;
  v_r     text;
  v_out   jsonb;
  v_owner uuid;
  v_ok    boolean;
  v_msg   text;
  v_n     int;
begin
  perform set_config('hearthrise.invite_gate_force', 'yes', true);

  select count(*) into v_users0 from auth.users;
  select count(*) into v_inv0   from public.beta_invites;
  select count(*) into v_used0  from public.beta_invites where used_by is not null;
  select count(*) into v_log0   from public.beta_signup_log;

  v_has_meta := exists (select 1 from information_schema.columns
                         where table_schema='auth' and table_name='users'
                           and column_name='raw_user_meta_data');

  if exists (select 1 from public.beta_invites where upper(btrim(code)) = c_probe) then
    raise exception 'beta-invite-gate SELF-CHECK: the probe code % already exists as a real invite', c_probe;
  end if;
  insert into public.beta_invites (code, note)
    values (c_probe, 'self-check probe - removed before this migration ends');

  -- ══ THE RULE, on every input class ═════════════════════════════════════
  -- (1) absent / blank
  v_r := public.hr_beta_gate_reason(null);
  if v_r is distinct from 'invite_required' then
    raise exception 'SELF-CHECK 1 FAILED: null code -> % (want invite_required)', v_r;
  end if;
  v_r := public.hr_beta_gate_reason('   ');
  if v_r is distinct from 'invite_required' then
    raise exception 'SELF-CHECK 1 FAILED: blank code -> % (want invite_required)', v_r;
  end if;

  -- (2) UNKNOWN. This is the one that shipped broken for four minutes on
  --     2026-08-23: `select … into` sets every target to NULL when no row
  --     matches, so the `v_found` flag was NULL, `if not v_found` did not
  --     branch, and an unknown code came back "allowed". See §3.
  v_r := public.hr_beta_gate_reason('NO-SUCH-CODE-9Q7X');
  if v_r is distinct from 'invite_unknown' then
    raise exception 'SELF-CHECK 2 FAILED: UNKNOWN code -> % (want invite_unknown) - the select-into-NULL fail-open is back', v_r;
  end if;

  -- (3) a VALID code, presented lower-cased and padded: normalisation is under
  --     test too. A gate that refused everything would pass 1 and 2.
  v_r := public.hr_beta_gate_reason('  ' || lower(c_probe) || ' ');
  if v_r is not null then
    raise exception 'SELF-CHECK 3 FAILED: a VALID code was refused (%) - normalisation is broken', v_r;
  end if;

  -- ══ THE HOOK, asked on its own ═════════════════════════════════════════
  -- The trigger refuses the same calls for its own reasons, so a hook that
  -- failed open would be INVISIBLE to the trigger checks below — which is
  -- exactly how (2) shipped. Ask it directly.
  -- (4) codeless
  v_out := public.hr_signup_gate(jsonb_build_object(
             'metadata', jsonb_build_object('ip_address', c_ip),
             'user', jsonb_build_object('email','probe@invalid.test','user_metadata','{}'::jsonb)));
  if v_out -> 'error' is null then
    raise exception 'SELF-CHECK 4 FAILED: the hook ALLOWED a codeless signup';
  end if;

  -- (5) unknown, with the right sentence
  v_out := public.hr_signup_gate(jsonb_build_object(
             'metadata', jsonb_build_object('ip_address', c_ip),
             'user', jsonb_build_object('email','probe@invalid.test',
                       'user_metadata', jsonb_build_object('invite_code','NO-SUCH-CODE-9Q7X'))));
  if v_out -> 'error' is null then
    raise exception 'SELF-CHECK 5 FAILED: the hook ALLOWED an unknown invite code';
  end if;
  if v_out #>> '{error,message}' not like '%not recognised%' then
    raise exception 'SELF-CHECK 5 FAILED: unknown code got the wrong message: %', v_out #>> '{error,message}';
  end if;

  -- (6) valid -> allowed, AND the hook consumed nothing. The hook must not
  --     consume: it does not run in the insert's transaction, and GoTrue calls
  --     the signup path for an already-registered email without inserting.
  v_out := public.hr_signup_gate(jsonb_build_object(
             'metadata', jsonb_build_object('ip_address', c_ip),
             'user', jsonb_build_object('email','probe@invalid.test',
                       'user_metadata', jsonb_build_object('invite_code', lower(c_probe)))));
  if v_out -> 'error' is not null then
    raise exception 'SELF-CHECK 6 FAILED: the hook REFUSED a valid code: %', v_out #>> '{error,message}';
  end if;
  if exists (select 1 from public.beta_invites where upper(btrim(code)) = c_probe and used_by is not null) then
    raise exception 'SELF-CHECK 6 FAILED: the hook CONSUMED a code - it must only read';
  end if;

  -- (7) the admin bypass is honoured from app_metadata, and ONLY from there.
  --     `supabase.auth.signUp({options:{data}})` writes user_metadata and can
  --     never reach app_metadata, so the negative half is the one that matters:
  --     a client that puts hr_invite_bypass in its own metadata gets nothing.
  v_out := public.hr_signup_gate(jsonb_build_object(
             'metadata', jsonb_build_object('ip_address', c_ip),
             'user', jsonb_build_object('email','probe@invalid.test',
                       'app_metadata', jsonb_build_object('hr_invite_bypass','true'),
                       'user_metadata','{}'::jsonb)));
  if v_out -> 'error' is not null then
    raise exception 'SELF-CHECK 7 FAILED: the app_metadata admin bypass was refused';
  end if;
  v_out := public.hr_signup_gate(jsonb_build_object(
             'metadata', jsonb_build_object('ip_address', c_ip),
             'user', jsonb_build_object('email','probe@invalid.test',
                       'user_metadata', jsonb_build_object('hr_invite_bypass','true'))));
  if v_out -> 'error' is null then
    raise exception 'SELF-CHECK 7 FAILED: a CLIENT-SETTABLE hr_invite_bypass in user_metadata opened the gate';
  end if;

  -- ══ THE TRIGGER — the authority ════════════════════════════════════════
  -- (8) a signup-shaped insert with NO invite code is refused, and leaves nothing.
  v_ok := false;
  begin
    insert into auth.users (id, email) values (c_u1, 'probe1@invalid.test');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then
    raise exception 'SELF-CHECK 8 FAILED: an account with NO invite code was created';
  end if;
  if exists (select 1 from auth.users where id = c_u1) then
    raise exception 'SELF-CHECK 8 FAILED: the refused account exists anyway';
  end if;
  raise notice 'self-check 1-8 OK - rule, hook and trigger all refuse (trigger said: %)', v_msg;

  if not v_has_meta then
    raise notice 'beta-invite-gate: auth.users has no raw_user_meta_data (replay fixture) - '
                 'checks 9-12 need that column and run on the real database only';
  else
    -- (9) a garbage code is refused by the trigger too.
    v_ok := false;
    begin
      execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                     c_u1, 'probe1@invalid.test', jsonb_build_object('invite_code','NO-SUCH-CODE-9Q7X')::text);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception 'SELF-CHECK 9 FAILED: a forged invite code created an account';
    end if;

    -- (9b) THE BYPASS CANNOT BE FORGED BY THE CLIENT. `raw_user_meta_data` is
    --      whatever the browser put in `signUp({options:{data}})`; if the
    --      trigger read the bypass flag from THERE instead of from
    --      `raw_app_meta_data`, one extra field in the signup body would skip
    --      the whole gate. That is a total bypass, and it is a one-word edit
    --      away — so it gets its own assertion. Found by mutating the trigger
    --      to read the wrong metadata bag and watching every other check in
    --      this file still pass.
    v_ok := false;
    begin
      execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                     c_u1, 'probe1@invalid.test',
                     jsonb_build_object('hr_invite_bypass','true')::text);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception 'SELF-CHECK 9b FAILED: a CLIENT-SETTABLE hr_invite_bypass in user_metadata created an account - '
                      'the trigger is reading the wrong metadata bag and the gate is fully bypassable';
    end if;
    if exists (select 1 from auth.users where id = c_u1) then
      raise exception 'SELF-CHECK 9b FAILED: the refused account exists anyway';
    end if;

    -- (10) a VALID code creates the account AND consumes exactly once, together.
    execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                   c_u2, 'probe2@invalid.test',
                   jsonb_build_object('invite_code', '  ' || lower(c_probe) || ' ')::text);
    select used_by into v_owner from public.beta_invites where upper(btrim(code)) = c_probe;
    if v_owner is distinct from c_u2 then
      raise exception 'SELF-CHECK 10 FAILED: a valid code did not consume (owner=%)', v_owner;
    end if;
    select count(*) into v_n from public.beta_signup_log where user_id = c_u2 and outcome = 'granted';
    if v_n <> 1 then
      raise exception 'SELF-CHECK 10 FAILED: expected exactly 1 journal row, saw %', v_n;
    end if;
    select count(*) into v_used1 from public.beta_invites where used_by is not null;
    if v_used1 <> v_used0 + 1 then
      raise exception 'SELF-CHECK 10 FAILED: consumed % codes, expected 1', v_used1 - v_used0;
    end if;

    -- (11) the rule now reports it as used...
    v_r := public.hr_beta_gate_reason(c_probe);
    if v_r is distinct from 'invite_used' then
      raise exception 'SELF-CHECK 11 FAILED: a consumed code -> % (want invite_used)', v_r;
    end if;

    -- (12) ...and a REPLAY of it cannot create a second account.
    v_ok := false;
    begin
      execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                     c_u3, 'probe3@invalid.test', jsonb_build_object('invite_code', c_probe)::text);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception 'SELF-CHECK 12 FAILED: the same code created a SECOND account';
    end if;
    if exists (select 1 from auth.users where id = c_u3) then
      raise exception 'SELF-CHECK 12 FAILED: the refused account exists anyway';
    end if;
    select used_by into v_owner from public.beta_invites where upper(btrim(code)) = c_probe;
    if v_owner is distinct from c_u2 then
      raise exception 'SELF-CHECK 12 FAILED: the refused replay disturbed the first owner (%)', v_owner;
    end if;
    raise notice 'self-check 9-12 OK - one code, one account, replay refused';
  end if;

  -- ══ UNDO, AND PROVE THE UNDO ═══════════════════════════════════════════
  -- Release before deleting the user: `used_by` is ON DELETE SET NULL, so the
  -- delete would null it for us but leave `used_at` stamped - a row that reads
  -- "never used" to the gate and "used at 05:41" to a human.
  update public.beta_invites set used_by = null, used_at = null where used_by in (c_u1, c_u2, c_u3);
  delete from auth.users where id in (c_u1, c_u2, c_u3);              -- profiles cascade
  delete from public.beta_invites where upper(btrim(code)) = c_probe;
  -- The journal rows above are real and younger than 180 days, so §2's
  -- immutability trigger refuses to delete them. That refusal is itself the
  -- proof the journal is enforced; it is lifted for this transaction only, which
  -- needs table ownership - no client role has it.
  alter table public.beta_signup_log disable trigger beta_signup_log_no_update;
  delete from public.beta_signup_log
   where user_id in (c_u1, c_u2, c_u3) or ip = c_ip or code = c_probe;
  alter table public.beta_signup_log enable trigger beta_signup_log_no_update;

  select count(*) into v_users1 from auth.users;
  select count(*) into v_inv1   from public.beta_invites;
  select count(*) into v_used1  from public.beta_invites where used_by is not null;
  select count(*) into v_log1   from public.beta_signup_log;
  if v_users1 <> v_users0 or v_inv1 <> v_inv0 or v_used1 <> v_used0 or v_log1 <> v_log0 then
    raise exception 'SELF-CHECK 13 FAILED: probe residue survived - users %->%, invites %->%, consumed %->%, journal %->%',
                    v_users0, v_users1, v_inv0, v_inv1, v_used0, v_used1, v_log0, v_log1;
  end if;
  raise notice 'self-check 13 OK - users %, invites % (% consumed), journal % : exactly as found',
               v_users1, v_inv1, v_used1, v_log1;
end $$;

-- ── §8 · STRUCTURAL ASSERTIONS — the gate is actually attached ─────────────
do $$
declare v_report jsonb;
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'users' and c.relnamespace = 'auth'::regnamespace
       and t.tgname = 'hr_beta_invite_gate' and not t.tgisinternal and t.tgenabled = 'O'
       -- tgtype bit 0 = ROW, bit 2 = INSERT, bit 1 = BEFORE. Assert ROW+INSERT
       -- and NOT BEFORE, so a well-meaning "before is surely safer" edit fails
       -- the migration instead of failing every signup with a 23503.
       and (t.tgtype & 1) = 1 and (t.tgtype & 4) = 4 and (t.tgtype & 2) = 0) then
    raise exception 'beta-invite-gate: the AFTER INSERT row trigger is not attached and enabled on auth.users';
  end if;

  if has_function_privilege('anon', 'public.claim_beta_invite(text)', 'execute')
  or has_function_privilege('authenticated', 'public.claim_beta_invite(text)', 'execute') then
    raise exception 'beta-invite-gate: claim_beta_invite is still client-callable — it burns invite codes for free';
  end if;

  if has_function_privilege('anon', 'public.hr_signup_gate(jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_signup_gate(jsonb)', 'execute') then
    raise exception 'beta-invite-gate: hr_signup_gate must not be client-callable';
  end if;

  -- beta_invite_check stays anon-callable ON PURPOSE — the sign-up form checks a
  -- code before it submits, and that pre-check is the only way a player learns
  -- WHY their code was rejected before creating anything. Asserted so a future
  -- lockdown that revokes it fails here instead of in a player's browser.
  if not has_function_privilege('anon', 'public.beta_invite_check(text)', 'execute') then
    raise exception 'beta-invite-gate: beta_invite_check must stay anon-callable — the signup form pre-checks with it';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    execute 'select public.hr_assert_grant_hygiene(true)' into v_report;
    raise notice 'grant hygiene after beta-invite-gate: %', v_report;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- §9 · OPS STEPS THIS FILE CANNOT PERFORM — DO NOT SKIP
--
-- 1. REGISTER THE HOOK. Auth configuration is not in the database. Until this
--    runs, the trigger still refuses ungated signups but the player sees a bare
--    HTTP 500 instead of a sentence.
--
--      curl -sS -X PATCH \
--        "https://api.supabase.com/v1/projects/<PROJECT_REF>/config/auth" \
--        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--        -H "Content-Type: application/json" \
--        -d '{"hook_before_user_created_enabled": true,
--             "hook_before_user_created_uri": "pg-functions://postgres/public/hr_signup_gate"}'
--
--    Verify with tests/beta-invite-gate.mjs --live.
--
-- 2. RECOMMENDED, NOT DONE HERE — rotate to high-entropy codes. `WORD-NNN` is
--    guessable and beta_invite_check is an anon oracle. Once Tyler is ready to
--    hand out fresh codes:
--
--      update public.beta_invites
--         set code = 'HR-' || upper(encode(gen_random_bytes(8), 'hex'))
--       where used_by is null;
--
--    Do NOT run this after the current twenty have been sent.
-- ════════════════════════════════════════════════════════════════════════════

-- The file must END on a statement, not on a comment banner — tests/run-smoke's
-- SQL-terminator guard says so, and it is right: a trailing comment is how a
-- half-copied migration ends up looking complete. This one earns its place by
-- naming the step the SQL genuinely cannot take, in the apply log, where whoever
-- ran it is looking.
do $$
begin
  raise notice 'beta-invite-gate: APPLIED. The closed beta is now enforced at auth.users.';
  raise notice 'REMAINING OPS STEP: register the before-user-created hook '
               '(pg-functions://postgres/public/hr_signup_gate). Without it the gate still '
               'REFUSES ungated signups, but the player sees a bare HTTP 500 instead of a '
               'sentence. Verify with: node tests/beta-invite-gate.mjs --live';
end $$;
