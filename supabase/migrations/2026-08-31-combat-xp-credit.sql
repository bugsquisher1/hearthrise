-- 2026-08-31-combat-xp-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply — this is a RANKABLE surface: a new
--   SECURITY DEFINER verb that WRITES combat-skill XP into player_skills. XP →
--   levels → the total-level / combat-level leaderboards. It is the first
--   client-reachable XP writer in the program. Read the change contract in the PR
--   body (exploit-surface delta, watermark double-count guard, daily-budget
--   backstop) before applying. The Coordinator applies it by hand via the
--   curl-from-file path as part of a coordinated Edge + client deploy.
--
--   APPLY AFTER: 2026-08-30-bounty-kill-credit.sql (this restates hr_rpc_gate on
--   top of that file's body, adding the hr_credit_combat_xp bucket) AND the
--   latest hr_state_of (2026-08-26-marks-record.sql — this restates it with the
--   combat_xp_accrued_to projection). §0 fails closed if a precondition is absent.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FIXES (#5 root, part 2 — "attack level reverts 5→4")
-- ══════════════════════════════════════════════════════════════════════════
-- Live combat XP is client-PREDICTED only (src/legacy.js addXp → src/net/predict.js).
-- The only SERVER writer for combat XP is the away/span-sim in supabase/functions/
-- hr-accrue/accrual.js, which re-simulates the elapsed window as an UNATTENDED
-- character and undercounts 60-99%. On settle, applyRecord stamps the undercount
-- and predict.js retires the prediction by time-coverage → the display drops to
-- the undercount → the gained level reverts. predict.js is NOT the bug (its
-- coverage-retire is correct given EQUAL client/server rates); the server's
-- NUMBER is. This file makes the server credit the ATTENDED number, clamped.
--
-- ── THE FIX (docs/design/combat-authority.md §3) ───────────────────────────
-- hr_credit_combat_xp lets the LIVE client SUBMIT its observed per-combat-skill
-- XP, CLAMPED per skill to a physical-max ceiling so a forger cannot mint levels:
--
--   cap    = floor(1.3 × elapsed_since_watermark × max_hit(dmg_level) × 1200 / 6000000)
--   credit = min(claimed_skill, cap)                             (per combat skill)
--
-- max_hit uses the SAME integer model as hr_bounty_kill_cap (kill-time.js),
-- min-tick 600 ms, best-in-slot; the XP multiplier (1200/60000) is vendored from
-- src/core/combat-xp-cap.js and BOUND by tests/combat-xp-cap-drift.mjs. dmg_level
-- is the greatest of the SERVER-owned strength/ranged/magic levels.
--
-- ── THREE DISJOINT WRITERS, NO DOUBLE-PAY (the load-bearing invariant) ──────
--   1. hr_credit_combat_xp  → combat-skill XP for the ATTENDED window
--                             [combat_xp_accrued_to, now]. Advances that watermark.
--   2. the settle/accrual    → combat XP ONLY for the window NOT covered by
--                             combat_xp_accrued_to (accrual.js clamps its XP
--                             window to max(fromMs, combat_xp_accrued_to)); plus
--                             per-kill LOOT/GOLD/drops for [accrued_to, now]
--                             (the single existing loot writer — unchanged).
--   3. hr_claim_bounty       → the bounty gold+Marks reward (unchanged).
-- These never overlap on combat XP: the credit advances combat_xp_accrued_to, and
-- the settle skips any window at/below it. A stale combat_xp_accrued_to BELOW
-- accrued_to is harmless — the settle's max(fromMs, combat_xp_accrued_to) clamp is
-- floored by fromMs (= accrued_to), so away XP is paid in full and never twice.
--
-- ── WHY THE SETTLE DOES NOT WRITE combat_xp_accrued_to ─────────────────────
-- Only THIS RPC advances it. The settle only READS it. That is why hr_apply is
-- UNCHANGED by this file: accrued_to always advances on a settle, so the settle's
-- own fromMs clamp (= accrued_to) prevents re-crediting an already-settled window
-- even while combat_xp_accrued_to trails behind. The only case combat_xp_accrued_to
-- LEADS accrued_to is attended play (a credit fired since the last settle) — which
-- is exactly the window the settle must skip.
--
-- ── FORGERY BOUND (stated for the security review) ──────────────────────────
-- A forger online T seconds can credit at most floor(1.3 × T·1000 × max_hit ×
-- 1200 / 6000000) XP PER COMBAT SKILL toward their OWN account, AND the whole
-- day's credited XP counts against the shared daily XP budget (40,000,000 —
-- hr_day_budget_check), AND every cap-throttled skill is JOURNALLED
-- kind='combat' intent='xp_credit_throttled'. It is self-only (writes only this
-- character's player_skills) and idempotent (p_idem). KNOWN LOOSENESS: max_hit
-- assumes BEST-IN-SLOT gear (item combat stats are not server-side) and the cap
-- attributes the full per-damage + kill XP to every single skill — a deliberate
-- over-estimate, the SAFE direction (never throttles honest play). The daily
-- budget is the tight backstop; the per-call cap only stops instant leaderboard
-- forgery. Tightening to per-gear needs equipment combat stats in SQL — a tracked
-- follow-up, the same one hr_bounty_kill_cap carries.
--
-- REVERSIBILITY: drop hr_credit_combat_xp/__ungated, hr_combat_xp_cap, the
-- hr_combat_xp_credit_log table; re-apply 2026-08-30's hr_rpc_gate body (drops the
-- bucket) and 2026-08-26's hr_state_of body (drops the projection); the
-- player_state.combat_xp_accrued_to column may be left (unread) or dropped.
-- Additive overall; nothing is rewritten.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')  is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_skills') is null then raise exception 'player_skills missing'; end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then raise exception 'hr_level_from_xp not found'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then raise exception 'hr_rpc_gate not found'; end if;
  if to_regprocedure('public.hr_day_budget_check(uuid,int,bigint,bigint,bigint,bigint)') is null then
    raise exception 'hr_day_budget_check(6-arg) not found — apply 2026-08-15-gem-daily-budget.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then raise exception 'hr_state_of not found'; end if;
end $$;

-- ── 1. THE SEPARATE COMBAT-XP WATERMARK ────────────────────────────────────
-- Advanced ONLY by hr_credit_combat_xp (from now()). New characters inherit the
-- default. The settle READS it (hr_state_of projects it, accrual.js clamps its XP
-- window to it) and never writes it — so hr_apply needs no change (see header).
alter table public.player_state
  add column if not exists combat_xp_accrued_to timestamptz not null default now();

-- ── 2. hr_combat_xp_cap — the PURE per-skill plausibility cap (drift-guarded) ─
-- Integer-exact, so it agrees bit-for-bit with src/core/combat-xp-cap.js in Node.
-- The max-hit coefficients (35 / 4280 / 41496 / 10000) are the SAME kill-time.js
-- model hr_bounty_kill_cap uses; the XP terms (1200 / 60000 / 130 / 100) are
-- vendored from COMBAT_XP_CAP_SQL_CONSTANTS and pinned by
-- tests/combat-xp-cap-drift.mjs. IMMUTABLE: reads no table and no clock.
create or replace function public.hr_combat_xp_cap(p_dmg_level int, p_elapsed_ms bigint)
returns bigint language sql immutable set search_path = public, pg_catalog as $$
  with d as (
    select greatest(1, coalesce(p_dmg_level, 1))::bigint as lvl,
           greatest(0, coalesce(p_elapsed_ms, 0))::bigint as el
  ),
  m as (
    -- base = floor((lvl*35 + 4280)/100); max_hit = max(1, floor(base*41496/10000))
    -- (integer division throughout — bit-identical to src/core/kill-time.js)
    select el, greatest(1::bigint, (((lvl*35 + 4280) / 100) * 41496) / 10000) as max_hit
    from d
  )
  -- xp_cap = floor(130 * el * max_hit * 1200 / (100 * 60000))
  select (130 * el * max_hit * 1200) / (100 * 60000) from m;
$$;
revoke execute on function public.hr_combat_xp_cap(int,bigint) from public, anon, authenticated, service_role;

-- ── 3. The idempotency log — once-per-idem, per character ───────────────────
-- Written ONLY by hr_credit_combat_xp. Rate-gated at 60/min. NO client write.
create table if not exists public.hr_combat_xp_credit_log (
  user_id      uuid not null references auth.users(id) on delete cascade,
  slot         int  not null,
  idem         text not null check (length(idem) between 1 and 64),
  claimed      bigint not null,
  credit       bigint not null,
  applied      bigint not null,
  throttled    boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (user_id, slot, idem)
);
alter table public.hr_combat_xp_credit_log enable row level security;
drop policy if exists hr_combat_xp_credit_log_sel on public.hr_combat_xp_credit_log;
create policy hr_combat_xp_credit_log_sel on public.hr_combat_xp_credit_log for select using (user_id = auth.uid());
revoke all on public.hr_combat_xp_credit_log from anon, authenticated, service_role;
grant select on public.hr_combat_xp_credit_log to authenticated, service_role;
create index if not exists hr_combat_xp_credit_log_prune_idx on public.hr_combat_xp_credit_log (created_at);

create or replace function public.hr_combat_xp_credit_prune(p_older interval default interval '1 day')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.hr_combat_xp_credit_log
   where created_at < now() - greatest(interval '1 hour', coalesce(p_older, interval '1 day'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_combat_xp_credit_prune(interval) from public, anon, authenticated, service_role;

-- ── 4. hr_credit_combat_xp__ungated — clamp per skill, budget, journal, advance ─
create or replace function public.hr_credit_combat_xp__ungated(
  p_slot int, p_xp jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- The ONLY skills this verb may write. A submit naming any other skill is
  -- refused whole — this is a COMBAT-XP writer, not a general XP faucet.
  c_combat_skills constant text[] :=
    array['attack','strength','defense','hitpoints','ranged','magic','prayer'];
  c_max_skill_xp  constant bigint := 2000000000;  -- a single-skill claim ceiling (sanity, pre-cap)
  v_uid        uuid := auth.uid();
  v_slot       int  := coalesce(p_slot, 0);
  v_dmg_lvl    int;
  v_elapsed    bigint;
  v_cap        bigint;
  v_prior      public.hr_combat_xp_credit_log%rowtype;
  v_wm         timestamptz;
  v_claimed_total bigint := 0;
  v_credit_total  bigint := 0;
  v_throttled  boolean := false;
  k            text;
  v_raw        bigint;
  v_claim      bigint;
  v_credit     bigint;
  v_rows       int;
  v_bud        jsonb;
  v_applied    jsonb := '{}'::jsonb;
  v_out_credit jsonb := '{}'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null or length(p_idem) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_idem');
  end if;
  if p_xp is null or jsonb_typeof(p_xp) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_xp');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- Serialize concurrent credits for this character (idem read + watermark move).
  perform pg_advisory_xact_lock(hashtextextended('hr_credit_combat_xp:' || v_uid::text, v_slot));

  -- IDEMPOTENCY: a replay of the same key returns the stored result, no re-apply.
  select * into v_prior from public.hr_combat_xp_credit_log
    where user_id = v_uid and slot = v_slot and idem = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'replay', true, 'credited', v_prior.applied,
      'credit', v_prior.credit, 'claimed', v_prior.claimed, 'throttled', v_prior.throttled, 'slot', v_slot);
  end if;

  -- SERVER CLOCK ONLY. The window is [combat_xp_accrued_to, now]; the cap is
  -- computed against it, and it is advanced to now() at the end of this call.
  select combat_xp_accrued_to into v_wm from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  v_elapsed := floor(extract(epoch from (now() - v_wm)) * 1000)::bigint;

  -- Damage LEVEL = the greatest of the SERVER-owned strength/ranged/magic levels
  -- (the most generous, safe direction — same as hr_credit_kills).
  v_dmg_lvl := greatest(1,
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='ranged'),0)),
    public.hr_level_from_xp(coalesce((select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='magic'),0)));
  v_cap := public.hr_combat_xp_cap(v_dmg_lvl, v_elapsed);   -- PER SKILL

  -- Clamp each submitted skill to the per-skill cap. Reject a non-combat skill
  -- (a general-XP forgery attempt) whole.
  for k, v_raw in select key, coalesce(nullif(value,'')::bigint, 0) from jsonb_each_text(p_xp) loop
    if not (k = any(c_combat_skills)) then
      return jsonb_build_object('ok', false, 'error', 'bad_skill', 'skill_id', k);
    end if;
    v_claim  := least(greatest(0, v_raw), c_max_skill_xp);
    if v_claim <= 0 then continue; end if;
    v_credit := least(v_claim, greatest(0, v_cap));
    if v_credit < v_claim then v_throttled := true; end if;
    v_claimed_total := v_claimed_total + v_claim;
    v_credit_total  := v_credit_total  + v_credit;
    if v_credit > 0 then
      v_out_credit := v_out_credit || jsonb_build_object(k, v_credit);
    end if;
  end loop;

  -- DAILY XP BUDGET (the tight backstop). Checked BEFORE any write, so a rejection
  -- is a clean no-op: the watermark does not move and no idem row is stored, so the
  -- client may retry later when the day rolls. Reject rather than clamp — an honest
  -- player never approaches 40M XP/day; only a forger does.
  if v_credit_total > 0 then
    v_bud := public.hr_day_budget_check(v_uid, v_slot, 0, v_credit_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);
    end if;
  end if;

  -- APPLY the clamped per-skill credit to player_skills (monotonic, self-only).
  for k, v_credit in select key, value::bigint from jsonb_each_text(v_out_credit) loop
    update public.player_skills set xp = xp + v_credit
      where user_id = v_uid and slot = v_slot and skill_id = k;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      -- A missing combat-skill row on a real character is anomalous; create it so
      -- the credit is not silently lost, then continue.
      insert into public.player_skills (user_id, slot, skill_id, xp)
        values (v_uid, v_slot, k, v_credit)
        on conflict (user_id, slot, skill_id) do update set xp = public.player_skills.xp + v_credit;
    end if;
    v_applied := v_applied || jsonb_build_object(k, v_credit);
  end loop;

  -- ADVANCE THE WATERMARK to now() — everything up to now is accounted (this call
  -- credited what the client observed; whatever the cap threw away is a forgery
  -- the settle must not then re-mint, which the settle's own fromMs clamp ensures).
  update public.player_state
     set combat_xp_accrued_to = now(), version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;

  -- IDEMPOTENCY RECORD + BUDGET LEDGER. One player_ledger row per crediting call
  -- (xp_in feeds hr_day_budget_used, so the credit shares the ONE daily budget
  -- with the settle). AGGREGATE (a handful of skills), never per-kill — fired on
  -- the ~60s client cadence, not per swing. A zero-credit call writes no ledger.
  insert into public.hr_combat_xp_credit_log (user_id, slot, idem, claimed, credit, applied, throttled)
    values (v_uid, v_slot, p_idem, v_claimed_total, v_credit_total, v_credit_total, v_throttled);

  -- One row when value moved OR the cap threw a claim away (the forgery signal is
  -- worth a row even at zero credit — an honest flush is never throttled, the cap
  -- being a deliberate over-estimate). A pure no-op (nothing claimed) writes none.
  if v_credit_total > 0 or v_throttled then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
      values (v_uid, v_slot, 'combat',
        case when v_throttled then 'xp_credit_throttled' else 'xp_credit' end,
        0, 0, v_credit_total, 0,
        jsonb_build_object('claimed', v_claimed_total, 'credit', v_credit_total,
          'cap', v_cap, 'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl,
          'skills', v_applied, 'throttled', v_throttled));
  end if;

  return jsonb_build_object('ok', true, 'credited', v_applied, 'credit', v_credit_total,
    'claimed', v_claimed_total, 'cap', v_cap, 'throttled', v_throttled,
    'elapsed_ms', v_elapsed, 'dmg_level', v_dmg_lvl, 'slot', v_slot);
end $$;

-- ── 5. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_credit_combat_xp(p_slot int, p_xp jsonb, p_idem text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_credit_combat_xp') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_credit_combat_xp__ungated($1, $2, $3);
end $w$;

revoke execute on function public.hr_credit_combat_xp__ungated(int,jsonb,text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_credit_combat_xp(int,jsonb,text)           from public, anon, authenticated, service_role;
grant execute on function public.hr_credit_combat_xp(int,jsonb,text) to authenticated;

-- ── 6. hr_rpc_gate — admit the hr_credit_combat_xp bucket (60/min), PROGRAMMATICALLY
-- The 2026-08-24-combat-style.sql idiom: pg_get_functiondef + a guarded,
-- exactly-once anchor replace, so this file never restates a body it did not
-- author and can never silently delete another file's bucket (and so it is a
-- member of NO derivation chain and takes over no last-toucher role). It appends
-- 'hr_credit_combat_xp' beside 'hr_credit_kills' in the 60-limit arm (added by
-- 2026-08-30). An UNKNOWN bucket fails CLOSED, so without this the RPC would 429
-- forever and the fix would deploy green and dead. NO-OP on re-apply.
do $$
declare v_src text; c_anchor constant text := '''hr_credit_kills''';
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_credit_combat_xp''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_credit_combat_xp — patch skipped'; return;
  end if;
  if position(c_anchor in v_src) = 0 then
    raise exception 'hr_rpc_gate does not admit hr_credit_kills — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_rpc_gate hr_credit_kills anchor did not match exactly once — refusing to patch blind';
  end if;
  execute replace(v_src, c_anchor, '''hr_credit_kills'', ''hr_credit_combat_xp''');
  raise notice 'hr_rpc_gate patched: hr_credit_combat_xp admitted at 60/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public, anon, authenticated, service_role;

-- ── 7. hr_state_of — PROJECT combat_xp_accrued_to INSIDE `state`, PROGRAMMATICALLY
-- Same idiom (2026-08-24-combat-style.sql). Anchored on the workers_accrued_to
-- line (added by 2026-08-25-workers, present in every later hr_state_of and never
-- a terminator, so no later patcher moves it). Inserts the flat
-- combat_xp_accrued_to watermark right after it — the accrual shell reads it as
-- st.combat_xp_accrued_to and clamps the settle's combat-XP window to
-- max(fromMs, combat_xp_accrued_to) so it never re-pays XP a live credit applied.
-- Its PRESENCE is the switch: st.combat_xp_accrued_to ?? 0 in index.ts/
-- set-activity.js means a database without it feeds 0 and the settle pays the
-- whole window exactly as before. Member of NO derivation chain. NO-OP on re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'workers_accrued_to', v_st.workers_accrued_to,$anc$;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if v_def is null then raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  v_def := replace(v_def, chr(13), '');   -- CR-tolerant
  if strpos(v_def, $q$'combat_xp_accrued_to', v_st.combat_xp_accrued_to$q$) > 0 then
    raise notice 'hr_state_of already projects combat_xp_accrued_to — patch skipped'; return;
  end if;
  if position(c_anchor in v_def) = 0 then
    raise exception 'hr_state_of does not project workers_accrued_to — apply 2026-08-25-workers.sql first';
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of workers_accrued_to anchor did not match exactly once — refusing to patch blind';
  end if;
  v_def := replace(v_def, c_anchor, $anc$'workers_accrued_to', v_st.workers_accrued_to,
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,$anc$);
  execute v_def;
  raise notice 'hr_state_of patched: state.combat_xp_accrued_to projected';
end $$;
-- create-or-replace preserves an ACL, but be explicit. hr_state_of takes an
-- arbitrary uuid; no client role may call it.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 8. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_credit_combat_xp' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_credit_combat_xp', 'p_slot integer, p_xp jsonb, p_idem text', 'authenticated',
     'added 2026-08-31: server credits ATTENDED combat XP per skill, clamped to the physical-max cap; watermark-split against the settle (combat)');
end $$;

-- ── 9. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c6-0000-0000-0000-0000000000c6';
  v_slot constant int  := 0;
  v_atk0 bigint; v_atk1 bigint; v_str1 bigint;
  v_wm0  timestamptz; v_wm1 timestamptz;
begin
  -- (a) wrapper authenticated-only, inner + cap revoked from clients.
  if to_regprocedure('public.hr_credit_combat_xp(int,jsonb,text)') is null then
    raise exception 'GATE(a): hr_credit_combat_xp wrapper did not install';
  end if;
  if has_function_privilege('authenticated','public.hr_credit_combat_xp__ungated(int,jsonb,text)','execute') then
    raise exception 'GATE(a): __ungated is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_combat_xp(int,jsonb,text)','execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon','public.hr_credit_combat_xp(int,jsonb,text)','execute') then
    raise exception 'GATE(a): the wrapper is anon-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_combat_xp_cap(int,bigint)','execute') then
    raise exception 'GATE(a): hr_combat_xp_cap is client-executable';
  end if;

  -- (b) NO client write surface on the log or player_skills.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_combat_xp_credit_log' and cmd <> 'SELECT') then
    raise exception 'GATE(b): hr_combat_xp_credit_log grew a non-SELECT policy';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hr_combat_xp_credit_log'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on hr_combat_xp_credit_log';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_skills'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_skills — XP is client-forgeable';
  end if;

  -- (c) THE CAP MATH matches src/core/combat-xp-cap.js (bound by
  --     tests/combat-xp-cap-drift.mjs; three anchors here).
  if public.hr_combat_xp_cap(99, 60000) <> 497640 then
    raise exception 'GATE(c): cap(99,60000)=% expected 497640', public.hr_combat_xp_cap(99,60000);
  end if;
  if public.hr_combat_xp_cap(10, 60000) <> 296400 then
    raise exception 'GATE(c): cap(10,60000)=% expected 296400', public.hr_combat_xp_cap(10,60000);
  end if;
  if public.hr_combat_xp_cap(99, 0) <> 0 then
    raise exception 'GATE(c): cap at elapsed 0 is not 0';
  end if;

  -- (d) EXECUTED behaviour, discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, combat_xp_accrued_to)
      values (v_uid, v_slot, 0, 0, 1, now() - interval '10 minutes')
      on conflict (user_id, slot) do update set gold = 0, combat_xp_accrued_to = now() - interval '10 minutes';
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 100000 from unnest(array['attack','strength','defense','hitpoints','ranged','magic','prayer']) s
      on conflict do nothing;

    select xp into v_atk0 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    select combat_xp_accrued_to into v_wm0 from public.player_state where user_id=v_uid and slot=v_slot;

    -- a modest honest submit (cap over 10 min is huge) → credited in full, watermark advances.
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 5000, 'strength', 3000), 'idem-1');
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): credit failed: %', v; end if;
    select xp into v_atk1 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack';
    select xp into v_str1 from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='strength';
    if v_atk1 <> v_atk0 + 5000 then raise exception 'GATE(d): attack xp not credited (% -> %)', v_atk0, v_atk1; end if;
    if v_str1 <> 100000 + 3000 then raise exception 'GATE(d): strength xp not credited'; end if;
    select combat_xp_accrued_to into v_wm1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_wm1 <= v_wm0 then raise exception 'GATE(d): watermark did not advance'; end if;

    -- IDEMPOTENT replay: same key applies nothing more.
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 5000), 'idem-1');
    if coalesce((v->>'replay')::boolean,false) is not true then raise exception 'GATE(d): replay not flagged: %', v; end if;
    if (select xp from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='attack') <> v_atk1 then
      raise exception 'GATE(d): replay re-credited xp';
    end if;

    -- (e) A NON-COMBAT skill is refused whole (no partial write).
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('woodcutting', 100), 'idem-badskill');
    if v->>'error' <> 'bad_skill' then raise exception 'GATE(e): a non-combat skill was not refused: %', v; end if;

    -- (e2) THE PROGRAMMATIC PATCHES TOOK: hr_state_of projects the watermark and
    --      hr_rpc_gate admits the bucket (both patched via pg_get_functiondef).
    if strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure),
              'combat_xp_accrued_to') = 0 then
      raise exception 'GATE(e2): hr_state_of does not project combat_xp_accrued_to — the patch did not take';
    end if;
    if strpos(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure),
              '''hr_credit_combat_xp''') = 0 then
      raise exception 'GATE(e2): hr_rpc_gate does not admit hr_credit_combat_xp — the bucket patch did not take';
    end if;
    if not public.hr_rpc_gate('hr_credit_combat_xp') then
      raise exception 'GATE(e2): hr_rpc_gate fails closed on hr_credit_combat_xp — the wrapper would 429 forever';
    end if;

    -- (f) THE CAP THROTTLES + JOURNALS. Reset the watermark to ~now so elapsed
    --     is tiny, then submit a huge claim → clamped to the small cap, journalled.
    update public.player_state set combat_xp_accrued_to = now() where user_id=v_uid and slot=v_slot;
    v := public.hr_credit_combat_xp__ungated(v_slot, jsonb_build_object('attack', 999999999), 'idem-throttle');
    if coalesce((v->>'throttled')::boolean,false) is not true then
      raise exception 'GATE(f): a huge claim at ~0 elapsed was not throttled: %', v;
    end if;
    if (v->>'credit')::bigint >= 999999999 then raise exception 'GATE(f): the cap did not clamp the claim'; end if;
    if (select count(*) from public.player_ledger
         where user_id=v_uid and intent = 'xp_credit_throttled') < 1 then
      raise exception 'GATE(f): a throttled claim was not journalled';
    end if;

    raise exception using errcode = 'HR820', message = 'combat-xp-credit §9 complete — rolling back';
  exception when sqlstate 'HR820' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_ledger      where user_id = v_uid)
     or exists (select 1 from public.player_skills      where user_id = v_uid)
     or exists (select 1 from public.hr_combat_xp_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §9 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(g): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(g): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'combat-xp-credit: hr_credit_combat_xp credits attended combat XP (clamped per skill, '
               'idempotent, journalled), advances combat_xp_accrued_to, refuses non-combat skills — all green';
end $$;
