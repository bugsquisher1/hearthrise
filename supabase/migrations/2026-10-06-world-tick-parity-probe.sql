-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-06-world-tick-parity-probe.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE SHADOW PARITY PROBE — Security ruling 1 of
-- docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md, built to its conditions.
--
-- ── WHAT A PROBE IS ─────────────────────────────────────────────────────────
-- Every 4 h per rostered shadow character, the tick runs ONE single-span
-- accrual over the span its shadow windows tiled, from the SAME stored input
-- and the SAME seed label, and stores the answer beside the windows it is to
-- be read against. tools/world-tick-parity.mjs reads the pair and applies the
-- ruling's acceptance bars. The probe compares the decomposition against one
-- call, never against the ledger, so the offline-cap artefact that the 24 h
-- roster fence exists for cannot enter it (ruling 1, "Why I accept it").
--
-- ── THE LIFECYCLE (edge: supabase/functions/hr-accrue/tick-probe.js) ───────
--   OPEN   on the journalled shadow window that contains the character's probe
--          boundary B_k (a per-character staggered 4 h grid). `input` is the
--          session that window was settled FROM — the snapshot at span_from
--          (rule 4) — and span_from is that window's start.
--   CLOSE  on the window containing B_k + 4 h. The edge reads the stored
--          input back (hr_tick_probe_fetch), runs the one-span accrual over
--          [span_from, that window's end] on hr_seed's label for span_from,
--          and stores the summary (hr_tick_probe_commit). Both ends are real
--          window boundaries, so the chain tiles the span exactly.
--   VOID   anything that cannot close honestly: superseded by a newer opening,
--          a span outside [4 h, 6 h], or no result from the edge. A void is
--          COUNTED by the evaluator as a discard, never silently dropped.
--
-- ── WHAT THIS FILE CREATES, AND THE ONE THING IT MAY WRITE ─────────────────
--   public.hr_tick_probe              its own table. RLS on and FORCED, no
--                                     policy, no grant to any client or engine
--                                     role. The probe's ONLY write target.
--   hr_tick_probe_fetch(...)          STABLE. hr_engine only. Reads one open row.
--   hr_tick_probe_commit(...)         hr_engine only. Writes hr_tick_probe and
--                                     NOTHING ELSE — §7 proves it by execution
--                                     with pg_stat_xact_user_tables over EVERY
--                                     user table, not by a list of the ones we
--                                     thought of.
--   hr_tick_probe_prune(int)          retention, 14 days (hr_tick_shadow's), no
--                                     grant to anyone; pg_cron as the owner.
--   hr_assert_grant_hygiene           LINK 16: two INSERTIONS at the head of
--                                     c_engine_allow (fetch + commit). GENERATED.
--
-- ── RULE BY RULE (ruling 1, "What the probe must NOT be allowed to write") ─
--   1. Nothing but its own rows. No write to player_state (no accrued_to, no
--      shadow_accrued_to, no version), player_ledger, inventory/bank,
--      hr_tick_ownership, hr_kill_credit_log, bestiary, leaderboards,
--      hr_rejections or the frame path. §7 p3 asserts every user table but
--      hr_tick_probe moved ZERO tuples across an open AND a close, and that
--      the player_state and hr_tick_ownership rows hash identically before
--      and after. The probe takes NO row lock on either: a `for share` writes
--      a lock into the tuple header, and "writes nothing" means nothing.
--      Its serialisation is a transaction-scoped ADVISORY lock on
--      (user, slot, channel) plus a partial unique index (one open probe).
--   2. It never advances or reseeds the chain. It does not call
--      hr_tick_settle, does not read or write `shadow_state`, and the edge
--      calls it AFTER the window's settle returned, from a deep copy of the
--      session (tests/world-tick-parity-probe.mjs PP-3: the next real window
--      is byte-identical with and without the probe having run).
--   3. Excluded from 8a/8b/8c and every armed-path read BY TABLE IDENTITY:
--      probe rows never enter hr_tick_shadow or player_ledger, which is what
--      those reads sum. §7 p6 executes the catalogue: no function body other
--      than this file's three mentions hr_tick_probe, so no settle, no
--      roster, no hr_state_of and no stall read can ever sum one.
--   4. Input is the snapshot at t0, stored at OPEN; the seed is hr_seed over
--      the fence's own rendering of span_from (tick.js SEED_LABEL_EXPR).
--      No client value enters: the input is built from hr_state_of + the
--      fence's carrier inside the tick's own request.
--   5. Shadow only, by construction: the anchor is a journalled hr_tick_shadow
--      row at the CHAIN HEAD (`shadow_accrued_to`). An armed settle clears
--      that mark and writes no shadow row, so an armed channel cannot open or
--      close a probe. This file reads no arming flag, so it does not couple to
--      the per-channel arm work (lane/world-tick-channel-arm).
--
-- ── CONCURRENCY AND IDEMPOTENCY ────────────────────────────────────────────
--   * One open probe per (user, slot, channel): partial unique index.
--   * Replay of an OPEN: (user, slot, channel, span_from) unique → no-op.
--   * Replay of a CLOSE: the row is no longer `open` → no-op.
--   * A commit whose window is no longer the chain head (a later fire moved
--     it) is refused `not_chain_head` before it reads a probe row.
--   * The advisory lock serialises two commits for one character; it is never
--     taken by hr_tick_settle, so it cannot deadlock the fence.
--
-- ── COST AT 100x (1,000 rostered shadow characters, two channels max) ──────
--   rows    6 per character per day per channel → 6,000/day, ~84,000 at the
--           14-day prune. A closed row is ~1 KB (the input is NULLed at close).
--           ~85 MB at steady state; open rows carry the input (~2-8 KB measured,
--           65,536-byte CHECK), at most one per character.
--   calls   2 statements per character per 4 h (fetch + commit), on boundary
--           windows only — ~0.14/s fleet-wide. No per-window cost.
--   engine  one single-span accrual (≤ 6 h) per close; MAX_PROBES_PER_FIRE = 4.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
--   `drop function public.hr_tick_probe_commit(...), public.hr_tick_probe_fetch(...),
--    public.hr_tick_probe_prune(int); drop table public.hr_tick_probe;
--    select cron.unschedule('hr-tick-probe-prune');` and re-apply
--   2026-09-28-grant-hygiene-hr-ops.sql (the previous last toucher of the
--   detector). Nothing else moves. The edge half fails soft against a database
--   without the functions (42883 → the probe step is skipped, the fire is not).
--
-- ── AFTER APPLYING ─────────────────────────────────────────────────────────
--   tests/live-hash-drift.mjs is red with ONE deliberate row, measured on this
--   branch (exit 1): `RED replay hr_assert_grant_hygiene(p_strict boolean)` —
--   link 16. The three probe functions are not tracked names. The Coordinator
--   re-seeds with `--live --write` and writes the why from `--codediff`;
--   `touched_by` for the detector gains this filename. restore-census: one new table, hr_tick_probe, classified
--   `operational` + `player_value_exempt` in this branch's baseline.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_tick_shadow') is null
     or to_regclass('public.hr_tick_ownership') is null
     or to_regclass('public.hr_tick_config') is null then
    raise exception 'PRECONDITION: the world-tick tables are absent — apply the 2026-09-2x world-tick chain first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_ownership'
                    and column_name = 'shadow_accrued_to') then
    raise exception 'PRECONDITION: hr_tick_ownership.shadow_accrued_to is absent — the probe anchors on the shadow chain head';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'PRECONDITION: hr_engine does not exist — the probe would be unreachable by the only role allowed to write it';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_assert_grant_hygiene is absent.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene'
         and position('hr_ops_reachable' in p.prosrc) > 0) = 0 then
    raise exception 'PRECONDITION: the INSTALLED hr_assert_grant_hygiene is not link 15''s (no hr_ops_reachable). '
                    'This file derives from 2026-09-28-grant-hygiene-hr-ops.sql''s body; applying it over an older '
                    'detector would revert what that link recorded.';
  end if;
end $$;

-- ── §1 THE TABLE ───────────────────────────────────────────────────────────
-- NOT player value: nothing reads it to decide a number a player can spend,
-- rank or trade, and losing every row costs re-running a parity read.
create table if not exists public.hr_tick_probe (
  id            bigserial   primary key,
  user_id       uuid        not null,
  slot          int         not null,
  channel       text        not null,
  holder        text        not null,
  status        text        not null default 'open',
  void_reason   text,
  -- The span. span_from is the opening window's START (the fence's own
  -- timestamptz, microseconds and all); span_to is the closing window's END.
  span_from     timestamptz not null,
  span_to       timestamptz,
  -- player_state.version as the hr_tick_shadow rows at each end recorded it.
  -- The evaluator discards a probe whose windows do not all carry base_version.
  base_version  bigint      not null,
  version_close bigint,
  -- The edge payload hash (payload-hash.js) at OPEN and at CLOSE. A probe is
  -- counted only when both equal the live payload_sha256 (ruling 1, payload pin).
  payload_open  text        not null,
  payload_close text,
  -- THE SNAPSHOT AT span_from (rule 4). NULLed at close or void, so a row
  -- carries it only while it is open.
  input         jsonb,
  -- THE ONE-SPAN ANSWER: tick-probe.js probeResultOf — the same fields
  -- hr_tick_shadow denormalises from the delta the fence journals.
  result        jsonb,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  constraint hr_tick_probe_channel_ck check (channel in ('combat', 'gather')),
  constraint hr_tick_probe_status_ck  check (status in ('open', 'closed', 'void')),
  constraint hr_tick_probe_payload_ck check (
    payload_open ~ '^([0-9a-f]{64}|unpacked)$'
    and (payload_close is null or payload_close ~ '^([0-9a-f]{64}|unpacked)$')),
  constraint hr_tick_probe_input_ck check (
    input is null or (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 65536)),
  constraint hr_tick_probe_result_ck check (
    result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 16384)),
  constraint hr_tick_probe_span_ck check (
    span_to is null
    or (span_to - span_from >= interval '4 hours' and span_to - span_from <= interval '6 hours')),
  constraint hr_tick_probe_shape_ck check (
       (status = 'open'   and input is not null and result is null and span_to is null)
    or (status = 'closed' and input is null and result is not null and span_to is not null
                          and version_close is not null and payload_close is not null
                          and closed_at is not null)
    or (status = 'void'   and input is null and void_reason is not null))
);

create unique index if not exists hr_tick_probe_open_uidx
  on public.hr_tick_probe (user_id, slot, channel) where status = 'open';
create unique index if not exists hr_tick_probe_span_uidx
  on public.hr_tick_probe (user_id, slot, channel, span_from);
create index if not exists hr_tick_probe_opened_idx on public.hr_tick_probe (opened_at);

alter table public.hr_tick_probe enable row level security;
alter table public.hr_tick_probe force row level security;
do $$
begin
  execute 'revoke all on public.hr_tick_probe from public, anon, authenticated, service_role, hr_engine';
  execute 'revoke all on sequence public.hr_tick_probe_id_seq from public, anon, authenticated, service_role, hr_engine';
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke all on public.hr_tick_probe from hr_tick';
    execute 'revoke all on sequence public.hr_tick_probe_id_seq from hr_tick';
  end if;
end $$;

comment on table public.hr_tick_probe is
  'SHADOW PARITY PROBE (Security ruling 1, 2026-10-05). One single-span accrual per character per 4 h, '
  'stored beside the hr_tick_shadow windows it is read against. Written ONLY by hr_tick_probe_commit; '
  'read by tools/world-tick-parity.mjs. Not player value, never authority, never summed as a window.';

-- ── §2 hr_tick_probe_fetch — READ ONE OPEN PROBE ──────────────────────────
create or replace function public.hr_tick_probe_fetch(
  p_holder  text,
  p_user    uuid,
  p_slot    int,
  p_channel text
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_cfg  public.hr_tick_config%rowtype;
  v_own  public.hr_tick_ownership%rowtype;
  v_row  public.hr_tick_probe%rowtype;
begin
  -- (0) IDENTITY. The primary control is the grant (§5); this is the fence's
  --     own second line, restated.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_probe_fetch: not callable by %', v_role using errcode = '42501';
  end if;
  -- (1) THE KILL SWITCH, failing closed exactly as the fence's does.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled');
  end if;
  if p_holder is null or p_user is null or p_slot is null or p_channel is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_channel not in ('combat', 'gather') then
    return jsonb_build_object('ok', false, 'error', 'channel_not_probed');
  end if;
  -- (2) THE LEASE. Only the holder the ROSTER stamped may read this
  --     character's snapshot, and only inside the lease.
  select * into v_own from public.hr_tick_ownership
   where user_id = p_user and slot = p_slot and channel = p_channel;
  if not found or not v_own.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_own.lease_holder is distinct from p_holder
     or v_own.lease_until is null or v_own.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease');
  end if;
  select * into v_row from public.hr_tick_probe
   where user_id = p_user and slot = p_slot and channel = p_channel and status = 'open';
  if not found then
    return jsonb_build_object('ok', true, 'open', null);
  end if;
  -- span_from as Postgres's JSON rendering of the column: the string the
  -- edge hands back to hr_seed's label expression (T-2: never a JS spelling).
  return jsonb_build_object('ok', true, 'open', jsonb_build_object(
    'id', v_row.id,
    'span_from', to_jsonb(v_row.span_from) #>> '{}',
    'base_version', v_row.base_version,
    'input', v_row.input));
end $$;

-- ── §3 hr_tick_probe_commit — CLOSE, VOID, OPEN; hr_tick_probe ONLY ───────
create or replace function public.hr_tick_probe_commit(
  p_holder       text,
  p_user         uuid,
  p_slot         int,
  p_channel      text,
  p_window_from  timestamptz,
  p_window_to    timestamptz,
  p_payload      text,
  p_close_id     bigint,
  p_close_result jsonb,
  p_open_input   jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c_min_span   constant interval := interval '4 hours';
  c_max_span   constant interval := interval '6 hours';
  c_input_max  constant int      := 65536;
  c_result_max constant int      := 16384;
  v_role   text;
  v_cfg    public.hr_tick_config%rowtype;
  v_own    public.hr_tick_ownership%rowtype;
  v_ver    bigint;
  v_probe  public.hr_tick_probe%rowtype;
  v_closed bigint;
  v_void   text;
  v_voided int := 0;
  v_n      int;
  v_opened bigint;
begin
  -- (0) IDENTITY.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_probe_commit: not callable by %', v_role using errcode = '42501';
  end if;
  -- (1) THE KILL SWITCH.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled');
  end if;
  -- (2) ARGUMENTS — bounded and shaped before anything is read.
  if p_holder is null or p_user is null or p_slot is null or p_channel is null
     or p_window_from is null or p_window_to is null or p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_channel not in ('combat', 'gather') then
    return jsonb_build_object('ok', false, 'error', 'channel_not_probed');
  end if;
  if p_payload !~ '^([0-9a-f]{64}|unpacked)$' then
    return jsonb_build_object('ok', false, 'error', 'bad_payload');
  end if;
  if p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_open_input is not null and (jsonb_typeof(p_open_input) <> 'object'
       or octet_length(p_open_input::text) > c_input_max) then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  if p_close_result is not null and (jsonb_typeof(p_close_result) <> 'object'
       or octet_length(p_close_result::text) > c_result_max) then
    return jsonb_build_object('ok', false, 'error', 'bad_result');
  end if;
  if p_close_id is null and p_open_input is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_commit');
  end if;

  -- (3) SERIALISE THIS CHARACTER'S PROBE ROWS — and nothing else. An advisory
  --     lock, transaction-scoped, never taken by hr_tick_settle: no row lock on
  --     player_state or hr_tick_ownership, because a lock is a tuple write.
  perform pg_advisory_xact_lock(
    hashtextextended('hr_tick_probe:' || p_user::text || ':' || p_slot::text || ':' || p_channel, 0));

  -- (4) THE LEASE, as the fence checks it.
  select * into v_own from public.hr_tick_ownership
   where user_id = p_user and slot = p_slot and channel = p_channel;
  if not found or not v_own.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_own.lease_holder is distinct from p_holder
     or v_own.lease_until is null or v_own.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease');
  end if;

  -- (5) THE ANCHOR: a JOURNALLED shadow window at the CHAIN HEAD. The caller
  --     cannot name a span the shadow chain did not actually reach, and an
  --     armed channel (shadow mark cleared, no shadow row) cannot reach here.
  if v_own.shadow_accrued_to is distinct from p_window_to then
    return jsonb_build_object('ok', false, 'error', 'not_chain_head',
      'chain_head', v_own.shadow_accrued_to);
  end if;
  select s.version into v_ver from public.hr_tick_shadow s
   where s.user_id = p_user and s.slot = p_slot and s.channel = p_channel
     and s.window_from = p_window_from and s.window_to = p_window_to
   order by s.id desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_shadow_window');
  end if;

  -- (6) CLOSE (or void) the named open probe.
  if p_close_id is not null then
    select * into v_probe from public.hr_tick_probe
     where id = p_close_id and user_id = p_user and slot = p_slot and channel = p_channel
       and status = 'open';
    if found then
      v_void := case
        when p_close_result is null then 'no_result'
        when p_window_to - v_probe.span_from < c_min_span
          or p_window_to - v_probe.span_from > c_max_span then 'span_out_of_bounds'
        else null end;
      if v_void is null then
        update public.hr_tick_probe
           set status = 'closed', span_to = p_window_to, result = p_close_result,
               version_close = v_ver, payload_close = p_payload, input = null,
               closed_at = now()
         where id = v_probe.id;
        v_closed := v_probe.id;
      else
        update public.hr_tick_probe
           set status = 'void', void_reason = v_void, input = null, closed_at = now()
         where id = v_probe.id;
        v_voided := v_voided + 1;
      end if;
    end if;
  end if;

  -- (7) OPEN. Anything still open for this character is superseded first — a
  --     probe whose close was missed can never close honestly, and the
  --     evaluator counts the void as a discard rather than losing it.
  if p_open_input is not null then
    update public.hr_tick_probe
       set status = 'void', void_reason = 'superseded', input = null, closed_at = now()
     where user_id = p_user and slot = p_slot and channel = p_channel and status = 'open';
    get diagnostics v_n = row_count;
    v_voided := v_voided + v_n;
    insert into public.hr_tick_probe
      (user_id, slot, channel, holder, status, span_from, base_version, payload_open, input)
    values
      (p_user, p_slot, p_channel, p_holder, 'open', p_window_from, v_ver, p_payload, p_open_input)
    on conflict (user_id, slot, channel, span_from) do nothing
    returning id into v_opened;
  end if;

  return jsonb_build_object('ok', true, 'closed', v_closed, 'voided', v_voided,
                            'opened', v_opened);
end $$;

-- ── §4 RETENTION ───────────────────────────────────────────────────────────
-- hr_tick_shadow's own 14 days: a probe is unreadable once its windows are
-- pruned, so keeping it longer stores a number nothing can check.
create or replace function public.hr_tick_probe_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  with doomed as (
    select id from public.hr_tick_probe
     where opened_at < now() - interval '14 days'
     order by id limit greatest(1, least(coalesce(p_limit, 20000), 200000))
  )
  delete from public.hr_tick_probe p using doomed d where p.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-tick-probe-prune'', ''29 * * * *'', '
                 '''select public.hr_tick_probe_prune(20000)'')';
  else
    perform public.hr_cron_ensure('hr-tick-probe-prune', '29 * * * *',
      'select public.hr_tick_probe_prune(20000)');
  end if;
end $$;

-- ── §5 GRANTS — revoke from PUBLIC first, then exactly one grant each ─────
revoke execute on function public.hr_tick_probe_fetch(text, uuid, int, text) from public;
revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_probe_prune(int) from public;
revoke execute on function public.hr_tick_probe_fetch(text, uuid, int, text) from anon, authenticated, service_role;
revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from anon, authenticated, service_role;
revoke execute on function public.hr_tick_probe_prune(int) from anon, authenticated, service_role, hr_engine;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_tick_probe_fetch(text, uuid, int, text) from hr_tick';
    execute 'revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from hr_tick';
    execute 'revoke execute on function public.hr_tick_probe_prune(int) from hr_tick';
  end if;
end $$;
grant execute on function public.hr_tick_probe_fetch(text, uuid, int, text) to hr_engine;
grant execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) to hr_engine;

-- ── §6 hr_assert_grant_hygiene — LINK 16, two insertions ──────────────────
-- GENERATED by tools/derive-grant-hygiene.mjs (LINKS[15]) from
-- 2026-09-28-grant-hygiene-hr-ops.sql's committed body, INSERTIONS ONLY (the
-- two probe entries at the head of c_engine_allow). Do NOT hand-edit; `--check`
-- is a preflight in tests/run-smoke.mjs and PART 1f-ii walks this as the
-- chain's SIXTEENTH link. This file is the CURRENT LAST TOUCHER of the detector.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

revoke execute on function public.hr_assert_grant_hygiene(boolean) from public;
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from anon, authenticated, service_role;

-- ── §7 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- PROBE ROWS ONLY: every row this block writes is under `v_u`, a uuid
-- gen_random_uuid() cannot mint, and the whole block rolls back through the
-- HR1006_ROLLBACK_OK sentinel. It runs as the APPLYING role, which the
-- functions' identity check admits; the hr_engine path is proved by
-- tests/world-tick-parity-probe.mjs on the replayed chain.
do $$
declare
  v_u      constant uuid := '00000000-0000-4000-8000-0000000f1006';
  v_h      constant text := 'selfcheck-probe';
  v_t0     timestamptz := date_trunc('second', now()) - interval '5 hours';
  v_t1     timestamptz;
  v_t2     timestamptz;
  v_r      jsonb;
  v_n      bigint;
  v_id     bigint;
  v_ps     text;
  v_ps2    text;
  v_ow     text;
  v_ow2    text;
  v_moved  text;
  v_role   text;
  v_bad    text;
begin
  -- ── p1 THE SURFACE: RLS forced, no policy, no table or sequence privilege
  --    for any client or engine role; the three functions' EXECUTE is
  --    exactly {fetch, commit} → hr_engine.
  if not (select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'public.hr_tick_probe'::regclass) then
    raise exception 'p1a: hr_tick_probe does not have RLS enabled AND forced';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.hr_tick_probe'::regclass) then
    raise exception 'p1b: hr_tick_probe has a policy — it must have none';
  end if;
  foreach v_role in array array['public','anon','authenticated','service_role','hr_engine','hr_tick'] loop
    if v_role <> 'public' and not exists (select 1 from pg_roles where rolname = v_role) then continue; end if;
    if has_table_privilege(v_role, 'public.hr_tick_probe', 'select,insert,update,delete,truncate,references,trigger')
       or has_sequence_privilege(v_role, 'public.hr_tick_probe_id_seq', 'usage,select,update') then
      raise exception 'p1c: % holds a privilege on hr_tick_probe or its sequence', v_role;
    end if;
    if has_function_privilege(v_role, 'public.hr_tick_probe_prune(int)', 'execute') then
      raise exception 'p1d: % can execute hr_tick_probe_prune', v_role;
    end if;
    if v_role <> 'hr_engine'
       and (has_function_privilege(v_role, 'public.hr_tick_probe_fetch(text,uuid,int,text)', 'execute')
         or has_function_privilege(v_role,
              'public.hr_tick_probe_commit(text,uuid,int,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb)', 'execute')) then
      raise exception 'p1e: % can execute a probe function — only hr_engine may', v_role;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_tick_probe_fetch(text,uuid,int,text)', 'execute')
     or not has_function_privilege('hr_engine',
          'public.hr_tick_probe_commit(text,uuid,int,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb)', 'execute') then
    raise exception 'p1f: hr_engine cannot execute the probe pair — the edge could never write a probe';
  end if;

  -- ── p6 EXCLUSION BY TABLE IDENTITY, read off the catalogue: no function
  --    body in public other than this file's three mentions hr_tick_probe, so
  --    no settle, roster, hr_state_of, stall read or 8a/8b/8c helper can sum a
  --    probe row as a window.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname not in ('hr_tick_probe_fetch', 'hr_tick_probe_commit', 'hr_tick_probe_prune',
                           -- the detector NAMES the pair as allowlist strings; it
                           -- reads the catalogue, never the table.
                           'hr_assert_grant_hygiene')
     and p.prosrc ~ '\mhr_tick_probe\M';
  if v_bad is not null then
    raise exception 'p6: function(s) outside the probe pair read hr_tick_probe: %', v_bad;
  end if;
  --    …and the probe pair's own DML names hr_tick_probe and nothing else.
  select string_agg(m[2], ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral regexp_matches(p.prosrc,
          '(insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)', 'gi') m
   where n.nspname = 'public'
     and p.proname in ('hr_tick_probe_fetch', 'hr_tick_probe_commit', 'hr_tick_probe_prune')
     and lower(m[2]) <> 'hr_tick_probe';
  if v_bad is not null then
    raise exception 'p6b: a probe function writes a table other than hr_tick_probe: %', v_bad;
  end if;
  if (select provolatile from pg_proc where oid = 'public.hr_tick_probe_fetch(text,uuid,int,text)'::regprocedure) <> 's' then
    raise exception 'p6c: hr_tick_probe_fetch is not STABLE — the read half may not write';
  end if;

  begin
    -- ── A PROBE CHARACTER WITH A SHADOW CHAIN HEAD ────────────────────────
    update public.hr_tick_config set enabled = true where id;
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values (v_u, 0, 0, 0, 10, 10, 3, v_t0)
    on conflict (user_id, slot) do update set version = 3, accrued_to = v_t0;
    delete from public.hr_tick_ownership where user_id = v_u;
    v_t1 := v_t0 + interval '90 seconds';
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until,
                                          shadow_accrued_to)
    values (v_u, 0, 'gather', true, v_h, now() + interval '5 minutes', v_t1);
    insert into public.hr_tick_shadow (user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    values (v_u, 0, 'gather', v_h, v_t0, v_t1, 3, gen_random_uuid(), '{}'::jsonb);

    -- ── p2 THE REFUSALS, each by name, each writing nothing.
    v_r := public.hr_tick_probe_commit('someone-else', v_u, 0, 'gather', v_t0, v_t1,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'no_lease' then raise exception 'p2a: a foreign holder was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0 - interval '90 seconds', v_t0,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'not_chain_head' then raise exception 'p2b: a non-head window was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'combat', v_t0, v_t1,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'not_tick_owned' then raise exception 'p2c: an unowned channel was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1,
             'not-a-hash', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'bad_payload' then raise exception 'p2d: a forged payload stamp was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1,
             'unpacked', null, null, jsonb_build_object('pad', repeat('x', 70000)));
    if v_r->>'error' is distinct from 'bad_input' then raise exception 'p2e: an oversize input was not refused: %', v_r; end if;
    select count(*) into v_n from public.hr_tick_probe where user_id = v_u;
    if v_n <> 0 then raise exception 'p2f: a refusal wrote % probe row(s)', v_n; end if;

    -- ── p3 ★ OPEN + CLOSE WRITE hr_tick_probe AND NOTHING ELSE ★
    --    Every user table's transaction-level tuple counters, and the two rows
    --    the probe must not touch, before and after.
    select md5(ps::text) into v_ps from public.player_state ps where ps.user_id = v_u and ps.slot = 0;
    select md5(o::text) into v_ow from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    create temp table hr__probe_stat_before on commit drop as
      select relid, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables;

    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1,
             'unpacked', null, null, '{"accruedToMs":1,"skills":{}}'::jsonb);
    v_id := (v_r->>'opened')::bigint;
    if v_id is null then raise exception 'p3a: the open was not written: %', v_r; end if;
    select string_agg(c.relname, ', ') into v_moved
      from pg_stat_xact_user_tables a
      join pg_class c on c.oid = a.relid
      left join hr__probe_stat_before b on b.relid = a.relid
     where c.relname not in ('hr_tick_probe', 'hr__probe_stat_before')
       and (a.n_tup_ins, a.n_tup_upd, a.n_tup_del)
           is distinct from (coalesce(b.n_tup_ins, 0), coalesce(b.n_tup_upd, 0), coalesce(b.n_tup_del, 0));
    if v_moved is not null then
      raise exception 'p3a2: the probe OPEN wrote outside hr_tick_probe: %', v_moved;
    end if;
    v_r := public.hr_tick_probe_fetch(v_h, v_u, 0, 'gather');
    if (v_r#>>'{open,id}')::bigint is distinct from v_id or v_r#>'{open,input,skills}' is null then
      raise exception 'p3b: fetch did not return the open probe: %', v_r;
    end if;
    -- advance the chain head 4 h 30 m (as the fence would have), then close.
    v_t2 := v_t0 + interval '4 hours 30 minutes';
    update public.hr_tick_ownership set shadow_accrued_to = v_t2
     where user_id = v_u and slot = 0 and channel = 'gather';
    insert into public.hr_tick_shadow (user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    values (v_u, 0, 'gather', v_h, v_t2 - interval '90 seconds', v_t2, 3, gen_random_uuid(), '{}'::jsonb);
    select md5(o::text) into v_ow from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    drop table hr__probe_stat_before;
    create temp table hr__probe_stat_before on commit drop as
      select relid, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_id, '{"ticks":5,"qty":5}'::jsonb, null);
    if (v_r->>'closed')::bigint is distinct from v_id then
      raise exception 'p3c: the close did not land: %', v_r;
    end if;
    select string_agg(c.relname || ' +' || (a.n_tup_ins - coalesce(b.n_tup_ins, 0))
                      || '/~' || (a.n_tup_upd - coalesce(b.n_tup_upd, 0))
                      || '/-' || (a.n_tup_del - coalesce(b.n_tup_del, 0)), ', ')
      into v_moved
      from pg_stat_xact_user_tables a
      join pg_class c on c.oid = a.relid
      left join hr__probe_stat_before b on b.relid = a.relid
     where c.relname not in ('hr_tick_probe', 'hr__probe_stat_before')
       and (a.n_tup_ins, a.n_tup_upd, a.n_tup_del)
           is distinct from (coalesce(b.n_tup_ins, 0), coalesce(b.n_tup_upd, 0), coalesce(b.n_tup_del, 0));
    if v_moved is not null then
      raise exception 'p3d: the probe CLOSE wrote outside hr_tick_probe: %', v_moved;
    end if;
    select md5(ps::text) into v_ps2 from public.player_state ps where ps.user_id = v_u and ps.slot = 0;
    select md5(o::text) into v_ow2 from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    if v_ps2 is distinct from v_ps then raise exception 'p3e: the probe moved the player_state row'; end if;
    if v_ow2 is distinct from v_ow then
      raise exception 'p3f: the probe moved the hr_tick_ownership row (shadow_accrued_to / shadow_state / lease)';
    end if;
    select count(*) into v_n from public.hr_tick_probe
     where user_id = v_u and status = 'closed' and input is null and span_to = v_t2 and version_close = 3;
    if v_n <> 1 then raise exception 'p3g: the closed row is not the shape the evaluator reads'; end if;

    -- ── p4 IDEMPOTENT: the same close again is a no-op, and a replayed open
    --      of a span that exists inserts nothing.
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_id, '{"ticks":9}'::jsonb, null);
    if v_r->>'closed' is not null or (v_r->>'voided')::int <> 0 then
      raise exception 'p4a: a replayed close moved a closed probe: %', v_r;
    end if;
    if (select result->>'ticks' from public.hr_tick_probe where id = v_id) <> '5' then
      raise exception 'p4b: a replayed close rewrote the stored result';
    end if;

    -- ── p5 A SPAN OUTSIDE [4 h, 6 h] VOIDS, NEVER CLOSES; a new open
    --      supersedes a stale one.
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', null, null, '{"k":2}'::jsonb);
    v_id := (v_r->>'opened')::bigint;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_id, '{"ticks":1}'::jsonb, null);
    if (select status || ':' || coalesce(void_reason, '') from public.hr_tick_probe where id = v_id)
       <> 'void:span_out_of_bounds' then
      raise exception 'p5a: a span of one window was not voided span_out_of_bounds: %', v_r;
    end if;

    -- ── p7 THE KILL SWITCH: off, the probe is refused and writes nothing.
    update public.hr_tick_config set enabled = false where id;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', null, null, '{"k":3}'::jsonb);
    if v_r->>'error' is distinct from 'tick_disabled' then raise exception 'p7: the kill switch did not refuse: %', v_r; end if;
    v_r := public.hr_tick_probe_fetch(v_h, v_u, 0, 'gather');
    if v_r->>'error' is distinct from 'tick_disabled' then raise exception 'p7b: fetch ignored the kill switch: %', v_r; end if;

    -- ── p8 THE DETECTOR, at chain end, strict and clean.
    v_r := public.hr_assert_grant_hygiene(true);
    if jsonb_array_length(coalesce(v_r->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'p8: the detector does not record the probe pair: %', v_r->'engine_execute_outside_allowlist';
    end if;

    raise exception 'HR1006_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1006_ROLLBACK_OK' then raise; end if;
  end;
end $$;
