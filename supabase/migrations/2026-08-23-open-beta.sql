-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-23-open-beta.sql — THE INVITE GATE BECOMES A SWITCH, AND THE SWITCH
--                            IS SET TO OFF.
--
-- Backend Architect, 2026-08-23. Successor to 2026-08-23-beta-invite-gate.sql
-- (b457). Read that file first — this one restates three of its bodies and
-- deliberately preserves the rest of its design verbatim.
--
--     TO CLOSE THE BETA AGAIN, ONE STATEMENT:
--         update public.hr_settings set value = 'on' where key = 'beta_gate';
--     (and to re-open: `set value = 'off'`. Nothing else moves. No migration,
--      no deploy, no client change — the gate reads this row on every signup.)
--
-- ── WHAT CHANGES, IN ONE PARAGRAPH ─────────────────────────────────────────
-- b457 made an invite code MANDATORY at account creation, enforced by an AFTER
-- INSERT trigger on auth.users with a before-user-created hook in front of it
-- for the player-facing message. Tyler is opening the beta. Deleting the gate
-- would be the obvious move and it is the wrong one: the twenty minted codes
-- are already in people's hands, "one code = one account" is a property several
-- things now assume, and the beta may be re-closed at any time. So the gate
-- becomes CONDITIONAL rather than absent — and the condition is a row in the
-- database, not a dropped trigger, because re-closing must be one UPDATE and
-- not an archaeology exercise.
--
-- ── THE RULE, EXACTLY ──────────────────────────────────────────────────────
--
--                          │ gate = 'on' (closed)      │ gate = 'off' (open)
--   ───────────────────────┼───────────────────────────┼──────────────────────
--   no code supplied       │ REFUSED invite_required   │ ALLOWED, journalled
--                          │ (byte-identical to b457)  │ outcome = 'open'
--   valid unused code      │ ALLOWED + CONSUMED        │ ALLOWED + CONSUMED
--   unknown code           │ REFUSED invite_unknown    │ REFUSED invite_unknown
--   already-used code      │ REFUSED invite_used       │ REFUSED invite_used
--
-- ── THE RULING ON A BAD CODE WHILE THE GATE IS OPEN, AND WHY ───────────────
-- A supplied code is still validated, and a bad one still REFUSES the signup.
-- The lazy alternative — "the gate is open, so ignore whatever they typed" —
-- was rejected for four reasons, in descending order of weight:
--
--   1. A TYPO WOULD SUCCEED SILENTLY. A player who mistypes FRIEND-004 as
--      FRIEND-Ø04 would get an account, believe their code was spent, and their
--      REAL code would sit unused forever with nobody able to tell them. The
--      only signal they ever get that the code was wrong is the refusal.
--   2. `beta_invites` STOPS BEING A LEDGER. `used_by` is the record of which
--      seat went to whom. If a code-bearing signup can succeed without
--      consuming, that column silently stops meaning anything, and it is an
--      input to future decisions (who was here first, which invite converted).
--   3. ONE CODE, ONE ACCOUNT SURVIVES THE OPEN PERIOD. If a used code were
--      waved through, a code shared in a Discord screenshot would look like it
--      "still works" — and the day the gate is re-closed, everyone holding that
--      screenshot is refused with no explanation for the change.
--   4. IT KEEPS THE ENUMERATION SIGNAL. `refused_unknown` rows are how a sweep
--      of the (low-entropy, `WORD-NNN`) code space is detected. Accepting every
--      guess would erase the alarm at exactly the moment the code space is
--      being guessed at most.
--   The cost of the ruling is one refusal for a player who typed something into
--   an OPTIONAL field. The message tells them they can just leave it blank.
--
-- ── HOW THE CLIENT SIGNALS "NO CODE" ───────────────────────────────────────
-- ALL of these are "no code", and the client may pick whichever is most
-- natural — it does not need to special-case any of them:
--     · the `invite_code` key ABSENT from the signup metadata entirely
--     · `invite_code: null`
--     · `invite_code: ''`
--     · `invite_code: '   '`   — any run of whitespace, INCLUDING tabs,
--                                newlines and carriage returns
-- Anything else is "a code was supplied" and gets validated. §7 asserts every
-- one of these spellings behaviourally, so it cannot quietly drift.
--
-- ⚠ THE LAST BULLET IS A FIX, NOT A RESTATEMENT, AND IT IS A REAL BUG b457
--   SHIPPED. `hr_beta_code_norm` was `btrim(coalesce(p_code, ''))`, and
--   Postgres's one-argument `btrim` trims SPACES ONLY. So a code pasted out of
--   a Discord message with a trailing newline — `'FRIEND-001\n'` — did not
--   normalise to `FRIEND-001`; it normalised to `FRIEND-001` + a newline,
--   matched no row, and was refused `invite_unknown` with the message "check it
--   for typos". There is no typo to find, and no player would ever have found
--   it. Caught by tests/open-beta.mjs asserting the four spellings, not by
--   reading the function.
--   §1b restates the function with `btrim(x, E' \t\r\n')`. That is a strict
--   SUPERSET of the old behaviour: every input that normalised to X before
--   still normalises to X (space-trimming is contained in whitespace-trimming),
--   the 64-character bound is unchanged, and the only inputs whose outcome
--   moves are ones that were being refused. It opens nothing: a whitespace-only
--   "code" goes from "a supplied bogus code" (refused) to "no code" (refused
--   when the gate is on, allowed when it is off) — which is the answer the
--   player meant in both modes. This file becomes the function's last toucher,
--   which is safe in BOTH orderings: `open-beta` sorts after `beta-invite-gate`
--   by filename AND is applied after it in schema-apply-order.json.
--
-- Nothing else about the client contract moves: the code still travels as
-- `supabase.auth.signUp({ options: { data: { invite_code } } })`, i.e.
-- `raw_user_meta_data.invite_code`, and `beta_invite_check` is still the
-- anon-callable pre-check.
--
-- ── FAIL CLOSED, AND WHICH DIRECTION "CLOSED" IS ───────────────────────────
-- `hr_beta_gate_is_open()` returns TRUE only when the setting row exists and
-- says exactly 'off'. A missing row, a missing table, a NULL, a typo, an
-- exception — anything at all — returns FALSE, i.e. THE GATE IS ON.
--
-- That is deliberately the direction that breaks LOUDLY. If this is wrong,
-- signups start failing with "Hearthrise is in closed beta" and somebody is
-- told within minutes. The other direction — a lost row silently opening the
-- gate — is the class of bug this whole program exists to prevent, and it is
-- invisible until an audit counts accounts against invites, which is precisely
-- how b457's 5-of-8 was found. The `check` constraint on the settings table
-- makes 'Off'/'OFF'/'disabled'/'false' impossible to store in the first place,
-- so the fail-closed path is a genuine last resort rather than a daily hazard.
--
-- ── ABUSE POSTURE FOR AN OPEN GATE ─────────────────────────────────────────
-- Removing the invite requirement removes the only thing that bounded account
-- creation. Three brakes now stand where one used to:
--
--   (a) NEW — a per-IP ACCOUNT brake in the hook: 10 codeless signups per IP
--       per day. It applies ONLY to the codeless path (a code-bearing signup is
--       already bounded by the supply of codes) and ONLY while the gate is
--       open, so `gate = 'on'` behaviour is byte-identical to b457.
--   (b) b457's per-IP FAILURE brake, 30/hour, unchanged.
--   (c) GoTrue's own limiter and email confirmation — DASHBOARD SETTINGS, NOT
--       DATABASE STATE. See §9; they are the half this file cannot assert.
--
-- ⚠ THE BRAKE IN (a) LIVES IN THE HOOK, AND STRUCTURALLY CANNOT LIVE IN THE
--   TRIGGER. The trigger runs inside GoTrue's own database connection, where
--   there is no `request.headers` and no client IP to be had at any price — the
--   IP exists only in the hook's event payload. So if the before-user-created
--   hook is ever un-registered, ENFORCEMENT of the invite gate survives (the
--   trigger is the authority) but the account brake does NOT. That makes hook
--   registration more load-bearing than it was yesterday, not less. It is
--   asserted by tests/beta-invite-gate.mjs --live and named again in §9.
--
--   It is also an ATTEMPT brake, not strictly an account brake: GoTrue invokes
--   the signup path for an already-registered address without inserting a row,
--   and a signup that is never email-confirmed still spent a token. Both make
--   the limit slightly stricter than "10 accounts", never looser. Stated rather
--   than papered over.
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED ───────────────────────────────────────
--   · `hr_beta_code_norm` — its 64-character bound is what stops a 10 MB
--     "code" becoming a 10 MB journal row. Unchanged, and §8 asserts it.
--   · The AFTER INSERT trigger REGISTRATION, the operator/admin bypasses, the
--     append-only journal triggers, `claim_beta_invite`'s revoked grant, and
--     `beta_invite_check` staying anon-callable. All b457, all still true.
--   · `hr_beta_gate_message` — NOT restated. Two files owning one `case` is a
--     failure mode this repo has already paid for (see run-sql-tests PART 1c-iii
--     on clan_members."join as self"), so the new copy lives in a NEW function,
--     `hr_beta_signup_message`, which DELEGATES to it. §7 asserts all four of
--     b457's sentences survive the delegation unchanged.
--
-- IDEMPOTENT + ADDITIVE (one new table, one new row, one new function, three
-- create-or-replaces). Safe to re-apply — re-applying does NOT reset the switch
-- (§1's insert is ON CONFLICT DO NOTHING, deliberately: a re-run of this file
-- must never silently re-open a beta somebody closed).
--
-- NO `begin;`/`commit;` (repo rule S5). §7's behavioural self-check runs inside
-- subtransactions that ALWAYS abort, so the file is net-zero by construction.
--
-- REVERSIBILITY: re-apply 2026-08-23-beta-invite-gate.sql. It restates
-- hr_beta_gate_reason, hr_signup_gate and hr_beta_gate_on_auth_user in their
-- pre-switch form and its own self-check proves the closed behaviour. The
-- hr_settings table and hr_beta_gate_is_open/hr_beta_signup_message would be
-- left behind, inert and read by nobody. Faster still, and what you actually
-- want 99% of the time: the one-line UPDATE at the top of this header.
--
-- GUARDED BY: tests/open-beta.mjs (behavioural, real PostgreSQL via PGlite,
-- with a mutation catalogue) + tests/beta-invite-gate.mjs (which becomes
-- gate-aware) + this file's own §7/§8.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §0 · PREFLIGHT — fail closed ───────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_beta_gate_reason(text)') is null
  or to_regprocedure('public.hr_beta_gate_message(text)') is null
  or to_regprocedure('public.hr_beta_code_norm(text)') is null
  or to_regprocedure('public.hr_signup_gate(jsonb)') is null
  or to_regprocedure('public.hr_beta_gate_on_auth_user()') is null then
    raise exception 'open-beta: the invite gate is absent — apply 2026-08-23-beta-invite-gate.sql first';
  end if;
  if to_regclass('public.beta_signup_log') is null or to_regclass('public.beta_invites') is null then
    raise exception 'open-beta: beta_signup_log / beta_invites are absent — apply the invite gate first';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null
  or to_regprocedure('public.hr_rate_over(uuid,text)') is null
  or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
  or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'open-beta: the rate-counter helpers are absent — apply 2026-08-11-player-state.sql first';
  end if;
  -- The AFTER INSERT trigger is the authority this file makes conditional. If
  -- it is not attached, the switch below would be decorative.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'users' and c.relnamespace = 'auth'::regnamespace
       and t.tgname = 'hr_beta_invite_gate' and not t.tgisinternal) then
    raise exception 'open-beta: the hr_beta_invite_gate trigger is not attached to auth.users — apply the invite gate first';
  end if;
end $$;


-- ── §1 · THE SWITCH ────────────────────────────────────────────────────────
-- A small, general settings table — but the beta_gate key's DOMAIN is nailed
-- down by a CHECK rather than by the convention of whoever writes the UPDATE.
-- This is the whole difference between a settings row and a footgun: a generic
-- text bag would happily store 'Off', 'disabled' or 'flase', and every one of
-- those reads as "not exactly 'off'", i.e. the gate silently stays closed while
-- the operator believes they opened it. The database refuses them instead.
create table if not exists public.hr_settings (
  key        text primary key,
  value      text not null,
  note       text,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_settings'::regclass
                    and conname = 'hr_settings_domain_chk') then
    alter table public.hr_settings add constraint hr_settings_domain_chk check (
      length(key) between 1 and 64
      and length(value) <= 256
      -- Per-key domains. Add an arm when a key is added; a key with no arm is
      -- unconstrained by design (this is a settings table, not an enum), but a
      -- SECURITY switch never gets to be one of those.
      and (key <> 'beta_gate' or value in ('on', 'off'))
    );
  end if;
end $$;

-- ⚠ ON CONFLICT DO NOTHING, AND IT IS LOAD-BEARING. Re-applying this migration
--   must NEVER silently re-open a beta that somebody deliberately closed. The
--   switch is operational state from the moment it exists; the migration seeds
--   it once and then has no further opinion.
insert into public.hr_settings (key, value, note)
values ('beta_gate', 'off',
        'Closed-beta invite gate. ''on'' = an invite code is required to create an account '
        '(the 2026-08-23 b457 behaviour). ''off'' = OPEN BETA: a codeless signup is allowed, '
        'but a code that IS supplied is still validated and consumed. Read on every signup by '
        'public.hr_beta_gate_is_open(). Flip with: update public.hr_settings set value=''on'' '
        'where key=''beta_gate'';')
on conflict (key) do nothing;

alter table public.hr_settings enable row level security;
-- No policy, deliberately — the beta_signup_log / hr_client_rpc_baseline
-- construction. RLS-on with zero policies means PostgREST serves nothing to
-- anon/authenticated whatever it is asked, and the revokes mean the request
-- never reaches a policy anyway. Two independent locks. A client that could
-- READ this learns nothing interesting; a client that could WRITE it owns
-- account creation, so the write side is what the revoke is really for.
revoke all on table public.hr_settings from anon, authenticated;
revoke all on table public.hr_settings from public;

-- Every change to a security switch is stamped, so "when did the beta open"
-- is answerable from the row rather than from memory.
create or replace function public.hr_settings_touch()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.hr_settings_touch() from public, anon, authenticated, service_role;

drop trigger if exists hr_settings_touch_trg on public.hr_settings;
create trigger hr_settings_touch_trg
  before update on public.hr_settings
  for each row execute function public.hr_settings_touch();


-- ── §1b · NORMALISATION — one spelling of "the same code" ──────────────────
-- b457's function, with ONE change: `btrim` gets an explicit whitespace set.
-- See the header's "how the client signals no code" note for the bug that fix
-- closes (a pasted code with a trailing newline was refused as a typo) and for
-- why the change is a strict superset that opens nothing.
--
-- EVERYTHING ELSE IS CARRIED VERBATIM, including the reason for the bound,
-- because the next person to restate this needs it in front of them:
-- BOUNDED at 64 characters, deliberately. `invite_code` is client-supplied text
-- of unlimited length, and the refusal path WRITES it to beta_signup_log — so
-- without a bound a 10 MB "code" is a 10 MB journal row, repeatable at whatever
-- rate GoTrue's own signup limiter allows. The longest real code is 11
-- characters, and no truncation of a longer string can collide with one, so the
-- bound costs nothing and closes an unbounded write. That path is now reachable
-- by anyone on the internet rather than only by someone holding a code, which
-- makes the bound MORE load-bearing than it was. §8(d) asserts it.
--
-- The COMPARISON side is deliberately untouched: hr_beta_gate_reason still
-- matches on `upper(btrim(b.code))`, which is also the expression behind
-- beta_invites_code_norm_uniq. Only the CLIENT's input — the untrusted, sloppy
-- side — gets the wider trim.
create or replace function public.hr_beta_code_norm(p_code text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select nullif(left(upper(btrim(coalesce(p_code, ''), E' \t\r\n')), 64), '')
$$;
revoke execute on function public.hr_beta_code_norm(text) from public, anon, authenticated;


-- ── §2 · THE READER — fail closed, and total ───────────────────────────────
-- TRUE means OPEN (no code required). Anything this function cannot prove is
-- 'off' returns FALSE, i.e. the closed beta. See the header for why that is the
-- correct direction and not merely the cautious one.
--
-- `stable`, not `immutable`: it reads a table. Called at most twice per signup,
-- against a one-row table that lives in shared buffers forever — this is not a
-- hot path and it never will be, because account creation is bounded by
-- GoTrue's own limiter before it ever reaches Postgres.
create or replace function public.hr_beta_gate_is_open()
returns boolean language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_v text;
begin
  select s.value into v_v from public.hr_settings s where s.key = 'beta_gate';
  return coalesce(v_v, 'on') = 'off';
exception when others then
  -- A missing table, a permission fault, anything: the gate is ON. A switch
  -- that opens the door when it cannot read itself is not a switch.
  return false;
end $$;
revoke execute on function public.hr_beta_gate_is_open()
  from public, anon, authenticated, service_role;


-- ── §3 · THE RULE, still in one place ──────────────────────────────────────
-- b457's design property, preserved exactly: the hook and the trigger both read
-- THIS function, so they cannot disagree about what "valid" means. The ONLY
-- change is the `invite_required` arm, which now consults the switch.
--
-- Everything else is b457's body verbatim, including the coalesce that fixes
-- the select-into-NULL fail-open — see the comment in place. That comment is
-- carried rather than summarised because the bug it describes shipped, in this
-- exact function, and the next person to restate this body needs it in front of
-- them and not one file away.
create or replace function public.hr_beta_gate_reason(p_code text)
returns text language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_norm text; v_used uuid; v_found boolean;
begin
  v_norm := public.hr_beta_code_norm(p_code);
  if v_norm is null then
    -- NO CODE SUPPLIED. Under the OPEN beta this is the ordinary case and it is
    -- allowed; under the closed beta it is b457's refusal, unchanged.
    -- ⚠ This is the ONLY line in this function that the open-beta switch
    --   touches. A code that WAS supplied is validated below in every mode —
    --   see the ruling in this file's header.
    if public.hr_beta_gate_is_open() then return null; end if;
    return 'invite_required';
  end if;
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
  --   Caught by firing a real signup at the live endpoint, not by reading this.
  if not coalesce(v_found, false) then return 'invite_unknown'; end if;
  if v_used is not null then return 'invite_used'; end if;
  return null;
end $$;
revoke execute on function public.hr_beta_gate_reason(text) from public, anon, authenticated;


-- ── §4 · THE COPY LAYER ────────────────────────────────────────────────────
-- `hr_beta_gate_message` is NOT restated here. It is b457's, it is `immutable`,
-- and a second file owning its `case` is the exact hazard the repo has already
-- paid for. This function DELEGATES to it and adds the two things it cannot
-- know: the new throttle sentence, and the "you can also leave it blank" hint
-- that is only true while the gate is open (an immutable function cannot read
-- the switch, and making it stable would be a wider change than the copy).
--
-- §7 asserts that all four of b457's sentences survive this delegation
-- unchanged — otherwise a "harmless" copy refactor could silently replace the
-- one string a refused player actually reads.
create or replace function public.hr_beta_signup_message(p_reason text)
returns text language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_msg text;
begin
  if p_reason = 'refused_signup_throttled' then
    return 'Too many accounts have been created from this connection today. '
        || 'Try again tomorrow, or ask in the Discord if you think this is wrong.';
  end if;
  v_msg := public.hr_beta_gate_message(p_reason);
  if public.hr_beta_gate_is_open() and p_reason in ('invite_unknown', 'invite_used') then
    -- The open-beta hint. Without it, a player who typed a code wrong is told
    -- to fix the code, when the thing they actually want to hear is that the
    -- field is optional.
    v_msg := v_msg || ' You can also leave the invite code blank — Hearthrise is open to everyone right now.';
  end if;
  return v_msg;
end $$;
revoke execute on function public.hr_beta_signup_message(text)
  from public, anon, authenticated, service_role;


-- ── §5 · LAYER 2 — the before-user-created auth hook ───────────────────────
-- b457's body, plus the codeless-signup account brake. Read-only with respect
-- to beta_invites; its jobs are still (a) refuse early with a message a player
-- can act on and (b) journal, since the trigger structurally cannot journal its
-- own refusals (a raise there discards the row it just wrote).
create or replace function public.hr_signup_gate(event jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  -- b457's FAILURE brake. Counts failures only — a valid code is never refused
  -- by it — because the alternative locks a fat-fingering player, or a whole
  -- CGNAT range, out to slow an attacker who can rent another IP for a cent.
  c_fail_limit    constant int := 30;
  -- NEW: the codeless-signup ACCOUNT brake, live only while the gate is open.
  -- 10/day/IP is far above a household or a shared flat and far below anything
  -- automated. See the header for why it is an ATTEMPT brake in practice.
  c_open_limit    constant int := 10;
  -- …and the shared ceiling for callers whose IP the payload did not carry.
  -- ONE bucket, generous, exactly the anon-rate-gate §2 fallback: collapsing
  -- every keyless caller into the 10/day bucket would turn a missing payload
  -- field into a total signup outage.
  c_unkeyed_limit constant int := 200;
  v_code   text;
  v_ip     text;
  v_email  text;
  v_domain text;
  v_reason text;
  v_open   boolean;
  v_key    uuid;
  v_bucket text;
  v_limit  int;
  v_weight bigint;
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
    -- ALLOWED. Two shapes, and only one of them is new.
    --
    -- A CODE-BEARING signup is bounded by the supply of codes and takes exactly
    -- b457's path: nothing is journalled here (the account does not exist yet
    -- and may still fail for an unrelated reason — the TRIGGER writes the
    -- 'granted' row, in the transaction that actually creates the account, with
    -- the real user id).
    --
    -- A CODELESS signup is only reachable while the gate is OPEN, and it is the
    -- one path a stranger can take at unlimited volume. It gets the brake.
    v_open := v_code is null and public.hr_beta_gate_is_open();
    if v_open then
      if v_ip is not null then
        v_key := md5('beta-open-ip:' || v_ip)::uuid; v_bucket := 'signup:open'; v_limit := c_open_limit;
      else
        v_key := md5('beta-open-unkeyed')::uuid; v_bucket := 'signup:open-unkeyed'; v_limit := c_unkeyed_limit;
      end if;
      if not public.hr_rate_ok(v_key, v_bucket, v_limit, interval '1 day') then
        -- SAMPLED, not per-call: an unconditional write here would make the
        -- server do more durable work the harder it is hammered, all serialised
        -- on one tuple (player-state.sql §6c-ii). hr_rate_sample_weight fires on
        -- the FIRST over-limit call and then at widening gaps, so a modest
        -- abuser still leaves a row and a flood does not leave a million.
        v_weight := public.hr_rate_sample_weight(public.hr_rate_over(v_key, v_bucket) - v_limit);
        if v_weight > 0 then
          perform public.hr_record_rejection(v_key, 0, 'anon:signup_open', 'rate_limited',
            jsonb_build_object('limit', v_limit, 'per', '1 day', 'gate', 'signup_open',
                               'anon', true, 'keyed', v_ip is not null), v_weight);
          insert into public.beta_signup_log (outcome, ip, email_domain, detail)
            values ('refused_signup_throttled', left(coalesce(v_ip,''), 64), v_domain,
                    jsonb_build_object('layer', 'hook', 'limit', v_limit,
                                       'sampled', v_weight, 'keyed', v_ip is not null));
        end if;
        return jsonb_build_object('error', jsonb_build_object(
          'http_code', 429,
          'message',   public.hr_beta_signup_message('refused_signup_throttled')));
      end if;
    end if;
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
            jsonb_build_object('layer', 'hook', 'reason', v_reason,
                               'gate', case when public.hr_beta_gate_is_open() then 'off' else 'on' end));

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message',   public.hr_beta_signup_message(v_reason)));
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
    raise notice 'open-beta: no supabase_auth_admin role (replay harness) — hook grant skipped';
  end if;
end $$;


-- ── §6 · LAYER 1 — the authority ───────────────────────────────────────────
-- b457's body plus ONE new arm. AFTER INSERT on auth.users; consumption and
-- account creation are one transaction, so there is no window in which one
-- happened and the other did not. The trigger REGISTRATION is untouched — a
-- `create or replace function` keeps the existing trigger pointing here.
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
  -- (a) operator bypass. A one-entry ALLOWLIST, and JOURNALLED so that a
  --     fail-open (GoTrue arriving as an unexpected role) is a row somebody can
  --     query rather than a silence.
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

  -- (c) NEW — THE OPEN BETA, and ONLY for a codeless signup.
  --     A code that WAS supplied falls through to the consume below and is
  --     validated exactly as it is under the closed beta; see the ruling in the
  --     header. Journalled as 'open' so the abuse trail covers every account
  --     ever created, which is the property b457 bought and this must not spend.
  --     `v_code is null` FIRST, and the switch second, is not a style choice:
  --     it means a code-bearing signup never even reads the switch, so the
  --     consume path is provably identical in both modes.
  if v_code is null and public.hr_beta_gate_is_open() then
    insert into public.beta_signup_log (outcome, user_id, detail)
      values ('open', new.id, jsonb_build_object('layer', 'trigger', 'gate', 'off'));
    return new;
  end if;

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
  raise exception '%', public.hr_beta_signup_message(v_reason)
    using errcode = 'P0001', hint = v_reason;
end $$;
revoke execute on function public.hr_beta_gate_on_auth_user() from public, anon, authenticated;


-- ── §7 · SELF-CHECK — behavioural, executed here, then rolled back ────────
-- Every claim this file makes is exercised against the real functions and the
-- real trigger, in this transaction, inside subtransactions that ALWAYS abort.
--
-- IT BRINGS ITS OWN INVITE CODE, for b457's reason: an earlier draft of that
-- file probed with "the first unused row in beta_invites", which briefly
-- consumed one of Tyler's real codes AND made the migration unappliable on a
-- rebuilt database where beta_invites is empty.
--
-- IT FORCES ENFORCEMENT. This session is `postgres`, which §6(a) waves through.
-- Without `hearthrise.invite_gate_force` every trigger assertion below would
-- pass against a gate that does nothing — the always-null-probe shape.
do $$
declare
  c_u1    constant uuid := '00000000-0bea-4bee-8000-000000000001';
  c_u2    constant uuid := '00000000-0bea-4bee-8000-000000000002';
  c_u3    constant uuid := '00000000-0bea-4bee-8000-000000000003';
  c_u4    constant uuid := '00000000-0bea-4bee-8000-000000000004';
  c_probe constant text := 'ZZOPENBETA-000';
  c_ip    constant text := '203.0.113.44';
  v_has_meta boolean;
  v_users0 bigint; v_inv0 bigint; v_used0 bigint; v_log0 bigint;
  v_users1 bigint; v_inv1 bigint; v_used1 bigint; v_log1 bigint;
  v_r    text;
  v_out  jsonb;
  v_msg  text;
  v_ok   boolean;
  v_n    int;
  v_i    int;
  v_evt  jsonb;
begin
  select count(*) into v_users0 from auth.users;
  select count(*) into v_inv0   from public.beta_invites;
  select count(*) into v_used0  from public.beta_invites where used_by is not null;
  select count(*) into v_log0   from public.beta_signup_log;

  v_has_meta := exists (select 1 from information_schema.columns
                         where table_schema='auth' and table_name='users'
                           and column_name='raw_user_meta_data');

  begin
    perform set_config('hearthrise.invite_gate_force', 'yes', true);
    if exists (select 1 from public.beta_invites where upper(btrim(code)) = c_probe) then
      raise exception 'open-beta SELF-CHECK: the probe code % already exists as a real invite', c_probe;
    end if;
    insert into public.beta_invites (code, note)
      values (c_probe, 'self-check probe - rolled back before this migration ends');

    -- The event shape GoTrue actually sends, minus the parts nothing reads.
    v_evt := jsonb_build_object('metadata', jsonb_build_object('ip_address', c_ip),
                                'user', jsonb_build_object('email','probe@invalid.test',
                                                           'user_metadata','{}'::jsonb));

    -- ══ (1) THE SWITCH ITSELF ══════════════════════════════════════════════
    if not public.hr_beta_gate_is_open() then
      raise exception 'SELF-CHECK 1 FAILED: the migration seeded beta_gate but hr_beta_gate_is_open() says closed';
    end if;
    update public.hr_settings set value = 'on' where key = 'beta_gate';
    if public.hr_beta_gate_is_open() then
      raise exception 'SELF-CHECK 1 FAILED: beta_gate=''on'' still reads as OPEN — the switch does nothing';
    end if;

    -- ══ (2) GATE ON — b457's REFUSAL SET, BYTE FOR BYTE ════════════════════
    -- Everything below is 2026-08-23-beta-invite-gate.sql §7 checks 1-3, re-run
    -- against the restated bodies. If any of them moved, this file broke the
    -- closed beta while claiming only to add a switch.
    v_r := public.hr_beta_gate_reason(null);
    if v_r is distinct from 'invite_required' then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, null code -> % (want invite_required)', v_r;
    end if;
    v_r := public.hr_beta_gate_reason('   ');
    if v_r is distinct from 'invite_required' then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, blank code -> % (want invite_required)', v_r;
    end if;
    v_r := public.hr_beta_gate_reason('NO-SUCH-CODE-9Q7X');
    if v_r is distinct from 'invite_unknown' then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, UNKNOWN code -> % (want invite_unknown) — the select-into-NULL fail-open is back', v_r;
    end if;
    v_r := public.hr_beta_gate_reason('  ' || lower(c_probe) || ' ');
    if v_r is not null then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, a VALID code was refused (%) — normalisation is broken', v_r;
    end if;
    v_out := public.hr_signup_gate(v_evt);
    if v_out -> 'error' is null then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, the hook ALLOWED a codeless signup';
    end if;
    if v_out #>> '{error,http_code}' <> '403' then
      raise exception 'SELF-CHECK 2 FAILED: gate ON, a codeless refusal is HTTP % (want 403)', v_out #>> '{error,http_code}';
    end if;

    -- ══ (3) THE COPY SURVIVED THE DELEGATION ═══════════════════════════════
    -- All four of b457's sentences, through the NEW message function, with the
    -- gate ON so no hint is appended. A "harmless" copy refactor that replaced
    -- the one string a refused player reads would otherwise be invisible.
    for v_r, v_msg in
      select * from (values ('invite_required',  'closed beta'),
                            ('invite_unknown',   'not recognised'),
                            ('invite_used',      'already been used'),
                            ('refused_throttled','Too many invite attempts')) t(a, b)
    loop
      if public.hr_beta_signup_message(v_r) is distinct from public.hr_beta_gate_message(v_r) then
        raise exception 'SELF-CHECK 3 FAILED: gate ON, hr_beta_signup_message(%) no longer matches b457''s hr_beta_gate_message', v_r;
      end if;
      if position(v_msg in public.hr_beta_signup_message(v_r)) = 0 then
        raise exception 'SELF-CHECK 3 FAILED: the % message lost its key phrase "%" — it now reads: %',
          v_r, v_msg, public.hr_beta_signup_message(v_r);
      end if;
    end loop;
    if public.hr_beta_signup_message('refused_signup_throttled') not like '%connection today%' then
      raise exception 'SELF-CHECK 3 FAILED: the new throttle message is missing';
    end if;

    -- ══ (4) GATE OFF — CODELESS IS ALLOWED ═════════════════════════════════
    update public.hr_settings set value = 'off' where key = 'beta_gate';
    -- All four spellings of "no code" the client can send. This is the contract
    -- the login-wall form is built against; asserting it here is what stops it
    -- drifting into "you must send the key but it may be empty".
    if public.hr_beta_gate_reason(null) is not null then
      raise exception 'SELF-CHECK 4 FAILED: gate OFF, an ABSENT invite_code is still refused';
    end if;
    if public.hr_beta_gate_reason('') is not null then
      raise exception 'SELF-CHECK 4 FAILED: gate OFF, an EMPTY-STRING invite_code is still refused';
    end if;
    if public.hr_beta_gate_reason('   ') is not null then
      raise exception 'SELF-CHECK 4 FAILED: gate OFF, a WHITESPACE invite_code is still refused';
    end if;
    if public.hr_beta_gate_reason(E'\t\n ') is not null then
      raise exception 'SELF-CHECK 4 FAILED: gate OFF, a TAB/NEWLINE invite_code is still refused — '
                      'one-argument btrim() trims spaces only, and §1b''s explicit whitespace set is gone';
    end if;
    -- …and the same fix on the path that actually matters: a REAL code pasted
    -- out of a chat window with a trailing newline. b457 refused this as a
    -- typo, and there was no typo to find.
    if public.hr_beta_gate_reason(E'  ' || lower(c_probe) || E'\r\n') is not null then
      raise exception 'SELF-CHECK 4 FAILED: a valid code with a trailing newline (i.e. PASTED) is refused — '
                      'the §1b btrim fix is gone and the message tells the player to look for a typo that does not exist';
    end if;
    -- The SUPERSET property: the fix must not change any input that already
    -- worked. A space-padded lower-cased code is b457's own check 3.
    if public.hr_beta_code_norm('  friend-001  ') is distinct from 'FRIEND-001' then
      raise exception 'SELF-CHECK 4 FAILED: the §1b normalisation changed an input that already worked (got %)',
        public.hr_beta_code_norm('  friend-001  ');
    end if;
    v_out := public.hr_signup_gate(v_evt);
    if v_out -> 'error' is not null then
      raise exception 'SELF-CHECK 4 FAILED: gate OFF, the hook REFUSED a codeless signup: %', v_out #>> '{error,message}';
    end if;

    -- ══ (5) GATE OFF — A SUPPLIED CODE IS STILL REAL OR STILL REFUSED ══════
    -- THE RULING, asserted. Deleting the ruling looks exactly like simplifying
    -- the function, so it gets a check of its own in both directions.
    v_r := public.hr_beta_gate_reason('NO-SUCH-CODE-9Q7X');
    if v_r is distinct from 'invite_unknown' then
      raise exception 'SELF-CHECK 5 FAILED: gate OFF, a BOGUS code was accepted (-> %) — a typo now silently succeeds '
                      'and the player''s real code is never spent', v_r;
    end if;
    v_r := public.hr_beta_gate_reason(c_probe);
    if v_r is not null then
      raise exception 'SELF-CHECK 5 FAILED: gate OFF, a VALID code was refused (%)', v_r;
    end if;
    v_out := public.hr_signup_gate(jsonb_build_object(
               'metadata', jsonb_build_object('ip_address', c_ip),
               'user', jsonb_build_object('email','probe@invalid.test',
                         'user_metadata', jsonb_build_object('invite_code','NO-SUCH-CODE-9Q7X'))));
    if v_out -> 'error' is null then
      raise exception 'SELF-CHECK 5 FAILED: gate OFF, the hook ALLOWED an unknown invite code';
    end if;
    if v_out #>> '{error,message}' not like '%leave the invite code blank%' then
      raise exception 'SELF-CHECK 5 FAILED: gate OFF, the refusal does not tell the player the field is optional: %',
        v_out #>> '{error,message}';
    end if;

    -- ══ (6) THE CODELESS ACCOUNT BRAKE ═════════════════════════════════════
    -- 10/day/IP. Drive past it, require a refusal, then prove a DIFFERENT IP is
    -- unaffected — without that control, "the hook refuses everything" passes.
    for v_i in 1..14 loop
      v_out := public.hr_signup_gate(v_evt);
    end loop;
    if v_out -> 'error' is null then
      raise exception 'SELF-CHECK 6 FAILED: 15 codeless signups from one IP against a limit of 10 were never braked';
    end if;
    if v_out #>> '{error,http_code}' <> '429' then
      raise exception 'SELF-CHECK 6 FAILED: the account brake answers HTTP % (want 429)', v_out #>> '{error,http_code}';
    end if;
    v_out := public.hr_signup_gate(jsonb_build_object(
               'metadata', jsonb_build_object('ip_address', '203.0.113.45'),
               'user', jsonb_build_object('email','probe2@invalid.test','user_metadata','{}'::jsonb)));
    if v_out -> 'error' is not null then
      raise exception 'SELF-CHECK 6 FAILED (CONTROL): a DIFFERENT IP was braked (%) — the limit is global, '
                      'and one visitor can lock every other one out of signing up', v_out #>> '{error,message}';
    end if;
    -- …and a CODE-BEARING signup is never touched by the account brake, even
    -- from the exhausted IP: its bound is the supply of codes.
    v_out := public.hr_signup_gate(jsonb_build_object(
               'metadata', jsonb_build_object('ip_address', c_ip),
               'user', jsonb_build_object('email','probe@invalid.test',
                         'user_metadata', jsonb_build_object('invite_code', lower(c_probe)))));
    if v_out -> 'error' is not null then
      raise exception 'SELF-CHECK 6 FAILED: the codeless account brake also refused a CODE-BEARING signup: %',
        v_out #>> '{error,message}';
    end if;
    -- The brake left a trail.
    select count(*) into v_n from public.beta_signup_log where outcome = 'refused_signup_throttled';
    if v_n < 1 then
      raise exception 'SELF-CHECK 6 FAILED: the account brake journalled nothing — an invisible limit is not a signal';
    end if;

    -- ══ (7) THE HOOK CONSUMED NOTHING, IN EITHER MODE ══════════════════════
    if exists (select 1 from public.beta_invites where upper(btrim(code)) = c_probe and used_by is not null) then
      raise exception 'SELF-CHECK 7 FAILED: the hook CONSUMED a code — it must only read';
    end if;

    raise exception using errcode = 'HRO97', message = 'open-beta hook probe rollback';
  exception
    when sqlstate 'HRO97' then
      raise notice 'open-beta self-check 1-7 OK — the switch flips, gate ON is b457 byte for byte, gate OFF '
                   'allows codeless and still refuses a bogus code, and the account brake bites per-IP';
  end;

  -- ══ THE TRIGGER — the authority ══════════════════════════════════════════
  if not v_has_meta then
    raise notice 'open-beta: auth.users has no raw_user_meta_data (replay fixture) — the trigger checks '
                 'need that column and run on the real database only. tests/open-beta.mjs adds it to the '
                 'fixture and drives them there.';
  else
    begin
      perform set_config('hearthrise.invite_gate_force', 'yes', true);
      insert into public.beta_invites (code, note) values (c_probe, 'self-check probe');
      update public.hr_settings set value = 'off' where key = 'beta_gate';

      -- (8) GATE OFF — a codeless account is CREATED and journalled 'open'.
      execute format('insert into auth.users (id, email) values (%L, %L)', c_u1, 'open1@invalid.test');
      if not exists (select 1 from auth.users where id = c_u1) then
        raise exception 'SELF-CHECK 8 FAILED: gate OFF, a codeless signup did not create an account';
      end if;
      select count(*) into v_n from public.beta_signup_log where user_id = c_u1 and outcome = 'open';
      if v_n <> 1 then
        raise exception 'SELF-CHECK 8 FAILED: expected exactly 1 outcome=''open'' journal row, saw % — the abuse '
                        'trail must cover EVERY account, not only the invited ones', v_n;
      end if;
      select count(*) into v_n from public.beta_invites where used_by is not null;
      if v_n <> v_used0 then
        raise exception 'SELF-CHECK 8 FAILED: a codeless signup CONSUMED a code';
      end if;

      -- (9) GATE OFF — a VALID code still creates AND consumes, together.
      execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                     c_u2, 'open2@invalid.test',
                     jsonb_build_object('invite_code', '  ' || lower(c_probe) || ' ')::text);
      if (select used_by from public.beta_invites where upper(btrim(code)) = c_probe) is distinct from c_u2 then
        raise exception 'SELF-CHECK 9 FAILED: gate OFF, a valid code did not consume';
      end if;
      select count(*) into v_n from public.beta_signup_log where user_id = c_u2 and outcome = 'granted';
      if v_n <> 1 then
        raise exception 'SELF-CHECK 9 FAILED: gate OFF, a consumed code was not journalled ''granted'' (saw %)', v_n;
      end if;

      -- (10) GATE OFF — a BOGUS code is REFUSED and creates nothing. The ruling.
      v_ok := false;
      begin
        execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                       c_u3, 'open3@invalid.test', jsonb_build_object('invite_code','NO-SUCH-CODE-9Q7X')::text);
      exception when others then v_ok := true; v_msg := sqlerrm;
      end;
      if not v_ok then
        raise exception 'SELF-CHECK 10 FAILED: gate OFF, a FORGED invite code created an account — a typo now '
                        'succeeds silently and beta_invites.used_by stops meaning anything';
      end if;
      if exists (select 1 from auth.users where id = c_u3) then
        raise exception 'SELF-CHECK 10 FAILED: the refused account exists anyway';
      end if;
      -- …and a REPLAY of the now-consumed code cannot create a second account.
      v_ok := false;
      begin
        execute format('insert into auth.users (id, email, raw_user_meta_data) values (%L, %L, %L::jsonb)',
                       c_u3, 'open3@invalid.test', jsonb_build_object('invite_code', c_probe)::text);
      exception when others then v_ok := true;
      end;
      if not v_ok then
        raise exception 'SELF-CHECK 10 FAILED: gate OFF, the SAME code created a SECOND account — one code, one '
                        'account died the moment the beta opened';
      end if;

      -- (11) GATE ON — b457's refusal is back, unchanged, at the AUTHORITY.
      update public.hr_settings set value = 'on' where key = 'beta_gate';
      v_ok := false;
      begin
        execute format('insert into auth.users (id, email) values (%L, %L)', c_u4, 'closed@invalid.test');
      exception when others then v_ok := true; v_msg := sqlerrm;
      end;
      if not v_ok then
        raise exception 'SELF-CHECK 11 FAILED: gate ON, an account with NO invite code was created — the switch '
                        'cannot be turned back on';
      end if;
      if exists (select 1 from auth.users where id = c_u4) then
        raise exception 'SELF-CHECK 11 FAILED: the refused account exists anyway';
      end if;
      if v_msg not like '%closed beta%' then
        raise exception 'SELF-CHECK 11 FAILED: the closed-beta refusal message changed: %', v_msg;
      end if;

      raise exception using errcode = 'HRO96', message = 'open-beta trigger probe rollback';
    exception
      when sqlstate 'HRO96' then
        raise notice 'open-beta self-check 8-11 OK — codeless accounts are created and journalled ''open'', a '
                     'valid code still consumes exactly once, a bogus code still refuses, and gate=''on'' '
                     'restores b457 at the trigger';
    end;
  end if;

  -- ══ PROVE THE UNDO ═══════════════════════════════════════════════════════
  select count(*) into v_users1 from auth.users;
  select count(*) into v_inv1   from public.beta_invites;
  select count(*) into v_used1  from public.beta_invites where used_by is not null;
  select count(*) into v_log1   from public.beta_signup_log;
  if v_users1 <> v_users0 or v_inv1 <> v_inv0 or v_used1 <> v_used0 or v_log1 <> v_log0 then
    raise exception 'SELF-CHECK 12 FAILED: probe residue survived — users %->%, invites %->%, consumed %->%, journal %->%',
      v_users0, v_users1, v_inv0, v_inv1, v_used0, v_used1, v_log0, v_log1;
  end if;
  -- …and the switch is where the migration left it, not where a probe left it.
  if not public.hr_beta_gate_is_open() then
    raise exception 'SELF-CHECK 12 FAILED: the self-check left beta_gate CLOSED — the subtransaction rollback did not undo it';
  end if;
  raise notice 'open-beta self-check 12 OK — users %, invites % (% consumed), journal % : exactly as found, and beta_gate is OPEN',
    v_users1, v_inv1, v_used1, v_log1;
end $$;


-- ── §8 · STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_bad text; v_report jsonb; v_norm text;
begin
  -- (a) The trigger is STILL attached, AFTER INSERT, enabled. A create-or-replace
  --     of the function keeps it, but a future edit that drops and recreates the
  --     function without the trigger would leave the switch decorative.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'users' and c.relnamespace = 'auth'::regnamespace
       and t.tgname = 'hr_beta_invite_gate' and not t.tgisinternal and t.tgenabled = 'O'
       and (t.tgtype & 1) = 1 and (t.tgtype & 4) = 4 and (t.tgtype & 2) = 0) then
    raise exception 'open-beta: the AFTER INSERT row trigger is no longer attached and enabled on auth.users';
  end if;

  -- (b) The switch exists, is constrained, and is unreachable from a browser.
  if not exists (select 1 from public.hr_settings where key = 'beta_gate') then
    raise exception 'open-beta: the beta_gate row is missing — hr_beta_gate_is_open() would fail CLOSED and no one could sign up';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_settings'::regclass) then
    raise exception 'open-beta: RLS is OFF on public.hr_settings';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='hr_settings') then
    raise exception 'open-beta: public.hr_settings has a POLICY — it must have none; a client that could write it owns account creation';
  end if;
  select string_agg(g || ':' || p, ', ') into v_bad
    from unnest(array['anon','authenticated','public']) g
    cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p
   where has_table_privilege(g, 'public.hr_settings', p);
  if v_bad is not null then
    raise exception 'open-beta: public.hr_settings is reachable by: % — revoke before grant', v_bad;
  end if;
  -- The domain CHECK is the thing that makes the fail-closed reader a last
  -- resort rather than a daily hazard. Prove it REFUSES, do not read it.
  begin
    update public.hr_settings set value = 'Off' where key = 'beta_gate';
    raise exception 'open-beta: hr_settings accepted beta_gate=''Off'' — the domain CHECK is missing, and a '
                    'plausible-looking typo now silently leaves the gate closed';
  exception
    when check_violation then null;
  end;

  -- (c) Nothing new is client-executable.
  select string_agg(g || ':' || f, ', ') into v_bad
    from unnest(array['anon','authenticated','service_role','public']) g
    cross join unnest(array['public.hr_beta_gate_is_open()',
                            'public.hr_beta_signup_message(text)',
                            'public.hr_settings_touch()']) f
   where has_function_privilege(g, f, 'execute');
  if v_bad is not null then
    raise exception 'open-beta: a privileged function is client-executable: %', v_bad;
  end if;
  if has_function_privilege('anon', 'public.hr_signup_gate(jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_signup_gate(jsonb)', 'execute') then
    raise exception 'open-beta: hr_signup_gate must not be client-callable';
  end if;
  if has_function_privilege('anon', 'public.claim_beta_invite(text)', 'execute')
  or has_function_privilege('authenticated', 'public.claim_beta_invite(text)', 'execute') then
    raise exception 'open-beta: claim_beta_invite is client-callable again — it burns invite codes for free';
  end if;
  -- beta_invite_check stays anon-callable ON PURPOSE — the sign-up form
  -- pre-checks a code before it submits, and that is MORE useful now that the
  -- field is optional: it is how a player learns their code is wrong before
  -- they decide whether to bother with it.
  if not has_function_privilege('anon', 'public.beta_invite_check(text)', 'execute') then
    raise exception 'open-beta: beta_invite_check must stay anon-callable — the signup form pre-checks with it';
  end if;

  -- (d) hr_beta_code_norm still bounds its input at 64. That bound is what
  --     stops a 10 MB "code" from becoming a 10 MB journal row on the refusal
  --     path, and the refusal path is now reachable by anyone on the internet
  --     rather than only by someone holding a code.
  v_norm := public.hr_beta_code_norm(repeat('Z', 5000));
  if v_norm is null or length(v_norm) <> 64 then
    raise exception 'open-beta: hr_beta_code_norm no longer bounds at 64 characters (got %) — the journal write is unbounded',
      coalesce(length(v_norm)::text, 'null');
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    execute 'select public.hr_assert_grant_hygiene(true)' into v_report;
    raise notice 'grant hygiene after open-beta: %', v_report;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- §9 · OPS — WHAT THIS FILE CANNOT ASSERT, AND WHAT TYLER MUST CHECK
--
-- The database half is done and self-verified. Account creation also depends on
-- GoTrue configuration, which is NOT database state and which no migration can
-- read or set. With the invite requirement gone, these stop being hygiene and
-- become the outer wall.
--
-- The values below were READ FROM THE LIVE PROJECT on 2026-08-23 (GET
-- /v1/projects/<REF>/config/auth), so this is a status list and not generic
-- advice. Two are already right; one is a LAUNCH BLOCKER.
--
--   ✅ EMAIL CONFIRMATIONS ARE ON.  `mailer_autoconfirm = false`. Correct, and
--      it is the most important single setting: with the gate open and
--      confirmations off, anybody could create unlimited accounts against
--      addresses they do not own.
--
--   ❌ **BLOCKER — `rate_limit_email_sent = 2`.** That is TWO confirmation
--      emails PER HOUR, PROJECT-WIDE, on Supabase's built-in sender. With
--      confirmations on and the gate open, the THIRD person to sign up in any
--      hour never receives their email and simply cannot get in — silently, with
--      no error anywhere, because from GoTrue's point of view nothing failed.
--      An open beta on the default sender is a funnel with a ceiling of two
--      players an hour.
--      THE FIX IS NOT A BIGGER NUMBER: the built-in sender is explicitly not for
--      production volume. Configure a custom SMTP provider (Resend, Postmark,
--      SES — all have free tiers at this scale), then raise this limit to match
--      what that provider allows. This is Tyler's call and it is the one thing
--      that must happen BEFORE the open beta is announced. The database is
--      indifferent to it; the players are not.
--
--   ✅ ANONYMOUS SIGN-INS ARE OFF. `external_anonymous_users_enabled = false`.
--      They would create an auth.users row through a path with no invite
--      semantics at all.
--
--   ✅ THE BEFORE-USER-CREATED HOOK IS REGISTERED, at
--      `pg-functions://postgres/public/hr_signup_gate`. It was b457's ops step
--      and it matters MORE now: the per-IP account brake in §5 lives in the hook
--      and CANNOT live in the trigger (no client IP exists there). If it is ever
--      switched off, the invite gate still enforces but the open beta has no
--      account brake at all.
--
--   ⚠  RECOMMENDED, NOT DONE HERE — three free hardenings whose value goes up
--      the moment "a signed-in account" stops meaning "somebody Tyler invited":
--        · `security_captcha_enabled = false` → turn on hCaptcha/Turnstile for
--          sign-up. It is the single most effective bot brake available and the
--          per-IP limit is not a substitute for it (a botnet defeats an IP key
--          outright; see 2026-08-13-anon-rate-gate.sql's residual note).
--        · `password_hibp_enabled = false` → leaked-password protection, free.
--        · `password_min_length = 6` → 8 is the current floor everywhere else.
--      All three are dashboard toggles and none of them touches this schema.
--
-- tests/beta-invite-gate.mjs --live asserts the hook registration and the
-- anonymous-sign-in setting, and now also reads the switch out of hr_settings
-- so it asserts whichever set of negatives the current position promises.
--
-- Verify the whole database half in one command:
--     node tests/open-beta.mjs
-- and the live half (needs a token):
--     node tests/beta-invite-gate.mjs --live
-- ════════════════════════════════════════════════════════════════════════════

-- The file must END on a statement, not on a comment banner (run-smoke's
-- SQL-terminator guard). This one earns its place by printing the switch's
-- actual state into the apply log, where whoever ran it is looking.
do $$
declare v_v text; v_n bigint;
begin
  select value into v_v from public.hr_settings where key = 'beta_gate';
  select count(*) into v_n from public.beta_invites where used_by is null;
  raise notice 'open-beta: APPLIED. beta_gate = % (% = OPEN: no invite code required).', v_v,
    case when v_v = 'off' then 'off' else 'NOT off — the beta is still CLOSED' end;
  raise notice 'The % unused invite codes still work and are still one-use.', v_n;
  raise notice 'TO CLOSE THE BETA AGAIN: update public.hr_settings set value = ''on'' where key = ''beta_gate'';';
  raise notice 'DASHBOARD CHECKS (see §9): email confirmations ON, auth rate limits, before-user-created hook '
               'registered, anonymous sign-ins OFF.';
end $$;
