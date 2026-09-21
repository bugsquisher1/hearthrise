-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-21-world-tick-settle-fence.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE DOOR THE WORLD TICK SETTLES THROUGH, AND THE ONLY ONE.
-- Closes S-1, S-3 and S-7 of docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md
-- (VERDICT: GO-WITH-CHANGES), and installs the kill switch and the SHADOW flag
-- that milestone 1 of the live-world program is rolled out behind.
--
-- ⚠ NOTHING IN THIS FILE MOVES VALUE ON ITS OWN, AND NOTHING IN IT CAN BE
--   REACHED BY A CLIENT. It creates one operator table, one measurement table
--   and one SECURITY DEFINER function granted to `hr_engine` alone. The
--   operator table ships `enabled = false` and `shadow = true`, so applying
--   this file changes the behaviour of exactly nothing until somebody writes
--   a row by hand.
--
-- ── S-1, AND WHY THE MONEY FUNCTION IS STILL UNTOUCHED ──────────────────────
-- Security proved by execution that 2026-09-20-world-tick-roster.sql's grant of
-- `hr_apply` to `hr_tick` does not work: hr_apply's impersonation seam reads
--
--     v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
--     if v_role = 'hr_engine' then v_uid := coalesce(p_user, auth.uid());
--
-- — a LITERAL test. `hr_tick` falls to the else branch, `auth.uid()` is NULL for
-- a nologin role, and every tick settle is refused `forbidden_impersonation`:
-- the highest-signal anti-cheat alert this system has, generated once per flush
-- per character by our own infrastructure.
--
-- The verdict offered two ways out, and named its preference: splice hr_apply's
-- seam (a lane-C migration on the function that writes all player value, with a
-- live-hash move and its own adversarial review), or let the tick present
-- `hr_engine`. THIS FILE TAKES A THIRD, STRICTLY NARROWER ROUTE, which is only
-- available because milestone 1 has no always-on host (the budget freeze of
-- 2026-08-17 stands and no spend was approved):
--
--   * The M1 tick driver is `pg_cron` → `pg_net` → the hr-accrue Edge Function
--     (2026-09-21-world-tick-cron.sql). The edge ALREADY issues
--     `set local role hr_engine` inside its apply transaction and ALREADY holds
--     EXECUTE on hr_apply — it has been the only writer since 2026-08-11.
--   * The `role` GUC survives a SECURITY DEFINER boundary (it is the request's
--     role, not `current_user`), so a definer function called by the edge
--     reaches hr_apply as `hr_engine` and the seam accepts it UNCHANGED.
--     Measured, not assumed: e12 below executes exactly this transition.
--
-- So the writer is the role it has always been, hr_apply's body is untouched,
-- no live hash moves, and the tick gains no new value privilege whatsoever.
--
-- ── WHAT THE FENCE BUYS THAT "LET THE TICK PRESENT hr_engine" DOES NOT ──────
-- A compromised edge deploy could, before this file, call hr_apply for ANY user
-- with ANY delta. It still can — that is the standing, accepted posture and
-- this file does not change it. What this file refuses to ADD is a SECOND way
-- to do it that is easier to reach and harder to see:
--
--   THE SELECTOR AND THE SETTLER ARE DIFFERENT ROLES.
--     `hr_tick_roster` — which stamps the lease — is executable by `hr_tick`
--     and by nothing else (and `hr_tick` is not a role the edge can become).
--     `hr_tick_settle` — which pays — is executable by `hr_engine` and by
--     nothing else, and REFUSES any character the roster has not leased to the
--     caller, in the caller's own name, inside the lease window.
--   So "choose whose world ticks" is not a request field, not a config value
--   and not a privilege the settling role holds. It is a row somebody else
--   wrote. A tick host that wanted to settle a character it was not handed
--   would have to first become a role it cannot become.
--
-- ── S-3: THE SECOND DEFENCE, WHICH DID NOT EXIST ────────────────────────────
-- The roster file's header claimed twice that "hr_apply clamps accrued_to into
-- [old, now()], so a replayed window is refused on arithmetic even if the key
-- were lost". Security executed it and it is FALSE:
--
--     replayed window  ok=true  gold=100 -> 200  ver=3
--     accrued_to moved? NO (clamped to greatest(old, proposed))
--
-- hr_apply clamps the TIMESTAMP and applies the VALUE anyway. A fresh version
-- carrying an already-settled window pays twice and moves the watermark zero
-- milliseconds. The only real defence was the version compare-and-set, and the
-- tick's idempotency key was the weaker of the two available spellings because
-- it omitted `version`.
--
-- This file supplies the missing defence, in SQL, under the row lock, and it is
-- independent of both the key and the version:
--
--     select ... from public.player_state ... FOR UPDATE;      -- the lock FIRST
--     if p_window_from < v_st.accrued_to then                  -- then the CAS
--       return ... 'window_already_settled' ...
--
-- A COMPARE-AND-SET ON THE SETTLED WATERMARK. The window a caller names must
-- start at or after the watermark the locked row currently holds. Equality is
-- the honest deferral boundary (`settledWatermarkMs` stamps the next window's
-- `from` AT the previous watermark), so nothing correct is refused and every
-- replay is. Combined with `p_delta->>'accrued_to' = p_window_to`, which binds
-- the DECLARED window to the PAID one, a caller cannot claim a fresh ten-second
-- window and hand over an hour of value.
--
-- Three independent defences now, where the lane claimed two and had one:
--     1. the idempotency key (now carrying `version` and the window END — S-3)
--     2. hr_apply's version compare-and-set under its own row lock
--     3. THIS watermark compare-and-set, which needs neither of the above
--
-- ── S-7: THE RNG ORACLE IS NARROWED, NOT MERELY ACCEPTED ────────────────────
-- The roster file granted `hr_seed` to `hr_tick` unscoped — any user, any label.
-- Security accepted it as residual on the grounds that `hr_engine` has held the
-- same privilege since 2026-08-11. That argument is sound and it is also the
-- reason the grant is unnecessary: the M1 tick IS the edge, and the edge already
-- holds it. 2026-09-20-world-tick-roster.sql §5 now REVOKES it from `hr_tick`,
-- which ends the milestone with the tick role holding exactly one EXECUTE.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §0  Preflight anchors. Fails closed if what it builds on is absent.
--   §1  `hr_tick_config` — the singleton operator row. THE KILL SWITCH
--       (`enabled`) and the SHADOW flag (`shadow`), flippable with one UPDATE
--       and no deploy. Ships disabled and shadowed.
--   §2  `hr_tick_shadow` — what the tick WOULD have paid. Append-only, pruned.
--   §3  `hr_tick_settle(...)` — THE DOOR. Lease + watermark CAS + kill switch +
--       shadow, then `hr_apply` verbatim.
--   §4  Grants. `revoke ... from public` first, then the single grant.
--   §5  Retention for `hr_tick_shadow`, scheduled here (CLAUDE.md: an
--       append-only table's retention ships in the migration that creates it).
--   §6  Self-check, EXECUTED, on PROBE ROWS ONLY, rolled back regardless.
--
-- ── ROW VOLUME, THE NUMBER THAT BINDS ───────────────────────────────────────
-- Reliability's ceiling (docs/design/restore-runbook.md §14): `hr_ledger_prune`
-- deletes at most 480,000 rows/day, and one ledger row per 10 s tick reaches
-- that at ~56 continuously-active characters. THE UNIT OF JOURNALLING IS THE
-- SETTLED FLUSH WINDOW, NEVER THE TICK — services/world-tick/gather.js RULE 3,
-- one `hr_apply` call per 90 s flush carrying one folded journal row.
--
--     50 active characters, 90 s flush : 50 x 960 =  48,000 ledger rows/day
--     50 active characters, 10 s flush : 50 x 8640 = 432,000  ← 90% of ceiling
--     shadow rows are the SAME rate, in hr_tick_shadow, pruned at 14 days
--
-- `hr_tick_shadow` is therefore budgeted at 48,000 rows/day at beta size and is
-- pruned hourly to a 14-day window (~672k rows, ~270 MB at 407 B/row — measured
-- rate, same shape as player_ledger). ARMING AT A 10 S FLUSH IS A DECISION WITH
-- A ROWS/DAY NUMBER ATTACHED and it is Reliability's to make, not this file's:
-- `hr_tick_config.flush_seconds` ships at 90.
--
-- REVERSIBLE: `update public.hr_tick_config set enabled = false;` stops every
-- tick settle dead, with no deploy, no schema change and no player-visible
-- effect — the accrual path resumes from `accrued_to`, which is exactly where
-- the tick left it. A full undo is `drop function hr_tick_settle` +
-- `drop table hr_tick_shadow, hr_tick_config`. Re-applying this file is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first — player_state is missing';
  end if;
  if to_regclass('public.hr_tick_ownership') is null then
    raise exception 'run 2026-09-20-world-tick-roster.sql first — hr_tick_ownership is missing';
  end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — the fence has nothing to call';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'hr_engine role missing — run 2026-08-11-player-state.sql first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_tick') then
    raise exception 'run 2026-09-20-world-tick-roster.sql first — hr_tick is missing';
  end if;
end $$;

-- ── §1 THE OPERATOR ROW — KILL SWITCH AND SHADOW FLAG ───────────────────────
-- A SINGLETON. `id boolean primary key check (id)` is the narrowest spelling of
-- "there is exactly one of these": a second row is refused by the primary key
-- and a `false` row by the check, so an operator cannot create a shadow config
-- that some code path reads instead.
--
-- EVERY FLAG HERE FAILS CLOSED. A missing row, an unreadable table or a NULL
-- reads as "the tick is off", because §3 requires `enabled` to be TRUE and
-- requires the row to exist. That is the same direction as every gate in
-- CLAUDE.md §6 — never restore or evict on uncertainty.
create table if not exists public.hr_tick_config (
  id              boolean     primary key default true,
  -- THE KILL SWITCH. One UPDATE, no deploy, effective on the next call.
  enabled         boolean     not null default false,
  -- SHADOW MODE. While true, hr_tick_settle computes and JOURNALS what would
  -- have been paid and pays NOTHING. This is the 48 h production parity window
  -- the live-world brief's step 1 asks for.
  shadow          boolean     not null default true,
  -- How often the cron driver fires, and how much time one hr_apply covers.
  -- `flush_seconds` is the ROW-VOLUME lever and its default is Reliability's
  -- measured line (see the header's rows/day table).
  cadence_seconds int         not null default 10,
  flush_seconds   int         not null default 90,
  -- Blast radius per tick, and the lease the roster stamps.
  batch_limit     int         not null default 200,
  lease_ms        int         not null default 30000,
  -- Which channels the tick owns. GATHER first (WORLD_TICK_DESIGN.md §15a).
  channels        text[]      not null default array['gather']::text[],
  -- THE CURSOR. The driver settles the roster in batches; a slow tick resumes
  -- where it stopped rather than starving the tail of the roster.
  cursor_user     uuid,
  cursor_at       timestamptz,
  -- The third term of the keyset. `(accrued_to, user_id, slot)` is a TOTAL
  -- order; without the slot a character with two active slots at the same
  -- instant makes the boundary ambiguous, and the ambiguity resolves as a
  -- re-serve. See the sentinel note in 2026-09-20-world-tick-roster.sql §4.
  cursor_slot     int,
  -- Where pg_net posts. NOT A SECRET (the secret is in Vault, see the cron
  -- file) — this is the public Edge Function URL and it is a config value so
  -- that a project move is an UPDATE rather than a migration.
  --
  -- ⚠ IT IS ALSO THE MOST DANGEROUS COLUMN ON THIS ROW, which is why it is the
  --   one column that used to carry no CHECK while every tunable beside it
  --   did (Security M-5, 2026-09-21). One UPDATE here re-aims `net.http_post`
  --   — carrying `Authorization: Bearer <hr_tick_gateway_key>`,
  --   `X-HR-Tick-Auth: <hr_tick_shared_secret>` AND the full `hr_state_of`
  --   envelope of every rostered character — at any host, in plaintext if the
  --   scheme says so. Executed before the constraint existed, the column
  --   accepted `http://attacker.example/collect`,
  --   `http://169.254.169.254/latest/meta-data/`, `file:///etc/passwd`,
  --   `ftp://x/` and `''`.
  --
  --   No client or engine role can write this row (§ RLS below, and e22c
  --   executes the refusal for all five roles), so the trigger is OPERATOR
  --   ERROR or post-compromise, not a reachable client exploit — the
  --   Coordinator types this URL by hand at step 4 of the runbook and a typo
  --   that RESOLVES is a two-secret leak. The constraint turns that into a
  --   constraint violation.
  edge_url        text,
  updated_at      timestamptz not null default now(),
  note            text,
  constraint hr_tick_config_singleton_ck  check (id),
  constraint hr_tick_config_cadence_ck    check (cadence_seconds between 5 and 300),
  constraint hr_tick_config_flush_ck      check (flush_seconds between 10 and 900),
  constraint hr_tick_config_batch_ck      check (batch_limit between 1 and 500),
  constraint hr_tick_config_lease_ck      check (lease_ms between 5000 and 300000),
  -- The flush may not be shorter than the cadence: a flush per tick is the
  -- ledger-volume failure the header prices.
  constraint hr_tick_config_flush_ge_cadence_ck check (flush_seconds >= cadence_seconds),
  -- ★ M-5. PINNED TO THIS PROJECT'S FUNCTIONS ORIGIN, https ONLY.
  --   NULL is allowed and is the DISARMED state the singleton is created in:
  --   the driver refuses to post on a null or empty url (`no_edge_url`), so
  --   "unset" stays reachable without being "anything".
  --   `like` and not a regex: the pattern is an exact origin prefix with one
  --   trailing wildcard for the function path, so there is no alternation, no
  --   anchoring subtlety and nothing for a reader to get wrong. A host that
  --   merely CONTAINS the project ref cannot satisfy a prefix match, and the
  --   scheme is part of the prefix, so `http://` fails on the same line.
  constraint hr_tick_config_edge_url_ck check (
    edge_url is null
    or edge_url like 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/%')
);

alter table public.hr_tick_config enable row level security;
alter table public.hr_tick_config force row level security;
do $$
begin
  execute 'revoke all on public.hr_tick_config from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

-- The singleton, DISARMED. `on conflict do nothing` so a re-apply never resets
-- an operator's tuning — the one thing a re-runnable migration must not do to a
-- kill switch is turn it back on.
insert into public.hr_tick_config (id) values (true) on conflict (id) do nothing;

-- ── §2 THE SHADOW JOURNAL — WHAT WOULD HAVE BEEN PAID ───────────────────────
-- Step 1 of the live-world sequence: "runs the engines on a clock for active
-- characters and logs what it WOULD write, compared against what accrual-on-
-- return actually writes". This is that log. It is NOT player value: nothing
-- reads it to decide a number a player can spend, and losing every row of it
-- costs a measurement, not a progression (tests/restore-census.baseline.json
-- classifies it `operational` + `player_value_exempt` on exactly that basis).
create table if not exists public.hr_tick_shadow (
  id           bigserial   primary key,
  at           timestamptz not null default now(),
  user_id      uuid        not null,
  slot         int         not null,
  channel      text        not null,
  holder       text        not null,
  window_from  timestamptz not null,
  window_to    timestamptz not null,
  version      bigint      not null,
  intent_id    uuid        not null,
  -- The proposed delta, verbatim, so parity is measured against the object
  -- hr_apply would have received rather than against a summary of it.
  delta        jsonb       not null,
  -- Denormalised so a 48 h parity read is one GROUP BY and not a jsonb walk.
  would_gold   bigint      not null default 0,
  would_qty    bigint      not null default 0,
  would_ticks  bigint      not null default 0,
  constraint hr_tick_shadow_window_ck  check (window_to > window_from),
  constraint hr_tick_shadow_channel_ck check (channel in ('combat','gather','artisan'))
);

-- THE REPLAY DEFENCE, IN SHADOW TOO. A shadow run that double-counted would
-- make the parity number it exists to produce a lie.
create unique index if not exists hr_tick_shadow_intent_uidx
  on public.hr_tick_shadow (user_id, slot, intent_id);
create index if not exists hr_tick_shadow_at_idx on public.hr_tick_shadow (at);

alter table public.hr_tick_shadow enable row level security;
alter table public.hr_tick_shadow force row level security;
do $$
begin
  execute 'revoke all on public.hr_tick_shadow from public, anon, authenticated, service_role, hr_engine, hr_tick';
  execute 'revoke all on sequence public.hr_tick_shadow_id_seq from public, anon, authenticated, service_role, hr_engine, hr_tick';
end $$;

-- ── §3 hr_tick_settle — THE DOOR ────────────────────────────────────────────
-- Everything the fence refuses, in the order it refuses it, and every refusal
-- is a RETURNED CODE rather than an exception: the driver settles a batch and a
-- refused character must not abort the other 199.
create or replace function public.hr_tick_settle(
  p_holder      text,
  p_user        uuid,
  p_slot        int,
  p_channel     text,
  p_version     bigint,
  p_window_from timestamptz,
  p_window_to   timestamptz,
  p_intent_id   uuid,
  p_delta       jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  -- One cadence of tolerance for a host clock that runs ahead. Beyond it the
  -- window is refused rather than clamped: WORLD_TICK_DESIGN.md §8 asks for
  -- skew to show up as refusals and never as mints, and a refusal is countable
  -- (hr_rejections) where a silent clamp is not.
  c_skew     constant interval := interval '60 seconds';
  c_payable  constant text[]   := array['combat','gather','artisan'];
  v_role     text;
  v_cfg      public.hr_tick_config%rowtype;
  v_st       public.player_state%rowtype;
  v_own      public.hr_tick_ownership%rowtype;
  v_declared timestamptz;
  v_mark     timestamptz;
  v_out      jsonb;
begin
  -- ── (0) IDENTITY. The PRIMARY control is the GRANT in §4: this function is
  --        executable by `hr_engine` and by nothing a request can arrive as.
  --        The GUC test is the SECONDARY one, and it is also the mechanism the
  --        whole design rests on — `current_setting('role')` is the REQUEST's
  --        role and survives this definer boundary, so hr_apply below sees
  --        `hr_engine` and its seam accepts without being touched. e12 executes
  --        this exact transition.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_settle: not callable by %', v_role using errcode = '42501';
  end if;

  -- ── (1) THE KILL SWITCH, READ FIRST AND FAILING CLOSED. A missing row is
  --        "off", not "default on".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled', 'mode', 'off');
  end if;

  -- ── (2) ARGUMENTS ARE CLAMPED AND BOUND, NEVER TRUSTED. There is no client
  --        on this path today, which is exactly why the checks go in now.
  if p_user is null or p_slot is null or p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_channel is null or not (p_channel = any (c_payable)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_payable');
  end if;
  if not (p_channel = any (v_cfg.channels)) then
    return jsonb_build_object('ok', false, 'error', 'channel_not_owned_by_tick');
  end if;
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  if p_window_from is null or p_window_to is null or p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_window_to > now() + c_skew then
    -- A fast clock. Refused, never clamped. §8.
    return jsonb_build_object('ok', false, 'error', 'window_in_future',
      'skew_ms', floor(extract(epoch from (p_window_to - now())) * 1000));
  end if;
  -- ── THE DECLARED WINDOW IS BOUND TO THE PAID ONE. Without this a caller
  --    could name a harmless ten-second window (which the watermark CAS below
  --    would happily accept) and hand over an hour of value in the delta. The
  --    engine always stamps `delta.accrued_to` with the instant it accounted
  --    for, so this is an identity for an honest caller and a refusal for
  --    every other one.
  v_declared := nullif(p_delta->>'accrued_to', '')::timestamptz;
  if v_declared is null or v_declared <> p_window_to then
    return jsonb_build_object('ok', false, 'error', 'window_delta_mismatch',
      'declared', v_declared, 'window_to', p_window_to);
  end if;

  -- ── (3) THE LOCK, TAKEN BEFORE ANY COMPARISON. Everything below is a
  --        compare-and-set against a row nobody else can move until this
  --        transaction ends. hr_apply takes the same lock on the same row in
  --        the same transaction, which is re-entrant and therefore free.
  select * into v_st from public.player_state
   where user_id = p_user and slot = p_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  -- ── (4) THE LEASE. "Choose whose world ticks" ends here: the caller must
  --        name a character the ROSTER handed it, in its own holder name,
  --        inside the lease window. The roster is executable by `hr_tick` and
  --        by nothing else — a settling role cannot stamp its own lease.
  select * into v_own from public.hr_tick_ownership
   where user_id = p_user and slot = p_slot and channel = p_channel for update;
  if not found or not v_own.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_own.lease_holder is distinct from p_holder
     or v_own.lease_until is null or v_own.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease',
      'holder', v_own.lease_holder, 'until', v_own.lease_until);
  end if;

  -- ── (5) THE POINTER MUST STILL BE WHERE THE ROSTER SAW IT. A player who
  --        switched activity mid-flush has already settled the old channel
  --        through the edge; paying the tick's batch on top of that is the
  --        double pay by another route.
  if v_st.active_kind is distinct from p_channel then
    return jsonb_build_object('ok', false, 'error', 'channel_moved',
      'active_kind', v_st.active_kind);
  end if;

  -- ── (6) ★ THE WATERMARK COMPARE-AND-SET ★ — S-3's missing second defence.
  --        The window a caller names must begin at or after the watermark the
  --        LOCKED row holds. `settledWatermarkMs` stamps the next window's
  --        `from` exactly AT the previous watermark, so an honest deferral is
  --        equality and is accepted; an already-settled window is strictly
  --        less and is refused, whatever its version and whatever its key.
  --        This holds against a client accrue, a client collect, a second tick
  --        process and a replay of this very call.
  -- THE MARK THE CAS COMPARES AGAINST. When armed it IS `accrued_to`, because
  -- the tick's own payments move it. When SHADOWED the tick pays nothing, so
  -- `accrued_to` would stand still and the tick would propose [T0,T0+10], then
  -- [T0,T0+20], then [T0,T0+30] — overlapping windows, all journalled, and a
  -- 48 h parity sum that counts the same minutes many times over. The shadow
  -- mark is what it chains on instead, and `greatest` keeps it from ever being
  -- behind a client accrue that landed in the middle.
  v_mark := case when v_cfg.shadow
                 then greatest(v_st.accrued_to, coalesce(v_own.shadow_accrued_to, v_st.accrued_to))
                 else v_st.accrued_to end;
  if p_window_from < v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_from', p_window_from, 'accrued_to', v_mark, 'shadow', v_cfg.shadow);
  end if;
  if p_window_to <= v_mark then
    return jsonb_build_object('ok', false, 'error', 'window_already_settled',
      'window_to', p_window_to, 'accrued_to', v_mark, 'shadow', v_cfg.shadow);
  end if;

  -- ── (7) The version, checked here so the refusal has a tick-shaped name and
  --        a batch can carry on. hr_apply checks it again under its own lock
  --        and is the authority; this is an early, cheaper copy of its answer.
  if p_version is null or p_version <> v_st.version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict',
      'held', p_version, 'current', v_st.version);
  end if;

  -- ── (8) SHADOW MODE. Journal what WOULD have been paid; pay nothing. There
  --        is no hr_apply call on this branch and there must never be one —
  --        e15 asserts gold, version and accrued_to are all unmoved after a
  --        shadow settle, and e16 asserts a shadow row was nonetheless written.
  if v_cfg.shadow then
    insert into public.hr_tick_shadow
      (user_id, slot, channel, holder, window_from, window_to, version,
       intent_id, delta, would_gold, would_qty, would_ticks)
    values
      (p_user, p_slot, p_channel, p_holder, p_window_from, p_window_to, p_version,
       p_intent_id, p_delta,
       coalesce((p_delta->>'gold')::bigint, 0),
       coalesce((p_delta#>>'{journal,meta,qty}')::bigint, 0),
       coalesce((p_delta#>>'{journal,meta,ticks}')::bigint, 0))
    on conflict (user_id, slot, intent_id) do nothing;
    -- CHAIN. The next shadow window starts where this one ended, exactly as an
    -- armed window would start where hr_apply left `accrued_to`.
    update public.hr_tick_ownership
       set shadow_accrued_to = p_window_to, updated_at = now()
     where user_id = p_user and slot = p_slot and channel = p_channel;
    return jsonb_build_object('ok', true, 'mode', 'shadow', 'paid', false,
      'window_to', p_window_to);
  end if;

  -- ── (9) ARMED. hr_apply, verbatim, as `hr_engine` — the role the request
  --        already carries. No second writer, no fast path, no tick-specific
  --        clamp. It re-validates every invariant regardless of caller.
  v_out := public.hr_apply(p_user, p_slot, p_version, p_intent_id, p_delta);
  if coalesce((v_out->>'ok')::boolean, false) then
    -- ARMED PAYMENTS CLEAR THE SHADOW MARK. `accrued_to` is the authority again
    -- from here, and a stale shadow mark left lying around would be a second
    -- watermark nobody reads — which is how a mark that is WRONG survives long
    -- enough to be believed the next time somebody re-enters shadow.
    update public.hr_tick_ownership
       set shadow_accrued_to = null, updated_at = now()
     where user_id = p_user and slot = p_slot and channel = p_channel;
  end if;
  return v_out || jsonb_build_object('mode', 'armed', 'paid',
    coalesce((v_out->>'ok')::boolean, false));
end $$;

-- ── §4 GRANTS ───────────────────────────────────────────────────────────────
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2).
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb) from anon, authenticated, service_role;
-- ⚠ NOT GRANTED TO `hr_tick`, AND THAT IS DELIBERATE. `hr_tick` reaching this
--   function would reach hr_apply carrying `role = hr_tick`, which hr_apply's
--   untouched seam refuses — so the grant would install a door that cannot
--   open and would journal a forgery alert every time it was tried (S-1). The
--   always-on-host variant of this program needs the hr_apply seam splice
--   first, as its own lane-C migration with its own review. e13 asserts the
--   absence of this grant so that it cannot be added by convenience later.
grant execute on function public.hr_tick_settle(text, uuid, int, text, bigint, timestamptz, timestamptz, uuid, jsonb) to hr_engine;

-- ── §5 RETENTION ────────────────────────────────────────────────────────────
-- An append-only table's retention policy ships in the migration that creates
-- the table (2026-08-11-player-state.sql §9b), not in a runbook. 14 days: the
-- parity window the live-world brief asks for is 48 h, and 14 days leaves room
-- to re-read a week-old regression without leaving the table unbounded.
create or replace function public.hr_tick_shadow_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  with doomed as (
    select id from public.hr_tick_shadow
     where at < now() - interval '14 days'
     order by id limit greatest(1, least(coalesce(p_limit, 20000), 200000))
  )
  delete from public.hr_tick_shadow s using doomed d where s.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_tick_shadow_prune(int) from public, anon, authenticated, service_role, hr_engine, hr_tick;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-tick-shadow-prune'', ''27 * * * *'', '
                 '''select public.hr_tick_shadow_prune(20000)'')';
  else
    perform public.hr_cron_ensure('hr-tick-shadow-prune', '27 * * * *',
      'select public.hr_tick_shadow_prune(20000)');
  end if;
end $$;

-- ── §6 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY. Every row this block touches is one it inserted itself,
-- under a uuid `gen_random_uuid()` cannot mint, and every predicate binds
-- `v_u` — a variable this block declared (tests/selfcheck-no-global-dml.mjs).
-- The whole block is rolled back regardless of outcome.
do $$
declare
  v_u    uuid := '00000000-0000-4000-8000-00000000f1ce';
  v_act  text;
  v_r    jsonb;
  v_n    int;
  v_g    bigint;
  v_v    bigint;
  v_w    timestamptz;
  v_from timestamptz := now() - interval '10 minutes';
  v_to   timestamptz := now() - interval '5 minutes';
  v_d    jsonb;
  v_txt  text;          -- e22's loop variable: urls, then role names
begin
  begin
    -- ── e1: the config singleton exists and SHIPS DISARMED. The single most
    --        important property of applying this file: it changes nothing.
    select count(*) into v_n from public.hr_tick_config;
    if v_n <> 1 then raise exception 'e1: hr_tick_config holds % rows, expected exactly 1', v_n; end if;
    if exists (select 1 from public.hr_tick_config where enabled) then
      raise exception 'e1b: hr_tick_config shipped ENABLED — applying this file would start the tick';
    end if;
    if exists (select 1 from public.hr_tick_config where not shadow) then
      raise exception 'e1c: hr_tick_config shipped out of SHADOW';
    end if;

    -- ── e2: the singleton bites. A second row and a `false` row are both
    --        refused, so no code path can read a shadow config.
    begin
      insert into public.hr_tick_config (id) values (false);
      raise exception 'e2: hr_tick_config accepted a second (id=false) row';
    exception when check_violation or unique_violation then null;
    end;

    -- ── e3: neither new table is reachable by any client or engine role, in
    --        either direction, and RLS is enabled AND forced on both.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public'
                  and table_name in ('hr_tick_config', 'hr_tick_shadow')
                  and grantee in ('public','anon','authenticated','service_role','hr_engine','hr_tick')) then
      raise exception 'e3: a tick table carries a grant for a client or engine role';
    end if;
    select count(*) into v_n from pg_class
     where oid in ('public.hr_tick_config'::regclass, 'public.hr_tick_shadow'::regclass)
       and relrowsecurity and relforcerowsecurity;
    if v_n <> 2 then raise exception 'e3b: RLS is not enabled+forced on both tick tables'; end if;
    select count(*) into v_n from pg_policies
     where schemaname = 'public' and tablename in ('hr_tick_config', 'hr_tick_shadow');
    if v_n <> 0 then raise exception 'e3c: a tick table grew % policy/policies — it must have NONE', v_n; end if;

    -- ── e4: the flush may not be shorter than the cadence (the ledger-volume
    --        constraint from the header, enforced rather than documented).
    begin
      update public.hr_tick_config set cadence_seconds = 60, flush_seconds = 10 where id;
      raise exception 'e4: a flush shorter than the cadence was accepted';
    exception when check_violation then null;
    end;

    -- ── THE PROBE CHARACTER. A synthetic uuid, its own auth.users row, its own
    --    player_state row, its own ownership row. Nothing pre-existing is read
    --    for identity and nothing pre-existing is written.
    select activity_id into v_act from public.hr_activities where kind = 'gather' limit 1;
    if v_act is null then
      raise notice 'self-check SKIPPED past e4: no gather activity in hr_activities to point a probe at';
      raise exception 'HR921_ROLLBACK_OK';
    end if;
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 0, 0, 10, 10, 1, v_from, 'gather', v_act, v_from - interval '1 hour');
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_u, 0, 'gather', true, 'selfcheck', now() + interval '5 minutes');

    v_d := jsonb_build_object(
      'gold', 100,
      'accrued_to', to_jsonb(v_to),
      'journal', jsonb_build_object('kind','gather','intent','accrue',
        'meta', jsonb_build_object('src','tick','qty',7,'ticks',3)));

    -- ── e5: THE KILL SWITCH. With `enabled = false` — the shipped state —
    --        the door refuses before it looks at anything else.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-0000000000e5', v_d);
    if coalesce(v_r->>'error','') <> 'tick_disabled' then
      raise exception 'e5: the kill switch did not refuse (%)', v_r;
    end if;

    -- ── e6..e11 run with the tick ENABLED and still in SHADOW.
    update public.hr_tick_config set enabled = true, shadow = true where id;

    -- ── e6: NO LEASE, NO SETTLE. The lease is released and the same call is
    --        refused — "choose whose world ticks" is a row somebody else wrote.
    update public.hr_tick_ownership set lease_until = now() - interval '1 second'
     where user_id = v_u and slot = 0 and channel = 'gather';
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-0000000000e6', v_d);
    if coalesce(v_r->>'error','') <> 'no_lease' then
      raise exception 'e6: an expired lease still settled (%)', v_r;
    end if;
    -- ...and a DIFFERENT holder is refused even while the lease is live.
    update public.hr_tick_ownership set lease_until = now() + interval '5 minutes'
     where user_id = v_u and slot = 0 and channel = 'gather';
    v_r := public.hr_tick_settle('someone-else', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-0000000000e7', v_d);
    if coalesce(v_r->>'error','') <> 'no_lease' then
      raise exception 'e6b: a foreign holder settled a leased character (%)', v_r;
    end if;

    -- ── e7: NOT OWNED is refused even with a live lease in the right name.
    update public.hr_tick_ownership set owned = false
     where user_id = v_u and slot = 0 and channel = 'gather';
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-0000000000e8', v_d);
    if coalesce(v_r->>'error','') <> 'not_tick_owned' then
      raise exception 'e7: an unowned character settled (%)', v_r;
    end if;
    update public.hr_tick_ownership set owned = true
     where user_id = v_u and slot = 0 and channel = 'gather';

    -- ── e8: THE DECLARED WINDOW IS BOUND TO THE PAID ONE. A caller naming a
    --        short window while the delta pays a long one is refused.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from,
             v_to - interval '1 minute',
             '00000000-0000-4000-8000-0000000000e9', v_d);
    if coalesce(v_r->>'error','') <> 'window_delta_mismatch' then
      raise exception 'e8: a delta paying past its declared window was accepted (%)', v_r;
    end if;

    -- ── e9: A FAST CLOCK IS REFUSED, NOT CLAMPED (§8).
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, now(),
             now() + interval '10 minutes', '00000000-0000-4000-8000-00000000000a',
             jsonb_set(v_d, '{accrued_to}', to_jsonb(now() + interval '10 minutes')));
    if coalesce(v_r->>'error','') <> 'window_in_future' then
      raise exception 'e9: a window past the skew tolerance was accepted (%)', v_r;
    end if;

    -- ── e10: ★ THE WATERMARK COMPARE-AND-SET ★ (S-3). A window that starts
    --         BEFORE the locked row's watermark is refused — no version, no
    --         key, no clock involved in the decision.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1,
             v_from - interval '1 minute', v_to,
             '00000000-0000-4000-8000-00000000000b', v_d);
    if coalesce(v_r->>'error','') <> 'window_already_settled' then
      raise exception 'e10: a window behind the settled watermark was accepted (%)', v_r;
    end if;

    -- ── e11: a stale version is refused with a tick-shaped name.
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 999, v_from, v_to,
             '00000000-0000-4000-8000-00000000000c', v_d);
    if coalesce(v_r->>'error','') <> 'version_conflict' then
      raise exception 'e11: a stale version settled (%)', v_r;
    end if;

    -- ── e12: ★ S-1 CLOSED, EXECUTED ★. The honest window, in SHADOW, from the
    --         role the Edge Function already carries. It must SUCCEED — this is
    --         the arm that proves the tick can settle at all — and it must pay
    --         NOTHING.
    set local role hr_engine;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-00000000000d', v_d);
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' <> 'shadow' then
      raise exception 'e12: hr_engine could not settle through the fence (%)', v_r;
    end if;
    if coalesce((v_r->>'paid')::boolean, true) is not false then
      raise exception 'e12b: a SHADOW settle reported paid=true (%)', v_r;
    end if;

    -- ── e13: SHADOW PAID NOTHING. Gold, version and the watermark are all
    --         exactly where they were.
    select gold, version, accrued_to into v_g, v_v, v_w
      from public.player_state where user_id = v_u and slot = 0;
    if v_g <> 0 or v_v <> 1 or v_w <> v_from then
      raise exception 'e13: SHADOW mode moved player state (gold=%, version=%, accrued_to=%)', v_g, v_v, v_w;
    end if;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_u;
    if v_n <> 1 then raise exception 'e13b: SHADOW wrote % journal rows, expected 1', v_n; end if;

    -- ── e14: the shadow journal is replay-safe. The same intent twice is one
    --         row, or the parity number it exists to produce is a lie.
    set local role hr_engine;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-00000000000d', v_d);
    reset role;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_u;
    if v_n <> 1 then raise exception 'e14: a replayed shadow settle wrote % rows', v_n; end if;

    -- ── e15: ARMED, the same window pays exactly once. The second call —
    --         a DIFFERENT idempotency key and the FRESH version hr_apply just
    --         stamped, i.e. precisely the shape Security proved pays twice
    --         against raw hr_apply — is refused by the watermark CAS.
    update public.hr_tick_config set shadow = false where id;
    set local role hr_engine;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', 1, v_from, v_to,
             '00000000-0000-4000-8000-00000000000e', v_d);
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'e15: the armed settle was refused (%)', v_r;
    end if;
    select gold, version, accrued_to into v_g, v_v, v_w
      from public.player_state where user_id = v_u and slot = 0;
    if v_g <> 100 then raise exception 'e15b: the armed settle paid % gold, expected 100', v_g; end if;
    if v_w <> v_to then raise exception 'e15c: the watermark did not advance to the window end (%)', v_w; end if;

    set local role hr_engine;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', v_v, v_from, v_to,
             '00000000-0000-4000-8000-00000000000f', v_d);
    reset role;
    if coalesce(v_r->>'error','') <> 'window_already_settled' then
      raise exception 'e16: ★ DOUBLE PAY ★ — a replayed window with a fresh version and a fresh key was accepted (%)', v_r;
    end if;
    select gold into v_g from public.player_state where user_id = v_u and slot = 0;
    if v_g <> 100 then raise exception 'e16b: ★ DOUBLE PAY ★ — gold reached % on a replayed window', v_g; end if;

    -- ── e17: the kill switch stops an ARMED tick dead, mid-flight.
    update public.hr_tick_config set enabled = false where id;
    set local role hr_engine;
    v_r := public.hr_tick_settle('selfcheck', v_u, 0, 'gather', v_v, v_to,
             v_to + interval '1 minute', '00000000-0000-4000-8000-000000000010',
             jsonb_set(v_d, '{accrued_to}', to_jsonb(v_to + interval '1 minute')));
    reset role;
    if coalesce(v_r->>'error','') <> 'tick_disabled' then
      raise exception 'e17: the kill switch did not stop an armed tick (%)', v_r;
    end if;

    -- ── e18: THE GRANT LIST IS AN EQUALITY, NOT A SUPERSET. Exactly one role
    --         may open this door, and `hr_tick` is not it (see §4).
    -- The owner's own implicit EXECUTE is not a grant anybody reviewed, so it
    -- is excluded by name rather than by count: what this asserts is that
    -- exactly ONE role that is not the owner may open the door.
    select count(*) into v_n from information_schema.role_routine_grants g
     where g.routine_schema = 'public' and g.routine_name = 'hr_tick_settle'
       and g.grantee <> g.grantor;
    if v_n <> 1 then
      raise exception 'e18: hr_tick_settle carries % non-owner grant(s), expected exactly 1 (hr_engine): %',
        v_n, (select string_agg(g.grantee, ',') from information_schema.role_routine_grants g
               where g.routine_schema = 'public' and g.routine_name = 'hr_tick_settle'
                 and g.grantee <> g.grantor);
    end if;
    if not has_function_privilege('hr_engine',
         'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb)', 'execute') then
      raise exception 'e18b: hr_engine cannot execute hr_tick_settle — the tick has no door';
    end if;
    if has_function_privilege('hr_tick',
         'public.hr_tick_settle(text,uuid,int,text,bigint,timestamptz,timestamptz,uuid,jsonb)', 'execute') then
      raise exception 'e18c: hr_tick holds hr_tick_settle — a door that cannot open (S-1)';
    end if;

    -- ── e19: THE SELECTOR AND THE SETTLER ARE DIFFERENT ROLES. This is the
    --         property that makes "choose whose world ticks" unreachable.
    if has_function_privilege('hr_engine',
         'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute') then
      raise exception 'e19: hr_engine can stamp its own lease — the fence is circular';
    end if;
    if has_function_privilege('hr_tick', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
    or has_function_privilege('hr_tick', 'public.hr_seed(uuid,integer,text)', 'execute') then
      raise exception 'e19b: hr_tick holds raw hr_apply or raw hr_seed (S-1/S-7)';
    end if;

    -- ── e20: a client role cannot reach the door. `set local role` is the
    --         same transition PostgREST performs on the JWT's role claim.
    begin
      set local role authenticated;
      begin
        perform public.hr_tick_settle('x', v_u, 0, 'gather', 1, v_from, v_to,
                  '00000000-0000-4000-8000-000000000011', v_d);
        reset role;
        raise exception 'e20: `authenticated` executed hr_tick_settle';
      exception when insufficient_privilege then null;
      end;
      reset role;
    end;

    -- ── e21: ★ THE END-OF-CHAIN GRANT EQUALITY ★ (Security M-4, 2026-09-21).
    --         2026-09-20-world-tick-roster.sql's §5 says the milestone ends
    --         with `hr_tick` holding EXACTLY ONE routine grant, and leaned on
    --         that equality to argue "so a fourth arriving later is a review
    --         failure". THE ASSERTION DID NOT EXIST. e18 counts grants ON
    --         hr_tick_settle (a different question with a different answer),
    --         and the roster's own e6 runs BEFORE this file applies, so
    --         nothing re-checked the invariant at the point the chain actually
    --         ends. An invariant nobody measures at the end is a sentence.
    --
    --         EQUALITY, NOT A SUPERSET: a count of 1 with the wrong member is
    --         still wrong, so the member is named too. The one legitimate
    --         grant is hr_tick_roster — the SELECTOR. If `hr_tick` ever holds
    --         a second routine, or a different one, this apply fails here
    --         rather than in an audit six weeks later.
    select count(*) into v_n from information_schema.role_routine_grants g
     where g.grantee = 'hr_tick' and g.specific_schema = 'public';
    if v_n <> 1 then
      raise exception 'e21: hr_tick holds % routine grant(s), expected exactly 1 (hr_tick_roster): %',
        v_n, coalesce((select string_agg(g.routine_name, ',' order by g.routine_name)
                         from information_schema.role_routine_grants g
                        where g.grantee = 'hr_tick' and g.specific_schema = 'public'), '<none>');
    end if;
    if not has_function_privilege('hr_tick',
         'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)', 'execute') then
      raise exception 'e21b: hr_tick''s one grant is not hr_tick_roster — the selector is gone '
                      'and something else took its place';
    end if;

    -- ── e22: ★ THE edge_url CONSTRAINT BITES, BY EXECUTION ★ (M-5).
    --         PROBE ROWS ONLY: every statement below targets the singleton by
    --         a WHERE that no production row satisfies — `id` is a boolean
    --         primary key whose only legal value is true, so these UPDATEs are
    --         written against `id and false`, which touches ZERO rows, and the
    --         CHECK is exercised by a nested INSERT of a probe row into a
    --         TEMP copy of the table instead. The 2026-09-20 production apply
    --         failed because a self-check UPDATEd every row in a real table;
    --         tests/selfcheck-no-global-dml.mjs is the standing detector and
    --         this block is written to satisfy it rather than to be excused.
    -- INCLUDING DEFAULTS as well as CONSTRAINTS: `LIKE` copies NOT NULL but
    -- not the DEFAULTs behind it, so without this the probe INSERTs fail on
    -- `enabled` being null and e22 would "pass" by never reaching the CHECK.
    create temp table hr921_cfg_probe
      (like public.hr_tick_config including defaults including constraints)
      on commit drop;

    -- the four shapes Security executed against the UNCONSTRAINED column
    foreach v_txt in array array[
      'http://attacker.example/collect',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'ftp://x/',
      '',
      'https://nezapsylztqbbwuwembx.supabase.co.attacker.example/functions/v1/hr-accrue',
      'https://other-project.supabase.co/functions/v1/hr-accrue'
    ] loop
      begin
        insert into hr921_cfg_probe (id, edge_url) values (true, v_txt);
        raise exception 'e22: hr_tick_config.edge_url ACCEPTED %, which re-aims two Vault '
                        'secrets and every rostered envelope at an arbitrary host', v_txt;
      exception
        when check_violation then
          delete from hr921_cfg_probe where id;      -- probe table only
      end;
    end loop;

    -- ── e22b: AND IT IS NOT VACUOUS. The real URL, and NULL (the disarmed
    --          state the singleton ships in), must both still be accepted — a
    --          constraint that refuses everything would pass e22 and make the
    --          tick unarmable.
    begin
      insert into hr921_cfg_probe (id, edge_url)
        values (true, 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue');
      delete from hr921_cfg_probe where id;
      insert into hr921_cfg_probe (id, edge_url) values (true, null);
      delete from hr921_cfg_probe where id;
    exception when check_violation then
      raise exception 'e22b: the edge_url CHECK refuses the REAL function url or NULL — '
                      'the constraint is wrong, not the caller';
    end;

    -- ── e22c: WHO CAN UPDATE THAT COLUMN AT ALL. The constraint is the second
    --          line; the first is that no role a request can arrive as holds
    --          any privilege on the table. RLS is enabled AND forced with zero
    --          policies, so even a grant would not be enough — but the grants
    --          are gone too, and this asserts BOTH rather than trusting §1.
    if not (select relrowsecurity and relforcerowsecurity
              from pg_class where oid = 'public.hr_tick_config'::regclass) then
      raise exception 'e22c: hr_tick_config does not have RLS enabled AND forced';
    end if;
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'hr_tick_config') then
      raise exception 'e22c2: hr_tick_config has a policy — it must have none';
    end if;
    foreach v_txt in array array['anon','authenticated','service_role','hr_engine','hr_tick'] loop
      if has_table_privilege(v_txt, 'public.hr_tick_config', 'UPDATE')
      or has_table_privilege(v_txt, 'public.hr_tick_config', 'INSERT')
      or has_table_privilege(v_txt, 'public.hr_tick_config', 'SELECT') then
        raise exception 'e22c3: % holds a privilege on hr_tick_config — one UPDATE to edge_url '
                        'is a two-secret exfiltration', v_txt;
      end if;
    end loop;

    raise exception 'HR921_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR921_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-settle-fence self-check PASSED (e1-e22); probe rows rolled back';
end $$;
