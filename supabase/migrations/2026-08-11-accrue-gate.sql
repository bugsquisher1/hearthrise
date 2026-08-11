-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-11-accrue-gate.sql — THE RATE GATE FOR THE NON-ACCRUING PATH.
-- Companion design doc: docs/design/server-authority.md §2a-ii, §3
-- Depends on: 2026-08-11-player-state.sql (hr_rate_ok, hr_rate_over,
--             hr_rate_sample_weight, hr_record_rejection)
--
-- ── THE DEFECT (security review D3) ─────────────────────────────────────────
-- hr_apply rate-limits itself, and the comment at apply-engine.sql:420 states
-- the reason plainly: "a rejected call must still consume budget, otherwise
-- 'spam invalid deltas' is a free denial of service against the engine."
--
-- The accrual Edge Function had a path that never reached hr_apply. When there
-- is nothing to pay — an idle character, a sub-minute absence, a gathering
-- activity Phase C does not simulate — it returned BEFORE the apply. That path
-- still cost, per request:
--
--     two pooled transactions
--   + one hr_state_of  (player_state + fifteen player_skills + the whole
--                       inventory + every farm plot + up to 1,000 progress rows)
--   + one hr_offline_cap_ms (a join through clan_members to clans)
--   + one hr_seed
--   ────────────────────────────────────────────────────────────────────────
--   = and consumed NO budget whatsoever.
--
-- Measured on this project: max_connections = 60, 23 already in use at six
-- players. §2a-ii names the failure mode explicitly, and it is not "the accrual
-- endpoint gets slow" — it is nobody can connect, the dashboard included.
--
-- ── THE FIX, AND WHY IT IS A NEW FUNCTION RATHER THAN A GRANT ───────────────
-- The obvious move is `grant execute on hr_rate_ok to hr_engine` and call it
-- from the Edge Function. That is wrong for one specific reason: hr_rate_ok's
-- signature is (user, bucket, LIMIT, WINDOW) — it takes the limit as an
-- ARGUMENT. Handing that to the engine means the engine names its own rate
-- limit, and a caller that names its own rate limit does not have one. It is the
-- same class of mistake as letting the client send `capMs`.
--
-- So the limit lives HERE, in a `case` the engine cannot reach, keyed by a
-- bucket name that is validated against an allowlist and FAILS CLOSED on
-- anything unknown. The engine's whole vocabulary becomes "I am about to do an
-- accrue for this user — may I?", which is the smallest possible capability that
-- solves the problem. hr_rate_ok itself stays revoked from every role.
--
-- ── THE LIMIT, AND WHY THIS NUMBER ─────────────────────────────────────────
-- 30 accrue attempts per minute per user. An accrual cannot PRODUCE anything
-- more than once a minute — ACCRUE_MIN_MS is 60,000 ms (accrual.js:53) — so 30
-- is already thirty times the maximum useful rate. The headroom is for the
-- things that legitimately repeat: six character slots share one bucket (the
-- counter is per user, not per character), a client retrying a network failure,
-- and the degrade ladder in index.ts, which can issue up to five applies for one
-- absence during an incident. It is a brake on automation, not a budget a player
-- can feel.
--
-- Rejections are SAMPLED, not logged per call — the 1st, 10th and 50th in a
-- window, then every 1000th, each carrying the gap it stands for. That is the
-- same shape player-state.sql §6c-ii already established, and for the same
-- reason: a retry storm must not make the server do MORE durable work the
-- harder it is hit.
--
-- ── ADDITIVE AND IDEMPOTENT ────────────────────────────────────────────────
-- One CREATE OR REPLACE FUNCTION plus grants. No table, no column, no row, no
-- job. SAFE TO RE-RUN. Reversal is §4.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ──────────────────────────────────────────
-- Naming a signature that does not exist would make this file's own guard
-- permanently false, which is the always-null-probe shape this program has been
-- bitten by six times. Each signature below is written out in full.
do $$
begin
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'run 2026-08-11-player-state.sql (revision 4) first — the rate primitives are missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'hr_engine role missing — run 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── 1. hr_rate_gate ─────────────────────────────────────────────────────────
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
begin
  if p_user is null then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, both of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue' then v_limit := 30; v_window := interval '1 minute';
    else return false;
  end case;

  if public.hr_rate_ok(p_user, p_bucket, v_limit, v_window) then
    return true;
  end if;

  -- Sampled record. Same policy as hr_load and hr_apply: detection does not need
  -- every event, it needs to know the event is happening and roughly how much.
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, p_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', true), v_weight);
  end if;
  return false;
end $$;

-- ── 2. GRANTS ───────────────────────────────────────────────────────────────
-- Revoke from PUBLIC first: Postgres grants EXECUTE to PUBLIC on every new
-- function and Supabase's default ACL additionally grants anon, authenticated
-- and service_role. Revoking one of the four leaves the privilege intact three
-- other ways.
revoke execute on function public.hr_rate_gate(uuid, int, text) from public;
revoke execute on function public.hr_rate_gate(uuid, int, text)
  from anon, authenticated, service_role;
-- The engine is the only caller. A browser that could spend its own rate budget
-- on demand could also spend someone else's.
grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;

-- ── 3. REVERSIBILITY ────────────────────────────────────────────────────────
--   drop function if exists public.hr_rate_gate(uuid, int, text);
-- Nothing else to undo: no table, no column, no row, no cron entry, no grant to
-- anything but hr_engine. The Edge Function fails closed without it — the read
-- transaction errors and the request answers `server_error` — which is the
-- correct direction: no gate means no read, never an ungated one.

-- ── 4. SELF-VERIFICATION ────────────────────────────────────────────────────
-- Asserts what this file is load-bearing for, BEHAVIOURALLY. A migration that
-- only checks that its function exists has checked nothing.
do $$
declare
  v_p   oid;
  v_bad text;
  v_u   uuid := gen_random_uuid();
  v_n   int := 0;
  i     int;
begin
  v_p := to_regprocedure('public.hr_rate_gate(uuid,int,text)');
  if v_p is null then raise exception 'hr_rate_gate(uuid,int,text) missing'; end if;

  -- (a) NOT reachable from a browser. The gate decides whether an expensive
  --     read happens at all; a client that could call it could also exhaust
  --     another player's budget.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, v_p, 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_gate is executable by: % — revoke before grant', v_bad;
  end if;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_engine cannot execute hr_rate_gate — the read path would be ungated';
  end if;

  -- (b) hr_rate_ok itself must STILL be unreachable by everyone, including the
  --     engine. If it ever becomes engine-executable, the engine can name its
  --     own limit and this whole file is decoration.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_function_privilege(r, 'public.hr_rate_ok(uuid,text,int,interval)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_ok is executable by: % — the limit would become a caller argument', v_bad;
  end if;

  -- (c) BEHAVIOURAL: an unknown bucket is refused, and the allowed bucket both
  --     admits and eventually refuses. A random uuid has no counter row, so this
  --     is a self-contained fixture; it is deleted below.
  if public.hr_rate_gate(v_u, 0, 'not_a_bucket') then
    raise exception 'hr_rate_gate admitted an unknown bucket — it must fail closed';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'hr_rate_gate refused the first accrue call';
  end if;
  for i in 1..40 loop
    if public.hr_rate_gate(v_u, 0, 'accrue') then v_n := v_n + 1; end if;
  end loop;
  if v_n >= 40 then
    raise exception 'hr_rate_gate allowed % of 40 further calls — the limit is not being applied', v_n;
  end if;
  if public.hr_rate_gate(null, 0, 'accrue') then
    raise exception 'hr_rate_gate admitted a null user';
  end if;

  delete from public.hr_rate_counters where user_id = v_u;
  delete from public.hr_rejections where user_id = v_u;

  raise notice 'hr_rate_gate: installed, engine-only, accrue = 30/min, unknown buckets fail closed.';
end $$;
