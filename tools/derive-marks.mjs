// ============================================================================
// tools/derive-marks.mjs — BUILD 2026-08-26-marks-record.sql (the Bounty-Marks
// server-of-record slice) by EXTRACTING the CURRENT live hr_state_of / hr_rpc_gate
// bodies and patching them at named anchors. Nothing is retyped.
//
//   node tools/derive-marks.mjs          # print the derived bodies
//   node tools/derive-marks.mjs --write  # (re)write the migration
//   node tools/derive-marks.mjs --check  # assert the migration matches
//
// WHY THIS EXISTS — read tools/derive-workers.mjs's header first. hr_state_of is a
// governed derivation chain (tests/run-sql-tests.mjs HR_STATE_OF_CHAIN): a hand
// `create or replace` on the ~15 KB body silently deletes whichever projection the
// typist did not know about. This script produces a body that passes the chain
// line-by-line plus the ONE marks addition.
//
// SOURCES — THE CURRENT LAST TOUCHERS:
//   hr_state_of  <- 2026-08-25-workers.sql
//   hr_rpc_gate  <- 2026-08-22-server-farming-complete.sql (its TRUE last toucher —
//                   it took over from workers to add farm_water; NOT chain-governed,
//                   but derived faithfully so every existing bucket carries)
//
// ── WHAT IT SHIPS ───────────────────────────────────────────────────────────
//   hr_state_of — projects `marks` (the player_state.marks bigint that the bounty
//                 turn-in already credits) as a flat scalar in `state`, beside gold
//                 and gems. INSERTION ONLY — no declared removal.
//   hr_rpc_gate — adds the `hr_bounty_spend` bucket to the 12/min arm. INSERTION.
//   hr_bounty_spend — the marks SPEND RPC (reroll cost + abandon fee), server-
//                 authoritative, clamped, journalled, idempotent. NEW function.
//
// ⚠ THIS FILE BECOMES THE LAST TOUCHER OF hr_state_of AND hr_rpc_gate.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const SRC_STATE = '2026-08-25-workers.sql';     // last toucher of hr_state_of
// ⚠ hr_rpc_gate's last toucher is NOT workers — 2026-08-22-server-farming-complete
// .sql took over from it (adding the farm_water bucket). Deriving from workers here
// would DROP farm_water. Derive from the true last toucher so every bucket carries.
const SRC_RPC_GATE = '2026-08-22-server-farming-complete.sql';  // last toucher of hr_rpc_gate
const TARGET = '2026-08-26-marks-record.sql';

async function fnText(file, open, close) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf(close, i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + close.length);
}
function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

export async function deriveStateOf() {
  let t = await fnText(SRC_STATE, 'create or replace function public.hr_state_of(', '\nend $$;');
  // Project marks as a flat scalar beside gold/gems. INSERTION ONLY.
  t = patch(t,
    `      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,`,
    `      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      'marks', v_st.marks,`,
    'marks in the state object');
  return t;
}

export async function deriveRpcGate() {
  let t = await fnText(SRC_RPC_GATE, 'create or replace function public.hr_rpc_gate(', '\nend $function$;');
  // Add the marks-spend bucket to the 12/min arm, right after the two bounty ones.
  t = patch(t,
    `         'hr_accept_bounty', 'hr_claim_bounty'\n      then v_limit := 12;`,
    `         'hr_accept_bounty', 'hr_claim_bounty',
         -- Bounty-Marks slice: the marks SPEND intent (reroll + abandon). Added
         -- HERE, the CURRENT last toucher of hr_rpc_gate, because an unknown
         -- bucket fails CLOSED — the RPC would 429 forever otherwise.
         'hr_bounty_spend'
      then v_limit := 12;`,
    'hr_bounty_spend bucket in hr_rpc_gate');
  return t;
}

function migration(stateOf, rpcGate) {
  return `-- ============================================================================
-- 2026-08-26-marks-record.sql — BOUNTY MARKS become SERVER-OF-RECORD.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Money surface (it debits the server-owned
--     Bounty-Marks currency). SECURITY REVIEW REQUIRED before apply.
--
-- ⚠ GENERATED. The restated hr_state_of / hr_rpc_gate below are produced by
--   \`node tools/derive-marks.mjs --write\` from the CURRENT last toucher
--   (2026-08-25-workers.sql) and patched at named anchors. Do NOT hand-edit;
--   \`--check\` runs in the suite and will fail.
--
-- ── WHAT THIS DOES, AND WHY ─────────────────────────────────────────────────
-- The EARNING side of Bounty Marks moved server-side in 2026-08-23-bounty.sql
-- (player_state.marks + hr_claim_bounty credits it). What stayed client-authored:
--   (a) the marks BALANCE the client reads/displays (out of the save blob, not
--       player_state.marks);
--   (b) marks SPENDING — the reroll cost + the abandon fee, done as
--       \`G.bountyHunter.marks -= cost\` in src/legacy.js.
-- This migration closes (a) by PROJECTING marks in hr_state_of (so src/net/
-- record.js can read it as a scalar record, exactly like gold), and closes the
-- reroll/abandon half of (b) with ONE server-authoritative SPEND RPC.
--
-- ── THE SPEND RPC — hr_bounty_spend ─────────────────────────────────────────
--   reason 'reroll'  — cost is DERIVED SERVER-SIDE as 5 + N*5, where N is the
--                      count of PAID rerolls today read from the append-only
--                      player_ledger (the clan_deposit per-day pattern — no
--                      second counter to reset). Free rerolls never reach the
--                      server. Refuses insufficient_marks; marks can never go
--                      negative.
--   reason 'abandon' — fee = min(10, floor(reward_marks * 0.25)) when the Bounty-
--                      Hunter level >= 10, else 0. reward_marks is taken from the
--                      SERVER's own active_bounty.marks_reward when a row exists
--                      (cull bounties); for the non-cull types that have no server
--                      row the caller's value is used, CLAMPED. The fee is further
--                      clamped to the marks on hand.
--
-- ── SELF-ONLY RESIDUALS, STATED PLAINLY (bounded, journalled, documented) ────
-- Bounty Marks are NOT tradeable to another player — they buy self-only utility
-- unlocks (auto-eat, etc.). So the mandate property ("a forged client value cannot
-- cross into ANOTHER player's economy or ranking") holds regardless of these:
--   · the Bounty-Hunter LEVEL and the free-reroll allowance are still client
--     counters (BH xp is not yet server-owned); forging them affects only a
--     self-cost of <= 10 marks / a self-board refresh.
--   · the abandon reward_marks fallback for non-cull bounties is a clamped client
--     value. All three are bounded self-only, journalled, and tracked as arm
--     follow-ups (server-own BH level; move shop/upgrade marks spends).
--
-- ── IDEMPOTENCY + CONCURRENCY ───────────────────────────────────────────────
-- p_idem (uuid) is stored as a player_intents row; a replay returns the prior
-- result with replayed:true and re-debits nothing. The whole body runs under the
-- SAME per-character advisory lock hr_apply takes, so a spend cannot race an
-- accrual settle on one character (no read-modify-write across a network hop).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. Reverting means re-applying 2026-08-25-workers.sql (restores
-- hr_state_of + hr_rpc_gate) and dropping hr_bounty_spend / __ungated. The marks
-- column and every credited value are untouched.
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_state_of AND hr_rpc_gate.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────────
do $$
declare v_state text; v_gate text;
begin
  if to_regclass('public.player_state')  is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_intents')is null then raise exception 'player_intents missing'; end if;
  if to_regclass('public.active_bounty') is null then
    raise exception 'active_bounty missing — apply 2026-08-23-bounty.sql first'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key missing — apply 2026-08-08-clan-seat.sql first'; end if;
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='marks') <> 1 then
    raise exception 'player_state.marks missing — apply 2026-08-23-bounty.sql first'; end if;

  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  select prosrc into v_gate  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_rpc_gate';
  if v_state is null then raise exception 'hr_state_of missing'; end if;
  if v_gate  is null then raise exception 'hr_rpc_gate missing'; end if;
  -- The body we are about to REPLACE must be the workers body (its last toucher).
  if position('public.player_workers pw' in v_state) = 0 then
    raise exception 'LIVE hr_state_of is not the workers body — apply 2026-08-25-workers.sql first'; end if;
  if position('''farm_water''' in v_gate) = 0 or position('''worker_hire''' in v_gate) = 0 then
    raise exception 'LIVE hr_rpc_gate is not the farming-complete body (missing farm_water/worker buckets) — apply 2026-08-22-server-farming-complete.sql first'; end if;
  if position('''marks'', v_st.marks' in v_state) > 0 then
    raise notice 'marks already projected — this apply is a no-op replace'; end if;
end $$;

-- ── 1. hr_state_of — GENERATED. Do not hand-edit; see the header. ────────────
${stateOf}
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. hr_rpc_gate — GENERATED. Do not hand-edit; see the header. ────────────
${rpcGate}
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 3. hr_bounty_spend__ungated — the marks SPEND (reroll + abandon) ─────────
create or replace function public.hr_bounty_spend__ungated(
  p_slot int, p_reason text, p_bounty_level int, p_reward_marks bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_marks  bigint;
  v_cost   bigint;
  v_n      int;
  v_day    text;
  v_reward bigint;
  v_fee    bigint;
  v_prev   jsonb;
  v_intent text := 'bounty_spend:' || coalesce(p_reason, '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_reason is null or p_reason not in ('reroll', 'abandon') then
    return jsonb_build_object('ok', false, 'error', 'bad_reason', 'reason', p_reason); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;

  -- Serialise this character — the SAME advisory key hr_apply / hr_unlock_buy take,
  -- so a spend can never race an accrual settle on one character.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY: a completed spend with this idem re-debits nothing.
  select result into v_prev from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select marks into v_marks from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;
  v_marks := coalesce(v_marks, 0);

  if p_reason = 'reroll' then
    -- COST DERIVED SERVER-SIDE from the append-only ledger: 5 + (paid rerolls
    -- today) * 5. Free rerolls never reach this RPC, so the count IS rerollsToday.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'bounty'
       and intent = 'bounty_reroll' and public.hr_utc_day_key(at) = v_day;
    v_cost := 5 + v_n::bigint * 5;
    if v_marks < v_cost then
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks', 'cost', v_cost, 'have', v_marks);
    end if;
    update public.player_state set marks = marks - v_cost, version = version + 1, updated_at = now()
      where user_id = v_uid and slot = v_slot;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'bounty_reroll', 0, 0, 0, 0, 0,
        jsonb_build_object('marks', -v_cost, 'reroll_index', v_n, 'idem', p_idem));
    v_prev := jsonb_build_object('ok', true, 'reason', 'reroll', 'cost', v_cost,
                                 'marks', v_marks - v_cost, 'slot', v_slot);
  else
    -- ABANDON FEE. Below BH level 10 there is no fee. reward_marks comes from the
    -- SERVER's own active_bounty when present (cull); else the clamped client value.
    if coalesce(p_bounty_level, 0) < 10 then
      v_fee := 0;
    else
      select marks_reward into v_reward from public.active_bounty
        where user_id = v_uid and slot = v_slot;
      v_reward := coalesce(v_reward, greatest(0, least(coalesce(p_reward_marks, 0), 100000)));
      v_fee := least(10, floor(v_reward * 0.25))::bigint;
    end if;
    v_fee := least(greatest(v_fee, 0), v_marks);   -- clamped to available; never negative
    if v_fee > 0 then
      update public.player_state set marks = marks - v_fee, version = version + 1, updated_at = now()
        where user_id = v_uid and slot = v_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
        values (v_uid, v_slot, 'bounty', 'bounty_abandon', 0, 0, 0, 0, 0,
          jsonb_build_object('marks', -v_fee, 'bounty_level', p_bounty_level, 'idem', p_idem));
    end if;
    v_prev := jsonb_build_object('ok', true, 'reason', 'abandon', 'fee', v_fee,
                                 'marks', v_marks - v_fee, 'slot', v_slot);
  end if;

  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- ── 4. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_bounty_spend(
  p_slot int, p_reason text, p_bounty_level int, p_reward_marks bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_bounty_spend') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_bounty_spend__ungated($1, $2, $3, $4, $5);
end $w$;

revoke execute on function public.hr_bounty_spend__ungated(int,text,int,bigint,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_bounty_spend(int,text,int,bigint,uuid)           from public, anon, authenticated, service_role;
grant  execute on function public.hr_bounty_spend(int,text,int,bigint,uuid)           to authenticated;

-- ── 4b. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied'; return; end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_bounty_spend' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_bounty_spend', 'p_slot integer, p_reason text, p_bounty_level integer, p_reward_marks bigint, p_idem uuid',
     'authenticated', 'added 2026-08-26: server-authoritative Bounty-Marks spend (reroll cost + abandon fee)');
end $$;

-- ── 5. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb; v_st jsonb;
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000000000c0';
  v_slot constant int  := 0;
  v_i1 uuid; v_i2 uuid; v_i3 uuid; v_i4 uuid;
  v_m  bigint; v_state text; v_gate text;
begin
  -- (a) hr_state_of PROJECTS marks; hr_rpc_gate carries every existing bucket + marks.
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  select prosrc into v_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_rpc_gate';
  if position('''marks'', v_st.marks' in v_state) = 0 then
    raise exception 'GATE(a): hr_state_of does not project marks'; end if;
  if position('public.player_workers pw' in v_state) = 0 then
    raise exception 'GATE(a): the marks restatement DROPPED the workers projection — chain broken'; end if;
  if position('''hr_bounty_spend''' in v_gate) = 0 then
    raise exception 'GATE(a): hr_rpc_gate does not admit hr_bounty_spend'; end if;
  if position('''worker_hire''' in v_gate) = 0 or position('''farm_water''' in v_gate) = 0 then
    raise exception 'GATE(a): the gate restatement DROPPED the worker/farm_water buckets — chain broken'; end if;

  -- (b) WRAPPER authenticated-only; the inner revoked from clients.
  if has_function_privilege('authenticated','public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the gate is decoration'; end if;
  if not has_function_privilege('authenticated','public.hr_bounty_spend(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the feature is dead'; end if;
  if has_function_privilege('anon','public.hr_bounty_spend(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the spend wrapper is anon-executable'; end if;

  -- (c) NO CLIENT WRITE on player_state.marks — RLS only, no non-SELECT grant.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on player_state — marks is client-forgeable'; end if;

  -- (d) EXECUTED behaviour — discarded subtxn, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 0, 0, 100, 1)
      on conflict (user_id, slot) do update set marks = 100, version = 1;

    -- state_of returns marks.
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->'state'->>'marks')::bigint <> 100 then
      raise exception 'GATE(d): hr_state_of marks = % (expected 100)', v_st->'state'->>'marks'; end if;

    -- reroll #1: cost 5 (no prior). 100 -> 95.
    v_i1 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i1);
    if coalesce(v->>'ok','')<>'true' or (v->>'cost')::bigint<>5 or (v->>'marks')::bigint<>95 then
      raise exception 'GATE(d): reroll#1 wrong: %', v; end if;
    -- replay same idem: no re-debit.
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i1);
    if coalesce((v->>'replayed')::boolean,false) is not true then
      raise exception 'GATE(d): reroll replay not idempotent: %', v; end if;
    select marks into v_m from public.player_state where user_id=v_uid and slot=v_slot;
    if v_m <> 95 then raise exception 'GATE(d): replay re-debited (marks=%)', v_m; end if;

    -- reroll #2: cost escalates to 10 (one paid reroll today). 95 -> 85.
    v_i2 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i2);
    if (v->>'cost')::bigint<>10 or (v->>'marks')::bigint<>85 then
      raise exception 'GATE(d): reroll#2 cost did not escalate: %', v; end if;

    -- OVER-SPEND refused, marks unchanged. Drop to 3; next cost is 15.
    update public.player_state set marks = 3 where user_id=v_uid and slot=v_slot;
    v_i3 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i3);
    if v->>'error' <> 'insufficient_marks' or (v->>'cost')::bigint<>15 then
      raise exception 'GATE(d): over-spend not refused: %', v; end if;
    select marks into v_m from public.player_state where user_id=v_uid and slot=v_slot;
    if v_m <> 3 then raise exception 'GATE(d): refused reroll still moved marks (marks=%)', v_m; end if;

    -- ABANDON fee. Refill to 100; BH level 10, active_bounty marks_reward 40 -> fee 10.
    update public.player_state set marks = 100 where user_id=v_uid and slot=v_slot;
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, v_slot, 'bx', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 40, 45)
      on conflict (user_id, slot) do update set marks_reward = 40;
    v_i4 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'abandon', 10, 40, v_i4);
    if coalesce(v->>'ok','')<>'true' or (v->>'fee')::bigint<>10 or (v->>'marks')::bigint<>90 then
      raise exception 'GATE(d): abandon fee wrong: %', v; end if;

    -- BELOW level 10 => no fee.
    v := public.hr_bounty_spend__ungated(v_slot, 'abandon', 9, 40, gen_random_uuid());
    if (v->>'fee')::bigint <> 0 then raise exception 'GATE(d): sub-10 level charged a fee: %', v; end if;

    raise exception using errcode = 'HR819', message = 'marks §5 complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state   where user_id=v_uid)
     or exists (select 1 from public.player_ledger where user_id=v_uid)
     or exists (select 1 from public.player_intents where user_id=v_uid)
     or exists (select 1 from public.active_bounty where user_id=v_uid)
     or exists (select 1 from auth.users where id=v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row'; end if;

  raise notice 'marks: hr_state_of projects marks (workers projection intact), hr_rpc_gate admits '
               'hr_bounty_spend (worker buckets intact), spend wrapper authenticated-only, no client '
               'write on player_state, reroll cost escalates + refuses over-spend + idempotent, '
               'abandon fee gated on level>=10 — all green';
end $$;
`;
}

const SELF = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const stateOf = await deriveStateOf();
  const rpcGate = await deriveRpcGate();
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(stateOf, rpcGate), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    if (!mig.includes(stateOf)) { console.error(`DRIFT: ${TARGET}'s hr_state_of is not what this script derives from ${SRC_STATE}.`); process.exit(1); }
    if (!mig.includes(rpcGate)) { console.error(`DRIFT: ${TARGET}'s hr_rpc_gate is not what this script derives from ${SRC_RPC_GATE}.`); process.exit(1); }
    console.log(`derive-marks: ${TARGET} matches (hr_state_of ${stateOf.length} B, hr_rpc_gate ${rpcGate.length} B)`);
  } else {
    console.log(stateOf);
    console.log('\n\n-- ===== hr_rpc_gate =====\n');
    console.log(rpcGate);
  }
}
