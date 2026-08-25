-- 2026-08-30-bounty-kill-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply — this is a MONEY-ADJACENT surface: a
--   new SECURITY DEFINER verb that writes the server bounty kill-counter, which
--   gates the gold+Marks turn-in (hr_claim_bounty). It grants NO gold/XP/drops
--   itself, but it decides WHEN a paying bounty may complete. The Coordinator
--   applies it by hand via the curl-from-file path as part of a coordinated
--   deploy. Read the change contract in the PR body before applying.
--
--   APPLY AFTER: 2026-08-23-bounty.sql (active_bounty, hr_bounty_kills, the gate)
--   AND the REGENERATED 2026-08-23-bounty-monsters.generated.sql (which now
--   carries the `hp` column this file's cap reads). §0 fails closed if either is
--   absent.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FIXES (#5 — the two-phase bounty that hangs at target)
-- ══════════════════════════════════════════════════════════════════════════
-- The server bounty counter (player_progress kind='stat' key='ev:kill_monster:
-- <target>') is written ONLY by the away/span-sim in supabase/functions/hr-
-- accrue/accrual.js, which re-simulates the elapsed window as an UNATTENDED
-- character (auto-eat-only survival) and realizes 60–99% fewer kills than the
-- attended live player actually got. So the client bar reaches 102/102, the
-- server counter never reaches `required`, hr_claim_bounty keeps refusing
-- ('incomplete'), and the two-phase claim (which retries on the next kill) hangs
-- forever the moment the player stops fighting. Paione hit this live.
--
-- ── THE FIX (Designer ruling, DECISION 2) ──────────────────────────────────
-- hr_credit_kills lets the live client TOP UP the server counter with the kills
-- it OBSERVED, CLAMPED to a plausibility ceiling so a forger cannot complete a
-- bounty faster than the character could physically have killed:
--
--   cap    = floor(1.3 × elapsed_since_accept / min_time_to_kill(target, gear+lvl))
--   credit = min(p_claimed, cap)
--
-- min_time_to_kill uses minTickMs = 600 ms as the HARD per-swing floor and a
-- max-hit computed from the SERVER-owned damage LEVEL (player_skills) against the
-- monster's HP (the catalogue). The whole model — and why every term is pushed
-- to its ceiling (never throttle an honest player) — is documented in
-- src/core/kill-time.js; the integer coefficients here are VENDORED from it and
-- BOUND by tests/kill-time-drift.mjs, so a divergence fails the build.
--
-- ── THREE DISJOINT WRITERS, NO DOUBLE-PAY (the load-bearing invariant) ──────
--   1. hr_credit_kills  → the kill COUNTER only. NO gold, NO XP, NO drops.
--   2. hr_claim_bounty  → the bounty's gold+Marks+XP reward, ONCE, on turn-in
--                         (unchanged by this file; its active_bounty once-guard
--                         is the pay-once authority).
--   3. the settle/accrual path → per-kill loot (unchanged; the one loot writer).
-- These never overlap. This file adds NOTHING to writer #2 or #3.
--
-- ── WHY TOP-UP, NOT ADD ─────────────────────────────────────────────────────
-- The counter is raised TO (baseline + credit), never blindly incremented, so a
-- settle that already credited some away-kills is not double-counted, and a
-- replay (or the auto-retry loop) is naturally idempotent: the second call finds
-- the counter already at/above the target and applies zero. p_idem is the
-- explicit belt-and-suspenders once-guard on top of that (Ruling: once-per-key).
--
-- ── FORGERY BOUND (stated for the security review) ──────────────────────────
-- A forger online T seconds cannot credit more than floor(1.3 × T·1000 /
-- min_kill_ms) kills toward a bounty of their OWN — it is self-only (the counter
-- gates only this character's turn-in, whose reward is self-earned gold+Marks),
-- and every cap-throttled claim (credit < claimed) is JOURNALLED kind='bounty'
-- intent='kill_credit_throttled:<target>' as a forgery signal (an honest player
-- never reaches 1.3× physical-max). KNOWN LOOSENESS: min_time_to_kill assumes
-- BEST-IN-SLOT gear (item combat stats are not server-side), so the cap is looser
-- than the player's real gear would give. This is the SAFE direction (never
-- throttles honest play); tightening it to per-gear needs equipment combat stats
-- in SQL — a tracked follow-up, called out for the security review.
--
-- REVERSIBILITY: drop hr_credit_kills/__ungated, hr_bounty_kill_cap, the
-- hr_kill_credit_log table, and re-apply 2026-08-27-bank-store.sql's hr_rpc_gate
-- body (to drop the bucket). Additive overall; nothing is rewritten.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_skills')   is null then raise exception 'player_skills missing'; end if;
  if to_regclass('public.active_bounty')   is null then
    raise exception 'active_bounty missing — apply 2026-08-23-bounty.sql first';
  end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception 'hr_bounty_monsters missing — apply 2026-08-23-bounty-monsters.generated.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='hr_bounty_monsters' and column_name='hp') then
    raise exception 'hr_bounty_monsters.hp missing — regenerate + apply 2026-08-23-bounty-monsters.generated.sql (>= 2026-08-30)';
  end if;
  if to_regprocedure('public.hr_bounty_kills(uuid,int,text)') is null then
    raise exception 'hr_bounty_kills not found — apply 2026-08-23-bounty.sql first';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp not found';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate not found';
  end if;
end $$;

-- ── 1. The idempotency log — once-per-idem, per character ───────────────────
-- Written ONLY by hr_credit_kills. Tiny (a handful of rows per character per
-- session, rate-gated at 60/min). NO client write policy, NO client write grant.
create table if not exists public.hr_kill_credit_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot       int  not null,
  idem       text not null check (length(idem) between 1 and 64),
  target     text not null,
  claimed    bigint not null,
  credit     bigint not null,
  cap        bigint not null,
  applied    bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slot, idem)
);
alter table public.hr_kill_credit_log enable row level security;
drop policy if exists hr_kill_credit_log_sel on public.hr_kill_credit_log;
create policy hr_kill_credit_log_sel on public.hr_kill_credit_log for select using (user_id = auth.uid());
revoke all on public.hr_kill_credit_log from anon, authenticated, service_role;
grant select on public.hr_kill_credit_log to authenticated, service_role;
create index if not exists hr_kill_credit_log_prune_idx on public.hr_kill_credit_log (created_at);

-- Optional prune (idempotency keys are only useful for the seconds around a
-- retry; keep a day for generous slack). Not scheduled here — a housekeeping RPC.
create or replace function public.hr_kill_credit_prune(p_older interval default interval '1 day')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.hr_kill_credit_log
   where created_at < now() - greatest(interval '1 hour', coalesce(p_older, interval '1 day'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_kill_credit_prune(interval) from public, anon, authenticated, service_role;

-- ── 2. hr_bounty_kill_cap — the PURE plausibility cap (drift-guarded) ───────
-- Integer-exact, so it agrees bit-for-bit with src/core/kill-time.js in Node.
-- The coefficients (35 / 4280 / 41496 / 10000 / 600 / 130) are VENDORED from
-- KILL_TIME_SQL_CONSTANTS and pinned by tests/kill-time-drift.mjs. IMMUTABLE: it
-- reads no table and no clock — the RPC passes it the server-derived hp, level
-- and elapsed, so the whole cap is testable without a row or a `now()`.
create or replace function public.hr_bounty_kill_cap(p_hp int, p_dmg_level int, p_elapsed_ms bigint)
returns bigint language sql immutable set search_path = public, pg_catalog as $$
  with d as (
    select
      greatest(1, coalesce(p_hp, 1))::bigint        as hp,
      greatest(1, coalesce(p_dmg_level, 1))::bigint as lvl,
      greatest(0, coalesce(p_elapsed_ms, 0))::bigint as el
  ),
  m as (
    -- base = floor((lvl*35 + 4280)/100); max_hit = max(1, floor(base*41496/10000))
    -- (integer division throughout — bit-identical to src/core/kill-time.js)
    select hp, el,
      greatest(1::bigint, (((lvl*35 + 4280) / 100) * 41496) / 10000) as max_hit
    from d
  ),
  k as (
    -- min_swings = ceil(hp/max_hit) = (hp+max_hit-1)/max_hit; min_kill_ms = max(600, *600)
    select el, greatest(600::bigint, ((hp + max_hit - 1) / max_hit) * 600) as min_kill_ms
    from m
  )
  -- cap = floor(130*el / (100*min_kill_ms))
  select (130 * el) / (100 * min_kill_ms) from k;
$$;
revoke execute on function public.hr_bounty_kill_cap(int,int,bigint) from public, anon, authenticated, service_role;

-- ── 3. hr_credit_kills__ungated — TOP UP the counter, clamped + journalled ──
create or replace function public.hr_credit_kills__ungated(
  p_slot int, p_target text, p_claimed bigint, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_slot      int  := coalesce(p_slot, 0);
  v_ab        public.active_bounty%rowtype;
  v_hp        int;
  v_dmg_lvl   int;
  v_elapsed   bigint;
  v_cap       bigint;
  v_claimed   bigint := greatest(0, coalesce(p_claimed, 0));
  v_credit    bigint;
  v_current   bigint;
  v_target_val bigint;
  v_applied   bigint;
  v_prior     public.hr_kill_credit_log%rowtype;
  v_progress  bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null or length(p_idem) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_idem');
  end if;
  if p_target is null or p_target !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_target');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- Serialize concurrent credits for this character (idempotency read + write).
  perform pg_advisory_xact_lock(hashtextextended('hr_credit_kills:' || v_uid::text, v_slot));

  -- IDEMPOTENCY: a replay of the same key returns the stored result, no re-apply.
  select * into v_prior from public.hr_kill_credit_log
    where user_id = v_uid and slot = v_slot and idem = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'target', v_prior.target,
      'credited', v_prior.applied, 'credit', v_prior.credit, 'cap', v_prior.cap,
      'claimed', v_prior.claimed, 'slot', v_slot);
  end if;

  -- The active bounty for THIS target supplies accepted_at (the cap window),
  -- the baseline (new-kills anchor) and required. No bounty → nothing to credit.
  select * into v_ab from public.active_bounty
    where user_id = v_uid and slot = v_slot and target = p_target for update;
  if v_ab.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_bounty', 'target', p_target, 'slot', v_slot);
  end if;

  select hp into v_hp from public.hr_bounty_monsters where monster_id = p_target;
  if v_hp is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- Damage LEVEL = the greatest of the SERVER-owned strength/ranged/magic levels
  -- (whichever family the player would use is the most generous, safe direction).
  v_dmg_lvl := greatest(1,
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='magic'),0)));

  -- SERVER CLOCK ONLY. Elapsed since the bounty was accepted.
  v_elapsed := floor(extract(epoch from (now() - v_ab.accepted_at)) * 1000)::bigint;
  v_cap := public.hr_bounty_kill_cap(v_hp, v_dmg_lvl, v_elapsed);
  v_credit := least(v_claimed, greatest(0, v_cap));

  -- TOP UP the target counter to (baseline + credit); never lower it, never
  -- double-count what the settle already credited.
  v_current := public.hr_bounty_kills(v_uid, v_slot, p_target);
  v_target_val := v_ab.baseline + v_credit;
  v_applied := greatest(0, v_target_val - v_current);

  if v_applied > 0 then
    insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || p_target, '', v_target_val, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = greatest(p.value, excluded.value), updated_at = now();
    -- The aggregate + Hero-screen counters, additive by the delta actually applied
    -- (the SAME keys the away path writes). Adding only the shortfall keeps these
    -- ~correct against a settle that already credited the away-undercount.
    insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_any', '', v_applied, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = p.value + v_applied, updated_at = now();
    insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, v_slot, 'stat', 'kills', '', v_applied, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = p.value + v_applied, updated_at = now();
  end if;

  -- IDEMPOTENCY RECORD (once per key).
  insert into public.hr_kill_credit_log (user_id, slot, idem, target, claimed, credit, cap, applied)
    values (v_uid, v_slot, p_idem, p_target, v_claimed, v_credit, v_cap, v_applied);

  -- FORGERY SIGNAL: a claim the cap throttled. Honest players never reach 1.3×.
  if v_credit < v_claimed then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'kill_credit_throttled:' || p_target,
        0, 0, 0, 0, 0,
        jsonb_build_object('claimed', v_claimed, 'credit', v_credit, 'cap', v_cap,
          'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl, 'hp', v_hp, 'target', p_target));
  end if;

  v_progress := v_target_val - v_ab.baseline;
  return jsonb_build_object('ok', true, 'target', p_target, 'credited', v_applied,
    'credit', v_credit, 'claimed', v_claimed, 'cap', v_cap, 'progress', greatest(0, v_progress),
    'required', v_ab.required, 'throttled', v_credit < v_claimed, 'slot', v_slot);
end $$;

-- ── 4. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_credit_kills(p_slot int, p_target text, p_claimed bigint, p_idem text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_credit_kills') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_credit_kills__ungated($1, $2, $3, $4);
end $w$;

revoke execute on function public.hr_credit_kills__ungated(int,text,bigint,text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_credit_kills(int,text,bigint,text)           from public, anon, authenticated, service_role;
grant execute on function public.hr_credit_kills(int,text,bigint,text) to authenticated;

-- ── 5. hr_rpc_gate — add the hr_credit_kills bucket (60/min, a live-loop write) ─
-- RESTATED from 2026-08-27-bank-store.sql's body with 'hr_credit_kills' appended
-- to the 60-limit arm. It is a live-combat write (fires at/near a bounty target
-- and on the completing settle), so it belongs beside farm_water / bank_move, not
-- in the 12/min claim arm. Nothing else changes.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         'bank_move',
         'hr_credit_kills'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;

-- ── 5b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_credit_kills' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_credit_kills', 'p_slot integer, p_target text, p_claimed bigint, p_idem text', 'authenticated',
     'added 2026-08-30: server tops up the bounty kill counter, clamped to the physical-max plausibility cap (bounty)');
end $$;

-- ── 6. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c5-0000-0000-0000-0000000000c5';
  v_slot constant int  := 0;
  v_t1   text; v_hp1 int;
  v_cur  bigint; v_led int; v_g0 bigint; v_g1 bigint;
begin
  -- (a) wrapper authenticated-only, inner + helpers revoked from clients.
  if to_regprocedure('public.hr_credit_kills(int,text,bigint,text)') is null then
    raise exception 'GATE(a): hr_credit_kills wrapper did not install';
  end if;
  if has_function_privilege('authenticated','public.hr_credit_kills__ungated(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): hr_credit_kills__ungated is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_kills(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon','public.hr_credit_kills(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): the wrapper is anon-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_bounty_kill_cap(int,int,bigint)','execute') then
    raise exception 'GATE(a): hr_bounty_kill_cap is client-executable';
  end if;

  -- (b) NO client write surface on hr_kill_credit_log or player_progress.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_kill_credit_log' and cmd <> 'SELECT') then
    raise exception 'GATE(b): hr_kill_credit_log grew a non-SELECT policy';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hr_kill_credit_log'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on hr_kill_credit_log';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_progress'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_progress — the kill count is client-forgeable';
  end if;

  -- (c) THE CAP MATH matches src/core/kill-time.js for spot values (bound by
  --     tests/kill-time-drift.mjs across a wide matrix; two anchors here).
  --     goblin hp15, dmg level 10, elapsed 60000ms → cap 130.
  if public.hr_bounty_kill_cap(15, 10, 60000) <> 130 then
    raise exception 'GATE(c): cap(15,10,60000)=% expected 130', public.hr_bounty_kill_cap(15,10,60000);
  end if;
  --     dragon hp520, dmg level 99, elapsed 60000ms → minKill 1200 → cap 65.
  if public.hr_bounty_kill_cap(520, 99, 60000) <> 65 then
    raise exception 'GATE(c): cap(520,99,60000)=% expected 65', public.hr_bounty_kill_cap(520,99,60000);
  end if;
  --     zero elapsed → zero cap (a fresh accept credits nothing).
  if public.hr_bounty_kill_cap(15, 99, 0) <> 0 then
    raise exception 'GATE(c): cap at elapsed 0 is not 0';
  end if;

  -- (d) EXECUTED behaviour, discarded subtxn (writes player_ledger, whose
  --     retention guard refuses a fresh DELETE).
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1) on conflict (user_id, slot) do update set gold = 0;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431 from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict do nothing;

    select monster_id, hp into v_t1, v_hp1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;

    -- no active bounty → refused, nothing written.
    v := public.hr_credit_kills__ungated(v_slot, v_t1, 50, 'idem-noab');
    if v->>'error' <> 'no_active_bounty' then raise exception 'GATE(d): credit with no active bounty not refused: %', v; end if;

    -- accept a tier-1 cull with baseline 500 pre-existing kills.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:'||v_t1, 500, '', 'active');
    v := public.hr_accept_bounty__ungated(v_slot, 'bk', v_t1, 'cull', 'normal', 100);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): accept failed: %', v; end if;

    -- backdate the accept so elapsed is large enough that the cap is generous.
    update public.active_bounty set accepted_at = now() - interval '10 minutes'
      where user_id = v_uid and slot = v_slot;

    -- claim before credit → incomplete (settle undercount / no server kills yet).
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'incomplete' then raise exception 'GATE(d): premature claim not incomplete: %', v; end if;

    -- credit 100 observed kills (cap is generous over 10 min) → counter tops up.
    v := public.hr_credit_kills__ungated(v_slot, v_t1, 100, 'idem-1');
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): credit failed: %', v; end if;
    if (v->>'progress')::bigint < (v->>'required')::bigint then
      raise exception 'GATE(d): credit did not reach required: %', v;
    end if;
    -- the credit RPC grants ZERO gold (double-pay guard: writer #1 pays nothing).
    select gold into v_g0 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g0 <> 0 then raise exception 'GATE(d): hr_credit_kills granted gold (%) — it must grant NONE', v_g0; end if;

    -- counter reached baseline+credit exactly (top-up, not double add).
    v_cur := public.hr_bounty_kills(v_uid, v_slot, v_t1);
    if v_cur <> 500 + least(100, public.hr_bounty_kill_cap(v_hp1, 99, 600000)) then
      raise exception 'GATE(d): counter is % (unexpected top-up)', v_cur;
    end if;

    -- IDEMPOTENT replay: same key applies nothing more.
    v := public.hr_credit_kills__ungated(v_slot, v_t1, 100, 'idem-1');
    if coalesce((v->>'replay')::boolean,false) is not true then raise exception 'GATE(d): replay not flagged: %', v; end if;
    if public.hr_bounty_kills(v_uid, v_slot, v_t1) <> v_cur then
      raise exception 'GATE(d): replay changed the counter';
    end if;

    -- now the turn-in completes and pays its bounty reward EXACTLY ONCE.
    v := public.hr_claim_bounty__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(d): turn-in did not credit after top-up: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g1 <= 0 then raise exception 'GATE(d): turn-in paid no gold (%), reward not credited', v_g1; end if;
    -- exactly one bounty-turnin ledger row.
    select count(*) into v_led from public.player_ledger where user_id=v_uid and intent like 'bounty_turnin:%';
    if v_led <> 1 then raise exception 'GATE(d): expected 1 turn-in ledger row, found %', v_led; end if;
    -- replayed turn-in → no second pay.
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'no_active_bounty' then raise exception 'GATE(d): turn-in replay not refused: %', v; end if;
    if (select gold from public.player_state where user_id=v_uid and slot=v_slot) <> v_g1 then
      raise exception 'GATE(d): turn-in replay RE-CREDITED gold';
    end if;

    -- (e) THE CAP THROTTLES + JOURNALS. Fresh bounty, tiny elapsed, huge claim.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:'||v_t1, 700, '', 'active')
      on conflict (user_id,slot,kind,key,period_key) do update set value = 700;
    v := public.hr_accept_bounty__ungated(v_slot, 'bk2', v_t1, 'cull', 'normal', 100);
    -- accepted_at = now() (elapsed ~0) → cap 0 → credit 0, claim 999 throttled.
    v := public.hr_credit_kills__ungated(v_slot, v_t1, 999, 'idem-throttle');
    if coalesce((v->>'throttled')::boolean,false) is not true then
      raise exception 'GATE(e): a 999-claim at ~0 elapsed was not throttled: %', v;
    end if;
    if (v->>'credit')::bigint <> 0 then raise exception 'GATE(e): credit at ~0 elapsed was % (expected 0)', v->>'credit'; end if;
    if (select count(*) from public.player_ledger
         where user_id=v_uid and intent like 'kill_credit_throttled:%') < 1 then
      raise exception 'GATE(e): a throttled claim was not journalled';
    end if;

    raise exception using errcode = 'HR819', message = 'bounty-kill-credit §6 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.active_bounty   where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(f): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(f): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'bounty-kill-credit: hr_credit_kills tops up the counter (clamped, journalled, idempotent), '
               'grants zero gold, turn-in pays once — all green';
end $$;
